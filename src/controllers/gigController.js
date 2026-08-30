// ============================================================
// controllers/gigController.js — Gig Request Handler (v3.0)
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
  submitWork,
  requestCompletionOtp,
  completeGig,
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
    const filters = {
      category:  req.query.category,
      status:    req.query.status,
      keyword:   req.query.keyword || req.query.search,
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
// NOTE: Status changes are validated by the state machine guard in gigService.
// To complete a gig, use POST /api/gigs/:id/complete with an OTP.
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

// POST /api/gigs/:id/submit-work — Worker submits deliverable
//
// Called by the ACCEPTED applicant when they've finished the work.
// Required body: { submittedUrl: "https://..." }
// Optional body: { submittedNote: "Here's the handover info..." }
// Effect: gig transitions IN_PROGRESS → WORK_SUBMITTED, OTP sent to employer.
const submitWorkController = async (req, res, next) => {
  try {
    const result = await submitWork(
      req.params.id,
      req.user.id,
      req.body.submittedUrl,
      req.body.submittedNote
    );
    return res.status(200).json(new ApiResponse(true, result.message, { gigStatus: result.gigStatus }));
  } catch (error) {
    next(error);
  }
};

// GET /api/gigs/:id/completion-otp — Employer requests/refreshes the completion OTP
//
// Called by the gig poster when they need the OTP (lost notification, etc.).
// Returns the plaintext 4-digit OTP and its expiry time.
// Auth: only the gig poster can call this.
const requestCompletionOtpController = async (req, res, next) => {
  try {
    const result = await requestCompletionOtp(req.params.id, req.user.id);
    return res.status(200).json(new ApiResponse(true, result.message, {
      otp:       result.otp,
      expiresAt: result.expiresAt,
    }));
  } catch (error) {
    next(error);
  }
};

// POST /api/gigs/:id/complete — Employer enters OTP to confirm gig completion
//
// Required body: { otp: "1234" }
// Effect: gig transitions WORK_SUBMITTED → COMPLETED.
//         Worker's gigsCompleted incremented. Both parties notified.
// Auth: only the gig poster can call this.
const completeGigController = async (req, res, next) => {
  try {
    const result = await completeGig(req.params.id, req.user.id, req.body.otp);
    return res.status(200).json(new ApiResponse(true, result.message, { gigStatus: result.gigStatus }));
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
  submitWorkController,
  requestCompletionOtpController,
  completeGigController,
};
