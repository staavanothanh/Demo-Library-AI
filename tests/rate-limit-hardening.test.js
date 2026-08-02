const express = require("express");
const request = require("supertest");
const { createRateLimiter } = require("../middleware/rateLimit");

describe("rate limiter hardening", () => {
  it("returns standard limit metadata and retry timing", async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60000, max: 1 }));
    app.get("/limited", (req, res) => res.json({ ok: true }));

    const first = await request(app).get("/limited");
    const second = await request(app).get("/limited");

    expect(first.headers["ratelimit-limit"]).toBe("1");
    expect(first.headers["ratelimit-remaining"]).toBe("0");
    expect(second.status).toBe(429);
    expect(second.headers["retry-after"]).toMatch(/^\d+$/);
    expect(second.headers["ratelimit-reset"]).toMatch(/^\d+$/);
  });

  it("does not evict active clients when the entry cap is reached", async () => {
    const app = express();
    app.use(createRateLimiter({
      windowMs: 60000,
      max: 1,
      maxEntries: 1,
      key: (req) => req.get("X-Test-IP"),
    }));
    app.get("/limited", (req, res) => res.json({ ok: true }));

    const firstClient = await request(app).get("/limited").set("X-Test-IP", "client-a");
    const secondClient = await request(app).get("/limited").set("X-Test-IP", "client-b");
    const firstClientAgain = await request(app).get("/limited").set("X-Test-IP", "client-a");

    expect(firstClient.status).toBe(200);
    expect(secondClient.status).toBe(503);
    expect(firstClientAgain.status).toBe(429);
  });
});
