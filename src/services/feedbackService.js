// ============================================================
// services/feedbackService.js — Business Logic for App Feedback (v1.0)
// ============================================================

const Feedback = require("../models/Feedback");
const ApiError = require("../utils/ApiError");
const logger   = require("../config/logger");

/**
 * Creates a new feedback entry from a user.
 */
const createFeedback = async ({ userId, type, rating, message, deviceInfo }) => {
  if (!message || message.trim().length < 5) {
    throw new ApiError(400, "Feedback message must be at least 5 characters long");
  }

  // Normalize uppercase type
  const normalizedType = type ? type.toUpperCase() : "GENERAL_HELP";

  const feedback = await Feedback.create({
    user: userId,
    type: normalizedType,
    rating: rating ? Number(rating) : null,
    message: message.trim(),
    deviceInfo: deviceInfo || "Android App",
  });

  logger.info({ feedbackId: feedback._id, userId, type: normalizedType }, "[Feedback] New feedback created");

  return feedback;
};

/**
 * Retrieves past feedback submitted by a specific user.
 */
const getMyFeedback = async (userId) => {
  const feedbacks = await Feedback.find({ user: userId })
    .sort({ createdAt: -1 })
    .lean();
  return feedbacks;
};

module.exports = {
  createFeedback,
  getMyFeedback,
};
