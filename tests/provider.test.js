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
});
