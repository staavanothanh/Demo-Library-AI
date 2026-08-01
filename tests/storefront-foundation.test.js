const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const Book = require("../models/Book");
const { createAuthRoutes } = require("../routes/authRoutes");
const { getOpenCodeZenConfig } = require("../services/aiProviders/openCodeZenProvider");
const {
  addItem,
  updateItem,
  removeItem,
  getCartCount,
} = require("../services/cartService");

function createValidationApp() {
  const app = express();
  let registeredPayload;
  const controller = {
    register: (req, res) => {
      registeredPayload = req.body;
      return res.status(201).json({ ok: true });
    },
  };
  const passport = { authenticate: () => (req, res) => res.status(204).end() };
  const renderForm = () => (req, res) => res.status(200).send("register");
  const showValidation = () => {
    const { validationResult } = require("express-validator");
    return (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
      return next();
    };
  };
  app.use(express.urlencoded({ extended: false }));
  app.use(createAuthRoutes({ controller, passport, renderForm, showValidation }));
  return { app, getRegisteredPayload: () => registeredPayload };
}

describe("bookstore foundation", () => {
  it("defines safe commerce defaults for legacy book documents", () => {
    expect(Book.schema.path("price").options).toMatchObject({ required: true, default: 0, min: 0 });
    expect(Book.schema.path("stock").options).toMatchObject({ required: true, default: 0, min: 0, validate: expect.anything() });
    expect(Book.schema.path("coverUrl").options).toMatchObject({ default: "", trim: true });
  });

  it("keeps cart helpers immutable and merges quantities without exceeding stock", () => {
    const bookId = new mongoose.Types.ObjectId().toString();
    const initial = [];
    const withItem = addItem(initial, bookId, 2, 3);
    const merged = addItem(withItem, bookId, 2, 3);

    expect(initial).toEqual([]);
    expect(withItem).toEqual([{ bookId, quantity: 2 }]);
    expect(merged).toEqual([{ bookId, quantity: 3 }]);
    expect(getCartCount(merged)).toBe(3);
  });

  it("rejects invalid cart identifiers and quantities", () => {
    expect(() => addItem([], "not-an-object-id", 1, 2)).toThrow("Invalid book id");
    expect(() => addItem([], new mongoose.Types.ObjectId().toString(), 0, 2)).toThrow("Quantity must be a positive integer");
    expect(() => addItem([], new mongoose.Types.ObjectId().toString(), 3, 2)).toThrow("Quantity exceeds available stock");
  });

  it("updates and removes cart entries without mutating the source", () => {
    const bookId = new mongoose.Types.ObjectId().toString();
    const original = [{ bookId, quantity: 1 }];
    const updated = updateItem(original, bookId, 2, 4);
    const removed = removeItem(updated, bookId);

    expect(original).toEqual([{ bookId, quantity: 1 }]);
    expect(updated).toEqual([{ bookId, quantity: 2 }]);
    expect(removed).toEqual([]);
  });

  it("requires a matching confirmPassword before registration reaches the controller", async () => {
    const { app, getRegisteredPayload } = createValidationApp();
    const response = await request(app)
      .post("/register")
      .type("form")
      .send({ username: "reader", password: "correct-horse", confirmPassword: "different-horse" });

    expect(response.status).toBe(422);
    expect(response.body.errors[0].msg).toBe("Passwords do not match.");
    expect(getRegisteredPayload()).toBeUndefined();
  });

  it("does not expose passwords through validation values", async () => {
    const { app } = createValidationApp();
    const response = await request(app)
      .post("/register")
      .type("form")
      .send({ username: "r", password: "short", confirmPassword: "short" });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).not.toContain("short");
  });

  it("normalizes OpenCode Zen configuration without accepting a secret in output", () => {
    const config = getOpenCodeZenConfig({
      baseUrl: "https://opencode.ai/zen/v1/",
      model: "deepseek-v4-flash-free",
      apiKey: "test-secret",
      timeoutMs: "5000",
    });

    expect(config).toEqual({
      baseUrl: "https://opencode.ai/zen/v1",
      model: "deepseek-v4-flash-free",
      apiKey: "test-secret",
      timeoutMs: 5000,
    });
    expect(JSON.stringify({ baseUrl: config.baseUrl, model: config.model })).not.toContain("test-secret");
  });
});
