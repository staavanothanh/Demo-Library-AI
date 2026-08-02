const { buildCartView, normalizeCart } = require("../services/cartService");

function prefersJson(req) {
  const accept = typeof req.get === "function" ? String(req.get("Accept") || "").toLowerCase() : "";
  return !accept || !accept.includes("text/html");
}

function respondToCheckout(req, res, payload, message) {
  if (prefersJson(req)) return res.json(payload);
  return res.redirect(303, `/cart?message=${encodeURIComponent(message)}`);
}

function createCheckoutController({ Book }) {
  return {
    checkout: async (req, res, next) => {
      try {
        const rawCart = req.session.cart;
        const cart = normalizeCart(rawCart);
        const hasInvalidEntries = Array.isArray(rawCart) && rawCart.some((entry) => !normalizeCart([entry]).length);
        if (!cart.length) {
          if (Array.isArray(rawCart) && rawCart.length) {
            if (!prefersJson(req)) return res.redirect(303, "/cart?message=Some%20cart%20items%20are%20unavailable.");
            return res.status(409).json({ error: "Some cart items are unavailable or exceed current stock." });
          }
          if (!prefersJson(req)) return res.redirect(303, "/cart?message=Your%20cart%20is%20empty.");
          return res.status(400).json({ error: "Your cart is empty." });
        }
        const ids = cart.map((item) => item.bookId);
        const books = await Book.find({ _id: { $in: ids } }).lean();
        const view = buildCartView({ cart, books });
        if (hasInvalidEntries || view.items.length !== cart.length || view.items.some((item) => item.quantity !== cart.find((entry) => entry.bookId === String(item.book._id))?.quantity)) {
          if (!prefersJson(req)) return res.redirect(303, "/cart?message=Some%20cart%20items%20are%20unavailable.");
          return res.status(409).json({ error: "Some cart items are unavailable or exceed current stock." });
        }
        req.session.cart = [];
        return respondToCheckout(req, res, { ok: true, message: "Demo payment completed. No real payment was processed.", total: view.total, cartCount: 0 }, "Demo payment completed. No real payment was processed.");
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCheckoutController };
