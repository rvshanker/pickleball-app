/**
 * PickleConnect — GroupMe Scheduled Message Sender
 * Firebase Cloud Functions v2
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp();
const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────

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
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case "weekends": {
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== 0 && d.getDay() !== 6) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    default:
      return null;
  }
}

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

/**
 * Builds a live dynamic message matching the original app format exactly:
 *
 * 🎾 Court Name — Live Update
 * 📅 Sunday, February 22 · 10:24 AM
 * 👥 Playing now: Alice, Bob
 * ⏰ Coming soon: None scheduled   (or list of upcoming)
 * 🏟 0/4 COURTS IN ROTATION
 * 🎪 CROWD LEVEL - 🟢 Light
 * 🌤 Next 4 hours:
 *   10:00 AM: 🥶 24°F  💨 18mph
 *   ...
 * 🔗 https://pickleconnect.live
 */
async function buildDynamicMessage(courtId, courtName, includeWeather) {
  try {
    const courtDoc = await db.collection("courts").doc(courtId).get();
    const courtData = courtDoc.exists ? courtDoc.data() : {};

    const checkinsSnap = await db
      .collection("courts")
      .doc(courtId)
      .collection("checkins")
      .get();

    const now = Date.now();
    const allCheckins = checkinsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const playing = allCheckins.filter(c => c.status === "active");
    const upcoming = allCheckins
      .filter(c => c.status === "later" && c.arrivalTime && c.arrivalTime > now)
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .slice(0, 4);

    const open  = courtData.openCourts      ?? courtData.numberOfCourts ?? 4;
    const total = courtData.numberOfCourts  ?? 4;

    const fmtTimeOnly = (ts) =>
      new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

    // ── Date line: "Sunday, February 22 · 10:24 AM"
    const nowDate = new Date();
    const datePart = nowDate.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago"
    });
    const timePart = nowDate.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
    });

    const lines = [
      `🎾 ${courtName || courtData.name || "Court"} — Live Update`,
      `📅 ${datePart} · ${timePart}`,
      ``,
      `👥 Playing now: ${playing.length > 0 ? playing.map(c => c.userName).join(", ") : "No one yet"}`,
    ];

    // ── Coming soon — always shown
    if (upcoming.length > 0) {
      lines.push(`⏰ Coming soon: ${upcoming.map(c => `${c.userName} @ ${fmtTimeOnly(c.arrivalTime)}`).join(", ")}`);
    } else {
      lines.push(`⏰ Coming soon: None scheduled`);
    }

    // ── Courts in rotation
    lines.push(`🏟 ${open}/${total} COURTS IN ROTATION`);

    // ── Crowd level
    if (courtData.crowdLevel) {
      const crowdMap = { low: "🟢 Light", medium: "🟡 Busy", high: "🔴 Packed" };
      const crowd = crowdMap[courtData.crowdLevel];
      if (crowd) lines.push(`🎪 CROWD LEVEL - ${crowd}`);
    }

    // ── Court status (if not normal)
    if (courtData.status && courtData.status !== "open") {
      const statusMap = { closed: "🚫 Closed", wet: "💧 Wet/Damp", maintenance: "🔧 Maintenance" };
      lines.push(`⚠️ Status: ${statusMap[courtData.status] || courtData.status}`);
    }

    // ── Flash message
    if (courtData.flashMsg) {
      lines.push(`📣 ${courtData.flashMsg}`);
    }

    // ── Weather: hourly breakdown
    if (includeWeather && courtData.lat && courtData.lng) {
      try {
        const hours = await fetchHourlyWeather(courtData.lat, courtData.lng);
        if (hours && hours.length > 0) {
          lines.push(`🌤 Next 4 hours:`);
          hours.forEach(h => lines.push(`  ${h}`));
        }
      } catch (e) {
        logger.warn("Weather fetch failed:", e.message);
      }
    }

    lines.push(`🔗 https://pickleconnect.live`);

    return lines.join("\n");
  } catch (e) {
    logger.error("buildDynamicMessage failed:", e.message);
    return null;
  }
}

