// ============================================================
// controllers/reviewController.js — Review Request Handler
//
// Handles HTTP requests for creating and fetching reviews.
// The reviewed user's ID can come from different places depending
// on how the Android app sends the request (url param or body).
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const { createReview, getUserReviews } = require("../services/reviewService");

// POST /api/reviews/:userId — Leave a review for a user
// The reviewedUser ID can be in the URL param OR in the request body
const createReviewController = async (req, res, next) => {
  try {
    // Support multiple ways the app might send the reviewed user's ID
    const reviewedUserId =
      req.params.userId ||
      req.body.reviewedUser ||
      req.body.reviewee?._id ||
      req.body.reviewee?.id ||
      req.body.reviewee;

    const review = await createReview(
      req.user.id,     // Who is writing the review (logged-in user)
      reviewedUserId,  // Who is being reviewed
      req.body.rating,
      req.body.comment
    );

    return res.status(201).json(new ApiResponse(true, "Review Added", review));
  } catch (error) {
    next(error);
  }
};

// GET /api/reviews/:userId — Get all reviews for a specific user
const getUserReviewsController = async (req, res, next) => {
  try {
    const reviews = await getUserReviews(req.params.userId);
    return res.status(200).json(new ApiResponse(true, "User Reviews", reviews));
  } catch (error) {
    next(error);
  }
};

module.exports = { createReviewController, getUserReviewsController };