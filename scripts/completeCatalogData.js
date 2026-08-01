const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(__dirname, "..", "data", "books.json");
const books = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const completed = books.map((book) => ({
  ...book,
  price: typeof book.price === "number" ? book.price : Number((9.99 + ((book.bookID * 3.17) % 40)).toFixed(2)),
  stock: Number.isInteger(book.stock) ? book.stock : 5 + (book.bookID % 16),
  coverUrl: typeof book.coverUrl === "string" ? book.coverUrl : "",
}));
fs.writeFileSync(dataPath, `${JSON.stringify(completed, null, 2)}\n`);
console.log(`Completed commerce fields for ${completed.length} seeded books.`);
