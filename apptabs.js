/*
 * PickleConnect iPhone app: bottom tab bar (Weather · Leagues).
 * Runs only inside the app (window.PC_APP, set by the page's head script); does nothing on the website.
 * Each tab is a normal full page (Firebase and native plugins behave best that way in the app's web view).
 * The page scrolls inside #root, so nothing slides under the iPhone status bar.
 */
(function () {
 function init() {
  if (!window.PC_APP) return;
  var inWeather = location.pathname.indexOf('/weather/') >= 0;
  var here = inWeather ? 'weather' : 'leagues';
  var base = inWeather ? '../' : '';
  var url = { weather: base + 'weather/index.html', leagues: base + 'events.html' };
  try { localStorage.setItem('pcTab', here); } catch (e) {}

  var css =
    'html.app,html.app body{height:100%;overflow:hidden;overscroll-behavior:none;}' +
    'html.app body{position:fixed;top:0;left:0;right:0;bottom:0;margin:0;}' +
    'html.app #root{position:absolute;top:0;left:0;right:0;bottom:56px;overflow-y:auto;-webkit-overflow-scrolling:touch;}' +
    '#pc-tabbar{position:fixed;left:0;right:0;bottom:0;height:56px;display:flex;z-index:9000;' +
      'background:rgba(13,27,42,.97);border-top:.5px solid rgba(255,255,255,.14);' +
      "font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;}" +
    '#pc-tabbar button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      'background:none;border:0;padding:6px 0 4px;color:#7A9BB5;font-size:10.5px;font-weight:600;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent;}' +
    '#pc-tabbar svg{width:26px;height:26px;}' +
    '#pc-tabbar button.on{color:#2ECC71;}' +
    '#pc-tabbar button:active svg{transform:scale(.92);}';

  var icons = {
    weather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M9 1.8v1.4M3.6 3.6l1 1M1.8 8h1.4M14.4 3.6l-1 1"/><path d="M8.5 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-.9A3.9 3.9 0 0 0 8.5 20z"/></svg>',
    leagues: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.5a.5.5 0 0 0-.5.5V8a3 3 0 0 0 3 3M17 6h2.5a.5.5 0 0 1 .5.5V8a3 3 0 0 1-3 3"/></svg>'
  };

  function haptic() {
    try { var h = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics; if (h) h.impact({ style: 'LIGHT' }); } catch (e) {}
  }

  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var bar = document.createElement('nav'); bar.id = 'pc-tabbar'; bar.setAttribute('role', 'tablist');
    [['weather', 'Weather'], ['leagues', 'Leagues']].forEach(function (t) {
      var b = document.createElement('button');
      b.className = t[0] === here ? 'on' : '';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t[0] === here);
      b.innerHTML = icons[t[0]] + '<span>' + t[1] + '</span>';
      b.addEventListener('click', function () {
        if (t[0] === here) { // tap the current tab: back to the top, like iOS
          var r = document.getElementById('root'); if (r) r.scrollTo({ top: 0, behavior: 'smooth' }); return;
        }
        haptic();
        try { localStorage.setItem('pcTab', t[0]); } catch (e) {}
        location.replace(url[t[0]]);
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  build();
 }
 // Wait for the page's head script to decide whether we're inside the app
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
