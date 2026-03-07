/**
 * PickleConnect — Unified Navigation
 * Drop one line into every page's <body>:
 *   <script src="nav.js"></script>
 *
 * Auto-detects current page, highlights active tab,
 * injects top bar + bottom nav, removes old nav.
 */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────── */
  const PAGES = {
    'index.html':       { id: 'courts',     label: 'Courts',     icon: '🏟' },
    'court.html':       { id: 'courts',     label: 'Courts',     icon: '🏟' },
    'findgame.html':    { id: 'games',      label: 'Games',      icon: '🎮' },
    'findplayer.html':  { id: 'players',    label: 'Players',    icon: '👥' },
    'tournament.html':  { id: 'tournament', label: 'Tournament', icon: '🏆' },
    'pickleconnect-app.html': { id: 'home', label: 'Home',       icon: '🏠' },
  };

  const NAV_ITEMS = [
    { id: 'home',       label: 'Home',       icon: '🏠', href: 'pickleconnect-app.html' },
    { id: 'courts',     label: 'Courts',     icon: '🏟', href: 'index.html' },
    { id: 'games',      label: 'Games',      icon: '🎮', href: 'findgame.html' },
    { id: 'players',    label: 'Players',    icon: '👥', href: 'findplayer.html' },
    { id: 'tournament', label: 'Tournament', icon: '🏆', href: 'tournament.html' },
  ];

  /* ── Detect current page ────────────────────────────────────── */
  const filename = window.location.pathname.split('/').pop() || 'index.html';
  const current  = PAGES[filename]?.id || 'courts';

  /* ── CSS ────────────────────────────────────────────────────── */
  const css = `
    :root {
      --pc-green:   #2ECC71;
      --pc-navy:    #0D1B2A;
      --pc-card:    #1A2B3C;
      --pc-border:  rgba(255,255,255,0.09);
      --pc-muted:   #7A9BB5;
      --pc-text:    #F0F4F8;
      --pc-top-h:   52px;
      --pc-bot-h:   62px;
    }

    /* ── Push page content so it isn't hidden under fixed bars ── */
    body {
      padding-top:    var(--pc-top-h)  !important;
      padding-bottom: var(--pc-bot-h)  !important;
      box-sizing: border-box;
    }

    /* ── TOP BAR ─────────────────────────────────────────────── */
    #pc-topbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--pc-top-h);
      background: rgba(13, 27, 42, 0.97);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-bottom: 1px solid var(--pc-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 9000;
      font-family: 'DM Sans', 'Outfit', sans-serif;
    }
    #pc-topbar .pc-logo {
      font-family: 'Syne', 'Barlow Condensed', 'Outfit', sans-serif;
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--pc-green);
      letter-spacing: -0.02em;
      text-decoration: none;
      cursor: pointer;
    }
    #pc-topbar .pc-logo span { color: var(--pc-text); }
    #pc-topbar .pc-page-label {
      font-family: 'Syne', 'Barlow Condensed', 'Outfit', sans-serif;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--pc-muted);
    }
    #pc-topbar .pc-back-btn {
      background: rgba(255,255,255,0.07);
      border: 1px solid var(--pc-border);
      border-radius: 8px;
      color: var(--pc-muted);
      font-size: 1rem;
      width: 34px; height: 34px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: background .15s, color .15s;
      text-decoration: none;
    }
    #pc-topbar .pc-back-btn:hover { background: rgba(255,255,255,0.12); color: var(--pc-text); }

    /* ── BOTTOM NAV ─────────────────────────────────────────────*/
    #pc-bottomnav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: var(--pc-bot-h);
      background: rgba(13, 27, 42, 0.98);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--pc-border);
      display: flex;
      align-items: stretch;
      z-index: 9000;
      font-family: 'DM Sans', 'Outfit', sans-serif;
    }
    .pc-nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      cursor: pointer;
      text-decoration: none;
      color: var(--pc-muted);
      transition: color .15s;
      -webkit-tap-highlight-color: transparent;
      position: relative;
      padding-bottom: 4px;
    }
    .pc-nav-item:hover { color: var(--pc-text); }
    .pc-nav-item.active { color: var(--pc-green); }
    .pc-nav-item.active::after {
      content: '';
      position: absolute;
      top: 0; left: 20%; right: 20%;
      height: 2px;
      border-radius: 0 0 3px 3px;
      background: var(--pc-green);
      box-shadow: 0 0 8px rgba(46,204,113,0.6);
    }
    .pc-nav-icon {
      font-size: 1.15rem;
      line-height: 1;
      transition: filter .15s, transform .15s;
    }
    .pc-nav-item.active .pc-nav-icon {
      filter: drop-shadow(0 0 5px rgba(46,204,113,0.55));
      transform: translateY(-1px);
    }
    .pc-nav-label {
      font-size: 0.52rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    /* ── Page transition flash ───────────────────────────────── */
    #pc-transition {
      position: fixed;
      inset: 0;
      background: var(--pc-navy);
      opacity: 0;
      pointer-events: none;
      z-index: 8999;
      transition: opacity 0.18s ease;
    }
    #pc-transition.flash { opacity: 1; pointer-events: all; }

    /* ── Hide old navs on all pages ──────────────────────────── */
    /* index.html top nav */
    body > div > .nav:first-child,
    .nav[style*="sticky"],
    .nav[style*="position:sticky"],
    /* court.html back-arrow nav */
    .nav:has(button[onclick*="index.html"]),
    /* float-btn (purple tournament FAB) on index.html */
    .float-btn {
      display: none !important;
    }
  `;

  /* ── Inject CSS ─────────────────────────────────────────────── */
  const styleEl = document.createElement('style');
  styleEl.id = 'pc-nav-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Page transition overlay ────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'pc-transition';
  document.body.appendChild(overlay);

  /* ── Smooth navigation ──────────────────────────────────────── */
  function navigateTo(href) {
    if (!href) return;
    // Same page — do nothing
    const target = href.split('/').pop();
    if (target === filename) return;
    overlay.classList.add('flash');
    setTimeout(() => { window.location.href = href; }, 160);
  }

  /* ── Build top bar ──────────────────────────────────────────── */
  function buildTopBar() {
    const bar = document.createElement('div');
    bar.id = 'pc-topbar';

    // Back button — shown on court.html (detail page) and pickleconnect-app.html
    const showBack = filename === 'court.html';
    if (showBack) {
      const back = document.createElement('a');
      back.className = 'pc-back-btn';
      back.innerHTML = '←';
      back.title = 'Back to Courts';
      back.addEventListener('click', () => navigateTo('index.html'));
      bar.appendChild(back);
    }

    // Logo
    const logo = document.createElement('div');
    logo.className = 'pc-logo';
    logo.innerHTML = 'Pickle<span>Connect</span>';
    logo.addEventListener('click', () => navigateTo('pickleconnect-app.html'));
    bar.appendChild(logo);

    // Current page label (right side)
    const label = document.createElement('div');
    label.className = 'pc-page-label';
    label.textContent = PAGES[filename]?.label || '';
    bar.appendChild(label);

    return bar;
  }

  /* ── Build bottom nav ───────────────────────────────────────── */
  function buildBottomNav() {
    const nav = document.createElement('div');
    nav.id = 'pc-bottomnav';

    NAV_ITEMS.forEach(item => {
      const a = document.createElement('a');
      a.className = 'pc-nav-item' + (item.id === current ? ' active' : '');
      a.innerHTML = `
        <div class="pc-nav-icon">${item.icon}</div>
        <div class="pc-nav-label">${item.label}</div>
      `;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(item.href);
      });
      nav.appendChild(a);
    });

    return nav;
  }

  /* ── Remove old nav elements ────────────────────────────────── */
  function removeOldNav() {
    // Wait for React to render, then sweep
    setTimeout(() => {
      // Generic: any .nav div that is a direct child of body or first-level container
      document.querySelectorAll('.nav').forEach(el => {
        // Only remove the top-level page navs, not navs inside modals/components
        const depth = getDepth(el);
        if (depth <= 4) el.style.display = 'none';
      });
      // Float button (purple tournament FAB on index.html)
      document.querySelectorAll('.float-btn').forEach(el => el.style.display = 'none');
    }, 300);
  }

  function getDepth(el) {
    let d = 0, n = el;
    while (n.parentElement) { d++; n = n.parentElement; }
    return d;
  }

  /* ── Init ───────────────────────────────────────────────────── */
  function init() {
    document.body.insertBefore(buildTopBar(), document.body.firstChild);
    document.body.appendChild(buildBottomNav());
    removeOldNav();

    // Fade in after navigation
    requestAnimationFrame(() => {
      overlay.classList.remove('flash');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
