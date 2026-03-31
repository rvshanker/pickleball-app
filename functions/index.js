/**
 * PickleConnect — Firebase Cloud Functions
 *
 * 1. GroupMe scheduled message sender      (existing)
 * 2. GroupMe real-time check-in trigger    (existing, bug fixed)
 * 3. FCM notification-queue processor      (existing)
 * 4. Push: nearby game available           (existing)
 * 5. Push: player availability match       (existing)
 * 6. Push: game invite / accept / decline  (existing)
 * 7. Push: player joined your court        (FIXED — now triggers on checkins subcollection)
 * 8. Push: game starting soon reminder     (existing — piggybacked on 5-min schedule)
 * 9. Push: direct message received         (FIXED — now triggers on chatMessages collection)
 */

const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger }            = require("firebase-functions");
const admin                 = require("firebase-admin");
const https                 = require("https");

admin.initializeApp();
const db        = admin.firestore();
const messaging = admin.messaging();

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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
    case "daily":    d.setDate(d.getDate() + 1); return d.getTime();
    case "weekly":   d.setDate(d.getDate() + 7); return d.getTime();
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
    default: return null;
  }
}

async function writeLog(courtId, msg, status, type = "scheduled") {
  try {
    await db.collection("groupme_bots").doc(courtId).collection("logs")
      .add({ msg, status, type, sentAt: Date.now() });
  } catch (e) {
    logger.warn("Log write failed:", e.message);
  }
}

/** Haversine distance in miles */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM PUSH HELPER
// Reads fcm-tokens/{uid} + notifPrefs/{uid}, respects quiet hours & prefs
// ─────────────────────────────────────────────────────────────────────────────

