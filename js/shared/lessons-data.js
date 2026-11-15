/* Lessons data: the default rate card and the programs and lessons seeds.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/lessons.js, which reads these helpers from Club.shared.lessons. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  const DAY_START = 7 * 60, DAY_END = 19 * 60, SPAN = DAY_END - DAY_START;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TYPE_DUR = { 'Private lesson': 60, 'Playing lesson': 90, 'Club fitting': 60, 'Junior clinic': 60, 'Group clinic': 90 };
  const DEFAULT_RATES = {
    rates: { 'Private lesson': 95, 'Playing lesson': 140, 'Club fitting': 100, 'Junior clinic': 40, 'Group clinic': 50 },
    premium: { stf_2: 1.2, stf_3: 1.15, stf_4: 1, stf_5: 1 }
  };

  /* ---------------- Helpers ---------------- */
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function dayName(iso) { return DAYS[fmt.toDate(iso).getDay()]; }
  function alignTo(iso, day) { let d = iso; for (let i = 0; i < 7; i++) { if (dayName(d) === day) return d; d = Club.date.addDays(d, 1); } return iso; }
  function overlap(a1, d1, a2, d2) { return a1 < a2 + d2 && a2 < a1 + d1; }
  function rates() {
    const r = S.getObj('lessonRates', null) || {};
    return { rates: Object.assign({}, DEFAULT_RATES.rates, r.rates || {}), premium: Object.assign({}, DEFAULT_RATES.premium, r.premium || {}) };
  }
  function priceFor(type, proId, dur) {
    const r = rates(); const base = r.rates[type] != null && !isNaN(+r.rates[type]) ? +r.rates[type] : 150;   /* a $0 rate means free, not the default */ const prem = r.premium[proId] || 1;
    return Math.round(base * prem * dur / 60 / 5) * 5;
  }

  function programSessions(p) {
    const out = []; for (let k = 0; k < (+p.weeks || 0); k++) out.push(Club.date.addDays(p.startDate, k * 7)); return out;
  }

  /* ---------------- Seed ---------------- */
  if (S.getObj('lessonRates') === undefined) S.setObj('lessonRates', JSON.parse(JSON.stringify(DEFAULT_RATES)));

  S.seed('programs', function () {
    R.reseed(5120);
    const golfers = S.all('members').filter(function (m) { return m.tierId !== 'tier_social' && m.status === 'active'; }).map(function (m) { return m.id; });
    const pickN = function (n) { const pool = golfers.slice(); const out = []; while (out.length < n && pool.length) out.push(pool.splice(R.int(0, pool.length - 1), 1)[0]); return out; };
    return [
      { id: 'prg_junior', name: 'Junior Golf clinic', coach: 'stf_5', day: 'Saturday', time: '09:00', duration: 90, weeks: 10, startDate: alignTo(Club.date.fromToday(-31), 'Saturday'), capacity: 16, price: 180, level: 'Ages 8 to 14', description: 'Part of the Junior Golf program: fundamentals, etiquette and on-course play, finishing with a family scramble.', enrolled: pickN(13) },
      { id: 'prg_ladies', name: 'Ladies\u2019 clinic', coach: 'stf_4', day: 'Tuesday', time: '10:00', duration: 60, weeks: 8, startDate: alignTo(Club.date.fromToday(-16), 'Tuesday'), capacity: 12, price: 160, level: 'All abilities', description: 'A relaxed weekly session rotating through putting, chipping, bunkers and the full swing. Everyone welcome.', enrolled: pickN(12) },
      { id: 'prg_short', name: 'Short game school', coach: 'stf_3', day: 'Thursday', time: '16:00', duration: 90, weeks: 6, startDate: alignTo(Club.date.fromToday(-9), 'Thursday'), capacity: 8, price: 220, level: 'Handicap 18 and under', description: 'Scoring from 100 yards in at the short game practice facility: wedge distance control, bunker play and reading small, sloping greens.', enrolled: pickN(6) },
      { id: 'prg_winter', name: 'Simulator winter lessons', coach: 'stf_4', day: 'Wednesday', time: '17:00', duration: 60, weeks: 6, startDate: alignTo(Club.date.fromToday(12), 'Wednesday'), capacity: 10, price: 240, level: 'All abilities', description: 'Keep your swing in shape over the Winnipeg winter with SIM teaching technology and video review after every session.', enrolled: pickN(4) },
      { id: 'prg_elite', name: 'Adult beginner clinic', coach: 'stf_5', day: 'Sunday', time: '14:00', duration: 90, weeks: 8, startDate: alignTo(Club.date.fromToday(-30), 'Sunday'), capacity: 10, price: 150, level: 'New to golf', description: 'A friendly start to the game: grip, set-up, short game basics and etiquette, then a few holes on the course together.', enrolled: pickN(7) }
    ];
  });

  S.seed('lessons', function () {
    R.reseed(5121);
    const golfers = S.all('members').filter(function (m) { return m.tierId !== 'tier_social' && m.status === 'active'; }).map(function (m) { return m.id; });
    if (!golfers.length) return [];
    const progs = S.all('programs');
    const off = { stf_2: [1, 2], stf_3: [1], stf_4: [3], stf_5: [4] };
    const notesPool = ['Working on takeaway and wrist set', 'Bring 7-iron and driver', 'Follow-up from last month', 'Gift voucher from spouse', 'Getting ready for the Club Championship', 'Video review on the simulator', 'New to the game'];
    const today = Club.date.today(); const now = nowMin();
    const typeFor = function (proId) {
      const r = R.rand();
      if (proId === 'stf_5' && r < 0.18) return R.chance(0.5) ? 'Junior clinic' : 'Club fitting';
      if (r < 0.62) return 'Private lesson';
      if (r < 0.74) return 'Playing lesson';
      if (r < 0.82) return 'Club fitting';
      if (r < 0.9) return 'Junior clinic';
      return 'Group clinic';
    };
    const out = [];
    ['stf_2', 'stf_3', 'stf_4', 'stf_5'].forEach(function (proId) {
      for (let d = -21; d <= 21; d++) {
        const date = Club.date.fromToday(d); const dow = fmt.toDate(date).getDay();
        if ((off[proId] || []).indexOf(dow) >= 0) continue;
        const weekend = dow === 0 || dow === 6;
        let n = proId === 'stf_2' ? R.int(1, 3) : R.int(2, 5) + (weekend ? 1 : 0);
        const sessions = progs.filter(function (p) { return p.coach === proId && programSessions(p).indexOf(date) >= 0; });
        let cur = DAY_START + 30 + R.int(0, 4) * 30;
        let i = 0;
        while (n > 0 && i < 20) {
          i++;
          const type = typeFor(proId);
          const dur = type === 'Private lesson' ? R.pick([30, 45, 60, 60, 60, 90]) : TYPE_DUR[type];
          const clash = sessions.find(function (p) { return overlap(cur, dur, toMin(p.time), p.duration || 60); });
          if (clash) { cur = toMin(clash.time) + (clash.duration || 60) + 15; continue; }
          if (cur + dur > 18 * 60 + 30) break;
          const end = cur + dur;
          let status = 'scheduled';
          if (date < today || (date === today && end <= now)) status = R.chance(0.93) ? 'completed' : 'cancelled';
          else if (R.chance(0.04)) status = 'cancelled';
          out.push({
            id: 'les_' + date.replace(/-/g, '') + '_' + proId + '_' + i, date: date, time: toHM(cur), duration: dur, proId: proId,
            memberId: R.pick(golfers), type: type, price: priceFor(type, proId, dur), status: status,
            notes: R.chance(0.18) ? R.pick(notesPool) : '', charged: status === 'completed'
          });
          n--;
          cur = end + R.int(0, 4) * 15;
          if (cur > 11 * 60 + 45 && cur < 13 * 60 && R.chance(0.6)) cur = 13 * 60;
        }
      }
    });
    return out;
  });

  /* For the staff page (js/modules/lessons.js) */
  Club.shared = Club.shared || {};
  Club.shared.lessons = { DAY_START, DAY_END, SPAN, DAYS, TYPE_DUR, toMin, toHM, nowMin, dayName, alignTo, overlap, rates, priceFor, programSessions };
})();
