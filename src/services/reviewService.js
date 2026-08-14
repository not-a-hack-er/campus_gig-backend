// ============================================================
// services/reviewService.js — Review Business Logic
//
// Handles creating reviews and fetching them for a user.
// After a review is created, the reviewed user's average rating
// and total review count are automatically updated using a
// MongoDB aggregation pipeline ($avg) instead of in-memory JS.
// ============================================================

const Review   = require("../models/Review");
const User     = require("../models/User");
const ApiError = require("../utils/ApiError");

// Create a review from one user to another
// Validates: no self-review, no duplicate reviews (also enforced by DB unique index)
const createReview = async (reviewerId, reviewedUserId, rating, comment) => {
  // A user cannot review themselves
  if (reviewerId.toString() === reviewedUserId.toString()) {
    throw new ApiError(400, "You cannot review yourself");
  }

  // Validate rating explicitly before hitting the DB
  const ratingNum = Number(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new ApiError(400, "Rating must be a number between 1 and 5");
  }

  // Each reviewer can only review a given user once
  // The unique index on { reviewer, reviewedUser } provides the DB-level guarantee.
  // This check gives a friendly error message before the duplicate-key exception.
  const existingReview = await Review.findOne({ reviewer: reviewerId, reviewedUser: reviewedUserId });
  if (existingReview) {
    throw new ApiError(400, "You have already reviewed this user");
  }

  // Save the new review
  const review = await Review.create({
    reviewer:     reviewerId,
    reviewedUser: reviewedUserId,
    rating:       ratingNum,
    comment,
  });

  // ── Recalculate Average Rating via MongoDB Aggregation ────────────────────
  // Previously: loaded ALL reviews into Node.js memory and called Array.reduce()
  //             — O(N) memory consumption, blocks event loop for high-review users.
  //
  // Now: MongoDB computes the average server-side using $avg in a single aggregation
  //      query. Only the scalar result (count, avg) is returned over the wire.
  //      This scales to millions of reviews with negligible overhead.
  //
  const [aggResult] = await Review.aggregate([
    { $match: { reviewedUser: review.reviewedUser } },
    {
      $group: {
        _id:          "$reviewedUser",
        averageRating: { $avg: "$rating" },
        totalReviews:  { $sum: 1 },
      },
    },
  ]);

  if (aggResult) {
    await User.findByIdAndUpdate(reviewedUserId, {
      rating:       Math.round(aggResult.averageRating * 10) / 10, // Round to 1 decimal
      totalReviews: aggResult.totalReviews,
    });
  }

  // Emit notification to the reviewed user
  const { createNotification } = require("./notificationService");
  try {
    const reviewer = await User.findById(reviewerId).select("name");
    const reviewerName = reviewer ? reviewer.name : "Someone";
    await createNotification(
      reviewedUserId,
      "⭐ New Review Received",
      `${reviewerName} left you a ${ratingNum}-star review. Check it out!`,
      {
        type:          "new_review",
        referenceId:   review._id.toString(),
        referenceType: "Review",
      }
    );
  } catch (notifError) {
    console.error("Failed to send review notification:", notifError.message);
  }

  return review;
};

// Get all reviews for a specific user, newest first
const getUserReviews = async (userId) => {
  return await Review.find({ reviewedUser: userId })
    .populate("reviewer", "name avatar college")
    .sort({ createdAt: -1 });
};

module.exports = { createReview, getUserReviews };