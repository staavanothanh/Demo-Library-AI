const express = require("express");
const session = require("express-session");
const { Passport } = require("passport");
const request = require("supertest");
const mongoose = require("mongoose");
const { configurePassport } = require("../config/passport");
const { createCsrfMiddleware } = require("../middleware/csrf");
const { createAuthController } = require("../controllers/authController");
const { createCartController } = require("../controllers/cartController");
const { createAuthRoutes } = require("../routes/authRoutes");
const { createCartRoutes } = require("../routes/cartRoutes");

const BOOK_ID = new mongoose.Types.ObjectId().toString();
const USER = {
  id: "reader-1",
  username: "reader",
  passwordHash: "stored-hash",
  role: "member",
};

function createSessionContinuityApp() {
  const app = express();
  const passport = new Passport();
  const csrf = createCsrfMiddleware();
  const User = {
    findOne: async ({ username }) => username === USER.username ? USER : null,
    findById: async (id) => id === USER.id ? USER : null,
    exists: async () => false,
    create: async () => USER,
  };
  const bcrypt = {
    compare: async (password, passwordHash) => password === "correct-password" && passwordHash === USER.passwordHash,
    hash: async () => "unused",
  };
  const Book = {
    findById: (id) => ({
      lean: async () => String(id) === BOOK_ID ? { _id: BOOK_ID, stock: 5, price: 12.5 } : null,
    }),
  };

  configurePassport(passport, { User, bcrypt });
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(session({ secret: "session-continuity-test-secret", resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(csrf.exposeToken);

  app.get("/test/session", (req, res) => res.json({
    sessionId: req.session.id,
    csrfToken: req.session.csrfToken,
    cart: req.session.cart,
    chatHistory: req.session.chatHistory,
    returnTo: req.session.returnTo,
    injectedRole: req.session.injectedRole,
    extra: req.session.extra,
    passport: req.session.passport,
    userId: req.user?.id,
  }));
  app.post("/test/seed", csrf.requireToken, (req, res) => {
    req.session.cart = [{ bookId: BOOK_ID, quantity: 1 }];
    req.session.chatHistory = [{ role: "user", content: "Do not carry this over." }];
    req.session.returnTo = "/admin-dashboard";
    req.session.injectedRole = "admin";
    req.session.extra = { shouldNotCross: true };
    return res.status(204).end();
  });

  const authController = createAuthController({ User, bcrypt });
  const cartController = createCartController({ Book });
  const renderForm = () => (req, res) => res.status(200).json({ csrfToken: res.locals.csrfToken });
  const showValidation = () => (req, res, next) => next();
  app.use(createAuthRoutes({ controller: authController, passport, renderForm, showValidation, csrf: csrf.requireToken }));
  app.use(createCartRoutes({ controller: cartController, csrf: csrf.requireToken }));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));

  return app;
}

describe("Passport session rotation continuity", () => {
  it("rotates the session while retaining only the supported cart and CSRF state", async () => {
    const agent = request.agent(createSessionContinuityApp());
    const anonymous = await agent.get("/test/session");
    const seed = await agent.post("/test/seed").type("form").send({ _csrf: anonymous.body.csrfToken });

    expect(seed.status).toBe(204);

    const login = await agent
      .post("/login")
      .type("form")
      .send({ username: USER.username, password: "correct-password", _csrf: anonymous.body.csrfToken });
    const authenticated = await agent.get("/test/session");

    expect(login.status).toBe(302);
    expect(authenticated.body.sessionId).not.toBe(anonymous.body.sessionId);
    expect(authenticated.body.userId).toBe(USER.id);
    expect(authenticated.body.passport).toEqual({ user: USER.id });
    expect(authenticated.body.csrfToken).toBe(anonymous.body.csrfToken);
    expect(authenticated.body.cart).toEqual([{ bookId: BOOK_ID, quantity: 1 }]);
    expect(authenticated.body).not.toHaveProperty("chatHistory");
    expect(authenticated.body).not.toHaveProperty("returnTo");
    expect(authenticated.body).not.toHaveProperty("injectedRole");
    expect(authenticated.body).not.toHaveProperty("extra");

    const rejectedCartMutation = await agent
      .post("/cart/clear")
      .type("form")
      .send({ _csrf: "0".repeat(64) });
    const acceptedCartMutation = await agent
      .post("/cart/items")
      .type("form")
      .send({ bookId: BOOK_ID, quantity: 1, _csrf: anonymous.body.csrfToken });

    expect(rejectedCartMutation.status).toBe(403);
    expect(acceptedCartMutation.status).toBe(200);
    expect(acceptedCartMutation.body).toEqual({ ok: true, cartCount: 2 });

    const beforeLogout = await agent.get("/test/session");
    const logout = await agent
      .post("/logout")
      .type("form")
      .send({ _csrf: anonymous.body.csrfToken });
    const loggedOut = await agent.get("/test/session");

    expect(logout.status).toBe(302);
    expect(loggedOut.body.sessionId).not.toBe(beforeLogout.body.sessionId);
    expect(loggedOut.body).not.toHaveProperty("userId");
    expect(loggedOut.body).not.toHaveProperty("passport");
    expect(loggedOut.body.csrfToken).toBe(anonymous.body.csrfToken);
    expect(loggedOut.body.cart).toEqual([{ bookId: BOOK_ID, quantity: 2 }]);
  });

  it("keeps the existing guest session when credentials are rejected", async () => {
    const agent = request.agent(createSessionContinuityApp());
    const anonymous = await agent.get("/test/session");
    const failedLogin = await agent
      .post("/login")
      .type("form")
      .send({ username: USER.username, password: "wrong-password", _csrf: anonymous.body.csrfToken });
    const afterFailure = await agent.get("/test/session");

    expect(failedLogin.status).toBe(302);
    expect(afterFailure.body.sessionId).toBe(anonymous.body.sessionId);
    expect(afterFailure.body.csrfToken).toBe(anonymous.body.csrfToken);
    expect(afterFailure.body).not.toHaveProperty("userId");
  });
});
