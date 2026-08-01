const express = require("express");
const { body } = require("express-validator");

function createRecommendationRoutes({ controller, requireAuth, validationResult }) {
  const router = express.Router();
  router.get("/tensorflow-chat", requireAuth, controller.showChat);
  router.post("/tensorflow-chat", requireAuth, [body("prompt").trim().notEmpty().withMessage("Please enter a recommendation request.")], (req, res, next) => {
    const errors = validationResult(req);
    return errors.isEmpty() ? next() : res.status(400).json({ error: errors.array()[0].msg });
  }, controller.recommend);
  return router;
}

module.exports = { createRecommendationRoutes };
