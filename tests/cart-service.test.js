const mongoose = require("mongoose");
const { buildCartView, toCents } = require("../services/cartService");

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
});
