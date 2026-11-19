/* Public site: Play (the live scorecard, Club.playView in js/portal/play.js) for a signed-in public golfer whose
   booking today carries their account (publicPlayerId), and My rounds in My account: the rounds a finished scorecard
   posted to this account ('publicRounds', written by Club.play.finish in js/shared/play-data.js). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, P = Club.play;
  if (!window.Pub || !P || !Club.playView) return;

  /* A sheet on the public site is a modal: the body, then the footer's buttons under it. */
  function sheet(o) {
    const m = ui.modal({ title: o.title, body: '<div class="lv-pubsheet">' + o.html + (o.footer ? '<div class="lv-pubsheet-foot">' + o.footer + '</div>' : '') + '</div>', size: 'lg' });
    const foot = m.body.querySelector('.lv-pubsheet-foot');
    return { body: m.body, foot: foot, close: m.close || function () {} };
  }
  function ctx(p, id) { return { teeTimeId: id, who: P.viewerPublic(p), surface: 'public', doneHref: '#/bookings', sheet: sheet }; }

  Pub.register({
    id: 'play', label: 'Play', title: 'Play', auth: true, nav: { label: 'Play', order: 8, auth: true, icon: 'flag' },
    render: function (view, params, p) {
      p = Pub.me(); if (!p) return;
      const who = P.viewerPublic(p);
      if (params[0]) return Club.playView(view, ctx(p, params[0]));
      const list = P.teeTimesToday(who);
      if (list.length === 1) return Club.playView(view, ctx(p, list[0].id));
      view.innerHTML = '<div class="lv-root"><header class="lv-band"><p class="lv-band-k">Live scorecard</p><h1 class="lv-band-h">Play</h1></header>' +
        (list.length ? '<div class="lv-list">' + list.map(function (tt) { return Club.playCard(tt, who, '#/play/' + encodeURIComponent(tt.id)); }).join('') + '</div>'
          : '<div class="lv-panel">' + ui.empty({ icon: 'flag', title: 'No tee time today', text: 'Play opens 5 minutes before a tee time you have booked. Everyone in your group with an account can then keep score together, on their own phone.', action: '<a class="btn btn-primary" href="#/">Find a tee time</a>' }) + '</div>') +
        '</div>';
    }
  });

  /** My bookings: the Play button on a booking today (Club.playCard's states, as a small button). */
  Pub.playButton = function (tt) {
    const p = Pub.me(); if (!p || !tt || tt.date !== Pub.today() || tt.status === 'cancelled' || tt.status === 'no-show') return '';
    const who = P.viewerPublic(p); if (!P.inGroup(tt, who)) return '';
    const r = P.sync.round(tt.id), w = P.windowFor(tt);
    if (!r && !w.open) return '<button type="button" class="btn btn-sm lv-cta-off" disabled aria-disabled="true" data-opens="' + esc(w.opensAt) + '">' + esc('Play opens at ' + fmt.time(w.opensAt)) + '</button>';
    return '<a class="btn btn-sm ' + (r && r.status === 'finished' ? '' : 'btn-primary') + '" href="#/play/' + encodeURIComponent(tt.id) + '">' + Club.icon('flag') + '<span>' + (r && r.status === 'finished' ? 'See the scorecard' : 'Play') + '</span></a>';
  };

  /* ---------------- My account: My rounds ---------------- */
  const SHOW = 5;
  let all = false;
  function roundsOf(p) { return S.where('publicRounds', function (r) { return r.publicPlayerId === p.id; }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }); }
  function gameLine(r) {
    const g = P.engine.gameOf(r.game);
    return (r.game === 'skins' ? 'Skins with carry-over' : r.game === 'skins-nc' ? 'Skins, no carry-over' : g.label) + ', ' + (r.scoring === 'gross' ? 'gross' : 'net');
  }
  Pub.addAccountSection({
    order: 2,   /* first of the added panels, under Receipts */
    html: function (p) {
      const list = roundsOf(p), shown = all ? list : list.slice(0, SHOW);
      return '<section class="panel lv-myr" data-reveal aria-labelledby="lv-myr-h"><div class="panel-head"><div><div class="eyebrow">Live scorecard</div><h3 id="lv-myr-h">My rounds</h3></div>' + Club.icon('flag', 'pub-head-icon') + '</div>' +
        '<div class="panel-body' + (list.length ? ' flush' : '') + '">' +
        (list.length ? '<ul class="lv-myr-list">' + shown.map(function (r) {
          return '<li><button type="button" class="lv-myr-row" data-round="' + esc(r.id) + '" aria-label="' + esc('Open the scorecard from ' + fmt.date(r.date) + ', gross ' + r.gross) + '">' +
            '<span class="lv-myr-main"><span class="lv-myr-t">' + esc(fmt.date(r.date) + ' · ' + fmt.time(r.time) + ' · ' + r.holes + ' holes') + '</span>' +
            '<span class="lv-myr-s">' + esc(gameLine(r) + (r.playedWith && r.playedWith.length ? ' · with ' + r.playedWith.join(', ') : '')) + '</span></span>' +
            '<span class="lv-myr-v"><span class="lv-myr-g">' + r.gross + '</span><small>' + esc(r.scoring === 'net' ? 'Net ' + r.net : 'Gross') + '</small></span>' + Club.icon('chevronRight', 'pub-rc-go') + '</button></li>';
        }).join('') + '</ul>' + (list.length > SHOW ? '<div class="pub-rc-more"><button type="button" class="pub-link" data-act="lv-myr-all">' + (all ? 'Show fewer' : 'Show all ' + list.length + ' rounds') + '</button></div>' : '')
          : ui.empty({ icon: 'flag', title: 'No rounds yet', text: 'When you keep score with Play on the course, your finished rounds are kept here with the scorecard.' })) +
        '</div></section>';
    },
    wire: function (root, p, redraw) {
      ui.on(root, 'click', '[data-round]', function (e, b) { open(b.dataset.round); });
      ui.on(root, 'click', '[data-act=lv-myr-all]', function () { all = !all; redraw(); ui.$$('[data-reveal]', root).forEach(function (n) { n.classList.add('revealed'); }); });
    }
  });
  function open(id) {
    const me = Pub.me(), r = S.find('publicRounds', id);
    if (!me || !r || r.publicPlayerId !== me.id) return;
    const half = function (from, to, label) {
      const idx = []; for (let i = from; i < to && i < r.holeNumbers.length; i++) idx.push(i);
      if (!idx.length) return '';
      const tot = function (arr) { return idx.reduce(function (a, i) { return a + arr[i]; }, 0); };
      return '<table class="lv-card lv-card-h"><thead><tr><th scope="row">Hole</th>' + idx.map(function (i) { return '<th scope="col">' + r.holeNumbers[i] + '</th>'; }).join('') + '<th scope="col">' + label + '</th></tr></thead><tbody>' +
        '<tr><th scope="row">Par</th>' + idx.map(function (i) { return '<td>' + r.pars[i] + '</td>'; }).join('') + '<td>' + tot(r.pars) + '</td></tr>' +
        '<tr class="lv-card-tot"><th scope="row">Score</th>' + idx.map(function (i) { return '<td class="' + (r.holeScores[i] < r.pars[i] ? 'is-under' : '') + '">' + r.holeScores[i] + '</td>'; }).join('') + '<td>' + tot(r.holeScores) + '</td></tr></tbody></table>';
    };
    const body = '<div class="lv-myr-card">' +
      '<p class="lv-help">' + esc(fmt.date(r.date) + ', ' + fmt.time(r.time) + ' · ' + r.holes + ' holes · ' + ({ black: 'Black', green: 'Green', silver: 'Silver' }[r.tees] || r.tees) + ' tees') + '</p>' +
      '<dl class="lv-kv"><div><dt>Gross</dt><dd>' + r.gross + '</dd></div><div><dt>Net</dt><dd>' + r.net + '</dd></div><div><dt>Par</dt><dd>' + r.par + '</dd></div>' +
        (r.result ? '<div><dt>' + esc(gameLine(r)) + '</dt><dd>' + esc(placeText(r.result.rank, r.result.of)) + '</dd></div>' : '') + '</dl>' +
      '<div class="lv-card-scroll">' + half(0, 9, r.holeNumbers.length > 9 ? (r.holeNumbers[0] <= 9 ? 'Out' : 'In') : 'Total') + half(9, 18, r.holeNumbers[9] <= 9 ? 'Out' : 'In') + '</div>' +
      (r.playedWith && r.playedWith.length ? '<p class="lv-help">' + esc('Played with ' + r.playedWith.join(', ')) + '</p>' : '') +
      (r.index == null ? '<p class="lv-help">No handicap index was on file for this round, so net is the same as gross.</p>' : '') + '</div>';
    ui.modal({ eyebrow: 'My rounds', title: 'Scorecard', body: body, actions: [{ label: 'Close', kind: 'ghost' }] });
  }
  function placeText(rank, of) { return rank === 1 ? 'Won' : 'Place ' + rank + ' of ' + of; }

  /* Play opens 5 minutes before the tee time: a page showing "Play opens at ..." redraws once that time comes. */
  setInterval(function () {
    const b = document.querySelector('.lv-cta-off[data-opens]'); if (!b || document.querySelector('.overlay')) return;
    const t = b.getAttribute('data-opens').split(':'), now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= (+t[0]) * 60 + (+t[1])) Pub.render();
  }, 20000);
})();
