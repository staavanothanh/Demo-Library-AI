const mongoose = require("mongoose");
const { addItem, updateItem, removeItem, getCartCount, buildCartView, normalizeCart, toCents } = require("../services/cartService");

describe("server-side cart calculations", () => {
  it("builds canonical line items and integer-cent totals from books", () => {
    const firstId = new mongoose.Types.ObjectId().toString();
    const secondId = new mongoose.Types.ObjectId().toString();
    const result = buildCartView({
      cart: [
        { bookId: firstId, quantity: 2 },
        { bookId: secondId, quantity: 3 },
        { bookId: new mongoose.Types.ObjectId().toString(), quantity: 1 },
      ],
      books: [
        { _id: firstId, title: "First", price: 12.5, stock: 4 },
        { _id: secondId, title: "Second", price: 3.33, stock: 2 },
      ],
    });

    expect(result.items).toEqual([
      { book: { _id: firstId, title: "First", price: 12.5, stock: 4 }, quantity: 2, subtotalCents: 2500 },
      { book: { _id: secondId, title: "Second", price: 3.33, stock: 2 }, quantity: 2, subtotalCents: 666 },
    ]);
    expect(result.totalCents).toBe(3166);
    expect(result.total).toBe(31.66);
    expect(result.removedCount).toBe(1);
  });

  it("rounds currency to cents before multiplying", () => {
    expect(toCents(19.999)).toBe(2000);
    expect(toCents("4.20")).toBe(420);
  });

  it("normalizes malformed session carts without changing valid items", () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const secondValidId = new mongoose.Types.ObjectId().toString();
    const source = [
      { bookId: validId, quantity: 2 },
      { bookId: secondValidId, quantity: "1" },
      null,
      { bookId: "not-an-object-id", quantity: 1 },
      { bookId: validId, quantity: 0 },
      { bookId: validId, quantity: Number.MAX_SAFE_INTEGER + 1 },
      { bookId: validId, quantity: 1.5 },
    ];

    const result = addItem(source, validId, 1, 4);

    expect(source).toEqual([
      { bookId: validId, quantity: 2 },
      { bookId: secondValidId, quantity: "1" },
      null,
      { bookId: "not-an-object-id", quantity: 1 },
      { bookId: validId, quantity: 0 },
      { bookId: validId, quantity: Number.MAX_SAFE_INTEGER + 1 },
      { bookId: validId, quantity: 1.5 },
    ]);
    expect(result).toEqual([{ bookId: validId, quantity: 3 }, { bookId: secondValidId, quantity: 1 }]);
    expect(updateItem(null, validId, 1, 4)).toEqual([]);
    expect(() => updateItem([], validId, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1)).toThrow("Quantity must be a positive integer");
    expect(removeItem({ invalid: true }, validId)).toEqual([]);
    expect(getCartCount(null)).toBe(0);
    expect(getCartCount(source)).toBe(3);
  });

  it("coalesces duplicate valid book entries before downstream stock checks", () => {
    const validId = new mongoose.Types.ObjectId().toString();

    expect(normalizeCart([
      { bookId: validId, quantity: 2 },
      { bookId: validId, quantity: "3" },
    ])).toEqual([{ bookId: validId, quantity: 5 }]);
  });

  it("builds a safe view from malformed carts and clamps valid quantities to stock", () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const source = [
      { bookId: validId, quantity: 5 },
      null,
      { bookId: "not-an-object-id", quantity: 1 },
      { bookId: validId, quantity: 0 },
      { bookId: validId, quantity: Number.MAX_SAFE_INTEGER + 1 },
    ];

    const result = buildCartView({
      cart: source,
      books: [{ _id: validId, title: "First", price: 10, stock: 3 }],
    });

    expect(result.items).toEqual([
      { book: { _id: validId, title: "First", price: 10, stock: 3 }, quantity: 3, subtotalCents: 3000 },
    ]);
    expect(result.total).toBe(30);
    expect(result.removedCount).toBe(4);
    expect(buildCartView({ cart: null, books: null })).toEqual({ items: [], totalCents: 0, total: 0, removedCount: 0 });
  });
});
