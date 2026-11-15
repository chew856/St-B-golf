/* Billing data: the charges, payments and statements seed, the overdue sweep, Club.billing.aging and Club.billing.renewal (next season's renewals).
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/billing.js, which reads these helpers from Club.shared.billing. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Stored values stay ACH/Card/Check for the shared data model; shown with Canadian names. */
  const METHOD_LABEL = { ACH: 'Pre-authorized debit', Card: 'Card', Check: 'Cheque' };
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

  /* ---------------- Next season's renewal ----------------
     Members renew from My account (js/portal/account.js); staff see who has on the Renewals tab.
     'renewals' doc: { id, memberId, season: 2027, tierId, plan: 'full'|'monthly', total,
                       schedule: [{ n, date 'YYYY-MM-DD', amount, chargeId|null }], createdAt, status: 'renewed' }
     The year's dues are the tier's annualDues (placeholders in this demo, never published club prices). Verified club fact:
     yearly dues can be spread from the sign-up date until August. So 'monthly' is equal instalments from the renewal month
     to August of the season: the first on the renewal date, the rest on the 1st of each month, the last instalment takes
     the rounding cents. Each instalment posts with Club.chargeMember (category Dues, refId 'renew-<renewalId>-<n>', which
     makes its receipt) when it falls due: the first straight away, later ones by postDue() whenever a page loads. */
  const RENEW_SEASON = 2027, RENEW_LAST_MONTH = 8;
  const PLAN_LABEL = { full: 'Paid in full', monthly: 'Monthly instalments' };
  function renewSchedule(total, fromIso, plan) {
    const cents = Math.round((+total || 0) * 100);
    const end = RENEW_SEASON + '-' + String(RENEW_LAST_MONTH).padStart(2, '0');
    let n = 0; for (let k = mkey(fromIso); k <= end; k = addMonths(k, 1)) n++;
    if (plan !== 'monthly' || n < 2) return [{ n: 1, date: fromIso, amount: cents / 100, chargeId: null }];
    const each = Math.floor(cents / n), out = [];
    for (let i = 0; i < n; i++) {
      out.push({ n: i + 1, date: i === 0 ? fromIso : addMonths(mkey(fromIso), i) + '-01', amount: (i === n - 1 ? cents - each * (n - 1) : each) / 100, chargeId: null });
    }
    return out;
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
  /** Renew a member for next season. Returns { renewal, charge, receipt } or { error }; a second call returns the first renewal. */
  function renew(memberId, plan) {
    const m = S.find('members', memberId); const t = m ? S.find('membershipTiers', m.tierId) : null;
    if (!m || !t) return { error: 'That membership could not be found.' };
    if (m.status === 'resigned' || m.status === 'suspended') return { error: 'Please call the club office to renew.' };
    const had = renewalFor(memberId);
    if (had) return { renewal: had, duplicate: true };
    plan = plan === 'monthly' ? 'monthly' : 'full';
    const total = r2(t.annualDues);
    const r = S.insert('renewals', { memberId: memberId, season: RENEW_SEASON, tierId: t.id, plan: plan, total: total, schedule: renewSchedule(total, today(), plan), status: 'renewed' });
    const ch = postInstalment(r, 0);
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
  try { postDue(); } catch (e) { console.error('Renewal instalments failed', e); }
  Club.billing.renewal = { SEASON: RENEW_SEASON, LAST_MONTH: RENEW_LAST_MONTH, PLAN_LABEL: PLAN_LABEL, schedule: renewSchedule, forMember: renewalFor, renew: renew, postDue: postDue };

  /* For the staff page (js/modules/billing.js) */
  Club.shared = Club.shared || {};
  Club.shared.billing = { methodLabel, DUE_DAYS, r2, today, live, mkey, addMonths, monthName, monthEnd, sum, byDate, sweepOverdue, agingAll, agingFor, RENEW_SEASON, renewalFor };
})();
