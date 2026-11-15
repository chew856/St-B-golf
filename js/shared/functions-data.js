/* Weddings and events data: the packages and the functions pipeline seed.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/functions.js, which reads these helpers from Club.shared.functions. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  const STAGES = ['Enquiry', 'Tour booked', 'Proposal sent', 'Deposit paid', 'Confirmed', 'Completed', 'Lost'];
  const FLOW = STAGES.slice(0, 6);
  const COORDINATOR = 'stf_1';
  /* Room rental and bar rates are sample figures: the club does not publish them. */
  const ROOM_RATE = { 'Banquet Hall': 500, 'Meeting room': 150, 'Gallery Taphouse & Grill': 0 };

  /* ---------------- Small helpers ---------------- */
  function today() { return Club.date.today(); }
  function addDays(iso, n) { return Club.date.addDays(iso, n); }
  function daysBetween(a, b) { return Math.round((fmt.toDate(b) - fmt.toDate(a)) / 86400000); }
  function dowOnOrAfter(iso, dow) { const d = fmt.toDate(iso).getDay(); return addDays(iso, (dow - d + 7) % 7); }
  function round2(v) { return Math.round((+v || 0) * 100) / 100; }
  function totals(lines) {
    const subtotal = round2((lines || []).reduce(function (s, l) { return s + (+l.qty || 0) * (+l.unitPrice || 0); }, 0));
    const tax = round2(subtotal * Club.taxRate());
    return { subtotal: subtotal, tax: tax, total: round2(subtotal + tax) };
  }
  function paid(f) { return round2((f.deposits || []).reduce(function (s, d) { return s + (+d.amount || 0); }, 0)); }
  function pkgOf(f) { return f && f.packageId ? S.find('functionPackages', f.packageId) : null; }

  /* ---------------- Seed: packages (sample pricing) ---------------- */
  S.seed('functionPackages', [
    { id: 'fpk_wedding', name: 'All-inclusive wedding', kind: 'Wedding', perGuest: 98, minimumGuests: 100, sample: true,
      includes: ['Reception in the Banquet Hall, seating for up to 220', 'Dinner service with your choice of menu', 'Linens, tableware and glassware', 'Late-night snack', 'Complimentary parking for your guests', 'Planning with our special events team'] },
    { id: 'fpk_intimate', name: 'Intimate wedding', kind: 'Wedding', perGuest: 85, minimumGuests: 50, sample: true,
      includes: ['Reception in the Banquet Hall', 'Dinner service with your choice of menu', 'Linens, tableware and glassware', 'Complimentary parking for your guests', 'Planning with our special events team'] },
    { id: 'fpk_celebration', name: 'Celebration dinner', kind: 'Event', perGuest: 62, minimumGuests: 40, sample: true,
      includes: ['Banquet Hall or the Gallery Taphouse & Grill', 'Buffet or plated dinner', 'Coffee and tea service', 'Complimentary parking'] },
    { id: 'fpk_holiday', name: 'Holiday party', kind: 'Event', perGuest: 68, minimumGuests: 50, sample: true,
      includes: ['Banquet Hall for the evening', 'Holiday buffet dinner', 'Coffee and tea service', 'Complimentary parking'] },
    { id: 'fpk_reception', name: 'Celebration of life reception', kind: 'Event', perGuest: 32, minimumGuests: 30, sample: true,
      includes: ['Banquet Hall for an afternoon reception', 'Sandwich and dessert platters', 'Coffee and tea service', 'Complimentary parking'] },
    { id: 'fpk_meeting', name: 'Meeting day', kind: 'Event', perGuest: 45, minimumGuests: 10, sample: true,
      includes: ['Meeting room for the day (members receive reduced meeting room rates)', 'Coffee and tea service', 'Lunch from the Gallery menu', 'Complimentary parking'] }
  ]);

  /* ---------------- Seed: functions ---------------- */
  function defaultLines(f) {
    const pkg = pkgOf(f); const g = +f.guests || 0; const lines = [];
    if (pkg) lines.push({ label: pkg.name + ' package', qty: Math.max(g, pkg.minimumGuests || 0), unitPrice: pkg.perGuest });
    if (ROOM_RATE[f.space]) lines.push({ label: 'Room rental, ' + f.space, qty: 1, unitPrice: ROOM_RATE[f.space] });
    if (['Wedding', 'Holiday party', 'Social'].indexOf(f.type) >= 0) lines.push({ label: 'Host bar estimate', qty: g, unitPrice: f.type === 'Wedding' ? 22 : 16 });
    if (f.type === 'Wedding') lines.push({ label: 'Ceremony setup', qty: 1, unitPrice: 450 });
    return lines;
  }
  function makeQuote(f, lines) { const t = totals(lines); return { lines: lines, subtotal: t.subtotal, tax: t.tax, total: t.total, updatedAt: new Date().toISOString() }; }

  S.seed('functions', function () {
    R.reseed(1515);
    const t0 = today();
    const sat = function (n) { return dowOnOrAfter(Club.date.fromToday(n), 6); };
    const fri = function (n) { return dowOnOrAfter(Club.date.fromToday(n), 5); };
    const wkd = function (n, dow) { return dowOnOrAfter(Club.date.fromToday(n), dow); };
    const specs = [
      { type: 'Wedding', name: 'Amélie Gagnon and Marcus Reid', contact: 'Amélie Gagnon', date: sat(-54), stage: 'Completed', guests: 186, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '16:00', end: '23:59', enq: -330 },
      { type: 'Celebration of life', name: 'Celebration of life for Gordon Halvorsen', contact: 'Karen Halvorsen', date: wkd(-27, 5), stage: 'Completed', guests: 120, space: 'Banquet Hall', pkg: 'fpk_reception', start: '13:00', end: '16:00', enq: -36 },
      { type: 'Wedding', name: 'Jasleen Dhillon and Ryan Kowalchuk', contact: 'Jasleen Dhillon', date: sat(-33), stage: 'Completed', guests: 205, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '15:30', end: '23:59', enq: -400 },
      { type: 'Meeting', name: 'Prairie Hearth Co-op board meeting', contact: 'Denise Fournier', date: wkd(-9, 3), stage: 'Completed', guests: 18, space: 'Meeting room', pkg: 'fpk_meeting', start: '09:00', end: '15:00', enq: -40 },
      { type: 'Celebration of life', name: 'Celebration of life for Irene Szymanski', contact: 'Paul Szymanski', date: wkd(4, 5), stage: 'Confirmed', guests: 90, space: 'Banquet Hall', pkg: 'fpk_reception', start: '13:00', end: '16:30', enq: -6 },
      { type: 'Social', name: 'Kowalski 60th birthday', contact: 'Teresa Kowalski', date: sat(19), stage: 'Enquiry', guests: 55, space: 'Gallery Taphouse & Grill', pkg: 'fpk_celebration', start: '18:00', end: '23:00', enq: -1 },
      { type: 'Holiday party', name: 'Red River Engineering holiday party', contact: 'Mark Lindgren', date: fri(39), stage: 'Confirmed', guests: 140, space: 'Banquet Hall', pkg: 'fpk_holiday', start: '18:00', end: '23:59', enq: -120 },
      { type: 'Holiday party', name: 'Norwood Dental Group holiday party', contact: 'Dr. Anita Chaudhry', date: sat(47), stage: 'Deposit paid', guests: 85, space: 'Banquet Hall', pkg: 'fpk_holiday', start: '18:30', end: '23:30', enq: -60 },
      { type: 'Social', name: 'Desrosiers 40th anniversary dinner', contact: 'Luc Desrosiers', date: sat(68), stage: 'Proposal sent', guests: 72, space: 'Banquet Hall', pkg: 'fpk_celebration', start: '17:30', end: '23:00', enq: -18 },
      { type: 'Corporate', name: 'Keewatin Logistics spring planning day', contact: 'Holly Bergen', date: wkd(122, 4), stage: 'Enquiry', guests: 28, space: 'Meeting room', pkg: 'fpk_meeting', start: '08:30', end: '16:00', enq: -3 },
      { type: 'Wedding', name: 'Sofia Marchetti and Liam Ng', contact: 'Sofia Marchetti', date: sat(201), stage: 'Deposit paid', guests: 180, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '16:00', end: '23:59', enq: -95 },
      { type: 'Wedding', name: 'Hannah Bouchard and Eli Friesen', contact: 'Hannah Bouchard', date: sat(243), stage: 'Confirmed', guests: 210, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '15:00', end: '23:59', enq: -210 },
      { type: 'Wedding', name: 'Priya Sandhu and Tom Bergeron', contact: 'Priya Sandhu', date: sat(236), stage: 'Lost', guests: 160, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '16:00', end: '23:59', enq: -70, lost: 'Chose another venue' },
      { type: 'Wedding', name: 'Chloé Lavallée and Daniel Osei', contact: 'Chloé Lavallée', date: sat(271), stage: 'Proposal sent', guests: 150, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '16:30', end: '23:59', enq: -25 },
      { type: 'Wedding', name: 'Megan Thiessen and Arjun Mehta', contact: 'Megan Thiessen', date: sat(299), stage: 'Tour booked', guests: 190, space: 'Banquet Hall', pkg: 'fpk_wedding', start: '16:00', end: '23:59', enq: -8 },
      { type: 'Wedding', name: 'Natalie Roy and Jordan Pelletier', contact: 'Natalie Roy', date: sat(334), stage: 'Enquiry', guests: 95, space: 'Banquet Hall', pkg: 'fpk_intimate', start: '17:00', end: '23:59', enq: 0 }
    ];
    const cards = [['visa', '4242'], ['mastercard', '4444'], ['amex', '0005'], ['visa', '1881'], ['mastercard', '5100']];
    return specs.map(function (sp, i) {
      const id = 'fn_' + (i + 1);
      const at = function (dayOffset, hh) { return addDays(t0, dayOffset) + 'T' + (hh || '10') + ':' + String(10 + (i * 7) % 49).padStart(2, '0') + ':00'; };
      const f = {
        id: id, type: sp.type, name: sp.name, contactName: sp.contact,
        email: sp.contact.toLowerCase().replace(/^dr\.\s*/, '').replace(/[^a-z\s]/g, function (c) { return { 'é': 'e', 'è': 'e' }[c] || ''; }).trim().replace(/\s+/g, '.') + '@example.com',
        phone: '204-' + R.int(220, 899) + '-' + String(R.int(1000, 9999)),
        date: sp.date, start: sp.start, end: sp.end, guests: sp.guests, space: sp.space, stage: sp.stage, packageId: sp.pkg,
        coordinatorId: COORDINATOR, menuNotes: '', notes: '', quote: null, deposits: [], history: [], runSheet: [], tour: null,
        createdAt: at(sp.enq, '09')
      };
      // Stage history from the enquiry to today (or the event) for every stage reached.
      const path = sp.stage === 'Lost' ? ['Enquiry', 'Tour booked', 'Proposal sent', 'Lost'] : FLOW.slice(0, FLOW.indexOf(sp.stage) + 1);
      const endDay = sp.stage === 'Completed' ? daysBetween(t0, sp.date) + 1 : Math.min(0, daysBetween(t0, sp.date));
      const span = Math.max(0, endDay - sp.enq);
      path.forEach(function (st, k) {
        const off = path.length === 1 ? sp.enq : Math.round(sp.enq + span * (k / Math.max(1, path.length - 1)) * (st === 'Completed' ? 1 : 0.72));
        const note = { 'Enquiry': 'Enquiry received through ' + (k % 2 ? 'the weddings website' : 'a phone call to the club'), 'Tour booked': 'Tour of the Banquet Hall booked', 'Proposal sent': 'Proposal emailed', 'Deposit paid': 'Deposit received, date held', 'Confirmed': 'Contract signed and menu confirmed', 'Completed': 'Event completed', 'Lost': sp.lost || 'Closed' }[st];
        f.history.push({ at: at(Math.min(off, st === 'Completed' ? off : 0), st === 'Enquiry' ? '09' : '14'), stage: st, note: note });
      });
      if (sp.stage === 'Lost') f.lostReason = sp.lost;
      if (sp.stage === 'Tour booked') f.tour = { date: addDays(t0, 3), time: '17:30', note: 'Walk through the Banquet Hall and patio' };
      if (FLOW.indexOf(sp.stage) >= 2 || sp.stage === 'Lost') f.quote = makeQuote(f, defaultLines(f));
      const card = cards[i % cards.length];
      if (FLOW.indexOf(sp.stage) >= 3) {
        const depDay = f.history.find(function (h) { return h.stage === 'Deposit paid'; });
        f.deposits.push({ id: 'dep_' + id + '_1', date: depDay ? depDay.at.slice(0, 10) : t0, amount: sp.type === 'Wedding' ? 1500 : 500, method: 'Card', brand: card[0], last4: card[1] });
      }
      if (FLOW.indexOf(sp.stage) >= 4 && f.quote) {
        const conf = f.history.find(function (h) { return h.stage === 'Confirmed'; });
        f.deposits.push({ id: 'dep_' + id + '_2', date: conf ? conf.at.slice(0, 10) : t0, amount: round2(f.quote.total * 0.4), method: 'E-transfer', last4: '' });
      }
      if (sp.stage === 'Completed' && f.quote) {
        f.deposits.push({ id: 'dep_' + id + '_3', date: addDays(sp.date, -7), amount: round2(f.quote.total - paid(f)), method: 'Cheque', last4: '' });
      }
      if (FLOW.indexOf(sp.stage) >= 4) {
        f.runSheet = sp.type === 'Wedding'
          ? [{ time: addMin(sp.start, -120), item: 'Vendors arrive, room set and linens' }, { time: sp.start, item: 'Guests arrive' }, { time: '17:00', item: 'Cocktail reception' }, { time: '18:00', item: 'Dinner service' }, { time: '19:30', item: 'Speeches and toasts' }, { time: '20:30', item: 'First dance' }, { time: '22:00', item: 'Late-night snack' }, { time: '23:30', item: 'Last call' }]
          : [{ time: addMin(sp.start, -60), item: 'Room set, coffee station ready' }, { time: sp.start, item: 'Guests arrive' }, { time: addMin(sp.start, 60), item: sp.type === 'Meeting' ? 'Morning break' : 'Food service opens' }, { time: addMin(sp.end, -30), item: 'Final service' }];
        f.menuNotes = sp.type === 'Wedding' ? 'Two vegetarian and one gluten free meal. Kids meals for 8.' : 'Coffee and tea throughout. Confirm final numbers 5 business days ahead.';
      }
      if (sp.stage === 'Enquiry') f.notes = sp.type === 'Wedding' ? 'Asked about Saturday availability and what the package includes.' : 'Looking for a quote and available dates.';
      return f;
    });
  });
  function addMin(t, m) { const p = String(t || '12:00').split(':'); let v = (+p[0]) * 60 + (+p[1] || 0) + m; v = Math.max(0, Math.min(23 * 60 + 59, v)); return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); }

  /* For the staff page (js/modules/functions.js) */
  Club.shared = Club.shared || {};
  Club.shared.functions = { STAGES, FLOW, COORDINATOR, ROOM_RATE, today, addDays, daysBetween, round2, totals, paid, pkgOf, defaultLines, makeQuote };
})();
