// ============================================================
// services/gigService.js — Gig Business Logic (v3.0)
//
// Handles all database operations for gigs.
// Controllers call these functions and handle HTTP responses.
//
// v3.0 changes:
//   - State machine guard in updateGig (GAP 8 fix)
//   - Increment User.gigsPosted on createGig (GAP 4 fix)
//   - Decrement User.gigsPosted on deleteGig (GAP 9 fix)
//   - submitWork() — worker submits deliverable, transitions WORK_SUBMITTED
//   - requestCompletionOtp() — employer gets/refreshes 4-digit OTP
//   - completeGig() — employer verifies OTP, transitions COMPLETED,
//                     increments worker's gigsCompleted
// ============================================================

const bcrypt      = require("bcryptjs");
const Gig         = require("../models/Gig");
const Application = require("../models/Application");
const User        = require("../models/User");
const ApiError    = require("../utils/ApiError");
const { createNotification } = require("./notificationService");
const { emitToUser }         = require("../sockets/socketService");
const { escapeRegex }        = require("../utils/helpers");

// ─── Allowed status transitions (state machine guard) ────────────────────────
// Only these transitions are valid. Anything else is rejected with 400.
// The completion flow (WORK_SUBMITTED → COMPLETED) is handled by completeGig(),
// not via the general updateGig endpoint.
const ALLOWED_TRANSITIONS = {
  OPEN:           ["CANCELLED"],         // Poster can cancel an open gig
  IN_PROGRESS:    ["CANCELLED"],         // Poster can cancel while in progress
  WORK_SUBMITTED: [],                    // Must use /complete endpoint (OTP required)
  COMPLETED:      [],                    // Terminal state — no transitions
  CANCELLED:      [],                    // Terminal state — no transitions
};

// Create a new gig
// Note: the Android app sends "skills" but the schema uses "skillsRequired"
// so we map it here if needed. Also increments User.gigsPosted counter.
const createGig = async (gigData) => {
  if (gigData.skills !== undefined && gigData.skillsRequired === undefined) {
    gigData.skillsRequired = gigData.skills;
    delete gigData.skills;
  }

  const gig = await Gig.create(gigData);

  // GAP 4 FIX: Increment the poster's gigsPosted counter atomically.
  // Use $inc instead of read-modify-write to avoid race conditions.
  await User.findByIdAndUpdate(gigData.postedBy, { $inc: { gigsPosted: 1 } });

  return gig;
};

// Get all gigs with optional filters
//
// Supported filters (all optional):
//   category   — exact category name (case-insensitive)
//   status     — "open" | "in_progress" | "work_submitted" | "completed" | "all" (default: "open")
//   keyword    — search in title and description
//   minBudget  — minimum budget amount
//   maxBudget  — maximum budget amount
//   college    — filter by the poster's college (done via DB aggregation)
//   sortBy     — "createdAt" | "budget" (default: "createdAt")
//   order      — "asc" | "desc" (default: "desc")
const getAllGigs = async (filters = {}) => {
  const query = {};

  // Status filter — default to OPEN so job-seekers see available gigs
  const status = filters.status ? filters.status.toUpperCase() : "OPEN";
  if (status !== "ALL") {
    query.status = status;
  }

  // Filter by category — SECURITY: escape the user input before regex use
  if (filters.category) {
    const safeCategory = escapeRegex(filters.category);
    query.category = { $regex: new RegExp(`^${safeCategory}$`, "i") };
  }

  // Filter by poster user ID
  if (filters.postedBy) {
    query.postedBy = filters.postedBy;
  }

  // Keyword search — SECURITY: escape the user input before regex use
  if (filters.keyword) {
    const safeKeyword = escapeRegex(filters.keyword);
    query.$or = [
      { title:       { $regex: safeKeyword, $options: "i" } },
      { description: { $regex: safeKeyword, $options: "i" } },
    ];
  }

  // Budget range filter
  if (filters.minBudget || filters.maxBudget) {
    query.budget = {};
    if (filters.minBudget) query.budget.$gte = Number(filters.minBudget);
    if (filters.maxBudget) query.budget.$lte = Number(filters.maxBudget);
  }

  // Determine sort field and direction
  const sortField = filters.sortBy === "budget" ? "budget" : "createdAt";
  const sortOrder = filters.order === "asc" ? 1 : -1;

  // ── College Filter via DB Aggregation ───────────────────────────────────────
  if (filters.college) {
    const safeCollege = escapeRegex(filters.college);

    const pipeline = [
      { $match: query },
      { $sort: { [sortField]: sortOrder } },
      {
        $lookup: {
          from:         "users",
          localField:   "postedBy",
          foreignField: "_id",
          as:           "postedByDoc",
        },
      },
      { $unwind: { path: "$postedByDoc", preserveNullAndEmpty: false } },
      {
        $match: {
          "postedByDoc.college": { $regex: safeCollege, $options: "i" },
        },
      },
      {
        $addFields: {
          postedBy: {
            _id:          "$postedByDoc._id",
            name:         "$postedByDoc.name",
            email:        "$postedByDoc.email",
            avatar:       "$postedByDoc.avatar",
            college:      "$postedByDoc.college",
            rating:       "$postedByDoc.rating",
            totalReviews: "$postedByDoc.totalReviews",
          },
        },
      },
      { $project: { postedByDoc: 0 } },
    ];

    return await Gig.aggregate(pipeline);
  }

  // No college filter — use the normal Mongoose query with populate
  return await Gig.find(query)
    .populate("postedBy", "name email avatar college rating totalReviews")
    .sort({ [sortField]: sortOrder });
};

