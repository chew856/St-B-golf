/* DEMO SEED (made up): posted rounds for about twenty demo members, so the staff Leaderboard
   (js/modules/reports-leaderboard.js) has a season of scores to rank. Nothing here is a real golfer's score.

   Loaded by all three pages. Runs once per browser: the 'demoBackfills' marker 'leaderboard1' keeps it from coming
   back. Every round is a 'scorePosts' document in the shape js/portal/scores.js writes, tagged demo: true, seed: true
   and lb: 1, with ids sp_lb_<member no>_<n>. The rounds carry no tee time and no friends league, so tee sheets, league
   standings, handicaps, handicap history and charges are untouched. The demo member (mem_1003) gets none.

   What is planted on purpose: one hole in one, seven eagles, three total-only posts, nine-hole rounds for a few
   members, and a posted score on the day of a finished tournament for two members who played in it (the Leaderboard
   counts that round once, from the tournament card).

   Order matters on the members' portal. Its own score seeds (js/portal/scores.js) only run on an empty collection and
   skip friends who already have rounds, so there these rounds are added after the portal's scripts have run. In a
   browser that opened the staff page first the rounds are already on file: they step aside while the portal seeds run
   and are put back straight after. Either way a browser ends with the same rounds. */
(function () {
  'use strict';
  const S = window.Club && Club.store;
  if (!S) return;
  const MARK = 'leaderboard1', R = S.R;
  /* The portal's placeholder course ratings (DEMO_RATINGS in js/portal/scores.js), so these posts read the same there.
     Not the club's official ratings. [course rating, slope] */
  const RATINGS = { black: [70.0, 125], green: [69.0, 122], silver: [67.0, 117] };
  /* [member no, rounds, tees in turn (b black, g green, s silver), every Nth round is nine holes (0 = never)] */
  const PLAN = [
    [1015, 24, 'bgb', 0], [1038, 21, 'bbg', 0], [1021, 18, 'gb', 0], [1033, 16, 'g', 0], [1027, 15, 'gbg', 0],
    [1022, 14, 'g', 5], [1029, 13, 'ggb', 0], [1030, 13, 'gs', 4], [1017, 12, 'g', 0], [1035, 12, 'g', 3],
    [1024, 11, 'gs', 0], [1013, 10, 'g', 4],
    /* under ten rounds: the "Not yet qualified" list (1026 reaches ten with a tournament round) */
    [1026, 9, 'g', 0], [1019, 9, 'g', 4], [1050, 8, 's', 3], [1044, 7, 'b', 0], [1045, 6, 'g', 3], [1039, 5, 'g', 0],
    [1047, 4, 'gs', 0], [1055, 3, 'g', 0], [1061, 2, 's', 0]
  ];
  const TOTAL_ONLY = { '1030:2': 1, '1013:6': 1, '1055:1': 1 };          /* member no : round, posted as a total */
  /* member no : round -> [hole, score]. Eagles on par 5s and one on the short par 4 seventh; the hole in one is on 5. */
  const PLANT = { '1015:6': [9, 3], '1038:3': [7, 2], '1038:12': [13, 3], '1021:9': [11, 3], '1033:4': [17, 3], '1017:8': [11, 3],
    '1044:2': [9, 3], '1022:7': [5, 1] };
  const TRN_POSTS = [1017, 1024];                                         /* also posted their tournament round */
  const TEE = { b: 'black', g: 'green', s: 'silver' };

  function round1(x) { return Math.round(x * 10 + 1e-9) / 10; }
  function sum(a) { return a.reduce(function (t, v) { return t + v; }, 0); }
  function mine(p) { return !!p && p.lb === 1 && p.seed === true; }
  function strokes(hs, ch) {   /* handicap strokes by stroke index; a plus handicap gives back from the easiest hole */
    const n = hs.length, order = hs.map(function (h, i) { return i; }).sort(function (a, b) { return hs[a].handicap - hs[b].handicap; });
    const a = Math.abs(ch), base = Math.floor(a / n), extra = a % n, out = [];
    order.forEach(function (idx, rank) { out[idx] = ch >= 0 ? base + (rank < extra ? 1 : 0) : -(base + (rank >= n - extra ? 1 : 0)); });
    return out;
  }
  /** One hole for a golfer who averages e strokes over par a hole: a birdie at best, a triple bogey at worst. */
  function holeScore(par, e) {
    const pB = Math.max(0.012, 0.13 - 0.1 * e), pD = Math.max(0.01, 0.02 + 0.2 * e), pT = Math.max(0, 0.16 * (e - 0.45));
    const pBg = Math.max(0.03, e + pB - 2 * pD - 3 * pT), x = R.rand();
    return par + (x < pB ? -1 : x < pB + pBg ? 1 : x < pB + pBg + pD ? 2 : x < pB + pBg + pD + pT ? 3 : 0);
  }

  function build() {
    const all18 = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    if (all18.length !== 18) return [];
    const today = Club.date.today(), y = +today.slice(0, 4) - (+today.slice(5, 7) >= 7 ? 0 : 1);   /* the season on file */
    const start = y + '-04-18', last = Club.date.addDays(today, -1), end = last < y + '-11-15' ? last : y + '-11-15';
    const span = Math.round((Club.fmt.toDate(end) - Club.fmt.toDate(start)) / 86400000);
    if (span < 1) return [];
    const hist = S.all('handicapHistory');
    const indexOn = function (m, date) {
      const h = hist.filter(function (x) { return x.memberId === m.id && typeof x.index === 'number' && x.date <= date; }).sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
      return h ? h.index : m.handicap;
    };
    /* Finished tournament cards: seeded rounds keep off those days, apart from the two posted on purpose. */
    const cards = {};
    S.all('tournaments').forEach(function (t) {
      if (t.status !== 'final' || !t.date || t.date > last) return;
      (t.field || []).forEach(function (p) { if ((p.scores || []).length === 18 && p.scores.every(function (v) { return v != null; })) cards[p.memberId + '|' + t.date] = p.scores.slice(); });
    });
    const people = PLAN.map(function (p) { return S.find('members', 'mem_' + p[0]); });
    const out = [];
    function post(m, id, date, n, nine, tee, scores, totalOnly, attest) {
      const hs = n === 9 ? (nine === 'back' ? all18.slice(9) : all18.slice(0, 9)) : all18, par = sum(hs.map(function (h) { return h.par; }));
      const idx = indexOn(m, date), rt = RATINGS[tee], rating = n === 9 ? round1(rt[0] / 2) : rt[0];
      const ch = Math.floor((n === 9 ? idx / 2 : idx) * rt[1] / 113 + (rating - par) + 0.5), st = strokes(hs, ch);
      const gross = sum(scores), ags = sum(scores.map(function (v, i) { return Math.min(v, hs[i].par + 2 + st[i]); }));
      out.push({
        id: id, memberId: m.id, date: date, time: null, teeTimeId: null, holes: n, nine: n === 9 ? nine : null, tees: tee,
        entry: totalOnly ? 'total' : 'hole', holeScores: totalOnly ? null : scores, gross: totalOnly ? ags : gross, adjusted: ags,
        courseHandicap: ch, indexUsed: idx, rating: rating, slope: rt[1], par: par, pcc: null,
        differential: round1((113 / rt[1]) * (ags - rating) + (n === 9 ? idx * 0.52 + 1.2 : 0)), attestedBy: attest ? attest.id : null,
        playedWith: attest ? [attest.firstName + ' ' + attest.lastName] : [], estimate: null, status: 'saved-in-demo',
        postedAt: date + 'T19:10:00', demo: true, seed: true, lb: 1
      });
    }
    R.reseed(6116);
    PLAN.forEach(function (p, k) {
      const m = people[k];
      if (!m || m.handicap == null || m.id === S.DEMO_MEMBER) return;
      const slot = span / p[1];
      for (let i = 0; i < p[1]; i++) {
        let date = Club.date.addDays(start, Math.floor(i * slot + R.rand() * slot * 0.8));
        if (cards[m.id + '|' + date]) date = Club.date.addDays(date, -1);
        const n = p[3] && i % p[3] === p[3] - 1 ? 9 : 18, nine = n === 9 ? (i % 2 ? 'back' : 'front') : null;
        const hs = n === 9 ? (nine === 'back' ? all18.slice(9) : all18.slice(0, 9)) : all18;
        const form = (R.rand() + R.rand() - 1) * 4.5;                                   /* a good day or a bad one */
        const e = (indexOn(m, date) * 1.08 + 1.2 + form) / 18;
        const scores = hs.map(function (h) { return holeScore(h.par, Math.min(1.7, e + (9.5 - h.handicap) / 17 * 0.25)); });
        const plant = PLANT[p[0] + ':' + i];
        if (plant && n === 18) scores[plant[0] - 1] = plant[1];
        const other = people[(k + 1 + R.int(0, PLAN.length - 2)) % PLAN.length];
        post(m, 'sp_lb_' + p[0] + '_' + (i + 1), date, n, nine, TEE[p[2].charAt(i % p[2].length)], scores, !!TOTAL_ONLY[p[0] + ':' + i], R.chance(0.55) && other && other.id !== m.id ? other : null);
      }
    });
    /* Two members also posted the round they played in a finished tournament (the same card, on the same day). */
    TRN_POSTS.forEach(function (no) {
      const m = S.find('members', 'mem_' + no); if (!m || m.handicap == null) return;
      const key = Object.keys(cards).filter(function (c) { return c.indexOf(m.id + '|') === 0; }).sort().pop();
      if (key) post(m, 'sp_lb_' + no + '_t1', key.split('|')[1], 18, null, 'green', cards[key], false, null);
    });
    return out;
  }

  /* On the portal: let its own score seeds run first (see the header). */
  const portal = !!(document.body && document.body.classList.contains('portal'));
  let aside = null;
  if (portal && S.find('demoBackfills', MARK) && !S.find('demoBackfills', 'friendRounds') && S.find('members', S.DEMO_MEMBER || 'mem_1003')) {
    const posts = S.all('scorePosts');
    if (posts.some(mine)) { aside = posts.filter(mine); S.replace('scorePosts', posts.filter(function (p) { return !mine(p); })); }
  }
  function run() {
    if (aside) { aside.forEach(function (d) { if (!S.find('scorePosts', d.id)) S.insert('scorePosts', d); }); aside = null; }
    if (S.find('demoBackfills', MARK)) return;
    const docs = build().filter(function (d) { return !S.find('scorePosts', d.id); });
    if (!docs.length) return;                                   /* no scorecard or members on file yet: try again next time */
    docs.forEach(function (d) { S.insert('scorePosts', d); });
    const who = {}; docs.forEach(function (d) { who[d.memberId] = 1; });
    S.insert('demoBackfills', { id: MARK, at: new Date().toISOString(), posts: docs.length, members: Object.keys(who).length });
  }
  if (portal && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else if (portal) setTimeout(run, 0);
  else run();
})();
