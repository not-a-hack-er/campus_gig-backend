// ============================================================
// config/env.js — Environment Variables
//
// Reads values from the .env file and exports them in one place.
// All other files import from here instead of reading
// process.env directly — this makes them easier to test and change.
//
// PRODUCTION NOTE: Required vars (MONGODB_URI, JWT_SECRET) are
// validated at startup — the process exits immediately if they
// are missing so you get a clear error instead of a cryptic crash.
//
// OPTIONAL SERVICES:
//   REDIS_URL        — enables Socket.IO horizontal scaling across multiple servers
//   CLOUDINARY_URL   — enables cloud avatar storage (replaces local disk)
//   GOOGLE_CLIENT_ID — enables server-side Google ID Token verification
// ============================================================

require("dotenv").config(); // Load .env file into process.env

const env = {
  PORT:             process.env.PORT        || 5000,
  MONGODB_URI:      process.env.MONGODB_URI,
  JWT_SECRET:       process.env.JWT_SECRET,
  NODE_ENV:         process.env.NODE_ENV    || "development",
  CLIENT_URL:       process.env.CLIENT_URL  || "http://localhost:3000",
  LOG_LEVEL:        process.env.LOG_LEVEL   || "info",

  // ── Optional Services (production scale-out) ───────────────
  // Set these in production to unlock each capability.
  REDIS_URL:                    process.env.REDIS_URL                    || null, // Socket.IO multi-instance scaling
  CLOUDINARY_URL:               process.env.CLOUDINARY_URL               || null, // Cloud avatar storage
  GOOGLE_CLIENT_ID:             process.env.GOOGLE_CLIENT_ID             || null, // Google OAuth verification
  EMAIL_USER:                   process.env.EMAIL_USER                   || null,
  EMAIL_PASS:                   process.env.EMAIL_PASS                   || null,
  EMAIL_FROM:                   process.env.EMAIL_FROM                   || null,
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || null, // FCM Push Notifications
};

// ── Required variable validation ──────────────────────────────
// Fail fast at startup so the error is obvious, not cryptic.
const REQUIRED_VARS = ["MONGODB_URI", "JWT_SECRET"];
const missing = REQUIRED_VARS.filter((key) => !env[key]);

if (missing.length > 0) {
  console.error(
    `\n❌ Missing required environment variables:\n   ${missing.join(", ")}\n\n` +
    `   Create a .env file at the project root with these values.\n` +
    `   See .env.example for all required and optional variables.\n`
  );
  process.exit(1);
}

// ── Optional service warnings (non-fatal) ─────────────────────
if (env.NODE_ENV === "production") {
  if (!env.REDIS_URL) {
    console.warn("⚠️  REDIS_URL not set — Socket.IO will use in-memory adapter (single-server only)");
  }
  if (!env.CLOUDINARY_URL) {
    console.info("CLOUDINARY_URL not set — uploads use durable MongoDB storage");
  }
  if (!env.GOOGLE_CLIENT_ID) {
    console.warn("⚠️  GOOGLE_CLIENT_ID not set — Google OAuth login will be disabled");
  }
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    console.warn("⚠️  EMAIL_USER/EMAIL_PASS not set — password-reset emails will be unavailable");
  }
}

module.exports = { env };
