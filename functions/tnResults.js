// functions/tnResults.js
//
// Two endpoints:
//   GET /tnResults          → state-wise summary
//   GET /tnResults?ac=187   → one constituency's candidate list with votes
//
// MODE = "bihar"  → Bihar Nov-2025 (archived, all seats "declared")
// MODE = "tn"     → Tamil Nadu May-2026

const functions = require("firebase-functions");
const cheerio = require("cheerio");

// ─────────────────────────────────────────────────────────────
const MODE = "bihar";

const TARGETS = {
  bihar: { prefix: "ResultAcGenNov2025", stateCode: "S04", label: "Bihar · 2025", totalSeats: 243, majority: 122 },
  tn:    { prefix: "ResultAcGenMay2026", stateCode: "S22", label: "Tamil Nadu · 2026", totalSeats: 234, majority: 118 },
};
const TARGET = TARGETS[MODE];
const BASE = `https://results.eci.gov.in/${TARGET.prefix}`;

// ─────────────────────────────────────────────────────────────
// Party & alliance lookup
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
  "Bahujan Samaj Party":                                          { short:"BSP",    alliance:"others" },
  "Indian Inclusive Party":                                       { short:"IIP",    alliance:"others" },
  "All India Majlis-E-Ittehadul Muslimeen":                       { short:"AIMIM",  alliance:"aimim" },
  "Independent":                                                  { short:"IND",    alliance:"others" },
  "None of the Above":                                            { short:"NOTA",   alliance:"others" },
};

const ALLIANCES_BIHAR = [
  { id:"nda",    name:"NDA",         parties:["BJP","JD(U)","LJPRV","HAMS","RLM"], color:"#E65100" },
  { id:"ind",    name:"INDIA bloc",  parties:["RJD","INC","CPI(ML)","CPI","CPI(M)"], color:"#2E7D32" },
  { id:"aimim",  name:"AIMIM",       parties:["AIMIM"], color:"#1E3A8A" },
  { id:"others", name:"Others",      parties:["IND","VIP","JSP","BSP","IIP"], color:"#6B6B6B" },
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
    if (kNorm === norm || norm.startsWith(kNorm) || kNorm.startsWith(norm)) return val;
  }
  for (const [key, val] of Object.entries(PARTIES)) {
    const kNorm = key.toLowerCase();
    if (norm.includes(kNorm) || kNorm.includes(norm)) return val;
  }
  const initials = trimmed.replace(/[()]/g, " ").split(/\s+/)
    .filter(w => w.length>0 && /^[A-Z]/.test(w))
    .map(w => w[0]).join("");
  return { short: initials || trimmed.slice(0,8).toUpperCase(), alliance:"others" };
}

// ─────────────────────────────────────────────────────────────
let summaryCache = { at: 0, data: null };
const acCache = new Map();
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// Extract clean party name from cell containing an embedded tooltip.
// The raw text looks like:  "Bharatiya Janata PartyiParty Wise State TrendsLeading In:0Won In:89Trailing In:0"
// We cut at "iParty Wise" (the tooltip marker) to get just the name.
// ─────────────────────────────────────────────────────────────
function extractPartyName($, cell) {
  const $c = $(cell);
  // Prefer HTML-based extraction — text before first nested tag
  const html = $c.html() || "";
  const beforeTag = html.split(/<[^>]+>/)[0].replace(/&amp;/g, "&").trim();
  if (beforeTag && beforeTag.length > 2) return beforeTag;

  // Fallback — raw text, cut at tooltip "iParty Wise"
  const txt = $c.text().replace(/\s+/g, " ").trim();
  const cut = txt.split(/iParty\s+Wise/i)[0]
                 .split(/\bi\s+Party\s+Wise/i)[0];
  return cut.trim();
}

