/* Events data: the events, tournaments and leagues seeds, and Club.league (standings and scoring for the members' portal).
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/events.js, which reads these helpers from Club.shared.events. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  const GOLF_TYPES = ['Tournament', 'Member-Guest', 'League'];
  /* PLACEHOLDER: St. Boniface does not publish course rating or slope. 73.1 / 135 are demo values for the WHS
     course handicap maths; replace with the club's official Green tee rating and slope. */
  const COURSE = { rating: 73.1, slope: 135, tee: 'green', teeLabel: 'Green tees' };
  const DEFAULT_PARS = [4, 4, 4, 4, 3, 4, 4, 4, 5, 4, 5, 3, 5, 3, 4, 4, 5, 3];
  const DEFAULT_HCP = [8, 4, 10, 12, 14, 18, 16, 2, 6, 3, 17, 5, 7, 9, 13, 11, 1, 15];
  function today() { return Club.date.today(); }
  function memberName(id) { const m = Club.members.get(id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function isGolfer(m) { return !!m && m.tierId !== 'tier_social'; }

  /* ---------------- Course and scoring helpers ---------------- */
  function holeList() {
    const hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    if (hs.length === 18) return hs;
    return DEFAULT_PARS.map(function (p, i) { return { id: 'hole_' + (i + 1), number: i + 1, name: 'Hole ' + (i + 1), par: p, handicap: DEFAULT_HCP[i], yards: { black: 0, green: 0, silver: 0 } }; });
  }
  function parTotal(hs) { return (hs || holeList()).reduce(function (a, h) { return a + h.par; }, 0); }
  /** Course handicap per WHS: index x slope / 113 + (course rating - par), rounded to the nearest whole stroke. */
  function courseHcp(idx, hs) { if (idx == null || isNaN(idx)) return 0; return Math.round(idx * COURSE.slope / 113 + (COURSE.rating - parTotal(hs))); }
  /** Strokes received on a hole of given stroke index. Plus handicaps give strokes back from the easiest holes. */
  function strokesOn(ch, si) {
    if (ch >= 0) return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0);
    const back = -ch; return -(Math.floor(back / 18) + (si > 18 - back % 18 ? 1 : 0));
  }

  /* ---------------- Seed data ---------------- */
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R.int(0, i); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function memberPool(type) {
    let ms = S.all('members').filter(function (m) { return m.status === 'active'; });
    if (GOLF_TYPES.indexOf(type) >= 0) ms = ms.filter(isGolfer);
    if (type === 'Ladies') ms = ms.filter(function (m) { return +m.memberNo % 2 === 0; });
    let ids = ms.map(function (m) { return m.id; });
    if (!ids.length) { ids = []; for (let i = 1001; i <= 1064; i++) ids.push('mem_' + i); }
    return ids;
  }

  const EVENT_SEED = [
    [-29, 'Fall Two-Person Scramble', 'Tournament', '08:00', '14:00', 'The Course', 48, 65, 0.92, 'none', 'A two-person scramble over eighteen holes, followed by lunch and prizes in the Gallery Taphouse & Grill. The Golf Shop can help you find a partner.'],
    [-25, 'Friday Night Pizza & Member Play', 'Social', '16:00', '21:00', 'Gallery Taphouse & Grill', 80, 0, 1.0, 'family', 'Friday member play on the course, then our famous Friday night pizza menu and member beverage pricing upstairs in The Gallery. No sign-up fee: food and drinks go on your account.'],
    [-21, 'Junior Golf Day', 'Junior', '09:00', '13:00', 'Short game practice facility', 30, 25, 0.8, 'kids', 'A morning of short game stations, putting games and on-course etiquette for juniors aged 7 to 16, led by our CPGA professional staff. Lunch provided.'],
    [-17, "Ladies' Day", 'Ladies', '08:30', '15:00', 'The Course', 40, 55, 0.9, 'pair', 'A friendly day for lady members and their guests: shotgun start, individual Stableford, then lunch and prizes on the Patio.'],
    [-13, "Members' League Night", 'League', '16:30', '20:30', 'The Course', 60, 20, 0.5, 'none', "Nine holes of members' league play in the evening, with weekly standings and a casual supper in the Taphouse Bar. Cancelled due to forecast storms.", 'cancelled'],
    [-9, "Members' Fall Classic", 'Tournament', '07:30', '14:30', 'The Course', 24, 45, 0.85, 'none', 'Eighteen holes of stroke play with full handicap allowance. Prize-giving and refreshments to follow in the Taphouse Bar.'],
    [-4, 'Fall Feature Night', 'Dining', '19:00', '22:00', 'Gallery Taphouse & Grill', 70, 40, 0.86, 'family', 'A three-course fall feature menu from the Gallery kitchen, local beers on tap and live acoustic music overlooking the 18th hole.'],
    [0, 'Club Championship, Final Round', 'Tournament', '08:00', '15:00', 'The Course', 32, 60, 0.5, 'none', 'The final round of the Club Championship. Spectators are welcome around the 18th green from early afternoon, and The Gallery has the best seat in the house. Presentation at 4:30 PM.'],
    [3, 'Corporate Golf Tournament', 'Corporate', '07:30', '15:00', 'The Course', 72, 0, 0, 'none', 'A shotgun start for a corporate group of 72, arranged through Tournament & Corporate Services. Golf, lunch and an awards dinner in the Banquet Hall. The course is closed to member play until mid-afternoon.'],
    [6, 'New Member Mixer', 'Social', '16:00', '19:30', 'Taphouse Bar', 80, 0, 0.55, 'family', 'Meet fellow new members and the club staff over appetizers and a local tap feature, with a friendly putting contest for anyone keen.'],
    [9, 'Junior Golf Day', 'Junior', '09:00', '12:30', 'Short game practice facility', 30, 25, 0.45, 'kids', 'Short game stations, a closest-to-the-pin contest and a family putting challenge to close the morning.'],
    [11, 'Blackwood Wedding Reception', 'Private', '15:00', '23:30', 'Banquet Hall', 220, 0, 0, 'private', 'Private wedding reception with an all-inclusive package: dinner, dancing and complimentary parking for guests. Arranged with the special events team.'],
    [13, 'Member-Guest Tournament', 'Member-Guest', '07:30', '18:00', 'The Course', 48, 120, 0.5, 'one', 'A day of four-ball competition for members and their guests. Includes breakfast, lunch, a gift from the Golf Shop and the awards dinner.'],
    [19, 'Season-End Banquet', 'Dining', '18:30', '22:00', 'Banquet Hall', 160, 55, 0.62, 'pair', "Close out the golf season together: dinner, members' league awards and the presentation of this year's club champions."],
    [26, "Ladies' Holiday Lunch", 'Ladies', '12:00', '15:00', 'Gallery Taphouse & Grill', 60, 35, 0.4, 'pair', "A seasonal lunch in The Gallery with a gift exchange and a first look at next season's ladies' clinics."],
    [33, 'Grey Cup Party', 'Social', '16:00', '22:00', 'Taphouse Bar', 120, 15, 0.45, 'family', 'Watch the big game together with wings, nachos and local beer on tap. Your ticket includes a snack platter for the table.'],
    [47, "Annual Members' Meeting", 'Social', '18:00', '20:30', 'Banquet Hall', 200, 0, 0.25, 'none', 'The Board presents the annual report and election results. Coffee and dessert to follow.'],
    [54, 'Holiday Party', 'Social', '19:00', '23:30', 'Banquet Hall', 220, 65, 0.36, 'pair', 'Dinner and dancing with members, family and friends to celebrate the holidays. Dress is festive, not formal.'],
    [58, "Children's Holiday Party", 'Junior', '14:00', '17:00', 'Banquet Hall', 80, 15, 0, 'kids', 'Cookie decorating, crafts and a visit from a special guest from the North Pole.', 'draft']
  ];

  S.seed('events', function () {
    R.reseed(3030);
    return EVENT_SEED.map(function (s, i) {
      const date = Club.date.fromToday(s[0]);
      const ev = { id: 'evt_' + String(i + 1).padStart(2, '0'), title: s[1], type: s[2], date: date, start: s[3], end: s[4], venue: s[5], capacity: s[6], price: s[7], description: s[10], status: s[11] || (s[0] < 0 ? 'completed' : 'published'), registrations: [] };
      const target = Math.floor(s[6] * s[8]);
      const pool = shuffle(memberPool(s[2]));
      let taken = 0;
      if (s[9] === 'private') { ev.registrations.push({ memberId: 'mem_1027', guests: Math.round(s[6] * 0.75) - 1, registeredAt: Club.date.fromToday(Math.min(-3, s[0] - 20)) }); }
      for (let k = 0; k < pool.length && taken < target; k++) {
        let g = 0;
        if (s[9] === 'one') g = 1;
        else if (s[9] === 'pair') g = R.chance(0.6) ? 1 : 0;
        else if (s[9] === 'family') g = R.pick([0, 1, 1, 1, 2, 3]);
        else if (s[9] === 'kids') g = R.pick([1, 1, 2]);
        if (taken + 1 + g > target) { if (taken + 1 > target) break; g = 0; }
        const lead = R.int(1, 30);
        ev.registrations.push({ memberId: pool[k], guests: g, registeredAt: Club.date.fromToday(Math.min(0, s[0]) - lead) });
        taken += 1 + g;
      }
      return ev;
    });
  });

  function genScores(handicap, upto, hs) {
    const ch = courseHcp(handicap, hs); const out = [];
    for (let i = 0; i < 18; i++) {
      if (i >= upto) { out.push(null); continue; }
      const h = hs[i]; const r = R.rand();
      const better = handicap < 6 ? 0.08 : 0;
      const noise = r < 0.02 ? -2 + (h.par === 5 ? 0 : 1) : r < 0.14 + better ? -1 : r < 0.64 ? 0 : r < 0.9 ? 1 : 2;
      out.push(Math.max(1, Math.min(15, h.par + Math.max(0, strokesOn(ch, h.handicap)) + noise)));
    }
    return out;
  }
  S.seed('tournaments', function () {
    R.reseed(3131);
    const hs = holeList();
    const evs = S.all('events');
    const fieldFrom = function (evId, n) {
      const ev = evs.find(function (e) { return e.id === evId; });
      let ids = ev ? ev.registrations.map(function (r) { return r.memberId; }) : [];
      ids = ids.filter(function (id) { return isGolfer(Club.members.get(id)); });
      if (ids.length < n) ids = ids.concat(shuffle(memberPool('Tournament')).filter(function (id) { return ids.indexOf(id) < 0; })).slice(0, n);
      return ids.slice(0, n).map(function (id) { const m = Club.members.get(id); return { memberId: id, handicap: m && m.handicap != null ? m.handicap : 18, scores: [] }; });
    };
    const pres = fieldFrom('evt_06', 20);
    pres.forEach(function (p) { p.scores = genScores(p.handicap, 18, hs); });
    const champ = fieldFrom('evt_08', 16);
    const thru = [18, 18, 18, 18, 16, 15, 14, 13, 12, 10, 9, 7, 5, 4, 0, 0];
    champ.forEach(function (p, i) { p.scores = genScores(p.handicap, thru[i], hs); });
    const mg = fieldFrom('evt_13', 12);
    mg.forEach(function (p) { p.scores = new Array(18).fill(null); });
    return [
      { id: 'trn_01', eventId: 'evt_06', name: "Members' Fall Classic", format: 'Stroke play', date: Club.date.fromToday(-9), status: 'final', field: pres },
      { id: 'trn_02', eventId: 'evt_08', name: 'Club Championship', format: 'Stroke play', date: Club.date.today(), status: 'live', field: champ },
      { id: 'trn_03', eventId: 'evt_13', name: 'Member-Guest Tournament', format: 'Four-ball', date: Club.date.fromToday(13), status: 'upcoming', field: mg }
    ];
  });

  /* ---------------- Members' league ----------------
     Collection: leagues { id, name, night, startTime, season: { start, end }, format: 'Stableford'|'Stroke play',
     holes: 9|18, allowance (percent of course handicap), members: [memberId], status: 'upcoming'|'active'|'complete',
     weeks: [{ date, nine: 'front'|'back'|'all', teeBlockId|null, cancelled, note,
               results: [{ memberId, gross, net, strokes, handicap, points }], absent: [memberId] }] }.
     Points come from the gross total for the nine (or eighteen) played: Stableford is two points a hole, plus par and
     strokes received (course handicap x allowance, spread by stroke index from the holes collection), minus gross.
     Stroke play leagues rank each night by net and award placing points. Standings are always computed. */
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const PLACE_POINTS = [15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
  const PLAYED_POINTS = 2;

  function canGolf(m) {
    if (!m || m.tierId === 'tier_social') return false;
    try { return Club.teeRules ? Club.teeRules.tierRules(m).golf !== false : true; } catch (e) { return true; }
  }
  function firstOnOrAfter(iso, dow) { let d = iso; for (let i = 0; i < 7 && fmt.toDate(d).getDay() !== dow; i++) d = Club.date.addDays(d, 1); return d; }
  function lastOnOrBefore(iso, dow) { let d = iso; for (let i = 0; i < 7 && fmt.toDate(d).getDay() !== dow; i++) d = Club.date.addDays(d, -1); return d; }
  function nightDates(night, start, end) {
    const dow = WEEKDAYS.indexOf(night); const out = [];
    if (dow < 0 || !start || !end || end < start) return out;
    for (let d = firstOnOrAfter(start, dow); d <= end && out.length < 40; d = Club.date.addDays(d, 7)) out.push(d);
    return out;
  }
  function nineFor(holes, i) { return +holes === 18 ? 'all' : (i % 2 ? 'back' : 'front'); }
  function nineLabel(n) { return n === 'back' ? 'Back nine' : n === 'front' ? 'Front nine' : 'Eighteen holes'; }
  function nineHoles(n, hs) { return n === 'back' ? hs.slice(9, 18) : n === 'front' ? hs.slice(0, 9) : hs; }
  function leagueStatus(lg) {
    const t = today(); const s = lg.season || {};
    if (s.end && t > s.end) return 'complete';
    if (s.start && t < s.start) return 'upcoming';
    return 'active';
  }
  function statusLabel(s) { return { upcoming: 'Upcoming', active: 'In season', complete: 'Season complete' }[s] || s; }
  function isPlayed(w) { return !!w && !w.cancelled && (w.results || []).length > 0; }
  function playedIdx(lg) { const o = []; (lg.weeks || []).forEach(function (w, i) { if (isPlayed(w)) o.push(i); }); return o; }
  function leagueBlock(date) {
    return S.all('teeBlocks').find(function (b) { return b.date === date && (b.kind === 'league' || /league/i.test(b.reason || '')); }) || null;
  }
  function weekBlock(w) { const b = w.teeBlockId ? S.find('teeBlocks', w.teeBlockId) : null; return b || leagueBlock(w.date); }

  /** Score one gross total for a member on a given league night. */
  function leagueScore(lg, nine, memberId, gross, index) {
    const hs = holeList(); const holes = nineHoles(nine, hs); const par = parTotal(holes);
    const m = Club.members.get(memberId);
    const idx = index != null ? index : (m && m.handicap != null ? m.handicap : 18);
    const ch = Math.round(courseHcp(idx, hs) * (+lg.allowance || 100) / 100);
    const strokes = holes.reduce(function (a, h) { return a + strokesOn(ch, h.handicap); }, 0);
    const out = { memberId: memberId, gross: gross, net: gross - strokes, strokes: strokes, handicap: idx, points: null, par: par };
    if (lg.format !== 'Stroke play') out.points = Math.max(0, 2 * holes.length + par + strokes - gross);
    return out;
  }
  /** Stroke play: placing points by net (ties share the higher place). Stableford: points already set. */
  function awardPoints(lg, results) {
    if (lg.format !== 'Stroke play') return results;
    const sorted = results.slice().sort(function (a, b) { return a.net - b.net; });
    results.forEach(function (r) {
      const place = sorted.findIndex(function (x) { return x.net === r.net; });
      r.points = place < PLACE_POINTS.length ? PLACE_POINTS[place] : PLAYED_POINTS;
    });
    return results;
  }
  function weekRank(w, lg) {
    const key = function (r) { return lg.format === 'Stroke play' ? r.net : -r.points; };
    const res = (w.results || []).slice().sort(function (a, b) { return key(a) - key(b) || a.gross - b.gross; });
    return res.map(function (r) { const k = key(r); const first = res.findIndex(function (x) { return key(x) === k; }); return Object.assign({ place: first + 1, tied: res.filter(function (x) { return key(x) === k; }).length > 1 }, r); });
  }
  function weekWinners(w, lg) { return weekRank(w, lg).filter(function (r) { return r.place === 1; }); }

  /** Standings through week index `upto` (inclusive). Rows sorted with positions and movement. */
  function standings(lg, upto) {
    const played = playedIdx(lg);
    if (upto == null) upto = played.length ? played[played.length - 1] : -1;
    const calc = function (limit) {
      const rows = (lg.members || []).map(function (id) { return { memberId: id, name: memberName(id), total: 0, rounds: 0, best: null, bestDate: null, nets: 0, absent: 0, weeks: {} }; });
      const byId = {}; rows.forEach(function (r) { byId[r.memberId] = r; });
      (lg.weeks || []).forEach(function (w, i) {
        if (i > limit || !isPlayed(w)) return;
        (w.results || []).forEach(function (res) {
          const r = byId[res.memberId]; if (!r) return;
          r.total += +res.points || 0; r.rounds++; r.nets += +res.net || 0; r.weeks[w.date] = res;
          if (r.best == null || res.points > r.best) { r.best = res.points; r.bestDate = w.date; }
        });
        (w.absent || []).forEach(function (id) { if (byId[id]) byId[id].absent++; });
      });
      rows.forEach(function (r) { r.avg = r.rounds ? r.total / r.rounds : null; r.avgNet = r.rounds ? r.nets / r.rounds : null; });
      rows.sort(function (a, b) { return b.total - a.total || (b.best || 0) - (a.best || 0) || a.rounds - b.rounds || a.name.localeCompare(b.name); });
      rows.forEach(function (r) {
        const first = rows.findIndex(function (x) { return x.total === r.total; });
        r.rank = first + 1; r.pos = (rows.filter(function (x) { return x.total === r.total; }).length > 1 ? 'T' : '') + (first + 1);
      });
      return rows;
    };
    const rows = calc(upto);
    const k = played.indexOf(upto);
    const prevIdx = k > 0 ? played[k - 1] : (k < 0 ? played.filter(function (i) { return i < upto; }).pop() : null);
    const prev = prevIdx != null ? calc(prevIdx) : null;
    rows.forEach(function (r) {
      const p = prev ? prev.find(function (x) { return x.memberId === r.memberId; }) : null;
      r.move = !prev ? null : (!p || !p.rounds) ? (r.rounds ? 'new' : null) : p.rank - r.rank;
    });
    return { rows: rows, upto: upto, played: played, prevIdx: prevIdx };
  }

  /* Seed: one current-season league, May to September. */
  S.seed('leagues', function () {
    R.reseed(3232);
    const hs = holeList();
    const year = +today().slice(0, 4);
    const start = firstOnOrAfter(year + '-05-01', 3), end = lastOnOrBefore(year + '-09-30', 3);
    const roster = shuffle(S.all('members').filter(function (m) { return m.status === 'active' && canGolf(m); }).map(function (m) { return m.id; })).slice(0, 24);
    const form = {}; roster.forEach(function (id) { form[id] = 0.62 + R.rand() * 0.33; });
    const lg = { id: 'lg_' + year, name: "Wednesday Members' League", night: 'Wednesday', startTime: '16:30', season: { start: start, end: end }, format: 'Stableford', holes: 9, allowance: 95, members: roster, weeks: [] };
    const t0 = today(); let rainout = null;
    nightDates('Wednesday', start, end).forEach(function (d, i) {
      const b = leagueBlock(d);
      const w = { date: d, nine: nineFor(9, i), teeBlockId: b ? b.id : null, cancelled: false, note: '', results: [], absent: [] };
      if (d < t0) {
        if (rainout == null && i >= 6 && R.chance(0.35)) { rainout = i; w.cancelled = true; w.note = 'Rained out'; }
        else {
          roster.forEach(function (id) {
            const m = Club.members.get(id);
            if (!R.chance(form[id])) { w.absent.push(id); return; }
            const idx = m && m.handicap != null ? m.handicap : 18;
            const sc = genScores(idx, 18, hs); const holes = w.nine === 'back' ? sc.slice(9) : sc.slice(0, 9);
            const x = leagueScore(lg, w.nine, id, holes.reduce(function (a, s) { return a + s; }, 0), idx); delete x.par;
            w.results.push(x);
          });
          awardPoints(lg, w.results);
        }
      }
      lg.weeks.push(w);
    });
    lg.status = leagueStatus(lg);
    return [lg];
  });

  /** Standings and scoring for the members' portal (js/portal/events.js, js/portal/friends.js) and the staff League tab. */
  Club.league = {
    status: leagueStatus, statusLabel: statusLabel, standings: standings, weekRank: weekRank, weekWinners: weekWinners,
    isPlayed: isPlayed, nineLabel: nineLabel, weekBlock: weekBlock, canGolf: canGolf,
    current: function () { return pickLeague(null); }
  };
  function leaguesSorted() { return S.all('leagues').slice().sort(function (a, b) { return ((b.season || {}).start || '').localeCompare((a.season || {}).start || ''); }); }
  /* The league picked by id, else the active one, else the next upcoming, else the newest. */
  function pickLeague(id) {
    const ls = leaguesSorted(); if (!ls.length) return null;
    const pick = id && ls.find(function (l) { return l.id === id; });
    if (pick) return pick;
    return ls.find(function (l) { return leagueStatus(l) === 'active'; }) || ls.find(function (l) { return leagueStatus(l) === 'upcoming'; }) || ls[0];
  }

  /* For the staff page (js/modules/events.js) */
  Club.shared = Club.shared || {};
  Club.shared.events = { GOLF_TYPES, COURSE, today, memberName, isGolfer, holeList, parTotal, courseHcp, strokesOn, WEEKDAYS, PLACE_POINTS, PLAYED_POINTS, canGolf, nightDates, nineFor, nineLabel, nineHoles, leagueStatus, statusLabel, isPlayed, playedIdx, leagueBlock, weekBlock, leagueScore, awardPoints, weekRank, weekWinners, standings, leaguesSorted, pickLeague };
})();
