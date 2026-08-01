const mongoose = require("mongoose");
const Comment = require("../models/Comment");

describe("comment model", () => {
  it("references books/users and constrains body length", () => {
    expect(Comment.schema.path("bookId").options.ref).toBe("Book");
    expect(Comment.schema.path("userId").options.ref).toBe("User");
    expect(Comment.schema.path("body").options).toMatchObject({ required: true, trim: true, minlength: 1, maxlength: 1000 });
    expect(Comment.schema.indexes()).toEqual(expect.arrayContaining([
      [
        { bookId: 1, createdAt: -1 },
        expect.any(Object),
      ],
    ]));
    expect(mongoose.model("Comment")).toBe(Comment);
  });
});
