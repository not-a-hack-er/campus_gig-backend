// ============================================================
// middleware/rateLimiter.js — Request Rate Limiting
//
// Two limiters are exported:
//
//   globalLimiter  — applied to ALL routes in app.js
//                    100 requests / 15 minutes per IP
//
//   authLimiter    — applied ONLY to /api/auth/* routes
//                    10 requests / 15 minutes per IP
//                    This defends against brute-force credential stuffing.
//
// SECURITY NOTE on bypass:
//   The bypass header ("x-bypass-rate-limit") is ONLY active during
//   automated Jest tests (NODE_ENV === "test"). It is completely
//   disabled in development and production — this prevents a
//   misconfigured NODE_ENV from allowing anyone to bypass limits.
// ============================================================

const rateLimit = require("express-rate-limit");

// ── Bypass predicate — TEST ONLY ─────────────────────────────────────────────
// Only skip rate limiting when running automated Jest tests.
// Any other environment (including "staging", "dev", etc.) is NOT bypassed.
const skipInTest = (req) => {
  return (
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV !== "production" && req.headers["x-bypass-rate-limit"] === "true")
  );
};

// ── Global Limiter ────────────────────────────────────────────────────────────
// Applied to all routes as a baseline defence against general abuse.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,             // 100 requests per window per IP
  standardHeaders: true,     // Return rate-limit info in RateLimit-* headers
  legacyHeaders:   false,    // Disable X-RateLimit-* legacy headers
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
  skip: skipInTest,
});

// ── Auth Limiter ──────────────────────────────────────────────────────────────
// Much stricter limits applied only to authentication endpoints.
// 10 attempts per 15 minutes stops brute-force and credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      10,              // Only 10 login/register attempts per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  },
  skip: skipInTest,
});

module.exports = { globalLimiter, authLimiter };