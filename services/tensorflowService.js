const tf = require("@tensorflow/tfjs");
const use = require("@tensorflow-models/universal-sentence-encoder");

let model;
let cachedBooks = [];
let cachedEmbeddings;

async function loadModel() {
  if (!model) model = await use.load();
  return model;
}

async function embedTexts(texts) {
  const encoder = await loadModel();
  if (!texts.length) return [];
  const embeddings = await encoder.embed(texts);
  const values = await embeddings.array();
  embeddings.dispose();
  return values;
}

async function loadBooks(books) {
  const encoder = await loadModel();
  const nextBooks = books.map((book) => ({ ...book, _id: String(book._id) }));
  const texts = nextBooks.map((book) => `${book.title || ""}. ${book.authors || ""}. ${book.genre || ""}. ${book.description || ""}`.trim());
  const nextEmbeddings = texts.length ? await encoder.embed(texts) : undefined;
  const previousEmbeddings = cachedEmbeddings;
  cachedBooks = nextBooks;
  cachedEmbeddings = nextEmbeddings;
  previousEmbeddings?.dispose();
  return { response: `AI index is ready for ${cachedBooks.length} books.`, books: [] };
}

async function recommend(prompt) {
  if (!cachedEmbeddings || !cachedBooks.length) throw new Error("The recommendation index is still loading. Please try again shortly.");
  const encoder = await loadModel();
  const queryEmbedding = await encoder.embed([prompt]);
  const scores = tf.tidy(() => {
    const queryNorm = queryEmbedding.norm(2, 1, true);
    const bookNorms = cachedEmbeddings.norm(2, 1, true);
    return cachedEmbeddings.matMul(queryEmbedding.transpose()).div(bookNorms.mul(queryNorm)).squeeze().arraySync();
  });
  queryEmbedding.dispose();
  const scoreList = Array.isArray(scores) ? scores : [scores];
  const books = cachedBooks
    .map((book, index) => ({ _id: String(book._id), title: book.title, authors: book.authors, genre: book.genre, score: Number(scoreList[index].toFixed(3)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  return { response: books.length ? "Here are books that best match your request." : "No matching books were found.", books };
}

module.exports = { loadBooks, recommend, embedTexts };
