const {
  snapshotSupportedSessionState,
  restoreSupportedSessionState,
} = require("../services/sessionTransitionState");

function createAuthController({ User, bcrypt }) {
  return {
    register: async (req, res, next) => {
      try {
        const username = req.body.username.trim().toLowerCase();
        if (await User.exists({ username })) return res.status(409).render("register", { errors: [{ msg: "That username is already in use." }], values: { username } });
        await User.create({ username, passwordHash: await bcrypt.hash(req.body.password, 12), role: "member" });
        return res.redirect("/login?message=Registration successful. Please sign in.");
      } catch (error) { return next(error); }
    },
    afterLogin: (req, res) => res.redirect("/books"),
    logout: (req, res, next) => {
      const transitionState = snapshotSupportedSessionState(req.session);
      return req.logout((error) => {
        if (error) return next(error);
        restoreSupportedSessionState(req.session, transitionState);
        return req.session.save((saveError) => saveError ? next(saveError) : res.redirect("/?message=You have been logged out."));
      });
    },
  };
}

module.exports = { createAuthController };
