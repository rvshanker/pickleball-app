const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendPickleNotification = functions.firestore
  .document('notification-queue/{docId}')
  .onCreate(async (snap) => {
    const { title, body, courtId, senderDeviceId } = snap.data();

    try {
      // Get all FCM tokens for this court except the sender
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
              icon: 'https://rvshanker.github.io/pickleball-app/dp/favicon.ico',
              requireInteraction: true,
              tag: 'picklecourt-' + Date.now()
            },
            fcmOptions: {
              link: 'https://rvshanker.github.io/pickleball-app/dp/'
            }
          }
        });
        console.log(`Sent: ${result.successCount} success, ${result.failureCount} failed`);
      }
    } catch (e) {
      console.error('Send failed:', e);
    }

    // Always delete the queue doc to keep Firestore clean
    await snap.ref.delete();
  });
