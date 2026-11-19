/* Club.play: the live scorecard ("Play") for a booked group. Loaded by member.html, public.html and index.html.
   The screens are in js/portal/play.js (members' portal and public site) and js/public/play.js (public routes and
   My rounds); the staff tee sheet only asks Club.play.liveHole(teeTime).

   Three parts:
   1. Club.play.sync: the ONE place that reads or writes live round state. Nothing else touches the 'liveRounds' or
      'liveScores' collections.
   2. Club.play.engine: pure game scoring (stroke play, Stableford, par, skins with and without carry-over, best ball;
      gross or net). No DOM and no store: tests/play-engine.test.js runs it in node.
   3. Round helpers: who is in the group, when Play opens, posting a finished round to each player's account, and a
      daily demo group for the demo member.

   Rules from the owner:
   - Play opens 5 minutes before the tee time and stays open for the rest of that day. A started round is resumed.
   - Everyone in the group with an account (members, and public golfers with a public account) can enter and change
     any player's score. Guests without an account play in the game, but nothing is posted for them.
   - Finish round posts every score at once, with no confirming: members get a hole-by-hole 'scorePosts' round in the
     shape js/portal/scores.js writes (it counts toward the demo handicap estimate and the staff Leaderboard); public
     golfers get a 'publicRounds' document shown under My rounds in their public account.

   Data:
   liveRounds  { id: 'lr_<teeTimeId>', teeTimeId, date, time, holes: 9 | 18, startTee: 1 | 10, order: [hole numbers in
                 play order], tees, game, scoring: 'gross' | 'net', players: [{ pid, kind: 'member' | 'public' | 'guest',
                 memberId, publicPlayerId, name, index, ch, team: 'A' | 'B' }], status: 'playing' | 'finished',
                 startedAt, startedBy, reached (furthest hole anyone moved to), finishedAt, finishedBy, posted: [...] }
   liveScores  { id: '<roundId>|<pid>|<hole>', roundId, pid, hole, strokes, by: { kind, id, pid, name }, at }
               One document per player and hole, so two people entering different holes (or different players on the
               same hole) never overwrite each other. `by` and `at` record who changed the score and when.
   pid: 'm:<memberId>', 'p:<publicPlayerId>' or 'g:<position in the booking>' for a guest. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.Club = root.Club || {};
  const Club = root.Club;
  const play = Club.play = Club.play || {};

  /* ======================================================================
     1. SYNC
     Today: Club.store, the browser's own storage. Club.store already merges changes between tabs of the same browser
     document by document and field by field (js/core/store.js), and tells subscribers when another tab saved, so a
     second tab or window on the same round updates live.
     Later: a server replaces ONLY this module. Keep the same functions (round, roundById, start, patch, scores,
     setScore, subscribe): start / patch / setScore become requests, and subscribe gets pushed updates (a WebSocket or
     server-sent events per round), so every phone in the group updates live. Nothing outside this block may read or
     write 'liveRounds' or 'liveScores'.
     ====================================================================== */
  const ROUNDS = 'liveRounds', SCORES = 'liveScores';
  function S() { return Club.store; }
  const sync = {
    /** The round for a tee time, or null. */
    round: function (teeTimeId) { return teeTimeId ? S().find(ROUNDS, 'lr_' + teeTimeId) : null; },
    roundById: function (id) { return id ? S().find(ROUNDS, id) : null; },
    /** Start the round for a tee time with the chosen game. If someone in the group already started it, theirs is kept. */
    start: function (teeTimeId, setup, who) {
      const have = sync.round(teeTimeId);
      if (have) return have;
      return S().insert(ROUNDS, Object.assign({}, setup, { id: 'lr_' + teeTimeId, teeTimeId: teeTimeId, status: 'playing', startedAt: new Date().toISOString(), startedBy: who || null }));
    },
    /** Change some fields of the round (game, status, reached ...). Field level: other fields are left alone. */
    patch: function (roundId, fields) { return S().find(ROUNDS, roundId) ? S().update(ROUNDS, roundId, fields) : null; },
    /** Every entered score of a round: { pid: { hole: { strokes, by, at } } }. Holes nobody has entered are missing. */
    scores: function (roundId) {
      const out = {};
      S().all(SCORES).forEach(function (d) {
        if (d.roundId !== roundId) return;
        (out[d.pid] = out[d.pid] || {})[d.hole] = { strokes: d.strokes, by: d.by || null, at: d.at || null };
      });
      return out;
    },
    /** Enter or change one player's score on one hole, recording who did it and when. */
    setScore: function (roundId, pid, hole, strokes, who) {
      const id = roundId + '|' + pid + '|' + hole;
      const doc = { roundId: roundId, pid: pid, hole: +hole, strokes: +strokes, by: who || null, at: new Date().toISOString() };
      return S().find(SCORES, id) ? S().update(SCORES, id, doc) : S().insert(SCORES, Object.assign({ id: id }, doc));
    },
    /** fn() runs after any change to live rounds or scores, made here or in another tab. Returns an unsubscribe. */
    subscribe: function (fn) {
      const a = S().subscribe(ROUNDS, function () { fn(); }), b = S().subscribe(SCORES, function () { fn(); });
      return function () { a(); b(); };
    }
  };
  play.sync = sync;

  /* ======================================================================
     2. ENGINE (pure)
     holes: [{ number, par, handicap (stroke index) }] in play order, only the holes to count.
     players: [{ pid, name, ch (course handicap; 0 or missing plays off scratch), team }]
     grid: { pid: { holeNumber: strokes } }; a missing score counts as par (the scorecard shows par until changed).
     ====================================================================== */
  const GAMES = [
    { id: 'stroke', label: 'Stroke play', sub: 'Lowest total wins' },
    { id: 'stableford', label: 'Stableford', sub: 'Points per hole, most points wins' },
    { id: 'par', label: 'Par', sub: 'Win, halve or lose each hole against par' },
    { id: 'skins', label: 'Skins', sub: 'Ties carry over' },
    { id: 'skins-nc', label: 'Skins', sub: 'No carry-over' },
    { id: 'bestball', label: 'Best ball', sub: 'Teams of 2, best score on each hole' }
  ];
  function gameOf(id) { return GAMES.find(function (g) { return g.id === id; }) || GAMES[0]; }
  /** Strokes received on each hole (by hole number) for a course handicap, spread by stroke index. For a nine-hole round
      pass the nine holes: they rank by their own stroke indexes (Club.whs.strokesPerHole, the same rule as score posting). */
  function received(holes, ch) {
    const out = {};
    const per = Club.whs ? Club.whs.strokesPerHole(holes, Math.round(+ch || 0)) : holes.map(function () { return 0; });
    holes.forEach(function (h, i) { out[h.number] = per[i] || 0; });   /* || 0: no -0 from a plus handicap */
    return out;
  }
  function grossOf(grid, pid, h) { const v = grid[pid] && grid[pid][h.number]; return v != null ? +v : h.par; }
  /** Competition ranking: equal values share a rank (1, 2, 2, 4). better(a, b) < 0 when a is ahead. */
  function rank(rows, better) {
    rows.sort(function (a, b) { return better(a, b) || String(a.name).localeCompare(String(b.name)); });
    rows.forEach(function (r, i) { r.rank = i && better(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1; });
    return rows;
  }
  /** Per player: gross, strokes received, net and par over the holes. course: every hole of the round, for spreading
      the strokes by stroke index (defaults to holes; pass it when holes is only the part played so far). */
  function totals(holes, players, grid, course) {
    return players.map(function (p) {
      const rc = received(course || holes, p.ch);
      let gross = 0, strokes = 0, par = 0;
      holes.forEach(function (h) { gross += grossOf(grid, p.pid, h); strokes += rc[h.number] || 0; par += h.par; });
      return { pid: p.pid, name: p.name, gross: gross, strokes: strokes, net: gross - strokes, par: par };
    });
  }
  /**
   * standings(game, scoring, holes, players, grid, course) -> { game, scoring, thru, rows, carry, teams }
   *   course: every hole of the round in play order (strokes are spread over these); defaults to holes.
   *   rows: [{ pid (or team), name, value, rank, gross, net }] best first.
   *   stroke: value = score to par (lower is better); stableford: points; par: holes won minus holes lost;
   *   skins / skins-nc: skins won (carry = skins still carried at the end, skins only); bestball: team score to par.
   */
  function standings(game, scoring, holes, players, grid, course) {
    const net = scoring === 'net';
    const rc = {}; players.forEach(function (p) { rc[p.pid] = net ? received(course || holes, p.ch) : {}; });
    const score = function (pid, h) { return grossOf(grid, pid, h) - (rc[pid][h.number] || 0); };
    const tot = {}; totals(holes, players, grid, course).forEach(function (t) { tot[t.pid] = t; });
    const base = function (p, value) { return { pid: p.pid, name: p.name, value: value, gross: tot[p.pid].gross, net: tot[p.pid].net }; };
    const out = { game: game, scoring: net ? 'net' : 'gross', thru: holes.length, rows: [], carry: 0 };
    if (game === 'stableford') {
      out.rows = rank(players.map(function (p) {
        return base(p, holes.reduce(function (a, h) { return a + Math.max(0, 2 + h.par - score(p.pid, h)); }, 0));
      }), function (a, b) { return b.value - a.value; });
    } else if (game === 'par') {
      out.rows = rank(players.map(function (p) {
        return base(p, holes.reduce(function (a, h) { const s = score(p.pid, h); return a + (s < h.par ? 1 : s > h.par ? -1 : 0); }, 0));
      }), function (a, b) { return b.value - a.value; });
    } else if (game === 'skins' || game === 'skins-nc') {
      const won = {}; players.forEach(function (p) { won[p.pid] = 0; });
      let carry = 0;
      out.holes = [];
      holes.forEach(function (h) {
        const pot = 1 + (game === 'skins' ? carry : 0);
        let low = Infinity, who = [];
        players.forEach(function (p) { const s = score(p.pid, h); if (s < low) { low = s; who = [p.pid]; } else if (s === low) who.push(p.pid); });
        if (who.length === 1 && players.length > 1) { won[who[0]] += pot; carry = 0; out.holes.push({ hole: h.number, pid: who[0], skins: pot }); }
        else { carry = game === 'skins' ? pot : 0; out.holes.push({ hole: h.number, pid: null, skins: 0 }); }
      });
      out.carry = carry;
      out.rows = rank(players.map(function (p) { return base(p, won[p.pid]); }), function (a, b) { return b.value - a.value; });
    } else if (game === 'bestball') {
      const teams = {};
      players.forEach(function (p) { const t = p.team || 'A'; (teams[t] = teams[t] || []).push(p); });
      out.teams = Object.keys(teams).sort().map(function (t) {
        const list = teams[t];
        let v = 0, gross = 0;
        holes.forEach(function (h) {
          const best = Math.min.apply(null, list.map(function (p) { return score(p.pid, h); }));
          v += best - h.par; gross += Math.min.apply(null, list.map(function (p) { return grossOf(grid, p.pid, h); }));
        });
        return { pid: 'team:' + t, team: t, name: list.map(function (p) { return p.name; }).join(' and '), members: list.map(function (p) { return p.pid; }), value: v, gross: gross };
      });
      out.rows = rank(out.teams.slice(), function (a, b) { return a.value - b.value; });
    } else {
      out.game = 'stroke';
      out.rows = rank(players.map(function (p) { const t = tot[p.pid]; return base(p, (net ? t.net : t.gross) - t.par); }), function (a, b) { return a.value - b.value; });
    }
    return out;
  }
  /** Text for a standings value: "−1", "E", "+2"; "12 pts"; "2 up", "All square", "1 down"; "3 skins". */
  function valueText(game, v) {
    if (game === 'stableford') return v + (v === 1 ? ' pt' : ' pts');
    if (game === 'par') return v > 0 ? v + ' up' : v < 0 ? Math.abs(v) + ' down' : 'All square';
    if (game === 'skins' || game === 'skins-nc') return v + (v === 1 ? ' skin' : ' skins');
    return toPar(v);
  }
  function toPar(v) { return v === 0 ? 'E' : v > 0 ? '+' + v : '−' + Math.abs(v); }
  play.engine = { GAMES: GAMES, gameOf: gameOf, received: received, totals: totals, standings: standings, valueText: valueText, toPar: toPar };

  /* Pure scoring is all node needs. */
  if (typeof document === 'undefined' || !Club.store) return;

  /* ======================================================================
     3. ROUND HELPERS
     ====================================================================== */
  const St = Club.store;
  const OPEN_BEFORE = 5;            /* minutes before the tee time that Play opens */
  const REOPEN_MINUTES = 15;        /* a finished round can be reopened (its posts taken back) for this long */
  const TEES = ['black', 'green', 'silver'];
  function today() { return Club.date.today(); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, m); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function holesAll() { return St.all('holes').slice().sort(function (a, b) { return a.number - b.number; }); }

  /** Hole numbers in the order the group plays them: a 9-hole round from the 10th tee plays 10 to 18, an 18-hole round
      from the 10th tee plays 10 to 18 then 1 to 9 (teeTimes.holes and teeTimes.startTee, as the tee sheet sets them). */
  function orderFor(tt) {
    const ten = +(tt && tt.startTee) === 10, nine = +(tt && tt.holes) === 9;
    const a = []; for (let i = 1; i <= 18; i++) a.push(i);
    if (nine) return ten ? a.slice(9) : a.slice(0, 9);
    return ten ? a.slice(9).concat(a.slice(0, 9)) : a;
  }
  function holesOf(order) { const all = holesAll(); return order.map(function (n) { return all.find(function (h) { return h.number === n; }); }).filter(Boolean); }
  function nineOf(tt) { return +tt.holes === 9 ? (+tt.startTee === 10 ? 'back' : 'front') : null; }

  /** The players of a booking as round players. Members and public account holders can keep score; the rest are guests. */
  function playersOf(tt) {
    return (tt.players || []).map(function (p, i) {
      if (p.memberId) {
        const m = Club.members.get(p.memberId);
        return { pid: 'm:' + p.memberId, kind: 'member', memberId: p.memberId, publicPlayerId: null, name: m ? m.firstName + ' ' + m.lastName : (p.name || 'Member'), index: m && m.handicap != null ? +m.handicap : null };
      }
      if (p.publicPlayerId && !p.publicGuest) {
        const pp = St.find('publicPlayers', p.publicPlayerId);
        return { pid: 'p:' + p.publicPlayerId, kind: 'public', memberId: null, publicPlayerId: p.publicPlayerId, name: pp ? pp.firstName + ' ' + pp.lastName : (p.name || 'Public golfer'), index: pp && pp.handicap != null ? +pp.handicap : null };
      }
      return { pid: 'g:' + i, kind: 'guest', memberId: null, publicPlayerId: null, name: p.name || 'Guest', index: null };
    });
  }
  /** Who is looking: { kind: 'member' | 'public', id, pid, name (first name) }. */
  function viewerMember(m) { return m ? { kind: 'member', id: m.id, pid: 'm:' + m.id, name: m.firstName } : null; }
  function viewerPublic(p) { return p ? { kind: 'public', id: p.id, pid: 'p:' + p.id, name: p.firstName } : null; }
  function inGroup(tt, who) {
    if (!tt || !who) return false;
    return (tt.players || []).some(function (p) { return who.kind === 'member' ? p.memberId === who.id : (p.publicPlayerId === who.id && !p.publicGuest); });
  }
  /** When Play opens for a tee time: { opensAt 'HH:MM', open, early, past } (open from 5 minutes before until midnight). */
  function windowFor(tt) {
    const opens = toHM(Math.max(0, toMin(tt.time) - OPEN_BEFORE)), td = today();
    const early = tt.date > td || (tt.date === td && nowMin() < toMin(opens));
    return { opensAt: opens, open: tt.date === td && !early, early: early, past: tt.date < td };
  }
  /** The viewer's tee times today that Play applies to, earliest first. */
  function teeTimesToday(who) {
    const td = today();
    return St.all('teeTimes').filter(function (t) { return t && t.date === td && t.status !== 'cancelled' && t.status !== 'no-show' && inGroup(t, who); })
      .sort(function (a, b) { return a.time.localeCompare(b.time); });
  }
  /** The one to put forward on Home: a round in play, then one open and not finished, then the next to open, then a finished one. */
  function focusTeeTime(who) {
    const list = teeTimesToday(who); if (!list.length) return null;
    const st = function (t) { const r = sync.round(t.id); return r ? r.status : null; };
    return list.find(function (t) { return st(t) === 'playing'; }) ||
      list.find(function (t) { return windowFor(t).open && st(t) !== 'finished'; }) ||
      list.find(function (t) { return windowFor(t).early; }) ||
      list.find(function (t) { return st(t) === 'finished'; }) || null;
  }

  /** Course handicap for a round player (Club.whs, the same rule as score posting); 0 without a handicap index. */
  function chFor(index, tees, tt) {
    if (index == null || index === '' || isNaN(+index) || !Club.whs) return 0;
    return Club.whs.courseHandicap(+index, tees, +tt.holes === 9 ? 9 : 18, nineOf(tt));
  }
  /** A new round's settings from a tee time and the setup choices: { game, scoring, tees, index: {pid: n}, team: {pid: 'A'|'B'} } */
  function setupFor(tt, choice) {
    const tees = TEES.indexOf(choice.tees) >= 0 ? choice.tees : 'green';
    const ps = playersOf(tt).map(function (p, i) {
      const idx = choice.index && Object.prototype.hasOwnProperty.call(choice.index, p.pid) ? choice.index[p.pid] : p.index;
      const n = idx == null || idx === '' || isNaN(+idx) ? null : +idx;
      return Object.assign(p, { index: n, ch: chFor(n, tees, tt), team: (choice.team && choice.team[p.pid]) || (i < 2 ? 'A' : 'B') });
    });
    return { date: tt.date, time: tt.time, holes: +tt.holes === 9 ? 9 : 18, startTee: +tt.startTee === 10 ? 10 : 1, order: orderFor(tt), tees: tees,
      game: gameOf(choice.game).id, scoring: choice.scoring === 'gross' ? 'gross' : 'net', players: ps, reached: null };
  }
  /** Re-work course handicaps after the game or tees changed mid-round. */
  function withHandicaps(round, tees) {
    const tt = { holes: round.holes, startTee: round.startTee };
    return round.players.map(function (p) { return Object.assign({}, p, { ch: chFor(p.index, tees, tt) }); });
  }

  /** Grid { pid: { hole: strokes } } and the holes with at least one score entered (in play order). */
  function gridOf(round) {
    const sc = sync.scores(round.id), grid = {};
    Object.keys(sc).forEach(function (pid) { grid[pid] = {}; Object.keys(sc[pid]).forEach(function (h) { grid[pid][h] = sc[pid][h].strokes; }); });
    const scored = round.order.filter(function (n) { return round.players.some(function (p) { return sc[p.pid] && sc[p.pid][n]; }); });
    return { raw: sc, grid: grid, scored: scored };
  }
  /** Live standings for the round: over the holes scored so far, or over every hole (all: true, as at the finish). */
  function standingsOf(round, all) {
    const g = gridOf(round);
    const holes = holesOf(all ? round.order : g.scored);
    return Club.play.engine.standings(round.game, round.scoring, holes, round.players, g.grid, holesOf(round.order));
  }
  /** The hole the group is on, for the staff tee sheet: the furthest of the hole anyone moved to and the last hole with
      a score. Null when the tee time has no round in play. */
  function liveHole(tt) {
    const r = tt && sync.round(tt.id);
    if (!r || r.status !== 'playing') return null;
    const g = gridOf(r);
    let at = r.reached != null ? r.order.indexOf(+r.reached) : -1;
    g.scored.forEach(function (n) { at = Math.max(at, r.order.indexOf(n)); });
    return r.order[Math.max(0, at)];
  }

  /* ---------------- Finishing: post every score at once ---------------- */
  function sortByNumber(a, b) { return a.number - b.number; }
  function memberPost(round, p, holes, grid, tt) {
    const W = Club.whs, m = Club.members.get(p.memberId);
    if (!m || !W) return null;
    const hs = holes.slice().sort(sortByNumber), n = round.holes, nine = n === 9 ? (round.startTee === 10 ? 'back' : 'front') : null;
    const scores = hs.map(function (h) { const v = grid[p.pid] && grid[p.pid][h.number]; return v != null ? +v : h.par; });
    const index = m.handicap != null ? +m.handicap : null;
    const ch = W.courseHandicap(index, round.tees, n, nine), caps = W.ndbCaps(hs, ch), ags = W.adjustedOf(scores, caps), r = W.ratingFor(round.tees, n);
    const entry = (tt && (tt.players || []).find(function (x) { return x.memberId === p.memberId; })) || {};
    return {
      id: St.uid('sp'), memberId: p.memberId, date: round.date, time: round.time, teeTimeId: round.teeTimeId,
      holes: n, nine: nine, tees: round.tees, entry: 'hole', holeScores: scores, gross: W.sum(scores), adjusted: ags,
      courseHandicap: ch, indexUsed: index, rating: r.rating, slope: r.slope, par: W.parOf(hs), pcc: null,
      differential: W.differential(ags, round.tees, n, index), attestedBy: null,
      playedWith: round.players.filter(function (x) { return x.pid !== p.pid; }).map(function (x) { return x.name; }),
      estimate: null, status: 'saved-in-demo', postedAt: new Date().toISOString(), demo: true,
      friendLeagueId: entry.friendLeagueId || null, source: 'play', liveRoundId: round.id
    };
  }
  function memberEstimate(mid) {
    const posts = St.where('scorePosts', function (x) { return x.memberId === mid; })
      .sort(function (a, b) { return (b.date + (b.time || '99:99') + (b.postedAt || '')).localeCompare(a.date + (a.time || '99:99') + (a.postedAt || '')); });
    return Club.whs.estimate(posts.map(function (x) { return x.differential; }));
  }
  /**
   * Finish the round: post every player's score (members to scorePosts, public account holders to publicRounds,
   * guests nothing) and mark it finished. A player whose round is already posted for this tee time is left as it is.
   * -> the finished round, with posted: [{ pid, kind, name, coll, id, already, estimate, notPosted }]
   */
  function finish(roundId, who) {
    const round = sync.roundById(roundId);
    if (!round) return null;
    if (round.status === 'finished') return round;
    const g = gridOf(round), holes = holesOf(round.order), tt = St.find('teeTimes', round.teeTimeId);
    const res = standingsOf(round, true);
    const posted = round.players.map(function (p) {
      const base = { pid: p.pid, kind: p.kind, name: p.name };
      if (p.kind === 'member') {
        const have = St.all('scorePosts').find(function (x) { return x.memberId === p.memberId && x.teeTimeId === round.teeTimeId; });
        if (have) return Object.assign(base, { coll: 'scorePosts', id: have.id, already: true });
        const doc = memberPost(round, p, holes, g.grid, tt);
        if (!doc) return Object.assign(base, { notPosted: true });
        St.insert('scorePosts', doc);
        const est = memberEstimate(p.memberId);
        if (est) St.update('scorePosts', doc.id, { estimate: { index: est.index, used: est.used, of: est.of } });
        return Object.assign(base, { coll: 'scorePosts', id: doc.id, estimate: est ? est.index : null });
      }
      if (p.kind === 'public') {
        const have = St.all('publicRounds').find(function (x) { return x.publicPlayerId === p.publicPlayerId && x.teeTimeId === round.teeTimeId; });
        if (have) return Object.assign(base, { coll: 'publicRounds', id: have.id, already: true });
        const hs = holes.slice().sort(sortByNumber);
        const scores = hs.map(function (h) { const v = g.grid[p.pid] && g.grid[p.pid][h.number]; return v != null ? +v : h.par; });
        const gross = scores.reduce(function (a, v) { return a + v; }, 0);
        const rc = Club.play.engine.received(hs, p.ch);
        const recv = hs.reduce(function (a, h) { return a + (rc[h.number] || 0); }, 0);
        const row = res.rows.find(function (x) { return x.pid === p.pid || (x.members && x.members.indexOf(p.pid) >= 0); });
        const doc = St.insert('publicRounds', {
          id: St.uid('pr'), publicPlayerId: p.publicPlayerId, teeTimeId: round.teeTimeId, liveRoundId: round.id,
          date: round.date, time: round.time, holes: round.holes, nine: round.holes === 9 ? (round.startTee === 10 ? 'back' : 'front') : null,
          tees: round.tees, holeNumbers: hs.map(function (h) { return h.number; }), pars: hs.map(function (h) { return h.par; }), holeScores: scores,
          gross: gross, par: hs.reduce(function (a, h) { return a + h.par; }, 0), index: p.index, courseHandicap: p.ch, net: gross - recv,
          game: round.game, scoring: round.scoring, result: row ? { rank: row.rank, value: row.value, of: res.rows.length } : null,
          playedWith: round.players.filter(function (x) { return x.pid !== p.pid; }).map(function (x) { return x.name; }),
          postedAt: new Date().toISOString()
        });
        return Object.assign(base, { coll: 'publicRounds', id: doc.id });
      }
      return Object.assign(base, { notPosted: true });
    });
    return sync.patch(round.id, { status: 'finished', finishedAt: new Date().toISOString(), finishedBy: who || null, posted: posted });
  }
  /** Within REOPEN_MINUTES of the finish: take back what Finish posted and carry on playing. */
  function canReopen(round) { return !!round && round.status === 'finished' && !!round.finishedAt && Date.now() - Date.parse(round.finishedAt) < REOPEN_MINUTES * 60000; }
  function reopen(roundId, who) {
    const round = sync.roundById(roundId);
    if (!canReopen(round)) return null;
    (round.posted || []).forEach(function (x) { if (x.coll && x.id && !x.already) St.remove(x.coll, x.id); });
    return sync.patch(round.id, { status: 'playing', finishedAt: null, finishedBy: null, posted: null, reopenedAt: new Date().toISOString(), reopenedBy: who || null });
  }
  /** Save a public golfer's own handicap index on their account (entered in setup), so it is on file next time. */
  function saveOwnIndex(who, index) {
    if (!who || who.kind !== 'public') return;
    const n = index == null || index === '' || isNaN(+index) ? null : Math.round(+index * 10) / 10;
    const p = St.find('publicPlayers', who.id); if (p && p.handicap !== n) St.update('publicPlayers', who.id, { handicap: n });
  }

  Object.assign(play, {
    OPEN_BEFORE: OPEN_BEFORE, REOPEN_MINUTES: REOPEN_MINUTES, TEES: TEES,
    orderFor: orderFor, holesOf: holesOf, nineOf: nineOf, playersOf: playersOf, viewerMember: viewerMember, viewerPublic: viewerPublic,
    inGroup: inGroup, windowFor: windowFor, teeTimesToday: teeTimesToday, focusTeeTime: focusTeeTime, chFor: chFor, setupFor: setupFor,
    withHandicaps: withHandicaps, gridOf: gridOf, standingsOf: standingsOf, liveHole: liveHole, finish: finish, canReopen: canReopen,
    reopen: reopen, saveOwnIndex: saveOwnIndex
  });

  /* ---------------- DEMO (made up): a group for the demo member today ----------------
     So Play can be tried today: once a day, the demo member's first tee time today (the tee sheet seed or the beverage
     cart demo in js/shared/cart-data.js books one) is filled up to four, if it has room and no round yet: one of their
     friends when they are on their own, the public demo account (Alex Morgan, whose own demo tee time today is folded
     into this group, so the public site can keep score in the same round) and a guest. Marker: 'demoBackfills'
     'play-<date>'. Nothing here is a real golfer or a fact about the club. */
  (function demoGroup() {
    try {
      const td = today(), mark = 'play-' + td, dave = St.DEMO_MEMBER || 'mem_1003';
      if (St.find('demoBackfills', mark) || !Club.members.get(dave)) return;
      const tt = St.all('teeTimes').filter(function (t) { return t.date === td && t.status !== 'cancelled' && t.status !== 'no-show' && (t.players || []).some(function (p) { return p.memberId === dave; }); })
        .sort(function (a, b) { return a.time.localeCompare(b.time); })[0];
      if (!tt || sync.round(tt.id) || tt.players.length >= 4) { St.insert('demoBackfills', { id: mark, at: new Date().toISOString(), teeTimeId: null }); return; }
      const busy = function (id) { return St.all('teeTimes').some(function (t) { return t.id !== tt.id && t.date === td && t.status !== 'cancelled' && (t.players || []).some(function (p) { return p.memberId === id; }); }); };
      const add = [];
      const room = function () { return tt.players.length + add.length < 4; };
      if (tt.players.length === 1) {
        const friend = St.all('friendships').filter(function (f) { return f.status === 'accepted' && (f.from === dave || f.to === dave); })
          .map(function (f) { return Club.members.get(f.from === dave ? f.to : f.from); })
          .filter(function (m) { return m && m.status === 'active' && m.handicap != null && !busy(m.id); })[0];
        if (friend) add.push({ memberId: friend.id, name: friend.firstName + ' ' + friend.lastName, type: 'member', cart: true, paid: true });
      }
      const pubId = Club.cart && Club.cart.DEMO_PUBLIC_ID, pub = pubId && St.find('publicPlayers', pubId);
      if (pub && room() && !tt.players.some(function (p) { return p.publicPlayerId === pubId; })) {
        /* Alex's own demo tee time today (only Alex, nothing paid online, no cart order) joins this group instead */
        const own = St.all('teeTimes').filter(function (t) { return t.date === td && t.status !== 'cancelled' && (t.players || []).some(function (p) { return p.publicPlayerId === pubId; }); });
        const solo = own.length === 1 && own[0].players.length === 1 && own[0].bookedBy === pubId &&
          !St.all('publicPayments').some(function (x) { return x.teeTimeId === own[0].id; }) && !St.all('cartOrders').some(function (o) { return o.teeTimeId === own[0].id; });
        if (!own.length || solo) {
          if (solo) St.remove('teeTimes', own[0].id);
          add.push({ memberId: null, name: pub.firstName + ' ' + pub.lastName, type: 'public', publicPlayerId: pubId, cart: true, paid: false });
        }
      }
      if (room() && !tt.players.some(function (p) { return p.type === 'guest'; })) add.push({ memberId: null, name: 'Natalie Hollis', type: 'guest', hostId: dave, cart: false, paid: false });
      if (add.length) St.update('teeTimes', tt.id, { players: tt.players.concat(add) });
      St.insert('demoBackfills', { id: mark, at: new Date().toISOString(), teeTimeId: tt.id, added: add.map(function (p) { return p.name; }) });
    } catch (e) { console.error('Play demo group failed', e); }
  })();
})();
