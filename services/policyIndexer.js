const crypto = require("node:crypto");

function chunkMarkdown(markdown, maxLength = 800) {
  const paragraphs = String(markdown).split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
    } else if ((current.length + paragraph.length + 2) <= maxLength) {
      current = `${current}\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function hashContent(content) {
  return crypto.createHash("sha256").update(String(content)).digest("hex");
}

async function deleteStaleChunks({ files, KnowledgeChunk }) {
  const sources = files.map((file) => file.source);
  if (!sources.length) throw new Error("At least one policy document is required for stale cleanup.");
  if (typeof KnowledgeChunk.deleteMany !== "function") return 0;

  let deleted = 0;
  const removedSources = await KnowledgeChunk.deleteMany({ category: "policy", source: { $nin: sources } });
  deleted += Number(removedSources.deletedCount || 0);

  for (const file of files) {
    const chunkCount = chunkMarkdown(file.content).length;
    const result = await KnowledgeChunk.deleteMany({ category: "policy", source: file.source, chunkIndex: { $gte: chunkCount } });
    deleted += Number(result.deletedCount || 0);
  }
  return deleted;
}

async function indexPolicyDocuments({ files, KnowledgeChunk, embeddingClient }) {
  if (!Array.isArray(files) || !files.length) throw new Error("At least one policy document is required.");
  let indexed = 0;
  for (const file of files) {
    const chunks = chunkMarkdown(file.content);
    for (const [chunkIndex, content] of chunks.entries()) {
      const embedding = await embeddingClient.embed(content);
      await KnowledgeChunk.updateOne(
        { category: "policy", source: file.source, chunkIndex },
        { $set: { source: file.source, category: "policy", title: file.title || file.source, content, chunkIndex, contentHash: hashContent(content), embedding } },
        { upsert: true },
      );
      indexed += 1;
    }
  }
  const deleted = await deleteStaleChunks({ files, KnowledgeChunk });
  return { indexed, deleted };
}

module.exports = { chunkMarkdown, hashContent, deleteStaleChunks, indexPolicyDocuments };
