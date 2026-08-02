const express = require("express");
const request = require("supertest");
const { validationResult } = require("express-validator");
const { createRateLimiter } = require("../middleware/rateLimit");
const { createRecommendationRoutes, MAX_PROMPT_LENGTH } = require("../routes/recommendationRoutes");

function createApp({ max = 1, authenticated = true } = {}) {
  const app = express();
  let calls = 0;
  let limiterCalls = 0;
  const controller = {
    showChat: (req, res) => res.status(200).send("chat"),
    recommend: (req, res) => {
      calls += 1;
      return res.json({ prompt: req.body.prompt.trim() });
    },
  };
  const requireAuth = (req, res, next) => {
    if (!authenticated) return res.redirect("/login");
    req.user = { id: "reader-1" };
    return next();
  };
  const limiter = createRateLimiter({ windowMs: 60000, max });
  const wrappedLimiter = (req, res, next) => {
    limiterCalls += 1;
    return limiter(req, res, next);
  };
  app.use(express.json());
  app.use(createRecommendationRoutes({
    controller,
    requireAuth,
    validationResult,
    limiter: wrappedLimiter,
  }));
  return { app, getCalls: () => calls, getLimiterCalls: () => limiterCalls };
}

describe("authenticated recommendation endpoint", () => {
  it("rejects oversized prompts before calling the recommendation controller", async () => {
    const { app, getCalls } = createApp({ max: 5 });
    const response = await request(app)
      .post("/tensorflow-chat")
      .send({ prompt: "x".repeat(MAX_PROMPT_LENGTH + 1) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(`${MAX_PROMPT_LENGTH}`);
    expect(getCalls()).toBe(0);
  });

  it("limits repeated requests from one client while preserving the first response", async () => {
    const { app, getCalls } = createApp({ max: 1 });
    const first = await request(app).post("/tensorflow-chat").send({ prompt: "backend books" });
    const second = await request(app).post("/tensorflow-chat").send({ prompt: "database books" });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ prompt: "backend books" });
    expect(second.status).toBe(429);
    expect(getCalls()).toBe(1);
  });

  it("authenticates before rate limiting and leaves GET pages unthrottled", async () => {
    const { app, getLimiterCalls } = createApp({ max: 1, authenticated: false });
    const unauthenticated = await request(app).post("/tensorflow-chat").send({ prompt: "backend books" });
    const page = await request(app).get("/tensorflow-chat");

    expect(unauthenticated.status).toBe(302);
    expect(page.status).toBe(302);
    expect(getLimiterCalls()).toBe(0);
  });
});
