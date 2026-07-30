const { Strategy: LocalStrategy } = require("passport-local");

function configurePassport(passport, { User, bcrypt }) {
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

module.exports = { configurePassport };
