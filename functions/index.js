/**
 * PickleConnect — GroupMe Scheduled Message Sender
 * Firebase Cloud Functions v2
 *
 * Runs every 5 minutes. Scans all groupme_bots/{courtId}/scheduled documents
 * whose scheduledFor <= now and status == 'pending', posts to GroupMe,
 * then marks as sent (or advances the schedule for repeating messages).
 *
 * Deploy:
 *   cd functions
 *   npm install
 *   firebase deploy --only functions
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp();
const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Post a message to a GroupMe bot.
 * Uses Node's built-in https (no extra deps).
 */
function postGroupMe(botId, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ bot_id: botId, text });
    const options = {
      hostname: "api.groupme.com",
      path: "/v3/bots/post",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      resolve({ ok: res.statusCode === 200 || res.statusCode === 202, status: res.statusCode });
    });
    req.on("error", (e) => {
      logger.error("GroupMe HTTP error:", e.message);
      resolve({ ok: false, error: e.message });
    });
    req.write(body);
    req.end();
  });
}

/**
 * Compute the next run timestamp for a repeating schedule.
 * Returns null if no repeat.
 */
function nextRun(scheduledFor, repeat) {
  const d = new Date(scheduledFor);
  switch (repeat) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return d.getTime();
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d.getTime();
    case "weekdays": {
      // Advance to next weekday (Mon–Fri)
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case "weekends": {
      // Advance to next Sat or Sun
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== 0 && d.getDay() !== 6) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    default:
      return null;
  }
}

/**
 * Write a log entry to groupme_bots/{courtId}/logs
 */
async function writeLog(courtId, msg, status, type = "scheduled") {
  try {
    await db
      .collection("groupme_bots")
      .doc(courtId)
      .collection("logs")
      .add({ msg, status, type, sentAt: Date.now() });
  } catch (e) {
    logger.warn("Log write failed:", e.message);
  }
}

// ── Scheduled Function: runs every 5 minutes ─────────────────────────

exports.sendScheduledGroupMeMessages = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Chicago", // adjust to your timezone
    memory: "256MiB",
  },
  async () => {
    const now = Date.now();
    logger.info(`Running scheduled GroupMe sender at ${new Date(now).toISOString()}`);

    // collectionGroup query — finds ALL pending scheduled messages across ALL courts
    let snap;
    try {
      snap = await db
        .collectionGroup("scheduled")
        .where("scheduledFor", "<=", now)
        .where("status", "==", "pending")
        .get();
    } catch (e) {
      logger.error("CollectionGroup query failed:", e.message);
      logger.error("If this is a missing index error, run: firebase firestore:indexes");
      return;
    }

    if (snap.empty) {
      logger.info("No pending scheduled messages.");
      return;
    }

    logger.info(`Found ${snap.size} message(s) to send.`);

    const promises = snap.docs.map(async (doc) => {
      const data = doc.data();
      const courtId = data.courtId;

      if (!courtId) {
        logger.warn(`Scheduled doc ${doc.id} missing courtId, skipping.`);
        return;
      }

      // Fetch bot config for this court
      let botDoc;
      try {
        botDoc = await db.collection("groupme_bots").doc(courtId).get();
      } catch (e) {
        logger.error(`Failed to fetch bot config for court ${courtId}:`, e.message);
        return;
      }

      if (!botDoc.exists) {
        logger.warn(`No bot config for court ${courtId}, skipping.`);
        await doc.ref.update({ status: "skipped_no_bot" });
        return;
      }

      const botConfig = botDoc.data();

      if (!botConfig.botId || botConfig.enabled === false) {
        logger.warn(`Bot disabled or no botId for court ${courtId}, skipping.`);
        await doc.ref.update({ status: "skipped_disabled" });
        return;
      }

      // Send the message
      const result = await postGroupMe(botConfig.botId, data.msg);
      const sentAt = Date.now();

      logger.info(
        `Court ${courtId} (${data.courtName}): sent="${result.ok}" status=${result.status}`
      );

      // Determine next state
      const hasRepeat = data.repeat && data.repeat !== "none";
      const next = hasRepeat ? nextRun(data.scheduledFor, data.repeat) : null;

      if (next) {
        // Repeating — reset to pending with next fire time
        await doc.ref.update({
          scheduledFor: next,
          status: "pending",
          lastSentAt: sentAt,
          lastSentOk: result.ok,
        });
        logger.info(`Repeating message rescheduled for ${new Date(next).toISOString()}`);
      } else {
        // One-time — mark as sent or failed
        await doc.ref.update({
          status: result.ok ? "sent" : "failed",
          sentAt,
        });
      }

      // Log it
      await writeLog(courtId, data.msg, result.ok ? "sent" : "failed", "scheduled");
    });

    await Promise.allSettled(promises);
    logger.info("Scheduled GroupMe sender complete.");
  }
);

