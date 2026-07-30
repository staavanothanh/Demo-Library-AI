function createRecommendationController({ recommendationClient }) {
  return {
    showChat: (req, res) => res.render("tensorflowChat"),
    recommend: async (req, res, next) => {
      try { return res.json(await recommendationClient.recommend(req.body.prompt.trim())); } catch (error) { return next(error); }
    },
  };
}

module.exports = { createRecommendationController };