// Parse "Won In: X" / "Leading In: Y" out of the tooltip text.
// Used to tally party totals even when the table columns are sparse.
function parsePartyTooltip(partyFullRaw) {
  if (!partyFullRaw) return { won:null, leading:null };
  const wonMatch = partyFullRaw.match(/Won\s+In\s*:?\s*(\d+)/i);
  const leadMatch = partyFullRaw.match(/Leading\s+In\s*:?\s*(\d+)/i);
  return {
    won: wonMatch ? parseInt(wonMatch[1], 10) : null,
    leading: leadMatch ? parseInt(leadMatch[1], 10) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// STATE-WISE pages
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

// Detect if the page overall is the "final/declared" archived view.
// ECI shows "Status Known For 243 out of 243 Constituencies" when done.
function detectAllDeclared(html) {
  return /Status Known For\s+(\d+)\s+out of\s+\1\s+Constituencies/i.test(html);
}

function parseStatewisePage(html) {
  const $ = cheerio.load(html);
  const rows = [];
  const allDeclared = detectAllDeclared(html);

  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td").toArray();
    // Need at least constituency, number, leader name, leader party
    if (tds.length < 4) return;

    const constituency = $(tds[0]).text().trim();
    const constNo = parseInt($(tds[1]).text().trim(), 10);
    if (!constituency || !Number.isFinite(constNo)) return;
    // Skip weirdly short constituency strings (they're probably footer rows)
    if (constituency.length < 2) return;

    const leaderName  = $(tds[2]).text().trim();
    const leaderCellRaw = $(tds[3]).text();
    const leaderParty = extractPartyName($, tds[3]);

    // Trail cells (may be present or collapsed)
    const trailName  = tds[4] ? $(tds[4]).text().trim() : "";
    const trailParty = tds[5] ? extractPartyName($, tds[5]) : "";

    // Scan all cells for margin / round / status patterns
    let margin = 0;
    let round = "";
    let statusRaw = "";

    for (let i = 6; i < tds.length; i++) {
      const cellTxt = $(tds[i]).text().trim();
      if (!cellTxt) continue;
      // Margin: a large-ish pure number or "+ 12345"
      const numMatch = cellTxt.match(/^[\s+\-]*([\d,]+)/);
      if (numMatch && !margin) {
        const n = parseInt(numMatch[1].replace(/,/g, ""), 10);
        if (n > 0 && n < 1_000_000) margin = n;
      }
      // Round: pattern like "25/25"
      if (/^\d+\/\d+$/.test(cellTxt) && !round) round = cellTxt;
      // Status text
      if (/declared|result|leading|won/i.test(cellTxt)) statusRaw = cellTxt;
    }

    const status =
      /declared|result|\bwon\b/i.test(statusRaw) ? "declared" :
      /leading/i.test(statusRaw)                 ? "leading" :
      allDeclared                                ? "declared" :   // archived page fallback
      margin > 0                                 ? "leading" :
      "pending";

    const lp = lookupParty(leaderParty);
    const tp = lookupParty(trailParty);

    rows.push({
      no: constNo,
      name: constituency,
      leader: {
        name: leaderName,
        party: lp.short,
        partyFull: leaderParty,
        alliance: lp.alliance,
        margin,
      },
      runnerUp: {
        name: trailName,
        party: tp.short,
        partyFull: trailParty,
        alliance: tp.alliance,
      },
      round, status,
      _tooltip: parsePartyTooltip(leaderCellRaw), // for whole-state tallies
    });
  });

  return { rows, allDeclared };
}

