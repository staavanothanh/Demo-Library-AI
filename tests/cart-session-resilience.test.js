const mongoose = require("mongoose");
const { createCartController } = require("../controllers/cartController");
const { createCheckoutController } = require("../controllers/checkoutController");

describe("malformed session cart resilience", () => {
  it("renders a safe empty cart and clears malformed session entries", async () => {
    const controller = createCartController({
      Book: { find: () => { throw new Error("should not query"); } },
    });
    const req = { session: { cart: { bookId: "not-an-array", quantity: 1 } } };
    const response = { render: (view, data) => ({ view, data }) };

    const result = await controller.showCart(req, response, (error) => { throw error; });

    expect(result).toEqual({ view: "cart", data: { items: [], totalCents: 0, total: 0, removedCount: 0 } });
    expect(req.session.cart).toEqual([]);
  });

  it("rejects wholly malformed checkout carts as unavailable without querying books", async () => {
    const controller = createCheckoutController({
      Book: { find: () => { throw new Error("should not query"); } },
    });
    const req = {
      get: () => "application/json",
      session: { cart: [null, { bookId: "not-an-object-id", quantity: 1 }] },
    };
    const response = { status: (code) => { response.statusCode = code; return response; }, json: (body) => body };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(response.statusCode).toBe(409);
    expect(result).toEqual({ error: "Some cart items are unavailable or exceed current stock." });
  });

  it("rejects malformed checkout carts as unavailable without querying invalid ids", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    let filter;
    const controller = createCheckoutController({
      Book: {
        find: (value) => {
          filter = value;
          return { lean: async () => [{ _id: validId, price: 10, stock: 2 }] };
        },
      },
    });
    const req = {
      get: () => "application/json",
      session: { cart: [{ bookId: validId, quantity: 1 }, null, { bookId: "not-an-object-id", quantity: 1 }] },
    };
    const response = { status: (code) => { response.statusCode = code; return response; }, json: (body) => body };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(filter).toEqual({ _id: { $in: [validId] } });
    expect(response.statusCode).toBe(409);
    expect(result).toEqual({ error: "Some cart items are unavailable or exceed current stock." });
    expect(req.session.cart).toEqual([{ bookId: validId, quantity: 1 }, null, { bookId: "not-an-object-id", quantity: 1 }]);
  });
});
