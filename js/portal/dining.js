/* Members' portal: Dining. Venues, table reservations, my reservations and menus.
   Writes diningReservations exactly as the staff Dining module does (js/modules/dining.js):
   same shape and id prefix, table auto-assigned with the staff table sizes and the 105 minute
   double-booking window, statuses confirmed / seated / completed / cancelled / no-show. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc;

  /* ---------------- Mirrors of the staff module's rules ---------------- */
  const SERVICES = {
    Breakfast: { hours: '7:00 to 10:30 AM', from: 7 * 60, to: 10 * 60 },
    Lunch: { hours: '11:30 AM to 3:00 PM', from: 11 * 60 + 30, to: 14 * 60 + 30 },
    Dinner: { hours: '5:30 to 9:30 PM', from: 17 * 60 + 30, to: 21 * 60 }
  };
  const SERVICE_ORDER = ['Breakfast', 'Lunch', 'Dinner'];
  const TABLES = {
    'Gallery Taphouse & Grill': [['M1', 2], ['M2', 2], ['M3', 2], ['M4', 2], ['M5', 2], ['M6', 4], ['M7', 4], ['M8', 4], ['M9', 4], ['M10', 6], ['M11', 6], ['M12', 6], ['M13', 10]],
    'Taphouse Bar': [['G1', 4], ['G2', 4], ['G3', 4], ['G4', 4], ['G5', 4], ['G6', 4], ['G7', 4], ['G8', 2], ['G9', 2], ['G10', 6], ['G11', 6], ['G12', 10]],
    'Patio': [['T1', 4], ['T2', 4], ['T3', 4], ['T4', 4], ['T5', 4], ['T6', 4], ['T7', 6], ['T8', 6], ['T9', 10]],
    'Banquet Hall': [['Library', 14], ['Cellar', 10]]
  };
  const ACTIVE = { confirmed: 1, seated: 1 };
  const CLASH_MIN = 105; /* staff conflictFor window */
  const OCCASIONS = ['', 'Birthday', 'Anniversary', 'Business dinner', 'Member-guest', 'Celebration', 'Private party'];
  /* Preferred order of the Gallery menu sections; any other section in menuItems follows in the order it appears. */
  const SECTIONS = ['Breakfast', 'Soup & salads', 'Sandwiches', 'Sides', 'Snacks & shares', 'Baskets & bowls', 'Handhelds', 'Main attractions', 'On tap'];
  function sectionsOf(items) {
    const seen = {}; const out = [];
    SECTIONS.concat(items.map(function (i) { return i.section; })).forEach(function (sec) {
      if (!sec || seen[sec]) return; seen[sec] = 1;
      if (items.some(function (i) { return i.section === sec; })) out.push(sec);
    });
    return out;
  }
  const DIET_LABEL = { GF: 'Gluten free', V: 'Vegetarian', VG: 'Vegan' };
  const STATUS = { confirmed: ['Confirmed', 'good'], seated: ['Seated', 'info'], completed: ['Dined', 'outline'], cancelled: ['Cancelled', 'bad'], 'no-show': ['Not attended', 'warn'] };

  /* ---------------- Portal presentation of the rooms ---------------- */
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  /* The Gallery is confirmed by the club's website; the Taphouse Bar and Patio names are interim, pending the club's
     confirmation. The Banquet Hall hosts weddings and special events and is arranged through the events team, not
     booked online (it stays here so existing reservations in it still display and modify correctly). */
  const DRESS = 'Golf casual';
  const VENUES = [
    {
      id: 'Gallery Taphouse & Grill', short: 'Gallery', min: 1, max: 10, book: true,
      line: 'On the second floor of the clubhouse, overlooking the 18th hole. A diverse menu in a casual, relaxing atmosphere, six local beers on tap and our famous Friday night pizza.',
      dress: DRESS,
      hours: 'Breakfast, lunch and dinner every day. Longer hours in golf season. Breakfast until 2:00 PM.',
      services: { Breakfast: ALL_DAYS, Lunch: ALL_DAYS, Dinner: ALL_DAYS }
    },
    {
      id: 'Taphouse Bar', short: 'Taphouse Bar', min: 1, max: 10, book: true,
      line: 'A relaxed spot for a pint from the local taps and something from the Gallery menu.',
      dress: DRESS,
      hours: 'For hours, call the club office at ' + Club.info.phone + '.', callForHours: true,
      services: { Lunch: ALL_DAYS, Dinner: ALL_DAYS }
    },
    {
      id: 'Patio', short: 'Patio', min: 1, max: 10, book: true,
      line: 'Outdoor tables at the clubhouse, for a casual meal in the warmer months.',
      dress: DRESS,
      hours: 'In golf season, weather permitting.',
      services: { Breakfast: ALL_DAYS, Lunch: ALL_DAYS, Dinner: ALL_DAYS }
    },
    {
      id: 'Banquet Hall', short: 'Banquet Hall', min: 6, max: 14, book: false,
      line: 'Weddings and special events, with all-inclusive packages and seating for up to 220 guests.',
      dress: 'As your host wishes',
      hours: 'Year-round, by arrangement with our events team.',
      services: { Dinner: ALL_DAYS }, slots: { Dinner: [18 * 60, 18 * 60 + 30, 19 * 60, 19 * 60 + 30, 20 * 60] }
    }
  ];
  const BOOKABLE = VENUES.filter(function (v) { return v.book; });

  /* ---------------- Helpers ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function fromMin(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function today() { return Club.date.today(); }
  function venueDef(id) { return VENUES.find(function (v) { return v.id === id; }) || VENUES[0]; }
  function tablesOf(venue) { return (TABLES[venue] || []).map(function (t) { return { id: t[0], seats: t[1] }; }).sort(function (a, b) { return a.seats - b.seats; }); }
  function serviceOf(t) { const m = toMin(t); return m < 11 * 60 ? 'Breakfast' : (m < 16 * 60 + 30 ? 'Lunch' : 'Dinner'); }
  function menuPrice(v) { return Math.round(v) === v ? F.money(v, false) : F.money(v); }
  function reservations() { return S.all('diningReservations'); }
  function badge(s) { const b = STATUS[s] || [s, 'plain']; return U.badge(b[0], b[1]); }
  function prefVenue(m) {
    const p = (m && m.preferences && m.preferences.dining) || '';
    if (BOOKABLE.some(function (v) { return v.id === p; })) return p;
    if (/bar|grill room/i.test(p)) return 'Taphouse Bar';
    if (/patio|terrace/i.test(p)) return 'Patio';
    return 'Gallery Taphouse & Grill';
  }
  /* Presentation helpers (copy only) */
  function telHref() { return 'tel:' + String(Club.info.phone).replace(/[^0-9+]/g, ''); }
  function telLink() { return '<a class="pd-tel" href="' + telHref() + '">' + esc(Club.info.phone) + '</a>'; }
  function people(n) { return n + (n === 1 ? ' guest' : ' guests'); }
  function dayShort(iso) { return F.toDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function isPast(r) { return r.date < today() || (r.date === today() && toMin(r.time) + 90 < nowMin()); }
  function isUpcoming(r) { return ACTIVE[r.status] && !isPast(r); }
  function canChange(r) { return r.status === 'confirmed' && (r.date > today() || (r.date === today() && toMin(r.time) > nowMin() + 60)); }

  /** Services the room offers on a date, with their seating times. */
  function servicesFor(venue, date) {
    const v = venueDef(venue); const dow = F.toDate(date).getDay();
    return SERVICE_ORDER.filter(function (s) { return v.services[s] && v.services[s].indexOf(dow) >= 0; }).map(function (s) {
      let slots = v.slots && v.slots[s];
      if (!slots) { slots = []; for (let m = SERVICES[s].from; m <= SERVICES[s].to; m += 30) slots.push(m); }
      return { id: s, hours: s === 'Dinner' && v.slots ? '6:00 to 9:30 PM' : SERVICES[s].hours, slots: slots.map(fromMin) };
    });
  }

  /**
   * Find a table the way the staff floor works: smallest table that seats the party, with no active
   * reservation on it within 105 minutes. Unassigned parties nearby are seated virtually first, so
   * the portal never promises a table the host stand cannot give.
   */
  function findTable(venue, date, time, party, excludeId, prefer) {
    const tables = tablesOf(venue); const t0 = toMin(time);
    const near = reservations().filter(function (r) {
      return r.id !== excludeId && r.date === date && r.venue === venue && ACTIVE[r.status] && Math.abs(toMin(r.time) - t0) < CLASH_MIN;
    });
    const busy = {};
    near.forEach(function (r) { if (r.table) busy[r.table] = 1; });
    near.filter(function (r) { return !r.table; }).sort(function (a, b) { return b.partySize - a.partySize; }).forEach(function (r) {
      const t = tables.find(function (x) { return !busy[x.id] && x.seats >= r.partySize; }); if (t) busy[t.id] = 1;
    });
    if (prefer && !busy[prefer]) { const p = tables.find(function (x) { return x.id === prefer; }); if (p && p.seats >= party) return p.id; }
    const t = tables.find(function (x) { return !busy[x.id] && x.seats >= party; });
    return t ? t.id : '';
  }
  function slotState(venue, date, time, party, excludeId) {
    if (date === today() && toMin(time) < nowMin() + 30) return 'past';
    return findTable(venue, date, time, party, excludeId) ? 'open' : 'full';
  }
  function memberClash(memberId, date, time, excludeId) {
    return reservations().find(function (r) { return r.id !== excludeId && r.memberId === memberId && r.date === date && ACTIVE[r.status] && Math.abs(toMin(r.time) - toMin(time)) < 120; }) || null;
  }

  /* ---------------- Calendar file ---------------- */
  function downloadIcs(o) {
    const esc2 = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
    const stamp = function (date, min) { min = Math.min(min, 23 * 60 + 59); return date.replace(/-/g, '') + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00'; };
    const now = new Date();
    const dtstamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    const start = toMin(o.time);
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + Club.info.name + '//Members//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + o.uid + '@stbonifacegolfclub.com', 'DTSTAMP:' + dtstamp, 'DTSTART:' + stamp(o.date, start), 'DTEND:' + stamp(o.date, start + (o.minutes || 120)),
      'SUMMARY:' + esc2(o.title), 'LOCATION:' + esc2(o.location), 'DESCRIPTION:' + esc2(o.description), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = o.file || 'stboniface.ics';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
      U.toast('Calendar invitation downloaded');
    } catch (e) { U.toast('Your browser could not create the calendar file', 'bad'); }
  }
  function icsFor(r) {
    downloadIcs({
      uid: r.id, date: r.date, time: r.time, minutes: r.venue === 'Banquet Hall' ? 180 : 120,
      title: r.venue + ' at ' + Club.info.short, location: r.venue + ', ' + Club.info.name + ', ' + Club.info.address,
      description: 'Table for ' + r.partySize + '. ' + (r.occasion ? r.occasion + '. ' : '') + 'Dress code: ' + venueDef(r.venue).dress.toLowerCase() + '. To change your reservation call ' + Club.info.phone + '.',
      file: 'stboniface-dining-' + r.date + '.ics'
    });
  }

  /* ---------------- Shared fragments ---------------- */
  function dateBlock(iso) {
    const d = F.toDate(iso);
    return '<div class="pd-dblock"><span class="pd-dblock-wd">' + esc(d.toLocaleDateString('en-US', { weekday: 'short' })) + '</span><span class="pd-dblock-n">' + d.getDate() + '</span><span class="pd-dblock-m">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></div>';
  }


  /* ---------------- Page ---------------- */
  let draft = null;
  let lastTab = 'reserve';
  /* One-line room notes for the venue sheet (the full descriptions stay on VENUES). */
  const SHORT_LINE = { 'Gallery Taphouse & Grill': 'Second floor, overlooking the 18th hole', 'Taphouse Bar': 'Local taps and the Gallery menu', 'Patio': 'Outdoor tables in the warmer months' };
  /* The menu section that opens first for each meal. */
  const MEAL_SECTION = { Breakfast: 'Breakfast', Lunch: 'Sandwiches', Dinner: 'Main attractions' };
  /* The time a member most likely wants, per meal (used to pre-scroll the chip row). */
  const LIKELY = { Breakfast: '08:30', Lunch: '12:30', Dinner: '19:00' };
  function mealNow() { const m = nowMin(); return m < 10 * 60 + 30 ? 'Breakfast' : (m < 15 * 60 ? 'Lunch' : 'Dinner'); }
  function venueShort(id) { return (venueDef(id) || {}).short || id; }
  function hoursToday(v) {
    const s = servicesFor(v.id, today()); if (!s.length) return 'Closed today';
    const first = SERVICES[s[0].id], last = SERVICES[s[s.length - 1].id];
    return 'Today ' + F.time(fromMin(first.from)) + ' to ' + F.time(fromMin(last.to + 30));
  }

  function render(view, params, member) {
    if (!draft || draft.memberId !== member.id) {
      const fav = member && member.preferences && member.preferences.dining;
      const lastVenue = Portal.prefs.get('diningVenue', null);
      const venue = fav ? prefVenue(member) : (BOOKABLE.some(function (v) { return v.id === lastVenue; }) ? lastVenue : prefVenue(member));
      draft = { memberId: member.id, venue: venue, date: today(), party: +Portal.prefs.get('diningParty', 2) || 2, meal: null, time: null, occasion: '', dietary: '', notes: '' };
    }
    /* A page left open overnight: yesterday's date (and its time) are no longer bookable, so start from today. */
    if (draft.date < today()) { draft.date = today(); draft.meal = null; draft.time = null; }
    let menuVenue = draft.menuVenue || 'Gallery Taphouse & Grill';
    const tabFromRoute = { reserve: 'reserve', reservations: 'mine', menus: 'menus' }[params[0]];
    const startTab = tabFromRoute || lastTab;

    function mine() { return reservations().filter(function (r) { return r.memberId === member.id; }); }
    /* The receipt for a past visit: the check closed to the member's account from that reservation (js/modules/dining.js) */
    function visitReceipts(r) {
      return S.where('diningOrders', function (o) { return o.reservationId === r.id; }).reduce(function (a, o) { return a.concat(Portal.receiptsFor('dining', o.id, member.id)); }, []);
    }
    function upcoming() { return mine().filter(isUpcoming).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }); }
    function nextRes() { return upcoming()[0] || null; }

    function heroHTML() {
      const n = nextRes();
      /* Several reservations on the next day: one card with a row for each (each row opens its reservation). */
      const day = n ? upcoming().filter(function (r) { return r.date === n.date; }) : [];
      if (day.length > 1) return '<section class="p-hero pd-hero" data-reveal><h1>Dining</h1>' +
        '<div class="pd-next-day"><p class="pd-next-day-h">' + Club.icon('dining') + '<span><span class="pd-next-k">Next</span> ' + esc(dayShort(n.date)) + ' · ' + day.length + ' reservations</span></p>' +
          day.map(function (r) { return '<button type="button" class="pd-next pd-next-row" data-res="' + esc(r.id) + '"><span class="pd-next-text">' + esc(F.time(r.time) + ' · ' + venueShort(r.venue) + ' · ' + people(r.partySize)) + '</span>' + Club.icon('chevronRight', 'pd-next-go') + '</button>'; }).join('') +
        '</div></section>';
      return '<section class="p-hero pd-hero" data-reveal><h1>Dining</h1>' +
        (n ? '<button type="button" class="pd-next" data-res="' + esc(n.id) + '">' + Club.icon('dining') +
          '<span class="pd-next-text"><span class="pd-next-k">Next</span> ' + esc(dayShort(n.date) + ' · ' + F.time(n.time) + ' · ' + venueShort(n.venue) + ' · ' + people(n.partySize)) + '</span>' +
          Club.icon('chevronRight', 'pd-next-go') + '</button>'
          : '<p class="pd-hero-line">Reserve a table, browse the menus and manage your bookings.</p>') +
        '</section>';
    }

    view.innerHTML = heroHTML() + '<div class="pd-tabs"></div>';
    const tabsApi = U.tabs(U.$('.pd-tabs', view), [
      { id: 'reserve', label: 'Reserve', render: drawReserve },
      { id: 'mine', label: 'My reservations', render: drawMine },
      { id: 'menus', label: 'Menus', render: drawMenus }
    ], startTab, function (id) { lastTab = id; if (id !== 'reserve') Portal.actionBar.hide(); });

    /** The number of upcoming reservations on the My reservations tab (hidden at 0), then the tab underline re-fitted. */
    function paintCount() {
      const tab = U.$('.pd-tabs .tab[data-tab="mine"]', view); if (!tab) return;
      const n = upcoming().length; let c = U.$('.pd-tab-n', tab);
      if (!n) { if (c) c.remove(); }
      else { if (!c) { c = document.createElement('span'); c.className = 'pd-tab-n'; tab.appendChild(c); } c.textContent = String(n); c.setAttribute('aria-label', n + ' upcoming'); }
      const a = U.$('.pd-tabs .tab.active', view), ink = U.$('.pd-tabs .tab-ink', view);
      if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = 'translateX(' + a.offsetLeft + 'px)'; }
    }
    paintCount();
    function refreshHero() {
      const h = U.$('.pd-hero', view); if (!h) return;
      const fresh = U.el(heroHTML()); fresh.classList.add('revealed'); h.replaceWith(fresh);
      paintCount();
    }
    function after() { refreshHero(); tabsApi.activate(lastTab); }
    U.on(view, 'click', '[data-res]', function (e, b) { const r = S.find('diningReservations', b.dataset.res); if (r) resSheet(r, { fromHero: b.classList.contains('pd-next') }); });

    /* ---------- Reservation detail sheet: View / Change / Calendar / Cancel ---------- */
    function resSheet(r, o) {
      o = o || {};
      const change = canChange(r);
      const v = venueDef(r.venue);
      const notes = [r.dietary, r.notes].filter(Boolean).join('. ');
      const sh = Portal.openSheet({
        title: r.venue,
        content: '<dl class="pd-kv">' +
          '<div><dt>When</dt><dd>' + esc(F.dateLong(r.date)) + ', ' + esc(F.time(r.time)) + '</dd></div>' +
          '<div><dt>Party</dt><dd>' + people(r.partySize) + '</dd></div>' +
          '<div><dt>Status</dt><dd>' + esc((STATUS[r.status] || [r.status])[0]) + '</dd></div>' +
          (r.occasion ? '<div><dt>Occasion</dt><dd>' + esc(r.occasion) + '</dd></div>' : '') +
          (notes ? '<div><dt>Notes</dt><dd>' + esc(notes) + '</dd></div>' : '') +
          '<div><dt>Dress code</dt><dd>' + esc(v.dress) + '</dd></div></dl>' +
          '<div class="pd-sheet-acts">' + (change ? U.btn('Change', { action: 'modify' }) : '') + U.btn('Add to calendar', { action: 'ics' }) +
          (change ? U.btn('Cancel reservation', { kind: 'danger', action: 'cancel' }) : '') + '</div>' +
          (change ? '' : '<p class="pd-sheet-note">To change this reservation, call ' + telLink() + '.</p>') +
          (o.fromHero ? '<button type="button" class="p-link pd-sheet-view" data-action="view">View all my reservations</button>' : '')
      });
      U.on(sh.body, 'click', '[data-action]', function (e, b) {
        const a = b.dataset.action;
        if (a === 'ics') { icsFor(S.find('diningReservations', r.id) || r); return; }
        sh.close();
        if (a === 'view') tabsApi.activate('mine');
        else if (a === 'modify') modify(S.find('diningReservations', r.id) || r);
        else if (a === 'cancel') cancel(S.find('diningReservations', r.id) || r);
      });
    }

    /* ---------- Reserve: one compact card ---------- */
    function drawReserve(panel) {
      lastTab = 'reserve';
      const days = []; for (let i = 0; i < 30; i++) days.push(Club.date.fromToday(i));
      const v0 = venueDef(draft.venue); draft.party = Math.max(v0.min, Math.min(v0.max, draft.party));
      panel.innerHTML = '<div class="p-cols pd-cols"><div class="pd-main"><div class="pd-card" data-reveal>' +
          '<div class="pd-where"></div>' +
          '<div class="pd-dp"></div>' +
          '<div class="pd-guests"><div class="pd-guests-ctl"></div><p class="pd-guests-note"></p></div>' +
          '<div class="pd-meal"></div>' +
          '<div class="pd-times" aria-live="polite"></div>' +
        '</div>' +
        Portal.accordion({ id: 'pd-extras', icon: 'edit', title: 'Occasion, allergies or requests', summary: 'Optional', body:
          '<form class="pd-details" novalidate><div class="pd-occ"></div>' +
          U.field({ label: 'Allergies or diet', name: 'dietary', value: draft.dietary, placeholder: 'For example: shellfish allergy', hint: 'The kitchen sees this with your reservation.' }) +
          U.field({ label: 'Special requests', name: 'notes', type: 'textarea', value: draft.notes, placeholder: 'A window table, a high chair, a birthday dessert' }) +
          '</form>' }) + '</div><aside class="pd-side" aria-label="About this place"></aside></div>';

      /* Side column on tablets and desktops: the chosen place, today's hours and a few dishes from the current meal */
      function drawSide() {
        const v = venueDef(draft.venue);
        const sec = MEAL_SECTION[draft.meal || mealNow()];
        const dishes = S.all('menuItems').filter(function (i) { return i.available !== false && i.section === sec; }).slice(0, 4);
        U.$('.pd-side', panel).innerHTML = '<div class="pd-side-card"><div class="eyebrow">About this place</div><h2>' + esc(v.id) + '</h2><p class="pd-side-line">' + esc(v.line) + '</p>' +
          '<ul class="pd-side-meta"><li>' + Club.icon('clock') + '<span>' + (v.callForHours ? 'For hours, call ' + telLink() : esc(hoursToday(v))) + '</span></li><li>' + Club.icon('user') + '<span>Dress code: ' + esc(v.dress.toLowerCase()) + '</span></li><li>' + Club.icon('phone') + '<span>' + telLink() + '</span></li></ul></div>' +
          (dishes.length ? '<div class="pd-side-card"><div class="pd-side-h"><h3>On the menu: ' + esc(sec.toLowerCase()) + '</h3><button type="button" class="p-link" data-action="to-menus">Full menu</button></div><ul class="pd-side-dishes">' + dishes.map(function (i) {
            return '<li><span>' + esc(i.name) + '</span><span class="pd-dish-price">' + esc(menuPrice(i.price)) + '</span></li>';
          }).join('') + '</ul></div>' : '');
      }
      U.on(panel, 'click', '[data-action=to-menus]', function () { tabsApi.activate('menus'); });

      /* Where */
      const venueRows = BOOKABLE.map(function (x) { return { value: x.id, label: x.id, sub: SHORT_LINE[x.id] + ' · ' + hoursToday(x) + ' · Dress code: ' + x.dress.toLowerCase() }; })
        .concat([{ value: '_banquet', label: 'Banquet Hall', sub: 'Events and weddings · call to book', href: Club.info.eventsWebsite || telHref() }]);
      const where = Portal.selectField(U.$('.pd-where', panel), { label: 'Where', title: 'Where would you like to sit?', rows: venueRows, value: draft.venue, icon: 'dining',
        onChange: function (val) { if (val === '_banquet') return; draft.venue = val; const vv = venueDef(val); draft.party = Math.max(vv.min, Math.min(vv.max, draft.party)); guests.update({ min: vv.min, max: vv.max, value: draft.party }); drawGuestsNote(); drawMeal(); refreshDays(); drawSide(); } });

      /* Date */
      function dayList() {
        const mineOn = {}; upcoming().forEach(function (r) { mineOn[r.date] = 1; });
        return days.map(function (d) {
          const svcs = servicesFor(draft.venue, d);
          if (!svcs.length) return { date: d, disabled: true, reason: 'Closed' };
          let open = 0, live = 0;
          svcs.forEach(function (sv) { sv.slots.forEach(function (t) { const st = slotState(draft.venue, d, t, draft.party); if (st !== 'past') live++; if (st === 'open') open++; }); });
          if (!open) return { date: d, disabled: true, reason: live ? 'Fully booked' : 'Finished for today' };
          return { date: d, meta: open + (open === 1 ? ' time' : ' times'), pill: mineOn[d] ? 'Your table' : '' };
        });
      }
      const firstDays = dayList();
      const cur = firstDays.find(function (x) { return x.date === draft.date; });
      if (draft.date === today() && cur && cur.disabled) { const nx = firstDays.find(function (x) { return !x.disabled; }); if (nx) draft.date = nx.date; }
      const dp = Portal.datePicker(U.$('.pd-dp', panel), { label: 'Date', title: 'Choose a date', value: draft.date, days: firstDays, onChange: function (iso) { draft.date = iso; drawMeal(); } });
      function refreshDays() { dp.update({ days: dayList(), value: draft.date }); }

      /* Guests */
      const guests = Portal.stepper(U.$('.pd-guests-ctl', panel), { label: 'Guests', value: draft.party, min: v0.min, max: v0.max,
        onChange: function (n) { draft.party = n; drawMeal(); refreshDays(); } });
      function drawGuestsNote() { U.$('.pd-guests-note', panel).innerHTML = 'Larger parties: call ' + telLink(); }
      drawGuestsNote();

      /* Meal + times */
      function drawMeal() {
        const svcs = servicesFor(draft.venue, draft.date);
        const host = U.$('.pd-meal', panel);
        if (!svcs.length) { host.innerHTML = ''; draft.meal = null; drawTimes(); return; }
        const ids = svcs.map(function (s) { return s.id; });
        if (!draft.meal || ids.indexOf(draft.meal) < 0) {
          const want = draft.date === today() ? mealNow() : 'Dinner';
          draft.meal = ids.indexOf(want) >= 0 ? want : ids[ids.length - 1];
          /* if that meal is over today, move to the next one still serving */
          if (draft.date === today()) { const live = svcs.filter(function (s) { return s.slots.some(function (t) { return slotState(draft.venue, draft.date, t, draft.party) !== 'past'; }); }).map(function (s) { return s.id; }); if (live.length && live.indexOf(draft.meal) < 0) draft.meal = live[0]; }
        }
        host.innerHTML = U.segmented(svcs.map(function (s) { return { value: s.id, label: s.id }; }), draft.meal, 'meal');
        U.$('.segmented', host).setAttribute('role', 'group'); U.$('.segmented', host).setAttribute('aria-label', 'Meal');
        drawTimes();
      }
      function drawTimes() {
        const host = U.$('.pd-times', panel);
        if (draft.time && slotState(draft.venue, draft.date, draft.time, draft.party) !== 'open') draft.time = null;
        const svc = servicesFor(draft.venue, draft.date).find(function (s) { return s.id === draft.meal; });
        if (draft.time && (!svc || svc.slots.indexOf(draft.time) < 0)) draft.time = null;
        if (!svc) { host.innerHTML = '<p class="pd-closed">The ' + esc(draft.venue) + ' is closed on this day. Please choose another date.</p>'; syncBar(); return; }
        const states = svc.slots.map(function (t) { return { t: t, st: slotState(draft.venue, draft.date, t, draft.party) }; }).filter(function (x) { return x.st !== 'past'; });
        const open = states.filter(function (x) { return x.st === 'open'; }).length;
        if (!states.length) host.innerHTML = '<p class="pd-closed">' + esc(svc.id) + ' has finished for today. Choose another meal or date.</p>';
        else host.innerHTML = '<div class="pd-times-head"><span class="pk-label">Time</span><span class="pd-times-n">' + esc(svc.hours) + ' · ' + open + ' open</span></div>' +
          '<div class="pd-chiprow" role="radiogroup" aria-label="' + esc(svc.id) + ' times">' + states.map(function (x) {
            const on = x.t === draft.time && x.st === 'open';
            return '<button type="button" class="pd-chip' + (on ? ' on' : '') + (x.st === 'full' ? ' full' : '') + '" data-time="' + x.t + '" role="radio" aria-checked="' + on + '"' + (x.st === 'full' ? ' disabled aria-label="' + esc(F.time(x.t)) + ', full"' : '') + '><span class="pd-chip-t">' + esc(F.time(x.t)) + '</span>' + (x.st === 'full' ? '<span class="pd-chip-s">Full</span>' : '') + '</button>';
          }).join('') + '</div>' +
          (open ? '' : '<p class="pd-svc-note">No tables left for ' + people(draft.party) + ' at ' + esc(svc.id.toLowerCase()) + '. Try another meal or date.</p>');
        /* pre-scroll the row to the selected or most likely time */
        const row = U.$('.pd-chiprow', host);
        if (row) {
          const target = draft.time || LIKELY[svc.id];
          const chips = U.$$('.pd-chip', row);
          let best = chips[0], bd = 1e9;
          chips.forEach(function (c) { const d = Math.abs(toMin(c.dataset.time) - toMin(target)); if (d < bd) { bd = d; best = c; } });
          if (best) row.scrollLeft = Math.max(0, best.offsetLeft - row.offsetLeft - (row.clientWidth - best.offsetWidth) / 2);
        }
        syncBar();
      }
      function summaryText() { return venueShort(draft.venue) + ' · ' + dayShort(draft.date) + ' · ' + F.time(draft.time) + ' · ' + people(draft.party); }
      function syncBar() {
        if (lastTab !== 'reserve') return;
        if (draft.time) Portal.actionBar.show({ summary: summaryText(), label: 'Reserve', onClick: confirmSheet });
        else Portal.actionBar.hide();
      }
      drawMeal(); drawSide();

      /* Extras */
      const occ = Portal.selectField(U.$('.pd-occ', panel), { label: 'Occasion', title: 'Occasion', value: draft.occasion,
        rows: OCCASIONS.map(function (o) { return { value: o, label: o || 'No special occasion' }; }),
        onChange: function (val) { draft.occasion = val; } });
      const form = U.$('.pd-details', panel);
      form.addEventListener('input', function () { const f = U.formData(form); draft.dietary = f.dietary || ''; draft.notes = f.notes || ''; });

      U.on(panel, 'click', '.segmented[data-name=meal] button', function (e, b) { draft.meal = b.dataset.value; U.$$('.segmented[data-name=meal] button', panel).forEach(function (x) { x.classList.toggle('active', x === b); }); drawTimes(); drawSide(); });
      U.on(panel, 'click', '.pd-chip', function (e, b) {
        if (b.disabled) return;
        draft.time = b.dataset.time;
        U.$$('.pd-chip', panel).forEach(function (x) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
        syncBar();
      });

      /* Reserve: a small confirm sheet, then the same checks and write as before */
      function confirmSheet() {
        const vv = venueDef(draft.venue);
        const sh = Portal.openSheet({
          title: 'Confirm your table',
          content: '<dl class="pd-kv">' +
            '<div><dt>Where</dt><dd>' + esc(vv.id) + '</dd></div>' +
            '<div><dt>When</dt><dd>' + esc(F.dateLong(draft.date)) + ', ' + esc(F.time(draft.time)) + '</dd></div>' +
            '<div><dt>Party</dt><dd>' + people(draft.party) + '</dd></div>' +
            (draft.occasion ? '<div><dt>Occasion</dt><dd>' + esc(draft.occasion) + '</dd></div>' : '') +
            '<div><dt>Dress code</dt><dd>' + esc(vv.dress) + '</dd></div></dl>' +
            '<p class="pd-sheet-note">Tables are held for 15 minutes. Meals can be charged to your member account.</p>' +
            '<div class="pd-sum-err" role="alert" hidden></div>',
          footer: '<button type="button" class="btn btn-primary" data-action="confirm">Confirm</button>'
        });
        U.$('[data-action=confirm]', sh.foot).addEventListener('click', function () {
          const r = reserve(function (msg) { const err = U.$('.pd-sum-err', sh.body); err.innerHTML = Club.icon('alert') + '<span>' + esc(msg) + '</span>'; err.hidden = false; U.toast(msg, 'bad'); });
          if (!r) return;
          Portal.actionBar.hide();
          sh.setContent('<div class="pd-done"><div class="pd-confirm-icon" aria-hidden="true">' + Club.icon('check') + '</div><h3>Your table is reserved</h3>' +
            '<p>' + esc(r.venue) + ' · ' + esc(F.dateLong(r.date)) + ', ' + esc(F.time(r.time)) + ' · ' + people(r.partySize) + '</p>' +
            '<p class="pd-sheet-note">You can change it under My reservations, or call ' + telLink() + '.</p></div>');
          sh.setFooter('<button type="button" class="btn btn-primary" data-action="ics">' + Club.icon('calendar') + '<span>Add to calendar</span></button><button type="button" class="p-link pd-done-x" data-action="done">Done</button>');
          U.$('[data-action=ics]', sh.foot).addEventListener('click', function () { icsFor(S.find('diningReservations', r.id) || r); });
          U.$('[data-action=done]', sh.foot).addEventListener('click', function () { sh.close(); });
          refreshHero(); drawReserve(panel);
        });
      }
    }

    /* Same checks, order and record as the previous flow. */
    function reserve(fail) {
      if (!draft.time) { fail('Please choose a time for your table.'); return null; }
      if (draft.date < today()) { fail('That date has passed. Please choose another day.'); return null; }
      if (String(draft.dietary || '').length > 160) { fail('Please keep dietary notes under 160 characters.'); return null; }
      if (String(draft.notes || '').length > 500) { fail('Please keep special requests under 500 characters.'); return null; }
      const m = Portal.member(); if (!m) return null;
      const clash = memberClash(m.id, draft.date, draft.time, null);
      if (clash) { fail('You already have a table at ' + F.time(clash.time) + ' in the ' + clash.venue + ' that day. Change it from My reservations.'); return null; }
      if (slotState(draft.venue, draft.date, draft.time, draft.party) !== 'open') { fail('That time has just been taken. Please choose another.'); return null; }
      const table = findTable(draft.venue, draft.date, draft.time, draft.party, null);
      const r = S.insert('diningReservations', {
        id: S.uid('dres'), status: 'confirmed', date: draft.date, time: draft.time, venue: draft.venue, partySize: draft.party,
        memberId: m.id, name: m.firstName + ' ' + m.lastName, table: table, occasion: draft.occasion, dietary: draft.dietary, notes: draft.notes
      });
      Portal.prefs.set('diningVenue', draft.venue); Portal.prefs.set('diningParty', draft.party);
      draft.time = null; draft.occasion = ''; draft.dietary = ''; draft.notes = '';
      U.toast('Your table is reserved');
      return r;
    }

    /* ---------- My reservations ---------- */
    function rowHTML(r) {
      return '<li><button type="button" class="pd-row" data-res="' + esc(r.id) + '">' + dateBlock(r.date) +
        '<span class="pd-row-main"><span class="pd-row-t">' + esc(F.time(r.time) + ' · ' + venueShort(r.venue)) + '</span>' +
        '<span class="pd-row-s">' + esc(people(r.partySize) + (r.occasion ? ' · ' + r.occasion : '')) + '</span></span>' +
        (r.status !== 'confirmed' ? badge(r.status) : '') + Club.icon('chevronRight', 'pd-row-go') + '</button></li>';
    }
    function drawMine(panel) {
      const list = mine();
      const up = upcoming();
      const past = list.filter(function (r) { return !isUpcoming(r); }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 12);
      panel.innerHTML = '<div class="p-cols pd-mine-cols"><div>' + (up.length ? '<ul class="p-list pd-res-list" data-reveal>' + up.slice(0, 5).map(rowHTML).join('') +
          (up.length > 5 ? '<li><button type="button" class="pd-row pd-row-all" data-action="all">View all upcoming (' + up.length + ')' + Club.icon('chevronRight', 'pd-row-go') + '</button></li>' : '') + '</ul>'
          : '<div class="panel pd-empty" data-reveal>' + U.empty({ icon: 'dining', title: 'No upcoming reservations', text: 'When you reserve a table, it appears here.', action: U.btn('Reserve a table', { kind: 'primary', action: 'go-reserve' }) }) + '</div>') +
        '</div><div class="pd-past">' + Portal.accordion({ id: 'pd-past', icon: 'clock', title: 'Past visits', summary: past.length ? past.length + (past.length === 1 ? ' visit' : ' visits') : 'None yet',
          body: past.length ? '<ul class="pd-past-list">' + past.map(function (r) {
            return '<li><span class="pd-past-main"><span class="pd-past-t">' + esc(r.venue) + '</span><span class="pd-past-s">' + esc(F.date(r.date) + ' at ' + F.time(r.time) + ' · ' + people(r.partySize)) + '</span>' +
              Portal.receiptLink(visitReceipts(r)) + '</span>' + badge(r.status === 'confirmed' || r.status === 'seated' ? 'completed' : r.status) + '</li>';
          }).join('') + '</ul>' : '<p class="muted">Your past visits will appear here.</p>' }) + '</div></div>';
      if (panel.dataset.wired) return; panel.dataset.wired = '1';
      U.on(panel, 'click', '[data-action]', function (e, b) {
        if (b.dataset.action === 'go-reserve') tabsApi.activate('reserve');
        else if (b.dataset.action === 'all') {
          Portal.openSheet({ title: 'Upcoming reservations', size: 'full',
            rows: upcoming().map(function (r) { return { value: r.id, label: dayShort(r.date) + ' · ' + F.time(r.time), sub: r.venue + ' · ' + people(r.partySize) }; }),
            onPick: function (id) { const r = S.find('diningReservations', id); if (r) resSheet(r); } });
        }
      });
    }

    function cancel(r) {
      U.confirm({ title: 'Cancel this reservation?', text: 'Your table for ' + people(r.partySize) + ' at the ' + r.venue + ' on ' + F.dateLong(r.date) + ' at ' + F.time(r.time) + ' will be released.', confirmLabel: 'Cancel reservation', danger: true }).then(function (ok) {
        if (!ok) return;
        const cur = S.find('diningReservations', r.id);
        if (!cur || !canChange(cur)) { U.toast('This reservation can no longer be changed online', 'bad'); after(); return; }
        S.update('diningReservations', r.id, { status: 'cancelled' });
        U.toast('Your reservation has been cancelled');
        after();
      });
    }

    /* Change party size or time: same checks and write as before, in a sheet. */
    function modify(r) {
      const vv = venueDef(r.venue);
      const st = { party: Math.max(vv.min, Math.min(vv.max, r.partySize)), time: r.time, meal: serviceOf(r.time) };
      const sh = Portal.openSheet({
        title: 'Change your table',
        content: '<p class="pd-mod-when">' + esc(F.dateLong(r.date)) + ' · ' + esc(r.venue) + '</p><div class="pd-mod-guests"></div><div class="pd-meal pd-mod-meal"></div><div class="pd-times pd-mod-times"></div><div class="pd-sum-err" role="alert" hidden></div>',
        footer: '<button type="button" class="btn btn-primary" data-action="save">Save changes</button>'
      });
      Portal.stepper(U.$('.pd-mod-guests', sh.body), { label: 'Guests', value: st.party, min: vv.min, max: vv.max, onChange: function (n) { st.party = n; draw(); } });
      function draw() {
        const svcs = servicesFor(r.venue, r.date);
        if (svcs.map(function (s) { return s.id; }).indexOf(st.meal) < 0 && svcs.length) st.meal = svcs[0].id;
        if (st.time && slotState(r.venue, r.date, st.time, st.party, r.id) !== 'open') st.time = null;
        U.$('.pd-mod-meal', sh.body).innerHTML = svcs.length > 1 ? '<span class="pk-label">Meal</span>' + U.segmented(svcs.map(function (s) { return { value: s.id, label: s.id }; }), st.meal, 'mmeal') : '';
        const svc = svcs.find(function (s) { return s.id === st.meal; });
        const states = svc ? svc.slots.map(function (t) { return { t: t, st: slotState(r.venue, r.date, t, st.party, r.id) }; }).filter(function (x) { return x.st !== 'past'; }) : [];
        U.$('.pd-mod-times', sh.body).innerHTML = states.length ? '<span class="pk-label">Time</span><div class="pd-chiprow" role="radiogroup" aria-label="Times">' + states.map(function (x) {
          const on = x.t === st.time && x.st === 'open';
          return '<button type="button" class="pd-chip' + (on ? ' on' : '') + (x.st === 'full' ? ' full' : '') + '" data-time="' + x.t + '" role="radio" aria-checked="' + on + '"' + (x.st === 'full' ? ' disabled' : '') + '><span class="pd-chip-t">' + esc(F.time(x.t)) + '</span>' + (x.st === 'full' ? '<span class="pd-chip-s">Full</span>' : '') + '</button>';
        }).join('') + '</div>' : '<p class="pd-closed">No times left for this meal.</p>';
        const row = U.$('.pd-mod-times .pd-chiprow', sh.body), on = row && U.$('.pd-chip.on', row);
        if (row && on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
      }
      draw();
      U.on(sh.body, 'click', '.segmented[data-name=mmeal] button', function (e, b) { st.meal = b.dataset.value; draw(); });
      U.on(sh.body, 'click', '.pd-chip', function (e, b) { if (b.disabled) return; st.time = b.dataset.time; U.$$('.pd-chip', sh.body).forEach(function (x) { const o = x === b; x.classList.toggle('on', o); x.setAttribute('aria-checked', o); }); });
      U.$('[data-action=save]', sh.foot).addEventListener('click', function () {
        const err = U.$('.pd-sum-err', sh.body);
        const show = function (msg) { err.innerHTML = Club.icon('alert') + '<span>' + esc(msg) + '</span>'; err.hidden = false; };
        const cur = S.find('diningReservations', r.id);
        if (!cur || !canChange(cur)) { show('This reservation can no longer be changed online. Please call ' + Club.info.phone + '.'); return; }
        if (!st.time) { show('Please choose a time.'); return; }
        if (st.time === cur.time && st.party === cur.partySize) { U.toast('No changes made'); sh.close(); return; }
        if (slotState(cur.venue, cur.date, st.time, st.party, cur.id) !== 'open') { show('There is no table for ' + people(st.party) + ' at ' + F.time(st.time) + '. Please choose another time.'); draw(); return; }
        const clash = memberClash(cur.memberId, cur.date, st.time, cur.id);
        if (clash) { show('You have another table at ' + F.time(clash.time) + ' that day.'); return; }
        const table = findTable(cur.venue, cur.date, st.time, st.party, cur.id, cur.table);
        S.update('diningReservations', cur.id, { partySize: st.party, time: st.time, table: table });
        U.toast('Your reservation has been updated');
        sh.close(); after();
      });
    }

    /* ---------- Menus: venue select, sections as accordions ---------- */
    function venueKnown(id) { return VENUES.some(function (v) { return v.id === id; }); }
    function drawMenus(panel) {
      const all = S.all('menuItems').filter(function (i) { return i.available !== false; });
      const specific = BOOKABLE.filter(function (x) { return all.some(function (i) { return i.venue === x.id; }); });
      if (!BOOKABLE.some(function (x) { return x.id === menuVenue; })) menuVenue = 'Gallery Taphouse & Grill';
      const items = all.filter(function (i) { return !i.venue || i.venue === 'All' || i.venue === menuVenue || !venueKnown(i.venue); });
      const v = venueDef(menuVenue);
      const gallery = !specific.length || v.id === 'Gallery Taphouse & Grill';
      const secs = sectionsOf(items);
      const want = MEAL_SECTION[mealNow()];
      const openSec = secs.indexOf(want) >= 0 ? want : secs[0];
      panel.innerHTML = '<div class="pd-menu-sel"></div>' +
        '<p class="pd-menu-note">' + (gallery && v.id !== 'Gallery Taphouse & Grill' ? 'The ' + esc(v.id) + ' serves the Gallery kitchen menu. ' : '') + 'Breakfast until 2:00 PM · pizza night every Friday.</p>' +
        (items.length ? '<div class="pd-menu-secs">' + secs.map(function (sec) {
          const list = items.filter(function (i) { return i.section === sec; });
          const from = Math.min.apply(null, list.map(function (i) { return +i.price || 0; }));
          return Portal.accordion({ id: 'pd-m-' + sec.replace(/[^a-z]/gi, ''), title: sec, summary: list.length + (list.length === 1 ? ' item' : ' items') + ' · from ' + menuPrice(from), open: sec === openSec,
            body: '<ul class="pd-dishes">' + list.map(function (i, k) {
              return '<li class="pd-dish"' + (sec === openSec && k >= 6 ? ' hidden data-more' : '') + '><div class="pd-dish-row"><span class="pd-dish-name">' + esc(i.name) + '</span><span class="pd-dish-price">' + esc(menuPrice(i.price)) + '</span></div>' +
                (i.description ? '<p class="pd-dish-desc">' + esc(i.description) + '</p>' : '') +
                ((i.dietary || []).length ? '<div class="pd-dish-tags">' + i.dietary.map(function (t) { return '<span class="pd-tag">' + esc(DIET_LABEL[t] || t) + '</span>'; }).join('') + '</div>' : '') + '</li>';
            }).join('') + '</ul>' + (sec === openSec && list.length > 6 ? '<button type="button" class="p-link pd-show-all" data-action="show-all">Show all (' + list.length + ')</button>' : '') });
        }).join('') + '</div>' : U.empty({ icon: 'chef', title: 'The menu is being updated', text: 'Please ask your server about today’s specials.' })) +
        '<p class="pd-menu-foot">Tell your server about any allergies. Prices in CAD, plus tax.</p>';
      if (!panel.dataset.menuWired) { panel.dataset.menuWired = '1'; U.on(panel, 'click', '[data-action=show-all]', function (e, btn) { U.$$('[data-more]', btn.parentElement).forEach(function (li) { li.hidden = false; }); btn.remove(); }); }
      Portal.selectField(U.$('.pd-menu-sel', panel), { title: 'Show the menu for', icon: 'chef', value: menuVenue,
        rows: BOOKABLE.map(function (x) { return { value: x.id, label: x.id }; }),
        onChange: function (val) { menuVenue = val; draft.menuVenue = val; drawMenus(panel); } });
      const menuBtn = U.$('.pd-menu-sel .pk-select', panel); if (menuBtn) menuBtn.setAttribute('aria-label', 'Menu for ' + menuVenue + '. Change place');
    }

    return function () { Portal.actionBar.hide(); };
  }

  Portal.register({ id: 'dining', label: 'Dining', icon: 'dining', order: 20, tab: true, render: render });
})();
