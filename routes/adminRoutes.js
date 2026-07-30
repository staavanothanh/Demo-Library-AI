const express = require("express");
const { body } = require("express-validator");

function createAdminRoutes({ controller, requireAuth, requireAdmin, showValidation }) {
  const router = express.Router();
  router.get("/admin", controller.redirectAdmin);
  router.get("/admin-dashboard", requireAuth, requireAdmin, controller.showDashboard);
  router.post("/admin-dashboard/add-book", requireAuth, requireAdmin, [body("title").trim().notEmpty().withMessage("Title is required."), body("authors").trim().notEmpty().withMessage("Author is required."), body("description").trim().isLength({ min: 20 }).withMessage("Description must contain at least 20 characters."), showValidation("admin-dashboard")], controller.addBook);
  return router;
}

module.exports = { createAdminRoutes };
