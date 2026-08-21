const express  = require('express');
const router    = express.Router();
const protect   = require('../middleware/auth');
const { register, login, googleLogin, forgotPasswordController, verifyOtpController, resetPasswordController } = require('../controllers/authController');
// change-password is owned by userController but accessible via /api/auth too
const { changePasswordController } = require('../controllers/userController');

router.post('/register',        register);
router.post('/login',           login);
router.post('/google',          googleLogin);
router.post('/change-password', protect, changePasswordController); // also at /api/users/me/change-password

// ─── Forgot Password — 3-Step OTP Flow (no auth required) ──────────────────────────
// Step 1: POST { email }                 → sends OTP email
// Step 2: POST { email, otp }            → verifies OTP, returns resetToken
// Step 3: POST { resetToken, newPassword } → sets new password
router.post('/forgot-password', forgotPasswordController);
router.post('/verify-otp',      verifyOtpController);
router.post('/reset-password',  resetPasswordController);

module.exports = router;
