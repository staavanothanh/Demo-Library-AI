const express = require("express");
const request = require("supertest");
const { createCommentRoutes } = require("../routes/commentRoutes");

describe("comment route authorization", () => {
  it("requires authentication for comment creation", async () => {
    const app = express();
    const controller = { create: (req, res) => res.status(201).json({ ok: true }) };
    const requireAuth = (req, res) => res.status(302).set("Location", "/login?message=Please%20sign%20in").end();
    app.use(createCommentRoutes({ controller, requireAuth }));

    const response = await request(app).post("/books/507f1f77bcf86cd799439011/comments").type("form").send({ body: "hello" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("/login");
  });
});
