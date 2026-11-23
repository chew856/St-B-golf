/* Monthly costs by department (Nov 23, 2026): what each department cost in a month, typed by the bookkeeper in
   Accounting > Monthly costs (js/modules/accounting-costs.js) and read by Reports > Profit (js/modules/reports-profit.js).

   Nothing is seeded: the club's real costs are not known, so a month without a record has no costs and the Profit report
   shows money in only for it. The staff demo can fill clearly marked example costs (example: true) from the Monthly
   costs tab, and clear them again.

   Collection 'monthlyCosts', one doc per month:
     { id: 'mc_YYYY-MM', month: 'YYYY-MM', depts: { <deptKey>: [{ label, amount }] }, example: bool,
       savedAt: ISO, savedBy: 'First Last' }

   Department keys match the Revenue section's DEPTS in js/modules/reports.js (golf, proShop, dining, events, lessons;
   dues have no costs of their own), plus 'shared' for costs that belong to no one department.

   Club.costs:
     DEPTS                         [{ key, label, lines: [default line labels] }] in display order
     get(month) -> doc | null      month is 'YYYY-MM'
     save(month, depts, opts)      inserts or replaces the month; opts { example }. Returns the doc. Callers wrap it in
                                   Club.undo (the store write itself is plain).
     remove(month)                 deletes the month's record
     months() -> ['YYYY-MM', ...]  months with a record, oldest first
     lastBefore(month) -> doc|null the most recent record before that month (for "Copy last month")
     stockSold(month) -> { amount, covered }   pro shop stock sold that month at product cost, from the till's sales.
                                   covered is false when no till sales are on file for the month (older months come from
                                   the monthly history, which has no item detail), so the bookkeeper types the figure.
     totals(month) -> null | { golf, proShop, dining, events, lessons, shared, total, stockAuto, example }
                                   null when the month has no record. proShop includes the automatic stock line when the
                                   record has no typed "Stock sold" line and the till covers the month.
     example(month) -> depts       example figures for the demo (golf season or winter shape); never real club figures. */
(function () {
  'use strict';
  const S = Club.store;
  const COLL = 'monthlyCosts';
  const DEPTS = [
    { key: 'dining', label: 'Dining', lines: ['Food and drink', 'Wages', 'Other'] },
    { key: 'golf', label: 'Golf', lines: ['Course upkeep', 'Wages', 'Cart leases', 'Power and water'] },
    { key: 'events', label: 'Events', lines: ['Food and drink', 'Wages'] },
    { key: 'proShop', label: 'Pro shop', lines: ['Stock sold', 'Wages'] },
    { key: 'lessons', label: 'Lessons', lines: ['Pro pay'] },
    { key: 'shared', label: 'Shared costs', lines: ['Clubhouse and utilities', 'Insurance', 'Office', 'Property tax'] }
  ];
  const STOCK = 'Stock sold';

  function all() { try { return (S.all(COLL) || []).filter(Boolean); } catch (e) { return []; } }
  function num(v) { return +v || 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function idOf(month) { return 'mc_' + month; }
  function get(month) { return S.find(COLL, idOf(month)) || null; }

  function clean(depts) {
    const out = {};
    DEPTS.forEach(function (d) {
      out[d.key] = ((depts && depts[d.key]) || []).map(function (l) {
        return { label: String((l && l.label) || '').trim(), amount: r2(Math.max(0, num(l && l.amount))) };
      }).filter(function (l) { return l.label; });
    });
    return out;
  }
  function save(month, depts, opts) {
    const doc = { month: month, depts: clean(depts), example: !!(opts && opts.example), savedAt: new Date().toISOString(),
      savedBy: Club.user ? ((Club.user.firstName || '') + ' ' + (Club.user.lastName || '')).trim() : '' };
    if (get(month)) S.update(COLL, idOf(month), doc); else S.insert(COLL, Object.assign({ id: idOf(month) }, doc));
    return get(month);
  }
  function remove(month) { if (get(month)) S.remove(COLL, idOf(month)); }
  function months() { return all().map(function (d) { return d.month; }).filter(Boolean).sort(); }
  function lastBefore(month) {
    const m = months().filter(function (k) { return k < month; });
    return m.length ? get(m[m.length - 1]) : null;
  }

  function stockSold(month) {
    let amount = 0, covered = false;
    let sales = [];
    try { sales = (S.all('sales') || []).filter(function (s) { return s && String(s.date || '').slice(0, 7) === month; }); } catch (e) { sales = []; }
    sales.forEach(function (s) {
      if (s.status === 'void' || s.voided) return;
      covered = true;
      (s.items || []).forEach(function (it) {
        if (!it || !it.productId) return;
        const p = S.find('products', it.productId);
        if (p && p.cost != null) amount += (num(it.qty) || 1) * num(p.cost);
      });
    });
    return { amount: r2(amount), covered: covered };
  }

  function totals(month) {
    const doc = get(month); if (!doc) return null;
    const t = { total: 0, stockAuto: 0, example: !!doc.example };
    DEPTS.forEach(function (d) {
      t[d.key] = r2((doc.depts[d.key] || []).reduce(function (a, l) { return a + num(l.amount); }, 0));
    });
    const typedStock = (doc.depts.proShop || []).some(function (l) { return l.label.toLowerCase() === STOCK.toLowerCase() && num(l.amount) > 0; });
    if (!typedStock) { const st = stockSold(month); if (st.covered) { t.stockAuto = st.amount; t.proShop = r2(t.proShop + st.amount); } }
    DEPTS.forEach(function (d) { t.total += t[d.key]; });
    t.total = r2(t.total);
    return t;
  }

  /* Example figures for the demo only: a busy golf season month and a quiet winter month. Not the club's costs. */
  const EX_SEASON = { dining: [52000, 61000, 10500], golf: [62000, 34000, 9000, 6800], events: [11500, 12500], proShop: [0, 5200], lessons: [5200], shared: [9200, 6200, 3100, 3800] };
  const EX_WINTER = { dining: [27000, 39000, 8500], golf: [21000, 9500, 3000, 2600], events: [6500, 8000], proShop: [0, 1800], lessons: [600], shared: [11800, 6200, 3100, 3800] };
  function example(month) {
    const mo = +month.slice(5, 7), season = Club.season && Club.season.inSeasonMonth ? Club.season.inSeasonMonth(month) : (mo >= 4 && mo <= 10);
    const src = season ? EX_SEASON : EX_WINTER, out = {};
    DEPTS.forEach(function (d) {
      out[d.key] = d.lines.map(function (label, i) {
        let amount = src[d.key][i] || 0;
        if (d.key === 'proShop' && label === STOCK) { const st = stockSold(month); amount = st.covered ? 0 : Math.round((season ? 14000 : 1500)); }
        return { label: label, amount: amount };
      }).filter(function (l) { return !(d.key === 'proShop' && l.label === STOCK && !l.amount); });
    });
    return out;
  }

  Club.costs = { DEPTS: DEPTS, STOCK: STOCK, get: get, save: save, remove: remove, months: months, lastBefore: lastBefore, stockSold: stockSold, totals: totals, example: example };
})();
