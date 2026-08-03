const { EventEmitter } = require("node:events");
const {
  MAX_MESSAGE_LENGTH,
  MAX_HISTORY_ITEMS,
  parseArgs,
  runCli,
  connectChatbotDatabase,
  READ_ONLY_CONNECTION_OPTIONS,
} = require("../scripts/chatbotCli");

function createOutput() {
  let value = "";
  return {
    write: (chunk) => { value += String(chunk); },
    get value() { return value; },
  };
}

function createReadline(answers) {
  return {
    question: vi.fn(async () => answers.shift()),
    close: vi.fn(),
  };
}

function createDependencies({ service, recommendationClient, provider = { config: { model: "test-model" } }, readline, connect, disconnect } = {}) {
  const client = recommendationClient || {
    getStatus: vi.fn(() => ({ status: "ready", catalogCount: 2 })),
    stop: vi.fn(async () => {}),
  };
  return {
    connect: connect || vi.fn(async () => {}),
    disconnect: disconnect || vi.fn(async () => {}),
    recommendationClient: client,
    createRuntime: vi.fn(() => ({ chatbotService: service, recommendationClient: client, provider })),
    createReadline: vi.fn(() => readline),
    Book: {},
    KnowledgeChunk: {},
  };
}

function successResult(answer = "ok", intent = "conversation") {
  return { answer, intent, sources: intent === "policy" ? ["shipping.md"] : [], books: [] };
}

