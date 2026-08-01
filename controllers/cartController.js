const {
  addItem,
  updateItem: updateCartItem,
  removeItem: removeCartItem,
  getCartCount,
  buildCartView,
} = require("../services/cartService");

function createCartController({ Book }) {
  const loadCart = async (req) => {
    const cart = req.session.cart || [];
    const ids = cart.map((item) => item.bookId);
    const books = ids.length ? await Book.find({ _id: { $in: ids } }).lean() : [];
    const view = buildCartView({ cart, books });
    const validIds = new Set(view.items.map((item) => String(item.book._id)));
    req.session.cart = view.items.map((item) => ({ bookId: String(item.book._id), quantity: item.quantity }));
    return { view, validIds };
  };

  const handleCartError = (error, res, next) => {
    if (["Invalid book id", "Quantity must be a positive integer", "Quantity exceeds available stock"].includes(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  };

  const prefersJson = (req) => {
    const accept = typeof req.get === "function" ? String(req.get("Accept") || "").toLowerCase() : "";
    return !accept || !accept.includes("text/html");
  };

  const respondToMutation = (req, res, payload, message) => {
    if (prefersJson(req)) return res.json(payload);
    return res.redirect(303, `/cart?message=${encodeURIComponent(message)}`);
  };

  return {
    showCart: async (req, res, next) => {
      try {
        const { view } = await loadCart(req);
        return res.render("cart", view);
      } catch (error) { return next(error); }
    },
    addItem: async (req, res, next) => {
      try {
        const bookId = String(req.body.bookId || "");
        const quantity = Number(req.body.quantity);
        const book = await Book.findById(bookId).lean();
        if (!book) return res.status(404).json({ error: "Book not found." });
        const cart = addItem(req.session.cart || [], bookId, quantity, book.stock);
        req.session.cart = cart;
        const cartCount = getCartCount(cart);
        if (!prefersJson(req)) return res.redirect(`/books/${encodeURIComponent(String(book._id))}?message=Added%20to%20your%20cart.`);
        return res.json({ ok: true, cartCount });
      } catch (error) { return handleCartError(error, res, next); }
    },
    updateItem: async (req, res, next) => {
      try {
        const book = await Book.findById(req.params.id).lean();
        if (!book) return res.status(404).json({ error: "Book not found." });
        req.session.cart = updateCartItem(req.session.cart || [], req.params.id, Number(req.body.quantity), book.stock);
        return respondToMutation(req, res, { ok: true, cartCount: getCartCount(req.session.cart) }, "Cart updated.");
      } catch (error) { return handleCartError(error, res, next); }
    },
    removeItem: async (req, res, next) => {
      try {
        req.session.cart = removeCartItem(req.session.cart || [], req.params.id);
        return respondToMutation(req, res, { ok: true, cartCount: getCartCount(req.session.cart) }, "Item removed from your cart.");
      } catch (error) { return handleCartError(error, res, next); }
    },
    clearCart: (req, res) => {
      req.session.cart = [];
      return respondToMutation(req, res, { ok: true, cartCount: 0 }, "Cart cleared.");
    },
  };
}

module.exports = { createCartController };
