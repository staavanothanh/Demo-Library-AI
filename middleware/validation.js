const { validationResult } = require("express-validator");

const renderForm = (view) => (req, res) => res.render(view, { errors: [], values: {} });
const showValidation = (view) => (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const values = {};
  if (typeof req.body.username === "string") values.username = req.body.username;
  const safeErrors = errors.array().map(({ value, ...error }) => error);
  return res.status(422).render(view, { errors: safeErrors, values });
};

module.exports = { renderForm, showValidation, validationResult };
