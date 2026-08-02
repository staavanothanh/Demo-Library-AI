const express = require("express");
const request = require("supertest");
const { body } = require("express-validator");
const { showValidation } = require("../middleware/validation");

function createValidationApp(view, validators) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    res.render = (renderedView, data) => res.json({ view: renderedView, ...data });
    next();
  });
  app.post("/", validators, showValidation(view), (req, res) => res.status(204).end());
  return app;
}

describe("validation form values", () => {
  it("preserves only a registration username and never password fields", async () => {
    const app = createValidationApp("register", [
      body("username").isLength({ min: 3 }),
      body("password").isLength({ min: 8 }),
    ]);

    const response = await request(app)
      .post("/")
      .type("form")
      .send({
        username: "reader",
        password: "short",
        confirmPassword: "short",
        role: "admin",
      });

    expect(response.status).toBe(422);
    expect(response.body.values).toEqual({ username: "reader" });
    expect(JSON.stringify(response.body)).not.toContain("short");
    expect(response.body.values).not.toHaveProperty("confirmPassword");
  });

  it("preserves only the safe admin book fields", async () => {
    const app = createValidationApp("admin-dashboard", [body("price").isFloat({ min: 0 })]);
    const fields = {
      title: "Node Patterns",
      authors: "Ada Lovelace",
      description: "A complete guide to reliable Node.js application design.",
      genre: "Programming",
      publisher: "Example Press",
      publicationDate: "2026",
      averageRating: "4.5",
      price: "not-a-price",
      stock: "3",
      coverUrl: "https://example.com/node-patterns.jpg",
    };

    const response = await request(app)
      .post("/")
      .type("form")
      .send({ ...fields, password: "top-secret-password", confirmPassword: "top-secret-password", role: "admin" });

    expect(response.status).toBe(422);
    expect(response.body.values).toEqual(fields);
    expect(JSON.stringify(response.body)).not.toContain("top-secret-password");
    expect(response.body.values).not.toHaveProperty("role");
  });
});
