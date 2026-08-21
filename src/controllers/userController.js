// ============================================================
// controllers/userController.js — User Profile Request Handler
//
// Handles HTTP request processing for user profiles, avatars,
// password updates, dashboard metrics, and public profiles.
// All business logic & queries are delegated to userService.js.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const ApiError    = require("../utils/ApiError");
const { handleAvatarUpload, handleResumeUpload } = require("../middleware/upload");
const userService = require("../services/userService");

// GET /api/users/me — Get logged-in user profile
const getMyProfileController = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.user.id);
    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/me — Update user profile text fields
const updateMyProfileController = async (req, res, next) => {
  try {
    const user = await userService.updateUserProfile(req.user.id, req.body);
    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// POST /api/users/me/avatar — Upload a profile picture
const uploadAvatarController = async (req, res, next) => {
  try {
    await handleAvatarUpload(req, res);

    if (!req.file) {
      throw new ApiError(400, 'No image file received. Send the file as a multipart field named "avatar".');
    }

    const avatarUrl = `${req.protocol}://${req.get("host")}/uploads/avatars/${req.file.filename}`;
    const user = await userService.updateUserAvatar(req.user.id, avatarUrl);

    return res.status(200).json(
      new ApiResponse(true, "Profile picture updated successfully", { avatarUrl, user })
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/users/me/resume — Upload a resume (PDF, DOC, DOCX)
// The uploaded file URL is saved to the user's resumeUrl field.
const uploadResumeController = async (req, res, next) => {
  try {
    await handleResumeUpload(req, res);

    if (!req.file) {
      throw new ApiError(400, 'No file received. Send the PDF/DOC as a multipart field named "resume".');
    }

    // Cloudinary returns req.file.path as the CDN URL;
    // local disk storage uses req.file.filename which we build into a full URL.
    const resumeUrl = req.file.path
      ? req.file.path  // Cloudinary secure URL
      : `${req.protocol}://${req.get("host")}/uploads/resumes/${req.file.filename}`;

    const user = await userService.updateUserProfile(req.user.id, { resumeUrl });

    return res.status(200).json(
      new ApiResponse(true, "Resume uploaded successfully", { resumeUrl, user })
    );
  } catch (error) {
    next(error);
  }
};

// POST /api/users/me/change-password — Securely change password
const changePasswordController = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await userService.changeUserPassword(req.user.id, currentPassword, newPassword);
    return res.status(200).json(new ApiResponse(true, result.message, null));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/me/stats — Get dashboard metrics
const getMyStatsController = async (req, res, next) => {
  try {
    const stats = await userService.getUserDashboardStats(req.user.id);
    return res.status(200).json(new ApiResponse(true, "User Stats", stats));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/me/gigs — Get logged-in user's gigs
const getMyGigsController = async (req, res, next) => {
  try {
    const Gig = require("../models/Gig");
    const gigs = await Gig.find({ postedBy: req.user.id })
      .populate("postedBy", "name email avatar college rating")
      .sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(true, "My Gigs", gigs));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/me/reviews — Get logged-in user's reviews
const getMyReviewsController = async (req, res, next) => {
  try {
    const Review = require("../models/Review");
    const reviews = await Review.find({ reviewedUser: req.user.id })
      .populate("reviewer", "name avatar college")
      .sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(true, "My Reviews", reviews));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id — Public user profile
const getUserByIdController = async (req, res, next) => {
  try {
    const user = await userService.getPublicProfile(req.params.id);
    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id/gigs — Public user gigs
const getUserGigsController = async (req, res, next) => {
  try {
    const Gig = require("../models/Gig");
    const gigs = await Gig.find({ postedBy: req.params.id })
      .populate("postedBy", "name email avatar college rating")
      .sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(true, "User Gigs", gigs));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id/reviews — Public user reviews
const getUserReviewsPublicController = async (req, res, next) => {
  try {
    const Review = require("../models/Review");
    const reviews = await Review.find({ reviewedUser: req.params.id })
      .populate("reviewer", "name avatar college")
      .sort({ createdAt: -1 });
    return res.status(200).json(new ApiResponse(true, "User Reviews", reviews));
  } catch (error) {
    next(error);
  }
};

// GET /api/users/colleges — College list filter
const getCollegesController = async (req, res, next) => {
  try {
    const results = await userService.getCollegesList(req.query.q);
    return res.status(200).json(new ApiResponse(true, "College List", results));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyProfileController,
  updateMyProfileController,
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
};
