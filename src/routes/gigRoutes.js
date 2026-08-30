const express = require('express');
const protect = require('../middleware/auth');
const {
    createGigController,
    getAllGigsController,
    getGigByIdController,
    updateGigController,
    deleteGigController,
    submitWorkController,
    requestCompletionOtpController,
    completeGigController,
} = require('../controllers/gigController');

const router = express.Router();

// ── Public Routes (no auth required) ──────────────────────────────────────────
router.get('/',    getAllGigsController);
router.get('/:id', getGigByIdController);

// ── Protected Routes (auth required) ─────────────────────────────────────────
router.post('/',      protect, createGigController);
router.put('/:id',    protect, updateGigController);
router.delete('/:id', protect, deleteGigController);

// ── Gig Completion Flow (auth required) ───────────────────────────────────────
//
// Step 1 — Worker submits their deliverable:
//   POST /api/gigs/:id/submit-work
//   Body: { submittedUrl, submittedNote? }
//   Called by: the ACCEPTED applicant
//   Effect: gig → WORK_SUBMITTED, OTP sent to employer
//
// Step 2a — Employer gets the OTP (if notification was missed):
//   GET /api/gigs/:id/completion-otp
//   Called by: the gig poster
//   Returns: { otp, expiresAt }
//
// Step 2b — Employer confirms completion with OTP:
//   POST /api/gigs/:id/complete
//   Body: { otp }
//   Called by: the gig poster
//   Effect: gig → COMPLETED, worker.gigsCompleted++, notifications sent
//
router.post('/:id/submit-work',    protect, submitWorkController);
router.get( '/:id/completion-otp', protect, requestCompletionOtpController);
router.post('/:id/complete',       protect, completeGigController);

module.exports = router;