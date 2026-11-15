/* Reports section: Growth plan. Registers through Club.reports.addSection (js/modules/reports.js), as the second tab.
   One ranked list of every section's ideas to grow revenue (Club.reports.allIdeas), by estimated effect over a year,
   for the report's current period. Staff mark an idea Done or Dismissed; both can be undone from the toast
   (js/core/undo.js) and moved back to open from the Done and Dismissed lists.

   Ideas are computed, never stored. What is stored is the mark, in the 'growthPlan' collection:
     { id, key, status: 'done' | 'dismissed', title, amount, each, per, section, sectionLabel, at, by }
   key is the idea's stable key ("<section id>:<slug>", made in reports.js: the idea's own id when it has one, otherwise
   its title in lower case with digits dropped), so a mark stays on its idea when the figures or the period change.
   title, amount (the estimate over a year), each and per (the estimate as the idea states it) are kept as they were
   when marked, so a marked idea still reads sensibly if the idea is no longer suggested.

   Club.growthPlan.status(key) -> 'done' | 'dismissed' | null   (the Overview leaves marked ideas out of Top opportunities) */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc, H = Club.reports.h;
  const sum = H.sum, plural = H.plural;
  const COLL = 'growthPlan', SEC = 'plan';
  const VIEWS = ['open', 'done', 'dismissed'];
  const WORD = { done: 'Done', dismissed: 'Dismissed' };

  function marks() { return H.all(COLL).filter(function (d) { return d.key && WORD[d.status]; }); }
  function markOf(key) { return marks().filter(function (d) { return d.key === key; })[0] || null; }
  Club.growthPlan = { status: function (key) { const d = markOf(key); return d ? d.status : null; }, marks: marks };

  function staffName() { return Club.user ? [Club.user.firstName, Club.user.lastName].filter(Boolean).join(' ') : 'Staff'; }
  function money(v) { return v >= 1e4 ? H.moneyShort(v) : F.money0(v); }
  function yearOf(x) { return x.year > 0 ? x.year : 0; }

  /** The plan for this period: open ideas (ranked), and the marked ones with the live idea when it is still suggested. */
  function plan(ctx) {
    return H.memo(ctx, 'growth-plan', function () {
      const ideas = Club.reports.allIdeas(ctx), live = {}, marked = {};
      ideas.forEach(function (x) { live[x.key] = x; });
      marks().forEach(function (d) { if (!marked[d.key]) marked[d.key] = d; });
      const pick = function (st) {
        return Object.keys(marked).map(function (k) { return marked[k]; }).filter(function (d) { return d.status === st; })
          .sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }).map(function (d) { return { mark: d, idea: live[d.key] || null }; });
      };
      const open = ideas.filter(function (x) { return !marked[x.key]; }), done = pick('done'), dismissed = pick('dismissed');
      return { all: ideas, open: open, done: done, dismissed: dismissed, live: live,
        openValue: sum(open, yearOf), doneValue: sum(done, function (r) { return r.mark.amount; }), priced: open.filter(function (x) { return x.year > 0; }).length };
    });
  }
  function viewOf(st) { return st && VIEWS.indexOf(st.chip) >= 0 ? st.chip : 'open'; }

  /* ---------------- Summary boxes ---------------- */
  function kpis(ctx) {
    const p = plan(ctx);
    return [
      { label: 'Open ideas', value: F.num(p.open.length), d: esc(p.open.length ? p.priced + ' with an estimate' : p.all.length ? 'Every idea has been marked' : 'None for this period'), drill: 'show-open', aria: 'Open ideas: ' + p.open.length + '. Show them' },
      { label: 'Open ideas, over a year', value: H.moneyShort(p.openValue), d: esc('Estimated, if every assumption holds'), drill: 'show-open', aria: 'Estimated value of open ideas over a year: ' + F.money0(p.openValue) + '. Show them' },
      { label: 'Done', value: F.num(p.done.length), d: esc(p.done.length ? money(p.doneValue) + ' over a year, as estimated when marked' : 'Nothing marked done yet'), drill: 'show-done', aria: 'Ideas marked done: ' + p.done.length + '. Show them' },
      { label: 'Dismissed', value: F.num(p.dismissed.length), d: esc(p.dismissed.length ? 'Set aside, and can be moved back' : 'Nothing dismissed'), drill: 'show-dismissed', aria: 'Ideas dismissed: ' + p.dismissed.length + '. Show them' }
    ];
  }
  /* A summary box shows its list: the box presses the matching filter button and brings the list into view. */
  function showView(v) {
    return function () {
      const sec = document.getElementById('rp-sec-' + SEC), chip = sec && sec.querySelector('.rp-chip[data-chip="' + v + '"]');
      if (chip) { chip.click(); const panel = chip.closest('.rp-panel'); if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); chip.focus({ preventScroll: true }); }
      return null;
    };
  }

  /* ---------------- The list ---------------- */
  function estHTML(year, each, per, when) {
    if (!(year >= 1)) return '<div class="idea-est"><span>No estimate</span></div>';
    const sub = each >= 1 && per && per !== 'a year' ? (per === 'one time' ? 'one time' : money(each) + ' ' + per) : '';
    return '<div class="idea-est"><b>+' + esc(money(year)) + '</b><span>' + esc(when ? 'a year, when marked' : 'over a year') + '</span>' + (sub ? '<span class="gp-each">' + esc(sub) + '</span>' : '') + '</div>';
  }
  function fromHTML(secId, label, live) {
    const s = Club.reports.get(secId), name = s ? s.label : label || 'Reports';
    return '<span class="gp-from">From ' + (s ? '<button type="button" class="rp-link" data-go="' + esc(secId) + '"' + (live ? ' data-go-panel="' + esc(secId + '-ideas') + '"' : '') + ' aria-label="' + esc('Go to the ' + name + ' section') + '">' + esc(name) + '</button>' : esc(name)) + '</span>';
  }
  function drillHTML(x) {
    return x && x.drill ? '<button type="button" class="rp-link" data-drill="' + esc(x.drill) + '" data-sec="' + esc(x.sec) + '"' + (x.drillArg != null ? ' data-arg="' + esc(x.drillArg) + '"' : '') + ' aria-haspopup="dialog">' + esc(x.drillLabel || 'See the list') + '</button>' : '';
  }
  function act(label, what, key, kind) {
    return '<button type="button" class="btn btn-sm' + (kind ? ' btn-' + kind : '') + '" data-plan-act="' + what + '" data-key="' + esc(key) + '"><span>' + esc(label) + '</span></button>';
  }
  function openHTML(p) {
    if (!p.open.length) return '<p class="rp-empty">' + esc(p.all.length ? 'Every idea for this period has been marked done or dismissed. They are listed under Done and Dismissed, and can be moved back.' : 'There is not enough on file in this period for an idea with a figure behind it. Choose a longer period.') + '</p>';
    return '<ol class="ideas gp-list">' + p.open.map(function (x, i) {
      return '<li data-plan-row="' + i + '"><div class="idea-main"><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p>' + (x.assume ? '<p class="idea-why">' + esc(x.assume) + '</p>' : '') +
        '<div class="gp-meta">' + fromHTML(x.sec, x.where, true) + drillHTML(x) + '</div>' +
        '<div class="gp-acts">' + act('Mark done', 'done', x.key, 'primary') + act('Dismiss', 'dismissed', x.key) + '</div></div>' +
        estHTML(yearOf(x), x.amount, x.per) + '</li>';
    }).join('') + '</ol>';
  }
  function markedHTML(rows, st) {
    if (!rows.length) return '<p class="rp-empty">' + esc(st === 'done' ? 'Nothing has been marked done yet. Mark an idea done in the open list once it is in place.' : 'Nothing has been dismissed. Dismiss an idea in the open list when it does not suit the club.') + '</p>';
    return '<ul class="ideas gp-list gp-marked">' + rows.map(function (r, i) {
      const d = r.mark, x = r.idea, when = d.at ? F.date(String(d.at).slice(0, 10)) : '';
      return '<li data-plan-row="' + i + '"><div class="idea-main"><h3>' + esc(d.title || (x && x.title) || 'Idea') + '</h3>' + (x ? '<p>' + esc(x.text) + '</p>' : '') +
        '<p class="idea-why">' + esc((st === 'done' ? 'Marked done' : 'Dismissed') + (when ? ' ' + when : '') + (d.by ? ' by ' + d.by : '') + '.' + (x ? '' : ' It is not suggested for this period, so the name and estimate are as they were then.')) + '</p>' +
        '<div class="gp-meta">' + fromHTML(d.section, d.sectionLabel, !!x) + drillHTML(x) + '</div>' +
        '<div class="gp-acts">' + act('Move back to open', 'reopen', d.key) + '</div></div>' +
        estHTML(d.amount, d.each, d.per, true) + '</li>';
    }).join('') + '</ul>';
  }
  function take(p, v) {
    if (v === 'done') return !p.done.length ? 'Nothing is marked done yet.' : p.done.length + ' ' + plural(p.done.length, 'idea is', 'ideas are') + ' marked done' + (p.doneValue >= 1 ? ', worth about ' + F.money0(p.doneValue) + ' over a year as estimated when marked.' : '.');
    if (v === 'dismissed') return !p.dismissed.length ? 'Nothing has been dismissed.' : p.dismissed.length + ' ' + plural(p.dismissed.length, 'idea has', 'ideas have') + ' been set aside. Any of them can be moved back to open.';
    if (!p.open.length) return p.all.length ? 'Every idea for this period has been marked.' : 'No idea has enough on file in this period.';
    const top = p.open[0];
    return p.open.length + ' open ' + plural(p.open.length, 'idea is', 'ideas are') + ' worth about ' + F.money0(p.openValue) + ' over a year if every assumption holds.' +
      (top.year > 0 ? ' The largest is "' + top.title + '", about ' + F.money0(top.year) + '.' : '') + (p.done.length ? ' ' + p.done.length + ' done so far' + (p.doneValue >= 1 ? ', worth about ' + F.money0(p.doneValue) : '') + '.' : '');
  }
  function desc(ctx, p, v) {
    if (v !== 'open') return H.sents(['Each row keeps the name and the estimate the idea had when it was marked.', 'Move one back to open to rank it again with today\'s figures.']);
    const secs = {}; p.open.forEach(function (x) { secs[x.where] = 1; });
    return H.sents([p.open.length ? 'Ideas from ' + Object.keys(secs).length + ' ' + plural(Object.keys(secs).length, 'section') + ' are ranked together by their estimate over a year, from the figures for ' + ctx.line + '.' : '',
      p.open.length > 1 ? 'Several ideas reach the same members, so the total is the most these could add together, not a forecast.' : '',
      'Mark an idea done once it is in place, or dismiss it if it does not suit the club; either can be undone.']);
  }
  function main(ctx, st) {
    const p = plan(ctx), v = viewOf(st);
    return { id: 'plan-list', title: 'Growth plan', take: take(p, v), chip: v,
      chips: [{ id: 'open', label: 'Open ' + p.open.length }, { id: 'done', label: 'Done ' + p.done.length }, { id: 'dismissed', label: 'Dismissed ' + p.dismissed.length }],
      body: v === 'open' ? openHTML(p) : markedHTML(p[v], v), desc: desc(ctx, p, v), csvId: 'plan' };
  }

  /* ---------------- Marking ---------------- */
  let refocus = null;
  function setMark(ctx, key, status, api) {
    const p = plan(ctx), x = p.live[key];
    if (!x || markOf(key)) return;
    Club.undo.run(function () {
      S.insert(COLL, { id: S.uid('gp'), key: key, status: status, title: x.title, amount: Math.round(yearOf(x)), each: x.amount >= 1 ? Math.round(x.amount) : null, per: x.amount >= 1 ? x.per || '' : '',
        section: x.sec, sectionLabel: x.where, at: new Date().toISOString(), by: staffName() });
    }, { message: (status === 'done' ? 'Marked done: ' : 'Dismissed: ') + x.title, after: api.redraw, undone: 'Moved back to open' });
    api.redraw();
  }
  function reopen(key, api) {
    const d = markOf(key);
    if (!d) return;
    Club.undo.run(function () { marks().filter(function (m) { return m.key === key; }).forEach(function (m) { S.remove(COLL, m.id); }); },
      { message: 'Moved back to open: ' + d.title, after: api.redraw, undone: d.status === 'done' ? 'Marked done again' : 'Dismissed again' });
    api.redraw();
  }
  function wire(el, ctx, api) {
    if (refocus) {
      const t = el.querySelector(refocus) || el.querySelector('.rp-chip[aria-pressed="true"]'); refocus = null;
      if (t && !el.hidden) t.focus({ preventScroll: true });
    }
    U.on(el, 'click', '[data-plan-act]', function (e, b) {
      const row = b.closest('[data-plan-row]');
      refocus = row ? '[data-plan-row="' + row.dataset.planRow + '"] [data-plan-act]' : null;
      if (b.dataset.planAct === 'reopen') reopen(b.dataset.key, api); else setMark(ctx, b.dataset.key, b.dataset.planAct, api);
    });
  }

  /* ---------------- CSV and notes ---------------- */
  function csv(ctx) {
    const p = plan(ctx), rows = [['Status', 'Rank', 'Idea', 'Section', 'Details', 'Estimate', 'Per', 'Over a year', 'Assumption', 'Marked on', 'Marked by']];
    p.open.forEach(function (x, i) { rows.push(['Open', i + 1, x.title, x.where, x.text, x.amount >= 1 ? Math.round(x.amount) : '', x.amount >= 1 ? x.per || '' : '', x.year > 0 ? Math.round(x.year) : '', x.assume || '', '', '']); });
    [['Done', p.done], ['Dismissed', p.dismissed]].forEach(function (g) {
      g[1].forEach(function (r) {
        const d = r.mark, x = r.idea;
        rows.push([g[0], '', d.title, d.sectionLabel || d.section || '', x ? x.text : '', d.each != null ? d.each : '', d.per || '', d.amount || '', x ? x.assume || '' : '', String(d.at || '').slice(0, 10), d.by || '']);
      });
    });
    return [{ id: 'plan', title: 'Growth plan', rows: rows }];
  }
  function about(ctx) {
    return ['The plan lists the ideas to grow revenue from every section, computed from the club\'s records for the selected period, so the list and its estimates change with the period. Each estimate rests on the assumption written under it.',
      'The total adds every open estimate as it stands. Ideas can reach the same members, and some are money already earned or kept rather than new revenue, so read it as an upper limit.',
      'An idea is recognised by its section and its name, not by its figures, so one marked done or dismissed stays marked when the numbers or the period change. Done and dismissed ideas keep the name and estimate they had when marked, and no longer appear under Top opportunities on the Overview.'].concat(ctx.notes);
  }

  Club.reports.addSection({
    id: SEC, label: 'Growth plan', order: 15, collections: [COLL],
    kpis: kpis, main: main, about: about, csv: csv, wire: wire,
    drills: { 'show-open': showView('open'), 'show-done': showView('done'), 'show-dismissed': showView('dismissed') },
    data: { plan: plan }
  });
})();
