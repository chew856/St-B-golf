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
   Everyone appears: the friends privacy settings of the portal do not apply to this staff page.
   The rounds and the ranking rules live in js/shared/leaderboard-data.js (Club.leaderboard), shared with the members'
   Leaderboards page in the portal (js/portal/leaderboards.js). The "Members' view" panel at the end of this section
   chooses what members see there (getObj('memberLeaderboard')); staff boards always show every board and golfer. */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc, H = Club.reports.h, plural = H.plural;
  const LB = Club.leaderboard;              /* the board maths, shared with the members' portal (js/shared/leaderboard-data.js) */
  if (!LB) return;
  const MIN = LB.MIN;                       /* rounds in the period to qualify */
  const TOP = 5, TOP9 = 3, NAMES = 2, UNQ = 8;   /* rows shown on the page before "See all" */
  const TEES = { black: 'Black tees', green: 'Green tees', silver: 'Silver tees' };
  const MINUS = '−';

  /* ---------------- Helpers ---------------- */
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function mName(id) { const m = Club.members.get(id); return m ? Club.members.name(m) : 'Former member'; }
  function nameLink(g) { return g.m ? '<a class="rlb-name" href="#/members/' + esc(g.id) + '">' + esc(g.name) + '</a>' : '<span class="rlb-name muted">Former member</span>'; }
  /** A member who chose not to appear on the members' boards in the portal: still listed here, with a small note. */
  function hiddenNote(g) { return g.m && g.m.leaderboardHidden ? ' <span class="rlb-hidden-note">Hidden from members</span>' : ''; }
  function hcp(v) { return v < 0 ? '+' + Math.abs(v) : String(v); }
  function toPar(v) { return v === 0 ? 'Even' : v > 0 ? '+' + v : MINUS + Math.abs(v); }
  function roundLabel(r) { return r.kind === 'trn' ? r.name : (r.n === 9 ? (r.nine === 'back' ? 'Back nine, ' : 'Front nine, ') : '') + (TEES[r.tees] || 'Tees not recorded'); }
  function roundSub(r) { return r.kind === 'trn' ? 'Tournament card' : (r.scores ? '' : 'Total only. ') + (r.attestedBy ? 'Attested by ' + mName(r.attestedBy) : 'Not attested'); }
  function when(r) { return F.dateShort(r.date) + ', ' + roundLabel(r); }
  function scoreName(v, par) { return v === 1 ? 'Hole in one' : v === par - 3 ? 'Albatross' : v === par - 2 ? 'Eagle' : v === par - 1 ? 'Birdie' : v === par ? 'Par' : v === par + 1 ? 'Bogey' : 'Over par'; }

  /* ---------------- The rounds, golfers and hole records of the period (Club.leaderboard.compute) ---------------- */
  function data(ctx) {
    return H.memo(ctx, 'leaderboard', function () { return LB.compute(ctx.from, ctx.to, MIN); });
  }

  /* ---------------- The boards ----------------
     has(g): the golfer belongs on the board; val(g): what ranks them (lower is better unless desc); text(v): how it reads;
     sub(g): the line under the name; set: which of the golfer's rounds sit behind the number. */
  function one(v) { return v.toFixed(1); }
  const BOARDS = {
    gross: { title: 'Best round, gross', col: 'Gross', unit: 'gross', text: String,
      sub: function (g) { return when(g.bestGross); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['Net', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.bestGross; return [r.net, r.ch, r.date, roundLabel(r)]; } },
    net: { title: 'Best round, net', col: 'Net', unit: 'net', text: String,
      sub: function (g) { return when(g.bestNet) + ', gross ' + g.bestNet.gross; }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['Gross', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.bestNet; return [r.gross, r.ch, r.date, roundLabel(r)]; } },
    avgGross: { title: 'Best average, gross', col: 'Average gross', unit: 'average gross', text: one,
      sub: function (g) { return 'Over ' + g.r18.length + ' ' + plural(g.r18.length, 'round'); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['18-hole rounds'], cells: function (g) { return [g.r18.length]; } },
    avgNet: { title: 'Best average, net', col: 'Average net', unit: 'average net', text: one,
      sub: function (g) { return 'Over ' + g.r18.length + ' ' + plural(g.r18.length, 'round'); }, none: 'No 18-hole round by a qualified golfer in this period.',
      head: ['18-hole rounds'], cells: function (g) { return [g.r18.length]; } },
    nine: { title: 'Best 9 holes, gross', col: 'Gross', unit: 'gross over 9 holes', text: String,
      sub: function (g) { return when(g.best9); }, none: 'No 9-hole round by a qualified golfer in this period.',
      head: ['Net', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.best9; return [r.net, r.ch, r.date, roundLabel(r)]; } },
    nineNet: { title: 'Best 9 holes, net', col: 'Net', unit: 'net over 9 holes', text: String,
      sub: function (g) { return when(g.best9Net) + ', gross ' + g.best9Net.gross; }, none: 'No 9-hole round by a qualified golfer in this period.',
      head: ['Gross', 'Course handicap', 'Date', 'Round'], cells: function (g) { const r = g.best9Net; return [r.gross, r.ch, r.date, roundLabel(r)]; } },
    birdies: { title: 'Birdies', col: 'Birdies', unit: 'birdies', text: String,
      sub: function (g) { return 'In ' + g.cards.length + ' hole-by-hole ' + plural(g.cards.length, 'round'); }, none: 'No birdie by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    eagles: { title: 'Eagles or better', col: 'Eagles or better', unit: 'eagles or better', text: String,
      sub: function (g) { return 'In ' + g.cards.length + ' hole-by-hole ' + plural(g.cards.length, 'round'); }, none: 'No eagle by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    aces: { title: 'Holes in one', col: 'Holes in one', unit: 'holes in one', text: String,
      sub: function (g) { return g.cards.filter(function (r) { return r.aces; }).map(function (r) { return 'Hole ' + r.hs[r.scores.indexOf(1)].number + ', ' + F.dateShort(r.date); }).join('; '); }, none: 'No hole in one by a qualified golfer in this period.',
      head: ['Hole-by-hole rounds'], cells: function (g) { return [g.cards.length]; } },
    rounds: { title: 'Most rounds played', col: 'Rounds', unit: 'rounds', text: String,
      sub: function (g) { return (g.n - g.trn) + ' posted' + (g.trn ? ', ' + g.trn + ' ' + plural(g.trn, 'tournament') : ''); }, none: 'No golfer has ' + MIN + ' rounds in this period yet.',
      head: ['Posted', 'Tournament cards', '18 holes', '9 holes'], cells: function (g) { return [g.n - g.trn, g.trn, g.r18.length, g.r9.length]; } },
    improved: { title: 'Most improved', col: 'Handicap index drop', unit: 'off the handicap index', text: one,
      sub: function (g) { return 'Index ' + F.handicap(g.imp.from.index) + ' to ' + F.handicap(g.imp.to.index); }, none: 'No qualified golfer lowered their handicap index in this period.',
      head: ['From', 'To', 'First revision', 'Latest revision', 'Revisions'], cells: function (g) { return [g.imp.from.index, g.imp.to.index, g.imp.from.date, g.imp.to.date, g.imp.n]; } }
  };
  /* How each board ranks (set, by, desc, has, val, date) is shared with the portal */
  Object.keys(BOARDS).forEach(function (k) { Object.assign(BOARDS[k], LB.BOARDS[k]); });
  /** Qualified golfers on a board, best first; equal values share a place. */
  function ranked(d, key) { return LB.ranked(d, key); }
  function rowHTML(key, x) {
    const b = BOARDS[key], g = x.g, txt = b.text(x.v);
    return '<li class="rlb-row" data-lb-open="' + esc(key + '|' + g.id) + '" tabindex="0" aria-haspopup="dialog" aria-label="' + esc('Place ' + x.pos + ', ' + g.name + ', ' + txt + ' ' + b.unit + '. See the rounds behind it') + '">' +
      '<span class="rlb-pos">' + x.pos + '</span><span class="rlb-who">' + nameLink(g) + hiddenNote(g) + '<span class="rlb-sub">' + esc(b.sub(g)) + '</span></span>' +
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
    return [under, played, holes, not, membersPanel()];
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
  function whoCell(g, sub) { return nameLink(g) + hiddenNote(g) + (sub ? '<div class="dd-sub">' + esc(sub) + '</div>' : ''); }
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
      return { attrs: 'data-lb-open="' + esc('rounds|' + g.id) + '" aria-label="' + esc(g.name + ', ' + g.n + ' ' + plural(g.n, 'round') + ', ' + (MIN - g.n) + ' more to qualify. See the rounds') + '"', cells: [whoCell(g), String(g.n), (MIN - g.n) + ' more'] };
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

  /* ---------------- Members' view: what members see on Leaderboards in the portal ----------------
     One settings object, getObj('memberLeaderboard') through Club.leaderboard.settings() and save(). Every change is
     saved straight away with an Undo toast; the panel redraws from the store, so Undo and other tabs show here too. */
  const MV_MIN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20], MV_TOP = [5, 10, 15, 20, 25, 30, 40, 50, 100];
  const MV_SCORES = [['gross', 'Gross'], ['net', 'Net'], ['both', 'Both']];
  const MV_PERIODS = [['month', 'This month'], ['season', 'This season']];
  function mvSwitch(attr, label, on, sub) {
    const id = 'rlb-mv-' + attr.replace(/[^a-z0-9]+/gi, '-');
    return '<label class="rlb-mv-sw" for="' + id + '"><span class="toggle"><input type="checkbox" id="' + id + '" ' + attr + (on ? ' checked' : '') + '><span></span></span>' +
      '<span class="rlb-mv-sw-t"><span class="rlb-mv-sw-l">' + esc(label) + '</span>' + (sub ? '<span class="rlb-mv-sw-s">' + esc(sub) + '</span>' : '') + '</span></label>';
  }
  function mvOptions(list, v, unit) {
    const all = list.indexOf(v) >= 0 ? list : list.concat([v]).sort(function (a, b) { return a - b; });
    return all.map(function (n) { return '<option value="' + n + '"' + (n === v ? ' selected' : '') + '>' + n + (unit ? ' ' + plural(n, unit[0], unit[1]) : '') + '</option>'; }).join('');
  }
  function hiddenMembers() { return S.all('members').filter(function (m) { return m.leaderboardHidden; }); }
  function membersBody() {
    const s = LB.settings(), hid = hiddenMembers().length;
    return '<div class="rlb-mv' + (s.show ? '' : ' is-off') + '">' +
      '<div class="rlb-mv-top">' + mvSwitch('data-mv-show', 'Show members\' leaderboards in the portal', s.show, s.show ? 'Members find Leaderboards in the portal menu' : 'Off: the page and its menu entry are hidden from members') +
        '<button type="button" class="btn btn-sm" data-mv-preview aria-haspopup="dialog">' + Club.icon('eye') + 'Preview as a member</button></div>' +
      '<div class="rlb-mv-cols">' +
        '<fieldset class="rlb-mv-group"><legend class="label-caps">Boards shown to members</legend>' +
          LB.MEMBER_BOARDS.map(function (b) { return mvSwitch('data-mv-board="' + b.id + '"', b.label, s.boards[b.id], b.key ? '' : 'Gross and net'); }).join('') + '</fieldset>' +
        '<div class="rlb-mv-side">' +
          '<fieldset class="rlb-mv-group"><legend class="label-caps">Periods</legend>' +
            MV_PERIODS.map(function (p) { return mvSwitch('data-mv-period="' + p[0] + '"', p[1], s.periods[p[0]], p[0] === 'season' ? Club.season.dayLabel() + ', from Settings' : ''); }).join('') + '</fieldset>' +
          '<div class="rlb-mv-group"><span class="label-caps" id="rlb-mv-sc-l">Scores</span>' +
            '<div class="segmented rlb-mv-seg" role="radiogroup" aria-labelledby="rlb-mv-sc-l">' + MV_SCORES.map(function (x) {
              const on = s.scores === x[0];
              return '<button type="button" role="radio" data-mv-scores="' + x[0] + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + ' tabindex="' + (on ? 0 : -1) + '">' + x[1] + '</button>';
            }).join('') + '</div><p class="rlb-mv-hint">For Low round and Best average. Both lets members switch.</p></div>' +
          '<div class="rlb-mv-nums">' +
            '<div class="field"><label for="rlb-mv-min">Rounds to qualify</label><select class="select" id="rlb-mv-min" data-mv-num="min">' + mvOptions(MV_MIN, s.min, ['round', 'rounds']) + '</select></div>' +
            '<div class="field"><label for="rlb-mv-top">Show top</label><select class="select" id="rlb-mv-top" data-mv-num="top">' + mvOptions(MV_TOP, s.top, ['golfer', 'golfers']) + '</select></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p class="rlb-mv-foot">' + esc('Staff still see every board, every golfer and every number on this staff Leaderboard, with ' + MIN + ' rounds to qualify.' +
        (hid ? ' ' + hid + ' ' + plural(hid, 'member has', 'members have') + ' chosen in the portal not to appear on the members\' boards; they are marked "Hidden from members" here.' : ' Members can choose in their portal Profile not to appear on the members\' boards.')) + '</p>' +
    '</div>';
  }
  function membersPanel() {
    return { id: 'rlb-members', cls: 'wide', title: 'Members\' view', take: 'What members see on Leaderboards in the portal. Changes apply straight away and can be undone.', body: membersBody() };
  }
  /** Save one change with Undo. what: the toast text. */
  function mvChange(what, patch) {
    const cur = LB.settings(), next = patch(JSON.parse(JSON.stringify(cur)));
    if (JSON.stringify(next) === JSON.stringify(cur)) return;
    if (Club.undo) Club.undo.run(function () { LB.save(next); }, { message: what, undone: 'Members\' view change undone' });
    else { LB.save(next); U.toast(what); }
  }
  function wireMembers(el) {
    const panel = el.querySelector('[data-panel="rlb-members"]'), host = panel && U.$('.rp-pb', panel);
    if (!host) return;
    const redraw = function () {
      if (!host.isConnected) { unsub(); return; }
      const a = document.activeElement, key = a && host.contains(a) ? ['data-mv-show', 'data-mv-board', 'data-mv-period', 'data-mv-scores', 'data-mv-num', 'data-mv-preview'].map(function (k) { return a.hasAttribute(k) ? '[' + k + (a.getAttribute(k) ? '="' + a.getAttribute(k) + '"' : '') + ']' : ''; }).join('') : '';
      const wasBtn = a && a.classList && a.classList.contains('cs-btn') ? a.nextElementSibling : null;
      host.innerHTML = membersBody();
      const back = wasBtn && wasBtn.dataset && wasBtn.dataset.mvNum ? host.querySelector('[data-mv-num="' + wasBtn.dataset.mvNum + '"]') : key ? host.querySelector(key) : null;
      if (back) setTimeout(function () { (back.previousElementSibling && back.previousElementSibling.classList.contains('cs-btn') ? back.previousElementSibling : back).focus({ preventScroll: true }); }, 0);
    };
    const unsub = S.subscribe('$' + LB.KEY, redraw);
    const unsubM = S.subscribe('members', function () { if (host.isConnected) { const f = U.$('.rlb-mv-foot', host), tmp = document.createElement('div'); tmp.innerHTML = membersBody(); if (f) f.innerHTML = U.$('.rlb-mv-foot', tmp).innerHTML; } else unsubM(); });
    U.on(host, 'change', 'input[data-mv-show]', function (e, f) {
      const on = f.checked;
      mvChange(on ? 'Members\' leaderboards shown in the portal' : 'Members\' leaderboards hidden from the portal', function (s) { s.show = on; return s; });
    });
    U.on(host, 'change', 'input[data-mv-board]', function (e, f) {
      const id = f.dataset.mvBoard, b = LB.MEMBER_BOARDS.filter(function (x) { return x.id === id; })[0], s0 = LB.settings();
      if (!f.checked && LB.MEMBER_BOARDS.filter(function (x) { return s0.boards[x.id]; }).length <= 1) {
        f.checked = true; U.toast('Keep at least one board. To hide them all, turn off the members\' leaderboards.', 'bad'); return;
      }
      mvChange(b.label + (f.checked ? ' shown to members' : ' hidden from members'), function (s) { s.boards[id] = f.checked; return s; });
    });
    U.on(host, 'change', 'input[data-mv-period]', function (e, f) {
      const id = f.dataset.mvPeriod, p = MV_PERIODS.filter(function (x) { return x[0] === id; })[0], s0 = LB.settings();
      if (!f.checked && !s0.periods[id === 'month' ? 'season' : 'month']) { f.checked = true; U.toast('Keep at least one period for members.', 'bad'); return; }
      mvChange(p[1] + (f.checked ? ' shown to members' : ' hidden from members'), function (s) { s.periods[id] = f.checked; return s; });
    });
    U.on(host, 'click', '[data-mv-scores]', function (e, b) {
      const v = b.dataset.mvScores;
      mvChange(v === 'both' ? 'Members see gross and net' : 'Members see ' + v + ' scores only', function (s) { s.scores = v; return s; });
    });
    U.on(host, 'keydown', '[data-mv-scores]', function (e, b) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const all = U.$$('[data-mv-scores]', host), n = all[(all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      n.focus(); n.click();
    });
    U.on(host, 'change', 'select[data-mv-num]', function (e, f) {
      const k = f.dataset.mvNum, v = +f.value;
      mvChange(k === 'min' ? 'Members need ' + v + ' ' + plural(v, 'round') + ' to qualify' : 'Members see the top ' + v + ' ' + plural(v, 'golfer'), function (s) { s[k] = v; return s; });
    });
    U.on(host, 'click', '[data-mv-preview]', function () { openPreview(); });
  }

  /* "Preview as a member": the members' page as a member sees it, from the same Club.leaderboard.memberBoard. */
  function openPreview() {
    const st = { period: null, board: null, score: 'net' };
    const api = U.drawer({ eyebrow: 'Preview as a member', title: 'Leaderboards', body: '<div class="rlb-pv"></div>', actions: [{ label: 'Close', kind: 'ghost' }] });
    if (api.duplicate) return;
    api.el.classList.add('rlb-pv-drawer');
    const host = U.$('.rlb-pv', api.body);
    function draw() {
      const s = LB.settings();
      const periods = MV_PERIODS.filter(function (p) { return s.periods[p[0]]; }), boards = LB.MEMBER_BOARDS.filter(function (b) { return s.boards[b.id]; });
      if (!periods.some(function (p) { return p[0] === st.period; })) st.period = LB.defaultPeriod(s);
      if (!boards.some(function (b) { return b.id === st.board; })) st.board = boards.length ? boards[0].id : null;
      const mb = boards.length ? LB.memberBoard({ period: st.period, board: st.board, score: st.score, settings: s }) : null;
      const per = function (k) { return LB.period(k); };
      let h = s.show ? '' : '<p class="rlb-pv-off">' + Club.icon('info') + '<span>The members\' leaderboards are turned off, so members do not see this page or its menu entry. This is what they would see.</span></p>';
      h += '<div class="rlb-pv-phone">';
      if (periods.length > 1) h += '<div class="segmented rlb-pv-seg" role="radiogroup" aria-label="Period">' + periods.map(function (p) { const on = p[0] === st.period; return '<button type="button" role="radio" data-pv-period="' + p[0] + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + '>' + esc(per(p[0]).label) + '</button>'; }).join('') + '</div>';
      else h += '<p class="rlb-pv-one">' + esc(per(st.period).label) + '</p>';
      if (boards.length > 1) h += '<div class="rlb-pv-chips" role="group" aria-label="Board">' + boards.map(function (b) { return '<button type="button" class="rlb-pv-chip" data-pv-board="' + b.id + '" aria-pressed="' + (b.id === st.board) + '">' + esc(b.label) + '</button>'; }).join('') + '</div>';
      if (mb) {
        const b = mb.board, title = b.label + (mb.score ? ', ' + mb.score : '');
        h += '<div class="rlb-pv-h"><span class="label-caps">' + esc(title) + '</span>' + (!b.key && s.scores === 'both' ? '<div class="segmented rlb-pv-gn" role="radiogroup" aria-label="Scores">' + ['gross', 'net'].map(function (k) { const on = mb.score === k; return '<button type="button" role="radio" data-pv-score="' + k + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + '>' + (k === 'gross' ? 'Gross' : 'Net') + '</button>'; }).join('') + '</div>' : '') + '</div>';
        h += mb.rows.length ? '<ol class="rlb-pv-list">' + mb.rows.map(function (x) {
          return '<li><span class="rlb-pv-pos">' + x.pos + '</span>' + U.avatar(x.g.name, 'sm', true) + '<span class="rlb-pv-name">' + esc(x.g.name) + '</span><span class="rlb-pv-val">' + esc(mb.key === 'avgGross' || mb.key === 'avgNet' || mb.key === 'improved' ? one(x.v) : String(x.v)) + '</span></li>';
        }).join('') + '</ol>' : '<p class="rp-empty">' + esc(mb.qualified ? 'Nobody on this board yet.' : 'No golfer has ' + s.min + ' ' + plural(s.min, 'round') + ' ' + (st.period === 'month' ? 'this month' : 'this season') + ' yet.') + '</p>';
        h += '<p class="rlb-pv-foot">' + esc(mb.qualified + ' qualified ' + plural(mb.qualified, 'golfer') + ' · ' + s.min + ' ' + plural(s.min, 'round') + ' to qualify') + (mb.list.length > mb.rows.length ? esc(' · top ' + mb.rows.length + ' of ' + mb.list.length + ' shown') : '') + '</p>';
      }
      h += '</div><p class="rlb-pv-note">Members also see their own row highlighted, and how many more rounds they need when they are short. Members who chose to be hidden are left out, and the places close up.</p>';
      host.innerHTML = h;
    }
    draw();
    U.on(host, 'click', '[data-pv-period]', function (e, b) { st.period = b.dataset.pvPeriod; draw(); });
    U.on(host, 'click', '[data-pv-board]', function (e, b) { st.board = b.dataset.pvBoard; draw(); });
    U.on(host, 'click', '[data-pv-score]', function (e, b) { st.score = b.dataset.pvScore; draw(); });
    const unsub = S.subscribe('$' + LB.KEY, function () { if (host.isConnected) draw(); else unsub(); });
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
    wireMembers(el);
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
