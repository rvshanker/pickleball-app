Looking through your updated unified navigation script (`nav.js`), it looks clean, highly functional, and well-structured. However, there are a few edge cases, DOM duplication issues, and timing collisions typical in single-page routing architectures (like the one you are bridging here) that you should optimize or guard against.

Here is a breakdown of the key areas to adjust, along with an optimized version of your script:

### 1. The Multi-Initialization / Duplicate Element Bug

Because this script utilizes `document.readyState` listeners *and* can be embedded in pages that use an external single-page tab-switching routine (`window.__pcnSetTab`), the `init()` function can sometimes be forced to re-run or get injected multiple times if a full DOM teardown doesn't happen.

* **The Issue:** If `init()` runs twice, lines like `document.body.insertBefore(topBar, ...)` and `document.body.appendChild(botNav)` will cause duplicate headers, multi-layered fixed panels, or throw hierarchy errors.
* **The Fix:** Implement an explicit guard variable or check for existing element IDs (`#pcn-top`, `#pcn-bot`) right at the start of your code execution to instantly bail if the unified nav is already present in the current view.

### 2. Audio Engine Unlock Collisions

Browsers block Web Audio context playback until an explicit user interaction occurs (`click`, `touchstart`, `keydown`). Your script handles this beautifully with `_unlockAudio`, but there is a slight structural problem:

* **The Issue:** `_unlockAudio` tries to instantiate `new AudioContext()` and call `.resume()` inside standard event listeners marked as `{ passive: true }`. In some versions of Chromium or mobile Safari, instantiating or mutating audio inside a passive event context can trigger strict warnings or fail to fully bound-bind the user activation state.
* **The Fix:** Remove `{ passive: true }` from the `click` listener or structure the `getAudioCtx()` handler to explicitly resolve inside a direct, active user event stack before relying on it inside incoming background snapshot listeners.

### 3. Asynchronous Profile Picture Flickering

You added a "flicker fix" by loading data from `sessionStorage` into `userPill()`. This is an excellent addition. However, right after the user object is pulled, `watchAuth` sets up `auth.onAuthStateChanged(...)`.

* **The Issue:** When Firebase first loads, `onAuthStateChanged` fires with the authenticated user. Your script instantly builds a fresh `userPill(...)` right away, but it defaults `skill` and `city` to empty strings (`''`) because it hasn't yet awaited the asynchronous Firestore document get (`db.collection('profiles').doc(...)`). This creates a quick sub-second visual reset where a user's skill/location disappears from the dropdown headers, only to flash back in once the Firestore promise resolves.
* **The Fix:** Don't replace or redraw the base profile pill if it already exists from cache unless the user object's critical profile variables actually change, or mutate the sub-elements (like the subtitle container text) directly once the database resolution concludes.

---

### Optimized `nav.js` Script

Here is the hardened code with explicit structural guards, fixed event handling context, and structured fallback states for your Firebase profile state engine:

