const mongoose = require("mongoose");

const CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function copyCart(cart) {
  if (!Array.isArray(cart)) return undefined;
  return cart.reduce((entries, entry) => {
    if (!entry || !mongoose.Types.ObjectId.isValid(entry.bookId) || !Number.isSafeInteger(entry.quantity) || entry.quantity <= 0) return entries;
    entries.push({ bookId: String(entry.bookId), quantity: entry.quantity });
    return entries;
  }, []);
}

function snapshotSupportedSessionState(session = {}) {
  const snapshot = {};
  const cart = copyCart(session.cart);
  if (cart) snapshot.cart = cart;
  if (typeof session.csrfToken === "string" && CSRF_TOKEN_PATTERN.test(session.csrfToken)) snapshot.csrfToken = session.csrfToken;
  return snapshot;
}

function restoreSupportedSessionState(session, snapshot = {}) {
  if (!session || !snapshot || typeof snapshot !== "object") return session;
  if (Object.prototype.hasOwnProperty.call(snapshot, "cart") && Array.isArray(snapshot.cart)) {
    session.cart = snapshot.cart.map(({ bookId, quantity }) => ({ bookId: String(bookId), quantity }));
  }
  if (typeof snapshot.csrfToken === "string" && CSRF_TOKEN_PATTERN.test(snapshot.csrfToken)) session.csrfToken = snapshot.csrfToken;
  return session;
}

module.exports = {
  CSRF_TOKEN_PATTERN,
  snapshotSupportedSessionState,
  restoreSupportedSessionState,
};
