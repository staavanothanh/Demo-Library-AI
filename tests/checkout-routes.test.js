const express = require("express");
const request = require("supertest");
const { createCheckoutRoutes } = require("../routes/checkoutRoutes");

describe("checkout route surface", () => {
  it("mounts guest checkout as POST /checkout", async () => {
    const app = express();
    const controller = { checkout: (req, res) => res.json({ ok: true }) };
    app.use(createCheckoutRoutes({ controller }));

    const response = await request(app).post("/checkout");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
