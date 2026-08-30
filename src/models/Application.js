// ============================================================
// models/Application.js — Job Application Schema
//
// When a user applies to a gig, an Application document is created.
// It links a Gig and an applicant (User), and stores their proposal.
//
// Status lifecycle:
//   PENDING → ACCEPTED (employer accepts) or REJECTED / WITHDRAWN
//   ACCEPTED → COMPLETED (when gig is completed)
// ============================================================

const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    // Which gig this application is for
    gig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      required: true,
    },

    // Who applied (the applicant)
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The applicant's pitch / cover message
    proposal: { type: String, required: true },

    // How much the applicant expects to be paid
    expectedBudget: { type: Number, required: true },

    // Current state of the application
    // Stored as UPPERCASE, returned as lowercase
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "COMPLETED"],
      default: "PENDING",
      set: (v) => (typeof v === "string" ? v.toUpperCase() : v),
      get: (v) => (typeof v === "string" ? v.toLowerCase() : v),
    },

    // ── Work Submission (populated when worker submits their deliverable) ──────
    // Filled when the accepted applicant calls POST /api/gigs/:id/submit-work.
    // The employer then reviews this and enters the OTP to confirm completion.
    workSubmission: {
      submittedUrl:  { type: String, default: "" },  // Link to deliverable (GitHub, Drive, etc.)
      submittedNote: { type: String, default: "" },  // Explanation / handover notes
      submittedAt:   { type: Date,   default: null }, // Timestamp of submission (used by auto-timer)
    },
  },
  {
    timestamps: true,
  }
);

// ── Database Indexes ─────────────────────────────────────────────────────────
//
// UNIQUE compound index on {gig, applicant}:
//   - Prevents the same user from applying to the same gig twice
//   - CRITICAL: this is the database-level guard against duplicate applications.
//     The JS-level findOne() check in applicationService.js gives a friendly
//     error message, but this index is the definitive guarantee — it blocks
//     duplicates even if two requests arrive simultaneously and both pass
//     the JS check before either has written to the DB.
//
applicationSchema.index({ gig: 1, applicant: 1 }, { unique: true });

// Fast lookup: "all applications for this gig" (used by gig owner dashboard)
applicationSchema.index({ gig: 1 });

// Fast lookup: "all my applications" (used by applicant's my-applications tab)
applicationSchema.index({ applicant: 1 });

// Include getters (the lowercase status) when converting to JSON
applicationSchema.set("toJSON", {
  getters: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.id;
    return ret;
  },
});

applicationSchema.set("toObject", { getters: true });

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;