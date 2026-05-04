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
const MODE = "tn";

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
  
  // ── SHORT name aliases (ECI uses these in table cells) ──────────────────
  "DMK":     { short:"DMK",    alliance:"dmk" },
  "INC":     { short:"INC",    alliance:"dmk" },
  "VCK":     { short:"VCK",    alliance:"dmk" },
  "CPI(M)":  { short:"CPI(M)", alliance:"dmk" },
  "CPI":     { short:"CPI",    alliance:"dmk" },
  "MDMK":    { short:"MDMK",   alliance:"dmk" },
  "IUML":    { short:"IUML",   alliance:"dmk" },
  "KMDK":    { short:"KMDK",   alliance:"dmk" },
  "AIADMK":  { short:"AIADMK", alliance:"aiadmk" },
  "BJP":     { short:"BJP",    alliance:"aiadmk" },
  "PMK":     { short:"PMK",    alliance:"aiadmk" },
  "AMMK":    { short:"AMMK",   alliance:"aiadmk" },
  "DMDK":    { short:"DMDK",   alliance:"aiadmk" },
  "TVK":     { short:"TVK",    alliance:"tvk" },
  "NTK":     { short:"NTK",    alliance:"ntk" },
  "AIMIM":   { short:"AIMIM",  alliance:"aimim" },
  "IND":     { short:"IND",    alliance:"others" },
  "NOTA":    { short:"NOTA",   alliance:"others" },
};


const ALLIANCES_BIHAR = [
  { id:"nda",    name:"NDA",         parties:["BJP","JD(U)","LJPRV","HAMS","RLM"], color:"#E65100" },
  { id:"ind",    name:"INDIA bloc",  parties:["RJD","INC","CPI(ML)","CPI","CPI(M)"], color:"#2E7D32" },
  { id:"aimim",  name:"AIMIM",       parties:["AIMIM"], color:"#1E3A8A" },
  { id:"others", name:"Others",      parties:["IND","VIP","JSP","BSP","IIP"], color:"#6B6B6B" },
];

const PARTIES_TN = {
  // ── DMK-led alliance ──────────────────────────────────────────────────────
  "Dravida Munnetra Kazhagam":                        { short:"DMK",    alliance:"dmk" },
  "Indian National Congress":                         { short:"INC",    alliance:"dmk" },
  "Viduthalai Chiruthaigal Katchi":                   { short:"VCK",    alliance:"dmk" },
  "Communist Party of India":                         { short:"CPI",    alliance:"dmk" },
  "Communist Party of India (Marxist)":               { short:"CPI(M)", alliance:"dmk" },
  "Marumalarchi Dravida Munnetra Kazhagam":           { short:"MDMK",   alliance:"dmk" },
  "Indian Union Muslim League":                       { short:"IUML",   alliance:"dmk" },
  "Kongunadu Makkal Desia Katchi":                    { short:"KMDK",   alliance:"dmk" },

  // ── AIADMK-led alliance ───────────────────────────────────────────────────
  "All India Anna Dravida Munnetra Kazhagam":         { short:"AIADMK", alliance:"aiadmk" },
  "Bharatiya Janata Party":                           { short:"BJP",    alliance:"aiadmk" },
  "Pattali Makkal Katchi":                            { short:"PMK",    alliance:"aiadmk" },
  "Amma Makkal Munnettra Kazagam":                    { short:"AMMK",   alliance:"aiadmk" },
  "Desiya Murpokku Dravida Kazhagam":                 { short:"DMDK",   alliance:"aiadmk" },

  // ── TVK ───────────────────────────────────────────────────────────────────
  "Tamilaga Vettri Kazhagam":                         { short:"TVK",    alliance:"tvk" },

  // ── NTK ───────────────────────────────────────────────────────────────────
  "Naam Tamilar Katchi":                              { short:"NTK",    alliance:"ntk" },

  // ── AIMIM ─────────────────────────────────────────────────────────────────
  "All India Majlis-E-Ittehadul Muslimeen":           { short:"AIMIM",  alliance:"aimim" },

  // ── Others ───────────────────────────────────────────────────────────────
  "Independent":                                      { short:"IND",    alliance:"others" },
  "None of the Above":                                { short:"NOTA",   alliance:"others" },
};

const ALLIANCES_TN = [
  { id:"dmk",    name:"DMK+",    parties:["DMK","INC","VCK","CPI","CPI(M)","MDMK","IUML","KMDK"], color:"#C8352F" },
  { id:"aiadmk", name:"AIADMK+", parties:["AIADMK","BJP","PMK","AMMK","DMDK"],                    color:"#1F7A1F" },
  { id:"tvk",    name:"TVK",     parties:["TVK"],                                                  color:"#2557B0" },
  { id:"ntk",    name:"NTK",     parties:["NTK"],                                                  color:"#7a9e1b" },
  { id:"aimim",  name:"AIMIM",   parties:["AIMIM"],                                                color:"#1E5C2C" },
  { id:"others", name:"Others",  parties:["IND","NOTA"],                                           color:"#6B6B6B" },
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
    .filter(w => w.length > 0 && /^[A-Z]/.test(w))
    .map(w => w[0]).join("");
  return { short: initials || trimmed.slice(0, 8).toUpperCase(), alliance:"others" };
}

