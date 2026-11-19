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
        const form = (R.rand() + R.rand() - 1) * 3.2;                                   /* a good day or a bad one */
        const e = Math.max(-0.03, (indexOn(m, date) * 1.08 + 1.2 + form) / 18);
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
    const done = S.find('demoBackfills', MARK);
    if (done && S.all('scorePosts').some(mine)) return;         /* (a marker with no rounds left: the page closed mid-way; put them back) */
    const docs = build().filter(function (d) { return !S.find('scorePosts', d.id); });
    if (!docs.length) return;                                   /* no scorecard or members on file yet: try again next time */
    docs.forEach(function (d) { S.insert('scorePosts', d); });
    const who = {}; docs.forEach(function (d) { who[d.memberId] = 1; });
    if (!done) S.insert('demoBackfills', { id: MARK, at: new Date().toISOString(), posts: docs.length, members: Object.keys(who).length });
  }
  if (portal && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else if (portal) setTimeout(run, 0);
  else run();
})();

/* Club.leaderboard: the board maths shared by the staff Leaderboard (js/modules/reports-leaderboard.js) and the
   members' Leaderboards page (js/portal/leaderboards.js), so both rank on the same rounds with the same rules.

   A round is (a) a score post (collection scorePosts), attested or not, or (b) a tournament card entered by staff
   (tournaments[].field[], status final or live) with all 18 holes in. A member who also posted a score on the day of a
   tournament round is counted once, from the tournament card. A golfer qualifies with `min` rounds in the period
   (MIN, 10, unless the members' view sets its own). Net = gross less the course handicap (the one saved with a post,
   or for a tournament card the one Club.shared.events.courseHcp works out). Par and stroke index come from 'holes'.

   Club.leaderboard.compute(from, to, min)   -> { rounds, byKey, golfers, byId, records, once, qual, unq, tot }
   Club.leaderboard.BOARDS[key]              -> { set, by, desc, has(g), val(g), date(g)? } (how a board ranks)
   Club.leaderboard.ranked(d, key, keep)     -> qualified golfers on a board, best first, { g, v, pos }; equal values
                                                share a place. keep(g): leave golfers out first (the places close up).

   Members' view (staff choose it on the staff Leaderboard; stored as getObj('memberLeaderboard')):
   settings(), DEFAULTS, save(next), MEMBER_BOARDS, period(kind), defaultPeriod(settings), visible(g), memberBoard(o). */
