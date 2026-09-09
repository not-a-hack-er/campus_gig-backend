// Reconciles derived gig fields against their source data.
//
// Usage:
//   npm run repair:data            # report only (safe default)
//   npm run repair:data -- --apply # write repairs to the configured database
//
// A malformed historical deadline is cleared on --apply rather than guessed.
// This makes the record valid and lets the gig owner set the correct deadline.

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Gig = require("../models/Gig");
const Application = require("../models/Application");

const apply = process.argv.includes("--apply");
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const isRealDate = (value) => {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const run = async () => {
  await connectDB();
  const gigs = await Gig.find().select("title deadline applicationsCount").lean();
  const invalidDeadlines = [];
  const counterRepairs = [];

  for (const gig of gigs) {
    if (gig.deadline && !isRealDate(gig.deadline)) {
      invalidDeadlines.push({ id: String(gig._id), title: gig.title, deadline: gig.deadline });
      if (apply) {
        await Gig.updateOne({ _id: gig._id }, { $set: { deadline: "" } });
      }
    }

    const actualCount = await Application.countDocuments({
      gig: gig._id,
      status: { $ne: "WITHDRAWN" },
    });
    if (gig.applicationsCount !== actualCount) {
      counterRepairs.push({ id: String(gig._id), title: gig.title, from: gig.applicationsCount, to: actualCount });
      if (apply) {
        await Gig.updateOne({ _id: gig._id }, { $set: { applicationsCount: actualCount } });
      }
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "applied" : "dry-run",
    gigCount: gigs.length,
    counterRepairs,
    invalidDeadlines,
  }, null, 2));

  await mongoose.connection.close();
  process.exitCode = !apply && invalidDeadlines.length ? 2 : 0;
};

run().catch(async (error) => {
  console.error("Gig data repair failed:", error);
  await mongoose.connection.close().catch(() => undefined);
  process.exitCode = 1;
});
