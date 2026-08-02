const express = require("express");
const session = require("express-session");
const request = require("supertest");
const { createAuthRoutes } = require("../routes/authRoutes");
const { createCsrfMiddleware } = require("../middleware/csrf");
const { createRateLimiter } = require("../middleware/rateLimit");

function createLoginApp(max = 1) {
  const app = express();
  const csrf = createCsrfMiddleware();
  const controller = {
    register: (req, res) => res.status(204).end(),
    logout: (req, res) => res.status(204).end(),
    afterLogin: (req, res) => res.status(204).end(),
  };
  const passport = {
    authenticate: () => (req, res) => res.redirect("/login?message=Invalid%20username%20or%20password."),
  };

  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: "auth-rate-limit-test-secret", resave: false, saveUninitialized: true }));
  app.use(csrf.exposeToken);
  app.use(createAuthRoutes({
    controller,
    passport,
    renderForm: () => (req, res) => res.json({ csrfToken: res.locals.csrfToken }),
    showValidation: () => (req, res, next) => next(),
    csrf: csrf.requireToken,
    limiter: createRateLimiter({ windowMs: 60000, max }),
  }));
  return app;
}

describe("login rate limiting", () => {
  it("limits repeated credential failures while preserving the failure redirect", async () => {
    const agent = request.agent(createLoginApp(1));
    const form = await agent.get("/login");

    const first = await agent
      .post("/login")
      .type("form")
      .send({ username: "reader", password: "wrong-password", _csrf: form.body.csrfToken });
    const second = await agent
      .post("/login")
      .type("form")
      .send({ username: "reader", password: "wrong-password", _csrf: form.body.csrfToken });

    expect(first.status).toBe(302);
    expect(first.headers.location).toContain("/login?message=");
    expect(second.status).toBe(429);
    expect(second.body).toEqual({ error: "Too many requests. Please try again later." });
  });

  it("keeps CSRF rejection ahead of the limiter and does not throttle login pages or logout", async () => {
    const agent = request.agent(createLoginApp(1));
    const missingToken = await agent.post("/login").type("form").send({ username: "reader", password: "wrong-password" });
    const form = await agent.get("/login");
    const failedLogin = await agent
      .post("/login")
      .type("form")
      .send({ username: "reader", password: "wrong-password", _csrf: form.body.csrfToken });
    const logout = await agent.post("/logout").type("form").send({ _csrf: form.body.csrfToken });
    const loginPage = await agent.get("/login");

    expect(missingToken.status).toBe(403);
    expect(failedLogin.status).toBe(302);
    expect(logout.status).toBe(204);
    expect(loginPage.status).toBe(200);
  });
});
