const mongoose = require("mongoose");
const { createCartController } = require("../controllers/cartController");
const { createCheckoutController } = require("../controllers/checkoutController");

function queryResult(value) {
  return { lean: async () => value };
}

function renderResponse() {
  const response = { calls: [], statusCode: 200 };
  response.status = (code) => { response.statusCode = code; return response; };
  response.render = (view, data) => { response.calls.push({ view, data }); return response.calls.at(-1); };
  response.json = (body) => { response.calls.push({ json: body }); return body; };
  response.redirect = (status, location) => ({ status, location });
  return response;
}

function htmxRequest(overrides = {}) {
  return {
    get: (name) => name.toLowerCase() === "hx-request" ? "true" : "text/html",
    body: {},
    params: {},
    session: { cart: [] },
    ...overrides,
  };
}

describe("cart and checkout HTMX response contract", () => {
  it("returns an add feedback fragment and server-authoritative count", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: () => queryResult({ _id: id, title: "Book", stock: 4, price: 10 }) };
    const controller = createCartController({ Book });
    const req = htmxRequest({ body: { bookId: id, quantity: "2" } });
    const res = renderResponse();

    await controller.addItem(req, res, (error) => { throw error; });

    expect(res.calls[0].view).toBe("partials/mutation-feedback");
    expect(res.calls[0].data.cartCount).toBe(2);
    expect(req.session.cart).toEqual([{ bookId: id, quantity: 2 }]);
  });

  it("returns canonical cart content for update/remove/clear without JSON", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Book", stock: 4, price: 10 };
    const Book = { findById: () => queryResult(book), find: () => queryResult([book]) };
    const controller = createCartController({ Book });
    const req = htmxRequest({ params: { id }, body: { quantity: "2" }, session: { cart: [{ bookId: id, quantity: 1 }] } });
    const res = renderResponse();

    await controller.updateItem(req, res, (error) => { throw error; });
    expect(res.calls.at(-1).view).toBe("partials/cart-content");
    expect(res.calls.at(-1).data.view.items[0].quantity).toBe(2);
    req.body = {};
    await controller.removeItem(req, res, (error) => { throw error; });
    expect(res.calls.at(-1).data.view.items).toHaveLength(0);
    await controller.clearCart(req, res);
    expect(res.calls.at(-1).data.view.items).toHaveLength(0);
  });

  it("renders safe expected mutation errors and never mutates on invalid quantity", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const Book = { findById: () => queryResult({ _id: id, title: "Book", stock: 2, price: 10 }) };
    const controller = createCartController({ Book });
    const req = htmxRequest({ body: { bookId: id, quantity: "0" }, session: { cart: [] } });
    const res = renderResponse();

    await controller.addItem(req, res, (error) => { throw error; });

    expect(res.statusCode).toBe(400);
    expect(res.calls[0].view).toBe("partials/mutation-feedback");
    expect(req.session.cart).toEqual([]);
  });

  it("keeps the cart target structurally intact for HTMX update errors", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Book", stock: 2, price: 10 };
    const controller = createCartController({ Book: { findById: () => queryResult(book), find: () => queryResult([book]) } });
    const req = htmxRequest({ params: { id }, body: { quantity: "0" }, session: { cart: [{ bookId: id, quantity: 1 }] } });
    const res = renderResponse();

    await controller.updateItem(req, res, (error) => { throw error; });

    expect(res.statusCode).toBe(400);
    expect(res.calls[0].view).toBe("partials/cart-content");
    expect(res.calls[0].data.feedbackError).toBe(true);
    expect(res.calls[0].data.view.items).toHaveLength(1);
    expect(req.session.cart).toEqual([{ bookId: id, quantity: 1 }]);
  });

  it("returns empty canonical content for a successful HTMX demo checkout", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Book", stock: 4, price: 10 };
    const controller = createCheckoutController({ Book: { find: () => queryResult([book]) } });
    const req = htmxRequest({ session: { cart: [{ bookId: id, quantity: 1 }] } });
    const res = renderResponse();

    await controller.checkout(req, res, (error) => { throw error; });

    expect(res.calls[0].view).toBe("partials/cart-content");
    expect(res.calls[0].data.view.items).toHaveLength(0);
    expect(res.calls[0].data.feedbackMessage).toContain("Demo payment completed");
    expect(req.session.cart).toEqual([]);
  });

  it("keeps an empty HTMX checkout safe and non-mutating", async () => {
    const controller = createCheckoutController({ Book: { find: () => { throw new Error("should not query"); } } });
    const req = htmxRequest({ session: { cart: [] } });
    const res = renderResponse();

    await controller.checkout(req, res, (error) => { throw error; });

    expect(res.statusCode).toBe(400);
    expect(res.calls[0].view).toBe("partials/cart-content");
    expect(res.calls[0].data.feedbackError).toBe(true);
    expect(req.session.cart).toEqual([]);
  });

  it("returns a full safe cart fragment when an HTMX update references a missing book", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const controller = createCartController({
      Book: { findById: () => queryResult(null), find: () => queryResult([]) },
    });
    const req = htmxRequest({ params: { id }, body: { quantity: "1" }, session: { cart: [{ bookId: id, quantity: 1 }] } });
    const res = renderResponse();

    await controller.updateItem(req, res, (error) => { throw error; });

    expect(res.statusCode).toBe(404);
    expect(res.calls[0].view).toBe("partials/cart-content");
    expect(res.calls[0].data.feedbackError).toBe(true);
  });
});