/**
 * Returns an array of 4 formatted hourly weather strings, e.g.:
 *   [ "10:00 AM: 🥶 24°F  💨 18mph", "11:00 AM: 🥶 25°F  💨 20mph", ... ]
 */
function fetchHourlyWeather(lat, lng) {
  const get = (url) => new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "PickleConnect/1.0 (contact@pickleconnect.live)" } }, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });

  return get(`https://api.weather.gov/points/${lat},${lng}`).then(json => {
    const forecastUrl = json?.properties?.forecastHourly;
    if (!forecastUrl) return null;
    return get(forecastUrl).then(json2 => {
      const periods = json2?.properties?.periods?.slice(0, 4) || [];
      if (!periods.length) return null;

      return periods.map(p => {
        const time = new Date(p.startTime).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
        });
        const temp = p.temperature;
        const unit = p.temperatureUnit || "F";
        // Temperature emoji
        const tempEmoji = temp <= 32 ? "🥶" : temp <= 50 ? "🧣" : temp <= 70 ? "😊" : temp <= 85 ? "☀️" : "🥵";
        // Wind — strip trailing "mph" for consistent format then re-add
        const windSpeed = p.windSpeed ? p.windSpeed.replace(/[^0-9]/g, "") : "0";
        return `${time}: ${tempEmoji} ${temp}°${unit}  💨 ${windSpeed}mph`;
      });
    });
  }).catch(() => null);
}

// ── Scheduled Function: runs every 5 minutes ─────────────────────────

exports.sendScheduledGroupMeMessages = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Chicago",
    memory: "256MiB",
  },
  async () => {
    const now = Date.now();
    logger.info(`Running scheduled GroupMe sender at ${new Date(now).toISOString()}`);

    let snap;
    try {
      snap = await db
        .collectionGroup("scheduled")
        .where("scheduledFor", "<=", now)
        .where("status", "==", "pending")
        .get();
    } catch (e) {
      logger.error("CollectionGroup query failed:", e.message);
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

      // Fetch bot config
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

      // ── BUILD MESSAGE TEXT ────────────────────────────────────────
      let text;
      if (data.isDynamic) {
        // Build live message from current Firestore data
        text = await buildDynamicMessage(courtId, data.courtName, data.includeWeather);
        if (!text) {
          logger.error(`Dynamic message build failed for court ${courtId}, skipping.`);
          await doc.ref.update({ status: "failed", error: "dynamic_build_failed", sentAt: Date.now() });
          await writeLog(courtId, "(dynamic build failed)", "failed", "scheduled");
          return;
        }
      } else {
        text = data.msg;
      }

      // Guard: never send empty/null text to GroupMe (causes 400)
      if (!text || !text.trim()) {
        logger.error(`Empty message text for doc ${doc.id}, skipping to avoid GroupMe 400.`);
        await doc.ref.update({ status: "failed", error: "empty_message", sentAt: Date.now() });
        await writeLog(courtId, "(empty message skipped)", "failed", "scheduled");
        return;
      }

      // ── SEND ──────────────────────────────────────────────────────
      const result = await postGroupMe(botConfig.botId, text);
      const sentAt = Date.now();

      logger.info(
        `Court ${courtId} (${data.courtName}): sent="${result.ok}" status=${result.status}`
      );

      // Advance repeat or mark done
      const hasRepeat = data.repeat && data.repeat !== "none";
      const next = hasRepeat ? nextRun(data.scheduledFor, data.repeat) : null;

      // Check end date
      const pastEnd = data.endDate && next && next > data.endDate;

      if (next && !pastEnd) {
        await doc.ref.update({
          scheduledFor: next,
          status: "pending",
          lastSentAt: sentAt,
          lastSentOk: result.ok,
        });
        logger.info(`Repeating message rescheduled for ${new Date(next).toISOString()}`);
      } else {
        await doc.ref.update({
          status: result.ok ? "sent" : "failed",
          sentAt,
        });
        if (pastEnd) logger.info(`Repeat schedule ended (past endDate).`);
      }

      await writeLog(courtId, text, result.ok ? "sent" : "failed", "scheduled");
    });

    await Promise.allSettled(promises);
    logger.info("Scheduled GroupMe sender complete.");
  }
);

