const express = require("express");
const request = require("supertest");
const { createRateLimiter } = require("../middleware/rateLimit");

describe("chatbot rate limiting", () => {
  it("limits repeated requests from one IP", async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60000, max: 1 }));
    app.get("/limited", (req, res) => res.json({ ok: true }));

    const first = await request(app).get("/limited");
    const second = await request(app).get("/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
