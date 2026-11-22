// Runs in the GitHub Action before deploy (never edit the deployed copy by hand).
// Pages keep their JSX in <script type="text/babel"> so they stay easy to edit on GitHub.
// At deploy time this converts that JSX to plain JavaScript and drops the 3 MB in-browser
// Babel compiler, so the pages load much faster. If a page fails to convert, it is left
// exactly as it is and still works the old way.
const fs = require('fs');
const Babel = require('@babel/standalone');

const PAGES = ['events.html', 'weather/index.html', 'weather/beta.html'];
const BABEL_TAG = /[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>\r?\n?/;
const JSX_BLOCK = /<script type="text\/babel">([\s\S]*?)<\/script>/g;

let failed = 0;
for (const page of PAGES) {
  if (!fs.existsSync(page)) { console.log(`skip ${page} (not found)`); continue; }
  const html = fs.readFileSync(page, 'utf8');
  try {
    let count = 0;
    let out = html.replace(JSX_BLOCK, (_, code) => {
      count++;
      const js = Babel.transform(code, { presets: [['react', { runtime: 'classic' }]], compact: false, comments: false }).code;
      return '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
    });
    if (!count) { console.log(`skip ${page} (no JSX)`); continue; }
    out = out.replace(BABEL_TAG, '');
    fs.writeFileSync(page, out);
    console.log(`ok   ${page}: ${count} block(s), ${(html.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${page}: ${e.message} (left unchanged, still works with in-browser Babel)`);
  }
}
if (failed) console.log(`${failed} page(s) left unchanged`);
