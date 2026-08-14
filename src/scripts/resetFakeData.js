// ============================================================
// scripts/resetFakeData.js — One-time cleanup script
//
// This script:
//   1. Deletes ALL reviews from the database
//   2. Resets rating, totalReviews, gigsPosted, gigsCompleted
//      to 0 for EVERY user EXCEPT Akarsh Bajpai's account
//   3. Also resets all Applications so gig apply counts are clean
//
// Run once with: node src/scripts/resetFakeData.js
// ============================================================

require("dotenv").config();
const mongoose = require("mongoose");
const User     = require("../models/User");
const Review   = require("../models/Review");
const Gig      = require("../models/Gig");

// ── Change this to Akarsh Bajpai's exact email if needed ──────────────────────
const PRESERVE_EMAIL = "akarsh"; // partial match — finds any email containing "akarsh"
// ──────────────────────────────────────────────────────────────────────────────

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB:", process.env.MONGODB_URI);

    // ── Step 1: Find Akarsh's account ────────────────────────────────────────
    const akarsh = await User.findOne({ email: { $regex: PRESERVE_EMAIL, $options: "i" } });
    if (!akarsh) {
      console.warn("⚠️  Could not find Akarsh's account. ALL users will be reset.");
    } else {
      console.log(`✅ Found Akarsh's account: ${akarsh.name} (${akarsh.email}) — ID: ${akarsh._id}`);
    }

    // ── Step 2: Delete ALL reviews ────────────────────────────────────────────
    const deletedReviews = await Review.deleteMany({});
    console.log(`🗑️  Deleted ${deletedReviews.deletedCount} reviews`);

    // ── Step 3: Reset stats for ALL users EXCEPT Akarsh ─────────────────────
    const excludeId = akarsh ? akarsh._id : null;
    const query = excludeId ? { _id: { $ne: excludeId } } : {};

    const updatedUsers = await User.updateMany(query, {
      $set: {
        rating:        0,
        totalReviews:  0,
        gigsPosted:    0,
        gigsCompleted: 0,
      },
    });
    console.log(`🔄 Reset stats for ${updatedUsers.modifiedCount} users (Akarsh excluded)`);

    // ── Step 4: Also fix Akarsh's rating since all reviews are gone ──────────
    if (akarsh) {
      await User.findByIdAndUpdate(akarsh._id, {
        $set: { rating: 0, totalReviews: 0 },
      });
      console.log(`🔄 Reset Akarsh's review-based stats (rating & totalReviews) to 0 since all reviews were deleted`);
      console.log(`   (gigsPosted and gigsCompleted for Akarsh are left as-is)`);
    }

    // ── Step 5: Reset applicationsCount on all gigs to actual count ───────────
    const gigs = await Gig.find({});
    let gigFixed = 0;
    for (const gig of gigs) {
      const Application = require("../models/Application");
      const count = await Application.countDocuments({ gig: gig._id });
      await Gig.findByIdAndUpdate(gig._id, { $set: { applicationsCount: count } });
      gigFixed++;
    }
    console.log(`🔄 Recalculated applicationsCount for ${gigFixed} gigs`);

    console.log("\n✅ Done! All fake data has been reset.");
    console.log("📌 Only Akarsh's gig counts are preserved.");
    console.log("📌 New user accounts will start with everything at 0.\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

run();
