const express = require("express");

function createCatalogRoutes({ controller }) {
  const router = express.Router();
  router.get("/", controller.home);
  router.get("/books", controller.listBooks);
  router.get("/booklist", controller.listBooks);
  router.get("/books/:id", controller.showBook);
  return router;
}

module.exports = { createCatalogRoutes };
