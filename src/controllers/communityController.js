// ============================================================
// controllers/communityController.js — Community Request Handler
//
// Handles HTTP requests for community operations.
// All business logic lives in communityService.js.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const ApiError    = require("../utils/ApiError");
const {
  createCommunity,
  getCommunities,
  getCommunityById,
  joinCommunity,
  leaveCommunity,
  createPost,
  getCommunityFeed,
} = require("../services/communityService");

// POST /api/communities — Create a new community
const createCommunityController = async (req, res, next) => {
  try {
    const community = await createCommunity(req.body, req.user.id);
    return res.status(201).json(new ApiResponse(true, "Community Created", community));
  } catch (error) {
    next(error);
  }
};

// GET /api/communities — Get all communities
const getCommunitiesController = async (req, res, next) => {
  try {
    const list = await getCommunities();
    return res.status(200).json(new ApiResponse(true, "Communities Fetched", list));
  } catch (error) {
    next(error);
  }
};

// GET /api/communities/:id — Get a single community by ID
const getCommunityByIdController = async (req, res, next) => {
  try {
    const community = await getCommunityById(req.params.id);
    return res.status(200).json(new ApiResponse(true, "Community Fetched", community));
  } catch (error) {
    next(error);
  }
};

// POST /api/communities/:id/join — Join a community
const joinCommunityController = async (req, res, next) => {
  try {
    // Support both :communityId and :id param names
    const communityId = req.params.communityId || req.params.id;
    const community = await joinCommunity(communityId, req.user.id);
    return res.status(200).json(new ApiResponse(true, "Joined Community", community));
  } catch (error) {
    next(error);
  }
};

// POST /api/communities/:id/leave — Leave a community
const leaveCommunityController = async (req, res, next) => {
  try {
    const communityId = req.params.communityId || req.params.id;
    const community = await leaveCommunity(communityId, req.user.id);
    return res.status(200).json(new ApiResponse(true, "Left Community", community));
  } catch (error) {
    next(error);
  }
};

// POST /api/communities/:communityId/posts — Create a post in a community
const createPostController = async (req, res, next) => {
  try {
    if (!req.body.content || !req.body.content.trim()) {
      return next(new ApiError(400, "Post content is required"));
    }
    const post = await createPost(req.params.communityId, req.user.id, req.body.content.trim());
    return res.status(201).json(new ApiResponse(true, "Post Created", post));
  } catch (error) {
    next(error);
  }
};

// GET /api/communities/:communityId/feed — Get posts in a community
const getCommunityFeedController = async (req, res, next) => {
  try {
    const feed = await getCommunityFeed(req.params.communityId);
    return res.status(200).json(new ApiResponse(true, "Community Feed", feed));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCommunityController,
  getCommunitiesController,
  getCommunityByIdController,
  joinCommunityController,
  leaveCommunityController,
  createPostController,
  getCommunityFeedController,
};