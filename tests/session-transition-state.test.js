const mongoose = require("mongoose");
const {
  snapshotSupportedSessionState,
  restoreSupportedSessionState,
} = require("../services/sessionTransitionState");

describe("session transition state", () => {
  it("copies only valid cart entries and a valid CSRF token", () => {
    const firstBookId = new mongoose.Types.ObjectId().toString();
    const secondBookId = new mongoose.Types.ObjectId().toString();
    const session = {
      csrfToken: "a".repeat(64),
      chatPreferredLanguage: "vi",
      cart: [
        { bookId: firstBookId, quantity: 2, price: 99, injected: true },
        { bookId: secondBookId, quantity: 1 },
        { bookId: "invalid", quantity: 1 },
        { bookId: firstBookId, quantity: 0 },
        { bookId: firstBookId, quantity: 1.5 },
      ],
      chatHistory: [{ role: "user", content: "private" }],
      passport: { user: "old-user" },
      role: "admin",
    };

    const snapshot = snapshotSupportedSessionState(session);
    const restored = {};
    restoreSupportedSessionState(restored, snapshot);

    expect(restored).toEqual({
      csrfToken: "a".repeat(64),
      chatPreferredLanguage: "vi",
      cart: [
        { bookId: firstBookId, quantity: 2 },
        { bookId: secondBookId, quantity: 1 },
      ],
    });
    expect(restored.cart).not.toBe(session.cart);
    expect(restored.cart[0]).not.toBe(session.cart[0]);
  });

  it("does not restore malformed tokens or unsupported session fields", () => {
    const snapshot = snapshotSupportedSessionState({
      csrfToken: "not-a-token",
      chatHistory: ["do not copy"],
      returnTo: "/admin",
      role: "admin",
      chatPreferredLanguage: "fr",
      passport: { user: "old-user" },
    });
    const restored = { existing: true };

    restoreSupportedSessionState(restored, snapshot);

    expect(restored).toEqual({ existing: true });
  });

  it("intentionally preserves an empty cart without sharing the original array", () => {
    const snapshot = snapshotSupportedSessionState({ csrfToken: "b".repeat(64), cart: [] });
    const restored = {};

    restoreSupportedSessionState(restored, snapshot);

    expect(restored.cart).toEqual([]);
    expect(restored.cart).not.toBe(snapshot.cart);
  });
});
