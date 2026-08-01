const mongoose = require("mongoose");

const COMMENT_ERROR = "Comment must contain 1–1000 characters.";

function createCommentController({ Comment, Book }) {
  return {
    create: async (req, res, next) => {
      const bookId = req.params.id;
      const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
      if (!mongoose.Types.ObjectId.isValid(bookId)) return res.status(404).json({ error: "Book not found." });
      if (!body || body.length > 1000) return res.status(400).json({ error: COMMENT_ERROR });
      try {
        if (!await Book.exists({ _id: bookId })) return res.status(404).json({ error: "Book not found." });
        await Comment.create({ bookId, userId: String(req.user._id), body });
        return res.redirect(`/books/${bookId}`);
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCommentController, COMMENT_ERROR };
