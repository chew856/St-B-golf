/* Reports section: Golf. Registers through Club.reports.addSection (js/modules/reports.js).
   Rounds by month (main chart), tee sheet use by weekday, how rounds were played, pace of play, lost tee time demand
   (the waitlist), cancellations and no-shows, and weather against rounds. Every figure comes from records on file:
   teeTimes, teeWaitlist (js/core/waitlist.js) and weatherLog (js/core/club.js). Targets and rates are read from the
   code that owns them (Club.teeSheet.PACE_TARGET, Club.teeRules); none are set here. */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc, X = Club.drill;
  const H = Club.reports.h, all = H.all, num = H.num, toMin = H.toMin, WD = H.WD, DEAD = H.DEAD;
  const WD_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  const WD_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /* ---------------- Helpers ---------------- */
  function wdOf(d) { return (F.toDate(d).getDay() + 6) % 7; }
  function dur(m) { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h + 'h ' + (r < 10 ? '0' : '') + r + 'm'; }
  function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  function pctTxt(n, d) { return d ? (Math.round(n / d * 100)) + '%' : '0%'; }
  function plural(n, one, many) { return F.num(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function today() { return D.today(); }
  function leadName(t) {
    const p = (t.players || [])[0]; if (!p) return 'Group';
    if (p.memberId && Club.members && Club.members.get(p.memberId)) return Club.members.name(p.memberId);
    return p.name || (p.type === 'public' ? 'Public golfer' : 'Guest');
  }
  /** Minutes over (+) or under (-) a target, in words. */
  function vsText(m) { m = Math.round(m); return m === 0 ? 'On target' : m > 0 ? '+' + m + ' min' : Math.abs(m) + ' min under'; }
  function overWords(m) { m = Math.round(m); return m === 0 ? 'on target' : m > 0 ? m + ' min over target' : Math.abs(m) + ' min under target'; }
  function memoed(ctx, k, fn) { return H.memo(ctx, 'golf-' + k, function () { return fn(ctx); }); }

  /* Parts of the day, as the tee sheet's day view splits them (js/modules/teesheet.js PERIODS). */
  const BANDS = [
    { id: 'morning', label: 'Morning', sub: 'Before 10 AM', from: 0, to: 600 },
    { id: 'midday', label: 'Midday', sub: '10 AM to 1 PM', from: 600, to: 780 },
    { id: 'afternoon', label: 'Afternoon', sub: '1 to 4 PM', from: 780, to: 960 },
    { id: 'evening', label: 'Evening', sub: 'After 4 PM', from: 960, to: 1440 }
  ];
  function bandOf(time) { const m = toMin(time); for (let i = 0; i < BANDS.length; i++) if (m >= BANDS[i].from && m < BANDS[i].to) return i; return BANDS.length - 1; }

  /* ==================================================================================================
     1. Pace of play
     ================================================================================================== */
  const WD_LABELS = WD.map(function (w, i) { return { short: w, long: WD_LONG[i] }; });
  const BAND_LABELS = BANDS.map(function (b) { return { short: b.label, long: b.label + ' tee times (' + b.sub.charAt(0).toLowerCase() + b.sub.slice(1) + ')' }; });

  /* ==================================================================================================
     Rounds (the period's rows) and how they were played (the tee sheet)
     ================================================================================================== */
  function roundsData(ctx) {
    return memoed(ctx, 'rounds', function () {
      const rows = ctx.rows, t = H.periodTotals(rows);
      const g = H.sum(rows, function (r) { return r.guestRounds; });
      const fair = H.fairRows(ctx);
      const busiest = fair.length ? fair.reduce(function (b, r) { return num(r.rounds) > num(b.rounds) ? r : b; }, fair[0]) : null;
      const tees = []; Object.keys(ctx.ix.tee).forEach(function (d) { if (d >= ctx.from && d <= ctx.to) ctx.ix.tee[d].forEach(function (x) { tees.push(x); }); });
      let p18 = 0, p9 = 0, cart = 0, walk = 0;
      tees.forEach(function (x) { (x.players || []).forEach(function (pl) { if (+x.holes === 9) p9++; else p18++; if (pl && pl.cart) cart++; else walk++; }); });
      return { total: t.rounds, guests: g, members: Math.max(0, t.rounds - g), busiest: busiest && busiest.rounds ? busiest : null, tees: tees, played: { n: p18 + p9, p18: p18, p9: p9, cart: cart, walk: walk } };
    });
  }
  function roundsCSV(ctx) {
    return [[ctx.gran === 'day' ? 'Date' : 'Month', 'Member rounds', 'Guest rounds', 'Total']].concat(ctx.rows.map(function (r) { return [H.csvKey(r), Math.max(0, num(r.rounds) - num(r.guestRounds)), num(r.guestRounds), num(r.rounds)]; }));
  }
  function utilData(ctx) {
    return memoed(ctx, 'util', function () {
      const allT = all('teeTimes'), c = H.teeCapacity(allT), cap = c.cap, interval = c.interval;
      const dates = {};
      allT.forEach(function (t) { if (t.date && t.date >= ctx.from && t.date <= ctx.to) { dates[t.date] = dates[t.date] || 0; if (!DEAD[t.status]) dates[t.date] += (t.players || []).length; } });
      const acc = WD.map(function () { return { days: 0, players: 0 }; });
      Object.keys(dates).forEach(function (d) { const w = wdOf(d); acc[w].days++; acc[w].players += dates[d]; });
      const vals = acc.map(function (a) { return a.days && cap ? Math.min(100, Math.round(a.players / a.days / cap * 100)) : 0; });
      const avgP = acc.map(function (a) { return a.days ? Math.round(a.players / a.days) : 0; });
      const sampled = vals.map(function (v, i) { return acc[i].days ? i : -1; }).filter(function (i) { return i >= 0; });
      const best = sampled.length ? sampled.reduce(function (b, i) { return vals[i] > vals[b] ? i : b; }, sampled[0]) : -1;
      const low = sampled.length ? sampled.reduce(function (b, i) { return vals[i] < vals[b] ? i : b; }, sampled[0]) : -1;
      return { cap: cap, interval: interval, days: Object.keys(dates).length, acc: acc, vals: vals, avgP: avgP, best: best, low: low, ok: !!(Object.keys(dates).length && cap) };
    });
  }
  function utilCSV(ctx) { const u = utilData(ctx); return [['Weekday', 'Days sampled', 'Avg players', 'Utilization %']].concat(WD.map(function (w, i) { return [w, u.acc[i].days, u.avgP[i], u.vals[i]]; })); }
  function utilDrill(ctx) {
    const u = utilData(ctx);
    if (!u.ok) return { title: 'Tee sheet use', body: X.empty('No tee sheet history for this period', 'Use by weekday appears once tee times have been played in the selected dates.', 'teesheet') };
    let body = X.kpis([
      { label: 'Fullest day', value: WD_FULL[u.best], sub: u.vals[u.best] + '% of slots filled' },
      { label: 'Quietest day', value: WD_FULL[u.low], sub: u.vals[u.low] + '% of slots filled' },
      { label: 'Daily capacity', value: F.num(u.cap), sub: 'Player slots at ' + u.interval + ' minute intervals' },
      { label: 'Days on the sheet', value: F.num(u.days), sub: 'In this period' }
    ]);
    body += X.sec('By weekday', '', X.table([{ label: 'Day' }, { label: 'Filled' }, { label: 'Days', num: true }, { label: 'Players a day', num: true }],
      WD.map(function (w, i) { return ['<span class="primary-cell">' + WD_FULL[i] + '</span>', X.share(u.vals[i], 100), F.num(u.acc[i].days), F.num(u.avgP[i])]; })));
    body += X.note('Share of ' + u.cap + ' daily player slots (' + u.interval + ' minute intervals, four players a time) filled, averaged over the days each weekday appears on the sheet in this period.');
    return { title: 'Tee sheet use by weekday', body: body, csv: utilCSV(ctx), go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* ==================================================================================================
     Pace of play
     ================================================================================================== */
  function targets() { const t = Club.teeSheet && Club.teeSheet.PACE_TARGET; return t && t[18] && t[9] ? t : null; }
  function timedRounds(ctx) {
    return memoed(ctx, 'timed', function () {
      const inR = H.inRange(ctx), T = targets(), out = [];
      all('teeTimes').forEach(function (t) {
        if (t.status !== 'completed' || !inR(t.date) || !t.startedAt || !t.finishedAt) return;
        const holes = +t.holes === 9 ? 9 : 18, len = toMin(t.finishedAt) - toMin(t.startedAt);
        if (len < (holes === 9 ? 45 : 90) || len > (holes === 9 ? 300 : 480)) return;   // a clock slip, not a round
        out.push({ t: t, holes: holes, len: len, wd: wdOf(t.date), band: bandOf(t.time), over: T ? len - T[holes] : 0 });
      });
      return out;
    });
  }
  function paceAgg(list) {
    const a = { n: list.length, n18: 0, s18: 0, n9: 0, s9: 0, over: 0, sOver: 0 };
    list.forEach(function (r) { if (r.holes === 18) { a.n18++; a.s18 += r.len; } else { a.n9++; a.s9 += r.len; } a.sOver += r.over; if (r.over > 0) a.over++; });
    a.avg18 = a.n18 ? a.s18 / a.n18 : null; a.avg9 = a.n9 ? a.s9 / a.n9 : null; a.vs = a.n ? a.sOver / a.n : null;
    return a;
  }
  function paceGroups(rounds) {
    const wd = WD.map(function (_, i) { return paceAgg(rounds.filter(function (r) { return r.wd === i; })); });
    const bd = BANDS.map(function (_, i) { return paceAgg(rounds.filter(function (r) { return r.band === i; })); });
    return { wd: wd, bd: bd, slowWd: slowest(wd), slowBd: slowest(bd) };
  }
  /** The group furthest over target (needs three timed rounds to count). */
  function slowest(groups) {
    let best = -1;
    groups.forEach(function (g, i) { if (g.n >= 3 && (best < 0 || g.vs > groups[best].vs)) best = i; });
    return best;
  }
  /** Diverging rows around the target: under in --good, over in --warn, always with the minutes written beside. */
  function paceRows(groups, labels, slow, key, T) {
    const maxAbs = Math.max(10, Math.max.apply(null, groups.map(function (g) { return g.n ? Math.abs(g.vs) : 0; })));
    return '<div class="rgo-pace">' + groups.map(function (g, i) {
      const lb = labels[i];
      if (!g.n) return '<div class="rgo-pace-row is-none"><span class="rgo-pace-lbl">' + esc(lb.short) + '</span><span class="rgo-pace-track"><i></i></span><span class="rgo-pace-v">No rounds</span></div>';
      const w = Math.min(50, Math.abs(g.vs) / maxAbs * 50);
      const bar = T ? '<span class="rgo-pace-bar ' + (g.vs > 0 ? 'over' : 'under') + '" style="left:' + (g.vs > 0 ? 50 : 50 - w).toFixed(1) + '%;width:' + w.toFixed(1) + '%"></span>' : '';
      const main = g.avg18 != null ? dur(g.avg18) : dur(g.avg9) + ' (9)';
      const tip = lb.long + (i === slow ? ', the slowest' : '') + ': ' + plural(g.n, 'round') + (g.avg18 != null ? ', 18 holes ' + dur(g.avg18) : '') + (g.avg9 != null ? ', 9 holes ' + dur(g.avg9) : '') + (T ? ', ' + vsText(g.vs) + ' against target' : '');
      return '<button type="button" class="rgo-pace-row rgo-row' + (i === slow ? ' is-slow' : '') + '" data-drill="pace" data-arg="' + key + ':' + i + '" aria-label="' + esc(tip + '. View rounds') + '" data-tip="' + esc(tip) + '">' +
        '<span class="rgo-pace-lbl">' + esc(lb.short) + (i === slow ? '<span class="rgo-slow-tag">Slowest</span>' : '') + '</span>' +
        '<span class="rgo-pace-track">' + bar + '<i></i></span>' +
        '<span class="rgo-pace-v"><strong>' + esc(main) + '</strong>' + (T ? '<span class="rgo-vs ' + (g.vs > 0.5 ? 'over' : 'under') + '">' + esc(vsText(g.vs)) + '</span>' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function paceCSV(ctx) {
    const rounds = timedRounds(ctx), T = targets(), g = paceGroups(rounds);
    const csv = [['Group', 'Name', 'Timed rounds', '18-hole average (min)', '9-hole average (min)', 'Average against target (min)']];
    function csvGroup(kind, labels, groups) { groups.forEach(function (x, i) { csv.push([kind, labels[i].short, x.n, x.avg18 != null ? Math.round(x.avg18) : '', x.avg9 != null ? Math.round(x.avg9) : '', T && x.n ? Math.round(x.vs) : '']); }); }
    csvGroup('Weekday', WD_LABELS, g.wd); csvGroup('Tee time', BANDS.map(function (b) { return { short: b.label + ' (' + b.sub + ')' }; }), g.bd);
    csv.push([]); csv.push(['Date', 'Tee time', 'Lead player', 'Holes', 'Started', 'Finished', 'Length (min)', 'Target (min)', 'Over target (min)']);
    rounds.slice().sort(function (x, y) { return (x.t.date + x.t.time).localeCompare(y.t.date + y.t.time); })
      .forEach(function (r) { csv.push([r.t.date, r.t.time, leadName(r.t), r.holes, r.t.startedAt, r.t.finishedAt, r.len, T ? T[r.holes] : '', T ? r.over : '']); });
    return csv;
  }
  function paceDrill(ctx, filter) {
    const T = targets(), every = timedRounds(ctx), g = paceGroups(every);
    let rounds = every, title = 'Pace of play';
    if (filter && filter.wd != null) { rounds = every.filter(function (r) { return r.wd === filter.wd; }); title = 'Pace on ' + WD_LONG[filter.wd]; }
    if (filter && filter.band != null) { rounds = every.filter(function (r) { return r.band === filter.band; }); title = 'Pace, ' + BANDS[filter.band].label.toLowerCase() + ' tee times'; }
    const a = paceAgg(rounds);
    if (!rounds.length) return { title: title, body: X.empty('No timed rounds', 'Nothing was timed for this part of the period.', 'clock') };
    let body = X.kpis([
      { label: '18 holes', value: a.avg18 != null ? dur(a.avg18) : 'None', sub: a.avg18 != null && T ? vsText(a.avg18 - T[18]) + ' against ' + dur(T[18]) : plural(a.n18, 'round') },
      { label: '9 holes', value: a.avg9 != null ? dur(a.avg9) : 'None', sub: a.avg9 != null && T ? vsText(a.avg9 - T[9]) + ' against ' + dur(T[9]) : plural(a.n9, 'round') },
      { label: 'Rounds timed', value: F.num(a.n), sub: F.num(a.n18) + ' of 18, ' + F.num(a.n9) + ' of 9' },
      { label: 'Over target', value: T ? pctTxt(a.over, a.n) : 'n/a', sub: T ? plural(a.over, 'round') : 'No target on file' }
    ]);
    const slow = rounds.slice().sort(function (x, y) { return T ? y.over - x.over || y.len - x.len : y.len - x.len; }).slice(0, 15);
    body += X.sec('Slowest rounds', T ? 'Furthest over target' : 'Longest first', X.table(
      [{ label: 'Date' }, { label: 'Tee time' }, { label: 'Lead player' }, { label: 'Holes', num: true }, { label: 'Length', num: true }, { label: 'Over target', num: true }],
      slow.map(function (r) {
        return ['<span class="primary-cell">' + esc(F.weekday(r.t.date) + ', ' + F.dateShort(r.t.date)) + '</span>', esc(F.time(r.t.time)), esc(leadName(r.t)), r.holes, esc(dur(r.len)),
          T ? (r.over > 0 ? '<span class="rgo-over">+' + r.over + ' min</span>' : '<span class="muted">' + esc(vsText(r.over)) + '</span>') : '<span class="muted">n/a</span>'];
      })));
    function groupTable(groups, labels, slowI) {
      return X.table([{ label: '' }, { label: 'Rounds', num: true }, { label: '18 holes', num: true }, { label: '9 holes', num: true }, { label: 'Against target', num: true }],
        groups.map(function (x, i) {
          return ['<span class="primary-cell">' + esc(labels[i]) + '</span>' + (i === slowI ? ' ' + U.badge('Slowest', 'warn') : ''), F.num(x.n), x.avg18 != null ? esc(dur(x.avg18)) : '<span class="muted">-</span>',
            x.avg9 != null ? esc(dur(x.avg9)) : '<span class="muted">-</span>', T && x.n ? esc(vsText(x.vs)) : '<span class="muted">-</span>'];
        }));
    }
    if (!filter || filter.wd == null) body += X.sec('By weekday', 'Whole period', groupTable(g.wd, WD_LONG.map(function (w) { return w.slice(0, -1); }), g.slowWd));
    if (!filter || filter.band == null) body += X.sec('By tee time', 'Whole period', groupTable(g.bd, BANDS.map(function (b) { return b.label + ', ' + b.sub.toLowerCase(); }), g.slowBd));
    body += X.note(T ? 'Targets come from the tee sheet: ' + dur(T[18]) + ' for 18 holes, ' + dur(T[9]) + ' for 9. Rounds marked complete on a later day are logged at the target length.' : 'No pace target is on file.');
    return { title: title, body: body, go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* ==================================================================================================
     Lost tee time demand (the waitlist)
     ================================================================================================== */
  function WL() { return Club.waitlist || null; }
  const OUTCOMES = [
    { id: 'booked', label: 'Booked later', color: 'var(--viz-1)', badge: 'good' },
    { id: 'expired', label: 'Expired', color: 'var(--viz-2)', badge: 'warn' },
    { id: 'removed', label: 'Removed', color: 'var(--viz-context)', badge: 'plain' },
    { id: 'waiting', label: 'Still waiting', color: 'var(--viz-3)', badge: 'info' }
  ];
  function outcomeOf(e) { return e.status === 'booked' ? 'booked' : e.status === 'expired' ? 'expired' : e.status === 'removed' ? 'removed' : 'waiting'; }
  /* Parts of the day as golfers ask for them (Club.waitlist.WINDOWS, the portal's Tee times page). */
  function windows() {
    const w = (WL() && WL().WINDOWS) || [{ id: 'any', label: 'Any time', sub: 'Any time that day', from: 0, to: 1440 }, { id: 'morning', label: 'Morning', sub: 'Before 11:00 AM', from: 0, to: 660 }, { id: 'midday', label: 'Midday', sub: '11:00 AM to 2:00 PM', from: 660, to: 840 }, { id: 'afternoon', label: 'Afternoon', sub: 'After 2:00 PM', from: 840, to: 1440 }];
    return w.filter(function (x) { return x.id !== 'any'; }).concat(w.filter(function (x) { return x.id === 'any'; }));
  }
  function winOf(e, wins) {
    if (!e.time) { const i = wins.map(function (w) { return w.id; }).indexOf(e.window || 'any'); return i < 0 ? wins.length - 1 : i; }
    const m = toMin(e.time); for (let i = 0; i < wins.length; i++) if (wins[i].id !== 'any' && m >= wins[i].from && m < wins[i].to) return i;
    return wins.length - 1;
  }
  function whenText(e) { return WL() ? WL().whenText(e) : e.time ? 'at ' + F.time(e.time) : 'any time'; }
  function who(e) { try { return WL().contact(e).name; } catch (err) { return e.kind === 'public' ? 'Public golfer' : 'Member'; } }
  /** Published public green fee for this request (18 holes): the requested time, the time they were told about, or
      the first public time in the part of the day they asked for. Members' requests carry no fee (golf is in dues). */
  function feeFor(e) {
    const R = Club.teeRules; if (!R || e.kind !== 'public') return null;
    let t = e.time || e.offerTime;
    if (!t && WL()) { const ts = WL().timesFor(e); t = ts.filter(function (x) { return R.publicSlot(e.date, x).ok; })[0] || ts[0]; }
    return t ? R.greenFee(e.date, t, 18) : null;
  }
  function demandData(ctx) {
    return memoed(ctx, 'demand', demandData_);
  }
  function demandData_(ctx) {
    const inR = H.inRange(ctx), wins = windows();
    const list = all((WL() && WL().COLL) || 'teeWaitlist').filter(function (e) { return e && inR(e.date); })
      .map(function (e) { const o = outcomeOf(e); return { e: e, o: o, players: Math.max(1, num(e.players)), wd: wdOf(e.date), win: winOf(e, wins), fee: o === 'booked' ? null : feeFor(e) }; });
    const by = {}; OUTCOMES.forEach(function (o) { by[o.id] = { n: 0, players: 0 }; });
    list.forEach(function (r) { by[r.o].n++; by[r.o].players += r.players; });
    const heat = wins.map(function () { return WD.map(function () { return { n: 0, players: 0 }; }); });
    list.forEach(function (r) { heat[r.win][r.wd].n++; heat[r.win][r.wd].players += r.players; });
    const slots = {};
    list.forEach(function (r) {
      const e = r.e, h = e.time ? Math.floor(toMin(e.time) / 60) : null;
      const key = r.wd + '|' + (h != null ? 'h' + h : 'w' + (e.window || 'any'));
      const s = slots[key] = slots[key] || { key: key, wd: r.wd, h: h, win: e.time ? null : (e.window || 'any'), n: 0, players: 0, booked: 0, rows: [] };
      s.n++; s.players += r.players; if (r.o === 'booked') s.booked++; s.rows.push(r);
    });
    const top = Object.keys(slots).map(function (k) { return slots[k]; }).sort(function (a, b) { return b.players - a.players || b.n - a.n || a.wd - b.wd; });
    const pub = list.filter(function (r) { return r.e.kind === 'public' && r.o !== 'booked' && r.o !== 'waiting'; });
    const lost = { players: pub.reduce(function (s, r) { return s + r.players; }, 0), dollars: pub.reduce(function (s, r) { return s + (r.fee != null ? r.fee * r.players : 0); }, 0), priced: pub.filter(function (r) { return r.fee != null; }).length, n: pub.length };
    const memberLost = list.filter(function (r) { return r.e.kind !== 'public' && r.o !== 'booked' && r.o !== 'waiting'; }).reduce(function (s, r) { return s + r.players; }, 0);
    return { list: list, by: by, heat: heat, wins: wins, top: top, lost: lost, memberLost: memberLost, players: list.reduce(function (s, r) { return s + r.players; }, 0) };
  }
  function slotLabel(s, long) {
    const day = long ? WD_LONG[s.wd].slice(0, -1) : WD[s.wd];
    if (s.h != null) { const a = (s.h < 10 ? '0' : '') + s.h + ':00', b = ((s.h + 1) < 10 ? '0' : '') + (s.h + 1) + ':00'; return day + ', ' + F.time(a).replace(':00', '') + ' to ' + F.time(b).replace(':00', ''); }
    const w = windows().filter(function (x) { return x.id === s.win; })[0];
    return day + ', ' + (w ? (w.id === 'any' ? 'any time' : w.label.toLowerCase()) : 'any time');
  }
  function rateNote() {
    const R = Club.teeRules && Club.teeRules.RATES;
    if (!R) return 'No published green fee is on file, so lost demand is shown in players only.';
    return 'Public green fees not captured use the published 18-hole public rate for each requested time, from the booking rules: ' +
      F.money0(R.weekday) + ' weekday, ' + F.money0(R.weekend) + ' weekend and holiday, ' + F.money0(R.twilight) + ' twilight (the twilight rate is marked as a placeholder in the code). Members\' requests are counted in players only, as member golf is covered by dues.';
  }
  function demandCSV(ctx) {
    const d = demandData(ctx);
    const csv = [['Tee date', 'Weekday', 'Requested', 'Golfer type', 'Players', 'Outcome', 'Asked on', 'Public green fee each', 'Not captured']];
    d.list.slice().sort(function (a, b) { return (a.e.date + (a.e.time || '')).localeCompare(b.e.date + (b.e.time || '')); }).forEach(function (r) {
      csv.push([r.e.date, WD[r.wd], r.e.time || (r.e.window || 'any'), r.e.kind === 'public' ? 'Public' : 'Member', r.players, OUTCOMES.filter(function (o) { return o.id === r.o; })[0].label,
        String(r.e.createdAt || '').slice(0, 10), r.fee != null ? r.fee : '', r.fee != null && r.o !== 'booked' && r.o !== 'waiting' ? r.fee * r.players : '']);
    });
    return csv;
  }
  function demandDrill(ctx, slotKey) {
    const d = demandData(ctx);
    let rows = d.list, title = 'Lost tee time demand';
    const slot = slotKey ? d.top.filter(function (s) { return s.key === slotKey; })[0] : null;
    if (slot) { rows = slot.rows; title = slotLabel(slot, true); }
    if (!rows.length) return { title: title, body: X.empty('No requests', 'No one asked to join the waitlist for these times.', 'clock') };
    const n = rows.length, players = rows.reduce(function (s, r) { return s + r.players; }, 0);
    const bk = rows.filter(function (r) { return r.o === 'booked'; }).length;
    const lostRows = rows.filter(function (r) { return r.o === 'expired' || r.o === 'removed'; });
    const pubLost = lostRows.filter(function (r) { return r.e.kind === 'public' && r.fee != null; });
    const dollars = pubLost.reduce(function (s, r) { return s + r.fee * r.players; }, 0);
    let body = X.kpis([
      { label: 'Requests', value: F.num(n), sub: plural(players, 'player') },
      { label: 'Booked later', value: pctTxt(bk, n), sub: F.num(bk) + ' of ' + plural(n, 'request') },
      { label: 'Not placed', value: F.num(lostRows.reduce(function (s, r) { return s + r.players; }, 0)), sub: 'Players expired or removed' },
      pubLost.length ? { label: 'Not captured', value: F.money0(dollars), sub: 'Public green fees, ' + plural(pubLost.length, 'request') } : { label: 'Not captured', value: 'Players only', sub: 'No public requests to price' }
    ]);
    body += X.sec('What became of them', '', X.table([{ label: 'Outcome' }, { label: 'Share' }, { label: 'Requests', num: true }, { label: 'Players', num: true }],
      OUTCOMES.map(function (o) {
        const rs = rows.filter(function (r) { return r.o === o.id; });
        return rs.length || o.id !== 'waiting' ? ['<span class="primary-cell">' + esc(o.label) + '</span>', X.share(rs.length, n), F.num(rs.length), F.num(rs.reduce(function (s, r) { return s + r.players; }, 0))] : null;
      }).filter(Boolean)));
    if (!slot) {
      body += X.sec('By weekday', '', X.table([{ label: 'Day' }, { label: 'Requests', num: true }, { label: 'Players', num: true }, { label: 'Booked later', num: true }],
        WD.map(function (w, i) { const rs = rows.filter(function (r) { return r.wd === i; }); return ['<span class="primary-cell">' + esc(WD_LONG[i].slice(0, -1)) + '</span>', F.num(rs.length), F.num(rs.reduce(function (s, r) { return s + r.players; }, 0)), F.num(rs.filter(function (r) { return r.o === 'booked'; }).length)]; })));
      body += X.sec('Most wanted', 'Day of the week and hour asked for', X.table([{ label: 'Day and time' }, { label: 'Requests', num: true }, { label: 'Players', num: true }, { label: 'Booked', num: true }],
        d.top.slice(0, 10).map(function (s) { return ['<span class="primary-cell">' + esc(slotLabel(s)) + '</span>', F.num(s.n), F.num(s.players), F.num(s.booked)]; })));
    }
    const recent = rows.slice().sort(function (a, b) { return (b.e.date + (b.e.time || '')).localeCompare(a.e.date + (a.e.time || '')); }).slice(0, 25);
    body += X.sec('Requests', n > 25 ? 'Latest 25 of ' + F.num(n) : plural(n, 'request'), X.table([{ label: 'Tee date' }, { label: 'Asked for' }, { label: 'Golfer' }, { label: 'Players', num: true }, { label: 'Outcome' }],
      recent.map(function (r) {
        const o = OUTCOMES.filter(function (x) { return x.id === r.o; })[0];
        return ['<span class="primary-cell">' + esc(F.weekday(r.e.date) + ', ' + F.dateShort(r.e.date)) + '</span>', esc(whenText(r.e)), esc(who(r.e)) + (r.e.kind === 'public' ? ' <span class="muted">Public</span>' : ''), F.num(r.players), U.badge(o.label, o.badge)];
      })));
    body += X.note(rateNote());
    return { title: title, body: body, go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* ==================================================================================================
     Cancellations and no-shows
     ================================================================================================== */
  const SOURCES = [
    { id: 'staff', label: 'Golf shop', sub: 'Staff tee sheet' },
    { id: 'portal', label: 'Members\' portal', sub: 'Booked by members' },
    { id: 'public', label: 'Public site', sub: 'Booked online' },
    { id: 'none', label: 'Not recorded', sub: 'Older bookings without a source' }
  ];
  function srcOf(t) { return t.source === 'staff' || t.source === 'portal' || t.source === 'public' ? t.source : 'none'; }
  const RESOLVED = { 'completed': 1, 'no-show': 1, 'on-course': 1, 'checked-in': 1 };
  /** Lead time in minutes between cancelling and the tee time, or null when not recorded. */
  function leadMin(t) {
    if (!t.cancelledAt) return null;
    const at = Date.parse(t.cancelledAt); if (isNaN(at)) return null;
    const d = F.toDate(t.date); d.setHours(0, 0, 0, 0); d.setMinutes(toMin(t.time));
    return Math.round((d.getTime() - at) / 60000);
  }
  const NOTICE = [
    { id: 'short', label: 'Under 24 hours', test: function (m) { return m < 1440; } },
    { id: 'mid', label: '1 to 3 days', test: function (m) { return m >= 1440 && m < 4320; } },
    { id: 'long', label: 'More than 3 days', test: function (m) { return m >= 4320; } }
  ];
  function noticeText(m) { if (m == null) return 'Not recorded'; if (m < 0) return 'After the tee time'; if (m < 120) return m + ' min'; if (m < 2880) return Math.round(m / 60) + ' hours'; return Math.round(m / 1440) + ' days'; }
  function cancelData(ctx) {
    return memoed(ctx, 'cancel', cancelData_);
  }
  function cancelData_(ctx) {
    const inR = H.inRange(ctx), T = today();
    const tees = all('teeTimes').filter(function (t) { return t.date && t.date <= T && inR(t.date); });
    const cancelled = tees.filter(function (t) { return t.status === 'cancelled'; });
    const due = tees.filter(function (t) { return t.status !== 'cancelled' && (t.date < T || RESOLVED[t.status]); });
    const noShows = due.filter(function (t) { return t.status === 'no-show'; });
    // Refilled: a golfer on the waitlist booked the same day and time after it was cancelled.
    const wl = all((WL() && WL().COLL) || 'teeWaitlist').filter(function (e) { return e && e.status === 'booked' && inR(e.date); });
    const usedWl = {}, refilled = {}, byId = {};
    all('teeTimes').forEach(function (t) { byId[t.id] = t; });
    cancelled.slice().sort(function (a, b) { return String(a.cancelledAt || '').localeCompare(String(b.cancelledAt || '')); }).forEach(function (c) {
      const hit = wl.filter(function (e) {
        if (usedWl[e.id] || e.date !== c.date) return false;
        const bt = e.bookedTeeTimeId ? byId[e.bookedTeeTimeId] : null;
        if (!((bt && bt.time === c.time) || e.offerTime === c.time)) return false;
        return !c.cancelledAt || !e.bookedAt || e.bookedAt >= c.cancelledAt;
      })[0];
      if (hit) { usedWl[hit.id] = 1; refilled[c.id] = hit; }
    });
    const timed = cancelled.filter(function (t) { return leadMin(t) != null; });
    const firstStamp = all('teeTimes').map(function (t) { return t.cancelledAt; }).filter(Boolean).sort()[0] || null;
    return { tees: tees, cancelled: cancelled, due: due, noShows: noShows, refilled: refilled, nRefilled: Object.keys(refilled).length, timed: timed, firstStamp: firstStamp };
  }
  function rateRow(list, key) {
    const tees = list.filter(key), c = tees.filter(function (t) { return t.status === 'cancelled'; }).length;
    const due = tees.filter(function (t) { return t.status !== 'cancelled' && (t.date < today() || RESOLVED[t.status]); });
    const ns = due.filter(function (t) { return t.status === 'no-show'; }).length;
    return { n: tees.length, c: c, cRate: pct(c, tees.length), due: due.length, ns: ns, nsRate: pct(ns, due.length) };
  }
  function historyNote(d) {
    const missing = d.cancelled.length - d.timed.length;
    if (!d.cancelled.length) return '';
    if (!d.firstStamp) return 'Cancellation times are recorded from now on, so notice given will show here as new cancellations come in.';
    return 'Cancellation times are recorded from ' + F.date(d.firstStamp.slice(0, 10)) + '. ' + (missing ? plural(missing, 'cancellation') + ' in this period ' + (missing === 1 ? 'has' : 'have') + ' no time on file and ' + (missing === 1 ? 'is' : 'are') + ' left out of notice given.' : 'Every cancellation in this period has a time on file.');
  }
  function cancelCSV(ctx) {
    const d = cancelData(ctx);
    const wd = WD.map(function (_, i) { return rateRow(d.tees, function (t) { return wdOf(t.date) === i; }); });
    const src = SOURCES.map(function (s) { return rateRow(d.tees, function (t) { return srcOf(t) === s.id; }); });
    const csv = [['Group', 'Name', 'Bookings', 'Cancelled', 'Cancellation rate %', 'Groups due', 'No-shows', 'No-show rate %']];
    wd.forEach(function (r, i) { csv.push(['Weekday', WD[i], r.n, r.c, r.cRate, r.due, r.ns, r.nsRate]); });
    src.forEach(function (r, i) { csv.push(['Source', SOURCES[i].label, r.n, r.c, r.cRate, r.due, r.ns, r.nsRate]); });
    csv.push([]); csv.push(['Date', 'Tee time', 'Status', 'Lead player', 'Players', 'Source', 'Cancelled at', 'Notice (hours)', 'Refilled from waitlist']);
    d.cancelled.concat(d.noShows).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).forEach(function (t) {
      const m = t.status === 'cancelled' ? leadMin(t) : null;
      csv.push([t.date, t.time, t.status, leadName(t), (t.players || []).length, SOURCES.filter(function (s) { return s.id === srcOf(t); })[0].label, t.cancelledAt || '', m != null ? (m / 60).toFixed(1) : '', t.status === 'cancelled' ? (d.refilled[t.id] ? 'Yes' : 'No') : '']);
    });
    return csv;
  }
  function cancelDrill(ctx, srcId) {
    const d0 = cancelData(ctx), s = srcId ? SOURCES.filter(function (x) { return x.id === srcId; })[0] : null;
    const keep = function (t) { return !s || srcOf(t) === s.id; };
    const d = { tees: d0.tees.filter(keep), cancelled: d0.cancelled.filter(keep), due: d0.due.filter(keep), noShows: d0.noShows.filter(keep), timed: d0.timed.filter(keep), refilled: d0.refilled, firstStamp: d0.firstStamp };
    const title = s ? 'Cancellations and no-shows, ' + s.label.charAt(0).toLowerCase() + s.label.slice(1) : 'Cancellations and no-shows';
    if (!d.tees.length) return { title: title, body: X.empty('No bookings', 'Nothing was booked this way in the period.', 'teesheet') };
    const nRef = d.cancelled.filter(function (t) { return d.refilled[t.id]; }).length;
    let body = X.kpis([
      { label: 'Bookings', value: F.num(d.tees.length), sub: 'Dated in the period' },
      { label: 'Cancelled', value: pctTxt(d.cancelled.length, d.tees.length), sub: plural(d.cancelled.length, 'tee time') },
      { label: 'No-shows', value: pctTxt(d.noShows.length, d.due.length), sub: F.num(d.noShows.length) + ' of ' + plural(d.due.length, 'group') + ' due' },
      { label: 'Refilled', value: F.num(nRef), sub: 'From the waitlist' }
    ]);
    body += X.sec('By weekday', '', X.table([{ label: 'Day' }, { label: 'Bookings', num: true }, { label: 'Cancelled', num: true }, { label: 'Rate', num: true }, { label: 'No-shows', num: true }, { label: 'Rate', num: true }],
      WD.map(function (w, i) { const r = rateRow(d.tees, function (t) { return wdOf(t.date) === i; }); return ['<span class="primary-cell">' + esc(WD_LONG[i].slice(0, -1)) + '</span>', F.num(r.n), F.num(r.c), r.n ? r.cRate + '%' : '-', F.num(r.ns), r.due ? r.nsRate + '%' : '-']; })));
    if (!s) body += X.sec('By how it was booked', '', X.table([{ label: 'Source' }, { label: 'Bookings', num: true }, { label: 'Cancelled', num: true }, { label: 'Rate', num: true }, { label: 'No-shows', num: true }, { label: 'Rate', num: true }],
      SOURCES.map(function (x) { const r = rateRow(d.tees, function (t) { return srcOf(t) === x.id; }); return r.n || x.id !== 'none' ? ['<span class="primary-cell">' + esc(x.label) + '</span><div class="dd-sub">' + esc(x.sub) + '</div>', F.num(r.n), F.num(r.c), r.n ? r.cRate + '%' : '-', F.num(r.ns), r.due ? r.nsRate + '%' : '-'] : null; }).filter(Boolean)));
    if (d.cancelled.length) {
      body += X.sec('Notice given', plural(d.timed.length, 'cancellation') + ' with a time on file', d.timed.length ? X.table([{ label: 'Notice' }, { label: 'Share' }, { label: 'Cancelled', num: true }, { label: 'Refilled', num: true }],
        NOTICE.map(function (b) { const ts = d.timed.filter(function (t) { const m = leadMin(t); return m >= 0 && b.test(m); }); return ['<span class="primary-cell">' + esc(b.label) + '</span>', X.share(ts.length, d.timed.length), F.num(ts.length), F.num(ts.filter(function (t) { return d.refilled[t.id]; }).length)]; })) : '') + X.note(historyNote(d));
      const recent = d.cancelled.slice().sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 20);
      body += X.sec('Cancelled tee times', d.cancelled.length > 20 ? 'Latest 20 of ' + F.num(d.cancelled.length) : plural(d.cancelled.length, 'tee time'), X.table([{ label: 'Date' }, { label: 'Tee time' }, { label: 'Lead player' }, { label: 'Notice' }, { label: 'Refilled' }],
        recent.map(function (t) { return ['<span class="primary-cell">' + esc(F.weekday(t.date) + ', ' + F.dateShort(t.date)) + '</span>', esc(F.time(t.time)), esc(leadName(t)) + '<div class="dd-sub">' + esc(SOURCES.filter(function (x) { return x.id === srcOf(t); })[0].label + ', ' + plural((t.players || []).length, 'player')) + '</div>', esc(noticeText(leadMin(t))), d.refilled[t.id] ? U.badge('From waitlist', 'good') : '<span class="muted">No</span>']; })));
    }
    if (d.noShows.length) {
      const ns = d.noShows.slice().sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 20);
      body += X.sec('No-shows', d.noShows.length > 20 ? 'Latest 20 of ' + F.num(d.noShows.length) : plural(d.noShows.length, 'group'), X.table([{ label: 'Date' }, { label: 'Tee time' }, { label: 'Lead player' }, { label: 'Players', num: true }],
        ns.map(function (t) { return ['<span class="primary-cell">' + esc(F.weekday(t.date) + ', ' + F.dateShort(t.date)) + '</span>', esc(F.time(t.time)), esc(leadName(t)) + '<div class="dd-sub">' + esc(SOURCES.filter(function (x) { return x.id === srcOf(t); })[0].label) + '</div>', F.num((t.players || []).length)]; })));
    }
    return { title: title, body: body, go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* ==================================================================================================
     Weather and rounds (the daily weather log in js/core/club.js)
     ================================================================================================== */
  const WET_MM = 1;   // a wet day: 1 mm of precipitation or more
  const TEMP = [
    { label: 'Below 5°C', test: function (t) { return t < 5; } },
    { label: '5 to 9°C', test: function (t) { return t >= 5 && t < 10; } },
    { label: '10 to 14°C', test: function (t) { return t >= 10 && t < 15; } },
    { label: '15 to 19°C', test: function (t) { return t >= 15 && t < 20; } },
    { label: '20 to 24°C', test: function (t) { return t >= 20 && t < 25; } },
    { label: '25 to 29°C', test: function (t) { return t >= 25 && t < 30; } },
    { label: '30°C and above', test: function (t) { return t >= 30; } }
  ];
  function weatherData(ctx) {
    return memoed(ctx, 'weather', weatherData_);
  }
  function weatherData_(ctx) {
    const wx = {}; all('weatherLog').forEach(function (w) { if (w && w.date) wx[w.date] = w; });
    const T = today(), ix = ctx.ix, days = [], open = [];
    for (let d = ctx.from; d <= ctx.to && d < T; d = D.addDays(d, 1)) {
      const sheet = ix.teeAll[d]; if (!sheet || !sheet.length) continue;
      open.push(d);
      const w = wx[d]; if (!w) continue;
      const played = ix.tee[d] || [];
      const due = sheet.filter(function (t) { return t.status !== 'cancelled'; });
      days.push({ date: d, w: w, wet: num(w.precip) >= WET_MM, hi: num(w.hi), rounds: played.reduce(function (s, t) { return s + (t.players || []).length; }, 0),
        bookings: sheet.length, cancelled: sheet.length - due.length, due: due.length, noShows: due.filter(function (t) { return t.status === 'no-show'; }).length });
    }
    function group(list) {
      const g = { days: list.length, rounds: 0, bookings: 0, cancelled: 0, due: 0, noShows: 0 };
      list.forEach(function (x) { g.rounds += x.rounds; g.bookings += x.bookings; g.cancelled += x.cancelled; g.due += x.due; g.noShows += x.noShows; });
      g.avg = g.days ? g.rounds / g.days : 0; g.cRate = pct(g.cancelled, g.bookings); g.nsRate = pct(g.noShows, g.due);
      return g;
    }
    const dry = group(days.filter(function (x) { return !x.wet; })), wet = group(days.filter(function (x) { return x.wet; }));
    const temps = TEMP.map(function (b) { return Object.assign({ label: b.label }, group(days.filter(function (x) { return b.test(x.hi); }))); }).filter(function (b) { return b.days; });
    const demo = days.filter(function (x) { return x.w.source === 'demo'; }).length;
    const logged = Object.keys(wx).sort();
    return { days: days, open: open, dry: dry, wet: wet, temps: temps, demo: demo, logFrom: logged[0] || null };
  }
  function wxFoot(d) {
    let t = 'A wet day has ' + WET_MM + ' mm of precipitation or more. Weather comes from the club\'s daily weather log, filled from the live Open-Meteo forecast for the course';
    t += d.demo ? (d.demo === d.days.length ? '; every day shown uses demo readings until live readings arrive.' : '; ' + plural(d.demo, 'day') + ' shown ' + (d.demo === 1 ? 'uses' : 'use') + ' demo readings.') : '.';
    if (d.open.length > d.days.length) t += ' The log covers ' + F.num(d.days.length) + ' of the ' + plural(d.open.length, 'day') + ' with tee sheet records in this period' + (d.logFrom ? ', starting ' + F.date(d.logFrom) : '') + '.';
    return t + ' Today is left out until the day is over.';
  }
  function changeTxt(a, b) { if (!b) return ''; const c = Math.round((a - b) / b * 100); return c === 0 ? 'Same as dry days' : Math.abs(c) + '% ' + (c < 0 ? 'fewer' : 'more') + ' than dry days'; }
  function weatherCSV(ctx) {
    const d = weatherData(ctx);
    const csv = [['Date', 'Weekday', 'Conditions', 'High °C', 'Low °C', 'Precipitation mm', 'Wind km/h', 'Wet day', 'Weather source', 'Rounds', 'Bookings', 'Cancelled', 'No-shows']];
    d.days.forEach(function (x) { csv.push([x.date, WD[wdOf(x.date)], x.w.cond, x.w.hi, x.w.lo, x.w.precip, x.w.wind, x.wet ? 'Yes' : 'No', x.w.source === 'demo' ? 'Demo' : 'Live', x.rounds, x.bookings, x.cancelled, x.noShows]); });
    return csv;
  }
  function weatherDrill(ctx) {
    const d = weatherData(ctx), w = d.wet, y = d.dry;
    if (!d.days.length) return { title: 'Weather and rounds', body: X.empty('No weather on file', 'The daily weather log does not cover this period yet.', 'cloud') };
    let body = X.kpis([
      { label: 'Days compared', value: F.num(d.days.length), sub: F.num(y.days) + ' dry, ' + F.num(w.days) + ' wet' },
      { label: 'Dry day rounds', value: y.days ? F.num(Math.round(y.avg)) : 'None', sub: 'A day on average' },
      { label: 'Wet day rounds', value: w.days ? F.num(Math.round(w.avg)) : 'None', sub: w.days && y.days ? changeTxt(w.avg, y.avg) : 'A day on average' },
      { label: 'Wet day no-shows', value: w.due ? w.nsRate + '%' : 'n/a', sub: 'Against ' + (y.due ? y.nsRate + '%' : 'n/a') + ' on dry days' }
    ]);
    body += X.sec('Dry and wet days', '', X.table([{ label: '' }, { label: 'Days', num: true }, { label: 'Rounds a day', num: true }, { label: 'Cancelled', num: true }, { label: 'No-shows', num: true }],
      [['<span class="primary-cell">Dry</span>', F.num(y.days), y.days ? F.num(Math.round(y.avg)) : '-', y.bookings ? y.cRate + '%' : '-', y.due ? y.nsRate + '%' : '-'],
        ['<span class="primary-cell">Wet</span>', F.num(w.days), w.days ? F.num(Math.round(w.avg)) : '-', w.bookings ? w.cRate + '%' : '-', w.due ? w.nsRate + '%' : '-']]));
    body += X.sec('By high temperature', '', X.table([{ label: 'High' }, { label: 'Days', num: true }, { label: 'Rounds a day', num: true }, { label: 'Cancelled', num: true }],
      d.temps.map(function (b) { return ['<span class="primary-cell">' + esc(b.label) + '</span>', F.num(b.days), F.num(Math.round(b.avg)), b.cRate + '%']; })));
    body += X.sec('Day by day', plural(d.days.length, 'day'), X.table([{ label: 'Date' }, { label: 'Weather' }, { label: 'High / low', num: true }, { label: 'Rain', num: true }, { label: 'Rounds', num: true }, { label: 'Cancelled', num: true }, { label: 'No-shows', num: true }],
      d.days.slice().reverse().map(function (x) {
        return ['<span class="primary-cell">' + esc(F.weekday(x.date) + ', ' + F.dateShort(x.date)) + '</span>',
          '<span class="rgo-wx">' + Club.icon(x.w.icon || 'cloud') + esc(x.w.cond || '') + '</span>' + (x.w.source === 'demo' ? '<div class="dd-sub">Demo reading</div>' : ''),
          esc(x.w.hi + '° / ' + x.w.lo + '°'), (x.wet ? '<strong>' : '') + esc(num(x.w.precip) + ' mm') + (x.wet ? '</strong>' : ''), F.num(x.rounds), F.num(x.cancelled), F.num(x.noShows)];
      })));
    body += X.note(wxFoot(d));
    return { title: 'Weather and rounds', body: body, go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* ==================================================================================================
     The section
     ================================================================================================== */
  function kpis(ctx) {
    const r = roundsData(ctx), p = ctx.prev ? H.periodTotals(ctx.prev.rows).rounds : 0, u = unitWord(ctx);
    const T = targets(), a = paceAgg(timedRounds(ctx)), c = cancelData(ctx);
    /* Changes on the period before: rounds and the guest share from the period's rows; pace and cancellations from the
       tee sheet, when it covers the whole earlier period. */
    const pg = ctx.prev ? H.sum(ctx.prev.rows, function (x) { return x.guestRounds; }) : 0;
    const gShare = H.prevOK(ctx, 'rounds') && p && r.total ? H.kpiChg(r.guests / r.total * 100 - pg / p * 100, 'pts', H.prevWords(ctx)) : null;
    const pc = H.coversPrev(ctx, ctx.ix.first.tee) ? H.prevCtx(ctx) : null, pa = pc ? paceAgg(timedRounds(pc)) : null, pcn = pc ? cancelData(pc) : null;
    const out = [
      { label: 'Rounds played', value: H.numShort(r.total), d: H.delta(r.total, p, ctx, 'rounds', F.num(Math.round(H.avgPer(ctx, r.total))) + ' per ' + H.avgUnit(ctx)), chg: H.prevPct(r.total, p, ctx, 'rounds'), drill: 'rounds', aria: 'Rounds played ' + F.num(r.total) },
      { label: 'Played by guests', value: (r.total ? Math.round(r.guests / r.total * 100) : 0) + '%', d: esc(F.num(r.guests) + ' guest ' + plural(r.guests, 'round').replace(/^\S+ /, '')), chg: gShare, drill: 'rounds' },
      { label: 'Busiest ' + u, value: r.busiest ? (ctx.gran === 'day' ? F.dateShort(r.busiest.key) : H.monthLong(r.busiest.key).split(' ')[0]) : 'None', d: esc(r.busiest ? plural(r.busiest.rounds, 'round') : 'No complete ' + u + 's yet'), drill: 'rounds' }
    ];
    if (a.avg18 != null) out.push({ label: '18-hole round', value: dur(a.avg18), d: esc(T ? overWords(a.avg18 - T[18]) + ' of ' + dur(T[18]) : plural(a.n18, 'timed round')), chg: pa && pa.n18 >= 3 && a.n18 >= 3 ? H.kpiChg(a.avg18 - pa.avg18, 'min', H.prevWords(ctx), { upGood: false }) : null, drill: 'pace', aria: '18-hole round ' + dur(a.avg18) });
    else if (!c.tees.length) {
      /* No bookings to count: say so rather than "0%, 0 of 0". Monthly history has rounds but no tee sheet. */
      const ft = ctx.ix.first.tee, none = !ft || ft > ctx.to;
      out.push({ label: 'Cancelled', value: none ? 'Not on file' : 'None', d: esc(none ? (ft ? 'Tee sheet records begin ' + F.dateShort(ft) : 'No tee sheet records on file') : 'No tee times booked in this period'), drill: 'cancel' });
    }
    else out.push({ label: 'Cancelled', value: pctTxt(c.cancelled.length, c.tees.length), d: esc(F.num(c.cancelled.length) + ' of ' + plural(c.tees.length, 'booking')), chg: pcn && pcn.tees.length && c.tees.length ? H.kpiChg(pct(c.cancelled.length, c.tees.length) - pct(pcn.cancelled.length, pcn.tees.length), 'pts', H.prevWords(ctx), { upGood: false }) : null, drill: 'cancel' });
    return out;
  }
  function unitWord(ctx) { return H.unitWord(ctx); }
  function main(ctx, state) {
    const chip = state.chip || 'all', r = roundsData(ctx), L = H.colLabels(ctx);
    const pick = function (x) { return chip === 'members' ? Math.max(0, num(x.rounds) - num(x.guestRounds)) : chip === 'guests' ? num(x.guestRounds) : num(x.rounds); };
    const vals = ctx.rows.map(pick), total = H.sum(vals, function (v) { return v; });
    const fair = H.fairRows(ctx), fv = fair.map(pick), bi = fv.indexOf(Math.max.apply(null, fv)), best = fair[bi];
    const what = chip === 'members' ? 'Member rounds' : chip === 'guests' ? 'Guest rounds' : 'Rounds';
    let take;
    if (!total) take = 'No ' + what.toLowerCase() + ' were recorded in this period.';
    else take = (best && fv[bi] ? (ctx.gran === 'day' ? F.weekday(best.key) + ', ' + F.dateShort(best.key) : H.monthLong(best.key).split(' ')[0]) + ' was the busiest ' + unitWord(ctx) + ' with ' + F.num(fv[bi]) + ' ' + what.toLowerCase() + '. ' : '') +
      (chip === 'all' ? 'Guests played ' + (r.total ? Math.round(r.guests / r.total * 100) : 0) + '% of the ' + F.num(r.total) + ' rounds.' : F.num(total) + ' in all, ' + (r.total ? Math.round(total / r.total * 100) : 0) + '% of rounds.');
    return { id: 'golf-rounds', title: 'Rounds by ' + unitWord(ctx), take: take, chips: [{ id: 'all', label: 'All rounds' }, { id: 'members', label: 'Members' }, { id: 'guests', label: 'Guests' }], chip: chip,
      body: Club.charts.columns({ labels: L.labels, years: L.years, tipTitles: L.titles, partial: L.partial, values: vals, tipName: what, ariaLabel: what + ' by ' + unitWord(ctx) }),
      desc: roundsDesc(ctx, chip),
      foot: H.partialNote(ctx) || (ctx.gran === 'month' && closedText() ? closedText(true) + '.' : ''), csvId: 'rounds', drill: 'rounds', drillLabel: 'See the table' };
  }
  function panels(ctx) {
    const u = utilData(ctx), r = roundsData(ctx), T = targets(), rounds = timedRounds(ctx), a = paceAgg(rounds), g = paceGroups(rounds), d = demandData(ctx), c = cancelData(ctx), w = weatherData(ctx);
    const out = [];
    out.push({ id: 'golf-util', title: 'Tee sheet use by weekday', take: !u.ok ? 'Use by weekday appears once tee times have been played in the selected dates.' : WD_FULL[u.best] + ' is the fullest day, with ' + u.vals[u.best] + '% of slots filled. ' + WD_FULL[u.low] + ' has the most room at ' + u.vals[u.low] + '%.',
      body: u.ok ? Club.charts.columns({ labels: WD, tipTitles: WD_LONG, values: u.vals, pct: true, tipName: 'Slots filled', height: 200, ariaLabel: 'Share of tee sheet slots filled by weekday' }) : '',
      desc: utilDesc(u), foot: u.ok ? 'Share of ' + u.cap + ' daily player slots filled, over ' + u.days + ' ' + plural(u.days, 'day').replace(/^\S+ /, '') + ' on the sheet.' : '', csvId: 'util', drill: 'util', drillLabel: 'See details' });
    const pl = r.played;
    out.push({ id: 'golf-played', title: 'How rounds were played', take: !pl.n ? 'Round length and cart use come from the tee sheet, which holds no records for this period.' : Math.round(pl.p18 / pl.n * 100) + '% of players went 18 holes and ' + Math.round(pl.cart / pl.n * 100) + '% rode a cart, from ' + plural(r.tees.length, 'tee time') + ' on file.',
      body: pl.n ? Club.charts.ranked([{ label: '18 holes', value: pl.p18 }, { label: '9 holes', value: pl.p9 }, { label: 'Riding a cart', value: pl.cart }, { label: 'Walking', value: pl.walk }], { total: pl.n }) : '',
      desc: playedDesc(r), foot: ctx.ix.first.tee > ctx.from ? 'Tee sheet detail begins ' + F.dateShort(ctx.ix.first.tee) + '.' : '', csvId: 'rounds', drill: 'rounds', drillLabel: 'See the table' });
    out.push({ id: 'golf-pace', title: 'Pace of play', take: !rounds.length ? 'Round lengths appear once the starter sends groups off and marks them complete on the tee sheet.' : (a.avg18 != null ? '18-hole rounds average ' + dur(a.avg18) + (T ? ', ' + overWords(a.avg18 - T[18]) : '') + '. ' : '') + (g.slowBd >= 0 ? BANDS[g.slowBd].label + ' tee times are the slowest' + (T ? ', ' + overWords(g.bd[g.slowBd].vs) : '') + '.' : plural(rounds.length, 'timed round') + '.'),
      body: rounds.length ? (T ? '<div class="rgo-legend"><i class="under"></i>Under target<i class="over"></i>Over target</div>' : '') + paceRows(g.bd, BAND_LABELS, g.slowBd, 'band', T) : '',
      desc: paceDesc(rounds, a, T), foot: T ? 'Against the tee sheet\'s targets, ' + dur(T[18]) + ' for 18 holes and ' + dur(T[9]) + ' for 9.' : '', csvId: 'pace', drill: 'pace', drillLabel: 'See the slowest rounds' });
    const n = d.list.length, b = d.by;
    out.push({ id: 'golf-demand', title: 'Lost tee time demand', take: !n ? 'When golfers ask to hear about a full day or tee time, their requests and what became of them appear here.' : plural(n, 'request') + ' for ' + plural(d.players, 'player') + ' on the waitlist; ' + pctTxt(b.booked.n, n) + ' booked later. ' + F.num(d.lost.players + d.memberLost) + ' players were not placed' + (d.lost.n && d.lost.priced ? ', about ' + F.money0(d.lost.dollars) + ' in public green fees not captured.' : '.'),
      body: n ? Club.charts.ranked(d.top.slice(0, 5).map(function (s) { return { label: slotLabel(s), sub: plural(s.n, 'request') + ', ' + s.booked + ' booked later', value: s.players, html: plural(s.players, 'player'), attrs: 'data-drill="slot" data-arg="' + esc(s.key) + '" aria-label="' + esc(slotLabel(s, true) + ': ' + plural(s.players, 'player') + ' asking. View requests') + '"' }; }), { total: d.players }) : '',
      desc: demandDesc(d), foot: n ? 'The most wanted days and times.' : '', csvId: 'demand', drill: 'demand', drillLabel: 'See all requests' });
    const nb = c.tees.length, wdRates = WD.map(function (_, i) { return rateRow(c.tees, function (t) { return wdOf(t.date) === i; }); });
    const worst = nb ? wdRates.reduce(function (bst, x, i) { return x.n && x.cRate > wdRates[bst].cRate ? i : bst; }, 0) : -1;
    out.push({ id: 'golf-cancel', title: 'Cancellations and no-shows', take: !nb ? 'Cancellation and no-show rates appear once tee times are booked for these dates.' : pctTxt(c.cancelled.length, nb) + ' of bookings were cancelled and ' + pctTxt(c.noShows.length, c.due.length) + ' of groups due were no-shows. ' + (c.cancelled.length ? F.num(c.nRefilled) + ' cancelled ' + (c.nRefilled === 1 ? 'time was' : 'times were') + ' refilled from the waitlist.' : '') + (worst >= 0 && wdRates[worst].c ? ' ' + WD_FULL[worst] + ' has the most cancellations.' : ''),
      body: nb ? Club.charts.columns({ labels: WD, tipTitles: WD_LONG, values: wdRates.map(function (x) { return x.cRate; }), pct: true, tipName: 'Cancelled', fmt: function (v) { return v + '% of bookings'; }, labelFmt: function (v) { return v + '%'; }, height: 200, ariaLabel: 'Cancellation rate by weekday' }) : '',
      desc: cancelDesc(c), foot: nb ? 'Cancelled tee times as a share of bookings dated in the period, by weekday.' : '', csvId: 'cancel', drill: 'cancel', drillLabel: 'See details' });
    const wet = w.wet, dry = w.dry;
    out.push({ id: 'golf-weather', title: 'Weather and rounds', take: !w.days.length ? (w.open.length ? 'The daily weather log does not cover the days in this period with tee sheet records. It fills in from the live forecast each day.' : 'Weather and rounds appear once there are tee sheet days with weather on file in the period.') : (wet.days && dry.days ? 'Wet days averaged ' + F.num(Math.round(wet.avg)) + ' rounds, ' + changeTxt(wet.avg, dry.avg).toLowerCase() + ' (' + F.num(Math.round(dry.avg)) + ').' : dry.days ? 'Dry days averaged ' + F.num(Math.round(dry.avg)) + ' rounds; no wet days in this period.' : 'Only wet days on file, ' + F.num(Math.round(wet.avg)) + ' rounds a day.') + (w.temps.length > 1 ? ' Rounds were highest when the high was ' + w.temps.reduce(function (bst, t) { return t.avg > bst.avg ? t : bst; }, w.temps[0]).label + '.' : ''),
      body: w.days.length ? Club.charts.columns({ labels: w.temps.map(function (t) { return t.label.replace('°C', '').replace(' and above', '+'); }), tipTitles: w.temps.map(function (t) { return 'High ' + t.label + ', ' + plural(t.days, 'day'); }), values: w.temps.map(function (t) { return Math.round(t.avg); }), tipName: 'Rounds a day', height: 200, ariaLabel: 'Rounds a day by high temperature' }) : '',
      desc: weatherDesc(w), foot: w.days.length ? 'Rounds a day by the day\'s high temperature, over ' + plural(w.days.length, 'day') + ' with weather on file.' : '', csvId: 'weather', drill: 'weather', drillLabel: 'See day by day' });
    return out;
  }
  /* ==================================================================================================
     Descriptions under the charts, and ideas to grow revenue
     ================================================================================================== */
  /* The golf season (Club.season, set by staff in Settings), read at call time: its length in weeks (30 for April 1
     to October 31) and the months the course is closed. */
  function seasonWeeks() { return Club.season.weeks(); }
  function closedText(cap) { const w = Club.season.winterLabel(); return w ? (cap ? 'The' : 'the') + ' course is closed ' + w : ''; }
  function money0(v) { return F.money0(v); }
  function teeSettings() { return Object.assign({ interval: 9, first: '06:30', last: '19:00' }, Club.store.getObj('teeSheetSettings', {}) || {}); }
  function cartFee() { const v = +teeSettings().cartFee; return v > 0 ? v : null; }
  function roundsDesc(ctx, chip) {
    const r = roundsData(ctx), u = unitWord(ctx);
    const pick = function (x) { return chip === 'members' ? Math.max(0, num(x.rounds) - num(x.guestRounds)) : chip === 'guests' ? num(x.guestRounds) : num(x.rounds); };
    const total = H.sum(ctx.rows, pick), what = chip === 'members' ? 'rounds played by members' : chip === 'guests' ? 'rounds played by members\' guests' : 'rounds played by members and guests';
    if (!total) return H.sents(['Each column counts the ' + what + ' each ' + u + '.', 'None were recorded in these dates' + (ctx.gran === 'month' && closedText() ? '; ' + closedText() + '.' : '.')]);
    const fair = H.fairRows(ctx).filter(function (x) { return ctx.gran === 'day' || H.inSeasonKey(x.key); });
    let lo = null; fair.forEach(function (x) { if (pick(x) > 0 && (!lo || pick(x) < pick(lo))) lo = x; });
    const out = ['Each column counts the ' + what + ' each ' + u + ', ' + F.num(total) + ' in all.'];
    if (lo && fair.length >= 2) out.push((ctx.gran === 'month' ? 'Of the golf season months, ' + H.monthLong(lo.key) : H.whenLabel(ctx, lo)) + ' was the quietest with ' + plural(pick(lo), 'round') + '.');
    if (chip === 'members') { const m = ctx.rows.length ? num(ctx.rows[ctx.rows.length - 1].members) : 0; if (m) out.push('That is about ' + Math.round(total / m) + ' rounds for each of the ' + m + ' members on the roll.'); }
    else out.push('Guests played ' + H.pctOf(r.guests, r.total) + '% of rounds. Guest rounds pay a green fee while member golf is covered by dues, so the guest share is what moves golf revenue.');
    return H.sents(out.slice(0, 4));
  }
  function utilDesc(u) {
    if (!u.ok) return H.sents(['Each column will show the share of tee times filled on each weekday.', 'There are no tee sheet days in this period yet.']);
    return H.sents(['Each column is the share of the ' + u.cap + ' daily player spots filled, averaged over the days each weekday was on the sheet.',
      u.best !== u.low ? 'The fullest and the quietest days are ' + (u.vals[u.best] - u.vals[u.low]) + ' points apart, ' + F.num(u.avgP[u.best]) + ' players a day against ' + F.num(u.avgP[u.low]) + '.' : '',
      'Spots left empty earn nothing, so the quiet days are the cheapest place to add rounds.']);
  }
  function playedDesc(r) {
    const pl = r.played, fee = cartFee();
    if (!pl.n) return H.sents(['Rows show how players went out: 18 or 9 holes, riding or walking.', 'This comes from the tee sheet, which holds no records for these dates.']);
    return H.sents(['Rows show how the ' + F.num(pl.n) + ' players on the tee sheet went out: 18 or 9 holes, riding or walking.',
      F.num(pl.walk) + ' walked' + (fee ? '; each walker who rides instead adds the ' + money0(fee) + ' cart fee to the round.' : '.'),
      pl.p9 / pl.n >= 0.2 ? 'Nine-hole rounds are ' + H.pctOf(pl.p9, pl.n) + '% of play, so shorter rounds suit many golfers here.' : '']);
  }
  function paceDesc(rounds, a, T) {
    if (!rounds.length) return H.sents(['Rows will compare the average round length with the target by time of day.', 'Round lengths appear once the starter marks groups complete on the tee sheet.']);
    return H.sents(['Rows compare the average round length with the tee sheet\'s target, by the time groups teed off.',
      T ? pctTxt(a.over, a.n) + ' of ' + plural(a.n, 'timed round') + ' ran over target.' : plural(a.n, 'round') + ' were timed.',
      'Slow play holds up the groups behind and can cost late tee times, so a word from the starter at the slowest times protects the tee sheet.']);
  }
  function demandDesc(d) {
    if (!d.list.length) return H.sents(['Rows will rank the days and times golfers asked for when the tee sheet was full.', 'No one joined the waitlist in this period.']);
    const top = d.top[0];
    return H.sents(['Rows rank the days and times golfers asked for when the tee sheet was full, by the players asking.',
      top ? 'The most wanted was ' + slotLabel(top, true) + ', with ' + plural(top.players, 'player') + '.' : '',
      d.lost.dollars ? 'Public golfers who were never placed would have paid about ' + money0(d.lost.dollars) + ' in green fees.' : '',
      'Repeated requests for the same times show where a call from the waitlist can still win a booking.']);
  }
  function cancelDesc(c) {
    if (!c.tees.length) return H.sents(['Columns will show the share of bookings cancelled on each weekday.', 'No tee times were booked for these dates.']);
    const short = c.timed.filter(function (t) { const m = leadMin(t); return m != null && m >= 0 && m < 1440; }).length;
    return H.sents(['Columns show the share of bookings cancelled on each weekday.',
      c.timed.length ? H.pctOf(short, c.timed.length) + '% of cancellations with a time on file came less than a day ahead.' : '',
      c.cancelled.length ? F.num(c.nRefilled) + ' of ' + plural(c.cancelled.length, 'cancelled tee time') + ' ' + (c.nRefilled === 1 ? 'was' : 'were') + ' refilled from the waitlist.' : 'Nothing was cancelled.',
      'Late cancellations are the hardest to refill, so a reminder the day before helps.']);
  }
  function weatherDesc(w) {
    if (!w.days.length) return H.sents(['Columns will show rounds a day by the day\'s high temperature.', 'The weather log does not cover tee sheet days in this period yet.']);
    return H.sents(['Columns show average rounds a day by the day\'s high temperature, over ' + plural(w.days.length, 'day') + ' with weather on file.',
      w.wet.days && w.dry.days ? 'Wet days averaged ' + F.num(Math.round(w.wet.avg)) + ' rounds against ' + F.num(Math.round(w.dry.avg)) + ' on dry days' + (w.wet.due ? ', and ' + w.wet.nsRate + '% of groups due on wet days did not show.' : '.') : '',
      'Weather cannot be changed, but tee times freed by rain can be offered to the waitlist.']);
  }
  /** Fill by weekday and part of the day: players booked against the spots the sheet offers (four a tee time). */
  function bandFill(ctx) {
    return memoed(ctx, 'bandfill', function () {
      const st = teeSettings(), step = Math.max(5, +st.interval || 9), times = [];
      for (let m = toMin(st.first); m <= toMin(st.last); m += step) times.push(m);
      const cap = BANDS.map(function (b) { return times.filter(function (m) { return m >= b.from && m < b.to; }).length * 4; });
      const dates = {}, acc = {};
      all('teeTimes').forEach(function (t) {
        if (!t.date || t.date < ctx.from || t.date > ctx.to || t.date >= today()) return;
        dates[t.date] = 1;
        if (DEAD[t.status]) return;
        const k = wdOf(t.date) + '|' + bandOf(t.time); acc[k] = (acc[k] || 0) + (t.players || []).length;
      });
      const days = WD.map(function () { return []; }); Object.keys(dates).forEach(function (d) { days[wdOf(d)].push(d); });
      const out = [];
      WD.forEach(function (_, w) { BANDS.forEach(function (b, i) { if (!days[w].length || !cap[i]) return; const pl = acc[w + '|' + i] || 0; const plain = days[w].filter(function (d) { return !(Club.teeRules && Club.teeRules.isHoliday && Club.teeRules.isHoliday(d)); }).sort();
        out.push({ wd: w, band: i, days: days[w].length, last: plain.length ? plain[plain.length - 1] : days[w].slice().sort()[days[w].length - 1], players: pl, cap: cap[i], fill: Math.round(pl / (days[w].length * cap[i]) * 100), slots: times.filter(function (m) { return m >= b.from && m < b.to; }) }); }); });
      return out;
    });
  }
  function hhmm(m) { return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  function promoLine(kind) {
    const codes = all('promoCodes').filter(function (p) { return p && p.active && (p.appliesTo || []).indexOf(kind) >= 0; });
    if (!codes.length) return null;
    const used = function (p) { return (p.uses || []).filter(function (u) { return u && u.status !== 'void' && u.status !== 'refunded'; }); };
    const idle = codes.filter(function (p) { return !used(p).length; }), busy = codes.filter(function (p) { return used(p).length; });
    return { idle: idle, busy: busy, text: H.sents([idle.length ? 'The ' + H.joinAnd(idle.map(function (p) { return p.code; })) + ' ' + (idle.length === 1 ? 'code has' : 'codes have') + ' not been used since ' + (idle.length === 1 ? 'it' : 'they') + ' started.' : '',
      busy.map(function (p) { const u = used(p); return p.code + ' was used ' + u.length + ' ' + (u.length === 1 ? 'time' : 'times') + ', ' + money0(H.sum(u, function (x) { return x.discount; })) + ' in discounts.'; }).join(' ')]) };
  }
  function ideas(ctx) {
    const out = [], R = Club.teeRules, f = bandFill(ctx), minDays = ctx.days >= 21 ? 2 : 1, SEASON_WEEKS = seasonWeeks();
    /* A part of the day nobody played in this period is probably not offered (short autumn evenings), so it is left out. */
    const cand = f.filter(function (x) { return x.days >= minDays && x.players > 0; }).sort(function (a, b) { return a.fill - b.fill || b.cap - a.cap; })[0];
    if (cand && R) {
      const b = BANDS[cand.band], slot = cand.slots.filter(function (m) { return R.publicSlot(cand.last, hhmm(m)).ok; })[0], t = hhmm(slot != null ? slot : cand.slots[0]);
      const ps = R.publicSlot(cand.last, t), rate = R.greenFee(cand.last, t, 18), amt = 10 * rate;
      if (rate > 0) out.push({ title: 'Fill ' + WD_LONG[cand.wd].slice(0, -1) + ' ' + b.label.toLowerCase() + 's', text: WD_LONG[cand.wd].slice(0, -1) + ' ' + b.label.toLowerCase() + 's, ' + b.sub.charAt(0).toLowerCase() + b.sub.slice(1) + ', are ' + cand.fill + '% full on the tee sheet, ' + F.num(Math.round(cand.players / cand.days)) + ' players a day against ' + cand.cap + ' spots. Filling 10 more spots a week there with ' + (ps.ok ? 'public golfers at the ' + money0(rate) + ' ' + ps.label.toLowerCase().replace(' & ', ' and ') + ' rate' : 'members\' guests at the ' + money0(rate) + ' guest fee') + ' would add about ' + money0(amt) + ' a week. ' + (ps.ok ? 'An email to opted-in public golfers is a way to start.' : 'A members\' bring-a-guest offer for that time is a way to start.'),
        assume: 'Assumes 10 extra paying players a week at that time for the ' + SEASON_WEEKS + '-week golf season, at the published rate. Based on ' + plural(cand.days, WD_FULL[cand.wd]) + ' on the sheet in this period.', amount: amt, per: 'a week', year: amt * SEASON_WEEKS });
    }
    const d = demandData(ctx);
    if (d.lost.dollars > 0) {
      const ds = d.list.map(function (r) { return r.e.date; }).sort(), weeks = Math.max(1, H.spanDays(ds[0], ds[ds.length - 1]) / 7), wk = d.lost.dollars / weeks / 2;
      out.push({ title: 'Win back golfers turned away by full tee times', text: F.num(d.lost.players + d.memberLost) + ' golfers asked for full tee times in this period and were never placed, ' + F.num(d.lost.players) + ' of them public golfers worth about ' + money0(d.lost.dollars) + ' in green fees. Calling waitlisted golfers with the nearest open time' + (d.top[0] ? ', starting with ' + slotLabel(d.top[0], true) : '') + ', would win some of it back; half would be about ' + money0(wk) + ' a week.',
        assume: 'Assumes half of those public green fees could be booked at another time, at this period\'s rate of requests, over the ' + SEASON_WEEKS + '-week season. Members\' requests are not priced, since their golf is in dues.', amount: wk, per: 'a week', year: wk * SEASON_WEEKS });
    }
    const r = roundsData(ctx), fee = cartFee(), tdays = {}; r.tees.forEach(function (t) { tdays[t.date] = 1; });
    const nd = Object.keys(tdays).length;
    if (fee && r.played.walk >= 10 && nd) {
      const wk = r.played.walk / Math.max(1, nd / 7), amt = 0.1 * wk * fee;
      out.push({ title: 'Offer carts to walkers', text: pctTxt(r.played.walk, r.played.n) + ' of players walked, ' + F.num(r.played.walk) + ' of ' + F.num(r.played.n) + ' on the tee sheet. If 1 in 10 walkers rode instead, at the ' + money0(fee) + ' cart fee, that would add about ' + money0(amt) + ' a week. A cart offer at check-in on hot days or for the back nine is a simple start.',
        assume: 'Assumes 10% of walkers take a cart at the tee sheet\'s cart fee, at this period\'s number of walkers a week, for the ' + SEASON_WEEKS + '-week season.', amount: amt, per: 'a week', year: amt * SEASON_WEEKS });
    }
    const c = cancelData(ctx);
    if (c.noShows.length && R) {
      let payers = 0, lost = 0;
      c.noShows.forEach(function (t) { (t.players || []).forEach(function (p) { if (p && (p.type === 'guest' || p.type === 'public')) { payers++; lost += R.greenFee(t.date, t.time, t.holes || 18); } }); });
      const from = ctx.ix.first.tee && ctx.ix.first.tee > ctx.from ? ctx.ix.first.tee : ctx.from, weeks = Math.max(1, H.spanDays(from, ctx.to < today() ? ctx.to : today()) / 7), wk = lost / weeks;
      out.push({ title: 'Cut no-shows with a reminder', text: plural(c.noShows.length, 'booked group') + ' did not show in this period' + (payers ? ', including ' + plural(payers, 'paying guest or public golfer', 'paying guests or public golfers') + ' worth ' + money0(lost) + ' in green fees' : '') + '. A reminder the day before, and releasing no-show times to the waitlist, would refill some of those spots.',
        assume: payers ? 'Assumes the spots could have been refilled at the same green fees, at this period\'s rate, over the ' + SEASON_WEEKS + '-week season.' : 'No estimate: the no-shows were members, whose golf is in dues, though their spots could have gone to paying golfers.', amount: payers ? wk : null, per: 'a week', year: payers ? wk * SEASON_WEEKS : 0 });
    }
    const pr = promoLine('greenFee');
    if (pr) out.push({ title: pr.idle.length ? 'Promote or retire unused green fee codes' : 'Check the green fee codes', text: pr.text + ' ' + (pr.idle.length ? 'Mention them on the public booking page and in emails to opted-in golfers, or retire them.' : 'Compare the rounds they brought in with the discount given before renewing them.'),
      assume: 'No estimate: code use is too thin on file to measure what a code brings in.', amount: null, year: 0 });
    return out;
  }
  function about(ctx) {
    const u = utilData(ctx), T = targets(), rounds = timedRounds(ctx), c = cancelData(ctx), w = weatherData(ctx), out = [];
    out.push(H.marksText(ctx) + (u.ok ? ' Tee sheet use is the share of ' + u.cap + ' daily player slots (' + u.interval + ' minute intervals) filled, averaged over ' + u.days + ' days on the sheet.' : ''));
    out.push((T ? 'Pace targets are the tee sheet\'s settings: ' + dur(T[18]) + ' for 18 holes and ' + dur(T[9]) + ' for 9. ' : 'No pace target is on file, so rounds are not compared against one. ') + 'Round length runs from send-off to completion as recorded on the tee sheet, from ' + plural(rounds.length, 'timed round') + '. Slowest needs at least three rounds.');
    out.push(rateNote() + ' Requests are counted on the tee date asked for.');
    out.push('Cancellation rate is cancelled tee times out of all bookings dated in the period. No-show rate is groups marked as a no-show out of the groups due to play. Refilled means a golfer on the waitlist booked the same tee time after it was cancelled. ' + historyNote(c));
    out.push(wxFoot(w));
    const cov = H.coverage(ctx.ix.first.tee, ctx, 'Tee sheet'); if (cov) out.push(cov);
    return out;
  }
  function csv(ctx) {
    return [
      { id: 'rounds', title: 'Rounds played', rows: roundsCSV(ctx) },
      { id: 'util', title: 'Tee sheet use by weekday', rows: utilCSV(ctx) },
      { id: 'pace', title: 'Pace of play', rows: paceCSV(ctx) },
      { id: 'demand', title: 'Lost tee time demand', rows: demandCSV(ctx) },
      { id: 'cancel', title: 'Cancellations and no-shows', rows: cancelCSV(ctx) },
      { id: 'weather', title: 'Weather and rounds', rows: weatherCSV(ctx) }
    ];
  }
  function facts(ctx) {
    const u = utilData(ctx), T = targets(), a = paceAgg(timedRounds(ctx)), out = [];
    if (u.ok && u.best !== u.low) out.push({ text: WD_FULL[u.best] + ' is the fullest day on the tee sheet at ' + u.vals[u.best] + '% of slots. ' + WD_FULL[u.low] + ' has the most room at ' + u.vals[u.low] + '%.', where: 'Golf' });
    if (T && a.avg18 != null && a.n18 >= 3) { const over = Math.round(a.avg18 - T[18]); out.push({ text: over === 0 ? '18-hole rounds run on the ' + dur(T[18]) + ' target on average.' : '18-hole rounds run ' + Math.abs(over) + ' minutes ' + (over > 0 ? 'over' : 'under') + ' the ' + dur(T[18]) + ' target on average.', where: 'Golf' }); }
    return out;
  }
  function attention(ctx) {
    const d = demandData(ctx), c = cancelData(ctx), out = [];
    const lost = d.lost.players + d.memberLost;
    if (lost) out.push({ n: lost, text: plural(lost, 'golfer was', 'golfers were').replace(/^\S+ /, '') + ' turned away by full tee times and never placed', label: 'See requests', drill: 'demand', sec: 'golf' });
    if (c.noShows.length) out.push({ n: c.noShows.length, text: plural(c.noShows.length, 'group', 'groups').replace(/^\S+ /, '') + ' booked and did not show', label: 'See no-shows', drill: 'cancel', sec: 'golf' });
    return out;
  }
  Club.reports.addSection({
    id: 'golf', label: 'Golf', order: 50, collections: ['teeTimes', 'teeWaitlist', 'weatherLog'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, facts: facts, attention: attention, ideas: ideas,
    drills: {
      util: utilDrill,
      pace: function (ctx, arg) { const p = String(arg || '').split(':'); return paceDrill(ctx, p[0] === 'wd' ? { wd: +p[1] } : p[0] === 'band' ? { band: +p[1] } : null); },
      demand: function (ctx) { return demandDrill(ctx); },
      slot: function (ctx, key) { return demandDrill(ctx, key); },
      cancel: function (ctx, src) { return cancelDrill(ctx, src || null); },
      weather: weatherDrill
    },
    data: { rounds: roundsData, util: utilData, demand: demandData, cancel: cancelData, weather: weatherData, pace: function (ctx) { return paceAgg(timedRounds(ctx)); } }
  });
})();
