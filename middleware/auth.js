function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.redirect("/login?message=Please sign in to continue.");
}

function requireAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).render("error", { status: 403, message: "Administrator access is required." });
}

module.exports = { requireAuth, requireAdmin };
