const express = require("express");
const session = require("express-session");
const request = require("supertest");
const { createCsrfMiddleware } = require("../middleware/csrf");

describe("session CSRF protection", () => {
  function createApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: "test-secret", resave: false, saveUninitialized: true }));
    const csrf = createCsrfMiddleware();
    app.use(csrf.exposeToken);
    app.get("/form", (req, res) => res.json({ csrfToken: res.locals.csrfToken }));
    app.post("/mutate", csrf.requireToken, (req, res) => res.json({ ok: true }));
    return app;
  }

  it("rejects state changes without a token and accepts the session token", async () => {
    const app = createApp();
    const missing = await request(app).post("/mutate");
    const agent = request.agent(app);
    const form = await agent.get("/form");
    const accepted = await agent.post("/mutate").set("X-CSRF-Token", form.body.csrfToken);

    expect(missing.status).toBe(403);
    expect(accepted.status).toBe(200);
  });
});
