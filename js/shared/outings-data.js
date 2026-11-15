/* Group outings data: the packages and the outings pipeline seed.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/outings.js, which reads these helpers from Club.shared.outings. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  const STAGES = ['Enquiry', 'Quoted', 'Deposit paid', 'Confirmed', 'Completed', 'Lost'];
  const FLOW = STAGES.slice(0, 5);
  const CARD_FEE = 0.025;
  /* From the 2026 tournament package (contacts, terms, buffet). Wording kept close to the original. */
  const PDF = {
    blurb: 'Located less than 4 km from Portage and Main, St. Boniface Golf Club is an excellent place to host your company or charity golf tournament. Your participants can play in the event without having to take the whole day off to travel. Our golf course provides a challenging yet enjoyable experience for all golfers ranging from beginners to the most accomplished players.',
    contacts: [
      { name: 'Steve Wood', title: 'Director of Golf Operations', ext: '209', email: 'dirgolf@stbgc.ca' },
      { name: 'Carly Dalmyn', title: 'Director of Clubhouse Operations', ext: '215', email: 'dirch@stbgc.ca' }
    ],
    buffet: {
      includes: 'Fresh rolls and butter, 1 salad, 2 hot items, 1 vegetable, 1 starch, assorted dessert station, coffee and tea station',
      salad: ['Caesar salad', 'Tossed salad', 'Greek salad', 'Coleslaw', 'Potato salad', 'Pasta salad', 'Spinach salad'],
      hot: ['Swedish meatballs', 'Perogies', 'Cabbage rolls', 'Pork schnitzel', 'Rotisserie chicken pieces', 'BBQ chicken pieces', 'Baked mac and cheese', 'BBQ ribs'],
      vegetable: ['Vegetable medley', 'Green beans', 'Corn', 'Broccoli and cauliflower with cheese sauce'],
      starch: ['Herb roasted potatoes', 'Dauphinoise potatoes', 'Lemon potatoes', 'Wild rice pilaf', 'Seasoned wedges', 'Baked potatoes'],
      carvery: ['Roasted top sirloin', 'Baked ham', 'Pork loin']
    },
    bar: ['Cash bar', 'Host bar', 'Tickets'],
    terms: [
      ['Initial payment', 'Tournaments with under 100 players are required to pay a $500.00 initial deposit. Tournaments over 100 players require a $1,000.00 initial deposit. Initial payments are non-refundable and non-transferable. This payment will be applied to your final invoice, barring any damage to the course and equipment.'],
      ['Payment methods', 'Accepted methods of payment are cash, cheque, debit, e-transfer, Visa, Mastercard and American Express. All credit card payments are subject to a 2.5% processing fee. A credit card number is required with bookings.'],
      ['Final payment', 'The balance of the total costs accrued is due within 30 days upon completion of your event. You will be invoiced by email within 7 business days of your event. If payment is not received within these guidelines, the credit card listed on the contract will be charged for the full amount owing. A charge of 2% per month will be applied on all overdue accounts.'],
      ['Guaranteed numbers', 'Guaranteed numbers for golf and a list of all golfers is required no later than 5 days prior to the tournament. Guaranteed numbers for all meal service are required 5 business days before the event. If guaranteed numbers are not received, the club will prepare for the estimated number of guests on the contract and reserves the right to invoice for the estimated or actual number, whichever is greater, for both golf and meal service.'],
      ['Damages', 'Any damages to the facility, golf course or rental equipment such as power carts and clubs are the responsibility of the tournament organization and will be charged on your final invoice.'],
      ['Consumption of alcohol', 'As per LGCA regulations, St. Boniface Golf Club must supply all alcoholic beverages consumed on the golf course. Private coolers are not permitted. Sample stations conducted by hole sponsors may be conducted at the discretion of our management team, in accordance with LGCA regulations.'],
      ['Tee time and modified shotgun tournaments', 'All golf events under 100 players are subject to tee times beginning at 11am or a modified shotgun start at the discretion of St. Boniface Golf Club. Tee time and modified shotgun events will not have sole use of the golf course.'],
      ['Shotgun tournaments', 'All shotgun events must have a minimum of 100 players or pay the equivalent course rental. Full field events are to be held Tuesday to Thursday with a 12:00pm start time, unless otherwise approved by St. Boniface Golf Club.'],
      ['Food and beverage', 'All organized golf events with over 16 participants are required to arrange for a minimum of one pre-ordered meal. All food and beverage service must be provided by the golf club unless otherwise approved. F&B arrangements must be submitted a minimum of 8 weeks prior to the event.']
    ]
  };

  /* ---------------- Helpers ---------------- */
  function today() { return Club.date.today(); }
  function addDays(iso, n) { return Club.date.addDays(iso, n); }
  function daysBetween(a, b) { return Math.round((fmt.toDate(b) - fmt.toDate(a)) / 86400000); }
  function round2(v) { return Math.round((+v || 0) * 100) / 100; }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function monthOf(iso) { return +String(iso).slice(5, 7); }
  function totals(lines) {
    const subtotal = round2((lines || []).reduce(function (s, l) { return s + (+l.qty || 0) * (+l.unitPrice || 0); }, 0));
    const tax = round2(subtotal * Club.taxRate());
    return { subtotal: subtotal, tax: tax, total: round2(subtotal + tax) };
  }
  function paid(o) { return round2((o.deposits || []).reduce(function (s, d) { return s + (+d.amount || 0); }, 0)); }
  function pkgOf(o) { return o && o.packageId ? S.find('outingPackages', o.packageId) : null; }
  function initialDeposit(players) { return players >= 100 ? 1000 : 500; }

  /* Tee sheet settings (owned by teesheet.js) read defensively, to match its slots and close of play. */
  function sheet() { const s = Object.assign({ interval: 9, first: '06:30', last: '17:00' }, S.getObj('teeSheetSettings', {}) || {}); s.step = Math.max(5, +s.interval || 9); return s; }
  function slotList() { const s = sheet(); const out = []; for (let m = toMin(s.first); m <= toMin(s.last); m += s.step) out.push(toHM(m)); return out; }
  function closeHM() { const s = sheet(); return toHM(toMin(s.last) + s.step); }
  function snapDown(t) { const sl = slotList(); let best = sl[0]; sl.forEach(function (x) { if (x <= t) best = x; }); return best; }
  /** Default tee sheet window for a shotgun: let the course clear (about 4.5 hours of play ahead of the start) through close of play. */
  function defaultWindow(o) {
    const st = toMin(o.start || '12:00'); const s = sheet();
    const from = snapDown(toHM(Math.max(toMin(s.first), st - (o.holes === 9 ? 135 : 270))));
    const until = o.holes === 9 ? toHM(Math.min(toMin(closeHM()), st + 150)) : closeHM();
    return { start: from, end: until };
  }

  /* ---------------- Seed: packages and add-ons from the PDF ---------------- */
  S.seed('outingPackages', [
    { id: 'op_birdie', kind: 'package', name: 'Birdie package', short: 'Birdie', minPlayers: 16, maxPlayers: 40, perPlayer: 130, months: [5, 7], format: 'Tee times', meal: 'BBQ lunch', buffet: false,
      availability: 'Only available May and July', includesText: '18-hole green fee (tee times), shared power cart and BBQ lunch', includes: ['18-hole green fee (tee times)', 'Shared power cart', 'BBQ lunch'] },
    { id: 'op_eagle', kind: 'package', name: 'Eagle package', short: 'Eagle', minPlayers: 41, maxPlayers: 99, perPlayer: 160, months: [5, 7, 9], format: 'Tee times or modified shotgun', meal: 'Buffet dinner', buffet: true,
      availability: 'Only available May, July and September', includesText: '18-hole green fee (tee times or modified shotgun only), shared power cart and buffet dinner', includes: ['18-hole green fee (tee times or modified shotgun only)', 'Shared power cart', 'Buffet dinner'] },
    { id: 'op_platinum', kind: 'package', name: 'Platinum package', short: 'Platinum', minPlayers: 100, maxPlayers: 144, perPlayer: 150, months: [5, 6, 7, 8, 9], format: 'Shotgun', meal: 'Buffet dinner', buffet: true,
      availability: '100 to 144 players, full shotgun', includesText: '18-hole green fee (shotgun), shared power cart and buffet dinner', includes: ['18-hole green fee (shotgun)', 'Shared power cart', 'Buffet dinner'] },
    { id: 'ao_bbq', kind: 'addon', group: 'Food and beverage', name: 'BBQ lunch', price: 17, unit: 'pp', desc: 'Choice of all beef hotdog or CAB burger and a bottled Pepsi beverage' },
    { id: 'ao_reg', kind: 'addon', group: 'Food and beverage', name: 'Registration station', price: 6.5, unit: 'pp', desc: 'Coffee and tea, fresh baked muffins' },
    { id: 'ao_tacos', kind: 'addon', group: 'On-course food station', name: 'Carne asada tacos', price: 25, unit: 'pp' },
    { id: 'ao_dandan', kind: 'addon', group: 'On-course food station', name: 'DanDan Asian noodles', price: 23, unit: 'pp' },
    { id: 'ao_fish', kind: 'addon', group: 'On-course food station', name: 'Fish and chips', price: 23, unit: 'pp' },
    { id: 'ao_kabobs', kind: 'addon', group: 'On-course food station', name: 'Sweet and sour meatball kabobs', price: 22, unit: 'pp' },
    { id: 'ao_mac', kind: 'addon', group: 'On-course food station', name: 'Mac and cheese bar', price: 22, unit: 'pp' },
    { id: 'ao_sliders', kind: 'addon', group: 'On-course food station', name: 'Pulled pork sliders', price: 24, unit: 'pp' },
    { id: 'ao_bev', kind: 'addon', group: 'Beverage', name: 'Domestic beverage ticket', price: 7.25, unit: 'ticket' },
    { id: 'ao_water', kind: 'addon', group: 'Beverage', name: 'Bottled water', price: 3, unit: 'each' },
    { id: 'ao_adult', kind: 'addon', group: 'Beverage', name: 'On-course "adult" beverage station', price: 13, unit: 'pp', desc: 'Margaritas, sangria or Caesars' },
    { id: 'ao_carvery', kind: 'addon', group: 'Buffet', name: 'Carvery', price: 6, unit: 'pp', desc: 'Roasted top sirloin, baked ham, pork loin', onlyFor: ['op_eagle', 'op_platinum'] },
    { id: 'ao_stations', kind: 'addon', group: 'Buffet', name: 'Exchange buffet dinner for (3) on-course stations', price: 25, unit: 'pp', desc: 'Available only for the Platinum (100+ players) package', onlyFor: ['op_platinum'] }
  ]);

  /* ---------------- Quote ---------------- */
  function addOnQty(o, a, ao) { return ao.unit === 'pp' ? (+o.players || 0) : (+a.qty || 0); }
  function packageLines(o) {
    const lines = []; const p = pkgOf(o);
    if (p) lines.push({ label: p.name + ': ' + p.includesText, qty: +o.players || 0, unitPrice: p.perPlayer, ref: p.id });
    (o.addOns || []).forEach(function (a) {
      const ao = S.find('outingPackages', a.id); if (!ao) return;
      lines.push({ label: ao.name + (ao.unit === 'ticket' ? ' (per ticket)' : ao.unit === 'each' ? ' (each)' : ' (per player)'), qty: addOnQty(o, a, ao), unitPrice: ao.price, ref: ao.id });
    });
    return lines;
  }
  function makeQuote(o, extra) {
    const lines = packageLines(o).concat((extra || []).filter(function (l) { return String(l.label || '').trim(); }).map(function (l) { return { label: l.label, qty: +l.qty || 0, unitPrice: round2(l.unitPrice), ref: 'custom' }; }));
    const t = totals(lines);
    return { lines: lines, subtotal: t.subtotal, tax: t.tax, total: t.total, updatedAt: new Date().toISOString() };
  }

  /* ---------------- Seed: outings (May to September only) ---------------- */
  function nthDow(year, month, wd, n) { const d = new Date(year, month - 1, 1, 12); const off = (wd - d.getDay() + 7) % 7; d.setDate(1 + off + (n - 1) * 7); return S.iso(d); }
  S.seed('outings', function () {
    R.reseed(3535);
    const t = today(); const Y = +t.slice(0, 4), M = monthOf(t);
    const pastY = M >= 10 ? Y : Y - 1, nextY = M >= 9 ? Y + 1 : Y;
    const past = function (m, wd, n) { let d = nthDow(pastY, m, wd, n); if (d >= t) d = nthDow(pastY - 1, m, wd, n); return d; };
    const up = function (m, wd, n) { let d = nthDow(nextY, m, wd, n); if (d <= t) d = nthDow(nextY + 1, m, wd, n); return d; };
    const specs = [
      { org: 'Larkspur Realty Charity Classic', contact: 'Brenda Okonkwo', kind: 'Charity', date: past(6, 3, 3), stage: 'Completed', players: 132, format: 'Shotgun', start: '12:00', pkg: 'op_platinum', addOns: [{ id: 'ao_reg' }, { id: 'ao_adult' }, { id: 'ao_carvery' }], enq: -260 },
      { org: 'Northgate Minor Hockey golf tournament', contact: 'Darryl Wiebe', kind: 'Sports club', date: past(7, 4, 2), stage: 'Completed', players: 64, format: 'Tee times', start: '11:00', pkg: 'op_eagle', addOns: [{ id: 'ao_bev', qty: 128 }], enq: -220 },
      { org: 'Prairie Fasteners customer appreciation day', contact: 'Gail Morrissette', kind: 'Corporate', date: past(5, 4, 3), stage: 'Completed', players: 28, format: 'Tee times', start: '11:00', pkg: 'op_birdie', addOns: [{ id: 'ao_water', qty: 56 }], enq: -240 },
      { org: 'Bannerman Family Foundation charity golf', contact: 'Owen Bannerman', kind: 'Charity', date: past(8, 2, 2), stage: 'Completed', players: 120, format: 'Shotgun', start: '12:00', pkg: 'op_platinum', addOns: [{ id: 'ao_reg' }, { id: 'ao_tacos' }], enq: -200 },
      { org: 'Maple Bend Curling Club golf day', contact: 'Shauna Klassen', kind: 'Sports club', date: past(9, 2, 2), stage: 'Lost', players: 48, format: 'Tee times', start: '11:00', pkg: 'op_eagle', addOns: [], enq: -150, lost: 'Date not available' },
      { org: 'Prairie Lights Children\'s Fund charity classic', contact: 'Renée Champagne', kind: 'Charity', date: up(6, 3, 3), stage: 'Confirmed', players: 140, format: 'Shotgun', start: '12:00', pkg: 'op_platinum', addOns: [{ id: 'ao_reg' }, { id: 'ao_adult' }, { id: 'ao_sliders' }], enq: -120 },
      { org: 'Aspen Grove Financial client classic', contact: 'Victor Lam', kind: 'Corporate', date: up(8, 2, 1), stage: 'Deposit paid', players: 104, format: 'Shotgun', start: '12:00', pkg: 'op_platinum', addOns: [{ id: 'ao_reg' }, { id: 'ao_bev', qty: 208 }], enq: -45 },
      { org: 'Red Oak Rugby Club annual golf day', contact: 'Callum Fraser', kind: 'Sports club', date: up(9, 4, 2), stage: 'Quoted', players: 56, format: 'Tee times', start: '11:00', pkg: 'op_eagle', addOns: [{ id: 'ao_bev', qty: 112 }], enq: -14 },
      { org: 'Heartland Insurance Brokers golf day', contact: 'Melissa Dueck', kind: 'Corporate', date: up(5, 2, 3), stage: 'Quoted', players: 24, format: 'Tee times', start: '11:00', pkg: 'op_birdie', addOns: [{ id: 'ao_reg' }], enq: -9 },
      { org: 'Riverbend Soccer Club fundraiser', contact: 'Andrea Santos', kind: 'Sports club', date: up(5, 4, 4), stage: 'Enquiry', players: 72, format: 'Tee times', start: '11:00', pkg: 'op_eagle', addOns: [], enq: -2 },
      { org: 'Coldwater Engineering client golf', contact: 'Pierre Lachance', kind: 'Corporate', date: up(7, 4, 2), stage: 'Enquiry', players: 32, format: 'Tee times', start: '11:00', pkg: 'op_birdie', addOns: [], enq: 0 }
    ];
    const first = ['Alex', 'Jordan', 'Taylor', 'Chris', 'Sam', 'Morgan', 'Jamie', 'Casey', 'Riley', 'Dana', 'Kelly', 'Pat', 'Robin', 'Terry', 'Lee', 'Drew', 'Shawn', 'Kim', 'Jesse', 'Avery', 'Marc', 'Nicole', 'Brett', 'Lisa', 'Kyle', 'Monique', 'Grant', 'Tanya', 'Derek', 'Carmen'];
    const last = ['Friesen', 'Penner', 'Gauthier', 'Thiessen', 'Nguyen', 'Kowalski', 'Bouchard', 'MacLeod', 'Harder', 'Desjardins', 'Lavoie', 'Sinclair', 'Reimer', 'Patel', 'Boyko', 'Chartrand', 'Hiebert', 'Dyck', 'Moreau', 'Olson', 'Singh', 'Tremblay', 'Zacharias', 'Hunter', 'Klassen'];
    const cards = [['visa', '4242'], ['mastercard', '4444'], ['amex', '0005']];
    return specs.map(function (sp, i) {
      const id = 'out_' + (i + 1);
      const at = function (off, hh) { return addDays(t, off) + 'T' + (hh || '10') + ':' + String(12 + (i * 11) % 47).padStart(2, '0') + ':00'; };
      const o = {
        id: id, organization: sp.org, contactName: sp.contact, kind: sp.kind,
        email: sp.contact.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.') + '@example.com',
        phone: '204-' + R.int(230, 899) + '-' + String(R.int(1000, 9999)),
        date: sp.date, format: sp.format, start: sp.start, players: sp.players, holes: 18, packageId: sp.pkg, stage: sp.stage,
        addOns: sp.addOns, quote: null, deposits: [], teeBlockId: null, notes: '', history: [], roster: [], buffet: null, bar: '', createdAt: at(sp.enq, '09')
      };
      const path = sp.stage === 'Lost' ? ['Enquiry', 'Quoted', 'Lost'] : FLOW.slice(0, FLOW.indexOf(sp.stage) + 1);
      const endDay = sp.stage === 'Completed' ? daysBetween(t, sp.date) + 1 : Math.min(0, daysBetween(t, sp.date));
      const span = Math.max(0, endDay - sp.enq);
      path.forEach(function (st, k) {
        const off = path.length === 1 ? sp.enq : Math.round(sp.enq + span * (k / Math.max(1, path.length - 1)) * (st === 'Completed' ? 1 : 0.7));
        const note = { 'Enquiry': 'Enquiry received by ' + (k % 2 ? 'email' : 'phone'), 'Quoted': 'Quote and tournament agreement sent', 'Deposit paid': 'Initial deposit received', 'Confirmed': 'Agreement signed, F&B arrangements received', 'Completed': 'Tournament completed', 'Lost': sp.lost || 'Closed' }[st];
        o.history.push({ at: at(off, st === 'Enquiry' ? '09' : '15'), stage: st, note: note });
      });
      if (sp.stage === 'Lost') o.lostReason = sp.lost;
      if (FLOW.indexOf(sp.stage) >= 1 || sp.stage === 'Lost') o.quote = makeQuote(o);
      const card = cards[i % cards.length];
      if (FLOW.indexOf(sp.stage) >= 2) {
        const h = o.history.find(function (x) { return x.stage === 'Deposit paid'; });
        const amt = initialDeposit(sp.players);
        o.deposits.push({ id: 'odep_' + id + '_1', date: h ? h.at.slice(0, 10) : t, amount: amt, method: 'Card', brand: card[0], last4: card[1], fee: round2(amt * CARD_FEE) });
      }
      if (sp.stage === 'Completed' && o.quote) o.deposits.push({ id: 'odep_' + id + '_2', date: addDays(sp.date, R.int(8, 24)), amount: round2(o.quote.total - paid(o)), method: R.pick(['Cheque', 'E-transfer']), last4: '' });
      if (FLOW.indexOf(sp.stage) >= 3) {
        o.buffet = { salad: R.pick(PDF.buffet.salad), hot: [PDF.buffet.hot[R.int(0, 3)], PDF.buffet.hot[R.int(4, 7)]], vegetable: R.pick(PDF.buffet.vegetable), starch: R.pick(PDF.buffet.starch), carvery: (sp.addOns || []).some(function (a) { return a.id === 'ao_carvery'; }) ? R.pick(PDF.buffet.carvery) : '' };
        o.bar = R.pick(PDF.bar);
        const n = sp.players - (sp.stage === 'Confirmed' ? R.int(6, 14) : 0);
        for (let k = 0; k < n; k++) o.roster.push(first[(k * 7 + i * 3) % first.length] + ' ' + last[(k * 11 + i * 5) % last.length]);
      }
      if (sp.format === 'Shotgun' && (sp.stage === 'Confirmed' || sp.stage === 'Completed')) {
        const w = defaultWindow(o);
        const b = S.insert('teeBlocks', { id: 'tb_' + id, date: o.date, start: w.start, end: w.end, kind: 'shotgun', reason: o.organization + ' shotgun' });
        o.teeBlockId = b.id; o.blockStart = w.start; o.blockEnd = w.end;
      }
      if (sp.stage === 'Enquiry') o.notes = sp.players < 40 ? 'Asked about July dates and the BBQ lunch.' : 'Looking for a Thursday in May. Wants prizes for longest drive and closest to the pin.';
      return o;
    });
  });

  /* For the staff page (js/modules/outings.js) */
  Club.shared = Club.shared || {};
  Club.shared.outings = { STAGES, FLOW, CARD_FEE, PDF, today, addDays, daysBetween, round2, toMin, toHM, monthOf, paid, pkgOf, initialDeposit, sheet, slotList, closeHM, defaultWindow, makeQuote };
})();