(function () {
  'use strict';
  const S = window.Club && Club.store;
  if (!S) return;
  const MIN = 10;

  function EV() { return (Club.shared && Club.shared.events) || {}; }
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function r1(x) { return Math.round(x * 10 + 1e-9) / 10; }
  function holes18() {
    const hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    return hs.length === 18 ? hs : (EV().holeList ? EV().holeList() : []);
  }

  /* ---------------- The rounds, golfers and hole records of a period ---------------- */
  function compute(from, to, min) {
    min = min > 0 ? +min : MIN;
    const inR = function (d) { return d && d >= from && d <= to; };
    const hs18 = holes18(), rounds = [], byKey = {};
    const part = function (n, nine) { return n === 9 ? (nine === 'back' ? hs18.slice(9) : hs18.slice(0, 9)) : hs18; };
    S.all('scorePosts').forEach(function (p) {
      if (!p || !p.memberId || !inR(p.date) || typeof p.gross !== 'number') return;
      const n = +p.holes === 9 ? 9 : 18, hs = part(n, p.nine), ch = +p.courseHandicap || 0;
      const sc = p.entry === 'hole' && Array.isArray(p.holeScores) && hs.length && p.holeScores.length === hs.length ? p.holeScores : null;
      rounds.push({ key: 'p:' + p.id, kind: 'post', mid: p.memberId, date: p.date, n: n, nine: n === 9 ? (p.nine === 'back' ? 'back' : 'front') : null, tees: p.tees,
        gross: p.gross, ch: ch, net: p.gross - ch, scores: sc, hs: hs, attestedBy: p.attestedBy || null, index: typeof p.indexUsed === 'number' ? p.indexUsed : null });
    });
    let once = 0;
    S.all('tournaments').forEach(function (t) {
      if (!t || (t.status !== 'final' && t.status !== 'live') || !inR(t.date) || hs18.length !== 18) return;
      (t.field || []).forEach(function (p) {
        if (!p || !p.memberId || !Array.isArray(p.scores) || p.scores.length < 18) return;
        const card = p.scores.slice(0, 18);
        if (card.some(function (v) { return v == null; })) return;             /* a round counts when all 18 holes are in */
        const gross = sum(card), ch = EV().courseHcp ? EV().courseHcp(p.handicap, hs18) : 0;
        /* The member's own post of the same day: counted once, from the tournament card */
        const same = rounds.filter(function (r) { return r.kind === 'post' && r.mid === p.memberId && r.date === t.date && r.n === 18; });
        const dup = same.filter(function (r) { return r.gross === gross; })[0] || same[0];
        if (dup) { rounds.splice(rounds.indexOf(dup), 1); once++; }
        rounds.push({ key: 't:' + t.id + ':' + p.memberId, kind: 'trn', mid: p.memberId, date: t.date, n: 18, nine: null, tees: (EV().COURSE || {}).tee || 'green', name: t.name || 'Tournament',
          gross: gross, ch: ch, net: gross - ch, scores: card, hs: hs18, attestedBy: null, index: typeof p.handicap === 'number' ? p.handicap : null });
      });
    });
    rounds.forEach(function (r) {
      r.birdies = 0; r.eagles = 0; r.aces = 0; byKey[r.key] = r;
      if (!r.scores) return;
      r.scores.forEach(function (v, i) {
        const par = r.hs[i].par;
        if (v === 1) r.aces++;                                   /* a hole in one counts as a hole in one and as an eagle */
        if (v <= par - 2) r.eagles++; else if (v === par - 1) r.birdies++;
      });
    });

    const hist = S.all('handicapHistory'), map = {};
    rounds.forEach(function (r) { (map[r.mid] = map[r.mid] || { id: r.mid, rounds: [] }).rounds.push(r); });
    const best = function (list, f) { return list.slice().sort(function (a, b) { return f(a) - f(b) || a.date.localeCompare(b.date); })[0] || null; };
    const gross = function (r) { return r.gross; }, net = function (r) { return r.net; };
    const golfers = Object.keys(map).map(function (id) {
      const g = map[id];
      g.m = Club.members.get(id); g.name = g.m ? Club.members.name(g.m) : 'Former member';
      g.rounds.sort(function (a, b) { return b.date.localeCompare(a.date); });
      g.n = g.rounds.length; g.q = g.n >= min;
      g.r18 = g.rounds.filter(function (r) { return r.n === 18; }); g.r9 = g.rounds.filter(function (r) { return r.n === 9; });
      g.cards = g.rounds.filter(function (r) { return r.scores; });
      g.trn = g.rounds.filter(function (r) { return r.kind === 'trn'; }).length;
      g.bestGross = best(g.r18, gross); g.bestNet = best(g.r18, net); g.best9 = best(g.r9, gross); g.best9Net = best(g.r9, net);
      g.avgGross = g.r18.length ? sum(g.r18.map(gross)) / g.r18.length : null;
      g.avgNet = g.r18.length ? sum(g.r18.map(net)) / g.r18.length : null;
      g.birdies = sum(g.cards.map(function (r) { return r.birdies; })); g.eagles = sum(g.cards.map(function (r) { return r.eagles; })); g.aces = sum(g.cards.map(function (r) { return r.aces; }));
      /* Most improved: the first handicap revision in the period against the latest */
      const hh = hist.filter(function (x) { return x && x.memberId === id && typeof x.index === 'number' && inR(x.date); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      g.imp = hh.length >= 2 ? { from: hh[0], to: hh[hh.length - 1], n: hh.length, list: hh, drop: r1(hh[0].index - hh[hh.length - 1].index) } : null;
      return g;
    }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
    const byId = {}; golfers.forEach(function (g) { byId[g.id] = g; });

    /* Hole records: every golfer, from hole-by-hole rounds */
    const records = hs18.map(function (h) { return { hole: h, best: null, made: [], holders: [] }; });
    rounds.forEach(function (r) {
      if (!r.scores) return;
      r.scores.forEach(function (v, i) {
        const rec = records[r.hs[i].number - 1]; if (!rec) return;
        if (rec.best == null || v < rec.best) { rec.best = v; rec.made = []; }
        if (v === rec.best) rec.made.push(r);
      });
    });
    records.forEach(function (rec) {
      rec.made.sort(function (a, b) { return a.date.localeCompare(b.date) || byId[a.mid].name.localeCompare(byId[b.mid].name); });
      const seen = {};
      rec.made.forEach(function (r) { if (seen[r.mid]) { seen[r.mid].times++; return; } seen[r.mid] = { g: byId[r.mid], first: r, times: 1 }; rec.holders.push(seen[r.mid]); });
    });

    const cards = rounds.filter(function (r) { return r.scores; });
    return {
      from: from, to: to, min: min,
      rounds: rounds, byKey: byKey, golfers: golfers, byId: byId, records: records, once: once,
      qual: golfers.filter(function (g) { return g.q; }), unq: golfers.filter(function (g) { return !g.q; }),
      tot: { rounds: rounds.length, posts: rounds.filter(function (r) { return r.kind === 'post'; }).length, trn: rounds.filter(function (r) { return r.kind === 'trn'; }).length,
        cards: cards.length, totalOnly: rounds.length - cards.length, nine: rounds.filter(function (r) { return r.n === 9; }).length,
        attested: rounds.filter(function (r) { return r.kind === 'post' && r.attestedBy; }).length,
        birdies: sum(cards.map(function (r) { return r.birdies; })), eagles: sum(cards.map(function (r) { return r.eagles; })), aces: sum(cards.map(function (r) { return r.aces; })) }
    };
  }

  /* ---------------- How each board ranks ----------------
     set: which of the golfer's rounds sit behind the number; by: gross or net; desc: higher is better;
     has(g): the golfer belongs on the board; val(g): the number; date(g): earlier first among equal values. */
  const BOARDS = {
    gross: { set: 'r18', by: 'gross', has: function (g) { return !!g.bestGross; }, val: function (g) { return g.bestGross.gross; }, date: function (g) { return g.bestGross.date; } },
    net: { set: 'r18', by: 'net', has: function (g) { return !!g.bestNet; }, val: function (g) { return g.bestNet.net; }, date: function (g) { return g.bestNet.date; } },
    avgGross: { set: 'r18', by: 'gross', has: function (g) { return g.avgGross != null; }, val: function (g) { return r1(g.avgGross); } },
    avgNet: { set: 'r18', by: 'net', has: function (g) { return g.avgNet != null; }, val: function (g) { return r1(g.avgNet); } },
    nine: { set: 'r9', by: 'gross', has: function (g) { return !!g.best9; }, val: function (g) { return g.best9.gross; }, date: function (g) { return g.best9.date; } },
    nineNet: { set: 'r9', by: 'net', has: function (g) { return !!g.best9Net; }, val: function (g) { return g.best9Net.net; }, date: function (g) { return g.best9Net.date; } },
    birdies: { set: 'cards', desc: true, has: function (g) { return g.birdies > 0; }, val: function (g) { return g.birdies; } },
    eagles: { set: 'cards', desc: true, has: function (g) { return g.eagles > 0; }, val: function (g) { return g.eagles; } },
    aces: { set: 'cards', desc: true, has: function (g) { return g.aces > 0; }, val: function (g) { return g.aces; } },
    rounds: { set: 'rounds', desc: true, has: function () { return true; }, val: function (g) { return g.n; } },
    improved: { set: 'rounds', desc: true, has: function (g) { return !!g.imp && g.imp.drop > 0; }, val: function (g) { return g.imp.drop; } }
  };
  /** Qualified golfers on a board, best first; equal values share a place. keep(g) leaves golfers out before ranking. */
  function ranked(d, key, keep) {
    const b = BOARDS[key];
    if (!b) return [];
    const list = d.qual.filter(function (g) { return b.has(g) && (!keep || keep(g)); }).map(function (g) { return { g: g, v: b.val(g) }; });
    list.sort(function (x, y) {
      return (b.desc ? y.v - x.v : x.v - y.v) || (b.date ? b.date(x.g).localeCompare(b.date(y.g)) : 0) || x.g.name.localeCompare(y.g.name);
    });
    list.forEach(function (x) { x.pos = 1 + list.filter(function (o) { return b.desc ? o.v > x.v : o.v < x.v; }).length; });
    return list;
  }

  /* ---------------- Members' view ----------------
     The boards members can be shown. gross/net: a board with both (the Gross | Net switch); key: a board with one. */
  const MEMBER_BOARDS = [
    { id: 'low', label: 'Low round', gross: 'gross', net: 'net' },
    { id: 'average', label: 'Best average', gross: 'avgGross', net: 'avgNet' },
    { id: 'improved', label: 'Most improved', key: 'improved' },
    { id: 'birdies', label: 'Birdies', key: 'birdies' },
    { id: 'eagles', label: 'Eagles and holes in one', key: 'eagles' },
    { id: 'rounds', label: 'Rounds played', key: 'rounds' }
  ];
  const KEY = 'memberLeaderboard';
  const DEFAULTS = { show: true, boards: { low: true, average: true, improved: true, birdies: true, eagles: false, rounds: false },
    periods: { month: true, season: true }, scores: 'both', min: MIN, top: 25 };
  /** The saved members' view, filled out with the defaults (a copy: change it through save). */
  function settings() {
    const v = S.getObj(KEY, null) || {};
    const out = {
      show: v.show !== false,
      boards: Object.assign({}, DEFAULTS.boards, v.boards || {}),
      periods: Object.assign({}, DEFAULTS.periods, v.periods || {}),
      scores: v.scores === 'gross' || v.scores === 'net' ? v.scores : 'both',
      min: Math.max(1, Math.min(50, Math.round(+v.min) || DEFAULTS.min)),
      top: Math.max(1, Math.min(500, Math.round(+v.top) || DEFAULTS.top))
    };
    if (!out.periods.month && !out.periods.season) out.periods.season = true;
    return out;
  }
  function save(next) { S.setObj(KEY, JSON.parse(JSON.stringify(next))); }
  /** A member who turned off "Show me on the members' leaderboards" in the portal Profile. Staff boards still show them. */
  function visible(g) { return !(g && g.m && g.m.leaderboardHidden); }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** 'month': this calendar month. 'season': this golf season (Club.season), or the last one while the course is closed. */
  function period(kind, today) {
    today = today || Club.date.today();
    const y = +today.slice(0, 4);
    if (kind === 'month') {
      const mo = +today.slice(5, 7), last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return { kind: 'month', from: today.slice(0, 8) + '01', to: today.slice(0, 8) + String(last).padStart(2, '0'), label: MONTHS[mo - 1], year: y };
    }
    const sy = Club.season && today < Club.season.start(y) ? y - 1 : y;
    const from = Club.season ? Club.season.start(sy) : sy + '-04-01', to = Club.season ? Club.season.end(sy) : sy + '-10-31';
    return { kind: 'season', from: from, to: to, label: sy + ' season', year: sy, closed: today > to };
  }
  /** The period a member sees first: this month while the course is open and someone has qualified in it; otherwise
      the season (in the off-season, the one just finished). */
  function defaultPeriod(s) {
    s = s || settings();
    const per = ['month', 'season'].filter(function (k) { return s.periods[k]; });
    if (per.length < 2) return per[0] || 'season';
    const today = Club.date.today(), board = MEMBER_BOARDS.filter(function (b) { return s.boards[b.id]; })[0];
    const open = Club.season ? Club.season.inSeason(today) : true;
    return open && board && memberBoard({ period: 'month', board: board.id, settings: s }).qualified ? 'month' : 'season';
  }
  /** The board a member sees. o: { period: 'month'|'season', board: MEMBER_BOARDS id, score: 'gross'|'net', viewerId,
      settings (optional) }. Golfers hidden from members are left out and the places close up; the first `top` rows show.
      -> { s, p, board, key, d, list (every visible golfer on the board), rows (the top), qualified, me } */
  function memberBoard(o) {
    const s = o.settings || settings();
    const p = period(o.period === 'month' ? 'month' : 'season', o.today);
    const board = MEMBER_BOARDS.filter(function (b) { return b.id === o.board; })[0] || MEMBER_BOARDS[0];
    const score = s.scores === 'both' ? (o.score === 'gross' ? 'gross' : 'net') : s.scores;
    const key = board.key || board[score];
    const d = compute(p.from, p.to, s.min);
    const list = ranked(d, key, visible);
    const meG = o.viewerId ? d.byId[o.viewerId] : null, meM = o.viewerId ? Club.members.get(o.viewerId) : null;
    const meRow = list.filter(function (x) { return x.g.id === o.viewerId; })[0] || null;
    return {
      s: s, p: p, board: board, score: board.key ? null : score, key: key, d: d, list: list, rows: list.slice(0, s.top),
      qualified: d.qual.filter(visible).length,
      me: o.viewerId ? { row: meRow, n: meG ? meG.n : 0, need: Math.max(0, s.min - (meG ? meG.n : 0)), hidden: !!(meM && meM.leaderboardHidden), g: meG } : null
    };
  }

  Club.leaderboard = { MIN: MIN, compute: compute, BOARDS: BOARDS, ranked: ranked,
    MEMBER_BOARDS: MEMBER_BOARDS, KEY: KEY, DEFAULTS: DEFAULTS, settings: settings, save: save, visible: visible, period: period, defaultPeriod: defaultPeriod, memberBoard: memberBoard };
})();
