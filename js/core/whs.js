/* Club.whs: World Handicap System maths and the course data it needs (pure, apart from reading the 'holes'
   collection). Moved out of js/portal/scores.js unchanged so the live scorecard (js/shared/play-data.js) can use the
   same course handicap and strokes-received rules on all three sites; js/portal/scores.js reads it from here.

   There are no course or slope ratings for this course in the data: anything that needs them uses DEMO_RATINGS below
   and is marked as demo in the UI. */
(function () {
  'use strict';
  window.Club = window.Club || {};

  const DEMO_RATINGS = { /* placeholder values for the demo only, replace with the club's official ratings */
    black: { rating: 70.0, slope: 125 },
    green: { rating: 69.0, slope: 122 },
    silver: { rating: 67.0, slope: 117 }
    /* A nine-hole round uses half the 18-hole rating with the same slope: also a placeholder. */
  };
  const TEES = [{ id: 'black', label: 'Black' }, { id: 'green', label: 'Green' }, { id: 'silver', label: 'Silver' }];
  /* How many of the most recent differentials count, and the adjustment, by number of scores. */
  const WHS_TABLE = { 3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0], 9: [3, 0], 10: [3, 0], 11: [3, 0],
    12: [4, 0], 13: [4, 0], 14: [4, 0], 15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0], 19: [7, 0], 20: [8, 0] };

  function round1(x) { return Math.round(x * 10 + 1e-9) / 10; }   /* nearest tenth; the epsilon keeps 6.95 from floating down to 6.9 */
  function whsRound(x) { return Math.floor(x + 0.5); }                /* whole numbers, .5 rounds up */
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function holesAll() { return Club.store.all('holes').slice().sort(function (a, b) { return a.number - b.number; }); }
  function holesFor(n, nine) { const hs = holesAll(); return +n === 9 ? (nine === 'back' ? hs.slice(9, 18) : hs.slice(0, 9)) : hs; }
  function parOf(hs) { return sum(hs.map(function (h) { return h.par; })); }
  function yardsOf(hs, tee) { return sum(hs.map(function (h) { return (h.yards || {})[tee]; })); }
  function teeLabel(id) { return (TEES.find(function (t) { return t.id === id; }) || { label: id }).label; }
  function ratingFor(tee, n) {
    const r = DEMO_RATINGS[tee] || DEMO_RATINGS.green;
    return +n === 9 ? { rating: round1(r.rating / 2), slope: r.slope } : { rating: r.rating, slope: r.slope };
  }
  /** Course handicap = Handicap Index x (Slope / 113) + (Course rating - Par); nine holes use half the index. */
  function courseHandicap(index, tee, n, nine) {
    if (index == null) return 0;
    const r = ratingFor(tee, n);
    return whsRound((+n === 9 ? index / 2 : index) * r.slope / 113 + (r.rating - parOf(holesFor(n, nine))));
  }
  /** Strokes received on each hole: the course handicap spread by stroke index (hardest first); a plus handicap gives
      strokes back from the easiest hole. Nine-hole rounds rank the nine holes' own stroke indexes. */
  function strokesPerHole(hs, ch) {
    const n = hs.length, out = hs.map(function () { return 0; });
    const order = hs.map(function (h, i) { return i; }).sort(function (a, b) { return hs[a].handicap - hs[b].handicap; });
    const a = Math.abs(ch), base = Math.floor(a / n), extra = a % n;
    order.forEach(function (idx, rank) { out[idx] = ch >= 0 ? base + (rank < extra ? 1 : 0) : -(base + (rank >= n - extra ? 1 : 0)); });
    return out;
  }
  /** Net double bogey on each hole: par + 2 + strokes received. */
  function ndbCaps(hs, ch) { const s = strokesPerHole(hs, ch); return hs.map(function (h, i) { return h.par + 2 + s[i]; }); }
  function adjustedOf(scores, caps) { return sum(scores.map(function (v, i) { return Math.min(v, caps[i]); })); }
  /** Expected nine-hole differential added to a nine-hole score (WHS 2024), using the index at the time. */
  function expected9(index) { return (index == null ? 0 : index) * 0.52 + 1.2; }
  /** Score differential = (113 / Slope) x (Adjusted gross - Course rating - PCC). PCC is Golf Canada's; 0 here. */
  function differential(ags, tee, n, index) {
    const r = ratingFor(tee, n);
    const d = (113 / r.slope) * (ags - r.rating);
    return round1(+n === 9 ? d + expected9(index) : d);
  }
  /** WHS index from differentials (newest first): the lowest N of the last 20 (8 of 20 once there are 20). */
  function estimate(diffs) {
    const recent = diffs.slice(0, 20), n = recent.length, t = WHS_TABLE[n];
    if (!t) return null;
    const best = recent.slice().sort(function (a, b) { return a - b; }).slice(0, t[0]);
    return { index: Math.min(54, round1(sum(best) / t[0] + t[1])), used: t[0], of: n, adjust: t[1], best: best };
  }

  Club.whs = {
    DEMO_RATINGS: DEMO_RATINGS, TEES: TEES, WHS_TABLE: WHS_TABLE,
    round1: round1, whsRound: whsRound, sum: sum, holesAll: holesAll, holesFor: holesFor, parOf: parOf, yardsOf: yardsOf, teeLabel: teeLabel,
    ratingFor: ratingFor, courseHandicap: courseHandicap, strokesPerHole: strokesPerHole, ndbCaps: ndbCaps, adjustedOf: adjustedOf,
    expected9: expected9, differential: differential, estimate: estimate
  };
})();
