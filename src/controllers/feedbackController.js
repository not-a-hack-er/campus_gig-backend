// ============================================================
// controllers/feedbackController.js — Feedback Endpoint Handler (v1.0)
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const { createFeedback, getMyFeedback } = require("../services/feedbackService");

// POST /api/feedback — Submit feedback
const createFeedbackController = async (req, res, next) => {
  try {
    const feedback = await createFeedback({
      userId: req.user.id,
      type: req.body.type,
      rating: req.body.rating,
      message: req.body.message,
      deviceInfo: req.body.deviceInfo,
    });

    return res
      .status(201)
      .json(new ApiResponse(true, "Thank you for your feedback!", feedback));
  } catch (error) {
    next(error);
  }
};

// GET /api/feedback/my — Get user's submitted feedback
const getMyFeedbackController = async (req, res, next) => {
  try {
    const feedbacks = await getMyFeedback(req.user.id);
    return res
      .status(200)
      .json(new ApiResponse(true, "My Feedback History", feedbacks));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFeedbackController,
  getMyFeedbackController,
};
