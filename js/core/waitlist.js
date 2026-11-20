/* Club.waitlist: tee time waitlist shared by the staff tee sheet, the members' portal and the public site.
   When a day or a time is full, a member or public golfer asks to be told if a spot opens. When a cancellation or
   withdrawal frees enough places, the first golfer in line who can play then is notified (first come, first served).
   The notice shows on their pages (portal Home and Tee times, public My bookings and My account); it is not a pop-up.

   Collection `teeWaitlist`: { id, date, time: 'HH:MM' | null, window: 'any' | 'morning' | 'midday' | 'afternoon' | null,
     players, kind: 'member' | 'public', memberId, publicPlayerId, createdAt, status: 'waiting' | 'notified' | 'booked' |
     'expired' | 'removed', notifiedAt, offerTime, holdUntil, had: [tee time ids the golfer was already in that day],
     history: [{ at, text }] }

   Hold: a notified golfer has HOLD_MIN minutes as the only person told about that spot. The spot is never blocked
   (booking rules are unchanged); if it is still free after the hold, the next golfer in line is told as well.
   Booking rules come from Club.teeRules (play windows, advance days, public times); they are never changed here. */
(function () {
  window.Club = window.Club || {};
  const S = Club.store, fmt = Club.fmt;
  /* The history is stored, so it is always English: Club.fmtEn on the public site and portal, where Club.fmt can be French. */
  const EN = Club.fmtEn || fmt;
  const COLL = 'teeWaitlist';
  const HOLD_MIN = 30;
  const DEFAULTS = { interval: 9, first: '06:30', last: '19:00' };
  const PACE = (Club.teeRules && Club.teeRules.PACE) || { 18: 234, 9: 117 };   /* handbook: 13 minutes a hole */
  /* The same parts of the day as the portal's Tee times page. */
  const WINDOWS = [
    { id: 'any', label: 'Any time', sub: 'Any time that day', from: 0, to: 1440 },
    { id: 'morning', label: 'Morning', sub: 'Before 11:00 AM', from: 0, to: 660 },
    { id: 'midday', label: 'Midday', sub: '11:00 AM to 2:00 PM', from: 660, to: 840 },
    { id: 'afternoon', label: 'Afternoon', sub: 'After 2:00 PM', from: 840, to: 1440 }
  ];

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function today() { return Club.date.today(); }
  function stamp() { return new Date().toISOString(); }
  function settings() { return Object.assign({}, DEFAULTS, S.getObj('teeSheetSettings', {}) || {}); }
  function slotList() { const s = settings(); const out = []; const step = Math.max(5, +s.interval || 9); for (let m = toMin(s.first); m <= toMin(s.last); m += step) out.push(toHM(m)); return out; }
  function courseOpen(date) { const cs = S.getObj('courseStatus', null) || {}; return !(date === today() && cs.open === false); }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(fmt.toDate(d)); }
  function windowOf(id) { return WINDOWS.find(function (w) { return w.id === id; }) || WINDOWS[0]; }
  function isActive(e) { return e && (e.status === 'waiting' || e.status === 'notified'); }
  function byQueue(a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }
  function all() { return S.all(COLL); }
  function log(e, text) { return (e.history || []).concat([{ at: stamp(), text: text }]); }

  /* ---------------- Who is waiting ---------------- */
  function person(e) { return e.kind === 'public' ? S.find('publicPlayers', e.publicPlayerId) : Club.members.get(e.memberId); }
  function inGroup(tt, e) { return (tt.players || []).some(function (p) { return e.kind === 'public' ? p.publicPlayerId === e.publicPlayerId : p.memberId === e.memberId; }); }
  /** Name and contact details for staff (full names, as staff screens show them). */
  function contact(e) {
    const p = person(e) || {};
    return { name: (p.firstName ? p.firstName + ' ' + p.lastName : e.kind === 'public' ? 'Public golfer' : 'Member'), phone: p.phone || '', email: p.email || '',
      kind: e.kind, label: e.kind === 'public' ? 'Public golfer' : 'Member' + (p.memberNo ? ' #' + p.memberNo : '') };
  }

  /* ---------------- Places free at a tee time ---------------- */
  function activeAt(date, time) { return S.all('teeTimes').filter(function (t) { return t.date === date && t.time === time && t.status !== 'cancelled'; }); }
  function blockAt(date, time) { return S.all('teeBlocks').some(function (b) { return b.date === date && time >= b.start && time < b.end; }); }
  function isPast(date, time) { return date < today() || (date === today() && toMin(time) <= nowMin()); }
  /** Places anyone could book at this time right now (0 when it has passed, is blocked or the group is out). */
  function baseRoom(date, time) {
    if (isPast(date, time) || !courseOpen(date) || blockAt(date, time)) return 0;
    const here = activeAt(date, time);
    if (!here.length) return 4;
    if (here.length > 1 || here[0].status !== 'booked') return 0;
    return Math.max(0, 4 - (here[0].players || []).length);
  }
  function clash(e, date, time) {
    return S.all('teeTimes').some(function (x) {
      /* The round that starts first sets the window (the waitlisted round's length is e.holes, 18 when not set). */
      const a = toMin(x.time), b = toMin(time);
      return x.date === date && x.status !== 'cancelled' && x.status !== 'no-show' && (a <= b ? b - a < (PACE[x.holes] || PACE[18]) : a - b < (PACE[e.holes] || PACE[18])) && inGroup(x, e);
    });
  }
  /** Could this golfer book this time under the booking rules (ignoring how full it is)? */
  function eligible(e, date, time, rulesOnly) {
    const R = Club.teeRules;
    if (isPast(date, time)) return false;
    if (e.kind === 'public') {
      if (!S.find('publicPlayers', e.publicPlayerId)) return false;
      if (R && (!R.publicSlot(date, time).ok || !R.bookingOpen('public', null, date).ok)) return false;
    } else {
      const m = Club.members.get(e.memberId);
      if (!m || m.status === 'suspended' || m.status === 'resigned') return false;
      if (R && (!R.memberCanPlay(m, date, time).ok || !R.bookingOpen('member', m, date).ok)) return false;
    }
    return rulesOnly || !clash(e, date, time);
  }
  /** Tee times an entry covers: its exact time, or every slot in its part of the day. */
  function timesFor(e) {
    if (e.time) return [e.time];
    const w = windowOf(e.window);
    return slotList().filter(function (t) { const m = toMin(t); return m >= w.from && m < w.to; });
  }
  function expired(e) { return e.date < today() || timesFor(e).every(function (t) { return isPast(e.date, t); }); }
  /** A tee time on the entry's day and time (or part of the day) the golfer joined after asking. */
  function bookedTee(e) {
    const ts = timesFor(e);
    return S.all('teeTimes').find(function (t) { return t.date === e.date && t.status !== 'cancelled' && ts.indexOf(t.time) >= 0 && inGroup(t, e) && (e.had || []).indexOf(t.id) < 0; }) || null;
  }
  function held(e, now) { return e.status === 'notified' && e.holdUntil && Date.parse(e.holdUntil) > now; }
  function firstFit(e, base, claims, prefer) {
    const ts = timesFor(e).slice();
    if (prefer && ts.indexOf(prefer) > 0) { ts.splice(ts.indexOf(prefer), 1); ts.unshift(prefer); }
    return ts.find(function (t) { return (base[t] || 0) - (claims[t] || 0) >= e.players && eligible(e, e.date, t); }) || null;
  }

  /* ---------------- Matching freed places to the queue ---------------- */
  /** Expire past entries, close booked ones, then notify waiting golfers in order while places allow.
      reason: why a place opened (kept in the history staff see). Returns the entries notified now. */
  function reconcile(date, reason, prefer) {
    const list = all().filter(function (e) { return e.date === date && isActive(e); }).sort(byQueue);
    if (!list.length) return [];
    const now = Date.now(), at = stamp(), out = [];
    const base = {}; slotList().concat(list.map(function (e) { return e.time; }).filter(Boolean)).forEach(function (t) { if (base[t] == null) base[t] = baseRoom(date, t); });
    const live = [];
    list.forEach(function (e) {
      if (expired(e)) { S.update(COLL, e.id, { status: 'expired', expiredAt: at, history: log(e, 'Expired: the tee time passed') }); return; }
      const bk = bookedTee(e);
      if (bk) { S.update(COLL, e.id, { status: 'booked', bookedAt: at, bookedTeeTimeId: bk.id, history: log(e, 'Booked the ' + EN.time(bk.time) + ' tee time') }); return; }
      live.push(e);
    });
    const claims = {};
    live.forEach(function (e) { if (held(e, now)) claims[e.offerTime] = (claims[e.offerTime] || 0) + e.players; });
    live.forEach(function (e) {
      if (e.status === 'notified') {
        const own = held(e, now) ? e.players : 0;
        const room = (base[e.offerTime] || 0) - (claims[e.offerTime] || 0) + own;
        if (e.offerTime && room >= e.players && eligible(e, date, e.offerTime)) return;
        if (own) claims[e.offerTime] -= own;
        const t2 = firstFit(e, base, claims, prefer);
        if (t2) {
          claims[t2] = (claims[t2] || 0) + e.players;
          S.update(COLL, e.id, { offerTime: t2, holdUntil: new Date(now + HOLD_MIN * 60000).toISOString(), history: log(e, 'The ' + EN.time(e.offerTime) + ' spot was taken. Told about ' + EN.time(t2) + ' instead') });
        } else S.update(COLL, e.id, { status: 'waiting', offerTime: null, holdUntil: null, history: log(e, 'The ' + EN.time(e.offerTime) + ' spot was taken before they booked. Back on the list') });
        return;
      }
      const t = firstFit(e, base, claims, prefer);
      if (!t) return;
      claims[t] = (claims[t] || 0) + e.players;
      const n = base[t];
      out.push(S.update(COLL, e.id, { status: 'notified', notifiedAt: at, offerTime: t, holdUntil: new Date(now + HOLD_MIN * 60000).toISOString(),
        history: log(e, 'Notified: ' + n + (n === 1 ? ' place' : ' places') + ' open at ' + EN.time(t) + (reason ? ' (' + reason + ')' : '')) }));
    });
    return out;
  }
  function sweep() {
    const dates = {}; all().forEach(function (e) { if (isActive(e)) dates[e.date] = 1; });
    let n = []; Object.keys(dates).forEach(function (d) { n = n.concat(reconcile(d)); });
    return n;
  }

  /* ---------------- Public API ---------------- */
  const api = {
    COLL: COLL, HOLD_MIN: HOLD_MIN, WINDOWS: WINDOWS,
    windowOf: windowOf, timesFor: timesFor, contact: contact, isActive: isActive,
    /** "at 10:12 AM", "any time", "in the morning (before 11:00 AM)". en: English whatever the display language (stored history). */
    whenText: function (e, en) {
      if (e.time) return 'at ' + (en ? EN : fmt).time(e.time);
      const w = windowOf(e.window);
      return w.id === 'any' ? 'any time' : 'in the ' + w.label.toLowerCase() + ' (' + w.sub.charAt(0).toLowerCase() + w.sub.slice(1) + ')';
    },
    /** Who: { memberId } or { publicPlayerId }. Active entries, oldest first. */
    forPerson: function (who) {
      return all().filter(function (e) { return isActive(e) && (who.publicPlayerId ? e.publicPlayerId === who.publicPlayerId : e.memberId === who.memberId); })
        .sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || byQueue(a, b); });
    },
    /** Every entry on a day (staff), oldest first. */
    onDate: function (date) { return all().filter(function (e) { return e.date === date; }).sort(byQueue); },
    /** Place in line among golfers still waiting that day (1 = next to be told; those already told are not counted). */
    position: function (e) { return Math.max(1, all().filter(function (x) { return x.date === e.date && x.status === 'waiting'; }).sort(byQueue).indexOf(e) + 1); },
    /** Places this golfer could book at this time right now. */
    roomFor: function (e, time) { return eligible(e, e.date, time) ? baseRoom(e.date, time) : 0; },
    /** Is the notified spot still free for them? */
    offerOpen: function (e) { return e.status === 'notified' && !!e.offerTime && api.roomFor(e, e.offerTime) >= e.players; },
    /** Can this golfer ever play in this part of the day (rules only, future times)? */
    canWait: function (o, rulesOnly) { const e = Object.assign({ kind: o.publicPlayerId ? 'public' : 'member' }, o); return timesFor(e).some(function (t) { return eligible(e, e.date, t, rulesOnly); }); },

    /**
     * Ask to be told when a spot opens. o: { date, time | window, players, memberId | publicPlayerId }
     * Returns { ok, entry } or { ok: false, code: 'invalid' | 'closed' | 'none' | 'dup' | 'open', msg, entry, time }.
     */
    join: function (o) {
      const kind = o.publicPlayerId ? 'public' : 'member';
      const players = Math.max(1, Math.min(4, Math.round(+o.players || 1)));
      const e = { date: o.date, time: o.time || null, window: o.time ? null : (windowOf(o.window).id), players: players, kind: kind, memberId: kind === 'member' ? o.memberId : null, publicPlayerId: kind === 'public' ? o.publicPlayerId : null };
      const who = person(e);
      if (!validDate(e.date) || !who || (e.time && slotList().indexOf(e.time) < 0)) return { ok: false, code: 'invalid', msg: 'That tee time could not be found.' };
      const R = Club.teeRules;
      const open = R ? R.bookingOpen(kind, kind === 'member' ? who : null, e.date) : { ok: e.date >= today() };
      if (!open.ok) return { ok: false, code: 'closed', msg: open.reason };
      const dup = api.forPerson(kind === 'public' ? { publicPlayerId: e.publicPlayerId } : { memberId: e.memberId }).find(function (x) { return x.date === e.date; });
      if (dup) return { ok: false, code: 'dup', entry: dup, msg: 'You are already on the waitlist for ' + fmt.dateShort(e.date) + ', ' + api.whenText(dup) + '.' };
      if (!api.canWait(e)) return { ok: false, code: 'none', msg: !api.canWait(e, true) ? (kind === 'public' ? 'There are no public tee times left then.' : 'Your membership does not play at these times.') : 'You already have a round close to these times.' };
      const base = {}; timesFor(e).forEach(function (t) { base[t] = baseRoom(e.date, t); });
      const now = Date.now(); const claims = {};
      all().forEach(function (x) { if (x.date === e.date && held(x, now)) claims[x.offerTime] = (claims[x.offerTime] || 0) + x.players; });
      const free = firstFit(e, base, claims);
      if (free) return { ok: false, code: 'open', time: free, msg: 'There is a spot open at ' + fmt.time(free) + ' right now.' };
      e.had = S.all('teeTimes').filter(function (t) { return t.date === e.date && t.status !== 'cancelled' && inGroup(t, e); }).map(function (t) { return t.id; });
      e.status = 'waiting'; e.notifiedAt = null; e.offerTime = null; e.holdUntil = null;
      e.history = [{ at: stamp(), text: 'Joined the waitlist for ' + players + (players === 1 ? ' player' : ' players') + ', ' + api.whenText(e, true) }];
      return { ok: true, entry: S.insert(COLL, Object.assign({ id: S.uid('wl'), createdAt: stamp() }, e)) };
    },
    /** Leave the list (by: 'golfer' | 'staff'). The place passes to the next in line. */
    remove: function (id, by) {
      const e = S.find(COLL, id); if (!e || !isActive(e)) return null;
      const doc = S.update(COLL, id, { status: 'removed', removedAt: stamp(), removedBy: by || 'golfer', history: log(e, by === 'staff' ? 'Removed by the golf shop' : 'Left the waitlist') });
      reconcile(e.date);
      return doc;
    },
    /**
     * A cancellation or withdrawal freed places at date (and time, when known). Call it from every path that
     * cancels a tee time or removes players. reason is kept in the history. Returns the entries notified now.
     */
    released: function (date, time, reason) { try { return reconcile(date, reason || 'a spot opened', time || null); } catch (e) { console.error('Waitlist release failed', e); return []; } },
    sweep: sweep,
    reconcile: reconcile
  };
  Club.waitlist = api;

  /* Safety net: any change to tee times (another path, another tab, a released block) re-checks the queue
     once the change settles. Expired holds and past days are handled on load and every minute. */
  let timer = null;
  function soon() { clearTimeout(timer); timer = setTimeout(function () { try { sweep(); } catch (e) { console.error('Waitlist sweep failed', e); } }, 0); }
  S.subscribe('teeTimes', soon);
  S.subscribe('teeBlocks', soon);
  S.subscribe('$external', soon);
  document.addEventListener('DOMContentLoaded', function () {
    try { sweep(); } catch (e) { console.error('Waitlist sweep failed', e); }
    setInterval(function () { if (all().some(isActive)) soon(); }, 60000);
  });
})();
