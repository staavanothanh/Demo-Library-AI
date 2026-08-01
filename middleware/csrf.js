const crypto = require("node:crypto");

function createCsrfMiddleware() {
  const ensureToken = (req) => {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    return req.session.csrfToken;
  };

  return {
    exposeToken: (req, res, next) => {
      res.locals.csrfToken = ensureToken(req);
      return next();
    },
    requireToken: (req, res, next) => {
      const expected = ensureToken(req);
      const received = req.get("X-CSRF-Token") || req.body?._csrf || "";
      const expectedBuffer = Buffer.from(expected);
      const receivedBuffer = Buffer.from(String(received));
      const valid = expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
      if (!valid) return res.status(403).json({ error: "Invalid CSRF token." });
      return next();
    },
  };
}

module.exports = { createCsrfMiddleware };
