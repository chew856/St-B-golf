/* Reports section: Growth. Registers through Club.reports.addSection (js/modules/reports.js).
   The applications pipeline (main chart), public golfers worth inviting, members' guests and how people found the club.
   Fields it reads that other files record: publicPlayers.marketingOptIn / marketingOptInAt / heardFrom (js/public/me.js)
   and applications.heardFrom (js/public/join.js, js/modules/members.js; Club.membership.heardFrom maps older answers).
   A one-time, versioned demo migration (bottom of this file) fills in sample data the seeds do not have. */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, Dt = Club.date, esc = U.esc, H = Club.reports.h, DR = Club.drill;
  const all = H.all, num = H.num, sum = H.sum, plural = H.plural, DEAD = H.DEAD;

  /* ---------------- Helpers ---------------- */
  function today() { return Dt.today(); }
  function M() { return Club.membership || { AGE_RULES: {}, ageOn: function () { return null; }, ageProblem: function () { return ''; }, heardFrom: function (r) { return r && r.heardFrom || ''; }, HEARD_FROM: [] }; }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function mName(m) { return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function memLink(m) { return m ? '<a class="primary-cell" href="#/members/' + esc(m.id) + '">' + esc(mName(m)) + '</a>' : '<span class="muted">Former member</span>'; }
  function appLink(a, label) { return '<a href="#/members/applications/' + esc(a.id) + '">' + esc(label || a.name || 'Application') + '</a>'; }
  function localDay(iso) { if (!iso) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const d = new Date(iso); return isNaN(d) ? '' : S.iso(d); }
  function lower(s) { return String(s || '').trim().toLowerCase(); }
  function digits(s) { let d = String(s || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length >= 7 ? d : ''; }
  function nameKey(s) { return lower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim(); }
  function money0(v) { return F.money0(v); }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  /** A tee time that has been played: earlier days, or today once the group has checked in. */
  function played(t) { const T = today(); return !!t.date && t.date <= T && !DEAD[t.status] && t.status !== 'cancelled' && (t.date < T || t.status === 'completed' || t.status === 'on-course' || t.status === 'checked-in'); }
  /* Golf at St. Boniface runs April to October; the course is closed November to March. */
  function inSeason(iso) { const mo = +String(iso).slice(5, 7); return mo >= 4 && mo <= 10; }
  function seasonDays(from, to) {
    if (!from || from >= to) return 0;
    let n = 0;
    for (let d = Dt.addDays(from, 1); d <= to; d = Dt.addDays(d, 1)) if (inSeason(d)) n++;
    return n;
  }
  function inR(ctx) { return H.inRange(ctx); }
  function RN() { return Club.billing && Club.billing.renewal ? Club.billing.renewal : null; }
  /** Computations are shared across the section within one render. */
  function memoed(ctx, k, fn) { return H.memo(ctx, 'growth-' + k, function () { return fn(ctx); }); }
  /** Inside a drawer, a golfer's name opens their own details (closing the list first). */
  function golferWire(api, ctx, open) {
    U.on(api.el, 'click', '[data-rg-golfer]', function (e, b) {
      const id = b.dataset.rgGolfer;
      api.close();
      setTimeout(function () { open(golferDetail(id, ctx), true); }, 200);
    });
  }

  /* =====================================================================
     Public golfers to invite
     ===================================================================== */
  /* =====================================================================
     4. Public golfers to invite
     ===================================================================== */
  /* Score: 10 points for each round in the period, plus up to 30 for a recent visit (3 fewer for each golf-season
     week since the last round, so the winter break does not count against anyone). */
  function recencyPoints(last) { if (!last) return 0; return Math.max(0, 30 - 3 * Math.floor(seasonDays(last, today()) / 7)); }
  function golferData(ctx) {
    return memoed(ctx, 'golfers', golferData_);
  }
  function golferData_(ctx) {
    const inPeriod = inR(ctx);
    const apps = all('applications'), members = all('members'), pays = all('publicPayments');
    const rounds = {};
    all('teeTimes').forEach(function (t) {
      if (!played(t)) return;
      const seen = {};
      (t.players || []).forEach(function (p) { if (p && p.publicPlayerId && !p.publicGuest && !seen[p.publicPlayerId]) { seen[p.publicPlayerId] = 1; (rounds[p.publicPlayerId] = rounds[p.publicPlayerId] || []).push(t); } });
    });
    return all('publicPlayers').map(function (p) {
      const rs = (rounds[p.id] || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
      const inP = rs.filter(function (t) { return inPeriod(t.date); });
      const last = rs.length ? rs[0].date : null;
      const rc = Club.receipts ? Club.receipts.forPublic(p.id) : [];
      let spend = sum(rc.filter(function (r) { return inPeriod(r.date); }), function (r) { return (r.kind === 'credit' ? -1 : 1) * num(r.total); });
      pays.forEach(function (x) { if (x.publicPlayerId === p.id && x.status === 'paid' && inPeriod(x.date) && !(Club.receipts && Club.receipts.forRef('public', x.id).length)) spend += num(x.amount); });
      const email = lower(p.email);
      const app = apps.filter(function (a) { return a.publicPlayerId === p.id || (email && lower(a.email) === email); }).sort(function (a, b) { return String(b.submittedOn).localeCompare(String(a.submittedOn)); })[0] || null;
      const member = email ? members.filter(function (m) { return lower(m.email) === email && m.status !== 'resigned'; })[0] || null : null;
      const appOpen = app && app.stage !== 'Approved' && app.stage !== 'Declined';
      const group = member || (app && app.stage === 'Approved') ? 'member' : appOpen ? 'applied' : 'invite';
      return { p: p, rounds: rs, inP: inP.length, last: last, spend: spend, app: app, member: member, group: group, score: inP.length * 10 + recencyPoints(last) };
    }).sort(function (a, b) { return b.score - a.score || (b.last || '').localeCompare(a.last || '') || pName(a.p).localeCompare(pName(b.p)); });
  }
  const GROUP_LABEL = { invite: 'To invite', applied: 'Open application', member: 'Already a member' };
  function pName(p) { return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Public golfer'; }
  function appStatus(g) { return g.member ? 'Member' : g.app ? (g.app.stage === 'Declined' ? 'Declined before' : g.app.stage === 'Approved' ? 'Approved' : 'Applied, ' + String(g.app.stage).toLowerCase()) : 'Not applied'; }
  function optText(p) { return p.marketingOptIn ? 'Opted in' + (p.marketingOptInAt ? ' ' + F.dateShort(localDay(p.marketingOptInAt)) : '') : 'Not opted in'; }
  function golferCSV(list) {
    return [['Name', 'Group', 'Score', 'Rounds in period', 'Rounds on file', 'Last visit', 'Spend in period', 'Marketing email', 'Opted in on', 'Heard about us', 'Application', 'Email', 'Phone', 'Postal code', 'Account created']].concat(list.map(function (g) {
      return [pName(g.p), GROUP_LABEL[g.group], g.score, g.inP, g.rounds.length, g.last || '', g.spend.toFixed(2), g.p.marketingOptIn ? 'Yes' : 'No', g.p.marketingOptIn && g.p.marketingOptInAt ? localDay(g.p.marketingOptInAt) : '', M().heardFrom(g.p) || '', appStatus(g), g.p.email || '', g.p.phone || '', g.p.postalCode || '', localDay(g.p.createdAt)];
    }));
  }
  function golferRow(g) {
    return ['<button type="button" class="rg-link primary-cell" data-rg-golfer="' + esc(g.p.id) + '">' + esc(pName(g.p)) + '</button>' +
      '<div class="dd-sub">' + esc((g.last ? 'Last ' + F.dateShort(g.last) : 'No rounds yet') + ' · ' + (g.p.marketingOptIn ? 'Email OK' : 'No email consent')) + '</div>' +
      (g.app ? '<div class="dd-sub">' + appLink(g.app, appStatus(g)) + '</div>' : g.member ? '<div class="dd-sub"><a href="#/members/' + esc(g.member.id) + '">Member ' + esc(g.member.memberNo) + '</a></div>' : ''),
      String(g.inP), esc(money0(g.spend)), String(g.score)];
  }
  function golfersDrill(ctx) {
    const list = golferData(ctx);
    const cols = [{ label: 'Golfer' }, { label: 'Rounds', num: true }, { label: 'Spend', num: true }, { label: 'Score', num: true }];
    let body = DR.kpis([
      { label: 'To invite', value: String(list.filter(function (g) { return g.group === 'invite'; }).length), sub: 'Not applied or declined before' },
      { label: 'Open application', value: String(list.filter(function (g) { return g.group === 'applied'; }).length), sub: 'Already in the pipeline' },
      { label: 'Already members', value: String(list.filter(function (g) { return g.group === 'member'; }).length), sub: 'Same email as a member' },
      { label: 'Opted in to email', value: String(list.filter(function (g) { return g.p.marketingOptIn; }).length), sub: 'Of ' + list.length + ' accounts' }
    ]);
    ['invite', 'applied', 'member'].forEach(function (k) {
      const l = list.filter(function (g) { return g.group === k; });
      if (l.length || k === 'invite') body += DR.sec(GROUP_LABEL[k], l.length + ' ' + plural(l.length, 'golfer'), l.length ? DR.table(cols, l.map(golferRow)) : DR.note('No one to invite yet.'));
    });
    body += DR.note('Select a name for their details. Score: 10 points for each round in this period, plus up to 30 for playing recently (3 fewer for each golf-season week since).');
    return { title: 'Public golfers', body: body, csv: golferCSV(list), csvId: 'growth-public-detail' };
  }
  /** One public golfer: the staff view of their account, including marketing consent and how they heard about the club. */
  function golferDetail(id, ctx) {
    const g = golferData(ctx).filter(function (x) { return x.p.id === id; })[0];
    if (!g) return { title: 'Public golfer', body: DR.empty('This account is no longer on file', '', 'alert'), csv: [] };
    const p = g.p;
    let body = DR.kpis([
      { label: 'Rounds', value: String(g.rounds.length), sub: g.inP + ' in this period' },
      { label: 'Last visit', value: g.last ? F.dateShort(g.last) : 'None', sub: g.last ? F.date(g.last) : 'No rounds on file' },
      { label: 'Spend', value: money0(g.spend), sub: 'In this period' },
      { label: 'Score', value: String(g.score), sub: GROUP_LABEL[g.group] }
    ]);
    const kv = [['Email', p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '<span class="muted">Not given</span>'], ['Phone', esc(p.phone || 'Not given')], ['Postal code', esc(p.postalCode || 'Not given')],
      ['Marketing email', p.marketingOptIn ? U.badge('Opted in', 'good') + (p.marketingOptInAt ? ' <span class="muted">since ' + esc(F.date(localDay(p.marketingOptInAt))) + '</span>' : '') : '<span class="muted">Not opted in</span>'],
      ['Heard about us', M().heardFrom(p) ? esc(M().heardFrom(p)) : '<span class="muted">Not given</span>'],
      ['Account created', p.createdAt ? esc(F.date(localDay(p.createdAt))) : '<span class="muted">Not recorded</span>'],
      ['Membership', g.member ? '<a href="#/members/' + esc(g.member.id) + '">' + esc(mName(g.member)) + ', member ' + esc(g.member.memberNo) + '</a>' : g.app ? appLink(g.app, appStatus(g) + ', ' + F.dateShort(g.app.submittedOn)) : '<span class="muted">Not applied</span>']];
    body += DR.sec('Account', '', '<dl class="rg-kv">' + kv.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>');
    body += DR.sec('Rounds on file', g.rounds.length ? g.rounds.length + ' ' + plural(g.rounds.length, 'round') : '', g.rounds.length ? DR.table([{ label: 'Date' }, { label: 'Time' }, { label: 'Holes', num: true }, { label: 'Players', num: true }],
      g.rounds.map(function (t) { return [esc(F.date(t.date)), esc(F.time(t.time)), String(t.holes || 18), String((t.players || []).filter(function (x) { return x.publicPlayerId === p.id; }).length)]; })) : DR.note('No rounds played yet.'));
    const csv = [['Field', 'Value'], ['Name', pName(p)], ['Email', p.email || ''], ['Phone', p.phone || ''], ['Postal code', p.postalCode || ''], ['Marketing email', p.marketingOptIn ? 'Yes' : 'No'], ['Opted in on', p.marketingOptIn && p.marketingOptInAt ? localDay(p.marketingOptInAt) : ''],
      ['Heard about us', M().heardFrom(p) || ''], ['Account created', localDay(p.createdAt)], ['Application', appStatus(g)], ['Score', g.score], [], ['Date', 'Time', 'Holes']].concat(g.rounds.map(function (t) { return [t.date, t.time, t.holes || 18]; }));
    return { title: pName(p), body: body, csv: csv, csvId: 'growth-public-' + p.id };
  }

  /* =====================================================================
     Member guests
     ===================================================================== */
  /* =====================================================================
     5. Member guests
     ===================================================================== */
  function guestData(ctx) {
    return memoed(ctx, 'guests', guestData_);
  }
  function guestData_(ctx) {
    const inPeriod = inR(ctx);
    const ids = {}, byEmail = {}, byPhone = {}, byName = {};
    function ident(p) {
      const e = lower(p.email), ph = digits(p.phone), n = nameKey(p.name);
      let g = (e && byEmail[e]) || (ph && byPhone[ph]) || null;
      if (!g && !e && !ph && n && byName[n] && byName[n].length === 1) g = byName[n][0];
      if (!g) { g = { key: e ? 'e:' + e : ph ? 'p:' + ph : 'n:' + n, name: p.name || 'Guest', email: '', phone: '', visits: [], hosts: {} }; ids[g.key] = g; if (n) (byName[n] = byName[n] || []).push(g); }
      if (e && !g.email) { g.email = p.email; byEmail[e] = g; }
      if (ph && !g.phone) { g.phone = p.phone; byPhone[ph] = g; }
      return g;
    }
    const tees = all('teeTimes').filter(function (t) { return played(t); }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    // Contact details first, so a guest seen once with an email and once by name alone is the same person.
    tees.forEach(function (t) { (t.players || []).forEach(function (p) { if (p && p.type === 'guest' && (p.email || p.phone)) ident(p); }); });
    const hostN = {};
    let visits = 0;
    tees.forEach(function (t) {
      (t.players || []).forEach(function (p) {
        if (!p || p.type !== 'guest') return;
        const g = ident(p);
        const hostId = p.hostId && S.find('members', p.hostId) ? p.hostId : ((t.players || []).filter(function (x) { return x && x.type === 'member' && x.memberId; })[0] || {}).memberId || null;
        g.visits.push({ date: t.date, hostId: hostId, inP: inPeriod(t.date) });
        if (!inPeriod(t.date)) return;
        visits++;
        if (hostId) { g.hosts[hostId] = (g.hosts[hostId] || 0) + 1; const h = hostN[hostId] = hostN[hostId] || { visits: 0, guests: {} }; h.visits++; h.guests[g.key] = 1; }
      });
    });
    const players = all('publicPlayers'), apps = all('applications'), members = all('members');
    const list = Object.keys(ids).map(function (k) { return ids[k]; }).filter(function (g) { return g.visits.some(function (v) { return v.inP; }); }).map(function (g) {
      const n = g.visits.filter(function (v) { return v.inP; }).length;
      const first = g.visits[0].date, last = g.visits[g.visits.length - 1].date;
      const e = lower(g.email), ph = digits(g.phone), nk = nameKey(g.name);
      function same(x, nm) { return (e && lower(x.email) === e) || (ph && digits(x.phone) === ph) || (!e && !ph && nk && nameKey(nm) === nk); }
      const pp = players.filter(function (x) { return same(x, pName(x)); })[0] || null;
      const app = apps.filter(function (a) { return same(a, a.name); }).sort(function (a, b) { return String(b.submittedOn).localeCompare(String(a.submittedOn)); })[0] || null;
      const mem = members.filter(function (m) { return (e && lower(m.email) === e) || (ph && digits(m.phone) === ph); })[0] || null;
      const later = { pp: pp && localDay(pp.createdAt) >= first ? pp : null, app: app && String(app.submittedOn) >= first ? app : null };
      return { g: g, n: n, first: first, last: last, pp: pp, app: app, mem: mem, later: later, converted: !!(later.pp || later.app), hosts: Object.keys(g.hosts).sort(function (a, b) { return g.hosts[b] - g.hosts[a]; }) };
    }).sort(function (a, b) { return b.n - a.n || b.last.localeCompare(a.last) || a.g.name.localeCompare(b.g.name); });
    const hosts = Object.keys(hostN).map(function (id) { return { m: S.find('members', id), id: id, visits: hostN[id].visits, guests: Object.keys(hostN[id].guests).length }; }).sort(function (a, b) { return b.visits - a.visits || b.guests - a.guests; });
    return { list: list, hosts: hosts, visits: visits, repeat: list.filter(function (x) { return x.n >= 2; }), converted: list.filter(function (x) { return x.converted; }) };
  }
  function nowText(x) { return [x.later.pp ? 'Public golfer since ' + F.dateShort(localDay(x.later.pp.createdAt)) : '', x.later.app ? 'Applied ' + F.dateShort(x.later.app.submittedOn) : '', x.mem ? 'Member' : ''].filter(Boolean).join(', '); }
  function guestCSV(d) {
    return [['Guest', 'Email', 'Phone', 'Visits in period', 'First visit', 'Last visit', 'Brought by', 'Public golfer account', 'Application', 'Member']].concat(d.list.map(function (x) {
      return [x.g.name, x.g.email, x.g.phone, x.n, x.first, x.last, x.hosts.map(function (id) { return mName(S.find('members', id)); }).join('; '), x.pp ? 'Yes, ' + localDay(x.pp.createdAt) : '', x.app ? x.app.stage + ', ' + x.app.submittedOn : '', x.mem ? x.mem.memberNo : ''];
    })).concat([[], ['Host', 'Member no', 'Guest visits', 'Different guests']]).concat(d.hosts.map(function (h) { return [mName(h.m), h.m ? h.m.memberNo : '', h.visits, h.guests]; }));
  }
  function guestsDrill(ctx) {
    const d = guestData(ctx);
    function hostsOf(x) { return x.hosts.slice(0, 2).map(function (id) { const m = S.find('members', id); return m ? '<a href="#/members/' + esc(id) + '">' + esc(mName(m)) + '</a>' : 'Former member'; }).join(', ') || '<span class="muted">Not recorded</span>'; }
    function contact(x) { return [x.g.email ? '<a href="mailto:' + esc(x.g.email) + '">' + esc(x.g.email) + '</a>' : '', x.g.phone ? esc(x.g.phone) : ''].filter(Boolean).join(' · ') || 'No contact on file'; }
    let body = DR.kpis([
      { label: 'Guest visits', value: String(d.visits), sub: d.list.length + ' different guests' },
      { label: 'Repeat guests', value: String(d.repeat.length), sub: 'Two visits or more' },
      { label: 'With contact', value: String(d.list.filter(function (x) { return x.g.email || x.g.phone; }).length), sub: 'Email or phone on file' },
      { label: 'Came back', value: String(d.converted.length), sub: 'Public golfer or applicant' }
    ]);
    body += DR.sec('Became public golfers or applied', d.converted.length ? String(d.converted.length) : '', d.converted.length ? DR.table([{ label: 'Guest' }, { label: 'Now' }, { label: 'Brought by' }],
      d.converted.map(function (x) {
        const now = [x.later.pp ? '<button type="button" class="rg-link" data-rg-golfer="' + esc(x.later.pp.id) + '">Public golfer</button>' : '', x.later.app ? appLink(x.later.app, 'Applied, ' + String(x.later.app.stage).toLowerCase()) : ''].filter(Boolean).join('<br>');
        return ['<span class="primary-cell">' + esc(x.g.name) + '</span><div class="dd-sub">First visit ' + esc(F.dateShort(x.first)) + '</div>', now, hostsOf(x)];
      })) : DR.note('No guest has gone on to create a public account or apply yet.'));
    const leads = d.list.filter(function (x) { return !x.mem && !(x.app && x.app.stage !== 'Declined'); }).filter(function (x) { return x.n >= 2 || x.g.email || x.g.phone; });
    body += DR.sec('Leads', leads.length + ' repeat guests or guests with contact details', leads.length ? DR.table([{ label: 'Guest' }, { label: 'Visits', num: true }, { label: 'Brought by' }],
      leads.map(function (x) { return ['<span class="primary-cell">' + esc(x.g.name) + '</span><div class="dd-sub">' + contact(x) + '</div><div class="dd-sub">Last visit ' + esc(F.dateShort(x.last)) + '</div>', String(x.n), hostsOf(x)]; })) : DR.note('No repeat guests or guests with contact details in this period.'));
    body += DR.sec('Hosts', d.hosts.length + ' members', d.hosts.length ? DR.table([{ label: 'Member' }, { label: 'Guest visits', num: true }, { label: 'Different guests', num: true }],
      d.hosts.map(function (h) { return [memLink(h.m), String(h.visits), String(h.guests)]; })) : DR.note('No member brought guests in this period.'));
    body += DR.note('Guests are matched by email, then phone, then name. Ask the host member before contacting a guest.');
    return { title: 'Member guests', body: body, csv: guestCSV(d), csvId: 'growth-guests-detail', go: 'teesheet', goLabel: 'Open tee sheet' };
  }

  /* =====================================================================
     How people found the club (heardFrom)
     ===================================================================== */
  /* =====================================================================
     6. How people found the club (heardFrom)
     ===================================================================== */
  function heardData(ctx) {
    return memoed(ctx, 'heard', heardData_);
  }
  function heardData_(ctx) {
    const inPeriod = inR(ctx), opts = M().HEARD_FROM || [];
    const rows = opts.map(function (o) { return { label: o, apps: [], pps: [] }; });
    const byLabel = {}; rows.forEach(function (r) { byLabel[r.label] = r; });
    const blank = { apps: 0, pps: 0 };
    all('applications').forEach(function (a) { if (!inPeriod(String(a.submittedOn || '').slice(0, 10))) return; const h = M().heardFrom(a); if (h && byLabel[h]) byLabel[h].apps.push(a); else blank.apps++; });
    all('publicPlayers').forEach(function (p) { if (!inPeriod(localDay(p.createdAt))) return; const h = M().heardFrom(p); if (h && byLabel[h]) byLabel[h].pps.push(p); else blank.pps++; });
    const total = sum(rows, function (r) { return r.apps.length + r.pps.length; });
    return { rows: rows, blank: blank, total: total, sorted: rows.slice().sort(function (a, b) { return (b.apps.length + b.pps.length) - (a.apps.length + a.pps.length); }) };
  }
  const HEARD_MIN = 3;   /* fewer answers than this reads as "not collected yet" */
  function heardCSV(d) {
    const rows = [['Answer', 'Membership applications', 'Public accounts', 'Total']].concat(d.sorted.map(function (r) { return [r.label, r.apps.length, r.pps.length, r.apps.length + r.pps.length]; }))
      .concat([['Not answered', d.blank.apps, d.blank.pps, d.blank.apps + d.blank.pps], [], ['Type', 'Name', 'Answer', 'Date']]);
    d.sorted.forEach(function (r) {
      r.apps.forEach(function (a) { rows.push(['Application', a.name, r.label, a.submittedOn]); });
      r.pps.forEach(function (p) { rows.push(['Public account', pName(p), r.label, localDay(p.createdAt)]); });
    });
    return rows;
  }
  function heardDrill(ctx, only) {
    const d = heardData(ctx);
    const rows = only ? d.rows.filter(function (r) { return r.label === only; }) : d.sorted.filter(function (r) { return r.apps.length + r.pps.length; });
    let body = only ? '' : DR.kpis([
      { label: 'Answers', value: String(d.total), sub: 'In this period' },
      { label: 'Top answer', value: d.total ? String(d.sorted[0].apps.length + d.sorted[0].pps.length) : '0', sub: d.total ? d.sorted[0].label : 'None yet' },
      { label: 'Applications', value: String(sum(d.rows, function (r) { return r.apps.length; })), sub: d.blank.apps + ' did not answer' },
      { label: 'Public accounts', value: String(sum(d.rows, function (r) { return r.pps.length; })), sub: d.blank.pps + ' did not answer' }
    ]);
    rows.forEach(function (r) {
      const list = r.apps.map(function (a) { return { kind: 'Membership application', html: appLink(a, a.name), date: String(a.submittedOn || '').slice(0, 10) }; })
        .concat(r.pps.map(function (p) { return { kind: 'Public account', html: '<button type="button" class="rg-link" data-rg-golfer="' + esc(p.id) + '">' + esc(pName(p)) + '</button>', date: localDay(p.createdAt) }; }))
        .sort(function (a, b) { return b.date.localeCompare(a.date); });
      body += DR.sec(r.label, list.length + ' ' + plural(list.length, 'answer'), list.length ? DR.table([{ label: 'Name' }, { label: 'From' }, { label: 'Date', num: true }],
        list.map(function (x) { return [x.html, esc(x.kind), x.date ? esc(F.dateShort(x.date)) : '-']; })) : DR.note('No one has given this answer in this period.'));
    });
    if (!rows.length) body += DR.empty('No answers yet', 'Answers appear as applications and public accounts come in.', 'members');
    return { title: only ? only : 'How people found the club', body: body, csv: heardCSV(d), csvId: 'growth-heard-detail' };
  }

  /* =====================================================================
     Applications pipeline (js/modules/members.js keeps the stages)
     ===================================================================== */
  const STAGES = ['Received', 'Interview', 'Board review', 'Approved', 'Declined'];
  const OPEN = { Received: 1, Interview: 1, 'Board review': 1 };
  function appData(ctx) {
    return memoed(ctx, 'apps', function () {
      const inPeriod = inR(ctx), apps = all('applications');
      const open = apps.filter(function (a) { return OPEN[a.stage]; });
      const closedIn = apps.filter(function (a) { return !OPEN[a.stage] && inPeriod(String(a.submittedOn || '').slice(0, 10)); });
      const counts = STAGES.map(function (s) { return { stage: s, n: (OPEN[s] ? open : closedIn).filter(function (a) { return a.stage === s; }).length }; });
      const submittedIn = apps.filter(function (a) { return inPeriod(String(a.submittedOn || '').slice(0, 10)); });
      const waits = open.map(function (a) { return a.submittedOn ? Math.round((F.toDate(today()) - F.toDate(String(a.submittedOn).slice(0, 10))) / 86400000) : null; }).filter(function (v) { return v != null; });
      return { apps: apps, open: open, closedIn: closedIn, counts: counts, submittedIn: submittedIn, avgWait: waits.length ? Math.round(sum(waits, function (v) { return v; }) / waits.length) : null,
        approved: closedIn.filter(function (a) { return a.stage === 'Approved'; }).length, declined: closedIn.filter(function (a) { return a.stage === 'Declined'; }).length };
    });
  }
  function appCSV(ctx) {
    const d = appData(ctx);
    return [['Stage', 'Applications']].concat(d.counts.map(function (c) { return [c.stage, c.n]; }))
      .concat([[], ['Name', 'Category applied for', 'Stage', 'Submitted', 'Heard about us', 'Email']]).concat(d.open.concat(d.closedIn).sort(function (a, b) { return String(b.submittedOn).localeCompare(String(a.submittedOn)); }).map(function (a) { const t = S.find('membershipTiers', a.tierId || a.tier); return [a.name, t ? t.name : (a.tier || ''), a.stage, String(a.submittedOn || '').slice(0, 10), M().heardFrom(a) || '', a.email || '']; }));
  }
  function appsDrill(ctx) {
    const d = appData(ctx);
    let body = DR.kpis([
      { label: 'Open today', value: String(d.open.length), sub: d.avgWait != null ? 'Waiting ' + d.avgWait + ' days on average' : '' },
      { label: 'Submitted in period', value: String(d.submittedIn.length), sub: ctx.line },
      { label: 'Approved', value: String(d.approved), sub: 'Submitted in this period' },
      { label: 'Declined', value: String(d.declined), sub: 'Submitted in this period' }
    ]);
    const list = d.open.concat(d.closedIn).sort(function (a, b) { return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || String(a.submittedOn).localeCompare(String(b.submittedOn)); });
    body += DR.sec('Applications', list.length + ' ' + plural(list.length, 'application'), list.length ? DR.table([{ label: 'Applicant' }, { label: 'Stage' }, { label: 'Submitted', num: true }, { label: 'Waiting', num: true }],
      list.map(function (a) { const t = S.find('membershipTiers', a.tierId || a.tier), wait = a.submittedOn && OPEN[a.stage] ? Math.round((F.toDate(today()) - F.toDate(String(a.submittedOn).slice(0, 10))) / 86400000) : null;
        return [appLink(a, a.name) + '<div class="dd-sub">' + esc((t ? t.name : '') + (M().heardFrom(a) ? (t ? ' · ' : '') + 'Heard: ' + M().heardFrom(a) : '')) + '</div>', U.badge(a.stage, OPEN[a.stage] ? 'info' : a.stage === 'Approved' ? 'good' : 'plain'), esc(a.submittedOn ? F.dateShort(String(a.submittedOn).slice(0, 10)) : '-'), wait != null ? wait + ' days' : '<span class="muted">-</span>']; })) : DR.note('No applications are open, and none were decided in this period.'));
    body += DR.note('Open applications are shown as of today whatever the period. Approved and declined count applications submitted in the period.');
    return { title: 'Applications', body: body, csv: appCSV(ctx), csvId: 'growth-applications-detail', go: 'members/applications', goLabel: 'Open applications' };
  }

  /* ---------------- The section ---------------- */
  function kpis(ctx) {
    const list = golferData(ctx), g = guestData(ctx), a = appData(ctx);
    const playedN = list.filter(function (x) { return x.inP; }).length, playedRounds = sum(list, function (x) { return x.inP; }), invite = list.filter(function (x) { return x.group === 'invite' && x.inP; });
    /* Changes on the period before, when the tee sheet covers all of it (public rounds and guests come from it). */
    const pc = H.coversPrev(ctx, ctx.ix.first.tee) ? H.prevCtx(ctx) : null;
    const prevPlayed = pc ? golferData(pc).filter(function (x) { return x.inP; }).length : null, prevVisits = pc ? guestData(pc).visits : null;
    return [
      { label: 'Public golfers who played', value: F.num(playedN), d: esc('of ' + list.length + ' public ' + plural(list.length, 'account') + ', ' + playedRounds + ' ' + plural(playedRounds, 'round')), chg: pc ? H.kpiChg(playedN - prevPlayed, 'num', H.prevWords(ctx)) : null, drill: 'golfers', aria: 'Public golfers who played: ' + playedN },
      { label: 'Worth inviting', value: F.num(invite.length), d: esc(invite.length ? invite.filter(function (x) { return x.p.marketingOptIn; }).length + ' agreed to club emails' : 'Played, not applied, not a member'), drill: 'golfers' },
      { label: 'Guest visits', value: F.num(g.visits), d: esc(g.repeat.length + ' repeat ' + plural(g.repeat.length, 'guest') + ', ' + g.converted.length + ' came back alone'), chg: pc ? (prevVisits ? H.pctVs(g.visits, prevVisits, ctx) : H.kpiChg(g.visits, 'num', H.prevWords(ctx))) : null, drill: 'guests' },
      { label: 'Open applications', value: F.num(a.open.length), d: esc(a.avgWait != null ? 'waiting ' + a.avgWait + ' days on average' : 'none waiting'), drill: 'apps' }
    ];
  }
  function main(ctx) {
    const d = appData(ctx);
    const openBits = d.counts.filter(function (c) { return OPEN[c.stage] && c.n; }).map(function (c) { return c.n + ' ' + (c.stage === 'Board review' ? 'at board review' : c.stage === 'Interview' ? 'at interview' : 'received'); });
    const take = (d.open.length ? d.open.length + ' ' + plural(d.open.length, 'application is', 'applications are') + ' open today: ' + H.joinAnd(openBits) + '. ' : 'No applications are open today. ') +
      (d.approved || d.declined ? d.approved + ' ' + (d.approved === 1 ? 'was' : 'were') + ' approved and ' + d.declined + ' declined among those submitted in this period.' : 'None submitted in this period have been decided yet.');
    return { id: 'growth-apps', title: 'Applications pipeline', take: take,
      body: Club.charts.columns({ labels: STAGES, values: d.counts.map(function (c) { return c.n; }), tipName: 'Applications', ariaLabel: 'Applications by stage', height: 220, whole: true, tipTitles: STAGES.map(function (s) { return s + (OPEN[s] ? ' (open today)' : ' (submitted in period)'); }) }),
      desc: appsDesc(d), foot: 'Open stages are as of today; approved and declined are applications submitted in this period.', csvId: 'growth-applications', drill: 'apps', drillLabel: 'See the applications' };
  }
  function panels(ctx) {
    const list = golferData(ctx), g = guestData(ctx), hd = heardData(ctx);
    const invite = list.filter(function (x) { return x.group === 'invite' && x.inP; });
    const applied = list.filter(function (x) { return x.group === 'applied'; }).length, mem = list.filter(function (x) { return x.group === 'member'; }).length;
    const opt = invite.filter(function (x) { return x.p.marketingOptIn; }).length;
    const p1 = { id: 'growth-public', title: 'Public golfers to invite', take: !list.length ? 'Golfers who create an account on the public booking site appear here.' : !invite.length ? 'No public golfer played in this period without having applied or joined.' : invite.length + ' public ' + plural(invite.length, 'golfer') + ' played in this period and ' + (invite.length === 1 ? 'has' : 'have') + ' not applied; ' + opt + ' agreed to club emails. ' + pName(invite[0].p) + ' leads with ' + invite[0].inP + ' ' + plural(invite[0].inP, 'round') + '.',
      body: invite.length ? Club.charts.ranked(invite.slice(0, 5).map(function (x) { return { label: pName(x.p), sub: x.inP + ' ' + plural(x.inP, 'round') + ', last ' + F.dateShort(x.last) + ', ' + money0(x.spend) + ' spent. ' + (x.p.marketingOptIn ? 'Email OK' : 'No email consent') + (x.app && x.app.stage === 'Declined' ? '. Declined before' : ''), value: x.score, html: 'Score ' + x.score, attrs: 'data-drill="golfer" data-arg="' + esc(x.p.id) + '" aria-label="' + esc(pName(x.p) + ', score ' + x.score + '. View their details') + '"' }; }), { noShare: true }) : '',
      desc: publicDesc(list, invite), csvId: 'growth-public', drill: 'golfers', drillLabel: 'See all ' + list.length };
    const p2 = { id: 'growth-guests', title: 'Member guests', take: !g.visits ? 'Guests members bring to the tee sheet appear here.' : g.visits + ' guest ' + plural(g.visits, 'visit') + ' from ' + g.list.length + ' different ' + plural(g.list.length, 'guest') + '. ' + (g.hosts[0] && g.hosts[0].m ? mName(g.hosts[0].m) + ' brought the most, ' + g.hosts[0].visits + ' ' + plural(g.hosts[0].visits, 'visit') + '.' : ''),
      body: g.hosts.length ? Club.charts.ranked(g.hosts.slice(0, 5).map(function (h) { return { label: h.m ? mName(h.m) : 'Former member', sub: h.guests + ' different ' + plural(h.guests, 'guest'), value: h.visits, html: h.visits + ' ' + plural(h.visits, 'visit'), attrs: h.m ? 'data-href="members/' + esc(h.id) + '" aria-label="' + esc(mName(h.m) + ', ' + h.visits + ' guest visits. Open their profile') + '"' : '' }; }), { total: g.visits }) : '',
      desc: guestsDesc(g), csvId: 'growth-guests', drill: 'guests', drillLabel: 'See the guest lead list' };
    const A = sum(hd.rows, function (r) { return r.apps.length; }), P = sum(hd.rows, function (r) { return r.pps.length; }), top = hd.sorted[0];
    const p3 = { id: 'growth-heard', title: 'How people found the club', take: hd.total < HEARD_MIN ? 'The application forms and public sign-up now ask how people heard about the club. ' + (hd.total ? hd.total + ' ' + plural(hd.total, 'answer') + ' so far.' : 'Answers build up here.') : '"' + top.label + '" is the most common answer, ' + (top.apps.length + top.pps.length) + ' of ' + hd.total + '. ' + A + ' ' + plural(A, 'answer came', 'answers came') + ' with membership applications and ' + P + ' with public accounts.',
      body: hd.total ? Club.charts.ranked(hd.sorted.filter(function (r) { return r.apps.length + r.pps.length; }).slice(0, 5).map(function (r) { const n = r.apps.length + r.pps.length; return { label: r.label, sub: r.apps.length + ' ' + plural(r.apps.length, 'application') + ', ' + r.pps.length + ' public ' + plural(r.pps.length, 'account'), value: n, attrs: 'data-drill="heard" data-arg="' + esc(r.label) + '" aria-label="' + esc(r.label + ': ' + n + ' answers. See who') + '"' }; }), { total: hd.total }) : '',
      desc: heardDesc(hd), csvId: 'growth-heard', drill: 'heard', drillLabel: 'See all answers' };
    const p4 = { id: 'growth-converted', title: 'Guests who came back on their own', take: !g.visits ? 'Guests who later create a public account or apply appear here.' : g.converted.length ? g.converted.length + ' ' + plural(g.converted.length, 'guest') + ' went on to create a public golfer account or apply after a visit with a member.' : 'No guest has gone on to create a public account or apply yet.',
      body: g.converted.length ? Club.charts.ranked(g.converted.slice(0, 5).map(function (x) { return { label: x.g.name, sub: nowText(x) + (x.hosts.length && S.find('members', x.hosts[0]) ? '. Brought by ' + mName(S.find('members', x.hosts[0])) : ''), value: x.n, html: x.n + ' ' + plural(x.n, 'visit'), attrs: x.later.pp ? 'data-drill="golfer" data-arg="' + esc(x.later.pp.id) + '" aria-label="' + esc(x.g.name + '. View their public account') + '"' : '' }; }), { bare: true }) : '',
      desc: cameBackDesc(g), csvId: 'growth-guests', drill: 'guests', drillLabel: 'See the guest lead list' };
    return [p1, p2, p3, p4];
  }
  /* ---------------- Descriptions and ideas ---------------- */
  function tierFor(a) { const k = a.proposedTierId || a.tierId || a.tier; return S.find('membershipTiers', k) || all('membershipTiers').filter(function (t) { return lower(t.name) === lower(k); })[0] || null; }
  /** The lowest-dues category with no age limit: what a new adult member would most likely start at. */
  function adultTier() { const AR = M().AGE_RULES || {}; return all('membershipTiers').filter(function (t) { return !AR[t.id] && num(t.annualDues) > 0; }).sort(function (a, b) { return num(a.annualDues) - num(b.annualDues); })[0] || null; }
  function guestFee() { const st = S.getObj('teeSheetSettings', {}) || {}; return st.guestFee != null && st.guestFee !== '' && !isNaN(+st.guestFee) && +st.guestFee > 0 ? +st.guestFee : (Club.teeRules && Club.teeRules.RATES ? Club.teeRules.RATES.weekday : null); }
  function openDues(d) { return sum(d.open, function (a) { const t = tierFor(a); return t ? num(t.annualDues) : 0; }); }
  function appsDesc(d) {
    const waits = d.open.map(function (a) { return a.submittedOn ? Math.round((F.toDate(today()) - F.toDate(String(a.submittedOn).slice(0, 10))) / 86400000) : null; }).filter(function (v) { return v != null; });
    const dues = openDues(d);
    return H.sents(['Columns count applications by stage: the open stages as of today, and approved or declined for those submitted in this period.',
      d.open.length && waits.length ? 'The ' + d.open.length + ' open ' + plural(d.open.length, 'one has', 'ones have') + ' waited ' + d.avgWait + ' days on average, the longest ' + Math.max.apply(null, waits) + ' days.' : 'No application is waiting today.',
      dues ? 'If approved at the categories applied for, they would add ' + money0(dues) + ' a year in dues, so a quick decision brings that money in sooner.' : 'New applications appear here as they come in from the public site and the front desk.']);
  }
  function publicDesc(list, invite) {
    if (!invite.length) return H.sents(['Rows rank public golfers who played in this period and have not applied, by how often and how recently they played.', list.length ? 'No one fits that in this period; choose a longer one to see more.' : 'Golfers appear here once they create an account on the public booking site.']);
    const reg = invite.filter(function (x) { return x.inP >= 2; });
    return H.sents(['Rows rank public golfers who played in this period and have not applied, by how often and how recently they played.',
      reg.length + ' of them played two rounds or more, and together the ' + invite.length + ' spent ' + money0(sum(invite, function (x) { return x.spend; })) + '.',
      'They already know the course and pay to play it, which makes them the warmest membership prospects; email only those who opted in.']);
  }
  function guestsDesc(g) {
    if (!g.visits) return H.sents(['Rows rank members by the guests they brought to the tee sheet.', 'No guest visits were recorded in this period.']);
    const fee = guestFee();
    return H.sents(['Rows rank members by the guest visits they hosted in this period.', 'Of ' + g.list.length + ' different guests, ' + g.repeat.length + ' came back two or more times.',
      fee ? 'At the tee sheet\'s ' + money0(fee) + ' guest rate, these visits are worth about ' + money0(g.visits * fee) + ' in green fees.' : '',
      'Members who host often are the club\'s best recruiters.']);
  }
  function heardDesc(hd) {
    if (hd.total < HEARD_MIN) return H.sents(['Rows count answers to "How did you hear about us?" on applications and public sign-ups.', 'Only ' + hd.total + ' ' + plural(hd.total, 'answer') + ' so far, too few to steer marketing; the count grows as people sign up.']);
    const s2 = hd.sorted.filter(function (r) { return r.apps.length + r.pps.length; }).slice(0, 2), n2 = sum(s2, function (r) { return r.apps.length + r.pps.length; }), blank = hd.blank.apps + hd.blank.pps;
    return H.sents(['Rows count answers to "How did you hear about us?" on applications and public sign-ups in this period.',
      s2.length === 2 ? 'The top two, "' + s2[0].label + '" and "' + s2[1].label + '", account for ' + pct(n2, hd.total) + '% of answers.' : '',
      blank ? blank + ' ' + plural(blank, 'person', 'people') + ' skipped the question.' : '', 'Put marketing time where the answers point.']);
  }
  function cameBackDesc(g) {
    const contact = g.list.filter(function (x) { return !x.converted && !x.mem && (x.g.email || x.g.phone); }).length;
    return H.sents(['These are guests who created a public golfer account or applied after playing with a member.',
      g.visits ? g.converted.length + ' of ' + g.list.length + ' guests in this period did' + (contact ? ', and ' + contact + ' more ' + (contact === 1 ? 'has' : 'have') + ' contact details on file.' : '.') : 'No guest visits were recorded in this period.',
      'A guest who comes back on their own is a new customer the club did not have to find.']);
  }
  function ideas(ctx) {
    const out = [], list = golferData(ctx), g = guestData(ctx), a = appData(ctx), hd = heardData(ctx), adult = adultTier(), fee = guestFee();
    const opted = list.filter(function (x) { return x.group === 'invite' && x.inP && x.p.marketingOptIn; });
    if (opted.length && adult) out.push({ title: 'Invite regular public golfers to join', text: opted.length + ' public ' + plural(opted.length, 'golfer') + ' played here in this period, ' + (opted.length === 1 ? 'has' : 'have') + ' not applied and agreed to club emails' + (opted[0].inP > 1 ? ', led by ' + pName(opted[0].p) + ' with ' + opted[0].inP + ' rounds' : '') + '. An invitation to an open house or a round with a member costs little; one of them joining as ' + adult.name + ' would add ' + money0(num(adult.annualDues)) + ' a year.',
      assume: 'Assumes one new member at ' + adult.name + ' dues, the lowest-dues adult category. No conversion rate is on file, so this is one person, not a percentage.', amount: num(adult.annualDues), per: 'a year', year: num(adult.annualDues) });
    const dues = openDues(a);
    if (a.open.length && dues) out.push({ title: 'Decide the open applications', text: a.open.length + ' membership ' + plural(a.open.length, 'application has', 'applications have') + ' waited ' + a.avgWait + ' days on average. If approved at the categories applied for, they are worth ' + money0(dues) + ' a year in dues; moving them to interview and board review sooner brings that money in sooner.',
      assume: 'Assumes every open application is approved; the board decides, so treat this as the most it could be.', amount: dues, per: 'a year', year: dues });
    if (g.hosts.length && fee) {
      const n = Math.min(5, g.hosts.length), amt = n * fee;
      out.push({ title: 'Run a member-guest promotion', text: g.visits + ' guest ' + plural(g.visits, 'visit') + ' came through members in this period' + (g.hosts[0].m ? ', ' + g.hosts[0].visits + ' of them with ' + mName(g.hosts[0].m) : '') + '. If the ' + n + ' members who host most each brought one more guest a month, at the ' + money0(fee) + ' guest rate, that would add ' + money0(amt) + ' a month.',
        assume: 'Assumes ' + n + ' extra guest rounds a month at the tee sheet\'s guest rate, for the seven golf season months.', amount: amt, per: 'a month', year: amt * 7 });
    }
    const leads = g.list.filter(function (x) { return !x.mem && !(x.app && x.app.stage !== 'Declined') && !x.converted && x.n >= 2 && (x.g.email || x.g.phone); });
    if (leads.length && fee) out.push({ title: 'Turn repeat guests into public golfers', text: leads.length + ' repeat ' + plural(leads.length, 'guest has', 'guests have') + ' contact details on file and no account or application. With the host member\'s permission, an invitation to book on the public site at ' + money0(fee) + ' a round would add ' + money0(leads.length * fee) + ' a month if each played once a month.',
      assume: 'Assumes one round a month each at the tee sheet\'s guest rate, for the seven golf season months. Ask the host first.', amount: leads.length * fee, per: 'a month', year: leads.length * fee * 7 });
    if (hd.total < HEARD_MIN) out.push({ title: 'Ask everyone how they heard about the club', text: 'Only ' + hd.total + ' ' + plural(hd.total, 'person has', 'people have') + ' answered "How did you hear about us?" in this period, too few to show which marketing works. Asking at the front desk and when people book fills it in faster.',
      assume: 'No estimate: this is about knowing where to spend marketing time.', amount: null, year: 0 });
    return out;
  }
  function about(ctx) {
    const hd = heardData(ctx), list = golferData(ctx);
    const applied = list.filter(function (x) { return x.group === 'applied'; }).length, mem = list.filter(function (x) { return x.group === 'member'; }).length;
    return [
      'Invitation score: 10 points for each round in this period, plus up to 30 for playing recently (3 fewer for each golf-season week since the last round, so the winter break counts against no one). ' + (applied || mem ? (applied ? applied + ' with an open application' : '') + (applied && mem ? ' and ' : '') + (mem ? mem + ' already ' + plural(mem, 'a member', 'members') : '') + ' ' + (applied + mem === 1 ? 'is' : 'are') + ' listed separately in the details. ' : '') + 'Email only golfers who opted in.',
      'Guests are matched by email, then phone, then name. Contact details are on file only when the host member added them. A guest counts as having come back when their public account or application came after their first visit. Ask the host member before contacting a guest.',
      'How people found the club comes from applications received and public accounts created in this period. ' + (hd.blank.apps + hd.blank.pps) + ' did not answer: ' + hd.blank.apps + ' ' + plural(hd.blank.apps, 'application') + ' and ' + hd.blank.pps + ' ' + plural(hd.blank.pps, 'account') + '. The question is optional.',
      'Demo data: the public golfer accounts, their recent rounds, guest contact details and the "how did you hear" answers were added for the demo and are marked as such in the records.'
    ];
  }
  function csv(ctx) {
    return [
      { id: 'growth-applications', title: 'Applications pipeline', rows: appCSV(ctx) },
      { id: 'growth-public', title: 'Public golfers', rows: golferCSV(golferData(ctx)) },
      { id: 'growth-guests', title: 'Member guests', rows: guestCSV(guestData(ctx)) },
      { id: 'growth-heard', title: 'How people found the club', rows: heardCSV(heardData(ctx)) }
    ];
  }
  function attention(ctx) {
    const list = golferData(ctx), invite = list.filter(function (x) { return x.group === 'invite' && x.inP && x.p.marketingOptIn; });
    const a = appData(ctx), out = [];
    if (invite.length) out.push({ n: invite.length, text: 'regular public ' + plural(invite.length, 'golfer') + ' agreed to club emails and ' + (invite.length === 1 ? 'has' : 'have') + ' not applied', label: 'Invite', drill: 'golfers', sec: 'growth', ok: true });
    if (a.open.length) out.push({ n: a.open.length, text: plural(a.open.length, 'membership application is', 'membership applications are') + ' waiting' + (a.avgWait != null ? ', ' + a.avgWait + ' days on average' : ''), label: 'See applications', drill: 'apps', sec: 'growth' });
    return out;
  }
  function withWire(fn, asOf) { return function (ctx, arg) { const d = fn(ctx, arg); d.wire = golferWire; if (asOf) d.asOf = true; return d; }; }
  Club.reports.addSection({
    id: 'growth', label: 'Growth', order: 40,
    collections: ['members', 'membershipTiers', 'teeTimes', 'publicPlayers', 'publicPayments', 'receipts', 'applications'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, attention: attention, ideas: ideas,
    drills: { golfers: withWire(golfersDrill), golfer: withWire(function (ctx, id) { return golferDetail(id, ctx); }, true), guests: withWire(guestsDrill), heard: withWire(function (ctx, label) { return heardDrill(ctx, label || null); }), apps: appsDrill },
    data: { golfers: golferData, guests: guestData, heard: heardData, applications: appData }
  });

  /* =====================================================================
     Demo migration (version 1). DEMO DATA ONLY: the seeds have no public golfer history, no renewals, no guest
     contact details, no "how did you hear" answers, and give Junior and Young Adult members adult birth dates.
     Runs once per browser ($growthDemoVersion), is deterministic for a given day, never replaces a value someone
     entered, and records what it did in $growthDemo (with the original birth dates it replaced).
     ===================================================================== */
  const DEMO_V = 1, DEMO_TAG = 'growth-v1';
  function demoMigrate() {
    if ((S.getObj('growthDemoVersion', 0) || 0) >= DEMO_V) return;
    if (!all('members').length || !all('teeTimes').length || !Club.membership) return;
    const R = S.R, T = today(), Y = +T.slice(0, 4), log = { version: DEMO_V, at: new Date().toISOString(), dobOriginal: {}, renewals: 0, publicPlayers: [], teeTimes: [], guestContacts: 0, applications: [] };
    const AR = Club.membership.AGE_RULES || {};

    /* 1. DEMO: birth dates for Junior and Young Adult members. The seed gives every member a birth year from 1948 to
       1992, so these members are 30 or older in a youth category. Only those seeded values are replaced (the month and
       day are kept, so birthdays stay put); the originals are kept in $growthDemo.dobOriginal. */
    const YEARS = { tier_nonresident: [17, 16, 15, 13, 17, 14, 16], tier_junior: [23, 22, 21, 20, 23, 22, 21] };   /* years before this one */
    Object.keys(YEARS).forEach(function (tid) {
      all('members').filter(function (m) { return m.tierId === tid && m.status !== 'resigned'; }).sort(function (a, b) { return a.id.localeCompare(b.id); }).forEach(function (m, i) {
        const age = Club.membership.ageOn(m.dob), by = +String(m.dob || '').slice(0, 4);
        if (age == null || age < 30 || by < 1948 || by > 1992 || !Club.membership.ageProblem(tid, age) || !AR[tid]) return;
        const fresh = (Y - YEARS[tid][i % YEARS[tid].length]) + String(m.dob).slice(4);
        if (Club.membership.ageProblem(tid, Club.membership.ageOn(fresh))) return;
        log.dobOriginal[m.id] = m.dob;
        S.update('members', m.id, { dob: fresh });
      });
    });

    /* 2. DEMO: 2027 renewals for about one in five active members, made in the last three weeks, through the same
       path as the portal (instalments post as charges with receipts). Only when no one has renewed yet; the portal
       demo member (Dave Nerada) is left to renew himself. */
    const rn = RN();
    if (rn && !all('renewals').length) {
      R.reseed(2027);
      all('members').filter(function (m) { return m.status === 'active' && m.id !== S.DEMO_MEMBER && tierOf(m); }).sort(function (a, b) { return a.id.localeCompare(b.id); }).forEach(function (m) {
        if (!R.chance(0.2)) return;
        const t = tierOf(m), plan = R.chance(0.35) ? 'monthly' : 'full', on = Dt.fromToday(-R.int(0, 20)), total = Math.round(num(t.annualDues) * 100) / 100;
        S.insert('renewals', { memberId: m.id, season: rn.SEASON, tierId: t.id, plan: plan, total: total, schedule: rn.schedule(total, on, plan), status: 'renewed', createdAt: on + 'T15:00:00.000Z', demo: DEMO_TAG });
        log.renewals++;
      });
      try { rn.postDue(); } catch (e) { console.error('Demo renewal instalments failed', e); }
    }

    /* 3. DEMO: contact details for about half the repeat member guests, so they can be matched and followed up. Filled
       only where a guest has none; every visit by the same name gets the same details. */
    const teeArr = all('teeTimes').map(function (t) { return t; });
    function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }
    function demoEmail(name) { return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@example.com'; }
    const guestCount = {};
    teeArr.forEach(function (t) { if (played(t)) (t.players || []).forEach(function (p) { if (p && p.type === 'guest' && p.name) guestCount[p.name] = (guestCount[p.name] || 0) + 1; }); });
    const topGuests = Object.keys(guestCount).sort(function (a, b) { return guestCount[b] - guestCount[a] || a.localeCompare(b); }).slice(0, 2);
    let changedTee = false;
    teeArr.forEach(function (t, ti) {
      let changed = false;
      const pl = (t.players || []).map(function (p) {
        if (!p || p.type !== 'guest' || !p.name || p.email || p.phone) return p;
        const h = hash(p.name), conv = topGuests.indexOf(p.name) >= 0;
        if (!conv && (guestCount[p.name] < 2 || h % 4 >= 2)) return p;
        changed = true; log.guestContacts++;
        return Object.assign({}, p, (conv || h % 4 === 0) ? { email: demoEmail(p.name) } : { phone: '204-555-' + String(1000 + h % 9000) });
      });
      if (changed) { teeArr[ti] = Object.assign({}, t, { players: pl }); changedTee = true; }
    });
    if (changedTee) S.replace('teeTimes', teeArr);

    /* 4. DEMO: public golfer accounts with rounds in the last two weeks (free public tee times only) and their
       payments. No receipts are written (storage is tight; the demo accounts have no password to sign in with), so
       the report counts their spend from the payments. Three are tied to existing records: two guests above who came back on their own, and the seeded
       applicant Jonathan Ashcroft, who first played here as a member's guest. */
    R.reseed(3150);
    const settings = Object.assign({ interval: 9, first: '06:30', last: '19:00', cartFee: 28 }, S.getObj('teeSheetSettings', {}) || {});
    const blocks = all('teeBlocks');
    function toMin(t) { return H.toMin(t); }
    function hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
    function taken(date, time) { return all('teeTimes').some(function (t) { return t.date === date && t.time === time && t.status !== 'cancelled'; }); }
    function blocked(date, time) { const m = toMin(time); return blocks.some(function (b) { return b.date === date && m >= toMin(b.start) && m < toMin(b.end); }); }
    function freeSlot(date, publicOnly) {
      const step = Math.max(5, +settings.interval || 9), out = [];
      for (let m = toMin(settings.first); m <= toMin(settings.last); m += step) {
        const t = hm(m);
        if (taken(date, t) || blocked(date, t)) continue;
        if (publicOnly && !(Club.teeRules && Club.teeRules.publicSlot(date, t).ok)) continue;
        out.push(t);
      }
      return out.length ? out[R.int(0, out.length - 1)] : null;
    }
    let seq = 0;
    function addRound(pp, date) {
      const time = freeSlot(date, true); if (!time) return false;
      const cart = R.chance(0.5), name = pp.firstName + ' ' + pp.lastName;
      const fee = Club.teeRules ? Club.teeRules.greenFee(date, time, 18) : 66, cf = cart ? num(settings.cartFee) || 28 : 0;
      const id = 'tt_demo_g' + (++seq);
      if (S.find('teeTimes', id)) return false;
      S.insert('teeTimes', { id: id, date: date, time: time, holes: 18, players: [{ memberId: null, name: name, type: 'public', publicPlayerId: pp.id, cart: cart, paid: true }], status: 'completed', notes: '', eventId: null,
        startedAt: time, finishedAt: null, bookedBy: pp.id, source: 'public', paid: true, demo: DEMO_TAG });
      log.teeTimes.push(id);
      const paidOn = Dt.addDays(date, -R.int(0, 3)) < localDay(pp.createdAt) ? localDay(pp.createdAt) : Dt.addDays(date, -R.int(0, 3));
      const lines = [{ label: 'Green fee (18 holes)', amount: fee }].concat(cart ? [{ label: 'Cart', amount: cf }] : []);
      S.insert('publicPayments', { id: 'ppay_demo_g' + seq, publicPlayerId: pp.id, teeTimeId: id, date: paidOn, amount: fee + cf, tax: 0, brand: 'visa', last4: String(4000 + hash(pp.id) % 999).slice(-4),
        status: 'paid', refundedOn: null, description: 'Green fees', lines: lines, players: 1, holes: 18, teeDate: date, teeTime: time,
        createdAt: paidOn + 'T14:00:00.000Z', demo: DEMO_TAG });
      return true;
    }
    const pastDays = []; for (let k = 13; k >= 1; k--) pastDays.push(Dt.fromToday(-k));
    function playDays(after, n) {
      const pool = pastDays.filter(function (d) { return d > after; }), out = [];
      while (out.length < n && pool.length) out.push(pool.splice(R.int(0, pool.length - 1), 1)[0]);
      return out.sort();
    }
    const ashcroft = all('applications').filter(function (a) { return lower(a.email) === 'j.ashcroft@example.com'; })[0] || null;
    // Ashcroft's round as a member's guest, before he applied (a free slot, with an active member as host).
    if (ashcroft && !all('teeTimes').some(function (t) { return (t.players || []).some(function (p) { return lower(p.email) === 'j.ashcroft@example.com'; }); })) {
      const gd = Dt.addDays(String(ashcroft.submittedOn), -6) > Dt.fromToday(-13) ? Dt.addDays(String(ashcroft.submittedOn), -6) : Dt.fromToday(-10);
      const host = all('members').filter(function (m) { return m.status === 'active' && m.id !== S.DEMO_MEMBER; }).sort(function (a, b) { return a.id.localeCompare(b.id); })[7];
      const time = host ? freeSlot(gd, false) : null;
      if (host && time && !S.find('teeTimes', 'tt_demo_gg1')) {
        S.insert('teeTimes', { id: 'tt_demo_gg1', date: gd, time: time, holes: 18, status: 'completed', notes: '', eventId: null, startedAt: time, finishedAt: null, source: 'staff', demo: DEMO_TAG,
          players: [{ memberId: host.id, name: mName(host), type: 'member', cart: true, paid: false }, { memberId: null, name: 'Jonathan Ashcroft', type: 'guest', cart: true, paid: false, hostId: host.id, email: 'j.ashcroft@example.com', phone: ashcroft.phone || '' }] });
        log.teeTimes.push('tt_demo_gg1');
      }
    }
    const firstGuest = function (name) { const d = all('teeTimes').filter(function (t) { return played(t) && (t.players || []).some(function (p) { return p.type === 'guest' && p.name === name; }); }).map(function (t) { return t.date; }).sort()[0]; return d || Dt.fromToday(-14); };
    const PEOPLE = [
      ['Maya', 'Fontaine', 'R2H 1K4', 420, true, 'Search engine', 4],
      ['Daniel', 'Kowalski', 'R2M 3T9', 260, true, 'Friend or family', 3],
      ['Priya', 'Raman', 'R3T 2N2', 90, false, 'Social media', 2],
      ['Luc', 'Bergeron', 'R2J 0G6', 510, true, '', 5],
      ['Hannah', 'Friesen', 'R2N 4B1', 35, false, 'Wedding or event at the club', 1],
      ['Omar', 'Haddad', 'R3M 1X7', 180, true, 'Search engine', 2],
      ['Grace', 'Ostrowski', 'R2C 5P3', 20, true, 'Social media', 0],
      ['Tomas', 'Novak', 'R2V 2H8', 640, false, '', 1]
    ].map(function (r) { return { first: r[0], last: r[1], postal: r[2], created: Dt.fromToday(-r[3]), opt: r[4], heard: r[5], rounds: r[6] }; });
    if (ashcroft) PEOPLE.push({ first: 'Jonathan', last: 'Ashcroft', email: 'j.ashcroft@example.com', phone: ashcroft.phone, postal: 'R2H 2S5', created: Dt.fromToday(-12), opt: true, heard: 'Played here as a guest', rounds: 2 });
    topGuests.forEach(function (name, i) {
      const parts = name.split(' '), fg = firstGuest(name);
      PEOPLE.push({ first: parts[0], last: parts.slice(1).join(' '), email: demoEmail(name), postal: ['R2H 3C1', 'R3L 0V2'][i], created: Dt.addDays(fg, 1) > Dt.fromToday(-1) ? Dt.fromToday(-1) : Dt.addDays(fg, 1), opt: i === 0, heard: 'Played here as a guest', rounds: 1 });
    });
    PEOPLE.forEach(function (x, i) {
      const id = 'pp_demo_g' + String(i + 1).padStart(2, '0');
      const email = x.email || demoEmail(x.first + ' ' + x.last);
      if (S.find('publicPlayers', id) || all('publicPlayers').some(function (p) { return lower(p.email) === email; })) return;
      const created = x.created + 'T' + String(10 + i % 9).padStart(2, '0') + ':15:00.000Z';
      const pp = S.insert('publicPlayers', { id: id, firstName: x.first, lastName: x.last, email: email, phone: x.phone || '204-555-' + String(2100 + i * 37), postalCode: x.postal, createdAt: created, cards: [],
        marketingOptIn: !!x.opt, marketingOptInAt: x.opt ? created : null, heardFrom: x.heard || '', demo: DEMO_TAG });
      log.publicPlayers.push(id);
      playDays(localDay(created), x.rounds).forEach(function (d) { addRound(pp, d); });
    });
    // One public account belongs to someone who has since joined (same email as the newest member), to show the "already a member" group.
    const newest = all('members').filter(function (m) { return m.status === 'active' && m.email && m.id !== S.DEMO_MEMBER; }).sort(function (a, b) { return String(b.memberSince).localeCompare(String(a.memberSince)) || a.id.localeCompare(b.id); })[0];
    if (newest && !all('publicPlayers').some(function (p) { return lower(p.email) === lower(newest.email); }) && !S.find('publicPlayers', 'pp_demo_gm1')) {
      const since = String(newest.memberSince || T).slice(0, 10), made = Dt.addDays(since, -200) + 'T16:00:00.000Z';
      S.insert('publicPlayers', { id: 'pp_demo_gm1', firstName: newest.firstName, lastName: newest.lastName, email: newest.email, phone: newest.phone || '', postalCode: 'R2H 0B7', createdAt: made, cards: [],
        marketingOptIn: false, marketingOptInAt: null, heardFrom: 'A member of the club', demo: DEMO_TAG });
      log.publicPlayers.push('pp_demo_gm1');
    }

    /* 5. DEMO: "How did you hear about us?" answers on the seeded applications that have none. */
    const HEARD = { app_101: 'Played here as a guest', app_102: 'Social media', app_103: 'A member of the club', app_104: 'Friend or family', app_105: 'A member of the club', app_106: 'Search engine' };
    Object.keys(HEARD).forEach(function (id) {
      const a = S.find('applications', id);
      if (a && a.heardFrom == null && !a.heardAbout) { S.update('applications', id, { heardFrom: HEARD[id] }); log.applications.push(id); }
    });

    S.setObj('growthDemo', log);
    S.setObj('growthDemoVersion', DEMO_V);
  }
  try { demoMigrate(); } catch (e) { console.error('Growth demo data failed', e); }
})();
