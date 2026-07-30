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

dns.setServers(["1.1.1.1", "1.0.0.1"]);

async function start() {
  if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) throw new Error("MONGODB_URI and SESSION_SECRET are required. Copy .env.example to .env and configure it.");
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureAdmin({ User, bcrypt });
  const recommendationClient = createRecommendationClient({ Book });
  const app = createApp({ sessionStore: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }), recommendationClient });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`Library + AI is running on http://localhost:${port}`);
    recommendationClient.refreshBooks().catch((error) => console.error(`AI index is unavailable: ${error.message}`));
  });
}

start().catch((error) => { console.error(error.message); process.exit(1); });
