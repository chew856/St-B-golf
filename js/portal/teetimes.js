/* Portal: Tee times. Members book, join, modify and cancel tee times.
   Reads and writes the staff tee sheet's `teeTimes` collection using the exact rules in js/modules/teesheet.js
   (settings, slot grid, blocks, one group per slot, member overlap, fees at check-in). */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;

  /* ---------------- Rules mirrored from the staff tee sheet ---------------- */
  const DEFAULTS = { interval: 9, first: '06:30', last: '19:00', guestFee: 66, cartFee: 28 };
  const PACE = (Club.teeRules && Club.teeRules.PACE) || { 18: 234, 9: 117 };   /* handbook: 13 minutes a hole */
  const PREVIEW_DAYS = 3;      // days shown past the member's booking window, marked "Opens <date>"
  const CUTOFF_MIN = 120;      // changes and cancellations close 2 hours before the tee time

  function settings() { return Object.assign({}, DEFAULTS, S.getObj('teeSheetSettings', {}) || {}); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function slotList() { const s = settings(); const out = []; const step = Math.max(5, +s.interval || 9); for (let m = toMin(s.first); m <= toMin(s.last); m += step) out.push(toHM(m)); return out; }
  function closeHM() { const s = settings(); return toHM(toMin(s.last) + (+s.interval || 9)); }
  function blocksOn(date) { return S.where('teeBlocks', function (b) { return b.date === date; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }); }
  function blockAt(blocks, date, t) { return blocks.find(function (b) { return b.date === date && t >= b.start && t < b.end; }) || null; }
  function activeOn(date) { return S.where('teeTimes', function (t) { return t.date === date && t.status !== 'cancelled'; }); }
  function hostOf(tt) { return (tt.players || []).find(function (p) { return p.type === 'member' && p.memberId && Club.members.get(p.memberId); }) || null; }
  function courseStatus() { return S.getObj('courseStatus', null) || { open: true, cartRule: 'Normal' }; }
  function today() { return Club.date.today(); }

  /* ---- Membership booking windows and play times: always from Club.teeRules (one source of truth) ---- */
  function TR() { return Club.teeRules || null; }
  function tierRules(m) { return TR() ? TR().tierRules(m) : { advanceDays: 14, windows: null, tierName: 'Member', golf: true }; }
  function advanceDays(m) { return tierRules(m).advanceDays; }
  /** Last bookable day for this member (today plus their tier's advance days). */
  function lastDay(m) { return Club.date.fromToday(advanceDays(m)); }
  function windowOpen(m, d) {
    const bl = ballotLock(d); if (bl) return bl;   /* weekends and holidays: the ballot comes first (js/shared/ballot-data.js) */
    return TR() ? TR().bookingOpen('member', m, d, today()) : { ok: d >= today() && d <= lastDay(m), reason: 'That date is outside your booking window.', opensOn: null };
  }
  function canPlay(m, d, t) { return TR() ? TR().memberCanPlay(m, d, t) : { ok: true, reason: '' }; }
  /** Days on the strip: the member's window plus a short preview of days that are not open yet, and the ballot days up
      to 15 days ahead (every category may enter the ballot, whatever its advance booking days). */
  function stripDays(m) {
    const out = []; const n = advanceDays(m) + 1 + PREVIEW_DAYS;
    for (let i = 0; i < n; i++) out.push(Club.date.fromToday(i));
    if (BL()) for (let i = n; i <= BL().OPEN_DAYS + PREVIEW_DAYS; i++) { const d = Club.date.fromToday(i); if (BL().isBallotDay(d)) out.push(d); }
    return out;
  }

  /* ---- Weekend ballot (Club.ballot, js/shared/ballot-data.js): Saturdays, Sundays and holidays ---- */
  function BL() { return Club.ballot || null; }
  function drawWhen(d) { const s = BL().schedule(d); return fmt.toDate(s.drawOn).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ' at ' + fmt.time(s.drawTime); }
  /** Ordinary booking is closed on a ballot day until its draw: { ok: false, ballot: phase, reason, opensOn } or null. */
  function ballotLock(d) {
    if (!BL() || !BL().blocksBooking(d)) return null;
    const s = BL().schedule(d), ph = BL().phase(d);
    if (ph === 'before') return { ok: false, ballot: 'before', opensOn: s.opensOn, reason: 'Weekend and holiday tee times start with a ballot. Entries for ' + longDate(d) + ' open on ' + longDate(s.opensOn) + '.' };
    if (ph === 'open') return { ok: false, ballot: 'open', opensOn: s.drawOn, reason: 'Tee times for ' + longDate(d) + ' are given out by ballot. Draw on ' + drawWhen(d) + '.' };
    return { ok: false, ballot: 'due', opensOn: s.drawOn, reason: 'The ballot draw for ' + longDate(d) + ' is being made. Please check again in a moment.' };
  }
  /* ---- Member Guest Policy (Club.teeRules.guestLimit): one guest per member in prime time, else up to three ---- */
  function guestLimitAt(d, t) {
    if (!d || !t) return null;
    if (TR() && typeof TR().guestLimit === 'function') return TR().guestLimit(d, t);
    return BL() ? BL().guestLimit(d, t) : null;
  }
  function guestLimitText(lim, d) {
    if (!lim) return '';
    if (lim.max >= 3) return 'Up to three guests per member at this time.';
    return 'One guest per member at this time. ' + (fmt.toDate(d).getDay() === 5 ? 'Fridays are prime time all day.' : 'Weekend and holiday mornings from 6:00 to 11:00 AM are prime time.');
  }
  /** Guests this member brings in a list of players (a guest with no host is the booker's). */
  function guestsOf(players, mid, bookerId) { return (players || []).filter(function (p) { return p && p.type === 'guest' && (p.hostId || bookerId) === mid; }).length; }
  /** '' or the reason the member's guests are over the limit at this date and time. */
  function guestProblem(players, mid, d, t, bookerId) {
    const lim = guestLimitAt(d, t); const n = guestsOf(players, mid, bookerId || mid);
    return lim && n > lim.max ? 'Too many guests for ' + fmt.time(t) + '. ' + guestLimitText(lim, d) + ' Please remove ' + (n - lim.max === 1 ? 'a guest' : (n - lim.max) + ' guests') + '.' : '';
  }
  /* ---- Account standing (Club.billing.standing, when the billing module provides it) ---- */
  function standingOf(mid) {
    if (!Club.billing || typeof Club.billing.standing !== 'function') return { ok: true, reason: '' };
    let s = null; try { s = Club.billing.standing(mid); } catch (e) { s = null; }
    return s && s.canBook === false ? { ok: false, reason: s.reason || 'Online booking is paused on your account. Please call the golf shop.' } : { ok: true, reason: '' };
  }
  function guestFee(d, t, holes) { return TR() ? TR().greenFee(d, t, holes) : settings().guestFee * (+holes === 9 ? 0.6 : 1); }
  function windowLine(m) {
    const r = tierRules(m);
    return 'You can book up to ' + r.advanceDays + ' days ahead (until ' + fmt.dateShort(lastDay(m)) + ').';
  }
  /** Cart rules in plain words, with a one-line explanation of each. */
  const CART_INFO = {
    'Normal': { pre: 'Carts ', rule: 'allowed', short: 'Allowed', label: 'Carts allowed', title: 'Carts allowed', text: 'Carts can drive on the fairways and rough. Keep them off tees and greens.' },
    '90 degree': { pre: 'Carts on ', rule: '90° rule', short: '90° rule', label: 'Carts on 90° rule', title: 'The 90° rule', text: 'Keep to the cart path, then turn onto the fairway at a right angle to reach your ball and drive straight back to the path.' },
    'Cart path only': { pre: 'Carts ', rule: 'on paths only', short: 'Paths only', label: 'Carts on paths only', title: 'Cart path only', text: 'Carts stay on the paved paths at all times. Walk from the path to your ball.' },
    'No carts': { pre: '', rule: 'No carts today', short: 'Walking only', label: 'No carts today', title: 'No carts today', text: 'Carts are not allowed on the course today, so everyone walks.' }
  };
  function cartInfo(rule) { return CART_INFO[rule || 'Normal'] || { pre: 'Carts: ' + rule, rule: '', short: String(rule), label: 'Carts: ' + rule, title: '', text: '' }; }
  /** "6:30 to 7:51 AM": drops the first AM/PM when both times share it. */
  /* "10:30 to 4:00 PM": drop the first AM/PM only when both times have the same one (French times have none). */
  function rangeLabel(fa, fb, sep) { return (/ [AP]M$/.test(fa) && fa.slice(-2) === fb.slice(-2) ? fa.slice(0, -3) : fa) + (sep || ' to ') + fb; }
  function lowerFirst(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
  function spotsLeft(n) { return n >= 4 ? '4 spots' : n === 1 ? '1 spot left' : n + ' spots left'; }
  function dayHeading(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + fmt.dateShort(d); }
  function playLine(m) {
    const r = tierRules(m);
    if (!r.golf) return r.tierName + ' membership does not include golf.';
    if (!r.windows) return r.tierName + ' members play any time, seven days a week.';
    const dw = TR().describeWindows;
    return r.tierName + ' members play weekdays ' + dw(r.windows.weekday || []) + ', and weekends and holidays ' + dw(r.windows.weekend || []) + '.';
  }
  function isPublic(p) { return !!p && p.type === 'public'; }
  /** How another booker's non-member players appear to a member (names of guests and public golfers stay private). */
  function otherLabel(p) { return Portal.playerLabel(p); }   /* friends in full, everyone else "Tom R." (js/portal/kit.js) */
  /** Course yardages from the scorecard (holes collection). */
  function teeLine() {
    const hs = S.all('holes'); if (!hs.length) return '';
    const sum = function (k) { return hs.reduce(function (a, h) { return a + (+(h.yards || {})[k] || 0); }, 0); };
    const par = hs.reduce(function (a, h) { return a + (+h.par || 0); }, 0);
    const parts = [['Black', 'black'], ['Green', 'green'], ['Silver', 'silver']].filter(function (x) { return sum(x[1]) > 0; })
      .map(function (x) { return x[0] + ' ' + sum(x[1]).toLocaleString('en-CA'); });
    return parts.length ? 'Par ' + par + ' · ' + parts.join(' · ') + ' yards' : '';
  }
  function endLabel(end) { return end >= closeHM() ? 'close of play' : fmt.time(end); }

  /** Staff overlap rule: a member never has two rounds whose start times sit within the other group's pace target. */
  function clashFor(memberId, date, time, excludeId, list, holes) {
    /* The round that starts first sets the window: a later round may start once the earlier one is expected to finish.
       `holes` is the new round's length (18 when not known). */
    const b = toMin(time);
    return (list || S.all('teeTimes')).filter(function (x) {
      const a = toMin(x.time);
      return x.date === date && x.status !== 'cancelled' && x.status !== 'no-show' && x.id !== excludeId &&
        (a <= b ? b - a < (PACE[x.holes] || 255) : a - b < (PACE[holes] || 255)) &&
        (x.players || []).some(function (q) { return q.memberId === memberId; });
    })[0] || null;
  }

  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function canGolf(m) { const t = tierOf(m); return t ? !!t.golf : m.tierId !== 'tier_social'; }
  function isIn(tt, id) { return (tt.players || []).some(function (p) { return p.memberId === id; }); }
  /* Who may modify or cancel the whole group: the member who booked it. When that member has left, the first member
     takes over, except on a time public golfers booked or joined: those paid players belong to the golf shop, so a
     member who joined can only withdraw. */
  function managerOf(tt) {
    if (tt.bookedBy && isIn(tt, tt.bookedBy)) return tt.bookedBy;
    if (tt.source === 'public' || (tt.players || []).some(isPublic)) return null;
    const h = hostOf(tt); return h ? h.memberId : null;
  }
  function minutesUntil(tt) { const d = fmt.toDate(tt.date); d.setHours(0, toMin(tt.time), 0, 0); return (d.getTime() - Date.now()) / 60000; }
  function playerName(p) {
    if (p.type === 'member' && p.memberId) { const m = Club.members.get(p.memberId); if (m) return m.firstName + ' ' + m.lastName; }
    return p.name || 'Guest';
  }
  function places(n) { return n + (n === 1 ? ' spot' : ' spots'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function niceList(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
  function dayName(d) { return d === today() ? 'Today' : d === Club.date.addDays(today(), 1) ? 'Tomorrow' : fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long' }); }
  function longDate(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function timeParts(t) { const p = fmt.time(t).split(' '); return { t: p[0], ap: p[1] }; }
  function cartRuleFor(date) { const cs = courseStatus(); return date === today() ? (cs.cartRule || 'Normal') : 'Normal'; }
  function noCarts(date) { return cartRuleFor(date) === 'No carts'; }

  /* ---------------- Availability ---------------- */
  function daySlots(date, me) {
    const now = nowMin(), td = today(), cs = courseStatus();
    const blocks = blocksOn(date); const byTime = {};
    activeOn(date).forEach(function (t) { if (!byTime[t.time] || isIn(t, me.id)) byTime[t.time] = t; });
    const closed = date === td && cs.open === false;
    const win = date >= td ? windowOpen(me, date) : { ok: true };
    return slotList().map(function (t) {
      const tt = byTime[t] || null; const m = toMin(t);
      const held = Club.holds ? Club.holds.heldByOthers(date, t) : 0;   /* someone else is completing a booking here (js/core/holds.js) */
      const s = { time: t, tt: tt, places: Math.max(0, 4 - (tt ? (tt.players || []).length : 0) - held), held: held, block: blockAt(blocks, date, t), state: 'open', reason: '' };
      const play = function () { const r = canPlay(me, date, t); s.reason = r.reason; return r.ok; };
      if (tt && isIn(tt, me.id)) s.state = 'mine';
      else if (date < td || (date === td && m <= now)) s.state = 'past';
      else if (!win.ok) { s.state = 'locked'; s.reason = win.reason; }
      else if (closed) s.state = 'closed';
      else if (s.block) s.state = 'blocked';
      else if (!play()) s.state = 'rule';
      else if (tt && tt.status !== 'booked') s.state = 'full';
      else if (s.places <= 0) s.state = held ? 'held' : 'full';
      else if (clashFor(me.id, date, t, null)) s.state = 'clash';
      else s.state = tt || held ? 'partial' : 'open';
      /* A friend's group follows that friend's sharing settings: hidden tee times are not offered, and a friend who wants
         to be asked first is joined through a request on the Friends page. */
      if (s.state === 'partial' && tt && Portal.friends && Portal.friends.restrict) {
        const r = Portal.friends.restrict(me.id, tt);
        if (r) { s.state = r.code === 'ask' ? 'ask' : 'private'; s.reason = r.code === 'ask' ? 'Send a request to join from the Friends page.' : ''; }
      }
      return s;
    });
  }
  function bookable(s) { return s.state === 'open' || s.state === 'partial'; }
  function daySummary(date, me) {
    const sl = daySlots(date, me); const av = sl.filter(bookable);
    const closed = date === today() && courseStatus().open === false;
    const win = date >= today() ? windowOpen(me, date) : { ok: true };
    const ruled = sl.find(function (s) { return s.state === 'rule'; });
    return { slots: sl, avail: av.length, places: av.reduce(function (a, s) { return a + s.places; }, 0), closed: closed,
      locked: win.ok ? null : win, ruleReason: ruled ? ruled.reason : '', ruleCount: sl.filter(function (s) { return s.state === 'rule'; }).length,
      mine: sl.some(function (s) { return s.state === 'mine'; }), over: sl.every(function (s) { return s.state === 'past' || s.state === 'mine'; }) };
  }

  /* ---------------- My rounds ---------------- */
  function myRounds(me) { return S.where('teeTimes', function (t) { return t.status !== 'cancelled' && isIn(t, me.id); }); }
  function upcoming(me) {
    const td = today();
    return myRounds(me).filter(function (t) { return t.date >= td && (t.status === 'booked' || t.status === 'checked-in' || t.status === 'on-course'); })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }
  function past(me) {
    return myRounds(me).filter(function (t) { return t.status === 'completed' || t.status === 'no-show'; })
      .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
  }

  /* ---------------- Promo codes (Club.promos) on a member's booking ----------------
     A code reduces what posts to the member's account at check-in: a guest's green fee, cart fees and the add-ons they pay
     for. Their own golf is covered by dues, so a green-fee code with no guest reduces nothing (the box says so). The
     discount travels on the booking member's player as a negative add-on line
       { addonId: 'promo', name: 'Promo code FALL20', qty: 1, price: -discount, promoId, code }
     so the staff tee sheet quotes and posts it with the rest (js/modules/teesheet.js postFees: a credit on the account,
     with its receipt), and the use is recorded the way the public site records one: a publicPayments record (amount 0,
     status 'account', memberId, source 'portal') carrying promo, which gives the sheet its Promo pill, plus
     Club.promos.redeem (source 'portal', refId that record). A change to the booking re-quotes the discount; cancelling,
     withdrawing or losing every eligible line refunds the record and releases the use. */
  const PROMO_ID = 'promo';
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function promoLine(p) { return ((p && p.addons) || []).find(function (x) { return x.addonId === PROMO_ID; }) || null; }
  function realAdds(items) { return (items || []).filter(function (x) { return x.addonId !== PROMO_ID; }); }
  /** Put the applied code (an applyBox state, or null for none) on the booking member's player as its line. */
  function setPromoLine(p, s) {
    if (!p) return;
    p.addons = realAdds(p.addons);
    if (s && s.discount > 0) p.addons.push({ addonId: PROMO_ID, name: 'Promo code ' + s.code, qty: 1, price: -r2(s.discount), promoId: s.promo.id, code: s.code });
    if (!p.addons.length) delete p.addons;
  }
  /** The lines a code may reduce: what is on this member's account, as Club.promos lines. */
  function promoLines(q) { return q.mine.filter(function (l) { return l.kind !== 'promo'; }).map(function (l) { return { label: l.label, amount: l.amt, kind: l.kind }; }); }
  /** A valid code that reduces nothing here: say what it is for. */
  function promoNoMatch(p) {
    return 'This code applies to ' + Club.promos.kindsText(p) + '.' + ((p.appliesTo || []).indexOf('greenFee') >= 0 ? ' Your golf is covered by dues.' : ' There is nothing in this booking for it to reduce.');
  }
  /** Keep a tee time's promo record in step with the member's line: made when booked, amended when the booking changes,
      refunded (and the use released) when the line or the booking goes. */
  function syncPromoRecord(tt, m) {
    if (!Club.promos || !tt || !m) return;
    const mine = tt.status !== 'cancelled' ? (tt.players || []).find(function (p) { return p.memberId === m.id; }) : null;
    const ln = mine ? promoLine(mine) : null;
    const rec = S.where('publicPayments', function (x) { return x.teeTimeId === tt.id && x.memberId === m.id && x.source === 'portal' && x.promo && x.status !== 'refunded'; })[0] || null;
    if (ln && ln.promoId) {
      const disc = r2(-ln.price);
      if (rec) {
        if (r2(rec.promo.discount) !== disc) { S.update('publicPayments', rec.id, { promo: Object.assign({}, rec.promo, { discount: disc }) }); Club.promos.amend('portal', rec.id, disc); }
        return;
      }
      const pay = S.insert('publicPayments', { id: S.uid('ppay'), publicPlayerId: null, memberId: m.id, teeTimeId: tt.id, date: today(), amount: 0, tax: 0, brand: null, last4: null, status: 'account', source: 'portal',
        description: 'Promo code ' + ln.code + ' on a member booking, ' + fmt.dateShort(tt.date) + ' at ' + fmt.time(tt.time) + '. The discounted fees post to the account at check-in.',
        lines: [], promo: { promoId: ln.promoId, code: ln.code, discount: disc }, players: (tt.players || []).length, holes: tt.holes, teeDate: tt.date, teeTime: tt.time });
      Club.promos.redeem(ln.promoId, { source: 'portal', refId: pay.id, discount: disc, memberId: m.id });
    } else if (rec) {
      S.update('publicPayments', rec.id, { status: 'refunded', refundedOn: today() });
      Club.promos.release('portal', rec.id);
    }
  }

  /* ---------------- Fees (quoted now, posted by the golf shop at check-in) ---------------- */
  /** Guests pay the published green fee for the tee time (Club.teeRules.greenFee). Public golfers pay online or at the golf shop.
      Lines carry the Club.promos kind (greenFee, cart, addon; promo for the code's own negative line). */
  function feeQuote(players, holes, hostId, meId, date, time) {
    const st = settings(); const f = holes === 9 ? 0.6 : 1; const gf = guestFee(date, time, holes);
    const mine = [], others = [], shop = []; let promo = null;
    players.forEach(function (p) {
      if (isPublic(p)) return;
      const host = p.hostId || hostId;   // a guest's fees go to the member who brought them
      const adds = function (who) {
        return (p.addons || []).map(function (x) {
          if (x.addonId === PROMO_ID) return { label: x.name, amt: r2(x.price), kind: 'promo', code: x.code };
          return { label: x.name + (+x.qty > 1 ? ' (' + x.qty + ')' : '') + ', ' + who, amt: (+x.qty || 1) * (+x.price || 0), kind: 'addon' };
        });
      };
      if (p.type === 'guest' && p.pays === 'shop') {   // the guest pays at the golf shop: never on a member's account
        if (host === meId) { shop.push({ label: 'Green fee, ' + (p.name || 'guest'), amt: gf, kind: 'greenFee' }); if (p.cart) shop.push({ label: 'Cart, ' + (p.name || 'guest'), amt: st.cartFee * f, kind: 'cart' }); adds(p.name || 'guest').forEach(function (l) { shop.push(l); }); }
        return;
      }
      if (p.type === 'guest') (host === meId ? mine : others).push({ label: 'Guest green fee, ' + (p.name || 'guest'), amt: gf, kind: 'greenFee' });
      const payer = p.type === 'member' ? p.memberId : host;
      if (p.cart) (payer === meId ? mine : others).push({ label: 'Cart, ' + (p.memberId === meId ? 'you' : (p.name || 'guest')), amt: st.cartFee * f, kind: 'cart' });
      /* Add-ons (Club.addons) post at check-in like the cart fee: a member's to their own account, a guest's to the host. */
      adds(p.memberId === meId ? 'you' : (p.name || 'guest')).forEach(function (l) {
        if (l.kind === 'promo' && payer === meId) promo = { code: l.code, discount: -l.amt };
        (payer === meId ? mine : others).push(l);
      });
    });
    const sum = function (a) { return Math.round(a.reduce(function (x, l) { return x + l.amt; }, 0) * 100) / 100; };
    return { mine: mine, others: others, shop: shop, total: sum(mine), othersTotal: sum(others), shopTotal: sum(shop), nine: holes === 9, promo: promo };
  }
  /* ---------------- Calendar file ---------------- */
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function downloadIcs(tt) {
    const start = fmt.toDate(tt.date); start.setHours(0, toMin(tt.time), 0, 0);
    const end = new Date(start.getTime() + (PACE[tt.holes] || 255) * 60000);
    const local = function (d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00'; };
    const names = (tt.players || []).map(playerName).join(', ');
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + Club.info.short + '//Members Portal//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + tt.id + '@stboniface.members', 'DTSTAMP:' + icsStamp(new Date()), 'DTSTART:' + local(start), 'DTEND:' + local(end),
      'SUMMARY:' + icsEscape('Tee time at ' + Club.info.short + ', ' + tt.holes + ' holes'),
      'LOCATION:' + icsEscape(Club.info.name + ', ' + Club.info.address),
      'DESCRIPTION:' + icsEscape('Players: ' + names + '\nPlease check in at the golf shop 15 minutes before your tee time.\nGolf shop: ' + Club.info.phone),
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

  /** Fresh copy of tee times straight from storage, so a slot taken in another tab is caught before saving. */
  function storedTeeTimes() {
    try { const tt = Club.store.stored('teeTimes'); return Array.isArray(tt) ? tt : null; } catch (e) { return null; }
  }

  /* ---------------- Fees, compact: total with a collapsed breakdown ---------------- */
  function feesCompact(q, openNow) {
    const shopNote = q.shop && q.shop.length ? '<p class="tt-due-shop">Paid by your guest at the golf shop: <span class="num">' + fmt.money(q.shopTotal) + '</span></p>' : '';
    if (!q.mine.length && !q.others.length && shopNote) {
      return '<div class="tt-due"><div class="tt-due-row"><span>Due at check-in</span><span class="tt-due-amt">' + fmt.money(0) + '</span></div><p class="tt-due-note">Nothing is due on your account.</p>' + shopNote + '</div>';
    }
    if (!q.mine.length && !q.others.length) {
      return '<div class="tt-due"><div class="tt-due-row"><span>Due at check-in</span><span class="tt-due-amt">' + fmt.money(0) + '</span></div><p class="tt-due-note">No fees for this round. Member golf is included in your dues.</p></div>';
    }
    /* The promo code's line (kind 'promo') is the discount: shown as "−$6.60", not counted as an item. */
    const lines = function (arr) { return '<ul class="tt-fees-lines">' + arr.map(function (l) { return '<li' + (l.kind === 'promo' ? ' class="tt-fee-promo"' : '') + '><span>' + esc(l.label) + '</span><span class="num">' + esc(l.amt < 0 ? '−' + fmt.money(-l.amt) : fmt.money(l.amt)) + '</span></li>'; }).join('') + '</ul>'; };
    const items = function (arr) { return arr.filter(function (l) { return l.kind !== 'promo'; }).length; };
    const body = (q.mine.length ? lines(q.mine) : '<p class="tt-due-note">Nothing is due on your account.</p>') +
      (q.others.length ? '<p class="tt-due-sub">On other members’ accounts</p>' + lines(q.others) : '') +
      (q.shop && q.shop.length ? '<p class="tt-due-sub">Paid by your guest at the golf shop</p>' + lines(q.shop) : '') +
      '<p class="tt-due-note">' + (q.nine ? 'Nine-hole rate applied. ' : '') + 'Nothing is charged now. Fees post when the group checks in at the golf shop.</p>';
    return '<div class="tt-due"><div class="tt-due-row"><span>Due at check-in</span><span class="tt-due-amt">' + fmt.money(q.total) + '</span></div>' + shopNote +
      Portal.accordion({ id: 'tt-fee-acc-' + (++feeSeq), title: 'Breakdown', summary: plural(items(q.mine) + items(q.others) + (q.shop ? items(q.shop) : 0), 'item') + (q.promo ? ' · ' + q.promo.code : ''), body: body, open: !!openNow }) + '</div>';
  }
  let feeSeq = 0;

  /* ---------------- Friends leagues (Club.friendLeagues, js/core/friendleagues.js) ----------------
     The booking member's own player entry can carry friendLeagueId: the round then counts toward that league once they
     post a score for it (js/portal/scores.js copies it onto the post). One league per round; off unless chosen. */
  function FL() { return Club.friendLeagues || null; }
  /** [{ league, check }] for every league the member is in that runs on that date (countableFor). */
  function leaguesFor(mid, date, holes, excludeId) { return FL() && mid ? FL().countableFor(mid, date, +holes || 18, excludeId || null) : []; }
  /** What the round would be in the league: "Counts as your week 2 game (catching up)", or why it cannot count. */
  function leagueWeekText(x, on) {
    const c = x.check; if (!c.ok) return c.reason || 'This round cannot count';
    const g = x.league.perWeek > 1 ? 'game ' + c.game + ' of week ' + c.week : 'your week ' + c.week + ' game';
    return (on === false ? 'Would count as ' : 'Counts as ') + g + (c.late ? ' (catching up)' : '');
  }
  /** The member's choice, kept only while that league can still take this round. */
  function validLeague(list, id) { const x = id ? list.find(function (y) { return y.league.id === id; }) : null; return x && x.check.ok ? x : null; }
  /** The switch (one league) or the picker row (several). '' when the member is in no league running that day.
      uid: unique per control; current: the league id chosen now (or null). */
  function leagueHTML(list, current, uid) {
    if (!list.length) return '';
    const cur = validLeague(list, current);
    if (list.length === 1) {
      const x = list[0], on = !!cur, id = 'tt-lg-' + uid;
      return '<div class="tt-lg"><label class="tt-lg-sw' + (x.check.ok ? '' : ' is-off') + '" for="' + id + '">' +
        '<span class="tt-lg-text"><span class="tt-lg-l">' + esc('Counts toward ' + x.league.name) + '</span><span class="tt-lg-s">' + esc(leagueWeekText(x, on)) + '</span></span>' +
        '<span class="toggle"><input type="checkbox" role="switch" id="' + id + '" data-act="tt-lg-sw" data-lg="' + esc(x.league.id) + '"' + (on ? ' checked' : '') + (x.check.ok ? '' : ' disabled') + '><span></span></span></label></div>';
    }
    return '<div class="tt-lg"><button type="button" class="tt-lg-pick" data-act="tt-lg-pick" aria-haspopup="dialog">' + Club.icon('trophy', 'tt-lg-icon') +
      '<span class="tt-lg-text"><span class="tt-lg-k">Friends league</span><span class="tt-lg-l">' + esc(cur ? 'Counts toward ' + cur.league.name : 'Does not count') + '</span>' +
      (cur ? '<span class="tt-lg-s">' + esc(leagueWeekText(cur)) + '</span>' : '') + '</span>' + Club.icon('chevronRight', 'tt-go') + '</button></div>';
  }
  /** The several-leagues picker: "Does not count" plus each league (greyed out with the reason when it cannot count). */
  function pickLeague(list, current, done) {
    const cur = validLeague(list, current);
    Portal.openSheet({ title: 'Count this round toward', selected: cur ? cur.league.id : '',
      rows: [{ value: '', label: 'Does not count', sub: 'A round on its own' }].concat(list.map(function (x) {
        return { value: x.league.id, label: x.league.name, sub: leagueWeekText(x), disabled: !x.check.ok };
      })),
      onPick: function (v) { done(v || null); } });
  }
  /** Wires a league control inside root. get(): the current id; set(id): save it (null for none). */
  function wireLeague(root, list, get, set) {
    root.addEventListener('change', function (e) {
      const sw = e.target.closest && e.target.closest('[data-act=tt-lg-sw]'); if (!sw) return;
      set(sw.checked ? sw.dataset.lg : null);
    });
    ui.on(root, 'click', '[data-act=tt-lg-pick]', function () { pickLeague(list(), get(), set); });
  }

  /* ---------------- Group editor (booking sheet and change sheet) ---------------- */
  /**
   * model: { holes, notes, players: [{ memberId, name, type, cart, paid }], existing: [players already in the group] }
   * opts: { me, date, time, excludeId, allowGuests, guestNote, showHoles, hideNotes, target, hostId, onChange, fullNote, hideZeroFees }
   */
  function groupEditor(root, model, opts) {
    const me = opts.me;
    /* "Have a promo code?" (opts.promo, the Book sheet): one Club.promos box that survives every redraw of the editor. */
    const promoHost = opts.promo && Club.promos ? document.createElement('div') : null;
    if (promoHost) promoHost.className = 'tt-promo-host';
    let promoBox = null;
    function max() { return 4 - (model.existing || []).length; }
    function rideHTML(p, i) {
      const self = p.memberId === me.id;
      if (noCarts(opts.date)) return '<span class="tt-walk-only">Walking only today</span>';
      return '<div class="segmented tt-ride" data-i="' + i + '" role="group" aria-label="' + esc((self ? 'Your' : (p.name || 'Guest') + '’s') + ' transport') + '"><button type="button" data-value="walk" class="' + (p.cart ? '' : 'active') + '" aria-pressed="' + !p.cart + '">Walk</button><button type="button" data-value="cart" class="' + (p.cart ? 'active' : '') + '" aria-pressed="' + !!p.cart + '">Cart</button></div>';
    }
    function rowHTML(p, i) {
      const self = p.memberId === me.id;
      return '<li class="tt-pl' + (self ? ' is-self' : '') + '">' +
        '<div class="tt-pl-who"><span class="tt-pl-name">' + esc(self ? 'You' : playerName(p)) + '</span><span class="tt-pl-sub">' + (self ? esc(playerName(p)) : p.type === 'guest' ? esc('Guest' + (p.phone ? ' · ' + p.phone : '')) : 'Member') + '</span></div>' +
        rideHTML(p, i) +
        (self ? '' : '<button type="button" class="tt-pl-x" data-act="remove" data-i="' + i + '" aria-label="Remove ' + esc(playerName(p)) + '">' + Club.icon('close') + '</button>') +
        (p.type === 'guest' && (!p.hostId || p.hostId === me.id) ? '<div class="tt-pays"><span class="tt-pays-l" id="tt-pays-' + opts.uid + '-' + i + '">Who pays</span>' +
          paysSeg('', p.pays === 'shop' ? 'shop' : 'host', 'data-i="' + i + '" aria-labelledby="tt-pays-' + opts.uid + '-' + i + '"') + '</div>' : '') +
        '</li>';
    }
    function render() {
      const n = model.players.length, left = max() - n;
      const accOpen = {}; ui.$$('.pk-acc', root).forEach(function (a) { accOpen[a.dataset.acc] = a.classList.contains('is-open'); });
      const total = (model.existing || []).length + n;
      const want = opts.target ? Math.min(opts.target, 4) : 0;
      const cr = cartRuleFor(opts.date);
      root.innerHTML =
        '<div class="tt-party">' +
          '<div class="tt-party-head"><h3>Players</h3><span class="tt-party-count">' + total + ' of 4</span></div>' +
          '<ul class="tt-pl-list">' +
            (model.existing || []).map(function (p) { return '<li class="tt-pl is-existing"><div class="tt-pl-who"><span class="tt-pl-name">' + esc(otherLabel(p)) + '</span><span class="tt-pl-sub">Already in the group</span></div></li>'; }).join('') +
            model.players.map(rowHTML).join('') +
            (left > 0 ? '<li class="tt-add-row"><button type="button" class="tt-add-btn" data-act="add-member">' + Club.icon('members') + '<span>Add a friend</span>' + Club.icon('chevronRight', 'tt-go') + '</button></li>' +
              (opts.allowGuests ? '<li class="tt-add-row"><button type="button" class="tt-add-btn" data-act="add-guest">' + Club.icon('user') + '<span>Add a guest</span>' + Club.icon('chevronRight', 'tt-go') + '</button></li>' : '') : '') +
          '</ul>' +
          (left <= 0 ? '<p class="tt-hint">' + esc(opts.fullNote || 'Your group is full (4 players).') + '</p>' : want && n < want && !(model.existing || []).length ? '<p class="tt-hint">' + plural(want - n, 'more player') + ' to add, or book just for yourself.</p>' : '') +
          (!opts.allowGuests && opts.guestNote && left > 0 ? '<p class="tt-hint">' + esc(opts.guestNote) + '</p>' : '') +
          (function () { const lim = opts.allowGuests ? guestLimitAt(opts.date, opts.time) : null; return lim && lim.max < 3 ? '<p class="tt-hint tt-guest-lim">' + Club.icon('info') + '<span>' + esc(guestLimitText(lim, opts.date)) + '</span></p>' : ''; })() +
          (cr !== 'Normal' ? '<p class="tt-hint tt-rule">' + Club.icon('info') + '<span>' + esc(cartInfo(cr).label + '. ' + cartInfo(cr).text) + '</span></p>' : '') +
        '</div>' +
        (opts.showHoles ? '<div class="tt-holes-row"><span class="pk-label">Holes</span>' + ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(model.holes), 'tt-holes-ed') + '</div>' : '') +
        (opts.league ? '<div class="tt-lg-host"></div>' : '') +
        addsHTML(accOpen['tt-adds-acc']) +
        (opts.hideNotes ? '' : Portal.accordion({ id: 'tt-notes-acc', icon: 'edit', title: 'Notes for the golf shop', summary: model.notes && model.notes.trim() ? model.notes.trim() : 'Optional', open: accOpen['tt-notes-acc'],
          body: '<label class="sr-only" for="tt-notes-' + opts.uid + '">Notes for the golf shop</label><textarea class="textarea tt-notes" id="tt-notes-' + opts.uid + '" maxlength="240" placeholder="An occasion, a pull cart, rental clubs for a guest">' + esc(model.notes || '') + '</textarea>' })) +
        (promoHost ? '<div class="tt-promo-slot"></div>' : '') +
        '<div class="tt-fees-host"></div>';
      if (promoHost) ui.$('.tt-promo-slot', root).replaceWith(promoHost);   /* the same box, moved into the fresh markup */
      drawLeague();
      fees();
    }
    /* ---- Friends league (opts.league): the booking member's own entry only; guests and other players are not affected ---- */
    function selfP() { return model.players.find(function (p) { return p.memberId === me.id; }) || null; }
    function leagueList() { return opts.league && selfP() ? leaguesFor(me.id, opts.date, model.holes, opts.excludeId) : []; }
    function drawLeague() {
      const host = ui.$('.tt-lg-host', root); if (!host) return;
      const p = selfP(), list = leagueList();
      /* A choice the round can no longer take (9 holes now, or the week filled elsewhere) is dropped */
      if (p && p.friendLeagueId && !validLeague(list, p.friendLeagueId)) delete p.friendLeagueId;
      host.innerHTML = leagueHTML(list, p && p.friendLeagueId, opts.uid);
    }
    if (opts.league) wireLeague(root, leagueList, function () { const p = selfP(); return p ? p.friendLeagueId || null : null; }, function (id) {
      const p = selfP(); if (!p) return;
      if (id) p.friendLeagueId = id; else delete p.friendLeagueId;
      drawLeague();
      const sw = ui.$('[data-act=tt-lg-sw]', root), pk = ui.$('[data-act=tt-lg-pick]', root); if (sw) sw.focus(); else if (pk) pk.focus();
    });
    /* ---- Add-ons the club offers members (Club.addons, memberOk): per player, or for the group on the booking member ---- */
    function offered() { return Club.addons && opts.addons !== false ? Club.addons.active('member') : []; }
    function booker() { return model.players.find(function (p) { return p.memberId === me.id; }) || model.players[0] || null; }
    function picked(p, id) { return (p.addons || []).find(function (x) { return x.addonId === id; }) || null; }
    function addsSummary() {
      const n = model.players.reduce(function (a, p) { return a + realAdds(p.addons).reduce(function (s, x) { return s + (+x.qty || 1); }, 0); }, 0);
      return n ? plural(n, 'item') + ' · ' + fmt.money(model.players.reduce(function (a, p) { return a + Club.addons.total(realAdds(p.addons)); }, 0)) : 'Optional';
    }
    /** A member whose profile says they walk with their own pull cart: the add-on is a rental, so say so. */
    function ownCartNote(a) {
      return /pull cart/i.test(a.name) && me.preferences && me.preferences.cart === 'Pull cart' ? '<span class="tt-add-note">Your profile says you walk with your own pull cart. Add this only if you need to rent one.</span>' : '';
    }
    function addsHTML(open) {
      const list = offered(); if (!list.length || !model.players.length) return '';
      const b = booker();
      const body = '<ul class="tt-adds">' + list.map(function (a) {
        const head = '<div class="tt-add-head"><span class="tt-add-name">' + esc(a.name) + '</span><span class="tt-add-price">' + esc(Club.addons.unit(a, model.holes)) + '</span>' + ownCartNote(a) + '</div>';
        if (a.per === 'booking') {
          const it = b ? picked(b, a.id) : null, n = it ? +it.qty || 1 : 0;
          return '<li class="tt-add" data-addon="' + esc(a.id) + '">' + head + '<div class="pk-step-row tt-add-qty" role="group" aria-label="' + esc(a.name) + '">' +
            '<button type="button" class="pk-step" data-act="tt-add-qty" data-d="-1" aria-label="One fewer"' + (n <= 0 ? ' disabled' : '') + '><span aria-hidden="true">−</span></button>' +
            '<output class="pk-step-val" aria-live="polite">' + n + '</output>' +
            '<button type="button" class="pk-step" data-act="tt-add-qty" data-d="1" aria-label="One more"' + (n >= Club.addons.MAX_QTY ? ' disabled' : '') + '><span aria-hidden="true">+</span></button></div></li>';
        }
        return '<li class="tt-add" data-addon="' + esc(a.id) + '">' + head + '<div class="tt-add-who" role="group" aria-label="' + esc(a.name) + '">' + model.players.map(function (p, i) {
          const on = !!picked(p, a.id), self = p.memberId === me.id;
          const who = self ? 'You' : String(playerName(p) || 'Guest').split(' ')[0];
          return '<button type="button" class="tt-add-chip' + (on ? ' on' : '') + '" data-act="tt-add-toggle" data-i="' + i + '" aria-pressed="' + on + '">' + Club.icon('check', 'tt-add-tick') + '<span>' + esc(who) + '</span></button>';
        }).join('') + '</div></li>';
      }).join('') + '</ul><p class="tt-hint">Charged to your account when the group checks in, with any cart fees.</p>';
      return Portal.accordion({ id: 'tt-adds-acc', icon: 'box', title: 'Add-ons', summary: addsSummary(), open: !!open, body: body });
    }
    function setAdd(p, a, qty) {
      p.addons = (p.addons || []).filter(function (x) { return x.addonId !== a.id; });
      if (qty > 0) p.addons.push(Club.addons.item(a, qty, model.holes));
      if (!p.addons.length) delete p.addons;
    }
    function refocus(sel) { const el = ui.$(sel, root); if (el) el.focus(); }
    ui.on(root, 'click', '[data-act=tt-add-toggle]', function (e, btn) {
      const a = Club.addons.get(btn.closest('[data-addon]').dataset.addon), p = model.players[+btn.dataset.i]; if (!a || !p) return;
      setAdd(p, a, picked(p, a.id) ? 0 : 1); render();
      refocus('.tt-add[data-addon="' + a.id + '"] [data-act=tt-add-toggle][data-i="' + btn.dataset.i + '"]');
    });
    ui.on(root, 'click', '[data-act=tt-add-qty]', function (e, btn) {
      const a = Club.addons.get(btn.closest('[data-addon]').dataset.addon), p = booker(); if (!a || !p) return;
      const it = picked(p, a.id), d = +btn.dataset.d;
      setAdd(p, a, Math.max(0, Math.min(Club.addons.MAX_QTY, (it ? +it.qty || 1 : 0) + d))); render();
      refocus('.tt-add[data-addon="' + a.id + '"] [data-act=tt-add-qty][data-d="' + d + '"]:not([disabled])') ;
    });
    function quoteNow() { return feeQuote(model.players, model.holes, opts.hostId ? opts.hostId() : me.id, me.id, opts.date, opts.time); }
    /** The promo line on the booking member follows the box (Book sheet) or, on a change sheet without one, is re-quoted
        against the lines as they stand now (removing the guest can leave a green-fee code with nothing to reduce). */
    function syncPromo() {
      const b = booker(); if (!b || !Club.promos) return;
      if (promoBox) { setPromoLine(b, promoBox.state()); return; }
      const ln = promoLine(b); if (!ln || !ln.promoId) return;
      const p = Club.promos.get(ln.promoId);
      const qq = p ? Club.promos.quote(p, promoLines(quoteNow())) : { ok: false };
      setPromoLine(b, qq.ok ? { promo: p, code: p.code, discount: qq.discount } : null);
    }
    /** After any change: the box re-quotes its code against the new lines and, through onChange, draws the fees. */
    function fees(fromBox) {
      if (promoBox && !fromBox) { promoBox.refresh(); return; }
      const host = ui.$('.tt-fees-host', root); if (!host) return;
      const was = ui.$('.pk-acc', host); const open = was && was.classList.contains('is-open');
      syncPromo();
      const q = quoteNow();
      host.innerHTML = opts.hideZeroFees && !q.mine.length && !q.others.length && !q.shop.length ? '' : feesCompact(q, open);
      if (opts.onChange) opts.onChange();
    }
    ui.on(root, 'click', '.tt-ride button', function (e, b) {
      const i = +b.closest('.tt-ride').dataset.i; model.players[i].cart = b.dataset.value === 'cart';
      ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); fees();
    });
    ui.on(root, 'click', '.segmented[data-name=tt-holes-ed] button', function (e, b) {
      model.holes = +b.dataset.value; ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); });
      if (offered().length && model.players.some(function (p) { return p.addons && p.addons.length; })) { model.players.forEach(function (p) { p.addons = repriceAdds(p.addons, model.holes); }); render(); }
      else { drawLeague(); fees(); }
    });
    ui.on(root, 'click', '.tt-pays-seg button', function (e, btn) {
      const seg = btn.closest('.tt-pays-seg'); model.players[+seg.dataset.i].pays = btn.dataset.value === 'shop' ? 'shop' : 'host'; setSeg(seg, btn.dataset.value); fees();
    });
    ui.on(root, 'click', '[data-act=remove]', function (e, b) { model.players.splice(+b.dataset.i, 1); render(); const a = ui.$('.tt-add-btn', root); if (a) a.focus(); });
    ui.on(root, 'click', '[data-act=add-guest]', function () {
      /* Member Guest Policy: the guests this member already brings here, against the limit at this time */
      const lim = guestLimitAt(opts.date, opts.time);
      const have = guestsOf((model.existing || []).concat(model.players), me.id, opts.hostId ? opts.hostId() : me.id);
      if (lim && have + 1 > lim.max) { ui.toast(guestLimitText(lim, opts.date), 'bad'); return; }
      pickGuest(me, function (g) {
        const p = { memberId: null, name: g.name, type: 'guest', cart: false, paid: false, hostId: me.id, pays: g.pays, phone: g.phone, email: g.email };
        if (g.handicap != null) p.handicap = g.handicap;
        model.players.push(p); render();
        ui.toast(g.name + ' added to your group');
      });
    });
    ui.on(root, 'click', '[data-act=add-member]', function () {
      pickMember(model, me, { date: opts.date, time: opts.time, excludeId: opts.excludeId, ballot: opts.ballot || null }, function (m) {
        model.players.push({ memberId: m.id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: !noCarts(opts.date) && !!(m.preferences && m.preferences.cart === 'Cart'), paid: false });
        render();
      });
    });
    root.addEventListener('input', function (e) {
      if (e.target.classList.contains('tt-notes')) {
        model.notes = e.target.value;
        const sum = e.target.closest('.pk-acc') && ui.$('.pk-acc-sum', e.target.closest('.pk-acc')); if (sum) sum.textContent = model.notes.trim() || 'Optional';
      }
    });
    render();
    if (promoHost) {
      promoBox = Club.promos.applyBox(promoHost, { site: 'portal',
        ctx: function () { return { where: 'teetime', date: opts.date, time: opts.time, memberId: me.id }; },
        lines: function () { return promoLines(quoteNow()); },
        noMatch: promoNoMatch,
        onChange: function () { fees(true); } });
    }
    return { render: render, validate: function () { model.players.forEach(function (p) { if (p.type === 'guest') p.name = String(p.name || '').trim(); }); return true; },
      /** The promo box (Book sheet only): recheck() right before booking. */
      promo: function () { return promoBox; },
      /** Redraw the friends league row (after a failed save: a league that can no longer take the round is dropped). */
      league: drawLeague };
  }

  /** "Who pays" for a guest: two options, so a segmented control (same look as Walk / Cart), not a native select. */
  function paysSeg(id, value, attrs) {
    return '<div class="segmented tt-pays-seg"' + (id ? ' id="' + id + '"' : '') + ' role="group" ' + (attrs || '') + '>' +
      '<button type="button" data-value="host" class="' + (value === 'shop' ? '' : 'active') + '" aria-pressed="' + (value !== 'shop') + '">My account</button>' +
      '<button type="button" data-value="shop" class="' + (value === 'shop' ? 'active' : '') + '" aria-pressed="' + (value === 'shop') + '">Guest pays at shop</button></div>';
  }
  function setSeg(seg, value) { ui.$$('button', seg).forEach(function (x) { const on = x.dataset.value === value; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); }); }

  /** Guests this member has brought before (newest first, one per name), so a regular guest is one tap to add again. */
  function recentGuests(me) {
    const seen = {}, out = [];
    S.all('teeTimes').filter(function (t) { return t.status !== 'cancelled'; })
      .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); })
      .forEach(function (t) {
        (t.players || []).forEach(function (p) {
          if (p.type !== 'guest' || p.hostId !== me.id || !p.phone || !p.email) return;
          const k = p.name.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(p);
        });
      });
    return out.slice(0, 5);
  }

  /** Guest details in a small sheet: name, phone and email (required, for the golf shop), handicap (optional), who pays. */
  function pickGuest(me, done) {
    const recent = recentGuests(me);
    const field = function (id, label, attrs, hint) {
      return '<div class="tt-gf"><label class="pk-label" for="' + id + '">' + label + '</label><input id="' + id + '" class="input" ' + attrs + '>' + (hint ? '<span class="tt-gf-hint">' + hint + '</span>' : '') + '</div>';
    };
    const sh = Portal.openSheet({ title: 'Add a guest', size: 'full',
      content: '<div class="tt-guest">' +
        (recent.length ? '<div class="tt-g-recent"><span class="pk-label">Guests you have brought before</span><div class="ps-list">' + recent.map(function (g, i) {
          return '<button type="button" class="ps-row" data-recent="' + i + '"><span class="ps-row-main"><span class="ps-row-label">' + esc(g.name) + '</span><span class="ps-row-sub">' + esc(g.phone + ' · ' + g.email) + '</span></span>' + Club.icon('plus', 'tt-go') + '</button>';
        }).join('') + '</div><p class="tt-g-or">Or a new guest</p></div>' : '') +
        '<div class="tt-gf-row">' +
          field('tt-g-first', 'First name', 'maxlength="30" autocomplete="off"') +
          field('tt-g-last', 'Last name', 'maxlength="30" autocomplete="off"') +
        '</div>' +
        field('tt-g-phone', 'Mobile phone', 'type="tel" maxlength="24" autocomplete="off" placeholder="204-555-0123"') +
        field('tt-g-email', 'Email', 'type="email" maxlength="80" autocomplete="off" placeholder="name@example.com"', 'For the golf shop to confirm the tee time.') +
        field('tt-g-hcp', 'Handicap index <span class="tt-opt">(optional)</span>', 'inputmode="decimal" maxlength="5" autocomplete="off" placeholder="e.g. 14.2"') +
        '<div class="tt-gf"><span class="pk-label" id="tt-g-pays-l">Who pays</span>' + paysSeg('tt-g-pays', 'host', 'aria-labelledby="tt-g-pays-l"') +
          '<span class="tt-gf-hint tt-g-payhint">The guest’s green fee is posted to your account at check-in.</span></div>' +
      '</div>',
      footer: '<button type="button" class="btn btn-primary tt-full" data-act="guest-ok">Add guest</button>' });
    const $ = function (id) { return ui.$('#' + id, sh.body); };
    const pays = $('tt-g-pays'); pays.value = 'host';
    ui.on(pays, 'click', 'button', function (e, btn) {
      pays.value = btn.dataset.value; setSeg(pays, pays.value);
      ui.$('.tt-g-payhint', sh.body).textContent = pays.value === 'shop' ? 'Your guest pays their green fee at the golf shop when they check in.' : 'The guest’s green fee is posted to your account at check-in.';
    });
    function err(inp, msg) { inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true'); inp.insertAdjacentHTML('afterend', '<span class="field-error">' + msg + '</span>'); }
    function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
    function ok() {
      ui.$$('.field-error', sh.body).forEach(function (e) { e.remove(); });
      ui.$$('.invalid', sh.body).forEach(function (e) { e.classList.remove('invalid'); e.removeAttribute('aria-invalid'); });
      const first = clean($('tt-g-first').value), last = clean($('tt-g-last').value), phone = clean($('tt-g-phone').value), email = clean($('tt-g-email').value), hcpRaw = clean($('tt-g-hcp').value);
      const bad = [];
      if (!first) { err($('tt-g-first'), 'Please enter a first name.'); bad.push($('tt-g-first')); }
      if (!last) { err($('tt-g-last'), 'Please enter a last name.'); bad.push($('tt-g-last')); }
      if ((phone.match(/\d/g) || []).length < 10) { err($('tt-g-phone'), 'Please enter a 10-digit phone number.'); bad.push($('tt-g-phone')); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err($('tt-g-email'), 'Please enter a valid email address.'); bad.push($('tt-g-email')); }
      let hcp = null;
      if (hcpRaw) {
        const plus = /^\+/.test(hcpRaw), n = parseFloat(hcpRaw.replace(/^\+/, ''));
        if (isNaN(n) || n > 54 || n < 0 || !/^\+?\d{1,2}(\.\d)?$/.test(hcpRaw)) { err($('tt-g-hcp'), 'Use a handicap index like 14.2, or +1.5 for a plus handicap.'); bad.push($('tt-g-hcp')); }
        else hcp = plus ? -n : n;
      }
      if (bad.length) { bad[0].focus(); return; }
      sh.close(); done({ name: first + ' ' + last, phone: phone, email: email, handicap: hcp, pays: pays.value === 'shop' ? 'shop' : 'host' });
    }
    ui.on(sh.body, 'click', '[data-recent]', function (e, b) {
      const g = recent[+b.dataset.recent];
      sh.close(); done({ name: g.name, phone: g.phone, email: g.email, handicap: g.handicap != null ? g.handicap : null, pays: g.pays === 'shop' ? 'shop' : 'host' });
    });
    ui.$('[data-act=guest-ok]', sh.foot).addEventListener('click', ok);
    sh.body.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ok(); } });
    sh.body.addEventListener('input', function (e) { const f = e.target.closest('.tt-gf'); if (!f) return; e.target.classList.remove('invalid'); e.target.removeAttribute('aria-invalid'); const er = ui.$('.field-error', f); if (er) er.remove(); });
  }

  /** Why a member cannot be added at this date and time ('' when they can): play times, booking window, overlap. */
  function blockReason(m, date, time, excludeId, ballot) {
    if (!date || !time) return '';
    if (ballot) {   /* a ballot entry: play times at the preferred time, and one ballot entry a day */
      if (tierRules(m).golf) { const play = canPlay(m, date, time); if (!play.ok) return play.reason; }
      const other = BL() ? BL().entryFor(m.id, date) : null;
      return other && other.id !== ballot.entryId ? 'Already in a ballot entry that day.' : '';
    }
    if (tierRules(m).golf) { // social members play by invitation, like a guest
      const play = canPlay(m, date, time); if (!play.ok) return play.reason;
      const win = windowOpen(m, date); if (!win.ok) return win.reason;
    }
    if (clashFor(m.id, date, time, excludeId)) return 'Already has a round close to this time.';
    return '';
  }

  /** Searchable member list in a sheet: names only. Members who cannot play then are listed last with the reason. */
  function pickMember(model, me, ctx, done) {
    const taken = {}; (model.existing || []).concat(model.players).forEach(function (p) { if (p.memberId) taken[p.memberId] = 1; });
    /* Members can only add their friends (Friends page); anyone else comes as a guest. */
    const friends = {}; (Portal.friends ? Portal.friends.friendsOf(me.id) : []).forEach(function (id) { friends[id] = 1; });
    const pool = S.all('members').filter(function (m) { return m.id !== me.id && friends[m.id] && !taken[m.id] && (m.status === 'active' || m.status === 'leave'); })
      .sort(function (a, b) { return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName); })
      .map(function (m) { return { m: m, why: blockReason(m, ctx.date, ctx.time, ctx.excludeId, ctx.ballot) }; })
      .sort(function (a, b) { return (a.why ? 1 : 0) - (b.why ? 1 : 0); });
    const sh = Portal.openSheet({ title: 'Add a friend', size: 'full',
      content: '<div class="tt-find"><div class="tt-find-search">' + Club.icon('search') + '<input type="search" class="input" placeholder="Search your friends" aria-label="Search your friends by name" autocomplete="off"></div><div class="tt-find-list"></div></div>' });
    const list = ui.$('.tt-find-list', sh.body), input = ui.$('input', sh.body);
    function draw(q) {
      const rows = pool.filter(function (r) { const m = r.m; return !q || (m.firstName + ' ' + m.lastName).toLowerCase().indexOf(q) >= 0 || (m.lastName + ' ' + m.firstName).toLowerCase().indexOf(q) >= 0; });
      list.innerHTML = rows.length ? '<div class="ps-list">' + rows.slice(0, 80).map(function (r) {
        const m = r.m; const nm = m.firstName + ' ' + m.lastName;
        return '<button type="button" class="ps-row tt-find-row" data-id="' + esc(m.id) + '"' + (r.why ? ' disabled aria-disabled="true"' : '') + '><span class="ps-row-main"><span class="ps-row-label">' + esc(nm) + '</span>' + (r.why ? '<span class="ps-row-sub">' + esc(r.why) + '</span>' : '') + '</span>' + (r.why ? '' : Club.icon('plus', 'tt-go')) + '</button>';
      }).join('') + '</div>' : '<p class="tt-hint tt-find-empty">' + (!pool.length
        ? 'Only your friends can be added to a booking. Add friends on the <a href="#/friends">Friends</a> page, or bring your companion as a guest.'
        : 'No friends match that name. Anyone else can come as a guest.') + '</p>';
    }
    draw('');
    input.addEventListener('input', function () { draw(input.value.trim().toLowerCase()); });
    ui.on(list, 'click', 'button.tt-find-row', function (e, b) {
      const m = Club.members.get(b.dataset.id); if (!m) return;
      const why = blockReason(m, ctx.date, ctx.time, ctx.excludeId, ctx.ballot);
      if (why) { ui.toast(m.firstName + ' ' + m.lastName + ' cannot play at this time', 'bad'); draw(input.value.trim().toLowerCase()); return; }
      sh.close(); done(m); ui.toast(m.firstName + ' ' + m.lastName + ' added to your group');
    });
  }

  /* ---------------- Validation shared by new bookings, joins and changes ---------------- */
  function validateMembers(players, date, time, excludeId, me, list, holes) {
    const errs = [];
    players.forEach(function (p) {
      if (p.type !== 'member' || !p.memberId) return;
      const m = Club.members.get(p.memberId);
      const self = p.memberId === me.id;
      if (!m || m.status === 'resigned') { errs.push(playerName(p) + ' is no longer a member. Please remove them from the group.'); return; }
      if (m.status === 'suspended') { errs.push(self ? 'Your golf privileges are currently paused.' : playerName(p) + ' is unable to play at present. Please remove them or add a guest instead.'); return; }
      const c = clashFor(p.memberId, date, time, excludeId, list, holes);
      if (c) errs.push(self ? 'You are already playing at ' + fmt.time(c.time) + ' that day.' : playerName(p) + ' already has a round close to this time. Please choose another companion or time.');
      // Each member in the group must be allowed at this time under their own category (Club.teeRules).
      // Social members have no golf rules of their own: they play by invitation, like a guest.
      if (!self && !tierRules(m).golf) return;
      const play = canPlay(m, date, time);
      if (!play.ok) errs.push(self ? 'This time is outside your play times. ' + play.reason : playerName(p) + ' cannot play at ' + fmt.time(time) + '. ' + play.reason);
      const win = windowOpen(m, date);
      if (!win.ok) errs.push(self ? win.reason : playerName(p) + ' cannot be booked for this date yet. ' + win.reason);
    });
    return errs;
  }

  /* ======================================================================
     Page
     ====================================================================== */
  const PERIODS = [
    { id: 'morning', label: 'Morning', word: 'morning', test: function (x) { return x < 660; } },
    { id: 'midday', label: 'Midday', word: 'midday', test: function (x) { return x >= 660 && x < 840; } },
    { id: 'afternoon', label: 'Afternoon', word: 'afternoon', test: function (x) { return x >= 840; } }
  ];
  function periodOf(t) { const m = toMin(t); return (PERIODS.find(function (p) { return p.test(m); }) || PERIODS[0]).id; }
  function shortDay(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

  /* ---------------- One set of checks for every booking: the Book flow, joins and the Friends page ----------------
     ctx: { date, time, joinId|null, existing: players already in the group as the member last saw them, players: the
     people being added (the member first), skipStored: true for display-only checks }.
     Same checks in the same order the Book flow has always used. Returns { ok, code, errs, again, reload, target, existing }. */
  function checkBooking(m, ctx) {
    const d = ctx.date, t = ctx.time, td = today();
    const no = function (code, errs, o) { return Object.assign({ ok: false, code: code, errs: errs, existing: ctx.existing }, o || {}); };
    // 1. The booking window, closed course and blocks, as the staff sheet sees them now.
    const win = windowOpen(m, d);
    if (!win.ok) return no('locked', [win.reason], { again: true, opensOn: win.opensOn });
    const play = canPlay(m, d, t);
    if (!play.ok) return no('rule', ['This time is outside your play times. ' + play.reason], { again: true });
    if (d < td || (d === td && toMin(t) <= nowMin())) return no('past', ['That tee time has just passed. Please choose a later time.'], { again: true });
    if (d === td && courseStatus().open === false) return no('closed', ['The course has closed for today. Please choose another day.'], { again: true });
    const blk = blockAt(blocksOn(d), d, t);
    if (blk) return no('blocked', [fmt.time(t) + ' has just been reserved for ' + String(blk.reason || 'club use').toLowerCase() + '.'], { again: true });
    if (m.status === 'suspended' || !canGolf(m)) return no('member', ['Online booking is not available on your membership. Please call the golf shop on ' + Club.info.phone + '.']);
    const stand = standingOf(m.id); if (!stand.ok) return no('standing', [stand.reason]);
    // 2. Re-check the slot in memory and in storage (another device or the golf shop may have just taken it).
    const sameSlot = function (list) { return (list || []).filter(function (x) { return x.date === d && x.time === t && x.status !== 'cancelled'; }); };
    const memNow = sameSlot(S.all('teeTimes'));
    if (!ctx.skipStored) {
      const stored = storedTeeTimes(); const stNow = stored ? sameSlot(stored) : [];
      if (stNow.some(function (x) { const mx = S.find('teeTimes', x.id); return !mx || mx.status === 'cancelled' || (x.players || []).length > (mx.players || []).length; }))
        return no('stale', ['Someone booked ' + fmt.time(t) + ' a moment ago. Refresh to see the latest tee times.'], { reload: true });
    }
    let target = null, existing = ctx.existing || [];
    if (ctx.joinId) {
      target = S.find('teeTimes', ctx.joinId);
      if (!target || target.status !== 'booked' || target.date !== d || target.time !== t) return no('changed', ['This group has changed since you chose it. Please choose another time.'], { again: true });
      if ((target.players || []).length !== existing.length) {
        const left = 4 - (target.players || []).length;
        existing = (target.players || []).map(function (p) { return Object.assign({}, p); });
        if (left < ctx.players.length) return no('full', [left > 0 ? 'Another player has just joined this group. There ' + (left === 1 ? 'is now 1 spot' : 'are now ' + left + ' spots') + ' left.' : 'This tee time has just filled.'], { again: true, existing: existing });
      }
    } else if (memNow.length) return no('taken', ['Someone booked ' + fmt.time(t) + ' a moment ago. Please choose another time.'], { again: true });
    if (existing.length + ctx.players.length > 4) return no('full', ['A group can have at most four players.'], { existing: existing });
    const held = Club.holds ? Club.holds.heldByOthers(d, t) : 0;
    if (held && existing.length + held + ctx.players.length > 4) return no('held', ['Another golfer is completing a booking at ' + fmt.time(t) + '. Please choose another time, or try again in a few minutes.'], { again: true, existing: existing });
    // 3. Member rules: suspended players and overlapping rounds, exactly as the staff form checks.
    /* A join plays the group's length; a new booking the length chosen. */
    const jt = ctx.joinId ? S.find('teeTimes', ctx.joinId) : null;
    const errs = validateMembers(ctx.players, d, t, null, m, undefined, jt ? jt.holes : ctx.holes);
    if (ctx.players.some(function (p) { return p.type === 'guest' && !p.name; })) errs.push('Please enter a name for each guest.');
    const gp = guestProblem(existing.filter(function (p) { return p.hostId === m.id; }).concat(ctx.players), m.id, d, t, m.id); if (gp) errs.push(gp);   /* Member Guest Policy */
    /* 4. A friends league chosen for the member's own round: it must still be able to take this round. */
    const mine = ctx.players.find(function (p) { return p.memberId === m.id; });
    if (mine && mine.friendLeagueId) {
      const lc = leagueCheck(m.id, mine.friendLeagueId, d, jt ? jt.holes : ctx.holes, null);
      if (!lc.ok) errs.push(lc.msg);
    }
    if (errs.length) return no('players', errs, { existing: existing });
    return { ok: true, code: 'open', errs: [], target: target, existing: existing };
  }
  /** Can the member's round on `date` still count toward league `id`? { ok, msg } (msg names the league and why not). */
  function leagueCheck(mid, id, date, holes, excludeId) {
    const lg = FL() && FL().get(id);
    if (!lg) return { ok: false, msg: 'That friends league is no longer running. Please choose again.' };
    const c = FL().canCount(lg, mid, date, +holes || 18, excludeId || null);
    return c.ok ? { ok: true, msg: '' } : { ok: false, msg: 'This round cannot count toward ' + lg.name + '. ' + c.reason + '.' };
  }
  /** A guest's contact details for the golf shop: phone, email and optional handicap index. */
  function guestContact(o, p) {
    if (p.phone) o.phone = p.phone;
    if (p.email) o.email = p.email;
    if (typeof p.handicap === 'number') o.handicap = p.handicap;
    return o;
  }
  /** Write a checked booking: a new tee time, or the new players appended to the group. Guests carry the member who
      brought them (hostId), so the staff sheet labels them and posts their fees to that member. */
  /** A player's add-ons priced for the round (18 or 9 holes); items for add-ons since removed keep their price. */
  function repriceAdds(items, holes) {
    if (!items || !items.length) return undefined;
    return items.map(function (x) { const a = Club.addons && Club.addons.get(x.addonId); return a ? Club.addons.item(a, x.qty, holes) : Object.assign({}, x); });
  }
  function commitBooking(m, chk, ctx) {
    const d = ctx.date, t = ctx.time;
    const holes = chk.target ? chk.target.holes : ctx.holes;
    const party = ctx.players.map(function (p) {
      const o = { memberId: p.type === 'member' ? p.memberId : null, name: p.type === 'member' ? playerName(p) : p.name, type: p.type, cart: noCarts(d) ? false : !!p.cart, paid: false };
      const ad = repriceAdds(p.addons, holes); if (ad) o.addons = ad;
      if (p.type === 'guest') { o.hostId = p.hostId || m.id; o.pays = p.pays === 'shop' ? 'shop' : 'host'; guestContact(o, p); }
      if (p.type === 'member' && p.memberId !== m.id && chk.target) o.addedBy = m.id;
      if (p.type === 'member' && p.memberId === m.id && p.friendLeagueId) o.friendLeagueId = p.friendLeagueId;   /* checked in checkBooking */
      return o;
    });
    const note = String(ctx.notes || '').trim();
    if (chk.target) {
      const combined = [chk.target.notes, note ? m.lastName + ': ' + note : ''].filter(Boolean).join(' · ');
      return S.update('teeTimes', chk.target.id, { players: (chk.target.players || []).concat(party), notes: combined });
    }
    return S.insert('teeTimes', { date: d, time: t, holes: ctx.holes, players: party, status: 'booked', notes: note, eventId: null, startedAt: null, finishedAt: null, bookedBy: m.id, source: 'portal' });
  }

  /* ---------------- Shared hook: joining a friend's group (used by js/portal/friends.js) ----------------
     The same checkBooking and commitBooking as the Book flow, and My tee times' Withdraw. */
  const JOIN_REASON = { locked: null, rule: 'Outside your play times', past: 'Already teed off', closed: 'Course closed today', blocked: 'Reserved for club use',
    member: 'Not available on your membership', standing: 'Booking paused on your account', full: 'Full', changed: 'Already teed off', stale: 'Just changed', taken: 'Full' };
  function joinState(m, tt) {
    if (!tt) return { ok: false, code: 'gone', reason: 'No longer available' };
    if (isIn(tt, m.id)) return { ok: false, code: 'mine', reason: 'You’re in' };
    if (tt.status !== 'booked') return { ok: false, code: 'past', reason: 'Already teed off' };
    const self = { memberId: m.id, name: m.firstName + ' ' + m.lastName, type: 'member' };
    const c = checkBooking(m, { date: tt.date, time: tt.time, joinId: tt.id, existing: (tt.players || []).slice(), players: [self], skipStored: true });
    if (c.ok) return { ok: true, code: 'open', reason: '', places: 4 - (tt.players || []).length };
    if (c.code === 'locked') return { ok: false, code: 'locked', reason: c.opensOn ? 'Opens to you ' + fmt.dateShort(c.opensOn) : 'Not open to you yet', opensOn: c.opensOn, detail: c.errs[0] };
    if (c.code === 'players') { const cl = clashFor(m.id, tt.date, tt.time, null); return cl ? { ok: false, code: 'clash', reason: 'You’re already playing at ' + fmt.time(cl.time), clash: cl, detail: c.errs[0] } : { ok: false, code: 'member', reason: 'Not available to you', detail: c.errs[0] }; }
    return { ok: false, code: c.code, reason: JOIN_REASON[c.code] || 'Not available', detail: c.errs[0] };
  }
  function joinCtx(m, ttId, opts) {
    const tt = S.find('teeTimes', ttId);
    if (!tt) return { ok: false, errs: ['This tee time is no longer available.'] };
    if (isIn(tt, m.id)) return { ok: false, errs: ['You are already in this group.'] };
    const self = { memberId: m.id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: !!opts.cart };
    if (Array.isArray(opts.addons) && opts.addons.length) self.addons = opts.addons;   /* the joiner's own add-ons (editor with addons: true) */
    if (opts.friendLeagueId) self.friendLeagueId = opts.friendLeagueId;   /* the joiner's friends league (editor with league: true) */
    const players = [self].concat((opts.players || []).filter(function (p) { return p.memberId !== m.id; }));
    const ctx = { date: tt.date, time: tt.time, joinId: tt.id, existing: opts.existing || (tt.players || []).slice(), players: players, holes: tt.holes, notes: '' };
    const c = checkBooking(m, ctx);
    return c.ok ? { ok: true, chk: c, ctx: ctx } : { ok: false, errs: c.errs, code: c.code };
  }
  Portal.teeTimes = {
    joinState: function (m, ttId) { return joinState(m, S.find('teeTimes', ttId)); },
    cartDefault: function (m, date) { if (noCarts(date)) return false; const pr = (m.preferences || {}).cart; return Portal.prefs.get('tt.cart', pr ? pr === 'Cart' : true); },
    noCarts: noCarts,
    /** The Book flow's player editor (rows, walk or cart, add a member or guest, fees) for another page's sheet. Add-ons are
        off unless opts.addons is true: then pass the joiner's picks to join as opts.addons (model.players[0].addons).
        The friends league choice is off unless opts.league is true: then pass it to join as opts.friendLeagueId
        (model.players[0].friendLeagueId). */
    editor: function (root, model, opts) { return groupEditor(root, model, Object.assign({}, opts, { addons: !!(opts && opts.addons === true), league: !!(opts && opts.league === true) })); },
    /** Leagues a round could count toward: [{ league, check }] (Club.friendLeagues.countableFor). */
    leaguesFor: leaguesFor,
    /** Add member m, plus anyone they bring (opts.players), to the existing group. All or nothing. { ok, errs, doc } */
    join: function (m, ttId, opts) {
      opts = opts || {};
      const r = joinCtx(m, ttId, opts); if (!r.ok) return r;
      const doc = commitBooking(m, r.chk, r.ctx);
      if (!opts.noPrefs && !noCarts(r.ctx.date)) Portal.prefs.set('tt.cart', !!opts.cart);
      return { ok: true, errs: [], doc: doc };
    },
    /** The same checks as join, without writing anything (used before sending a request to join). { ok, errs, code } */
    check: function (m, ttId, opts) { const r = joinCtx(m, ttId, opts || {}); return r.ok ? { ok: true, errs: [] } : r; },
    /** Players who leave with member m: m and the guests m brought (members m added stay). */
    leavingWith: function (m, ttId) { const tt = S.find('teeTimes', ttId); return tt ? (tt.players || []).filter(function (p) { return p.memberId === m.id || (p.type === 'guest' && p.hostId === m.id); }) : []; },
    /** Withdraw member m (and their guests) from a group they joined. The group keeps its tee time. { ok, reason } */
    withdraw: function (m, ttId) {
      const tt = S.find('teeTimes', ttId);
      if (!tt || tt.status !== 'booked' || !isIn(tt, m.id)) return { ok: false, reason: 'This tee time has changed. Please check with the golf shop.' };
      if (minutesUntil(tt) < CUTOFF_MIN) return { ok: false, reason: 'Changes close two hours before play. Please call the golf shop on ' + Club.info.phone + '.' };
      if (managerOf(tt) === m.id) return { ok: false, reason: 'You booked this tee time. Manage it in My tee times.' };
      const rest = (tt.players || []).filter(function (p) { return p.memberId !== m.id && !(p.type === 'guest' && p.hostId === m.id); });
      if (!rest.some(function (p) { return p.type === 'member' && p.memberId; })) S.update('teeTimes', tt.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      else S.update('teeTimes', tt.id, { players: rest });
      if (Club.waitlist) Club.waitlist.released(tt.date, tt.time, 'a member withdrew');   // the freed spot goes to the waitlist
      syncPromoRecord(S.find('teeTimes', tt.id), m);
      return { ok: true, reason: '' };
    },
    downloadIcs: downloadIcs
  };

  let kept = null;   /* the last render's choices, for background redraws */
  Portal.register({
    id: 'tee-times', label: 'Tee times', short: 'Tee times', icon: 'flag', order: 10, tab: true,
    render: function (view, params, member) {
      const me = Portal.member() || member;
      if (BL()) BL().runDue();   /* a ballot draw whose time has passed runs now (once; js/shared/ballot-data.js) */
      const cs = courseStatus(); const st = settings();
      const td = today();
      const startTab = params[0] === 'mine' ? 'mine' : 'book';
      const wantDate = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || '') && params[0] >= td && stripDays(me).indexOf(params[0]) >= 0 ? params[0] : null;
      let uidN = 0, pastShown = 10, dp = null;
      /* #/tee-times/<date>/<HH:MM>/<players>: a waitlist notice's Book link selects that time. */
      let wantTime = wantDate && /^\d{2}:\d{2}$/.test(params[1] || '') ? params[1] : null;

      /* Remembered defaults: this member's last booking (prefs), else their most recent tee time in the store. */
      const lastTT = S.where('teeTimes', function (t) { return t.bookedBy === me.id && t.status !== 'cancelled'; }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); })[0];
      const state = {
        date: wantDate || null, time: null, joinId: null, period: null, showAll: false, model: null,
        players: Math.max(1, Math.min(4, +Portal.prefs.get('tt.players', lastTT ? (lastTT.players || []).filter(function (p) { return !isPublic(p); }).length : 1) || 1)),
        holes: +Portal.prefs.get('tt.holes', lastTT ? lastTT.holes : 18) === 9 ? 9 : 18
      };
      if (wantTime && +params[2] >= 1 && +params[2] <= 4) state.players = +params[2];
      /* A background redraw (another tab saved, new weather) keeps the day, period and party the member had chosen. */
      if (Portal.background && Portal.background() && kept && kept.member === me.id) {
        ['date', 'period', 'showAll', 'players', 'holes'].forEach(function (k) { state[k] = kept.state[k]; });
      }
      kept = { member: me.id, state: state };
      function cartPref(m) {
        if (noCarts(state.date)) return false;
        if (m.preferences && m.preferences.cart) return m.preferences.cart === 'Cart';
        return !!Portal.prefs.get('tt.cart', false);
      }

      /* ---- Course status: one line that opens today's conditions ---- */
      const ci = cartInfo(cs.cartRule);
      const speed = parseFloat(cs.greenSpeed);
      const greens = cs.greenSpeed ? cs.greenSpeed + (isNaN(speed) ? '' : speed >= 10.5 ? ' (fast)' : speed >= 9 ? ' (medium)' : ' (slow)') : 'Not posted';
      const tile = function (k, v, sub) { return '<div class="tt-tile"><span class="tt-tile-k">' + esc(k) + '</span><span class="tt-tile-v">' + esc(v) + '</span>' + (sub ? '<span class="tt-tile-s">' + esc(sub) + '</span>' : '') + '</div>'; };
      const statusTitle = cs.open === false ? 'Course closed today' : 'Course open · First tee ' + fmt.time(st.first) + ' · ' + ci.label;
      const statusBody = '<div class="tt-tiles">' + tile('Carts', ci.short) + tile('Greens', greens) + tile('Pins', cs.pins || 'Not posted') + tile('Conditions', cs.firmness || 'Not posted') + '</div>' +
        (ci.text ? '<p class="tt-cond-note"><span class="tt-cond-k">' + esc(ci.title) + ':</span> ' + esc(ci.text) + '</p>' : '') +
        (cs.message ? '<p class="tt-cond-note"><span class="tt-cond-k">From the grounds crew:</span> ' + esc(cs.message) + '</p>' : '');

      view.innerHTML =
        '<section class="p-hero tt-hero">' +
          '<h1>Tee times</h1>' +
          Portal.accordion({ id: 'tt-status', icon: 'course', title: statusTitle, body: statusBody }) +
        '</section>' +
        '<div class="wl-host"></div>' +
        '<div class="bl-host"></div>' +
        '<div class="tt-tabs"></div>';

      const tabsHost = ui.$('.tt-tabs', view);
      const tabs = ui.tabs(tabsHost, [
        { id: 'book', label: 'Book', render: renderBook },
        { id: 'mine', label: 'My tee times', render: renderMine }
      ], startTab, function (id) {
        /* A link to a date (a waitlist notice) keeps the date in the address on first render, so a background redraw
           (new weather) shows the same day; the time is dropped once it has been selected. */
        const keep = id === 'book' && !tabsHost.dataset.ready && wantDate && state.date ? '/' + state.date : '';
        try { history.replaceState(null, '', '#/tee-times' + (id === 'mine' ? '/mine' : keep)); } catch (e) { /* file:// */ }
        tabsHost.dataset.ready = '1';
      });
      refreshTabCount();
      paintWl();
      paintBallot();
      if (Portal.waitlist) Portal.waitlist.wire(view, me, function () { paintWl(); rerenderMine(); refreshBook(false); });
      const offHolds = Club.holds ? Club.holds.subscribe(function () { if (!document.body.classList.contains('ps-open')) refreshBook(false); }) : null;

      /* Waitlist notices (a spot opened) sit above the tabs, js/portal/waitlist.js. */
      function paintWl() { const h = ui.$('.wl-host', view); if (h) h.innerHTML = Portal.waitlist ? Portal.waitlist.noticesHTML(Portal.member() || me) : ''; }
      function openWl(o) {
        if (!Portal.waitlist) return;
        Portal.waitlist.open(Portal.member() || me, Object.assign({ date: state.date, players: state.players }, o), function () { paintWl(); refreshBook(false); });
      }

      function refreshTabCount() {
        const b = ui.$('.tab[data-tab=mine]', tabsHost); if (!b) return;
        const n = upcoming(me).length;
        b.textContent = 'My tee times' + (n ? ' (' + n + ')' : '');
        b.setAttribute('aria-label', 'My tee times' + (n ? ', ' + plural(n, 'upcoming booking') : ''));
      }

      /* ======================= Book ======================= */
      function renderBook(panel) {
        const m = Portal.member() || me;
        if (m.status === 'suspended') {
          panel.innerHTML = '<div class="panel tt-notice">' + ui.empty({ icon: 'key', title: 'Your golf privileges are paused', text: 'Your membership is suspended, so you can’t book online. Please call the membership office to restore your account.', action: '<a class="btn btn-primary" href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + Club.icon('phone') + '<span>Call ' + esc(Club.info.phone) + '</span></a>' }) + '</div>';
          return;
        }
        if (!canGolf(m)) { panel.innerHTML = socialHTML(m); return; }
        const RT = (TR() && TR().RATES) || { weekday: st.guestFee, weekend: st.guestFee, twilight: st.guestFee };
        const stand = standingOf(m.id);
        panel.innerHTML = '<div class="tt-book">' +
          (stand.ok ? '' : '<p class="tt-hint tt-rule bl-standing" role="note">' + Club.icon('alert') + '<span>' + esc(stand.reason) + '</span></p>') +
          '<section class="tt-card">' +
            '<div class="tt-date"></div>' +
            '<div class="tt-grp-row"><div class="tt-players"></div><div class="tt-holes"><span class="pk-label" id="tt-holes-l">Holes</span>' +
              ui.segmented([{ value: '18', label: '18' }, { value: '9', label: '9' }], String(state.holes), 'tt-holes') + '</div></div>' +
            '<div class="tt-rules-host"></div>' +
          '</section>' +
          '<section class="tt-times-card" aria-label="Times"><div class="tt-times"></div></section>' +
          '<div class="tt-more">' +
            Portal.accordion({ id: 'tt-course', icon: 'flag', title: 'Course and fees', summary: (teeLine() ? teeLine().split(' · ')[0] + ' · ' : '') + 'Guests from ' + fmt.money(Math.min(RT.weekday, RT.weekend, RT.twilight)),
              body: (teeLine() ? '<p class="tt-cond-note">' + esc(teeLine()) + '</p>' : '') +
                '<ul class="tt-kv-list"><li><span>Guest, weekdays</span><span class="num">' + fmt.money(RT.weekday) + '</span></li><li><span>Guest, weekends and holidays</span><span class="num">' + fmt.money(RT.weekend) + '</span></li><li><span>Guest, after 5:30 PM</span><span class="num">' + fmt.money(RT.twilight) + '</span></li><li><span>Cart, per rider</span><span class="num">' + fmt.money(st.cartFee) + '</span></li><li><span>9 holes</span><span>60% of the fee</span></li></ul>' +
                '<p class="tt-cond-note">Guest green fees go on the host member’s account at check-in.</p>' }) +
            Portal.accordion({ id: 'tt-know', icon: 'info', title: 'Good to know', summary: 'Change or cancel up to 2 hours before',
              body: '<ul class="tt-bullets"><li>You can change or cancel up to 2 hours before you play.</li><li>Check in at the golf shop 15 minutes before your tee time.</li><li>Members and guests must follow the dress code. Soft spikes only, on the course and in the clubhouse.</li></ul>' }) +
          '</div></div>';
        ui.$('.segmented[data-name=tt-holes]', panel).setAttribute('aria-labelledby', 'tt-holes-l');
        Portal.stepper(ui.$('.tt-players', panel), { label: 'Players', value: state.players, min: 1, max: 4, onChange: function (v) {
          state.players = v; Portal.prefs.set('tt.players', v);
          if (state.time) { const s = slotNow(); if (!s || !fits(s)) clearTime(); }
          refreshBook(false);
        } });
        mountDate(panel);
        if (wantTime) {
          const s = state.date === wantDate ? daySlots(state.date, m).find(function (x) { return x.time === wantTime; }) : null;
          if (s && fits(s)) pick(s, m); else ui.toast('That tee time is no longer available', 'bad');
        }
        wantTime = null;
        refreshBook(true);
      }

      function fits(s) { return bookable(s) && s.places >= state.players; }
      function slotNow() { const m = Portal.member() || me; return state.time ? daySlots(state.date, m).find(function (x) { return x.time === state.time; }) : null; }
      function allSums(m) { const days = stripDays(m); const sums = {}; days.forEach(function (d) { sums[d] = daySummary(d, m); }); return { days: days, sums: sums }; }
      function fitCount(sum, pid) { return sum.slots.filter(function (s) { return fits(s) && (!pid || periodOf(s.time) === pid); }).length; }
      function myTimes(sum) { return sum.slots.filter(function (s) { return s.state === 'mine'; }).map(function (s) { return s.time; }).sort(); }
      function pickerDays(days, sums) {
        return days.map(function (d) {
          const s = sums[d], n = fitCount(s), mt = myTimes(s);
          if (s.locked && s.locked.ballot) {   /* a ballot day before its draw */
            const en = BL().entryFor((Portal.member() || me).id, d);
            if (s.locked.ballot === 'before') return { date: d, meta: '', pill: '', disabled: true, reason: 'Ballot opens ' + shortDay(s.locked.opensOn) };
            return { date: d, meta: s.locked.ballot === 'due' ? 'Draw today' : 'Ballot', pill: en ? 'In the ballot' : '', disabled: false, reason: '' };
          }
          const reason = s.locked ? 'Not open yet' : s.closed ? 'Closed' : d === td && s.over ? 'No times left' : s.avail ? 'No times for ' + plural(state.players, 'player') : 'Fully booked';
          return { date: d, meta: n ? plural(n, 'time') : '', pill: mt.length ? 'Your tee time · ' + fmt.time(mt[0]) + (mt.length > 1 ? ' +' + (mt.length - 1) : '') : '', disabled: !!(s.locked || s.closed || !n), reason: reason };
        });
      }
      function dayNote(d, sum) {
        const wx = (Club.weather.forecast || []).find(function (w) { return w.date === d; });
        const n = fitCount(sum);
        const parts = [];
        if (wx) parts.push(Club.icon(wx.icon) + '<span>' + esc(wx.cond) + ', ' + String(wx.hi).replace('-', '−') + '°</span>');
        parts.push('<span>' + (sum.locked && sum.locked.ballot === 'open' ? 'Ballot · draw ' + esc(drawWhen(d)) : sum.locked ? 'Not open for booking yet' : sum.closed ? 'Course closed' : n ? plural(n, 'time') + ' available' : 'No times available') + '</span>');
        return parts.join('<span aria-hidden="true">·</span>');
      }
      function mountDate(panel) {
        const m = Portal.member() || me;
        const A = allSums(m), pd = pickerDays(A.days, A.sums);
        const ok = function (d) { return pd.some(function (x) { return x.date === d && !x.disabled; }); };
        if (!state.date || state.date < td || A.days.indexOf(state.date) < 0 || (!ok(state.date) && pd.some(function (x) { return !x.disabled; }))) state.date = (pd.find(function (x) { return !x.disabled; }) || pd[0]).date;
        dp = Portal.datePicker(ui.$('.tt-date', panel), { label: 'Date', title: 'Choose a date', value: state.date, days: pd, note: dayNote(state.date, A.sums[state.date]),
          onChange: function (iso) { setDate(iso); } });
      }
      function setDate(iso) {
        state.date = iso; clearTime(); state.period = null;
        if (dp && dp.value() !== iso) dp.set(iso);
        refreshBook(true);
      }
      /** Re-render the date note and options, the rules row and the times for the current state. */
      function refreshBook(resetPeriod) {
        const panel = ui.$('.tt-card', view); if (!panel) return;
        const m = Portal.member() || me;
        const A = allSums(m); const sum = A.sums[state.date];
        if (dp) dp.update({ days: pickerDays(A.days, A.sums), note: dayNote(state.date, sum), value: state.date });
        const rh = ui.$('.tt-rules-host', panel);
        const wasOpen = !!ui.$('.pk-acc.is-open', rh);
        rh.innerHTML = !sum.locked && !sum.closed ? rulesAcc(m, state.date, wasOpen) : '';
        if (resetPeriod || !state.period) {
          state.period = state.time ? periodOf(state.time) : ((PERIODS.find(function (p) { return fitCount(sum, p.id) > 0; }) || PERIODS[0]).id);
        }
        renderTimes(ui.$('.tt-times', view), sum, A.days, A.sums);
        showBar();
      }

      function windowsText(w) {
        if (!w || !w.length) return 'no times';
        return w.map(function (x) {
          if (x[0] === '00:00') return 'before ' + fmt.time(x[1]);
          if (x[1] === '23:59') return 'after ' + fmt.time(x[0]);
          return rangeLabel(fmt.time(x[0]), fmt.time(x[1]), '–');
        }).join(', ');
      }
      function rulesAcc(m, d, open) {
        const r = tierRules(m);
        const items = [];
        if (!r.windows) items.push('Your ' + esc(r.tierName) + ' membership plays any time, seven days a week.');
        else { items.push('Weekdays: ' + esc(windowsText(r.windows.weekday))); items.push('Weekends and holidays: ' + esc(windowsText(r.windows.weekend))); }
        blocksOn(d).forEach(function (b) { items.push(esc(rangeLabel(fmt.time(b.start), endLabel(b.end), '–')) + ': closed for ' + esc(lowerFirst(b.reason || 'club use'))); });
        items.push(esc(windowLine(m)));
        return Portal.accordion({ id: 'tt-rules', icon: 'info', title: 'Booking times for your membership', summary: r.tierName + ' · book ' + r.advanceDays + ' days ahead', open: open,
          body: '<ul class="tt-bullets">' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' });
      }

      function renderTimes(el, sum, days, sums) {
        const d = state.date;
        if (sum.locked && sum.locked.ballot) { el.innerHTML = ballotPanelHTML(d, sum.locked); return; }
        if (sum.locked) { el.innerHTML = '<div class="tt-state">' + ui.empty({ icon: 'calendar', title: 'Opens on ' + longDate(sum.locked.opensOn), text: sum.locked.reason }) + '</div>'; return; }
        if (sum.closed) { el.innerHTML = '<div class="tt-state">' + ui.empty({ icon: 'course', title: 'The course is closed today', text: (courseStatus().message || 'There is no play today.') + ' You can still book from tomorrow.', action: nextDayBtn(days, sums, d, null) }) + '</div>'; return; }
        const counts = {}; PERIODS.forEach(function (p) { counts[p.id] = fitCount(sum, p.id); });
        const p = PERIODS.find(function (x) { return x.id === state.period; }) || PERIODS[0];
        const all = sum.slots.filter(function (s) { return p.test(toMin(s.time)); });
        const shown = all.filter(function (s) { return state.showAll || fits(s) || s.state === 'mine'; });
        let chips;
        if (!counts[p.id] && !shown.some(function (s) { return s.state === 'mine'; }) && !state.showAll) {
          const nd = days.find(function (x) { return x > d && !sums[x].locked && !sums[x].closed && fitCount(sums[x], p.id) > 0; });
          chips = '<p class="tt-none">' + (all.length && all.every(function (s) { return s.state === 'past'; }) ? 'The ' + p.word + ' times have passed. ' : 'Nothing open in the ' + p.word + '. ') +
            (nd ? '<button type="button" class="p-link" data-act="pick-day" data-date="' + nd + '">Try ' + esc(shortDay(nd)) + ' →</button>' : '') +
            (all.some(function (z) { return wlSlot(z); }) ? '<button type="button" class="p-link" data-act="wl-join" data-window="' + p.id + '">Notify me if a spot opens</button>' : '') + '</p>';
        } else {
          const parts = []; let run = null;
          shown.forEach(function (s) {
            if (s.state === 'rule') { if (run) run.push(s); else { run = [s]; parts.push(run); } }
            else { run = null; parts.push(s); }
          });
          chips = '<div class="tt-chips">' + parts.map(function (x) { return Array.isArray(x) ? runHTML(x) : chipHTML(x); }).join('') + '</div>';
        }
        el.innerHTML =
          ballotResultHTML(d) +
          (state.notice ? '<p class="hold-ended" role="status">' + Club.icon('clock') + '<span>' + esc(state.notice) + '</span></p>' : '') +
          '<div class="segmented tt-periods" role="group" aria-label="Time of day">' + PERIODS.map(function (x) {
            const on = x.id === p.id;
            return '<button type="button" data-p="' + x.id + '" class="' + (on ? 'active' : '') + (counts[x.id] ? '' : ' is-empty') + '" aria-pressed="' + on + '"><span class="tt-per-l">' + x.label + '</span><span class="tt-per-n">' + counts[x.id] + ' open</span></button>';
          }).join('') + '</div>' +
          chips +
          (Club.holds && counts[p.id] ? '<p class="hold-note tt-hold-note">' + Club.icon('clock') + '<span>When you continue, the time is held for ' + Club.holds.MINUTES + ' minutes while you add your group.</span></p>' : '') +
          '<button type="button" class="p-link tt-showall" data-act="show-all">' + (state.showAll ? 'Show open times only' : 'Show all times') + '</button>' +
          wlDaysHTML(days, sums);
      }
      /** A tee time that is full for this group but could open up: a booked group, or too few places left. */
      function wlSlot(s, d) {
        if (!Portal.waitlist || !((s.state === 'full' && !!s.tt && s.tt.status === 'booked') || (bookable(s) && s.places < state.players))) return false;
        return !clashFor((Portal.member() || me).id, d || state.date, s.time, null);   /* not a time beside one of their own rounds */
      }
      /** Days the member can book that are full for their group: one line under the times with Notify me. */
      function wlDaysHTML(days, sums) {
        if (!Portal.waitlist) return '';
        const m = Portal.member() || me; const waiting = {};
        Club.waitlist.forPerson({ memberId: m.id }).forEach(function (e) { waiting[e.date] = 1; });
        const full = state.wlDays = days.filter(function (x) { const s = sums[x]; return !s.locked && !s.closed && !waiting[x] && !fitCount(s) && s.slots.some(function (z) { return wlSlot(z, x); }); });
        if (!full.length) return '';
        const names = full.slice(0, 3).map(shortDay).concat(full.length > 3 ? [plural(full.length - 3, 'more day')] : []);
        return '<p class="wl-full">' + Club.icon('bell') + '<span>' + esc(niceList(names) + (full.length === 1 ? ' is' : ' are') + ' fully booked' + (state.players > 1 ? ' for ' + state.players + ' players' : '') + '.') +
          ' <button type="button" class="p-link" data-act="wl-days">Notify me if a spot opens</button></span></p>';
      }
      function runHTML(run) {
        const fa = fmt.time(run[0].time), fb = fmt.time(run[run.length - 1].time);
        return '<div class="tt-chip-run" role="note"><span class="tt-run-t">' + esc(run.length === 1 ? fa : rangeLabel(fa, fb, '–')) + '</span> · Not available for your membership</div>';
      }
      function nextDayBtn(days, sums, from) {
        const nd = days.find(function (x) { return x > from && fitCount(sums[x]) > 0; });
        return nd ? '<button type="button" class="btn btn-primary btn-sm" data-act="pick-day" data-date="' + nd + '">' + esc('See ' + shortDay(nd)) + '</button>' : '';
      }
      function chipHTML(s) {
        const tp = timeParts(s.time);
        let sub = '', few = false;
        const ok = fits(s);
        if (s.state === 'mine') sub = 'Your tee time';
        else if (ok) { sub = spotsLeft(s.places); few = s.places <= 2; }
        else if (bookable(s)) sub = spotsLeft(s.places);
        else if (s.state === 'past') sub = 'Passed';
        else if (s.state === 'blocked') sub = 'Reserved';
        else if (s.state === 'clash') sub = 'Near your tee time';
        else if (s.state === 'closed') sub = 'Closed';
        else if (s.state === 'locked') sub = 'Not open yet';
        else if (s.state === 'held') sub = 'On hold';
        else if (s.state === 'ask') sub = 'Request to join';
        else if (s.state === 'private') sub = 'Private group';
        else sub = 'Full';
        const sel = s.time === state.time;
        const heads = Club.teeHeads && (ok || bookable(s) || s.state === 'mine' || s.state === 'full' || s.state === 'held');
        const wl = !ok && wlSlot(s);   /* full for this group: tap to join the waitlist (js/portal/waitlist.js) */
        if (wl && s.state === 'full') sub = 'Full · notify me';
        return '<button type="button" class="tt-chip st-' + s.state + (sel ? ' selected' : '') + (few ? ' is-few' : '') + (wl ? ' is-wl' : '') + '" data-time="' + s.time + '"' + (!ok && !wl && s.state !== 'mine' ? ' disabled' : '') +
          ' aria-pressed="' + sel + '" aria-label="' + esc(fmt.time(s.time) + ', ' + sub + (ok ? ', guest green fee ' + fmt.money(guestFee(state.date, s.time, barHoles18()), false) : '') + (s.reason ? '. ' + s.reason : '') + (wl ? '. Notify me if a spot opens' : '')) + '">' +
          '<span class="tt-chip-t">' + tp.t + '<small>' + tp.ap + '</small></span>' +
          (heads ? Club.teeHeads(4 - s.places) : '') +
          '<span class="tt-chip-p">' + esc(sub) + '</span>' +
          (ok ? '<span class="tt-chip-fee">Guest ' + esc(fmt.money(guestFee(state.date, s.time, barHoles18()), false)) + '</span>' : '') + '</button>';
      }

      function clearTime() { state.time = null; state.joinId = null; state.model = null; Portal.actionBar.hide(); }
      /** The card shows the guest fee for the holes chosen above (a group sets its own holes once joined). */
      function barHoles18() { return +state.holes === 9 ? 9 : 18; }
      function barHoles() { const s = slotNow(); return s && s.tt ? (s.tt.holes || 18) : state.holes; }
      function showBar() {
        if (!state.time || !ui.$('.tt-card', view)) { Portal.actionBar.hide(); return; }
        Portal.actionBar.show({
          summaryHTML: esc(shortDay(state.date)) + ' · ' + fmt.time(state.time) + '<small>' + esc(plural(state.players, 'player') + ' · ' + barHoles() + ' holes' + (state.joinId ? ' · joining a group' : '')) + '</small>',
          label: 'Continue', onClick: openBooking
        });
      }

      ui.on(view, 'click', '[data-act=pick-day]', function (e, b) { setDate(b.dataset.date); });
      ui.on(view, 'click', '.tt-periods button', function (e, b) {
        state.period = b.dataset.p;
        const m = Portal.member() || me; const A = allSums(m);
        renderTimes(ui.$('.tt-times', view), A.sums[state.date], A.days, A.sums);
        const nb = ui.$('.tt-periods button[data-p="' + state.period + '"]', view); if (nb) nb.focus();
      });
      ui.on(view, 'click', '[data-act=show-all]', function () {
        state.showAll = !state.showAll;
        const m = Portal.member() || me; const A = allSums(m);
        renderTimes(ui.$('.tt-times', view), A.sums[state.date], A.days, A.sums);
        const nb = ui.$('[data-act=show-all]', view); if (nb) nb.focus();
      });
      ui.on(view, 'click', '.segmented[data-name=tt-holes] button', function (e, b) {
        state.holes = +b.dataset.value; Portal.prefs.set('tt.holes', state.holes);
        ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        if (state.model && !state.joinId) state.model.holes = state.holes;
        refreshBook(false);
      });
      ui.on(view, 'click', '.tt-chip', function (e, b) {
        if (b.disabled) return;
        if (b.classList.contains('st-mine')) { tabs.activate('mine'); return; }
        if (b.classList.contains('is-wl')) { openWl({ time: b.dataset.time }); return; }
        const m = Portal.member() || me;
        const s = daySlots(state.date, m).find(function (x) { return x.time === b.dataset.time; });
        if (!s || !fits(s)) { ui.toast('That tee time is no longer available', 'bad'); refreshBook(false); return; }
        ui.$$('.tt-chip.selected', view).forEach(function (x) { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('selected'); b.setAttribute('aria-pressed', 'true');
        if (state.notice) { state.notice = null; const n = ui.$('.hold-ended', view); if (n) n.remove(); }
        pick(s, m);
        showBar();
      });
      ui.on(view, 'click', '[data-act=wl-join]', function (e, b) { openWl({ window: b.dataset.window }); });
      ui.on(view, 'click', '[data-act=wl-days]', function () { openWl({ date: null, days: state.wlDays || [] }); });
      /** Select a tee time on the Book tab: the member first, their usual cart choice. */
      function pick(s, m) {
        state.time = s.time; state.joinId = s.tt ? s.tt.id : null;
        state.model = {
          holes: s.tt ? (s.tt.holes || 18) : state.holes,
          notes: '',
          existing: s.tt ? (s.tt.players || []).map(function (p) { return Object.assign({}, p); }) : [],
          players: [{ memberId: m.id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: cartPref(m), paid: false }]
        };
      }

      /* ---- Continue: the group, notes, fees and Confirm in one sheet ---- */
      function joinNote() {
        if (!state.joinId) return '';
        const ex = state.model.existing;
        /* Names as the rest of the portal shows them to this member: friends in full, others as "Tom R." */
        const viewer = (Portal.member() || me).id;
        const members = ex.filter(function (p) { return p.type === 'member'; }).map(function (p) { return Portal.playerLabel ? Portal.playerLabel(p, viewer) : playerName(p); });
        const guests = ex.filter(function (p) { return p.type === 'guest'; }).length;
        const pubs = ex.filter(isPublic).length;
        const who = members.concat(guests ? [guests === 1 ? 'a guest' : guests + ' guests'] : []).concat(pubs ? [pubs === 1 ? 'a public golfer' : pubs + ' public golfers'] : []);
        return '<p class="tt-join">' + Club.icon('members') + '<span>You are joining ' + esc(niceList(who)) + (/\.$/.test(niceList(who)) ? '' : '.') + '</span></p>';   /* "Daniel B." already ends the sentence */
      }
      function openBooking() {
        const m = Portal.member() || me;
        const s = slotNow();
        if (!s || !fits(s) || (s.tt ? s.tt.id : null) !== state.joinId) { ui.toast('That tee time is no longer available', 'bad'); clearTime(); refreshBook(false); return; }
        if (!state.joinId) state.model.holes = state.holes;
        let booked = false, ended = false;
        const tp = timeParts(state.time);
        const H = Club.holds;
        const sh = Portal.openSheet({
          title: state.joinId ? 'Join this tee time' : 'Your tee time',
          content: '<div class="tt-sheet"><div class="tt-sum"><span class="tt-sum-t">' + tp.t + '<small>' + tp.ap + '</small></span><span class="tt-sum-d">' + esc(longDate(state.date)) + '<br>' + state.model.holes + ' holes' + (state.joinId ? ' (set by the group)' : '') + '</span></div>' +
            joinNote() + '<div class="tt-editor"></div><div class="tt-alert" role="alert" hidden></div></div>',
          footer: '<button type="button" class="btn btn-primary tt-full" data-act="confirm">' + (state.joinId ? 'Join this tee time' : 'Confirm tee time') + '</button>',
          onClose: function () {
            if (H) { H.stopTimer(); H.release(); }   /* closing without booking frees the time at once */
            if (booked) { clearTime(); state.period = null; const p = ui.$('.tt-card', view); if (p) refreshBook(true); }
            else if (ended) { clearTime(); refreshBook(false); }
          }
        });
        if (sh.duplicate) return;   /* a double tap: the sheet already open keeps its hold and countdown */
        const hold = H ? H.place({ date: state.date, time: state.time, places: s.places, source: 'portal' }) : null;
        if (hold) H.timer({ hold: hold, what: fmt.time(state.time) + ', ' + shortDay(state.date), onExpire: function () {
          if (booked) return;
          ended = true;
          state.notice = 'Your ' + H.MINUTES + '-minute hold on ' + fmt.time(state.time) + ' has ended, so the time was released for other golfers. Please choose a time again.';
          sh.close();
          ui.toast('Your hold on ' + fmt.time(hold.time) + ' has ended', 'bad');
        } });
        const editor = groupEditor(ui.$('.tt-editor', sh.body), state.model, {
          me: m, date: state.date, time: state.time, excludeId: state.joinId, uid: 'b' + (++uidN), target: state.players,
          allowGuests: true, promo: true, league: true,
          hostId: function () { return m.id; }   /* guests you bring are always yours, also when joining a group */
        });
        ui.on(sh.body, 'click', '[data-act=reload]', function () { location.reload(); });
        ui.on(sh.body, 'click', '[data-act=pick-again]', function () { sh.close(); clearTime(); refreshBook(false); });
        ui.$('[data-act=confirm]', sh.foot).addEventListener('click', function (e) {
          editor.validate();
          if (H && hold && !H.holding(hold.date, hold.time)) { fail(sh.body, ['Your hold on this time has ended. Please choose a time again.'], { again: true }); return; }
          /* The promo code may have reached its limit since it was applied (same check as the public site before paying). */
          const pb = editor.promo(); const pm = pb ? pb.recheck() : '';
          if (pm) { fail(sh.body, [pm]); return; }
          const res = book(sh.body, e.currentTarget);
          if (!res) { editor.league(); return; }
          booked = true;
          if (H) { H.stopTimer(); H.release(); }
          bookedView(sh, res.doc, res.joined);
        });
      }
      function bookedView(sh, doc, joined) {
        const m = Portal.member() || me;
        const tt = S.find('teeTimes', doc.id) || doc;
        const tp = timeParts(tt.time); const host = hostOf(tt);
        const q = feeQuote(tt.players || [], tt.holes, host ? host.memberId : m.id, m.id, tt.date, tt.time);
        sh.setContent('<div class="tt-done" role="status">' +
          '<span class="tt-done-ok">' + Club.icon('check') + '</span>' +
          '<h3 class="tt-done-h">' + (joined ? 'You’ve joined the group' : 'You’re booked') + '</h3>' +
          '<div class="tt-done-time">' + tp.t + '<small>' + tp.ap + '</small></div>' +
          '<p class="tt-done-d">' + esc(longDate(tt.date)) + ' · ' + tt.holes + ' holes</p>' +
          '<p class="tt-done-p">' + esc((tt.players || []).map(function (p) { return p.memberId === m.id ? 'You' : p.type === 'member' ? otherLabel(p) : p.type === 'guest' && state.model && state.model.players.some(function (x) { return x.type === 'guest' && x.name === p.name; }) ? p.name + ' (guest)' : otherLabel(p); }).join(', ')) + '</p>' +
          '<p class="tt-done-p">' + (q.total ? fmt.money(q.total) + ' due on your account at check-in.' : 'No fees due on your account.') + ' Please check in at the golf shop 15 minutes before.</p>' +
          (function () { const mine = (tt.players || []).find(function (p) { return p.memberId === m.id; }); const lg = mine && mine.friendLeagueId && FL() ? FL().get(mine.friendLeagueId) : null;
            return lg ? '<p class="tt-done-p tt-done-promo">' + Club.icon('trophy') + '<span>' + esc('Counts toward ' + lg.name + ' once you post your score') + '</span></p>' : ''; })() +
          (q.promo ? '<p class="tt-done-p tt-done-promo">' + Club.icon('tag') + '<span>' + esc('Promo code ' + q.promo.code + ' saved you ' + fmt.money(q.promo.discount)) + '</span></p>' : '') +
        '</div>');
        sh.setFooter('<div class="tt-done-acts"><button type="button" class="btn" data-act="ics">' + Club.icon('calendar') + '<span>Add to calendar</span></button><button type="button" class="btn btn-primary" data-act="done">Done</button></div>');
        ui.$('[data-act=ics]', sh.foot).addEventListener('click', function () { downloadIcs(tt); });
        ui.$('[data-act=done]', sh.foot).addEventListener('click', function () { sh.close(); });
        ui.$('[data-act=done]', sh.foot).focus();
      }

      function fail(root, msgs, opts) {
        const al = ui.$('.tt-alert', root); if (!al) return;
        al.innerHTML = Club.icon('alert') + '<div>' + msgs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') +
          (opts && opts.reload ? '<button type="button" class="btn btn-sm" data-act="reload">Refresh tee times</button>' : '') +
          (opts && opts.again ? '<button type="button" class="btn btn-sm" data-act="pick-again">Choose another time</button>' : '') + '</div>';
        al.hidden = false;
        al.scrollIntoView({ block: 'nearest' });
      }

      /** checkBooking (shared with joins from Friends), then commitBooking; returns { doc, joined } or null. */
      function book(root, btn) {
        const m = Portal.member() || me;
        const md = state.model; const d = state.date, t = state.time;
        btn.disabled = true;
        const done = function () { btn.disabled = false; };
        const ctx = { date: d, time: t, joinId: state.joinId, existing: md.existing, players: md.players, holes: md.holes, notes: md.notes };
        const c = checkBooking(m, ctx);
        if (c.existing) md.existing = c.existing;
        if (!c.ok) { done(); if (c.code === 'stale') refreshTabCount(); fail(root, c.errs, { again: c.again, reload: c.reload }); return null; }
        const target = c.target;
        const doc = commitBooking(m, c, ctx);
        syncPromoRecord(doc, m);   /* a promo code: its record (the sheet's Promo pill) and the use */
        // Remember this member's choices for next time (display defaults only).
        Portal.prefs.set('tt.players', Math.max(1, Math.min(4, md.players.length)));
        if (!target) Portal.prefs.set('tt.holes', md.holes);
        const mine = md.players.find(function (p) { return p.memberId === m.id; }); if (mine && !noCarts(d)) Portal.prefs.set('tt.cart', !!mine.cart);
        refreshTabCount();
        Portal.actionBar.hide();
        ui.toast(target ? 'You have joined the ' + fmt.time(t) + ' group' : 'Your tee time is confirmed');
        return { doc: doc, joined: !!target };
      }

      function socialHTML(m) {
        const tier = tierOf(m);
        const mine = upcoming(m);
        const tn = (tier && tier.name) || 'Social';
        return '<div class="tt-social">' +
          '<div class="tt-social-card">' +
            '<h2>Tee times come with golf memberships</h2>' +
            '<p class="tt-social-lead">As a ' + esc(tn) + ' member, you can play when a golfing member adds you to their tee time.</p>' +
            '<ol class="tt-social-steps">' +
              '<li><span aria-hidden="true">1</span><div><strong>Ask a golfing member</strong> to add you to their tee time. They can find you by name when they book.</div></li>' +
              '<li><span aria-hidden="true">2</span><div><strong>Your tee time shows up here</strong> under My tee times, with the date, time and the other players.</div></li>' +
              '<li><span aria-hidden="true">3</span><div><strong>Check in at the golf shop</strong> 15 minutes before you play. The guest green fee goes on your host’s account.</div></li>' +
            '</ol>' +
            '<div class="tt-social-actions">' +
              '<a class="btn btn-primary" href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + Club.icon('phone') + '<span>Call the golf shop</span></a>' +
              '<a class="btn" href="' + esc(Club.info.website) + '" target="_blank" rel="noopener">' + Club.icon('mail') + '<span>Ask about golf membership</span></a>' +
            '</div>' +
            (mine.length ? '<p class="tt-social-foot">You have ' + plural(mine.length, 'tee time') + ' coming up as a guest. <button type="button" class="p-link" data-act="go-mine">View my tee times</button></p>' : '') +
          '</div></div>';
      }
      ui.on(view, 'click', '[data-act=go-mine]', function () { tabs.activate('mine'); });

      /* ======================= Weekend ballot (Club.ballot) =======================
         A ballot day before its draw shows the ballot instead of times: enter (preferred time, how far either side,
         holes, players up to 4), change or withdraw until the draw. After the draw the day books as usual, with the
         result on top. Results also show above the tabs until the member closes them. */
      const RANGES = [
        { value: '30', label: 'Up to 30 minutes either way' },
        { value: '60', label: 'Up to 1 hour either way' },
        { value: '120', label: 'Up to 2 hours either way' },
        { value: '720', label: 'Any time of day' }
      ];
      function rangeWords(e) { const r = RANGES.find(function (x) { return +x.value === +e.range; }); return r ? r.label : ''; }
      function windowWords(e) { return rangeLabel(fmt.time(e.earliest), fmt.time(e.latest)); }
      function prefWords(e) { return +e.range >= 720 ? 'Any time' : fmt.time(e.time) + ' (' + windowWords(e) + ')'; }
      function holdersOf(e, m) { return (e.players || []).filter(function (p) { return p.memberId !== m.id; }).map(function (p) { return p.type === 'guest' ? p.name + ' (guest)' : otherLabel(p); }); }
      function ballotKind(d) { const s = BL().schedule(d); return s.kind === 'holiday' ? 'Holiday ballot' : 'Weekend ballot'; }
      function entryCardHTML(e, m, opts) {
        const lead = e.memberId === m.id, others = holdersOf(e, m);
        return '<div class="bl-entry">' +
          '<div class="bl-entry-top"><span class="bl-entry-k">Your entry</span><span class="tt-pill">' + (e.status === 'entered' ? 'Entered' : e.status === 'won' ? 'Tee time' : e.status === 'missed' ? 'No time' : 'Withdrawn') + '</span></div>' +
          '<dl class="bl-dl">' +
            '<div><dt>Preferred time</dt><dd>' + esc(prefWords(e)) + '</dd></div>' +
            '<div><dt>Players</dt><dd>' + esc(others.length ? 'You, ' + niceList(others) : 'Just you') + '</dd></div>' +
            '<div><dt>Holes</dt><dd>' + e.holes + '</dd></div>' +
            (lead ? '' : '<div><dt>Entered by</dt><dd>' + esc(otherLabel({ memberId: e.memberId, type: 'member', name: Club.members.name(e.memberId) })) + '</dd></div>') +
          '</dl>' +
          (opts && opts.actions && e.status === 'entered' ? (lead
            ? '<div class="bl-acts"><button type="button" class="btn" data-act="bl-edit" data-id="' + esc(e.id) + '">' + Club.icon('edit') + '<span>Change entry</span></button><button type="button" class="btn btn-danger" data-act="bl-withdraw" data-id="' + esc(e.id) + '">Withdraw</button></div>'
            : '<p class="tt-hint">Only the member who entered can change or withdraw this entry.</p>') : '') +
        '</div>';
      }
      function ballotPanelHTML(d, lock) {
        const m = Portal.member() || me, s = BL().schedule(d);
        const e = BL().entryFor(m.id, d);
        if (lock.ballot === 'before') {
          return '<div class="tt-state">' + ui.empty({ icon: 'calendar', title: 'Ballot opens on ' + longDate(s.opensOn), text: 'Weekend and holiday tee times start with a ballot. You can enter from ' + longDate(s.opensOn) + ' until the draw on ' + drawWhen(d) + '.' }) + '</div>';
        }
        if (lock.ballot === 'due') return '<div class="tt-state">' + ui.empty({ icon: 'clock', title: 'The draw is being made', text: lock.reason }) + '</div>';
        const stand = standingOf(m.id);
        return '<div class="bl-panel">' +
          '<div class="bl-head"><span class="bl-ic" aria-hidden="true">' + Club.icon('flag') + '</span><div class="bl-head-t">' +
            '<p class="bl-eyebrow">' + esc(ballotKind(d)) + '</p>' +
            '<h3 class="bl-title">' + esc(e ? 'You’re in the ballot for ' + longDate(d) : 'Enter the ballot for ' + longDate(d)) + '</h3>' +
            '<p class="bl-draw">' + Club.icon('clock') + '<span>' + esc('Draw on ' + drawWhen(d)) + '</span></p></div></div>' +
          (e ? entryCardHTML(e, m, { actions: true })
            : (stand.ok ? '<p class="bl-lead">Choose a preferred time, how flexible you are and who you play with. The draw gives each entry the open time closest to its choice.</p>' +
                '<button type="button" class="btn btn-primary tt-full bl-enter" data-act="bl-enter">Enter the ballot</button>'
              : '<p class="tt-hint tt-rule">' + Club.icon('alert') + '<span>' + esc(stand.reason) + '</span></p>')) +
          Portal.accordion({ id: 'bl-how', icon: 'info', title: 'How the ballot works', summary: 'Entries open 15 days ahead',
            body: '<ul class="tt-bullets">' +
              '<li>Saturdays, Sundays and holidays are booked by ballot. Weekdays book as usual.</li>' +
              '<li>Enter from 15 days before until the draw at 12:00 PM, 13 days before. A Saturday is drawn on the Sunday, a Sunday on the Monday.</li>' +
              '<li>Entries are drawn in a random order that anyone can check. Each gets the open time closest to its preferred time, inside its range and the play times of everyone in the group.</li>' +
              '<li>You can change or withdraw your entry until the draw. One entry per member a day.</li>' +
              '<li>After the draw, times still open can be booked online or by calling the golf shop.</li>' +
            '</ul>' }) +
        '</div>';
      }
      /** After the draw: one line above the times about the member's entry for this day. */
      function ballotResultHTML(d) {
        if (!BL() || !BL().isBallotDay(d)) return '';
        const m = Portal.member() || me, e = BL().entryFor(m.id, d);
        if (!e || (e.status !== 'won' && e.status !== 'missed')) return '';
        return '<p class="bl-result ' + (e.status === 'won' ? 'is-won' : 'is-missed') + '">' + Club.icon(e.status === 'won' ? 'check' : 'info') + '<span>' + esc(e.status === 'won'
          ? 'The ballot gave your group ' + fmt.time(e.drawnTime) + '.'
          : 'Your ballot entry did not get a time. Any time still open below can be booked.') + '</span></p>';
      }

      /* ---- Results above the tabs (until closed) ---- */
      function noticeList(m) {
        if (!BL()) return [];
        return BL().forMember(m.id).filter(function (e) { return e.date >= td && (e.status === 'won' || e.status === 'missed') && !BL().isSeen(e, m.id); });
      }
      function paintBallot() {
        const h = ui.$('.bl-host', view); if (!h) return;
        const m = Portal.member() || me, list = noticeList(m);
        h.innerHTML = list.length ? '<section class="bl-notices" aria-label="Ballot results">' + list.map(function (e) {
          const won = e.status === 'won';
          return '<article class="bl-note' + (won ? ' is-won' : '') + '" role="status">' +
            '<span class="bl-note-ic" aria-hidden="true">' + Club.icon(won ? 'check' : 'bell') + '</span>' +
            '<div class="bl-note-main"><p class="bl-note-k">Ballot result</p>' +
              '<p class="bl-note-t">' + esc(won ? longDate(e.date) + ' at ' + fmt.time(e.drawnTime) : 'No tee time on ' + longDate(e.date)) + '</p>' +
              '<p class="bl-note-s">' + esc(won ? 'The draw gave your group this tee time. It is in My tee times.' : 'The times you asked for went to entries drawn earlier. Times still open can be booked now.') + '</p></div>' +
            '<div class="bl-note-acts">' + (won ? '<button type="button" class="btn btn-primary btn-sm" data-act="bl-see" data-tt="' + esc(e.teeTimeId || '') + '">See tee time</button>'
              : '<button type="button" class="btn btn-primary btn-sm" data-act="pick-day-book" data-date="' + esc(e.date) + '">See open times</button>') +
              '<button type="button" class="p-link" data-act="bl-seen" data-id="' + esc(e.id) + '">Got it</button></div>' +
          '</article>';
        }).join('') + '</section>' : '';
      }
      ui.on(view, 'click', '[data-act=bl-seen]', function (e, b) { BL().seen(b.dataset.id, (Portal.member() || me).id); paintBallot(); });
      ui.on(view, 'click', '[data-act=bl-see]', function (e, b) { tabs.activate('mine'); if (b.dataset.tt && S.find('teeTimes', b.dataset.tt)) openDetail(b.dataset.tt); });
      ui.on(view, 'click', '[data-act=pick-day-book]', function (e, b) {
        tabs.activate('book');
        if (b.dataset.date) setDate(b.dataset.date);
      });

      /* ---- Enter or change: one sheet ---- */
      ui.on(view, 'click', '[data-act=bl-enter]', function () { openBallot(state.date, null); });
      ui.on(view, 'click', '[data-act=bl-edit]', function (e, b) { const en = BL().entry(b.dataset.id); if (en) openBallot(en.date, en); });
      ui.on(view, 'click', '[data-act=bl-withdraw]', function (e, b) { askWithdraw(b.dataset.id); });
      /** Preferred times: every half hour of the day, those outside the member's play times greyed out. */
      function prefRows(m, d) {
        const sl = slotList(); const out = [];
        const first = Math.ceil(toMin(sl[0]) / 30) * 30, last = toMin(sl[sl.length - 1]);
        for (let x = first; x <= last; x += 30) {
          const t = toHM(x), r = canPlay(m, d, t);
          out.push({ value: t, label: fmt.time(t), sub: guestLimitAt(d, t) && guestLimitAt(d, t).max < 3 ? 'Prime time: one guest per member' : '', disabled: !r.ok, reason: r.ok ? '' : 'Outside your play times' });
        }
        return out;
      }
      function openBallot(d, cur) {
        const m = Portal.member() || me;
        if (!BL() || BL().phase(d) !== 'open') { ui.toast('The ballot for this day is closed', 'bad'); refreshBook(false); return; }
        if (cur && cur.memberId !== m.id) return;
        const stand = standingOf(m.id); if (!stand.ok) { ui.toast(stand.reason, 'bad'); return; }
        const rows = prefRows(m, d);
        const firstOk = (rows.find(function (r) { return !r.disabled && toMin(r.value) >= 450; }) || rows.find(function (r) { return !r.disabled; }) || rows[0]);
        const pick = { time: cur ? cur.time : firstOk.value, range: cur ? String(cur.range) : '60' };
        const model = {
          holes: cur ? cur.holes : state.holes, notes: cur ? cur.notes || '' : '', existing: [],
          players: cur ? cur.players.map(function (p) { return Object.assign({}, p); }) : [{ memberId: m.id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: cartPref(m), paid: false }]
        };
        const sh = Portal.openSheet({ title: cur ? 'Change your ballot entry' : 'Enter the ballot', size: 'full',
          content: '<div class="tt-sheet bl-sheet">' +
            '<div class="tt-sum bl-sum"><span class="bl-sum-d">' + esc(longDate(d)) + '</span><span class="bl-sum-s">' + esc('Draw on ' + drawWhen(d)) + '</span></div>' +
            '<div class="bl-fields"><div class="bl-f bl-f-time"></div><div class="bl-f bl-f-range"></div></div>' +
            '<p class="tt-hint bl-window"></p>' +
            '<div class="tt-holes-row"><span class="pk-label" id="bl-holes-l">Holes</span>' + ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(model.holes), 'bl-holes') + '</div>' +
            '<div class="tt-editor"></div><div class="tt-alert" role="alert" hidden></div></div>',
          footer: '<button type="button" class="btn btn-primary tt-full" data-act="bl-save">' + (cur ? 'Save changes' : 'Enter the ballot') + '</button>' });
        if (sh.duplicate) return;
        const opts = { me: m, date: d, time: pick.time, excludeId: null, uid: 'bl' + (++uidN), target: cur ? 0 : state.players, allowGuests: true, addons: false, ballot: { entryId: cur ? cur.id : null },
          hostId: function () { return m.id; } };
        const editor = groupEditor(ui.$('.tt-editor', sh.body), model, opts);
        ui.$('.segmented[data-name=bl-holes]', sh.body).setAttribute('aria-labelledby', 'bl-holes-l');
        function windowLine() {
          const w = BL().windowOf(pick.time, +pick.range);
          ui.$('.bl-window', sh.body).textContent = +pick.range >= 720 ? 'Any open time that day suits you.' : 'The draw looks for a time from ' + rangeLabel(fmt.time(w.earliest), fmt.time(w.latest)) + ', closest to ' + fmt.time(pick.time) + ' first.';
        }
        Portal.selectField(ui.$('.bl-f-time', sh.body), { label: 'Preferred time', title: 'Preferred time', rows: rows, value: pick.time, icon: 'clock', onChange: function (v) {
          pick.time = v; opts.time = v; windowLine(); editor.render();
        } });
        Portal.selectField(ui.$('.bl-f-range', sh.body), { label: 'How flexible', title: 'How flexible are you?', rows: RANGES, value: pick.range, onChange: function (v) { pick.range = v; windowLine(); } });
        windowLine();
        ui.on(sh.body, 'click', '.segmented[data-name=bl-holes] button', function (e, b) {
          model.holes = +b.dataset.value;
          ui.$$('button', b.parentNode).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
        });
        ui.$('[data-act=bl-save]', sh.foot).addEventListener('click', function () {
          editor.validate();
          const al = ui.$('.tt-alert', sh.body); al.hidden = true;
          const data = { date: d, memberId: m.id, players: model.players, time: pick.time, range: +pick.range, holes: model.holes, notes: model.notes };
          const res = cur ? BL().change(cur.id, data) : BL().enter(data);   /* the same checks for staff and members */
          if (!res.ok) { al.innerHTML = Club.icon('alert') + '<div>' + res.errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; al.hidden = false; al.scrollIntoView({ block: 'nearest' }); return; }
          Portal.prefs.set('tt.players', Math.max(1, Math.min(4, model.players.length)));
          Portal.prefs.set('tt.holes', model.holes);
          ui.toast(cur ? 'Your ballot entry has been updated' : 'You’re in the ballot for ' + shortDay(d));
          if (cur) { sh.close(); refreshBook(false); rerenderMine(); return; }
          sh.setContent('<div class="tt-done" role="status"><span class="tt-done-ok">' + Club.icon('check') + '</span>' +
            '<h3 class="tt-done-h">You’re in the ballot</h3>' +
            '<p class="tt-done-d">' + esc(longDate(d)) + ' · ' + esc(prefWords(res.doc)) + '</p>' +
            '<p class="tt-done-p">' + esc('Draw on ' + drawWhen(d) + '. The result shows here and in My tee times. You can change or withdraw your entry until then.') + '</p></div>');
          sh.setFooter('<button type="button" class="btn btn-primary tt-full" data-act="bl-done">Done</button>');
          ui.$('[data-act=bl-done]', sh.foot).addEventListener('click', function () { sh.close(); });
          ui.$('[data-act=bl-done]', sh.foot).focus();
          refreshBook(false); refreshTabCount();
        });
      }
      function askWithdraw(id) {
        const m = Portal.member() || me, e = BL().entry(id);
        if (!e || e.memberId !== m.id) return;
        const sh = Portal.openSheet({ title: 'Withdraw from the ballot?',
          content: '<div class="tt-sheet tt-ask"><p>' + esc('Your entry for ' + longDate(e.date) + ' will be taken out of the draw' + ((e.players || []).length > 1 ? ' for everyone in your group' : '') + '. You can enter again until the draw on ' + drawWhen(e.date) + '.') + '</p></div>',
          footer: '<div class="tt-detail-acts"><button type="button" class="btn" data-act="bl-keep">Keep my entry</button><button type="button" class="btn btn-danger" data-act="bl-yes">Withdraw</button></div>' });
        if (sh.duplicate) return;
        ui.$('[data-act=bl-keep]', sh.foot).addEventListener('click', function () { sh.close(); });
        ui.$('[data-act=bl-yes]', sh.foot).addEventListener('click', function () {
          const r = BL().withdraw(id);
          sh.close();
          if (!r.ok) { ui.toast(r.reason, 'bad'); }
          else ui.toast('Your ballot entry has been withdrawn');
          refreshBook(false); rerenderMine();
        });
        ui.$('[data-act=bl-keep]', sh.foot).focus();
      }
      /** My tee times: the member's ballot entries from today on. */
      function ballotMineHTML(m) {
        if (!BL()) return '';
        const list = BL().forMember(m.id).filter(function (e) { return e.date >= td && e.status !== 'won'; });
        if (!list.length) return '';
        return '<section class="tt-mine-sec bl-mine"><h2 class="tt-mine-h">Ballot entries</h2><div class="p-list tt-rounds">' + list.map(function (e) {
          const dt = fmt.toDate(e.date);
          const pill = e.status === 'entered' ? 'Draw ' + shortDay(BL().schedule(e.date).drawOn) : 'No time';
          return '<button type="button" class="tt-row" data-act="bl-row" data-id="' + esc(e.id) + '" aria-label="' + esc(longDate(e.date) + ', ballot entry. ' + pill + '. Open details') + '">' +
            '<span class="tt-row-date" aria-hidden="true"><span class="tt-rd-wk">' + esc(fmt.weekday(e.date)) + '</span><span class="tt-rd-n">' + dt.getDate() + '</span></span>' +
            '<span class="tt-row-main"><span class="tt-row-top"><span class="tt-row-time bl-row-t">' + esc(+e.range >= 720 ? 'Any time' : fmt.time(e.time)) + '</span><span class="tt-pill' + (e.status === 'missed' ? ' is-bad' : '') + '">' + esc(pill) + '</span></span>' +
              '<span class="tt-row-meta">' + esc('Ballot · ' + e.holes + ' holes · ' + (holdersOf(e, m).length ? 'With ' + niceList(holdersOf(e, m)) : 'Just you')) + '</span></span>' +
            Club.icon('chevronRight', 'tt-go') + '</button>';
        }).join('') + '</div></section>';
      }
      ui.on(view, 'click', '[data-act=bl-row]', function (e, b) {
        const m = Portal.member() || me, en = BL().entry(b.dataset.id); if (!en) return;
        const open = en.status === 'entered' && BL().phase(en.date) === 'open';
        const sh = Portal.openSheet({ title: 'Ballot for ' + shortDay(en.date),
          content: '<div class="tt-sheet"><p class="bl-draw">' + Club.icon('clock') + '<span>' + esc(en.status === 'entered' ? 'Draw on ' + drawWhen(en.date) : 'Drawn on ' + drawWhen(en.date)) + '</span></p>' + entryCardHTML(en, m, { actions: false }) +
            (en.status === 'missed' ? '<p class="tt-hint">' + esc('The times you asked for went to entries drawn earlier. Times still open can be booked now.') + '</p>' : '') + '</div>',
          footer: en.status === 'missed' ? '<button type="button" class="btn btn-primary tt-full" data-act="pick-day-book" data-date="' + esc(en.date) + '">See open times</button>'
            : open && en.memberId === m.id ? '<div class="tt-detail-acts"><button type="button" class="btn" data-act="bl-edit" data-id="' + esc(en.id) + '">Change entry</button><button type="button" class="btn btn-danger" data-act="bl-withdraw" data-id="' + esc(en.id) + '">Withdraw</button></div>' : '' });
        if (sh.duplicate) return;
        ui.on(sh.el, 'click', '[data-act=bl-edit]', function () { sh.close(); openBallot(en.date, BL().entry(en.id)); });
        ui.on(sh.el, 'click', '[data-act=bl-withdraw]', function () { sh.close(); askWithdraw(en.id); });
        ui.on(sh.el, 'click', '[data-act=pick-day-book]', function () { sh.close(); tabs.activate('book'); setDate(en.date); });
      });

      /* ======================= My tee times ======================= */
      function renderMine(panel) {
        const m = Portal.member() || me;
        Portal.actionBar.hide();
        const up = upcoming(m), pa = past(m);
        const played = pa.filter(function (x) { return x.status === 'completed'; }).length;
        panel.innerHTML =
          '<section class="tt-mine-sec"><h2 class="tt-mine-h">Upcoming</h2>' + (Portal.cartLink ? Portal.cartLink(m) : '') +
            (up.length ? '<div class="p-list tt-rounds">' + up.slice(0, 5).map(function (tt) { return rowHTML(tt, m); }).join('') +
              (up.length > 5 ? '<button type="button" class="tt-all-row" data-act="all-up">View all upcoming (' + up.length + ')' + Club.icon('chevronRight', 'tt-go') + '</button>' : '') + '</div>' :
              '<div class="panel tt-empty">' + ui.empty({ icon: 'flag', title: 'No tee times booked', text: canGolf(m) ? windowLine(m) : 'When a golfing member adds you to their tee time, it will show up here.', action: canGolf(m) && m.status !== 'suspended' ? ui.btn('Book a tee time', { kind: 'primary', action: 'go-book-empty' }) : '' }) + '</div>') +
          '</section>' +
          ballotMineHTML(m) +
          (Portal.waitlist ? Portal.waitlist.listHTML(m) : '') +
          '<section class="tt-mine-sec">' +
            (pa.length ? Portal.accordion({ id: 'tt-past', icon: 'trophy', title: 'Past rounds', summary: plural(played, 'round') + ' played', body: pastBody(pa, m) })
              : '<p class="tt-hint">Rounds you finish will be listed here.</p>') +
          '</section>';
      }
      function pastBody(pa, m) {
        return '<ul class="tt-past-list">' + pa.slice(0, pastShown).map(function (tt) { return pastHTML(tt, m); }).join('') + '</ul>' +
          (pa.length > pastShown ? '<button type="button" class="p-link" data-act="more-past">Show more</button>' : '');
      }
      function rowHTML(tt, m) {
        const dt = fmt.toDate(tt.date); const tp = timeParts(tt.time);
        const mgr = managerOf(tt) === m.id;
        const me1 = (tt.players || []).find(function (p) { return p.memberId === m.id; }) || {};
        const status = tt.status === 'on-course' ? 'On course' : tt.status === 'checked-in' ? 'Checked in' : 'Confirmed';
        const others = (tt.players || []).filter(function (p) { return p.memberId !== m.id; });
        return '<button type="button" class="tt-row" data-act="detail" data-id="' + esc(tt.id) + '" aria-label="' + esc(longDate(tt.date) + ' at ' + fmt.time(tt.time) + ', ' + status + '. Open details') + '">' +
          '<span class="tt-row-date" aria-hidden="true"><span class="tt-rd-wk">' + esc(fmt.weekday(tt.date)) + '</span><span class="tt-rd-n">' + dt.getDate() + '</span></span>' +
          '<span class="tt-row-main"><span class="tt-row-top"><span class="tt-row-time">' + tp.t + '<small>' + tp.ap + '</small></span><span class="tt-pill">' + status + '</span></span>' +
            '<span class="tt-row-meta">' + tt.holes + ' holes · ' + (me1.cart ? 'Cart' : 'Walking') + ' · ' + (others.length ? 'With ' + esc(niceList(others.map(function (p) { return otherLabel(p); }))) : 'Just you') + '</span></span>' +
          Club.icon('chevronRight', 'tt-go') + '</button>';
      }
      function pastHTML(tt, m) {
        const done = tt.status === 'completed';
        const len = tt.startedAt && tt.finishedAt ? toMin(tt.finishedAt) - toMin(tt.startedAt) : null;
        const others = (tt.players || []).filter(function (p) { return p.memberId !== m.id; });
        return '<li class="tt-past-row"><div class="tt-past-main"><span class="tt-past-t">' + esc(shortDay(tt.date)) + ' · ' + fmt.time(tt.time) + ' · ' + tt.holes + ' holes</span><span class="tt-past-s">' + (others.length ? 'With ' + esc(niceList(others.map(function (p) { return otherLabel(p); }))) : 'A solo round') + (done && len && len > 0 ? ' · ' + Math.floor(len / 60) + 'h ' + String(len % 60).padStart(2, '0') + 'm' : '') + '</span>' +
          Portal.receiptLink(Portal.receiptsFor('teesheet', tt.id, m.id)) + '</div>' +   /* guest and cart fees posted at check-in */
          (done ? (Portal.scores ? Portal.scores.pastCell(tt, m) : '<span class="tt-pill">Completed</span>') : '<span class="tt-pill is-bad">No-show</span>') + '</li>';
      }
      ui.on(view, 'click', '[data-act=more-past]', function (e, b) {
        pastShown += 10; const m = Portal.member() || me;
        const body = b.closest('.pk-acc-body'); if (body) body.innerHTML = pastBody(past(m), m);
      });
      ui.on(view, 'click', '[data-act=go-book-empty], [data-action=go-book-empty]', function () { tabs.activate('book'); });
      ui.on(view, 'click', '[data-act=all-up]', function () {
        const m = Portal.member() || me;
        const sh = Portal.openSheet({ title: 'Upcoming tee times', size: 'full', content: '<div class="p-list tt-rounds">' + upcoming(m).map(function (tt) { return rowHTML(tt, m); }).join('') + '</div>' });
        ui.on(sh.body, 'click', '[data-act=detail]', function (e, b) { openDetail(b.dataset.id, sh); });
      });
      ui.on(view, 'click', '[data-act=detail]', function (e, b) { if (!b.closest('.ps-sheet')) openDetail(b.dataset.id); });

      function rerenderMine() {
        refreshTabCount();
        const p = ui.$('.tab-panel', tabsHost);
        if (p && ui.$('.tt-mine-sec', p)) renderMine(p);
      }
      function guard(tt) {
        const fresh = tt && S.find('teeTimes', tt.id);
        if (!fresh || fresh.status !== 'booked') { ui.toast('This tee time has changed. Please check with the golf shop', 'bad'); rerenderMine(); return null; }
        if (minutesUntil(fresh) < CUTOFF_MIN) { ui.toast('Changes close two hours before play. Please call the golf shop', 'bad'); rerenderMine(); return null; }
        return fresh;
      }

      /* ---- Detail sheet: Change / Withdraw / Calendar, or Modify / Cancel / Calendar ---- */
      function openDetail(id, parent) {
        const m = Portal.member() || me;
        const tt = S.find('teeTimes', id); if (!tt) return;
        const mgr = managerOf(tt) === m.id;
        const locked = tt.status !== 'booked' || minutesUntil(tt) < CUTOFF_MIN;
        const tp = timeParts(tt.time);
        const status = tt.status === 'on-course' ? 'On course' : tt.status === 'checked-in' ? 'Checked in' : 'Confirmed';
        /* Friends league: shown, and changeable until a score is posted for this round (scores.js copies it then) */
        const posted = S.where('scorePosts', function (x) { return x.teeTimeId === tt.id && x.memberId === m.id; }).length > 0;
        const lgList = function () { return leaguesFor(m.id, tt.date, tt.holes, tt.id); };
        const lgNow = function () { const t = S.find('teeTimes', tt.id) || tt; const p = (t.players || []).find(function (x) { return x.memberId === m.id; }); return p && p.friendLeagueId || null; };
        const lgLive = ['booked', 'checked-in', 'on-course'].indexOf(tt.status) >= 0 && !posted;
        function leagueBlock() {
          const id = lgNow(), list = lgLive ? lgList() : [];
          if (list.length && (!id || validLeague(list, id))) return '<div class="tt-lg-host tt-lg-detail">' + leagueHTML(list, id, 'd' + tt.id) + '</div>';
          const lg = id && FL() ? FL().get(id) : null;
          return lg ? '<p class="tt-lg-note">' + Club.icon('trophy') + '<span>' + esc('Counts toward ' + lg.name) + '</span></p>' : '';
        }
        const detailHTML = function () { return '<div class="tt-sheet"><div class="tt-sum"><span class="tt-sum-t">' + tp.t + '<small>' + tp.ap + '</small></span><span class="tt-sum-d">' + esc(longDate(tt.date)) + '<br>' + tt.holes + ' holes · <span class="tt-pill">' + status + '</span></span></div>' +
          '<ul class="tt-pl-list tt-detail-pl">' + (tt.players || []).map(function (p) {
            const self = p.memberId === m.id;
            const adds = (self || (p.type === 'guest' && p.hostId === m.id)) && realAdds(p.addons).length && Club.addons ? Club.addons.summary(realAdds(p.addons)) : '';
            const pr = self ? promoLine(p) : null;
            return '<li class="tt-pl"><div class="tt-pl-who"><span class="tt-pl-name">' + esc(self ? 'You' : otherLabel(p)) + '</span><span class="tt-pl-sub">' + (p.type === 'guest' ? 'Guest · ' : isPublic(p) ? '' : 'Member · ') + (p.cart ? 'Cart' : 'Walking') + '</span>' +
              (adds ? '<span class="tt-pl-adds">' + Club.icon('box') + '<span>' + esc(adds) + '</span></span>' : '') +
              (pr ? '<span class="tt-pl-adds">' + Club.icon('tag') + '<span>' + esc('Promo code ' + pr.code + ', ' + fmt.money(-pr.price) + ' off') + '</span></span>' : '') + '</div></li>';
          }).join('') + '</ul>' + leagueBlock() +
          (tt.notes && mgr ? '<p class="tt-cond-note"><span class="tt-cond-k">Notes:</span> ' + esc(tt.notes) + '</p>' : '') +
          (locked && tt.status === 'booked' ? '<p class="tt-hint tt-rule">' + Club.icon('clock') + '<span>Less than 2 hours to go. To make changes, call the golf shop on <a href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</span></p>' : '') +
          '</div>'; };
        const actsHTML = '<div class="tt-detail-acts">' + (Portal.play ? Portal.play.detailAction(tt, m) : '') + (Portal.scores ? Portal.scores.detailAction(tt, m) : '') +
          (!locked ? '<button type="button" class="btn" data-act="d-modify">' + (mgr ? 'Modify' : 'Change') + '</button><button type="button" class="btn btn-danger" data-act="d-cancel">' + (mgr ? 'Cancel' : 'Withdraw') + '</button>' : '') +
          '<button type="button" class="btn" data-act="d-ics">' + Club.icon('calendar') + '<span>Calendar</span></button></div>';
        const sh = Portal.openSheet({ title: 'Your tee time', content: detailHTML(), footer: actsHTML });
        /* Changing the league choice saves at once: the switch (or "Does not count") is its own way back. */
        if (lgLive) wireLeague(sh.body, lgList, lgNow, function (id) {
          const fresh = S.find('teeTimes', tt.id);
          if (!fresh || !isIn(fresh, m.id)) { ui.toast('This tee time has changed. Please check with the golf shop', 'bad'); sh.close(); rerenderMine(); return; }
          const was = lgNow();
          if (id) { const lc = leagueCheck(m.id, id, fresh.date, fresh.holes, fresh.id); if (!lc.ok) { ui.toast(lc.msg, 'bad'); redrawLeague(); return; } }
          S.update('teeTimes', fresh.id, { players: (fresh.players || []).map(function (p) {
            if (p.memberId !== m.id) return p;
            const o = Object.assign({}, p); if (id) o.friendLeagueId = id; else delete o.friendLeagueId; return o;
          }) });
          redrawLeague();
          const lg = FL().get(id || was);
          ui.toast(id ? 'This round now counts toward ' + (lg ? lg.name : 'your league') : 'This round no longer counts toward ' + (lg ? lg.name : 'a league'));
          const sw = ui.$('[data-act=tt-lg-sw]', sh.body), pk = ui.$('[data-act=tt-lg-pick]', sh.body); if (sw) sw.focus(); else if (pk) pk.focus();
        });
        function redrawLeague() { const h = ui.$('.tt-lg-detail', sh.body); if (h) h.outerHTML = leagueBlock() || '<div class="tt-lg-host tt-lg-detail"></div>'; }
        function wire() {
          const ics = ui.$('[data-act=d-ics]', sh.foot); if (ics) ics.addEventListener('click', function () { downloadIcs(tt); });
          const mod = ui.$('[data-act=d-modify]', sh.foot); if (mod) mod.addEventListener('click', function () { const f = guard(tt); if (!f) { sh.close(); return; } sh.close(); if (parent) parent.close(); openModify(f); });
          const can = ui.$('[data-act=d-cancel]', sh.foot); if (can) can.addEventListener('click', askCancel);
        }
        function myGuests(t) { return (t.players || []).filter(function (p) { return p.type === 'guest' && p.hostId === m.id; }).length; }
        function askCancel() {
          const f = guard(tt); if (!f) { sh.close(); return; }
          const n = (f.players || []).filter(function (p) { return !isPublic(p); }).length;   /* public golfers keep their time */
          sh.setContent('<div class="tt-sheet tt-ask"><h3>' + (mgr ? 'Cancel this tee time?' : 'Withdraw from this round?') + '</h3><p>' + esc(mgr
            ? 'Your ' + fmt.time(f.time) + ' tee time on ' + longDate(f.date) + ' will be released' + (n > 1 ? ' for all ' + n + ' players in the group' : '') + '. The golf shop will let anyone you invited know.'
            : 'You will be removed from the ' + fmt.time(f.time) + ' group on ' + longDate(f.date) + (myGuests(f) ? ', along with ' + (myGuests(f) === 1 ? 'the guest' : 'the ' + myGuests(f) + ' guests') + ' you brought' : '') + '. The rest of the group keeps its tee time.') + '</p></div>');
          sh.setFooter('<div class="tt-detail-acts"><button type="button" class="btn" data-act="d-keep">Keep tee time</button><button type="button" class="btn btn-danger" data-act="d-yes">' + (mgr ? 'Cancel tee time' : 'Withdraw') + '</button></div>');
          ui.$('[data-act=d-keep]', sh.foot).addEventListener('click', function () { sh.setContent(detailHTML()); sh.setFooter(actsHTML); wire(); });
          ui.$('[data-act=d-yes]', sh.foot).addEventListener('click', function () {
            const fresh = guard(S.find('teeTimes', tt.id)); if (!fresh) { sh.close(); return; }
            if (mgr) {
              /* Public golfers who joined paid the golf shop and keep their place; everyone else is released. */
              const pub = (fresh.players || []).filter(isPublic);
              if (pub.length) S.update('teeTimes', fresh.id, { players: pub });
              else S.update('teeTimes', fresh.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
            }
            else {
              const rest = (fresh.players || []).filter(function (p) { return p.memberId !== m.id && !(p.type === 'guest' && p.hostId === m.id); });   // your guests leave with you
              if (!rest.some(function (p) { return (p.type === 'member' && p.memberId) || isPublic(p); })) S.update('teeTimes', fresh.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
              else S.update('teeTimes', fresh.id, { players: rest });
            }
            if (Club.waitlist) Club.waitlist.released(fresh.date, fresh.time, mgr ? 'a member cancelled their tee time' : 'a member withdrew');
            syncPromoRecord(S.find('teeTimes', fresh.id), m);   /* a promo code used on it is given back */
            sh.close(); if (parent) parent.close();
            rerenderMine();
            ui.toast(mgr ? 'Your tee time has been cancelled' : 'You have withdrawn from the round');
          });
          const k = ui.$('[data-act=d-keep]', sh.foot); if (k) k.focus();
        }
        wire();
      }

      /* ---- Change sheet: same editor, Save changes ---- */
      function openModify(tt) {
        const m = Portal.member() || me;
        const mgr = managerOf(tt) === m.id;
        const host = hostOf(tt);
        const model = mgr
          ? { holes: tt.holes || 18, notes: tt.notes || '', existing: (tt.players || []).filter(isPublic).map(function (p) { return Object.assign({}, p); }), players: (tt.players || []).filter(function (p) { return !isPublic(p); }).map(function (p) { return Object.assign({}, p); }) }
          : { holes: tt.holes || 18, notes: '', existing: (tt.players || []).filter(function (p) { return p.memberId !== m.id; }).map(function (p) { return Object.assign({}, p); }), players: [Object.assign({}, (tt.players || []).find(function (p) { return p.memberId === m.id; }))] };
        const tp = timeParts(tt.time);
        /* Who was in the group when the sheet opened. The store already follows other tabs, so this snapshot is what
           tells us someone joined or left on another device while the member was editing. */
        const sig = function (t) { return t.status + '|' + (t.players || []).map(function (p) { return p.type + ':' + (p.memberId || p.publicPlayerId || p.name); }).join(','); };
        const openedSig = sig(S.find('teeTimes', tt.id) || tt);
        const sh = Portal.openSheet({ title: (mgr ? 'Change your ' : 'Your spot at ') + tp.t + ' ' + tp.ap + ' tee time', size: 'full',
          content: '<div class="tt-sheet tt-modify"><p class="tt-hint">' + esc(longDate(tt.date)) + '</p><div class="tt-alert" role="alert" hidden></div><div class="tt-editor"></div></div>',
          footer: '<button type="button" class="btn btn-primary tt-full" data-act="save">Save changes</button>' });
        const editor = groupEditor(ui.$('.tt-editor', sh.body), model, {
          me: m, date: tt.date, time: tt.time, excludeId: tt.id, uid: 'm' + (++uidN), showHoles: mgr, hideNotes: !mgr, league: true,
          allowGuests: mgr && !!host && host.memberId === m.id,
          guestNote: mgr ? 'Guests settle on the host’s account. Please ask the golf shop to add guests to this group.' : 'Only the member who booked can add guests to this group.',
          hostId: function () { const all = model.existing.concat(model.players); const h = all.find(function (p) { return p.type === 'member' && p.memberId; }); return h ? h.memberId : m.id; }
        });
        ui.on(sh.body, 'click', '[data-act=reload]', function () { const t2 = guard(S.find('teeTimes', tt.id)); sh.close(); if (t2) openModify(t2); });
        ui.$('[data-act=save]', sh.foot).addEventListener('click', function () {
          const al = ui.$('.tt-alert', sh.body); al.hidden = true;
          if (!editor.validate()) return;
          const fresh = guard(S.find('teeTimes', tt.id)); if (!fresh) { sh.close(); return; }
          if (sig(fresh) !== openedSig) { al.innerHTML = Club.icon('alert') + '<div><p>This tee time was changed elsewhere a moment ago.</p><button type="button" class="btn btn-sm" data-act="reload">Refresh</button></div>'; al.hidden = false; return; }
          const before = fresh.players || [];
          const added = model.players.filter(function (p) { return p.type === 'member' && !before.some(function (q) { return q.memberId === p.memberId; }); });
          const errs = validateMembers(added, fresh.date, fresh.time, fresh.id, m, undefined, mgr ? model.holes : fresh.holes);
          if (model.existing.length + model.players.length > 4) errs.push('A group can have at most four players.');
          if (mgr && !model.players.some(function (p) { return p.memberId === m.id; })) errs.push('You cannot remove yourself here. Cancel the tee time instead.');
          /* Member Guest Policy: only a change that brings more guests than before is held to the limit */
          const gNow = guestsOf(model.players, m.id, '\u0000'), gWas = guestsOf(before, m.id, '\u0000');
          if (gNow > gWas) { const gp = guestProblem(model.players.filter(function (p) { return p.hostId === m.id; }), m.id, fresh.date, fresh.time, m.id); if (gp) errs.push(gp); }
          const mineM = model.players.find(function (p) { return p.memberId === m.id; });
          const newHoles = mgr ? model.holes : fresh.holes;
          if (mineM && mineM.friendLeagueId) { const lc = leagueCheck(m.id, mineM.friendLeagueId, fresh.date, newHoles, fresh.id); if (!lc.ok) errs.push(lc.msg); }
          if (errs.length) { editor.league(); al.innerHTML = Club.icon('alert') + '<div>' + errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; al.hidden = false; al.scrollIntoView({ block: 'nearest' }); return; }
          const keepPaid = function (p) { const prev = before.find(function (q) { return q.type === p.type && (p.type === 'member' ? q.memberId === p.memberId : q.name === p.name); }); return prev ? !!prev.paid : false; };
          const clean = function (p) {
            const o = { memberId: p.type === 'member' ? p.memberId : null, name: p.type === 'member' ? playerName(p) : p.name, type: p.type, cart: noCarts(fresh.date) ? false : !!p.cart, paid: keepPaid(p) };
            const ad = repriceAdds(p.addons, mgr ? model.holes : fresh.holes); if (ad) o.addons = ad;
            if (p.type === 'guest') {
              /* A guest whose host was taken out of the group is now the organiser's guest, so their fee is not billed to
                 a member who is no longer playing. */
              const host = p.hostId || m.id, stays = model.players.some(function (q) { return q.type === 'member' && q.memberId === host; });
              o.hostId = stays ? host : m.id; o.pays = p.pays === 'shop' ? 'shop' : 'host'; guestContact(o, p);
            }   // keep who brought, who pays and contact
            if (p.type === 'member' && p.addedBy) o.addedBy = p.addedBy;
            /* Friends league: the member's own choice from the editor; another member keeps theirs while the length still fits */
            if (p.type === 'member' && p.friendLeagueId) {
              const lg = FL() && FL().get(p.friendLeagueId);
              if (p.memberId === m.id || (lg && +lg.holes === +newHoles)) o.friendLeagueId = p.friendLeagueId;
            }
            return o;
          };
          if (mgr) {
            // Public golfers booked by the golf shop or online stay exactly as they are.
            S.update('teeTimes', fresh.id, { players: before.filter(isPublic).concat(model.players.map(clean)), holes: model.holes, notes: String(model.notes || '').trim() });
          } else {
            /* A member who joined someone else's group changes their own spot, and can bring friends (members) into the
               open places; they are recorded as added by this member. */
            const mineP = clean(model.players[0]);
            const extra = model.players.slice(1).filter(function (p) { return p.type === 'member' && p.memberId && !before.some(function (q) { return q.memberId === p.memberId; }); })
              .map(function (p) { return clean(Object.assign({}, p, { addedBy: m.id })); });
            S.update('teeTimes', fresh.id, { players: before.map(function (p) { return p.memberId === m.id ? mineP : p; }).concat(extra) });
          }
          if (Club.waitlist && (S.find('teeTimes', fresh.id).players || []).length < before.length) Club.waitlist.released(fresh.date, fresh.time, 'a member removed a player');
          syncPromoRecord(S.find('teeTimes', fresh.id), m);   /* the discount was re-quoted against the changed booking */
          sh.close();
          rerenderMine();
          ui.toast('Your tee time has been updated');
        });
      }

      return function () { Portal.actionBar.hide(); if (dp) dp.close(); if (offHolds) offHolds(); if (Club.holds) { Club.holds.stopTimer(); Club.holds.release(); } };
    }
  });
})();
