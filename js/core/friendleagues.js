/* Friends leagues: members start a league with their friends and compete over a set number of weeks.
   Shared by the members' portal (js/portal/fleagues.js) and the staff site (read-only list).

   Collection friendLeagues {
     id, name, createdBy (memberId), createdAt,
     start (ISO date, week 1 starts here; each week is 7 days), weeks (number), perWeek (games each week),
     holes: 9|18 (only rounds of this length count),
     format: 'stableford' | 'net' | 'gross' | 'weekly',
     mode: 'individual' | 'teams', teamSize: 2|3|4 (teams only),
     teams: [{ id, name }]                       (teams only, named by the creator)
     members: [{ memberId, status: 'invited'|'accepted'|'declined'|'removed', teamId, invitedAt, respondedAt }]
                                                  (the creator is a member, accepted from the start)
     cancelled: bool, cancelledAt
   }
   A league starts on its start date once it is ready: at least two accepted players and, for teams, every team full
   with accepted players. Until then nothing counts. Rules lock once the start date arrives.

   Rounds: a score post (collection scorePosts, js/portal/scores.js) counts when post.friendLeagueId is the league,
   its player is an accepted member, it has the league's number of holes and it is dated from the start to the end.
   Booking puts friendLeagueId on the player's entry in the tee time (teeTimes[].players[]); posting copies it.

   Weeks and catching up: each player has weeks x perWeek game slots. Rounds, oldest first, fill the earliest open
   slot. A round dated in week w can only fill slots up to week w (no playing ahead). Rounds that find no slot are
   not counted. When the league is over, every empty slot is "missed" and takes the worst score any player posted
   in that week's games (lowest points, highest strokes); with no score that week, the worst game of the league.

   Scoring per game: stableford = points after handicap strokes (higher is better); net = gross minus course
   handicap (lower is better); gross = gross (lower is better); weekly = net per game, then each week players
   (or teams) are ranked on their week total and get points by place (higher is better).
   Ranking during the season uses the average per game played, so catching up never hurts; at the end every slot is
   filled, so the average and the total give the same order. A team's week is its players' week totals added. */
