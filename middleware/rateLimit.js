function createRateLimiter({ windowMs = 60000, max = 20, maxEntries = 10000 } = {}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error("Rate-limit window must be a positive integer.");
  if (!Number.isInteger(max) || max <= 0) throw new Error("Rate-limit max must be a positive integer.");
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error("Rate-limit entry limit must be a positive integer.");
  const entries = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = entries.get(key);
    const entry = current && now - current.startedAt < windowMs ? current : { startedAt: now, count: 0 };
    entry.count += 1;
    entries.set(key, entry);
    if (entries.size > maxEntries) {
      for (const [entryKey, value] of entries) {
        if (now - value.startedAt >= windowMs) entries.delete(entryKey);
      }
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    }
    if (entry.count > max) return res.status(429).json({ error: "Too many requests. Please try again later." });
    return next();
  };
}

module.exports = { createRateLimiter };
