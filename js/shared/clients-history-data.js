/* DEMO SEED: earlier client history, so Reports > Client spending has a real "period before", full months to compare
   and people behind each of its ideas. Everything here is made up for the demo members and demo public golfers; none
   of it is a fact about the real club. It is written into the same collections real activity uses (charges, payments,
   publicPayments, members, publicPlayers, teeTimes), so the reports compute from records and need no special cases.

   Runs once per browser, also in browsers that already hold data: the 'demoBackfills' marker 'clientHistory1' keeps it
   from running again. Deterministic: the store's seeded random with a fixed reseed, dates relative to today.
   Loaded by the staff page after the other seeds (billing, tee sheet, monthly history, the Growth demo data).

   What is added (every record carries demo: 'client-history-1'):
   1. House charges for the nine months before the existing three (categories Golf, Pro Shop, Dining, Events, Lessons;
      golf only April to October, quieter in winter), for active members whose ledger starts with the existing seed.
      Each month's charges are settled by one payment on the 26th to 28th of the same month, so no balance, statement,
      opening balance or ageing figure changes. No dues are added. A department's added charges never pass HALF of that
      month's revenue for the department in monthlyMetrics, so client spending stays inside the club's totals.
   2. Patterns, in a minority of members picked from what the existing three months already show:
        went quiet     the three with the least clubhouse spend in the last 30 days get a heavy earlier history
        falling        up to three whose spend already fell last month get a strong month before it
        dining only    up to three with no shop or lesson charge get more dining and no shop or lesson history
        no events      up to four with no event charge or entry get no event history
        no carts       members with no cart or guest charge get no golf history
        low spenders   members under half their category's average get three small bar or breakfast visits a month
   3. Four new demo members (every charge settled the same day, so each balance is zero). Three joined in the last
      three months: a golfer with two cart charges who plays but does not dine, a Saturday breakfast regular, and one
      with nothing beyond dues. One joined ten months ago and only ever dines. The golfer is added to four past tee
      times that had a free place. The monthly roll (monthlyMetrics.members) is raised for the months since each joined.
   4. Public golfers: earlier online green fees for two existing demo golfers who have not agreed to club emails, and two
      new demo accounts with one paid round each, weeks ago.
   Nothing is dated in the last 15 days (the daily closes on file stay true), and nothing is dated today or later. */
