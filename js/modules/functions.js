/* Weddings & Events: the special events pipeline for the Banquet Hall, meeting room and the Gallery.
   Owns collections: functions, functionPackages. Coordinator: Carly Dalmyn (stf_1).
   Reads diningReservations (Banquet Hall) for the date availability check. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/functions-data.js */
  const { STAGES, FLOW, COORDINATOR, ROOM_RATE, today, addDays, daysBetween, round2, totals, paid, pkgOf, defaultLines, makeQuote } = Club.shared.functions;

  const OPEN = ['Enquiry', 'Tour booked', 'Proposal sent'];
  const BOOKED = ['Deposit paid', 'Confirmed', 'Completed'];
  const STAGE_KIND = { 'Enquiry': 'brass', 'Tour booked': 'info', 'Proposal sent': 'info', 'Deposit paid': 'warn', 'Confirmed': 'good', 'Completed': 'outline', 'Lost': 'bad' };
  const TYPES = ['Wedding', 'Social', 'Corporate', 'Celebration of life', 'Holiday party', 'Meeting'];
  const SPACES = [{ value: 'Banquet Hall', seats: 220 }, { value: 'Meeting room', seats: 30 }, { value: 'Gallery Taphouse & Grill', seats: null }];
  const MAX_GUESTS = 220;
  const LOST_REASONS = ['Chose another venue', 'Date not available', 'Over budget', 'Guest count changed', 'Event postponed or cancelled', 'No response after follow-up', 'Other'];
  const METHODS = ['Card', 'E-transfer', 'Cheque', 'Debit', 'Cash'];
  const SAMPLE_NOTE = 'Sample pricing for planning only. Confirm current packages and rates with the special events team before sending.';
  function money(v) { return fmt.money(v); }
  /** Local date and time, 'YYYY-MM-DDTHH:MM:SS' (toISOString is UTC, which made evening entries in Winnipeg read as tomorrow). */
  function localStamp() { const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return S.iso(d) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function taxLabel() { const r = Club.taxRate(); return Math.abs(r - 0.12) < 0.0001 ? 'GST 5% + PST 7%' : 'Taxes (' + (r * 100).toFixed(1).replace(/\.0$/, '') + '%)'; }
  function balance(f) { return f.quote ? round2(f.quote.total - paid(f)) : 0; }
  function stageSince(f) {
    const h = (f.history || []).filter(function (x) { return x.stage === f.stage; }).pop();
    return h ? String(h.at).slice(0, 10) : String(f.createdAt || today()).slice(0, 10);
  }
  function daysInStage(f) { return Math.max(0, daysBetween(stageSince(f), today())); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'there'; }
  function timeRange(f) { return f.start ? fmt.time(f.start) + (f.end ? ' to ' + fmt.time(f.end) : '') : 'Time to be confirmed'; }
  function stageBadge(s) { return ui.badge(s, STAGE_KIND[s] || 'plain'); }
  function all() { return S.all('functions'); }
  function validEmail(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Undo: every staff change runs through Club.accounting.undoRun (Club.undo; deposit receipts are reversed with a credit
     on the day they were taken). Nothing about it is stored. */
  function undoRun(fn, o) { if (Club.accounting && Club.accounting.undoRun) return Club.accounting.undoRun(fn, o); const r = fn(); const m = typeof o.message === 'function' ? o.message(r) : o.message; if (m) ui.toast(m); return r; }
  function rerenderAfterUndo() { if (/^#\/functions(\/|$)/.test(location.hash)) Club.app.render(); if (Club.app.refreshNav) Club.app.refreshNav(); }
  function undoOpts(message, undone, after) { return { message: message, undone: undone, after: function () { if (after) after(); else rerenderAfterUndo(); } }; }

  /* ---------------- Availability ---------------- */
  function conflicts(date, space, excludeId) {
    if (!date) return { functions: [], dining: [] };
    const fns = all().filter(function (f) { return f.id !== excludeId && f.date === date && f.stage !== 'Lost' && f.space === space; });
    const dining = space === 'Gallery Taphouse & Grill' ? [] : S.where('diningReservations', function (r) {
      if (r.date !== date || r.venue !== 'Banquet Hall' || r.status === 'cancelled' || r.status === 'no-show') return false;
      return space === 'Meeting room' ? r.table === 'Meeting room' : r.table !== 'Meeting room';
    });
    return { functions: fns, dining: dining };
  }
  function conflictHtml(c) {
    const items = c.functions.map(function (f) { return '<li><strong>' + esc(f.name) + '</strong>, ' + esc(f.stage.toLowerCase()) + ', ' + esc(timeRange(f)) + '</li>'; })
      .concat(c.dining.map(function (r) { return '<li><strong>' + esc(r.name || 'Banquet reservation') + '</strong>, dining reservation at ' + esc(fmt.time(r.time)) + ' for ' + (r.partySize || 0) + '</li>'; }));
    if (!items.length) return '';
    return '<div class="fn-warn" role="status">' + Club.icon('alert') + '<div><strong>This date is already in use.</strong> Check with the team before promising it.<ul>' + items.join('') + '</ul></div></div>';
  }

  /* ---------------- Stage changes ---------------- */
  function setStage(f, stage, note, extra) {
    const hist = (f.history || []).concat([{ at: localStamp(), stage: stage, note: note || '' }]);
    S.update('functions', f.id, Object.assign({ stage: stage, history: hist }, extra || {}));
  }
  /** Move to a new stage, collecting what that stage needs (tour, deposit, lost reason). Calls done() after saving. */
  function moveTo(f, stage, done) {
    if (stage === f.stage) return;
    if (stage === 'Completed' && f.date > today()) return ui.toast('This event has not happened yet. Mark it completed after ' + fmt.date(f.date), 'bad');
    if (stage === 'Lost') return markLost(f, done);
    if (stage === 'Tour booked' && FLOW.indexOf(f.stage) < 1) return bookTour(f, done);
    if (stage === 'Deposit paid' && !(f.deposits || []).length) return recordDeposit(f, done);
    const was = f.stage;
    undoRun(function () {
      if (stage === 'Proposal sent' && !f.quote) { S.update('functions', f.id, { quote: makeQuote(f, defaultLines(f)) }); f = S.find('functions', f.id); }
      const back = FLOW.indexOf(stage) < FLOW.indexOf(f.stage);
      const note = back ? 'Moved back from ' + f.stage.toLowerCase() : f.stage === 'Lost' ? 'Reopened' : { 'Proposal sent': 'Proposal sent to ' + f.contactName, 'Confirmed': 'Contract signed', 'Completed': 'Event completed', 'Tour booked': 'Tour booked', 'Enquiry': 'Back to enquiry', 'Deposit paid': 'Deposit on file' }[stage];
      setStage(f, stage, note, f.stage === 'Lost' ? { lostReason: null } : null);
    }, undoOpts(f.name + ' moved to ' + stage.toLowerCase(), f.name + ' is back in ' + was.toLowerCase()));
    if (done) done(f.id);
  }
  /** The stage an event steps back to: the one before it in the pipeline, or for a lost event the stage it was lost from. */
  function prevStage(f) {
    if (f.stage === 'Lost') { const h = (f.history || []).filter(function (x) { return x.stage !== 'Lost'; }).pop(); return h && FLOW.indexOf(h.stage) >= 0 ? h.stage : 'Enquiry'; }
    const i = FLOW.indexOf(f.stage); return i > 0 ? FLOW[i - 1] : null;
  }
  /** The step-back control's stage, or null (a lost enquiry is reopened with Reopen instead). */
  function backTo(f) { const p = prevStage(f); return f.stage === 'Lost' && p === 'Enquiry' ? null : p; }
  /** Move back one stage (always available on the card and the event page). Deposits, the quote and the tour stay on file. */
  function stepBack(f, done) {
    const to = prevStage(f); if (!to) return;
    const was = f.stage;
    undoRun(function () { setStage(f, to, 'Moved back from ' + was.toLowerCase(), was === 'Lost' ? { lostReason: null } : null); },
      undoOpts(f.name + ' moved back to ' + to.toLowerCase(), f.name + ' is back in ' + was.toLowerCase()));
    if (done) done(f.id);
  }
  function markLost(f, done) {
    const body = '<form novalidate><p class="ink-2">Close <strong>' + esc(f.name) + '</strong> and keep it on file. You can reopen it later.</p>' +
      ui.field({ label: 'Reason', name: 'reason', type: 'select', required: true, options: '<option value="">Choose a reason</option>' + ui.options(LOST_REASONS) }) +
      ui.field({ label: 'Note', name: 'note', type: 'textarea', placeholder: 'Anything worth remembering for next time' }) + '</form>';
    const m = ui.modal({ eyebrow: 'Weddings & Events', title: 'Mark as lost', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Mark lost', kind: 'danger', onClick: function () {
      const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      undoRun(function () { setStage(f, 'Lost', d.reason + (d.note ? '. ' + d.note : ''), { lostReason: d.reason }); }, undoOpts(f.name + ' marked as lost', f.name + ' is back in ' + f.stage.toLowerCase()));
      if (done) done(f.id);
    } }] });
  }
  function bookTour(f, done) {
    const tr = f.tour || {};
    const body = '<form novalidate><p class="ink-2">Show ' + esc(firstName(f.contactName)) + ' the ' + esc(f.space) + ' and talk through the day.</p><div class="form-grid">' +
      ui.field({ label: 'Tour date', name: 'date', type: 'date', value: tr.date || addDays(today(), 3), required: true }) +
      ui.field({ label: 'Time', name: 'time', type: 'time', value: tr.time || '17:00', required: true }) +
      ui.field({ label: 'Hosted by', name: 'host', type: 'select', options: Club.staff.options(f.coordinatorId || COORDINATOR), span2: true }) +
      ui.field({ label: 'Note', name: 'note', placeholder: 'e.g. Bringing parents, interested in the ceremony setup', span2: true, value: tr.note || '' }) + '</div></form>';
    const m = ui.modal({ eyebrow: f.name, title: 'Book a tour', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Book tour', kind: 'primary', icon: 'calendar', onClick: function () {
      const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (d.date < today()) { form.date.classList.add('invalid'); form.date.insertAdjacentHTML('afterend', '<span class="field-error">Choose today or a later date.</span>'); return false; }
      const tour = { date: d.date, time: d.time, hostId: d.host, note: d.note };
      const label = 'Tour on ' + fmt.dateShort(d.date) + ' at ' + fmt.time(d.time) + ' with ' + Club.staff.name(d.host);
      const moved = FLOW.indexOf(f.stage) < 1 || f.stage === 'Lost', was = f.stage;
      undoRun(function () {
        if (moved) setStage(f, 'Tour booked', label, { tour: tour, lostReason: null });
        else S.update('functions', f.id, { tour: tour, history: (f.history || []).concat([{ at: localStamp(), stage: f.stage, note: label }]) });
      }, undoOpts('Tour booked for ' + fmt.dateShort(d.date), moved ? 'Tour cancelled. ' + f.name + ' is back in ' + was.toLowerCase() : 'Tour put back as it was'));
      if (done) done(f.id);
    } }] });
  }

  /* ---------------- Deposits ---------------- */
  function recordDeposit(f, done) {
    /* Once a deposit is on a booked event, the next money in is a payment towards the balance. */
    const isPay = (f.deposits || []).length > 0 && FLOW.indexOf(f.stage) >= 3;
    const word = isPay ? 'payment' : 'deposit', Word = isPay ? 'Payment' : 'Deposit';
    const suggested = isPay && f.quote ? Math.max(0, balance(f)) : f.quote ? Math.min(Math.max(0, balance(f)), f.type === 'Wedding' ? 1500 : 500) : (f.type === 'Wedding' ? 1500 : 500);
    const body = '<form novalidate class="fn-dep-form"><div class="form-grid">' +
      ui.field({ label: 'Amount', name: 'amount', type: 'number', min: 1, step: 0.01, value: suggested || '', required: true }) +
      ui.field({ label: 'Date received', name: 'date', type: 'date', value: today(), required: true }) +
      '</div><div class="field"><label>Payment method</label>' + ui.segmented(METHODS.map(function (x) { return { value: x, label: x }; }), 'Card', 'method') + '</div>' +
      '<div class="fn-dep-card"></div><div class="fn-dep-ref" hidden>' + ui.field({ label: 'Reference', name: 'reference', placeholder: 'Cheque number or transfer reference' }) + '</div>' +
      '<p class="muted fn-note">Only the card brand and last four digits are kept on file.</p></form>';
    const m = ui.modal({ eyebrow: f.name, title: 'Record a ' + word, size: 'lg', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Record ' + word, kind: 'primary', icon: 'check', onClick: function () { return save(); } }] });
    const form = ui.$('form', m.body); let method = 'Card';
    const card = Club.cards.mount(ui.$('.fn-dep-card', form));
    ui.on(form, 'click', '.segmented button', function (e, b) {
      method = b.dataset.value; ui.$$('.segmented button', form).forEach(function (x) { x.classList.toggle('active', x === b); });
      ui.$('.fn-dep-card', form).hidden = method !== 'Card'; ui.$('.fn-dep-ref', form).hidden = method === 'Card';
    });
    function save() {
      if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (!(d.amount > 0)) { form.amount.classList.add('invalid'); form.amount.insertAdjacentHTML('afterend', '<span class="field-error">Enter an amount above zero.</span>'); return false; }
      /* More than the balance would leave the client in credit and hide it (the proposal would print a negative balance). */
      const owing = balance(S.find('functions', f.id) || f);
      if (f.quote && round2(d.amount) > owing + 0.004) { form.amount.classList.add('invalid'); form.amount.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(owing > 0 ? 'Only ' + money(owing) + ' is left to pay on this quote.' : 'Nothing is left to pay on this quote.') + '</span>'); return false; }
      const dep = { id: S.uid('dep'), date: d.date, amount: round2(d.amount), method: method, last4: '' };
      if (method === 'Card') {
        const r = card.validate(); if (!r.ok) return false;
        dep.brand = r.card.brand; dep.last4 = r.card.last4;   /* no saved cards: brand and last four only */
      } else if (d.reference) dep.reference = d.reference;
      const fresh = S.find('functions', f.id);
      const deps = (fresh.deposits || []).map(noCardDetails).concat([dep]);
      const note = money(dep.amount) + ' received by ' + (method === 'Card' ? brandName(dep.brand) + ' ending ' + dep.last4 : method.toLowerCase());
      const moved = FLOW.indexOf(fresh.stage) < 3 || fresh.stage === 'Lost', was = fresh.stage;
      undoRun(function () {
        if (moved) setStage(fresh, 'Deposit paid', note, { deposits: deps, lostReason: null });
        else S.update('functions', f.id, { deposits: deps, history: (fresh.history || []).concat([{ at: localStamp(), stage: fresh.stage, note: note }]) });
        depositReceipt(S.find('functions', f.id), dep);
      }, undoOpts(Word + ' of ' + money(dep.amount) + ' recorded' + (moved ? '. Moved to deposit paid' : ''), Word + ' taken off with a credit receipt' + (moved ? '. Back in ' + was.toLowerCase() : '')));
      if (done) done(f.id);
    }
  }
  /** A deposit without the cardholder name or expiry (older card deposits kept them); brand and last four stay. */
  function noCardDetails(d) {
    if (!d || (d.name === undefined && d.expMonth === undefined && d.expYear === undefined)) return d;
    const o = Object.assign({}, d); delete o.name; delete o.expMonth; delete o.expYear; return o;
  }
  function brandName(b) { const x = (Club.cards.brands || []).find(function (y) { return y.id === b; }); return x ? x.name : 'Card'; }
  /* Receipts for deposits (source 'functions', refId the function): made by Club.accounting (js/modules/accounting.js) so
     they count in that day's close; removing a payment record makes a credit receipt. */
  function depositReceipt(fn, dep) {
    if (!Club.accounting || !Club.accounting.depositReceipt) return null;
    try { return Club.accounting.depositReceipt('functions', fn, dep); } catch (e) { console.error('Deposit receipt failed for ' + (fn && fn.id), e); return null; }
  }
  function depositReceiptOf(fn, dep) { return Club.accounting && Club.accounting.depositReceiptFor ? Club.accounting.depositReceiptFor('functions', fn.id, dep.id) : null; }
  function depositLabel(d) {
    if (d.method === 'Card' && d.last4) return '<span class="fn-cardmark">' + Club.cards.mark(d.brand, 16) + '</span>' + esc(brandName(d.brand) + ' ending ' + d.last4);
    return esc(d.method + (d.reference ? ' · ' + d.reference : ''));
  }

  /* ---------------- Enquiry form ---------------- */
  /** focus: optional field name to put the cursor in (Update guests opens the form on the guest count). */
  function openForm(existing, preset, done, focus) {
    const f = existing || Object.assign({ type: 'Wedding', space: 'Banquet Hall', start: '17:00', end: '23:59', guests: '' }, preset || {});
    const pkgs = S.all('functionPackages');
    const pkgOpts = '<option value="">No package yet</option>' + pkgs.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === f.packageId ? ' selected' : '') + '>' + esc(p.name + ' · ' + money(p.perGuest) + ' per guest') + '</option>'; }).join('');
    const body = '<form novalidate class="fn-form"><div class="form-grid">' +
      ui.field({ label: 'Event type', name: 'type', type: 'select', options: ui.options(TYPES, f.type) }) +
      ui.field({ label: 'Space', name: 'space', type: 'select', options: ui.options(SPACES.map(function (s) { return { value: s.value, label: s.value + (s.seats ? ' · seats ' + s.seats : '') }; }), f.space) }) +
      ui.field({ label: 'Event name', name: 'name', value: f.name || '', required: true, span2: true, placeholder: 'e.g. Sofia Marchetti and Liam Ng, or Red River Engineering holiday party' }) +
      ui.field({ label: 'Couple or organizer', name: 'contactName', value: f.contactName || '', required: true }) +
      ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: f.phone || '', placeholder: '204-555-0123' }) +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: f.email || '', required: true, span2: true }) +
      ui.field({ label: 'Event date', name: 'date', type: 'date', value: f.date || '', required: true }) +
      ui.field({ label: 'Guests', name: 'guests', type: 'number', min: 1, max: MAX_GUESTS, value: f.guests, required: true, hint: 'Seating for up to 220' }) +
      ui.field({ label: 'Start', name: 'start', type: 'time', value: f.start || '' }) +
      ui.field({ label: 'End', name: 'end', type: 'time', value: f.end || '' }) +
      ui.field({ label: 'Package', name: 'packageId', type: 'select', options: pkgOpts, span2: true }) +
      ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: f.notes || '', span2: true, placeholder: 'Ceremony on site, dietary needs, how they heard about us' }) +
      '</div><div class="fn-avail" aria-live="polite"></div></form>';
    const m = ui.modal({ eyebrow: 'Weddings & Events', title: existing ? 'Edit details' : 'New enquiry', size: 'lg', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: existing ? 'Save details' : 'Save enquiry', kind: 'primary', icon: 'check', onClick: function () { return save(); } }] });
    const form = ui.$('form', m.body);
    function check() {
      const d = form.date.value, sp = form.space.value, g = +form.guests.value || 0;
      const seats = (SPACES.find(function (s) { return s.value === sp; }) || {}).seats;
      let html = conflictHtml(conflicts(d, sp, existing && existing.id));
      if (seats && g > seats) html += '<div class="fn-warn">' + Club.icon('alert') + '<div>The ' + esc(sp) + ' seats ' + seats + '. Consider the Banquet Hall for ' + g + ' guests.</div></div>';
      if (d && !html) html = '<div class="fn-ok">' + Club.icon('check') + '<div>' + esc(fmt.dateLong(d)) + ' is open in the ' + esc(sp) + '.</div></div>';
      ui.$('.fn-avail', form).innerHTML = html;
    }
    form.addEventListener('change', check); form.addEventListener('input', function (e) { if (e.target.name === 'guests') check(); });
    // Suggest a package from the event type.
    form.type.addEventListener('change', function () {
      if (form.packageId.value) return;
      const map = { 'Wedding': 'fpk_wedding', 'Social': 'fpk_celebration', 'Corporate': 'fpk_meeting', 'Celebration of life': 'fpk_reception', 'Holiday party': 'fpk_holiday', 'Meeting': 'fpk_meeting' };
      if (S.find('functionPackages', map[form.type.value])) form.packageId.value = map[form.type.value];
      if (['Corporate', 'Meeting'].indexOf(form.type.value) >= 0 && form.space.value === 'Banquet Hall' && !(+form.guests.value > 30)) form.space.value = 'Meeting room';
      check();
    });
    check();
    if (focus && form[focus] && !ui.touchUI()) setTimeout(function () { form[focus].focus(); if (form[focus].select) form[focus].select(); }, 120);
    function err(input, msg) { input.classList.add('invalid'); input.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
    function save() {
      if (!ui.validate(form)) return false;
      const d = ui.formData(form); let ok = true;
      if (!validEmail(d.email)) { err(form.email, 'Enter a valid email address.'); ok = false; }
      if (!(d.guests >= 1 && d.guests <= MAX_GUESTS)) { err(form.guests, 'Guests must be between 1 and 220.'); ok = false; }
      if (!existing && d.date < today()) { err(form.date, 'Choose today or a later date.'); ok = false; }
      if (d.start && d.end && d.end <= d.start) { err(form.end, 'The event must end after it starts.'); ok = false; }
      if (!ok) { const first = ui.$('.invalid', form); if (first) first.focus(); return false; }
      const doc = { type: d.type, name: d.name, contactName: d.contactName, email: d.email, phone: d.phone, date: d.date, start: d.start, end: d.end, guests: d.guests, space: d.space, packageId: d.packageId || null, notes: d.notes };
      let id;
      if (existing) { undoRun(function () { S.update('functions', existing.id, doc); }, undoOpts('Details saved', 'Details put back as they were')); id = existing.id; }
      else {
        const n = undoRun(function () {
          return S.insert('functions', Object.assign(doc, { stage: 'Enquiry', coordinatorId: COORDINATOR, menuNotes: '', quote: null, deposits: [], runSheet: [], tour: null, history: [{ at: localStamp(), stage: 'Enquiry', note: 'Enquiry taken by the front desk' }] }));
        }, undoOpts('Enquiry saved for ' + d.name, 'Enquiry removed', function () { if (location.hash.indexOf('#/functions/') === 0) Club.app.go('functions'); else rerenderAfterUndo(); }));
        id = n.id;
      }
      if (done) done(id);
    }
  }

  /* ---------------- FLIP: cards glide to their new column ---------------- */
  function flip(root, mutate, movedId) {
    const before = {};
    ui.$$('[data-flip]', root).forEach(function (n) { before[n.dataset.flip] = n.getBoundingClientRect(); });
    mutate();
    if (reduce) return;
    ui.$$('[data-flip]', root).forEach(function (n) {
      const a = before[n.dataset.flip]; const b = n.getBoundingClientRect();
      if (!a) { n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); return; }
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: n.dataset.flip === movedId ? 560 : 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    });
  }

  /* ---------------- What needs doing (derived only from fields the app already stores) ---------------- */
  const NEXT_VERB = { 'Enquiry': 'Book tour', 'Tour booked': 'Send proposal', 'Proposal sent': 'Record deposit', 'Deposit paid': 'Confirm booking', 'Confirmed': 'Mark completed' };
  const NEXT_KEY = { 'Enquiry': 'tour', 'Tour booked': 'proposal', 'Proposal sent': 'deposit', 'Deposit paid': 'confirm', 'Confirmed': 'complete' };
  function stageDate(f, s) { const h = (f.history || []).filter(function (x) { return x.stage === s; }).pop(); return h ? String(h.at).slice(0, 10) : null; }
  /** The stage the main button moves to, or null (a confirmed event completes only after its date). */
  function nextStage(f) {
    if (f.stage === 'Lost' || f.stage === 'Completed') return null;
    const n = FLOW[FLOW.indexOf(f.stage) + 1] || null;
    return n === 'Completed' && f.date > today() ? null : n;
  }
  function rel(iso) { const n = daysBetween(today(), iso); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago'; }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }
  function wdDate(iso) { return fmt.weekday(iso) + ' ' + fmt.dateShort(iso); }
  function bizDaysBefore(iso, n) { let d = iso; while (n > 0) { d = addDays(d, -1); const w = fmt.toDate(d).getDay(); if (w !== 0 && w !== 6) n--; } return d; }
  /* The final numbers deadline is read from the event's own menu notes ("Confirm final numbers 5 business days ahead");
     no other deadline is assumed. */
  function numbersDue(f) { const m = /final numbers (\d+) business days? ahead/i.exec(f.menuNotes || ''); return m ? { date: bizDaysBefore(f.date, +m[1]), n: +m[1] } : null; }
  function isBooked(f) { return BOOKED.indexOf(f.stage) >= 0; }

  /** The Next steps checklist on the event page. key: what its button does (see runStep). */
  function tasks(f) {
    const t = [], s = f.stage, i = FLOW.indexOf(s), p = paid(f), rs = f.runSheet || [];
    if (s === 'Lost' || s === 'Completed') return t;
    const enq = stageDate(f, 'Enquiry') || String(f.createdAt || today()).slice(0, 10);
    t.push({ done: true, text: 'Enquiry received', sub: fmt.date(enq) });
    if (s === 'Enquiry') t.push({ text: 'Reply and book a tour', sub: 'Enquiry came in ' + rel(enq) + (f.notes ? '. "' + f.notes + '"' : ''), act: 'Book tour', key: 'tour', warn: daysInStage(f) >= 2 });
    if (f.tour) t.push({ done: f.tour.date < today(), text: (f.tour.date < today() ? 'Tour held ' : 'Tour ') + wdDate(f.tour.date) + ' at ' + fmt.time(f.tour.time), sub: f.tour.note || '', act: f.tour.date >= today() ? 'Move tour' : null, key: 'tour' });
    else if (i >= 1) { const td = stageDate(f, 'Tour booked'); t.push({ done: true, text: 'Tour held', sub: td ? fmt.date(td) : '' }); }
    if (i <= 1) t.push({ text: f.quote ? 'Send the proposal' : 'Build the quote and send the proposal', sub: 'Package: ' + (pkgOf(f) ? pkgOf(f).name : 'not chosen yet'), act: s === 'Tour booked' ? 'Send proposal' : null, key: 'proposal' });
    else { const sd = stageDate(f, 'Proposal sent'); t.push({ done: true, text: 'Proposal sent', sub: [sd ? fmt.date(sd) : '', f.quote ? money(f.quote.total) : ''].filter(Boolean).join(', ') }); }
    const deps = (f.deposits || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (i <= 2) t.push({ text: s === 'Proposal sent' ? 'Follow up: no deposit yet' : 'Deposit to hold the date', sub: s === 'Proposal sent' ? 'Proposal out ' + days(daysInStage(f)) : '', act: s === 'Proposal sent' ? 'Record deposit' : null, key: 'deposit', warn: s === 'Proposal sent' && daysInStage(f) >= 5 });
    else if (deps.length) t.push({ done: true, text: 'Deposit received', sub: fmt.date(deps[0].date) + ', ' + money(deps[0].amount) });
    else t.push({ text: 'No deposit on file', sub: 'Record the deposit that holds the date', act: 'Record deposit', key: 'deposit', warn: true });
    if (i <= 3) t.push({ text: 'Get the contract signed', sub: s === 'Deposit paid' ? 'Deposit on file ' + days(daysInStage(f)) : '', act: s === 'Deposit paid' ? 'Confirm booking' : null, key: 'confirm', warn: s === 'Deposit paid' && daysInStage(f) > 14 });
    else { const cd = stageDate(f, 'Confirmed'); t.push({ done: true, text: 'Contract signed', sub: cd ? fmt.date(cd) : '' }); }
    if (i >= 3) {
      const nd = numbersDue(f), left = nd ? daysBetween(today(), nd.date) : null;
      t.push({ text: 'Final guest numbers', sub: nd ? 'Due ' + wdDate(nd.date) + ' (' + nd.n + ' business days ahead, from the notes). ' + f.guests + ' guests on file' : f.guests + ' guests on file. Confirm closer to the date', act: nd && left <= 7 ? 'Update guests' : null, key: 'guests', warn: nd && left <= 3 });
      t.push({ done: rs.length > 0, text: rs.length ? 'Run sheet ready' : 'Build the run sheet', sub: rs.length ? rs.length + (rs.length === 1 ? ' timing' : ' timings') + (rs[0].time ? ', ' + fmt.time(rs[0].time) + (rs.length > 1 && rs[rs.length - 1].time ? ' to ' + fmt.time(rs[rs.length - 1].time) : '') : '') : 'Timings for the kitchen and floor team', act: rs.length ? null : 'Add timings', key: 'runsheet' });
      t.push({ done: !!f.menuNotes, text: 'Menu and service notes', sub: f.menuNotes || 'Menu choices, dietary needs, bar service, vendors', act: f.menuNotes ? null : 'Add notes', key: 'menu' });
      if (f.quote) { const b = balance(f); t.push({ done: b <= 0, text: b > 0 ? 'Collect the balance, ' + money(b) : 'Paid in full', sub: money(p) + ' of ' + money(f.quote.total) + ' received. Event ' + rel(f.date), act: b > 0 ? 'Record payment' : null, key: 'deposit', warn: b > 0 && daysBetween(today(), f.date) <= 14 }); }
    }
    return t;
  }
  /** The one thing an open event needs next, for the To do list. grp: week | waiting | later. */
  function headline(f) {
    const s = f.stage, t = today();
    if (s === 'Enquiry') { const e = stageDate(f, 'Enquiry') || t; return { text: 'New enquiry, reply and book a tour', when: 'Came in ' + rel(e), act: 'Book tour', key: 'tour', grp: 'week', urgent: daysInStage(f) >= 2, sort: e }; }
    if (s === 'Tour booked') return f.tour && f.tour.date >= t
      ? { text: 'Tour ' + wdDate(f.tour.date) + ' at ' + fmt.time(f.tour.time), when: f.tour.note || '', act: 'Open event', key: 'open', grp: daysBetween(t, f.tour.date) <= 7 ? 'week' : 'later', sort: f.tour.date }
      : { text: 'Send the proposal after the tour', when: f.tour ? 'Toured ' + fmt.dateShort(f.tour.date) : '', act: 'Send proposal', key: 'proposal', grp: 'week', sort: t };
    if (s === 'Proposal sent') return { text: 'Follow up, proposal out ' + days(daysInStage(f)) + ' with no deposit', when: 'Sent ' + fmt.dateShort(stageSince(f)), act: 'Record deposit', key: 'deposit', grp: 'waiting', urgent: daysInStage(f) > 14, sort: stageSince(f) };
    if (s === 'Deposit paid') return { text: 'Get the contract signed', when: 'Deposit on file ' + days(daysInStage(f)), act: 'Confirm booking', key: 'confirm', grp: 'waiting', urgent: daysInStage(f) > 14, sort: stageSince(f) };
    if (s === 'Confirmed') {
      if (f.date < t) return { text: 'Event held ' + rel(f.date) + ', mark it completed', when: '', act: 'Mark completed', key: 'complete', grp: 'week', sort: f.date };
      const nd = numbersDue(f);
      if (nd && daysBetween(t, nd.date) <= 7) return { text: 'Final numbers due ' + rel(nd.date) + ', ' + wdDate(nd.date), when: f.guests + ' guests on file', act: 'Update guests', key: 'guests', grp: 'week', urgent: daysBetween(t, nd.date) <= 2, sort: nd.date };
      if (balance(f) > 0) return { text: 'Balance of ' + money(balance(f)) + ' to collect', when: 'Event ' + rel(f.date), act: 'Record payment', key: 'deposit', grp: daysBetween(t, f.date) <= 14 ? 'week' : 'later', sort: f.date };
    }
    return null;
  }
  function chipsHtml(f, h) {
    const c = [], ht = h ? h.text : '', t = today();
    if (f.quote) c.push('<span class="fw-mini">Quote ' + fmt.money0(f.quote.total) + (paid(f) ? ' · ' + fmt.money0(paid(f)) + ' paid' : ' · no deposit') + '</span>');
    if (isBooked(f) && f.stage !== 'Completed') {
      if (balance(f) > 0 && !/^Balance/.test(ht)) c.push('<span class="fw-mini' + (daysBetween(t, f.date) <= 14 ? ' warn' : '') + '">Balance ' + fmt.money0(balance(f)) + '</span>');
      c.push((f.runSheet || []).length ? '<span class="fw-mini ok">Run sheet ready</span>' : '<span class="fw-mini">No run sheet yet</span>');
    }
    const nd = numbersDue(f);
    if (nd && f.stage === 'Confirmed' && nd.date >= t && !/^Final numbers/.test(ht)) c.push('<span class="fw-mini' + (daysBetween(t, nd.date) <= 3 ? ' warn' : '') + '">Final numbers ' + esc(fmt.dateShort(nd.date)) + '</span>');
    if (OPEN.indexOf(f.stage) >= 0 || f.stage === 'Deposit paid') { const d = daysInStage(f); c.push('<span class="fw-mini' + (d > 14 ? ' bad' : '') + '">' + days(d) + ' in stage</span>'); }
    return c.join('');
  }
  /** Run one step for an event (To do buttons, pipeline cards, the checklist). done(id) after it is saved. */
  function runStep(f, key, done) {
    if (!f) return;
    if (key === 'open') return Club.app.go('functions/' + f.id);
    if (key === 'tour') return bookTour(f, done);
    if (key === 'proposal') return moveTo(f, 'Proposal sent', done);
    if (key === 'deposit') return recordDeposit(f, done);
    if (key === 'confirm') return moveTo(f, 'Confirmed', done);
    if (key === 'complete') return moveTo(f, 'Completed', done);
    if (key === 'guests') return openForm(f, null, done, 'guests');
  }

  /* ---------------- Small shared pieces ---------------- */
  function dateBlock(iso, soon) {
    const d = fmt.toDate(iso), other = d.getFullYear() !== fmt.toDate(today()).getFullYear();
    return '<div class="fw-dblock' + (soon ? ' soon' : '') + '"><small>' + esc(fmt.weekday(iso)) + '</small><b>' + d.getDate() + '</b><small>' + esc(d.toLocaleDateString('en-US', { month: 'short' }) + (other ? ' ' + String(d.getFullYear()).slice(2) : '')) + '</small></div>';
  }
  function dot(kind) { return '<i class="fw-dot-' + kind + '" aria-hidden="true"></i>'; }
  function dotFor(f) { return dot(isBooked(f) ? 'held' : 'tent'); }
  function banquetBookings(from, to) {
    return S.where('diningReservations', function (r) { return r.venue === 'Banquet Hall' && r.status !== 'cancelled' && r.status !== 'no-show' && r.date >= from && r.date <= to; });
  }
  function dayItems(iso) {
    return all().filter(function (f) { return f.date === iso && f.stage !== 'Lost'; }).map(function (f) { return { f: f }; })
      .concat(banquetBookings(iso, iso).sort(function (a, b) { return (a.time || '') < (b.time || '') ? -1 : 1; }).map(function (r) { return { r: r }; }));
  }
  function agendaItem(iso, x) {
    const d = fmt.toDate(iso), ad = '<div class="fw-ad">' + esc(fmt.weekday(iso)) + '<b>' + d.getDate() + '</b>' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</div>';
    if (x.f) return '<li data-ev="' + esc(x.f.id) + '">' + ad + '<div><a class="fw-an" href="#/functions/' + esc(x.f.id) + '">' + esc(x.f.name) + '</a><div class="fw-am">' + dotFor(x.f) + esc(x.f.stage + ' · ' + x.f.space + ' · ' + x.f.guests + ' guests') + '</div></div></li>';
    return '<li class="dining">' + ad + '<div><div class="fw-an">' + esc(x.r.name || 'Banquet reservation') + '</div><div class="fw-am">' + dot('din') + 'Dining booking · ' + esc((x.r.table || 'Banquet Hall') + ' · ' + fmt.time(x.r.time) + ' · ' + (x.r.partySize || 0)) + '</div></div></li>';
  }
  function stageBtn(f) { const k = NEXT_KEY[f.stage]; return k && nextStage(f) ? { key: k, label: NEXT_VERB[f.stage] } : null; }

  /* A small menu (the "..." buttons). Lives on the body so board columns and panels never clip it. */
  let menuEl = null, menuAnchor = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    if (menuAnchor) { menuAnchor.setAttribute('aria-expanded', 'false'); menuAnchor = null; }
    document.removeEventListener('mousedown', menuOutside, true); document.removeEventListener('touchstart', menuOutside, true);
    document.removeEventListener('keydown', menuKey); window.removeEventListener('resize', closeMenu); window.removeEventListener('hashchange', closeMenu); window.removeEventListener('scroll', menuScroll, true);
  }
  function menuOutside(e) { if (menuEl && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu(); }
  function menuKey(e) { if (e.key === 'Escape') { const a = menuAnchor; closeMenu(); if (a) a.focus(); } }
  function menuScroll(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  /** items: [{ k, label, icon, danger, attrs }] or '-' for a rule. onPick(k). A second press on the anchor closes it. */
  function openMenu(anchor, items, onPick) {
    if (menuAnchor === anchor) { closeMenu(); return; }
    closeMenu();
    const m = ui.el('<div class="fw-menu" role="menu">' + items.map(function (i) {
      return i === '-' ? '<hr>' : '<button type="button" role="menuitem" class="' + (i.danger ? 'danger ' : '') + (i.cls || '') + '" data-k="' + esc(i.k) + '"' + (i.attrs || '') + '>' + (i.icon ? Club.icon(i.icon) : '') + '<span>' + esc(i.label) + '</span></button>';
    }).join('') + '</div>');
    document.body.appendChild(m); menuEl = m; menuAnchor = anchor; anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let left = Math.min(r.right - w, window.innerWidth - w - 8); left = Math.max(8, left);
    let top = r.bottom + 6; if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    m.style.left = left + 'px'; m.style.top = top + 'px';
    m.addEventListener('click', function (e) { const b = e.target.closest('button'); if (!b) return; closeMenu(); onPick(b.dataset.k); });
    setTimeout(function () {
      document.addEventListener('mousedown', menuOutside, true); document.addEventListener('touchstart', menuOutside, true);
      document.addEventListener('keydown', menuKey); window.addEventListener('resize', closeMenu); window.addEventListener('hashchange', closeMenu); window.addEventListener('scroll', menuScroll, true);
    }, 0);
    if (!ui.touchUI()) { const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true }); }
  }

  /* ---------------- Main page ---------------- */
  let mainTab = 'todo', calMonth = null, calSel = null, showClosed = false, phoneStage = 'Enquiry';
  let headHost = null, tabsApi = null;

  function summaryHtml() {
    const t = today(), horizon = addDays(t, 365), fs = all();
    const open = fs.filter(function (f) { return OPEN.indexOf(f.stage) >= 0; });
    const nNew = fs.filter(function (f) { return f.stage === 'Enquiry'; }).length, nTour = fs.filter(function (f) { return f.stage === 'Tour booked'; }).length;
    const booked = fs.filter(function (f) { return (f.stage === 'Deposit paid' || f.stage === 'Confirmed') && f.date >= t && f.date <= horizon; });
    const nWed = booked.filter(function (f) { return f.type === 'Wedding'; }).length;
    const held = fs.filter(function (f) { return f.stage !== 'Lost' && f.stage !== 'Completed' && f.date >= t; }).reduce(function (s, f) { return s + paid(f); }, 0);
    const next = fs.filter(function (f) { return (f.stage === 'Deposit paid' || f.stage === 'Confirmed') && f.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    const parts = [
      '<span><b>' + open.length + '</b> open ' + (open.length === 1 ? 'enquiry' : 'enquiries') + ' (' + nNew + ' new, ' + nTour + ' touring)</span>',
      '<span><b>' + booked.length + '</b> booked in the next 12 months, ' + nWed + (nWed === 1 ? ' wedding' : ' weddings') + '</span>',
      '<span><b>' + fmt.money0(held) + '</b> deposits held</span>',
      next ? '<span>Next: <a href="#/functions/' + esc(next.id) + '">' + esc(wdDate(next.date) + ', ' + next.name) + '</a></span>' : '<span>Nothing booked yet</span>'
    ];
    /* The dot ends each part, so a wrapped line never starts with one. */
    return parts.map(function (x, i) { return i < parts.length - 1 ? x.replace(/<\/span>$/, '<span class="fw-sep" aria-hidden="true">·</span></span>') : x; }).join('');
  }
  function weekCount() { return all().filter(function (f) { const h = headline(f); return h && h.grp === 'week'; }).length; }
  /** After a change: the summary line and the To do count follow. */
  function refreshHead() {
    if (headHost && document.body.contains(headHost)) headHost.innerHTML = summaryHtml();
    const chip = document.querySelector('.fw-tabs .tab[data-tab=todo] .fw-tab-n');
    if (chip) { const n = weekCount(); chip.textContent = n + ' this week'; chip.hidden = !n; }
    if (Club.app.refreshNav) Club.app.refreshNav();
  }

  function renderMain(view) {
    view.innerHTML = '<header class="page-head fw-page-head"><div><div class="eyebrow">Hospitality · Special events</div><h1>Weddings &amp; Events</h1><p class="fw-sum"></p></div>' +
      '<div class="page-actions"><a class="btn" href="' + esc(Club.info.eventsWebsite) + '" target="_blank" rel="noopener">' + Club.icon('link') + '<span>Weddings site</span></a>' + ui.btn('New enquiry', { kind: 'primary', icon: 'plus', action: 'new' }) + '</div></header>' +
      '<div class="fw-tabs"></div>';
    headHost = ui.$('.fw-sum', view); headHost.innerHTML = summaryHtml();
    tabsApi = ui.tabs(ui.$('.fw-tabs', view), [
      { id: 'todo', label: 'To do', render: renderTodo },
      { id: 'pipeline', label: 'Pipeline', render: renderPipeline },
      { id: 'calendar', label: 'Calendar', render: renderCalendar },
      { id: 'packages', label: 'Packages', render: renderPackages }
    ], mainTab, function (id) { mainTab = id; closeMenu(); });
    const todoTab = ui.$('.fw-tabs .tab[data-tab=todo]', view), n = weekCount();
    if (todoTab) todoTab.insertAdjacentHTML('beforeend', '<span class="fw-tab-n"' + (n ? '' : ' hidden') + '>' + n + ' this week</span>');
    ui.on(view.firstElementChild, 'click', '[data-action=new]', function () { openForm(null, null, function (id) { Club.app.go('functions/' + id); }); });
  }

  /* ---------------- To do ---------------- */
  function todoHtml() {
    const t = today(), fs = all();
    const rows = fs.map(function (f) { return { f: f, h: headline(f) }; }).filter(function (x) { return x.h; });
    const groups = [['week', 'This week', 'Due in the next 7 days or waiting on us'], ['waiting', 'Waiting on the client', 'Chase these when they go quiet'], ['later', 'Coming up later', 'Balances and planning for booked events']];
    const left = groups.map(function (g) {
      const list = rows.filter(function (x) { return x.h.grp === g[0]; }).sort(function (a, b) { return a.h.sort < b.h.sort ? -1 : a.h.sort > b.h.sort ? 1 : 0; });
      if (!list.length) return '';
      return '<section class="fw-group"><div class="fw-sec-title"><h3>' + g[1] + '</h3><span>' + list.length + ' · ' + g[2] + '</span></div><ul class="fw-todo panel">' + list.map(function (x) {
        const f = x.f, h = x.h;
        return '<li data-ev="' + esc(f.id) + '">' + dateBlock(f.date, daysBetween(t, f.date) <= 14 && f.date >= t) +
          '<div class="fw-t-main"><div class="fw-t-act' + (h.urgent ? ' urgent' : '') + '">' + esc(h.text) + '</div>' +
          '<div class="fw-t-name"><a href="#/functions/' + esc(f.id) + '">' + esc(f.name) + '</a> · ' + esc(f.type) + ' · ' + f.guests + ' guests' + (h.when ? ' · ' + esc(h.when) : '') + '</div>' +
          '<div class="fw-chips">' + chipsHtml(f, h) + '</div></div>' +
          '<div class="fw-t-right">' + stageBadge(f.stage) + '<button type="button" class="btn btn-sm' + (g[0] === 'week' ? ' btn-primary' : '') + '" data-quick="' + esc(h.key) + '" data-id="' + esc(f.id) + '">' + esc(h.act) + '</button></div></li>';
      }).join('') + '</ul></section>';
    }).join('');
    const until = addDays(t, 60);
    const items = fs.filter(function (f) { return f.stage !== 'Lost' && f.date >= t && f.date <= until; }).map(function (f) { return { d: f.date, f: f }; })
      .concat(banquetBookings(t, until).map(function (r) { return { d: r.date, r: r, tm: r.time || '' }; }))
      .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.tm || '') < (b.tm || '') ? -1 : 1; });
    const agenda = '<section class="panel fw-agenda-panel"><div class="panel-head"><h3>Next 60 days</h3><span class="fw-faint">' + items.length + ' in the rooms</span></div>' +
      (items.length ? '<ul class="fw-agenda">' + items.map(function (x) { return agendaItem(x.d, x); }).join('') + '</ul>' : '<p class="fw-empty-line">Nothing booked in the Banquet Hall or meeting room for the next 60 days.</p>') + '</section>';
    const fun = ['Enquiry', 'Tour booked', 'Proposal sent', 'Deposit paid', 'Confirmed'].map(function (s) {
      const l = fs.filter(function (f) { return f.stage === s; });
      return { s: s, n: l.length, v: l.reduce(function (a, f) { return a + (f.quote ? f.quote.total : 0); }, 0) };
    });
    const maxN = Math.max(1, Math.max.apply(null, fun.map(function (x) { return x.n; })));
    const funnel = '<section class="panel"><div class="panel-head"><h3>Pipeline</h3><button type="button" class="s-link" data-go-tab="pipeline">Open board</button></div><div class="fw-funnel">' + fun.map(function (x) {
      return '<div class="fw-fr"><span>' + esc(x.s) + ' <b>' + x.n + '</b></span><span class="fw-fb"><span style="width:' + Math.round(x.n / maxN * 100) + '%"></span></span><span class="fw-fv">' + (x.v ? fmt.money0(x.v) : '') + '</span></div>';
    }).join('') + '</div></section>';
    return '<div class="fw-todo-grid"><div class="fw-todo-main">' + (left || ui.empty({ icon: 'check', title: 'Nothing to chase', text: 'Every open event is up to date. New enquiries show here first.' })) + '</div><aside class="fw-todo-side">' + agenda + funnel + '</aside></div>';
  }
  function renderTodo(panel) {
    function draw() { panel.innerHTML = todoHtml(); }
    function after() { draw(); ui.animateIn(panel); refreshHead(); }
    draw();
    ui.on(panel, 'click', '[data-quick]', function (e, b) { e.preventDefault(); runStep(S.find('functions', b.dataset.id), b.dataset.quick, after); });
    ui.on(panel, 'click', '[data-go-tab]', function (e, b) { if (tabsApi) tabsApi.activate(b.dataset.goTab); });
    ui.on(panel, 'click', 'li[data-ev]', function (e, li) { if (e.target.closest('a, button')) return; Club.app.go('functions/' + li.dataset.ev); });
  }

  /* ---------------- Pipeline ---------------- */
  function cardHtml(f, reveal) {
    const d = daysInStage(f), nb = stageBtn(f);
    const stale = d > 14 && (OPEN.indexOf(f.stage) >= 0 || f.stage === 'Deposit paid');
    let foot;
    if (f.stage === 'Lost') foot = '<button type="button" class="btn btn-sm fw-next fn-move-next" data-move="Enquiry" data-id="' + esc(f.id) + '">' + Club.icon('refresh') + '<span>Reopen</span></button>';
    else if (nb) foot = '<button type="button" class="btn btn-sm fw-next fn-move-next" data-move="' + esc(nextStage(f)) + '" data-id="' + esc(f.id) + '"><span>' + esc(nb.label) + '</span>' + Club.icon('chevronRight') + '</button>';
    else foot = '<span class="fw-card-note">' + (f.stage === 'Confirmed' ? 'Completes after the event' : f.stage === 'Completed' ? 'Event held ' + esc(fmt.dateShort(f.date)) : '') + '</span>';
    return '<article class="fw-card" data-flip="' + esc(f.id) + '"' + (reveal ? ' data-reveal' : '') + '>' +
      '<a class="fw-card-main" href="#/functions/' + esc(f.id) + '">' +
        '<div class="fw-c-top"><span>' + esc(f.type) + '</span><span class="' + (stale ? 'stale' : '') + '" title="Days in this stage">' + (d === 0 ? 'Today' : d + 'd') + '</span></div>' +
        '<h4 class="fw-c-name">' + esc(f.name) + '</h4><div class="fw-c-meta">' + esc(fmt.weekday(f.date) + ' ' + fmt.date(f.date)) + ' · ' + f.guests + ' guests</div>' +
        (f.stage === 'Lost' ? '<div class="fw-c-lost">' + esc(f.lostReason || 'Closed') + '</div>' : f.quote ? '<div class="fw-c-money"><b>' + fmt.money0(f.quote.total) + '</b><span>' + (paid(f) ? fmt.money0(paid(f)) + ' paid' : 'no deposit') + '</span></div>' : '') +
        (f.stage === 'Tour booked' && f.tour ? '<div class="fw-c-tour">Tour ' + esc(fmt.dateShort(f.tour.date) + ', ' + fmt.time(f.tour.time)) + '</div>' : '') +
      '</a><div class="fw-c-foot">' + foot +
      '<button type="button" class="btn btn-sm btn-ghost btn-icon fw-more" data-card-menu="' + esc(f.id) + '" aria-haspopup="menu" aria-expanded="false" title="More for ' + esc(f.name) + '" aria-label="More for ' + esc(f.name) + '">' + Club.icon('more') + '</button></div></article>';
  }
  function boardHtml(reveal) {
    const fs = all();
    const cols = STAGES.filter(function (s) { return showClosed || (s !== 'Completed' && s !== 'Lost'); });
    if (cols.indexOf(phoneStage) < 0) phoneStage = 'Enquiry';
    const chips = '<div class="fw-stagechips" role="tablist" aria-label="Stages">' + cols.map(function (s) {
      const n = fs.filter(function (f) { return f.stage === s; }).length;
      return '<button type="button" role="tab" aria-selected="' + (s === phoneStage) + '" data-stage="' + esc(s) + '" class="' + (s === phoneStage ? 'on' : '') + '">' + esc(s) + ' <b>' + n + '</b></button>';
    }).join('') + '</div>';
    return chips + '<div class="fw-board" style="--cols:' + cols.length + '">' + cols.map(function (st) {
      const list = fs.filter(function (f) { return f.stage === st; }).sort(function (a, b) { return st === 'Completed' || st === 'Lost' ? (a.date < b.date ? 1 : -1) : (a.date < b.date ? -1 : 1); });
      const value = list.reduce(function (s, f) { return s + (f.quote ? f.quote.total : 0); }, 0);
      return '<section class="fw-col' + (st === phoneStage ? ' on' : '') + '" aria-label="' + esc(st) + '"><header class="fw-col-head"><span><b>' + esc(st) + '</b><span class="n">' + list.length + '</span></span>' + (value ? '<span class="v">' + fmt.money0(value) + '</span>' : '') + '</header>' +
        (list.length ? list.map(function (f) { return cardHtml(f, reveal); }).join('') : '<p class="fw-col-empty">' + esc({ 'Enquiry': 'New enquiries land here.', 'Tour booked': 'No tours booked.', 'Proposal sent': 'No proposals out.', 'Deposit paid': 'No dates on hold.', 'Confirmed': 'Nothing confirmed yet.', 'Completed': 'No events completed yet.', 'Lost': 'Nothing lost so far.' }[st]) + '</p>') + '</section>';
    }).join('') + '</div>';
  }
  function renderPipeline(panel) {
    panel.innerHTML = '<div class="fw-pl-bar"><p class="fw-hint">The button on each card does the next step. Days show time in the current stage; red after 14.</p>' +
      '<label class="check"><input type="checkbox" class="fn-closed"' + (showClosed ? ' checked' : '') + '> Show completed and lost</label></div><div class="fn-board-host">' + boardHtml(true) + '</div>';
    const host = ui.$('.fn-board-host', panel);
    ui.$('.fn-closed', panel).addEventListener('change', function (e) { showClosed = e.target.checked; host.innerHTML = boardHtml(true); ui.animateIn(host); });
    function moved(id) {
      flip(host, function () { host.innerHTML = boardHtml(false); }, id);
      const card = ui.$('[data-flip="' + id + '"]', host);
      if (card) { card.classList.add('fw-moved'); if (card.offsetParent) card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
      refreshHead();
    }
    ui.on(panel, 'click', '[data-move]', function (e, b) { const f = S.find('functions', b.dataset.id); if (f) moveTo(f, b.dataset.move, moved); });
    ui.on(panel, 'click', '[data-stage]', function (e, b) { phoneStage = b.dataset.stage; host.innerHTML = boardHtml(false); });
    ui.on(panel, 'click', '[data-card-menu]', function (e, b) {
      const f = S.find('functions', b.dataset.cardMenu); if (!f) return;
      const back = backTo(f), items = [{ k: 'open', label: 'Open event', icon: 'events' }];
      if (back) items.push({ k: 'back', label: 'Move back to ' + back.toLowerCase(), icon: 'chevronLeft', attrs: ' data-back="' + esc(f.id) + '" aria-label="Move back to ' + esc(back.toLowerCase()) + '"' });
      if (f.stage !== 'Completed' && f.stage !== 'Lost') items.push('-', { k: 'lost', label: 'Mark lost', icon: 'close', danger: true, cls: 'fn-move-lost' });
      openMenu(b, items, function (k) {
        const cur = S.find('functions', f.id); if (!cur) return;
        if (k === 'open') Club.app.go('functions/' + cur.id);
        else if (k === 'back') stepBack(cur, moved);
        else if (k === 'lost') moveTo(cur, 'Lost', moved);
      });
    });
  }

  /* ---------------- Calendar ---------------- */
  /** Is the Banquet Hall free that day? Booked events and Banquet Hall dining bookings take it; enquiries do not hold it. */
  function hallNote(iso, items) {
    const c = conflicts(iso, 'Banquet Hall');
    const held = c.functions.filter(isBooked);
    if (held.length || c.dining.length) return '<div class="fw-box warn">' + Club.icon('alert') + '<span>The Banquet Hall is taken this day. The meeting room or the Gallery may still be free.</span></div>';
    if (c.functions.length) return '<div class="fw-box ok">' + Club.icon('check') + '<span>The Banquet Hall is free this day. ' + esc(c.functions.length === 1 ? c.functions[0].name + ' is in discussion for it.' : c.functions.length + ' enquiries are in discussion for it.') + '</span></div>';
    return '<div class="fw-box ok">' + Club.icon('check') + '<span>' + (items.length ? 'The Banquet Hall is free this day.' : 'Nothing booked. The Banquet Hall and meeting room are free.') + '</span></div>';
  }
  function calendarHtml() {
    const t = today();
    if (!calMonth) calMonth = t.slice(0, 7);
    const y = +calMonth.slice(0, 4), mo = +calMonth.slice(5, 7) - 1;
    const first = new Date(y, mo, 1, 12), startDow = (first.getDay() + 6) % 7, gridStart = addDays(S.iso(first), -startDow);
    if (!calSel || calSel.slice(0, 7) !== calMonth) calSel = t.slice(0, 7) === calMonth ? t : S.iso(first);
    let cells = '';
    const monthItems = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i), dt = fmt.toDate(d), inMonth = dt.getMonth() === mo, items = dayItems(d);
      if (inMonth) items.forEach(function (x) { monthItems.push({ d: d, x: x }); });
      /* A grid of weeks (role=row wrappers with display: contents): a gridcell may hold the booking links, a button may not */
      if (i % 7 === 0) cells += '<div class="fw-cal-row" role="row">';
      cells += '<div class="fw-cday' + (inMonth ? '' : ' out') + (d === t ? ' today' : '') + (d < t ? ' past' : '') + (d === calSel ? ' sel' : '') + '" data-date="' + d + '" tabindex="0" role="gridcell" aria-selected="' + (d === calSel) + '" aria-label="' + esc(fmt.dateLong(d) + (items.length ? ', ' + items.length + ' booked' : '')) + '">' +
        '<span class="fw-dn">' + dt.getDate() + '</span>' +
        items.slice(0, 3).map(function (x) { return x.f ? '<a class="fw-pill ' + (isBooked(x.f) ? 'held' : 'tent') + '" href="#/functions/' + esc(x.f.id) + '" title="' + esc(x.f.name + ' · ' + x.f.stage) + '"><span>' + esc(x.f.name) + '</span></a>' : '<span class="fw-pill din" title="Dining booking in the Banquet Hall"><span>' + esc(x.r.name || 'Banquet reservation') + '</span></span>'; }).join('') +
        (items.length > 3 ? '<span class="fw-pill-more">' + (items.length - 3) + ' more</span>' : '') + '</div>';
      if (i % 7 === 6) cells += '</div>';
    }
    const si = dayItems(calSel);
    const side = '<section class="panel fw-dayp"><div class="panel-head"><h3>' + esc(fmt.dateLong(calSel)) + '</h3></div><div class="panel-body">' +
      si.map(function (x) {
        return x.f ? '<div class="fw-di">' + dotFor(x.f) + '<div><a href="#/functions/' + esc(x.f.id) + '">' + esc(x.f.name) + '</a><div class="fw-faint">' + esc(x.f.stage + ' · ' + x.f.space + ' · ' + timeRange(x.f) + ' · ' + x.f.guests + ' guests') + '</div></div></div>'
          : '<div class="fw-di">' + dot('din') + '<div><div class="fw-di-name">' + esc(x.r.name || 'Banquet reservation') + '</div><div class="fw-faint">' + esc('Dining booking · ' + (x.r.table || 'Banquet Hall') + ' · ' + fmt.time(x.r.time) + ' · ' + (x.r.partySize || 0) + ' guests') + '</div></div></div>';
      }).join('') +
      (calSel >= t ? hallNote(calSel, si) + '<button type="button" class="btn btn-primary fw-wide" data-action="cal-new">' + Club.icon('plus') + '<span>Start an enquiry for ' + esc(fmt.dateShort(calSel)) + '</span></button>' : (si.length ? '' : '<p class="fw-faint">Nothing was booked this day.</p>') + '<p class="fw-faint">This date has passed.</p>') + '</div></section>';
    const agenda = '<section class="panel fw-cal-agenda"><ul class="fw-agenda">' + (monthItems.length ? monthItems.map(function (m) { return agendaItem(m.d, m.x); }).join('') : '<li class="dining"><div></div><div class="fw-an">Nothing booked this month.</div></li>') + '</ul></section>';
    const label = first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
    return '<div class="fw-cal-bar"><div class="fw-cal-nav">' + ui.btn('', { icon: 'chevronLeft', action: 'cal-prev', title: 'Previous month', sm: true }) + '<h2 class="fw-cal-title">' + esc(label) + '</h2>' + ui.btn('', { icon: 'chevronRight', action: 'cal-next', title: 'Next month', sm: true }) + ui.btn('Today', { kind: 'ghost', sm: true, action: 'cal-today' }) + '</div>' +
      '<div class="fw-legend"><span>' + dot('held') + 'Deposit paid or confirmed</span><span>' + dot('tent') + 'In discussion</span><span>' + dot('din') + 'Banquet Hall dining booking</span></div></div>' +
      '<div class="fw-cal-wrap"><div><div class="panel fw-cal-panel"><div class="fw-cal" role="grid" aria-label="' + esc(label) + '"><div class="fw-cal-row" role="row">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) { return '<div class="fw-dow" role="columnheader">' + d + '</div>'; }).join('') + '</div>' + cells + '</div></div>' + agenda + '</div>' + side + '</div>';
  }
  function renderCalendar(panel) {
    function draw() { panel.innerHTML = calendarHtml(); }
    draw();
    ui.on(panel, 'click', '[data-action^=cal-]', function (e, b) {
      const a = b.dataset.action;
      if (a === 'cal-new') { openForm(null, { date: calSel }, function (id) { Club.app.go('functions/' + id); }); return; }
      if (a === 'cal-today') { calMonth = today().slice(0, 7); calSel = today(); }
      else { const dd = new Date(+calMonth.slice(0, 4), +calMonth.slice(5, 7) - 1 + (a === 'cal-next' ? 1 : -1), 1, 12); calMonth = S.iso(dd).slice(0, 7); calSel = null; }
      draw(); ui.animateIn(panel);
    });
    function pick(cell) {
      const d = cell.dataset.date;
      if (d.slice(0, 7) !== calMonth) calMonth = d.slice(0, 7);
      calSel = d; draw();
      const n = ui.$('.fw-cday[data-date="' + d + '"]', panel); if (n && !ui.touchUI()) n.focus({ preventScroll: true });
    }
    ui.on(panel, 'click', '.fw-cday', function (e, cell) { if (e.target.closest('a')) return; pick(cell); });
    ui.on(panel, 'keydown', '.fw-cday', function (e, cell) { if ((e.key === 'Enter' || e.key === ' ') && e.target === cell) { e.preventDefault(); pick(cell); } });
    /* The month list under the calendar (phones): the whole row opens the booking, as on the To do tab */
    ui.on(panel, 'click', '.fw-agenda li[data-ev]', function (e, li) { if (e.target.closest('a, button')) return; Club.app.go('functions/' + li.dataset.ev); });
  }

  /* ---------------- Packages ---------------- */
  function renderPackages(panel) {
    const pkgs = S.all('functionPackages');
    panel.innerHTML = '<p class="fw-pk-note">' + esc(SAMPLE_NOTE) + ' Current wedding packages are on <a href="' + esc(Club.info.eventsWebsite) + '" target="_blank" rel="noopener">stbonifaceevents.com</a>.</p>' +
      (pkgs.length ? '<div class="fn-pkgs fw-pkgs">' + pkgs.map(function (p) {
        const used = all().filter(function (f) { return f.packageId === p.id && f.stage !== 'Lost'; }).length;
        return '<article class="panel fn-pkg" data-reveal><div class="fn-pkg-head"><span class="eyebrow">' + esc(p.kind) + '</span>' + (p.sample !== false ? ui.badge('Sample pricing', 'outline') : '') + '</div>' +
          '<h3>' + esc(p.name) + '</h3><div class="fn-pkg-price"><span class="serif">' + fmt.money0(p.perGuest) + '</span><span class="muted">per guest · minimum ' + (p.minimumGuests || 0) + '</span></div>' +
          '<ul class="fn-pkg-list">' + (p.includes || []).map(function (x) { return '<li>' + Club.icon('check') + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' +
          '<div class="fn-pkg-foot"><span class="muted">' + used + ' event' + (used === 1 ? '' : 's') + ' on this package</span>' + ui.btn('Edit', { sm: true, icon: 'edit', action: 'edit-pkg', id: p.id }) + '</div></article>';
      }).join('') + '</div>' : ui.empty({ icon: 'events', title: 'No packages yet', text: 'Add the club\'s current packages to quote events quickly.' }));
    ui.on(panel, 'click', '[data-action=edit-pkg]', function (e, b) { editPackage(S.find('functionPackages', b.dataset.id), function () { renderPackages(panel); ui.animateIn(panel); }); });
  }
  function editPackage(p, done) {
    if (!p) return;
    const body = '<form novalidate><div class="form-grid">' +
      ui.field({ label: 'Package name', name: 'name', value: p.name, required: true, span2: true }) +
      ui.field({ label: 'Price per guest', name: 'perGuest', type: 'number', min: 0, step: 0.5, value: p.perGuest, required: true }) +
      ui.field({ label: 'Minimum guests', name: 'minimumGuests', type: 'number', min: 0, max: MAX_GUESTS, value: p.minimumGuests, required: true }) +
      ui.field({ label: 'What is included', name: 'includes', type: 'textarea', value: (p.includes || []).join('\n'), span2: true, hint: 'One item per line' }) +
      '</div><label class="check"><input type="checkbox" name="confirmed"' + (p.sample === false ? ' checked' : '') + '> Pricing confirmed by the club</label></form>';
    const m = ui.modal({ eyebrow: 'Package', title: 'Edit package', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save package', kind: 'primary', onClick: function () {
      const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (d.perGuest < 0 || d.minimumGuests < 0) return false;
      undoRun(function () { S.update('functionPackages', p.id, { name: d.name, perGuest: d.perGuest, minimumGuests: d.minimumGuests, includes: d.includes.split('\n').map(function (x) { return x.trim(); }).filter(Boolean), sample: !d.confirmed }); },
        undoOpts('Package saved', 'Package put back as it was'));
      done();
    } }] });
  }

  /* ---------------- Printable sheets ---------------- */
  function printEl(node) {
    if (!node) return;
    node.classList.add('fn-print-target'); document.body.classList.add('fn-printing');
    const end = function () { node.classList.remove('fn-print-target'); document.body.classList.remove('fn-printing'); window.removeEventListener('afterprint', end); };
    window.addEventListener('afterprint', end);
    window.print();
    setTimeout(end, 1000);
  }
  /** Print a sheet that is not on screen: it is placed off screen, printed, then removed. */
  function printHtml(html) {
    const host = ui.el('<div class="fw-print-host" aria-hidden="true">' + html + '</div>');
    document.body.appendChild(host);
    printEl(host.firstElementChild);
    setTimeout(function () { host.remove(); }, 1500);
  }
  function coordName(f) { const c = Club.staff.get(f.coordinatorId || COORDINATOR); return c ? c.firstName + ' ' + c.lastName : 'Unassigned'; }
  function letterHtml(f) {
    const info = Club.info, pkg = pkgOf(f), q = f.quote;
    const dated = stageDate(f, 'Proposal sent') || today();
    const dear = f.type === 'Wedding' ? firstName(f.contactName) : f.contactName;
    return '<article class="fn-letter fw-letter">' +
      '<header class="fn-lh">' + Club.logoImg('fn-lh-logo') + '<div class="fn-lh-name">' + esc(info.name) + '</div><div class="fn-lh-sub">Weddings &amp; special events</div><div class="fn-lh-addr">' + esc(info.address) + ' · ' + esc(info.phone) + '</div></header>' +
      '<div class="fn-lh-rule"></div>' +
      '<div class="fn-lt-meta"><div><div class="fn-lt-label">Prepared for</div><div class="fn-lt-to">' + esc(f.contactName) + '</div>' + (f.email ? '<div class="muted">' + esc(f.email) + '</div>' : '') + '</div><dl class="fn-lt-facts"><dt>Date</dt><dd>' + esc(fmt.date(dated)) + '</dd><dt>Event</dt><dd>' + esc(fmt.date(f.date)) + '</dd><dt>Reference</dt><dd>' + esc(String(f.id).toUpperCase()) + '</dd></dl></div>' +
      '<p>Dear ' + esc(dear) + ',</p>' +
      '<p>Thank you for considering ' + esc(info.name) + ' for ' + (f.type === 'Wedding' ? 'your wedding' : 'your ' + esc(f.type.toLowerCase())) + '. It would be our pleasure to host you. As one of Winnipeg\'s most established venues, we offer year-round, all-inclusive packages, seating for up to 220 guests and complimentary parking, so you and your guests can enjoy a relaxing and stress-free celebration.</p>' +
      '<p>Here is the proposal we discussed for <strong>' + esc(fmt.dateLong(f.date)) + '</strong>.</p>' +
      '<h4 class="fn-lt-h">Your event</h4><dl class="fn-lt-kv"><dt>Event</dt><dd>' + esc(f.name) + '</dd><dt>Space</dt><dd>' + esc(f.space) + '</dd><dt>Time</dt><dd>' + esc(timeRange(f)) + '</dd><dt>Guests</dt><dd>' + f.guests + '</dd>' + (pkg ? '<dt>Package</dt><dd>' + esc(pkg.name) + '</dd>' : '') + '</dl>' +
      (pkg && (pkg.includes || []).length ? '<h4 class="fn-lt-h">What is included</h4><ul class="fn-lt-list">' + pkg.includes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (q ? '<h4 class="fn-lt-h">Estimate</h4><div class="table-wrap"><table class="table fn-lt-table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
        q.lines.map(function (l) { return '<tr><td>' + esc(l.label) + '</td><td class="num">' + esc(l.qty) + '</td><td class="num">' + money(l.unitPrice) + '</td><td class="num">' + money(l.qty * l.unitPrice) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="num">' + money(q.subtotal) + '</td></tr><tr><td colspan="3">' + esc(taxLabel()) + '</td><td class="num">' + money(q.tax) + '</td></tr><tr class="fn-lt-total"><td colspan="3">Total</td><td class="num">' + money(q.total) + '</td></tr>' +
        (paid(f) ? '<tr><td colspan="3">Deposits received</td><td class="num">' + money(-paid(f)) + '</td></tr><tr><td colspan="3">Balance due</td><td class="num">' + money(balance(f)) + '</td></tr>' : '') + '</tfoot></table></div>' : '<p class="muted">Pricing to follow.</p>') +
      '<p>A deposit holds your date. We will confirm the deposit, payment schedule and final guest numbers with you as your plans come together.</p>' +
      '<p>We would love to show you the room in person. Call us any time to book a tour.</p>' +
      '<div class="fn-lt-sign"><p class="fn-lt-warm">With warm regards,</p><div class="fn-lt-signame">' + esc(coordName(f)) + '</div><div class="muted">Director of Clubhouse Operations and Special Events</div><div class="muted">' + esc(info.phone) + ' ext. 215</div></div>' +
      '<footer class="fn-lt-foot"><span>' + esc(info.eventsWebsite.replace(/^https?:\/\/(www\.)?/, '')) + '</span><span>Estimates are valid for 30 days and subject to final guest numbers.</span></footer>' +
      '</article>';
  }
  /** One page for the kitchen and floor team: timings, menu and service notes, contact. */
  function runSheetHtml(f) {
    const rs = f.runSheet || [], info = Club.info;
    return '<article class="fn-letter fw-rs-sheet"><header class="fn-lh">' + Club.logoImg('fn-lh-logo') + '<div class="fn-lh-name">' + esc(info.name) + '</div><div class="fn-lh-sub">Run sheet</div></header><div class="fn-lh-rule"></div>' +
      '<h2 class="fw-rs-title">' + esc(f.name) + '</h2><p class="muted">' + esc(fmt.dateLong(f.date) + ' · ' + f.space + ' · ' + timeRange(f) + ' · ' + f.guests + ' guests') + '</p>' +
      '<h4 class="fn-lt-h">Timings</h4>' + (rs.length ? '<table class="table fn-lt-table"><tbody>' + rs.map(function (r) { return '<tr><td class="nowrap">' + esc(r.time ? fmt.time(r.time) : 'Time to be confirmed') + '</td><td>' + esc(r.item) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">No timings yet.</p>') +
      '<h4 class="fn-lt-h">Menu and service notes</h4><p>' + (f.menuNotes ? esc(f.menuNotes) : '<span class="muted">None yet.</span>') + '</p>' +
      (f.notes ? '<h4 class="fn-lt-h">Enquiry notes</h4><p>' + esc(f.notes) + '</p>' : '') +
      '<h4 class="fn-lt-h">Contacts</h4><dl class="fn-lt-kv"><dt>' + (f.type === 'Wedding' ? 'Couple' : 'Organizer') + '</dt><dd>' + esc(f.contactName + (f.phone ? ', ' + ui.phone(f.phone) : '')) + '</dd><dt>Coordinator</dt><dd>' + esc(coordName(f)) + '</dd></dl>' +
      '<footer class="fn-lt-foot"><span>Printed ' + esc(fmt.date(today())) + '</span><span>' + esc(String(f.id).toUpperCase()) + '</span></footer></article>';
  }

  /* ---------------- Event page: one workspace ---------------- */
  let ws = { id: null };
  function freshWs(id) { return { id: id, quoteOpen: false, quoteEdit: false, qLines: null, rsEdit: false, rsRows: null, notesEdit: false, notesDraft: null, tlAll: false }; }

  function wsHeadHtml(f) {
    const d = fmt.toDate(f.date), nb = stageBtn(f);
    let a = '';
    if (f.stage !== 'Completed' && f.stage !== 'Lost') a += ui.btn(f.tour && f.tour.date >= today() ? 'Move tour' : 'Book tour', { icon: 'calendar', action: 'tour' });
    if (f.stage === 'Lost') a += ui.btn('Reopen', { icon: 'refresh', action: 'reopen', kind: 'primary' });
    else if (nb) a += '<button type="button" class="btn btn-primary" data-action="advance">' + Club.icon('chevronRight') + '<span>' + esc(nb.label) + '</span></button>';
    a += '<button type="button" class="btn btn-icon" data-action="more" aria-haspopup="menu" aria-expanded="false" title="More actions" aria-label="More actions">' + Club.icon('more') + '</button>';
    return '<div class="fw-ws-top"><a class="fn-back" href="#/functions">' + Club.icon('chevronLeft') + '<span>Weddings &amp; Events</span></a></div>' +
      '<header class="fw-ws-head"><div class="fw-ws-date"><small>' + esc(fmt.weekday(f.date)) + '</small><b>' + d.getDate() + '</b><small>' + esc(d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + d.getFullYear()) + '</small></div>' +
      '<div class="fw-ws-title"><div class="fw-ws-eyebrow"><span class="eyebrow">' + esc(f.type + ' · ' + f.space) + '</span>' + stageBadge(f.stage) + '</div><h1>' + esc(f.name) + '</h1>' +
      '<div class="fw-ws-meta"><span>' + Club.icon('clock') + esc(timeRange(f)) + '</span><span>' + Club.icon('members') + f.guests + ' guests</span><span>' + Club.icon('user') + esc(f.contactName) + '</span><span>' + Club.icon('calendar') + esc(fmt.relative(f.date)) + '</span></div>' +
      (f.stage === 'Lost' ? '<p class="fw-ws-lost">Closed as lost: ' + esc(f.lostReason || 'no reason given') + '</p>' : '') + '</div>' +
      '<div class="fw-ws-actions fn-actions">' + a + '</div></header>';
  }
  function stepsHtml(f) {
    const idx = FLOW.indexOf(f.stage);
    return '<ol class="fw-steps' + (f.stage === 'Lost' ? ' lost' : '') + '" aria-label="Stages">' + FLOW.map(function (s, i) {
      const dd = stageDate(f, s);
      const c = f.stage === 'Lost' ? (dd ? 'done' : '') : i < idx ? 'done' : i === idx ? 'cur' : '';
      return '<li class="' + c + '"' + (c === 'cur' ? ' aria-current="step"' : '') + '><span class="fw-step-l">' + esc(s) + '</span><small>' + (dd ? esc(fmt.dateShort(dd)) : '&nbsp;') + '</small></li>';
    }).join('') + '</ol>';
  }
  function nextStepsHtml(f) {
    const tl = tasks(f);
    let body;
    if (!tl.length) {
      body = f.stage === 'Lost' ? '<p class="fw-empty-line">Closed as lost' + (stageDate(f, 'Lost') ? ' on ' + esc(fmt.date(stageDate(f, 'Lost'))) : '') + ': ' + esc(f.lostReason || 'no reason given') + '. Reopen it to pick it up again.</p>'
        : '<p class="fw-empty-line">Event completed' + (stageDate(f, 'Completed') ? ' ' + esc(fmt.date(stageDate(f, 'Completed'))) : '') + '. ' + (f.quote ? (balance(f) > 0 ? esc(money(balance(f))) + ' is still to collect.' : 'Paid in full.') : '') + '</p>';
      return '<section class="panel fw-sec" id="fw-next"><div class="panel-head"><h3>Next steps</h3></div>' + body + '</section>';
    }
    return '<section class="panel fw-sec" id="fw-next"><div class="panel-head"><h3>Next steps</h3><span class="fw-faint">' + tl.filter(function (t) { return t.done; }).length + ' of ' + tl.length + ' done</span></div><ul class="fw-nx">' + tl.map(function (t) {
      return '<li class="' + (t.done ? 'done' : '') + (t.warn && !t.done ? ' warn' : '') + '"><span class="fw-ck" aria-hidden="true">' + (t.done ? Club.icon('check') : '') + '</span><div><div class="fw-nx-t"><span class="sr-only">' + (t.done ? 'Done: ' : 'To do: ') + '</span>' + esc(t.text) + '</div>' + (t.sub ? '<div class="fw-nx-s">' + esc(t.sub) + '</div>' : '') + '</div>' +
        (t.act && !t.done ? '<button type="button" class="btn btn-sm" data-task="' + esc(t.key) + '">' + esc(t.act) + '</button>' : '<span></span>') + '</li>';
    }).join('') + '</ul></section>';
  }
  function quoteReadHtml(q) {
    return '<div class="table-wrap"><table class="table fw-tbl"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
      q.lines.map(function (l) { return '<tr><td>' + esc(l.label) + '</td><td class="num">' + esc(l.qty) + '</td><td class="num nowrap">' + money(l.unitPrice) + '</td><td class="num nowrap">' + money(l.qty * l.unitPrice) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="3" class="right">Subtotal</td><td class="num nowrap">' + money(q.subtotal) + '</td></tr><tr class="fw-tax"><td colspan="3" class="right">' + esc(taxLabel()) + '</td><td class="num nowrap">' + money(q.tax) + '</td></tr><tr class="fw-tot"><td colspan="3" class="right">Total</td><td class="num nowrap">' + money(q.total) + '</td></tr></tfoot></table></div>';
  }
  function quoteEditHtml(f) {
    const lines = ws.qLines, t = totals(lines);
    return '<div class="fw-qedit">' + (lines.length ? '<div class="table-wrap"><table class="table fn-q"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
      lines.map(function (l, i) {
        return '<tr><td><input class="input" data-i="' + i + '" data-k="label" value="' + esc(l.label) + '" aria-label="Item"></td>' +
          '<td class="num"><input class="input num fn-q-qty" type="number" min="0" step="1" data-i="' + i + '" data-k="qty" value="' + esc(l.qty) + '" aria-label="Quantity"></td>' +
          '<td class="num"><input class="input num fn-q-price" type="number" min="0" step="0.01" data-i="' + i + '" data-k="unitPrice" value="' + esc(l.unitPrice) + '" aria-label="Unit price"></td>' +
          '<td class="num nowrap fn-q-amt" data-amt="' + i + '">' + money((+l.qty || 0) * (+l.unitPrice || 0)) + '</td>' +
          '<td><button type="button" class="btn btn-ghost btn-sm btn-icon" data-q-del="' + i + '" title="Remove line" aria-label="Remove line">' + Club.icon('close') + '</button></td></tr>';
      }).join('') + '</tbody><tfoot>' +
      '<tr><td colspan="3" class="right">Subtotal</td><td class="num nowrap" data-t="subtotal">' + money(t.subtotal) + '</td><td></td></tr>' +
      '<tr class="fn-q-tax"><td colspan="3" class="right">' + esc(taxLabel()) + '</td><td class="num nowrap" data-t="tax">' + money(t.tax) + '</td><td></td></tr>' +
      '<tr class="fn-q-total"><td colspan="3" class="right">Total</td><td class="num nowrap serif" data-t="total">' + money(t.total) + '</td><td></td></tr></tfoot></table></div>'
      : '<p class="fw-empty-line">No quote lines. Add the package, room rental, bar and any extras.</p>') +
      '<div class="fw-q-add"><span class="fw-faint">Add</span>' + ui.btn('Package', { sm: true, icon: 'plus', action: 'q-pkg' }) + ui.btn('Room rental', { sm: true, icon: 'plus', action: 'q-room' }) + ui.btn('Bar', { sm: true, icon: 'plus', action: 'q-bar' }) + ui.btn('Extra', { sm: true, icon: 'plus', action: 'q-extra' }) + '</div>' +
      '<div class="fn-q-foot fw-q-foot"><p class="muted fn-note">' + esc(SAMPLE_NOTE) + '</p><div class="row">' + (f.quote ? ui.btn('Reset to package', { sm: true, kind: 'ghost', icon: 'refresh', action: 'q-reset' }) : '') + ui.btn('Cancel', { sm: true, action: 'q-cancel' }) + ui.btn('Save quote', { kind: 'primary', sm: true, icon: 'check', action: 'q-save' }) + '</div></div></div>';
  }
  function moneyHtml(f) {
    const q = f.quote, p = paid(f), b = balance(f);
    const deps = (f.deposits || []).slice().sort(function (a, c) { return a.date < c.date ? -1 : 1; });
    const pct = q && q.total ? Math.min(100, Math.round(p / q.total * 100)) : 0;
    return '<section class="panel fw-sec" id="fw-money"><div class="panel-head"><h3>Money</h3><div class="fw-head-acts">' +
      (ws.quoteEdit ? '' : ui.btn(q ? 'Edit quote' : 'Build quote', { sm: true, icon: 'edit', action: 'q-edit' })) +
      (f.stage !== 'Lost' ? ui.btn('Record ' + ((f.deposits || []).length && FLOW.indexOf(f.stage) >= 3 ? 'payment' : 'deposit'), { sm: true, kind: 'primary', icon: 'plus', action: 'deposit' }) : '') + '</div></div>' +
      '<div class="fw-money"><div><small>Quote total</small><b>' + (q ? money(q.total) : '<span class="fw-faint fw-noq">No quote yet</span>') + '</b></div><div><small>Received</small><b>' + money(p) + '</b></div><div><small>Balance due</small><b class="' + (b > 0 && f.date < today() ? 'fn-overdue' : '') + '">' + money(Math.max(0, b)) + '</b></div></div>' +
      (q ? '<div class="fw-paybar"><span class="bar"><span style="width:' + pct + '%"></span></span><span>' + pct + '% paid</span></div>' : '') +
      (deps.length ? '<div class="table-wrap"><table class="table fw-tbl fw-pay"><thead><tr><th>Payment</th><th>Method</th><th class="num">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + deps.map(function (d) {
        const rc = depositReceiptOf(f, d);
        return '<tr><td class="nowrap fw-p-date">' + esc(fmt.date(d.date)) + '</td><td class="fw-p-method">' + depositLabel(d) + '</td><td class="num nowrap fw-p-amt">' + money(d.amount) + '</td><td class="right nowrap fw-p-acts">' +
          (rc ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-dep-rc="' + esc(rc.id) + '" title="Receipt ' + esc(rc.no) + '" aria-label="Receipt ' + esc(rc.no) + '">' + Club.icon('billing') + '</button>' : '') +
          '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-dep-del="' + esc(d.id || '') + '" title="Remove payment" aria-label="Remove payment">' + Club.icon('trash') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="fw-empty-line">No payments yet. A deposit holds the date. Card payments keep only the brand and last four digits.</p>') +
      (ws.quoteEdit ? '<div class="fw-q-title">' + (q ? 'Edit quote' : 'New quote, drafted from the package') + '</div>' + quoteEditHtml(f)
        : q ? '<button type="button" class="fw-disclose" data-action="q-toggle" aria-expanded="' + ws.quoteOpen + '"><b>Quote lines</b><span>' + q.lines.length + (q.lines.length === 1 ? ' line' : ' lines') + ', saved ' + esc(fmt.dateShort(String(q.updatedAt || f.createdAt || today()).slice(0, 10))) + Club.icon('chevronDown') + '</span></button>' + (ws.quoteOpen ? quoteReadHtml(q) : '') : '') +
      '</section>';
  }
  function planHtml(f) {
    const rs = f.runSheet || [];
    let sheet;
    if (ws.rsEdit) {
      const rows = ws.rsRows;
      sheet = '<div class="fw-rs-edit">' + (rows.length ? '<ol class="fn-rs">' + rows.map(function (r, i) {
        return '<li><input class="input fn-rs-time" type="time" value="' + esc(r.time || '') + '" data-i="' + i + '" data-k="time" aria-label="Time"><input class="input" value="' + esc(r.item || '') + '" data-i="' + i + '" data-k="item" aria-label="What happens" placeholder="What happens"><button type="button" class="btn btn-ghost btn-sm btn-icon" data-rs-del="' + i + '" title="Remove item" aria-label="Remove item">' + Club.icon('close') + '</button></li>';
      }).join('') + '</ol>' : '<p class="fw-empty-line">No timings yet. Add arrivals, dinner, speeches and last call.</p>') +
        '<div class="fn-rs-foot fw-rs-foot">' + ui.btn('Add item', { sm: true, icon: 'plus', action: 'rs-add' }) + '<span class="fw-grow"></span>' + ui.btn('Cancel', { sm: true, action: 'rs-cancel' }) + ui.btn('Save run sheet', { sm: true, kind: 'primary', action: 'rs-save' }) + '</div></div>';
    } else sheet = rs.length ? '<ol class="fw-rs">' + rs.map(function (r) { return '<li><span class="fw-tm">' + esc(r.time ? fmt.time(r.time) : 'TBC') + '</span><span class="fw-ln" aria-hidden="true"></span><span>' + esc(r.item) + '</span></li>'; }).join('') + '</ol>'
      : '<p class="fw-empty-line">No run sheet yet. Add arrivals, dinner, speeches and last call once the details firm up.</p>';
    const notes = ws.notesEdit
      ? '<textarea class="textarea fn-menu" aria-label="Menu and service notes" placeholder="Menu choices, dietary needs, bar service, vendors">' + esc(ws.notesDraft != null ? ws.notesDraft : f.menuNotes || '') + '</textarea><div class="row fn-menu-foot">' + ui.btn('Cancel', { sm: true, action: 'menu-cancel' }) + ui.btn('Save notes', { sm: true, kind: 'primary', action: 'save-menu' }) + '</div>'
      : '<div class="fw-notes' + (f.menuNotes ? '' : ' fw-faint') + '">' + esc(f.menuNotes || 'None yet: menu choices, dietary needs, bar service, vendors') + '</div>';
    return '<section class="panel fw-sec" id="fw-plan"><div class="panel-head"><div><h3>Plan for the day</h3><div class="fw-faint">Shared with the kitchen and floor team</div></div>' +
      (ws.rsEdit ? '' : ui.btn(rs.length ? 'Edit run sheet' : 'Add timings', { sm: true, icon: rs.length ? 'edit' : 'plus', action: 'rs-edit' })) + '</div>' + sheet +
      '<div class="fw-plan-notes"><div class="fw-plan-row"><b>Menu and service notes</b>' + (ws.notesEdit ? '' : ui.btn('Edit', { sm: true, kind: 'ghost', icon: 'edit', action: 'menu-edit' })) + '</div>' + notes +
      (f.notes ? '<div class="fw-plan-enq"><b>Enquiry notes</b><div>' + esc(f.notes) + '</div></div>' : '') + '</div></section>';
  }
  function docsHtml(f) {
    const q = f.quote, sent = stageDate(f, 'Proposal sent'), canSend = FLOW.indexOf(f.stage) < 2 && f.stage !== 'Lost';
    const deps = (f.deposits || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return '<section class="panel fw-sec" id="fw-docs"><div class="panel-head"><h3>Documents</h3></div><ul class="fw-docs">' +
      '<li><span class="fw-di-ic">' + Club.icon('mail') + '</span><div><div class="fw-doc-n">Proposal letter</div><div class="fw-ds">' + esc(sent ? 'Sent ' + fmt.date(sent) + (q ? ', estimate ' + money(q.total) : '') : q ? 'Ready to send, estimate ' + money(q.total) : 'Save a quote to include pricing') + '</div></div><div class="fw-doc-acts">' +
        (canSend ? ui.btn('Mark sent', { sm: true, icon: 'send', action: 'mark-sent' }) : '') + ui.btn('Preview', { sm: true, icon: 'eye', action: 'letter' }) +
        '<button type="button" class="btn btn-sm btn-icon" data-action="print" title="Print proposal" aria-label="Print proposal">' + Club.icon('print') + '</button></div></li>' +
      deps.map(function (d, i) {
        const rc = depositReceiptOf(f, d);
        return '<li><span class="fw-di-ic">' + Club.icon('billing') + '</span><div><div class="fw-doc-n">Receipt, ' + (i === 0 ? 'deposit' : 'payment') + ' of ' + esc(money(d.amount)) + '</div><div class="fw-ds">' + esc(fmt.date(d.date)) + (rc ? ', ' + esc(rc.no) + ', counted in that day\'s close' : ', no receipt on file') + '</div></div>' +
          (rc ? '<button type="button" class="btn btn-sm" data-dep-rc="' + esc(rc.id) + '">Open</button>' : '<span></span>') + '</li>';
      }).join('') +
      '<li><span class="fw-di-ic">' + Club.icon('print') + '</span><div><div class="fw-doc-n">Run sheet for the team</div><div class="fw-ds">' + ((f.runSheet || []).length ? 'Timings and menu notes on one page' : 'Add timings first. Menu notes print with it') + '</div></div><button type="button" class="btn btn-sm btn-icon" data-action="print-rs" title="Print run sheet" aria-label="Print run sheet"' + ((f.runSheet || []).length ? '' : ' disabled') + '>' + Club.icon('print') + '</button></li>' +
      '</ul></section>';
  }
  function contactHtml(f) {
    const pkg = pkgOf(f);
    return '<section class="panel fw-sec" id="fw-contact"><div class="panel-head"><h3>Contact</h3>' + ui.btn('', { kind: 'ghost', sm: true, icon: 'edit', action: 'edit', title: 'Edit details' }) + '</div><div class="panel-body">' +
      ui.person(f.contactName, esc(f.type === 'Wedding' ? 'Couple' : 'Organizer'), 'fw-av') +
      '<dl class="kv fn-kv fw-kv">' + (f.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(f.email) + '">' + esc(f.email) + '</a></dd>' : '') + (f.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(String(f.phone).replace(/[^\d+]/g, '')) + '">' + esc(ui.phone(f.phone)) + '</a></dd>' : '') +
      '<dt>Coordinator</dt><dd>' + esc(coordName(f)) + '</dd>' +
      (f.tour ? '<dt>Tour</dt><dd>' + esc(fmt.dateShort(f.tour.date) + ', ' + fmt.time(f.tour.time)) + (f.tour.date < today() ? ' <span class="muted">(held)</span>' : '') + '</dd>' : '') +
      '<dt>In stage</dt><dd>' + days(daysInStage(f)) + '</dd><dt>Package</dt><dd>' + (pkg ? esc(pkg.name) + ', ' + esc(money(pkg.perGuest)) + ' per guest' : '<span class="muted">Not chosen yet</span>') + '</dd></dl></div></section>';
  }
  function dateCheckHtml(f) {
    const c = conflicts(f.date, f.space, f.id);
    if (c.functions.length || c.dining.length) return conflictHtml(c);
    return '<div class="fn-ok">' + Club.icon('check') + '<div>' + esc(fmt.dateLong(f.date)) + ' has nothing else in the ' + esc(f.space) + '.</div></div>';
  }
  function activityHtml(f) {
    const hist = (f.history || []).slice().reverse();
    return '<section class="panel fw-sec fw-act-panel"><div class="panel-head"><h3>Activity</h3><span class="fw-faint">' + hist.length + (hist.length === 1 ? ' update' : ' updates') + '</span></div><ul class="fw-act">' +
      hist.map(function (h, i) { return '<li' + (i >= 5 && !ws.tlAll ? ' hidden' : '') + '><b>' + esc(h.note || h.stage) + '</b><span>' + esc(h.stage + ' · ' + fmt.date(String(h.at).slice(0, 10))) + '</span></li>'; }).join('') + '</ul>' +
      (hist.length > 5 ? '<div class="fw-act-more"><button type="button" class="s-link fn-tl-all" data-action="tl-all">' + (ws.tlAll ? 'Show fewer' : 'View all (' + hist.length + ')') + '</button></div>' : '') + '</section>';
  }

  function renderDetail(view, id) {
    closeMenu();
    const f0 = S.find('functions', id);
    if (!f0) {
      view.innerHTML = '<a class="fn-back" href="#/functions">' + Club.icon('chevronLeft') + '<span>Weddings &amp; Events</span></a>' + ui.empty({ icon: 'events', title: 'Event not found', text: 'It may have been deleted. Head back to the pipeline to find it.', action: '<a class="btn btn-primary" href="#/functions">Back to pipeline</a>' });
      return;
    }
    if (ws.id !== id) ws = freshWs(id);
    view.innerHTML = '<div class="fw-ws"></div>';
    const root = view.firstElementChild;
    function cur() { return S.find('functions', id); }
    function paint() {
      const f = cur(); if (!f) { renderDetail(view, id); return; }
      root.innerHTML = wsHeadHtml(f) + stepsHtml(f) +
        '<nav class="fw-jump" aria-label="Sections"><button type="button" data-jump="fw-next">Next steps</button><button type="button" data-jump="fw-money">Money</button><button type="button" data-jump="fw-plan">Plan for the day</button><button type="button" data-jump="fw-docs">Documents</button><button type="button" data-jump="fw-contact">Contact</button></nav>' +
        '<div class="fw-ws-grid"><div class="fw-ws-main">' + nextStepsHtml(f) + moneyHtml(f) + planHtml(f) + docsHtml(f) + '</div>' +
        '<aside class="fw-ws-side fn-side">' + contactHtml(f) + dateCheckHtml(f) + activityHtml(f) + '</aside></div>';
    }
    function refresh() { paint(); if (Club.app.refreshNav) Club.app.refreshNav(); }
    function focusSection(sel, inner) {
      const n = ui.$(sel, root); if (!n) return;
      n.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      if (inner) { const i = ui.$(inner, n); if (i && !ui.touchUI()) setTimeout(function () { i.focus({ preventScroll: true }); }, 250); }
    }
    paint(); ui.animateIn(root);

    function startQuote() { const f = cur(); ws.qLines = f.quote ? f.quote.lines.map(function (l) { return Object.assign({}, l); }) : defaultLines(f); ws.quoteEdit = true; ws.quoteOpen = true; }
    function startRs() { const f = cur(); ws.rsRows = (f.runSheet || []).map(function (r) { return { time: r.time, item: r.item }; }); if (!ws.rsRows.length) ws.rsRows.push({ time: '', item: '' }); ws.rsEdit = true; }
    function startNotes() { ws.notesDraft = null; ws.notesEdit = true; }
    function liveTotals() {
      ws.qLines.forEach(function (l, i) { const c = ui.$('[data-amt="' + i + '"]', root); if (c) c.textContent = money((+l.qty || 0) * (+l.unitPrice || 0)); });
      const t = totals(ws.qLines); ['subtotal', 'tax', 'total'].forEach(function (k) { const c = ui.$('[data-t=' + k + ']', root); if (c) c.textContent = money(t[k]); });
    }
    function sortRs() { ws.rsRows.sort(function (a, b) { return (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0; }); }

    function act(name, b) {
      const f = cur(); if (!f) return;
      switch (name) {
        case 'tour': return bookTour(f, refresh);
        case 'advance': { const n = nextStage(f); if (n) moveTo(f, n, refresh); return; }
        case 'reopen': return moveTo(f, 'Enquiry', refresh);
        case 'lost': return markLost(f, refresh);
        case 'back': return stepBack(f, refresh);
        case 'edit': return openForm(f, null, refresh);
        case 'delete': return ui.confirm({ title: 'Delete this event?', text: f.name + ' and its quote, payments and history will be removed. Receipts already issued stay in Accounting.', confirmLabel: 'Delete event', danger: true }).then(function (ok) {
          if (!ok) return;
          undoRun(function () { S.remove('functions', id); }, undoOpts('Event deleted', f.name + ' restored', function () { if (location.hash === '#/functions/' + id) Club.app.render(); else Club.app.go('functions/' + id); }));
          Club.app.go('functions');
        });
        case 'more': {
          const back = backTo(f), items = [{ k: 'edit', label: 'Edit details', icon: 'edit' }];
          if (back) items.push({ k: 'back', label: 'Move back to ' + back.toLowerCase(), icon: 'chevronLeft', attrs: ' data-back="' + esc(f.id) + '"' });
          items.push('-');
          if (f.stage !== 'Completed' && f.stage !== 'Lost') items.push({ k: 'lost', label: 'Mark lost', icon: 'close', danger: true });
          items.push({ k: 'delete', label: 'Delete event', icon: 'trash', danger: true });
          return openMenu(b, items, function (k) { act(k); });
        }
        case 'deposit': return recordDeposit(f, refresh);
        case 'q-edit': startQuote(); paint(); return focusSection('#fw-money .fw-q-title');
        case 'q-toggle': ws.quoteOpen = !ws.quoteOpen; return paint();
        case 'q-cancel': ws.quoteEdit = false; ws.qLines = null; return paint();
        case 'q-pkg': case 'q-room': case 'q-bar': case 'q-extra': {
          const pkg = pkgOf(f);
          if (name === 'q-pkg') ws.qLines.push(pkg ? { label: pkg.name + ' package', qty: Math.max(f.guests, pkg.minimumGuests || 0), unitPrice: pkg.perGuest } : { label: 'Package per guest', qty: f.guests, unitPrice: 0 });
          else if (name === 'q-room') ws.qLines.push({ label: 'Room rental, ' + f.space, qty: 1, unitPrice: ROOM_RATE[f.space] || 0 });
          else if (name === 'q-bar') ws.qLines.push({ label: 'Host bar estimate', qty: f.guests, unitPrice: 18 });
          else ws.qLines.push({ label: '', qty: 1, unitPrice: 0 });
          paint();
          if (name === 'q-extra') { const ins = ui.$$('#fw-money input[data-k=label]', root); if (ins.length) ins[ins.length - 1].focus(); }
          return;
        }
        case 'q-reset': return ui.confirm({ title: 'Reset the quote?', text: 'This replaces every line with the package defaults. Unsaved changes will be lost.', confirmLabel: 'Reset quote', danger: true }).then(function (ok) { if (ok) { ws.qLines = defaultLines(cur()); paint(); } });
        case 'q-save': {
          const lines = ws.qLines;
          if (!lines.length) return ui.toast('Add at least one line before saving', 'bad');
          if (lines.some(function (l) { return !String(l.label || '').trim() || l.qty < 0 || l.unitPrice < 0; })) return ui.toast('Every line needs a name and amounts of zero or more', 'bad');
          const q = makeQuote(f, lines.map(function (l) { return { label: String(l.label).trim(), qty: +l.qty || 0, unitPrice: round2(l.unitPrice) }; }));
          undoRun(function () { S.update('functions', id, { quote: q }); }, undoOpts('Quote saved · ' + money(q.total), 'Quote put back as it was'));
          ws.quoteEdit = false; ws.qLines = null; ws.quoteOpen = true; return paint();
        }
        case 'rs-edit': startRs(); paint(); return focusSection('#fw-plan', 'input[data-k=item]');
        case 'rs-add': { ws.rsRows.push({ time: '', item: '' }); paint(); const ins = ui.$$('#fw-plan input[data-k=item]', root); if (ins.length) ins[ins.length - 1].focus(); return; }
        case 'rs-cancel': ws.rsEdit = false; ws.rsRows = null; return paint();
        case 'rs-save': {
          const clean = ws.rsRows.filter(function (r) { return (r.item || '').trim(); }).map(function (r) { return { time: r.time, item: r.item.trim() }; })
            .sort(function (a, c) { return (a.time || '99') < (c.time || '99') ? -1 : (a.time || '99') > (c.time || '99') ? 1 : 0; });
          undoRun(function () { S.update('functions', id, { runSheet: clean }); }, undoOpts('Run sheet saved', 'Run sheet put back as it was'));
          ws.rsEdit = false; ws.rsRows = null; return paint();
        }
        case 'menu-edit': startNotes(); paint(); return focusSection('#fw-plan .fw-plan-notes', '.fn-menu');
        case 'menu-cancel': ws.notesEdit = false; ws.notesDraft = null; return paint();
        case 'save-menu': {
          const ta = ui.$('.fn-menu', root), v = ta ? ta.value.trim() : '';
          undoRun(function () { S.update('functions', id, { menuNotes: v }); }, undoOpts('Notes saved', 'Notes put back as they were'));
          ws.notesEdit = false; ws.notesDraft = null; return paint();
        }
        case 'mark-sent': return moveTo(f, 'Proposal sent', refresh);
        case 'print': return printHtml(letterHtml(f));
        case 'print-rs': return printHtml(runSheetHtml(f));
        case 'letter': return previewLetter(f);
        case 'tl-all': ws.tlAll = !ws.tlAll; return paint();
      }
    }
    function previewLetter(f) {
      const canSend = FLOW.indexOf(f.stage) < 2 && f.stage !== 'Lost';
      const actions = [];
      if (canSend) actions.push({ label: 'Mark proposal sent', icon: 'send', onClick: function () { moveTo(cur(), 'Proposal sent', refresh); } });
      actions.push({ label: 'Print proposal', icon: 'print', onClick: function () { printHtml(letterHtml(cur())); return false; } });
      actions.push({ label: 'Close', kind: 'primary' });
      ui.modal({ eyebrow: f.name, title: 'Proposal letter', size: 'lg', body: '<div class="fw-letter-wrap">' + letterHtml(f) + '</div>', actions: actions });
    }
    ui.on(root, 'click', '[data-action]', function (e, b) { if (b.disabled) return; act(b.dataset.action, b); });
    ui.on(root, 'click', '[data-task]', function (e, b) {
      const k = b.dataset.task;
      if (k === 'runsheet') return act('rs-edit');
      if (k === 'menu') return act('menu-edit');
      runStep(cur(), k, refresh);
    });
    ui.on(root, 'click', '[data-jump]', function (e, b) { focusSection('#' + b.dataset.jump); });
    ui.on(root, 'click', '[data-q-del]', function (e, b) { ws.qLines.splice(+b.dataset.qDel, 1); paint(); });
    ui.on(root, 'click', '[data-rs-del]', function (e, b) { ws.rsRows.splice(+b.dataset.rsDel, 1); paint(); });
    ui.on(root, 'input', '#fw-money input[data-i]', function (e, inp) { const l = ws.qLines[+inp.dataset.i]; if (!l) return; l[inp.dataset.k] = inp.dataset.k === 'label' ? inp.value : (inp.value === '' ? 0 : +inp.value); liveTotals(); });
    ui.on(root, 'input', '#fw-plan input[data-i]', function (e, inp) { const r = ws.rsRows[+inp.dataset.i]; if (r) r[inp.dataset.k] = inp.value; });
    ui.on(root, 'change', '#fw-plan input[data-k=time]', function (e, inp) { const r = ws.rsRows[+inp.dataset.i]; if (r) r.time = inp.value; sortRs(); paint(); });
    ui.on(root, 'input', '.fn-menu', function (e, ta) { ws.notesDraft = ta.value; });
    ui.on(root, 'click', '[data-dep-rc]', function (e, b) { Club.receipts.open(b.dataset.depRc); });
    ui.on(root, 'click', '[data-dep-del]', function (e, b) {
      const fresh = cur(); const d = (fresh.deposits || []).find(function (x) { return x.id === b.dataset.depDel; }); if (!d) return;
      ui.confirm({ title: 'Remove this payment?', text: money(d.amount) + ' received ' + fmt.date(d.date) + '. The record is removed and a credit receipt takes it out of today’s close. Refund the client separately if needed.', confirmLabel: 'Remove payment', danger: true }).then(function (ok) {
        if (!ok) return;
        undoRun(function () {
          S.update('functions', id, { deposits: fresh.deposits.filter(function (x) { return x !== d; }), history: (fresh.history || []).concat([{ at: localStamp(), stage: fresh.stage, note: 'Payment of ' + money(d.amount) + ' removed' }]) });
          if (Club.accounting && Club.accounting.depositReversed) { try { Club.accounting.depositReversed('functions', fresh, d); } catch (err) { console.error('Deposit credit receipt failed', err); } }
        }, undoOpts('Payment removed', 'Payment of ' + money(d.amount) + ' restored'));
        refresh();
      });
    });
  }

  /* ---------------- Register ---------------- */
  Club.register({
    id: 'functions', label: 'Weddings & Events', icon: 'events', section: 'Hospitality', order: 15,
    badge: function () { const n = all().filter(function (f) { return f.stage === 'Enquiry'; }).length; return n || null; },
    search: function (q) {
      return all().filter(function (f) { return (f.name + ' ' + f.contactName + ' ' + (f.email || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (f) { return { label: f.name, sub: f.type + ' · ' + fmt.date(f.date) + ' · ' + f.stage, href: 'functions/' + f.id, icon: 'events' }; });
    },
    render: function (view, params) {
      closeMenu();
      if (params && params[0]) { renderDetail(view, params[0]); return; }
      ws = { id: null };
      renderMain(view);
    }
  });
})();
