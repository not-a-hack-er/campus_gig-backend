// ============================================================
// services/gigCompletionScheduler.js — Auto-Approve Timer (v1.0)
//
// Runs every hour via node-cron.
// Finds all gigs in WORK_SUBMITTED state where the worker submitted
// their work more than 3 days (72 hours) ago and the employer has
// not yet entered the completion OTP.
//
// On match:
//   1. Transitions gig: WORK_SUBMITTED → COMPLETED
//   2. Transitions accepted Application: ACCEPTED → COMPLETED
//   3. Increments the worker's gigsCompleted counter
//   4. Clears the OTP fields
//   5. Sends in-app notifications to both employer and worker
//
// This mirrors the Upwork/Fiverr auto-release pattern:
//   "If the client doesn't respond in 3 days, funds are released."
// ============================================================

const cron = require("node-cron");

const Gig         = require("../models/Gig");
const Application = require("../models/Application");
const User        = require("../models/User");
const { createNotification } = require("./notificationService");
const { emitToUser }         = require("../sockets/socketService");
const logger                 = require("../config/logger");

const AUTO_COMPLETE_DAYS = 3;
const AUTO_COMPLETE_MS   = AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Processes a single gig for auto-completion.
 * Finds the accepted application, transitions statuses, updates counters,
 * and sends notifications. All DB operations are independent (no transaction)
 * because this is a standalone MongoDB instance.
 *
 * @param {object} gig — Mongoose Gig document (with postedBy populated)
 */
const autoCompleteGig = async (gig) => {
  const gigId    = gig._id;
  const gigTitle = gig.title || "a gig";
  const posterId = (gig.postedBy?._id || gig.postedBy).toString();

  logger.info({ gigId }, "[AutoComplete] Processing gig for auto-completion");

  // 1. Transition gig to COMPLETED and clear OTP
  await Gig.findByIdAndUpdate(gigId, {
    $set: {
      status:              "COMPLETED",
      completionOtp:       null,
      completionOtpExpiry: null,
    },
  });

  // 2. Find and mark the accepted application as COMPLETED
  const completedApp = await Application.findOneAndUpdate(
    { gig: gigId, status: "ACCEPTED" },
    { $set: { status: "COMPLETED" } },
    { new: true }
  );

  // 3. Determine the worker's ID
  const workerId = (gig.acceptedApplicant || completedApp?.applicant)?.toString();

  // 4. Increment the worker's gigsCompleted counter
  if (workerId) {
    await User.findByIdAndUpdate(workerId, { $inc: { gigsCompleted: 1 } });
  }

  // 5. Notify both parties
  try {
    // Notify the employer
    // BUG-13 FIX: Use second-person ("you did not confirm") since this notification
    // is sent TO the employer. The previous message said "because the employer did not
    // confirm" which reads incorrectly when addressed to the employer themselves.
    await createNotification(
      posterId,
      "⏱️ Gig Auto-Completed",
      `"${gigTitle}" was automatically marked as completed because you did not confirm ` +
      `within ${AUTO_COMPLETE_DAYS} days of the worker submitting their work. ` +
      `You can now leave a review for the worker!`,
      {
        type:          "gig_auto_completed",
        referenceId:   gigId.toString(),
        referenceType: "Gig",
      }
    );

    emitToUser(posterId, "gig_completed", {
      gigId:    gigId.toString(),
      gigTitle,
      message:  `"${gigTitle}" was auto-completed. You can now leave a review!`,
      autoCompleted: true,
    });

    // Notify the worker
    if (workerId) {
      await createNotification(
        workerId,
        "✅ Gig Auto-Completed!",
        `"${gigTitle}" has been automatically marked as completed since the employer ` +
        `did not respond within ${AUTO_COMPLETE_DAYS} days. You can now leave a review!`,
        {
          type:          "gig_auto_completed",
          referenceId:   gigId.toString(),
          referenceType: "Gig",
        }
      );

      emitToUser(workerId, "gig_completed", {
        gigId:    gigId.toString(),
        gigTitle,
        message:  "Your gig was auto-completed! Time to leave a review.",
        autoCompleted: true,
      });
    }
  } catch (notifError) {
    logger.error({ err: notifError, gigId }, "[AutoComplete] Notification error");
  }

  logger.info({ gigId, workerId, posterId }, "[AutoComplete] Gig auto-completed successfully");
};

/**
 * Starts the auto-approve scheduler.
 * Run this once after the DB is connected (called from server.js).
 */
const startGigCompletionScheduler = () => {
  // Run every hour at minute 0
  // Cron expression: "0 * * * *"  (at :00 of every hour)
  cron.schedule("0 * * * *", async () => {
    logger.info("[AutoComplete] Running gig auto-completion check...");

    const cutoffDate = new Date(Date.now() - AUTO_COMPLETE_MS);

    let eligibleGigs;
    try {
      // Find gigs in WORK_SUBMITTED state where submission was made more than 3 days ago.
      // We track submission time via the Application's workSubmission.submittedAt field.
      // We join through Application to get the submittedAt timestamp.
      eligibleGigs = await Gig.aggregate([
        { $match: { status: "WORK_SUBMITTED" } },
        {
          $lookup: {
            from:         "applications",
            localField:   "_id",
            foreignField: "gig",
            as:           "applications",
          },
        },
        {
          $addFields: {
            acceptedApp: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$applications",
                    cond:  { $eq: ["$$this.status", "ACCEPTED"] },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $match: {
            "acceptedApp.workSubmission.submittedAt": { $lte: cutoffDate },
          },
        },
        { $project: { applications: 0, acceptedApp: 0 } },
      ]);
    } catch (queryErr) {
      logger.error({ err: queryErr }, "[AutoComplete] Failed to query eligible gigs");
      return;
    }

    if (!eligibleGigs.length) {
      logger.info("[AutoComplete] No gigs eligible for auto-completion.");
      return;
    }

    logger.info({ count: eligibleGigs.length }, "[AutoComplete] Found gigs to auto-complete");

    // Process each eligible gig independently — one failure doesn't block others
    for (const gigData of eligibleGigs) {
      try {
        await autoCompleteGig(gigData);
      } catch (err) {
        logger.error({ err, gigId: gigData._id }, "[AutoComplete] Failed to auto-complete gig");
      }
    }
  });

  logger.info("[AutoComplete] Gig completion scheduler started (runs every hour)");
};

module.exports = { startGigCompletionScheduler };
