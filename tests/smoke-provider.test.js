const providerModule = require("../services/aiProviders/openCodeZenProvider");

describe("OpenCode Zen smoke probe", () => {
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
    vi.restoreAllMocks();
  });

  it("routes the chat probe through createOpenCodeZenProvider", async () => {
    process.env.OPENCODE_ZEN_API_KEY = "synthetic-smoke-token";
    process.env.OPENCODE_ZEN_MODEL = "synthetic-smoke-model";
    process.env.OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";

    let chatCalls = 0;
    vi.spyOn(providerModule, "createOpenCodeZenProvider").mockImplementation(() => ({
      chat: async (messages, options) => {
        chatCalls += 1;
        expect(messages).toEqual([{ role: "user", content: "Reply with the single word OK." }]);
        expect(options).toEqual({ maxTokens: 128 });
        return { text: "OK" };
      },
    }));
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "synthetic-smoke-model" }] }),
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { smokeTest } = require("../scripts/smokeTestOpenCodeZen");
    await smokeTest();

    expect(providerModule.createOpenCodeZenProvider).toHaveBeenCalledTimes(1);
    expect(chatCalls).toBe(1);
  });
});
