/**
 * PickleConnect — Unified Navigation v3
 * Add before </body> in every page:  <script src="nav.js"></script>
 * New in v3: Messages icon, Notifications icon (with sound), cleaner header layout
 */
(function () {
  'use strict';

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
    { id: 'tournament', label: 'Tournament', icon: '🏆', href: 'tournament.html' },
  ];

  const filename = window.location.pathname.split('/').pop() || 'index.html';
  const meta     = PAGE_META[filename] || { id: 'home', label: '' };

  /* ── Sound Engine (Web Audio API) ────────────────────────────────── */
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    // Resume if suspended (Chrome blocks audio until user gesture)
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  }

  // Unlock AudioContext on first user interaction
  function _unlockAudio() {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }
  document.addEventListener('click',      _unlockAudio, { once: false, passive: true });
  document.addEventListener('touchstart', _unlockAudio, { once: false, passive: true });
  document.addEventListener('keydown',    _unlockAudio, { once: false, passive: true });

  function playSound(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      if (type === 'message') {
        // Soft two-tone chime
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
        // Bright single ping
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

    /* TOP BAR */
    #pcn-top{position:fixed;top:0;left:0;right:0;height:var(--pcn-top);background:rgba(13,27,42,0.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid var(--pcn-border);display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 14px;z-index:9900;box-sizing:border-box;font-family:'DM Sans','Outfit',sans-serif;gap:8px;}

    /* LOGO */
    .pcn-logo{font-family:'Syne','Barlow Condensed','Outfit',sans-serif;font-size:1rem;font-weight:800;color:var(--pcn-green);letter-spacing:-0.02em;cursor:pointer;white-space:nowrap;flex-shrink:0;line-height:1;}
    .pcn-logo span{color:var(--pcn-text);}

    /* PAGE LABEL */
    .pcn-label{display:none!important;}

    /* SPACER */
    .pcn-spacer{flex:1;}

    /* ICON BUTTONS ROW */
    .pcn-icons{display:flex;align-items:center;gap:4px;flex-shrink:0;}
    .pcn-icon-btn{position:relative;width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;flex-shrink:0;}
    .pcn-icon-btn:hover{background:rgba(255,255,255,0.13);}
    .pcn-icon-btn svg{width:17px;height:17px;stroke:var(--pcn-text);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
    .pcn-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;background:#ef4444;color:white;border-radius:8px;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 3px;border:1.5px solid rgba(13,27,42,0.97);animation:pcnPop .2s ease;}
    @keyframes pcnPop{from{transform:scale(0)}to{transform:scale(1)}}

    /* PILL BUTTON */
    #pcn-pill{position:relative;flex-shrink:0;}
    .pcn-pill-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:4px 9px 4px 4px;cursor:pointer;font-family:'DM Sans','Outfit',sans-serif;transition:background .15s;}
    .pcn-pill-btn:hover{background:rgba(255,255,255,0.13);}
    .pcn-pill-av{width:27px;height:27px;border-radius:50%;background:linear-gradient(135deg,#059669,#2ECC71);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;overflow:hidden;flex-shrink:0;}
    .pcn-pill-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
    .pcn-pill-name{display:none;}
    .pcn-pill-caret{display:none;}
    .pcn-pill-btn.open .pcn-pill-caret{transform:rotate(180deg);}

    /* PILL DROPDOWN */
    #pcn-dd{display:none;position:absolute;top:calc(100% + 8px);right:0;background:white;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.18);border:1px solid #e8f0fe;min-width:170px;overflow:hidden;z-index:9999;animation:pcnDrop .16s ease;}
    #pcn-dd.open{display:block;}
    @keyframes pcnDrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
    .pcn-dd-hdr{padding:11px 14px 9px;border-bottom:1px solid #f1f5f9;}
    .pcn-dd-name{font-size:13px;font-weight:700;color:#0f172a;}
    .pcn-dd-sub{font-size:11px;color:#94a3b8;margin-top:1px;}
    .pcn-dd-btn{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:10px 14px;font-family:'DM Sans','Outfit',sans-serif;font-size:13px;font-weight:600;cursor:pointer;text-align:left;transition:background .12s;}
    .pcn-dd-btn:hover{background:#f8fafc;}
    .pcn-dd-btn.red{color:#dc2626;}
    .pcn-dd-btn.red:hover{background:#fef2f2;}

    /* NOTIFICATION PANEL */
    #pcn-notif-panel{display:none;position:fixed;top:var(--pcn-top);right:0;width:min(340px,100vw);background:white;box-shadow:-4px 0 24px rgba(0,0,0,.15);z-index:9990;overflow:hidden;animation:pcnSlideR .2s ease;max-height:calc(100vh - var(--pcn-top) - var(--pcn-bot));overflow-y:auto;}
    #pcn-notif-panel.open{display:block;}
    @keyframes pcnSlideR{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .pcn-panel-hdr{padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1;}
    .pcn-panel-title{font-size:15px;font-weight:800;color:#0f172a;}
    .pcn-panel-close{background:#f1f5f9;border:none;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:13px;}
    .pcn-notif-item{padding:12px 16px;border-bottom:1px solid #f8fafc;display:flex;gap:10px;align-items:flex-start;cursor:pointer;}
    .pcn-notif-item:hover{background:#f8fafc;}
    .pcn-notif-item.unread{background:#f0fdf4;}
    .pcn-notif-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
    .pcn-notif-body{flex:1;min-width:0;}
    .pcn-notif-text{font-size:13px;font-weight:600;color:#0f172a;line-height:1.4;}
    .pcn-notif-time{font-size:11px;color:#94a3b8;margin-top:2px;}
    .pcn-notif-dot{width:8px;height:8px;border-radius:50%;background:#2ECC71;flex-shrink:0;margin-top:4px;}
    .pcn-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:13px;}

    /* SIGN-IN BUTTON (guest) */
    #pcn-signin{display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#2ECC71,#27AE60);border:none;border-radius:18px;padding:6px 12px;font-family:'DM Sans','Outfit',sans-serif;font-size:0.75rem;font-weight:700;color:white;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 10px rgba(46,204,113,0.35);transition:opacity .15s;}
    #pcn-signin:hover{opacity:.9;}

    /* BOTTOM NAV */
    #pcn-bot{position:fixed;bottom:0;left:0;right:0;height:var(--pcn-bot);background:rgba(13,27,42,0.98);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--pcn-border);display:flex;align-items:stretch;z-index:9900;font-family:'DM Sans','Outfit',sans-serif;}
    .pcn-ni{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;color:var(--pcn-muted);-webkit-tap-highlight-color:transparent;position:relative;padding-bottom:4px;transition:color .15s;}
    .pcn-ni:hover{color:var(--pcn-text);}
    .pcn-ni.active{color:var(--pcn-green);}
    .pcn-ni.active::after{content:'';position:absolute;top:0;left:18%;right:18%;height:2px;background:var(--pcn-green);border-radius:0 0 3px 3px;box-shadow:0 0 8px rgba(46,204,113,0.55);}
    .pcn-ni-icon{font-size:1.1rem;line-height:1;transition:transform .15s;}
    .pcn-ni.active .pcn-ni-icon{transform:translateY(-1px);}
    .pcn-ni-lbl{font-size:0.5rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;}

    /* FADE */
    #pcn-fade{position:fixed;inset:0;background:#0D1B2A;opacity:0;pointer-events:none;z-index:9800;transition:opacity 0.17s ease;}
    #pcn-fade.go{opacity:1;pointer-events:all;}

    /* HIDE OLD NAV ELEMENTS */
    .nav,.float-btn,.logout-btn-desktop{display:none!important;}

    /* MODAL SHEET FIX — ensure bottom-sheet modals sit fully above the bottom nav */
    .mo,.modal-overlay{bottom:var(--pcn-bot,62px)!important;top:0!important;}
  `;
  document.head.appendChild(S);

  /* ── Transition overlay ───────────────────────────────────────────── */
  const fade = document.createElement('div');
  fade.id = 'pcn-fade';
  document.body.appendChild(fade);

  // All internal pages route through the SPA — no more full page reloads
  const SPA_TAB = {
    'index.html': 'home',
    'court-main.html': 'courts',
    'findgame.html': 'games',
    'findplayer.html': 'players',
  };

  function goTo(href) {
    if (!href) return;
    const target = href.split('?')[0].split('/').pop();

    // Tournament opens externally (standalone tool)
    if (target === 'tournament.html') {
      window.open(href, '_blank');
      return;
    }

    // All internal pages route through SPA tab switching
    const tabId = SPA_TAB[target];
    if (tabId !== undefined && window.__pcnSetTab) {
      window.__pcnSetTab(tabId);
      updateActive(tabId);
      return;
    }

    // Same page = do nothing
    if (target === filename) return;

    // Fallback: full navigation (shouldn't happen in normal SPA flow)
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

  // Logo
  const logoEl = document.createElement('div');
  logoEl.className = 'pcn-logo';
  logoEl.innerHTML = 'Pickle<span>Connect</span>';
  logoEl.addEventListener('click', () => goTo('index.html'));

  // Page label
  const lblEl = document.createElement('div');
  lblEl.className = 'pcn-label';
  lblEl.textContent = meta.label;

  // Spacer
  const spacer = document.createElement('div');
  spacer.className = 'pcn-spacer';

  const TAB_LABELS = { home:'Home', courts:'Courts', games:'Games', players:'Players', profile:'Profile', tournament:'Tournament' };
  window.__pcnOnTabChange = (tabId) => {
    lblEl.textContent = TAB_LABELS[tabId] || '';
    updateActive(tabId);
  };

  // Icon buttons container
  const iconsWrap = document.createElement('div');
  iconsWrap.className = 'pcn-icons';

  // ── Messages icon button ──
  const msgBtn = document.createElement('div');
  msgBtn.className = 'pcn-icon-btn';
  msgBtn.title = 'Messages';
  msgBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
  const msgBadge = document.createElement('div');
  msgBadge.className = 'pcn-badge';
  msgBadge.style.display = 'none';
  msgBtn.appendChild(msgBadge);
  msgBtn.addEventListener('click', () => {
    // Try page-registered handlers first
    if (window.__pcnOpenMessages) { window.__pcnOpenMessages(); return; }
    if (window.__pcnOpenInbox) { window.__pcnOpenInbox(); return; }
    // If on current page, React may not have registered yet — retry after mount
    if (filename === 'findplayer.html' || filename === 'index.html') {
      setTimeout(() => { if (window.__pcnOpenInbox) window.__pcnOpenInbox(); }, 300);
      return;
    }
    // Navigate to index.html with ?inbox=1 so it auto-opens the inbox
    fade.classList.add('go');
    setTimeout(() => { window.location.href = 'index.html?inbox=1'; }, 160);
  });

  // ── Notifications icon button ──
  const notifBtn = document.createElement('div');
  notifBtn.className = 'pcn-icon-btn';
  notifBtn.title = 'Notifications';
  notifBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`;
  const notifBadge = document.createElement('div');
  notifBadge.className = 'pcn-badge';
  notifBadge.style.display = 'none';
  notifBtn.appendChild(notifBadge);

  // ── Notification Panel ──
  const notifPanel = document.createElement('div');
  notifPanel.id = 'pcn-notif-panel';
  notifPanel.innerHTML = `
    <div class="pcn-panel-hdr">
      <div class="pcn-panel-title">🔔 Notifications</div>
      <button class="pcn-panel-close" id="pcn-notif-close">✕</button>
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
    notifOpen = false;
    notifPanel.classList.remove('open');
    notifBtn.style.background = '';
  });
  document.addEventListener('click', (e) => {
    if (notifOpen && !notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
      notifOpen = false;
      notifPanel.classList.remove('open');
      notifBtn.style.background = '';
    }
  });

  // Profile pill wrapper
  const pillWrap = document.createElement('div');
  pillWrap.id = 'pcn-pill';

  // Assemble top bar
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

  /* ── Fade in on arrival ───────────────────────────────────────────── */
  requestAnimationFrame(() => fade.classList.remove('go'));

  /* ── Suppress old navs ────────────────────────────────────────────── */
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
  let _lastNotifCount = 0;

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
      const bg = n.type === 'invite' ? '#ecfdf5' : n.type === 'message' ? '#eff6ff' : '#f9fafb';
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
    // Mark in Firestore if user logged in
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

  // Expose globals
  window.__pcnPlaySound = playSound;
  window.__pcnUpdateMsgBadge = updateMsgBadge;
  window.__pcnUpdateNotifBadge = updateNotifBadge;
  window.__pcnRenderNotifs = renderNotifs;

  /* ── Profile pill builders ────────────────────────────────────────── */
  function guestPill() {
    pillWrap.innerHTML = '';
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
    hdr.innerHTML = `<div class="pcn-dd-name">${displayName || email || 'Player'}</div><div class="pcn-dd-sub">${skill ? skill + (city ? ' · ' + city : '') : (email || '')}</div>`;
    dd.appendChild(hdr);

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
      // If on index.html (React app), trigger via tab navigation
      if (window.__pcnSetTab) { window.__pcnSetTab('profile'); }
      // Small delay so the tab renders, then programmatically show delete confirm
      setTimeout(() => {
        if (typeof window.__pcnOpenDeleteAccount === 'function') {
          window.__pcnOpenDeleteAccount();
        } else {
          // Fallback: navigate to profile tab and let user tap from there
          alert('Go to Profile → Delete Account to delete your account.');
        }
      }, 300);
    });
    dd.appendChild(delBtn);

    pillWrap.appendChild(btn);
    pillWrap.appendChild(dd);

    function closeDD() { dd.classList.remove('open'); btn.classList.remove('open'); }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const o = dd.classList.toggle('open');
      btn.classList.toggle('open', o);
    });
    document.addEventListener('click', closeDD);
  }

  /* ── Watch Firebase Auth + listen for notifications/messages ─────── */

  // FLICKER FIX: Restore cached user pill immediately (before Firebase loads)
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

        let skill = '', city = '';
        if (db) {
          try {
            const snap = await db.collection('profiles').doc(user.uid).get();
            if (snap.exists) { skill = snap.data().skill||''; city = snap.data().city||''; }
          } catch(e) {}
        }
        userPill(user.displayName||'', user.email||'', user.photoURL||'', skill, city);

        // Cache for next page load to avoid flicker
        try {
          sessionStorage.setItem('pcn_user', JSON.stringify({
            displayName: user.displayName||'', email: user.email||'',
            photoURL: user.photoURL||'', skill, city
          }));
        } catch(e) {}

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

          // ── Listen: notifications ──
          db.collection('notifications')
            .where('toUid', '==', user.uid)
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

})();