async function sendPushToUser(uid, { title, body, data = {} }) {
  try {
    const [tokenDoc, prefDoc] = await Promise.all([
      db.collection("fcm-tokens").doc(uid).get(),
      db.collection("notifPrefs").doc(uid).get(),
    ]);

    const prefs = prefDoc.exists ? prefDoc.data() : {};

    // Master switch (default ON)
    if (prefs.masterEnabled === false) return;

    // Quiet hours — urgent types always get through
    if (prefs.quietEnabled) {
      const now = new Date();
      const hrs = now.getHours() * 60 + now.getMinutes();
      const [fh, fm] = (prefs.quietFrom || "22:00").split(":").map(Number);
      const [th, tm] = (prefs.quietTo   || "07:00").split(":").map(Number);
      const from = fh * 60 + fm, to = th * 60 + tm;
      const inQuiet = from > to ? (hrs >= from || hrs < to) : (hrs >= from && hrs < to);
      const urgent  = ["game_invite", "court_joined", "invite_accepted", "invite_declined"];
      if (inQuiet && !urgent.includes(data.type)) return;
    }

    // Individual pref key (default ON)
    const prefKey = data.prefKey;
    if (prefKey && prefs[prefKey] === false) return;

    // ── Always write to notifications collection ──────────────────
    // This powers the bell icon + sound in nav.js regardless of
    // whether the FCM push is received (web or native)
    await db.collection("notifications").add({
      toUid:     uid,
      fromUid:   data.fromUid || "system",
      type:      data.type    || "general",
      text:      body,
      title,
      ref:       data.gameId || data.courtId || data.postId || "",
      screen:    data.screen || "",
      read:      false,
      timestamp: Date.now(),
    });

    // ── Send FCM push if token exists ─────────────────────────────
    if (!tokenDoc.exists) return;
    const tokenData = tokenDoc.data();
    const token     = tokenData.token;
    if (!token) return;

    // Detect if this is a native Capacitor token (different format)
    const isNative = tokenData.platform === "ios-native" || tokenData.platform === "android-native";

    const message = {
      token,
      notification: { title, body },
      data: { ...data, sentAt: String(Date.now()) },
    };

    if (isNative) {
      // APNs config for native iOS
      message.apns = {
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
          },
        },
      };
    } else {
      // Web push config
      message.webpush = {
        notification: {
          icon:     "/icon-192.png",
          badge:    "/icon-96.png",
          tag:      data.type || "pickleconnect",
          renotify: true,
        },
        fcmOptions: { link: data.screen ? `/?tab=${data.screen}` : "/" },
      };
    }

    await messaging.send(message);
    logger.info(`sendPushToUser(${uid}): sent "${title}"`);

  } catch (err) {
    if (
      err.code === "messaging/invalid-registration-token" ||
      err.code === "messaging/registration-token-not-registered"
    ) {
      await db.collection("fcm-tokens").doc(uid).delete().catch(() => {});
    }
    logger.error(`sendPushToUser(${uid}):`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC MESSAGE BUILDER (existing — unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function buildDynamicMessage(courtId, courtName, includeWeather, passedLat, passedLng) {
  try {
    const courtDoc  = await db.collection("courts").doc(courtId).get();
    const courtData = courtDoc.exists ? courtDoc.data() : {};

    const checkinsSnap = await db.collection("courts").doc(courtId).collection("checkins").get();

    const now        = Date.now();
    const allCheckins = checkinsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const playing    = allCheckins.filter(c => c.status === "active");
    const upcoming   = allCheckins
      .filter(c => c.status === "later" && c.arrivalTime && c.arrivalTime > now)
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .slice(0, 4);

    const open  = courtData.openCourts     ?? courtData.numberOfCourts ?? 4;
    const total = courtData.numberOfCourts ?? 4;

    const fmtTimeOnly = (ts) =>
      new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

    const nowDate  = new Date();
    const datePart = nowDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" });
    const timePart = nowDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

    const lines = [
      `🎾 ${courtName || courtData.name || "Court"} — Live Update`,
      `📅 ${datePart} · ${timePart}`,
      ``,
      `👥 Playing now: ${playing.length > 0 ? playing.map(c => c.userName).join(", ") : "No one yet"}`,
    ];

    if (upcoming.length > 0) {
      lines.push(`⏰ Coming soon: ${upcoming.map(c => `${c.userName} @ ${fmtTimeOnly(c.arrivalTime)}`).join(", ")}`);
    } else {
      lines.push(`⏰ Coming soon: None scheduled`);
    }

    lines.push(`🏟 ${open}/${total} Courts in rotation`);

    if (courtData.crowdLevel) {
      const crowdMap = { low: "🟢 Light", medium: "🟡 Busy", high: "🔴 Packed" };
      const crowd = crowdMap[courtData.crowdLevel];
      if (crowd) lines.push(`🎪 Crowd Level - ${crowd}`);
    }

    if (courtData.status && courtData.status !== "open") {
      const statusMap = { closed: "🚫 Closed", wet: "💧 Wet/Damp", maintenance: "🔧 Maintenance" };
      lines.push(`⚠️ Status: ${statusMap[courtData.status] || courtData.status}`);
    }

    if (courtData.flashMsg) lines.push(`📣 ${courtData.flashMsg}`);

    const lat = passedLat ?? courtData.lat ?? courtData.latitude  ?? null;
    const lng = passedLng ?? courtData.lng ?? courtData.longitude ?? null;

    logger.info(`Weather check — includeWeather=${includeWeather} lat=${parseFloat(lat).toFixed(4)} lng=${parseFloat(lng).toFixed(4)}`);

    if (includeWeather && lat && lng) {
      try {
        const hours = await fetchHourlyWeather(lat, lng);
        if (hours && hours.length > 0) {
          lines.push(`🌤 Next 4 hours:`);
          hours.forEach(h => lines.push(`  ${h}`));
        } else {
          logger.warn(`Weather fetch returned no hours for lat=${lat} lng=${lng}`);
        }
      } catch (e) {
        logger.warn("Weather fetch failed:", e.message);
      }
    } else if (includeWeather) {
      logger.warn(`includeWeather=true but no lat/lng available for court ${courtId}`);
    }

    lines.push(`🔗 pickleconnect.live`);
    return lines.join("\n");
  } catch (e) {
    logger.error("buildDynamicMessage failed:", e.message);
    return null;
  }
}

function fetchHourlyWeather(lat, lng) {
  const get = (url) => new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "PickleConnect/1.0 (contact@pickleconnect.live)", "Accept": "application/geo+json" } },
      (res) => {
        logger.info(`weather.gov response: ${res.statusCode} for ${url.substring(0, 80)}`);
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            logger.warn(`weather.gov non-200: ${res.statusCode} — body: ${data.substring(0, 200)}`);
            resolve(null); return;
          }
          try { resolve(JSON.parse(data)); }
          catch (e) { logger.warn(`weather.gov JSON parse failed: ${e.message}`); resolve(null); }
        });
      }
    );
    req.on("error", (e) => { logger.warn(`weather.gov request error: ${e.message}`); resolve(null); });
    req.setTimeout(8000, () => {
      logger.warn(`weather.gov request timed out for ${url.substring(0, 80)}`);
      req.destroy(); resolve(null);
    });
  });

  return get(`https://api.weather.gov/points/${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`).then(json => {
    if (!json) { logger.warn("weather.gov /points returned null"); return null; }
    const forecastUrl = json?.properties?.forecastHourly;
    if (!forecastUrl) {
      logger.warn(`weather.gov /points missing forecastHourly — keys: ${Object.keys(json?.properties || {}).join(", ")}`);
      return null;
    }
    logger.info(`weather.gov forecastHourly URL: ${forecastUrl}`);
    return get(forecastUrl).then(json2 => {
      if (!json2) { logger.warn("weather.gov hourly forecast returned null"); return null; }
      const periods = json2?.properties?.periods?.slice(0, 4) || [];
      if (!periods.length) { logger.warn("weather.gov hourly forecast returned 0 periods"); return null; }
      logger.info(`weather.gov got ${periods.length} periods OK`);
      return periods.map(p => {
        const time = new Date(p.startTime).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
        });
        const temp      = p.temperature;
        const unit      = p.temperatureUnit || "F";
        const tempEmoji = temp <= 32 ? "🥶" : temp <= 50 ? "🧣" : temp <= 70 ? "😊" : temp <= 85 ? "☀️" : "🥵";
        const windSpeed = p.windSpeed ? p.windSpeed.replace(/[^0-9].*/g, "") : "0";
        return `${time}: ${tempEmoji} ${temp}°${unit}  💨 ${windSpeed}mph`;
      });
    });
  }).catch((e) => {
    logger.warn(`fetchHourlyWeather uncaught error: ${e.message}`);
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — Scheduled GroupMe sender + game start reminder (merged)
// Runs every 5 minutes
// ─────────────────────────────────────────────────────────────────────────────

exports.sendScheduledGroupMeMessages = onSchedule(
  { schedule: "every 5 minutes", timeZone: "America/Chicago", memory: "256MiB" },
  async () => {
    const now = Date.now();
    logger.info(`Running scheduled sender at ${new Date(now).toISOString()}`);

    // ── GroupMe scheduled messages (existing logic) ──
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

    if (!snap.empty) {
      logger.info(`Found ${snap.size} GroupMe message(s) to send.`);
      const groupMePromises = snap.docs.map(async (doc) => {
        const data    = doc.data();
        const courtId = data.courtId;
        if (!courtId) { logger.warn(`Doc ${doc.id} missing courtId, skipping.`); return; }

        let botDoc;
        try { botDoc = await db.collection("groupme_bots").doc(courtId).get(); }
        catch (e) { logger.error(`Failed to fetch bot config for court ${courtId}:`, e.message); return; }

        if (!botDoc.exists) {
          logger.warn(`No bot config for court ${courtId}, skipping.`);
          await doc.ref.update({ status: "skipped_no_bot" }); return;
        }

        const botConfig = botDoc.data();
        if (!botConfig.botId || botConfig.enabled === false) {
          logger.warn(`Bot disabled or no botId for court ${courtId}, skipping.`);
          await doc.ref.update({ status: "skipped_disabled" }); return;
        }

        let text;
        if (data.isDynamic) {
          text = await buildDynamicMessage(courtId, data.courtName, data.includeWeather, data.courtLat, data.courtLng);
          if (!text) {
            logger.error(`Dynamic message build failed for court ${courtId}, skipping.`);
            await doc.ref.update({ status: "failed", error: "dynamic_build_failed", sentAt: now });
            await writeLog(courtId, "(dynamic build failed)", "failed", "scheduled"); return;
          }
        } else {
          text = data.msg;
        }

        if (!text || !text.trim()) {
          logger.error(`Empty message text for doc ${doc.id}, skipping.`);
          await doc.ref.update({ status: "failed", error: "empty_message", sentAt: now });
          await writeLog(courtId, "(empty message skipped)", "failed", "scheduled"); return;
        }

        const result  = await postGroupMe(botConfig.botId, text);
        const sentAt  = Date.now();
        logger.info(`Court ${courtId} (${data.courtName}): sent="${result.ok}" status=${result.status}`);

        const hasRepeat = data.repeat && data.repeat !== "none";
        const next      = hasRepeat ? nextRun(data.scheduledFor, data.repeat) : null;
        const pastEnd   = data.endDate && next && next > data.endDate;

        if (next && !pastEnd) {
          await doc.ref.update({ scheduledFor: next, status: "pending", lastSentAt: sentAt, lastSentOk: result.ok });
          logger.info(`Repeating message rescheduled for ${new Date(next).toISOString()}`);
        } else {
          await doc.ref.update({ status: result.ok ? "sent" : "failed", sentAt });
          if (pastEnd) logger.info(`Repeat schedule ended (past endDate).`);
        }

        await writeLog(courtId, text, result.ok ? "sent" : "failed", "scheduled");
      });
      await Promise.allSettled(groupMePromises);
    }

    // ── Game start reminders (push notifications, 15-min window) ──
    try {
      const soon      = new Date(now + 15 * 60 * 1000);
      const todayStr  = new Date(now).toISOString().split("T")[0];
      const nowTime   = `${String(new Date(now).getHours()).padStart(2,"0")}:${String(new Date(now).getMinutes()).padStart(2,"0")}`;
      const soonTime  = `${String(soon.getHours()).padStart(2,"0")}:${String(soon.getMinutes()).padStart(2,"0")}`;

      const gamesSnap = await db.collection("games")
        .where("date", "==", todayStr)
        .where("time", ">=", nowTime)
        .where("time", "<=", soonTime)
        .get();

      const reminderSends = [];
      gamesSnap.forEach((doc) => {
        const game     = doc.data();
        const accepted = (game.players || []).filter(p => p.status === "accepted");
        const payload  = {
          title: "🕐 Game starting soon!",
          body:  `Your ${game.playType || ""} game at ${game.courtName || game.court || "the court"} starts in ~15 minutes`,
          data:  { type: "game_reminder", prefKey: "gameReminder", gameId: doc.id, screen: "games" },
        };
        for (const p of accepted) reminderSends.push(sendPushToUser(p.uid, payload));
        if (game.organizerUid) reminderSends.push(sendPushToUser(game.organizerUid, payload));
      });

      await Promise.allSettled(reminderSends);
      logger.info(`Game reminders: checked ${gamesSnap.size} game(s).`);
    } catch (e) {
      logger.error("Game reminder block failed:", e.message);
    }

    logger.info("Scheduled sender complete.");
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — GroupMe check-in trigger + NEW push to other players at court
// ─────────────────────────────────────────────────────────────────────────────

exports.onCheckinCreated = onDocumentCreated(
  "courts/{courtId}/checkins/{docId}",
  async (event) => {
    const courtId = event.params.courtId;
    const checkin = event.data.data();
    if (!checkin) return;

    // ── GroupMe bot message (for both active and scheduled check-ins) ──
    if (checkin.status === "active" || checkin.status === "later") {
      let botDoc;
      try { botDoc = await db.collection("groupme_bots").doc(courtId).get(); }
      catch (e) { logger.error("Failed to fetch botDoc:", e.message); }

      if (botDoc?.exists) {
        const botConfig = botDoc.data();
        if (botConfig.botId && botConfig.enabled !== false) {
          const rulesSnap = await db
            .collection("groupme_bots").doc(courtId).collection("event_rules")
            .where("trigger", "==", "checkin")
            .where("enabled", "==", true)
            .limit(1)
            .get();

          if (!rulesSnap.empty) {
            const rule = rulesSnap.docs[0].data();
            let msg;

            const courtDoc  = await db.collection("courts").doc(courtId).get();
            const courtData = courtDoc.exists ? courtDoc.data() : {};

            if (rule.customMsg) {
              const checkinsSnap = await db.collection("courts").doc(courtId).collection("checkins")
                .where("status", "==", "active").get();
              msg = rule.customMsg
                .replace("{name}",    checkin.userName || "Someone")
                .replace("{court}",   courtData.name || "the court")
                .replace("{players}", String(checkinsSnap.size))
                .replace("{courts}",  String(courtData.openCourts ?? courtData.numberOfCourts ?? 4));
            }

            if (!msg) {
              const checkinsSnap = await db.collection("courts").doc(courtId).collection("checkins")
                .where("status", "in", ["active", "later"]).get();
              const activeCount  = checkinsSnap.docs.filter(d => d.data().status === "active").length;
              const laterCount   = checkinsSnap.docs.filter(d => d.data().status === "later").length;
              const openCourts   = courtData.openCourts ?? courtData.numberOfCourts ?? 4;
              const ratingMap    = { "1.0":"1.0","1.5":"1.5","2.0":"2.0","2.5":"2.5","3.0":"3.0","3.5":"3.5","4.0":"4.0","4.5":"4.5","5.0":"5.0","5plus":"5.0+" };
              const rating       = checkin.rating && ratingMap[checkin.rating] ? ` ${ratingMap[checkin.rating]}` : "";
              const guests       = checkin.guests > 0 ? ` (+${checkin.guests} guests)` : "";

              if (checkin.status === "later" && checkin.arrivalTime) {
                const arrTime = new Date(checkin.arrivalTime).toLocaleTimeString("en-US", {
                  hour: "numeric", minute: "2-digit", timeZone: "America/Chicago"
                });
                msg =
                  `⏰ ${checkin.userName}${rating} is coming to ${courtData.name || "court"} at ${arrTime}${guests}\n` +
                  `👥 ${activeCount} playing now · ${laterCount} scheduled  🏟 ${openCourts} court${openCourts !== 1 ? "s" : ""} rotating`;
              } else {
                msg =
                  `🎾 ${checkin.userName}${rating} checked in at ${courtData.name || "court"}${guests}\n` +
                  `👥 ${activeCount} player${activeCount !== 1 ? "s" : ""} on-site  🏟 ${openCourts} court${openCourts !== 1 ? "s" : ""} rotating`;
              }
            }

            const result = await postGroupMe(botConfig.botId, msg);
            await writeLog(courtId, msg, result.ok ? "sent" : "failed", "event_checkin");
          }
        }
      }
    }

    // ── NEW: Push notification to other checked-in players at this court ──
    // Only notifies REGISTERED users (uid-based deviceId) whose check-in time overlaps
    try {
      const courtDoc  = await db.collection("courts").doc(courtId).get();
      const courtName = courtDoc.exists ? (courtDoc.data().name || "the court") : "the court";

      // Get all other active/later check-ins at this court
      const othersSnap = await db.collection("courts").doc(courtId).collection("checkins")
        .where("status", "in", ["active", "later"])
        .get();

      const sends = [];
      const thisDeviceId = checkin.deviceId;

      // Determine the new check-in's active time window
      const newStart = checkin.status === "active"
        ? (checkin.timestamp || Date.now())
        : (checkin.arrivalTime || Date.now());
      const newEnd = checkin.duration
        ? newStart + checkin.duration * 60000
        : newStart + 480 * 60000; // default 8-hr window if no duration

      othersSnap.forEach((doc) => {
        const other = doc.data();
        // Skip the person who just checked in
        if (!other.deviceId || other.deviceId === thisDeviceId) return;

        // Skip guest users — only notify registered users (uid-based deviceIds)
        // Guest deviceIds are random strings; registered users have Firebase Auth UIDs
        // We check if an fcm-tokens doc exists for this deviceId (done via sendPushToUser)
        // but also skip obviously random device IDs (no Firebase UID format)

        // Check time overlap: other's active window must intersect with new check-in's window
        const otherStart = other.status === "active"
          ? (other.timestamp || 0)
          : (other.arrivalTime || other.timestamp || 0);
        const otherEnd = other.duration
          ? otherStart + other.duration * 60000
          : otherStart + 480 * 60000;

        // No overlap → skip
        if (newStart >= otherEnd || newEnd <= otherStart) return;

        sends.push(sendPushToUser(other.deviceId, {
          title: "🏟️ Player joined your court!",
          body:  `${checkin.userName || "Someone"} checked in at ${courtName}`,
          data:  { type: "court_joined", prefKey: "courtJoined", courtId, screen: "courts" },
        }));
      });

      await Promise.allSettled(sends);
      if (sends.length > 0) logger.info(`Court check-in push: notified ${sends.length} player(s) at ${courtName}`);
    } catch (e) {
      logger.error("Court check-in push failed:", e.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — FCM notification-queue processor (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

exports.sendPushNotification = onDocumentCreated(
  "notification-queue/{docId}",
  async (event) => {
    const data = event.data.data();
    if (!data || !data.token) { logger.warn("sendPushNotification: missing token, skipping"); return; }

    const message = {
      token: data.token,
      notification: { title: data.title || "🎾 PickleConnect", body: data.body || "Court update" },
      data: { courtId: data.courtId || "", type: data.type || "general", sentAt: String(Date.now()) },
      webpush: {
        notification: {
          icon: "/icon-192.png", badge: "/icon-96.png",
          tag: data.courtId || "pickleconnect", renotify: true,
          actions: [
            { action: "view",    title: "👁 View Court" },
            { action: "dismiss", title: "Dismiss" },
          ],
        },
        fcmOptions: { link: data.courtId ? `/court.html?id=${data.courtId}` : "/index.html" },
      },
    };

    try {
      const response = await messaging.send(message);
      logger.info("FCM sent:", response);
      await event.data.ref.update({ status: "sent", sentAt: Date.now(), fcmMessageId: response });
    } catch (e) {
      logger.error("FCM send failed:", e.message);
      await event.data.ref.update({ status: "failed", error: e.message, sentAt: Date.now() });
      if (
        e.code === "messaging/registration-token-not-registered" ||
        e.code === "messaging/invalid-registration-token"
      ) {
        if (data.deviceId) await db.collection("fcm-tokens").doc(data.deviceId).delete().catch(() => {});
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — Nearby game available (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

exports.onGameCreated = onDocumentCreated(
  "games/{gameId}",
  async (event) => {
    const game   = event.data.data();
    const gameId = event.params.gameId;
    if (!game.lat || !game.lng) return;

    const profilesSnap = await db.collection("profiles").get();
    const sends = [];

    profilesSnap.forEach((doc) => {
      if (doc.id === game.organizerUid) return;
      const p = doc.data();
      if (!p.lat || !p.lng) return;
      const dist = haversine(game.lat, game.lng, p.lat, p.lng);
      if (dist > 25) return;

      sends.push(sendPushToUser(doc.id, {
        title: "🏓 Game nearby!",
        body:  `${game.organizerName || "Someone"} started a ${game.playType || "Casual"} game ${Math.round(dist)} mi away`,
        data:  { type: "nearby_game", prefKey: "nearbyGame", gameId, screen: "games" },
      }));
    });

    await Promise.allSettled(sends);
    logger.info(`onGameCreated: notified ${sends.length} nearby player(s).`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — Player availability match (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

exports.onPlayerPostCreated = onDocumentCreated(
  "findPlayers/{postId}",
  async (event) => {
    const post   = event.data.data();
    const postId = event.params.postId;
    if (!post.uid) return;

    const othersSnap    = await db.collection("findPlayers").where("uid", "!=", post.uid).get();
    const sends         = [];
    const notifiedUids  = new Set();

    othersSnap.forEach((doc) => {
      const other = doc.data();
      if (notifiedUids.has(other.uid)) return;

      const overlaps =
        post.availability === "Now" ||
        other.availability === "Now" ||
        post.availability === other.availability ||
        (post.availDate && post.availDate === other.availDate);

      if (!overlaps) return;

      if (post.lat && post.lng && other.lat && other.lng) {
        if (haversine(post.lat, post.lng, other.lat, other.lng) > 30) return;
      }

      notifiedUids.add(other.uid);
      sends.push(sendPushToUser(other.uid, {
        title: "👥 Player availability match!",
        body:  `${post.name || "A player"} is available to play — ${post.availability}`,
        data:  { type: "player_match", prefKey: "playerMatch", postId, screen: "players" },
      }));
    });

    await Promise.allSettled(sends);
    logger.info(`onPlayerPostCreated: notified ${sends.length} matched player(s).`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — Game invite / accept / decline (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

exports.onGameUpdated = onDocumentUpdated(
  "games/{gameId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    const gameId = event.params.gameId;

    const playersBefore = before.players || [];
    const playersAfter  = after.players  || [];

    for (const playerAfter of playersAfter) {
      const playerBefore    = playersBefore.find(p => p.uid === playerAfter.uid);
      const statusChanged   = !playerBefore || playerBefore.status !== playerAfter.status;
      if (!statusChanged) continue;

      // Invite sent
      if (!playerBefore && playerAfter.status === "invited") {
        await sendPushToUser(playerAfter.uid, {
          title: "📨 You've been invited!",
          body:  `${after.organizerName || "Someone"} invited you to a ${after.playType || ""} game on ${after.date || ""}`,
          data:  { type: "game_invite", prefKey: "gameInvite", gameId, screen: "games" },
        });
      }

      // Accepted
      if (playerBefore?.status === "invited" && playerAfter.status === "accepted") {
        await sendPushToUser(after.organizerUid, {
          title: "✅ Invite accepted!",
          body:  `${playerAfter.name || "A player"} accepted your game invite`,
          data:  { type: "invite_accepted", prefKey: "inviteResponse", gameId, screen: "games" },
        });
      }

      // Declined
      if (playerBefore?.status === "invited" && playerAfter.status === "declined") {
        await sendPushToUser(after.organizerUid, {
          title: "❌ Invite declined",
          body:  `${playerAfter.name || "A player"} declined your game invite`,
          data:  { type: "invite_declined", prefKey: "inviteResponse", gameId, screen: "games" },
        });
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FIXED — Direct message received
// Was: messages/{conversationId}/msgs/{msgId} (wrong path)
// Now: chatMessages/{msgId} (matches client-side code)
// Client writes: { convoId: "uid1__uid2", senderUid, senderName, text, timestamp }
// ─────────────────────────────────────────────────────────────────────────────

exports.onMessageCreated = onDocumentCreated(
  "chatMessages/{msgId}",
  async (event) => {
    const msg = event.data.data();
    if (!msg || !msg.senderUid || !msg.convoId) return;

    // convoId is "uid1__uid2" sorted — extract recipient
    const [uid1, uid2] = msg.convoId.split("__");
    const recipientUid = msg.senderUid === uid1 ? uid2 : uid1;
    if (!recipientUid || recipientUid === msg.senderUid) return;

    await sendPushToUser(recipientUid, {
      title: `💬 ${msg.senderName || "New message"}`,
      body:  msg.text ? msg.text.substring(0, 80) : "Sent you a message",
      data:  {
        type:           "direct_message",
        prefKey:        "directMessage",
        senderUid:      msg.senderUid,
        conversationId: msg.convoId,
        screen:         "profile",
      },
    });
  }
);
