const express = require("express");

function createCommentRoutes({ controller, requireAuth }) {
  const router = express.Router();
  router.post("/books/:id/comments", requireAuth, controller.create);
  return router;
}

module.exports = { createCommentRoutes };
