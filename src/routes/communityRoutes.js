// ============================================================
// routes/communityRoutes.js — Community API Endpoints
//
// All write operations (create, join, leave, post) require
// authentication (protect middleware).
// Read operations (list, get by ID, feed) are public.
// ============================================================

const express = require('express');
const router  = express.Router();
const protect = require('../middleware/auth');
const {
  createCommunityController,
  getCommunitiesController,
  getCommunityByIdController,
  joinCommunityController,
  leaveCommunityController,
  createPostController,
  getCommunityFeedController,
} = require('../controllers/communityController');

// ── Community CRUD ────────────────────────────────────────────
router.get('/',    getCommunitiesController);                    // List all communities (public)
router.post('/',   protect, createCommunityController);          // Create a community (auth)
router.get('/:id', getCommunityByIdController);                  // Get single community (public)

// ── Membership ────────────────────────────────────────────────
router.post('/:id/join',  protect, joinCommunityController);     // Join a community
router.post('/:id/leave', protect, leaveCommunityController);    // Leave a community

// ── Community Posts ───────────────────────────────────────────
router.post('/:communityId/posts', protect, createPostController);   // Create a post
router.get('/:communityId/feed',          getCommunityFeedController); // Get community feed (public)

module.exports = router;
