// firebase-messaging-sw.js
// Must live at the ROOT of your site (same level as index.html)
// This file handles background push notifications when the browser/tab is not focused

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            "AIzaSyDaFUszTD0-Ro292GOBSlS5vkZSdJM0NF4",
    authDomain:        "pickleball-app-1bba7.firebaseapp.com",
    projectId:         "pickleball-app-1bba7",
    storageBucket:     "pickleball-app-1bba7.firebasestorage.app",
    messagingSenderId: "645604154338",
    appId:             "1:645604154338:web:b92f87c2cd11d950b737bb"
});

const messaging = firebase.messaging();

// Handle background messages (browser closed / tab not focused)
messaging.onBackgroundMessage(payload => {
    console.log('[SW] Background message:', payload);

    const { title, body, icon, badge, data } = payload.notification || {};
    const courtId = payload.data?.courtId;

    self.registration.showNotification(title || '🎾 PickleConnect', {
        body:    body    || 'Court update',
        icon:    icon    || '/icon-192.png',
        badge:   badge   || '/icon-96.png',
        tag:     courtId || 'pickleconnect',   // replaces previous notif for same court
        renotify: true,
        data:    payload.data || {},
        actions: [
            { action: 'view', title: '👁 View Court' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    });
});

// Handle notification click → open court page
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const courtId = event.notification.data?.courtId;
    const url = courtId
        ? `/court.html?id=${courtId}`
        : '/index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Focus existing tab if open
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new tab
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
