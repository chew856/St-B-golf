/* Club.teeRules: who may book which tee time, how far ahead, and what public golfers and guests pay.
   One source of truth for the staff tee sheet, the members' portal and the public booking page.
   Times are 'HH:MM' strings, dates are ISO 'YYYY-MM-DD'. Rates are St. Boniface's published green fees (tax incl.). */
(function () {
  window.Club = window.Club || {};

  const PUBLIC_ADVANCE_DAYS = 7;
  /* 2025 Membership Handbook, Golf Course Policies. Pace of play: no more than 13 minutes a hole. */
  const PACE_PER_HOLE = 13;
  const PACE = { 18: 18 * PACE_PER_HOLE, 9: 9 * PACE_PER_HOLE };   /* 234 min (3h 54m) and 117 min (1h 57m) */
  /* Fivesome Policy: groups of five at the Pro Shop's discretion, at most 2 fivesomes an hour, never six. */
  const MAX_GROUP = 5, STANDARD_GROUP = 4, MAX_FIVESOMES_PER_HOUR = 2;
  const FRIDAY_PUBLIC = 'Fridays are for members all day. Public golfers can play on a Friday only as a member\u2019s guest.';
  const FRIDAY_EVENTS = 'No tournaments or outside golf events are booked on a Friday. Fridays are for members.';
  /* Published public green fees. Twilight is not priced on the website: placeholder. */
  const RATES = { weekday: 66, twilight: 45, weekend: 76 };
  const NINE_HOLE_SHARE = 0.6;

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function inWindows(time, windows) { const m = toMin(time); return windows.some(function (w) { return m >= toMin(w[0]) && m < toMin(w[1]); }); }
  function dateObj(iso) { return Club.fmt.toDate(iso); }
  function daysBetween(fromIso, toIso) { return Math.round((dateObj(toIso) - dateObj(fromIso)) / 86400000); }
  function nthWeekday(year, month, weekday, n) { const d = new Date(year, month, 1, 12); let c = 0; while (true) { if (d.getDay() === weekday && ++c === n) return Club.store.iso(d); d.setDate(d.getDate() + 1); } }
  function mondayBefore(year, month, day) { const d = new Date(year, month, day, 12); d.setDate(d.getDate() - 1); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return Club.store.iso(d); }

  /** Manitoba statutory holidays plus Civic Holiday (golf "holiday" pricing applies). */
  const holidayCache = {};
  function holidays(year) {
    if (holidayCache[year]) return holidayCache[year];
    const pad = function (m, d) { return year + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
    const list = {};
    list[pad(1, 1)] = "New Year's Day";
    list[nthWeekday(year, 1, 1, 3)] = 'Louis Riel Day';
    list[mondayBefore(year, 4, 25)] = 'Victoria Day';
    list[pad(7, 1)] = 'Canada Day';
    list[nthWeekday(year, 7, 1, 1)] = 'Terry Fox Day';
    list[nthWeekday(year, 8, 1, 1)] = 'Labour Day';
    list[pad(9, 30)] = 'National Day for Truth and Reconciliation';
    list[nthWeekday(year, 9, 1, 2)] = 'Thanksgiving';
    list[pad(11, 11)] = 'Remembrance Day';
    list[pad(12, 25)] = 'Christmas Day';
    list[pad(12, 26)] = 'Boxing Day';
    return (holidayCache[year] = list);
  }
  function holidayName(iso) { return holidays(+iso.slice(0, 4))[iso] || null; }
  /** Weekend & holiday days use the weekend play windows and rates. */
  function isWeekendOrHoliday(iso) { const d = dateObj(iso).getDay(); return d === 0 || d === 6 || !!holidayName(iso); }

  function tierOf(member) { return member ? Club.store.find('membershipTiers', member.tierId) : null; }
  function isFriday(iso) { return dateObj(iso).getDay() === 5; }
  /** Social membership golf vouchers: a tee time uses one when a player entry carries voucher: true. Used = such entries
      on tee times in the same calendar year (the season sits inside one year), cancelled bookings left out. */
  function vouchersFor(member, iso) {
    const t = tierOf(member); const total = t && +t.golfVouchers > 0 ? +t.golfVouchers : 0;
    if (!total) return null;
    const year = String(iso || Club.date.today()).slice(0, 4);
    const used = Club.store.all('teeTimes').filter(function (x) {
      return String(x.date || '').slice(0, 4) === year && x.status !== 'cancelled' && (x.players || []).some(function (p) { return p && p.memberId === member.id && p.voucher; });
    }).length;
    return { total: total, used: used, left: Math.max(0, total - used), year: +year };
  }
  const rules = {
    PUBLIC_ADVANCE_DAYS: PUBLIC_ADVANCE_DAYS,
    RATES: RATES,
    PACE: PACE,
    PACE_PER_HOLE: PACE_PER_HOLE,
    MAX_GROUP: MAX_GROUP,
    STANDARD_GROUP: STANDARD_GROUP,
    MAX_FIVESOMES_PER_HOUR: MAX_FIVESOMES_PER_HOUR,
    FRIDAY_EVENTS: FRIDAY_EVENTS,
    isFriday: isFriday,
    isHoliday: function (iso) { return !!holidayName(iso); },
    holidayName: holidayName,
    isWeekendOrHoliday: isWeekendOrHoliday,

    /** { advanceDays, windows, tierName } for a member (Eagle: windows null = any time). */
    tierRules: function (member) {
      const t = tierOf(member);
      const vouchers = !!(t && +t.golfVouchers > 0);
      return { advanceDays: t && t.advanceDays != null ? t.advanceDays : (vouchers ? PUBLIC_ADVANCE_DAYS : 14), windows: t ? t.playWindows || null : null, tierName: t ? t.name : 'Member', golf: t ? t.golf !== false || vouchers : true, vouchers: vouchers };
    },

    /** Social membership golf vouchers for this member in the year of iso: { total, used, left, year }, or null. */
    vouchers: vouchersFor,

    /** Can this member tee off at this time under their category? { ok, reason } */
    memberCanPlay: function (member, iso, time) {
      const r = rules.tierRules(member);
      if (!r.golf) return { ok: false, reason: r.tierName + ' membership does not include golf.' };
      if (r.vouchers) {
        const v = vouchersFor(member, iso);
        if (!v || v.left <= 0) return { ok: false, voucher: true, reason: r.tierName + ' members golf with vouchers, and all ' + (v ? v.total : 0) + ' for ' + (v ? v.year : iso.slice(0, 4)) + ' are used.' };
        return { ok: true, voucher: true, reason: '' };
      }
      if (!r.windows) return { ok: true, reason: '' };
      const key = isWeekendOrHoliday(iso) ? 'weekend' : 'weekday';
      const w = r.windows[key] || [];
      if (inWindows(time, w)) return { ok: true, reason: '' };
      return { ok: false, reason: r.tierName + ' members play ' + rules.describeWindows(w) + ' on ' + (key === 'weekend' ? 'weekends and holidays' : 'weekdays') + '.' };
    },

    /** Human description of windows, e.g. "before 7:30 AM, 10:30 AM to 4:00 PM and after 5:30 PM". */
    describeWindows: function (windows) {
      if (!windows || !windows.length) return 'at no times';
      const parts = windows.map(function (w) {
        if (w[0] === '00:00') return 'before ' + Club.fmt.time(w[1]);
        if (w[1] === '23:59') return 'after ' + Club.fmt.time(w[0]);
        return Club.fmt.time(w[0]) + ' to ' + Club.fmt.time(w[1]);
      });
      return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    },

    /** Is the booking window open for this date? kind 'member' | 'public'. { ok, reason, opensOn, advanceDays } */
    bookingOpen: function (kind, member, iso, todayIso) {
      const today = todayIso || Club.date.today();
      const ahead = daysBetween(today, iso);
      const adv = kind === 'public' ? PUBLIC_ADVANCE_DAYS : rules.tierRules(member).advanceDays;
      if (ahead < 0) return { ok: false, reason: 'That date has passed.', opensOn: null, advanceDays: adv };
      if (ahead > adv) {
        const opens = Club.date.addDays(iso, -adv);
        return { ok: false, reason: (kind === 'public' ? 'Public tee times open ' : rules.tierRules(member).tierName + ' members can book ') + adv + ' days ahead. This date opens on ' + Club.fmt.dateShort(opens) + '.', opensOn: opens, advanceDays: adv };
      }
      return { ok: true, reason: '', opensOn: null, advanceDays: adv };
    },

    /**
     * Public play availability and rate for a tee time.
     * { ok, reason, rate, band: 'weekday'|'twilight'|'weekend', label, requiresMember }
     */
    publicSlot: function (iso, time) {
      const m = toMin(time), weekend = isWeekendOrHoliday(iso), dow = dateObj(iso).getDay();
      /* Fridays are for members all day (holiday Fridays too): public golfers play only as a member's guest. The rate is
         what that guest pays (Friday evening twilight, or the holiday rate). */
      if (dow === 5) {
        const hol = !!holidayName(iso), late = m >= toMin('17:30');
        return { ok: false, requiresMember: true, rate: hol ? RATES.weekend : late ? RATES.twilight : null, band: hol ? 'weekend' : late ? 'twilight' : null, label: 'Friday', reason: FRIDAY_PUBLIC };
      }
      if (weekend) {
        if (m >= toMin('06:00') && m < toMin('13:00')) return { ok: false, requiresMember: true, rate: RATES.weekend, band: 'weekend', label: 'Weekend & holiday', reason: 'Weekend and holiday mornings before 1:00 PM are for public golfers playing with a member.' };
        if (m >= toMin('13:00')) return { ok: true, requiresMember: false, rate: RATES.weekend, band: 'weekend', label: 'Weekend & holiday', reason: '' };
        return { ok: false, requiresMember: false, rate: null, band: 'weekend', label: 'Weekend & holiday', reason: 'Not open to public play.' };
      }
      if (m >= toMin('17:30')) return { ok: true, requiresMember: false, rate: RATES.twilight, band: 'twilight', label: 'Twilight', reason: '' };
      if (dow >= 1 && dow <= 4 && m >= toMin('10:30') && m < toMin('15:30')) return { ok: true, requiresMember: false, rate: RATES.weekday, band: 'weekday', label: 'Weekday', reason: '' };
      return { ok: false, requiresMember: false, rate: null, band: null, label: '', reason: 'Public tee times are Monday to Thursday 10:30 AM to 3:30 PM and after 5:30 PM, and weekends and holidays after 1:00 PM. Fridays are for members.' };
    },

    /**
     * Member Guest Policy. Prime times (Friday all day; Saturday, Sunday and holidays 6:00 AM to 11:00 AM, a holiday on a
     * weekday counting as a weekend day): one guest per member. All other times: up to three guests per member.
     * { max: 1 | 3, prime, label }
     */
    guestLimit: function (dateIso, timeHHMM) {
      const m = toMin(timeHHMM);
      const fri = isFriday(dateIso), am = isWeekendOrHoliday(dateIso) && m >= toMin('06:00') && m < toMin('11:00');
      const prime = fri || am;
      return { max: prime ? 1 : 3, prime: prime, label: prime ? (fri ? 'Friday prime time: one guest per member' : 'Weekend and holiday prime time (6:00 AM to 11:00 AM): one guest per member') : 'Up to three guests per member' };
    },

    /**
     * Fivesome Policy for a group of five at this time: { ok, count, max, reason }. count is how many other groups of
     * five already tee off in the same clock hour that day (excludeId: the group being edited).
     */
    fivesome: function (dateIso, timeHHMM, excludeId) {
      const h = Math.floor(toMin(timeHHMM) / 60);
      const count = Club.store.all('teeTimes').filter(function (x) {
        return x.date === dateIso && x.id !== excludeId && x.status !== 'cancelled' && x.status !== 'no-show' && (x.players || []).length >= MAX_GROUP && Math.floor(toMin(x.time) / 60) === h;
      }).length;
      const hh = Club.fmt.time(String(h).padStart(2, '0') + ':00');
      return { ok: count < MAX_FIVESOMES_PER_HOUR, count: count, max: MAX_FIVESOMES_PER_HOUR,
        reason: count < MAX_FIVESOMES_PER_HOUR ? '' : 'The ' + hh + ' hour already has ' + count + ' groups of five. The limit is ' + MAX_FIVESOMES_PER_HOUR + ' an hour.' };
    },

    /** Tournament Information: the most tournaments a week in this date's month (May, June, September, October: 3;
        July and August: 2), or null when the handbook sets no limit. { max, label } */
    tournamentLimit: function (dateIso) {
      const mo = +String(dateIso).slice(5, 7);
      if (mo === 7 || mo === 8) return { max: 2, label: 'at most 2 tournaments a week in July and August' };
      if ([5, 6, 9, 10].indexOf(mo) >= 0) return { max: 3, label: 'at most 3 tournaments a week in May, June, September and October' };
      return { max: null, label: '' };
    },

    /** Green fee for a public golfer or a member's guest at this time (9 holes at 60%). */
    greenFee: function (iso, time, holes) {
      const s = rules.publicSlot(iso, time);
      const settings = Club.store.getObj('teeSheetSettings', {}) || {};
      const base = s.rate != null ? s.rate : (isWeekendOrHoliday(iso) ? RATES.weekend : (settings.guestFee != null && settings.guestFee !== '' && !isNaN(+settings.guestFee) ? +settings.guestFee : RATES.weekday)   /* $0 is a real fee: no charge */);
      return +holes === 9 ? Math.round(base * NINE_HOLE_SHARE) : base;
    }
  };

  Club.teeRules = rules;
})();
