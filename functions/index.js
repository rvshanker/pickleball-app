const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// ── Send FCM push notification when notification-queue doc is created ──
exports.sendPickleNotification = functions
  .runWith({ runtime: 'nodejs20' })
  .firestore.document('notification-queue/{docId}')
  .onCreate(async (snap) => {
    const { title, body, courtId, senderDeviceId } = snap.data();
    try {
      const tokensSnap = await admin.firestore()
        .collection('fcm-tokens')
        .where('courtId', '==', courtId)
        .get();
      const tokens = tokensSnap.docs
        .filter(d => d.data().token && d.id !== senderDeviceId)
        .map(d => d.data().token);
      console.log(`Sending to ${tokens.length} device(s): ${title}`);
      if (tokens.length > 0) {
        const result = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title, body },
          webpush: {
            notification: { title, body, requireInteraction: true, tag: 'picklecourt-' + Date.now() },
            fcmOptions: { link: 'https://pickleconnect.live/dp/index2.html' }
          }
        });
        console.log(`Sent: ${result.successCount} success, ${result.failureCount} failed`);
      }
    } catch (e) { console.error('Send failed:', e); }
    await snap.ref.delete();
  });

// ── Scheduled cleanup: runs every 5 minutes, deletes expired check-ins ──
exports.cleanupExpiredCheckIns = functions
  .runWith({ runtime: 'nodejs20' })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const now = Date.now();
    const db = admin.firestore();
    const snap = await db.collection('check-ins').get();
    const deletes = [];

    for (const doc of snap.docs) {
      const c = doc.data();

      // Delete if older than 24 hours regardless
      if (now - c.timestamp > 24 * 3600000) {
        deletes.push(doc.ref.delete());
        continue;
      }

      // Auto-promote 'later' → 'now' when arrival time has passed
      if (c.status === 'later' && c.arrivalTime && now >= c.arrivalTime) {
        await doc.ref.update({ status: 'now', timestamp: now });
        // Re-read to get updated timestamp for duration check below
        c.status = 'now';
        c.timestamp = now;
      }

      // Delete 'now' players whose duration has expired
      if (c.status === 'now' && c.duration) {
        if (now > c.timestamp + c.duration * 60000) {
          deletes.push(doc.ref.delete());
        }
      }
    }

    await Promise.all(deletes);
    console.log(`Cleanup done: ${deletes.length} check-ins deleted`);

    // Also clean up old DM messages (older than 24 hours)
    const dmSnap = await db.collection('dm-messages')
      .where('createdAt', '<', new Date(now - 24 * 3600000))
      .get();
    await Promise.all(dmSnap.docs.map(d => d.ref.delete()));
    console.log(`DM cleanup: ${dmSnap.docs.length} messages deleted`);

    return null;
  });
