/* Staff & Scheduling: directory, weekly schedule, on duty today, time-off requests.
   Owns collections: shifts, timeOff (and edits the core staff collection from the directory). */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  const DEPTS = ['Administration', 'Golf Operations', 'Agronomy', 'Food & Beverage', 'Events'];
  const POSITIONS = {
    'Administration': ['Office', 'Front desk', 'Membership', 'Accounting'],
    'Golf Operations': ['Golf shop', 'Lessons', 'Starter', 'Range', 'Bag room', 'Caddie desk'],
    'Agronomy': ['Course setup', 'Greens mowing', 'Bunker prep', 'Spraying', 'Irrigation', 'Equipment shop'],
    'Food & Beverage': ['Kitchen', 'Main dining', 'Grill room', 'Terrace bar', 'Banquet'],
    'Events': ['Event floor', 'Event setup', 'Planning']
  };
  const STATUS = { active: ['Active', 'good'], leave: ['On leave', 'warn'], inactive: ['Inactive', 'plain'] };
  const TO_STATUS = { pending: ['Pending', 'warn'], approved: ['Approved', 'good'], denied: ['Denied', 'plain'] };

  /* Undo (js/core/undo.js): run fn's store writes and offer Undo on the toast (message may be a function of fn's
     result). After an undo the open tab and the header stats redraw, keeping the week, filter and scroll position. */
  let live = null; // { view, ctx } while the Staff page is showing
  function undoable(fn, message, undone) {
    return Club.undo.run(fn, { message: message, undone: undone, after: function () {
      if (!live || !live.view.isConnected) return;
      const y = window.scrollY; live.ctx.changed(); live.ctx.tabs.activate(live.ctx.tab); window.scrollTo(0, y);
    } });
  }

  /* ======================================================================
     Seed data
     ====================================================================== */
  // staffId: [[dayIdx...], start, end, position] ; dayIdx 0 = Monday
  const PATTERN = {
    stf_1: [[0, 1, 2, 3, 4], '08:00', '17:00', 'Office'],
    stf_2: [[1, 2, 3, 4, 5], '07:30', '16:30', 'Golf shop'],
    stf_3: [[2, 3, 4, 5, 6], '07:00', '16:00', 'Lessons'],
    stf_4: [[0, 1, 3, 4, 5], '06:30', '15:00', 'Golf shop'],
    stf_5: [[2, 3, 4, 5, 6], '11:00', '19:30', 'Range'],
    stf_6: [[0, 1, 2, 3, 4, 5], '05:30', '14:30', 'Course setup'],
    stf_7: [[1, 2, 3, 4, 5, 6], '05:00', '13:30', 'Spraying'],
    stf_8: [[0, 1, 2, 3, 4], '06:00', '14:30', 'Equipment shop'],
    stf_9: [[0, 1, 2, 5, 6], '05:30', '13:30', 'Bunker prep'],
    stf_10: [[2, 3, 4, 5, 6], '05:30', '13:30', 'Greens mowing'],
    stf_11: [[0, 1, 2, 3, 4], '06:00', '14:30', 'Irrigation'],
    stf_12: [[1, 2, 3, 4, 5], '10:00', '21:00', 'Kitchen'],
    stf_13: [[2, 3, 4, 5, 6], '11:00', '20:00', 'Main dining'],
    stf_14: [[1, 2, 4, 5, 6], '13:00', '22:00', 'Kitchen'],
    stf_15: [[1, 2, 3, 4, 5], '11:00', '15:00', 'Grill room'],
    stf_16: [[2, 3, 4, 5, 6], '16:30', '22:30', 'Main dining'],
    stf_17: [[2, 3, 4, 5, 6], '15:00', '23:00', 'Terrace bar'],
    stf_18: [[3, 4, 5, 6], '16:00', '22:30', 'Main dining'],
    stf_19: [[0, 1, 2, 3, 4], '09:00', '17:30', 'Membership'],
    stf_20: [[0, 1, 2, 3, 4], '08:30', '17:00', 'Accounting'],
    stf_21: [[1, 2, 3, 4, 5], '09:00', '18:00', 'Event floor'],
    stf_22: [[1, 2, 3, 5, 6], '06:30', '14:30', 'Starter'],
    stf_23: [[0, 2, 4, 5, 6], '09:00', '17:00', 'Golf shop'],
    stf_24: [[2, 3, 4, 5, 6], '06:30', '15:00', 'Caddie desk'],
    stf_25: [[0, 1, 2, 4, 5], '07:00', '15:30', 'Front desk']
  };
  const CUR = Club.date.week(Club.date.today());
  const PREV = Club.date.week(Club.date.addDays(CUR[0], -7));
  const NEXT = Club.date.week(Club.date.addDays(CUR[0], 7));

  S.seed('timeOff', function () {
    return [
      { id: 'tof_1', staffId: 'stf_9', from: NEXT[1], to: NEXT[2], reason: 'Family wedding out of state', status: 'approved', requestedOn: Club.date.addDays(CUR[0], -10) },
      { id: 'tof_2', staffId: 'stf_15', from: CUR[2], to: CUR[3], reason: 'University exams', status: 'approved', requestedOn: Club.date.addDays(CUR[0], -14) },
      { id: 'tof_3', staffId: 'stf_4', from: NEXT[3], to: NEXT[4], reason: 'PGA certification seminar', status: 'pending', requestedOn: Club.date.addDays(CUR[0], 2) },
      { id: 'tof_4', staffId: 'stf_17', from: NEXT[5], to: NEXT[6], reason: 'Personal', status: 'pending', requestedOn: Club.date.addDays(CUR[0], 4) },
      { id: 'tof_5', staffId: 'stf_25', from: Club.date.addDays(NEXT[0], 7), to: Club.date.addDays(NEXT[0], 11), reason: 'Annual vacation', status: 'pending', requestedOn: Club.date.addDays(CUR[0], 5) },
      { id: 'tof_6', staffId: 'stf_10', from: CUR[5], to: CUR[5], reason: 'Concert tickets', status: 'denied', requestedOn: Club.date.addDays(CUR[0], -6) },
      { id: 'tof_7', staffId: 'stf_14', from: NEXT[1], to: NEXT[1], reason: 'Medical appointment', status: 'approved', requestedOn: Club.date.addDays(CUR[0], -2) }
    ];
  });

  S.seed('shifts', function () {
    R.reseed(6201);
    const off = S.all('timeOff').filter(function (t) { return t.status === 'approved'; });
    const isOff = function (sid, d) { return off.some(function (t) { return t.staffId === sid && d >= t.from && d <= t.to; }); };
    const out = []; let n = 1;
    [PREV, CUR, NEXT].forEach(function (week, wi) {
      Object.keys(PATTERN).forEach(function (sid, si) {
        const p = PATTERN[sid]; let days = p[0].slice();
        // rotate one day for some staff in alternate weeks so the grid is not identical week to week
        if (wi !== 1 && si % 3 === 0) { const free = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return days.indexOf(d) < 0; }); if (free.length && days.length > 4) { days = days.slice(1).concat([free[free.length - 1]]); } }
        days.forEach(function (d) {
          const date = week[d]; if (isOff(sid, date)) return;
          let start = p[1], end = p[2], pos = p[3];
          if (sid === 'stf_15' && d >= 4) { start = '16:30'; end = '22:30'; pos = 'Main dining'; }
          if (sid === 'stf_16' && d === 2) { start = '11:00'; end = '15:00'; pos = 'Grill room'; }
          if (sid === 'stf_5' && d === 6) { start = '07:00'; end = '15:00'; pos = 'Golf shop'; }
          if (sid === 'stf_7' && d === 6) { end = '11:30'; pos = 'Course setup'; }
          if (sid === 'stf_21' && d === 5 && R.chance(0.6)) { start = '12:00'; end = '23:00'; pos = 'Event floor'; }
          out.push({ id: 'shf_' + (n++), staffId: sid, date: date, start: start, end: end, position: pos, notes: '' });
        });
      });
    });
    // one deliberate double booking this week so overlap detection has something to show
    out.push({ id: 'shf_' + (n++), staffId: 'stf_16', date: CUR[3], start: '15:00', end: '19:00', position: 'Banquet', notes: 'Covering the Rotary dinner setup' });
    return out;
  });

  /* ======================================================================
     Helpers
     ====================================================================== */
  function today() { return Club.date.today(); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  /* paid hours: a 30 minute unpaid meal break is deducted from shifts longer than 6 hours */
  function paid(raw) { return raw > 6 ? raw - 0.5 : raw; }
  function hrs(s) { return paid(Math.max(0, toMin(s.end) - toMin(s.start)) / 60); }
  function shortT(t) { const m = toMin(t); let h = Math.floor(m / 60); const mm = m % 60; const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12; return h + (mm ? ':' + String(mm).padStart(2, '0') : '') + ap; }
  function range(s) { return shortT(s.start) + '–' + shortT(s.end); }
  function staffAll() { return S.all('staff'); }
  function staffName(s) { return s ? s.firstName + ' ' + s.lastName : 'Former staff'; }
  function isSalaried(s) { return !s || s.hourlyRate == null || s.hourlyRate === ''; }
  function approvedOff(sid, date) { return S.all('timeOff').find(function (t) { return t.status === 'approved' && t.staffId === sid && date >= t.from && date <= t.to; }) || null; }
  function overlapping(shift, list) {
    const a = toMin(shift.start), b = toMin(shift.end);
    return (list || S.all('shifts')).filter(function (x) { return x.id !== shift.id && x.staffId === shift.staffId && x.date === shift.date && toMin(x.start) < b && toMin(x.end) > a; });
  }
  function weekShifts(week) { return S.all('shifts').filter(function (s) { return s.date >= week[0] && s.date <= week[6]; }); }
  function laborCost(list) { return list.reduce(function (a, s) { const st = S.find('staff', s.staffId); return a + (isSalaried(st) ? 0 : hrs(s) * (+st.hourlyRate || 0)); }, 0); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function settle(root) {
    ui.$$('[data-reveal]', root).forEach(function (n) { n.classList.add('revealed'); });
    ui.$$('[data-count]:not([data-counted])', root).forEach(function (n) {
      n.setAttribute('data-counted', ''); const dec = +(n.dataset.decimals || 0);
      n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    });
  }
  function fieldError(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function weekLabel(week) {
    const a = fmt.toDate(week[0]), b = fmt.toDate(week[6]);
    const sameMonth = a.getMonth() === b.getMonth();
    return fmt.dateShort(week[0]) + ' to ' + (sameMonth ? b.getDate() : fmt.dateShort(week[6])) + ', ' + b.getFullYear();
  }
  function onDutyNow() {
    const t = today(), m = nowMin();
    return S.all('shifts').filter(function (s) { return s.date === t && toMin(s.start) <= m && toMin(s.end) > m; });
  }
  function deptOf(sid) { const s = S.find('staff', sid); return s ? s.department : 'Administration'; }

  /* ======================================================================
     Modals
     ====================================================================== */
  function positionOptions(sid, sel) {
    const list = POSITIONS[deptOf(sid)] || [];
    const all = sel && list.indexOf(sel) < 0 ? list.concat([sel]) : list;
    return ui.options(all, sel || all[0]);
  }
  function shiftModal(sh, after) {
    const isNew = !sh.id;
    const staffOpts = '<option value="">Choose staff member</option>' + DEPTS.map(function (d) {
      const people = staffAll().filter(function (s) { return s.department === d && (s.status !== 'inactive' || s.id === sh.staffId); });
      return people.length ? '<optgroup label="' + esc(d) + '">' + people.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sh.staffId ? ' selected' : '') + '>' + esc(staffName(s) + ' · ' + s.role) + '</option>'; }).join('') + '</optgroup>' : '';
    }).join('');
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Staff member', name: 'staffId', type: 'select', options: staffOpts, required: true, span2: true }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: sh.date, required: true }) +
      ui.field({ label: 'Position', name: 'position', type: 'select', options: positionOptions(sh.staffId, sh.position) }) +
      ui.field({ label: 'Start', name: 'start', type: 'time', value: sh.start || '09:00', required: true }) +
      ui.field({ label: 'End', name: 'end', type: 'time', value: sh.end || '17:00', required: true }) +
      ui.field({ label: 'Notes', name: 'notes', value: sh.notes, span2: true, placeholder: 'Optional, e.g. covering banquet setup' }) +
      '<div class="span-2 sf-modal-note" aria-live="polite"></div></form>';
    const actions = [];
    if (!isNew) actions.push({ label: 'Delete', kind: 'danger', icon: 'trash', onClick: function (api) {
      ui.confirm({ title: 'Delete shift?', text: 'Remove ' + staffName(S.find('staff', sh.staffId)) + '’s ' + range(sh) + ' shift on ' + fmt.dateLong(sh.date) + '?', confirmLabel: 'Delete shift', danger: true }).then(function (ok) {
        if (!ok) return;
        undoable(function () { S.remove('shifts', sh.id); }, 'Shift deleted', 'Shift restored');
        api.close(); after();
      });
      return false;
    } });
    actions.push({ label: 'Cancel', kind: 'ghost' });
    actions.push({ label: isNew ? 'Add shift' : 'Save shift', kind: 'primary', icon: 'check', onClick: function (api) {
      const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      const dur = toMin(d.end) - toMin(d.start);
      if (dur <= 0) { fieldError(form, 'end', 'End time must be after the start time.'); return false; }
      if (dur > 14 * 60) { fieldError(form, 'end', 'Shifts cannot be longer than 14 hours.'); return false; }
      const doc = { staffId: d.staffId, date: d.date, start: d.start, end: d.end, position: d.position, notes: d.notes };
      const clash = overlapping(Object.assign({ id: sh.id }, doc));
      const off = approvedOff(d.staffId, d.date);
      const who = staffName(S.find('staff', d.staffId));
      const warnings = [];
      if (clash.length) warnings.push(who + ' already works ' + clash.map(range).join(', ') + ' that day, so this shift overlaps.');
      if (off) warnings.push(who + ' has approved time off (' + off.reason + ') on this date.');
      function commit() {
        undoable(function () { if (isNew) S.insert('shifts', doc); else S.update('shifts', sh.id, doc); },
          isNew ? 'Shift added for ' + who : 'Shift saved', isNew ? 'Shift removed' : 'Shift changes undone');
        api.close(); after();
      }
      if (warnings.length) {
        ui.confirm({ title: clash.length ? 'Overlapping shift' : 'Scheduled over time off', text: warnings.join(' ') + ' Save anyway?', confirmLabel: 'Save anyway' }).then(function (ok) { if (ok) commit(); });
      } else commit();
      return false;
    } });
    const m = ui.modal({ title: isNew ? 'Add shift' : 'Edit shift', eyebrow: fmt.dateLong(sh.date), size: 'lg', body: body, actions: actions });
    const form = ui.$('form', m.body);
    function note() {
      const d = ui.formData(form); const box = ui.$('.sf-modal-note', form); const bits = [];
      if (d.staffId && d.date) {
        const off = approvedOff(d.staffId, d.date);
        if (off) bits.push('<div class="sf-warn">' + Club.icon('alert') + '<span>Approved time off on this date: ' + esc(off.reason) + '</span></div>');
        if (d.start && d.end && toMin(d.end) > toMin(d.start)) {
          const c = overlapping({ id: sh.id, staffId: d.staffId, date: d.date, start: d.start, end: d.end });
          if (c.length) bits.push('<div class="sf-warn bad">' + Club.icon('alert') + '<span>Overlaps with ' + esc(c.map(function (x) { return fmt.time(x.start) + ' to ' + fmt.time(x.end); }).join(', ')) + '</span></div>');
          const st = S.find('staff', d.staffId);
          const h = paid((toMin(d.end) - toMin(d.start)) / 60);
          bits.push('<div class="muted sf-dur">' + h.toFixed(h % 1 ? 1 : 0) + ' paid hours' + (st && !isSalaried(st) ? ' · ' + fmt.money(h * st.hourlyRate) + ' at ' + fmt.money(st.hourlyRate) + '/h' : ' · Salaried') + '</div>');
        }
      }
      box.innerHTML = bits.join('');
    }
    form.addEventListener('change', function (e) {
      if (e.target.name === 'staffId') { ui.$('[name=position]', form).innerHTML = positionOptions(e.target.value, null); }
      note();
    });
    form.addEventListener('input', note);
    note();
  }

  function staffModal(s, after) {
    const isNew = !s; s = s || { department: 'Golf Operations', status: 'active' };
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'First name', name: 'firstName', value: s.firstName, required: true }) +
      ui.field({ label: 'Last name', name: 'lastName', value: s.lastName, required: true }) +
      ui.field({ label: 'Role', name: 'role', value: s.role, required: true, placeholder: 'e.g. Server' }) +
      ui.field({ label: 'Department', name: 'department', type: 'select', options: ui.options(DEPTS, s.department) }) +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: s.email, required: true }) +
      ui.field({ label: 'Phone', name: 'phone', value: s.phone, placeholder: '(555) 410-1000' }) +
      ui.field({ label: 'Hourly rate ($)', name: 'hourlyRate', type: 'number', value: s.hourlyRate, min: 0, step: 0.25, hint: 'Leave blank for salaried roles' }) +
      ui.field({ label: 'Status', name: 'status', type: 'select', options: ui.options([{ value: 'active', label: 'Active' }, { value: 'leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }], s.status) }) +
      '</form>';
    ui.modal({ title: isNew ? 'Add staff member' : 'Edit ' + staffName(s), eyebrow: 'Staff directory', size: 'lg', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: isNew ? 'Add staff member' : 'Save staff member', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
        const d = ui.formData(form); let ok = true;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) { fieldError(form, 'email', 'Enter a valid email address.'); ok = false; }
        if (d.hourlyRate != null && (d.hourlyRate < 7.25 || d.hourlyRate > 200)) { fieldError(form, 'hourlyRate', 'Enter a rate between $7.25 and $200, or leave blank.'); ok = false; }
        if (d.phone && !/^[\d\s().+-]{7,}$/.test(d.phone)) { fieldError(form, 'phone', 'Use digits, spaces and dashes only.'); ok = false; }
        if (!ok) return false;
        d.hourlyRate = d.hourlyRate == null ? null : d.hourlyRate;
        undoable(function () { if (isNew) S.insert('staff', d); else S.update('staff', s.id, d); },
          isNew ? d.firstName + ' ' + d.lastName + ' added to staff' : 'Staff member saved', isNew ? d.firstName + ' ' + d.lastName + ' removed from staff' : 'Staff details restored');
        after();
      } }
    ] });
  }

  function timeOffModal(after, preset) {
    preset = preset || {};
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Staff member', name: 'staffId', type: 'select', required: true, span2: true, options: '<option value="">Choose staff member</option>' + Club.staff.options(preset.staffId) }) +
      ui.field({ label: 'From', name: 'from', type: 'date', value: preset.from || Club.date.fromToday(7), required: true }) +
      ui.field({ label: 'To', name: 'to', type: 'date', value: preset.to || Club.date.fromToday(7), required: true }) +
      ui.field({ label: 'Reason', name: 'reason', required: true, span2: true, placeholder: 'e.g. Family commitment' }) +
      '<div class="span-2 sf-modal-note"></div></form>';
    const m = ui.modal({ title: 'New time-off request', eyebrow: 'Time off', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Submit request', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
        const d = ui.formData(form);
        if (d.to < d.from) { fieldError(form, 'to', 'The end date cannot be before the start date.'); return false; }
        const dup = S.all('timeOff').find(function (t) { return t.staffId === d.staffId && t.status !== 'denied' && t.from <= d.to && t.to >= d.from; });
        if (dup) { fieldError(form, 'from', 'This overlaps an existing ' + dup.status + ' request (' + fmt.dateShort(dup.from) + ' to ' + fmt.dateShort(dup.to) + ').'); return false; }
        undoable(function () { S.insert('timeOff', Object.assign(d, { status: 'pending', requestedOn: today() })); }, 'Time-off request submitted', 'Time-off request withdrawn');
        after();
      } }
    ] });
    const form = ui.$('form', m.body);
    function note() {
      const d = ui.formData(form); const box = ui.$('.sf-modal-note', form);
      if (!d.staffId || !d.from || !d.to || d.to < d.from) { box.innerHTML = ''; return; }
      const n = S.all('shifts').filter(function (s) { return s.staffId === d.staffId && s.date >= d.from && s.date <= d.to; }).length;
      box.innerHTML = n ? '<div class="sf-warn">' + Club.icon('calendar') + '<span>' + n + ' shift' + (n > 1 ? 's are' : ' is') + ' already scheduled in this period.</span></div>' : '<div class="muted sf-dur">No shifts scheduled in this period.</div>';
    }
    form.addEventListener('change', note); note();
  }

  /* ======================================================================
     Tab: Weekly schedule
     ====================================================================== */
  function tabSchedule(panel, ctx) {
    function draw(first) {
      const week = Club.date.week(ctx.week);
      const t = today();
      const people = staffAll().filter(function (s) { return (ctx.dept === 'all' || s.department === ctx.dept) && s.status !== 'inactive'; });
      const shifts = weekShifts(week);
      const visible = shifts.filter(function (s) { return people.some(function (p) { return p.id === s.staffId; }); });
      const clashes = visible.filter(function (s) { return overlapping(s, shifts).length; });
      const offConflicts = visible.filter(function (s) { return approvedOff(s.staffId, s.date); });
      const totalH = visible.reduce(function (a, s) { return a + hrs(s); }, 0);
      const cost = laborCost(visible);

      let rows = '';
      DEPTS.forEach(function (d) {
        const group = people.filter(function (p) { return p.department === d; });
        if (!group.length) return;
        rows += '<tr class="sf-dept-row"><th colspan="10" scope="colgroup"><span class="label-caps">' + esc(d) + '</span></th></tr>';
        group.forEach(function (p) {
          const mine = visible.filter(function (s) { return s.staffId === p.id; });
          const h = mine.reduce(function (a, s) { return a + hrs(s); }, 0);
          rows += '<tr><th scope="row" class="sf-who">' + ui.person(staffName(p), esc(p.role)) + '</th>' +
            week.map(function (date) {
              const day = mine.filter(function (s) { return s.date === date; }).sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
              const off = approvedOff(p.id, date);
              return '<td class="sf-cell' + (off ? ' is-off' : '') + (date === t ? ' is-today' : '') + '" data-cell="' + p.id + '|' + date + '">' +
                (off ? '<span class="sf-off-label">Time off</span>' : '') +
                day.map(function (s) {
                  const bad = overlapping(s, shifts).length, offc = !!off;
                  return '<button type="button" class="sf-chip' + (bad ? ' is-clash' : '') + (offc ? ' is-offc' : '') + '" data-shift="' + s.id + '" title="' + esc(fmt.time(s.start) + ' to ' + fmt.time(s.end) + ' · ' + s.position + (bad ? ' · Overlapping shift' : '') + (offc ? ' · On approved time off' : '')) + '">' +
                    '<span class="sf-chip-t">' + (bad || offc ? Club.icon('alert') : '') + esc(range(s)) + '</span><span class="sf-chip-p">' + esc(s.position) + '</span></button>';
                }).join('') +
                '<button type="button" class="sf-add" data-action="add-shift" data-id="' + p.id + '|' + date + '" aria-label="Add shift for ' + esc(staffName(p)) + ' on ' + esc(fmt.dateShort(date)) + '">' + Club.icon('plus') + '</button></td>';
            }).join('') +
            '<td class="num sf-tot">' + (h ? h.toFixed(h % 1 ? 1 : 0) : '<span class="muted">0</span>') + (h > 40 && !isSalaried(p) ? '<div class="sf-ot">Overtime</div>' : '') + '</td>' +
            '<td class="num sf-tot">' + (isSalaried(p) ? '<span class="muted sf-sal">Salaried</span>' : fmt.money0(h * p.hourlyRate)) + '</td></tr>';
        });
      });

      panel.innerHTML =
        '<div class="row between wrap sf-toolbar" data-reveal>' +
        '<div class="row sf-weeknav">' + ui.btn('', { icon: 'chevronLeft', kind: 'ghost', action: 'wk-prev', title: 'Previous week' }) +
        '<div class="sf-weeklabel"><div class="label-caps">' + (week[0] === Club.date.week(t)[0] ? 'This week' : 'Week of') + '</div><div class="serif">' + esc(weekLabel(week)) + '</div></div>' +
        ui.btn('', { icon: 'chevronRight', kind: 'ghost', action: 'wk-next', title: 'Next week' }) +
        (week[0] !== Club.date.week(t)[0] ? ui.btn('Today', { sm: true, action: 'wk-today' }) : '') + '</div>' +
        '<div class="row wrap"><select class="select sf-dept" data-action="dept" aria-label="Department"><option value="all">All departments</option>' + ui.options(DEPTS, ctx.dept) + '</select>' +
        ui.btn('Copy last week', { kind: 'ghost', icon: 'refresh', action: 'copy-week' }) +
        ui.btn('Add shift', { kind: 'primary', icon: 'plus', action: 'add-shift' }) + '</div></div>' +
        (clashes.length || offConflicts.length ? '<div class="sf-alert" data-reveal>' + Club.icon('alert') + '<div>' +
          (clashes.length ? '<div><strong>' + clashes.length + ' overlapping shifts</strong> this week: ' + esc(Array.from(new Set(clashes.map(function (s) { return staffName(S.find('staff', s.staffId)) + ' on ' + fmt.weekday(s.date); }))).join(', ')) + '.</div>' : '') +
          (offConflicts.length ? '<div><strong>' + offConflicts.length + ' shift' + (offConflicts.length > 1 ? 's' : '') + '</strong> scheduled over approved time off.</div>' : '') +
          '</div></div>' : '') +
        '<section class="panel sf-sched" data-reveal><div class="panel-body flush"><div class="sf-scroll">' +
        (people.length ? '<table class="sf-grid"><thead><tr><th class="sf-who-h">Staff</th>' + week.map(function (d) {
          return '<th class="' + (d === t ? 'is-today' : '') + '"><span class="label-caps">' + esc(fmt.weekday(d)) + '</span><span class="sf-daynum serif">' + fmt.toDate(d).getDate() + '</span></th>';
        }).join('') + '<th class="num">Hours</th><th class="num">Cost</th></tr></thead><tbody>' + rows + '</tbody>' +
          '<tfoot><tr><th scope="row">Scheduled hours</th>' + week.map(function (d) { const h = visible.filter(function (s) { return s.date === d; }).reduce(function (a, s) { return a + hrs(s); }, 0); return '<td class="num">' + (h ? h.toFixed(h % 1 ? 1 : 0) : '0') + '</td>'; }).join('') + '<td class="num">' + totalH.toFixed(totalH % 1 ? 1 : 0) + '</td><td></td></tr>' +
          '<tr><th scope="row">Labor cost</th>' + week.map(function (d) { return '<td class="num">' + fmt.money0(laborCost(visible.filter(function (s) { return s.date === d; }))) + '</td>'; }).join('') + '<td></td><td class="num sf-grand">' + fmt.money0(cost) + '</td></tr></tfoot></table>'
          : ui.empty({ icon: 'staff', title: 'No staff in this department', text: 'Choose another department or add staff in the directory.' })) +
        '</div></div><div class="sf-foot muted">' + Club.icon('info') + '<span>Labor cost covers hourly staff only. Salaried roles show hours but are excluded from cost. Paid hours exclude a 30 minute meal break on shifts over 6 hours. Click an empty part of a day to add a shift, or a shift to edit it.</span></div></section>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; const sc = ui.$('.sf-scroll', panel); const sx = sc ? sc.scrollLeft : 0; draw(); window.scrollTo(0, y); const sc2 = ui.$('.sf-scroll', panel); if (sc2) sc2.scrollLeft = sx; ctx.changed(); }
    function setWeek(iso) { ctx.week = Club.date.week(iso)[0]; ctx.route(); refresh(); }
    ui.on(panel, 'click', '[data-action=wk-prev]', function () { setWeek(Club.date.addDays(ctx.week, -7)); });
    ui.on(panel, 'click', '[data-action=wk-next]', function () { setWeek(Club.date.addDays(ctx.week, 7)); });
    ui.on(panel, 'click', '[data-action=wk-today]', function () { setWeek(today()); });
    ui.on(panel, 'change', '[data-action=dept]', function (e, s) { ctx.dept = s.value; refresh(); });
    ui.on(panel, 'click', '[data-shift]', function (e, b) { e.stopPropagation(); const s = S.find('shifts', b.dataset.shift); if (s) shiftModal(s, refresh); });
    ui.on(panel, 'click', '[data-action=add-shift]', function (e, b) {
      e.stopPropagation();
      const p = b.dataset.id ? b.dataset.id.split('|') : [null, Club.date.week(ctx.week).indexOf(today()) >= 0 ? today() : ctx.week];
      const st = p[0] ? S.find('staff', p[0]) : null; const pat = p[0] && PATTERN[p[0]];
      shiftModal({ staffId: p[0], date: p[1], start: pat ? pat[1] : '09:00', end: pat ? pat[2] : '17:00', position: pat ? pat[3] : (st ? (POSITIONS[st.department] || [])[0] : null) }, refresh);
    });
    ui.on(panel, 'click', 'td[data-cell]', function (e, td) {
      if (e.target.closest('button')) return;
      const b = ui.$('[data-action=add-shift]', td); if (b) b.click();
    });
    ui.on(panel, 'click', '[data-action=copy-week]', function () {
      const week = Club.date.week(ctx.week); const prev = Club.date.week(Club.date.addDays(week[0], -7));
      const src = weekShifts(prev).filter(function (s) { return ctx.dept === 'all' || deptOf(s.staffId) === ctx.dept; });
      const cur = weekShifts(week);
      const todo = src.map(function (s) { return Object.assign({}, s, { date: Club.date.addDays(s.date, 7) }); })
        .filter(function (s) { return !cur.some(function (c) { return c.staffId === s.staffId && c.date === s.date; }) && !approvedOff(s.staffId, s.date); });
      if (!todo.length) { ui.toast('Nothing to copy. Every day from last week is already scheduled.'); return; }
      ui.confirm({ title: 'Copy last week?', text: 'Add ' + todo.length + ' shifts from the week of ' + fmt.dateShort(prev[0]) + ' to empty days this week. Days already scheduled and approved time off are skipped.', confirmLabel: 'Copy ' + todo.length + ' shifts' }).then(function (ok) {
        if (!ok) return;
        undoable(function () { todo.forEach(function (s) { S.insert('shifts', { staffId: s.staffId, date: s.date, start: s.start, end: s.end, position: s.position, notes: s.notes || '' }); }); },
          todo.length + ' shifts copied', 'Copied shifts removed');
        refresh();
      });
    });
    draw(true);
  }

  /* ======================================================================
     Tab: On duty today
     ====================================================================== */
  function tabOnDuty(panel, ctx) {
    function draw(first) {
      const t = today(), m = nowMin();
      const todays = S.all('shifts').filter(function (s) { return s.date === t; }).sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
      const now = todays.filter(function (s) { return toMin(s.start) <= m && toMin(s.end) > m; });
      const later = todays.filter(function (s) { return toMin(s.start) > m; });
      const done = todays.filter(function (s) { return toMin(s.end) <= m; });
      const offToday = S.all('timeOff').filter(function (x) { return x.status === 'approved' && t >= x.from && t <= x.to; });
      const groups = DEPTS.map(function (d) { return { d: d, list: now.filter(function (s) { return deptOf(s.staffId) === d; }) }; }).filter(function (g) { return g.list.length; });
      const mini = function (s, sub) { const st = S.find('staff', s.staffId); return '<li>' + ui.person(staffName(st), esc((st ? st.role : '') + ' · ' + s.position)) + '<span class="muted nowrap sf-li-t">' + esc(sub(s)) + '</span></li>'; };
      panel.innerHTML =
        '<div class="grid grid-main-side sf-duty">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(fmt.dateLong(t)) + '</div><h3>On duty now</h3></div><span class="sf-now"><span class="live-dot"></span>' + esc(fmt.time(new Date())) + ' · ' + now.length + ' working</span></div>' +
        (groups.length ? '<div class="sf-duty-groups">' + groups.map(function (g) {
          return '<div class="sf-duty-group"><div class="sf-duty-head"><span class="label-caps">' + esc(g.d) + '</span><span class="sf-duty-count">' + g.list.length + '</span></div><ul class="list">' + g.list.map(function (s) {
            const st = S.find('staff', s.staffId); const a = toMin(s.start), b = toMin(s.end); const pct = Math.round((m - a) / (b - a) * 100);
            return '<li class="sf-duty-li"><span class="live-dot"></span>' + ui.person(staffName(st), esc(st ? st.role : '')) + '<div class="sf-duty-meta"><div class="row between"><span class="ink-2">' + esc(s.position) + '</span><span class="muted nowrap">until ' + esc(fmt.time(s.end)) + '</span></div><div class="bar brass"><span style="width:' + pct + '%"></span></div></div>' +
              (st && st.phone ? '<a class="btn btn-ghost btn-sm btn-icon" href="tel:' + esc(st.phone.replace(/[^\d+]/g, '')) + '" title="Call ' + esc(staffName(st)) + '" aria-label="Call ' + esc(staffName(st)) + '">' + Club.icon('phone') + '</a>' : '') + '</li>';
          }).join('') + '</ul></div>';
        }).join('') + '</div>' : ui.empty({ icon: 'clock', title: 'No one is on shift right now', text: todays.length ? 'The next shift starts at ' + (later[0] ? fmt.time(later[0].start) : 'tomorrow') + '.' : 'No shifts are scheduled today.' })) + '</section>' +
        '<div class="stack">' +
        '<section class="panel" data-reveal><div class="panel-head"><h3>Later today</h3><span class="muted">' + later.length + '</span></div>' + (later.length ? '<ul class="list">' + later.map(function (s) { return mini(s, function (x) { return 'from ' + fmt.time(x.start); }); }).join('') + '</ul>' : '<div class="panel-body muted serif sf-italic">No more shifts start today.</div>') + '</section>' +
        '<section class="panel" data-reveal><div class="panel-head"><h3>Finished</h3><span class="muted">' + done.length + '</span></div>' + (done.length ? '<ul class="list">' + done.map(function (s) { return mini(s, function (x) { return range(x); }); }).join('') + '</ul>' : '<div class="panel-body muted serif sf-italic">No shifts have finished yet.</div>') + '</section>' +
        '<section class="panel" data-reveal><div class="panel-head"><h3>Away today</h3><span class="muted">' + offToday.length + '</span></div>' + (offToday.length ? '<ul class="list">' + offToday.map(function (x) { const st = S.find('staff', x.staffId); return '<li>' + ui.person(staffName(st), esc(x.reason)) + '<span class="muted nowrap sf-li-t">until ' + esc(fmt.dateShort(x.to)) + '</span></li>'; }).join('') + '</ul>' : '<div class="panel-body muted serif sf-italic">Everyone is available today.</div>') + '</section>' +
        '</div></div>';
      if (first !== true) settle(panel);
    }
    draw(true);
    const timer = setInterval(function () { if (document.body.contains(panel)) draw(); else clearInterval(timer); }, 60000);
    ctx.timers.push(timer);
  }

  /* ======================================================================
     Tab: Directory
     ====================================================================== */
  function tabDirectory(panel, ctx) {
    let q = '';
    function draw(first) {
      const cur = Club.date.week(today());
      const wk = weekShifts(cur);
      const onNow = onDutyNow().map(function (s) { return s.staffId; });
      const list = staffAll().filter(function (s) { return !q || (staffName(s) + ' ' + s.role + ' ' + s.email + ' ' + s.department).toLowerCase().indexOf(q) >= 0; });
      const groups = DEPTS.concat(Array.from(new Set(staffAll().map(function (s) { return s.department; }))).filter(function (d) { return DEPTS.indexOf(d) < 0; }));
      panel.innerHTML =
        '<div class="row between wrap sf-toolbar" data-reveal><div class="sf-search">' + Club.icon('search') + '<input class="input" type="search" placeholder="Search name, role or email" value="' + esc(q) + '" aria-label="Search staff"></div>' +
        ui.btn('Add staff member', { kind: 'primary', icon: 'plus', action: 'add-staff' }) + '</div>' +
        '<div class="sf-dir">' + (list.length ? groups.map(function (d) {
          const people = list.filter(function (s) { return s.department === d; }).sort(function (a, b) { return (a.hourlyRate == null ? 0 : 1) - (b.hourlyRate == null ? 0 : 1) || a.lastName.localeCompare(b.lastName); });
          if (!people.length) return '';
          return '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + people.length + ' ' + (people.length === 1 ? 'person' : 'people') + '</div><h3>' + esc(d) + '</h3></div></div><div class="panel-body flush"><div class="table-wrap"><table class="table sf-dir-table"><thead><tr><th>Name</th><th>Contact</th><th class="num">Rate</th><th class="num">This week</th><th>Status</th><th></th></tr></thead><tbody>' +
            people.map(function (s) {
              const h = wk.filter(function (x) { return x.staffId === s.id; }).reduce(function (a, x) { return a + hrs(x); }, 0);
              const st = STATUS[s.status] || STATUS.active;
              return '<tr><td>' + ui.person(staffName(s), esc(s.role)) + '</td><td><div><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></div><div class="person-sub">' + esc(s.phone || '') + '</div></td>' +
                '<td class="num nowrap">' + (isSalaried(s) ? '<span class="muted">Salaried</span>' : fmt.money(s.hourlyRate) + '<span class="muted">/h</span>') + '</td>' +
                '<td class="num nowrap">' + (h ? h.toFixed(h % 1 ? 1 : 0) + ' h' : '<span class="muted">None</span>') + '</td>' +
                '<td class="nowrap">' + (onNow.indexOf(s.id) >= 0 ? '<span class="sf-onnow"><span class="live-dot"></span>On duty</span>' : ui.badge(st[0], st[1])) + '</td>' +
                '<td class="right">' + ui.btn('', { sm: true, kind: 'ghost', icon: 'edit', action: 'edit-staff', id: s.id, title: 'Edit ' + staffName(s) }) + '</td></tr>';
            }).join('') + '</tbody></table></div></div></section>';
        }).join('') : ui.empty({ icon: 'search', title: 'No staff match', text: 'Try a different name, role or email.' })) + '</div>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); ctx.changed(); }
    let tmr;
    ui.on(panel, 'input', '.sf-search input', function (e, inp) {
      clearTimeout(tmr);
      tmr = setTimeout(function () { q = inp.value.toLowerCase().trim(); const pos = inp.selectionStart; draw(); const n = ui.$('.sf-search input', panel); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } }, 160);
    });
    ui.on(panel, 'click', '[data-action=add-staff]', function () { staffModal(null, refresh); });
    ui.on(panel, 'click', '[data-action=edit-staff]', function (e, b) { const s = S.find('staff', b.dataset.id); if (s) staffModal(s, refresh); });
    draw(true);
  }

  /* ======================================================================
     Tab: Time off
     ====================================================================== */
  function tabTimeOff(panel, ctx) {
    let filter = 'all';
    function days(t) { return Math.round((fmt.toDate(t.to) - fmt.toDate(t.from)) / 86400000) + 1; }
    function draw(first) {
      const all = S.all('timeOff').slice().sort(function (a, b) { return a.from.localeCompare(b.from); });
      const pending = all.filter(function (t) { return t.status === 'pending'; });
      const rows = all.filter(function (t) { return filter === 'all' || t.status === filter; }).sort(function (a, b) { return b.from.localeCompare(a.from); });
      const sched = function (t) { return S.all('shifts').filter(function (s) { return s.staffId === t.staffId && s.date >= t.from && s.date <= t.to; }).length; };
      const span = function (t) { return t.from === t.to ? fmt.date(t.from) : fmt.dateShort(t.from) + ' to ' + fmt.date(t.to); };
      panel.innerHTML =
        '<div class="row between wrap sf-toolbar" data-reveal><div><div class="eyebrow">Awaiting decision</div><h3 class="sf-h">' + (pending.length ? pending.length + ' pending request' + (pending.length > 1 ? 's' : '') : 'All requests decided') + '</h3></div>' + ui.btn('New request', { kind: 'primary', icon: 'plus', action: 'new-to' }) + '</div>' +
        (pending.length ? '<div class="sf-pending">' + pending.map(function (t) {
          const st = S.find('staff', t.staffId); const n = sched(t);
          return '<article class="panel sf-req" data-reveal><div class="panel-body">' + ui.person(staffName(st), esc(st ? st.role + ' · ' + st.department : '')) +
            '<div class="sf-req-dates"><span class="serif">' + esc(span(t)) + '</span><span class="muted">' + days(t) + ' day' + (days(t) > 1 ? 's' : '') + '</span></div>' +
            '<p class="serif sf-italic sf-reason">' + esc(t.reason) + '</p>' +
            (n ? '<div class="sf-warn">' + Club.icon('alert') + '<span>' + n + ' scheduled shift' + (n > 1 ? 's' : '') + ' in this period</span></div>' : '<div class="muted sf-dur">No shifts scheduled in this period</div>') +
            '<div class="row sf-req-actions">' + ui.btn('Approve', { kind: 'primary', sm: true, icon: 'check', action: 'approve', id: t.id }) + ui.btn('Deny', { kind: 'ghost', sm: true, icon: 'close', action: 'deny', id: t.id }) + '</div></div></article>';
        }).join('') + '</div>' : '') +
        '<section class="panel" data-reveal><div class="panel-head wrap"><div><div class="eyebrow">History</div><h3>All requests</h3></div>' +
        ui.segmented([{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'denied', label: 'Denied' }], filter, 'toFilter') + '</div>' +
        '<div class="panel-body flush">' + (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Staff</th><th>Dates</th><th class="num">Days</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (t) {
          const st = S.find('staff', t.staffId); const s = TO_STATUS[t.status] || TO_STATUS.pending;
          return '<tr><td>' + ui.person(staffName(st), esc(st ? st.department : '')) + '</td><td class="nowrap">' + esc(span(t)) + '</td><td class="num">' + days(t) + '</td><td class="ink-2">' + esc(t.reason) + '</td><td>' + ui.badge(s[0], s[1]) + '</td>' +
            '<td class="right nowrap">' + (t.status === 'pending' ? ui.btn('Approve', { sm: true, action: 'approve', id: t.id }) + ' ' : '') + (t.status === 'approved' ? ui.btn('View week', { sm: true, kind: 'ghost', icon: 'calendar', action: 'view-week', id: t.from }) + ' ' : '') +
            ui.btn('', { sm: true, kind: 'ghost', icon: 'trash', action: 'del-to', id: t.id, title: 'Delete request' }) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : ui.empty({ icon: 'calendar', title: 'No ' + (filter === 'all' ? '' : filter + ' ') + 'requests', text: 'Requests appear here once submitted.' })) + '</div></section>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); ctx.changed(); }
    ui.on(panel, 'click', '[data-action=new-to]', function () { timeOffModal(refresh); });
    ui.on(panel, 'click', '.segmented button', function (e, b) { filter = b.dataset.value; refresh(); });
    ui.on(panel, 'click', '[data-action=view-week]', function (e, b) { ctx.week = Club.date.week(b.dataset.id)[0]; ctx.tabs.activate('schedule'); });
    ui.on(panel, 'click', '[data-action=approve]', function (e, b) {
      const t = S.find('timeOff', b.dataset.id); if (!t) return;
      const st = S.find('staff', t.staffId);
      const shifts = S.all('shifts').filter(function (s) { return s.staffId === t.staffId && s.date >= t.from && s.date <= t.to; });
      function approve(removeShifts) {
        /* Undo puts the request back to pending and any removed shifts back on the schedule */
        undoable(function () {
          S.update('timeOff', t.id, { status: 'approved', decidedOn: today() });
          if (removeShifts) shifts.forEach(function (s) { S.remove('shifts', s.id); });
        }, 'Time off approved for ' + staffName(st) + (removeShifts ? ', ' + shifts.length + ' shift' + (shifts.length > 1 ? 's' : '') + ' removed' : ''),
          'Request back to pending' + (removeShifts ? ', shifts restored' : ''));
        refresh();
      }
      if (!shifts.length) { approve(false); return; }
      ui.modal({ title: 'Approve time off', eyebrow: staffName(st), body: '<p class="ink-2">' + esc(staffName(st)) + ' has ' + shifts.length + ' shift' + (shifts.length > 1 ? 's' : '') + ' scheduled during this request. Remove them from the schedule, or keep them flagged so you can arrange cover?</p>', actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Keep shifts flagged', onClick: function () { approve(false); } },
        { label: 'Approve and remove shifts', kind: 'primary', icon: 'check', onClick: function () { approve(true); } }
      ] });
    });
    ui.on(panel, 'click', '[data-action=deny]', function (e, b) {
      const t = S.find('timeOff', b.dataset.id); if (!t) return;
      ui.confirm({ title: 'Deny request?', text: 'Deny ' + staffName(S.find('staff', t.staffId)) + '’s request for ' + fmt.dateShort(t.from) + (t.to !== t.from ? ' to ' + fmt.dateShort(t.to) : '') + '?', confirmLabel: 'Deny request', danger: true }).then(function (ok) {
        if (ok) { undoable(function () { S.update('timeOff', t.id, { status: 'denied', decidedOn: today() }); }, 'Request denied', 'Request back to pending'); refresh(); }
      });
    });
    ui.on(panel, 'click', '[data-action=del-to]', function (e, b) {
      const t = S.find('timeOff', b.dataset.id); if (!t) return;
      ui.confirm({ title: 'Delete request?', text: 'This removes the request' + (t.status === 'approved' ? ' and clears the time off from the schedule.' : '.'), confirmLabel: 'Delete request', danger: true }).then(function (ok) {
        if (ok) { undoable(function () { S.remove('timeOff', t.id); }, 'Request deleted', 'Request restored'); refresh(); }
      });
    });
    draw(true);
  }

  /* ======================================================================
     Register
     ====================================================================== */
  const TABS = [
    { id: 'schedule', label: 'Weekly schedule', fn: tabSchedule },
    { id: 'duty', label: 'On duty today', fn: tabOnDuty },
    { id: 'directory', label: 'Directory', fn: tabDirectory },
    { id: 'timeoff', label: 'Time off', fn: tabTimeOff }
  ];
  function headStats() {
    const cur = weekShifts(Club.date.week(today()));
    const active = staffAll().filter(function (s) { return s.status === 'active'; }).length;
    const h = cur.reduce(function (a, s) { return a + hrs(s); }, 0);
    const pend = S.all('timeOff').filter(function (t) { return t.status === 'pending'; }).length;
    return ui.stats([
      { label: 'Active staff', value: active, meta: DEPTS.length + ' departments' },
      { label: 'On duty now', value: onDutyNow().length, meta: '<span class="live-dot"></span> Live' },
      { label: 'Hours this week', value: Math.round(h), meta: cur.length + ' shifts' },
      { label: 'Labor this week', value: Math.round(laborCost(cur)), prefix: '$', meta: 'Hourly staff' },
      { label: 'Pending time off', value: pend, meta: pend ? 'Needs a decision' : 'All decided' }
    ]);
  }

  Club.register({
    id: 'staff', label: 'Staff & Scheduling', icon: 'staff', section: 'Administration', order: 10,
    badge: function () { return S.all('timeOff').filter(function (t) { return t.status === 'pending'; }).length || null; },
    search: function (q) {
      return staffAll().filter(function (s) { return (staffName(s) + ' ' + s.role + ' ' + s.department).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (s) { return { label: staffName(s), sub: 'Staff · ' + s.role, href: 'staff/directory', icon: 'staff' }; });
    },
    render: function (view, params) {
      const tabId = TABS.some(function (t) { return t.id === params[0]; }) ? params[0] : 'schedule';
      const wk = params[1] && /^\d{4}-\d{2}-\d{2}$/.test(params[1]) ? Club.date.week(params[1])[0] : Club.date.week(today())[0];
      const ctx = { week: wk, dept: 'all', tab: tabId, timers: [], tabs: null };
      ctx.route = function () { try { history.replaceState(null, '', '#/staff/' + ctx.tab + (ctx.tab === 'schedule' ? '/' + ctx.week : '')); } catch (e) { /* ignore */ } };
      ctx.changed = function () { const h = ui.$('.sf-head-stats', view); if (h) { h.innerHTML = headStats(); settle(h); } };
      view.innerHTML = ui.pageHeader({
        eyebrow: 'Administration',
        title: 'Staff & scheduling',
        subtitle: '<span class="serif sf-sub">The people behind every round, cover and celebration at ' + esc(Club.info.short) + '.</span>',
        actions: ui.btn('Request time off', { icon: 'calendar', action: 'hdr-to' }) + ui.btn('Add shift', { kind: 'primary', icon: 'plus', action: 'hdr-shift' })
      }) + '<div class="sf-head-stats">' + headStats() + '</div><div class="sf-tabs"></div>';
      let first = true;
      ctx.tabs = ui.tabs(ui.$('.sf-tabs', view), TABS.map(function (t) { return { id: t.id, label: t.label, render: function (p) { t.fn(p, ctx); } }; }), tabId, function (id) {
        ctx.tab = id; if (!first) ctx.route(); first = false;
      });
      function rerender() { ctx.changed(); ctx.tabs.activate(ctx.tab); }
      live = { view: view, ctx: ctx };
      ui.on(view, 'click', '[data-action=hdr-to]', function () { timeOffModal(rerender); });
      ui.on(view, 'click', '[data-action=hdr-shift]', function () {
        const d = Club.date.week(ctx.week).indexOf(today()) >= 0 ? today() : ctx.week;
        shiftModal({ staffId: null, date: d, start: '09:00', end: '17:00' }, rerender);
      });
      return function () { ctx.timers.forEach(clearInterval); };
    }
  });
})();
