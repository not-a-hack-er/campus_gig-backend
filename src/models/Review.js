// ============================================================
// models/Review.js — User Review Schema
//
// A Review is written by one user about another user
// after completing a gig together.
// ============================================================

const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    // The user writing the review
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The user being reviewed
    reviewedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Star rating from 1 to 5
    rating: { type: Number, required: true, min: 1, max: 5 },

    // Optional written feedback
    comment: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

// ── Database Indexes ──────────────────────────────────────────────────────────
//
// UNIQUE compound index on {reviewer, reviewedUser}:
//   - Enforces at the database level that each user can only review
//     another specific user exactly once.
//   - The JS-level findOne() check in reviewService.js gives a friendly
//     error message, but this index is the definitive guarantee —
//     concurrent duplicate submissions are blocked even at the DB level.
//
// Index on {reviewedUser}:
//   - Speeds up getUserReviews(): Review.find({ reviewedUser: userId })
//
reviewSchema.index({ reviewer: 1, reviewedUser: 1 }, { unique: true });
reviewSchema.index({ reviewedUser: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;