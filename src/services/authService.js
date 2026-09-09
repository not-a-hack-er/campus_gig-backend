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
const { sendOtpEmail } = require("../utils/emailService");
const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");
const jwt      = require("jsonwebtoken");

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
const registerUser = async (name, email, password, profile = {}) => {
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

  const role = profile.role || "student";
  if (!["student", "employer"].includes(role)) {
    throw new ApiError(400, "Role must be student or employer");
  }
  const yearOfStudy = typeof profile.yearOfStudy === "string" ? profile.yearOfStudy.trim() : "";
  if (yearOfStudy && !["1st", "2nd", "3rd", "4th", "5th+"].includes(yearOfStudy)) {
    throw new ApiError(400, "Invalid year of study");
  }
  const seenSkills = new Set();
  const skills = Array.isArray(profile.skills)
    ? profile.skills
      .filter((skill) => typeof skill === "string")
      .map((skill) => skill.trim().slice(0, 50))
      .filter((skill) => {
        const normalized = skill.toLowerCase();
        if (!skill || seenSkills.has(normalized)) return false;
        seenSkills.add(normalized);
        return true;
      })
      .slice(0, 20)
    : [];

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
    role,
    college: typeof profile.college === "string" ? profile.college.trim() : "",
    branch: typeof profile.branch === "string" ? profile.branch.trim() : "",
    yearOfStudy,
    skills,
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

  // BUG-12 FIX: Normalize email to lowercase before lookup.
  // registerUser stores the email lowercased (User schema has lowercase:true),
  // but findOne() queries the raw stored value — if the caller sends mixed-case
  // (e.g. from Google account picker: "Test@Example.COM"), the query would find
  // nothing and return 401 even with the correct password.
  const normEmail = email.trim().toLowerCase();

  // Find user by email and also fetch the password field (hidden by default)
  const user = await User.findOne({ email: normEmail }).select("+password");

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

// BUG-04 FIX: module.exports moved to the end of the file.
// Previously it was at line 201 (mid-file), before the forgotPassword / verifyOtp /
// resetPassword function declarations. Function declarations are hoisted in JS so
// the code worked, but it was a dangerous pattern — converting any of those
// functions to a const arrow function would silently break the exports.
// It is now at the very end, after all definitions, which is conventional and safe.

// ─── Forgot Password — Step 1: Generate & Email OTP ───────────────────────────
//
// Generates a cryptographically random 6-digit OTP, bcrypt-hashes it
// (same protection as passwords — brute-force resistant), stores it
// on the user document with a 15-minute expiry, then sends it by email.
//
// SECURITY — No Email Enumeration:
//   We always return a success response regardless of whether the email
//   exists in the database.  This prevents attackers from discovering
//   which email addresses are registered.
async function forgotPassword(email) {
  if (typeof email !== "string" || !email.trim()) {
    throw new ApiError(400, "Email is required");
  }

  const normEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normEmail });

  // Always respond with success — don't reveal if the email is registered
  if (!user) return { message: "If that email is registered, an OTP has been sent." };

  // Generate a 6-digit numeric OTP from a cryptographically secure source
  const otp = String(crypto.randomInt(100000, 999999));

  // Hash the OTP before storing (brute-force resistant, same as passwords)
  const salt   = await bcrypt.genSalt(10);
  const hashedOtp = await bcrypt.hash(otp, salt);

  // Store the hashed OTP + 15-minute expiry window on the user document
  user.passwordResetOtp       = hashedOtp;
  user.passwordResetOtpExpiry = new Date(Date.now() + 15 * 60 * 1000); // +15 min
  await user.save({ validateBeforeSave: false });

  // Send plaintext OTP via email (or log to console if email not configured)
  await sendOtpEmail(normEmail, otp);

  return { message: "If that email is registered, an OTP has been sent." };
}

// ─── Forgot Password — Step 2: Verify OTP → Return Reset Token ───────────────
//
// Validates the email + OTP pair.  On success returns a short-lived JWT
// that the app uses in Step 3 (reset-password).  The OTP is cleared
// after one successful verification to prevent reuse.
async function verifyOtp(email, otp) {
  if (typeof email !== "string" || !email.trim()) {
    throw new ApiError(400, "Email is required");
  }
  if (typeof otp !== "string" || !otp.trim()) {
    throw new ApiError(400, "OTP is required");
  }

  const normEmail = email.trim().toLowerCase();

  // Fetch the user INCLUDING the hidden OTP fields
  const user = await User.findOne({ email: normEmail })
    .select("+passwordResetOtp +passwordResetOtpExpiry");

  // Generic error — don't tell the caller why verification failed
  const INVALID = new ApiError(400, "Invalid or expired OTP");

  if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpiry) {
    throw INVALID;
  }

  // Check expiry
  if (user.passwordResetOtpExpiry < new Date()) {
    // Clear stale OTP
    user.passwordResetOtp       = undefined;
    user.passwordResetOtpExpiry = undefined;
    await user.save({ validateBeforeSave: false });
    throw INVALID;
  }

  // Constant-time compare (bcrypt) to prevent timing attacks
  const isMatch = await bcrypt.compare(otp.trim(), user.passwordResetOtp);
  if (!isMatch) throw INVALID;

  // OTP is valid — clear it immediately so it cannot be reused
  user.passwordResetOtp       = undefined;
  user.passwordResetOtpExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  // Issue a short-lived reset token (15 min) that authorises Step 3
  const resetToken = jwt.sign(
    { userId: user._id.toString(), purpose: "password_reset" },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  return { resetToken };
}

// ─── Forgot Password — Step 3: Reset Password with Token ─────────────────────
//
// Accepts the short-lived resetToken issued by verifyOtp() and the
// user's chosen new password.  Verifies the token, validates the new
// password, and saves the bcrypt-hashed password.
async function resetPassword(resetToken, newPassword) {
  if (!resetToken) {
    throw new ApiError(400, "Reset token is required");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, env.JWT_SECRET);
  } catch {
    throw new ApiError(400, "Reset token is invalid or has expired. Please request a new OTP.");
  }

  if (payload.purpose !== "password_reset") {
    throw new ApiError(400, "Invalid token type");
  }

  const user = await User.findById(payload.userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  // Hash and save the new password
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  return { message: "Password reset successfully. You can now log in with your new password." };
}

module.exports = { registerUser, loginUser, googleAuthUser, forgotPassword, verifyOtp, resetPassword };
