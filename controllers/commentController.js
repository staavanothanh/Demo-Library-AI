const mongoose = require("mongoose");
const { isHtmxRequest } = require("../middleware/requestMode");

const COMMENT_ERROR = "Comment must contain 1–1000 characters.";

function createCommentController({ Comment, Book }) {
  const loadComments = async (bookId) => {
    if (!Comment || typeof Comment.find !== "function") return [];
    return Comment.find({ bookId }).sort({ createdAt: -1 }).populate("userId", "username").lean();
  };

  const renderFragment = async (req, res, status, bookId, errorMessage, commentPosted = false) => {
    if (typeof res.render !== "function") return res.status(status).json({ error: errorMessage });
    const comments = await loadComments(bookId);
    if (typeof res.status === "function") res.status(status);
    return res.render("partials/comments-section", {
      bookId,
      comments,
      user: req.user,
      errorMessage,
      commentPosted,
    });
  };

  const respondValidation = (req, res, status, bookId, message) => {
    if (isHtmxRequest(req) && typeof res.render === "function") return renderFragment(req, res, status, bookId, message);
    return res.status(status).json({ error: message });
  };

  return {
    create: async (req, res, next) => {
      const bookId = req.params.id;
      const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
      if (!mongoose.Types.ObjectId.isValid(bookId)) return respondValidation(req, res, 404, bookId, "Book not found.");
      if (!body || body.length > 1000) return respondValidation(req, res, 400, bookId, COMMENT_ERROR);
      try {
        if (!await Book.exists({ _id: bookId })) return respondValidation(req, res, 404, bookId, "Book not found.");
        await Comment.create({ bookId, userId: String(req.user._id), body });
        if (isHtmxRequest(req) && typeof res.render === "function") return renderFragment(req, res, 200, bookId, undefined, true);
        return res.redirect(`/books/${bookId}`);
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCommentController, COMMENT_ERROR };
