/* Dining & Banquets: reservations, floor plan, kitchen checks and the menu.
   Owns collections: diningReservations, menuItems, diningOrders. Bills members via Club.chargeMember.
   Undo (Club.undo, js/core/undo.js): every staff change offers Undo on its toast; closing a check is reversed with a charge
   reversal or credit receipt and the gift card amount put back. Steps back stay on the item: Unseat and Reopen on a
   reservation, Back to kitchen on a served check, Reopen on a check closed today (its payment reversed), Not cleared yet on
   a table marked cleared.
   Reservations tab (Nov 12 redesign): day strip with covers, service switch, Timeline (tables down the side, time across,
   bars as long as the 105-minute clash window, now line, covers arriving, a Needs a table lane) or List (by arrival time,
   one main action per row, the rest in a menu), search, and a side panel for the selected booking.
   Floor plan tab: the plan or a grid of tables with live states (free until, seated minutes, arriving within 30 min, late,
   needs clearing) and filter chips; the host stand beside it (Seat a walk-in, Arriving next, Seated now, table details).
   Needs clearing: completing a party today sets reservation.clearedAt = null; Mark table cleared sets it to the time. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, R = S.R, esc = U.esc;
  /* Data helpers shared with the members' portal and public site: js/shared/dining-data.js */
  const { GALLERY, BAR, PATIO, BANQUET, PLAN_VENUES, SERVICE_CHARGE, TABLES, r2, pad, toMin, fromMin, nowMin, serviceOf, today } = Club.shared.dining;

  const VENUES = [GALLERY, BAR, PATIO, BANQUET];
  const SERVICES = [
    { id: 'Breakfast', hours: 'Breakfast menu served until 2 PM' },
    { id: 'Lunch', hours: 'Lunch daily' },
    { id: 'Dinner', hours: 'Dinner daily, extended hours in golf season' }
  ];
  const SECTIONS = ['Breakfast', 'Soup & salads', 'Sandwiches', 'Sides', 'Snacks & shares', 'Baskets & bowls', 'Handhelds', 'Main attractions', 'On tap'];
  const DIETARY = ['GF', 'V', 'VG'];
  const DIET_LABEL = { GF: 'Gluten free', V: 'Vegetarian', VG: 'Vegan' };
  const OCCASIONS = ['', 'Birthday', 'Anniversary', 'Business meeting', 'Member-guest', 'Celebration', 'Private party'];
  const ORDER_BADGE = { open: ['Open', 'brass'], fired: ['Fired', 'warn'], served: ['Served', 'good'], closed: ['Closed', 'outline'] };
  function nowHM() { return fromMin(nowMin()); }
  function currentService() { return serviceOf(nowHM()); }
  function money(v) { return F.money(v); }
  function menuPrice(v) { return Math.round(v) === v ? F.money(v, false) : F.money(v); }
  function tableDef(venue, id) { return (TABLES[venue] || []).find(function (t) { return t.id === id; }) || null; }
  function tableLabel(venue, id) { if (!id) return 'Unassigned'; return venue === BANQUET ? id : 'Table ' + id; }
  const ACTIVE = { confirmed: 1, seated: 1 };

  /* ------------------------------------------------------------------
     Data helpers
     ------------------------------------------------------------------ */
  function reservations() { return S.all('diningReservations'); }
  function orders() { return S.all('diningOrders'); }
  function menu() { return S.all('menuItems'); }
  function dayRes(date) { return reservations().filter(function (r) { return r.date === date; }).sort(function (a, b) { return a.time.localeCompare(b.time) || a.name.localeCompare(b.name); }); }
  function openOrders() { return orders().filter(function (o) { return o.status !== 'closed'; }); }
  function orderFor(venue, table) { return openOrders().find(function (o) { return o.venue === venue && o.table === table && o.date === today(); }) || null; }
  function orderForRes(r) { return openOrders().find(function (o) { return o.reservationId === r.id; }) || (r.table && r.date === today() ? orderFor(r.venue, r.table) : null); }
  function nextOrderNo() { return orders().reduce(function (m, o) { return Math.max(m, o.number || 0); }, 1000) + 1; }
  /** Receipt lines (Club.receipts) for a check: dishes at tax-included unit prices that add up to exactly subtotal + tax
      (any cent of rounding goes on one unit), then the service charge, so the lines total the grand total. */
  function checkLines(items, t) {
    const target = r2(t.subtotal + t.tax), f = t.subtotal ? target / t.subtotal : 1;
    const out = (items || []).map(function (l) { return { name: l.name, qty: l.qty, price: r2(l.price * f) }; });
    const diff = r2(target - out.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    if (diff && out.length) {
      const one = out.find(function (l) { return l.qty === 1; });
      if (one) one.price = r2(one.price + diff);
      else { const last = out[out.length - 1]; last.qty--; out.push({ name: last.name, qty: 1, price: r2(last.price + diff) }); }
    }
    if (t.service) out.push({ name: 'Service charge ' + F.pct(SERVICE_CHARGE * 100), qty: 1, price: t.service });
    return out;
  }
  function orderTotals(o) {
    const subtotal = r2((o.items || []).reduce(function (a, i) { return a + i.qty * i.price; }, 0));
    const service = r2(subtotal * SERVICE_CHARGE), tax = r2(subtotal * Club.taxRate());
    return { subtotal: subtotal, service: service, tax: tax, grand: r2(subtotal + service + tax) };
  }
  function covers(list) { return list.reduce(function (a, r) { return a + (+r.partySize || 0); }, 0); }
  function live(r) { return r.status !== 'cancelled' && r.status !== 'no-show'; }
  function whoSub(r) {
    const m = r.memberId ? Club.members.get(r.memberId) : null;
    if (m) return 'Member #' + esc(m.memberNo);
    return r.memberId ? 'Member no longer on file' : 'Guest';
  }
  function fieldError(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); f.focus();
  }
  function clearErrors(form) { U.$$('.field-error', form).forEach(function (e) { e.remove(); }); U.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }
  function conflictFor(r, excludeId) {
    if (!r.table) return null;
    return reservations().find(function (x) {
      /* Banquet Hall rooms are let for the whole day, so any other booking of the room that day clashes. */
      return x.id !== excludeId && x.date === r.date && x.venue === r.venue && x.table === r.table && ACTIVE[x.status] &&
        (r.venue === BANQUET || Math.abs(toMin(x.time) - toMin(r.time)) < 105);
    }) || null;
  }
  /** A wedding or event (Weddings & Events) with a deposit paid or confirmed that holds this Banquet Hall room that day. */
  function functionFor(r) {
    if (r.venue !== BANQUET || !r.table) return null;
    const space = r.table === 'Meeting room' ? 'Meeting room' : 'Banquet Hall';
    return S.where('functions', function (f) { return f.date === r.date && f.space === space && ['Deposit paid', 'Confirmed', 'Completed'].indexOf(f.stage) >= 0; })[0] || null;
  }
  function timeOptions(sel) {
    const out = []; for (let m = 7 * 60; m <= 21 * 60 + 30; m += 15) out.push({ value: fromMin(m), label: F.time(fromMin(m)) });
    if (sel && !out.some(function (o) { return o.value === sel; })) out.unshift({ value: sel, label: F.time(sel) });
    return U.options(out, sel);
  }
  function tableOptions(venue, sel) {
    return '<option value="">Unassigned</option>' + (TABLES[venue] || []).map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(tableLabel(venue, t.id)) + ' · seats ' + t.seats + '</option>';
    }).join('');
  }
  function ageText(ms) {
    const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60);
    if (m >= 60) return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
    return m + ':' + pad(s % 60);
  }

  /* ------------------------------------------------------------------
     State and page refresh
     ------------------------------------------------------------------ */
  const state = { tab: 'reservations', date: null, room: GALLERY, service: null, resService: null, menuOpen: null, menuQ: '', orderVenue: 'All', menuVenue: 'All', focusOrder: null };
  let redraw = function () { }, statsHost = null, tabsApi = null;
  function refresh() { drawStats(false); try { redraw(); } catch (e) { console.error(e); } }

  function drawStats(animate) {
    if (!statsHost) return;
    const t = dayRes(today()).filter(live);
    const tonight = t.filter(function (r) { return serviceOf(r.time) === 'Dinner'; });
    const since = Club.date.fromToday(-29);
    const closed = orders().filter(function (o) { return o.status === 'closed' && o.date >= since; });
    const avg = closed.length ? closed.reduce(function (a, o) { return a + (o.grandTotal || o.total || 0); }, 0) / closed.length : 0;
    const perCover = closed.length ? closed.reduce(function (a, o) { return a + (o.total || 0); }, 0) / Math.max(1, closed.reduce(function (a, o) { return a + (o.covers || 1); }, 0)) : 0;
    const open = openOrders(); const fired = open.filter(function (o) { return o.status === 'fired'; }).length;
    /* One summary line under the title (it replaced four stat boxes; the numbers are the same). */
    const dot = '<span class="dn-dot" aria-hidden="true">·</span>';
    statsHost.innerHTML = '<span><b>' + tonight.length + '</b> ' + (tonight.length === 1 ? 'party' : 'parties') + ', <b>' + F.num(covers(tonight)) + '</b> covers for dinner</span>' + dot +
      '<span><b>' + t.length + '</b> ' + (t.length === 1 ? 'party' : 'parties') + ', <b>' + F.num(covers(t)) + '</b> covers today</span>' + dot +
      '<span><b>' + open.length + '</b> open ' + (open.length === 1 ? 'check' : 'checks') + ', ' + fired + ' with the kitchen</span><span class="dn-dot dn-wide" aria-hidden="true">·</span>' +
      '<span class="dn-wide">Average check <b>' + F.money0(avg) + '</b>, ' + F.money0(perCover) + ' per cover (30 days)</span>';
    /* Open checks on the Orders tab */
    const tab = document.querySelector('.dn-tabs .tab[data-tab="orders"]');
    if (tab) {
      let n = tab.querySelector('.dn-tab-n'); if (!n) { n = document.createElement('span'); n.className = 'dn-tab-n'; tab.appendChild(n); }
      n.textContent = open.length; n.hidden = !open.length;
      const act = document.querySelector('.dn-tabs .tab.active'), ink = document.querySelector('.dn-tabs .tab-ink');
      if (act && ink) { ink.style.width = act.offsetWidth + 'px'; ink.style.transform = 'translateX(' + act.offsetLeft + 'px)'; }
    }
  }

  /* ------------------------------------------------------------------
     Reservation actions
     ------------------------------------------------------------------ */
  async function setStatus(r, status) {
    if (status === 'cancelled' || status === 'no-show') {
      const ok = await U.confirm({ title: status === 'cancelled' ? 'Cancel reservation?' : 'Mark as no-show?', text: r.name + ', party of ' + r.partySize + ' at ' + F.time(r.time) + ' on ' + F.dateShort(r.date) + '.', confirmLabel: status === 'cancelled' ? 'Cancel reservation' : 'Mark no-show', danger: true });
      if (!ok) return false;
    }
    if (status === 'seated' && r.table) {
      const c = reservations().find(function (x) { return x.id !== r.id && x.status === 'seated' && x.date === r.date && x.venue === r.venue && x.table === r.table; });
      if (c) { U.toast(tableLabel(r.venue, r.table) + ' is occupied by ' + c.name + '. Complete that party first.', 'bad'); return false; }
    }
    /* Steps back (corrections): seated to confirmed (Unseat) while no check is open for the party; completed to seated (Reopen). */
    const unseat = status === 'confirmed' && r.status === 'seated', reopen = status === 'seated' && r.status === 'completed';
    if (unseat) { const o = orderForRes(r); if (o && o.reservationId === r.id) { U.toast('Check No. ' + o.number + ' is open for this party. Close or void it first.', 'bad'); return false; } }
    /* Completing a party with its check still open would hand that check to the next party seated at the table. */
    if (status === 'completed' && r.status === 'seated') { const o = orderForRes(r); if (o) { U.toast('Check No. ' + o.number + ' is still open for this table. Close or void it first.', 'bad'); return false; } }
    const from = r.status;
    const patch = { status: status };
    if (status === 'seated' && !reopen) patch.seatedAt = new Date().toISOString();
    if (unseat) patch.seatedAt = null;
    /* A party completed today leaves its table on the floor plan flagged until someone marks it cleared. */
    const flag = status === 'completed' && clearsTable(r);
    if (flag) patch.clearedAt = null;
    Club.undo.run(function () { S.update('diningReservations', r.id, patch); }, {
      message: unseat ? r.name + ' unseated, back to confirmed' : reopen ? r.name + ' reopened, seated again' : flag ? r.name + ' completed. ' + tableLabel(r.venue, r.table) + ' needs clearing' : ({ seated: 'Party seated', completed: 'Reservation completed', cancelled: 'Reservation cancelled', 'no-show': 'Marked as no-show', confirmed: 'Reservation reinstated' }[status] || 'Reservation updated'),
      after: refresh, undone: r.name + ' is back to ' + (RES_LABEL[from] || from) });
    refresh();
    return true;
  }
  const RES_LABEL = { confirmed: 'confirmed', seated: 'seated', completed: 'completed', cancelled: 'cancelled', 'no-show': 'no-show' };

  function reservationModal(r, preset) {
    const isNew = !r;
    const d = Object.assign({ date: state.date || today(), time: '19:00', venue: GALLERY, partySize: 2, memberId: '', name: '', table: '', occasion: '', notes: '', dietary: '' }, r || {}, preset || {});
    let who = d.memberId || (isNew && !d.name) ? 'member' : 'guest';
    const body = '<form class="form-grid dn-res-form" novalidate>' +
      '<div class="field span-2"><label>Booking for</label>' + U.segmented([{ value: 'member', label: 'Member' }, { value: 'guest', label: 'Guest' }], who, 'who') + '</div>' +
      '<div class="field span-2 dn-who-member"><label for="dn-mem">Member</label><select class="select" id="dn-mem" name="memberId"><option value="">Select a member</option>' + Club.members.options(d.memberId) + '</select></div>' +
      '<div class="field span-2 dn-who-guest"><label for="dn-guest">Guest name</label><input class="input" id="dn-guest" name="guestName" value="' + esc(d.memberId ? '' : d.name) + '" placeholder="Laurent party"><span class="field-hint">Non-member parties are billed by card.</span></div>' +
      U.field({ label: 'Date', name: 'date', type: 'date', value: d.date, required: true }) +
      U.field({ label: 'Time', name: 'time', type: 'select', options: timeOptions(d.time), required: true }) +
      U.field({ label: 'Venue', name: 'venue', type: 'select', options: U.options(VENUES, d.venue) }) +
      U.field({ label: 'Party size', name: 'partySize', type: 'number', value: d.partySize, required: true, min: 1, max: 220, step: 1 }) +
      U.field({ label: 'Table', name: 'table', type: 'select', options: tableOptions(d.venue, d.table) }) +
      U.field({ label: 'Occasion', name: 'occasion', type: 'select', options: U.options(OCCASIONS.map(function (o) { return { value: o, label: o || 'None' }; }), d.occasion) }) +
      U.field({ label: 'Dietary requirements', name: 'dietary', value: d.dietary, span2: true, placeholder: 'Shellfish allergy, gluten free' }) +
      U.field({ label: 'Notes', name: 'notes', type: 'textarea', value: d.notes, span2: true, placeholder: 'Seating preferences, window table, celebrations' }) +
      '</form>';
    const m = U.modal({
      eyebrow: isNew ? 'Dining reservations' : F.dateLong(d.date), title: isNew ? 'New reservation' : 'Edit reservation', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Book table' : 'Save reservation', kind: 'primary', onClick: function (api) {
            const form = U.$('form', api.body); clearErrors(form);
            if (!U.validate(form)) return false;
            const f = U.formData(form);
            let name = '', memberId = null;
            if (who === 'member') {
              const mem = f.memberId && Club.members.get(f.memberId);
              if (!mem) { fieldError(form, 'memberId', 'Choose the member hosting this reservation.'); return false; }
              memberId = mem.id; name = mem.firstName + ' ' + mem.lastName;
            } else {
              if (!f.guestName) { fieldError(form, 'guestName', 'Enter the name the party will give on arrival.'); return false; }
              name = f.guestName;
            }
            if (!(f.partySize >= 1) || Math.floor(f.partySize) !== f.partySize) { fieldError(form, 'partySize', 'Enter a party size of at least 1.'); return false; }
            const t = f.table ? tableDef(f.venue, f.table) : null;
            if (t && f.partySize > t.seats) { fieldError(form, 'table', tableLabel(f.venue, t.id) + ' seats ' + t.seats + '. Choose a larger table or leave it unassigned.'); return false; }
            const doc = { date: f.date, time: f.time, venue: f.venue, partySize: f.partySize, memberId: memberId, name: name, table: f.table, occasion: f.occasion, dietary: f.dietary, notes: f.notes };
            const clash = conflictFor(doc, r && r.id);
            if (clash) { fieldError(form, 'table', tableLabel(f.venue, f.table) + ' is held for ' + clash.name + ' at ' + F.time(clash.time) + '.'); return false; }
            const fn = functionFor(doc);
            if (fn) { fieldError(form, 'table', tableLabel(f.venue, f.table) + ' is booked that day for ' + fn.name + ' (Weddings & Events).'); return false; }
            Club.undo.run(function () { if (isNew) S.insert('diningReservations', Object.assign({ id: S.uid('dres'), status: d.status || 'confirmed' }, doc)); else S.update('diningReservations', r.id, doc); },
              { message: isNew ? 'Reservation booked for ' + name : 'Reservation saved', after: refresh, undone: isNew ? 'Reservation for ' + name + ' removed' : 'Changes to the reservation undone' });
            if (isNew && f.date !== state.date && state.tab === 'reservations') state.date = f.date;
            refresh();
          }
        }
      ]
    });
    const form = U.$('form', m.body);
    function applyWho() {
      U.$('.dn-who-member', form).style.display = who === 'member' ? '' : 'none';
      U.$('.dn-who-guest', form).style.display = who === 'guest' ? '' : 'none';
    }
    U.on(form, 'click', '.segmented button', function (e, b) { who = b.dataset.value; U.$$('.segmented button', form).forEach(function (x) { x.classList.toggle('active', x === b); }); applyWho(); });
    U.$('[name=venue]', form).addEventListener('change', function (e) { U.$('[name=table]', form).innerHTML = tableOptions(e.target.value, ''); });
    applyWho();
  }

  /* ------------------------------------------------------------------
     Checks (orders)
     ------------------------------------------------------------------ */
  function openCheck(o) {
    const existing = o.table ? orderFor(o.venue, o.table) : null;
    if (existing) return existing;
    return S.insert('diningOrders', {
      id: S.uid('dord'), number: nextOrderNo(), date: today(), time: nowHM(), venue: o.venue, table: o.table || '',
      memberId: o.memberId || null, name: o.name || (o.memberId ? Club.members.name(o.memberId) : 'Guest'), covers: o.covers || 1,
      reservationId: o.reservationId || null, items: [], total: 0, status: 'open', openedAt: new Date().toISOString(), firedAt: null, servedAt: null
    });
  }
  function goToCheck(order, addItems) {
    state.focusOrder = order.id;
    state.orderVenue = 'All';
    if (tabsApi) tabsApi.activate('orders');
    if (addItems) setTimeout(function () { const o = S.find('diningOrders', order.id); if (o) addItemsModal(o); }, 120);
  }

  function newCheckModal(preset) {
    preset = preset || {};
    let venue = preset.venue || BAR;
    function tableOpts(v, sel) {
      return '<option value="">Bar or counter</option>' + (TABLES[v] || []).map(function (t) {
        const busy = orderFor(v, t.id);
        return '<option value="' + esc(t.id) + '"' + (busy ? ' disabled' : '') + (t.id === sel ? ' selected' : '') + '>' + esc(tableLabel(v, t.id)) + ' · seats ' + t.seats + (busy ? ' · check open' : '') + '</option>';
      }).join('');
    }
    const body = '<form class="form-grid" novalidate>' +
      U.field({ label: 'Venue', name: 'venue', type: 'select', options: U.options(VENUES, venue) }) +
      U.field({ label: 'Table', name: 'table', type: 'select', options: tableOpts(venue, preset.table) }) +
      '<div class="field span-2"><label for="dn-nc-mem">Member</label><select class="select" id="dn-nc-mem" name="memberId"><option value="">Guest or walk-in</option>' + Club.members.options(preset.memberId || '') + '</select></div>' +
      U.field({ label: 'Guest name', name: 'name', value: preset.memberId ? '' : (preset.name || ''), placeholder: 'Used when no member is selected' }) +
      U.field({ label: 'Covers', name: 'covers', type: 'number', value: preset.covers || 2, required: true, min: 1, max: 40, step: 1 }) +
      '</form>';
    const m = U.modal({
      eyebrow: 'Orders', title: 'Open a check', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Open check', kind: 'primary', onClick: function (api) {
            const form = U.$('form', api.body); clearErrors(form);
            if (!U.validate(form)) return false;
            const f = U.formData(form);
            if (!(f.covers >= 1)) { fieldError(form, 'covers', 'Enter at least one cover.'); return false; }
            if (f.table && orderFor(f.venue, f.table)) { fieldError(form, 'table', 'This table already has an open check.'); return false; }
            const seatedRes = f.table ? reservations().find(function (r) { return r.date === today() && r.venue === f.venue && r.table === f.table && r.status === 'seated'; }) : null;
            const o = Club.undo.run(function () { return openCheck({ venue: f.venue, table: f.table, memberId: f.memberId || (seatedRes && seatedRes.memberId) || null, name: f.memberId ? Club.members.name(f.memberId) : (f.name || (seatedRes ? seatedRes.name : 'Walk-in')), covers: f.covers, reservationId: seatedRes ? seatedRes.id : null }); },
              { message: function (c) { return 'Check opened for ' + (c.table ? tableLabel(c.venue, c.table) : c.venue); }, after: refresh, undone: 'Check removed' });
            goToCheck(o, true);
          }
        }
      ]
    });
    U.$('[name=venue]', m.body).addEventListener('change', function (e) { U.$('[name=table]', m.body).innerHTML = tableOpts(e.target.value, ''); });
  }

  function addItemsModal(order) {
    const pending = {};
    const avail = menu().filter(function (i) { return i.venue === 'All' || i.venue === order.venue; });
    const body = '<div class="dn-add">' +
      '<label class="dn-search">' + Club.icon('search') + '<input class="input" type="search" placeholder="Search the menu" aria-label="Search the menu"></label>' +
      '<div class="dn-add-list"></div></div>';
    const m = U.modal({
      eyebrow: (order.table ? tableLabel(order.venue, order.table) : order.venue) + ' · Check No. ' + order.number, title: 'Add to check', size: 'lg', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Add to check', kind: 'primary', icon: 'plus', onClick: function () {
            const ids = Object.keys(pending).filter(function (k) { return pending[k] > 0; });
            if (!ids.length) { U.toast('Choose at least one item', 'bad'); return false; }
            const cur = S.find('diningOrders', order.id); if (!cur) return;
            const items = cur.items.slice();
            ids.forEach(function (id) {
              const mi = S.find('menuItems', id); if (!mi) return;
              const at = items.findIndex(function (l) { return l.menuItemId === id && !l.fired; });
              /* A new line object, never the stored one: changing it in place would also change the copy Undo restores. */
              if (at >= 0) items[at] = Object.assign({}, items[at], { qty: items[at].qty + pending[id] });
              else items.push({ menuItemId: id, name: mi.name, qty: pending[id], price: mi.price, fired: false });
            });
            const n = ids.reduce(function (a, k) { return a + pending[k]; }, 0);
            /* A check already with the kitchen stays there (with its timer); the new items wait to be fired. */
            Club.undo.run(function () { S.update('diningOrders', order.id, { items: items, total: r2(items.reduce(function (a, l) { return a + l.qty * l.price; }, 0)), status: cur.status === 'fired' ? 'fired' : 'open' }); },
              { message: n + (n === 1 ? ' item' : ' items') + ' added to check No. ' + order.number, after: refresh, undone: 'Items taken off check No. ' + order.number });
            refresh();
          }
        }
      ]
    });
    const list = U.$('.dn-add-list', m.body), q = U.$('input', m.body);
    function draw() {
      const s = q.value.toLowerCase().trim();
      list.innerHTML = SECTIONS.map(function (sec) {
        const items = avail.filter(function (i) { return i.section === sec && (!s || (i.name + ' ' + i.description).toLowerCase().indexOf(s) >= 0); });
        if (!items.length) return '';
        return '<div class="dn-add-sec"><div class="label-caps">' + esc(sec) + '</div>' + items.map(function (i) {
          const n = pending[i.id] || 0;
          return '<div class="dn-add-row' + (i.available ? '' : ' off') + (n ? ' picked' : '') + '"><div class="dn-add-main"><div class="dn-add-name">' + esc(i.name) + (i.dietary || []).map(function (t) { return ' <span class="dn-tag">' + t + '</span>'; }).join('') + '</div><div class="person-sub">' + esc(i.description) + '</div></div>' +
            '<span class="dn-add-price num">' + money(i.price) + '</span>' +
            (i.available ? '<div class="dn-stepper"><button type="button" data-dec="' + i.id + '" aria-label="Remove one ' + esc(i.name) + '"' + (n ? '' : ' disabled') + '>&minus;</button><span>' + n + '</span><button type="button" data-inc="' + i.id + '" aria-label="Add one ' + esc(i.name) + '">+</button></div>' : U.badge('86', 'bad')) +
            '</div>';
        }).join('') + '</div>';
      }).join('') || U.empty({ icon: 'search', title: 'No dishes found', text: 'Nothing on the ' + order.venue + ' menu matches that search.' });
      const n = Object.keys(pending).reduce(function (a, k) { return a + pending[k]; }, 0);
      const btn = U.$$('.modal-foot .btn', m.el).pop(); if (btn) U.$('span', btn).textContent = n ? 'Add ' + n + (n === 1 ? ' item' : ' items') : 'Add to check';
    }
    U.on(list, 'click', '[data-inc]', function (e, b) { pending[b.dataset.inc] = (pending[b.dataset.inc] || 0) + 1; draw(); });
    U.on(list, 'click', '[data-dec]', function (e, b) { pending[b.dataset.dec] = Math.max(0, (pending[b.dataset.dec] || 0) - 1); draw(); });
    q.addEventListener('input', draw);
    draw();
  }

  function fireOrder(o) {
    const items = o.items.map(function (l) { return Object.assign({}, l, { fired: true }); });
    if (!o.items.some(function (l) { return !l.fired; })) { U.toast('Nothing new to fire', 'bad'); return; }
    /* Firing more items onto a check the kitchen is already cooking keeps the original fire time, so the ticket keeps its age. */
    const firedAt = o.status === 'fired' && o.firedAt ? o.firedAt : new Date().toISOString();
    Club.undo.run(function () { S.update('diningOrders', o.id, { items: items, status: 'fired', firedAt: firedAt, servedAt: null }); },
      { message: 'Check No. ' + o.number + ' fired to the kitchen', after: refresh, undone: 'Check No. ' + o.number + ' is back to ' + o.status });
    refresh();
  }
  function serveOrder(o) {
    Club.undo.run(function () { S.update('diningOrders', o.id, { status: 'served', servedAt: new Date().toISOString() }); },
      { message: 'Check No. ' + o.number + ' marked served', after: refresh, undone: 'Check No. ' + o.number + ' is back with the kitchen' });
    refresh();
  }
  /** Step back: a served check goes back to the kitchen (marked served by mistake). */
  function unserveOrder(o) {
    Club.undo.run(function () { S.update('diningOrders', o.id, { status: 'fired', servedAt: null }); },
      { message: 'Check No. ' + o.number + ' is back with the kitchen', after: refresh, undone: 'Check No. ' + o.number + ' marked served again' });
    refresh();
  }
  async function removeLine(o, idx) {
    const items = o.items.slice(); const l = items[idx]; if (!l || l.fired) return;
    items.splice(idx, 1);
    Club.undo.run(function () { S.update('diningOrders', o.id, { items: items, total: r2(items.reduce(function (a, x) { return a + x.qty * x.price; }, 0)), status: items.some(function (x) { return !x.fired; }) ? 'open' : (o.firedAt ? (o.servedAt ? 'served' : 'fired') : 'open') }); },
      { message: l.name + ' removed', after: refresh, undone: l.name + ' is back on check No. ' + o.number });
    refresh();
  }
  async function voidOrder(o) {
    const ok = await U.confirm({ title: 'Void this check?', text: 'Check No. ' + o.number + ' has no items and will be removed.', confirmLabel: 'Void check', danger: true });
    if (!ok) return;
    Club.undo.run(function () { S.remove('diningOrders', o.id); }, { message: 'Check No. ' + o.number + ' voided', after: refresh, undone: 'Check No. ' + o.number + ' restored' });
    refresh();
  }
  /** Step back for a closed check (a correction after it was settled): the money it took is reversed exactly (the account
      charge gets a reversal with a credit receipt, a card or gift card receipt gets a credit receipt, the gift card amount
      goes back on the card), the check returns to the kitchen state it closed from, and a reservation the close completed
      is seated again. Nothing is deleted. */
  function reopenCheck(o) {
    const cur = S.find('diningOrders', o.id); if (!cur || cur.status !== 'closed') return;
    if (Club.accounting && Club.accounting.isClosed && Club.accounting.isClosed(today())) { U.toast('Today is closed in Accounting. Reopen the day to reopen this check.', 'bad'); return; }
    const other = cur.table ? orderFor(cur.venue, cur.table) : null;
    if (other) { U.toast(tableLabel(cur.venue, cur.table) + ' has check No. ' + other.number + ' open. Close it before reopening this one.', 'bad'); return; }
    const grand = cur.grandTotal || cur.total || 0;
    const how = [cur.giftAmount > 0 ? money(cur.giftAmount) + ' back on the gift card' : '', cur.payment === 'Member account' ? 'the account charge credited' : cur.payment === 'Card' ? 'a credit receipt for the card payment (refund the card on the terminal)' : ''].filter(Boolean).join(' and ');
    U.confirm({ title: 'Reopen check No. ' + cur.number + '?', text: 'The ' + money(grand) + ' it was settled for is reversed' + (how ? ': ' + how : '') + '. The check opens again so you can change it and close it.', confirmLabel: 'Reopen check' }).then(function (ok) {
      if (!ok) return;
      Club.undo.run(function () {
        const title = 'Check No. ' + cur.number + ' reopened';
        const reversed = {};
        S.where('charges', function (c) { return c.source === 'dining' && c.refId === cur.id && c.amount > 0 && !c.reversedBy; })
          .forEach(function (c) { if (Club.undo.reverseCharge(c.id, { title: title })) reversed[c.id] = 1; });
        S.where('receipts', function (r) { return r.source === 'dining' && r.refId === cur.id && r.kind !== 'credit' && !r.reversedBy && !(r.chargeId && reversed[r.chargeId]); })
          .forEach(function (r) { Club.undo.creditReceipt(r.id, { title: title }); });
        if (cur.giftCardId && cur.giftAmount > 0 && Club.giftcards) Club.giftcards.refund(cur.giftCardId, cur.giftAmount, { where: 'dining', refId: cur.id, note: title });
        S.update('diningOrders', cur.id, { status: cur.servedAt ? 'served' : 'fired', payment: null, closedAt: null, giftCardId: null, giftAmount: 0, service: null, tax: null, grandTotal: null });
        const r = cur.reservationId ? S.find('diningReservations', cur.reservationId) : null;
        if (r && r.status === 'completed') S.update('diningReservations', r.id, { status: 'seated' });
      }, { message: 'Check No. ' + cur.number + ' reopened. ' + money(grand) + ' reversed', after: refresh, undone: 'Check No. ' + cur.number + ' closed again' });
      refresh();
    });
  }
  function closeModal(o) {
    if (!o.items.length) { voidOrder(o); return; }
    if (o.items.some(function (l) { return !l.fired; })) { U.toast('Fire or remove the new items before closing', 'bad'); return; }
    const t = orderTotals(o);
    let tender = o.memberId ? 'Member account' : 'Card';
    let gift = null;   /* a gift card applied to the check (Club.giftcards, js/core/giftcards.js) */
    const body = '<div class="dn-close"><dl class="dn-close-totals">' +
      '<dt>Food and beverage</dt><dd>' + money(t.subtotal) + '</dd><dt>Service charge ' + F.pct(SERVICE_CHARGE * 100) + '</dt><dd>' + money(t.service) + '</dd>' +
      '<dt>Tax (GST 5% + PST 7%)</dt><dd>' + money(t.tax) + '</dd><dt class="dn-grand">Total</dt><dd class="dn-grand">' + money(t.grand) + '</dd></dl>' +
      (Club.giftcards ? '<div class="dn-close-gift">' + Club.giftcards.tillHTML(null, t.grand) + '</div>' : '') +
      '<form novalidate><div class="field"><label>Settle to</label>' + U.segmented([{ value: 'Member account', label: 'Member account' }, { value: 'Card', label: 'Card' }], tender, 'tender') + '</div>' +
      '<div class="field dn-close-mem"><label for="dn-close-mem">Member</label><select class="select" id="dn-close-mem" name="memberId"><option value="">Select a member</option>' + Club.members.options(o.memberId || '') + '</select></div>' +
      '<p class="dn-close-card">Run the card on the terminal and close once approved.</p></form></div>';
    const m = U.modal({
      eyebrow: (o.table ? tableLabel(o.venue, o.table) : o.venue) + ' · Check No. ' + o.number, title: 'Close check', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Close check', kind: 'primary', icon: 'check', onClick: function (api) {
            const form = U.$('form', api.body); clearErrors(form);
            const cur = S.find('diningOrders', o.id); if (!cur) return;
            let memberId = null;
            const g = Club.giftcards ? Club.giftcards.tillState(gift, orderTotals(cur).grand) : null, gc = g && g.amount > 0 ? g : null;
            if (gc && gc.covers) tender = 'Gift card';
            if (tender === 'Member account') {
              const id = U.$('[name=memberId]', form).value; const mem = id && Club.members.get(id);
              if (!mem) { fieldError(form, 'memberId', 'Choose the member to charge.'); return false; }
              if (mem.status === 'suspended' || mem.status === 'resigned') { fieldError(form, 'memberId', 'This member cannot charge to their account. Settle by card.'); return false; }
              /* Credit policy: charging is suspended 60 days after a statement date unless staff allow it today (with a reason). */
              if (Club.billing && Club.billing.staffChargeGuard && !Club.billing.staffChargeGuard(mem.id, function () { const b = U.$('.modal-foot .btn-primary', api.el); if (b && document.contains(b)) b.click(); })) return false;
              memberId = mem.id;
            }
            const tt = orderTotals(cur);
            const due = gc ? gc.due : tt.grand;
            /* Every write of the close is recorded, so the toast's Undo reverses it (charge reversal or credit receipt, gift card amount back). */
            const rec = Club.undo.track(function () {
            S.update('diningOrders', o.id, { status: 'closed', payment: tender, memberId: memberId || cur.memberId, service: tt.service, tax: tt.tax, total: tt.subtotal, grandTotal: tt.grand, closedAt: new Date().toISOString(),
              giftCardId: gc ? gc.card.id : null, giftAmount: gc ? gc.amount : 0 });
            const rcTitle = o.venue + ' · Check No. ' + o.number, rcLines = checkLines(cur.items, tt);
            if (gc) Club.giftcards.redeem(gc.card.id, gc.amount, { where: 'dining', refId: o.id, note: 'Check No. ' + o.number });
            if (gc && (memberId || cur.memberId)) {
              /* One receipt naming the gift card and whatever paid the rest; the account is charged only the rest. */
              const ch = memberId && due > 0 ? Club.chargeMember(memberId, { description: o.venue + (o.table ? ', ' + tableLabel(o.venue, o.table) : '') + ' · Check No. ' + o.number + ' · ' + (o.covers || 1) + (o.covers === 1 ? ' cover' : ' covers'), category: 'Dining', amount: due, source: 'dining', refId: o.id, gratuity: Math.min(due, tt.service), noReceipt: true }) : null;
              Club.giftcards.receipt({ memberId: memberId || cur.memberId, title: rcTitle, lines: rcLines, total: tt.grand, gift: gc, rest: { method: memberId ? 'account' : 'card', label: 'card', amount: due }, source: 'dining', refId: o.id, chargeId: ch ? ch.id : null, channel: 'counter' });
            } else if (memberId) {
              const ch = Club.chargeMember(memberId, { description: o.venue + (o.table ? ', ' + tableLabel(o.venue, o.table) : '') + ' · Check No. ' + o.number + ' · ' + (o.covers || 1) + (o.covers === 1 ? ' cover' : ' covers'), category: 'Dining', amount: tt.grand, source: 'dining', refId: o.id,
                title: rcTitle, lines: rcLines });
              /* Tender and channel for the daily close (js/modules/accounting.js). */
              const arc = ch && Club.receipts ? S.all('receipts').find(function (r) { return r.chargeId === ch.id; }) : null;
              if (arc && !arc.tenders) S.update('receipts', arc.id, { tenders: [{ method: 'account', amount: Math.abs(+ch.amount || 0) }], channel: 'counter' });
            } else if (gc) {
              /* A guest's check paid partly or fully by gift card, the rest by card on the terminal: a receipt kept for the daily close. */
              try { Club.giftcards.receipt({ name: cur.name || 'Guest', title: rcTitle, lines: rcLines, total: tt.grand, gift: gc, rest: { method: 'card', label: 'Card', amount: due }, source: 'dining', refId: o.id, channel: 'counter' }); }
              catch (e) { console.error('Receipt failed for check ' + o.id, e); }
            } else if (Club.receipts && tt.grand > 0) {
              /* Settled by card on the terminal (the card itself is not recorded). A member's receipt goes to them; a guest's is kept for the daily close. */
              try { Club.receipts.create({ memberId: cur.memberId || null, name: cur.memberId ? undefined : (cur.name || 'Guest'), title: rcTitle, lines: rcLines, total: tt.grand, method: 'card', methodLabel: 'Card', source: 'dining', refId: o.id,
                tenders: [{ method: 'card', amount: tt.grand }], channel: 'counter' }); }
              catch (e) { console.error('Receipt failed for check ' + o.id, e); }
            }
            const r = cur.reservationId ? S.find('diningReservations', cur.reservationId) : null;
            if (r && r.status === 'seated') S.update('diningReservations', r.id, clearsTable(r) ? { status: 'completed', clearedAt: null } : { status: 'completed' });
            });
            Club.undo.offer(gc && gc.covers ? 'Check No. ' + o.number + ' paid by gift card' : memberId ? 'Check No. ' + o.number + ' closed to member account' : 'Check No. ' + o.number + ' closed to card', rec,
              { after: refresh, undone: 'Check No. ' + o.number + ' is open again' + (!memberId && due > 0 ? '. Refund the card on the terminal' : '') });
            refresh();
          }
        }
      ]
    });
    function apply() { U.$('.dn-close-mem', m.body).style.display = tender === 'Member account' ? '' : 'none'; U.$('.dn-close-card', m.body).style.display = tender === 'Card' ? '' : 'none'; }
    function drawGift() { const h = U.$('.dn-close-gift', m.body); if (h) h.innerHTML = Club.giftcards.tillHTML(gift, t.grand); }
    U.on(m.body, 'click', '[data-gc-till]', function (e, b) {
      if (b.dataset.gcTill === 'remove') { gift = null; drawGift(); return; }
      Club.giftcards.tillApply({ total: t.grand, onApply: function (g) { gift = g; drawGift(); } });
    });
    U.on(m.body, 'click', '.segmented button', function (e, b) { tender = b.dataset.value; U.$$('.segmented button', m.body).forEach(function (x) { x.classList.toggle('active', x === b); }); apply(); });
    apply();
  }

  /* ------------------------------------------------------------------
     Shared by Reservations and Floor plan: the live clock, service windows, table chips, the date picker,
     reservation actions (one main action, the rest in a menu) and assigning a table.
     ------------------------------------------------------------------ */
  const TURN = 105;   /* minutes a booking holds its table: the clash window in conflictFor */
  const WIN = { Breakfast: [7 * 60, 11 * 60], Lunch: [11 * 60, 16 * 60 + 30], Dinner: [17 * 60, 22 * 60 + 30], All: [7 * 60, 22 * 60 + 30] };
  const SHORT = {}; SHORT[GALLERY] = 'The Gallery'; SHORT[BAR] = 'Taphouse Bar'; SHORT[PATIO] = 'Patio'; SHORT[BANQUET] = 'Banquet Hall';
  function short(v) { return SHORT[v] || v; }
  /** 20:15 -> 8:15p, 20:00 -> 8p (labels inside tables and bars) */
  function tShort(hm) { const m = toMin(hm), h = Math.floor(m / 60) % 12 || 12, mm = m % 60; return h + (mm ? ':' + pad(mm) : '') + (m >= 720 ? 'p' : 'a'); }
  /** minutes -> 25m, 1h 20m */
  function dur(m) { m = Math.max(0, Math.round(m)); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : ''); }
  function isoMin(iso) { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); }
  function isPhone() { return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches); }
  function byTime(a, b) { return a.time.localeCompare(b.time) || a.name.localeCompare(b.name); }
  /** Minutes a party has been seated (seeded parties have no seat time: their booking time stands in). */
  function seatedMins(r) { return r.seatedAt ? Math.max(0, Math.round((Date.now() - new Date(r.seatedAt).getTime()) / 60000)) : Math.max(0, nowMin() - toMin(r.time)); }
  /** Needs clearing: completing a party today sets clearedAt to null (Mark table cleared fills it in). Older records have
      no clearedAt at all and count as cleared. */
  function needsClear(r) { return r.status === 'completed' && r.clearedAt === null && !!r.table && r.date === today(); }
  function clearsTable(r) { return !!r.table && PLAN_VENUES.indexOf(r.venue) >= 0 && r.date === today(); }
  function tchip(id, none) { return '<span class="dn-tchip' + (none ? ' none' : '') + '">' + esc(id) + '</span>'; }
  function flagsHTML(r) {
    return (r.occasion ? '<span class="dn-flag">' + esc(r.occasion) + '</span>' : '') + (r.dietary ? '<span class="dn-flag diet">' + esc(r.dietary) + '</span>' : '') +
      (r.notes ? '<span class="dn-flag" title="' + esc(r.notes) + '">' + esc(r.notes) + '</span>' : '');
  }
  function quarterNow() { return fromMin(Math.ceil(nowMin() / 15) * 15); }

  /* The kit's date picker, mounted out of sight and opened by a calendar button (covers booked per day in the list). */
  function dateDays() {
    const t = today();
    let from = Club.date.addDays(t, -14), to = Club.date.addDays(t, 45);
    if (state.date < from) from = Club.date.addDays(state.date, -7);
    if (state.date > to) to = Club.date.addDays(state.date, 7);
    const byDay = {};
    reservations().forEach(function (r) { if (r.date >= from && r.date <= to && live(r)) byDay[r.date] = (byDay[r.date] || 0) + (+r.partySize || 0); });
    const out = [];
    for (let d = from; d <= to; d = Club.date.addDays(d, 1)) out.push({ date: d, meta: byDay[d] ? F.num(byDay[d]) + ' covers' : 'No bookings' });
    return out;
  }
  function mountDate(root, onChange) {
    const host = root.querySelector('.dn-dp-host'); if (!host || !window.Portal || !Portal.datePicker) return null;
    return Portal.datePicker(host, { label: 'Date', title: 'Choose a date', value: state.date, days: dateDays(), onChange: function (iso) { state.date = iso; onChange(); } });
  }

  /** Every action a reservation offers, in order; main marks the one shown on its own. */
  function resActs(r) {
    const o = orderForRes(r), out = [], id = ' data-id="' + r.id + '"';
    function A(key, label, attr, x) { out.push(Object.assign({ key: key, label: label, attr: attr }, x || {})); }
    if (r.status === 'confirmed') {
      A('seat', 'Seat', 'data-res-act="seated"' + id, { main: true, long: r.table ? 'Seat now' : 'Seat without table' });
      A('noshow', 'No-show', 'data-res-act="no-show"' + id);
      A('cancel', 'Cancel', 'data-res-act="cancelled"' + id, { danger: true });
    } else if (r.status === 'seated') {
      A('complete', 'Complete', 'data-res-act="completed"' + id, { main: true });
      if (o) A('check', 'View check', 'data-view-check="' + o.id + '"', { icon: 'billing' });
      else if (r.date === today()) A('check', 'Open check', 'data-open-check="' + r.id + '"', { icon: 'billing' });
      if (!(o && o.reservationId === r.id)) A('unseat', 'Unseat', 'data-res-act="confirmed"' + id, { title: 'Seated by mistake: back to confirmed' });
    } else if (r.status === 'completed') {
      A('reopen', 'Reopen', 'data-res-act="seated"' + id, { main: true, quiet: true, title: 'Completed by mistake: seat the party again' });
      if (needsClear(r)) A('cleared', 'Mark table cleared', 'data-cleared="' + esc(r.venue + '|' + r.table) + '"', { icon: 'check' });
    } else {
      A('reinstate', 'Reinstate', 'data-res-act="confirmed"' + id, { main: true, quiet: true });
    }
    A('edit', 'Edit reservation', 'data-edit-res="' + r.id + '"', { icon: 'edit' });
    return out;
  }
  /** Buttons for a side panel: the main action, the others, the edit pencil last. */
  function actButtons(r, sm) {
    const s = sm ? ' btn-sm' : '';
    return '<div class="dn-acts">' + resActs(r).map(function (a) {
      if (a.key === 'edit') return '<button type="button" class="btn btn-icon' + s + '" ' + a.attr + ' title="Edit reservation" aria-label="Edit reservation for ' + esc(r.name) + '">' + Club.icon('edit') + '</button>';
      return '<button type="button" class="btn' + (a.main && !a.quiet ? ' btn-primary' : '') + s + '" ' + a.attr + (a.title ? ' title="' + esc(a.title) + '"' : '') + '>' + (a.icon ? Club.icon(a.icon) : '') + '<span>' + esc(a.long || a.label) + '</span></button>';
    }).join('') + '</div>';
  }
  /** "..." button; the menu itself is built when it opens (openMenu). skip: the action already shown beside it. */
  function moreBtn(r, skip) {
    return '<span class="dn-more"><button type="button" class="btn btn-ghost btn-sm btn-icon" data-more="' + r.id + '" data-skip="' + (skip || '') + '" aria-haspopup="true" aria-expanded="false" title="More actions" aria-label="More actions for ' + esc(r.name) + '">' + Club.icon('more') + '</button></span>';
  }
  let menuCloser = null;
  function closeMenus() {
    U.$$('.dn-menu').forEach(function (m) { const b = m.parentElement && m.parentElement.querySelector('[data-more]'); if (b) b.setAttribute('aria-expanded', 'false'); m.remove(); });
    if (menuCloser) { document.removeEventListener('click', menuCloser, true); document.removeEventListener('keydown', menuCloser, true); menuCloser = null; }
  }
  function openMenu(btn) {
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';
    closeMenus(); if (wasOpen) return;
    const r = S.find('diningReservations', btn.dataset.more); if (!r) return;
    const items = resActs(r).filter(function (a) { return a.key !== btn.dataset.skip; });
    btn.insertAdjacentHTML('afterend', '<div class="dn-menu" role="menu">' + items.map(function (a) {
      return '<button type="button" role="menuitem" class="dn-menu-item' + (a.danger ? ' danger' : '') + '" ' + a.attr + '>' + (a.icon ? Club.icon(a.icon) : '<i></i>') + '<span>' + esc(a.long && a.key !== 'seat' ? a.long : a.label) + '</span></button>';
    }).join('') + '</div>');
    btn.setAttribute('aria-expanded', 'true');
    const m = btn.nextElementSibling;
    const box = m.getBoundingClientRect();
    if (box.bottom > (window.innerHeight || 800) - 8 && box.height < btn.getBoundingClientRect().top - 70) m.classList.add('up');
    const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true });
    menuCloser = function (e) {
      if (e.type === 'keydown') {
        if (e.key === 'Escape') { e.preventDefault(); closeMenus(); btn.focus(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const list = U.$$('button', m), i = list.indexOf(document.activeElement);
          if (i >= 0 || list.length) { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus(); }
        }
        return;
      }
      if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeMenus();
      else if (m.contains(e.target)) setTimeout(closeMenus, 0);
    };
    document.addEventListener('click', menuCloser, true); document.addEventListener('keydown', menuCloser, true);
  }

  /** Put an unassigned (or moved) booking on a table: seats, the 105-minute clash and the Banquet Hall holds are checked. */
  function assignTable(r, tid) {
    const t = tableDef(r.venue, tid); if (!t) return false;
    if (r.partySize > t.seats) { U.toast(tableLabel(r.venue, tid) + ' seats ' + t.seats + '. Choose a larger table.', 'bad'); return false; }
    const c = conflictFor(Object.assign({}, r, { table: tid }), r.id);
    if (c) { U.toast(tableLabel(r.venue, tid) + ' is held for ' + c.name + ' at ' + F.time(c.time), 'bad'); return false; }
    const fn = functionFor(Object.assign({}, r, { table: tid }));
    if (fn) { U.toast(tableLabel(r.venue, tid) + ' is booked that day for ' + fn.name + ' (Weddings & Events)', 'bad'); return false; }
    Club.undo.run(function () { S.update('diningReservations', r.id, { table: tid }); }, { message: r.name + ' assigned to ' + tableLabel(r.venue, tid), after: refresh, undone: r.name + (r.table ? ' is back at ' + tableLabel(r.venue, r.table) : ' has no table again') });
    refresh();
    return true;
  }
  /** Tables in the booking's venue that seat the party and are free at its time, smallest first. */
  function freeTablesFor(r) {
    return (TABLES[r.venue] || []).filter(function (t) {
      const x = Object.assign({}, r, { table: t.id });
      return t.seats >= r.partySize && !conflictFor(x, r.id) && !functionFor(x);
    }).sort(function (a, b) { return a.seats - b.seats; });
  }
  /** Mark a table cleared (every party completed there today and not yet cleared). */
  function markCleared(venue, tid) {
    const dirty = reservations().filter(function (r) { return r.venue === venue && r.table === tid && needsClear(r); });
    if (!dirty.length) return;
    const at = new Date().toISOString();
    Club.undo.run(function () { dirty.forEach(function (r) { S.update('diningReservations', r.id, { clearedAt: at }); }); },
      { message: tableLabel(venue, tid) + ' cleared and free', after: refresh, undone: tableLabel(venue, tid) + ' needs clearing again' });
    refresh();
  }
  /** Step back: a table marked cleared by mistake needs clearing again. */
  function markUncleared(r) {
    Club.undo.run(function () { S.update('diningReservations', r.id, { clearedAt: null }); },
      { message: tableLabel(r.venue, r.table) + ' needs clearing again', after: refresh, undone: tableLabel(r.venue, r.table) + ' cleared again' });
    refresh();
  }
  function wireShared(root) {
    wireResActions(root);
    U.on(root, 'click', '[data-more]', function (e, b) { e.stopPropagation(); openMenu(b); });
    U.on(root, 'click', '[data-cleared]', function (e, b) { const p = b.dataset.cleared.split('|'); markCleared(p[0], p[1]); });
    U.on(root, 'click', '[data-uncleared]', function (e, b) { const r = S.find('diningReservations', b.dataset.uncleared); if (r) markUncleared(r); });
    U.on(root, 'click', '[data-assign-to]', function (e, b) { const r = S.find('diningReservations', b.dataset.id); if (r) assignTable(r, b.dataset.assignTo); });
    U.on(root, 'click', '[data-close-check]', function (e, b) { const o = S.find('diningOrders', b.dataset.closeCheck); if (o) closeModal(o); });
  }

  function wireResActions(root) {
    U.on(root, 'click', '[data-res-act]', function (e, b) { const r = S.find('diningReservations', b.dataset.id); if (r) setStatus(r, b.dataset.resAct); });
    U.on(root, 'click', '[data-edit-res]', function (e, b) { const r = S.find('diningReservations', b.dataset.editRes); if (r) reservationModal(r); });
    U.on(root, 'click', '[data-view-check]', function (e, b) { const o = S.find('diningOrders', b.dataset.viewCheck); if (o) goToCheck(o, false); });
    U.on(root, 'click', '[data-open-check]', function (e, b) {
      const r = S.find('diningReservations', b.dataset.openCheck); if (!r) return;
      const o = Club.undo.run(function () { return openCheck({ venue: r.venue, table: r.table, memberId: r.memberId, name: r.name, covers: r.partySize, reservationId: r.id }); },
        { message: 'Check opened for ' + (r.table ? tableLabel(r.venue, r.table) : r.name), after: refresh, undone: 'Check removed' });
      goToCheck(o, true);
    });
  }

  /* ------------------------------------------------------------------
     Reservations tab: a day strip, the service switch, Timeline (tables down the side, time across) or List,
     search, and a side panel for the selected booking.
     ------------------------------------------------------------------ */
  /** Where a booking stands right now: late and due soon only today, unas = confirmed without a table. */
  function liveState(r) {
    if (!live(r)) return 'cancelled';
    if (r.status === 'confirmed') {
      if (!r.table) return 'unas';
      if (r.date === today()) { const d = toMin(r.time) - nowMin(); if (d < 0) return 'late'; if (d <= 30) return 'soon'; }
      return 'confirmed';
    }
    return r.status;
  }
  function liveBadge(r) {
    const s = liveState(r), d = toMin(r.time) - nowMin();
    const m = { confirmed: ['Confirmed', 'info'], seated: ['Seated', 'good'], completed: ['Completed', 'outline'], cancelled: [r.status === 'no-show' ? 'No-show' : 'Cancelled', 'bad'],
      late: ['Late ' + dur(-d), 'bad'], soon: [d <= 0 ? 'Due now' : 'Due in ' + dur(d), 'warn'], unas: ['Needs table', 'warn'] }[s];
    return U.badge(m[0], m[1]);
  }
  function matches(r, q) {
    if (!q) return true;
    const m = r.memberId ? Club.members.get(r.memberId) : null;
    return (r.name + ' ' + (m ? m.memberNo : '') + ' ' + (r.table || '') + ' ' + (r.notes || '') + ' ' + (r.dietary || '') + ' ' + (r.occasion || '')).toLowerCase().indexOf(q) >= 0;
  }
  function renderReservations(panel) {
    panel.innerHTML = '<div class="dn-res-root"></div>';
    const root = U.$('.dn-res-root', panel);
    const rs = state.rs || (state.rs = { view: null, sel: null, q: '', showGone: false, strip: null, open: null });
    let dp = null;
    function pick() { return state.resService || state.service || currentService(); }
    function inSvc(r) { const p = pick(); return p === 'All' || serviceOf(r.time) === p; }
    function view() { return rs.view || (isPhone() ? 'list' : 'timeline'); }

    function dayStrip() {
      if (!rs.strip || state.date < rs.strip || state.date > Club.date.addDays(rs.strip, 8)) rs.strip = Club.date.addDays(state.date, state.date === today() ? -2 : -3);
      const days = []; for (let i = 0; i < 9; i++) days.push(Club.date.addDays(rs.strip, i));
      const by = {}; reservations().forEach(function (r) { if (r.date >= days[0] && r.date <= days[8] && live(r)) by[r.date] = (by[r.date] || 0) + (+r.partySize || 0); });
      const max = Math.max.apply(null, days.map(function (d) { return by[d] || 0; }).concat([1]));
      return '<div class="dn-days"><button type="button" class="btn btn-ghost btn-icon btn-sm dn-days-step" data-strip="-7" aria-label="Earlier days" title="Earlier days">' + Club.icon('chevronLeft') + '</button>' +
        '<div class="dn-day-strip" role="group" aria-label="Day">' + days.map(function (d) {
          const c = by[d] || 0, on = d === state.date, t = d === today();
          return '<button type="button" class="dn-day' + (on ? ' on' : '') + (t ? ' today' : '') + '" data-date="' + d + '" aria-pressed="' + on + '"><span class="d-wd">' + (t ? 'Today' : esc(F.weekday(d))) + '</span><span class="d-n">' + esc(F.dateShort(d)) + '</span><span class="d-c">' + (c ? F.num(c) + ' covers' : 'No bookings') + '</span><span class="d-bar" style="width:' + Math.round(c / max * 100) + '%"></span></button>';
        }).join('') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm dn-days-step" data-strip="7" aria-label="Later days" title="Later days">' + Club.icon('chevronRight') + '</button>' +
        '<button type="button" class="btn btn-sm btn-icon dn-cal" data-cal title="Pick a date" aria-label="Pick a date">' + Club.icon('calendar') + '</button><div class="dn-dp-host" hidden></div></div>';
    }
    function toolbar(list) {
      const p = pick(), v = view();
      const seg = [{ id: 'All', label: 'All day' }].concat(SERVICES.map(function (s) { return { id: s.id, label: s.id }; })).map(function (o) {
        const l = list.filter(function (r) { return live(r) && (o.id === 'All' || serviceOf(r.time) === o.id); });
        return '<button type="button" role="tab" data-svc="' + o.id + '" aria-selected="' + (p === o.id) + '" class="' + (p === o.id ? 'active' : '') + '">' + (o.id === 'All' ? 'All<span class="dn-sm-hide"> day</span>' : esc(o.label)) + ' <span class="dn-seg-n">' + covers(l) + '</span></button>';
      }).join('');
      return '<div class="dn-rs-bar"><div class="segmented dn-svc-switch" role="tablist" aria-label="Service">' + seg + '</div><span class="dn-spacer"></span>' +
        '<label class="dn-find">' + Club.icon('search') + '<input class="input" type="search" name="dnq" placeholder="Find a booking" aria-label="Find a booking" value="' + esc(rs.q) + '" autocomplete="off"></label>' +
        '<button type="button" class="btn btn-primary btn-icon dn-ph-new" data-action="hdr-res" aria-label="New reservation" title="New reservation">' + Club.icon('plus') + '</button>' +
        '<div class="segmented dn-view-switch" role="group" aria-label="View"><button type="button" data-rview="timeline" class="' + (v === 'timeline' ? 'active' : '') + '" aria-pressed="' + (v === 'timeline') + '">Timeline</button><button type="button" data-rview="list" class="' + (v === 'list' ? 'active' : '') + '" aria-pressed="' + (v === 'list') + '">List</button></div></div>';
    }
    function otherDays(q) {
      if (!q) return '';
      const from = Club.date.fromToday(-14), to = Club.date.fromToday(60);
      const hits = reservations().filter(function (r) { return r.date >= from && r.date <= to && !(r.date === state.date && inSvc(r)) && matches(r, q); })
        .sort(function (a, b) { return Math.abs(F.toDate(a.date) - F.toDate(state.date)) - Math.abs(F.toDate(b.date) - F.toDate(state.date)) || a.time.localeCompare(b.time); }).slice(0, 6);
      if (!hits.length) return '';
      return '<div class="dn-hits"><span class="muted">Also found:</span>' + hits.map(function (r) {
        return '<button type="button" class="dn-hit" data-goto="' + r.id + '">' + esc(r.name) + ' <span>' + esc(F.weekday(r.date) + ' ' + F.dateShort(r.date) + ', ' + F.time(r.time)) + (live(r) ? '' : ' · ' + (r.status === 'no-show' ? 'no-show' : 'cancelled')) + '</span></button>';
      }).join('') + '</div>';
    }

    function bar(r, win, span) {
      const s = liveState(r);
      let start = toMin(r.time);
      if ((s === 'seated' || s === 'completed') && r.seatedAt && r.date === Club.date.iso(new Date(r.seatedAt))) start = isoMin(r.seatedAt);
      let end = start + TURN;
      if (s === 'completed') { const o = orders().find(function (x) { return x.reservationId === r.id && x.closedAt; }); if (o && Club.date.iso(new Date(o.closedAt)) === r.date) end = Math.max(start + 20, isoMin(o.closedAt)); }
      if (r.venue === BANQUET) end = start + 240;
      const l = Math.max(start, win[0]), w = Math.max(18, Math.min(end, win[1]) - l);
      if (l >= win[1]) return '';
      const dim = rs.q && !matches(r, rs.q.toLowerCase());
      return '<button type="button" class="dn-bk ' + s + (rs.sel === r.id ? ' sel' : '') + (dim ? ' dim' : '') + '" data-sel="' + r.id + '" style="left:' + ((l - win[0]) / span * 100).toFixed(3) + '%;width:' + (w / span * 100).toFixed(3) + '%" title="' + esc(r.name + ', ' + r.partySize + ' at ' + F.time(r.time) + (r.dietary ? ', ' + r.dietary : '')) + '">' +
        (r.dietary ? '<i class="diet" aria-hidden="true"></i>' : '') + '<b>' + esc(r.name) + '</b><span class="p">' + r.partySize + '</span></button>';
    }
    function timelineHTML(list) {
      const p = pick(), win = WIN[p], span = win[1] - win[0];
      const pct = function (m) { return ((m - win[0]) / span * 100).toFixed(3) + '%'; };
      const isToday = state.date === today(), now = nowMin();
      const shown = list.filter(function (r) { return rs.showGone || live(r); });
      const step = span > 400 ? 60 : 30;
      let axis = '';
      for (let m = Math.ceil(win[0] / step) * step; m <= win[1]; m += step) {
        if (m > win[0] + 10 && m < win[1] - 10 && !(isToday && Math.abs(m - now) < 14)) axis += '<span style="left:' + pct(m) + '">' + esc(F.time(fromMin(m)).replace(':00', '')) + '</span>';
      }
      const bucket = span > 400 ? 30 : 15, pace = {}; let maxP = 0, peak = null;
      list.filter(live).forEach(function (r) { const k = Math.floor(toMin(r.time) / bucket) * bucket; pace[k] = (pace[k] || 0) + (+r.partySize || 0); });
      Object.keys(pace).forEach(function (k) { if (pace[k] > maxP) { maxP = pace[k]; peak = +k; } });
      const paceH = Object.keys(pace).filter(function (k) { return +k >= win[0] - bucket && +k < win[1]; }).map(function (k) {
        k = +k; const l = Math.max(k, win[0]);
        return '<i class="dn-pb' + (k === peak ? ' peak' : '') + '" style="left:calc(' + pct(l) + ' + 2px);width:calc(' + ((Math.min(k + bucket, win[1]) - l) / span * 100).toFixed(3) + '% - 4px);height:' + Math.max(4, Math.round(pace[k] / maxP * 24)) + 'px"><b>' + pace[k] + '</b></i>';
      }).join('');
      const gridStyle = ' style="--tl-step:' + (step / span * 100).toFixed(4) + '%;--tl-off:' + (((Math.ceil(win[0] / step) * step) - win[0]) / span * 100).toFixed(4) + '%"';
      function lanes(rows) {
        const out = [];
        rows.forEach(function (r) { let placed = false; for (let i = 0; i < out.length && !placed; i++) if (out[i].every(function (x) { return Math.abs(toMin(x.time) - toMin(r.time)) >= TURN; })) { out[i].push(r); placed = true; } if (!placed) out.push([r]); });
        return out;
      }
      let h = '<div class="dn-tl"' + gridStyle + '>';
      h += '<div class="dn-tl-row dn-tl-axis"><div class="lab"></div><div class="lane">' + axis + '</div></div>';
      h += '<div class="dn-tl-row dn-tl-pace"><div class="lab">Covers arriving</div><div class="lane grid">' + paceH + '</div></div>';
      const unas = shown.filter(function (r) { return !r.table && live(r); });
      if (unas.length) {
        h += '<div class="dn-tl-row dn-tl-grp dn-tl-unas"><div class="lab">Needs a table <span>' + unas.length + (unas.length === 1 ? ' booking, ' : ' bookings, ') + covers(unas) + ' covers. Click one to assign.</span></div></div>';
        lanes(unas).forEach(function (row) { h += '<div class="dn-tl-row"><div class="lab unas">No table</div><div class="lane grid">' + row.map(function (r) { return bar(r, win, span); }).join('') + '</div></div>'; });
      }
      VENUES.forEach(function (v) {
        const vr = shown.filter(function (r) { return r.venue === v && r.table; }), lv = vr.filter(live), tables = TABLES[v] || [];
        if (!vr.length && (v === PATIO || v === BANQUET)) { h += '<div class="dn-tl-row dn-tl-grp dn-tl-empty"><div class="lab">' + esc(short(v)) + ' <span>' + tables.length + (v === BANQUET ? ' rooms' : ' tables') + ', no bookings this service</span></div></div>'; return; }
        h += '<div class="dn-tl-row dn-tl-grp"><div class="lab">' + esc(short(v)) + ' <span>' + lv.length + (lv.length === 1 ? ' party, ' : ' parties, ') + covers(lv) + ' covers · ' + tables.length + (v === BANQUET ? ' rooms' : ' tables') + '</span></div></div>';
        tables.forEach(function (t) {
          h += '<div class="dn-tl-row"><div class="lab">' + esc(t.id) + ' <small>' + t.seats + '</small></div><div class="lane grid">' + vr.filter(function (r) { return r.table === t.id; }).map(function (r) { return bar(r, win, span); }).join('') + '</div></div>';
        });
      });
      if (isToday && now > win[0] && now < win[1]) h += '<div class="dn-tl-now" style="left:calc(var(--lab) + (100% - var(--lab)) * ' + ((now - win[0]) / span).toFixed(4) + ')"><span>' + esc(F.time(fromMin(now))) + '</span></div>';
      h += '</div>';
      const lvAll = list.filter(live), gone = list.filter(function (r) { return !live(r); });
      return '<section class="panel dn-tl-panel"><div class="dn-tl-head"><h3>' + (p === 'All' ? 'All day' : esc(p)) + ', ' + esc(F.dateLong(state.date)) + '</h3><span class="muted">' + lvAll.length + (lvAll.length === 1 ? ' party' : ' parties') + ' · ' + covers(lvAll) + ' covers' + (peak != null ? ' · busiest ' + esc(F.time(fromMin(peak))) + ' with ' + maxP + ' covers arriving' : '') + '</span>' +
        (gone.length ? '<button type="button" class="s-link dn-gone-btn" data-gone>' + (rs.showGone ? 'Hide' : 'Show') + ' ' + gone.length + ' cancelled or no-show</button>' : '') + '</div>' +
        (list.length ? '' : '<div class="dn-service-empty"><span>No ' + (p === 'All' ? '' : esc(p.toLowerCase()) + ' ') + 'reservations on ' + esc(F.dateShort(state.date)) + '.</span>' + (p === 'All' ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-new-svc="' + p + '">' + Club.icon('plus') + '<span>Book ' + esc(p.toLowerCase()) + '</span></button>') + '</div>') +
        '<div class="dn-tl-scroll">' + h + '</div>' +
        '<div class="dn-tl-legend"><span><i class="lg-booked"></i>Booked</span><span><i class="lg-soon"></i>Due within 30 min</span><span><i class="lg-late"></i>Late</span><span><i class="lg-seated"></i>Seated</span><span><i class="lg-done"></i>Completed</span><span><i class="lg-unas"></i>No table yet</span><span class="dn-tl-note">Bars show the 1 h 45 min a booking holds its table</span></div></section>';
    }

    function listHTML(list) {
      const q = rs.q.toLowerCase().trim(), p = pick();
      const gone = list.filter(function (r) { return !live(r); });
      const rows = list.filter(function (r) { return (rs.showGone || live(r)) && matches(r, q); });
      const lv = list.filter(live);
      const slots = {};
      rows.forEach(function (r) { const k = Math.floor(toMin(r.time) / 15) * 15; (slots[k] = slots[k] || []).push(r); });
      const head = '<div class="dn-tl-head"><h3>' + (p === 'All' ? 'All day' : esc(p)) + '</h3><span class="muted">' + lv.length + (lv.length === 1 ? ' party' : ' parties') + ' · ' + covers(lv) + ' covers' + (q ? ' · ' + rows.length + ' matching' : '') + '</span>' +
        (gone.length ? '<button type="button" class="s-link dn-gone-btn" data-gone>' + (rs.showGone ? 'Hide' : 'Show') + ' ' + gone.length + ' cancelled</button>' : '') + '</div>';
      if (!rows.length) {
        return '<section class="panel dn-ls">' + head + (q ? '<div class="panel-body muted">No booking matches "' + esc(rs.q) + '" on this day.</div>' :
          '<div class="dn-service-empty"><span>No ' + (p === 'All' ? '' : esc(p.toLowerCase()) + ' ') + 'reservations on ' + esc(F.dateShort(state.date)) + '.</span>' + (p === 'All' ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-new-svc="' + p + '">' + Club.icon('plus') + '<span>Book ' + esc(p.toLowerCase()) + '</span></button>') + '</div>') + '</section>';
      }
      return '<section class="panel dn-ls">' + head + Object.keys(slots).sort(function (a, b) { return a - b; }).map(function (k) {
        const g = slots[k], gl = g.filter(live);
        return '<div class="dn-ls-group"><div class="dn-ls-slot">' + esc(F.time(fromMin(+k))) + '<span>' + gl.length + (gl.length === 1 ? ' party, ' : ' parties, ') + covers(gl) + ' covers</span></div>' + g.map(rowHTML).join('') + '</div>';
      }).join('') + '</section>';
    }
    function rowHTML(r) {
      const s = liveState(r), acts = resActs(r), main = acts.find(function (a) { return a.main; });
      let prim;
      if (s === 'unas') prim = '<button type="button" class="btn btn-sm btn-primary" data-sel="' + r.id + '">Assign table</button>';
      else prim = '<button type="button" class="btn btn-sm' + (main.quiet ? ' btn-ghost' : ' btn-primary') + '" ' + main.attr + (main.title ? ' title="' + esc(main.title) + '"' : '') + '>' + esc(main.label) + '</button>';
      const open = rs.open === r.id, sel = rs.sel === r.id;
      return '<div class="dn-ls-row' + (sel ? ' sel' : '') + (open ? ' open' : '') + (s === 'completed' || s === 'cancelled' ? ' done' : '') + '" data-row="' + r.id + '" tabindex="0">' +
        '<div class="c-who"><div class="nm">' + esc(r.name) + '</div><div class="sub">' + (toMin(r.time) % 15 ? esc(F.time(r.time)) + ' · ' : '') + whoSub(r) + (r.venue !== GALLERY && r.venue !== BAR ? ' · ' + esc(short(r.venue)) : '') + '</div>' +
        '<div class="dn-ls-mob"><b>' + r.partySize + (r.partySize === 1 ? ' guest' : ' guests') + '</b>' + (r.table ? tchip(r.table) : tchip('Needs table', true)) + liveBadge(r) + flagsHTML(r) + '</div></div>' +
        '<div class="c-party"><b>' + r.partySize + '</b> <span class="sub">' + (r.partySize === 1 ? 'guest' : 'guests') + '</span></div>' +
        '<div class="c-table">' + (r.table ? tchip(r.table) : tchip('None', true)) + '</div>' +
        '<div class="c-flags">' + flagsHTML(r) + '</div><div class="c-status">' + liveBadge(r) + '</div>' +
        '<div class="c-acts">' + prim + moreBtn(r, s === 'unas' ? '' : main.key) + '</div>' +
        (open ? '<div class="dn-ls-more">' + (s === 'unas' ? assignHTML(r) : '') + actButtons(r, true) + '</div>' : '') + '</div>';
    }
    function assignHTML(r) {
      const ft = freeTablesFor(r);
      return '<div class="dn-assign"><h4>Assign a table, free at ' + esc(F.time(r.time)) + ' and seats ' + r.partySize + '</h4>' + (ft.length ? '<ul>' + ft.slice(0, 6).map(function (t) {
        return '<li>' + tchip(t.id) + '<span class="f">' + t.seats + ' seats</span><button type="button" class="btn btn-sm" data-assign-to="' + esc(t.id) + '" data-id="' + r.id + '">Assign</button></li>';
      }).join('') + '</ul>' : '<p class="muted">No table in ' + esc(short(r.venue)) + ' is free at that time and seats ' + r.partySize + '.</p>') + '</div>';
    }
    function sideHTML(r) {
      if (!r) return '<div class="panel panel-body muted dn-rv-empty">Select a booking to see it here.</div>';
      const s = liveState(r), o = orderForRes(r);
      const others = r.table ? dayRes(r.date).filter(function (x) { return x.id !== r.id && x.venue === r.venue && x.table === r.table && live(x); }) : [];
      const tm = F.time(r.time).split(' ');
      let h = '<div class="panel dn-rv"><div class="dn-rv-head"><div><div class="eyebrow">' + esc(short(r.venue)) + ' · ' + esc(F.dateShort(r.date)) + '</div><h2>' + esc(r.name) + '</h2></div>' + liveBadge(r) + '</div>' +
        '<div class="dn-rv-sub">' + whoSub(r) + (r.occasion ? ' · ' + esc(r.occasion) : '') + '</div>' +
        '<div class="dn-rv-facts"><div><small>Arrives</small><b class="num">' + esc(tm[0]) + '</b> <small class="ap">' + esc(tm[1] || '') + '</small></div><div><small>Party</small><b class="num">' + r.partySize + '</b></div><div><small>Table</small><b>' + (r.table ? esc(r.table) : '<span class="warn">None</span>') + '</b></div></div>';
      if (s === 'late') h += '<div class="dn-rv-sec"><div class="dn-note-box warn">' + Club.icon('clock') + '<span>' + dur(nowMin() - toMin(r.time)) + ' past the booking. Seat the party, or mark a no-show.</span></div></div>';
      if (s === 'seated') h += '<div class="dn-rv-sec"><div class="dn-note-box">' + Club.icon('clock') + '<span>' + (r.date === today() ? 'Seated ' + (r.seatedAt ? 'at ' + esc(F.time(fromMin(isoMin(r.seatedAt)))) + ', ' : '') + dur(seatedMins(r)) + ' ago. ' : 'Seated. ') + (o ? 'Check No. ' + o.number + ' ' + ({ open: 'open', fired: 'with the kitchen', served: 'served' }[o.status] || 'open') + ', ' + money(orderTotals(o).subtotal) + '.' : 'No check open.') + '</span></div></div>';
      if (r.dietary || r.notes) h += '<div class="dn-rv-sec"><h4>For the kitchen and floor</h4>' + (r.dietary ? '<div class="dn-rv-diet"><span class="dn-flag diet">' + esc(r.dietary) + '</span></div>' : '') + (r.notes ? '<div>' + esc(r.notes) + '</div>' : '') + '</div>';
      if (s === 'unas') h += '<div class="dn-rv-sec">' + assignHTML(r) + '</div>';
      h += '<div class="dn-rv-sec">' + actButtons(r, false) + '</div>';
      if (others.length) h += '<div class="dn-rv-sec"><h4>Also at ' + esc(r.table) + ' this day</h4>' + others.map(function (x) { return '<button type="button" class="dn-also" data-sel="' + x.id + '"><span>' + esc(F.time(x.time)) + ' · ' + esc(x.name) + ' · ' + x.partySize + '</span><span class="faint">' + esc(x.status) + '</span></button>'; }).join('') + '</div>';
      return h + '</div>';
    }

    function draw() {
      closeMenus();
      const list = dayRes(state.date).filter(inSvc), v = view(), phone = isPhone();
      if (rs.sel && !list.some(function (r) { return r.id === rs.sel; })) rs.sel = null;
      if (!rs.sel && !phone) {
        const now = nowMin(), isToday = state.date === today();
        const nx = list.filter(function (r) { return r.status === 'confirmed' && r.table && (!isToday || toMin(r.time) >= now); })[0] || list.filter(live)[0];
        rs.sel = nx ? nx.id : null;
      }
      const unas = list.filter(function (r) { return live(r) && !r.table && r.status === 'confirmed'; });
      const q = rs.q.toLowerCase().trim();
      const sel = rs.sel ? S.find('diningReservations', rs.sel) : null;
      root.innerHTML = dayStrip() + toolbar(dayRes(state.date)) + otherDays(q) +
        (unas.length ? '<div class="dn-alert">' + Club.icon('alert') + '<span>' + unas.length + (unas.length === 1 ? ' booking this service has no table yet. It sits' : ' bookings this service have no table yet. They sit') + ' in the first lane of the timeline.</span><button type="button" class="btn btn-sm" data-sel="' + unas[0].id + '" data-first>Assign the first</button></div>' : '') +
        '<div class="dn-rs-grid"><div class="dn-rs-main">' + (v === 'timeline' ? timelineHTML(list) : listHTML(list)) + '</div><aside class="dn-rs-side" aria-label="Selected booking">' + sideHTML(sel) + '</aside></div>';
      dp = mountDate(root, function () { rs.sel = null; rs.open = null; draw(); });
      const tl = root.querySelector('.dn-tl-scroll');
      if (tl && state.date === today() && tl.scrollWidth > tl.clientWidth + 4) { const n = tl.querySelector('.dn-tl-now'); if (n) tl.scrollLeft = Math.max(0, n.offsetLeft - tl.clientWidth / 2); }
    }
    function phoneDrawer(r) {
      const d = U.drawer({ eyebrow: short(r.venue) + ' · ' + F.dateShort(r.date), title: r.name, body: '<div class="dn-rs-drawer">' + sideHTML(r) + '</div>' });
      wireShared(d.el);
      U.on(d.el, 'click', '[data-res-act], [data-edit-res], [data-view-check], [data-open-check], [data-assign-to], [data-cleared], [data-sel]', function (e, b) {
        if (b.dataset.sel) { rs.sel = b.dataset.sel; setTimeout(function () { d.close(); const x = S.find('diningReservations', b.dataset.sel); if (x) phoneDrawer(x); }, 0); return; }
        setTimeout(function () { d.close(); }, 0);
      });
    }
    /* Registered before the action handlers: a row's own buttons select the row (the action then redraws);
       a click anywhere else on the row selects it (desktop) or opens its actions (phone). */
    U.on(panel, 'click', '.dn-ls-row', function (e, row) {
      if (e.target.closest('.dn-menu, [data-more], .dn-ls-more, [data-sel]')) return;
      if (e.target.closest('button, a, input')) { rs.sel = row.dataset.row; return; }
      if (isPhone()) { rs.open = rs.open === row.dataset.row ? null : row.dataset.row; rs.sel = rs.open; }
      else rs.sel = row.dataset.row;
      draw();
    });
    wireShared(panel);
    U.on(panel, 'click', '[data-sel]', function (e, b) {
      const id = b.dataset.sel;
      if (b.closest('.dn-ls-row') && isPhone()) { rs.open = rs.open === id ? null : id; rs.sel = rs.open; draw(); return; }
      rs.sel = id;
      if (isPhone() && view() === 'timeline') { const r = S.find('diningReservations', id); if (r) phoneDrawer(r); draw(); return; }
      if (isPhone()) rs.open = id;
      draw();
      if (b.hasAttribute('data-first') || b.classList.contains('dn-bk')) { const side = root.querySelector('.dn-rs-side .panel'); if (side && side.getBoundingClientRect().top < 0) side.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    U.on(panel, 'click', '[data-date]', function (e, b) { state.date = b.dataset.date; rs.sel = null; rs.open = null; draw(); const n = root.querySelector('[data-date="' + state.date + '"]'); if (n) n.focus({ preventScroll: true }); });
    U.on(panel, 'click', '[data-strip]', function (e, b) { rs.strip = Club.date.addDays(rs.strip, +b.dataset.strip); const keep = state.date; state.date = rs.strip <= keep && keep <= Club.date.addDays(rs.strip, 8) ? keep : Club.date.addDays(rs.strip, +b.dataset.strip > 0 ? 0 : 8); if (state.date !== keep) { rs.sel = null; rs.open = null; } draw(); });
    U.on(panel, 'click', '[data-cal]', function () { if (dp && dp.open) dp.open(); });
    U.on(panel, 'click', '[data-svc]', function (e, b) { state.resService = b.dataset.svc; if (b.dataset.svc !== 'All') state.service = b.dataset.svc; rs.sel = null; rs.open = null; draw(); const n = U.$('[data-svc="' + b.dataset.svc + '"]', panel); if (n) n.focus(); });
    U.on(panel, 'click', '[data-rview]', function (e, b) { rs.view = b.dataset.rview; draw(); const n = U.$('[data-rview="' + rs.view + '"]', panel); if (n) n.focus(); });
    U.on(panel, 'click', '[data-gone]', function () { rs.showGone = !rs.showGone; draw(); });
    U.on(panel, 'click', '[data-goto]', function (e, b) {
      const r = S.find('diningReservations', b.dataset.goto); if (!r) return;
      state.date = r.date; if (state.resService !== 'All') { state.resService = serviceOf(r.time); state.service = state.resService; }
      if (!live(r)) rs.showGone = true;
      rs.sel = r.id; rs.open = isPhone() ? r.id : null; draw();
    });
    U.on(panel, 'input', 'input[name=dnq]', function (e, i) {
      rs.q = i.value; const pos = i.selectionStart; draw();
      const n = U.$('input[name=dnq]', panel); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } }
    });
    U.on(panel, 'keydown', '.dn-ls-row', function (e, row) { if ((e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); row.click(); } });
    U.on(panel, 'click', '[data-new-svc]', function (e, b) { const t = { Breakfast: '08:00', Lunch: '12:30', Dinner: '19:00' }[b.dataset.newSvc]; reservationModal(null, { time: t, venue: b.dataset.newSvc === 'Lunch' ? BAR : GALLERY }); });
    redraw = draw;
    draw();
  }

  /* ------------------------------------------------------------------
     Floor plan tab: the plan (or a grid of tables) on the left; the host stand on the right with Seat a walk-in,
     Arriving next and Seated now, or the details of the table you click. Solid table states: free (and until when),
     seated (minutes), arriving within 30 minutes, late, needs clearing.
     ------------------------------------------------------------------ */
  function seatPositions(t) {
    const out = [];
    if (t.shape === 'round') {
      for (let i = 0; i < t.seats; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / t.seats; out.push([t.x + Math.cos(a) * (t.r + 15), t.y + Math.sin(a) * (t.r + 15)]); }
    } else if (t.seats === 2) {
      out.push([t.x - t.w / 2 - 15, t.y], [t.x + t.w / 2 + 15, t.y]);
    } else {
      const vertical = t.h > t.w; const per = Math.ceil(t.seats / 2);
      for (let s = 0; s < 2; s++) for (let i = 0; i < per; i++) {
        if (s * per + i >= t.seats) break;
        if (vertical) out.push([t.x + (s ? 1 : -1) * (t.w / 2 + 15), t.y - t.h / 2 + (i + 0.5) * t.h / per]);
        else out.push([t.x - t.w / 2 + (i + 0.5) * t.w / per, t.y + (s ? 1 : -1) * (t.h / 2 + 15)]);
      }
    }
    return out;
  }
  function roomDecor(room) {
    if (room === GALLERY) {
      let s = '<g class="fp-decor">';
      for (let i = 0; i < 5; i++) { const x = 110 + i * 170; s += '<line class="fp-window" x1="' + x + '" y1="30" x2="' + (x + 120) + '" y2="30"/>'; }
      s += '<rect class="fp-fixture" x="24" y="330" width="14" height="110" rx="2"/><text class="fp-caption" x="50" y="390" text-anchor="start">Host stand</text>';
      s += '<text class="fp-caption" x="500" y="58" text-anchor="middle">Windows overlooking the 18th hole</text>';
      s += '<text class="fp-caption" x="500" y="612" text-anchor="middle">Second floor entrance</text>';
      s += '<rect class="fp-fixture" x="40" y="560" width="110" height="20" rx="2"/><text class="fp-caption" x="95" y="552" text-anchor="middle">Service</text>';
      return s + '</g>';
    }
    let s = '<g class="fp-decor"><rect class="fp-bar" x="250" y="44" width="500" height="54" rx="27"/><text class="fp-caption" x="500" y="76" text-anchor="middle">Taps</text>';
    for (let i = 0; i < 10; i++) s += '<circle class="fp-stool" cx="' + (285 + i * 48) + '" cy="120" r="9"/>';
    s += '<rect class="fp-fixture" x="30" y="170" width="16" height="330" rx="2"/><text class="fp-caption" x="58" y="560" text-anchor="start">Banquettes</text>';
    s += '<text class="fp-caption" x="850" y="612" text-anchor="middle">To the Gallery</text><text class="fp-caption" x="500" y="612" text-anchor="middle">Entrance</text>';
    return s + '</g>';
  }
  const FL_LABEL = { free: 'Free', seated: 'Seated', soon: 'Arriving soon', late: 'Late', clear: 'Needs clearing' };
  /** The moment the plan shows: now when today's service is on; otherwise the start of a later service or day,
      or the end of an earlier one. */
  function refMin(date, svc) {
    const w = WIN[svc] || WIN.Dinner, t = today();
    if (date < t) return w[1];
    if (date > t) return w[0];
    if (svc === currentService()) return nowMin();
    return Math.max(w[0], Math.min(w[1], nowMin()));
  }
  function isLive() { return state.date === today() && state.service === currentService(); }
  /** Live state of one table. day: the date's reservations, sorted by time. */
  function tableState(room, t, day) {
    const svc = state.service, ref = refMin(state.date, svc), isToday = state.date === today(), liveNow = isLive();
    const rs = day.filter(function (r) { return r.venue === room && r.table === t.id && live(r); });
    const list = rs.filter(function (r) { return serviceOf(r.time) === svc; });
    const seated = rs.find(function (r) { return r.status === 'seated' && (liveNow || serviceOf(r.time) === svc); });
    let o = isToday ? orderFor(room, t.id) : null;
    if (o && !(seated || liveNow || serviceOf(o.time) === svc)) o = null;
    const next = rs.find(function (r) { return r.status === 'confirmed' && toMin(r.time) >= ref; }) || null;
    const late = list.find(function (r) { return r.status === 'confirmed' && toMin(r.time) < ref; });
    const dirty = isToday ? rs.filter(needsClear) : [];
    if (seated || o) return { state: 'seated', res: seated || null, order: o, mins: seated ? seatedMins(seated) : Math.max(0, Math.round((Date.now() - new Date(o.openedAt || Date.now()).getTime()) / 60000)), next: next, list: list };
    if (dirty.length) return { state: 'clear', res: dirty[dirty.length - 1], dirty: dirty, next: next, list: list };
    if (late) return { state: 'late', res: late, mins: ref - toMin(late.time), next: next, list: list };
    if (next && toMin(next.time) - ref <= 30) return { state: 'soon', res: next, mins: toMin(next.time) - ref, next: next, list: list };
    return { state: 'free', res: null, next: next, list: list, freeFor: next ? toMin(next.time) - ref : null };
  }
  function roomStates(room) {
    const day = dayRes(state.date), out = {};
    (TABLES[room] || []).forEach(function (t) { out[t.id] = tableState(room, t, day); });
    return out;
  }

  /** Seat a walk-in now: a seated reservation (and a check, if asked) in one Undo step. */
  function seatWalkIn(room, tid, f) {
    const t = tableDef(room, tid); if (!t) return false;
    if (!(f.party >= 1) || Math.floor(f.party) !== f.party) { U.toast('Enter a party size.', 'bad'); return false; }
    if (f.party > t.seats) { U.toast(tableLabel(room, tid) + ' seats ' + t.seats + '.', 'bad'); return false; }
    const busy = reservations().find(function (r) { return r.date === today() && r.venue === room && r.table === tid && r.status === 'seated'; });
    if (busy || orderFor(room, tid)) { U.toast(tableLabel(room, tid) + ' is occupied' + (busy ? ' by ' + busy.name : '') + '.', 'bad'); return false; }
    const mem = f.memberId ? Club.members.get(f.memberId) : null;
    let o = null;
    Club.undo.run(function () {
      const w = S.insert('diningReservations', { id: S.uid('dres'), date: today(), time: fromMin(Math.floor(nowMin() / 5) * 5), venue: room, partySize: f.party, memberId: mem ? mem.id : null, name: mem ? mem.firstName + ' ' + mem.lastName : (f.name || 'Walk-in'), table: tid, status: 'seated', occasion: '', dietary: '', notes: 'Walk-in', seatedAt: new Date().toISOString() });
      if (f.check) o = openCheck({ venue: room, table: tid, memberId: w.memberId, name: w.name, covers: w.partySize, reservationId: w.id });
      return w;
    }, { message: function (w) { return w.name + ' seated at ' + tableLabel(room, tid) + (f.check ? ' with a check open' : ''); }, after: refresh, undone: 'Walk-in removed from ' + tableLabel(room, tid) });
    refresh();
    if (o) setTimeout(function () { const cur = S.find('diningOrders', o.id); if (cur) addItemsModal(cur); }, 200);
    return true;
  }

  function renderFloor(panel) {
    if (PLAN_VENUES.indexOf(state.room) < 0) state.room = GALLERY;
    const fl = state.fl || (state.fl = { mode: 'host', sel: null, filter: null, view: null, walk: { party: 2, pick: null, name: '', memberId: '', check: true }, here: 2, arrAll: false, gone: false });
    panel.innerHTML = '<div class="dn-floor-root"></div>';
    const root = U.$('.dn-floor-root', panel);
    let dp = null;
    function view() { return fl.view || (isPhone() ? 'tiles' : 'plan'); }
    function fitsWalk(t, ts) { return fl.mode === 'walkin' && ts.state === 'free' && t.seats >= fl.walk.party; }
    function shortTurn(ts) { return ts.freeFor != null && ts.freeFor < 60; }

    function subText(ts, t) {
      if (ts.state === 'seated') return dur(ts.mins) + ' · ' + (ts.res ? ts.res.partySize : (ts.order.covers || 1));
      if (ts.state === 'soon') return tShort(ts.res.time) + ' · ' + ts.res.partySize;
      if (ts.state === 'late') return 'Late ' + dur(ts.mins);
      if (ts.state === 'clear') return 'Clear';
      return ts.next ? 'until ' + tShort(ts.next.time) : t.seats + ' seats';
    }
    function planSVG(room, st) {
      const dim = !!fl.filter || fl.mode === 'walkin';
      const g = TABLES[room].map(function (t) {
        const ts = st[t.id];
        const on = ts.state === 'seated' ? (ts.res ? ts.res.partySize : (ts.order.covers || 0)) : 0;
        const seats = seatPositions(t).map(function (p, i) { return '<circle class="fp-seat' + (i < on ? ' on' : '') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="8"/>'; }).join('');
        let shape, halo;
        if (t.shape === 'round') { shape = '<circle class="fp-top" cx="' + t.x + '" cy="' + t.y + '" r="' + t.r + '"/>'; halo = '<circle class="fp-halo" cx="' + t.x + '" cy="' + t.y + '" r="' + (t.r + 25) + '"/>'; }
        else { shape = '<rect class="fp-top" x="' + (t.x - t.w / 2) + '" y="' + (t.y - t.h / 2) + '" width="' + t.w + '" height="' + t.h + '" rx="6"/>'; halo = '<rect class="fp-halo" x="' + (t.x - t.w / 2 - 26) + '" y="' + (t.y - t.h / 2 - 26) + '" width="' + (t.w + 52) + '" height="' + (t.h + 52) + '" rx="14"/>'; }
        const small = (t.shape === 'round' ? t.r * 2 : Math.max(t.w, t.h)) < 60;
        const half = t.shape === 'round' ? t.r : t.h / 2;
        const lblY = small ? t.y : t.y - 9, subY = small ? t.y + half + (t.shape === 'round' ? 34 : 22) : t.y + 11;
        let tag = '';
        if ((ts.state === 'seated' && ts.next && toMin(ts.next.time) - refMin(state.date, state.service) <= 75) || (ts.state === 'clear' && ts.next)) tag = '<text class="fp-tag" x="' + t.x + '" y="' + (t.y - half - 34) + '" text-anchor="middle">Next ' + tShort(ts.next.time) + '</text>';
        const fit = fitsWalk(t, ts) && !shortTurn(ts);
        const match = (fl.filter && ts.state === fl.filter) || fit || (fl.mode === 'walkin' && fl.walk.pick === t.id);
        const cls = 'fp-table ' + ts.state + (fl.sel === t.id && fl.mode === 'table' ? ' sel' : '') + (fit ? ' fit' : '') + (fl.mode === 'walkin' && fl.walk.pick === t.id ? ' picked' : '') + (match ? ' match' : '');
        return '<g class="' + cls + '" data-table="' + esc(t.id) + '" tabindex="0" role="button" aria-label="' + esc(tableLabel(room, t.id) + ', ' + t.seats + ' seats, ' + FL_LABEL[ts.state] + (ts.res ? ', ' + ts.res.name : '') + (ts.state === 'free' && ts.next ? ', free until ' + F.time(ts.next.time) : '')) + '">' + halo + seats + shape +
          '<text class="fp-num" x="' + t.x + '" y="' + lblY + '" text-anchor="middle">' + esc(t.id) + '</text><text class="fp-sub' + (small ? ' out' : '') + '" x="' + t.x + '" y="' + subY + '" text-anchor="middle">' + esc(subText(ts, t)) + '</text>' + tag + '</g>';
      }).join('');
      return '<svg class="dn-plan' + (dim ? ' dim' : '') + '" viewBox="0 0 1000 630" role="group" aria-label="' + esc(short(room)) + ' floor plan">' +
        '<defs><pattern id="dn-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="fp-hatch-bg" width="8" height="8"/><line class="fp-hatch-ln" x1="0" y1="0" x2="0" y2="8"/></pattern></defs>' +
        '<rect class="fp-room" x="30" y="30" width="940" height="560" rx="6"/><line class="fp-door" x1="440" y1="590" x2="560" y2="590"/>' + roomDecor(room) + g + '</svg>';
    }
    function tilesHTML(room, st) {
      return '<div class="dn-tiles' + (fl.filter || fl.mode === 'walkin' ? ' dim' : '') + '">' + TABLES[room].map(function (t) {
        const ts = st[t.id];
        const sub = ts.state === 'seated' ? dur(ts.mins) + ' · ' + (ts.res ? ts.res.partySize : (ts.order.covers || 1)) + ' guests' : ts.state === 'soon' ? F.time(ts.res.time) + ' · ' + ts.res.partySize : ts.state === 'late' ? 'Late ' + dur(ts.mins) : ts.state === 'clear' ? 'Needs clearing' : ts.next ? 'Free until ' + tShort(ts.next.time) : 'Free';
        const fit = fitsWalk(t, ts);
        const match = (fl.filter && ts.state === fl.filter) || fit;
        return '<button type="button" class="dn-tile ' + ts.state + (fl.sel === t.id && fl.mode === 'table' ? ' sel' : '') + (fl.mode === 'walkin' && fl.walk.pick === t.id ? ' sel' : '') + (match ? ' match' : '') + '" data-table="' + esc(t.id) + '" aria-label="' + esc(tableLabel(room, t.id) + ', ' + t.seats + ' seats, ' + sub) + '"><span class="t-id">' + esc(t.id) + '<small>' + t.seats + ' seats</small></span><span class="t-sub">' + esc(sub) + '</span></button>';
      }).join('') + '</div>';
    }
    function whenText(r) {
      if (state.date !== today()) return ['', ''];
      const d = toMin(r.time) - nowMin();
      return d < 0 ? ['late', dur(-d) + ' late'] : d === 0 ? ['soon', 'Now'] : d <= 30 ? ['soon', 'In ' + dur(d)] : ['', 'In ' + dur(d)];
    }
    function arrivalsHTML(room) {
      const list = dayRes(state.date).filter(function (r) { return r.status === 'confirmed' && r.venue === room && serviceOf(r.time) === state.service; });
      const limit = isPhone() && !fl.arrAll ? 3 : 0, shown = limit ? list.slice(0, limit) : list;
      const title = state.date === today() ? 'Arriving next' : 'On the book';
      return '<section class="panel dn-rail-panel"><div class="panel-head"><h3>' + title + ' <span class="dn-h-sub">' + list.length + (list.length === 1 ? ' party' : ' parties') + ' · ' + covers(list) + ' covers</span></h3></div>' +
        (list.length ? '<ul class="dn-arr">' + shown.map(function (r, i) {
          const w = whenText(r);
          const tm = F.time(r.time);
          return '<li data-arr="' + r.id + '" tabindex="0"' + (fl.sel && r.table === fl.sel && fl.mode === 'table' ? ' class="sel"' : '') + '><div><div class="a-time">' + esc(tm.replace(/ (AM|PM)$/, '')) + '</div><span class="a-when ' + w[0] + '">' + esc(w[1]) + '</span></div>' +
            '<div class="a-main"><div class="a-name">' + esc(r.name) + '</div><div class="a-meta"><span>' + r.partySize + (r.partySize === 1 ? ' guest' : ' guests') + '</span>' + (r.table ? tchip(r.table) : tchip('Needs table', true)) + '<span class="faint">' + whoSub(r) + '</span>' + flagsHTML(r) + '</div></div>' +
            (r.table ? '<button type="button" class="btn btn-sm' + (i === 0 || w[0] ? ' btn-primary' : '') + '" data-seat="' + r.id + '">Seat</button>' : '<button type="button" class="btn btn-sm" data-edit-res="' + r.id + '" title="Choose a table for ' + esc(r.name) + '">Table</button>') + '</li>';
        }).join('') + '</ul>' + (limit && list.length > limit ? '<div class="dn-rail-more"><button type="button" class="s-link" data-arr-all>Show all ' + list.length + '</button></div>' : '') :
          '<p class="panel-body muted dn-rail-empty">' + (state.date === today() ? 'No more arrivals in ' + esc(short(room)) + ' this ' + esc(state.service.toLowerCase()) + '.' : 'No ' + esc(state.service.toLowerCase()) + ' bookings in ' + esc(short(room)) + '.') + '</p>') + '</section>';
    }
    function seatedHTML(room, st) {
      const rows = [];
      TABLES[room].forEach(function (t) { const ts = st[t.id]; if (ts.state === 'seated') rows.push({ t: t, ts: ts }); });
      const n = rows.reduce(function (a, x) { return a + (x.ts.res ? +x.ts.res.partySize : (x.ts.order.covers || 1)); }, 0);
      const gone = dayRes(state.date).filter(function (r) { return !live(r) && r.venue === room && serviceOf(r.time) === state.service; });
      if (state.date !== today() && !gone.length) return '';
      const ck = function (o) { return o ? ({ open: 'Check open', fired: 'Check fired', served: 'Check served' }[o.status] || 'Check open') : 'No check'; };
      return '<section class="panel dn-rail-panel">' + (state.date === today() ? '<div class="panel-head"><h3>Seated now <span class="dn-h-sub">' + rows.length + (rows.length === 1 ? ' table · ' : ' tables · ') + n + (n === 1 ? ' guest' : ' guests') + '</span></h3></div>' +
        (rows.length ? '<ul class="dn-arr dn-seatedl">' + rows.map(function (x) {
          const who = x.ts.res || x.ts.order, m = x.ts.mins;
          return '<li data-tsel="' + esc(x.t.id) + '" tabindex="0"><span class="s-tbl">' + esc(x.t.id) + '</span><div class="a-main"><div class="a-name">' + esc(who.name || 'Guest') + '</div><div class="a-meta"><span>' + (x.ts.res ? x.ts.res.partySize : (x.ts.order.covers || 1)) + ' guests</span><span class="ck">' + ck(x.ts.order) + '</span></div></div><span class="dn-elapsed' + (m >= 75 ? ' long' : '') + '">' + dur(m) + '</span></li>';
        }).join('') + '</ul>' : '<p class="panel-body muted dn-rail-empty">Nobody seated in ' + esc(short(room)) + ' yet.</p>') : '') +
        (gone.length ? '<div class="dn-rail-more"><button type="button" class="s-link" data-fl-gone>' + (fl.gone ? 'Hide cancelled and no-shows' : gone.length + (gone.length === 1 ? ' cancelled or no-show' : ' cancelled or no-shows') + ' this ' + esc(state.service.toLowerCase()) + ' · Show') + '</button></div>' +
          (fl.gone ? '<ul class="dn-arr dn-gone-list">' + gone.map(function (r) { return '<li><div><div class="a-time">' + esc(F.time(r.time).replace(/ (AM|PM)$/, '')) + '</div><span class="a-when">' + (r.status === 'no-show' ? 'No-show' : 'Cancelled') + '</span></div><div class="a-main"><div class="a-name">' + esc(r.name) + '</div><div class="a-meta"><span>' + r.partySize + ' guests</span>' + (r.table ? tchip(r.table) : '') + '</div></div><button type="button" class="btn btn-sm btn-ghost" data-res-act="confirmed" data-id="' + r.id + '">Reinstate</button></li>'; }).join('') + '</ul>' : '') : '') + '</section>';
    }
    function hostRail(room, st) {
      const isToday = state.date === today();
      return '<div class="dn-rail-cta">' + (isToday ? '<button type="button" class="btn btn-primary" data-walkin>' + Club.icon('plus') + '<span>Seat a walk-in</span></button>' : '') +
        '<button type="button" class="btn" data-fl-new>' + Club.icon('calendar') + '<span>New reservation</span></button></div>' + arrivalsHTML(room) + seatedHTML(room, st);
    }
    function memberSelect(id, sel) { return '<select class="select" id="' + id + '" name="memberId"><option value="">Not a member, or unknown</option>' + Club.members.options(sel || '') + '</select>'; }
    function walkinRail(room, st) {
      const w = fl.walk;
      const fits = TABLES[room].filter(function (t) { return st[t.id].state === 'free' && t.seats >= w.party; })
        .sort(function (a, b) { return a.seats - b.seats || ((st[b.id].freeFor == null ? 9999 : st[b.id].freeFor) - (st[a.id].freeFor == null ? 9999 : st[a.id].freeFor)); });
      if (w.pick && !fits.some(function (t) { return t.id === w.pick; })) w.pick = null;
      const maxSeats = Math.max.apply(null, TABLES[room].map(function (t) { return t.seats; }));
      return '<section class="panel dn-det"><div class="dn-det-head"><div><button type="button" class="dn-back" data-host>' + Club.icon('chevronLeft') + '<span>Host stand</span></button><h2>Seat a walk-in</h2></div></div>' +
        '<div class="dn-det-sec first"><h4 id="dn-wp-l">Party size</h4><div class="dn-wp-row"><span class="dn-big-step" role="group" aria-labelledby="dn-wp-l"><button type="button" data-wp="-1" aria-label="Fewer guests"' + (w.party <= 1 ? ' disabled' : '') + '>&minus;</button><span aria-live="polite">' + w.party + '</span><button type="button" data-wp="1" aria-label="More guests"' + (w.party >= maxSeats ? ' disabled' : '') + '>+</button></span><span class="muted dn-hint">Tables that fit are outlined on the plan</span></div></div>' +
        '<div class="dn-det-sec"><h4>Free tables that fit ' + w.party + ', smallest first</h4>' + (fits.length ? '<ul class="dn-fit">' + fits.map(function (t) {
          const ts = st[t.id], warn = shortTurn(ts);
          return '<li class="' + (w.pick === t.id ? 'on' : '') + '">' + tchip(t.id) + '<div class="f-main"><b>' + t.seats + ' seats</b><div class="f-sub' + (warn ? ' warn' : '') + '">' + (ts.freeFor == null ? 'Free for the rest of ' + esc(state.service.toLowerCase()) : (warn ? 'Short turn. ' : '') + 'Free until ' + esc(F.time(ts.next.time)) + ' (' + dur(ts.freeFor) + '), booked for ' + esc(ts.next.name)) + '</div></div>' +
            '<button type="button" class="btn btn-sm' + (w.pick === t.id ? ' btn-primary' : '') + '" data-pick="' + esc(t.id) + '" aria-pressed="' + (w.pick === t.id) + '"' + (warn ? ' title="Less than an hour before the next booking"' : '') + '>' + (w.pick === t.id ? 'Chosen' : 'Choose') + '</button></li>';
        }).join('') + '</ul>' : '<p class="muted dn-none">No free table seats ' + w.party + ' right now.</p>') + '</div>' +
        '<form class="dn-det-sec dn-walkform" data-walk="pick" novalidate><div class="field"><label for="dn-wi-name">Guest name</label><input class="input" id="dn-wi-name" name="name" placeholder="Walk-in" value="' + esc(w.name) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="dn-wi-mem">Member</label>' + memberSelect('dn-wi-mem', w.memberId) + '</div>' +
        '<label class="check"><input type="checkbox" name="check"' + (w.check ? ' checked' : '') + '> Open a check now</label>' +
        '<div class="dn-acts"><button type="submit" class="btn btn-primary dn-go"' + (w.pick ? '' : ' disabled') + '>Seat ' + w.party + (w.pick ? ' at ' + esc(w.pick) : '') + '</button></div></form></section>';
    }
    function partyLine(r, light) {
      return '<div class="dn-party">' + U.avatar(r.name, '', light) + '<div class="p-main"><div class="nm">' + esc(r.name) + '</div><div class="muted p-sub">' + whoSub(r) + ' · ' + r.partySize + (r.partySize === 1 ? ' guest' : ' guests') + (r.status === 'seated' ? ' · booked ' + esc(F.time(r.time)) : '') + '</div></div>';
    }
    function tableRail(room, st) {
      const t = tableDef(room, fl.sel); if (!t) { fl.mode = 'host'; return hostRail(room, st); }
      const ts = st[t.id], r = ts.res, isToday = state.date === today(), ref = refMin(state.date, state.service);
      const badge = { free: 'good', seated: 'outline', soon: 'warn', late: 'bad', clear: 'outline' }[ts.state];
      let h = '<section class="panel dn-det"><div class="dn-det-head"><div><button type="button" class="dn-back" data-host>' + Club.icon('chevronLeft') + '<span>Host stand</span></button><h2>' + esc(tableLabel(room, t.id)) + '</h2></div>' + U.badge(FL_LABEL[ts.state], badge) + '</div>' +
        '<div class="dn-det-state"><span>' + t.seats + ' seats</span><span class="dn-dot">·</span><span>' + esc(short(room)) + '</span><span class="dn-dot">·</span><span>' + esc(state.service) + ', ' + (isToday ? (state.service === 'Dinner' ? 'tonight' : 'today') : esc(F.weekday(state.date) + ' ' + F.dateShort(state.date))) + '</span></div>';
      const nextNote = function (warn, text) { return '<div class="dn-det-sec"><div class="dn-note-box' + (warn ? ' warn' : '') + '">' + Club.icon('clock') + '<span>' + text + '</span></div></div>'; };
      if (ts.state === 'seated') {
        const o = ts.order, who = r || { name: o.name || 'Guest', partySize: o.covers || 1, memberId: o.memberId, status: 'seated', time: o.time };
        h += '<div class="dn-det-sec">' + partyLine(who) + '<div class="p-fig"><div class="dn-big num">' + dur(ts.mins) + '</div><div class="faint">' + (r && r.seatedAt ? 'seated ' + esc(F.time(fromMin(isoMin(r.seatedAt)))) : 'seated') + '</div></div></div>' +
          (r && flagsHTML(r) ? '<div class="dn-flags">' + flagsHTML(r) + '</div>' : '') + '</div>';
        if (o) {
          const tt = orderTotals(o), n = o.items.reduce(function (a, l) { return a + l.qty; }, 0);
          h += '<div class="dn-det-sec"><h4>Check No. ' + o.number + '</h4><div class="dn-check-row"><span><b class="num">' + money(tt.subtotal) + '</b> · ' + n + (n === 1 ? ' item' : ' items') + ' · ' + ({ open: 'Open', fired: 'Fired, with the kitchen', served: 'Served' }[o.status] || 'Open') + '</span><button type="button" class="btn btn-sm" data-view-check="' + o.id + '">' + Club.icon('billing') + '<span>View check</span></button></div></div>';
        } else if (r && isToday) {
          h += '<div class="dn-det-sec"><h4>Check</h4><div class="dn-check-row"><span class="muted">No check open</span><button type="button" class="btn btn-sm" data-open-check="' + r.id + '">' + Club.icon('plus') + '<span>Open check</span></button></div></div>';
        }
        if (ts.next) h += nextNote(toMin(ts.next.time) - ref <= 75, 'Next booking here ' + esc(F.time(ts.next.time)) + ', ' + esc(ts.next.name) + ', party of ' + ts.next.partySize + '.');
        h += '<div class="dn-det-sec"><div class="dn-acts">' +
          (o ? '<button type="button" class="btn btn-primary" data-close-check="' + o.id + '">' + Club.icon('billing') + '<span>' + (o.items.length ? 'Close check' : 'Void empty check') + '</span></button>' : (r ? '<button type="button" class="btn btn-primary" data-res-act="completed" data-id="' + r.id + '">Complete and clear</button>' : '')) +
          (r && !(o && o.reservationId === r.id) ? '<button type="button" class="btn" data-res-act="confirmed" data-id="' + r.id + '" title="Seated by mistake: back to confirmed">Unseat</button>' : '') +
          (r ? '<button type="button" class="btn btn-icon" data-edit-res="' + r.id + '" title="Edit reservation" aria-label="Edit reservation for ' + esc(r.name) + '">' + Club.icon('edit') + '</button>' : '') + '</div>' +
          (o ? '<p class="faint dn-det-foot">Closing the check completes the party and flags the table for clearing.</p>' : '') + '</div>';
      } else if (ts.state === 'clear') {
        const done = orders().filter(function (o) { return o.reservationId === r.id && o.closedAt; }).sort(function (a, b) { return String(b.closedAt).localeCompare(String(a.closedAt)); })[0];
        h += '<div class="dn-det-sec"><div class="muted dn-small">Last party</div><div class="nm">' + esc(r.name) + ', ' + r.partySize + (r.partySize === 1 ? ' guest' : ' guests') + '</div><div class="muted dn-small">' + (done ? 'Completed ' + esc(F.time(fromMin(isoMin(done.closedAt)))) + ', ' + dur(nowMin() - isoMin(done.closedAt)) + ' ago' : 'Completed, not cleared yet') + '</div></div>';
        if (ts.next) h += nextNote(true, 'Booked again at ' + esc(F.time(ts.next.time)) + ' for ' + esc(ts.next.name) + ', party of ' + ts.next.partySize + (toMin(ts.next.time) >= ref ? ' (in ' + dur(toMin(ts.next.time) - ref) + ')' : '') + '.');
        h += '<div class="dn-det-sec"><div class="dn-acts"><button type="button" class="btn btn-primary" data-cleared="' + esc(room + '|' + t.id) + '">' + Club.icon('check') + '<span>Mark table cleared</span></button><button type="button" class="btn" data-res-act="seated" data-id="' + r.id + '" title="Completed by mistake: seat the party again">Reopen party</button></div>' +
          '<p class="faint dn-det-foot">Completing a party leaves the table flagged until someone marks it cleared, so nobody is seated at a dirty table.</p></div>';
      } else if (ts.state === 'late' || ts.state === 'soon') {
        const tm = F.time(r.time).split(' ');
        h += '<div class="dn-det-sec">' + partyLine(r, true) + '<div class="p-fig"><div class="dn-big num">' + esc(tm[0]) + '</div><div class="' + (ts.state === 'late' ? 'late' : 'soon') + '">' + (ts.state === 'late' ? dur(ts.mins) + ' late' : ts.mins ? 'in ' + dur(ts.mins) : 'due now') + '</div></div></div>' +
          (flagsHTML(r) ? '<div class="dn-flags">' + flagsHTML(r) + '</div>' : '') + '</div>' +
          '<div class="dn-det-sec"><div class="dn-acts"><button type="button" class="btn btn-primary" data-seat="' + r.id + '">Seat now</button><button type="button" class="btn" data-res-act="no-show" data-id="' + r.id + '">No-show</button>' +
          '<button type="button" class="btn btn-icon dn-cancel" data-res-act="cancelled" data-id="' + r.id + '" title="Cancel reservation" aria-label="Cancel reservation for ' + esc(r.name) + '">' + Club.icon('close') + '</button><button type="button" class="btn btn-icon" data-edit-res="' + r.id + '" title="Edit reservation" aria-label="Edit reservation for ' + esc(r.name) + '">' + Club.icon('edit') + '</button></div></div>';
      } else {
        h += '<div class="dn-det-sec"><div class="dn-note-box">' + Club.icon('check') + '<span>' + (ts.next ? 'Free ' + (isLive() ? 'now ' : '') + 'until ' + esc(F.time(ts.next.time)) + ' (' + dur(ts.freeFor) + '). Booked then for ' + esc(ts.next.name) + ', party of ' + ts.next.partySize + '.' : 'Free for the rest of ' + esc(state.service.toLowerCase()) + '. No more bookings at this table.') + '</span></div>';
        const cleared = isToday ? dayRes(state.date).filter(function (x) { return x.venue === room && x.table === t.id && x.status === 'completed' && x.clearedAt; }).sort(function (a, b) { return String(b.clearedAt).localeCompare(String(a.clearedAt)); })[0] : null;
        if (cleared && Club.date.iso(new Date(cleared.clearedAt)) === today() && nowMin() - isoMin(cleared.clearedAt) <= 120) h += '<div class="dn-cleared-line"><span class="muted">Cleared at ' + esc(F.time(fromMin(isoMin(cleared.clearedAt)))) + ' after ' + esc(cleared.name) + '.</span><button type="button" class="s-link" data-uncleared="' + cleared.id + '">Not cleared yet</button></div>';
        h += '</div>';
        if (isToday) {
          const p = Math.min(fl.here, t.seats);
          h += '<form class="dn-det-sec dn-walkform" data-walk="' + esc(t.id) + '" novalidate><h4 id="dn-here-l">Seat a walk-in here</h4><div class="dn-wp-row"><span class="dn-big-step" role="group" aria-labelledby="dn-here-l"><button type="button" data-hp="-1" aria-label="Fewer guests"' + (p <= 1 ? ' disabled' : '') + '>&minus;</button><span aria-live="polite">' + p + '</span><button type="button" data-hp="1" aria-label="More guests"' + (p >= t.seats ? ' disabled' : '') + '>+</button></span>' +
            '<input class="input dn-here-name" name="name" placeholder="Guest name" aria-label="Guest name" value="' + esc(fl.walk.name) + '" autocomplete="off"></div>' +
            '<div class="field"><label for="dn-here-mem">Member</label>' + memberSelect('dn-here-mem', fl.walk.memberId) + '</div>' +
            '<label class="check"><input type="checkbox" name="check"' + (fl.walk.check ? ' checked' : '') + '> Open a check now</label>' +
            '<div class="dn-acts"><button type="submit" class="btn btn-primary dn-go">Seat walk-in at ' + esc(t.id) + '</button></div></form>';
        } else h += '<div class="dn-det-sec"><p class="muted dn-none">Walk-ins can only be seated for today.</p></div>';
      }
      if (ts.state !== 'seated') {
        const unassigned = dayRes(state.date).filter(function (x) { return x.venue === room && !x.table && serviceOf(x.time) === state.service && x.status === 'confirmed'; });
        h += '<div class="dn-det-sec"><h4>Or assign a booking without a table</h4>' + (unassigned.length ? '<ul class="dn-fit">' + unassigned.map(function (x) {
          const fits = x.partySize <= t.seats;
          return '<li><div class="f-main"><b>' + esc(x.name) + '</b><div class="f-sub">' + esc(F.time(x.time)) + ' · party of ' + x.partySize + (fits ? '' : ' · too large for this table') + '</div></div><button type="button" class="btn btn-sm" data-assign-to="' + esc(t.id) + '" data-id="' + x.id + '"' + (fits ? '' : ' disabled') + '>Assign</button></li>';
        }).join('') + '</ul>' : '<p class="muted dn-none">Every ' + esc(state.service.toLowerCase()) + ' booking in ' + esc(short(room)) + ' has a table.</p>') + '</div>';
      }
      if (ts.list.length) h += '<div class="dn-det-sec"><h4>' + esc(state.service) + ' at ' + esc(t.id) + '</h4>' + ts.list.map(function (x) {
        return '<div class="dn-at-row"><span class="at-main">' + esc(F.time(x.time)) + ' · ' + esc(x.name) + ' · ' + x.partySize + '</span><span class="faint">' + esc(needsClear(x) ? 'needs clearing' : x.status) + '</span>' + moreBtn(x, '') + '</div>';
      }).join('') + '</div>';
      return h + '</section>';
    }

    function draw() {
      closeMenus();
      const room = state.room, st = roomStates(room), other = PLAN_VENUES.map(function (v) { return v === room ? st : roomStates(v); });
      if (fl.mode === 'walkin' && state.date !== today()) fl.mode = 'host';
      const c = { free: 0, seated: 0, soon: 0, late: 0, clear: 0 };
      Object.keys(st).forEach(function (k) { c[st[k].state]++; });
      const v = view(), isToday = state.date === today(), liveNow = isLive();
      const rail = fl.mode === 'walkin' ? walkinRail(room, st) : fl.mode === 'table' ? tableRail(room, st) : hostRail(room, st);
      const chips = [['free', 'Free'], ['seated', 'Seated'], ['soon', 'Arriving within 30 min'], ['late', 'Late'], ['clear', 'Needs clearing']];
      const dateLabel = (isToday ? (state.service === 'Dinner' ? 'Tonight, ' : 'Today, ') : '') + F.weekday(state.date) + ' ' + F.dateShort(state.date);
      const dateShortLabel = isToday ? (state.service === 'Dinner' ? 'Tonight' : 'Today') : F.weekday(state.date) + ' ' + F.dateShort(state.date);
      root.innerHTML = '<div class="dn-fl-bar"><div class="segmented dn-room-switch" role="group" aria-label="Room">' + PLAN_VENUES.map(function (r, i) {
          let free = 0; Object.keys(other[i]).forEach(function (k) { if (other[i][k].state === 'free') free++; });
          return '<button type="button" data-room="' + esc(r) + '" class="' + (room === r ? 'active' : '') + '" aria-pressed="' + (room === r) + '">' + esc(short(r)) + ' <span class="dn-seg-n">' + free + ' free</span></button>';
        }).join('') + '</div>' +
        '<span class="dn-clock">' + (liveNow ? '<span class="live" aria-hidden="true"></span>' + esc(state.service) + ', live <span class="faint">· ' + esc(F.time(nowHM())) + '</span>' : esc(state.service) + ' <span class="faint">· ' + esc(isToday ? 'today' : F.weekday(state.date) + ' ' + F.dateShort(state.date)) + '</span>') + '</span><span class="dn-spacer"></span>' +
        '<span class="dn-fl-date"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-day-step="-1" aria-label="Previous day" title="Previous day">' + Club.icon('chevronLeft') + '</button><button type="button" class="btn btn-sm dn-fl-datebtn" data-cal aria-label="Choose a date, ' + esc(dateLabel) + '">' + Club.icon('calendar') + '<span class="dl-long">' + esc(dateLabel) + '</span><span class="dl-short">' + esc(dateShortLabel) + '</span></button><button type="button" class="btn btn-ghost btn-icon btn-sm" data-day-step="1" aria-label="Next day" title="Next day">' + Club.icon('chevronRight') + '</button>' +
        (isToday ? '' : '<button type="button" class="btn btn-sm dn-today" data-today>Today</button>') + '<div class="dn-dp-host" hidden></div></span>' +
        '<div class="segmented dn-svc-switch dn-fl-svc" role="group" aria-label="Service">' + SERVICES.map(function (s) { return '<button type="button" data-fl-svc="' + s.id + '" class="' + (state.service === s.id ? 'active' : '') + '" aria-pressed="' + (state.service === s.id) + '">' + s.id + '</button>'; }).join('') + '</div></div>' +
        '<div class="dn-fl-grid"><section class="panel dn-fl-plan"><div class="dn-fl-head"><div class="dn-chips" role="group" aria-label="Show tables">' + chips.map(function (x) {
          return '<button type="button" class="dn-fchip' + (fl.filter === x[0] ? ' on' : '') + '" data-filter="' + x[0] + '" aria-pressed="' + (fl.filter === x[0]) + '"><i class="sw-' + x[0] + '"></i>' + x[1] + ' <b>' + c[x[0]] + '</b></button>';
        }).join('') + '</div>' +
        '<div class="segmented dn-layout" role="group" aria-label="Layout"><button type="button" data-fview="plan" class="' + (v === 'plan' ? 'active' : '') + '" aria-pressed="' + (v === 'plan') + '">Plan</button><button type="button" data-fview="tiles" class="' + (v === 'tiles' ? 'active' : '') + '" aria-pressed="' + (v === 'tiles') + '">Tables</button></div></div>' +
        (v === 'plan' ? '<div class="dn-plan-wrap">' + planSVG(room, st) + '</div>' : tilesHTML(room, st)) +
        '<div class="dn-fl-foot"><span>Click a table to seat, clear or check on it.</span><span>Times inside a seated table are minutes since seating.</span><span>Free tables show how long they stay free.</span></div></section>' +
        '<aside class="dn-rail" aria-label="Host stand">' + rail + '</aside></div>';
      dp = mountDate(root, function () { fl.mode = fl.mode === 'table' ? 'host' : fl.mode; draw(); });
    }
    function selectTable(id) {
      fl.sel = id; fl.mode = 'table'; draw();
      if (isPhone()) { const r = root.querySelector('.dn-rail'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    }
    function walkForm(form) {
      const f = U.formData(form);
      fl.walk.name = f.name || ''; fl.walk.memberId = f.memberId || ''; fl.walk.check = !!f.check;
      return f;
    }
    wireShared(panel);
    U.on(panel, 'click', '[data-room]', function (e, b) { state.room = b.dataset.room; fl.sel = null; if (fl.mode === 'table') fl.mode = 'host'; fl.walk.pick = null; draw(); });
    U.on(panel, 'click', '[data-fl-svc]', function (e, b) { state.service = b.dataset.flSvc; if (fl.mode === 'walkin' && state.service !== currentService()) fl.mode = 'host'; draw(); });
    U.on(panel, 'click', '[data-day-step]', function (e, b) { state.date = Club.date.addDays(state.date, +b.dataset.dayStep); if (fl.mode === 'table') fl.mode = 'host'; draw(); });
    U.on(panel, 'click', '[data-today]', function () { state.date = today(); state.service = currentService(); draw(); });
    U.on(panel, 'click', '[data-cal]', function () { if (dp && dp.open) dp.open(); });
    U.on(panel, 'click', '[data-filter]', function (e, b) { fl.filter = fl.filter === b.dataset.filter ? null : b.dataset.filter; draw(); });
    U.on(panel, 'click', '[data-fview]', function (e, b) { fl.view = b.dataset.fview; draw(); });
    U.on(panel, 'click', '[data-walkin]', function () {
      if (state.service !== currentService()) state.service = currentService();
      fl.mode = 'walkin'; fl.sel = null; fl.walk.pick = null; fl.filter = null; draw();
      if (isPhone()) { const r = root.querySelector('.dn-rail'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    U.on(panel, 'click', '[data-host]', function () { fl.mode = 'host'; fl.sel = null; draw(); });
    U.on(panel, 'click', '[data-wp]', function (e, b) { fl.walk.party = Math.max(1, Math.min(20, fl.walk.party + +b.dataset.wp)); draw(); const n = U.$('[data-wp="' + b.dataset.wp + '"]', panel); if (n && !n.disabled) n.focus(); });
    U.on(panel, 'click', '[data-hp]', function (e, b) { const t = tableDef(state.room, fl.sel); fl.here = Math.max(1, Math.min(t ? t.seats : 20, Math.min(fl.here, t ? t.seats : 20) + +b.dataset.hp)); draw(); const n = U.$('[data-hp="' + b.dataset.hp + '"]', panel); if (n && !n.disabled) n.focus(); });
    U.on(panel, 'click', '[data-pick]', function (e, b) { fl.walk.pick = fl.walk.pick === b.dataset.pick ? null : b.dataset.pick; draw(); });
    U.on(panel, 'input', '.dn-walkform', function (e, form) { walkForm(form); });
    U.on(panel, 'change', '.dn-walkform', function (e, form) { walkForm(form); });
    U.on(panel, 'submit', '.dn-walkform', function (e, form) {
      e.preventDefault();
      const f = walkForm(form), tid = form.dataset.walk === 'pick' ? fl.walk.pick : form.dataset.walk;
      if (!tid) { U.toast('Choose a table first', 'bad'); return; }
      const party = form.dataset.walk === 'pick' ? fl.walk.party : Math.min(fl.here, (tableDef(state.room, tid) || { seats: 1 }).seats);
      if (seatWalkIn(state.room, tid, { party: party, name: f.name, memberId: f.memberId, check: !!f.check })) {
        fl.walk = { party: 2, pick: null, name: '', memberId: '', check: true }; fl.here = 2; fl.mode = 'table'; fl.sel = tid; draw();
      }
    });
    U.on(panel, 'click', '[data-table]', function (e, g) {
      const id = g.dataset.table;
      if (fl.mode === 'walkin') {
        const t = tableDef(state.room, id), ts = roomStates(state.room)[id];
        if (ts.state === 'free' && t.seats >= fl.walk.party) { fl.walk.pick = id; draw(); }
        else U.toast(tableLabel(state.room, id) + (ts.state !== 'free' ? ' is not free' : ' seats ' + t.seats), 'bad');
        return;
      }
      selectTable(id);
    });
    U.on(panel, 'keydown', '[data-table], [data-arr], [data-tsel]', function (e, g) { if ((e.key === 'Enter' || e.key === ' ') && e.target === g) { e.preventDefault(); g.click(); } });
    U.on(panel, 'click', '[data-seat]', function (e, b) {
      e.stopPropagation();
      const r = S.find('diningReservations', b.dataset.seat); if (!r) return;
      setStatus(r, 'seated').then(function (ok) {
        if (!ok) return;
        if (r.venue !== state.room && PLAN_VENUES.indexOf(r.venue) >= 0) state.room = r.venue;
        if (r.table) { fl.sel = r.table; fl.mode = 'table'; }
        draw();
      });
    });
    U.on(panel, 'click', '[data-arr]', function (e, li) {
      if (e.target.closest('button')) return;
      const r = S.find('diningReservations', li.dataset.arr); if (!r) return;
      if (!r.table) { reservationModal(r); return; }
      const g = root.querySelector('.dn-plan [data-table="' + r.table + '"]');
      selectTable(r.table);
      const g2 = root.querySelector('.dn-plan [data-table="' + r.table + '"]');
      if (g || g2) { const n = g2 || g; n.classList.remove('ping'); void n.getBoundingClientRect(); n.classList.add('ping'); }
    });
    U.on(panel, 'click', '[data-tsel]', function (e, li) { selectTable(li.dataset.tsel); });
    U.on(panel, 'click', '[data-arr-all]', function () { fl.arrAll = true; draw(); });
    U.on(panel, 'click', '[data-fl-gone]', function () { fl.gone = !fl.gone; draw(); });
    U.on(panel, 'click', '[data-fl-new]', function () { reservationModal(null, { date: state.date, venue: state.room, time: state.date === today() && state.service === currentService() ? quarterNow() : { Breakfast: '08:00', Lunch: '12:30', Dinner: '19:00' }[state.service] }); });
    redraw = draw;
    draw();
  }

  /* ------------------------------------------------------------------
     Orders tab
     ------------------------------------------------------------------ */
  function renderOrders(panel) {
    panel.innerHTML = '<div class="dn-orders-root"></div>';
    const root = U.$('.dn-orders-root', panel);
    function draw() {
      const all = openOrders().filter(function (o) { return state.orderVenue === 'All' || o.venue === state.orderVenue; })
        .sort(function (a, b) { return String(a.openedAt || a.time).localeCompare(String(b.openedAt || b.time)); });
      const closedToday = orders().filter(function (o) { return o.status === 'closed' && o.date === today(); }).sort(function (a, b) { return String(b.closedAt).localeCompare(String(a.closedAt)); });
      const venueCount = function (v) { return openOrders().filter(function (o) { return v === 'All' || o.venue === v; }).length; };
      const short = { 'Gallery Taphouse & Grill': 'Gallery', 'Taphouse Bar': 'Bar', 'Patio': 'Patio', 'Banquet Hall': 'Banquet' };
      const kitchen = all.filter(function (o) { return o.status === 'fired'; }).length;
      const settled = closedToday.reduce(function (a, o) { return a + (o.grandTotal || 0); }, 0);
      root.innerHTML = '<div class="dn-orders-bar">' +
        '<div class="segmented dn-ov" role="group" aria-label="Venue">' + ['All'].concat(VENUES).map(function (v) {
          return '<button type="button" data-ov="' + esc(v) + '" class="' + (state.orderVenue === v ? 'active' : '') + '" aria-pressed="' + (state.orderVenue === v) + '">' + esc(v === 'All' ? 'All venues' : short[v]) + ' <span class="dn-seg-n">' + venueCount(v) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="dn-orders-meta muted">' + all.length + (all.length === 1 ? ' open check' : ' open checks') + (kitchen ? ' · ' + kitchen + ' with the kitchen' : '') + '</div>' +
        U.btn('Open check', { kind: 'primary', icon: 'plus', action: 'new-check', sm: true }) + '</div>' +
        (all.length ? '<div class="dn-tickets">' + all.map(ticketHTML).join('') + '</div>' :
          '<div class="panel dn-pass-clear" data-reveal>' + U.empty({ icon: 'chef', title: 'The pass is clear', text: 'No open checks' + (state.orderVenue === 'All' ? '' : ' in the ' + state.orderVenue) + '. Open a check for a seated table to send orders to the kitchen.', action: U.btn('Open check', { kind: 'primary', icon: 'plus', action: 'new-check' }) }) + '</div>') +
        Portal.accordion({ id: 'dn-closed', icon: 'billing', open: !!state.closedOpen, title: 'Closed today', summary: closedToday.length ? closedToday.length + (closedToday.length === 1 ? ' check' : ' checks') + ' settled · ' + money(settled) : 'No checks settled yet today',
          body: closedToday.length ? '<div class="table-wrap"><table class="table dn-closed-table"><thead><tr><th>Check</th><th>Table</th><th>Party</th><th>Settled to</th><th class="num">Total</th><th class="right"><span class="sr-only">Actions</span></th></tr></thead><tbody>' + closedToday.map(function (o) {
            return '<tr><td class="num muted">No. ' + o.number + '</td><td>' + esc(o.table ? tableLabel(o.venue, o.table) : o.venue) + '<div class="person-sub">' + esc(o.venue) + '</div></td><td class="primary-cell">' + esc(o.name || 'Guest') + '<div class="person-sub">' + (o.covers || 1) + ' covers</div></td><td>' + esc(o.payment || '') + '</td><td class="num">' + money(o.grandTotal || o.total) + '</td><td class="right"><button type="button" class="btn btn-ghost btn-sm" data-reopen="' + o.id + '" title="Reverse the payment and open the check again">Reopen</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="muted">Closed checks appear here with their tender and total.</p>' });
      U.animateIn(root);
      tick();
      if (state.focusOrder) {
        const el = root.querySelector('[data-order="' + state.focusOrder + '"]');
        if (el) { el.classList.add('focus'); setTimeout(function () { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 150); }
        state.focusOrder = null;
      }
    }
    function ticketHTML(o) {
      const tt = orderTotals(o);
      const unfired = o.items.filter(function (l) { return !l.fired; }).reduce(function (a, l) { return a + l.qty; }, 0);
      const since = o.status === 'fired' && o.firedAt ? o.firedAt : (o.openedAt || (o.date + 'T' + o.time + ':00'));
      const b = ORDER_BADGE[o.status] || ['Open', 'brass'];
      return '<article class="dn-ticket st-' + o.status + '" data-order="' + o.id + '" data-reveal>' +
        '<header class="dn-ticket-head"><div class="dn-ticket-table">' + esc(o.table || 'Bar') + '</div>' +
        '<div class="dn-ticket-who"><div class="person-name">' + esc(o.name || 'Guest') + '</div><div class="person-sub">' + esc(o.venue) + ' · ' + (o.covers || 1) + (o.covers === 1 ? ' cover' : ' covers') + '</div></div>' +
        '<div class="dn-age' + (o.status === 'fired' ? ' kitchen' : '') + '" data-since="' + esc(since) + '"><span class="dn-age-label">' + (o.status === 'fired' ? 'Fired' : o.status === 'served' ? 'Seated' : 'Open') + '</span><span class="dn-age-val num">0:00</span></div></header>' +
        '<div class="dn-ticket-meta"><span>Check No. ' + o.number + '</span>' + U.badge(b[0], b[1]) + '</div>' +
        '<ul class="dn-lines">' + (o.items.length ? o.items.map(function (l, i) {
          return '<li class="' + (l.fired ? 'fired' : 'new') + '"><span class="dn-qty">' + l.qty + '</span><span class="dn-line-name">' + esc(l.name) + (l.fired ? '' : '<span class="dn-new">New</span>') + '</span><span class="num dn-line-price">' + money(l.qty * l.price) + '</span>' +
            (l.fired ? '' : '<button type="button" class="dn-line-x" data-rm="' + i + '" aria-label="Remove ' + esc(l.name) + '">' + Club.icon('close') + '</button>') + '</li>';
        }).join('') : '<li class="dn-lines-empty">Nothing ordered yet.</li>') + '</ul>' +
        '<div class="dn-ticket-total"><span>Subtotal</span><span class="num">' + money(tt.subtotal) + '</span></div>' +
        '<footer class="dn-ticket-foot">' +
        '<button type="button" class="btn btn-sm" data-o="add">' + Club.icon('plus') + '<span>Items</span></button>' +
        (unfired ? '<button type="button" class="btn btn-sm btn-primary dn-fire" data-o="fire">' + Club.icon('chef') + '<span>Fire ' + unfired + '</span></button>' : '') +
        (o.status === 'fired' && !unfired ? '<button type="button" class="btn btn-sm" data-o="serve">' + Club.icon('check') + '<span>Served</span></button>' : '') +
        (o.status === 'served' && !unfired ? '<button type="button" class="btn btn-sm btn-ghost" data-o="unserve" title="Marked served by mistake">Back to kitchen</button>' : '') +
        (o.items.length ? '<button type="button" class="btn btn-sm' + (unfired ? '' : ' btn-primary') + '" data-o="close"' + (unfired ? ' disabled title="Fire new items first"' : '') + '>' + Club.icon('billing') + '<span>Close</span></button>' : '<button type="button" class="btn btn-sm btn-danger" data-o="void">Void</button>') +
        '</footer></article>';
    }
    U.on(panel, 'click', '[data-ov]', function (e, b) { state.orderVenue = b.dataset.ov; draw(); const n = U.$('[data-ov="' + b.dataset.ov + '"]', panel); if (n) n.focus(); });
    U.on(panel, 'accordion', '[data-acc="dn-closed"]', function (e) { state.closedOpen = e.detail.open; });
    U.on(panel, 'click', '[data-action=new-check]', function () { newCheckModal({ venue: state.orderVenue !== 'All' ? state.orderVenue : BAR }); });
    U.on(panel, 'click', '[data-o]', function (e, b) {
      const o = S.find('diningOrders', b.closest('[data-order]').dataset.order); if (!o) return;
      const a = b.dataset.o;
      if (a === 'add') addItemsModal(o); else if (a === 'fire') fireOrder(o); else if (a === 'serve') serveOrder(o); else if (a === 'close') closeModal(o); else if (a === 'void') voidOrder(o); else if (a === 'unserve') unserveOrder(o);
    });
    U.on(panel, 'click', '[data-reopen]', function (e, b) { const o = S.find('diningOrders', b.dataset.reopen); if (o) reopenCheck(o); });
    U.on(panel, 'click', '[data-rm]', function (e, b) { const o = S.find('diningOrders', b.closest('[data-order]').dataset.order); if (o) removeLine(o, +b.dataset.rm); });
    redraw = draw;
    draw();
  }
  function tick() {
    U.$$('.dn-age[data-since]').forEach(function (el) {
      const ms = Date.now() - new Date(el.dataset.since).getTime();
      const v = el.querySelector('.dn-age-val'); if (v) v.textContent = ageText(ms);
      const m = ms / 60000;
      el.classList.toggle('late', el.classList.contains('kitchen') && m >= 20 && m < 35);
      el.classList.toggle('overdue', el.classList.contains('kitchen') && m >= 35);
    });
  }

  /* ------------------------------------------------------------------
     Menu tab
     ------------------------------------------------------------------ */
  function menuItemModal(item) {
    const isNew = !item;
    const d = item || { name: '', section: 'Handhelds', price: '', description: '', venue: 'All', available: true, dietary: [] };
    const body = '<form class="form-grid" novalidate>' +
      U.field({ label: 'Menu item', name: 'name', value: d.name, required: true, span2: true, placeholder: 'Smashburger' }) +
      U.field({ label: 'Section', name: 'section', type: 'select', options: U.options(SECTIONS, d.section) }) +
      U.field({ label: 'Price', name: 'price', type: 'number', value: d.price, required: true, min: 0, step: '0.01' }) +
      U.field({ label: 'Served in', name: 'venue', type: 'select', options: U.options([{ value: 'All', label: 'All venues' }, { value: GALLERY, label: 'Gallery Taphouse & Grill only' }, { value: BAR, label: 'Taphouse Bar only' }], d.venue) }) +
      '<div class="field"><label>Availability</label><label class="check dn-avail"><span class="toggle"><input type="checkbox" name="available"' + (d.available ? ' checked' : '') + '><span></span></span> On the menu tonight</label></div>' +
      U.field({ label: 'Description', name: 'description', type: 'textarea', value: d.description, span2: true, placeholder: 'Bacon, cheese, pickles, tomato, onions, lettuce' }) +
      '<div class="field span-2"><label>Dietary</label><div class="row wrap">' + DIETARY.map(function (t) { return '<label class="check"><input type="checkbox" name="diet_' + t + '"' + ((d.dietary || []).indexOf(t) >= 0 ? ' checked' : '') + '> ' + DIET_LABEL[t] + ' (' + t + ')</label>'; }).join('') + '</div></div>' +
      '</form>';
    const actions = [{ label: 'Cancel', kind: 'ghost' }];
    if (!isNew) actions.unshift({
      label: 'Delete', kind: 'danger', icon: 'trash', onClick: function () {
        U.confirm({ title: 'Remove from the menu?', text: item.name + ' will be deleted. Open checks keep their lines.', confirmLabel: 'Delete item', danger: true }).then(function (ok) {
          if (!ok) return;
          Club.undo.run(function () { S.remove('menuItems', item.id); }, { message: item.name + ' deleted from the menu', after: refresh, undone: item.name + ' is back on the menu' });
          refresh();
        });
      }
    });
    actions.push({
      label: isNew ? 'Add to menu' : 'Save item', kind: 'primary', onClick: function (api) {
        const form = U.$('form', api.body); clearErrors(form);
        if (!U.validate(form)) return false;
        const f = U.formData(form);
        if (!(f.price > 0)) { fieldError(form, 'price', 'Enter a price above zero.'); return false; }
        if (menu().some(function (m) { return m.name.toLowerCase() === f.name.toLowerCase() && m.section === f.section && (isNew || m.id !== item.id); })) { fieldError(form, 'name', 'This dish is already listed in ' + f.section + '.'); return false; }
        const doc = { name: f.name, section: f.section, price: r2(f.price), venue: f.venue, available: f.available, description: f.description, dietary: DIETARY.filter(function (t) { return f['diet_' + t]; }) };
        Club.undo.run(function () { if (isNew) S.insert('menuItems', Object.assign({ id: S.uid('menu') }, doc)); else S.update('menuItems', item.id, doc); },
          { message: isNew ? doc.name + ' added to the menu' : 'Menu item saved', after: refresh, undone: isNew ? doc.name + ' taken off the menu' : 'Changes to ' + item.name + ' undone' });
        refresh();
      }
    });
    U.modal({ eyebrow: isNew ? 'Menu' : item.section, title: isNew ? 'Add menu item' : 'Edit menu item', body: body, actions: actions });
  }
  /* Menu: one collapsible section per course (the current meal's sections open), a search across the whole
     menu, and the 86 switch on every dish. */
  function menuOpenDefault() {
    const phone = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    return currentService() === 'Breakfast' ? ['Breakfast'] : (phone ? ['Main attractions'] : ['Handhelds', 'Main attractions']);
  }
  function renderMenu(panel) {
    panel.innerHTML = '<div class="dn-menu-root"></div>';
    const root = U.$('.dn-menu-root', panel);
    if (!state.menuOpen) { state.menuOpen = {}; menuOpenDefault().forEach(function (k) { state.menuOpen[k] = true; }); }
    function dishHTML(m) {
      return '<li class="dn-dish' + (m.available ? '' : ' off') + '" data-item="' + m.id + '">' +
        '<div class="dn-dish-main"><div class="dn-dish-line"><span class="dn-dish-name">' + esc(m.name) + '</span>' +
        (m.dietary || []).map(function (t) { return '<span class="dn-tag" title="' + DIET_LABEL[t] + '">' + t + '</span>'; }).join('') +
        (m.venue !== 'All' ? '<span class="dn-dish-venue">' + esc(m.venue) + ' only</span>' : '') +
        (m.available ? '' : '<span class="dn-86">86</span>') + '</div>' +
        (m.description ? '<div class="dn-dish-desc">' + esc(m.description) + '</div>' : '') + '</div>' +
        '<span class="dn-dish-price num">' + menuPrice(m.price) + '</span>' +
        '<span class="dn-dish-tools"><label class="toggle" title="' + (m.available ? 'Mark as 86, unavailable' : 'Return to the menu') + '"><input type="checkbox" data-avail="' + m.id + '"' + (m.available ? ' checked' : '') + ' aria-label="' + esc(m.name) + ' available"><span></span></label>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit-item="' + m.id + '" title="Edit ' + esc(m.name) + '" aria-label="Edit ' + esc(m.name) + '">' + Club.icon('edit') + '</button></span></li>';
    }
    function countText(n) { const off = menu().filter(function (x) { return !x.available; }).length; return n + ' items' + (off ? ' · ' + off + ' 86\'d tonight' : ''); }
    function draw() {
      const q = state.menuQ.toLowerCase().trim();
      const list = menu().filter(function (m) { return (state.menuVenue === 'All' || m.venue === 'All' || m.venue === state.menuVenue) && (!q || (m.name + ' ' + m.description + ' ' + m.section).toLowerCase().indexOf(q) >= 0); });
      const secs = SECTIONS.filter(function (sec) { return list.some(function (m) { return m.section === sec; }); });
      root.innerHTML = '<div class="dn-menu-bar">' +
        U.segmented([{ value: 'All', label: 'All venues' }, { value: GALLERY, label: 'The Gallery' }, { value: BAR, label: 'Taphouse Bar' }], state.menuVenue, 'menuvenue') +
        '<label class="dn-search dn-menu-search">' + Club.icon('search') + '<input class="input" type="search" name="menuq" placeholder="Search dishes" aria-label="Search the menu" value="' + esc(state.menuQ) + '"></label>' +
        '<span class="muted dn-menu-count">' + countText(list.length) + '</span>' +
        '<button type="button" class="s-link" data-menu-all>' + (secs.every(function (k) { return state.menuOpen[k]; }) ? 'Collapse all' : 'Expand all') + '</button>' +
        U.btn('Add menu item', { kind: 'primary', icon: 'plus', action: 'add-item', sm: true }) + '</div>' +
        (secs.length ? '<div class="dn-menu-cols">' + secs.map(function (sec) {
          const items = list.filter(function (m) { return m.section === sec; });
          const off = items.filter(function (m) { return !m.available; }).length;
          return Portal.accordion({ id: 'dn-sec-' + sec.replace(/\W+/g, '-').toLowerCase(), title: sec, summary: items.length + (items.length === 1 ? ' item' : ' items') + (off ? ' · ' + off + ' 86\'d' : ''), open: !!q || !!state.menuOpen[sec],
            body: '<ul class="dn-dishes">' + items.map(dishHTML).join('') + '</ul>' }).replace('class="pk-acc', 'data-sec="' + esc(sec) + '" class="pk-acc');
        }).join('') + '</div>' : U.empty({ icon: q ? 'search' : 'dining', title: q ? 'No dishes found' : 'The menu is empty', text: q ? 'Nothing on this menu matches that search.' : 'Add the first dish to build this menu.', action: q ? '' : U.btn('Add menu item', { kind: 'primary', icon: 'plus', action: 'add-item' }) })) +
        '<p class="dn-menu-foot muted">GF gluten free · V vegetarian · VG vegan. Breakfast served until 2 PM. A service charge of ' + F.pct(SERVICE_CHARGE * 100) + ' is added to every check.</p>';
      U.animateIn(root);
    }
    U.on(panel, 'click', '.segmented button', function (e, b) { state.menuVenue = b.dataset.value; draw(); });
    U.on(panel, 'input', 'input[name=menuq]', function (e, i) { state.menuQ = i.value; const pos = i.selectionStart; draw(); const n = U.$('input[name=menuq]', panel); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } });
    U.on(panel, 'accordion', '[data-sec]', function (e, acc) { if (!state.menuQ) state.menuOpen[acc.dataset.sec] = e.detail.open; const l = U.$('[data-menu-all]', panel); if (l) l.textContent = U.$$('.pk-acc[data-sec]', panel).every(function (x) { return x.classList.contains('is-open'); }) ? 'Collapse all' : 'Expand all'; });
    U.on(panel, 'click', '[data-menu-all]', function () {
      const accs = U.$$('.pk-acc[data-sec]', panel); const open = !accs.every(function (x) { return x.classList.contains('is-open'); });
      accs.forEach(function (x) { state.menuOpen[x.dataset.sec] = open; }); draw();
    });
    U.on(panel, 'click', '[data-action=add-item]', function () { menuItemModal(null); });
    U.on(panel, 'click', '[data-edit-item]', function (e, b) { const m = S.find('menuItems', b.dataset.editItem); if (m) menuItemModal(m); });
    U.on(panel, 'change', '[data-avail]', function (e, i) {
      const m = S.find('menuItems', i.dataset.avail); if (!m) return;
      Club.undo.run(function () { S.update('menuItems', m.id, { available: i.checked }); },
        { message: i.checked ? m.name + ' is back on the menu' : m.name + ' is 86\'d for service', after: refresh, undone: i.checked ? m.name + ' is 86\'d again' : m.name + ' is back on the menu' });
      const dish = i.closest('.dn-dish'); dish.classList.toggle('off', !i.checked);
      const line = dish.querySelector('.dn-dish-line'); const tag = line.querySelector('.dn-86');
      if (!i.checked && !tag) line.insertAdjacentHTML('beforeend', '<span class="dn-86">86</span>'); else if (i.checked && tag) tag.remove();
      const cnt = root.querySelector('.dn-menu-count'); if (cnt) cnt.textContent = countText(root.querySelectorAll('.dn-dish').length);
      const acc = dish.closest('.pk-acc'); const sum = acc && acc.querySelector('.pk-acc-sum');
      if (sum) { const all = acc.querySelectorAll('.dn-dish').length, off = acc.querySelectorAll('.dn-dish.off').length; sum.textContent = all + (all === 1 ? ' item' : ' items') + (off ? ' · ' + off + ' 86\'d' : ''); }
    });
    redraw = draw;
    draw();
  }

  /* ------------------------------------------------------------------
     Registration
     ------------------------------------------------------------------ */
  Club.register({
    id: 'dining', label: 'Dining & Banquets', icon: 'dining', section: 'Hospitality', order: 10,
    search: function (q) {
      const from = Club.date.fromToday(-1);
      return reservations().filter(function (r) { return r.date >= from && r.name.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, 4)
        .map(function (r) { return { label: r.name, sub: serviceOf(r.time) + ' · ' + F.dateShort(r.date) + ' at ' + F.time(r.time) + ' · ' + r.venue + ' · party of ' + r.partySize, href: 'dining/' + r.date, icon: 'dining' }; });
    },
    render: function (view, params) {
      if (!state.date) state.date = today();
      if (!state.service) state.service = currentService();
      const tabs = [
        { id: 'reservations', label: 'Reservations', render: renderReservations },
        { id: 'floor', label: 'Floor plan', render: renderFloor },
        { id: 'orders', label: 'Orders', render: renderOrders },
        { id: 'menu', label: 'Menu', render: renderMenu }
      ];
      if (params[0] && /^\d{4}-\d{2}-\d{2}$/.test(params[0])) { state.date = params[0]; state.tab = 'reservations'; }
      else if (params[0] && tabs.some(function (t) { return t.id === params[0]; })) state.tab = params[0];
      view.innerHTML = U.pageHeader({
        eyebrow: 'Hospitality · Food and beverage', title: 'Dining & Banquets',
        subtitle: '<span class="dn-sum"></span>',
        actions: U.btn('Open check', { icon: 'billing', action: 'hdr-check' }) + U.btn('New reservation', { kind: 'primary', icon: 'plus', action: 'hdr-res' })
      }) + '<div class="dn-tabs"></div>';
      statsHost = U.$('.dn-sum', view);
      drawStats(true);
      tabsApi = U.tabs(U.$('.dn-tabs', view), tabs, state.tab, function (id) {
        state.tab = id;
        try { history.replaceState(null, '', '#/dining/' + id); } catch (e) { /* ignore */ }
      });
      drawStats(false);
      U.on(view, 'click', '[data-action=hdr-res]', function () { reservationModal(null); });
      U.on(view, 'click', '[data-action=hdr-check]', function () { newCheckModal({}); });
      /* Live clock: countdowns, minutes seated and the timeline's now line move on with the minute, unless someone is
         typing or a menu or dialog is open (the next minute catches up). */
      let lastMin = nowMin();
      const timer = setInterval(function () {
        tick();
        const m = nowMin(); if (m === lastMin) return;
        if ((state.tab !== 'floor' && state.tab !== 'reservations') || document.querySelector('.dn-menu, .overlay')) return;
        const a = document.activeElement; if (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
        lastMin = m; refresh();
      }, 1000);
      return function () { clearInterval(timer); closeMenus(); statsHost = null; tabsApi = null; redraw = function () { }; };
    }
  });
})();
