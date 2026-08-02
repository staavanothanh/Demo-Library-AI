const path = require("path");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const bcrypt = require("bcrypt");
const helmet = require("helmet");
const User = require("./models/User");
const Book = require("./models/Book");
const Comment = require("./models/Comment");
const { getCartCount } = require("./services/cartService");
const { createCartController } = require("./controllers/cartController");
const { createCheckoutController } = require("./controllers/checkoutController");
const { createCommentController } = require("./controllers/commentController");
const { createCartRoutes } = require("./routes/cartRoutes");
const { createCheckoutRoutes } = require("./routes/checkoutRoutes");
const { createCommentRoutes } = require("./routes/commentRoutes");
const { createChatbotController } = require("./controllers/chatbotController");
const { createChatbotRoutes } = require("./routes/chatbotRoutes");
const { createRateLimiter } = require("./middleware/rateLimit");
const { createPolicyService, createAtlasVectorSearch } = require("./services/policyService");
const { createChatbotService } = require("./services/chatbotService");
const { createOpenCodeZenProvider } = require("./services/aiProviders/openCodeZenProvider");
const KnowledgeChunk = require("./models/KnowledgeChunk");
const { createCsrfMiddleware } = require("./middleware/csrf");
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

function createApp({ sessionStore, recommendationClient = createRecommendationClient({ Book }), chatbotService } = {}) {
  const app = express();
  const rawTrustedProxyHops = process.env.TRUST_PROXY_HOPS;
  const trustedProxyHops = rawTrustedProxyHops === undefined || rawTrustedProxyHops === "" ? 0 : Number(rawTrustedProxyHops);
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 10) throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 10.");
  app.set("trust proxy", trustedProxyHops);
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
  const csrf = createCsrfMiddleware();
  app.use(csrf.exposeToken);
  app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.message = req.query.message;
    res.locals.cartCount = getCartCount(req.session.cart || []);
    res.locals.formatCurrency = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
    next();
  });

  const authController = createAuthController({ User, bcrypt });
  const catalogController = createCatalogController({ Book, Comment });
  const adminController = createAdminController({ Book, recommendationClient });
  const recommendationController = createRecommendationController({ recommendationClient });
  const cartController = createCartController({ Book });
  const checkoutController = createCheckoutController({ Book });
  const commentController = createCommentController({ Book, Comment });
  const policyService = createPolicyService({
    KnowledgeChunk,
    embeddingClient: recommendationClient,
    vectorSearch: createAtlasVectorSearch({ KnowledgeChunk }),
  });
  const resolvedChatbotService = chatbotService || createChatbotService({ policyService, recommendationClient, provider: createOpenCodeZenProvider(), Book });
  const chatbotController = createChatbotController({ chatbotService: resolvedChatbotService });
  const aiRateLimit = Number(process.env.AI_RATE_LIMIT || 20);
  const chatbotLimiter = createRateLimiter({ max: Number.isInteger(aiRateLimit) && aiRateLimit > 0 ? aiRateLimit : 20 });
  const authRateLimit = Number(process.env.AUTH_RATE_LIMIT || 5);
  const loginLimiter = createRateLimiter({ max: Number.isInteger(authRateLimit) && authRateLimit > 0 ? authRateLimit : 5 });
  const recommendationRateLimit = Number(process.env.RECOMMENDATION_RATE_LIMIT || aiRateLimit);
  const recommendationLimiter = createRateLimiter({ max: Number.isInteger(recommendationRateLimit) && recommendationRateLimit > 0 ? recommendationRateLimit : 20 });

  app.use(createAuthRoutes({ controller: authController, passport, renderForm, showValidation, csrf: csrf.requireToken, limiter: loginLimiter }));
  app.use(createCatalogRoutes({ controller: catalogController }));
  app.use(createCartRoutes({ controller: cartController, csrf: csrf.requireToken }));
  app.use(createCheckoutRoutes({ controller: checkoutController, csrf: csrf.requireToken }));
  app.use(createCommentRoutes({ controller: commentController, requireAuth, csrf: csrf.requireToken }));
  app.use(createAdminRoutes({ controller: adminController, requireAuth, requireAdmin, showValidation, csrf: csrf.requireToken }));
  app.use(createRecommendationRoutes({ controller: recommendationController, requireAuth, validationResult, limiter: recommendationLimiter }));
  app.use(createChatbotRoutes({ controller: chatbotController, limiter: chatbotLimiter, csrf: csrf.requireToken }));

  app.use((req, res) => res.status(404).render("error", { status: 404, message: "The page you requested was not found." }));
  app.use((error, req, res, next) => {
    console.error(error);
    return req.accepts("json") ? res.status(500).json({ error: "The request could not be completed. Please try again." }) : res.status(500).render("error", { status: 500, message: "Something went wrong. Please try again." });
  });
  return app;
}

module.exports = { createApp, createRecommendationClient };
