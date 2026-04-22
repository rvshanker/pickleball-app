// functions/tnResults.js
//
// Two endpoints in one function:
//   GET /tnResults            → state-wise summary (all constituencies, tallies)
//   GET /tnResults?ac=187     → one constituency's full candidate list with votes
//
// MODE = "bihar"  → live test against Bihar Nov-2025
// MODE = "tn"     → Tamil Nadu May-2026

const functions = require("firebase-functions");
const cheerio = require("cheerio");

// ─────────────────────────────────────────────────────────────
// MODE
// ─────────────────────────────────────────────────────────────
const MODE = "bihar"; // "bihar" | "tn"

const TARGETS = {
  bihar: { prefix: "ResultAcGenNov2025", stateCode: "S04", label: "Bihar · 2025", totalSeats: 243, majority: 122 },
  tn:    { prefix: "ResultAcGenMay2026", stateCode: "S22", label: "Tamil Nadu · 2026", totalSeats: 234, majority: 118 },
};

const TARGET = TARGETS[MODE];
const BASE = `https://results.eci.gov.in/${TARGET.prefix}`;

// ─────────────────────────────────────────────────────────────
// Parties & alliances
// ─────────────────────────────────────────────────────────────
const PARTIES_BIHAR = {
  "Bharatiya Janata Party":                                      { short:"BJP",    alliance:"nda" },
  "Janata Dal (United)":                                          { short:"JD(U)",  alliance:"nda" },
  "Lok Janshakti Party(Ram Vilas)":                               { short:"LJPRV",  alliance:"nda" },
  "Lok Janshakti Party (Ram Vilas)":                              { short:"LJPRV",  alliance:"nda" },
  "Hindustani Awam Morcha (Secular)":                             { short:"HAMS",   alliance:"nda" },
  "Rashtriya Lok Morcha":                                         { short:"RLM",    alliance:"nda" },
  "Rashtriya Janata Dal":                                         { short:"RJD",    alliance:"ind" },
  "Indian National Congress":                                     { short:"INC",    alliance:"ind" },
  "Communist Party of India (Marxist-Leninist) (Liberation)":     { short:"CPI(ML)",alliance:"ind" },
  "Communist Party of India (Marxist)":                           { short:"CPI(M)", alliance:"ind" },
  "Communist Party of India":                                     { short:"CPI",    alliance:"ind" },
  "Vikassheel Insaan Party":                                      { short:"VIP",    alliance:"others" },
  "Jan Suraaj Party":                                             { short:"JSP",    alliance:"others" },
  "All India Majlis-E-Ittehadul Muslimeen":                       { short:"AIMIM",  alliance:"aimim" },
  "Independent":                                                  { short:"IND",    alliance:"others" },
  "None of the Above":                                            { short:"NOTA",   alliance:"others" },
};

const ALLIANCES_BIHAR = [
  { id:"nda",    name:"NDA",         parties:["BJP","JD(U)","LJPRV","HAMS","RLM"], color:"#E65100" },
  { id:"ind",    name:"INDIA bloc",  parties:["RJD","INC","CPI(ML)","CPI","CPI(M)"], color:"#2E7D32" },
  { id:"aimim",  name:"AIMIM",       parties:["AIMIM"], color:"#1E3A8A" },
  { id:"others", name:"Others",      parties:["IND","VIP","JSP"], color:"#6B6B6B" },
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
  "None of the Above":                                { short:"NOTA",   alliance:"others" },
};

const ALLIANCES_TN = [
  { id:"spa",    name:"DMK-led SPA",      parties:["DMK","INC","VCK","CPI","CPI(M)","MDMK","IUML","KMDK"], color:"#C8352F" },
  { id:"nda",    name:"AIADMK+BJP front", parties:["AIADMK","BJP","PMK","AMMK","DMDK"], color:"#2E7D32" },
  { id:"tvk",    name:"TVK",              parties:["TVK"], color:"#E65100" },
  { id:"others", name:"Others",           parties:["NTK","IND"], color:"#6B6B6B" },
];

