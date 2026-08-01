const mongoose = require("mongoose");

const isValidBookId = (bookId) => mongoose.Types.ObjectId.isValid(bookId);

function assertBookId(bookId) {
  if (!isValidBookId(bookId)) throw new Error("Invalid book id");
}

function assertQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");
}

function assertStock(quantity, stock) {
  if (quantity > stock) throw new Error("Quantity exceeds available stock");
}

function addItem(cart = [], bookId, quantity, stock) {
  assertBookId(bookId);
  assertQuantity(quantity);
  assertStock(quantity, stock);
  const existing = cart.find((item) => item.bookId === bookId);
  const nextQuantity = (existing?.quantity || 0) + quantity;
  assertStock(nextQuantity, stock);
  return existing
    ? cart.map((item) => item.bookId === bookId ? { ...item, quantity: nextQuantity } : { ...item })
    : [...cart.map((item) => ({ ...item })), { bookId, quantity }];
}

function updateItem(cart = [], bookId, quantity, stock) {
  assertBookId(bookId);
  assertQuantity(quantity);
  assertStock(quantity, stock);
  return cart
    .filter((item) => item.bookId !== bookId)
    .concat(cart.some((item) => item.bookId === bookId) ? [{ bookId, quantity }] : [])
    .map((item) => ({ ...item }));
}

function removeItem(cart = [], bookId) {
  assertBookId(bookId);
  return cart.filter((item) => item.bookId !== bookId).map((item) => ({ ...item }));
}

function getCartCount(cart = []) {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Price must be a non-negative number");
  return Math.round(amount * 100);
}

function buildCartView({ cart = [], books = [] }) {
  const booksById = new Map(books.map((book) => [String(book._id), book]));
  const items = [];
  let removedCount = 0;
  for (const entry of cart) {
    const book = booksById.get(String(entry.bookId));
    if (!book) {
      removedCount += 1;
      continue;
    }
    const quantity = Math.min(entry.quantity, book.stock);
    if (quantity <= 0) {
      removedCount += 1;
      continue;
    }
    items.push({ book, quantity, subtotalCents: toCents(book.price) * quantity });
  }
  const totalCents = items.reduce((total, item) => total + item.subtotalCents, 0);
  return { items, totalCents, total: totalCents / 100, removedCount };
}

module.exports = {
  addItem,
  updateItem,
  removeItem,
  getCartCount,
  isValidBookId,
  toCents,
  buildCartView,
};
