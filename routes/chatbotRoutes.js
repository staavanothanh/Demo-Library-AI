const express = require("express");

function createChatbotRoutes({ controller, limiter = (req, res, next) => next() }) {
  const router = express.Router();
  router.post("/api/ai/chat", limiter, controller.chat);
  return router;
}

module.exports = { createChatbotRoutes };
