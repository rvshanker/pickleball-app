// functions/tnResults.js
//
// Firebase Cloud Function — proxies & parses the Tamil Nadu state-wise
// results page from results.eci.gov.in into the JSON shape the
// tn-results.html page expects.
//
// Add to functions/index.js:
//   exports.tnResults = require("./tnResults").tnResults;
//
// Install deps once:
//   cd functions && npm i cheerio node-fetch@2
//
// Deploy:
//   firebase deploy --only functions:tnResults
//
// The function URL becomes:
//   https://us-central1-<your-project>.cloudfunctions.net/tnResults
// Put that into PROXY_URL at the top of tn-results.html.

const functions = require("firebase-functions");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// ─────────────────────────────────────────────────────────────
// CONFIG — verify on counting-day morning (May 4, 2026)
// ─────────────────────────────────────────────────────────────

// ECI creates a new path prefix for each election cycle.
// On May 3 evening or May 4 ~7:30 AM IST, visit results.eci.gov.in,
// click through to Tamil Nadu, and copy the exact prefix.
// Past examples: "ResultAcGenFeb2025", "PcResultGenJune2024"
const ECI_PREFIX = process.env.ECI_PREFIX || "ResultAcGenMay2026";

// Tamil Nadu state code in ECI's system. Don't change.
const TN_CODE = "S33";

const STATE_URL = `https://results.eci.gov.in/${ECI_PREFIX}/statewiseS33.htm`;

// In-memory cache (per function instance). 60s is polite to ECI
// and cheap on Firebase invocations.
let cache = { at: 0, data: null };
const CACHE_MS = 60_000;

// Alliance assignment — edit if party lineups shift before polling.
const ALLIANCE_MAP = {
  // DMK-led Secular Progressive Alliance
  "DMK":"spa","INC":"spa","VCK":"spa","CPI":"spa","CPI(M)":"spa",
  "CPM":"spa","MDMK":"spa","IUML":"spa","KMDK":"spa",
  // AIADMK-led front
  "AIADMK":"nda","ADMK":"nda","BJP":"nda","PMK":"nda","AMMK":"nda","DMDK":"nda",
  // TVK (Vijay)
  "TVK":"tvk",
  // Everything else → others
};

const ALLIANCES = [
  { id:"spa",    name:"DMK-led SPA",      parties:["DMK","INC","VCK","CPI","CPI(M)"], color:"#C8352F" },
  { id:"nda",    name:"AIADMK+BJP front", parties:["AIADMK","BJP","PMK","AMMK","DMDK"], color:"#2E7D32" },
  { id:"tvk",    name:"TVK (Vijay)",      parties:["TVK"], color:"#E65100" },
  { id:"others", name:"Others / Indep.",  parties:["PMK(R)","AIPMMK","NTK","IND"], color:"#6B6B6B" },
];

// ─────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────

