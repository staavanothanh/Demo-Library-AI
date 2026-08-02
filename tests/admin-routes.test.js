const express = require("express");
const request = require("supertest");
const { createAdminController } = require("../controllers/adminController");
const { createAdminRoutes } = require("../routes/adminRoutes");
const { showValidation } = require("../middleware/validation");

function createAdminApp() {
  const created = [];
  const controller = createAdminController({
    Book: { create: async (book) => { created.push(book); return book; } },
    recommendationClient: { refreshBooks: async () => undefined },
  });
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    res.render = (view, data) => res.json({ view, ...data });
    next();
  });
  app.use(createAdminRoutes({
    controller,
    requireAuth: (req, res, next) => next(),
    requireAdmin: (req, res, next) => next(),
    showValidation,
  }));
  return { app, created };
}

function validBookFields(averageRating) {
  return {
    title: "Node Patterns",
    authors: "Ada Lovelace",
    description: "A complete guide to reliable Node.js application design.",
    genre: "Programming",
    publisher: "Example Press",
    publicationDate: "2026",
    averageRating,
    price: "19.99",
    stock: "3",
    coverUrl: "https://example.com/node-patterns.jpg",
  };
}

describe("admin book validation", () => {
  it.each(["6", "-1", "not-a-number", "Infinity", "-Infinity"])("rejects invalid average rating %s", async (averageRating) => {
    const { app, created } = createAdminApp();

    const response = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(validBookFields(averageRating));

    expect(response.status).toBe(422);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ msg: "Average rating must be between 0 and 5." }));
    expect(created).toEqual([]);
  });

  it("allows an omitted or empty optional average rating", async () => {
    const { app, created } = createAdminApp();
    const omittedFields = validBookFields();
    delete omittedFields.averageRating;

    const omitted = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(omittedFields);
    const empty = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(validBookFields(""));

    expect(omitted.status).toBe(302);
    expect(empty.status).toBe(302);
    expect(created.map((book) => book.averageRating)).toEqual([0, 0]);
  });

  it("persists valid inclusive-boundary and decimal average ratings", async () => {
    const { app, created } = createAdminApp();

    const zero = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(validBookFields("0"));
    const maximum = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(validBookFields("5"));
    const decimal = await request(app)
      .post("/admin-dashboard/add-book")
      .type("form")
      .send(validBookFields("4.5"));

    expect(zero.status).toBe(302);
    expect(maximum.status).toBe(302);
    expect(decimal.status).toBe(302);
    expect(created.map((book) => book.averageRating)).toEqual([0, 5, 4.5]);
  });
});
