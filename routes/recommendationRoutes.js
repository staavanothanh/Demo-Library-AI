const express = require("express");
const { body } = require("express-validator");

const MAX_PROMPT_LENGTH = 2000;

function createRecommendationRoutes({ controller, requireAuth, validationResult, limiter = (req, res, next) => next(), csrf = (req, res, next) => next() }) {
  const router = express.Router();
  router.get("/tensorflow-chat", requireAuth, controller.showChat);
  router.post("/tensorflow-chat", requireAuth, csrf, limiter, [
    body("prompt")
      .trim()
      .notEmpty()
      .withMessage("Please enter a recommendation request.")
      .bail()
      .isLength({ max: MAX_PROMPT_LENGTH })
      .withMessage(`Recommendation requests must not exceed ${MAX_PROMPT_LENGTH} characters.`),
  ], (req, res, next) => {
    const errors = validationResult(req);
    return errors.isEmpty() ? next() : res.status(400).json({ error: errors.array()[0].msg });
  }, controller.recommend);
  return router;
}

module.exports = { createRecommendationRoutes, MAX_PROMPT_LENGTH };
