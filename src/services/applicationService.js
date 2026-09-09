// ============================================================
// services/applicationService.js — Application Business Logic (v3.0)
//
// KEY ARCHITECTURAL PATTERNS:
//
// 1. CAS-FIRST PATTERN (standalone MongoDB safe):
//    Instead of ACID transactions (which require a replica set),
//    we use a Compare-And-Swap approach: claim the Gig first with
//    findOneAndUpdate({ status: "OPEN" }), then update Application.
//    If Application save fails, we compensate by reverting the Gig.
//
// 2. CONCURRENT ACCEPTANCE PREVENTION (Atomic CAS):
//    findOneAndUpdate with precondition { status: "OPEN" } ensures
//    only ONE accept can succeed even under concurrent requests.
//
// 3. SELECTIVE POPULATION PROJECTION:
//    Every .populate() call explicitly whitelists safe fields.
//    "-password" and any internal fields are never included.
//
// ============================================================

const Application = require("../models/Application");
const Gig         = require("../models/Gig");
const User        = require("../models/User");
const ApiError    = require("../utils/ApiError");
const { createNotification } = require("./notificationService");

// ─── Shared population paths (DRY — never diverge across queries) ─────────────
const APPLICANT_POPULATE = "name email avatar college rating totalReviews";
const POSTER_POPULATE    = "name email college rating totalReviews";

const GIG_POPULATE_PATH = {
  path: "gig",
  populate: { path: "postedBy", select: POSTER_POPULATE },
};

// ─────────────────────────────────────────────────────────────────────────────
// Apply for a Gig
// Checks: gig exists → caller is not the owner → gig is OPEN →
//         not already applied → save → notify poster
// ─────────────────────────────────────────────────────────────────────────────
const applyForGig = async (gigId, userId, proposal, expectedBudget) => {
  const gig = await Gig.findById(gigId).populate("postedBy", POSTER_POPULATE);
  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }

  // The person who posted the gig cannot apply to their own gig
  if (gig.postedBy._id.toString() === userId.toString()) {
    throw new ApiError(400, "You cannot apply to your own gig");
  }

  // Only allow applications to open gigs
  if (gig.status && gig.status.toUpperCase() !== "OPEN") {
    throw new ApiError(400, "This gig is no longer accepting applications");
  }

  // Don't allow the same person to apply twice to the same gig
  const existingApplication = await Application.findOne({ gig: gigId, applicant: userId });
  if (existingApplication) {
    throw new ApiError(400, "You have already applied to this gig");
  }

  // ── SINGLE ACTIVE GIG CONSTRAINT ──────────────────────────────────────────
  // A worker can only work on ONE active gig at a time.
  // If they have an accepted application for a gig currently IN_PROGRESS or WORK_SUBMITTED,
  // they cannot apply for additional gigs until completing their active work.
  const assignedGig = await Gig.findOne({
    acceptedApplicant: userId,
    status: { $in: ['IN_PROGRESS', 'WORK_SUBMITTED'] },
  });
  const activeHiredApp = assignedGig ? { gig: assignedGig } : null;

  if (activeHiredApp && activeHiredApp.gig) {
    const activeGigStatus = (activeHiredApp.gig.status || "").toUpperCase();
    const assignedWorkerId = activeHiredApp.gig.acceptedApplicant;
    const isAssignedWorker = assignedWorkerId && assignedWorkerId.toString() === userId.toString();
    if (isAssignedWorker && ["IN_PROGRESS", "WORK_SUBMITTED"].includes(activeGigStatus)) {
      throw new ApiError(
        400,
        `You already have an active gig in progress ("${activeHiredApp.gig.title}"). ` +
        `Please complete your current gig before applying for new opportunities!`
      );
    }
  }
  // ── ANTI-COLLUSION (REVIEW FARMING) CONSTRAINT ───────────────────────────
  // A worker cannot apply to gigs from the same employer if they completed a
  // gig for them within the last 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const recentCompletedGigs = await Gig.find({
    postedBy: gig.postedBy._id,
    status: "COMPLETED",
    updatedAt: { $gt: sevenDaysAgo }
  }).select("_id");

  if (recentCompletedGigs.length > 0) {
    const recentGigIds = recentCompletedGigs.map(g => g._id);
    const recentHiredApp = await Application.findOne({
      applicant: userId,
      gig: { $in: recentGigIds },
      status: "ACCEPTED"
    });

    if (recentHiredApp) {
      throw new ApiError(
        400,
        "To maintain fair reviews, you cannot work for an employer you recently collaborated with until a 7-day cooldown period passes."
      );
    }
  }
  // Validate required fields
  if (!proposal || !proposal.trim()) {
    throw new ApiError(400, "Proposal is required");
  }
  if (!expectedBudget || isNaN(Number(expectedBudget)) || Number(expectedBudget) <= 0) {
    throw new ApiError(400, "A valid expectedBudget is required");
  }

  const applicant = await User.findById(userId).select("name");
  const applicantName = applicant ? applicant.name : "Someone";

  let application = await Application.create({
    gig: gigId,
    applicant: userId,
    proposal: proposal.trim(),
    expectedBudget: Number(expectedBudget),
  });

  application = await Application.findById(application._id)
    .populate(GIG_POPULATE_PATH)
    .populate("applicant", APPLICANT_POPULATE);

  // Increment the gig's application counter
  await Gig.findByIdAndUpdate(gigId, { $inc: { applicationsCount: 1 } });

  // Notify the gig poster — failure must never block the application submit
  try {
    const posterId = gig.postedBy._id || gig.postedBy;
    await createNotification(
      posterId,
      `📩 New Application for "${gig.title}"`,
      `${applicantName} has applied to your gig "${gig.title}". Review their proposal now!`,
      {
        type:          "new_application",
        referenceId:   application._id.toString(),
        referenceType: "Application",
      }
    );
  } catch (notifError) {
    console.error("[applyForGig] Notification error:", notifError.message);
  }

  return application;
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all applications for a specific gig (gig owner only)
// ─────────────────────────────────────────────────────────────────────────────
const getGigApplications = async (gigId, callerUserId) => {
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }
  if (gig.postedBy.toString() !== callerUserId.toString()) {
    throw new ApiError(403, "You can only view applications for your own gigs");
  }

  return await Application.find({ gig: gigId })
    .populate("applicant", APPLICANT_POPULATE + " gigsCompleted")
    .populate(GIG_POPULATE_PATH)
    .sort({ createdAt: -1 });
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all applications submitted by the logged-in user
// ─────────────────────────────────────────────────────────────────────────────
const getMyApplications = async (userId) => {
  return await Application.find({ applicant: userId })
    .populate("applicant", APPLICANT_POPULATE + " gigsCompleted")
    .populate({
      path: "gig",
      select: "title budget status category skillsRequired location deadline applicationsCount postedBy",
      populate: { path: "postedBy", select: POSTER_POPULATE },
    })
    .sort({ createdAt: -1 });
};

