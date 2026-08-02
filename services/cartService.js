const mongoose = require("mongoose");

const isValidBookId = (bookId) => mongoose.Types.ObjectId.isValid(bookId);

function normalizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  const quantitiesByBookId = new Map();
  for (const item of cart) {
    const bookId = typeof item?.bookId === "string" ? item.bookId : "";
    const quantity = typeof item?.quantity === "number" || (typeof item?.quantity === "string" && item.quantity.trim() !== "")
      ? Number(item.quantity)
      : Number.NaN;
    if (!isValidBookId(bookId) || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const totalQuantity = (quantitiesByBookId.get(bookId) || 0) + quantity;
    if (!Number.isSafeInteger(totalQuantity)) return [];
    quantitiesByBookId.set(bookId, totalQuantity);
  }
  return [...quantitiesByBookId].map(([bookId, quantity]) => ({ bookId, quantity }));
}

function assertBookId(bookId) {
  if (!isValidBookId(bookId)) throw new Error("Invalid book id");
}

function assertQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");
}

function assertStock(quantity, stock) {
  if (quantity > stock) throw new Error("Quantity exceeds available stock");
}

function addItem(cart = [], bookId, quantity, stock) {
  assertBookId(bookId);
  assertQuantity(quantity);
  assertStock(quantity, stock);
  const normalizedCart = normalizeCart(cart);
  const existing = normalizedCart.find((item) => item.bookId === bookId);
  const nextQuantity = (existing?.quantity || 0) + quantity;
  assertStock(nextQuantity, stock);
  return existing
    ? normalizedCart.map((item) => item.bookId === bookId ? { ...item, quantity: nextQuantity } : { ...item })
    : [...normalizedCart.map((item) => ({ ...item })), { bookId, quantity }];
}

function updateItem(cart = [], bookId, quantity, stock) {
  assertBookId(bookId);
  assertQuantity(quantity);
  assertStock(quantity, stock);
  const normalizedCart = normalizeCart(cart);
  return normalizedCart
    .filter((item) => item.bookId !== bookId)
    .concat(normalizedCart.some((item) => item.bookId === bookId) ? [{ bookId, quantity }] : [])
    .map((item) => ({ ...item }));
}

function removeItem(cart = [], bookId) {
  assertBookId(bookId);
  return normalizeCart(cart).filter((item) => item.bookId !== bookId).map((item) => ({ ...item }));
}

function getCartCount(cart = []) {
  return normalizeCart(cart).reduce((total, item) => total + item.quantity, 0);
}

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Price must be a non-negative number");
  return Math.round(amount * 100);
}

function buildCartView({ cart = [], books = [] }) {
  const booksById = new Map((Array.isArray(books) ? books : []).map((book) => [String(book._id), book]));
  const normalizedCart = normalizeCart(cart);
  const items = [];
  let removedCount = Array.isArray(cart) ? cart.length - normalizedCart.length : 0;
  for (const entry of normalizedCart) {
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
  normalizeCart,
  removeItem,
  getCartCount,
  isValidBookId,
  toCents,
  buildCartView,
};
