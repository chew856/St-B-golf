/* Events & Tournaments: club calendar, event registrations, tournament scoring, the clubhouse leaderboard and
   the members' league. Owns collections: events, tournaments, leagues. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/events-data.js */
  const { GOLF_TYPES, COURSE, today, memberName, isGolfer, holeList, parTotal, courseHcp, strokesOn, WEEKDAYS, PLACE_POINTS, PLAYED_POINTS, canGolf, nightDates, nineFor, nineLabel, nineHoles, leagueStatus, statusLabel, isPlayed, playedIdx, leagueBlock, weekBlock, leagueScore, awardPoints, weekRank, weekWinners, standings, leaguesSorted, pickLeague } = Club.shared.events;


  const TYPES = ['Tournament', 'Member-Guest', 'League', 'Ladies', 'Junior', 'Corporate', 'Social', 'Dining', 'Private'];
  const VENUES = ['The Course', 'Banquet Hall', 'Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio', 'Short game practice facility'];
  const FORMATS = ['Stroke play', 'Stableford', 'Four-ball', 'Scramble'];
  const TEES = [{ key: 'black', label: 'Black' }, { key: 'green', label: 'Green' }, { key: 'silver', label: 'Silver' }];
  const MINUS = '−';

  function typeKey(t) { return String(t || 'Social').toLowerCase().replace(/[^a-z]+/g, '-'); }
  function seats(ev) { return (ev.registrations || []).reduce(function (a, r) { return a + 1 + (+r.guests || 0); }, 0); }
  function feeFor(ev, guests) { return Math.round((+ev.price || 0) * (1 + (+guests || 0)) * 100) / 100; }
  function shortName(id) { const m = Club.members.get(id); return m ? m.firstName.charAt(0) + '. ' + m.lastName : 'Former member'; }
  function byDate(a, b) { return (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')); }
  /* Whole dollars read "$25"; a price with cents keeps them ("$25.50"), so the label matches what is charged. */
  function price(v) { v = +v || 0; return Math.abs(v - Math.round(v)) > 0.004 ? fmt.money(v) : fmt.money0(v); }
  function priceLabel(p) { return +p ? price(p) + ' per person' : 'Complimentary'; }
  function timeRange(ev) { return ev.start ? fmt.time(ev.start) + (ev.end ? ' – ' + fmt.time(ev.end) : '') : 'Time to be confirmed'; }
  function monthOf(iso) { return iso.slice(0, 7); }
  function monthLabel(ym) { const p = ym.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function addMonths(ym, n) { const p = ym.split('-'); const d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function statusBadge(s) { return ui.badge(s.charAt(0).toUpperCase() + s.slice(1), { draft: 'outline', published: 'good', completed: 'plain', cancelled: 'bad', upcoming: 'info', live: 'brass', final: 'dark' }[s] || 'plain'); }
  function fieldErr(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }

  /* ---------------- Undo (js/core/undo.js) ----------------
     Every staff action's toast offers Undo. undoOffer is Club.undo.offer plus check(), which may refuse first. Undoing a
     removed registration says its credit was charged again. After an Undo the events page redraws. */
  function rerender() { if (/^#\/events/.test(location.hash)) Club.app.render(); }
  function undoOffer(msg, rec, o) {
    o = o || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg, o.kind); return; }
    ui.toast(msg, o.kind, { action: { label: 'Undo', onClick: function () {
      const why = o.check && o.check(); if (why) { ui.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { (o.after || rerender)(res); } catch (e) { console.error(e); }
      const u = typeof o.undone === 'function' ? o.undone(res) : o.undone;
      ui.toast((u || 'Undone') + (res.credited > 0 ? '. ' + fmt.money(res.credited) + ' credited back' : ''));
    } } });
  }
  function undoRun(fn, o) { const rec = Club.undo.track(fn); const msg = typeof o.message === 'function' ? o.message(rec.result) : o.message; if (msg) undoOffer(msg, rec, o); return rec.result; }
  /** After undoing a create: leave the page of the record that no longer exists. */
  function leaveIf(path, to) { return function () { if (location.hash === '#/' + path) Club.app.go(to); else rerender(); }; }
  function toPar(v) { return v === 0 ? 'E' : (v < 0 ? MINUS + Math.abs(v) : '+' + v); }
  function parClass(v) { return v < 0 ? 'under' : (v === 0 ? 'even' : 'over'); }

  function calcLine(p, hs) {
    const ch = courseHcp(p.handicap, hs);
    const o = { p: p, name: memberName(p.memberId), ch: ch, thru: 0, gross: 0, parPlayed: 0, strokes: 0, pts: 0, out: 0, inn: 0, outN: 0, inN: 0 };
    (p.scores || []).forEach(function (s, i) {
      if (s == null || !hs[i]) return;
      const h = hs[i], st = strokesOn(ch, h.handicap);
      o.thru++; o.gross += s; o.parPlayed += h.par; o.strokes += st;
      o.pts += Math.max(0, 2 + h.par + st - s);
      if (i < 9) { o.out += s; o.outN++; } else { o.inn += s; o.inN++; }
    });
    o.grossToPar = o.gross - o.parPlayed;
    o.netToPar = o.gross - o.strokes - o.parPlayed;
    o.net = o.thru === 18 ? o.gross - ch : null;
    return o;
  }
  function leaderboard(t, mode) {
    const hs = holeList();
    const stable = t.format === 'Stableford';
    const lines = (t.field || []).map(function (p) { return calcLine(p, hs); });
    const key = function (l) { return stable ? -l.pts : (mode === 'gross' ? l.grossToPar : l.netToPar); };
    lines.sort(function (a, b) {
      if (!a.thru !== !b.thru) return a.thru ? -1 : 1;
      if (!a.thru) return a.name.localeCompare(b.name);
      return key(a) - key(b) || b.thru - a.thru || a.name.localeCompare(b.name);
    });
    lines.forEach(function (l, i) {
      if (!l.thru) { l.pos = ''; return; }
      const k = key(l); const first = lines.findIndex(function (x) { return x.thru && key(x) === k; });
      const tied = lines.filter(function (x) { return x.thru && key(x) === k; }).length > 1;
      l.pos = (tied ? 'T' : '') + (first + 1); l.key = k;
    });
    return lines;
  }

  /* ---------------- Module state ---------------- */
  let calMonth = monthOf(today());
  let calMode = 'month';
  let boardMode = 'net';

  /* ---------------- Event form ---------------- */
  function openEventForm(ev, presetDate) {
    const e = ev || { title: '', type: 'Social', date: presetDate || today(), start: '18:00', end: '21:00', venue: 'Banquet Hall', capacity: 60, price: 0, description: '', status: 'draft' };
    const body = '<form class="form-grid ev-form" novalidate>' +
      ui.field({ label: 'Event title', name: 'title', value: e.title, required: true, span2: true, placeholder: 'e.g. Fall Feature Night' }) +
      ui.field({ label: 'Type', name: 'type', type: 'select', options: ui.options(TYPES, e.type) }) +
      ui.field({ label: 'Venue', name: 'venue', type: 'select', options: ui.options(VENUES.indexOf(e.venue) < 0 ? VENUES.concat([e.venue]) : VENUES, e.venue) }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: e.date, required: true }) +
      '<div class="ev-form-times">' + ui.field({ label: 'Starts', name: 'start', type: 'time', value: e.start, required: true }) + ui.field({ label: 'Ends', name: 'end', type: 'time', value: e.end, required: true }) + '</div>' +
      ui.field({ label: 'Capacity (seats)', name: 'capacity', type: 'number', value: e.capacity, min: 1, step: 1, required: true, hint: ev ? seats(ev) + ' seats currently reserved' : 'Members plus their guests' }) +
      ui.field({ label: 'Price per person', name: 'price', type: 'number', value: e.price, min: 0, step: 1, hint: 'Leave at 0 for complimentary events' }) +
      ui.field({ label: 'Description', name: 'description', type: 'textarea', value: e.description, span2: true, placeholder: 'What members should know: dress code, format, what is included.' }) +
      ui.field({ label: 'Status', name: 'status', type: 'select', options: ui.options([{ value: 'draft', label: 'Draft (not visible to members)' }, { value: 'published', label: 'Published' }].concat(ev && ev.status !== 'draft' && ev.status !== 'published' ? [{ value: ev.status, label: ev.status.charAt(0).toUpperCase() + ev.status.slice(1) }] : []), e.status) }) +
      '</form>';
    ui.modal({
      title: ev ? 'Edit event' : 'Create event', eyebrow: ev ? ev.title : 'Club calendar', size: 'lg', body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: ev ? 'Save event' : 'Create event', kind: 'primary', icon: 'check', onClick: function (api) {
          const form = ui.$('form', api.body);
          clearErrs(form);
          if (!ui.validate(form)) return false;
          const d = ui.formData(form); let ok = true;
          if (d.end <= d.start) { fieldErr(form, 'end', 'End time must be after the start.'); ok = false; }
          if (!(d.capacity >= 1) || d.capacity % 1) { fieldErr(form, 'capacity', 'Enter a whole number of seats.'); ok = false; }
          else if (ev && d.capacity < seats(ev)) { fieldErr(form, 'capacity', 'Capacity cannot be below the ' + seats(ev) + ' seats already reserved.'); ok = false; }
          if (d.price == null) d.price = 0;
          if (d.price < 0) { fieldErr(form, 'price', 'Price cannot be negative.'); ok = false; }
          if (d.title.length > 90) { fieldErr(form, 'title', 'Keep the title under 90 characters.'); ok = false; }
          if (!ok) return false;
          if (ev) { undoRun(function () { S.update('events', ev.id, d); }, { message: 'Event saved', undone: 'Event changes undone' }); Club.app.render(); }
          else {
            const nid = S.uid('evt');
            undoRun(function () { return S.insert('events', Object.assign(d, { id: nid, registrations: [] })); }, { message: 'Event created', after: leaveIf('events/' + nid, 'events'), undone: 'Event removed' });
            Club.app.go('events/' + nid);
          }
        }
      }]
    });
  }

  /* ---------------- Registration ---------------- */
  function openRegister(ev) {
    const golfOnly = GOLF_TYPES.indexOf(ev.type) >= 0;
    const taken = (ev.registrations || []).map(function (r) { return r.memberId; });
    const eligible = S.all('members').filter(function (m) { return m.status === 'active' && taken.indexOf(m.id) < 0 && (!golfOnly || isGolfer(m)); })
      .sort(function (a, b) { return a.lastName.localeCompare(b.lastName); });
    if (!eligible.length) { ui.toast('Every eligible member is already registered', 'bad'); return; }
    const remaining = ev.capacity - seats(ev);
    const body = '<form novalidate class="ev-reg-form">' +
      ui.field({ label: 'Member', name: 'memberId', type: 'select', required: true, options: '<option value="">Select a member</option>' + eligible.map(function (m) { return '<option value="' + m.id + '">' + esc(m.lastName + ', ' + m.firstName) + ' · #' + esc(m.memberNo) + '</option>'; }).join(''), hint: golfOnly ? 'Golfing members only for this event' : '' }) +
      ui.field({ label: 'Guests', name: 'guests', type: 'number', value: ev.type === 'Member-Guest' ? 1 : 0, min: 0, max: 8, step: 1, hint: 'Guests are billed to the member at the event price' }) +
      '<div class="ev-reg-summary"></div></form>';
    const m = ui.modal({
      title: 'Register member', eyebrow: ev.title, body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Register member', kind: 'primary', icon: 'check', onClick: function (api) {
          const form = ui.$('form', api.body); clearErrs(form);
          if (!ui.validate(form)) return false;
          const d = ui.formData(form); const g = d.guests == null ? 0 : d.guests;
          const fresh = S.find('events', ev.id);
          if (!fresh) { ui.toast('This event no longer exists', 'bad'); return; }
          if (g < 0 || g % 1 || g > 8) { fieldErr(form, 'guests', 'Enter between 0 and 8 guests.'); return false; }
          if ((fresh.registrations || []).some(function (r) { return r.memberId === d.memberId; })) { fieldErr(form, 'memberId', 'This member is already registered.'); return false; }
          if (seats(fresh) + 1 + g > fresh.capacity) { fieldErr(form, 'guests', 'Only ' + Math.max(0, fresh.capacity - seats(fresh)) + ' seats remain.'); return false; }
          const amount = feeFor(fresh, g);
          const reg = { memberId: d.memberId, guests: g, registeredAt: today(), charged: 0 };
          undoRun(function () {
            if (amount > 0) {
              const ch = Club.chargeMember(d.memberId, { description: fresh.title + (g ? ' (member + ' + g + (g === 1 ? ' guest)' : ' guests)') : ' (member)'), category: 'Events', amount: amount, source: 'events', refId: fresh.id, date: today(),
                title: fresh.title, lines: [{ name: 'Member entry', qty: 1, price: +fresh.price }].concat(g ? [{ name: 'Guest entry', qty: g, price: +fresh.price }] : []) });
              if (ch) reg.charged = ch.amount;
            }
            S.update('events', fresh.id, { registrations: (fresh.registrations || []).concat([reg]) });
          }, { message: function () { return memberName(d.memberId) + ' registered' + (reg.charged ? ', ' + fmt.money(reg.charged) + ' posted to account' : ''); }, undone: 'Registration removed' });
          Club.app.render();
        }
      }]
    });
    const form = ui.$('form', m.body);
    function upd() {
      const d = ui.formData(form); const g = Math.max(0, d.guests || 0);
      const after = seats(ev) + 1 + g;
      ui.$('.ev-reg-summary', form).innerHTML = '<dl class="kv"><dt>Seats remaining</dt><dd>' + remaining + ' of ' + ev.capacity + '</dd><dt>After this registration</dt><dd class="' + (after > ev.capacity ? 'ev-over' : '') + '">' + after + ' of ' + ev.capacity + (after > ev.capacity ? ' · over capacity' : '') + '</dd><dt>Charge to account</dt><dd>' + (+ev.price ? fmt.money(feeFor(ev, g)) + ' <span class="muted">(' + (1 + g) + ' x ' + price(ev.price) + ', Events)</span>' : 'No charge') + '</dd></dl>';
    }
    form.addEventListener('input', upd); upd();
  }

  async function removeRegistration(ev, memberId) {
    const reg = (ev.registrations || []).find(function (r) { return r.memberId === memberId; }); if (!reg) return;
    const refund = +reg.charged || 0;
    const ok = await ui.confirm({ title: 'Remove registration?', text: memberName(memberId) + (reg.guests ? ' and ' + reg.guests + (reg.guests === 1 ? ' guest' : ' guests') : '') + ' will be removed from ' + ev.title + '.' + (refund ? ' A credit of ' + fmt.money(refund) + ' will be posted to the account.' : ''), confirmLabel: 'Remove registration', danger: true });
    if (!ok) return;
    const fresh = S.find('events', ev.id); if (!fresh) return;
    undoRun(function () {
      S.update('events', ev.id, { registrations: fresh.registrations.filter(function (r) { return r.memberId !== memberId; }) });
      if (refund) Club.chargeMember(memberId, { description: 'Credit: ' + fresh.title + ' registration cancelled', category: 'Events', amount: -refund, source: 'events', refId: fresh.id, date: today(), title: fresh.title, lines: [{ name: 'Registration cancelled', qty: 1, price: refund }] });
    }, { message: 'Registration removed' + (refund ? ', credit posted' : ''), undone: memberName(memberId) + ' is registered again' + (refund ? '. ' + fmt.money(refund) + ' charged again' : '') });
    Club.app.render();
  }

  /* ---------------- Index page: the four stat tiles open a details drawer (Club.drill) ---------------- */
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function upcomingEvents() { const t0 = today(); return S.all('events').filter(function (e) { return e.status === 'published' && e.date >= t0; }).sort(function (a, b) { return (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')); }); }
  /** What a registration was actually billed (the stored charge), not today's price; older records without one use the price. */
  function billedFor(e, r) { return r.charged != null ? +r.charged || 0 : feeFor(e, r.guests); }
  function revenueOf(e) { return (e.registrations || []).reduce(function (b, r) { return b + billedFor(e, r); }, 0); }
  function fillBadge(e) { const cap = +e.capacity || 0, n = seats(e); return !cap ? '' : n >= cap ? ui.badge('Full', 'bad') : n / cap >= 0.8 ? ui.badge('Almost full', 'warn') : ''; }
  function evCell(e) { return '<a class="primary-cell" href="#/events/' + esc(e.id) + '">' + esc(e.title) + '</a><div class="dd-sub">' + esc(e.type || 'Event') + (e.venue ? ' · ' + esc(e.venue) : '') + '</div>'; }
  function seatsCell(e) { const cap = +e.capacity || 0, n = seats(e); return esc(n + (cap ? ' of ' + cap : '')) + (cap ? '<div>' + Club.drill.share(n, cap) + '</div>' : ''); }
  function drillNext30() {
    const DR = Club.drill, t30 = Club.date.fromToday(30), list = upcomingEvents().filter(function (e) { return e.date <= t30; });
    const n = list.reduce(function (a, e) { return a + seats(e); }, 0), cap = list.reduce(function (a, e) { return a + (+e.capacity || 0); }, 0);
    let html = DR.kpis([
      { label: 'Events', value: String(list.length), sub: 'In the next 30 days' },
      { label: 'Seats reserved', value: String(n), sub: cap ? 'Of ' + cap + ' seats' : 'No capacity set' },
      { label: 'Filled', value: cap ? Math.round(n / cap * 100) + '%' : 'None', sub: 'Across these events' },
      { label: 'Next up', value: list.length ? fmt.dateShort(list[0].date) : 'None', sub: list.length ? list[0].title : 'Nothing published' }
    ]);
    if (!list.length) return { title: 'Next 30 days', body: html + DR.empty('No events in the next 30 days', 'Published events dated in the next month appear here.', 'events'), go: 'events', goLabel: 'Open calendar' };
    html += DR.sec('Coming up', plural(list.length, 'event'), DR.table([{ label: 'Date' }, { label: 'Event' }, { label: 'Seats' }, { label: 'Status' }, { label: 'Revenue', num: true }],
      list.map(function (e) { return ['<span class="nowrap">' + esc(fmt.dateShort(e.date)) + '</span>' + (e.start ? '<div class="dd-sub">' + esc(fmt.time(e.start)) + '</div>' : ''), evCell(e), seatsCell(e), fillBadge(e) || '<span class="muted">Open</span>', esc(+e.price ? price(revenueOf(e)) : 'Free')]; })));
    const types = {}; list.forEach(function (e) { const k = e.type || 'Event'; const x = types[k] = types[k] || { n: 0, seats: 0 }; x.n++; x.seats += seats(e); });
    html += DR.sec('By type', '', DR.table([{ label: 'Type' }, { label: 'Share of seats' }, { label: 'Events', num: true }, { label: 'Seats', num: true }],
      Object.keys(types).sort(function (a, b) { return types[b].seats - types[a].seats; }).map(function (k) { return ['<span class="primary-cell">' + esc(k) + '</span>', DR.share(types[k].seats, n), types[k].n, types[k].seats]; })));
    return { title: 'Next 30 days', body: html, go: 'events', goLabel: 'Open calendar' };
  }
  function drillSeats() {
    const DR = Club.drill, list = upcomingEvents();
    const n = list.reduce(function (a, e) { return a + seats(e); }, 0), cap = list.reduce(function (a, e) { return a + (+e.capacity || 0); }, 0);
    const regs = list.reduce(function (a, e) { return a + (e.registrations || []).length; }, 0), guests = list.reduce(function (a, e) { return a + (e.registrations || []).reduce(function (b, r) { return b + (+r.guests || 0); }, 0); }, 0);
    let html = DR.kpis([
      { label: 'Seats reserved', value: String(n), sub: 'Across ' + plural(list.length, 'upcoming event') },
      { label: 'Members', value: String(regs), sub: plural(regs, 'registration') },
      { label: 'Guests', value: String(guests), sub: n ? Math.round(guests / n * 100) + '% of seats' : 'None yet' },
      { label: 'Seats left', value: String(Math.max(0, cap - n)), sub: cap ? Math.round(n / cap * 100) + '% filled overall' : 'No capacity set' }
    ]);
    if (!list.length) return { title: 'Seats reserved', body: html + DR.empty('No upcoming events', 'Seats count once members register for a published event.', 'events') };
    const full = list.filter(function (e) { return +e.capacity && seats(e) / e.capacity >= 0.8; });
    if (full.length) html += DR.sec('Filling up', plural(full.length, 'event') + ' at 80% or more', DR.table([{ label: 'Event' }, { label: 'Date' }, { label: 'Seats' }, { label: 'Left', num: true }],
      full.map(function (e) { return [evCell(e), esc(fmt.dateShort(e.date)), seatsCell(e), Math.max(0, e.capacity - seats(e))]; })));
    const byFill = list.filter(function (e) { return +e.capacity; }).sort(function (a, b) { return seats(a) / a.capacity - seats(b) / b.capacity; });
    html += DR.sec('Most room left', 'Lowest filled first', DR.table([{ label: 'Event' }, { label: 'Date' }, { label: 'Seats' }, { label: 'Left', num: true }],
      byFill.slice(0, 6).map(function (e) { return [evCell(e), esc(fmt.dateShort(e.date)), seatsCell(e), Math.max(0, e.capacity - seats(e))]; })));
    return { title: 'Seats reserved', body: html, go: 'events', goLabel: 'Open calendar' };
  }
  function drillRevenue() {
    const DR = Club.drill, list = upcomingEvents(), paid = list.filter(function (e) { return +e.price; });
    const total = Math.round(list.reduce(function (a, e) { return a + revenueOf(e); }, 0) * 100) / 100;
    const charged = Math.round(list.reduce(function (a, e) { return a + (e.registrations || []).reduce(function (b, r) { return b + (+r.charged || 0); }, 0); }, 0) * 100) / 100;
    const paidSeats = paid.reduce(function (a, e) { return a + seats(e); }, 0);
    let html = DR.kpis([
      { label: 'Committed', value: fmt.money0(total), sub: 'From upcoming registrations' },
      { label: 'Charged so far', value: fmt.money0(charged), sub: total ? Math.round(charged / total * 100) + '% on member accounts' : 'Nothing charged yet' },
      { label: 'Per seat', value: paidSeats ? fmt.money0(total / paidSeats) : '$0', sub: 'Average across paid events' },
      { label: 'Free events', value: String(list.length - paid.length), sub: 'Upcoming, no charge' }
    ]);
    if (!paid.length) return { title: 'Committed revenue', body: html + DR.empty('No paid events coming up', 'Revenue appears when members register for an event with a price.', 'billing') };
    const types = {}; paid.forEach(function (e) { const k = e.type || 'Event'; types[k] = (types[k] || 0) + revenueOf(e); });
    const items = Object.keys(types).filter(function (k) { return types[k] > 0; }).sort(function (a, b) { return types[b] - types[a]; }).map(function (k) { return { label: k, value: Math.round(types[k]) }; });
    html += '<div class="dd-two" data-reveal>' + DR.sec('By type', '', items.length ? Club.charts.donut({ items: items, size: 150, money: true, center: { value: total >= 1000 ? '$' + (total / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : fmt.money0(total), label: 'Committed' } }) : DR.note('No registrations on paid events yet.')) +
      DR.sec('Where it comes from', '', DR.note(plural(paid.length, 'paid event') + ' and ' + plural(paidSeats, 'seat') + '. ' + (total - charged > 0.5 ? fmt.money0(total - charged) + ' is committed but not yet on accounts (registered by the office or settled separately).' : 'Everything committed is already on member accounts.'))) + '</div>';
    html += DR.sec('By event', 'Largest first', DR.table([{ label: 'Event' }, { label: 'Date' }, { label: 'Share' }, { label: 'Price', num: true }, { label: 'Seats', num: true }, { label: 'Revenue', num: true }],
      paid.slice().sort(function (a, b) { return revenueOf(b) - revenueOf(a); }).map(function (e) { return [evCell(e), esc(fmt.dateShort(e.date)), DR.share(revenueOf(e), total), esc(price(e.price)), seats(e), esc(price(revenueOf(e)))]; }),
      ['Total', '', '', '', paidSeats, esc(price(total))]));
    return { title: 'Committed revenue', body: html, go: 'billing', goLabel: 'Open billing' };
  }
  function drillLive() {
    const DR = Club.drill, ts = S.all('tournaments'), live = ts.filter(function (t) { return t.status === 'live'; });
    const players = live.reduce(function (a, t) { return a + (t.field || []).length; }, 0);
    const holes = live.reduce(function (a, t) { return a + (t.field || []).reduce(function (b, p) { return b + (p.scores || []).filter(function (v) { return v != null && v !== ''; }).length; }, 0); }, 0);
    const lead = live.length ? leaderboard(live[0], 'net')[0] : null;
    let html = DR.kpis([
      { label: 'Live', value: String(live.length), sub: plural(ts.filter(function (t) { return t.status === 'final'; }).length, 'tournament') + ' finished' },
      { label: 'Players', value: String(players), sub: 'In live fields' },
      { label: 'Scores in', value: players ? Math.round(holes / (players * 18) * 100) + '%' : 'None', sub: plural(holes, 'hole') + ' entered' },
      { label: 'Leading', value: lead && lead.thru ? lead.name : 'Not started', sub: lead && lead.thru ? (live[0].format === 'Stableford' ? lead.pts + ' pts' : toPar(lead.netToPar) + ' net') + ' · ' + live[0].name : 'No scores yet' }
    ]);
    if (!live.length) {
      const next = ts.filter(function (t) { return t.status !== 'final' && t.status !== 'live'; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      return { title: 'Live tournaments', body: html + DR.empty('Nothing in play', next.length ? 'Next: ' + next[0].name + ' on ' + fmt.dateLong(next[0].date) + '.' : 'Start a tournament from its page to run the live leaderboard.', 'trophy'), go: 'events/tournaments', goLabel: 'Open tournaments' };
    }
    live.forEach(function (t) {
      const lb = leaderboard(t, 'net').filter(function (l) { return l.thru; }), stable = t.format === 'Stableford';
      const entered = (t.field || []).filter(function (p) { return (p.scores || []).some(function (v) { return v != null && v !== ''; }); }).length;
      html += DR.sec(t.name, t.format + ' · ' + entered + ' of ' + (t.field || []).length + ' players have scores', lb.length ? DR.table([{ label: 'Pos' }, { label: 'Player' }, { label: 'Thru', num: true }, { label: stable ? 'Points' : 'Net', num: true }],
        lb.slice(0, 5).map(function (l) { return [esc(l.pos), '<span class="primary-cell">' + esc(l.name) + '</span>', l.thru === 18 ? 'F' : l.thru, '<strong class="ev-topar ' + parClass(stable ? 0 : l.netToPar) + '">' + esc(stable ? String(l.pts) : toPar(l.netToPar)) + '</strong>']; })) +
        '<p class="dd-note"><a class="s-link" href="#/events/tournaments/' + esc(t.id) + '">Open ' + esc(t.name) + '</a></p>' : DR.note('No scores entered yet.'));
    });
    return { title: 'Live tournaments', body: html, go: 'events/tournaments', goLabel: 'Open tournaments' };
  }

  /* ---------------- Index page: calendar + tournaments ---------------- */
  function renderIndex(view, tab) {
    const evs = S.all('events');
    const t0 = today(), t30 = Club.date.fromToday(30);
    const upcoming = evs.filter(function (e) { return e.status === 'published' && e.date >= t0; });
    const next30 = upcoming.filter(function (e) { return e.date <= t30; });
    const seatsUp = upcoming.reduce(function (a, e) { return a + seats(e); }, 0);
    const rev = upcoming.reduce(function (a, e) { return a + revenueOf(e); }, 0);
    const live = S.all('tournaments').filter(function (t) { return t.status === 'live'; });
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Golf · Club calendar', title: 'Events & Tournaments',
      subtitle: '<span class="serif ev-flavour">Championships, dinners and the occasions that make the season.</span>',
      actions: ui.btn('New tournament', { kind: 'ghost', icon: 'trophy', action: 'new-trn' }) + ui.btn('Create event', { kind: 'primary', icon: 'plus', action: 'new-ev' })
    }) +
      Club.drill.tiles(ui.stats([
        { label: 'Next 30 days', value: next30.length, suffix: next30.length === 1 ? 'event' : 'events', meta: upcoming.length + ' published ahead' },
        { label: 'Seats reserved', value: seatsUp, meta: 'Across upcoming events' },
        { label: 'Committed revenue', value: Math.round(rev), prefix: '$', meta: 'Upcoming registrations' },
        { label: 'Live tournaments', value: live.length, meta: live.length ? '<span class="live-dot"></span> ' + esc(live[0].name) : 'None in play' }
      ]), ['next30', 'seats', 'revenue', 'live']) +
      '<div class="ev-tabs-host"></div>';
    Club.drill.wire(view, { next30: drillNext30, seats: drillSeats, revenue: drillRevenue, live: drillLive }, 'Events & Tournaments · ' + fmt.dateLong(today()));
    ui.on(view, 'click', '[data-action=new-ev]', function () { openEventForm(null); });
    ui.on(view, 'click', '[data-action=new-trn]', function () { openTournamentForm(null); });
    ui.tabs(ui.$('.ev-tabs-host', view), [
      { id: 'calendar', label: 'Calendar', render: renderCalendar },
      { id: 'tournaments', label: 'Tournaments', render: renderTournamentList },
      { id: 'league', label: "Members' league", render: renderLeague },
      { id: 'friends', label: 'Friends leagues', render: renderFriendLeagues }
    ], tab, function (id) { try { history.replaceState(null, '', id === 'tournaments' ? '#/events/tournaments' : id === 'league' ? '#/events/league' : id === 'friends' ? '#/events/friends' : '#/events'); } catch (e) { /* file:// may refuse */ } });
    const strip = ui.$('.ev-tabs-host .tabs', view), act = strip && ui.$('.tab.active', strip);
    if (act && act.offsetLeft + act.offsetWidth > strip.clientWidth) strip.scrollLeft = act.offsetLeft - 16;
  }

  function entryHTML(e) {
    return '<button type="button" class="ev-entry t-' + typeKey(e.type) + ' s-' + e.status + '" data-ev="' + esc(e.id) + '" title="' + esc(e.title + ' · ' + timeRange(e)) + '"><i></i><span class="ev-entry-time">' + esc(e.start ? fmt.time(e.start).replace(':00', '').replace(' ', '').toLowerCase() : '') + '</span><span class="ev-entry-title">' + esc(e.title) + '</span></button>';
  }
  function legendHTML() {
    return '<div class="ev-legend">' + TYPES.map(function (t) { return '<span class="t-' + typeKey(t) + '"><i></i>' + esc(t) + '</span>'; }).join('') + '<span class="ev-legend-note">Dashed: draft · Struck through: cancelled</span></div>';
  }

  function renderCalendar(panel) {
    function draw() {
      const evs = S.all('events').slice().sort(byDate);
      const toolbar = '<div class="ev-cal-bar">' +
        '<div class="row ev-cal-nav">' + ui.btn('', { kind: 'ghost', sm: true, icon: 'chevronLeft', action: 'prev', title: 'Previous month' }) +
        '<h2 class="ev-cal-title">' + esc(monthLabel(calMonth)) + '</h2>' + ui.btn('', { kind: 'ghost', sm: true, icon: 'chevronRight', action: 'next', title: 'Next month' }) +
        (calMonth !== monthOf(today()) ? ui.btn('Today', { sm: true, action: 'today' }) : '') + '</div>' +
        ui.segmented([{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }], calMode, 'calmode') + '</div>';
      let body;
      if (calMode === 'month') {
        const p = calMonth.split('-'); const first = new Date(+p[0], +p[1] - 1, 1, 12);
        const startOff = (first.getDay() + 6) % 7; const dim = new Date(+p[0], +p[1], 0).getDate();
        const cells = Math.ceil((startOff + dim) / 7) * 7;
        const start = Club.date.addDays(S.iso(first), -startOff);
        const t0 = today();
        let g = '<div class="ev-cal" role="grid" aria-label="' + esc(monthLabel(calMonth)) + '">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return '<div class="ev-dow" role="columnheader">' + d + '</div>'; }).join('');
        for (let i = 0; i < cells; i++) {
          const d = Club.date.addDays(start, i);
          const list = evs.filter(function (e) { return e.date === d; });
          const shown = list.slice(0, 3);
          g += '<div class="ev-day' + (monthOf(d) !== calMonth ? ' out' : '') + (d === t0 ? ' today' : '') + (d < t0 ? ' past' : '') + '" data-date="' + d + '" role="gridcell" tabindex="0" aria-label="' + esc(fmt.dateLong(d) + (list.length ? ', ' + list.length + ' events' : '') + '. Press Enter to create an event') + '">' +
            '<div class="ev-day-head"><span class="ev-day-num">' + (+d.slice(8)) + '</span><span class="ev-day-add" aria-hidden="true">' + Club.icon('plus') + '</span></div>' +
            '<div class="ev-day-list">' + shown.map(entryHTML).join('') + (list.length > 3 ? '<button type="button" class="ev-more" data-list="' + d + '">+' + (list.length - 3) + ' more</button>' : '') + '</div>' +
            '<div class="ev-day-dots">' + list.map(function (e) { return '<i class="t-' + typeKey(e.type) + ' s-' + e.status + '"></i>'; }).join('') + '</div>' +
            '</div>';
        }
        g += '</div>';
        body = '<div class="panel ev-cal-panel">' + g + '</div>' + legendHTML() + monthAgenda(evs);
      } else {
        body = listHTML(evs);
      }
      panel.innerHTML = toolbar + body;
      ui.animateIn(panel);
    }
    function monthAgenda(evs) {
      const list = evs.filter(function (e) { return monthOf(e.date) === calMonth; });
      return '<div class="ev-agenda-mobile">' + (list.length ? listRows(list) : '') + '</div>';
    }
    function listRows(list) {
      return '<ul class="list ev-list panel">' + list.map(function (e) {
        const s = seats(e); const pct = Math.min(100, Math.round(s / Math.max(1, e.capacity) * 100));
        return '<li class="ev-list-row s-' + e.status + '" data-ev="' + esc(e.id) + '" tabindex="0" role="link">' +
          '<div class="ev-list-date"><span class="ev-list-day">' + (+e.date.slice(8)) + '</span><span class="label-caps">' + esc(fmt.weekday(e.date)) + '</span></div>' +
          '<div class="ev-list-main"><div class="ev-list-title"><span class="ev-type-dot t-' + typeKey(e.type) + '"></span>' + esc(e.title) + '</div><div class="person-sub">' + esc(e.type + ' · ' + timeRange(e) + ' · ' + e.venue) + '</div></div>' +
          '<div class="ev-list-cap"><div class="row between person-sub"><span>' + s + ' / ' + e.capacity + '</span><span>' + pct + '%</span></div><div class="bar' + (pct >= 100 ? ' brass' : '') + '"><span style="width:' + pct + '%"></span></div></div>' +
          '<div class="ev-list-status">' + statusBadge(e.status) + '</div></li>';
      }).join('') + '</ul>';
    }
    function listHTML(evs) {
      const t0 = today();
      const up = evs.filter(function (e) { return e.date >= t0; });
      const past = evs.filter(function (e) { return e.date < t0; }).reverse();
      if (!evs.length) return ui.empty({ icon: 'events', title: 'No events yet', text: 'Create the first event of the season and it will appear here.', action: ui.btn('Create event', { kind: 'primary', icon: 'plus', action: 'new-ev-inline' }) });
      const groups = {};
      up.forEach(function (e) { (groups[monthOf(e.date)] = groups[monthOf(e.date)] || []).push(e); });
      let h = Object.keys(groups).map(function (k) { return '<section class="ev-list-group" data-reveal><h3 class="ev-list-month">' + esc(monthLabel(k)) + '</h3>' + listRows(groups[k]) + '</section>'; }).join('');
      if (!up.length) h = ui.empty({ icon: 'calendar', title: 'Nothing on the calendar ahead', text: 'Upcoming events will be listed here once created.' });
      if (past.length) h += '<section class="ev-list-group" data-reveal><h3 class="ev-list-month">Recently held</h3>' + listRows(past.slice(0, 8)) + '</section>';
      return h;
    }
    ui.on(panel, 'click', '[data-action=prev]', function () { calMonth = addMonths(calMonth, -1); draw(); });
    ui.on(panel, 'click', '[data-action=next]', function () { calMonth = addMonths(calMonth, 1); draw(); });
    ui.on(panel, 'click', '[data-action=today]', function () { calMonth = monthOf(today()); draw(); });
    ui.on(panel, 'click', '[data-action=new-ev-inline]', function () { openEventForm(null); });
    ui.on(panel, 'click', '.segmented button', function (e, b) { calMode = b.dataset.value; draw(); });
    ui.on(panel, 'click', '[data-ev]', function (e, b) { e.stopPropagation(); Club.app.go('events/' + b.dataset.ev); });
    ui.on(panel, 'keydown', '.ev-list-row', function (e, b) { if (e.key === 'Enter') Club.app.go('events/' + b.dataset.ev); });
    ui.on(panel, 'click', '.ev-more', function (e, b) { e.stopPropagation(); dayModal(b.dataset.list); });
    ui.on(panel, 'click', '.ev-day', function (e, d) {
      if (e.target.closest('[data-ev], .ev-more')) return;
      if (window.matchMedia('(max-width: 640px)').matches && S.where('events', function (x) { return x.date === d.dataset.date; }).length) { dayModal(d.dataset.date); return; }
      openEventForm(null, d.dataset.date);
    });
    ui.on(panel, 'keydown', '.ev-day', function (e, d) { if (e.key === 'Enter' && e.target === d) openEventForm(null, d.dataset.date); });
    draw();
  }

  function dayModal(date) {
    const list = S.where('events', function (e) { return e.date === date; }).sort(byDate);
    const m = ui.modal({
      title: fmt.dateLong(date), eyebrow: list.length + (list.length === 1 ? ' event' : ' events'),
      body: '<ul class="list ev-day-modal">' + list.map(function (e) { return '<li><span class="ev-type-dot t-' + typeKey(e.type) + '"></span><div style="flex:1;min-width:0"><a href="#/events/' + esc(e.id) + '" class="person-name">' + esc(e.title) + '</a><div class="person-sub">' + esc(timeRange(e) + ' · ' + e.venue) + '</div></div>' + statusBadge(e.status) + '</li>'; }).join('') + '</ul>',
      actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Create event this day', kind: 'primary', icon: 'plus', onClick: function () { setTimeout(function () { openEventForm(null, date); }, 180); } }]
    });
    ui.on(m.body, 'click', 'a', function () { m.close(); });
  }

  /* ---------------- Event detail ---------------- */
  function renderEvent(view, id) {
    const ev = S.find('events', id);
    if (!ev) {
      view.innerHTML = ui.pageHeader({ eyebrow: 'Events', title: 'Event not found' }) + ui.empty({ icon: 'events', title: 'This event is no longer on the calendar', text: 'It may have been deleted. Return to the calendar to find another event.', action: '<a class="btn btn-primary" href="#/events">Back to calendar</a>' });
      return;
    }
    const s = seats(ev); const pct = Math.min(100, Math.round(s / Math.max(1, ev.capacity) * 100));
    const regs = (ev.registrations || []).slice().sort(function (a, b) { return memberName(a.memberId).split(' ').pop().localeCompare(memberName(b.memberId).split(' ').pop()); });
    const trns = S.where('tournaments', function (t) { return t.eventId === ev.id; });
    const open = ev.status === 'published' || ev.status === 'draft';
    const d = fmt.toDate(ev.date);
    const total = regs.reduce(function (a, r) { return a + billedFor(ev, r); }, 0);
    /* Registrations can be removed (crediting their fee) while the event is open, and after it is cancelled. */
    const canRemove = open || ev.status === 'cancelled';
    const guests = regs.reduce(function (a, r) { return a + (+r.guests || 0); }, 0);
    if (regsAll.id !== id) regsAll = { id: id, open: false };
    const showAllRegs = regsAll.open;

    let actions = '';
    if (ev.status === 'draft') actions += ui.btn('Publish', { kind: 'primary', icon: 'send', action: 'publish' });
    if (ev.status === 'published' && ev.date <= today()) actions += ui.btn('Mark completed', { kind: 'primary', icon: 'check', action: 'complete' });
    if (ev.status === 'published') actions += ui.btn('Cancel event', { kind: 'danger', action: 'cancel' });
    if (ev.status === 'cancelled') actions += ui.btn('Reinstate', { icon: 'refresh', action: 'reinstate' });
    if (ev.status === 'completed') actions += ui.btn('Back to published', { icon: 'refresh', action: 'uncomplete', title: 'Step back for corrections: the event shows as published again' });
    actions += ui.btn('Edit', { icon: 'edit', action: 'edit' }) + ui.btn('', { kind: 'ghost', icon: 'trash', action: 'delete', title: 'Delete event' });

    view.innerHTML = '<a class="ev-back" href="#/events">' + Club.icon('chevronLeft') + '<span>Club calendar</span></a>' +
      '<div class="ev-head-actions">' + actions + '</div>' +
      '<section class="panel ev-invite t-' + typeKey(ev.type) + ' s-' + ev.status + '" data-reveal>' +
      '<div class="ev-invite-inner">' +
      '<div class="ev-invite-status">' + statusBadge(ev.status) + '</div>' +
      '<div class="eyebrow">' + esc(ev.type) + ' · ' + esc(Club.info.short) + '</div>' +
      '<p class="ev-invite-flavour serif">' + (ev.type === 'Private' ? 'A private celebration at the club' : ev.type === 'Corporate' ? 'Hosted by Tournament & Corporate Services' : 'You are warmly invited to join us') + '</p>' +
      '<h1 class="ev-invite-title">' + esc(ev.title) + '</h1>' +
      '<div class="flourish ev-invite-flourish">' + Club.icon('crest') + '</div>' +
      '<div class="ev-invite-date"><span class="ev-invite-wd">' + esc(d.toLocaleDateString('en-US', { weekday: 'long' })) + '</span><span class="ev-invite-day">' + d.getDate() + '</span><span class="ev-invite-month">' + esc(d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) + '</span></div>' +
      '<div class="ev-invite-meta"><span>' + Club.icon('clock') + esc(timeRange(ev)) + '</span><span>' + Club.icon('pin') + esc(ev.venue) + '</span><span>' + Club.icon('tag') + esc(priceLabel(ev.price)) + '</span></div>' +
      (ev.status === 'cancelled' ? '<p class="ev-invite-cancel">This event has been cancelled.</p>' : '') +
      '</div></section>' +
      '<div class="grid grid-main-side ev-detail-grid">' +
      '<div class="stack">' +
      '<div class="panel" data-reveal><div class="panel-head"><h3>About this event</h3><span class="muted ev-relative">' + esc(fmt.relative(ev.date)) + '</span></div><div class="panel-body"><p class="ev-desc">' + (ev.description ? esc(ev.description).replace(/\n/g, '<br>') : '<span class="muted">No description yet. Add the dress code, format and what is included.</span>') + '</p></div></div>' +
      '<div class="panel" data-reveal><div class="panel-head"><div><h3>Registrations</h3><div class="person-sub">' + regs.length + ' members · ' + guests + ' guests</div></div>' + (open ? ui.btn('Register member', { kind: 'primary', sm: true, icon: 'plus', action: 'register' }) : '') + '</div>' +
      '<div class="panel-body flush">' + (regs.length ? '<div class="table-wrap"><table class="table ev-reg-table"><thead><tr><th>Member</th><th class="num">Guests</th><th class="ev-hide-sm">Registered</th><th class="num">Fee</th><th></th></tr></thead><tbody>' +
        regs.map(function (r, ri) {
          const m = Club.members.get(r.memberId); const tier = Club.members.tier(m);
          return '<tr' + (ri >= REG_TOP && !showAllRegs ? ' class="ev-reg-more" hidden' : ri >= REG_TOP ? ' class="ev-reg-more"' : '') + '><td>' + (m ? '<a href="#/members/' + esc(m.id) + '" class="ev-person-link">' + ui.person(memberName(r.memberId), esc((tier ? tier.name : 'Member') + ' · #' + m.memberNo)) + '</a>' : ui.person('Former member', 'Record removed')) + '</td>' +
            '<td class="num">' + (+r.guests || 0) + '</td><td class="nowrap ev-hide-sm">' + esc(fmt.dateShort(r.registeredAt || ev.date)) + '</td><td class="num">' + (billedFor(ev, r) ? price(billedFor(ev, r)) : '<span class="muted">None</span>') + '</td>' +
            '<td class="right">' + (canRemove ? ui.btn('', { kind: 'ghost', sm: true, icon: 'close', action: 'unregister', id: r.memberId, title: 'Remove registration' }) : '') + '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td>' + regs.length + ' registrations</td><td class="num">' + guests + '</td><td class="ev-hide-sm"></td><td class="num">' + price(total) + '</td><td></td></tr></tfoot></table></div>' +
          (regs.length > REG_TOP ? '<div class="ev-reg-all"><button type="button" class="s-link" data-action="regs-all" aria-expanded="' + showAllRegs + '">' + (showAllRegs ? 'Show first ' + REG_TOP : 'View all registrations (' + regs.length + ')') + '</button></div>' : '')
        : ui.empty({ icon: 'members', title: 'No registrations yet', text: open ? 'Register members as they reply. Fees post to their member account automatically.' : 'No members registered for this event.', action: open ? ui.btn('Register member', { kind: 'primary', icon: 'plus', action: 'register' }) : '' })) +
      '</div></div></div>' +
      '<div class="stack">' +
      '<div class="panel" data-reveal><div class="panel-head"><h3>Capacity</h3><span class="label-caps">' + pct + '% full</span></div><div class="panel-body">' +
      '<div class="ev-cap-num"><span class="serif">' + s + '</span><span class="muted"> of ' + ev.capacity + ' seats</span></div>' +
      '<div class="bar ev-cap-bar' + (pct >= 90 ? ' brass' : '') + '"><span style="width:' + pct + '%"></span></div>' +
      '<dl class="kv ev-cap-kv"><dt>Members</dt><dd>' + regs.length + '</dd><dt>Guests</dt><dd>' + guests + '</dd><dt>Seats remaining</dt><dd>' + Math.max(0, ev.capacity - s) + '</dd><dt>Billed to accounts</dt><dd>' + price(total) + '</dd></dl>' +
      (s >= ev.capacity ? '<p class="ev-full-note">' + Club.icon('info') + 'This event is full. Remove a registration or raise the capacity to admit more.</p>' : '') +
      '</div></div>' +
      (GOLF_TYPES.indexOf(ev.type) >= 0 || trns.length ? '<div class="panel" data-reveal><div class="panel-head"><h3>Competition</h3></div><div class="panel-body">' +
        (trns.length ? trns.map(function (t) { return '<a class="ev-trn-link" href="#/events/tournaments/' + esc(t.id) + '"><span>' + Club.icon('trophy') + '</span><span style="flex:1"><span class="person-name">' + esc(t.name) + '</span><span class="person-sub">' + esc(t.format + ' · ' + (t.field || []).length + ' players') + '</span></span>' + statusBadge(t.status) + '</a>'; }).join('')
          : '<p class="muted">No tournament is linked yet. Set one up to build the field from registered golfers and enter scores.</p>' + ui.btn('Set up tournament', { icon: 'trophy', action: 'mk-trn' })) +
        '</div></div>' : '') +
      '<div class="panel" data-reveal><div class="panel-body"><dl class="kv"><dt>Type</dt><dd>' + esc(ev.type) + '</dd><dt>Venue</dt><dd>' + esc(ev.venue) + '</dd><dt>Price</dt><dd>' + esc(priceLabel(ev.price)) + '</dd><dt>Billing</dt><dd>Events category on member accounts</dd></dl></div></div>' +
      '</div></div>';

    ui.on(view, 'click', '[data-action]', async function (e, b) {
      const a = b.dataset.action; const cur = S.find('events', id); if (!cur) return;
      if (a === 'regs-all') {
        regsAll.open = !regsAll.open;
        ui.$$('.ev-reg-more', view).forEach(function (r) { r.hidden = !regsAll.open; });
        b.setAttribute('aria-expanded', regsAll.open); b.textContent = regsAll.open ? 'Show first ' + REG_TOP : 'View all registrations (' + (cur.registrations || []).length + ')';
        return;
      }
      if (a === 'register') openRegister(cur);
      else if (a === 'unregister') removeRegistration(cur, b.dataset.id);
      else if (a === 'edit') openEventForm(cur);
      else if (a === 'publish') { undoRun(function () { S.update('events', id, { status: 'published' }); }, { message: 'Event published to members', undone: 'Event back to draft' }); Club.app.render(); }
      else if (a === 'complete') { undoRun(function () { S.update('events', id, { status: 'completed' }); }, { message: 'Event marked completed', undone: 'Event back to published' }); Club.app.render(); }
      else if (a === 'uncomplete') { undoRun(function () { S.update('events', id, { status: 'published' }); }, { message: 'Event back to published', undone: 'Event marked completed again' }); Club.app.render(); }
      else if (a === 'reinstate') { undoRun(function () { S.update('events', id, { status: 'published' }); }, { message: 'Event reinstated', undone: 'Event cancelled again' }); Club.app.render(); }
      else if (a === 'cancel') {
        if (await ui.confirm({ title: 'Cancel this event?', text: cur.title + ' will be marked cancelled. Registrations are kept on record and you can reinstate it later. To credit a member’s fee, remove their registration afterwards.', confirmLabel: 'Cancel event', danger: true })) {
          undoRun(function () { S.update('events', id, { status: 'cancelled' }); }, { message: 'Event cancelled', undone: 'Event reinstated' }); Club.app.render();
        }
      } else if (a === 'delete') {
        if (await ui.confirm({ title: 'Delete this event?', text: 'This permanently removes ' + cur.title + ' and its ' + (cur.registrations || []).length + ' registrations. Charges already posted stay on member accounts.', confirmLabel: 'Delete event', danger: true })) {
          undoRun(function () {
            S.all('tournaments').filter(function (t) { return t.eventId === id; }).forEach(function (t) { S.update('tournaments', t.id, { eventId: null }); });
            S.remove('events', id);
          }, { message: 'Event deleted', undone: cur.title + ' restored with its registrations' });
          Club.app.go('events');
        }
      } else if (a === 'mk-trn') {
        const field = (cur.registrations || []).map(function (r) { return Club.members.get(r.memberId); }).filter(isGolfer).map(function (m) { return { memberId: m.id, handicap: m.handicap != null ? m.handicap : 18, scores: new Array(18).fill(null) }; });
        const tid = S.uid('trn');
        undoRun(function () { S.insert('tournaments', { id: tid, eventId: id, name: cur.title, format: cur.type === 'Member-Guest' ? 'Four-ball' : 'Stroke play', date: cur.date, status: 'upcoming', field: field }); },
          { message: 'Tournament created with ' + field.length + ' players', after: leaveIf('events/tournaments/' + tid, 'events/' + id), undone: 'Tournament removed' });
        Club.app.go('events/tournaments/' + tid);
      }
    });
  }

  /* ---------------- Tournaments ---------------- */
  function renderTournamentList(panel) {
    const ts = S.all('tournaments').slice().sort(function (a, b) { const o = { live: 0, upcoming: 1, final: 2 }; return (o[a.status] - o[b.status]) || (a.status === 'final' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)); });
    if (!ts.length) {
      panel.innerHTML = ui.empty({ icon: 'trophy', title: 'No tournaments yet', text: 'Set up a competition to build a field, enter scores and run the live leaderboard.', action: ui.btn('New tournament', { kind: 'primary', icon: 'plus', action: 'new-trn-inline' }) });
    } else {
      panel.innerHTML = '<div class="ev-trn-grid">' + ts.map(function (t) {
        const lb = leaderboard(t, 'net'); const leader = lb[0] && lb[0].thru ? lb[0] : null;
        const stable = t.format === 'Stableford';
        return '<a class="panel ev-trn-card s-' + t.status + '" href="#/events/tournaments/' + esc(t.id) + '" data-reveal>' +
          '<div class="row between"><span class="eyebrow">' + esc(t.format) + '</span>' + (t.status === 'live' ? '<span class="badge brass"><span class="live-dot"></span>Live</span>' : statusBadge(t.status)) + '</div>' +
          '<h3>' + esc(t.name) + '</h3><div class="person-sub">' + esc(fmt.dateLong(t.date)) + '</div>' +
          '<div class="ev-trn-card-foot"><div><span class="label-caps">Field</span><span class="serif ev-trn-n">' + (t.field || []).length + '</span></div>' +
          '<div style="min-width:0"><span class="label-caps">' + (t.status === 'final' ? 'Winner' : 'Leader') + '</span><span class="ev-trn-leader">' + (leader ? esc(leader.name) + ' <span class="ev-topar ' + parClass(stable ? 0 : leader.netToPar) + '">' + (stable ? leader.pts + ' pts' : toPar(leader.netToPar)) + '</span>' : '<span class="muted">Not started</span>') + '</span></div></div>' +
          '</a>';
      }).join('') + '</div>';
    }
    ui.on(panel, 'click', '[data-action=new-trn-inline]', function () { openTournamentForm(null); });
  }

  function openTournamentForm(t) {
    const x = t || { name: '', format: 'Stroke play', date: today(), eventId: '', status: 'upcoming' };
    const evOpts = S.all('events').filter(function (e) { return GOLF_TYPES.indexOf(e.type) >= 0 || e.type === 'Ladies' || e.type === 'Junior'; }).sort(byDate)
      .map(function (e) { return { value: e.id, label: e.title + ' · ' + fmt.date(e.date) }; });
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Tournament name', name: 'name', value: x.name, required: true, span2: true, placeholder: 'e.g. Senior Club Championship' }) +
      ui.field({ label: 'Format', name: 'format', type: 'select', options: ui.options(FORMATS, x.format) }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: x.date, required: true }) +
      ui.field({ label: 'Linked event', name: 'eventId', type: 'select', span2: true, options: '<option value="">No linked event</option>' + ui.options(evOpts, x.eventId || ''), hint: 'Optional. Links the leaderboard to the calendar entry.' }) +
      (t ? '' : '<label class="check span-2 ev-check"><input type="checkbox" name="pull" checked> Add golfers registered for the linked event to the field</label>') +
      '</form>';
    const m = ui.modal({
      title: t ? 'Edit tournament' : 'New tournament', eyebrow: 'Competition', body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: t ? 'Save tournament' : 'Create tournament', kind: 'primary', icon: 'check', onClick: function (api) {
          const form = ui.$('form', api.body); clearErrs(form);
          if (!ui.validate(form)) return false;
          const d = ui.formData(form);
          const patch = { name: d.name, format: d.format, date: d.date, eventId: d.eventId || null };
          if (t) { undoRun(function () { S.update('tournaments', t.id, patch); }, { message: 'Tournament saved', undone: 'Tournament changes undone' }); Club.app.render(); return; }
          let field = [];
          const ev = d.eventId ? S.find('events', d.eventId) : null;
          if (ev && d.pull) field = (ev.registrations || []).map(function (r) { return Club.members.get(r.memberId); }).filter(isGolfer).map(function (mm) { return { memberId: mm.id, handicap: mm.handicap != null ? mm.handicap : 18, scores: new Array(18).fill(null) }; });
          const tid = S.uid('trn');
          undoRun(function () { S.insert('tournaments', Object.assign(patch, { id: tid, status: 'upcoming', field: field })); },
            { message: 'Tournament created', after: leaveIf('events/tournaments/' + tid, 'events/tournaments'), undone: 'Tournament removed' });
          Club.app.go('events/tournaments/' + tid);
        }
      }]
    });
    const sel = ui.$('[name=eventId]', m.body), nm = ui.$('[name=name]', m.body), dt = ui.$('[name=date]', m.body);
    sel.addEventListener('change', function () { const ev = S.find('events', sel.value); if (ev) { if (!nm.value.trim()) nm.value = ev.title; dt.value = ev.date; } });
  }

  let trnAllRows = false; const TRN_TOP = 10;
  let regsAll = { id: null, open: false }; const REG_TOP = 10;
  function boardHTML(t) {
    const lb = leaderboard(t, boardMode);
    const stable = t.format === 'Stableford';
    if (!lb.length) return '<div class="lb-empty serif">The board awaits its field.</div>';
    return '<div class="lb-head"><span>Pos</span><span>Player</span><span class="c">Thru</span><span class="c">' + (stable ? 'Points' : (boardMode === 'gross' ? 'Gross to par' : 'Net to par')) + '</span><span class="c lb-hide-sm">Gross</span><span class="c">' + (stable ? 'Net par' : 'Net') + '</span></div>' +
      '<div class="lb-rows">' + lb.filter(function (l, i) { return trnAllRows || i < TRN_TOP; }).map(function (l, i) {
        const tp = boardMode === 'gross' ? l.grossToPar : l.netToPar;
        const val = l.thru ? (stable ? l.pts + '' : toPar(tp)) : '';
        return '<button type="button" class="lb-row' + (l.thru ? '' : ' waiting') + (i === 0 && l.thru ? ' leader' : '') + '" data-key="' + esc(l.p.memberId) + '" data-val="' + esc(val + '|' + l.thru) + '" style="--i:' + i + '" aria-label="' + esc(l.name + ', ' + (l.thru ? 'position ' + l.pos + ', ' + val + ' through ' + l.thru : 'not started') + '. Open scorecard') + '">' +
          '<span class="lb-pos">' + esc(l.pos || '') + '</span>' +
          '<span class="lb-name"><span class="lb-player"><span class="lb-full">' + esc(l.name) + '</span><span class="lb-short">' + esc(shortName(l.p.memberId)) + '</span></span><span class="lb-ch">CH ' + (l.ch < 0 ? '+' + Math.abs(l.ch) : l.ch) + '</span></span>' +
          '<span class="lb-thru">' + (l.thru === 18 ? 'F' : (l.thru || '–')) + '</span>' +
          '<span class="lb-tile ' + (l.thru ? (stable ? 'pts' : parClass(tp)) : 'blank') + '">' + esc(val) + '</span>' +
          '<span class="lb-num lb-hide-sm">' + (l.thru ? l.gross : '') + '</span>' +
          '<span class="lb-num">' + (l.thru ? (stable ? toPar(l.netToPar) : (l.net != null ? l.net : '<span class="lb-partial">' + (l.gross - l.strokes) + '</span>')) : '') + '</span>' +
          '</button>';
      }).join('') + '</div>' +
      (lb.length > TRN_TOP ? '<div class="lb-more"><button type="button" class="s-link" data-action="lb-all" aria-expanded="' + trnAllRows + '">' + (trnAllRows ? 'Show top ' + TRN_TOP : 'Full leaderboard (' + lb.length + ')') + '</button></div>' : '');
  }
  function drawBoard(host, t, animate) {
    const prev = {};
    if (animate) ui.$$('.lb-row', host).forEach(function (r) { prev[r.dataset.key] = { top: r.getBoundingClientRect().top, val: r.dataset.val }; });
    host.innerHTML = boardHTML(t);
    host.classList.toggle('lb-initial', !animate);
    if (!animate) return;
    ui.$$('.lb-row', host).forEach(function (r) {
      const old = prev[r.dataset.key]; if (!old) return;
      const dy = old.top - r.getBoundingClientRect().top;
      if (old.val !== r.dataset.val) { r.classList.add('lb-changed'); setTimeout(function () { r.classList.remove('lb-changed'); }, 1600); }
      if (Math.abs(dy) < 1) return;
      r.classList.add(dy > 0 ? 'lb-up' : 'lb-down');
      r.style.transition = 'none'; r.style.transform = 'translateY(' + dy + 'px)';
      r.getBoundingClientRect();
      requestAnimationFrame(function () {
        r.style.transition = 'transform 760ms var(--ease-out)'; r.style.transform = '';
        setTimeout(function () { r.style.transition = ''; r.classList.remove('lb-up', 'lb-down'); }, 820);
      });
    });
  }

  function scoreCellClass(s, par) { if (s == null) return ''; const d = s - par; return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl'; }

  function gridHTML(t) {
    const hs = holeList(); const editable = t.status === 'live';
    if (!(t.field || []).length) return ui.empty({ icon: 'members', title: 'No players in the field', text: 'Add members to the field to start entering scores.' });
    const lines = (t.field || []).slice().sort(function (a, b) { return memberName(a.memberId).split(' ').pop().localeCompare(memberName(b.memberId).split(' ').pop()); });
    const hcell = function (from, to, fn) { let h = ''; for (let i = from; i < to; i++) h += fn(i); return h; };
    let html = '<div class="table-wrap sg-wrap"><table class="table sg"><thead>' +
      '<tr><th class="sg-name">Hole</th>' + hcell(0, 9, function (i) { return '<th class="c">' + (i + 1) + '</th>'; }) + '<th class="c sg-sum">Out</th>' + hcell(9, 18, function (i) { return '<th class="c">' + (i + 1) + '</th>'; }) + '<th class="c sg-sum">In</th><th class="c sg-sum">Tot</th><th class="c sg-sum">Net</th></tr>' +
      '<tr class="sg-par"><td class="sg-name">Par</td>' + hcell(0, 9, function (i) { return '<td class="c">' + hs[i].par + '</td>'; }) + '<td class="c sg-sum">' + hs.slice(0, 9).reduce(function (a, h) { return a + h.par; }, 0) + '</td>' + hcell(9, 18, function (i) { return '<td class="c">' + hs[i].par + '</td>'; }) + '<td class="c sg-sum">' + hs.slice(9).reduce(function (a, h) { return a + h.par; }, 0) + '</td><td class="c sg-sum">' + parTotal(hs) + '</td><td class="sg-sum"></td></tr>' +
      '</thead><tbody>';
    lines.forEach(function (p) {
      const cell = function (i) { const s = p.scores ? p.scores[i] : null; return '<td class="c sg-cell ' + scoreCellClass(s, hs[i].par) + '"><input class="sg-in" inputmode="numeric" type="number" min="1" max="15" step="1" data-m="' + esc(p.memberId) + '" data-h="' + i + '" value="' + (s == null ? '' : s) + '"' + (editable ? '' : ' disabled') + ' aria-label="' + esc(memberName(p.memberId) + ' hole ' + (i + 1)) + '"></td>'; };
      html += '<tr data-row="' + esc(p.memberId) + '"><td class="sg-name"><span class="person-name">' + esc(memberName(p.memberId)) + '</span><span class="person-sub">CH ' + courseHcp(p.handicap, hs) + '</span></td>' + hcell(0, 9, cell) + '<td class="c sg-sum" data-sum="out"></td>' + hcell(9, 18, cell) + '<td class="c sg-sum" data-sum="in"></td><td class="c sg-sum" data-sum="tot"></td><td class="c sg-sum" data-sum="net"></td></tr>';
    });
    return html + '</tbody></table></div>';
  }
  function fillSums(root, t) {
    const hs = holeList();
    (t.field || []).forEach(function (p) {
      const row = root.querySelector('tr[data-row="' + CSS.escape(p.memberId) + '"]'); if (!row) return;
      const l = calcLine(p, hs);
      row.querySelector('[data-sum=out]').textContent = l.outN ? l.out : '';
      row.querySelector('[data-sum=in]').textContent = l.inN ? l.inn : '';
      row.querySelector('[data-sum=tot]').textContent = l.thru ? l.gross : '';
      row.querySelector('[data-sum=net]').textContent = l.thru === 18 ? l.net : (l.thru ? toPar(l.netToPar) : '');
    });
  }

  function scorecardModal(t, memberId) {
    const p = (t.field || []).find(function (x) { return x.memberId === memberId; }); if (!p) return;
    const hs = holeList(); const l = calcLine(p, hs); const m = Club.members.get(memberId);
    const half = function (from, label, sum, sumN) {
      const r = hs.slice(from, from + 9);
      const parSum = r.reduce(function (a, h) { return a + h.par; }, 0);
      const ydSum = function (k) { return r.reduce(function (a, h) { return a + ((h.yards && h.yards[k]) || 0); }, 0); };
      const cells = function (fn) { return r.map(function (h, k) { return fn(h, from + k); }).join(''); };
      return '<table class="sc-table"><tbody>' +
        '<tr class="sc-hole"><th>Hole</th>' + cells(function (h) { return '<td>' + h.number + '</td>'; }) + '<td class="sc-sum">' + label + '</td></tr>' +
        TEES.map(function (tee) { return '<tr class="sc-yds' + (tee.key === COURSE.tee ? ' sc-played' : '') + '"><th>' + tee.label + '</th>' + cells(function (h) { return '<td>' + ((h.yards && h.yards[tee.key]) || '') + '</td>'; }) + '<td class="sc-sum">' + (ydSum(tee.key) || '') + '</td></tr>'; }).join('') +
        '<tr class="sc-hcp"><th>Handicap</th>' + cells(function (h) { return '<td>' + h.handicap + '</td>'; }) + '<td class="sc-sum"></td></tr>' +
        '<tr class="sc-par"><th>Par</th>' + cells(function (h) { return '<td>' + h.par + '</td>'; }) + '<td class="sc-sum">' + parSum + '</td></tr>' +
        '<tr class="sc-score"><th>' + esc(m ? m.firstName : 'Score') + '</th>' + cells(function (h, i) { const s = p.scores ? p.scores[i] : null; const st = strokesOn(l.ch, h.handicap); return '<td><span class="sc-mark ' + scoreCellClass(s, h.par) + '">' + (s == null ? '' : s) + '</span>' + (st > 0 ? '<i class="sc-dots">' + new Array(st + 1).join('•') + '</i>' : '') + '</td>'; }) + '<td class="sc-sum">' + (sumN ? sum : '') + '</td></tr>' +
        '</tbody></table>';
    };
    const body = '<div class="sc-card">' +
      '<div class="sc-top"><div><div class="eyebrow">' + esc(Club.info.name) + '</div><div class="sc-title serif">' + esc(t.name) + '</div><div class="person-sub">' + esc(fmt.dateLong(t.date) + ' · ' + t.format + ' · ' + COURSE.teeLabel) + '</div></div>' +
      '<div class="sc-player"><span class="label-caps">Player</span><span class="serif">' + esc(memberName(memberId)) + '</span><span class="person-sub">Index ' + esc(fmt.handicap(p.handicap)) + ' · Course handicap ' + (l.ch < 0 ? '+' + Math.abs(l.ch) : l.ch) + '</span></div></div>' +
      '<div class="sc-halves">' + half(0, 'Out', l.out, l.outN) + half(9, 'In', l.inn, l.inN) + '</div>' +
      '<div class="sc-totals"><div><span class="label-caps">Gross</span><span class="serif">' + (l.thru ? l.gross : '–') + '</span></div><div><span class="label-caps">Handicap</span><span class="serif">' + (l.ch < 0 ? '+' + Math.abs(l.ch) : l.ch) + '</span></div><div><span class="label-caps">Net</span><span class="serif">' + (l.net != null ? l.net : (l.thru ? l.gross - l.strokes : '–')) + '</span></div><div><span class="label-caps">To par</span><span class="serif ev-topar ' + parClass(l.netToPar) + '">' + (l.thru ? toPar(l.netToPar) : '–') + '</span></div>' + (t.format === 'Stableford' ? '<div><span class="label-caps">Points</span><span class="serif">' + l.pts + '</span></div>' : '') + '</div>' +
      '<div class="sc-legend"><span><span class="sc-mark birdie">3</span> Birdie</span><span><span class="sc-mark eagle">2</span> Eagle or better</span><span><span class="sc-mark bogey">5</span> Bogey</span><span><span class="sc-mark dbl">6</span> Double or worse</span><span><i class="sc-dots">•</i> Stroke received</span></div>' +
      '<div class="sc-sign"><div><span></span>Marker</div><div><span></span>Player</div><div><span class="serif">' + (l.thru === 18 ? 'Card complete' : 'Thru ' + l.thru) + '</span>Attested</div></div>' +
      '</div>';
    ui.modal({ title: 'Scorecard', eyebrow: memberName(memberId), size: 'xl', body: body, actions: [{ label: 'Print', kind: 'ghost', icon: 'print', onClick: function () { window.print(); return false; } }, { label: 'Close', kind: 'primary' }] });
  }

  function renderTournament(view, id) {
    let t = S.find('tournaments', id);
    if (!t) {
      view.innerHTML = ui.pageHeader({ eyebrow: 'Tournaments', title: 'Tournament not found' }) + ui.empty({ icon: 'trophy', title: 'This tournament could not be found', text: 'It may have been deleted.', action: '<a class="btn btn-primary" href="#/events/tournaments">All tournaments</a>' });
      return;
    }
    const ev = t.eventId ? S.find('events', t.eventId) : null;
    const stable = t.format === 'Stableford';
    let actions = '';
    if (t.status === 'upcoming') actions += ui.btn('Start scoring', { kind: 'primary', icon: 'flag', action: 'start' });
    if (t.status === 'live') actions += ui.btn('Back to upcoming', { kind: 'ghost', icon: 'refresh', action: 'unstart', title: 'Step back: close score entry until the field tees off' }) + ui.btn('Finalize results', { kind: 'primary', icon: 'check', action: 'finalize' });
    if (t.status === 'final') actions += ui.btn('Reopen scoring', { icon: 'refresh', action: 'reopen' });
    actions += ui.btn('Edit', { icon: 'edit', action: 'edit' }) + ui.btn('', { kind: 'ghost', icon: 'trash', action: 'delete', title: 'Delete tournament' });

    view.innerHTML = '<a class="ev-back" href="#/events/tournaments">' + Club.icon('chevronLeft') + '<span>All tournaments</span></a>' +
      ui.pageHeader({ eyebrow: 'Tournament · ' + t.format, title: t.name, subtitle: esc(fmt.dateLong(t.date)) + (ev ? ' · <a href="#/events/' + esc(ev.id) + '">' + esc(ev.title) + '</a>' : '') + ' · ' + statusBadge(t.status), actions: actions }) +
      '<div class="grid grid-main-side ev-trn-layout">' +
      '<section class="panel lb-panel" data-reveal><div class="lb-top">' +
      '<div><div class="eyebrow">' + (t.status === 'live' ? '<span class="live-dot"></span> Live scoring' : t.status === 'final' ? 'Final results' : 'Awaiting first tee') + '</div><h2 class="lb-title">Leaderboard</h2></div>' +
      (stable ? '<span class="label-caps">Stableford points</span>' : ui.segmented([{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }], boardMode, 'board')) +
      '</div><div class="lb-board"></div><p class="lb-foot">' + esc(COURSE.teeLabel + ' · Par ' + parTotal()) + '</p></section>' +
      '<div class="stack">' +
      '<div class="panel" data-reveal><div class="panel-head"><div><h3>Field</h3><div class="person-sub ev-field-count"></div></div></div><div class="panel-body ev-field-add"></div><ul class="list ev-field-list"></ul></div>' +
      '</div></div>' +
      '<section class="panel sg-panel" data-reveal><div class="panel-head"><div><h3>Score entry</h3><div class="person-sub">' + (t.status === 'live' ? 'Enter gross strokes per hole (1 to 15). Press Enter to move to the next hole.' : t.status === 'final' ? 'Results are final. Reopen scoring to make corrections.' : 'Start scoring when the field tees off.') + '</div></div>' +
      '<div class="sg-key"><span class="sg-k birdie"></span>Under par<span class="sg-k bogey"></span>Over par</div></div><div class="panel-body flush sg-host"></div></section>';

    const board = ui.$('.lb-board', view), gridHost = ui.$('.sg-host', view);
    function drawField() {
      t = S.find('tournaments', id);
      const inField = (t.field || []).map(function (p) { return p.memberId; });
      const avail = S.all('members').filter(function (m) { return isGolfer(m) && m.status === 'active' && inField.indexOf(m.id) < 0; }).sort(function (a, b) { return a.lastName.localeCompare(b.lastName); });
      ui.$('.ev-field-count', view).textContent = inField.length + (inField.length === 1 ? ' player' : ' players');
      ui.$('.ev-field-add', view).innerHTML = t.status === 'final' ? '<p class="muted" style="margin:0">The field is locked for final results.</p>' :
        '<form class="ev-add-row" novalidate><select class="select" name="memberId" aria-label="Add member to field"><option value="">Add a golfing member</option>' + avail.map(function (m) { return '<option value="' + m.id + '">' + esc(m.lastName + ', ' + m.firstName) + ' · ' + esc(fmt.handicap(m.handicap)) + '</option>'; }).join('') + '</select>' + ui.btn('Add', { kind: 'primary', icon: 'plus', action: 'add-player' }) + '</form>';
      const hs = holeList();
      ui.$('.ev-field-list', view).innerHTML = (t.field || []).length ? t.field.slice().sort(function (a, b) { return memberName(a.memberId).split(' ').pop().localeCompare(memberName(b.memberId).split(' ').pop()); }).map(function (p) {
        const thru = (p.scores || []).filter(function (s) { return s != null; }).length;
        return '<li>' + ui.avatar(memberName(p.memberId), 'sm') + '<div style="flex:1;min-width:0"><div class="person-name">' + esc(memberName(p.memberId)) + '</div><div class="person-sub">Index ' + esc(fmt.handicap(p.handicap)) + ' · CH ' + courseHcp(p.handicap, hs) + (thru ? ' · ' + thru + ' holes' : '') + '</div></div>' +
          (t.status !== 'final' ? ui.btn('', { kind: 'ghost', sm: true, icon: 'close', action: 'rm-player', id: p.memberId, title: 'Remove from field' }) : '') + '</li>';
      }).join('') : '<li class="muted">No players yet.</li>';
    }
    function drawGrid() { gridHost.innerHTML = gridHTML(t); fillSums(gridHost, t); pinHead(); }
    /* The Hole and Par rows stay pinned while the grid scrolls: the Par row sits right under the Hole row (its real
       height, not a fixed number), and a score box that would sit under them is scrolled back into view. */
    function pinHead() {
      const wrap = ui.$('.sg-wrap', gridHost), head = wrap && ui.$('thead tr:first-child th', wrap); if (!head) return;
      wrap.style.setProperty('--sg-head', head.getBoundingClientRect().height + 'px');
    }
    function reveal(inp) {
      const wrap = ui.$('.sg-wrap', gridHost), par = wrap && ui.$('tr.sg-par td', wrap); if (!par) return;   /* the pinned cell, not the row (rows don't move) */
      const under = par.getBoundingClientRect().bottom - inp.getBoundingClientRect().top;
      if (under > -4) wrap.scrollTop -= under + 6;
    }
    ui.on(view, 'focusin', '.sg-in', function (e, inp) { reveal(inp); });
    drawBoard(board, t, false); drawField(); drawGrid();

    ui.on(view, 'click', '.lb-panel .segmented button', function (e, b) {
      boardMode = b.dataset.value; ui.$$('.lb-panel .segmented button', view).forEach(function (x) { x.classList.toggle('active', x === b); });
      drawBoard(board, S.find('tournaments', id), true);
    });
    ui.on(view, 'click', '.lb-row', function (e, r) { scorecardModal(S.find('tournaments', id), r.dataset.key); });
    ui.on(view, 'click', '[data-action=lb-all]', function () { trnAllRows = !trnAllRows; drawBoard(board, S.find('tournaments', id), false); });
    ui.on(view, 'submit', '.ev-add-row', function (e) { e.preventDefault(); });
    ui.on(view, 'keydown', '.sg-in', function (e, inp) {
      if (e.key === 'Enter') {
        e.preventDefault(); inp.dispatchEvent(new Event('change', { bubbles: true }));
        const all = ui.$$('.sg-in', gridHost); const nx = all[all.indexOf(inp) + 1]; if (nx) { nx.focus(); nx.select(); }
      }
    });
    ui.on(view, 'change', '.sg-in', function (e, inp) {
      const raw = inp.value.trim(); const cell = inp.parentElement;
      inp.classList.remove('invalid'); inp.removeAttribute('title');
      let v = null;
      if (raw !== '') {
        v = Number(raw);
        if (!Number.isInteger(v) || v < 1 || v > 15) { inp.classList.add('invalid'); inp.title = 'Enter a whole number from 1 to 15'; ui.toast('Scores must be whole numbers from 1 to 15', 'bad'); return; }
      }
      const cur = S.find('tournaments', id); if (!cur) return;
      const h = +inp.dataset.h;
      const field = cur.field.map(function (p) {
        if (p.memberId !== inp.dataset.m) return p;
        const sc = (p.scores || []).slice(); while (sc.length < 18) sc.push(null); sc[h] = v;
        return Object.assign({}, p, { scores: sc });
      });
      S.update('tournaments', id, { field: field });
      t = S.find('tournaments', id);
      const hs = holeList();
      cell.className = 'c sg-cell ' + scoreCellClass(v, hs[h].par) + ' sg-saved';
      setTimeout(function () { cell.classList.remove('sg-saved'); }, 900);
      fillSums(gridHost, t); drawBoard(board, t, true); drawField();
    });
    ui.on(view, 'click', '[data-action]', async function (e, b) {
      const a = b.dataset.action; const cur = S.find('tournaments', id); if (!cur) return;
      if (a === 'add-player') {
        const sel = ui.$('.ev-add-row select', view); const m = Club.members.get(sel.value);
        if (!m) { sel.classList.add('invalid'); ui.toast('Choose a member to add', 'bad'); return; }
        if ((cur.field || []).some(function (p) { return p.memberId === m.id; })) { ui.toast('Already in the field', 'bad'); return; }
        const nm = m.firstName + ' ' + m.lastName;
        undoRun(function () { S.update('tournaments', id, { field: (cur.field || []).concat([{ memberId: m.id, handicap: m.handicap != null ? m.handicap : 18, scores: new Array(18).fill(null) }]) }); },
          { message: nm + ' added to the field', undone: nm + ' taken off the field' });
        t = S.find('tournaments', id);
        drawField(); drawGrid(); drawBoard(board, t, true);
      } else if (a === 'rm-player') {
        const p = cur.field.find(function (x) { return x.memberId === b.dataset.id; }); if (!p) return;
        const has = (p.scores || []).some(function (s) { return s != null; });
        if (has && !(await ui.confirm({ title: 'Remove from field?', text: memberName(p.memberId) + ' has scores entered. Removing the player deletes their card.', confirmLabel: 'Remove player', danger: true }))) return;
        const fresh = S.find('tournaments', id); if (!fresh) return;
        undoRun(function () { S.update('tournaments', id, { field: fresh.field.filter(function (x) { return x.memberId !== p.memberId; }) }); },
          { message: 'Player removed from the field', undone: memberName(p.memberId) + ' is back in the field' + (has ? ' with their card' : '') });
        t = S.find('tournaments', id);
        drawField(); drawGrid(); drawBoard(board, t, true);
      } else if (a === 'start') { undoRun(function () { S.update('tournaments', id, { status: 'live' }); }, { message: 'Scoring is open', undone: 'Tournament back to upcoming' }); Club.app.render(); }
      else if (a === 'unstart') { undoRun(function () { S.update('tournaments', id, { status: 'upcoming' }); }, { message: 'Tournament back to upcoming. Scores entered are kept', undone: 'Scoring is open again' }); Club.app.render(); }
      else if (a === 'finalize') {
        const incomplete = cur.field.filter(function (p) { return (p.scores || []).filter(function (s) { return s != null; }).length < 18; }).length;
        if (await ui.confirm({ title: 'Finalize results?', text: incomplete ? incomplete + ' players have incomplete cards. They will be listed as they stand.' : 'All cards are complete. The leaderboard will be locked as final.', confirmLabel: 'Finalize results' })) {
          /* closedEvent: the calendar event this finalize marked completed, so Reopen scoring can step it back too. */
          undoRun(function () {
            const e2 = cur.eventId ? S.find('events', cur.eventId) : null;
            const closes = !!(e2 && e2.status === 'published' && e2.date <= today());
            S.update('tournaments', id, { status: 'final', closedEvent: closes ? e2.id : null });
            if (closes) S.update('events', e2.id, { status: 'completed' });
          }, { message: 'Results finalized', undone: 'Scoring is open again' });
          Club.app.render();
        }
      } else if (a === 'reopen') {
        /* Reverses what finalizing did: scoring opens and the linked event it completed is published again. */
        const e3 = cur.closedEvent ? S.find('events', cur.closedEvent) : null;
        const back = !!(e3 && e3.status === 'completed');
        undoRun(function () {
          S.update('tournaments', id, { status: 'live', closedEvent: null });
          if (back) S.update('events', e3.id, { status: 'published' });
        }, { message: 'Scoring reopened' + (back ? '. ' + e3.title + ' is back to published' : ''), undone: 'Results final again' });
        Club.app.render();
      }
      else if (a === 'edit') openTournamentForm(cur);
      else if (a === 'delete') {
        if (await ui.confirm({ title: 'Delete tournament?', text: 'This removes ' + cur.name + ', its field and every scorecard. The linked calendar event is kept.', confirmLabel: 'Delete tournament', danger: true })) {
          undoRun(function () { S.remove('tournaments', id); }, { message: 'Tournament deleted', undone: cur.name + ' restored with its scorecards' });
          Club.app.go('events/tournaments');
        }
      }
    });
  }
  const LEAGUE_FORMATS = ['Stableford', 'Stroke play'];
  const ALLOWANCES = [100, 95, 90, 85, 80, 75];
  function leagueBadge(lg) { const s = leagueStatus(lg); return ui.badge(statusLabel(s), { upcoming: 'info', active: 'good', complete: 'dark' }[s]); }
  function rescoreWeek(lg, w) {
    const res = (w.results || []).map(function (r) { const x = leagueScore(lg, w.nine, r.memberId, r.gross, r.handicap); delete x.par; return x; });
    return Object.assign({}, w, { results: awardPoints(lg, res) });
  }

  /* ---------------- League: staff screens ---------------- */
  let leagueId = null, leagueUpto = null, lgAllRows = false, lgAllWins = false;
  const LG_TOP = 10, LG_WINS = 5; let lgNightsOpen = false;
  function currentLeague() { return pickLeague(leagueId); }   /* the one picked on the staff League tab */
  function ptsFmt(v, d) { return v == null ? '–' : (d ? (Math.round(v * 10) / 10).toFixed(1) : String(v)); }
  function seasonLine(lg) { return lg.season ? fmt.dateShort(lg.season.start) + ' to ' + fmt.date(lg.season.end) : 'Dates to be set'; }
  function moveHTML(mv) {
    if (mv == null) return '<span class="lg-move same" aria-label="No change">–</span>';
    if (mv === 'new') return '<span class="lg-move new">New</span>';
    if (mv === 0) return '<span class="lg-move same" aria-label="No change">–</span>';
    return '<span class="lg-move ' + (mv > 0 ? 'up' : 'down') + '" aria-label="' + (mv > 0 ? 'Up ' : 'Down ') + Math.abs(mv) + '">' + Club.icon(mv > 0 ? 'arrowUp' : 'arrowDown') + Math.abs(mv) + '</span>';
  }

  function renderLeague(panel) {
    const lg = currentLeague();
    if (!lg) {
      panel.innerHTML = '<div class="panel">' + ui.empty({ icon: 'trophy', title: "No members' league set up", text: 'Set up the season: league night, format, handicap allowance and the roster. Weekly results and standings follow.', action: ui.btn('Set up league', { kind: 'primary', icon: 'plus', action: 'lg-new' }) }) + '</div>';
      ui.on(panel, 'click', '[data-action=lg-new]', function () { openLeagueForm(null); });
      return;
    }
    const st = leagueStatus(lg); const ls = leaguesSorted();
    const played = playedIdx(lg);
    if (leagueUpto == null || played.indexOf(leagueUpto) < 0) leagueUpto = played.length ? played[played.length - 1] : null;
    const weeks = lg.weeks || [];
    const nextW = weeks.find(function (w) { return w.date >= today() && !w.cancelled; });
    const stroke = lg.format === 'Stroke play';
    const rounds = weeks.reduce(function (a, w) { return a + (isPlayed(w) ? w.results.length : 0); }, 0);

    panel.innerHTML = '<section class="panel lg-head" data-reveal><div class="lg-head-main">' +
      '<div class="eyebrow">Members\' league · ' + esc(lg.season ? lg.season.start.slice(0, 4) : '') + ' season</div>' +
      '<div class="lg-head-title"><h2>' + esc(lg.name) + '</h2>' + leagueBadge(lg) + '</div>' +
      '<div class="lg-head-meta"><span>' + Club.icon('calendar') + esc(lg.night + 's at ' + fmt.time(lg.startTime)) + '</span><span>' + Club.icon('clock') + esc(seasonLine(lg)) + '</span><span>' + Club.icon('flag') + esc(lg.format + ', ' + (+lg.holes === 18 ? '18 holes' : '9 holes') + ', ' + lg.allowance + '% allowance') + '</span><span>' + Club.icon('members') + esc((lg.members || []).length + ' members') + '</span></div>' +
      '</div><div class="lg-head-actions">' +
      (ls.length > 1 ? '<select class="select lg-pick" aria-label="Choose league">' + ls.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === lg.id ? ' selected' : '') + '>' + esc(l.name + ' · ' + (l.season ? l.season.start.slice(0, 4) : '')) + '</option>'; }).join('') + '</select>' : '') +
      ui.btn('Roster', { icon: 'members', action: 'lg-roster' }) + ui.btn('Edit setup', { icon: 'edit', action: 'lg-edit' }) +
      ui.btn('Export CSV', { kind: 'ghost', icon: 'download', action: 'lg-csv' }) + ui.btn('New season', { kind: 'ghost', icon: 'plus', action: 'lg-new' }) +
      '</div>' +
      '<dl class="lg-facts"><div><dt>Nights played</dt><dd>' + played.length + '<small> of ' + weeks.length + '</small></dd></div><div><dt>Rounds</dt><dd>' + rounds + '</dd></div><div><dt>Average field</dt><dd>' + (played.length ? Math.round(rounds / played.length) : 0) + '</dd></div><div><dt>' + (st === 'complete' ? 'Champion' : 'Leader') + '</dt><dd class="lg-facts-name"></dd></div></dl>' +
      '</section>' +
      '<div class="grid grid-main-side lg-layout">' +
      '<section class="panel lb-panel lg-board-panel" data-reveal><div class="lb-top">' +
      '<div><div class="eyebrow lg-board-eyebrow"></div><h2 class="lb-title">Standings</h2></div>' +
      '<div class="lg-step">' + ui.btn('', { sm: true, icon: 'chevronLeft', action: 'lg-prev', title: 'Previous week' }) + '<span class="lg-step-label" aria-live="polite"></span>' + ui.btn('', { sm: true, icon: 'chevronRight', action: 'lg-next', title: 'Next week' }) + '</div>' +
      '</div><div class="lb-board lg-board"></div><p class="lb-foot">' + esc(stroke ? 'Weekly points by net finish: ' + PLACE_POINTS.slice(0, 3).join(', ') + ' and down to 3 for twelfth, ' + PLAYED_POINTS + ' for every other card. Ties share the higher place.' : 'Stableford points from each gross total: two per hole plus par and strokes received, minus gross. Strokes are ' + lg.allowance + '% of course handicap, given by stroke index.') + ' Movement compares with the previous league night.</p></section>' +
      '<div class="stack lg-side"></div></div>' +
      '<section class="lg-nights" data-reveal>' + Portal.accordion({ id: 'lg-nights-acc', icon: 'calendar', title: 'League nights', summary: weeks.length + ' ' + lg.night + 's · ' + played.length + ' with results · ' + seasonLine(lg), body: '<div class="lg-nights-host"></div>', open: lgNightsOpen }) + '</section>';

    const board = ui.$('.lg-board', panel);
    function drawStandings(animate) {
      const cur = S.find('leagues', lg.id) || lg;
      const sd = standings(cur, leagueUpto);
      const w = leagueUpto != null ? cur.weeks[leagueUpto] : null;
      const n = sd.played.indexOf(leagueUpto);
      ui.$('.lg-board-eyebrow', panel).innerHTML = !w ? 'Awaiting the first league night' : (leagueStatus(cur) === 'complete' && n === sd.played.length - 1 ? 'Final standings' : 'After week ' + (cur.weeks.indexOf(w) + 1));
      ui.$('.lg-step-label', panel).textContent = w ? fmt.dateShort(w.date) : 'No results';
      ui.$('[data-action=lg-prev]', panel).disabled = n <= 0;
      ui.$('[data-action=lg-next]', panel).disabled = n < 0 || n >= sd.played.length - 1;
      const lead = sd.rows[0] && sd.rows[0].rounds ? sd.rows[0] : null;
      ui.$('.lg-facts-name', panel).textContent = lead ? lead.name : 'To be decided';
      const html = !sd.rows.length ? '<div class="lb-empty serif">The roster is empty. Add members to begin.</div>' :
        '<div class="lb-head lg-cols"><span class="c">Pos</span><span>Player</span><span class="c">Rnds</span><span class="c lb-hide-sm">Avg</span><span class="c lb-hide-sm">Best</span><span class="c">Points</span><span class="c">Move</span></div>' +
        '<div class="lb-rows">' + sd.rows.filter(function (r, i) { return lgAllRows || i < LG_TOP; }).map(function (r, i) {
          return '<button type="button" class="lb-row lg-cols' + (r.rounds ? '' : ' waiting') + (i === 0 && r.rounds ? ' leader' : '') + '" data-key="' + esc(r.memberId) + '" data-val="' + r.total + '|' + r.rounds + '" style="--i:' + i + '" aria-label="' + esc(r.name + ', ' + (r.rounds ? 'position ' + r.pos + ', ' + r.total + ' points from ' + r.rounds + ' rounds' : 'no rounds yet') + '. Open season card') + '">' +
            '<span class="lb-pos">' + esc(r.rounds ? r.pos : '') + '</span>' +
            '<span class="lb-name"><span class="lb-player"><span class="lb-full">' + esc(r.name) + '</span><span class="lb-short">' + esc(shortName(r.memberId)) + '</span></span></span>' +
            '<span class="lb-thru">' + r.rounds + '</span>' +
            '<span class="lb-num lb-hide-sm">' + (stroke ? ptsFmt(r.avgNet, 1) : ptsFmt(r.avg, 1)) + '</span>' +
            '<span class="lb-num lb-hide-sm">' + ptsFmt(r.best) + '</span>' +
            '<span class="lb-tile pts">' + r.total + '</span>' +
            '<span class="lg-move-cell">' + moveHTML(r.move) + '</span></button>';
        }).join('') + '</div>' +
        (sd.rows.length > LG_TOP ? '<div class="lb-more"><button type="button" class="s-link" data-action="lg-allrows" aria-expanded="' + lgAllRows + '">' + (lgAllRows ? 'Show top ' + LG_TOP : 'Full standings (' + sd.rows.length + ')') + '</button></div>' : '');
      flipRender(board, html, animate);
    }
    function drawSide() {
      const cur = S.find('leagues', lg.id) || lg; const sd = standings(cur);
      const champ = leagueStatus(cur) === 'complete' && sd.rows[0] && sd.rows[0].rounds ? sd.rows.filter(function (r) { return r.rank === 1; }) : null;
      let h = '';
      if (champ) {
        h += '<div class="panel lg-champ" data-reveal><div class="panel-body"><div class="eyebrow">' + esc(cur.season.start.slice(0, 4)) + ' league champion' + (champ.length > 1 ? 's' : '') + '</div>' +
          '<div class="lg-champ-name">' + esc(champ.map(function (r) { return r.name; }).join(' and ')) + '</div>' +
          '<div class="person-sub">' + champ[0].total + ' points from ' + champ[0].rounds + ' rounds · best night ' + ptsFmt(champ[0].best) + '</div>' +
          '<div class="lg-podium">' + sd.rows.filter(function (r) { return r.rounds && r.rank > 1 && r.rank <= 3; }).map(function (r) { return '<span><b>' + esc(r.pos) + '</b>' + esc(r.name) + ' · ' + r.total + '</span>'; }).join('') + '</div></div></div>';
      }
      const nx = (cur.weeks || []).find(function (w) { return w.date >= today() && !w.cancelled; });
      const wait = (cur.weeks || []).map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return x.w.date <= today() && !x.w.cancelled && !isPlayed(x.w); });
      if (wait.length) {
        h += '<div class="panel lg-await" data-reveal><div class="panel-body"><div class="lg-await-row">' + Club.icon('alert', 'lg-await-icon') + '<div><div class="person-name">' + (wait.length === 1 ? 'Week ' + (wait[0].i + 1) + ' needs results' : wait.length + ' nights need results') + '</div><div class="person-sub">' + esc(wait.map(function (x) { return fmt.dateShort(x.w.date); }).join(', ')) + '</div></div></div>' +
          ui.btn('Enter results', { kind: 'primary', sm: true, icon: 'edit', action: 'lg-results', id: String(wait[0].i) }) + '</div></div>';
      }
      h += '<div class="panel" data-reveal><div class="panel-head"><h3>Next league night</h3></div><div class="panel-body">';
      if (nx) {
        const b = weekBlock(nx);
        h += '<div class="lg-next"><div class="lg-next-date"><span class="label-caps">' + esc(fmt.weekday(nx.date)) + '</span><span class="serif">' + (+nx.date.slice(8)) + '</span><span class="label-caps">' + esc(fmt.toDate(nx.date).toLocaleDateString('en-US', { month: 'short' })) + '</span></div>' +
          '<div><div class="person-name">Week ' + (cur.weeks.indexOf(nx) + 1) + ' · ' + esc(nineLabel(nx.nine)) + '</div><div class="person-sub">' + esc(fmt.relative(nx.date) + ' · first tee ' + fmt.time(cur.startTime)) + '</div>' +
          (b ? '<a class="lg-block-link" href="#/teesheet/' + esc(nx.date) + '">' + Club.icon('teesheet') + 'Tee sheet blocked from ' + esc(fmt.time(b.start)) + '</a>' : '<p class="lg-block-none">No league block on the tee sheet yet.</p>' + ui.btn('Block tee sheet', { sm: true, icon: 'teesheet', action: 'lg-block', id: nx.date })) +
          '</div></div>';
      } else {
        h += '<p class="muted lg-quiet">' + (leagueStatus(cur) === 'complete' ? 'The season is complete. Start a new season when the course opens in the spring.' : 'No league nights remain on the schedule.') + '</p>';
      }
      h += '</div></div>';
      const wins = sd.played.slice().reverse().map(function (i) { return { i: i, w: cur.weeks[i] }; });
      h += '<div class="panel" data-reveal><div class="panel-head"><h3>Weekly winners</h3><span class="muted lg-wins-n">' + wins.length + ' nights</span></div>' +
        (wins.length ? '<ol class="list lg-winners">' + wins.filter(function (x, k) { return lgAllWins || k < LG_WINS; }).map(function (x) {
          const ws = weekWinners(x.w, cur);
          return '<li><span class="lg-win-wk">Wk ' + (x.i + 1) + '</span><span class="lg-win-main"><span class="person-name">' + esc(ws.map(function (r) { return memberName(r.memberId); }).join(', ')) + '</span><span class="person-sub">' + esc(fmt.dateShort(x.w.date) + ' · ' + nineLabel(x.w.nine) + (ws.length > 1 ? ' · tied' : '')) + '</span></span><span class="lg-win-score">' + (stroke ? 'Net ' + ws[0].net : ws[0].points + ' pts') + '</span></li>';
        }).join('') + '</ol>' + (wins.length > LG_WINS ? '<div class="lg-more"><button type="button" class="s-link" data-action="lg-allwins" aria-expanded="' + lgAllWins + '">' + (lgAllWins ? 'Show latest ' + LG_WINS : 'All weekly winners (' + wins.length + ')') + '</button></div>' : '') : '<div class="panel-body"><p class="muted" style="margin:0">Winners appear here after the first league night.</p></div>') + '</div>';
      const side = ui.$('.lg-side', panel); side.innerHTML = h; ui.animateIn(side);
    }
    function drawNights() {
      const cur = S.find('leagues', lg.id) || lg; const t = today();
      const host = ui.$('.lg-nights-host', panel);
      if (!(cur.weeks || []).length) { host.innerHTML = ui.empty({ icon: 'calendar', title: 'No league nights in these dates', text: 'Check the season dates and league night in the setup.', action: ui.btn('Edit setup', { kind: 'primary', icon: 'edit', action: 'lg-edit' }) }); return; }
      host.innerHTML = '<div class="table-wrap"><table class="table lg-table"><thead><tr><th class="num">Wk</th><th>Date</th><th class="ev-hide-sm">Nine</th><th class="lg-hide-md">Tee sheet</th><th class="num">Played</th><th class="num ev-hide-sm">Absent</th><th class="lg-hide-md">Winner</th><th>Status</th><th></th></tr></thead><tbody>' +
        cur.weeks.map(function (w, i) {
          const b = weekBlock(w); const ws = isPlayed(w) ? weekWinners(w, cur) : [];
          const status = w.cancelled ? ui.badge(w.note || 'Cancelled', 'bad') : isPlayed(w) ? ui.badge('Results in', 'good') : w.date < t ? ui.badge('Awaiting results', 'warn') : w.date === t ? ui.badge('Tonight', 'brass') : ui.badge('Scheduled', 'outline');
          const canEnter = w.date <= t;
          return '<tr class="' + (w.date === t ? 'selected' : '') + '"><td class="num">' + (i + 1) + '</td><td class="nowrap">' + esc(fmt.dateShort(w.date)) + '</td><td class="ev-hide-sm">' + esc(nineLabel(w.nine)) + '</td>' +
            '<td class="lg-hide-md">' + (b ? '<a href="#/teesheet/' + esc(w.date) + '" class="lg-block-link">' + Club.icon('teesheet') + esc(fmt.time(b.start)) + ' block</a>' : '<span class="muted">Not blocked</span>') + '</td>' +
            '<td class="num">' + (isPlayed(w) ? w.results.length : '–') + '</td><td class="num ev-hide-sm">' + (isPlayed(w) ? (w.absent || []).length : '–') + '</td>' +
            '<td class="lg-hide-md">' + (ws.length ? esc(ws.map(function (r) { return shortName(r.memberId); }).join(', ')) + ' <span class="muted">' + (stroke ? 'net ' + ws[0].net : ws[0].points + ' pts') + '</span>' : '') + '</td>' +
            '<td>' + status + '</td><td class="right">' + (canEnter ? ui.btn(isPlayed(w) || w.cancelled ? 'Edit' : 'Enter results', { sm: true, kind: isPlayed(w) || w.cancelled ? 'ghost' : 'primary', action: 'lg-results', id: String(i) }) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function drawAll(animate) { drawStandings(animate); drawSide(); drawNights(); }
    drawAll(false);
    ui.on(panel, 'accordion', '.lg-nights', function (e) { lgNightsOpen = e.detail.open; });

    ui.on(panel, 'change', '.lg-pick', function (e, s) { leagueId = s.value; leagueUpto = null; renderLeague(panel); ui.animateIn(panel); });
    ui.on(panel, 'click', '.lb-row', function (e, r) { memberSeasonModal(S.find('leagues', lg.id), r.dataset.key); });
    ui.on(panel, 'click', '[data-action]', async function (e, b) {
      const a = b.dataset.action; const cur = S.find('leagues', lg.id); if (!cur && a !== 'lg-new') return;
      const pl = cur ? playedIdx(cur) : [];
      if (a === 'lg-allrows') { lgAllRows = !lgAllRows; drawStandings(false); if (!lgAllRows) ui.$('.lg-board-panel', panel).scrollIntoView({ block: 'nearest' }); return; }
      if (a === 'lg-allwins') { lgAllWins = !lgAllWins; drawSide(); return; }
      if (a === 'lg-prev' || a === 'lg-next') {
        const k = pl.indexOf(leagueUpto) + (a === 'lg-prev' ? -1 : 1);
        if (k >= 0 && k < pl.length) { leagueUpto = pl[k]; drawStandings(true); }
      } else if (a === 'lg-new') openLeagueForm(null, cur);
      else if (a === 'lg-edit') openLeagueForm(cur);
      else if (a === 'lg-roster') openRoster(cur, function () { drawAll(true); });
      else if (a === 'lg-csv') exportLeagueCsv(cur, leagueUpto);
      else if (a === 'lg-results') openResults(cur, +b.dataset.id, function () { leagueUpto = null; const p2 = playedIdx(S.find('leagues', lg.id)); leagueUpto = p2.length ? p2[p2.length - 1] : null; drawAll(true); });
      else if (a === 'lg-block') {
        const date = b.dataset.id; if (leagueBlock(date)) { drawSide(); return; }
        const set = Object.assign({ interval: 9, last: '17:00' }, S.getObj('teeSheetSettings', {}) || {});
        const pm = String(set.last || '17:00').split(':'); const endMin = (+pm[0]) * 60 + (+pm[1] || 0) + (+set.interval || 9);
        const end = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
        const startMin = Math.max(0, (+cur.startTime.split(':')[0]) * 60 + (+cur.startTime.split(':')[1] || 0) - 60);
        const start = String(Math.floor(startMin / 60)).padStart(2, '0') + ':' + String(startMin % 60).padStart(2, '0');
        if (start >= end) { ui.toast('The league start time is after the last tee time', 'bad'); return; }
        undoRun(function () {
          const tb = S.insert('teeBlocks', { id: S.uid('tb'), date: date, start: start, end: end, kind: 'league', reason: "Members' league night" });
          S.update('leagues', cur.id, { weeks: cur.weeks.map(function (w) { return w.date === date ? Object.assign({}, w, { teeBlockId: tb.id }) : w; }) });
        }, { message: 'Tee sheet blocked for league night, ' + fmt.dateShort(date), undone: 'League night block removed. The tee times are open again' });
        drawSide(); drawNights();
      }
    });
  }

  /** FLIP re-render of a board: rows keep their place on screen, then glide to the new order. */
  function flipRender(host, html, animate) {
    const prev = {};
    if (animate) ui.$$('.lb-row', host).forEach(function (r) { prev[r.dataset.key] = { top: r.getBoundingClientRect().top, val: r.dataset.val }; });
    host.innerHTML = html;
    host.classList.toggle('lb-initial', !animate);
    if (!animate) return;
    ui.$$('.lb-row', host).forEach(function (r) {
      const old = prev[r.dataset.key]; if (!old) return;
      const dy = old.top - r.getBoundingClientRect().top;
      if (old.val !== r.dataset.val) { r.classList.add('lb-changed'); setTimeout(function () { r.classList.remove('lb-changed'); }, 1600); }
      if (Math.abs(dy) < 1) return;
      r.classList.add(dy > 0 ? 'lb-up' : 'lb-down');
      r.style.transition = 'none'; r.style.transform = 'translateY(' + dy + 'px)';
      r.getBoundingClientRect();
      requestAnimationFrame(function () {
        r.style.transition = 'transform 760ms var(--ease-out)'; r.style.transform = '';
        setTimeout(function () { r.style.transition = ''; r.classList.remove('lb-up', 'lb-down'); }, 820);
      });
    });
  }

  function memberSeasonModal(lg, memberId) {
    if (!lg) return;
    const sd = standings(lg); const row = sd.rows.find(function (r) { return r.memberId === memberId; });
    const stroke = lg.format === 'Stroke play';
    const body = '<div class="lg-card-sum"><div><span class="label-caps">Position</span><span class="serif">' + esc(row && row.rounds ? row.pos : '–') + '</span></div><div><span class="label-caps">Points</span><span class="serif">' + (row ? row.total : 0) + '</span></div><div><span class="label-caps">Rounds</span><span class="serif">' + (row ? row.rounds : 0) + '</span></div><div><span class="label-caps">' + (stroke ? 'Average net' : 'Average') + '</span><span class="serif">' + (row ? (stroke ? ptsFmt(row.avgNet, 1) : ptsFmt(row.avg, 1)) : '–') + '</span></div><div><span class="label-caps">Best night</span><span class="serif">' + (row ? ptsFmt(row.best) : '–') + '</span></div></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th class="num">Wk</th><th>Date</th><th class="ev-hide-sm">Nine</th><th class="num">Gross</th><th class="num">Net</th><th class="num">Points</th><th class="num">Place</th></tr></thead><tbody>' +
      (lg.weeks || []).filter(function (w) { return w.date <= today() || isPlayed(w); }).map(function (w) {
        const i = lg.weeks.indexOf(w); const rk = isPlayed(w) ? weekRank(w, lg).find(function (r) { return r.memberId === memberId; }) : null;
        const lead = '<td class="num">' + (i + 1) + '</td><td class="nowrap">' + esc(fmt.dateShort(w.date)) + '</td><td class="ev-hide-sm">' + esc(nineLabel(w.nine)) + '</td>';
        if (w.cancelled) return '<tr class="lg-row-off">' + lead + '<td colspan="4" class="muted">' + esc(w.note || 'Cancelled') + '</td></tr>';
        if (!isPlayed(w)) return '<tr class="lg-row-off">' + lead + '<td colspan="4" class="muted">Awaiting results</td></tr>';
        if (!rk) return '<tr class="lg-row-off">' + lead + '<td colspan="4" class="muted">' + ((w.absent || []).indexOf(memberId) >= 0 ? 'Absent' : 'Did not play') + '</td></tr>';
        return '<tr>' + lead + '<td class="num">' + rk.gross + '</td><td class="num">' + rk.net + '</td><td class="num"><b>' + rk.points + '</b></td><td class="num">' + (rk.tied ? 'T' : '') + rk.place + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    ui.modal({ title: memberName(memberId), eyebrow: lg.name + ' · season card', size: 'lg', body: body, actions: [{ label: 'Close', kind: 'primary' }] });
  }

  function openLeagueForm(lg, from) {
    const year = +today().slice(0, 4);
    const nextYear = from && leagueStatus(from) === 'complete' ? year + 1 : (from ? +from.season.start.slice(0, 4) + 1 : year);
    const x = lg || { name: from ? from.name : "Wednesday Members' League", night: from ? from.night : 'Wednesday', startTime: from ? from.startTime : '16:30', season: { start: nextYear + '-05-01', end: nextYear + '-09-30' }, format: from ? from.format : 'Stableford', holes: from ? from.holes : 9, allowance: from ? from.allowance : 95 };
    const hasResults = lg ? playedIdx(lg).length > 0 : false;
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'League name', name: 'name', value: x.name, required: true, span2: true, placeholder: "e.g. Wednesday Members' League" }) +
      ui.field({ label: 'League night', name: 'night', type: 'select', options: ui.options(WEEKDAYS.slice(1).concat(['Sunday']), x.night), hint: hasResults ? 'Nights with results must stay inside the new schedule' : '' }) +
      ui.field({ label: 'First tee', name: 'startTime', type: 'time', value: x.startTime, required: true }) +
      ui.field({ label: 'Season starts', name: 'start', type: 'date', value: x.season.start, required: true, hint: 'The Winnipeg season runs May to September' }) +
      ui.field({ label: 'Season ends', name: 'end', type: 'date', value: x.season.end, required: true }) +
      ui.field({ label: 'Format', name: 'format', type: 'select', options: ui.options(LEAGUE_FORMATS, x.format), hint: 'Stableford points by default' }) +
      ui.field({ label: 'Holes each night', name: 'holes', type: 'select', options: ui.options([{ value: '9', label: '9 holes, alternating front and back' }, { value: '18', label: '18 holes' }], String(x.holes)) }) +
      ui.field({ label: 'Handicap allowance', name: 'allowance', type: 'select', options: ui.options(ALLOWANCES.map(function (a) { return { value: String(a), label: a + '% of course handicap' }; }), String(x.allowance)) }) +
      (!lg && from ? '<label class="check span-2 ev-check"><input type="checkbox" name="carry" checked> Carry over the ' + (from.members || []).length + ' members from ' + esc(from.name + ' ' + from.season.start.slice(0, 4)) + '</label>' : '') +
      '</form>';
    const actions = [{ label: 'Cancel', kind: 'ghost' }];
    if (lg) actions.unshift({ label: 'Delete league', kind: 'danger', onClick: function () { deleteLeague(lg); } });
    actions.push({
      label: lg ? 'Save league' : 'Create league', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); clearErrs(form);
        if (!ui.validate(form)) return false;
        const d = ui.formData(form); let ok = true;
        d.name = String(d.name || '').trim();
        if (!d.name) { fieldErr(form, 'name', 'Enter a league name.'); ok = false; }
        else if (d.name.length > 80) { fieldErr(form, 'name', 'Keep the name under 80 characters.'); ok = false; }
        if (d.end <= d.start) { fieldErr(form, 'end', 'The season must end after it starts.'); ok = false; }
        else {
          const sm = +d.start.slice(5, 7), em = +d.end.slice(5, 7);
          if (d.start.slice(0, 4) !== d.end.slice(0, 4)) { fieldErr(form, 'end', 'Keep the season within one calendar year.'); ok = false; }
          else if (sm < 4 || em > 10) { fieldErr(form, sm < 4 ? 'start' : 'end', 'League nights must fall within the golf season (April to October).'); ok = false; }
        }
        if (d.startTime < '06:00' || d.startTime > '19:30') { fieldErr(form, 'startTime', 'Choose a first tee between 6:00 AM and 7:30 PM.'); ok = false; }
        if (!ok) return false;
        const dates = nightDates(d.night, d.start, d.end);
        if (!dates.length) { fieldErr(form, 'end', 'There are no ' + d.night.toLowerCase() + 's in these dates.'); return false; }
        const prior = lg ? (S.find('leagues', lg.id) || lg) : null;
        if (prior && playedIdx(prior).length && +d.holes !== +prior.holes) { fieldErr(form, 'holes', 'Holes each night cannot change once results are entered.'); return false; }
        const base = { name: d.name, night: d.night, startTime: d.startTime, season: { start: d.start, end: d.end }, format: d.format, holes: +d.holes, allowance: +d.allowance };
        const old = lg ? (S.find('leagues', lg.id) || lg) : null;
        const keep = {}; (old ? old.weeks : []).forEach(function (w) { keep[w.date] = w; });
        const lost = (old ? old.weeks : []).filter(function (w) { return (isPlayed(w) || w.cancelled) && dates.indexOf(w.date) < 0; });
        if (lost.length) { fieldErr(form, 'start', lost.length + (lost.length === 1 ? ' night' : ' nights') + ' with results (' + lost.slice(0, 3).map(function (w) { return fmt.dateShort(w.date); }).join(', ') + ') would fall outside the new schedule.'); return false; }
        const weeks = dates.map(function (dt, i) {
          const w = keep[dt] ? Object.assign({}, keep[dt]) : { date: dt, teeBlockId: null, cancelled: false, note: '', results: [], absent: [] };
          if (!isPlayed(w) && !w.cancelled) w.nine = nineFor(base.holes, i);
          if (!w.teeBlockId) { const b = leagueBlock(dt); if (b) w.teeBlockId = b.id; }
          return w;
        });
        const doc = Object.assign({}, base, { weeks: weeks });
        const rescore = old && (old.format !== base.format || +old.allowance !== base.allowance);
        if (rescore) doc.weeks = doc.weeks.map(function (w) { return isPlayed(w) ? rescoreWeek(doc, w) : w; });
        doc.status = leagueStatus(doc);
        if (old) undoRun(function () { S.update('leagues', old.id, doc); }, { message: 'League saved' + (rescore ? ', points recalculated' : ''), undone: 'League changes undone' + (rescore ? ', points as before' : '') });
        else {
          doc.members = from && d.carry ? (from.members || []).filter(function (id) { const m = Club.members.get(id); return m && m.status !== 'resigned' && canGolf(m); }) : [];
          const n = undoRun(function () { return S.insert('leagues', Object.assign(doc, { id: S.uid('lg') })); },
            { message: function (x) { return 'League created with ' + x.members.length + ' members'; }, after: function () { leagueId = from ? from.id : null; leagueUpto = null; rerender(); }, undone: 'League removed' });
          leagueId = n.id;
        }
        leagueUpto = null; Club.app.render();
      }
    });
    ui.modal({ title: lg ? 'Edit league' : (from ? 'New season' : 'Set up league'), eyebrow: "Members' league", size: 'lg', body: body, actions: actions });
  }

  async function deleteLeague(lg) {
    const n = playedIdx(lg).length;
    if (!(await ui.confirm({ title: 'Delete this league?', text: 'This permanently removes ' + lg.name + ' (' + lg.season.start.slice(0, 4) + ')' + (n ? ', its ' + n + ' nights of results' : '') + ' and the standings. Tee sheet blocks are kept.', confirmLabel: 'Delete league', danger: true }))) return;
    undoRun(function () { S.remove('leagues', lg.id); }, { message: 'League deleted', after: function () { leagueId = lg.id; leagueUpto = null; rerender(); }, undone: lg.name + ' restored with its results' });
    leagueId = null; leagueUpto = null; Club.app.render();
  }

  function openRoster(lg, done) {
    const golfers = S.all('members').filter(function (m) { return canGolf(m) && (m.status === 'active' || (lg.members || []).indexOf(m.id) >= 0); }).sort(function (a, b) { return a.lastName.localeCompare(b.lastName); });
    const sel = {}; (lg.members || []).forEach(function (id) { sel[id] = true; });
    const body = '<div class="lg-roster"><div class="lg-roster-bar"><input class="input lg-roster-q" type="search" placeholder="Search golfing members" aria-label="Search golfing members"><span class="label-caps lg-roster-n"></span></div>' +
      '<p class="person-sub lg-roster-note">Golfing categories only. Social members cannot join the league.</p>' +
      '<ul class="list lg-roster-list">' + golfers.map(function (m) {
        const t = Club.members.tier(m);
        return '<li data-name="' + esc((m.firstName + ' ' + m.lastName + ' ' + m.memberNo).toLowerCase()) + '"><label class="check lg-roster-item"><input type="checkbox" value="' + esc(m.id) + '"' + (sel[m.id] ? ' checked' : '') + '><span class="lg-roster-who"><span class="person-name">' + esc(m.lastName + ', ' + m.firstName) + '</span><span class="person-sub">' + esc((t ? t.name : 'Member') + ' · #' + m.memberNo + ' · Index ' + fmt.handicap(m.handicap) + (m.status !== 'active' ? ' · ' + m.status : '')) + '</span></span></label></li>';
      }).join('') + '</ul><p class="lg-roster-empty muted" hidden>No golfing members match that search.</p></div>';
    const md = ui.modal({
      title: 'League roster', eyebrow: lg.name, size: 'lg', body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save roster', kind: 'primary', icon: 'check', onClick: function (api) {
          const ids = ui.$$('.lg-roster-list input:checked', api.body).map(function (i) { return i.value; });
          const cur = S.find('leagues', lg.id); if (!cur) return;
          const removed = (cur.members || []).filter(function (id) { return ids.indexOf(id) < 0; });
          const withRes = removed.filter(function (id) { return cur.weeks.some(function (w) { return (w.results || []).some(function (r) { return r.memberId === id; }); }); });
          const save = function () {
            const keepOrder = (cur.members || []).filter(function (id) { return ids.indexOf(id) >= 0; }).concat(ids.filter(function (id) { return (cur.members || []).indexOf(id) < 0; }));
            const added = keepOrder.length - (cur.members || []).length + removed.length;
            undoRun(function () { S.update('leagues', cur.id, { members: keepOrder }); },
              { message: 'Roster saved: ' + keepOrder.length + ' members' + (added ? ', ' + added + ' added' : '') + (removed.length ? ', ' + removed.length + ' removed' : ''), undone: 'Roster changes undone' });
            api.close(); if (done) done();
          };
          if (!withRes.length) { save(); return false; }
          ui.confirm({ title: 'Remove members with results?', text: withRes.map(memberName).slice(0, 4).join(', ') + (withRes.length > 4 ? ' and ' + (withRes.length - 4) + ' more' : '') + (withRes.length === 1 ? ' has' : ' have') + ' league results. Their cards stay on record but they leave the standings.', confirmLabel: 'Remove from league', danger: true }).then(function (ok) { if (ok) save(); });
          return false;
        }
      }]
    });
    const count = function () { ui.$('.lg-roster-n', md.body).textContent = ui.$$('.lg-roster-list input:checked', md.body).length + ' selected'; };
    count();
    md.body.addEventListener('change', count);
    ui.$('.lg-roster-q', md.body).addEventListener('input', function (e) {
      const q = e.target.value.trim().toLowerCase(); let shown = 0;
      ui.$$('.lg-roster-list li', md.body).forEach(function (li) { const hit = !q || li.dataset.name.indexOf(q) >= 0; li.hidden = !hit; if (hit) shown++; });
      ui.$('.lg-roster-empty', md.body).hidden = shown > 0;
    });
  }

  function openResults(lg, i, done) {
    const w = lg.weeks[i]; if (!w) return;
    const stroke = lg.format === 'Stroke play';
    const hs = holeList(); const holes = nineHoles(w.nine, hs); const par = parTotal(holes);
    const minG = holes.length, maxG = holes.length * 10;
    const byId = {}; (w.results || []).forEach(function (r) { byId[r.memberId] = r; });
    const ids = (lg.members || []).concat((w.results || []).map(function (r) { return r.memberId; }).filter(function (id) { return (lg.members || []).indexOf(id) < 0; }))
      .sort(function (a, b) { return memberName(a).split(' ').pop().localeCompare(memberName(b).split(' ').pop()); });
    const b = weekBlock(w);
    const body = '<form class="lg-res" novalidate>' +
      '<div class="lg-res-top"><dl class="kv"><dt>Night</dt><dd>' + esc(fmt.dateLong(w.date)) + '</dd><dt>Course</dt><dd>' + esc(nineLabel(w.nine) + ', par ' + par + ' · ' + COURSE.teeLabel) + '</dd><dt>Scoring</dt><dd>' + esc(lg.format + ' · ' + lg.allowance + '% allowance') + '</dd><dt>Tee sheet</dt><dd>' + (b ? '<a href="#/teesheet/' + esc(w.date) + '">' + esc(b.reason || 'League block') + ', from ' + esc(fmt.time(b.start)) + '</a>' : '<span class="muted">No league block</span>') + '</dd></dl>' +
      '<label class="check lg-rain"><input type="checkbox" name="cancelled"' + (w.cancelled ? ' checked' : '') + '> Night cancelled (weather or course closed)</label></div>' +
      '<div class="lg-res-err" role="alert" hidden></div>' +
      (ids.length ? '<div class="table-wrap lg-res-wrap"><table class="table lg-res-table"><thead><tr><th>Member</th><th class="num ev-hide-sm">Strokes</th><th class="c">Gross</th><th class="c">Absent</th><th class="num">' + (stroke ? 'Net' : 'Points') + '</th></tr></thead><tbody>' +
        ids.map(function (id) {
          const r = byId[id]; const abs = (w.absent || []).indexOf(id) >= 0;
          const m = Club.members.get(id); const idx = r ? r.handicap : (m && m.handicap != null ? m.handicap : 18);
          const pre = leagueScore(lg, w.nine, id, 0, idx);
          return '<tr data-m="' + esc(id) + '" data-idx="' + idx + '"' + (abs ? ' class="lg-abs"' : '') + '><td><span class="person-name">' + esc(memberName(id)) + '</span><span class="person-sub">Index ' + esc(fmt.handicap(idx)) + '</span></td>' +
            '<td class="num ev-hide-sm">' + pre.strokes + '</td>' +
            '<td class="c"><input class="input lg-gross" type="number" inputmode="numeric" min="' + minG + '" max="' + maxG + '" step="1" value="' + (r ? r.gross : '') + '"' + (abs ? ' disabled' : '') + ' aria-label="' + esc(memberName(id) + ' gross score') + '"></td>' +
            '<td class="c"><input type="checkbox" class="lg-absent"' + (abs ? ' checked' : '') + ' aria-label="' + esc(memberName(id) + ' absent') + '"></td>' +
            '<td class="num lg-calc">–</td></tr>';
        }).join('') + '</tbody></table></div>' : ui.empty({ icon: 'members', title: 'The roster is empty', text: 'Add members to the league before entering results.' })) +
      '</form>';
    const md = ui.modal({
      title: 'Week ' + (i + 1) + ' results', eyebrow: lg.name, size: 'xl', body: body,
      actions: [{ label: 'Mark the rest absent', kind: 'ghost', onClick: function (api) { ui.$$('tbody tr', api.body).forEach(function (tr) { const g = ui.$('.lg-gross', tr); if (g && !g.value.trim()) { ui.$('.lg-absent', tr).checked = true; } }); sync(); return false; } },
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save results', kind: 'primary', icon: 'check', onClick: function (api) {
            const err = ui.$('.lg-res-err', api.body); err.hidden = true;
            ui.$$('.lg-gross', api.body).forEach(function (g) { g.classList.remove('invalid'); });
            const fresh = S.find('leagues', lg.id); if (!fresh || !fresh.weeks[i]) { ui.toast('This league no longer exists', 'bad'); return; }
            const fw = fresh.weeks[i];
            if (ui.$('[name=cancelled]', api.body).checked) {
              const had = isPlayed(fw);
              undoRun(function () { S.update('leagues', fresh.id, { weeks: fresh.weeks.map(function (x, k) { return k === i ? Object.assign({}, x, { cancelled: true, note: 'Rained out', results: [], absent: [] }) : x; }) }); },
                { message: 'Week ' + (i + 1) + ' marked cancelled' + (had ? ', results cleared' : ''), undone: 'Week ' + (i + 1) + ' is back as it was' + (had ? ' with its results' : '') });
              if (done) done(); return;
            }
            const res = [], absent = [], bad = [], blank = [];
            ui.$$('tbody tr', api.body).forEach(function (tr) {
              const id = tr.dataset.m; const g = ui.$('.lg-gross', tr);
              if (ui.$('.lg-absent', tr).checked) { absent.push(id); return; }
              const raw = g.value.trim();
              if (raw === '') { blank.push(g); return; }
              const v = Number(raw);
              if (!Number.isInteger(v) || v < minG || v > maxG) { bad.push(g); return; }
              const x = leagueScore(fresh, fw.nine, id, v, +tr.dataset.idx); delete x.par; res.push(x);
            });
            const fail = function (msg, els) { els.forEach(function (g) { g.classList.add('invalid'); }); err.innerHTML = Club.icon('alert') + '<span>' + esc(msg) + '</span>'; err.hidden = false; if (els[0]) els[0].focus(); return false; };
            if (bad.length) return fail('Gross scores for ' + holes.length + ' holes must be whole numbers from ' + minG + ' to ' + maxG + '. Check ' + bad.length + (bad.length === 1 ? ' entry.' : ' entries.'), bad);
            if (blank.length) return fail(blank.length + (blank.length === 1 ? ' member has' : ' members have') + ' no score. Enter a gross score or mark them absent.', blank);
            if (!res.length) return fail('Enter at least one score, or mark the night cancelled.', []);
            awardPoints(fresh, res);
            const blk = leagueBlock(fw.date);
            const hadRes = isPlayed(fw) || fw.cancelled;
            undoRun(function () { S.update('leagues', fresh.id, { weeks: fresh.weeks.map(function (x, k) { return k === i ? Object.assign({}, x, { cancelled: false, note: '', results: res, absent: absent, teeBlockId: x.teeBlockId || (blk ? blk.id : null), enteredAt: today() }) : x; }) }); },
              { message: 'Week ' + (i + 1) + ' results saved: ' + res.length + ' cards, ' + absent.length + ' absent', after: function () { leagueUpto = null; rerender(); }, undone: hadRes ? 'Week ' + (i + 1) + ' results are back as they were' : 'Week ' + (i + 1) + ' results removed' });
            if (done) done();
          }
        }]
    });
    function sync() {
      const cancelled = ui.$('[name=cancelled]', md.body).checked;
      ui.$$('.lg-res-wrap', md.body).forEach(function (x) { x.classList.toggle('lg-off', cancelled); });
      const rows = ui.$$('tbody tr', md.body).map(function (tr) {
        const g = ui.$('.lg-gross', tr); const abs = ui.$('.lg-absent', tr).checked;
        g.disabled = abs || cancelled; tr.classList.toggle('lg-abs', abs);
        const v = Number(g.value); const okV = g.value.trim() !== '' && Number.isInteger(v) && v >= minG && v <= maxG;
        return { tr: tr, abs: abs, r: okV && !abs ? leagueScore(lg, w.nine, tr.dataset.m, v, +tr.dataset.idx) : null };
      });
      if (stroke) awardPoints(lg, rows.filter(function (x) { return x.r; }).map(function (x) { return x.r; }));
      rows.forEach(function (x) { ui.$('.lg-calc', x.tr).innerHTML = x.abs ? '<span class="muted">Absent</span>' : x.r ? (stroke ? x.r.net + ' <span class="muted">· ' + x.r.points + ' pts</span>' : '<b>' + x.r.points + '</b>') : '–'; });
    }
    md.body.addEventListener('input', sync); md.body.addEventListener('change', sync);
    md.body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('lg-gross')) { e.preventDefault(); const all = ui.$$('.lg-gross:not([disabled])', md.body); const nx = all[all.indexOf(e.target) + 1]; if (nx) { nx.focus(); nx.select(); } }
    });
    sync();
  }

  function exportLeagueCsv(lg, upto) {
    const sd = standings(lg, upto); const stroke = lg.format === 'Stroke play';
    const weeks = (lg.weeks || []).filter(function (w, i) { return isPlayed(w) && (sd.upto == null || i <= sd.upto); });
    const rows = [['Position', 'Member', 'Member no', 'Rounds', 'Points', stroke ? 'Average net' : 'Average points', 'Best week', 'Movement'].concat(weeks.map(function (w) { return w.date; }))];
    sd.rows.forEach(function (r) {
      const m = Club.members.get(r.memberId);
      rows.push([r.rounds ? r.pos : '', r.name, m ? m.memberNo : '', r.rounds, r.total, stroke ? ptsFmt(r.avgNet, 1) : ptsFmt(r.avg, 1), r.best == null ? '' : r.best, r.move == null ? '' : r.move === 'new' ? 'new' : (r.move > 0 ? '+' + r.move : String(r.move))]
        .concat(weeks.map(function (w) { const x = r.weeks[w.date]; return x ? x.points : ((w.absent || []).indexOf(r.memberId) >= 0 ? 'absent' : ''); })));
    });
    const csv = rows.map(function (row) { return row.map(function (c) { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })   /* BOM: Excel reads it as UTF-8 */);
      const a = document.createElement('a'); a.href = url; a.download = typeKey(lg.name) + '-' + (lg.season ? lg.season.start.slice(0, 4) : '') + '-standings.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
      ui.toast('Standings exported: ' + sd.rows.length + ' members');
    } catch (e) { ui.toast('Could not create the CSV file', 'bad'); }
  }

  /* ---------------- Friends leagues (read-only: members run them from the portal, js/core/friendleagues.js) ---------------- */
  const FL_ORDER = { active: 0, waiting: 1, forming: 2, complete: 3, cancelled: 4 };
  const FL_BADGE = { active: 'good', waiting: 'warn', forming: 'info', complete: 'dark', cancelled: 'bad' };
  function flBadge(lg) { return ui.badge(Club.friendLeagues.statusLabel(lg), FL_BADGE[Club.friendLeagues.status(lg)] || 'plain'); }
  function flPlay(lg) { return lg.mode === 'teams' ? 'Teams of ' + lg.teamSize : 'Individual'; }
  function flDates(lg) { return fmt.dateShort(lg.start) + ' – ' + fmt.dateShort(Club.friendLeagues.endDate(lg)); }
  function flLink(id) { return Club.store.find('members', id) ? '<a href="#/members/' + esc(id) + '" class="fl-member">' + esc(Club.members.name(id)) + '</a>' : '<span class="muted">Former member</span>'; }
  function flSorted() {
    const FLx = Club.friendLeagues;
    return S.all('friendLeagues').slice().sort(function (a, b) {
      const sa = FL_ORDER[FLx.status(a)], sb = FL_ORDER[FLx.status(b)];
      return (sa - sb) || (sa >= 3 ? String(b.start).localeCompare(String(a.start)) : String(a.start).localeCompare(String(b.start)));
    });
  }
  /** Leader line for a card: the top team (team leagues) or player, once anyone has a score. */
  function flLeader(lg) {
    const sd = Club.friendLeagues.standings(lg);
    if (lg.mode === 'teams') { const t = sd.teams[0]; return t && t.played ? { name: t.name, value: t.members.map(function (m) { return Club.members.name(m); }).join(', ') } : null; }
    const r = sd.rows[0]; if (!r || !r.played) return null;
    return { name: Club.members.name(r.memberId), value: lg.format === 'weekly' ? Club.friendLeagues.valueText(lg, r.total) : Club.friendLeagues.valueText(lg, r.avg) + ' a game' };
  }

  function renderFriendLeagues(panel) {
    const FLx = Club.friendLeagues;
    const list = FLx ? flSorted() : [];
    if (!list.length) {
      panel.innerHTML = '<div class="panel">' + ui.empty({ icon: 'members', title: 'No friends leagues yet', text: "Members can start a league with their friends from the members' portal. Their leagues will be listed here." }) + '</div>';
      return;
    }
    panel.innerHTML = '<p class="fl-intro">Leagues members run with their friends from the members\' portal. Staff can view them here but not change them.</p>' +
      '<div class="ev-trn-grid fl-grid">' + list.map(function (lg) {
        const st = FLx.status(lg), acc = FLx.accepted(lg).length, inv = (lg.members || []).filter(function (x) { return x.status === 'invited'; }).length;
        const lead = st === 'active' || st === 'complete' ? flLeader(lg) : null, probs = st === 'forming' || st === 'waiting' ? FLx.problems(lg) : [];
        let foot;
        if (lead) foot = '<span class="label-caps">' + (st === 'complete' ? 'Winner' : 'Leading') + '</span><span class="ev-trn-leader">' + esc(lead.name) + '</span><span class="fl-sub fl-ell">' + esc(lead.value) + '</span>';
        else if (probs.length) foot = '<span class="label-caps">Before it starts</span><span class="ev-trn-leader fl-wait">' + esc(probs[0]) + '</span>';
        else if (st === 'forming') foot = '<span class="label-caps">Ready</span><span class="ev-trn-leader">Starts ' + esc(fmt.dateShort(lg.start)) + '</span>';
        else foot = '<span class="label-caps">' + (st === 'cancelled' ? 'Cancelled' : 'Scores') + '</span><span class="ev-trn-leader"><span class="muted">' + (st === 'cancelled' ? 'No longer running' : 'No scores yet') + '</span></span>';
        return '<div class="panel ev-trn-card fl-card s-' + st + '" role="button" tabindex="0" data-fl="' + esc(lg.id) + '" aria-haspopup="dialog" data-reveal>' +
          '<div class="row between"><span class="eyebrow">' + esc(FLx.formatOf(lg).label) + '</span>' + flBadge(lg) + '</div>' +
          '<h3>' + esc(lg.name) + '</h3>' +
          '<div class="person-sub">' + esc(flPlay(lg) + ' · ' + flDates(lg)) + '</div>' +
          '<div class="person-sub">Started by ' + esc(Club.members.name(lg.createdBy)) + '</div>' +
          '<div class="ev-trn-card-foot"><div><span class="label-caps">Players</span><span class="serif ev-trn-n">' + acc + '</span>' + (inv ? '<span class="fl-inv">+' + inv + ' invited</span>' : '') + '</div>' +
          '<div style="min-width:0">' + foot + '</div></div></div>';
      }).join('') + '</div>';
    ui.on(panel, 'click', '[data-fl]', function (e, card) { openFriendLeague(card.dataset.fl); });
    ui.on(panel, 'keydown', '[data-fl]', function (e, card) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); openFriendLeague(card.dataset.fl); } });
  }

  function openFriendLeague(id) {
    const FLx = Club.friendLeagues, DR = Club.drill, lg = FLx && FLx.get(id);
    if (!lg) { ui.toast('This league could not be found', 'bad'); return; }
    const st = FLx.status(lg), f = FLx.formatOf(lg), sd = FLx.standings(lg), teams = lg.mode === 'teams';
    const teamName = function (tid) { const t = (lg.teams || []).find(function (x) { return x.id === tid; }); return t ? t.name : ''; };
    const played = sd.rows.some(function (r) { return r.played; });
    const weekly = lg.format === 'weekly';
    let html = '<div class="fl-head" data-reveal>' + flBadge(lg) + '<span>' + esc(f.label + ' · ' + flPlay(lg)) + '</span></div>' + DR.kpis([
      { label: 'Weeks', value: String(lg.weeks), sub: st === 'active' ? 'Now in week ' + sd.weekNow : st === 'complete' ? 'Finished' : st === 'cancelled' ? 'Cancelled' : 'Not started' },
      { label: 'Players', value: String(sd.rows.length), sub: teams ? (lg.teams || []).length + ' teams' : 'Individual' },
      { label: 'Games each', value: String(lg.weeks * lg.perWeek), sub: lg.perWeek + ' a week' },
      { label: 'Ends', value: fmt.dateShort(FLx.endDate(lg)), sub: (today() < lg.start ? 'Starts ' : 'Started ') + fmt.dateShort(lg.start) }
    ]);
    html += DR.sec('Setup', '', '<dl class="kv fl-kv">' +
      '<dt>Format</dt><dd>' + esc(f.label) + '<span class="fl-sub">' + esc(f.text) + '</span></dd>' +
      '<dt>Play</dt><dd>' + esc(flPlay(lg)) + (teams ? ' · ' + esc((lg.teams || []).map(function (t) { return t.name; }).join(', ')) : '') + '</dd>' +
      '<dt>Weeks</dt><dd>' + lg.weeks + ' weeks, ' + esc(flDates(lg)) + '</dd>' +
      '<dt>Games per week</dt><dd>' + lg.perWeek + '</dd>' +
      '<dt>Holes</dt><dd>' + lg.holes + '-hole rounds only</dd>' +
      '<dt>Started by</dt><dd>' + flLink(lg.createdBy) + (lg.createdAt ? ' <span class="muted">on ' + esc(fmt.dateShort(String(lg.createdAt).slice(0, 10))) + '</span>' : '') + '</dd>' +
      (lg.cancelled && lg.cancelledAt ? '<dt>Cancelled</dt><dd>' + esc(fmt.dateShort(String(lg.cancelledAt).slice(0, 10))) + '</dd>' : '') +
      '</dl>');
    const probs = st === 'forming' || st === 'waiting' ? FLx.problems(lg) : [];
    if (st === 'forming' || st === 'waiting') {
      html += DR.sec(st === 'waiting' ? 'Why it has not started' : 'Before it starts', '', probs.length
        ? '<ul class="fl-probs">' + probs.map(function (p) { return '<li>' + Club.icon('alert') + '<span>' + esc(p) + '</span></li>'; }).join('') + '</ul>'
        : DR.note('Everyone is in. The league starts ' + fmt.dateLong(lg.start) + '.'));
    }
    if (st === 'active' || st === 'complete' || played) {
      const valCol = weekly ? 'Points' : (lg.format === 'stableford' ? 'Avg points' : 'Avg score');
      if (teams) {
        html += DR.sec('Team standings', sd.teams.length + ' teams', DR.table([{ label: 'Pos' }, { label: 'Team' }, { label: 'Games', num: true }, { label: 'Total', num: true }],
          sd.teams.map(function (t) {
            return [esc(t.pos), '<span class="primary-cell">' + esc(t.name) + '</span><span class="fl-sub">' + esc(t.members.map(function (m) { return Club.members.name(m); }).join(', ')) + '</span>', t.played + ' of ' + t.of, '<strong>' + esc(FLx.valueText(lg, t.total)) + '</strong>'];
          })));
      }
      html += DR.sec(teams ? 'Players' : 'Standings', sd.rows.length + ' players', DR.table(
        [{ label: 'Pos' }, { label: 'Member' }, { label: 'Games', num: true }, { label: valCol, num: true }].concat(weekly ? [] : [{ label: 'Total', num: true }]),
        sd.rows.map(function (r) {
          const cells = [esc(r.pos), flLink(r.memberId) + (teams ? '<span class="fl-sub">' + esc(teamName(r.teamId)) + '</span>' : ''), r.played + ' of ' + r.of + (r.missed ? '<span class="fl-sub">' + r.missed + ' missed</span>' : ''),
            '<strong>' + esc(FLx.valueText(lg, weekly ? r.total : r.avg)) + '</strong>'];
          if (!weekly) cells.push(esc(FLx.valueText(lg, r.total)));
          return cells;
        })) + DR.note(sd.done ? 'Final standings. Missed games took the worst score of that week.' : (weekly ? 'Points by weekly finish, added up for weeks everyone has played.' : 'Ranked on the average per game, so catching up on missed weeks never hurts.')));
    } else {
      html += DR.sec('Players', sd.rows.length + ' in', (lg.members || []).filter(function (x) { return x.status === 'accepted'; }).length
        ? DR.table([{ label: 'Member' }].concat(teams ? [{ label: 'Team' }] : []),
          FLx.accepted(lg).map(function (x) { return [flLink(x.memberId)].concat(teams ? [esc(teamName(x.teamId) || 'No team')] : []); }))
        : DR.note('No one has joined yet.'));
    }
    const others = (lg.members || []).filter(function (x) { return x.status === 'invited' || x.status === 'declined'; });
    if (others.length) {
      html += DR.sec('Invites', others.filter(function (x) { return x.status === 'invited'; }).length + ' waiting', DR.table([{ label: 'Member' }].concat(teams ? [{ label: 'Team' }] : []).concat([{ label: 'Reply' }]),
        others.map(function (x) {
          return [flLink(x.memberId) + (x.invitedAt ? '<span class="fl-sub">Invited ' + esc(fmt.dateShort(String(x.invitedAt).slice(0, 10))) + '</span>' : '')].concat(teams ? [esc(teamName(x.teamId) || 'No team')] : [])
            .concat([x.status === 'invited' ? ui.badge('Not answered', 'warn') : ui.badge('Declined', 'plain')]);
        })));
    }
    html += '<p class="fl-readonly">' + Club.icon('info') + '<span>Members run these leagues from the members\' portal. Staff can view them but not change them.</span></p>';
    const api = DR.open({ title: lg.name, body: html }, 'Friends league');
    if (api && api.el) api.el.classList.add('fl-drawer');
  }

  /* ---------------- Register module ---------------- */
  Club.register({
    id: 'events', label: 'Events & Tournaments', icon: 'trophy', section: 'Golf', order: 30,
    badge: function () {
      const a = today(), b = Club.date.fromToday(7);
      const n = S.all('events').filter(function (e) { return e.status === 'published' && e.date >= a && e.date <= b; }).length;
      return n || null;
    },
    search: function (q) {
      const ev = S.all('events').filter(function (e) { return String(e.title).toLowerCase().indexOf(q) >= 0; }).sort(byDate)
        .map(function (e) { return { label: e.title, sub: e.type + ' · ' + fmt.date(e.date), href: 'events/' + e.id, icon: 'events' }; });
      const tr = S.all('tournaments').filter(function (t) { return String(t.name).toLowerCase().indexOf(q) >= 0; })
        .map(function (t) { return { label: t.name, sub: 'Tournament · ' + fmt.date(t.date), href: 'events/tournaments/' + t.id, icon: 'trophy' }; });
      const lg = S.all('leagues').filter(function (l) { return String(l.name).toLowerCase().indexOf(q) >= 0 || (q.length > 3 && 'league'.indexOf(q) === 0); })
        .map(function (l) { return { label: l.name, sub: "Members' league · " + (l.season ? l.season.start.slice(0, 4) : ''), href: 'events/league', icon: 'trophy' }; });
      const fl = S.all('friendLeagues').filter(function (l) { return String(l.name).toLowerCase().indexOf(q) >= 0; })
        .map(function (l) { return { label: l.name, sub: 'Friends league · ' + fmt.date(l.start), href: 'events/friends/' + l.id, icon: 'members' }; });
      return ev.concat(tr).concat(lg).concat(fl);
    },
    render: function (view, params) {
      view.classList.add('ev-view');
      if (params[0] === 'tournaments' && params[1]) renderTournament(view, params[1]);
      else if (params[0] === 'tournaments') renderIndex(view, 'tournaments');
      else if (params[0] === 'league') renderIndex(view, 'league');
      else if (params[0] === 'friends') { renderIndex(view, 'friends'); if (params[1]) openFriendLeague(params[1]); }
      else if (params[0]) renderEvent(view, params[0]);
      else renderIndex(view, 'calendar');
    }
  });
})();
