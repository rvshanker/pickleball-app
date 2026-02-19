// firebase-messaging-sw.js
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

// Handle background messages
messaging.onBackgroundMessage(payload => {
    console.log('[SW] Background message received:', payload);
    const title = payload.notification?.title || payload.data?.title || 'PickleCourt';
    const body = payload.notification?.body || payload.data?.body || '';
    self.registration.showNotification(title, {
        body,
        icon: 'https://pickleconnect.live/dp/favicon.ico',
        tag: 'picklecourt-' + Date.now(),
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: payload.data || {}
    });
});

// Handle ALL push events directly - fires even when tab is focused
self.addEventListener('push', e => {
    console.log('[SW] Push event received');
    let title = 'PickleCourt Alert';
    let body = '';
    try {
        const data = e.data.json();
        title = data.notification?.title || data.data?.title || title;
        body = data.notification?.body || data.data?.body || body;
    } catch(err) {
        body = e.data ? e.data.text() : '';
    }
    e.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: 'https://pickleconnect.live/dp/favicon.ico',
            tag: 'picklecourt-' + Date.now(),
            requireInteraction: true,
            vibrate: [200, 100, 200]
        })
    );
});

// Handle notification click
self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const client of list) {
                if (client.url.includes('pickleconnect.live') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow('https://pickleconnect.live/dp/index2.html');
        })
    );
});
