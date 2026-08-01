function createRateLimiter({ windowMs = 60000, max = 20 } = {}) {
  const entries = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = entries.get(key);
    const entry = current && now - current.startedAt < windowMs ? current : { startedAt: now, count: 0 };
    entry.count += 1;
    entries.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: "Too many requests. Please try again later." });
    return next();
  };
}

module.exports = { createRateLimiter };
