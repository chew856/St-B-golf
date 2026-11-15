/* Dining data: the menu, and the dining reservations and checks seeds.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/dining.js, which reads these helpers from Club.shared.dining. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, R = S.R, esc = U.esc;

  /* Venue names per CLUB.md. The Taphouse Bar and Patio are interim names pending the club's confirmation. */
  const GALLERY = 'Gallery Taphouse & Grill', BAR = 'Taphouse Bar', PATIO = 'Patio', BANQUET = 'Banquet Hall';
  const PLAN_VENUES = [GALLERY, BAR];
  const SERVICE_CHARGE = 0.18;

  /* Floor plans: coordinates in a 1000 x 620 room */
  const TABLES = {
    'Gallery Taphouse & Grill': [
      { id: 'M1', seats: 2, shape: 'rect', x: 150, y: 115, w: 58, h: 58 },
      { id: 'M2', seats: 2, shape: 'rect', x: 310, y: 115, w: 58, h: 58 },
      { id: 'M3', seats: 2, shape: 'rect', x: 470, y: 115, w: 58, h: 58 },
      { id: 'M4', seats: 2, shape: 'rect', x: 630, y: 115, w: 58, h: 58 },
      { id: 'M5', seats: 2, shape: 'rect', x: 790, y: 115, w: 58, h: 58 },
      { id: 'M6', seats: 4, shape: 'round', x: 170, y: 290, r: 40 },
      { id: 'M7', seats: 4, shape: 'round', x: 370, y: 290, r: 40 },
      { id: 'M8', seats: 4, shape: 'round', x: 570, y: 290, r: 40 },
      { id: 'M9', seats: 4, shape: 'round', x: 750, y: 290, r: 40 },
      { id: 'M10', seats: 6, shape: 'round', x: 230, y: 470, r: 50 },
      { id: 'M11', seats: 6, shape: 'round', x: 440, y: 470, r: 50 },
      { id: 'M12', seats: 6, shape: 'round', x: 660, y: 470, r: 50 },
      { id: 'M13', seats: 10, shape: 'rect', x: 895, y: 380, w: 74, h: 230 }
    ],
    'Taphouse Bar': [
      { id: 'G1', seats: 4, shape: 'rect', x: 115, y: 215, w: 84, h: 64 },
      { id: 'G2', seats: 4, shape: 'rect', x: 115, y: 330, w: 84, h: 64 },
      { id: 'G3', seats: 4, shape: 'rect', x: 115, y: 445, w: 84, h: 64 },
      { id: 'G4', seats: 4, shape: 'round', x: 345, y: 265, r: 40 },
      { id: 'G5', seats: 4, shape: 'round', x: 545, y: 265, r: 40 },
      { id: 'G6', seats: 4, shape: 'round', x: 345, y: 455, r: 40 },
      { id: 'G7', seats: 4, shape: 'round', x: 545, y: 455, r: 40 },
      { id: 'G8', seats: 2, shape: 'round', x: 750, y: 215, r: 26 },
      { id: 'G9', seats: 2, shape: 'round', x: 870, y: 215, r: 26 },
      { id: 'G10', seats: 6, shape: 'rect', x: 820, y: 360, w: 150, h: 64 },
      { id: 'G11', seats: 6, shape: 'rect', x: 820, y: 505, w: 150, h: 64 },
      { id: 'G12', seats: 10, shape: 'rect', x: 875, y: 100, w: 210, h: 50 }   /* long table for larger parties */
    ],
    'Patio': [
      { id: 'T1', seats: 4 }, { id: 'T2', seats: 4 }, { id: 'T3', seats: 4 }, { id: 'T4', seats: 4 },
      { id: 'T5', seats: 4 }, { id: 'T6', seats: 4 }, { id: 'T7', seats: 6 }, { id: 'T8', seats: 6 }, { id: 'T9', seats: 10 }
    ],
    'Banquet Hall': [{ id: 'Main hall', seats: 220 }, { id: 'Meeting room', seats: 30 }]
  };

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function fromMin(m) { m = Math.max(0, Math.min(23 * 60 + 59, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function serviceOf(t) { const m = toMin(t); return m < 11 * 60 ? 'Breakfast' : (m < 16 * 60 + 30 ? 'Lunch' : 'Dinner'); }
  function today() { return Club.date.today(); }

  /* ------------------------------------------------------------------
     Seed data
     ------------------------------------------------------------------ */
  /* The 2026 Gallery Taphouse & Grill menu (CAD). Tap and Friday pizza prices are placeholders. */
  const MENU = [
    ['Breakfast', 'One Egg Breakfast', 12, 'One egg any style, choice of bacon, ham or sausage, and toast. Served with tater tots or shredded hashbrowns', 'All', []],
    ['Breakfast', 'Two Egg Breakfast', 15, 'Two eggs any style, choice of bacon, ham or sausage, and toast. Served with tater tots or shredded hashbrowns', 'All', []],
    ['Breakfast', 'Pancakes', 13, 'Three fluffy pancakes. Add blueberries or chocolate chips $3', 'All', ['V']],
    ['Breakfast', 'Pan Omelette', 18, 'Three egg omelette with Monterey and cheddar and two fillers, toast and side', 'All', []],
    ['Breakfast', 'Eggs Benny', 18, 'Two poached eggs and back bacon on an English muffin, hollandaise, side', 'All', []],
    ['Breakfast', 'Tex-Mex Scramble', 18, 'Taco beef, tater tots, bell peppers, tomato, green onion, queso, scrambled eggs, banana peppers, salsa, sour cream, guacamole; toast', 'All', []],
    ['Breakfast', 'Breakfast Burger', 13, '', 'All', []],
    ['Breakfast', 'Breakfast Wrap', 12, '', 'All', []],
    ['Breakfast', 'Cinnamon Bun', 10, '', 'All', ['V']],
    ['Breakfast', 'Bagel with Cream Cheese', 6, '', 'All', ['V']],
    ['Breakfast', 'Side Meat', 7, 'Bacon, ham or sausage', 'All', []],
    ['Breakfast', 'Side Hashbrowns', 6, 'Tater tots or shredded', 'All', []],
    ['Breakfast', 'Fruit Cup', 6, '', 'All', ['VG', 'GF']],
    ['Breakfast', 'Toast (2pc)', 5, '', 'All', []],
    ['Soup & salads', 'Soup of the Day', 11, 'Ask your server', 'All', []],
    ['Soup & salads', 'House Salad', 14, 'Mixed greens, carrot, onion, tomato, cucumber, olives, pepperoncini, marinated chickpeas, croutons, parmesan, signature house Italian', 'All', ['V']],
    ['Soup & salads', 'Caesar Salad', 14, 'Romaine, croutons, parmesan, bacon, house made caesar', 'All', []],
    ['Soup & salads', 'Prosciutto & Pear Salad', 18, 'Artisan greens, shaved prosciutto, white wine poached pears, red onion, candied pecan, goat cheese, champagne vinaigrette', 'All', []],
    ['Soup & salads', 'Half House or Caesar Salad', 12, '', 'All', []],
    ['Soup & salads', 'Add Garlic Toast', 4, '', 'All', []],
    ['Soup & salads', 'Add Grilled Chicken', 6, '', 'All', []],
    ['Sandwiches', 'Grilled Cheese', 10, '', 'All', ['V']],
    ['Sandwiches', 'BLT', 10, '', 'All', []],
    ['Sandwiches', 'Denver', 10, '', 'All', []],
    ['Sandwiches', 'Ham & Cheese', 8, '', 'All', []],
    ['Sandwiches', 'Turkey', 8, '', 'All', []],
    ['Sandwiches', 'Corned Beef', 8, '', 'All', []],
    ['Sandwiches', 'Whistle Dog', 10, '', 'All', []],
    ['Sandwiches', 'Salmon Salad', 8, '', 'All', []],
    ['Sandwiches', 'Albacore Tuna', 8, '', 'All', []],
    ['Sides', 'House Fries', 5, '', 'All', []],
    ['Sides', 'Onion Rings', 7, '', 'All', []],
    ['Sides', 'Poutine', 8, '', 'All', []],
    ['Snacks & shares', 'Macho Nachos', 20, 'Tortilla chips, queso, corn, tomatoes, pickled jalapenos, black beans, green onion; chicken or beef; salsa and sour cream', 'All', []],
    ['Snacks & shares', 'Original Quesadilla', 17, 'Chicken or beef', 'All', []],
    ['Snacks & shares', 'Wings', 19, 'Buffalo, Cajun, honey garlic, sweet chili, lemon pepper, BBQ, Montreal steak spice, salt and pepper, hot honey, or red dragon', 'All', []],
    ['Snacks & shares', 'Yorkie Bites', 20, 'Five mini Yorkies with slow roasted CAB prime rib, horseradish cream, au jus', 'All', []],
    ['Snacks & shares', 'Pretzel Sticks', 16, 'Six soft pretzels, house beer cheese dip', 'All', []],
    ['Snacks & shares', 'Spinach & Artichoke Dip', 17, 'Toasted naan', 'All', ['V']],
    ['Snacks & shares', 'Buffalo Chicken Taquitos', 17, 'Four taquitos with ranch', 'All', []],
    ['Snacks & shares', 'Chicken Lettuce Wraps', 20, 'Chicken, water chestnuts, bamboo shoots, celery, onions, carrot, green onion, cilantro, hoisin', 'All', []],
    ['Baskets & bowls', 'House Fries Basket', 9, '', 'All', []],
    ['Baskets & bowls', 'Onion Rings Basket', 14, '', 'All', []],
    ['Baskets & bowls', 'Poutine Bowl', 15, '', 'All', []],
    ['Baskets & bowls', 'Curly Fries Basket', 12, '', 'All', []],
    ['Handhelds', 'Smashburger', 19, '6oz house made CAB burger, bacon, cheese, pickles, tomato, onions, lettuce, mustard and fry sauce', 'All', []],
    ['Handhelds', 'Clubhouse Sandwich', 18, 'With choice of soup, fries, caesar or house salad', 'All', []],
    ['Handhelds', 'StB Beef', 19, 'Slow roasted CAB sirloin, onions and mushrooms, swiss and cheddar, bistro sauce, baguette, au jus', 'All', []],
    ['Handhelds', 'Crispy Honeydill-wich', 20, 'Breaded chicken in honey dill, provolone, lettuce, pickled red onion, dill chips, onion Kaiser', 'All', []],
    ['Handhelds', 'Blackened Chicken Wrap', 18, 'With choice of soup, fries, caesar or house salad', 'All', []],
    ['Handhelds', 'Shrimp Po’ Boy', 20, 'With choice of soup, fries, caesar or house salad', 'All', []],
    ['Handhelds', 'St. B Crunch Wrap', 18, 'Our signature beef crunch wrap', 'All', []],
    ['Main attractions', 'Chicken Fingers', 20, 'Five tenders with a side', 'All', []],
    ['Main attractions', 'Fish & Chips', 20, 'Two pieces of house beer battered cod, tartar, fries', 'All', []],
    ['Main attractions', 'Ginger Beef Bowl', 22, 'Served on rice', 'All', []],
    ['Main attractions', 'Kung Pao Chicken', 22, 'Wok fired chicken, veggies, cashews, soy ginger garlic sauce, chow mein noodles', 'All', []],
    ['Main attractions', 'Friday Night Pizza', 18, 'Friday nights only. Ask your server about this week’s pizza menu', 'All', []],
    ['On tap', 'House Feature Tap', 8, 'Our house feature, rotating local beer', 'All', []],
    ['On tap', 'Local Tap Feature 1', 8, 'Local beer on tap, ask your server', 'All', []],
    ['On tap', 'Local Tap Feature 2', 8, 'Local beer on tap, ask your server', 'All', []],
    ['On tap', 'Local Tap Feature 3', 8, 'Local beer on tap, ask your server', 'All', []],
    ['On tap', 'Local Tap Feature 4', 8, 'Local beer on tap, ask your server', 'All', []],
    ['On tap', 'Local Tap Feature 5', 8, 'Local beer on tap, ask your server', 'All', []]
  ];

  S.seed('menuItems', function () {
    return MENU.map(function (m, i) {
      return { id: 'menu_' + (101 + i), name: m[1], section: m[0], price: m[2], description: m[3], venue: m[4], dietary: m[5], available: !(m[1] === 'Prosciutto & Pear Salad' || m[1] === 'Local Tap Feature 5') };
    });
  });

  let generated = null;
  function generate() {
    if (generated) return generated;
    R.reseed(7310);
    const menu = S.all('menuItems');
    const members = S.all('members').filter(function (m) { return m.status === 'active'; });
    const guests = ['Laurent party', 'Evelyn Shah', 'The Okonkwo party', 'Julian Ferris', 'Annabel Kowalchuk', 'Takeda party', 'The Vandermeer family', 'Malcolm Reid', 'Ingrid Solberg', 'Theo Marchetti', 'Camille Gagnon', 'Abernathy party'];
    const dietary = ['Shellfish allergy', 'Gluten free', 'Vegetarian', 'Nut allergy', 'Dairy free', 'No pork'];
    const notes = ['Window table overlooking the 18th requested', 'Prefers a quiet corner', 'Asking about the house feature tap', 'High chair needed', 'Celebrating 25 years of membership', 'Regular, usually orders the wings', 'Arriving after the round', 'Coming in for the Friday night pizza'];
    const plans = [
      ['Breakfast', GALLERY, 2, 5, 7 * 60, 9 * 60 + 45], ['Breakfast', PATIO, 1, 3, 7 * 60 + 30, 9 * 60 + 30],
      ['Lunch', BAR, 5, 9, 11 * 60 + 30, 13 * 60 + 45], ['Lunch', PATIO, 3, 6, 11 * 60 + 45, 13 * 60 + 30], ['Lunch', GALLERY, 0, 0, 12 * 60, 13 * 60 + 30],
      ['Dinner', GALLERY, 7, 11, 17 * 60 + 30, 20 * 60 + 45], ['Dinner', BAR, 3, 6, 17 * 60 + 30, 20 * 60 + 30], ['Dinner', PATIO, 0, 3, 18 * 60, 19 * 60 + 30]
    ];
    const res = []; let rid = 1;
    const tNow = nowMin();
    function pickTable(venue, date, time, party, list) {
      const cands = (TABLES[venue] || []).filter(function (t) { return t.seats >= party; }).sort(function (a, b) { return a.seats - b.seats; });
      for (let i = 0; i < cands.length; i++) {
        const t = cands[i];
        const clash = list.some(function (r) { return r.date === date && r.venue === venue && r.table === t.id && r.status !== 'cancelled' && Math.abs(toMin(r.time) - toMin(time)) < 120; });
        if (!clash) return t.id;
      }
      return '';
    }
    function make(date, d, venue, time, party, forceStatus) {
      const isMember = R.chance(0.78) && members.length;
      const m = isMember ? R.pick(members) : null;
      let status;
      if (forceStatus) status = forceStatus;
      else if (d < 0) status = R.chance(0.08) ? 'cancelled' : (R.chance(0.04) ? 'no-show' : 'completed');
      else if (d > 0) status = R.chance(0.06) ? 'cancelled' : 'confirmed';
      else {
        const tm = toMin(time);
        if (R.chance(0.05)) status = 'cancelled';
        else if (tm + 100 < tNow) status = R.chance(0.05) ? 'no-show' : 'completed';
        else if (tm <= tNow) status = 'seated';
        else status = 'confirmed';
      }
      const r = {
        id: 'dres_' + (rid++), date: date, time: time, venue: venue, partySize: party,
        memberId: m ? m.id : null, name: m ? m.firstName + ' ' + m.lastName : R.pick(guests),
        table: '', status: status,
        occasion: R.chance(0.14) ? R.pick(['Birthday', 'Anniversary', 'Business meeting', 'Member-guest', 'Celebration']) : '',
        dietary: R.chance(0.15) ? R.pick(dietary) : '',
        notes: R.chance(0.18) ? R.pick(notes) : ''
      };
      r.table = (d > 1 && R.chance(0.3)) ? '' : pickTable(venue, date, time, party, res);
      res.push(r); return r;
    }
    for (let d = -10; d <= 10; d++) {
      const date = Club.date.fromToday(d);
      const dow = F.toDate(date).getDay(); const weekend = dow === 0 || dow === 6 || dow === 5;
      plans.forEach(function (p) {
        let n = R.int(p[2], p[3]);
        const m0 = F.toDate(date).getMonth(); // the patio is a May to September space
        if (p[1] === GALLERY && p[0] === 'Lunch') n = weekend ? R.int(3, 6) : R.int(2, 4);
        if (weekend && p[0] === 'Dinner') n += R.int(1, 3);
        if (p[1] === PATIO && (m0 < 4 || m0 > 8)) n = 0;
        for (let i = 0; i < n; i++) {
          const slots = Math.floor((p[5] - p[4]) / 15);
          const time = fromMin(p[4] + R.int(0, slots) * 15);
          const maxParty = p[1] === GALLERY ? 10 : 6;
          const party = Math.min(maxParty, R.pick([2, 2, 2, 2, 3, 4, 4, 4, 4, 5, 6, 6, 8]));
          make(date, d, p[1], time, party);
        }
      });
      if (R.chance(0.35)) {
        const big = R.chance(0.4);
        const r = make(date, d, BANQUET, big ? '18:00' : '12:00', big ? R.int(60, 180) : R.int(12, 28));
        r.occasion = 'Private party'; r.table = big ? 'Main hall' : 'Meeting room';
        r.name = big ? R.pick(['Wedding reception', 'Anniversary celebration', 'Holiday party', 'Corporate tournament dinner', 'Celebration of life reception']) : R.pick(['Business meeting lunch', 'Ladies league lunch', 'Rehearsal dinner', 'Birthday luncheon', 'Committee meeting']);
        r.notes = big ? 'Package and menu confirmed with the events team' : 'Meeting room with lunch from the Gallery menu'; r.memberId = members.length ? R.pick(members).id : null;
      }
    }

    // Make sure tonight's floor has life: a few parties seated in the current service.
    const svc = serviceOf(fromMin(tNow));
    const seatedNow = res.filter(function (r) { return r.date === today() && r.status === 'seated' && PLAN_VENUES.indexOf(r.venue) >= 0 && r.table; });
    const want = [[BAR, 2, 22], [GALLERY, 4, 38], [BAR, 4, 51], [GALLERY, 2, 14]];
    want.forEach(function (w) {
      if (seatedNow.length >= 4) return;
      const t = fromMin(tNow - w[2]);
      const r = make(today(), 0, w[0], t, w[1], 'seated');
      if (!r.table) { res.pop(); return; }
      seatedNow.push(r);
    });
    /* One table on the floor still waiting to be cleared after its party left this service (Floor plan: Needs clearing).
       clearedAt null means not cleared yet; records without the field count as cleared. */
    const leftNow = res.filter(function (r) {
      return r.date === today() && r.status === 'completed' && r.table && PLAN_VENUES.indexOf(r.venue) >= 0 && serviceOf(r.time) === svc &&
        !res.some(function (x) { return x !== r && x.date === r.date && x.venue === r.venue && x.table === r.table && (x.status === 'seated' || (x.status === 'completed' && x.time > r.time)); });
    }).sort(function (a, b) { return b.time.localeCompare(a.time); })[0];
    if (leftNow) leftNow.clearedAt = null;

    // Orders: closed history plus open checks for the seated parties.
    const orders = []; let no = 1001;
    const byS = {}; menu.forEach(function (m) { (byS[m.section] = byS[m.section] || []).push(m); });
    function pickFrom(sec, venue) { const l = (byS[sec] || []).filter(function (m) { return m.venue === 'All' || m.venue === venue; }); return l.length ? R.pick(l) : null; }
    function buildItems(r, svcName) {
      const lines = {};
      function add(m) { if (!m) return; lines[m.id] = lines[m.id] || { menuItemId: m.id, name: m.name, qty: 0, price: m.price, fired: true }; lines[m.id].qty++; }
      if (svcName !== 'Breakfast' && r.partySize > 2 && R.chance(0.7)) add(pickFrom('Snacks & shares', r.venue));
      for (let c = 0; c < r.partySize; c++) {
        if (svcName === 'Breakfast') { add(pickFrom('Breakfast', r.venue)); continue; }
        add(pickFrom(R.pick(['Handhelds', 'Handhelds', 'Main attractions', 'Soup & salads', 'Sandwiches']), r.venue));
        if (R.chance(0.15)) add(pickFrom(R.chance(0.5) ? 'Baskets & bowls' : 'Sides', r.venue));
        if (R.chance(0.55)) add(pickFrom('On tap', r.venue));
      }
      return Object.keys(lines).map(function (k) { return lines[k]; });
    }
    const rate = Club.taxRate();
    res.forEach(function (r) {
      if (r.status !== 'completed' || r.venue === BANQUET) return;
      if (r.date < Club.date.fromToday(-14) || !R.chance(0.75)) return;
      const items = buildItems(r, serviceOf(r.time));
      const total = r2(items.reduce(function (a, i) { return a + i.qty * i.price; }, 0));
      const service = r2(total * SERVICE_CHARGE), tax = r2(total * rate);
      orders.push({
        id: 'dord_' + no, number: no++, date: r.date, time: r.time, venue: r.venue, table: r.table, memberId: r.memberId, name: r.name, covers: r.partySize,
        reservationId: r.id, items: items, total: total, status: 'closed', service: service, tax: tax, grandTotal: r2(total + service + tax),
        payment: r.memberId && R.chance(0.88) ? 'Member account' : 'Card', closedAt: r.date + 'T' + fromMin(toMin(r.time) + 95) + ':00'
      });
    });
    const flows = [['fired', 9], ['fired', 23], ['open', 0], ['served', 41]];
    seatedNow.slice(0, 4).forEach(function (r, i) {
      const f = flows[i];
      const items = buildItems(r, svc);
      const opened = new Date(Date.now() - (toMin(fromMin(tNow)) - toMin(r.time) + 2) * 60000);
      if (f[0] === 'open') items.forEach(function (it, k) { it.fired = k === 0 ? false : it.fired; });
      if (f[0] === 'open' && items.length > 1) items.forEach(function (it, k) { if (k > 0) it.fired = true; });
      const total = r2(items.reduce(function (a, it) { return a + it.qty * it.price; }, 0));
      orders.push({
        id: 'dord_' + no, number: no++, date: today(), time: r.time, venue: r.venue, table: r.table, memberId: r.memberId, name: r.name, covers: r.partySize,
        reservationId: r.id, items: items, total: total, status: f[0], openedAt: opened.toISOString(),
        firedAt: f[1] ? new Date(Date.now() - f[1] * 60000).toISOString() : (f[0] === 'open' ? new Date(Date.now() - 16 * 60000).toISOString() : null),
        servedAt: f[0] === 'served' ? new Date(Date.now() - 6 * 60000).toISOString() : null
      });
    });
    generated = { res: res, orders: orders };
    return generated;
  }
  S.seed('diningReservations', function () { return generate().res; });
  S.seed('diningOrders', function () { return generate().orders; });

  /* For the staff page (js/modules/dining.js) */
  Club.shared = Club.shared || {};
  Club.shared.dining = { GALLERY, BAR, PATIO, BANQUET, PLAN_VENUES, SERVICE_CHARGE, TABLES, r2, pad, toMin, fromMin, nowMin, serviceOf, today };
})();
