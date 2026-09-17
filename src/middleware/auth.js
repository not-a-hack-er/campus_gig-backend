// ============================================================
// middleware/auth.js — Dual Authentication Guard
//
// Supports two authentication systems simultaneously:
//
//   1. CLERK (Web Frontend)
//      Web users authenticate via Clerk. Their requests carry a Clerk
//      session token in the Authorization header. We verify it using
//      @clerk/express and look up the user by clerkUserId.
//
//   2. LEGACY JWT (Android App)
//      The Android app still uses the custom JWT flow. These requests
//      carry a JWT signed with JWT_SECRET. We verify with jsonwebtoken
//      and look up the user by MongoDB _id. Android users skip the
//      profileComplete check (they are always treated as complete).
//
// Strategy: try Clerk first (header must start with "Bearer ").
//   If the token is a Clerk session token → Clerk path.
//   If Clerk rejects it AND JWT_SECRET is configured → try JWT path.
//   If both fail → 401.
//
// Two exported middleware variants:
//   protect      — requires auth + profileComplete (for main app routes)
//   requireAuth  — requires auth only, no profileComplete check
//                  (used for POST /api/profile/complete and POST /api/auth/sync)
// ============================================================

const { createClerkClient, getAuth } = require("@clerk/express");
const jwt      = require("jsonwebtoken");
const { env }  = require("../config/env");
const ApiError = require("../utils/ApiError");
const User     = require("../models/User");

// Initialise the Clerk backend client once (singleton).
const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

// ── Helper: try to authenticate via Clerk ──────────────────────────────────────
// Returns the MongoDB User document on success, or null on failure.
const tryClerkAuth = async (req) => {
  try {
    // getAuth reads and verifies the Clerk session token from the request.
    // It returns { userId: clerkUserId } on success, or { userId: null } if
    // the request has no valid Clerk session.
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return null;

    // Look up our application user by Clerk ID
    const user = await User.findOne({ clerkUserId }).select("_id isActive profileComplete");
    return user || null;
  } catch {
    // Clerk threw (network error, bad token format, etc.) — fall through to JWT
    return null;
  }
};

// ── Helper: try to authenticate via legacy JWT (Android) ──────────────────────
// Returns the MongoDB User document on success, or null on failure.
const tryJwtAuth = async (req) => {
  if (!env.JWT_SECRET) return null; // JWT disabled in this deployment

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null; // Expired or invalid JWT
  }

  const user = await User.findById(decoded.id).select("_id isActive profileComplete");
  return user || null;
};

// ── Core auth resolver ────────────────────────────────────────────────────────
// Returns { user, source } where source is "clerk" | "jwt", or throws ApiError.
const resolveAuth = async (req) => {
  // 1. Try Clerk
  const clerkUser = await tryClerkAuth(req);
  if (clerkUser) {
    if (clerkUser.isActive === false) {
      throw new ApiError(403, "Account is deactivated. Please contact support.");
    }
    return { user: clerkUser, source: "clerk" };
  }

  // 2. Try legacy JWT (Android)
  const jwtUser = await tryJwtAuth(req);
  if (jwtUser) {
    if (jwtUser.isActive === false) {
      throw new ApiError(403, "Account is deactivated. Please contact support.");
    }
    return { user: jwtUser, source: "jwt" };
  }

  // 3. Both failed
  throw new ApiError(401, "Authentication Required");
};

// ── protect ───────────────────────────────────────────────────────────────────
// Full guard: authentication + profile completion.
// Android (JWT) users bypass the profileComplete check.
// Attaches: req.user = { id: ObjectId, source: "clerk"|"jwt" }
const protect = async (req, res, next) => {
  try {
    const { user, source } = await resolveAuth(req);

    // Enforce profile completion for web (Clerk) users only.
    // Android users are assumed to have completed their profile.
    if (source === "clerk" && !user.profileComplete) {
      return next(new ApiError(403, "Profile incomplete. Please complete your profile to continue."));
    }

    req.user = { id: user._id, source };
    next();
  } catch (error) {
    next(error);
  }
};

// ── requireAuth ───────────────────────────────────────────────────────────────
// Auth-only guard: no profileComplete check.
// Used for:
//   POST /api/auth/sync      (creates the MongoDB profile — user may not exist yet)
//   POST /api/profile/complete (the profile completion endpoint itself)
//
// KEY DIFFERENCE from protect:
//   If Clerk session is valid (has a clerkUserId), we pass through even if no
//   MongoDB User document exists yet. This is intentional — /api/auth/sync is
//   the endpoint that CREATES the MongoDB user (fallback when the webhook is slow).
//   Blocking it because the user doesn't exist would be a chicken-and-egg deadlock.
//
//   req.user.id will be null when the MongoDB profile doesn't exist yet.
//   Controllers that use requireAuth must handle that case.
const requireAuth = async (req, res, next) => {
  try {
    // 1. Try Clerk first
    let clerkUserId;
    try {
      ({ userId: clerkUserId } = getAuth(req));
    } catch {
      clerkUserId = null;
    }

    if (clerkUserId) {
      // Valid Clerk session — look up MongoDB user but don't fail if absent
      const user = await User.findOne({ clerkUserId }).select("_id isActive profileComplete");

      if (user?.isActive === false) {
        return next(new ApiError(403, "Account is deactivated. Please contact support."));
      }

      // Attach what we have. id is null when no MongoDB profile exists yet.
      req.user = { id: user?._id || null, clerkUserId, source: "clerk" };
      return next();
    }

    // 2. Fall back to JWT (Android)
    const jwtUser = await tryJwtAuth(req);
    if (jwtUser) {
      if (jwtUser.isActive === false) {
        return next(new ApiError(403, "Account is deactivated. Please contact support."));
      }
      req.user = { id: jwtUser._id, source: "jwt" };
      return next();
    }

    // 3. Both failed
    throw new ApiError(401, "Authentication Required");
  } catch (error) {
    next(error);
  }
};

module.exports = protect;
module.exports.protect = protect;
module.exports.requireAuth = requireAuth;
