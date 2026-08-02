const { validationResult } = require("express-validator");

const valuesByView = {
  register: ["username"],
  "admin-dashboard": ["title", "authors", "description", "genre", "publisher", "publicationDate", "averageRating", "price", "stock", "coverUrl"],
};

const renderForm = (view) => (req, res) => res.render(view, { errors: [], values: {} });
const showValidation = (view) => (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const values = Object.fromEntries((valuesByView[view] || [])
    .flatMap((field) => typeof req.body?.[field] === "string" ? [[field, req.body[field]]] : []));
  const safeErrors = errors.array().map(({ value, ...error }) => error);
  return res.status(422).render(view, { errors: safeErrors, values });
};

module.exports = { renderForm, showValidation, validationResult };
