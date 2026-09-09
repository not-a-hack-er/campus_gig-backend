// ======================================================
// User Routes — Full Profile Tab
// ======================================================

const express = require('express');
const router  = express.Router();
const protect = require('../middleware/auth');
const {
  getMyProfileController,
  updateMyProfileController,
  updateFcmTokenController,
  uploadAvatarController,
  uploadResumeController,
  changePasswordController,
  getMyStatsController,
  getMyGigsController,
  getMyReviewsController,
  getUserByIdController,
  getUserGigsController,
  getUserReviewsPublicController,
  getCollegesController,
  deleteMyAccountController,
} = require('../controllers/userController');

// ── Public (no auth) — fixed paths BEFORE /:id ───────────────────
router.get('/colleges', getCollegesController);           // college dropdown

// ── Authenticated — own profile actions ──────────────────────────
router.get('/me',               protect, getMyProfileController);         // fetch own profile
router.put('/me',               protect, updateMyProfileController);      // update text fields
router.post('/me/fcm-token',      protect, updateFcmTokenController);       // update Firebase FCM token
router.post('/me/avatar',       protect, uploadAvatarController);         // upload profile picture
router.post('/me/resume',       protect, uploadResumeController);         // upload resume (PDF/DOC/DOCX)
router.post('/me/change-password', protect, changePasswordController);    // change password
router.get('/me/stats',         protect, getMyStatsController);           // dashboard stats
router.get('/me/gigs',          protect, getMyGigsController);            // own posted gigs
router.get('/me/reviews',       protect, getMyReviewsController);         // reviews I received
router.delete('/me',            protect, deleteMyAccountController);       // permanent account deletion

// ── Public profiles — parameterised paths LAST ───────────────────
router.get('/:id',              getUserByIdController);                   // public user profile
router.get('/:id/gigs',         getUserGigsController);                   // their gigs
router.get('/:id/reviews',      getUserReviewsPublicController);          // their reviews

module.exports = router;
