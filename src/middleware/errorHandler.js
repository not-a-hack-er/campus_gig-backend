// ============================================================
// middleware/errorHandler.js — Global Error Handler
//
// This is the last middleware in app.js.
// Any error thrown anywhere in the app (controllers, services)
// eventually reaches here via next(error).
//
// It handles:
//   - Invalid MongoDB ID format (CastError)
//   - Duplicate database values (e.g. duplicate email)
//   - Mongoose validation failures
//   - Our own ApiError (expected business errors)
//   - Unexpected/unknown errors (shown safely)
// ============================================================

const ApiError = require("../utils/ApiError");
const { env }  = require("../config/env");
const logger   = require("../config/logger");

const errorHandler = (err, req, res, next) => {
  // Structured log — includes method, url, and error details.
  // In production this emits JSON. In dev it's pretty-printed.
  logger.error({
    err: {
      message: err.message,
      name:    err.name,
      code:    err.code,
      // Stack only logged in non-production to avoid log flooding
      ...(env.NODE_ENV !== "production" && { stack: err.stack }),
    },
    req: {
      method: req.method,
      url:    req.originalUrl,
      ip:     req.ip,
    },
  }, "Request error");

  // ── Invalid MongoDB ID (e.g. /gigs/not-an-id) ────────────────────────
  if (err.name === "CastError") {
    return res.status(400).json({
      success:   false,
      message:   "Invalid ID format",
      code:      "INVALID_ID",
      timestamp: new Date().toISOString(),
    });
  }

  // ── Duplicate database value (e.g. email already registered) ─────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success:   false,
      message:   `${field} already exists`,
      code:      "DUPLICATE_KEY",
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose schema validation failed ─────────────────────────────────
  if (err.name === "ValidationError") {
    // Build a readable map of which fields failed and why
    const details = {};
    Object.keys(err.errors).forEach((key) => {
      details[key] = err.errors[key].message;
    });
    return res.status(400).json({
      success:   false,
      message:   "Validation failed",
      code:      "VALIDATION_ERROR",
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Known business error (thrown with new ApiError(...)) ─────────────
  if (err instanceof ApiError && err.isOperational) {
    return res.status(err.statusCode).json({
      success:   false,
      message:   err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Unexpected / unknown error ────────────────────────────────────────
  // Never expose internal details in production
  return res.status(500).json({
    success:   false,
    message:   env.NODE_ENV === "development" ? err.message : "Internal server error",
    code:      "INTERNAL_ERROR",
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};

module.exports = errorHandler;