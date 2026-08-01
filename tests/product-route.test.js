const express = require("express");
const request = require("supertest");
const { createCatalogRoutes } = require("../routes/catalogRoutes");

describe("public product routes", () => {
  it("serves the canonical public books path and compatibility alias", async () => {
    const app = express();
    const controller = {
      home: (req, res) => res.send("home"),
      listBooks: (req, res) => res.status(200).json({ path: req.path }),
      showBook: (req, res) => res.status(200).json({ id: req.params.id }),
    };
    app.use(createCatalogRoutes({ controller }));

    const [books, alias, detail] = await Promise.all([
      request(app).get("/books"),
      request(app).get("/booklist"),
      request(app).get("/books/507f1f77bcf86cd799439011"),
    ]);

    expect(books.status).toBe(200);
    expect(alias.status).toBe(200);
    expect(detail.body.id).toBe("507f1f77bcf86cd799439011");
  });
});
