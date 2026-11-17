/* Reports section: Members. Registers through Club.reports.addSection (js/modules/reports.js).
   The roll over time (main chart), members by category, the age mix, renewal progress for next season and members
   going quiet. Figures come from members, membershipTiers, Club.billing.renewal and the activity collections; the age
   rules are Club.membership's (js/modules/members.js). */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, Dt = Club.date, esc = U.esc, H = Club.reports.h;
  const all = H.all, num = H.num, sum = H.sum, plural = H.plural, DEAD = H.DEAD;

  /* ---------------- Helpers ---------------- */
  function today() { return Dt.today(); }
  function M() { return Club.membership || { AGE_RULES: {}, ageOn: function () { return null; }, ageProblem: function () { return ''; } }; }
  function liveMembers() { return all('members').filter(function (m) { return m.status !== 'resigned'; }); }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function tierName(m) { const t = tierOf(m); return t ? t.name : 'No category'; }
  function mName(m) { return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function memLink(m) { return m ? '<a class="primary-cell" href="#/members/' + esc(m.id) + '">' + esc(mName(m)) + '</a>' : '<span class="muted">Former member</span>'; }
  function daysBetween(a, b) { return Math.round((F.toDate(b) - F.toDate(a)) / 86400000); }
  function localDay(iso) { if (!iso) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const d = new Date(iso); return isNaN(d) ? '' : S.iso(d); }
  function stLabel(s) { return s === 'leave' ? 'On leave' : s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown'; }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function money0(v) { return F.money0(v); }
  function played(t) { const T = today(); return !!t.date && t.date <= T && !DEAD[t.status] && t.status !== 'cancelled' && (t.date < T || t.status === 'completed' || t.status === 'on-course' || t.status === 'checked-in'); }
  /* The golf season's days (Club.season, set by staff in Settings, read at call time). */
  function inSeason(iso) { return Club.season.inSeason(iso); }
  function seasonDays(from, to) { if (!from || from >= to) return 0; let n = 0; for (let d = Dt.addDays(from, 1); d <= to; d = Dt.addDays(d, 1)) if (inSeason(d)) n++; return n; }
  const DR = Club.drill;

  /* ---------------- By category ---------------- */
  function tierData(ctx) {
    return H.memo(ctx, 'mem-tiers', function () {
      const tiers = all('membershipTiers'), ms = liveMembers();
      const items = tiers.map(function (t) { const of = ms.filter(function (m) { return m.tierId === t.id; }); return { t: t, label: t.name, n: of.length, active: of.filter(function (m) { return m.status === 'active'; }).length }; });
      const other = ms.filter(function (m) { return !tiers.some(function (t) { return t.id === m.tierId; }); }).length;
      if (other) items.push({ t: null, label: 'Unassigned', n: other, active: other });
      const st = {}; ms.forEach(function (m) { st[m.status] = (st[m.status] || 0) + 1; });
      const joined = all('members').filter(function (m) { return H.inRange(ctx)(String(m.memberSince || '').slice(0, 10)); });
      return { ms: ms, items: items.filter(function (i) { return i.n > 0; }).sort(function (a, b) { return b.n - a.n; }), st: st, joined: joined };
    });
  }
  function tierCSV(ctx) {
    const d = tierData(ctx);
    return [['Category', 'Members', 'Share']].concat(d.items.map(function (i) { return [i.label, i.n, d.ms.length ? (i.n / d.ms.length * 100).toFixed(1) + '%' : '0%']; }))
      .concat([[], ['Joined in period', d.joined.length, ctx.from + ' to ' + ctx.to]]);
  }
  function rollCSV(ctx) { return [[ctx.gran === 'day' ? 'Date' : 'Month', 'Members']].concat(ctx.rows.map(function (r) { return [H.csvKey(r), r.members]; })); }

  /* ---------------- Age mix (the club's age rules) ---------------- */
  const DISCOUNT = { intermediate: [24, 39], senior: 60 };
  function bands() {
    const AR = M().AGE_RULES || {};
    const jr = AR.tier_nonresident, ya = AR.tier_junior;
    const jrName = (S.find('membershipTiers', 'tier_nonresident') || {}).name || 'Junior', yaName = (S.find('membershipTiers', 'tier_junior') || {}).name || 'Young Adult';
    const jMax = jr && jr.max != null ? jr.max : 17, yMin = ya && ya.min != null ? ya.min : 19, yMax = ya && ya.max != null ? ya.max : 23;
    const out = [{ key: 'jr', label: 'Under ' + (jMax + 1), min: 0, max: jMax, tag: jrName }];
    if (yMin > jMax + 1) out.push({ key: 'gap', label: yMin - 1 === jMax + 1 ? String(jMax + 1) : (jMax + 1) + ' to ' + (yMin - 1), min: jMax + 1, max: yMin - 1, tag: 'Between ' + jrName + ' and ' + yaName });
    out.push({ key: 'ya', label: yMin + ' to ' + yMax, min: yMin, max: yMax, tag: yaName });
    out.push({ key: 'int', label: (yMax + 1) + ' to ' + DISCOUNT.intermediate[1], min: yMax + 1, max: DISCOUNT.intermediate[1], tag: 'Intermediate discount ages' });
    out.push({ key: 'mid', label: (DISCOUNT.intermediate[1] + 1) + ' to ' + (DISCOUNT.senior - 1), min: DISCOUNT.intermediate[1] + 1, max: DISCOUNT.senior - 1, tag: '' });
    out.push({ key: 'sen', label: DISCOUNT.senior + ' and over', min: DISCOUNT.senior, max: 999, tag: 'Senior discount ages' });
    return out;
  }
  function ageData(ctx) {
    return H.memo(ctx, 'mem-age', function () {
      const ms = liveMembers(), Y = +today().slice(0, 4), AR = M().AGE_RULES || {};
      const B = bands().map(function (b) { return Object.assign({ n: 0 }, b); });
      const withAge = [], noDob = [], outside = [], leaving = [];
      const adult = all('membershipTiers').filter(function (t) { return !AR[t.id]; }).sort(function (a, b) { return num(a.annualDues) - num(b.annualDues); })[0] || null;
      ms.forEach(function (m) {
        const age = M().ageOn(m.dob);
        if (age == null) { noDob.push(m); return; }
        withAge.push({ m: m, age: age });
        const b = B.filter(function (x) { return age >= x.min && age <= x.max; })[0]; if (b) b.n++;
        const rule = AR[m.tierId];
        if (!rule) return;
        if (M().ageProblem(m.tierId, age)) { outside.push({ m: m, age: age, rule: rule }); return; }
        if (rule.max == null) return;
        const year = Math.max(Y + 1, +String(m.dob).slice(0, 4) + rule.max + 1);
        if (year <= Y + 3) leaving.push({ m: m, age: age, year: year, t: tierOf(m), dues: num((tierOf(m) || {}).annualDues) });
      });
      leaving.sort(function (a, b) { return a.year - b.year || mName(a.m).localeCompare(mName(b.m)); });
      const years = [Y + 1, Y + 2, Y + 3].map(function (y) { const l = leaving.filter(function (x) { return x.year === y; }); return { year: y, n: l.length, dues: sum(l, function (x) { return x.dues; }), at: adult ? l.length * num(adult.annualDues) : 0, list: l }; });
      const avg = withAge.length ? sum(withAge, function (x) { return x.age; }) / withAge.length : 0;
      const sorted = withAge.map(function (x) { return x.age; }).sort(function (a, b) { return a - b; });
      const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
      return { ms: ms, B: B, withAge: withAge, noDob: noDob, outside: outside, leaving: leaving, years: years, adult: adult, avg: avg, median: median, Y: Y };
    });
  }
  function ageCSV(d) {
    return [['Age band', 'Category or rule', 'Members', 'Share']].concat(d.B.map(function (b) { return [b.label, b.tag, b.n, pct(b.n, d.withAge.length) + '%']; }))
      .concat([[], ['Average age', Math.round(d.avg * 10) / 10], ['Median age', d.median], ['No birth date on file', d.noDob.length], []])
      .concat([['Year', 'Leaving an age-limited category', 'Dues now', 'Dues at ' + (d.adult ? d.adult.name : 'adult category')]]).concat(d.years.map(function (y) { return [y.year, y.n, y.dues.toFixed(2), y.at.toFixed(2)]; }))
      .concat([[], ['Member', 'Member no', 'Category', 'Age', 'Leaves category in', 'Dues now']]).concat(d.leaving.map(function (x) { return [mName(x.m), x.m.memberNo, x.t ? x.t.name : '', x.age, x.year, x.dues.toFixed(2)]; }))
      .concat(d.outside.length ? [[], ['Outside their category\'s ages', 'Member no', 'Category', 'Age']].concat(d.outside.map(function (x) { return [mName(x.m), x.m.memberNo, tierName(x.m), x.age]; })) : [])
      .concat(d.noDob.length ? [[], ['No birth date on file', 'Member no', 'Category']].concat(d.noDob.map(function (m) { return [mName(m), m.memberNo, tierName(m)]; })) : []);
  }
  function ageDrill(ctx) {
    const d = ageData(ctx);
    let body = DR.kpis([
      { label: 'Average age', value: String(Math.round(d.avg)), sub: 'Median ' + d.median },
      { label: 'Birth date on file', value: d.withAge.length + ' of ' + d.ms.length, sub: d.noDob.length ? d.noDob.length + ' missing' : 'Complete' },
      { label: 'Leaving by ' + (d.Y + 3), value: String(d.leaving.length), sub: 'Junior and Young Adult' },
      { label: 'Dues now', value: money0(sum(d.leaving, function (x) { return x.dues; })), sub: 'Of members leaving' }
    ]);
    body += DR.sec('By age', d.withAge.length + ' members with a birth date', DR.table([{ label: 'Age' }, { label: 'Share' }, { label: 'Members', num: true }],
      d.B.map(function (b) { return ['<span class="primary-cell">' + esc(b.label) + '</span>' + (b.tag ? '<div class="dd-sub">' + esc(b.tag) + '</div>' : ''), DR.share(b.n, d.withAge.length), String(b.n)]; })));
    body += DR.sec('Leaving an age-limited category', d.leaving.length ? d.leaving.length + ' in the next three years' : '', d.leaving.length ? DR.table([{ label: 'Member' }, { label: 'Age', num: true }, { label: 'Leaves', num: true }, { label: 'Dues now', num: true }],
      d.leaving.map(function (x) { return [memLink(x.m) + '<div class="dd-sub">' + esc(x.t ? x.t.name : '') + '</div>', String(x.age), String(x.year), esc(money0(x.dues))]; })) : DR.note('No Junior or Young Adult member reaches the age limit in the next three years.'));
    body += DR.sec('Dues by year', d.adult ? 'If they move to ' + d.adult.name : '', DR.table([{ label: 'Year' }, { label: 'Members', num: true }, { label: 'Dues now', num: true }, { label: 'At ' + (d.adult ? d.adult.name : 'adult') + ' dues', num: true }],
      d.years.map(function (y) { return [String(y.year), String(y.n), esc(money0(y.dues)), esc(money0(y.at)) + (y.n ? '<div class="rd-chg ' + (y.at >= y.dues ? 'up' : 'down') + '">' + (y.at >= y.dues ? '+' : '') + esc(money0(y.at - y.dues)) + '</div>' : '')]; })) +
      DR.note('The membership rules do not say which category a member joins after Junior or Young Adult, or whether they stay. Eagle and Birdie list a 25% intermediate discount for ages 24 to 39, which this system does not apply to dues. Dues are the placeholder amounts in the system.'));
    if (d.outside.length) body += DR.sec('Outside their category\'s ages', d.outside.length + ' to check', DR.table([{ label: 'Member' }, { label: 'Age', num: true }],
      d.outside.map(function (x) { return [memLink(x.m) + '<div class="dd-sub">' + esc(tierName(x.m) + ', ' + (x.rule.label || '').toLowerCase()) + '</div>', String(x.age)]; })));
    body += DR.sec('No birth date on file', d.noDob.length ? d.noDob.length + ' ' + plural(d.noDob.length, 'member') : '', d.noDob.length ? DR.table([{ label: 'Member' }, { label: 'Status' }],
      d.noDob.map(function (m) { return [memLink(m) + '<div class="dd-sub">' + esc(tierName(m)) + '</div>', esc(stLabel(m.status))]; })) + DR.note('Add a date of birth on the member\'s profile to include them.') : DR.note('Every member has a birth date on file.'));
    return { title: 'Age mix', body: body, csv: ageCSV(d), csvId: 'members-age-detail', go: 'members', goLabel: 'Open members', asOf: true };
  }

  /* ---------------- Members going quiet ---------------- */
  const QUIET_DAYS = 60;
  function activityIndex() {
    const T = today(), ix = {};
    let first = null;
    function slot(id) { return ix[id] = ix[id] || { last: null, golf: null, other: null, ahead: null }; }
    function add(id, date, what, golf) {
      if (!id || !date) return;
      if (!first || date < first) first = date;
      const x = slot(id);
      if (date > T) { if (!x.ahead || date < x.ahead.date) x.ahead = { date: date, what: what }; return; }
      const e = { date: date, what: what };
      if (!x.last || date > x.last.date) x.last = e;
      if (golf) { if (!x.golf || date > x.golf.date) x.golf = e; } else if (!x.other || date > x.other.date) x.other = e;
    }
    all('teeTimes').forEach(function (t) {
      if (!t.date || DEAD[t.status] || t.status === 'cancelled') return;
      if (!(t.date > T || played(t))) return;
      (t.players || []).forEach(function (p) { if (p && p.memberId) add(p.memberId, t.date, 'Golf', true); });
    });
    all('diningReservations').forEach(function (r) { if (!DEAD[r.status] && r.status !== 'cancelled') add(r.memberId, r.date, 'Dining', false); });
    all('events').forEach(function (e) {
      if (e.status === 'cancelled' || e.status === 'draft') return;
      (e.registrations || []).forEach(function (g) { if (g && !g.cancelled) add(g.memberId, e.date, 'Event, ' + (e.title || 'club event'), false); });
    });
    all('lessons').forEach(function (l) { if (l.status !== 'cancelled' && l.status !== 'no-show') add(l.memberId, l.date, l.type || 'Lesson', false); });
    all('programs').forEach(function (p) {
      const dates = []; for (let k = 0; k < (+p.weeks || 0); k++) dates.push(Dt.addDays(p.startDate, k * 7));
      const past = dates.filter(function (d) { return d <= T; }).pop(), next = dates.filter(function (d) { return d > T; })[0];
      (p.enrolled || []).forEach(function (id) { if (past) add(id, past, p.name || 'Clinic', false); if (next) add(id, next, p.name || 'Clinic', false); });
    });
    all('cartOrders').forEach(function (o) { if (o.status !== 'cancelled') add(o.memberId, o.date || localDay(o.placedAt), 'Beverage cart', false); });
    all('takeoutOrders').forEach(function (o) { if (o.status !== 'cancelled' && o.customer) add(o.customer.memberId, o.date || localDay(o.placedAt), 'Takeout', false); });
    all('charges').forEach(function (c) { if (c.category !== 'Dues' && num(c.amount) > 0) add(c.memberId, c.date, (c.category || 'House') + ' charge', false); });
    return { ix: ix, first: first };
  }
  function quietRows(ctx) {
    return H.memo(ctx, 'mem-quiet', function () {
      const A = activityIndex(), T = today();
      const rows = liveMembers().map(function (m) {
        const x = A.ix[m.id] || {};
        const dOther = x.other ? daysBetween(x.other.date, T) : Infinity;
        const dGolf = x.golf ? seasonDays(x.golf.date, T) : Infinity;
        return { m: m, last: x.last || null, ahead: x.ahead || null, days: Math.min(dOther, dGolf), cal: x.last ? daysBetween(x.last.date, T) : Infinity };
      });
      rows.sort(function (a, b) { return (a.m.status === 'active' ? 0 : 1) - (b.m.status === 'active' ? 0 : 1) || (b.days - a.days) || mName(a.m).localeCompare(mName(b.m)); });
      return { rows: rows, quiet: rows.filter(function (r) { return r.days >= QUIET_DAYS; }), first: A.first };
    });
  }
  function lastText(r) { return r.last ? r.last.what + ', ' + F.dateShort(r.last.date) : 'No activity on file'; }
  function daysText(r) { return r.days === Infinity ? 'None on file' : r.days + ' days'; }
  function quietCSV(q) {
    return [['Member', 'Member no', 'Category', 'Status', 'Last activity', 'Activity', 'Days quiet', 'Quiet ' + QUIET_DAYS + '+ days', 'Next booking', 'Email']].concat(q.rows.map(function (r) {
      return [mName(r.m), r.m.memberNo, tierName(r.m), stLabel(r.m.status), r.last ? r.last.date : '', r.last ? r.last.what : 'No activity on file', r.days === Infinity ? '' : r.days, r.days >= QUIET_DAYS ? 'Yes' : 'No', r.ahead ? r.ahead.date + ' ' + r.ahead.what : '', r.m.email || ''];
    }));
  }
  function quietDrill(ctx) {
    const q = quietRows(ctx);
    let body = DR.kpis([
      { label: 'Quiet ' + QUIET_DAYS + '+ days', value: String(q.quiet.length), sub: 'Of ' + q.rows.length + ' members' },
      { label: 'Nothing on file', value: String(q.quiet.filter(function (r) { return !r.last; }).length), sub: q.first ? 'Since ' + F.dateShort(q.first) : '' },
      { label: 'Booked ahead', value: String(q.quiet.filter(function (r) { return r.ahead; }).length), sub: 'Quiet, with a booking coming up' },
      { label: 'Not active', value: String(q.quiet.filter(function (r) { return r.m.status !== 'active'; }).length), sub: 'On leave or suspended' }
    ]);
    body += q.quiet.length ? DR.sec('Most at risk first', 'Active members, then the longest quiet', DR.table([{ label: 'Member' }, { label: 'Last activity' }, { label: 'Quiet', num: true }],
      q.quiet.map(function (r) {
        return [memLink(r.m) + (r.m.status !== 'active' ? ' ' + U.badge(stLabel(r.m.status), r.m.status === 'leave' ? 'info' : 'warn') : '') + '<div class="dd-sub">' + esc(tierName(r.m)) + '</div>' + (r.ahead ? '<div class="dd-sub">Next: ' + esc(r.ahead.what + ', ' + F.dateShort(r.ahead.date)) + '</div>' : ''), esc(lastText(r)), esc(daysText(r))];
      }))) : DR.empty('No one has gone quiet', 'Every member has club activity in the last ' + QUIET_DAYS + ' days.', 'members');
    body += DR.note('Quiet days are calendar days since the last dining, event, lesson, order or charge, or golf-season days (' + Club.season.dayLabel() + ') since the last round, whichever is fewer. Members on leave or suspended are listed after active members.');
    return { title: 'Members going quiet', body: body, csv: quietCSV(q), csvId: 'members-quiet-detail', go: 'members', goLabel: 'Open members', asOf: true };
  }

  /* ---------------- Renewal progress (Club.billing.renewal) ---------------- */
  function RN() { return Club.billing && Club.billing.renewal ? Club.billing.renewal : null; }
  function renewalData(ctx) {
    return H.memo(ctx, 'mem-renewal', function () {
      const rn = RN(); if (!rn) return null;
      const rows = liveMembers().filter(function (m) { return tierOf(m); }).map(function (m) {
        const r = rn.forMember(m.id), sched = r ? r.schedule || [] : [];
        const posted = sum(sched.filter(function (s) { return s.chargeId; }), function (s) { return s.amount; });
        return { m: m, t: tierOf(m), r: r, total: r ? num(r.total) : 0, posted: posted, left: r ? num(r.total) - posted : 0, expected: r ? 0 : num(tierOf(m).annualDues) };
      }).sort(function (a, b) { return a.m.lastName.localeCompare(b.m.lastName) || a.m.firstName.localeCompare(b.m.firstName); });
      const done = rows.filter(function (x) { return x.r; }), pending = rows.filter(function (x) { return !x.r; });
      const plans = Object.keys(rn.PLAN_LABEL).map(function (k) { const l = done.filter(function (x) { return x.r.plan === k; }); return { key: k, label: rn.PLAN_LABEL[k], n: l.length, total: sum(l, function (x) { return x.total; }) }; });
      const tiers = all('membershipTiers').map(function (t) { const of = rows.filter(function (x) { return x.t.id === t.id; }); return { t: t, n: of.length, done: of.filter(function (x) { return x.r; }).length }; }).filter(function (x) { return x.n; });
      return { rn: rn, rows: rows, done: done, pending: pending, plans: plans, tiers: tiers,
        committed: sum(done, function (x) { return x.total; }), posted: sum(done, function (x) { return x.posted; }), left: sum(done, function (x) { return x.left; }), outstanding: sum(pending, function (x) { return x.expected; }) };
    });
  }
  function renewalCSV(d) {
    if (!d) return [];
    return [['Member', 'Member no', 'Category', 'Status', 'Renewed', 'Plan', 'Renewed on', 'Dues committed', 'Posted', 'Still scheduled', 'Expected if renewed', 'Email']].concat(d.rows.map(function (x) {
      return [mName(x.m), x.m.memberNo, x.t.name, stLabel(x.m.status), x.r ? 'Yes' : 'No', x.r ? d.rn.PLAN_LABEL[x.r.plan] || x.r.plan : '', x.r ? localDay(x.r.createdAt) : '', x.total.toFixed(2), x.posted.toFixed(2), x.left.toFixed(2), x.expected.toFixed(2), x.m.email || ''];
    })).concat([[], ['Renewed', d.done.length], ['Not yet renewed', d.pending.length], ['Dues committed', d.committed.toFixed(2)], ['Dues outstanding', d.outstanding.toFixed(2)]]);
  }
  function renewalDrill(ctx) {
    const d = renewalData(ctx);
    if (!d) return { title: 'Renewals', body: DR.empty('Renewals are not available', 'Renewals come from Billing, which is not loaded.', 'billing'), asOf: true };
    const rn = d.rn;
    let body = DR.kpis([
      { label: 'Renewed', value: d.done.length + ' of ' + d.rows.length, sub: pct(d.done.length, d.rows.length) + '% of members' },
      { label: d.plans[0] ? d.plans[0].label : 'Paid in full', value: String(d.plans[0] ? d.plans[0].n : 0), sub: money0(d.plans[0] ? d.plans[0].total : 0) },
      { label: d.plans[1] ? d.plans[1].label : 'Monthly', value: String(d.plans[1] ? d.plans[1].n : 0), sub: money0(d.plans[1] ? d.plans[1].total : 0) },
      { label: 'Outstanding', value: money0(d.outstanding), sub: d.pending.length + ' not yet renewed' }
    ]);
    body += d.pending.length ? DR.sec('Not yet renewed', d.pending.length + ' ' + plural(d.pending.length, 'member'), DR.table([{ label: 'Member' }, { label: 'Dues', num: true }, { label: 'Balance', num: true }],
      d.pending.map(function (x) { return [memLink(x.m) + '<div class="dd-sub">' + esc(x.t.name + (x.m.status !== 'active' ? ', ' + stLabel(x.m.status).toLowerCase() : '')) + '</div>', esc(money0(x.expected)), esc(F.money(x.m.balance || 0))]; }),
      ['Total', esc(money0(d.outstanding)), ''])) : DR.empty('Everyone has renewed', 'Every current member has renewed for ' + rn.SEASON + '.', 'check');
    body += DR.sec('By category', '', DR.table([{ label: 'Category' }, { label: 'Members', num: true }, { label: 'Renewed', num: true }, { label: 'Share' }],
      d.tiers.map(function (x) { return [esc(x.t.name), String(x.n), String(x.done), DR.share(x.done, x.n)]; })));
    body += DR.note('Members renew from My account in the members\' portal, in full or in monthly instalments until August ' + rn.SEASON + '. Dues amounts in this demo are placeholders.');
    return { title: 'Not yet renewed for ' + rn.SEASON, body: body, csv: renewalCSV(d), csvId: 'members-renewal-detail', go: 'billing/renewals', goLabel: 'Open renewals', asOf: true };
  }

  /* ---------------- The section ---------------- */
  function rollChange(ctx) {
    const first = ctx.rows[0], last = ctx.rows[ctx.rows.length - 1];
    return ctx.gran === 'month' && ctx.rows.length > 1 && first && first.members ? last.members - first.members : null;
  }
  function kpis(ctx) {
    const t = tierData(ctx), q = quietRows(ctx), rn = renewalData(ctx), ch = rollChange(ctx);
    const first = ctx.rows[0];
    const out = [
      { label: 'Members on the roll', value: F.num(t.ms.length), d: ch == null ? esc(t.joined.length ? t.joined.length + ' joined in this period' : 'No one joined in this period') : (ch === 0 ? 'Unchanged since ' + esc(H.monthLabel(first.key, true)) : '<b class="' + (ch > 0 ? 'up' : 'down') + '">' + (ch > 0 ? 'up ' : 'down ') + Math.abs(ch) + '</b> since ' + esc(H.monthLabel(first.key, true))), chg: ch != null ? H.kpiChg(ch, 'num', 'since ' + H.monthLabel(first.key, true)) : t.joined.length ? H.kpiChg(t.joined.length, 'num', '', { label: t.joined.length + ' joined in this period' }) : null, drill: 'members', aria: 'Members on the roll ' + t.ms.length },
      { label: 'Active today', value: F.num(t.st.active || 0), d: esc(((t.st.leave || 0) ? (t.st.leave) + ' on leave' : 'None on leave') + ((t.st.suspended || 0) ? ', ' + t.st.suspended + ' suspended' : '')), drill: 'members' }
    ];
    const r7 = recentRenewals(rn, 7);
    if (rn) out.push({ label: 'Renewed for ' + rn.rn.SEASON, value: F.num(rn.done.length), d: esc('of ' + rn.rows.length + ' members, ' + pct(rn.done.length, rn.rows.length) + '%'), chg: r7 ? H.kpiChg(r7, 'num', '', { label: r7 + ' renewed in the last 7 days' }) : null, drill: 'renewal', aria: 'Renewed for ' + rn.rn.SEASON + ': ' + rn.done.length + ' of ' + rn.rows.length });
    out.push({ label: 'Quiet ' + QUIET_DAYS + ' days or more', value: F.num(q.quiet.length), d: esc(q.quiet.length ? q.quiet.filter(function (r) { return !r.last; }).length + ' with nothing on file' : 'Everyone has recent activity'), drill: 'quiet', aria: 'Members quiet ' + QUIET_DAYS + ' days or more: ' + q.quiet.length });
    return out;
  }
  function main(ctx) {
    const t = tierData(ctx), ch = rollChange(ctx), first = ctx.rows[0];
    const monthly = ctx.gran === 'month' && ctx.rows.length > 1;
    let take = t.ms.length + ' ' + plural(t.ms.length, 'member is', 'members are') + ' on the roll today';
    if (ch != null) take += ch === 0 ? ', the same as ' + H.monthLabel(first.key, true) + '.' : ', ' + (ch > 0 ? 'up ' : 'down ') + Math.abs(ch) + ' since ' + H.monthLabel(first.key, true) + '.';
    else take += '. ' + (t.joined.length ? t.joined.length + ' joined in this period.' : 'No one joined in this period.');
    let body, foot = '';
    if (monthly) {
      const L = H.colLabels(ctx);
      body = Club.charts.columns({ labels: L.labels, years: L.years, tipTitles: L.titles, values: ctx.rows.map(function (r) { return num(r.members); }), tipName: 'Members', ariaLabel: 'Members by month', height: 240, whole: true });
      foot = 'The roll is counted at the end of each month; this month is today\'s count.';
    } else {
      body = Club.charts.columns({ labels: t.items.map(function (i) { return i.label; }), values: t.items.map(function (i) { return i.n; }), tipName: 'Members', ariaLabel: 'Members by category', height: 220, whole: true });
      foot = 'The roll is recorded once a month, so a ' + (ctx.gran === 'day' ? 'daily' : 'single-month') + ' trend is not available. Choose three months or more to see it; this shows today\'s roll by category.';
    }
    return { id: 'members-roll', title: monthly ? 'Members over time' : 'Members by category', take: take, body: body, desc: rollDesc(ctx, t, ch, monthly), foot: foot, csvId: 'members-roll', drill: 'members', drillLabel: 'See the table' };
  }
  function panels(ctx) {
    const t = tierData(ctx), a = ageData(ctx), q = quietRows(ctx), rn = renewalData(ctx);
    const top = t.items[0];
    const pTier = { id: 'members-tiers', title: 'By category', take: !t.ms.length ? 'No members on the roll yet.' : top.label + ' is the largest category with ' + top.n + ' ' + plural(top.n, 'member') + ', ' + pct(top.n, t.ms.length) + '% of the roll.',
      body: t.items.length ? Club.charts.ranked(t.items.map(function (i) { return { label: i.label, value: i.n, attrs: 'data-drill="members" aria-label="' + esc(i.label + ' ' + i.n + ' members, ' + pct(i.n, t.ms.length) + '%. See the members table') + '"' }; }), { total: t.ms.length }) : '<p class="rp-empty">Membership composition appears once members are added.</p>',
      desc: tierDesc(t), csvId: 'members-tiers', drill: 'members', drillLabel: 'See the table' };
    const seniors = a.B.filter(function (b) { return b.key === 'sen'; })[0], out3 = sum(a.years, function (y) { return y.n; });
    const pAge = { id: 'members-age', title: 'Age mix', take: !a.withAge.length ? 'The age mix appears once member records have a date of birth.' : 'The average member is ' + Math.round(a.avg) + '. ' + (seniors ? pct(seniors.n, a.withAge.length) + '% are 60 and over. ' : '') + (out3 ? out3 + ' ' + plural(out3, 'member leaves', 'members leave') + ' an age-limited category by ' + (a.Y + 3) + '.' : 'No one leaves an age-limited category by ' + (a.Y + 3) + '.'),
      body: a.withAge.length ? Club.charts.ranked(a.B.map(function (b) { return { label: b.label, sub: b.tag || '', value: b.n }; }), { total: a.withAge.length }) : '<p class="rp-empty">No birth dates on file.</p>',
      desc: ageDesc(a), csvId: 'members-age', drill: 'age', drillLabel: 'See members by age' };
    let pRenew;
    if (!rn) pRenew = { id: 'members-renewal', title: 'Renewal progress', take: 'Renewals come from Billing, which is not loaded.', body: '', desc: 'Renewal progress appears when Billing is loaded. It shows who has renewed for next season and what is still to come.' };
    else {
      const N = rn.rows.length, parts = rn.plans.map(function (p, i) { return { label: p.label, value: p.n, color: i === 0 ? 'var(--viz-1)' : 'var(--viz-3)' }; }).concat([{ label: 'Not yet renewed', value: rn.pending.length, color: 'var(--viz-context)' }]);
      pRenew = { id: 'members-renewal', title: rn.rn.SEASON + ' renewal progress', take: rn.done.length + ' of ' + N + ' members have renewed, ' + pct(rn.done.length, N) + '%. ' + (rn.pending.length ? rn.pending.length + ' ' + plural(rn.pending.length, 'has', 'have') + ' not, worth ' + money0(rn.outstanding) + ' at current dues.' : 'Everyone has renewed.'),
        body: Club.charts.split(parts) + '<div class="legend">' + parts.map(function (p) { return '<span><i style="background:' + p.color + '"></i>' + esc(p.label) + ' ' + p.value + '</span>'; }).join('') + '</div>' +
          '<div class="kv"><div class="season-row"><span>Dues committed</span><b>' + esc(money0(rn.committed)) + '</b></div><div class="season-row"><span>Posted to accounts so far</span><b>' + esc(money0(rn.posted)) + '</b></div><div class="season-row"><span>Instalments still to come</span><b>' + esc(money0(rn.left)) + '</b></div><div class="season-row"><span>Not yet renewed, at current dues</span><b>' + esc(money0(rn.outstanding)) + '</b></div></div>',
        desc: renewalDesc(rn), csvId: 'members-renewal', drill: 'renewal', drillLabel: rn.pending.length ? 'See who has not renewed' : 'See details' };
    }
    const none = q.quiet.filter(function (r) { return !r.last; }).length;
    const pQuiet = { id: 'members-quiet', title: 'Members going quiet', take: !q.quiet.length ? 'Every member has club activity in the last ' + QUIET_DAYS + ' days.' : q.quiet.length + ' ' + plural(q.quiet.length, 'member has', 'members have') + ' had no activity in ' + QUIET_DAYS + ' days' + (none ? ', ' + none + ' with nothing on file at all.' : '.') + (q.quiet.some(function (r) { return r.ahead; }) ? ' ' + q.quiet.filter(function (r) { return r.ahead; }).length + ' of them ' + (q.quiet.filter(function (r) { return r.ahead; }).length === 1 ? 'has' : 'have') + ' a booking coming up.' : ''),
      body: q.quiet.length ? Club.charts.ranked(q.quiet.slice(0, 5).map(function (r) { return { label: mName(r.m) + (r.m.status !== 'active' ? ', ' + stLabel(r.m.status).toLowerCase() : ''), sub: tierName(r.m) + '. Last: ' + lastText(r) + (r.ahead ? '. Booked ahead' : ''), html: daysText(r), value: r.days === Infinity ? 0 : r.days, attrs: 'data-href="members/' + esc(r.m.id) + '" aria-label="' + esc(mName(r.m) + ', quiet ' + daysText(r) + '. Open their profile') + '"' }; }), { bare: true }) : '',
      desc: quietDesc(q, rn), csvId: 'members-quiet', drill: 'quiet', drillLabel: q.quiet.length > 5 ? 'See all ' + q.quiet.length : 'See details' };
    return [pTier, pAge, pRenew, pQuiet];
  }
  /* ---------------- Descriptions and ideas ---------------- */
  function duesRange() {
    const d = all('membershipTiers').map(function (t) { return num(t.annualDues); }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    return d.length ? { lo: d[0], hi: d[d.length - 1] } : null;
  }
  function recentRenewals(rn, days) { const from = Dt.addDays(today(), -days); return rn ? rn.done.filter(function (x) { return localDay(x.r.createdAt) > from; }).length : 0; }
  function rollDesc(ctx, t, ch, monthly) {
    if (!monthly) return H.sents(['Columns show today\'s roll by category, because the roll is recorded once a month.', t.items.length ? t.items[0].label + ' is the largest category with ' + t.items[0].n + ' ' + plural(t.items[0].n, 'member') + '.' : '', 'Choose three months or more to see how the roll has changed.']);
    const vals = ctx.rows.map(function (r) { return num(r.members); }), hi = Math.max.apply(null, vals), lo = Math.min.apply(null, vals), dr = duesRange();
    return H.sents(['Each column is the roll at the end of a month, counting every member who has not resigned; this month is today\'s count.',
      hi === lo ? 'It held at ' + hi + ' all period.' : 'It ranged from ' + lo + ' in ' + H.monthLabel(ctx.rows[vals.indexOf(lo)].key, true) + ' to ' + hi + ' in ' + H.monthLabel(ctx.rows[vals.lastIndexOf(hi)].key, true) + '.',
      !dr ? '' : ch > 0 ? 'At current dues each new member adds between ' + money0(dr.lo) + ' and ' + money0(dr.hi) + ' a year, so small gains add up.' : ch < 0 ? 'Each member lost takes between ' + money0(dr.lo) + ' and ' + money0(dr.hi) + ' a year in dues with them, so renewals matter.' : 'A steady roll means growth has to come from new applications and spending per member.']);
  }
  function tierDesc(t) {
    if (!t.ms.length) return H.sents(['Each row will show a category\'s share of the roll.', 'There are no members on the roll yet.']);
    const withDues = t.items.filter(function (i) { return i.t; }).map(function (i) { return { label: i.label, v: i.active * num(i.t.annualDues) }; }).sort(function (a, b) { return b.v - a.v; });
    const total = sum(withDues, function (x) { return x.v; }), small = t.items[t.items.length - 1];
    return H.sents(['Each row is a category\'s share of the ' + t.ms.length + ' members on the roll.',
      total ? 'At current dues the active members bring in ' + money0(total) + ' a year, ' + withDues[0].label + ' members ' + pct(withDues[0].v, total) + '% of it.' : '',
      t.items.length > 1 ? small.label + ' is the smallest with ' + small.n + ' ' + plural(small.n, 'member') + '.' : '']);
  }
  function ageDesc(a) {
    if (!a.withAge.length) return H.sents(['Rows group members by age once birth dates are on file.', 'No current member has one yet.']);
    const under40 = a.withAge.filter(function (x) { return x.age < 40; }).length, sen = a.B.filter(function (b) { return b.key === 'sen'; })[0], ps = sen ? pct(sen.n, a.withAge.length) : 0;
    return H.sents(['Rows group the ' + a.withAge.length + ' members with a birth date on file by age.', 'The median member is ' + a.median + ', and ' + pct(under40, a.withAge.length) + '% are under 40.',
      ps >= 40 ? 'With ' + ps + '% aged 60 and over, the younger categories are the club\'s pipeline for the years ahead.' : 'The roll is spread across ages, so no one age group carries the club.',
      a.noDob.length ? a.noDob.length + ' ' + plural(a.noDob.length, 'member has', 'members have') + ' no birth date and ' + (a.noDob.length === 1 ? 'is' : 'are') + ' left out.' : '']);
  }
  function renewalDesc(rn) {
    const S_ = rn.rn.SEASON, r28 = recentRenewals(rn, 28), wk = r28 / 4, n = rn.pending.length;
    return H.sents(['The bar splits the roll by how members renewed for ' + S_ + ': in full, monthly, or not yet.',
      'Of the ' + money0(rn.committed) + ' committed, ' + money0(rn.posted) + ' is posted to accounts and ' + money0(rn.left) + ' is still to come in instalments.',
      !n ? 'Everyone on the roll has renewed.' : r28 ? 'At the pace of the last four weeks, about ' + (Math.round(wk * 10) / 10) + ' a week, the other ' + n + ' would take ' + Math.ceil(n / wk) + ' weeks.' : 'No one has renewed in the last four weeks, so a reminder would help.']);
  }
  function quietDesc(q, rn) {
    if (!q.quiet.length) return H.sents(['This list shows members with no club activity for 60 days or more.', 'Everyone has been active recently.']);
    const pend = {}; if (rn) rn.pending.forEach(function (x) { pend[x.m.id] = x; });
    const away = q.quiet.filter(function (r) { return r.m.status !== 'active'; }).length;
    const risk = q.quiet.filter(function (r) { return pend[r.m.id] && r.m.status === 'active'; });
    return H.sents(['Each row is a member with no club activity for ' + QUIET_DAYS + ' days or more, longest first.', 'Golf counts only golf season days, ' + Club.season.dayLabel() + ', so the winter break does not make anyone look quiet.',
      away ? (away === q.quiet.length ? (away === 1 ? 'This member is' : 'All ' + away + ' are') : away + ' of them ' + (away === 1 ? 'is' : 'are')) + ' on leave or suspended, which explains the quiet.' : '',
      !rn ? '' : risk.length ? risk.length + ' active ' + plural(risk.length, 'member has', 'members have') + ' not renewed for ' + rn.rn.SEASON + ', ' + money0(sum(risk, function (r) { return pend[r.m.id].expected; })) + ' in dues; they are the ones to call first.' : away === q.quiet.length ? '' : 'The active ones have all renewed for ' + rn.rn.SEASON + '.']);
  }
  function ideas(ctx) {
    const out = [], rn = renewalData(ctx), q = quietRows(ctx), a = ageData(ctx);
    const pend = {}; if (rn) rn.pending.forEach(function (x) { pend[x.m.id] = x; });
    const risk = q.quiet.filter(function (r) { return pend[r.m.id] && r.m.status === 'active'; });   /* on leave or suspended: quiet by design */
    if (rn && risk.length) {
      const dues = sum(risk, function (r) { return pend[r.m.id].expected; });
      out.push({ title: 'Call the members most at risk of leaving', text: risk.length + ' ' + plural(risk.length, 'member has', 'members have') + ' had no club activity for ' + QUIET_DAYS + ' days or more and ' + (risk.length === 1 ? 'has' : 'have') + ' not renewed for ' + rn.rn.SEASON + ', ' + money0(dues) + ' in dues at current rates. A personal call with an invitation to an upcoming event is the most direct way to find out whether they plan to stay.',
        assume: 'Counts the ' + rn.rn.SEASON + ' dues of quiet members who have not renewed. This is revenue kept rather than new revenue.', amount: dues, per: 'a year', year: dues });
    }
    const rest = rn ? rn.pending.filter(function (x) { return !risk.some(function (r) { return r.m.id === x.m.id; }); }) : [];
    if (rest.length) out.push({ title: 'Remind the rest to renew for ' + rn.rn.SEASON, text: rest.length + ' more ' + plural(rest.length, 'member has', 'members have') + ' not renewed yet, ' + money0(sum(rest, function (x) { return x.expected; })) + ' at current dues. A reminder now brings the money in sooner and shows early who may be leaving; members can renew in the portal, in full or monthly.',
      assume: 'No estimate: these members are active and many may renew anyway, so the gain is mostly timing.', amount: null, year: 0 });
    const y = a.years.filter(function (x) { return x.n; })[0];
    if (y && a.adult && y.at > y.dues) out.push({ title: 'Keep members who age out of Junior and Young Adult', text: y.n + ' ' + plural(y.n, 'member reaches', 'members reach') + ' the age limit of their category by ' + y.year + ', paying ' + money0(y.dues) + ' a year now. Moving them into ' + a.adult.name + ' rather than losing them would bring ' + money0(y.at) + ', ' + money0(y.at - y.dues) + ' more a year.',
      assume: 'Assumes all ' + y.n + ' stay and move to ' + a.adult.name + ' at ' + money0(num(a.adult.annualDues)) + ', the lowest-dues category with no age limit. The rules do not say which category comes next.', amount: y.at - y.dues, per: 'a year', year: y.at - y.dues });
    /* Referrals: applications that came through members or their guests ("How did you hear about us?"). */
    const apps = all('applications'), hf = M().heardFrom || function (x) { return x && x.heardFrom || ''; };
    const answered = apps.filter(function (x) { return hf(x); }), viaMembers = answered.filter(function (x) { return /member|guest/i.test(hf(x)); });
    const adult = a.adult;
    if (answered.length >= 3 && viaMembers.length && adult) out.push({ title: 'Thank members who bring in new members', text: viaMembers.length + ' of the ' + answered.length + ' applications that say how they heard about the club came through a member or as a member\'s guest. A small thank-you for each referral that joins, such as a dining credit, keeps that going; one more ' + adult.name + ' member a year is ' + money0(num(adult.annualDues)) + ' in dues.',
      assume: 'Assumes one extra referred member a year at ' + adult.name + ' dues, the lowest-dues adult category. Counts every application on file with an answer.', amount: num(adult.annualDues), per: 'a year', year: num(adult.annualDues) });
    const acc = Club.reports.get('accounts'), sp = acc && acc.data && acc.data.spend ? acc.data.spend(ctx) : null, fc = ctx.ix.first.ch;
    const qa = q.quiet.filter(function (r) { return r.m.status === 'active'; }).length, months = H.spanDays(fc && fc > ctx.from ? fc : ctx.from, ctx.to) / 30.4375;
    if (sp && sp.list.length && qa && months >= 0.2) {
      const avg = sp.total / sp.list.length / months, amt = qa * avg / 2;
      out.push({ title: 'Win back quiet members', text: qa + ' active ' + plural(qa, 'member has', 'members have') + ' been quiet for ' + QUIET_DAYS + ' days or more. Members who use the club spent ' + money0(avg) + ' a month each on house charges. Bringing the quiet ones back to half that, with a members\' night or a lesson offer, would add about ' + money0(amt) + ' a month.',
        assume: 'Assumes each quiet active member spends half what the average spending member does, for twelve months' + (fc && fc > ctx.from ? '; house charges on file begin ' + F.dateShort(fc) : '') + '.', amount: amt, per: 'a month', year: amt * 12 });
    }
    return out;
  }
  function about(ctx) {
    const a = ageData(ctx), q = quietRows(ctx), rn = renewalData(ctx), out = [];
    out.push('The roll counts every member who has not resigned; on leave and suspended members are included. Monthly counts come from the monthly ledger, this month from today\'s roll.');
    out.push((a.noDob.length ? a.noDob.length + ' ' + plural(a.noDob.length, 'member has', 'members have') + ' no birth date on file and ' + (a.noDob.length === 1 ? 'is' : 'are') + ' left out of the age mix. ' : 'Every member has a birth date on file. ') +
      (a.outside.length ? a.outside.length + ' ' + plural(a.outside.length, 'member is', 'members are') + ' already outside their category\'s ages. ' : '') +
      'Junior ends at ' + (((M().AGE_RULES || {}).tier_nonresident || {}).max + 1 || 18) + ' and Young Adult at ' + (((M().AGE_RULES || {}).tier_junior || {}).max + 1 || 24) + ', counted in the year a member reaches that age. The rules do not say which category comes next, so the dues comparison in the details assumes ' + (a.adult ? a.adult.name + ', the lowest-dues category with no age limit' : 'an adult category') + '.');
    out.push('Quiet counts tee times, dining reservations, events, lessons and clinics, beverage cart and takeout orders, and house charges other than dues. Golf counts only golf season days, ' + Club.season.dayLabel() + ', so a member who last played before the course closed is not marked quiet over the winter.' + (q.first ? ' Activity records begin ' + F.date(q.first) + '.' : ''));
    if (rn) out.push('Renewals: committed is the ' + rn.rn.SEASON + ' dues of members who have renewed, ' + money0(rn.posted) + ' posted to accounts so far and ' + money0(rn.left) + ' in instalments still to come. Not yet renewed is what the others would owe at their category\'s current dues. Dues amounts in this demo are placeholders, and some renewals were added for the demo.');
    return out;
  }
  function csv(ctx) {
    const rn = renewalData(ctx);
    return [
      { id: 'members-tiers', title: 'Members by category', rows: tierCSV(ctx) },
      { id: 'members-roll', title: 'Members over time', rows: rollCSV(ctx) },
      { id: 'members-age', title: 'Age mix', rows: ageCSV(ageData(ctx)) },
      { id: 'members-renewal', title: 'Renewal progress', rows: renewalCSV(rn) },
      { id: 'members-quiet', title: 'Members going quiet', rows: quietCSV(quietRows(ctx)) }
    ];
  }
  function facts(ctx) {
    const t = tierData(ctx), ch = rollChange(ctx), out = [];
    if (ch != null && ch !== 0) out.push({ text: 'The roll is ' + (ch > 0 ? 'up ' : 'down ') + Math.abs(ch) + ' since ' + H.monthLabel(ctx.rows[0].key, true) + ', at ' + t.ms.length + ' members.', where: 'Members' });
    else if (t.joined.length) out.push({ text: t.joined.length + ' new ' + plural(t.joined.length, 'member') + ' joined in this period, bringing the roll to ' + t.ms.length + '.', where: 'Members' });
    return out;
  }
  function attention(ctx) {
    const q = quietRows(ctx), rn = renewalData(ctx), out = [];
    if (rn && rn.pending.length) out.push({ n: rn.pending.length, text: plural(rn.pending.length, 'member has', 'members have') + ' not renewed for ' + rn.rn.SEASON, label: 'See list', drill: 'renewal', sec: 'members' });
    if (q.quiet.length) out.push({ n: q.quiet.length, text: plural(q.quiet.length, 'member has', 'members have') + ' had no activity in ' + QUIET_DAYS + ' days', label: 'See list', drill: 'quiet', sec: 'members' });
    return out;
  }

  Club.reports.addSection({
    id: 'members', label: 'Members', order: 30,
    collections: ['members', 'membershipTiers', 'teeTimes', 'diningReservations', 'events', 'lessons', 'programs', 'cartOrders', 'takeoutOrders', 'charges', 'renewals'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, facts: facts, attention: attention, ideas: ideas,
    drills: { age: ageDrill, quiet: quietDrill, renewal: renewalDrill },
    data: { tiers: tierData, age: ageData, quiet: quietRows, renewal: renewalData }
  });
})();
