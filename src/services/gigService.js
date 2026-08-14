// ============================================================
// services/gigService.js — Gig Business Logic
//
// Handles all database operations for gigs.
// Controllers call these functions and handle HTTP responses.
// ============================================================

const Gig         = require("../models/Gig");
const Application = require("../models/Application");
const ApiError    = require("../utils/ApiError");
const { escapeRegex } = require("../utils/helpers");

// Create a new gig
// Note: the Android app sends "skills" but the schema uses "skillsRequired"
// so we map it here if needed
const createGig = async (gigData) => {
  if (gigData.skills !== undefined && gigData.skillsRequired === undefined) {
    gigData.skillsRequired = gigData.skills;
    delete gigData.skills;
  }
  return await Gig.create(gigData);
};

// Get all gigs with optional filters
//
// Supported filters (all optional):
//   category   — exact category name (case-insensitive)
//   status     — "open" | "in_progress" | "completed" | "all" (default: "open")
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
  // Raw user input passed into new RegExp() can cause catastrophic backtracking
  // (ReDoS), freezing Node.js's event loop and taking the server down.
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
  // Previously: all gigs were loaded into Node.js memory, then Array.filter()
  //             was called — O(N) in RAM, blocks the event loop for large datasets.
  //
  // Now: if a college filter is provided, we push the join & filter down to
  //      MongoDB using an aggregation pipeline with $lookup and $match.
  //      Only matching documents are transferred over the wire.
  //
  if (filters.college) {
    const safeCollege = escapeRegex(filters.college);

    const pipeline = [
      // Stage 1: Apply all non-college filters first (uses indexes)
      { $match: query },
      // Stage 2: Sort before joining to keep index usage
      { $sort: { [sortField]: sortOrder } },
      // Stage 3: Join the User collection to get the poster's college
      {
        $lookup: {
          from:         "users",
          localField:   "postedBy",
          foreignField: "_id",
          as:           "postedByDoc",
        },
      },
      // Stage 4: Unwind the joined array to a single document
      { $unwind: { path: "$postedByDoc", preserveNullAndEmpty: false } },
      // Stage 5: Filter by the poster's college (case-insensitive substring)
      {
        $match: {
          "postedByDoc.college": { $regex: safeCollege, $options: "i" },
        },
      },
      // Stage 6: Re-shape output to match the normal .populate() shape
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
      { $project: { postedByDoc: 0 } }, // Remove the raw joined doc
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
const updateGig = async (gigId, userId, updateData) => {
  const gig = await Gig.findById(gigId);
  if (!gig) {
    throw new ApiError(404, "Gig Not Found");
  }

  // Check that the logged-in user is the one who posted this gig
  if (gig.postedBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to update this gig");
  }

  // Map "skills" to "skillsRequired" if the app sent that field name
  if (updateData.skills !== undefined) {
    updateData.skillsRequired = updateData.skills;
    delete updateData.skills;
  }

  return await Gig.findByIdAndUpdate(
    gigId,
    { $set: updateData },
    { new: true, runValidators: true } // Return updated doc & validate changes
  ).populate("postedBy", "name email avatar college rating totalReviews");
};

// Delete a gig (only the owner can do this)
// Also cascade-deletes all applications for this gig to avoid orphaned records.
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

  return { success: true, message: "Gig Deleted Successfully" };
};

module.exports = { createGig, getAllGigs, getGigById, updateGig, deleteGig };