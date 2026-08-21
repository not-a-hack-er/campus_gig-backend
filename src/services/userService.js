// ============================================================
// services/userService.js — User Business Logic
//
// Encapsulates all database query logic for user profiles,
// dashboard stats, security, and reviews.
// ============================================================

const bcrypt      = require("bcryptjs");
const User        = require("../models/User");
const Gig         = require("../models/Gig");
const Application = require("../models/Application");
const Review      = require("../models/Review");
const ApiError    = require("../utils/ApiError");

// Get a user's profile by ID
const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

// Update user profile fields
const updateUserProfile = async (userId, bodyData) => {
  // Map Android app's alternate field names to actual schema field names
  if (bodyData.githubProfile   !== undefined) bodyData.github   = bodyData.githubProfile;
  if (bodyData.linkedinProfile !== undefined) bodyData.linkedin = bodyData.linkedinProfile;
  if (bodyData.profilePicture  !== undefined) bodyData.avatar   = bodyData.profilePicture;
  if (bodyData.portfolioLinks  !== undefined) {
    const links = bodyData.portfolioLinks;
    bodyData.portfolio = Array.isArray(links) && links.length > 0
      ? links[0]
      : typeof links === "string" ? links : "";
  }

  const allowedFields = [
    "name", "bio", "avatar", "college", "branch",
    "graduationYear", "skills", "github", "linkedin", "portfolio", "resumeUrl",
  ];

  const updates = {};
  for (const key of Object.keys(bodyData)) {
    if (allowedFields.includes(key)) {
      updates[key] = bodyData[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!user) throw new ApiError(404, "User not found");
  return user;
};

// Update user avatar picture URL
const updateUserAvatar = async (userId, avatarUrl) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { avatar: avatarUrl } },
    { new: true }
  );
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

// Change user password securely
const changeUserPassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current password and new password are required");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters long");
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, "New password must be different from current password");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  return { message: "Password updated successfully" };
};

// Get dashboard stats for the logged-in user
const getUserDashboardStats = async (userId) => {
  const [user, gigsPosted, openGigs, completedGigs, totalApplications, totalReviews] = await Promise.all([
    User.findById(userId),
    Gig.countDocuments({ postedBy: userId }),
    Gig.countDocuments({ postedBy: userId, status: "OPEN" }),
    Gig.countDocuments({ postedBy: userId, status: "COMPLETED" }),
    Application.countDocuments({ applicant: userId }),
    Review.countDocuments({ reviewedUser: userId }),
  ]);

  if (!user) throw new ApiError(404, "User not found");

  return {
    gigsPosted,
    applicationsSubmitted: totalApplications,
    reviewsReceived:       totalReviews,
    gigsCompleted:         completedGigs,
    rating:                user.rating || 0,
    totalReviews:          totalReviews,
    totalApplications:     totalApplications,
    completedGigsCount:    completedGigs,
    openGigsCount:         openGigs,
  };
};

// Get public user profile
const getPublicProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

// Get college list dropdown filter
const getCollegesList = async (queryStr = "") => {
  const sampleColleges = [
    "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kharagpur", "IIT Kanpur",
    "BITS Pilani", "NIT Trichy", "NIT Surathkal", "DTU Delhi", "NSUT Delhi",
    "Jadavpur University", "VIT Vellore", "SRM University", "Manipal Institute of Technology",
    "Thapar University", "PES University", "RV College of Engineering", "MSRIT Bangalore",
  ];

  if (!queryStr || !queryStr.trim()) {
    return sampleColleges;
  }

  const search = queryStr.trim().toLowerCase();
  return sampleColleges.filter((c) => c.toLowerCase().includes(search));
};

module.exports = {
  getUserById,
  updateUserProfile,
  updateUserAvatar,
  changeUserPassword,
  getUserDashboardStats,
  getPublicProfile,
  getCollegesList,
};
