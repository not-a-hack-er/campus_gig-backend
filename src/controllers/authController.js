// ============================================================
// controllers/authController.js — Auth Request Handler
//
// Receives HTTP requests for login/register and sends responses.
// All actual business logic lives in authService.js.
// ============================================================

const { registerUser, loginUser, googleAuthUser, forgotPassword, verifyOtp, resetPassword } = require("../services/authService");
const ApiResponse = require("../utils/ApiResponse");

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, college, branch, yearOfStudy, skills } = req.body;
    const result = await registerUser(name, email, password, {
      role,
      college,
      branch,
      yearOfStudy,
      skills,
    });
    return res.status(201).json(new ApiResponse(true, "User Registered", result));
  } catch (error) {
    next(error); // Pass error to global error handler
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    return res.status(200).json(new ApiResponse(true, "Login Successful", result));
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/google
// Supports both idToken (production verified token) and { name, email } (device account picker).
const googleLogin = async (req, res, next) => {
  try {
    const { idToken, name, email } = req.body;
    const result = await googleAuthUser({ idToken, name, email });
    return res.status(200).json(new ApiResponse(true, "Google Login Successful", result));
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/forgot-password
// Step 1: User enters their email — backend generates and emails a 6-digit OTP.
// Always returns success to prevent email enumeration.
const forgotPasswordController = async (req, res, next) => {
  try {
    const result = await forgotPassword(req.body.email);
    return res.status(200).json(new ApiResponse(true, result.message, null));
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/verify-otp
// Step 2: User submits email + OTP — backend validates and returns a short-lived resetToken.
const verifyOtpController = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyOtp(email, otp);
    return res.status(200).json(new ApiResponse(true, "OTP verified", result));
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password
// Step 3: User submits resetToken + new password — backend sets the new password.
const resetPasswordController = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;
    const result = await resetPassword(resetToken, newPassword);
    return res.status(200).json(new ApiResponse(true, result.message, null));
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, googleLogin, forgotPasswordController, verifyOtpController, resetPasswordController };