// ─────────────────────────────────────────────────────────────────────────────
// Update Application Status — CAS-First Pattern (standalone MongoDB safe)
//
// WHY NO TRANSACTIONS?
//   MongoDB transactions require a replica set. In local dev (standalone
//   mongod) calling session.startTransaction() throws:
//     "Transaction numbers are only allowed on a replica set member or mongos"
//   This crashed the Accept flow completely.
//
// SAFE ALTERNATIVE — CAS-FIRST PATTERN:
//   For ACCEPT: we do the Gig CAS update FIRST. This is the critical
//   step — it atomically claims the gig. Only then do we update the
//   application status. Even if the app save fails, the gig is claimed
//   (no double-accept), and a simple retry or manual fix resolves it.
//
//   For REJECT/WITHDRAWN: there's no cross-document invariant to break,
//   so a simple sequential update is perfectly safe.
//
// CONCURRENT ACCEPTANCE PREVENTION (CAS):
//   findOneAndUpdate with precondition { status: "OPEN" }. If two
//   requests race, only the first finds the gig as OPEN and wins.
//   The second gets null → 409 Conflict.
// ─────────────────────────────────────────────────────────────────────────────
const updateApplicationStatus = async (applicationId, status, callerUserId) => {
  // Pre-flight: load the application with required relations for auth checks
  let application = await Application.findById(applicationId)
    .populate("applicant", APPLICANT_POPULATE)
    .populate(GIG_POPULATE_PATH);

  if (!application) {
    throw new ApiError(404, "Application Not Found");
  }

  const uppercaseStatus = (status || "").toUpperCase();

  // Validate the status value against the allowed enum before touching the DB
  const ALLOWED_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"];
  if (!ALLOWED_STATUSES.includes(uppercaseStatus)) {
    throw new ApiError(400, `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`);
  }

  const gigOwnerId  = application.gig.postedBy._id || application.gig.postedBy;
  const isGigOwner  = gigOwnerId.toString() === callerUserId.toString();
  const applicantId = application.applicant?._id || application.applicant;
  const isApplicant = applicantId.toString() === callerUserId.toString();

  // Authorization rules
  if (isApplicant && uppercaseStatus === "WITHDRAWN") {
    if (application.status.toUpperCase() !== "PENDING") {
      throw new ApiError(400, "You can only withdraw pending applications");
    }
  } else if (!isGigOwner) {
    throw new ApiError(403, "You are not authorized to update this application");
  }

  // ── CAS-FIRST UPDATE (no transaction needed) ──────────────────────────────

  if (uppercaseStatus === "ACCEPTED") {
    // Check if applicant ALREADY has an active hired gig in progress with another employer
    const otherAssignedGig = await Gig.findOne({
      acceptedApplicant: applicantId,
      status: { $in: ['IN_PROGRESS', 'WORK_SUBMITTED'] },
      _id: { $ne: application.gig._id },
    });
    const existingActiveApp = otherAssignedGig ? { gig: otherAssignedGig } : null;

    if (existingActiveApp && existingActiveApp.gig) {
      const activeStatus = (existingActiveApp.gig.status || "").toUpperCase();
      const assignedWorkerId = existingActiveApp.gig.acceptedApplicant;
      const isAssignedWorker = assignedWorkerId && assignedWorkerId.toString() === applicantId.toString();
      if (isAssignedWorker && ["IN_PROGRESS", "WORK_SUBMITTED"].includes(activeStatus)) {
        throw new ApiError(
          400,
          `This applicant is currently working on another active gig ("${existingActiveApp.gig.title}"). ` +
          `They must complete their current active gig before being hired for a new one.`
        );
      }
    }

    // STEP 1 (CAS): Atomically transition gig OPEN → IN_PROGRESS.
    // This is the critical guard — only ONE concurrent request can win.
    // Also record the accepted applicant on the gig for the completion flow.
    const updatedGig = await Gig.findOneAndUpdate(
      { _id: application.gig._id, status: "OPEN" },
      { $set: { status: "IN_PROGRESS", acceptedApplicant: applicantId } },
      { new: true }
    );

    if (!updatedGig) {
      throw new ApiError(409, "This gig has already been accepted by another applicant.");
    }

    // STEP 2: Update application status. Gig is already claimed, so this is safe.
    // If this fails, the gig is IN_PROGRESS but no application is ACCEPTED —
    // easy to diagnose and fix. The critical invariant (no double-accept) holds.
    try {
      application.status = status;
      await application.save();
    } catch (saveErr) {
      // Compensate: revert gig back to OPEN if application save failed
      console.error("[updateApplicationStatus] Application save failed, reverting gig:", saveErr.message);
      await Gig.findByIdAndUpdate(application.gig._id, { $set: { status: "OPEN", acceptedApplicant: null } });
      throw saveErr;
    }
  } else if (uppercaseStatus === "WITHDRAWN") {
    // Atomically consume the PENDING state. Without this CAS, two concurrent
    // withdrawal requests can both read PENDING and decrement the gig counter
    // twice, eventually making applicationsCount negative.
    const withdrawnApplication = await Application.findOneAndUpdate(
      { _id: applicationId, applicant: callerUserId, status: "PENDING" },
      { $set: { status: "WITHDRAWN" } },
      { new: true, runValidators: true }
    );

    if (!withdrawnApplication) {
      throw new ApiError(409, "This application has already been updated.");
    }

    // Retain the populated gig/applicant data loaded above for the response
    // and notification, while reflecting the persisted status.
    application.status = withdrawnApplication.status;

    // Do not decrement a corrupted/legacy counter below zero. The repair
    // utility reconciles existing records with their source applications.
    await Gig.findOneAndUpdate(
      { _id: application.gig._id, applicationsCount: { $gt: 0 } },
      { $inc: { applicationsCount: -1 } }
    );

    // Notify the gig poster that this applicant has withdrawn
    try {
      const gigTitle    = application.gig?.title || "your gig";
      const posterId    = gigOwnerId.toString();
      const applicantName = application.applicant?.name || "An applicant";
      await createNotification(
        posterId,
        "Application Withdrawn",
        `${applicantName} has withdrawn their application for "${gigTitle}".`,
        {
          type:          "application_withdrawn",
          referenceId:   applicationId.toString(),
          referenceType: "Application",
        }
      );
    } catch (notifError) {
      console.error("[updateApplicationStatus] Withdrawal notification error:", notifError.message);
    }
  } else {
    // REJECTED or PENDING — just update the application
    application.status = status;
    await application.save();
  }

  // ── END UPDATE ─────────────────────────────────────────────────────────────

  // Notify the applicant if they were accepted or rejected
  if (uppercaseStatus === "ACCEPTED" || uppercaseStatus === "REJECTED") {
    try {
      const gigTitle  = application.gig?.title || "your gig";
      const recipientId = applicantId.toString();
      const msg = uppercaseStatus === "ACCEPTED"
        ? `🎉 Congratulations! Your application for "${gigTitle}" has been accepted.`
        : `Your application for "${gigTitle}" was not selected this time. Keep applying!`;
      await createNotification(
        recipientId,
        uppercaseStatus === "ACCEPTED" ? "Application Accepted 🎉" : "Application Update",
        msg,
        {
          type:          uppercaseStatus === "ACCEPTED" ? "application_accepted" : "application_rejected",
          referenceId:   applicationId.toString(),
          referenceType: "Application",
        }
      );
    } catch (notifError) {
      console.error("[updateApplicationStatus] Notification error:", notifError.message);
    }
  }

  return application;
};

module.exports = {
  applyForGig,
  getGigApplications,
  getMyApplications,
  updateApplicationStatus,
};
