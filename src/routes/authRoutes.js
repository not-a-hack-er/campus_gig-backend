// ============================================================
// routes/authRoutes.js
//
// WEB (Clerk): Clerk handles sign-up, sign-in, Google OAuth,
//   and password reset on its end. The only web-specific endpoint
//   here is /sync — called after every Clerk sign-in to ensure
//   the MongoDB profile exists.
//
// ANDROID (Legacy JWT): The Android app still uses the custom
//   email/password and Google OAuth flows. Those routes are kept
//   until Android migrates to Clerk separately.
// ============================================================

const express  = require("express");
const router   = express.Router();
const { requireAuth } = require("../middleware/auth");
const { syncClerkUser } = require("../controllers/profileController");

// ─── Web (Clerk) ──────────────────────────────────────────────────────────────

// POST /api/auth/sync
// Called by the React frontend immediately after every Clerk sign-in.
// Ensures the MongoDB User profile exists (fallback for webhook delivery delays).
// Returns { profileComplete, userId, name, email, role, college }.
router.post("/sync", requireAuth, syncClerkUser);

// ─── Android (Legacy JWT) — kept until Android migrates to Clerk ──────────────
const protect = require("../middleware/auth");

const {
  register,
  login,
  googleLogin,
  forgotPasswordController,
  verifyOtpController,
  resetPasswordController,
} = require("../controllers/authController");

const { changePasswordController } = require("../controllers/userController");

router.post("/register",        register);
router.post("/login",           login);
router.post("/google",          googleLogin);
router.post("/forgot-password", forgotPasswordController);
router.post("/verify-otp",      verifyOtpController);
router.post("/reset-password",  resetPasswordController);

// change-password available from both /api/auth and /api/users/me/change-password
router.post("/change-password", protect, changePasswordController);

module.exports = router;
