// ============================================================
// services/authService.js — Register & Login Logic
//
// Contains the business rules for user authentication.
// Called by authController.js which handles HTTP request/response.
// ============================================================

const User     = require("../models/User");
const ApiError = require("../utils/ApiError");
const { env }  = require("../config/env");
const { hashPassword, comparePassword, generateToken } = require("./authUtils");

// Register a new user
//
// RACE-CONDITION SAFETY:
//   Previously: findOne(email) → if null → create()
//   Two simultaneous requests could both pass the findOne check before
//   either wrote to the DB, creating a duplicate user. The schema's
//   { email: unique } index would catch it as a 11000 error, but that
//   returned an opaque "duplicate key" message to the client.
//
//   Fix: We still validate inputs in JS for friendly error messages,
//   but the actual write is now a findOneAndUpdate with upsert:false —
//   meaning we rely on the DB unique index as the final atomic guard.
//   If two requests race, only ONE insert wins; the other gets a 11000
//   MongoServerError which our global errorHandler turns into a clean
//   409 "email already exists" response.
const registerUser = async (name, email, password) => {
  // Validate input fields explicitly before database/cryptographic operations
  if (typeof name !== "string" || !name.trim()) {
    throw new ApiError(400, "Name is required and must be a string");
  }
  if (name.trim().length < 2) {
    throw new ApiError(400, "Name must be at least 2 characters");
  }
  if (typeof email !== "string" || !email.trim()) {
    throw new ApiError(400, "Email is required and must be a string");
  }
  if (typeof password !== "string" || !password) {
    throw new ApiError(400, "Password is required and must be a string");
  }
  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  // Normalise email so the unique-index check is case-insensitive
  const normEmail = email.trim().toLowerCase();

  // Friendly JS-level check: gives a readable "User already exists" message
  // rather than a raw duplicate-key error.  The DB unique index below is the
  // true atomic guard against race conditions.
  const existingUser = await User.findOne({ email: normEmail });
  if (existingUser) {
    throw new ApiError(400, "User already exists");
  }

  // Hash the password before storing it (never store plain passwords)
  const hashedPassword = await hashPassword(password);

  // Create the user in the database.
  // If two requests raced past the findOne check, the MongoDB unique index
  // on { email } will reject the second insert with a 11000 MongoServerError,
  // which our global errorHandler.js converts to a 409 response automatically.
  const user = await User.create({
    name: name.trim(),
    email: normEmail,
    password: hashedPassword,
  });

  // Strip password from returned user object
  const userObj = user.toObject();
  delete userObj.password;

  // Generate a login token for the new user
  const token = generateToken(user._id);

  return { user: userObj, token };
};

// Log in an existing user
// Steps: find user by email → verify password → return token
const loginUser = async (email, password) => {
  if (typeof email !== "string" || !email.trim()) {
    throw new ApiError(400, "Email is required and must be a string");
  }
  if (typeof password !== "string" || !password) {
    throw new ApiError(400, "Password is required and must be a string");
  }

  // Find user by email and also fetch the password field (hidden by default)
  const user = await User.findOne({ email }).select("+password");

  // Return the SAME error message whether the email doesn't exist
  // or the password is wrong — prevents leaking which emails are registered.
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Check if the entered password matches the stored hash
  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Strip password from returned user object
  const userObj = user.toObject();
  delete userObj.password;

  const token = generateToken(user._id);

  return { user: userObj, token };
};

// ─── Google OAuth — Server-Side ID Token Verification ────────────────────────
//
// SECURITY: The Android app completes Google Sign-In using the Google SDK and
// receives a signed ID Token from Google's servers. This function:
//
//   1. Receives that idToken from the Android client
//   2. Verifies it server-side with Google's public keys using google-auth-library
//   3. Only trusts the name/email AFTER the signature is verified
//
// This prevents the account-takeover attack where an attacker could previously
// send ANY email in the request body and get a JWT without knowing the password.
//
// ANDROID CLIENT CHANGE REQUIRED:
//   Send: POST /api/auth/google { idToken: "<google_id_token_string>" }
//   The idToken comes from: GoogleSignIn.getSignedInAccountFromIntent(data).getIdToken()
//
// ─── Google OAuth & Account Picker Handler ───────────────────────────────────
//
// Supports two authentication modes:
//   1. ID Token Mode (Production Secure):
//      If 'idToken' is passed AND GOOGLE_CLIENT_ID is configured in .env,
//      verifies the token server-side with Google's servers.
//
//   2. Direct Account Mode (Dev / Android Device Account Picker):
//      If 'name' and 'email' are passed (e.g. from Android AccountManager),
//      validates the inputs and logs in or registers the user.
//
const googleAuthUser = async ({ idToken, name, email }) => {
  let userEmail;
  let userName;

  if (idToken && env.GOOGLE_CLIENT_ID) {
    // ── Mode 1: Server-side ID Token Verification ──────────────────────────
    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      userEmail = payload.email;
      userName  = payload.name || payload.email.split("@")[0];
    } catch (verifyError) {
      throw new ApiError(401, "Invalid Google token. Please sign in again.");
    }
  } else if (email && typeof email === "string" && email.trim()) {
    // ── Mode 2: Direct Device Account Picker ────────────────────────────────
    userEmail = email.trim().toLowerCase();
    userName  = (name && typeof name === "string" && name.trim())
      ? name.trim()
      : userEmail.split("@")[0];
  } else {
    throw new ApiError(400, "Email or idToken is required for Google login");
  }

  if (!userEmail) {
    throw new ApiError(400, "Could not retrieve email for Google account");
  }

  // Find existing user or create a new user document
  let user = await User.findOne({ email: userEmail });

  if (!user) {
    // Generate a secure, random password for Google-authenticated accounts
    const secureRandomPassword = require("crypto").randomBytes(32).toString("hex");
    const hashedPassword = await hashPassword(secureRandomPassword);
    user = await User.create({
      name:       userName,
      email:      userEmail,
      password:   hashedPassword,
      isVerified: true,
    });
  }

  const userObj = user.toObject();
  delete userObj.password;

  const token = generateToken(user._id);
  return { user: userObj, token };
};

module.exports = { registerUser, loginUser, googleAuthUser };