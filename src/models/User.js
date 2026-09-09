// ============================================================
// models/User.js — User Database Schema
//
// Defines what a "User" looks like in the database.
// A user can: post gigs, apply for gigs, join communities,
// send messages, and receive reviews.
// ============================================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ── Basic Info ──────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,         // Remove extra whitespace
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,       // No two users can share the same email
      lowercase: true,    // Always store email in lowercase
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,      // Never return password in queries by default
    },

    role: {
      type: String,
      enum: ["student", "employer"],
      default: "student",
    },

    // ── Profile Details ─────────────────────────────────────
    bio:            { type: String,   default: "", maxlength: 500 },
    avatar:         { type: String,   default: "" }, // Profile picture URL
    college:        { type: String,   default: "" },
    branch:         { type: String,   default: "" },
    yearOfStudy:    { type: String,   default: "", enum: ["", "1st", "2nd", "3rd", "4th", "5th+"] },
    graduationYear: { type: Number },

    // ── Skills ──────────────────────────────────────────────
    skills: { type: [String], default: [] }, // Array of skill strings

    // ── Resume ──────────────────────────────────────────────
    resumeUrl: { type: String, default: "" }, // URL to uploaded resume (PDF/DOC)

    // ── Social Links ────────────────────────────────────────
    github:    { type: String, default: "" },
    linkedin:  { type: String, default: "" },
    portfolio: { type: String, default: "" },

    // ── Reputation ──────────────────────────────────────────
    rating:        { type: Number, default: 0, min: 0, max: 5 },
    totalReviews:  { type: Number, default: 0 },
    gigsPosted:    { type: Number, default: 0 },
    gigsCompleted: { type: Number, default: 0 },

    // ── Device Push Token ───────────────────────────────────
    fcmToken: { type: String, default: "" }, // Firebase Cloud Messaging token

    // ── Account Status ──────────────────────────────────────
    isVerified: { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true },

    // ── Password Reset (Forgot Password OTP) ────────────────
    // These fields are hidden from all queries by default (select: false).
    // They are only fetched internally when processing a password reset.
    passwordResetOtp:    { type: String,  select: false }, // bcrypt-hashed 6-digit OTP
    passwordResetOtpExpiry: { type: Date, select: false }, // OTP valid until this timestamp
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Index on email to speed up login lookups
userSchema.index({ email: 1 });

// ─── Virtual Fields ───────────────────────────────────────────────────────────
//
// Virtuals are fields that are NOT stored in the database.
// They are computed on-the-fly when you read a user document.
// We use them here to support alternate field names sent by the Android app.

// "githubProfile" is an alias for "github"
userSchema.virtual("githubProfile")
  .get(function () { return this.github || ""; })
  .set(function (val) { this.github = val; });

// "linkedinProfile" is an alias for "linkedin"
userSchema.virtual("linkedinProfile")
  .get(function () { return this.linkedin || ""; })
  .set(function (val) { this.linkedin = val; });

// "profilePicture" is an alias for "avatar"
userSchema.virtual("profilePicture")
  .get(function () { return this.avatar || ""; })
  .set(function (val) { this.avatar = val; });

// "completedGigsCount" is an alias for "gigsCompleted"
userSchema.virtual("completedGigsCount")
  .get(function () { return this.gigsCompleted || 0; })
  .set(function (val) { this.gigsCompleted = val; });

// "reviewCount" is an alias for "totalReviews"
userSchema.virtual("reviewCount")
  .get(function () { return this.totalReviews || 0; })
  .set(function (val) { this.totalReviews = val; });

// "portfolioLinks" wraps the single portfolio URL as an array
userSchema.virtual("portfolioLinks")
  .get(function () {
    return this.portfolio ? [this.portfolio] : [];
  })
  .set(function (val) {
    if (Array.isArray(val) && val.length > 0) {
      this.portfolio = val[0];
    } else if (typeof val === "string") {
      this.portfolio = val;
    }
  });

// ─── JSON Serialization ───────────────────────────────────────────────────────

// Include virtual fields when converting a User document to JSON
// (e.g. when sending it in an API response)
userSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.id; // Remove duplicate 'id' field (we use '_id')
    delete ret.password;
    delete ret.passwordResetOtp;
    delete ret.passwordResetOtpExpiry;
    delete ret.fcmToken;
    return ret;
  },
});

userSchema.set("toObject", { virtuals: true, getters: true });

const User = mongoose.model("User", userSchema);

module.exports = User;
