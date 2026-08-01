const express = require("express");

function createCheckoutRoutes({ controller }) {
  const router = express.Router();
  router.post("/checkout", controller.checkout);
  return router;
}

module.exports = { createCheckoutRoutes };
