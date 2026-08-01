const mongoose = require("mongoose");
const { createCommentController } = require("../controllers/commentController");

describe("comment creation", () => {
  it("creates a comment with the authenticated user and redirects to the book", async () => {
    const bookId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    let created;
    const Comment = { create: async (payload) => { created = payload; return payload; } };
    const Book = { exists: async (filter) => String(filter._id) === bookId };
    const controller = createCommentController({ Comment, Book });
    const req = { params: { id: bookId }, body: { body: "  Great read.  " }, user: { _id: userId } };
    const response = { redirect: (path) => path };

    const result = await controller.create(req, response, (error) => { throw error; });

    expect(created).toEqual({ bookId, userId, body: "Great read." });
    expect(result).toBe(`/books/${bookId}`);
  });

  it("rejects empty or oversized comment bodies", async () => {
    const controller = createCommentController({ Comment: {}, Book: { exists: async () => true } });
    const response = { status: (code) => { response.code = code; return response; }, json: (body) => body };

    const empty = await controller.create({ params: { id: new mongoose.Types.ObjectId().toString() }, body: { body: "   " }, user: { _id: "user" } }, response);
    const oversized = await controller.create({ params: { id: new mongoose.Types.ObjectId().toString() }, body: { body: "x".repeat(1001) }, user: { _id: "user" } }, response);

    expect(response.code).toBe(400);
    expect(empty.error).toBe("Comment must contain 1–1000 characters.");
    expect(oversized.error).toBe("Comment must contain 1–1000 characters.");
  });
});
