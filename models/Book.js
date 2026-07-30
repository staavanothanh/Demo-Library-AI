const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  bookID: Number,
  title: { type: String, required: true, trim: true, index: true },
  authors: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  genre: { type: String, default: "" },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  ratingsCount: { type: Number, default: 0 },
  textReviewsCount: { type: Number, default: 0 },
  publicationDate: { type: String, default: "" },
  publisher: { type: String, default: "" },
}, { timestamps: true, collection: "booksforai" });

module.exports = mongoose.model("Book", bookSchema);
