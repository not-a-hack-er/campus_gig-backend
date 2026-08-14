// ============================================================
// controllers/applicationController.js — Application Request Handler
//
// Handles HTTP requests for job applications.
//
// NOTE ON NOTIFICATIONS:
//   Notification sending was moved to applicationService.js (v2.0).
//   The service now sends notifications inside the atomic transaction
//   block after the DB writes are committed.  This controller must NOT
//   send a second notification, as that would result in duplicates.
// ============================================================

const ApiResponse = require("../utils/ApiResponse");
const {
  applyForGig,
  getGigApplications,
  getMyApplications,
  updateApplicationStatus,
} = require("../services/applicationService");

// POST /api/applications/:gigId — Apply for a gig
const applyForGigController = async (req, res, next) => {
  try {
    const result = await applyForGig(
      req.params.gigId,
      req.user.id,
      req.body.proposal,
      req.body.expectedBudget
    );
    return res.status(201).json(new ApiResponse(true, "Application Submitted", result));
  } catch (error) {
    next(error);
  }
};

// GET /api/applications/gig/:gigId — Get all applications for a gig (owner only)
const getGigApplicationsController = async (req, res, next) => {
  try {
    // Pass callerUserId so the service can verify ownership
    const applications = await getGigApplications(req.params.gigId, req.user.id);
    return res.status(200).json(new ApiResponse(true, "Applications Fetched", applications));
  } catch (error) {
    next(error);
  }
};

// GET /api/applications/my — Get all applications submitted by the logged-in user
const getMyApplicationsController = async (req, res, next) => {
  try {
    const applications = await getMyApplications(req.user.id);
    return res.status(200).json(new ApiResponse(true, "My Applications", applications));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/applications/:applicationId/status — Accept or reject an application
// Only the gig owner (or applicant for withdrawal) can call this.
// Notification sending is handled inside applicationService.updateApplicationStatus().
const updateApplicationStatusController = async (req, res, next) => {
  try {
    // Pass callerUserId so the service can verify authorization
    const application = await updateApplicationStatus(
      req.params.applicationId,
      req.body.status,
      req.user.id
    );
    return res.status(200).json(new ApiResponse(true, "Application Updated", application));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  applyForGigController,
  getGigApplicationsController,
  getMyApplicationsController,
  updateApplicationStatusController,
};