const mongoose = require("mongoose");
const { createCatalogController } = require("../controllers/catalogController");

describe("catalog product details", () => {
  it("rejects malformed ids without querying MongoDB", async () => {
    const Book = { findById: () => { throw new Error("should not query"); } };
    const controller = createCatalogController({ Book });
    const response = { status: () => response, render: (view, data) => ({ view, data }) };

    const result = await controller.showBook({ params: { id: "not-an-id" } }, response);

    expect(result.view).toBe("error");
    expect(result.data.status).toBe(404);
  });

  it("renders a canonical book when the ObjectId exists", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const book = { _id: id, title: "Test Book" };
    const Book = { findById: (value) => value === id ? { lean: async () => book } : { lean: async () => null } };
    const controller = createCatalogController({ Book });
    const response = { render: (view, data) => ({ view, data }) };

    const result = await controller.showBook({ params: { id } }, response, (error) => { throw error; });

    expect(result).toEqual({ view: "book-detail", data: { book, comments: [] } });
  });
});
