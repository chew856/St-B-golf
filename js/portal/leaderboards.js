/* Portal: Leaderboards (#/leaderboards). The members' boards: This month or This season (the golf season from
   Club.season, or the last one while the course is closed), a chip per board, Gross | Net where both are allowed,
   the ranked golfers with the member's own row marked, and each golfer's counted rounds with their scorecards.

   Staff choose what members see on the staff Leaderboard (Reports > Leaderboard > Members' view), stored as
   getObj('memberLeaderboard'); with it turned off this page and its menu entry are hidden (Portal.register hidden).
   The rounds and ranking are the staff Leaderboard's own (Club.leaderboard in js/shared/leaderboard-data.js), so the
   numbers match. Members who turned off "Show me on the members' leaderboards" (Profile, members.leaderboardHidden)
   are left out here and the places close up. Nothing sensitive is shown: no member numbers, handicap indexes,
   attesters or notes, only names, dates, tees and scores. French: js/i18n/fr-portal.js ("Members' leaderboards").

   Redesign (Nov 22): the period and the board are words with a brass underline, the ranking is a plain list (the
   place and the value in the serif), and the member's own row carries a brass line instead of a filled box. */
(function () {
  'use strict';
  if (!window.Portal || !Portal.register || !Club.leaderboard) return;
  const LB = Club.leaderboard, S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;
  const TEES = { black: 'Black tees', green: 'Green tees', silver: 'Silver tees' };
  const DEC = { avgGross: 1, avgNet: 1, improved: 1 };

  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function num(v, key) { return DEC[key] ? (+v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(v); }
  function isGolfer(m) { const t = m && S.find('membershipTiers', m.tierId); return t ? !!t.golf : !!m && m.handicap != null; }
  function roundLabel(r) { return r.kind === 'trn' ? r.name : r.n === 9 ? (r.nine === 'back' ? 'Back nine' : 'Front nine') : (TEES[r.tees] || '18 holes'); }
  function boardTitle(mb) { return mb.board.label + (mb.score ? ', ' + mb.score : ''); }
  function periodWords(p) { return p.kind === 'month' ? 'this month' : 'this season'; }

  /* ---------------- The page ---------------- */
  function render(view, member) {
    const meId = member.id;
    const st = {
      period: Portal.prefs.get('lbPeriod', null),
      board: Portal.prefs.get('lbBoard', 'low'),
      score: Portal.prefs.get('lbScore', 'net')
    };
    view.innerHTML = '<header class="plb-title"><h1>Leaderboards</h1><p>Every posted round and tournament round counts.</p></header><div class="plb-body"></div>';
    const host = ui.$('.plb-body', view);

    function draw() {
      const s = LB.settings();
      const periods = ['month', 'season'].filter(function (k) { return s.periods[k]; });
      const boards = LB.MEMBER_BOARDS.filter(function (b) { return s.boards[b.id]; });
      if (!boards.length) { host.innerHTML = ui.empty({ icon: 'trophy', title: 'No leaderboards right now', text: 'The club has not chosen any boards to show. Please check back later.' }); return; }
      if (periods.indexOf(st.period) < 0) {
        st.period = LB.defaultPeriod(s);   /* first visit */
      }
      if (!boards.some(function (b) { return b.id === st.board; })) st.board = boards[0].id;
      const mb = LB.memberBoard({ period: st.period, board: st.board, score: st.score, viewerId: meId, settings: s });
      const me = Portal.member() || member;

      let h = '';
      if (periods.length > 1) {
        h += '<div class="plb-period" role="radiogroup" aria-label="Period">' + periods.map(function (k) {
          const on = k === st.period, p = LB.period(k);
          return '<button type="button" role="radio" data-period="' + k + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + ' tabindex="' + (on ? 0 : -1) + '">' + esc(p.label) + '</button>';
        }).join('') + '</div>';
      } else {
        h += '<p class="plb-period-one">' + esc(mb.p.label) + '</p>';
      }
      if (boards.length > 1) {
        h += '<div class="plb-chips" role="group" aria-label="Boards">' + boards.map(function (b) {
          return '<button type="button" class="plb-chip" data-board="' + b.id + '" aria-pressed="' + (b.id === st.board) + '"><span>' + esc(b.label) + '</span></button>';
        }).join('') + '</div>';
      }
      h += '<div class="plb-head"><h2 class="label-caps">' + esc(boardTitle(mb)) + '</h2>' +
        (!mb.board.key && s.scores === 'both' ? '<div class="plb-gn" role="radiogroup" aria-label="Scores">' + ['gross', 'net'].map(function (k) {
          const on = mb.score === k;
          return '<button type="button" role="radio" data-score="' + k + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + ' tabindex="' + (on ? 0 : -1) + '">' + (k === 'gross' ? 'Gross' : 'Net') + '</button>';
        }).join('') + '</div>' : '') + '</div>';

      /* The member's own standing */
      if (mb.me.hidden) {
        h += '<p class="plb-note"><span><span>You are hidden from the members\' leaderboards, so other members do not see you here.</span> <a href="#/profile">Change this in Profile</a></span></p>';
      } else if (mb.me.need > 0 && isGolfer(me)) {
        h += '<div class="plb-need"><span class="plb-need-n">' + esc(mb.me.need + ' more ' + (mb.me.need === 1 ? 'round' : 'rounds') + ' to qualify') + '</span>' +
          '<span class="plb-need-s">' + esc('You have ' + mb.me.n + ' ' + (mb.me.n === 1 ? 'round' : 'rounds') + ' ' + periodWords(mb.p) + '. Post your scores in Scores to count them.') + '</span></div>';
      }

      if (mb.rows.length) {
        const mine = mb.me.row && mb.rows.indexOf(mb.me.row) < 0 ? mb.me.row : null;
        h += '<ol class="plb-list" aria-label="' + esc(boardTitle(mb)) + '">' + mb.rows.map(function (x) { return rowHTML(mb, x); }).join('') + '</ol>' +
          (mine ? '<p class="plb-gap" aria-hidden="true">···</p><ol class="plb-list plb-mine" aria-label="Your place">' + rowHTML(mb, mine) + '</ol>' : '');
      } else {
        h += '<div class="plb-empty">' + ui.empty({ icon: 'trophy',
          title: mb.qualified ? 'Nobody on this board yet' : 'No golfer has qualified yet',
          text: mb.qualified ? 'No qualified golfer is on this board ' + periodWords(mb.p) + ' yet.' : 'Golfers need ' + s.min + ' ' + (s.min === 1 ? 'round' : 'rounds') + ' ' + periodWords(mb.p) + ' to appear here.' }) + '</div>';
      }
      h += '<p class="plb-foot">' + esc(mb.qualified + ' qualified ' + (mb.qualified === 1 ? 'golfer' : 'golfers') + ' · ' + s.min + ' ' + (s.min === 1 ? 'round' : 'rounds') + ' to qualify') + '</p>' +
        (mb.list.length > mb.rows.length ? '<p class="plb-foot-s">' + esc('Top ' + mb.rows.length + ' of ' + mb.list.length + ' shown') + '</p>' : '') +
        (mb.board.id === 'eagles' ? '<p class="plb-foot-s">A hole in one counts as an eagle.</p>' : '') +
        (mb.board.id === 'improved' ? '<p class="plb-foot-s">The drop in handicap index from the first revision ' + esc(periodWords(mb.p)) + ' to the latest.</p>' : '');
      host.innerHTML = h;
      st.mb = mb;
    }
    function rowHTML(mb, x) {
      const g = x.g, you = g.id === meId, v = num(x.v, mb.key);
      return '<li class="plb-li' + (you ? ' is-you' : '') + '"><button type="button" class="plb-row" data-golfer="' + esc(g.id) + '" aria-haspopup="dialog" aria-label="' + esc('Place ' + x.pos + ', ' + (you ? 'You, ' : '') + g.name + ', ' + v + '. See the rounds') + '">' +
        '<span class="plb-pos">' + x.pos + '</span>' +
        '<span class="plb-name">' + (you ? '<b>You</b><span class="plb-dot" aria-hidden="true"> · </span>' : '') + '<span>' + esc(g.name) + '</span></span>' +
        '<span class="plb-val">' + esc(v) + '</span></button></li>';
    }
    draw();

    function pick(k, v) { st[k] = v; Portal.prefs.set('lb' + k.charAt(0).toUpperCase() + k.slice(1), v); draw(); }
    ui.on(host, 'click', '[data-period]', function (e, b) { pick('period', b.dataset.period); const n = ui.$('[data-period="' + b.dataset.period + '"]', host); if (n) n.focus(); });
    ui.on(host, 'click', '[data-board]', function (e, b) {
      pick('board', b.dataset.board);
      const n = ui.$('[data-board="' + b.dataset.board + '"]', host); if (n) { n.focus({ preventScroll: true }); if (n.scrollIntoView) n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
    ui.on(host, 'click', '[data-score]', function (e, b) { pick('score', b.dataset.score); const n = ui.$('[data-score="' + b.dataset.score + '"]', host); if (n) n.focus(); });
    /* Arrow keys move along a radio group */
    ui.on(host, 'keydown', '[role=radio]', function (e, b) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = ui.$$('[role=radio]', b.parentNode), n = all[(all.indexOf(b) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      e.preventDefault(); n.click();
    });
    ui.on(host, 'click', '[data-golfer]', function (e, b) { if (st.mb) openGolfer(st.mb, b.dataset.golfer, meId); });
    const unsub = S.subscribe('$' + LB.KEY, function () { if (host.isConnected) draw(); });
    const unsubM = S.subscribe('members', function () { if (host.isConnected) draw(); });
    return function () { unsub(); unsubM(); };
  }

  /* ---------------- One golfer's counted rounds (read only) ---------------- */
  function openGolfer(mb, id, meId) {
    const g = mb.d.byId[id];
    if (!g || !LB.visible(g)) { ui.toast('That golfer is no longer on this board', 'bad'); return; }
    const b = LB.BOARDS[mb.key], you = id === meId;
    let list, mark = null, head;
    if (b.set === 'r18' || b.set === 'r9') {
      list = g[b.set].slice().sort(function (x, y) { return (b.by === 'net' ? x.net - y.net : x.gross - y.gross) || x.date.localeCompare(y.date); });
      if (mb.board.id === 'low') mark = list[0] || null;
      head = mb.board.id === 'low' ? 'Rounds of 18 holes, best first' : 'Rounds in the average, best first';
    } else if (b.set === 'cards') {
      list = g.cards; head = 'Hole-by-hole rounds, newest first';
    } else {
      list = g.rounds; head = 'Every round, newest first';
    }
    const tile = function (k, v) { return '<div class="plb-tile"><span class="plb-tile-k">' + esc(k) + '</span><span class="plb-tile-v">' + esc(v) + '</span></div>'; };
    const x = mb.list.filter(function (r) { return r.g.id === id; })[0];
    const body = '<div class="plb-sheet">' +
      '<div class="plb-who"><div><p class="plb-who-n">' + (you ? '<b>You</b><span aria-hidden="true"> · </span>' : '') + '<span>' + esc(g.name) + '</span></p>' +
        '<p class="plb-who-s">' + esc(boardTitle(mb)) + '</p>' + (x ? '<p class="plb-who-s">' + esc('Place ' + x.pos + ' · ' + num(x.v, mb.key)) + '</p>' : '') + '</div></div>' +
      '<div class="plb-tiles">' +
        tile('Rounds', String(g.n)) +
        tile('Best gross', g.bestGross ? String(g.bestGross.gross) : '–') +
        tile('Best net', g.bestNet ? String(g.bestNet.net) : '–') +
        tile('Birdies', String(g.birdies)) +
      '</div>' +
      (mb.board.id === 'improved' && g.imp ? '<p class="plb-lead">' + esc('Handicap index down ' + num(g.imp.drop, 'improved') + ' ' + periodWords(mb.p) + '.') + '</p>' : '') +
      '<h3 class="plb-sh">' + esc(head) + '</h3>' +
      (list.length ? '<ul class="plb-rounds">' + list.map(function (r) {
        const best = r === mark;
        return '<li><button type="button" class="plb-round" data-round="' + esc(r.key) + '" aria-haspopup="dialog" aria-label="' + esc(fmt.date(r.date) + ', ' + roundLabel(r) + ', gross ' + r.gross + ', net ' + r.net + (best ? ', best round' : '') + '. Open the scorecard') + '">' +
          '<span class="plb-r-main"><span class="plb-r-d">' + esc(fmt.dateShort(r.date)) + '</span><span class="plb-r-s"><span>' + esc(roundLabel(r)) + '</span>' + (r.n === 9 ? '<span> · </span><span>9 holes</span>' : '') + (r.scores ? '' : '<span> · </span><span>Total only</span>') + '</span></span>' +
          (best ? '<span class="plb-best">Best</span>' : '') +
          (b.set === 'cards' ? '<span class="plb-r-k"><span class="plb-r-kn">' + (mb.key === 'eagles' ? r.eagles : r.birdies) + '</span><span class="plb-r-kl">' + esc(mb.key === 'eagles' ? 'Eagles' : 'Birdies') + '</span></span>' : '') +
          '<span class="plb-r-k"><span class="plb-r-kn">' + r.gross + '</span><span class="plb-r-kl">Gross</span></span>' +
          '<span class="plb-r-k"><span class="plb-r-kn">' + r.net + '</span><span class="plb-r-kl">Net</span></span>' +
          '</button></li>';
      }).join('') + '</ul>' : '<p class="plb-quiet">No rounds to show.</p>') +
      '<p class="plb-quiet">Net is gross less the course handicap of the round.</p>' +
    '</div>';
    const sh = Portal.openSheet({ title: you ? 'Your rounds' : g.name, size: 'full', content: body });
    if (sh.duplicate) return;
    ui.on(sh.body, 'click', '[data-round]', function (e, btn) { openCard(mb, btn.dataset.round); });
  }

  /* ---------------- A scorecard ---------------- */
  function markClass(v, par) { return v <= par - 2 ? 'is-eagle' : v === par - 1 ? 'is-birdie' : v === par + 1 ? 'is-bogey' : v >= par + 2 ? 'is-double' : ''; }
  function scoreWord(v, par) { return v === 1 ? 'hole in one' : v <= par - 2 ? 'eagle' : v === par - 1 ? 'birdie' : ''; }
  function grid(r) {
    if (!r.scores) return '<p class="plb-quiet">Posted as a total only, so there is no hole-by-hole card.</p>';
    const halves = r.n === 9 ? [[0, 9, r.nine === 'back' ? 'In' : 'Out']] : [[0, 9, 'Out'], [9, 18, 'In']];
    return halves.map(function (h) {
      const idx = []; for (let i = h[0]; i < h[1]; i++) idx.push(i);
      return '<div class="plb-card-wrap"><table class="plb-card"><caption class="plb-sr">' + (h[2] === 'Out' ? 'Front nine' : 'Back nine') + '</caption>' +
        '<colgroup><col class="plb-col-l">' + idx.map(function () { return '<col>'; }).join('') + '<col class="plb-col-t"></colgroup>' +
        '<tr><th scope="row">Hole</th>' + idx.map(function (i) { return '<th scope="col">' + r.hs[i].number + '</th>'; }).join('') + '<th scope="col">' + h[2] + '</th></tr>' +
        '<tr><th scope="row">Par</th>' + idx.map(function (i) { return '<td>' + r.hs[i].par + '</td>'; }).join('') + '<td>' + sum(idx.map(function (i) { return r.hs[i].par; })) + '</td></tr>' +
        '<tr class="plb-card-you"><th scope="row">Score</th>' + idx.map(function (i) {
          const v = r.scores[i], par = r.hs[i].par, w = scoreWord(v, par);
          return '<td><span class="plb-sc ' + markClass(v, par) + '">' + v + '</span>' + (w ? '<span class="plb-sr">' + esc(', ' + w) + '</span>' : '') + '</td>';
        }).join('') + '<td>' + sum(idx.map(function (i) { return r.scores[i]; })) + '</td></tr></table></div>';
    }).join('') +
      '<p class="plb-legend"><span><span class="plb-sc is-eagle" aria-hidden="true">2</span><span>Eagle or better</span></span><span><span class="plb-sc is-birdie" aria-hidden="true">3</span><span>Birdie</span></span>' +
      '<span><span class="plb-sc is-bogey" aria-hidden="true">5</span><span>Bogey</span></span><span><span class="plb-sc is-double" aria-hidden="true">6</span><span>Double bogey or worse</span></span></p>';
  }
  function openCard(mb, key) {
    const r = mb.d.byKey[key], g = r && mb.d.byId[r.mid];
    if (!r || !g) { ui.toast('That round is no longer on file', 'bad'); return; }
    const par = sum(r.hs.map(function (h) { return h.par; })), tp = r.gross - par;
    const stat = function (k, v) { return '<div class="plb-tile"><span class="plb-tile-k">' + esc(k) + '</span><span class="plb-tile-v">' + esc(v) + '</span></div>'; };
    Portal.openSheet({ title: 'Scorecard', size: 'full', content: '<div class="plb-sheet">' +
      '<p class="plb-card-sub"><span>' + esc(g.name) + '</span><span aria-hidden="true"> · </span><span>' + esc(fmt.dateLong(r.date)) + '</span></p>' +
      '<p class="plb-card-sub"><span>' + esc(roundLabel(r)) + '</span><span aria-hidden="true"> · </span><span>' + esc(r.n + ' holes') + '</span></p>' +
      '<div class="plb-tiles">' + stat('Gross', String(r.gross)) + stat('Net', String(r.net)) + stat('To par', tp === 0 ? 'Even' : tp > 0 ? '+' + tp : '−' + Math.abs(tp)) + stat('Birdies', String(r.scores ? r.birdies : '–')) + '</div>' +
      grid(r) + (r.kind === 'trn' ? '<p class="plb-quiet">From the tournament card entered by the club.</p>' : '') + '</div>' });
  }

  Portal.register({
    id: 'leaderboards', label: 'Leaderboards', short: 'Boards', icon: 'trophy', order: 74, tab: false,
    hidden: function () { return !LB.settings().show; },
    render: function (view, params, member) { return render(view, Portal.member() || member); }
  });
})();
