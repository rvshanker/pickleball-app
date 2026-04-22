// functions/tnResults.js
//
// Proxies the ECI state-wise results pages into a clean JSON feed.
// ECI paginates the constituency list across ~13 pages per state; this
// function fetches them all in parallel, parses the table rows, maps
// parties to alliances, and returns one clean JSON object.
//
// MODE = "bihar"  → live test against Bihar Nov-2025 (real data, today)
// MODE = "tn"     → Tamil Nadu May-2026 (empty until May 4)
//
// Flip MODE, redeploy this one function — hosting doesn't need to change.

const functions = require("firebase-functions");
const cheerio = require("cheerio");
// Node 18+ on Firebase Functions v2 provides `fetch` globally.

// ─────────────────────────────────────────────────────────────
// MODE — switch this one line
// ─────────────────────────────────────────────────────────────
const MODE = "bihar"; // "bihar" | "tn"

const TARGETS = {
  bihar: {
    prefix: "ResultAcGenNov2025",
    stateCode: "S04",
    label: "Bihar · 2025",
    totalSeats: 243,
    majority: 122,
  },
  tn: {
    // Verify on May 3 evening once ECI publishes the TN landing page.
    prefix: "ResultAcGenMay2026",
    stateCode: "S22",         // Tamil Nadu (ECI alphabetical ordering: S04=Bihar, S22=TN)
    label: "Tamil Nadu · 2026",
    totalSeats: 234,
    majority: 118,
  },
};

const TARGET = TARGETS[MODE];
const BASE = `https://results.eci.gov.in/${TARGET.prefix}`;

// ─────────────────────────────────────────────────────────────
// Party lookup — full ECI name → { short code, alliance id }
// Alliance groupings chosen to match the political narrative.
// ─────────────────────────────────────────────────────────────
const PARTIES_BIHAR = {
  "Bharatiya Janata Party":                                          { short:"BJP",    alliance:"nda" },
  "Janata Dal (United)":                                              { short:"JD(U)",  alliance:"nda" },
  "Lok Janshakti Party(Ram Vilas)":                                   { short:"LJPRV",  alliance:"nda" },
  "Lok Janshakti Party (Ram Vilas)":                                  { short:"LJPRV",  alliance:"nda" },
  "Hindustani Awam Morcha (Secular)":                                 { short:"HAMS",   alliance:"nda" },
  "Rashtriya Lok Morcha":                                             { short:"RLM",    alliance:"nda" },
  "Rashtriya Janata Dal":                                             { short:"RJD",    alliance:"ind" },
  "Indian National Congress":                                         { short:"INC",    alliance:"ind" },
  "Communist Party of India (Marxist-Leninist) (Liberation)":         { short:"CPI(ML)",alliance:"ind" },
  "Communist Party of India  (Marxist)":                              { short:"CPI(M)", alliance:"ind" },
  "Communist Party of India (Marxist)":                               { short:"CPI(M)", alliance:"ind" },
  "Communist Party of India":                                         { short:"CPI",    alliance:"ind" },
  "Vikassheel Insaan Party":                                          { short:"VIP",    alliance:"others" },
  "All India Majlis-E-Ittehadul Muslimeen":                           { short:"AIMIM",  alliance:"aimim" },
  "Independent":                                                      { short:"IND",    alliance:"others" },
};

const ALLIANCES_BIHAR = [
  { id:"nda",    name:"NDA",         parties:["BJP","JD(U)","LJPRV","HAMS","RLM"], color:"#E65100" },
  { id:"ind",    name:"INDIA bloc",  parties:["RJD","INC","CPI(ML)","CPI","CPI(M)"], color:"#2E7D32" },
  { id:"aimim",  name:"AIMIM",       parties:["AIMIM"], color:"#1E3A8A" },
  { id:"others", name:"Others",      parties:["IND","VIP"], color:"#6B6B6B" },
];

const PARTIES_TN = {
  "Dravida Munnetra Kazhagam":                        { short:"DMK",    alliance:"spa" },
  "Indian National Congress":                         { short:"INC",    alliance:"spa" },
  "Viduthalai Chiruthaigal Katchi":                   { short:"VCK",    alliance:"spa" },
  "Communist Party of India":                         { short:"CPI",    alliance:"spa" },
  "Communist Party of India (Marxist)":               { short:"CPI(M)", alliance:"spa" },
  "Marumalarchi Dravida Munnetra Kazhagam":           { short:"MDMK",   alliance:"spa" },
  "Indian Union Muslim League":                       { short:"IUML",   alliance:"spa" },
  "Kongunadu Makkal Desia Katchi":                    { short:"KMDK",   alliance:"spa" },
  "All India Anna Dravida Munnetra Kazhagam":         { short:"AIADMK", alliance:"nda" },
  "Bharatiya Janata Party":                           { short:"BJP",    alliance:"nda" },
  "Pattali Makkal Katchi":                            { short:"PMK",    alliance:"nda" },
  "Amma Makkal Munnettra Kazagam":                    { short:"AMMK",   alliance:"nda" },
  "Desiya Murpokku Dravida Kazhagam":                 { short:"DMDK",   alliance:"nda" },
  "Tamilaga Vettri Kazhagam":                         { short:"TVK",    alliance:"tvk" },
  "Naam Tamilar Katchi":                              { short:"NTK",    alliance:"others" },
  "Independent":                                      { short:"IND",    alliance:"others" },
};

const ALLIANCES_TN = [
  { id:"spa",    name:"DMK-led SPA",      parties:["DMK","INC","VCK","CPI","CPI(M)","MDMK","IUML","KMDK"], color:"#C8352F" },
  { id:"nda",    name:"AIADMK+BJP front", parties:["AIADMK","BJP","PMK","AMMK","DMDK"], color:"#2E7D32" },
  { id:"tvk",    name:"TVK",              parties:["TVK"], color:"#E65100" },
  { id:"others", name:"Others",           parties:["NTK","IND"], color:"#6B6B6B" },
];

const PARTIES   = MODE === "bihar" ? PARTIES_BIHAR   : PARTIES_TN;
const ALLIANCES = MODE === "bihar" ? ALLIANCES_BIHAR : ALLIANCES_TN;

// Fuzzy match in case ECI's full name has stray whitespace or punctuation
function lookupParty(fullName) {
  if (!fullName) return { short:"—", alliance:"others" };
  const trimmed = fullName.replace(/\s+/g, " ").trim();
  if (PARTIES[trimmed]) return PARTIES[trimmed];

  // Substring match on a normalized key
  const norm = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(PARTIES)) {
    const kNorm = key.toLowerCase();
    if (kNorm === norm || norm.includes(kNorm) || kNorm.includes(norm)) return val;
  }

  // Try initials: "All India Anna Dravida Munnetra Kazhagam" → AIADMK
  const initials = trimmed
    .replace(/[()]/g, " ")
    .split(/\s+/).filter(w => w.length>0 && /^[A-Z]/.test(w))
    .map(w => w[0]).join("");
  return { short: initials || trimmed.slice(0,8).toUpperCase(), alliance:"others" };
}

// ─────────────────────────────────────────────────────────────
// Caching
// ─────────────────────────────────────────────────────────────
let cache = { at: 0, data: null };
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// Fetch one paginated state-wise page
// ─────────────────────────────────────────────────────────────
async function fetchPage(pageNum) {
  const url = `${BASE}/statewise${TARGET.stateCode}${pageNum}.htm`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (PickleConnect Election Tracker)" },
    });
    if (!r.ok) return { ok:false, status:r.status, url };
    const html = await r.text();
    return { ok:true, html, url };
  } catch (e) {
    return { ok:false, error:e.message, url };
  }
}

// Extract a clean party name from a <td> that also contains an
// embedded "Party Wise State Trends" tooltip table.
function extractPartyName($, cell) {
  // Strategy: take only the first direct text node of the cell,
  // before any nested elements (tables, divs, tooltips).
  const $c = $(cell);
  // Get raw HTML, cut at the first opening tag after the party name
  const html = $c.html() || "";
  // Everything before first "<" tag (other than whitespace) is the party name
  let txt = html.split(/<[^>]+>/)[0];
  if (!txt || !txt.trim()) {
    // Fallback — take all text, cut at tooltip marker
    txt = $c.text().split(/\bi\s*Party\s+Wise/i)[0];
  }
  return txt.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────
// Parse one state-wise page's HTML table
// Columns: Constituency | Const.No | Leading Candidate | Leading Party
//          | Trailing Candidate | Trailing Party | Margin | Round | Status
// ─────────────────────────────────────────────────────────────
function parsePage(html) {
  const $ = cheerio.load(html);
  const rows = [];

  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td").toArray();
    if (tds.length < 9) return;

    const constituency = $(tds[0]).text().trim();
    const constNo = parseInt($(tds[1]).text().trim(), 10);
    if (!constituency || !Number.isFinite(constNo)) return;

    const leaderName  = $(tds[2]).text().trim();
    const leaderParty = extractPartyName($, tds[3]);
    const trailName   = $(tds[4]).text().trim();
    const trailParty  = extractPartyName($, tds[5]);

    // Margin — strip everything except digits; takes the biggest number
    // in the cell (handles "35,680" and "+ 35,680" both)
    const marginTxt = $(tds[6]).text();
    const marginMatches = marginTxt.match(/[\d,]+/g) || [];
    const margin = marginMatches.length
      ? parseInt(marginMatches[0].replace(/,/g, ""), 10) || 0
      : 0;

    const round     = $(tds[7]).text().trim();
    const statusRaw = $(tds[8]).text().trim().toLowerCase();

    // Status — "Result Declared" / "Declared" / "Won" → declared;
    // "Leading" or any non-empty margin → leading; else pending
    const status = /declared|result|won/.test(statusRaw) ? "declared"
                 : /leading/.test(statusRaw)             ? "leading"
                 : margin > 0                            ? "leading"
                 : "pending";

    const lp = lookupParty(leaderParty);
    const tp = lookupParty(trailParty);

    rows.push({
      no: constNo, name: constituency,
      leader:   { name:leaderName, party:lp.short, partyFull:leaderParty, alliance:lp.alliance, votes:0, margin },
      runnerUp: { name:trailName,  party:tp.short, partyFull:trailParty,  alliance:tp.alliance, votes:0 },
      round, status,
    });
  });

  return rows;
}
// ─────────────────────────────────────────────────────────────
// Main aggregator — fetches all pages in parallel, merges, tallies
// ─────────────────────────────────────────────────────────────
async function fetchAll() {
  // Kick off pages 1..15 in parallel. ECI typically has 12–13.
  const maxPages = 15;
  const results = await Promise.all(
    Array.from({ length: maxPages }, (_, i) => fetchPage(i + 1))
  );

  const allRows = [];
  const errors = [];
  results.forEach((r, i) => {
    if (!r.ok) {
      if (r.status && r.status !== 404) errors.push(`page ${i+1}: HTTP ${r.status}`);
      return;
    }
    const rows = parsePage(r.html);
    allRows.push(...rows);
  });

  // Dedupe by constituency number (in case pagination overlaps)
  const byNo = new Map();
  allRows.forEach(row => byNo.set(row.no, row));
  const constituencies = Array.from(byNo.values()).sort((a, b) => a.no - b.no);

  // Alliance tallies
  const tallies = Object.fromEntries(ALLIANCES.map(a => [a.id, { won:0, leading:0 }]));
  constituencies.forEach(c => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  const alliances = ALLIANCES.map(a => ({
    ...a, won: tallies[a.id].won, leading: tallies[a.id].leading,
  }));

  const totals = {
    declared: constituencies.filter(c => c.status === "declared").length,
    leading:  constituencies.filter(c => c.status === "leading").length,
    pending:  Math.max(0, TARGET.totalSeats - constituencies.length) +
              constituencies.filter(c => c.status === "pending").length,
    total:    TARGET.totalSeats,
  };

  return {
    mode: MODE,
    label: TARGET.label,
    updatedAt: new Date().toISOString(),
    totals, alliances, constituencies,
    _meta: {
      pagesFetched: results.filter(r => r.ok).length,
      errors: errors.length ? errors : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// HTTP HANDLER
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

      const parsed = await fetchAll();

      if (parsed.constituencies.length > 0) {
        cache = { at: now, data: parsed };
        res.json(parsed);
      } else {
        // Pre-counting (all 404s) — return empty-but-valid payload
        res.json({
          mode: MODE, label: TARGET.label,
          updatedAt: new Date().toISOString(),
          totals: { declared:0, leading:0, pending:TARGET.totalSeats, total:TARGET.totalSeats },
          alliances: ALLIANCES.map(a => ({ ...a, won:0, leading:0 })),
          constituencies: [],
          _note: "No data yet — ECI pages not live or returned no rows.",
          _meta: parsed._meta,
        });
      }
    } catch (e) {
      console.error("tnResults error:", e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
