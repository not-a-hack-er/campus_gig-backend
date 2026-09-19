// ============================================================
// controllers/profileController.js — Mandatory Profile Completion
//
// After a web user authenticates with Clerk for the first time, their
// MongoDB profile exists but is incomplete (profileComplete: false).
// The frontend redirects them to /complete-profile; this endpoint
// receives and validates the submitted data, then marks the profile
// as complete.
//
// Also handles POST /api/auth/sync — called by the frontend immediately
// after every Clerk sign-in to ensure the MongoDB profile exists and
// to return the current profileComplete state. This is the fallback for
// webhook delivery delays.
// ============================================================

const User        = require("../models/User");
const ApiError    = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { createClerkClient } = require("@clerk/express");
const { env }     = require("../config/env");

const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

// ── POST /api/auth/sync ────────────────────────────────────────────────────────
// Called by the frontend immediately after Clerk sign-in.
// Purpose: ensure a MongoDB User doc exists (handles webhook delivery delays).
// Returns the current profile state so the frontend knows where to route.
//
// This is auth-gated by requireAuth (not protect) so profileComplete users
// can also call it to refresh their state.
const syncClerkUser = async (req, res, next) => {
  try {
    // req.user is set by requireAuth. id may be null if no MongoDB profile exists yet.
    // clerkUserId is always present for web (Clerk) users.
    const { id: userId, clerkUserId } = req.user;

    // ── Case 1: MongoDB user already exists ──────────────────────────────────
    if (userId) {
      const user = await User.findById(userId)
        .select("_id name email role college profileComplete clerkUserId");

      if (user) {
        return res.status(200).json(new ApiResponse(true, "Profile synced", {
          profileComplete: user.profileComplete,
          userId:          user._id,
          name:            user.name,
          email:           user.email,
          role:            user.role,
          college:         user.college,
        }));
      }
    }

    // ── Case 2: No MongoDB profile via clerkUserId — handle legacy users ─────
    // Use clerkUserId from req.user (set by requireAuth for Clerk sessions).
    if (!clerkUserId) {
      return next(new ApiError(401, "Authentication Required"));
    }

    // Fetch user details from Clerk to populate the skeleton profile
    let email = "";
    let name  = "";
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      email = clerkUser.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
      name  = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim()
           || email.split("@")[0];
    } catch (err) {
      // If we can't reach Clerk API, proceed with defaults
    }

    // ── Step 2a: Try to find an existing user by email and link Clerk to them ─
    // This handles users who previously registered with custom auth.
    // The link is safe because the email came from Clerk's verified token.
    if (email) {
      const existingByEmail = await User.findOneAndUpdate(
        {
          email,
          // Legacy users can have the field absent or explicitly null.  Never
          // overwrite an identity that is already linked to another Clerk user.
          $or: [{ clerkUserId: { $exists: false } }, { clerkUserId: null }],
        },
        // The Android legacy flow had no profile-completion gate.  Preserving
        // that access during a verified Clerk link avoids breaking established
        // accounts while leaving all existing profile data untouched.
        { $set: { clerkUserId, isVerified: true, profileComplete: true } },
        { new: true }
      );

      if (existingByEmail) {
        return res.status(200).json(new ApiResponse(true, "Legacy account linked to Clerk", {
          profileComplete: existingByEmail.profileComplete,
          userId:          existingByEmail._id,
          name:            existingByEmail.name,
          email:           existingByEmail.email,
          role:            existingByEmail.role,
          college:         existingByEmail.college,
        }));
      }
    }

    // ── Step 2b: Email belongs to an existing Clerk-linked account ──────────
    // Happens when the user clicks "Sign up with GitHub/Google" again after
    // already completing their profile — Clerk issues a NEW clerkUserId but
    // the email is the same. We migrate the new Clerk ID onto the existing
    // profile so the user keeps their complete data and skips the setup page.
    if (email) {
      const existingClerkAccount = await User.findOneAndUpdate(
        { email, clerkUserId: { $exists: true, $ne: clerkUserId } },
        { $set: { clerkUserId, isVerified: true } }, // transfer new Clerk ID
        { new: true }
      );
      if (existingClerkAccount) {
        logger.info(
          { oldClerkId: existingClerkAccount.clerkUserId, newClerkId: clerkUserId, email },
          "Clerk ID transferred to existing account (re-signup via OAuth)"
        );
        return res.status(200).json(new ApiResponse(true, "Account re-linked to Clerk", {
          profileComplete: existingClerkAccount.profileComplete,
          userId:          existingClerkAccount._id,
          name:            existingClerkAccount.name,
          email:           existingClerkAccount.email,
          role:            existingClerkAccount.role,
          college:         existingClerkAccount.college,
        }));
      }
    }

    // ── Step 2c: No existing user at all — create a fresh skeleton profile ────
    // Use findOneAndUpdate with upsert on clerkUserId (idempotent).
    const newUser = await User.findOneAndUpdate(
      { clerkUserId },
      {
        $setOnInsert: {
          clerkUserId,
          email:           email || `clerk-${clerkUserId}@placeholder.local`,
          name:            name  || "CampusVault User",
          // Android collects optional profile details after sign-in.  Do not
          // block a verified first-time Google user from the app before that
          // optional profile enrichment can be completed.
          profileComplete: true,
          isVerified:      true,
          isActive:        true,
          role:            "student",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(new ApiResponse(true, "Profile created", {
      profileComplete: newUser.profileComplete,
      userId:          newUser._id,
      name:            newUser.name,
      email:           newUser.email,
      role:            newUser.role,
      college:         newUser.college,
    }));
  } catch (error) {
    next(error);
  }
};

// ── POST /api/profile/complete ─────────────────────────────────────────────────
// Receives the profile completion form data from the frontend.
// Validates the required fields, saves them, and marks profileComplete = true.
//
// Required fields: name, college
// Optional fields: branch, yearOfStudy, role (defaults to "student")
//
// This endpoint is auth-gated by requireAuth (not protect) — if protect were
// used, an incomplete profile would be blocked before reaching this handler.
const completeProfile = async (req, res, next) => {
  try {
    const { name, college, branch, yearOfStudy, role } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    const errors = {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }
    if (!college || typeof college !== "string" || !college.trim()) {
      errors.college = "College name is required.";
    }
    if (role && !["student", "employer"].includes(role)) {
      errors.role = "Role must be student or employer.";
    }
    const VALID_YEARS = ["", "1st", "2nd", "3rd", "4th", "5th+"];
    if (yearOfStudy && !VALID_YEARS.includes(yearOfStudy)) {
      errors.yearOfStudy = "Invalid year of study.";
    }

    if (Object.keys(errors).length > 0) {
      return next(new ApiError(400, "Validation failed", errors));
    }

    // ── Build the update ──────────────────────────────────────────────────────
    const update = {
      name:            name.trim(),
      college:         college.trim(),
      profileComplete: true,
    };
    if (branch)      update.branch      = branch.trim();
    if (yearOfStudy) update.yearOfStudy = yearOfStudy;
    if (role)        update.role        = role;

    // ── Save ──────────────────────────────────────────────────────────────────
    // Look up user by MongoDB _id if available, otherwise by clerkUserId.
    let user;
    if (req.user.id) {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: update },
        { new: true, runValidators: true }
      );
    } else if (req.user.clerkUserId) {
      // Fallback: MongoDB user may have been created by sync/webhook between
      // the requireAuth check and now — find by clerkUserId.
      user = await User.findOneAndUpdate(
        { clerkUserId: req.user.clerkUserId },
        { $set: update },
        { new: true, runValidators: true }
      );
    }

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    return res.status(200).json(new ApiResponse(true, "Profile completed successfully", {
      profileComplete: user.profileComplete,
      userId:          user._id,
      name:            user.name,
      college:         user.college,
      role:            user.role,
    }));
  } catch (error) {
    next(error);
  }
};

module.exports = { syncClerkUser, completeProfile };
