const express = require("express");
const request = require("supertest");
const { createCartRoutes } = require("../routes/cartRoutes");

describe("cart route surface", () => {
  it("mounts guest cart endpoints without authentication middleware", async () => {
    const app = express();
    app.use(express.json());
    const calls = [];
    const controller = {
      showCart: (req, res) => { calls.push("show"); res.status(200).json({ ok: true }); },
      addItem: (req, res) => { calls.push("add"); res.status(200).json({ ok: true }); },
      updateItem: (req, res) => { calls.push("update"); res.status(200).json({ ok: true }); },
      removeItem: (req, res) => { calls.push("remove"); res.status(200).json({ ok: true }); },
      clearCart: (req, res) => { calls.push("clear"); res.status(200).json({ ok: true }); },
    };
    app.use(createCartRoutes({ controller }));

    const responses = await Promise.all([
      request(app).get("/cart"),
      request(app).post("/cart/items").send({}),
      request(app).post("/cart/items/id/update").send({}),
      request(app).post("/cart/items/id/remove"),
      request(app).post("/cart/clear"),
    ]);

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(calls).toEqual(["show", "add", "update", "remove", "clear"]);
  });

  it("runs CSRF middleware for every cart mutation but not for the public cart page", async () => {
    const app = express();
    const calls = [];
    const csrf = (req, res, next) => {
      calls.push(req.path);
      return res.status(403).json({ error: "blocked by test CSRF middleware" });
    };
    const controller = {
      showCart: (req, res) => res.status(200).json({ ok: true }),
      addItem: (req, res) => res.status(200).json({ ok: true }),
      updateItem: (req, res) => res.status(200).json({ ok: true }),
      removeItem: (req, res) => res.status(200).json({ ok: true }),
      clearCart: (req, res) => res.status(200).json({ ok: true }),
    };
    app.use(createCartRoutes({ controller, csrf }));

    const responses = await Promise.all([
      request(app).get("/cart"),
      request(app).post("/cart/items"),
      request(app).post("/cart/items/id/update"),
      request(app).post("/cart/items/id/remove"),
      request(app).post("/cart/clear"),
    ]);

    expect(responses[0].status).toBe(200);
    expect(responses.slice(1).map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(calls).toEqual([
      "/cart/items",
      "/cart/items/id/update",
      "/cart/items/id/remove",
      "/cart/clear",
    ]);
  });
});