const PARTIES   = MODE === "bihar" ? PARTIES_BIHAR   : PARTIES_TN;
const ALLIANCES = MODE === "bihar" ? ALLIANCES_BIHAR : ALLIANCES_TN;

function lookupParty(fullName) {
  if (!fullName) return { short:"—", alliance:"others" };
  const trimmed = fullName.replace(/\s+/g, " ").trim();
  if (PARTIES[trimmed]) return PARTIES[trimmed];
  const norm = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(PARTIES)) {
    const kNorm = key.toLowerCase();
    if (kNorm === norm || norm.includes(kNorm) || kNorm.includes(norm)) return val;
  }
  const initials = trimmed.replace(/[()]/g, " ").split(/\s+/)
    .filter(w => w.length>0 && /^[A-Z]/.test(w))
    .map(w => w[0]).join("");
  return { short: initials || trimmed.slice(0,8).toUpperCase(), alliance:"others" };
}

// ─────────────────────────────────────────────────────────────
// Caches — separate caches for summary and per-AC pages
// ─────────────────────────────────────────────────────────────
let summaryCache = { at: 0, data: null };
const acCache = new Map(); // ac -> { at, data }
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// Extract party name from state-wise table cell (with embedded tooltip)
// Takes raw HTML, cuts at first nested tag — that gives us just the party text.
// ─────────────────────────────────────────────────────────────
function extractPartyName($, cell) {
  const $c = $(cell);
  const html = $c.html() || "";
  let txt = html.split(/<[^>]+>/)[0];
  if (!txt || !txt.trim()) {
    txt = $c.text().split(/\bi\s*Party\s+Wise/i)[0];
  }
  return txt.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────
// STATE-WISE summary — fetch paginated pages in parallel
// ─────────────────────────────────────────────────────────────
async function fetchStatewisePage(pageNum) {
  const url = `${BASE}/statewise${TARGET.stateCode}${pageNum}.htm`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
    if (!r.ok) return { ok:false, status:r.status, url };
    return { ok:true, html: await r.text(), url };
  } catch (e) {
    return { ok:false, error:e.message, url };
  }
}

function parseStatewisePage(html) {
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

    // Margin — take the first integer-like number in the cell
    const marginTxt = $(tds[6]).text();
    const marginMatches = marginTxt.match(/[\d,]+/g) || [];
    const margin = marginMatches.length
      ? parseInt(marginMatches[0].replace(/,/g, ""), 10) || 0
      : 0;

    const round     = $(tds[7]).text().trim();
    const statusRaw = $(tds[8]).text().trim().toLowerCase();

    const status = /declared|result|\bwon\b/.test(statusRaw) ? "declared"
                 : /leading/.test(statusRaw)                 ? "leading"
                 : margin > 0                                ? "leading"
                 : "pending";

    const lp = lookupParty(leaderParty);
    const tp = lookupParty(trailParty);

    rows.push({
      no: constNo, name: constituency,
      leader:   { name:leaderName, party:lp.short, partyFull:leaderParty, alliance:lp.alliance, margin },
      runnerUp: { name:trailName,  party:tp.short, partyFull:trailParty,  alliance:tp.alliance },
      round, status,
    });
  });

  return rows;
}

