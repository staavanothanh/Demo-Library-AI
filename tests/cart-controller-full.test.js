const mongoose = require("mongoose");
const { createCartController } = require("../controllers/cartController");

function queryResult(value) {
  return { lean: async () => value };
}

describe("complete cart controller", () => {
  it("renders a canonical cart view and removes missing products", async () => {
    const firstId = new mongoose.Types.ObjectId().toString();
    const missingId = new mongoose.Types.ObjectId().toString();
    const Book = { find: () => queryResult([{ _id: firstId, title: "First", price: 8, stock: 2 }]) };
    const controller = createCartController({ Book });
    const req = { session: { cart: [{ bookId: firstId, quantity: 1 }, { bookId: missingId, quantity: 1 }] } };
    const response = { render: (view, data) => ({ view, data }) };

    const result = await controller.showCart(req, response, (error) => { throw error; });

    expect(result.view).toBe("cart");
    expect(result.data.total).toBe(8);
    expect(req.session.cart).toEqual([{ bookId: firstId, quantity: 1 }]);
  });

  it("updates, removes, and clears only session cart data", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, stock: 4, price: 5 };
    const Book = {
      find: () => queryResult([book]),
      findById: () => queryResult(book),
    };
    const controller = createCartController({ Book });
    const req = { body: { quantity: "3" }, params: { id }, session: { cart: [{ bookId: id, quantity: 1 }] } };
    const response = { json: (body) => body, status: () => response };

    expect(await controller.updateItem(req, response, (error) => { throw error; })).toEqual({ ok: true, cartCount: 3 });
    expect(req.session.cart).toEqual([{ bookId: id, quantity: 3 }]);
    expect(await controller.removeItem(req, response, (error) => { throw error; })).toEqual({ ok: true, cartCount: 0 });
    expect(await controller.clearCart(req, response)).toEqual({ ok: true, cartCount: 0 });
    expect(req.session.cart).toEqual([]);
  });
});
