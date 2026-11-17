/* Club.takeout: takeout orders from the Gallery Taphouse & Grill kitchen, picked up at the clubhouse. Shared by the
   members' portal (js/portal/takeout.js), the public site (js/public/takeout.js) and the staff queue (js/modules/takeout.js).
   The menu is the Gallery menu staff keep in 'menuItems' (js/modules/dining.js): available items, without the taps.

   Order doc ('takeoutOrders'):
     { id ('to_…'), no (1001, 1002 …; shown 'T1001'), placedAt (ISO), date (pickup 'YYYY-MM-DD'), time (pickup 'HH:MM'),
       status: 'new'|'ready'|'picked-up'|'cancelled', source: 'portal'|'public',
       customer: { kind: 'member'|'public'|'guest', memberId, publicPlayerId, name, phone, email },
       items: [{ menuId, name, price (menu price), qty }], notes, subtotal, tax, total (tax included),
       payment: { method: 'account'|'card'|'gift', label, brand, last4, giftCardId, giftAmount, due (paid by account or card), chargeId },
       receiptId, refund: { at, receiptId } | null, history: [{ at, status, by }], readyAt, pickedUpAt, cancelledAt, cancelledBy, cancelReason }

   Pickup rules (settings in $takeoutSettings, placeholders for the club to confirm): pickups every 15 minutes while the kitchen
   is open (7:00 AM to 9:30 PM, the Gallery's hours in the portal), at least 30 minutes from now, up to 6 days ahead. Breakfast
   items until 2:00 PM (breakfast is served until 2 PM). Friday Night Pizza on Fridays only, from 5:30 PM (dinner).

   Club.takeout.menu() / sections(items) / slots(date, lines) / check(lines, date, time) -> '' or a reason / totals(lines)
   Club.takeout.place(o) -> { ok, order, receipt, msg }      o: { customer, lines: [{ menuId, qty }], date, time, notes, source, pay: checkout result }
   Club.takeout.setStatus(id, status, by) / cancel(id, { by, reason }) -> refunds the account, card or gift card
   Club.takeout.canCancel(order) / code(order) 'T1042' / statusLabel(order) / progressHTML(order) / receiptOf(order) */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  /* Stored text (receipt notes) is always English: Club.fmtEn on the public site and portal, where Club.fmt can be French. */
  const EN = Club.fmtEn || fmt;
  const COLL = 'takeoutOrders';
  /* Placeholders taken from what the portal already shows for the Gallery (js/portal/dining.js: 7:00 AM to 9:30 PM, dinner
     from 5:30 PM). Breakfast until 2:00 PM is the club's published rule. Staff change these on the Takeout page. */
  const DEFAULTS = { open: '07:00', close: '21:30', step: 15, lead: 30, daysAhead: 6, pizzaFrom: '17:30', breakfastUntil: '14:00', cancelBefore: 30, paused: false };
  const SECTIONS = ['Breakfast', 'Soup & salads', 'Sandwiches', 'Sides', 'Snacks & shares', 'Baskets & bowls', 'Handhelds', 'Main attractions'];
  const SKIP = { 'On tap': 1 };            /* draft beer is poured in the Gallery, not packed to go */
  const MAX_QTY = 20;
  const STATUS = { new: 'Order received', ready: 'Ready for pickup', 'picked-up': 'Picked up', cancelled: 'Cancelled' };

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function today() { return Club.date.today(); }
  function settings() { return Object.assign({}, DEFAULTS, S.getObj('takeoutSettings', {}) || {}); }
  function saveSettings(p) { S.setObj('takeoutSettings', Object.assign({}, S.getObj('takeoutSettings', {}) || {}, p)); }

  /* ---------------- Menu ---------------- */
  function isPizza(i) { return !!i && /pizza/i.test(i.name) && /friday/i.test(i.name + ' ' + (i.description || '')); }
  function isBreakfast(i) { return !!i && i.section === 'Breakfast'; }
  function menu() {
    return S.all('menuItems').filter(function (i) { return i.available !== false && !SKIP[i.section] && (i.venue === 'All' || i.venue === 'Gallery Taphouse & Grill' || !i.venue); });
  }
  function item(id) { return S.find('menuItems', id); }
  function sections(items) {
    const seen = {}, out = [];
    SECTIONS.concat(items.map(function (i) { return i.section; })).forEach(function (s) {
      if (!s || seen[s] || SKIP[s]) return; seen[s] = 1;
      if (items.some(function (i) { return i.section === s; })) out.push(s);
    });
    return out;
  }
  function isFriday(date) { return fmt.toDate(date).getDay() === 5; }
  function nextFriday(from) { let d = from || today(); for (let i = 0; i < 7; i++) { if (isFriday(d)) return d; d = Club.date.addDays(d, 1); } return d; }
  /** The first Friday open for pickup in the ordering window, or null. */
  function pizzaDay() { return days().find(function (d) { return isFriday(d) && slots(d, []).some(function (x) { return toMin(x.time) >= toMin(settings().pizzaFrom); }); }) || null; }

  /* ---------------- Pickup times ---------------- */
  function days() { const s = settings(), out = []; for (let i = 0; i <= s.daysAhead; i++) out.push(Club.date.fromToday(i)); return out; }
  /** Why a menu item cannot be picked up then ('' when it can). time may be null (any time that day). */
  function itemRule(i, date, time) {
    const s = settings();
    if (isPizza(i)) {
      if (date && !isFriday(date)) return 'Friday Night Pizza is for pickup on Fridays only.';
      if (time && toMin(time) < toMin(s.pizzaFrom)) return 'Friday Night Pizza is ready from ' + fmt.time(s.pizzaFrom) + '.';
    }
    if (isBreakfast(i) && time && toMin(time) > toMin(s.breakfastUntil)) return 'Breakfast is served until ' + fmt.time(s.breakfastUntil) + '.';
    return '';
  }
  function linesItems(lines) { return (lines || []).map(function (l) { return item(l.menuId); }).filter(Boolean); }
  /** Every pickup time on a date: [{ time, ok, reason }]. Times the kitchen cannot make are left out; rules from the
      items in the order (breakfast, Friday pizza) mark times as not ok with the reason. */
  function slots(date, lines) {
    const s = settings(), items = linesItems(lines), out = [];
    if (s.paused) return out;
    const step = Math.max(5, +s.step || 15);
    let from = toMin(s.open);
    if (date === today()) { const earliest = nowMin() + (+s.lead || 0); from = Math.max(from, Math.ceil(earliest / step) * step); }
    if (date < today()) return out;
    for (let m = from; m <= toMin(s.close); m += step) {
      const t = toHM(m); let reason = '';
      for (let k = 0; k < items.length && !reason; k++) reason = itemRule(items[k], date, t);
      out.push({ time: t, ok: !reason, reason: reason });
    }
    return out;
  }
  /** '' when the order can be picked up then, else what is wrong. */
  function check(lines, date, time) {
    const s = settings();
    if (s.paused) return 'Online takeout orders are paused right now. Please call the Gallery at ' + Club.info.phone + '.';
    if (!lines || !lines.length) return 'Add something from the menu first.';
    for (let k = 0; k < lines.length; k++) {
      const i = item(lines[k].menuId);
      if (!i || i.available === false || SKIP[i.section]) return (i ? i.name : 'An item') + ' is no longer available. Please remove it.';
      if (!(lines[k].qty >= 1 && lines[k].qty <= MAX_QTY)) return 'Choose between 1 and ' + MAX_QTY + ' of ' + i.name + '.';
    }
    if (!date || !time) return 'Choose a pickup time.';
    if (days().indexOf(date) < 0) return 'Choose a pickup day in the next ' + (s.daysAhead + 1) + ' days.';
    const sl = slots(date, lines).find(function (x) { return x.time === time; });
    if (!sl) return 'That pickup time is no longer available. Please choose another.';
    return sl.reason;
  }

  /* ---------------- Money ---------------- */
  function priced(lines) {
    return (lines || []).map(function (l) { const i = item(l.menuId); return i ? { menuId: i.id, name: i.name, price: r2(i.price), qty: Math.max(1, Math.min(MAX_QTY, Math.round(+l.qty || 1))) } : null; }).filter(Boolean);
  }
  function totals(lines) {
    const items = lines && lines[0] && lines[0].price != null ? lines : priced(lines);
    const subtotal = r2(items.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    const tax = r2(subtotal * Club.taxRate());
    return { subtotal: subtotal, tax: tax, total: r2(subtotal + tax), count: items.reduce(function (a, l) { return a + l.qty; }, 0) };
  }
  /** Receipt lines at tax-included unit prices that add up to exactly the total (any rounding cent on one unit). */
  function receiptLines(items, total) {
    const sub = items.reduce(function (a, l) { return a + l.qty * l.price; }, 0), f = sub ? total / sub : 1;
    const out = items.map(function (l) { return { name: l.name, qty: l.qty, price: r2(l.price * f) }; });
    const diff = r2(total - out.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    if (diff && out.length) {
      const one = out.find(function (l) { return l.qty === 1; });
      if (one) one.price = r2(one.price + diff);
      else { const last = out[out.length - 1]; last.qty--; out.push({ name: last.name, qty: 1, price: r2(last.price + diff) }); }
    }
    return out;
  }
  function code(o) { return 'T' + o.no; }
  function itemsText(items) { return items.map(function (l) { return (l.qty > 1 ? l.qty + ' x ' : '') + l.name; }).join(', '); }
  /** 'Today at 7:30 AM' / 'Saturday, Nov 21 at 7:30 AM'. en: English whatever the display language (for stored text). */
  function pickupText(o, en) {
    const F = en ? EN : fmt;
    return (o.date === today() ? 'Today' : F.dayShortMonth ? F.dayShortMonth(o.date) : fmt.toDate(o.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })) + ' at ' + F.time(o.time);
  }
  function nextNo() { let n = +S.getObj('takeoutSeq', 1000) || 1000; S.all(COLL).forEach(function (o) { if (o.no > n) n = o.no; }); n++; S.setObj('takeoutSeq', n); return n; }

  /* ---------------- Placing an order ---------------- */
  function place(o) {
    const err = check(o.lines, o.date, o.time);
    if (err) return { ok: false, msg: err };
    const c = o.customer || {};
    if (!String(c.name || '').trim()) return { ok: false, msg: 'Enter the name for the order.' };
    const pay = o.pay || {};
    const items = priced(o.lines), t = totals(items);
    const g = pay.gift && pay.gift.card ? Club.giftcards.get(pay.gift.card.id) : null;
    const giftAmount = g ? r2(Math.min(g.balance, t.total)) : 0;
    const due = r2(t.total - giftAmount);
    const method = due <= 0 ? 'gift' : pay.method === 'account' && c.memberId ? 'account' : 'card';
    if (method === 'card' && !(pay.card && pay.card.last4)) return { ok: false, msg: 'Choose a card to pay with.' };
    const no = nextNo();
    const order = S.insert(COLL, { id: S.uid('to'), no: no, placedAt: new Date().toISOString(), date: o.date, time: o.time, status: 'new', source: o.source || 'public',
      customer: { kind: c.kind || (c.memberId ? 'member' : c.publicPlayerId ? 'public' : 'guest'), memberId: c.memberId || null, publicPlayerId: c.memberId ? null : (c.publicPlayerId || null),
        name: String(c.name).trim(), phone: String(c.phone || '').trim(), email: String(c.email || '').trim().toLowerCase() },
      items: items, notes: String(o.notes || '').trim().slice(0, 300), subtotal: t.subtotal, tax: t.tax, total: t.total,
      payment: null, receiptId: null, refund: null, history: [{ at: new Date().toISOString(), status: 'new', by: c.kind === 'member' ? 'member' : 'customer' }] });
    const title = 'Takeout order ' + code(order);
    const lines = receiptLines(items, t.total);
    const note = 'Pickup ' + pickupText(order, true) + ' at the Gallery Taphouse & Grill.';
    const cardLabel = method === 'card' || (pay.card && due > 0) ? Club.receipts.cardLabel(pay.card.brand, pay.card.last4) : null;
    if (g && giftAmount > 0) Club.giftcards.redeem(g.id, giftAmount, { where: 'takeout', refId: order.id, note: title });
    let chargeId = null, rc = null;
    if (method === 'account' && due > 0) {
      const ch = Club.chargeMember(c.memberId, { description: title + ' · ' + itemsText(items), category: 'Dining', amount: due, source: 'takeout', refId: order.id, date: today(), title: title, lines: lines, noReceipt: !!giftAmount });
      chargeId = ch ? ch.id : null;
      if (!giftAmount) { rc = Club.receipts.forRef('takeout', order.id)[0] || null; if (rc && !rc.tenders) rc = S.update('receipts', rc.id, Object.assign(rc.note ? {} : { note: note }, onlineAccount(due))); }
    }
    const who = { memberId: c.memberId || null, publicPlayerId: c.memberId ? null : (c.publicPlayerId || null), name: c.memberId || c.publicPlayerId ? undefined : String(c.name).trim() };
    if (giftAmount) {
      rc = Club.giftcards.receipt(Object.assign({}, who, { title: title, lines: lines, total: t.total, gift: { card: g, amount: giftAmount },
        rest: { method: method === 'account' ? 'account' : 'card', label: method === 'account' ? 'Member account' : cardLabel, amount: due }, source: 'takeout', refId: order.id, chargeId: chargeId, note: note, online: true }));
    } else if (method === 'card') {
      rc = Club.receipts.create(Object.assign({}, who, { title: title, lines: lines, total: t.total, method: 'card', methodLabel: cardLabel, source: 'takeout', refId: order.id, note: note,
        tenders: [{ method: 'card', amount: t.total, online: true }], channel: 'online' }));
    }
    const label = rc ? rc.methodLabel : method === 'account' ? 'Charged to your member account' : cardLabel;
    const out = S.update(COLL, order.id, { payment: { method: method, label: label, brand: pay.card ? pay.card.brand : null, last4: pay.card ? pay.card.last4 : null,
      giftCardId: g && giftAmount ? g.id : null, giftAmount: giftAmount, due: due, chargeId: chargeId }, receiptId: rc ? rc.id : null });
    return { ok: true, order: out, receipt: rc };
  }

  /** Takeout is ordered and paid online: the account charge's receipt as an account tender, channel 'online' (daily close). */
  function onlineAccount(amount) { return { tenders: [{ method: 'account', amount: r2(amount), online: true }], channel: 'online' }; }

  /* ---------------- Status ---------------- */
  function get(id) { return S.find(COLL, id); }
  function setStatus(id, status, by) {
    const o = get(id); if (!o || o.status === status || o.status === 'cancelled') return o;
    /* A step back (picked up to ready, ready to new) is a staff correction: it clears the later time and keeps the earlier one. */
    const back = (status === 'ready' && o.status === 'picked-up') || (status === 'new' && o.status !== 'new');
    const patch = { status: status, history: (o.history || []).concat([Object.assign({ at: new Date().toISOString(), status: status, by: by || 'staff' }, back ? { back: true } : {})]) };
    if (status === 'ready') { patch.readyAt = back && o.readyAt ? o.readyAt : new Date().toISOString(); patch.pickedUpAt = null; }
    if (status === 'picked-up') patch.pickedUpAt = new Date().toISOString();
    if (status === 'new') { patch.readyAt = null; patch.pickedUpAt = null; }
    return S.update(COLL, id, patch);
  }
  function minutesUntil(o) { const d = fmt.toDate(o.date); d.setHours(0, toMin(o.time), 0, 0); return (d.getTime() - Date.now()) / 60000; }
  /** A customer can cancel online while the kitchen has not marked it ready, up to cancelBefore minutes before pickup. */
  function canCancel(o) { return !!o && o.status === 'new' && minutesUntil(o) >= settings().cancelBefore; }
  /** Cancel and refund: the account charge is credited, a card payment refunded, a gift card amount put back. One credit receipt. */
  function cancel(id, ctx) {
    ctx = ctx || {};
    const o = get(id); if (!o || o.status === 'cancelled' || o.status === 'picked-up') return o;
    const p = o.payment || {}, c = o.customer || {};
    const title = 'Takeout order ' + code(o) + ' cancelled';
    const lines = receiptLines(o.items, o.total);
    const who = { memberId: c.memberId || null, publicPlayerId: c.memberId ? null : (c.publicPlayerId || null), name: c.memberId || c.publicPlayerId ? undefined : c.name };
    const note = (ctx.by === 'staff' ? 'Cancelled by the Gallery.' : 'Cancelled online.') + (ctx.reason ? ' ' + ctx.reason : '');
    let rc = null;
    if (p.giftCardId && p.giftAmount > 0) {
      Club.giftcards.refund(p.giftCardId, p.giftAmount, { where: 'takeout', refId: o.id, note: title });
      let chargeId = null;
      if (p.method === 'account' && p.due > 0) { const ch = Club.chargeMember(c.memberId, { description: 'Credit: ' + title, category: 'Dining', amount: -p.due, source: 'takeout', refId: o.id, date: today(), noReceipt: true }); chargeId = ch ? ch.id : null; }
      rc = Club.giftcards.receipt(Object.assign({}, who, { kind: 'credit', title: title, lines: lines, total: o.total, gift: { card: Club.giftcards.get(p.giftCardId), amount: p.giftAmount },
        rest: { method: p.method === 'account' ? 'account' : 'card', label: p.method === 'account' ? 'Member account' : Club.receipts.cardLabel(p.brand, p.last4), amount: p.due }, source: 'takeout', refId: o.id, chargeId: chargeId, note: note, online: true }));
    } else if (p.method === 'account' && p.due > 0) {
      const ch = Club.chargeMember(c.memberId, { description: 'Credit: ' + title, category: 'Dining', amount: -p.due, source: 'takeout', refId: o.id, date: today(), title: title, lines: lines });
      rc = ch ? Club.receipts.forRef('takeout', o.id).find(function (r) { return r.kind === 'credit'; }) || null : null;
      if (rc && (!rc.note || !rc.tenders)) rc = S.update('receipts', rc.id, Object.assign(rc.note ? {} : { note: note }, rc.tenders ? {} : onlineAccount(p.due)));
    } else if (p.method === 'card' && p.due > 0) {
      rc = Club.receipts.create(Object.assign({}, who, { kind: 'credit', title: title, lines: lines, total: o.total, method: 'card', methodLabel: Club.receipts.cardLabel(p.brand, p.last4), source: 'takeout', refId: o.id, note: note,
        tenders: [{ method: 'card', amount: o.total, online: true }], channel: 'online' }));
    }
    const at = new Date().toISOString();
    return S.update(COLL, id, { status: 'cancelled', cancelledAt: at, cancelledBy: ctx.by || 'staff', cancelReason: ctx.reason || '', refund: { at: at, receiptId: rc ? rc.id : null },
      history: (o.history || []).concat([{ at: at, status: 'cancelled', by: ctx.by || 'staff' }]) });
  }

  /* ---------------- Lookups and shared markup ---------------- */
  function newestFirst(a, b) { return String(b.placedAt).localeCompare(String(a.placedAt)); }
  function forMember(id) { return S.where(COLL, function (o) { return o.customer && o.customer.memberId === id; }).sort(newestFirst); }
  function forPublic(id) { return S.where(COLL, function (o) { return o.customer && o.customer.publicPlayerId === id; }).sort(newestFirst); }
  function byIds(ids) { return (ids || []).map(get).filter(Boolean).sort(newestFirst); }
  function active(o) { return o.status === 'new' || o.status === 'ready'; }
  function statusLabel(o) { return STATUS[o.status] || o.status; }
  function receiptOf(o) { return o && o.receiptId && Club.receipts ? Club.receipts.get(o.receiptId) : null; }
  function refundReceiptOf(o) { return o && o.refund && o.refund.receiptId && Club.receipts ? Club.receipts.get(o.refund.receiptId) : null; }
  /** Received, Ready for pickup, Picked up: a three-step tracker (or a cancelled note). */
  function progressHTML(o) {
    if (o.status === 'cancelled') return '<p class="to-track-off">' + Club.icon('close') + '<span>Cancelled' + (o.refund ? ', refunded' : '') + '</span></p>';
    const steps = [['new', 'Received'], ['ready', 'Ready for pickup'], ['picked-up', 'Picked up']];
    const at = steps.findIndex(function (s) { return s[0] === o.status; });
    return '<ol class="to-track" aria-label="Order status: ' + esc(statusLabel(o)) + '">' + steps.map(function (s, i) {
      return '<li class="' + (i < at ? 'done' : i === at ? 'now' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '><span class="to-track-dot">' + (i <= at ? Club.icon('check') : '') + '</span><span class="to-track-l">' + esc(s[1]) + '</span></li>';
    }).join('') + '</ol>';
  }

  /* ==================================================================
     The ordering view, the same on the portal and the public site (css/public/takeout.css, imported by the portal's).
     mountOrder(host, ctx) ctx: { site: 'portal'|'public', key (whose draft), customer: { kind, memberId, publicPlayerId, name,
       phone, email } | null for a guest, member, player, account (may charge a member account),
       bar: { show({ summary, label, onClick }), hide() }, onPlaced(order, receipt) } -> cleanup()
     ================================================================== */
  const drafts = {};
  const DIET = { GF: 'Gluten free', V: 'Vegetarian', VG: 'Vegan' };
  function menuPrice(v) { return Math.round(v) === v ? fmt.money(v, false) : fmt.money(v); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  function dayChip(d) {
    const dt = fmt.toDate(d), t = d === today() ? 'Today' : d === Club.date.addDays(today(), 1) ? 'Tomorrow' : dt.toLocaleDateString('en-CA', { weekday: 'short' }).replace('.', '');
    return { top: t, n: dt.getDate(), mo: dt.toLocaleDateString('en-CA', { month: 'short' }).replace('.', '') };
  }
  function longDay(d) { return fmt.toDate(d).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }); }

  function mountOrder(host, ctx) {
    const P = ctx.site === 'portal';
    const link = P ? 'p-link' : 'pub-link';
    const key = ctx.key || 'guest';
    const d = drafts[key] = drafts[key] || { lines: [], date: null, time: null, notes: '', name: ctx.customer ? ctx.customer.name : '', phone: ctx.customer ? ctx.customer.phone || '' : '', email: ctx.customer ? ctx.customer.email || '' : '' };
    let pay = null, busy = false;
    function qty(id) { const l = d.lines.find(function (x) { return x.menuId === id; }); return l ? l.qty : 0; }
    function cleanLines() { d.lines = d.lines.filter(function (l) { const i = item(l.menuId); return i && i.available !== false && !SKIP[i.section] && l.qty > 0; }); }
    function dayOpen(day) { return slots(day, []).length > 0; }
    function pickDefaultDay() {
      const ds = days();
      if (d.date && ds.indexOf(d.date) >= 0 && dayOpen(d.date)) return;
      d.date = ds.find(dayOpen) || ds[0]; d.time = null;
    }

    function itemHTML(i) {
      const n = qty(i.id), pz = isPizza(i);
      return '<li class="to-item' + (n ? ' in-order' : '') + (pz ? ' is-pizza' : '') + '" data-item="' + esc(i.id) + '">' +
        '<div class="to-item-main"><div class="to-item-name">' + esc(i.name) + (pz ? '<span class="to-tag">Fridays</span>' : '') + '</div>' +
          (i.description ? '<div class="to-item-desc">' + esc(i.description) + '</div>' : '') +
          ((i.dietary || []).length ? '<div class="to-item-diet">' + i.dietary.map(function (x) { return '<span title="' + esc(DIET[x] || x) + '">' + esc(DIET[x] || x) + '</span>'; }).join('') + '</div>' : '') + '</div>' +
        '<div class="to-item-side"><span class="to-item-price">' + esc(menuPrice(i.price)) + '</span>' + ctlHTML(i.id, n, i.name) + '</div></li>';
    }
    function ctlHTML(id, n, name) {
      if (!n) return '<button type="button" class="btn btn-sm to-add" data-add="' + esc(id) + '" aria-label="Add ' + esc(name) + '">' + Club.icon('plus') + '<span>Add</span></button>';
      return '<div class="to-step" role="group" aria-label="' + esc(name) + ' quantity"><button type="button" data-step="-1" data-id="' + esc(id) + '" aria-label="One fewer ' + esc(name) + '">−</button><output aria-live="polite">' + n + '</output><button type="button" data-step="1" data-id="' + esc(id) + '" aria-label="One more ' + esc(name) + '"' + (n >= MAX_QTY ? ' disabled' : '') + '>+</button></div>';
    }
    function menuHTML() {
      const items = menu(), secs = sections(items), s = settings();
      const pz = items.find(isPizza);
      return (pz ? '<section class="to-pizza" data-reveal><div class="to-pizza-copy"><div class="eyebrow">Fridays from ' + esc(fmt.time(s.pizzaFrom)) + '</div><h3>' + esc(pz.name) + '</h3><p>' + esc(pz.description || '') + '</p></div>' +
          '<div class="to-pizza-side"><span class="to-pizza-price">' + esc(menuPrice(pz.price)) + '</span><div class="to-pizza-ctl" data-ctl="' + esc(pz.id) + '">' + ctlHTML(pz.id, qty(pz.id), pz.name) + '</div></div></section>' : '') +
        '<nav class="to-secnav" aria-label="Menu sections">' + secs.map(function (x) { return '<button type="button" class="to-secbtn" data-sec="' + esc(slug(x)) + '">' + esc(x) + '</button>'; }).join('') + '</nav>' +
        secs.map(function (x) {
          return '<section class="to-sec" id="to-sec-' + esc(slug(x)) + '"><div class="to-sec-head"><h3>' + esc(x) + '</h3>' + (x === 'Breakfast' ? '<span class="to-sec-note">Pickup until ' + esc(fmt.time(s.breakfastUntil)) + '</span>' : '') + '</div>' +
            '<ul class="to-items">' + items.filter(function (i) { return i.section === x; }).map(itemHTML).join('') + '</ul></section>';
        }).join('');
    }
    function whoHTML() {
      if (ctx.customer) {
        return '<div class="to-who"><div class="to-who-name">' + Club.icon('user') + '<span>' + esc(ctx.customer.name) + '</span></div>' +
          '<div class="field"><label for="to-phone-' + key + '">Phone for this order *</label><input class="input" id="to-phone-' + key + '" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="' + esc(d.phone) + '" placeholder="(204) 555-0123"><span class="field-hint">The Gallery calls if there is a question about your order.</span></div></div>';
      }
      return '<div class="to-who"><p class="to-who-note">Ordering as a guest. ' + (P ? '' : '<a href="#/signin" data-to="signin">Sign in</a> to see your orders on any device.') + '</p><div class="form-grid">' +
        '<div class="field span-2"><label for="to-name">Name for the order *</label><input class="input" id="to-name" name="name" autocomplete="name" maxlength="60" value="' + esc(d.name) + '"></div>' +
        '<div class="field"><label for="to-phone">Phone *</label><input class="input" id="to-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="' + esc(d.phone) + '" placeholder="(204) 555-0123"></div>' +
        '<div class="field"><label for="to-email">Email *</label><input class="input" id="to-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" value="' + esc(d.email) + '"><span class="field-hint">For your receipt.</span></div></div></div>';
    }
    host.innerHTML = '<div class="to-wrap to-' + ctx.site + '">' +
      '<div class="to-menu">' + menuHTML() + '</div>' +
      '<aside class="to-order panel" data-reveal aria-labelledby="to-order-h"><div class="panel-head"><div><div class="eyebrow">Pickup at the clubhouse</div><h3 id="to-order-h">Your order</h3></div><span class="to-count"></span></div>' +
        '<div class="panel-body"><div class="to-lines"></div>' +
          '<div class="to-flow"></div>' +
          '<p class="to-fine">Prices include tax at checkout. Questions about your order? Call the clubhouse at <a href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</p>' +
        '</div></aside></div>';
    const root = ui.$('.to-wrap', host), orderEl = ui.$('.to-order', root);
    /* Checkout in steps (Club.checkout.steps): 1 Details (pickup day and time, notes, contact), 2 Payment, 3 Review.
       The order lines above stay live while the menu is open; on Review they show inside the review instead. */
    const flow = Club.checkout.steps(ui.$('.to-flow', root), { site: ctx.site,
      steps: [
        { id: 'details', label: 'Details', next: 'Continue to payment',
          html: '<div class="to-when"></div>' +
            '<div class="field to-notes"><label for="to-notes-' + key + '">Notes for the kitchen <span class="muted">(optional)</span></label><textarea class="textarea" id="to-notes-' + key + '" name="notes" maxlength="300" rows="2" placeholder="Allergies, sauce on the side, cutlery">' + esc(d.notes) + '</textarea></div>' +
            whoHTML() },
        { id: 'pay', label: 'Payment', next: 'Continue to review',
          html: (P ? '' : '<div class="to-pay-h"><span class="label-caps">Payment</span><span class="pub-secure">' + Club.icon('key') + 'Secure</span></div>') + '<div class="to-pay"></div>' },
        { id: 'review', label: 'Review', html: '<div class="to-review"></div>',
          action: '<button type="button" class="btn btn-primary to-place" data-to="place">' + Club.icon('check') + '<span>Place order</span></button>' }
      ],
      leave: function (id) {
        if (id === 'details') return detailsOk();
        const r = pay.validate();
        if (!r.ok && r.declined) pay.fail('');   /* a declined card is only known when the order is placed */
        return r.ok || !!r.declined;
      },
      enter: function (id) { orderEl.classList.toggle('is-review', id === 'review'); paintPlace(); } });
    pay = Club.checkout.mount(ui.$('.to-pay', root), { site: ctx.site, member: ctx.member || null, player: ctx.player || null, account: !!ctx.account, gift: true, amount: function () { return totals(d.lines).total; }, onChange: function () { paintPlace(); } });

    function drawLines() {
      cleanLines();
      const items = priced(d.lines), t = totals(items);
      ui.$('.to-count', root).textContent = t.count ? t.count + (t.count === 1 ? ' item' : ' items') : '';
      ui.$('.to-lines', root).innerHTML = items.length
        ? '<ul class="to-olines">' + items.map(function (l) {
            return '<li><div class="to-oline-main"><span class="to-oline-name">' + esc(l.name) + '</span><span class="to-oline-each">' + esc(menuPrice(l.price)) + ' each</span></div>' + ctlHTML(l.menuId, l.qty, l.name) + '<span class="to-oline-amt num">' + esc(fmt.money(l.qty * l.price)) + '</span></li>';
          }).join('') + '</ul>' +
          '<dl class="to-totals"><div><dt>Subtotal</dt><dd class="num">' + esc(fmt.money(t.subtotal)) + '</dd></div><div><dt>Tax <span class="muted">GST 5% + PST 7%</span></dt><dd class="num">' + esc(fmt.money(t.tax)) + '</dd></div><div class="to-total"><dt>Total</dt><dd class="num">' + esc(fmt.money(t.total)) + '</dd></div></dl>'
        : '<p class="to-empty">' + Club.icon('dining') + '<span>Add dishes from the menu. Pickup is at the Gallery Taphouse &amp; Grill.</span></p>';
      drawWhen(); paintPlace();
      if (pay) pay.refresh();
    }
    function drawWhen() {
      const ds = days(), s = settings(), items = linesItems(d.lines);
      if (s.paused) { ui.$('.to-when', root).innerHTML = '<p class="to-rule is-bad">' + Club.icon('alert') + '<span>Online takeout orders are paused right now. Please call the clubhouse at ' + esc(Club.info.phone) + '.</span></p>'; return; }
      const sl = slots(d.date, d.lines), okTimes = sl.filter(function (x) { return x.ok; });
      if (d.time && !okTimes.some(function (x) { return x.time === d.time; })) d.time = null;
      const groups = [['Morning', 0, 720], ['Afternoon', 720, 1020], ['Evening', 1020, 1440]];
      const notes = [];
      const pz = items.find(isPizza), bf = items.find(isBreakfast);
      if (pz && bf) notes.push(['bad', 'Breakfast (until ' + fmt.time(s.breakfastUntil) + ') and ' + pz.name + ' (from ' + fmt.time(s.pizzaFrom) + ') cannot be picked up together. Please place them as two orders.']);
      else if (pz && !isFriday(d.date)) notes.push(['bad', pz.name + ' is for pickup on Fridays only.' + (pizzaDay() ? '' : ' There is no Friday open for orders right now.'), pizzaDay()]);
      else if (pz) notes.push(['', pz.name + ' is ready from ' + fmt.time(s.pizzaFrom) + '.']);
      else if (bf) notes.push(['', 'Breakfast is served until ' + fmt.time(s.breakfastUntil) + '.']);
      if (!sl.length) notes.push(['', 'No more pickups today. Please choose another day.']);
      ui.$('.to-when', root).innerHTML = '<div class="to-when-h"><span class="label-caps">Pickup</span>' + (d.time ? '<span class="to-when-sum">' + esc(longDay(d.date)) + ', ' + esc(fmt.time(d.time)) + '</span>' : '') + '</div>' +
        '<div class="to-days" role="radiogroup" aria-label="Pickup day">' + ds.map(function (x) {
          const c = dayChip(x), open = dayOpen(x), on = x === d.date;
          return '<button type="button" role="radio" aria-checked="' + on + '" class="to-day' + (on ? ' active' : '') + (open ? '' : ' is-off') + '" data-day="' + x + '"' + (open ? '' : ' disabled') + ' aria-label="' + esc(longDay(x) + (open ? '' : ', closed')) + '">' +
            '<span class="to-day-w">' + esc(c.top) + '</span><span class="to-day-n">' + c.n + '</span><span class="to-day-m">' + (isFriday(x) ? 'Pizza' : esc(c.mo)) + '</span></button>';
        }).join('') + '</div>' +
        (sl.length ? '<div class="field to-time-f"><label for="to-time-' + key + '">Pickup time *</label><select class="select to-time" id="to-time-' + key + '" name="time"' + (okTimes.length ? '' : ' disabled') + '><option value="">' + (okTimes.length ? 'Choose a time' : 'No times for this order') + '</option>' +
          groups.map(function (g) {
            const os = sl.filter(function (x) { const m = toMin(x.time); return m >= g[1] && m < g[2]; });
            return os.length ? '<optgroup label="' + g[0] + '">' + os.map(function (x) { return '<option value="' + x.time + '"' + (x.time === d.time ? ' selected' : '') + (x.ok ? '' : ' disabled') + '>' + esc(fmt.time(x.time)) + '</option>'; }).join('') + '</optgroup>' : '';
          }).join('') + '</select></div>' : '') +
        notes.map(function (n) { return '<p class="to-rule' + (n[0] ? ' is-' + n[0] : '') + '">' + Club.icon(n[0] ? 'alert' : 'info') + '<span>' + esc(n[1]) + (n[2] ? ' <button type="button" class="' + link + '" data-day="' + n[2] + '">Choose ' + esc(longDay(n[2])) + '</button>' : '') + '</span></p>'; }).join('');
    }
    function paintPlace() {
      const t = totals(d.lines), b = ui.$('.to-place span', root), g = pay ? pay.gift() : null;
      if (b && !busy) b.textContent = !t.count ? 'Place order' : g && g.covers ? 'Place order · paid by gift card' : 'Place order · ' + fmt.money(g ? g.due : t.total);
      paintReview();
      if (ctx.bar) {
        /* Phones: View order brings the order panel up; once checkout has started, the bar carries the step's main button. */
        const step = flow.at();
        if (t.count && window.innerWidth < 880) ctx.bar.show({ summary: t.count + (t.count === 1 ? ' item' : ' items') + ' · ' + fmt.money(t.total), label: busy ? 'Placing your order' : step === 'details' ? 'View order' : step === 'review' ? 'Place order' : flow.label(),
          onClick: function () { if (flow.at() === 'details') orderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); else flow.next(); } });
        else ctx.bar.hide();
      }
    }
    /** Step 3: the items and totals with tax, the pickup time and contact, and how it is paid. */
    function paintReview() {
      const rv = flow.at() === 'review' ? ui.$('.to-review', root) : null; if (!rv || !pay) return;
      const items = priced(d.lines), t = totals(items);
      rv.innerHTML = Club.checkout.reviewHTML([
        { title: 'Items', html: '<ul class="ckf-rv-lines">' + items.map(function (l) { return '<li><span>' + esc((l.qty > 1 ? l.qty + ' x ' : '') + l.name) + '</span><span class="num">' + esc(fmt.money(l.qty * l.price)) + '</span></li>'; }).join('') + '</ul>' +
          '<dl class="to-totals"><div><dt>Subtotal</dt><dd class="num">' + esc(fmt.money(t.subtotal)) + '</dd></div><div><dt>Tax <span class="muted">GST 5% + PST 7%</span></dt><dd class="num">' + esc(fmt.money(t.tax)) + '</dd></div><div class="to-total"><dt>Total</dt><dd class="num">' + esc(fmt.money(t.total)) + '</dd></div></dl>' },
        { title: 'Pickup', edit: 'details', html: '<dl class="ckf-rv-kv"><div><dt>When</dt><dd>' + (d.time ? esc(longDay(d.date)) + ', ' + esc(fmt.time(d.time)) : '') + '</dd></div>' +
          '<div><dt>Name</dt><dd data-i18n-skip>' + esc(ctx.customer ? ctx.customer.name : d.name) + '</dd></div><div><dt>Phone</dt><dd>' + esc(d.phone) + '</dd></div>' +
          (ctx.customer ? '' : '<div><dt>Email</dt><dd>' + esc(d.email) + '</dd></div>') +
          (String(d.notes || '').trim() ? '<div><dt>Notes</dt><dd data-i18n-skip>' + esc(d.notes.trim()) + '</dd></div>' : '') + '</dl>' },
        { title: 'Payment', edit: 'pay', html: pay.summaryHTML() }
      ], ctx.site);
    }
    function repaintItem(id) {
      const i = item(id); if (!i) return;
      ui.$$('[data-item="' + id + '"]', root).forEach(function (li) { const n = ui.el(itemHTML(i)); li.replaceWith(n); });
      ui.$$('[data-ctl="' + id + '"]', root).forEach(function (c) { c.innerHTML = ctlHTML(id, qty(id), i.name); });
    }
    function setQty(id, n) {
      const i = item(id); if (!i) return;
      n = Math.max(0, Math.min(MAX_QTY, n));
      const l = d.lines.find(function (x) { return x.menuId === id; });
      const was = l ? l.qty : 0;
      if (l) l.qty = n; else if (n) d.lines.push({ menuId: id, qty: n });
      /* Friday Night Pizza on another day: move the pickup to the next Friday. */
      if (!was && n && isPizza(i) && !isFriday(d.date)) {
        const f = pizzaDay();
        if (f) { d.date = f; d.time = null; ui.toast('Pickup moved to ' + longDay(f) + ': ' + i.name + ' is for Fridays only'); }
      }
      repaintItem(id); drawLines();
    }
    root.addEventListener('click', function (e) {
      const t = e.target.closest('button, a'); if (!t || !root.contains(t)) return;
      if (t.dataset.add) { setQty(t.dataset.add, qty(t.dataset.add) + 1); const s = ui.$('[data-item="' + t.dataset.add + '"] .to-step [data-step="1"]', root); if (s && t.closest('.to-items')) s.focus(); return; }
      if (t.dataset.step) { setQty(t.dataset.id, qty(t.dataset.id) + (+t.dataset.step)); return; }
      if (t.dataset.day) { if (t.disabled) return; d.date = t.dataset.day; d.time = null; drawWhen(); const sel = ui.$('.to-time', root); if (sel && t.classList.contains('to-day')) t.focus(); return; }
      if (t.dataset.sec) { const s = ui.$('#to-sec-' + t.dataset.sec, root); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (t.dataset.to === 'signin') { e.preventDefault(); if (window.Pub) { Pub.afterAuth = '#/takeout'; Pub.go('signin'); } return; }
      if (t.dataset.to === 'place') place();
    });
    root.addEventListener('change', function (e) { if (e.target.classList.contains('to-time')) { d.time = e.target.value || null; e.target.classList.remove('invalid'); const er = e.target.closest('.field').querySelector('.field-error'); if (er) er.remove(); const h = ui.$('.to-when-h', root); if (h) { const sum = d.time ? '<span class="to-when-sum">' + esc(longDay(d.date)) + ', ' + esc(fmt.time(d.time)) + '</span>' : ''; h.innerHTML = '<span class="label-caps">Pickup</span>' + sum; } } });
    root.addEventListener('input', function (e) {
      const t = e.target;
      if (t.name === 'notes' || t.name === 'name' || t.name === 'phone' || t.name === 'email') {
        d[t.name] = t.value;
        if (t.classList.contains('invalid')) { t.classList.remove('invalid'); const er = (t.closest('.field') || t.parentNode).querySelector('.field-error'); if (er) er.remove(); }
      }
    });

    function err(name, msg) {
      const f = ui.$('[name="' + name + '"]', orderEl); if (!f) return;
      f.classList.add('invalid');
      const fld = f.closest('.field'); if (fld && !fld.querySelector('.field-error')) fld.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
    }
    function phoneOk(v) { let x = String(v || '').replace(/\D/g, ''); if (x.length === 11 && x[0] === '1') x = x.slice(1); return x.length === 10; }
    /** Step 1: something ordered, a pickup time the kitchen can make, and the contact. Errors show on that step. */
    function detailsOk() {
      ui.$$('.field-error', orderEl).forEach(function (x) { if (!x.closest('.cc, .gc-box')) x.remove(); });
      ui.$$('.invalid', orderEl).forEach(function (x) { if (!x.closest('.cc, .gc-box')) x.classList.remove('invalid'); });
      cleanLines();
      if (!d.lines.length) { ui.toast('Add something from the menu first', 'bad'); const m = ui.$('.to-menu', root); if (m) m.scrollIntoView({ behavior: 'smooth' }); return false; }
      let ok = true;
      const toDetails = function () { if (flow.at() !== 'details') flow.go('details', true); };
      if (!d.time) { toDetails(); err('time', 'Choose a pickup time.'); ok = false; }
      if (!ctx.customer && String(d.name || '').trim().length < 2) { err('name', 'Enter the name for the order.'); ok = false; }
      if (!phoneOk(d.phone)) { err('phone', d.phone ? 'Enter a 10-digit phone number, for example (204) 555-0123.' : 'Enter a phone number for the order.'); ok = false; }
      if (!ctx.customer && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || '').trim())) { err('email', d.email ? 'That email address does not look right.' : 'Enter your email for the receipt.'); ok = false; }
      if (!ok) { toDetails(); ui.toast('Please check the highlighted fields', 'bad'); const f = ui.$('.invalid', orderEl); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } return false; }
      const problem = check(d.lines, d.date, d.time);
      if (problem) { toDetails(); drawWhen(); flow.fail(problem); return false; }
      return true;
    }
    function place() {
      if (busy) return;
      if (flow.at() !== 'review') { flow.next(); return; }
      flow.fail('');
      if (!detailsOk()) return;
      const res = pay.validate();
      if (!res.ok) {
        flow.go('pay', true);
        const f = ui.$('[data-ckf-step=pay] .invalid', orderEl) || ui.$('[data-ckf-step=pay] .ck-alert:not([hidden])', orderEl);
        if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (f.matches('input')) f.focus({ preventScroll: true }); }
        return;
      }
      busy = true;
      const btn = ui.$('.to-place', root); btn.disabled = true; btn.classList.add('is-busy'); ui.$('span', btn).textContent = res.method === 'card' ? 'Processing payment' : 'Placing your order';
      setTimeout(function () {
        const c = ctx.customer ? Object.assign({}, ctx.customer, { phone: d.phone.trim() }) : { kind: 'guest', name: d.name.trim().replace(/\s+/g, ' '), phone: d.phone.trim(), email: d.email.trim() };
        let out = null;
        try { out = place0({ customer: c, lines: d.lines, date: d.date, time: d.time, notes: d.notes, source: ctx.site, pay: res }); } catch (x) { console.error(x); out = { ok: false, msg: 'We could not place your order. You have not been charged. Please call the clubhouse at ' + Club.info.phone + '.' }; }
        busy = false; btn.disabled = false; btn.classList.remove('is-busy');
        if (!out.ok) { paintPlace(); drawWhen(); if (check(d.lines, d.date, d.time)) flow.go('details', true); flow.fail(out.msg); return; }
        pay.remember(res);
        delete drafts[key];
        if (ctx.bar) ctx.bar.hide();
        ui.toast('Order ' + code(out.order) + ' placed');
        if (ctx.onPlaced) ctx.onPlaced(out.order, out.receipt);
      }, 700);
    }
    pickDefaultDay();
    drawLines();
    let rsz = 0; const onResize = function () { if (!rsz) rsz = requestAnimationFrame(function () { rsz = 0; paintPlace(); }); };   /* once per frame: iOS fires resize while its toolbar slides */
    window.addEventListener('resize', onResize);
    return function () { window.removeEventListener('resize', onResize); if (ctx.bar) ctx.bar.hide(); };
  }
  const place0 = place;

  /* ---------------- Order cards (the customer's side) ---------------- */
  function payText(o) { const p = o.payment || {}; return fmt.money(o.total) + (p.label ? ' · ' + p.label : ''); }
  function orderCardHTML(o, opts) {
    opts = opts || {};
    const rc = receiptOf(o), rf = refundReceiptOf(o);
    const btnCls = opts.site === 'portal' ? 'p-link' : 'pub-link';
    return '<article class="to-card is-' + esc(o.status) + '" data-order="' + esc(o.id) + '">' +
      '<header class="to-card-head"><div><span class="to-card-no">Order ' + esc(code(o)) + '</span><h4>' + esc(o.status === 'picked-up' ? 'Picked up' : 'Pickup ' + pickupText(o).replace(/^Today/, 'today')) + '</h4></div>' +
        '<span class="badge ' + ({ new: 'brass', ready: 'good', 'picked-up': 'outline', cancelled: 'bad' }[o.status] || '') + '">' + esc(statusLabel(o)) + '</span></header>' +
      progressHTML(o) +
      '<p class="to-card-items">' + esc(itemsText(o.items)) + '</p>' +
      (o.notes ? '<p class="to-card-notes">' + esc(o.notes) + '</p>' : '') +
      '<div class="to-card-foot"><span class="to-card-pay">' + esc(payText(o)) + '</span><span class="to-card-acts">' +
        (rc ? '<button type="button" class="' + btnCls + '" data-to-rc="' + esc(rc.id) + '">Receipt</button>' : '') +
        (rf ? '<button type="button" class="' + btnCls + '" data-to-rc="' + esc(rf.id) + '">Refund receipt</button>' : '') +
        (canCancel(o) ? '<button type="button" class="btn btn-sm btn-ghost to-cancel" data-to-cancel="' + esc(o.id) + '">Cancel order</button>' : '') +
      '</span></div></article>';
  }
  /** Receipt and Cancel buttons inside root (bind once per root). onChange() after a cancel. */
  function wireCards(root, onChange) {
    root.addEventListener('click', function (e) {
      const r = e.target.closest('[data-to-rc]'); if (r && root.contains(r)) { Club.receipts.open(r.dataset.toRc); return; }
      const c = e.target.closest('[data-to-cancel]'); if (!c || !root.contains(c)) return;
      const o = get(c.dataset.toCancel); if (!o) return;
      if (!canCancel(o)) { ui.toast('This order can no longer be cancelled online. Please call the clubhouse at ' + Club.info.phone, 'bad'); if (onChange) onChange(); return; }
      const p = o.payment || {};
      const back = [p.giftAmount > 0 ? fmt.money(p.giftAmount) + ' goes back on the gift card' : '', p.due > 0 ? (p.method === 'account' ? fmt.money(p.due) + ' is credited to your member account' : fmt.money(p.due) + ' is refunded to your ' + Club.receipts.cardLabel(p.brand, p.last4)) : ''].filter(Boolean).join(' and ');
      ui.confirm({ title: 'Cancel order ' + code(o) + '?', text: 'Your order for pickup ' + pickupText(o).replace(/^Today/, 'today') + ' will be cancelled' + (back ? ', and ' + back + '.' : '.'), confirmLabel: 'Cancel order', cancelLabel: 'Keep order', danger: true }).then(function (yes) {
        if (!yes) return;
        const cur = get(o.id);
        if (!canCancel(cur)) { ui.toast('The kitchen has already started on this order. Please call the clubhouse', 'bad'); if (onChange) onChange(); return; }
        cancel(o.id, { by: 'customer' });
        ui.toast('Order ' + code(o) + ' cancelled');
        if (onChange) onChange();
      });
    });
  }
  /** The confirmation shown right after placing an order. */
  function confirmHTML(o) {
    const rc = receiptOf(o);
    return '<article class="to-done" data-reveal role="status" aria-live="polite">' +
      '<div class="to-done-icon">' + Club.icon('check') + '</div>' +
      '<div class="eyebrow">Order ' + esc(code(o)) + ' received</div>' +
      '<h2>Pickup ' + esc(pickupText(o).replace(/^Today/, 'today')) + '</h2>' +
      '<p class="to-done-where">At the Gallery Taphouse &amp; Grill, second floor of the clubhouse.</p>' +
      progressHTML(o) +
      '<ul class="to-done-lines">' + o.items.map(function (l) { return '<li><span>' + esc((l.qty > 1 ? l.qty + ' x ' : '') + l.name) + '</span><span class="num">' + esc(fmt.money(l.qty * l.price)) + '</span></li>'; }).join('') +
        '<li class="to-done-tax"><span>Tax</span><span class="num">' + esc(fmt.money(o.tax)) + '</span></li><li class="to-done-total"><span>Total</span><span class="num">' + esc(fmt.money(o.total)) + '</span></li></ul>' +
      '<p class="to-done-paid">' + esc(o.payment ? o.payment.label : '') + '</p>' +
      '<div class="to-done-acts">' + (rc ? '<button type="button" class="btn" data-to-rc="' + esc(rc.id) + '">' + Club.icon('billing') + '<span>View receipt</span></button>' : '') +
        '<button type="button" class="btn btn-primary" data-to-again="1">' + Club.icon('plus') + '<span>Order something else</span></button></div>' +
    '</article>';
  }

  Club.takeout = {
    mountOrder: mountOrder, orderCardHTML: orderCardHTML, wireCards: wireCards, confirmHTML: confirmHTML,
    COLL: COLL, DEFAULTS: DEFAULTS, MAX_QTY: MAX_QTY, STATUS: STATUS, settings: settings, saveSettings: saveSettings,
    menu: menu, item: item, sections: sections, isPizza: isPizza, isBreakfast: isBreakfast, isFriday: isFriday, nextFriday: nextFriday, pizzaDay: pizzaDay,
    days: days, slots: slots, itemRule: itemRule, check: check, priced: priced, totals: totals, receiptLines: receiptLines,
    place: place, get: get, setStatus: setStatus, cancel: cancel, canCancel: canCancel, minutesUntil: minutesUntil,
    forMember: forMember, forPublic: forPublic, byIds: byIds, active: active, code: code, itemsText: itemsText, pickupText: pickupText,
    statusLabel: statusLabel, receiptOf: receiptOf, refundReceiptOf: refundReceiptOf, progressHTML: progressHTML
  };
})();