describe("chatbot CLI contracts", () => {
  it("connects with read-only Mongoose options without mutating the shared constant", async () => {
    const mongoose = { connect: vi.fn(async () => ({ readyState: 1 })) };
    const uri = "mongodb://synthetic.invalid/Library";

    await expect(connectChatbotDatabase({ mongoose, uri })).resolves.toMatchObject({ readyState: 1 });

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connect).toHaveBeenCalledWith(uri, { autoIndex: false, autoCreate: false });
    expect(mongoose.connect.mock.calls[0][1]).not.toBe(READ_ONLY_CONNECTION_OPTIONS);
  });

  it("rejects missing database URI before connect and keeps the machine error safe", async () => {
    const mongoose = { connect: vi.fn(), disconnect: vi.fn(async () => {}) };
    await expect(connectChatbotDatabase({ mongoose, uri: undefined })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      stage: "database",
    });
    expect(mongoose.connect).not.toHaveBeenCalled();

    const output = createOutput();
    const dependencies = createDependencies({
      service: { chat: vi.fn() },
      connect: () => connectChatbotDatabase({ mongoose, uri: undefined }),
      disconnect: () => mongoose.disconnect(),
    });
    await expect(runCli({ argv: ["--once", "--prompt", "hello", "--json"], dependencies, output })).resolves.toBe(1);

    expect(output.value).toMatch(/^CHATBOT_RESULT_JSON=/m);
    expect(output.value).not.toMatch(/mongodb:\/\/synthetic\.invalid|password|stack|Authorization|Bearer/i);
    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });

  it("parses the supported flags", () => {
    expect(parseArgs(["--once", "--prompt", " hello ", "--json", "--no-history"])).toMatchObject({
      once: true,
      json: true,
      noHistory: true,
      prompt: " hello ",
    });
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--prompt", "--json"]).errors).toHaveLength(1);
  });

  it("preserves raw Unicode prompt content while trimming only the edges", async () => {
    const prompt = "  Chính sách vận chuyển của bạn là gì?  ";
    let received;
    const service = { chat: vi.fn(async (input) => { received = input; return successResult("policy answer", "policy"); }) };
    const output = createOutput();
    const dependencies = createDependencies({ service });

    await expect(runCli({ argv: ["--once", "--prompt", prompt, "--json"], dependencies, output })).resolves.toBe(0);

    expect(received.message).toBe("Chính sách vận chuyển của bạn là gì?");
    expect(received.message).not.toMatch(/^\s|\s$/);
    expect(output.value).toMatch(/^CHATBOT_RESULT_JSON=/m);
    expect(JSON.parse(output.value.trim().replace(/^CHATBOT_RESULT_JSON=/, "")).sources).toEqual(["shipping.md"]);
    expect(dependencies.createRuntime).toHaveBeenCalledWith(expect.objectContaining({
      Book: dependencies.Book,
      KnowledgeChunk: dependencies.KnowledgeChunk,
      recommendationClient: dependencies.recommendationClient,
    }));
  });

  it("emits a stable success JSON prefix and canonical book fields", async () => {
    const service = {
      chat: vi.fn(async () => ({
        answer: "book answer",
        intent: "recommendation",
        sources: [],
        books: [{ _id: "507f1f77bcf86cd799439011", title: "Book", authors: "Author", genre: "Novel", averageRating: 4, price: 12, stock: 3, coverUrl: "" }],
      })),
    };
    const output = createOutput();
    const dependencies = createDependencies({ service });

    await expect(runCli({ argv: ["--once", "--prompt", "recommend a novel", "--json"], dependencies, output })).resolves.toBe(0);

    const result = JSON.parse(output.value.trim().replace(/^CHATBOT_RESULT_JSON=/, ""));
    expect(result).toMatchObject({ ok: true, answer: "book answer", intent: "recommendation" });
    expect(result.books[0]).toEqual({
      _id: "507f1f77bcf86cd799439011",
      title: "Book",
      authors: "Author",
      genre: "Novel",
      averageRating: 4,
      price: 12,
      stock: 3,
      coverUrl: "",
    });
  });

  it.each([
    ["hello", "conversation"],
    ["what is your shipping policy?", "policy"],
    ["Chính sách vận chuyển của bạn là gì?", "policy"],
    ["recommend for me a data book", "recommendation"],
    ["Hãy gợi ý cho tôi một cuốn sách dữ liệu", "recommendation"],
  ])("passes %s unchanged to the real service contract", async (prompt, intent) => {
    let received;
    const service = {
      chat: vi.fn(async (input) => {
        received = input.message;
        return successResult(`answer for ${prompt}`, intent);
      }),
    };
    const output = createOutput();
    const dependencies = createDependencies({ service });

    await expect(runCli({ argv: ["--once", "--prompt", prompt, "--json"], dependencies, output })).resolves.toBe(0);

    expect(received).toBe(prompt);
    expect(JSON.parse(output.value.trim().replace(/^CHATBOT_RESULT_JSON=/, "")).intent).toBe(intent);
  });

  it("rejects an empty prompt before initializing runtime dependencies", async () => {
    const output = createOutput();
    const dependencies = createDependencies({ service: { chat: vi.fn() } });

    await expect(runCli({ argv: ["--once", "--prompt", "   ", "--json"], dependencies, output })).resolves.toBe(1);

    expect(dependencies.connect).not.toHaveBeenCalled();
    expect(dependencies.createRuntime).not.toHaveBeenCalled();
    expect(output.value).toContain("Usage:");
  });

  it("rejects prompts over the controller limit before runtime initialization", async () => {
    const output = createOutput();
    const dependencies = createDependencies({ service: { chat: vi.fn() } });

    await expect(runCli({ argv: ["--once", "--prompt", "x".repeat(MAX_MESSAGE_LENGTH + 1), "--json"], dependencies, output })).resolves.toBe(1);

    expect(dependencies.connect).not.toHaveBeenCalled();
    expect(output.value).toContain("1–2000");
  });

  it("emits safe machine-readable errors without raw secrets or stack traces", async () => {
    const service = {
      chat: vi.fn(async () => {
        throw Object.assign(new Error("mongodb+srv://user:password@cluster/secret"), {
          code: "RATE_LIMITED",
          stage: "provider",
          intent: "recommendation",
          candidateCount: 5,
          canonicalCount: 5,
          stack: "Authorization: Bearer secret-token",
        });
      }),
    };
    const output = createOutput();
    const dependencies = createDependencies({ service });

    await expect(runCli({ argv: ["--once", "--prompt", "recommend a book", "--json"], dependencies, output })).resolves.toBe(1);

    const text = output.value;
    expect(text).toMatch(/^CHATBOT_RESULT_JSON=/m);
    expect(text).toMatch(/"ok":false/);
    expect(text).toMatch(/"code":"RATE_LIMITED"/);
    expect(text).not.toMatch(/MONGODB_URI|OPENCODE_ZEN_API_KEY|SESSION_SECRET|ADMIN_PASSWORD|Authorization|Bearer|mongodb\+srv|cookie|session id|password|secret-token/i);
    expect(text).not.toContain("stack");
  });

  it("keeps interactive history bounded to four user/assistant items", async () => {
    const histories = [];
    const service = {
      chat: vi.fn(async (input) => {
        histories.push(input.history);
        return successResult(`answer ${histories.length}`);
      }),
    };
    const readline = createReadline(["one", "two", "three", "four", "five", "/exit"]);
    const output = createOutput();
    const dependencies = createDependencies({ service, readline });

    await expect(runCli({ argv: [], dependencies, output })).resolves.toBe(0);

    expect(histories).toHaveLength(5);
    expect(histories[0]).toEqual([]);
    expect(histories[4]).toHaveLength(MAX_HISTORY_ITEMS);
    expect(histories[4].every((item) => item.role === "user" || item.role === "assistant")).toBe(true);
    expect(dependencies.recommendationClient.stop).toHaveBeenCalledTimes(1);
    expect(dependencies.disconnect).toHaveBeenCalledTimes(1);
  });

  it("supports /clear and exposes only safe /status metadata", async () => {
    const histories = [];
    const service = {
      chat: vi.fn(async (input) => {
        histories.push(input.history);
        return successResult();
      }),
    };
    const readline = createReadline(["one", "/clear", "/status", "two", "/exit"]);
    const output = createOutput();
    const dependencies = createDependencies({ service, readline, provider: { config: { model: "test-model", apiKey: "secret" } } });

    await expect(runCli({ argv: [], dependencies, output })).resolves.toBe(0);

    expect(histories[1]).toEqual([]);
    expect(output.value).toContain("History cleared.");
    expect(output.value).toContain("test-model");
    expect(output.value).not.toMatch(/MONGODB_URI|apiKey|Authorization|Bearer|secret|mongodb\+srv|cookie|session id/i);
  });

  it("supports --no-history without retaining or sending prior turns", async () => {
    const histories = [];
    const service = {
      chat: vi.fn(async (input) => {
        histories.push(input.history);
        return successResult();
      }),
    };
    const readline = createReadline(["one", "two", "/exit"]);
    const output = createOutput();
    const dependencies = createDependencies({ service, readline });

    await expect(runCli({ argv: ["--no-history"], dependencies, output })).resolves.toBe(0);

    expect(histories).toEqual([[], []]);
  });

  it("cleans up readline, worker, and database once after exceptions and signals", async () => {
    const service = { chat: vi.fn(async () => { throw Object.assign(new Error("failure"), { code: "UPSTREAM_ERROR" }); }) };
    const readline = createReadline([]);
    const signalSource = new EventEmitter();
    const output = createOutput();
    const dependencies = createDependencies({ service, readline });

    await expect(runCli({ argv: ["--once", "--prompt", "hello", "--json"], dependencies, output, signalSource })).resolves.toBe(1);
    signalSource.emit("SIGINT");
    signalSource.emit("SIGTERM");

    expect(readline.close).not.toHaveBeenCalled();
    expect(dependencies.recommendationClient.stop).toHaveBeenCalledTimes(1);
    expect(dependencies.disconnect).toHaveBeenCalledTimes(1);
  });

  it("cleans up idempotently when an interactive session receives SIGINT", async () => {
    const readline = { question: vi.fn(() => new Promise(() => {})), close: vi.fn() };
    const signalSource = new EventEmitter();
    const output = createOutput();
    const dependencies = createDependencies({ service: { chat: vi.fn() }, readline });
    const run = runCli({ argv: [], dependencies, output, signalSource });

    await new Promise((resolve) => setImmediate(resolve));
    signalSource.emit("SIGINT");
    await expect(run).resolves.toBe(0);
    signalSource.emit("SIGTERM");

    expect(readline.close).toHaveBeenCalledTimes(1);
    expect(dependencies.recommendationClient.stop).toHaveBeenCalledTimes(1);
    expect(dependencies.disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not call process.exit", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("process.exit called"); });
    const output = createOutput();
    const dependencies = createDependencies({ service: { chat: vi.fn(async () => successResult()) } });

    try {
      await expect(runCli({ argv: ["--once", "--prompt", "hello", "--json"], dependencies, output })).resolves.toBe(0);
    } finally {
      exit.mockRestore();
    }
  });
});
