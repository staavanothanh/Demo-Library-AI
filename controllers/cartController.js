const {
  addItem,
  updateItem: updateCartItem,
  removeItem: removeCartItem,
  getCartCount,
  buildCartView,
  normalizeCart,
} = require("../services/cartService");
const { isHtmxRequest } = require("../middleware/requestMode");

function createCartController({ Book }) {
  const loadCart = async (req) => {
    const cart = normalizeCart(req.session.cart);
    const ids = cart.map((item) => item.bookId);
    const books = ids.length ? await Book.find({ _id: { $in: ids } }).lean() : [];
    const view = buildCartView({ cart, books });
    const validIds = new Set(view.items.map((item) => String(item.book._id)));
    req.session.cart = view.items.map((item) => ({ bookId: String(item.book._id), quantity: item.quantity }));
    return { view, validIds };
  };

  const emptyView = () => ({ items: [], totalCents: 0, total: 0, removedCount: 0 });

  const handleCartError = async (error, req, res, next, fragmentKind = "feedback") => {
    const expectedMessages = ["Invalid book id", "Quantity must be a positive integer", "Quantity exceeds available stock"];
    if (expectedMessages.includes(error.message)) {
      if (isHtmxRequest(req) && typeof res.render === "function") {
        if (fragmentKind === "cart") return renderCartFragment(req, res, error.message, true, 400);
        if (typeof res.status === "function") res.status(400);
        return res.render("partials/mutation-feedback", {
          message: error.message,
          feedbackError: true,
          cartCount: getCartCount(req.session.cart || []),
        });
      }
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  };

  const prefersJson = (req) => {
    const accept = typeof req.get === "function" ? String(req.get("Accept") || "").toLowerCase() : "";
    return !accept || !accept.includes("text/html");
  };

  const renderCartFragment = async (req, res, message, feedbackError = false, status = 200) => {
    const view = typeof Book.find === "function" ? (await loadCart(req)).view : emptyView();
    if (typeof res.status === "function") res.status(status);
    return res.render("partials/cart-content", {
      view,
      ...view,
      cartCount: getCartCount(req.session.cart || []),
      feedbackMessage: message,
      feedbackError,
      fragment: true,
    });
  };

  const respondToMutation = async (req, res, payload, message) => {
    if (isHtmxRequest(req) && typeof res.render === "function") return renderCartFragment(req, res, message);
    if (prefersJson(req)) return res.json(payload);
    return res.redirect(303, `/cart?message=${encodeURIComponent(message)}`);
  };

  const renderNotFound = (req, res, fragmentKind = "feedback") => {
    if (isHtmxRequest(req) && typeof res.render === "function") {
      if (fragmentKind === "cart") return renderCartFragment(req, res, "Book not found.", true, 404);
      if (typeof res.status === "function") res.status(404);
      return res.render("partials/mutation-feedback", {
        message: "Book not found.",
        feedbackError: true,
        cartCount: getCartCount(req.session.cart || []),
      });
    }
    return res.status(404).json({ error: "Book not found." });
  };

  return {
    showCart: async (req, res, next) => {
      try {
        const { view } = await loadCart(req);
        if (res.locals) res.locals.cartCount = getCartCount(req.session.cart || []);
        return res.render("cart", view);
      } catch (error) { return next(error); }
    },
    addItem: async (req, res, next) => {
      try {
        const bookId = String(req.body.bookId || "");
        const quantity = Number(req.body.quantity);
        const book = await Book.findById(bookId).lean();
        if (!book) return renderNotFound(req, res, "feedback");
        const cart = addItem(req.session.cart || [], bookId, quantity, book.stock);
        req.session.cart = cart;
        const cartCount = getCartCount(cart);
        if (isHtmxRequest(req) && typeof res.render === "function") {
          return res.render("partials/mutation-feedback", { message: "Added to your cart.", cartCount, feedbackError: false });
        }
        if (!prefersJson(req)) return res.redirect(`/books/${encodeURIComponent(String(book._id))}?message=Added%20to%20your%20cart.`);
        return res.json({ ok: true, cartCount });
      } catch (error) { return handleCartError(error, req, res, next, "feedback"); }
    },
    updateItem: async (req, res, next) => {
      try {
        const book = await Book.findById(req.params.id).lean();
        if (!book) return renderNotFound(req, res, "cart");
        req.session.cart = updateCartItem(req.session.cart || [], req.params.id, Number(req.body.quantity), book.stock);
        return respondToMutation(req, res, { ok: true, cartCount: getCartCount(req.session.cart) }, "Cart updated.");
      } catch (error) { return handleCartError(error, req, res, next, "cart"); }
    },
    removeItem: async (req, res, next) => {
      try {
        req.session.cart = removeCartItem(req.session.cart || [], req.params.id);
        return respondToMutation(req, res, { ok: true, cartCount: getCartCount(req.session.cart) }, "Item removed from your cart.");
      } catch (error) { return handleCartError(error, req, res, next, "cart"); }
    },
    clearCart: async (req, res, next) => {
      req.session.cart = [];
      try {
        return respondToMutation(req, res, { ok: true, cartCount: 0 }, "Cart cleared.");
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCartController };
