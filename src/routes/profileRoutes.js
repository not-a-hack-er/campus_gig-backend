// ============================================================
// routes/profileRoutes.js — Mandatory Profile Completion Routes
//
// These routes use requireAuth (auth check only — no profileComplete
// requirement) so that incomplete-profile users can reach them.
// ============================================================

const express = require("express");
const router  = express.Router();
const { requireAuth } = require("../middleware/auth");
const { completeProfile } = require("../controllers/profileController");

// POST /api/profile/complete
// Validates and saves the profile completion form.
// Sets profileComplete = true on success.
router.post("/complete", requireAuth, completeProfile);

module.exports = router;
