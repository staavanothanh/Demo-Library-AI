const { addItem, getCartCount } = require("../services/cartService");

function createCartController({ Book }) {
  return {
    addItem: async (req, res, next) => {
      try {
        const bookId = String(req.body.bookId || "");
        const quantity = Number(req.body.quantity);
        const book = await Book.findById(bookId).lean();
        if (!book) return res.status(404).json({ error: "Book not found." });
        const cart = addItem(req.session.cart || [], bookId, quantity, book.stock);
        req.session.cart = cart;
        return res.json({ ok: true, cartCount: getCartCount(cart) });
      } catch (error) {
        if (["Invalid book id", "Quantity must be a positive integer", "Quantity exceeds available stock"].includes(error.message)) {
          return res.status(400).json({ error: error.message });
        }
        return next(error);
      }
    },
  };
}

module.exports = { createCartController };
