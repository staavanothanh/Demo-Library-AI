const { validationResult } = require("express-validator");

const renderForm = (view) => (req, res) => res.render(view, { errors: [], values: {} });
const showValidation = (view) => (req, res, next) => {
  const errors = validationResult(req);
  return errors.isEmpty() ? next() : res.status(422).render(view, { errors: errors.array(), values: req.body });
};

module.exports = { renderForm, showValidation, validationResult };
