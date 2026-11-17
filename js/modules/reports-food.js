/* Reports section: Food, drink and shop. Registers through Club.reports.addSection (js/modules/reports.js).
   Dining room guests by month (main chart), the average check, takeout (Club.takeout, 'takeoutOrders'), beverage cart
   orders by hole and delivery times ('cartOrders'), where people dined (reservations) and pro shop top sellers (sales).
   Figures follow the Clubhouse page (js/modules/cart.js): cart sales count once an order is delivered, delivery time is
   deliveredAt minus placedAt, members are every golfer who is not 'public'.

   Sample history. The beverage cart keeps only today's demo orders and takeout starts empty, so for the days before the
   first real record in each collection this section adds sample history: deterministic (Club.store.R, fixed seeds),
   built in memory and never saved. The store is close to the browser's storage limit, and keeping the samples out of it
   means the Clubhouse page, the portals, billing and receipts show exactly what they did before. Sample docs carry
   sample: true. Cart samples follow the Winnipeg season (May to mid October, golf hours); takeout samples follow the
   pickup hours and rules in Club.takeout.settings() (breakfast until its cut-off, Friday Night Pizza on Fridays). */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc, H = Club.reports.h, R = S.R, DR = Club.drill;
  const num = H.num;

  /* ---------------- Helpers ---------------- */
  function today() { return Club.date.today(); }
  function addDays(d, n) { return Club.date.addDays(d, n); }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function hourLabel(h) { return (h % 12 || 12) + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function hourShort(h) { return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function count(n, one, many) { return F.num(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pct(v, total) { return total ? Math.round(v / total * 100) : 0; }
  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function median(a) { if (!a.length) return null; const s = sorted(a), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  /** Nearest-rank percentile: the value p of the way up the sorted list. */
  function pctile(a, p) { if (!a.length) return null; const s = sorted(a); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; }
  function mins(v) { return v == null ? 'None' : Math.round(v) + ' min'; }
  function msAt(date, min) { const p = date.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], Math.floor(min / 60), min % 60).getTime(); }
  function hourOf(ms) { return new Date(ms).getHours(); }
  function clockOf(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function minDate(list) { return list.reduce(function (a, o) { return o && o.date && (!a || o.date < a) ? o.date : a; }, null); }
  /** Weighted pick from [[value, weight], ...] with the seeded generator. */
  function pickW(pairs) {
    const tot = pairs.reduce(function (a, p) { return a + p[1]; }, 0);
    let x = R.rand() * tot;
    for (let i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  /** Pick from a list with earlier entries more likely, so a few regulars order again and again. */
  function pickSkew(list, k) { return list[Math.min(list.length - 1, Math.floor(Math.pow(R.rand(), k || 1.8) * list.length))]; }
  function memberName(id, fallback) { const m = id && Club.members ? Club.members.get(id) : null; return m ? Club.members.name(m) : (fallback || 'Member'); }
  /* Public customers in the sample history: made-up names with 555 numbers (never real people). */
  const FIRST = ['Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Quinn', 'Jamie', 'Drew', 'Parker', 'Rowan', 'Hayden', 'Emerson', 'Reese', 'Logan', 'Sasha', 'Robin', 'Dana', 'Kendall', 'Blair', 'Shawn', 'Leslie', 'Marion', 'Terry'];
  const LAST = ['Fournier', 'Klassen', 'Bergeron', 'Penner', 'Lavallee', 'Sinclair', 'Novak', 'Desjardins', 'Friesen', 'Halloran', 'Mcleod', 'Vandale', 'Dueck', 'Gauthier', 'Kowal', 'Brandt', 'Thiessen', 'Roy', 'Morin', 'Lachance'];
  function publicPool(seed, n) {
    R.reseed(seed);
    const out = [], seen = {};
    while (out.length < n) {
      const name = R.pick(FIRST) + ' ' + R.pick(LAST);
      if (seen[name]) continue; seen[name] = 1;
      out.push({ name: name, phone: '204-555-01' + pad(R.int(0, 99)) });
    }
    return out;
  }
  function memberPool() {
    return H.all('members').filter(function (m) { return m.status === 'active' && m.id !== S.DEMO_MEMBER; })
      .sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
  }
  /* ======================================================================
     Sample history: beverage cart
     ====================================================================== */
  const CART_MONTH = [0, 0, 0, 0, 0.72, 1.05, 1.2, 1.15, 0.85, 0.5, 0, 0];   /* index 0 = January; service runs May 8 to Oct 12 */
  const CART_HOURS = [[8, 0.35], [9, 0.7], [10, 1], [11, 1.3], [12, 1.45], [13, 1.25], [14, 1.05], [15, 1], [16, 0.9], [17, 0.75], [18, 0.5], [19, 0.2]];
  const HOLE_W = [[1, 0.45], [2, 0.8], [3, 1], [4, 1.1], [5, 1.2], [6, 1], [7, 0.9], [8, 0.8], [9, 0.5], [10, 0.55], [11, 0.9], [12, 1.1], [13, 1.35], [14, 1.4], [15, 1.25], [16, 1], [17, 0.8], [18, 0.4]];
  const CART_ITEM_W = { cm_water: 1.2, cm_pop: 0.9, cm_sports: 0.7, cm_icedtea: 0.45, cm_energy: 0.3, cm_coffee: 0.2, cm_beer: 1.7, cm_lightbeer: 0.9, cm_craft: 0.6, cm_seltzer: 0.75, cm_cooler: 0.4, cm_caesar: 0.45,
    cm_nabeer: 0.2, cm_chips: 0.8, cm_choc: 0.5, cm_granola: 0.15, cm_trail: 0.2, cm_jerky: 0.3, cm_seeds: 0.3, cm_fruit: 0.2, cm_breakfast: 0.1, cm_hotdog: 0.9, cm_smokie: 0.5, cm_sandwich: 0.5, cm_wrap: 0.4, cm_balls: 0.25, cm_tees: 0.1 };
  let cartMemo = null;
  function sampleCart(before) {
    const menu = S.all('cartMenu').filter(function (m) { return m && m.id && +m.price > 0; });
    const key = before + '|' + today() + '|' + menu.map(function (m) { return m.id + ':' + m.price; }).join(',');
    if (cartMemo && cartMemo.key === key) return cartMemo.list;
    const list = [];
    cartMemo = { key: key, list: list };
    if (!menu.length) return list;
    const members = memberPool(), people = publicPool(4471, 40);
    R.reseed(5150);
    const D = Club.cartDispatch;
    let n = 0;
    for (let d = addDays(today(), -370); d < before && d < today(); d = addDays(d, 1)) {
      const md = d.slice(5), mw = CART_MONTH[+d.slice(5, 7) - 1];
      if (md < '05-08' || md > '10-12' || !mw) continue;
      if (R.chance(0.08)) continue;                         /* rained out */
      const wd = F.toDate(d).getDay(), weekend = wd === 0 || wd === 6;
      const total = Math.max(2, Math.round(14 * mw * (weekend ? 1.5 : wd === 5 ? 1.15 : 1) * (0.75 + R.rand() * 0.5)));
      const carts = total >= 24 ? 2 : 1;
      const placed = [];
      for (let i = 0; i < total; i++) placed.push(pickW(CART_HOURS) * 60 + R.int(0, 59));
      placed.sort(function (a, b) { return a - b; });
      const perHour = {}; placed.forEach(function (m) { const h = Math.floor(m / 60); perHour[h] = (perHour[h] || 0) + 1; });
      placed.forEach(function (m) {
        const h = Math.floor(m / 60), load = perHour[h] / carts;
        let wait = 4.5 + R.rand() * 5.5 + Math.max(0, load - 1.2) * (3.5 + R.rand() * 4);
        if (R.chance(0.04)) wait += 8 + R.rand() * 14;       /* a restock or a slow stop */
        wait = Math.min(58, wait);
        const hole = pickW(HOLE_W), startHole = R.chance(0.15) ? 10 : 1;
        const isMember = members.length && R.chance(0.78), mem = isMember ? pickSkew(members, 1.5) : null, pub = isMember ? null : pickSkew(people, 1.4);
        const visit = R.chance(0.09), cancelled = R.chance(0.035);
        let items = [];
        if (!visit || (!cancelled && R.chance(0.75))) {
          const lines = 1 + (R.chance(0.45) ? 1 : 0) + (R.chance(0.15) ? 1 : 0);
          const w = menu.map(function (it) {
            let x = CART_ITEM_W[it.id] != null ? CART_ITEM_W[it.id] : 0.3;
            if (h < 11 && (it.id === 'cm_coffee' || it.id === 'cm_breakfast')) x += 1.2;
            if (h < 11 && it.alcohol) x *= 0.45;
            return [it, x];
          });
          for (let l = 0; l < lines; l++) {
            const it = pickW(w);
            if (items.some(function (x) { return x.itemId === it.id; })) continue;
            const qty = it.category === 'Golf' ? 1 : /Drinks|alcohol/i.test(it.category) ? pickW([[1, 0.35], [2, 0.35], [3, 0.12], [4, 0.18]]) : pickW([[1, 0.7], [2, 0.3]]);
            items.push({ itemId: it.id, name: it.name, size: it.size || '', qty: qty, price: r2(it.price), alcohol: !!it.alcohol });
          }
        }
        const placedAt = msAt(d, m), tot = r2(items.reduce(function (a, x) { return a + x.qty * x.price; }, 0));
        const payment = isMember && R.chance(0.62) ? 'account' : 'cart';
        const doc = { id: 'co_sample_' + (++n), sample: true, kind: visit ? 'visit' : 'order', date: d, placedAt: placedAt, holeAt: placedAt,
          golferType: isMember ? 'member' : 'public', memberId: mem ? mem.id : null, name: mem ? mem.firstName + ' ' + mem.lastName : pub.name,
          hole: hole, startHole: startHole, items: items, total: tot, payment: payment, cartId: carts === 2 && R.chance(0.5) ? '2' : '1' };
        if (cancelled) {
          Object.assign(doc, { status: 'cancelled', items: visit ? [] : items, total: visit ? 0 : tot, cancelledBy: pickW([['golfer', 0.6], ['staff', 0.25], ['shift', 0.15]]),
            cancelledAt: new Date(placedAt + Math.round((2 + R.rand() * 10) * 60000)).toISOString() });
        } else {
          let found = String(hole);
          try { found = D ? D.predictedNode(hole, wait, startHole) : found; } catch (e) { /* keep the ordering hole */ }
          Object.assign(doc, { status: 'delivered', deliveredAt: new Date(placedAt + Math.round(wait * 60000)).toISOString(), foundAt: found,
            boughtNothing: visit && !items.length, paidWith: payment === 'account' || !tot ? null : (R.chance(0.8) ? 'card' : 'cash') });
        }
        list.push(doc);
      });
    }
    return list;
  }
  /** Real cart orders plus sample history for the days before the first real one. */
  function cartOrders() {
    const real = H.all('cartOrders'), first = minDate(real) || today();
    return { list: real.concat(sampleCart(first)), first: first };
  }

  /* ======================================================================
     Sample history: takeout
     ====================================================================== */
  const DINE_MONTH = [0.55, 0.6, 0.62, 0.72, 0.95, 1.12, 1.18, 1.12, 0.96, 0.82, 0.74, 1.1];   /* the dining room's season (reports.js COVER_F) */
  const TO_DAY = [1, 0.65, 0.75, 0.85, 0.95, 1.25, 1.15];                                       /* Sunday first */
  const TO_HOURS = [[7, 0.3], [8, 0.5], [9, 0.45], [10, 0.35], [11, 0.85], [12, 1.3], [13, 0.85], [14, 0.35], [15, 0.3], [16, 0.65], [17, 1.3], [18, 1.4], [19, 0.85], [20, 0.4], [21, 0.12]];
  let toMemo = null;
  function sampleTakeout(before, firstNo) {
    const T = Club.takeout;
    if (!T) return [];
    const s = T.settings(), menu = T.menu();
    const key = before + '|' + today() + '|' + firstNo + '|' + JSON.stringify(s) + '|' + menu.map(function (i) { return i.id + ':' + i.price; }).join(',');
    if (toMemo && toMemo.key === key) return toMemo.list;
    const list = [];
    toMemo = { key: key, list: list };
    const pizza = menu.filter(T.isPizza)[0] || null;
    const bfast = menu.filter(T.isBreakfast);
    const mains = menu.filter(function (i) { return !T.isPizza(i) && !T.isBreakfast(i) && !/^Add /i.test(i.name) && i.section !== 'Sides'; });
    const sides = menu.filter(function (i) { return i.section === 'Sides'; });
    if (!mains.length) return list;
    const open = H.toMin(s.open), close = H.toMin(s.close), step = Math.max(5, +s.step || 15), pizzaFrom = H.toMin(s.pizzaFrom), bfUntil = H.toMin(s.breakfastUntil);
    const members = memberPool(), people = publicPool(8803, 30), tax = Club.taxRate ? Club.taxRate() : 0.12;
    R.reseed(6262);
    const slot = function (lo, hi) { lo = Math.ceil(Math.max(lo, open) / step) * step; hi = Math.min(hi, close); return lo > hi ? null : lo + step * R.int(0, Math.floor((hi - lo) / step)); };
    const line = function (i, q) { return { menuId: i.id, name: i.name, price: r2(i.price), qty: q }; };
    const made = [];
    let oneOff = 0;
    for (let d = addDays(today(), -366); d < before && d < today(); d = addDays(d, 1)) {
      const md = d.slice(5);
      if (md === '12-25' || md === '01-01') continue;
      const wd = F.toDate(d).getDay(), mw = DINE_MONTH[+d.slice(5, 7) - 1];
      const plan = [];
      const nReg = Math.round(2.3 * mw * TO_DAY[wd] * (0.6 + R.rand() * 0.8));
      for (let i = 0; i < nReg; i++) plan.push('reg');
      if (wd === 5 && pizza) { const nP = Math.round((3 + R.rand() * 4) * mw); for (let i = 0; i < nP; i++) plan.push('pizza'); }
      plan.forEach(function (kind) {
        let t, items = [];
        if (kind === 'pizza') {
          t = slot(pizzaFrom, Math.min(close, 20 * 60 + 30));
          if (t == null) return;
          items.push(line(pizza, pickW([[1, 0.55], [2, 0.35], [3, 0.1]])));
          if (sides.length && R.chance(0.3)) items.push(line(R.pick(sides), 1));
        } else {
          const h = pickW(TO_HOURS);
          t = slot(h * 60, h * 60 + 59);
          if (t == null) return;
          const breakfast = bfast.length && t < bfUntil && (h < 11 ? R.chance(0.75) : R.chance(0.1));
          const pool = breakfast ? bfast : mains;
          const lines = 1 + (R.chance(0.4) ? 1 : 0) + (R.chance(0.12) ? 1 : 0);
          for (let l = 0; l < lines; l++) {
            const it = R.pick(pool);
            const same = items.filter(function (x) { return x.menuId === it.id; })[0];
            if (same) same.qty++; else items.push(line(it, R.chance(0.2) ? 2 : 1));
          }
          if (!breakfast && sides.length && R.chance(0.25)) items.push(line(R.pick(sides), 1));
        }
        /* Members and a few public regulars order again and again; most public customers order once. */
        const isMember = members.length && R.chance(0.58), mem = isMember ? pickSkew(members, 1.9) : null;
        const pub = isMember ? null : R.chance(0.4) ? pickSkew(people, 1.6) : { name: R.pick(FIRST) + ' ' + R.pick(LAST), phone: '', email: 'guest' + (++oneOff) + '@example.com' };
        const lead = R.chance(0.12) ? 60 * 14 + R.int(0, 240) : 35 + R.int(0, 150);
        const placedAt = msAt(d, t) - lead * 60000;
        const subtotal = r2(items.reduce(function (a, x) { return a + x.qty * x.price; }, 0)), tx = r2(subtotal * tax);
        const cancelled = R.chance(0.05), by = cancelled ? (R.chance(0.6) ? 'customer' : 'staff') : null;
        made.push({ id: 'to_sample_' + made.length, sample: true, placedAt: new Date(placedAt).toISOString(), date: d, time: hm(t),
          status: cancelled ? 'cancelled' : 'picked-up', source: isMember ? 'portal' : 'public',
          customer: isMember ? { kind: 'member', memberId: mem.id, publicPlayerId: null, name: mem.firstName + ' ' + mem.lastName, phone: mem.phone || '', email: mem.email || '' }
            : { kind: 'guest', memberId: null, publicPlayerId: null, name: pub.name, phone: pub.phone, email: pub.email || '' },
          items: items, notes: '', subtotal: subtotal, tax: tx, total: r2(subtotal + tx),
          payment: { method: isMember && R.chance(0.7) ? 'account' : 'card', due: r2(subtotal + tx) },
          pickedUpAt: cancelled ? null : new Date(msAt(d, t) + R.int(-5, 20) * 60000).toISOString(),
          cancelledAt: cancelled ? new Date(placedAt + R.int(5, Math.max(6, lead - 30)) * 60000).toISOString() : null, cancelledBy: by,
          cancelReason: by === 'staff' ? R.pick(['Kitchen closed early', 'Item not available', 'At the customer\'s request by phone']) : '' });
      });
    }
    /* Order numbers run up to just below the first real order, so T1001 onward stay the live ones. */
    made.forEach(function (o, i) { o.no = Math.max(1, firstNo - made.length + i); list.push(o); });
    return list;
  }
  function takeoutOrders() {
    const T = Club.takeout, real = T ? H.all(T.COLL) : [];
    const first = minDate(real) || today();
    const firstNo = real.reduce(function (a, o) { return +o.no && +o.no < a ? +o.no : a; }, 1001);
    return { list: real.concat(sampleTakeout(first, firstNo)), first: first };
  }

  /* Computations are shared across the section within one render. */
  function stats(ctx, k, fn) { return H.memo(ctx, 'food-' + k, function () { return fn(ctx); }); }

  /* ======================================================================
     Takeout
     ====================================================================== */
  /* ======================================================================
     1. Takeout
     ====================================================================== */
  function isPizzaLine(l) { const T = Club.takeout; if (!T) return false; const i = T.item(l.menuId); return T.isPizza(i || { name: l.name, description: '' }); }
  function custKey(c) {
    c = c || {};
    if (c.memberId) return 'm:' + c.memberId;
    if (c.publicPlayerId) return 'p:' + c.publicPlayerId;
    const ph = String(c.phone || '').replace(/\D/g, '');
    return 'g:' + (ph || String(c.email || '').toLowerCase() || String(c.name || '').toLowerCase());
  }
  function takeoutStats(ctx) {
    const src = takeoutOrders(), inR = H.inRange(ctx);
    const all = src.list.filter(function (o) { return o && inR(o.date); });
    const live = all.filter(function (o) { return o.status !== 'cancelled'; }), cancelled = all.filter(function (o) { return o.status === 'cancelled'; });
    const rev = r2(H.sum(live, function (o) { return o.subtotal; }));
    const hours = {}, items = {}, cust = {}, wd = [0, 0, 0, 0, 0, 0, 0], fridays = {};
    let pizzas = 0, memN = 0, memRev = 0;
    live.forEach(function (o) {
      const h = Math.floor(H.toMin(o.time) / 60); hours[h] = (hours[h] || 0) + 1;
      wd[(F.toDate(o.date).getDay() + 6) % 7]++;
      const c = o.customer || {}, member = c.kind === 'member';
      if (member) { memN++; memRev += H.num(o.subtotal); }
      const k = custKey(c);
      const x = cust[k] = cust[k] || { key: k, name: member ? memberName(c.memberId, c.name) : c.name || 'Guest', member: member, memberId: c.memberId || null, orders: 0, spend: 0, last: '' };
      x.orders++; x.spend += H.num(o.subtotal); if (o.date > x.last) x.last = o.date;
      (o.items || []).forEach(function (l) {
        const ik = l.menuId || l.name, it = items[ik] = items[ik] || { name: l.name, qty: 0, rev: 0 };
        it.qty += H.num(l.qty); it.rev += H.num(l.qty) * H.num(l.price);
        if (isPizzaLine(l)) { pizzas += H.num(l.qty); fridays[o.date] = 1; }
      });
    });
    const custs = Object.keys(cust).map(function (k) { return cust[k]; });
    const repeat = custs.filter(function (c) { return c.orders >= 2; }).sort(function (a, b) { return b.orders - a.orders || b.spend - a.spend || a.name.localeCompare(b.name); });
    const repeatOrders = H.sum(repeat, function (c) { return c.orders; });
    const itemList = Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.qty - a.qty || b.rev - a.rev; });
    const why = {}; cancelled.forEach(function (o) { const w = o.cancelledBy === 'customer' ? 'By the customer' : 'By the Gallery'; why[w] = (why[w] || 0) + 1; });
    const s = Club.takeout ? Club.takeout.settings() : { open: '07:00', close: '21:30' };
    const hList = []; for (let h = Math.floor(H.toMin(s.open) / 60); h <= Math.floor(H.toMin(s.close) / 60); h++) hList.push(h);
    Object.keys(hours).forEach(function (h) { if (hList.indexOf(+h) < 0) hList.push(+h); });
    hList.sort(function (a, b) { return a - b; });
    return { src: src, all: all, live: live, cancelled: cancelled, rev: rev, avg: live.length ? rev / live.length : 0, hours: hours, hList: hList, wd: wd,
      pizzas: pizzas, fridays: Object.keys(fridays).length, memN: memN, memRev: memRev, pubN: live.length - memN, pubRev: rev - memRev,
      custs: custs, repeat: repeat, repeatOrders: repeatOrders, items: itemList, why: why };
  }
  function busiestHours(t, n) {
    return t.hList.filter(function (h) { return t.hours[h]; }).sort(function (a, b) { return t.hours[b] - t.hours[a] || a - b; }).slice(0, n || 2);
  }
  function takeoutCSV(ctx, t) {
    const rows = [['Takeout', 'Value'], ['Period', ctx.from + ' to ' + ctx.to], ['Orders', t.live.length], ['Revenue before tax', t.rev.toFixed(2)], ['Average order before tax', t.avg.toFixed(2)],
      ['Friday pizzas', t.pizzas], ['Fridays with pizza orders', t.fridays], ['Member orders', t.memN], ['Public orders', t.pubN], ['Customers', t.custs.length],
      ['Repeat customers (2+ orders)', t.repeat.length], ['Orders from repeat customers', t.repeatOrders], ['Cancelled', t.cancelled.length],
      ['Includes sample history', t.all.some(function (o) { return o.sample; }) ? 'Yes, before ' + t.src.first : 'No'],
      [], ['Pickup hour', 'Orders']].concat(t.hList.map(function (h) { return [hourLabel(h), t.hours[h] || 0]; }))
      .concat([[], ['Item', 'Sold', 'Revenue']]).concat(t.items.map(function (i) { return [i.name, i.qty, i.rev.toFixed(2)]; }))
      .concat([[], ['Repeat customer', 'Type', 'Orders', 'Spend', 'Last pickup']]).concat(t.repeat.map(function (c) { return [c.name, c.member ? 'Member' : 'Public', c.orders, c.spend.toFixed(2), c.last]; }));
    return rows;
  }
  function takeoutDrill(ctx) {
    const t = stats(ctx, 'to', takeoutStats), DR = Club.drill;
    let html = DR.kpis([
      { label: 'Orders', value: F.num(t.live.length), sub: count(t.custs.length, 'customer') },
      { label: 'Revenue', value: F.money0(t.rev), sub: 'Before tax' },
      { label: 'Average order', value: F.money(t.avg), sub: 'Before tax' },
      { label: 'Repeat customers', value: F.num(t.repeat.length), sub: pct(t.repeatOrders, t.live.length) + '% of orders' }
    ]);
    if (!t.all.length) return { title: 'Takeout', body: html + DR.empty('No takeout orders in this period', 'Choose a longer period to see top items and regular customers.', 'chef'), go: 'takeout', goLabel: 'Open takeout' };
    const shown = t.items.slice(0, 10);
    html += DR.sec('Top items', count(t.items.length, 'item'), DR.table([{ label: 'Item' }, { label: 'Share of revenue' }, { label: 'Sold', num: true }, { label: 'Revenue', num: true }],
      shown.map(function (i) { return ['<span class="primary-cell">' + esc(i.name) + '</span>', DR.share(i.rev, t.rev), F.num(i.qty), esc(F.money0(i.rev))]; }),
      t.items.length > 10 ? ['Other ' + (t.items.length - 10), '', F.num(H.sum(t.items.slice(10), function (i) { return i.qty; })), esc(F.money0(H.sum(t.items.slice(10), function (i) { return i.rev; })))] : null));
    html += DR.sec('Repeat customers', t.repeat.length ? count(t.repeat.length, 'customer') + ' with two or more orders' : '', t.repeat.length ? DR.table([{ label: 'Customer' }, { label: 'Orders', num: true }, { label: 'Spend', num: true }, { label: 'Last pickup', num: true }],
      t.repeat.slice(0, 12).map(function (c) {
        return [(c.memberId ? '<a class="primary-cell" href="#/members/' + esc(c.memberId) + '">' + esc(c.name) + '</a>' : '<span class="primary-cell">' + esc(c.name) + '</span>') + '<div class="dd-sub">' + (c.member ? 'Member' : 'Public') + '</div>',
          F.num(c.orders), esc(F.money0(c.spend)), esc(F.dateShort(c.last))];
      }), t.repeat.length > 12 ? ['And ' + (t.repeat.length - 12) + ' more', F.num(H.sum(t.repeat.slice(12), function (c) { return c.orders; })), esc(F.money0(H.sum(t.repeat.slice(12), function (c) { return c.spend; }))), ''] : null)
      : DR.note('No one ordered more than once in this period.'));
    html += '<div class="dd-two" data-reveal>' +
      DR.sec('By weekday', '', Club.charts.bar({ labels: H.WD, series: [{ name: 'Orders', values: t.wd, color: 'var(--viz-1)' }], height: 160, whole: true })) +
      DR.sec('Friday pizza', '', DR.note(t.pizzas ? F.num(t.pizzas) + ' pizzas over ' + count(t.fridays, 'Friday') + ', about ' + Math.round(t.pizzas / Math.max(1, t.fridays)) + ' a Friday.' : 'No Friday Night Pizza orders in this period.') +
        DR.note(count(t.memN, 'member order') + ' and ' + count(t.pubN, 'public order') + '.')) + '</div>';
    html += DR.sec('Cancellations', count(t.cancelled.length, 'order'), t.cancelled.length ? DR.table([{ label: 'Cancelled' }, { label: 'Share' }, { label: 'Orders', num: true }],
      Object.keys(t.why).map(function (w) { return ['<span class="primary-cell">' + esc(w) + '</span>', DR.share(t.why[w], t.cancelled.length), F.num(t.why[w])]; }))
      : DR.note('No orders were cancelled in this period.'));
    if (t.all.some(function (o) { return o.sample; })) html += DR.note('Orders before ' + F.date(t.src.first) + ' are sample history for the demo.');
    return { title: 'Takeout', body: html, go: 'takeout', goLabel: 'Open takeout' };
  }

  /* ======================================================================
     Beverage cart orders by hole
     ====================================================================== */
  /* ======================================================================
     2. Beverage cart orders by hole
     ====================================================================== */
  function validHole(h) { h = +h; return h >= 1 && h <= 18 && Math.floor(h) === h; }
  function salesOf(list) { return r2(list.reduce(function (a, o) { return a + (+o.total || 0); }, 0)); }
  function deliveredMin(o) { if (o.status !== 'delivered' || !o.deliveredAt || !o.placedAt) return null; const v = (Date.parse(o.deliveredAt) - o.placedAt) / 60000; return v >= 0 && v <= 240 ? v : null; }
  /** Items in a list of orders, most sold first (the Clubhouse page's tally). */
  function tally(list) {
    const items = {};
    list.forEach(function (o) { (o.items || []).forEach(function (it) { const k = it.itemId || it.name; const x = items[k] = items[k] || { name: it.name, qty: 0, rev: 0 }; x.qty += +it.qty || 0; x.rev = r2(x.rev + (+it.qty || 0) * (+it.price || 0)); }); });
    return Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.qty - a.qty || b.rev - a.rev || a.name.localeCompare(b.name); });
  }
  function cartStats(ctx) {
    const src = cartOrders(), inR = H.inRange(ctx);
    const all = src.list.filter(function (o) { return o && inR(o.date); });
    const live = all.filter(function (o) { return o.status !== 'cancelled'; });
    const holes = []; for (let h = 0; h <= 18; h++) holes.push({ hole: h, list: [] });
    const none = [];
    live.forEach(function (o) { if (validHole(o.hole)) holes[+o.hole].list.push(o); else none.push(o); });
    const atCH = all.filter(function (o) { return o.status === 'delivered' && o.foundAt === 'CH'; });
    const max = Math.max.apply(null, holes.slice(1).map(function (x) { return x.list.length; }).concat([0]));
    let best = null;
    for (let a = 1; a <= 16; a++) { const n = holes[a].list.length + holes[a + 1].list.length + holes[a + 2].list.length; if (!best || n > best.n) best = { from: a, to: a + 2, n: n }; }
    const days = {}; all.forEach(function (o) { days[o.date] = 1; });
    return { src: src, all: all, live: live, holes: holes, none: none, atCH: atCH, max: max, stretch: best && best.n ? best : null, days: Object.keys(days).length,
      done: live.filter(function (o) { return o.status === 'delivered'; }) };
  }
  /** The hole (or the clubhouse) with the shortest order-weighted drive to where orders came from, by the dispatch's cart paths. */
  function waitSpot(c, from, to) {
    const D = Club.cartDispatch; if (!D || !D.travelMinutes || !D.NODES) return null;
    let best = null;
    Object.keys(D.NODES).forEach(function (node) {
      let tot = 0, n = 0;
      for (let h = from; h <= to; h++) { const k = c.holes[h].list.length; if (!k) continue; try { tot += k * D.travelMinutes(node, String(h)); n += k; } catch (e) { return; } }
      if (n && (!best || tot / n < best.min)) best = { node: node, min: tot / n };
    });
    return best;
  }
  function shade(n, max) {
    const p = max ? n / max : 0;
    if (!n) return { a: 0, dark: false };
    /* Two bands keep the number readable: dark text on the lighter cells, light text on the darker ones. */
    return p < 0.6 ? { a: Math.round(6 + p / 0.6 * 44), dark: false } : { a: Math.round(70 + (p - 0.6) / 0.4 * 22), dark: true };
  }
  function holeCell(c, h) {
    const n = c.holes[h].list.length, s = shade(n, c.max), peak = c.stretch && h >= c.stretch.from && h <= c.stretch.to;
    return '<button type="button" class="rh-hole' + (s.dark ? ' is-dark' : '') + (peak ? ' is-peak' : '') + '" data-drill="hole" data-arg="' + h + '" style="--rh-a:' + s.a + '%" aria-haspopup="dialog" aria-label="' +
      esc('Hole ' + h + ': ' + count(n, 'order') + ', ' + pct(n, c.live.length) + ' percent' + (peak ? ', in the busiest stretch' : '') + '. Show details') + '">' +
      '<span class="rh-hole-n">' + h + '</span><span class="rh-hole-v">' + F.num(n) + '</span></button>';
  }
  function nine(c, a, label) {
    let cells = ''; for (let h = a; h < a + 9; h++) cells += holeCell(c, h);
    return '<div class="rh-nine" role="group" aria-label="' + esc(label + ', holes ' + a + ' to ' + (a + 8)) + '"><span class="label-caps rh-nine-label">' + esc(label) + '</span><div class="rh-nine-cells">' + cells + '</div></div>';
  }
  function stretchText(c) {
    if (!c.stretch || c.live.length < 10) return 'Too few orders in this period to point to a busy stretch of holes.';
    return 'Most orders came from holes ' + c.stretch.from + ' to ' + c.stretch.to + ' (' + pct(c.stretch.n, c.live.length) + '% of orders in this period). A cart waiting near there would be closest to the most orders.';
  }
  function holesCSV(ctx, c) {
    const row = function (label, list) {
      const t = list.map(deliveredMin).filter(function (v) { return v != null; }), top = tally(list.filter(function (o) { return o.status === 'delivered'; }))[0];
      return [label, list.length, pct(list.length, c.live.length), salesOf(list.filter(function (o) { return o.status === 'delivered'; })).toFixed(2), t.length ? median(t).toFixed(1) : '', top ? top.name : ''];
    };
    return [['Hole', 'Orders', 'Share %', 'Sales', 'Median delivery (min)', 'Top item']]
      .concat(c.holes.slice(1).map(function (x) { return row(x.hole, x.list); }))
      .concat([row('Clubhouse or no hole', c.none), [], ['Busiest stretch', c.stretch ? 'Holes ' + c.stretch.from + ' to ' + c.stretch.to : 'None', c.stretch ? c.stretch.n : ''],
        ['Handed over at the clubhouse', c.atCH.length], ['Period', ctx.from + ' to ' + ctx.to], ['Includes sample history', c.all.some(function (o) { return o.sample; }) ? 'Yes, before ' + c.src.first : 'No']]);
  }
  function orderRows(list, n) {
    return list.slice().sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, n).map(function (o) {
      const t = deliveredMin(o), C = Club.cart;
      return ['<span class="primary-cell">' + esc(F.dateShort(o.date)) + '</span><div class="dd-sub">' + esc(F.time(clockOf(o.placedAt))) + '</div>',
        esc(o.name || 'Golfer') + (o.golferType === 'public' ? '<div class="dd-sub">Public golfer</div>' : ''),
        esc(C && C.label ? C.label(o) : (o.items || []).map(function (i) { return i.name; }).join(', ')),
        o.status === 'delivered' ? esc(mins(t)) : '<span class="muted">Open</span>'];
    });
  }
  function holeDrill(ctx, key) {
    const c = stats(ctx, 'cart', cartStats), DR = Club.drill;
    const isCH = key === 'CH', list = isCH ? c.none : c.holes[+key].list;
    const done = list.filter(function (o) { return o.status === 'delivered'; }), times = done.map(deliveredMin).filter(function (v) { return v != null; });
    const items = tally(done), sales = salesOf(done);
    let html = DR.kpis([
      { label: 'Orders', value: F.num(list.length), sub: pct(list.length, c.live.length) + '% of cart orders' },
      { label: 'Sales', value: F.money0(sales), sub: 'Delivered orders' },
      { label: 'Median delivery', value: mins(median(times)), sub: times.length ? '90th percentile ' + mins(pctile(times, 0.9)) : 'No timed deliveries' },
      { label: 'Top item', value: items.length ? items[0].name : 'None', sub: items.length ? items[0].qty + ' sold' : 'Nothing sold' }
    ]);
    if (isCH) {
      html += DR.sec('Handed over at the clubhouse', count(c.atCH.length, 'order'), c.atCH.length ? DR.note('These orders came from a hole, and the group had finished by the time the cart reached them. They count under the hole they were placed from.') +
        DR.table([{ label: 'Placed' }, { label: 'Golfer' }, { label: 'Order' }, { label: 'Delivery', num: true }], orderRows(c.atCH, 10)) : DR.note('No orders were handed over at the clubhouse in this period.'));
      if (!list.length) html += DR.sec('Orders without a hole', '', DR.note('Every order in this period was placed from a hole on the course.'));
      else html += DR.sec('Orders without a hole', count(list.length, 'order'), DR.table([{ label: 'Placed' }, { label: 'Golfer' }, { label: 'Order' }, { label: 'Delivery', num: true }], orderRows(list, 12)));
      return { title: 'Clubhouse or no hole', body: html, go: 'cart', goLabel: 'Open beverage cart' };
    }
    if (!list.length) return { title: 'Hole ' + key, body: html + DR.empty('No orders from hole ' + key + ' in this period', 'Orders appear here once golfers order from this hole.', 'cart'), go: 'cart', goLabel: 'Open beverage cart' };
    html += DR.sec('Top items', count(items.length, 'item'), items.length ? DR.table([{ label: 'Item' }, { label: 'Share of sales' }, { label: 'Sold', num: true }, { label: 'Sales', num: true }],
      items.slice(0, 8).map(function (x) { return ['<span class="primary-cell">' + esc(x.name) + '</span>', DR.share(x.rev, sales), F.num(x.qty), esc(F.money(x.rev))]; })) : DR.note('Nothing sold from this hole yet.'));
    const hrs = {}; list.forEach(function (o) { const h = hourOf(o.placedAt); hrs[h] = (hrs[h] || 0) + 1; });
    const hk = Object.keys(hrs).map(Number), lo = Math.min.apply(null, hk), hi = Math.max.apply(null, hk), hours = [];
    for (let h = lo; h <= hi; h++) hours.push(h);
    html += DR.sec('By hour of day', '', Club.charts.bar({ labels: hours.map(hourShort), series: [{ name: 'Orders', values: hours.map(function (h) { return hrs[h] || 0; }), color: 'var(--viz-1)' }], height: 160, whole: true }));
    html += DR.sec('Latest orders', list.length > 12 ? 'The 12 most recent' : '', DR.table([{ label: 'Placed' }, { label: 'Golfer' }, { label: 'Order' }, { label: 'Delivery', num: true }], orderRows(list, 12)));
    const inStretch = c.stretch && +key >= c.stretch.from && +key <= c.stretch.to;
    if (inStretch) html += DR.note('Hole ' + key + ' is in the busiest stretch, holes ' + c.stretch.from + ' to ' + c.stretch.to + '.');
    return { title: 'Hole ' + key, body: html, go: 'cart', goLabel: 'Open beverage cart' };
  }
  function holesDrill(ctx) {
    const c = stats(ctx, 'cart', cartStats), DR = Club.drill;
    let html = DR.kpis([
      { label: 'Cart orders', value: F.num(c.live.length), sub: 'Over ' + count(c.days, 'day') },
      { label: 'Busiest stretch', value: c.stretch ? 'Holes ' + c.stretch.from + ' to ' + c.stretch.to : 'None', sub: c.stretch ? pct(c.stretch.n, c.live.length) + '% of orders' : '' },
      { label: 'Busiest hole', value: c.max ? 'Hole ' + c.holes.slice(1).filter(function (x) { return x.list.length === c.max; })[0].hole : 'None', sub: c.max ? count(c.max, 'order') : '' },
      { label: 'Clubhouse or no hole', value: F.num(c.none.length), sub: count(c.atCH.length, 'handover') + ' at the clubhouse' }
    ]);
    if (!c.all.length) return { title: 'Orders by hole', body: html + DR.empty('No cart orders in this period', 'Choose a period that includes the golf season.', 'cart'), go: 'cart', goLabel: 'Open beverage cart' };
    let obs = stretchText(c);
    const spot = c.stretch && c.live.length >= 10 ? waitSpot(c, c.stretch.from, c.stretch.to) : null;
    if (spot) obs += ' By the cart paths in the dispatch, ' + (spot.node === 'CH' ? 'the clubhouse' : 'hole ' + spot.node) + ' is the shortest average drive to those orders, about ' + Math.max(1, Math.round(spot.min)) + ' min.';
    html += DR.sec('Where the cart could wait', 'An observation from the data', DR.note(obs));
    html += DR.sec('Every hole', '', DR.table([{ label: 'Hole' }, { label: 'Share' }, { label: 'Orders', num: true }, { label: 'Median delivery', num: true }, { label: 'Top item' }],
      c.holes.slice(1).map(function (x) {
        const done = x.list.filter(function (o) { return o.status === 'delivered'; }), t = done.map(deliveredMin).filter(function (v) { return v != null; }), top = tally(done)[0];
        return ['<span class="primary-cell">Hole ' + x.hole + '</span>', DR.share(x.list.length, c.live.length), F.num(x.list.length), esc(mins(median(t))), esc(top ? top.name : '')];
      }).concat([['<span class="primary-cell">Clubhouse or no hole</span>', DR.share(c.none.length, c.live.length), F.num(c.none.length), esc(mins(median(c.none.map(deliveredMin).filter(function (v) { return v != null; })))), '']])));
    return { title: 'Orders by hole', body: html, go: 'cart', goLabel: 'Open beverage cart' };
  }

  /* ======================================================================
     Cart delivery times
     ====================================================================== */
  /* ======================================================================
     3. Cart delivery times
     ====================================================================== */
  function limitMin() { const D = Club.cartDispatch; return D && +D.MAX_WAIT_MIN > 0 ? +D.MAX_WAIT_MIN : null; }
  function timesStats(ctx) {
    const c = stats(ctx, 'cart', cartStats), lim = limitMin();
    const timed = c.done.map(function (o) { return { o: o, m: deliveredMin(o) }; }).filter(function (x) { return x.m != null; });
    const all = timed.map(function (x) { return x.m; });
    const by = {};
    c.live.forEach(function (o) { const h = hourOf(o.placedAt); (by[h] = by[h] || { orders: 0, t: [] }).orders++; });
    timed.forEach(function (x) { by[hourOf(x.o.placedAt)].t.push(x.m); });
    const hours = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
    const med = median(all), p90 = pctile(all, 0.9);
    const sized = hours.filter(function (h) { return by[h].t.length >= 8; });
    const avgOrders = sized.length ? H.sum(sized, function (h) { return by[h].orders; }) / sized.length : 0;
    const rows = hours.map(function (h) {
      const b = by[h], m = median(b.t), p = pctile(b.t, 0.9);
      /* Busy: well above the average hour. Slower: one in ten waited past the dispatch's long-wait mark (or the period's
         90th percentile), and the typical wait ran at least two minutes over the period's median. */
      const flag = b.t.length >= 8 && b.orders >= avgOrders * 1.15 && p != null && p > (lim || p90) && m >= med + 2;
      return { h: h, orders: b.orders, perDay: c.days ? b.orders / c.days : 0, n: b.t.length, med: m, p90: p, within: lim ? pct(b.t.filter(function (v) { return v <= lim; }).length, b.t.length) : null, flag: flag };
    });
    return { c: c, timed: timed, all: all, med: med, p90: p90, lim: lim, within: lim ? pct(all.filter(function (v) { return v <= lim; }).length, all.length) : null, rows: rows, flagged: rows.filter(function (r) { return r.flag; }) };
  }
  function hoursText(list) {
    const ls = list.map(function (r) { return hourLabel(r.h); });
    return ls.length <= 1 ? ls.join('') : ls.slice(0, -1).join(', ') + ' and ' + ls[ls.length - 1];
  }
  function suggestText(t) {
    if (t.all.length < 20) return 'Too few timed deliveries in this period to compare hours.';
    if (!t.flagged.length) return 'No hour stood out as both busier and slower than usual in this period.';
    return 'Hours that may need a second cart: ' + hoursText(t.flagged) + '. Orders came in faster than usual then, and one in ten waited longer than ' + mins(Math.min.apply(null, t.flagged.map(function (r) { return r.p90; }))) + '.';
  }
  function timesCSV(ctx, t) {
    return [['Hour placed', 'Orders', 'Orders per service day', 'Deliveries timed', 'Median (min)', '90th percentile (min)', t.lim ? 'Within ' + t.lim + ' min %' : 'Within limit %', 'May need a second cart']]
      .concat(t.rows.map(function (r) { return [hourLabel(r.h), r.orders, r.perDay.toFixed(2), r.n, r.med == null ? '' : r.med.toFixed(1), r.p90 == null ? '' : r.p90.toFixed(1), r.within == null ? '' : r.within, r.flag ? 'Yes' : '']; }))
      .concat([[], ['All hours', t.c.live.length, t.c.days ? (t.c.live.length / t.c.days).toFixed(2) : '', t.all.length, t.med == null ? '' : t.med.toFixed(1), t.p90 == null ? '' : t.p90.toFixed(1), t.within == null ? '' : t.within, ''],
        ['Period', ctx.from + ' to ' + ctx.to], ['Includes sample history', t.c.all.some(function (o) { return o.sample; }) ? 'Yes, before ' + t.c.src.first : 'No']]);
  }
  function timesDrill(ctx) {
    const t = stats(ctx, 'times', timesStats), DR = Club.drill;
    let html = DR.kpis([
      { label: 'Deliveries', value: F.num(t.all.length), sub: 'Timed in this period' },
      { label: 'Median', value: mins(t.med), sub: 'Order to delivery' },
      { label: '90th percentile', value: mins(t.p90), sub: t.all.length ? 'Slowest ' + mins(Math.max.apply(null, t.all)) : '' },
      t.lim ? { label: 'Within ' + t.lim + ' min', value: (t.within || 0) + '%', sub: 'The dispatch long-wait mark' } : { label: 'Fastest', value: t.all.length ? mins(Math.min.apply(null, t.all)) : 'None', sub: '' }
    ]);
    if (!t.all.length) return { title: 'Cart delivery times', body: html + DR.empty('No deliveries in this period', 'Choose a period that includes the golf season.', 'clock'), go: 'cart', goLabel: 'Open beverage cart' };
    html += DR.sec('Suggestion', 'From the data, not a rule', DR.note(suggestText(t)));
    const rows = t.rows.filter(function (r) { return r.n; });
    html += DR.sec('Orders per hour', 'Per service day, ' + count(t.c.days, 'day'), Club.charts.bar({ labels: t.rows.map(function (r) { return hourShort(r.h); }), series: [{ name: 'Orders per day', values: t.rows.map(function (r) { return Math.round(r.perDay * 10) / 10; }), color: 'var(--viz-1)' }], height: 160 }));
    if (rows.length >= 2) html += DR.sec('Delivery time by hour', 'Minutes', Club.charts.line({ labels: rows.map(function (r) { return hourShort(r.h); }), series: [{ name: 'Median', values: rows.map(function (r) { return Math.round(r.med); }), color: 'var(--viz-1)' }, { name: '90th percentile', values: rows.map(function (r) { return Math.round(r.p90); }), color: 'var(--viz-2)' }], height: 180, area: false }));
    html += DR.sec('Every hour', '', DR.table([{ label: 'Hour' }, { label: 'Per day', num: true }, { label: 'Median', num: true }, { label: '90th pct', num: true }].concat(t.lim ? [{ label: 'Within ' + t.lim + ' min', num: true }] : []),
      t.rows.map(function (r) {
        return ['<span class="primary-cell">' + esc(hourLabel(r.h)) + '</span>' + (r.flag ? '<div class="dd-sub">May need a second cart</div>' : ''), esc((Math.round(r.perDay * 10) / 10).toFixed(1)), esc(r.n ? mins(r.med) : '-'), esc(r.n ? mins(r.p90) : '-')].concat(t.lim ? [r.n ? r.within + '%' : '-'] : []);
      })));
    const wd = H.WD.map(function () { return []; });
    t.timed.forEach(function (x) { wd[(F.toDate(x.o.date).getDay() + 6) % 7].push(x.m); });
    html += DR.sec('By weekday', '', DR.table([{ label: 'Day' }, { label: 'Deliveries', num: true }, { label: 'Median', num: true }, { label: '90th pct', num: true }],
      H.WD.map(function (w, i) { return ['<span class="primary-cell">' + w + '</span>', F.num(wd[i].length), esc(wd[i].length ? mins(median(wd[i])) : '-'), esc(wd[i].length ? mins(pctile(wd[i], 0.9)) : '-')]; })));
    const slow = t.timed.slice().sort(function (a, b) { return b.m - a.m; }).slice(0, 8);
    html += DR.sec('Longest waits', '', DR.table([{ label: 'Placed' }, { label: 'Hole' }, { label: 'Golfer' }, { label: 'Delivery', num: true }],
      slow.map(function (x) { return ['<span class="primary-cell">' + esc(F.dateShort(x.o.date)) + '</span><div class="dd-sub">' + esc(F.time(clockOf(x.o.placedAt))) + '</div>', validHole(x.o.hole) ? 'Hole ' + x.o.hole : 'Clubhouse', esc(x.o.name || 'Golfer'), esc(mins(x.m))]; })));
    if (t.lim) html += DR.note('The dispatch rules (js/core/cartdispatch.js) treat ' + t.lim + ' minutes as a long wait: an order waiting that long can no longer be passed by other orders, except for tiny detours.');
    return { title: 'Cart delivery times', body: html, go: 'cart', goLabel: 'Open beverage cart' };
  }

  /* ======================================================================
     Dining room guests and the average check (the period's rows)
     ====================================================================== */
  function fnbData(ctx) {
    return stats(ctx, 'fnb', function () {
      const rows = ctx.rows;
      const covers = rows.map(function (r) { return num(r.covers); });
      const checks = rows.map(function (r) { return r.covers ? Math.round(num(r.revenue.dining) / r.covers * 100) / 100 : 0; });
      const tc = H.sum(covers, function (v) { return v; }), tr = H.sum(rows, function (r) { return r.revenue.dining; });
      const fair = H.fairRows(ctx);
      const best = fair.length ? fair.reduce(function (b, r) { return num(r.covers) > num(b.covers) ? r : b; }, fair[0]) : null;
      const withCheck = rows.map(function (r, i) { return { r: r, c: checks[i] }; }).filter(function (x) { return x.c > 0 && !H.isPartial(x.r); });
      const hi = withCheck.length ? withCheck.reduce(function (b, x) { return x.c > b.c ? x : b; }, withCheck[0]) : null;
      const lo = withCheck.length ? withCheck.reduce(function (b, x) { return x.c < b.c ? x : b; }, withCheck[0]) : null;
      // Where people dined, from the reservations on file in the period.
      const res = []; Object.keys(ctx.ix.res).forEach(function (d) { if (d >= ctx.from && d <= ctx.to) ctx.ix.res[d].forEach(function (x) { res.push(x); }); });
      const venues = {}, svc = { Breakfast: 0, Lunch: 0, Dinner: 0 };
      res.forEach(function (r) { const v = r.venue || 'Other'; venues[v] = (venues[v] || 0) + num(r.partySize); const m = H.toMin(r.time); svc[m < 660 ? 'Breakfast' : m < 990 ? 'Lunch' : 'Dinner'] += num(r.partySize); });
      const venueList = Object.keys(venues).map(function (v) { return { label: v, value: venues[v] }; }).sort(function (a, b) { return b.value - a.value; });
      return { covers: covers, checks: checks, total: tc, revenue: tr, avg: tc ? tr / tc : 0, best: best && best.covers ? best : null, hi: hi, lo: lo, res: res, venues: venueList, svc: svc, resGuests: H.sum(res, function (r) { return r.partySize; }) };
    });
  }
  function fnbCSV(ctx) {
    const d = fnbData(ctx);
    return [[ctx.gran === 'day' ? 'Date' : 'Month', 'Dining room guests', 'Dining revenue', 'Average check']].concat(ctx.rows.map(function (r, i) { return [H.csvKey(r), d.covers[i], num(r.revenue.dining), d.checks[i].toFixed(2)]; }));
  }

  /* ======================================================================
     Pro shop top sellers (itemised sales)
     ====================================================================== */
  function shopData(ctx) {
    return stats(ctx, 'shop', function () {
      const inR = H.inRange(ctx);
      const sales = H.all('sales').filter(function (s) { return inR(s.date); });
      const agg = {};
      sales.forEach(function (s) {
        (s.items || []).forEach(function (it) {
          if (!it) return;
          const k = it.productId || it.name; if (!k) return;
          const p = it.productId ? S.find('products', it.productId) : null;
          const a = agg[k] = agg[k] || { name: it.name || (p && p.name) || 'Item', cat: p ? p.category : '', qty: 0, rev: 0, cost: 0, known: true };
          const q = num(it.qty) || 1; a.qty += q; a.rev += q * num(it.price);
          if (p && p.cost != null) a.cost += q * num(p.cost); else a.known = false;
        });
      });
      const list = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.rev - a.rev; });
      const rev = H.sum(list, function (a) { return a.rev; }), known = list.filter(function (a) { return a.known; });
      const kr = H.sum(known, function (a) { return a.rev; }), kc = H.sum(known, function (a) { return a.cost; });
      return { sales: sales, list: list, rev: rev, margin: kr ? Math.round((kr - kc) / kr * 100) : null };
    });
  }
  function shopCSV(ctx) {
    const d = shopData(ctx);
    return [['Product', 'Category', 'Units', 'Revenue', 'Cost', 'Margin %']].concat(d.list.map(function (a) { return [a.name, a.cat, a.qty, a.rev.toFixed(2), a.known ? a.cost.toFixed(2) : '', a.known && a.rev ? ((a.rev - a.cost) / a.rev * 100).toFixed(1) : '']; }));
  }
  function shopDrill(ctx) {
    const d = shopData(ctx);
    let html = DR.kpis([
      { label: 'Shop sales', value: F.money0(d.rev), sub: 'Itemised sales in the period' },
      { label: 'Tickets', value: F.num(d.sales.length), sub: d.sales.length ? F.money(d.rev / d.sales.length) + ' average' : '' },
      { label: 'Gross margin', value: d.margin == null ? 'n/a' : d.margin + '%', sub: 'Where costs are on file' },
      { label: 'Products sold', value: F.num(d.list.length), sub: d.list.length ? F.num(H.sum(d.list, function (a) { return a.qty; })) + ' units' : '' }
    ]);
    html += DR.sec('Every product', 'By revenue', d.list.length ? DR.table([{ label: 'Product' }, { label: 'Share' }, { label: 'Units', num: true }, { label: 'Revenue', num: true }, { label: 'Margin', num: true }],
      d.list.map(function (a) { const mg = a.known && a.rev ? Math.round((a.rev - a.cost) / a.rev * 100) : null; return ['<span class="primary-cell">' + esc(a.name) + '</span>' + (a.cat ? '<div class="dd-sub">' + esc(a.cat) + '</div>' : ''), DR.share(a.rev, d.rev), F.num(a.qty), esc(F.money0(a.rev)), mg == null ? '<span class="muted">n/a</span>' : mg + '%']; })) : DR.note('Top sellers appear once the pro shop rings up sales.'));
    const cov = H.coverage(ctx.ix.first.sales, ctx, 'Itemised sales'); if (cov) html += DR.note(cov);
    return { title: 'Pro shop sales', body: html, csv: shopCSV(ctx), go: 'proshop', goLabel: 'Open pro shop' };
  }

  /* ======================================================================
     The section
     ====================================================================== */
  function kpis(ctx) {
    const d = fnbData(ctx), t = stats(ctx, 'to', takeoutStats), c = stats(ctx, 'cart', cartStats), p = ctx.prev ? H.periodTotals(ctx.prev.rows).covers : 0;
    /* Changes on the period before. Takeout and cart history (real orders plus the sample history above) reach back
       about a year, so those compare whenever the earlier period starts within it. */
    const pd = ctx.prev ? H.sum(ctx.prev.rows, function (r) { return r.revenue.dining; }) : 0, pAvg = p ? pd / p : 0;
    const pc = ctx.prev && ctx.prev.from >= addDays(today(), -365) ? H.prevCtx(ctx) : null;
    const pt = pc ? stats(pc, 'to', takeoutStats).live.length : null, pcart = pc ? stats(pc, 'cart', cartStats).live.length : null;
    const vs = function (cur, prev) { return prev == null || (!prev && !cur) ? null : prev ? H.pctVs(cur, prev, ctx) : H.kpiChg(cur, 'num', H.prevWords(ctx)); };
    return [
      { label: 'Dining room guests', value: H.numShort(d.total), d: H.delta(d.total, p, ctx, 'covers', F.num(Math.round(H.avgPer(ctx, d.total))) + ' per ' + H.avgUnit(ctx)), chg: H.prevPct(d.total, p, ctx, 'covers'), drill: 'covers', aria: 'Dining room guests ' + F.num(d.total) },
      { label: 'Average check', value: F.money(d.avg), d: esc(F.money0(d.revenue) + ' in dining revenue'), chg: H.prevOK(ctx, 'dining') && pAvg && d.total ? H.kpiChg(d.avg - pAvg, 'cents', 'against ' + F.money(pAvg) + ' ' + H.prevWords(ctx)) : null, drill: 'covers' },
      { label: 'Takeout orders', value: F.num(t.live.length), d: esc(t.live.length ? F.money0(t.rev) + ' before tax' : 'None in this period'), chg: vs(t.live.length, pt), drill: 'takeout' },
      { label: 'Beverage cart orders', value: F.num(c.live.length), d: esc(c.live.length ? F.money0(salesOf(c.done)) + ' over ' + count(c.days, 'day') : 'The cart runs in the golf season'), chg: vs(c.live.length, pcart), drill: 'cartholes' }
    ];
  }
  function main(ctx, state) {
    const chip = state.chip || 'guests', d = fnbData(ctx), L = H.colLabels(ctx), u = H.unitWord(ctx);
    const money = chip === 'revenue', vals = money ? ctx.rows.map(function (r) { return num(r.revenue.dining); }) : d.covers;
    let take;
    if (!d.total) take = 'No dining room guests were recorded in this period.';
    else if (money) { const fair = H.fairRows(ctx), b = fair.length ? fair.reduce(function (x, r) { return num(r.revenue.dining) > num(x.revenue.dining) ? r : x; }, fair[0]) : null; take = F.money0(d.revenue) + ' in dining revenue' + (b ? ', highest in ' + (ctx.gran === 'day' ? F.dateShort(b.key) : H.monthLong(b.key).split(' ')[0]) + ' at ' + F.money0(b.revenue.dining) : '') + '. The average check was ' + F.money(d.avg) + '.'; }
    else take = (d.best ? (ctx.gran === 'day' ? F.weekday(d.best.key) + ', ' + F.dateShort(d.best.key) : H.monthLong(d.best.key).split(' ')[0]) + ' was the busiest ' + u + ' with ' + F.num(d.best.covers) + ' guests. ' : '') + F.num(d.total) + ' guests in all, ' + F.num(Math.round(H.per(ctx, d.total))) + ' per ' + u + ' on average.';
    return { id: 'food-covers', title: 'Dining room guests by ' + u, take: take, chips: [{ id: 'guests', label: 'Guests' }, { id: 'revenue', label: 'Dining revenue' }], chip: chip,
      body: Club.charts.columns({ labels: L.labels, years: L.years, tipTitles: L.titles, partial: L.partial, values: vals, money: money, tipName: money ? 'Dining revenue' : 'Guests', ariaLabel: (money ? 'Dining revenue' : 'Dining room guests') + ' by ' + u }),
      desc: fnbDesc(ctx, chip), foot: H.partialNote(ctx), csvId: 'fnb', drill: 'covers', drillLabel: 'See the table' };
  }
  function panels(ctx) {
    const d = fnbData(ctx), t = stats(ctx, 'to', takeoutStats), c = stats(ctx, 'cart', cartStats), tm = stats(ctx, 'times', timesStats), sh = shopData(ctx), L = H.colLabels(ctx), u = H.unitWord(ctx);
    const out = [];
    const keep = ctx.rows.map(function (r, i) { return i; }).filter(function (i) { return d.checks[i] > 0; });
    out.push({ id: 'food-check', title: 'Average check', take: !keep.length ? 'The average check appears once dining checks are on file.' : 'Guests spent ' + F.money(d.avg) + ' each on average' + (d.hi && d.lo && d.hi !== d.lo ? ', from ' + F.money(d.lo.c) + ' in ' + (ctx.gran === 'day' ? F.dateShort(d.lo.r.key) : H.monthLong(d.lo.r.key).split(' ')[0]) + ' to ' + F.money(d.hi.c) + ' in ' + (ctx.gran === 'day' ? F.dateShort(d.hi.r.key) : H.monthLong(d.hi.r.key).split(' ')[0]) : '') + '.',
      body: keep.length ? Club.charts.columns({ labels: keep.map(function (i) { return L.labels[i]; }), years: keep.map(function (i) { return L.years[i]; }), tipTitles: keep.map(function (i) { return L.titles[i]; }), partial: keep.map(function (i) { return L.partial[i]; }), values: keep.map(function (i) { return d.checks[i]; }), money: true, fmt: function (v) { return F.money(v); }, tipName: 'Average check', height: 200, ariaLabel: 'Average check by ' + u }) : '',
      desc: checkDesc(ctx, d, keep), foot: keep.length ? 'Dining revenue divided by guests, per ' + u + '.' : '', csvId: 'fnb', drill: 'covers', drillLabel: 'See the table' });
    const top = busiestHours(t, 2);
    out.push({ id: 'food-takeout', title: 'Takeout', take: !t.all.length ? 'Orders placed in the members\' portal and on the public site appear here by pickup date.' : count(t.live.length, 'order') + ' and ' + F.money0(t.rev) + ' before tax, ' + F.money(t.avg) + ' an order. Busiest at ' + top.map(hourLabel).join(' and ') + (t.pizzas ? '; ' + count(t.pizzas, 'Friday pizza') + ' over ' + count(t.fridays, 'Friday') : '') + '. ' + pct(t.memN, t.live.length) + '% of orders came from members.',
      body: t.all.length ? Club.charts.columns({ labels: t.hList.map(hourShort), tipTitles: t.hList.map(hourLabel), values: t.hList.map(function (h) { return t.hours[h] || 0; }), tipName: 'Orders', height: 200, whole: true, ariaLabel: 'Takeout orders by pickup hour' }) : '',
      desc: takeoutDesc(t), foot: t.all.length ? 'Orders by pickup hour.' + (t.cancelled.length ? ' ' + count(t.cancelled.length, 'order') + ' cancelled.' : '') : '', csvId: 'takeout', drill: 'takeout', drillLabel: 'See top items and regulars' });
    out.push({ id: 'food-cartholes', title: 'Beverage cart orders by hole', take: !c.all.length ? 'The beverage cart runs in the golf season. Choose a period that includes the summer.' : count(c.live.length, 'order') + ' over ' + count(c.days, 'day') + '. ' + stretchText(c),
      body: c.all.length ? '<div class="rh-holes">' + nine(c, 1, 'Front nine') + nine(c, 10, 'Back nine') + '</div>' +
        '<div class="rh-holes-foot"><button type="button" class="rh-ch" data-drill="hole" data-arg="CH" aria-label="' + esc('Clubhouse or no hole: ' + count(c.none.length, 'order') + '. Show details') + '"><span>Clubhouse or no hole</span><strong>' + F.num(c.none.length) + '</strong></button><div class="rh-legend" aria-hidden="true"><span>Fewer</span><span class="rh-legend-bar"></span><span>More</span></div></div>' : '',
      desc: holesDesc(c), foot: c.all.length ? 'Choose a hole for its orders and top items.' : '', csvId: 'cartholes', drill: 'cartholes', drillLabel: 'See every hole' });
    const maxO = Math.max.apply(null, tm.rows.map(function (x) { return x.orders; }).concat([1]));
    out.push({ id: 'food-carttimes', title: 'Cart delivery times', take: !tm.all.length ? 'Delivery times appear once the cart has delivered orders in the selected dates.' : 'Half of deliveries took under ' + mins(tm.med) + ' and nine in ten under ' + mins(tm.p90) + (tm.lim ? '; ' + tm.within + '% were within the ' + tm.lim + ' minute mark' : '') + '. ' + suggestText(tm),
      body: tm.all.length ? Club.charts.columns({ labels: tm.rows.map(function (r) { return hourShort(r.h); }), tipTitles: tm.rows.map(function (r) { return hourLabel(r.h) + ', ' + count(r.orders, 'order') + (r.flag ? ', busy and slower' : ''); }), values: tm.rows.map(function (r) { return r.n ? Math.round(r.med) : 0; }), fmt: function (v) { return v + ' min median'; }, tipName: '', height: 200, ariaLabel: 'Median delivery time by hour placed' }) : '',
      desc: timesDesc(tm), foot: tm.all.length ? 'Median minutes from order to delivery, by the hour the order was placed.' : '', csvId: 'carttimes', drill: 'carttimes', drillLabel: 'See delivery details' });
    out.push({ id: 'food-shop', title: 'Pro shop top sellers', take: !sh.list.length ? 'Top sellers appear once the pro shop rings up sales.' : sh.list[0].name + ' led with ' + F.money0(sh.list[0].rev) + '. ' + F.money0(sh.rev) + ' in itemised sales over ' + count(sh.sales.length, 'ticket') + (sh.margin != null ? ', ' + sh.margin + '% gross margin where costs are on file' : '') + '.',
      body: sh.list.length ? Club.charts.ranked(sh.list.slice(0, 5).map(function (a) { return { label: a.name, sub: (a.cat ? a.cat + ', ' : '') + F.num(a.qty) + ' sold', value: a.rev, attrs: 'data-drill="shop" aria-label="' + esc(a.name + ' ' + F.money0(a.rev) + '. See every product') + '"' }; }), { total: sh.rev, fmt: F.money0 }) : '',
      desc: shopDesc(ctx, sh), foot: '', csvId: 'shop', drill: 'shop', drillLabel: 'See all ' + sh.list.length });
    out.push({ id: 'food-venues', title: 'Where people dined', take: !d.res.length ? 'Venue detail comes from dining reservations, which hold no records for this period.' : d.venues[0].label + ' seated the most, ' + pct(d.venues[0].value, d.resGuests) + '% of the ' + F.num(d.resGuests) + ' guests with a reservation. Dinner ' + (d.svc.Dinner >= d.svc.Lunch && d.svc.Dinner >= d.svc.Breakfast ? 'is the biggest service' : 'is not the biggest service') + ' at ' + pct(d.svc.Dinner, d.resGuests) + '%.',
      body: d.res.length ? Club.charts.ranked(d.venues.slice(0, 5).map(function (v) { return { label: v.label, value: v.value }; }), { total: d.resGuests }) : '',
      desc: venuesDesc(d), foot: d.res.length ? 'From ' + F.num(d.res.length) + ' reservations on file.' + (ctx.ix.first.res > ctx.from ? ' Reservation detail begins ' + F.dateShort(ctx.ix.first.res) + '.' : '') : '', csvId: 'fnb', drill: 'covers', drillLabel: 'See the table' });
    return out;
  }
  /* ======================================================================
     Descriptions under the charts, and ideas to grow revenue
     ====================================================================== */
  function when(ctx, r) { return H.whenLabel(ctx, r); }
  function fnbDesc(ctx, chip) {
    const d = fnbData(ctx), u = H.unitWord(ctx), money = chip === 'revenue', val = function (r) { return money ? num(r.revenue.dining) : num(r.covers); };
    if (!d.total) return H.sents(['Each column counts the guests seated in the dining room in a ' + u + '.', 'None were recorded in these dates; choose a longer period.']);
    const fair = H.fairRows(ctx), out = [money ? 'Each column is a ' + u + '\'s dining revenue before service and tax, ' + F.money0(d.revenue) + ' in all.' : 'Each column counts the guests seated in the dining room in a ' + u + ', ' + F.num(d.total) + ' in all.'];
    if (fair.length >= 2) {
      let lo = fair[0]; fair.forEach(function (r) { if (val(r) < val(lo)) lo = r; });
      const avg = H.sum(fair, val) / fair.length;
      if (avg > 0 && val(lo) < avg) out.push(when(ctx, lo) + ' was the quietest at ' + (money ? F.money0(val(lo)) : F.num(val(lo)) + ' guests') + ', ' + Math.round((avg - val(lo)) / avg * 100) + '% below the average.');
    }
    if (ctx.gran === 'month') {
      const s = fair.filter(function (r) { return H.inSeasonKey(r.key); }), w = fair.filter(function (r) { return !H.inSeasonKey(r.key); });
      if (s.length && w.length) { const sa = H.sum(s, val) / s.length, wa = H.sum(w, val) / w.length; out.push('Winter months averaged ' + (money ? F.money0(wa) : F.num(Math.round(wa)) + ' guests') + ' against ' + (money ? F.money0(sa) : F.num(Math.round(sa))) + ' in the golf season, so the dining room carries on when the course closes.'); }
    }
    const pm = H.per(ctx, d.total);
    out.push('At about ' + F.num(Math.round(pm)) + ' guests a ' + u + ', every extra dollar on the average check is worth about ' + F.money0(pm) + ' a ' + u + '.');
    return H.sents(out.slice(0, 4));
  }
  function checkDesc(ctx, d, keep) {
    if (!keep.length) return H.sents(['Each column will show dining revenue divided by guests.', 'No dining checks are on file for these dates.']);
    const fr = keep.filter(function (i) { return !H.isPartial(ctx.rows[i]); }), a = fr[0], b = fr[fr.length - 1];
    return H.sents(['Each column is dining revenue divided by guests for that ' + H.unitWord(ctx) + ', the average spent per head.',
      fr.length >= 2 ? 'It moved from ' + F.money(d.checks[a]) + (ctx.gran === 'day' ? ' on ' : ' in ') + when(ctx, ctx.rows[a]) + ' to ' + F.money(d.checks[b]) + (ctx.gran === 'day' ? ' on ' : ' in ') + when(ctx, ctx.rows[b]) + '.' : '',
      d.hi && d.lo && d.hi !== d.lo ? 'The spread from the lowest to the highest ' + H.unitWord(ctx) + ' is ' + F.money(d.hi.c - d.lo.c) + ' a head, which shows how much menu, specials and season move the check.' : '']);
  }
  function takeoutDesc(t) {
    if (!t.all.length) return H.sents(['Columns count takeout orders by the hour they were picked up.', 'None were placed in this period.']);
    const quiet = t.hList.slice(1, -1).sort(function (a, b) { return (t.hours[a] || 0) - (t.hours[b] || 0); })[0];
    return H.sents(['Columns count takeout orders by the hour they were picked up.',
      t.repeat.length ? t.repeat.length + ' repeat ' + (t.repeat.length === 1 ? 'customer' : 'customers') + ' placed ' + pct(t.repeatOrders, t.live.length) + '% of orders.' : 'No one ordered more than once in this period.',
      t.items.length ? 'The best seller was ' + t.items[0].name + ', ' + F.num(t.items[0].qty) + ' sold.' : '',
      quiet != null ? 'Quiet hours, like ' + hourLabel(quiet) + ', are where a lunch or early dinner special has room to add orders.' : '']);
  }
  function holesDesc(c) {
    if (!c.all.length) return H.sents(['Each cell is a hole, shaded by how many beverage cart orders came from it.', 'The cart runs in the golf season, so choose a period that includes the summer.']);
    const front = H.sum(c.holes.slice(1, 10), function (x) { return x.list.length; }), back = H.sum(c.holes.slice(10), function (x) { return x.list.length; });
    let lo = null; c.holes.slice(1).forEach(function (x) { if (!lo || x.list.length < lo.list.length) lo = x; });
    const done = c.done.length;
    return H.sents(['Each cell is a hole, shaded by how many cart orders were placed from it; darker means more.',
      'The front nine placed ' + pct(front, c.live.length) + '% of orders and the back nine ' + pct(back, c.live.length) + '%.',
      done ? 'Delivered orders averaged ' + F.money(salesOf(c.done) / done) + ' each.' : '',
      lo && c.live.length >= 10 ? 'Hole ' + lo.hole + ' had the fewest orders (' + lo.list.length + '), so a cart stop there sells the least.' : '']);
  }
  function timesDesc(tm) {
    if (!tm.all.length) return H.sents(['Each column will show the median minutes from order to delivery, by the hour the order was placed.', 'There are no timed deliveries in these dates.']);
    const timed = tm.rows.filter(function (r) { return r.n >= 3; }), slow = timed.slice().sort(function (a, b) { return b.med - a.med; })[0];
    return H.sents(['Each column is the median minutes from order to delivery for orders placed in that hour.',
      slow ? 'Orders placed at ' + hourLabel(slow.h) + ' waited longest, a median of ' + mins(slow.med) + '.' : '',
      tm.lim ? tm.within + '% arrived within ' + tm.lim + ' minutes, the dispatch\'s long-wait mark.' : '',
      'Hours where waits run long are the ones to staff first.']);
  }
  function shopDesc(ctx, sh) {
    if (!sh.list.length) return H.sents(['Rows will rank products by sales in this period.', 'Top sellers appear once the pro shop rings up sales.']);
    const top = H.sum(sh.list.slice(0, 5), function (a) { return a.rev; });
    const low = H.all('products').filter(function (p) { return p && p.stock != null && p.reorderAt != null && num(p.stock) <= num(p.reorderAt) && sh.list.slice(0, 10).some(function (a) { return a.name === p.name; }); })[0];
    const cov = ctx.ix.first.sales && ctx.ix.first.sales > ctx.from ? ' (itemised sales begin ' + F.dateShort(ctx.ix.first.sales) + ')' : '';
    return H.sents(['Rows rank products by itemised sales in this period' + cov + '.', 'The top five made ' + pct(top, sh.rev) + '% of ' + F.money0(sh.rev) + ' in shop sales.',
      low ? low.name + ' is one of the best sellers and is down to ' + low.stock + ' in stock, at or below its reorder point; reordering now protects sales that are already proven.' : sh.margin != null ? 'Gross margin was ' + sh.margin + '% where costs are on file.' : '']);
  }
  function venuesDesc(d) {
    if (!d.res.length) return H.sents(['Rows show where guests with a reservation were seated.', 'Venue detail comes from dining reservations, which hold none for these dates.']);
    const S_ = d.svc, tot = d.resGuests, low = ['Breakfast', 'Lunch', 'Dinner'].sort(function (a, b) { return S_[a] - S_[b]; })[0];
    return H.sents(['Rows show where guests with a reservation were seated.', 'Dinner took ' + pct(S_.Dinner, tot) + '% of reserved guests, lunch ' + pct(S_.Lunch, tot) + '% and breakfast ' + pct(S_.Breakfast, tot) + '%.',
      'Parties averaged ' + (Math.round(tot / d.res.length * 10) / 10) + ' guests.', low + ' is the quietest service, so it has the most room to grow.']);
  }
  function ideas(ctx) {
    const out = [], d = fnbData(ctx), u = H.unitWord(ctx);
    if (d.total) {
      const pm = ctx.gran === 'day' ? H.per(ctx, d.total) * 30.4375 : H.per(ctx, d.total);
      out.push({ title: 'Add a dollar to the average check', text: 'The dining room seats about ' + F.num(Math.round(pm)) + ' guests a month at ' + F.money(d.avg) + ' a head. Suggesting a dessert, a side or a drink with every order to lift the check by $1 would add about ' + F.money0(pm) + ' a month.',
        assume: 'Assumes $1 more per guest at this period\'s guests a month, for twelve months.', amount: pm, per: 'a month', year: pm * 12 });
    }
    const c = stats(ctx, 'cart', cartStats);
    if (c.done.length >= 20) {
      let sales = 0, rounds = 0, days = 0;
      ctx.rows.forEach(function (r) { const ds = c.done.filter(function (o) { return o.date >= r.from && o.date <= r.to; }); if (!ds.length || !num(r.rounds)) return; sales += salesOf(ds); rounds += num(r.rounds); days += H.spanDays(r.from, r.to); });
      if (rounds && days) {
        const wk = rounds / (days / 7), amt = wk * 0.25;
        out.push({ title: 'Sell more from the beverage cart', text: 'In the ' + u + 's the cart ran, it took ' + F.money(sales / rounds) + ' per round played' + (c.stretch && c.live.length >= 10 ? ', with most orders from holes ' + c.stretch.from + ' to ' + c.stretch.to : '') + '. Twenty-five cents more per round, from a second loop at busy hours or a drink and snack combo, would add about ' + F.money0(amt) + ' a week.',
          assume: 'Assumes $0.25 more per round at this period\'s rounds a week, for the ' + Club.season.weeks() + '-week golf season.' + (c.all.some(function (o) { return o.sample; }) ? ' Cart orders before ' + F.dateShort(c.src.first) + ' are sample history.' : ''), amount: amt, per: 'a week', year: amt * Club.season.weeks() });
      }
    }
    const tm = stats(ctx, 'times', timesStats);
    if (tm.flagged.length) out.push({ title: 'Add a second cart at the busiest hours', text: suggestText(tm) + ' A second cart at those hours would shorten the longest waits.', assume: 'No estimate: the data shows the waits, not how many orders they cost.', amount: null, year: 0 });
    const fs = ctx.ix.first.sales, since = fs && fs > ctx.from ? fs : ctx.from;
    if (fs && fs <= ctx.to && H.spanDays(since, ctx.to) >= 28) {   /* a few days without a sale says nothing about a product */
      const sold = {};
      H.all('sales').forEach(function (x) { if (x.date >= since && x.date <= ctx.to) (x.items || []).forEach(function (it) { if (it) sold[it.productId || it.name] = 1; }); });
      const idle = H.all('products').filter(function (p) { return p && num(p.stock) > 0 && num(p.price) > 0 && !sold[p.id] && !sold[p.name]; }).sort(function (a, b) { return num(b.stock) * num(b.price) - num(a.stock) * num(a.price); });
      const retail = H.sum(idle, function (p) { return num(p.stock) * num(p.price); });
      if (idle.length && retail) out.push({ title: 'Clear slow-moving shop stock', text: idle.length + ' ' + (idle.length === 1 ? 'product' : 'products') + ' in stock ' + (idle.length === 1 ? 'has' : 'have') + ' not sold since ' + F.dateShort(since) + ', ' + F.money0(retail) + ' at full price, led by ' + H.joinAnd(idle.slice(0, 2).map(function (p) { return p.name; })) + '. An end-of-season sale at 20% off that clears half of it would bring in about ' + F.money0(retail * 0.4) + '.',
        assume: 'Assumes half of that stock sells at 20% off. Itemised sales on file begin ' + F.dateShort(fs) + ', so some of it may simply sell in season.', amount: retail * 0.4, per: 'one time', year: retail * 0.4 });
    }
    const gc = H.all('giftCards').filter(function (g) { return g && g.status !== 'void'; }), gin = gc.filter(function (g) { return g.date >= ctx.from && g.date <= ctx.to; });
    if (!gc.length) out.push({ title: 'Start selling gift cards', text: 'No gift cards have been sold yet. They can be bought in the members\' portal and on the public site; a card display at the golf shop and the Gallery ahead of the holidays is a low-cost start, with no stock to hold.', assume: 'No estimate: there are no gift card sales on file to base one on.', amount: null, year: 0 });
    else if (gin.length) {
      const avg = H.sum(gin, function (g) { return g.amount; }) / gin.length;
      out.push({ title: 'Sell more gift cards', text: gin.length + ' gift ' + (gin.length === 1 ? 'card was' : 'cards were') + ' sold in this period, ' + F.money0(H.sum(gin, function (g) { return g.amount; })) + ' in all, averaging ' + F.money0(avg) + '. Ten more a year at that value would add ' + F.money0(avg * 10) + '.', assume: 'Assumes ten more cards a year at this period\'s average value.', amount: avg * 10, per: 'a year', year: avg * 10 });
    }
    return out;
  }
  function about(ctx) {
    const t = stats(ctx, 'to', takeoutStats), c = stats(ctx, 'cart', cartStats), tm = stats(ctx, 'times', timesStats), out = [];
    out.push(H.marksText(ctx) + ' Dining room guests are party sizes from reservations in the live months and the monthly ledger for closed months; the average check is dining revenue divided by guests.');
    out.push('Takeout is by pickup date. Revenue leaves out tax and cancelled orders. Repeat customers ordered two or more times in the period.' + (t.all.some(function (o) { return o.sample; }) ? ' Takeout orders before ' + F.date(t.src.first) + ' are sample history for the demo.' : ''));
    out.push('Beverage cart orders count the hole each order or cart visit was placed from, without cancellations. Delivery time runs from the order being placed to the cart marking it delivered' + (tm.lim ? '; the dispatch rules treat ' + tm.lim + ' minutes as a long wait, after which other orders can no longer be moved ahead of it' : '') + '.' + (c.all.some(function (o) { return o.sample; }) ? ' Cart orders before ' + F.date(c.src.first) + ' are sample history for the demo.' : ''));
    const cov = [H.coverage(ctx.ix.first.res, ctx, 'Dining reservation'), H.coverage(ctx.ix.first.sales, ctx, 'Itemised sales')].filter(Boolean);
    if (cov.length) out.push(cov.join(' '));
    return out;
  }
  function csv(ctx) {
    const t = stats(ctx, 'to', takeoutStats), c = stats(ctx, 'cart', cartStats), tm = stats(ctx, 'times', timesStats);
    return [
      { id: 'fnb', title: 'Dining room guests and average check', rows: fnbCSV(ctx) },
      { id: 'takeout', title: 'Takeout', rows: takeoutCSV(ctx, t) },
      { id: 'cartholes', title: 'Beverage cart orders by hole', rows: holesCSV(ctx, c) },
      { id: 'carttimes', title: 'Cart delivery times', rows: timesCSV(ctx, tm) },
      { id: 'shop', title: 'Pro shop top sellers', rows: shopCSV(ctx) }
    ];
  }
  function facts(ctx) {
    const d = fnbData(ctx), c = stats(ctx, 'cart', cartStats), out = [];
    if (d.total) out.push({ text: 'The dining room served ' + F.num(d.total) + ' guests at ' + F.money(d.avg) + ' a head' + (d.best ? ', busiest in ' + (ctx.gran === 'day' ? F.dateShort(d.best.key) : H.monthLong(d.best.key).split(' ')[0]) : '') + '.', where: 'Food, drink and shop' });
    if (c.stretch && c.live.length >= 10) out.push({ text: 'Most beverage cart orders came from holes ' + c.stretch.from + ' to ' + c.stretch.to + ', ' + pct(c.stretch.n, c.live.length) + '% of ' + count(c.live.length, 'order') + '.', where: 'Food, drink and shop' });
    return out;
  }
  Club.reports.addSection({
    id: 'food', label: 'Food, drink and shop', order: 60, collections: ['cartOrders', 'cartMenu', 'takeoutOrders', 'menuItems', '$takeoutSettings', 'sales', 'products', 'diningReservations', 'diningOrders'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, facts: facts, ideas: ideas,
    drills: { takeout: takeoutDrill, cartholes: holesDrill, hole: function (ctx, key) { return holeDrill(ctx, key); }, carttimes: timesDrill, shop: shopDrill },
    data: { fnb: fnbData, takeout: function (ctx) { return stats(ctx, 'to', takeoutStats); }, cart: function (ctx) { return stats(ctx, 'cart', cartStats); }, times: function (ctx) { return stats(ctx, 'times', timesStats); }, shop: shopData, cartOrders: cartOrders }
  });

  /* For checking the numbers from the console: Club.reportsHospitality.sample() */
  Club.reportsHospitality = { sample: function () { return { cart: cartOrders(), takeout: takeoutOrders() }; } };
})();
