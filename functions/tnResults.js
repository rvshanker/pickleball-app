// functions/tnResults.js
//
// Two endpoints:
//   GET /tnResults          → state-wise summary
//   GET /tnResults?ac=187   → one constituency's candidate list with votes
//
// MODE = "tn"  → Tamil Nadu May-2026

const functions = require("firebase-functions");
const cheerio = require("cheerio");

const MODE = "tn";

const TARGETS = {
  tn: { prefix: "ResultAcGenMay2026", stateCode: "S22", label: "Tamil Nadu · 2026", totalSeats: 234, majority: 118 },
};
const TARGET = TARGETS[MODE];
const BASE = `https://results.eci.gov.in/${TARGET.prefix}`;

// ─────────────────────────────────────────────────────────────
// PARTIES_TN
// Both full names AND short-name aliases.
// Without the aliases, ECI's abbreviated cell text like "TVK"
// falls through to the initials path which returns
// alliance:"others" — causing huge mis-counts.
// ─────────────────────────────────────────────────────────────
const PARTIES_TN = {
  // ── DMK-led alliance — full names ─────────────────────────
  "Dravida Munnetra Kazhagam":                        { short:"DMK",    alliance:"dmk" },
  "Indian National Congress":                         { short:"INC",    alliance:"dmk" },
  "Viduthalai Chiruthaigal Katchi":                   { short:"VCK",    alliance:"dmk" },
  "Communist Party of India":                         { short:"CPI",    alliance:"dmk" },
  "Communist Party of India (Marxist)":               { short:"CPI(M)", alliance:"dmk" },
  "Marumalarchi Dravida Munnetra Kazhagam":           { short:"MDMK",   alliance:"dmk" },
  "Indian Union Muslim League":                       { short:"IUML",   alliance:"dmk" },
  "Kongunadu Makkal Desia Katchi":                    { short:"KMDK",   alliance:"dmk" },

  // ── AIADMK-led alliance — full names ─────────────────────
  "All India Anna Dravida Munnetra Kazhagam":         { short:"AIADMK", alliance:"aiadmk" },
  "Bharatiya Janata Party":                           { short:"BJP",    alliance:"aiadmk" },
  "Pattali Makkal Katchi":                            { short:"PMK",    alliance:"aiadmk" },
  "Amma Makkal Munnettra Kazagam":                    { short:"AMMK",   alliance:"aiadmk" },
  "Desiya Murpokku Dravida Kazhagam":                 { short:"DMDK",   alliance:"aiadmk" },

  // ── TVK ──────────────────────────────────────────────────
  "Tamilaga Vettri Kazhagam":                         { short:"TVK",    alliance:"tvk" },

  // ── NTK ──────────────────────────────────────────────────
  "Naam Tamilar Katchi":                              { short:"NTK",    alliance:"ntk" },

  // ── AIMIM ────────────────────────────────────────────────
  "All India Majlis-E-Ittehadul Muslimeen":           { short:"AIMIM",  alliance:"aimim" },

  // ── Others ───────────────────────────────────────────────
  "Independent":                                      { short:"IND",    alliance:"others" },
  "None of the Above":                                { short:"NOTA",   alliance:"others" },

  // ── SHORT-NAME ALIASES (ECI uses these in statewise cells) ─
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

const ALLIANCES_TN = [
  { id:"dmk",    name:"DMK+",    parties:["DMK","INC","VCK","CPI","CPI(M)","MDMK","IUML","KMDK"], color:"#C8352F" },
  { id:"aiadmk", name:"AIADMK+", parties:["AIADMK","BJP","PMK","AMMK","DMDK"],                    color:"#1F7A1F" },
  { id:"tvk",    name:"TVK",     parties:["TVK"],                                                  color:"#2557B0" },
  { id:"ntk",    name:"NTK",     parties:["NTK"],                                                  color:"#7a9e1b" },
  { id:"aimim",  name:"AIMIM",   parties:["AIMIM"],                                                color:"#1E5C2C" },
  { id:"others", name:"Others",  parties:["IND","NOTA"],                                           color:"#6B6B6B" },
];

const PARTIES   = PARTIES_TN;
const ALLIANCES = ALLIANCES_TN;

// ─────────────────────────────────────────────────────────────
function lookupParty(fullName) {
  if (!fullName) return { short:"—", alliance:"others" };
  const trimmed = fullName.replace(/\s+/g, " ").trim();

  // 1. Exact match (covers both full names AND short-name aliases above)
  if (PARTIES[trimmed]) return PARTIES[trimmed];

  const norm = trimmed.toLowerCase();

  // 2. Case-insensitive exact / starts-with / contains
  for (const [key, val] of Object.entries(PARTIES)) {
    const kNorm = key.toLowerCase();
    if (kNorm === norm || norm.startsWith(kNorm) || kNorm.startsWith(norm)) return val;
  }
  for (const [key, val] of Object.entries(PARTIES)) {
    const kNorm = key.toLowerCase();
    if (norm.includes(kNorm) || kNorm.includes(norm)) return val;
  }

  // 3. Initials fallback — keeps alliance:"others"
  const initials = trimmed.replace(/[()]/g, " ").split(/\s+/)
    .filter(w => w.length > 0 && /^[A-Z]/.test(w))
    .map(w => w[0]).join("");
  return { short: initials || trimmed.slice(0, 8).toUpperCase(), alliance:"others" };
}

// ─────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────
let summaryCache = { at: 0, data: null };
const acCache = new Map();
const CACHE_MS = 60_000;

// ─────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────
function extractPartyName($, cell) {
  const $c = $(cell);
  const innerTag = $c.find("a, span").first().text().replace(/\s+/g, " ").trim();
  if (innerTag && innerTag.length > 2 && !/pwst|tooltip|trend|leading|won/i.test(innerTag)) {
    return innerTag;
  }
  const textNodes = [];
  $c.contents().each((_, node) => {
    if (node.nodeType === 3) {
      const t = (node.data || "").replace(/\s+/g, " ").trim();
      if (t.length > 2 && !/^PWST/i.test(t)) textNodes.push(t);
    }
  });
  if (textNodes.length > 0) return textNodes[0];
  const html = $c.html() || "";
  const beforeTag = html.split(/<[^>]+>/)[0].replace(/&amp;/g, "&").trim();
  if (beforeTag && beforeTag.length > 2 && !/^PWST/i.test(beforeTag)) return beforeTag;
  const txt = $c.text().replace(/\s+/g, " ").trim();
  return txt
    .replace(/^PWST\s*[IVX\d]*/i, "")
    .split(/iParty\s+Wise/i)[0]
    .split(/\bParty\s+Wise/i)[0]
    .split(/Leading\s+In/i)[0]
    .split(/Won\s+In/i)[0]
    .trim();
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
// Round-based status:
//   "17/17" or "20/20" → all rounds complete → "declared"
//   "12/20"            → still counting       → null (keep as-is)
// ─────────────────────────────────────────────────────────────
function statusFromRound(round) {
  if (!round) return null;
  const m = round.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const done  = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  return (done > 0 && done === total) ? "declared" : null;
}

// ─────────────────────────────────────────────────────────────
// Party-wise result page  (for alliance totals + vote share)
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

      // Try to find vote-share % in later columns
      let voteShare = null;
      for (let i = 3; i < Math.min(tds.length, 7); i++) {
        const txt = $(tds[i]).text().trim().replace(/,/g, "");
        const pm = txt.match(/^(\d{1,2}(?:\.\d+)?)\s*%?$/);
        if (pm) {
          const v = parseFloat(pm[1]);
          if (v > 0 && v < 100) { voteShare = v; break; }
        }
      }

      if (name && name.length > 2 && (won + leading) > 0) {
        totals[name] = { won, leading, voteShare };
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
  const m = html.match(/Status Known For\s+(\d+)\s+out of\s+(\d+)\s+Constituencies/i);
  if (!m) return false;
  const known = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  return known > 0 && known === total;
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
      if (/result\s+declared|result\s+awaited|leading|won/i.test(cellTxt)) statusRaw = cellTxt;
    }

    // ── Status resolution ──────────────────────────────────
    // Priority 1: explicit page text
    let status;
    if (/result\s+declared|\bdeclared\b|\bwon\b/i.test(statusRaw)) {
      status = "declared";
    } else if (/leading/i.test(statusRaw)) {
      status = "leading";
    } else if (/result\s+awaited|awaited/i.test(statusRaw)) {
      status = "pending";
    } else {
      status = "pending";
    }

    // Priority 2: round "X/X" (all rounds done) → declared
    if (statusFromRound(round) === "declared") {
      status = "declared";
    }

    // Priority 3: no text yet, no complete round, but margin exists → leading
    if (status === "pending" && margin > 0 && statusFromRound(round) !== "declared") {
      status = "leading";
    }

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
        marginVerified: margin > 0,   // ← enables margin display in UI
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

// ─────────────────────────────────────────────────────────────
async function fetchStatewise() {
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

  // ── Tally seats per alliance ───────────────────────────────
  const tallies = Object.fromEntries(
    ALLIANCES.map(a => [a.id, { won:0, leading:0, voteShare:null }])
  );

  constituencies.forEach(c => {
    const t = tallies[c.leader.alliance];
    if (!t) return;
    if (c.status === "declared") t.won++;
    else if (c.status === "leading") t.leading++;
  });

  // ── Strategy 1: tooltip won/leading from statewise cells ──
  const partyTotalsFromTooltip = {};
  constituencies.forEach(c => {
    const p = c.leader.partyFull;
    const t = c._tooltip;
    if (!p || t.won == null) return;
    partyTotalsFromTooltip[p] = { won: t.won, leading: t.leading || 0 };
  });

  const sumTallies = Object.values(tallies).reduce((s, t) => s + t.won + t.leading, 0);
  const sumTooltip = Object.values(partyTotalsFromTooltip).reduce((s, t) => s + t.won + t.leading, 0);
  const hasValidParties = constituencies.some(c =>
    c.leader.party !== "—" && !/^PWST/i.test(c.leader.party)
  );

  if (sumTallies === 0 && sumTooltip > 0 && hasValidParties) {
    Object.keys(tallies).forEach(id => { tallies[id].won = 0; tallies[id].leading = 0; });
    for (const [partyFull, t] of Object.entries(partyTotalsFromTooltip)) {
      const lp = lookupParty(partyFull);
      const bucket = tallies[lp.alliance];
      if (!bucket) continue;
      bucket.won += t.won;
      bucket.leading += t.leading;
    }
  }

  // ── Strategy 2: partywiseresult fallback ──────────────────
  const sumAfterS1 = Object.values(tallies).reduce((s, t) => s + t.won + t.leading, 0);
  if (sumAfterS1 === 0 && partywiseTotals) {
    Object.keys(tallies).forEach(id => { tallies[id].won = 0; tallies[id].leading = 0; });
    for (const [partyFull, t] of Object.entries(partywiseTotals)) {
      const lp = lookupParty(partyFull);
      const bucket = tallies[lp.alliance];
      if (!bucket) continue;
      bucket.won += t.won;
      bucket.leading += t.leading;
    }
  }

  // ── Aggregate vote share per alliance ─────────────────────
  if (partywiseTotals) {
    const allianceShares = {};
    for (const [partyFull, t] of Object.entries(partywiseTotals)) {
      if (t.voteShare == null) continue;
      const lp = lookupParty(partyFull);
      allianceShares[lp.alliance] = (allianceShares[lp.alliance] || 0) + t.voteShare;
    }
    for (const [aid, share] of Object.entries(allianceShares)) {
      if (tallies[aid]) tallies[aid].voteShare = Math.round(share * 10) / 10;
    }
  }

  // ── Build response ─────────────────────────────────────────
  const alliances = ALLIANCES.map(a => ({
    ...a,
    won:       tallies[a.id].won,
    leading:   tallies[a.id].leading,
    voteShare: tallies[a.id].voteShare || undefined,
  }));

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
    totals: {
      declared, leading, pending,
      total: TARGET.totalSeats,
      reported: declared + leading,   // ← used for progress bar
    },
    alliances, constituencies,
    _meta: {
      pagesFetched:      statewiseResults.filter(r => r.ok).length,
      allDeclared:       anyAllDeclared,
      rowTallySum:       sumTallies,
      tooltipTallySum:   sumTooltip,
      partywiseTallySum: sumPartywise,
      errors:            errors.length ? errors : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Per-constituency candidate detail
// ─────────────────────────────────────────────────────────────
async function fetchConstituency(ac) {
  const url = `${BASE}/Constituencywise${TARGET.stateCode}${ac}.htm`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (PickleConnect)" } });
  if (!r.ok) return { error: `HTTP ${r.status}`, url };
  const html = await r.text();
  const $ = cheerio.load(html);

  const heading = $("h2, h3")
    .filter((_, el) => /Assembly Constituency/i.test($(el).text()))
    .first().text().trim();
  const m = heading.match(/Constituency\s+(\d+)\s*[-–]\s*([^(]+)/i);
  const no   = m ? parseInt(m[1], 10) : ac;
  const name = m ? m[2].trim() : "";

  const statusText = $("*:contains('Status as on')").first().text().trim();
  const round = (statusText.match(/Round,?\s*([\d\/]+)/i) || [])[1] || "";
  const isDeclared = statusFromRound(round) === "declared";

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
    candidates.push({
      sn: parseInt(sn, 10),
      name: candName,
      party: lp.short,
      partyFull: party,
      alliance: lp.alliance,
      evm, postal, total, pct,
    });
  });

  candidates.sort((a, b) => b.total - a.total);

  // Compute margin from top-2 candidates
  const margin = candidates.length >= 2
    ? Math.max(0, candidates[0].total - candidates[1].total)
    : 0;

  return {
    no, name, round,
    isDeclared,
    candidates,
    totalVotes:     candidates.reduce((s, c) => s + c.total, 0),
    margin,
    marginVerified: margin > 0,
    updatedAt:      new Date().toISOString(),
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
      "https://tnvote.live", "https://www.tnvote.live",
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
        if (cached && now - cached.at < CACHE_MS) {
          res.json({ ...cached.data, _cached:true });
          return;
        }
        const data = await fetchConstituency(ac);
        if (data.candidates && data.candidates.length) {
          acCache.set(ac, { at: now, data });
        }
        res.json(data);
        return;
      }

      if (summaryCache.data && now - summaryCache.at < CACHE_MS) {
        res.json({ ...summaryCache.data, _cached:true });
        return;
      }

      const parsed = await fetchStatewise();
      const hasData = parsed.constituencies.length > 0 ||
        parsed.alliances.some(a => a.won + a.leading > 0);

      if (hasData) {
        summaryCache = { at: now, data: parsed };
        res.json(parsed);
      } else {
        res.json({
          mode: MODE, label: TARGET.label,
          updatedAt: new Date().toISOString(),
          totals: {
            declared:0, leading:0, pending:TARGET.totalSeats,
            total: TARGET.totalSeats, reported:0,
          },
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
