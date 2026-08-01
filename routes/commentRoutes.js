const express = require("express");

function createCommentRoutes({ controller, requireAuth, csrf = (req, res, next) => next() }) {
  const router = express.Router();
  router.post("/books/:id/comments", requireAuth, csrf, controller.create);
  return router;
}

module.exports = { createCommentRoutes };
