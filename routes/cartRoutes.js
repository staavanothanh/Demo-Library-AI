const express = require("express");

function createCartRoutes({ controller, csrf = (req, res, next) => next() }) {
  const router = express.Router();
  router.get("/cart", controller.showCart);
  router.post("/cart/items", csrf, controller.addItem);
  router.post("/cart/items/:id/update", csrf, controller.updateItem);
  router.post("/cart/items/:id/remove", csrf, controller.removeItem);
  router.post("/cart/clear", csrf, controller.clearCart);
  return router;
}

module.exports = { createCartRoutes };
