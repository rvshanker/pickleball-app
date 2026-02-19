const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Using v1 Firestore trigger - simpler, no Eventarc needed
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
            notification: {
              title,
              body,
              requireInteraction: true,
              tag: 'picklecourt-' + Date.now()
            },
            fcmOptions: {
              link: 'https://pickleconnect.live/dp/index2.html'
            }
          }
        });
        console.log(`Sent: ${result.successCount} success, ${result.failureCount} failed`);
      }
    } catch (e) {
      console.error('Send failed:', e);
    }

    await snap.ref.delete();
  });
