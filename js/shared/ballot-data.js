/* Club.ballot: the weekend and holiday tee time ballot (2025 Membership Handbook, page 11, "Tee time booking procedures").
   Loaded by the staff page (index.html) and the members' portal (member.html), after the tee sheet and member data.

   THE HANDBOOK
     Weekdays (Monday to Friday): online and daily self-booking, as before.
     Weekends (Saturday, Sunday and holidays): ballot system. "Enter ballots 13-15 days in advance. Example: on Friday you
     can enter ballots to play for the 2 weeks ahead for a Saturday." "Saturday draw (12:00pm) will be done on the Sunday
     following the cut-off (13 days prior). Sunday draw (12:00pm) will be done on the Monday following the cut-off (13 days
     prior)." "Phone in and online tee times will still be accepted after the ballot draw." "All membership categories may
     use the ballot system." A member account (the portal sign-in) is needed.

   THE DATE RULES AS BUILT (D = the day of play; all times are the club's local time)
     Ballot day:      Saturday, Sunday, or a holiday in Club.teeRules (a holiday on a weekday counts as a weekend day).
     Entries open:    12:00 AM, 15 days before D (D - 15).
     Entries close:   12:00 PM, 13 days before D (D - 13), the moment the draw runs. So entries are taken on the 15th,
                      14th and 13th day before ("13-15 days in advance"); the cut-off is the draw itself.
     Draw:            12:00 PM on D - 13. For a Saturday that is the Sunday 13 days before, for a Sunday the Monday 13 days
                      before, exactly as the handbook says.
     Holiday on a weekday: the same rule, so the draw is at 12:00 PM on D - 13, the day after the 14th day before
                      (the analogous "day following the cut-off"). Example: Victoria Day, Monday May 18, 2026: entries
                      open Sunday May 3, draw Tuesday May 5 at 12:00 PM.
     Example:         Saturday, December 5, 2026: entries open Friday, November 20 (the handbook's "on Friday ... for a
                      Saturday two weeks ahead"); draw Sunday, November 22 at 12:00 PM.
                      Sunday, December 6, 2026: entries open Saturday, November 21; draw Monday, November 23 at 12:00 PM.
     After the draw:  ordinary booking opens for the times still free (members within their category's advance days,
                      phone-ins through the golf shop). Before the window opens, a ballot day cannot be booked or entered.

   DATA
     ballotEntries  { id, date, memberId (lead), players: [{ memberId, name, type: 'member'|'guest', hostId, cart, pays,
                      phone, email, handicap }] (up to 4, lead first), time (preferred 'HH:MM'), range (minutes either side,
                      0 to 720), earliest, latest ('HH:MM', the window derived from time and range), holes (18|9), notes,
                      source ('portal'|'staff'), enteredBy, createdAt, updatedAt,
                      status: 'entered'|'won'|'missed'|'withdrawn', teeTimeId, drawnTime, missedReason, withdrawnAt,
                      seenAt (the member closed the result notice) }
     ballotDraws    { id: 'bd_YYYYMMDD', date, ranAt, by: 'auto'|'staff', staffName, demo, seed, order: [entry ids in draw
                      order], open (free tee times before the draw), results: [{ entryId, memberId, status, time, teeTimeId,
                      reason }] }. The record is the draw's marker: a date is drawn once.

   THE DRAW (draw(date))
     1. The entries still 'entered' are sorted by id, then shuffled with a pseudo-random sequence seeded from the date
        (FNV-1a hash of "St. Boniface ballot YYYY-MM-DD" into mulberry32). Anyone can re-run drawOrder(date) and get the
        same order, so the draw is reproducible and auditable; the order and seed are kept on the draw record.
     2. In that order, each entry gets the free tee time closest to its preferred time (ties go to the earlier time) that
        is inside its window, where every member in the group may play under their own category (Club.teeRules), where no
        member already has a round too close (the staff overlap rule), and where the guest limit (Member Guest Policy,
        Club.teeRules.guestLimit) allows each member's guests. A time is free when it has no tee time (any booking at
        all, including staff bookings and shotguns), is not inside a staff block, and nobody is holding it right now.
     3. A placed entry becomes a booked tee time ('tt_bal_<entry id>', source 'ballot') and the entry is 'won'. An entry
        that cannot be placed is 'missed' with the reason. Results show in the portal (Tee times and Home) and on the
        staff Weekend ballot page.
     The draw runs by itself on whichever page (staff or portal) loads first after 12:00 PM on draw day (runDue). The
     staff page also has "Run draw now (demo)" so the demo can be tried before draw day; it closes entries early and has
     Undo. Once drawn, results are final; staff change the tee times on the Tee Sheet as usual. */
