// PickleConnect — Firebase Messaging Service Worker
// Handles push notifications when the app is closed or in the background.
// This file MUST live at the root of your site: /firebase-messaging-sw.js

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

// Background message handler — fires when app tab is hidden or closed
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '🎾 PickleConnect';
  const body  = payload.notification?.body  || 'You have a new update';
  const data  = payload.data || {};

  self.registration.showNotification(title, {
    body,
    icon:     '/icon-192.png',
    badge:    '/icon-96.png',
    tag:      data.type || 'pickleconnect',
    renotify: true,
    data,
  });
});

// Notification click — open the correct screen inside the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const screen = event.notification.data?.screen || '';
  const url    = screen ? '/?tab=' + screen : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK', screen, data: event.notification.data });
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
