// ============================================================
// controllers/authController.js — Auth Request Handler
//
// Receives HTTP requests for login/register and sends responses.
// All actual business logic lives in authService.js.
// ============================================================

const { registerUser, loginUser, googleAuthUser } = require("../services/authService");
const ApiResponse = require("../utils/ApiResponse");

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const result = await registerUser(name, email, password);
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

module.exports = { register, login, googleLogin };