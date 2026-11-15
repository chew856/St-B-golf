/* Members' portal: Lessons. Meet the professionals, book a lesson, my lessons and academy programs.
   Mirrors js/modules/lessons.js: pros are staff whose role is a Golf Professional or Director of Golf,
   prices come from the lessonRates rate card (base x pro premium x duration, rounded to $5), teaching
   hours 7:00 AM to 7:00 PM, and bookings are refused on pro clashes, academy sessions and member clashes.
   Lessons are charged by staff on completion, so booking never posts a charge. Program enrolment posts
   the fee exactly as the staff Enroll does ('Academy: <name>', Lessons, source lessons, refId program id). */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc;

  const DAY_START = 7 * 60, DAY_END = 19 * 60;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const TYPES = ['Private lesson', 'Playing lesson', 'Club fitting', 'Junior clinic', 'Group clinic'];
  const TYPE_DUR = { 'Private lesson': 60, 'Playing lesson': 90, 'Club fitting': 60, 'Junior clinic': 60, 'Group clinic': 90 };
  const TYPE_LINE = {
    'Private lesson': 'One to one on the practice tee or with our SIM teaching technology.',
    'Playing lesson': 'On the course, strategy and shot selection.',
    'Club fitting': 'Finding the right clubs and shafts for your swing.',
    'Junior clinic': 'Part of our Junior Golf program.',
    'Group clinic': 'A small group, a shared focus and good company.'
  };
  const DURATIONS = [30, 45, 60, 90];
  const DEFAULT_RATES = {
    rates: { 'Private lesson': 160, 'Playing lesson': 210, 'Club fitting': 180, 'Junior clinic': 75, 'Group clinic': 95 },
    premium: { stf_2: 1.3, stf_3: 1.15, stf_4: 1, stf_5: 1 }
  };
  const SPECIALTY = {
    stf_2: 'Lessons for golfers of all abilities, by arrangement.',
    stf_3: 'Full swing, short game and competitive juniors.',
    stf_4: 'Putting and wedge play, and the ladies’ clinics.',
    stf_5: 'Beginners, Junior Golf and club fitting.'
  };
  /* Regular days away from the lesson tee, as scheduled in the staff seed. */
  const DAYS_OFF = { stf_2: [1, 2], stf_3: [1], stf_4: [3], stf_5: [4] };
  const CUTOFF_MIN = 24 * 60;
  const LEAD_MIN = 60;

  /* ---------------- Helpers mirrored from the staff module ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { m = Math.max(0, Math.round(m)); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function today() { return Club.date.today(); }
  function overlap(a1, d1, a2, d2) { return a1 < a2 + d2 && a2 < a1 + d1; }
  function range(t, dur) { return F.time(t) + ' to ' + F.time(toHM(toMin(t) + dur)); }
  function pros() { return S.all('staff').filter(function (s) { return /Golf Professional|Director of Golf/.test(s.role || '') && s.status !== 'inactive'; }); }
  function proName(id) { return Club.staff.name(id); }
  function proFirst(id) { const s = Club.staff.get(id); return s ? s.firstName : 'your professional'; }
  function rates() {
    const r = S.getObj('lessonRates', null) || {};
    return { rates: Object.assign({}, DEFAULT_RATES.rates, r.rates || {}), premium: Object.assign({}, DEFAULT_RATES.premium, r.premium || {}) };
  }
  function priceFor(type, proId, dur) {
    const r = rates(); const base = r.rates[type] != null && !isNaN(+r.rates[type]) ? +r.rates[type] : 150;   /* a $0 rate means free, not the default */ const prem = r.premium[proId] || 1;
    return Math.round(base * prem * dur / 60 / 5) * 5;
  }
  function programSessions(p) { const out = []; for (let k = 0; k < (+p.weeks || 0); k++) out.push(Club.date.addDays(p.startDate, k * 7)); return out; }
  function programState(p) {
    const t = today(); const ss = programSessions(p);
    if (!ss.length) return { key: 'draft', label: 'Dates to be announced' };
    if (t < ss[0]) return { key: 'upcoming', label: 'Begins ' + F.dateShort(ss[0]) };
    if (t > ss[ss.length - 1]) return { key: 'finished', label: 'Concluded ' + F.dateShort(ss[ss.length - 1]) };
    return { key: 'running', label: 'Week ' + ss.filter(function (d) { return d <= t; }).length + ' of ' + ss.length };
  }
  function programOn(date, coach) { return S.where('programs', function (p) { return (!coach || p.coach === coach) && programSessions(p).indexOf(date) >= 0; }); }
  function minsUntil(date, time) { const d = F.toDate(date); const [h, m] = String(time).split(':'); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +h, +m || 0); return (t - new Date()) / 60000; }

  /** Same checks as the staff conflicts(): hours, pro clash, member clash, academy sessions. */
  function conflicts(data, selfId) {
    const errs = []; const s = toMin(data.time), d = +data.duration;
    if (s < DAY_START || s + d > DAY_END) errs.push('Lessons are taught between ' + F.time(toHM(DAY_START)) + ' and ' + F.time(toHM(DAY_END)) + '.');
    S.where('lessons', function (l) { return l.date === data.date && l.status !== 'cancelled' && l.id !== selfId; }).forEach(function (l) {
      if (!overlap(s, d, toMin(l.time), +l.duration || 60)) return;
      if (l.proId === data.proId) errs.push(proName(l.proId) + ' is already teaching ' + range(l.time, l.duration || 60) + '.');
      else if (l.memberId === data.memberId) errs.push('You already have a lesson ' + range(l.time, l.duration || 60) + ' with ' + proFirst(l.proId) + '.');
    });
    programOn(data.date, data.proId).forEach(function (p) { if (overlap(s, d, toMin(p.time), p.duration || 60)) errs.push(proName(p.coach) + ' is coaching ' + p.name + ' ' + range(p.time, p.duration || 60) + '.'); });
    return errs;
  }
  function teaches(proId, date) { return (DAYS_OFF[proId] || []).indexOf(F.toDate(date).getDay()) < 0; }
  function slotsFor(proId, date, dur, memberId) {
    if (!teaches(proId, date)) return [];
    const out = [];
    for (let m = DAY_START; m + dur <= DAY_END; m += 30) {
      if (date === today() && m < nowMin() + LEAD_MIN) continue;
      if (!conflicts({ date: date, time: toHM(m), duration: dur, proId: proId, memberId: memberId }, null).length) out.push(toHM(m));
    }
    return out;
  }

  /* ---------------- Presentation helpers (copy only) ---------------- */
  function telHref() { return 'tel:' + String(Club.info.phone).replace(/[^0-9+]/g, ''); }
  function telLink() { return '<a class="pl-tel" href="' + telHref() + '">' + esc(Club.info.phone) + '</a>'; }
  function dayShort(iso) { return F.toDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function spots(n) { return n + (n === 1 ? ' spot' : ' spots'); }

  /* ---------------- Calendar file ---------------- */
  function downloadIcs(l) {
    const esc2 = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
    const st = function (date, min) { return date.replace(/-/g, '') + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00'; };
    const n = new Date();
    const dtstamp = n.getUTCFullYear() + pad(n.getUTCMonth() + 1) + pad(n.getUTCDate()) + 'T' + pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + pad(n.getUTCSeconds()) + 'Z';
    const s = toMin(l.time);
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + Club.info.name + '//Members//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + l.id + '@stbonifacegolfclub.com', 'DTSTAMP:' + dtstamp, 'DTSTART:' + st(l.date, s), 'DTEND:' + st(l.date, s + (+l.duration || 60)),
      'SUMMARY:' + esc2(l.type + ' with ' + proName(l.proId)), 'LOCATION:' + esc2(Club.info.name + ', ' + Club.info.address),
      'DESCRIPTION:' + esc2(l.duration + ' minutes. ' + (l.notes ? l.notes + '. ' : '') + 'Please arrive ten minutes early. To change, call the golf shop on ' + Club.info.phone + '.'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'stboniface-lesson-' + l.date + '.ics';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
      U.toast('Calendar invitation downloaded');
    } catch (e) { U.toast('Your browser could not create the calendar file', 'bad'); }
  }

  /* ---------------- Page ---------------- */
  let draft = null;
  let lastTab = 'book';
  const PERIODS = [['Morning', 0, 12 * 60], ['Afternoon', 12 * 60, 17 * 60], ['Evening', 17 * 60, 24 * 60]];
  const POLICY = 'Cancel online up to 24 hours before. Within 24 hours, please call the golf shop. The fee is charged to your account after the lesson.';

  function render(view, params, member) {
    const P = pros();
    if (!draft || draft.memberId !== member.id) {
      const lastPro = Portal.prefs.get('lessonPro', 'any');
      draft = { memberId: member.id, pro: lastPro, type: 'Private lesson', duration: 60, date: today(), period: null, time: null, assigned: null, notes: '' };
    }
    if (draft.pro !== 'any' && !P.some(function (p) { return p.id === draft.pro; })) draft.pro = 'any';
    if (draft.date < today()) { draft.date = today(); draft.period = null; draft.time = null; draft.assigned = null; }   /* page left open overnight */
    const startTab = { book: 'book', mine: 'mine', academy: 'academy' }[params[0]] || lastTab;

    function myLessons() { return S.where('lessons', function (l) { return l.memberId === member.id; }); }
    function isUpcoming(l) { return l.status === 'scheduled' && minsUntil(l.date, l.time) > -(+l.duration || 60); }
    function upcoming() { return myLessons().filter(isUpcoming).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }); }
    function nextLesson() { return upcoming()[0] || null; }

    function heroHTML() {
      const n = nextLesson();
      /* Several lessons on the next day: one card with a row for each (each row opens its lesson). */
      const day = n ? upcoming().filter(function (l) { return l.date === n.date; }) : [];
      if (day.length > 1) return '<section class="p-hero pl-hero" data-reveal><h1>Lessons</h1>' +
        '<div class="pl-next-day"><p class="pl-next-day-h">' + Club.icon('lesson') + '<span><span class="pl-next-k">Next</span> ' + esc(dayShort(n.date)) + ' · ' + day.length + ' lessons</span></p>' +
          day.map(function (l) { return '<button type="button" class="pl-next pl-next-row" data-les="' + esc(l.id) + '"><span class="pl-next-text">' + esc(F.time(l.time) + ' · ' + l.type + ' · ' + proFirst(l.proId)) + '</span>' + Club.icon('chevronRight', 'pl-go') + '</button>'; }).join('') +
        '</div></section>';
      return '<section class="p-hero pl-hero" data-reveal><h1>Lessons</h1>' +
        (n ? '<button type="button" class="pl-next" data-les="' + esc(n.id) + '">' + Club.icon('lesson') +
          '<span class="pl-next-text"><span class="pl-next-k">Next</span> ' + esc(dayShort(n.date) + ' · ' + F.time(n.time) + ' · ' + n.type + ' · ' + proFirst(n.proId)) + '</span>' + Club.icon('chevronRight', 'pl-go') + '</button>'
          : '<p class="pl-hero-line">Private lessons with our CPGA professionals, plus clinics through the season.</p>') +
        '</section>';
    }
    function refreshHero() { const h = U.$('.pl-hero', view); if (!h) return; const f = U.el(heroHTML()); f.classList.add('revealed'); h.replaceWith(f); }

    view.innerHTML = heroHTML() + '<div class="pl-tabs"></div>';
    const tabsApi = U.tabs(U.$('.pl-tabs', view), [
      { id: 'book', label: 'Book', render: drawBook },
      { id: 'mine', label: 'My lessons', render: drawMine },
      { id: 'academy', label: 'Clinics', render: drawAcademy }
    ], startTab, function (id) { lastTab = id; if (id !== 'book') Portal.actionBar.hide(); });
    function after() { refreshHero(); tabsApi.activate(lastTab); }
    U.on(view, 'click', '[data-les]', function (e, b) { const l = S.find('lessons', b.dataset.les); if (l) lessonSheet(l, b.classList.contains('pl-next')); });

    /* ---------- Lesson detail sheet ---------- */
    function lessonSheet(l, fromHero) {
      const canCancel = l.status === 'scheduled' && minsUntil(l.date, l.time) > CUTOFF_MIN;
      const sh = Portal.openSheet({
        title: l.type,
        content: '<dl class="pl-kv"><div><dt>When</dt><dd>' + esc(F.dateLong(l.date)) + ', ' + esc(range(l.time, +l.duration || 60)) + '</dd></div>' +
          '<div><dt>With</dt><dd>' + esc(proName(l.proId)) + '</dd></div><div><dt>Fee</dt><dd>' + F.money0(l.price) + '</dd></div>' +
          (l.notes ? '<div><dt>Note</dt><dd>' + esc(l.notes) + '</dd></div>' : '') + '</dl>' +
          '<div class="pl-sheet-acts">' + U.btn('Add to calendar', { action: 'ics' }) + (canCancel ? U.btn('Cancel lesson', { kind: 'danger', action: 'cancel' }) : '') + '</div>' +
          (canCancel ? '' : '<p class="pl-sheet-note">Within 24 hours, please call the golf shop at ' + telLink() + ' to make changes.</p>') +
          (fromHero ? '<button type="button" class="p-link" data-action="view">View all my lessons</button>' : '')
      });
      U.on(sh.body, 'click', '[data-action]', function (e, b) {
        const a = b.dataset.action;
        if (a === 'ics') { downloadIcs(S.find('lessons', l.id) || l); return; }
        sh.close();
        if (a === 'view') tabsApi.activate('mine');
        else if (a === 'cancel') {
          U.confirm({ title: 'Cancel this lesson?', text: l.type + ' with ' + proName(l.proId) + ', ' + F.dateLong(l.date) + ' at ' + F.time(l.time) + '. You won’t be charged.', confirmLabel: 'Cancel lesson', danger: true }).then(function (ok) {
            if (!ok) return;
            const cur = S.find('lessons', l.id);
            if (!cur || cur.status !== 'scheduled' || minsUntil(cur.date, cur.time) <= CUTOFF_MIN) { U.toast('This lesson can no longer be cancelled online', 'bad'); after(); return; }
            S.update('lessons', l.id, { status: 'cancelled' });
            U.toast('Your lesson has been cancelled');
            after();
          });
        }
      });
    }

    /* ---------- Book: one compact card ---------- */
    function drawBook(panel) {
      lastTab = 'book';
      const blocked = member.status === 'suspended';
      const days = []; for (let i = 0; i < 21; i++) days.push(Club.date.fromToday(i));
      panel.innerHTML = '<div class="p-cols pl-cols"><div class="pl-main">' + (blocked ? '<div class="pl-alert">' + Club.icon('alert') + '<span>You can’t book online right now. Please call the golf shop at ' + telLink() + '.</span></div>' : '') +
        '<div class="pl-card" data-reveal>' +
          '<div class="pl-pro-sel"></div><div class="pl-type-sel"></div>' +
          '<div class="pl-dur"><span class="pk-label" id="pl-dur-l">Length</span>' + U.segmented(DURATIONS.map(function (d) { return { value: String(d), label: d + ' min' }; }), String(draft.duration), 'duration') + '</div>' +
          '<div class="pl-dp"></div>' +
          '<div class="pl-period"></div><div class="pl-times" aria-live="polite"></div>' +
        '</div>' +
        Portal.accordion({ id: 'pl-note', icon: 'edit', title: 'Note for your professional', summary: 'Optional', body:
          '<form class="pl-notes-form" novalidate>' + U.field({ label: 'Note', name: 'notes', type: 'textarea', value: draft.notes, placeholder: 'What you want to work on, or clubs to bring' }) + '</form>' }) +
        '</div><aside class="pl-side" aria-label="Your professional"></aside></div>';
      U.$('.pl-dur .segmented', panel).setAttribute('aria-labelledby', 'pl-dur-l');

      function slotMap(date) {
        date = date || draft.date;
        const list = draft.pro === 'any' ? P.slice().sort(function (a, b) { return (rates().premium[a.id] || 1) - (rates().premium[b.id] || 1); }) : P.filter(function (p) { return p.id === draft.pro; });
        const map = {};
        list.forEach(function (p) { slotsFor(p.id, date, draft.duration, member.id).forEach(function (t) { if (!map[t]) map[t] = p.id; }); });
        return map;
      }
      function dayList() {
        const mineOn = {}; upcoming().forEach(function (l) { mineOn[l.date] = 1; });
        return days.map(function (d) {
          if (draft.pro !== 'any' && !teaches(draft.pro, d)) return { date: d, disabled: true, reason: 'Not teaching' };
          const n = Object.keys(slotMap(d)).length;
          if (!n) return { date: d, disabled: true, reason: 'Fully booked' };
          return { date: d, meta: n + (n === 1 ? ' time' : ' times'), pill: mineOn[d] ? 'Your lesson' : '' };
        });
      }

      /* Professional and lesson type: select fields opening a sheet */
      const proRows = [{ value: 'any', label: 'First available', sub: 'Any professional who is free at your time' }].concat(P.map(function (p) {
        return { value: p.id, label: p.firstName + ' ' + p.lastName, sub: p.role + ' · ' + (SPECIALTY[p.id] || 'Private lessons for all abilities.'), meta: 'from ' + F.money0(priceFor('Private lesson', p.id, 60)) };
      }));
      const proSel = Portal.selectField(U.$('.pl-pro-sel', panel), { label: 'Professional', title: 'Choose a professional', icon: 'user', rows: proRows, value: draft.pro,
        onChange: function (v) { draft.pro = v; draft.time = null; draft.assigned = null; refreshDays(); drawPeriods(); drawSide(); } });
      const typeSel = Portal.selectField(U.$('.pl-type-sel', panel), { label: 'Lesson', title: 'Choose a lesson', icon: 'lesson', value: draft.type,
        rows: TYPES.map(function (t) { return { value: t, label: t, sub: TYPE_LINE[t], meta: F.money0(rates().rates[t]) + '/hr' }; }),
        onChange: function (v) {
          draft.type = v; draft.duration = TYPE_DUR[v] || 60;
          U.$$('.segmented[data-name=duration] button', panel).forEach(function (x) { x.classList.toggle('active', +x.dataset.value === draft.duration); });
          refreshDays(); drawPeriods(); drawSide();
        } });

      /* Date */
      const firstDays = dayList();
      const curDay = firstDays.find(function (x) { return x.date === draft.date; });
      if (draft.date === today() && curDay && curDay.disabled) { const nx = firstDays.find(function (x) { return !x.disabled; }); if (nx) draft.date = nx.date; }
      const dp = Portal.datePicker(U.$('.pl-dp', panel), { label: 'Date', title: 'Choose a date', value: draft.date, days: firstDays, onChange: function (iso) { draft.date = iso; drawPeriods(); } });
      function refreshDays() { dp.update({ days: dayList(), value: draft.date }); }

      /* Morning / Afternoon / Evening, then that period's chips */
      function drawPeriods() {
        const map = slotMap(); const times = Object.keys(map).sort();
        if (draft.time && !map[draft.time]) { draft.time = null; draft.assigned = null; }
        if (draft.time) draft.assigned = draft.pro === 'any' ? map[draft.time] : draft.pro;
        const counts = PERIODS.map(function (g) { return times.filter(function (t) { return toMin(t) >= g[1] && toMin(t) < g[2]; }).length; });
        if (draft.time) draft.period = PERIODS.find(function (g) { return toMin(draft.time) >= g[1] && toMin(draft.time) < g[2]; })[0];
        if (!draft.period || counts[PERIODS.findIndex(function (g) { return g[0] === draft.period; })] === 0) { const i = counts.findIndex(function (c) { return c > 0; }); draft.period = PERIODS[i >= 0 ? i : 0][0]; }
        const host = U.$('.pl-period', panel);
        let note = '';
        if (draft.pro !== 'any' && !teaches(draft.pro, draft.date)) note = proFirst(draft.pro) + ' doesn’t teach on ' + DAYS[F.toDate(draft.date).getDay()] + 's. Choose another day, or First available.';
        else if (!times.length) note = 'No ' + draft.duration + '-minute times left on this day. Try another day or a shorter lesson.';
        if (note) { host.innerHTML = ''; U.$('.pl-times', panel).innerHTML = '<p class="pl-none">' + esc(note) + '</p>'; syncBar(); return; }
        host.innerHTML = '<div class="segmented pl-seg" data-name="period" role="group" aria-label="Time of day">' + PERIODS.map(function (g, i) {
          return '<button type="button" data-value="' + g[0] + '" class="' + (g[0] === draft.period ? 'active' : '') + (counts[i] ? '' : ' is-empty') + '"><span>' + g[0] + '</span><small>' + counts[i] + ' open</small></button>';
        }).join('') + '</div>';
        drawChips(map, times);
      }
      function drawChips(map, times) {
        map = map || slotMap(); times = times || Object.keys(map).sort();
        const g = PERIODS.find(function (x) { return x[0] === draft.period; });
        const ts = times.filter(function (t) { return toMin(t) >= g[1] && toMin(t) < g[2]; });
        U.$('.pl-times', panel).innerHTML = ts.length ? '<div class="pl-chiprow" role="radiogroup" aria-label="' + g[0] + ' times">' + ts.map(function (t) {
          const on = t === draft.time;
          return '<button type="button" class="pl-chip' + (on ? ' on' : '') + '" data-time="' + t + '" role="radio" aria-checked="' + on + '"><span class="pl-chip-t">' + esc(F.time(t)) + '</span>' + (draft.pro === 'any' ? '<small>' + esc(proFirst(map[t])) + '</small>' : '') + '</button>';
        }).join('') + '</div>' : '<p class="pl-none">Nothing open in the ' + g[0].toLowerCase() + '. Try another time of day or date.</p>';
        const row = U.$('.pl-chiprow', panel), on = row && U.$('.pl-chip.on', row);
        if (row && on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
        syncBar();
      }
      function syncBar() {
        if (lastTab !== 'book') return;
        if (draft.time && !blocked) Portal.actionBar.show({ summary: draft.type + ' · ' + draft.duration + ' min · ' + dayShort(draft.date) + ' · ' + F.time(draft.time), label: 'Book lesson', onClick: confirmSheet });
        else Portal.actionBar.hide();
      }
      drawPeriods(); drawSide();

      /* Side column on tablets and desktops: the chosen professional, or the whole team for First available */
      function drawSide() {
        const one = draft.pro !== 'any' ? P.find(function (p) { return p.id === draft.pro; }) : null;
        const list = one ? [one] : P;
        U.$('.pl-side', panel).innerHTML = '<div class="pl-side-card"><div class="eyebrow">' + (one ? 'Your professional' : 'Our professionals') + '</div>' +
          '<ul class="pl-side-pros">' + list.map(function (p) {
            return '<li>' + U.avatar(p.firstName + ' ' + p.lastName) + '<div class="pl-side-pro"><span class="pl-side-name">' + esc(p.firstName + ' ' + p.lastName) + '</span><span class="pl-side-role">' + esc(p.role) + ' · ' + esc(F.money0(priceFor(draft.type, p.id, draft.duration))) + ' for ' + draft.duration + ' min</span>' +
              '<span class="pl-side-spec">' + esc(SPECIALTY[p.id] || 'Private lessons for all abilities.') + '</span></div>' +
              (one ? '' : '<button type="button" class="p-link" data-pick-pro="' + esc(p.id) + '" aria-label="Choose ' + esc(p.firstName) + '">Choose</button>') + '</li>';
          }).join('') + '</ul>' + (one ? '<button type="button" class="p-link" data-pick-pro="any">Any professional instead</button>' : '') + '</div>' +
          '<div class="pl-side-card pl-side-policy"><h3>Good to know</h3><p>' + esc(POLICY) + '</p><p>Please arrive 10 minutes early and check in at the golf shop.</p></div>';
      }
      U.on(panel, 'click', '[data-pick-pro]', function (e, b) { draft.pro = b.dataset.pickPro; draft.time = null; draft.assigned = null; proSel.set(draft.pro); refreshDays(); drawPeriods(); drawSide(); });

      U.on(panel, 'click', '.segmented[data-name=duration] button', function (e, b) {
        draft.duration = +b.dataset.value; U.$$('.segmented[data-name=duration] button', panel).forEach(function (x) { x.classList.toggle('active', x === b); }); refreshDays(); drawPeriods(); drawSide();
      });
      U.on(panel, 'click', '.segmented[data-name=period] button', function (e, b) { draft.period = b.dataset.value; U.$$('.segmented[data-name=period] button', panel).forEach(function (x) { x.classList.toggle('active', x === b); }); drawChips(); });
      U.on(panel, 'click', '.pl-chip', function (e, b) {
        draft.time = b.dataset.time;
        const map = slotMap(); draft.assigned = draft.pro === 'any' ? map[draft.time] : draft.pro;
        U.$$('.pl-chip', panel).forEach(function (x) { const o = x === b; x.classList.toggle('on', o); x.setAttribute('aria-checked', o); });
        syncBar();
      });
      U.$('[name=notes]', panel).addEventListener('input', function (e) { draft.notes = e.target.value; });

      /* Book lesson: confirm sheet with the fee and the cancellation policy, then the same checks and record as before */
      function confirmSheet() {
        const proId = draft.pro === 'any' ? draft.assigned : draft.pro;
        const sh = Portal.openSheet({
          title: 'Confirm your lesson',
          content: '<dl class="pl-kv"><div><dt>Lesson</dt><dd>' + esc(draft.type) + ', ' + draft.duration + ' min</dd></div>' +
            '<div><dt>With</dt><dd>' + esc(proId ? proName(proId) : 'First available') + '</dd></div>' +
            '<div><dt>When</dt><dd>' + esc(F.dateLong(draft.date)) + ', ' + esc(range(draft.time, draft.duration)) + '</dd></div>' +
            '<div><dt>Fee</dt><dd>' + (proId ? F.money0(priceFor(draft.type, proId, draft.duration)) : '') + '</dd></div></dl>' +
            '<p class="pl-sheet-note">' + esc(POLICY) + '</p><div class="pl-sum-err" role="alert" hidden></div>',
          footer: '<button type="button" class="btn btn-primary" data-action="confirm">Confirm</button>'
        });
        U.$('[data-action=confirm]', sh.foot).addEventListener('click', function () {
          const err = U.$('.pl-sum-err', sh.body);
          const fail = function (msg) { err.innerHTML = Club.icon('alert') + '<span>' + esc(msg) + '</span>'; err.hidden = false; U.toast(msg, 'bad'); };
          const m = Portal.member(); if (!m) return;
          if (m.status === 'suspended') return fail('Online booking is unavailable on your account. Please call the golf shop.');
          if (!draft.time) return fail('Please choose a time for your lesson.');
          if (draft.date < today()) return fail('That date has passed. Please choose another day.');
          const pid = draft.pro === 'any' ? draft.assigned : draft.pro;
          if (!pid) return fail('Please choose a time for your lesson.');
          const notes = String(draft.notes || '').trim();
          if (notes.length > 500) return fail('Please keep your notes under 500 characters.');
          if (draft.date === today() && toMin(draft.time) < nowMin() + LEAD_MIN) { drawPeriods(); return fail('That time is too soon to book online. Please choose a later time.'); }
          const doc = { date: draft.date, time: draft.time, duration: draft.duration, proId: pid, memberId: m.id, type: draft.type, price: priceFor(draft.type, pid, draft.duration), notes: notes };
          const c = conflicts(doc, null);
          if (c.length || !teaches(pid, draft.date)) { drawPeriods(); return fail(c[0] || 'That professional is not teaching on this day.'); }
          const saved = S.insert('lessons', Object.assign(doc, { status: 'scheduled', charged: false }));
          Portal.prefs.set('lessonPro', draft.pro);
          draft.time = null; draft.assigned = null; draft.notes = '';
          U.toast('Your lesson with ' + proFirst(pid) + ' is booked');
          Portal.actionBar.hide();
          sh.setContent('<div class="pl-done"><div class="pl-confirm-icon" aria-hidden="true">' + Club.icon('check') + '</div><h3>Your lesson is booked</h3>' +
            '<p>' + esc(saved.type + ' with ' + proName(pid)) + ' · ' + esc(F.dateLong(saved.date)) + ', ' + esc(range(saved.time, saved.duration)) + ' · ' + F.money0(saved.price) + '</p>' +
            '<p class="pl-sheet-note">Please arrive 10 minutes early and check in at the golf shop.</p></div>');
          sh.setFooter('<button type="button" class="btn btn-primary" data-action="ics">' + Club.icon('calendar') + '<span>Add to calendar</span></button><button type="button" class="p-link pl-done-x" data-action="done">Done</button>');
          U.$('[data-action=ics]', sh.foot).addEventListener('click', function () { downloadIcs(S.find('lessons', saved.id) || saved); });
          U.$('[data-action=done]', sh.foot).addEventListener('click', function () { sh.close(); });
          refreshHero(); drawBook(panel);
        });
      }
    }

    /* ---------- My lessons ---------- */
    function drawMine(panel) {
      const all = myLessons();
      const up = upcoming();
      const past = all.filter(function (l) { return !isUpcoming(l); }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 12);
      const row = function (l) {
        const d = F.toDate(l.date);
        return '<li><button type="button" class="pl-row" data-les="' + esc(l.id) + '"><span class="pl-dblock"><span>' + esc(d.toLocaleDateString('en-US', { weekday: 'short' })) + '</span><b>' + d.getDate() + '</b><span>' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></span>' +
          '<span class="pl-row-main"><span class="pl-row-t">' + esc(F.time(l.time) + ' · ' + l.type) + '</span><span class="pl-row-s">' + esc((+l.duration || 60) + ' min · ' + proName(l.proId)) + '</span></span>' + Club.icon('chevronRight', 'pl-go') + '</button></li>';
      };
      panel.innerHTML = '<div class="p-cols pl-mine-cols"><div>' + (up.length ? '<ul class="p-list pl-les-list" data-reveal>' + up.slice(0, 5).map(row).join('') +
          (up.length > 5 ? '<li><button type="button" class="pl-row pl-row-all" data-action="all">View all upcoming (' + up.length + ')' + Club.icon('chevronRight', 'pl-go') + '</button></li>' : '') + '</ul>'
          : '<div class="panel" data-reveal>' + U.empty({ icon: 'lesson', title: 'No lessons booked', text: 'When you book a lesson, it appears here.', action: U.btn('Book a lesson', { kind: 'primary', action: 'go-book' }) }) + '</div>') +
        '</div><div class="pl-past-acc">' + Portal.accordion({ id: 'pl-past', icon: 'clock', title: 'Past lessons', summary: past.length ? past.length + (past.length === 1 ? ' lesson' : ' lessons') : 'None yet',
          body: past.length ? '<ul class="pl-past">' + past.map(function (l) {
            const b = l.status === 'completed' ? U.badge('Completed', 'outline') : l.status === 'cancelled' ? U.badge('Cancelled', 'bad') : U.badge('Awaiting sign-off', 'warn');
            return '<li><span class="pl-past-main"><span class="pl-past-t">' + esc(l.type) + '</span><span class="pl-past-s">' + esc(F.date(l.date) + ' at ' + F.time(l.time) + ' · ' + proName(l.proId)) + '</span>' +
              Portal.receiptLink(Portal.receiptsFor('lessons', l.id, member.id)) + '</span>' + b + '</li>';
          }).join('') + '</ul>' : '<p class="muted">Your past lessons will appear here.</p>' }) + '</div></div>';
      if (panel.dataset.wired) return; panel.dataset.wired = '1';
      U.on(panel, 'click', '[data-action]', function (e, b) {
        if (b.dataset.action === 'go-book') tabsApi.activate('book');
        else if (b.dataset.action === 'all') Portal.openSheet({ title: 'Upcoming lessons', size: 'full',
          rows: upcoming().map(function (l) { return { value: l.id, label: dayShort(l.date) + ' · ' + F.time(l.time), sub: l.type + ' with ' + proName(l.proId) }; }),
          onPick: function (id) { const l = S.find('lessons', id); if (l) lessonSheet(l); } });
      });
    }

    /* ---------- Academy ---------- */
    function drawAcademy(panel) {
      const order = { running: 0, upcoming: 1, finished: 2, draft: 3 };
      const progs = S.all('programs').filter(function (p) { return programState(p).key !== 'finished' || (p.enrolled || []).indexOf(member.id) >= 0; })
        .sort(function (a, b) { return (order[programState(a).key] - order[programState(b).key]) || (a.startDate < b.startDate ? -1 : 1); });
      panel.innerHTML = progs.length ? '<div class="pl-progs">' + progs.map(function (p) {
        const st = programState(p); const n = (p.enrolled || []).length; const cap = +p.capacity || 0; const left = Math.max(0, cap - n);
        const mine = (p.enrolled || []).indexOf(member.id) >= 0; const coach = Club.staff.get(p.coach);
        const invite = /invitation/i.test(p.level || '');
        const pct = cap ? Math.min(100, n / cap * 100) : 0;
        let act;
        if (mine) act = st.key === 'finished' ? '<span class="pl-prog-inv">Finished. Thank you for joining.</span>' : U.btn('Withdraw', { kind: 'danger', action: 'withdraw', id: p.id });
        else if (st.key === 'finished') act = '<span class="pl-prog-inv">Registration closed</span>';
        else if (invite) act = '<span class="pl-prog-inv">By invitation from ' + esc(coach ? coach.firstName + ' ' + coach.lastName : 'the golf shop') + '</span>';
        else if (left <= 0) act = '<span class="pl-prog-inv">Full</span>';
        else if (member.status !== 'active') act = '<span class="pl-prog-inv">To enroll, call the golf shop</span>';
        else act = U.btn('Enroll', { kind: 'primary', icon: 'plus', action: 'enroll', id: p.id });
        const sum = (mine ? 'Enrolled · ' : '') + p.day + 's, ' + F.time(p.time) + ' · ' + (left <= 0 ? 'Full' : spots(left) + ' left') + ' · ' + F.money0(p.price);
        return Portal.accordion({ id: 'pl-prog-' + p.id, icon: mine ? 'check' : 'lesson', title: p.name, summary: sum, body:
          (p.description ? '<p class="pl-prog-desc">' + esc(p.description) + '</p>' : '') +
          '<dl class="pl-prog-kv"><div><dt>When</dt><dd>' + esc(p.day) + 's, ' + esc(F.time(p.time)) + ' · ' + (p.duration || 60) + ' min</dd></div><div><dt>Coach</dt><dd>' + esc(coach ? coach.firstName + ' ' + coach.lastName : 'To be confirmed') + '</dd></div><div><dt>Level</dt><dd>' + esc(p.level || 'All abilities') + '</dd></div><div><dt>Length</dt><dd>' + p.weeks + ' weeks from ' + esc(F.dateShort(p.startDate)) + ' · ' + esc(st.label) + '</dd></div></dl>' +
          '<div class="pl-prog-cap"><span>' + (cap ? (n + ' of ' + cap + ' spots filled') : 'Spots to be confirmed') + (left > 0 ? ' · ' + spots(left) + ' left' : '') + '</span><div class="bar"><span style="width:' + pct + '%"></span></div></div>' +
          '<div class="pl-prog-foot"><span class="pl-prog-price">' + F.money0(p.price) + ' <small>for the program</small></span>' + act + '</div>' });
      }).join('') + '</div>' : '<div class="panel">' + U.empty({ icon: 'lesson', title: 'No clinics or programs right now', text: 'New clinics are being planned. Please check back soon.' }) + '</div>';
      if (panel.dataset.wired) return; panel.dataset.wired = '1';
      U.on(panel, 'click', '[data-action]', function (e, b) {
        const p = S.find('programs', b.dataset.id); if (!p) return;
        if (b.dataset.action === 'enroll') {
          U.confirm({ title: 'Enroll in ' + p.name + '?', text: p.day + 's at ' + F.time(p.time) + ' for ' + p.weeks + ' weeks with ' + proName(p.coach) + '. The program fee of ' + F.money0(p.price) + ' will be posted to your member account.', confirmLabel: 'Enroll' }).then(function (ok) {
            if (!ok) return;
            const cur = S.find('programs', p.id); const m = Portal.member(); if (!cur || !m) return;
            if ((cur.enrolled || []).indexOf(m.id) >= 0) { U.toast('You are already enrolled', 'bad'); return; }
            if ((cur.enrolled || []).length >= cur.capacity) { U.toast('The program is now full', 'bad'); drawAcademy(panel); U.animateIn(panel); return; }
            if (programState(cur).key === 'finished') { U.toast('Enrolment has closed', 'bad'); return; }
            S.update('programs', cur.id, { enrolled: (cur.enrolled || []).concat([m.id]) });
            if (+cur.price > 0) Club.chargeMember(m.id, { description: 'Academy: ' + cur.name, category: 'Lessons', amount: cur.price, source: 'lessons', refId: cur.id });
            U.toast('You are enrolled in ' + cur.name + (+cur.price > 0 ? '. ' + F.money0(cur.price) + ' posted to your account' : ''));
            drawAcademy(panel); U.animateIn(panel);
          });
        } else if (b.dataset.action === 'withdraw') {
          U.confirm({ title: 'Withdraw from ' + p.name + '?', text: 'Your spot will be released. The program fee is not refunded automatically. The golf shop will contact you about any refund.', confirmLabel: 'Withdraw', danger: true }).then(function (ok) {
            if (!ok) return;
            const cur = S.find('programs', p.id); if (!cur) return;
            S.update('programs', cur.id, { enrolled: (cur.enrolled || []).filter(function (x) { return x !== member.id; }) });
            U.toast('You have withdrawn from ' + cur.name);
            drawAcademy(panel); U.animateIn(panel);
          });
        }
      });
    }
    return function () { Portal.actionBar.hide(); };
  }

  Portal.register({ id: 'lessons', label: 'Lessons', icon: 'lesson', order: 40, tab: false, render: render });
})();