// ─────────────────────────────────────────────────────────────
let summaryCache = { at: 0, data: null };
const acCache = new Map();
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
function extractPartyName($, cell) {
  const $c = $(cell);
  const html = $c.html() || "";
  const beforeTag = html.split(/<[^>]+>/)[0].replace(/&amp;/g, "&").trim();
  if (beforeTag && beforeTag.length > 2) return beforeTag;
  const txt = $c.text().replace(/\s+/g, " ").trim();
  const cut = txt.split(/iParty\s+Wise/i)[0]
                 .split(/\bi\s+Party\s+Wise/i)[0];
  return cut.trim();
}

function parsePartyTooltip(partyFullRaw) {
  if (!partyFullRaw) return { won:null, leading:null };
  const wonMatch  = partyFullRaw.match(/Won\s+In\s*:?\s*(\d+)/i);
  const leadMatch = partyFullRaw.match(/Leading\s+In\s*:?\s*(\d+)/i);
  return {
    won:     wonMatch  ? parseInt(wonMatch[1],  10) : null,
    leading: leadMatch ? parseInt(leadMatch[1], 10) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Party-wise result page  (confirmed URL for TN 2026)
// https://results.eci.gov.in/ResultAcGenMay2026/partywiseresult-S22.htm
// ─────────────────────────────────────────────────────────────
async function fetchPartywise() {
  const url = `${BASE}/partywiseresult-${TARGET.stateCode}.htm`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
    if (!r.ok) return null;
    const $ = cheerio.load(await r.text());
    const totals = {};

    $("tr").each((_, tr) => {
      const tds = $(tr).find("td").toArray();
      if (tds.length < 3) return;
      const name    = $(tds[0]).text().trim();
      const won     = parseInt($(tds[1]).text().replace(/[^0-9]/g, ""), 10) || 0;
      const leading = parseInt($(tds[2]).text().replace(/[^0-9]/g, ""), 10) || 0;
      if (name && name.length > 2 && (won + leading) > 0) {
        totals[name] = { won, leading };
      }
    });

    return Object.keys(totals).length > 0 ? totals : null;
  } catch (e) {
    console.warn("fetchPartywise failed:", e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// State-wise pages
// https://results.eci.gov.in/ResultAcGenMay2026/statewiseS221.htm
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
    if (tds.length < 4) return;

    const constituency = $(tds[0]).text().trim();
    const constNo = parseInt($(tds[1]).text().trim(), 10);
    if (!constituency || !Number.isFinite(constNo)) return;
    if (constituency.length < 2) return;

    const leaderName    = $(tds[2]).text().trim();
    const leaderCellRaw = $(tds[3]).text();
    const leaderParty   = extractPartyName($, tds[3]);
    const trailName     = tds[4] ? $(tds[4]).text().trim() : "";
    const trailParty    = tds[5] ? extractPartyName($, tds[5]) : "";

    let margin = 0, round = "", statusRaw = "";

    for (let i = 6; i < tds.length; i++) {
      const cellTxt = $(tds[i]).text().trim();
      if (!cellTxt) continue;
      const numMatch = cellTxt.match(/^[\s+\-]*([\d,]+)/);
      if (numMatch && !margin) {
        const n = parseInt(numMatch[1].replace(/,/g, ""), 10);
        if (n > 0 && n < 1_000_000) margin = n;
      }
      if (/^\d+\/\d+$/.test(cellTxt) && !round) round = cellTxt;
      if (/declared|result|leading|won/i.test(cellTxt)) statusRaw = cellTxt;
    }

    const status =
      /declared|result|\bwon\b/i.test(statusRaw) ? "declared" :
      /leading/i.test(statusRaw)                 ? "leading"  :
      allDeclared                                ? "declared" :
      margin > 0                                 ? "leading"  :
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
      _tooltip: parsePartyTooltip(leaderCellRaw),
    });
  });

  return { rows, allDeclared };
}

