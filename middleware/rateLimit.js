function createRateLimiter({ windowMs = 60000, max = 20, maxEntries = 10000, key = (req) => req.ip || req.socket?.remoteAddress || "unknown" } = {}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error("Rate-limit window must be a positive integer.");
  if (!Number.isInteger(max) || max <= 0) throw new Error("Rate-limit max must be a positive integer.");
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error("Rate-limit entry limit must be a positive integer.");
  if (typeof key !== "function") throw new Error("Rate-limit key must be a function.");
  const entries = new Map();
  const setHeaders = (res, remaining, resetSeconds) => {
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));
  };
  return (req, res, next) => {
    const rateLimitKey = String(key(req) || "unknown");
    const now = Date.now();
    for (const [entryKey, value] of entries) {
      if (now - value.startedAt >= windowMs) entries.delete(entryKey);
    }
    let entry = entries.get(rateLimitKey);
    if (!entry) {
      if (entries.size >= maxEntries) {
        setHeaders(res, 0, 1);
        res.setHeader("Retry-After", "1");
        return res.status(503).json({ error: "Rate limiter temporarily unavailable." });
      }
      entry = { startedAt: now, count: 0 };
      entries.set(rateLimitKey, entry);
    }
    entry.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((entry.startedAt + windowMs - now) / 1000));
    setHeaders(res, max - entry.count, resetSeconds);
    if (entry.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
