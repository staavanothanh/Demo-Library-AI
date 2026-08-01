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

  it("redirects native remove and clear forms back to the cart page", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, stock: 4, price: 5 };
    const Book = { findById: () => queryResult(book) };
    const controller = createCartController({ Book });
    const redirects = [];
    const response = {
      json: (body) => body,
      status: () => response,
      redirect: (status, location) => { redirects.push({ status, location }); return redirects.at(-1); },
    };
    const htmlRequest = () => ({
      body: {},
      params: { id },
      get: (name) => name.toLowerCase() === "accept" ? "text/html" : undefined,
      session: { cart: [{ bookId: id, quantity: 1 }] },
    });

    const removeRequest = htmlRequest();
    await controller.removeItem(removeRequest, response, (error) => { throw error; });
    const updateRequest = { ...htmlRequest(), body: { quantity: "2" } };
    await controller.updateItem(updateRequest, response, (error) => { throw error; });
    const clearRequest = { ...htmlRequest(), session: { cart: [{ bookId: id, quantity: 1 }] } };
    await controller.clearCart(clearRequest, response);

    expect(redirects).toEqual([
      { status: 303, location: "/cart?message=Item%20removed%20from%20your%20cart." },
      { status: 303, location: "/cart?message=Cart%20updated." },
      { status: 303, location: "/cart?message=Cart%20cleared." },
    ]);
    expect(removeRequest.session.cart).toEqual([]);
    expect(updateRequest.session.cart).toEqual([{ bookId: id, quantity: 2 }]);
    expect(clearRequest.session.cart).toEqual([]);
  });

  it("keeps explicit JSON mutation responses and authoritative counts", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, stock: 4, price: 5 };
    const controller = createCartController({ Book: { findById: () => queryResult(book) } });
    const response = { json: (body) => body, status: () => response, redirect: () => { throw new Error("unexpected redirect"); } };
    const req = { body: {}, params: { id }, get: () => "application/json", session: { cart: [{ bookId: id, quantity: 2 }] } };

    expect(await controller.removeItem(req, response, (error) => { throw error; })).toEqual({ ok: true, cartCount: 0 });
    req.session.cart = [{ bookId: id, quantity: 2 }];
    expect(await controller.clearCart(req, response)).toEqual({ ok: true, cartCount: 0 });
  });
});
