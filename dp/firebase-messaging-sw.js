// firebase-messaging-sw.js
// Place this file in the SAME folder as index.html on your GitHub repo

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDaFUszTD0-Ro292GOBSlS5vkZSdJM0NF4",
    authDomain: "pickleball-app-1bba7.firebaseapp.com",
    projectId: "pickleball-app-1bba7",
    storageBucket: "pickleball-app-1bba7.firebasestorage.app",
    messagingSenderId: "645604154338",
    appId: "1:645604154338:web:b92f87c2cd11d950b737bb"
});

const messaging = firebase.messaging();

// Handle background messages (app closed or tab not focused)
messaging.onBackgroundMessage(payload => {
    const { title, body } = payload.notification || payload.data || {};
    if (!title) return;
    self.registration.showNotification(title, {
        body: body || '',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'picklecourt-' + Date.now(),
        requireInteraction: true,
        data: payload.data || {}
    });
});

// Handle notification click — focus the app tab or open it
self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const client of list) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