```javascript
/**
 * PickleConnect — Unified Navigation v3 (Hardened)
 * Add before </body> in every page:  <script src="nav.js"></script>
 */
(function () {
  'use strict';

  // Structural Guard: Prevent double-loading if script or SPA view triggers it twice
  if (window.__pcnInitialized || document.getElementById('pcn-top')) {
    return;
  }
  window.__pcnInitialized = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Re-verify DOM elements haven't been appended during thread idle times
    if (document.getElementById('pcn-top')) return;

    const PAGE_META = {
      'pickleconnect-app.html': { id: 'home',       label: 'Home'       },
      'index.html':             { id: 'home',       label: 'Home'       },
      'court-main.html':        { id: 'courts',     label: 'Courts'     },
      'court.html':             { id: 'courts',     label: 'Courts'     },
      'findgame.html':          { id: 'games',      label: 'Games'      },
      'findplayer.html':        { id: 'players',    label: 'Players'    },
      'tournament.html':        { id: 'tournament', label: 'Tournament' },
    };

    const NAV_ITEMS = [
      { id: 'home',       label: 'Home',       icon: '🏠', href: 'index.html'      },
      { id: 'courts',     label: 'Courts',     icon: '🏟', href: 'court-main.html' },
      { id: 'games',      label: 'Games',      icon: '🎮', href: 'findgame.html'   },
      { id: 'players',    label: 'Players',    icon: '👥', href: 'findplayer.html' },
    ];

    const filename = window.location.pathname.split('/').pop() || 'index.html';
    const meta     = PAGE_META[filename] || { id: 'home', label: '' };

    /* ── Sound Engine (Web Audio API) ────────────────────────────────── */
    let _audioCtx = null;
    function getAudioCtx() {
      if (!_audioCtx) {
        try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
      }
      if (_audioCtx && _audioCtx.state === 'suspended') {
        _audioCtx.resume().catch(() => {});
      }
      return _audioCtx;
    }

    function _unlockAudio() {
      const ctx = getAudioCtx();
      if (ctx) {
        // Once successfully unlocked or initialized, remove hooks safely
        document.removeEventListener('click', _unlockAudio);
        document.removeEventListener('touchstart', _unlockAudio);
        document.removeEventListener('keydown', _unlockAudio);
      }
    }
    // Do not mark click as passive since it might require context state mutation constraints
    document.addEventListener('click',      _unlockAudio, { passive: false });
    document.addEventListener('touchstart', _unlockAudio, { passive: true });
    document.addEventListener('keydown',    _unlockAudio, { passive: true });

    function playSound(type) {
      const ctx = getAudioCtx();
      if (!ctx || ctx.state === 'suspended') return;
      try {
        if (type === 'message') {
          [440, 550].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = freq;
            const t = ctx.currentTime + i * 0.12;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.18, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            o.start(t); o.stop(t + 0.32);
          });
        } else if (type === 'notification') {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(880, ctx.currentTime);
          o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
          g.gain.setValueAtTime(0.22, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          o.start(); o.stop(ctx.currentTime + 0.42);
        }
      } catch(e) {}
    }

    /* ── CSS ──────────────────────────────────────────────────────────── */
    const S = document.createElement('style');
    S.id = 'pcn-css';
    S.textContent = `
      :root{--pcn-green:#2ECC71;--pcn-navy:#0D1B2A;--pcn-border:rgba(255,255,255,0.09);--pcn-muted:#7A9BB5;--pcn-text:#F0F4F8;--pcn-top:54px;--pcn-bot:62px;}
      body{padding-top:var(--pcn-top)!important;padding-bottom:var(--pcn-bot)!important;}
      #pcn-top{position:fixed;top:0;left:0;right:0;height:var(--pcn-top);background:rgba(13,27,42,0.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid var(--pcn-border);display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 14px;z-index:9900;box-sizing:border-box;font-family:'DM Sans','Outfit',sans-serif;gap:8px;}
      .pcn-logo{font-family:'Syne','Barlow Condensed','Outfit',sans-serif;font-size:1rem;font-weight:800;color:var(--pcn-green);letter-spacing:-0.02em;cursor:pointer;white-space:nowrap;flex-shrink:0;line-height:1;}
      .pcn-logo span{color:var(--pcn-text);}
      .pcn-label{display:none!important;}
      .pcn-spacer{flex:1;}
      .pcn-icons{display:flex;align-items:center;gap:4px;flex-shrink:0;}
      .pcn-icon-btn{position:relative;width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;flex-shrink:0;}
      .pcn-icon-btn:hover{background:rgba(255,255,255,0.13);}
      .pcn-icon-btn svg{width:17px;height:17px;stroke:var(--pcn-text);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
      .pcn-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;background:#ef4444;color:white;border-radius:8px;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 3px;border:1.5px solid rgba(13,27,42,0.97);animation:pcnPop .2s ease;}
      @keyframes pcnPop{from{transform:scale(0)}to{transform:scale(1)}}
      #pcn-pill{position:relative;flex-shrink:0;}
      .pcn-pill-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:4px 9px 4px 4px;cursor:pointer;font-family:'DM Sans','Outfit',sans-serif;transition:background .15s;}
      .pcn-pill-btn:hover{background:rgba(255,255,255,0.13);}
      .pcn-pill-av{width:27px;height:27px;border-radius:50%;background:linear-gradient(135deg,#059669,#2ECC71);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;overflow:hidden;flex-shrink:0;}
      .pcn-pill-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
      .pcn-pill-name{display:none;}
      .pcn-pill-caret{display:none;}
      #pcn-dd{display:none;position:absolute;top:calc(100% + 8px);right:0;background:#1A2B3C;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.1);min-width:180px;overflow:hidden;z-index:9999;animation:pcnDrop .16s ease;}
      #pcn-dd.open{display:block;}
      @keyframes pcnDrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      .pcn-dd-hdr{padding:13px 16px 10px;border-bottom:1px solid rgba(255,255,255,0.08);}
      .pcn-dd-name{font-size:14px;font-weight:700;color:#F0F4F8;}
      .pcn-dd-sub{font-size:11px;color:#7A9BB5;margin-top:2px;}
      .pcn-dd-btn{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:11px 16px;font-family:'DM Sans','Outfit',sans-serif;font-size:13px;font-weight:600;color:#F0F4F8;cursor:pointer;text-align:left;transition:background .12s;}
      .pcn-dd-btn:hover{background:rgba(255,255,255,0.06);}
      .pcn-dd-btn.red{color:#F75B5B;}
      .pcn-dd-btn.red:hover{background:rgba(247,91,91,0.08);}
      #pcn-notif-panel{display:none;position:fixed;top:var(--pcn-top);right:0;width:min(360px,100vw);background:#1A2B3C;box-shadow:-4px 0 32px rgba(0,0,0,0.4);border-left:1px solid rgba(255,255,255,0.08);z-index:9990;max-height:calc(100vh - var(--pcn-top) - var(--pcn-bot));overflow-y:auto;animation:pcnSlideR .2s ease;}
      #pcn-notif-panel.open{display:block;}
      @keyframes pcnSlideR{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
      .pcn-panel-hdr{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#1A2B3C;z-index:1;}
      .pcn-panel-title{font-size:15px;font-weight:800;color:#F0F4F8;}
      .pcn-panel-close{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:13px;color:#7A9BB5;}
      .pcn-notif-item{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;gap:10px;align-items:flex-start;cursor:pointer;transition:background .12s;}
      .pcn-notif-item:hover{background:rgba(255,255,255,0.04);}
      .pcn-notif-item.unread{background:rgba(46,204,113,0.06);}
      .pcn-notif-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;background:rgba(255,255,255,0.06);}
      .pcn-notif-body{flex:1;min-width:0;}
      .pcn-notif-text{font-size:13px;font-weight:600;color:#F0F4F8;line-height:1.4;}
      .pcn-notif-time{font-size:11px;color:#7A9BB5;margin-top:2px;}
      .pcn-notif-dot{width:8px;height:8px;border-radius:50%;background:#2ECC71;flex-shrink:0;margin-top:4px;}
      .pcn-empty{text-align:center;padding:40px 20px;color:#7A9BB5;font-size:13px;}
      #pcn-signin{display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#2ECC71,#27AE60);border:none;border-radius:18px;padding:6px 12px;font-family:'DM Sans','Outfit',sans-serif;font-size:0.75rem;font-weight:700;color:white;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 10px rgba(46,204,113,0.35);transition:opacity .15s;}
      #pcn-signin:hover{opacity:.9;}
      #pcn-bot{position:fixed;bottom:0;left:0;right:0;height:var(--pcn-bot);background:rgba(13,27,42,0.98);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--pcn-border);display:flex;align-items:stretch;z-index:9900;font-family:'DM Sans','Outfit',sans-serif;}
      .pcn-ni{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;color:var(--pcn-muted);-webkit-tap-highlight-color:transparent;position:relative;padding-bottom:4px;transition:color .15s;}
      .pcn-ni:hover{color:var(--pcn-text);}
      .pcn-ni.active{color:var(--pcn-green);}
      .pcn-ni.active::after{content:'';position:absolute;top:0;left:18%;right:18%;height:2px;background:var(--pcn-green);border-radius:0 0 3px 3px;box-shadow:0 0 8px rgba(46,204,113,0.55);}
      .pcn-ni-icon{font-size:1.1rem;line-height:1;transition:transform .15s;}
      .pcn-ni.active .pcn-ni-icon{transform:translateY(-1px);}
      .pcn-ni-lbl{font-size:0.5rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;}
      #pcn-fade{position:fixed;inset:0;background:#0D1B2A;opacity:0;pointer-events:none;z-index:9800;transition:opacity 0.17s ease;}
      #pcn-fade.go{opacity:1;pointer-events:all;}
      .nav,.float-btn,.logout-btn-desktop{display:none!important;}
      .mo,.modal-overlay{bottom:var(--pcn-bot,62px)!important;top:0!important;}
    `;
    document.head.appendChild(S);

    /* ── Transition overlay ───────────────────────────────────────────── */
    const fade = document.createElement('div');
    fade.id = 'pcn-fade';
    document.body.appendChild(fade);

    const SPA_TAB = {
      'index.html': 'home',
      'court-main.html': 'courts',
      'findgame.html': 'games',
      'findplayer.html': 'players',
    };

    function goTo(href) {
      if (!href) return;
      const target = href.split('?')[0].split('/').pop();

      if (target === 'tournament.html') {
        window.open(href, '_blank');
        return;
      }

      const tabId = SPA_TAB[target];
      if (tabId !== undefined && window.__pcnSetTab) {
        window.__pcnSetTab(tabId);
        updateActive(tabId);
        return;
      }

      if (target === filename) return;

      if (tabId !== undefined) {
        fade.classList.add('go');
        setTimeout(() => { window.location.href = 'index.html#tab=' + tabId; }, 160);
        return;
      }

      fade.classList.add('go');
      setTimeout(() => { window.location.href = href; }, 160);
    }

    function updateActive(tabId) {
      const tabToNav = { home:'home', courts:'courts', 'court-detail':'courts', games:'games', players:'players', profile:'players', tournament:'tournament' };
      const navId = tabToNav[tabId] || tabId;
      document.querySelectorAll('.pcn-ni').forEach(el => {
        el.classList.toggle('active', el.dataset.id === navId);
      });
    }

    /* ── TOP BAR ──────────────────────────────────────────────────────── */
    const topBar = document.createElement('div');
    topBar.id = 'pcn-top';

    const logoEl = document.createElement('div');
    logoEl.className = 'pcn-logo';
    logoEl.innerHTML = 'Pickle<span>Connect</span>';
    logoEl.addEventListener('click', () => goTo('index.html'));

    const lblEl = document.createElement('div');
    lblEl.className = 'pcn-label';
    lblEl.textContent = meta.label;

    const spacer = document.createElement('div');
    spacer.className = 'pcn-spacer';

    const TAB_LABELS = { home:'Home', courts:'Courts', games:'Games', players:'Players', profile:'Profile', tournament:'Tournament' };
    window.__pcnOnTabChange = (tabId) => {
      lblEl.textContent = TAB_LABELS[tabId] || '';
      updateActive(tabId);
    };

    const iconsWrap = document.createElement('div');
    iconsWrap.className = 'pcn-icons';
    iconsWrap.style.display = 'none';

    // Messages Button
    const msgBtn = document.createElement('div');
    msgBtn.className = 'pcn-icon-btn';
    msgBtn.title = 'Messages';
    msgBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
    const msgBadge = document.createElement('div');
    msgBadge.className = 'pcn-badge';
    msgBadge.style.display = 'none';
    msgBtn.appendChild(msgBadge);
    msgBtn.addEventListener('click', () => {
      if (window.__pcnOpenMessages) { window.__pcnOpenMessages(); return; }
      if (window.__pcnOpenInbox) { window.__pcnOpenInbox(); return; }
      if (filename === 'findplayer.html' || filename === 'index.html') {
        setTimeout(() => { if (window.__pcnOpenInbox) window.__pcnOpenInbox(); }, 300);
        return;
      }
      fade.classList.add('go');
      setTimeout(() => { window.location.href = 'index.html?inbox=1'; }, 160);
    });

    // Notifications Button
    const notifBtn = document.createElement('div');
    notifBtn.className = 'pcn-icon-btn';
    notifBtn.title = 'Notifications';
    notifBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`;
    const notifBadge = document.createElement('div');
    notifBadge.className = 'pcn-badge';
    notifBadge.style.display = 'none';
    notifBtn.appendChild(notifBadge);

    // Notification Panel
    const notifPanel = document.createElement('div');
    notifPanel.id = 'pcn-notif-panel';
    notifPanel.innerHTML = `
      <div class="pcn-panel-hdr">
        <div class="pcn-panel-title">🔔 Notifications</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="pcn-panel-close" id="pcn-notif-settings" style="width:auto;padding:0 10px;font-size:12px;font-weight:700;font-family:'DM Sans',sans-serif;color:#7A9BB5;">⚙ Settings</button>
          <button class="pcn-panel-close" id="pcn-notif-close">✕</button>
        </div>
      </div>
      <div id="pcn-notif-list"><div class="pcn-empty">No notifications yet</div></div>
    `;
    document.body.appendChild(notifPanel);

    let notifOpen = false;
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifOpen = !notifOpen;
      notifPanel.classList.toggle('open', notifOpen);
      notifBtn.style.background = notifOpen ? 'rgba(255,255,255,0.18)' : '';
      if (notifOpen) markNotifsRead();
    });
    document.getElementById('pcn-notif-close').addEventListener('click', () => {
      notifOpen = false; notifPanel.classList.remove('open'); notifBtn.style.background = '';
    });
    document.getElementById('pcn-notif-settings').addEventListener('click', () => {
      notifOpen = false; notifPanel.classList.remove('open'); notifBtn.style.background = '';
      if (typeof window.__pcnOpenNotifSettings === 'function') {
        window.__pcnOpenNotifSettings();
      } else {
        fade.classList.add('go');
        setTimeout(() => { window.location.href = 'notifications.html'; }, 160);
      }
    });
    document.addEventListener('click', (e) => {
      if (notifOpen && !notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
        notifOpen = false;
        notifPanel.classList.remove('open');
        notifBtn.style.background = '';
      }
    });

    const pillWrap = document.createElement('div');
    pillWrap.id = 'pcn-pill';

    topBar.appendChild(logoEl);
    topBar.appendChild(lblEl);
    topBar.appendChild(spacer);
    iconsWrap.appendChild(msgBtn);
    iconsWrap.appendChild(notifBtn);
    topBar.appendChild(iconsWrap);
    topBar.appendChild(pillWrap);
    document.body.insertBefore(topBar, document.body.firstChild);

    /* ── BOTTOM NAV ───────────────────────────────────────────────────── */
    const botNav = document.createElement('div');
    botNav.id = 'pcn-bot';
    NAV_ITEMS.forEach(item => {
      const el = document.createElement('div');
      el.className = 'pcn-ni' + (item.id === meta.id ? ' active' : '');
      el.dataset.id = item.id;
      el.innerHTML = `<div class="pcn-ni-icon">${item.icon}</div><div class="pcn-ni-lbl">${item.label}</div>`;
      el.addEventListener('click', () => goTo(item.href));
      botNav.appendChild(el);
    });
    document.body.appendChild(botNav);

    requestAnimationFrame(() => fade.classList.remove('go'));

    function killOld() {
      document.querySelectorAll('.nav,.float-btn,.logout-btn-desktop').forEach(el => {
        el.style.setProperty('display','none','important');
      });
    }
    killOld();
    setTimeout(killOld, 500);
    setTimeout(killOld, 1500);

    /* ── Notification helpers ─────────────────────────────────────────── */
    let _notifications = [];

    function renderNotifs(notifs) {
      const list = document.getElementById('pcn-notif-list');
      if (!list) return;
      if (!notifs || notifs.length === 0) {
        list.innerHTML = '<div class="pcn-empty">No notifications yet</div>';
        return;
      }
      list.innerHTML = notifs.slice(0, 30).map(n => {
        const icons = { invite:'🏓', message:'💬', accept:'✅', decline:'❌', game:'🎮', player:'👥', general:'🔔' };
        const ico = icons[n.type] || icons.general;
        const bg = n.type === 'invite' ? 'rgba(46,204,113,0.1)' : n.type === 'message' ? 'rgba(91,155,247,0.1)' : 'rgba(255,255,255,0.06)';
        return `<div class="pcn-notif-item${n.read?'':' unread'}" data-id="${n.id}" onclick="window.__pcnHandleNotif && window.__pcnHandleNotif('${n.id}','${n.type}','${n.ref||''}')">
          <div class="pcn-notif-icon" style="background:${bg}">${ico}</div>
          <div class="pcn-notif-body">
            <div class="pcn-notif-text">${n.text}</div>
            <div class="pcn-notif-time">${timeAgoStr(n.timestamp)}</div>
          </div>
          ${!n.read ? '<div class="pcn-notif-dot"></div>' : ''}
        </div>`;
      }).join('');
    }

    function timeAgoStr(t) {
      if (!t) return '';
      const d = Date.now() - t, m = Math.floor(d / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    function markNotifsRead() {
      notifBadge.style.display = 'none';
      if (window._pcnUid && window._pcnDb) {
        const db = window._pcnDb;
        _notifications.filter(n => !n.read).forEach(n => {
          db.collection('notifications').doc(n.id).update({ read: true }).catch(() => {});
        });
      }
    }

    function updateMsgBadge(count) {
      if (count > 0) {
        msgBadge.textContent = count > 9 ? '9+' : count;
        msgBadge.style.display = 'flex';
      } else {
        msgBadge.style.display = 'none';
      }
    }

    function updateNotifBadge(count) {
      if (count > 0) {
        notifBadge.textContent = count > 9 ? '9+' : count;
        notifBadge.style.display = 'flex';
      } else {
        notifBadge.style.display = 'none';
      }
    }

    window.__pcnPlaySound = playSound;
    window.__pcnUpdateMsgBadge = updateMsgBadge;
    window.__pcnUpdateNotifBadge = updateNotifBadge;
    window.__pcnRenderNotifs = renderNotifs;

    /* ── Profile pill builders ────────────────────────────────────────── */
    function guestPill() {
      pillWrap.innerHTML = '';
      iconsWrap.style.display = 'none';
      const btn = document.createElement('button');
      btn.id = 'pcn-signin';
      btn.innerHTML = '🔑 Sign In';
      btn.addEventListener('click', () => {
        if (window.__pcnOpenAuth) { window.__pcnOpenAuth(); return; }
        goTo('index.html');
      });
      pillWrap.appendChild(btn);
    }

    function userPill(displayName, email, photoURL, skill, city) {
      pillWrap.innerHTML = '';
      iconsWrap.style.display = 'flex';

      const btn = document.createElement('button');
      btn.className = 'pcn-pill-btn';

      const av = document.createElement('div');
      av.className = 'pcn-pill-av';
      if (photoURL) {
        const img = document.createElement('img');
        img.src = photoURL; img.referrerPolicy = 'no-referrer';
        av.appendChild(img);
      } else {
        av.textContent = (displayName || email || '?')[0].toUpperCase();
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'pcn-pill-name';
      nameEl.textContent = (displayName || email || '').split(' ')[0];

      const caret = document.createElement('div');
      caret.className = 'pcn-pill-caret';

      btn.appendChild(av); btn.appendChild(nameEl); btn.appendChild(caret);

      const dd = document.createElement('div');
      dd.id = 'pcn-dd';

      const hdr = document.createElement('div');
      hdr.className = 'pcn-dd-hdr';
      hdr.innerHTML = `<div class="pcn-dd-name">${displayName || email || 'Player'}</div><div class="pcn-dd-sub" id="pcn-dd-subtitle">${skill ? skill + (city ? ' · ' + city : '') : (email || '')}</div>`;
      dd.appendChild(hdr);

      pillWrap.appendChild(btn);
      pillWrap.appendChild(dd);

      function closeDD() { dd.classList.remove('open'); btn.classList.remove('open'); }

      const editBtn = document.createElement('button');
      editBtn.className = 'pcn-dd-btn';
      editBtn.innerHTML = '✏️ Edit Profile';
      editBtn.addEventListener('click', () => {
        closeDD();
        if (typeof window.__pcnOpenProfile === 'function') { window.__pcnOpenProfile(); return; }
        const b = document.querySelector('[data-action="edit-profile"]');
        if (b) { b.click(); return; }
        if (window.__pcnSetTab) window.__pcnSetTab('profile');
      });
      dd.appendChild(editBtn);

      const notifSettingsBtn = document.createElement('button');
      notifSettingsBtn.className = 'pcn-dd-btn';
      notifSettingsBtn.innerHTML = '🔔 Notification Settings';
      notifSettingsBtn.addEventListener('click', () => {
        closeDD();
        if (typeof window.__pcnOpenNotifSettings === 'function') {
          window.__pcnOpenNotifSettings();
        } else {
          fade.classList.add('go');
          setTimeout(() => { window.location.href = 'notifications.html'; }, 160);
        }
      });
      dd.appendChild(notifSettingsBtn);

      const soBtn = document.createElement('button');
      soBtn.className = 'pcn-dd-btn red';
      soBtn.innerHTML = '↩ Sign Out';
      soBtn.addEventListener('click', async () => {
        closeDD();
        try { sessionStorage.removeItem('pcn_user'); } catch(e) {}
        try { if (window.firebase?.apps?.length) await window.firebase.auth().signOut(); } catch(e) {}
        goTo('index.html');
      });
      dd.appendChild(soBtn);

      const privBtn = document.createElement('button');
      privBtn.className = 'pcn-dd-btn';
      privBtn.innerHTML = '🔒 Privacy Policy';
      privBtn.addEventListener('click', () => {
        closeDD();
        window.open('https://pickleconnect.live/privacy', '_blank');
      });
      dd.appendChild(privBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'pcn-dd-btn red';
      delBtn.innerHTML = '🗑 Delete Account';
      delBtn.addEventListener('click', () => {
        closeDD();
        if (window.__pcnSetTab) { window.__pcnSetTab('profile'); }
        setTimeout(() => {
          if (typeof window.__pcnOpenDeleteAccount === 'function') {
            window.__pcnOpenDeleteAccount();
          } else {
            alert('Go to Profile → Delete Account to delete your account.');
          }
        }, 300);
      });
      dd.appendChild(delBtn);

      btn.addEventListener('click', e => {
        e.stopPropagation();
        const o = dd.classList.toggle('open');
        btn.classList.toggle('open', o);
      });
      document.addEventListener('click', closeDD);
    }

    /* ── Watch Firebase Auth + listen for notifications/messages ─────── */
    try {
      const cached = sessionStorage.getItem('pcn_user');
      if (cached) {
        const c = JSON.parse(cached);
        userPill(c.displayName || '', c.email || '', c.photoURL || '', c.skill || '', c.city || '');
      } else {
        guestPill();
      }
    } catch(e) { guestPill(); }

    function watchAuth() {
      if (!window.firebase?.apps?.length) { setTimeout(watchAuth, 300); return; }
      try {
        const auth = window.firebase.auth();
        const db   = window.firebase.firestore?.();
        auth.onAuthStateChanged(async user => {
          if (!user) {
            guestPill(); updateMsgBadge(0); updateNotifBadge(0);
            try { sessionStorage.removeItem('pcn_user'); } catch(e) {}
            return;
          }

          window._pcnUid = user.uid;
          window._pcnDb  = db;

          // Pull cache values to see if pill exists to avoid overriding during slow fetches
          let currentSkill = '';
          let currentCity = '';
          try {
            const cached = sessionStorage.getItem('pcn_user');
            if (cached) {
              const parsed = JSON.parse(cached);
              currentSkill = parsed.skill || '';
              currentCity = parsed.city || '';
            }
          } catch(e) {}

          // Render with cache values first if userPill needs restoration
          if (!document.getElementById('pcn-pill').querySelector('.pcn-pill-btn')) {
            userPill(user.displayName||'', user.email||'', user.photoURL||'', currentSkill, currentCity);
          }

          // Asynchronously query additional profile parameters
          if (db) {
            try {
              const snap = await db.collection('profiles').doc(user.uid).get();
              if (snap.exists) {
                const freshSkill = snap.data().skill || '';
                const freshCity = snap.data().city || '';
                
                // Update live text node safely to bypass full redraw flashes
                const subtitleNode = document.getElementById('pcn-dd-subtitle');
                if (subtitleNode) {
                  subtitleNode.textContent = freshSkill ? freshSkill + (freshCity ? ' · ' + freshCity : '') : (user.email || '');
                }
                
                // Update Storage cache values silently
                sessionStorage.setItem('pcn_user', JSON.stringify({
                  displayName: user.displayName||'', email: user.email||'',
                  photoURL: user.photoURL||'', skill: freshSkill, city: freshCity
                }));
              }
            } catch(e) {}
          }

          // ── Listen: unread messages ──
          if (db) {
            db.collection('conversations')
              .where('participants', 'array-contains', user.uid)
              .onSnapshot(snap => {
                let unread = 0;
                snap.docs.forEach(d => {
                  const x = d.data();
                  if (x.lastMessageBy !== user.uid && x.lastTimestamp > (x[`readBy_${user.uid}`] || 0)) unread++;
                });
                const prev = parseInt(msgBadge.textContent) || 0;
                updateMsgBadge(unread);
                if (unread > prev) playSound('message');
                if (window.__pcnOnUnreadMsg) window.__pcnOnUnreadMsg(unread);
              }, () => {});

            // ── Listen: notifications (last 7 days only) ──
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            db.collection('notifications')
              .where('toUid', '==', user.uid)
              .where('timestamp', '>', sevenDaysAgo)
              .orderBy('timestamp', 'desc')
              .limit(30)
              .onSnapshot(snap => {
                _notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderNotifs(_notifications);
                const unread = _notifications.filter(n => !n.read).length;
                const prev = parseInt(notifBadge.textContent) || 0;
                updateNotifBadge(unread);
                if (unread > prev && !notifOpen) playSound('notification');
              }, () => {});
          }
        });
      } catch(e) { guestPill(); }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(watchAuth, 200));
    } else {
      setTimeout(watchAuth, 200);
    }

  } // end init()
})();

```
