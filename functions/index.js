const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendPickleNotification = functions.firestore.onDocumentCreated(
  'notification-queue/{docId}',
  async (event) => {
    const data = event.data.data();
    const { title, body, courtId, senderDeviceId } = data;

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
              icon: 'https://rvshanker.github.io/pickleball-app/dp/favicon.ico',
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

    await event.data.ref.delete();
  }
);
