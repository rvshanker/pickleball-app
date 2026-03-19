/**
 * PickleConnect – FCM Client Integration (updated)
 * =================================================
 * Handles: permission request, token management, foreground toasts,
 *          notification preferences (master toggle + per-category).
 *
 * The master toggle ("enabled") controls everything:
 *   - ON:  requests permission, registers token, sends to Cloud Functions
 *   - OFF: does NOT request permission, removes token from Firestore
 *          so Cloud Functions can't send anything
 *
 * Replace VAPID_KEY with yours from Firebase Console.
 */

const VAPID_KEY = "BO8kuV9zmoNdPv7zDrUgYNz82A3Nk3cE6wSDO5-4PXi4FJZ0HEy1NLri2N0BsF_mzV5pKtgYHXbKq8_cIA2a3oY";

window.PickleNotif = {

  messaging: null,
  _uid: null,

  // ─── Main init: called on auth state change ───
  async init(uid) {
    if (!uid) return;
    if (!window.firebase?.messaging) {
      setTimeout(() => this.init(uid), 500);
      return;
    }

    this._uid = uid;

    // Check master toggle FIRST
    const prefs = await this.loadPrefs(uid);
    if (prefs?.enabled === false) {
      console.log("[FCM] Notifications disabled by user.");
      // Ensure token is removed so no pushes arrive
      await this._removeToken(uid);
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

      // Foreground message handler
      this.messaging.onMessage((payload) => {
        this._showInAppToast(payload.notification);
      });

    } catch (err) {
      console.error("[FCM] Init error:", err);
    }
  },

  // ─── Master toggle handler ───
  // Call this when user flips the top switch
  async setEnabled(uid, enabled) {
    if (!uid) return;
    await this.savePrefs(uid, { enabled });
    if (enabled) {
      // Re-init to request permission + register token
      await this.init(uid);
    } else {
      // Remove token so Cloud Functions can't send pushes
      await this._removeToken(uid);
    }
  },

  // ─── Save token to Firestore ───
  async _saveToken(uid, token) {
    try {
      await firebase.firestore().collection("fcm-tokens").doc(uid).set({
        token,
        deviceId: uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        platform: this._getPlatform(),
      });
      console.log("[FCM] Token saved.");
    } catch (e) {
      console.error("[FCM] Token save failed:", e);
    }
  },

  // ─── Remove token from Firestore (disables pushes) ───
  async _removeToken(uid) {
    try {
      await firebase.firestore().collection("fcm-tokens").doc(uid).delete();
      console.log("[FCM] Token removed (notifications disabled).");
    } catch (e) {
      // Document may not exist — that's fine
      if (e.code !== "not-found") console.error("[FCM] Token remove failed:", e);
    }
  },

  // ─── In-app toast for foreground notifications ───
  _showInAppToast({ title, body } = {}) {
    if (!title) return;
    const existing = document.getElementById("fcm-toast");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "fcm-toast";
    el.innerHTML = `
      <div style="font-weight:700;font-size:0.85rem;margin-bottom:3px;">${title}</div>
      <div style="font-size:0.75rem;opacity:0.85;line-height:1.4;">${body || ""}</div>
    `;
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

  // ─── Save notification preferences ───
  async savePrefs(uid, prefs) {
    if (!uid || !firebase?.firestore) return;
    try {
      await firebase.firestore().collection("notifPrefs").doc(uid).set(prefs, { merge: true });
      console.log("[FCM] Prefs saved:", Object.keys(prefs));
    } catch (e) {
      console.error("[FCM] Prefs save failed:", e);
    }
  },

  // ─── Load preferences ───
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

// ─── Auto-init on auth state ───
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
})(20);
