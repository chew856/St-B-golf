/* Beverage cart data: the menu (with its upgrades), the daily housekeeping and Club.cart, the ordering and service rules shared by the members' portal, the public site and the staff cart screen.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/cart.js, which reads these helpers from Club.shared.cart. */
(function () {
  'use strict';
  const S = Club.store, D = Club.cartDispatch, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  if (!D) { console.error('Beverage cart: js/core/cartdispatch.js is not loaded'); return; }

  const CATEGORIES = ['Drinks', 'Beer and alcohol', 'Snacks', 'Food', 'Golf'];   /* the starting categories; staff can add more */
  const CART_IDS = ['1', '2', '3'];
  const DEMO_PUBLIC_ID = 'pp_demo_cart';
  const DEMO_PUBLIC_EMAIL = 'alex.morgan@example.com';   /* password: golfdemo1 */
  const MAX_QTY = 20;                                    /* most of one item on one order (the steppers stop here too) */

  /* ---------------- Small helpers ---------------- */
  function today() { return Club.date.today(); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function hm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function nodeLabel(n) { return n === 'CH' ? 'Clubhouse' : 'Hole ' + n; }

  /* ---------------- Group stops ---------------- */
  /** The dispatch entry an order rides on: its group's entry, or its own id (orders from before groups, the demo). */
  function entryOf(d) { return d ? (d.groupId || d.id) : null; }
  /** Open orders on one dispatch entry, oldest first. */
  function entryDocs(eid) { return S.all('cartOrders').filter(function (o) { return o.status === 'open' && entryOf(o) === eid; }).sort(function (a, b) { return a.placedAt - b.placedAt; }); }
  function groupName(docs) { const n = String((docs[0] || {}).name || '').trim().split(' '); return (n[n.length - 1] || 'Your') + ' group'; }
  /** Update the location on every open order of an entry (the dispatch entry itself is changed by the caller). */
  function setEntryHole(eid, hole, at, text) {
    entryDocs(eid).forEach(function (d) { S.update('cartOrders', d.id, { hole: hole, holeAt: at, holeHold: null, log: log(d, text) }); });
  }
  /** A hole the golfer chose by hand holds against GPS until a phone reaches a different hole: holeHold is the GPS hole
      at that moment, and fixes there are ignored (any later location change clears it, setEntryHole). */
  function holdEntry(eid, gpsNode) { entryDocs(eid).forEach(function (d) { S.update('cartOrders', d.id, { holeHold: +gpsNode }); }); }
  function heldAgainst(d, node) { return d.holeHold != null && +d.holeHold === +node; }

  /* ---------------- Seed: the placeholder menu (confirm with the club) ---------------- */
  /* A typical Canadian golf course beverage cart, at typical Winnipeg course prices (CAD). Placeholders: the club's real
     cart menu and prices are still to come, and staff can change everything on the Menu tab. */
  const MENU = [
    ['cm_water', 'Bottled water', '', 'Drinks', 3],
    ['cm_pop', 'Pop', 'Can', 'Drinks', 3],
    ['cm_sports', 'Sports drink', '', 'Drinks', 4.25],
    ['cm_icedtea', 'Iced tea', 'Can', 'Drinks', 3.5],
    ['cm_energy', 'Energy drink', '', 'Drinks', 4.75],
    ['cm_coffee', 'Coffee', '', 'Drinks', 2.75],
    ['cm_beer', 'Domestic beer', 'Tall can', 'Beer and alcohol', 8.5, true],
    ['cm_lightbeer', 'Light beer', 'Tall can', 'Beer and alcohol', 8.5, true],
    ['cm_craft', 'Local craft beer', 'Tall can', 'Beer and alcohol', 9.75, true],
    ['cm_seltzer', 'Hard seltzer', 'Can', 'Beer and alcohol', 8.75, true],
    ['cm_cooler', 'Cooler', 'Can', 'Beer and alcohol', 8.75, true],
    ['cm_caesar', 'Caesar', 'Can', 'Beer and alcohol', 9.25, true],
    ['cm_nabeer', 'Non-alcoholic beer', 'Can', 'Beer and alcohol', 6],
    ['cm_chips', 'Chips', '', 'Snacks', 3],
    ['cm_choc', 'Chocolate bar', '', 'Snacks', 3],
    ['cm_granola', 'Granola bar', '', 'Snacks', 2.5, false, true],
    ['cm_trail', 'Trail mix', '', 'Snacks', 4.5],
    ['cm_jerky', 'Beef jerky', '', 'Snacks', 7.5],
    ['cm_seeds', 'Sunflower seeds', '', 'Snacks', 3.25],
    ['cm_fruit', 'Banana or apple', '', 'Snacks', 1.75],
    ['cm_breakfast', 'Breakfast sandwich', '', 'Food', 7.5],
    ['cm_hotdog', 'Hot dog', '', 'Food', 6.5],
    ['cm_smokie', 'Smokie', '', 'Food', 7.5],
    ['cm_sandwich', 'Deli sandwich', '', 'Food', 10],
    ['cm_wrap', 'Chicken wrap', '', 'Food', 11],
    ['cm_balls', 'Golf balls', 'Sleeve of 3', 'Golf', 15],
    ['cm_tees', 'Tees', 'Pack', 'Golf', 3]
  ].map(function (r, i) { return { id: r[0], name: r[1], size: r[2], category: r[3], price: r[4], alcohol: !!r[5], soldOut: !!r[6], order: i + 1 }; });
  S.seed('cartMenu', function () { return MENU; });
  /* Menu v2 (Nov 2026): a browser still holding the first, 11-item placeholder menu unedited gets MENU; a menu staff
     have changed (items, names or prices) is left alone. */
  (function upgradeMenu() {
    if ((S.getObj('cartMenuVersion', 1) || 1) >= 2) return;
    const FIRST = { cm_water: ['Bottled water', 2.5], cm_pop: ['Pop, can', 2.75], cm_sports: ['Sports drink', 3.75], cm_coffee: ['Coffee', 2.5], cm_beer: ['Domestic beer, can', 7.5],
      cm_cooler: ['Cooler, can', 8], cm_chips: ['Chips', 2.5], cm_choc: ['Chocolate bar', 2.5], cm_granola: ['Granola bar', 2.25], cm_hotdog: ['Hot dog', 6], cm_sandwich: ['Sandwich', 9.5] };
    const cur = S.all('cartMenu');
    const untouched = cur.length === Object.keys(FIRST).length && cur.every(function (m) { const f = FIRST[m.id]; return f && f[0] === m.name && f[1] === +m.price; });
    if (untouched) S.replace('cartMenu', MENU.map(function (m) { return Object.assign({}, m); }));
    S.setObj('cartMenuVersion', 2);
  })();
  /* Menu v3: the size moved out of the name ("Domestic beer, tall can" is "Domestic beer" with size "Tall can"), for
     each item still named as in v2 (an item staff renamed keeps its name). */
  (function splitSizes() {
    if ((S.getObj('cartMenuVersion', 1) || 1) >= 3) return;
    const byId = {}; MENU.forEach(function (m) { byId[m.id] = m; });
    S.all('cartMenu').forEach(function (m) {
      const n = byId[m.id];
      if (n && n.size && m.name === n.name + ', ' + n.size.toLowerCase()) S.update('cartMenu', m.id, { name: n.name, size: n.size });
    });
    S.setObj('cartMenuVersion', 3);
  })();
  S.seed('cartOrders', function () { return []; });

  /* ---------------- Data access ---------------- */
  /** The stored fleet, minus any line entry whose order is no longer open (or has no order doc). A lost write in
      another tab can leave one behind; pruning it here (pure, with the dispatch cancelOrder) means no screen shows it
      and the next change writes the clean fleet back. */
  function fleet() {
    let f = S.getObj('cartFleet', null);
    if (!f || !Array.isArray(f.carts)) return D.emptyFleet();
    const open = {}; S.all('cartOrders').forEach(function (d) { if (d.status === 'open') open[entryOf(d)] = 1; });
    f.carts.forEach(function (c) {
      c.line.forEach(function (o) { if (!open[o.id]) f = D.cancelOrder(f, o.id); });
    });
    return f;
  }
  /** Menu categories in order: the starting ones and any staff added ($cartCategories), then any category an item
      still uses that isn't listed. */
  function categories() {
    const list = (S.getObj('cartCategories', null) || CATEGORIES).slice();
    S.all('cartMenu').forEach(function (m) { if (m.category && list.indexOf(m.category) < 0) list.push(m.category); });
    return list;
  }
  /** Remove a category: refused while any menu item is in it, and for the last one. Returns { ok, error, items }. */
  function removeCategory(name) {
    const items = S.all('cartMenu').filter(function (m) { return m.category === name; });
    if (items.length) return { ok: false, error: 'has-items', items: items };
    const list = categories();
    if (list.length <= 1) return { ok: false, error: 'last' };
    S.setObj('cartCategories', list.filter(function (c) { return c !== name; }));
    return { ok: true };
  }
  function menu() { const cats = categories(); return S.all('cartMenu').slice().sort(function (a, b) { return (cats.indexOf(a.category) - cats.indexOf(b.category)) || ((a.order || 0) - (b.order || 0)) || String(a.name).localeCompare(b.name); }); }
  function orders() { return S.all('cartOrders'); }
  function order(id) { return S.find('cartOrders', id); }
  function todays() { const td = today(); return orders().filter(function (o) { return o.date === td; }).sort(function (a, b) { return b.placedAt - a.placedAt; }); }
  function cartOf(f, id) { return (f || fleet()).carts.find(function (c) { return c.id === id; }) || null; }
  function headingTo(c) { return c && c.state.status === 'serving' && c.state.headingTo ? c.state.headingTo : null; }
  function itemsText(items) { return (items || []).map(function (it) { return (it.qty > 1 ? it.qty + ' × ' : '') + it.name; }).join(', '); }
  function itemCount(items) { return (items || []).reduce(function (a, it) { return a + (+it.qty || 0); }, 0); }
  function totalOf(items) { return r2((items || []).reduce(function (a, it) { return a + (+it.qty || 0) * (+it.price || 0); }, 0)); }
  function hasAlcohol(items) { return (items || []).some(function (it) { return it.alcohol; }); }
  function isVisit(d) { return !!d && d.kind === 'visit'; }
  /** What an order is, in a few words: its items, or for a cart visit "Cart visit · you'll choose from the cart" while
      open and what was bought once delivered. */
  function label(d) {
    if (!d) return '';
    if (!isVisit(d)) return itemsText(d.items);
    if (d.status === 'delivered') return 'Cart visit · ' + ((d.items || []).length ? itemsText(d.items) : 'nothing bought');
    if (d.status === 'cancelled') return 'Cart visit';
    return 'Cart visit · you’ll choose from the cart';
  }
  function log(doc, text) { return (doc.log || []).concat([{ at: new Date().toISOString(), text: text }]); }
  /** Write the fleet, then keep each order doc's cart in step with the line it sits in. */
  function commit(next) {
    S.setObj('cartFleet', next);
    next.carts.forEach(function (c) {
      c.line.forEach(function (o) {
        entryDocs(o.id).forEach(function (d) { if (d.cartId !== c.id || d.cartName !== (c.name || '')) S.update('cartOrders', d.id, { cartId: c.id, cartName: c.name || '' }); });
      });
    });
    return next;
  }

  /* ---------------- Golfers: who can order ---------------- */
  /** g = { type: 'member'|'public', id, name, firstName } */
  function golferKey(g) { return g.type + ':' + g.id; }
  function isDemo(g) { return g && (g.id === S.DEMO_MEMBER || g.id === DEMO_PUBLIC_ID); }
  function inTee(tt, g) { return (tt.players || []).some(function (p) { return g.type === 'member' ? p.memberId === g.id : p.publicPlayerId === g.id; }); }
  /** Today's round for this golfer: the one under way, else the next one, else the last. */
  function teeTimeToday(g) {
    const td = today(), now = nowMin();
    const list = S.all('teeTimes').filter(function (t) { return t.date === td && t.status !== 'cancelled' && t.status !== 'no-show' && inTee(t, g); })
      .sort(function (a, b) { return a.time.localeCompare(b.time); });
    if (!list.length) return null;
    const live = list.filter(function (t) { return t.status === 'on-course' || (t.status !== 'completed' && toMin(t.time) <= now); });
    return live[live.length - 1] || list.find(function (t) { return t.status !== 'completed'; }) || list[list.length - 1];
  }
  /** { ok, teeTime, reason, text }. Ordering (and Call the cart) opens at the tee time itself, or earlier once staff
      mark the group checked in or on the course, and closes when the round is complete. Demo accounts only need a
      tee time today (the demo works at any hour). */
  function eligibility(g) {
    const tt = g ? teeTimeToday(g) : null;
    if (!tt) return { ok: false, reason: 'no-tee', text: 'Ordering to the course opens on the day you play. You can order once you have a tee time today.' };
    if (!isDemo(g)) {
      if (tt.status === 'completed') return { ok: false, reason: 'done', teeTime: tt, text: 'Your round today is complete. We hope you enjoyed it.' };
      const started = tt.status === 'checked-in' || tt.status === 'on-course' || toMin(tt.time) <= nowMin();
      if (!started) return { ok: false, reason: 'early', teeTime: tt, text: 'Ordering opens at your ' + fmt.time(tt.time) + ' tee time.' };
    }
    return { ok: true, teeTime: tt };
  }
  function hmFromMin(m) { m = Math.max(0, m); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  /** Estimated hole from the tee time and MINUTES_PER_HOLE, or null when it isn't reasonable (not started, or done). */
  /** Which tee the group started on, from the booking: staff mark a 10th tee start on the tee sheet (teeTimes.startTee). */
  function startTeeOf(tt) { return tt && +tt.startTee === 10 ? 10 : 1; }
  /** When the group teed off ('HH:MM'): when staff marked them on the course, unless that is more than 30 minutes
      before the booked time or still ahead (the booking was moved after the start), else the booked time. */
  function teedOffAt(tt) {
    if (!tt) return null;
    const booked = toMin(tt.time), st = tt.startedAt ? toMin(tt.startedAt) : null;
    return st != null && st >= booked - 30 && st <= nowMin() ? tt.startedAt : tt.time;
  }
  function estimateHole(tt, startHole) {
    if (startHole == null) startHole = startTeeOf(tt);
    if (!tt) return null;
    const mins = nowMin() - toMin(teedOffAt(tt));
    if (mins < 0) return null;
    const n = Math.floor(mins / D.MINUTES_PER_HOLE) + 1;
    if (n > (+tt.holes || 18)) return null;
    return ((+startHole === 10 ? 9 : 0) + n - 1) % 18 + 1;
  }
  function groupSize(tt) { return tt ? (tt.players || []).length : 1; }
  function serviceOpen() { return D.serviceOpen(fleet()); }
  function banner() { return D.cartBanner(fleet(), Date.now()); }
  function openOrderFor(g) { const k = golferKey(g), td = today(); return orders().filter(function (o) { return o.golferKey === k && o.status === 'open' && o.date === td; }).sort(function (a, b) { return b.placedAt - a.placedAt; })[0] || null; }
  function latestOrderFor(g) { const k = golferKey(g), td = today(); return orders().filter(function (o) { return o.golferKey === k && o.date === td; }).sort(function (a, b) { return b.placedAt - a.placedAt; })[0] || null; }

  /* ---------------- Location (required to order) ---------------- */
  /** loc = { shared: true, at (ms), accuracy (m), lat, lon } from the golfer's phone. Demo accounts skip it. The
      reading must be fresh (under 2 minutes), accurate to GPS_MAX_M and on the club premises (Club.premises, the
      OpenStreetMap boundary plus PREMISES_BUFFER_M), otherwise "You need to be at the club to order from the cart."
      The hole there (holeFromGps) becomes the group's location. Returns { ok, error, node, demo }. */
  const PREMISES_BUFFER_M = 50;
  function atClub(lat, lon) { return Club.premises ? Club.premises.contains(lat, lon, PREMISES_BUFFER_M) : true; }
  function locCheck(g, loc) {
    if (isDemo(g)) return { ok: true, demo: true };
    if (!loc || !loc.shared || !isFinite(+loc.lat) || !isFinite(+loc.lon) || loc.lat == null) return { ok: false, needLoc: true, error: 'Please share your location so the cart can find your group.' };
    if (!(Date.now() - (+loc.at || 0) < GPS_MAX_AGE_MS)) return { ok: false, needLoc: true, error: 'Your location is out of date. Please try again.' };
    if (loc.accuracy != null && +loc.accuracy > GPS_MAX_M) return { ok: false, needLoc: true, error: 'Your location is not precise enough yet. Please try again in a moment.' };
    if (!atClub(+loc.lat, +loc.lon)) return { ok: false, offCourse: true, error: 'You need to be at the club to order from the cart.' };
    return { ok: true, node: holeFromGps(+loc.lat, +loc.lon, lastHoleFor(g)) };
  }
  /** Where the golfer's group should be now: its open order (anyone in the group) moved on by time (predictedHole), else
      the tee-time estimate. */
  function lastHoleFor(g) {
    const tt = teeTimeToday(g), td = today();
    const o = tt && orders().filter(function (x) { return x.status === 'open' && x.date === td && x.teeTimeId === tt.id; }).sort(function (a, b) { return (b.holeAt || 0) - (a.holeAt || 0); })[0];
    return o ? predictedHole(o.id) || +o.hole : estimateHole(tt);
  }
  /** What the order keeps about the location: raw coordinates only while the order is open (closeGps drops them). */
  function locFields(g, loc) {
    if (isDemo(g)) return { locShared: false, locSkipped: 'demo' };
    return { locShared: true, gps: loc && loc.at ? { at: +loc.at, accuracy: loc.accuracy != null ? Math.round(+loc.accuracy) : null, lat: loc.lat != null ? +loc.lat : null, lon: loc.lon != null ? +loc.lon : null } : null };
  }
  function closeGps(d) { return d && d.gps ? { gps: { at: d.gps.at, accuracy: d.gps.accuracy } } : {}; }
  /** A GPS fix at a tee moves the group there (the newest location wins). */
  /** After an order or call: the phone's hole becomes the group's location, unless the golfer picked the hole by hand
      (picked), which then holds against GPS (holdEntry). */
  function feedGps(id, lc, picked) {
    if (!lc || !lc.node || lc.node === 'CH') return;
    const d = order(id); if (!d || +d.hole === +lc.node || heldAgainst(d, lc.node)) return;
    if (picked) holdEntry(entryOf(d), lc.node); else moveGolfer(id, +lc.node);
  }
  /** The hole the phone puts the golfer on (holeFromGps), or null: demo, not at the club, stale or vague, or not on a hole. */
  function holeFromLoc(g, loc) { const lc = locCheck(g, loc); return lc.ok && lc.node && lc.node !== 'CH' ? +lc.node : null; }

  /* ---------------- Golfer actions ---------------- */
  /** Place (or merge) an order. o = { golfer, items: [{ itemId, qty }], hole, note, payment: 'account'|'cart' }. The starting tee
      comes from today's booking (startTeeOf), not from the golfer.
      Returns { ok, error, doc, merged }. */
  function placeOrder(o) {
    const g = o.golfer, now = Date.now();
    const el = eligibility(g);
    if (!el.ok) return { ok: false, error: el.text };
    const lc = locCheck(g, o.loc);
    if (!lc.ok) return { ok: false, error: lc.error, needLoc: lc.needLoc, offCourse: lc.offCourse };
    const f = fleet();
    if (!D.serviceOpen(f)) return { ok: false, error: 'Cart service is closed right now. Please try again later.' };
    const byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
    const items = [];
    for (const l of (o.items || [])) {
      const m = byId[l.itemId];
      if (!m) return { ok: false, error: 'An item in your order is no longer on the menu. Please check your order.' };
      if (m.soldOut) return { ok: false, error: m.name + ' has just sold out. Please remove it and try again.' };
      const q = Math.floor(+l.qty);
      if (!(q > 0)) continue;
      const same = items.find(function (x) { return x.itemId === m.id; });
      if (same) same.qty += q; else items.push({ itemId: m.id, name: m.name, size: m.size || '', qty: q, price: r2(m.price), alcohol: !!m.alcohol });
    }
    if (!items.length) return { ok: false, error: 'Add at least one item to your order.' };
    const existing = openOrderFor(g);
    const qtyOf = function (list, id) { return (list || []).reduce(function (a, x) { return a + (x.itemId === id ? +x.qty || 0 : 0); }, 0); };
    const over = items.find(function (it) { return it.qty + (existing ? qtyOf(existing.items, it.itemId) : 0) > MAX_QTY; });
    if (over) return { ok: false, error: 'You can order up to ' + MAX_QTY + ' of each item' + (existing && qtyOf(existing.items, over.itemId) ? ', including your open order.' : '.') };
    const ownInLine = existing && D.placeInLine(f, entryOf(existing));
    const hole = ownInLine ? existing.hole : +o.hole;
    if (!D.isValidHole(hole)) return { ok: false, error: 'Choose the hole you are on.' };
    const tt = el.teeTime;
    const payment = g.type === 'member' && o.payment === 'account' ? 'account' : 'cart';
    if (payment === 'account') {
      const m = Club.members.get(g.id);
      if (!m || m.status === 'suspended' || m.status === 'resigned') return { ok: false, error: 'This account cannot take charges right now. Please choose Pay at the cart.' };
      /* Credit policy (Club.billing.chargeCheck): no charging 60 days after a statement date, unless staff allowed it today. */
      if (Club.billing && Club.billing.chargeCheck && !Club.billing.chargeCheck(m.id).ok) return { ok: false, error: 'Charging to your account is suspended because of an unpaid balance. Please choose Pay at the cart, or call the club office at ' + Club.info.phone + '.' };
    }
    const id = S.uid('co');
    const dispatchOrder = { id: id, hole: hole, placedAt: now, startHole: startTeeOf(tt), phone: 'group:' + tt.id };  /* `phone` is the dispatch merge key: one entry per tee-time group */
    const note = String(o.note || '').trim().slice(0, 200);
    let res;
    /* The golfer's own open order takes the new items (no new dispatch entry); otherwise addOrder merges into the group's entry if there is one. */
    if (ownInLine) res = { fleet: f, orderId: entryOf(existing), cartId: D.placeInLine(f, entryOf(existing)).cartId, merged: true, own: true };
    else { try { res = D.addOrder(f, dispatchOrder, now); } catch (e) { return { ok: false, error: 'We could not place your order. Please try again.' }; } }
    if (res.merged && !res.own) { const jr = joinGroup(res, { id: id, g: g, tt: tt, hole: hole, now: now, items: items, payment: payment, note: note, kind: 'order', loc: o.loc }); if (jr.ok) feedGps(jr.doc.id, lc, o.holePicked); return jr; }
    if (res.merged) {
      const d = existing;
      if (!d || d.status !== 'open') return { ok: false, error: 'We could not find your open order. Please refresh and try again.' };
      const merged = (d.items || []).map(function (x) { return Object.assign({}, x); });
      /* Same item at the same price adds to that line; after a staff price change the new units get their own line at today's price. */
      items.forEach(function (it) { const same = merged.find(function (x) { return x.itemId === it.itemId && r2(x.price) === it.price; }); if (same) same.qty += it.qty; else merged.push(it); });
      const wasVisit = isVisit(d);
      const doc = S.update('cartOrders', d.id, Object.assign({ items: merged, total: totalOf(merged), note: [d.note, note].filter(Boolean).join(' · ').slice(0, 300), merges: (d.merges || 0) + 1,
        log: log(d, (wasVisit ? 'Cart visit turned into an order: ' : 'Added ') + itemsText(items)) }, wasVisit ? { kind: 'order', fromVisit: true } : {}, locFields(g, o.loc)));
      feedGps(d.id, lc);
      return { ok: true, doc: order(d.id), merged: true, fromVisit: wasVisit };
    }
    commit(res.fleet);
    const cart = cartOf(res.fleet, res.cartId);
    const doc = S.insert('cartOrders', {
      id: id, date: today(), placedAt: now, golferType: g.type, golferKey: golferKey(g),
      memberId: g.type === 'member' ? g.id : null, publicPlayerId: g.type === 'public' ? g.id : null,
      name: g.name, firstName: g.firstName || String(g.name).split(' ')[0], groupSize: groupSize(tt), teeTimeId: tt.id, teeTime: tt.time,
      hole: hole, startHole: dispatchOrder.startHole, holeAt: now, items: items, total: totalOf(items), payment: payment, note: note,
      status: 'open', cartId: res.cartId, cartName: (cart && cart.name) || '', golferText: null, headingAt: null, merges: 0,
      log: [{ at: new Date(now).toISOString(), text: 'Ordered from ' + nodeLabel(String(hole)).toLowerCase() }],
      locShared: locFields(g, o.loc).locShared, gps: locFields(g, o.loc).gps || null, locSkipped: locFields(g, o.loc).locSkipped || null
    });
    feedGps(id, lc, o.holePicked);
    return { ok: true, doc: order(id), merged: false };
  }
  /** A golfer joins their group's stop: their own doc on the group's dispatch entry. The newest order's hole (and time)
      becomes the group's location (updateGolferHole on the entry). */
  function joinGroup(res, x) {
    const eid = res.orderId, now = x.now;
    commit(D.updateGolferHole(res.fleet, eid, x.hole, now));
    setEntryHole(eid, x.hole, now, x.g.firstName + ' ordered from hole ' + x.hole);
    const cart = cartOf(fleet(), res.cartId);
    const others = entryDocs(eid);
    const doc = S.insert('cartOrders', newDoc(x, { groupId: eid, cartId: res.cartId, cartName: (cart && cart.name) || '' }));
    others.forEach(function (d) { S.update('cartOrders', d.id, { log: log(d, (x.g.firstName || x.g.name) + ' joined the group stop') }); });
    return { ok: true, doc: doc, merged: false, grouped: true };
  }
  function newDoc(x, extra) {
    const g = x.g, tt = x.tt;
    return Object.assign({
      id: x.id, kind: x.kind, date: today(), placedAt: x.now, golferType: g.type, golferKey: golferKey(g),
      memberId: g.type === 'member' ? g.id : null, publicPlayerId: g.type === 'public' ? g.id : null,
      name: g.name, firstName: g.firstName || String(g.name).split(' ')[0], groupSize: groupSize(tt), teeTimeId: tt.id, teeTime: tt.time,
      hole: x.hole, startHole: startTeeOf(tt), holeAt: x.now, items: x.items, total: totalOf(x.items), payment: x.payment, note: x.note,
      status: 'open', golferText: null, headingAt: null, merges: 0,
      log: [{ at: new Date(x.now).toISOString(), text: (x.kind === 'visit' ? 'Called the cart to ' : 'Ordered from ') + nodeLabel(String(x.hole)).toLowerCase() }]
    }, locFields(g, x.loc), extra);
  }
  /** Call the cart: the cart comes to the golfer's hole and they choose from what is on board. o = { golfer, hole, note,
      payment }. Same eligibility, hole and dispatch entry (D.addOrder, same merge key) as an order, with no items.
      Returns { ok, error, doc }. */
  function callCart(o) {
    const g = o.golfer, now = Date.now();
    const el = eligibility(g);
    if (!el.ok) return { ok: false, error: el.text };
    const lc = locCheck(g, o.loc);
    if (!lc.ok) return { ok: false, error: lc.error, needLoc: lc.needLoc, offCourse: lc.offCourse };
    const f = fleet();
    if (!D.serviceOpen(f)) return { ok: false, error: 'Cart service is closed right now. Please try again later.' };
    if (openOrderFor(g)) return { ok: false, error: 'You already have an order open, so the cart is coming to you anyway.' };
    const hole = +o.hole;
    if (!D.isValidHole(hole)) return { ok: false, error: 'Choose the hole you are on.' };
    const tt = el.teeTime;
    const payment = g.type === 'member' && o.payment === 'account' ? 'account' : 'cart';
    if (payment === 'account') {
      const m = Club.members.get(g.id);
      if (!m || m.status === 'suspended' || m.status === 'resigned') return { ok: false, error: 'This account cannot take charges right now. Please choose Pay at the cart.' };
      /* Credit policy (Club.billing.chargeCheck): no charging 60 days after a statement date, unless staff allowed it today. */
      if (Club.billing && Club.billing.chargeCheck && !Club.billing.chargeCheck(m.id).ok) return { ok: false, error: 'Charging to your account is suspended because of an unpaid balance. Please choose Pay at the cart, or call the club office at ' + Club.info.phone + '.' };
    }
    const id = S.uid('co');
    const dispatchOrder = { id: id, hole: hole, placedAt: now, startHole: startTeeOf(tt), phone: 'group:' + tt.id };
    let res;
    try { res = D.addOrder(f, dispatchOrder, now); } catch (e) { return { ok: false, error: 'We could not call the cart. Please try again.' }; }
    if (res.merged) { const jr = joinGroup(res, { id: id, g: g, tt: tt, hole: hole, now: now, items: [], payment: payment, note: String(o.note || '').trim().slice(0, 200), kind: 'visit', loc: o.loc }); if (jr.ok) feedGps(jr.doc.id, lc, o.holePicked); return jr; }
    commit(res.fleet);
    const cart = cartOf(res.fleet, res.cartId);
    const doc = S.insert('cartOrders', {
      id: id, kind: 'visit', date: today(), placedAt: now, golferType: g.type, golferKey: golferKey(g),
      memberId: g.type === 'member' ? g.id : null, publicPlayerId: g.type === 'public' ? g.id : null,
      name: g.name, firstName: g.firstName || String(g.name).split(' ')[0], groupSize: groupSize(tt), teeTimeId: tt.id, teeTime: tt.time,
      hole: hole, startHole: dispatchOrder.startHole, holeAt: now, items: [], total: 0, payment: payment, note: String(o.note || '').trim().slice(0, 200),
      status: 'open', cartId: res.cartId, cartName: (cart && cart.name) || '', golferText: null, headingAt: null, merges: 0,
      log: [{ at: new Date(now).toISOString(), text: 'Called the cart to ' + nodeLabel(String(hole)).toLowerCase() }],
      locShared: locFields(g, o.loc).locShared, gps: locFields(g, o.loc).gps || null, locSkipped: locFields(g, o.loc).locSkipped || null
    });
    feedGps(id, lc, o.holePicked);
    return { ok: true, doc: order(id) };
  }
  /** What the golfer sees: { state: 'waiting'|'heading'|'delivered'|'cancelled', message, text, place, cartName, canCancel } */
  function golferStatus(id) {
    const d = order(id); if (!d) return null;
    if (d.status === 'delivered') return { state: 'delivered', message: (isVisit(d) ? 'The cart came by' : 'Delivered') + (d.deliveredBy ? (isVisit(d) ? ' with ' : ' by ') + d.deliveredBy : '') + ' at ' + fmt.time(hm(Date.parse(d.deliveredAt))) + '. Enjoy the rest of your round.', doc: d };
    if (d.status === 'cancelled') return { state: 'cancelled', message: d.cancelNote || (isVisit(d) ? 'This cart visit was cancelled.' : 'This order was cancelled.'), doc: d };
    const f = fleet(), now = Date.now(), eid = entryOf(d);
    const msg = D.golferMessage(f, eid, now);
    const pl = D.placeInLine(f, eid);
    const c = pl ? cartOf(f, pl.cartId) : null;
    const h = headingTo(c);
    const heading = !!(h && h.orderId === eid);
    const group = entryDocs(eid).filter(function (x) { return x.id !== id; });
    return { state: heading ? 'heading' : 'waiting', message: msg || (isVisit(d) ? 'We are finding a cart to come to you.' : 'We are finding a cart for your order.'), text: heading ? d.golferText : null,
      place: pl ? pl.place : null, cartName: c ? c.name : '', canCancel: !heading, doc: d, entryId: eid, group: group };
  }
  /** gpsNode: the phone's hole when the golfer moves by hand ("I've moved"); if it differs, the choice holds against GPS. */
  function moveGolfer(id, hole, gpsNode) {
    hole = +hole;
    if (!D.isValidHole(hole)) return { ok: false, error: 'Choose a hole from 1 to 18.' };
    const d = order(id); if (!d || d.status !== 'open') return { ok: false, error: 'This order is no longer open.' };
    const now = Date.now(), eid = entryOf(d);
    commit(D.updateGolferHole(fleet(), eid, hole, now));
    setEntryHole(eid, hole, now, (d.firstName || 'The golfer') + ' moved the group to hole ' + hole);
    if (D.isValidHole(+gpsNode) && +gpsNode !== hole) holdEntry(eid, gpsNode);
    return { ok: true, moved: entryDocs(eid).length };
  }
  /** "Still on hole N?" Yes: the group is where the dispatch predicts (whereIs); refresh holeAt to now there. */
  function predictedHole(id) {
    const d = order(id); if (!d || d.status !== 'open') return null;
    const f = fleet(), eid = entryOf(d), pl = D.placeInLine(f, eid); if (!pl) return null;
    const e = cartOf(f, pl.cartId).line.find(function (o) { return o.id === eid; });
    const node = D.whereIs(e, Date.now());
    return node === 'CH' ? null : +node;
  }
  function confirmHole(id) {
    const h = predictedHole(id);
    if (!h) return { ok: false, error: 'We could not work out your hole. Please choose it.' };
    const d = order(id), now = Date.now(), eid = entryOf(d);
    commit(D.updateGolferHole(fleet(), eid, h, now));
    setEntryHole(eid, h, now, (d.firstName || 'The golfer') + ' confirmed hole ' + h);
    return { ok: true, hole: h };
  }
  const CHECK_MIN = 10, CHECK_KEY = 'stboniface.cart.holecheck.';
  /** When to ask "Still on hole N?": an open order the cart isn't heading to yet, whose location is 10+ minutes old,
      at most once every 10 minutes per golfer (per device). Returns { orderId, hole } or null. */
  function holeCheck(g) {
    const d = openOrderFor(g); if (!d) return null;
    const st = golferStatus(d.id); if (!st || st.state !== 'waiting') return null;
    const now = Date.now();
    if (now - (d.holeAt || d.placedAt) < CHECK_MIN * 60000) return null;
    let last = 0; try { last = +localStorage.getItem(CHECK_KEY + golferKey(g)) || 0; } catch (e) { /* storage blocked */ }
    if (now - last < CHECK_MIN * 60000) return null;
    const h = predictedHole(d.id); return h ? { orderId: d.id, hole: h } : null;
  }
  function markHoleCheck(g) { try { localStorage.setItem(CHECK_KEY + golferKey(g), String(Date.now())); } catch (e) { /* storage blocked */ } }
  /* GPS: while an order is open the golfer's phone keeps sharing (js/portal/cart.js watches the position). A reading
     is used only if fresh, accurate and on the club premises; Club.holes (OpenStreetMap hole lines) maps it to a hole. */
  const GPS_MAX_M = 150, GPS_MAX_AGE_MS = 2 * 60000;
  function gpsReady() { return !!Club.holes || Object.keys(D.TEE_GPS || {}).length > 0; }
  /** The hole at a GPS point: the nearest hole line, preferring the group's last hole or the next one when holes are
      about as close (Club.holes); the nearest tee (TEE_GPS) if holes.js isn't loaded. Null when it isn't on a hole. */
  function holeFromGps(lat, lon, lastHole) {
    if (Club.holes) return Club.holes.locate(lat, lon, lastHole);
    const n = gpsReady() ? D.nearestNodeFromGps(lat, lon) : null;
    return n && n !== 'CH' ? +n : null;
  }
  function gpsUpdate(id, lat, lon, takenAt, accuracy) {
    if (!gpsReady()) return { ok: false, reason: 'off' };
    if (!(Date.now() - (+takenAt || 0) < GPS_MAX_AGE_MS)) return { ok: false, reason: 'stale' };
    if (accuracy != null && +accuracy > GPS_MAX_M) return { ok: false, reason: 'vague' };
    if (!atClub(lat, lon)) return { ok: false, reason: 'far' };
    const d = order(id); if (!d || d.status !== 'open') return { ok: false, reason: 'closed' };
    const node = holeFromGps(lat, lon, predictedHole(id) || d.hole);
    if (!node) return { ok: false, reason: 'off-hole' };
    if (heldAgainst(d, node)) return { ok: true, same: true, held: true, hole: +d.hole, node: +node };
    if (+d.hole === +node) {
      /* Same hole: refresh the time now and then, so the dispatch predicts from a fresh fix (not on every reading). */
      if (Date.now() - (d.holeAt || 0) > 2 * 60000) { const eid = entryOf(d), now = Date.now(); commit(D.updateGolferHole(fleet(), eid, +node, now)); setEntryHole(eid, +node, now, (d.firstName || 'The golfer') + '’s phone confirmed hole ' + node); }
      return { ok: true, same: true, hole: +node, node: +node };
    }
    return Object.assign(moveGolfer(id, +node), { hole: +node, node: +node });
  }
  function cancelByGolfer(id) {
    const st = golferStatus(id);
    if (!st || (st.state !== 'waiting')) return { ok: false, error: st && st.state === 'heading' ? 'The cart is already on its way to you, so this order can no longer be cancelled.' : 'This order is no longer open.' };
    leaveEntry(st.doc);
    S.update('cartOrders', id, Object.assign(closeGps(st.doc), { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'golfer', cancelNote: isVisit(st.doc) ? 'You cancelled this cart visit. Nothing has been charged.' : 'You cancelled this order. Nothing has been charged.', log: log(st.doc, 'Cancelled by the golfer') }));
    return { ok: true };
  }

  /** One order leaves its entry: the entry leaves the line only when no other open order rides on it. */
  function leaveEntry(d) {
    const eid = entryOf(d);
    if (!entryDocs(eid).some(function (x) { return x.id !== d.id; })) commit(D.cancelOrder(fleet(), eid));
  }
  /** The golfer changes an open order before the cart heads to them. lines = [{ itemId, price, qty }] for the lines already
      on the order (qty 0 removes a line; prices stay as ordered), plus an optional note. Removing every line cancels the order.
      Returns { ok, error, doc, cancelled }. */
  function editByGolfer(id, lines, note) {
    const st = golferStatus(id);
    if (!st || st.state !== 'waiting') return { ok: false, error: st && st.state === 'heading' ? 'The cart is already on its way to you, so this order can no longer be changed.' : 'This order is no longer open.' };
    const d = st.doc, byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
    if (isVisit(d)) {   /* a cart visit has no items: only its note can change */
      const vn = note == null ? d.note : String(note).trim().slice(0, 200);
      if (vn === (d.note || '')) return { ok: true, doc: d, unchanged: true };
      return { ok: true, doc: S.update('cartOrders', id, { note: vn, edits: (d.edits || 0) + 1, log: log(d, 'Note changed by the golfer') }) };
    }
    const next = [];
    for (const old of (d.items || [])) {
      const l = (lines || []).find(function (x) { return x.itemId === old.itemId && r2(x.price) === r2(old.price); });
      const q = l ? Math.floor(+l.qty) : old.qty;
      if (!(q > 0)) continue;
      if (q > old.qty && byId[old.itemId] && byId[old.itemId].soldOut) return { ok: false, error: old.name + ' has sold out, so you can keep or reduce it but not add more.' };
      next.push(Object.assign({}, old, { qty: q }));
    }
    const over = next.find(function (it) { return next.filter(function (x) { return x.itemId === it.itemId; }).reduce(function (a, x) { return a + x.qty; }, 0) > MAX_QTY; });
    if (over) return { ok: false, error: 'You can order up to ' + MAX_QTY + ' of each item.' };
    const newNote = note == null ? d.note : String(note).trim().slice(0, 300);
    if (!next.length) {
      const c = cancelByGolfer(id); return c.ok ? { ok: true, cancelled: true } : c;
    }
    const removed = (d.items || []).filter(function (old) { return !next.some(function (x) { return x.itemId === old.itemId && x.price === old.price; }); });
    const changes = [];
    next.forEach(function (x) { const o = (d.items || []).find(function (y) { return y.itemId === x.itemId && y.price === x.price; }); if (o && o.qty !== x.qty) changes.push(x.name + ' ' + o.qty + ' to ' + x.qty); });
    removed.forEach(function (x) { changes.push('removed ' + x.name); });
    if (newNote !== d.note) changes.push('note changed');
    if (!changes.length) return { ok: true, doc: d, unchanged: true };
    const doc = S.update('cartOrders', id, { items: next, total: totalOf(next), note: newNote, edits: (d.edits || 0) + 1, log: log(d, 'Changed by the golfer: ' + changes.join(', ')) });
    return { ok: true, doc: doc };
  }

  /* ---------------- Cart staff actions ---------------- */
  const OFF_SHIFT = { ok: false, error: 'This cart is no longer on shift. It may have been ended on another phone.' };
  function startShift(cartId, name, staffId) {
    cartId = String(cartId || '');
    if (CART_IDS.indexOf(cartId) < 0) return { ok: false, error: 'Choose cart ' + CART_IDS.join(', ').replace(/, (?=[^,]*$)/, ' or ') + '.' };
    const f = fleet();
    if (cartOf(f, cartId)) return { ok: false, error: 'Cart ' + cartId + ' is already on shift.' };
    name = String(name || '').trim().slice(0, 24);
    const next = D.startShift(f, cartId, name || undefined, Date.now());
    next.carts = next.carts.map(function (c) { return c.id === cartId ? Object.assign({}, c, { staffId: staffId || null, shiftStart: Date.now() }) : c; });
    commit(next);
    return { ok: true };
  }
  function go(cartId) {
    if (!cartOf(fleet(), cartId)) return OFF_SHIFT;
    const r = D.startDriving(fleet(), cartId, Date.now());
    if (!r) return { ok: false, error: 'There are no orders in your line.' };
    commit(r.fleet);
    entryDocs(r.order.id).forEach(function (d) { S.update('cartOrders', d.id, { golferText: r.golferText, headingAt: Date.now(), target: r.target, log: log(d, 'Cart heading to ' + nodeLabel(r.target).toLowerCase()) }); });
    return { ok: true, target: r.target, golferText: r.golferText };
  }
  /* ---------------- Receipts (Club.receipts, js/core/receipts.js; source 'cart', refId the cartOrders id) ---------------- */
  function receiptLines(items) { return (items || []).map(function (it) { return { name: it.name, qty: it.qty, price: it.price, size: it.size || '' }; }); }
  /** Paid at the cart by card or cash: a receipt for the member, the public golfer or a walk-up golfer known only by name
      (account orders get theirs from chargeMember). The attendant does not record the card, so the method reads 'Card'.
      Money taken at the cart: channel 'counter', one tender (read by the daily close, js/modules/accounting.js). */
  function paidReceipt(d, items, paidWith) {
    if (!Club.receipts) return null;
    const total = r2((items || []).reduce(function (a, it) { return a + (+it.qty || 0) * (+it.price || 0); }, 0));
    if (!(total > 0)) return null;
    const method = paidWith === 'cash' ? 'cash' : 'card';
    try {
      return Club.receipts.create({ memberId: d.memberId || null, publicPlayerId: d.memberId ? null : (d.publicPlayerId || null), name: d.memberId || d.publicPlayerId ? (d.name || undefined) : (d.name || 'Golfer'),
        title: 'Beverage cart', lines: receiptLines(items), method: method, methodLabel: method === 'cash' ? 'Cash' : 'Card', source: 'cart', refId: d.id, date: d.date,
        tenders: [{ method: method, amount: total }], channel: 'counter' });
    } catch (e) { console.error('Receipt failed for cart order ' + d.id, e); return null; }
  }
  /** The receipt chargeMember made for an account order: mark it as an account tender taken at the cart. */
  function tagAccountReceipt(ch) {
    if (!ch || !Club.receipts) return;
    const rc = S.all('receipts').find(function (r) { return r.chargeId === ch.id; });
    if (rc && !rc.tenders) S.update('receipts', rc.id, { tenders: [{ method: 'account', amount: Math.abs(r2(ch.amount)) }], channel: 'counter' });
  }

  /** opts = { foundHole: number|null, paidWith: 'card'|'cash'|'account'|null, items: [{ itemId, qty }] (cart visits: what they bought) } */
  function delivered(cartId, id, opts) {
    opts = opts || {};
    const d = order(id); if (!d || d.status !== 'open') return { ok: false, error: 'This order is no longer open.' };
    const f = fleet(), c = cartOf(f, cartId); if (!c) return OFF_SHIFT;
    /* Only the cart whose line holds the order can deliver it (a stale screen could otherwise leave it in another line). */
    const eid = entryOf(d), pl = D.placeInLine(f, eid);
    if (pl && pl.cartId !== c.id) return { ok: false, error: 'This order has moved to cart ' + pl.cartId + '.' };
    const h = headingTo(c);
    /* A group stop leaves the line with its last order; until then the others stay (and the cart stays locked on them). */
    const lastOfStop = !entryDocs(eid).some(function (x) { return x.id !== id; });
    const found = opts.foundHole ? (opts.foundHole === 'CH' ? 'CH' : D.isValidHole(+opts.foundHole) ? D.holeNode(+opts.foundHole) : undefined) : undefined;
    const expected = h && h.orderId === eid ? h.node : D.whereIs(c.line.find(function (o) { return o.id === eid; }) || { hole: d.hole, placedAt: d.placedAt, holeAt: d.holeAt, startHole: d.startHole }, Date.now());
    let visitItems = null;
    if (isVisit(d)) {
      const byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
      visitItems = [];
      for (const l of (opts.items || [])) {
        const m = byId[l.itemId], q = Math.min(MAX_QTY, Math.floor(+l.qty));
        if (!m || !(q > 0)) continue;
        const same = visitItems.find(function (x) { return x.itemId === m.id; });
        if (same) same.qty = Math.min(MAX_QTY, same.qty + q); else visitItems.push({ itemId: m.id, name: m.name, size: m.size || '', qty: q, price: r2(m.price), alcohol: !!m.alcohol });
      }
      if (opts.paidWith === 'account' && !(d.payment === 'account' && d.memberId)) return { ok: false, error: 'Only a member who chose their account can be charged to it. Take card or cash.' };
    }
    if (pl && lastOfStop) commit(D.markDelivered(f, cartId, eid, found));
    if (visitItems) {
      const vt = totalOf(visitItems), toAcct = vt > 0 && opts.paidWith === 'account';
      const vpatch = { status: 'delivered', deliveredAt: new Date().toISOString(), deliveredBy: c.name || 'Cart ' + c.id, cartId: c.id, cartName: c.name || '', foundAt: found || expected,
        items: visitItems, total: vt, boughtNothing: !visitItems.length, paidWith: vt > 0 && !toAcct ? (opts.paidWith === 'cash' ? 'cash' : 'card') : null };
      if (toAcct) {
        const ch = Club.chargeMember(d.memberId, { description: 'Beverage cart · ' + itemsText(visitItems), category: 'Dining', amount: vt, source: 'cart', refId: d.id, date: d.date, title: 'Beverage cart', lines: receiptLines(visitItems) });
        vpatch.chargeId = ch ? ch.id : null; tagAccountReceipt(ch);
      } else if (vt > 0) paidReceipt(d, visitItems, vpatch.paidWith);
      vpatch.log = log(d, 'Cart visit at ' + nodeLabel(vpatch.foundAt).toLowerCase() + ': ' + (visitItems.length ? itemsText(visitItems) + ', ' + (vpatch.chargeId ? 'charged to account' : 'paid by ' + vpatch.paidWith) : 'nothing bought'));
      S.update('cartOrders', id, Object.assign(closeGps(d), vpatch));
      return { ok: true, doc: order(id) };
    }
    const patch = { status: 'delivered', deliveredAt: new Date().toISOString(), deliveredBy: c.name || 'Cart ' + c.id, cartId: c.id, cartName: c.name || '', foundAt: found || expected,
      paidWith: d.payment === 'cart' ? (opts.paidWith === 'cash' ? 'cash' : 'card') : null };
    if (d.payment === 'account' && d.memberId) {
      const ch = Club.chargeMember(d.memberId, { description: 'Beverage cart · ' + itemsText(d.items), category: 'Dining', amount: d.total, source: 'cart', refId: d.id, date: d.date, title: 'Beverage cart', lines: receiptLines(d.items) });
      patch.chargeId = ch ? ch.id : null; tagAccountReceipt(ch);
    } else if (patch.paidWith && +d.total > 0) paidReceipt(d, d.items, patch.paidWith);
    patch.log = log(d, 'Delivered at ' + nodeLabel(patch.foundAt).toLowerCase() + (patch.paidWith ? ', paid by ' + patch.paidWith : patch.chargeId ? ', charged to account' : ''));
    S.update('cartOrders', id, Object.assign(closeGps(d), patch));
    return { ok: true, doc: order(id) };
  }
  function restock(cartId, min) {
    if (!cartOf(fleet(), cartId)) return OFF_SHIFT;
    min = Math.max(0, Math.min(120, Math.round(+min) || 0));
    commit(D.startRestock(fleet(), cartId, Date.now(), min || undefined)); return { ok: true };
  }
  function backOnCourse(cartId) {
    if (!cartOf(fleet(), cartId)) return OFF_SHIFT;
    commit(D.finishRestock(fleet(), cartId, Date.now())); return { ok: true };
  }
  function endShift(cartId) {
    if (!cartOf(fleet(), cartId)) return OFF_SHIFT;
    const r = D.endShift(fleet(), cartId, Date.now());
    commit(r.fleet);
    r.orphaned.forEach(function (o) {
      entryDocs(o.id).forEach(function (d) { S.update('cartOrders', d.id, Object.assign(closeGps(d), { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'shift', cancelNote: 'Sorry, cart service has closed for now, so your order was cancelled. Nothing has been charged.', log: log(d, 'Cancelled: the last cart ended its shift') })); });
    });
    return { ok: true, orphaned: r.orphaned.length };
  }
  function cancelByStaff(id) {
    const d = order(id); if (!d || d.status !== 'open') return { ok: false, error: 'This order is no longer open' + (d && d.status ? ': it was ' + d.status + '.' : '.') };
    leaveEntry(d);
    S.update('cartOrders', id, Object.assign(closeGps(d), { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'staff', cancelNote: 'The club cancelled this ' + (isVisit(d) ? 'cart visit' : 'order') + '. Nothing has been charged. Please ask the golf shop if you have questions.', log: log(d, 'Cancelled by staff') }));
    return { ok: true };
  }

  /* ---------------- Daily housekeeping and demo data ---------------- */
  /* Once a day: close out orders left open from earlier days, clear the fleet, then set up the demo so it works
     at any hour: Dave Nerada (mem_1003) and the public test account get a tee time today, one cart is on shift
     with an attendant from the staff list, and two other members are already in line. */
  function slotFree(date, time) { return !S.all('teeTimes').some(function (t) { return t.date === date && t.time === time && t.status !== 'cancelled'; }); }
  function demoSlot(date, offsetMin) {
    const st = Object.assign({ interval: 9, first: '06:30', last: '19:00' }, S.getObj('teeSheetSettings', {}) || {});
    const step = Math.max(5, +st.interval || 9), first = toMin(st.first), last = toMin(st.last);
    let target = Math.min(last, Math.max(first, nowMin() - offsetMin));
    target = first + Math.floor((target - first) / step) * step;
    for (let k = 0; k < 40; k++) {
      for (const t of [target - k * step, target + k * step]) { if (t >= first && t <= last && slotFree(date, hmFromMin(t))) return hmFromMin(t); }
    }
    return hmFromMin(target);
  }
  function ensureDemoTee(g, offsetMin, player) {
    if (teeTimeToday(g)) return;
    const td = today(), t = demoSlot(td, offsetMin), started = toMin(t) <= nowMin();
    S.insert('teeTimes', { date: td, time: t, holes: 18, players: [player], status: started ? 'on-course' : 'booked', notes: '', eventId: null, startedAt: started ? t : null, finishedAt: null,
      bookedBy: g.id, source: g.type === 'public' ? 'public' : 'staff' });
  }
  function ensureDemoPublic() {
    if (S.find('publicPlayers', DEMO_PUBLIC_ID)) return;
    if (S.all('publicPlayers').some(function (p) { return String(p.email || '').toLowerCase() === DEMO_PUBLIC_EMAIL; })) return;
    S.insert('publicPlayers', { id: DEMO_PUBLIC_ID, firstName: 'Alex', lastName: 'Morgan', email: DEMO_PUBLIC_EMAIL, phone: '204-555-0142', postalCode: 'R2H 0A1',
      createdAt: new Date().toISOString(), password: 'c53$stbdemo1$8312babccdfd7aa1', cards: [], marketingOptIn: false });
  }
  function dailyHousekeeping() {
    const td = today();
    if (S.getObj('cartDay', null) === td) return;
    orders().filter(function (o) { return o.status === 'open' && o.date !== td; }).forEach(function (o) {
      S.update('cartOrders', o.id, Object.assign(closeGps(o), { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'day-end', cancelNote: 'Cart service closed for the day before this order was delivered. Nothing has been charged.' }));
    });
    const dave = Club.members.get(S.DEMO_MEMBER);
    if (dave) ensureDemoTee({ type: 'member', id: dave.id }, 50, { memberId: dave.id, name: dave.firstName + ' ' + dave.lastName, type: 'member', cart: true, paid: true });
    ensureDemoPublic();
    const pub = S.find('publicPlayers', DEMO_PUBLIC_ID);
    /* Not paid: no online payment is recorded for this demo tee time, so the green fee is taken at the golf shop. */
    if (pub) ensureDemoTee({ type: 'public', id: pub.id }, 30, { memberId: null, name: pub.firstName + ' ' + pub.lastName, type: 'public', publicPlayerId: pub.id, cart: true, paid: false });

    /* One cart on shift (Amara Osei, a server, from the staff list) with two members already in line */
    const staffer = Club.staff.get('stf_15');
    const name = staffer ? staffer.firstName : 'Amara';
    const now = Date.now();
    let f = D.startShift(D.emptyFleet(), '1', name, now - 40 * 60000);
    f.carts = f.carts.map(function (c) { return Object.assign({}, c, { staffId: staffer ? staffer.id : null, shiftStart: now - 40 * 60000 }); });
    const pool = S.all('members').filter(function (m) { return m.id !== S.DEMO_MEMBER && m.status === 'active'; });
    const people = [pool[9], pool[20], pool[33], pool[41], pool[27]];
    const seedOrders = [
      { who: people[0], hole: 15, ago: 9, items: [['cm_beer', 2], ['cm_chips', 1]], payment: 'account', delivered: false },
      { who: people[1], hole: 12, ago: 4, items: [['cm_water', 2], ['cm_hotdog', 1]], payment: 'cart', delivered: false, note: 'Mustard only, please' },
      { who: people[4], hole: 13, ago: 2, items: [], payment: 'account', delivered: false, note: '4 of us, mostly beer', visit: true },
      { who: people[2], hole: 5, ago: 70, items: [['cm_coffee', 2]], payment: 'cart', delivered: 'card' },
      { who: people[3], hole: 9, ago: 45, items: [['cm_pop', 2], ['cm_sandwich', 1]], payment: 'cart', delivered: 'cash' }
    ];
    const byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
    seedOrders.forEach(function (s, i) {
      if (!s.who) return;
      const placedAt = now - s.ago * 60000;
      const items = s.items.map(function (x) { const m = byId[x[0]] || { id: x[0], name: x[0], price: 3 }; return { itemId: m.id, name: m.name, size: m.size || '', qty: x[1], price: +m.price, alcohol: !!m.alcohol }; });
      const id = 'co_demo' + td.replace(/-/g, '') + '_' + i;
      if (order(id)) return;    /* already seeded today (the reset ran twice) */
      const key = 'member:' + s.who.id;
      if (!s.delivered) f = D.addOrder(f, { id: id, hole: s.hole, placedAt: placedAt, startHole: 1, phone: key + '|demo' }, now).fleet;
      S.insert('cartOrders', { id: id, kind: s.visit ? 'visit' : 'order', date: td, placedAt: placedAt, golferType: 'member', golferKey: key, memberId: s.who.id, publicPlayerId: null,
        name: s.who.firstName + ' ' + s.who.lastName, firstName: s.who.firstName, groupSize: 4 - (i % 2), teeTimeId: null, teeTime: null,
        hole: s.hole, startHole: 1, holeAt: placedAt, items: items, total: totalOf(items), payment: s.payment, note: s.note || '',
        status: s.delivered ? 'delivered' : 'open', cartId: '1', cartName: name, golferText: null, headingAt: null, merges: 0,
        deliveredAt: s.delivered ? new Date(placedAt + 11 * 60000).toISOString() : null, deliveredBy: s.delivered ? name : null,
        foundAt: s.delivered ? String(s.hole + 1) : null, paidWith: s.delivered || null, demo: true,
        log: [{ at: new Date(placedAt).toISOString(), text: (s.visit ? 'Called the cart to hole ' : 'Ordered from hole ') + s.hole }] });
    });
    /* Orders already open today (one made just after midnight in a tab opened the day before, or today's demo orders
       if the reset runs twice) go back in a line instead of being left open in none. */
    const seen = {};
    orders().filter(function (o) { return o.status === 'open' && o.date === td && !D.placeInLine(f, entryOf(o)) && D.isValidHole(+o.hole); })
      .sort(function (a, b) { return a.placedAt - b.placedAt; })
      .forEach(function (o) { const eid = entryOf(o); if (seen[eid]) return; seen[eid] = 1; f = D.addOrder(f, { id: eid, hole: +o.hole, placedAt: o.placedAt, holeAt: o.holeAt || o.placedAt, startHole: o.startHole === 10 ? 10 : 1, phone: o.demo || !o.teeTimeId ? o.golferKey + '|demo' : 'group:' + o.teeTimeId }, now).fleet; });
    commit(f);
    S.setObj('cartDay', td);
  }
  try { dailyHousekeeping(); } catch (e) { console.error('Beverage cart housekeeping failed', e); }

  /* ---------------- Shared API ---------------- */
  Club.cart = {
    CATEGORIES: CATEGORIES, CART_IDS: CART_IDS, DEMO_PUBLIC_ID: DEMO_PUBLIC_ID, DEMO_PUBLIC_EMAIL: DEMO_PUBLIC_EMAIL,
    fleet: fleet, menu: menu, orders: orders, order: order, todays: todays,
    golferKey: golferKey, isDemo: isDemo, teeTimeToday: teeTimeToday, eligibility: eligibility, estimateHole: estimateHole, teedOffAt: teedOffAt, categories: categories, removeCategory: removeCategory,
    serviceOpen: serviceOpen, banner: banner, openOrderFor: openOrderFor, latestOrderFor: latestOrderFor,
    placeOrder: placeOrder, callCart: callCart, locCheck: locCheck, holeFromLoc: holeFromLoc, entryOf: entryOf, entryDocs: entryDocs, groupName: groupName,
    confirmHole: confirmHole, predictedHole: predictedHole, holeCheck: holeCheck, markHoleCheck: markHoleCheck, gpsReady: gpsReady, gpsUpdate: gpsUpdate, isVisit: isVisit, label: label, startTeeOf: startTeeOf, golferStatus: golferStatus, moveGolfer: moveGolfer, cancelByGolfer: cancelByGolfer, editByGolfer: editByGolfer,
    startShift: startShift, go: go, delivered: delivered, restock: restock, backOnCourse: backOnCourse, endShift: endShift, cancelByStaff: cancelByStaff,
    itemsText: itemsText, itemCount: itemCount, totalOf: totalOf, hasAlcohol: hasAlcohol, nodeLabel: nodeLabel,
    /** fn() runs on any cart change, in this tab or another (store subscribe plus the storage event). Returns unsubscribe. */
    onChange: function (fn) {
      const offs = ['$cartFleet', 'cartOrders', 'cartMenu'].map(function (k) { return S.subscribe(k, function () { fn(); }); });
      return function () { offs.forEach(function (u) { u(); }); };
    }
  };

  /* For the staff page (js/modules/cart.js) */
  Club.shared = Club.shared || {};
  Club.shared.cart = { CART_IDS, MAX_QTY, today, hm, r2, nodeLabel, entryDocs, groupName, fleet, categories, removeCategory, menu, orders, order, todays, cartOf, headingTo, itemsText, hasAlcohol, isVisit, label, banner, golferStatus, startShift, go, delivered, restock, backOnCourse, endShift, cancelByStaff };
})();
