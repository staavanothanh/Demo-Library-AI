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

async function indexPolicyDocuments({ files, KnowledgeChunk, embeddingClient }) {
  let indexed = 0;
  for (const file of files) {
    const chunks = chunkMarkdown(file.content);
    for (const [chunkIndex, content] of chunks.entries()) {
      const embedding = await embeddingClient.embed(content);
      await KnowledgeChunk.updateOne(
        { source: file.source, chunkIndex },
        { $set: { source: file.source, category: "policy", title: file.title || file.source, content, chunkIndex, contentHash: hashContent(content), embedding } },
        { upsert: true },
      );
      indexed += 1;
    }
  }
  return { indexed };
}

module.exports = { chunkMarkdown, hashContent, indexPolicyDocuments };
