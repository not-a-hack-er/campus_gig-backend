// ============================================================
// middleware/auth.js — JWT Authentication Guard
//
// This middleware protects routes that require a logged-in user.
// It reads the JWT token from the request header, verifies it,
// and attaches the user's profile to req.user so controllers can use it.
//
// Security improvements over naive JWT-only checks:
//   1. Verifies JWT signature & expiry (as before)
//   2. Queries the database to confirm the user still EXISTS
//   3. Checks user.isActive === true so banned/deactivated accounts
//      cannot use their still-valid token for up to 7 days.
//
// Usage in routes:
//   router.get("/me", protect, getMyProfileController);
//
// Expected header from the client:
//   Authorization: Bearer <your-jwt-token>
// ============================================================

const jwt      = require("jsonwebtoken");
const { env }  = require("../config/env");
const ApiError = require("../utils/ApiError");
const User     = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check that the header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Authentication Required");
    }

    // Extract the token from "Bearer <token>"
    const token = authHeader.split(" ")[1];

    // Step 1: Verify the JWT signature and expiry
    // jwt.verify throws if token is invalid, expired, or tampered
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return next(new ApiError(401, "Token Expired"));
      }
      return next(new ApiError(401, "Invalid Token"));
    }

    // Step 2: Confirm the user still exists in the database
    // This catches the case where a valid token is used after account deletion
    // We only select the minimal fields needed — no need to load full profile
    const user = await User.findById(decoded.id).select("_id isActive");

    if (!user) {
      return next(new ApiError(401, "Account not found. Please log in again."));
    }

    // Step 3: Check the account is still active
    // If an admin deactivates or bans an account, this blocks access immediately
    // without waiting for the JWT to naturally expire (up to 7 days)
    if (user.isActive === false) {
      return next(new ApiError(403, "Account is deactivated. Please contact support."));
    }

    // Attach minimal user info to the request
    req.user = { id: decoded.id };

    next(); // Proceed to the controller
  } catch (error) {
    next(error);
  }
};

module.exports = protect;
