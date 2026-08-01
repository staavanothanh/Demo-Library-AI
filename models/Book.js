const mongoose = require("mongoose");

const nonNegativeInteger = {
  validator: (value) => Number.isInteger(value) && value >= 0,
  message: "Value must be a non-negative integer.",
};

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
  price: { type: Number, required: true, default: 0, min: 0 },
  stock: { type: Number, required: true, default: 0, min: 0, validate: nonNegativeInteger },
  coverUrl: { type: String, default: "", trim: true },
}, { timestamps: true, collection: "books" });

module.exports = mongoose.model("Book", bookSchema);
