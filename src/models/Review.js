// ============================================================
// models/Review.js — User Review Schema
//
// A Review is written by one user about another user
// after completing a gig together.
//
// As of v2.0: reviews are tied to a specific completed gig.
//   - The 'gig' field references the Gig document.
//   - The 'gigTitle' field is a denormalized copy of the gig title,
//     so reviews remain readable even if the gig is later deleted.
//   - The unique index is (reviewer, reviewedUser, gig) which allows
//     reviewing the same person for different gigs, but prevents
//     submitting two reviews for the same gig.
//   - 'gig' is optional (not required) for backward compatibility with
//     existing review data.
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

    // The gig this review is linked to (required for new reviews)
    gig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      default: null,
    },

    // Denormalized gig title — preserved even if the gig document is later deleted
    gigTitle: { type: String, default: "" },

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
// UNIQUE compound index on {reviewer, reviewedUser, gig}:
//   - One reviewer can review the same user only once per gig.
//   - If gig is null (legacy review or no gig), the combination
//     (reviewer, reviewedUser, null) is still unique.
//   - The JS-level check in reviewService.js gives a friendly
//     error message; this index is the DB-level guarantee.
//
// Index on {reviewedUser}:
//   - Speeds up getUserReviews(): Review.find({ reviewedUser: userId })
//
// Index on {gig}:
//   - Speeds up fetching all reviews for a specific gig.
//
reviewSchema.index({ reviewer: 1, reviewedUser: 1, gig: 1 }, { unique: true });
reviewSchema.index({ reviewedUser: 1, createdAt: -1 });
reviewSchema.index({ gig: 1 });

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;