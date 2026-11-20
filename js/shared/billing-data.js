/* Billing data: the charges, payments and statements seed, the overdue sweep, Club.billing.aging, Club.billing.renewal (next
   season's renewals and the time payment plan) and the club's billing policies (F&B assessment Club.billing.fnb, account
   standing Club.billing.standing, refunds Club.billing.refunds; see "Billing policies" below).
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/billing.js, which reads these helpers from Club.shared.billing. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Stored values stay ACH/Card/Check for the shared data model; shown with Canadian names. */
  const METHOD_LABEL = { ACH: 'Pre-authorized debit', EFT: 'EFT (bank transfer)', Card: 'Card', Debit: 'Debit card', Cash: 'Cash', Check: 'Cheque' };
  function methodLabel(m) { return METHOD_LABEL[m] || m || ''; }
  const DUE_DAYS = 20;

  /* ---------------- Helpers ---------------- */
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  function today() { return Club.date.today(); }
  /** A charge that still stands: not reversed by an undo or a correction, and not itself a reversal. */
  function live(c) { return !c.reversedBy && !c.reverses; }
  function mkey(iso) { return String(iso || '').slice(0, 7); }
  function addMonths(key, n) { const p = key.split('-').map(Number); const d = new Date(p[0], p[1] - 1 + n, 1, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthName(key) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, 1, 12).toLocaleDateString('en-US', { month: 'long' }); }
  function monthEnd(key) { const p = key.split('-').map(Number); return S.iso(new Date(p[0], p[1], 0, 12)); }
  function days(a, b) { return Math.round((fmt.toDate(b) - fmt.toDate(a)) / 86400000); }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (+(f ? f(x) : x) || 0); }, 0); }
  function byDate(a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)); }

  /* ---------------- Seed (once): three months of house account activity ---------------- */
  const CATALOG = {
    /* Green fees are the published public rates (tax included). Cart, event and lesson prices are placeholders. */
    Golf: [['Guest green fee, weekday', 66, 66], ['Guest green fee, weekend', 76, 76], ['Power cart, 18 holes', 40, 40], ['Guest green fee and power cart', 106, 116], ['Power cart, 9 holes', 25, 25]],
    'Pro Shop': [['Titleist Pro V1, one dozen', 69.99, 69.99], ['St. Boniface crest polo', 89.99, 89.99], ['St.B logo cap', 34.99, 34.99], ['FootJoy Pro|SL shoes', 219.99, 219.99], ['Regrip, full set', 90, 140], ['Vokey wedge', 249.99, 249.99]],
    Dining: [['Gallery Taphouse & Grill lunch', 18, 70], ['Gallery Taphouse & Grill dinner', 40, 160], ['Patio', 20, 90], ['Taphouse Bar', 12, 80], ['Gallery Taphouse & Grill breakfast', 12, 40], ['Meeting room booking', 150, 450]],
    Events: [['Member-guest entry', 150, 150], ['Club championship entry', 75, 75], ['Members\u2019 league night', 35, 35], ['Club event entry', 45, 90], ['Holiday party, two tickets', 90, 140]],
    Lessons: [['Private lesson, 60 minutes', 95, 95], ['Playing lesson, 9 holes', 150, 150], ['Club fitting session', 75, 75], ['Junior Golf program', 120, 120], ['SIM teaching session', 60, 60]]
  };
  const SRC = { Golf: 'teesheet', 'Pro Shop': 'proshop', Dining: 'dining', Events: 'events', Lessons: 'lessons' };

  function seedBilling() {
    R.reseed(2020);
    const T = today(); const cur = mkey(T); const tDay = +T.slice(8, 10);
    const months = [addMonths(cur, -2), addMonths(cur, -1), cur];
    const tiers = {}; S.all('membershipTiers').forEach(function (t) { tiers[t.id] = t; });
    const members = S.all('members');
    const mine = []; let n = 0;
    function dayIn(key, a, b) {
      const last = key === cur ? tDay : +monthEnd(key).slice(8, 10);
      const lo = Math.min(a, last), hi = Math.max(lo, Math.min(b, last));
      return key + '-' + String(R.int(lo, hi)).padStart(2, '0');
    }
    function add(m, c) { mine.push(Object.assign({ id: 'chg_s' + (++n), memberId: m.id, refId: null, statementId: null, createdAt: c.date + 'T12:00:00.000Z' }, c)); }
    function item(m, cat, key) {
      const it = R.pick(CATALOG[cat]); const amt = it[1] === it[2] ? it[1] : r2(it[1] + R.rand() * (it[2] - it[1]));
      add(m, { date: dayIn(key, 2, 28), description: it[0], category: cat, amount: amt, source: SRC[cat] });
    }
    const behaviour = {};
    members.forEach(function (m, i) {
      const t = tiers[m.tierId]; const golfer = t ? t.golf : true;
      let b = 'good';
      if (m.status === 'suspended' || i % 28 === 6) b = 'delinquent';
      else if (i % 22 === 3) b = 'late';
      else if (i % 29 === 4) b = 'partial';
      behaviour[m.id] = b;
      if (b === 'delinquent' && i % 2 === 0) add(m, { date: Club.date.fromToday(-R.int(100, 120)), description: 'Balance brought forward', category: 'Other', amount: r2(600 + R.rand() * 1800), source: 'billing', refId: 'opening' });
      if (m.status === 'resigned') return;
      months.forEach(function (key) {
        if (m.status === 'active' && t) add(m, { date: key + '-01', description: monthName(key) + ' dues instalment, ' + t.name + ' membership', category: 'Dues', amount: r2(t.annualDues / 12), source: 'billing', refId: 'dues-' + key });
        if (m.status === 'leave') return;
        const k = R.int(1, 4); for (let j = 0; j < k; j++) item(m, 'Dining', key);
        if (golfer) { const g = R.int(0, 3); for (let j = 0; j < g; j++) item(m, 'Golf', key); }
        if (R.chance(0.45)) item(m, 'Pro Shop', key);
        if (R.chance(0.3)) item(m, 'Events', key);
        if (golfer && R.chance(0.22)) item(m, 'Lessons', key);
      });
    });

    const charges = S.all('charges').concat(mine);
    const payments = []; let pn = 0;
    function owedIn(mid, key, includeOlder) {
      return r2(sum(charges.filter(function (c) { return c.memberId === mid && (mkey(c.date) === key || (includeOlder && mkey(c.date) < key)); }), function (c) { return c.amount; }));
    }
    members.forEach(function (m) {
      const b = behaviour[m.id];
      [months[0], months[1]].forEach(function (key, idx) {
        if (b === 'delinquent') return;
        if (b === 'late' && idx === 1) return;
        let amt = owedIn(m.id, key, idx === 0);
        if (b === 'partial' && idx === 1) amt = r2(Math.round(amt * 0.5 / 50) * 50);
        if (amt <= 0) return;
        const nextKey = addMonths(key, 1); const date = nextKey + '-' + String(R.int(5, 19)).padStart(2, '0');
        if (date > T) return;
        const method = R.pick(['ACH', 'ACH', 'ACH', 'Card', 'Check']);
        payments.push({ id: 'pay_s' + (++pn), memberId: m.id, date: date, amount: amt, method: method, reference: method === 'Check' ? 'Cheque ' + R.int(1100, 4800) : method === 'ACH' ? 'Pre-authorized debit ' + R.int(10000, 99999) : 'Card ending ' + R.int(1000, 9999), createdAt: date + 'T12:00:00.000Z' });
      });
    });

    /* Statements for the two closed months, linked to their charges */
    const stmts = [];
    [months[0], months[1]].forEach(function (key) {
      const start = key + '-01', end = monthEnd(key);
      const issued = addMonths(key, 1) + '-01'; const due = Club.date.addDays(issued, DUE_DAYS);
      members.forEach(function (m) {
        const pc = charges.filter(function (c) { return c.memberId === m.id && c.date >= start && c.date <= end; });
        const pp = payments.filter(function (p) { return p.memberId === m.id && p.date >= start && p.date <= end; });
        if (!pc.length && !pp.length) return;
        const opening = r2(sum(charges.filter(function (c) { return c.memberId === m.id && c.date < start; }), function (c) { return c.amount; }) - sum(payments.filter(function (p) { return p.memberId === m.id && p.date < start; }), function (p) { return p.amount; }));
        const ch = r2(sum(pc, function (c) { return c.amount; })), pa = r2(sum(pp, function (p) { return p.amount; }));
        const total = r2(opening + ch - pa);
        const paidAfter = sum(payments.filter(function (p) { return p.memberId === m.id && p.date > end; }), function (p) { return p.amount; });
        const id = 'stm_' + key.replace('-', '') + '_' + m.id;
        pc.forEach(function (c) { c.statementId = id; });
        stmts.push({ id: id, memberId: m.id, period: key, issuedOn: issued, dueOn: due, openingBalance: opening, chargesTotal: ch, paymentsTotal: pa, total: total, status: total <= 0.005 || paidAfter >= total - 0.005 ? 'paid' : (due < T ? 'overdue' : 'sent'), sentOn: issued, createdAt: issued + 'T09:00:00.000Z' });
      });
    });

    S.replace('charges', charges);
    S.replace('payments', S.all('payments').concat(payments));
    S.replace('statements', S.all('statements').concat(stmts));
    /* Reconcile every member balance with the ledger, once. */
    const bal = {};
    S.all('charges').forEach(function (c) { bal[c.memberId] = (bal[c.memberId] || 0) + (+c.amount || 0); });
    S.all('payments').forEach(function (p) { bal[p.memberId] = (bal[p.memberId] || 0) - (+p.amount || 0); });
    const ms = S.all('members'); ms.forEach(function (m) { m.balance = r2(bal[m.id] || 0); });
    S.replace('members', ms);
    const runs = {};
    months.forEach(function (key) {
      const d = mine.filter(function (c) { return c.refId === 'dues-' + key; });
      runs[key] = { postedOn: key + '-01', count: d.length, total: r2(sum(d, function (c) { return c.amount; })) };
    });
    S.setObj('billingDuesRuns', runs);
    S.setObj('billingSeeded', true);
  }
  try { if (!S.getObj('billingSeeded', false)) seedBilling(); } catch (e) { console.error('Billing seed failed', e); }

  function sweepOverdue() {
    const T = today();
    S.all('statements').forEach(function (s) { if (s.status === 'sent' && s.dueOn && s.dueOn < T && (s.total || 0) > 0.005) S.update('statements', s.id, { status: 'overdue' }); });
  }
  sweepOverdue();

  /* ---------------- Ledger maths ---------------- */
  function agingAll(asOf) {
    asOf = asOf || today();
    const chBy = {}, pyBy = {};
    /* A charge and the reversal that undid it cancel out, so both are left out: otherwise the reversal's credit would be
       spent on the member's oldest charges and make a past-due balance look current. */
    S.all('charges').forEach(function (c) { if (live(c)) (chBy[c.memberId] = chBy[c.memberId] || []).push(c); });
    S.all('payments').forEach(function (p) { (pyBy[p.memberId] = pyBy[p.memberId] || []).push(p); });
    const out = {};
    const ids = Object.keys(chBy).concat(Object.keys(pyBy).filter(function (k) { return !chBy[k]; }));
    ids.forEach(function (id) {
      const list = (chBy[id] || []).slice().sort(byDate);
      let credit = sum(pyBy[id] || [], function (p) { return p.amount; }) + sum(list.filter(function (c) { return c.amount < 0; }), function (c) { return -c.amount; });
      const b = { current: 0, d30: 0, d60: 0, d90: 0 };
      list.forEach(function (c) {
        if (c.amount <= 0) return;
        let open = +c.amount; const use = Math.min(open, credit); open -= use; credit -= use;
        if (open > 0.004) { const age = days(c.date, asOf); if (age > 90) b.d90 += open; else if (age > 60) b.d60 += open; else if (age > 30) b.d30 += open; else b.current += open; }
      });
      Object.keys(b).forEach(function (k) { b[k] = r2(b[k]); });
      b.total = r2(b.current + b.d30 + b.d60 + b.d90 - credit);
      b.pastDue = r2(b.d30 + b.d60 + b.d90);
      b.credit = r2(credit);
      out[id] = b;
    });
    return out;
  }
  function agingFor(id) { return agingAll()[id] || { current: 0, d30: 0, d60: 0, d90: 0, total: 0, pastDue: 0, credit: 0 }; }

  Club.billing = { aging: agingFor, methodLabel: methodLabel };

  /* ================= Billing policies =================
     From the club's 2025 Membership Handbook, Clubhouse policies (pages 16 to 18). The owner approved making the system
     follow them (Nov 20, 2026). Stored text stays English (Club.fmtEn); the portal translates it (js/i18n/fr-portal.js).
       1. Food & Beverage Assessment   Club.billing.fnb
       2. Credit and accounts receivable   Club.billing.standing(memberId), chargeCheck, overrides, flags
       3. Time payment plan   Club.billing.renewal (plan 'monthly' is the time payment plan)
       4. Refund of dues   Club.billing.refunds (the staff dialog is in js/modules/billing.js)
     Draw-down lines are written with Club.storeRaw (js/core/ui.js), outside Club.undo: the F&B credit is recomputed from
     the ledger whenever a Dining or assessment charge posts, so an Undo of the purchase returns the credit by itself. */
  const FE = Club.fmtEn || Club.fmt;
  const RAW = Club.storeRaw || { insert: S.insert, update: S.update };
  function rawInsert(coll, doc) { return RAW.insert.call(S, coll, doc); }
  function rawUpdate(coll, id, patch) { return RAW.update.call(S, coll, id, patch); }
  function phone() { return (Club.info && Club.info.phone) || 'the club office'; }

  /* ---------------- 1. Food & Beverage Assessment ----------------
     Handbook: "All adult members are required to pre-pay a Food and Beverage Assessment of $375.00 each season (April 1st
     to October 31st). The Assessment will be set up as a credit on your account; and all food and beverage purchases made
     in the clubhouse or on the golf course refreshment carts will work on a declining balance against the credit. This
     Assessment is non-transferable. Gratuities are NOT applied against the Assessment."
     Ledger:
       assessment  charge, category 'F&B assessment', refId 'fnb-<year>', +375 (a receipt; a dues-like charge)
       draw-down   charge, category 'F&B assessment', refId 'fnbdraw-<year>', negative ('F&B credit applied: ...'), fnbFor
                   = the Dining charge it paid; a positive line returns credit after a refund or an undone purchase
     The credit used in a season is min(assessed, F&B purchases in the season less gratuities), so it always follows the
     ledger. F&B purchases are every Dining charge (Gallery checks, takeout, the beverage cart, banquets on account),
     dated in the season; a credit or reversal belongs to the season of the purchase it refunds. Whatever is left on
     October 31 expires (non-transferable, no carry-over). Reports leave the 'F&B assessment' category out of revenue:
     food and drink count when they are bought, as Dining.
     Adult categories: every category except Junior (under 18): Eagle, Eagle 60+, Eagle INT, Birdie, Birdie INT, Young
     Adult (ages 19 to 23), Social and Club House, and any category added later. A category can say otherwise with
     fnbAssessment: true|false. The amount can be changed with the 'fnbAssessment' setting { amount }. */
  const FNB_CAT = 'F&B assessment';
  const FNB_AMOUNT = 375;
  const FNB_NOT = { tier_nonresident: true };   /* Junior (under 18) */
  const GRAT = /^(service charge|gratuity|gratuities|tip|tips)\b/i;
  function fnbAmount() { const v = S.getObj('fnbAssessment', null); return v && +v.amount > 0 ? r2(v.amount) : FNB_AMOUNT; }
  function fnbTier(t) { if (!t) return false; if (t.fnbAssessment != null) return !!t.fnbAssessment; return !FNB_NOT[t.id]; }
  function fnbAdult(m) { return !!m && fnbTier(S.find('membershipTiers', m.tierId)); }
  function seasonApi() { return Club.season; }
  function fnbYearOf(date) { return date && seasonApi() && seasonApi().inSeason(date) ? +String(date).slice(0, 4) : null; }
  function isFnbPurchase(c) { return !!c && c.category === 'Dining' && !(c.refId && String(c.refId).indexOf('fbmin-') === 0); }
  function eligible(c) { return r2((+c.amount || 0) - (+c.fnbGratuity || 0)); }
  function chargesOf(memberId) { return S.all('charges').filter(function (c) { return c.memberId === memberId; }); }
  /** The charge a reversal undoes: same account, category, reference and opposite amount, not yet reversed. */
  function reversedOriginal(memberId, x, list) {
    if (!/^(Reversed|Charged again): /.test(x.description || '')) return null;
    const base = String(x.description).replace(/^(Reversed|Charged again): /, '');
    const cands = (list || chargesOf(memberId)).filter(function (c) {
      return c.id !== x.id && !c.reversedBy && c.category === x.category && (c.refId || null) === (x.refId || null) && r2(c.amount) === r2(-x.amount) &&
        String(c.description || '').replace(/^(Reversed|Charged again): /, '') === base;
    });
    return cands.length ? cands[cands.length - 1] : null;
  }
  /** The season a Dining charge counts in: a credit counts in the season of the purchase it refunds. */
  function purchaseYear(c, list) {
    let d = c.date;
    if ((+c.amount || 0) < 0 && c.refId) {
      const o = list.find(function (x) { return x.id !== c.id && x.refId === c.refId && x.category === 'Dining' && (+x.amount || 0) > 0; });
      if (o) d = o.date;
    }
    return fnbYearOf(d);
  }
  function fnbFigures(list, year, ignore) {
    let assessed = 0, drawn = 0, spent = 0, charge = null;
    list.forEach(function (c) {
      if (c.category === FNB_CAT) {
        if (c.refId === 'fnb-' + year) { assessed += +c.amount || 0; if ((+c.amount || 0) > 0 && live(c)) charge = c; }
        else if (c.refId === 'fnbdraw-' + year) drawn -= +c.amount || 0;
        return;
      }
      if (!isFnbPurchase(c) || (ignore && ignore[c.id]) || c.reversedBy || c.reverses) return;
      if (purchaseYear(c, list) === year) spent += eligible(c);
    });
    assessed = r2(Math.max(0, assessed));
    return { assessed: assessed, drawn: r2(drawn), spent: r2(spent), target: r2(Math.max(0, Math.min(assessed, spent))), charge: charge };
  }
  /** Bring the credit used in a season in line with the ledger. Posts one draw-down (or return) line for the difference. */
  function fnbReconcile(memberId, year, o) {
    o = o || {};
    const list = chargesOf(memberId);
    const f = fnbFigures(list, year, o.ignore);
    const diff = r2(f.target - f.drawn);
    if (Math.abs(diff) < 0.005) return { f: f, line: null, applied: 0 };
    const fc = o.forCharge || null;
    const what = fc ? String(fc.description || '').replace(/^(Reversed|Charged again): /, '') : '';
    const line = rawInsert('charges', { memberId: memberId, date: fc && fc.date ? fc.date : today(),
      description: (diff > 0 ? 'F&B credit applied' : 'F&B credit returned') + (what ? ': ' + what : ', ' + year + ' season'),
      category: FNB_CAT, amount: -diff, source: 'billing', refId: 'fnbdraw-' + year, fnbFor: fc ? fc.id : null, statementId: null });
    const m = S.find('members', memberId);
    if (m) rawUpdate('members', memberId, { balance: r2((m.balance || 0) - diff) });
    return { f: Object.assign({}, f, { drawn: f.target }), line: line, applied: diff };
  }
  /** Before a charge is inserted (Club.chargeMember): note the gratuity part of a Dining charge. */
  function fnbPrepare(memberId, fields, c) {
    if (fields.category !== 'Dining') return;
    const amt = r2(fields.amount);
    let g = 0;
    if (c.gratuity != null) g = +c.gratuity || 0;
    else if (Array.isArray(c.lines)) g = sum(c.lines.filter(function (l) { return l && GRAT.test(String(l.name || '')); }), function (l) { return (+l.qty || 1) * (+l.price || 0); });
    if (amt < 0 && !g) { const o = reversedOriginal(memberId, fields); if (o) g = Math.abs(+o.fnbGratuity || 0); }
    g = r2(Math.min(Math.abs(g), Math.abs(amt)));
    if (g > 0.004) fields.fnbGratuity = amt < 0 ? -g : g;
  }
  /** After a charge is inserted: pay a Dining charge from the F&B credit (or return credit for a refund). Returns the
      receipt note, or null. */
  function fnbAfter(ch) {
    if (ch.category === FNB_CAT) { const mm = /^fnb-(\d{4})$/.exec(ch.refId || ''); if (mm) fnbReconcile(ch.memberId, +mm[1]); return null; }
    if (!isFnbPurchase(ch)) return null;
    const list = chargesOf(ch.memberId);
    const ignore = {};
    let year;
    const o = ch.amount < 0 ? reversedOriginal(ch.memberId, ch, list) : null;
    if (o) { ignore[o.id] = 1; ignore[ch.id] = 1; year = fnbYearOf(o.date); } else year = purchaseYear(ch, list);
    if (!year) return null;
    const r = fnbReconcile(ch.memberId, year, { forCharge: ch, ignore: ignore });
    if (!(ch.amount > 0) || !(r.applied > 0.004)) return null;
    const left = r2(r.f.assessed - r.f.drawn);
    return 'Paid from your ' + year + ' F&B credit: ' + FE.money(r.applied) + '. F&B credit left: ' + FE.money(left) + ' of ' + FE.money(r.f.assessed) + '.' +
      (ch.fnbGratuity ? ' Service charges and gratuities are not paid from the F&B credit.' : '');
  }
  /** The season to show today: the one under way, or the last one until the next opens. */
  function fnbYear(asOf) {
    const T = asOf || today(), y = +T.slice(0, 4), sa = seasonApi();
    return sa && T < sa.start(y) ? y - 1 : y;
  }
  /** A member's F&B credit for a season: { applies, year, amount, assessed, used, left, spent, start, end, status
      ('upcoming'|'open'|'ended'), expired, charge, next } */
  function fnbState(memberId, year, asOf) {
    const T = asOf || today(), m = S.find('members', memberId), sa = seasonApi();
    year = year || fnbYear(T);
    const f = fnbFigures(chargesOf(memberId), year);
    const start = sa ? sa.start(year) : year + '-04-01', end = sa ? sa.end(year) : year + '-10-31';
    const status = T < start ? 'upcoming' : T > end ? 'ended' : 'open';
    const used = r2(Math.max(0, Math.min(f.drawn, f.assessed))), left = r2(Math.max(0, f.assessed - used));
    return { applies: fnbAdult(m), year: year, amount: fnbAmount(), assessed: f.assessed, used: used, left: left, spent: f.spent,
      start: start, end: end, status: status, expired: status === 'ended' ? left : 0, charge: f.charge,
      next: status === 'ended' ? (sa ? sa.start(year + 1) : (year + 1) + '-04-01') : null };
  }
  function hasAssessment(memberId, year) {
    return chargesOf(memberId).some(function (c) { return c.category === FNB_CAT && c.refId === 'fnb-' + year && (+c.amount || 0) > 0 && live(c); });
  }
  /** Charge a member's assessment for a season (a dues-like charge with a receipt). { charge } or { error } or { duplicate }. */
  function fnbPost(memberId, year, o) {
    o = o || {};
    const m = S.find('members', memberId);
    if (!m) return { error: 'That member could not be found.' };
    if (!fnbAdult(m)) return { error: 'The F&B assessment applies to adult members only.' };
    if (hasAssessment(memberId, year)) return { duplicate: true };
    const amt = fnbAmount(), title = year + ' Food and Beverage Assessment';
    const ch = Club.chargeMember(memberId, { description: title, category: FNB_CAT, amount: amt, source: 'billing', refId: 'fnb-' + year, date: o.date || today(),
      title: title, lines: [{ name: 'Food and Beverage Assessment, ' + year + ' season (' + (seasonApi() ? seasonApi().dayLabel() : 'April 1 to October 31') + '), set up as an F&B credit', qty: 1, price: amt }] });
    return ch ? { charge: ch } : { error: 'The assessment could not be posted.' };
  }
  /** Adult members who are active and have no assessment for the season yet. */
  function fnbToPost(year) {
    return S.all('members').filter(function (m) { return m.status === 'active' && fnbAdult(m) && !hasAssessment(m.id, year); });
  }
  /** On the season's opening day (or the first page load after it), every active adult member without an assessment
      for the season is charged it, dated that day. A member who becomes active later in the season is charged on the
      next page load. */
  function fnbPostDue() {
    const T = today(), y = +T.slice(0, 4), sa = seasonApi();
    if (!sa || !sa.inSeason(T)) return 0;
    let n = 0;
    fnbToPost(y).forEach(function (m) { if (fnbPost(m.id, y, { date: T }).charge) n++; });
    return n;
  }
  function fnbReconcileAll() {
    const by = {};
    S.all('charges').forEach(function (c) { if (c.category === FNB_CAT && /^fnb(draw)?-\d{4}$/.test(c.refId || '')) (by[c.memberId] = by[c.memberId] || {})[String(c.refId).slice(-4)] = 1; });
    let n = 0;
    Object.keys(by).forEach(function (mid) { if (!S.find('members', mid)) return; Object.keys(by[mid]).forEach(function (y) { if (fnbReconcile(mid, +y).line) n++; }); });
    return n;
  }
  /* Demo, once ('demoBackfills' marker 'fnbAssessment1'): every active adult member gets the assessment for the season
     on file (2026 in this demo, charged April 1), and the credit
     then pays their first in-season Dining charges in date order, one draw-down line per purchase, gratuities left out.
     What members owe today does not change: the demo's monthly payments already covered those Dining charges, so they
     now count as paying the assessment, and any part of the credit left unused was pre-paid by pre-authorized debit a
     week after April 1. Reports revenue does not change (the assessment and its draw-downs are not revenue). */
  const FNB_MARK = 'fnbAssessment1';
  function fnbDemo() {
    if (S.find('demoBackfills', FNB_MARK) || !S.getObj('billingSeeded', false) || !S.all('members').length) return;
    const year = fnbYear(), sa = seasonApi(); if (!sa) return;
    const start = sa.start(year), end = sa.end(year), T = today();
    if (T < start) return;
    const amt = fnbAmount(), charges = S.all('charges').slice(), payments = S.all('payments').slice(), made = [];
    let nc = 0, np = 0, nd = 0;
    S.all('members').filter(function (m) { return m.status === 'active' && fnbAdult(m); }).forEach(function (m) {
      const mine = charges.filter(function (c) { return c.memberId === m.id; });
      if (mine.some(function (c) { return c.category === FNB_CAT && c.refId === 'fnb-' + year; })) return;
      const ach = { id: 'chg_fnb' + year + '_' + m.id, memberId: m.id, date: start, description: year + ' Food and Beverage Assessment', category: FNB_CAT, amount: amt, source: 'billing',
        refId: 'fnb-' + year, statementId: null, createdAt: start + 'T09:00:00.000Z', demo: FNB_MARK };
      charges.push(ach); nc++;
      let left = amt, used = 0;
      mine.filter(function (c) { return isFnbPurchase(c) && (+c.amount || 0) > 0 && live(c) && c.date >= start && c.date <= end && c.date <= T; }).sort(byDate).forEach(function (c, i) {
        if (left <= 0.004) return;
        const take = r2(Math.min(left, eligible(c))); if (!(take > 0.004)) return;
        left = r2(left - take); used = r2(used + take);
        charges.push({ id: 'chg_fnbd' + year + '_' + m.id + '_' + i, memberId: m.id, date: c.date, description: 'F&B credit applied: ' + c.description, category: FNB_CAT, amount: -take, source: 'billing',
          refId: 'fnbdraw-' + year, fnbFor: c.id, statementId: null, createdAt: c.date + 'T12:30:00.000Z', demo: FNB_MARK });
        nd++;
      });
      /* What the credit did not use is paid by pre-authorized debit a week after the assessment; the rest was already
         paid, since the demo's monthly payments covered the Dining charges the credit now pays. */
      const rest = r2(amt - used), payDate = Club.date.addDays(start, 6) <= T ? Club.date.addDays(start, 6) : start;
      const pay = rest > 0.004 ? { id: 'pay_fnb' + year + '_' + m.id, memberId: m.id, date: payDate, amount: rest, method: 'ACH', reference: 'Pre-authorized debit, ' + year + ' F&B assessment', createdAt: payDate + 'T09:00:00.000Z', demo: FNB_MARK } : null;
      if (pay) { payments.push(pay); np++; }
      made.push([ach, pay]);
    });
    S.replace('charges', charges);
    S.replace('payments', payments);
    if (Club.receipts) made.forEach(function (x) {
      try {
        Club.receipts.create({ memberId: x[0].memberId, title: x[0].description, date: x[0].date, lines: [{ name: 'Food and Beverage Assessment, ' + year + ' season (' + sa.dayLabel() + '), set up as an F&B credit', qty: 1, price: amt }],
          total: amt, method: 'account', source: 'billing', refId: x[0].refId, chargeId: x[0].id });
        if (x[1]) Club.receipts.create({ memberId: x[1].memberId, title: 'Account payment', date: x[1].date, lines: [{ name: 'Payment on account', qty: 1, price: x[1].amount }], total: x[1].amount,
          method: 'other', methodLabel: methodLabel('ACH'), source: 'billing', refId: x[1].id, paymentId: x[1].id, note: 'Reference ' + x[1].reference, tenders: [{ method: 'other', amount: x[1].amount }], channel: 'counter' });
      } catch (e) { console.error('F&B demo receipt failed', e); }
    });
    S.insert('demoBackfills', { id: FNB_MARK, at: new Date().toISOString(), year: year, assessments: nc, payments: np, drawDowns: nd });
  }

  /* ---------------- 2. Credit policy and accounts receivable ----------------
     Handbook: charging privileges only for members in good standing. "Payment of Account: ... Account statements are
     emailed in the first week of each month. The account balance is due upon receipt of the monthly statement; to be paid
     in full no later than the last of the month." Any member who fails to pay:
        60 days from statement date   suspension of account (charging) privileges
        90 days                        suspension of tee time booking and playing privileges
       120 days                        suspension of ALL privileges, including clubhouse, locker room and amenities
     plus "In arrears at year end" (collections, share forfeited) and "Perpetual delinquency" (no charging privileges
     indefinitely after the F&B assessment is depleted; no time payment in future): staff flags only, not automated.
     Ageing: credits (payments and credit charges) pay the oldest charges first, as Club.billing.aging does. A charge's
     statement date is the issue date of the statement it is on, or the 1st of the month after it was charged when no
     issued statement holds it (statements go out in the first week of each month). The level comes from the oldest
     charge still unpaid. A time payment instalment 30 days in arrears also suspends tee times and golf (section 3).

     Club.billing.standing(memberId, asOf?) -> { level: 0|60|90|120, canCharge, canBook, canPlay, canClubhouse, reason,
       since ('YYYY-MM-DD' the current suspension began, or null), days (since the oldest unpaid statement date), amount
       (unpaid on statements), statementDate, tpArrears ({ renewalId, n, date, amount, days }|null), status, label }
     Other modules (tee sheet, portal booking, ballot) read canBook / canPlay; tills and the portal read canCharge through
     Club.billing.chargeCheck, which also honours a staff override for the day. */
  const LEVEL_LABEL = { 0: 'Good standing', 60: 'Charging suspended', 90: 'Golf suspended', 120: 'All privileges suspended' };
  function openItems(memberId, asOf) {
    const T = asOf || today();
    const list = S.all('charges').filter(function (c) { return c.memberId === memberId && live(c) && c.date <= T; }).sort(byDate);
    let credit = sum(S.all('payments').filter(function (p) { return p.memberId === memberId && p.date <= T; }), function (p) { return p.amount; }) +
      sum(list.filter(function (c) { return c.amount < 0; }), function (c) { return -c.amount; });
    const out = [];
    list.forEach(function (c) {
      if (!(c.amount > 0)) return;
      let open = +c.amount; const use = Math.max(0, Math.min(open, credit)); open -= use; credit -= use;
      if (open > 0.004) out.push({ c: c, open: r2(open) });
    });
    return out;
  }
  function statementDateOf(c, stById) {
    const s = c.statementId ? stById[c.statementId] : null;
    if (s && s.status !== 'draft' && (s.issuedOn || s.sentOn)) return s.issuedOn || s.sentOn;
    return addMonths(mkey(c.date), 1) + '-01';
  }
  function standing(memberId, asOf) {
    const T = asOf || today(), m = S.find('members', memberId);
    const out = { level: 0, canCharge: true, canBook: true, canPlay: true, canClubhouse: true, reason: '', since: null, days: 0, amount: 0, statementDate: null, tpArrears: null, status: m ? m.status : null, label: LEVEL_LABEL[0] };
    if (!m) return Object.assign(out, { canCharge: false, canBook: false, canPlay: false, canClubhouse: false, reason: 'That member could not be found.', label: 'Not found' });
    const stById = {}; S.all('statements').forEach(function (s) { if (s.memberId === memberId) stById[s.id] = s; });
    let oldest = null, owed = 0;
    openItems(memberId, T).forEach(function (x) { const d = statementDateOf(x.c, stById); if (d > T) return; owed += x.open; if (!oldest || d < oldest) oldest = d; });
    owed = r2(owed);
    if (oldest && owed > 0.005) {
      out.days = days(oldest, T); out.amount = owed; out.statementDate = oldest;
      out.level = out.days >= 120 ? 120 : out.days >= 90 ? 90 : out.days >= 60 ? 60 : 0;
    }
    const dt = fmt.date(out.statementDate || T);
    if (out.level) {
      out.since = Club.date.addDays(out.statementDate, out.level);
      out.canCharge = false;
      if (out.level >= 90) { out.canBook = false; out.canPlay = false; }
      if (out.level >= 120) out.canClubhouse = false;
      out.reason = out.level >= 120 ? 'All privileges are suspended: ' + fmt.money(owed) + ' is unpaid ' + out.days + ' days after the statement date of ' + dt + '. This includes charging, tee times and golf, the clubhouse, locker room and amenities.'
        : out.level >= 90 ? 'Tee time booking, golf and charging are suspended: ' + fmt.money(owed) + ' is unpaid ' + out.days + ' days after the statement date of ' + dt + '.'
          : 'Charging to the account is suspended: ' + fmt.money(owed) + ' is unpaid ' + out.days + ' days after the statement date of ' + dt + '.';
    }
    const tp = tpArrears(memberId, T);
    if (tp) {
      out.tpArrears = tp; out.canBook = false; out.canPlay = false;
      if (out.level < 90) out.since = tp.since;
      out.reason = (out.reason ? out.reason + ' ' : '') + 'Tee time booking and golf are suspended: the time payment instalment of ' + fmt.money(tp.amount) + ' due ' + fmt.date(tp.date) + ' is ' + tp.days + ' days in arrears.';
    }
    if (m.status === 'suspended' || m.status === 'resigned') {
      Object.assign(out, { canCharge: false, canBook: false, canPlay: false, canClubhouse: m.status !== 'resigned' && out.canClubhouse });
      out.reason = (m.status === 'suspended' ? 'The membership is suspended.' : 'The membership has been resigned.') + (out.reason ? ' ' + out.reason : '');
    }
    out.label = out.level ? LEVEL_LABEL[out.level] : tp ? LEVEL_LABEL[90] : m.status === 'suspended' ? 'Membership suspended' : m.status === 'resigned' ? 'Resigned' : LEVEL_LABEL[0];
    return out;
  }
  function standingAll(asOf) {
    const out = {};
    S.all('members').forEach(function (m) { if (m.status !== 'resigned') out[m.id] = standing(m.id, asOf); });
    return out;
  }
  /* Staff override (credit policy): staff may let a member charge for the rest of the day, with a reason.
     'chargeOverrides' doc: { id, memberId, date, reason, by, level, createdAt } */
  function overrideFor(memberId, asOf) {
    const T = asOf || today();
    return S.all('chargeOverrides').filter(function (o) { return o.memberId === memberId && o.date === T && !o.withdrawn; }).pop() || null;
  }
  function allowCharging(memberId, reason, by) {
    const st = standing(memberId);
    return S.insert('chargeOverrides', { memberId: memberId, date: today(), reason: String(reason || '').trim(), by: by || null, level: st.level });
  }
  /** Can this member charge a purchase to the account now? { ok, reason, standing, override, hard } (hard: no override). */
  function chargeCheck(memberId) {
    const m = S.find('members', memberId);
    if (!m) return { ok: false, hard: true, reason: 'That member could not be found.' };
    const st = standing(memberId);
    if (m.status === 'suspended' || m.status === 'resigned') return { ok: false, hard: true, reason: st.reason, standing: st };
    if (st.canCharge) return { ok: true, standing: st };
    const ov = overrideFor(memberId);
    if (ov) return { ok: true, override: ov, standing: st };
    return { ok: false, reason: st.reason, standing: st };
  }
  /** What a member is told when their account cannot take a charge (portal takeout, cart, shop). */
  function memberChargeMessage(memberId) {
    const chk = chargeCheck(memberId), m = S.find('members', memberId);
    if (chk.ok) return '';
    if (m && (m.status === 'suspended' || m.status === 'resigned')) return 'Your account cannot take charges right now. Please pay by card, or call the club office at ' + phone() + '.';
    const st = chk.standing || {};
    return 'Charging to your account is suspended: ' + fmt.money(st.amount || 0) + ' is unpaid ' + (st.days || 0) + ' days after the statement date. Please pay by card, or call the club office at ' + phone() + '.';
  }
  /* Club.chargeMember marks a purchase posted while charging is suspended and no override is on file (a till that
     did not check first). Credits, dues and the club's own postings are never marked. */
  const PURCHASE_CATS = { Dining: 1, 'Pro Shop': 1, Golf: 1, Lessons: 1, Events: 1 };
  function flagCharge(memberId, fields) {
    if (!(fields.amount > 0) || !PURCHASE_CATS[fields.category] || fields.source === 'billing' || fields.source === 'manual') return;
    const chk = chargeCheck(memberId);
    if (chk.ok) { if (chk.override) fields.chargeOverrideId = chk.override.id; return; }
    fields.standingWarning = (chk.standing && chk.standing.label) || 'Charging suspended';
    console.warn('Charge posted while charging is suspended for ' + memberId + ': ' + (fields.description || ''));
  }
  /* Staff flags (not automated): 'Perpetual delinquency' and 'In arrears at year end'. member.arFlags = { perpetual:
     'YYYY-MM-DD'|null, yearEnd: 'YYYY-MM-DD'|null, note }. Card on file with the club (never the card itself):
     member.cardOnFile = true|false, cardOnFileOn. */
  function arFlags(m) { m = typeof m === 'string' ? S.find('members', m) : m; return (m && m.arFlags) || { perpetual: null, yearEnd: null, note: '' }; }

  /* ---------------- 3. Time payment plan (next season's renewal) ----------------
     Members renew from My account (js/portal/account.js); staff see who has on the Renewals tab.
     'renewals' doc: { id, memberId, season: 2027, tierId, plan: 'full'|'monthly', total,
                       schedule: [{ n, date 'YYYY-MM-DD', amount, chargeId|null, legacy? }], adminFee: { amount, chargeId }|null,
                       createdAt, status: 'renewed' }
     The year's dues are the tier's annualDues (placeholders in this demo, never published club prices).
     Handbook, Time Payment Policy: offered to members in good standing; a $50 administration fee on every application;
     a valid credit card is required (charged if a monthly payment is missed); payments are due on the 15th of each
     month; payments by EFT, cash, cheque, debit or credit card; credit card payments carry a 1.5% processing fee; all
     dues paid in full by August 15 of the membership year. In arrears 30 days: tee time booking and golf suspended.
     Perpetual delinquency: no time payment in future.
     'monthly' is the time payment plan: the $50 fee is charged when the member applies; equal instalments are due on the
     15th of each month from the first 15th on or after the application until August 15 (the last takes the rounding
     cents). Each instalment posts with Club.chargeMember (category Dues, refId 'renew-<renewalId>-<n>', with its receipt)
     on its due date, by postDue() whenever a page loads. The site never stores a card: staff tick "Card on file with the
     club" on the member's account, and a missed payment shows as a staff task "Charge the card on file".
     An instalment counts as paid when payments marked toward the plan (payment.toward = 'tp-<renewalId>') cover it, or
     when the account itself has paid it (oldest charges first). Instalments posted before Nov 20, 2026 on the 1st of the
     month are marked legacy by a one-time migration and follow ordinary account terms. */
  const RENEW_SEASON = 2027, RENEW_LAST_MONTH = 8;
  const TP = { FEE: 50, CARD_FEE: 0.015, DAY: 15, LAST: RENEW_SEASON + '-08-15' };
  const PLAN_LABEL = { full: 'Paid in full', monthly: 'Time payment plan' };
  function tpDates(fromIso) {
    let k = mkey(fromIso); if (k + '-15' < fromIso) k = addMonths(k, 1);
    const out = []; for (; k + '-15' <= TP.LAST; k = addMonths(k, 1)) out.push(k + '-15');
    return out;
  }
  function renewSchedule(total, fromIso, plan) {
    const cents = Math.round((+total || 0) * 100);
    const dates = tpDates(fromIso);
    if (plan !== 'monthly' || dates.length < 2) return [{ n: 1, date: fromIso, amount: cents / 100, chargeId: null }];
    const n = dates.length, each = Math.floor(cents / n);
    return dates.map(function (d, i) { return { n: i + 1, date: d, amount: (i === n - 1 ? cents - each * (n - 1) : each) / 100, chargeId: null }; });
  }
  function renewalFor(memberId) { return S.all('renewals').find(function (r) { return r.memberId === memberId && r.season === RENEW_SEASON && r.status === 'renewed'; }) || null; }
  function renewDesc(r, s, t) {
    const name = (t ? t.name : 'Membership') + ' membership';
    return RENEW_SEASON + ' dues, ' + name + (r.plan === 'monthly' ? ', instalment ' + s.n + ' of ' + r.schedule.length : ', paid in full');
  }
  function postInstalment(r, i) {
    const s = r.schedule[i]; if (!s || s.chargeId) return null;
    const refId = 'renew-' + r.id + '-' + s.n;
    const ex = S.all('charges').find(function (c) { return c.refId === refId && c.memberId === r.memberId; });
    const t = S.find('membershipTiers', r.tierId);
    const ch = ex || Club.chargeMember(r.memberId, { description: renewDesc(r, s, t), category: 'Dues', amount: s.amount, source: 'billing', refId: refId, date: s.date,
      title: RENEW_SEASON + ' membership renewal', lines: [{ name: (t ? t.name : 'Membership') + ' membership, ' + RENEW_SEASON + ' season' + (r.plan === 'monthly' ? ', instalment ' + s.n + ' of ' + r.schedule.length : ''), qty: 1, price: s.amount }] });
    if (!ch) return null;
    const sched = r.schedule.map(function (x, j) { return j === i ? Object.assign({}, x, { chargeId: ch.id }) : x; });
    S.update('renewals', r.id, { schedule: sched });
    return ch;
  }
  /** Can this member apply for the time payment plan? { ok, reason } */
  function tpEligible(memberId) {
    const m = S.find('members', memberId);
    if (!m) return { ok: false, reason: 'That membership could not be found.' };
    if (m.status !== 'active') return { ok: false, reason: 'The time payment plan is offered to members in good standing. Please call the club office at ' + phone() + '.' };
    if (arFlags(m).perpetual) return { ok: false, reason: 'The time payment plan is not available on this account. Please call the club office at ' + phone() + '.' };
    const st = standing(memberId);
    if (st.level || st.tpArrears) return { ok: false, reason: 'The time payment plan is offered to members in good standing. Please bring your account up to date, or call the club office at ' + phone() + '.' };
    return { ok: true };
  }
  /** Renew a member for next season. Returns { renewal, charge, receipt } or { error }; a second call returns the first renewal. */
  function renew(memberId, plan) {
    const m = S.find('members', memberId); const t = m ? S.find('membershipTiers', m.tierId) : null;
    if (!m || !t) return { error: 'That membership could not be found.' };
    if (m.status === 'resigned' || m.status === 'suspended') return { error: 'Please call the club office to renew.' };
    const had = renewalFor(memberId);
    if (had) return { renewal: had, duplicate: true };
    plan = plan === 'monthly' ? 'monthly' : 'full';
    if (plan === 'monthly') { const el = tpEligible(memberId); if (!el.ok) return { error: el.reason }; }
    const total = r2(t.annualDues);
    const sched = renewSchedule(total, today(), plan);
    if (sched.length < 2) plan = 'full';
    const r = S.insert('renewals', { memberId: memberId, season: RENEW_SEASON, tierId: t.id, plan: plan, total: total, schedule: sched, adminFee: null, status: 'renewed' });
    let ch = null;
    if (plan === 'monthly') {
      ch = Club.chargeMember(memberId, { description: 'Time payment administration fee, ' + RENEW_SEASON + ' dues', category: 'Dues', amount: TP.FEE, source: 'billing', refId: 'tpfee-' + r.id,
        title: 'Time payment plan', lines: [{ name: 'Administration fee, time payment plan for ' + RENEW_SEASON + ' dues', qty: 1, price: TP.FEE }] });
      S.update('renewals', r.id, { adminFee: { amount: TP.FEE, chargeId: ch ? ch.id : null } });
      postDue();
    } else ch = postInstalment(r, 0);
    const rc = ch && Club.receipts ? Club.receipts.forMember(memberId).find(function (x) { return x.chargeId === ch.id; }) || null : null;
    return { renewal: S.find('renewals', r.id), charge: ch, receipt: rc };
  }
  /** Post every instalment that has fallen due and is not on the account yet. */
  function postDue() {
    const T = today(); let n = 0;
    S.all('renewals').slice().forEach(function (r) {
      if (r.status !== 'renewed') return;
      (r.schedule || []).forEach(function (s, i) { if (!s.chargeId && s.date <= T) { const fresh = S.find('renewals', r.id); if (postInstalment(fresh, i)) n++; } });
    });
    return n;
  }
  /** Each instalment of a time payment plan: { n, date, amount, paid, owed, state ('paid'|'scheduled'|'due'|'missed'|
      'arrears'|'legacy'), late (days past due) }. */
  function planStatus(r, asOf) {
    if (!r || r.plan !== 'monthly') return null;
    const T = asOf || today(), tag = 'tp-' + r.id;
    let paid = r2(sum(S.all('payments').filter(function (p) { return p.memberId === r.memberId && p.toward === tag && p.date <= T; }), function (p) { return p.amount; }));
    const open = {}; openItems(r.memberId, T).forEach(function (x) { open[x.c.id] = x.open; });
    const rows = (r.schedule || []).map(function (s) {
      if (s.legacy) return Object.assign({}, s, { paid: s.amount, owed: 0, state: 'legacy', late: 0 });
      const cover = r2(Math.min(s.amount, Math.max(0, paid))); paid = r2(paid - cover);
      let owed = r2(s.amount - cover);
      if (owed > 0.005 && s.chargeId) owed = r2(Math.min(owed, open[s.chargeId] || 0));
      const late = s.date < T && owed > 0.005 ? days(s.date, T) : 0;
      const state = owed <= 0.005 ? (s.date > T && !cover ? 'scheduled' : 'paid') : s.date > T ? 'scheduled' : s.date === T ? 'due' : late >= 30 ? 'arrears' : 'missed';
      return Object.assign({}, s, { paid: r2(s.amount - owed), owed: owed, state: state, late: late });
    });
    return { renewal: r, rows: rows, missed: rows.filter(function (x) { return x.state === 'missed' || x.state === 'arrears'; }),
      next: rows.find(function (x) { return x.state === 'due' || x.state === 'scheduled'; }) || null,
      owedNow: r2(sum(rows.filter(function (x) { return x.state === 'due' || x.state === 'missed' || x.state === 'arrears'; }), function (x) { return x.owed; })) };
  }
  function tpArrears(memberId, asOf) {
    const r = renewalFor(memberId), ps = planStatus(r, asOf);
    const a = ps ? ps.rows.find(function (x) { return x.state === 'arrears'; }) : null;
    return a ? { renewalId: r.id, n: a.n, date: a.date, amount: a.owed, days: a.late, since: Club.date.addDays(a.date, 30) } : null;
  }
  /** Staff tasks: missed time payments ("Charge the card on file") and plans with no card on file. */
  function tpTasks(asOf) {
    const out = [];
    S.all('renewals').forEach(function (r) {
      if (r.status !== 'renewed' || r.plan !== 'monthly' || r.season !== RENEW_SEASON) return;
      const m = S.find('members', r.memberId); if (!m) return;
      const ps = planStatus(r, asOf);
      ps.missed.forEach(function (x) { out.push({ kind: 'missed', m: m, r: r, row: x, card: !!m.cardOnFile }); });
      if (!m.cardOnFile && ps.rows.some(function (x) { return x.state !== 'paid' && x.state !== 'legacy'; })) out.push({ kind: 'nocard', m: m, r: r });
    });
    return out;
  }
  /* One-time migration ('demoBackfills' marker 'timePayment1'): time payment plans made before Nov 20, 2026 had
     instalments on the 1st of each month to August. Instalments already on the account stay as they were (marked
     legacy: ordinary account terms). The rest of the plan is spread again over the 15th of each month from the next
     15th until August 15, equal amounts, the last taking the cents. No $50 fee is charged for these earlier plans. */
  function migratePlans() {
    if (S.find('demoBackfills', 'timePayment1')) return;
    let n = 0;
    S.all('renewals').forEach(function (r) {
      if (r.plan !== 'monthly' || r.status !== 'renewed') return;
      const posted = (r.schedule || []).filter(function (s) { return s.chargeId; }).map(function (s) { return Object.assign({}, s, { legacy: true }); });
      const rest = r2(sum((r.schedule || []).filter(function (s) { return !s.chargeId; }), function (s) { return s.amount; }));
      let tail = [];
      if (rest > 0.005) {
        const dates = tpDates(today()); const cents = Math.round(rest * 100);
        if (!dates.length) dates.push(TP.LAST);
        const each = Math.floor(cents / dates.length);
        tail = dates.map(function (d, i) { return { n: posted.length + i + 1, date: d, amount: (i === dates.length - 1 ? cents - each * (dates.length - 1) : each) / 100, chargeId: null }; });
      }
      S.update('renewals', r.id, { schedule: posted.concat(tail), adminFee: r.adminFee || null, migrated: 'timePayment1' });
      n++;
    });
    S.insert('demoBackfills', { id: 'timePayment1', at: new Date().toISOString(), plans: n });
  }
  try { migratePlans(); } catch (e) { console.error('Time payment migration failed', e); }
  try { postDue(); } catch (e) { console.error('Renewal instalments failed', e); }

  /* ---------------- 4. Refund of dues ----------------
     Handbook, Refund Policy: a $50.00 administrative fee on all refunds of golf dues; requests must be received in
     writing before May 31st (even if no golf has been played); no refunds after May 31st; the Board reviews later
     requests one by one (a medical note or proof of moving out of province may be required) and may grant a two (2) month
     credit toward the next season. The staff dialog (js/modules/billing.js) posts a credit for the refund, the $50 fee
     as its own charge, and any Board credit, each with a receipt, and keeps a 'dueRefunds' record:
       { id, memberId, season, refund, fee, receivedOn, inTime, board: { reason }|null, credit2m, payback: { method, paymentId }|null,
         chargeIds: [], createdAt } */
  const REFUND = { FEE: 50, BY: '05-31' };
  /** Dues charged for a membership year: the monthly dues runs in that calendar year and next season's renewal. */
  function duesFor(memberId, season) {
    const list = S.all('charges').filter(function (c) {
      if (c.memberId !== memberId || c.category !== 'Dues' || !live(c)) return false;
      const ref = String(c.refId || '');
      if (/^renew-/.test(ref)) { const rid = ref.replace(/^renew-/, '').replace(/-\d+$/, ''); const r = S.find('renewals', rid); return !!r && r.season === season; }
      if (/^(tpfee|tpcard|refund)-/.test(ref)) return false;
      return /^dues-/.test(ref) ? ref.slice(5, 9) === String(season) : String(c.date).slice(0, 4) === String(season) && /dues/i.test(c.description || '') && !/fee/i.test(c.description || '');
    });
    const refunded = r2(sum(S.all('dueRefunds').filter(function (x) { return x.memberId === memberId && x.season === season && !x.undone; }), function (x) { return x.refund; }));
    return { charged: r2(sum(list, function (c) { return c.amount; })), refunded: refunded, charges: list };
  }
  function refundDeadline(season) { return season + '-' + REFUND.BY; }

  Club.billing.fnb = { CAT: FNB_CAT, amount: fnbAmount, applies: fnbAdult, tierApplies: fnbTier, year: fnbYear, state: fnbState, post: fnbPost, toPost: fnbToPost,
    postDue: fnbPostDue, reconcile: fnbReconcile, reconcileAll: fnbReconcileAll, prepare: fnbPrepare, after: fnbAfter, has: hasAssessment };
  Object.assign(Club.billing, { standing: standing, standingAll: standingAll, chargeCheck: chargeCheck, allowCharging: allowCharging, overrideFor: overrideFor,
    memberChargeMessage: memberChargeMessage, flagCharge: flagCharge, arFlags: arFlags, LEVEL_LABEL: LEVEL_LABEL });
  Club.billing.renewal = { SEASON: RENEW_SEASON, LAST_MONTH: RENEW_LAST_MONTH, LAST_DAY: TP.LAST, TP: TP, PLAN_LABEL: PLAN_LABEL, schedule: renewSchedule, forMember: renewalFor,
    renew: renew, postDue: postDue, status: planStatus, eligible: tpEligible, tasks: tpTasks, arrears: tpArrears };
  Club.billing.refunds = { FEE: REFUND.FEE, deadline: refundDeadline, duesFor: duesFor };
  /* After every script has seeded its data (the demo history comes later on the staff page): the demo assessment once,
     this season's assessments when due, and the F&B credit checked against the ledger. */
  /* Demo, once ('demoBackfills' marker 'timePaymentDemo1'): the demo renewals made by js/modules/reports-growth.js on the
     time payment plan get the $50 administration fee they would have paid when applying (dated the day they renewed),
     and every second one a card on file with the club, so Billing shows both kinds of follow-up. */
  function tpDemo() {
    if (S.find('demoBackfills', 'timePaymentDemo1')) return;
    const list = S.all('renewals').filter(function (r) { return r.plan === 'monthly' && r.status === 'renewed' && r.demo && !r.adminFee && !r.migrated; });
    if (!list.length && !S.getObj('growthDemoVersion', 0)) return;   /* the staff page has not made its demo renewals yet */
    list.forEach(function (r, i) {
      const on = String(r.createdAt || today()).slice(0, 10);
      const ch = Club.chargeMember(r.memberId, { description: 'Time payment administration fee, ' + RENEW_SEASON + ' dues', category: 'Dues', amount: TP.FEE, source: 'billing', refId: 'tpfee-' + r.id, date: on,
        title: 'Time payment plan', lines: [{ name: 'Administration fee, time payment plan for ' + RENEW_SEASON + ' dues', qty: 1, price: TP.FEE }] });
      S.update('renewals', r.id, { adminFee: { amount: TP.FEE, chargeId: ch ? ch.id : null } });
      if (i % 2 === 1) S.update('members', r.memberId, { cardOnFile: true, cardOnFileOn: on });
    });
    S.insert('demoBackfills', { id: 'timePaymentDemo1', at: new Date().toISOString(), plans: list.length });
  }
  function fnbStartup() {
    try { tpDemo(); } catch (e) { console.error('Time payment demo failed', e); }
    try { fnbDemo(); } catch (e) { console.error('F&B demo failed', e); }
    try { fnbPostDue(); } catch (e) { console.error('F&B assessments failed', e); }
    try { fnbReconcileAll(); } catch (e) { console.error('F&B credit check failed', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fnbStartup); else setTimeout(fnbStartup, 0);

  /* For the staff page (js/modules/billing.js) */
  Club.shared = Club.shared || {};
  Club.shared.billing = { methodLabel, DUE_DAYS, r2, today, live, mkey, addMonths, monthName, monthEnd, sum, byDate, sweepOverdue, agingAll, agingFor, RENEW_SEASON, renewalFor, FNB_CAT, TP, openItems };
})();
