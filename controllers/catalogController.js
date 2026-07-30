function createCatalogController({ Book }) {
  return {
    home: (req, res) => res.render("home"),
    listBooks: async (req, res, next) => {
      try {
        const query = req.query.q?.trim();
        const filter = query ? { $or: [{ title: new RegExp(query, "i") }, { authors: new RegExp(query, "i") }, { genre: new RegExp(query, "i") }] } : {};
        return res.render("booklist", { books: await Book.find(filter).sort({ title: 1 }).limit(60).lean(), query: query || "" });
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCatalogController };
