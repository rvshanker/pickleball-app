// functions/tnResults.js
//
// Proxies the ECI state-wise results page into a clean JSON feed for
// your results page. Supports two targets via a single constant:
//
//   MODE = "bihar"   → live test against Bihar Nov-2025 (real data, today)
//   MODE = "tn"      → Tamil Nadu May-2026 (empty until May 4)
//
// Flip MODE to "bihar" now to see everything wired end-to-end with
// real ECI numbers. Flip back to "tn" on May 3 evening or May 4 morning.

const functions = require("firebase-functions");
const cheerio = require("cheerio");
// Node 18+ on Firebase Functions v2 provides `fetch` globally.

// ─────────────────────────────────────────────────────────────
// MODE  — switch this one line
// ─────────────────────────────────────────────────────────────
const MODE = "bihar"; // "bihar" | "tn"

const TARGETS = {
  bihar: {
    prefix: "ResultAcGenNov2025",
    stateCode: "S04",   // Bihar
    label: "Bihar · 2025",
  },
  tn: {
    // Verify on May 3–4. Past examples: "ResultAcGenFeb2025", "PcResultGenJune2024".
    // If ECI uses a different prefix, update here and redeploy.
    prefix: "ResultAcGenMay2026",
    stateCode: "S33",   // Tamil Nadu (verify on counting day — some sources list S22)
    label: "Tamil Nadu · 2026",
  },
};

const TARGET = TARGETS[MODE];
const STATE_URL = `https://results.eci.gov.in/${TARGET.prefix}/statewise${TARGET.stateCode}.htm`;

// ─────────────────────────────────────────────────────────────
// Caching — be nice to ECI
// ─────────────────────────────────────────────────────────────
let cache = { at: 0, data: null };
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// Alliance assignment
// ─────────────────────────────────────────────────────────────
const ALLIANCE_MAP_TN = {
  "DMK":"spa","INC":"spa","VCK":"spa","CPI":"spa","CPI(M)":"spa","CPM":"spa","IUML":"spa","MDMK":"spa","KMDK":"spa",
  "AIADMK":"nda","ADMK":"nda","BJP":"nda","PMK":"nda","AMMK":"nda","DMDK":"nda",
  "TVK":"tvk",
};

const ALLIANCE_MAP_BIHAR = {
  "BJP":"nda","JD(U)":"nda","JDU":"nda","LJPRV":"nda","LJP":"nda","HAM":"nda","HAMS":"nda","RLM":"nda",
  "RJD":"ind","INC":"ind","CPI":"ind","CPI(M)":"ind","CPM":"ind","CPI(ML)":"ind","CPIML":"ind",
  "AIMIM":"left",
};

const ALLIANCES_TN = [
  { id:"spa",    name:"DMK-led SPA",      parties:["DMK","INC","VCK","CPI","CPI(M)"], color:"#C8352F" },
  { id:"nda",    name:"AIADMK+BJP front", parties:["AIADMK","BJP","PMK","AMMK"], color:"#2E7D32" },
  { id:"tvk",    name:"TVK",              parties:["TVK"], color:"#E65100" },
  { id:"others", name:"Others",           parties:["NTK","IND","PMK(R)"], color:"#6B6B6B" },
];

const ALLIANCES_BIHAR = [
  { id:"nda",    name:"NDA",         parties:["BJP","JD(U)","LJPRV","HAMS","RLM"], color:"#E65100" },
  { id:"ind",    name:"INDIA bloc",  parties:["RJD","INC","CPI(ML)","CPI","CPI(M)"], color:"#2E7D32" },
  { id:"left",   name:"AIMIM",       parties:["AIMIM"], color:"#1E3A8A" },
  { id:"others", name:"Others",      parties:["IND"], color:"#6B6B6B" },
];

const ALLIANCE_MAP = MODE === "bihar" ? ALLIANCE_MAP_BIHAR : ALLIANCE_MAP_TN;
const ALLIANCES    = MODE === "bihar" ? ALLIANCES_BIHAR    : ALLIANCES_TN;
const TOTAL_SEATS  = MODE === "bihar" ? 243 : 234;

// ─────────────────────────────────────────────────────────────
// PARSER — defensive; ECI markup varies slightly per election
// ─────────────────────────────────────────────────────────────
function parseStatePage(html) {
  const $ = cheerio.load(html);
  const constituencies = [];

  // Each constituency typically rendered as a card with a heading
  // like "1 - Gummidipoondi" followed by a short candidate table.
  const blocks = $(".cand-box, .const-box, div[id^='ac'], div[id^='Ac']").toArray();

  blocks.forEach((el) => {
    const $el = $(el);
    const header = $el.find("h2, h3, .const-head, .const-name").first().text().trim();
    const m = header.match(/^(\d+)\s*[-–]\s*([^()]+?)(?:\s*\(.*\))?$/);
    if (!m) return;
    const no = parseInt(m[1], 10);
    const name = m[2].trim();

    const cands = $el.find("tr, .cand-row").toArray()
      .map((r) => {
        const cells = $(r).find("td, .cell").toArray().map((c) => $(c).text().trim());
        if (cells.length < 3) return null;
        return {
          name: cells[0] || "",
          party: (cells[1] || "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z()\-]/g, "") || "IND",
          votes: parseInt((cells[2] || "0").replace(/[^0-9]/g, ""), 10) || 0,
          margin: parseInt((cells[3] || "0").replace(/[^0-9]/g, ""), 10) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.votes - a.votes);

    if (cands.length === 0) return;

    const leader   = cands[0];
    const runnerUp = cands[1] || { name:"—", party:"—", votes:0 };
    const statusText = $el.text().toLowerCase();
    const status =
      /declared|won|winner/.test(statusText) ? "declared" :
      leader.votes > 0 ? "leading" : "pending";

    constituencies.push({
      no, name, district: "",
      leader: {
        name: leader.name,
        party: leader.party,
        alliance: ALLIANCE_MAP[leader.party] || "others",
        votes: leader.votes,
        margin: leader.margin || Math.max(0, leader.votes - runnerUp.votes),
      },
      runnerUp: {
        name: runnerUp.name, party: runnerUp.party,
        alliance: ALLIANCE_MAP[runnerUp.party] || "others",
        votes: runnerUp.votes,
      },
      status,
    });
  });

  constituencies.sort((a, b) => a.no - b.no);

  const tallies = Object.fromEntries(ALLIANCES.map((a) => [a.id, { won:0, leading:0 }]));
  constituencies.forEach((c) => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  const alliances = ALLIANCES.map((a) => ({
    ...a, won: tallies[a.id].won, leading: tallies[a.id].leading,
  }));

  const totals = {
    declared: constituencies.filter((c) => c.status === "declared").length,
    leading:  constituencies.filter((c) => c.status === "leading").length,
    pending:  constituencies.filter((c) => c.status === "pending").length,
    total: TOTAL_SEATS,
  };

  return {
    mode: MODE,
    label: TARGET.label,
    updatedAt: new Date().toISOString(),
    totals, alliances, constituencies,
  };
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────
exports.tnResults = functions
  .runWith({ memory: "256MB", timeoutSeconds: 30 })
  .https.onRequest(async (req, res) => {
    const origin = req.headers.origin || "";
    const allowed = [
      "https://pickleconnect.live",
      "https://www.pickleconnect.live",
      "https://skipq.app",
      "https://skipq.vip",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080",
    ];
    if (allowed.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
    else res.set("Access-Control-Allow-Origin", "*"); // loose while testing
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
      });

      if (!r.ok) {
        // Pre-counting: page doesn't exist yet → return empty but valid
        if (r.status === 404) {
          res.json({
            mode: MODE, label: TARGET.label,
            updatedAt: new Date().toISOString(),
            totals: { declared:0, leading:0, pending:TOTAL_SEATS, total:TOTAL_SEATS },
            alliances: ALLIANCES.map((a) => ({ ...a, won:0, leading:0 })),
            constituencies: [],
            _note: `ECI page not yet live at ${STATE_URL}`,
          });
          return;
        }
        throw new Error(`ECI returned ${r.status} for ${STATE_URL}`);
      }

      const html = await r.text();
      const parsed = parseStatePage(html);

      if (parsed.constituencies.length > 0) {
        cache = { at: now, data: parsed };
      } else {
        // Parse found nothing — include diagnostic so we can debug
        parsed._warn = "Parser returned 0 constituencies — selectors may need adjustment";
        parsed._sampleHtml = html.substring(0, 500);
      }

      res.json(parsed);
    } catch (e) {
      console.error("tnResults error:", e);
      res.status(500).json({ error: String(e.message || e), url: STATE_URL });
    }
  });
