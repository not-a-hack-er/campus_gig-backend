// ============================================================
// models/Feedback.js — App & Support Feedback Schema (v1.0)
//
// Represents feedback, bug reports, feature requests, or help queries
// submitted by users to the CampusGig admin team.
// ============================================================

const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    // The user who submitted the feedback
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Feedback must belong to a user"],
      index: true,
    },

    // Type of feedback
    type: {
      type: String,
      enum: {
        values: ["BUG_REPORT", "FEATURE_REQUEST", "APP_RATING", "GENERAL_HELP"],
        message: "Invalid feedback type: {VALUE}",
      },
      required: [true, "Feedback type is required"],
      default: "GENERAL_HELP",
    },

    // Rating (1-5 stars, optional depending on type)
    rating: {
      type: Number,
      min: [1, "Rating cannot be less than 1"],
      max: [5, "Rating cannot be more than 5"],
      default: null,
    },

    // Message details
    message: {
      type: String,
      required: [true, "Feedback message is required"],
      trim: true,
      minlength: [5, "Feedback message must be at least 5 characters long"],
      maxlength: [2000, "Feedback message cannot exceed 2000 characters"],
    },

    // Device / App Metadata (e.g., "Android 14, CampusGig v3.0")
    deviceInfo: {
      type: String,
      trim: true,
      default: "Android App",
    },

    // Admin review status
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "RESOLVED"],
      default: "PENDING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
