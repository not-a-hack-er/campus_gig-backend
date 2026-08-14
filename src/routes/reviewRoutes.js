const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  createReviewController,
  getUserReviewsController,
} = require('../controllers/reviewController');

// IMPORTANT: Specific routes (/user/:userId) MUST be registered BEFORE
// parameterised routes (/:userId). Express matches top-down, so /:userId
// would capture "/user/abc" with userId="user" if placed first.

// Fetch reviews for a user — supports both URL styles
router.get('/user/:userId', getUserReviewsController); // /api/reviews/user/:id
router.get('/:userId',      getUserReviewsController); // /api/reviews/:id

// Create a review — supports both URL styles
router.post('/',         protect, createReviewController); // body: { reviewedUser }
router.post('/:userId',  protect, createReviewController); // URL param style

module.exports = router;
