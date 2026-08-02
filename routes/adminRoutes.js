const express = require("express");
const { body } = require("express-validator");

function createAdminRoutes({ controller, requireAuth, requireAdmin, showValidation, csrf = (req, res, next) => next() }) {
  const router = express.Router();
  router.get("/admin", controller.redirectAdmin);
  router.get("/admin-dashboard", requireAuth, requireAdmin, controller.showDashboard);
  router.post("/admin-dashboard/add-book", requireAuth, requireAdmin, csrf, [
    body("title").trim().notEmpty().withMessage("Title is required."),
    body("authors").trim().notEmpty().withMessage("Author is required."),
    body("description").trim().isLength({ min: 20 }).withMessage("Description must contain at least 20 characters."),
    body("price").isFloat({ min: 0 }).withMessage("Price must be a non-negative number."),
    body("stock").isInt({ min: 0 }).withMessage("Stock must be a non-negative integer."),
    body("averageRating").custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      const rating = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
      return Number.isFinite(rating) && String(value).trim() !== "" && rating >= 0 && rating <= 5;
    }).withMessage("Average rating must be between 0 and 5."),
    body("coverUrl").optional({ values: "falsy" }).isURL({ protocols: ["http", "https"], require_protocol: true }).withMessage("Cover URL must be a valid HTTP(S) URL."),
    showValidation("admin-dashboard"),
  ], controller.addBook);
  return router;
}

module.exports = { createAdminRoutes };