// ── Firestore trigger: real-time check-in event messages ─────────────

exports.onCheckinCreated = onDocumentCreated(
  "courts/{courtId}/checkins/{docId}",
  async (event) => {
    const courtId = event.params.courtId;
    const checkin = event.data.data();
    if (!checkin) return;

    const botDoc = await db.collection("groupme_bots").doc(courtId).get();
    if (!botDoc.exists) return;
    const botConfig = botDoc.data();
    if (!botConfig.botId || botConfig.enabled === false) return;

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
        const courtDoc = await db.collection("courts").doc(courtId).get();
        const courtData = courtDoc.exists ? courtDoc.data() : {};
        const checkinsSnap = await db
          .collection("courts").doc(courtId).collection("checkins")
          .where("status", "==", "active").get();
        msg = rule.customMsg
          .replace("{name}", checkin.userName || "Someone")
          .replace("{court}", courtData.name || "the court")
          .replace("{players}", String(checkinsSnap.size))
          .replace("{courts}", String(courtData.openCourts ?? courtData.numberOfCourts ?? 4));
      }
    }

    if (!msg) {
      const courtDoc = await db.collection("courts").doc(courtId).get();
      const courtData = courtDoc.exists ? courtDoc.data() : {};
      const checkinsSnap = await db
        .collection("courts").doc(courtId).collection("checkins")
        .where("status", "==", "active").get();
      const playerCount = checkinsSnap.size;
      const openCourts = courtData.openCourts ?? courtData.numberOfCourts ?? 4;
      const ratingMap = {
        "1.0":"1.0","1.5":"1.5","2.0":"2.0","2.5":"2.5","3.0":"3.0",
        "3.5":"3.5","4.0":"4.0","4.5":"4.5","5.0":"5.0","5plus":"5.0+",
      };
      const rating = checkin.rating && ratingMap[checkin.rating] ? ` ${ratingMap[checkin.rating]}` : "";
      const guests = checkin.guests > 0 ? ` (+${checkin.guests} guests)` : "";
      msg =
        `🎾 ${checkin.userName}${rating} checked in at ${courtData.name || "court"}${guests}\n` +
        `👥 ${playerCount} player${playerCount !== 1 ? "s" : ""} on-site  🏟 ${openCourts} court${openCourts !== 1 ? "s" : ""} rotating`;
    }

    const result = await postGroupMe(botConfig.botId, msg);
    await writeLog(courtId, msg, result.ok ? "sent" : "failed", "event_checkin");
  }
);

// ── FCM: Process notification-queue ──────────────────────────────────
const { onDocumentCreated: onQueueCreated } = require("firebase-functions/v2/firestore");

exports.sendPushNotification = onQueueCreated(
  "notification-queue/{docId}",
  async (event) => {
    const data = event.data.data();
    if (!data || !data.token) {
      logger.warn("sendPushNotification: missing token, skipping");
      return;
    }

    const message = {
      token: data.token,
      notification: {
        title: data.title || "🎾 PickleConnect",
        body:  data.body  || "Court update",
      },
      data: {
        courtId: data.courtId || "",
        type:    data.type    || "general",
        sentAt:  String(Date.now()),
      },
      webpush: {
        notification: {
          icon:  "/icon-192.png",
          badge: "/icon-96.png",
          tag:   data.courtId || "pickleconnect",
          renotify: true,
          actions: [
            { action: "view",    title: "👁 View Court" },
            { action: "dismiss", title: "Dismiss" },
          ],
        },
        fcmOptions: {
          link: data.courtId ? `/court.html?id=${data.courtId}` : "/index.html",
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      logger.info("FCM sent:", response);
      await event.data.ref.update({ status: "sent", sentAt: Date.now(), fcmMessageId: response });
    } catch (e) {
      logger.error("FCM send failed:", e.message);
      await event.data.ref.update({ status: "failed", error: e.message, sentAt: Date.now() });
      if (
        e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token"
      ) {
        if (data.deviceId) {
          await db.collection("fcm-tokens").doc(data.deviceId).delete().catch(() => {});
        }
      }
    }
  }
);
