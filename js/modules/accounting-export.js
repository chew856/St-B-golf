/* Accounting export (Nov 2026, builder C): the Export and Account mapping tabs inside the Accounting page
   (js/modules/accounting.js), added through the window.__accountingTabs queue. Nothing here talks to an accounting
   package: staff download a file and import it (QuickBooks Online, Sage 50 Canadian or a generic GL layout).

   Keys and collections (owner: this file)
     $glAccounts        chart of accounts [{ id, number, name, type: 'asset'|'liability'|'equity'|'income'|'expense' }]
                        (default: a small Canadian golf club chart, to be confirmed with the club's accountant)
     $glMapping         { mapping key: account id } for revenue by department, tenders, GST, PST, member A/R, gift card
                        liability, customer deposits, promo discounts, cash over/short and rounding (MAP_ROWS below)
     $glExportSettings  { taxed: { dept: bool }, arName: '' (QuickBooks customer on A/R lines), dateFmt }
     accountingExports  { id, at, by, format: 'quickbooks'|'sage'|'gl', mode: 'closed'|'range', from, to, days: [ISO],
                          lines, total (debits, dollars), file }
     dailyCloses.exports.{quickbooks|sage|gl} = ISO timestamp of the last download that included the day (B's collection)

   One journal entry per day, summarised by account, built from Club.accounting.summarize(date) receipts (everything not
   paid on a member account), the 'charges' collection (member account sales and dues, Dr A/R) and the 'payments'
   collection (member payments, Cr A/R), plus the cash over/short of a closed day. Prices include tax: GST and PST are
   taken out of taxed departments with Club.taxRate(). Amounts are kept in integer cents throughout.

   Club.accountingExport = { accounts, mapping, settings, validate, journalFor, build, file, toCSV, MAP_ROWS, DEPTS,
                             DEFAULT_ACCOUNTS, DEFAULT_MAP } */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;

  /* ---------------- Defaults ---------------- */
  const TYPES = [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' },
    { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }];
  const TYPE_LABEL = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };

  /* Four-digit numbers: Sage 50 imports four-character account numbers. */
  const DEFAULT_ACCOUNTS = [
    { id: 'gl_bank', number: '1000', name: 'Bank, operating account', type: 'asset' },
    { id: 'gl_cash', number: '1010', name: 'Cash on hand', type: 'asset' },
    { id: 'gl_card', number: '1050', name: 'Card clearing, terminals', type: 'asset' },
    { id: 'gl_online', number: '1055', name: 'Online card clearing', type: 'asset' },
    { id: 'gl_ar', number: '1210', name: 'Member accounts receivable', type: 'asset' },
    { id: 'gl_gst', number: '2310', name: 'GST payable', type: 'liability' },
    { id: 'gl_pst', number: '2320', name: 'PST payable', type: 'liability' },
    { id: 'gl_gift', number: '2410', name: 'Gift card liability', type: 'liability' },
    { id: 'gl_dep', number: '2420', name: 'Customer deposits', type: 'liability' },
    { id: 'gl_dues', number: '4010', name: 'Membership dues', type: 'income' },
    { id: 'gl_golf', number: '4100', name: 'Green fees and golf', type: 'income' },
    { id: 'gl_shop', number: '4200', name: 'Pro shop sales', type: 'income' },
    { id: 'gl_fb', number: '4300', name: 'Food and beverage, Gallery', type: 'income' },
    { id: 'gl_takeout', number: '4310', name: 'Takeout sales', type: 'income' },
    { id: 'gl_cartrev', number: '4320', name: 'Beverage cart sales', type: 'income' },
    { id: 'gl_events', number: '4400', name: 'Events and tournaments', type: 'income' },
    { id: 'gl_lessons', number: '4500', name: 'Lessons and academy', type: 'income' },
    { id: 'gl_other', number: '4900', name: 'Other revenue', type: 'income' },
    { id: 'gl_promo', number: '4950', name: 'Promo code discounts', type: 'income' },
    { id: 'gl_os', number: '6800', name: 'Cash over and short', type: 'expense' },
    { id: 'gl_round', number: '6810', name: 'Rounding differences', type: 'expense' }
  ];

  /* Revenue departments (Club.accounting.classify depts; giftcards, functions, outings and payments are handled apart). */
  const DEPTS = [
    { id: 'golf', label: 'Golf', hint: 'Green fees, carts and add-ons', taxed: true, acct: 'gl_golf' },
    { id: 'proshop', label: 'Pro shop', taxed: true, acct: 'gl_shop' },
    { id: 'dining', label: 'Gallery Taphouse & Grill', taxed: true, acct: 'gl_fb' },
    { id: 'takeout', label: 'Takeout', taxed: true, acct: 'gl_takeout' },
    { id: 'cart', label: 'Beverage cart', taxed: true, acct: 'gl_cartrev' },
    { id: 'events', label: 'Events and tournaments', taxed: false, acct: 'gl_events' },
    { id: 'lessons', label: 'Lessons and academy', taxed: false, acct: 'gl_lessons' },
    { id: 'dues', label: 'Membership dues', taxed: false, acct: 'gl_dues' },
    { id: 'other', label: 'Other revenue', taxed: false, acct: 'gl_other' }
  ];
  const DEPT = {}; DEPTS.forEach(function (d) { DEPT[d.id] = d; });
  const DRAWER_IDS = ['shop', 'gallery', 'cart'];
  const DRAWER_FALLBACK = { shop: 'Golf shop', gallery: 'Gallery Taphouse & Grill', cart: 'Beverage cart' };
  function drawerName(id) {
    const list = Club.accounting && Array.isArray(Club.accounting.DRAWERS) ? Club.accounting.DRAWERS : [];
    const d = list.find(function (x) { return x.id === id; });
    return d ? d.name : (DRAWER_FALLBACK[id] || 'Other');
  }

  const MAP_GROUPS = [
    { id: 'revenue', title: 'Revenue by department', note: 'Tick Taxed for departments whose prices include GST and PST.',
      rows: DEPTS.map(function (d) { return { key: 'rev.' + d.id, label: d.label, hint: d.hint || '', types: ['income'], def: d.acct, dept: d.id }; }) },
    { id: 'tenders', title: 'Tenders', note: 'Where the money lands. Card and online card go to clearing accounts until the processor deposit.', rows: [
      { key: 'tender.cash.shop', label: 'Cash, Golf shop drawer', types: ['asset'], def: 'gl_cash', drawer: 'shop' },
      { key: 'tender.cash.gallery', label: 'Cash, Gallery drawer', types: ['asset'], def: 'gl_cash', drawer: 'gallery' },
      { key: 'tender.cash.cart', label: 'Cash, Beverage cart drawer', types: ['asset'], def: 'gl_cash', drawer: 'cart' },
      { key: 'tender.cash', label: 'Cash, office', hint: 'Cash taken outside a drawer, such as an account payment', types: ['asset'], def: 'gl_cash' },
      { key: 'tender.card', label: 'Card terminal', hint: 'Cards taken at the tills, settled in the terminal batch', types: ['asset'], def: 'gl_card' },
      { key: 'tender.onlineCard', label: 'Online card', hint: 'Public site and members portal, settled by the online processor', types: ['asset'], def: 'gl_online' },
      { key: 'tender.pad', label: 'Pre-authorized debit', hint: 'Member account payments by PAD', types: ['asset'], def: 'gl_bank' },
      { key: 'tender.cheque', label: 'Cheques', hint: 'Member account payments by cheque', types: ['asset'], def: 'gl_bank' },
      { key: 'tender.other', label: 'Other tenders', types: ['asset'], def: 'gl_bank' }
    ] },
    { id: 'tax', title: 'Sales tax', rows: [
      { key: 'gst', label: 'GST collected', types: ['liability'], def: 'gl_gst' },
      { key: 'pst', label: 'PST collected', hint: 'Manitoba retail sales tax', types: ['liability'], def: 'gl_pst' }
    ] },
    { id: 'balance', title: 'Balance sheet', rows: [
      { key: 'ar', label: 'Member accounts receivable', hint: 'House accounts: charges to and payments from members', types: ['asset'], def: 'gl_ar' },
      { key: 'gift', label: 'Gift card liability', hint: 'Cards sold go in, cards redeemed come out', types: ['liability'], def: 'gl_gift' },
      { key: 'deposits', label: 'Customer deposits', hint: 'Wedding, function and outing deposits', types: ['liability'], def: 'gl_dep' }
    ] },
    { id: 'adjust', title: 'Adjustments', rows: [
      { key: 'promo', label: 'Promo code discounts', types: ['income', 'expense'], def: 'gl_promo' },
      { key: 'overShort', label: 'Cash over and short', hint: 'From the drawer counts at the daily close', types: ['expense', 'income'], def: 'gl_os' },
      { key: 'rounding', label: 'Rounding differences', hint: 'Cash rounded to 5 cents at the tills, and cents left so a day balances', types: ['expense', 'income'], def: 'gl_round' }
    ] }
  ];
  const MAP_ROWS = []; MAP_GROUPS.forEach(function (g) { g.rows.forEach(function (r) { MAP_ROWS.push(r); }); });
  const ROW = {}; MAP_ROWS.forEach(function (r) { ROW[r.key] = r; });
  const DEFAULT_MAP = {}; MAP_ROWS.forEach(function (r) { DEFAULT_MAP[r.key] = r.def; });

  const DATE_FORMATS = [{ value: 'dd/mm/yyyy', label: 'dd/mm/yyyy' }, { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy' }, { value: 'yyyy-mm-dd', label: 'yyyy-mm-dd' }];
  function defaultSettings() {
    const taxed = {}; DEPTS.forEach(function (d) { taxed[d.id] = d.taxed; });
    return { taxed: taxed, arName: '', dateFmt: 'dd/mm/yyyy' };
  }

  const FORMATS = {
    quickbooks: { id: 'quickbooks', label: 'QuickBooks Online', short: 'QuickBooks', ext: 'csv', mime: 'text/csv;charset=utf-8' },
    sage: { id: 'sage', label: 'Sage 50 (Canadian)', short: 'Sage 50', ext: 'txt', mime: 'text/plain;charset=utf-8' },
    gl: { id: 'gl', label: 'Generic GL', short: 'generic GL', ext: 'csv', mime: 'text/csv;charset=utf-8' }
  };
  const GST_RATE = 0.05;
  const ROUND_TOL = 5;      /* cents: a day out by this much or less gets a rounding line; more blocks the download */
  const MAX_DAYS = 92;

  /* ---------------- Small helpers ---------------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function cents(v) { const n = +v; return isFinite(n) ? Math.round(n * 100) : 0; }
  function rnd(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
  function amt(c) { return (c / 100).toFixed(2); }
  function money(c) { return fmt.money(c / 100); }
  function today() { return Club.date.today(); }
  function addDays(iso, n) { return Club.date.addDays(iso, n); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function staffName() { return Club.user ? Club.user.firstName + ' ' + Club.user.lastName : 'Staff'; }
  function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T12:00:00')); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000); }
  function acctLabel(a) { return a ? a.number + ' · ' + a.name : 'Not mapped'; }
  function byNumber(a, b) { return String(a.number).localeCompare(String(b.number), undefined, { numeric: true }) || String(a.name).localeCompare(String(b.name)); }

  /* ---------------- Stored settings ---------------- */
  function accounts() {
    const a = S.getObj('glAccounts', null);
    return Array.isArray(a) ? a.slice() : clone(DEFAULT_ACCOUNTS);
  }
  function mapping() {
    const m = S.getObj('glMapping', null);
    return Object.assign({}, DEFAULT_MAP, m && typeof m === 'object' ? m : {});
  }
  function settings() {
    const d = defaultSettings(), s = S.getObj('glExportSettings', null) || {};
    return { taxed: Object.assign(d.taxed, s.taxed || {}), arName: typeof s.arName === 'string' ? s.arName : d.arName,
      dateFmt: DATE_FORMATS.some(function (f) { return f.value === s.dateFmt; }) ? s.dateFmt : d.dateFmt };
  }
  /* Undo for chart, mapping and settings changes (Club.undo through Club.accounting; panels redraw from their watchers). */
  function undoRun(fn, o) { if (Club.accounting && Club.accounting.undoRun) return Club.accounting.undoRun(fn, o); const r = fn(); ui.toast(o.message); return r; }
  function saveSettings(patch) { S.setObj('glExportSettings', Object.assign(settings(), patch)); }
  function isDefaultChart() {
    const a = S.getObj('glAccounts', null), m = S.getObj('glMapping', null);
    return (!a || JSON.stringify(a) === JSON.stringify(DEFAULT_ACCOUNTS)) && (!m || JSON.stringify(Object.assign({}, DEFAULT_MAP, m)) === JSON.stringify(DEFAULT_MAP));
  }
  /** Mapping keys that point at an account. */
  function usage(accId, map) { return MAP_ROWS.filter(function (r) { return map[r.key] === accId; }); }

  /** { ok, errors: { key: msg }, warnings: { key: msg }, missing } for a mapping against a chart. */
  function validate(accs, map) {
    accs = accs || accounts(); map = map || mapping();
    const byId = {}; accs.forEach(function (a) { byId[a.id] = a; });
    const errors = {}, warnings = {};
    MAP_ROWS.forEach(function (r) {
      const id = map[r.key];
      if (!id) errors[r.key] = 'Choose an account.';
      else if (!byId[id]) errors[r.key] = 'That account was removed. Choose another.';
      else if (r.types.indexOf(byId[id].type) < 0) warnings[r.key] = 'Usually ' + r.types.map(function (t) { return TYPE_LABEL[t].toLowerCase(); }).join(' or ') + ', this is ' + TYPE_LABEL[byId[id].type].toLowerCase() + '.';
    });
    const missing = Object.keys(errors).length;
    return { ok: !missing, errors: errors, warnings: warnings, missing: missing };
  }

  /* ---------------- Journal ---------------- */
  /** What a run of days needs, read once: settings and the charges, payments and receipts indexed. */
  function makeCtx(from, to) {
    const accs = accounts();
    const ctx = { A: Club.accounting || null, accs: accs, byId: {}, map: mapping(), set: settings(), rate: +Club.taxRate() || 0,
      charges: {}, payments: {}, rcById: {}, rcByPayment: {} };
    accs.forEach(function (a) { ctx.byId[a.id] = a; });
    const inRange = function (d) { return d && (!from || d >= from) && (!to || d <= to); };
    S.all('charges').forEach(function (c) { if (inRange(c.date)) (ctx.charges[c.date] = ctx.charges[c.date] || []).push(c); });
    S.all('payments').forEach(function (p) { if (inRange(p.date)) (ctx.payments[p.date] = ctx.payments[p.date] || []).push(p); });
    S.all('receipts').forEach(function (r) { ctx.rcById[r.id] = r; if (r.paymentId) ctx.rcByPayment[r.paymentId] = r; });
    return ctx;
  }
  function closeFor(ctx, date) {
    try { if (ctx.A && ctx.A.closeFor) return ctx.A.closeFor(date) || null; } catch (e) { /* fall back to the collection */ }
    return S.find('dailyCloses', 'close_' + date);
  }
  function closedOn(ctx, date) {
    try { if (ctx.A && ctx.A.isClosed) return !!ctx.A.isClosed(date); } catch (e) { /* fall back */ }
    const c = S.find('dailyCloses', 'close_' + date); return !!(c && c.status === 'closed');
  }

  const SRC_DEPT = { teesheet: 'golf', public: 'golf', proshop: 'proshop', shop: 'proshop', dining: 'dining', takeout: 'takeout', cart: 'cart',
    events: 'events', lessons: 'lessons', giftcards: 'giftcards', functions: 'functions', outings: 'outings' };
  const CAT_DEPT = { Dues: 'dues', Golf: 'golf', 'Pro Shop': 'proshop', Dining: 'dining', Events: 'events', Lessons: 'lessons', Other: 'other' };
  /** Department of a member account charge: dues by category, else the selling module (source), else the category. */
  function chargeDept(c) {
    if (c.category === 'Dues') return 'dues';
    return SRC_DEPT[c.source] || CAT_DEPT[c.category] || 'other';
  }
  /** Promo codes and staff discounts appear on receipts as negative lines; their total, tax included, in cents. */
  function discountOf(r) {
    if (!r || r.kind === 'credit' || !Array.isArray(r.lines)) return 0;
    return r.lines.reduce(function (a, l) {
      const v = cents(l.price) * (+l.qty || 1);
      return v < 0 && /promo|discount/i.test(String(l.name || '')) ? a - v : a;
    }, 0);
  }
  function tenderKey(t, cr) {
    if (t.method === 'card') return t.online || cr.online ? 'tender.onlineCard' : 'tender.card';
    if (t.method === 'cash') return DRAWER_IDS.indexOf(cr.drawer) >= 0 ? 'tender.cash.' + cr.drawer : 'tender.cash';
    if (t.method === 'gift') return 'gift';
    return 'tender.other';
  }
  const TENDER_MEMO = { 'tender.card': 'Card terminal sales', 'tender.onlineCard': 'Online card sales', 'tender.cash': 'Office cash',
    'tender.cash.shop': 'Golf shop cash', 'tender.cash.gallery': 'Gallery cash', 'tender.cash.cart': 'Beverage cart cash', gift: 'Gift cards redeemed', 'tender.other': 'Other tenders' };
  const PAY_MEMO = { 'tender.card': 'Member payments by card', 'tender.onlineCard': 'Member payments online', 'tender.pad': 'Member payments by PAD',
    'tender.cheque': 'Member payments by cheque', 'tender.cash': 'Member payments in cash', 'tender.other': 'Member payments other', gift: 'Member payments by gift card' };
  function paymentKey(p, ctx) {
    if (p.method === 'Card') {
      const rc = ctx.rcByPayment[p.id];
      let online = !!(rc && (rc.channel === 'online' || rc.source === 'portal' || rc.source === 'public'));
      if (!online && rc && ctx.A && ctx.A.classify) { try { online = !!ctx.A.classify(rc).online; } catch (e) { /* keep */ } }
      if (!online && /portal|online/i.test(String(p.reference || ''))) online = true;
      return online ? 'tender.onlineCard' : 'tender.card';
    }
    if (p.method === 'ACH') return 'tender.pad';
    if (p.method === 'Check') return 'tender.cheque';
    if (p.method === 'Cash') return 'tender.cash';
    return 'tender.other';
  }

  /** The journal entry for one day. Lines: [{ key, accountId, account, memo, debit, credit (cents), ar }]. */
  function journalFor(date, ctx) {
    ctx = ctx || makeCtx(date, date);
    const close = closeFor(ctx, date);
    const out = { date: date, no: journalNo(date), status: close ? (close.status || 'closed') : 'open', closed: closedOn(ctx, date), close: close,
      lines: [], debit: 0, credit: 0, diff: 0, rounding: 0, balanced: true, empty: true, issues: [], counts: { receipts: 0, charges: 0, payments: 0 } };
    const post = [];
    function add(key, memo, v) { if (v) post.push({ key: key, memo: memo, v: v }); }
    const gross = {}, disc = {};
    function creditDept(dept, v, d) {
      if (dept === 'giftcards') return add('gift', 'Gift cards sold', -v);
      if (dept === 'functions') return add('deposits', 'Function deposits', -v);
      if (dept === 'outings') return add('deposits', 'Outing deposits', -v);
      const k = DEPT[dept] ? dept : 'other';
      gross[k] = (gross[k] || 0) + v; disc[k] = (disc[k] || 0) + (d || 0);
    }

    /* 1. Receipts: money taken at a till or online (account tenders are posted from the charges below). */
    let sum = null;
    if (ctx.A && ctx.A.summarize) {
      try { sum = ctx.A.summarize(date); } catch (e) { out.issues.push({ kind: 'summary', text: 'The daily summary could not be read: ' + (e && e.message || e) }); out.balanced = false; }
    }
    ((sum && sum.receipts) || []).forEach(function (cr) {
      const r = ctx.rcById[cr.id] || cr;
      if (cr.dept === 'payments' || (r.paymentId && S.find('payments', r.paymentId))) return;   /* member payments come from the payments collection (tee sheet shop receipts carry a 'tsp_' paymentId that is not one) */
      const sign = cr.sign === -1 || (cr.sign == null && r.kind === 'credit') ? -1 : 1;
      let acct = 0, rest = 0; const parts = [];
      (Array.isArray(cr.tenders) ? cr.tenders : []).forEach(function (t) {
        const v = Math.abs(cents(t.amount)); if (!v || !t) return;
        if (t.method === 'account') acct += v; else { rest += v; parts.push({ t: t, v: v }); }
      });
      if (!parts.length) return;
      const total = Math.abs(cents(r.total != null ? r.total : cr.total));
      const base = total - acct;
      if (rest !== base) out.issues.push({ kind: 'tenders', text: 'Receipt ' + (r.no || cr.id) + ': tenders add up to ' + money(rest + acct) + ' but the total is ' + money(total) + '.' });
      parts.forEach(function (p) { const k = tenderKey(p.t, cr); add(k, TENDER_MEMO[k], sign * p.v); });
      const dTotal = discountOf(r);
      const d = acct && total ? rnd(dTotal * base / total) : dTotal;
      creditDept(cr.dept, sign * base, sign * d);
      out.counts.receipts++;
    });
    /* Cash payments are rounded to the nearest 5 cents at the till (no pennies): the drawer holds the rounded amount. */
    if (sum && sum.drawers) {
      DRAWER_IDS.forEach(function (id) {
        const v = cents(sum.drawers[id] && sum.drawers[id].rounding); if (!v) return;
        const name = drawerName(id);
        add('tender.cash.' + id, name + ' cash rounding to 5 cents', v);
        add('rounding', name + ' cash rounding to 5 cents', -v);
      });
    }

    /* 2. Member account charges (sales and dues): Dr A/R, Cr revenue and tax. */
    (ctx.charges[date] || []).forEach(function (c) {
      const v = cents(c.amount); if (!v) return;
      const dept = chargeDept(c);
      add('ar', dept === 'dues' ? 'Dues billed to members' : 'Member account sales', v);
      creditDept(dept, v, 0);
      out.counts.charges++;
    });

    /* 3. Member payments: Dr cash, bank or card clearing, Cr A/R. */
    (ctx.payments[date] || []).forEach(function (p) {
      const v = cents(p.amount); if (!v) return;
      const g = Math.min(Math.abs(cents(p.giftAmount)), Math.abs(v)) * (v < 0 ? -1 : 1);
      if (p.giftCardId && g) add('gift', PAY_MEMO.gift, g);
      const k = paymentKey(p, ctx);
      add(k, PAY_MEMO[k], v - (p.giftCardId ? g : 0));
      add('ar', 'Member payments received', -v);
      out.counts.payments++;
    });

    /* 4. Cash over/short counted at the close (counted minus expected: positive is over). */
    if (close && close.status === 'closed') {
      (close.drawers || []).forEach(function (d) {
        const v = cents(d.overShort); if (!v) return;
        const name = drawerName(d.id), k = DRAWER_IDS.indexOf(d.id) >= 0 ? 'tender.cash.' + d.id : 'tender.cash';
        add(k, name + ' cash over/short', v);
        add('overShort', name + ' cash over/short', -v);
      });
    }

    /* 5. Revenue per department, with tax taken out of taxed departments and promo discounts grossed up. */
    const r = ctx.rate, gstR = Math.min(GST_RATE, r);
    DEPTS.forEach(function (dp) {
      if (gross[dp.id] == null) return;
      const G = gross[dp.id], D = disc[dp.id] || 0, taxed = !!ctx.set.taxed[dp.id] && r > 0;
      const tax = taxed ? rnd(G * r / (1 + r)) : 0, gst = taxed ? rnd(G * gstR / (1 + r)) : 0, pst = tax - gst;
      const dPre = taxed ? rnd(D / (1 + r)) : D;
      add('rev.' + dp.id, dp.label + ' sales', -(G - tax + dPre));
      add('promo', dp.label + ' promo discounts', dPre);
      add('gst', 'GST collected', -gst);
      add('pst', 'PST collected', -pst);
    });

    /* 6. Summarise by account and description. */
    const agg = {}, order = [];
    post.forEach(function (p) {
      const acc = ctx.map[p.key] || null, k = (acc || '?' + p.key) + '|' + p.memo;
      if (!agg[k]) { agg[k] = { key: p.key, accountId: acc, memo: p.memo, v: 0, ar: false }; order.push(k); }
      agg[k].v += p.v; if (p.key === 'ar') agg[k].ar = true;
    });
    const unmapped = {};
    const lines = order.map(function (k) { return agg[k]; }).filter(function (l) { return l.v !== 0; }).map(function (l) {
      const a = l.accountId ? ctx.byId[l.accountId] || null : null;
      if (!a) unmapped[l.key] = 1;
      return { key: l.key, accountId: l.accountId, account: a, memo: l.memo, debit: l.v > 0 ? l.v : 0, credit: l.v < 0 ? -l.v : 0, ar: l.ar };
    });
    lines.sort(function (a, b) { return (b.debit ? 1 : 0) - (a.debit ? 1 : 0) || byNumber(a.account || { number: 'zzzz', name: '' }, b.account || { number: 'zzzz', name: '' }) || a.memo.localeCompare(b.memo); });
    Object.keys(unmapped).forEach(function (k) { out.issues.push({ kind: 'unmapped', text: (ROW[k] ? ROW[k].label : k) + ' has no account in Account mapping.' }); out.balanced = false; });

    let dr = 0, cr = 0;
    lines.forEach(function (l) { dr += l.debit; cr += l.credit; });
    const diff = dr - cr;
    if (diff && Math.abs(diff) <= ROUND_TOL) {
      const acc = ctx.map.rounding, a = acc ? ctx.byId[acc] || null : null;
      if (!a) { out.issues.push({ kind: 'unmapped', text: 'Rounding differences has no account in Account mapping.' }); out.balanced = false; }
      lines.push({ key: 'rounding', accountId: acc || null, account: a, memo: 'Rounding adjustment', debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, ar: false, rounding: true });
      if (diff < 0) dr -= diff; else cr += diff;
      out.rounding = diff;
    } else if (diff) {
      out.balanced = false;
    }
    out.lines = lines; out.debit = dr; out.credit = cr; out.diff = dr - cr; out.empty = !lines.length;
    if (out.diff) out.balanced = false;
    return out;
  }

  /** The days to export and their journals. o: { mode: 'closed'|'range', from, to, skip (leave out days already exported in format), format } */
  function build(o) {
    const res = { days: [], empty: [], exported: [], notClosed: 0, lines: 0, debit: 0, unbalanced: 0, error: null, mapping: validate() };
    if (!Club.accounting || !Club.accounting.summarize) { res.error = 'noAccounting'; return res; }
    const ctx = makeCtx(o.from, o.to);
    const last = o.to > today() ? today() : o.to;
    for (let d = o.from, i = 0; d <= last && i <= MAX_DAYS; d = addDays(d, 1), i++) {
      const closed = closedOn(ctx, d);
      if (o.mode === 'closed' && !closed) { res.notClosed++; continue; }
      const close = closeFor(ctx, d);
      if (o.skip && close && close.exports && close.exports[o.format]) { res.exported.push(d); continue; }
      const j = journalFor(d, ctx);
      if (j.empty && !j.issues.length) { res.empty.push(d); continue; }
      res.days.push(j);
      res.lines += j.lines.length; res.debit += j.debit;
      if (!j.balanced) res.unbalanced++;
    }
    return res;
  }

  /* ---------------- File formats ---------------- */
  function csvCell(c) { const s = c == null ? '' : String(c); return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function journalNo(iso) { return 'DC-' + String(iso).replace(/-/g, ''); }
  function fmtDate(iso, pattern) {
    const p = String(iso).split('-');
    if (pattern === 'mm/dd/yyyy') return p[1] + '/' + p[2] + '/' + p[0];
    if (pattern === 'yyyy-mm-dd') return iso;
    if (pattern === 'mm-dd-yy') return p[1] + '-' + p[2] + '-' + p[0].slice(2);
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  /* Sage 50 reads quoted fields; keep its comments free of quotes and commas, and within its 75 character limit. */
  function sageText(s, max) { return String(s || '').replace(/"/g, "'").replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

  const COLUMNS = {
    quickbooks: ['Journal No', 'Journal Date', 'Account Name', 'Debits', 'Credits', 'Description', 'Name'],
    sage: ['Header: date (mm-dd-yy), "source", "comment"', 'Detail: account number, amount (debit +, credit -), "comment", allocation lines (0)'],
    gl: ['Date', 'Journal No', 'Line', 'Account number', 'Account name', 'Account type', 'Debit', 'Credit', 'Description', 'Day status']
  };
  /** { name, text, mime, lines } for a built result in a format. */
  function file(res, format, set) {
    set = set || settings();
    const f = FORMATS[format] || FORMATS.gl;
    const days = res.days;
    const span = days.length ? days[0].date + (days.length > 1 ? '-to-' + days[days.length - 1].date : '') : 'none';
    const name = 'stboniface-journal-' + f.id + '-' + span + '.' + f.ext;
    let text = '', n = 0;
    if (format === 'quickbooks') {
      const rows = [COLUMNS.quickbooks];
      days.forEach(function (j) { j.lines.forEach(function (l) { n++; rows.push([j.no, fmtDate(j.date, set.dateFmt), l.account ? l.account.name : '', l.debit ? amt(l.debit) : '', l.credit ? amt(l.credit) : '', l.memo, l.ar ? set.arName : '']); }); });
      text = toCSV(rows);
    } else if (format === 'sage') {
      const out = [];
      days.forEach(function (j) {
        out.push(fmtDate(j.date, 'mm-dd-yy') + ',"' + sageText(j.no, 20) + '","' + sageText('St. Boniface daily close ' + j.date, 75) + '"');
        j.lines.forEach(function (l) { n++; out.push(sageText(l.account ? l.account.number : '', 20) + ',' + (l.debit ? amt(l.debit) : '-' + amt(l.credit)) + ',"' + sageText(l.memo, 75) + '",0'); });
      });
      text = out.join('\r\n') + '\r\n';
    } else {
      const rows = [COLUMNS.gl];
      days.forEach(function (j) { j.lines.forEach(function (l, i) { n++; rows.push([j.date, j.no, i + 1, l.account ? l.account.number : '', l.account ? l.account.name : '', l.account ? TYPE_LABEL[l.account.type] || l.account.type : '', l.debit ? amt(l.debit) : '', l.credit ? amt(l.credit) : '', l.memo, j.status === 'closed' ? 'Closed' : j.status === 'reopened' ? 'Reopened' : 'Not closed']); }); });
      text = toCSV(rows);
    }
    return { name: name, text: text, mime: f.mime, lines: n };
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------------- Shared bits of UI ---------------- */
  function statusBadge(j) {
    if (j.status === 'closed') return ui.badge('Closed', 'good');
    if (j.status === 'reopened') return ui.badge('Reopened', 'warn');
    return ui.badge('Not closed', 'outline');
  }
  /** Switch to another tab of the Accounting page (B's tab strip), whatever its markup; falls back to the route. */
  function goTab(id, panel) {
    const page = (panel && panel.closest('main, #view')) || document;
    const sel = ['[data-tab="' + id + '"]', '[data-acc-tab="' + id + '"]', '[data-id="' + id + '"][role=tab]', '[aria-controls$="' + id + '"][role=tab]'];
    for (let i = 0; i < sel.length; i++) { const b = page.querySelector(sel[i]); if (b && !(panel && panel.contains(b))) { b.click(); return; } }
    Club.app.go('accounting/' + id);
  }
  /** Re-runs fn when any of the keys change, while the panel is on the page (unsubscribes itself once it is gone). */
  function watch(panel, keys, fn) {
    let t = null, unsubs = [];
    const stop = function () { clearTimeout(t); unsubs.forEach(function (u) { u(); }); unsubs = []; };
    unsubs = keys.map(function (k) {
      return S.subscribe(k, function () {
        if (!panel.isConnected) { stop(); return; }
        clearTimeout(t); t = setTimeout(function () { if (panel.isConnected) fn(); else stop(); }, 120);
      });
    });
    return stop;
  }
  function setErr(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid');
    const host = f.closest('.field') || f.parentNode;
    host.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }
  /* Club.pickers hides a select or date input and forwards its focus to the visible button. */
  function focusErr(form) { const f = ui.$('.invalid', form); if (f) f.focus(); }

  /* ---------------- Export tab ---------------- */
  const state = { format: 'quickbooks', mode: 'closed', from: null, to: null, skip: true, open: {} };
  function defaultRange() {
    const t = today(), floor = addDays(t, -(MAX_DAYS - 1));
    const closes = S.all('dailyCloses').filter(function (c) { return c.status === 'closed' && c.date >= floor && c.date <= t; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    const pending = closes.filter(function (c) { return !(c.exports && c.exports[state.format]); });
    const from = pending.length ? pending[0].date : closes.length ? closes[Math.max(0, closes.length - 14)].date : addDays(t, -13);
    return { from: from, to: t };
  }

  function exportTab(panel) {
    if (!state.from) { const r = defaultRange(); state.from = r.from; state.to = r.to; }
    panel.classList.add('acx');
    const set = settings();
    panel.innerHTML = '<div class="grid grid-main-side acx-grid">' +
      '<div class="stack acx-main">' +
        '<section class="panel acx-controls" data-reveal><div class="panel-head"><div><div class="eyebrow">Accounting export</div><h3>Journal entries for your books</h3></div></div>' +
        '<div class="panel-body"><form novalidate onsubmit="return false" class="acx-form">' +
          '<div class="field acx-seg"><span class="label-caps" id="acx-fmt-l">Format</span><div role="group" aria-labelledby="acx-fmt-l">' +
            ui.segmented(Object.keys(FORMATS).map(function (k) { return { value: k, label: FORMATS[k].label }; }), state.format, 'format') + '</div></div>' +
          '<div class="field acx-seg"><span class="label-caps" id="acx-mode-l">Days</span><div role="group" aria-labelledby="acx-mode-l">' +
            ui.segmented([{ value: 'closed', label: 'Closed days only' }, { value: 'range', label: 'Every day in range' }], state.mode, 'mode') + '</div></div>' +
          '<div class="form-grid acx-dates">' +
            ui.field({ label: 'From', name: 'from', type: 'date', value: state.from, required: true }) +
            ui.field({ label: 'To', name: 'to', type: 'date', value: state.to, required: true }) +
            '<div class="field acx-datefmt"' + (state.format === 'quickbooks' ? '' : ' hidden') + '>' +
              '<label for="acx-datefmt">Journal date format</label><select class="select" id="acx-datefmt" name="dateFmt">' + ui.options(DATE_FORMATS, set.dateFmt) + '</select>' +
              '<span class="field-hint">Match your QuickBooks company settings (Advanced, Other preferences, Date format).</span></div>' +
          '</div>' +
          '<label class="check acx-skip"><input type="checkbox" name="skip"' + (state.skip ? ' checked' : '') + '> <span>Leave out days already exported in this format</span></label>' +
        '</form></div></section>' +
        '<div class="acx-stats" aria-live="polite"></div>' +
        '<section class="panel acx-preview" data-reveal><div class="panel-head"><div><div class="eyebrow">Preview</div><h3>Journal by day</h3></div><div class="acx-dl"></div></div>' +
          '<div class="panel-body acx-preview-body"></div></section>' +
      '</div>' +
      '<aside class="stack acx-side">' +
        '<section class="panel acx-connect" data-reveal><div class="panel-body">' +
          '<div class="acx-connect-head">' + Club.icon('link') + '<div><div class="eyebrow">Live connection</div><h3>Connect to QuickBooks</h3></div></div>' +
          '<p class="ink-2">A live connection would send each closed day straight to the club’s books. It waits on the owner confirming which accounting software the club uses, and it would need a small server to keep the sign-in safe, so nothing connects from this browser yet.</p>' +
          '<p class="muted acx-small">Until then, download the file here and import it in your accounting software.</p>' +
          '<button type="button" class="btn" disabled aria-disabled="true">' + Club.icon('link') + '<span>Connect to QuickBooks</span></button>' +
          '<span class="badge outline acx-connect-badge">Waiting on the owner</span>' +
        '</div></section>' +
        '<section class="panel acx-rules" data-reveal><div class="panel-head"><div><div class="eyebrow">Assumptions</div><h3>How the journal is built</h3></div></div><div class="panel-body acx-rules-body"></div></section>' +
        '<section class="panel acx-layout" data-reveal><div class="panel-head"><div><div class="eyebrow">File layout</div><h3 class="acx-layout-title"></h3></div></div><div class="panel-body acx-layout-body"></div></section>' +
      '</aside></div>' +
      '<section class="panel acx-history" data-reveal><div class="panel-head"><div><div class="eyebrow">Export history</div><h3>Files downloaded</h3></div></div><div class="panel-body flush acx-history-body"></div></section>';

    const form = ui.$('.acx-form', panel);
    let res = null;

    function rulesHTML() {
      const s = settings(), rate = Club.taxRate(), pct = Math.round(rate * 10000) / 100;
      const gst = Math.round(Math.min(GST_RATE, rate) * 10000) / 100, pst = Math.round((rate - Math.min(GST_RATE, rate)) * 10000) / 100;
      const taxed = DEPTS.filter(function (d) { return s.taxed[d.id]; }).map(function (d) { return d.label.toLowerCase().replace('gallery taphouse & grill', 'Gallery'); });
      const untaxed = DEPTS.filter(function (d) { return !s.taxed[d.id]; }).map(function (d) { return d.label.toLowerCase(); });
      const items = [
        'Prices include tax. GST (' + gst + '%) and PST (' + pst + '%) are taken out of each day’s taxed sales using the ' + pct + '% rate in Settings.',
        'Taxed: ' + (taxed.length ? taxed.join(', ') : 'none') + '. Not taxed: ' + (untaxed.length ? untaxed.join(', ') : 'none') + '. Change this in Account mapping.',
        'Gift card sales are not taxed: they go to the gift card liability, and a card redeemed later moves the amount from the liability to revenue.',
        'Member account sales and dues: debit member A/R, credit revenue and tax, on the charge date. Member payments: debit cash, bank or card clearing, credit A/R.',
        'Wedding, function and outing deposits go to customer deposits, a liability.',
        'Card and online card go to clearing accounts. Card batch differences are not posted: reconcile clearing to the processor deposit.',
        'Cash over/short from a closed day (counted minus expected) goes to the over/short account. Cash rounded to 5 cents at the till (no pennies) goes to rounding differences.',
        'Promo codes: sales are grossed up and the discount, before tax, is debited to promo discounts.',
        'One entry per day, summarised by account and rounded to cents. A difference of ' + money(ROUND_TOL) + ' or less goes on a Rounding adjustment line; anything larger blocks the download.'
      ];
      return '<ul class="acx-list">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<p class="muted acx-small">Default chart and rules: confirm with your accountant before the first import.</p>';
    }
    function layoutHTML() {
      if (state.format === 'quickbooks') {
        return '<p class="acx-small ink-2">A CSV for QuickBooks Online, Import data, Journal entries. One row per line; rows with the same Journal No make one entry.</p>' +
          '<p class="acx-cols">' + COLUMNS.quickbooks.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</p>' +
          '<ul class="acx-list"><li>Intuit lists Journal No, Journal Date, Account Name, Debits, Credits and Description; Name is required on lines posted to an Accounts receivable account.</li>' +
          '<li>Accounts are matched by name, so turn account numbers off in QuickBooks before importing, as Intuit advises. Sub-accounts are written Parent:Sub.</li>' +
          '<li>Assumed, not confirmed against Intuit’s sample file: the exact header spelling, the column order and the date format. QuickBooks lets you match columns during the import.</li>' +
          '<li>Member A/R is meant to be an other current asset in QuickBooks (members’ balances stay in Billing). If it is an Accounts receivable account, set a customer name in Account mapping.</li></ul>';
      }
      if (state.format === 'sage') {
        return '<p class="acx-small ink-2">A comma-separated text file for Sage 50 Canadian Edition, File, Import/Export, Import Transactions, General Journal entries.</p>' +
          '<ul class="acx-list"><li>Each day starts with a header line: <code>mm-dd-yy,"source","comment"</code> (source up to 20 characters, comment up to 75).</li>' +
          '<li>Then one detail line per account: <code>account number,amount,"comment",0</code>. Debits are positive, credits negative, and each entry sums to zero. The 0 means no project allocation.</li>' +
          '<li>Sage 50 expects four-digit account numbers. Tax is posted straight to the GST and PST accounts (no tax detail lines), so it does not feed Sage’s tax reports.</li>' +
          '<li>Sage imports entries to its linked receivables account only from an accountant’s copy: map member A/R to an account that is not linked.</li>' +
          '<li>Layout from Sage’s help, Importing General Journal Entries. Not yet tried in the club’s own Sage file.</li></ul>';
      }
      return '<p class="acx-small ink-2">A plain CSV any accountant or spreadsheet can read: one row per journal line, dates as yyyy-mm-dd.</p>' +
        '<p class="acx-cols">' + COLUMNS.gl.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</p>';
    }

    function readDates() {
      clearErrs(form);
      const v = ui.formData(form);
      let ok = true;
      if (!isoOk(v.from)) { setErr(form, 'from', 'Choose a start date.'); ok = false; }
      if (!isoOk(v.to)) { setErr(form, 'to', 'Choose an end date.'); ok = false; }
      if (ok && v.from > today()) { setErr(form, 'from', 'The start date cannot be in the future.'); ok = false; }
      if (ok && v.to < v.from) { setErr(form, 'to', 'The end date must be on or after the start date.'); ok = false; }
      if (ok && daysBetween(v.from, v.to) >= MAX_DAYS) { setErr(form, 'to', 'Export up to ' + MAX_DAYS + ' days at a time.'); ok = false; }
      if (ok) { state.from = v.from; state.to = v.to; }
      return ok;
    }

    function dayHTML(j) {
      const open = state.open[j.date] != null ? state.open[j.date] : !j.balanced;
      const exp = j.close && j.close.exports ? j.close.exports[state.format] : null;
      const rows = j.lines.map(function (l) {
        return '<tr' + (l.rounding ? ' class="acx-round"' : '') + '><td class="acx-acct">' + (l.account ? '<span class="num">' + esc(l.account.number) + '</span> ' + esc(l.account.name) : '<span class="acx-bad">' + esc('Not mapped') + '</span>') + '</td>' +
          '<td class="acx-memo">' + esc(l.memo) + '</td><td class="num">' + (l.debit ? esc(money(l.debit)) : '') + '</td><td class="num">' + (l.credit ? esc(money(l.credit)) : '') + '</td></tr>';
      }).join('');
      const check = j.balanced ? ui.badge(j.rounding ? 'Balanced, rounded ' + money(Math.abs(j.rounding)) : 'Balanced', 'good') : ui.badge(j.diff ? 'Out by ' + money(Math.abs(j.diff)) : 'Needs attention', 'bad');
      return '<details class="acx-day' + (j.balanced ? '' : ' is-bad') + '" data-day="' + esc(j.date) + '"' + (open ? ' open' : '') + '>' +
        '<summary><span class="acx-day-when"><span class="acx-chev">' + Club.icon('chevronRight') + '</span><span class="acx-day-date">' + esc(fmt.weekday ? fmt.weekday(j.date) + ', ' + fmt.date(j.date) : fmt.date(j.date)) + '</span></span>' +
          '<span class="acx-day-badges">' + statusBadge(j) + (exp ? ui.badge('Exported ' + fmt.dateShort(exp.slice(0, 10)), 'info') : '') + check + '</span>' +
          '<span class="acx-day-tot num">' + esc(money(j.debit)) + '</span></summary>' +
        '<div class="acx-day-body"><p class="muted acx-small">Journal ' + esc(j.no) + ' · ' + j.counts.receipts + ' ' + plural(j.counts.receipts, 'receipt') + ', ' + j.counts.charges + ' account ' + plural(j.counts.charges, 'charge') + ', ' + j.counts.payments + ' member ' + plural(j.counts.payments, 'payment') + '</p>' +
          (j.issues.length ? '<ul class="acx-issues">' + j.issues.slice(0, 8).map(function (i) { return '<li>' + Club.icon('alert') + '<span>' + esc(i.text) + '</span></li>'; }).join('') + (j.issues.length > 8 ? '<li class="muted">and ' + (j.issues.length - 8) + ' more</li>' : '') + '</ul>' : '') +
          (j.lines.length ? '<div class="table-wrap"><table class="table acx-jt"><thead><tr><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>' + rows + '</tbody>' +
            '<tfoot><tr><td colspan="2">Totals' + (j.balanced ? '' : ' <span class="acx-bad">· out by ' + esc(money(Math.abs(j.diff))) + '</span>') + '</td><td class="num">' + esc(money(j.debit)) + '</td><td class="num">' + esc(money(j.credit)) + '</td></tr></tfoot></table></div>' : '') +
        '</div></details>';
    }

    function blockReason() {
      if (!res || res.error) return '';
      if (!res.mapping.ok) return res.mapping.missing + ' account ' + plural(res.mapping.missing, 'mapping needs', 'mappings need') + ' an account before you can download.';
      if (!res.days.length) return '';
      if (res.unbalanced) return res.unbalanced + ' ' + plural(res.unbalanced, 'day does', 'days do') + ' not balance. Fix ' + plural(res.unbalanced, 'it', 'them') + ' or leave ' + plural(res.unbalanced, 'it', 'them') + ' out of the range.';
      return '';
    }

    function draw() {
      ui.$('.acx-datefmt', panel).hidden = state.format !== 'quickbooks';
      ui.$('.acx-rules-body', panel).innerHTML = rulesHTML();
      ui.$('.acx-layout-title', panel).textContent = FORMATS[state.format].label;
      ui.$('.acx-layout-body', panel).innerHTML = layoutHTML();
      const body = ui.$('.acx-preview-body', panel), stats = ui.$('.acx-stats', panel), dl = ui.$('.acx-dl', panel);
      if (!readDates()) { res = null; body.innerHTML = ui.empty({ icon: 'calendar', title: 'Choose a date range', text: 'Fix the dates above to see the journal.' }); stats.innerHTML = ''; dl.innerHTML = ''; return; }
      res = build({ mode: state.mode, from: state.from, to: state.to, skip: state.skip, format: state.format });
      if (res.error === 'noAccounting') {
        stats.innerHTML = ''; dl.innerHTML = '';
        body.innerHTML = ui.empty({ icon: 'billing', title: 'Daily close is not available', text: 'The journal is built from the daily close. It will appear here once the Daily close tab is working.' });
        return;
      }
      const f = FORMATS[state.format];
      stats.innerHTML = ui.stats([
        { label: 'Days in file', value: String(res.days.length), meta: res.empty.length ? esc(res.empty.length + ' with no activity left out') : (state.mode === 'closed' ? 'Closed days' : 'Days with activity') },
        { label: 'Journal lines', value: fmt.num(res.lines) },
        { label: 'Total debits', value: money(res.debit), meta: 'Equal to credits when balanced' },
        { label: 'Out of balance', value: String(res.unbalanced), meta: res.unbalanced ? 'Download blocked' : 'Ready' }
      ]);
      const reason = blockReason();
      const can = !reason && res.days.length > 0;
      dl.innerHTML = '<button type="button" class="btn btn-primary btn-sm" data-action="acx-download"' + (can ? '' : ' disabled aria-disabled="true"') + '>' + Club.icon('download') + '<span>Download ' + esc(f.short) + ' file</span></button>';
      let note = '';
      if (reason) note = '<div class="acx-block" role="status">' + Club.icon('alert') + '<span>' + esc(reason) + '</span>' + (!res.mapping.ok ? ui.btn('Open account mapping', { sm: true, kind: 'ghost', action: 'acx-go-mapping' }) : '') + '</div>';
      const skipped = res.exported.length ? '<p class="muted acx-small acx-skipped">' + res.exported.length + ' ' + plural(res.exported.length, 'day was', 'days were') + ' already exported to ' + esc(f.short) + ' and left out. Untick “Leave out days already exported” to export ' + plural(res.exported.length, 'it', 'them') + ' again.</p>' : '';
      if (!res.days.length) {
        let title = 'Nothing to export', text;
        if (res.exported.length) { title = 'All caught up'; text = 'Every ' + (state.mode === 'closed' ? 'closed ' : '') + 'day with activity in this range is already exported to ' + f.short + '.'; }
        else if (state.mode === 'closed' && !res.empty.length) { title = 'No closed days in this range'; text = 'Close a day on the Daily close tab, or choose Every day in range to preview days that are still open.'; }
        else text = 'There is no activity on ' + (state.mode === 'closed' ? 'the closed days' : 'the days') + ' in this range.';
        body.innerHTML = note + ui.empty({ icon: 'reports', title: title, text: text }) + skipped;
        return;
      }
      const sageWarn = state.format === 'sage' ? accounts().filter(function (a) { return !/^\d{4}$/.test(a.number); }) : [];
      body.innerHTML = note +
        (state.mode === 'range' && res.days.some(function (j) { return j.status !== 'closed'; }) ? '<p class="acx-warn">' + Club.icon('info') + '<span>Some days are not closed: their totals can still change and they have no cash over/short.</span></p>' : '') +
        (sageWarn.length ? '<p class="acx-warn">' + Club.icon('info') + '<span>Sage 50 expects four-digit account numbers. Check ' + esc(sageWarn.slice(0, 4).map(function (a) { return a.number + ' ' + a.name; }).join(', ')) + (sageWarn.length > 4 ? ' and ' + (sageWarn.length - 4) + ' more' : '') + '.</span></p>' : '') +
        '<div class="acx-days">' + res.days.map(dayHTML).join('') + '</div>' + skipped;
    }

    function historyHTML() {
      const list = S.all('accountingExports').slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
      if (!list.length) return ui.empty({ icon: 'download', title: 'No exports yet', text: 'Each file you download is listed here with its days and totals.' });
      return '<div class="table-wrap"><table class="table acx-hist"><thead><tr><th>Downloaded</th><th>Format</th><th>Days</th><th class="num">Lines</th><th class="num">Debits</th><th>By</th></tr></thead><tbody>' +
        list.slice(0, 50).map(function (x) {
          const d = new Date(x.at), days = Array.isArray(x.days) ? x.days : [];
          return '<tr><td class="nowrap">' + esc(fmt.date(S.iso(d))) + '<span class="muted">, ' + esc(fmt.time(d)) + '</span></td>' +
            '<td>' + esc((FORMATS[x.format] || { label: x.format }).label) + '<div class="muted acx-small">' + esc(x.file || '') + '</div></td>' +
            '<td>' + days.length + ' ' + plural(days.length, 'day') + '<div class="muted acx-small">' + esc(days.length ? fmt.dateShort(days[0]) + (days.length > 1 ? ' to ' + fmt.dateShort(days[days.length - 1]) : '') : '') + (x.mode === 'range' ? ' · date range' : ' · closed days') + '</div></td>' +
            '<td class="num">' + fmt.num(x.lines || 0) + '</td><td class="num">' + esc(fmt.money(x.total || 0)) + '</td><td>' + esc(x.by || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (list.length > 50 ? '<p class="muted acx-small acx-pad">Showing the latest 50 of ' + list.length + '.</p>' : '');
    }
    function drawHistory() { ui.$('.acx-history-body', panel).innerHTML = historyHTML(); }

    function doDownload() {
      if (!res || res.error) return;
      const reason = blockReason();
      if (reason) { ui.toast(reason, 'bad'); return; }
      if (!res.days.length) { ui.toast('Nothing to export in this range', 'bad'); return; }
      const f = FORMATS[state.format];
      const again = res.days.filter(function (j) { return j.close && j.close.exports && j.close.exports[state.format]; });
      const go = function () {
        const fresh = build({ mode: state.mode, from: state.from, to: state.to, skip: state.skip, format: state.format });
        if (fresh.unbalanced || !fresh.mapping.ok || !fresh.days.length) { ui.toast('The journal changed. Check the preview and try again', 'bad'); draw(); return; }
        const out = file(fresh, state.format);
        download(out.name, out.text, out.mime);
        const at = new Date().toISOString();
        fresh.days.forEach(function (j) {
          if (!j.close || !j.close.id || !S.find('dailyCloses', j.close.id)) return;
          const cur = S.find('dailyCloses', j.close.id), ex = Object.assign({}, cur.exports || {}); ex[state.format] = at;
          S.update('dailyCloses', j.close.id, { exports: ex });
        });
        S.insert('accountingExports', { id: S.uid('axp'), at: at, by: staffName(), format: state.format, mode: state.mode, from: state.from, to: state.to,
          days: fresh.days.map(function (j) { return j.date; }), lines: out.lines, total: fresh.debit / 100, file: out.name });
        ui.toast(f.short + ' file downloaded: ' + fresh.days.length + ' ' + plural(fresh.days.length, 'day') + ', ' + out.lines + ' lines');
      };
      if (again.length) {
        ui.confirm({ title: 'Export these days again?', text: again.length + ' of these ' + plural(again.length, 'day was', 'days were') + ' already exported to ' + f.short + '. Importing ' + plural(again.length, 'it', 'them') + ' again would post ' + plural(again.length, 'it', 'them') + ' twice in your books.', confirmLabel: 'Download again' })
          .then(function (yes) { if (yes) go(); });
      } else {
        /* A downloaded file cannot be taken back, so exports ask first instead of offering Undo. */
        ui.confirm({ title: 'Download the ' + f.short + ' file?', text: res.days.length + ' ' + plural(res.days.length, 'day is', 'days are') + ' included and will be marked as exported. A file cannot be undone once it is imported, so check the preview first.', confirmLabel: 'Download file' })
          .then(function (yes) { if (yes) go(); });
      }
    }

    ui.on(panel, 'click', '.acx-form .segmented button', function (e, b) {
      const seg = b.closest('.segmented'), name = seg.dataset.name;
      ui.$$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (name === 'format') state.format = b.dataset.value;
      if (name === 'mode') state.mode = b.dataset.value;
      draw();
    });
    ui.on(panel, 'change', '.acx-form [name=from], .acx-form [name=to]', function () { draw(); });
    ui.on(panel, 'change', '.acx-form [name=skip]', function (e, c) { state.skip = c.checked; draw(); });
    ui.on(panel, 'change', '.acx-form [name=dateFmt]', function (e, s) { undoRun(function () { saveSettings({ dateFmt: s.value }); }, { message: 'QuickBooks date format set to ' + s.value, undone: 'Date format put back' }); });
    ui.on(panel, 'click', '[data-action=acx-download]', doDownload);
    ui.on(panel, 'click', '[data-action=acx-go-mapping]', function () { goTab('mapping', panel); });
    panel.addEventListener('toggle', function (e) { const d = e.target; if (d && d.matches && d.matches('details.acx-day')) state.open[d.dataset.day] = d.open; }, true);
    ui.$$('.acx-form .segmented button', panel).forEach(function (x) { x.setAttribute('aria-pressed', x.classList.contains('active') ? 'true' : 'false'); });

    draw(); drawHistory();
    const stopA = watch(panel, ['dailyCloses', 'receipts', 'charges', 'payments', '$glAccounts', '$glMapping', '$glExportSettings', '$taxRate'], draw);
    const stopB = watch(panel, ['accountingExports'], drawHistory);
    return function () { stopA(); stopB(); };
  }

  /* ---------------- Account mapping tab ---------------- */
  function accountModal(acc, after) {
    const accs = accounts(), isNew = !acc;
    const used = acc ? usage(acc.id, mapping()) : [];
    const body = '<form class="form-grid" novalidate onsubmit="return false">' +
      ui.field({ label: 'Account number', name: 'number', value: acc ? acc.number : '', required: true, placeholder: '4210', hint: 'Digits only. Sage 50 imports four-digit numbers.' }) +
      ui.field({ label: 'Type', name: 'type', type: 'select', options: ui.options(TYPES, acc ? acc.type : 'income'), required: true }) +
      ui.field({ label: 'Account name', name: 'name', value: acc ? acc.name : '', required: true, span2: true, placeholder: 'Simulator rentals', hint: 'Exactly as in your accounting software: QuickBooks matches accounts by name. Write a sub-account as Parent:Sub.' }) +
      (used.length ? '<p class="span-2 muted acx-small">Used by ' + esc(used.map(function (r) { return r.label; }).join(', ')) + '.</p>' : '') + '</form>';
    ui.modal({ eyebrow: 'Chart of accounts', title: isNew ? 'Add account' : 'Edit ' + acc.number + ' ' + acc.name, body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: isNew ? 'Add account' : 'Save account', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); clearErrs(form);
        const v = ui.formData(form);
        let ok = ui.validate(form);
        const number = String(v.number || '').trim(), name = String(v.name || '').replace(/\s+/g, ' ').trim();
        const others = accs.filter(function (a) { return !acc || a.id !== acc.id; });
        if (number && !/^\d{1,10}$/.test(number)) { setErr(form, 'number', 'Use digits only, up to 10.'); ok = false; }
        else if (number && others.some(function (a) { return a.number === number; })) { setErr(form, 'number', 'Another account already has number ' + number + '.'); ok = false; }
        if (name && name.length > 100) { setErr(form, 'name', 'Keep the name under 100 characters.'); ok = false; }
        else if (name && others.some(function (a) { return a.name.toLowerCase() === name.toLowerCase(); })) { setErr(form, 'name', 'Another account already has this name.'); ok = false; }
        if (!TYPE_LABEL[v.type]) { setErr(form, 'type', 'Choose a type.'); ok = false; }
        if (!ok) { focusErr(form); return false; }
        const list = accounts();
        if (isNew) list.push({ id: S.uid('gl'), number: number, name: name, type: v.type });
        else { const i = list.findIndex(function (a) { return a.id === acc.id; }); if (i < 0) { ui.toast('That account was removed', 'bad'); return; } list[i] = Object.assign({}, list[i], { number: number, name: name, type: v.type }); }
        list.sort(byNumber);
        undoRun(function () { S.setObj('glAccounts', list); }, { message: 'Account ' + number + ' ' + name + (isNew ? ' added' : ' saved'), undone: isNew ? 'Account removed again' : 'Account put back as it was' });
        if (after) after();
      } }] });
  }

  function mappingTab(panel) {
    panel.classList.add('acx');
    let dirty = null;   /* unsaved mapping form values, kept across redraws */

    function readForm() {
      const form = ui.$('.acx-map-form', panel); if (!form) return null;
      const v = { map: {}, taxed: {}, arName: '' };
      MAP_ROWS.forEach(function (r) { const s = form.querySelector('[name="m:' + r.key + '"]'); v.map[r.key] = s ? s.value : ''; });
      DEPTS.forEach(function (d) { const c = form.querySelector('[name="t:' + d.id + '"]'); v.taxed[d.id] = !!(c && c.checked); });
      const n = form.querySelector('[name=arName]'); v.arName = n ? n.value.trim() : '';
      return v;
    }
    function options(accs, sel) {
      const groups = TYPES.map(function (t) {
        const list = accs.filter(function (a) { return a.type === t.value; });
        return list.length ? '<optgroup label="' + esc(t.label) + '">' + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.number + ' · ' + a.name) + '</option>'; }).join('') + '</optgroup>' : '';
      }).join('');
      return '<option value="">Choose an account</option>' + groups;
    }

    function draw() {
      const accs = accounts().sort(byNumber), saved = mapping(), set = settings();
      const cur = dirty || { map: saved, taxed: set.taxed, arName: set.arName };
      const check = validate(accs, cur.map);
      const isDef = isDefaultChart();
      const mapCount = {}; MAP_ROWS.forEach(function (r) { const id = saved[r.key]; if (id) mapCount[id] = (mapCount[id] || 0) + 1; });

      const chart = '<section class="panel acx-chart" data-reveal><div class="panel-head"><div><div class="eyebrow">Chart of accounts</div><h3>Accounts</h3></div>' +
        '<div class="row wrap acx-head-actions">' + ui.btn('Reset to defaults', { sm: true, kind: 'ghost', icon: 'refresh', action: 'acx-reset' }) + ui.btn('Add account', { sm: true, kind: 'primary', icon: 'plus', action: 'acx-add' }) + '</div></div>' +
        '<div class="panel-body acx-def"><p class="acx-ph">' + Club.icon('info') + '<span><strong>' + (isDef ? 'Default chart, confirm with your accountant.' : 'Edited from the default chart.') + '</strong> A starting chart for a small Canadian golf club. Match the numbers and names to the club’s books before the first import.</span></p></div>' +
        '<div class="panel-body flush">' + (accs.length ? '<div class="table-wrap"><table class="table acx-accts"><thead><tr><th>Number</th><th>Name</th><th>Type</th><th class="num">Mapped</th><th><span class="acx-sr">Actions</span></th></tr></thead><tbody>' +
          accs.map(function (a) {
            const n = mapCount[a.id] || 0;
            return '<tr><td class="num nowrap">' + esc(a.number) + '</td><td class="primary-cell">' + esc(a.name) + '</td><td>' + esc(TYPE_LABEL[a.type] || a.type) + '</td><td class="num">' + (n ? n : '<span class="muted">0</span>') + '</td>' +
              '<td class="nowrap right">' + ui.btn('', { icon: 'edit', kind: 'ghost', sm: true, action: 'acx-edit', id: a.id, title: 'Edit ' + a.number + ' ' + a.name }) +
              (n ? '<span class="acx-del" data-tip="Mapped ' + n + ' ' + plural(n, 'time') + ': change the mapping first">' + ui.btn('', { icon: 'trash', kind: 'ghost', sm: true, action: 'acx-del', id: a.id, title: 'Cannot remove ' + a.number + ' ' + a.name + ': it is mapped' }).replace('<button', '<button disabled') + '</span>'
                : ui.btn('', { icon: 'trash', kind: 'ghost', sm: true, action: 'acx-del', id: a.id, title: 'Remove ' + a.number + ' ' + a.name })) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : ui.empty({ icon: 'billing', title: 'No accounts', text: 'Add accounts, or reset to the default chart.', action: ui.btn('Reset to defaults', { kind: 'primary', icon: 'refresh', action: 'acx-reset' }) })) + '</div></section>';

      const status = check.ok ? ui.badge('All ' + MAP_ROWS.length + ' mapped', 'good') : ui.badge(check.missing + ' to map', 'bad');
      const groups = MAP_GROUPS.map(function (g) {
        return '<fieldset class="acx-group"><legend>' + esc(g.title) + '</legend>' + (g.note ? '<p class="muted acx-small">' + esc(g.note) + '</p>' : '') +
          g.rows.map(function (r) {
            const id = 'acx-m-' + r.key.replace(/\./g, '-');
            const err = check.errors[r.key], warn = check.warnings[r.key];
            const label = r.drawer ? 'Cash, ' + drawerName(r.drawer) + ' drawer' : r.label;
            return '<div class="acx-map-row field"><div class="acx-map-label"><label for="' + id + '">' + esc(label) + ' *</label>' + (r.hint ? '<span class="field-hint">' + esc(r.hint) + '</span>' : '') + '</div>' +
              '<div class="acx-map-ctl"><select class="select' + (err && dirty ? ' invalid' : '') + '" id="' + id + '" name="m:' + esc(r.key) + '" required>' + options(accs, cur.map[r.key]) + '</select>' +
              (err && (dirty || cur.map[r.key]) ? '<span class="field-error">' + esc(err) + '</span>' : warn ? '<span class="field-hint acx-warn-hint">' + esc(warn) + '</span>' : '') + '</div>' +
              (r.dept ? '<label class="check acx-taxed"><input type="checkbox" name="t:' + esc(r.dept) + '"' + (cur.taxed[r.dept] ? ' checked' : '') + '> <span>Taxed</span></label>' : '') + '</div>';
          }).join('') + '</fieldset>';
      }).join('');
      const map = '<section class="panel acx-mapping" data-reveal><div class="panel-head"><div><div class="eyebrow">Account mapping</div><h3>Where each amount posts</h3></div>' + status + '</div>' +
        '<div class="panel-body"><form class="acx-map-form" novalidate onsubmit="return false">' + groups +
          '<fieldset class="acx-group"><legend>QuickBooks</legend>' + ui.field({ label: 'Customer name on A/R lines', name: 'arName', value: cur.arName, placeholder: 'Members (optional)', hint: 'QuickBooks needs a customer on lines posted to an Accounts receivable account. Leave blank when member A/R is an other current asset.' }) + '</fieldset>' +
          '<div class="row wrap acx-map-foot">' + ui.btn('Save mapping', { kind: 'primary', icon: 'check', action: 'acx-save' }) + (dirty ? ui.btn('Discard changes', { kind: 'ghost', action: 'acx-discard' }) : '') + (dirty ? '<span class="muted acx-small">Unsaved changes</span>' : '') + '</div>' +
        '</form></div></section>';

      const y = window.scrollY;
      panel.innerHTML = '<div class="acx-map-grid">' + chart + map + '</div>';
      ui.animateIn(panel);
      window.scrollTo(0, y);
    }

    function save() {
      const v = readForm(); if (!v) return;
      const check = validate(accounts(), v.map);
      if (!check.ok) {
        dirty = v; draw();
        const first = ui.$('.acx-map-form select.invalid', panel);
        if (first) first.focus();
        ui.toast(check.missing + ' ' + plural(check.missing, 'mapping needs', 'mappings need') + ' an account', 'bad');
        return;
      }
      if (v.arName.length > 100) { ui.toast('Keep the customer name under 100 characters', 'bad'); return; }
      dirty = null;
      undoRun(function () { S.setObj('glMapping', v.map); saveSettings({ taxed: v.taxed, arName: v.arName }); }, { message: 'Account mapping saved', undone: 'Mapping put back as it was' });
      draw();
    }

    ui.on(panel, 'change', '.acx-map-form select, .acx-map-form input', function () {
      const had = !!dirty; dirty = readForm();
      if (!had) { const foot = ui.$('.acx-map-foot', panel); if (foot && !ui.$('[data-action=acx-discard]', foot)) foot.insertAdjacentHTML('beforeend', ui.btn('Discard changes', { kind: 'ghost', action: 'acx-discard' }) + '<span class="muted acx-small">Unsaved changes</span>'); }
    });
    ui.on(panel, 'input', '.acx-map-form [name=arName]', function () { dirty = readForm(); });
    ui.on(panel, 'click', '[data-action=acx-save]', save);
    ui.on(panel, 'click', '[data-action=acx-discard]', function () { dirty = null; draw(); ui.toast('Changes discarded'); });
    ui.on(panel, 'click', '[data-action=acx-add]', function () { accountModal(null); });
    ui.on(panel, 'click', '[data-action=acx-edit]', function (e, b) { const a = accounts().find(function (x) { return x.id === b.dataset.id; }); if (a) accountModal(a); });
    ui.on(panel, 'click', '[data-action=acx-del]', function (e, b) {
      const a = accounts().find(function (x) { return x.id === b.dataset.id; }); if (!a) return;
      const pending = dirty ? MAP_ROWS.filter(function (r) { return dirty.map[r.key] === a.id; }) : [];
      const used = usage(a.id, mapping()).concat(pending);
      if (used.length) { ui.toast(a.number + ' ' + a.name + ' is mapped to ' + used[0].label + '. Change the mapping first', 'bad'); return; }
      ui.confirm({ title: 'Remove ' + a.number + ' ' + a.name + '?', text: 'It is not mapped to anything. Files already downloaded are not changed.', confirmLabel: 'Remove account', danger: true })
        .then(function (yes) {
          if (!yes) return;
          undoRun(function () { S.setObj('glAccounts', accounts().filter(function (x) { return x.id !== a.id; })); }, { message: 'Account ' + a.number + ' removed', undone: 'Account ' + a.number + ' restored' });
        });
    });
    ui.on(panel, 'click', '[data-action=acx-reset]', function () {
      ui.confirm({ title: 'Reset to the default chart?', text: 'Accounts you added or edited, the mapping and the taxed departments go back to the defaults. Export history is kept.', confirmLabel: 'Reset to defaults', danger: true })
        .then(function (yes) {
          if (!yes) return;
          dirty = null;
          undoRun(function () {
            S.setObj('glAccounts', clone(DEFAULT_ACCOUNTS));
            S.setObj('glMapping', clone(DEFAULT_MAP));
            saveSettings({ taxed: defaultSettings().taxed, arName: '' });
          }, { message: 'Chart of accounts and mapping reset to defaults', undone: 'Your chart and mapping are back' });
        });
    });

    draw();
    return watch(panel, ['$glAccounts', '$glMapping', '$glExportSettings'], draw);
  }

  /* ---------------- Register with the Accounting page ---------------- */
  const tabs = (window.__accountingTabs = window.__accountingTabs || []);
  tabs.push({ id: 'export', label: 'Export', order: 30, render: function (panel, ctx) { return exportTab(panel, ctx); } });
  tabs.push({ id: 'mapping', label: 'Account mapping', order: 40, render: function (panel, ctx) { return mappingTab(panel, ctx); } });

  Club.accountingExport = { accounts: accounts, mapping: mapping, settings: settings, validate: validate, journalFor: journalFor, build: build,
    file: file, toCSV: toCSV, MAP_ROWS: MAP_ROWS, DEPTS: DEPTS, DEFAULT_ACCOUNTS: DEFAULT_ACCOUNTS, DEFAULT_MAP: DEFAULT_MAP, FORMATS: FORMATS, COLUMNS: COLUMNS };
})();
