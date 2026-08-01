const express = require("express");
const { body } = require("express-validator");
const {
  snapshotSupportedSessionState,
  restoreSupportedSessionState,
} = require("../services/sessionTransitionState");

function createAuthRoutes({ controller, passport, renderForm, showValidation, csrf = (req, res, next) => next() }) {
  const router = express.Router();
  const captureSessionState = (req, res, next) => {
    req.sessionTransitionState = snapshotSupportedSessionState(req.session);
    return next();
  };
  const restoreSessionState = (req, res, next) => {
    restoreSupportedSessionState(req.session, req.sessionTransitionState);
    return req.session.save(next);
  };
  router.get("/register", renderForm("register"));
  router.post("/register", csrf, [
    body("username").trim().isLength({ min: 3, max: 30 }).withMessage("Username must be 3–30 characters."),
    body("password").isLength({ min: 8 }).withMessage("Password must contain at least 8 characters."),
    body("confirmPassword").custom((value, { req }) => value === req.body.password).withMessage("Passwords do not match."),
    showValidation("register"),
  ], controller.register);
  router.get("/login", renderForm("login"));
  router.post("/login", csrf, captureSessionState, passport.authenticate("local", { failureRedirect: "/login?message=Invalid username or password." }), restoreSessionState, controller.afterLogin);
  router.post("/logout", csrf, controller.logout);
  return router;
}

module.exports = { createAuthRoutes };
