require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const path = require("path");
const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const passport = require("passport");
const { Strategy: LocalStrategy } = require("passport-local");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const helmet = require("helmet");
const { body, validationResult } = require("express-validator");
const { Worker } = require("worker_threads");
const User = require("./models/User");
const Book = require("./models/Book");
const { requireAuth, requireAdmin } = require("./middleware/auth");

const PORT = Number(process.env.PORT || 3000);
const appRoot = __dirname;

function createRecommendationClient() {
  let worker;
  let sequence = 0;
  const pendingRequests = new Map();

  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(path.join(appRoot, "services", "tensorflowWorker.js"));
    worker.on("message", (message) => {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) return;
      pendingRequests.delete(message.requestId);
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message);
    });
    worker.on("error", (error) => {
      pendingRequests.forEach(({ reject }) => reject(error));
      pendingRequests.clear();
      worker = undefined;
    });
    return worker;
  };

  const send = (payload) => new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    pendingRequests.set(requestId, { resolve, reject });
    ensureWorker().postMessage({ ...payload, requestId });
  });

  return {
    refreshBooks: async () => send({ type: "loadBooks", books: await Book.find({}).limit(300).lean() }),
    recommend: async (prompt) => send({ type: "recommend", prompt }),
    stop: async () => worker?.terminate(),
  };
}

function configurePassport() {
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username.trim().toLowerCase() });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return done(null, false);
      return done(null, user);
    } catch (error) { return done(error); }
  }));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, await User.findById(id)); } catch (error) { done(error); }
  });
}

async function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  await User.findOneAndUpdate(
    { username },
    { $set: { username, passwordHash: await bcrypt.hash(password, 12), role: "admin" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

function createApp({ sessionStore, recommendationClient = createRecommendationClient() } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  configurePassport();
  app.set("view engine", "ejs");
  app.set("views", path.join(appRoot, "views"));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.static(path.join(appRoot, "public")));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || "development-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86400000 },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use((req, res, next) => { res.locals.user = req.user; res.locals.message = req.query.message; next(); });

  const renderForm = (view) => (req, res) => res.render(view, { errors: [], values: {} });
  const showValidation = (view) => (req, res, next) => {
    const errors = validationResult(req);
    return errors.isEmpty() ? next() : res.status(422).render(view, { errors: errors.array(), values: req.body });
  };

  app.get("/", (req, res) => res.render("home"));
  app.get("/register", renderForm("register"));
  app.post("/register", [body("username").trim().isLength({ min: 3, max: 30 }).withMessage("Username must be 3–30 characters."), body("password").isLength({ min: 8 }).withMessage("Password must contain at least 8 characters."), showValidation("register")], async (req, res, next) => {
    try {
      const username = req.body.username.trim().toLowerCase();
      if (await User.exists({ username })) return res.status(409).render("register", { errors: [{ msg: "That username is already in use." }], values: req.body });
      await User.create({ username, passwordHash: await bcrypt.hash(req.body.password, 12), role: "member" });
      return res.redirect("/login?message=Registration successful. Please sign in.");
    } catch (error) { return next(error); }
  });
  app.get("/login", renderForm("login"));
  app.post("/login", passport.authenticate("local", { failureRedirect: "/login?message=Invalid username or password." }), (req, res) => res.redirect("/booklist"));
  app.post("/logout", (req, res, next) => req.logout((error) => error ? next(error) : res.redirect("/?message=You have been logged out.")));

  app.get("/booklist", requireAuth, async (req, res, next) => {
    try {
      const query = req.query.q?.trim();
      const filter = query ? { $or: [{ title: new RegExp(query, "i") }, { authors: new RegExp(query, "i") }, { genre: new RegExp(query, "i") }] } : {};
      res.render("booklist", { books: await Book.find(filter).sort({ title: 1 }).limit(60).lean(), query: query || "" });
    } catch (error) { next(error); }
  });

  app.get("/admin", (req, res) => res.redirect("/admin-dashboard"));
  app.get("/admin-dashboard", requireAuth, requireAdmin, (req, res) => res.render("admin-dashboard", { errors: [], values: {} }));
  app.post("/admin-dashboard/add-book", requireAuth, requireAdmin, [body("title").trim().notEmpty().withMessage("Title is required."), body("authors").trim().notEmpty().withMessage("Author is required."), body("description").trim().isLength({ min: 20 }).withMessage("Description must contain at least 20 characters."), showValidation("admin-dashboard")], async (req, res, next) => {
    try {
      await Book.create({ title: req.body.title.trim(), authors: req.body.authors.trim(), description: req.body.description.trim(), genre: req.body.genre?.trim(), publisher: req.body.publisher?.trim(), publicationDate: req.body.publicationDate?.trim(), averageRating: Number(req.body.averageRating) || 0 });
      await recommendationClient.refreshBooks();
      res.redirect("/admin-dashboard?message=Book added and AI index refreshed.");
    } catch (error) { next(error); }
  });

  app.get("/tensorflow-chat", requireAuth, (req, res) => res.render("tensorflowChat"));
  app.post("/tensorflow-chat", requireAuth, [body("prompt").trim().notEmpty().withMessage("Please enter a recommendation request.")], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try { return res.json(await recommendationClient.recommend(req.body.prompt.trim())); } catch (error) { return next(error); }
  });

  app.use((req, res) => res.status(404).render("error", { status: 404, message: "The page you requested was not found." }));
  app.use((error, req, res, next) => {
    console.error(error);
    return req.accepts("json") ? res.status(500).json({ error: "The request could not be completed. Please try again." }) : res.status(500).render("error", { status: 500, message: "Something went wrong. Please try again." });
  });
  return app;
}

async function start() {
  if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) throw new Error("MONGODB_URI and SESSION_SECRET are required. Copy .env.example to .env and configure it.");
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureAdmin();
  const recommendationClient = createRecommendationClient();
  const app = createApp({ sessionStore: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }), recommendationClient });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Library + AI is running on http://localhost:${PORT}`);
    recommendationClient.refreshBooks().catch((error) => console.error(`AI index is unavailable: ${error.message}`));
  });
}

if (require.main === module) start().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { createApp, createRecommendationClient };