async function fetchStatewise() {
  const maxPages = 15;
  const results = await Promise.all(
    Array.from({ length: maxPages }, (_, i) => fetchStatewisePage(i + 1))
  );

  const allRows = [];
  const errors = [];
  results.forEach((r, i) => {
    if (!r.ok) {
      if (r.status && r.status !== 404) errors.push(`page ${i+1}: HTTP ${r.status}`);
      return;
    }
    allRows.push(...parseStatewisePage(r.html));
  });

  const byNo = new Map();
  allRows.forEach(row => byNo.set(row.no, row));
  const constituencies = Array.from(byNo.values()).sort((a, b) => a.no - b.no);

  const tallies = Object.fromEntries(ALLIANCES.map(a => [a.id, { won:0, leading:0 }]));
  constituencies.forEach(c => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  const alliances = ALLIANCES.map(a => ({ ...a, won: tallies[a.id].won, leading: tallies[a.id].leading }));

  const totals = {
    declared: constituencies.filter(c => c.status === "declared").length,
    leading:  constituencies.filter(c => c.status === "leading").length,
    pending:  Math.max(0, TARGET.totalSeats - constituencies.length) +
              constituencies.filter(c => c.status === "pending").length,
    total:    TARGET.totalSeats,
  };

  return {
    mode: MODE, label: TARGET.label,
    updatedAt: new Date().toISOString(),
    totals, alliances, constituencies,
    _meta: { pagesFetched: results.filter(r => r.ok).length, errors: errors.length ? errors : undefined },
  };
}

// ─────────────────────────────────────────────────────────────
// CONSTITUENCY detail — one AC, all candidates with vote totals
// Page format: ConstituencywiseS04187.htm
// Columns: S.N. | Candidate | Party | EVM | Postal | Total | %
// ─────────────────────────────────────────────────────────────
async function fetchConstituency(ac) {
  const url = `${BASE}/Constituencywise${TARGET.stateCode}${ac}.htm`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  const html = await r.text();
  const $ = cheerio.load(html);

  // Constituency name from heading: "Assembly Constituency 187 - MANER (Bihar)"
  const heading = $("h2, h3").filter((_, el) => /Assembly Constituency/i.test($(el).text())).first().text().trim();
  const m = heading.match(/Constituency\s+(\d+)\s*[-–]\s*([^(]+)/i);
  const no = m ? parseInt(m[1], 10) : ac;
  const name = m ? m[2].trim() : "";

  // Status / round, e.g. "Status as on Round, 31/31"
  const statusText = $("*:contains('Status as on')").first().text().trim();
  const round = (statusText.match(/Round,?\s*([\d\/]+)/i) || [])[1] || "";

  // Parse candidate table — 7 cols
  const candidates = [];
  $("tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 7) return;
    const sn = $(tds[0]).text().trim();
    if (!/^\d+$/.test(sn)) return; // skip header & total rows
    const candName = $(tds[1]).text().trim();
    const party    = $(tds[2]).text().trim();
    const evm      = parseInt($(tds[3]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const postal   = parseInt($(tds[4]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const total    = parseInt($(tds[5]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const pctTxt   = $(tds[6]).text().trim();
    const pct      = parseFloat(pctTxt) || 0;

    const lp = lookupParty(party);
    candidates.push({
      sn: parseInt(sn, 10),
      name: candName,
      party: lp.short,
      partyFull: party,
      alliance: lp.alliance,
      evm, postal, total, pct,
    });
  });

  // Sort by total votes desc
  candidates.sort((a, b) => b.total - a.total);

  const totalValidVotes = candidates.reduce((s, c) => s + c.total, 0);

  return {
    no, name, round,
    candidates,
    totalVotes: totalValidVotes,
    updatedAt: new Date().toISOString(),
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
      "https://skipq.app", "https://skipq.vip",
      "http://localhost:3000", "http://localhost:5173", "http://localhost:8080",
    ];
    if (allowed.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
    else res.set("Access-Control-Allow-Origin", "*");
    res.set("Vary", "Origin");
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const ac = parseInt(req.query.ac, 10);
      const now = Date.now();

      // Per-constituency mode
      if (Number.isFinite(ac) && ac > 0) {
        const cached = acCache.get(ac);
        if (cached && now - cached.at < CACHE_MS) {
          res.json({ ...cached.data, _cached: true });
          return;
        }
        const data = await fetchConstituency(ac);
        if (data.candidates && data.candidates.length) {
          acCache.set(ac, { at: now, data });
        }
        res.json(data);
        return;
      }

      // State-wise summary
      if (summaryCache.data && now - summaryCache.at < CACHE_MS) {
        res.json({ ...summaryCache.data, _cached: true });
        return;
      }
      const parsed = await fetchStatewise();
      if (parsed.constituencies.length > 0) {
        summaryCache = { at: now, data: parsed };
        res.json(parsed);
      } else {
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
