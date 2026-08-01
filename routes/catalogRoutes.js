const express = require("express");

function createCatalogRoutes({ controller }) {
  const router = express.Router();
  router.get("/", controller.home);
  router.get("/books", controller.listBooks);
  router.get("/booklist", controller.listBooks);
  return router;
}

module.exports = { createCatalogRoutes };