(function () {
  'use strict';
  const S = Club.store, fmt = Club.fmt;
  const EN = Club.fmtEn || fmt;
  const OPEN_DAYS = 15, DRAW_DAYS = 13, DRAW_TIME = '12:00', MAX_PLAYERS = 4;
  const ANY = 720;                                            /* range meaning "any time of day" */

  /* ---------------- Helpers ---------------- */
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function TS() { return (Club.shared && Club.shared.teesheet) || null; }
  function settings() { const d = { interval: 9, first: '06:30', last: '19:00' }; return Object.assign(d, S.getObj('teeSheetSettings', {}) || {}); }
  function slotList() {
    if (TS()) return TS().slotList();
    const s = settings(), out = [], step = Math.max(5, +s.interval || 9);
    for (let m = toMin(s.first); m <= toMin(s.last); m += step) out.push(toHM(m));
    return out;
  }
  function pace(h) { const P = (Club.teeSheet && Club.teeSheet.PACE_TARGET) || { 18: 255, 9: 135 }; return P[h] || P[18] || 255; }
  function TR() { return Club.teeRules || null; }
  function at(iso, hm) { const d = fmt.toDate(iso); d.setHours(0, toMin(hm), 0, 0); return d.getTime(); }
  function addDays(iso, n) { return Club.date.addDays(iso, n); }
  function today() { return Club.date.today(); }
  function member(id) { return id ? S.find('members', id) : null; }
  function nameOf(m) { return m ? m.firstName + ' ' + m.lastName : 'Member'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------------- Dates ---------------- */
  function isBallotDay(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    if (TR() && TR().isWeekendOrHoliday) return TR().isWeekendOrHoliday(iso);
    const d = fmt.toDate(iso).getDay(); return d === 0 || d === 6;
  }
  /** { date, kind: 'Saturday'|'Sunday'|'holiday', holiday, opensOn, opensAt, drawOn, drawAt } (null on other days). */
  function schedule(iso) {
    if (!isBallotDay(iso)) return null;
    const dow = fmt.toDate(iso).getDay(), hol = TR() && TR().holidayName ? TR().holidayName(iso) : null;
    const opensOn = addDays(iso, -OPEN_DAYS), drawOn = addDays(iso, -DRAW_DAYS);
    return { date: iso, kind: dow === 6 ? 'Saturday' : dow === 0 ? 'Sunday' : 'holiday', holiday: hol || null,
      opensOn: opensOn, opensAt: at(opensOn, '00:00'), drawOn: drawOn, drawAt: at(drawOn, DRAW_TIME), drawTime: DRAW_TIME };
  }
  function drawRecord(iso) { return S.find('ballotDraws', 'bd_' + String(iso).replace(/-/g, '')); }
  /** 'none' (not a ballot day) | 'past' | 'before' (entries not open yet) | 'open' | 'due' (draw time passed, not run) | 'drawn' */
  function phase(iso, nowMs) {
    const s = schedule(iso); if (!s) return 'none';
    if (iso < today()) return 'past';
    if (drawRecord(iso)) return 'drawn';
    const now = nowMs == null ? Date.now() : nowMs;
    if (now < s.opensAt) return 'before';
    if (now < s.drawAt) return 'open';
    return 'due';
  }
  /** Ordinary booking is closed on this date because of the ballot (before the window, while open, or draw due). */
  function blocksBooking(iso, nowMs) { const p = phase(iso, nowMs); return p === 'before' || p === 'open' || p === 'due'; }

  /* ---------------- Rules shared by entries and the draw ---------------- */
  function canPlay(m, iso, t) { return TR() ? TR().memberCanPlay(m, iso, t) : { ok: true, reason: '' }; }
  /** Member Guest Policy: { max, prime, label }. Club.teeRules.guestLimit when present, else the handbook rule itself. */
  function guestLimit(iso, t) {
    if (TR() && typeof TR().guestLimit === 'function') return TR().guestLimit(iso, t);
    const m = toMin(t), fri = fmt.toDate(iso).getDay() === 5, am = isBallotDay(iso) && m >= 360 && m < 660;
    return { max: fri || am ? 1 : 3, prime: fri || am, label: fri || am ? 'Prime time: one guest per member' : 'Up to three guests per member' };
  }
  /** Guests each member brings: { memberId: n }. A guest without a host belongs to the lead. */
  function guestsByHost(players, leadId) {
    const out = {};
    (players || []).forEach(function (p) { if (p && p.type === 'guest') { const h = p.hostId || leadId; out[h] = (out[h] || 0) + 1; } });
    return out;
  }
  function mostGuests(players, leadId) { const g = guestsByHost(players, leadId); return Object.keys(g).reduce(function (a, k) { return Math.max(a, g[k]); }, 0); }
  /** Billing standing (Club.billing.standing, when present): { ok, reason }. */
  function standing(memberId) {
    if (!Club.billing || typeof Club.billing.standing !== 'function') return { ok: true, reason: '' };
    let s = null; try { s = Club.billing.standing(memberId); } catch (e) { s = null; }
    if (s && s.canBook === false) return { ok: false, reason: s.reason || 'This account is on hold. Please call the golf shop.' };
    return { ok: true, reason: '' };
  }
  function windowOf(time, range) {
    const sl = slotList(), first = sl[0] || '06:30', last = sl[sl.length - 1] || '19:00';
    const r = Math.max(0, Math.min(ANY, +range || 0));
    if (r >= ANY) return { earliest: first, latest: last };
    return { earliest: toHM(Math.max(toMin(first), toMin(time) - r)), latest: toHM(Math.min(toMin(last), toMin(time) + r)) };
  }
  function slotsIn(e) { const a = toMin(e.earliest), b = toMin(e.latest); return slotList().filter(function (t) { const m = toMin(t); return m >= a && m <= b; }); }
  function memberPlayers(e) { return (e.players || []).filter(function (p) { return p && p.type === 'member' && p.memberId; }); }
  /** Can every member in the group play at t (category times), and do the guest numbers fit the policy there? '' or why not. */
  function groupFits(e, iso, t) {
    const ms = memberPlayers(e);
    for (let i = 0; i < ms.length; i++) {
      const m = member(ms[i].memberId); if (!m) return 'member';
      const r = canPlay(m, iso, t); if (!r.ok) return 'play';
    }
    if (mostGuests(e.players, e.memberId) > guestLimit(iso, t).max) return 'guests';
    return '';
  }
  function clash(memberId, iso, t, holes, list) {
    const b = toMin(t);
    return list.some(function (x) {
      if (x.date !== iso || x.status === 'cancelled' || x.status === 'no-show') return false;
      const a = toMin(x.time);
      return (a <= b ? b - a < pace(x.holes) : a - b < pace(holes)) && (x.players || []).some(function (q) { return q.memberId === memberId; });
    });
  }

  /* ---------------- Entries ---------------- */
  function entries(iso) { return S.where('ballotEntries', function (e) { return e.date === iso; }); }
  function live(e) { return e && e.status !== 'withdrawn'; }
  function forMember(memberId) {
    return S.where('ballotEntries', function (e) { return live(e) && (e.memberId === memberId || (e.players || []).some(function (p) { return p.memberId === memberId; })); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function entryFor(memberId, iso) { return forMember(memberId).find(function (e) { return e.date === iso; }) || null; }

  /** Problems with an entry (new or changed) as plain English sentences. opts: { excludeId, staff, nowMs } */
  function check(d, opts) {
    opts = opts || {};
    const errs = [];
    const iso = d.date, lead = member(d.memberId);
    const ph = phase(iso, opts.nowMs);
    if (ph === 'none') return ['Ballots are for Saturdays, Sundays and holidays only.'];
    if (ph === 'past') return ['That date has passed.'];
    if (ph === 'before') { const s = schedule(iso); return ['The ballot for ' + fmt.dateShort(iso) + ' opens on ' + fmt.toDate(s.opensOn).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + '.']; }
    if (ph === 'drawn' || ph === 'due') return ['The draw for ' + fmt.dateShort(iso) + ' has been made. Book any time still open instead.'];
    if (!lead) return ['Choose the member entering the ballot.'];
    if (lead.status !== 'active' && lead.status !== 'leave') errs.push((opts.staff ? nameOf(lead) + '’s' : 'Your') + ' membership does not allow booking right now.');
    const st = standing(lead.id); if (!st.ok) errs.push(st.reason);
    const players = d.players || [];
    if (!players.length || players[0].memberId !== lead.id) errs.push('The member entering must be the first player.');
    if (players.length > MAX_PLAYERS) errs.push('A group can have at most four players.');
    if (players.some(function (p) { return p.type === 'guest' && !String(p.name || '').trim(); })) errs.push('Please enter a name for each guest.');
    if (!/^\d{2}:\d{2}$/.test(String(d.time || ''))) errs.push('Choose a preferred time.');
    if (+d.holes !== 9 && +d.holes !== 18) errs.push('Choose 9 or 18 holes.');
    if (errs.length) return errs;
    /* One ballot entry per member per day, as the lead or as a player. */
    const seen = {};
    memberPlayers(d).forEach(function (p) {
      if (seen[p.memberId]) { errs.push(nameOf(member(p.memberId)) + ' is in the group twice.'); return; }
      seen[p.memberId] = 1;
      const m = member(p.memberId);
      if (!m) { errs.push((p.name || 'A player') + ' is no longer a member.'); return; }
      if (m.status !== 'active' && m.status !== 'leave') { errs.push(nameOf(m) + ' cannot play at present.'); return; }
      const other = entries(iso).find(function (e) { return live(e) && e.id !== opts.excludeId && (e.players || []).some(function (q) { return q.memberId === p.memberId; }); });
      if (other) errs.push((p.memberId === lead.id && !opts.staff ? 'You are' : nameOf(m) + ' is') + ' already in a ballot entry for ' + fmt.dateShort(iso) + (other.memberId !== p.memberId ? ' (entered by ' + nameOf(member(other.memberId)) + ')' : '') + '.');
    });
    if (errs.length) return errs;
    /* Somewhere in the window every member can play and the guests fit. */
    const w = windowOf(d.time, d.range), e = { players: players, memberId: lead.id, earliest: w.earliest, latest: w.latest };
    const times = slotsIn(e);
    if (!times.some(function (t) { return !groupFits(e, iso, t); })) {
      const why = times.map(function (t) { return groupFits(e, iso, t); });
      if (why.indexOf('guests') >= 0 && why.every(function (x) { return x === 'guests' || x === 'play'; }) && times.some(function (t) { return groupFits(Object.assign({}, e, { players: players.filter(function (p) { return p.type !== 'guest'; }) }), iso, t) === ''; })) {
        const g = guestLimit(iso, d.time);
        errs.push('Too many guests for this time. ' + g.label + '. Choose a later time or bring fewer guests.');
      } else {
        const who = memberPlayers(d).map(function (p) { return member(p.memberId); }).filter(function (m) { return !times.some(function (t) { return canPlay(m, iso, t).ok; }); });
        errs.push(who.length ? who.map(function (m) { const r = canPlay(m, iso, d.time); return (m.id === lead.id && !opts.staff ? 'You' : nameOf(m)) + ' cannot play in this window. ' + r.reason; }).join(' ') : 'There is no time in this window that suits every player. Widen the range or choose another preferred time.');
      }
    }
    return errs;
  }
  function cleanPlayers(players, leadId) {
    return (players || []).slice(0, MAX_PLAYERS).map(function (p) {
      const m = p.type === 'member' ? member(p.memberId) : null;
      const o = { memberId: m ? m.id : null, name: m ? nameOf(m) : String(p.name || '').trim(), type: m ? 'member' : 'guest', cart: !!p.cart };
      if (o.type === 'guest') {
        o.hostId = p.hostId || leadId; o.pays = p.pays === 'shop' ? 'shop' : 'host';
        if (p.phone) o.phone = p.phone; if (p.email) o.email = p.email; if (typeof p.handicap === 'number') o.handicap = p.handicap;
      }
      return o;
    });
  }
  function docFrom(d) {
    const w = windowOf(d.time, d.range);
    return { date: d.date, memberId: d.memberId, players: cleanPlayers(d.players, d.memberId), time: d.time, range: Math.max(0, Math.min(ANY, +d.range || 0)),
      earliest: w.earliest, latest: w.latest, holes: +d.holes === 9 ? 9 : 18, notes: String(d.notes || '').trim().slice(0, 240) };
  }
  /** Enter the ballot. d: { date, memberId, players, time, range, holes, notes }; opts: { staff, staffName, nowMs }. { ok, errs, doc } */
  function enter(d, opts) {
    opts = opts || {};
    const errs = check(d, opts); if (errs.length) return { ok: false, errs: errs };
    const doc = S.insert('ballotEntries', Object.assign(docFrom(d), { status: 'entered', source: opts.staff ? 'staff' : 'portal', enteredBy: opts.staff ? (opts.staffName || 'Staff') : d.memberId, teeTimeId: null }));
    return { ok: true, errs: [], doc: doc };
  }
  /** Change an entry before the draw. { ok, errs, doc } */
  function change(id, d, opts) {
    opts = opts || {};
    const cur = S.find('ballotEntries', id);
    if (!cur || cur.status !== 'entered') return { ok: false, errs: ['This ballot entry can no longer be changed.'] };
    const next = Object.assign({}, cur, d, { date: cur.date });
    const errs = check(next, Object.assign({}, opts, { excludeId: id })); if (errs.length) return { ok: false, errs: errs };
    return { ok: true, errs: [], doc: S.update('ballotEntries', id, docFrom(next)) };
  }
  /** Withdraw an entry before the draw. { ok, reason } */
  function withdraw(id, opts) {
    opts = opts || {};
    const cur = S.find('ballotEntries', id);
    if (!cur || cur.status !== 'entered') return { ok: false, reason: 'This ballot entry can no longer be withdrawn.' };
    if (phase(cur.date, opts.nowMs) !== 'open') return { ok: false, reason: 'The draw for ' + fmt.dateShort(cur.date) + ' has been made.' };
    S.update('ballotEntries', id, { status: 'withdrawn', withdrawnAt: new Date().toISOString(), withdrawnBy: opts.staff ? (opts.staffName || 'Staff') : cur.memberId });
    return { ok: true, reason: '' };
  }

  /* ---------------- The draw ---------------- */
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seedFor(iso) { return hash('St. Boniface ballot ' + iso); }
  /** The fair draw order: entry ids sorted, then a Fisher-Yates shuffle seeded from the date. Same input, same order. */
  function drawOrder(iso, list) {
    const ids = (list || entries(iso).filter(function (e) { return e.status === 'entered'; })).map(function (e) { return e.id; }).sort();
    const rnd = mulberry(seedFor(iso));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    return ids;
  }
  /** Free tee times on a date right now: no tee time, no staff block, nobody holding it. */
  function freeTimes(iso, list) {
    const blocks = S.where('teeBlocks', function (b) { return b.date === iso; });
    const taken = {}; list.forEach(function (x) { if (x.date === iso && x.status !== 'cancelled') taken[x.time] = 1; });
    return slotList().filter(function (t) {
      if (taken[t]) return false;
      if (blocks.some(function (b) { return t >= b.start && t < b.end; })) return false;
      if (Club.holds && Club.holds.heldByOthers(iso, t)) return false;
      return true;
    });
  }
  /** Work out the results without saving anything (also used by tests). { order, results, open, seed } */
  function plan(iso) {
    const pending = entries(iso).filter(function (e) { return e.status === 'entered'; });
    const byId = {}; pending.forEach(function (e) { byId[e.id] = e; });
    const order = drawOrder(iso, pending);
    const tees = S.all('teeTimes').filter(function (x) { return x.date === iso; }).slice();
    const free = freeTimes(iso, tees); const open = free.length;
    const results = order.map(function (id) {
      const e = byId[id], lead = member(e.memberId);
      const res = { entryId: id, memberId: e.memberId, status: 'missed', time: null, teeTimeId: null, reason: '' };
      if (!lead || (lead.status !== 'active' && lead.status !== 'leave')) { res.reason = 'The membership does not allow booking.'; return res; }
      const st = standing(lead.id); if (!st.ok) { res.reason = st.reason; return res; }
      const pref = toMin(e.time), a = toMin(e.earliest), b = toMin(e.latest);
      let why = { play: 0, guests: 0, clash: 0 };
      const cands = free.filter(function (t) { const m = toMin(t); return m >= a && m <= b; })
        .filter(function (t) {
          const g = groupFits(e, iso, t); if (g) { why[g === 'guests' ? 'guests' : 'play']++; return false; }
          if (memberPlayers(e).some(function (p) { return clash(p.memberId, iso, t, e.holes, tees); })) { why.clash++; return false; }
          return true;
        })
        .sort(function (x, y) { return Math.abs(toMin(x) - pref) - Math.abs(toMin(y) - pref) || toMin(x) - toMin(y); });
      if (!cands.length) {
        res.reason = !free.some(function (t) { const m = toMin(t); return m >= a && m <= b; })
          ? 'Every tee time from ' + EN.time(e.earliest) + ' to ' + EN.time(e.latest) + ' went to entries drawn earlier.'
          : why.clash && !why.play && !why.guests ? 'A player already has a round close to the times left in the window.'
          : 'No time left in the window suits every player’s play times and the guest policy.';
        return res;
      }
      const t = cands[0];
      res.status = 'won'; res.time = t; res.teeTimeId = 'tt_bal_' + id;
      free.splice(free.indexOf(t), 1);
      tees.push({ date: iso, time: t, holes: e.holes, status: 'booked', players: e.players });
      return res;
    });
    return { order: order, results: results, open: open, seed: seedFor(iso) };
  }
  /** Run the draw for a date once: tee times for the winners, results on each entry and the draw record.
      opts: { by: 'auto'|'staff', staffName, demo, nowMs }. { ok, reason, record } */
  function draw(iso, opts) {
    opts = opts || {};
    if (!isBallotDay(iso)) return { ok: false, reason: 'Not a ballot day.' };
    if (drawRecord(iso)) return { ok: false, reason: 'The draw for ' + EN.dateShort(iso) + ' has already been made.' };
    const ph = phase(iso, opts.nowMs);
    if (ph === 'past') return { ok: false, reason: 'That date has passed.' };
    if (ph === 'before') return { ok: false, reason: 'Entries for ' + EN.dateShort(iso) + ' are not open yet.' };
    if (ph === 'open' && !opts.demo) return { ok: false, reason: 'The draw runs at ' + EN.time(DRAW_TIME) + ' on ' + EN.dateShort(schedule(iso).drawOn) + '.' };
    const p = plan(iso), byId = {};
    entries(iso).forEach(function (e) { byId[e.id] = e; });
    const nowIso = new Date().toISOString();
    p.results.forEach(function (r) {
      const e = byId[r.entryId];
      if (r.status === 'won') {
        if (!S.find('teeTimes', r.teeTimeId)) {
          S.insert('teeTimes', { id: r.teeTimeId, date: iso, time: r.time, holes: e.holes, players: e.players.map(function (x) { return Object.assign({}, x, { paid: false }); }),
            status: 'booked', notes: e.notes ? nameOf(member(e.memberId)).split(' ').slice(-1)[0] + ': ' + e.notes : '', eventId: null, startedAt: null, finishedAt: null,
            bookedBy: e.memberId, source: 'ballot', ballotEntryId: e.id, createdAt: nowIso });
        }
        S.update('ballotEntries', e.id, { status: 'won', teeTimeId: r.teeTimeId, drawnTime: r.time, drawnAt: nowIso });
      } else S.update('ballotEntries', e.id, { status: 'missed', missedReason: r.reason, drawnAt: nowIso });
    });
    const rec = S.insert('ballotDraws', { id: 'bd_' + iso.replace(/-/g, ''), date: iso, ranAt: nowIso, by: opts.by || 'auto', staffName: opts.staffName || null, demo: !!opts.demo,
      seed: p.seed, order: p.order, open: p.open, results: p.results });
    return { ok: true, reason: '', record: rec };
  }
  /** Run every draw that is due (ballot days from today to 13 days ahead whose draw time has passed). Idempotent. */
  function runDue(nowMs) {
    const now = nowMs == null ? Date.now() : nowMs, done = [];
    for (let i = 0; i <= DRAW_DAYS; i++) {
      const iso = Club.date.fromToday(i);
      if (phase(iso, now) !== 'due') continue;
      try { const r = draw(iso, { by: 'auto', nowMs: now }); if (r.ok) done.push(iso); } catch (e) { console.error('Ballot draw failed for ' + iso, e); }
    }
    return done;
  }
  /** Ballot days on the calendar from `from` for `days` days: [{ date, phase, schedule, entries (live), players }]. */
  function upcoming(from, days) {
    const out = [];
    for (let i = 0; i < days; i++) {
      const iso = addDays(from, i); const s = schedule(iso); if (!s) continue;
      const list = entries(iso).filter(live);
      out.push({ date: iso, phase: phase(iso), schedule: s, entries: list, players: list.reduce(function (a, e) { return a + (e.players || []).length; }, 0), draw: drawRecord(iso) });
    }
    return out;
  }

  Club.ballot = {
    OPEN_DAYS: OPEN_DAYS, DRAW_DAYS: DRAW_DAYS, DRAW_TIME: DRAW_TIME, MAX_PLAYERS: MAX_PLAYERS, ANY: ANY,
    isBallotDay: isBallotDay, schedule: schedule, phase: phase, blocksBooking: blocksBooking,
    entries: entries, entry: function (id) { return S.find('ballotEntries', id); }, forMember: forMember, entryFor: entryFor,
    check: check, enter: enter, change: change, withdraw: withdraw,
    windowOf: windowOf, guestLimit: guestLimit, guestsByHost: guestsByHost, standing: standing,
    drawOrder: drawOrder, seedFor: seedFor, plan: plan, draw: draw, runDue: runDue, drawRecord: drawRecord, upcoming: upcoming,
    /** The member closed the result notice for this entry (portal). */
    seen: function (id) { const e = S.find('ballotEntries', id); if (e && !e.seenAt) S.update('ballotEntries', id, { seenAt: new Date().toISOString() }); }
  };

  /* ---------------- Demo (once per browser, 'demoBackfills' marker 'ballot1') ----------------
     1. Results for the last drawn Saturday and Sunday the demo tee sheet already covers: the morning groups already on
        the sheet become the winning entries (linked to those tee times, nothing on the sheet changes), a few members who
        are not playing that morning missed, and the demo member Dave missed on the Saturday and won on the Sunday (a tee
        time is added for him when he has none that morning).
     2. Entries for every ballot day whose window is open now (on a Friday: the Saturday two weeks ahead), mostly asking
        for the same busy early morning, so a draw leaves some missed. Dave is left out so he can enter himself. */
  const MARK = 'ballot1';
  function demo() {
    if (S.find('demoBackfills', MARK) || !S.all('members').length || !S.all('teeTimes').length) return;
    const R = S.R; R.reseed(5512);
    const DAVE = S.DEMO_MEMBER || 'mem_1003';
    const golfers = S.all('members').filter(function (m) { return m.status === 'active' && m.id !== DAVE && TR() && TR().tierRules(m).golf && !TR().tierRules(m).vouchers; });
    const td = today(), nowMs = Date.now();
    const ins = function (doc) { return S.insert('ballotEntries', doc); };
    const isoAt = function (ms) { return new Date(ms).toISOString(); };
    const pickTime = function (s) { return isoAt(s.opensAt + R.int(30, Math.max(31, Math.floor((Math.min(nowMs, s.drawAt) - s.opensAt) / 60000) - 5)) * 60000); };
    let made = { results: [], open: [] };

    /* 1. The last drawn Saturday and Sunday inside the demo sheet (14 days ahead). */
    const drawn = [];
    for (let i = DRAW_DAYS; i >= 2 && drawn.length < 2; i--) {
      const iso = Club.date.fromToday(i); const s = schedule(iso);
      if (!s || s.kind === 'holiday' || drawRecord(iso) || s.drawAt > nowMs) continue;
      if (drawn.some(function (x) { return fmt.toDate(x).getDay() === fmt.toDate(iso).getDay(); })) continue;
      drawn.push(iso);
    }
    drawn.forEach(function (iso) {
      const s = schedule(iso);
      const tees = S.where('teeTimes', function (x) { return x.date === iso && x.status === 'booked' && toMin(x.time) < 660 && x.source !== 'ballot'; })
        .filter(function (x) { const h = (x.players || [])[0]; return h && h.type === 'member' && h.memberId && h.memberId !== DAVE; })
        .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      const busy = {}; S.where('teeTimes', function (x) { return x.date === iso && x.status !== 'cancelled'; }).forEach(function (x) { (x.players || []).forEach(function (p) { if (p.memberId) busy[p.memberId] = 1; }); });
      const list = [];
      tees.forEach(function (tt) {
        const r = R.pick([30, 30, 60, 60, 120]); const pref = toHM(toMin(tt.time) + R.pick([-18, -9, 0, 0, 0, 9, 18]));
        const w = windowOf(pref, r);
        if (toMin(tt.time) < toMin(w.earliest) || toMin(tt.time) > toMin(w.latest)) return;
        const e = ins({ date: iso, memberId: tt.players[0].memberId, players: tt.players.map(function (p) { const o = Object.assign({}, p); delete o.paid; return o; }), time: pref, range: r, earliest: w.earliest, latest: w.latest,
          holes: tt.holes || 18, notes: '', status: 'won', source: R.chance(0.8) ? 'portal' : 'staff', enteredBy: tt.players[0].memberId, teeTimeId: tt.id, drawnTime: tt.time, drawnAt: isoAt(s.drawAt), createdAt: pickTime(s) });
        list.push({ entryId: e.id, memberId: e.memberId, status: 'won', time: tt.time, teeTimeId: tt.id, reason: '' });
      });
      const free = golfers.filter(function (m) { return !busy[m.id] && canPlay(m, iso, '07:30').ok; });
      for (let k = 0; k < 4 && free.length; k++) {
        const m = free.splice(R.int(0, free.length - 1), 1)[0]; const pref = R.pick(['07:00', '07:30', '08:00']);
        const w = windowOf(pref, 30);
        const e = ins({ date: iso, memberId: m.id, players: [{ memberId: m.id, name: nameOf(m), type: 'member', cart: R.chance(0.4) }], time: pref, range: 30, earliest: w.earliest, latest: w.latest,
          holes: 18, notes: '', status: 'missed', source: 'portal', enteredBy: m.id, teeTimeId: null, missedReason: 'Every tee time from ' + EN.time(w.earliest) + ' to ' + EN.time(w.latest) + ' went to entries drawn earlier.', drawnAt: isoAt(s.drawAt), createdAt: pickTime(s) });
        list.push({ entryId: e.id, memberId: m.id, status: 'missed', time: null, teeTimeId: null, reason: e.missedReason });
      }
      /* Dave: missed on the Saturday, won on the Sunday. */
      const dave = member(DAVE);
      if (dave && !busy[DAVE]) {
        const sat = s.kind === 'Saturday';
        const pref = '08:00', w = windowOf(pref, sat ? 30 : 60);
        const taken = {}; S.where('teeTimes', function (x) { return x.date === iso && x.status !== 'cancelled'; }).forEach(function (x) { taken[x.time] = 1; });
        const blocks = S.where('teeBlocks', function (b) { return b.date === iso; });
        const spot = sat ? null : slotList().filter(function (t) { return toMin(t) >= toMin(w.earliest) && toMin(t) <= toMin(w.latest) && !taken[t] && !blocks.some(function (b) { return t >= b.start && t < b.end; }) && canPlay(dave, iso, t).ok; })
          .sort(function (a, b) { return Math.abs(toMin(a) - 480) - Math.abs(toMin(b) - 480); })[0];
        const players = [{ memberId: DAVE, name: nameOf(dave), type: 'member', cart: true }, { memberId: null, name: 'Natalie Hollis', type: 'guest', cart: true, hostId: DAVE, pays: 'host' }];
        const base = { date: iso, memberId: DAVE, players: players, time: pref, range: sat ? 30 : 60, earliest: w.earliest, latest: w.latest, holes: 18, notes: '', source: 'portal', enteredBy: DAVE, drawnAt: isoAt(s.drawAt), createdAt: pickTime(s) };
        if (spot) {
          const id = S.uid('bal');
          S.insert('teeTimes', { id: 'tt_bal_' + id, date: iso, time: spot, holes: 18, players: players.map(function (p) { return Object.assign({}, p, { paid: false }); }), status: 'booked', notes: '', eventId: null, startedAt: null, finishedAt: null, bookedBy: DAVE, source: 'ballot', ballotEntryId: id, createdAt: isoAt(s.drawAt) });
          ins(Object.assign(base, { id: id, status: 'won', teeTimeId: 'tt_bal_' + id, drawnTime: spot }));
          list.push({ entryId: id, memberId: DAVE, status: 'won', time: spot, teeTimeId: 'tt_bal_' + id, reason: '' });
        } else {
          const e = ins(Object.assign(base, { status: 'missed', teeTimeId: null, missedReason: 'Every tee time from ' + EN.time(w.earliest) + ' to ' + EN.time(w.latest) + ' went to entries drawn earlier.' }));
          list.push({ entryId: e.id, memberId: DAVE, status: 'missed', time: null, teeTimeId: null, reason: e.missedReason });
        }
      }
      /* The recorded order: the seeded shuffle of these entries, results listed in that order. */
      const order = drawOrder(iso, list.map(function (r) { return { id: r.entryId }; }));
      const byE = {}; list.forEach(function (r) { byE[r.entryId] = r; });
      S.insert('ballotDraws', { id: 'bd_' + iso.replace(/-/g, ''), date: iso, ranAt: isoAt(s.drawAt), by: 'auto', staffName: null, demo: false, seed: seedFor(iso), order: order,
        open: null, results: order.map(function (id) { return byE[id]; }) });
      made.results.push(iso);
    });

    /* 2. Entries for every ballot day open now. */
    for (let i = DRAW_DAYS; i <= OPEN_DAYS; i++) {
      const iso = Club.date.fromToday(i); if (phase(iso, nowMs) !== 'open' || entries(iso).length) continue;
      const s = schedule(iso);
      const pool = golfers.slice(); const n = 22;
      for (let k = 0; k < n && pool.length; k++) {
        const lead = pool.splice(R.int(0, pool.length - 1), 1)[0];
        const r = TR().tierRules(lead);
        const w = r.windows && r.windows.weekend && r.windows.weekend[0] ? r.windows.weekend[0][0] : '06:30';
        const early = toMin(w) < 600;
        const pref = early ? R.pick(['07:00', '07:30', '07:30', '08:00', '08:00', '08:30', '09:00', '06:45']) : R.pick(['10:30', '11:00', '11:00', '11:30', '12:00', '13:00']);
        const range = R.pick([30, 30, 60, 60, 60, 120]);
        const players = [{ memberId: lead.id, name: nameOf(lead), type: 'member', cart: R.chance(0.5) }];
        const size = R.pick([1, 2, 2, 3, 4, 4]);
        for (let j = 1; j < size; j++) {
          if (R.chance(0.18) && !players.some(function (p) { return p.type === 'guest'; })) { players.push({ memberId: null, name: R.pick(['Jonathan', 'Caroline', 'Peter', 'Alicia', 'Graham', 'Simon']) + ' ' + R.pick(['Mercer', 'Quinlan', 'Brennan', 'Osborne', 'Rossi']), type: 'guest', cart: R.chance(0.5), hostId: lead.id, pays: 'host' }); continue; }
          const ok = pool.filter(function (m) { return canPlay(m, iso, pref).ok; }); if (!ok.length) break;
          const o = ok[R.int(0, ok.length - 1)]; pool.splice(pool.indexOf(o), 1);
          players.push({ memberId: o.id, name: nameOf(o), type: 'member', cart: R.chance(0.5) });
        }
        const d = { date: iso, memberId: lead.id, players: players, time: pref, range: range, holes: R.chance(0.1) ? 9 : 18, notes: '' };
        if (check(d, { staff: true, nowMs: nowMs }).length) continue;
        const staff = R.chance(0.15);
        ins(Object.assign(docFrom(d), { status: 'entered', source: staff ? 'staff' : 'portal', enteredBy: staff ? 'Golf shop' : lead.id, teeTimeId: null, createdAt: pickTime(s) }));
      }
      made.open.push(iso);
    }
    S.insert('demoBackfills', { id: MARK, at: new Date().toISOString(), results: made.results, open: made.open });
  }
  try { demo(); } catch (e) { console.error('Ballot demo data failed', e); }
  try { runDue(); } catch (e) { console.error('Ballot draws failed', e); }
})();