// ── Optional: Firestore trigger for real-time event-based messages ────
// This listens for new checkins and applies any custom event_rules.
// Complements the client-side posting in court.html.

exports.onCheckinCreated = onDocumentCreated(
  "courts/{courtId}/checkins/{docId}",
  async (event) => {
    const courtId = event.params.courtId;
    const checkin = event.data.data();

    if (!checkin) return;

    // Get bot config
    const botDoc = await db.collection("groupme_bots").doc(courtId).get();
    if (!botDoc.exists) return;

    const botConfig = botDoc.data();
    if (!botConfig.botId || botConfig.enabled === false) return;

    // Check for a custom event rule for 'checkin'
    const rulesSnap = await db
      .collection("groupme_bots")
      .doc(courtId)
      .collection("event_rules")
      .where("trigger", "==", "checkin")
      .where("enabled", "==", true)
      .limit(1)
      .get();

    let msg;
    if (!rulesSnap.empty) {
      const rule = rulesSnap.docs[0].data();
      if (rule.customMsg) {
        // Apply placeholders
        const courtDoc = await db.collection("courts").doc(courtId).get();
        const courtData = courtDoc.exists ? courtDoc.data() : {};
        const checkinsSnap = await db
          .collection("courts")
          .doc(courtId)
          .collection("checkins")
          .where("status", "==", "active")
          .get();
        const playerCount = checkinsSnap.size;
        const openCourts = courtData.openCourts ?? courtData.numberOfCourts ?? 4;

        msg = rule.customMsg
          .replace("{name}", checkin.userName || "Someone")
          .replace("{court}", courtData.name || "the court")
          .replace("{players}", String(playerCount))
          .replace("{courts}", String(openCourts));
      }
    }

    // Fall back to default message if no custom rule
    if (!msg) {
      const courtDoc = await db.collection("courts").doc(courtId).get();
      const courtData = courtDoc.exists ? courtDoc.data() : {};
      const checkinsSnap = await db
        .collection("courts")
        .doc(courtId)
        .collection("checkins")
        .where("status", "==", "active")
        .get();
      const playerCount = checkinsSnap.size;
      const openCourts = courtData.openCourts ?? courtData.numberOfCourts ?? 4;

      const ratingMap = {
        "1.0": "1.0", "1.5": "1.5", "2.0": "2.0", "2.5": "2.5",
        "3.0": "3.0", "3.5": "3.5", "4.0": "4.0", "4.5": "4.5",
        "5.0": "5.0", "5plus": "5.0+",
      };
      const rating = checkin.rating && ratingMap[checkin.rating] ? ` ${ratingMap[checkin.rating]}` : "";
      const statusEmoji = checkin.status === "active" ? "🎾" : "⏰";
      const guests = checkin.guests > 0 ? ` (+${checkin.guests} guests)` : "";

      msg =
        `${statusEmoji} ${checkin.userName}${rating} checked in at ${courtData.name || "court"}${guests}\n` +
        `👥 ${playerCount} player${playerCount !== 1 ? "s" : ""} on-site  🏟 ${openCourts} court${openCourts !== 1 ? "s" : ""} rotating`;
    }

    const result = await postGroupMe(botConfig.botId, msg);
    await writeLog(courtId, msg, result.ok ? "sent" : "failed", "event_checkin");
  }
);
