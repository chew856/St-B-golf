/* Reports section: Overview. Registers through Club.reports.addSection (js/modules/reports.js). Loaded after the
   other sections, since it reads what they expose: six headline figures, each with its change on the period before
   when there is a fair one (the figure jumps to its section), "Top opportunities" (the five ideas to grow revenue with
   the largest estimated effect, from every section's ideas()), "What stands out" (sentences each section computes from
   the period's data) and "Needs attention" (counts with a link to the list behind them). Nothing here is written by
   hand: every sentence comes from a section's facts(), attention() or ideas(). */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const U = Club.ui, F = Club.fmt, esc = U.esc, H = Club.reports.h;
  const num = H.num, sum = H.sum, plural = H.plural;

  function sec(id) { return Club.reports.get(id); }
  function data(id, key, ctx) { const s = sec(id); return s && s.data && s.data[key] ? s.data[key](ctx) : null; }
  function monthKeys(ctx) { return ctx.rows.map(function (r) { return r.key; }); }

  /* Feedback ratings in the period (Club.feedback, 'visitFeedback'). */
  function feedback(ctx) {
    return H.memo(ctx, 'ov-feedback', function () {
      if (!Club.feedback || !Club.feedback.all) return null;
      const inR = H.inRange(ctx), all = Club.feedback.all().filter(function (f) { return f && f.rating; });
      const docs = all.filter(function (f) { return inR(f.visitDate || String(f.createdAt || '').slice(0, 10)); });
      const prev = ctx.prev ? all.filter(function (f) { const d = f.visitDate || String(f.createdAt || '').slice(0, 10); return d >= ctx.prev.from && d <= ctx.prev.to; }) : [];
      const avg = function (l) { return l.length ? sum(l, function (f) { return f.rating; }) / l.length : null; };
      const low = docs.filter(function (f) { return f.rating <= 2 && !f.followedUp; });
      const byRow = ctx.rows.map(function (r) { const l = docs.filter(function (f) { const d = f.visitDate || String(f.createdAt || '').slice(0, 10); return d >= r.from && d <= r.to; }); return l.length ? avg(l) : null; });
      return { docs: docs, avg: avg(docs), prevAvg: avg(prev), low: low, byRow: byRow };
    });
  }

  function kpis(ctx) {
    const t = H.periodTotals(ctx.rows), p = ctx.prev ? H.periodTotals(ctx.prev.rows) : null;
    const u = H.unitWord(ctx), last = ctx.rows[ctx.rows.length - 1], first = ctx.rows[0];
    const out = [
      { label: 'Revenue', value: H.moneyShort(t.revenue), d: H.delta(t.revenue, p && p.revenue, ctx, 'revenue', H.moneyShort(H.avgPer(ctx, t.revenue)) + ' a ' + H.avgUnit(ctx) + ' on average'), chg: H.prevPct(t.revenue, p && p.revenue, ctx, 'revenue'), go: 'revenue', aria: 'Revenue ' + F.money0(t.revenue) },
      { label: 'Rounds played', value: H.numShort(t.rounds), d: H.delta(t.rounds, p && p.rounds, ctx, 'rounds', (t.rounds ? Math.round(sum(ctx.rows, function (r) { return r.guestRounds; }) / t.rounds * 100) : 0) + '% by guests'), chg: H.prevPct(t.rounds, p && p.rounds, ctx, 'rounds'), go: 'golf', aria: 'Rounds played ' + F.num(t.rounds) },
      { label: 'Dining room guests', value: H.numShort(t.covers), d: H.delta(t.covers, p && p.covers, ctx, 'covers', F.money(t.covers ? sum(ctx.rows, function (r) { return r.revenue.dining; }) / t.covers : 0) + ' average check'), chg: H.prevPct(t.covers, p && p.covers, ctx, 'covers'), go: 'food', aria: 'Dining room guests ' + F.num(t.covers) }
    ];
    const ch = ctx.gran === 'month' && ctx.rows.length > 1 && first.members ? last.members - first.members : null;
    const joined = H.all('members').filter(function (m) { return H.inRange(ctx)(String(m.memberSince || '').slice(0, 10)); }).length;
    out.push({ label: 'Members', value: F.num(last ? last.members : 0), d: ch == null ? esc(joined ? joined + ' joined in this period' : 'No one joined in this period') : ch === 0 ? 'Unchanged since ' + esc(H.monthLabel(first.key, true)) : '<b class="' + (ch > 0 ? 'up' : 'down') + '">' + (ch > 0 ? 'up ' : 'down ') + Math.abs(ch) + '</b> since ' + esc(H.monthLabel(first.key, true)), chg: ch != null ? H.kpiChg(ch, 'num', 'since ' + H.monthLabel(first.key, true)) : joined ? H.kpiChg(joined, 'num', '', { label: joined + ' joined in this period' }) : null, go: 'members', aria: 'Members ' + (last ? last.members : 0) });
    const cart = data('food', 'cart', ctx);
    if (cart) {
      const prevN = ctx.prev && data('food', 'cartOrders', ctx) ? data('food', 'cartOrders', ctx).list.filter(function (o) { return o && o.status !== 'cancelled' && o.date >= ctx.prev.from && o.date <= ctx.prev.to; }).length : 0;
      /* Cart history (real orders plus the sample history, js/modules/reports-food.js) reaches back about a year. */
      const cartPrev = ctx.prev && ctx.prev.from >= Club.date.addDays(Club.date.today(), -365) ? prevN : null;
      out.push({ label: 'Beverage cart orders', value: F.num(cart.live.length), d: cart.live.length && ctx.prev && prevN ? H.delta(cart.live.length, prevN, { prev: { ok: { cart: true } } }, 'cart') : esc(cart.live.length ? 'over ' + cart.days + ' ' + plural(cart.days, 'day') : 'The cart runs in the golf season'), chg: cartPrev == null || (!cartPrev && !cart.live.length) ? null : cartPrev ? H.pctVs(cart.live.length, cartPrev, ctx) : H.kpiChg(cart.live.length, 'num', H.prevWords(ctx)), go: 'food', aria: 'Beverage cart orders ' + cart.live.length });
    }
    const fb = feedback(ctx);
    if (fb && fb.docs.length) {
      const d = fb.prevAvg != null ? Math.round((fb.avg - fb.prevAvg) * 10) / 10 : null;
      out.push({ label: 'Visit rating, out of 5', value: fb.avg.toFixed(1), d: (d == null ? '' : d === 0 ? 'level with the period before, ' : '<b class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? 'up ' : 'down ') + Math.abs(d) + '</b> on the period before, ') + esc(fb.docs.length + ' ' + plural(fb.docs.length, 'rating')), chg: d != null ? H.kpiChg(d, 'dec', H.prevWords(ctx)) : null, href: '#/feedback', aria: 'Visit rating ' + fb.avg.toFixed(1) + ' of 5' });
    }
    return out.slice(0, 6);
  }
  function facts(ctx) {
    const out = [];
    Club.reports.sections().forEach(function (s) {
      if (s.id === 'overview' || !s.facts) return;
      let f = []; try { f = s.facts(ctx) || []; } catch (e) { console.error(e); }
      f.forEach(function (x) { out.push({ text: x.text, where: x.where || s.label, sec: s.id }); });
    });
    return out;
  }
  function attention(ctx) {
    const out = [];
    Club.reports.sections().forEach(function (s) {
      if (s.id === 'overview' || !s.attention) return;
      let a = []; try { a = s.attention(ctx) || []; } catch (e) { console.error(e); }
      a.forEach(function (x) { out.push(Object.assign({ sec: s.id }, x)); });
    });
    const fb = feedback(ctx);
    if (fb && fb.low.length) out.push({ n: fb.low.length, text: 'low visit ' + plural(fb.low.length, 'rating') + ' (2 of 5 or less) to follow up', label: 'See feedback', href: '#/feedback' });
    return out;
  }
  function panels(ctx) {
    const f = facts(ctx).slice(0, 5), a = attention(ctx);
    const t = H.periodTotals(ctx.rows), secs = {}; f.forEach(function (x) { secs[x.where] = 1; });
    const rc = H.prevPct(t.revenue, ctx.prev ? H.periodTotals(ctx.prev.rows).revenue : 0, ctx, 'revenue');
    const d1 = H.sents([f.length ? 'These ' + f.length + ' notes are picked from this period\'s figures in ' + Object.keys(secs).length + ' ' + plural(Object.keys(secs).length, 'section') + '.' : 'Notes appear here when the period\'s figures show something worth knowing.',
      'Revenue came to ' + F.money0(t.revenue) + (rc ? ' (' + (rc.v > 0 ? 'up ' + H.chgMag(rc) : rc.v < 0 ? 'down ' + H.chgMag(rc) : 'level') + ' on the period before)' : '') + ', from ' + F.num(t.rounds) + ' rounds and ' + F.num(t.covers) + ' dining room guests.',
      f.length ? 'Select a section name to see the chart behind a note.' : '']);
    const total = sum(a, function (x) { return x.ok ? 0 : x.n; }), big = a.filter(function (x) { return !x.ok; }).sort(function (x, y) { return y.n - x.n; })[0];
    const d2 = a.length ? H.sents(['Each line counts things waiting for someone to act' + (total ? ', ' + F.num(total) + ' in all' : '') + '.', big ? 'The largest is ' + F.num(big.n) + ': ' + big.text + '.' : '',
      'Clearing these protects revenue the club has already earned, and the links open the lists behind them.']) :
      H.sents(['Nothing is waiting for follow-up in this period.', 'When renewals, quiet members, turned-away golfers, low ratings or overdue balances need a call, they appear here with a link to the list.']);
    const p1 = { id: 'ov-facts', title: 'What stands out', take: 'Picked from this period\'s figures.', desc: d1,
      body: f.length ? '<ul class="notes">' + f.map(function (x) { return '<li><p>' + esc(x.text) + '</p><button type="button" class="where" data-go="' + esc(x.sec) + '" aria-label="' + esc('Go to ' + x.where) + '">' + esc(x.where) + '</button></li>'; }).join('') + '</ul>' : '<p class="rp-empty">Nothing stands out yet for this period.</p>' };
    const p2 = { id: 'ov-attention', title: 'Needs attention', take: a.length ? 'Things someone should follow up on.' : 'Nothing is waiting for follow-up.', desc: d2,
      body: a.length ? '<ul class="notes att">' + a.map(function (x) {   /* every line, so the count in the description matches what is listed */
        const link = x.href ? '<a class="rp-link" href="' + esc(x.href) + '">' + esc(x.label) + '</a>' : '<button type="button" class="rp-link" data-drill="' + esc(x.drill) + '" data-sec="' + esc(x.sec) + '"' + (x.arg != null ? ' data-arg="' + esc(x.arg) + '"' : '') + '>' + esc(x.label) + '</button>';
        return '<li><span class="tag' + (x.ok ? ' ok' : '') + '">' + esc(F.num(x.n)) + '</span><p>' + esc(x.text) + '</p>' + link + '</li>';
      }).join('') + '</ul>' : '<p class="rp-empty">Renewals, quiet members, turned-away golfers, low ratings and overdue balances appear here when there are any.</p>' };
    return [p1, p2];
  }
  function about(ctx) {
    return ['The figures on this page are the period\'s totals from the same records as the other sections; each section explains its own sources under About these numbers. Changes compare with the period of equal length just before, when it is fully on file.'].concat(ctx.notes);
  }
  function csv(ctx) {
    const t = H.periodTotals(ctx.rows), rows = [['Measure', 'Value'], ['Period', ctx.from + ' to ' + ctx.to], ['Revenue', t.revenue], ['Rounds played', t.rounds], ['Dining room guests', t.covers], ['Members', ctx.rows.length ? ctx.rows[ctx.rows.length - 1].members : '']];
    const cart = data('food', 'cart', ctx); if (cart) rows.push(['Beverage cart orders', cart.live.length]);
    const fb = feedback(ctx); if (fb && fb.docs.length) rows.push(['Visit rating (of 5)', fb.avg.toFixed(2)], ['Ratings', fb.docs.length]);
    rows.push([], ['What stands out']); facts(ctx).forEach(function (x) { rows.push([x.where, x.text]); });
    rows.push([], ['Needs attention', 'Count']); attention(ctx).forEach(function (x) { rows.push([x.text, x.n]); });
    return [{ id: 'overview', title: 'Overview', rows: rows }];
  }
  /** Top opportunities: every section's ideas to grow revenue, ranked together; the Overview shows the best five.
      Ideas marked Done or Dismissed in the Growth plan (reports-plan.js) are left out. */
  function ideas(ctx) {
    const plan = Club.growthPlan;
    return Club.reports.allIdeas(ctx).filter(function (x) { return !(plan && plan.status(x.key)); });
  }
  Club.reports.addSection({ id: 'overview', label: 'Overview', order: 10, collections: ['visitFeedback', 'growthPlan'], kpis: kpis, panels: panels, about: about, csv: csv, ideas: ideas,
    ideasTitle: 'Top opportunities', ideasTake: 'The five ideas with the largest estimated effect over a year, picked from every section. Each rests on the club\'s own figures and says what it assumes.', ideasFirst: true, ideasLinks: true });
})();
