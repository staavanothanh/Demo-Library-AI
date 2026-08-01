const express = require("express");

function createCheckoutRoutes({ controller, csrf = (req, res, next) => next() }) {
  const router = express.Router();
  router.post("/checkout", csrf, controller.checkout);
  return router;
}

module.exports = { createCheckoutRoutes };