async function fetchStatewise() {
  // Fetch statewise pages and partywiseresult page in parallel
  const [statewiseResults, partywiseTotals] = await Promise.all([
    Promise.all(Array.from({ length: 15 }, (_, i) => fetchStatewisePage(i + 1))),
    fetchPartywise(),
  ]);

  const allRows = [];
  let anyAllDeclared = false;
  const errors = [];

  statewiseResults.forEach((r, i) => {
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

  const tallies = Object.fromEntries(ALLIANCES.map(a => [a.id, { won:0, leading:0 }]));
  constituencies.forEach(c => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  const partyTotalsFromTooltip = {};
  constituencies.forEach(c => {
    const p = c.leader.partyFull;
    const t = c._tooltip;
    if (!p || t.won == null) return;
    partyTotalsFromTooltip[p] = { won: t.won, leading: t.leading || 0 };
  });

  const sumTallies = Object.values(tallies).reduce((s, t) => s + t.won + t.leading, 0);
  const sumTooltip = Object.values(partyTotalsFromTooltip).reduce((s, t) => s + t.won + t.leading, 0);

  // Strategy 1: tooltip data from statewise pages
  if (sumTallies === 0 && sumTooltip > 0) {
    Object.keys(tallies).forEach(id => { tallies[id].won = 0; tallies[id].leading = 0; });
    for (const [partyFull, t] of Object.entries(partyTotalsFromTooltip)) {
      const lp = lookupParty(partyFull);
      const bucket = tallies[lp.alliance];
      if (!bucket) continue;
      bucket.won += t.won;
      bucket.leading += t.leading;
    }
    constituencies.forEach(c => {
      if (c.status === "pending") c.status = "declared";
    });
  }

  // Strategy 2: partywiseresult page (fallback when statewise gives nothing)
  const sumAfterStrategy1 = Object.values(tallies).reduce((s, t) => s + t.won + t.leading, 0);
  if (sumAfterStrategy1 === 0 && partywiseTotals) {
    Object.keys(tallies).forEach(id => { tallies[id].won = 0; tallies[id].leading = 0; });
    for (const [partyFull, t] of Object.entries(partywiseTotals)) {
      const lp = lookupParty(partyFull);
      const bucket = tallies[lp.alliance];
      if (!bucket) continue;
      bucket.won += t.won;
      bucket.leading += t.leading;
    }
  }

  const alliances = ALLIANCES.map(a => ({ ...a, won: tallies[a.id].won, leading: tallies[a.id].leading }));

  const declared = constituencies.filter(c => c.status === "declared").length;
  const leading  = constituencies.filter(c => c.status === "leading").length;
  const pending  = Math.max(0, TARGET.totalSeats - constituencies.length) +
                   constituencies.filter(c => c.status === "pending").length;

  constituencies.forEach(c => { delete c._tooltip; });

  const sumPartywise = partywiseTotals
    ? Object.values(partywiseTotals).reduce((s, t) => s + t.won + t.leading, 0)
    : 0;

  return {
    mode: MODE, label: TARGET.label,
    updatedAt: new Date().toISOString(),
    totals: { declared, leading, pending, total: TARGET.totalSeats },
    alliances, constituencies,
    _meta: {
      pagesFetched: statewiseResults.filter(r => r.ok).length,
      allDeclared: anyAllDeclared,
      rowTallySum: sumTallies,
      tooltipTallySum: sumTooltip,
      partywiseTallySum: sumPartywise,
      errors: errors.length ? errors : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Per-constituency detail
// ─────────────────────────────────────────────────────────────
async function fetchConstituency(ac) {
  const url = `${BASE}/Constituencywise${TARGET.stateCode}${ac}.htm`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  const html = await r.text();
  const $ = cheerio.load(html);

  const heading = $("h2, h3").filter((_, el) => /Assembly Constituency/i.test($(el).text())).first().text().trim();
  const m = heading.match(/Constituency\s+(\d+)\s*[-–]\s*([^(]+)/i);
  const no   = m ? parseInt(m[1], 10) : ac;
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
    candidates.push({ sn: parseInt(sn, 10), name:candName, party:lp.short, partyFull:party, alliance:lp.alliance, evm, postal, total, pct });
  });
  candidates.sort((a, b) => b.total - a.total);

  return {
    no, name, round, candidates,
    totalVotes: candidates.reduce((s, c) => s + c.total, 0),
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
      "https://pickleconnect.live", "https://www.pickleconnect.live",
      "https://skipq.app", "https://skipq.vip",
      "http://localhost:3000", "http://localhost:5173", "http://localhost:8080",
    ];
    if (allowed.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
    else res.set("Access-Control-Allow-Origin", "*");
    res.set("Vary", "Origin");
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    try {
      const ac  = parseInt(req.query.ac, 10);
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
      if (parsed.constituencies.length > 0 || Object.values(parsed.alliances).some(a => a.won + a.leading > 0)) {
        summaryCache = { at:now, data:parsed };
        res.json(parsed);
      } else {
        res.json({
          mode: MODE, label: TARGET.label,
          updatedAt: new Date().toISOString(),
          totals: { declared:0, leading:0, pending:TARGET.totalSeats, total:TARGET.totalSeats },
          alliances: ALLIANCES.map(a => ({ ...a, won:0, leading:0 })),
          constituencies: [],
          _note: "No data yet — counting may not have started",
          _meta: parsed._meta,
        });
      }
    } catch (e) {
      console.error("tnResults error:", e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
