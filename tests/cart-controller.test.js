const mongoose = require("mongoose");
const { createCartController } = require("../controllers/cartController");

describe("cart controller boundaries", () => {
  it("adds only a canonical book id and quantity to the session cart", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: (value) => ({ lean: async () => value === id ? { _id: id, stock: 4, price: 10 } : null }) };
    const controller = createCartController({ Book });
    const req = { body: { bookId: id, quantity: "2" }, session: {} };
    const response = { status: () => response, json: (body) => body };

    const result = await controller.addItem(req, response, (error) => { throw error; });

    expect(req.session.cart).toEqual([{ bookId: id, quantity: 2 }]);
    expect(result).toEqual({ ok: true, cartCount: 2 });
  });

  it("returns the cumulative server cart count for repeated additions", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: () => ({ lean: async () => ({ _id: id, stock: 4, price: 20 }) }) };
    const controller = createCartController({ Book });
    const req = { body: { bookId: id, quantity: "1" }, session: {} };
    const response = { json: (body) => body, status: () => response };

    expect(await controller.addItem(req, response, (error) => { throw error; })).toEqual({ ok: true, cartCount: 1 });
    req.body.quantity = "2";
    expect(await controller.addItem(req, response, (error) => { throw error; })).toEqual({ ok: true, cartCount: 3 });
    expect(req.session.cart).toEqual([{ bookId: id, quantity: 3 }]);
  });

  it("redirects native HTML form submissions back to the canonical detail page", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: () => ({ lean: async () => ({ _id: id, stock: 2, price: 20 }) }) };
    const controller = createCartController({ Book });
    const req = {
      body: { bookId: id, quantity: "1" },
      headers: { accept: "text/html,application/xhtml+xml" },
      get: (name) => name.toLowerCase() === "accept" ? req.headers.accept : undefined,
      session: {},
    };
    const response = {
      redirect: (location) => ({ location }),
      json: (body) => body,
      status: () => response,
    };

    const result = await controller.addItem(req, response, (error) => { throw error; });

    expect(result.location).toBe(`/books/${id}?message=Added%20to%20your%20cart.`);
    expect(req.session.cart).toEqual([{ bookId: id, quantity: 1 }]);
  });

  it("rejects client-supplied pricing fields", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: () => ({ lean: async () => ({ _id: id, stock: 2, price: 20 }) }) };
    const controller = createCartController({ Book });
    const req = { body: { bookId: id, quantity: "1", price: "0.01", total: "0.01" }, session: {} };
    const response = { status: (code) => { response.code = code; return response; }, json: (body) => body };

    await controller.addItem(req, response, (error) => { throw error; });

    expect(req.session.cart).toEqual([{ bookId: id, quantity: 1 }]);
  });
});
