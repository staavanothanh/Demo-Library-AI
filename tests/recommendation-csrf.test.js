const express = require("express");
const session = require("express-session");
const request = require("supertest");
const { createCsrfMiddleware } = require("../middleware/csrf");
const { createRecommendationRoutes } = require("../routes/recommendationRoutes");
const { validationResult } = require("express-validator");

function createApp() {
  const app = express();
  const csrf = createCsrfMiddleware();
  let limiterCalls = 0;
  let controllerCalls = 0;
  const controller = {
    showChat: (req, res) => res.send("chat"),
    recommend: (req, res) => {
      controllerCalls += 1;
      return res.json({ ok: true, prompt: req.body.prompt });
    },
  };
  const requireAuth = (req, res, next) => {
    req.user = { id: "reader-1" };
    return next();
  };
  const limiter = (req, res, next) => {
    limiterCalls += 1;
    return next();
  };

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: "recommendation-csrf-test-secret", resave: false, saveUninitialized: true }));
  app.use(csrf.exposeToken);
  app.get("/token", (req, res) => res.json({ token: res.locals.csrfToken }));
  app.use(createRecommendationRoutes({ controller, requireAuth, validationResult, csrf: csrf.requireToken, limiter }));
  return { app, getLimiterCalls: () => limiterCalls, getControllerCalls: () => controllerCalls };
}

describe("recommendation CSRF protection", () => {
  it("rejects a missing token before rate limiting or recommendation work", async () => {
    const { app, getLimiterCalls, getControllerCalls } = createApp();
    const agent = request.agent(app);
    const response = await agent.post("/tensorflow-chat").send({ prompt: "backend books" });

    expect(response.status).toBe(403);
    expect(getLimiterCalls()).toBe(0);
    expect(getControllerCalls()).toBe(0);
  });

  it("accepts the session token from the request header", async () => {
    const { app, getLimiterCalls, getControllerCalls } = createApp();
    const agent = request.agent(app);
    const tokenResponse = await agent.get("/token");
    const response = await agent
      .post("/tensorflow-chat")
      .set("X-CSRF-Token", tokenResponse.body.token)
      .send({ prompt: "backend books" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, prompt: "backend books" });
    expect(getLimiterCalls()).toBe(1);
    expect(getControllerCalls()).toBe(1);
  });
});
