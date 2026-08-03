const express = require("express");
const request = require("supertest");
const { createChatbotController } = require("../controllers/chatbotController");
const { createChatbotRoutes } = require("../routes/chatbotRoutes");

describe("public chatbot endpoint", () => {
  function createApp(service, csrf = (req, res, next) => next()) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.session = {}; next(); });
    app.use(createChatbotRoutes({ controller: createChatbotController({ chatbotService: service }), csrf }));
    return app;
  }

  it("returns a stable envelope for guests", async () => {
    const app = createApp({ chat: async ({ message }) => ({ answer: `Answer: ${message}`, intent: "policy", sources: ["shipping.md"], books: [] }) });
    const response = await request(app).post("/api/ai/chat").send({ message: "How do you ship?" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ answer: "Answer: How do you ship?", intent: "policy", sources: ["shipping.md"], books: [] });
  });

  it("runs CSRF protection before the chatbot controller", async () => {
    let csrfCalls = 0;
    let serviceCalls = 0;
    const app = createApp({ chat: async () => { serviceCalls += 1; return {}; } }, (req, res, next) => {
      csrfCalls += 1;
      return res.status(403).json({ error: "Invalid CSRF token." });
    });
    const response = await request(app).post("/api/ai/chat").send({ message: "How do you ship?" });

    expect(response.status).toBe(403);
    expect(csrfCalls).toBe(1);
    expect(serviceCalls).toBe(0);
  });

  it("does not reveal provider details in error responses", async () => {
    const app = createApp({ chat: async () => { throw Object.assign(new Error("secret provider response"), { code: "UPSTREAM_ERROR" }); } });
    const response = await request(app).post("/api/ai/chat").send({ message: "How do you ship?" });

    expect(response.text).not.toContain("secret provider response");
  });

  it("logs only sanitized stage diagnostics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({
      chat: async () => {
        throw Object.assign(new Error("secret provider response"), {
          code: "NOT_CONFIGURED",
          stage: "provider",
          intent: "policy",
          candidateCount: 1,
          canonicalCount: 0,
        });
      },
    });

    try {
      await request(app).post("/api/ai/chat").send({ message: "How do you ship?" });
      expect(log).toHaveBeenCalledWith(JSON.stringify({
        event: "chatbot_request_failed",
        intent: "policy",
        stage: "provider",
        code: "NOT_CONFIGURED",
        candidateCount: 1,
        canonicalCount: 0,
      }));
      expect(log.mock.calls.flat().join(" ")).not.toContain("secret provider response");
    } finally {
      log.mockRestore();
    }
  });

  it("rejects oversized messages before calling the service", async () => {
    let calls = 0;
    const app = createApp({ chat: async () => { calls += 1; return {}; } });
    const response = await request(app).post("/api/ai/chat").send({ message: "x".repeat(2001) });

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it.each([
    ["NOT_CONFIGURED", 503],
    ["UPSTREAM_UNAVAILABLE", 503],
    ["TIMEOUT", 504],
    ["RATE_LIMITED", 429],
    ["AUTH_FAILED", 502],
    ["INVALID_RESPONSE", 502],
    ["UPSTREAM_ERROR", 502],
    ["CATALOG_EMPTY", 503],
    ["MODEL_LOAD_FAILED", 503],
    ["EMBEDDING_FAILED", 503],
    ["EMBEDDING_INVALID", 503],
    ["RECOMMENDATION_FAILED", 503],
    ["INTERNAL", 500],
  ])("maps provider error %s to HTTP %s", async (code, expectedStatus) => {
    const app = createApp({ chat: async () => { throw Object.assign(new Error("provider detail"), { code }); } });
    const response = await request(app).post("/api/ai/chat").send({ message: "Tell me about shipping." });

    expect(response.status).toBe(expectedStatus);
    const expectedMessages = {
      CATALOG_EMPTY: "Book recommendations are unavailable because the catalog is empty.",
      MODEL_LOAD_FAILED: "Book recommendations are temporarily unavailable while the AI model loads.",
      EMBEDDING_FAILED: "The bookstore assistant could not process that request right now.",
      EMBEDDING_INVALID: "The bookstore assistant could not process that request right now.",
      RECOMMENDATION_FAILED: "Book recommendations are temporarily unavailable.",
    };
    expect(response.body).toEqual({
      error: expectedMessages[code] || "The bookstore assistant is temporarily unavailable.",
    });
  });
});
