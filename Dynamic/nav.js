/**
 * PickleConnect — Unified Navigation v2
 * Add before </body> in every page:  <script src="nav.js"></script>
 */
(function () {
  'use strict';

  const PAGE_META = {
    'pickleconnect-app.html': { id: 'home',       label: 'Home'       },
    'index.html':             { id: 'home',       label: 'Home'       },
    'court-main.html':        { id: 'courts',     label: 'Court'      },
    'court.html':             { id: 'courts',     label: 'Court'      },
    'findgame.html':          { id: 'games',      label: 'Games'      },
    'findplayer.html':        { id: 'players',    label: 'Players'    },
    'tournament.html':        { id: 'tournament', label: 'Tournament' },
  };

  const NAV_ITEMS = [
    { id: 'home',       label: 'Home',       icon: '🏠', href: 'index.html'      },
    { id: 'courts',     label: 'Courts',     icon: '🏟', href: 'index.html'      },
    { id: 'games',      label: 'Games',      icon: '🎮', href: 'findgame.html'   },
    { id: 'players',    label: 'Players',    icon: '👥', href: 'findplayer.html' },
    { id: 'tournament', label: 'Tournament', icon: '🏆', href: 'tournament.html' },
  ];

  const filename = window.location.pathname.split('/').pop() || 'index.html';
  const meta     = PAGE_META[filename] || { id: 'courts', label: '' };

  /* ── CSS ──────────────────────────────────────────────────────────── */
  const S = document.createElement('style');
  S.id = 'pcn-css';
  S.textContent = `
    :root{--pcn-green:#2ECC71;--pcn-navy:#0D1B2A;--pcn-border:rgba(255,255,255,0.09);--pcn-muted:#7A9BB5;--pcn-text:#F0F4F8;--pcn-top:52px;--pcn-bot:62px;}
    body{padding-top:var(--pcn-top)!important;padding-bottom:var(--pcn-bot)!important;}

    /* TOP BAR */
    #pcn-top{position:fixed;top:0;left:0;right:0;height:var(--pcn-top);background:rgba(13,27,42,0.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid var(--pcn-border);display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 16px;z-index:9900;box-sizing:border-box;font-family:'DM Sans','Outfit',sans-serif;}
    .pcn-logo{font-family:'Syne','Barlow Condensed','Outfit',sans-serif;font-size:1.08rem;font-weight:800;color:var(--pcn-green);letter-spacing:-0.02em;cursor:pointer;white-space:nowrap;flex-shrink:0;}
    .pcn-logo span{color:var(--pcn-text);}
    .pcn-label{font-family:'Syne','Barlow Condensed','Outfit',sans-serif;font-size:0.72rem;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:var(--pcn-muted);flex:1;text-align:center;}

    /* PILL BUTTON */
    #pcn-pill{position:relative;flex-shrink:0;}
    .pcn-pill-btn{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:4px 10px 4px 5px;cursor:pointer;font-family:'DM Sans','Outfit',sans-serif;transition:background .15s;}
    .pcn-pill-btn:hover{background:rgba(255,255,255,0.13);}
    .pcn-pill-av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#059669,#2ECC71);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:white;overflow:hidden;flex-shrink:0;}
    .pcn-pill-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
    .pcn-pill-name{font-size:0.82rem;font-weight:700;color:var(--pcn-text);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .pcn-pill-caret{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--pcn-muted);transition:transform .2s;}
    .pcn-pill-btn.open .pcn-pill-caret{transform:rotate(180deg);}

    /* DROPDOWN */
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

    /* SIGN-IN BUTTON (guest) */
    #pcn-signin{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#2ECC71,#27AE60);border:none;border-radius:18px;padding:6px 13px;font-family:'DM Sans','Outfit',sans-serif;font-size:0.78rem;font-weight:700;color:white;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 10px rgba(46,204,113,0.35);transition:opacity .15s;}
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
  `;
  document.head.appendChild(S);

  /* ── Transition overlay ───────────────────────────────────────────── */
  const fade = document.createElement('div');
  fade.id = 'pcn-fade';
  document.body.appendChild(fade);

  // Map each page to its SPA tab on index.html (avoids full reload)
  const SPA_TAB = {
    'index.html':        'home',
    'findgame.html':     'games',
    'findplayer.html':   'players',
  };

  function goTo(href) {
    if (!href) return;
    const target = href.split('?')[0].split('/').pop();
    // If we're already on index.html and target has a SPA tab, switch tab instantly
    if (filename === 'index.html' && SPA_TAB[target] !== undefined) {
      const tab = SPA_TAB[target];
      if (window.__pcnSetTab) { window.__pcnSetTab(tab); updateActive(tab); return; }
    }
    // If target is index.html and we're on a sub-page, navigate there with tab param
    if (target === 'index.html' && filename !== 'index.html') {
      fade.classList.add('go');
      setTimeout(() => { window.location.href = 'index.html'; }, 160);
      return;
    }
    // If target is a page that the SPA handles, go to index.html with ?tab=
    if (SPA_TAB[target] !== undefined && filename !== 'index.html') {
      const tab = SPA_TAB[target];
      fade.classList.add('go');
      setTimeout(() => { window.location.href = `index.html?tab=${tab}`; }, 160);
      return;
    }
    if (target === filename) return;
    fade.classList.add('go');
    setTimeout(() => { window.location.href = href; }, 160);
  }

  function updateActive(tabId) {
    // Map SPA tab names back to nav item IDs
    const tabToNav = { home:'home', courts:'courts', games:'games', players:'players', profile:'players' };
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

  // Expose for SPA to call when tab changes
  const TAB_LABELS = { home:'Home', courts:'Courts', games:'Games', players:'Players', profile:'Profile', tournament:'Tournament' };
  window.__pcnOnTabChange = (tabId) => {
    lblEl.textContent = TAB_LABELS[tabId] || '';
    updateActive(tabId);
  };

  const pillWrap = document.createElement('div');
  pillWrap.id = 'pcn-pill';

  topBar.appendChild(logoEl);
  topBar.appendChild(lblEl);
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

  /* ── Profile pill builders ────────────────────────────────────────── */
  function guestPill() {
    pillWrap.innerHTML = '';
    const btn = document.createElement('button');
    btn.id = 'pcn-signin';
    btn.textContent = '🔑 Sign In';
    btn.addEventListener('click', () => goTo('findplayer.html'));
    pillWrap.appendChild(btn);
  }

  function userPill(displayName, email, photoURL, skill, city) {
    pillWrap.innerHTML = '';

    // Pill button
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

    // Dropdown
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
      // Try to trigger the page's own profile-edit mechanism
      // findplayer.html exposes setShowProfile on window, findgame has onSignOut only
      if (typeof window.__pcnOpenProfile === 'function') {
        window.__pcnOpenProfile();
      } else {
        // fallback: click any edit-profile button the page may have rendered
        const btn = document.querySelector('[data-action="edit-profile"]');
        if (btn) btn.click();
      }
    });
    dd.appendChild(editBtn);

    const soBtn = document.createElement('button');
    soBtn.className = 'pcn-dd-btn red';
    soBtn.innerHTML = '↩ Sign Out';
    soBtn.addEventListener('click', async () => {
      closeDD();
      try { if (window.firebase?.apps?.length) await window.firebase.auth().signOut(); } catch(e){}
      goTo('index.html');
    });
    dd.appendChild(soBtn);

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

  /* ── Watch Firebase Auth ──────────────────────────────────────────── */
  guestPill(); // default while loading

  function watchAuth() {
    if (!window.firebase?.apps?.length) { setTimeout(watchAuth, 300); return; }
    try {
      const auth = window.firebase.auth();
      const db   = window.firebase.firestore?.();
      auth.onAuthStateChanged(async user => {
        if (!user) { guestPill(); return; }
        let skill = '', city = '';
        if (db) {
          try {
            const snap = await db.collection('profiles').doc(user.uid).get();
            if (snap.exists) { skill = snap.data().skill||''; city = snap.data().city||''; }
          } catch(e) {}
        }
        userPill(user.displayName||'', user.email||'', user.photoURL||'', skill, city);
      });
    } catch(e) { guestPill(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watchAuth, 200));
  } else {
    setTimeout(watchAuth, 200);
  }

})();
