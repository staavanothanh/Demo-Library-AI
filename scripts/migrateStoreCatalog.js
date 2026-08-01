require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const mongoose = require("mongoose");
const Book = require("../models/Book");

function defaultPrice(book) {
  return Number((9.99 + ((Number(book.bookID || 0) * 3.17) % 40)).toFixed(2));
}

function defaultStock(book) {
  return 5 + (Number(book.bookID || 0) % 16);
}

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Create .env from .env.example first.");
  await mongoose.connect(process.env.MONGODB_URI);
  const books = await Book.find({}).lean();
  let changed = 0;
  for (const book of books) {
    const update = {};
    if (typeof book.price !== "number" || book.price < 0) update.price = defaultPrice(book);
    if (!Number.isInteger(book.stock) || book.stock < 0) update.stock = defaultStock(book);
    if (typeof book.coverUrl !== "string") update.coverUrl = "";
    if (Object.keys(update).length) {
      await Book.updateOne({ _id: book._id }, { $set: update });
      changed += 1;
    }
  }
  console.log(`Migrated ${changed} of ${books.length} books in the books collection.`);
  await mongoose.disconnect();
}

migrate().catch((error) => { console.error(error.message); process.exit(1); });

module.exports = { defaultPrice, defaultStock };
