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
});
