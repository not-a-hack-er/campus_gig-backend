// ============================================================
// services/authUtils.js — Password & Token Helper Functions
//
// Small utilities used by authService.js during login/register.
//
// Why separate from authService?
//   Keeps authService focused on business logic while this file
//   handles the low-level crypto and token operations.
// ============================================================

const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { env } = require("../config/env");

// Hash a plain-text password before saving to the database
// The '10' is the salt rounds — higher = more secure but slower
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Check if an entered password matches the stored hash
// Returns true if they match, false otherwise
const comparePassword = async (enteredPassword, hashedPassword) => {
  return await bcrypt.compare(enteredPassword, hashedPassword);
};

// Create a JWT token that identifies the user
// The token expires after 7 days — the user must log in again after that
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, env.JWT_SECRET, { expiresIn: "7d" });
};

module.exports = { hashPassword, comparePassword, generateToken };
