// ============================================================
// models/Gig.js — Gig (Job Post) Database Schema
//
// A "Gig" is a task or job posted by a student looking for help.
// Another student can apply for the gig.
// ============================================================

const mongoose = require("mongoose");

const gigSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    budget:      { type: Number, required: true }, // Budget in rupees/currency
    category:    { type: String, required: true },

    // Skills the applicant should have
    skillsRequired: { type: [String], default: [] },

    // Who posted this gig — refers to a User document
    postedBy: {
      type: mongoose.Schema.Types.ObjectId, // A MongoDB ID
      ref: "User",                          // Points to the User collection
      required: true,
    },

    // Status of the gig
    // Stored in UPPERCASE internally, returned in lowercase to the app
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "OPEN",
      set: (v) => (typeof v === "string" ? v.toUpperCase() : v), // Save as uppercase
      get: (v) => (typeof v === "string" ? v.toLowerCase() : v), // Return as lowercase
    },

    duration: { type: String, default: "" }, // e.g. "2 weeks"
    location: { type: String, default: "" }, // e.g. "Remote" or "Mumbai"
    deadline: { type: String, default: "" }, // e.g. "2025-12-01"
    tags:     { type: [String], default: [] },

    // Number of applications received (incremented when someone applies)
    applicationsCount: { type: Number, default: 0 },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Add database indexes to speed up queries (prevents slow collection scans)
gigSchema.index({ status: 1 });
gigSchema.index({ category: 1 });
gigSchema.index({ postedBy: 1 });
gigSchema.index({ createdAt: -1 });

// ─── Virtual Fields ───────────────────────────────────────────────────────────

// "skills" is an alias for "skillsRequired" (used by the Android app)
gigSchema.virtual("skills")
  .get(function () { return this.skillsRequired; })
  .set(function (val) { this.skillsRequired = val; });

// "employer" is an alias for "postedBy" (used by the Android app)
gigSchema.virtual("employer")
  .get(function () { return this.postedBy; })
  .set(function (val) { this.postedBy = val; });

// ─── JSON Serialization ───────────────────────────────────────────────────────

gigSchema.set("toJSON", {
  virtuals: true,
  getters: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.id; // Remove duplicate 'id' (we use '_id')
    if (ret.postedBy) ret.employer = ret.postedBy; // Also send as 'employer'
    return ret;
  },
});

gigSchema.set("toObject", { virtuals: true, getters: true });

const Gig = mongoose.model("Gig", gigSchema);

module.exports = Gig;
