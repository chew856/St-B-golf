/* Reports section: Leaderboard (staff only). Registers through Club.reports.addSection (js/modules/reports.js).
   Ranks golfers on the rounds on file in the selected period: lowest scores, birdies, eagles and holes in one, most
   rounds and most improved, and the best score recorded on each hole.

   A round is (a) a score post (collection scorePosts, written by the members' portal, js/portal/scores.js), attested or
   not, or (b) a tournament card entered by staff (tournaments[].field[], status final or live) with all 18 holes in.
   A member who also posted a score on the day of a tournament round is counted once, from the tournament card.
   A golfer qualifies for the boards with MIN rounds in the period; hole records take in every golfer.
   Net = gross less the course handicap: the one saved with a post, or for a tournament card the one the tournament
   leaderboard works out (Club.shared.events.courseHcp). Both rest on placeholder course ratings until the club's
   official ratings are entered. Par and stroke index come from the 'holes' collection (the club's scorecard).
   Everyone appears: the friends privacy settings of the portal do not apply to this staff page. */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc, H = Club.reports.h, plural = H.plural;
  const MIN = 10;                           /* rounds in the period to qualify */
  const TOP = 5, TOP9 = 3, NAMES = 2, UNQ = 8;   /* rows shown on the page before "See all" */
  const TEES = { black: 'Black tees', green: 'Green tees', silver: 'Silver tees' };
  const MINUS = '−';

  /* ---------------- Helpers ---------------- */
  function EV() { return (Club.shared && Club.shared.events) || {}; }
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function r1(x) { return Math.round(x * 10 + 1e-9) / 10; }
  function holes18() {
    const hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    return hs.length === 18 ? hs : (EV().holeList ? EV().holeList() : []);
  }
  function mName(id) { const m = Club.members.get(id); return m ? Club.members.name(m) : 'Former member'; }
  function nameLink(g) { return g.m ? '<a class="rlb-name" href="#/members/' + esc(g.id) + '">' + esc(g.name) + '</a>' : '<span class="rlb-name muted">Former member</span>'; }
  function hcp(v) { return v < 0 ? '+' + Math.abs(v) : String(v); }
  function toPar(v) { return v === 0 ? 'Even' : v > 0 ? '+' + v : MINUS + Math.abs(v); }
  function roundLabel(r) { return r.kind === 'trn' ? r.name : (r.n === 9 ? (r.nine === 'back' ? 'Back nine, ' : 'Front nine, ') : '') + (TEES[r.tees] || 'Tees not recorded'); }
  function roundSub(r) { return r.kind === 'trn' ? 'Tournament card' : (r.scores ? '' : 'Total only. ') + (r.attestedBy ? 'Attested by ' + mName(r.attestedBy) : 'Not attested'); }
  function when(r) { return F.dateShort(r.date) + ', ' + roundLabel(r); }
  function scoreName(v, par) { return v === 1 ? 'Hole in one' : v === par - 3 ? 'Albatross' : v === par - 2 ? 'Eagle' : v === par - 1 ? 'Birdie' : v === par ? 'Par' : v === par + 1 ? 'Bogey' : 'Over par'; }

  /* ---------------- The rounds, golfers and hole records of the period ---------------- */
  function data(ctx) {
    return H.memo(ctx, 'leaderboard', function () {
      const inR = H.inRange(ctx), hs18 = holes18(), rounds = [], byKey = {};
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
        g.n = g.rounds.length; g.q = g.n >= MIN;
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
        rounds: rounds, byKey: byKey, golfers: golfers, byId: byId, records: records, once: once,
        qual: golfers.filter(function (g) { return g.q; }), unq: golfers.filter(function (g) { return !g.q; }),
        tot: { rounds: rounds.length, posts: rounds.filter(function (r) { return r.kind === 'post'; }).length, trn: rounds.filter(function (r) { return r.kind === 'trn'; }).length,
          cards: cards.length, totalOnly: rounds.length - cards.length, nine: rounds.filter(function (r) { return r.n === 9; }).length,
          attested: rounds.filter(function (r) { return r.kind === 'post' && r.attestedBy; }).length,
          birdies: sum(cards.map(function (r) { return r.birdies; })), eagles: sum(cards.map(function (r) { return r.eagles; })), aces: sum(cards.map(function (r) { return r.aces; })) }
      };
    });
  }

  /* ---------------- The boards ----------------
     has(g): the golfer belongs on the board; val(g): what ranks them (lower is better unless desc); text(v): how it reads;
     sub(g): the line under the name; set: which of the golfer's rounds sit behind the number. */
  function one(v) { return v.toFixed(1); }
  const BOARDS = {
    gross: { title: 'Best round, gross', col: 'Gross', unit: 'gross', set: 'r18', by: 'gross', has: function (g) { return !!g.bestGross; }, val: function (g) { return g.bestGross.gross; }, text: String,
      date: function (g) { return g.bestGross.date; }, sub: function (g) { return when(g.bestGross); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['Net', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.bestGross; return [r.net, r.ch, r.date, roundLabel(r)]; } },
    net: { title: 'Best round, net', col: 'Net', unit: 'net', set: 'r18', by: 'net', has: function (g) { return !!g.bestNet; }, val: function (g) { return g.bestNet.net; }, text: String,
      date: function (g) { return g.bestNet.date; }, sub: function (g) { return when(g.bestNet) + ', gross ' + g.bestNet.gross; }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['Gross', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.bestNet; return [r.gross, r.ch, r.date, roundLabel(r)]; } },
    avgGross: { title: 'Best average, gross', col: 'Average gross', unit: 'average gross', set: 'r18', by: 'gross', has: function (g) { return g.avgGross != null; }, val: function (g) { return r1(g.avgGross); }, text: one,
      sub: function (g) { return 'Over ' + g.r18.length + ' ' + plural(g.r18.length, 'round'); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['18-hole rounds'], cells: function (g) { return [g.r18.length]; } },
    avgNet: { title: 'Best average, net', col: 'Average net', unit: 'average net', set: 'r18', by: 'net', has: function (g) { return g.avgNet != null; }, val: function (g) { return r1(g.avgNet); }, text: one,
      sub: function (g) { return 'Over ' + g.r18.length + ' ' + plural(g.r18.length, 'round'); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['18-hole rounds'], cells: function (g) { return [g.r18.length]; } },
    nine: { title: 'Best 9 holes, gross', col: 'Gross', unit: 'gross over 9 holes', set: 'r9', by: 'gross', has: function (g) { return !!g.best9; }, val: function (g) { return g.best9.gross; }, text: String,
      date: function (g) { return g.best9.date; }, sub: function (g) { return when(g.best9); }, none: 'No 9-hole round by a qualified golfer in this period.',
      head: ['Net', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.best9; return [r.net, r.ch, r.date, roundLabel(r)]; } },
    nineNet: { title: 'Best 9 holes, net', col: 'Net', unit: 'net over 9 holes', set: 'r9', by: 'net', has: function (g) { return !!g.best9Net; }, val: function (g) { return g.best9Net.net; }, text: String,
      date: function (g) { return g.best9Net.date; }, sub: function (g) { return when(g.best9Net) + ', gross ' + g.best9Net.gross; }, none: 'No 9-hole round by a qualified golfer in this period.',
      head: ['Gross', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.best9Net; return [r.gross, r.ch, r.date, roundLabel(r)]; } },
    birdies: { title: 'Birdies', col: 'Birdies', unit: 'birdies', set: 'cards', desc: true, has: function (g) { return g.birdies > 0; }, val: function (g) { return g.birdies; }, text: String,
      sub: function (g) { return 'In ' + g.cards.length + ' hole-by-hole ' + plural(g.cards.length, 'round'); }, none: 'No birdie by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    eagles: { title: 'Eagles or better', col: 'Eagles or better', unit: 'eagles or better', set: 'cards', desc: true, has: function (g) { return g.eagles > 0; }, val: function (g) { return g.eagles; }, text: String,
      sub: function (g) { return 'In ' + g.cards.length + ' hole-by-hole ' + plural(g.cards.length, 'round'); }, none: 'No eagle by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    aces: { title: 'Holes in one', col: 'Holes in one', unit: 'holes in one', set: 'cards', desc: true, has: function (g) { return g.aces > 0; }, val: function (g) { return g.aces; }, text: String,
      sub: function (g) { return g.cards.filter(function (r) { return r.aces; }).map(function (r) { return 'Hole ' + r.hs[r.scores.indexOf(1)].number + ', ' + F.dateShort(r.date); }).join('; '); }, none: 'No hole in one by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    rounds: { title: 'Most rounds played', col: 'Rounds', unit: 'rounds', set: 'rounds', desc: true, has: function () { return true; }, val: function (g) { return g.n; }, text: String,
      sub: function (g) { return (g.n - g.trn) + ' posted' + (g.trn ? ', ' + g.trn + ' ' + plural(g.trn, 'tournament') : ''); }, none: 'No golfer has ' + MIN + ' rounds in this period yet.',
      head: ['Posted', 'Tournament cards', '18 holes', '9 holes'], cells: function (g) { return [g.n - g.trn, g.trn, g.r18.length, g.r9.length]; } },
    improved: { title: 'Most improved', col: 'Handicap index drop', unit: 'off the handicap index', set: 'rounds', desc: true, has: function (g) { return !!g.imp && g.imp.drop > 0; }, val: function (g) { return g.imp.drop; }, text: one,
      sub: function (g) { return 'Index ' + F.handicap(g.imp.from.index) + ' to ' + F.handicap(g.imp.to.index); }, none: 'No qualified golfer lowered their handicap index in this period.',
      head: ['From', 'To', 'First revision', 'Latest revision', 'Revisions'], cells: function (g) { return [g.imp.from.index, g.imp.to.index, g.imp.from.date, g.imp.to.date, g.imp.n]; } }
  };
  /** Qualified golfers on a board, best first; equal values share a place. */
  function ranked(d, key) {
    const b = BOARDS[key];
    const list = d.qual.filter(b.has).map(function (g) { return { g: g, v: b.val(g) }; });
    list.sort(function (x, y) {
      return (b.desc ? y.v - x.v : x.v - y.v) || (b.date ? b.date(x.g).localeCompare(b.date(y.g)) : 0) || x.g.name.localeCompare(y.g.name);
    });
    list.forEach(function (x) { x.pos = 1 + list.filter(function (o) { return b.desc ? o.v > x.v : o.v < x.v; }).length; });
    return list;
  }
  function rowHTML(key, x) {
    const b = BOARDS[key], g = x.g, txt = b.text(x.v);
    return '<li class="rlb-row" data-lb-open="' + esc(key + '|' + g.id) + '" tabindex="0" aria-haspopup="dialog" aria-label="' + esc('Place ' + x.pos + ', ' + g.name + ', ' + txt + ' ' + b.unit + '. See the rounds behind it') + '">' +
      '<span class="rlb-pos">' + x.pos + '</span><span class="rlb-who">' + nameLink(g) + '<span class="rlb-sub">' + esc(b.sub(g)) + '</span></span>' +
      '<span class="rlb-val">' + esc(txt) + '</span>' + Club.icon('chevronRight', 'rlb-go') + '</li>';
  }
  function listHTML(d, key, top) {
    const b = BOARDS[key], list = ranked(d, key);
    return '<div class="rlb-list" data-lb-board="' + key + '"><div class="rlb-list-h"><h3>' + esc(b.title) + '</h3>' +
      (list.length ? '<button type="button" class="rp-link" data-drill="list" data-arg="' + key + '" aria-haspopup="dialog" aria-label="' + esc(b.title + ': see all ' + list.length) + '">See all ' + list.length + '</button>' : '') + '</div>' +
      (list.length ? '<ul class="rlb-rows">' + list.slice(0, top).map(function (x) { return rowHTML(key, x); }).join('') + '</ul>'
        : '<p class="rp-empty">' + esc(d.qual.length ? b.none : 'No golfer has ' + MIN + ' rounds in this period yet.') + '</p>') + '</div>';
  }

  /* ---------------- Summary boxes ---------------- */
  function kpis(ctx) {
    const d = data(ctx), t = d.tot, ace = d.rounds.filter(function (r) { return r.aces; });
    return [
      { label: 'Qualified golfers', value: F.num(d.qual.length), d: esc(MIN + ' rounds or more, of ' + d.golfers.length + ' with a round'), drill: 'qualified' },
      { label: 'Rounds counted', value: F.num(t.rounds), d: esc(F.num(t.posts) + ' posted, ' + t.trn + ' ' + plural(t.trn, 'tournament card')), drill: 'counted' },
      { label: 'Birdies', value: F.num(t.birdies), d: esc('By every golfer, hole-by-hole rounds'), drill: 'birdies' },
      { label: 'Eagles or better', value: F.num(t.eagles), d: esc(t.aces ? 'Holes in one included' : 'By every golfer'), drill: 'eagles' },
      { label: 'Holes in one', value: F.num(t.aces), d: esc(ace.length === 1 ? d.byId[ace[0].mid].name + ', hole ' + ace[0].hs[ace[0].scores.indexOf(1)].number : t.aces ? 'Each also counts as an eagle' : 'None in this period'), drill: 'aces' }
    ];
  }

  /* ---------------- Panels ---------------- */
  function main(ctx) {
    const d = data(ctx), top = ranked(d, 'gross')[0];
    const take = 'Period shown: ' + ctx.line + '. ' + (d.qual.length
      ? d.qual.length + ' ' + plural(d.qual.length, 'golfer has', 'golfers have') + ' the ' + MIN + ' rounds needed to qualify.' + (top ? ' The lowest round is ' + top.v + ' by ' + top.g.name + ' on ' + F.dateShort(top.g.bestGross.date) + '.' : '')
      : 'No golfer has ' + MIN + ' rounds in this period yet. Choose a longer period, such as Year to date, to fill the boards.');
    return { id: 'rlb-scores', title: 'Lowest scores', take: take, csvId: 'rlb-scores',
      body: '<div class="rlb-cols">' + ['gross', 'net', 'avgGross', 'avgNet'].map(function (k) { return listHTML(d, k, TOP); }).join('') + '</div>' +
        '<div class="rlb-cols rlb-nines"><p class="rlb-split">9-hole rounds, ranked on their own</p>' + ['nine', 'nineNet'].map(function (k) { return listHTML(d, k, TOP9); }).join('') + '</div>',
      desc: H.sents(['These lists rank qualified golfers on their 18-hole rounds; 9-hole rounds have their own lists so the two never mix.',
        'Net is gross less the course handicap of the round. Averages cover every 18-hole round a golfer has in the period.',
        'The period at the top of the page is the season picker: Year to date covers this season so far, and Custom period takes exact dates.']) };
  }
  function panels(ctx) {
    const d = data(ctx), t = d.tot, qB = sum(d.qual.map(function (g) { return g.birdies; })), qE = sum(d.qual.map(function (g) { return g.eagles; })), qA = sum(d.qual.map(function (g) { return g.aces; }));
    const rk = ranked(d, 'rounds')[0], imp = ranked(d, 'improved')[0];
    const under = { id: 'rlb-under', cls: 'wide', title: 'Birdies, eagles and holes in one', csvId: 'rlb-under',
      take: d.qual.length ? 'Qualified golfers made ' + F.num(qB) + ' ' + plural(qB, 'birdie') + ', ' + qE + ' ' + plural(qE, 'eagle') + ' or better and ' + qA + ' ' + plural(qA, 'hole in one', 'holes in one') + ' in ' + ctx.line + '.'
        : 'No golfer has ' + MIN + ' rounds in ' + ctx.line + ' yet.',
      body: '<div class="rlb-cols rlb-cols-3">' + ['birdies', 'eagles', 'aces'].map(function (k) { return listHTML(d, k, TOP); }).join('') + '</div>',
      desc: H.sents(['Totals for the period, counted hole by hole from posted scorecards and tournament cards.',
        t.totalOnly ? t.totalOnly + ' ' + plural(t.totalOnly, 'round was', 'rounds were') + ' posted as a total only and cannot be counted here.' : 'Rounds posted as a total only cannot be counted here.',
        'An eagle is two or more under par on a hole. A hole in one counts on both lists: as a hole in one and as an eagle.']) };
    const played = { id: 'rlb-played', cls: 'wide', title: 'Most rounds and most improved', csvId: 'rlb-played',
      take: rk ? rk.g.name + ' has played the most, ' + rk.v + ' rounds.' + (imp ? ' ' + imp.g.name + ' has improved the most, ' + one(imp.v) + ' off the handicap index.' : '') : 'No golfer has ' + MIN + ' rounds in ' + ctx.line + ' yet.',
      body: '<div class="rlb-cols">' + ['rounds', 'improved'].map(function (k) { return listHTML(d, k, TOP); }).join('') + '</div>',
      desc: H.sents(['Rounds are every posted score, 9 or 18 holes, attested or not, plus completed tournament cards.',
        'Most improved compares a golfer\'s first handicap index revision in the period with their latest, and needs at least two revisions.']) };
    const made = d.records.filter(function (r) { return r.best != null; }).length;
    const holes = { id: 'rlb-holes', cls: 'wide', title: 'Hole records', csvId: 'rlb-holes',
      take: made ? 'The best score recorded on each hole in ' + ctx.line + ', and who made it.' : 'No hole-by-hole round is on file for ' + ctx.line + '.',
      body: '<div class="rlb-cols">' + [[0, 9, 'Front nine'], [9, 18, 'Back nine']].map(function (h) {
        return '<div class="rlb-list"><div class="rlb-list-h"><h3>' + h[2] + '</h3></div><ul class="rlb-rows">' + d.records.slice(h[0], h[1]).map(recordRow).join('') + '</ul></div>';
      }).join('') + '</div>',
      desc: H.sents(['Hole records take in every golfer, qualified or not, from hole-by-hole rounds only.', 'When several golfers share a record, everyone tied is listed, in the order they made it.']) };
    const unq = d.unq, rows = Math.ceil(Math.min(unq.length, UNQ) / 2);
    const not = { id: 'rlb-unq', cls: 'wide', title: 'Not yet qualified', csvId: 'rlb-unq',
      take: unq.length ? unq.length + ' ' + plural(unq.length, 'golfer has', 'golfers have') + ' played in ' + ctx.line + ' but ' + (unq.length === 1 ? 'has' : 'have') + ' fewer than ' + MIN + ' rounds.' : 'Every golfer with a round in ' + ctx.line + ' has qualified.',
      body: unq.length ? '<ul class="rlb-rows rlb-unq" style="--lb-n:' + rows + '">' + unq.slice(0, UNQ).map(unqRow).join('') + '</ul>' : '<p class="rp-empty">Nobody is waiting to qualify.</p>',
      drill: unq.length > UNQ ? 'unqualified' : null, drillLabel: 'See all ' + unq.length,
      foot: unq.length > UNQ ? esc('Showing the ' + UNQ + ' closest to qualifying') : '' };
    return [under, played, holes, not];
  }
  function recordRow(rec) {
    const h = rec.hole, hs = rec.holders;
    if (rec.best == null) return '<li class="rlb-row rlb-hr is-none"><span class="rlb-hr-no"><b>' + h.number + '</b><span>Par ' + h.par + '</span></span><span class="rlb-who"><span class="rlb-sub">No hole-by-hole round in this period</span></span></li>';
    const names = hs.slice(0, NAMES).map(function (x) { return nameLink(x.g) + ' <span class="rlb-hr-d">' + esc(F.dateShort(x.first.date)) + '</span>'; }).join(', ');
    const more = hs.length - NAMES;
    return '<li class="rlb-row rlb-hr" data-lb-hole="' + h.number + '" tabindex="0" aria-haspopup="dialog" aria-label="' + esc('Hole ' + h.number + ', par ' + h.par + '. Best score ' + rec.best + ', held by ' + hs.length + ' ' + plural(hs.length, 'golfer') + '. See who and when') + '">' +
      '<span class="rlb-hr-no"><b>' + h.number + '</b><span>Par ' + h.par + '</span></span>' +
      '<span class="rlb-who"><span class="rlb-hr-names">' + names + (more > 0 ? ' <button type="button" class="rp-link rlb-more" data-drill="hole" data-arg="' + h.number + '" aria-haspopup="dialog" aria-label="' + esc('Hole ' + h.number + ': see all ' + hs.length + ' golfers who share the record') + '">and ' + more + ' more</button>' : '') + '</span></span>' +
      '<span class="rlb-val">' + rec.best + '<span class="rlb-val-s">' + esc(scoreName(rec.best, h.par)) + '</span></span>' + Club.icon('chevronRight', 'rlb-go') + '</li>';
  }
  function unqRow(g) {
    const need = MIN - g.n;
    return '<li class="rlb-row" data-lb-open="' + esc('rounds|' + g.id) + '" tabindex="0" aria-haspopup="dialog" aria-label="' + esc(g.name + ', ' + g.n + ' ' + plural(g.n, 'round') + ' played, ' + need + ' more to qualify. See the rounds') + '">' +
      '<span class="rlb-who">' + nameLink(g) + '<span class="rlb-sub">' + g.n + ' ' + plural(g.n, 'round') + ' played</span></span>' +
      '<span class="rlb-val rlb-need">' + need + ' more<span class="rlb-val-s">to qualify</span></span>' + Club.icon('chevronRight', 'rlb-go') + '</li>';
  }

  /* ---------------- Scorecard (mirrors the grid of the portal's posted score, js/portal/scores.js cardHTML) ---------------- */
  function markClass(v, par) { return v <= par - 2 ? 'is-eagle' : v === par - 1 ? 'is-birdie' : v === par + 1 ? 'is-bogey' : v >= par + 2 ? 'is-double' : ''; }
  function cardGrid(r) {
    if (!r.scores) return '<p class="rd-note">Posted as a total only, so there is no hole-by-hole card.</p>';
    const halves = r.n === 9 ? [[0, 9, r.nine === 'back' ? 'In' : 'Out']] : [[0, 9, 'Out'], [9, 18, 'In']];
    return halves.map(function (h) {
      const idx = []; for (let i = h[0]; i < h[1]; i++) idx.push(i);
      return '<div class="rlb-card-wrap"><table class="rlb-card"><caption class="rlb-sr">' + (h[2] === 'Out' ? 'Front nine' : 'Back nine') + '</caption>' +
        '<tr><th scope="row">Hole</th>' + idx.map(function (i) { return '<th scope="col">' + r.hs[i].number + '</th>'; }).join('') + '<th scope="col">' + h[2] + '</th></tr>' +
        '<tr><th scope="row">Par</th>' + idx.map(function (i) { return '<td>' + r.hs[i].par + '</td>'; }).join('') + '<td>' + sum(idx.map(function (i) { return r.hs[i].par; })) + '</td></tr>' +
        '<tr class="rlb-card-you"><th scope="row">Score</th>' + idx.map(function (i) { const v = r.scores[i], par = r.hs[i].par; return '<td><span class="rlb-sc ' + markClass(v, par) + '">' + v + '</span>' + (v < par ? '<span class="rlb-sr">, ' + scoreName(v, par).toLowerCase() + '</span>' : '') + '</td>'; }).join('') +
          '<td>' + sum(idx.map(function (i) { return r.scores[i]; })) + '</td></tr></table></div>';
    }).join('') +
      '<p class="rlb-legend"><span><span class="rlb-sc is-eagle" aria-hidden="true">2</span> Eagle or better</span><span><span class="rlb-sc is-birdie" aria-hidden="true">3</span> Birdie</span>' +
      '<span><span class="rlb-sc is-bogey" aria-hidden="true">5</span> Bogey</span><span><span class="rlb-sc is-double" aria-hidden="true">6</span> Double bogey or worse</span></p>';
  }
  function openCard(ctx, key) {
    const d = data(ctx), r = d.byKey[key];
    if (!r) { U.toast('That round is no longer on file', 'bad'); return; }
    const par = sum(r.hs.map(function (h) { return h.par; }));
    const stat = function (k, v) { return '<div><span class="label-caps">' + k + '</span><strong>' + esc(v) + '</strong></div>'; };
    const note = r.kind === 'trn'
      ? 'Entered by staff on the tournament card' + (r.index != null ? ', playing off a handicap index of ' + F.handicap(r.index) : '') + '. The course handicap is worked out the way the tournament leaderboard does it.'
      : (r.attestedBy ? 'Attested by ' + mName(r.attestedBy) + '.' : 'Not attested.') + ' Posted by the member' + (r.index != null ? ' off a handicap index of ' + F.handicap(r.index) : '') + '.';
    U.modal({ title: 'Scorecard', eyebrow: d.byId[r.mid].name, size: 'lg', actions: [{ label: 'Close', kind: 'primary' }],
      body: '<div class="rlb-cardbox"><p class="rlb-card-sub">' + esc([F.dateLong(r.date), r.n + ' holes', roundLabel(r)].join(' · ')) + '</p>' +
        '<div class="rlb-card-stats">' + stat('Gross', r.gross) + stat('Course handicap', hcp(r.ch)) + stat('Net', r.net) + stat('To par', toPar(r.gross - par)) + '</div>' +
        cardGrid(r) + '<p class="rd-note">' + esc(note) + '</p></div>' });
  }

  /* ---------------- Drawers ---------------- */
  function table(cols, rows) {
    return '<div class="table-wrap"><table class="table rd-table rlb-table"><thead><tr>' + cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.attrs ? ' class="clickable" tabindex="0" aria-haspopup="dialog" ' + r.attrs : '') + '>' + r.cells.map(function (cell, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + cell + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function meta(ctx) { return [['Period', ctx.from + ' to ' + ctx.to], ['To qualify', MIN + ' rounds or more in the period'], []]; }
  function whoCell(g, sub) { return nameLink(g) + (sub ? '<div class="dd-sub">' + esc(sub) + '</div>' : ''); }
  function qualText(g) { return g.q ? 'Qualified' : (MIN - g.n) + ' more to qualify'; }
  /** Rounds as rows that open their scorecard. cols: extra columns as [label, fn(r)]. */
  function roundsTable(list, mark, extra) {
    extra = extra || [];
    return table([{ label: 'Date' }, { label: 'Round' }, { label: 'Gross', num: true }, { label: 'Net', num: true }].concat(extra.map(function (c) { return { label: c[0], num: true }; })),
      list.map(function (r) {
        return { attrs: 'data-lb-card="' + esc(r.key) + '" aria-label="' + esc(F.date(r.date) + ', ' + roundLabel(r) + ', gross ' + r.gross + ', net ' + r.net + '. Open the scorecard') + '"',
          cells: ['<span class="primary-cell">' + esc(F.dateShort(r.date)) + '</span>', esc(roundLabel(r)) + (r === mark ? ' ' + U.badge('Best', 'good') : '') + '<div class="dd-sub">' + esc(roundSub(r)) + '</div>',
            '<strong>' + r.gross + '</strong>', String(r.net)].concat(extra.map(function (c) { return String(c[1](r)); })) };
      }));
  }
  function roundsCSV(d, list) {
    return [['Date', 'Golfer', 'Member no', 'Source', 'Round', 'Holes', 'Entered', 'Gross', 'Course handicap', 'Net', 'Birdies', 'Eagles or better', 'Holes in one', 'Attested by']].concat(list.map(function (r) {
      const g = d.byId[r.mid];
      return [r.date, g.name, g.m ? g.m.memberNo : '', r.kind === 'trn' ? 'Tournament card' : 'Score post', roundLabel(r), r.n, r.scores ? 'Hole by hole' : 'Total only', r.gross, r.ch, r.net,
        r.scores ? r.birdies : '', r.scores ? r.eagles : '', r.scores ? r.aces : '', r.attestedBy ? mName(r.attestedBy) : ''];
    }));
  }
  function boardCSV(d, key) {
    const b = BOARDS[key];
    return [['Rank', 'Golfer', 'Member no', b.col].concat(b.head)].concat(ranked(d, key).map(function (x) { return [x.pos, x.g.name, x.g.m ? x.g.m.memberNo : '', b.text(x.v)].concat(b.cells(x.g)); }));
  }
  function blocks(ctx, d, keys) {
    let rows = meta(ctx);
    keys.forEach(function (k, i) { rows = rows.concat(i ? [[]] : [], [[BOARDS[k].title]], boardCSV(d, k)); });
    return rows;
  }
  function recordsCSV(d) {
    const rows = [['Hole', 'Par', 'Best score', 'Golfer', 'Member no', 'First made', 'Round', 'Times made']];
    d.records.forEach(function (rec) {
      if (rec.best == null) { rows.push([rec.hole.number, rec.hole.par, '', '', '', '', '', '']); return; }
      rec.holders.forEach(function (x) { rows.push([rec.hole.number, rec.hole.par, rec.best, x.g.name, x.g.m ? x.g.m.memberNo : '', x.first.date, roundLabel(x.first), x.times]); });
    });
    return rows;
  }
  function unqCSV(d) { return [['Golfer', 'Member no', 'Rounds played', 'More to qualify']].concat(d.unq.map(function (g) { return [g.name, g.m ? g.m.memberNo : '', g.n, MIN - g.n]; })); }
  function unqTable(d) {
    return table([{ label: 'Golfer' }, { label: 'Rounds', num: true }, { label: 'To qualify', num: true }], d.unq.map(function (g) {
      return { attrs: 'data-lb-open="' + esc('rounds|' + g.id) + '" aria-label="' + esc(g.name + ', ' + g.n + ' rounds, ' + (MIN - g.n) + ' more to qualify. See the rounds') + '"', cells: [whoCell(g), String(g.n), (MIN - g.n) + ' more'] };
    }));
  }
  /* Clicks inside a drawer: a round opens its scorecard, a golfer opens their rounds */
  function wired(ctx) {
    return function (api, c, open) {
      const act = function (el, e) {
        if (e.target.closest('a')) return;
        if (el.dataset.lbCard) openCard(ctx, el.dataset.lbCard);
        else { const arg = el.dataset.lbOpen; api.close(); setTimeout(function () { open(golferDrill(ctx, arg)); }, 200); }
      };
      U.on(api.el, 'click', '[data-lb-card], [data-lb-open]', function (e, el) { act(el, e); });
      U.on(api.el, 'keydown', '[data-lb-card], [data-lb-open]', function (e, el) { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act(el, e); } });
    };
  }

  /** One golfer: the rounds behind their number on a board. arg: "<board>|<memberId>" */
  function golferDrill(ctx, arg) {
    const d = data(ctx), p = String(arg || '').split('|'), key = BOARDS[p[0]] ? p[0] : 'rounds', b = BOARDS[key], g = d.byId[p[1]];
    if (!g) return { title: 'Golfer', body: H.rNote('This golfer has no round on file in the period.'), csv: [], csvId: 'leaderboard-golfer', noNotes: true };
    const tOnly = g.n - g.cards.length;
    let lead, list, mark = null, extra = null;
    if (b.set === 'r18' || b.set === 'r9') {
      list = g[b.set].slice().sort(function (x, y) { return (b.by === 'net' ? x.net - y.net : x.gross - y.gross) || x.date.localeCompare(y.date); });
      mark = list[0] || null;
      const what = b.set === 'r9' ? '9-hole' : '18-hole';
      lead = !list.length ? 'No ' + what + ' round in this period.'
        : key === 'avgGross' || key === 'avgNet' ? 'Average of ' + list.length + ' ' + what + ' ' + plural(list.length, 'round') + ': ' + one(key === 'avgNet' ? g.avgNet : g.avgGross) + (key === 'avgNet' ? ' net, each round\'s gross less its course handicap.' : ' gross.')
          : 'Best ' + what + ' round: ' + (b.by === 'net' ? mark.net + ' net (gross ' + mark.gross + ' less a course handicap of ' + hcp(mark.ch) + ')' : mark.gross + ' gross') + ' on ' + F.date(mark.date) + ', ' + roundLabel(mark) + '.';
    } else if (b.set === 'cards') {
      list = g.cards; extra = [['Birdies', function (r) { return r.birdies; }], ['Eagles', function (r) { return r.eagles; }], ['Holes in one', function (r) { return r.aces; }]];
      lead = g.birdies + ' ' + plural(g.birdies, 'birdie') + ', ' + g.eagles + ' ' + plural(g.eagles, 'eagle') + ' or better and ' + g.aces + ' ' + plural(g.aces, 'hole in one', 'holes in one') + ' in ' + list.length + ' hole-by-hole ' + plural(list.length, 'round') + '.' +
        (tOnly ? ' ' + tOnly + ' total-only ' + plural(tOnly, 'post has', 'posts have') + ' no hole scores and cannot be counted.' : '') + (g.aces ? ' A hole in one also counts as an eagle.' : '');
    } else {
      list = g.rounds;
      lead = key === 'improved' && g.imp ? 'Handicap index ' + F.handicap(g.imp.from.index) + ' on ' + F.date(g.imp.from.date) + ' to ' + F.handicap(g.imp.to.index) + ' on ' + F.date(g.imp.to.date) + ', over ' + g.imp.n + ' revisions in the period.'
        : g.n + ' ' + plural(g.n, 'round') + ' counted: ' + (g.n - g.trn) + ' posted' + (g.trn ? ' and ' + g.trn + ' from ' + plural(g.trn, 'a tournament card', 'tournament cards') : '') + '.';
    }
    let body = '<p class="rlb-lead">' + esc(lead) + ' ' + esc(g.q ? 'Qualified with ' + g.n + ' rounds.' : 'Not yet qualified: ' + (MIN - g.n) + ' more ' + plural(MIN - g.n, 'round') + ' needed.') + '</p>' + H.rKpis([
      { label: 'Rounds counted', value: String(g.n), sub: esc(g.r18.length + ' of 18 holes, ' + g.r9.length + ' of 9') },
      { label: 'Best 18 holes', value: g.bestGross ? String(g.bestGross.gross) : 'None', sub: esc(g.bestGross ? 'Net ' + g.bestNet.net + ' at best' : 'No 18-hole round') },
      { label: 'Average 18 holes', value: g.avgGross != null ? one(g.avgGross) : 'None', sub: esc(g.avgNet != null ? 'Net ' + one(g.avgNet) : '') },
      { label: 'Birdies and eagles', value: g.birdies + ' and ' + g.eagles, sub: esc(g.aces ? g.aces + ' ' + plural(g.aces, 'hole in one', 'holes in one') : 'In ' + g.cards.length + ' hole-by-hole ' + plural(g.cards.length, 'round')) }
    ]);
    if (key === 'improved' && g.imp) body += H.rSec('Handicap index', esc(g.imp.n + ' revisions in the period'), H.rTable([{ label: 'Date' }, { label: 'Index', num: true }],
      g.imp.list.slice().reverse().map(function (x) { return ['<span class="primary-cell">' + esc(F.date(x.date)) + '</span>', esc(F.handicap(x.index))]; })));
    body += H.rSec(key === 'rounds' || key === 'improved' ? 'Every round' : 'Rounds behind this number', list.length ? 'Select a round for its scorecard' : '', list.length ? roundsTable(list, mark, extra) : H.rNote('Nothing to list.'));
    return { title: g.name, body: body, csv: meta(ctx).concat(roundsCSV(d, list)), csvId: 'leaderboard-golfer', noNotes: true, wire: wired(ctx), go: g.m ? 'members/' + g.id : null, goLabel: g.m ? 'Open member profile' : null };
  }

  /** A whole board. arg: the board's key. */
  function listDrill(ctx, key, title) {
    const d = data(ctx), b = BOARDS[key] || BOARDS.rounds, list = ranked(d, BOARDS[key] ? key : 'rounds');
    key = BOARDS[key] ? key : 'rounds';
    let body = H.rKpis([
      { label: 'Qualified golfers', value: String(d.qual.length), sub: esc(MIN + ' rounds or more') },
      { label: 'On this board', value: String(list.length), sub: esc(b.title) },
      { label: 'Leader', value: list.length ? b.text(list[0].v) : 'None', sub: esc(list.length ? list[0].g.name : '') },
      { label: 'Rounds counted', value: F.num(d.tot.rounds), sub: esc('Every golfer') }
    ]);
    body += H.rSec(b.title, list.length ? 'Select a golfer for the rounds behind the number' : '', list.length ? table([{ label: 'Rank', num: true }, { label: 'Golfer' }, { label: b.col, num: true }], list.map(function (x) {
      return { attrs: 'data-lb-open="' + esc(key + '|' + x.g.id) + '" aria-label="' + esc('Place ' + x.pos + ', ' + x.g.name + ', ' + b.text(x.v) + ' ' + b.unit + '. See the rounds') + '"', cells: [String(x.pos), whoCell(x.g, b.sub(x.g)), '<strong>' + esc(b.text(x.v)) + '</strong>'] };
    })) : H.rNote(d.qual.length ? b.none : 'No golfer has ' + MIN + ' rounds in this period yet. Choose a longer period.'));
    if (key === 'rounds' && d.unq.length) body += H.rSec('Not yet qualified', esc(d.unq.length + ' ' + plural(d.unq.length, 'golfer')), unqTable(d));
    return { title: title || b.title, body: body, csv: blocks(ctx, d, [key]).concat(key === 'rounds' ? [[], ['Not yet qualified']].concat(unqCSV(d)) : []), csvId: 'leaderboard-' + key, noNotes: true, wire: wired(ctx) };
  }
  function unqDrill(ctx) {
    const d = data(ctx);
    return { title: 'Not yet qualified', body: H.rKpis([
      { label: 'Golfers', value: String(d.unq.length), sub: esc('Fewer than ' + MIN + ' rounds') },
      { label: 'One round short', value: String(d.unq.filter(function (g) { return g.n === MIN - 1; }).length), sub: esc(MIN - 1 + ' rounds played') },
      { label: 'Qualified', value: String(d.qual.length), sub: esc(MIN + ' rounds or more') },
      { label: 'Rounds counted', value: F.num(d.tot.rounds), sub: esc('Every golfer') }
    ]) + H.rSec('Closest to qualifying first', 'Select a golfer for their rounds', d.unq.length ? unqTable(d) : H.rNote('Every golfer with a round in this period has qualified.')),
      csv: meta(ctx).concat(unqCSV(d)), csvId: 'leaderboard-not-qualified', noNotes: true, wire: wired(ctx) };
  }
  /** One hole's record: everyone who made it, each time. arg: the hole number. */
  function holeDrill(ctx, arg) {
    const d = data(ctx), rec = d.records[+arg - 1];
    if (!rec || rec.best == null) return { title: 'Hole ' + (arg || ''), body: H.rNote('No hole-by-hole round is on file for this period.'), csv: [], csvId: 'leaderboard-hole', noNotes: true };
    const h = rec.hole;
    const body = H.rKpis([
      { label: 'Par', value: String(h.par), sub: esc('Stroke index ' + h.handicap) },
      { label: 'Best score', value: String(rec.best), sub: esc(scoreName(rec.best, h.par)) },
      { label: 'Held by', value: String(rec.holders.length), sub: esc(plural(rec.holders.length, 'golfer')) },
      { label: 'Times made', value: String(rec.made.length), sub: esc('In this period') }
    ]) + H.rSec('Everyone who made a ' + rec.best, 'Select a row for the scorecard', table([{ label: 'Golfer' }, { label: 'Date' }, { label: 'Round' }], rec.made.map(function (r) {
      const g = d.byId[r.mid];
      return { attrs: 'data-lb-card="' + esc(r.key) + '" aria-label="' + esc(g.name + ', ' + F.date(r.date) + ', ' + roundLabel(r) + '. Open the scorecard') + '"', cells: [whoCell(g, qualText(g)), esc(F.date(r.date)), esc(roundLabel(r))] };
    }))) + H.rNote('Hole records take in every golfer, qualified or not.');
    return { title: 'Hole ' + h.number + ' record', body: body, csvId: 'leaderboard-hole-' + h.number, noNotes: true, wire: wired(ctx),
      csv: meta(ctx).concat([['Hole', 'Par', 'Best score', 'Golfer', 'Member no', 'Date', 'Round']]).concat(rec.made.map(function (r) { const g = d.byId[r.mid]; return [h.number, h.par, rec.best, g.name, g.m ? g.m.memberNo : '', r.date, roundLabel(r)]; })) };
  }
  /** What was counted: where the rounds came from, and every round. */
  function countedDrill(ctx) {
    const d = data(ctx), t = d.tot, months = {};
    d.rounds.forEach(function (r) { const k = r.date.slice(0, 7); months[k] = (months[k] || 0) + 1; });
    const line = function (label, n) { return ['<span class="primary-cell">' + esc(label) + '</span>', F.num(n)]; };
    const body = H.rKpis([
      { label: 'Rounds counted', value: F.num(t.rounds), sub: esc(d.golfers.length + ' ' + plural(d.golfers.length, 'golfer')) },
      { label: 'Posted by members', value: F.num(t.posts), sub: esc(t.attested + ' attested') },
      { label: 'Tournament cards', value: F.num(t.trn), sub: esc('All 18 holes entered') },
      { label: 'Counted once', value: String(d.once), sub: esc('Posted and on a tournament card') }
    ]) + H.rSec('How they were entered', '', H.rTable([{ label: 'Kind' }, { label: 'Rounds', num: true }], [
      line('Posted hole by hole', t.cards - t.trn), line('Posted as a total only', t.totalOnly), line('Tournament cards', t.trn), line('18 holes', t.rounds - t.nine), line('9 holes', t.nine)
    ])) + H.rSec('By month', '', Object.keys(months).length ? H.rTable([{ label: 'Month' }, { label: 'Rounds', num: true }], Object.keys(months).sort().reverse().map(function (k) { return line(H.monthLong(k), months[k]); })) : H.rNote('No round is on file for this period.')) +
      H.rNote('The export lists every round counted, one line each.');
    return { title: 'Rounds counted', body: body, csv: meta(ctx).concat(roundsCSV(d, d.rounds.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }))), csvId: 'leaderboard-rounds', noNotes: true };
  }
  /** Birdies or eagles by every golfer, qualified or not (the summary boxes count everyone). */
  function everyoneDrill(ctx, key) {
    const d = data(ctx), b = BOARDS[key], list = d.golfers.filter(b.has).sort(function (x, y) { return b.val(y) - b.val(x) || x.name.localeCompare(y.name); });
    const total = sum(list.map(b.val)), q = sum(list.filter(function (g) { return g.q; }).map(b.val));
    const body = H.rKpis([
      { label: b.title, value: F.num(total), sub: esc('By every golfer') },
      { label: 'By qualified golfers', value: F.num(q), sub: esc('The figure on the board') },
      { label: 'Golfers', value: String(list.length), sub: esc('With at least one') },
      { label: 'Hole-by-hole rounds', value: F.num(d.tot.cards), sub: esc(d.tot.totalOnly + ' total only, not counted') }
    ]) + H.rSec('Every golfer', list.length ? 'Select a golfer for the rounds behind the number' : '', list.length ? table([{ label: 'Golfer' }, { label: 'Rounds', num: true }, { label: b.col, num: true }], list.map(function (g) {
      return { attrs: 'data-lb-open="' + esc(key + '|' + g.id) + '" aria-label="' + esc(g.name + ', ' + b.val(g) + ' ' + b.unit + '. See the rounds') + '"', cells: [whoCell(g, qualText(g)), String(g.n), '<strong>' + b.val(g) + '</strong>'] };
    })) : H.rNote('None in this period.')) + (key === 'eagles' ? H.rNote('An eagle is two or more under par on a hole. A hole in one counts here and as a hole in one.') : '');
    return { title: b.title + ', every golfer', body: body, csvId: 'leaderboard-' + key + '-everyone', noNotes: true, wire: wired(ctx),
      csv: meta(ctx).concat([['Golfer', 'Member no', 'Rounds', 'Qualified', b.col]]).concat(list.map(function (g) { return [g.name, g.m ? g.m.memberNo : '', g.n, g.q ? 'Yes' : 'No', b.val(g)]; })) };
  }
  function acesDrill(ctx) {
    const d = data(ctx), made = [];
    d.rounds.forEach(function (r) { if (r.scores) r.scores.forEach(function (v, i) { if (v === 1) made.push({ r: r, h: r.hs[i] }); }); });
    made.sort(function (a, b) { return a.r.date.localeCompare(b.r.date); });
    const body = H.rKpis([
      { label: 'Holes in one', value: String(made.length), sub: esc('By every golfer') },
      { label: 'Latest', value: made.length ? F.dateShort(made[made.length - 1].r.date) : 'None', sub: esc(made.length ? d.byId[made[made.length - 1].r.mid].name : '') },
      { label: 'Hole-by-hole rounds', value: F.num(d.tot.cards), sub: esc('Where one can be seen') },
      { label: 'Total only', value: String(d.tot.totalOnly), sub: esc('Cannot be counted') }
    ]) + H.rSec('Each hole in one', made.length ? 'Select a row for the scorecard' : '', made.length ? table([{ label: 'Golfer' }, { label: 'Hole' }, { label: 'Date' }], made.map(function (x) {
      const g = d.byId[x.r.mid];
      return { attrs: 'data-lb-card="' + esc(x.r.key) + '" aria-label="' + esc(g.name + ', hole ' + x.h.number + ', ' + F.date(x.r.date) + '. Open the scorecard') + '"', cells: [whoCell(g, qualText(g)), esc('Hole ' + x.h.number + ', par ' + x.h.par), esc(F.date(x.r.date)) + '<div class="dd-sub">' + esc(roundLabel(x.r)) + '</div>'] };
    })) : H.rNote('No hole in one is on file for this period.')) + H.rNote('A hole in one also counts as an eagle.');
    return { title: 'Holes in one', body: body, csvId: 'leaderboard-holes-in-one', noNotes: true, wire: wired(ctx),
      csv: meta(ctx).concat([['Golfer', 'Member no', 'Hole', 'Par', 'Date', 'Round']]).concat(made.map(function (x) { const g = d.byId[x.r.mid]; return [g.name, g.m ? g.m.memberNo : '', x.h.number, x.h.par, x.r.date, roundLabel(x.r)]; })) };
  }

  /* ---------------- About, CSV, clicks on the page ---------------- */
  function about(ctx) {
    const d = data(ctx);
    return [
      'A golfer qualifies for the boards with ' + MIN + ' rounds in the period shown. Every posted round counts, 9 or 18 holes, attested or not, and so does a tournament card once all 18 holes are entered. Golfers with fewer rounds are listed under Not yet qualified.',
      'Rounds are the scores members post in the members\' portal and the tournament cards staff enter. Public golfers post no scores, so they are not included. Everyone with a round appears: the friends privacy settings of the portal do not apply to this staff page.',
      'When a member also posted a score on the day of a tournament round, the round counts once, from the tournament card.' + (d.once ? ' That applies to ' + d.once + ' ' + plural(d.once, 'round') + ' in this period.' : ''),
      'Lowest scores use 18-hole rounds only; 9-hole rounds have their own lists. Net is gross less the course handicap: the one saved with a posted round, or for a tournament card the one the tournament leaderboard works out from the handicap index on the card. Averages are the mean of a golfer\'s 18-hole rounds in the period, shown to one decimal.',
      'Course handicaps rest on placeholder course ratings until the club\'s official ratings and slopes are entered, so net figures may change.',
      'Birdies, eagles and holes in one are counted from hole-by-hole rounds only; a round posted as a total only cannot be counted. An eagle is two or more under par on a hole. A hole in one counts twice: as a hole in one and as an eagle.',
      'Most improved is the drop in handicap index from a golfer\'s first revision in the period to their latest, and needs at least two revisions. Hole records take in every golfer, qualified or not. Golfers level on a figure share a place.',
      'Par and stroke index come from the club scorecard on file. Period shown: ' + ctx.line + '.'
    ];
  }
  function csv(ctx) {
    const d = data(ctx);
    return [
      { id: 'rlb-scores', title: 'Leaderboard: lowest scores', rows: blocks(ctx, d, ['gross', 'net', 'avgGross', 'avgNet', 'nine', 'nineNet']) },
      { id: 'rlb-under', title: 'Leaderboard: birdies, eagles and holes in one', rows: blocks(ctx, d, ['birdies', 'eagles', 'aces']) },
      { id: 'rlb-played', title: 'Leaderboard: most rounds and most improved', rows: blocks(ctx, d, ['rounds', 'improved']) },
      { id: 'rlb-holes', title: 'Leaderboard: hole records', rows: meta(ctx).concat(recordsCSV(d)) },
      { id: 'rlb-unq', title: 'Leaderboard: not yet qualified', rows: d.unq.length ? meta(ctx).concat(unqCSV(d)) : [] },
      { id: 'rlb-rounds', title: 'Leaderboard: every round counted', rows: d.rounds.length ? meta(ctx).concat(roundsCSV(d, d.rounds.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }))) : [] }
    ];
  }
  function wire(el, ctx, api) {
    const act = function (row, e) {
      if (e.target.closest('a, button')) return;
      if (row.dataset.lbHole) api.drill('hole', row.dataset.lbHole); else api.drill('golfer', row.dataset.lbOpen);
    };
    U.on(el, 'click', '[data-lb-open], [data-lb-hole]', function (e, row) { act(row, e); });
    U.on(el, 'keydown', '[data-lb-open], [data-lb-hole]', function (e, row) { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act(row, e); } });
  }

  Club.reports.addSection({
    id: 'leaderboard', label: 'Leaderboard', order: 55, collections: ['scorePosts', 'tournaments', 'handicapHistory', 'holes'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, wire: wire,
    drills: {
      golfer: golferDrill, list: function (ctx, key) { return listDrill(ctx, key); }, hole: holeDrill, unqualified: unqDrill, counted: countedDrill,
      qualified: function (ctx) { return listDrill(ctx, 'rounds', 'Qualified golfers'); },
      birdies: function (ctx) { return everyoneDrill(ctx, 'birdies'); }, eagles: function (ctx) { return everyoneDrill(ctx, 'eagles'); }, aces: acesDrill
    },
    data: { board: function (ctx, key) { return BOARDS[key] ? ranked(data(ctx), key) : []; }, all: data, MIN: MIN }
  });
})();
