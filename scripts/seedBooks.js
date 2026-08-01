require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const mongoose = require("mongoose");
const Book = require("../models/Book");
const books = require("../data/books.json");

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Create .env from .env.example first.");
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(books.map((book) => Book.updateOne({ title: book.title }, { $set: book }, { upsert: true })));
  console.log(`Seeded ${books.length} books into the books collection.`);
  await mongoose.disconnect();
}

seed().catch((error) => { console.error(error.message); process.exit(1); });
