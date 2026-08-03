const { createChatbotRuntime } = require("../services/chatbotRuntime");
const { createApp } = require("../app");

describe("shared chatbot runtime composition", () => {
  function createDependencies() {
    const recommendationClient = {
      embed: vi.fn(async () => Array(512).fill(0)),
      getStatus: vi.fn(() => ({ status: "ready", catalogCount: 2 })),
      stop: vi.fn(async () => {}),
    };
    const provider = {
      config: { model: "test-model" },
      chat: vi.fn(async () => ({ text: "test answer" })),
    };
    const Book = {};
    const KnowledgeChunk = {};
    return { Book, KnowledgeChunk, recommendationClient, provider };
  }

  it("builds policy/vector/chatbot services around the provided recommendation client", async () => {
    const dependencies = createDependencies();
    const runtime = createChatbotRuntime(dependencies);

    expect(runtime).toMatchObject({
      chatbotService: expect.any(Object),
      policyService: expect.any(Object),
      recommendationClient: dependencies.recommendationClient,
      provider: dependencies.provider,
    });
    await expect(runtime.chatbotService.chat({ message: "hello" })).resolves.toMatchObject({
      intent: "conversation",
      answer: "test answer",
    });
    expect(dependencies.provider.chat).toHaveBeenCalledTimes(1);
  });

  it("does not create or replace a caller-owned recommendation client", () => {
    const dependencies = createDependencies();
    const runtime = createChatbotRuntime(dependencies);

    expect(runtime.recommendationClient).toBe(dependencies.recommendationClient);
    expect(dependencies.recommendationClient.stop).not.toHaveBeenCalled();
  });

  it("lets app composition delegate chatbot wiring to the same runtime factory", () => {
    const dependencies = createDependencies();
    const runtimeFactory = vi.fn(() => ({
      chatbotService: { chat: vi.fn(async () => ({ answer: "ok", intent: "conversation", sources: [], books: [] })) },
      policyService: {},
      recommendationClient: dependencies.recommendationClient,
      provider: dependencies.provider,
    }));

    createApp({ recommendationClient: dependencies.recommendationClient, runtimeFactory });

    expect(runtimeFactory).toHaveBeenCalledWith(expect.objectContaining({
      Book: expect.anything(),
      KnowledgeChunk: expect.anything(),
      recommendationClient: dependencies.recommendationClient,
    }));
  });
});
