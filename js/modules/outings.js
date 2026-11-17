/* Tournaments & Outings: Tournament & Corporate Services. "Packages for groups of all sizes".
   Owns collections: outings, outingPackages (built from the club's 2026 tournament package).
   Confirming a shotgun outing writes a teeBlocks doc ({ date, start, end, kind: 'shotgun', reason }) and keeps its id.
   Shares the pipeline, hero, quote and letterhead styles in css/modules/functions.css (fn- classes). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/outings-data.js */
  const { STAGES, FLOW, CARD_FEE, PDF, today, addDays, daysBetween, round2, toMin, toHM, monthOf, paid, pkgOf, initialDeposit, sheet, slotList, closeHM, defaultWindow, makeQuote } = Club.shared.outings;

  const OPEN = ['Enquiry', 'Quoted'];
  const STAGE_KIND = { 'Enquiry': 'brass', 'Quoted': 'info', 'Deposit paid': 'warn', 'Confirmed': 'good', 'Completed': 'outline', 'Lost': 'bad' };
  const LOST_REASONS = ['Date not available', 'Chose another course', 'Over budget', 'Field too small', 'Event cancelled', 'No response after follow-up', 'Other'];
  const METHODS = ['Card', 'E-transfer', 'Cheque', 'Debit', 'Cash'];
  const SEASON = [5, 6, 7, 8, 9]; // May to September
  const MIN_PLAYERS = 16, MAX_PLAYERS = 144, SHOTGUN_MIN = 100;
  function money(v) { return fmt.money(v); }
  function dow(iso) { return fmt.toDate(iso).getDay(); }
  function taxLabel() { const r = Club.taxRate(); return Math.abs(r - 0.12) < 0.0001 ? 'GST 5% + PST 7%' : 'Taxes (' + (r * 100).toFixed(1).replace(/\.0$/, '') + '%)'; }
  function balance(o) { return o.quote ? round2(o.quote.total - paid(o)) : 0; }
  function stageSince(o) { const h = (o.history || []).filter(function (x) { return x.stage === o.stage; }).pop(); return h ? String(h.at).slice(0, 10) : String(o.createdAt || today()).slice(0, 10); }
  function daysInStage(o) { return Math.max(0, daysBetween(stageSince(o), today())); }
  function stageBadge(s) { return ui.badge(s, STAGE_KIND[s] || 'plain'); }
  function all() { return S.all('outings'); }
  function pkgs() { return S.where('outingPackages', function (p) { return p.kind === 'package'; }); }
  function addOnList() { return S.where('outingPackages', function (p) { return p.kind === 'addon'; }); }
  function suggestPkg(players) { return players <= 40 ? 'op_birdie' : players <= 99 ? 'op_eagle' : 'op_platinum'; }
  function validEmail(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function stamp() { return new Date().toISOString().slice(0, 19); }
  function monthName(m) { return new Date(2026, m - 1, 1).toLocaleDateString('en-CA', { month: 'long' }); }
  function typeKey(t) { return String(t || '').toLowerCase().replace(/[^a-z]+/g, '-'); }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Undo: every staff change runs through Club.accounting.undoRun (Club.undo; a tee sheet block released or written by the
     change comes back or goes away with it, and deposit receipts are reversed with a credit). Nothing about it is stored. */
  function undoRun(fn, o) { if (Club.accounting && Club.accounting.undoRun) return Club.accounting.undoRun(fn, o); const r = fn(); const m = typeof o.message === 'function' ? o.message(r) : o.message; if (m) ui.toast(m); return r; }
  function rerenderAfterUndo() { if (/^#\/(outings|teesheet)(\/|$)/.test(location.hash)) Club.app.render(); if (Club.app.refreshNav) Club.app.refreshNav(); }
  function undoOpts(message, undone, after) { return { message: message, undone: undone, after: function () { if (after) after(); else rerenderAfterUndo(); } }; }
  function bookedIn(date, start, end) {
    return S.where('teeTimes', function (t) { return t.date === date && t.status !== 'cancelled' && t.time >= start && t.time < end; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function blockOf(o) { return o && o.teeBlockId ? S.find('teeBlocks', o.teeBlockId) : null; }
  function releaseBlock(o) { if (o && o.teeBlockId && S.find('teeBlocks', o.teeBlockId)) S.remove('teeBlocks', o.teeBlockId); }
  function endLabel(t) { return t >= closeHM() ? 'close of play' : fmt.time(t); }
  function customLines(o) { return o.quote ? o.quote.lines.filter(function (l) { return l.ref === 'custom'; }) : []; }
  /* Enquiries members send from the members' portal (js/portal/outings.js) carry source 'portal', memberId, altDate (optional),
     formatPref ('Tee times' | 'Shotgun' | 'No preference') and packageUnsure (the package is the one that fits their numbers).
     Everything else is the shape this module saves, so every staff action works on them unchanged. */
  function fromPortal(o) { return !!o && o.source === 'portal'; }
  function portalBadge(o) { return fromPortal(o) ? '<span class="badge info ot-portal" title="Sent by a member from the members’ portal">Members’ portal</span>' : ''; }
  function memberOf(o) { return o && o.memberId ? S.find('members', o.memberId) : null; }

  /* ---------------- Rules check (from the tournament terms) ---------------- */
  function rulesFor(o, excludeId) {
    const warn = [], errors = [];
    const p = S.find('outingPackages', o.packageId); const m = o.date ? monthOf(o.date) : 0; const n = +o.players || 0;
    if (o.date && SEASON.indexOf(m) < 0) errors.push('Tournaments and outings run May to September. Choose a date in the golf season.');
    /* "Only available May and July" reads "only available May and July": only the first letter drops, month names keep theirs */
    if (p && m && SEASON.indexOf(m) >= 0 && (p.months || []).indexOf(m) < 0) warn.push(p.name + ': ' + p.availability.charAt(0).toLowerCase() + p.availability.slice(1) + '.');
    if (p && n && (n < p.minPlayers || n > p.maxPlayers)) {
      /* Name another package only when it really fits this many players (never the same one, never one that does not fit) */
      const alt = S.find('outingPackages', suggestPkg(n));
      warn.push(p.name + ' is for ' + p.minPlayers + ' to ' + p.maxPlayers + ' players.' + (alt && alt.id !== p.id && n >= alt.minPlayers && n <= alt.maxPlayers ? ' The ' + alt.name + ' fits ' + n + '.' : ''));
    }
    if (o.format === 'Shotgun') {
      if (n && n < SHOTGUN_MIN) warn.push('All shotgun events must have a minimum of 100 players or pay the equivalent course rental.');
      if (o.date && [2, 3, 4].indexOf(dow(o.date)) < 0) warn.push('Full field events are held Tuesday to Thursday with a 12:00 PM start, unless approved by the club.');
      else if (o.start && o.start !== '12:00') warn.push('Full field shotguns start at 12:00 PM unless approved by the club.');
      if (o.date) { const w = defaultWindow(o); const hit = bookedIn(o.date, w.start, w.end); if (hit.length) warn.push(hit.length + ' tee time' + (hit.length === 1 ? ' is' : 's are') + ' already booked between ' + fmt.time(w.start) + ' and ' + endLabel(w.end) + '.'); }
    } else if (o.start && o.start < '11:00' && n < 100) warn.push('Events under 100 players are subject to tee times beginning at 11 AM.');
    if (o.date && daysBetween(today(), o.date) < 56 && o.date >= today()) warn.push('F&B services must be arranged a minimum of 8 weeks before the event.');
    const same = o.date ? all().filter(function (x) { return x.id !== excludeId && x.date === o.date && x.stage !== 'Lost'; }) : [];
    if (same.length) warn.push('Also booked that day: ' + same.map(function (x) { return x.organization + ' (' + x.stage.toLowerCase() + ')'; }).join(', ') + '.');
    return { warn: warn, errors: errors };
  }
  function rulesHtml(r, okText) {
    let h = '';
    if (r.errors.length) h += '<div class="fn-warn ot-err" role="alert">' + Club.icon('alert') + '<div>' + r.errors.map(esc).join('<br>') + '</div></div>';
    if (r.warn.length) h += '<div class="fn-warn" role="status">' + Club.icon('alert') + '<div><strong>Check before quoting</strong><ul>' + r.warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div></div>';
    if (!h && okText) h = '<div class="fn-ok">' + Club.icon('check') + '<div>' + esc(okText) + '</div></div>';
    return h;
  }

  /* ---------------- Stage changes ---------------- */
  function setStage(o, stage, note, extra) {
    S.update('outings', o.id, Object.assign({ stage: stage, history: (o.history || []).concat([{ at: stamp(), stage: stage, note: note || '' }]) }, extra || {}));
  }
  function addNote(o, note, extra) { S.update('outings', o.id, Object.assign({ history: (o.history || []).concat([{ at: stamp(), stage: o.stage, note: note }]) }, extra || {})); }
  function moveTo(o, stage, done) {
    if (stage === o.stage) return;
    if (stage === 'Lost') return markLost(o, done);
    if (stage === 'Completed' && o.date > today()) return ui.toast('This outing has not been played yet. Mark it completed after ' + fmt.date(o.date), 'bad');
    if (stage === 'Deposit paid' && !(o.deposits || []).length) return recordDeposit(o, done);
    if (stage === 'Confirmed' && o.format === 'Shotgun' && !blockOf(o)) return confirmShotgun(o, done);
    const back = FLOW.indexOf(stage) < FLOW.indexOf(o.stage);
    const extra = {};
    if (stage === 'Quoted' && !o.quote) extra.quote = makeQuote(o);
    if (o.stage === 'Lost') extra.lostReason = null;
    let note = back ? 'Moved back from ' + o.stage.toLowerCase() : o.stage === 'Lost' ? 'Reopened' : { 'Quoted': 'Quote sent to ' + o.contactName, 'Confirmed': 'Agreement signed', 'Completed': 'Tournament completed', 'Enquiry': 'Back to enquiry', 'Deposit paid': 'Deposit on file' }[stage];
    const release = back && FLOW.indexOf(stage) < 3 && !!blockOf(o), was = o.stage;
    undoRun(function () {
      if (release) { releaseBlock(o); extra.teeBlockId = null; note += '. Tee sheet block released'; }
      setStage(o, stage, note, extra);
    }, undoOpts(o.organization + ' moved to ' + stage.toLowerCase() + (release ? '. Tee times released' : ''), o.organization + ' is back in ' + was.toLowerCase() + (release ? '. Tee times blocked again' : '')));
    if (done) done(o.id);
  }
  /** The stage an outing steps back to: the one before it in the pipeline, or for a lost outing the stage it was lost from. */
  function prevStage(o) {
    if (o.stage === 'Lost') { const h = (o.history || []).filter(function (x) { return x.stage !== 'Lost'; }).pop(); return h && FLOW.indexOf(h.stage) >= 0 ? h.stage : 'Enquiry'; }
    const i = FLOW.indexOf(o.stage); return i > 0 ? FLOW[i - 1] : null;
  }
  /** The step-back control's stage, or null (a lost enquiry is reopened with Reopen instead). */
  function backTo(o) { const p = prevStage(o); return o.stage === 'Lost' && p === 'Enquiry' ? null : p; }
  /** Move back one stage (always available on the card and the outing page). Stepping back past Confirmed releases the
      shotgun block; stepping a lost shotgun back to Confirmed blocks its saved window again. Payments stay on file. */
  function stepBack(o, done) {
    const to = prevStage(o); if (!to) return;
    const was = o.stage, release = !!blockOf(o) && FLOW.indexOf(to) < 3;
    const reblock = !blockOf(o) && was === 'Lost' && FLOW.indexOf(to) >= 3 && o.format === 'Shotgun' && !!o.blockStart && !!o.blockEnd;
    undoRun(function () {
      let note = 'Moved back from ' + was.toLowerCase();
      const extra = was === 'Lost' ? { lostReason: null } : {};
      if (release) { releaseBlock(o); extra.teeBlockId = null; note += '. Tee sheet block released'; }
      if (reblock) {
        const b = S.insert('teeBlocks', { date: o.date, start: o.blockStart, end: o.blockEnd, kind: 'shotgun', reason: o.organization + ' shotgun' });
        extra.teeBlockId = b.id; note += '. Tee sheet blocked ' + fmt.time(o.blockStart) + ' until ' + endLabel(o.blockEnd);
      }
      setStage(o, to, note, extra);
    }, undoOpts(o.organization + ' moved back to ' + to.toLowerCase() + (release ? '. Tee times released' : reblock ? '. Tee times blocked again' : ''),
      o.organization + ' is back in ' + was.toLowerCase() + (release ? '. Tee times blocked again' : reblock ? '. Tee times released' : '')));
    if (done) done(o.id);
  }
  function markLost(o, done) {
    const blk = blockOf(o);
    const body = '<form novalidate><p class="ink-2">Close <strong>' + esc(o.organization) + '</strong> and keep it on file.' + (blk ? ' The tee sheet block for ' + esc(fmt.dateShort(o.date)) + ' will be released.' : '') + '</p>' +
      ui.field({ label: 'Reason', name: 'reason', type: 'select', required: true, options: '<option value="">Choose a reason</option>' + ui.options(LOST_REASONS) }) +
      ui.field({ label: 'Note', name: 'note', type: 'textarea', placeholder: 'Anything worth remembering for next season' }) + '</form>';
    const m = ui.modal({ eyebrow: 'Group Outings', title: 'Mark as lost', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: blk ? 'Mark lost and release times' : 'Mark lost', kind: 'danger', onClick: function () {
      const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      const was = o.stage;
      undoRun(function () {
        releaseBlock(o);
        setStage(o, 'Lost', d.reason + (d.note ? '. ' + d.note : '') + (blk ? '. Tee sheet block released' : ''), { lostReason: d.reason, teeBlockId: null });
      }, undoOpts(o.organization + ' marked as lost' + (blk ? '. Tee times released' : ''), o.organization + ' is back in ' + was.toLowerCase() + (blk ? '. Tee times blocked again' : '')));
      if (done) done(o.id);
    } }] });
  }
  /** Confirm a shotgun: choose the tee sheet window, see who is already booked, then write the block. */
  function confirmShotgun(o, done, reblockOnly) {
    const w = { start: o.blockStart || defaultWindow(o).start, end: o.blockEnd || defaultWindow(o).end };
    const slots = slotList();
    const startOpts = slots.map(function (t) { return { value: t, label: fmt.time(t) }; });
    const endOpts = slots.map(function (t) { return { value: t, label: fmt.time(t) }; }).concat([{ value: closeHM(), label: 'Close of play' }]);
    const body = '<form novalidate class="ot-confirm"><p class="ink-2">' + esc(o.organization) + ' tees off at <strong>' + esc(fmt.time(o.start)) + '</strong> on ' + esc(fmt.dateLong(o.date)) + ' with ' + o.players + ' players. Block the tee sheet so no one is booked into the field.</p><div class="form-grid">' +
      ui.field({ label: 'Block from', name: 'start', type: 'select', options: ui.options(startOpts, w.start), hint: 'Groups need about 4.5 hours to clear the course ahead of a shotgun' }) +
      ui.field({ label: 'Until', name: 'end', type: 'select', options: ui.options(endOpts, w.end) }) +
      '</div><div class="ot-impact" aria-live="polite"></div></form>';
    const m = ui.modal({ eyebrow: o.organization, title: reblockOnly ? 'Block the tee sheet' : 'Confirm shotgun outing', size: 'lg', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: reblockOnly ? 'Block tee times' : 'Confirm and block tee times', kind: 'primary', icon: 'check', onClick: function () { return save(); } }] });
    const form = ui.$('form', m.body);
    function impact() {
      const hit = bookedIn(o.date, form.start.value, form.end.value);
      const blocks = S.where('teeBlocks', function (b) { return b.date === o.date && b.id !== o.teeBlockId && b.start < form.end.value && b.end > form.start.value; });
      let h = '';
      if (hit.length) h += '<div class="fn-warn">' + Club.icon('alert') + '<div><strong>' + hit.length + ' tee time' + (hit.length === 1 ? ' is' : 's are') + ' already booked in this window.</strong> They stay on the sheet; move or cancel them from the tee sheet.<ul>' + hit.slice(0, 6).map(function (t) { return '<li>' + esc(fmt.time(t.time)) + ', ' + (t.players || []).length + ' player' + ((t.players || []).length === 1 ? '' : 's') + (t.players && t.players[0] ? ' (' + esc(t.players[0].name || 'Guest') + ')' : '') + '</li>'; }).join('') + (hit.length > 6 ? '<li>and ' + (hit.length - 6) + ' more</li>' : '') + '</ul></div></div>';
      if (blocks.length) h += '<div class="fn-warn">' + Club.icon('alert') + '<div>Overlaps another block: ' + blocks.map(function (b) { return esc(b.reason + ', ' + fmt.time(b.start) + ' until ' + endLabel(b.end)); }).join('; ') + '.</div></div>';
      if (!h) h = '<div class="fn-ok">' + Club.icon('check') + '<div>No tee times are booked between ' + esc(fmt.time(form.start.value)) + ' and ' + esc(endLabel(form.end.value)) + '.</div></div>';
      ui.$('.ot-impact', form).innerHTML = h;
    }
    form.addEventListener('change', impact); impact();
    function save() {
      const s = form.start.value, e = form.end.value;
      ui.$$('.field-error', form).forEach(function (x) { x.remove(); });
      if (e <= s) { form.end.classList.add('invalid'); form.end.insertAdjacentHTML('afterend', '<span class="field-error">The block must end after it starts.</span>'); return false; }
      if (o.start < s || o.start >= e) { form.start.classList.add('invalid'); form.start.insertAdjacentHTML('afterend', '<span class="field-error">The window must include the ' + esc(fmt.time(o.start)) + ' start.</span>'); return false; }
      const fresh = S.find('outings', o.id), was = fresh.stage, had = !!blockOf(fresh), only = reblockOnly || fresh.stage === 'Confirmed';
      undoRun(function () {
        releaseBlock(fresh);
        const b = S.insert('teeBlocks', { date: fresh.date, start: s, end: e, kind: 'shotgun', reason: fresh.organization + ' shotgun' });
        const note = 'Tee sheet blocked ' + fmt.time(s) + ' until ' + endLabel(e);
        if (only) addNote(fresh, note, { teeBlockId: b.id, blockStart: s, blockEnd: e });
        else setStage(fresh, 'Confirmed', 'Agreement signed. ' + note, { teeBlockId: b.id, blockStart: s, blockEnd: e, lostReason: null });
      }, undoOpts(reblockOnly ? 'Tee times blocked on ' + fmt.dateShort(fresh.date) : fresh.organization + ' confirmed. Tee sheet blocked',
        (only ? 'Tee sheet block ' + (had ? 'put back as it was' : 'removed') : fresh.organization + ' is back in ' + was.toLowerCase() + '. Tee times released')));
      if (done) done(o.id);
    }
  }

  /* ---------------- Deposits ---------------- */
  /** A deposit without the cardholder name or expiry (older card deposits kept them); brand and last four stay. */
  function noCardDetails(d) {
    if (!d || (d.name === undefined && d.expMonth === undefined && d.expYear === undefined)) return d;
    const o = Object.assign({}, d); delete o.name; delete o.expMonth; delete o.expYear; return o;
  }
  function brandName(b) { const x = (Club.cards.brands || []).find(function (y) { return y.id === b; }); return x ? x.name : 'Card'; }
  /* Receipts for deposits and payments (source 'outings', refId the outing, card fee as its own line): made by Club.accounting
     (js/modules/accounting.js) so they count in that day's close; removing a payment record makes a credit receipt. */
  function depositReceipt(o, dep) {
    if (!Club.accounting || !Club.accounting.depositReceipt) return null;
    try { return Club.accounting.depositReceipt('outings', o, dep); } catch (e) { console.error('Deposit receipt failed for ' + (o && o.id), e); return null; }
  }
  function depositReceiptOf(o, dep) { return Club.accounting && Club.accounting.depositReceiptFor ? Club.accounting.depositReceiptFor('outings', o.id, dep.id) : null; }
  function depositLabel(d) {
    if (d.method === 'Card' && d.last4) return '<span class="fn-cardmark">' + Club.cards.mark(d.brand, 16) + '</span>' + esc(brandName(d.brand) + ' ending ' + d.last4);
    return esc(d.method + (d.reference ? ' · ' + d.reference : ''));
  }
  function recordDeposit(o, done) {
    const first = !(o.deposits || []).length;
    const suggested = first ? initialDeposit(o.players) : Math.max(0, balance(o));
    const body = '<form novalidate class="fn-dep-form"><p class="ink-2">' + (first ? 'The initial deposit is ' + money(initialDeposit(o.players)) + ' for ' + (o.players >= 100 ? '100 players or more' : 'under 100 players') + '. It is non-refundable and applied to the final invoice.' : 'Balance due ' + money(balance(o)) + '. Final payment is due within 30 days of the event.') + '</p><div class="form-grid">' +
      ui.field({ label: 'Amount', name: 'amount', type: 'number', min: 1, step: 0.01, value: suggested || '', required: true }) +
      ui.field({ label: 'Date received', name: 'date', type: 'date', value: today(), required: true }) +
      '</div><div class="field"><label>Payment method</label>' + ui.segmented(METHODS.map(function (x) { return { value: x, label: x }; }), 'Card', 'method') + '</div>' +
      '<div class="fn-dep-card"></div><p class="ot-fee muted fn-note"></p><div class="fn-dep-ref" hidden>' + ui.field({ label: 'Reference', name: 'reference', placeholder: 'Cheque number or transfer reference' }) + '</div>' +
      '<p class="muted fn-note">Only the card brand and last four digits are kept on file.</p></form>';
    const m = ui.modal({ eyebrow: o.organization, title: first ? 'Record initial deposit' : 'Record a payment', size: 'lg', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Record payment', kind: 'primary', icon: 'check', onClick: function () { return save(); } }] });
    const form = ui.$('form', m.body); let method = 'Card';
    const card = Club.cards.mount(ui.$('.fn-dep-card', form));
    function fee() { const a = +form.amount.value || 0; ui.$('.ot-fee', form).textContent = method === 'Card' && a > 0 ? 'A 2.5% processing fee of ' + money(round2(a * CARD_FEE)) + ' applies to card payments, for ' + money(round2(a * (1 + CARD_FEE))) + ' charged in all.' : ''; }
    form.amount.addEventListener('input', fee); fee();
    ui.on(form, 'click', '.segmented button', function (e, b) {
      method = b.dataset.value; ui.$$('.segmented button', form).forEach(function (x) { x.classList.toggle('active', x === b); });
      ui.$('.fn-dep-card', form).hidden = method !== 'Card'; ui.$('.fn-dep-ref', form).hidden = method === 'Card'; fee();
    });
    function save() {
      if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (!(d.amount > 0)) { form.amount.classList.add('invalid'); form.amount.insertAdjacentHTML('afterend', '<span class="field-error">Enter an amount above zero.</span>'); return false; }
      const dep = { id: S.uid('odep'), date: d.date, amount: round2(d.amount), method: method, last4: '' };
      if (method === 'Card') {
        const r = card.validate(); if (!r.ok) return false;
        dep.brand = r.card.brand; dep.last4 = r.card.last4; dep.fee = round2(dep.amount * CARD_FEE);   /* no saved cards: brand and last four only */
      } else if (d.reference) dep.reference = d.reference;
      const fresh = S.find('outings', o.id);
      const deps = (fresh.deposits || []).map(noCardDetails).concat([dep]);
      const note = money(dep.amount) + ' received by ' + (method === 'Card' ? brandName(dep.brand) + ' ending ' + dep.last4 + ' (plus ' + money(dep.fee) + ' processing fee)' : method.toLowerCase());
      const moved = FLOW.indexOf(fresh.stage) < 2 || fresh.stage === 'Lost', was = fresh.stage;
      undoRun(function () {
        if (moved) setStage(fresh, 'Deposit paid', note, { deposits: deps, lostReason: null, quote: fresh.quote || makeQuote(fresh) });
        else addNote(fresh, note, { deposits: deps });
        depositReceipt(S.find('outings', o.id), dep);
      }, undoOpts('Payment of ' + money(dep.amount) + ' recorded' + (moved ? '. Moved to deposit paid' : ''), 'Payment taken off with a credit receipt' + (moved ? '. Back in ' + was.toLowerCase() : '')));
      if (done) done(o.id);
    }
  }

  /* ---------------- Enquiry form ---------------- */
  function addOnsFieldHtml(sel, pkgId, players) {
    const groups = {};
    addOnList().forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });
    return Object.keys(groups).map(function (g) {
      return '<fieldset class="ot-ao-group"><legend class="label-caps">' + esc(g) + '</legend>' + groups[g].map(function (a) {
        const cur = (sel || []).find(function (x) { return x.id === a.id; });
        const allowed = !a.onlyFor || a.onlyFor.indexOf(pkgId) >= 0;
        return '<div class="ot-ao' + (allowed ? '' : ' off') + '"><label class="check"><input type="checkbox" data-ao="' + esc(a.id) + '"' + (cur && allowed ? ' checked' : '') + (allowed ? '' : ' disabled') + '><span>' + esc(a.name) + ' <span class="muted">' + money(a.price) + (a.unit === 'pp' ? '/pp' : a.unit === 'ticket' ? '/ticket' : ' each') + '</span></span></label>' +
          (a.unit !== 'pp' ? '<input class="input ot-ao-qty" type="number" min="0" step="1" data-aoq="' + esc(a.id) + '" value="' + esc(cur ? cur.qty : (players || 0) * (a.unit === 'ticket' ? 2 : 1)) + '" aria-label="' + esc(a.name) + ' quantity">' : '') +
          (a.desc ? '<span class="ot-ao-desc">' + esc(a.desc) + '</span>' : '') + '</div>';
      }).join('') + '</fieldset>';
    }).join('');
  }
  function readAddOns(root) {
    return ui.$$('input[data-ao]', root).filter(function (c) { return c.checked && !c.disabled; }).map(function (c) {
      const q = ui.$('[data-aoq="' + c.dataset.ao + '"]', root); const out = { id: c.dataset.ao }; if (q) out.qty = Math.max(0, Math.round(+q.value || 0)); return out;
    });
  }
  function openForm(existing, done) {
    const o = existing || { format: 'Tee times', start: '11:00', holes: 18, players: '', addOns: [] };
    const pkgOpts = pkgs().map(function (p) { return { value: p.id, label: p.name + ' · ' + p.minPlayers + ' to ' + p.maxPlayers + ' players · ' + money(p.perPlayer) + '/pp' }; });
    const body = '<form novalidate class="fn-form ot-form"><div class="form-grid">' +
      ui.field({ label: 'Organization', name: 'organization', value: o.organization || '', required: true, span2: true, placeholder: 'Company, charity or club' }) +
      ui.field({ label: 'Contact name', name: 'contactName', value: o.contactName || '', required: true }) +
      ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: o.phone || '', placeholder: '204-555-0123' }) +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: o.email || '', required: true, span2: true }) +
      ui.field({ label: 'Tournament date', name: 'date', type: 'date', value: o.date || '', required: true, hint: 'May to September' }) +
      ui.field({ label: 'Estimated players', name: 'players', type: 'number', min: MIN_PLAYERS, max: MAX_PLAYERS, value: o.players, required: true, hint: '16 to 144 players' }) +
      '<div class="field"><label>Format</label>' + ui.segmented([{ value: 'Tee times', label: 'Tee times' }, { value: 'Shotgun', label: 'Shotgun' }], o.format, 'format') + '</div>' +
      '<div class="field"><label>Holes</label>' + ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(o.holes || 18), 'holes') + '</div>' +
      ui.field({ label: 'Start time', name: 'start', type: 'time', value: o.start || '11:00', required: true }) +
      ui.field({ label: 'Package', name: 'packageId', type: 'select', options: ui.options(pkgOpts, o.packageId || 'op_birdie') }) +
      '</div><div class="field"><label>Food and beverage add-ons</label><div class="ot-aos">' + addOnsFieldHtml(o.addOns, o.packageId || 'op_birdie', o.players) + '</div><span class="field-hint">All pricing is surcharge inclusive. F&B must be arranged at least 8 weeks before the event.</span></div>' +
      ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: o.notes || '', placeholder: 'Prizes, hole sponsors, contests, special requests' }) +
      '<div class="ot-rules" aria-live="polite"></div></form>';
    const m = ui.modal({ eyebrow: 'Tournament & Corporate Services', title: existing ? 'Edit outing' : 'New outing enquiry', size: 'lg', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: existing ? 'Save outing' : 'Save enquiry', kind: 'primary', icon: 'check', onClick: function () { return save(); } }] });
    const form = ui.$('form', m.body);
    let format = o.format || 'Tee times', holes = +(o.holes || 18), pkgTouched = !!existing;
    function current() { return { date: form.date.value, players: +form.players.value || 0, format: format, start: form.start.value, holes: holes, packageId: form.packageId.value }; }
    function check() { ui.$('.ot-rules', form).innerHTML = rulesHtml(rulesFor(current(), existing && existing.id), form.date.value && form.players.value ? 'This outing fits the package and course policies.' : ''); }
    function redrawAddOns() { const sel = readAddOns(form); ui.$('.ot-aos', form).innerHTML = addOnsFieldHtml(sel.length ? sel : o.addOns, form.packageId.value, +form.players.value || 0); }
    ui.on(form, 'click', '.segmented button', function (e, b) {
      const seg = b.closest('.segmented'); ui.$$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); });
      if (seg.dataset.name === 'format') {
        format = b.dataset.value;
        if (format === 'Shotgun' && form.start.value === '11:00') form.start.value = '12:00';
        if (format === 'Tee times' && form.start.value === '12:00') form.start.value = '11:00';
        if (format === 'Shotgun' && !pkgTouched && (+form.players.value || 0) >= 100) form.packageId.value = 'op_platinum';
      } else holes = +b.dataset.value;
      check();
    });
    form.players.addEventListener('input', function () { const n = +form.players.value || 0; if (!pkgTouched && n) { form.packageId.value = suggestPkg(n); redrawAddOns(); } check(); });
    form.packageId.addEventListener('change', function () { pkgTouched = true; redrawAddOns(); check(); });
    form.addEventListener('change', function (e) { if (e.target.name === 'date' || e.target.name === 'start') check(); });
    check();
    function err(input, msg) { input.classList.add('invalid'); input.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
    function save() {
      if (!ui.validate(form)) return false;
      const d = ui.formData(form); let ok = true; const cur = current();
      if (!validEmail(d.email)) { err(form.email, 'Enter a valid email address.'); ok = false; }
      if (!(d.players >= MIN_PLAYERS && d.players <= MAX_PLAYERS)) { err(form.players, 'Packages are for 16 to 144 players.'); ok = false; }
      if (SEASON.indexOf(monthOf(d.date)) < 0) { err(form.date, 'Choose a date from May to September.'); ok = false; }
      else if (!existing && d.date < today()) { err(form.date, 'Choose an upcoming date.'); ok = false; }
      if (!ok) { const f1 = ui.$('.invalid', form); if (f1) f1.focus(); return false; }
      const doc = { organization: d.organization, contactName: d.contactName, email: d.email, phone: d.phone, date: d.date, players: d.players, format: cur.format, start: d.start, holes: cur.holes, packageId: d.packageId, addOns: readAddOns(form), notes: d.notes };
      let id;
      if (existing) undoRun(function () {
        const blk = blockOf(existing); const patch = Object.assign({}, doc);
        if (existing.quote) patch.quote = makeQuote(Object.assign({}, existing, doc), customLines(existing));
        if (existing.packageUnsure && doc.packageId !== existing.packageId) patch.packageUnsure = false;
        let extraNote = '';
        if (blk && doc.format !== 'Shotgun') { releaseBlock(existing); patch.teeBlockId = null; extraNote = 'Changed to tee times. Tee sheet block released'; }
        else if (blk && (doc.date !== existing.date || doc.start !== existing.start || doc.holes !== existing.holes)) {
          const w = defaultWindow(doc); S.update('teeBlocks', blk.id, { date: doc.date, start: w.start, end: w.end, reason: doc.organization + ' shotgun' });
          patch.blockStart = w.start; patch.blockEnd = w.end; extraNote = 'Tee sheet block moved to ' + fmt.dateShort(doc.date) + ', ' + fmt.time(w.start) + ' until ' + endLabel(w.end);
        } else if (blk && doc.organization !== existing.organization) S.update('teeBlocks', blk.id, { reason: doc.organization + ' shotgun' });
        if (extraNote) patch.history = (existing.history || []).concat([{ at: stamp(), stage: existing.stage, note: extraNote }]);
        S.update('outings', existing.id, patch); id = existing.id;
        return extraNote;
      }, undoOpts(function (extraNote) { return extraNote ? 'Outing saved. ' + extraNote : 'Outing saved'; }, 'Outing details put back as they were'));
      else {
        const n = undoRun(function () {
          return S.insert('outings', Object.assign(doc, { stage: 'Enquiry', quote: null, deposits: [], teeBlockId: null, roster: [], buffet: null, bar: '', history: [{ at: stamp(), stage: 'Enquiry', note: 'Enquiry taken by the golf shop' }] }));
        }, undoOpts('Enquiry saved for ' + d.organization, 'Enquiry removed', function () { if (location.hash.indexOf('#/outings/') === 0) Club.app.go('outings'); else rerenderAfterUndo(); }));
        id = n.id;
      }
      if (done) done(id);
    }
  }

  /* ---------------- FLIP ---------------- */
  function flip(root, mutate, movedId) {
    const before = {};
    ui.$$('[data-flip]', root).forEach(function (n) { before[n.dataset.flip] = n.getBoundingClientRect(); });
    mutate();
    if (reduce) return;
    ui.$$('[data-flip]', root).forEach(function (n) {
      const a = before[n.dataset.flip]; const b = n.getBoundingClientRect();
      if (!a) return;
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: n.dataset.flip === movedId ? 560 : 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    });
  }

  /* ---------------- Main page ---------------- */
  let mainTab = 'pipeline', showClosed = false, statsHost = null;
  function upcomingSeason() { const t = today(); return monthOf(t) >= 10 ? +t.slice(0, 4) + 1 : +t.slice(0, 4); }
  function statsHtml() {
    const t = today(), os = all();
    const open = os.filter(function (o) { return OPEN.indexOf(o.stage) >= 0; });
    const booked = os.filter(function (o) { return (o.stage === 'Deposit paid' || o.stage === 'Confirmed') && o.date >= t; });
    const held = os.filter(function (o) { return o.stage !== 'Lost' && o.stage !== 'Completed'; }).reduce(function (s, o) { return s + paid(o); }, 0);
    const next = booked.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    return ui.stats([
      { label: 'Open enquiries', value: open.length, meta: os.filter(function (o) { return o.stage === 'Enquiry'; }).length + ' new, ' + os.filter(function (o) { return o.stage === 'Quoted'; }).length + ' quoted' + (function (n) { return n ? ', ' + n + ' from the members’ portal' : ''; })(os.filter(function (o) { return o.stage === 'Enquiry' && fromPortal(o); }).length) },
      { label: 'Booked for ' + upcomingSeason(), value: booked.length, meta: booked.reduce(function (s, o) { return s + (+o.players || 0); }, 0) + ' players, ' + booked.filter(function (o) { return o.format === 'Shotgun'; }).length + ' shotgun' },
      { label: 'Deposits held', value: Math.round(held), prefix: '$', meta: 'Applied to final invoices' },
      { label: 'Next outing', value: next ? fmt.dateShort(next.date) : 'None booked', meta: next ? '<a href="#/outings/' + esc(next.id) + '">' + esc(next.organization) + '</a>' : 'The season is wide open' }
    ]);
  }
  function refreshStats() { if (statsHost && document.body.contains(statsHost)) { statsHost.innerHTML = statsHtml(); ui.$$('[data-reveal]', statsHost).forEach(function (n) { n.classList.add('revealed'); }); ui.countUp(statsHost); } }

  function cardHtml(o, reveal) {
    const idx = FLOW.indexOf(o.stage); const d = daysInStage(o);
    const prev = backTo(o);
    let next = o.stage === 'Lost' ? null : FLOW[idx + 1];
    if (next === 'Completed' && o.date > today()) next = null;
    const p = pkgOf(o);
    return '<article class="fn-card t-' + typeKey(o.format) + '" data-flip="' + esc(o.id) + '"' + (reveal ? ' data-reveal' : '') + '>' +
      '<a class="fn-card-main" href="#/outings/' + esc(o.id) + '">' +
        '<div class="fn-card-top"><span class="fn-type">' + esc((p ? p.short : 'Custom') + ' · ' + o.format) + '</span><span class="fn-days' + (d > 10 && OPEN.indexOf(o.stage) >= 0 ? ' stale' : '') + '" title="Days in this stage">' + (d === 0 ? 'Today' : d + 'd') + '</span></div>' +
        '<h4 class="fn-card-name">' + esc(o.organization) + '</h4>' +
        (fromPortal(o) ? '<div class="ot-card-src">' + portalBadge(o) + '</div>' : '') +
        '<div class="fn-card-meta"><span>' + Club.icon('calendar') + esc(fmt.weekday(o.date) + ' ' + fmt.date(o.date)) + '</span><span>' + Club.icon('members') + o.players + ' players</span></div>' +
        (o.stage === 'Lost' ? '<div class="fn-card-lost">' + esc(o.lostReason || 'Closed') + '</div>' : o.quote ? '<div class="fn-card-total"><span class="serif">' + fmt.money0(o.quote.total) + '</span>' + (paid(o) ? '<span class="muted">' + fmt.money0(paid(o)) + ' paid</span>' : '') + '</div>' : '') +
        (blockOf(o) ? '<div class="fn-card-tour">' + Club.icon('teesheet') + 'Tee sheet blocked from ' + esc(fmt.time(blockOf(o).start)) + '</div>' : '') +
      '</a><div class="fn-card-moves">' +
        (prev ? '<button type="button" class="fn-move" data-back="' + esc(o.id) + '" title="Move back to ' + esc(prev.toLowerCase()) + '" aria-label="Move back to ' + esc(prev.toLowerCase()) + '">' + Club.icon('chevronLeft') + '</button>' : '<span></span>') +
        (o.stage === 'Lost' ? '<button type="button" class="fn-move fn-move-text" data-move="Enquiry" data-id="' + esc(o.id) + '">' + Club.icon('refresh') + '<span>Reopen</span></button>'
          : o.stage !== 'Completed' ? '<button type="button" class="fn-move fn-move-lost" data-move="Lost" data-id="' + esc(o.id) + '" title="Mark as lost" aria-label="Mark as lost">' + Club.icon('close') + '</button>' : '<span></span>') +
        (o.stage === 'Lost' ? '' : next ? '<button type="button" class="fn-move fn-move-next" data-move="' + esc(next) + '" data-id="' + esc(o.id) + '" title="Move to ' + esc(next.toLowerCase()) + '" aria-label="Move to ' + esc(next.toLowerCase()) + '"><span>' + esc(next) + '</span>' + Club.icon('chevronRight') + '</button>' : '<span></span>') +
      '</div></article>';
  }
  function boardHtml(reveal) {
    const os = all();
    const cols = STAGES.filter(function (s) { return showClosed || (s !== 'Completed' && s !== 'Lost'); });
    return '<div class="fn-board" style="--cols:' + cols.length + '">' + cols.map(function (st) {
      const list = os.filter(function (o) { return o.stage === st; }).sort(function (a, b) { return st === 'Completed' || st === 'Lost' ? (a.date < b.date ? 1 : -1) : (a.date < b.date ? -1 : 1); });
      const value = list.reduce(function (s, o) { return s + (o.quote ? o.quote.total : 0); }, 0);
      return '<section class="fn-col s-' + typeKey(st) + '" aria-label="' + esc(st) + '"><header class="fn-col-head"><div><span class="label-caps">' + esc(st) + '</span><span class="fn-col-count">' + list.length + '</span></div>' + (value ? '<span class="fn-col-value">' + fmt.money0(value) + '</span>' : '') + '</header>' +
        '<div class="fn-col-body">' + (list.length ? list.map(function (o) { return cardHtml(o, reveal); }).join('') : '<p class="fn-col-empty">' + esc({ 'Enquiry': 'New enquiries land here.', 'Quoted': 'No quotes out.', 'Deposit paid': 'No dates on hold.', 'Confirmed': 'Nothing confirmed yet.', 'Completed': 'No outings played yet.', 'Lost': 'Nothing lost so far.' }[st]) + '</p>') + '</div></section>';
    }).join('') + '</div>';
  }
  function renderPipeline(panel) {
    panel.innerHTML = '<div class="fn-toolbar"><p class="muted fn-hint">Confirming a shotgun outing blocks the tee sheet. Moving it back or marking it lost releases the times.</p>' +
      '<label class="check"><input type="checkbox" class="fn-closed"' + (showClosed ? ' checked' : '') + '> Show completed and lost</label></div><div class="fn-board-host">' + boardHtml(true) + '</div>';
    const host = ui.$('.fn-board-host', panel);
    ui.$('.fn-closed', panel).addEventListener('change', function (e) { showClosed = e.target.checked; host.innerHTML = boardHtml(true); ui.animateIn(host); });
    function moved(id) {
      flip(host, function () { host.innerHTML = boardHtml(false); }, id);
      const c = ui.$('[data-flip="' + id + '"]', host); if (c) { c.classList.add('fn-moved'); c.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
      refreshStats();
    }
    ui.on(panel, 'click', '[data-back]', function (e, b) { const o = S.find('outings', b.dataset.back); if (o) stepBack(o, moved); });
    ui.on(panel, 'click', '[data-move]', function (e, b) {
      const o = S.find('outings', b.dataset.id); if (!o) return;
      const go = function () { moveTo(o, b.dataset.move, moved); };
      if (blockOf(o) && FLOW.indexOf(b.dataset.move) >= 0 && FLOW.indexOf(b.dataset.move) < 3) {
        ui.confirm({ title: 'Release the tee sheet block?', text: 'Moving ' + o.organization + ' back to ' + b.dataset.move.toLowerCase() + ' releases the shotgun block on ' + fmt.dateShort(o.date) + ' so those times can be booked again.', confirmLabel: 'Move and release times', danger: true }).then(function (ok) { if (ok) go(); });
      } else go();
    });
  }

  function renderPackages(panel) {
    const list = pkgs(); const groups = {};
    addOnList().forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });
    panel.innerHTML = '<div class="fn-pkg-intro" data-reveal><p class="serif fn-flavour">' + esc(PDF.blurb) + '</p></div>' +
      '<div class="fn-pkgs ot-pkgs">' + list.map(function (p) {
        const used = all().filter(function (o) { return o.packageId === p.id && o.stage !== 'Lost'; }).length;
        return '<article class="panel fn-pkg" data-reveal><div class="fn-pkg-head"><span class="eyebrow">' + p.minPlayers + (p.id === 'op_platinum' ? '+ players' : ' to ' + p.maxPlayers + ' players') + '</span>' + ui.badge(p.format, p.format === 'Shotgun' ? 'dark' : 'outline') + '</div>' +
          '<h3>' + esc(p.name) + '</h3><div class="fn-pkg-price"><span class="serif">' + fmt.money0(p.perPlayer) + '</span><span class="muted">per player</span></div>' +
          '<p class="ot-avail">' + esc(p.availability) + '</p>' +
          '<ul class="fn-pkg-list">' + p.includes.map(function (x) { return '<li>' + Club.icon('check') + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' +
          '<div class="fn-pkg-foot"><span class="muted">' + used + ' outing' + (used === 1 ? '' : 's') + ' on this package</span><span class="muted">Deposit ' + fmt.money0(initialDeposit(p.minPlayers)) + '</span></div></article>';
      }).join('') + '</div><p class="muted fn-note ot-surcharge" data-reveal>All pricing is surcharge inclusive. From the club\'s 2026 tournament package.</p>' +
      '<div class="grid grid-2 ot-menus">' +
        '<div class="panel" data-reveal><div class="panel-head"><div><h3>Build your own buffet</h3><div class="person-sub">Included in the Eagle and Platinum packages</div></div></div><div class="panel-body"><p class="ink-2 ot-small">' + esc(PDF.buffet.includes) + '. Add a carvery for $6.00 per person.</p>' +
          [['Salads', 'salad', 'Choose 1'], ['Hot items', 'hot', 'Choose 2'], ['Vegetables', 'vegetable', 'Choose 1'], ['Starch', 'starch', 'Choose 1'], ['Carvery', 'carvery', 'Additional $6.00/pp']].map(function (g) { return '<div class="ot-menu-group"><div class="row between"><span class="label-caps">' + g[0] + '</span><span class="muted ot-small">' + g[2] + '</span></div><p>' + esc(PDF.buffet[g[1]].join(', ')) + '</p></div>'; }).join('') +
        '</div></div>' +
        '<div class="panel" data-reveal><div class="panel-head"><div><h3>Food and beverage add-ons</h3><div class="person-sub">Arrange at least 8 weeks before the event</div></div></div><div class="panel-body flush"><ul class="list ot-ao-list">' +
          Object.keys(groups).map(function (g) { return '<li class="ot-ao-head"><span class="label-caps">' + esc(g) + '</span></li>' + groups[g].map(function (a) { return '<li><div style="flex:1;min-width:0"><div class="person-name">' + esc(a.name) + '</div>' + (a.desc ? '<div class="person-sub">' + esc(a.desc) + '</div>' : '') + '</div><span class="num nowrap">' + money(a.price) + '<span class="muted">' + (a.unit === 'pp' ? '/pp' : a.unit === 'ticket' ? '/ticket' : ' each') + '</span></span></li>'; }).join(''); }).join('') +
        '</ul></div></div></div>' +
      '<div class="panel ot-terms" data-reveal><div class="panel-head"><h3>Tournament terms and conditions</h3><span class="muted">2026 tournament agreement</span></div><div class="panel-body"><dl>' +
        PDF.terms.map(function (t) { return '<div><dt>' + esc(t[0]) + '</dt><dd>' + esc(t[1]) + '</dd></div>'; }).join('') + '</dl></div></div>' +
      '<div class="ot-contacts" data-reveal>' + PDF.contacts.map(function (c) { return ui.person(c.name, esc(c.title + ' · ' + Club.info.phone + ' ext. ' + c.ext + ' · ' + c.email)); }).join('') + '</div>';
  }

  function renderMain(view) {
    view.innerHTML = ui.pageHeader({ eyebrow: 'Golf · Tournament & Corporate Services', title: 'Group Outings', subtitle: 'Packages for groups of all sizes. Less than 4 km from Portage and Main, so your participants can play without taking the whole day off to travel.', actions: ui.btn('New enquiry', { kind: 'primary', icon: 'plus', action: 'new' }) }) +
      '<div class="fn-stats"></div><div class="ot-tabs"></div>';
    statsHost = ui.$('.fn-stats', view); statsHost.innerHTML = statsHtml();
    ui.tabs(ui.$('.ot-tabs', view), [
      { id: 'pipeline', label: 'Pipeline', render: renderPipeline },
      { id: 'season', label: 'Season', render: renderSeason },
      { id: 'packages', label: 'Packages', render: renderPackages }
    ], mainTab, function (id) { mainTab = id; });
    ui.on(view, 'click', '[data-action=new]', function () { openForm(null, function (id) { Club.app.go('outings/' + id); }); });
  }
  /* Season at a glance: every outing by date, May to September. */
  function renderSeason(panel) {
    const os = all().filter(function (o) { return o.stage !== 'Lost'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!os.length) { panel.innerHTML = ui.empty({ icon: 'trophy', title: 'No outings yet', text: 'Enquiries from companies, charities and sports clubs will show here by date.', action: ui.btn('New enquiry', { kind: 'primary', icon: 'plus', action: 'new' }) }); return; }
    const years = {};
    os.forEach(function (o) { (years[o.date.slice(0, 4)] = years[o.date.slice(0, 4)] || []).push(o); });
    panel.innerHTML = Object.keys(years).sort().reverse().map(function (y) {
      const rows = years[y]; const players = rows.reduce(function (s, o) { return s + (+o.players || 0); }, 0);
      return '<div class="panel ot-season" data-reveal><div class="panel-head"><h3>' + y + ' season</h3><span class="muted">' + rows.length + ' outings · ' + players + ' players</span></div><div class="panel-body flush"><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Organization</th><th>Format</th><th class="num">Players</th><th>Stage</th><th class="num">Total</th></tr></thead><tbody>' +
        rows.map(function (o) { return '<tr class="clickable" data-href="outings/' + esc(o.id) + '"><td class="nowrap">' + esc(fmt.weekday(o.date) + ' ' + fmt.date(o.date)) + '</td><td class="primary-cell">' + esc(o.organization) + (fromPortal(o) ? ' ' + portalBadge(o) : '') + '</td><td>' + esc(o.format + ' · ' + fmt.time(o.start)) + '</td><td class="num">' + o.players + '</td><td>' + stageBadge(o.stage) + '</td><td class="num">' + (o.quote ? fmt.money0(o.quote.total) : '<span class="muted">No quote</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div></div>';
    }).join('');
    ui.on(panel, 'click', 'tr[data-href]', function (e, tr) { Club.app.go(tr.dataset.href); });
  }

  /* ---------------- Detail ---------------- */
  let detailTab = 'overview';
  function stepperHtml(o) {
    const idx = FLOW.indexOf(o.stage);
    return '<ol class="fn-steps' + (o.stage === 'Lost' ? ' lost' : '') + '">' + FLOW.map(function (s, i) {
      const h = (o.history || []).filter(function (x) { return x.stage === s; }).pop();
      const st = o.stage === 'Lost' ? (h ? 'done' : '') : i < idx ? 'done' : i === idx ? 'current' : '';
      return '<li class="' + st + '"><span class="fn-step-dot">' + (st === 'done' ? Club.icon('check') : '') + '</span><span class="fn-step-label">' + esc(s) + '</span>' + (h ? '<span class="fn-step-date">' + esc(fmt.dateShort(h.at.slice(0, 10))) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function heroHtml(o) {
    const d = fmt.toDate(o.date); const p = pkgOf(o);
    return '<section class="fn-hero t-' + typeKey(o.format) + (o.stage === 'Lost' ? ' is-lost' : '') + '" data-reveal><div class="fn-hero-inner">' +
      '<div class="fn-hero-badge">' + stageBadge(o.stage) + portalBadge(o) + '</div>' +
      '<div class="eyebrow">' + esc((p ? p.name : 'Custom package') + ' · ' + o.format) + '</div>' +
      '<h1 class="fn-hero-title">' + esc(o.organization) + '</h1>' +
      '<div class="flourish fn-hero-flourish">' + Club.icon('flag') + '</div>' +
      '<div class="fn-hero-date"><span class="fn-hero-wd">' + esc(d.toLocaleDateString('en-CA', { weekday: 'long' })) + '</span><span class="fn-hero-day">' + d.getDate() + '</span><span class="fn-hero-month">' + esc(d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })) + '</span></div>' +
      '<div class="fn-hero-meta"><span>' + Club.icon('clock') + esc((o.format === 'Shotgun' ? 'Shotgun at ' : 'First tee time ') + fmt.time(o.start)) + '</span><span>' + Club.icon('members') + o.players + ' players</span><span>' + Club.icon('flag') + o.holes + ' holes</span><span>' + Club.icon('calendar') + esc(fmt.relative(o.date)) + '</span></div>' +
      (o.stage === 'Lost' ? '<p class="fn-hero-lost">Closed as lost: ' + esc(o.lostReason || 'no reason given') + '</p>' : '') + '</div></section>';
  }
  function actionsHtml(o) {
    const idx = FLOW.indexOf(o.stage); let next = o.stage === 'Lost' ? null : FLOW[idx + 1];
    if (next === 'Completed' && o.date > today()) next = null;
    let a = '';
    const prev = backTo(o);
    if (prev) a += ui.btn('Move back to ' + prev.toLowerCase(), { kind: 'ghost', icon: 'chevronLeft', action: 'back' });
    if (o.stage === 'Lost') a += ui.btn('Reopen', { icon: 'refresh', action: 'reopen', kind: 'primary' });
    else if (next) a += ui.btn(next === 'Confirmed' && o.format === 'Shotgun' ? 'Confirm and block tee sheet' : 'Move to ' + next.toLowerCase(), { kind: 'primary', icon: 'chevronRight', action: 'advance' });
    if (o.stage !== 'Completed' && o.stage !== 'Lost') a += ui.btn('Mark lost', { kind: 'danger', action: 'lost' });
    a += ui.btn('', { kind: 'ghost', icon: 'trash', action: 'delete', title: 'Delete outing' });
    return a;
  }
  function sideHtml(o) {
    const blk = blockOf(o); const hist = (o.history || []).slice().reverse();
    const w = blk ? { start: blk.start, end: blk.end } : defaultWindow(o);
    const hit = o.format === 'Shotgun' ? bookedIn(o.date, w.start, w.end) : [];
    let tee = '';
    if (o.format === 'Shotgun') {
      if (blk) tee = '<div class="ot-block on">' + Club.icon('teesheet') + '<div><strong>Tee sheet blocked</strong><div class="muted">' + esc(fmt.time(blk.start) + ' until ' + endLabel(blk.end)) + ' · ' + esc(blk.reason) + '</div></div></div>';
      else if (o.stage === 'Confirmed' || o.stage === 'Completed') tee = '<div class="ot-block missing">' + Club.icon('alert') + '<div><strong>No tee sheet block</strong><div class="muted">The block was removed from the tee sheet.</div>' + (o.stage === 'Confirmed' ? ui.btn('Block tee sheet', { sm: true, kind: 'primary', action: 'reblock' }) : '') + '</div></div>';
      else tee = '<div class="ot-block">' + Club.icon('teesheet') + '<div><strong>Not blocked yet</strong><div class="muted">Confirming blocks ' + esc(fmt.time(w.start) + ' until ' + endLabel(w.end)) + '.</div></div></div>';
      if (hit.length && o.stage !== 'Completed') tee += '<div class="fn-warn">' + Club.icon('alert') + '<div>' + hit.length + ' tee time' + (hit.length === 1 ? ' is' : 's are') + ' booked in this window.</div></div>';
    } else tee = '<div class="ot-block">' + Club.icon('teesheet') + '<div><strong>Tee times from ' + esc(fmt.time(o.start)) + '</strong><div class="muted">Tee time events do not have sole use of the course. Reserve the groups on the tee sheet.</div></div></div>';
    return '<div class="panel" data-reveal><div class="panel-head"><h3>Contact</h3>' + ui.btn('', { kind: 'ghost', sm: true, icon: 'edit', action: 'edit', title: 'Edit outing' }) + '</div><div class="panel-body">' +
        ui.person(o.contactName, esc(o.organization), 'lg') + '<dl class="kv fn-kv">' + (o.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></dd>' : '') + (o.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></dd>' : '') +
        (function (mb) { return mb ? '<dt>Member</dt><dd><a href="#/members/' + esc(mb.id) + '">' + esc(mb.firstName + ' ' + mb.lastName) + '</a> <span class="muted">#' + esc(mb.memberNo) + '</span></dd>' : ''; })(memberOf(o)) +
        (fromPortal(o) ? '<dt>Source</dt><dd>' + portalBadge(o) + '</dd>' : '') +
        '<dt>In stage</dt><dd>' + daysInStage(o) + ' day' + (daysInStage(o) === 1 ? '' : 's') + '</dd></dl></div></div>' +
      '<div class="panel" data-reveal><div class="panel-head"><h3>Tee sheet</h3><a class="btn btn-sm" href="#/teesheet/' + esc(o.date) + '">' + Club.icon('teesheet') + '<span>Open day</span></a></div><div class="panel-body stack ot-tee">' + tee + '</div></div>' +
      '<div class="panel" data-reveal><div class="panel-head"><h3>Timeline</h3><span class="muted">' + hist.length + ' updates</span></div><div class="panel-body"><ol class="fn-timeline">' +
        hist.map(function (h, i) { return '<li class="' + (i === 0 ? 'latest' : '') + '"><span class="fn-tl-dot"></span><div><div class="fn-tl-head">' + stageBadge(h.stage) + '<span class="muted">' + esc(fmt.date(h.at.slice(0, 10))) + '</span></div><p>' + esc(h.note || '') + '</p></div></li>'; }).join('') + '</ol></div></div>';
  }

  function overviewTab(o, refresh) {
    return function (panel) {
      const p = pkgOf(o); const r = rulesFor(o, o.id);
      const b = o.buffet || { salad: '', hot: ['', ''], vegetable: '', starch: '', carvery: '' };
      const opt = function (list, v, ph) { return '<option value="">' + esc(ph) + '</option>' + ui.options(list, v); };
      const fbChosen = [b.salad, (b.hot || [])[0], (b.hot || [])[1], b.vegetable, b.starch, b.carvery, o.bar].filter(Boolean);
      panel.innerHTML = '<div class="stack">' +
        (r.warn.length || r.errors.length ? '<div data-reveal>' + rulesHtml(r) + '</div>' : '') +
        '<div class="panel" data-reveal><div class="panel-head"><h3>Outing details</h3>' + ui.btn('Edit', { sm: true, icon: 'edit', action: 'edit' }) + '</div><div class="panel-body"><dl class="kv fn-kv">' +
          '<dt>Date</dt><dd>' + esc(fmt.dateLong(o.date)) + '</dd>' + (o.altDate ? '<dt>Alternate date</dt><dd>' + esc(fmt.dateLong(o.altDate)) + '</dd>' : '') + '<dt>Format</dt><dd>' + esc(o.format + ', ' + o.holes + ' holes, ' + (o.format === 'Shotgun' ? 'shotgun at ' : 'tee times from ') + fmt.time(o.start)) + (o.formatPref === 'No preference' ? ' <span class="muted">· the member has no preference</span>' : '') + '</dd><dt>Players</dt><dd>' + o.players + '</dd>' +
          '<dt>Package</dt><dd>' + (p ? esc(p.name) + ' <span class="muted">· ' + money(p.perPlayer) + '/pp · ' + esc(p.includesText) + '</span>' + (o.packageUnsure ? ' <span class="muted">· suggested for ' + o.players + ' players, the member was not sure</span>' : '') : '<span class="muted">None</span>') + '</dd>' +
          '<dt>Add-ons</dt><dd>' + ((o.addOns || []).length ? (o.addOns || []).map(function (a) { const ao = S.find('outingPackages', a.id); return ao ? esc(ao.name + (ao.unit !== 'pp' ? ' × ' + (a.qty || 0) : '')) : ''; }).filter(Boolean).join(', ') : '<span class="muted">None</span>') + '</dd>' +
          '<dt>Notes</dt><dd>' + (o.notes ? esc(o.notes) : '<span class="muted">None</span>') + '</dd></dl></div></div>' +
        '<div class="ot-fb" data-reveal>' + Portal.accordion({ id: 'ot-fb-' + o.id, icon: 'dining', title: 'F&B arrangements', open: false,
          summary: (fbChosen.length ? fbChosen.join(', ') : 'Not submitted yet') + (daysBetween(today(), o.date) >= 0 ? ' · due ' + fmt.date(addDays(o.date, -56)) : ''),
          body: '<p class="muted ot-small ot-fb-note">Submit a minimum of 8 weeks before the event.</p>' +
          (p && p.buffet ? '<form class="ot-buffet" novalidate><p class="ink-2 ot-small">Build your own buffet: ' + esc(PDF.buffet.includes) + '.</p><div class="form-grid">' +
            ui.field({ label: 'Salad (choose 1)', name: 'salad', type: 'select', options: opt(PDF.buffet.salad, b.salad, 'Choose a salad') }) +
            ui.field({ label: 'Vegetable (choose 1)', name: 'vegetable', type: 'select', options: opt(PDF.buffet.vegetable, b.vegetable, 'Choose a vegetable') }) +
            ui.field({ label: 'Hot item 1', name: 'hot1', type: 'select', options: opt(PDF.buffet.hot, (b.hot || [])[0], 'Choose a hot item') }) +
            ui.field({ label: 'Hot item 2', name: 'hot2', type: 'select', options: opt(PDF.buffet.hot, (b.hot || [])[1], 'Choose a hot item') }) +
            ui.field({ label: 'Starch (choose 1)', name: 'starch', type: 'select', options: opt(PDF.buffet.starch, b.starch, 'Choose a starch') }) +
            ui.field({ label: 'Carvery (add $6.00/pp)', name: 'carvery', type: 'select', options: opt(PDF.buffet.carvery, b.carvery, 'No carvery') }) +
            '</div>' : '<form class="ot-buffet" novalidate><p class="ink-2 ot-small">' + esc(p ? p.name + ' includes a ' + p.meal.toLowerCase() + ': choice of all beef hotdog or CAB burger and a bottled Pepsi beverage.' : 'Choose a package to plan the meal.') + '</p>') +
          ui.field({ label: 'Bar service', name: 'bar', type: 'select', options: opt(PDF.bar, o.bar, 'Not chosen yet') }) +
          '<div class="row" style="justify-content:flex-end">' + ui.btn('Save F&B', { sm: true, kind: 'primary', action: 'save-fb' }) + '</div></form>' }) + '</div>' +
        '</div>';
      ui.on(panel, 'click', '[data-action=save-fb]', function () {
        const form = ui.$('.ot-buffet', panel); const d = ui.formData(form); const patch = { bar: d.bar || '' };
        if (p && p.buffet) {
          if (d.hot1 && d.hot1 === d.hot2) { form.hot2.classList.add('invalid'); return ui.toast('Choose two different hot items', 'bad'); }
          patch.buffet = { salad: d.salad, hot: [d.hot1, d.hot2], vegetable: d.vegetable, starch: d.starch, carvery: d.carvery };
          const hasCarvery = (o.addOns || []).some(function (a) { return a.id === 'ao_carvery'; });
          if (d.carvery && !hasCarvery) patch.addOns = (o.addOns || []).concat([{ id: 'ao_carvery' }]);
          if (!d.carvery && hasCarvery) patch.addOns = (o.addOns || []).filter(function (a) { return a.id !== 'ao_carvery'; });
          if (patch.addOns && o.quote) patch.quote = makeQuote(Object.assign({}, o, { addOns: patch.addOns }), customLines(o));
        }
        undoRun(function () { S.update('outings', o.id, patch); }, undoOpts(patch.addOns ? 'F&B saved. Quote updated for the carvery' : 'F&B arrangements saved', 'F&B put back as it was'));
        refresh('overview');
      });
    };
  }

  function quoteTab(o, refresh) {
    return function (panel) {
      let extra = customLines(o).map(function (l) { return Object.assign({}, l); });
      let addOns = (o.addOns || []).map(function (a) { return Object.assign({}, a); });
      function draft() { return makeQuote(Object.assign({}, o, { addOns: addOns }), extra); }
      function draw() {
        const q = draft(); const p = pkgOf(o);
        panel.innerHTML = '<div class="panel" data-reveal><div class="panel-head"><div><h3>Quote</h3><div class="person-sub">' + (p ? esc(p.name) + ' at ' + money(p.perPlayer) + ' per player, surcharge inclusive' : 'Choose a package in the outing details') + '</div></div>' +
          '<div class="row wrap fn-q-add">' + ui.btn('Add-ons', { sm: true, icon: 'plus', action: 'q-addons' }) + ui.btn('Custom line', { sm: true, icon: 'plus', action: 'q-extra' }) + (o.format === 'Shotgun' && o.players < SHOTGUN_MIN ? ui.btn('Course rental', { sm: true, icon: 'plus', action: 'q-rental' }) : '') + '</div></div>' +
          '<div class="panel-body flush"><div class="table-wrap"><table class="table fn-q"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
          q.lines.map(function (l) {
            if (l.ref !== 'custom') {
              const ao = S.find('outingPackages', l.ref); const editable = ao && ao.kind === 'addon' && ao.unit !== 'pp';
              return '<tr><td>' + esc(l.label) + '</td><td class="num">' + (editable ? '<input class="input num fn-q-qty" type="number" min="0" step="1" data-aoq="' + esc(ao.id) + '" value="' + esc(l.qty) + '" aria-label="Quantity">' : esc(l.qty)) + '</td><td class="num">' + money(l.unitPrice) + '</td><td class="num nowrap" data-amt-ref="' + esc(l.ref) + '">' + money(l.qty * l.unitPrice) + '</td><td>' + (ao && ao.kind === 'addon' ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-ao-del="' + esc(ao.id) + '" title="Remove add-on" aria-label="Remove add-on">' + Club.icon('close') + '</button>' : '') + '</td></tr>';
            }
            return '';
          }).join('') +
          extra.map(function (l, i) {
            return '<tr><td><input class="input" data-i="' + i + '" data-k="label" value="' + esc(l.label) + '" aria-label="Item" placeholder="Prizes, hole sponsor signage, course rental"></td><td class="num"><input class="input num fn-q-qty" type="number" min="0" step="1" data-i="' + i + '" data-k="qty" value="' + esc(l.qty) + '" aria-label="Quantity"></td><td class="num"><input class="input num fn-q-price" type="number" min="0" step="0.01" data-i="' + i + '" data-k="unitPrice" value="' + esc(l.unitPrice) + '" aria-label="Unit price"></td><td class="num nowrap" data-amt="' + i + '">' + money((+l.qty || 0) * (+l.unitPrice || 0)) + '</td><td><button type="button" class="btn btn-ghost btn-sm btn-icon" data-q-del="' + i + '" title="Remove line" aria-label="Remove line">' + Club.icon('close') + '</button></td></tr>';
          }).join('') +
          '</tbody><tfoot><tr><td colspan="3" class="right">Subtotal</td><td class="num nowrap" data-t="subtotal">' + money(q.subtotal) + '</td><td></td></tr><tr class="fn-q-tax"><td colspan="3" class="right">' + esc(taxLabel()) + '</td><td class="num nowrap" data-t="tax">' + money(q.tax) + '</td><td></td></tr><tr class="fn-q-total"><td colspan="3" class="right">Total</td><td class="num nowrap serif" data-t="total">' + money(q.total) + '</td><td></td></tr></tfoot></table></div></div>' +
          '<div class="fn-q-foot"><p class="muted fn-note">Package and add-on prices from the 2026 tournament package. Initial deposit ' + money(initialDeposit(o.players)) + '. Card payments carry a 2.5% processing fee.</p>' + ui.btn(o.quote ? 'Save quote' : 'Save and mark quoted', { kind: 'primary', icon: 'check', action: 'q-save' }) + '</div></div>';
      }
      draw();
      function live() { const q = draft(); ['subtotal', 'tax', 'total'].forEach(function (k) { const c = ui.$('[data-t=' + k + ']', panel); if (c) c.textContent = money(q[k]); }); extra.forEach(function (l, i) { const c = ui.$('[data-amt="' + i + '"]', panel); if (c) c.textContent = money((+l.qty || 0) * (+l.unitPrice || 0)); }); q.lines.forEach(function (l) { const c = ui.$('[data-amt-ref="' + l.ref + '"]', panel); if (c) c.textContent = money(l.qty * l.unitPrice); }); }
      ui.on(panel, 'input', 'input[data-i]', function (e, inp) { const l = extra[+inp.dataset.i]; l[inp.dataset.k] = inp.dataset.k === 'label' ? inp.value : (inp.value === '' ? 0 : +inp.value); live(); });
      ui.on(panel, 'input', 'input[data-aoq]', function (e, inp) { const a = addOns.find(function (x) { return x.id === inp.dataset.aoq; }); if (a) a.qty = Math.max(0, Math.round(+inp.value || 0)); live(); });
      ui.on(panel, 'click', '[data-ao-del]', function (e, b) { addOns = addOns.filter(function (a) { return a.id !== b.dataset.aoDel; }); draw(); });
      ui.on(panel, 'click', '[data-q-del]', function (e, b) { extra.splice(+b.dataset.qDel, 1); draw(); });
      ui.on(panel, 'click', '[data-action^=q-]', function (e, b) {
        const a = b.dataset.action;
        if (a === 'q-extra') { extra.push({ label: '', qty: 1, unitPrice: 0, ref: 'custom' }); draw(); const ins = ui.$$('input[data-k=label]', panel); if (ins.length) ins[ins.length - 1].focus(); }
        else if (a === 'q-rental') { extra.push({ label: 'Course rental, shotgun minimum of 100 players (' + (SHOTGUN_MIN - o.players) + ' open spots)', qty: SHOTGUN_MIN - o.players, unitPrice: 0, ref: 'custom' }); draw(); ui.toast('Set the course rental rate with the Director of Golf'); }
        else if (a === 'q-addons') {
          const m = ui.modal({ eyebrow: o.organization, title: 'Food and beverage add-ons', size: 'lg', body: '<div class="ot-aos">' + addOnsFieldHtml(addOns, o.packageId, o.players) + '</div>', actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Update quote', kind: 'primary', onClick: function () { addOns = readAddOns(m.body); draw(); } }] });
        } else if (a === 'q-save') {
          if (extra.some(function (l) { return !String(l.label || '').trim() || l.qty < 0 || l.unitPrice < 0; })) return ui.toast('Every custom line needs a name and amounts of zero or more', 'bad');
          const fresh = S.find('outings', o.id); const q = makeQuote(Object.assign({}, fresh, { addOns: addOns }), extra);
          const moved = fresh.stage === 'Enquiry';
          undoRun(function () {
            if (moved) setStage(fresh, 'Quoted', 'Quote of ' + money(q.total) + ' sent to ' + fresh.contactName, { quote: q, addOns: addOns });
            else S.update('outings', o.id, { quote: q, addOns: addOns });
          }, undoOpts('Quote saved · ' + money(q.total) + (moved ? '. Moved to quoted' : ''), moved ? 'Quote taken off. Back in enquiry' : 'Quote put back as it was'));
          refresh('quote');
        }
      });
    };
  }

  function letterHtml(o) {
    const info = Club.info; const p = pkgOf(o); const q = o.quote || makeQuote(o);
    const qh = (o.history || []).filter(function (h) { return h.stage === 'Quoted'; }).pop();
    return '<article class="fn-letter fn-print ot-letter" data-reveal>' +
      '<header class="fn-lh">' + Club.logoImg('fn-lh-logo') + '<div class="fn-lh-name">' + esc(info.name) + '</div><div class="fn-lh-sub">Tournament & Corporate Services</div><div class="fn-lh-addr">' + esc(info.address) + ' · ' + esc(info.phone) + '</div></header><div class="fn-lh-rule"></div>' +
      '<div class="fn-lt-meta"><div><div class="label-caps">Prepared for</div><div class="fn-lt-to">' + esc(o.contactName) + '</div><div class="muted">' + esc(o.organization) + '</div>' + (o.email ? '<div class="muted">' + esc(o.email) + '</div>' : '') + '</div><dl class="fn-lt-facts"><dt>Date</dt><dd>' + esc(fmt.date(qh ? qh.at.slice(0, 10) : today())) + '</dd><dt>Tournament</dt><dd>' + esc(fmt.date(o.date)) + '</dd><dt>Reference</dt><dd>' + esc(String(o.id).toUpperCase()) + '</dd></dl></div>' +
      '<p>Dear ' + esc(o.contactName.split(/\s+/)[0]) + ',</p>' +
      '<p>Thank you for thinking of ' + esc(info.name) + ' for the ' + esc(o.organization) + '. Located less than 4 km from Portage and Main, the club is an excellent place to host your company or charity golf tournament, and your participants can play without having to take the whole day off to travel. The course provides a challenging yet enjoyable experience for golfers of every level.</p>' +
      '<p>Here is our proposal for <strong>' + esc(fmt.dateLong(o.date)) + '</strong>.</p>' +
      '<h4 class="fn-lt-h">Your tournament</h4><dl class="fn-lt-kv"><dt>Format</dt><dd>' + esc(o.format + ', ' + o.holes + ' holes, ' + (o.format === 'Shotgun' ? 'shotgun start at ' : 'tee times from ') + fmt.time(o.start)) + '</dd><dt>Players</dt><dd>' + o.players + ' (estimated)</dd>' + (p ? '<dt>Package</dt><dd>' + esc(p.name + ': ' + p.includesText) + '</dd>' : '') +
        (o.buffet && o.buffet.salad ? '<dt>Buffet</dt><dd>' + esc([o.buffet.salad].concat(o.buffet.hot || [], [o.buffet.vegetable, o.buffet.starch, o.buffet.carvery ? o.buffet.carvery + ' carvery' : '']).filter(Boolean).join(', ')) + '</dd>' : '') + (o.bar ? '<dt>Bar service</dt><dd>' + esc(o.bar) + '</dd>' : '') + '</dl>' +
      '<h4 class="fn-lt-h">Estimate</h4><table class="table fn-lt-table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
        q.lines.map(function (l) { return '<tr><td>' + esc(l.label) + '</td><td class="num">' + esc(l.qty) + '</td><td class="num">' + money(l.unitPrice) + '</td><td class="num">' + money(l.qty * l.unitPrice) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="num">' + money(q.subtotal) + '</td></tr><tr><td colspan="3">' + esc(taxLabel()) + '</td><td class="num">' + money(q.tax) + '</td></tr><tr class="fn-lt-total"><td colspan="3">Total</td><td class="num">' + money(q.total) + '</td></tr>' +
        (paid(o) ? '<tr><td colspan="3">Payments received</td><td class="num">' + money(-paid(o)) + '</td></tr><tr><td colspan="3">Balance due</td><td class="num">' + money(balance(o)) + '</td></tr>' : '') + '</tfoot></table>' +
      '<p class="muted ot-small">All pricing is surcharge inclusive.</p>' +
      '<h4 class="fn-lt-h">Terms at a glance</h4><ul class="fn-lt-list ot-lt-terms">' +
        ['An initial deposit of ' + money(initialDeposit(o.players)) + ' holds your date. It is non-refundable and applied to your final invoice.', 'A credit card is required with bookings. All credit card payments are subject to a 2.5% processing fee.', 'The balance is due within 30 days of your event. We invoice by email within 7 business days.', 'Guaranteed numbers and a list of all golfers are due 5 days before the tournament.', 'F&B arrangements are due a minimum of 8 weeks before the event.', 'As per LGCA regulations, the club supplies all alcoholic beverages on the course. Private coolers are not permitted.'].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p>We look forward to welcoming your group to St. B.</p>' +
      '<div class="ot-signs">' + PDF.contacts.map(function (c) { return '<div class="fn-lt-sign"><div class="fn-lt-signame">' + esc(c.name) + '</div><div class="muted">' + esc(c.title) + '</div><div class="muted">' + esc(info.phone + ' ext. ' + c.ext) + '</div><div class="muted">' + esc(c.email) + '</div></div>'; }).join('') + '</div>' +
      '<footer class="fn-lt-foot"><span>' + esc(info.website.replace(/^https?:\/\/(www\.)?/, '')) + '</span><span>Packages for groups of all sizes</span></footer></article>';
  }
  function printEl(node) {
    if (!node) return;
    node.classList.add('fn-print-target'); document.body.classList.add('fn-printing');
    const end = function () { node.classList.remove('fn-print-target'); document.body.classList.remove('fn-printing'); window.removeEventListener('afterprint', end); };
    window.addEventListener('afterprint', end); window.print(); setTimeout(end, 1000);
  }
  function proposalTab(o, refresh) {
    return function (panel) {
      panel.innerHTML = '<div class="fn-letter-bar no-print" data-reveal><p class="muted">' + (o.quote ? 'Ready to print or save as PDF.' : 'Showing the package estimate. Save a quote to lock it in.') + '</p><div class="row wrap">' +
        (o.stage === 'Enquiry' ? ui.btn('Mark quoted', { icon: 'send', action: 'mark-quoted' }) : '') + ui.btn('Print proposal', { kind: 'primary', icon: 'print', action: 'print' }) + '</div></div>' + letterHtml(o);
      ui.on(panel, 'click', '[data-action=print]', function () { printEl(ui.$('.fn-print', panel)); });
      ui.on(panel, 'click', '[data-action=mark-quoted]', function () { moveTo(S.find('outings', o.id), 'Quoted', function () { refresh('proposal'); }); });
    };
  }

  function paymentsTab(o, refresh) {
    return function (panel) {
      const total = o.quote ? o.quote.total : 0; const p = paid(o); const bal = round2(total - p);
      const deps = (o.deposits || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      const fees = deps.reduce(function (s, d) { return s + (+d.fee || 0); }, 0);
      const pct = total ? Math.min(100, Math.round(p / total * 100)) : 0;
      const due = addDays(o.date, 30);
      panel.innerHTML = '<div class="fn-pay-sum panel" data-reveal><div><span class="label-caps">Quote total</span><div class="stat-value">' + (o.quote ? money(total) : '<span class="muted fn-small">No quote yet</span>') + '</div></div>' +
          '<div><span class="label-caps">Received</span><div class="stat-value">' + money(p) + '</div></div>' +
          '<div><span class="label-caps">Balance due</span><div class="stat-value' + (bal > 0 && due < today() ? ' fn-overdue' : '') + '">' + money(Math.max(0, bal)) + '</div></div>' +
          '<div class="fn-pay-bar"><div class="bar"><span style="width:' + pct + '%"></span></div><span class="muted">' + pct + '% paid · final payment due ' + esc(fmt.date(due)) + (fees ? ' · card fees ' + money(fees) : '') + '</span></div></div>' +
        '<div class="panel" data-reveal><div class="panel-head"><h3>Deposits and payments</h3>' + (o.stage !== 'Lost' ? ui.btn((o.deposits || []).length ? 'Record payment' : 'Record initial deposit', { kind: 'primary', sm: true, icon: 'plus', action: 'deposit' }) : '') + '</div><div class="panel-body flush">' +
        (deps.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Method</th><th class="num">Fee</th><th class="num">Amount</th><th></th></tr></thead><tbody>' + deps.map(function (d) {
          const rc = depositReceiptOf(o, d);
          return '<tr><td class="nowrap">' + esc(fmt.date(d.date)) + '</td><td>' + depositLabel(d) + '</td><td class="num muted">' + (d.fee ? money(d.fee) : '') + '</td><td class="num">' + money(d.amount) + '</td><td class="right nowrap">' + (rc ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-dep-rc="' + esc(rc.id) + '" title="Receipt ' + esc(rc.no) + '" aria-label="Receipt ' + esc(rc.no) + '">' + Club.icon('billing') + '</button>' : '') + '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-dep-del="' + esc(d.id || '') + '" title="Remove payment" aria-label="Remove payment">' + Club.icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : ui.empty({ icon: 'card', title: 'No deposit yet', text: 'The initial deposit is ' + money(initialDeposit(o.players)) + '. A credit card is required with bookings.' })) + '</div></div>';
      ui.on(panel, 'click', '[data-action=deposit]', function () { recordDeposit(S.find('outings', o.id), function () { refresh('payments'); }); });
      ui.on(panel, 'click', '[data-dep-rc]', function (e, b) { Club.receipts.open(b.dataset.depRc); });
      ui.on(panel, 'click', '[data-dep-del]', function (e, b) {
        const fresh = S.find('outings', o.id); const d = (fresh.deposits || []).find(function (x) { return x.id === b.dataset.depDel; }); if (!d) return;
        ui.confirm({ title: 'Remove this payment?', text: money(d.amount) + ' received ' + fmt.date(d.date) + '. The record is removed and a credit receipt takes it out of today’s close. Refund separately if needed.', confirmLabel: 'Remove payment', danger: true }).then(function (ok) {
          if (!ok) return;
          undoRun(function () {
            addNote(fresh, 'Payment of ' + money(d.amount) + ' removed', { deposits: fresh.deposits.filter(function (x) { return x !== d; }) });
            if (Club.accounting && Club.accounting.depositReversed) { try { Club.accounting.depositReversed('outings', fresh, d); } catch (err) { console.error('Deposit credit receipt failed', err); } }
          }, undoOpts('Payment removed', 'Payment of ' + money(d.amount) + ' restored'));
          refresh('payments');
        });
      });
    };
  }

  /* Day-of: pairings and cart assignments, by starting hole for shotguns. */
  function pairings(o) {
    const names = (o.roster || []).slice();
    while (names.length < o.players) names.push('');
    const groups = []; for (let i = 0; i < names.length; i += 4) groups.push(names.slice(i, i + 4));
    const step = sheet().step; const holes = o.holes === 9 ? 9 : 18;
    let cart = 0;
    return groups.map(function (g, i) {
      let start;
      if (o.format === 'Shotgun') { const h = (i % holes) + 1; start = 'Hole ' + h + (groups.length > holes ? (i < holes ? 'A' : i < holes * 2 ? 'B' : 'C') : ''); }
      else start = fmt.time(toHM(toMin(o.start) + i * step));
      const players = g.map(function (n, k) { if (k % 2 === 0) cart++; return { name: n, cart: cart }; });
      return { group: i + 1, start: start, players: players };
    });
  }
  function dayOfTab(o, refresh) {
    return function (panel) {
      const named = (o.roster || []).length; const deadline = addDays(o.date, -5);
      const groups = pairings(o);
      const sorted = o.format === 'Shotgun' ? groups.slice().sort(function (a, b) { const ha = parseInt(a.start.slice(5), 10), hb = parseInt(b.start.slice(5), 10); return ha - hb || (a.start < b.start ? -1 : 1); }) : groups;
      panel.innerHTML = '<div class="grid ot-day">' +
        '<div class="panel ot-sheet fn-print" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(fmt.dateLong(o.date)) + '</div><h3>' + esc(o.organization) + '</h3><div class="person-sub">' + esc((o.format === 'Shotgun' ? 'Shotgun start at ' : 'Tee times from ') + fmt.time(o.start) + ' · ' + o.players + ' players · ' + groups.length + ' groups · ' + Math.ceil(o.players / 2) + ' carts') + '</div></div>' + ui.btn('Print', { sm: true, icon: 'print', action: 'print-sheet' }) + '</div>' +
          '<div class="panel-body flush"><div class="table-wrap"><table class="table ot-pairs"><thead><tr><th>' + (o.format === 'Shotgun' ? 'Starting hole' : 'Tee time') + '</th><th>Group</th><th>Players</th><th>Carts</th></tr></thead><tbody>' +
          sorted.map(function (g) {
            return '<tr><td class="primary-cell nowrap">' + esc(g.start) + '</td><td>' + g.group + '</td><td><ol class="ot-names">' + g.players.map(function (p) { return '<li class="' + (p.name ? '' : 'tbd') + '">' + esc(p.name || 'Golfer to be named') + '</li>'; }).join('') + '</ol></td>' +
              '<td class="nowrap">' + g.players.filter(function (p, k) { return k % 2 === 0; }).map(function (p) { return '<span class="ot-cart">Cart ' + p.cart + '</span>'; }).join('') + '</td></tr>';
          }).join('') + '</tbody></table></div></div></div>' +
        '<div class="panel" data-reveal><div class="panel-head"><div><h3>Golfer list</h3><div class="person-sub">' + named + ' of ' + o.players + ' named · due ' + esc(fmt.date(deadline)) + '</div></div></div><div class="panel-body">' +
          '<textarea class="textarea ot-roster" aria-label="Golfer list" placeholder="One golfer per line, in groups of four">' + esc((o.roster || []).join('\n')) + '</textarea>' +
          '<p class="muted fn-note">One name per line. Every four lines make a group, and partners 1 and 2, 3 and 4 share a power cart.</p>' +
          (named > o.players ? '<div class="fn-warn">' + Club.icon('alert') + '<div>' + named + ' golfers listed for ' + o.players + ' estimated players. Update the guaranteed number in the outing details.</div></div>' : '') +
          '<div class="row" style="justify-content:flex-end;margin-top:12px">' + ui.btn('Save golfer list', { sm: true, kind: 'primary', action: 'save-roster' }) + '</div></div></div>' + '</div>';
      ui.on(panel, 'click', '[data-action=print-sheet]', function () { printEl(ui.$('.ot-sheet', panel)); });
      ui.on(panel, 'click', '[data-action=save-roster]', function () {
        const list = ui.$('.ot-roster', panel).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        undoRun(function () { S.update('outings', o.id, { roster: list }); }, undoOpts('Golfer list saved · ' + list.length + ' golfer' + (list.length === 1 ? '' : 's'), 'Golfer list put back as it was'));
        refresh('dayof');
      });
    };
  }

  function renderDetail(view, id) {
    const o = S.find('outings', id);
    if (!o) { view.innerHTML = '<a class="fn-back" href="#/outings">' + Club.icon('chevronLeft') + '<span>Group Outings</span></a>' + ui.empty({ icon: 'trophy', title: 'Outing not found', text: 'It may have been deleted. Head back to the pipeline to find it.', action: '<a class="btn btn-primary" href="#/outings">Back to pipeline</a>' }); return; }
    view.innerHTML = '<div class="fn-detail-top"><a class="fn-back" href="#/outings">' + Club.icon('chevronLeft') + '<span>Tournaments & Outings</span></a><div class="fn-actions">' + actionsHtml(o) + '</div></div>' +
      heroHtml(o) + '<div class="fn-steps-wrap ot-steps" data-reveal>' + stepperHtml(o) + '</div>' +
      '<div class="grid grid-main-side fn-detail-grid"><div class="fn-tabs-host"></div><aside class="stack fn-side">' + sideHtml(o) + '</aside></div>';
    function refresh(tab) { if (tab) detailTab = tab; renderDetail(view, id); ui.animateIn(view); }
    ui.tabs(ui.$('.fn-tabs-host', view), [
      { id: 'overview', label: 'Overview', render: overviewTab(o, refresh) },
      { id: 'quote', label: 'Quote', render: quoteTab(o, refresh) },
      { id: 'proposal', label: 'Proposal', render: proposalTab(o, refresh) },
      { id: 'payments', label: 'Payments', render: paymentsTab(o, refresh) },
      { id: 'dayof', label: 'Day-of', render: dayOfTab(o, refresh) }
    ], detailTab, function (t) { detailTab = t; });
    function act(name) {
      const cur = S.find('outings', id); if (!cur) return;
      if (name === 'advance') moveTo(cur, FLOW[FLOW.indexOf(cur.stage) + 1], function () { refresh(); });
      else if (name === 'reopen') moveTo(cur, 'Enquiry', function () { refresh(); });
      else if (name === 'lost') markLost(cur, function () { refresh(); });
      else if (name === 'edit') openForm(cur, function () { refresh(); });
      else if (name === 'reblock') confirmShotgun(cur, function () { refresh(); }, true);
      else if (name === 'delete') {
        const blk = blockOf(cur);
        ui.confirm({ title: 'Delete this outing?', text: cur.organization + ' and its quote, payments and golfer list will be removed' + (blk ? ', and its tee sheet block released' : '') + '. Receipts already issued stay in Accounting.', confirmLabel: 'Delete outing', danger: true }).then(function (ok) {
          if (!ok) return;
          undoRun(function () { releaseBlock(cur); S.remove('outings', id); }, undoOpts('Outing deleted' + (blk ? '. Tee times released' : ''), cur.organization + ' restored' + (blk ? '. Tee times blocked again' : ''),
            function () { if (location.hash === '#/outings/' + id) Club.app.render(); else Club.app.go('outings/' + id); }));
          Club.app.go('outings');
        });
      }
      else if (name === 'back') stepBack(cur, function () { refresh(); });
    }
    ui.on(ui.$('.fn-actions', view), 'click', '[data-action]', function (e, b) { act(b.dataset.action); });
    ui.on(ui.$('.fn-side', view), 'click', '[data-action]', function (e, b) { act(b.dataset.action); });
    ui.on(ui.$('.fn-tabs-host', view), 'click', '[data-action=edit]', function () { act('edit'); });
  }

  Club.register({
    id: 'outings', label: 'Group Outings', icon: 'flag', section: 'Golf', order: 35,
    badge: function () { const n = all().filter(function (o) { return o.stage === 'Enquiry'; }).length; return n || null; },
    search: function (q) {
      return all().filter(function (o) { return (o.organization + ' ' + o.contactName + ' ' + (o.email || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (o) { return { label: o.organization, sub: 'Outing · ' + fmt.date(o.date) + ' · ' + o.stage, href: 'outings/' + o.id, icon: 'trophy' }; });
    },
    render: function (view, params) {
      if (params && params[0]) { renderDetail(view, params[0]); return; }
      detailTab = 'overview';
      renderMain(view);
    }
  });
})();
