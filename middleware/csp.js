const helmet = require("helmet");

function createContentSecurityPolicy({ isDevelopment = process.env.NODE_ENV !== "production" } = {}) {
  return helmet.contentSecurityPolicy({
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'self'"],
      "form-action": ["'self'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'"],
      "img-src": ["'self'", "data:", "http:", "https:"],
      "connect-src": ["'self'"],
      "font-src": ["'self'", "data:"],
      "upgrade-insecure-requests": isDevelopment ? null : [],
    },
  });
}

module.exports = { createContentSecurityPolicy };
