/* Reports: club performance across departments, history plus live month to date.
   This file holds the period selector, the data model (context, buildRows), the shared drill drawers, the CSV
   builders and the page itself. Sections register through Club.reports.addSection (see the Sections comment below):
   reports-overview.js, reports-members.js, reports-growth.js, reports-golf.js, reports-food.js, reports-clients.js, plus Revenue and
   Accounts in this file. Charts come from js/core/charts.js. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/reports-data.js */
  const { all, num, sum, pad, r0, DEAD, curKey, shiftKey, daysIn } = Club.shared.reports;

  /** Chart heights follow the root font size, so charts grow with the interface on large displays and projectors. */
  function px(n) { let f = 16; try { f = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch (e) { /* default */ } return Math.round(n * f / 16); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  const DEPTS = [
    { key: 'dues', label: 'Dues' }, { key: 'golf', label: 'Golf' }, { key: 'proShop', label: 'Pro Shop' },
    { key: 'dining', label: 'Dining' }, { key: 'events', label: 'Events' }, { key: 'lessons', label: 'Lessons' }
  ];
  function monthLabel(k, withYear) { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1); return d.toLocaleDateString('en-US', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' }); }

  /** Most common gap between consecutive tee times (minutes). */
  function inferInterval(tees) {
    const byDate = {};
    tees.forEach(function (t) { if (t.date && t.time) (byDate[t.date] = byDate[t.date] || {})[t.time] = 1; });
    const counts = {};
    Object.keys(byDate).forEach(function (d) {
      const ts = Object.keys(byDate[d]).map(toMin).sort(function (a, b) { return a - b; });
      for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g >= 6 && g <= 20) counts[g] = (counts[g] || 0) + 1; }
    });
    let best = 10, bc = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bc) { bc = counts[k]; best = +k; } });
    return best;
  }


  /* ---------------- Dates ---------------- */
  function monthEnd(k) { return k + '-' + pad(daysIn(k)); }
  function spanDays(a, b) { return Math.round((F.toDate(b) - F.toDate(a)) / 86400000) + 1; }
  function minD(a, b) { return a < b ? a : b; }
  function maxD(a, b) { return a > b ? a : b; }
  function monthLong(k) { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function pctChange(cur, prev) { return prev ? Math.round((cur - prev) / prev * 1000) / 10 : null; }
  function isoOK(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(F.toDate(v)); }

  /* ---------------- Periods ---------------- */
  const PRESETS = [
    { v: 'd7', l: 'Last 7 days' }, { v: 'd14', l: 'Last 14 days' },
    { v: 'this', l: 'This month' }, { v: 'last', l: 'Last month' },
    { v: 'm3', l: 'Last 3 months' }, { v: 'm6', l: 'Last 6 months' }, { v: 'm12', l: 'Last 12 months' },
    { v: 'ytd', l: 'Year to date' }, { v: 'lastyear', l: 'Last year' }, { v: 'custom', l: 'Custom period' }
  ];
  const STORE_KEY = 'stboniface.reports.period';
  function presetLabel(v) { const p = PRESETS.filter(function (x) { return x.v === v; })[0]; return p ? p.l : 'Custom period'; }

  let sel = { kind: 'm12' };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === '3' || raw === '6' || raw === '12') sel = { kind: 'm' + raw };
    else if (raw) {
      const o = JSON.parse(raw);
      if (o && PRESETS.some(function (p) { return p.v === o.kind; }) && (o.kind !== 'custom' || (isoOK(o.from) && isoOK(o.to) && o.from <= o.to))) sel = { kind: o.kind, from: o.from, to: o.to };
    }
  } catch (e) { /* storage unavailable */ }
  function saveSel() { try { localStorage.setItem(STORE_KEY, JSON.stringify(sel)); } catch (e) { /* ignore */ } }

  /** Raw range for a selection, before clipping to the records on file. */
  function rangeOf(s) {
    const T = D.today(), cur = curKey(), y = +T.slice(0, 4);
    switch (s.kind) {
      case 'd7': return { from: D.addDays(T, -6), to: T };
      case 'd14': return { from: D.addDays(T, -13), to: T };
      case 'this': return { from: cur + '-01', to: T };
      case 'last': return { from: shiftKey(cur, -1) + '-01', to: monthEnd(shiftKey(cur, -1)) };
      case 'm3': return { from: shiftKey(cur, -2) + '-01', to: T };
      case 'm6': return { from: shiftKey(cur, -5) + '-01', to: T };
      case 'ytd': return { from: y + '-01-01', to: T };
      case 'lastyear': return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31' };
      case 'custom': return { from: s.from, to: s.to };
      default: return { from: shiftKey(cur, -11) + '-01', to: T };
    }
  }

  /* ---------------- Records on file ---------------- */
  function history() {
    const cur = curKey(), map = {};
    all('monthlyMetrics').forEach(function (m) { if (m.month && m.month < cur && m.revenue) map[m.month] = m; });
    return map;
  }
  /** Day-level index of the live collections, plus the first date each one covers. */
  function liveIndex() {
    const today = D.today();
    const ix = { tee: {}, teeAll: {}, res: {}, sales: {}, orders: {}, ch: {}, pay: {}, rc: {}, first: {} };
    function put(map, d, x) { (map[d] = map[d] || []).push(x); }
    function seen(k, d) { if (d && (!ix.first[k] || d < ix.first[k])) ix.first[k] = d; }
    all('teeTimes').forEach(function (t) {
      if (!t.date) return; seen('tee', t.date); put(ix.teeAll, t.date, t);
      if (t.date <= today && !DEAD[t.status] && (t.date < today || t.status === 'completed' || t.status === 'on-course' || t.status === 'checked-in')) put(ix.tee, t.date, t);
    });
    all('diningReservations').forEach(function (r) { if (!r.date) return; seen('res', r.date); if (r.date <= today && !DEAD[r.status]) put(ix.res, r.date, r); });
    all('sales').forEach(function (s) { if (!s.date) return; seen('sales', s.date); if (s.date <= today) put(ix.sales, s.date, s); });
    all('diningOrders').forEach(function (o) { if (!o.date) return; seen('orders', o.date); if (o.date <= today && o.status === 'closed') put(ix.orders, o.date, o); });
    all('charges').forEach(function (c) { if (!c.date) return; seen('ch', c.date); if (c.date <= today) put(ix.ch, c.date, c); });
    all('payments').forEach(function (p) { if (!p.date) return; seen('pay', p.date); if (p.date <= today) put(ix.pay, p.date, p); });
    /* Money taken outside the member ledger: public green fees paid online, golf shop payments at the tee sheet,
       takeout and beverage cart orders paid by card or cash. Account charges and account payments are left out
       (they are already in charges). */
    const payIds = {}; all('payments').forEach(function (p) { payIds[p.id] = 1; });
    all('receipts').forEach(function (r) {
      if (!r.date || r.date > today || !RC_DEPT[r.source] || r.chargeId || payIds[r.paymentId] || r.title === 'Account payment') return;
      if (Array.isArray(r.tenders) && r.tenders.length && r.tenders.every(function (t) { return t.method === 'account'; })) return;
      put(ix.rc, r.date, r);
    });
    const ops = ['tee', 'res', 'sales'].map(function (k) { return ix.first[k]; }).filter(Boolean);
    ix.liveMin = ops.length ? ops.reduce(minD) : null;   // the earliest any daily operations record exists
    ix.liveFrom = ops.length ? ops.reduce(maxD) : null;  // from here every operational collection is on file
    ix.roster = all('members').filter(function (m) { return m.status !== 'resigned'; }).length;
    return ix;
  }
  function eachDay(a, b, fn) { for (let d = a; d <= b; d = D.addDays(d, 1)) fn(d); }
  const RC_DEPT = { teesheet: 'golf', public: 'golf', takeout: 'dining', cart: 'dining' };   /* receipt source -> report department */
  function blank() { return { rounds: 0, guestRounds: 0, covers: 0, revenue: { dues: 0, golf: 0, proShop: 0, dining: 0, events: 0, lessons: 0 } }; }
  /** Live totals for one day. Shop and dining use sales and closed checks when the day has them, otherwise house charges. */
  function dayVals(ix, d) {
    const v = blank();
    (ix.tee[d] || []).forEach(function (t) { (t.players || []).forEach(function (p) { v.rounds++; if (p && p.type === 'guest') v.guestRounds++; }); });
    v.covers = sum(ix.res[d] || [], function (r) { return r.partySize; });
    const ch = ix.ch[d] || [];
    const cat = function (c) { return sum(ch.filter(function (x) { return x.category === c; }), function (x) { return x.amount; }); };
    const sales = ix.sales[d] || [], orders = ix.orders[d] || [];
    v.revenue.dues = cat('Dues'); v.revenue.golf = cat('Golf'); v.revenue.events = cat('Events'); v.revenue.lessons = cat('Lessons');
    v.revenue.proShop = sales.length ? sum(sales, function (s) { return s.subtotal != null ? s.subtotal : s.total; }) : cat('Pro Shop');
    /* Closed checks give dining revenue (before service and tax); Dining charges that did not come from a check
       (takeout on account, banquets, minimums) are added on top rather than dropped. */
    const fromCheck = {}; orders.forEach(function (o) { fromCheck[o.id] = 1; });
    v.revenue.dining = orders.length
      ? sum(orders, function (o) { return o.total; }) + sum(ch.filter(function (x) { return x.category === 'Dining' && !(x.source === 'dining' && fromCheck[x.refId]); }), function (x) { return x.amount; })
      : cat('Dining');
    (ix.rc[d] || []).forEach(function (r) { v.revenue[RC_DEPT[r.source]] += (r.kind === 'credit' ? -1 : 1) * (+r.total || 0); });
    return v;
  }
  function liveAgg(ix, a, b) {
    const v = blank();
    eachDay(a, b, function (d) {
      const x = dayVals(ix, d);
      v.rounds += x.rounds; v.guestRounds += x.guestRounds; v.covers += x.covers;
      DEPTS.forEach(function (k) { v.revenue[k.key] += x.revenue[k.key]; });
    });
    DEPTS.forEach(function (k) { v.revenue[k.key] = r0(v.revenue[k.key]); });
    return v;
  }
  function finish(r) { r.total = DEPTS.reduce(function (a, d) { return a + num(r.revenue && r.revenue[d.key]); }, 0); return r; }

  /**
   * Build the rows for a range. Day mode: one row per day from live records.
   * Month mode: closed months from monthly history, the current month live, and partial months either live
   * (when every daily record is on file) or prorated from the monthly total.
   */
  function buildRows(from, to, gran, ix, hist) {
    const today = D.today(), cur = curKey(), rows = [], marks = { mtd: [], live: [], prorated: [] };
    if (gran === 'day') {
      eachDay(from, to, function (d) {
        const v = dayVals(ix, d);
        DEPTS.forEach(function (k) { v.revenue[k.key] = r0(v.revenue[k.key]); });
        rows.push(finish(Object.assign(v, { key: d, from: d, to: d, label: F.dateShort(d), long: F.weekday(d) + ', ' + F.dateShort(d), members: ix.roster, live: true })));
      });
      return { rows: rows, marks: marks };
    }
    const crossYear = from.slice(0, 4) !== to.slice(0, 4);
    for (let k = from.slice(0, 7); k <= to.slice(0, 7); k = shiftKey(k, 1)) {
      const a = maxD(from, k + '-01'), b = minD(to, monthEnd(k));
      const full = a === k + '-01' && b === monthEnd(k);
      const h = hist[k];
      let r;
      if (k === cur) {
        r = Object.assign(liveAgg(ix, a, b), { live: true, members: ix.roster });
        if (!r.revenue.dues && a === k + '-01') { const lastK = Object.keys(hist).sort().pop(); if (lastK) r.revenue.dues = num(hist[lastK].revenue.dues); }
        if (b === today) { r.mtd = true; marks.mtd.push(monthLabel(k)); } else if (!full) { r.partial = true; marks.live.push(monthLabel(k)); }
      } else if (full && h) {
        r = { rounds: num(h.rounds), guestRounds: num(h.guestRounds), covers: num(h.covers), members: num(h.members), revenue: Object.assign({}, h.revenue) };
      } else if (ix.liveFrom && a >= ix.liveFrom) {
        r = Object.assign(liveAgg(ix, a, b), { live: true, partial: !full, members: ix.roster });
        marks.live.push(monthLabel(k));
      } else if (h) {
        const f = spanDays(a, b) / daysIn(k);
        r = { rounds: r0(num(h.rounds) * f), guestRounds: r0(num(h.guestRounds) * f), covers: r0(num(h.covers) * f), members: num(h.members), revenue: {}, prorated: true, days: spanDays(a, b) };
        DEPTS.forEach(function (d) { r.revenue[d.key] = r0(num(h.revenue[d.key]) * f); });
        marks.prorated.push(monthLabel(k));
      } else {
        r = Object.assign(liveAgg(ix, a, b), { live: true, partial: !full, members: ix.roster });
        marks.live.push(monthLabel(k));
      }
      r.key = k; r.from = a; r.to = b;
      r.label = monthLabel(k) + (crossYear && (k.slice(5) === '01' || k === from.slice(0, 7)) ? ' ' + k.slice(0, 4) : '');
      r.long = full ? monthLong(k) : F.date(a) + ' to ' + F.date(b);
      rows.push(finish(r));
    }
    return { rows: rows, marks: marks };
  }

  function granFor(kind, from, to, ix) {
    if (kind === 'd7' || kind === 'd14') return 'day';
    if (kind === 'custom' && spanDays(from, to) <= 31 && ix.liveFrom && from >= ix.liveFrom) return 'day';
    return 'month';
  }

  /** Everything the page needs for the selected period. */
  function context() {
    const today = D.today(), hist = history(), ix = liveIndex();
    const hk = Object.keys(hist).sort();
    const starts = [hk.length ? hk[0] + '-01' : null, ix.liveMin, ix.first.ch].filter(Boolean);
    const earliest = starts.length ? starts.reduce(minD) : curKey() + '-01';
    const raw = rangeOf(sel);
    const from = maxD(raw.from, earliest), to = minD(raw.to, today);
    const ctx = { sel: sel, raw: raw, from: from, to: to, earliest: earliest, ix: ix, hist: hist, notes: [], empty: from > to };
    if (ctx.empty) {
      ctx.rows = []; ctx.gran = 'month';
      ctx.notes.push('The club\'s records begin ' + F.date(earliest) + ', so there is nothing on file for this period yet.');
      ctx.line = rangeLine(raw.from, raw.to, 'month');
      return ctx;
    }
    ctx.gran = granFor(sel.kind, from, to, ix);
    const built = buildRows(from, to, ctx.gran, ix, hist);
    ctx.rows = built.rows; ctx.marks = built.marks;
    ctx.days = spanDays(from, to);
    ctx.unit = ctx.gran === 'day' ? 'day' : 'month';
    ctx.line = rangeLine(from, to, ctx.gran);
    ctx.hasLiveCurrent = ctx.rows.some(function (r) { return r.mtd || (r.live && r.to === today); });

    // Polite notes about what the figures are made of.
    if (raw.from < earliest) ctx.notes.push('Club records begin ' + F.date(earliest) + ', so this view shows ' + rangeLine(from, to, ctx.gran) + '.');
    if (raw.to > today) ctx.notes.push('Figures run to today.');
    const liveStart = ctx.rows.filter(function (r) { return r.live; }).map(function (r) { return r.from; }).reduce(function (a, b) { return a && a < b ? a : b; }, null);
    if (liveStart) {
      const what = { tee: 'Tee sheet', res: 'Dining reservation', sales: 'Pro shop sales' };
      const late = Object.keys(what).filter(function (k) { return ix.first[k] && ix.first[k] > liveStart && ix.first[k] <= to; });
      if (late.length) ctx.notes.push(late.map(function (k) { return what[k] + ' records begin ' + F.dateShort(ix.first[k]); }).join(' and ') + ', so live figures before then are incomplete.');
    }
    if (ctx.gran === 'month') {
      const m = built.marks, bits = [];
      if (m.prorated.length) bits.push(m.prorated.join(', ') + ' ' + (m.prorated.length === 1 ? 'is' : 'are') + ' estimated from monthly history, prorated for the days in range');
      if (m.live.length) bits.push(m.live.join(', ') + ' ' + (m.live.length === 1 ? 'comes' : 'come') + ' from daily live records');
      if (bits.length) ctx.notes.push(bits.join('. ') + '.');
    }
    ctx.prev = prevPeriod(ctx);
    return ctx;
  }

  /** The period of equal length just before, when it is fully on file. */
  function prevPeriod(ctx) {
    let pf, pt = D.addDays(ctx.from, -1);
    const wholeMonths = ctx.gran === 'month' && ctx.from.slice(8) === '01' && ctx.to === monthEnd(ctx.to.slice(0, 7));
    if (wholeMonths) pf = shiftKey(ctx.from.slice(0, 7), -ctx.rows.length) + '-01';
    else pf = D.addDays(pt, -(ctx.days - 1));
    if (pf < ctx.earliest) return null;
    const b = buildRows(pf, pt, ctx.gran === 'day' ? 'day' : 'month', ctx.ix, ctx.hist);
    // Live rows only compare fairly when the collection behind each measure covers the whole earlier period.
    const liveFrom = b.rows.filter(function (r) { return r.live; }).map(function (r) { return r.from; }).reduce(function (a, x) { return a && a < x ? a : x; }, null);
    const curLive = ctx.rows.filter(function (r) { return r.live; }).map(function (r) { return r.from; }).reduce(function (a, x) { return a && a < x ? a : x; }, null);
    const f = ctx.ix.first, covers = function (k, start) { return !start || (f[k] && f[k] <= start); };
    const has = function (k) { return covers(k, liveFrom) && covers(k, curLive); };
    const ok = { revenue: has('sales') && has('ch'), rounds: has('tee'), covers: has('res') };
    ok.dining = ok.covers;
    if (!ok.revenue && !ok.rounds && !ok.covers) return null;
    return { from: pf, to: pt, rows: b.rows, ok: ok, label: wholeMonths ? rangeLine(pf, pt, 'month') : F.dateShort(pf) + ' to ' + F.date(pt) };
  }

  function rangeLine(from, to, gran) {
    const today = D.today();
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    if (gran === 'day' || from.slice(8) !== '01' || (to !== monthEnd(to.slice(0, 7)) && to !== today)) {
      if (from === to) return F.dateLong(from);
      return (sameYear ? F.dateShort(from) : F.date(from)) + ' to ' + F.date(to);
    }
    const fk = from.slice(0, 7), tk = to.slice(0, 7);
    if (fk === tk) return monthLong(fk) + (to === today && to !== monthEnd(tk) ? ' to date' : '');
    return monthLabel(fk, true) + ' to ' + (to === today && to !== monthEnd(tk) ? F.date(to) : monthLabel(tk, true));
  }

  function chartLabel(r) { return r.label + (r.mtd || r.partial || r.prorated ? '*' : ''); }
  /** Drawer chart labels: the month alone (the year is in the drawer's period line), so neighbours never run together. */
  function axisLabel(r) { return String(r.label).replace(/ \d{4}$/, '') + (r.mtd || r.partial || r.prorated ? '*' : ''); }
  function inRange(ctx) { return function (d) { return d && d >= ctx.from && d <= ctx.to; }; }
  /** Average per day, or per month (by elapsed days when any month in range is partial). */
  function per(ctx, v) {
    if (ctx.gran === 'day') return v / Math.max(1, ctx.days);
    const whole = ctx.rows.every(function (r) { return !r.mtd && !r.partial && !r.prorated; });
    return v / Math.max(1, whole ? ctx.rows.length : ctx.days / 30.4375);
  }
  function unitWord(ctx) { return ctx.gran === 'day' ? 'day' : 'month'; }
  /** Rows that make a fair comparison for best and worst: whole closed units when there are enough. */
  function fairRows(ctx) {
    const whole = ctx.rows.filter(function (r) { return !r.mtd && !r.partial && !r.prorated && !(ctx.gran === 'day' && r.key === D.today()); });
    return whole.length >= 2 ? whole : ctx.rows;
  }


  /* ---------------- Plain-text notes about what the figures are made of ---------------- */
  function marksText(ctx) {
    if (ctx.gran === 'day') return 'Daily figures come from the live tee sheet, sales, dining checks and house charges.';
    const m = ctx.marks || { mtd: [], live: [], prorated: [] }, bits = [];
    if (m.mtd.length) bits.push(m.mtd.join(', ') + ' is month to date, from live sales, dining checks and house charges');
    if (m.live.length) bits.push(m.live.join(', ') + ' covers only the days in range, from live records');
    if (m.prorated.length) bits.push(m.prorated.join(', ') + ' is prorated from its monthly total');
    return (bits.length ? bits.join('. ') + '. ' : '') + 'Closed months come from the monthly ledger.';
  }
  function coverageText(first, ctx, what) {
    if (!first) return '';
    if (first > ctx.to) return what + ' records begin ' + F.date(first) + ', after this period ends.';
    if (first > ctx.from) return what + ' records begin ' + F.date(first) + ', so earlier days in this period are not included.';
    return '';
  }
  function partialNote(ctx) {
    const m = ctx.marks || { mtd: [], live: [], prorated: [] };
    const bits = [];
    if (m.mtd.length) bits.push(m.mtd.join(', ') + ' is month to date (striped)');
    if (m.live.length || m.prorated.length) bits.push(m.live.concat(m.prorated).join(', ') + (m.live.length + m.prorated.length === 1 ? ' is' : ' are') + ' partial (striped)');
    return bits.length ? bits.join('. ') + '.' : '';
  }
  function csvKey(r) { return r.key + (r.mtd ? ' (MTD)' : r.partial ? ' (partial)' : r.prorated ? ' (prorated)' : ''); }
  function periodTotals(rows) {
    return { revenue: sum(rows, function (r) { return r.total; }), rounds: sum(rows, function (r) { return r.rounds; }), covers: sum(rows, function (r) { return r.covers; }) };
  }
  function isPartial(r) { return !!(r.mtd || r.partial || r.prorated); }
  /** Labels for a column chart of the period's rows: month names, the year written once, every other label on phones. */
  function colLabels(ctx) {
    const rows = ctx.rows, crossYear = rows.length && rows[0].key.slice(0, 4) !== rows[rows.length - 1].key.slice(0, 4);
    if (ctx.gran === 'day') return { labels: rows.map(function (r) { return F.dateShort(r.key).replace(/^(\w+) /, '$1 '); }), years: [], titles: rows.map(function (r) { return r.long; }), partial: rows.map(isPartial) };
    return {
      labels: rows.map(function (r) { return monthLabel(r.key); }),
      years: rows.map(function (r, i) { return (i === 0 || r.key.slice(5) === '01') && (crossYear || i === 0) ? r.key.slice(0, 4) : ''; }),
      titles: rows.map(function (r) { return r.long + (r.mtd ? ' (to date)' : ''); }),
      partial: rows.map(isPartial)
    };
  }

  /* ---------------- Formatting ---------------- */
  /** Rounded headline figures: $3.34M, $294.6K, 43.5K. Full figures stay in tables and tooltips. */
  function moneyShort(v) {
    v = num(v); const a = Math.abs(v), sign = v < 0 ? '-' : '';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1e4) return sign + '$' + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return F.money0(v);
  }
  function numShort(v) {
    v = num(v); const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1e5) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return F.num(v);
  }
  /** "up 5.2% on the period before", with the word carrying the meaning and the colour only supporting it. */
  function deltaHTML(cur, prev, ctx, k, fallback) {
    if (!prevOK(ctx, k) || !prev) return fallback ? esc(fallback) : '<span>No earlier period to compare</span>';
    const d = pctChange(cur, prev);
    if (d === 0) return 'Level with the period before';
    return '<b class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? 'up' : 'down') + ' ' + Math.abs(d) + '%</b> on the period before';
  }
  function memo(ctx, key, fn) { let m = ctx.$memo; if (!m) m = ctx.$memo = {}; if (!(key in m)) m[key] = fn(ctx); return m[key]; }

  /* ---------------- Headline changes ----------------
     A KPI tile shows a compact signed change in its lower right corner ("+3", "+4.2%", "-$1,240") when there is a fair
     comparison: kpiChg(v, unit, since, { upGood, label }). The colour says whether the change is good for the club (up is
     good unless upGood is false); the words, in the tooltip and for screen readers, say what it is compared with.
     Units: num, pct, money, cents (two decimals), pts (percentage points), dec (one decimal), min. */
  const CHG_DP = { pct: 1, pts: 1, dec: 1, cents: 2 };
  function kpiChg(v, unit, since, o) {
    if (v == null || typeof v !== 'number' || !isFinite(v)) return null;
    o = o || {}; unit = unit || 'num';
    const f = Math.pow(10, CHG_DP[unit] || 0);
    return { v: Math.round(v * f) / f, unit: unit, since: since || '', upGood: o.upGood !== false, label: o.label || '' };
  }
  function chgMag(c) {
    const a = Math.abs(c.v);
    switch (c.unit) {
      case 'pct': return (a >= 100 ? Math.round(a) : a) + '%';
      case 'money': return moneyShort(a);
      case 'cents': return F.money(a);
      case 'pts': return a + (a === 1 ? ' pt' : ' pts');
      case 'dec': return a.toFixed(1);
      case 'min': return a + ' min';
      default: return F.num(a);
    }
  }
  function chgText(c) { return (c.v > 0 ? '+' : c.v < 0 ? '-' : '') + chgMag(c); }
  function chgLabel(c) { return c.label || ((c.v > 0 ? 'Up ' + chgMag(c) : c.v < 0 ? 'Down ' + chgMag(c) : 'No change') + (c.since ? ' ' + c.since : '')); }
  function chgClass(c) { return c.v === 0 ? 'flat' : (c.v > 0) === c.upGood ? 'good' : 'bad'; }
  function prevWords(ctx) { return ctx.prev ? 'on the period before (' + ctx.prev.label + ')' : ''; }
  /** Percentage change on the period before, for a measure the previous period covers fairly (prevOK). */
  function prevPct(cur, prev, ctx, k, o) { if (!prevOK(ctx, k) || !prev) return null; return kpiChg(pctChange(cur, prev), 'pct', prevWords(ctx), o); }
  /** Percentage change for a figure a section counts itself, when its records begin on or before the earlier period. */
  function pctVs(cur, prev, ctx, o) { if (!ctx.prev || !prev) return null; return kpiChg(pctChange(cur, prev), 'pct', prevWords(ctx), o); }
  /** Whether a collection whose records begin on `first` covers the whole earlier period. */
  function coversPrev(ctx, first) { return !!(ctx.prev && first && first <= ctx.prev.from); }
  /** The earlier period as a context of its own, so a section can run its own figures on it. */
  function prevCtx(ctx) {
    if (!ctx.prev) return null;
    return memo(ctx, 'prevCtx', function () {
      return { sel: ctx.sel, raw: ctx.prev, from: ctx.prev.from, to: ctx.prev.to, earliest: ctx.earliest, ix: ctx.ix, hist: ctx.hist, notes: [], empty: false,
        gran: ctx.gran, unit: ctx.unit, rows: ctx.prev.rows, marks: { mtd: [], live: [], prorated: [] }, days: spanDays(ctx.prev.from, ctx.prev.to), line: ctx.prev.label, prev: null, isPrev: true };
    });
  }
  /** Sentences for a description: blanks dropped, joined with single spaces. */
  function sents(list) { return (list || []).filter(Boolean).map(function (s) { return String(s).trim(); }).join(' '); }
  function pctOf(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function daysSince(iso) { return Math.max(0, Math.round((F.toDate(D.today()) - F.toDate(iso)) / 86400000)); }
  function joinAnd(list) { return list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }

  /* ---------------- CSV / download ---------------- */
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(function (c) { const s = c == null ? '' : String(c); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
  }
  function download(name, text, type) {
    /* A byte-order mark tells Excel (Mac too) the file is UTF-8, so names like Amélie open correctly. */
    const csv = !type || /csv/.test(type);
    const blob = new Blob([(csv ? '\uFEFF' : '') + text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function csvName(id, ctx) { return 'stboniface-' + id + '-' + ctx.from + '-to-' + ctx.to + '.csv'; }

  /* ---------------- Core data: revenue and accounts ---------------- */
  function revenueCSV(ctx) {
    return [[ctx.gran === 'day' ? 'Date' : 'Month'].concat(DEPTS.map(function (d) { return d.label; })).concat(['Total'])].concat(ctx.rows.map(function (r) { return [csvKey(r)].concat(DEPTS.map(function (d) { return num(r.revenue[d.key]); })).concat([r.total]); }));
  }
  function deptTotals(ctx) {
    return memo(ctx, 'deptTotals', function () {
      const t = periodTotals(ctx.rows).revenue;
      return DEPTS.map(function (d) { return { key: d.key, label: d.label, value: sum(ctx.rows, function (r) { return r.revenue[d.key]; }) }; }).map(function (x) { x.share = t ? Math.round(x.value / t * 100) : 0; return x; }).sort(function (a, b) { return b.value - a.value; });
    });
  }
  function inSeasonKey(k) { const mo = +k.slice(5, 7); return mo >= 4 && mo <= 10; }

  const BUCKETS = ['Current', '31 to 60 days', '61 to 90 days', 'Over 90 days'];
  function bucketOf(days) { return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3; }
  function agingData(ctx) {
    return memo(ctx, 'aging', function () {
      const charges = all('charges'), statements = all('statements');
      const accounts = [];
      all('members').forEach(function (m) {
        let bal = Math.round(num(m.balance) * 100) / 100;
        if (bal <= 0) return;
        const b = [0, 0, 0, 0];
        const mine = charges.filter(function (c) { return c.memberId === m.id && num(c.amount) > 0 && c.date; }).sort(function (a, c) { return c.date.localeCompare(a.date); });
        for (let i = 0; i < mine.length && bal > 0; i++) { const take = Math.min(bal, num(mine[i].amount)); b[bucketOf(daysSince(mine[i].date))] += take; bal -= take; }
        if (bal > 0.005) {
          const open = statements.filter(function (s) { return s.memberId === m.id && (s.status === 'overdue' || s.status === 'sent') && s.issuedOn; }).sort(function (a, c) { return a.issuedOn.localeCompare(c.issuedOn); });
          b[open.length ? bucketOf(daysSince(open[0].issuedOn)) : 1] += bal;
        }
        accounts.push({ m: m, b: b, total: b[0] + b[1] + b[2] + b[3], late: b[2] + b[3] });
      });
      accounts.sort(function (a, c) { return c.total - a.total; });
      const tot = [0, 1, 2, 3].map(function (i) { return sum(accounts, function (a) { return a.b[i]; }); });
      const grand = tot[0] + tot[1] + tot[2] + tot[3];
      const inR = inRange(ctx);
      const billed = sum(charges.filter(function (c) { return inR(c.date) && num(c.amount) > 0 && !c.reversedBy; }), function (c) { return c.amount; });   /* undone charges are not billing */
      const collected = sum(all('payments').filter(function (p) { return inR(p.date); }), function (p) { return p.amount; });
      return { accounts: accounts, tot: tot, grand: grand, billed: billed, collected: collected, late: tot[2] + tot[3], lateAccounts: accounts.filter(function (a) { return a.late >= 0.5; }) };
    });
  }
  function agingCSV(ctx) {
    const d = agingData(ctx);
    return [['Member', 'Member no', 'Current', '31-60', '61-90', '90+', 'Balance']].concat(d.accounts.map(function (a) { return [Club.members.name(a.m), a.m.memberNo].concat(a.b.map(function (v) { return v.toFixed(2); })).concat([a.total.toFixed(2)]); }))
      .concat([[], ['Billed in period', '', '', '', '', '', d.billed.toFixed(2)], ['Collected in period', '', '', '', '', '', d.collected.toFixed(2)]]);
  }
  function spendData(ctx) {
    return memo(ctx, 'spend', function () {
      const inR = inRange(ctx), per_ = {};
      all('charges').forEach(function (c) {
        if (!c.memberId || !inR(c.date) || c.category === 'Dues' || num(c.amount) <= 0 || c.reversedBy) return;   /* an undone or reversed charge is not spend */
        const p = per_[c.memberId] = per_[c.memberId] || { total: 0, cats: {} };
        p.total += num(c.amount); p.cats[c.category || 'Other'] = (p.cats[c.category || 'Other'] || 0) + num(c.amount);
      });
      const list = Object.keys(per_).map(function (id) { const cats = per_[id].cats; return { id: id, m: Club.members.get(id), total: per_[id].total, cats: cats, top: Object.keys(cats).sort(function (x, y) { return cats[y] - cats[x]; })[0] }; }).sort(function (a, b) { return b.total - a.total; });
      return { list: list, total: sum(list, function (a) { return a.total; }) };
    });
  }
  function spendCSV(ctx) {
    const d = spendData(ctx);
    return [['Rank', 'Member', 'Member no', 'Spend', 'Top category']].concat(d.list.map(function (a, i) { return [i + 1, a.m ? Club.members.name(a.m) : a.id, a.m ? a.m.memberNo : '', a.total.toFixed(2), a.top]; }));
  }
  function memberLink(m, id) { return m ? '<a class="primary-cell" href="#/members/' + esc(m.id) + '">' + esc(Club.members.name(m)) + '</a>' : '<span class="muted">Former member</span>'; }

  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function teeCapacity(allT) {
    const interval = inferInterval(allT);
    let minT = 24 * 60, maxT = 0;
    allT.forEach(function (t) { if (t.time) { const m = toMin(t.time); if (m < minT) minT = m; if (m > maxT) maxT = m; } });
    return { interval: interval, cap: minT <= maxT ? (Math.floor((maxT - minT) / interval) + 1) * 4 : 0 };
  }

  /* ---------------- Sections ----------------
     A section is registered with Club.reports.addSection({
       id, label, order, collections: [],            collections: store names whose changes redraw the page
       kpis(ctx)   -> [{ label, value, d (html), chg: kpiChg(...) or null, drill, sec, go, aria }]
       main(ctx, state) -> { id, title, take, chips: [{ id, label }], chip, body, desc, foot, csvId, drill, drillLabel }
       panels(ctx) -> [{ id, title, take, body, desc, foot, csvId, drill, drillArg, drillLabel, more: [{ label, drill, arg }] }]
                      desc: two to four plain sentences under the chart (what it shows, what stands out, what it means)
       about(ctx)  -> [sentences]
       csv(ctx)    -> [{ id, title, rows }]
       drills: { key: fn(ctx, arg) -> { title, body, csv, go, goLabel, asOf, noNotes, wire(api) } }
       facts(ctx) -> [{ text, where }]     attention(ctx) -> [{ n, text, label, drill, sec, arg, href, ok }]
       ideas(ctx) -> [{ title, text, assume, amount, per, year, id, drill, drillArg, drillLabel }]   "Ideas to grow revenue" (see ideasOf below)
       ideasTitle, ideasTake, ideasFirst, ideasLinks                 the Overview's "Top opportunities" uses these
       data: {}                             anything other sections may read (the Overview does)
     }) */
  const SECTIONS = [];
  function addSection(s) {
    for (let i = SECTIONS.length - 1; i >= 0; i--) if (SECTIONS[i].id === s.id) SECTIONS.splice(i, 1);
    SECTIONS.push(s);
    SECTIONS.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function getSection(id) { return SECTIONS.filter(function (s) { return s.id === id; })[0] || null; }

  /* ---------------- Revenue (section) ---------------- */
  const DEPT_COLOR = { golf: 'var(--viz-1)', dining: 'var(--viz-3)', events: 'var(--viz-2)', other: 'var(--viz-context)' };
  function revenueKpis(ctx) {
    const t = periodTotals(ctx.rows).revenue, p = ctx.prev ? periodTotals(ctx.prev.rows).revenue : 0;
    const fair = fairRows(ctx);
    const best = fair.length ? fair.reduce(function (b, r) { return r.total > b.total ? r : b; }, fair[0]) : null;
    const u = unitWord(ctx);
    const avgChg = prevOK(ctx, 'revenue') && p ? kpiChg(per(ctx, t) - per(prevCtx(ctx), p), 'money', 'a ' + u + ' against the period before (' + ctx.prev.label + ')') : null;
    return [
      { label: 'Revenue in this period', value: moneyShort(t), d: deltaHTML(t, p, ctx, 'revenue', ctx.line), chg: prevPct(t, p, ctx, 'revenue'), drill: 'revenue', aria: 'Revenue ' + F.money0(t) },
      { label: 'Average ' + u, value: moneyShort(per(ctx, t)), d: esc('across ' + (ctx.gran === 'day' ? ctx.days + ' days' : (Math.round(ctx.days / 30.4375 * 10) / 10) + ' months')), chg: avgChg, drill: 'revenue' },
      { label: 'Best ' + u, value: best ? (ctx.gran === 'day' ? F.dateShort(best.key) : monthLong(best.key).split(' ')[0]) : 'None', d: esc(best ? F.money0(best.total) : 'No complete ' + u + 's yet'), drill: 'revenue' }
    ];
  }
  function revenueMain(ctx, state) {
    const chip = state.chip || 'all';
    const L = colLabels(ctx), dept = DEPTS.filter(function (d) { return d.key === chip; })[0];
    const vals = ctx.rows.map(function (r) { return chip === 'all' ? r.total : num(r.revenue[chip]); });
    const total = sum(vals, function (v) { return v; });
    const fair = fairRows(ctx);
    const fairVals = fair.map(function (r) { return chip === 'all' ? r.total : num(r.revenue[chip]); });
    let take;
    if (!total) take = (dept ? dept.label : 'Revenue') + ' recorded nothing in this period.';
    else {
      const bi = fairVals.indexOf(Math.max.apply(null, fairVals)), best = fair[bi];
      const u = unitWord(ctx);
      const dt = deptTotals(ctx);
      if (chip === 'all') take = (best ? (ctx.gran === 'day' ? F.weekday(best.key) + ', ' + F.dateShort(best.key) : monthLong(best.key).split(' ')[0]) + ' was the biggest ' + u + ' at ' + F.money0(best.total) + '. ' : '') + dt[0].label + ' made up ' + dt[0].share + '% of the period\'s revenue' + (dt[1] ? ' and ' + dt[1].label.toLowerCase() + ' ' + dt[1].share + '%' : '') + '.';
      else { const d0 = dt.filter(function (x) { return x.key === chip; })[0]; take = dept.label + ' brought in ' + F.money0(total) + ', ' + d0.share + '% of revenue' + (best && fairVals[bi] ? ', peaking in ' + (ctx.gran === 'day' ? F.dateShort(best.key) : monthLong(best.key).split(' ')[0]) + ' at ' + F.money0(fairVals[bi]) : '') + '.'; }
    }
    const body = Club.charts.columns({ labels: L.labels, years: L.years, tipTitles: L.titles, partial: L.partial, values: vals, money: true, tipName: dept ? dept.label : 'Revenue', ariaLabel: (dept ? dept.label : 'Revenue') + ' by ' + unitWord(ctx) });
    return { id: 'revenue-trend', title: 'Revenue by ' + unitWord(ctx), take: take, chips: [{ id: 'all', label: 'All revenue' }].concat(DEPTS.map(function (d) { return { id: d.key, label: d.label }; })), chip: chip, body: body, desc: revenueDesc(ctx, chip), foot: partialNote(ctx), csvId: 'revenue', drill: 'revenue', drillLabel: 'See the table' };
  }
  function whenLabel(ctx, r) { return ctx.gran === 'day' ? F.weekday(r.key) + ', ' + F.dateShort(r.key) : monthLong(r.key); }
  function isWeekend(iso) { const g = F.toDate(iso).getDay(); return g === 0 || g === 6; }
  /** Under the revenue chart: what it shows, the quietest unit, the season or weekday pattern, and what that means. */
  function revenueDesc(ctx, chip) {
    const dept = DEPTS.filter(function (d) { return d.key === chip; })[0];
    const val = function (r) { return dept ? num(r.revenue[chip]) : r.total; };
    const u = unitWord(ctx), total = sum(ctx.rows, val), all_ = periodTotals(ctx.rows).revenue;
    if (!total) return sents(['Nothing was recorded for ' + (dept ? dept.label.toLowerCase() + ' revenue' : 'revenue') + ' in these dates.', 'Choose a longer period to see how it moves through the year.']);
    const out = [dept ? 'Each column is one ' + u + '\'s ' + dept.label.toLowerCase() + ' revenue, ' + F.money0(total) + ' in all and ' + pctOf(total, all_) + '% of the club\'s takings.' : 'Each column is one ' + u + '\'s takings from all six departments, ' + F.money0(total) + ' in all.'];
    const fair = fairRows(ctx);
    if (fair.length >= 2) {
      let lo = fair[0]; fair.forEach(function (r) { if (val(r) < val(lo)) lo = r; });
      const avg = sum(fair, val) / fair.length;
      if (avg > 0 && val(lo) < avg) out.push(whenLabel(ctx, lo) + ' was the quietest at ' + F.money0(val(lo)) + ', ' + Math.round((avg - val(lo)) / avg * 100) + '% below the average ' + u + ' of ' + F.money0(avg) + '.');
    }
    if (ctx.gran === 'month') {
      const s = fair.filter(function (r) { return inSeasonKey(r.key); }), w = fair.filter(function (r) { return !inSeasonKey(r.key); });
      if (s.length && w.length) {
        const sa = sum(s, val) / s.length, wa = sum(w, val) / w.length;
        out.push('April to October averaged ' + moneyShort(sa) + ' a month, against ' + moneyShort(wa) + ' over the winter.');
        out.push(wa >= sa * 0.75 ? 'It holds up through the winter, so growth here comes from more spending per visit rather than filling a gap.' :
          !dept || chip === 'dining' || chip === 'events' ? 'The winter gap is where the most room is: dining and events do not need the course, so they are the way to fill it.' : 'Most of this money arrives in the golf season, so a strong start in April and May matters most.');
      }
    } else {
      const we = fair.filter(function (r) { return isWeekend(r.key); }), wd = fair.filter(function (r) { return !isWeekend(r.key); });
      if (we.length && wd.length) {
        const a = sum(we, val) / we.length, b = sum(wd, val) / wd.length;
        out.push('Weekends averaged ' + F.money0(a) + ' a day and weekdays ' + F.money0(b) + '.');
        out.push(b < a * 0.8 ? 'Quieter weekdays have the most room for promotions and midweek events.' : 'Weekdays keep pace with weekends, so the gains are in spending per visit.');
      }
    }
    if (out.length < 2) out.push('Use the buttons above the chart to see one department at a time.');
    return sents(out.slice(0, 4));
  }
  function revenuePanels(ctx) {
    const dt = deptTotals(ctx), t = periodTotals(ctx.rows).revenue;
    const top2 = dt.slice(0, 2).filter(function (x) { return x.value > 0; });
    const take1 = !t ? 'No revenue was recorded in this period.' : top2.length === 2 ? top2[0].label + ' and ' + top2[1].label.toLowerCase() + ' make up ' + (top2[0].share + top2[1].share) + '% of revenue.' : top2[0].label + ' is all of the revenue in this period.';
    const d1 = [];
    if (!t) d1.push('No revenue was recorded in these dates.', 'Choose a longer period to see where the money comes from.');
    else {
      d1.push('Each bar is one department\'s share of the ' + moneyShort(t) + ' taken in this period.');
      const paid = dt.filter(function (x) { return x.value > 0; }), small = paid[paid.length - 1];
      if (paid.length > 2) d1.push('The smallest, ' + small.label.toLowerCase() + ', brought in ' + F.money0(small.value) + ' (' + small.share + '%).');
      const pt = prevOK(ctx, 'revenue') && ctx.gran === 'month' ? periodTotals(ctx.prev.rows).revenue : 0;   /* daily shares jump with billing runs */
      if (pt) {
        const mv = dt.map(function (x) { return { x: x, from: pctOf(sum(ctx.prev.rows, function (r) { return r.revenue[x.key]; }), pt) }; }).sort(function (a, b) { return Math.abs(b.x.share - b.from) - Math.abs(a.x.share - a.from); })[0];
        if (mv && Math.abs(mv.x.share - mv.from) >= 2) d1.push(mv.x.label + (/s$/.test(mv.x.label) ? '\'' : '\'s') + ' share moved from ' + mv.from + '% in the period before to ' + mv.x.share + '%.');
      }
      const dues = dt.filter(function (x) { return x.key === 'dues'; })[0];
      if (dues) d1.push(dues.share >= 40 ? 'Dues are ' + dues.share + '% of revenue, so keeping members matters more than any single sale.' : 'Dues are ' + dues.share + '% of revenue, so day-to-day sales in golf, dining and events carry most of the club.');
    }
    const p1 = { id: 'revenue-depts', title: 'Where the money comes from', take: take1, desc: sents(d1.slice(0, 4)), body: Club.charts.ranked(dt.map(function (x) { return { label: x.label, value: x.value, attrs: 'data-drill="revenue" aria-label="' + esc(x.label + ' ' + F.money0(x.value) + ', ' + x.share + '% of revenue. See the revenue table') + '"' }; }), { total: t, fmt: moneyShort }), csvId: 'revenue', drill: 'revenue', drillLabel: 'See the table' };
    // Golf season and winter: April to October against the rest of the year, from the monthly rows.
    function pick(rows) { const o = { golf: 0, dining: 0, events: 0, other: 0 }; rows.forEach(function (r) { o.golf += num(r.revenue.golf); o.dining += num(r.revenue.dining); o.events += num(r.revenue.events); o.other += num(r.revenue.dues) + num(r.revenue.proShop) + num(r.revenue.lessons); }); return o; }
    const season = ctx.rows.filter(function (r) { return inSeasonKey(r.key); }), winter = ctx.rows.filter(function (r) { return !inSeasonKey(r.key); });
    const groups = [{ label: 'Golf season, April to October', rows: season }, { label: 'Winter, November to March', rows: winter }].filter(function (g) { return g.rows.length; });
    const NAMES = { golf: 'Golf', dining: 'Dining', events: 'Events', other: 'Everything else' };
    function lead(o) { const ks = ['golf', 'dining', 'events', 'other'].sort(function (a, b) { return o[b] - o[a]; }); const tot = o.golf + o.dining + o.events + o.other; return { key: ks[0], share: tot ? Math.round(o[ks[0]] / tot * 100) : 0, tot: tot }; }
    let take2, body2;
    if (!groups.length || !t) { take2 = 'Nothing to split in this period.'; body2 = '<p class="rp-empty">No revenue on file for these dates.</p>'; }
    else {
      const leads = groups.map(function (g) { return Object.assign({ g: g }, lead(pick(g.rows))); });
      take2 = leads.map(function (l) { return (l.g.rows === season ? 'From April to October ' : 'Over the winter ') + NAMES[l.key].toLowerCase() + ' leads at ' + l.share + '% of revenue'; }).join('. ') + '.';
      body2 = groups.map(function (g) {
        const o = pick(g.rows), tot = o.golf + o.dining + o.events + o.other;
        return '<div class="season"><div class="season-row"><span>' + esc(g.label) + '</span><b>' + esc(moneyShort(tot)) + '</b></div>' +
          Club.charts.split(['golf', 'dining', 'events', 'other'].map(function (k) { return { label: NAMES[k], value: o[k], color: DEPT_COLOR[k] }; }), { fmt: F.money0 }) +
          '<div class="legend">' + ['golf', 'dining', 'events'].map(function (k) { return '<span>' + NAMES[k] + ' ' + (tot ? Math.round(o[k] / tot * 100) : 0) + '%</span>'; }).join('') + '</div></div>';
      }).join('') + '<div class="legend keys">' + ['golf', 'dining', 'events', 'other'].map(function (k) { return '<span><i style="background:' + DEPT_COLOR[k] + '"></i>' + NAMES[k] + '</span>'; }).join('') + '</div>';
    }
    let desc2;
    if (!groups.length || !t) desc2 = sents(['This splits the year into the golf season and the winter, by department.', 'There is no revenue on file for these dates.']);
    else {
      const u = unitWord(ctx), avgOf = function (g) { const o = pick(g.rows); return (o.golf + o.dining + o.events + o.other) / g.rows.length; };
      const sg = groups.filter(function (g) { return g.rows === season; })[0], wg = groups.filter(function (g) { return g.rows === winter; })[0];
      const d2 = ['The bars split the ' + u + 's in this period into the golf season and the winter, by department.'];
      if (sg && wg) {
        d2.push('The season averaged ' + moneyShort(avgOf(sg)) + ' a ' + u + ' and the winter ' + moneyShort(avgOf(wg)) + '.');
        const o = pick(wg.rows), tot = o.golf + o.dining + o.events + o.other, k = ['golf', 'dining', 'events'].sort(function (a, b) { return o[b] - o[a]; })[0];
        if (o[k] > 0) d2.push('Leaving dues, the shop and lessons aside, ' + NAMES[k].toLowerCase() + ' leads the winter at ' + pctOf(o[k], tot) + '% of revenue, so winter promotions there will count the most.');
      } else d2.push('Only ' + (sg ? 'golf season' : 'winter') + ' ' + u + 's are in this period, so there is nothing to compare with.', 'Choose the last 12 months to see both halves of the year.');
      desc2 = sents(d2);
    }
    const p2 = { id: 'revenue-season', title: 'Golf season and winter', take: take2, body: body2, desc: desc2, csvId: 'revenue-season', drill: 'revenue', drillLabel: 'See the table' };
    return [p1, p2];
  }
  /* Revenue ideas: winter dining and events, open event and clinic places, the outings pipeline and member spending.
     Each figure comes from the records; each assumption is stated. */
  function revenueIdeas(ctx) {
    const out = [], T = D.today(), fair = fairRows(ctx);
    if (ctx.gran === 'month') {
      const w = fair.filter(function (r) { return !inSeasonKey(r.key); });
      if (w.length) {
        const ed = sum(w, function (r) { return num(r.revenue.dining) + num(r.revenue.events); }) / w.length, lift = ed * 0.1;
        if (lift >= 1) out.push({ title: 'Grow winter dining and events', text: 'In the ' + w.length + ' winter ' + plural(w.length, 'month') + ' of this period, dining and events brought in ' + F.money0(ed) + ' a month on average. Theme nights, holiday parties and winter events that lift that by 10% would add about ' + F.money0(lift) + ' a month.',
          assume: 'Assumes a 10% lift on this period\'s average winter month, over the five winter months, November to March.', amount: lift, per: 'a month', year: lift * 5 });
      }
    }
    const ev = all('events').filter(function (e) { return e.date && e.date >= T && e.status !== 'cancelled' && e.status !== 'draft' && num(e.capacity) > 0 && num(e.price) > 0; }).map(function (e) {
      const taken = sum((e.registrations || []).filter(function (g) { return g && !g.cancelled; }), function (g) { return 1 + num(g.guests); });
      return { e: e, open: Math.max(0, num(e.capacity) - taken) };
    }).filter(function (x) { return x.open > 0; });
    if (ev.length) {
      const places = sum(ev, function (x) { return x.open; }), worth = sum(ev, function (x) { return x.open * num(x.e.price); });
      const top = ev.slice().sort(function (a, b) { return b.open * num(b.e.price) - a.open * num(a.e.price); })[0];
      out.push({ title: 'Fill the open event places', text: ev.length + ' upcoming ' + plural(ev.length, 'event has', 'events have') + ' ' + F.num(places) + ' open ' + plural(places, 'place') + ', worth ' + F.money0(worth) + ' at the listed prices. The largest is ' + (top.e.title || 'an event') + ' on ' + F.dateShort(top.e.date) + ', with ' + top.open + ' left. Filling half of them would add about ' + F.money0(worth / 2) + '.',
        assume: 'Assumes half the open places sell at each event\'s listed price.', amount: worth / 2, per: 'one time', year: worth / 2 });
    }
    const pg = all('programs').filter(function (p) { return p.startDate && p.startDate >= T && num(p.capacity) > 0 && num(p.price) > 0; }).map(function (p) { return { p: p, open: Math.max(0, num(p.capacity) - (p.enrolled || []).length) }; }).filter(function (x) { return x.open > 0; });
    if (pg.length) {
      const seats = sum(pg, function (x) { return x.open; }), worth = sum(pg, function (x) { return x.open * num(x.p.price); });
      out.push({ title: 'Fill the open clinic places', text: pg.length + ' upcoming ' + plural(pg.length, 'clinic has', 'clinics have') + ' ' + seats + ' open ' + plural(seats, 'place') + ', worth ' + F.money0(worth) + ' at their prices. Filling half of them would add about ' + F.money0(worth / 2) + '.',
        assume: 'Assumes half the open places are taken at each clinic\'s listed price.', amount: worth / 2, per: 'one time', year: worth / 2 });
    }
    const outs = all('outings'), WON = { Completed: 1, Confirmed: 1, 'Deposit paid': 1 };
    const won = outs.filter(function (o) { return WON[o.stage]; }).length, lost = outs.filter(function (o) { return o.stage === 'Lost'; }).length;
    const quoted = outs.filter(function (o) { return o.stage === 'Quoted'; }), enq = outs.filter(function (o) { return o.stage === 'Enquiry'; });
    if (quoted.length || enq.length) {
      const worth = sum(quoted, function (o) { return o.quote && o.quote.subtotal; }), rate = won + lost >= 3 ? won / (won + lost) : null;
      const bits = [];
      if (quoted.length) bits.push(quoted.length + ' outing ' + plural(quoted.length, 'quote is', 'quotes are') + ' waiting for an answer, ' + F.money0(worth) + ' before tax.');
      if (enq.length) bits.push(enq.length + ' ' + plural(enq.length, 'enquiry', 'enquiries') + ' for ' + F.num(sum(enq, function (o) { return o.players; })) + ' players still ' + (enq.length === 1 ? 'needs' : 'need') + ' a quote.');
      if (quoted.length && rate != null) bits.push('The club has won ' + won + ' of the ' + (won + lost) + ' outings decided so far; at that rate the open quotes are worth about ' + F.money0(worth * rate) + '. A follow-up call this week keeps them moving.');
      out.push({ title: 'Follow up the outings pipeline', text: sents(bits), assume: rate != null ? 'Uses the club\'s own win rate on outings already decided. Enquiries without a quote are not counted.' : 'Too few outings have been decided to estimate a win rate.', amount: quoted.length && rate != null ? worth * rate : null, per: 'one time', year: quoted.length && rate != null ? worth * rate : 0 });
    }
    const sp = spendData(ctx), active = all('members').filter(function (m) { return m.status === 'active'; }).length;
    const from = ctx.ix.first.ch && ctx.ix.first.ch > ctx.from ? ctx.ix.first.ch : ctx.from, months = spanDays(from, ctx.to) / 30.4375;
    if (active && sp.total > 0 && months >= 0.2) {
      const each = sp.total / active / months, extra = 10 * active;
      out.push({ title: 'Raise member spending in the clubhouse', text: 'Active members spent ' + F.money0(each) + ' a month each on house charges beyond dues' + (from > ctx.from ? ' (charges on file begin ' + F.dateShort(from) + ')' : '') + '. Ten dollars more a month from each of the ' + active + ' active members, a drink after the round or one more lunch, would add ' + F.money0(extra) + ' a month.',
        assume: 'Assumes $10 more a month from every active member, for twelve months.', amount: extra, per: 'a month', year: extra * 12 });
    }
    return out;
  }
  function seasonCSV(ctx) {
    const rows = [['Period', 'Months', 'Golf', 'Dining', 'Events', 'Everything else', 'Total']];
    [['Golf season, April to October', ctx.rows.filter(function (r) { return inSeasonKey(r.key); })], ['Winter, November to March', ctx.rows.filter(function (r) { return !inSeasonKey(r.key); })]].forEach(function (g) {
      if (!g[1].length) return;
      const o = { golf: 0, dining: 0, events: 0, other: 0 }; g[1].forEach(function (r) { o.golf += num(r.revenue.golf); o.dining += num(r.revenue.dining); o.events += num(r.revenue.events); o.other += num(r.revenue.dues) + num(r.revenue.proShop) + num(r.revenue.lessons); });
      rows.push([g[0], g[1].map(function (r) { return r.key; }).join('; '), o.golf, o.dining, o.events, o.other, o.golf + o.dining + o.events + o.other]);
    });
    return rows;
  }
  function revenueFacts(ctx) {
    const out = [], fair = fairRows(ctx), t = periodTotals(ctx.rows).revenue;
    if (!t) return out;
    if (fair.length >= 2) {
      const best = fair.reduce(function (b, r) { return r.total > b.total ? r : b; }, fair[0]);
      out.push({ text: (ctx.gran === 'day' ? F.weekday(best.key) + ', ' + F.dateShort(best.key) + ' was the biggest day' : monthLong(best.key).split(' ')[0] + ' was the biggest month') + ': ' + F.money0(best.total) + ' in revenue' + (best.rounds ? ' and ' + F.num(best.rounds) + ' rounds' : '') + '.', where: 'Revenue' });
    }
    const dt = deptTotals(ctx);
    if (dt[0].value) out.push({ text: dt[0].label + ' brings in the most money, ' + dt[0].share + '% of revenue' + (dt[1] && dt[1].value ? ', ahead of ' + dt[1].label.toLowerCase() + ' at ' + dt[1].share + '%' : '') + '.', where: 'Revenue' });
    return out;
  }
  addSection({
    id: 'revenue', label: 'Revenue', order: 20, collections: ['charges', 'sales', 'diningOrders', 'teeTimes', 'diningReservations', 'monthlyMetrics'],
    kpis: revenueKpis, main: revenueMain, panels: revenuePanels,
    about: function (ctx) { return [marksText(ctx), 'Dues are the monthly share of each member\'s annual dues. Golf season and winter split the months in range by calendar month: April to October count as the season.'].concat(ctx.notes); },
    csv: function (ctx) { return [{ id: 'revenue', title: 'Revenue by department', rows: revenueCSV(ctx) }, { id: 'revenue-season', title: 'Golf season and winter', rows: seasonCSV(ctx) }]; },
    facts: revenueFacts, ideas: revenueIdeas,
    data: { deptTotals: deptTotals, periodTotals: periodTotals }
  });

  /* ---------------- Accounts (section) ---------------- */
  function billedIn(from, to) { return sum(all('charges').filter(function (c) { return c.date && c.date >= from && c.date <= to && num(c.amount) > 0 && !c.reversedBy; }), function (c) { return c.amount; }); }
  function collectedIn(from, to) { return sum(all('payments').filter(function (p) { return p.date && p.date >= from && p.date <= to; }), function (p) { return p.amount; }); }
  function accountsKpis(ctx) {
    const d = agingData(ctx), T = D.today(), d30 = D.addDays(T, -30), f = ctx.ix.first;
    /* Outstanding: what members owe moves by every charge (reversals included) less every payment, so the last 30 days
       of both give the change without needing old balances. */
    let owe = null;
    if (f.ch && f.ch <= d30) {
      const ch = sum(all('charges').filter(function (c) { return c.date > d30 && c.date <= T; }), function (c) { return c.amount; });
      const py = sum(all('payments').filter(function (p) { return p.date > d30 && p.date <= T; }), function (p) { return p.amount; });
      owe = kpiChg(ch - py, 'money', '', { upGood: false });
      if (owe) owe.label = (owe.v > 0 ? 'Up ' + chgMag(owe) : owe.v < 0 ? 'Down ' + chgMag(owe) : 'No change') + ' in the last 30 days: ' + F.money0(ch) + ' charged and ' + F.money0(py) + ' paid';
    }
    return [
      { label: 'Outstanding today', value: moneyShort(d.grand), d: esc(d.accounts.length ? d.accounts.length + ' ' + plural(d.accounts.length, 'house account') + ' with a balance' : 'Every house account is settled'), chg: owe, drill: 'aging', aria: 'Outstanding ' + F.money0(d.grand) },
      { label: 'More than 60 days old', value: moneyShort(d.late), d: esc(d.grand ? Math.round(d.late / d.grand * 100) + '% of what is outstanding' : 'Nothing outstanding'), drill: 'aging' },
      { label: 'Billed in period', value: moneyShort(d.billed), d: esc('House charges posted ' + ctx.line), chg: coversPrev(ctx, f.ch) ? pctVs(d.billed, billedIn(ctx.prev.from, ctx.prev.to), ctx) : null, drill: 'aging' },
      { label: 'Collected in period', value: moneyShort(d.collected), d: esc(d.billed ? Math.round(d.collected / d.billed * 100) + '% of what was billed' : 'Payments received'), chg: coversPrev(ctx, f.pay) ? pctVs(d.collected, collectedIn(ctx.prev.from, ctx.prev.to), ctx) : null, drill: 'aging' }
    ];
  }
  function accountsDesc(ctx) {
    const d = agingData(ctx), out = [];
    if (!d.grand) out.push('These columns sort what members owe by the age of the charges behind it.', 'Every house account is settled today, so there is nothing to chase.');
    else {
      out.push('The columns sort the ' + F.money0(d.grand) + ' members owe today by the age of the charges behind it.');
      out.push(F.money0(d.tot[0]) + ' (' + pctOf(d.tot[0], d.grand) + '%) is under 30 days old, which is normal monthly billing.');
      out.push(d.late >= 0.5 ? F.money0(d.late) + ' is past 60 days on ' + d.lateAccounts.length + ' ' + plural(d.lateAccounts.length, 'account') + '; balances this old are the ones that need a call.' : 'Nothing is past 60 days, so collections are in good shape.');
    }
    if (d.billed) out.push('In this period members paid ' + F.money0(d.collected) + ' against ' + F.money0(d.billed) + ' billed, ' + pctOf(d.collected, d.billed) + '%.');
    return sents(out.slice(0, 4));
  }
  /** Members who charged nothing beyond dues in the period, and the house charge category fewest members use. */
  function chargeReach(ctx) {
    return memo(ctx, 'reach', function () {
      const inR = inRange(ctx), active = all('members').filter(function (m) { return m.status === 'active'; }), s = spendData(ctx);
      const spent = {}; s.list.forEach(function (a) { spent[a.id] = 1; });
      const cats = {};
      all('charges').forEach(function (c) {
        if (!c.memberId || !inR(c.date) || c.category === 'Dues' || num(c.amount) <= 0 || c.reversedBy || !c.category || c.category === 'Other') return;
        const x = cats[c.category] = cats[c.category] || { cat: c.category, who: {}, n: 0, total: 0 };
        x.who[c.memberId] = 1; x.n++; x.total += num(c.amount);
      });
      const list = Object.keys(cats).map(function (k) { const x = cats[k]; return { cat: k, members: Object.keys(x.who).length, n: x.n, avg: x.total / x.n }; }).sort(function (a, b) { return a.members - b.members || b.avg - a.avg; });
      return { active: active, none: active.filter(function (m) { return !spent[m.id]; }), cats: list, s: s };
    });
  }
  function accountsIdeas(ctx) {
    const d = agingData(ctx), r = chargeReach(ctx), out = [], f = ctx.ix.first.ch;
    if (d.late >= 0.5) out.push({ title: 'Collect the balances past 60 days', text: d.lateAccounts.length + ' ' + plural(d.lateAccounts.length, 'account owes', 'accounts owe') + ' ' + F.money0(d.late) + ' in charges more than 60 days old' + (d.tot[3] >= 0.5 ? ', ' + F.money0(d.tot[3]) + ' of it past 90 days' : '') + '. A friendly call and a note on the next statement is the quickest way to bring it in.',
      assume: 'Assumes every balance past 60 days is paid. This is money already earned, not new revenue.', amount: d.late, per: 'one time', year: d.late });
    const months = spanDays(f && f > ctx.from ? f : ctx.from, ctx.to) / 30.4375;
    if (r.none.length && r.active.length && months >= 0.2) {
      const spenders = r.active.length - r.none.length, avg = spenders ? r.s.total / spenders / months : 0, extra = 25 * r.none.length;
      out.push({ title: 'Bring non-spending members into the clubhouse', text: r.none.length + ' of ' + r.active.length + ' active members charged nothing beyond dues in this period' + (avg ? ', while those who did averaged ' + F.money0(avg) + ' a month' : '') + '. An invitation to a members\' night or a dining credit with renewal could start a habit; $25 a month from each would add ' + F.money0(extra) + ' a month.',
        assume: 'Assumes $25 a month from each of them for twelve months' + (f && f > ctx.from ? '; house charges on file begin ' + F.dateShort(f) : '') + '.', amount: extra, per: 'a month', year: extra * 12 });
    }
    r.cats.filter(function (c) { return r.active.length && c.members < r.active.length * 0.8; }).slice(0, 2).forEach(function (c) {
      const seasonal = c.cat === 'Golf' || c.cat === 'Lessons' || c.cat === 'Pro Shop', extra = 5 * c.avg;
      const cl = c.cat.toLowerCase(), an = /^[aeiou]/.test(cl) ? 'an ' : 'a ';
      out.push({ title: 'Reach more members with ' + cl, text: 'Only ' + c.members + ' of ' + r.active.length + ' active members had ' + an + cl + ' charge in this period, averaging ' + F.money0(c.avg) + ' a charge. Five more members with one ' + c.cat.toLowerCase() + ' charge a month would add about ' + F.money0(extra) + ' a month.',
        assume: 'Assumes five more members, one charge a month each at the average ' + c.cat.toLowerCase() + ' charge, over ' + (seasonal ? 'the seven golf season months.' : 'twelve months.'), amount: extra, per: 'a month', year: extra * (seasonal ? 7 : 12) });
    });
    return out;
  }
  function accountsMain(ctx) {
    const d = agingData(ctx);
    const take = !d.grand ? 'Every house account is settled.' : F.money0(d.grand) + ' is outstanding across ' + d.accounts.length + ' ' + plural(d.accounts.length, 'account') + '. ' + (d.late >= 0.5 ? F.money0(d.late) + ' (' + Math.round(d.late / d.grand * 100) + '%) is more than 60 days old, on ' + d.lateAccounts.length + ' ' + plural(d.lateAccounts.length, 'account') + '.' : 'Nothing is more than 60 days old.');
    const body = Club.charts.columns({ labels: BUCKETS.map(function (b) { return b.replace(' days', ''); }), tipTitles: BUCKETS, values: d.tot, money: true, tipName: 'Outstanding', height: 220, ariaLabel: 'Receivables by age' });
    return { id: 'aging-chart', title: 'Receivables by age', take: take, body: body, desc: accountsDesc(ctx), foot: 'Ageing is as of today.', csvId: 'aging', drill: 'aging', drillLabel: 'See every account' };
  }
  function accountsPanels(ctx) {
    const d = agingData(ctx);
    const late = d.lateAccounts.slice().sort(function (a, c) { return c.late - a.late; }).slice(0, 5);   /* largest overdue first */
    const p2 = { id: 'late', cls: 'wide', title: 'Oldest balances', take: !d.lateAccounts.length ? 'No balance is more than 60 days old.' : d.lateAccounts.length + ' ' + plural(d.lateAccounts.length, 'account has', 'accounts have') + ' charges more than 60 days old, ' + F.money0(d.late) + ' in all.',
      body: late.length ? Club.charts.ranked(late.map(function (a) { return { label: Club.members.name(a.m), sub: (a.b[3] >= 0.5 ? F.money0(a.b[3]) + ' over 90 days' : F.money0(a.b[2]) + ' at 61 to 90 days'), value: a.late, attrs: 'data-href="billing/' + esc(a.m.id) + '" aria-label="' + esc(Club.members.name(a.m) + ' ' + F.money0(a.late) + ' overdue. Open their account') + '"' }; }), { fmt: F.money0, noShare: true }) : '<p class="rp-empty">Nothing is overdue.</p>',
      desc: lateDesc(ctx), csvId: 'aging', drill: 'aging', drillLabel: 'See every account' };
    return [p2];   /* spend by member moved to the Client spending section (reports-clients.js) */
  }
  function spendDesc(ctx) {
    const s = spendData(ctx), r = chargeReach(ctx);
    if (!s.list.length) return sents(['This list ranks members by house charges other than dues.', 'None were posted in this period, so choose a longer one.']);
    const top = sum(s.list.slice(0, 5), function (a) { return a.total; }), cats = {};
    s.list.forEach(function (a) { Object.keys(a.cats).forEach(function (k) { cats[k] = (cats[k] || 0) + a.cats[k]; }); });
    const big = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];
    return sents(['Each row is one member\'s house charges in this period, dues left out.',
      'The top five spent ' + F.money0(top) + ' together, ' + pctOf(top, s.total) + '% of the ' + F.money0(s.total) + ' charged by ' + s.list.length + ' ' + plural(s.list.length, 'member') + '.',
      big ? 'Most member spending went to ' + big.toLowerCase() + ', ' + pctOf(cats[big], s.total) + '%.' : '',
      r.none.length ? r.none.length + ' active ' + plural(r.none.length, 'member') + ' charged nothing beyond dues, which is room to grow.' : 'Every active member charged something beyond dues.']);
  }
  function lateDesc(ctx) {
    const d = agingData(ctx), l = d.lateAccounts.slice().sort(function (a, c) { return c.late - a.late; });
    if (!l.length) return sents(['This list shows accounts with charges more than 60 days old.', 'There are none today, so no follow-up is needed.']);
    const n90 = l.filter(function (a) { return a.b[3] >= 0.5; }).length;
    return sents(['Each row is an account with charges more than 60 days old, largest first.', 'The largest is ' + Club.members.name(l[0].m) + ', with ' + F.money0(l[0].late) + ' more than 60 days old.',
      n90 ? n90 + ' of the ' + l.length + ' also ' + (n90 === 1 ? 'has' : 'have') + ' charges past 90 days.' : '', 'A friendly call before the next statement run is the quickest way to bring these in.']);
  }
  function drillAging(ctx) {
    const d = agingData(ctx);
    let html = rKpis([
      { label: 'Outstanding', value: F.money0(d.grand), sub: esc(d.accounts.length + ' ' + plural(d.accounts.length, 'account')) },
      { label: 'Over 60 days', value: F.money0(d.late), sub: esc(d.grand ? Math.round(d.late / d.grand * 100) + '% of outstanding' : '') },
      { label: 'Billed in period', value: F.money0(d.billed), sub: esc(ctx.line) },
      { label: 'Collected', value: F.money0(d.collected), sub: esc(d.billed ? Math.round(d.collected / d.billed * 100) + '% of billed' : '') }
    ]);
    html += rSec('By age', 'As of today', rTable([{ label: 'Age' }, { label: 'Share' }, { label: 'Amount', num: true }], BUCKETS.map(function (b, i) { const sh = d.grand ? Math.round(d.tot[i] / d.grand * 100) : 0; return ['<span class="primary-cell">' + esc(b) + '</span>', '<span class="rd-fill"><span class="bar"><span style="width:' + sh + '%"></span></span>' + sh + '%</span>', esc(F.money0(d.tot[i]))]; })));
    html += rSec('Every account', d.accounts.length + ' with a balance', d.accounts.length ? rTable([{ label: 'Member' }, { label: 'Current', num: true }, { label: '31 to 60', num: true }, { label: '61 to 90', num: true }, { label: '90+', num: true }, { label: 'Balance', num: true }],
      d.accounts.map(function (a) { return ['<a class="primary-cell" href="#/billing/' + esc(a.m.id) + '">' + esc(Club.members.name(a.m)) + '</a>'].concat(a.b.map(function (v, i) { return v >= 0.5 ? (i >= 2 ? '<span class="rd-late">' + esc(F.money0(v)) + '</span>' : esc(F.money0(v))) : '<span class="muted">-</span>'; })).concat(['<strong>' + esc(F.money0(a.total)) + '</strong>']); }),
      ['Total'].concat(d.tot.map(function (v) { return esc(F.money0(v)); })).concat([esc(F.money0(d.grand))])) : rNote('Every house account is settled.'));
    return { title: 'Receivables', body: html, csv: agingCSV(ctx), go: 'billing', goLabel: 'Open billing', noNotes: true };
  }
  function drillSpend(ctx) {
    const s = spendData(ctx);
    let html = rKpis([
      { label: 'Members with charges', value: F.num(s.list.length), sub: esc('Dues excluded') },
      { label: 'Charged in all', value: F.money0(s.total), sub: esc(ctx.line) },
      { label: 'Average', value: F.money0(s.list.length ? s.total / s.list.length : 0), sub: esc('Per member with charges') },
      { label: 'Top spender', value: s.list.length ? F.money0(s.list[0].total) : 'None', sub: esc(s.list.length && s.list[0].m ? Club.members.name(s.list[0].m) : '') }
    ]);
    html += rSec('Everyone', '', s.list.length ? rTable([{ label: 'Rank', num: true }, { label: 'Member' }, { label: 'Mostly' }, { label: 'Spend', num: true }],
      s.list.map(function (a, i) { return [String(i + 1), memberLink(a.m), esc(a.top), '<strong>' + esc(F.money0(a.total)) + '</strong>']; })) : rNote('No house charges other than dues were posted in this period.'));
    return { title: 'Members by spend', body: html, csv: spendCSV(ctx), go: 'billing', goLabel: 'Open billing', noNotes: true };
  }
  addSection({
    id: 'accounts', label: 'Unpaid accounts', order: 70, collections: ['charges', 'payments', 'statements', 'members'],
    kpis: accountsKpis, main: accountsMain, panels: accountsPanels,
    about: function (ctx) { return ['Ageing is as of today, from each member\'s balance matched against their most recent charges; billed and collected cover the selected period.', coverageText(ctx.ix.first.ch, ctx, 'House account')].filter(Boolean); },
    csv: function (ctx) { return [{ id: 'aging', title: 'Receivables aging', rows: agingCSV(ctx) }]; },
    drills: { aging: drillAging, spend: drillSpend }, ideas: accountsIdeas,
    attention: function (ctx) { const d = agingData(ctx); return d.lateAccounts.length ? [{ n: d.lateAccounts.length, text: plural(d.lateAccounts.length, 'house account has', 'house accounts have') + ' balances more than 60 days old, ' + F.money0(d.late) + ' in all', label: 'See accounts', drill: 'aging', sec: 'accounts' }] : []; },
    data: { aging: agingData, spend: spendData }
  });

  /* ---------------- Drill-down drawers (shared by every section) ---------------- */
  function rSec(title, aside, inner) {
    return '<section class="rd-sec" data-reveal><div class="rd-sec-head"><h4>' + esc(title) + '</h4>' + (aside ? '<span class="rd-aside">' + aside + '</span>' : '') + '</div>' + inner + '</section>';
  }
  function rKpis(items) {
    return '<div class="rd-kpis" data-reveal>' + items.map(function (k) {
      return '<div><span class="label-caps">' + esc(k.label) + '</span><strong>' + esc(k.value) + '</strong>' + (k.sub ? '<span class="rd-kpi-sub">' + k.sub + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function rTable(cols, rows, foot) {
    return '<div class="table-wrap"><table class="table rd-table"><thead><tr>' + cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (cell, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + cell + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' +
      (foot ? '<tfoot><tr>' + foot.map(function (c, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table></div>';
  }
  function prevOK(ctx, k) { return !!(ctx.prev && ctx.prev.ok[k]); }
  function rDelta(cur, prev, ctx, k) {
    if (!prevOK(ctx, k)) return '<span class="muted">No earlier period on file to compare</span>';
    if (!prev) return '<span class="muted">Nothing recorded in the previous period</span>';
    const d = pctChange(cur, prev);
    return '<span class="delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%</span> <span class="muted">vs previous period</span>';
  }
  function chg(cur, prev, ctx, k) {
    if (!prevOK(ctx, k) || !prev) return '<span class="muted">-</span>';
    const d = pctChange(cur, prev);
    return '<span class="rd-chg ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '%</span>';
  }
  function rNote(text) { return '<p class="rd-note">' + esc(text) + '</p>'; }
  function notesHTML(ctx) { return ctx.notes.length ? '<div class="rd-notes" data-reveal>' + ctx.notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</div>' : ''; }
  /** Best and worst unit by a value function. */
  function extremes(ctx, fn, fmt) {
    const fair = fairRows(ctx);
    if (fair.length < 2) return rNote('Best and worst ' + unitWord(ctx) + 's need at least two complete ' + unitWord(ctx) + 's in the period.');
    let b = fair[0], w = fair[0];
    fair.forEach(function (r) { if (fn(r) > fn(b)) b = r; if (fn(r) < fn(w)) w = r; });
    const avg = sum(fair, fn) / fair.length;
    return '<div class="rd-ext"><div class="rd-ext-best"><span class="label-caps">Best ' + unitWord(ctx) + '</span><strong>' + esc(b.long || b.label) + '</strong><span>' + esc(fmt(fn(b))) + ' <span class="muted">' + esc(Math.round((fn(b) - avg) / (avg || 1) * 100) + '% above average') + '</span></span></div>' +
      '<div><span class="label-caps">Quietest ' + unitWord(ctx) + '</span><strong>' + esc(w.long || w.label) + '</strong><span>' + esc(fmt(fn(w))) + ' <span class="muted">' + esc(Math.round((avg - fn(w)) / (avg || 1) * 100) + '% below average') + '</span></span></div>' +
      '<div><span class="label-caps">Average ' + unitWord(ctx) + '</span><strong>' + esc(fmt(avg)) + '</strong><span class="muted">' + esc('Across ' + fair.length + ' complete ' + unitWord(ctx) + 's') + '</span></div></div>';
  }
  /** Trend line with the previous period overlaid when it has the same number of points. */
  function trend(ctx, name, fn, money, k) {
    const series = [{ name: name, values: ctx.rows.map(fn), color: 'var(--viz-1)' }];
    if (prevOK(ctx, k) && ctx.prev.rows.length === ctx.rows.length && ctx.rows.length > 1) series.push({ name: 'Previous period', values: ctx.prev.rows.map(fn), color: 'var(--viz-context)' });
    return ctx.rows.length > 1 ? Club.charts.line({ labels: ctx.rows.map(axisLabel), series: series, money: !!money, height: px(200) }) :
      Club.charts.bar({ labels: [ctx.rows[0].label].concat(prevOK(ctx, k) ? ['Previous period'] : []), series: [{ name: name, values: [fn(ctx.rows[0])].concat(prevOK(ctx, k) ? [sum(ctx.prev.rows, fn)] : []), color: 'var(--viz-1)' }], money: !!money, height: px(180) });
  }
  function perUnitTable(ctx, cols, cellsFor, foot) {
    const rows = ctx.rows.slice().reverse();
    return rTable([{ label: ctx.gran === 'day' ? 'Date' : 'Month' }].concat(cols), rows.map(function (r) { return ['<span class="primary-cell">' + esc(chartLabel(r)) + '</span>'].concat(cellsFor(r)); }), foot);
  }

  function drillRevenue(ctx) {
    const t = periodTotals(ctx.rows).revenue, p = ctx.prev ? periodTotals(ctx.prev.rows).revenue : 0;
    const members = ctx.rows.length ? ctx.rows[ctx.rows.length - 1].members : 0;
    let html = rKpis([
      { label: 'Revenue', value: F.money0(t), sub: rDelta(t, p, ctx, 'revenue') },
      { label: 'Per ' + unitWord(ctx), value: F.money0(per(ctx, t)), sub: esc('Average across ' + ctx.days + ' ' + plural(ctx.days, 'day')) },
      { label: 'Previous period', value: prevOK(ctx, 'revenue') ? F.money0(p) : 'Not on file', sub: esc(prevOK(ctx, 'revenue') ? ctx.prev.label : 'Earlier records are not complete') },
      { label: 'Per member', value: F.money0(members ? t / members : 0), sub: esc(members + ' members on the roll') }
    ]);
    html += rSec('Trend', esc('Total revenue per ' + unitWord(ctx)), trend(ctx, 'Revenue', function (r) { return r.total; }, true, 'revenue'));
    const dept = DEPTS.map(function (d) { return { d: d, v: sum(ctx.rows, function (r) { return r.revenue[d.key]; }), pv: ctx.prev ? sum(ctx.prev.rows, function (r) { return r.revenue[d.key]; }) : 0 }; }).sort(function (a, b) { return b.v - a.v; });
    html += rSec('By department', '', rTable([{ label: 'Department' }, { label: 'Share' }, { label: 'Per ' + unitWord(ctx), num: true }, { label: 'Change', num: true }, { label: 'Total', num: true }],
      dept.map(function (x) {
        const sh = t ? Math.round(x.v / t * 100) : 0;
        return ['<span class="primary-cell">' + esc(x.d.label) + '</span>', '<span class="rd-fill"><span class="bar"><span style="width:' + Math.max(0, Math.min(100, sh)) + '%"></span></span>' + sh + '%</span>', esc(F.money0(per(ctx, x.v))), chg(x.v, x.pv, ctx, 'revenue'), '<strong>' + esc(F.money0(x.v)) + '</strong>'];
      }), ['Total', '', esc(F.money0(per(ctx, t))), chg(t, p, ctx, 'revenue'), esc(F.money0(t))]));
    html += rSec('Best and worst', '', extremes(ctx, function (r) { return r.total; }, F.money0));
    html += rSec('Per ' + unitWord(ctx), '', perUnitTable(ctx, [{ label: 'Golf', num: true }, { label: 'Dining', num: true }, { label: 'Total', num: true }],
      function (r) { return [esc(F.money0(r.revenue.golf)), esc(F.money0(r.revenue.dining)), '<strong>' + esc(F.money0(r.total)) + '</strong>']; }));
    const csv = [[ctx.gran === 'day' ? 'Date' : 'Month'].concat(DEPTS.map(function (d) { return d.label; })).concat(['Total'])].concat(ctx.rows.map(function (r) { return [csvKey(r)].concat(DEPTS.map(function (d) { return num(r.revenue[d.key]); })).concat([r.total]); }));
    return { title: 'Revenue', body: html, csv: csv, go: 'billing', goLabel: 'Open billing' };
  }

  function drillRounds(ctx) {
    const t = periodTotals(ctx.rows).rounds, p = ctx.prev ? periodTotals(ctx.prev.rows).rounds : 0;
    const g = sum(ctx.rows, function (r) { return r.guestRounds; });
    const members = ctx.rows.length ? ctx.rows[ctx.rows.length - 1].members : 0;
    let html = rKpis([
      { label: 'Rounds', value: F.num(t), sub: rDelta(t, p, ctx, 'rounds') },
      { label: 'Per ' + unitWord(ctx), value: F.num(Math.round(per(ctx, t))), sub: esc(prevOK(ctx, 'rounds') ? F.num(Math.round(per(ctx, p))) + ' the period before' : 'Average') },
      { label: 'Guest share', value: (t ? Math.round(g / t * 100) : 0) + '%', sub: esc(F.num(g) + ' guest rounds') },
      { label: 'Per member', value: members ? (Math.max(0, t - g) / members).toFixed(1) : '0', sub: esc('Member rounds per member') }
    ]);
    html += rSec('Member and guest rounds', '', Club.charts.bar({ labels: ctx.rows.map(axisLabel), series: [{ name: 'Members', values: ctx.rows.map(function (r) { return Math.max(0, num(r.rounds) - num(r.guestRounds)); }), color: 'var(--viz-1)' }, { name: 'Guests', values: ctx.rows.map(function (r) { return num(r.guestRounds); }), color: 'var(--viz-2)' }], stacked: true, height: px(200) }));
    // How rounds were played, from the tee sheet records on file in the period.
    const tees = []; Object.keys(ctx.ix.tee).forEach(function (d) { if (d >= ctx.from && d <= ctx.to) ctx.ix.tee[d].forEach(function (x) { tees.push(x); }); });
    if (tees.length) {
      let p18 = 0, p9 = 0, cart = 0, walk = 0;
      tees.forEach(function (x) { (x.players || []).forEach(function (pl) { if (+x.holes === 9) p9++; else p18++; if (pl && pl.cart) cart++; else walk++; }); });
      const n = p18 + p9;
      html += rSec('How they played', esc('From ' + F.num(tees.length) + ' tee times on file'), Club.charts.ranked([{ label: '18 holes', value: p18 }, { label: '9 holes', value: p9 }, { label: 'Riding a cart', value: cart }, { label: 'Walking', value: walk }], { total: n }) + (ctx.ix.first.tee > ctx.from ? rNote('Tee sheet detail begins ' + F.dateShort(ctx.ix.first.tee) + '; earlier rounds are counted from monthly history only.') : ''));
    } else html += rSec('How they played', '', rNote('Round length and cart use come from the tee sheet, which holds no records for this period.'));
    html += rSec('Best and worst', '', extremes(ctx, function (r) { return num(r.rounds); }, function (v) { return F.num(Math.round(v)) + ' rounds'; }));
    html += rSec('Per ' + unitWord(ctx), '', perUnitTable(ctx, [{ label: 'Members', num: true }, { label: 'Guests', num: true }, { label: 'Total', num: true }],
      function (r) { return [F.num(Math.max(0, num(r.rounds) - num(r.guestRounds))), F.num(r.guestRounds), '<strong>' + F.num(r.rounds) + '</strong>']; }));
    const csv = [[ctx.gran === 'day' ? 'Date' : 'Month', 'Member rounds', 'Guest rounds', 'Total']].concat(ctx.rows.map(function (r) { return [csvKey(r), Math.max(0, num(r.rounds) - num(r.guestRounds)), num(r.guestRounds), num(r.rounds)]; }));
    return { title: 'Rounds played', body: html, csv: csv, go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  function drillCovers(ctx) {
    const t = periodTotals(ctx.rows).covers, p = ctx.prev ? periodTotals(ctx.prev.rows).covers : 0;
    const dRev = sum(ctx.rows, function (r) { return r.revenue.dining; });
    let html = rKpis([
      { label: 'Guests', value: F.num(t), sub: rDelta(t, p, ctx, 'covers') },
      { label: 'Per ' + unitWord(ctx), value: F.num(Math.round(per(ctx, t))), sub: esc('Average') },
      { label: 'Average check', value: F.money(t ? dRev / t : 0), sub: esc('Dining revenue per cover') },
      { label: 'F&B revenue', value: F.money0(dRev), sub: rDelta(dRev, ctx.prev ? sum(ctx.prev.rows, function (r) { return r.revenue.dining; }) : 0, ctx, 'dining') }
    ]);
    html += rSec('Dining room guests per ' + unitWord(ctx), '', trend(ctx, 'Guests', function (r) { return num(r.covers); }, false, 'covers'));
    const res = []; Object.keys(ctx.ix.res).forEach(function (d) { if (d >= ctx.from && d <= ctx.to) ctx.ix.res[d].forEach(function (x) { res.push(x); }); });
    if (res.length) {
      const venues = {}, svc = { Breakfast: 0, Lunch: 0, Dinner: 0 };
      res.forEach(function (r) { const v = r.venue || 'Other'; venues[v] = (venues[v] || 0) + num(r.partySize); const m = toMin(r.time); svc[m < 660 ? 'Breakfast' : m < 990 ? 'Lunch' : 'Dinner'] += num(r.partySize); });
      html += '<div class="rd-two" data-reveal>' +
        rSec('By venue', esc(F.num(res.length) + ' reservations on file'), Club.charts.ranked(Object.keys(venues).sort(function (a, b) { return venues[b] - venues[a]; }).map(function (v) { return { label: v, value: venues[v] }; }))) +
        rSec('By service', '', Club.charts.ranked(Object.keys(svc).filter(function (k) { return svc[k]; }).map(function (k) { return { label: k, value: svc[k] }; }))) + '</div>' +
        (ctx.ix.first.res > ctx.from ? rNote('Reservation detail begins ' + F.dateShort(ctx.ix.first.res) + ', so venue and service cover only those days.') : '');
    } else html += rSec('By venue and service', '', rNote('Venue and service detail comes from dining reservations, which hold no records for this period.'));
    html += rSec('Best and worst', '', extremes(ctx, function (r) { return num(r.covers); }, function (v) { return F.num(Math.round(v)) + ' covers'; }));
    html += rSec('Per ' + unitWord(ctx), '', perUnitTable(ctx, [{ label: 'Guests', num: true }, { label: 'Revenue', num: true }, { label: 'Avg check', num: true }],
      function (r) { return [F.num(r.covers), esc(F.money0(r.revenue.dining)), esc(r.covers ? F.money(r.revenue.dining / r.covers) : '-')]; }));
    const csv = [[ctx.gran === 'day' ? 'Date' : 'Month', 'Dining room guests', 'Dining revenue', 'Average check']].concat(ctx.rows.map(function (r) { return [csvKey(r), num(r.covers), num(r.revenue.dining), r.covers ? (num(r.revenue.dining) / r.covers).toFixed(2) : '0.00']; }));
    return { title: 'Dining room', body: html, csv: csv, go: 'dining', goLabel: 'Open dining' };
  }

  function drillMembers(ctx) {
    const tiers = all('membershipTiers');
    const ms = all('members').filter(function (m) { return m.status !== 'resigned'; });
    const inR = inRange(ctx);
    const joined = all('members').filter(function (m) { return inR(String(m.memberSince || '').slice(0, 10)); }).sort(function (a, b) { return String(b.memberSince).localeCompare(String(a.memberSince)); });
    const first = ctx.rows[0], last = ctx.rows[ctx.rows.length - 1];
    const change = ctx.gran === 'month' && first && last ? last.members - first.members : null;
    const monthlyDues = sum(ms.filter(function (m) { return m.status === 'active'; }), function (m) { const t = tiers.filter(function (x) { return x.id === m.tierId; })[0]; return t ? num(t.annualDues) / 12 : 0; });
    let html = rKpis([
      { label: 'Members', value: F.num(ms.length), sub: esc('On the roll today') },
      { label: 'Change', value: change == null ? 'n/a' : (change >= 0 ? '+' : '') + change, sub: esc(change == null ? 'Roll history is kept monthly' : 'Since ' + monthLabel(first.key, true)) },
      { label: 'Joined', value: F.num(joined.length), sub: esc('In this period') },
      { label: 'Dues each month', value: F.money0(monthlyDues), sub: esc('From active members') }
    ]);
    html += rSec('Roll over time', '', ctx.gran === 'month' && ctx.rows.length > 1 ? Club.charts.line({ labels: ctx.rows.map(axisLabel), series: [{ name: 'Members', values: ctx.rows.map(function (r) { return num(r.members); }), color: 'var(--viz-1)' }], height: px(180) }) :
      rNote('The membership roll is recorded once a month, so a ' + (ctx.gran === 'day' ? 'daily' : 'single month') + ' trend is not available for this period. Choose three months or more to see it.'));
    const rows = tiers.map(function (t) { const n = ms.filter(function (m) { return m.tierId === t.id; }); return { t: t, n: n.length, active: n.filter(function (m) { return m.status === 'active'; }).length, j: joined.filter(function (m) { return m.tierId === t.id; }).length }; }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    html += rSec('By tier', '', rows.length ? rTable([{ label: 'Tier' }, { label: 'Share' }, { label: 'Members', num: true }, { label: 'Joined', num: true }, { label: 'Monthly dues', num: true }],
      rows.map(function (r) { const sh = ms.length ? Math.round(r.n / ms.length * 100) : 0; return ['<span class="primary-cell">' + esc(r.t.name) + '</span>', '<span class="rd-fill"><span class="bar"><span style="width:' + sh + '%"></span></span>' + sh + '%</span>', r.n, r.j, esc(F.money0(r.active * num(r.t.annualDues) / 12))]; }),
      ['Total', '', ms.length, joined.length, esc(F.money0(monthlyDues))]) : rNote('No tiers on file.'));
    const st = {}; ms.forEach(function (m) { st[m.status] = (st[m.status] || 0) + 1; });
    html += rSec('Standing', '', '<div class="rd-badges">' + ['active', 'leave', 'suspended'].map(function (s) { return U.badge((s === 'leave' ? 'On leave' : s.charAt(0).toUpperCase() + s.slice(1)) + ' ' + (st[s] || 0), s === 'active' ? 'good' : s === 'leave' ? 'info' : 'warn'); }).join('') + '</div>');
    html += rSec('New members', esc(joined.length ? joined.length + ' in period' : ''), joined.length ? rTable([{ label: 'Member' }, { label: 'Tier' }, { label: 'Joined', num: true }],
      joined.slice(0, 10).map(function (m) { const t = Club.members.tier(m); return ['<a class="primary-cell" href="#/members/' + esc(m.id) + '">' + esc(Club.members.name(m)) + '</a>', esc(t ? t.name : 'Unassigned'), esc(F.date(String(m.memberSince).slice(0, 10)))]; }))
      : rNote('No members joined in this period.'));
    const csv = [['Tier', 'Members', 'Joined in period', 'Monthly dues']].concat(rows.map(function (r) { return [r.t.name, r.n, r.j, (r.active * num(r.t.annualDues) / 12).toFixed(2)]; }))
      .concat(ctx.gran === 'month' ? [[], ['Month', 'Members']].concat(ctx.rows.map(function (r) { return [csvKey(r), r.members]; })) : []);
    return { title: 'Members', body: html, csv: csv, go: 'members', goLabel: 'Open members', noNotes: true };
  }


  const CORE_DRILLS = { revenue: drillRevenue, rounds: drillRounds, covers: drillCovers, members: drillMembers };

  /* ---------------- Page ---------------- */
  const MORE_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>';
  let menuN = 0;
  function moreMenu(title, items) {
    if (!items.length) return '';
    const id = 'rp-menu-' + (++menuN);
    return '<div class="rp-more-wrap"><button type="button" class="rp-more" aria-haspopup="true" aria-expanded="false" aria-controls="' + id + '" aria-label="' + esc('More options for ' + title) + '">' + MORE_ICON + '</button>' +
      '<ul class="rp-menu" id="' + id + '" role="menu" hidden>' + items.map(function (it) {
        return '<li role="menuitem" tabindex="-1" class="rp-mi"' + (it.csv ? ' data-mi-csv="' + esc(it.csv) + '"' : '') + (it.drill ? ' data-mi-drill="' + esc(it.drill) + '"' + (it.arg != null ? ' data-arg="' + esc(it.arg) + '"' : '') : '') + '>' + esc(it.label) + '</li>';
      }).join('') + '</ul></div>';
  }
  function menuItems(spec) {
    const items = [];
    if (spec.csvId) items.push({ label: 'Export CSV', csv: spec.csvId });
    if (spec.drill) items.push({ label: spec.drillLabel || 'See all', drill: spec.drill, arg: spec.drillArg });
    (spec.more || []).forEach(function (m) { items.push(m); });
    return items;
  }
  function kpiHTML(list, secId) {
    if (!list || !list.length) return '';
    return '<div class="rp-kpis" style="--n:' + list.length + '" data-reveal>' + list.map(function (k) {
      const act = k.go ? ' data-go="' + esc(k.go) + '"' : k.drill ? ' data-drill="' + esc(k.drill) + '" data-sec="' + esc(k.sec || secId) + '"' : '';
      const aria = k.aria || (k.label + ' ' + String(k.value).replace(/<[^>]+>/g, ''));
      const c = k.chg, cl = c ? chgLabel(c) : '';
      return '<div class="rp-kpi"><div class="l">' + esc(k.label) + '</div>' +
        (k.href ? '<a class="v" href="' + esc(k.href) + '" aria-label="' + esc(aria + '. Open the page') + '">' + esc(k.value) + '</a>' :
          act ? '<button type="button" class="v"' + act + ' aria-label="' + esc(aria + (k.go ? '. Go to that section' : '. View details')) + '">' + esc(k.value) + '</button>' : '<div class="v">' + esc(k.value) + '</div>') +
        '<div class="d">' + (k.d || '') + '</div>' +
        (c ? '<span class="rp-chg ' + chgClass(c) + '" role="img" title="' + esc(cl) + '" aria-label="' + esc(cl) + '">' + esc(chgText(c)) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function panelHTML(p, wide) {
    return '<div class="rp-panel' + (wide ? ' wide' : '') + (p.cls ? ' ' + esc(p.cls) : '') + '" data-panel="' + esc(p.id) + '" data-reveal>' +
      '<div class="rp-ph"><div class="rp-pt"><h2>' + esc(p.title) + '</h2>' + (p.take ? '<p class="rp-take">' + esc(p.take) + '</p>' : '') + '</div>' + moreMenu(p.title, menuItems(p)) + '</div>' +
      (p.chips ? '<div class="rp-chips" role="group" aria-label="' + esc('Show') + '">' + p.chips.map(function (c) { return '<button type="button" class="rp-chip" data-chip="' + esc(c.id) + '" aria-pressed="' + (c.id === p.chip) + '">' + esc(c.label) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="rp-pb">' + (p.body || '') + '</div>' +
      (p.desc ? '<p class="rp-desc">' + esc(p.desc) + '</p>' : '') +
      ((p.foot || p.drill) ? '<div class="rp-pf"><span class="rp-foot">' + (p.foot || '') + '</span>' + (p.drill ? '<button type="button" class="rp-link" data-drill="' + esc(p.drill) + '"' + (p.drillArg != null ? ' data-arg="' + esc(p.drillArg) + '"' : '') + '>' + esc(p.drillLabel || 'See all') + '</button>' : '') + '</div>' : '') +
      '</div>';
  }
  function aboutHTML(list) {
    const notes = (list || []).filter(Boolean);
    if (!notes.length) return '';
    return '<details class="rp-about"><summary>About these numbers</summary>' + notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</details>';
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { console.error(e); return typeof fallback === 'function' ? fallback(e) : fallback; } }

  /* ---------------- Ideas to grow revenue ----------------
     A section's ideas(ctx) returns [{ title, text, assume, amount, per, year }]. text carries the figure the idea rests
     on and the estimate in words; amount and per are the estimate shown beside it ("+$450", "a week"); year is the same
     estimate over twelve months, used only to rank (ideas without an estimate come last); assume states the assumption.
     Every figure comes from the club's own records. The Overview's "Top opportunities" ranks every section's together.
     Optional: drill (with drillArg, drillLabel) names one of the section's drills, the list of people behind the idea;
     id names the idea for good. Each idea gets a stable key, "<section>:<id or the title in lower case, digits dropped>",
     so the Growth plan (reports-plan.js) can keep an idea marked while its figures change. Two ideas of one section
     that would share a key get "-2", "-3" in the order the section lists them. */
  const IDEAS_MAX = 5;
  function rankIdeas(list) { return list.slice().sort(function (a, b) { return (b.year > 0 ? b.year : -1) - (a.year > 0 ? a.year : -1); }); }
  function ideaSlug(v) { return String(v || '').toLowerCase().replace(/\d+/g, '').replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, ''); }
  function ideasOf(ctx, sec) {
    if (!sec || !sec.ideas) return [];
    return memo(ctx, 'ideas-' + sec.id, function () {
      const list = safe(function () { return sec.ideas(ctx) || []; }, []), used = {};
      return rankIdeas(list.filter(function (x) { return x && x.title && x.text; }).map(function (x) {
        if (x.key) return Object.assign({ sec: sec.id, where: sec.label }, x);   /* already keyed by its own section (the Overview passes them on) */
        const base = sec.id + ':' + (ideaSlug(x.id || x.title) || 'idea'), n = used[base] = (used[base] || 0) + 1;
        return Object.assign({ sec: sec.id, where: sec.label }, x, { key: n > 1 ? base + '-' + n : base });
      }));
    });
  }
  /** Every section's ideas in one list, ranked by estimated effect over a year (the Overview and the Growth plan). */
  function allIdeas(ctx) {
    let list = [];
    SECTIONS.forEach(function (s) { if (s.id !== 'overview' && s.ideas) list = list.concat(ideasOf(ctx, s)); });
    return rankIdeas(list);
  }
  function ideaEst(x) { return x.amount >= 1 ? '+' + (x.amount >= 1e4 ? moneyShort(x.amount) : F.money0(x.amount)) : ''; }
  function ideasBody(list, links) {
    if (!list.length) return '<p class="rp-empty">There is not enough on file in this period for a suggestion with a figure behind it. Choose a longer period.</p>';
    return '<ol class="ideas">' + list.map(function (x) {
      const est = ideaEst(x);
      return '<li><div class="idea-main"><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p>' + (x.assume ? '<p class="idea-why">' + esc(x.assume) + '</p>' : '') +
        (x.drill ? '<button type="button" class="rp-link" data-drill="' + esc(x.drill) + '" data-sec="' + esc(x.sec) + '"' + (x.drillArg != null ? ' data-arg="' + esc(x.drillArg) + '"' : '') + ' aria-haspopup="dialog">' + esc(x.drillLabel || 'See the list') + '</button>' : '') +
        (links ? '<button type="button" class="rp-link" data-go="' + esc(x.sec) + '" data-go-panel="' + esc(x.sec + '-ideas') + '">' + esc('More ideas in ' + x.where) + '</button>' : '') + '</div>' +
        '<div class="idea-est">' + (est ? '<b>' + esc(est) + '</b><span>' + esc(x.per || '') + '</span>' : '<span>No estimate</span>') + '</div></li>';
    }).join('') + '</ol>';
  }
  /* A section with ideasMore: true gets a "Show all" control under its top five (the Client spending section has thirteen). */
  const ideasOpen = {};
  function ideasShown(ctx, sec) { const list = ideasOf(ctx, sec); return sec.ideasMore && ideasOpen[sec.id] ? list : list.slice(0, IDEAS_MAX); }
  function ideasCSV(ctx, sec) {
    const list = sec.id === 'overview' ? ideasShown(ctx, sec) : ideasOf(ctx, sec);
    return [['Rank', 'Idea', 'Section', 'Details', 'Estimate', 'Per', 'Over a year', 'Assumption']].concat(list.map(function (x, i) {
      return [i + 1, x.title, x.where, x.text, x.amount >= 1 ? Math.round(x.amount) : '', x.amount >= 1 ? x.per || '' : '', x.year > 0 ? Math.round(x.year) : '', x.assume || ''];
    }));
  }
  function ideasPanel(sec, ctx) {
    const list = ideasShown(ctx, sec);
    return { id: sec.id + '-ideas', cls: 'rp-ideas', title: sec.ideasTitle || 'Ideas to grow revenue',
      take: sec.ideasTake || (!list.length ? '' : 'Ranked by estimated effect over a year. Each idea rests on a figure from the club\'s own records and says what it assumes.' +
        (list.length < 3 ? ' Only ' + list.length + ' ' + plural(list.length, 'idea has', 'ideas have') + ' enough data behind ' + (list.length === 1 ? 'it' : 'them') + ' in this period; a longer period gives more.' : '')),
      body: ideasBody(list, !!sec.ideasLinks) + (sec.ideasMore && ideasOf(ctx, sec).length > IDEAS_MAX ? '<div class="ideas-more"><button type="button" class="rp-link" data-ideas-all="' + esc(sec.id) + '" aria-expanded="' + !!ideasOpen[sec.id] + '">' + (ideasOpen[sec.id] ? 'Show the top ' + IDEAS_MAX : 'Show all ' + ideasOf(ctx, sec).length + ' ideas') + '</button></div>' : ''),
      csvId: sec.id + '-ideas' };
  }
  function sectionHTML(sec, ctx, state, active) {
    const st = state[sec.id] = state[sec.id] || {};
    const kpis = safe(function () { return sec.kpis ? sec.kpis(ctx) : []; }, []);
    const main = safe(function () { return sec.main ? sec.main(ctx, st) : null; }, function (e) { return { id: sec.id + '-main', title: 'This chart could not load', take: e.message, body: '' }; });
    const panels = safe(function () { return sec.panels ? sec.panels(ctx) : []; }, function (e) { return [{ id: sec.id + '-panels', title: 'These panels could not load', take: e.message, body: '' }]; });
    const about = safe(function () { return sec.about ? sec.about(ctx) : []; }, []);
    const ideas = sec.ideas ? safe(function () { return panelHTML(ideasPanel(sec, ctx), true); }, '') : '';
    return '<section class="rp-sec" id="rp-sec-' + esc(sec.id) + '" role="tabpanel" aria-labelledby="rp-tab-' + esc(sec.id) + '" data-sec="' + esc(sec.id) + '"' + (active ? '' : ' hidden') + '>' +
      '<h2 class="rp-print-title">' + esc(sec.label) + '</h2>' + kpiHTML(kpis, sec.id) +
      '<div class="rp-grid">' + (sec.ideasFirst ? ideas : '') + (main ? panelHTML(main, true) : '') + panels.map(function (p) { return panelHTML(p, false); }).join('') + (sec.ideasFirst ? '' : ideas) + '</div>' + aboutHTML(about) + '</section>';
  }

  function optionRange(v) {
    if (v === 'custom') return sel.kind === 'custom' ? rangeLine(sel.from, sel.to, 'day') : 'Choose exact dates';
    const r = rangeOf({ kind: v });
    return rangeLine(r.from, minD(r.to, D.today()), v === 'd7' || v === 'd14' ? 'day' : 'month');
  }
  function filterHTML() {
    return '<div class="rp-filter">' +
      '<button type="button" class="rp-filter-btn" id="rpPeriodBtn" aria-haspopup="listbox" aria-expanded="false" aria-controls="rpPeriodMenu">' +
      '<span class="label-caps">Period</span><span class="rp-filter-val">' + esc(presetLabel(sel.kind)) + '</span>' + Club.icon('chevronDown') + '</button>' +
      '<ul class="rp-filter-menu" id="rpPeriodMenu" role="listbox" aria-labelledby="rpPeriodBtn" tabindex="-1" hidden>' +
      PRESETS.map(function (p) {
        const on = p.v === sel.kind;
        return (p.v === 'this' || p.v === 'custom' ? '<li class="rp-opt-sep" role="presentation"></li>' : '') +
          '<li role="option" tabindex="-1" class="rp-opt' + (on ? ' active' : '') + '" data-value="' + p.v + '" aria-selected="' + on + '"><span class="rp-opt-main"><span class="rp-opt-label">' + esc(p.l) + '</span><span class="rp-opt-range">' + esc(optionRange(p.v)) + '</span></span>' + (on ? Club.icon('check') : '') + '</li>';
      }).join('') + '</ul></div>';
  }

  Club.reports = {
    addSection: addSection,
    get: getSection,
    sections: function () { return SECTIONS.slice(); },
    drills: CORE_DRILLS,
    /** Shared helpers so every section reads the same way. */
    h: {
      all: all, num: num, sum: sum, pad: pad, px: px, toMin: toMin, r0: r0, DEAD: DEAD, WD: WD, DEPTS: DEPTS,
      inRange: function (ctx) { return inRange(ctx); }, per: function (ctx, v) { return per(ctx, v); }, unitWord: function (ctx) { return unitWord(ctx); },
      fairRows: function (ctx) { return fairRows(ctx); }, chartLabel: chartLabel, colLabels: colLabels, isPartial: isPartial, partialNote: partialNote,
      coverage: function (first, ctx, what) { return coverageText(first, ctx, what); }, marksText: marksText, monthLabel: monthLabel, monthLong: monthLong, plural: plural, pctChange: pctChange,
      teeCapacity: function (tees) { return teeCapacity(tees); }, inferInterval: inferInterval, spanDays: spanDays, shiftKey: shiftKey, daysSince: daysSince,
      csvKey: csvKey, periodTotals: periodTotals, moneyShort: moneyShort, numShort: numShort, delta: deltaHTML, prevOK: prevOK, memo: memo, joinAnd: joinAnd,
      rKpis: function (items) { return rKpis(items); }, rSec: function (t, a, i) { return rSec(t, a, i); }, rTable: function (c, r, f) { return rTable(c, r, f); }, rNote: function (t) { return rNote(t); },
      extremes: function (ctx, fn, fmt) { return extremes(ctx, fn, fmt); }, trend: function (ctx, name, fn, money, k) { return trend(ctx, name, fn, money, k); }, perUnitTable: function (ctx, c, f, foot) { return perUnitTable(ctx, c, f, foot); },
      rDelta: function (cur, prev, ctx, k) { return rDelta(cur, prev, ctx, k); }, chg: function (cur, prev, ctx, k) { return chg(cur, prev, ctx, k); },
      toCSV: toCSV, download: download, csvName: csvName,
      /* Headline changes and plain-English text (see "Headline changes" above) */
      kpiChg: kpiChg, chgMag: chgMag, prevPct: prevPct, pctVs: pctVs, prevWords: prevWords, coversPrev: coversPrev, prevCtx: function (ctx) { return prevCtx(ctx); },
      sents: sents, pctOf: pctOf, whenLabel: whenLabel, inSeasonKey: inSeasonKey, isWeekend: isWeekend
    },
    /** A section's ideas, ranked (memoised per render). */
    ideasOf: function (ctx, id) { return ideasOf(ctx, getSection(id)); },
    /** Every section's ideas together, ranked, each with its section (sec, where) and stable key. */
    allIdeas: allIdeas,
    rankIdeas: rankIdeas
  };

  const TAB_KEY = 'stboniface.reports.tab';
  let tab = 'overview';
  try { tab = localStorage.getItem(TAB_KEY) || 'overview'; } catch (e) { /* storage unavailable */ }

  function render(view, params) {
    let ctx = null, csvs = {};
    const state = {};
    const SECS = SECTIONS;
    if (params && SECS.some(function (x) { return x.id === params[0]; })) tab = params[0];
    if (!SECS.some(function (x) { return x.id === tab; })) tab = SECS.length ? SECS[0].id : 'overview';

    function body() {
      try { ctx = context(); } catch (e) { console.error(e); return U.empty({ icon: 'alert', title: 'Reports could not load', text: e.message }); }
      if (ctx.empty || !ctx.rows.length) {
        csvs = {};
        return (ctx.notes.length ? '<div class="rp-notes">' + ctx.notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</div>' : '') +
          '<div class="rp-panel rp-single" data-reveal>' + U.empty({ icon: 'reports', title: 'No records for this period', text: 'Choose a more recent period to see how the club is performing.', action: U.btn('Show last 12 months', { kind: 'primary', action: 'reset' }) }) + '</div>';
      }
      csvs = {};
      SECS.forEach(function (s) {
        csvs[s.id] = safe(function () { return s.csv ? s.csv(ctx) : []; }, []);
        if (s.ideas) csvs[s.id] = csvs[s.id].concat([{ id: s.id + '-ideas', title: s.ideasTitle || 'Ideas to grow revenue', rows: safe(function () { return ideasCSV(ctx, s); }, []) }]);
      });
      return '<div class="tabs rp-tabs" role="tablist" aria-label="Report sections">' + SECS.map(function (x) {
        const on = x.id === tab;
        return '<button type="button" class="tab' + (on ? ' active' : '') + '" role="tab" id="rp-tab-' + x.id + '" data-rtab="' + x.id + '" aria-selected="' + on + '" aria-controls="rp-sec-' + x.id + '" tabindex="' + (on ? '0' : '-1') + '">' + esc(x.label) + '</button>';
      }).join('') + '<span class="tab-ink"></span></div>' +
        SECS.map(function (s) { return sectionHTML(s, ctx, state, s.id === tab); }).join('');
    }

    const bodyHTML = body();
    view.innerHTML = '<div class="rp-page">' + U.pageHeader({
      eyebrow: 'Administration',
      title: 'Reports',
      subtitle: '<span class="rp-range">' + esc(ctx ? ctx.line : '') + '</span>',
      actions: '<span class="rp-filter-host">' + filterHTML() + '</span>' + U.btn('Export', { icon: 'download', action: 'export', title: 'Export this section as CSV' }) + U.btn('Print', { icon: 'print', action: 'print' })
    }) + '<div class="rp-body">' + bodyHTML + '</div>' +
      '<div class="rp-print-foot">' + esc(Club.info.name + ' · Printed ' + F.dateLong(new Date())) + '</div></div>';

    const host = U.$('.rp-body', view);
    function wireSections() {
      SECS.forEach(function (s) {
        if (!s.wire || !ctx) return;
        const el = host.querySelector('#rp-sec-' + s.id);
        if (el) { try { s.wire(el, ctx, { drill: function (key, arg) { openDrill(s.id, key, arg); }, open: function (d, asOf) { openDrawer(d, asOf); }, redraw: function () { redraw(false); } }); } catch (e) { console.error(e); } }
      });
    }
    wireSections();
    function placeInk() {
      const a = U.$('.rp-tabs .tab.active', host), ink = U.$('.rp-tabs .tab-ink', host);
      if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = 'translateX(' + a.offsetLeft + 'px)'; }
    }
    function showTab(id, focus) {
      tab = id; try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* ignore */ }
      U.$$('.rp-tabs .tab', host).forEach(function (b) { const on = b.dataset.rtab === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      U.$$('.rp-sec', host).forEach(function (p) {
        const on = p.id === 'rp-sec-' + id; p.hidden = !on;
        if (on) { Club.charts.fit(p); U.animateIn(p); }
      });
      placeInk();
      try { window.history.replaceState(null, '', '#/reports' + (id === SECS[0].id ? '' : '/' + id)); } catch (e) { /* ignore */ }
    }
    function redraw(animate) {
      closeMenus();
      host.innerHTML = body();
      const range = U.$('.rp-range', view); if (range && ctx) range.textContent = ctx.line;
      wireSections();
      requestAnimationFrame(placeInk);
      if (animate) U.animateIn(host);
      else {
        U.$$('[data-reveal]', host).forEach(function (n) { n.classList.add('revealed'); });
        Club.charts.animate(host);
      }
    }

    /* ----- Drill-down drawers ----- */
    function openDrawer(d, asOf) {
      const c = ctx;
      const api = U.drawer({
        eyebrow: asOf ? 'As of ' + F.date(D.today()) : c.line, title: d.title, body: '<div class="rd">' + (d.noNotes || asOf ? '' : notesHTML(c)) + d.body + '</div>',
        actions: (d.csv && d.csv.length > 1 ? [{ label: 'Export CSV', kind: 'ghost', icon: 'download', onClick: function () { download(d.csvName || ('stboniface-' + (d.csvId || 'details') + '-' + (asOf ? D.today() : c.from + '-to-' + c.to) + '.csv'), toCSV(d.csv)); U.toast(d.title + ' exported'); return false; } }] : [])
          .concat([{ label: d.goLabel || 'Close', kind: d.go ? 'primary' : 'ghost', onClick: function () { if (d.go) Club.app.go(d.go); } }])
      });
      if (api.duplicate) return api;
      api.el.classList.add('rp-drawer');
      api.el.setAttribute('aria-label', d.title);
      U.on(api.el, 'click', 'a[href^="#/"]', function () { api.close(); });
      if (d.wire) { try { d.wire(api, ctx, openDrawer); } catch (e) { console.error(e); } }
      U.animateIn(api.body);
      return api;
    }
    function openDrill(secId, key, arg) {
      if (!ctx || !ctx.rows.length) return;
      const sec = getSection(secId);
      const fn = (sec && sec.drills && sec.drills[key]) || CORE_DRILLS[key];
      if (!fn) return;
      let d;
      try { d = fn(ctx, arg); } catch (e) { console.error(e); d = { title: 'Details', body: U.empty({ icon: 'alert', title: 'These details could not load', text: e.message }), csv: [] }; }
      if (!d) return;
      d.csvId = d.csvId || (secId + '-' + key + '-detail');
      openDrawer(d, !!d.asOf);
    }
    U.on(host, 'click', '[data-drill]', function (e, b) {
      if (b.classList.contains('rp-mi')) return;
      const sec = b.dataset.sec || (b.closest('.rp-sec') || {}).dataset.sec;
      openDrill(sec, b.dataset.drill, b.dataset.arg);
    });
    U.on(host, 'click', '[data-go]', function (e, b) {
      showTab(b.dataset.go);
      const s = U.$('#rp-sec-' + b.dataset.go, host), t = s && b.dataset.goPanel ? s.querySelector('[data-panel="' + b.dataset.goPanel + '"]') : null;
      if (t || s) (t || s).scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    U.on(host, 'click', '[data-ideas-all]', function (e, b) {
      const id = b.dataset.ideasAll; ideasOpen[id] = !ideasOpen[id];
      redraw(false);
      const again = U.$('[data-ideas-all="' + id + '"]', host); if (again) again.focus({ preventScroll: true });
    });
    U.on(host, 'click', '[data-href]', function (e, b) { Club.app.go(b.dataset.href); });

    /* ----- "..." menus: one open at a time, Escape and outside clicks close ----- */
    function closeMenus(except) {
      U.$$('.rp-menu:not([hidden])', host).forEach(function (m) { if (m !== except) { m.hidden = true; const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); } });
    }
    U.on(host, 'click', '.rp-more', function (e, b) {
      const m = b.nextElementSibling, open = !m.hidden;
      closeMenus();
      if (!open) { m.hidden = false; b.setAttribute('aria-expanded', 'true'); const first = U.$('.rp-mi', m); if (first) first.focus(); }
    });
    U.on(host, 'click', '.rp-mi', function (e, li) {
      const panel = li.closest('.rp-panel'), sec = li.closest('.rp-sec');
      closeMenus();
      if (li.dataset.miCsv) exportOne(sec.dataset.sec, li.dataset.miCsv);
      else if (li.dataset.miDrill) openDrill(sec.dataset.sec, li.dataset.miDrill, li.dataset.arg);
      const btn = panel && U.$('.rp-more', panel); if (btn) btn.focus();
    });
    U.on(host, 'keydown', '.rp-menu', function (e, m) {
      const items = U.$$('.rp-mi', m), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items[i]) items[i].click(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = m.previousElementSibling; closeMenus(); if (b) b.focus(); }
      else if (e.key === 'Tab') closeMenus();
    });
    U.on(host, 'keydown', '.rp-more', function (e, b) { if (e.key === 'ArrowDown') { e.preventDefault(); if (b.nextElementSibling.hidden) b.click(); } });
    function outsideMenu(e) { if (host.isConnected && !e.target.closest('.rp-more-wrap')) closeMenus(); }
    document.addEventListener('mousedown', outsideMenu);

    /* ----- Chips filter the main chart ----- */
    U.on(host, 'click', '.rp-chip', function (e, c) {
      const panel = c.closest('.rp-panel'), secEl = c.closest('.rp-sec'), sec = getSection(secEl.dataset.sec);
      if (!sec || !sec.main) return;
      const st = state[sec.id] = state[sec.id] || {};
      st.chip = c.dataset.chip;
      let m; try { m = sec.main(ctx, st); } catch (err) { console.error(err); return; }
      U.$$('.rp-chip', panel).forEach(function (x) { x.setAttribute('aria-pressed', x === c); });
      const take = U.$('.rp-take', panel); if (take) take.textContent = m.take || '';
      const pb = U.$('.rp-pb', panel); pb.innerHTML = m.body || '';
      const desc = U.$('.rp-desc', panel); if (desc) desc.textContent = m.desc || '';
      const foot = U.$('.rp-foot', panel); if (foot) foot.innerHTML = m.foot || '';
      Club.charts.fit(panel);
    });

    /* ----- Export: the current section's CSVs in one file, or one report from a menu ----- */
    function exportOne(secId, csvId) {
      const list = csvs[secId] || [], r = list.filter(function (x) { return x.id === csvId; })[0];
      if (!r || !r.rows || r.rows.length < 2) { U.toast('Nothing to export for this report yet', 'bad'); return; }
      download(csvName(r.id, ctx), toCSV(r.rows));
      U.toast(r.title + ' exported');
    }
    U.on(view, 'click', '[data-action=export]', function () {
      if (!ctx || !ctx.rows.length) { U.toast('Nothing to export for this period yet', 'bad'); return; }
      const sec = getSection(tab), list = (csvs[tab] || []).filter(function (x) { return x.rows && x.rows.length > 1; });
      if (!list.length) { U.toast('Nothing to export for this section yet', 'bad'); return; }
      const rows = [];
      list.forEach(function (r, i) { if (i) rows.push([]); rows.push([r.title]); r.rows.forEach(function (x) { rows.push(x); }); });
      download(csvName(tab, ctx), toCSV(rows));
      U.toast((sec ? sec.label : 'Section') + ' exported');
    });

    /* ----- Period dropdown ----- */
    const fHost = U.$('.rp-filter-host', view);
    function btn() { return U.$('.rp-filter-btn', fHost); }
    function menu() { return U.$('.rp-filter-menu', fHost); }
    function isOpen() { return !menu().hidden; }
    function openMenu(focusLast) {
      const m = menu(); m.hidden = false; btn().setAttribute('aria-expanded', 'true');
      fHost.querySelector('.rp-filter').classList.add('open');
      const opts = U.$$('.rp-opt', m);
      const target = focusLast ? opts[opts.length - 1] : (U.$('.rp-opt.active', m) || opts[0]);
      if (target) target.focus();
    }
    function closeMenu(refocus) {
      const m = menu(); if (m.hidden) return;
      m.hidden = true; btn().setAttribute('aria-expanded', 'false');
      fHost.querySelector('.rp-filter').classList.remove('open');
      if (refocus) btn().focus();
    }
    function apply(next) {
      sel = next; saveSel();
      fHost.innerHTML = filterHTML();
      redraw(true);
      btn().focus();
    }
    function choose(v) {
      closeMenu(false);
      if (v === 'custom') { customModal(); return; }
      if (v === sel.kind) { btn().focus(); return; }
      apply({ kind: v });
    }
    function customModal() {
      const T = D.today();
      const c = ctx || context();
      const cur = sel.kind === 'custom' ? sel : (function () { const r = rangeOf(sel); return { from: maxD(r.from, c.earliest), to: minD(r.to, T) }; })();
      const bodyHTML = '<form class="rp-custom" novalidate><p class="ink-2 rp-custom-lead">Choose the first and last day to report on. Records run from ' + esc(F.date(c.earliest)) + ' to today.</p>' +
        '<div class="form-grid">' +
        U.field({ label: 'From', name: 'from', type: 'date', value: cur.from, min: c.earliest, max: T, required: true }) +
        U.field({ label: 'To', name: 'to', type: 'date', value: cur.to, min: c.earliest, max: T, required: true }) + '</div>' +
        '<div class="rp-custom-quick" role="group" aria-label="Quick ranges">' + [['Last 30 days', -29], ['Last 90 days', -89], ['Since January', null]].map(function (q) { return '<button type="button" class="btn btn-sm btn-ghost" data-quick="' + (q[1] == null ? 'jan' : q[1]) + '">' + esc(q[0]) + '</button>'; }).join('') + '</div>' +
        '<p class="field-error rp-custom-err" role="alert" hidden></p>' +
        '<p class="rp-custom-hint muted">Ranges of 31 days or fewer that fall within live records are shown day by day. Longer ranges are shown by month, using monthly history where daily records are not kept.</p></form>';
      const api = U.modal({
        eyebrow: 'Reports', title: 'Custom period', body: bodyHTML,
        actions: [{ label: 'Cancel', kind: 'ghost', onClick: function () { setTimeout(function () { btn().focus(); }, 200); } }, {
          label: 'Apply period', kind: 'primary', onClick: function (a) {
            const form = U.$('form', a.body), err = U.$('.rp-custom-err', a.body);
            const f = U.$('[name=from]', form), t = U.$('[name=to]', form);
            [f, t].forEach(function (x) { x.classList.remove('invalid'); });
            const fail = function (msg, el) { err.textContent = msg; err.hidden = false; if (el) { el.classList.add('invalid'); el.focus(); } return false; };
            if (!isoOK(f.value)) return fail('Enter a start date.', f);
            if (!isoOK(t.value)) return fail('Enter an end date.', t);
            if (f.value > t.value) return fail('The start date needs to be on or before the end date.', f);
            if (t.value > T) return fail('The end date can be today at the latest.', t);
            if (f.value < c.earliest) return fail('Club records begin ' + F.date(c.earliest) + '. Choose a start date on or after it.', f);
            err.hidden = true;
            setTimeout(function () { apply({ kind: 'custom', from: f.value, to: t.value }); }, 0);
          }
        }]
      });
      U.on(api.body, 'click', '[data-quick]', function (e, b) {
        const q = b.dataset.quick;
        U.$('[name=from]', api.body).value = q === 'jan' ? maxD(T.slice(0, 4) + '-01-01', c.earliest) : maxD(D.addDays(T, +q), c.earliest);
        U.$('[name=to]', api.body).value = T;
      });
      U.on(api.body, 'submit', 'form', function (e) { e.preventDefault(); });
    }
    U.on(fHost, 'click', '.rp-filter-btn', function () { if (isOpen()) closeMenu(true); else openMenu(); });
    U.on(fHost, 'click', '.rp-opt', function (e, li) { choose(li.dataset.value); });
    U.on(fHost, 'keydown', '.rp-filter-btn', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(e.key === 'ArrowUp'); }
    });
    U.on(fHost, 'keydown', '.rp-filter-menu', function (e) {
      const opts = U.$$('.rp-opt', menu()), i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
      else if (e.key === 'Home') { e.preventDefault(); opts[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[i]) choose(opts[i].dataset.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    function outside(e) { if (fHost.isConnected && isOpen() && !fHost.contains(e.target)) closeMenu(false); }
    document.addEventListener('mousedown', outside);

    /* ----- Tabs ----- */
    U.on(host, 'click', '.rp-tabs .tab', function (e, b) { showTab(b.dataset.rtab); });
    U.on(host, 'keydown', '.rp-tabs .tab', function (e, b) {
      const ids = SECS.map(function (x) { return x.id; }), i = ids.indexOf(b.dataset.rtab);
      const n = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : null;
      if (n) { e.preventDefault(); showTab(n, true); }
    });
    /* Printing shows every section, with charts redrawn at their printed width. */
    function beforePrint() {
      closeMenus();
      U.$$('.rp-sec', host).forEach(function (p) { p.hidden = false; });
      U.$$('.rp-about', host).forEach(function (d) { if (!d.open) { d.open = true; d.dataset.printOpened = '1'; } });
      Club.charts.fit(host);
    }
    function afterPrint() {
      if (!host.isConnected) return;
      U.$$('.rp-sec', host).forEach(function (p) { p.hidden = p.id !== 'rp-sec-' + tab; });
      U.$$('.rp-about[data-print-opened]', host).forEach(function (d) { d.open = false; delete d.dataset.printOpened; });
    }
    window.addEventListener('beforeprint', beforePrint); window.addEventListener('afterprint', afterPrint);
    U.on(view, 'click', '[data-action=print]', function () { window.print(); });
    U.on(view, 'click', '[data-action=reset]', function () { apply({ kind: 'm12' }); });

    let t;
    const watch = ['members', 'membershipTiers', 'charges', 'payments', 'statements', 'sales', 'products', 'diningOrders', 'diningReservations', 'teeTimes', 'monthlyMetrics'];
    SECS.forEach(function (s) { (s.collections || []).forEach(function (k) { if (watch.indexOf(k) < 0) watch.push(k); }); });
    const unsubs = watch.map(function (c) { return S.subscribe(c, function () { clearTimeout(t); t = setTimeout(function () { redraw(false); }, 250); }); });
    let rt; function onResize() { placeInk(); clearTimeout(rt); rt = setTimeout(function () { U.$$('.rp-sec:not([hidden])', host).forEach(function (p) { Club.charts.fit(p); }); }, 160); }
    window.addEventListener('resize', onResize);
    requestAnimationFrame(placeInk);
    U.animateIn(host);
    return function () { clearTimeout(t); clearTimeout(rt); unsubs.forEach(function (u) { u(); }); document.removeEventListener('mousedown', outside); document.removeEventListener('mousedown', outsideMenu); window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint); window.removeEventListener('resize', onResize); };
  }

  Club.register({ id: 'reports', label: 'Reports', icon: 'reports', section: 'Administration', order: 20, render: render });
})();
