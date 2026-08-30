const express = require("express");
const protect = require("../middleware/auth");
const {
  createFeedbackController,
  getMyFeedbackController,
} = require("../controllers/feedbackController");

const router = express.Router();

// ── Protected Routes (Auth Required) ──────────────────────────────────────────
router.post("/",    protect, createFeedbackController);
router.get("/my",   protect, getMyFeedbackController);

module.exports = router;
