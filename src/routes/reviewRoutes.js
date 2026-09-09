const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  createReviewController,
  getUserReviewsController,
  getGigReviewsController,
} = require('../controllers/reviewController');

// IMPORTANT: Specific routes (/user/:userId, /gig/:gigId) MUST be registered BEFORE
// parameterised routes (/:userId). Express matches top-down, so /:userId
// would capture "/gig/abc" with userId="gig" if placed first.

// BUG-08 FIX: /gig/:gigId MUST be declared before /:userId.
// Previously /:userId was above /gig/:gigId, which caused requests to
// /api/reviews/gig/abc123 to match /:userId with userId="gig" and call
// getUserReviewsController instead of getGigReviewsController.

// Fetch all reviews for a specific gig — MUST come before /:userId
router.get('/gig/:gigId',   getGigReviewsController);  // /api/reviews/gig/:gigId

// Fetch reviews for a user — supports both URL styles
router.get('/user/:userId', getUserReviewsController); // /api/reviews/user/:id
router.get('/:userId',      getUserReviewsController); // /api/reviews/:id

// Create a review — supports both URL styles
// Optional body field: gigId (links review to a completed gig)
router.post('/',         protect, createReviewController); // body: { reviewedUser, gigId? }
router.post('/:userId',  protect, createReviewController); // URL param style

module.exports = router;
