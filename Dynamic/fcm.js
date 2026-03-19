/**
 * PickleConnect – FCM Client Integration
 * Handles web + native iOS/Android push notifications
 */

const VAPID_KEY = "BO8kuV9zmoNdPv7zDrUgYNz82A3Nk3cE6wSDO5-4PXi4FJZ0HEy1NLri2N0BsF_mzV5pKtgYHXbKq8_cIA2a3oY";

window.PickleNotif = {

  messaging: null,
  _uid: null,

  async init(uid) {
    if (!uid) return;
    this._uid = uid;

    // Check master toggle — field name matches Cloud Functions: masterEnabled
    const prefs = await this.loadPrefs(uid);
    if (prefs?.masterEnabled === false) {
      console.log("[FCM] Notifications disabled by user.");
      await this._removeToken(uid);
      return;
    }

    // ─── NATIVE iOS/Android (Capacitor) ───
    if (window.Capacitor?.isNativePlatform?.()) {
      console.log("[FCM] Native platform detected");
      try {
        const FirebaseMessaging = window.Capacitor.Plugins?.FirebaseMessaging;

        if (!FirebaseMessaging) {
          console.error("[FCM] FirebaseMessaging plugin not found, trying PushNotifications");
          const PushNotifications = window.Capacitor.Plugins?.PushNotifications;
          if (PushNotifications) {
            const perm = await PushNotifications.requestPermissions();
            if (perm.receive === "granted") await PushNotifications.register();
          }
          return;
        }

        const perm = await FirebaseMessaging.requestPermissions();
        console.log("[FCM] Permission:", perm.receive);

        if (perm.receive === "granted") {
          const result = await FirebaseMessaging.getToken();
          console.log("[FCM] FCM token:", result.token);
          await this._saveToken(uid, result.token);

          await FirebaseMessaging.addListener("tokenReceived", async (event) => {
            console.log("[FCM] Token refreshed:", event.token);
            await this._saveToken(uid, event.token);
          });

          await FirebaseMessaging.addListener("notificationReceived", (event) => {
            console.log("[FCM] Foreground push:", event.notification);
            this._showInAppToast({
              title: event.notification?.title,
              body: event.notification?.body
            });
          });

          await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
            console.log("[FCM] Push tapped:", event);
            const data = event.notification?.data || {};
            if (data.screen) window.location.hash = "#tab=" + data.screen;
          });
        }
      } catch (e) {
        console.error("[FCM] Native push setup failed:", e);
      }
      return;
    }

    // ─── WEB (browser / PWA) ───
    if (!window.firebase?.messaging) {
      setTimeout(() => this.init(uid), 500);
      return;
    }

    try {
      this.messaging = firebase.messaging();

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("[FCM] Permission denied.");
        return;
      }

      const token = await this.messaging.getToken({ vapidKey: VAPID_KEY });
      if (token) await this._saveToken(uid, token);

      this.messaging.onMessage((payload) => {
        this._showInAppToast(payload.notification);
      });
    } catch (err) {
      console.error("[FCM] Init error:", err);
    }
  },

  async setEnabled(uid, enabled) {
    if (!uid) return;
    await this.savePrefs(uid, { masterEnabled: enabled });
    if (enabled) await this.init(uid);
    else await this._removeToken(uid);
  },

  async _saveToken(uid, token) {
    try {
      const platform = window.Capacitor?.isNativePlatform?.()
        ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios-native" : "android-native")
        : this._getPlatform();
      await firebase.firestore().collection("fcm-tokens").doc(uid).set({
        token,
        deviceId: uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        platform,
      });
      console.log("[FCM] Token saved. Platform:", platform);
    } catch (e) {
      console.error("[FCM] Token save failed:", e);
    }
  },

  async _removeToken(uid) {
    try {
      await firebase.firestore().collection("fcm-tokens").doc(uid).delete();
    } catch (e) {
      if (e.code !== "not-found") console.error("[FCM] Token remove failed:", e);
    }
  },

  _showInAppToast({ title, body } = {}) {
    if (!title) return;
    const existing = document.getElementById("fcm-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "fcm-toast";
    el.innerHTML =
      '<div style="font-weight:700;font-size:0.85rem;margin-bottom:3px;">' + title + '</div>' +
      '<div style="font-size:0.75rem;opacity:0.85;line-height:1.4;">' + (body || "") + '</div>';
    Object.assign(el.style, {
      position: "fixed", top: "70px", left: "50%", transform: "translateX(-50%)",
      background: "#1A2B3C", border: "1px solid rgba(46,204,113,0.35)",
      borderLeft: "4px solid #2ECC71", color: "#F0F4F8",
      padding: "12px 16px", borderRadius: "14px",
      maxWidth: "340px", width: "calc(100% - 32px)",
      zIndex: "99999", boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      fontFamily: "'DM Sans', sans-serif", animation: "fcmSlideIn 0.28s ease",
      cursor: "pointer",
    });

    if (!document.getElementById("fcm-style")) {
      const style = document.createElement("style");
      style.id = "fcm-style";
      style.textContent = "@keyframes fcmSlideIn { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }";
      document.head.appendChild(style);
    }

    el.onclick = () => el.remove();
    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 4500);
  },

  async savePrefs(uid, prefs) {
    if (!uid || !firebase?.firestore) return;
    try {
      await firebase.firestore().collection("notifPrefs").doc(uid).set(prefs, { merge: true });
    } catch (e) {
      console.error("[FCM] Prefs save failed:", e);
    }
  },

  async loadPrefs(uid) {
    if (!uid) return null;
    try {
      const doc = await firebase.firestore().collection("notifPrefs").doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      return null;
    }
  },

  _getPlatform() {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios-web";
    if (/Android/.test(navigator.userAgent)) return "android-web";
    return "web";
  },
};

(function waitForFirebase(attempts) {
  if (window.firebase?.apps?.length && window.firebase?.auth) {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) PickleNotif.init(user.uid);
    });
  } else if (attempts > 0) {
    setTimeout(() => waitForFirebase(attempts - 1), 300);
  }
})(20);
