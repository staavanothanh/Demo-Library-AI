const { createOpenCodeZenProvider, getOpenCodeZenConfig } = require("../services/aiProviders/openCodeZenProvider");

const approvedBaseUrl = "https://opencode.ai/zen/v1";

describe("OpenCode Zen provider failures", () => {
  const originalFetch = global.fetch;
  const envKeys = [
    "OPENCODE_ZEN_API_KEY",
    "OPENCODE_ZEN_MODEL",
    "OPENCODE_ZEN_BASE_URL",
    "AI_REQUEST_TIMEOUT_MS",
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("uses process.env for the zero-argument factory call without exposing the key", async () => {
    process.env.OPENCODE_ZEN_API_KEY = "synthetic-test-token";
    process.env.OPENCODE_ZEN_MODEL = "synthetic-test-model";
    process.env.OPENCODE_ZEN_BASE_URL = `${approvedBaseUrl}/env-test`;
    process.env.AI_REQUEST_TIMEOUT_MS = "3210";

    let request;
    global.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "OK" } }] }) };
    };

    const provider = createOpenCodeZenProvider();
    await expect(provider.chat([{ role: "user", content: "Reply with OK." }])).resolves.toMatchObject({ text: "OK" });

    expect(request.url).toBe(`${approvedBaseUrl}/env-test/chat/completions`);
    expect(request.options.headers).toMatchObject({ Authorization: "Bearer synthetic-test-token" });
    expect(JSON.parse(request.options.body)).toMatchObject({ model: "synthetic-test-model" });
    expect(provider.config).toEqual({
      baseUrl: `${approvedBaseUrl}/env-test`,
      model: "synthetic-test-model",
      timeoutMs: 3210,
    });
    expect(provider.config).not.toHaveProperty("apiKey");
  });

  it("maps network failures to UPSTREAM_UNAVAILABLE", async () => {
    global.fetch = async () => { throw new Error("DNS failure"); };
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  it("maps malformed JSON to INVALID_RESPONSE", async () => {
    global.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } });
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects unapproved provider base URLs", () => {
    expect(() => getOpenCodeZenConfig({ baseUrl: "http://attacker.test", apiKey: "test-key" })).toThrow("approved HTTPS host");
    expect(getOpenCodeZenConfig({ baseUrl: approvedBaseUrl, apiKey: "test-key" }).baseUrl).toBe(approvedBaseUrl);
  });

  it("maps timeout aborts to TIMEOUT", async () => {
    global.fetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("maps non-success responses by status", async () => {
    global.fetch = async () => ({ ok: false, status: 429 });
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps empty provider content to INVALID_RESPONSE", async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "" } }] }) });
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("retries a transient network failure once and returns safe completion metadata", async () => {
    const calls = [];
    const sleeps = [];
    let now = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      {
        fetchFn: async () => {
          calls.push(true);
          if (calls.length === 1) throw new Error("temporary network detail");
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: "OK" }, finish_reason: "stop", reasoning_content: "do not expose" }],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, secret: "ignore" },
            }),
          };
        },
        sleepFn: async (delay) => { sleeps.push(delay); now += delay; },
        nowFn: () => now,
        setTimeoutFn: () => "timer",
        clearTimeoutFn: () => {},
      },
    );

    await expect(provider.chat([])).resolves.toEqual({
      text: "OK",
      provider: "opencode-zen",
      model: "deepseek-v4-flash-free",
      finishReason: "stop",
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    });
    expect(calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
  });

  it.each([500, 502, 503, 504])("retries HTTP %s once and classifies exhaustion safely", async (status) => {
    let calls = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      { fetchFn: async () => { calls += 1; return { ok: false, status }; }, sleepFn: async () => {}, nowFn: () => 0, setTimeoutFn: () => "timer", clearTimeoutFn: () => {} },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", attemptCount: 2, retryable: true });
    expect(calls).toBe(2);
  });

  it("honors a bounded Retry-After for a rate-limit retry", async () => {
    let calls = 0;
    const sleeps = [];
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 5000 },
      {
        fetchFn: async () => {
          calls += 1;
          return calls === 1
            ? { ok: false, status: 429, headers: { get: () => "0.2" } }
            : { ok: true, json: async () => ({ choices: [{ message: { content: "OK" } }] }) };
        },
        sleepFn: async (delay) => sleeps.push(delay),
        nowFn: () => 0,
        setTimeoutFn: () => "timer",
        clearTimeoutFn: () => {},
      },
    );

    await expect(provider.chat([])).resolves.toMatchObject({ text: "OK", finishReason: "unknown" });
    expect(calls).toBe(2);
    expect(sleeps[0]).toBe(200);
  });

  it.each([400, 401, 403, 404, 422])("does not retry non-transient HTTP %s", async (status) => {
    let calls = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      { fetchFn: async () => { calls += 1; return { ok: false, status }; }, sleepFn: async () => {}, nowFn: () => 0, setTimeoutFn: () => "timer", clearTimeoutFn: () => {} },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: status === 401 || status === 403 ? "AUTH_FAILED" : "UPSTREAM_ERROR", attemptCount: 1, retryable: false });
    expect(calls).toBe(1);
  });

  it("does not fetch when the API key is missing", async () => {
    const fetchFn = vi.fn();
    const provider = createOpenCodeZenProvider({ apiKey: "" }, { fetchFn });

    await expect(provider.chat([])).rejects.toMatchObject({ code: "NOT_CONFIGURED", attemptCount: 0, retryable: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a length-truncated response without exposing partial text", async () => {
    let calls = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      {
        fetchFn: async () => {
          calls += 1;
          return { ok: true, json: async () => ({ choices: [{ message: { content: "partial secret" }, finish_reason: "length" }] }) };
        },
        nowFn: () => 0,
        setTimeoutFn: () => "timer",
        clearTimeoutFn: () => {},
      },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: "TRUNCATED_RESPONSE", attemptCount: 1, retryable: false });
    try { await provider.chat([]); } catch (error) { expect(error.message).not.toContain("partial secret"); }
    expect(calls).toBe(2);
  });

  it("rejects malformed JSON/shape without retry", async () => {
    let calls = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      {
        fetchFn: async () => { calls += 1; return { ok: true, json: async () => ({ choices: [] }) }; },
        nowFn: () => 0,
        setTimeoutFn: () => "timer",
        clearTimeoutFn: () => {},
      },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: "INVALID_RESPONSE", attemptCount: 1, retryable: false });
    expect(calls).toBe(1);
  });

  it("bounds unknown finish reasons and omits invalid usage", async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OK" }, finish_reason: "x".repeat(1000) }],
        usage: { prompt_tokens: -1, completion_tokens: "bad", total_tokens: 2 },
      }),
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test-key", timeoutMs: 1000 });

    await expect(provider.chat([])).resolves.toEqual({
      text: "OK",
      provider: "opencode-zen",
      model: "deepseek-v4-flash-free",
      finishReason: "unknown",
    });
  });

  it("clears each per-attempt timer after a timeout", async () => {
    let cleared = 0;
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      {
        fetchFn: async () => { throw Object.assign(new Error("abort"), { name: "AbortError" }); },
        nowFn: () => 0,
        setTimeoutFn: () => "timer",
        clearTimeoutFn: () => { cleared += 1; },
        sleepFn: async () => {},
      },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: "TIMEOUT", attemptCount: 2 });
    expect(cleared).toBe(2);
  });

  it("enforces the deadline while parsing a hanging response body", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const provider = createOpenCodeZenProvider(
      { apiKey: "test-key", timeoutMs: 1000 },
      {
        fetchFn: async () => ({ ok: true, body: { cancel }, json: () => new Promise(() => {}) }),
        nowFn: () => 0,
        setTimeoutFn: (callback) => { callback(); return "timer"; },
        clearTimeoutFn: () => {},
      },
    );

    await expect(provider.chat([])).rejects.toMatchObject({ code: "TIMEOUT", attemptCount: 1 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