(function () {
  'use strict';
  const S = Club.store, D = Club.date, R = S.R;
  const MARK = 'clientHistory1', TAG = 'client-history-1';
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  const pad = function (n) { return String(n).padStart(2, '0'); };
  function shift(key, n) { const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1, 12); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function sum(a, f) { return a.reduce(function (t, x) { return t + (+f(x) || 0); }, 0); }
  function inSeason(key) { const m = +key.slice(5, 7); return m >= 4 && m <= 10; }

  /* [description, low, high]: the same placeholder items and prices as the billing seed (js/shared/billing-data.js). */
  const ITEMS = {
    Golf: [['Guest green fee, weekday', 66, 66], ['Guest green fee, weekend', 76, 76], ['Power cart, 18 holes', 40, 40], ['Guest green fee and power cart', 106, 116], ['Power cart, 9 holes', 25, 25]],
    'Pro Shop': [['Titleist Pro V1, one dozen', 69.99, 69.99], ['St. Boniface crest polo', 89.99, 89.99], ['St.B logo cap', 34.99, 34.99], ['Regrip, full set', 90, 140]],
    Dining: [['Gallery Taphouse & Grill lunch', 18, 70], ['Gallery Taphouse & Grill dinner', 40, 160], ['Patio', 20, 90], ['Taphouse Bar', 12, 80], ['Gallery Taphouse & Grill breakfast', 12, 40]],
    Events: [['Members’ league night', 35, 35], ['Club event entry', 45, 90], ['Member-guest entry', 150, 150]],
    Lessons: [['Private lesson, 60 minutes', 95, 95], ['Club fitting session', 75, 75], ['SIM teaching session', 60, 60]]
  };
  const SRC = { Golf: 'teesheet', 'Pro Shop': 'proshop', Dining: 'dining', Events: 'events', Lessons: 'lessons' };
  const METRIC = { Golf: 'golf', 'Pro Shop': 'proShop', Dining: 'dining', Events: 'events', Lessons: 'lessons' };
  const CAP_SHARE = 0.5;

  function run() {
    if (S.find('demoBackfills', MARK)) return;
    const members = S.all('members'), metrics = S.all('monthlyMetrics');
    if (!S.getObj('billingSeeded', false) || !members.length || !metrics.length || S.find('charges', 'chg_h1')) return;
    R.reseed(4127);
    const T = D.today(), cur = T.slice(0, 7), seedFrom = shift(cur, -2) + '-01', quietTo = D.addDays(T, -16);
    const months = []; for (let i = 11; i >= 3; i--) months.push(shift(cur, -i));
    const tiers = {}; S.all('membershipTiers').forEach(function (t) { tiers[t.id] = t; });
    const cap = {}; metrics.forEach(function (m) { cap[m.month] = m.revenue || {}; });
    const charges = [], payments = []; let cn = 0, pn = 0;
    function charge(mid, date, cat, desc, amount) { charges.push({ id: 'chg_h' + (++cn), memberId: mid, createdAt: date + 'T12:00:00.000Z', date: date, description: desc, category: cat, amount: r2(amount), source: SRC[cat] || 'billing', demo: TAG }); return r2(amount); }
    function pay(mid, date, amount, method) { payments.push({ id: 'pay_h' + (++pn), memberId: mid, date: date, amount: r2(amount), method: method || 'ACH', reference: method === 'Card' ? 'Card ending ' + R.int(1000, 9999) : 'Pre-authorized debit ' + R.int(10000, 99999), createdAt: date + 'T12:00:00.000Z', demo: TAG }); }

    /* ---- What the existing three months show for each member ---- */
    const existing = {}, earliest = {};
    S.all('charges').forEach(function (c) {
      if (!c.memberId || !c.date) return;
      if (!earliest[c.memberId] || c.date < earliest[c.memberId]) earliest[c.memberId] = c.date;
      if (c.category === 'Dues' || c.reversedBy || c.reverses || !(c.amount > 0)) return;
      const x = existing[c.memberId] || (existing[c.memberId] = { total: 0, byMonth: {}, recentHouse: 0, extras: false, shop: false, events: false });
      x.total += c.amount; x.byMonth[c.date.slice(0, 7)] = (x.byMonth[c.date.slice(0, 7)] || 0) + c.amount;
      if (c.date >= D.addDays(T, -29) && c.category !== 'Golf' && c.source !== 'cart') x.recentHouse += c.amount;
      if (/power cart|guest green fee/i.test(c.description || '')) x.extras = true;
      if (c.category === 'Pro Shop' || c.category === 'Lessons') x.shop = true;
      if (c.category === 'Events') x.events = true;
    });
    S.all('lessons').forEach(function (l) { if (l.memberId && existing[l.memberId]) existing[l.memberId].shop = true; });
    S.all('events').forEach(function (e) { (e.registrations || []).forEach(function (g) { if (g && g.memberId && existing[g.memberId]) existing[g.memberId].events = true; }); });
    /* Only members whose ledger starts with the existing seed: older charges would otherwise change how a balance ages. */
    const pool = members.filter(function (m) { return m.status === 'active' && existing[m.id] && earliest[m.id] >= seedFrom; }).sort(function (a, b) { return a.id.localeCompare(b.id); });
    const catAvg = {}; pool.forEach(function (m) { const g = catAvg[m.tierId] || (catAvg[m.tierId] = { n: 0, t: 0 }); g.n++; g.t += existing[m.id].total; });

    /* ---- The patterns (see the header) ---- */
    const kind = {};
    pool.forEach(function (m) { if (existing[m.id].total < catAvg[m.tierId].t / catAvg[m.tierId].n / 2) kind[m.id] = 'low'; });
    const free = function () { return pool.filter(function (m) { return !kind[m.id]; }); };
    free().sort(function (a, b) { return existing[a.id].recentHouse - existing[b.id].recentHouse || a.id.localeCompare(b.id); }).slice(0, 3).forEach(function (m) { kind[m.id] = 'quiet'; });
    free().filter(function (m) { return !existing[m.id].shop; }).slice(0, 3).forEach(function (m) { kind[m.id] = 'dining'; });
    const m1 = shift(cur, -2), m2 = shift(cur, -1);
    free().filter(function (m) { const x = existing[m.id].byMonth; return x[m1] > 0 && (x[m2] || 0) <= x[m1] * 0.8; }).slice(0, 3).forEach(function (m) { kind[m.id] = 'falling'; });
    const noEvents = {}; pool.filter(function (m) { return !existing[m.id].events; }).slice(0, 4).forEach(function (m) { noEvents[m.id] = 1; });

    /* ---- 1 and 2: nine earlier months of house charges, each month settled by one payment ---- */
    const used = {};
    function room(key, cat, amt) {
      const lim = cap[key] ? (+cap[key][METRIC[cat]] || 0) * CAP_SHARE : Infinity, k = key + cat;
      if ((used[k] || 0) + amt > lim) return false;
      used[k] = (used[k] || 0) + amt; return true;
    }
    months.forEach(function (key, mi) {
      const season = inSeason(key), dec = key.slice(5) === '12', last = mi === months.length - 1;
      pool.forEach(function (m) {
        const k = kind[m.id], t = tiers[m.tierId], x = existing[m.id];
        let total = 0;
        function item(cat, scale) {
          const it = R.pick(ITEMS[cat]), amt = r2((it[1] === it[2] ? it[1] : it[1] + (0.35 + 0.65 * R.rand()) * (it[2] - it[1])) * (scale || 1));
          const date = key + '-' + pad(R.int(2, 24));
          if (!room(key, cat, amt)) return;
          total += charge(m.id, date, cat, it[0], amt);
        }
        if (k === 'low') {   /* often here, small tickets: three visits a month to the bar or for breakfast, nothing else */
          for (let j = 0; j < 3; j++) { const d = key + '-' + pad(2 + j * 8 + R.int(0, 6)), a = 8 + R.int(0, 9); if (room(key, 'Dining', a)) total += charge(m.id, d, 'Dining', j % 2 ? 'Gallery Taphouse & Grill breakfast' : 'Taphouse Bar', a); }
          if (total > 0) pay(m.id, key + '-' + pad(R.int(26, 28)), total);
          return;
        }
        let dining = season ? R.int(2, 4) : R.int(1, 2);
        if (k === 'quiet' || k === 'dining') dining += 2;
        for (let j = 0; j < dining; j++) item('Dining', k === 'quiet' ? 1.5 : 1);
        /* Heavy enough that their last 30 days read as a quarter or less of what they used to spend. */
        if (k === 'quiet') for (let j = 0; j < 10 && total < Math.max(650, x.recentHouse * 5.2); j++) item('Dining', 1.5);
        if (season && (!t || t.golf !== false) && x.extras) { const g = R.int(1, 3); for (let j = 0; j < g; j++) item('Golf'); }
        if (k !== 'dining' && R.chance(season ? 0.45 : 0.1)) item('Pro Shop');
        if (!noEvents[m.id] && R.chance(k === 'quiet' ? 0.6 : dec ? 0.45 : 0.35)) item('Events');
        if (k !== 'dining' && season && R.chance(0.16)) item('Lessons');
        /* A strong month just before the existing three, for members whose spend then fell twice. */
        if (k === 'falling' && last) for (let j = 0; j < 8 && total < (x.byMonth[m1] || 0) * 1.4; j++) item('Dining', 1.5);
        if (total > 0) pay(m.id, key + '-' + pad(R.int(26, 28)), total);
      });
    });

    /* ---- 3: four new demo members, dues and charges paid, balance zero ---- */
    let no = Math.max.apply(null, members.map(function (m) { return +m.memberNo || 0; }));
    const sat = (function () { let d = quietTo; while (new Date(d + 'T12:00:00').getDay() !== 6) d = D.addDays(d, -1); return d; })();
    const NEW = [
      { id: 'mem_demo_h1', first: 'Marcus', last: 'Oyelaran', tier: 'tier_full', since: D.addDays(T, -34), dob: '1984-03-12', hcp: 14.2, cart: 'Cart', dining: 'Patio' },
      { id: 'mem_demo_h2', first: 'Colette', last: 'Arsenault', tier: 'tier_full', since: D.addDays(sat, -42), dob: '1971-08-04', hcp: 22.6, cart: 'Walk', dining: 'Gallery Taphouse & Grill' },
      { id: 'mem_demo_h3', first: 'Sophie', last: 'Lachance', tier: 'tier_founders', since: D.addDays(T, -22), dob: '1979-11-23', hcp: 9.8, cart: 'Walk', dining: 'Taphouse Bar' },
      { id: 'mem_demo_h4', first: 'Henri', last: 'Beaulieu', tier: 'tier_founders', since: shift(cur, -10) + '-14', dob: '1958-05-30', hcp: 27.4, cart: 'Walk', dining: 'Gallery Taphouse & Grill' }
    ].filter(function (n) { return !S.find('members', n.id) && tiers[n.tier]; });
    const newMembers = NEW.map(function (n, i) {
      const t = tiers[n.tier], dues = r2(t.annualDues / 12);
      /* Dues: the first instalment on joining, then the 1st of each month up to the last one more than 15 days old. Paid the same day. */
      const due = [n.since]; for (let k = shift(n.since.slice(0, 7), 1); k + '-01' <= quietTo; k = shift(k, 1)) due.push(k + '-01');
      due.forEach(function (d, j) {
        charges.push({ id: 'chg_h' + (++cn), memberId: n.id, refId: j ? 'dues-' + d.slice(0, 7) : 'dues-join', createdAt: d + 'T12:00:00.000Z', date: d, description: (j ? 'Dues instalment, ' : 'First dues instalment, ') + t.name + ' membership', category: 'Dues', amount: dues, source: 'billing', demo: TAG });
        pay(n.id, d, dues);
      });
      return { id: n.id, memberNo: String(++no), firstName: n.first, lastName: n.last, email: (n.first[0] + n.last).toLowerCase() + '@example.com', phone: '(204) 555-01' + (41 + i * 7), address: (120 + i * 45) + ' Provencher Boulevard',
        tierId: n.tier, status: 'active', memberSince: n.since, dob: n.dob, handicap: n.hcp, ghin: null, locker: null, spouse: null, children: 0, balance: 0,
        preferences: { cart: n.cart, dining: n.dining, notes: '' }, tags: [], hand: 'right', createdAt: n.since + 'T15:00:00.000Z', demo: TAG };
    });
    const has = function (id) { return newMembers.some(function (m) { return m.id === id; }); };
    if (has('mem_demo_h1')) {   /* the golfer: two cart charges, paid, and four rounds on past tee times (below) */
      [D.addDays(T, -31), D.addDays(T, -27)].forEach(function (d) { pay('mem_demo_h1', d, charge('mem_demo_h1', d, 'Golf', 'Power cart, 9 holes', 25), 'Card'); });
    }
    if (has('mem_demo_h2')) {   /* the Saturday breakfast regular: seven Saturdays, each settled by card the same day */
      for (let i = 6; i >= 0; i--) { const d = D.addDays(sat, -7 * i); pay('mem_demo_h2', d, charge('mem_demo_h2', d, 'Dining', 'Gallery Taphouse & Grill breakfast', 15 + R.int(0, 8)), 'Card'); }
    }
    if (has('mem_demo_h4')) {   /* the long-standing dining-only member: three or four dinners a month, nothing else, settled the same day */
      for (let k = shift(cur, -9); k < cur; k = shift(k, 1)) {
        const n = R.int(3, 4), lim = k === shift(cur, -1) ? Math.min(24, +quietTo.slice(8, 10)) : 24;
        for (let j = 0; j < n; j++) { const d = k + '-' + pad(R.int(2, Math.max(2, lim))); if (d <= quietTo) pay('mem_demo_h4', d, charge('mem_demo_h4', d, 'Dining', j % 3 ? 'Gallery Taphouse & Grill dinner' : 'Gallery Taphouse & Grill lunch', j % 3 ? R.int(55, 130) : R.int(24, 60)), 'Card'); }
      }
    }
    const teeEdits = [];
    if (has('mem_demo_h1')) {
      const me = newMembers.filter(function (m) { return m.id === 'mem_demo_h1'; })[0], name = me.firstName + ' ' + me.lastName;
      [-13, -10, -6, -3].forEach(function (off) {
        const day = D.addDays(T, off);
        const tt = S.all('teeTimes').filter(function (t) { return t.date === day && t.status === 'completed' && !t.eventId && (t.players || []).length > 0 && t.players.length < 4 && !t.players.some(function (p) { return !p || p.friendLeagueId || p.publicPlayerId; }) && t.time >= '10:30'; })
          .sort(function (a, b) { return a.time.localeCompare(b.time); })[0];
        if (tt) teeEdits.push([tt.id, tt.players.concat([{ memberId: me.id, name: name, type: 'member', cart: false, paid: true }])]);
      });
    }

    /* ---- 4: public golfers ---- */
    const pubPays = [], pubNew = []; let qn = 0;
    function green(pid, date, cart) {
      const lines = [{ label: 'Green fee (18 holes)', amount: 45 }].concat(cart ? [{ label: 'Cart', amount: 28 }] : []);
      pubPays.push({ id: 'ppay_demo_h' + (++qn), createdAt: date + 'T14:00:00.000Z', publicPlayerId: pid, teeTimeId: null, date: date, amount: cart ? 73 : 45, tax: 0, brand: 'visa', last4: String(4100 + qn), status: 'paid', refundedOn: null,
        description: 'Green fees', lines: lines, players: 1, holes: 18, teeDate: D.addDays(date, 2), teeTime: pad(R.int(8, 15)) + ':' + pad(R.int(0, 5) * 10), demo: TAG });
    }
    /* Two existing demo golfers who have not agreed to club emails become regulars through the season. */
    const regulars = S.all('publicPlayers').filter(function (p) { return /^pp_demo_g\d+$/.test(p.id) && !p.marketingOptIn; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }).slice(0, 2);
    regulars.forEach(function (p, i) {
      const made = String(p.createdAt).slice(0, 10), n = i === 0 ? 20 : 6;
      const from = [shift(cur, -6) + '-03', made].sort()[1], span = Math.round((new Date(D.addDays(T, -20)) - new Date(from)) / 86400000);
      if (span < n) return;
      for (let j = 0; j < n; j++) { const d = D.addDays(from, Math.round(span * (j + 0.5) / n)); if (inSeason(d.slice(0, 7))) green(p.id, d, i === 0 || j % 2 === 0); }
    });
    [['pp_demo_h1', 'Isabelle', 'Gauthier', 'R2H 2B9', 85, true], ['pp_demo_h2', 'Devon', 'Sinclair', 'R2J 3L5', 58, false]].forEach(function (x, i) {
      if (S.find('publicPlayers', x[0])) return;
      const day = D.addDays(T, -x[4]), at = day + 'T1' + i + ':20:00.000Z';
      pubNew.push({ id: x[0], firstName: x[1], lastName: x[2], email: (x[1] + '.' + x[2]).toLowerCase() + '@example.com', phone: '204-555-01' + (63 + i * 11), postalCode: x[3], createdAt: at, cards: [],
        marketingOptIn: x[5], marketingOptInAt: x[5] ? at : null, heardFrom: i ? 'Friend or family' : 'Search engine', demo: TAG });
      green(x[0], day, i === 0);
    });

    /* ---- Write it all, then the marker ---- */
    S.replace('charges', S.all('charges').concat(charges));
    S.replace('payments', S.all('payments').concat(payments));
    if (pubPays.length) S.replace('publicPayments', S.all('publicPayments').concat(pubPays));
    if (pubNew.length) S.replace('publicPlayers', S.all('publicPlayers').concat(pubNew));
    if (newMembers.length) S.replace('members', S.all('members').concat(newMembers));
    teeEdits.forEach(function (e) { S.update('teeTimes', e[0], { players: e[1] }); });
    metrics.forEach(function (mm) {   /* the monthly roll, for the closed months since each one joined */
      const add = newMembers.filter(function (m) { return mm.month >= m.memberSince.slice(0, 7) && mm.month < cur; }).length;
      if (add) S.update('monthlyMetrics', mm.id, { members: (+mm.members || 0) + add });
    });
    S.insert('demoBackfills', { id: MARK, at: new Date().toISOString(), charges: charges.length, payments: payments.length, publicPayments: pubPays.length, publicPlayers: pubNew.map(function (p) { return p.id; }),
      members: newMembers.map(function (m) { return m.id; }), teeTimes: teeEdits.map(function (e) { return e[0]; }), from: months[0] + '-01', to: quietTo,
      patterns: Object.keys(kind).reduce(function (o, id) { (o[kind[id]] = o[kind[id]] || []).push(id); return o; }, { noEvents: Object.keys(noEvents) }) });
  }
  try { run(); } catch (e) { console.error('Client history demo data failed', e); }
})();
