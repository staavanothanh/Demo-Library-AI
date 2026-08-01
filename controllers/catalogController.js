const SORTS = {
  title: { title: 1, _id: 1 },
  "price-asc": { price: 1, title: 1, _id: 1 },
  "price-desc": { price: -1, title: 1, _id: 1 },
  rating: { averageRating: -1, title: 1, _id: 1 },
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
}

function parseCatalogQuery(input = {}) {
  const page = Number.parseInt(input.page, 10);
  const requestedLimit = Number.parseInt(input.limit, 10);
  const sort = Object.prototype.hasOwnProperty.call(SORTS, input.sort) ? input.sort : "title";
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(requestedLimit) ? Math.min(48, Math.max(1, requestedLimit)) : 12,
    q: typeof input.q === "string" ? input.q.trim().slice(0, 120) : "",
    genre: typeof input.genre === "string" ? input.genre.trim().slice(0, 80) : "",
    sort,
  };
}

function buildCatalogFilter(query = "", genre = "") {
  const filter = {};
  if (query) {
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ title: pattern }, { authors: pattern }, { genre: pattern }];
  }
  if (genre) filter.genre = genre;
  return filter;
}

function createCatalogController({ Book }) {
  return {
    home: (req, res) => res.render("home"),
    listBooks: async (req, res, next) => {
      try {
        const query = parseCatalogQuery(req.query);
        const filter = buildCatalogFilter(query.q, query.genre);
        const totalBooks = await Book.countDocuments(filter);
        const totalPages = Math.max(1, Math.ceil(totalBooks / query.limit));
        const currentPage = Math.min(query.page, totalPages);
        const books = await Book.find(filter).sort(SORTS[query.sort]).skip((currentPage - 1) * query.limit).limit(query.limit).lean();
        return res.render("booklist", { books, query: query.q, filters: query, currentPage, totalPages, totalBooks, pageSize: query.limit });
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createCatalogController, escapeRegex, parseCatalogQuery, buildCatalogFilter, SORTS };
