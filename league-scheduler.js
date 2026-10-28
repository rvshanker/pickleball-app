/**
 * PickleConnect — League doubles scheduler
 * Pure functions (no DOM). Used by league.html and testable in Node.
 *
 * Goals, in priority order:
 *   1. Never repeat a partner within the same night (hard rule while possible).
 *   2. Spread partners across the season — prefer people you've partnered least.
 *   3. Spread opponents — avoid facing the same people again, tonight first, season second.
 *   4. Sit-outs (only when more players than court spots) rotate fairly.
 *   5. Everything else is random, so every week looks different.
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

    // Weights
    const W = {
        nightPartner: 1e6,   // effectively forbidden
        seasonPartner: 120,  // multiplied by count^2 so repeats get steadily more expensive
        nightOpp: 40,        // multiplied by count^2
        seasonOpp: 4,
        noise: 30,           // randomness so equal options are picked at random
    };

    /** Build partner/opponent/sit-out history from existing weeks (schedules only). */
    function buildHistory(weeks, excludeWeekId) {
        const h = { partner: {}, opp: {}, sit: {} };
        (weeks || []).forEach(w => {
            if (w.id === excludeWeekId) return;
            (w.rounds || []).forEach(r => {
                (r.matches || []).forEach(m => {
                    bump(h.partner, m.team1[0], m.team1[1]);
                    bump(h.partner, m.team2[0], m.team2[1]);
                    m.team1.forEach(x => m.team2.forEach(y => bump(h.opp, x, y)));
                });
                (r.sitOut || []).forEach(p => { h.sit[p] = (h.sit[p] || 0) + 1; });
            });
        });
        return h;
    }

    /** All ways to split 2k pairs into k games (k ≤ 6 → at most 10,395). */
    function groupings(n) {
        const out = [];
        const rec = (left, acc) => {
            if (!left.length) { out.push(acc); return; }
            const [first, ...rest] = left;
            for (let i = 0; i < rest.length; i++) {
                rec(rest.filter((_, j) => j !== i), acc.concat([[first, rest[i]]]));
            }
        };
        rec([...Array(n).keys()], []);
        return out;
    }
    const groupCache = {};
    const getGroupings = n => (groupCache[n] = groupCache[n] || groupings(n));

    /**
     * Pair up players: depth-first search that tries the cheapest partners first and
     * never re-uses a partner from tonight. Falls back to allowing repeats only if
     * no repeat-free pairing exists.
     */
    function pairPlayers(players, pairCost, nightPartner, rnd) {
        const order = shuffle(players, rnd);
        const used = new Set();
        const pairs = [];
        let steps = 0;

        function dfs(strict) {
            if (++steps > 20000) return false;
            const a = order.find(p => !used.has(p));
            if (a === undefined) return true;
            used.add(a);
            const cands = order
                .filter(p => !used.has(p) && (!strict || !get(nightPartner, a, p)))
                .map(p => ({ p, c: pairCost(a, p) }))
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

    /**
     * Generate one night.
     * @param {string[]} playerIds  players attending tonight
     * @param {string[]} courts     court labels, e.g. ['4','5','7']
     * @param {number}   numRounds  games per player-slot (rounds)
     * @param {object}   history    from buildHistory()
     * @param {object}   [opts]     { attempts, samples, random, priorRounds }
     * @returns {{rounds: Array, stats: object}}
     */
    function generateNight(playerIds, courts, numRounds, history, opts) {
        opts = opts || {};
        const rnd = opts.random || Math.random;
        const hist = history || { partner: {}, opp: {}, sit: {} };
        const courtsUsed = Math.min(courts.length, Math.floor(playerIds.length / 4));
        if (courtsUsed < 1) throw new Error('Need at least 4 players and 1 court');
        const slots = courtsUsed * 4;
        const groups = getGroupings(courtsUsed * 2);
        // Keep the work roughly constant (~1s) as courts grow
        const big = groups.length > 15;
        const attempts = opts.attempts || (big ? 10 : 30);
        const samples = opts.samples || (big ? 10 : 40);

        let best = null;
        // Games already played tonight (kept when players change mid-night)
        const prior = opts.priorRounds || [];
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
                // Who sits out: most games played tonight (so late arrivals play first),
                // then fewest sit-outs tonight, then fewest this season, then random
                const ranked = shuffle(playerIds, rnd).sort((x, y) =>
                    (nightGames[y] || 0) - (nightGames[x] || 0) ||
                    (nightSit[x] || 0) - (nightSit[y] || 0) || (hist.sit[x] || 0) - (hist.sit[y] || 0));
                const sitCount = playerIds.length - slots;
                const sitOut = sitCount > 0 ? ranked.slice(0, sitCount) : [];
                const playing = playerIds.filter(p => !sitOut.includes(p));

                const pairCost = (x, y) =>
                    get(nightPartner, x, y) * W.nightPartner +
                    Math.pow(get(hist.partner, x, y), 2) * W.seasonPartner +
                    rnd() * W.noise;
                const oppCost = (x, y) => {
                    const n = get(nightOpp, x, y);
                    return n * n * W.nightOpp + get(hist.opp, x, y) * W.seasonOpp;
                };

                let bestRound = null;
                for (let s = 0; s < samples; s++) {
                    const pairs = pairPlayers(playing, pairCost, nightPartner, rnd);
                    let pc = 0;
                    pairs.forEach(([x, y]) => { pc += get(nightPartner, x, y) * W.nightPartner + Math.pow(get(hist.partner, x, y), 2) * W.seasonPartner; });
                    for (const g of groups) {
                        let oc = pc;
                        for (const [i, j] of g) {
                            const A = pairs[i], B = pairs[j];
                            oc += oppCost(A[0], B[0]) + oppCost(A[0], B[1]) + oppCost(A[1], B[0]) + oppCost(A[1], B[1]);
                        }
                        oc += rnd() * W.noise;
                        if (!bestRound || oc < bestRound.cost) bestRound = { cost: oc, pairs, g };
                    }
                }

                // Assign games to courts in random order
                const courtOrder = shuffle(courts.slice(0, courtsUsed), rnd);
                const matches = bestRound.g.map(([i, j], idx) => ({
                    court: courtOrder[idx],
                    team1: bestRound.pairs[i].slice(),
                    team2: bestRound.pairs[j].slice(),
                }));
                // Sort by court label so the list reads naturally (4, 5, 7)
                matches.sort((m1, m2) => courts.indexOf(m1.court) - courts.indexOf(m2.court));

                // Commit tonight's counts
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

        // Stats for display
        let repeatPartners = 0;
        Object.values(best.nightPartner).forEach(c => { if (c > 1) repeatPartners += c - 1; });
        return { rounds: best.rounds, stats: { repeatPartners } };
    }

    /** Max rounds a night can have with zero repeat partners. */
    function maxNoRepeatRounds(numPlayers) {
        return numPlayers % 2 === 0 ? numPlayers - 1 : numPlayers;
    }

    const api = { generateNight, buildHistory, maxNoRepeatRounds, _key: key };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LeagueScheduler = api;
})(typeof window !== 'undefined' ? window : globalThis);
