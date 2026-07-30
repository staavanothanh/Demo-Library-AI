require("dotenv").config();
const mongoose = require("mongoose");
const Book = require("../models/Book");

const books = [
  { bookID: 1, title: "Node.js Design Patterns", authors: "Mario Casciaro and Luciano Mammino", description: "A practical guide to building scalable, maintainable Node.js applications with asynchronous patterns and modern JavaScript.", genre: "Programming", averageRating: 4.6, publisher: "Packt", publicationDate: "2020" },
  { bookID: 2, title: "Eloquent JavaScript", authors: "Marijn Haverbeke", description: "A clear introduction to JavaScript programming, browser applications, Node.js, and language fundamentals.", genre: "Programming", averageRating: 4.5, publisher: "No Starch Press", publicationDate: "2024" },
  { bookID: 3, title: "MongoDB: The Definitive Guide", authors: "Shannon Bradshaw, Eoin Brazil, and Kristina Chodorow", description: "Learn MongoDB data modeling, queries, indexes, aggregation, replication, and application design.", genre: "Database", averageRating: 4.2, publisher: "O'Reilly Media", publicationDate: "2019" },
  { bookID: 4, title: "Designing Data-Intensive Applications", authors: "Martin Kleppmann", description: "An in-depth study of reliable, scalable, and maintainable systems, data storage, streams, and distributed architecture.", genre: "Software Engineering", averageRating: 4.8, publisher: "O'Reilly Media", publicationDate: "2017" },
  { bookID: 5, title: "Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow", authors: "Aurélien Géron", description: "A hands-on introduction to machine learning, neural networks, and TensorFlow with practical projects.", genre: "Artificial Intelligence", averageRating: 4.7, publisher: "O'Reilly Media", publicationDate: "2022" },
  { bookID: 6, title: "You Don't Know JS Yet", authors: "Kyle Simpson", description: "A deep exploration of JavaScript scope, closures, objects, asynchronous programming, and modern language features.", genre: "Programming", averageRating: 4.4, publisher: "Independently published", publicationDate: "2020" },
  { bookID: 7, title: "The Pragmatic Programmer", authors: "David Thomas and Andrew Hunt", description: "Timeless lessons on software craftsmanship, problem solving, communication, testing, and continuous learning.", genre: "Software Engineering", averageRating: 4.7, publisher: "Addison-Wesley", publicationDate: "2019" },
  { bookID: 8, title: "Clean Code", authors: "Robert C. Martin", description: "Principles for writing readable, maintainable, tested software through meaningful names, small functions, and clean design.", genre: "Software Engineering", averageRating: 4.3, publisher: "Prentice Hall", publicationDate: "2008" }
];

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Create .env from .env.example first.");
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(books.map((book) => Book.updateOne({ title: book.title }, { $set: book }, { upsert: true })));
  console.log(`Seeded ${books.length} books into Library.booksforai.`);
  await mongoose.disconnect();
}

seed().catch((error) => { console.error(error.message); process.exit(1); });
