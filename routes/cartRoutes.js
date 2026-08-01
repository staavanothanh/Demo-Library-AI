const express = require("express");

function createCartRoutes({ controller }) {
  const router = express.Router();
  router.get("/cart", controller.showCart);
  router.post("/cart/items", controller.addItem);
  router.post("/cart/items/:id/update", controller.updateItem);
  router.post("/cart/items/:id/remove", controller.removeItem);
  router.post("/cart/clear", controller.clearCart);
  return router;
}

module.exports = { createCartRoutes };
