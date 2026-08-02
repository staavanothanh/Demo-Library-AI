require("dotenv").config();

const dns = require("node:dns");
const mongoose = require("mongoose");
const { MongoStore } = require("connect-mongo");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Book = require("./models/Book");
const { createApp } = require("./app");
const { createRecommendationClient } = require("./services/recommendationClient");
const { ensureAdmin } = require("./services/adminProvisioning");
const { createCatalogStartupRetry } = require("./services/catalogStartupRetry");

dns.setServers(["1.1.1.1", "1.0.0.1"]);

const positiveIntegerEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

async function start() {
  if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) throw new Error("MONGODB_URI and SESSION_SECRET are required. Copy .env.example to .env and configure it.");
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureAdmin({ User, bcrypt });
  const recommendationClient = createRecommendationClient({ Book });
  const sessionStore = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
  const app = createApp({ sessionStore, recommendationClient });
  const port = Number(process.env.PORT || 3000);
  const startupRetry = createCatalogStartupRetry({
    refreshBooks: () => recommendationClient.refreshBooks(),
    baseDelayMs: positiveIntegerEnv("CATALOG_STARTUP_RETRY_BASE_MS", 1000),
    maxDelayMs: positiveIntegerEnv("CATALOG_STARTUP_RETRY_MAX_MS", 30000),
    maxAttempts: positiveIntegerEnv("CATALOG_STARTUP_RETRY_ATTEMPTS", 5),
    logger: {
      info: (message) => console.info(message),
      error: (message) => console.error(message),
    },
  });
  const httpServer = app.listen(port, "0.0.0.0", () => {
    console.log(`Library + AI is running on http://localhost:${port}`);
    startupRetry.start().catch(() => console.error("AI startup retry could not start."));
  });
  let shutdownPromise;
  const shutdown = async () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      startupRetry.stop();
      await recommendationClient.stop();
      await new Promise((resolve) => httpServer.close(resolve));
      await sessionStore.close();
      await mongoose.disconnect();
    })();
    return shutdownPromise;
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { app, httpServer, startupRetry, shutdown };
}

if (require.main === module) {
  start().catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { positiveIntegerEnv, start };
