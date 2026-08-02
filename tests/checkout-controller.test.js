const mongoose = require("mongoose");
const { createCheckoutController } = require("../controllers/checkoutController");

describe("fake checkout", () => {
  it("returns a demo success, clears the session cart, and does not modify stock", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Demo", price: 10, stock: 5 };
    const Book = { find: () => ({ lean: async () => [book] }) };
    const controller = createCheckoutController({ Book });
    const req = { session: { cart: [{ bookId: id, quantity: 2 }] } };
    const response = { json: (body) => body };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(result).toEqual({ ok: true, message: "Demo payment completed. No real payment was processed.", total: 20, cartCount: 0 });
    expect(req.session.cart).toEqual([]);
    expect(book.stock).toBe(5);
  });

  it("rejects duplicate cart lines whose aggregate quantity exceeds stock", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const cart = [
      { bookId: id, quantity: 2 },
      { bookId: id, quantity: 2 },
    ];
    const Book = {
      find: () => ({
        lean: async () => [{ _id: id, title: "Demo", price: 10, stock: 3 }],
      }),
    };
    const controller = createCheckoutController({ Book });
    const req = {
      get: () => "application/json",
      session: { cart },
    };
    const response = {
      status: (code) => {
        response.statusCode = code;
        return response;
      },
      json: (body) => body,
    };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(response.statusCode).toBe(409);
    expect(result).toEqual({ error: "Some cart items are unavailable or exceed current stock." });
    expect(req.session.cart).toEqual(cart);
  });

  it("returns JSON for explicit checkout API requests", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Demo", price: 10, stock: 5 };
    const Book = { find: () => ({ lean: async () => [book] }) };
    const controller = createCheckoutController({ Book });
    const req = { get: () => "application/json", session: { cart: [{ bookId: id, quantity: 1 }] } };
    const response = { json: (body) => body, redirect: () => { throw new Error("unexpected redirect"); } };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(result).toEqual({ ok: true, message: "Demo payment completed. No real payment was processed.", total: 10, cartCount: 0 });
    expect(req.session.cart).toEqual([]);
  });

  it("redirects native checkout forms back to the cart page", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Demo", price: 10, stock: 5 };
    const Book = { find: () => ({ lean: async () => [book] }) };
    const controller = createCheckoutController({ Book });
    const req = { get: () => "text/html", session: { cart: [{ bookId: id, quantity: 1 }] } };
    const response = {
      redirect: (status, location) => ({ status, location }),
      json: (body) => body,
    };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(result).toEqual({ status: 303, location: "/cart?message=Demo%20payment%20completed.%20No%20real%20payment%20was%20processed." });
    expect(req.session.cart).toEqual([]);
  });

  it("returns a safe HTML redirect for invalid native checkout", async () => {
    const controller = createCheckoutController({ Book: { find: () => { throw new Error("should not query"); } } });
    const req = { get: () => "text/html", session: { cart: [] } };
    const response = { status: (code) => { response.code = code; return response; }, json: (body) => body, redirect: (status, location) => ({ status, location }) };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(result).toEqual({ status: 303, location: "/cart?message=Your%20cart%20is%20empty." });
  });

  it("rejects an empty cart without calling a payment provider", async () => {
    const Book = { find: () => { throw new Error("should not query"); } };
    const controller = createCheckoutController({ Book });
    const req = { session: { cart: [] } };
    const response = { status: (code) => { response.code = code; return response; }, json: (body) => body };

    const result = await controller.checkout(req, response, (error) => { throw error; });

    expect(response.code).toBe(400);
    expect(result.error).toBe("Your cart is empty.");
  });
});
