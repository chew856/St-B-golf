/* Public booking site: shell, router, accounts, availability and shared helpers.
   Non-members create an account (collection `publicPlayers`), then book and pay for public tee times.
   Tee times are written to the staff tee sheet's `teeTimes` collection in the same shape as member bookings. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, rules = Club.teeRules;
  const EN = Club.fmtEn;   /* English formatting for stored text (js/i18n/fr-shared.js) */
  const SESSION = 'stboniface.public.session';
  const DEFAULTS = { interval: 9, first: '06:30', last: '19:00', guestFee: 66, cartFee: 28 };
  const PACE = (Club.teeRules && Club.teeRules.PACE) || { 18: 234, 9: 117 };   /* handbook: 13 minutes a hole */
  const REFUND_HOURS = 24;
  const pages = [];
  let cleanup = null, currentId = null;

  /* ---------------- Session ---------------- */
  function getSession() { try { return localStorage.getItem(SESSION); } catch (e) { return null; } }
  function setSession(id) { try { if (id) localStorage.setItem(SESSION, id); else localStorage.removeItem(SESSION); } catch (e) { /* private mode */ } }

  /* ---------------- Small helpers ---------------- */
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function today() { return Club.date.today(); }
  function settings() { return Object.assign({}, DEFAULTS, S.getObj('teeSheetSettings', {}) || {}); }
  function courseStatus() { return S.getObj('courseStatus', null) || { open: true, cartRule: 'Normal' }; }
  function slotList() { const s = settings(); const out = []; const step = Math.max(5, +s.interval || 9); for (let m = toMin(s.first); m <= toMin(s.last); m += step) out.push(toHM(m)); return out; }
  function blocksOn(date) { return S.where('teeBlocks', function (b) { return b.date === date; }); }
  function blockAt(blocks, t) { return blocks.find(function (b) { return t >= b.start && t < b.end; }) || null; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function longDate(d) { return fmt.toDate(d).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function dayName(d) { return d === today() ? 'Today' : d === Club.date.addDays(today(), 1) ? 'Tomorrow' : fmt.toDate(d).toLocaleDateString('en-CA', { weekday: 'long' }); }
  function timeParts(t) { const p = fmt.time(t).split(' '); return { t: p[0], ap: p[1] }; }
  function phoneHref() { return 'tel:' + Club.info.phone.replace(/[^\d+]/g, ''); }
  function minutesUntil(date, time) { const d = fmt.toDate(date); d.setHours(0, toMin(time), 0, 0); return (d.getTime() - Date.now()) / 60000; }
  function cartRuleFor(date) { return date === today() ? (courseStatus().cartRule || 'Normal') : 'Normal'; }

  /* ---------------- Accounts ---------------- */
  /* Demo only: a salted, non-reversible hash (cyrb53). A real site would hash on the server. */
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  function hashPassword(pw, salt) {
    salt = salt || Math.random().toString(36).slice(2, 10);
    let h = String(pw);
    for (let i = 0; i < 64; i++) h = cyrb53(salt + h, i);
    return 'c53$' + salt + '$' + h;
  }
  function checkPassword(pw, stored) {
    const p = String(stored || '').split('$');
    return p.length === 3 && hashPassword(pw, p[1]) === stored;
  }
  function players() { return S.all('publicPlayers'); }
  function byEmail(email) { const e = String(email || '').trim().toLowerCase(); return players().find(function (p) { return String(p.email || '').toLowerCase() === e; }) || null; }
  function me() { const id = getSession(); const p = id ? S.find('publicPlayers', id) : null; return p; }

  /* Validation shared by sign up and My account */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
  function normPostal(v) { const s = String(v || '').toUpperCase().replace(/\s+/g, ''); return s.length === 6 ? s.slice(0, 3) + ' ' + s.slice(3) : String(v || '').toUpperCase().trim(); }
  function normPhone(v) { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v || '').trim(); }
  function phoneOk(v) { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 && /^[2-9]/.test(d) && /^[2-9]/.test(d.slice(3)); }
  function nameOk(v) { return /^[\p{L}][\p{L}' .-]{0,39}$/u.test(String(v || '').trim()); }
  function passwordProblem(pw) {
    if (!pw) return 'Choose a password.';
    if (pw.length < 8) return 'Use at least 8 characters.';
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
    return '';
  }
  function setErr(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid'); f.setAttribute('aria-invalid', 'true');
    const fld = f.closest('.field') || f.parentNode;
    fld.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrs(form) {
    ui.$$('.field-error', form).forEach(function (e) { e.remove(); });
    ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); });
  }
  function focusFirstErr(form) { const f = ui.$('.invalid', form); if (f) f.focus(); }

  /** Validates the detail fields of a sign up or account form. Returns cleaned values or null. */
  function readDetails(form, excludeId) {
    const v = ui.formData(form);
    let ok = true;
    if (!nameOk(v.firstName)) { setErr(form, 'firstName', v.firstName ? 'Use letters only, please.' : 'Enter your first name.'); ok = false; }
    if (!nameOk(v.lastName)) { setErr(form, 'lastName', v.lastName ? 'Use letters only, please.' : 'Enter your last name.'); ok = false; }
    if (!EMAIL_RE.test(v.email || '')) { setErr(form, 'email', v.email ? 'That email address does not look right.' : 'Enter your email address.'); ok = false; }
    else { const other = byEmail(v.email); if (other && other.id !== excludeId) { setErr(form, 'email', 'An account already uses this email. Try signing in instead.'); ok = false; } }
    if (!phoneOk(v.phone)) { setErr(form, 'phone', v.phone ? 'Enter a 10-digit phone number, for example (204) 555-0123.' : 'Enter a phone number so the golf shop can reach you.'); ok = false; }
    if (!POSTAL_RE.test(String(v.postalCode || '').trim())) { setErr(form, 'postalCode', v.postalCode ? 'Use the Canadian format A1A 1A1.' : 'Enter your postal code.'); ok = false; }
    if (!ok) return null;
    return { firstName: v.firstName.trim().replace(/\s+/g, ' '), lastName: v.lastName.trim().replace(/\s+/g, ' '), email: v.email.trim().toLowerCase(), phone: normPhone(v.phone), postalCode: normPostal(v.postalCode) };   /* marketingOptIn and heardFrom: sign up and My account (me.js) */
  }

  /* ---------------- Availability ---------------- */
  function activeAt(date, time, list) { return (list || S.all('teeTimes')).filter(function (t) { return t.date === date && t.time === time && t.status !== 'cancelled'; }); }
  function hasMine(tt, pid) { return (tt.players || []).some(function (p) { return p.publicPlayerId === pid; }); }
  function clashFor(pid, date, time, excludeId) {
    if (!pid) return null;
    return S.all('teeTimes').filter(function (x) {
      return x.date === date && x.status !== 'cancelled' && x.status !== 'no-show' && x.id !== excludeId &&
        Math.abs(toMin(x.time) - toMin(time)) < (PACE[x.holes] || PACE[18]) && hasMine(x, pid);
    })[0] || null;
  }
  /** Fresh tee times from storage, so a slot taken in another tab is caught before payment. */
  function storedTeeTimes() {
    try { const tt = S.stored('teeTimes'); return Array.isArray(tt) ? tt : null; } catch (e) { return null; }
  }

  /**
   * Every slot on the day with its public state:
   * 'open' | 'partial' | 'mine' | 'clash' | 'full' | 'blocked' | 'past' | 'closed' | 'members' (not open to public play)
   */
  function daySlots(date, pid) {
    const td = today(), now = nowMin(), blocks = blocksOn(date);
    const closed = date === td && courseStatus().open === false;
    const all = S.all('teeTimes').filter(function (t) { return t.date === date && t.status !== 'cancelled'; });
    return slotList().map(function (t) {
      const ps = rules.publicSlot(date, t);
      const here = all.filter(function (x) { return x.time === t; });
      const booked = here.reduce(function (a, x) { return a + (x.players || []).length; }, 0);
      const held = Club.holds ? Club.holds.heldByOthers(date, t) : 0;   /* places someone else is booking right now */
      const taken = booked + held;
      const tt = here[0] || null;
      const s = { time: t, pub: ps, tt: tt, places: Math.max(0, 4 - taken), taken: Math.min(4, taken), held: held, block: blockAt(blocks, t), state: 'open' };
      if (!ps.ok) s.state = 'members';
      else if (pid && here.some(function (x) { return hasMine(x, pid); })) s.state = 'mine';
      else if (date < td || (date === td && toMin(t) <= now)) s.state = 'past';
      else if (closed) s.state = 'closed';
      else if (s.block) s.state = 'blocked';
      else if (here.some(function (x) { return x.status !== 'booked'; }) || here.length > 1) s.state = 'full';
      else if (s.places <= 0) s.state = held ? 'held' : 'full';
      else if (clashFor(pid, date, t, null)) s.state = 'clash';
      else s.state = tt || held ? 'partial' : 'open';
      return s;
    });
  }
  function bookable(s) { return s.state === 'open' || s.state === 'partial'; }
  function bookingDays() {
    const out = [];
    for (let i = 0; i <= 14; i++) { const d = Club.date.fromToday(i); if (rules.bookingOpen('public', null, d).ok) out.push(d); else if (i > 0) break; }
    return out;
  }
  /** Re-check a slot right before payment. { ok, msg, tt, places } */
  function recheck(date, time, needed, joinId, pid) {
    if (!rules.bookingOpen('public', null, date).ok) return { ok: false, msg: 'Public tee times open ' + rules.PUBLIC_ADVANCE_DAYS + ' days ahead. Please choose another day.' };
    if (!rules.publicSlot(date, time).ok) return { ok: false, msg: rules.publicSlot(date, time).reason };
    if (date === today() && toMin(time) <= nowMin()) return { ok: false, msg: 'That tee time has just passed. Please choose a later time.' };
    if (date === today() && courseStatus().open === false) return { ok: false, msg: 'The course has closed for today. Please choose another day.' };
    const blk = blockAt(blocksOn(date), time);
    if (blk) return { ok: false, msg: fmt.time(time) + ' has just been reserved for ' + String(blk.reason || 'club use').toLowerCase() + '.' };
    const mem = activeAt(date, time);
    const stored = storedTeeTimes();
    const st = stored ? activeAt(date, time, stored) : [];
    const takenMem = mem.reduce(function (a, x) { return a + (x.players || []).length; }, 0);
    const takenSt = st.reduce(function (a, x) { return a + (x.players || []).length; }, 0);
    const held = Club.holds ? Club.holds.heldByOthers(date, time) : 0;   /* another golfer is completing a booking here */
    const taken = Math.max(takenMem, takenSt);
    const left = 4 - taken - held;
    const tt = mem[0] || null;
    if (joinId) {
      if (!tt || tt.id !== joinId || tt.status !== 'booked' || mem.length > 1) return { ok: false, msg: 'This group has changed since you chose it. Please choose another time.' };
    } else if (mem.length || st.length) {
      if (!tt || tt.status !== 'booked' || mem.length > 1) return { ok: false, msg: 'Someone booked ' + fmt.time(time) + ' a moment ago. Please choose another time.' };
      return { ok: false, changed: true, places: left, tt: tt, msg: left > 0 ? 'Another group just booked ' + fmt.time(time) + '. There ' + (left === 1 ? 'is 1 place' : 'are ' + left + ' places') + ' left to join.' : 'Someone booked ' + fmt.time(time) + ' a moment ago. Please choose another time.' };
    }
    if (left < needed && held && 4 - taken >= needed) return { ok: false, places: Math.max(0, left), msg: 'Another golfer is completing a booking at ' + fmt.time(time) + '. Please choose another time, or try again in a few minutes.' };
    if (left < needed) return { ok: false, places: left, msg: left > 0 ? 'Only ' + plural(left, 'place') + ' left at ' + fmt.time(time) + ' now. Please remove a guest or choose another time.' : 'This tee time has just filled. Please choose another time.' };
    const c = clashFor(pid, date, time, null);
    if (c) return { ok: false, msg: 'You already have a round at ' + fmt.time(c.time) + ' that day.' };
    return { ok: true, tt: tt, places: left };
  }

  /* ---------------- Fees ---------------- */
  function cartFee(holes) { return r2(settings().cartFee * (+holes === 9 ? 0.6 : 1)); }
  /** Public add-ons a golfer can pick (Club.addons, js/core/addons.js): every active one. */
  function addonList() { return Club.addons ? Club.addons.active('public') : []; }
  /**
   * The fees for a booking. party: [{ name, cart, adds: [addonId] (per-player add-ons) }]; extras: { addonId: qty } (per-booking
   * add-ons, on the booker). Lines: { label, amount, kind: 'greenFee'|'cart'|'addon' } (Club.promos discounts by kind).
   */
  function quote(date, time, holes, party, extras) {
    const g = rules.greenFee(date, time, holes), c = cartFee(holes);
    const A = Club.addons, lines = [];
    const usable = function (id, per) { const a = A && A.get(id); return a && a.active && a.per === per ? a : null; };
    party.forEach(function (p) {
      lines.push({ label: 'Green fee, ' + (p.name || 'guest') + ' (' + holes + ' holes)', amount: g, kind: 'greenFee' });
      if (p.cart) lines.push({ label: 'Cart, ' + (p.name || 'guest'), amount: c, kind: 'cart' });
      (p.adds || []).forEach(function (id) { const a = usable(id, 'player'); if (a) lines.push({ label: a.name + ', ' + (p.name || 'guest'), amount: A.price(a, holes), kind: 'addon', addonId: a.id, qty: 1 }); });
    });
    Object.keys(extras || {}).forEach(function (id) {
      const a = usable(id, 'booking'), n = Math.round(+extras[id] || 0); if (!a || n < 1) return;
      lines.push({ label: a.name + (n > 1 ? ' (' + n + ')' : ''), amount: r2(A.price(a, holes) * n), kind: 'addon', addonId: a.id, qty: n });
    });
    return { lines: lines, greenFee: g, cartFee: c, total: r2(lines.reduce(function (a, l) { return a + l.amount; }, 0)) };
  }
  function bandLabel(ps) { return ps.label + ' ' + fmt.money(ps.rate, false); }

  /* ---------------- Bookings of the signed-in player ---------------- */
  function myTeeTimes(pid) { return S.where('teeTimes', function (t) { return hasMine(t, pid); }); }
  function paymentFor(ttId, pid) {
    return S.where('publicPayments', function (p) { return p.teeTimeId === ttId && p.publicPlayerId === pid; }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0] || null;
  }

  /* ---------------- Calendar file ---------------- */
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function downloadIcs(tt, names) {
    const start = fmt.toDate(tt.date); start.setHours(0, toMin(tt.time), 0, 0);
    const end = new Date(start.getTime() + (PACE[tt.holes] || PACE[18]) * 60000);
    const local = function (d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00'; };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + Club.info.short + '//Public tee times//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + tt.id + '-' + (names.id || 'public') + '@stboniface.public', 'DTSTAMP:' + stamp, 'DTSTART:' + local(start), 'DTEND:' + local(end),
      'SUMMARY:' + icsEscape('Tee time at ' + Club.info.short + ', ' + tt.holes + ' holes'),
      'LOCATION:' + icsEscape(Club.info.name + ', ' + Club.info.address),
      'DESCRIPTION:' + icsEscape('Players: ' + names.list + '\nPlease check in at the golf shop 15 minutes before your tee time. Dress code applies and soft spikes only.\nGolf shop: ' + Club.info.phone),
      'BEGIN:VALARM', 'TRIGGER:-PT90M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Tee time at ' + fmt.time(tt.time)), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'stboniface-tee-time-' + tt.date + '-' + tt.time.replace(':', '') + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      ui.toast('Calendar invitation downloaded');
    } catch (e) { ui.toast('Your browser could not create the calendar file', 'bad'); }
  }

  /* ---------------- Receipt ---------------- */
  function cardLine(brand, last4) {
    const b = Club.cards.brands.find(function (x) { return x.id === brand; });
    return (b ? b.name : 'Card') + ' ending ' + last4;
  }
  function markChip(brand, h) { return '<span class="pub-mark" data-brand="' + esc(brand || 'unknown') + '">' + Club.cards.mark(brand, h || 18) + '</span>'; }
  function receiptHTML(pay) {
    const tt = S.find('teeTimes', pay.teeTimeId);
    const ref = String(pay.id).replace(/^[a-z]+_?/i, '').toUpperCase();
    const refunded = pay.status === 'refunded';
    return '<article class="pub-receipt" id="pub-receipt">' +
      '<header class="pub-receipt-head">' + Club.logoImg('pub-receipt-logo') + '<div class="pub-receipt-club">' + esc(Club.info.name) + '</div><div class="pub-receipt-addr">' + esc(Club.info.address) + ' · ' + esc(Club.info.phone) + '</div></header>' +
      '<div class="eyebrow center">' + (refunded ? 'Refunded payment' : 'Payment receipt') + '</div>' +
      '<div class="pub-receipt-amt">' + esc(fmt.money(pay.amount)) + '</div>' +
      (refunded ? '<p class="center"><span class="badge info">Refunded ' + esc(fmt.date(pay.refundedOn || pay.date)) + '</span></p>' : '') +
      '<dl class="pub-receipt-kv">' +
        '<div><dt>Date</dt><dd>' + esc(fmt.dateLong(pay.date)) + '</dd></div>' +
        (tt ? '<div><dt>Tee time</dt><dd>' + esc(longDate(tt.date)) + ', ' + esc(fmt.time(tt.time)) + '</dd></div>' : '') +
        '<div><dt>Paid with</dt><dd class="pub-paidwith">' + markChip(pay.brand, 16) + '<span>' + esc(paidWith(pay)) + '</span></dd></div>' +
        '<div><dt>Confirmation</dt><dd class="num">' + esc(ref) + '</dd></div>' +
      '</dl>' +
      ((pay.lines || []).length ? '<ul class="pub-receipt-lines">' + pay.lines.map(function (l) { return '<li><span>' + esc(l.label) + '</span><span class="num">' + esc(fmt.money(l.amount)) + '</span></li>'; }).join('') + '<li class="pub-receipt-total"><span>Total</span><span class="num">' + esc(fmt.money(pay.amount)) + '</span></li></ul>' : '') +
      '<p class="pub-receipt-tax">Green fees include tax.</p>' +
      '<p class="pub-receipt-foot serif">Thank you for choosing ' + esc(Club.info.short) + '. We look forward to welcoming you.</p>' +
    '</article>';
  }
  /* Club.receipts (js/core/receipts.js) keeps one receipt per tee time payment (source 'public', refId the publicPayments
     id) and a credit receipt when it is refunded, so they sit in My account with cart purchases. ensureReceipts is
     idempotent: it only adds what a payment is missing. */
  function teeNote(pay) {
    const conf = 'Confirmation ' + String(pay.id).replace(/^[a-z]+_?/i, '').toUpperCase();
    return pay.teeDate ? 'Tee time ' + EN.longDate(pay.teeDate) + (pay.teeTime ? ' at ' + EN.time(pay.teeTime) : '') + (pay.holes ? ', ' + pay.holes + ' holes' : '') + '. ' + conf + '.' : conf + '.';
  }
  function midday(iso) { const p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12).toISOString(); }
  /** How a tee time payment was paid: 'Visa ending 4242', 'Gift card ending 7KQ2 and Visa ending 4242', or 'Promo code
      FALL20' when the code covered everything. */
  function paidWith(pay) {
    if (!pay) return '';
    if (pay.giftCardId && Club.giftcards) return Club.giftcards.paidWith(pay);
    if (!(+pay.amount > 0) && pay.promo) return 'Promo code ' + pay.promo.code;
    return cardLine(pay.brand, pay.last4);
  }
  /** The money taken online for a payment, split by tender (Club.receipts tenders, read by the daily close). */
  function payTenders(pay) {
    const gift = pay.giftCardId ? r2(pay.giftAmount) : 0;
    const card = pay.giftCardId ? r2(pay.cardAmount) : r2(pay.amount);
    const out = [];
    if (gift > 0) out.push({ method: 'gift', amount: gift, online: true, ref: pay.giftCardId });
    if (card > 0) out.push({ method: 'card', amount: card, online: true, ref: pay.id });
    return out;
  }
  function ensureReceipts(pay) {
    /* A promo code can cover the whole booking: that one still gets a receipt (for $0.00), but no refund receipt. */
    if (!Club.receipts || !pay || (!(+pay.amount > 0) && !pay.promo)) return {};
    const free = !(+pay.amount > 0);
    const have = Club.receipts.forRef('public', pay.id);
    const tenders = payTenders(pay);
    const base = { publicPlayerId: pay.publicPlayerId, lines: (pay.lines || []).map(function (l) { return { name: l.label, qty: 1, price: l.amount }; }), total: pay.amount,
      method: free || (pay.giftCardId && !(+pay.cardAmount > 0)) ? 'other' : 'card', methodLabel: paidWith(pay), source: 'public', refId: pay.id, note: teeNote(pay),
      tenders: tenders, channel: 'online' };
    const day = pay.teeDate ? ', ' + EN.dateShort(pay.teeDate) : '';
    /* Receipts made elsewhere (the gift card refund, older backfills) gain the tenders and channel they lack. */
    const fill = function (r) {
      if (!r || (r.channel && (r.tenders || !tenders.length))) return r;
      return S.update('receipts', r.id, { tenders: r.tenders || (tenders.length ? tenders : null), channel: r.channel || 'online' }) || r;
    };
    let sale = fill(have.find(function (r) { return r.kind === 'sale'; })), credit = fill(have.find(function (r) { return r.kind === 'credit'; }));
    if (!sale) {
      const at = pay.createdAt && S.iso(new Date(pay.createdAt)) === pay.date ? pay.createdAt : pay.date === today() ? new Date().toISOString() : midday(pay.date);
      sale = Club.receipts.create(Object.assign({}, base, { kind: 'sale', title: 'Tee time' + day, at: at, date: pay.date }));
    }
    if (pay.status === 'refunded' && !credit && !free) {
      const on = pay.refundedOn || pay.date;
      /* A refund made today is stamped now; an older one at midday that day, and never before the payment. */
      const at = on === today() ? new Date().toISOString() : new Date(Math.max(Date.parse(midday(on)), Date.parse(sale.at) + 60000)).toISOString();
      credit = Club.receipts.create(Object.assign({}, base, { kind: 'credit', title: 'Tee time refund' + day, at: at, date: on }));
    }
    return { sale: sale, credit: credit || null };
  }
  /** Once per store: receipts for public payments made before receipts existed ($publicReceiptsBackfilled). */
  function backfillReceipts() {
    if (!Club.receipts || S.getObj('publicReceiptsBackfilled', false)) return;
    try { S.all('publicPayments').slice().sort(function (a, b) { return String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)); }).forEach(ensureReceipts); }
    catch (e) { console.error('Public receipts backfill failed', e); return; }
    S.setObj('publicReceiptsBackfilled', true);
  }
  /** A tee time payment's receipt: the Club.receipts doc (credit: the refund's) when there is one, else the older payment slip. */
  function openReceipt(payId, credit) {
    const pay = S.find('publicPayments', payId);
    const p = me();
    if (!pay || !p || pay.publicPlayerId !== p.id) { ui.toast('That receipt is not available', 'bad'); return; }
    const rc = ensureReceipts(pay)[credit ? 'credit' : 'sale'];
    if (rc) { Club.receipts.open(rc); return; }
    ui.modal({ eyebrow: 'Receipt', title: 'Your payment', body: receiptHTML(pay), actions: [
      { label: 'Close', kind: 'ghost' },
      { label: 'Print receipt', kind: 'primary', icon: 'print', onClick: function () { document.body.classList.add('pub-printing'); setTimeout(function () { window.print(); document.body.classList.remove('pub-printing'); }, 30); return false; } }
    ] }).el.classList.add('pub-receipt-modal');
  }

  /* ---------------- Shell ---------------- */
  /* Pages registered with nav: { label, order, auth? } add themselves to the menu after Book a tee time. */
  function extraLinks(p) {
    return pages.filter(function (x) { return x.nav && (!x.nav.auth || p); }).sort(function (a, b) { return (a.nav.order || 50) - (b.nav.order || 50); })
      .map(function (x) { return '<a href="#/' + esc(x.id) + '" data-page="' + esc(x.id) + '" data-pri="' + Math.max(2, 70 - (x.nav.order || 50)) + '">' + esc(x.nav.label || x.label) + '</a>'; }).join('');
  }
  function navLinks(p) {
    return '<a href="#/" data-page="book" data-pri="97">Book a tee time</a>' + extraLinks(p) +
      (p ? '<a href="#/bookings" data-page="bookings" data-pri="95">My bookings</a>' + (Pub.cartNav && Pub.cartNav(p) ? '<a href="#/cart" data-page="cart" data-pri="90">Order to the course</a>' : '') + '<a href="#/account" data-page="account">My account</a>' : '') +
      '<a href="#/" data-act="know" data-pri="2">Dress code and hours</a>';   /* opens the handbook box (book.js); folds into More first */
  }
  /* Priority menu: when the header is too narrow for every link, links with data-pri move into a More menu, lowest
     first (Members sign in, then added pages, then Order to the course, and only if still needed My bookings and Book a
     tee time, which French needs at some widths). My account always stays. */
  function fitNav() {
    const nav = ui.$('.pub-nav'), inner = ui.$('.pub-header-inner'), more = nav && ui.$('.pub-more', nav);
    if (!nav || !more || getComputedStyle(nav).display === 'none') return;
    const pop = ui.$('.pub-more-pop', more);
    const links = ui.$$('a[data-ord]', nav).sort(function (a, b) { return a.dataset.ord - b.dataset.ord; });
    links.forEach(function (a) { nav.insertBefore(a, more); });   /* every link back in the bar, in page order */
    more.hidden = true; pop.hidden = true;
    const over = function () { return inner.scrollWidth > inner.clientWidth + 1; };
    if (!over()) return;
    more.hidden = false;
    const out = [];
    links.filter(function (a) { return a.dataset.pri; }).sort(function (a, b) { return a.dataset.pri - b.dataset.pri; })
      .forEach(function (a) { if (over()) { out.push(a); pop.appendChild(a); } });
    out.sort(function (a, b) { return a.dataset.ord - b.dataset.ord; }).forEach(function (a) { pop.appendChild(a); });
    more.classList.toggle('has-active', !!ui.$('a.active', pop));
  }
  let fitTimer = null;
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitNav, 80); });
  /* Fit again once the web fonts have really loaded: on a first visit document.fonts.ready can resolve before Inter has
     even started loading (fonts load when first used), so the bar is measured in the fallback font and then overflows. */
  const fitSoon = function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitNav, 30); };
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(fitSoon);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fitSoon);
    if (document.fonts.load) Promise.all(['400 15px Inter', '500 15px Inter', '600 15px Inter'].map(function (f) { return document.fonts.load(f); })).then(fitSoon, function () {});
  }
  window.addEventListener('load', fitSoon);
  document.addEventListener('click', function (e) {
    const more = ui.$('.pub-more'); if (!more) return;
    const btn = ui.$('.pub-more-btn', more), pop = ui.$('.pub-more-pop', more);
    if (btn.contains(e.target)) { const open = pop.hidden; pop.hidden = !open; btn.setAttribute('aria-expanded', open); return; }
    if (!pop.hidden && (!more.contains(e.target) || e.target.closest('a'))) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const more = ui.$('.pub-more'), pop = more && ui.$('.pub-more-pop', more);
    if (pop && !pop.hidden) { pop.hidden = true; const b = ui.$('.pub-more-btn', more); b.setAttribute('aria-expanded', 'false'); b.focus(); }
  });
  function chrome() {
    const root = document.getElementById('public');
    root.innerHTML =
      '<a class="pub-skip" href="#pub-view">Skip to content</a>' +
      '<header class="pub-header"><div class="pub-header-inner">' +
        '<a class="pub-brand" href="#/" aria-label="' + esc(Club.info.name) + ' public golf home">' + Club.logoImg('pub-crest-img') + '<span class="pub-brand-t"><span class="pub-brand-name">' + esc(Club.info.short) + '</span><span class="pub-brand-sub">Public golf</span></span></a>' +
        '<nav class="pub-nav" aria-label="Main"></nav>' +
        '<div class="pub-me"></div>' +
        '<button type="button" class="pub-menu-btn" aria-label="Open menu"><span class="pub-menu-lines" aria-hidden="true"><i></i><i></i><i></i></span></button>' +
      '</div></header>' +
      '<main id="pub-view" class="pub-main" tabindex="-1"></main>' +
      '<footer class="pub-footer"><div class="pub-footer-inner">' +
        '<div class="flourish">' + Club.logo('pub-crest sm') + '</div>' +
        '<p class="serif pub-footer-name">' + esc(Club.info.name) + '</p>' +
        /* Public simplified (Nov 21): a booking site, so no founding year or social links; the address, phone and members' link stay. */
        '<p>' + esc(Club.info.address) + ' · <a href="' + phoneHref() + '">' + esc(Club.info.phone) + '</a></p>' +
        '<p class="pub-footer-members"><a href="member.html">Members sign in here</a></p>' +
        (Club.info.landAcknowledgement ? '<p class="pub-land">' + esc(Club.info.landAcknowledgement) + '</p>' : '') +
        (Club.i18n ? '<div class="pub-footer-lang" hidden>' + Club.i18n.switchRow('', Club.icon('globe')) + '</div>' : '') +
      '</div></footer>';
    ui.$('.pub-menu-btn', root).addEventListener('click', openMenu);
    ui.on(root, 'click', '[data-act=signout]', function () { signOut(); });
    paintHeader();
  }
  function paintHeader() {
    const p = me();
    const nav = ui.$('.pub-nav'), mine = ui.$('.pub-me'); if (!nav) return;
    nav.innerHTML = navLinks(p) + '<a class="pub-nav-members" href="member.html" data-pri="1">Members sign in here</a>' +
      '<div class="pub-more" hidden><button type="button" class="pub-more-btn" aria-haspopup="true" aria-expanded="false">More' + Club.icon('chevronDown') + '</button><div class="pub-more-pop" hidden></div></div>';
    ui.$$('a', nav).forEach(function (a, i) { a.dataset.ord = i; });
    mine.innerHTML = p
      ? '<a class="pub-me-btn" href="#/account" title="My account">' + ui.avatar(p.firstName + ' ' + p.lastName, 'sm') + '<span class="pub-me-name">' + esc(p.firstName) + '</span></a>'
      : '<a class="pub-signin-link" href="#/signin">Sign in</a><a class="btn btn-primary btn-sm pub-signup-link" href="#/signup">Create account</a>';   /* redesign (Nov 22): Sign in is a word, Create account the one Ink button */
    const fl = ui.$('.pub-footer-lang'); if (fl) fl.hidden = !!p;   /* signed in: language is in My account */
    markActive();
    if (Club.i18n) Club.i18n.translate(ui.$('.pub-header'));   /* French labels are longer: measure those */
    fitNav();
  }
  function markActive() {
    ui.$$('.pub-nav a[data-page]').forEach(function (a) { const on = a.dataset.page === currentId; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  /* Header link "Dress code and hours" (also inside More when folded) */
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('.pub-nav [data-act=know], .pub-more-pop [data-act=know]');
    if (!a || !Pub.openKnow) return;
    e.preventDefault(); const more = ui.$('.pub-more-pop'); if (more) more.hidden = true; Pub.openKnow();
  });
  function openMenu() {
    const p = me();
    const d = ui.drawer({ eyebrow: Club.info.short, title: p ? 'Hello, ' + p.firstName : 'Public golf',
      /* Redesign (Nov 22): a plain hairline list of words, no icons. */
      body: '<div class="pub-menu">' + (Club.i18n && !p ? Club.i18n.switchRow('pub-menu-lang') : '') +
        '<a href="#/"><span>Book a tee time</span></a>' +
        /* Pages registered with nav (Become a member, Gift cards, Takeout ...), as in the header menu. */
        pages.filter(function (x) { return x.nav && (!x.nav.auth || p); }).sort(function (a, b) { return (a.nav.order || 50) - (b.nav.order || 50); })
          .map(function (x) { return '<a href="#/' + esc(x.id) + '"><span>' + esc(x.nav.label || x.label) + '</span></a>'; }).join('') +
        (p ? '<a href="#/bookings"><span>My bookings</span></a>' + (Pub.cartNav && Pub.cartNav(p) ? '<a href="#/cart"><span>Order to the course</span></a>' : '') + '<a href="#/account"><span>My account</span></a>'
          : '<a href="#/signin"><span>Sign in</span></a><a href="#/signup"><span>Create an account</span></a>') +
        (Pub.openKnow ? '<button type="button" data-act="menu-know"><span>Dress code and hours</span></button>' : '') +
        '<a href="member.html"><span>Members sign in here</span></a>' +
        '<a href="' + phoneHref() + '"><span>Call the golf shop, ' + esc(Club.info.phone) + '</span></a>' +
        (p ? '<button type="button" data-act="menu-signout"><span>Sign out</span></button>' : '') +
      '</div>' });
    d.el.classList.add('pub-drawer');
    ui.on(d.body, 'click', 'a', function () { d.close(); });
    ui.on(d.body, 'click', '[data-act=menu-signout]', function () { d.close(); signOut(); });
    ui.on(d.body, 'click', '[data-act=menu-know]', function () { d.close(); Pub.openKnow(); });
  }
  function signIn(id, quiet) {
    setSession(id); paintHeader();
    const p = me(); if (p && !quiet) ui.toast('Welcome, ' + p.firstName);
  }
  function signOut() {
    setSession(null);
    paintHeader();
    ui.toast('You have signed out. See you on the course');
    if (location.hash.replace(/^#\/?/, '')) location.hash = '#/'; else render();
  }

  /* ---------------- Router ---------------- */
  function parse() {
    const h = location.hash.replace(/^#\/?/, ''); const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { id: parts[0] || 'book', params: parts.slice(1) };
  }
  function render() {
    const host = document.getElementById('pub-view'); if (!host) return;
    const r = parse();
    const page = pages.find(function (x) { return x.id === r.id; }) || pages.find(function (x) { return x.id === 'book'; });
    if (!page) return;
    if (page.auth && !me()) { Pub.afterAuth = '#/' + r.id; location.replace('#/signin'); return; }
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    const same = currentId === page.id;
    currentId = page.id;
    host.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'pub-page' + (same ? '' : ' view-enter');
    host.appendChild(view);
    document.title = (page.title || page.label) + ' · ' + Club.info.short + ' public golf';
    try { cleanup = page.render(view, r.params, me()) || null; }
    catch (e) {
      console.error(e);
      view.innerHTML = '<div class="panel pub-error">' + ui.empty({ icon: 'alert', title: 'This page could not load', text: 'Please refresh. If it keeps happening, call the golf shop at ' + Club.info.phone + '.' }) + '</div>';
    }
    paintHeader();
    ui.animateIn(view);
    if (!same) window.scrollTo({ top: 0 });
  }

  const Pub = {
    register: function (p) { pages.push(p); },
    /** Sections other files add to the public My account page: { order, html(player), wire(root, player, redraw) }. */
    accountSections: [],
    addAccountSection: function (sec) { this.accountSections.push(sec); },
    me: me, signIn: signIn, signOut: signOut, render: render, paintHeader: paintHeader,
    go: function (path) { location.hash = '#/' + String(path || '').replace(/^#?\/?/, ''); },
    afterAuth: null,
    /* accounts */
    hashPassword: hashPassword, checkPassword: checkPassword, byEmail: byEmail, readDetails: readDetails,
    passwordProblem: passwordProblem, setErr: setErr, clearErrs: clearErrs, focusFirstErr: focusFirstErr, normPostal: normPostal, normPhone: normPhone, EMAIL_RE: EMAIL_RE,
    /* rules */
    toMin: toMin, today: today, settings: settings, courseStatus: courseStatus, cartRuleFor: cartRuleFor, daySlots: daySlots, bookable: bookable, bookingDays: bookingDays,
    recheck: recheck, quote: quote, addonList: addonList, cartFee: cartFee, bandLabel: bandLabel, blocksOn: blocksOn, minutesUntil: minutesUntil, REFUND_HOURS: REFUND_HOURS,
    myTeeTimes: myTeeTimes, paymentFor: paymentFor, hasMine: hasMine,
    /* formatting */
    r2: r2, plural: plural, longDate: longDate, dayName: dayName, timeParts: timeParts, phoneHref: phoneHref,
    cardLine: cardLine, paidWith: paidWith, markChip: markChip, downloadIcs: downloadIcs, openReceipt: openReceipt, receiptHTML: receiptHTML, ensureReceipts: ensureReceipts
  };
  window.Pub = Pub;

  window.addEventListener('hashchange', render);
  window.addEventListener('club:weather', function () { if (document.getElementById('pub-view') && !document.querySelector('.overlay')) render(); });
  /* Another tab changed the data (the staff tee sheet, or this site in another window). */
  S.subscribe('$external', function () {
    if (!document.getElementById('pub-view') || document.querySelector('.overlay')) return;
    if (currentId === 'bookings' || currentId === 'account') render(); else paintHeader();
    if (Pub.onExternal) Pub.onExternal();
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('public');
    if (getSession() && !me()) setSession(null);
    backfillReceipts();
    chrome(); render();
  });
})();
