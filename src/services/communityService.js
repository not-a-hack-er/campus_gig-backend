// ============================================================
// services/communityService.js — Community Business Logic
//
// Handles creating communities, joining/leaving, and posts.
// ============================================================

const Community     = require("../models/Community");
const CommunityPost = require("../models/CommunityPost");
const ApiError      = require("../utils/ApiError");

// Create a new community
// The creator (ownerId) automatically becomes a member
const createCommunity = async (communityData, ownerId) => {
  // Don't allow two communities with the same name
  const existingCommunity = await Community.findOne({ name: communityData.name });
  if (existingCommunity) {
    throw new ApiError(400, "A community with this name already exists");
  }

  // "creator" is an alias for "owner" — map it if present
  if (communityData.creator !== undefined) {
    communityData.owner = communityData.creator;
  }

  return await Community.create({
    ...communityData,
    owner:   ownerId,
    members: [ownerId], // Creator is the first member
  });
};

// Get all communities with owner and members populated
const getCommunities = async () => {
  return await Community.find()
    .populate("owner",   "name email avatar")
    .populate("members", "name email avatar");
};

// Get a single community by its ID
const getCommunityById = async (communityId) => {
  const community = await Community.findById(communityId)
    .populate("owner",   "name email avatar college branch rating totalReviews")
    .populate("members", "name email avatar college branch rating totalReviews");

  if (!community) {
    throw new ApiError(404, "Community Not Found");
  }

  return community;
};

// Add a user to a community's members list
// Uses $addToSet for atomic, race-condition-safe membership addition.
// $addToSet is idempotent — it only adds the userId if it's not already present,
// so concurrent join requests cannot cause duplicate member entries.
const joinCommunity = async (communityId, userId) => {
  const community = await Community.findById(communityId);
  if (!community) {
    throw new ApiError(404, "Community Not Found");
  }

  // Check membership in the current document before the atomic update.
  // This gives a clear error message; the DB constraint prevents duplicates anyway.
  const isAlreadyMember = community.members.some(
    (memberId) => memberId.toString() === userId.toString()
  );
  if (isAlreadyMember) {
    throw new ApiError(400, "You are already a member of this community");
  }

  // $addToSet is atomic — safe under concurrent requests (no race condition)
  await Community.findByIdAndUpdate(
    communityId,
    { $addToSet: { members: userId } },
    { new: true }
  );

  // Return the fully populated community after joining
  return await getCommunityById(communityId);
};

// Remove a user from a community's members list
// Uses $pull for atomic, race-condition-safe membership removal.
const leaveCommunity = async (communityId, userId) => {
  const community = await Community.findById(communityId);
  if (!community) {
    throw new ApiError(404, "Community Not Found");
  }

  // Check membership
  const isMember = community.members.some(
    (memberId) => memberId.toString() === userId.toString()
  );
  if (!isMember) {
    throw new ApiError(400, "You are not a member of this community");
  }

  // Prevent the owner from leaving their own community
  if (community.owner.toString() === userId.toString()) {
    throw new ApiError(400, "Community owner cannot leave. Transfer ownership or delete the community.");
  }

  // $pull is atomic — safe under concurrent requests
  await Community.findByIdAndUpdate(
    communityId,
    { $pull: { members: userId } },
    { new: true }
  );

  return await getCommunityById(communityId);
};

// Create a post inside a community
const createPost = async (communityId, authorId, content) => {
  const community = await Community.findById(communityId);
  if (!community) throw new ApiError(404, 'Community not found');
  if (!community.members.some(id => String(id) === String(authorId))) {
    throw new ApiError(403, 'Join the community before posting');
  }
  if (typeof content !== 'string' || !content.trim() || content.length > 10000) {
    throw new ApiError(400, 'Post content must contain 1 to 10000 characters');
  }
  return await CommunityPost.create({
    community: communityId,
    author:    authorId,
    content,
  });
};

// Get all posts in a community, newest first
const getCommunityFeed = async (communityId, userId) => {
  const community = await Community.findById(communityId);
  if (!community) throw new ApiError(404, 'Community not found');
  if (community.isPrivate && !community.members.some(id => String(id) === String(userId))) {
    throw new ApiError(403, 'Join the community to view its private feed');
  }
  return await CommunityPost.find({ community: communityId })
    .populate("author", "name")
    .sort({ createdAt: -1 });
};

module.exports = {
  createCommunity,
  getCommunities,
  getCommunityById,
  joinCommunity,
  leaveCommunity,
  createPost,
  getCommunityFeed,
};
