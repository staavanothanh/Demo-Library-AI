const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
}, { timestamps: true, collection: "comments" });

commentSchema.index({ bookId: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
