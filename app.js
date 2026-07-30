const path = require("path");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const bcrypt = require("bcrypt");
const helmet = require("helmet");
const User = require("./models/User");
const Book = require("./models/Book");
const { configurePassport } = require("./config/passport");
const { requireAuth, requireAdmin } = require("./middleware/auth");
const { renderForm, showValidation, validationResult } = require("./middleware/validation");
const { createRecommendationClient } = require("./services/recommendationClient");
const { createAuthController } = require("./controllers/authController");
const { createCatalogController } = require("./controllers/catalogController");
const { createAdminController } = require("./controllers/adminController");
const { createRecommendationController } = require("./controllers/recommendationController");
const { createAuthRoutes } = require("./routes/authRoutes");
const { createCatalogRoutes } = require("./routes/catalogRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");
const { createRecommendationRoutes } = require("./routes/recommendationRoutes");

function createApp({ sessionStore, recommendationClient = createRecommendationClient({ Book }) } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || "development-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400000 },
  }));
  configurePassport(passport, { User, bcrypt });
  app.use(passport.initialize());
  app.use(passport.session());
  app.use((req, res, next) => { res.locals.user = req.user; res.locals.message = req.query.message; next(); });

  const authController = createAuthController({ User, bcrypt });
  const catalogController = createCatalogController({ Book });
  const adminController = createAdminController({ Book, recommendationClient });
  const recommendationController = createRecommendationController({ recommendationClient });

  app.use(createAuthRoutes({ controller: authController, passport, renderForm, showValidation }));
  app.use(createCatalogRoutes({ controller: catalogController, requireAuth }));
  app.use(createAdminRoutes({ controller: adminController, requireAuth, requireAdmin, showValidation }));
  app.use(createRecommendationRoutes({ controller: recommendationController, requireAuth, validationResult }));

  app.use((req, res) => res.status(404).render("error", { status: 404, message: "The page you requested was not found." }));
  app.use((error, req, res, next) => {
    console.error(error);
    return req.accepts("json") ? res.status(500).json({ error: "The request could not be completed. Please try again." }) : res.status(500).render("error", { status: 500, message: "Something went wrong. Please try again." });
  });
  return app;
}

module.exports = { createApp, createRecommendationClient };