function parseStatePage(html) {
  const $ = cheerio.load(html);

  // ECI's state-wise pages historically render a table per constituency,
  // with headers like "1 - Gummidipoondi" and rows for each candidate.
  // Structure shifts election-to-election; verify & tweak selectors
  // on May 4 morning once the real page is live.

  const constituencies = [];

  // Primary selector — each constituency block is typically a div with
  // class "cand-box" or similar. Try a few known patterns.
  const blocks = $(".cand-box, .const-box, div[id^='ac']").toArray();

  blocks.forEach((el) => {
    const $el = $(el);
    const header = $el.find("h2, h3, .const-head").first().text().trim();
    // e.g. "1 - Gummidipoondi (GEN)"
    const m = header.match(/^(\d+)\s*[-–]\s*([^()]+?)(?:\s*\(.*\))?$/);
    if (!m) return;
    const no = parseInt(m[1], 10);
    const name = m[2].trim();

    // Candidate rows — typically ordered by votes desc.
    const cands = $el.find("tr, .cand-row").toArray()
      .map((r) => {
        const $r = $(r);
        const cells = $r.find("td, .cell").toArray().map((c) => $(c).text().trim());
        if (cells.length < 3) return null;
        // Common pattern: [candidate name, party, votes, margin?]
        return {
          name: cells[0] || "",
          party: (cells[1] || "").toUpperCase().replace(/[^A-Z()]/g, "") || "IND",
          votes: parseInt((cells[2] || "0").replace(/[^0-9]/g, ""), 10) || 0,
          margin: parseInt((cells[3] || "0").replace(/[^0-9]/g, ""), 10) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.votes - a.votes);

    if (cands.length === 0) return;

    const leader = cands[0];
    const runnerUp = cands[1] || { name:"—", party:"—", votes:0 };
    const status =
      /\bdeclared\b|\bwon\b/i.test($el.text()) ? "declared" :
      leader.votes > 0 ? "leading" : "pending";

    constituencies.push({
      no,
      name,
      district: "",
      leader: {
        name: leader.name,
        party: leader.party,
        alliance: ALLIANCE_MAP[leader.party] || "others",
        votes: leader.votes,
        margin: leader.margin || Math.max(0, leader.votes - runnerUp.votes),
      },
      runnerUp: {
        name: runnerUp.name,
        party: runnerUp.party,
        alliance: ALLIANCE_MAP[runnerUp.party] || "others",
        votes: runnerUp.votes,
      },
      status,
    });
  });

  // Sort by constituency number
  constituencies.sort((a, b) => a.no - b.no);

  // Alliance tallies
  const tallies = Object.fromEntries(ALLIANCES.map((a) => [a.id, { won:0, leading:0 }]));
  constituencies.forEach((c) => {
    const a = c.leader.alliance;
    if (!tallies[a]) return;
    if (c.status === "declared") tallies[a].won++;
    else if (c.status === "leading") tallies[a].leading++;
  });

  const alliances = ALLIANCES.map((a) => ({
    ...a,
    won: tallies[a.id].won,
    leading: tallies[a.id].leading,
  }));

  const totals = {
    declared: constituencies.filter((c) => c.status === "declared").length,
    leading:  constituencies.filter((c) => c.status === "leading").length,
    pending:  constituencies.filter((c) => c.status === "pending").length,
    total: 234,
  };

  return {
    updatedAt: new Date().toISOString(),
    totals,
    alliances,
    constituencies,
  };
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────

exports.tnResults = functions
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    // CORS — allow both sites in case you host on skipq.app later.
    const origin = req.headers.origin || "";
    const allowed = [
      "https://pickleconnect.live",
      "https://skipq.app",
      "https://skipq.vip",
      "http://localhost:3000",
      "http://localhost:5173",
    ];
    if (allowed.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const now = Date.now();
      if (cache.data && now - cache.at < CACHE_MS) {
        res.json({ ...cache.data, _cached: true });
        return;
      }

      const r = await fetch(STATE_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (PickleConnect TN Tracker)" },
        timeout: 15_000,
      });

      if (!r.ok) {
        // Before counting day, the URL doesn't exist yet — return an
        // empty-but-valid payload so the page shows the countdown cleanly.
        if (r.status === 404) {
          res.json({
            updatedAt: new Date().toISOString(),
            totals: { declared:0, leading:0, pending:234, total:234 },
            alliances: ALLIANCES.map((a) => ({ ...a, won:0, leading:0 })),
            constituencies: [],
            _note: "ECI page not yet live — showing empty state.",
          });
          return;
        }
        throw new Error(`ECI returned ${r.status}`);
      }

      const html = await r.text();
      const parsed = parseStatePage(html);

      // Only cache if parsing found something useful; otherwise a bad
      // parse would get locked in for 60s.
      if (parsed.constituencies.length > 0) {
        cache = { at: now, data: parsed };
      }

      res.json(parsed);
    } catch (e) {
      console.error("tnResults error:", e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
