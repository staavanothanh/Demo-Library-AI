const mongoose = require("mongoose");

const knowledgeChunkSchema = new mongoose.Schema({
  source: { type: String, required: true, trim: true },
  category: { type: String, default: "policy", trim: true },
  title: { type: String, default: "", trim: true },
  content: { type: String, required: true, trim: true },
  chunkIndex: { type: Number, required: true, min: 0 },
  contentHash: { type: String, required: true, index: true },
  embedding: { type: [Number], required: true },
}, { timestamps: true, collection: "knowledge_chunks" });

knowledgeChunkSchema.index({ source: 1, chunkIndex: 1 }, { unique: true });

module.exports = mongoose.model("KnowledgeChunk", knowledgeChunkSchema);