(function () {
  'use strict';
  const S = Club.store;
  const FORMATS = [
    { value: 'stableford', label: 'Net Stableford points', short: 'Stableford', unit: 'pts', higher: true, text: 'Points on each hole after handicap strokes. Most points wins.' },
    { value: 'net', label: 'Net stroke play', short: 'Net strokes', unit: 'net', higher: false, text: 'Strokes after handicap. Lowest total wins.' },
    { value: 'gross', label: 'Gross stroke play', short: 'Gross strokes', unit: '', higher: false, text: 'Strokes with no handicaps. Lowest total wins.' },
    { value: 'weekly', label: 'Points by weekly finish', short: 'Weekly finish', unit: 'pts', higher: true, text: 'Each week players are ranked on their net score and get points by place. Most points wins.' }
  ];
  const DEFAULT_PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5];
  const DEFAULT_SI = [7, 3, 15, 1, 11, 9, 17, 5, 13, 8, 16, 2, 12, 6, 10, 18, 14, 4];

  const UNPOSTED_DAYS = 14;   /* a league round booked but not scored holds its game this long */
  function today() { return Club.date.today(); }
  function addDays(d, n) { return Club.date.addDays(d, n); }
  function daysBetween(a, b) { return Math.round((Club.fmt.toDate(b) - Club.fmt.toDate(a)) / 86400000); }
  function fmtOf(lg) { return FORMATS.find(function (f) { return f.value === lg.format; }) || FORMATS[0]; }
  function get(id) { return S.find('friendLeagues', id); }

  /* ---------------- Dates and status ---------------- */
  function endDate(lg) { return addDays(lg.start, lg.weeks * 7 - 1); }
  /** Week number (1-based) a date falls in; 0 before the start, weeks + 1 after the end. */
  function weekOf(lg, date) {
    if (date < lg.start) return 0;
    const w = Math.floor(daysBetween(lg.start, date) / 7) + 1;
    return Math.min(w, lg.weeks + 1);
  }
  function weekStart(lg, w) { return addDays(lg.start, (w - 1) * 7); }
  function weekEnd(lg, w) { return addDays(lg.start, w * 7 - 1); }
  function accepted(lg) { return (lg.members || []).filter(function (x) { return x.status === 'accepted'; }); }
  function active(lg) { return (lg.members || []).filter(function (x) { return x.status === 'accepted' || x.status === 'invited'; }); }
  function memberIds(lg) { return accepted(lg).map(function (x) { return x.memberId; }); }
  function entry(lg, mid) { return (lg.members || []).find(function (x) { return x.memberId === mid && x.status !== 'removed'; }) || null; }
  function teamMembers(lg, teamId, all) { return (all ? active(lg) : accepted(lg)).filter(function (x) { return x.teamId === teamId; }).map(function (x) { return x.memberId; }); }
  /** What still stops the league starting, in words; empty when it is ready. */
  function problems(lg) {
    const out = [], acc = accepted(lg), waiting = (lg.members || []).filter(function (x) { return x.status === 'invited'; });
    if (waiting.length) out.push(waiting.length === 1 ? '1 invite not answered yet' : waiting.length + ' invites not answered yet');
    if (lg.mode === 'teams') {
      (lg.teams || []).forEach(function (t) {
        const n = teamMembers(lg, t.id, true).length;   /* invited players hold their spot until they answer */
        if (n < lg.teamSize) out.push(t.name + ' needs ' + (lg.teamSize - n) + ' more ' + (lg.teamSize - n === 1 ? 'player' : 'players'));
      });
      if ((lg.teams || []).length < 2) out.push('At least two teams are needed');
    } else if (acc.length + waiting.length < 2) out.push('At least two players are needed');
    return out;
  }
  function ready(lg) { return !lg.cancelled && !problems(lg).length; }
  /** 'cancelled' | 'forming' (before the start) | 'waiting' (start date passed, not ready) | 'active' | 'complete' */
  function status(lg, on) {
    on = on || today();
    if (lg.cancelled) return 'cancelled';
    if (on > endDate(lg)) return ready(lg) ? 'complete' : 'cancelled';
    if (on < lg.start) return 'forming';
    return ready(lg) ? 'active' : 'waiting';
  }
  function statusLabel(lg) {
    const st = status(lg);
    return st === 'forming' ? 'Starts ' + Club.fmt.dateShort(lg.start) : st === 'waiting' ? 'Waiting for players'
      : st === 'active' ? 'Week ' + Math.min(weekOf(lg, today()), lg.weeks) + ' of ' + lg.weeks : st === 'complete' ? 'Finished' : 'Cancelled';
  }
  /** Rules (dates, format, teams) can change only before the start date. */
  function editable(lg) { return !lg.cancelled && today() < lg.start; }

  /* ---------------- Rounds and slots ---------------- */
  function holeList(n, nine) {
    let hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    if (hs.length !== 18) hs = DEFAULT_PARS.map(function (p, i) { return { number: i + 1, par: p, handicap: DEFAULT_SI[i] }; });
    return +n === 9 ? (nine === 'back' ? hs.slice(9, 18) : hs.slice(0, 9)) : hs;
  }
  /** Handicap strokes per hole: given out by stroke index (ranked within the holes played); plus handicaps give back. */
  function strokesPerHole(hs, ch) {
    const n = hs.length, order = hs.map(function (h, i) { return i; }).sort(function (a, b) { return hs[a].handicap - hs[b].handicap; });
    const rank = []; order.forEach(function (idx, r) { rank[idx] = r; });
    return hs.map(function (h, i) {
      if (ch >= 0) return Math.floor(ch / n) + (rank[i] < ch % n ? 1 : 0);
      const b = -ch; return -(Math.floor(b / n) + (rank[i] >= n - b % n ? 1 : 0));
    });
  }
  function stableford(p) {
    const hs = holeList(p.holes, p.nine), ch = p.courseHandicap || 0;
    if (p.entry === 'hole' && p.holeScores && p.holeScores.length === hs.length) {
      const st = strokesPerHole(hs, ch);
      return hs.reduce(function (a, h, i) { return a + Math.max(0, 2 + h.par + st[i] - p.holeScores[i]); }, 0);
    }
    /* A total-only post: two points a hole, plus par and strokes received, minus the adjusted score */
    const par = hs.reduce(function (a, h) { return a + h.par; }, 0);
    return Math.max(0, 2 * hs.length + par + ch - (p.adjusted != null ? p.adjusted : p.gross));
  }
  /** One game's value in the league's format (weekly uses net). */
  function gameValue(lg, p) {
    if (lg.format === 'stableford') return stableford(p);
    if (lg.format === 'gross') return p.gross;
    return p.gross - (p.courseHandicap || 0);
  }
  function better(lg) { return lg.format === 'stableford' ? function (a, b) { return a > b; } : function (a, b) { return a < b; }; }
  /** Posts that count toward this league for one member, oldest first. */
  function postsFor(lg, mid) {
    const end = endDate(lg);
    return S.all('scorePosts').filter(function (p) {
      return p.friendLeagueId === lg.id && p.memberId === mid && +p.holes === +lg.holes && p.date >= lg.start && p.date <= end;
    }).sort(function (a, b) { return (a.date + (a.time || '99:99') + (a.postedAt || '')).localeCompare(b.date + (b.time || '99:99') + (b.postedAt || '')); });
  }
  /** A member's slots: [{ week, game, post|null, late, state: 'played'|'open'|'missed' }], weeks x perWeek of them. */
  function slotsFor(lg, mid) {
    const total = lg.weeks * lg.perWeek, slots = [];
    for (let k = 0; k < total; k++) slots.push({ week: Math.floor(k / lg.perWeek) + 1, game: k % lg.perWeek + 1, post: null, late: false, state: 'open' });
    let next = 0;
    postsFor(lg, mid).forEach(function (p) {
      if (next >= total) return;
      const w = weekOf(lg, p.date);
      if (slots[next].week > w) return;                 /* caught up and this week is full: does not count */
      slots[next].post = p; slots[next].late = slots[next].week < w; slots[next].state = 'played'; next++;
    });
    if (status(lg) === 'complete') slots.forEach(function (s) { if (!s.post) s.state = 'missed'; });
    return slots;
  }
  /** Can a round on `date` (with `holes`) count for this member? `excludeTee` leaves one booking out of the count. */
  function canCount(lg, mid, date, holes, excludeTee) {
    const e = entry(lg, mid);
    if (!e || e.status !== 'accepted') return { ok: false, reason: 'You are not in this league' };
    const st = status(lg, date);
    if (st === 'cancelled') return { ok: false, reason: 'This league was cancelled' };
    if (date < lg.start) return { ok: false, reason: 'The league starts ' + Club.fmt.dateShort(lg.start) };
    if (date > endDate(lg)) return { ok: false, reason: 'The league ended ' + Club.fmt.dateShort(endDate(lg)) };
    if (!ready(lg)) return { ok: false, reason: 'The league is waiting for players' };
    if (holes != null && +holes !== +lg.holes) return { ok: false, reason: 'Only ' + lg.holes + '-hole rounds count' };
    /* Games already played or booked on or before this date (posted, or booked and not yet posted) */
    const posted = slotsFor(lg, mid).filter(function (x) { return x.post; }).map(function (x) { return x.post; });   /* only rounds that took a slot */
    const postedTees = {}; posted.forEach(function (p) { if (p.teeTimeId) postedTees[p.teeTimeId] = 1; });
    const booked = S.all('teeTimes').filter(function (t) {
      if (!t || t.id === excludeTee || postedTees[t.id] || ['cancelled', 'no-show'].indexOf(t.status) >= 0) return false;
      if (t.date < addDays(today(), -UNPOSTED_DAYS)) return false;   /* never scored: the game is free again */
      return (t.players || []).some(function (p) { return p.memberId === mid && p.friendLeagueId === lg.id; });
    });
    const used = posted.length + booked.length, total = lg.weeks * lg.perWeek;
    if (used >= total) return { ok: false, reason: 'All ' + total + ' league games are played or booked' };
    const upTo = posted.filter(function (p) { return p.date <= date; }).length + booked.filter(function (t) { return t.date <= date; }).length;
    const w = weekOf(lg, date);
    /* Every game in this week or earlier takes a slot up to this week, even one dated later in the week; and
       a game in a later week must still find its slot once this round is in. */
    const dates = posted.map(function (p) { return p.date; }).concat(booked.map(function (t) { return t.date; }));
    for (let v = w; v <= lg.weeks; v++) {
      const inWeeks = dates.filter(function (d) { return weekOf(lg, d) <= v; }).length;
      if (inWeeks >= v * lg.perWeek) return { ok: false, reason: 'Week ' + v + ' is already full. League games can be caught up but not played ahead' };
    }
    const week = Math.floor(upTo / lg.perWeek) + 1;
    return { ok: true, week: week, game: upTo % lg.perWeek + 1, late: week < w, reason: '' };
  }
  /** Leagues a member is in (accepted) that a round on `date` could count toward, each with canCount's answer. */
  function countableFor(mid, date, holes, excludeTee) {
    return S.all('friendLeagues').filter(function (lg) { const e = entry(lg, mid); return e && e.status === 'accepted' && !lg.cancelled; })
      .map(function (lg) { return { league: lg, check: canCount(lg, mid, date, holes, excludeTee) }; })
      .filter(function (x) { return x.league.start <= date && endDate(x.league) >= date; });
  }

  /* ---------------- Standings ---------------- */
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  /* Sums of averages carry floating-point noise (65 + 65.1666... vs 65.3333... + 64.8333...): compare to a millionth */
  function clean(v) { return v == null ? null : Math.round(v * 1e6) / 1e6; }
  /** Every number the league page shows. */
  function standings(lg) {
    const ids = memberIds(lg), fmt = fmtOf(lg), isBetter = better(lg), done = status(lg) === 'complete';
    const slots = {}; ids.forEach(function (id) { slots[id] = slotsFor(lg, id); });
    /* Worst game per week (for missed games), then worst of the league */
    const worstWeek = {}; let worstAll = null;
    ids.forEach(function (id) {
      slots[id].forEach(function (s) {
        if (!s.post) return; const v = gameValue(lg, s.post);
        if (worstWeek[s.week] == null || isBetter(worstWeek[s.week], v)) worstWeek[s.week] = v;
        if (worstAll == null || isBetter(worstAll, v)) worstAll = v;
      });
    });
    ids.forEach(function (id) {
      slots[id].forEach(function (s) {
        if (s.post) s.value = gameValue(lg, s.post);
        else if (s.state === 'missed') s.value = worstWeek[s.week] != null ? worstWeek[s.week] : (worstAll != null ? worstAll : (lg.format === 'stableford' ? 0 : null));
        else s.value = null;
      });
    });
    /* Per player per week: total of that week's games, and whether all of the week's games are in */
    const weekly = {};
    ids.forEach(function (id) {
      weekly[id] = [];
      for (let w = 1; w <= lg.weeks; w++) {
        const ss = slots[id].filter(function (s) { return s.week === w; });
        const vals = ss.filter(function (s) { return s.value != null; }).map(function (s) { return s.value; });
        weekly[id].push({ week: w, slots: ss, total: vals.length === ss.length ? sum(vals) : null, partial: vals.length ? sum(vals) : null, complete: vals.length === ss.length });
      }
    });
    /* Weekly finish points (players or teams) for weeks everyone has completed */
    function placePoints(entries) {   /* entries [{ key, total }] lower total is better (net) */
      entries = entries.map(function (e) { return { key: e.key, total: clean(e.total) }; });
      const sorted = entries.slice().sort(function (a, b) { return a.total - b.total; }), out = {};
      sorted.forEach(function (e, i) {
        const first = sorted.findIndex(function (x) { return x.total === e.total; });
        out[e.key] = { points: sorted.length - first, place: first + 1, tied: sorted.filter(function (x) { return x.total === e.total; }).length > 1 };
      });
      return out;
    }
    const teams = lg.mode === 'teams' ? (lg.teams || []).map(function (t) { return { id: t.id, name: t.name, members: teamMembers(lg, t.id) }; }) : [];
    const weekPoints = {}, teamWeekPoints = {};
    for (let w = 1; w <= lg.weeks; w++) {
      const allIn = ids.length && ids.every(function (id) { return weekly[id][w - 1].complete; });
      if (lg.format !== 'weekly' || !allIn) continue;
      weekPoints[w] = placePoints(ids.map(function (id) { return { key: id, total: weekly[id][w - 1].total }; }));
      if (teams.length) teamWeekPoints[w] = placePoints(teams.map(function (t) { return { key: t.id, total: sum(t.members.map(function (id) { return weekly[id][w - 1].total; })) }; }));
    }
    /* Individual rows */
    const rows = ids.map(function (id) {
      const played = slots[id].filter(function (s) { return s.post; }).length, counted = slots[id].filter(function (s) { return s.value != null; });
      const row = { memberId: id, played: played, of: slots[id].length, missed: slots[id].filter(function (s) { return s.state === 'missed'; }).length, weeks: weekly[id], teamId: (entry(lg, id) || {}).teamId || null };
      /* weekly: no place until a week is complete (everyone on 0 points read as a tie for first) */
      if (lg.format === 'weekly') { const ws = Object.keys(weekPoints); row.total = ws.length ? sum(ws.map(function (w) { return weekPoints[w][id].points; })) : null; row.key = row.total; }
      else { row.total = counted.length ? sum(counted.map(function (s) { return s.value; })) : null; row.avg = counted.length ? row.total / counted.length : null; row.key = row.avg; }
      return row;
    });
    rank(rows, lg.format === 'weekly' || lg.format === 'stableford');
    /* Team rows: the sum of the players' numbers (weekly: team place points) */
    const teamRows = teams.map(function (t) {
      const mine = rows.filter(function (r) { return r.teamId === t.id; });
      const row = { teamId: t.id, name: t.name, members: t.members, played: sum(mine.map(function (r) { return r.played; })), of: sum(mine.map(function (r) { return r.of; })) };
      if (lg.format === 'weekly') { const ws = Object.keys(teamWeekPoints); row.total = ws.length ? sum(ws.map(function (w) { return teamWeekPoints[w][t.id].points; })) : null; row.key = row.total; }
      else {
        const vals = mine.filter(function (r) { return r.avg != null; });
        row.total = vals.length ? sum(vals.map(function (r) { return r.total; })) : null;
        row.key = vals.length === mine.length && mine.length ? sum(vals.map(function (r) { return r.avg; })) : (vals.length ? sum(vals.map(function (r) { return r.avg; })) * mine.length / vals.length : null);
      }
      return row;
    });
    rank(teamRows, lg.format === 'weekly' || lg.format === 'stableford');
    return { format: fmt, done: done, rows: rows, teams: teamRows, slots: slots, weekPoints: weekPoints, teamWeekPoints: teamWeekPoints, weekNow: Math.min(weekOf(lg, today()), lg.weeks) };
  }
  /** Sorts rows on `key` (nulls last) and sets pos ('1', 'T2', ...). */
  function rank(rows, high) {
    rows.forEach(function (r) { r.key = clean(r.key); });
    rows.sort(function (a, b) {
      if (a.key == null && b.key == null) return 0; if (a.key == null) return 1; if (b.key == null) return -1;
      return high ? b.key - a.key : a.key - b.key;
    });
    rows.forEach(function (r) {
      if (r.key == null) { r.pos = '–'; return; }
      const first = rows.findIndex(function (x) { return x.key === r.key; });
      r.pos = (rows.filter(function (x) { return x.key === r.key; }).length > 1 ? 'T' : '') + (first + 1);
    });
  }
  /** A number in the league's format, for display: "34 pts", "+6", "86". */
  function valueText(lg, v) {
    if (v == null) return '–';
    if (lg.format === 'stableford' || lg.format === 'weekly') { const r = Math.round(v * 10) / 10; return r + (Math.abs(r) === 1 ? ' pt' : ' pts'); }
    return String(Math.round(v * 10) / 10);
  }

  /* ---------------- Changes (callers add the Undo or confirmation) ---------------- */
  function now() { return new Date().toISOString(); }
  /** Creates a league. o: { name, createdBy, start, weeks, perWeek, holes, format, mode, teamSize, teams: [{ name }],
      invites: [{ memberId, teamIndex }] }. The creator is accepted (on teams[creatorTeam] when given). */
  function create(o) {
    const teams = o.mode === 'teams' ? (o.teams || []).map(function (t, i) { return { id: 'tm_' + (i + 1) + '_' + Math.random().toString(36).slice(2, 6), name: t.name }; }) : [];
    const team = function (i) { return teams.length && i != null && teams[i] ? teams[i].id : null; };
    const members = [{ memberId: o.createdBy, status: 'accepted', teamId: team(o.creatorTeam != null ? o.creatorTeam : 0), invitedAt: now(), respondedAt: now() }]
      .concat((o.invites || []).filter(function (x) { return x.memberId !== o.createdBy; }).map(function (x) { return { memberId: x.memberId, status: 'invited', teamId: team(x.teamIndex), invitedAt: now(), respondedAt: null }; }));
    return S.insert('friendLeagues', {
      name: String(o.name || '').trim() || 'Friends league', createdBy: o.createdBy, createdAt: now(),
      start: o.start, weeks: +o.weeks, perWeek: +o.perWeek, holes: +o.holes === 9 ? 9 : 18, format: o.format,
      mode: o.mode === 'teams' ? 'teams' : 'individual', teamSize: o.mode === 'teams' ? +o.teamSize : null,
      teams: teams, members: members, cancelled: false, cancelledAt: null
    });
  }
  function patchMembers(lg, fn) { return S.update('friendLeagues', lg.id, { members: (lg.members || []).map(function (x) { return Object.assign({}, x); }).map(fn) }); }
  function respond(lgId, mid, yes) {
    const lg = get(lgId); if (!lg) return null;
    return patchMembers(lg, function (x) { if (x.memberId === mid && x.status === 'invited') { x.status = yes ? 'accepted' : 'declined'; x.respondedAt = now(); } return x; });
  }
  function invite(lgId, mid, teamId) {
    const lg = get(lgId); if (!lg) return null;
    const list = (lg.members || []).filter(function (x) { return x.memberId !== mid; }).map(function (x) { return Object.assign({}, x); });
    list.push({ memberId: mid, status: 'invited', teamId: teamId || null, invitedAt: now(), respondedAt: null });
    return S.update('friendLeagues', lg.id, { members: list });
  }
  function removeMember(lgId, mid) {
    const lg = get(lgId); if (!lg) return null;
    return patchMembers(lg, function (x) { if (x.memberId === mid) { x.status = 'removed'; x.respondedAt = now(); } return x; });
  }
  function cancel(lgId) { return S.update('friendLeagues', lgId, { cancelled: true, cancelledAt: now() }); }
  function restore(lgId) { return S.update('friendLeagues', lgId, { cancelled: false, cancelledAt: null }); }
  /** Leagues a member belongs to or is invited to (not removed or declined), newest start first. */
  function listFor(mid) {
    return S.all('friendLeagues').filter(function (lg) { const e = entry(lg, mid); return e && (e.status === 'accepted' || e.status === 'invited'); })
      .sort(function (a, b) { return String(b.start).localeCompare(String(a.start)); });
  }
  function invitesFor(mid) {
    return S.all('friendLeagues').filter(function (lg) { const e = entry(lg, mid); return e && e.status === 'invited' && !lg.cancelled && today() <= endDate(lg); });
  }

  S.seed('friendLeagues', []);

  Club.friendLeagues = {
    FORMATS: FORMATS, formatOf: fmtOf, get: get, listFor: listFor, invitesFor: invitesFor,
    endDate: endDate, weekOf: weekOf, weekStart: weekStart, weekEnd: weekEnd, status: status, statusLabel: statusLabel,
    ready: ready, problems: problems, editable: editable, entry: entry, accepted: accepted, memberIds: memberIds, teamMembers: teamMembers,
    postsFor: postsFor, slotsFor: slotsFor, gameValue: gameValue, stableford: stableford, canCount: canCount, countableFor: countableFor,
    standings: standings, valueText: valueText,
    create: create, respond: respond, invite: invite, removeMember: removeMember, cancel: cancel, restore: restore
  };
})();
