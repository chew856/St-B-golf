/* Membership data: Club.membership (waiting list, age rules, "heard from" answers) and the handicap history and applications seeds.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/members.js, which reads these helpers from Club.shared.members. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Full categories: applications join a waiting list (stage WAIT) instead of the pipeline. The flag is the tier's
     `full` (true or false, set from the Applications page); until staff set it, Young Adult and Junior are full,
     as the club publishes. WAIT is not an open stage: it stays out of the board, the nav badge and the average wait. */
  const WAIT = 'Waiting list';
  const FULL_DEFAULT = { tier_junior: true, tier_nonresident: true };
  /* Ages from the club's 2025 Membership Handbook: Intermediate 19 to 39 and 60+ (ID required); Junior 18 and under by
     August 31 (checked on today's age here). The handbook gives no ages for Young Adult, so none is checked. */
  const AGE_RULES = {
    tier_eagle60: { min: 60, label: 'Ages 60 and over, ID required' },
    tier_eagleint: { min: 19, max: 39, label: 'Ages 19 to 39, ID required' },
    tier_birdieint: { min: 19, max: 39, label: 'Ages 19 to 39, ID required' },
    tier_nonresident: { max: 18, label: '18 and under by August 31' }
  };

  /* ---------------- Helpers ---------------- */
  function today() { return Club.date.today(); }
  function yearOf(iso) { return iso ? +String(iso).slice(0, 4) : null; }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ---------------- Categories, waiting lists and online applications ---------------- */
  /* Shared with the public Become a member page (js/public/join.js) as Club.membership. */
  function tierFull(t) { if (typeof t === 'string') t = S.find('membershipTiers', t); return !!t && (t.full != null ? !!t.full : !!FULL_DEFAULT[t.id]); }
  function setTierFull(id, full) { return S.update('membershipTiers', id, { full: !!full }); }
  /** Age in whole years on a date (default today), or null. */
  function ageOn(dob, on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ''))) return null;
    const d = String(dob), n = String(on || today());
    let a = +n.slice(0, 4) - +d.slice(0, 4);
    if (n.slice(5) < d.slice(5)) a--;
    return a;
  }
  /** Age rule problem for a category, or '' (no rule, or the age fits). */
  function ageProblem(tierId, age) {
    const r = AGE_RULES[tierId]; if (!r || age == null) return '';
    if ((r.min != null && age < r.min) || (r.max != null && age > r.max)) return r.label;
    return '';
  }
  /** A category's waiting list in order: date received, then the moment it was sent. */
  function waitQueue(tierId) {
    return S.where('applications', function (a) { return a.stage === WAIT && a.proposedTierId === tierId; })
      .sort(function (a, b) { return String(a.submittedOn).localeCompare(String(b.submittedOn)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)); });
  }
  function waitPosition(a) { return a && a.stage === WAIT ? waitQueue(a.proposedTierId).findIndex(function (x) { return x.id === a.id; }) + 1 : 0; }
  /* "How did you hear about us?": asked on the online application (js/public/join.js), public account sign-up
     (js/public/me.js) and the staff New application form. Stored as `heardFrom`, always one of these English values
     (the public site translates only the option text). Online applications before this list stored `heardAbout`
     with older wording; heardFrom(rec) maps those, so reports and the application detail read one field. */
  const HEARD_FROM = ['A member of the club', 'Friend or family', 'Played here as a guest', 'Played here as a public golfer', 'Search engine', 'Social media', 'Wedding or event at the club', 'Other'];
  const HEARD_LEGACY = { 'A member': 'A member of the club', 'Friends or family': 'Friend or family', 'Online search': 'Search engine' };
  function heardFrom(rec) {
    if (!rec) return '';
    if (HEARD_FROM.indexOf(rec.heardFrom) >= 0) return rec.heardFrom;
    /* heardFrom saved empty (staff chose "Not given") wins over an older heardAbout */
    const old = rec.heardFrom != null ? rec.heardFrom : rec.heardAbout || '';
    return HEARD_LEGACY[old] || (HEARD_FROM.indexOf(old) >= 0 ? old : old ? 'Other' : '');
  }
  function cleanHeard(v) { return HEARD_FROM.indexOf(v) >= 0 ? v : ''; }
  Club.membership = { WAIT_STAGE: WAIT, AGE_RULES: AGE_RULES, isFull: tierFull, setFull: setTierFull, ageOn: ageOn, ageProblem: ageProblem, waitQueue: waitQueue, waitPosition: waitPosition,
    HEARD_FROM: HEARD_FROM, heardFrom: heardFrom, cleanHeard: cleanHeard };

  /* ---------------- Seed data ---------------- */
  S.seed('handicapHistory', function () {
    R.reseed(1010);
    const out = [];
    S.all('members').forEach(function (m) {
      if (m.handicap == null) return;
      let v = m.handicap;
      for (let i = 0; i < 12; i++) {
        const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - i);
        out.push({ memberId: m.id, date: S.iso(d), index: Math.round(v * 10) / 10 });
        v = Math.max(-4, Math.min(36, v + (R.rand() - 0.4) * 1.4));
      }
    });
    return out;
  });

  S.seed('applications', function () {
    R.reseed(1011);
    const actives = S.all('members').filter(function (m) { return m.status === 'active'; }).map(function (m) { return m.id; });
    function sponsors() { const a = R.pick(actives); let b = R.pick(actives); if (b === a) b = actives[(actives.indexOf(a) + 3) % actives.length]; return [a, b]; }
    const rows = [
      { name: 'Jonathan Ashcroft', email: 'j.ashcroft@example.com', phone: '(555) 318-4402', tier: 'tier_full', stage: 'Received', ago: 4, notes: 'Moving back to Winnipeg from Calgary. Has played St. B as a guest for years.' },
      { name: 'Anika Desai', email: 'anika.desai@example.com', phone: '(555) 627-1190', tier: 'tier_junior', stage: 'Received', ago: 9, notes: 'Age 21, plays off 6.2. Young Adult category is currently full, so on the waiting list. Keen on the members\' league.' },
      { name: 'Gregory Holloway', email: 'gholloway@example.com', phone: '(555) 442-8031', tier: 'tier_founders', stage: 'Interview', ago: 21, notes: 'First-time member, eligible for the new member bonus. Clubhouse tour and meeting with the membership committee to be arranged.' },
      { name: 'Serena Whitfield', email: 'serena.whitfield@example.com', phone: '(555) 903-5547', tier: 'tier_full', stage: 'Interview', ago: 26, notes: 'Family of four. Looking forward to club events, Friday pizza nights and the Junior Golf program for the kids.' },
      { name: 'Ravi Menon', email: 'rmenon@example.com', phone: '(555) 210-7764', tier: 'tier_nonresident', stage: 'Board review', ago: 38, notes: 'Age 15, applying with his parents. Junior category is currently full, so on the waiting list. Both sponsors have known the family for over ten years.' },
      { name: 'Madeleine Fairbanks', email: 'm.fairbanks@example.com', phone: '(555) 581-3329', tier: 'tier_full', stage: 'Board review', ago: 44, notes: 'Lovely meeting with the membership committee. Recommended for approval.' },
      { name: 'Conrad Velasquez', email: 'cvelasquez@example.com', phone: '(555) 764-0915', tier: 'tier_full', stage: 'Declined', ago: 70, notes: 'Declined by the board. Welcome to reapply next season.' }
    ];
    return rows.map(function (r, i) {
      return {
        id: 'app_' + (101 + i), name: r.name, email: r.email, phone: r.phone, proposedTierId: r.tier, sponsorIds: sponsors(),
        stage: r.stage, submittedOn: Club.date.fromToday(-r.ago), notes: r.notes, memberId: null,
        history: [{ stage: 'Received', on: Club.date.fromToday(-r.ago) }].concat(r.stage === 'Received' ? [] : [{ stage: r.stage, on: Club.date.fromToday(-Math.round(r.ago / 2)) }])
      };
    });
  });
  /* Once: seeded applicants still in Received whose notes say they are on a full category's waiting list
     (Anika Desai, Young Adult) move to the waiting list stage, which did not exist when they were seeded. */
  if (!S.getObj('applicationsWaitlistSeeded', false)) {
    S.all('applications').slice().forEach(function (a) {
      if (a.stage === 'Received' && !a.source && /on the waiting list/i.test(a.notes || '') && tierFull(a.proposedTierId)) S.update('applications', a.id, { stage: WAIT, history: [{ stage: WAIT, on: a.submittedOn }] });
    });
    S.setObj('applicationsWaitlistSeeded', true);
  }

  /* The core roster only carries birthdays and anniversaries in January to September.
     Once, move a handful into the current month so the celebrations panel reflects a real club. */
  if (!S.getObj('membersCelebrationsSeeded', false)) {
    const mm = pad(new Date().getMonth() + 1);
    const thisYear = new Date().getFullYear();
    ['mem_1004', 'mem_1012', 'mem_1019', 'mem_1027', 'mem_1041', 'mem_1053'].forEach(function (id) {
      const m = S.find('members', id); if (m && m.dob) S.update('members', id, { dob: m.dob.slice(0, 4) + '-' + mm + '-' + m.dob.slice(8, 10) });
    });
    ['mem_1003', 'mem_1016', 'mem_1030', 'mem_1047', 'mem_1058'].forEach(function (id) {
      const m = S.find('members', id); if (m && m.memberSince && yearOf(m.memberSince) < thisYear) S.update('members', id, { memberSince: m.memberSince.slice(0, 4) + '-' + mm + '-' + m.memberSince.slice(8, 10) });
    });
    S.setObj('membersCelebrationsSeeded', true);
  }

  /* For the staff page (js/modules/members.js) */
  Club.shared = Club.shared || {};
  Club.shared.members = { WAIT, today, yearOf, pad, tierFull, setTierFull, ageOn, ageProblem, waitQueue, waitPosition, HEARD_FROM, heardFrom, cleanHeard };
})();
