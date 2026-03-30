'use strict';

const { validationResult } = require('express-validator');

/**
 * Reads the result of express-validator checks accumulated on `req` and, if
 * there are any failures, terminates the request with a 422 response that
 * lists each field error.  When all checks pass it calls next() so the route
 * handler can proceed.
 *
 * Usage:
 *   router.post('/path', [
 *     body('email').isEmail(),
 *     body('name').notEmpty(),
 *     validate,
 *     controllerFn,
 *   ]);
 */
function validate(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((err) => ({
    field: err.type === 'field' ? err.path : err.type,
    message: err.msg,
    value: err.type === 'field' ? err.value : undefined,
    location: err.location,
  }));

  return res.status(422).json({
    success: false,
    error: 'Validation failed. Please check the submitted data.',
    details: errors,
  });
}

module.exports = { validate };
