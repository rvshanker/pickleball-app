/**
 * Firebase Messaging Service Worker
 * ==================================
 * Place this file at: public/firebase-messaging-sw.js
 * (must be at the root of your hosted site)
 *
 * Handles push notifications when the app is in the background or closed.
 */

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDaFUszTD0-Ro292GOBSlS5vkZSdJM0NF4",
  authDomain: "pickleball-app-1bba7.firebaseapp.com",
  projectId: "pickleball-app-1bba7",
  storageBucket: "pickleball-app-1bba7.firebasestorage.app",
  messagingSenderId: "645604154338",
  appId: "1:645604154338:web:b92f87c2cd11d950b737bb",
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  // Don't show if notification already handled by the browser
  if (!title) return;

  const options = {
    body: body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: data,
    // Deep link based on notification type
    actions: getActions(data.type),
    tag: data.type || "general", // collapse same-type notifications
  };

  self.registration.showNotification(title, options);
});

// Handle notification click → open the app to the right tab
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = "/";

  switch (data.type) {
    case "gameInvite":
    case "inviteAccepted":
    case "inviteDeclined":
    case "playerJoined":
    case "nearbyGame":
    case "gameReminder":
      url = "/#tab=games";
      break;
    case "directMessage":
      url = "/#tab=profile"; // opens inbox from profile
      break;
    case "courtJoin":
      url = "/#tab=courts";
      break;
    default:
      url = "/";
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open new tab
      return clients.openWindow(url);
    })
  );
});

function getActions(type) {
  switch (type) {
    case "gameInvite":
      return [
        { action: "accept", title: "✓ Accept" },
        { action: "view", title: "View" },
      ];
    case "directMessage":
      return [{ action: "reply", title: "Reply" }];
    default:
      return [{ action: "open", title: "Open" }];
  }
}
