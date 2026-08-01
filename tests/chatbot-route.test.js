const express = require("express");
const request = require("supertest");
const { createChatbotController } = require("../controllers/chatbotController");
const { createChatbotRoutes } = require("../routes/chatbotRoutes");

describe("public chatbot endpoint", () => {
  function createApp(service) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.session = {}; next(); });
    app.use(createChatbotRoutes({ controller: createChatbotController({ chatbotService: service }) }));
    return app;
  }

  it("returns a stable envelope for guests", async () => {
    const app = createApp({ chat: async ({ message }) => ({ answer: `Answer: ${message}`, intent: "policy", sources: ["shipping.md"], books: [] }) });
    const response = await request(app).post("/api/ai/chat").send({ message: "How do you ship?" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ answer: "Answer: How do you ship?", intent: "policy", sources: ["shipping.md"], books: [] });
  });

  it("rejects oversized messages before calling the service", async () => {
    let calls = 0;
    const app = createApp({ chat: async () => { calls += 1; return {}; } });
    const response = await request(app).post("/api/ai/chat").send({ message: "x".repeat(2001) });

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });
});
