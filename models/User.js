const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 30 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["member", "admin"], default: "member" },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
