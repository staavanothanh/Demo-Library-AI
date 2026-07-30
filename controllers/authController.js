function createAuthController({ User, bcrypt }) {
  return {
    register: async (req, res, next) => {
      try {
        const username = req.body.username.trim().toLowerCase();
        if (await User.exists({ username })) return res.status(409).render("register", { errors: [{ msg: "That username is already in use." }], values: req.body });
        await User.create({ username, passwordHash: await bcrypt.hash(req.body.password, 12), role: "member" });
        return res.redirect("/login?message=Registration successful. Please sign in.");
      } catch (error) { return next(error); }
    },
    afterLogin: (req, res) => res.redirect("/booklist"),
    logout: (req, res, next) => req.logout((error) => error ? next(error) : res.redirect("/?message=You have been logged out.")),
  };
}

module.exports = { createAuthController };