async function fetchStatewise() {
  const results = await Promise.all(
    Array.from({ length: 15 }, (_, i) => fetchStatewisePage(i + 1))
  );

  const allRows = [];
  let anyAllDeclared = false;
  const errors = [];

  results.forEach((r, i) => {
    if (!r.ok) {
      if (r.status && r.status !== 404) errors.push(`page ${i+1}: HTTP ${r.status}`);
      return;
    }
    const parsed = parseStatewisePage(r.html);
    if (parsed.allDeclared) anyAllDeclared = true;
    allRows.push(...parsed.rows);
  });

  const byNo = new Map();
  allRows.forEach(row => byNo.set(row.no, row));
  const constituencies = Array.from(byNo.values()).sort((a, b) => a.no - b.no);

  // PRIMARY tally: count by each row's leader.party + status
  const tallies = Object.fromEntries(ALLIANCES.map(a => [a.id, { won:0, leading:0 }]));
  constituencies.forEach(c => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  // SECONDARY source: the tooltip ships "Won In: X" for every party at state level.
  // Build per-party totals from those tooltips, then check if our row-count matches.
  // If the row-tallies are all zero (parser confused) but tooltips have data, use tooltips.
  const partyTotalsFromTooltip = {};
  constituencies.forEach(c => {
    const p = c.leader.partyFull;
    const t = c._tooltip;
    if (!p || t.won == null) return;
    partyTotalsFromTooltip[p] = { won: t.won, leading: t.leading || 0 };
  });

  const sumTallies = Object.values(tallies).reduce((s,t) => s + t.won + t.leading, 0);
  const sumTooltip = Object.values(partyTotalsFromTooltip).reduce((s,t) => s + t.won + t.leading, 0);

  if (sumTallies === 0 && sumTooltip > 0) {
    // Row-level parse failed to assign status — rebuild alliance tallies from tooltip party totals
    Object.keys(tallies).forEach(id => { tallies[id].won = 0; tallies[id].leading = 0; });
    for (const [partyFull, t] of Object.entries(partyTotalsFromTooltip)) {
      const lp = lookupParty(partyFull);
      const bucket = tallies[lp.alliance];
      if (!bucket) continue;
      bucket.won += t.won;
      bucket.leading += t.leading;
    }
    // Also flip each constituency's status to "declared" since archived pages report total wins
    constituencies.forEach(c => {
      if (c.status === "pending") c.status = "declared";
    });
  }

  const alliances = ALLIANCES.map(a => ({ ...a, won: tallies[a.id].won, leading: tallies[a.id].leading }));

  const declared = constituencies.filter(c => c.status === "declared").length;
  const leading  = constituencies.filter(c => c.status === "leading").length;
  const pending  = Math.max(0, TARGET.totalSeats - constituencies.length) +
                   constituencies.filter(c => c.status === "pending").length;

  // Strip internal fields before sending
  constituencies.forEach(c => { delete c._tooltip; });

  return {
    mode: MODE, label: TARGET.label,
    updatedAt: new Date().toISOString(),
    totals: { declared, leading, pending, total: TARGET.totalSeats },
    alliances, constituencies,
    _meta: {
      pagesFetched: results.filter(r => r.ok).length,
      allDeclared: anyAllDeclared,
      rowTallySum: sumTallies,
      tooltipTallySum: sumTooltip,
      errors: errors.length ? errors : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Per-constituency detail (unchanged — Constituencywise URL)
// ─────────────────────────────────────────────────────────────
async function fetchConstituency(ac) {
  const url = `${BASE}/Constituencywise${TARGET.stateCode}${ac}.htm`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  const html = await r.text();
  const $ = cheerio.load(html);

  const heading = $("h2, h3").filter((_, el) => /Assembly Constituency/i.test($(el).text())).first().text().trim();
  const m = heading.match(/Constituency\s+(\d+)\s*[-–]\s*([^(]+)/i);
  const no = m ? parseInt(m[1], 10) : ac;
  const name = m ? m[2].trim() : "";

  const statusText = $("*:contains('Status as on')").first().text().trim();
  const round = (statusText.match(/Round,?\s*([\d\/]+)/i) || [])[1] || "";

  const candidates = [];
  $("tr").each((_, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 7) return;
    const sn = $(tds[0]).text().trim();
    if (!/^\d+$/.test(sn)) return;
    const candName = $(tds[1]).text().trim();
    const party    = $(tds[2]).text().trim();
    const evm      = parseInt($(tds[3]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const postal   = parseInt($(tds[4]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const total    = parseInt($(tds[5]).text().replace(/[^0-9]/g, ""), 10) || 0;
    const pct      = parseFloat($(tds[6]).text().trim()) || 0;
    const lp = lookupParty(party);
    candidates.push({ sn: parseInt(sn,10), name:candName, party:lp.short, partyFull:party, alliance:lp.alliance, evm, postal, total, pct });
  });
  candidates.sort((a,b) => b.total - a.total);

  return {
    no, name, round, candidates,
    totalVotes: candidates.reduce((s,c) => s + c.total, 0),
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
      "https://pickleconnect.live","https://www.pickleconnect.live",
      "https://skipq.app","https://skipq.vip",
      "http://localhost:3000","http://localhost:5173","http://localhost:8080",
    ];
    if (allowed.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
    else res.set("Access-Control-Allow-Origin", "*");
    res.set("Vary", "Origin");
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const ac = parseInt(req.query.ac, 10);
      const now = Date.now();

      if (Number.isFinite(ac) && ac > 0) {
        const cached = acCache.get(ac);
        if (cached && now - cached.at < CACHE_MS) { res.json({ ...cached.data, _cached:true }); return; }
        const data = await fetchConstituency(ac);
        if (data.candidates && data.candidates.length) acCache.set(ac, { at:now, data });
        res.json(data);
        return;
      }

      if (summaryCache.data && now - summaryCache.at < CACHE_MS) {
        res.json({ ...summaryCache.data, _cached:true }); return;
      }
      const parsed = await fetchStatewise();
      if (parsed.constituencies.length > 0) {
        summaryCache = { at:now, data:parsed };
        res.json(parsed);
      } else {
        res.json({
          mode:MODE, label:TARGET.label,
          updatedAt:new Date().toISOString(),
          totals:{ declared:0, leading:0, pending:TARGET.totalSeats, total:TARGET.totalSeats },
          alliances: ALLIANCES.map(a => ({ ...a, won:0, leading:0 })),
          constituencies:[],
          _note:"No data yet",
          _meta:parsed._meta,
        });
      }
    } catch (e) {
      console.error("tnResults error:", e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
