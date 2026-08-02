function createAdminController({ Book, recommendationClient }) {
  return {
    redirectAdmin: (req, res) => res.redirect("/admin-dashboard"),
    showDashboard: (req, res) => res.render("admin-dashboard", { errors: [], values: {} }),
    addBook: async (req, res, next) => {
      try {
        await Book.create({
          title: req.body.title.trim(),
          authors: req.body.authors.trim(),
          description: req.body.description.trim(),
          genre: req.body.genre?.trim(),
          publisher: req.body.publisher?.trim(),
          publicationDate: req.body.publicationDate?.trim(),
          averageRating: Number(req.body.averageRating) || 0,
          price: Number(req.body.price),
          stock: Number(req.body.stock),
          coverUrl: req.body.coverUrl?.trim() || "",
        });
        try {
          await recommendationClient.refreshBooks();
        } catch (error) {
          console.error(`Book persisted but AI index refresh failed: ${error.message}`);
          return res.redirect("/admin-dashboard?message=Book added. AI index refresh is pending.");
        }
        return res.redirect("/admin-dashboard?message=Book added and AI index refreshed.");
      } catch (error) { return next(error); }
    },
  };
}

module.exports = { createAdminController };
