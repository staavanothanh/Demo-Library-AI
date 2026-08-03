const { buildCartView, normalizeCart, getCartCount } = require("../services/cartService");
const { isHtmxRequest } = require("../middleware/requestMode");

function prefersJson(req) {
  const accept = typeof req.get === "function" ? String(req.get("Accept") || "").toLowerCase() : "";
  return !accept || !accept.includes("text/html");
}

function respondToCheckout(req, res, payload, message) {
  if (prefersJson(req)) return res.json(payload);
  return res.redirect(303, `/cart?message=${encodeURIComponent(message)}`);
}

function createCheckoutController({ Book }) {
  const getView = async (req, cart) => {
    const ids = cart.map((item) => item.bookId);
    const books = ids.length ? await Book.find({ _id: { $in: ids } }).lean() : [];
    return buildCartView({ cart, books });
  };

  const renderFragment = async (req, res, status, message, cart, feedbackError = true) => {
    const view = typeof Book.find === "function" ? await getView(req, cart) : { items: [], totalCents: 0, total: 0, removedCount: 0 };
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

  return {
    checkout: async (req, res, next) => {
      try {
        const rawCart = req.session.cart;
        const cart = normalizeCart(rawCart);
        const hasInvalidEntries = Array.isArray(rawCart) && rawCart.some((entry) => !normalizeCart([entry]).length);
        if (!cart.length) {
          const message = Array.isArray(rawCart) && rawCart.length
            ? "Some cart items are unavailable or exceed current stock."
            : "Your cart is empty.";
          if (isHtmxRequest(req) && typeof res.render === "function") return renderFragment(req, res, Array.isArray(rawCart) && rawCart.length ? 409 : 400, message, cart);
          if (Array.isArray(rawCart) && rawCart.length) {
            if (!prefersJson(req)) return res.redirect(303, "/cart?message=Some%20cart%20items%20are%20unavailable.");
            return res.status(409).json({ error: message });
          }
          if (!prefersJson(req)) return res.redirect(303, "/cart?message=Your%20cart%20is%20empty.");
          return res.status(400).json({ error: message });
        }
        const view = await getView(req, cart);
        const hasQuantityMismatch = view.items.some((item) => item.quantity !== cart.find((entry) => entry.bookId === String(item.book._id))?.quantity);
        if (hasInvalidEntries || view.items.length !== cart.length || hasQuantityMismatch) {
          const message = "Some cart items are unavailable or exceed current stock.";
          if (isHtmxRequest(req) && typeof res.render === "function") return renderFragment(req, res, 409, message, cart);
          if (!prefersJson(req)) return res.redirect(303, "/cart?message=Some%20cart%20items%20are%20unavailable.");
          return res.status(409).json({ error: message });
        }
        req.session.cart = [];
        const payload = { ok: true, message: "Demo payment completed. No real payment was processed.", total: view.total, cartCount: 0 };
        if (isHtmxRequest(req) && typeof res.render === "function") {
          const empty = { items: [], totalCents: 0, total: 0, removedCount: 0 };
          return res.render("partials/cart-content", {
            view: empty,
            ...empty,
            cartCount: 0,
            feedbackMessage: payload.message,
            feedbackError: false,
            fragment: true,
          });
        }
        return respondToCheckout(req, res, payload, payload.message);
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCheckoutController };
