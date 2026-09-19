// ============================================================
// config/env.js — Environment Variables
//
// Reads values from the .env file and exports them in one place.
// All other files import from here instead of reading
// process.env directly — this makes them easier to test and change.
//
// PRODUCTION NOTE: Required vars (MONGODB_URI, CLERK_SECRET_KEY) are
// validated at startup — the process exits immediately if they
// are missing so you get a clear error instead of a cryptic crash.
//
// AUTHENTICATION:
//   Clerk (web)  — primary auth for the web frontend.
//   JWT_SECRET   — kept for the Android app which still uses custom JWT.
//   The auth middleware supports both simultaneously.
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
  NODE_ENV:         process.env.NODE_ENV    || "development",
  CLIENT_URL:       process.env.CLIENT_URL  || "http://localhost:3000",
  LOG_LEVEL:        process.env.LOG_LEVEL   || "info",

  // ── Clerk (Web Authentication) ─────────────────────────────
  // CLERK_SECRET_KEY is required — used to verify Clerk session tokens server-side.
  // CLERK_PUBLISHABLE_KEY is also required by @clerk/express to authenticate requests.
  // CLERK_WEBHOOK_SECRET is required once you configure the webhook in the Clerk Dashboard.
  CLERK_SECRET_KEY:        process.env.CLERK_SECRET_KEY,
  CLERK_PUBLISHABLE_KEY:   process.env.CLERK_PUBLISHABLE_KEY,
  CLERK_WEBHOOK_SECRET:    process.env.CLERK_WEBHOOK_SECRET     || null,

  // ── Legacy JWT (Android App) ───────────────────────────────
  // The Android app still uses custom JWT auth. JWT_SECRET is kept so the
  // protect middleware can verify Android requests until Android migrates to Clerk.
  JWT_SECRET:              process.env.JWT_SECRET               || null,

  // ── Optional Services (production scale-out) ───────────────
  // Set these in production to unlock each capability.
  REDIS_URL:                    process.env.REDIS_URL                    || null, // Socket.IO multi-instance scaling
  CLOUDINARY_URL:               process.env.CLOUDINARY_URL               || null, // Cloud avatar storage
  GOOGLE_CLIENT_ID:             process.env.GOOGLE_CLIENT_ID             || null, // Google OAuth verification
  EMAIL_USER:                   process.env.EMAIL_USER                   || null,
  EMAIL_PASS:                   process.env.EMAIL_PASS                   || null,
  EMAIL_FROM:                   process.env.EMAIL_FROM                   || null,
  SMTP_HOST:                    process.env.SMTP_HOST                    || null,
  SMTP_PORT:                    process.env.SMTP_PORT                    || null,
  SMTP_SECURE:                  process.env.SMTP_SECURE                  || null,
  SMTP_USER:                    process.env.SMTP_USER                    || null,
  SMTP_PASS:                    process.env.SMTP_PASS                    || null,
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || null, // FCM Push Notifications
};

// ── Required variable validation ──────────────────────────────
// Fail fast at startup so the error is obvious, not cryptic.
const REQUIRED_VARS = ["MONGODB_URI", "CLERK_SECRET_KEY"];
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
  if (!env.CLERK_WEBHOOK_SECRET) {
    console.warn("⚠️  CLERK_WEBHOOK_SECRET not set — Clerk webhook verification will be skipped (configure in Clerk Dashboard)");
  }
  if (!env.JWT_SECRET) {
    console.warn("⚠️  JWT_SECRET not set — Android app JWT auth will be disabled");
  }
}

module.exports = { env };

