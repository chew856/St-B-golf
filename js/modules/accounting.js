/* Accounting: the daily close (cash drawers, card batch, sign-off) and close history. Administration, order 15.
   Owns: dailyCloses, $accountingSettings, $accountingDrafts (counts typed before sign-off), $depositReceiptsBackfilled,
   $dailyClosesSeeded. Reads receipts and, for till records that never got a receipt, sales, diningOrders, cartOrders and
   publicPayments. Other tabs (accounting export) join the page through window.__accountingTabs.

   Club.accounting (defined at load):
     DRAWERS                      [{ id: 'shop'|'gallery'|'cart', name }]
     DEPTS                        [{ id, label }] in report order; TENDERS [{ id, label }]
     classify(receipt)            -> { id, date, dept, drawer, online, sign, tenders: [{ method, amount, online }], total, kind,
                                       source, refId, no, at, title, name, synthetic }   tender amounts are positive; sign gives the direction
     summarize(date)              -> { date, receipts: [classified], count, byTender: { card, cash, gift, account, other, onlineCard },
                                       byDept: { dept: net }, drawers: { shop: { cash, card, gift, rounding }, … }, deposits: [...],
                                       memberPayments, giftCardsSold, refunds, credits, cashOutside, total, moneyTaken }
     closeFor(date) / isClosed(date)   the dailyCloses doc (or null) / true when status is 'closed'
     settings()                   { floats: { shop, gallery, cart }, tolerance }
     depositReceipt(source, record, dep) / depositReversed(source, record, dep) / depositReceiptFor(source, recordId, depId)
     openReport(date)             the printable Daily close report

   Tabs from other files: window.__accountingTabs.push({ id, label, order, render(panelEl, ctx) }); ctx = { date, params, go(path),
   refresh() }. Read at render time, sorted by order, after Daily close (10) and Close history (20). */
