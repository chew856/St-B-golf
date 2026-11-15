/* Tee sheet data: settings defaults, Club.teeSheet.PACE_TARGET, and the tee blocks, tee times and waitlist seeds (with the golf demo history).
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/teesheet.js, which reads these helpers from Club.shared.teesheet. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  /* ---------------- Settings & time helpers ---------------- */
  const DEFAULTS = { interval: 9, first: '06:30', last: '19:00', guestFee: 66, cartFee: 28 };
  /* Members' guests pay the public green fee ($66, tax included). The club does not publish a cart fee: 28 is a placeholder. */
  if (S.getObj('teeSheetSettings') === undefined) S.setObj('teeSheetSettings', Object.assign({}, DEFAULTS));
  function settings() { return Object.assign({}, DEFAULTS, S.getObj('teeSheetSettings', {}) || {}); }

  const PACE_TARGET = { 18: 255, 9: 135 };
  Club.teeSheet = Object.assign(Club.teeSheet || {}, { PACE_TARGET: PACE_TARGET });

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function slotList() { const s = settings(); const out = []; const step = Math.max(5, +s.interval || 9); for (let m = toMin(s.first); m <= toMin(s.last); m += step) out.push(toHM(m)); return out; }
  function closeHM() { const s = settings(); return toHM(toMin(s.last) + (+s.interval || 9)); }
  function blockAt(blocks, date, t) { return blocks.find(function (b) { return b.date === date && t >= b.start && t < b.end; }) || null; }

  /* ---------------- Seed ---------------- */
  S.seed('teeBlocks', function () {
    const out = []; let shotgunDone = false;
    for (let d = -14; d <= 14; d++) {
      const date = Club.date.fromToday(d); const dow = fmt.toDate(date).getDay();
      if (dow === 2) out.push({ id: 'tb_m' + date.replace(/-/g, ''), date: date, start: '06:30', end: '07:51', kind: 'maintenance', reason: 'Greens mowing and rolling' });
      if (dow === 3) out.push({ id: 'tb_l' + date.replace(/-/g, ''), date: date, start: '15:30', end: closeHM(), kind: 'league', reason: "Members' league night" });
      if (dow === 4) out.push({ id: 'tb_j' + date.replace(/-/g, ''), date: date, start: '10:30', end: '11:51', kind: 'event', reason: 'Junior golf' });
      if (dow === 6 && d > 0 && !shotgunDone) { shotgunDone = true; out.push({ id: 'tb_s' + date.replace(/-/g, ''), date: date, start: '07:30', end: '12:00', kind: 'shotgun', reason: 'Corporate tournament, shotgun start' }); }
      if (dow === 5) out.push({ id: 'tb_e' + date.replace(/-/g, ''), date: date, start: '16:00', end: closeHM(), kind: 'league', reason: 'Friday member play' });
    }
    return out;
  });

  let demoRefills = [];                                        /* waitlist entries that took a cancelled time (see demoHistory) */
  let seededNow = false;                                       /* the tee sheet was seeded on this load (demoHistory already ran) */
  S.seed('teeTimes', function () {
    seededNow = true;
    R.reseed(4410);
    const golfers = S.all('members').filter(function (m) { return m.tierId !== 'tier_social' && m.status === 'active'; });
    if (!golfers.length) return [];
    const guestFirst = ['Jonathan', 'Caroline', 'Peter', 'Alicia', 'Graham', 'Natalie', 'Simon', 'Lauren', 'Tristan', 'Helena', 'Marco', 'Yuki', 'Owen', 'Serena', 'Felix', 'Ingrid'];
    const guestLast = ['Hollis', 'Mercer', 'Abernathy', 'Quinlan', 'Vasquez', 'Brennan', 'Holloway', 'Tanaka', 'Osborne', 'Fitzgerald', 'Rossi', 'Sinclair', 'Delacroix', 'Wexford'];
    const notesPool = ['Pull cart for guest', 'Celebrating a 30th anniversary', 'Prefers the Silver tees', 'Rental clubs for guest', 'Playing a match, please do not pair', 'First visit to St. B for the guests'];
    const blocks = S.all('teeBlocks'); const slots = slotList(); const now = nowMin();
    const out = [];
    for (let d = -14; d <= 14; d++) {
      const date = Club.date.fromToday(d); const dow = fmt.toDate(date).getDay(); const weekend = dow === 0 || dow === 6;
      const used = {};
      // Same rule the booking form enforces: a member never has overlapping rounds.
      const pickMember = function (at) {
        for (let k = 0; k < 40; k++) {
          const m = R.pick(golfers); const u = used[m.id] || [];
          if (u.length < 2 && u.every(function (s) { return Math.abs(s - at) >= 270; })) { u.push(at); used[m.id] = u; return m; }
        }
        return null;
      };
      // Decide which tee times are taken, then size groups to the members available that day.
      const taken = slots.filter(function (t) {
        if (blockAt(blocks, date, t)) return false;
        const m = toMin(t);
        let p;
        if (m < 720) p = weekend ? 0.86 + R.rand() * 0.09 : (m < 540 ? 0.68 : 0.48);
        else if (m < 900) p = weekend ? 0.58 : 0.34;
        else p = weekend ? 0.42 : 0.28;
        if (dow === 5) p += 0.08;
        return R.chance(p);
      });
      const guestShare = weekend ? 0.24 : 0.14;
      const shuffle = function (a) { for (let k = a.length - 1; k > 0; k--) { const j = R.int(0, k); const tmp = a[k]; a[k] = a[j]; a[j] = tmp; } return a; };
      const seq = shuffle(taken.filter(function (t) { return toMin(t) < 720; })).concat(shuffle(taken.filter(function (t) { return toMin(t) >= 720; })));
      let budget = golfers.length * (weekend ? 1.65 : dow === 5 ? 1.3 : 1.05);
      seq.forEach(function (t, idx) {
        const m = toMin(t);
        const host = pickMember(m); if (!host) return;
        const avg = Math.max(0, budget) / (1 - guestShare) / (seq.length - idx);
        const size = Math.max(1, Math.min(4, Math.round(avg + (R.rand() * 1.6 - 0.8))));
        const holes = m >= 900 ? (R.chance(0.5) ? 9 : 18) : (R.chance(0.07) ? 9 : 18);
        const cartFor = function (mem) { const pref = mem.preferences && mem.preferences.cart; return pref === 'Cart' ? R.chance(0.9) : pref === 'Walk' ? R.chance(0.12) : R.chance(0.3); };
        const players = [{ memberId: host.id, name: host.firstName + ' ' + host.lastName, type: 'member', cart: cartFor(host), paid: false }];
        for (let i = 1; i < size; i++) {
          if (R.chance(guestShare)) players.push({ memberId: null, name: R.pick(guestFirst) + ' ' + R.pick(guestLast), type: 'guest', cart: R.chance(0.6), paid: false });
          else { const o = pickMember(m); if (o) players.push({ memberId: o.id, name: o.firstName + ' ' + o.lastName, type: 'member', cart: cartFor(o), paid: false }); }
        }
        budget -= players.filter(function (pl) { return pl.type === 'member'; }).length;
        const len = PACE_TARGET[holes];
        let status = 'booked', startedAt = null, finishedAt = null;
        if (d < 0 || (d === 0 && now >= m + len + 10)) {
          status = R.chance(0.03) ? 'no-show' : 'completed';
        } else if (d === 0 && now >= m) {
          status = 'on-course';
        } else if (d === 0 && now >= m - 25) {
          status = R.chance(0.75) ? 'checked-in' : 'booked';
        }
        if (status === 'completed') { const st = m + R.int(0, 6); startedAt = toHM(st); finishedAt = toHM(st + len + R.int(-14, 26)); }
        if (status === 'on-course') startedAt = toHM(Math.min(now, m + R.int(0, 4)));
        const paid = status === 'completed' || status === 'on-course' || status === 'checked-in';
        players.forEach(function (pl) { pl.paid = paid; });
        out.push({
          id: 'tt_' + date.replace(/-/g, '') + '_' + t.replace(':', ''), date: date, time: t, holes: holes, players: players,
          status: status, notes: R.chance(0.06) ? R.pick(notesPool) : '', eventId: null, startedAt: startedAt, finishedAt: finishedAt
        });
      });
    }
    demoHistory(out, golfers, out).forEach(function (x) { out.push(x); });
    return out;
  });

  /* Demo history for Reports > Golf: how each group booked, cancellations (more of them on wet days in the weather
     log, mostly the same morning), and cancelled places that golfers on the waitlist then took. Runs on its own seed
     sequence after the sheet above is drawn, so the tee sheet itself is unchanged. Cancelled records carry cancelledAt.
     list: the tee times to work on (changed in place); pool: every tee time, for clash checks. Returns the refill tee times. */
  function demoHistory(list, golfers, pool) {
    R.reseed(4418);
    const today = Club.date.today(), nowMs = Date.now();
    const wx = {}; S.all('weatherLog').forEach(function (w) { if (w && w.date) wx[w.date] = w; });
    const at = function (date, min) { const d = fmt.toDate(date); d.setHours(0, 0, 0, 0); d.setMinutes(min); return d.getTime(); };
    const playing = function (id, date, m) {
      return pool.some(function (x) { return x.date === date && x.status !== 'cancelled' && Math.abs(toMin(x.time) - m) < 270 && (x.players || []).some(function (p) { return p.memberId === id; }); });
    };
    const added = [];
    list.forEach(function (tt) {
      const src = R.chance(0.56) ? 'portal' : 'staff';
      if (tt.date <= today) tt.source = src;                   /* history only, to keep the store small */
      if (tt.date === today) return;
      const past = tt.date < today, m = toMin(tt.time), start = at(tt.date, m);
      if (past && tt.status === 'completed' && tt.startedAt && tt.finishedAt) {
        /* Full groups and busy weekend mornings play slower; quiet late-day twosomes a little quicker. */
        const dow = fmt.toDate(tt.date).getDay(), n = tt.players.length;
        const slow = (n - 2) * R.int(1, 5) + ((dow === 0 || dow === 6) && m < 720 ? R.int(4, 16) : 0) + (dow === 5 && m >= 720 ? R.int(0, 8) : 0) - (m >= 960 && n <= 2 ? R.int(4, 10) : 0);
        tt.finishedAt = toHM(toMin(tt.finishedAt) + Math.round(slow * (tt.holes === 9 ? 0.5 : 1)));
      }
      if (past ? tt.status !== 'completed' : tt.status !== 'booked') return;
      const wet = past && wx[tt.date] && +wx[tt.date].precip >= 1;
      if (!R.chance(past ? (wet ? 0.17 : 0.045) : 0.03)) return;
      const lead = wet ? R.int(60, 600) : R.pick([R.int(90, 1400), R.int(1440, 4300), R.int(4320, 12000)]);
      const when = Math.min(start - lead * 60000, nowMs - R.int(30, 3000) * 60000);
      tt.status = 'cancelled'; tt.startedAt = null; tt.finishedAt = null; tt.cancelledAt = new Date(when).toISOString();
      tt.players.forEach(function (p) { p.paid = false; });
      if (!past || start - when < 45 * 60000 || !R.chance(0.45)) return;
      /* The freed time went to the next member in line, who booked it a few minutes after being told. */
      const size = R.pick([1, 2, 2, 3, 4]); const party = [];
      for (let k = 0; k < 30 && party.length < size; k++) {
        const g = R.pick(golfers);
        if (party.some(function (p) { return p.memberId === g.id; }) || playing(g.id, tt.date, m) || added.some(function (x) { return x.date === tt.date && Math.abs(toMin(x.time) - m) < 270 && x.players.some(function (p) { return p.memberId === g.id; }); })) continue;
        if (Club.teeRules && !Club.teeRules.memberCanPlay(g, tt.date, tt.time).ok) continue;
        party.push({ memberId: g.id, name: g.firstName + ' ' + g.lastName, type: 'member', cart: R.chance(0.4), paid: true });
      }
      if (!party.length) return;
      const told = when + 60000, booked = told + R.int(4, 25) * 60000;
      if (booked >= start) return;
      const st = m + R.int(0, 6), len = PACE_TARGET[tt.holes] + R.int(-14, 26);
      const ref = { id: tt.id + '_w', date: tt.date, time: tt.time, holes: tt.holes, players: party, status: 'completed', notes: '', eventId: null,
        startedAt: toHM(st), finishedAt: toHM(st + len), source: 'portal', createdAt: new Date(booked).toISOString() };
      added.push(ref);
      const asked = Math.min(when - R.int(2, 72) * 3600000, at(tt.date, m) - 86400000);
      const iso = function (ms) { return new Date(ms).toISOString(); };
      demoRefills.push({ id: 'wl_' + tt.id.slice(3) + '_w', date: tt.date, time: tt.time, players: party.length, kind: 'member', memberId: party[0].memberId,
        createdAt: iso(asked), status: 'booked', notifiedAt: iso(told), offerTime: tt.time, bookedAt: iso(booked), bookedTeeTimeId: ref.id,
        history: [{ at: iso(asked), text: 'Joined the waitlist for ' + party.length + (party.length === 1 ? ' player' : ' players') + ', at ' + fmt.time(tt.time) },
          { at: iso(booked), text: 'Booked the ' + fmt.time(tt.time) + ' tee time' }] });
    });
    return added;
  }

  /* Golf demo migration (version 1): the same demo history for stores seeded before it existed, run once per browser
     ($golfDemoVersion). A fresh seed already ran demoHistory above, so it only sets the flag. Only past, untouched demo
     tee times change: no source yet, completed or no-show, seeded id. Today, the future and anything someone booked or
     edited (every booking path sets source) are left alone. Refill bookings and waitlist entries are added on past dates. */
  const GOLF_DEMO_V = 1;
  (function golfDemoMigrate() {
    try {
      if ((S.getObj('golfDemoVersion', 0) || 0) >= GOLF_DEMO_V) return;
      if (!seededNow) {
        const today = Club.date.today();
        const golfers = S.all('members').filter(function (m) { return m.tierId !== 'tier_social' && m.status === 'active'; });
        const pool = S.all('teeTimes').slice();
        const pick = pool.filter(function (t) { return /^tt_\d{8}_\d{4}$/.test(t.id) && t.date < today && t.source == null && (t.status === 'completed' || t.status === 'no-show'); })
          .sort(function (a, b) { return a.id < b.id ? -1 : 1; })
          .map(function (t) { return JSON.parse(JSON.stringify(t)); });
        if (pick.length && golfers.length) {
          const added = demoHistory(pick, golfers, pool);
          const byId = {}, have = {};
          pick.forEach(function (t) { byId[t.id] = t; });
          pool.forEach(function (t) { have[t.id] = 1; });
          S.replace('teeTimes', pool.map(function (t) { return byId[t.id] || t; }).concat(added.filter(function (x) { return !have[x.id] && x.date < today; })));
          const wl = S.all('teeWaitlist');
          if (wl.length) {
            const seen = {}; wl.forEach(function (e) { seen[e.id] = 1; });
            const extra = demoRefills.filter(function (e) { return !seen[e.id] && e.date < today; });
            if (extra.length) S.replace('teeWaitlist', wl.concat(extra));
            demoRefills = [];
          }
        }
      }
      S.setObj('golfDemoVersion', GOLF_DEMO_V);
    } catch (e) { console.error('Golf demo data failed', e); }
  })();

  /* Demo waitlist history: golfers who asked for a full day or time on past days and never got on (most expired,
     some left the list), plus the refills above. Past days only, so nothing here is waiting or notified. */
  S.seed('teeWaitlist', function () {
    const list = demoRefills.slice(), today = Club.date.today();
    const golfers = S.all('members').filter(function (m) { return m.status === 'active'; });
    const tees = S.all('teeTimes').filter(function (t) { return t.date < today; });
    if (!golfers.length || !tees.length) return list;
    R.reseed(4419);
    const slots = slotList(), WIN = { morning: [0, 660], midday: [660, 840], afternoon: [840, 1440], any: [0, 1440] };
    const days = {}; tees.forEach(function (t) { days[t.date] = 1; });
    const at = function (date, min) { const d = fmt.toDate(date); d.setHours(0, 0, 0, 0); d.setMinutes(min); return d.toISOString(); };
    const when = function (time, win) { return time ? 'at ' + fmt.time(time) : win === 'any' ? 'any time' : 'in the ' + win + (win === 'morning' ? ' (before 11:00 AM)' : win === 'midday' ? ' (11:00 AM to 2:00 PM)' : ' (after 2:00 PM)'); };
    const pub = 'pp_demo_cart';
    Object.keys(days).sort().forEach(function (date) {
      const dow = fmt.toDate(date).getDay(), weekend = dow === 0 || dow === 6;
      const busy = {}; tees.forEach(function (t) { if (t.date === date && t.status !== 'cancelled') (t.players || []).forEach(function (p) { if (p.memberId) busy[p.memberId] = 1; }); });
      const n = weekend ? R.int(6, 10) : dow === 5 ? R.int(3, 6) : R.int(1, 4);
      const rounds = function (id) { return tees.filter(function (t) { return t.date === date && t.status !== 'cancelled' && (t.players || []).some(function (p) { return p.memberId === id; }); }); };
      const add = function (e, k) {
        const players = e.players, w = e.time ? null : e.window;
        const end = e.time ? toMin(e.time) : Math.min(WIN[w][1], toMin(slots[slots.length - 1]));
        const asked = at(Club.date.addDays(date, -R.int(0, 6)), R.int(420, 1260));
        const first = e.time ? toMin(e.time) : WIN[w][0];
        if (asked >= at(date, first)) return;
        const removed = R.chance(0.3);
        const doc = Object.assign({ id: 'wl_' + date.replace(/-/g, '') + '_' + k, date: date, createdAt: asked }, e);
        if (!e.time) delete doc.time; else delete doc.window;
        if (!doc.had || !doc.had.length) delete doc.had;
        if (removed) {
          const by = R.chance(0.8) ? 'golfer' : 'staff', off = at(date, Math.max(0, first - R.int(60, 900)));
          Object.assign(doc, { status: 'removed', removedAt: off > asked ? off : asked, removedBy: by });
        } else Object.assign(doc, { status: 'expired', expiredAt: at(date, end) });
        doc.history = [{ at: asked, text: 'Joined the waitlist for ' + players + (players === 1 ? ' player' : ' players') + ', ' + when(e.time, w) }];
        list.push(doc);
      };
      const seen = {};
      for (let k = 0, made = 0; k < n * 4 && made < n; k++) {
        const g = R.pick(golfers);
        if (seen[g.id]) continue;
        const pool = slots.filter(function (t) { return toMin(t) < 660; });
        const time = R.chance(busy[g.id] ? 0.85 : 0.6) ? (R.chance(weekend ? 0.75 : 0.55) ? R.pick(pool) : R.pick(slots)) : null;
        const win = time ? null : R.pick(['morning', 'morning', 'any', 'midday', 'afternoon']);
        if (time && Club.teeRules && !Club.teeRules.memberCanPlay(g, date, time).ok) continue;
        /* Same rule as joining the real waitlist: a golfer with a round that day may ask for a time well clear of it. */
        const mine = rounds(g.id);
        if (mine.length && (!time || mine.some(function (t) { return Math.abs(toMin(t.time) - toMin(time)) < 270; }))) continue;
        seen[g.id] = 1; made++;
        add({ time: time, window: win, players: R.pick([1, 2, 2, 2, 3, 4]), kind: 'member', memberId: g.id, had: mine.map(function (t) { return t.id; }) }, k);
      }
      if (R.chance(weekend ? 0.45 : 0.3) && Club.teeRules) {
        const open = slots.filter(function (t) { return Club.teeRules.publicSlot(date, t).ok; });
        if (open.length) add({ time: R.pick(open), window: null, players: R.pick([1, 2, 2, 3, 4]), kind: 'public', publicPlayerId: pub }, 'p');
      }
    });
    return list;
  });

  /* For the staff page (js/modules/teesheet.js) */
  Club.shared = Club.shared || {};
  Club.shared.teesheet = { settings, PACE_TARGET, toMin, toHM, nowMin, slotList, closeHM, blockAt };
})();
