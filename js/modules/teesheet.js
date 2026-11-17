/* Tee Sheet: day view of the starting sheet, bookings, starter panel and blocks. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/teesheet-data.js */
  const { settings, PACE_TARGET, toMin, toHM, nowMin, slotList, closeHM, blockAt } = Club.shared.teesheet;

  /** Two rounds overlap when the later one starts before the earlier one is expected to finish (the earlier round's length sets the window). */
  function overlaps(t1, h1, t2, h2) { const a = toMin(t1), b = toMin(t2); return a <= b ? b - a < (PACE_TARGET[h1] || 255) : a - b < (PACE_TARGET[h2] || 255); }   /* read by Reports > Golf */
  const BLOCK_KINDS = [
    { value: 'maintenance', label: 'Course maintenance' },
    { value: 'shotgun', label: 'Shotgun start' },
    { value: 'league', label: 'League play' },
    { value: 'event', label: 'Club event' }
  ];
  const STATUS = {
    'booked': { label: 'Booked', next: 'checked-in', verb: 'Check in' },
    'checked-in': { label: 'Checked in', next: 'on-course', verb: 'Send off' },
    'on-course': { label: 'On course', next: 'completed', verb: 'Complete' },
    'completed': { label: 'Completed' },
    'no-show': { label: 'No-show' }
  };

  /* Periods of the day: the sheet shows one at a time so staff see the relevant part at a glance. */
  const PERIODS = [
    { id: 'morning', label: 'Morning', from: 0, to: 600 },
    { id: 'midday', label: 'Midday', from: 600, to: 780 },
    { id: 'afternoon', label: 'Afternoon', from: 780, to: 960 },
    { id: 'evening', label: 'Evening', from: 960, to: 1440 },
    { id: 'all', label: 'All day', from: 0, to: 1440 }
  ];
  let periodPick = null;                                       /* the period staff last chose (kept across days) */
  const accOpen = {};                                          /* side panel open states (kept across days) */
  function periodOf(min) { return PERIODS.find(function (p) { return p.id !== 'all' && min >= p.from && min < p.to; }) || PERIODS[3]; }
  function periodById(id) { return PERIODS.find(function (p) { return p.id === id; }) || PERIODS[0]; }
  function dur(m) { const h = Math.floor(m / 60), r = Math.round(m % 60); return h + 'h ' + String(r).padStart(2, '0') + 'm'; }
  function endLabel(end) { return end >= closeHM() ? 'close of play' : fmt.time(end); }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(fmt.toDate(d)); }
  function money(v) { return fmt.money(v); }

  function blocksOn(date) { return S.where('teeBlocks', function (b) { return b.date === date; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }); }
  function activeOn(date) { return S.where('teeTimes', function (t) { return t.date === date && t.status !== 'cancelled'; }); }
  /** Groups still to go out on a day, in tee time order: booked or checked in, tee time not passed by more than 10
      minutes (the sheet fades rows after that). The first is the group the starter sends next ("Next up"). */
  function dueOff(date, now) {
    return activeOn(date).filter(function (t) { return (t.status === 'booked' || t.status === 'checked-in') && toMin(t.time) >= now - 10; })
      .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function memberLabel(p) {
    if (p.type === 'member' && p.memberId) { const m = Club.members.get(p.memberId); if (m) return m.firstName + ' ' + m.lastName; }
    return p.name || 'Guest';
  }
  function shortName(p) {
    if (p.type === 'member' && p.memberId) { const m = Club.members.get(p.memberId); if (m) return m.lastName + ', ' + m.firstName[0] + '.'; }
    const n = String(p.name || 'Guest').split(/\s+/); return n.length > 1 ? n[n.length - 1] + ', ' + n[0][0] + '.' : n[0];
  }
  function hostOf(tt) { return (tt.players || []).find(function (p) { return p.type === 'member' && p.memberId && Club.members.get(p.memberId); }) || null; }
  /** A guest's host: the member who brought them (p.hostId, set when a member joins a group with guests), else the group's first member. */
  function guestHost(tt, p) { return p && p.hostId && Club.members.get(p.hostId) ? { memberId: p.hostId } : hostOf(tt); }

  /* ---------------- Public golfers, green fees and membership rules (Club.teeRules) ---------------- */
  function rules() { return Club.teeRules || null; }
  function isPublic(p) { return !!p && p.type === 'public'; }
  /** Public golfers who paid on the public site. Staff-collected payments carry paidAt: 'shop'. */
  function paidOnline(p) { return isPublic(p) && !!p.paid && p.paidAt !== 'shop'; }
  function publicPayLabel(p) { return paidOnline(p) ? 'Paid online' : p.paid ? 'Paid at shop' : 'Pay at shop'; }
  /** Green fee for a member's guest or a public golfer (published rates, 9 holes at 60%). */
  function greenFee(date, time, holes) {
    const r = rules();
    if (r && validDate(date)) return r.greenFee(date, time, holes);
    return settings().guestFee * (+holes === 9 ? 0.6 : 1);
  }
  const RULE_LABEL = { playWindow: 'outside their play times', bookingWindow: 'outside their booking window', publicSlot: 'outside public tee times', publicBooking: 'outside the public booking window' };
  function overrideKey(o) { return (o.memberId || 'pub:' + String(o.name || '').trim().toLowerCase()) + '|' + o.rule; }
  function overrideText(tt) {
    return 'Booked with a staff override: ' + (tt.overrides || []).map(function (o) {
      const n = o.memberId ? Club.members.name(o.memberId) : (o.name || 'Public golfer');
      return n + ' ' + (RULE_LABEL[o.rule] || 'outside the rules');
    }).join('; ');
  }
  /** Online green fee payments for tee times on this day (owner: public site; read defensively). */
  function onlinePaymentsOn(date) {
    return (S.all('publicPayments') || []).filter(function (p) {
      if (!p || p.status === 'refunded') return false;
      if (p.status === 'account' && !+p.amount) return false;   /* a portal promo record: not an online payment */
      const tt = p.teeTimeId ? S.find('teeTimes', p.teeTimeId) : null;
      return (tt ? tt.date : p.date) === date;
    });
  }

  /* ---------------- Add-ons, promo codes, discounts and golf shop payments (Nov 2026) ----------------
     Add-ons (Club.addons) sit on players as addons: [{ addonId, name, qty, price }]: members' and host-paid guests' post to
     the account at check-in like the cart fee; public golfers paid for theirs online; shop-paying golfers pay at the counter.
     A golf shop payment (public golfer or guest paying at the shop) records on the player: paid, paidAt 'shop',
     paidWith 'card'|'cash'|'gift', shopPay { id ('tsp_…'), at, by, lines, subtotal, total, method, rest, gift: { id, last4, amount }|null,
     cashTendered, receiptId }, and an optional discount { amount, reason, by, at, kind: 'amount'|'percent', value }. Each payment
     makes a receipt (source 'teesheet', refId the tee time, channel 'counter', tenders, paymentId = shopPay.id); unticking
     paid makes the matching credit receipt (paymentId shopPay.id + '_r') and puts any gift card part back on the card. */
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function staffName() { return Club.user ? (Club.user.firstName + ' ' + Club.user.lastName).trim() : 'Golf shop'; }
  /* addons may hold a member's promo code as a negative line { addonId: 'promo', name: 'Promo code X', price: -6.6, promoId, code }
     (members' portal). postFees posts every line (the promo as a credit); the screens show the promo apart from add-ons. */
  function addsOf(p) { return p && Array.isArray(p.addons) ? p.addons : []; }
  function isPromoLine(x) { return !!x && x.addonId === 'promo'; }
  function realAdds(p) { return addsOf(p).filter(function (x) { return !isPromoLine(x); }); }
  function promoLines(p) { return addsOf(p).filter(isPromoLine); }
  function linesSum(list) { return r2(list.reduce(function (a, x) { return a + (+x.qty || 1) * (+x.price || 0); }, 0)); }
  function addsTotal(p) { return linesSum(realAdds(p)); }
  function promoTotal(p) { return linesSum(promoLines(p)); }
  function addsText(p) { return Club.addons ? Club.addons.summary(realAdds(p)) : realAdds(p).map(function (x) { return x.name; }).join(', '); }
  function atShop(p) { return isPublic(p) || (!!p && p.type === 'guest' && p.pays === 'shop'); }
  function cartFeeFor(holes) { return r2(settings().cartFee * (+holes === 9 ? 0.6 : 1)); }
  /** What a golfer paying at the golf shop owes, as receipt lines: green fee, cart and add-ons (before any discount). */
  function shopLines(date, time, holes, p) {
    const name = p.name || 'Guest';
    const out = [{ name: 'Green fee, ' + name + ' (' + holes + ' holes)', qty: 1, price: r2(greenFee(date, time, holes)) }];
    if (p.cart) out.push({ name: 'Cart, ' + name, qty: 1, price: cartFeeFor(holes) });
    addsOf(p).forEach(function (x) { out.push({ name: x.name + ', ' + name, qty: +x.qty || 1, price: r2(x.price) }); });
    return out;
  }
  function linesTotal(lines) { return r2(lines.reduce(function (a, l) { return a + (+l.qty || 1) * (+l.price || 0); }, 0)); }
  /** Promo codes on this tee time: used online (publicPayments.promo, not refunded), plus a member's promo lines from the
      portal that have no such record. Each: { promo: { code, discount }, amount, status, memberId?, publicPlayerId? }. */
  function promosFor(tt) {
    const out = (S.all('publicPayments') || []).filter(function (x) { return x && x.teeTimeId === tt.id && x.promo && x.status !== 'refunded'; });
    (tt.players || []).forEach(function (p) {
      promoLines(p).forEach(function (x) {
        if (out.some(function (o) { return o.promo.code === x.code && (o.memberId || null) === (p.memberId || null); })) return;
        out.push({ promo: { code: x.code || String(x.name || '').replace(/^Promo code /, ''), discount: r2(-linesSum([x])) }, amount: 0, status: 'account', memberId: p.memberId || null });
      });
    });
    return out;
  }
  /** A members' portal booking with a code: nothing is paid online, the fees post to the account at check-in. */
  function memberPromo(x) { return !!x.memberId && x.status === 'account'; }
  function payWord(m) { return m === 'cash' ? 'cash' : m === 'gift' ? 'gift card' : 'card'; }
  /** The receipt for a golf shop payment, or its credit when it is refunded. */
  function shopReceipt(tt, p, sp, kind) {
    if (!Club.receipts) return null;
    const g = sp.gift && sp.gift.amount > 0 ? sp.gift : null, rest = r2(sp.rest);
    const tenders = (g ? [{ method: 'gift', amount: g.amount, ref: g.id }] : []).concat(rest > 0 ? [{ method: sp.method === 'cash' ? 'cash' : 'card', amount: rest }] : []);
    const label = g ? 'Gift card ending ' + g.last4 + (rest > 0 ? ' and ' + (sp.method === 'cash' ? 'cash' : 'card') : '') : sp.method === 'cash' ? 'Cash' : 'Card';
    const credit = kind === 'credit';
    const disc = sp.lines.find(function (l) { return l.price < 0; });
    return Club.receipts.create({
      publicPlayerId: p.publicPlayerId || null, name: p.publicPlayerId ? undefined : (p.name || 'Guest'), kind: credit ? 'credit' : 'sale',
      title: (credit ? 'Tee time refund, ' : 'Tee time, ') + fmt.dateShort(tt.date), lines: sp.lines, total: sp.total,
      method: rest > 0 ? (sp.method === 'cash' ? 'cash' : 'card') : 'other', methodLabel: label,
      source: 'teesheet', refId: tt.id, paymentId: credit ? sp.id + '_r' : sp.id, tenders: tenders, channel: 'counter',
      note: (credit ? 'Refunded at the golf shop. ' : 'Paid at the golf shop. ') + 'Tee time ' + fmt.dateShort(tt.date) + ' at ' + fmt.time(tt.time) + ', ' + tt.holes + ' holes.' +
        (disc && !credit && sp.discount ? ' Discount: ' + sp.discount.reason + '.' : '') + (g && rest > 0 ? ' ' + label.split(' and ')[0] + ': ' + money(g.amount) + '. ' + (sp.method === 'cash' ? 'Cash' : 'Card') + ': ' + money(rest) + '.' : '')
    });
  }

  /* ---------------- Waitlist (js/core/waitlist.js): golfers asking to hear when a full time opens ---------------- */
  function WL() { return Club.waitlist || null; }
  function waitingAt(date, time) { const W = WL(); return W ? W.onDate(date).filter(function (e) { return W.isActive(e) && e.time === time; }).length : 0; }
  function stampLabel(iso) { const d = new Date(iso); return fmt.dateShort(S.iso(d)) + ', ' + fmt.time(toHM(d.getHours() * 60 + d.getMinutes())); }
  /** A freed place went to the waitlist: added to the staff toast. */
  function toldText(told) {
    if (!told || !told.length) return '';
    return told.length === 1 ? '. ' + WL().contact(told[0]).name + ' on the waitlist has been told' : '. ' + told.length + ' golfers on the waitlist have been told';
  }

  /* ---------------- Undo (js/core/undo.js) for bookings, cancellations, blocks, fees and the waitlist ----------------
     (Check-in, send-off, complete and no-show keep their own step-back: advance / stepBack / backStep below.)
     undoOffer is Club.undo.offer plus check(), which can refuse first: a slot booked since, or settings saved since. */
  const CHANGED = 'This has changed since, so it can no longer be undone here.';
  function undoOffer(msg, rec, o) {
    o = o || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg, o.kind); return; }
    ui.toast(msg, o.kind, { action: { label: 'Undo', onClick: function () {
      const why = o.check && o.check(); if (why) { ui.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { if (o.after) o.after(res); } catch (e) { console.error(e); }
      const u = typeof o.undone === 'function' ? o.undone(res) : o.undone;
      ui.toast((u || 'Undone') + (res.credited > 0 ? '. ' + money(res.credited) + ' credited back' : ''));
    } } });
  }
  /** Golfers the waitlist told about an opening cannot be un-told: their entries are left out of the Undo record (keepId
      excepted), and after an Undo the queue is re-checked so anyone whose spot is gone goes back on the list. */
  function dropWaitlist(rec, keepId) {
    const W = WL(); if (!W || !rec || !rec.ops) return;
    rec.ops = rec.ops.filter(function (o) { return o.c !== W.COLL || o.id === keepId; });
  }
  function recheckWaitlist(date) { const W = WL(); if (W) { try { W.reconcile(date); } catch (e) { console.error(e); } } }
  /** Receipts made within 5 seconds that match an earlier one (same tee time, kind and total) are merged by receipts.js, so
      undoing a golf shop refund straight away would point its credit back at the original sale. Make the new sale here. */
  function reinstateSales(rec) {
    if (!Club.receipts) return;
    rec.ops.forEach(function (o) {
      if (o.t !== 'ins' || o.c !== 'receipts') return;
      const cr = S.find('receipts', o.id); if (!cr || !cr.reversedBy) return;
      const kind = cr.kind === 'credit' ? 'sale' : 'credit', word = kind === 'sale' ? ' reinstated' : ' reversed';
      const back = S.find('receipts', cr.reversedBy); if (!back || back.kind !== kind || String(back.at) >= String(cr.at)) return;
      const out = Club.receipts.create({ memberId: cr.memberId || null, publicPlayerId: cr.publicPlayerId || null, name: cr.memberId || cr.publicPlayerId ? undefined : cr.name,
        kind: kind, title: cr.title + word, lines: cr.lines, total: cr.total, method: cr.method, methodLabel: cr.methodLabel, source: cr.source, refId: cr.refId,
        tenders: cr.tenders, channel: cr.channel, paymentId: (cr.paymentId || cr.id) + '_u', note: 'Receipt ' + cr.no + word + '.' });
      if (out && out.id !== back.id) S.update('receipts', cr.id, { reversedBy: out.id });
    });
  }
  /** Why a tee time cannot go back into date/time (another group booked it, or a block covers it), or null. */
  function slotTaken(date, time, selfId) {
    const other = activeOn(date).find(function (x) { return x.time === time && x.id !== selfId; });
    if (other) return 'Another group has booked ' + fmt.time(time) + ' on ' + fmt.dateShort(date) + ' since, so this cannot be undone.';
    const blk = blockAt(blocksOn(date), date, time);
    if (blk) return fmt.time(time) + ' on ' + fmt.dateShort(date) + ' is now blocked for ' + String(blk.reason || 'club use').toLowerCase() + ', so this cannot be undone.';
    return null;
  }
  /* ---------------- Online holds (js/core/holds.js) ----------------
     A public or portal golfer's chosen time is held for a few minutes while they book. Staff see it on the row and cannot
     book over it until it ends. Holds live in this browser's localStorage, so in this demo only holds placed in the same
     browser show here (said in the tooltip). */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function clock(sec) { sec = Math.max(0, sec); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }
  /** Other people's live holds on a day, by time: { time: { until, left (seconds), places, who } }. */
  function holdsOn(date) {
    const H = Club.holds; if (!H) return {};
    const out = {}, now = Date.now(), me = H.owner();
    H.all().forEach(function (h) {
      if (h.date !== date || h.owner === me) return;
      const x = out[h.time] || (out[h.time] = { until: 0, places: 0, src: {} });
      x.until = Math.max(x.until, +h.expiresAt); x.places += +h.places || 0; x.src[h.source === 'portal' ? 'portal' : 'public'] = 1;
    });
    Object.keys(out).forEach(function (t) {
      const x = out[t]; x.left = Math.ceil((x.until - now) / 1000);
      x.who = x.src.public && x.src.portal ? 'A public golfer and a member are booking this time' : x.src.portal ? 'Member booking in the portal' : 'Public golfer choosing a time';
    });
    return out;
  }
  function holdAt(date, time) { const x = holdsOn(date)[time]; return x && x.left > 0 ? x : null; }
  function holdTip(x) { return x.who + ' (' + x.places + (x.places === 1 ? ' place' : ' places') + '). Frees itself when the hold ends in ' + clock(x.left) + '. Holds show from this browser only in this demo.'; }

  function toldAgain(told) {
    if (!told || !told.length) return '';
    return told.length === 1 ? '. ' + WL().contact(told[0]).name + ' on the waitlist was already told about the opening' : '. ' + told.length + ' golfers on the waitlist were already told about the opening';
  }

  /* ---------------- Calculations ---------------- */
  function dayStats(date) {
    const tts = activeOn(date); const blocks = blocksOn(date);
    const open = slotList().filter(function (t) { return !blockAt(blocks, date, t); }).length;
    let players = 0, guests = 0, noShows = 0, rounds = 0, booked = 0, publics = 0, publicOnline = 0;
    tts.forEach(function (t) {
      const n = (t.players || []).length; players += n;
      if (!blockAt(blocks, date, t.time)) booked++;
      guests += (t.players || []).filter(function (p) { return p.type === 'guest'; }).length;
      (t.players || []).forEach(function (p) { if (isPublic(p)) { publics++; if (paidOnline(p)) publicOnline++; } });
      if (t.status === 'no-show') noShows++;
      if (t.status === 'completed') rounds += n;
    });
    const pays = onlinePaymentsOn(date);
    const online = Math.round(pays.reduce(function (a, p) { return a + (+p.amount || 0); }, 0) * 100) / 100;
    return { groups: tts.length, players: players, guests: guests, noShows: noShows, rounds: rounds, open: open, places: open * 4,
      publics: publics, publicOnline: publicOnline, online: online, onlineCount: pays.length,
      util: open ? Math.min(100, Math.round(booked / open * 100)) : 0, placeUtil: open ? Math.round(players / (open * 4) * 100) : 0 };
  }
  function avgPace(fromDate, toDate) {
    const done = S.where('teeTimes', function (t) { return t.status === 'completed' && t.holes === 18 && t.startedAt && t.finishedAt && t.date >= fromDate && t.date <= toDate; });
    if (!done.length) return null;
    return Math.round(done.reduce(function (a, t) { return a + (toMin(t.finishedAt) - toMin(t.startedAt)); }, 0) / done.length);
  }

  /* ---------------- Fees ---------------- */
  function postFees(tt) {
    const st = settings(); const host = hostOf(tt); const factor = tt.holes === 9 ? 0.6 : 1;
    let total = 0, shop = 0;
    const players = (tt.players || []).map(function (p) {
      if (p.paid) return p;
      // Public golfers have no member account: they pay online or at the golf shop, never on a member's account.
      if (isPublic(p)) { shop++; return Object.assign({}, p, { payAt: 'shop' }); }
      // A member's guest who chose to pay at the golf shop: collected at the counter like a public golfer, never on the host's account.
      if (p.type === 'guest' && p.pays === 'shop') { shop++; return Object.assign({}, p, { payAt: 'shop' }); }
      const gh = p.type === 'guest' ? guestHost(tt, p) : host;
      if (p.type === 'guest' && gh) {
        const c = Club.chargeMember(gh.memberId, { description: 'Guest green fee: ' + p.name + ' (' + tt.holes + ' holes)', category: 'Golf', amount: greenFee(tt.date, tt.time, tt.holes), source: 'teesheet', refId: tt.id, date: tt.date, title: 'Guest green fee' });
        if (c) total += c.amount;
      }
      const payer = p.type === 'member' && p.memberId && Club.members.get(p.memberId) ? p.memberId : (gh && gh.memberId);
      if (p.cart && payer) {
        const c2 = Club.chargeMember(payer, { description: 'Cart fee: ' + memberLabel(p) + ' (' + tt.holes + ' holes)', category: 'Golf', amount: st.cartFee * factor, source: 'teesheet', refId: tt.id, date: tt.date, title: 'Cart fee' });
        if (c2) total += c2.amount;
      }
      /* Add-ons picked when booking (Club.addons) post the same way: to the member, or to the guest's host. */
      if (payer) addsOf(p).forEach(function (x) {
        const amt = r2((+x.qty || 1) * (+x.price || 0)); if (!amt) return;
        const c3 = Club.chargeMember(payer, { description: x.name + (+x.qty > 1 ? ' x ' + x.qty : '') + ': ' + memberLabel(p) + ' (' + tt.holes + ' holes)', category: 'Golf', amount: amt, source: 'teesheet', refId: tt.id, date: tt.date,
          title: x.name, lines: [{ name: x.name + (p.type === 'guest' ? ', ' + memberLabel(p) : ''), qty: +x.qty || 1, price: r2(x.price) }] });
        if (c3) total += c3.amount;
      });
      return Object.assign({}, p, { paid: true });
    });
    return { players: players, total: Math.round(total * 100) / 100, shop: shop };
  }
  /** Fee quote: guests and carts post to member accounts; public golfers settle online or at the golf shop. */
  function quote(players, holes, date, time) {
    const st = settings(); const f = holes === 9 ? 0.6 : 1; const gf = greenFee(date, time, holes);
    const g = players.filter(function (p) { return p.type === 'guest' && !atShop(p); }).length;
    const c = players.filter(function (p) { return p.cart && !atShop(p); }).length;
    const adds = r2(players.filter(function (p) { return !atShop(p) && !p.paid; }).reduce(function (a, p) { return a + addsTotal(p); }, 0));
    const promoBy = players.filter(function (p) { return !atShop(p) && !p.paid; }), promo = r2(promoBy.reduce(function (a, p) { return a + promoTotal(p); }, 0));
    const promoCodes = []; promoBy.forEach(function (p) { promoLines(p).forEach(function (x) { const c = x.code || String(x.name || '').replace(/^Promo code /, ''); if (promoCodes.indexOf(c) < 0) promoCodes.push(c); }); });
    const pubs = players.filter(atShop);
    const due = pubs.filter(function (p) { return !p.paid; });
    const shop = due.length * gf + due.filter(function (p) { return p.cart; }).length * st.cartFee * f +
      due.reduce(function (a, p) { return a + addsTotal(p) - (p.discount ? +p.discount.amount || 0 : 0); }, 0);
    return { guests: g, carts: c, adds: adds, promo: promo, promoCodes: promoCodes, total: Math.round((g * gf + c * st.cartFee * f + adds + promo) * 100) / 100, f: f, gf: gf,
      publics: pubs.length, publicDue: due.length, shopTotal: Math.round(Math.max(0, shop) * 100) / 100 };
  }

  /* ---------------- Rendering pieces ---------------- */
  function statItems(date) {
    const s = dayStats(date);
    return [
      { label: 'Players booked', value: s.players, meta: s.groups + ' groups' },
      { label: 'Tee times filled', value: s.util, suffix: '%', meta: s.placeUtil + '% of player places' },
      { label: 'Guests', value: s.guests, meta: s.players ? Math.round(s.guests / s.players * 100) + '% of field' : 'None booked' },
      { label: 'Public golfers', value: s.publics, meta: s.online ? esc(money(s.online)) + ' paid online' : (s.publicOnline ? s.publicOnline + ' paid online, no payment on file' : s.publics ? '0 paid online' : 'None booked') },
      { label: 'No-shows', value: s.noShows, meta: s.noShows ? 'Groups marked' : 'All accounted for' },
      { label: 'Rounds completed', value: s.rounds, meta: 'Players finished' }
    ];
  }
  /* ---------------- Box details (Nov 10): every stat box opens a drawer explaining its number ----------------
     Uses the shared drawer styles (.dd-*, from dashboard.css) and Club.charts.columns / ranked. Rows that are tee
     times open that booking. */
  const STAT_KEYS = ['players', 'filled', 'guests', 'public', 'noshows', 'rounds'];
  function pctOf(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function plural(n, w, pl) { return n + ' ' + (n === 1 ? w : (pl || w + 's')); }
  function hourShort(h) { return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
  function dayHours() { const s = settings(); const a = Math.floor(toMin(s.first) / 60), b = Math.floor(toMin(s.last) / 60); const out = []; for (let h = a; h <= b; h++) out.push(h); return out; }
  function hourOf(t) { return Math.floor(toMin(t.time) / 60); }
  function leadOf(tt) { const h = hostOf(tt); const p = h || (tt.players || [])[0]; return p ? memberLabel(p) + ((tt.players || []).length > 1 ? ' + ' + ((tt.players || []).length - 1) : '') : 'Empty group'; }
  function ddKpis(items) {
    return '<div class="dd-kpis ts-dd-kpis">' + items.map(function (k) {
      return '<div><span class="label-caps">' + esc(k.label) + '</span><strong class="serif">' + esc(k.value) + '</strong>' + (k.sub ? '<span class="dd-kpi-sub">' + k.sub + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function ddSec(title, aside, inner) {
    return '<section class="dd-sec"><div class="dd-sec-head"><h4>' + esc(title) + '</h4>' + (aside ? '<span class="dd-aside">' + aside + '</span>' : '') + '</div>' + inner + '</section>';
  }
  function ddNote(text) { return '<p class="dd-note">' + esc(text) + '</p>'; }
  function ddDelta(cur, prev, what) {
    if (!prev) return '<span class="muted">' + esc('Nothing ' + what + ' to compare') + '</span>';
    const d = Math.round((cur - prev) / prev * 100);
    if (!d) return '<span class="muted">' + esc('Same as ' + what) + '</span>';
    return '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%</span> <span class="muted">' + esc('vs ' + what) + '</span>';
  }
  /** Table whose rows open a tee time when they carry one: rows [{ tt?, cells: [] }] */
  function ddTable(cols, rows) {
    const cls = function (c) { const k = (c.num ? 'num' : '') + (c.sm ? ' ts-dd-wide' : ''); return k ? ' class="' + k.trim() + '"' : ''; };
    return '<div class="table-wrap"><table class="table dd-table ts-dd-table"><thead><tr>' + cols.map(function (c) { return '<th' + cls(c) + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (r.tt ? ' class="ts-dd-click" data-tt="' + esc(r.tt) + '" tabindex="0" title="Open this tee time"' : '') + '>' +
          r.cells.map(function (cell, i) { return '<td' + (cols[i] ? cls(cols[i]) : '') + '>' + cell + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function fillBar(u) { return '<span class="dd-fill"><span class="bar' + (u >= 90 ? ' brass' : '') + '"><span style="width:' + Math.min(100, u) + '%"></span></span>' + u + '%</span>'; }
  function weekCols(date, pick, o) {
    const days = Club.date.week(date);
    return Club.charts.columns(Object.assign({
      labels: days.map(function (d) { return fmt.weekday(d) + ' ' + fmt.toDate(d).getDate(); }),
      tipTitles: days.map(function (d) { return fmt.dateLong(d); }),
      values: days.map(function (d) { return pick(dayStats(d), d); }), whole: true, height: 190
    }, o || {}));
  }
  function lastSameDays(date, n) { const out = []; for (let i = 1; i <= n; i++) out.push(Club.date.addDays(date, -7 * i)); return out; }
  function avgOf(arr) { return arr.length ? arr.reduce(function (a, v) { return a + v; }, 0) / arr.length : 0; }

  function drillPlayers(date) {
    const s = dayStats(date), tts = activeOn(date);
    const ps = []; tts.forEach(function (t) { (t.players || []).forEach(function (p) { if (p) ps.push({ p: p, t: t }); }); });
    const prevDays = lastSameDays(date, 4), prevAvg = avgOf(prevDays.map(function (d) { return dayStats(d).players; }));
    const lastWk = dayStats(Club.date.addDays(date, -7)).players;
    const weekTotal = Club.date.week(date).reduce(function (a, d) { return a + dayStats(d).players; }, 0);
    let html = ddKpis([
      { label: 'Players', value: fmt.num(s.players), sub: esc(plural(s.groups, 'group')) },
      { label: 'Per group', value: s.groups ? (s.players / s.groups).toFixed(1) : '0', sub: esc('4 is a full group') },
      { label: 'Same day last week', value: fmt.num(lastWk), sub: ddDelta(s.players, lastWk, 'last week') },
      { label: 'This week', value: fmt.num(weekTotal), sub: esc('Players Monday to Sunday') }
    ]);
    if (!ps.length) return html + ddNote('Nobody is booked on this day yet. Players appear here as tee times are booked.');
    const hours = dayHours();
    html += ddSec('Players by tee time hour', esc('Players starting in each hour'), Club.charts.columns({
      labels: hours.map(hourShort), values: hours.map(function (h) { return ps.filter(function (x) { return hourOf(x.t) === h; }).length; }),
      tipTitles: hours.map(function (h) { return hourShort(h) + ' to ' + hourShort(h + 1); }), tipName: 'Players', whole: true, height: 200 }));
    const mem = ps.filter(function (x) { return x.p.type === 'member'; }).length, gst = ps.filter(function (x) { return x.p.type === 'guest'; }).length, pub = ps.filter(function (x) { return isPublic(x.p); }).length;
    html += ddSec('Who is playing', '', Club.charts.ranked([{ label: 'Members', value: mem }, { label: 'Guests of members', value: gst }, { label: 'Public golfers', value: pub }], { total: ps.length }));
    const nine = ps.filter(function (x) { return +x.t.holes === 9; }).length, carts = ps.filter(function (x) { return x.p.cart; }).length;
    html += '<div class="dd-two">' +
      ddSec('Round length', '', Club.charts.ranked([{ label: '18 holes', value: ps.length - nine }, { label: '9 holes', value: nine }], { total: ps.length })) +
      ddSec('Getting around', '', Club.charts.ranked([{ label: 'Riding a cart', value: carts }, { label: 'Walking', value: ps.length - carts }], { total: ps.length })) + '</div>';
    const src = { staff: 0, portal: 0, public: 0, none: 0 };
    tts.forEach(function (t) { src[src.hasOwnProperty(t.source) ? t.source : 'none'] += (t.players || []).length; });
    const srcRows = [{ label: 'Members’ portal', value: src.portal }, { label: 'Golf shop or staff', value: src.staff }, { label: 'Public website', value: src.public }];
    if (src.none) srcRows.push({ label: 'Not recorded', value: src.none });
    html += ddSec('How they booked', esc('Players by where the tee time was made'), Club.charts.ranked(srcRows.sort(function (a, b) { return b.value - a.value; }), { total: ps.length }));
    html += ddSec('This week', esc('4-week average for ' + fmt.weekday(date) + ': ' + Math.round(prevAvg) + ' players'), weekCols(date, function (x) { return x.players; }, { tipName: 'Players' }));
    return html;
  }

  function drillFilled(date) {
    const s = dayStats(date), tts = activeOn(date), blocks = blocksOn(date), slots = slotList();
    const blocked = slots.length - s.open, booked = Math.round(s.util / 100 * s.open);
    const prevAvg = Math.round(avgOf(lastSameDays(date, 4).map(function (d) { return dayStats(d).util; })));
    let html = ddKpis([
      { label: 'Tee times filled', value: s.util + '%', sub: esc(fmt.weekday(date) + ' average over 4 weeks: ' + prevAvg + '%') },
      { label: 'Player places', value: s.placeUtil + '%', sub: esc(s.players + ' of ' + s.places + ' spots taken') },
      { label: 'Open tee times', value: fmt.num(Math.max(0, s.open - booked)), sub: esc('of ' + s.open + ' bookable') },
      { label: 'Blocked', value: fmt.num(blocked), sub: esc(blocked ? 'Times closed for maintenance or events' : 'Nothing blocked') }
    ]);
    const rows = PERIODS.filter(function (p) { return p.id !== 'all'; }).map(function (p) {
      const inP = slots.filter(function (t) { const m = toMin(t); return m >= p.from && m < p.to && !blockAt(blocks, date, t); });
      if (!inP.length) return null;
      const g = tts.filter(function (t) { const m = toMin(t.time); return m >= p.from && m < p.to && !blockAt(blocks, date, t.time); });
      const pl = g.reduce(function (a, t) { return a + (t.players || []).length; }, 0);
      return { cells: ['<span class="primary-cell">' + esc(p.label) + '</span>', g.length + ' of ' + inP.length, pl + ' of ' + inP.length * 4, fillBar(pctOf(g.length, inP.length))] };
    }).filter(Boolean);
    html += ddSec('By part of the day', esc('Groups booked against open tee times'), ddTable([{ label: 'Part of day' }, { label: 'Tee times', num: true }, { label: 'Players', num: true, sm: true }, { label: 'Filled', num: true }], rows));
    const hours = dayHours();
    html += ddSec('Filled by hour', esc('Share of each hour’s tee times with a group'), Club.charts.columns({
      labels: hours.map(hourShort), pct: true, tipName: 'Filled', tipTitles: hours.map(function (h) { return hourShort(h) + ' to ' + hourShort(h + 1); }), height: 200,
      values: hours.map(function (h) {
        const inH = slots.filter(function (t) { return Math.floor(toMin(t) / 60) === h && !blockAt(blocks, date, t); });
        return pctOf(tts.filter(function (t) { return hourOf(t) === h && !blockAt(blocks, date, t.time); }).length, inH.length);
      }) }));
    html += ddSec('This week', esc('Tee times filled each day'), weekCols(date, function (x) { return x.util; }, { pct: true, whole: false, tipName: 'Filled' }));
    return html;
  }

  function drillGuests(date) {
    const s = dayStats(date), tts = activeOn(date);
    const groups = tts.filter(function (t) { return (t.players || []).some(function (p) { return p.type === 'guest'; }); }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    const shop = []; tts.forEach(function (t) { (t.players || []).forEach(function (p) { if (p.type === 'guest' && p.pays === 'shop') shop.push(p); }); });
    const hosts = {}; groups.forEach(function (t) { (t.players || []).forEach(function (p) { if (p.type === 'guest') { const h = guestHost(t, p); if (h) hosts[h.memberId] = 1; } }); });
    const lastWk = dayStats(Club.date.addDays(date, -7)).guests;
    let html = ddKpis([
      { label: 'Guests', value: fmt.num(s.guests), sub: esc(pctOf(s.guests, s.players) + '% of the field') },
      { label: 'Hosting members', value: fmt.num(Object.keys(hosts).length), sub: esc(plural(groups.length, 'group') + ' with guests') },
      { label: 'Paying at the shop', value: fmt.num(shop.length), sub: esc((s.guests - shop.length) + ' on the host’s account') },
      { label: 'Same day last week', value: fmt.num(lastWk), sub: ddDelta(s.guests, lastWk, 'last week') }
    ]);
    if (groups.length) {
      html += ddSec('Guests on this day', esc('Press a row to open the tee time'), ddTable([{ label: 'Tee time' }, { label: 'Host' }, { label: 'Guests' }, { label: 'Fees', sm: true }],
        groups.map(function (t) {
          const gs = (t.players || []).filter(function (p) { return p.type === 'guest'; });
          const h = gs.length ? guestHost(t, gs[0]) : null;
          const atShop = gs.filter(function (p) { return p.pays === 'shop'; }).length;
          return { tt: t.id, cells: ['<span class="primary-cell">' + esc(fmt.time(t.time)) + '</span>', esc(h && Club.members.get(h.memberId) ? Club.members.name(h.memberId) : 'No host'), esc(gs.map(function (p) { return p.name || 'Guest'; }).join(', ')),
            atShop === gs.length ? ui.badge('At the shop', 'plain') : atShop ? ui.badge('Split', 'plain') : ui.badge('On account', 'plain')] };
        })));
    } else html += ddNote('No guests are booked on this day.');
    const from = Club.date.addDays(date, -29), tally = {};
    S.where('teeTimes', function (t) { return t.date >= from && t.date <= date && t.status !== 'cancelled' && t.status !== 'no-show'; }).forEach(function (t) {
      (t.players || []).forEach(function (p) { if (p.type !== 'guest') return; const h = guestHost(t, p); if (h) tally[h.memberId] = (tally[h.memberId] || 0) + 1; });
    });
    const top = Object.keys(tally).map(function (id) { const m = Club.members.get(id); return { label: m ? m.firstName + ' ' + m.lastName : 'Former member', value: tally[id] }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 5);
    const tot = Object.keys(tally).reduce(function (a, k) { return a + tally[k]; }, 0);
    html += ddSec('Members bringing the most guests', esc('Last 30 days, ' + plural(tot, 'guest round')), top.length ? Club.charts.ranked(top, { total: tot }) : ddNote('No guest rounds in the last 30 days.'));
    html += ddSec('This week', esc('Guests each day'), weekCols(date, function (x) { return x.guests; }, { tipName: 'Guests' }));
    return html;
  }

  function drillPublic(date) {
    const s = dayStats(date), tts = activeOn(date);
    const rows = []; tts.slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; }).forEach(function (t) { (t.players || []).forEach(function (p) { if (isPublic(p)) rows.push({ p: p, t: t }); }); });
    const due = rows.filter(function (x) { return !x.p.paid; }).length, atShop = rows.filter(function (x) { return x.p.paid && !paidOnline(x.p); }).length;
    let html = ddKpis([
      { label: 'Public golfers', value: fmt.num(s.publics), sub: esc(pctOf(s.publics, s.players) + '% of the field') },
      { label: 'Paid online', value: fmt.num(s.publicOnline), sub: esc(s.online ? money(s.online) + ' taken online' : s.publicOnline ? 'No payment on file' : 'No online payments') },
      { label: 'Paid at the shop', value: fmt.num(atShop), sub: esc('Card, cash or gift card') },
      { label: 'Still to pay', value: fmt.num(due), sub: esc(due ? 'Collect at the golf shop' : 'Everyone is settled') }
    ]);
    if (rows.length) {
      html += ddSec('Public golfers on this day', esc('Press a row to open the tee time'), ddTable([{ label: 'Tee time' }, { label: 'Golfer' }, { label: 'Round', sm: true }, { label: 'Payment' }],
        rows.map(function (x) {
          return { tt: x.t.id, cells: ['<span class="primary-cell">' + esc(fmt.time(x.t.time)) + '</span>', esc(memberLabel(x.p)), esc((x.t.holes || 18) + ' holes, ' + (x.p.cart ? 'cart' : 'walking')),
            ui.badge(publicPayLabel(x.p), x.p.paid ? 'good' : 'warn')] };
        })));
    } else html += ddNote('No public golfers are booked on this day. Tee times booked on the public website appear here.');
    html += ddSec('This week', esc('Public golfers each day'), weekCols(date, function (x) { return x.publics; }, { tipName: 'Public golfers' }));
    return html;
  }

  function drillNoShows(date) {
    const today = Club.date.today();
    const todays = S.where('teeTimes', function (t) { return t.date === date && t.status === 'no-show'; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    const end = date < today ? date : today, from = Club.date.addDays(end, -29), from90 = Club.date.addDays(end, -89);
    const past = S.where('teeTimes', function (t) { return t.date >= from && t.date <= end && t.status !== 'cancelled' && (t.date < today || t.status === 'no-show' || t.status === 'completed'); });
    const ns30 = past.filter(function (t) { return t.status === 'no-show'; }).length;
    const rep = {};
    S.where('teeTimes', function (t) { return t.status === 'no-show' && t.date >= from90 && t.date <= end; }).forEach(function (t) { const h = hostOf(t); if (h) rep[h.memberId] = (rep[h.memberId] || 0) + 1; });
    const repeat = Object.keys(rep).filter(function (k) { return rep[k] >= 2; });
    let html = ddKpis([
      { label: 'No-shows', value: fmt.num(todays.length), sub: esc(todays.length ? plural(todays.reduce(function (a, t) { return a + (t.players || []).length; }, 0), 'player') + ' missed' : 'All accounted for') },
      { label: 'Last 30 days', value: fmt.num(ns30), sub: esc(pctOf(ns30, past.length) + '% of groups') },
      { label: 'Repeat no-shows', value: fmt.num(repeat.length), sub: esc('Members with 2 or more in 90 days') }
    ]);
    html += ddSec('No-shows on this day', '', todays.length ? ddTable([{ label: 'Tee time' }, { label: 'Group' }, { label: 'Players', num: true }],
      todays.map(function (t) { return { tt: t.id, cells: ['<span class="primary-cell">' + esc(fmt.time(t.time)) + '</span>', esc(leadOf(t)), (t.players || []).length] }; }))
      : ddNote(date > today ? 'This day has not happened yet.' : 'No groups were marked as no-shows.'));
    const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(Club.date.addDays(end, -7 * i - 6));
    html += ddSec('Last eight weeks', esc('No-show groups per week'), Club.charts.columns({
      labels: weeks.map(function (d) { return fmt.toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }),
      tipTitles: weeks.map(function (d) { return 'Week from ' + fmt.dateLong(d); }), tipName: 'No-shows', whole: true, height: 190,
      values: weeks.map(function (d) { const e = Club.date.addDays(d, 6); return S.where('teeTimes', function (t) { return t.status === 'no-show' && t.date >= d && t.date <= e; }).length; }) }));
    const top = Object.keys(rep).map(function (id) { const m = Club.members.get(id); return { label: m ? m.firstName + ' ' + m.lastName : 'Former member', value: rep[id] }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 5);
    html += ddSec('Most no-shows', esc('Booking members, last 90 days'), top.length ? Club.charts.ranked(top, { noShare: true }) : ddNote('No member no-shows in the last 90 days.'));
    return html;
  }

  function drillRounds(date) {
    const s = dayStats(date);
    const done = S.where('teeTimes', function (t) { return t.date === date && t.status === 'completed'; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    const out = S.where('teeTimes', function (t) { return t.date === date && t.status === 'on-course'; });
    const timed = done.filter(function (t) { return t.startedAt && t.finishedAt; });
    const r18 = timed.filter(function (t) { return +t.holes !== 9; });
    const avg = r18.length ? Math.round(avgOf(r18.map(function (t) { return toMin(t.finishedAt) - toMin(t.startedAt); }))) : null;
    const tgt = PACE_TARGET[18];
    let html = ddKpis([
      { label: 'Players finished', value: fmt.num(s.rounds), sub: esc(plural(done.length, 'group')) },
      { label: 'Still on course', value: fmt.num(out.reduce(function (a, t) { return a + (t.players || []).length; }, 0)), sub: esc(plural(out.length, 'group')) },
      { label: 'Average 18 holes', value: avg ? dur(avg) : 'None yet', sub: esc(avg ? (avg <= tgt ? 'Within' : (avg - tgt) + ' min over') + ' the ' + dur(tgt) + ' target' : 'Set when 18-hole groups finish') }
    ]);
    if (done.length) {
      html += ddSec('Finished groups', esc('Press a row to open the tee time'), ddTable([{ label: 'Off' }, { label: 'Group' }, { label: 'Holes', num: true, sm: true }, { label: 'Round time', num: true, sm: true }, { label: 'Pace' }],
        done.map(function (t) {
          const m = t.startedAt && t.finishedAt ? toMin(t.finishedAt) - toMin(t.startedAt) : null, tg = PACE_TARGET[t.holes] || tgt;
          return { tt: t.id, cells: ['<span class="primary-cell">' + esc(fmt.time(t.startedAt || t.time)) + '</span>', esc(leadOf(t)), t.holes || 18, m != null ? dur(m) : 'Not timed',
            m == null ? '' : m <= tg ? ui.badge('On pace', 'good') : ui.badge((m - tg) + ' min over', m - tg > 15 ? 'bad' : 'warn')] };
        })));
    } else html += ddNote(date > Club.date.today() ? 'This day has not happened yet.' : 'No groups have finished on this day yet.');
    const from = Club.date.addDays(date, -13);
    const hist = S.where('teeTimes', function (t) { return t.status === 'completed' && +t.holes !== 9 && t.startedAt && t.finishedAt && t.date >= from && t.date <= date; })
      .map(function (t) { return toMin(t.finishedAt) - toMin(t.startedAt); });
    const bands = [{ label: 'Under 4 hours', test: function (m) { return m < 240; } }, { label: '4h 00m to ' + dur(tgt), test: function (m) { return m >= 240 && m <= tgt; } },
      { label: 'Up to 15 min over', test: function (m) { return m > tgt && m <= tgt + 15; } }, { label: 'More than 15 min over', test: function (m) { return m > tgt + 15; } }];
    html += ddSec('18-hole round times', esc('Last 14 days, ' + plural(hist.length, 'round')), hist.length ? Club.charts.ranked(bands.map(function (b) { return { label: b.label, value: hist.filter(b.test).length }; }), { total: hist.length }) : ddNote('No timed 18-hole rounds in the last 14 days.'));
    html += ddSec('This week', esc('Players finished each day'), weekCols(date, function (x) { return x.rounds; }, { tipName: 'Players finished' }));
    return html;
  }

  const STAT_DRILLS = {
    players: { title: 'Players booked', fn: drillPlayers }, filled: { title: 'Tee times filled', fn: drillFilled }, guests: { title: 'Guests', fn: drillGuests },
    public: { title: 'Public golfers', fn: drillPublic }, noshows: { title: 'No-shows', fn: drillNoShows }, rounds: { title: 'Rounds completed', fn: drillRounds }
  };
  /** Stat boxes become buttons (same look as the Dashboard's). */
  function statsHTML(date) {
    const wrap = ui.el(ui.stats(statItems(date)));
    ui.$$('.stat', wrap).forEach(function (st, i) {
      st.classList.add('dash-drill'); st.setAttribute('role', 'button'); st.setAttribute('tabindex', '0'); st.setAttribute('aria-haspopup', 'dialog');
      st.dataset.drill = STAT_KEYS[i];
      st.insertAdjacentHTML('beforeend', '<span class="dash-drill-cue">View details' + Club.icon('chevronRight') + '</span>');
    });
    return wrap.outerHTML;
  }
  function openStatDrill(key, date, onOpenTee) {
    const d = STAT_DRILLS[key]; if (!d) return;
    let body;
    try { body = d.fn(date); } catch (e) { console.error(e); body = ui.empty({ icon: 'alert', title: 'These details could not load', text: e.message }); }
    const api = ui.drawer({ eyebrow: fmt.dateLong(date), title: d.title, body: '<div class="dd ts-dd">' + body + '</div>' });
    api.el.classList.add('dash-drawer');
    api.el.setAttribute('aria-label', d.title);
    function go(tr) { const tt = S.find('teeTimes', tr.dataset.tt); if (!tt) return; api.close(); onOpenTee(tt); }
    ui.on(api.el, 'click', 'tr[data-tt]', function (e, tr) { go(tr); });
    ui.on(api.el, 'keydown', 'tr[data-tt]', function (e, tr) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(tr); } });
    requestAnimationFrame(function () { Club.charts.fit(api.el); if (Club.charts.animate) Club.charts.animate(api.el); });
    ui.animateIn(api.body);
  }

  function stripHTML(date) {
    const today = Club.date.today();
    return Club.date.week(date).map(function (d) {
      const s = dayStats(d); const dt = fmt.toDate(d);
      return '<button type="button" class="ts-day' + (d === date ? ' active' : '') + (d === today ? ' today' : '') + '" data-action="day" data-date="' + d + '" aria-label="' + esc(fmt.dateLong(d)) + ', ' + s.util + '% booked">' +
        '<span class="ts-day-wk">' + esc(fmt.weekday(d)) + '</span><span class="ts-day-n serif">' + dt.getDate() + '</span>' +
        '<span class="ts-day-bar"><span style="width:' + Math.min(100, s.util) + '%"></span></span><span class="ts-day-pct">' + s.util + '%</span></button>';
    }).join('');
  }

  /* ---------------- The day list (Option C, Nov 17): a tidy grid, four player columns ----------------
     Players are plain text (full "Last, F." name, then handicap and Walk or Cart), an empty place is a faint dash that
     shows "+ Add" when pointed at, an empty tee time is a thin row that books when clicked, and the status column is one
     small icon and a word plus one action button. The next group to go out is highlighted with a dark button. */
  function walkCart(p) { return p.cart ? 'Cart' : 'Walk'; }
  function lowerFirst(t) { t = String(t || ''); return t.charAt(0).toLowerCase() + t.slice(1); }
  /** The second line under a player's name, and a plain-words version for screen readers and the tooltip. */
  function playerSub(tt, p) {
    if (isPublic(p)) return { text: 'Public · ' + lowerFirst(publicPayLabel(p)), cls: p.paid ? '' : ' is-due', say: 'public golfer, ' + publicPayLabel(p).toLowerCase() + ', ' + (p.cart ? 'cart' : 'walking') };
    if (p.type === 'guest') {
      const host = guestHost(tt, p), hm = host ? Club.members.get(host.memberId) : null;
      const shop = p.pays === 'shop' ? (p.paid ? 'paid at shop' : 'pays at shop') : '';
      return { text: 'Guest' + (hm ? ' of ' + hm.lastName : '') + (shop ? ' · ' + shop : '') + ' · ' + walkCart(p), cls: p.pays === 'shop' && !p.paid ? ' is-due' : '',
        say: 'guest' + (hm ? ' of ' + hm.firstName + ' ' + hm.lastName : '') + (shop ? ', ' + shop : '') + ', ' + (p.cart ? 'cart' : 'walking') };
    }
    const m = p.memberId ? Club.members.get(p.memberId) : null;
    const hc = m && m.handicap != null ? fmt.handicap(m.handicap) : null;
    return { text: (hc || 'Member') + ' · ' + walkCart(p), cls: '', say: 'member' + (hc ? ', handicap ' + hc : '') + ', ' + (p.cart ? 'cart' : 'walking') };
  }
  const DASH = '<span class="ts-dash" aria-hidden="true"></span>';
  function slotHTML(tt, p, i, date, time, bookable) {
    if (p) {
      const kind = isPublic(p) ? 'public' : p.type === 'guest' ? 'guest' : 'member';
      const sub = playerSub(tt, p), full = memberLabel(p);
      const tip = full + ', ' + sub.say + (p.paid && !isPublic(p) ? ', fees settled' : '');
      return '<button type="button" class="ts-slot filled ' + kind + (p.paid ? ' is-paid' : '') + (isPublic(p) && !p.paid ? ' pay-shop' : '') + '" data-action="open" data-id="' + esc(tt.id) + '" data-slot="' + i + '" title="' + esc(tip) + '" aria-label="' + esc(tip + '. Open the ' + fmt.time(time) + ' group') + '">' +
        '<span class="ts-pname">' + esc(shortName(p)) + '</span><span class="ts-psub' + sub.cls + '">' + esc(sub.text) + '</span></button>';
    }
    if (!bookable) return '<span class="ts-slot void" aria-hidden="true">' + DASH + '</span>';
    /* A whole empty tee time books from its row; its places are only the faint dashes. */
    if (!tt) return '<span class="ts-slot open" aria-hidden="true">' + DASH + '</span>';
    const label = 'Add a player to the ' + fmt.time(time) + ' group, place ' + (i + 1);
    return '<button type="button" class="ts-slot open" data-action="book" data-time="' + time + '" data-id="' + esc(tt.id) + '" data-slot="' + i + '" aria-label="' + esc(label) + '">' + DASH + '<span class="ts-add" aria-hidden="true">+ Add</span></button>';
  }

  const ST_ICON = { booked: 'check', late: 'alert', 'checked-in': 'check', completed: 'check', 'no-show': 'close' };
  /** The status column: one small icon and a word, then one action button (or the round time once completed).
      c: the sheet's context (now, today, the next group up) so a passed booking reads "Late" and the next group stands out. */
  function stateHTML(tt, c) {
    const st = STATUS[tt.status] || STATUS.booked;
    const isNext = !!(c && c.nextId === tt.id);
    const late = tt.status === 'booked' && !!c && (c.isPast || (c.isToday && toMin(tt.time) < c.now));
    let kind = tt.status, word = st.label;
    if (late) { kind = 'late'; word = 'Late'; }
    else if (isNext) { kind = 'next'; word = 'Next up'; }
    const ico = kind === 'next' ? '' : kind === 'on-course' ? '<i class="ts-sico" aria-hidden="true"><i class="ts-sdot"></i></i>' : '<i class="ts-sico" aria-hidden="true">' + Club.icon(ST_ICON[kind] || 'check') + '</i>';
    let act = '';
    if (st.next && tt.date <= Club.date.today()) act = '<button type="button" class="btn btn-sm ts-next' + (isNext ? ' btn-primary' : '') + '" data-action="advance" data-id="' + esc(tt.id) + '" aria-label="' + esc(st.verb + ' the ' + fmt.time(tt.time) + ' group') + '">' + esc(st.verb) + '</button>';
    else if (tt.status === 'completed' && tt.startedAt && tt.finishedAt) act = '<span class="ts-dur" title="Round time">' + dur(toMin(tt.finishedAt) - toMin(tt.startedAt)) + '</span>';
    return '<span class="ts-status is-' + kind + '">' + ico + '<span class="ts-slabel">' + esc(word) + '</span></span>' + (act ? '<span class="ts-acts">' + act + '</span>' : '');
  }

  function rowHTML(tt, time, date, idx, ctx) {
    const players = tt ? (tt.players || []) : [];
    const past = ctx.isPast || (ctx.isToday && toMin(time) < ctx.now - 10);
    const bookable = !past && (!tt || ['booked', 'checked-in'].indexOf(tt.status) >= 0);
    const names = players.map(function (p) { return memberLabel(p) + ' | ' + shortName(p); }).join(' | ').toLowerCase();
    const openCount = 4 - players.length;
    const blk = ctx.blockFor(time);
    let cells = '';
    for (let i = 0; i < 4; i++) cells += slotHTML(tt, players[i], i, date, time, bookable);
    const tp = fmt.time(time).split(' ');
    const withAdds = players.filter(function (p) { return realAdds(p).length; });
    const promos = tt ? promosFor(tt) : [];
    const marks = (tt && tt.source === 'public' ? '<span class="ts-mark src" title="Booked on the public tee times site">Online</span>' : '') +
      (tt && tt.overrides && tt.overrides.length ? '<span class="ts-mark ovr" title="' + esc(overrideText(tt)) + '">Override</span>' : '') +
      (withAdds.length ? '<span class="ts-mark add" title="' + esc('Add-ons: ' + withAdds.map(function (p) { return memberLabel(p) + ' (' + addsText(p) + ')'; }).join('; ')) + '">Add-ons</span>' : '') +
      (promos.length ? '<span class="ts-mark promo" title="' + esc(promos.map(function (x) { return 'Promo code ' + x.promo.code + ', ' + money(x.promo.discount) + ' off'; }).join('; ')) + '">Promo</span>' : '');
    const wlN = waitingAt(date, time);
    const wlMark = wlN ? '<span class="ts-mark wl" title="' + esc(wlN + ' on the waitlist for this time') + '">' + wlN + ' waiting</span>' : '';
    const tags = (tt && +tt.holes === 9 ? '<span class="ts-nine">9 holes</span>' : '') + (tt && +tt.startTee === 10 ? '<span class="ts-nine ts-tee10">10th tee</span>' : '');
    const timeInner = '<span class="ts-clock">' + tp[0] + '</span><span class="ts-ampm">' + tp[1] + '</span>' + (tags ? '<span class="ts-tags">' + tags + '</span>' : '') + (marks || wlMark ? '<span class="ts-marks">' + marks + wlMark + '</span>' : '');
    const hasMem = players.some(function (p) { return p.type === 'member'; }), hasPub = players.some(isPublic);
    const isNext = !!(tt && ctx.nextId === tt.id);
    const late = !!(tt && tt.status === 'booked' && (ctx.isPast || (ctx.isToday && toMin(time) < ctx.now)));
    /* Passed rows fade, except a group still on the course or waiting to go out. */
    const fade = past && ctx.isToday && !(tt && (tt.status === 'on-course' || tt.status === 'checked-in'));
    const data = ' data-time="' + time + '"' + (tt ? ' data-id="' + esc(tt.id) + '" data-status="' + esc(tt.status) + '"' : '') +
      ' data-names="' + esc(names) + '" data-open="' + (bookable ? openCount : 0) + '" data-mem="' + (hasMem ? 1 : 0) + '" data-pub="' + (hasPub ? 1 : 0) + '" style="--i:' + Math.min(idx, 36) + '"';
    const cls = 'ts-row' + (tt ? ' has-group' : ' empty-row') + (fade ? ' past' : '') + (isNext ? ' is-next' : '') + (late ? ' is-late' : '') + (tt && tt.overrides && tt.overrides.length ? ' has-override' : '');
    if (!tt) {
      /* A fully empty tee time: a thin row; pointing at it shows "+ Book <time>", and a click anywhere on it books. */
      const can = bookable && !blk;
      return '<div class="' + cls + (can ? ' can-book' : '') + '"' + data + (can ? ' role="button" tabindex="0" data-action="book" aria-label="' + esc('Book ' + fmt.time(time)) + '"' : '') + '>' +
        '<div class="ts-time">' + timeInner + '</div>' +
        '<div class="ts-slots">' + cells + '</div>' +
        '<div class="ts-state">' + (blk ? '<span class="ts-inblock">' + esc(blk.reason) + '</span>' : can ? '<span class="ts-bookhint" aria-hidden="true">+ Book ' + esc(fmt.time(time)) + '</span>' : '') + '</div>' +
        '</div>';
    }
    return '<div class="' + cls + '"' + data + '>' +
      '<button type="button" class="ts-time" data-action="open" data-id="' + esc(tt.id) + '" title="Open group">' + timeInner + '</button>' +
      '<div class="ts-slots">' + cells + '</div>' +
      '<div class="ts-state">' + stateHTML(tt, ctx) + '</div>' +
      (tt.notes ? '<div class="ts-note">' + Club.icon('info') + esc(tt.notes) + '</div>' : '') +
      '</div>';
  }

  function bandHTML(block, from, to, idx) {
    const kind = (BLOCK_KINDS.find(function (k) { return k.value === block.kind; }) || { label: 'Blocked' }).label;
    return '<div class="ts-band kind-' + esc(block.kind || 'event') + '" data-band data-from="' + toMin(from) + '" data-to="' + toMin(block.end) + '" style="--i:' + Math.min(idx, 36) + '">' +
      '<div class="ts-band-time"><span class="serif">' + fmt.time(block.start < from ? block.start : from) + '</span><span class="muted">until ' + esc(endLabel(block.end)) + '</span></div>' +
      '<div class="ts-band-body"><span class="label-caps">' + esc(kind) + '</span><span class="ts-band-reason">' + esc(block.reason || 'Blocked') + '</span></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="unblock" data-id="' + esc(block.id) + '">Release</button></div>';
  }

  function payLine(sp) {
    const g = sp.gift && sp.gift.amount > 0;
    if (!(sp.total > 0)) return 'No charge';
    return (g ? 'Paid with gift card ending ' + sp.gift.last4 + (sp.rest > 0 ? ' and ' + payWord(sp.method) : '') : 'Paid by ' + payWord(sp.method)) + ' · ' + money(sp.total);
  }
  /**
   * "Take payment" for a golfer paying at the golf shop (public golfer, or a member's guest who pays at the shop).
   * o: { name, kind, lines (green fee, cart, add-ons), discount (the player's earlier one, prefilled), onDone(pay), onCancel() }.
   * pay: { lines (with any discount line), subtotal, total, discount: { amount, reason, kind, value, by, at }|null,
   *        gift: { id, last4, amount }|null, method: 'card'|'cash'|'gift'|'none', rest (left after the gift card), cashTendered, change }.
   */
  function takePayment(o) {
    const sub = linesTotal(o.lines);
    const d0 = o.discount;
    const st = { method: 'card', gift: null, disc: d0 ? { kind: d0.kind === 'percent' ? 'percent' : 'amount', value: d0.kind === 'percent' ? d0.value : d0.amount, reason: d0.reason || '' } : null };
    let done = false;
    const body = '<div class="ts-pay">' +
      '<p class="ts-pay-who"><strong>' + esc(o.name) + '</strong><span class="muted">' + esc(o.kind) + '</span></p>' +
      '<ul class="ts-pay-lines"></ul>' +
      '<div class="ts-pay-disc"></div>' +
      (Club.giftcards ? '<div class="ts-pay-gift"></div>' : '') +
      '<div class="ts-pay-tender"><div class="label-caps ts-pay-l" id="ts-pay-tl">Tender</div>' +
        '<div class="segmented ts-pay-seg" role="radiogroup" aria-labelledby="ts-pay-tl">' +
          '<button type="button" role="radio" data-tender="card" class="active" aria-checked="true">' + Club.icon('card') + '<span>Card</span></button>' +
          '<button type="button" role="radio" data-tender="cash" aria-checked="false">' + Club.icon('cash') + '<span>Cash</span></button></div>' +
        '<p class="ts-pay-note" data-for="card">Take the payment on the card terminal, then record it here.</p>' +
        '<div class="ts-pay-cash" data-for="cash" hidden><div class="field"><label for="ts-pay-cash">Cash tendered</label><input class="input num" id="ts-pay-cash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div><div class="ts-pay-quick"></div><p class="ts-pay-change" aria-live="polite"></p></div>' +
      '</div>' +
      '<div class="ts-pay-due"><span class="label-caps">Due now</span><strong class="serif"></strong></div>' +
      '<div class="ts-alert" role="alert" hidden></div>' +
    '</div>';
    const m = ui.modal({ eyebrow: o.eyebrow || 'Golf shop payment', title: 'Take payment', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Record payment', kind: 'primary', icon: 'check', onClick: function () { return record(); } }
    ], onClose: function () { if (!done && o.onCancel) o.onCancel(); } });
    if (m.duplicate) return;
    m.el.classList.add('ts-pay-modal');
    const root = ui.$('.ts-pay', m.body);
    function discAmt() {
      if (!st.disc) return 0; const v = parseFloat(st.disc.value); if (!(v > 0)) return 0;
      return r2(Math.min(sub, st.disc.kind === 'percent' ? sub * Math.min(100, v) / 100 : v));
    }
    function total() { return r2(sub - discAmt()); }
    function giftS() { return Club.giftcards && st.gift ? Club.giftcards.tillState(st.gift, total()) : null; }
    function due() { const g = giftS(); return g && g.amount > 0 ? g.due : total(); }
    function paint() {
      const da = discAmt();
      ui.$('.ts-pay-lines', root).innerHTML = o.lines.map(function (l) { return '<li><span>' + esc(l.name) + (l.qty > 1 ? ' <span class="muted">x ' + l.qty + '</span>' : '') + '</span><span class="num">' + money(l.qty * l.price) + '</span></li>'; }).join('') +
        (da ? '<li class="ts-pay-dl"><span>Discount' + (st.disc.kind === 'percent' ? ' (' + esc(String(Math.min(100, +st.disc.value))) + '%)' : '') + '</span><span class="num">−' + money(da) + '</span></li>' : '') +
        '<li class="ts-pay-tot"><span>Total</span><span class="num">' + money(total()) + '</span></li>';
      const gh = ui.$('.ts-pay-gift', root); if (gh) gh.innerHTML = total() > 0 ? Club.giftcards.tillHTML(st.gift, total()) : '';
      const left = due();
      ui.$('.ts-pay-tender', root).hidden = !(left > 0);
      ui.$('.ts-pay-due strong', root).textContent = money(left);
      const q = ui.$('.ts-pay-quick', root);
      const quick = [left, Math.ceil(left / 20) * 20, Math.ceil(left / 50) * 50, Math.ceil(left / 100) * 100].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
      q.innerHTML = quick.map(function (v, i) { return '<button type="button" class="btn btn-sm" data-cash="' + v + '">' + (i === 0 ? 'Exact' : fmt.money0(v)) + '</button>'; }).join('');
      change();
    }
    function change() {
      const c = parseFloat(ui.$('#ts-pay-cash', root).value), left = due(), out = ui.$('.ts-pay-change', root);
      out.textContent = isNaN(c) ? '' : c + 0.001 < left ? money(r2(left - c)) + ' short' : 'Change ' + money(r2(c - left));
      out.classList.toggle('is-short', !isNaN(c) && c + 0.001 < left);
    }
    function discHTML() {
      if (!st.disc) return '<button type="button" class="btn btn-ghost btn-sm ts-pay-disc-add" data-pay="disc-add">' + Club.icon('tag') + '<span>Add a discount</span></button>';
      return '<div class="ts-pay-disc-f"><div class="row between"><span class="label-caps">Discount</span><button type="button" class="btn btn-ghost btn-sm" data-pay="disc-rm">Remove</button></div>' +
        '<div class="ts-pay-disc-row">' + ui.segmented([{ value: 'amount', label: '$ off' }, { value: 'percent', label: '% off' }], st.disc.kind, 'tsdk') +
          '<div class="field"><label for="ts-pay-dv" class="sr-only">Discount ' + (st.disc.kind === 'percent' ? 'percent' : 'amount') + '</label><input class="input num" id="ts-pay-dv" name="dv" type="number" min="0" step="' + (st.disc.kind === 'percent' ? '1' : '0.01') + '" inputmode="decimal" placeholder="' + (st.disc.kind === 'percent' ? '10' : '10.00') + '" value="' + esc(st.disc.value == null ? '' : st.disc.value) + '"></div></div>' +
        '<div class="field"><label for="ts-pay-dr">Reason *</label><input class="input" id="ts-pay-dr" name="dr" maxlength="120" placeholder="For example, slow play on the back nine" value="' + esc(st.disc.reason || '') + '"></div></div>';
    }
    function drawDisc(focus) { ui.$('.ts-pay-disc', root).innerHTML = discHTML(); if (focus) { const f = ui.$(focus, root); if (f) f.focus(); } }
    function clearErr() { ui.$$('.field-error', root).forEach(function (x) { x.remove(); }); ui.$$('.invalid', root).forEach(function (x) { x.classList.remove('invalid'); }); ui.$('.ts-alert', root).hidden = true; }
    function err(sel, msg) { const f = ui.$(sel, root); if (f) { f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); } }
    root.addEventListener('click', function (e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.pay === 'disc-add') { st.disc = { kind: 'amount', value: '', reason: '' }; drawDisc('#ts-pay-dv'); paint(); }
      else if (b.dataset.pay === 'disc-rm') { st.disc = null; clearErr(); drawDisc('.ts-pay-disc-add'); paint(); }
      else if (b.closest('.segmented[data-name=tsdk]')) { st.disc.kind = b.dataset.value; st.disc.value = ''; drawDisc('#ts-pay-dv'); paint(); }
      else if (b.dataset.tender) {
        st.method = b.dataset.tender;
        ui.$$('[data-tender]', root).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
        ui.$$('[data-for]', root).forEach(function (x) { x.hidden = x.dataset.for !== st.method; });
        if (st.method === 'cash') ui.$('#ts-pay-cash', root).focus();
      }
      else if (b.dataset.cash) { ui.$('#ts-pay-cash', root).value = b.dataset.cash; change(); }
      else if (b.dataset.gcTill === 'add') Club.giftcards.tillApply({ total: total(), onApply: function (g) { st.gift = g; paint(); } });
      else if (b.dataset.gcTill === 'remove') { st.gift = null; paint(); }
    });
    root.addEventListener('input', function (e) {
      const t = e.target; t.classList.remove('invalid'); const er = t.parentNode.querySelector('.field-error'); if (er) er.remove();
      if (t.name === 'dv') { st.disc.value = t.value; paint(); }
      else if (t.name === 'dr') st.disc.reason = t.value;
      else if (t.id === 'ts-pay-cash') change();
    });
    drawDisc(); paint();
    function record() {
      clearErr();
      let ok = true;
      if (st.disc) {
        const v = parseFloat(st.disc.value), reason = String(st.disc.reason || '').replace(/\s+/g, ' ').trim();
        if (!(v > 0)) { err('#ts-pay-dv', st.disc.kind === 'percent' ? 'Enter a percent from 1 to 100.' : 'Enter the discount in dollars.'); ok = false; }
        else if (st.disc.kind === 'percent' && v > 100) { err('#ts-pay-dv', 'A discount cannot be more than 100%.'); ok = false; }
        else if (st.disc.kind === 'amount' && v > sub + 0.001) { err('#ts-pay-dv', 'The discount cannot be more than the ' + money(sub) + ' total.'); ok = false; }
        if (reason.length < 3) { err('#ts-pay-dr', 'Give a reason for the discount. It is kept with the payment.'); ok = false; }
        st.disc.reason = reason;
      }
      const g = giftS(), gift = g && g.amount > 0 ? g : null, left = due();
      if (st.gift && !g) { ui.$('.ts-alert', root).innerHTML = Club.icon('alert') + '<div>That gift card can no longer be used. Remove it or apply another.</div>'; ui.$('.ts-alert', root).hidden = false; ok = false; }
      let cash = null;
      if (left > 0 && st.method === 'cash') {
        cash = parseFloat(ui.$('#ts-pay-cash', root).value);
        if (isNaN(cash)) { err('#ts-pay-cash', 'Enter the cash tendered.'); ok = false; }
        else if (cash + 0.001 < left) { err('#ts-pay-cash', 'Cash tendered is ' + money(r2(left - cash)) + ' short of what is due.'); ok = false; }
      }
      if (!ok) { const f = ui.$('.invalid', root); if (f) f.focus(); return false; }
      const da = discAmt();
      const disc = st.disc && da > 0 ? { amount: da, reason: st.disc.reason, kind: st.disc.kind, value: r2(st.disc.value), by: staffName(), at: new Date().toISOString() } : null;
      done = true;
      o.onDone({
        lines: o.lines.concat(disc ? [{ name: 'Discount: ' + disc.reason, qty: 1, price: -da }] : []), subtotal: sub, total: total(), discount: disc,
        gift: gift ? { id: gift.card.id, last4: Club.giftcards.last4(gift.card), amount: gift.amount } : null,
        method: left > 0 ? st.method : gift ? 'gift' : 'none', rest: left, cashTendered: cash, change: cash != null ? r2(cash - left) : null
      });
    }
  }

  /* Shared with Lessons (Nov 10): the same golf shop till for a lesson paid at the counter. */
  Club.teeSheet.takePayment = takePayment;
  Club.teeSheet.payLine = payLine;

  /** Pickers opened from inside a dialog: lift the shared sheet above the dialog overlay. */
  function liftSheets(root) {
    root.addEventListener('click', function () {
      const sh = document.querySelectorAll('.ps-sheet'), sc = document.querySelectorAll('.ps-scrim');
      if (sh.length) sh[sh.length - 1].style.zIndex = 161;
      if (sc.length) sc[sc.length - 1].style.zIndex = 160;
    });
  }

  /* ---------------- Module ---------------- */
  Club.register({
    id: 'teesheet', label: 'Tee Sheet', icon: 'teesheet', section: 'Golf', order: 10,
    badge: function () { const n = S.where('teeTimes', function (t) { return t.date === Club.date.today() && t.status === 'on-course'; }).length; return n || null; },
    search: function (q) {
      const from = Club.date.today(), to = Club.date.fromToday(14); const out = [];
      S.all('teeTimes').forEach(function (tt) {
        if (tt.status === 'cancelled' || tt.date < from || tt.date > to) return;
        (tt.players || []).forEach(function (p) {
          const n = memberLabel(p);
          if (n.toLowerCase().indexOf(q) >= 0) out.push({ label: n, sub: (p.type === 'guest' ? 'Guest tee time' : isPublic(p) ? 'Public tee time' : 'Tee time') + ' · ' + fmt.weekday(tt.date) + ' ' + fmt.dateShort(tt.date) + ' · ' + fmt.time(tt.time), href: 'teesheet/' + tt.date, icon: 'teesheet', k: tt.date + tt.time });
        });
      });
      return out.sort(function (a, b) { return a.k < b.k ? -1 : 1; }).slice(0, 6).map(function (r) { delete r.k; return r; });
    },
    render: render
  });

  function render(view, params) {
    const today = Club.date.today();
    const state = { date: validDate(params[0]) ? params[0] : today, q: '', filter: 'all', kind: 'all' };
    const wx = (Club.weather.forecast || []).find(function (w) { return w.date === state.date; });
    const rel = state.date === today ? 'Today' : fmt.relative(state.date);
    const c0isToday = state.date === today;
    if (periodPick === 'all') periodPick = null;
    state.period = periodPick || (c0isToday ? periodOf(Math.min(Math.max(nowMin(), toMin(settings().first)), toMin(settings().last))).id : 'morning');
    function sideAcc(id, icon, title, openDefault) {
      const open = accOpen[id] != null ? accOpen[id] : openDefault;
      return '<div class="ts-acc ts-' + id + '" data-side="' + id + '">' + Portal.accordion({ id: 'ts-acc-' + id, icon: icon, title: title, summary: ' ', body: '', open: open }) + '</div>';
    }
    function setSide(id, summary, html) {
      const host = ui.$('[data-side="' + id + '"]', view); if (!host) return;
      ui.$('.pk-acc-sum', host).textContent = summary; ui.$('.pk-acc-body', host).innerHTML = html;
    }

    view.innerHTML =
      ui.pageHeader({
        eyebrow: 'Golf operations', title: 'Tee Sheet',
        subtitle: '<span class="ts-subdate">' + esc(fmt.dateLong(state.date)) + '</span> <span class="badge plain ts-rel">' + esc(rel) + '</span>' + (wx ? ' <span class="ts-wx">' + Club.icon(wx.icon) + esc(wx.cond) + ', ' + wx.hi + '° / ' + wx.lo + '°, wind ' + wx.wind + ' km/h</span>' : ''),
        actions: ui.btn('Block times', { icon: 'maintenance', action: 'block' })
      }) +
      '<div class="ts-datebar panel" data-reveal>' +
        '<div class="ts-strip" role="group" aria-label="Week at a glance">' + stripHTML(state.date) + '</div>' +
      '</div>' +
      '<div class="ts-stats">' + statsHTML(state.date) + '</div>' +
      '<div class="ts-wrap"><div class="ts-layout">' +
        '<section class="panel ts-sheet-panel" data-reveal>' +
          '<h3 class="ts-sr">' + esc(fmt.weekday(state.date)) + ' starting sheet, tee times every ' + settings().interval + ' minutes</h3>' +
          /* One bar above the list (Option C): date, Today and Now on the left; the player search, the two filters and Book on the right. */
          '<div class="ts-bar">' +
            '<div class="ts-datenav">' +
              '<div class="ts-dp"></div>' +
              '<button type="button" class="btn ts-today" data-action="today"' + (state.date === today ? ' aria-current="date"' : '') + '>Today</button>' +
              (state.date === today ? ui.btn('Now', { icon: 'clock', action: 'jump-now', title: 'Jump to the current time' }).replace('class="btn ', 'class="btn ts-nowbtn ') : '') +
            '</div>' +
            '<div class="ts-tools">' +
              '<div class="ts-search">' + Club.icon('search') + '<input type="search" class="input" placeholder="Find a player" aria-label="Filter by player name"></div>' +
              /* The two filters are dropdowns (owner, Nov 17) so the bar fits on one line */
              '<select class="select ts-fsel" name="tsfilter" aria-label="Show tee times">' + ui.options([{ value: 'all', label: 'All times' }, { value: 'open', label: 'Open times' }, { value: 'booked', label: 'Booked times' }], 'all') + '</select>' +
              '<select class="select ts-fsel" name="tskind" aria-label="Show players">' + ui.options([{ value: 'all', label: 'All players' }, { value: 'members', label: 'Members' }, { value: 'public', label: 'Public golfers' }], 'all') + '</select>' +
            '</div>' +
            '<button type="button" class="btn btn-primary ts-book" data-action="book-new" title="Book a tee time">' + Club.icon('plus') + '<span>Book</span></button>' +
          '</div>' +
          '<div class="ts-periods" data-name="tsperiod" role="group" aria-label="Parts of the day"></div>' +
          '<div class="ts-scroll" tabindex="0" aria-label="Tee sheet, scroll for the whole day">' +
          '<div class="ts-head" aria-hidden="true"><span>Time <small>' + settings().interval + ' min</small></span><span class="ts-head-slots"><span>Player 1</span><span>Player 2</span><span>Player 3</span><span>Player 4</span></span><span>Status</span></div>' +
          '<div class="ts-sheet cascade"></div>' +
          '<div class="ts-filter-empty" hidden></div>' +
          '</div>' +
        '</section>' +
        '<aside class="ts-side" aria-label="Starter, waitlist, blocks and fees">' +
          '<section class="panel ts-starter" aria-label="' + (c0isToday ? 'Starter' : 'Day at a glance') + '"></section>' +
          (WL() ? sideAcc('waitlist', 'bell', 'Waitlist', WL().onDate(state.date).some(WL().isActive)) : '') +
          sideAcc('blocks', 'maintenance', 'Blocked times', false) +
          sideAcc('fees', 'billing', 'Golf fees', false) +
        '</aside>' +
      '</div></div>';

    const sheet = ui.$('.ts-sheet', view);

    function ctx() {
      const blocks = blocksOn(state.date), isToday = state.date === today, now = nowMin();
      const nx = isToday ? dueOff(state.date, now)[0] : null;
      return {
        isToday: isToday, isPast: state.date < today, now: now, blocks: blocks, nextId: nx ? nx.id : null,
        blockFor: function (t) { return blockAt(blocks, state.date, t); }
      };
    }

    /** The day's rows, bands and the Now line as HTML. */
    function sheetHTML(c) {
      const byTime = {}; activeOn(state.date).forEach(function (t) { byTime[t.time] = t; });
      const slots = slotList();
      // groups that fall off-grid (e.g. after settings change) are still shown
      Object.keys(byTime).forEach(function (t) { if (slots.indexOf(t) < 0) slots.push(t); });
      slots.sort();
      let html = '', band = null, idx = 0, nowPlaced = !c.isToday;
      const nowLine = function (word) { return '<div class="ts-now" data-now data-min="' + c.now + '" role="separator" aria-label="' + esc(word + ' ' + fmt.time(toHM(c.now))) + '"><span>' + esc(word + ' ' + fmt.time(toHM(c.now))) + '</span></div>'; };
      const flush = function () { if (band) { html += bandHTML(band.block, band.from, band.to, idx++); band = null; } };
      slots.forEach(function (t, i) {
        if (!nowPlaced && toMin(t) > c.now) { flush(); html += nowLine('Now'); nowPlaced = true; }
        const blk = c.blockFor(t); const tt = byTime[t];
        if (blk && !tt) {
          const nextT = slots[i + 1] || closeHM();
          if (band && band.block.id === blk.id) band.to = nextT > blk.end ? blk.end : nextT;
          else { flush(); band = { block: blk, from: t, to: nextT > blk.end ? blk.end : nextT }; }
          band.to = blk.end;
          return;
        }
        flush();
        html += rowHTML(tt, t, state.date, idx++, c);
      });
      flush();
      if (!nowPlaced) html += nowLine('Close of play');
      return html;
    }
    function rowKey(el) { return el.hasAttribute('data-now') ? 'now' : el.dataset.time ? 't' + el.dataset.time : el.hasAttribute('data-band') ? 'b' + el.dataset.from : ''; }
    /** What has keyboard focus in the sheet, so a redraw can put it back: { key: the row, sel: the control in it }. */
    function focusMark(root) {
      const a = document.activeElement; if (!a || !root.contains(a)) return null;
      const row = a.closest('.ts-row, .ts-band, [data-fk]'); if (!row) return null;
      let sel = null;
      if (a !== row) {
        if (a.dataset.action) sel = '[data-action="' + a.dataset.action + '"]' + (a.dataset.slot != null ? '[data-slot="' + a.dataset.slot + '"]' : '') + (a.dataset.value ? '[data-value="' + a.dataset.value + '"]' : '');
        else if (a.classList.contains('ts-time')) sel = '.ts-time';
      }
      return { key: row.dataset.fk || rowKey(row), sel: sel, fk: !!row.dataset.fk };
    }
    function focusBack(root, m) {
      if (!m || (document.activeElement && root.contains(document.activeElement) && document.activeElement !== document.body)) return;
      const row = m.fk ? ui.$('[data-fk="' + m.key + '"]', root) : ui.$$('.ts-row, .ts-band', root).find(function (r) { return rowKey(r) === m.key; });
      if (!row) return;
      const t = (m.sel && ui.$(m.sel, row)) || (row.tabIndex >= 0 ? row : ui.$('button:not([disabled]), [tabindex="0"]', row));
      if (t) try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
    }
    /* A redraw changes only the rows whose content changed (the scroll position, focus and untouched rows stay put);
       the first draw of the day, or a different set of rows, draws the whole list. */
    function renderSheet(opts) {
      opts = opts || {};
      const c = ctx();
      const html = sheetHTML(c);
      const fm = focusMark(sheet);
      sheet.classList.toggle('cascade', !!opts.cascade);
      const next = ui.el('<div>' + html + '</div>');
      const fresh = Array.prototype.slice.call(next.children), cur = Array.prototype.slice.call(sheet.children);
      const same = !opts.cascade && fresh.length === cur.length && fresh.every(function (n, i) { return rowKey(n) === rowKey(cur[i]); });
      if (same) {
        fresh.forEach(function (n, i) {
          const o = cur[i];
          o.removeAttribute('hidden');
          if (o.outerHTML !== n.outerHTML) { sheet.replaceChild(n, o); if (o.classList.contains('has-group') && n.classList.contains('has-group') && o.dataset.status !== n.dataset.status) n.classList.add('just-changed'); }
        });
      } else sheet.innerHTML = html;
      if (opts.flash) {
        const row = ui.$('.ts-row[data-id="' + opts.flash.id + '"]', sheet);
        if (row) {
          row.classList.add('just-saved');
          (opts.flash.slots || []).forEach(function (i) { const s = ui.$$('.ts-slot', row)[i]; if (s) { s.classList.add('just-filled'); s.style.animationDelay = (i * 70) + 'ms'; } });
          if (opts.flash.scroll) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
      paintHolds();
      applyFilter();
      focusBack(sheet, fm);
      paintedAt = nowSig();
    }
    /* The minute the sheet was drawn for: the live clock redraws when a tee time passes (Late, Next up, faded rows). */
    let paintedAt = '';
    function nowSig() { if (state.date !== today) return ''; const n = nowMin(); return slotList().filter(function (t) { return toMin(t) <= n; }).length + '|' + slotList().filter(function (t) { return toMin(t) < n - 10; }).length; }
    /* Online holds on the rows, updated in place (one timer for the sheet): a counting pill by the time (in the status
       column on an empty tee time), and the open places shown as held and not bookable until the hold ends or is released. */
    function paintHolds() {
      const hs = holdsOn(state.date);
      ui.$$('.ts-row', sheet).forEach(function (row) {
        const x = hs[row.dataset.time]; const held = !!(x && x.left > 0);
        const empty = row.classList.contains('empty-row');
        let pill = ui.$('.ts-mark.held', row);
        if (!held) {
          if (!row.classList.contains('is-held')) return;
          row.classList.remove('is-held'); if (pill) pill.remove();
          if (empty && row.classList.contains('can-book')) { row.removeAttribute('aria-disabled'); row.setAttribute('aria-label', 'Book ' + fmt.time(row.dataset.time)); }
          ui.$$('.ts-slot.open.is-held', row).forEach(function (s) { s.classList.remove('is-held'); s.removeAttribute('aria-disabled'); s.removeAttribute('title'); if (s.tagName === 'BUTTON') s.setAttribute('aria-label', s.dataset.label || s.getAttribute('aria-label')); });
          return;
        }
        row.classList.add('is-held');
        if (!pill) {
          let marks = ui.$('.ts-marks', row);
          if (empty) marks = ui.$('.ts-state', row);
          else if (!marks) { marks = document.createElement('span'); marks.className = 'ts-marks'; ui.$('.ts-time', row).appendChild(marks); }
          pill = document.createElement('span'); pill.className = 'ts-mark held'; marks.insertBefore(pill, marks.firstChild);
        }
        pill.textContent = 'Held online · ' + clock(x.left); pill.title = holdTip(x);
        if (empty && row.classList.contains('can-book')) { row.setAttribute('aria-disabled', 'true'); row.setAttribute('aria-label', 'Book ' + fmt.time(row.dataset.time) + ', held online for ' + clock(x.left)); }
        ui.$$('.ts-slot.open', row).forEach(function (s) {
          if (!s.dataset.label) s.dataset.label = s.getAttribute('aria-label') || '';
          s.classList.add('is-held'); s.setAttribute('aria-disabled', 'true'); s.title = 'Held online for ' + clock(x.left);
          if (s.tagName === 'BUTTON') s.setAttribute('aria-label', s.dataset.label + ', held online for ' + clock(x.left));
        });
      });
    }

    /* Each part of the day: its tee times (blocked times left out) and how many are open (bookable, a place free, not passed). */
    function periodCounts() {
      const c = ctx(); const byTime = {}; activeOn(state.date).forEach(function (t) { byTime[t.time] = t; });
      const out = {}; PERIODS.forEach(function (p) { out[p.id] = { open: 0, total: 0 }; });
      slotList().forEach(function (t) {
        const m = toMin(t); const tt = byTime[t], per = periodOf(m).id;
        if (c.blockFor(t) && !tt) return;
        out[per].total++; out.all.total++;
        if (c.isPast || (c.isToday && m < c.now - 10)) return;
        if (tt && (['booked', 'checked-in'].indexOf(tt.status) < 0 || (tt.players || []).length >= 4)) return;
        out[per].open++; out.all.open++;
      });
      return out;
    }
    function renderPeriods() {
      const n = periodCounts(); const seg = ui.$('.ts-periods', view);
      const fv = document.activeElement && seg.contains(document.activeElement) ? document.activeElement.dataset.value : null;
      seg.innerHTML = PERIODS.filter(function (p) { return p.id !== 'all'; }).map(function (p) {
        const x = n[p.id], on = p.id === state.period, taken = x.total ? Math.round((x.total - x.open) / x.total * 100) : 100;
        return '<button type="button" data-value="' + p.id + '" class="ts-part' + (on ? ' active' : '') + (x.open ? '' : ' none') + '" aria-pressed="' + on + '" aria-label="' + esc(p.label + ', ' + (x.total ? x.open + ' of ' + x.total + ' tee times open' : 'blocked') + '. Scroll to the ' + p.label.toLowerCase()) + '">' +
          '<span class="ts-part-l">' + esc(p.label) + '</span><span class="ts-pc">' + (x.total ? x.open + ' open<span class="ts-pc-of"> of ' + x.total + '</span>' : 'Blocked') + '</span>' +
          '<span class="ts-part-bar" aria-hidden="true"><span style="width:' + taken + '%"></span></span></button>';
      }).join('');
      if (fv) { const b = ui.$('[data-value="' + fv + '"]', seg); if (b) b.focus({ preventScroll: true }); }
    }
    /* Parts of the day (Nov 12): the whole day stays in one scroll box (.ts-scroll). A part of the day scrolls the box
       to its first tee time, and the highlighted part follows the box as staff scroll. */
    const box = ui.$('.ts-scroll', view);
    function markPeriod(id) {
      if (!id || id === 'all') return;
      state.period = id;
      ui.$$('.ts-periods button', view).forEach(function (x) { const a = x.dataset.value === id; x.classList.toggle('active', a); x.setAttribute('aria-pressed', a); });
    }
    function headH() { const h = ui.$('.ts-head', box); return h && h.offsetParent ? h.offsetHeight : 0; }
    let spyLock = 0;
    function scrollBoxTo(el, smooth, center) {
      if (!el || el.hidden) return;
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - headH() - (center ? Math.max(0, (box.clientHeight - headH()) / 3) : 4);
      if (smooth) spyLock = Date.now() + 700;   /* keep the chosen part highlighted while the box glides there */
      box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }
    function firstAt(min) {
      return ui.$$('.ts-row:not([hidden]), .ts-band:not([hidden])', sheet).find(function (r) {
        return r.dataset.time ? toMin(r.dataset.time) >= min : +r.dataset.to > min;
      }) || null;
    }
    function setPeriod(id, quiet) {
      if (!id || id === 'all') return;
      if (!quiet) periodPick = id;
      markPeriod(id);
      if (!quiet) scrollBoxTo(firstAt(periodById(id).from), true);
    }
    let spyRaf = 0;
    box.addEventListener('scroll', function () {
      if (spyRaf) return;
      spyRaf = requestAnimationFrame(function () {
        spyRaf = 0; if (Date.now() < spyLock) return;
        const edge = box.getBoundingClientRect().top + headH() + 8;
        const r = ui.$$('.ts-row:not([hidden]), .ts-band:not([hidden])', sheet).find(function (x) { return x.getBoundingClientRect().bottom > edge; });
        if (r) markPeriod(periodOf(r.dataset.time ? toMin(r.dataset.time) : +r.dataset.from).id);
      });
    }, { passive: true });
    /* Every part of the day is listed now; only the search and the filters hide rows. */
    function inPeriod() { return true; }

    function applyFilter() {
      const q = state.q;
      let shown = 0;
      const per = periodById(state.period);
      ui.$$('.ts-row', sheet).forEach(function (r) {
        let ok = true;
        if (!q && !inPeriod(toMin(r.dataset.time))) ok = false;
        if (ok && q) ok = r.dataset.names.indexOf(q) >= 0;
        if (ok && state.filter === 'open') ok = +r.dataset.open > 0;
        if (ok && state.filter === 'booked') ok = r.classList.contains('has-group');
        if (ok && state.kind === 'members') ok = r.dataset.mem === '1';
        if (ok && state.kind === 'public') ok = r.dataset.pub === '1';
        r.hidden = !ok; if (ok) shown++;
      });
      const filtering = !!q || state.filter !== 'all' || state.kind !== 'all';
      ui.$$('.ts-band', sheet).forEach(function (b) { b.hidden = filtering || !!q; });
      ui.$$('.ts-now', sheet).forEach(function (b) { b.hidden = filtering || (!q && !inPeriod(+b.dataset.min)); });
      if (!q && !filtering && !shown && !ui.$('.ts-band:not([hidden])', sheet)) {
        const fe0 = ui.$('.ts-filter-empty', view);
        fe0.innerHTML = ui.empty({ icon: 'teesheet', title: 'No tee times in the ' + per.label.toLowerCase(), text: 'The sheet starts at ' + fmt.time(settings().first) + ' and the last tee time is ' + fmt.time(settings().last) + '.', action: ui.btn('Show all day', { sm: true, action: 'period-all' }) });
        fe0.hidden = false; return;
      }
      const fe = ui.$('.ts-filter-empty', view);
      if (filtering && !shown) {
        const kindTitle = state.kind === 'public' ? 'No public golfers' : state.kind === 'members' ? 'No member groups' : '';
        fe.innerHTML = ui.empty({ icon: 'search', title: q ? 'No players match' : (state.filter === 'open' ? 'No open tee times' : kindTitle || 'No groups booked') + (state.period !== 'all' ? ' in the ' + per.label.toLowerCase() : ''), text: q ? 'Nobody named "' + q + '" is on the sheet for this day. Try another name or day.' : state.period !== 'all' ? 'Try another part of the day or change the filter.' : (state.kind === 'public' && state.filter !== 'open' ? 'No public golfers are booked on this day. Public tee times booked online appear here as they come in.' : 'Change the filter to see the full sheet.'), action: ui.btn('Clear filter', { sm: true, action: 'clear-filter' }) });
        fe.hidden = false;
      } else fe.hidden = true;
    }

    function renderStats() {
      const host = ui.$('.ts-stats', view);
      const fk = document.activeElement && host.contains(document.activeElement) ? document.activeElement.dataset.drill : null;
      host.innerHTML = statsHTML(state.date);
      if (fk) { const back = ui.$('[data-drill="' + fk + '"]', host); if (back) back.focus(); }
      ui.$$('[data-reveal]', host).forEach(function (n) { n.classList.add('revealed'); });
      ui.$$('[data-count]', host).forEach(function (n) { n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + Number(n.dataset.count).toLocaleString('en-US'); });
    }

    /* The starter column (Option C): who goes off next with one button, the day in three numbers (each one a shortcut),
       the groups on the course with their hole and finish estimate, and the pace of play. Other days: the day at a glance. */
    let ocAll = false;   /* phones show three groups on the course until "Show all" */
    function renderStarter() {
      const host = ui.$('.ts-starter', view); if (!host) return;
      const c = ctx();
      const tts = activeOn(state.date).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      const hist = avgPace(Club.date.addDays(today, -14), Club.date.addDays(today, -1));
      const todayPace = avgPace(state.date, state.date);
      const pace = state.date <= today && todayPace ? todayPace : hist;
      const tgt = PACE_TARGET[18];
      const paceHTML = '<div class="ts-st-sec ts-st-pacesec"><h3 class="ts-st-h">Pace of play</h3>' +
        '<div class="ts-pace-top"><b class="ts-pace-v">' + (pace ? dur(pace) : 'No data yet') + '</b><span class="ts-pace-t">target ' + dur(tgt) + '</span></div>' +
        '<div class="ts-pace-bar" role="img" aria-label="' + esc(pace ? 'Average round ' + dur(pace) + ', target ' + dur(tgt) : 'No completed rounds yet') + '"><span style="width:' + (pace ? Math.min(100, pace / 300 * 100) : 0) + '%"></span><i style="left:' + (tgt / 300 * 100) + '%"></i></div>' +
        '<div class="ts-pace-meta">' + (pace ? (pace <= tgt ? 'Within target' : Math.round(pace - tgt) + ' min over target') + ', ' + (todayPace && state.date <= today ? 'today\'s finishers' : '14-day average') : 'Completed rounds will set the pace') + '</div></div>';
      const open = periodCounts().all.open;
      const players = tts.reduce(function (a, t) { return a + (t.players || []).length; }, 0);
      const tile = function (n, word, action, label, extra) {
        const fv = /data-value="(\w+)"/.exec(extra || '');
        const pressed = action === 'st-filter' ? ' aria-pressed="' + (!!fv && fv[1] === state.filter) + '"' : '';
        return '<button type="button" class="ts-st-tile" data-action="' + action + '"' + (extra || '') + pressed + ' aria-label="' + esc(label) + '"><b>' + n + '</b><span>' + esc(word) + '</span></button>';
      };
      const lead = function (t) { const p = (t.players || [])[0]; return p ? shortName(p).replace(/,.*$/, '') + ' group' : 'Group'; };
      const fm = focusMark(host);
      if (c.isToday) {
        const on = tts.filter(function (t) { return t.status === 'on-course'; });
        const onPlayers = on.reduce(function (a, t) { return a + (t.players || []).length; }, 0);
        const due = dueOff(state.date, c.now), nx = due[0];
        const st = nx ? STATUS[nx.status] : null;
        const nextHTML = nx ?
          '<div class="ts-st-big">Next off ' + esc(fmt.time(nx.time)) + '</div>' +
          '<p class="ts-st-meta">' + esc(lead(nx) + ' · ' + plural((nx.players || []).length, 'player') + ' · ' + nx.holes + ' holes' + (nx.status === 'checked-in' ? ' · checked in' : toMin(nx.time) < c.now ? ' · late' : '')) + '</p>' +
          '<button type="button" class="btn btn-primary ts-st-go" data-action="advance" data-id="' + esc(nx.id) + '" data-fk="go">' + esc(st.verb + ' ' + fmt.time(nx.time) + ' group') + '</button>' +
          (due.length > 1 ? '<ul class="ts-st-then" aria-label="Then">' + due.slice(1, 4).map(function (t) {
            return '<li><button type="button" class="ts-st-line" data-action="open" data-id="' + esc(t.id) + '" data-fk="' + esc(t.id) + '" aria-label="' + esc('Open the ' + fmt.time(t.time) + ' ' + lead(t) + ', ' + plural((t.players || []).length, 'player') + ', ' + STATUS[t.status].label.toLowerCase()) + '">' +
              '<span class="ts-st-t">' + esc(fmt.time(t.time)) + '</span><span class="ts-st-ocm"><span class="ts-st-n">' + esc(lead(t)) + '</span><small>' + esc(plural((t.players || []).length, 'player') + ' · ' + STATUS[t.status].label.toLowerCase()) + '</small></span></button></li>';
          }).join('') + '</ul>' : '')
          : '<p class="ts-st-quiet">No more groups are due off today.</p>';
        const onList = on.slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; }).slice(-6).reverse().map(function (t) {
          const start = toMin(t.startedAt || t.time); const el2 = Math.max(0, c.now - start);
          const len = PACE_TARGET[t.holes] || 255; const hole = Math.min(t.holes, Math.floor(el2 / (len / t.holes)) + 1);
          const over = el2 > len;
          const nm = shortName((t.players || [])[0] || {}) + ((t.players || []).length > 1 ? ' +' + ((t.players || []).length - 1) : '');
          return '<li><button type="button" class="ts-st-oc" data-action="open" data-id="' + esc(t.id) + '" data-fk="oc' + esc(t.id) + '" aria-label="' + esc('Open the ' + fmt.time(t.startedAt || t.time) + ' group, ' + nm + ', about hole ' + hole + ', finish about ' + fmt.time(toHM(start + len)) + (over ? ', over the target time' : '')) + '">' +
            '<span class="ts-st-t">' + esc(fmt.time(t.startedAt || t.time).replace(/ [AP]M$/, '')) + '</span>' +
            '<span class="ts-st-ocm"><span class="ts-st-ocn">' + esc(nm) + '</span><small>Hole ' + hole + ' · finish about ' + esc(fmt.time(toHM(start + len))) + '</small></span>' +
            '<span class="ts-st-pace' + (over ? ' is-over' : '') + '"><i aria-hidden="true"></i>' + (over ? 'Over time' : 'On pace') + '</span></button></li>';
        }).join('');
        host.innerHTML =
          '<div class="ts-st-sec ts-st-next"><h3 class="ts-st-h">Starter</h3>' + nextHTML + '</div>' +
          '<div class="ts-st-sec"><h3 class="ts-st-h">Today</h3><div class="ts-st-kv">' +
            tile(onPlayers, 'on course', 'st-oncourse', plural(onPlayers, 'player') + ' on course in ' + plural(on.length, 'group') + '. Show them on the sheet', ' data-fk="kv1"') +
            tile(players, 'booked', 'st-filter', plural(players, 'player') + ' booked. Show booked tee times only', ' data-value="booked" data-fk="kv2"') +
            tile(open, 'open', 'st-filter', plural(open, 'tee time') + ' still open. Show open tee times only', ' data-value="open" data-fk="kv3"') +
          '</div></div>' +
          '<div class="ts-st-sec ts-st-course"><h3 class="ts-st-h">On course</h3>' +
            (onList ? '<ul class="ts-st-ocl' + (ocAll ? ' is-all' : '') + '">' + onList + '</ul>' + (on.length > 3 ? '<button type="button" class="ts-link ts-st-more" data-action="st-more" data-fk="more" aria-expanded="' + ocAll + '">' + (ocAll ? 'Show fewer' : 'Show all ' + Math.min(6, on.length) + ' groups') + '</button>' : '') + (on.length > 6 ? '<p class="ts-st-quiet">Showing the six most recent starters. ' + (on.length - 6) + ' more groups further round.</p>' : '') : '<p class="ts-st-quiet">The course is clear. No groups are out right now.</p>') +
          '</div>' + paceHTML;
      } else {
        const first = tts[0], last = tts[tts.length - 1];
        const hours = {}; tts.forEach(function (t) { const h = t.time.slice(0, 2); hours[h] = (hours[h] || 0) + (t.players || []).length; });
        const busy = Object.keys(hours).sort(function (a, b) { return hours[b] - hours[a]; })[0];
        const wx = (Club.weather.forecast || []).find(function (w) { return w.date === state.date; });
        host.innerHTML =
          '<div class="ts-st-sec"><h3 class="ts-st-h">' + (c.isPast ? 'Day in review' : 'Looking ahead') + '</h3>' +
            '<dl class="ts-glance">' +
              '<dt>First off</dt><dd>' + (first ? fmt.time(first.time) : 'None') + '</dd>' +
              '<dt>Last off</dt><dd>' + (last ? fmt.time(last.time) : 'None') + '</dd>' +
              '<dt>Busiest hour</dt><dd>' + (busy ? fmt.time(busy + ':00') + ' <span class="muted">' + hours[busy] + ' players</span>' : 'None') + '</dd>' +
              (wx ? '<dt>Forecast</dt><dd>' + esc(wx.cond) + ', ' + wx.hi + '°</dd>' : '') +
            '</dl></div>' +
          '<div class="ts-st-sec"><h3 class="ts-st-h">Bookings</h3><div class="ts-st-kv">' +
            tile(tts.length, tts.length === 1 ? 'group' : 'groups', 'st-filter', plural(tts.length, 'group') + ' booked. Show booked tee times only', ' data-value="booked" data-fk="kv1"') +
            tile(players, 'booked', 'st-filter', plural(players, 'player') + ' booked. Show booked tee times only', ' data-value="booked" data-fk="kv2"') +
            tile(open, 'open', 'st-filter', plural(open, 'tee time') + ' open. Show open tee times only', ' data-value="open" data-fk="kv3"') +
          '</div></div>' + paceHTML;
      }
      focusBack(host, fm);
    }

    function renderBlocks() {
      const bl = blocksOn(state.date);
      setSide('blocks', bl.length ? bl.length + ' block' + (bl.length === 1 ? '' : 's') + ' · ' + bl.map(function (b) { return fmt.time(b.start); }).join(', ') : 'None today. Every tee time is open',
        (bl.length ? '<ul class="ts-blist">' + bl.map(function (b) {
          const kind = (BLOCK_KINDS.find(function (k) { return k.value === b.kind; }) || { label: 'Blocked' }).label;
          return '<li><div class="ts-bl-main"><div class="ts-bl-reason">' + esc(b.reason) + '</div><div class="muted ts-bl-time">' + esc(kind) + ' · ' + fmt.time(b.start) + ' until ' + esc(endLabel(b.end)) + '</div></div>' +
            ui.btn('', { icon: 'trash', kind: 'ghost', sm: true, action: 'unblock', id: b.id, title: 'Remove block' }) + '</li>';
        }).join('') + '</ul>' : '<p class="muted ts-quiet">No blocks on this day. Every tee time is open for booking.</p>') +
        '<div class="ts-acc-acts">' + ui.btn('Add block', { sm: true, icon: 'plus', action: 'block' }) + '</div>');
    }

    function renderFees() {
      const st = settings();
      const posted = S.where('charges', function (c) { return c.source === 'teesheet' && c.date === state.date; });
      const total = posted.reduce(function (a, c) { return a + (+c.amount || 0); }, 0);
      const ds = dayStats(state.date);
      const RT = (rules() && rules().RATES) || { weekday: st.guestFee, weekend: st.guestFee, twilight: st.guestFee };
      const ids = {}; S.where('teeTimes', function (x) { return x.date === state.date; }).forEach(function (x) { ids[x.id] = 1; });
      const shopRc = Club.receipts ? S.where('receipts', function (r) { return r.source === 'teesheet' && r.channel === 'counter' && ids[r.refId]; }) : [];
      const shopNet = r2(shopRc.reduce(function (a, r) { return a + (r.kind === 'credit' ? -1 : 1) * (+r.total || 0); }, 0));
      const shopN = shopRc.filter(function (r) { return r.kind !== 'credit'; }).length, shopBack = shopRc.length - shopN;
      /* Golfers marked paid online with no online payment record (the demo golfer) are said to be so, not shown as $0 paid. */
      const noRecord = !ds.online && ds.publicOnline;
      setSide('fees', money(total) + ' posted to accounts · ' + (noRecord ? 'online payment not on file' : money(ds.online) + ' paid online') + (shopRc.length ? ' · ' + money(shopNet) + ' at the shop' : ''),
        '<div class="ts-fee-total"><span class="label-caps">Posted to member accounts</span><span class="ts-fee-v">' + money(total) + '</span><span class="muted">' + posted.length + ' charge' + (posted.length === 1 ? '' : 's') + ' on this day</span></div>' +
        '<div class="ts-fee-online"><span class="label-caps">Paid online</span><span class="ts-fee-v">' + money(ds.online) + '</span><span class="muted">' + (ds.onlineCount ? ds.onlineCount + ' public green fee' + (ds.onlineCount === 1 ? '' : 's') : noRecord ? ds.publicOnline + ' golfer' + (ds.publicOnline === 1 ? '' : 's') + ' marked paid online, no payment on file' : 'No online payments for this day') + '</span></div>' +
        '<div class="ts-fee-online ts-fee-shop"><span class="label-caps">Paid at the golf shop</span><span class="ts-fee-v">' + money(shopNet) + '</span><span class="muted">' + (shopN ? shopN + ' payment' + (shopN === 1 ? '' : 's') + (shopBack ? ' · ' + shopBack + ' refund' + (shopBack === 1 ? '' : 's') : '') : 'No golf shop payments for this day') + '</span></div>' +
        '<dl class="kv ts-fee-kv"><dt>Green fee, weekday</dt><dd>' + money(RT.weekday) + '</dd><dt>Weekend and holiday</dt><dd>' + money(RT.weekend) + '</dd><dt>Twilight</dt><dd>' + money(RT.twilight) + ' <span class="muted">after 5:30 PM</span></dd><dt>Member-only times</dt><dd>' + money(st.guestFee) + ' <span class="muted">guests</span></dd><dt>Cart fee</dt><dd>' + money(st.cartFee) + ' <span class="muted">per rider</span></dd><dt>Nine holes</dt><dd>60% of the full fee</dd></dl>' +
        '<p class="muted ts-fee-note">Members\' guests pay the green fee for their tee time, posted to the host member at check-in. Public golfers pay online or at the golf shop, never on a member account.</p>' +
        '<div class="ts-acc-acts">' + ui.btn('Edit fees', { sm: true, icon: 'edit', action: 'fees' }) + '</div>');
    }

    /* Waitlist for the day: who, contact, what they want, place in line and the notification history. */
    function renderWaitlist() {
      const W = WL(); if (!W) return;
      const list = W.onDate(state.date);
      const act = list.filter(W.isActive), told = act.filter(function (e) { return e.status === 'notified'; }).length;
      const rows = act.concat(list.filter(function (e) { return !W.isActive(e); }).reverse());
      const badge = function (e) {
        if (e.status === 'waiting') { const n = W.position(e); return ui.badge(n === 1 ? 'Next in line' : 'Waiting · ' + n + (n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : n % 10 === 1 && n % 100 !== 11 ? 'st' : 'th') + ' in line', 'warn'); }
        if (e.status === 'notified') return ui.badge('Told · ' + fmt.time(e.offerTime), 'info');
        return ui.badge(e.status === 'booked' ? 'Booked' : e.status === 'expired' ? 'Expired' : 'Removed', e.status === 'booked' ? 'good' : 'plain');
      };
      setSide('waitlist', act.length ? act.length + ' waiting' + (told ? ' · ' + told + ' told about a spot' : '') : list.length ? 'No one waiting now' : 'No one waiting',
        (rows.length ? '<ul class="ts-wl">' + rows.map(function (e) {
          const c = W.contact(e);
          return '<li class="ts-wl-item' + (W.isActive(e) ? '' : ' is-done') + '"><div class="ts-wl-top"><span class="ts-wl-name">' + esc(c.name) + '</span>' + badge(e) + '</div>' +
            '<div class="muted ts-wl-sub">' + esc(c.label + ' · ' + e.players + (e.players === 1 ? ' player' : ' players') + ' · ' + W.whenText(e)) + '</div>' +
            (c.phone || c.email ? '<div class="ts-wl-contact">' + (c.phone ? '<a href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">' + Club.icon('phone') + esc(c.phone) + '</a>' : '') + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + Club.icon('mail') + esc(c.email) + '</a>' : '') + '</div>' : '') +
            '<ol class="ts-wl-hist" aria-label="History">' + (e.history || []).map(function (h) { return '<li><time datetime="' + esc(h.at) + '">' + esc(stampLabel(h.at)) + '</time><span>' + esc(h.text) + '</span></li>'; }).join('') + '</ol>' +
            (W.isActive(e) ? '<div class="ts-acc-acts">' + ui.btn('Remove', { sm: true, kind: 'ghost', icon: 'close', action: 'wl-remove', id: e.id }) + '</div>' : '') + '</li>';
        }).join('') + '</ul>' : '<p class="muted ts-quiet">No one is on the waitlist for this day. When a member or public golfer asks to hear about a full day or tee time, they are listed here in order.</p>'));
    }
    function removeWaitlist(id) {
      const W = WL(); const e = W && S.find(W.COLL, id); if (!e) return;
      const name = W.contact(e).name;
      ui.confirm({ title: 'Remove from the waitlist?', text: name + ' will no longer hear about a spot on ' + fmt.dateShort(e.date) + '. The next golfer in line moves up.', confirmLabel: 'Remove', danger: true }).then(function (ok) {
        if (!ok) return;
        let told = [];
        const rec = Club.undo.track(function () {
          const before = {}; W.onDate(e.date).forEach(function (x) { before[x.id] = x.status; });
          W.remove(id, 'staff');
          told = W.onDate(e.date).filter(function (x) { return x.id !== id && x.status === 'notified' && before[x.id] !== 'notified'; });
        });
        dropWaitlist(rec, id);
        renderSheet(); refreshAside();
        undoOffer(name + ' removed from the waitlist' + toldText(told), rec, { after: function () { recheckWaitlist(e.date); again(); }, undone: name + ' is back on the waitlist' + toldAgain(told) });
      });
    }

    function refreshAside() { renderStats(); renderStarter(); renderWaitlist(); renderBlocks(); renderFees(); renderPeriods(); ui.$('.ts-strip', view).innerHTML = stripHTML(state.date); }
    /* After an Undo: redraw this sheet if it is still showing, or the tee sheet day staff moved to. */
    function again() { if (document.body.contains(view)) { renderSheet(); refreshAside(); } else if (/^#\/teesheet/.test(location.hash)) Club.app.render(); }

    /* Date field (shared date picker): three weeks back to a month ahead, each day with how full it is */
    function pickerDays() {
      const out = []; const from = Club.date.addDays(today, -21), to = Club.date.addDays(today, 31);
      if (state.date < from) out.push(state.date);
      for (let d = from; d <= to; d = Club.date.addDays(d, 1)) out.push(d);
      if (state.date > to) out.push(state.date);
      return out.map(function (d) { const st = dayStats(d); return { date: d, meta: st.open ? st.util + '% booked' : 'Blocked', pill: d === today ? 'Today' : '' }; });
    }
    Portal.datePicker(ui.$('.ts-dp', view), { label: 'Sheet date', title: 'Go to a date', value: state.date, days: pickerDays(), onChange: function (d) { Club.app.go('teesheet/' + d); } });

    renderPeriods();
    renderSheet({ cascade: true });
    requestAnimationFrame(function () {
      const n = c0isToday ? ui.$('[data-now]', sheet) : null;
      if (n && !periodPick) { markPeriod(periodOf(+n.dataset.min).id); scrollBoxTo(n, false, true); }
      else { markPeriod(state.period); scrollBoxTo(firstAt(periodById(state.period).from), false); }
    });
    renderStarter(); renderWaitlist(); renderBlocks(); renderFees();
    ui.on(view, 'accordion', '.ts-acc', function (e, a) { accOpen[a.dataset.side] = e.detail.open; });

    /* ---- in-place status change (colour transitions on the row) ---- */
    /* keep: round times to put back (the Undo of a step back), so a reopened round keeps its real start and finish. */
    function advance(id, target, keep) {
      const tt = S.find('teeTimes', id); if (!tt) return;
      const next = target || (STATUS[tt.status] || {}).next; if (!next) return;
      const patch = { status: next };
      let posted = 0, shop = 0;
      /* What this step changes, so Undo can put it back (players, times and any fees it posted). */
      const before = feeChargeIds(tt.id);
      const step = { from: tt.status, to: next, s: tt.startedAt || null, f: tt.finishedAt || null, charges: [], paid: [], at: [] };
      if (next === 'checked-in' || ((next === 'on-course' || next === 'completed') && tt.players.some(function (p) { return !p.paid; }))) {
        const r = postFees(tt); patch.players = r.players; posted = r.total; shop = next === 'checked-in' ? r.shop : 0;
      }
      step.charges = feeChargeIds(tt.id).filter(function (cid) { return before.indexOf(cid) < 0; });
      /* Only the flags this step changed are kept (storage is tight): players it marked paid or sent to the golf shop. */
      (patch.players || []).forEach(function (p, i) { const o = (tt.players || [])[i] || {}; if (p.paid && !o.paid) step.paid.push(i); if (p.payAt && !o.payAt) step.at.push(i); });
      if (!step.charges.length) delete step.charges; if (!step.paid.length) delete step.paid; if (!step.at.length) delete step.at;
      const t = toHM(nowMin());
      if (next === 'on-course') patch.startedAt = state.date === today ? t : tt.time;
      if (next === 'completed') { patch.startedAt = tt.startedAt || tt.time; patch.finishedAt = state.date === today ? t : toHM(toMin(tt.time) + PACE_TARGET[tt.holes || 18]); }
      if (keep) { if (keep.s && (next === 'on-course' || next === 'completed')) patch.startedAt = keep.s; if (keep.f && next === 'completed') patch.finishedAt = keep.f; }
      patch.undo = (tt.undo || []).concat([step]).slice(-3);
      S.update('teeTimes', id, patch);
      /* Redraw in place: this row's status and button, and the Next up highlight moving on to the following group. */
      renderSheet();
      refreshAside();
      const lead = fresh0(tt);
      const undo = { action: { label: 'Undo', onClick: function () {
        /* Only undo the step this toast was for: if the group has moved on since, say so instead of undoing a later step. */
        const cur = S.find('teeTimes', id);
        if (cur && cur.status === next) stepBack(id, true); else ui.toast(lead + ' has moved on since. Use the tee sheet to step it back.', 'bad');
      } } };
      if (next === 'checked-in') ui.toast(lead + ' checked in' + (posted ? '. ' + money(posted) + ' posted to accounts' : '') + (shop ? '. ' + shop + (shop === 1 ? ' player' : ' players') + ' to pay at the golf shop' : ''), '', undo);
      else if (next === 'on-course') ui.toast(lead + ' sent off the first tee', '', undo);
      else if (next === 'completed') ui.toast(lead + ' round completed', '', undo);
      else if (next === 'no-show') ui.toast(lead + ' marked as a no-show', '', undo);
    }
    /* Account charges the tee sheet posted for this tee time that have not been reversed: fees, and credits such as a
       promo code (negative), so undoing a check-in takes back both. Reversals themselves are left out. */
    function feeChargeIds(ttId) {
      return S.where('charges', function (c) {
        return c.source === 'teesheet' && c.refId === ttId && c.amount !== 0 && !c.reversedBy && !c.reverses && !/^(Reversed|Charged again): /.test(c.description || '');
      }).map(function (c) { return c.id; });
    }
    /** The status a tee time steps back to, and the button wording for it. */
    function backStep(tt) {
      const last = (tt.undo || [])[(tt.undo || []).length - 1];
      const to = last && last.to === tt.status ? last.from : ({ 'checked-in': 'booked', 'on-course': 'checked-in', 'completed': 'on-course', 'no-show': 'booked' })[tt.status];
      if (!to) return null;
      const label = ({ 'checked-in': 'Undo check-in', 'on-course': 'Undo send-off', 'completed': 'Reopen round', 'no-show': 'Undo no-show' })[tt.status];
      return { to: to, label: label, step: last && last.to === tt.status ? last : null };
    }
    /** Step a tee time back one status. Fees the step posted are credited back (with a credit receipt) and the
        players' paid flags and round times return to what they were. Older records without a saved step fall back
        to the previous status, crediting the tee sheet's unreversed fees when undoing a check-in. */
    function stepBack(id, viaUndo) {
      const tt = S.find('teeTimes', id); if (!tt) return;
      const b = backStep(tt); if (!b) return;
      const from = tt.status, keep = { s: tt.startedAt || null, f: tt.finishedAt || null };   /* read before the update below changes tt */
      const patch = { status: b.to };
      const charges = b.step ? (b.step.charges || []) : (tt.status === 'checked-in' ? feeChargeIds(tt.id) : []);
      let credited = 0;
      charges.forEach(function (cid) {
        const c = S.find('charges', cid); if (!c || c.reversedBy) return;
        const cr = Club.undo && Club.undo.reverseCharge ? Club.undo.reverseCharge(c.id, { title: 'Tee sheet correction' })
          : Club.chargeMember(c.memberId, { description: 'Reversed: ' + c.description, category: c.category, amount: -c.amount, source: 'teesheet', refId: tt.id, date: Club.date.today(), title: 'Tee sheet correction' });
        if (cr) { if (!S.find('charges', c.id).reversedBy) S.update('charges', c.id, { reversedBy: cr.id }); credited += c.amount; }
      });
      if (b.step) {
        const paid = b.step.paid || [], at = b.step.at || [];
        if (paid.length || at.length) patch.players = (tt.players || []).map(function (p, i) { const q = Object.assign({}, p); if (paid.indexOf(i) >= 0) q.paid = false; if (at.indexOf(i) >= 0) delete q.payAt; return q; });
        patch.startedAt = b.step.s; patch.finishedAt = b.step.f; patch.undo = tt.undo.slice(0, -1);
      } else {
        /* Fees a check-in posts mark members and their account guests paid; public golfers and pay-at-shop guests settle separately. */
        if (tt.status === 'checked-in' && charges.length) patch.players = (tt.players || []).map(function (p) { const q = Object.assign({}, p); if (!isPublic(q) && !(q.type === 'guest' && q.pays === 'shop')) q.paid = false; return q; });
        if (tt.status === 'on-course') patch.startedAt = null;
        if (tt.status === 'completed') patch.finishedAt = null;
      }
      S.update('teeTimes', id, patch);
      renderSheet(); refreshAside();
      const lead = fresh0(tt);
      /* A step back made with the button gets its own Undo, which takes the step again (fees post again, round times
         return); the step back made by an advance's Undo is the undo, so it has none. */
      const again = viaUndo ? null : { action: { label: 'Undo', onClick: function () {
        const cur = S.find('teeTimes', id);
        if (cur && cur.status === b.to) advance(id, from, keep); else ui.toast(lead + ' has moved on since. Use the tee sheet to change it.', 'bad');
      } } };
      ui.toast(({ booked: lead + ' is back to booked', 'checked-in': lead + ' is back to checked in', 'on-course': lead + ' is back on the course' })[b.to] + (credited ? '. ' + money(credited) + ' credited back to accounts' : ''), '', again);
    }
    function fresh0(tt) { const p = (tt.players || [])[0]; return p ? shortName(p).replace(/,.*$/, '') + ' group' : 'Group'; }

    /* ---- events ---- */
    ui.on(view, 'click', '[data-action]', function (e, b) {
      const a = b.dataset.action;
      if (a === 'prev') Club.app.go('teesheet/' + Club.date.addDays(state.date, -1));
      else if (a === 'next') Club.app.go('teesheet/' + Club.date.addDays(state.date, 1));
      else if (a === 'today') Club.app.go('teesheet/' + today);
      else if (a === 'day') Club.app.go('teesheet/' + b.dataset.date);
      else if (a === 'book-new') openBooking({ date: state.date });
      else if (a === 'book') {
        if (b.getAttribute('aria-disabled') === 'true') return;   /* held online: not bookable until the hold ends */
        const tt = b.dataset.id ? S.find('teeTimes', b.dataset.id) : null;
        if (tt) openBooking({ tt: tt, focus: +b.dataset.slot }); else openBooking({ date: state.date, time: b.dataset.time });
      }
      else if (a === 'open') { const tt = S.find('teeTimes', b.dataset.id); if (tt) openBooking({ tt: tt, focus: +b.dataset.slot }); }
      else if (a === 'advance') advance(b.dataset.id);
      else if (a === 'block') openBlock();
      else if (a === 'unblock') removeBlock(b.dataset.id);
      else if (a === 'fees') openFees();
      else if (a === 'wl-remove') removeWaitlist(b.dataset.id);
      else if (a === 'clear-filter') { state.q = ''; state.filter = 'all'; state.kind = 'all'; ui.$('.ts-search input', view).value = ''; const ks = ui.$('select[name=tskind]', view); if (ks) ks.value = 'all'; setFilter('all'); }
      else if (a === 'jump-now') { const n = ui.$('[data-now]', sheet); if (n) { markPeriod(periodOf(+n.dataset.min).id); scrollBoxTo(n, true, true); } }
      else if (a === 'period-all') setPeriod('all');
      else if (a === 'st-more') { ocAll = !ocAll; renderStarter(); }
      else if (a === 'st-filter') setFilter(state.filter === b.dataset.value ? 'all' : b.dataset.value);
      else if (a === 'st-oncourse') {
        const r = ui.$('.ts-row[data-status="on-course"]:not([hidden])', sheet);
        if (r) { scrollBoxTo(r, true, true); r.classList.toggle('just-saved', false); void r.offsetWidth; r.classList.add('just-saved'); }
        else { const n = ui.$('[data-now]:not([hidden])', sheet); if (n) { markPeriod(periodOf(+n.dataset.min).id); scrollBoxTo(n, true, true); } }
      }
    });
    /** The All / Open / Booked filter, also set from the starter column's numbers. */
    function setFilter(v) {
      state.filter = v;
      const fs = ui.$('select[name=tsfilter]', view); if (fs && fs.value !== v) fs.value = v;
      applyFilter();
      ui.$$('.ts-st-tile[data-action=st-filter]', view).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.value === v)); });
    }
    /* Cards are clickable: a click on a booked row's free space opens the group; an empty tee time row books itself. */
    ui.on(view, 'click', '.ts-row.has-group', function (e, row) {
      if (e.target.closest('button, a, input, [data-action]')) return;
      if (window.getSelection && String(window.getSelection())) return;   /* selecting a name to copy */
      const tt = S.find('teeTimes', row.dataset.id); if (tt) openBooking({ tt: tt });
    });
    ui.on(view, 'keydown', '.ts-row[role=button]', function (e, row) {
      if (e.target !== row || !(e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) return;
      e.preventDefault(); row.click();
    });
    /* Stat boxes open their details drawer; rows there open the tee time. */
    ui.on(view, 'click', '.ts-stats .stat[data-drill]', function (e, st) { openStatDrill(st.dataset.drill, state.date, function (tt) { openBooking({ tt: tt }); }); });
    ui.on(view, 'keydown', '.ts-stats .stat[data-drill]', function (e, st) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); openStatDrill(st.dataset.drill, state.date, function (tt) { openBooking({ tt: tt }); }); }
    });
    ui.on(view, 'change', 'select[name=tsfilter]', function (e, sel) { setFilter(sel.value); });
    ui.on(view, 'change', 'select[name=tskind]', function (e, sel) { state.kind = sel.value; applyFilter(); });
    ui.$('.ts-search input', view).addEventListener('input', function (e) { state.q = e.target.value.trim().toLowerCase(); applyFilter(); });
    ui.on(view, 'click', '.ts-periods button', function (e, b) { setPeriod(b.dataset.value); });

    /* ---- booking modal ---- */
    function timeOptions(date, selected, selfId) {
      const blocks = blocksOn(date); const taken = {};
      activeOn(date).forEach(function (t) { if (t.id !== selfId) taken[t.time] = t; });
      const isToday = date === today, n = nowMin(), held = holdsOn(date);
      return slotList().map(function (t) {
        let note = '', dis = false;
        if (taken[t]) { note = ' · ' + taken[t].players.length + ' booked'; dis = true; }
        else if (held[t] && held[t].left > 0) { note = ' · held online'; dis = true; }
        else if (blockAt(blocks, date, t)) { note = ' · blocked'; dis = true; }
        else if (date < today || (isToday && toMin(t) < n - 10)) { note = ' · passed'; dis = true; }
        if (t === selected) { dis = false; note = ''; }
        return '<option value="' + t + '"' + (t === selected ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + fmt.time(t) + note + '</option>';
      }).join('');
    }
    function firstOpen(date) {
      const blocks = blocksOn(date); const taken = {}; activeOn(date).forEach(function (t) { taken[t.time] = 1; });
      const n = nowMin();
      const held = holdsOn(date);
      return slotList().find(function (t) { return !taken[t] && !(held[t] && held[t].left > 0) && !blockAt(blocks, date, t) && !(date === today && toMin(t) < n); }) || slotList()[0];
    }

    function openBooking(o) {
      const tt = o.tt || null; const isEdit = !!tt;
      const date = isEdit ? tt.date : (o.date || state.date);
      const time = isEdit ? tt.time : (o.time || firstOpen(date));
      const holes = isEdit ? tt.holes : (toMin(time) >= 900 ? 9 : 18);
      const pl = isEdit ? (tt.players || []).slice() : [];
      const acked = {}; (isEdit ? (tt.overrides || []) : []).forEach(function (x) { acked[overrideKey(x)] = x; });
      const KINDS = [{ value: 'member', label: 'Member' }, { value: 'guest', label: 'Guest' }, { value: 'public', label: 'Public' }];
      const shopBox = function (i, checked) { return '<label class="check ts-pub-shop"><input type="checkbox" name="pubpaid_' + i + '"' + (checked ? ' checked' : '') + '> Green fee paid at the golf shop</label>'; };
      const prow = function (i) {
        const p = pl[i]; const type = p ? p.type : 'member'; const pub = type === 'public' ? p : null;
        return '<div class="ts-prow" data-i="' + i + '">' +
          (p && p.paid ? '<span class="ts-prow-n paid" title="Fees settled">' + Club.icon('check') + '</span>' : '<span class="ts-prow-n serif">' + (i + 1) + '</span>') +
          '<div class="segmented ts-ptype" data-name="type_' + i + '" role="group" aria-label="Player ' + (i + 1) + ' kind">' + KINDS.map(function (k) { return '<button type="button" data-value="' + k.value + '" class="' + (type === k.value ? 'active' : '') + '">' + k.label + '</button>'; }).join('') + '</div>' +
          '<input type="hidden" name="type_' + i + '" value="' + esc(type) + '">' +
          '<div class="ts-pwho">' +
            '<select class="select" name="member_' + i + '" aria-label="Player ' + (i + 1) + ' member"' + (type !== 'member' ? ' hidden' : '') + '><option value="">' + (i === 0 ? 'Select the host member' : 'Select a member') + '</option>' + Club.members.options(p && p.type === 'member' ? p.memberId : null) + '</select>' +
            '<input class="input" name="guest_' + i + '" placeholder="Guest full name" maxlength="60" aria-label="Player ' + (i + 1) + ' guest name" value="' + esc(p && p.type === 'guest' ? p.name : '') + '"' + (type !== 'guest' ? ' hidden' : '') + '>' +
            (p && p.type === 'guest' && (p.phone || p.email) ? '<span class="ts-gcontact muted">' + esc([p.phone, p.email, typeof p.handicap === 'number' ? 'Handicap ' + Club.fmt.handicap(p.handicap) : ''].filter(Boolean).join(' · ')) + '</span>' : '') +
            (p && p.type === 'guest' && p.pays === 'shop' ? '<div class="ts-pubpay ts-gpay"><span class="muted">Guest pays at the golf shop.</span><label class="check ts-pub-shop"><input type="checkbox" name="gpaid_' + i + '"' + (p.paid ? ' checked' : '') + '> Green fee paid at the golf shop</label></div>' : '') +
            '<div class="ts-pubf"' + (pub ? '' : ' hidden') + '>' +
              '<input class="input ts-pub-name" name="pub_' + i + '" placeholder="Public golfer full name" maxlength="60" aria-label="Player ' + (i + 1) + ' public golfer name" value="' + esc(pub ? pub.name || '' : '') + '">' +
              '<div class="ts-pub-contact"><input class="input" type="tel" name="pubphone_' + i + '" placeholder="Phone (optional)" maxlength="24" aria-label="Public golfer phone" value="' + esc(pub ? pub.phone || '' : '') + '">' +
              '<input class="input" type="email" name="pubemail_' + i + '" placeholder="Email (optional)" maxlength="80" aria-label="Public golfer email" value="' + esc(pub ? pub.email || '' : '') + '"></div>' +
              '<div class="ts-pubpay">' + (pub && paidOnline(pub) ? '<span class="ts-pub-online">' + Club.icon('check') + 'Paid online' + (pub.publicPlayerId ? ' with a public account' : '') + '</span>' : shopBox(i, pub && pub.paid)) + '</div>' +
            '</div>' +
            '<div class="ts-pextra" data-extra="' + i + '" hidden></div>' +
          '</div>' +
          '<label class="check ts-pcart"><input type="checkbox" name="cart_' + i + '"' + (p && p.cart ? ' checked' : '') + '> Cart</label>' +
          ui.btn('', { icon: 'close', kind: 'ghost', sm: true, action: 'clear-player', title: 'Clear player ' + (i + 1) }) +
          '<div class="ts-pnote" hidden></div>' +
          '</div>';
      };
      const body =
        '<form class="ts-form" novalidate>' +
          '<div class="ts-alert" role="alert" hidden></div>' +
          '<div class="ts-heldnote" role="status" hidden></div>' +
          (isEdit ? promosFor(tt).map(function (x) {
            const who = x.publicPlayerId ? S.find('publicPlayers', x.publicPlayerId) : null;
            return '<p class="ts-promo">' + Club.icon('tag') + '<span>' + esc(memberPromo(x)
              ? 'Booked in the members’ portal with promo code ' + x.promo.code + ': ' + money(x.promo.discount) + ' off guest fees, cart and add-ons. Posts to the member’s account at check-in.'
              : 'Booked online with promo code ' + x.promo.code + ': ' + money(x.promo.discount) + ' off' + (who ? ' for ' + who.firstName + ' ' + who.lastName : '') + '. Paid ' + money(x.amount) + '.') + '</span></p>';
          }).join('') : '') +
          '<div class="form-grid ts-fg3">' +
            '<div class="field ts-mdp"></div><input type="hidden" name="date" value="' + date + '">' +
            ui.field({ label: 'Tee time', name: 'time', type: 'select', options: timeOptions(date, time, tt && tt.id), required: true }) +
            '<div class="field"><label>Holes</label>' + ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(holes), 'holes') + '<input type="hidden" name="holes" value="' + holes + '"></div>' +
          '</div>' +
          /* Almost every group starts on the 1st tee, so that is the default; staff change it only for a 10th tee start.
             The beverage cart uses it to predict where the group is (teeTimes.startTee). */
          '<div class="field ts-start"><label>Starts on</label>' + ui.segmented([{ value: '1', label: '1st tee' }, { value: '10', label: '10th tee' }], isEdit && +tt.startTee === 10 ? '10' : '1', 'startTee') +
            '<input type="hidden" name="startTee" value="' + (isEdit && +tt.startTee === 10 ? 10 : 1) + '"><span class="muted ts-hint">Only change this for a group going off the 10th tee.</span></div>' +
          '<div class="ts-plist"><div class="row between ts-plist-head"><span class="label-caps">Players</span><span class="muted ts-hint">The first member listed hosts any guests. Public golfers pay online or at the golf shop.</span></div>' + [0, 1, 2, 3].map(prow).join('') + '</div>' +
          ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: isEdit ? tt.notes : '', placeholder: 'Rental clubs, occasions, pairing preferences' }) +
          '<div class="ts-override" hidden></div>' +
          '<div class="ts-quote"></div>' +
        '</form>';
      const actions = [];
      if (isEdit && tt.status !== 'completed') actions.push({ label: 'Cancel tee time', kind: 'danger', icon: 'trash', onClick: function (api) { cancelTee(tt, api); return false; } });
      if (isEdit && (tt.status === 'booked' || tt.status === 'checked-in')) actions.push({ label: 'Mark no-show', kind: 'ghost', onClick: function () { advance(tt.id, 'no-show'); } });
      const back = isEdit ? backStep(tt) : null;
      if (back) actions.push({ label: back.label, kind: 'ghost', onClick: function () { stepBack(tt.id); } });
      actions.push({ label: isEdit ? 'Close' : 'Cancel', kind: 'ghost' });
      actions.push({ label: isEdit ? 'Save changes' : 'Book tee time', kind: 'primary', icon: 'check', onClick: function (api) { return save(api); } });

      const eyebrow = isEdit ? (STATUS[tt.status] || STATUS.booked).label + ' · ' + fmt.dateShort(tt.date) + (tt.source === 'public' ? ' · Booked online' : tt.source === 'portal' ? ' · Booked in the members\' portal' : '') : 'New booking';
      const m = ui.modal({ eyebrow: eyebrow, title: isEdit ? 'Tee time at ' + fmt.time(tt.time) : 'Book tee time', size: 'lg', body: body, actions: actions });
      m.el.classList.add('ts-modal');
      const form = ui.$('form', m.body);
      /* Club.pickers copies hidden onto its button only when it changes later: re-assert it once the pickers are in, so a
         member picker never shows on a guest or public row. */
      setTimeout(function () { ui.$$('.ts-pwho select', form).forEach(function (s) { const h = s.hidden; s.hidden = !h; s.hidden = h; }); }, 0);
      /* Date: the shared date picker, listing each bookable day with its open tee times */
      const bookDays = []; const lastDay = Club.date.addDays(today, 30);
      if (date < today) bookDays.push(date);
      for (let d = today; d <= lastDay; d = Club.date.addDays(d, 1)) bookDays.push(d);
      if (date > lastDay) bookDays.push(date);
      const mdp = Portal.datePicker(ui.$('.ts-mdp', form), {
        label: 'Date', title: 'Choose a date', value: date,
        days: bookDays.map(function (d) {
          const blocks = blocksOn(d); const taken = {}; activeOn(d).forEach(function (t) { if (!tt || t.id !== tt.id) taken[t.time] = 1; });
          const n = slotList().filter(function (t) { return !taken[t] && !blockAt(blocks, d, t) && !(d === today && toMin(t) < nowMin() - 10) && d >= today; }).length;
          return { date: d, meta: d < today ? 'Past' : n ? n + ' open' : 'Full', pill: d === state.date ? 'On the sheet' : '' };
        }),
        onChange: function (d) { form.date.value = d; form.date.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      liftSheets(ui.$('.ts-mdp', form));

      function readPlayers() {
        return [0, 1, 2, 3].map(function (i) {
          const type = form['type_' + i].value; const cart = form['cart_' + i].checked;
          if (type === 'guest') {
            const n = form['guest_' + i].value.replace(/\s+/g, ' ').trim(); if (!n) return null;
            const prevG = pl[i] && pl[i].type === 'guest' ? pl[i] : null; const box = form['gpaid_' + i];
            return { memberId: null, name: n, type: 'guest', cart: cart, i: i, pays: prevG && prevG.pays === 'shop' ? 'shop' : undefined, shopPaid: box ? box.checked : null };
          }
          if (type === 'public') {
            const n = form['pub_' + i].value.replace(/\s+/g, ' ').trim();
            const phone = form['pubphone_' + i].value.trim(), email = form['pubemail_' + i].value.trim();
            if (!n && !phone && !email) return null;
            const box = form['pubpaid_' + i];
            return { memberId: null, name: n, type: 'public', cart: cart, phone: phone, email: email, shopPaid: box ? box.checked : null, i: i };
          }
          const id = form['member_' + i].value; if (!id) return null;
          return { memberId: id, name: Club.members.name(id), type: 'member', cart: cart, i: i };
        });
      }
      /** Membership and public play rules for the current form: warnings only, staff can override. */
      function ruleWarnings(d, t, ps) {
        const r = rules(); if (!r || !validDate(d) || !t) return [];
        const out = []; const hasMember = ps.some(function (p) { return p.type === 'member'; });
        ps.forEach(function (p) {
          if (p.type === 'member') {
            const mem = Club.members.get(p.memberId); if (!mem) return;
            const play = r.memberCanPlay(mem, d, t);
            if (!play.ok) out.push({ i: p.i, memberId: mem.id, rule: 'playWindow', text: play.reason });
            if (d >= today) { const bo = r.bookingOpen('member', mem, d, today); if (!bo.ok) out.push({ i: p.i, memberId: mem.id, rule: 'bookingWindow', text: bo.reason }); }
          } else if (p.type === 'public' && p.name) {
            const sl = r.publicSlot(d, t);
            if (!sl.ok && !(sl.requiresMember && hasMember)) out.push({ i: p.i, memberId: null, name: p.name, rule: 'publicSlot', text: sl.reason });
            if (d >= today) { const bo = r.bookingOpen('public', null, d, today); if (!bo.ok) out.push({ i: p.i, memberId: null, name: p.name, rule: 'publicBooking', text: bo.reason }); }
          }
        });
        // Players already booked at this exact time before the rules were checked are shown, not re-flagged.
        const wasIn = function (w) {
          return isEdit && tt.date === d && tt.time === t && (tt.players || []).some(function (q) {
            return w.memberId ? q.memberId === w.memberId : isPublic(q) && String(q.name || '').toLowerCase() === String(w.name || '').toLowerCase();
          });
        };
        out.forEach(function (w) { w.acked = !!acked[overrideKey(w)]; w.legacy = !w.acked && wasIn(w); });
        return out;
      }
      function publicHint(d, t, hasMember) {
        const r = rules(); if (!r || !validDate(d) || !t) return '';
        const sl = r.publicSlot(d, t);
        if (sl.ok) return sl.label + ' public tee time. Green fee ' + money(greenFee(d, t, +form.holes.value)) + '.';
        if (sl.requiresMember && hasMember) return 'Weekend and holiday morning: public golfers play here with a member. Green fee ' + money(greenFee(d, t, +form.holes.value)) + '.';
        return '';
      }
      let current = [];
      function refresh() {
        const raw = readPlayers(); const ps = raw.filter(Boolean); const h = +form.holes.value; const d = form.date.value, t = form.time.value;
        const priced = ps.map(function (p) {
          const prev = rowPrev(p.i, p), x = Object.assign({}, p, prev ? { addons: prev.addons, discount: prev.discount } : {});
          if (p.type === 'public') x.paid = prev && paidOnline(prev) && p.shopPaid === null ? true : !!p.shopPaid;
          else if (p.type === 'guest' && p.pays === 'shop') x.paid = !!p.shopPaid;
          else x.paid = prev ? !!prev.paid : false;
          return x;
        });
        const q = quote(priced, h, validDate(d) ? d : date, t);
        const qEl = ui.$('.ts-quote', form);
        drawExtras();
        qEl.innerHTML = ps.length ? '<div class="ts-quote-main"><span class="label-caps">Due at check-in</span><span class="ts-quote-line">' + q.guests + ' guest' + (q.guests === 1 ? '' : 's') + ' at ' + money(q.gf) + ' · ' + q.carts + ' cart' + (q.carts === 1 ? '' : 's') + (q.adds ? ' · ' + money(q.adds) + ' add-ons' : '') + (h === 9 ? ' · nine-hole rate' : '') + '</span><span class="ts-quote-v serif">' + money(q.total) + '</span></div>' +
          (q.promo ? '<div class="ts-quote-pub ts-quote-promo">' + Club.icon('tag') + '<span>' + esc('Promo ' + q.promoCodes.join(', ') + ' −' + money(-q.promo)) + '</span></div>' : '') +
          (q.publics ? '<div class="ts-quote-pub">' + Club.icon('info') + '<span>' + (q.publicDue ? q.publicDue + ' public golfer' + (q.publicDue === 1 ? '' : 's') + ' to pay ' + money(q.shopTotal) + ' at the golf shop' : 'Public green fees are paid') + (q.publics - q.publicDue ? ' · ' + (q.publics - q.publicDue) + ' paid' : '') + '. Not charged to a member account.</span></div>' : '')
          : '<span class="muted">Add at least one player to see fees.</span>';
        // Per-player rule notes and the override acknowledgement.
        const warns = ruleWarnings(d, t, ps); current = warns;
        const hasMember = ps.some(function (p) { return p.type === 'member'; });
        ui.$$('.ts-prow', form).forEach(function (r) {
          const i = +r.dataset.i; const note = ui.$('.ts-pnote', r);
          const mine = warns.filter(function (w) { return w.i === i; });
          const p = raw[i];
          let html = mine.map(function (w) { return '<div class="ts-pwarn' + (w.acked || w.legacy ? ' acked' : '') + '">' + Club.icon('alert') + '<span>' + esc(w.text) + (w.acked ? ' Override recorded.' : w.legacy ? ' Already booked at this time.' : '') + '</span></div>'; }).join('');
          if (p && p.type === 'public' && !mine.some(function (w) { return w.rule === 'publicSlot'; })) { const hint = publicHint(d, t, hasMember); if (hint) html += '<div class="ts-phint">' + Club.icon('info') + '<span>' + esc(hint) + '</span></div>'; }
          note.innerHTML = html; note.hidden = !html;
          r.classList.toggle('has-warn', mine.some(function (w) { return !w.acked && !w.legacy; }));
        });
        const fresh = warns.filter(function (w) { return !w.acked && !w.legacy; });
        const ov = ui.$('.ts-override', form); const was = form.override ? form.override.checked : false;
        if (fresh.length) {
          ov.innerHTML = '<div class="ts-ov-text">' + Club.icon('alert') + '<div><strong>' + fresh.length + ' booking rule' + (fresh.length === 1 ? ' is' : 's are') + ' not met.</strong> <span>Staff can still book this tee time. The override is recorded on the booking.</span></div></div>' +
            '<label class="check ts-ov-check"><input type="checkbox" name="override"' + (was ? ' checked' : '') + '> Override and book anyway</label>';
          ov.hidden = false;
        } else { ov.innerHTML = ''; ov.hidden = true; }
        paintHeld();
      }
      /* A time held online (a golfer is booking it) takes no new players here until the hold ends: say so, count down,
         and offer another time. Edits that add no one (notes, payments) still save. */
      function addsPlayers() {
        if (!isEdit) return true;
        if (tt.date !== form.date.value || tt.time !== form.time.value) return true;
        return readPlayers().filter(Boolean).length > (tt.players || []).length;
      }
      function paintHeld() {
        const el = ui.$('.ts-heldnote', form); if (!el) return;
        const x = validDate(form.date.value) ? holdAt(form.date.value, form.time.value) : null;
        if (!x || !addsPlayers()) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
        if (el.hidden) { el.innerHTML = Club.icon('clock') + '<span class="ts-heldnote-t"></span><button type="button" class="btn btn-sm" data-held="other">Choose another time</button>'; el.hidden = false; }
        ui.$('.ts-heldnote-t', el).textContent = fmt.time(form.time.value) + ' is held online for ' + clock(x.left) + ' while ' + (x.src.portal && !x.src.public ? 'a member books in the portal' : 'a golfer books online') + '. Wait for the hold to end, or choose another time.';
      }
      const heldTimer = setInterval(function () { if (!document.body.contains(form)) { clearInterval(heldTimer); return; } paintHeld(); }, 1000);
      ui.on(form, 'click', '[data-held=other]', function (e) {
        e.preventDefault();
        const d = validDate(form.date.value) ? form.date.value : date, t = firstOpen(d);
        form.time.innerHTML = timeOptions(d, t, tt && tt.id); form.time.value = t;
        form.time.dispatchEvent(new Event('change', { bubbles: true }));
      });
      /* ---- Golf shop payments: ticking "paid at the golf shop" opens Take payment (card, cash, gift card, discount); the
         payment, its receipt and any gift card use are written when the booking is saved. Unticking a recorded payment
         refunds it on save (credit receipt, gift card part back on the card). ---- */
      const pend = {};   /* form row -> { type: 'pay', pay } | { type: 'refund' } */
      function rowPrev(i, r) { const prev = pl[i]; return prev && r && prev.type === r.type && (r.type !== 'member' || prev.memberId === r.memberId) ? prev : null; }
      function extraHTML(i, r) {
        const prev = rowPrev(i, r); if (!r || !prev) return pend[i] && pend[i].type === 'pay' ? payBit(pend[i].pay) : '';
        const bits = [];
        if (addsOf(prev).length) {
          const how = paidOnline(prev) ? 'paid online' : atShop(r) ? 'paid at the golf shop' : prev.paid ? 'posted at check-in' : r.type === 'guest' ? 'posts to the host at check-in' : 'posts to the account at check-in';
          if (realAdds(prev).length) bits.push('<span class="ts-px">' + Club.icon('box') + '<span>' + esc(addsText(prev) + ' · ' + money(addsTotal(prev)) + ', ' + how) + '</span></span>');
          promoLines(prev).forEach(function (x) { bits.push('<span class="ts-px">' + Club.icon('tag') + '<span>' + esc((x.name || 'Promo code') + ' −' + money(-linesSum([x])) + ', ' + (prev.paid ? 'credited at check-in' : 'credited to the account at check-in')) + '</span></span>'); });
        }
        const pd = pend[i];
        if (pd && pd.type === 'pay') bits.push(payBit(pd.pay));
        else if (pd && pd.type === 'refund' && prev.shopPay) bits.push('<span class="ts-px is-refund">' + Club.icon('refresh') + '<span>' + esc('Refund ' + money(prev.shopPay.total) + ' by ' + payWord(prev.shopPay.method) + ' when you save') + '</span></span>');
        else if (prev.paid && prev.shopPay) bits.push('<span class="ts-px is-paid">' + Club.icon('check') + '<span>' + esc(payLine(prev.shopPay)) + '</span>' +
          (prev.shopPay.receiptId && Club.receipts ? '<button type="button" class="ts-link" data-action="ts-receipt" data-id="' + esc(prev.shopPay.receiptId) + '">Receipt</button>' : '') + '</span>');
        if (!(pd && pd.type === 'pay') && prev.discount) bits.push('<span class="ts-px">' + Club.icon('tag') + '<span>' + esc('Discount ' + money(prev.discount.amount) + ': ' + prev.discount.reason + (prev.discount.by ? ' (' + prev.discount.by + ')' : '')) + '</span></span>');
        return bits.join('');
      }
      function payBit(pay) {
        return '<span class="ts-px is-pend">' + Club.icon('clock') + '<span>' + esc(payLine(pay) + (pay.discount ? ' after a ' + money(pay.discount.amount) + ' discount' : '') + '. Recorded when you save') + '</span></span>';
      }
      function drawExtras() {
        const raw = readPlayers();
        ui.$$('.ts-pextra', form).forEach(function (el) { const i = +el.dataset.extra; const h = extraHTML(i, raw[i]); el.innerHTML = h; el.hidden = !h; });
      }
      ui.on(form, 'click', '[data-action=ts-receipt]', function (e, b) { e.preventDefault(); Club.receipts.open(b.dataset.id); });
      form.addEventListener('change', function (e) {
        const mm = /^(pubpaid|gpaid)_(\d)$/.exec(e.target.name || ''); if (!mm) return;
        const i = +mm[2], box = e.target, r = readPlayers()[i], prev = rowPrev(i, r);
        if (box.checked) {
          if (pend[i] && pend[i].type === 'refund') { delete pend[i]; refresh(); return; }
          if (prev && prev.paid) { refresh(); return; }
          if (!r || !r.name) { box.checked = false; ui.toast('Enter the golfer\u2019s name first', 'bad'); refresh(); return; }
          const d = validDate(form.date.value) ? form.date.value : date;
          takePayment({ name: r.name, kind: r.type === 'public' ? 'Public golfer' : 'Guest paying at the golf shop',
            lines: shopLines(d, form.time.value, +form.holes.value || 18, { name: r.name, cart: r.cart, addons: prev ? prev.addons : null }), discount: prev && prev.discount,
            onDone: function (pay) { pend[i] = { type: 'pay', pay: pay }; refresh(); },
            onCancel: function () { box.checked = false; refresh(); } });
        } else {
          if (pend[i] && pend[i].type === 'pay') { delete pend[i]; refresh(); return; }
          if (prev && prev.paid && prev.shopPay) {
            const sp = prev.shopPay;
            ui.confirm({ title: 'Refund this payment?', text: r.name + ' paid ' + money(sp.total) + (sp.gift && sp.gift.amount > 0 ? ', ' + money(sp.gift.amount) + ' of it with gift card ending ' + sp.gift.last4 + ' (it goes back on the card)' : '') + '. Give back ' + (sp.rest > 0 ? money(sp.rest) + ' by ' + payWord(sp.method) : 'nothing in cash or card') + '. A credit receipt is made when you save.', confirmLabel: 'Refund on save', danger: true })
              .then(function (yes) { if (yes) pend[i] = { type: 'refund' }; else box.checked = true; refresh(); });
          }
        }
      });

      refresh();
      if (o.focus != null && !isNaN(o.focus)) setTimeout(function () { const r = ui.$('.ts-prow[data-i="' + o.focus + '"]', form); if (r) { const f = ui.$('select:not([hidden]), .ts-pwho > input.input:not([hidden]), .ts-pubf:not([hidden]) .ts-pub-name', r); if (f) f.focus(); } }, 90);

      ui.on(form, 'click', '.segmented button', function (e, b) {
        const seg = b.closest('.segmented'); const name = seg.dataset.name;
        ui.$$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); });
        form[name].value = b.dataset.value;
        if (name.indexOf('type_') === 0) {
          const r = seg.closest('.ts-prow'); const i = r.dataset.i; const v = b.dataset.value;
          form['member_' + i].hidden = v !== 'member'; form['guest_' + i].hidden = v !== 'guest'; ui.$('.ts-pubf', r).hidden = v !== 'public';
          ui.$$('.invalid', r).forEach(function (x) { x.classList.remove('invalid'); });
          (v === 'guest' ? form['guest_' + i] : v === 'public' ? form['pub_' + i] : form['member_' + i]).focus();
        }
        refresh();
      });
      ui.on(form, 'click', '[data-action=clear-player]', function (e, b) {
        const r = b.closest('.ts-prow'); const i = r.dataset.i;
        ['member_', 'guest_', 'pub_', 'pubphone_', 'pubemail_'].forEach(function (k) { form[k + i].value = ''; });
        form['cart_' + i].checked = false;
        ui.$('.ts-pubpay', r).innerHTML = shopBox(i, false); pl[i] = null; delete pend[i];
        ui.$$('.invalid', r).forEach(function (x) { x.classList.remove('invalid'); });
        refresh();
      });
      form.addEventListener('change', function (e) {
        if (e.target.name === 'date' && validDate(e.target.value)) form.time.innerHTML = timeOptions(e.target.value, e.target.value === date ? time : firstOpen(e.target.value), tt && tt.id);
        if (/^member_/.test(e.target.name) && e.target.value) {
          const mem = Club.members.get(e.target.value); const i = e.target.name.split('_')[1];
          if (mem && mem.preferences && !isEdit) form['cart_' + i].checked = mem.preferences.cart === 'Cart';
        }
        if (e.target.name === 'override') return;
        refresh();
      });
      form.addEventListener('input', function (e) { if (e.target.name !== 'notes') refresh(); });

      function fail(msgs, fields) {
        const al = ui.$('.ts-alert', form);
        al.innerHTML = Club.icon('alert') + '<div>' + msgs.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>';
        al.hidden = false;
        (fields || []).forEach(function (f) { if (f) f.classList.add('invalid'); });
        al.scrollIntoView({ block: 'nearest' });
        return false;
      }
      function save(api) {
        ui.$$('.invalid', form).forEach(function (x) { x.classList.remove('invalid'); });
        ui.$('.ts-alert', form).hidden = true;
        if (!ui.validate(form)) return false;
        refresh();
        const d = form.date.value, t = form.time.value, h = +form.holes.value || 18;
        const raw = readPlayers(); const ps = raw.filter(Boolean);
        const errs = [], bad = [];
        if (!validDate(d)) { errs.push('Choose a valid date.'); bad.push(ui.$('.dp-field', form)); }
        if (!ps.length) { errs.push('Add at least one player to the group.'); bad.push(form.member_0); }
        if (validDate(d) && (!isEdit || tt.date !== d || tt.time !== t) && (d < today || (d === today && toMin(t) < nowMin() - 10))) { errs.push('That tee time has already passed. Choose a later time.'); bad.push(form.time); }
        const members = ps.filter(function (p) { return p.type === 'member'; });
        const guests = ps.filter(function (p) { return p.type === 'guest'; });
        if (guests.length && !members.length) { errs.push('Guests must play with a host member. Add a member to the group, or book them as public golfers.'); bad.push(form['guest_' + guests[0].i]); }
        ps.filter(isPublic).forEach(function (p) {
          if (p.name.length < 2) { errs.push('Enter the public golfer\'s full name for player ' + (p.i + 1) + '.'); bad.push(form['pub_' + p.i]); }
          if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) { errs.push('The email for ' + (p.name || 'player ' + (p.i + 1)) + ' does not look right.'); bad.push(form['pubemail_' + p.i]); }
          if (p.phone && p.phone.replace(/\D/g, '').length < 7) { errs.push('The phone number for ' + (p.name || 'player ' + (p.i + 1)) + ' needs at least 7 digits.'); bad.push(form['pubphone_' + p.i]); }
        });
        const seen = {};
        members.forEach(function (p) {
          if (seen[p.memberId]) { errs.push(Club.members.name(p.memberId) + ' is listed twice.'); bad.push(form['member_' + p.i]); }
          seen[p.memberId] = 1;
          const mem = Club.members.get(p.memberId);
          if (mem && mem.status === 'suspended') { errs.push(Club.members.name(mem) + ' is suspended and cannot book golf.'); bad.push(form['member_' + p.i]); }
          const clash = S.where('teeTimes', function (x) {
            return x.date === d && x.status !== 'cancelled' && x.status !== 'no-show' && (!tt || x.id !== tt.id) && overlaps(x.time, x.holes, t, h) &&
              (x.players || []).some(function (q) { return q.memberId === p.memberId; });
          })[0];
          if (clash) { errs.push(Club.members.name(p.memberId) + ' is already playing at ' + fmt.time(clash.time) + ' that day.'); bad.push(form['member_' + p.i]); }
        });
        const other = activeOn(d).find(function (x) { return x.time === t && (!tt || x.id !== tt.id); });
        if (other) { errs.push(fmt.time(t) + ' already has a group. Choose another tee time.'); bad.push(form.time); }
        const blk = blockAt(blocksOn(d), d, t);
        if (blk && !(tt && tt.date === d && tt.time === t)) { errs.push(fmt.time(t) + ' is blocked for ' + String(blk.reason || 'club use').toLowerCase() + '.'); bad.push(form.time); }
        const hx = validDate(d) ? holdAt(d, t) : null;
        if (hx && addsPlayers()) { errs.push(fmt.time(t) + ' is held online for ' + clock(hx.left) + '. Wait for the hold to end, or choose another time.'); bad.push(form.time); }
        if (errs.length) return fail(errs, bad);
        // Membership rules warn, they never block: staff acknowledge with the override box.
        const warns = current; const fresh = warns.filter(function (w) { return !w.acked && !w.legacy; });
        if (fresh.length && !(form.override && form.override.checked)) {
          const ov = ui.$('.ts-override', form); ov.classList.remove('shake'); void ov.offsetWidth; ov.classList.add('shake');
          return fail(['Tick "Override and book anyway" to book outside the membership or public play rules.'], [form.override && form.override.closest('.check')]);
        }
        const overrides = warns.filter(function (w) { return !w.legacy; }).map(function (w) {
          const prev = acked[overrideKey(w)];
          const o = { memberId: w.memberId, rule: w.rule, by: 'staff', on: prev && prev.on ? prev.on : today };
          if (!w.memberId) o.name = w.name;
          return o;
        });

        const prevPublic = (isEdit ? (tt.players || []) : []).filter(isPublic);
        const players = ps.map(function (p) {
          if (p.type === 'public') {
            const prev = prevPublic.find(function (q) { return String(q.name || '').toLowerCase() === p.name.toLowerCase(); }) || (pl[p.i] && isPublic(pl[p.i]) ? pl[p.i] : null);
            const online = prev && paidOnline(prev);
            const doc = Object.assign({}, prev || {}, { memberId: null, name: p.name, type: 'public', publicPlayerId: prev ? prev.publicPlayerId || null : null, cart: p.cart });
            if (p.phone) doc.phone = p.phone; else delete doc.phone;
            if (p.email) doc.email = p.email; else delete doc.email;
            if (online) { doc.paid = true; }
            else { doc.paid = !!p.shopPaid; doc.payAt = 'shop'; if (doc.paid) doc.paidAt = 'shop'; else delete doc.paidAt; }
            return doc;
          }
          const prev = isEdit ? (tt.players || []).find(function (q) { return q.type === p.type && (p.type === 'member' ? q.memberId === p.memberId : q.name === p.name); }) : null;
          const out = { memberId: p.memberId, name: p.name, type: p.type, cart: p.cart, paid: prev ? !!prev.paid : false };
          if (prev && prev.hostId && p.type === 'guest') out.hostId = prev.hostId;      // keep who brought the guest
          if (prev && p.type === 'guest') ['phone', 'email', 'handicap'].forEach(function (k) { if (prev[k] != null) out[k] = prev[k]; });   // and their contact details
          if (prev) ['addons', 'discount', 'paidWith', 'paidAt', 'shopPay', 'shopRefunds'].forEach(function (k) { if (prev[k] != null) out[k] = prev[k]; });   // add-ons and golf shop payments
          if (p.type === 'guest' && p.pays === 'shop') { out.pays = 'shop'; out.payAt = 'shop'; out.paid = p.shopPaid != null ? !!p.shopPaid : out.paid; if (out.paid) out.paidAt = 'shop'; }
          if (prev && prev.addedBy && p.type === 'member') out.addedBy = prev.addedBy;
          return out;
        });
        /* Golf shop payments taken in this form, and refunds of recorded ones. Checked first, then written with their receipts. */
        const ttId = isEdit ? tt.id : S.uid('tee');
        const work = [], payErrs = [];
        ps.forEach(function (p, k) {
          const doc = players[k], pd = pend[p.i]; if (!atShop(doc)) return;
          const before = rowPrev(p.i, p);
          if (doc.paid && pd && pd.type === 'pay') {
            const now = linesTotal(shopLines(d, t, h, doc));
            if (Math.abs(now - pd.pay.subtotal) > 0.004) { payErrs.push('The fees for ' + doc.name + ' changed to ' + money(now) + ' after the payment was taken. Untick paid and take the payment again.'); return; }
            const g = pd.pay.gift, card = g && Club.giftcards ? Club.giftcards.get(g.id) : null;
            if (g && (!card || card.status === 'void' || r2(card.balance) + 0.001 < g.amount)) { payErrs.push('Gift card ending ' + g.last4 + ' no longer has ' + money(g.amount) + ' on it. Untick paid for ' + doc.name + ' and take the payment again.'); return; }
            work.push({ k: k, kind: 'pay', pay: pd.pay });
          } else if (!doc.paid && pd && pd.type === 'refund' && before && before.shopPay) work.push({ k: k, kind: 'refund', sp: before.shopPay });
          else if (doc.paid && !(before && before.paid)) payErrs.push('Take the payment for ' + doc.name + ': untick "paid at the golf shop" and tick it again.');
          else if (!doc.paid) { delete doc.paidWith; delete doc.shopPay; delete doc.paidAt; }
        });
        if (payErrs.length) return fail(payErrs);
        const at = new Date().toISOString(), ref = { id: ttId, date: d, time: t, holes: h };
        let taken = 0, back = 0;
        let doc, newSlots, msg, told = [], was = isEdit ? { date: tt.date, time: tt.time } : null;
        /* One Undo record for the whole save: the booking, golf shop payments and refunds (receipts, gift cards, discounts). */
        const rec = Club.undo.track(function () {
        work.forEach(function (w) {
          const doc = players[w.k];
          if (w.kind === 'pay') {
            const sp = Object.assign({ id: S.uid('tsp'), at: at, by: staffName() }, w.pay, { receiptId: null });
            if (sp.gift && Club.giftcards) Club.giftcards.redeem(sp.gift.id, sp.gift.amount, { where: 'proshop', refId: ttId, note: 'Tee time ' + fmt.dateShort(d) + ' at ' + fmt.time(t) + ', ' + doc.name, by: staffName() });
            const rc = shopReceipt(ref, doc, sp, 'sale'); sp.receiptId = rc ? rc.id : null;
            doc.paid = true; doc.payAt = 'shop'; doc.paidAt = 'shop'; doc.paidWith = sp.rest > 0 ? (sp.method === 'cash' ? 'cash' : 'card') : sp.gift ? 'gift' : 'card';
            doc.shopPay = sp; if (sp.discount) doc.discount = sp.discount; else delete doc.discount;
            taken += sp.total;
          } else {
            const sp = w.sp;
            if (sp.gift && sp.gift.amount > 0 && Club.giftcards) Club.giftcards.refund(sp.gift.id, sp.gift.amount, { where: 'proshop', refId: ttId, note: 'Tee time payment refunded, ' + doc.name, by: staffName() });
            const rc = shopReceipt(ref, doc, sp, 'credit');
            doc.shopRefunds = (doc.shopRefunds || []).concat([{ id: sp.id, at: at, by: staffName(), total: sp.total, receiptId: rc ? rc.id : null }]);
            doc.paid = false; delete doc.paidWith; delete doc.shopPay; delete doc.paidAt;
            back += sp.total;
          }
        });
        const payNote = (taken ? '. ' + money(taken) + ' taken at the golf shop' : '') + (back ? '. ' + money(back) + ' refunded' : '');
        const data = { date: d, time: t, holes: h, players: players, notes: form.notes.value.trim(), overrides: overrides, startTee: +form.startTee.value === 10 ? 10 : 1 };
        if (isEdit) {
          const before = (tt.players || []).length; const moved = tt.date !== d || tt.time !== t;
          doc = S.update('teeTimes', tt.id, data);   /* S.update changes tt in place: was keeps the old slot */
          newSlots = moved ? players.map(function (_, i) { return i; }) : players.map(function (_, i) { return i; }).filter(function (i) { return i >= before; });
          // A group that moved, or lost a player, frees places for the waitlist.
          told = !WL() ? [] : moved ? WL().released(was.date, was.time, 'the golf shop moved a group') : players.length < before ? WL().released(d, t, 'the golf shop removed a player') : [];
          msg = (moved ? 'Group moved to ' + fmt.time(t) + (d !== was.date ? ' on ' + fmt.dateShort(d) : '') : 'Tee time updated') + (fresh.length ? ' with an override' : '') + payNote + toldText(told);
        } else {
          doc = S.insert('teeTimes', Object.assign(data, { id: ttId, status: 'booked', eventId: null, startedAt: null, finishedAt: null, source: 'staff' }));
          newSlots = players.map(function (_, i) { return i; });
          msg = 'Tee time booked for ' + fmt.time(t) + (d !== state.date ? ' on ' + fmt.dateShort(d) : '') + (fresh.length ? ' with an override' : '') + payNote;
        }
        });
        dropWaitlist(rec);
        const movedFrom = isEdit && (was.date !== d || was.time !== t) ? was : null;
        undoOffer(msg, rec, {
          check: movedFrom ? function () { return slotTaken(movedFrom.date, movedFrom.time, ttId); } : null,
          after: function () { reinstateSales(rec); recheckWaitlist(d); if (movedFrom) recheckWaitlist(movedFrom.date); again(); },
          undone: (isEdit ? (movedFrom ? 'Group moved back to ' + fmt.time(movedFrom.time) + (movedFrom.date !== d ? ' on ' + fmt.dateShort(movedFrom.date) : '') : 'Tee time changes undone') : 'Booking removed') +
            (taken ? '. ' + money(taken) + ' golf shop payment reversed with a credit receipt' : '') + (back ? '. ' + money(back) + ' refund reversed' : '') + toldAgain(told)
        });
        if (d !== state.date) { api.close(); Club.app.go('teesheet/' + d); return; }
        renderSheet({ flash: { id: doc.id, slots: newSlots, scroll: isEdit && tt.time !== t } });
        refreshAside();
      }
    }

    function cancelTee(tt, api) {
      ui.confirm({ title: 'Cancel this tee time?', text: 'The ' + fmt.time(tt.time) + ' group on ' + fmt.dateShort(tt.date) + ' will be removed from the sheet. Fees already posted stay on member accounts.', confirmLabel: 'Cancel tee time', danger: true }).then(function (ok) {
        if (!ok) return;
        let told = [];
        const rec = Club.undo.track(function () {
          S.update('teeTimes', tt.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
          told = WL() ? WL().released(tt.date, tt.time, 'the golf shop cancelled a tee time') : [];
        });
        dropWaitlist(rec);
        api.close();
        const row = ui.$('.ts-row[data-id="' + tt.id + '"]', sheet);
        /* Undo puts the group back only while the slot is still free; golfers the waitlist told keep their notice history. */
        const done = function () {
          renderSheet(); refreshAside();
          undoOffer('Tee time cancelled' + toldText(told), rec, { check: function () { return slotTaken(tt.date, tt.time, tt.id); },
            after: function () { recheckWaitlist(tt.date); again(); }, undone: 'Tee time at ' + fmt.time(tt.time) + ' is back on the sheet' + toldAgain(told) });
        };
        if (row) { row.classList.add('leaving'); setTimeout(done, 260); } else done();
      });
    }

    /* ---- blocks ---- */
    function openBlock() {
      const slots = slotList();
      const endOpts = function (from) { return slots.filter(function (t) { return t > from; }).map(function (t) { return { value: t, label: fmt.time(t) }; }).concat([{ value: closeHM(), label: 'Close of play' }]); };
      const start0 = slots[0];
      const body = '<form class="ts-form" novalidate><div class="ts-alert" role="alert" hidden></div><div class="form-grid">' +
        ui.field({ label: 'Date', name: 'date', type: 'date', value: state.date, required: true }) +
        ui.field({ label: 'Type', name: 'kind', type: 'select', options: ui.options(BLOCK_KINDS, 'maintenance') }) +
        ui.field({ label: 'From', name: 'start', type: 'select', options: ui.options(slots.map(function (t) { return { value: t, label: fmt.time(t) }; }), start0) }) +
        ui.field({ label: 'Until', name: 'end', type: 'select', options: ui.options(endOpts(start0), endOpts(start0)[9] ? endOpts(start0)[9].value : closeHM()) }) +
        ui.field({ label: 'Reason', name: 'reason', required: true, placeholder: 'e.g. Members\' league, Junior golf, corporate tournament shotgun', span2: true }) +
        ui.field({ label: 'Repeat', name: 'repeat', type: 'select', options: ui.options([{ value: '0', label: 'Does not repeat' }, { value: '4', label: 'Weekly for 4 weeks' }, { value: '8', label: 'Weekly for 8 weeks' }], '0') }) +
        '</div><p class="muted ts-hint ts-block-impact"></p></form>';
      const m = ui.modal({ eyebrow: 'Tee sheet', title: 'Block tee times', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Block times', kind: 'primary', icon: 'check', onClick: function () { return saveBlock(); } }] });
      m.el.classList.add('ts-modal');
      const form = ui.$('form', m.body);
      function impact() {
        const d = form.date.value, s = form.start.value, e = form.end.value;
        const hit = activeOn(d).filter(function (t) { return t.time >= s && t.time < e; });
        ui.$('.ts-block-impact', form).textContent = hit.length ? hit.length + ' booked group' + (hit.length === 1 ? '' : 's') + ' in this window will stay on the sheet. Move or cancel them separately.' : 'No groups are booked in this window.';
      }
      form.addEventListener('change', function (e) {
        if (e.target.name === 'start') { const cur = form.end.value; const opts = endOpts(form.start.value); form.end.innerHTML = ui.options(opts, cur > form.start.value ? cur : opts[0].value); }
        impact();
      });
      impact();
      function saveBlock() {
        const al = ui.$('.ts-alert', form); al.hidden = true;
        if (!ui.validate(form)) return false;
        const f = ui.formData(form);
        if (!validDate(f.date)) { al.innerHTML = Club.icon('alert') + '<div>Choose a valid date.</div>'; al.hidden = false; return false; }
        if (f.end <= f.start) { form.end.classList.add('invalid'); al.innerHTML = Club.icon('alert') + '<div>The block must end after it starts.</div>'; al.hidden = false; return false; }
        const n = +f.repeat || 1;
        const rec = Club.undo.track(function () { for (let w = 0; w < n; w++) S.insert('teeBlocks', { date: Club.date.addDays(f.date, w * 7), start: f.start, end: f.end, kind: f.kind, reason: f.reason }); });
        undoOffer(n > 1 ? 'Times blocked for ' + n + ' weeks' : 'Times blocked from ' + fmt.time(f.start), rec, { after: again, undone: n > 1 ? 'The ' + n + ' weekly blocks are removed' : 'Block removed. Times are open for booking' });
        if (f.date !== state.date) { Club.app.go('teesheet/' + f.date); return; }
        renderSheet(); refreshAside();
      }
    }
    function removeBlock(id) {
      const b = S.find('teeBlocks', id); if (!b) return;
      ui.confirm({ title: 'Release these tee times?', text: b.reason + ', ' + fmt.time(b.start) + ' until ' + endLabel(b.end) + '. The times return to the sheet for booking.', confirmLabel: 'Release times', danger: true }).then(function (ok) {
        if (!ok) return;
        let told = [];
        const rec = Club.undo.track(function () {
          S.remove('teeBlocks', id);
          told = WL() ? WL().released(b.date, null, 'the golf shop released blocked times') : [];
        });
        dropWaitlist(rec);
        renderSheet(); refreshAside();
        undoOffer('Block removed. Times are open for booking' + toldText(told), rec, { after: function () { recheckWaitlist(b.date); again(); }, undone: b.reason + ' block is back' + toldAgain(told) });
      });
    }

    function openFees() {
      const st = settings();
      const body = '<form class="ts-form" novalidate><div class="form-grid">' +
        ui.field({ label: 'Cart fee (per rider, 18 holes)', name: 'cartFee', type: 'number', value: st.cartFee, min: 0, step: 1, required: true }) +
        ui.field({ label: 'Guest fee at member-only times', name: 'guestFee', type: 'number', value: st.guestFee, min: 0, step: 1, required: true, hint: 'Weekday times outside public hours, such as Friday daytime' }) +
        '</div><p class="muted ts-hint">Guests and public golfers pay the published green fee for their tee time (weekday, weekend and holiday, or twilight), tax included. Nine-hole rounds are charged at 60%. Changes apply to future check-ins only.</p></form>';
      const m = ui.modal({ eyebrow: 'Tee sheet settings', title: 'Golf fees', body: body, actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save fees', kind: 'primary', onClick: function () {
        const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
        const f = ui.formData(form);
        if (!(f.guestFee >= 0) || !(f.cartFee >= 0)) { ui.toast('Fees cannot be negative', 'bad'); return false; }
        const rec = Club.undo.track(function () { S.setObj('teeSheetSettings', Object.assign(settings(), { guestFee: f.guestFee, cartFee: f.cartFee })); });
        const snap = JSON.stringify(S.getObj('teeSheetSettings', null));
        renderFees();
        undoOffer('Golf fees saved', rec, { check: function () { return JSON.stringify(S.getObj('teeSheetSettings', null)) !== snap ? CHANGED : null; }, after: function () { if (document.body.contains(view)) renderFees(); }, undone: 'Golf fees are back as they were' });
      } }] });
    }

    /* ---- live clock for today's starter ---- */
    const timer = setInterval(function () {
      if (state.date !== today || !document.body.contains(view)) return;
      /* A tee time passed since the sheet was drawn: redraw the rows (Late, Next up, faded rows) and move the Now line. */
      if (nowSig() !== paintedAt && !document.querySelector('.overlay')) { renderSheet(); renderPeriods(); }
      renderStarter();
      const n = ui.$('[data-now]', sheet), word = n && /^Close/.test(n.textContent) ? 'Close of play ' : 'Now ';
      if (n) { ui.$('span', n).textContent = word + fmt.time(toHM(nowMin())); n.setAttribute('aria-label', word + fmt.time(toHM(nowMin()))); }
    }, 30000);
    /* One timer for online holds on the sheet; holds.js also wakes us when another tab places, releases or ends one. */
    const holdTimer = setInterval(function () { if (document.body.contains(view)) paintHolds(); }, 1000);
    const unHolds = Club.holds ? Club.holds.subscribe(function () { if (document.body.contains(view)) paintHolds(); }) : null;
    return function () { clearInterval(timer); clearInterval(holdTimer); if (unHolds) unHolds(); };
  }
})();