(function () {
  'use strict';
  window.__accountingTabs = window.__accountingTabs || [];
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;

  const COLL = 'dailyCloses';
  const DRAWERS = [{ id: 'shop', name: 'Golf shop' }, { id: 'gallery', name: 'Gallery Taphouse & Grill' }, { id: 'cart', name: 'Beverage cart' }];
  const DEPTS = [
    { id: 'golf', label: 'Golf' }, { id: 'proshop', label: 'Pro shop' }, { id: 'dining', label: 'Gallery Taphouse & Grill' },
    { id: 'takeout', label: 'Takeout' }, { id: 'cart', label: 'Beverage cart' }, { id: 'events', label: 'Events' }, { id: 'lessons', label: 'Lessons' },
    { id: 'giftcards', label: 'Gift cards sold' }, { id: 'dues', label: 'Dues' }, { id: 'payments', label: 'Member account payments' },
    { id: 'functions', label: 'Weddings & events deposits' }, { id: 'outings', label: 'Tournament & outing deposits' }, { id: 'other', label: 'Other' }
  ];
  const TENDERS = [
    { id: 'card', label: 'Card, shop terminal' }, { id: 'onlineCard', label: 'Card, online' }, { id: 'cash', label: 'Cash' },
    { id: 'gift', label: 'Gift card' }, { id: 'account', label: 'Member account' }, { id: 'other', label: 'Cheque, e-transfer, debit order' }
  ];
  /* Canadian cash: no pennies, so cash totals round to the nearest 5 cents. */
  const DENOMS = [
    { key: '100', cents: 10000, label: '$100' }, { key: '50', cents: 5000, label: '$50' }, { key: '20', cents: 2000, label: '$20' },
    { key: '10', cents: 1000, label: '$10' }, { key: '5', cents: 500, label: '$5' },
    { key: '2', cents: 200, label: '$2' }, { key: '1', cents: 100, label: '$1' }, { key: '0.25', cents: 25, label: '25¢' },
    { key: '0.10', cents: 10, label: '10¢' }, { key: '0.05', cents: 5, label: '5¢' }
  ];
  /* Placeholders: the club has not given its drawer floats. Changed under Drawer floats on the Daily close tab. */
  const DEFAULTS = { floats: { shop: 200, gallery: 300, cart: 150 }, tolerance: 5 };

  const SRC_DEPT = { teesheet: 'golf', public: 'golf', golf: 'golf', proshop: 'proshop', pos: 'proshop', shop: 'proshop', dining: 'dining',
    takeout: 'takeout', cart: 'cart', events: 'events', lessons: 'lessons', giftcards: 'giftcards', functions: 'functions', outings: 'outings' };
  const CAT_DEPT = { Dues: 'dues', Golf: 'golf', 'Pro Shop': 'proshop', Dining: 'dining', Events: 'events', Lessons: 'lessons', Other: 'other' };
  const SRC_DRAWER = { proshop: 'shop', pos: 'shop', teesheet: 'shop', giftcards: 'shop', desk: 'shop', shop: 'shop', dining: 'gallery', takeout: 'gallery', cart: 'cart' };
  const ONLINE_SRC = { public: 1, portal: 1, online: 1, shop: 1, takeout: 1 };
  const TENDER_OK = { card: 1, cash: 1, account: 1, gift: 1, other: 1 };

  /* ---------------- Small helpers ---------------- */
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function cents(v) { return Math.round((+v || 0) * 100); }
  function round5(v) { return Math.round(cents(v) / 5) * 5 / 100; }
  function today() { return Club.date.today(); }
  function money(v) { return esc(fmt.money(v)); }
  function deptLabel(id) { const d = DEPTS.find(function (x) { return x.id === id; }); return d ? d.label : 'Other'; }
  function drawerName(id) { const d = DRAWERS.find(function (x) { return x.id === id; }); return d ? d.name : 'Office'; }
  function staffName(id) { const s = id && S.find('staff', id); return s ? s.firstName + ' ' + s.lastName : 'Former staff'; }
  function midday(iso, minutes) { const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, minutes || 0).toISOString(); }
  function atOn(iso, hm) { const p = String(iso).split('-'), t = String(hm || '12:00').split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0] || 12, +t[1] || 0).toISOString(); }
  function validDate(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && !isNaN(fmt.toDate(iso)); }
  /** "$1.25 over", "$0.40 short", "Balanced". */
  function overShortText(v) { v = r2(v); return Math.abs(v) < 0.005 ? 'Balanced' : fmt.money(Math.abs(v)) + (v > 0 ? ' over' : ' short'); }
  function osKind(v, tol) { v = Math.abs(r2(v)); return v < 0.005 ? 'good' : v <= (tol == null ? settings().tolerance : tol) ? 'warn' : 'bad'; }
  function timeOf(iso) { const d = new Date(iso); return isNaN(d) ? '' : fmt.time(d); }

  function settings() {
    const s = S.getObj('accountingSettings', {}) || {};
    return { floats: Object.assign({}, DEFAULTS.floats, s.floats || {}), tolerance: s.tolerance == null ? DEFAULTS.tolerance : +s.tolerance };
  }

  /* ---------------- Lookups (cached until their collection changes) ---------------- */
  const cache = {};
  function cached(name, colls, build) {
    if (!cache[name]) {
      cache[name] = build();
      colls.forEach(function (c) { if (!cached.subs[c]) { cached.subs[c] = 1; S.subscribe(c, function () { Object.keys(cache).forEach(function (k) { if (cache[k].__colls.indexOf(c) >= 0) delete cache[k]; }); }); } });
      Object.defineProperty(cache[name], '__colls', { value: colls });
    }
    return cache[name];
  }
  cached.subs = {};
  /* Another browser tab changed the data: everything cached is stale. */
  S.subscribe('$external', function () { Object.keys(cache).forEach(function (k) { delete cache[k]; }); });
  /** Gift card amounts by the record they paid for: refId -> { redeem, refund }. */
  function giftByRef() {
    return cached('gift', ['giftCards'], function () {
      const out = {};
      S.all('giftCards').forEach(function (c) {
        (c.history || []).forEach(function (e) {
          if (!e.refId || (e.type !== 'redeem' && e.type !== 'refund')) return;
          const o = out[e.refId] = out[e.refId] || { redeem: 0, refund: 0 };
          o[e.type] = r2(o[e.type] + Math.abs(+e.amount || 0));
        });
      });
      return out;
    });
  }
  function byId(coll) { return cached('id:' + coll, [coll], function () { const o = {}; S.all(coll).forEach(function (d) { o[d.id] = d; }); return o; }); }

  /* ---------------- Classify one receipt ---------------- */
  function deptOf(r) {
    /* A member account payment only when paymentId is a real 'payments' doc: tee sheet shop receipts carry their own
       paymentId ('tsp_…') just to keep two identical payments apart, and they are golf revenue. */
    if ((r.paymentId && byId('payments')[r.paymentId]) || (!r.paymentId && r.title === 'Account payment')) return 'payments';
    if (SRC_DEPT[r.source]) return SRC_DEPT[r.source];
    const ch = r.chargeId ? byId('charges')[r.chargeId] : null;
    if (ch) return CAT_DEPT[ch.category] || 'other';
    return r.source === 'billing' ? 'dues' : 'other';
  }
  function onlineOf(r) {
    if (r.channel === 'online') return true;
    if (r.channel === 'counter') return false;
    if (Array.isArray(r.tenders) && r.tenders.some(function (t) { return t.online; })) return true;
    if (ONLINE_SRC[r.source]) return true;
    if (r.source === 'giftcards' && r.refId) { const c = byId('giftCards')[r.refId]; return !!c && (c.source === 'public' || c.source === 'portal'); }
    return false;
  }
  /** How the money was taken, for receipts made before tenders were recorded. */
  function deriveTenders(r, online) {
    const total = r2(r.total), credit = r.kind === 'credit';
    let gift = 0;
    if (r.source === 'public' && r.refId) { const p = byId('publicPayments')[r.refId]; if (p && +p.giftAmount > 0) gift = r2(p.giftAmount); }
    if (!gift && r.refId) { const g = giftByRef()[r.refId]; if (g) gift = credit ? g.refund : g.redeem; }
    gift = Math.min(gift, total);
    const rest = r2(total - gift);
    let m = r.method;
    if (m === 'other' && r.source === 'public') m = 'card';
    if (m === 'other' && /^cash/i.test(r.methodLabel || '')) m = 'cash';
    if (!TENDER_OK[m]) m = 'other';
    const out = [];
    if (gift > 0) out.push({ method: 'gift', amount: gift, online: online });
    if (rest > 0) out.push({ method: m, amount: rest, online: online });
    return out;
  }
  function classify(r) {
    if (!r) return null;
    const online = onlineOf(r);
    const total = r2(r.total);
    let tenders;
    if (Array.isArray(r.tenders) && r.tenders.length) {
      tenders = r.tenders.map(function (t) { return { method: TENDER_OK[t.method] ? t.method : 'other', amount: r2(t.amount), online: !!t.online || (online && t.method === 'card') }; });
      /* Whatever the tenders do not explain is taken the receipt's own way. */
      const gap = r2(total - tenders.reduce(function (a, t) { return a + t.amount; }, 0));
      if (gap > 0.004) tenders.push({ method: TENDER_OK[r.method] ? r.method : 'other', amount: gap, online: online });
    } else tenders = deriveTenders(r, online);
    const drawer = online ? null : (SRC_DRAWER[r.source] || null);
    return { id: r.id, no: r.no || null, at: r.at || null, date: r.date, dept: deptOf(r), drawer: drawer, online: online, sign: r.kind === 'credit' ? -1 : 1,
      tenders: tenders, total: total, kind: r.kind === 'credit' ? 'credit' : 'sale', source: r.source || 'other', refId: r.refId || null,
      title: r.title || '', name: r.name || '', synthetic: !!r.synthetic };
  }

  /* ---------------- Till records that never got a receipt ----------------
     Pro shop card and cash sales, guests' Gallery checks, cart orders paid at the cart by a walk-up golfer, and public tee
     time payments (their receipts are written by the public site) are still money in a drawer or the processor. They are
     classified like receipts, marked synthetic, and drop out as soon as a real receipt with the same refId exists. */
  function unreceipted(date, refs) {
    const out = [];
    function has(id, kind) { return refs[id] && refs[id][kind]; }
    S.all('sales').forEach(function (s) {
      if (s.date !== date || has(s.id, 'sale') || s.channel === 'online' || s.orderId || s.refundOf) return;
      if (s.payment !== 'Card' && s.payment !== 'Cash' && s.payment !== 'Gift card') return;
      const total = r2(s.total), gift = Math.min(total, r2(s.giftAmount)), rest = r2(total - gift);
      const t = []; if (gift > 0) t.push({ method: 'gift', amount: gift }); if (rest > 0 && s.payment !== 'Gift card') t.push({ method: s.payment === 'Cash' ? 'cash' : 'card', amount: rest });
      out.push({ id: 'till:sales:' + s.id, synthetic: true, date: date, at: atOn(date, s.time), kind: 'sale', total: total, source: 'proshop', refId: s.id, channel: 'counter',
        title: 'Pro shop sale No. ' + (s.number || ''), name: s.memberId ? Club.members.name(s.memberId) : 'Walk-in customer', tenders: t, method: t.length ? t[t.length - 1].method : 'other' });
    });
    S.all('diningOrders').forEach(function (o) {
      if (o.date !== date || o.status !== 'closed' || has(o.id, 'sale')) return;
      if (o.payment !== 'Card' && o.payment !== 'Gift card') return;
      const total = r2(o.grandTotal != null ? o.grandTotal : (+o.total || 0) + (+o.service || 0) + (+o.tax || 0));
      if (!(total > 0)) return;
      const gift = Math.min(total, r2(o.giftAmount)), rest = r2(total - gift);
      const t = []; if (gift > 0) t.push({ method: 'gift', amount: gift }); if (rest > 0 && o.payment !== 'Gift card') t.push({ method: 'card', amount: rest });
      out.push({ id: 'till:diningOrders:' + o.id, synthetic: true, date: date, at: o.closedAt ? new Date(o.closedAt).toISOString() : atOn(date, o.time), kind: 'sale', total: total,
        source: 'dining', refId: o.id, channel: 'counter', title: (o.venue || 'Gallery') + ' · Check No. ' + (o.number || ''), name: o.name || (o.memberId ? Club.members.name(o.memberId) : 'Guest'), tenders: t, method: 'card' });
    });
    S.all('cartOrders').forEach(function (o) {
      if (o.date !== date || o.status !== 'delivered' || !o.paidWith || !(+o.total > 0) || has(o.id, 'sale')) return;
      out.push({ id: 'till:cartOrders:' + o.id, synthetic: true, date: date, at: o.deliveredAt || atOn(date, '12:00'), kind: 'sale', total: r2(o.total), source: 'cart', refId: o.id, channel: 'counter',
        title: 'Beverage cart', name: o.name || 'Golfer', tenders: [{ method: o.paidWith === 'cash' ? 'cash' : 'card', amount: r2(o.total) }], method: o.paidWith === 'cash' ? 'cash' : 'card' });
    });
    S.all('publicPayments').forEach(function (p) {
      if (!(+p.amount > 0)) return;
      const total = r2(p.amount), gift = Math.min(total, r2(p.giftAmount)), rest = r2(total - gift);
      const t = []; if (gift > 0) t.push({ method: 'gift', amount: gift, online: true }); if (rest > 0) t.push({ method: 'card', amount: rest, online: true });
      const base = { synthetic: true, total: total, source: 'public', refId: p.id, channel: 'online', name: p.name || 'Public golfer', tenders: t, method: 'card' };
      if (p.date === date && !has(p.id, 'sale')) out.push(Object.assign({ id: 'till:publicPayments:' + p.id, date: date, at: p.createdAt || midday(date), kind: 'sale', title: 'Tee time' + (p.teeDate ? ', ' + fmt.dateShort(p.teeDate) : '') }, base));
      if (p.status === 'refunded' && (p.refundedOn || p.date) === date && !has(p.id, 'credit')) out.push(Object.assign({ id: 'till:publicPayments:' + p.id + ':refund', date: date, at: midday(date, 30), kind: 'credit', title: 'Tee time refund' }, base));
    });
    out.forEach(function (x) {
      if (x.source !== 'public') return;
      const p = byId('publicPayments')[x.refId], pl = p && p.publicPlayerId ? byId('publicPlayers')[p.publicPlayerId] : null;
      if (pl) x.name = [pl.firstName, pl.lastName].filter(Boolean).join(' ') || x.name;
    });
    return out;
  }

  /* ---------------- Summarize a day ---------------- */
  function emptyTenders() { return { card: 0, cash: 0, gift: 0, account: 0, other: 0, onlineCard: 0 }; }
  function summarize(date) {
    const all = S.all('receipts'), refs = {};
    all.forEach(function (r) { if (r.refId) { const k = refs[r.refId] = refs[r.refId] || {}; k[r.kind === 'credit' ? 'credit' : 'sale'] = 1; } });
    const raw = all.filter(function (r) { return r.date === date; }).concat(unreceipted(date, refs));
    const list = raw.map(classify).filter(Boolean).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    const byTender = emptyTenders(), byDept = {}, drawers = {};
    DEPTS.forEach(function (d) { byDept[d.id] = 0; });
    DRAWERS.forEach(function (d) { drawers[d.id] = { cash: 0, card: 0, gift: 0, rounding: 0 }; });
    const deposits = [];
    let memberPayments = 0, giftCardsSold = 0, refunds = 0, credits = 0, cashOutside = 0;
    list.forEach(function (c) {
      byDept[c.dept] = r2((byDept[c.dept] || 0) + c.sign * c.total);
      if (c.dept === 'giftcards') giftCardsSold = r2(giftCardsSold + c.sign * c.total);
      if (c.kind === 'credit') credits = r2(credits + c.total);
      c.tenders.forEach(function (t) {
        const v = c.sign * t.amount;
        const key = t.method === 'card' && (t.online || c.online) ? 'onlineCard' : t.method;
        byTender[key] = r2(byTender[key] + v);
        if (c.dept === 'payments' && t.method !== 'account') memberPayments = r2(memberPayments + v);
        if (c.kind === 'credit' && t.method !== 'account') refunds = r2(refunds + t.amount);
        if (t.method === 'cash' && !c.drawer) cashOutside = r2(cashOutside + v);
        if (c.drawer && (t.method === 'cash' || t.method === 'card' || t.method === 'gift') && !(t.method === 'card' && t.online)) {
          const d = drawers[c.drawer];
          d[t.method] = r2(d[t.method] + v);
          /* Each cash payment is rounded to the nearest 5 cents at the till. */
          if (t.method === 'cash') d.rounding = r2(d.rounding + c.sign * (round5(t.amount) - t.amount));
        }
      });
      if (c.dept === 'functions' || c.dept === 'outings') {
        const t = c.tenders[0] || { method: 'other' };
        deposits.push({ receiptId: c.id, no: c.no, source: c.source, refId: c.refId, name: c.name, title: c.title, amount: r2(c.sign * c.total), method: t.method, at: c.at });
      }
    });
    const total = r2(Object.keys(byDept).reduce(function (a, k) { return a + byDept[k]; }, 0));
    return { date: date, receipts: list, count: list.length, byTender: byTender, byDept: byDept, drawers: drawers, deposits: deposits,
      memberPayments: memberPayments, giftCardsSold: giftCardsSold, refunds: refunds, credits: credits, cashOutside: cashOutside, total: total,
      moneyTaken: r2(byTender.card + byTender.onlineCard + byTender.cash + byTender.other) };
  }
  /** The summary without the receipt list, as kept on a close. */
  function snapshot(s) { const o = Object.assign({}, s); delete o.receipts; return JSON.parse(JSON.stringify(o)); }

  /* ---------------- Closes ---------------- */
  function closeId(date) { return 'close_' + date; }
  function closeFor(date) { return S.find(COLL, closeId(date)) || null; }
  function isClosed(date) { const c = closeFor(date); return !!c && c.status === 'closed'; }
  function countedCents(counts) { return DENOMS.reduce(function (a, d) { return a + (Math.max(0, Math.floor(+(counts || {})[d.key] || 0))) * d.cents; }, 0); }
  function hasCount(counts) { return !!counts && DENOMS.some(function (d) { return counts[d.key] !== undefined && counts[d.key] !== null && counts[d.key] !== ''; }); }
  function expectedCash(float, dr) { return r2((+float || 0) + (dr ? dr.cash + dr.rounding : 0)); }
  /** Cash the drawers and terminal should hold, and what was counted: [{ id, name, float, counts, counted, expectedCash, overShort, entered }]. */
  function drawerRows(sum, model) {
    return DRAWERS.map(function (d) {
      const m = model.drawers[d.id] || {}, counts = m.counts || {};
      const float = m.float != null ? +m.float : settings().floats[d.id];
      const exp = expectedCash(float, sum.drawers[d.id]);
      const counted = countedCents(counts) / 100;
      return { id: d.id, name: d.name, float: float, counts: counts, counted: r2(counted), expectedCash: exp, overShort: r2(counted - exp), entered: hasCount(counts) };
    });
  }
  function closeTotalsOS(c) { return r2((c.drawers || []).reduce(function (a, d) { return a + (+d.overShort || 0); }, 0)); }

  /* Counts typed before sign-off are kept per day, so a half-done count survives leaving the page. */
  function drafts() { return S.getObj('accountingDrafts', {}) || {}; }
  function modelFor(date) {
    const c = closeFor(date);
    const d = c && c.status === 'closed' ? null : drafts()[date];
    if (d) return JSON.parse(JSON.stringify(d));
    const m = { drawers: {}, terminal: null, notes: '', staffId: '' };
    if (c) {
      (c.drawers || []).forEach(function (x) { m.drawers[x.id] = { counts: Object.assign({}, x.counts), float: x.float }; });
      m.terminal = c.cardBatch ? c.cardBatch.terminal : null; m.notes = c.notes || ''; m.staffId = c.status === 'closed' ? c.closedBy || '' : '';
    }
    return m;
  }
  function saveDraft(date, m) { const all = drafts(); all[date] = m; S.setObj('accountingDrafts', all); }
  function dropDraft(date) { const all = drafts(); if (all[date]) { delete all[date]; S.setObj('accountingDrafts', all); } }

  function writeClose(date, model, staffId) {
    const sum = summarize(date), rows = drawerRows(sum, model), prev = closeFor(date);
    const terminal = r2(model.terminal);
    const now = new Date().toISOString();
    const doc = {
      id: closeId(date), date: date, status: 'closed',
      drawers: rows.map(function (r) { const counts = {}; DENOMS.forEach(function (d) { counts[d.key] = Math.max(0, Math.floor(+r.counts[d.key] || 0)); }); return { id: r.id, float: r.float, counts: counts, counted: r.counted, expectedCash: r.expectedCash, overShort: r.overShort }; }),
      cardBatch: { expected: sum.byTender.card, terminal: terminal, diff: r2(terminal - sum.byTender.card) },
      onlineCard: sum.byTender.onlineCard, totals: snapshot(sum), notes: String(model.notes || '').trim().slice(0, 1000),
      closedBy: staffId, closedAt: now,
      reopenedAt: prev ? prev.reopenedAt || null : null, reopenedBy: prev ? prev.reopenedBy || null : null, reopenReason: prev ? prev.reopenReason || null : null,
      exports: prev && prev.exports ? prev.exports : {},
      log: (prev && prev.log || []).concat([{ at: now, action: prev ? 'closed again' : 'closed', by: staffId }])
    };
    if (prev) S.update(COLL, doc.id, doc); else S.insert(COLL, doc);
    dropDraft(date);
    return closeFor(date);
  }
  function reopen(date, staffId, reason) {
    const c = closeFor(date); if (!c || c.status !== 'closed') return c;
    saveDraft(date, modelFor(date));
    const now = new Date().toISOString();
    return S.update(COLL, c.id, { status: 'reopened', reopenedAt: now, reopenedBy: staffId, reopenReason: reason, log: (c.log || []).concat([{ at: now, action: 'reopened', by: staffId, reason: reason }]) });
  }
  /** Past days since the first close (at most 60 days back) that are not closed. */
  function openPastDays() {
    const closes = S.all(COLL); if (!closes.length) return [];
    const first = closes.map(function (c) { return c.date; }).sort()[0];
    const out = [], t = today();
    let d = Club.date.addDays(t, -1);
    for (let i = 0; i < 60 && d >= first; i++, d = Club.date.addDays(d, -1)) if (!isClosed(d)) out.push(d);
    return out;
  }

  /* ---------------- Deposit receipts (weddings and events, tournaments and outings) ---------------- */
  const DEP_METHOD = { Card: 'card', Debit: 'card', Cash: 'cash', Cheque: 'other', 'E-transfer': 'other' };
  function depMethodLabel(dep) {
    if (dep.method === 'Card') return Club.receipts.cardLabel(dep.brand, dep.last4);
    if (dep.method === 'Debit') return 'Debit';
    return dep.method || 'Other';
  }
  function depositInfo(source, rec) {
    if (source === 'outings') return { title: 'Tournament deposit', name: rec.contactName || rec.organization || 'Organizer', what: (rec.organization || 'Tournament') + ', ' + fmt.date(rec.date) };
    return { title: rec.type === 'Wedding' ? 'Wedding deposit' : 'Event deposit', name: rec.contactName || rec.name || 'Client', what: (rec.name || rec.type || 'Event') + ', ' + fmt.date(rec.date) };
  }
  function depositReceiptFor(source, recordId, depId, kind) {
    if (!Club.receipts) return null;
    return Club.receipts.forRef(source, recordId).find(function (r) { return (r.kind || 'sale') === (kind || 'sale') && (r.tenders || []).some(function (t) { return t.ref === depId; }); }) || null;
  }
  /** What the receipts for one deposit add up to: sales less credits (0 once it has been taken back out). */
  function depositNet(source, recordId, depId) {
    if (!Club.receipts) return 0;
    return r2(Club.receipts.forRef(source, recordId).reduce(function (a, r) {
      return (r.tenders || []).some(function (t) { return t.ref === depId; }) ? a + (r.kind === 'credit' ? -1 : 1) * (+r.total || 0) : a;
    }, 0));
  }
  /** One receipt per deposit or payment recorded on a function or outing (source 'functions' | 'outings', refId the record). */
  function depositReceipt(source, rec, dep, at) {
    if (!Club.receipts || !rec || !dep || !(+dep.amount > 0)) return null;
    const have = depositReceiptFor(source, rec.id, dep.id);
    if (have) return have;
    const info = depositInfo(source, rec), fee = r2(dep.fee);
    const lines = [{ name: info.what, qty: 1, price: r2(dep.amount) }];
    if (fee > 0) lines.push({ name: 'Card processing fee (2.5%)', qty: 1, price: fee });
    const total = r2(+dep.amount + (fee > 0 ? fee : 0));
    const method = DEP_METHOD[dep.method] || 'other';
    return Club.receipts.create({ memberId: null, publicPlayerId: null, name: info.name, title: info.title, lines: lines, total: total, kind: 'sale',
      method: method, methodLabel: depMethodLabel(dep), source: source, refId: rec.id, date: dep.date || today(),
      at: at || (dep.date && dep.date !== today() ? midday(dep.date) : new Date().toISOString()),
      note: 'Applied to the final invoice.' + (dep.reference ? ' Reference ' + dep.reference + '.' : ''),
      tenders: [{ method: method, amount: total, ref: dep.id }], channel: 'counter' });
  }
  /** A payment record removed from a function or outing: a credit receipt that takes it back out of today's close. */
  function depositReversed(source, rec, dep) {
    if (!Club.receipts || !rec || !dep) return null;
    const sale = depositReceiptFor(source, rec.id, dep.id);
    /* Only while the deposit still counts: an undone removal reinstates it with a sale, so it can be removed again. */
    if (!sale || depositNet(source, rec.id, dep.id) <= 0.004) return null;
    return Club.receipts.create({ memberId: null, publicPlayerId: null, name: sale.name, title: sale.title + ' reversed', lines: sale.lines, total: sale.total, kind: 'credit',
      method: sale.method, methodLabel: sale.methodLabel, source: source, refId: rec.id, note: 'Payment record removed. Receipt ' + sale.no + ' reversed.',
      tenders: [{ method: (sale.tenders && sale.tenders[0] && sale.tenders[0].method) || sale.method, amount: sale.total, ref: dep.id }], channel: 'counter' });
  }
  /* ---------------- Undo (Club.undo records from Billing, Weddings & Events and Group outings) ----------------
     Club.undo dates every reversal today. Call undoSettle(record) right after a successful Club.undo.revert so that:
       - a receipt the action dated on an earlier day that is still open (a deposit or payment received yesterday) is
         reversed on that same day, and so is the payment behind it: both days' closes and journals net to nothing;
       - an account charge dated on another open day (next month's dues, a charge posted for last Tuesday) is reversed on
         that date, so the export journal for each day nets (charge receipts are always dated the day they were made);
       - the credit for a member payment receipt points at the reversing payment, so the close counts it under member
         account payments and the export (which posts payments from the payments collection) does not count it twice. */
  function undoSettle(rec) {
    if (!rec || !rec.ops) return;
    const t = today();
    rec.ops.forEach(function (o) {
      if (o.t !== 'ins') return;
      if (o.c === 'receipts') {
        const r = S.find('receipts', o.id), cr = r && r.reversedBy ? S.find('receipts', r.reversedBy) : null;
        if (!cr) return;
        const patch = {};
        if (r.date !== t && cr.date === t && !isClosed(r.date)) { patch.date = r.date; patch.at = new Date((Date.parse(r.at) || Date.parse(midday(r.date))) + 1000).toISOString(); }
        if (r.paymentId && !cr.paymentId) { const p = S.find('payments', r.paymentId); if (p && p.reversedBy) patch.paymentId = p.reversedBy; }
        if (Object.keys(patch).length) S.update('receipts', cr.id, patch);
      } else if (o.c === 'charges') {
        const c = S.find('charges', o.id), rv = c && c.reversedBy ? S.find('charges', c.reversedBy) : null;
        if (rv && c.date !== t && rv.date === t && !isClosed(c.date)) S.update('charges', rv.id, { date: c.date });
      } else if (o.c === 'payments') {
        const p = S.find('payments', o.id), rv = p && p.reversedBy ? S.find('payments', p.reversedBy) : null;
        if (rv && p.date !== t && rv.date === t && !isClosed(p.date)) S.update('payments', rv.id, { date: p.date });
      }
    });
  }
  /** Club.undo.offer with undoSettle applied, and a refusal when today is closed for anything that moved money. */
  function offerUndo(msg, rec, opts) {
    opts = opts || {};
    if (!Club.undo || !rec || !rec.ops || !rec.ops.length) { ui.toast(msg, opts.kind); return; }
    ui.toast(msg, opts.kind, { action: { label: 'Undo', onClick: function () {
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { undoSettle(rec); } catch (e) { console.error(e); }
      try { if (opts.after) opts.after(res); } catch (e) { console.error(e); }
      const u = typeof opts.undone === 'function' ? opts.undone(res) : opts.undone;
      ui.toast((u || 'Undone') + (res.credited > 0 ? '. ' + fmt.money(res.credited) + ' credited back' : ''));
    } } });
  }
  /** track + offerUndo. opts.message: string or fn(result); a falsy message skips the toast (validation failed). */
  function runUndo(fn, opts) {
    opts = opts || {};
    if (!Club.undo) { const out = fn(); const m0 = typeof opts.message === 'function' ? opts.message(out) : opts.message; if (m0) ui.toast(m0, opts.kind); return out; }
    const rec = Club.undo.track(fn);
    if (rec.nested) return rec.result;
    const msg = typeof opts.message === 'function' ? opts.message(rec.result) : opts.message;
    if (msg) offerUndo(msg, rec, opts);
    return rec.result;
  }
  function backfillDeposits() {
    if (S.getObj('depositReceiptsBackfilled', false) || !Club.receipts) return 0;
    let n = 0;
    [['functions', 'functions'], ['outings', 'outings']].forEach(function (p) {
      S.all(p[0]).forEach(function (rec) {
        (rec.deposits || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (dep, i) {
          if (!dep.id) return;
          if (!depositReceiptFor(p[1], rec.id, dep.id) && depositReceipt(p[1], rec, dep, dep.date ? midday(dep.date, 7 * i) : null)) n++;
        });
      });
    });
    S.setObj('depositReceiptsBackfilled', true);
    return n;
  }

  /* ---------------- Seed: the last 14 days closed (deterministic, small over/shorts) ---------------- */
  /** Bills and coins that make up an amount (cents, a multiple of 5), the way a drawer actually holds it. */
  function makeCounts(totalCents, rnd) {
    const counts = {}; let left = Math.max(0, Math.round(totalCents / 5) * 5);
    const caps = { '100': rnd.int(0, 1), '50': rnd.int(0, 3), '20': 999, '10': rnd.int(4, 10), '5': rnd.int(4, 10), '2': rnd.int(6, 15), '1': rnd.int(6, 15), '0.25': rnd.int(10, 30), '0.10': 40, '0.05': 999 };
    DENOMS.forEach(function (d) { const n = Math.min(caps[d.key], Math.floor(left / d.cents)); counts[d.key] = n; left -= n * d.cents; });
    /* Anything the caps left over goes to the smallest bills and coins. */
    ['10', '5', '2', '1', '0.25', '0.10', '0.05'].forEach(function (k) { const d = DENOMS.find(function (x) { return x.key === k; }); const n = Math.floor(left / d.cents); counts[k] += n; left -= n * d.cents; });
    return counts;
  }
  function seedCloses() {
    if (S.getObj('dailyClosesSeeded', false)) return;
    if (S.all(COLL).length) { S.setObj('dailyClosesSeeded', true); return; }
    R.reseed(1509);
    const closers = ['stf_25', 'stf_23', 'stf_24', 'stf_4', 'stf_25', 'stf_23', 'stf_5'];
    const floats = settings().floats;
    const docs = [];
    for (let i = 14; i >= 1; i--) {
      const date = Club.date.fromToday(-i), sum = summarize(date);
      const by = closers[i % closers.length];
      const notes = [];
      const drawers = DRAWERS.map(function (d) {
        const exp = expectedCash(floats[d.id], sum.drawers[d.id]);
        let os = 0;
        if (R.chance(0.3)) os = R.pick([0.05, -0.05, 0.1, -0.25, 0.5, -1, 1.25, -2, 3.5, -4.75]);
        const counts = makeCounts(cents(exp + os), R);
        const counted = countedCents(counts) / 100;
        if (Math.abs(counted - exp) > 1) notes.push(d.name + ' ' + overShortText(counted - exp) + ', recounted twice.');
        return { id: d.id, float: floats[d.id], counts: counts, counted: r2(counted), expectedCash: exp, overShort: r2(counted - exp) };
      });
      let terminal = sum.byTender.card;
      if (sum.byTender.card > 0 && R.chance(0.15)) { const off = R.pick([-4.5, 12, -18.25]); terminal = r2(terminal + off); notes.push('Terminal batch ' + overShortText(off) + ': a sale was keyed twice and voided on the terminal. Checked with the processor.'); }
      const at = new Date(fmt.toDate(date).getFullYear(), fmt.toDate(date).getMonth(), fmt.toDate(date).getDate(), 21, R.int(5, 55)).toISOString();
      const doc = { id: closeId(date), date: date, status: 'closed', drawers: drawers, cardBatch: { expected: sum.byTender.card, terminal: terminal, diff: r2(terminal - sum.byTender.card) },
        onlineCard: sum.byTender.onlineCard, totals: snapshot(sum), notes: notes.join(' '), closedBy: by, closedAt: at, reopenedAt: null, reopenedBy: null, reopenReason: null,
        exports: {}, log: [{ at: at, action: 'closed', by: by }], demo: true };
      if (i === 6) {
        const rAt = new Date(Date.parse(at) + 11.5 * 3600000).toISOString();
        Object.assign(doc, { status: 'reopened', reopenedAt: rAt, reopenedBy: 'stf_25', reopenReason: 'A pro shop return was rung up after the close. Recount the golf shop drawer and close again.' });
        doc.log.push({ at: rAt, action: 'reopened', by: 'stf_25', reason: doc.reopenReason });
      }
      docs.push(doc);
    }
    S.replace(COLL, docs);
    S.setObj('dailyClosesSeeded', true);
  }

  /* Startup: every module above has seeded its data. Receipts for charges and payments first (idempotent), then deposit
     receipts. The closes are seeded on DOMContentLoaded, after the handlers that add demo sales with receipts (the online
     shop seed in proshop.js), so their totals match what summarize finds later; the page redraws if it is showing. */
  try { if (Club.receipts) Club.receipts.backfill(); } catch (e) { console.error('Receipts backfill failed', e); }
  try { backfillDeposits(); } catch (e) { console.error('Deposit receipts backfill failed', e); }
  function startSeed() {
    if (S.getObj('dailyClosesSeeded', false)) return;
    try { seedCloses(); } catch (e) { console.error('Daily close seed failed', e); return; }
    if (/^#\/accounting(\/|$)/.test(location.hash) && Club.app && !document.querySelector('.overlay')) Club.app.render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSeed); else setTimeout(startSeed, 0);

  /* ==================================================================
     Page
     ================================================================== */
  const state = { tab: 'close', date: null, hist: 'all' };

  /* ---------------- Drill drawers (the dashboard's look, plus receipts that open) ---------------- */
  const Dr = Club.drill;
  function openDrill(d) {
    const api = ui.drawer({ eyebrow: d.eyebrow || 'Daily close', title: d.title, body: '<div class="dd">' + d.body + '</div>' });
    if (api.duplicate) return api;
    api.el.classList.add('dash-drawer'); api.el.setAttribute('aria-label', d.title);
    ui.on(api.el, 'click', '[data-rc]', function (e, b) { Club.receipts.open(b.dataset.rc); });
    ui.on(api.el, 'click', 'a[href^="#/"]', function () { api.close(); });
    ui.animateIn(api.body);
    return api;
  }
  function rcCell(c) {
    return c.synthetic ? '<span class="muted" title="Recorded at the till without a receipt">Till record</span>'
      : '<button type="button" class="s-link ac-rc" data-rc="' + esc(c.id) + '">' + esc(c.no || 'Receipt') + '</button>';
  }
  function tenderText(c) {
    return c.tenders.map(function (t) { return t.method === 'card' ? (t.online || c.online ? 'Online card' : 'Card') : t.method === 'gift' ? 'Gift card' : t.method === 'account' ? 'Account' : t.method === 'cash' ? 'Cash' : 'Other'; }).join(' + ');
  }
  function receiptTable(list, amountOf) {
    if (!list.length) return Dr.empty('Nothing recorded', 'No receipts match on this day.', 'billing');
    const tot = r2(list.reduce(function (a, c) { return a + amountOf(c); }, 0));
    return Dr.table([{ label: 'Time' }, { label: 'Receipt' }, { label: 'Customer' }, { label: 'For' }, { label: 'Paid by' }, { label: 'Amount', num: true }],
      list.map(function (c) {
        return ['<span class="nowrap">' + esc(timeOf(c.at)) + '</span>', rcCell(c), esc(c.name), esc(c.title) + (c.kind === 'credit' ? ' ' + ui.badge('Credit', 'warn') : ''), esc(tenderText(c)), money(amountOf(c))];
      }), ['', '', '', '', '<strong>Total</strong>', '<strong>' + money(tot) + '</strong>']);
  }
  function tenderAmount(c, pred) { return r2(c.sign * c.tenders.filter(pred).reduce(function (a, t) { return a + t.amount; }, 0)); }
  function tenderPred(key) {
    return function (c) { return function (t) { return key === 'onlineCard' ? t.method === 'card' && (t.online || c.online) : key === 'card' ? t.method === 'card' && !(t.online || c.online) : t.method === key; }; };
  }
  function drillTender(sum, key) {
    const p = tenderPred(key);
    const list = sum.receipts.filter(function (c) { return c.tenders.some(p(c)); });
    const lab = (TENDERS.find(function (t) { return t.id === key; }) || {}).label || key;
    const kpis = [{ label: 'Net', value: fmt.money(sum.byTender[key]) }, { label: 'Receipts', value: String(list.length) }];
    if (key === 'card' || key === 'cash') DRAWERS.forEach(function (d) { kpis.push({ label: d.name, value: fmt.money(sum.drawers[d.id][key]) }); });
    if (key === 'cash' && sum.cashOutside) kpis.push({ label: 'Office', value: fmt.money(sum.cashOutside) });
    return { title: lab, body: Dr.kpis(kpis.slice(0, 4)) +
      Dr.sec('Receipts', fmt.date(sum.date), receiptTable(list, function (c) { return tenderAmount(c, p(c)); })) +
      (key === 'onlineCard' ? Dr.note('Online card payments are settled by the card processor and are not in the shop terminal batch.') : '') +
      (list.some(function (c) { return c.synthetic; }) ? Dr.note('Till records are sales rung up without a receipt (pro shop card and cash sales, guests’ Gallery checks, cart orders paid at the cart). They count the same way.') : '') };
  }
  function drillDept(sum, dept) {
    const list = sum.receipts.filter(function (c) { return c.dept === dept; });
    return { title: deptLabel(dept), body: Dr.kpis([{ label: 'Net', value: fmt.money(sum.byDept[dept] || 0) }, { label: 'Receipts', value: String(list.length) }]) +
      Dr.sec('Receipts', fmt.date(sum.date), receiptTable(list, function (c) { return c.sign * c.total; })) };
  }
  function drillTaken(sum) {
    const rows = DEPTS.filter(function (d) { return Math.abs(sum.byDept[d.id]) > 0.004; });
    const pos = rows.reduce(function (a, d) { return a + Math.max(0, sum.byDept[d.id]); }, 0);
    return { title: 'Money taken', body: Dr.kpis([{ label: 'Money taken', value: fmt.money(sum.moneyTaken), sub: 'Card, cash and other' }, { label: 'Gift cards used', value: fmt.money(sum.byTender.gift) },
      { label: 'On account', value: fmt.money(sum.byTender.account) }, { label: 'All tenders', value: fmt.money(sum.total) }]) +
      Dr.sec('By department', 'Net of refunds', rows.length ? Dr.table([{ label: 'Department' }, { label: 'Share' }, { label: 'Net', num: true }],
        rows.map(function (d) { return [esc(d.label), Dr.share(Math.max(0, sum.byDept[d.id]), pos), money(sum.byDept[d.id])]; }), ['<strong>Total</strong>', '', '<strong>' + money(sum.total) + '</strong>'])
        : Dr.empty('Nothing recorded', 'No receipts on this day.', 'billing')) };
  }

  /* ---------------- Daily close tab ---------------- */
  function statusBadge(c) {
    if (!c) return ui.badge('Open', 'outline');
    return c.status === 'closed' ? ui.badge('Closed', 'good') : ui.badge('Reopened', 'warn');
  }
  /* Each draw gets a new root, so listeners from the last draw go with it. */
  let lastDraw = 0;
  function fresh(host) { host.innerHTML = ''; const root = document.createElement('div'); root.className = 'ac-root'; host.appendChild(root); lastDraw = Date.now(); return root; }
  function tabClose(host) {
    const date = state.date && validDate(state.date) && state.date <= today() ? state.date : today();
    state.date = date;
    const c = closeFor(date), locked = !!c && c.status === 'closed';
    const live = summarize(date);
    const sum = locked && c.totals ? Object.assign({}, c.totals, { receipts: live.receipts }) : live;
    const model = modelFor(date);
    const panel = fresh(host);
    const set = settings();
    const isToday = date === today();
    const changed = locked && c.totals && Math.abs(r2(live.total - c.totals.total)) > 0.004;

    const banner = locked
      ? '<div class="ac-banner is-closed" data-reveal>' + Club.icon('check') + '<div><strong>Closed by ' + esc(staffName(c.closedBy)) + '</strong><span>' + esc(fmt.date(new Date(c.closedAt)) + ' at ' + timeOf(c.closedAt)) + '. This day is read-only.' + (c.reopenReason ? ' Reopened earlier: ' + c.reopenReason : '') + '</span>' +
        (changed ? '<span class="ac-banner-warn">' + Club.icon('alert') + 'Receipts changed since the close: ' + esc(fmt.money(live.total)) + ' now against ' + esc(fmt.money(c.totals.total)) + ' closed. Reopen the day to count and close again.</span>' : '') +
        '</div>' + ui.btn('Reopen day', { action: 'reopen', icon: 'refresh', sm: true }) + '</div>'
      : c && c.status === 'reopened'
        ? '<div class="ac-banner is-reopened" data-reveal>' + Club.icon('alert') + '<div><strong>Reopened by ' + esc(staffName(c.reopenedBy)) + '</strong><span>' + esc(fmt.date(new Date(c.reopenedAt)) + ' at ' + timeOf(c.reopenedAt) + ': ' + (c.reopenReason || '')) + '</span></div></div>'
        : '<div class="ac-banner" data-reveal>' + Club.icon('clock') + '<div><strong>' + (isToday ? 'Open today' : 'Not closed') + '</strong><span>' + (isToday ? 'Count each drawer at the end of the day, enter the terminal batch total and sign off.' : 'This day was never closed. Count and sign off to lock it.') + '</span></div></div>';

    panel.innerHTML =
      '<div class="ac-toolbar" data-reveal>' +
        '<div class="ac-day">' + ui.btn('', { icon: 'chevronLeft', kind: 'ghost', sm: true, action: 'day-prev', title: 'Previous day' }) +
          '<label class="ac-date"><span class="ac-sr">Day</span><input class="input" type="date" name="acdate" value="' + esc(date) + '" max="' + esc(today()) + '" aria-label="Day to close"></label>' +
          ui.btn('', { icon: 'chevronRight', kind: 'ghost', sm: true, action: 'day-next', title: 'Next day' }) +
          (isToday ? '' : '<button type="button" class="s-link" data-action="day-today">Today</button>') + '</div>' +
        '<div class="ac-tools">' + statusBadge(c) + ui.btn('Drawer floats', { icon: 'settings', sm: true, action: 'floats' }) + ui.btn('Print report', { icon: 'print', sm: true, action: 'print' }) + '</div>' +
      '</div>' + banner +
      '<div class="ac-stats">' + Dr.tiles(ui.stats([
        { label: 'Money taken', value: sum.moneyTaken, prefix: '$', decimals: 2, meta: esc(sum.count + (sum.count === 1 ? ' receipt' : ' receipts') + (sum.refunds ? ' · ' + fmt.money(sum.refunds) + ' refunded' : '')) },
        { label: 'Card, shop terminal', value: sum.byTender.card, prefix: '$', decimals: 2, meta: 'Golf shop, Gallery, cart, office' },
        { label: 'Cash', value: sum.byTender.cash, prefix: '$', decimals: 2, meta: esc('Drawers ' + fmt.money(DRAWERS.reduce(function (a, d) { return a + sum.drawers[d.id].cash; }, 0))) },
        { label: 'Card, online', value: sum.byTender.onlineCard, prefix: '$', decimals: 2, meta: 'Settled by the processor' },
        { label: 'On member accounts', value: sum.byTender.account, prefix: '$', decimals: 2, meta: esc('Gift cards used ' + fmt.money(sum.byTender.gift)) }
      ]), ['taken', 'card', 'cash', 'onlineCard', 'account']) + '</div>' +
      '<div class="grid grid-main-side ac-grid"><div class="stack">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(fmt.dateLong(date)) + '</div><h3>Cash drawers</h3></div><span class="muted ac-head-note">Bills and coins, no pennies</span></div>' +
          '<div class="panel-body ac-drawers"></div></section>' +
        '<section class="panel ac-batch" data-reveal><div class="panel-head"><div><div class="eyebrow">Shop terminal</div><h3>Card batch</h3></div></div><div class="panel-body"></div></section>' +
          '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Totals</div><h3>By tender</h3></div></div><div class="panel-body flush">' + tenderTable(sum) + '</div></section>' +
          '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Totals</div><h3>By department</h3></div></div><div class="panel-body flush">' + deptTable(sum) + '</div></section>' +
      '</div><aside class="stack">' + sidePanels(sum) +
        '<section class="panel ac-signoff" data-reveal><div class="panel-head"><div><div class="eyebrow">Sign-off</div><h3>' + (locked ? 'Closed' : 'Close the day') + '</h3></div></div><div class="panel-body"></div></section>' +
      '</aside></div>';

    const drawersEl = ui.$('.ac-drawers', panel), batchEl = ui.$('.ac-batch .panel-body', panel), signEl = ui.$('.ac-signoff .panel-body', panel);
    function persist() { if (!locked && !isClosed(date)) saveDraft(date, model); }
    let saveT = null;
    function persistSoon() { clearTimeout(saveT); saveT = setTimeout(persist, 250); }

    function drawDrawers() {
      const rows = drawerRows(sum, model);
      drawersEl.innerHTML = rows.map(function (r) {
        const dr = sum.drawers[r.id];
        const coinRow = function (d) {
          const v = r.counts[d.key];
          return '<tr><th scope="row">' + esc(d.label) + '</th><td><input class="input ac-qty" type="number" inputmode="numeric" min="0" step="1" name="' + esc(r.id + ':' + d.key) + '" value="' + esc(v == null ? '' : v) + '"' + (locked ? ' disabled' : '') + ' aria-label="' + esc(r.name + ', ' + d.label + ' count') + '"></td><td class="num ac-line" data-line="' + esc(r.id + ':' + d.key) + '">' + money((Math.max(0, Math.floor(+v || 0)) * d.cents) / 100) + '</td></tr>';
        };
        return '<div class="ac-drawer" data-drawer="' + esc(r.id) + '">' +
          '<div class="ac-drawer-head"><h4>' + esc(r.name) + '</h4><span class="ac-os" data-os>' + osBadge(r) + '</span></div>' +
          '<div class="ac-denoms"><table class="ac-count"><caption class="ac-sr">' + esc(r.name) + ' bills</caption><thead><tr><th scope="col">Bills</th><th scope="col">Count</th><th scope="col" class="num">Amount</th></tr></thead><tbody>' + DENOMS.slice(0, 5).map(coinRow).join('') + '</tbody></table>' +
          '<table class="ac-count"><caption class="ac-sr">' + esc(r.name) + ' coins</caption><thead><tr><th scope="col">Coins</th><th scope="col">Count</th><th scope="col" class="num">Amount</th></tr></thead><tbody>' + DENOMS.slice(5).map(coinRow).join('') + '</tbody></table></div>' +
          '<dl class="ac-recon" data-recon>' + reconHTML(r, dr) + '</dl></div>';
      }).join('');
    }
    function osBadge(r) { return r.entered ? ui.badge(overShortText(r.overShort), osKind(r.overShort, set.tolerance)) : ui.badge('Not counted', 'outline'); }
    function reconHTML(r, dr) {
      return '<div><dt>Float</dt><dd>' + money(r.float) + '</dd></div>' +
        '<div><dt>Cash sales, net</dt><dd>' + money(dr.cash) + '</dd></div>' +
        (Math.abs(dr.rounding) > 0.004 ? '<div><dt>Rounding to 5¢</dt><dd>' + money(dr.rounding) + '</dd></div>' : '') +
        '<div class="ac-recon-key"><dt>Expected cash</dt><dd>' + money(r.expectedCash) + '</dd></div>' +
        '<div class="ac-recon-key"><dt>Counted</dt><dd>' + (r.entered ? money(r.counted) : '<span class="muted">Not counted</span>') + '</dd></div>' +
        '<div class="ac-recon-os ac-' + (r.entered ? osKind(r.overShort, set.tolerance) : 'none') + '"><dt>Over / short</dt><dd>' + (r.entered ? esc(overShortText(r.overShort)) : '<span class="muted">After counting</span>') + '</dd></div>' +
        '<div class="ac-recon-sub"><dt>Card at this drawer</dt><dd>' + money(dr.card) + '</dd></div>' +
        (dr.gift ? '<div class="ac-recon-sub"><dt>Gift cards used</dt><dd>' + money(dr.gift) + '</dd></div>' : '');
    }
    function updateDrawer(id) {
      const r = drawerRows(sum, model).find(function (x) { return x.id === id; });
      const box = ui.$('[data-drawer="' + id + '"]', drawersEl); if (!box || !r) return;
      DENOMS.forEach(function (d) { const cell = ui.$('[data-line="' + id + ':' + d.key + '"]', box); if (cell) cell.textContent = fmt.money(Math.max(0, Math.floor(+r.counts[d.key] || 0)) * d.cents / 100); });
      ui.$('[data-os]', box).innerHTML = osBadge(r);
      ui.$('[data-recon]', box).innerHTML = reconHTML(r, sum.drawers[id]);
    }
    function batchDiff() { return model.terminal === null || model.terminal === '' || model.terminal === undefined ? null : r2(+model.terminal - sum.byTender.card); }
    function drawBatch() {
      const diff = batchDiff();
      const parts = DRAWERS.map(function (d) { return [d.name, sum.drawers[d.id].card]; });
      const office = r2(sum.byTender.card - parts.reduce(function (a, p) { return a + p[1]; }, 0));
      if (Math.abs(office) > 0.004) parts.push(['Office (deposits, account payments)', office]);
      batchEl.innerHTML = '<div class="ac-batch-grid">' +
        '<div><span class="label-caps">Expected</span><strong class="ac-big">' + money(sum.byTender.card) + '</strong><span class="muted">Card receipts at the counter</span></div>' +
        '<div class="field ac-terminal"><label for="ac-terminal">Terminal batch total</label><input class="input" id="ac-terminal" type="number" inputmode="decimal" step="0.01" min="0" name="terminal" value="' + esc(model.terminal == null ? '' : locked ? (+model.terminal).toFixed(2) : model.terminal) + '" placeholder="From the batch report"' + (locked ? ' disabled' : '') + '></div>' +
        '<div><span class="label-caps">Difference</span><strong class="ac-big ac-' + (diff === null ? 'none' : osKind(diff, 0)) + '" data-diff>' + (diff === null ? '<span class="muted">Enter the batch</span>' : esc(overShortText(diff))) + '</strong><span class="muted">Terminal less receipts</span></div>' +
        '</div><ul class="list ac-mini">' + parts.map(function (p) { return '<li class="row between"><span>' + esc(p[0]) + '</span><span class="num">' + money(p[1]) + '</span></li>'; }).join('') + '</ul>';
    }
    function drawSign() {
      if (locked) {
        signEl.innerHTML = '<dl class="kv ac-kv"><dt>Closed by</dt><dd>' + esc(staffName(c.closedBy)) + '</dd><dt>When</dt><dd>' + esc(fmt.date(new Date(c.closedAt)) + ', ' + timeOf(c.closedAt)) + '</dd>' +
          '<dt>Cash over / short</dt><dd>' + esc(overShortText(closeTotalsOS(c))) + '</dd><dt>Card difference</dt><dd>' + esc(overShortText(c.cardBatch ? c.cardBatch.diff : 0)) + '</dd></dl>' +
          (c.notes ? '<p class="ac-notes-read">' + esc(c.notes) + '</p>' : '<p class="muted">No notes.</p>');
        return;
      }
      signEl.innerHTML = '<form novalidate class="ac-sign-form">' +
        '<div class="field"><label for="ac-notes">Notes</label><textarea class="textarea" id="ac-notes" name="notes" maxlength="1000" placeholder="Anything the controller should know: a void, a recount, a float change">' + esc(model.notes || '') + '</textarea><span class="field-hint">Needed when a drawer is over or short by more than ' + esc(fmt.money(set.tolerance)) + ', or the card batch does not match.</span></div>' +
        '<div class="field"><label for="ac-staff">Closed by *</label><select class="select" id="ac-staff" name="staffId" required><option value="">Choose the staff member</option>' + Club.staff.options(model.staffId || '') + '</select></div>' +
        ui.btn('Close the day', { kind: 'primary', icon: 'check', action: 'close-day' }) + '</form>';
    }
    drawDrawers(); drawBatch(); drawSign();

    ui.on(drawersEl, 'input', '.ac-qty', function (e, inp) {
      const p = inp.name.split(':'), id = p[0], key = p[1];
      const m = model.drawers[id] = model.drawers[id] || { counts: {} }; m.counts = m.counts || {};
      const v = inp.value.trim();
      if (v === '') delete m.counts[key]; else m.counts[key] = Math.max(0, Math.floor(+v || 0));
      inp.classList.remove('invalid');
      updateDrawer(id); persistSoon();
    });
    ui.on(batchEl, 'input', '[name=terminal]', function (e, inp) {
      model.terminal = inp.value.trim() === '' ? null : r2(inp.value);
      const diff = batchDiff(), out = ui.$('[data-diff]', batchEl);
      out.className = 'ac-big ac-' + (diff === null ? 'none' : osKind(diff, 0));
      out.innerHTML = diff === null ? '<span class="muted">Enter the batch</span>' : esc(overShortText(diff));
      ui.$$('.field-error', inp.parentNode).forEach(function (x) { x.remove(); }); inp.classList.remove('invalid');
      persistSoon();
    });
    ui.on(signEl, 'input', '[name=notes]', function (e, t) { model.notes = t.value; persistSoon(); });
    ui.on(signEl, 'change', '[name=staffId]', function (e, t) { model.staffId = t.value; persistSoon(); });
    ui.on(signEl, 'click', '[data-action=close-day]', function () { closeDay(); });

    function fieldErr(input, msg) { if (!input) return; input.classList.add('invalid'); const host = input.closest('.field') || input.parentNode; host.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>'); }
    function closeDay() {
      const form = ui.$('form', signEl);
      ui.$$('.field-error', panel).forEach(function (x) { x.remove(); }); ui.$$('.invalid', panel).forEach(function (x) { x.classList.remove('invalid'); });
      const rows = drawerRows(sum, model), errs = [];
      rows.forEach(function (r) {
        if (r.entered) return;
        const first = ui.$('[name="' + r.id + ':100"]', drawersEl); if (first) first.classList.add('invalid');
        const box = ui.$('[data-drawer="' + r.id + '"] .ac-drawer-head', drawersEl); if (box) box.insertAdjacentHTML('afterend', '<span class="field-error">Count the ' + esc(r.name) + ' drawer, even if it only holds the float.</span>');
        errs.push(first);
      });
      const term = ui.$('[name=terminal]', batchEl);
      if (model.terminal === null || model.terminal === undefined || model.terminal === '' || isNaN(+model.terminal) || +model.terminal < 0) { fieldErr(term, 'Enter the batch total from the terminal (0 if no cards were run).'); errs.push(term); }
      const staffSel = form.staffId;
      if (!staffSel.value) { fieldErr(staffSel, 'Choose who is closing the day.'); errs.push(staffSel); }
      const diff = batchDiff();
      const needCash = rows.some(function (r) { return r.entered && Math.abs(r.overShort) > set.tolerance + 0.001; }), needCard = diff !== null && Math.abs(diff) > 0.004;
      if ((needCash || needCard) && !String(model.notes || '').trim()) { fieldErr(form.notes, 'Explain the ' + [needCash ? 'cash over/short' : '', needCard ? 'card difference' : ''].filter(Boolean).join(' and the ') + ' in the notes.'); errs.push(form.notes); }
      if (errs.length) { const f = errs.filter(Boolean)[0]; if (f) f.focus(); ui.toast('Check the highlighted items before closing', 'bad'); return; }
      const os = r2(rows.reduce(function (a, r) { return a + r.overShort; }, 0));
      clearTimeout(saveT); persist();
      ui.confirm({ title: 'Close ' + fmt.date(date) + '?', text: 'Cash drawers: ' + overShortText(os) + '. Card batch: ' + overShortText(diff) + '. The day then locks and becomes read-only; reopening it needs a reason.', confirmLabel: 'Close the day' }).then(function (ok) {
        if (!ok) return;
        const closed = writeClose(date, model, staffSel.value), closedAt = closed.closedAt, exported = JSON.stringify(closed.exports || {});
        /* Undo reopens the day (the close stays in the log), unless it has been exported or changed since. */
        ui.toast(fmt.dateShort(date) + ' closed by ' + staffName(staffSel.value), '', { action: { label: 'Undo', onClick: function () {
          const c = closeFor(date);
          if (!c || c.status !== 'closed' || c.closedAt !== closedAt) { ui.toast('This day has changed since, so it can no longer be undone here.', 'bad'); return; }
          if (JSON.stringify(c.exports || {}) !== exported) { ui.toast('This day has been exported since. Reopen it from the Daily close tab if it needs to change.', 'bad'); return; }
          reopen(date, c.closedBy, 'Close undone right after sign-off');
          if (S.find(COLL, c.id) && document.body.contains(host)) redraw();
          ui.toast(fmt.dateShort(date) + ' reopened. The counts are kept');
        } } });
        tabClose(host); ui.animateIn(host);
      });
    }

    function redraw() { tabClose(host); ui.animateIn(host); }
    ui.on(panel, 'click', '[data-action=reopen]', function () { reopenDialog(date, redraw); });
    ui.on(panel, 'click', '[data-action=print]', function () { openReport(date); });
    ui.on(panel, 'click', '[data-action=floats]', function () { floatsDialog(redraw); });
    function goDay(d) { if (!validDate(d)) return; state.date = d > today() ? today() : d; replaceHash(); redraw(); }
    ui.on(panel, 'click', '[data-action=day-prev]', function () { goDay(Club.date.addDays(date, -1)); });
    ui.on(panel, 'click', '[data-action=day-next]', function () { if (date < today()) goDay(Club.date.addDays(date, 1)); });
    ui.on(panel, 'click', '[data-action=day-today]', function () { goDay(today()); });
    const dateInp = ui.$('[name=acdate]', panel);
    dateInp.addEventListener('change', function () { if (dateInp.value && dateInp.value !== date) goDay(dateInp.value); });
    const next = ui.$('[data-action=day-next]', panel); if (next && !(date < today())) next.disabled = true;
    ui.on(panel, 'click', '[data-dept]', function (e, b) { openDrill(drillDept(sum, b.dataset.dept)); });
    ui.on(panel, 'click', '[data-tender]', function (e, b) { openDrill(drillTender(sum, b.dataset.tender)); });
    ui.on(panel, 'click', '[data-list]', function (e, b) { openDrill(listDrill(sum, b.dataset.list)); });
    const drills = { taken: function () { return drillTaken(sum); }, card: function () { return drillTender(sum, 'card'); }, cash: function () { return drillTender(sum, 'cash'); },
      onlineCard: function () { return drillTender(sum, 'onlineCard'); }, account: function () { return drillTender(sum, 'account'); } };
    function goDrill(key) { const fn = drills[key]; if (!fn) return; let d; try { d = fn(); } catch (err) { console.error(err); d = { title: 'Details', body: Dr.empty('These details could not load', err.message, 'alert') }; } openDrill(d); }
    ui.on(panel, 'click', '.stat[data-drill]', function (e, st) { goDrill(st.dataset.drill); });
    ui.on(panel, 'keydown', '.stat[data-drill]', function (e, st) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); goDrill(st.dataset.drill); } });
  }

  function linkBtn(attr, val, label) { return '<button type="button" class="ac-link" ' + attr + '="' + esc(val) + '">' + esc(label) + '</button>'; }
  function tenderTable(sum) {
    const rows = TENDERS.map(function (t) {
      const p = tenderPred(t.id);
      let sales = 0, back = 0;
      sum.receipts.forEach(function (c) { const v = c.tenders.filter(p(c)).reduce(function (a, x) { return a + x.amount; }, 0); if (c.sign > 0) sales += v; else back += v; });
      return { t: t, sales: r2(sales), back: r2(back), net: sum.byTender[t.id] };
    });
    const any = rows.some(function (r) { return r.sales || r.back; });
    if (!any) return ui.empty({ icon: 'billing', title: 'Nothing taken', text: 'No receipts or till records on this day.' });
    return '<div class="table-wrap"><table class="table ac-table"><thead><tr><th>Tender</th><th class="num">Taken</th><th class="num">Refunded</th><th class="num">Net</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + linkBtn('data-tender', r.t.id, r.t.label) + '</td><td class="num">' + money(r.sales) + '</td><td class="num">' + (r.back ? money(-r.back) : '<span class="muted">0</span>') + '</td><td class="num primary-cell">' + money(r.net) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + money(rows.reduce(function (a, r) { return a + r.sales; }, 0)) + '</td><td class="num">' + money(-rows.reduce(function (a, r) { return a + r.back; }, 0)) + '</td><td class="num">' + money(sum.total) + '</td></tr></tfoot></table></div>';
  }
  function deptTable(sum) {
    const rows = DEPTS.filter(function (d) { return Math.abs(sum.byDept[d.id] || 0) > 0.004; });
    if (!rows.length) return ui.empty({ icon: 'reports', title: 'No departments', text: 'Departments appear as receipts are recorded.' });
    return '<div class="table-wrap"><table class="table ac-table"><thead><tr><th>Department</th><th class="num">Receipts</th><th class="num">Net</th></tr></thead><tbody>' +
      rows.map(function (d) { const n = sum.receipts.filter(function (c) { return c.dept === d.id; }).length; return '<tr><td>' + linkBtn('data-dept', d.id, d.label) + '</td><td class="num">' + n + '</td><td class="num primary-cell">' + money(sum.byDept[d.id]) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + sum.count + '</td><td class="num">' + money(sum.total) + '</td></tr></tfoot></table></div>';
  }
  /* Side lists: online card, deposits, member payments, gift cards sold, refunds. */
  const LISTS = {
    online: { title: 'Online card payments', eyebrow: 'Settled by the processor', icon: 'card', empty: 'No online card payments on this day.',
      pick: function (c) { return c.tenders.some(function (t) { return t.method === 'card' && (t.online || c.online); }); }, amount: function (c) { return tenderAmount(c, function (t) { return t.method === 'card' && (t.online || c.online); }); } },
    deposits: { title: 'Deposits taken', eyebrow: 'Weddings, events, tournaments', icon: 'calendar', empty: 'No deposits on this day.',
      pick: function (c) { return c.dept === 'functions' || c.dept === 'outings'; }, amount: function (c) { return c.sign * c.total; } },
    payments: { title: 'Member account payments', eyebrow: 'Paid toward balances', icon: 'members', empty: 'No account payments on this day.',
      pick: function (c) { return c.dept === 'payments'; }, amount: function (c) { return c.sign * c.total; } },
    gifts: { title: 'Gift cards sold', eyebrow: 'Online and at the shop', icon: 'gift', empty: 'No gift cards sold on this day.',
      pick: function (c) { return c.dept === 'giftcards'; }, amount: function (c) { return c.sign * c.total; } },
    refunds: { title: 'Refunds', eyebrow: 'Money returned', icon: 'refresh', empty: 'No refunds on this day.',
      pick: function (c) { return c.kind === 'credit' && c.tenders.some(function (t) { return t.method !== 'account'; }); }, amount: function (c) { return -c.tenders.filter(function (t) { return t.method !== 'account'; }).reduce(function (a, t) { return a + t.amount; }, 0); } }
  };
  function listDrill(sum, key) {
    const L = LISTS[key], list = sum.receipts.filter(L.pick);
    return { title: L.title, body: Dr.sec(L.title, fmt.date(sum.date), receiptTable(list, L.amount)) };
  }
  function sidePanels(sum) {
    return Object.keys(LISTS).map(function (key) {
      const L = LISTS[key], list = sum.receipts.filter(L.pick);
      const tot = r2(list.reduce(function (a, c) { return a + L.amount(c); }, 0));
      const top = list.slice(-4).reverse();
      return '<section class="panel ac-side" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(L.eyebrow) + '</div><h3>' + esc(L.title) + '</h3></div><strong class="ac-side-total">' + money(tot) + '</strong></div><div class="panel-body">' +
        (list.length ? '<ul class="list ac-mini">' + top.map(function (c) {
          return '<li class="row between"><span class="ac-mini-who"><span>' + esc(c.name || c.title) + '</span><span class="muted">' + esc((c.title && c.name ? c.title + ' · ' : '') + tenderText(c)) + '</span></span><span class="num">' + money(L.amount(c)) + '</span></li>';
        }).join('') + '</ul><div class="ac-side-foot"><button type="button" class="s-link" data-list="' + key + '">' + (list.length > top.length ? 'View all ' + list.length : 'View receipts') + '</button></div>'
          : '<p class="muted ac-side-empty">' + esc(L.empty) + '</p>') + '</div></section>';
    }).join('');
  }

  /* ---------------- Dialogs ---------------- */
  function reopenDialog(date, done) {
    const body = '<form novalidate><p class="ink-2">Reopening unlocks ' + esc(fmt.dateLong(date)) + ' so the drawers can be recounted and the day closed again. The original close stays in the log.</p><div class="form-grid">' +
      ui.field({ label: 'Reason', name: 'reason', type: 'textarea', required: true, span2: true, placeholder: 'e.g. A return was rung up after the close' }) +
      ui.field({ label: 'Reopened by', name: 'staffId', type: 'select', required: true, span2: true, options: '<option value="">Choose the staff member</option>' + Club.staff.options('') }) + '</div></form>';
    const m = ui.modal({ eyebrow: fmt.date(date), title: 'Reopen this day', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Reopen day', kind: 'danger', icon: 'refresh', onClick: function () {
      const form = ui.$('form', m.body);
      if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (d.reason.length < 5) { form.reason.classList.add('invalid'); form.reason.insertAdjacentHTML('afterend', '<span class="field-error">Give a short reason (a few words at least).</span>'); return false; }
      /* Undo puts the day back exactly as it was closed (same counts and sign-off). */
      runUndo(function () { reopen(date, d.staffId, d.reason.slice(0, 500)); },
        { message: fmt.dateShort(date) + ' reopened', undone: fmt.dateShort(date) + ' is closed again', after: function () { if (done) done(); } });
      if (done) done();
    } }] });
  }
  function floatsDialog(done) {
    const s = settings();
    const body = '<form novalidate><p class="ink-2">The cash each drawer starts the day with. These are placeholders until the club confirms its floats; a closed day keeps the float it was counted with.</p><div class="form-grid">' +
      DRAWERS.map(function (d) { return ui.field({ label: d.name + ' float', name: d.id, type: 'number', min: 0, step: 5, value: s.floats[d.id], required: true }); }).join('') +
      ui.field({ label: 'Note needed above (over/short)', name: 'tolerance', type: 'number', min: 0, step: 0.05, value: s.tolerance, required: true, hint: 'A drawer over or short by more than this needs a note at sign-off.' }) + '</div></form>';
    const m = ui.modal({ eyebrow: 'Daily close settings', title: 'Drawer floats', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save floats', kind: 'primary', icon: 'check', onClick: function () {
      const form = ui.$('form', m.body);
      if (!ui.validate(form)) return false;
      const d = ui.formData(form); let ok = true;
      DRAWERS.map(function (x) { return x.id; }).concat(['tolerance']).forEach(function (k) {
        const v = d[k];
        if (v == null || isNaN(v) || v < 0 || v > 5000) { ok = false; form[k].classList.add('invalid'); form[k].insertAdjacentHTML('afterend', '<span class="field-error">Enter an amount from $0 to $5,000.</span>'); }
        else if (k !== 'tolerance' && Math.round(v * 100) % 5) { ok = false; form[k].classList.add('invalid'); form[k].insertAdjacentHTML('afterend', '<span class="field-error">Use a multiple of 5 cents (no pennies).</span>'); }
      });
      if (!ok) return false;
      const floats = {}; DRAWERS.forEach(function (x) { floats[x.id] = r2(d[x.id]); });
      runUndo(function () { S.setObj('accountingSettings', { floats: floats, tolerance: r2(d.tolerance) }); },
        { message: 'Drawer floats saved', undone: 'Drawer floats put back', after: function () { if (done) done(); } });
      if (done) done();
    } }] });
  }

  /* ---------------- Daily close report (print) ---------------- */
  function stopPrinting() { document.body.classList.remove('ac-printing'); }
  function reportHTML(date) {
    const c = closeFor(date), locked = !!c && c.status === 'closed';
    const live = summarize(date), sum = locked && c.totals ? Object.assign({}, c.totals, { receipts: live.receipts }) : live;
    const rows = locked ? c.drawers.map(function (d) { return Object.assign({ name: drawerName(d.id), entered: true }, d); }) : drawerRows(sum, modelFor(date));
    const diff = locked ? c.cardBatch.diff : (modelFor(date).terminal == null ? null : r2(+modelFor(date).terminal - sum.byTender.card));
    const terminal = locked ? c.cardBatch.terminal : modelFor(date).terminal;
    const tRows = TENDERS.filter(function (t) { return Math.abs(sum.byTender[t.id]) > 0.004; });
    const dRows = DEPTS.filter(function (d) { return Math.abs(sum.byDept[d.id] || 0) > 0.004; });
    const tbl = function (head, body, foot) { return '<table class="ac-rep-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>' + (foot ? '<tfoot><tr>' + foot + '</tr></tfoot>' : '') + '</table>'; };
    const listRows = function (key) {
      const L = LISTS[key], list = sum.receipts.filter(L.pick);
      if (!list.length) return '<p class="ac-rep-none">None.</p>';
      return tbl('<th>Receipt</th><th>Customer</th><th>For</th><th class="num">Amount</th>', list.map(function (x) { return '<tr><td>' + esc(x.synthetic ? 'Till record' : x.no) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.title) + '</td><td class="num">' + money(L.amount(x)) + '</td></tr>'; }).join(''),
        '<td colspan="3">Total</td><td class="num">' + money(list.reduce(function (a, x) { return a + L.amount(x); }, 0)) + '</td>');
    };
    return '<article class="ac-report" aria-label="Daily close report">' +
      '<header class="ac-rep-head">' + Club.logoImg('ac-rep-logo') + '<div><div class="ac-rep-club">' + esc(Club.info.name) + '</div><h2>Daily close report</h2><div class="ac-rep-date">' + esc(fmt.dateLong(date)) + '</div></div>' +
        '<div class="ac-rep-status">' + (locked ? 'Closed' : c && c.status === 'reopened' ? 'Reopened, not closed' : 'Draft, not closed') + '</div></header>' +
      '<section class="ac-rep-kpis"><div><span>Money taken</span><strong>' + money(sum.moneyTaken) + '</strong></div><div><span>Card, terminal</span><strong>' + money(sum.byTender.card) + '</strong></div>' +
        '<div><span>Cash</span><strong>' + money(sum.byTender.cash) + '</strong></div><div><span>Card, online</span><strong>' + money(sum.byTender.onlineCard) + '</strong></div></section>' +
      '<div class="ac-rep-two"><section><h3>Tenders</h3>' + (tRows.length ? tbl('<th>Tender</th><th class="num">Net</th>', tRows.map(function (t) { return '<tr><td>' + esc(t.label) + '</td><td class="num">' + money(sum.byTender[t.id]) + '</td></tr>'; }).join(''), '<td>Total</td><td class="num">' + money(sum.total) + '</td>') : '<p class="ac-rep-none">Nothing taken.</p>') + '</section>' +
        '<section><h3>Departments</h3>' + (dRows.length ? tbl('<th>Department</th><th class="num">Net</th>', dRows.map(function (d) { return '<tr><td>' + esc(d.label) + '</td><td class="num">' + money(sum.byDept[d.id]) + '</td></tr>'; }).join(''), '<td>Total</td><td class="num">' + money(sum.total) + '</td>') : '<p class="ac-rep-none">None.</p>') + '</section></div>' +
      '<section><h3>Cash drawers</h3>' + tbl('<th>Drawer</th><th class="num">Float</th><th class="num">Cash sales</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Over / short</th>',
        rows.map(function (r) { const dr = sum.drawers[r.id] || { cash: 0 }; return '<tr><td>' + esc(r.name) + '</td><td class="num">' + money(r.float) + '</td><td class="num">' + money(dr.cash) + '</td><td class="num">' + money(r.expectedCash) + '</td><td class="num">' + (r.entered ? money(r.counted) : 'Not counted') + '</td><td class="num">' + (r.entered ? esc(overShortText(r.overShort)) : '') + '</td></tr>'; }).join(''),
        '<td colspan="5">Total over / short</td><td class="num">' + esc(overShortText(rows.filter(function (r) { return r.entered; }).reduce(function (a, r) { return a + r.overShort; }, 0))) + '</td>') +
        tbl('<th>Count</th>' + rows.map(function (r) { return '<th class="num">' + esc(r.name) + '</th>'; }).join(''), DENOMS.map(function (d) { return '<tr><td>' + esc(d.label) + '</td>' + rows.map(function (r) { const n = Math.max(0, Math.floor(+(r.counts || {})[d.key] || 0)); return '<td class="num">' + (n ? n + ' · ' + money(n * d.cents / 100) : '') + '</td>'; }).join('') + '</tr>'; }).join('')) +
        (sum.cashOutside ? '<p class="ac-rep-none">Cash taken at the office (deposits, account payments): ' + money(sum.cashOutside) + '.</p>' : '') + '</section>' +
      '<section><h3>Card batch</h3><dl class="ac-rep-kv"><div><dt>Expected (receipts)</dt><dd>' + money(sum.byTender.card) + '</dd></div><div><dt>Terminal batch</dt><dd>' + (terminal == null ? 'Not entered' : money(terminal)) + '</dd></div><div><dt>Difference</dt><dd>' + (diff == null ? '' : esc(overShortText(diff))) + '</dd></div>' +
        '<div><dt>Online card (processor)</dt><dd>' + money(sum.byTender.onlineCard) + '</dd></div></dl></section>' +
      '<section><h3>Deposits taken</h3>' + listRows('deposits') + '</section>' +
      '<section><h3>Member account payments</h3>' + listRows('payments') + '</section>' +
      '<section><h3>Gift cards sold</h3>' + listRows('gifts') + '</section>' +
      '<section><h3>Refunds</h3>' + listRows('refunds') + '</section>' +
      '<section><h3>Notes</h3><p>' + esc((locked ? c.notes : modelFor(date).notes) || 'None.') + '</p></section>' +
      '<footer class="ac-rep-sign"><div><span>Closed by</span><strong>' + (locked ? esc(staffName(c.closedBy)) : '&nbsp;') + '</strong></div><div><span>Date and time</span><strong>' + (locked ? esc(fmt.date(new Date(c.closedAt)) + ', ' + timeOf(c.closedAt)) : '&nbsp;') + '</strong></div><div><span>Reviewed by</span><strong>&nbsp;</strong></div>' +
        (c && c.reopenReason ? '<p class="ac-rep-none">Reopened ' + esc(fmt.date(new Date(c.reopenedAt))) + ' by ' + esc(staffName(c.reopenedBy)) + ': ' + esc(c.reopenReason) + '</p>' : '') + '</footer>' +
      '<p class="ac-rep-foot">Prices include taxes. Printed ' + esc(fmt.date(today()) + ', ' + timeOf(new Date().toISOString())) + '.</p>' +
    '</article>';
  }
  function openReport(date) {
    const api = ui.modal({ eyebrow: fmt.date(date), title: 'Daily close report', size: 'xl', body: reportHTML(date),
      actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Print or save as PDF', kind: 'primary', icon: 'print', onClick: function () {
        document.body.classList.add('ac-printing');
        window.addEventListener('afterprint', stopPrinting, { once: true });
        window.print();
        return false;
      } }], onClose: stopPrinting });
    if (api.duplicate) return api;
    api.el.classList.add('ac-report-modal');
    if (api.el.parentNode) api.el.parentNode.classList.add('ac-overlay');
    return api;
  }

  /* ---------------- Close history tab ---------------- */
  function tabHistory(host) {
    const panel = fresh(host);
    const closes = S.all(COLL).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    const open = openPastDays();
    const since = Club.date.addDays(today(), -30);
    const recent = closes.filter(function (c) { return c.date >= since && c.status === 'closed'; });
    const os = r2(recent.reduce(function (a, c) { return a + closeTotalsOS(c); }, 0));
    const cardOff = recent.filter(function (c) { return c.cardBatch && Math.abs(c.cardBatch.diff) > 0.004; });
    const cardDiff = r2(cardOff.reduce(function (a, c) { return a + c.cardBatch.diff; }, 0));
    const taken = r2(recent.reduce(function (a, c) { return a + (c.totals ? c.totals.moneyTaken || 0 : 0); }, 0));
    const rows = closes.map(function (c) { return { date: c.date, c: c }; });
    open.forEach(function (d) { if (!closeFor(d)) rows.push({ date: d, c: null }); });
    rows.sort(function (a, b) { return b.date.localeCompare(a.date); });
    const filt = rows.filter(function (r) { return state.hist === 'all' || (state.hist === 'closed' ? r.c && r.c.status === 'closed' : !(r.c && r.c.status === 'closed')); });

    panel.innerHTML = '<div class="ac-stats">' + Dr.tiles(ui.stats([
      { label: 'Days closed', value: recent.length, meta: 'Last 30 days' },
      { label: 'Money taken', value: taken, prefix: '$', decimals: 0, meta: 'Closed days, last 30' },
      { label: 'Cash over / short', value: overShortText(os), meta: 'Net of all drawers, last 30 days' },
      { label: 'Card differences', value: cardOff.length, meta: esc(cardOff.length ? 'Net ' + overShortText(cardDiff).toLowerCase() : 'Every batch matched') },
      { label: 'Not closed', value: open.length, meta: open.length ? 'Past days to count and sign off' : 'Every past day is closed' }
    ]), ['days', 'taken', 'os', 'card', 'open']) + '</div>' +
      '<section class="panel" data-reveal><div class="panel-head ac-hist-head"><div><div class="eyebrow">Sign-offs</div><h3>Close history</h3></div>' +
        ui.segmented([{ value: 'all', label: 'All' }, { value: 'closed', label: 'Closed' }, { value: 'open', label: 'Not closed' }], state.hist, 'hist') + '</div><div class="panel-body flush">' +
      (filt.length ? '<div class="table-wrap"><table class="table ac-table ac-hist"><thead><tr><th>Day</th><th>Status</th><th class="num">Money taken</th><th class="num">Cash over / short</th><th class="num">Card difference</th><th>Closed by</th></tr></thead><tbody>' +
        filt.map(function (r) {
          const c = r.c, closed = c && c.status === 'closed';
          const osv = c ? closeTotalsOS(c) : null, cd = c && c.cardBatch ? c.cardBatch.diff : null;
          return '<tr class="clickable" tabindex="0" data-day="' + esc(r.date) + '" aria-label="Open the close for ' + esc(fmt.date(r.date)) + '">' +
            '<td class="nowrap"><span class="primary-cell">' + esc(fmt.weekday(r.date) + ', ' + fmt.date(r.date)) + '</span></td>' +
            '<td>' + (closed ? ui.badge('Closed', 'good') : c ? ui.badge('Reopened', 'warn') : ui.badge('Not closed', 'bad')) + '</td>' +
            '<td class="num">' + (c && c.totals ? money(c.totals.moneyTaken) : '<span class="muted">Open</span>') + '</td>' +
            '<td class="num">' + (osv == null ? '' : '<span class="ac-' + osKind(osv) + '">' + esc(overShortText(osv)) + '</span>') + '</td>' +
            '<td class="num">' + (cd == null ? '' : '<span class="ac-' + osKind(cd, 0) + '">' + esc(overShortText(cd)) + '</span>') + '</td>' +
            '<td>' + (c ? esc(staffName(c.closedBy)) + '<span class="muted ac-sub">' + esc(c.status === 'reopened' ? 'Reopened: ' + (c.reopenReason || '') : timeOf(c.closedAt)) + '</span>' : '<span class="muted">Not signed off</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : ui.empty({ icon: 'cash', title: state.hist === 'open' ? 'Every past day is closed' : 'No closes yet', text: state.hist === 'open' ? 'Nothing waiting for a count.' : 'Days appear here once they are signed off on the Daily close tab.' })) +
      '</div></section>';

    function openDay(d) { state.date = d; if (tabsApi) tabsApi.activate('close'); }
    ui.on(panel, 'click', 'tr[data-day]', function (e, tr) { openDay(tr.dataset.day); });
    ui.on(panel, 'keydown', 'tr[data-day]', function (e, tr) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(tr.dataset.day); } });
    ui.on(panel, 'click', '.segmented button', function (e, b) { state.hist = b.dataset.value; tabHistory(host); ui.animateIn(host); });
    const dayRows = function (list) {
      return list.length ? Dr.table([{ label: 'Day' }, { label: 'Cash over / short', num: true }, { label: 'Card difference', num: true }, { label: 'Closed by' }],
        list.map(function (c) { return ['<a href="#/accounting/close/' + esc(c.date) + '">' + esc(fmt.date(c.date)) + '</a>', esc(overShortText(closeTotalsOS(c))), esc(overShortText(c.cardBatch ? c.cardBatch.diff : 0)), esc(staffName(c.closedBy))]; })) : Dr.empty('Nothing to show', 'No closed days in the last 30 days.', 'cash');
    };
    const drills = {
      days: function () { return { title: 'Days closed', body: Dr.sec('Last 30 days', recent.length + ' days', dayRows(recent)) }; },
      taken: function () { return { title: 'Money taken', body: Dr.sec('Closed days', 'Card, cash and other', recent.length ? Dr.table([{ label: 'Day' }, { label: 'Terminal card', num: true }, { label: 'Cash', num: true }, { label: 'Online card', num: true }, { label: 'Total', num: true }],
        recent.map(function (c) { const t = c.totals || { byTender: emptyTenders() }; return ['<a href="#/accounting/close/' + esc(c.date) + '">' + esc(fmt.dateShort(c.date)) + '</a>', money(t.byTender.card), money(t.byTender.cash), money(t.byTender.onlineCard), money(t.moneyTaken)]; }),
        ['<strong>Total</strong>', '', '', '', '<strong>' + money(taken) + '</strong>']) : Dr.empty('Nothing to show', 'No closed days in the last 30 days.', 'cash')) }; },
      os: function () {
        const off = recent.filter(function (c) { return Math.abs(closeTotalsOS(c)) > 0.004; });
        return { title: 'Cash over / short', body: Dr.kpis([{ label: 'Net', value: overShortText(os) }, { label: 'Days off', value: String(off.length) }, { label: 'Days balanced', value: String(recent.length - off.length) }]) + Dr.sec('Days not balanced', 'Last 30 days', dayRows(off)) };
      },
      card: function () { return { title: 'Card differences', body: Dr.sec('Batches that did not match', 'Last 30 days', dayRows(cardOff)) }; },
      open: function () {
        return { title: 'Not closed', body: open.length ? Dr.table([{ label: 'Day' }, { label: 'Status' }], open.map(function (d) { const c = closeFor(d); return ['<a href="#/accounting/close/' + esc(d) + '">' + esc(fmt.weekday(d) + ', ' + fmt.date(d)) + '</a>', c ? 'Reopened: ' + esc(c.reopenReason || '') : 'Never closed']; }))
          : Dr.empty('Every past day is closed', 'Nothing is waiting for a count.', 'check') };
      }
    };
    ui.on(panel, 'click', '.stat[data-drill]', function (e, st) { const fn = drills[st.dataset.drill]; if (fn) openDrill(Object.assign({ eyebrow: 'Close history' }, fn())); });
    ui.on(panel, 'keydown', '.stat[data-drill]', function (e, st) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); const fn = drills[st.dataset.drill]; if (fn) openDrill(Object.assign({ eyebrow: 'Close history' }, fn())); } });
  }

  /* ---------------- Page shell and routing ---------------- */
  let tabsApi = null;
  function replaceHash() {
    const h = state.tab === 'close' ? (state.date && state.date !== today() ? '#/accounting/close/' + state.date : '#/accounting') : '#/accounting/' + state.tab;
    try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { /* file:// may refuse */ }
  }
  function extraTabs() {
    const q = Array.isArray(window.__accountingTabs) ? window.__accountingTabs : [];
    const seen = {};
    return q.filter(function (t) { if (!t || !t.id || seen[t.id] || t.id === 'close' || t.id === 'history' || typeof t.render !== 'function') return false; seen[t.id] = 1; return true; })
      .slice().sort(function (a, b) { return (+a.order || 50) - (+b.order || 50); });
  }
  function render(view, params) {
    const extra = extraTabs();
    const ids = ['close', 'history'].concat(extra.map(function (t) { return t.id; }));
    if (params[0] === 'close') { state.tab = 'close'; if (validDate(params[1])) state.date = params[1] > today() ? today() : params[1]; }
    else if (params[0] && ids.indexOf(params[0]) >= 0) state.tab = params[0];
    else if (!params[0]) { state.tab = 'close'; state.date = today(); }
    if (ids.indexOf(state.tab) < 0) state.tab = 'close';
    const open = openPastDays().length;
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Administration', title: 'Accounting',
      subtitle: esc('Daily close for the golf shop, the Gallery and the beverage cart. ' + (open ? open + (open === 1 ? ' past day is' : ' past days are') + ' not closed.' : 'Every past day is closed.'))
    }) + '<div class="ac-tabs"></div>';
    function ctx() { return { date: state.date || today(), params: params, go: function (p) { Club.app.go(p); }, refresh: function () { if (tabsApi) tabsApi.activate(state.tab); } }; }
    const tabs = [{ id: 'close', label: 'Daily close', render: tabClose }, { id: 'history', label: 'Close history', render: tabHistory }].concat(extra.map(function (t) {
      return { id: t.id, label: t.label, render: function (panel) { try { t.render(panel, ctx()); } catch (e) { console.error(e); panel.innerHTML = ui.empty({ icon: 'alert', title: 'This tab could not load', text: e.message }); } } };
    }));
    tabsApi = ui.tabs(ui.$('.ac-tabs', view), tabs, state.tab, function (id) { state.tab = id; replaceHash(); });
    /* Receipts recorded elsewhere (another tab, a sale at the till) refresh the close unless someone is typing in it. */
    let t = null;
    function refresh() {
      clearTimeout(t);
      t = setTimeout(function () {
        if (state.tab !== 'close' && state.tab !== 'history') return;
        const a = document.activeElement;
        if (Date.now() - lastDraw < 800 || document.querySelector('.overlay') || (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
        tabsApi.activate(state.tab);
      }, 300);
    }
    const unsubs = ['receipts', COLL, '$accountingSettings'].map(function (c) { return S.subscribe(c, refresh); });
    return function () { clearTimeout(t); unsubs.forEach(function (u) { u(); }); tabsApi = null; };
  }

  Club.accounting = {
    DRAWERS: DRAWERS, DEPTS: DEPTS, TENDERS: TENDERS, DENOMS: DENOMS,
    classify: classify, summarize: summarize, closeFor: closeFor, isClosed: isClosed, settings: settings,
    depositReceipt: depositReceipt, depositReversed: depositReversed, depositReceiptFor: depositReceiptFor, openReport: openReport, openPastDays: openPastDays,
    undoSettle: undoSettle, undoOffer: offerUndo, undoRun: runUndo
  };

  Club.register({
    id: 'accounting', label: 'Accounting', icon: 'cash', section: 'Administration', order: 15,
    badge: function () { const n = openPastDays().length; return n || null; },
    search: function (q) {
      if (!/^(daily|close|clos|cash|drawer|accounting|over|batch)/.test(q)) return [];
      const t = today(), c = closeFor(t);
      return [{ label: 'Daily close, today', sub: c && c.status === 'closed' ? 'Closed by ' + staffName(c.closedBy) : 'Open · count drawers and sign off', href: 'accounting', icon: 'cash' },
        { label: 'Close history', sub: openPastDays().length + ' past days not closed', href: 'accounting/history', icon: 'cash' }];
    },
    render: render
  });
})();
