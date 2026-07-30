const express = require("express");

function createCatalogRoutes({ controller, requireAuth }) {
  const router = express.Router();
  router.get("/", controller.home);
  router.get("/booklist", requireAuth, controller.listBooks);
  return router;
}

module.exports = { createCatalogRoutes };
