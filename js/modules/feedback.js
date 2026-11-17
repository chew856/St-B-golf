/* Visit feedback (staff): what members and public golfers said about their rounds, meals and lessons, from the
   ratings they chose to give on their account pages (Club.feedback, js/core/feedback.js; nothing ever asks them in a
   pop-up). Averages per type, the trend by week, low ratings flagged for follow-up and recent comments, filtered by type.
   Reads 'visitFeedback'; writes only followedUp / followedUpOn on a doc when staff mark it.
   Stat tiles open details (Club.drill). Styles: css/modules/feedback.css (.vfs-*). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, F = Club.feedback, D = Club.drill;
  if (!F || !D) { console.error('Visit feedback: js/core/feedback.js or js/core/drill.js is not loaded'); return; }

  const WEEKS = 8;                                       /* the period the page covers */
  const TYPES = [['all', 'All visits'], ['round', 'Rounds'], ['meal', 'Meals'], ['lesson', 'Lessons']];
  const SHOW = 8;                                        /* comments and flags before "Show all" */
  const st = { type: 'all', lowAll: false, comAll: false };

  /* ---------------- Helpers ---------------- */
  function today() { return Club.date.today(); }
  function weekStart(iso) { return Club.date.week(iso)[0]; }
  function periodStart() { return Club.date.addDays(weekStart(today()), -7 * (WEEKS - 1)); }
  function avg(list) { return list.length ? list.reduce(function (a, d) { return a + d.rating; }, 0) / list.length : 0; }
  function one(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function isLow(d) { return d.rating <= F.LOW; }
  function inPeriod() { const lo = periodStart(); return F.all().filter(function (d) { return d.visitDate >= lo && d.visitDate <= today(); }); }
  function ofType(list, t) { return t === 'all' ? list : list.filter(function (d) { return d.kind === t; }); }
  /* Newest by when the comment was left: marking one followed up (which stamps updatedAt) must not move it to the top. */
  function newest(a, b) { return String(b.createdAt || b.visitDate || '').localeCompare(String(a.createdAt || a.visitDate || '')); }
  function rChip(r) { return '<span class="vfs-r' + (r <= F.LOW ? ' is-low' : r >= 4 ? ' is-high' : '') + '" aria-label="Rated ' + r + ' of 5, ' + esc(F.LABELS[r].toLowerCase()) + '">' + r + '</span>'; }
  function who(d) {
    if (d.memberId) return '<a href="#/members/' + esc(d.memberId) + '">' + esc(d.name) + '</a>';
    return esc(d.name) + ' <span class="muted">(public golfer)</span>';
  }
  function kindLabel(k) { return F.KINDS[k] ? F.KINDS[k].label : k; }
  function visitLine(d) { return (d.visit && d.visit.title ? d.visit.title : kindLabel(d.kind)) + ' · ' + fmt.dateShort(d.visitDate); }

  /* ---------------- Drills ---------------- */
  function distTable(list) {
    return D.table([{ label: 'Rating' }, { label: 'Share' }, { label: 'Ratings', num: true }], [5, 4, 3, 2, 1].map(function (r) {
      const n = list.filter(function (d) { return d.rating === r; }).length;
      return [rChip(r) + ' ' + esc(F.LABELS[r]), D.share(n, list.length), String(n)];
    }));
  }
  function recentTable(list) {
    return D.table([{ label: 'Who' }, { label: 'Visit' }, { label: 'Rating', num: true }], list.slice().sort(newest).slice(0, 12).map(function (d) {
      return [who(d), esc(visitLine(d)) + (d.comment ? '<span class="vfs-dd-c">' + esc(d.comment) + '</span>' : ''), rChip(d.rating)];
    }));
  }
  function typeDrill(kind) {
    return function () {
      const list = inPeriod().filter(function (d) { return d.kind === kind; }), K = F.KINDS[kind];
      if (!list.length) return { title: K.plural, body: D.empty('No ' + K.plural.toLowerCase() + ' rated yet', 'Ratings appear here once people rate their visits from their account.', 'star') };
      let groups = '';
      if (kind === 'meal' || kind === 'lesson') {
        const by = {};
        list.forEach(function (d) { const k = kind === 'meal' ? String(d.visit && d.visit.title || 'Meal').split(' at ')[0] : String(d.visit && d.visit.title || 'Lesson'); (by[k] = by[k] || []).push(d); });
        groups = D.sec(kind === 'meal' ? 'By meal' : 'By lesson type', null, D.table([{ label: kind === 'meal' ? 'Meal' : 'Type' }, { label: 'Average', num: true }, { label: 'Ratings', num: true }], Object.keys(by).sort().map(function (k) { return [esc(k), one(avg(by[k])), String(by[k].length)]; })));
      }
      return { title: K.plural + ': ' + one(avg(list)) + ' of 5', body: D.kpis([{ label: 'Average', value: one(avg(list)) + ' of 5' }, { label: 'Ratings', value: String(list.length) }, { label: 'Low (' + F.LOW + ' or under)', value: String(list.filter(isLow).length) }, { label: 'With a comment', value: String(list.filter(function (d) { return d.comment; }).length) }]) +
        D.sec('How people rated', 'Last ' + WEEKS + ' weeks', distTable(list)) + groups + D.sec('Most recent', null, recentTable(list)) };
    };
  }
  const drills = {
    round: typeDrill('round'), meal: typeDrill('meal'), lesson: typeDrill('lesson'),
    low: function () {
      const list = inPeriod().filter(isLow).sort(newest);
      return { title: 'Low ratings', body: list.length ? D.kpis([{ label: 'Low ratings', value: String(list.length) }, { label: 'Followed up', value: String(list.filter(function (d) { return d.followedUp; }).length) }, { label: 'Still to follow up', value: String(list.filter(function (d) { return !d.followedUp; }).length) }]) +
        D.sec('Rated ' + F.LOW + ' or under', 'Last ' + WEEKS + ' weeks', D.table([{ label: 'Who' }, { label: 'Visit' }, { label: 'Status' }, { label: 'Rating', num: true }], list.map(function (d) {
          return [who(d), esc(visitLine(d)) + (d.comment ? '<span class="vfs-dd-c">' + esc(d.comment) + '</span>' : ''), d.followedUp ? ui.badge('Followed up', 'good') : ui.badge('To follow up', 'bad'), rChip(d.rating)];
        }))) : D.empty('No low ratings', 'Nobody rated a visit ' + F.LOW + ' or under in the last ' + WEEKS + ' weeks.', 'check') };
    },
    comments: function () {
      const list = inPeriod().filter(function (d) { return d.comment; }).sort(newest);
      return { title: 'Comments', body: list.length ? D.sec('All comments', plural(list.length, 'comment'), D.table([{ label: 'Who' }, { label: 'Visit' }, { label: 'Rating', num: true }], list.map(function (d) {
        return [who(d), esc(visitLine(d)) + '<span class="vfs-dd-c">' + esc(d.comment) + '</span>', rChip(d.rating)];
      }))) : D.empty('No comments yet', 'Comments are optional. They show here when people add one.', 'mail') };
    }
  };

  /* ---------------- Page ---------------- */
  function tiles(all) {
    function tile(kind) {
      const list = all.filter(function (d) { return d.kind === kind; });
      return list.length ? { label: F.KINDS[kind].plural, value: Math.round(avg(list) * 10) / 10, decimals: 1, suffix: ' of 5', meta: plural(list.length, 'rating') }
        : { label: F.KINDS[kind].plural, value: 'None yet', meta: 'No ratings in the period' };
    }
    const low = all.filter(isLow), open = low.filter(function (d) { return !d.followedUp; });
    return D.tiles(ui.stats([tile('round'), tile('meal'), tile('lesson'),
      { label: 'Low ratings', value: low.length, meta: '<span class="' + (open.length ? 'vfs-bad' : '') + '">' + open.length + ' to follow up</span>' },
      { label: 'Comments', value: all.filter(function (d) { return d.comment; }).length, meta: 'Of ' + plural(all.length, 'rating') }
    ]), ['round', 'meal', 'lesson', 'low', 'comments']);
  }
  /** Weeks across (newest first), one row per type: the average rating (out of 5) with a small bar, and how many ratings it came from. */
  function trend(list) {
    const start = periodStart(), weeks = [];
    for (let i = WEEKS - 1; i >= 0; i--) weeks.push(Club.date.addDays(start, i * 7));     /* newest first */
    const kinds = (st.type === 'all' ? ['round', 'meal', 'lesson'] : [st.type]).filter(function (k) { return list.some(function (d) { return d.kind === k; }); });
    if (!kinds.length) return ui.empty({ icon: 'reports', title: 'No ratings in the last ' + WEEKS + ' weeks', text: 'The weekly trend appears once people rate their visits.' });
    function cell(of) {
      if (!of.length) return '<td class="vfs-cell is-none"><span class="vfs-sr">No ratings</span><span aria-hidden="true">&middot;</span></td>';
      const a = avg(of);
      return '<td class="vfs-cell' + (a <= F.LOW + 0.5 ? ' is-low' : '') + '"><strong>' + one(a) + '</strong><span class="vfs-mini" aria-hidden="true"><span style="width:' + Math.round(a / 5 * 100) + '%"></span></span><span class="vfs-cnt">' + plural(of.length, 'rating') + '</span></td>';
    }
    return '<div class="table-wrap vfs-trend"><table class="table vfs-trend-t"><thead><tr><th scope="col"><span class="vfs-sr">Type</span></th>' + weeks.map(function (w, i) {
        return '<th scope="col" class="vfs-wk">' + (i === 0 ? 'This week' : 'Week of<br>' + esc(fmt.dateShort(w))) + '</th>';
      }).join('') + '</tr></thead><tbody>' + kinds.map(function (k) {
        return '<tr><th scope="row">' + esc(F.KINDS[k].plural) + '</th>' + weeks.map(function (w) { return cell(list.filter(function (d) { return d.kind === k && weekStart(d.visitDate) === w; })); }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="vfs-note">Average rating out of 5 by the week of the visit (Monday to Sunday), newest first. A dot means no ratings that week.</p>';
  }
  function lowItem(d) {
    return '<li class="vfs-item' + (d.followedUp ? ' is-done' : '') + '">' + rChip(d.rating) + '<div class="vfs-main"><div class="vfs-who">' + who(d) + '</div><div class="vfs-visit">' + esc(visitLine(d)) + '</div>' +
      (d.comment ? '<p class="vfs-c">' + esc(d.comment) + '</p>' : '<p class="vfs-c muted">No comment</p>') +
      '<div class="vfs-acts">' + (d.followedUp ? ui.badge('Followed up' + (d.followedUpOn ? ' ' + fmt.dateShort(d.followedUpOn) : ''), 'good') : '<button type="button" class="btn btn-sm" data-action="vfs-done" data-id="' + esc(d.id) + '">' + Club.icon('check') + '<span>Mark followed up</span></button>') + '</div></div></li>';
  }
  function comItem(d) {
    return '<li class="vfs-item">' + rChip(d.rating) + '<div class="vfs-main"><p class="vfs-c vfs-quote">' + esc(d.comment) + '</p><div class="vfs-visit">' + who(d) + ' · ' + esc(visitLine(d)) + '</div></div></li>';
  }

  function render(view) {
    view.innerHTML = ui.pageHeader({ eyebrow: 'Administration', title: 'Visit feedback',
      subtitle: 'How members and public golfers rated their rounds, meals and lessons over the last ' + WEEKS + ' weeks. People rate a visit from their own account when they choose to; nothing asks them in a pop-up.' }) +
      '<div class="vfs"></div>';
    const host = ui.$('.vfs', view);
    function draw() {
      const all = inPeriod(), list = ofType(all, st.type);
      const low = list.filter(isLow).sort(function (a, b) { return (a.followedUp ? 1 : 0) - (b.followedUp ? 1 : 0) || newest(a, b); });
      const com = list.filter(function (d) { return d.comment; }).sort(newest);
      const lowShown = st.lowAll ? low : low.slice(0, SHOW), comShown = st.comAll ? com : com.slice(0, SHOW);
      const tname = TYPES.find(function (t) { return t[0] === st.type; })[1];
      host.innerHTML = tiles(all) +
        '<div class="vfs-bar" data-reveal><span class="vfs-bar-l" id="vfs-show-l">Show</span><div class="segmented" role="group" aria-labelledby="vfs-show-l">' + TYPES.map(function (t) {
          const n = ofType(all, t[0]).length;
          return '<button type="button" data-type="' + t[0] + '" class="' + (t[0] === st.type ? 'active' : '') + '" aria-pressed="' + (t[0] === st.type) + '">' + esc(t[1]) + ' <span class="vfs-n">' + n + '</span></button>';
        }).join('') + '</div><span class="muted vfs-avg">' + (list.length ? esc(tname) + ': ' + one(avg(list)) + ' of 5 from ' + plural(list.length, 'rating') : 'No ratings') + '</span></div>' +
        '<div class="grid grid-main-side vfs-grid">' +
          '<div class="stack">' +
            '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Trend</div><h3>Average rating by week</h3></div></div><div class="panel-body">' + trend(list) + '</div></section>' +
            '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">In their words</div><h3>Recent comments</h3></div><span class="muted">' + com.length + '</span></div><div class="panel-body flush">' +
              (com.length ? '<ul class="vfs-list">' + comShown.map(comItem).join('') + '</ul>' + (com.length > SHOW ? '<div class="vfs-more"><button type="button" class="s-link" data-action="vfs-com">' + (st.comAll ? 'Show fewer' : 'Show all ' + com.length + ' comments') + '</button></div>' : '')
                : ui.empty({ icon: 'mail', title: 'No comments yet', text: 'Comments are optional. They show here when people add one.' })) + '</div></section>' +
          '</div>' +
          '<aside class="stack">' +
            '<section class="panel vfs-flags" data-reveal><div class="panel-head"><div><div class="eyebrow">Flagged</div><h3>Low ratings</h3></div><span class="muted">' + F.LOW + ' or under</span></div><div class="panel-body flush">' +
              (low.length ? '<ul class="vfs-list">' + lowShown.map(lowItem).join('') + '</ul>' + (low.length > SHOW ? '<div class="vfs-more"><button type="button" class="s-link" data-action="vfs-low">' + (st.lowAll ? 'Show fewer' : 'Show all ' + low.length) + '</button></div>' : '')
                : ui.empty({ icon: 'check', title: 'No low ratings', text: 'Nobody rated a visit ' + F.LOW + ' or under in this period.' })) + '</div></section>' +
          '</aside>' +
        '</div>';
      ui.animateIn(host);
    }
    draw();
    D.wire(view, drills, 'Visit feedback');
    ui.on(view, 'click', '[data-type]', function (e, b) { st.type = b.dataset.type; st.lowAll = false; st.comAll = false; draw(); });
    ui.on(view, 'click', '[data-action=vfs-low]', function () { st.lowAll = !st.lowAll; draw(); });
    ui.on(view, 'click', '[data-action=vfs-com]', function () { st.comAll = !st.comAll; draw(); });
    ui.on(view, 'click', '[data-action=vfs-done]', function (e, b) {
      const d = S.find(F.COLL, b.dataset.id); if (!d) return;
      /* Undo (js/core/undo.js) puts the rating back on the follow-up list */
      Club.undo.run(function () { S.update(F.COLL, d.id, { followedUp: true, followedUpOn: today() }); }, { message: 'Marked as followed up', undone: 'Back on the follow-up list',
        after: function () { if (view.isConnected) draw(); } });
      draw();
      if (Club.app && Club.app.refreshNav) Club.app.refreshNav();
    });
  }

  Club.register({
    id: 'feedback', label: 'Visit feedback', icon: 'star', section: 'Administration', order: 25,
    /* Low ratings from the last two weeks nobody has followed up yet */
    /* The same count as the page's Low ratings tile ("N to follow up"): low ratings in the page's period not yet followed up */
    badge: function () { const n = inPeriod().filter(function (d) { return isLow(d) && !d.followedUp; }).length; return n || null; },
    search: function (q) {
      if (q.indexOf('feedback') < 0 && q.indexOf('rating') < 0) return [];
      return [{ label: 'Visit feedback', sub: 'Ratings for rounds, meals and lessons', href: 'feedback', icon: 'star' }];
    },
    render: function (view) { render(view); }
  });
})();
