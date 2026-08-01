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

    expect(result).toEqual({ ok: true, message: "Demo payment completed. No real payment was processed.", total: 20 });
    expect(req.session.cart).toEqual([]);
    expect(book.stock).toBe(5);
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
