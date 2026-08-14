// ============================================================
// utils/ApiError.js — Custom Error Class
//
// When something goes wrong in a controller or service,
// we throw an ApiError instead of a plain Error.
// This lets the global error handler (errorHandler.js) know
// it was an expected error and respond with the right HTTP status.
//
// Usage:
//   throw new ApiError(404, "User not found");
//   throw new ApiError(400, "Email already exists");
// ============================================================

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);            // Pass message to the built-in Error class
    this.statusCode = statusCode;
    this.isOperational = true; // Marks this as a known, handled error
  }
}

module.exports = ApiError;