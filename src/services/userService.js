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
    "yearOfStudy", "graduationYear", "skills", "github", "linkedin", "portfolio", "resumeUrl", "fcmToken", "number",
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

// Update user's FCM token for Push Notifications
const updateUserFcmToken = async (userId, fcmToken) => {
  if (typeof fcmToken !== "string") {
    throw new ApiError(400, "fcmToken must be a string");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { fcmToken: fcmToken.trim() } },
    { new: true }
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

const deleteUserAccount = async (userId, confirmation) => {
  if (confirmation !== "DELETE") throw new ApiError(400, "Type DELETE to confirm account deletion");
  const Message = require("../models/Message");
  const Conversation = require("../models/Conversation");
  const Notification = require("../models/Notification");
  const Feedback = require("../models/Feedback");
  const Community = require("../models/Community");
  const CommunityPost = require("../models/CommunityPost");
  const ownedGigIds = await Gig.find({ postedBy: userId }).distinct("_id");
  const affectedGigIds = await Application.find({ applicant: userId }).distinct("gig");
  const conversationIds = await Conversation.find({ participants: userId }).distinct("_id");
  const ownedCommunityIds = await Community.find({ owner: userId }).distinct("_id");

  await Gig.updateMany({ acceptedApplicant: userId, status: { $in: ["IN_PROGRESS", "WORK_SUBMITTED"] } },
    { $set: { status: "OPEN", acceptedApplicant: null, submittedWorkUrl: "", submittedWorkNote: "" } });
  await Promise.all([
    Message.deleteMany({ conversationId: { $in: conversationIds } }),
    Conversation.deleteMany({ _id: { $in: conversationIds } }),
    Application.deleteMany({ $or: [{ applicant: userId }, { gig: { $in: ownedGigIds } }] }),
    Review.deleteMany({ $or: [{ reviewer: userId }, { reviewedUser: userId }, { gig: { $in: ownedGigIds } }] }),
    Notification.deleteMany({ $or: [{ recipient: userId }, { actor: userId }] }), Feedback.deleteMany({ user: userId }),
    CommunityPost.deleteMany({ $or: [{ author: userId }, { community: { $in: ownedCommunityIds } }] }),
    Community.deleteMany({ _id: { $in: ownedCommunityIds } }),
    Community.updateMany({ members: userId }, { $pull: { members: userId } }),
    Gig.deleteMany({ _id: { $in: ownedGigIds } }),
  ]);
  for (const gigId of affectedGigIds.filter(id => !ownedGigIds.some(owned => String(owned) === String(id)))) {
    const count = await Application.countDocuments({ gig: gigId, status: { $ne: "WITHDRAWN" } });
    await Gig.updateOne({ _id: gigId }, { $set: { applicationsCount: count } });
  }
  const db = require("mongoose").connection.db;
  const files = await db.collection("userUploads.files").find({ "metadata.owner": String(userId) }).project({ _id: 1 }).toArray();
  if (files.length) {
    const ids = files.map(file => file._id);
    await db.collection("userUploads.chunks").deleteMany({ files_id: { $in: ids } });
    await db.collection("userUploads.files").deleteMany({ _id: { $in: ids } });
  }
  await User.findByIdAndDelete(userId);
};

module.exports = {
  getUserById,
  updateUserProfile,
  updateUserFcmToken,
  updateUserAvatar,
  changeUserPassword,
  getUserDashboardStats,
  getPublicProfile,
  getCollegesList,
  deleteUserAccount,
};
