/**
 * PickleConnect – FCM Client Integration
 * =======================================
 * Add this file as: fcm.js
 * Then include in index.html AFTER nav.js:
 *   <script src="fcm.js"></script>
 *
 * Also add to index.html <head>:
 *   <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"></script>
 *
 * And create public/firebase-messaging-sw.js (see bottom of this file)
 *
 * Replace VAPID_KEY below with your key from:
 * Firebase Console → Project Settings → Cloud Messaging → Web Push Certificates
 */

const VAPID_KEY = "BO8kuV9zmoNdPv7zDrUgYNz82A3Nk3cE6wSDO5-4PXi4FJZ0HEy1NLri2N0BsF_mzV5pKtgYHXbKq8_cIA2a3oY";

// ─────────────────────────────────────────────
// Initialize FCM (runs after Firebase is ready)
// ─────────────────────────────────────────────
window.PickleNotif = {

  messaging: null,
  _uid: null,

  async init(uid) {
    // Wait until firebase-messaging is loaded
    if (!uid) return;
    if (!window.firebase?.messaging) {
      console.log("[FCM] firebase-messaging not ready, retrying…");
      setTimeout(() => this.init(uid), 500);
      return;
    }

    this._uid = uid;

    try {
      this.messaging = firebase.messaging();

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("[FCM] Notification permission denied.");
        return;
      }

      // Get token
      const token = await this.messaging.getToken({ vapidKey: VAPID_KEY });
      if (token) await this._saveToken(uid, token);

      // Handle foreground messages (app is open)
      // Note: onTokenRefresh was removed in Firebase v9 — getToken() always returns fresh token
      this.messaging.onMessage((payload) => {
        this._showInAppToast(payload.notification);
      });

    } catch (err) {
      console.error("[FCM] Init error:", err);
    }
  },

  // ─── Save token to Firestore ───
  // Uses fcm-tokens/{uid} to match Firestore rules + Cloud Functions
  async _saveToken(uid, token) {
    try {
      await firebase.firestore().collection("fcm-tokens").doc(uid).set({
        token,
        deviceId: uid,                                             // rules require deviceId field
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        platform: this._getPlatform(),
      });
      console.log("[FCM] Token saved.");
    } catch (e) {
      console.error("[FCM] Token save failed:", e);
    }
  },

  // ─── In-app toast for foreground notifications ───
  _showInAppToast({ title, body } = {}) {
    if (!title) return;

    // Remove existing toast
    const existing = document.getElementById("fcm-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "fcm-toast";
    el.innerHTML = `
      <div style="font-weight:700;font-size:0.85rem;margin-bottom:3px;">${title}</div>
      <div style="font-size:0.75rem;opacity:0.85;line-height:1.4;">${body || ""}</div>
    `;
    Object.assign(el.style, {
      position: "fixed",
      top: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1A2B3C",
      border: "1px solid rgba(46,204,113,0.35)",
      borderLeft: "4px solid #2ECC71",
      color: "#F0F4F8",
      padding: "12px 16px",
      borderRadius: "14px",
      maxWidth: "340px",
      width: "calc(100% - 32px)",
      zIndex: "99999",
      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      fontFamily: "'DM Sans', sans-serif",
      animation: "fcmSlideIn 0.28s ease",
      cursor: "pointer",
    });

    // Inject keyframe once
    if (!document.getElementById("fcm-style")) {
      const style = document.createElement("style");
      style.id = "fcm-style";
      style.textContent = `
        @keyframes fcmSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    el.onclick = () => el.remove();
    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 4500);
  },

  // ─── Save notification preferences to Firestore ───
  async savePrefs(uid, prefs) {
    if (!uid || !firebase?.firestore) return;
    try {
      await firebase.firestore().collection("notifPrefs").doc(uid).set(prefs, { merge: true });
      console.log("[FCM] Prefs saved.");
    } catch (e) {
      console.error("[FCM] Prefs save failed:", e);
    }
  },

  // ─── Load preferences from Firestore ───
  async loadPrefs(uid) {
    if (!uid) return null;
    try {
      const doc = await firebase.firestore().collection("notifPrefs").doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.error("[FCM] Prefs load failed:", e);
      return null;
    }
  },

  _getPlatform() {
    if (window.Capacitor?.isNativePlatform?.()) return "native";
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios-web";
    if (/Android/.test(navigator.userAgent)) return "android-web";
    return "web";
  },
};

// ─────────────────────────────────────────────
// Auto-init: wait for Firebase to be ready, then hook auth state
// fcm.js loads after nav.js but Firebase may still be initializing
// ─────────────────────────────────────────────
(function waitForFirebase(attempts) {
  if (window.firebase?.apps?.length && window.firebase?.auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) PickleNotif.init(user.uid);
    });
  } else if (attempts > 0) {
    setTimeout(() => waitForFirebase(attempts - 1), 300);
  } else {
    console.warn("[FCM] Firebase not available after waiting.");
  }
})(20); // retry up to 20 × 300ms = 6 seconds

// firebase-messaging-sw.js is a separate file at the site root.
