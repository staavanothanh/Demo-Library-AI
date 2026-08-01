const { createOpenCodeZenProvider, getOpenCodeZenConfig } = require("../services/aiProviders/openCodeZenProvider");

const approvedBaseUrl = "https://opencode.ai/zen/v1";

describe("OpenCode Zen provider failures", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
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