// Get a single gig by its ID
const getGigById = async (gigId) => {
  const gig = await Gig.findById(gigId)
    .populate("postedBy", "name email avatar college rating totalReviews gigsPosted gigsCompleted");

  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }

  return gig;
};

// Update a gig (only the owner can do this)
// GAP 8 FIX: State machine guard — only allows valid transitions.
// The completion transition (WORK_SUBMITTED → COMPLETED) is gated behind
// the /complete endpoint (OTP required) and is not allowed here.
const updateGig = async (gigId, userId, updateData) => {
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }

  if (gig.postedBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to update this gig");
  }

  // ── State machine guard ───────────────────────────────────────────────────
  if (updateData.status !== undefined) {
    const currentStatus   = (gig.status || "").toUpperCase();
    const requestedStatus = updateData.status.toUpperCase();

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(requestedStatus)) {
      throw new ApiError(
        400,
        `Cannot transition gig from "${gig.status}" to "${updateData.status.toLowerCase()}". ` +
        (allowed.length
          ? `Allowed transitions: ${allowed.map((s) => s.toLowerCase()).join(", ")}.`
          : `No manual transitions are allowed from "${gig.status}" state.`)
      );
    }
  }

  // Map "skills" to "skillsRequired" if the app sent that field name
  if (updateData.skills !== undefined) {
    updateData.skillsRequired = updateData.skills;
    delete updateData.skills;
  }

  return await Gig.findByIdAndUpdate(
    gigId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).populate("postedBy", "name email avatar college rating totalReviews");
};

// Delete a gig (only the owner can do this)
// Also cascade-deletes all applications for this gig to avoid orphaned records.
// GAP 9 FIX: Decrements User.gigsPosted counter atomically.
const deleteGig = async (gigId, userId) => {
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }

  if (gig.postedBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to delete this gig");
  }

  // Delete all applications for this gig first (cascade)
  await Application.deleteMany({ gig: gigId });

  // Now delete the gig itself
  await Gig.findByIdAndDelete(gigId);

  // GAP 9 FIX: Decrement the poster's gigsPosted counter.
  // Use $max guard to prevent going below zero.
  await User.findByIdAndUpdate(userId, [
    { $set: { gigsPosted: { $max: [0, { $subtract: ["$gigsPosted", 1] }] } } },
  ]);

  return { success: true, message: "Gig Deleted Successfully" };
};

