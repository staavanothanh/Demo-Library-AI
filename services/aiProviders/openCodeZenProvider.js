const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
const DEFAULT_MODEL = "deepseek-v4-flash-free";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BASE_MS = 100;
const MAX_RETRY_DELAY_MS = 5000;

function getOpenCodeZenConfig(input = process.env) {
  const baseUrl = String(input.OPENCODE_ZEN_BASE_URL || input.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:" || parsedBaseUrl.hostname !== "opencode.ai") throw new Error("OpenCode Zen base URL must use the approved HTTPS host.");
  const model = String(input.OPENCODE_ZEN_MODEL || input.model || DEFAULT_MODEL).trim();
  const apiKey = String(input.OPENCODE_ZEN_API_KEY || input.apiKey || "").trim();
  const timeoutMs = Number(input.AI_REQUEST_TIMEOUT_MS || input.timeoutMs || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("AI timeout must be a positive integer.");
  return { baseUrl, model, apiKey, timeoutMs };
}

function safeAttemptCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function providerError(code, message, { attemptCount = 0, retryable = false } = {}) {
  const error = new Error(message);
  error.code = code;
  error.attemptCount = safeAttemptCount(attemptCount);
  error.retryable = Boolean(retryable);
  return error;
}

function classifyStatus(status) {
  if (status === 401 || status === 403) return { code: "AUTH_FAILED", retryable: false };
  if (status === 429) return { code: "RATE_LIMITED", retryable: true };
  if (status >= 500 && status <= 599) return { code: "UPSTREAM_UNAVAILABLE", retryable: true };
  return { code: "UPSTREAM_ERROR", retryable: false };
}

function parseRetryAfter(response, now) {
  let raw;
  try { raw = response?.headers?.get?.("retry-after"); } catch { raw = undefined; }
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return undefined;
  const delay = timestamp - now;
  return delay >= 0 ? delay : 0;
}

function normalizeFinishReason(value) {
  if (typeof value !== "string") return "unknown";
  return new Set(["stop", "length", "content_filter", "tool_calls"]).has(value) ? value : "unknown";
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return undefined;
  const normalized = {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
  if (!Object.values(normalized).every((value) => Number.isSafeInteger(value) && value >= 0)) return undefined;
  return normalized;
}

function createOpenCodeZenProvider(options = process.env, dependencies = {}) {
  const config = getOpenCodeZenConfig(options);
  const fetchFn = dependencies.fetchFn || global.fetch;
  const setTimeoutFn = dependencies.setTimeoutFn || setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn || clearTimeout;
  const nowFn = dependencies.nowFn || Date.now;
  const sleepFn = dependencies.sleepFn || ((delay) => new Promise((resolve) => setTimeoutFn(resolve, delay)));
  const configuredAttempts = Number(dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const maxAttempts = Number.isInteger(configuredAttempts) && configuredAttempts > 0 ? Math.min(2, configuredAttempts) : DEFAULT_MAX_ATTEMPTS;
  const configuredBackoff = Number(dependencies.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
  const retryBaseMs = Number.isFinite(configuredBackoff) && configuredBackoff >= 0 ? Math.min(MAX_RETRY_DELAY_MS, configuredBackoff) : DEFAULT_RETRY_BASE_MS;

  const retryDelay = (response, attempt, remaining, now) => {
    const retryAfter = parseRetryAfter(response, now);
    const backoff = Math.min(MAX_RETRY_DELAY_MS, retryBaseMs * (2 ** Math.max(0, attempt - 1)));
    const delay = Math.min(MAX_RETRY_DELAY_MS, retryAfter ?? backoff);
    return Math.max(0, Math.min(delay, Math.max(0, remaining - 1)));
  };

  const requestOnce = async (messages, maxTokens, remaining, attempt) => {
    if (typeof fetchFn !== "function") throw providerError("UPSTREAM_UNAVAILABLE", "OpenCode Zen is unavailable.", { attemptCount: attempt, retryable: true });
    const controller = new AbortController();
    const timeout = setTimeoutFn(() => controller.abort(), Math.max(1, remaining));
    try {
      const response = await fetchFn(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, messages, stream: false, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      return { response, controller, timeout };
    } catch (error) {
      if (timeout !== undefined) clearTimeoutFn(timeout);
      if (error?.name === "AbortError") throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
      throw providerError("UPSTREAM_UNAVAILABLE", "OpenCode Zen is unavailable.", { attemptCount: attempt, retryable: true });
    }
  };

  const releaseRequest = (request) => {
    if (!request || request.released) return;
    request.released = true;
    if (request.timeout !== undefined) clearTimeoutFn(request.timeout);
  };

  const readJsonWithinDeadline = async (response, remaining, controller) => {
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeoutFn(() => {
        try { controller?.abort(); } catch { /* best effort */ }
        try {
          const cancellation = response?.body?.cancel?.();
          if (cancellation && typeof cancellation.catch === "function") cancellation.catch(() => {});
        } catch { /* best effort */ }
        reject(providerError("TIMEOUT", "OpenCode Zen request timed out.", { retryable: false }));
      }, Math.max(1, remaining));
    });
    try {
      return await Promise.race([Promise.resolve().then(() => response.json()), timeoutPromise]);
    } finally {
      if (timeout !== undefined) clearTimeoutFn(timeout);
    }
  };

  return {
    config: { baseUrl: config.baseUrl, model: config.model, timeoutMs: config.timeoutMs },
    async chat(messages, { maxTokens = 500 } = {}) {
      if (!config.apiKey) throw providerError("NOT_CONFIGURED", "OpenCode Zen is not configured.", { attemptCount: 0, retryable: false });
      const deadline = nowFn() + config.timeoutMs;
      let lastError;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const remaining = deadline - nowFn();
        if (remaining <= 0) throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt - 1, retryable: false });

        let request;
        try {
          request = await requestOnce(messages, maxTokens, remaining, attempt);
        } catch (error) {
          lastError = error;
          if (error.code === "TIMEOUT") {
            if (attempt < maxAttempts && deadline - nowFn() > 1) continue;
            throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
          }
          if (attempt < maxAttempts && deadline - nowFn() > 1) {
            const delay = Math.min(MAX_RETRY_DELAY_MS, Math.min(retryBaseMs * (2 ** Math.max(0, attempt - 1)), Math.max(0, deadline - nowFn() - 1)));
            await sleepFn(delay);
            continue;
          }
          throw providerError(error.code || "UPSTREAM_UNAVAILABLE", error.code === "UPSTREAM_UNAVAILABLE" ? "OpenCode Zen is unavailable." : "OpenCode Zen request failed.", { attemptCount: attempt, retryable: true });
        }

        const response = request.response;
        if (!response?.ok) {
          releaseRequest(request);
          const status = Number(response?.status);
          const classified = classifyStatus(status);
          lastError = providerError(classified.code, classified.code === "RATE_LIMITED" ? "OpenCode Zen is rate limited." : classified.code === "AUTH_FAILED" ? "OpenCode Zen authentication failed." : classified.code === "UPSTREAM_ERROR" ? "OpenCode Zen returned an upstream error." : "OpenCode Zen is unavailable.", { attemptCount: attempt, retryable: classified.retryable });
          if (!classified.retryable || attempt >= maxAttempts) throw lastError;
          const remainingAfter = deadline - nowFn();
          if (remainingAfter <= 1) throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
          const delay = retryDelay(response, attempt, remainingAfter, nowFn());
          if (delay >= remainingAfter) throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
          await sleepFn(delay);
          continue;
        }

        let payload;
        try {
          payload = await readJsonWithinDeadline(response, deadline - nowFn(), request.controller);
        } catch (error) {
          if (error?.code === "TIMEOUT") throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
          throw providerError("INVALID_RESPONSE", "OpenCode Zen returned invalid JSON.", { attemptCount: attempt, retryable: false });
        } finally {
          releaseRequest(request);
        }
        if (deadline - nowFn() <= 0) throw providerError("TIMEOUT", "OpenCode Zen request timed out.", { attemptCount: attempt, retryable: false });
        const choice = payload?.choices?.[0];
        const text = choice?.message?.content;
        const finishReason = normalizeFinishReason(choice?.finish_reason);
        if (finishReason === "length") throw providerError("TRUNCATED_RESPONSE", "OpenCode Zen returned a truncated response.", { attemptCount: attempt, retryable: false });
        if (typeof text !== "string" || !text.trim()) throw providerError("INVALID_RESPONSE", "OpenCode Zen returned no message.", { attemptCount: attempt, retryable: false });
        const usage = normalizeUsage(payload?.usage);
        return {
          text: text.trim(),
          provider: "opencode-zen",
          model: config.model,
          finishReason,
          ...(usage ? { usage } : {}),
        };
      }

      throw lastError || providerError("UPSTREAM_UNAVAILABLE", "OpenCode Zen is unavailable.", { attemptCount: maxAttempts, retryable: true });
    },
  };
}

module.exports = { createOpenCodeZenProvider, getOpenCodeZenConfig, normalizeFinishReason, normalizeUsage };
