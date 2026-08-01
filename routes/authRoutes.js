const express = require("express");
const { body } = require("express-validator");

function createAuthRoutes({ controller, passport, renderForm, showValidation }) {
  const router = express.Router();
  router.get("/register", renderForm("register"));
  router.post("/register", [
    body("username").trim().isLength({ min: 3, max: 30 }).withMessage("Username must be 3–30 characters."),
    body("password").isLength({ min: 8 }).withMessage("Password must contain at least 8 characters."),
    body("confirmPassword").custom((value, { req }) => value === req.body.password).withMessage("Passwords do not match."),
    showValidation("register"),
  ], controller.register);
  router.get("/login", renderForm("login"));
  router.post("/login", passport.authenticate("local", { failureRedirect: "/login?message=Invalid username or password." }), controller.afterLogin);
  router.post("/logout", controller.logout);
  return router;
}

module.exports = { createAuthRoutes };