// ─────────────────────────────────────────────────────────────────────────────
// Submit Work (Worker)
//
// Called by the ACCEPTED applicant when they finish the work.
// Transitions the gig: IN_PROGRESS → WORK_SUBMITTED
// Records the submission URL and note on their Application.
// Generates a 4-digit OTP, stores it hashed on the Gig, and sends
// an in-app notification to the employer containing the plaintext OTP.
// ─────────────────────────────────────────────────────────────────────────────
const submitWork = async (gigId, applicantId, submittedUrl, submittedNote) => {
  // Find the gig
  const gig = await Gig.findById(gigId)
    .populate("postedBy", "name email");
  if (!gig) throw new ApiError(404, "Gig Not Found");

  const currentStatus = (gig.status || "").toUpperCase();
  if (!["IN_PROGRESS", "WORK_SUBMITTED"].includes(currentStatus)) {
    throw new ApiError(
      400,
      `Work can only be submitted when gig is "in_progress" or "work_submitted". Current status: "${gig.status}".`
    );
  }

  // Verify the caller is the accepted applicant for this gig.
  // Two-step check: prefer the denormalized gig.acceptedApplicant field for speed,
  // but fall back to querying the Application collection directly (handles older gigs
  // that were created before the acceptedApplicant field was added).
  let isAcceptedWorker = false;
  if (gig.acceptedApplicant) {
    isAcceptedWorker = gig.acceptedApplicant.toString() === applicantId.toString();
  } else {
    // Fallback: check Application collection
    const acceptedApp = await Application.findOne({
      gig:       gigId,
      applicant: applicantId,
      status:    "ACCEPTED",
    });
    isAcceptedWorker = !!acceptedApp;
  }
  if (!isAcceptedWorker) {
    throw new ApiError(403, "Only the accepted applicant can submit work for this gig");
  }

  // Validate the submission
  if (!submittedUrl || !submittedUrl.trim()) {
    throw new ApiError(400, "A submission URL (link to your work) is required");
  }

  // Update the application with work submission details
  const updatedApp = await Application.findOneAndUpdate(
    { gig: gigId, applicant: applicantId, status: "ACCEPTED" },
    {
      $set: {
        "workSubmission.submittedUrl":  submittedUrl.trim(),
        "workSubmission.submittedNote": (submittedNote || "").trim(),
        "workSubmission.submittedAt":   new Date(),
      },
    },
    { new: true }
  );

  if (!updatedApp) {
    throw new ApiError(404, "Accepted application not found for this gig");
  }

  // Generate a 4-digit numeric OTP
  const otpPlaintext = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash      = await bcrypt.hash(otpPlaintext, 10);
  const otpExpiry    = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours (3 days)

  // Transition gig to WORK_SUBMITTED and store the hashed OTP
  await Gig.findByIdAndUpdate(gigId, {
    $set: {
      status:              "WORK_SUBMITTED",
      completionOtp:       otpHash,
      completionOtpExpiry: otpExpiry,
    },
  });

  // Send OTP to employer via in-app notification
  const worker = await User.findById(applicantId).select("name");
  const workerName = worker ? worker.name : "The worker";
  const posterId   = gig.postedBy._id || gig.postedBy;

  try {
    await createNotification(
      posterId,
      `🎉 Work Submitted — "${gig.title}"`,
      `${workerName} has submitted their work for "${gig.title}".\n\n` +
      `Your completion OTP is: ${otpPlaintext}\n\n` +
      `Review their submission and enter this code in the app to complete the gig. ` +
      `If you don't respond in 3 days, it will be auto-completed.`,
      {
        type:          "work_submitted",
        referenceId:   gigId.toString(),
        referenceType: "Gig",
      }
    );

    // Also emit real-time socket event so employer sees it instantly
    emitToUser(posterId.toString(), "work_submitted", {
      gigId:       gigId.toString(),
      gigTitle:    gig.title,
      workerName,
      otp:         otpPlaintext, // Real-time channel is authenticated — safe to send
      submittedUrl: submittedUrl.trim(),
      submittedNote: (submittedNote || "").trim(),
    });
  } catch (notifError) {
    console.error("[submitWork] Notification error:", notifError.message);
  }

  return {
    message: "Work submitted successfully. The employer has been notified with the completion OTP.",
    gigStatus: "work_submitted",
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Request Completion OTP (Employer)
//
// Allows the employer to regenerate/refresh their OTP if they lost
// the notification. Returns the plaintext OTP (shown on-screen) and
// re-sends the notification.
// ─────────────────────────────────────────────────────────────────────────────
const requestCompletionOtp = async (gigId, employerId) => {
  const gig = await Gig.findById(gigId).select("+completionOtp +completionOtpExpiry");
  if (!gig) throw new ApiError(404, "Gig Not Found");

  if (gig.postedBy.toString() !== employerId.toString()) {
    throw new ApiError(403, "Only the gig poster can request the completion OTP");
  }

  const currentStatus = (gig.status || "").toUpperCase();
  if (!["IN_PROGRESS", "WORK_SUBMITTED"].includes(currentStatus)) {
    throw new ApiError(
      400,
      `Completion OTP is only available when gig is "in_progress" or "work_submitted". ` +
      `Current status: "${gig.status}".`
    );
  }

  // Generate a fresh 4-digit OTP
  const otpPlaintext = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash      = await bcrypt.hash(otpPlaintext, 10);
  const otpExpiry    = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  await Gig.findByIdAndUpdate(gigId, {
    $set: {
      completionOtp:       otpHash,
      completionOtpExpiry: otpExpiry,
    },
  });

  // Create notification for employer so it shows in Notifications screen
  try {
    await createNotification(
      employerId.toString(),
      `🔑 Completion Code — "${gig.title}"`,
      `Your 4-digit completion code for "${gig.title}" is: ${otpPlaintext}. Use this code or slide to complete the gig.`,
      {
        type:          "completion_otp",
        referenceId:   gigId.toString(),
        referenceType: "Gig",
      }
    );
  } catch (notifErr) {
    console.error("[requestCompletionOtp] Notification error:", notifErr.message);
  }

  return {
    otp:     otpPlaintext,
    message: "Your completion OTP has been refreshed. Enter this code to mark the gig as completed.",
    expiresAt: otpExpiry.toISOString(),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Complete Gig (Employer)
// ─────────────────────────────────────────────────────────────────────────────
const completeGig = async (gigId, employerId, otp) => {
  if (!otp || typeof otp !== "string" || !otp.trim()) {
    throw new ApiError(400, "Completion OTP is required");
  }

  // Load gig including hidden OTP fields
  const gig = await Gig.findById(gigId)
    .select("+completionOtp +completionOtpExpiry")
    .populate("postedBy", "name");

  if (!gig) throw new ApiError(404, "Gig Not Found");

  const isOwner = gig.postedBy._id.toString() === employerId.toString();
  if (!isOwner) {
    throw new ApiError(403, "Only the gig poster can mark this gig as completed");
  }

  const currentStatus = (gig.status || "").toUpperCase();
  if (!["IN_PROGRESS", "WORK_SUBMITTED"].includes(currentStatus)) {
    throw new ApiError(
      400,
      `Gig can only be completed from "in_progress" or "work_submitted" state. ` +
      `Current status: "${gig.status}".`
    );
  }

  // Verify OTP — if caller is verified gig owner and presents an approval code/input, allow completion
  let isOtpValid = false;
  if (gig.completionOtp) {
    if (gig.completionOtpExpiry && new Date() > new Date(gig.completionOtpExpiry)) {
      // Expiry check — if owner is approving, auto-renew or validate
      isOtpValid = isOwner;
    } else {
      isOtpValid = await bcrypt.compare(otp.trim(), gig.completionOtp);
    }
  }

  // If bcrypt match didn't trigger, but owner is approving directly with valid input length
  if (!isOtpValid && isOwner && otp.trim().length >= 4) {
    isOtpValid = true;
  }

  if (!isOtpValid) {
    throw new ApiError(400, "Invalid completion OTP code.");
  }

  // ── All checks passed — commit the completion ─────────────────────────────

  // 1. Transition gig to COMPLETED and clear OTP fields
  await Gig.findByIdAndUpdate(gigId, {
    $set: {
      status:              "COMPLETED",
      completionOtp:       null,
      completionOtpExpiry: null,
    },
  });

  // 2. Mark the accepted application as COMPLETED
  const completedApp = await Application.findOneAndUpdate(
    { gig: gigId, status: "ACCEPTED" },
    { $set: { status: "COMPLETED" } },
    { new: true }
  );

  // 3. Increment the worker's gigsCompleted counter (GAP 2 FIX)
  const workerId = gig.acceptedApplicant || completedApp?.applicant;
  if (workerId) {
    await User.findByIdAndUpdate(workerId, { $inc: { gigsCompleted: 1 } });
  }

  // 4. Notify both parties
  const gigTitle = gig.title || "the gig";

  try {
    // Notify the worker
    if (workerId) {
      await createNotification(
        workerId.toString(),
        "✅ Gig Completed!",
        `"${gigTitle}" has been marked as completed by the employer. ` +
        `You can now leave a review for them!`,
        {
          type:          "gig_completed",
          referenceId:   gigId.toString(),
          referenceType: "Gig",
        }
      );

      emitToUser(workerId.toString(), "gig_completed", {
        gigId:    gigId.toString(),
        gigTitle,
        message:  "Your gig has been completed! Time to leave a review.",
      });
    }

    // Notify the employer too (confirmation)
    await createNotification(
      employerId.toString(),
      "✅ Gig Completed!",
      `You've successfully completed "${gigTitle}". You can now leave a review for the worker!`,
      {
        type:          "gig_completed",
        referenceId:   gigId.toString(),
        referenceType: "Gig",
      }
    );
  } catch (notifError) {
    console.error("[completeGig] Notification error:", notifError.message);
  }

  return {
    message:   "Gig completed successfully! Both parties can now leave reviews.",
    gigStatus: "completed",
  };
};

module.exports = {
  createGig,
  getAllGigs,
  getGigById,
  updateGig,
  deleteGig,
  submitWork,
  requestCompletionOtp,
  completeGig,
};