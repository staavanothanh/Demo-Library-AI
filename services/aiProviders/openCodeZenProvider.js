const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
const DEFAULT_MODEL = "deepseek-v4-flash-free";
const DEFAULT_TIMEOUT_MS = 15000;

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

function createOpenCodeZenProvider(options = process.env) {
  const config = getOpenCodeZenConfig(options);
  return {
    config: { baseUrl: config.baseUrl, model: config.model, timeoutMs: config.timeoutMs },
    async chat(messages, { maxTokens = 500 } = {}) {
      if (!config.apiKey) throw Object.assign(new Error("OpenCode Zen is not configured."), { code: "NOT_CONFIGURED" });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        let response;
        try {
          response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: config.model, messages, stream: false, max_tokens: maxTokens }),
            signal: controller.signal,
          });
        } catch (error) {
          if (error.name === "AbortError") throw Object.assign(new Error("OpenCode Zen request timed out."), { code: "TIMEOUT" });
          throw Object.assign(new Error("OpenCode Zen is unavailable."), { code: "UPSTREAM_UNAVAILABLE" });
        }
        if (!response.ok) {
          const error = new Error(`OpenCode Zen request failed with status ${response.status}.`);
          error.code = response.status === 401 || response.status === 403 ? "AUTH_FAILED" : response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_ERROR";
          throw error;
        }
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw Object.assign(new Error("OpenCode Zen returned invalid JSON."), { code: "INVALID_RESPONSE" });
        }
        const text = payload?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) throw Object.assign(new Error("OpenCode Zen returned no message."), { code: "INVALID_RESPONSE" });
        return { text: text.trim(), provider: "opencode-zen", model: config.model };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = { createOpenCodeZenProvider, getOpenCodeZenConfig };
