require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const KnowledgeChunk = require("../models/KnowledgeChunk");
const { indexPolicyDocuments } = require("../services/policyIndexer");
const { createRecommendationClient } = require("../services/recommendationClient");
const Book = require("../models/Book");

async function readPolicyFiles() {
  const directory = path.join(__dirname, "..", "knowledge", "policies");
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith(".md")).sort();
  return Promise.all(names.map(async (name) => ({ source: name, title: name.replace(/\.md$/, ""), content: await fs.readFile(path.join(directory, name), "utf8") })));
}

async function indexPolicies() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(process.env.MONGODB_URI);
  const recommendationClient = createRecommendationClient({ Book });
  const files = await readPolicyFiles();
  const result = await indexPolicyDocuments({ files, KnowledgeChunk, embeddingClient: recommendationClient });
  console.log(`Indexed ${result.indexed} policy chunks and removed ${result.deleted || 0} stale chunks.`);
  await recommendationClient.stop();
  await mongoose.disconnect();
}

indexPolicies().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { readPolicyFiles };
