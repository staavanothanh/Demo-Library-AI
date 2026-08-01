const { buildCartView } = require("../services/cartService");

function createCheckoutController({ Book }) {
  return {
    checkout: async (req, res, next) => {
      try {
        const cart = req.session.cart || [];
        if (!cart.length) return res.status(400).json({ error: "Your cart is empty." });
        const ids = cart.map((item) => item.bookId);
        const books = await Book.find({ _id: { $in: ids } }).lean();
        const view = buildCartView({ cart, books });
        if (view.items.length !== cart.length || view.items.some((item) => item.quantity !== cart.find((entry) => entry.bookId === String(item.book._id))?.quantity)) {
          return res.status(409).json({ error: "Some cart items are unavailable or exceed current stock." });
        }
        req.session.cart = [];
        return res.json({ ok: true, message: "Demo payment completed. No real payment was processed.", total: view.total });
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCheckoutController };
