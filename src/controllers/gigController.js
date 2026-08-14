// ============================================================
// controllers/gigController.js — Gig Request Handler
//
// Receives HTTP requests for gig operations and sends responses.
// All business logic lives in gigService.js.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const {
  createGig,
  getAllGigs,
  getGigById,
  updateGig,
  deleteGig,
} = require("../services/gigService");

// POST /api/gigs — Create a new gig (auth required)
const createGigController = async (req, res, next) => {
  try {
    // Attach the logged-in user's ID as the gig's owner
    let gig = await createGig({ ...req.body, postedBy: req.user.id });
    // Populate the owner's details before sending the response
    gig = await gig.populate("postedBy", "name email avatar college rating totalReviews");
    return res.status(201).json(new ApiResponse(true, "Gig Created Successfully", gig));
  } catch (error) {
    next(error);
  }
};

// GET /api/gigs — Get all gigs (supports filters via query params)
const getAllGigsController = async (req, res, next) => {
  try {
    // Extract filter options from the URL query string
    const filters = {
      category:  req.query.category,
      status:    req.query.status,
      keyword:   req.query.keyword || req.query.search, // Support both names
      minBudget: req.query.minBudget,
      maxBudget: req.query.maxBudget,
      postedBy:  req.query.postedBy,
      college:   req.query.college,
      sortBy:    req.query.sortBy,
      order:     req.query.order,
    };
    const gigs = await getAllGigs(filters);
    return res.status(200).json(new ApiResponse(true, "All Gigs", gigs));
  } catch (error) {
    next(error);
  }
};

// GET /api/gigs/:id — Get a single gig by its ID
const getGigByIdController = async (req, res, next) => {
  try {
    const gig = await getGigById(req.params.id);
    return res.status(200).json(new ApiResponse(true, "Gig Found", gig));
  } catch (error) {
    next(error);
  }
};

// PUT /api/gigs/:id — Update a gig (auth required, owner only)
const updateGigController = async (req, res, next) => {
  try {
    const gig = await updateGig(req.params.id, req.user.id, req.body);
    return res.status(200).json(new ApiResponse(true, "Gig Updated Successfully", gig));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/gigs/:id — Delete a gig (auth required, owner only)
const deleteGigController = async (req, res, next) => {
  try {
    await deleteGig(req.params.id, req.user.id);
    return res.status(200).json(new ApiResponse(true, "Gig Deleted Successfully", null));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGigController,
  getAllGigsController,
  getGigByIdController,
  updateGigController,
  deleteGigController,
};
