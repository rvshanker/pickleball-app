/**
 * PickleConnect — League & Tournament scheduler
 * Pure functions (no DOM). Used by events.html and testable in Node.
 *
 * Formats
 *   rotating — doubles, new partner every game (players are the units)
 *   fixed    — doubles with set teams (teams are the units)
 *   singles  — one vs one (players are the units)
 *
 * Any number of players/teams, courts and games.
 *
 * Rotating goals, in priority order:
 *   1. Never repeat a partner within the same session (hard rule while possible).
 *   2. Spread partners across the season — prefer people you've partnered least.
 *   3. Spread opponents — tonight first, season second.
 *   4. Sit-outs rotate fairly (late arrivals play first).
 * Singles / fixed teams goals:
 *   1. Never face the same opponent twice in a session while possible (true round robin).
 *   2. Spread opponents across the season.
 *   3. Sit-outs / byes rotate fairly.
 */
(function (root) {
    'use strict';

    const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const get = (m, a, b) => m[key(a, b)] || 0;
    const bump = (m, a, b) => { const k = key(a, b); m[k] = (m[k] || 0) + 1; };

    function shuffle(arr, rnd) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    const W = { nightPartner: 1e6, seasonPartner: 120, nightOpp: 40, seasonOpp: 4, noise: 30,
                unitNightOpp: 1e6, unitSeasonOpp: 60, unitNoise: 20 };

    /** Rotating-doubles history (partners / opponents / sit-outs by player) from existing sessions. */
    function buildHistory(weeks, excludeWeekId) {
        const h = { partner: {}, opp: {}, sit: {} };
        (weeks || []).forEach(w => {
            if (w.id === excludeWeekId) return;
            (w.rounds || []).forEach(r => {
                (r.matches || []).forEach(m => {
                    if (m.team1.length === 2) bump(h.partner, m.team1[0], m.team1[1]);
                    if (m.team2.length === 2) bump(h.partner, m.team2[0], m.team2[1]);
                    m.team1.forEach(x => m.team2.forEach(y => bump(h.opp, x, y)));
                });
                (r.sitOut || []).forEach(p => { h.sit[p] = (h.sit[p] || 0) + 1; });
            });
        });
        return h;
    }

    /** Singles / fixed-team history keyed by unit id (match.u1 / match.u2, sitOutUnits). */
    function buildUnitHistory(weeks, excludeWeekId) {
        const h = { opp: {}, sit: {} };
        (weeks || []).forEach(w => {
            if (w.id === excludeWeekId) return;
            (w.rounds || []).forEach(r => {
                (r.matches || []).forEach(m => { if (m.u1 && m.u2) bump(h.opp, m.u1, m.u2); });
                (r.sitOutUnits || []).forEach(u => { h.sit[u] = (h.sit[u] || 0) + 1; });
            });
        });
        return h;
    }

    /** All ways to split 2k pairs into k games — only used for k ≤ 5 (945 ways). */
    function groupings(n) {
        const out = [];
        const rec = (left, acc) => {
            if (!left.length) { out.push(acc); return; }
            const [first, ...rest] = left;
            for (let i = 0; i < rest.length; i++) rec(rest.filter((_, j) => j !== i), acc.concat([[first, rest[i]]]));
        };
        rec([...Array(n).keys()], []);
        return out;
    }
    const groupCache = {};
    const getGroupings = n => (groupCache[n] = groupCache[n] || groupings(n));

    /**
     * Pair items up with a depth-first search that tries the cheapest match first and,
     * in strict mode, never uses a pair marked in `forbid`. Falls back to non-strict.
     */
    function pairUp(items, cost, forbid, rnd) {
        const order = shuffle(items, rnd);
        const used = new Set();
        const pairs = [];
        let steps = 0;
        function dfs(strict) {
            if (++steps > 20000) return false;
            const a = order.find(p => !used.has(p));
            if (a === undefined) return true;
            used.add(a);
            const cands = order
                .filter(p => !used.has(p) && (!strict || !forbid(a, p)))
                .map(p => ({ p, c: cost(a, p) }))
                .sort((x, y) => x.c - y.c);
            for (const { p } of cands) {
                used.add(p); pairs.push([a, p]);
                if (dfs(strict)) return true;
                used.delete(p); pairs.pop();
            }
            used.delete(a);
            return false;
        }
        if (dfs(true)) return pairs;
        used.clear(); pairs.length = 0; steps = 0;
        dfs(false);
        return pairs;
    }

    // Who sits: most games already this session (so late arrivals play first),
    // then fewest sit-outs this session, then fewest this season, then random.
    function pickSitters(ids, count, nightGames, nightSit, seasonSit, rnd) {
        if (count <= 0) return [];
        return shuffle(ids, rnd).sort((x, y) =>
            (nightGames[y] || 0) - (nightGames[x] || 0) ||
            (nightSit[x] || 0) - (nightSit[y] || 0) || (seasonSit[x] || 0) - (seasonSit[y] || 0)).slice(0, count);
    }

    /**
     * Rotating partners doubles.
     * @returns {{rounds:[{matches:[{court,team1,team2}],sitOut:[]}], stats:{repeatPartners}}}
     */
    function generateRotating(playerIds, courts, numRounds, history, opts) {
        opts = opts || {};
        const rnd = opts.random || Math.random;
        const hist = history || { partner: {}, opp: {}, sit: {} };
        const courtsUsed = Math.min(courts.length, Math.floor(playerIds.length / 4));
        if (courtsUsed < 1) throw new Error('Need at least 4 players and 1 court');
        const slots = courtsUsed * 4;
        const exhaustive = courtsUsed <= 5;
        const groups = exhaustive ? getGroupings(courtsUsed * 2) : null;
        const heavy = courtsUsed > 3;
        const attempts = opts.attempts || (heavy ? 8 : 30);
        const samples = opts.samples || (heavy ? 12 : 40);
        const prior = opts.priorRounds || [];

        let best = null;
        for (let a = 0; a < attempts; a++) {
            const nightPartner = {}, nightOpp = {}, nightSit = {}, nightGames = {};
            prior.forEach(r => {
                (r.matches || []).forEach(m => {
                    bump(nightPartner, m.team1[0], m.team1[1]);
                    bump(nightPartner, m.team2[0], m.team2[1]);
                    m.team1.forEach(x => m.team2.forEach(y => bump(nightOpp, x, y)));
                    [...m.team1, ...m.team2].forEach(p => { nightGames[p] = (nightGames[p] || 0) + 1; });
                });
                (r.sitOut || []).forEach(p => { nightSit[p] = (nightSit[p] || 0) + 1; });
            });
            const rounds = [];
            let total = 0;
            for (let r = 0; r < numRounds; r++) {
                const sitOut = pickSitters(playerIds, playerIds.length - slots, nightGames, nightSit, hist.sit, rnd);
                const playing = playerIds.filter(p => !sitOut.includes(p));
                const pairCost = (x, y) => get(nightPartner, x, y) * W.nightPartner + Math.pow(get(hist.partner, x, y), 2) * W.seasonPartner + rnd() * W.noise;
                const oppCost = (x, y) => { const n = get(nightOpp, x, y); return n * n * W.nightOpp + get(hist.opp, x, y) * W.seasonOpp; };
                const teamVs = (A, B) => oppCost(A[0], B[0]) + oppCost(A[0], B[1]) + oppCost(A[1], B[0]) + oppCost(A[1], B[1]);

                let bestRound = null;
                for (let s = 0; s < samples; s++) {
                    const pairs = pairUp(playing, pairCost, (x, y) => get(nightPartner, x, y) > 0, rnd);
                    let pc = 0;
                    pairs.forEach(([x, y]) => { pc += get(nightPartner, x, y) * W.nightPartner + Math.pow(get(hist.partner, x, y), 2) * W.seasonPartner; });
                    if (exhaustive) {
                        for (const g of groups) {
                            let oc = pc;
                            for (const [i, j] of g) oc += teamVs(pairs[i], pairs[j]);
                            oc += rnd() * W.noise;
                            if (!bestRound || oc < bestRound.cost) bestRound = { cost: oc, pairs, g };
                        }
                    } else {
                        // Many courts: match the pairs against each other with the same search
                        const idx = pairs.map((_, i) => i);
                        const g = pairUp(idx, (i, j) => teamVs(pairs[i], pairs[j]) + rnd() * W.noise, () => false, rnd);
                        let oc = pc; g.forEach(([i, j]) => { oc += teamVs(pairs[i], pairs[j]); });
                        if (!bestRound || oc < bestRound.cost) bestRound = { cost: oc, pairs, g };
                    }
                }
                const courtOrder = shuffle(courts.slice(0, courtsUsed), rnd);
                const matches = bestRound.g.map(([i, j], k) => ({ court: courtOrder[k], team1: bestRound.pairs[i].slice(), team2: bestRound.pairs[j].slice() }));
                matches.sort((m1, m2) => courts.indexOf(m1.court) - courts.indexOf(m2.court));
                matches.forEach(m => {
                    bump(nightPartner, m.team1[0], m.team1[1]);
                    bump(nightPartner, m.team2[0], m.team2[1]);
                    m.team1.forEach(x => m.team2.forEach(y => bump(nightOpp, x, y)));
                    [...m.team1, ...m.team2].forEach(p => { nightGames[p] = (nightGames[p] || 0) + 1; });
                });
                sitOut.forEach(p => { nightSit[p] = (nightSit[p] || 0) + 1; });
                total += bestRound.cost;
                rounds.push({ matches, sitOut });
            }
            if (!best || total < best.total) best = { total, rounds, nightPartner };
        }
        let repeatPartners = 0;
        Object.values(best.nightPartner).forEach(c => { if (c > 1) repeatPartners += c - 1; });
        return { rounds: best.rounds, stats: { repeatPartners } };
    }

    /** Classic circle-method round robin (random seating), used when everyone fits on court. */
    function circleRounds(units, numRounds, rnd) {
        const list = shuffle(units, rnd);
        if (list.length % 2) list.push(null); // bye
        const n = list.length, out = [];
        for (let r = 0; r < numRounds; r++) {
            const pairs = [], bye = [];
            for (let i = 0; i < n / 2; i++) {
                const a = list[i], b = list[n - 1 - i];
                if (a === null) bye.push(b); else if (b === null) bye.push(a); else pairs.push([a, b]);
            }
            out.push({ pairs, bye });
            list.splice(1, 0, list.pop()); // rotate everyone except the first seat
        }
        return out;
    }

    /**
     * Singles or fixed teams: each unit (player or team) plays one other unit per game.
     * @returns {{rounds:[{matches:[{court,u1,u2}],sitOutUnits:[]}], stats:{repeatOpponents}}}
     */
    function generateMatchups(units, courts, numRounds, history, opts) {
        opts = opts || {};
        const rnd = opts.random || Math.random;
        const hist = history || { opp: {}, sit: {} };
        const courtsUsed = Math.min(courts.length, Math.floor(units.length / 2));
        if (courtsUsed < 1) throw new Error('Need at least 2 and 1 court');
        const slots = courtsUsed * 2;
        const prior = opts.priorRounds || [];
        const attempts = opts.attempts || 30;
        // Everyone (except an odd one out) is on court every game → a true round robin is possible
        const everyoneFits = slots >= units.length - (units.length % 2);

        const seed = () => {
            const nightOpp = {}, nightSit = {}, nightGames = {};
            prior.forEach(r => {
                (r.matches || []).forEach(m => { bump(nightOpp, m.u1, m.u2); nightGames[m.u1] = (nightGames[m.u1] || 0) + 1; nightGames[m.u2] = (nightGames[m.u2] || 0) + 1; });
                (r.sitOutUnits || []).forEach(u => { nightSit[u] = (nightSit[u] || 0) + 1; });
            });
            return { nightOpp, nightSit, nightGames };
        };
        const costOf = (nightOpp, x, y) => get(nightOpp, x, y) * W.unitNightOpp + Math.pow(get(hist.opp, x, y), 2) * W.unitSeasonOpp;
        const toRound = (pairs, sitOutUnits) => {
            const courtOrder = shuffle(courts.slice(0, courtsUsed), rnd);
            const matches = pairs.map(([x, y], k) => ({ court: courtOrder[k], u1: x, u2: y }));
            matches.sort((m1, m2) => courts.indexOf(m1.court) - courts.indexOf(m2.court));
            return { matches, sitOutUnits };
        };

        let best = null;
        // Candidate 1: circle method (perfect round robin) when no games are kept and everyone fits
        if (everyoneFits && !prior.length) {
            for (let a = 0; a < 6; a++) {
                const { nightOpp } = seed(); let total = 0;
                const rounds = circleRounds(units, numRounds, rnd).map(({ pairs, bye }) => {
                    pairs.forEach(([x, y]) => { total += costOf(nightOpp, x, y); });
                    pairs.forEach(([x, y]) => bump(nightOpp, x, y));
                    return toRound(pairs, bye);
                });
                if (!best || total < best.total) best = { total, rounds };
            }
        }
        // Candidate 2: search (handles sit-outs, kept games and season history)
        for (let a = 0; a < attempts; a++) {
            const { nightOpp, nightSit, nightGames } = seed();
            const rounds = []; let total = 0;
            for (let r = 0; r < numRounds; r++) {
                const sitOutUnits = pickSitters(units, units.length - slots, nightGames, nightSit, hist.sit, rnd);
                const playing = units.filter(u => !sitOutUnits.includes(u));
                const pairs = pairUp(playing, (x, y) => costOf(nightOpp, x, y) + rnd() * W.unitNoise, (x, y) => get(nightOpp, x, y) > 0, rnd);
                pairs.forEach(([x, y]) => { total += costOf(nightOpp, x, y); });
                pairs.forEach(([x, y]) => { bump(nightOpp, x, y); nightGames[x] = (nightGames[x] || 0) + 1; nightGames[y] = (nightGames[y] || 0) + 1; });
                sitOutUnits.forEach(u => { nightSit[u] = (nightSit[u] || 0) + 1; });
                rounds.push(toRound(pairs, sitOutUnits));
            }
            if (!best || total < best.total) best = { total, rounds };
        }
        // Count repeat opponents in this session
        const seen = {}; let repeatOpponents = 0;
        prior.concat(best.rounds).forEach(r => r.matches.forEach(m => { const k = key(m.u1, m.u2); if (seen[k]) repeatOpponents++; seen[k] = 1; }));
        return { rounds: best.rounds, stats: { repeatOpponents } };
    }

    /** Max games in a session with zero repeats (partners for rotating, opponents otherwise). */
    function maxNoRepeatRounds(n) { return n % 2 === 0 ? n - 1 : n; }

    const api = { generateRotating, generateMatchups, buildHistory, buildUnitHistory, maxNoRepeatRounds, _key: key };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EventScheduler = api;
})(typeof window !== 'undefined' ? window : globalThis);
