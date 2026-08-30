// ============================================================
// services/reviewService.js — Review Business Logic (v2.0)
//
// Handles creating reviews and fetching them for a user.
// After a review is created, the reviewed user's average rating
// and total review count are automatically updated using a
// MongoDB aggregation pipeline ($avg) instead of in-memory JS.
//
// v2.0: Reviews are now optionally linked to a completed gig.
//   - If gigId is provided, we verify the gig is COMPLETED and that
//     the reviewer participated (as poster or accepted applicant).
//   - The unique index is now (reviewer, reviewedUser, gig).
// ============================================================

const Review       = require("../models/Review");
const User         = require("../models/User");
const Gig          = require("../models/Gig");
const Application  = require("../models/Application");
const ApiError     = require("../utils/ApiError");

// Create a review from one user to another
// gigId is optional — if provided, validates participation in a completed gig.
const createReview = async (reviewerId, reviewedUserId, rating, comment, gigId = null) => {
  // A user cannot review themselves
  if (reviewerId.toString() === reviewedUserId.toString()) {
    throw new ApiError(400, "You cannot review yourself");
  }

  // Validate rating explicitly before hitting the DB
  const ratingNum = Number(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new ApiError(400, "Rating must be a number between 1 and 5");
  }

  let gigRef   = null;
  let gigTitle = "";

  // ── Gig-linked review validation ─────────────────────────────────────────
  if (gigId) {
    const gig = await Gig.findById(gigId);
    if (!gig) throw new ApiError(404, "Gig not found");

    // Only allow reviews on completed gigs.
    // NOTE: gig.status getter returns lowercase (schema get transform), so compare lowercase.
    if (gig.status.toLowerCase() !== "completed") {
      throw new ApiError(400, "Reviews can only be submitted for completed gigs");
    }

    // Verify the reviewer actually participated in this gig
    // (either as the poster OR as the accepted applicant)
    const posterId = gig.postedBy.toString();
    const isGigPoster = posterId === reviewerId.toString();

    // IMPORTANT: Application status is stored as UPPERCASE in MongoDB.
    // The schema getter returns lowercase, but raw queries hit the stored value.
    const acceptedApplication = await Application.findOne({
      gig:       gigId,
      applicant: reviewerId,
      status:    { $in: ["ACCEPTED", "COMPLETED"] },
    });
    const isAcceptedApplicant = !!acceptedApplication;

    if (!isGigPoster && !isAcceptedApplicant) {
      throw new ApiError(403, "You can only review someone you have worked with on a completed gig");
    }

    // Also check the reviewedUser participated in this gig
    // IMPORTANT: status stored UPPERCASE in DB.
    const reviewedUserIsGigPoster = posterId === reviewedUserId.toString();
    const reviewedUserIsApplicant = await Application.findOne({
      gig:       gigId,
      applicant: reviewedUserId,
      status:    { $in: ["ACCEPTED", "COMPLETED"] },
    });
    if (!reviewedUserIsGigPoster && !reviewedUserIsApplicant) {
      throw new ApiError(400, "The person you are reviewing did not participate in this gig");
    }

    gigRef   = gigId;
    gigTitle = gig.title || "";
  }

  // Duplicate check — matches the new unique index (reviewer, reviewedUser, gig)
  // gig: null means a legacy free-form review (one per reviewer-reviewedUser pair)
  const existingReview = await Review.findOne({
    reviewer:     reviewerId,
    reviewedUser: reviewedUserId,
    gig:          gigRef,
  });
  if (existingReview) {
    const context = gigTitle ? ` for "${gigTitle}"` : "";
    throw new ApiError(400, `You have already reviewed this user${context}`);
  }

  // Save the new review
  const review = await Review.create({
    reviewer:     reviewerId,
    reviewedUser: reviewedUserId,
    gig:          gigRef,
    gigTitle,
    rating:       ratingNum,
    comment,
  });

  // ── Recalculate Average Rating via MongoDB Aggregation ────────────────────
  const [aggResult] = await Review.aggregate([
    { $match: { reviewedUser: review.reviewedUser } },
    {
      $group: {
        _id:           "$reviewedUser",
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
    const gigContext   = gigTitle ? ` for "${gigTitle}"` : "";
    await createNotification(
      reviewedUserId,
      "⭐ New Review Received",
      `${reviewerName} left you a ${ratingNum}-star review${gigContext}. Check it out!`,
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
    .populate("gig", "title")
    .sort({ createdAt: -1 });
};

// Get all reviews for a specific gig
const getGigReviews = async (gigId) => {
  return await Review.find({ gig: gigId })
    .populate("reviewer",     "name avatar college")
    .populate("reviewedUser", "name avatar college")
    .sort({ createdAt: -1 });
};

module.exports = { createReview, getUserReviews, getGigReviews };