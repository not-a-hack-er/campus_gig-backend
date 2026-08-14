// ============================================================
// scripts/checkData.js — Quick DB snapshot for debugging
// Run: node src/scripts/checkData.js
// ============================================================
require("dotenv").config();
const mongoose = require("mongoose");
const User     = require("../models/User");
const Review   = require("../models/Review");
const Gig      = require("../models/Gig");
const Application = require("../models/Application");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected\n");

  const totalUsers   = await User.countDocuments();
  const totalReviews = await Review.countDocuments();
  const totalGigs    = await Gig.countDocuments();
  const totalApps    = await Application.countDocuments();

  console.log("=== DATABASE SNAPSHOT ===");
  console.log(`Users:        ${totalUsers}`);
  console.log(`Reviews:      ${totalReviews}`);
  console.log(`Gigs:         ${totalGigs}`);
  console.log(`Applications: ${totalApps}`);

  console.log("\n=== USERS WITH NON-ZERO STATS ===");
  const usersWithStats = await User.find({
    $or: [{ rating: { $gt: 0 } }, { totalReviews: { $gt: 0 } }]
  }).select("name email rating totalReviews gigsPosted gigsCompleted");

  if (usersWithStats.length === 0) {
    console.log("✅ No users have non-zero rating/review stats — reset confirmed!");
  } else {
    usersWithStats.forEach(u => {
      console.log(`  ${u.name} (${u.email}) → rating: ${u.rating}, reviews: ${u.totalReviews}`);
    });
  }

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
