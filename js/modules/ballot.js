/* Staff: Weekend ballot (Golf, after the Tee Sheet). Saturdays, Sundays and holidays are booked by ballot (2025 Membership
   Handbook, page 11). The rules, dates and the draw live in Club.ballot (js/shared/ballot-data.js); this page shows them.
   - Ballot days from today to the furthest one open: entries, players, and the draw (scheduled, or its results).
   - Enter for a member who phones in, change an entry, withdraw it: every one with Undo (Club.undo).
   - "Run draw now (demo)": the draw normally runs by itself at 12:00 PM, 13 days before the day. For trying the demo
     before then, staff can run it early; it closes entries for that day, books the winners and has Undo.
   - After the draw: who got which time in draw order, the missed list with reasons, the seed for checking the order.
     Results are final; staff then change those tee times on the Tee Sheet as usual. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const B = Club.ballot;
  if (!B) return;
  const RANGES = [{ value: '30', label: 'Up to 30 minutes either way' }, { value: '60', label: 'Up to 1 hour either way' }, { value: '120', label: 'Up to 2 hours either way' }, { value: '720', label: 'Any time of day' }];
  const PHASE = { before: ['Not open yet', 'outline'], open: ['Taking entries', 'good'], due: ['Draw due', 'warn'], drawn: ['Drawn', ''], past: ['Played', 'outline'] };
  let sel = null;          /* the ballot day on screen */
  let pageRefresh = null;

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function staffName() { return Club.user ? Club.user.firstName + ' ' + Club.user.lastName : 'Staff'; }
  function dayLong(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function dayShort(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function drawText(d) { const s = B.schedule(d); return dayShort(s.drawOn) + ' at ' + fmt.time(s.drawTime); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function nameOf(id) { return Club.members.name(id); }
  function groupText(e) {
    return (e.players || []).map(function (p) { return p.type === 'guest' ? p.name + ' (guest)' : p.memberId ? nameOf(p.memberId) : p.name; }).join(', ');
  }
  function prefText(e) { return +e.range >= 720 ? 'Any time' : fmt.time(e.time); }
  function windowText(e) { return fmt.time(e.earliest) + ' to ' + fmt.time(e.latest); }
  function phaseBadge(ph) { const p = PHASE[ph] || ['', '']; return p[0] ? ui.badge(p[0], p[1]) : ''; }
  function kindWord(d) { const s = B.schedule(d); return s.kind === 'holiday' ? (s.holiday || 'Holiday') : s.kind; }

  /** Ballot days worth showing: from today to the last one whose window opens within 3 days. */
  function days() { return B.upcoming(Club.date.today(), B.OPEN_DAYS + 4); }

  /* ---------------- Enter, change, withdraw ---------------- */
  function golfers() {
    return S.all('members').filter(function (m) { return (m.status === 'active' || m.status === 'leave') && (!Club.teeRules || Club.teeRules.tierRules(m).golf); })
      .sort(function (a, b) { return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName); });
  }
  function memberOpts(selected, extra) {
    return (extra || '') + golfers().map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.lastName + ', ' + m.firstName + ' · #' + m.memberNo) + '</option>'; }).join('');
  }
  function timeOpts(selected) {
    const sl = Club.shared && Club.shared.teesheet ? Club.shared.teesheet.slotList() : ['06:30', '19:00'];
    const out = []; for (let x = Math.ceil(toMin(sl[0]) / 30) * 30; x <= toMin(sl[sl.length - 1]); x += 30) out.push(toHM(x));
    return out.map(function (t) { return '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + esc(fmt.time(t)) + '</option>'; }).join('');
  }
  function openEntry(date, cur) {
    if (B.phase(date) !== 'open') { ui.toast('Entries for ' + dayShort(date) + ' are closed', 'bad'); return; }
    const others = cur ? cur.players.slice(1) : [];
    const row = function (i) {
      const p = others[i] || null;
      const v = !p ? '' : p.type === 'guest' ? '__guest' : p.memberId;
      return '<div class="bl-prow" data-i="' + i + '"><div class="field"><label for="bl-p' + i + '">Player ' + (i + 2) + '</label>' +
        '<select class="select bl-psel" id="bl-p' + i + '" name="p' + i + '">' + memberOpts(v, '<option value=""' + (v ? '' : ' selected') + '>No one</option><option value="__guest"' + (v === '__guest' ? ' selected' : '') + '>A guest</option>') + '</select></div>' +
        '<div class="field bl-gname"' + (v === '__guest' ? '' : ' hidden') + '><label for="bl-g' + i + '">Guest’s name</label><input class="input" id="bl-g' + i + '" name="g' + i + '" maxlength="60" autocomplete="off" value="' + esc(p && p.type === 'guest' ? p.name : '') + '"></div></div>';
    };
    const body = '<form class="bl-form" novalidate>' +
      '<p class="bl-form-when">' + esc(dayLong(date)) + ' · draw ' + esc(drawText(date)) + '</p>' +
      '<div class="form-grid">' +
        '<div class="field span-2"><label for="bl-lead">Member entering</label><select class="select" id="bl-lead" name="lead" required>' + memberOpts(cur ? cur.memberId : '', cur ? '' : '<option value="" selected>Choose a member</option>') + '</select></div>' +
        '<div class="field"><label for="bl-time">Preferred time</label><select class="select" id="bl-time" name="time">' + timeOpts(cur ? cur.time : '08:00') + '</select></div>' +
        '<div class="field"><label for="bl-range">How flexible</label><select class="select" id="bl-range" name="range">' + RANGES.map(function (r) { return '<option value="' + r.value + '"' + (String(cur ? cur.range : 60) === r.value ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field span-2"><span class="bl-lbl" id="bl-holes-l">Holes</span>' + ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(cur ? cur.holes : 18), 'bl-holes') + '</div>' +
      '</div>' +
      '<div class="bl-players">' + [0, 1, 2].map(row).join('') + '</div>' +
      '<div class="field"><label for="bl-notes">Notes for the golf shop</label><textarea class="textarea" id="bl-notes" name="notes" maxlength="240">' + esc(cur ? cur.notes || '' : '') + '</textarea></div>' +
      '<p class="bl-guestnote">Guests: one per member in prime time (Fridays, and weekend and holiday mornings 6:00 to 11:00 AM), otherwise up to three.</p>' +
      '<div class="bl-err" role="alert" hidden></div></form>';
    const actions = [{ label: 'Cancel', kind: 'ghost' }];
    if (cur) actions.push({ label: 'Withdraw entry', kind: 'danger', onClick: function (api) { api.close(); withdrawEntry(cur); return false; } });
    actions.push({ label: cur ? 'Save changes' : 'Enter ballot', kind: 'primary', onClick: function (api) { return save(api); } });
    const md = ui.modal({ title: cur ? 'Change ballot entry' : 'Enter the ballot for a member', eyebrow: kindWord(date) + ' ballot', body: body, size: 'md', actions: actions });
    const form = ui.$('.bl-form', md.body);
    const holesSeg = ui.$('.segmented[data-name=bl-holes]', form); holesSeg.setAttribute('role', 'group'); holesSeg.setAttribute('aria-labelledby', 'bl-holes-l');
    ui.$$('button', holesSeg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.classList.contains('active'))); });
    ui.on(holesSeg, 'click', 'button', function (e, b) { ui.$$('button', holesSeg).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); }); });
    form.addEventListener('change', function (e) {
      const s = e.target.closest && e.target.closest('.bl-psel'); if (!s) return;
      const g = ui.$('.bl-gname', s.closest('.bl-prow')); g.hidden = s.value !== '__guest';
      if (!g.hidden) { const i = ui.$('input', g); if (i) i.focus(); }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    function data() {
      const f = ui.formData(form);
      const lead = f.lead;
      const players = lead ? [{ memberId: lead, type: 'member', cart: false }] : [];
      [0, 1, 2].forEach(function (i) {
        const v = f['p' + i];
        if (v === '__guest') players.push({ memberId: null, type: 'guest', name: String(f['g' + i] || '').trim(), hostId: lead, pays: 'host', cart: false });
        else if (v) players.push({ memberId: v, type: 'member', cart: false });
      });
      const keep = function (p) { const was = cur && cur.players.find(function (q) { return p.type === 'member' ? q.memberId === p.memberId : q.type === 'guest' && q.name === p.name; }); return was ? Object.assign({}, was, p.type === 'guest' ? { name: p.name, hostId: lead } : {}) : p; };
      return { date: date, memberId: lead, players: players.map(keep), time: f.time, range: +f.range, holes: +(ui.$('.segmented[data-name=bl-holes] button.active', form) || { dataset: { value: 18 } }).dataset.value, notes: f.notes || '' };
    }
    function save(api) {
      const d = data(), err = ui.$('.bl-err', form);
      const errs = d.memberId ? B.check(d, { staff: true, excludeId: cur ? cur.id : null }) : ['Choose the member entering the ballot.'];
      if (errs.length) { err.innerHTML = Club.icon('alert') + '<div>' + errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; err.hidden = false; return false; }
      const who = nameOf(d.memberId);
      const r = Club.undo.run(function () { return cur ? B.change(cur.id, d, { staff: true, staffName: staffName() }) : B.enter(d, { staff: true, staffName: staffName() }); }, {
        message: function (x) { return x.ok ? (cur ? 'Ballot entry for ' + who + ' updated' : who + ' entered in the ' + dayShort(date) + ' ballot') : ''; },
        undone: cur ? 'Ballot entry put back as it was' : 'Ballot entry removed',
        after: function () { if (pageRefresh) pageRefresh(); }
      });
      if (!r.ok) { err.innerHTML = Club.icon('alert') + '<div>' + r.errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; err.hidden = false; return false; }
      api.close();
      if (pageRefresh) pageRefresh();
      return true;
    }
  }
  function withdrawEntry(e) {
    const who = nameOf(e.memberId);
    const r = Club.undo.run(function () { return B.withdraw(e.id, { staff: true, staffName: staffName() }); }, {
      message: function (x) { return x.ok ? who + '’s ballot entry withdrawn' : ''; }, undone: who + '’s ballot entry is back in the draw', after: function () { if (pageRefresh) pageRefresh(); }
    });
    if (!r.ok) ui.toast(r.reason, 'bad');
    if (pageRefresh) pageRefresh();
  }
  function runDemoDraw(date) {
    const s = B.schedule(date), n = B.entries(date).filter(function (e) { return e.status === 'entered'; }).length;
    ui.confirm({ title: 'Run the draw now?', confirmLabel: 'Run draw now',
      text: 'This is for the demo. In real use the draw runs by itself at ' + fmt.time(s.drawTime) + ' on ' + dayLong(s.drawOn) + '. Running it now closes entries for ' + dayLong(date) + ', draws ' + plural(n, 'entry').replace('entrys', 'entries') + ' and books the winning groups on the tee sheet. You can undo it from the message that follows.' })
      .then(function (ok) {
        if (!ok) return;
        const res = Club.undo.run(function () { return B.draw(date, { by: 'staff', demo: true, staffName: staffName() }); }, {
          message: function (r) { if (!r.ok) return ''; const rs = r.record.results; const w = rs.filter(function (x) { return x.status === 'won'; }).length; return 'Draw made for ' + dayShort(date) + ': ' + plural(w, 'tee time') + ', ' + (rs.length - w) + ' missed'; },
          undone: 'Draw undone. Entries for ' + dayShort(date) + ' are open again', after: function () { if (pageRefresh) pageRefresh(); }
        });
        if (!res.ok) ui.toast(res.reason, 'bad');
        if (pageRefresh) pageRefresh();
      });
  }

  /* ---------------- Page ---------------- */
  function dayCard(x) {
    const won = x.entries.filter(function (e) { return e.status === 'won'; }).length, missed = x.entries.filter(function (e) { return e.status === 'missed'; }).length;
    const line = x.phase === 'before' ? 'Entries open ' + dayShort(x.schedule.opensOn)
      : x.phase === 'drawn' ? (x.entries.length ? plural(won, 'tee time') + ' · ' + missed + ' missed' : 'No entries')
      : 'Draw ' + drawText(x.date);
    return '<button type="button" class="bl-day' + (x.date === sel ? ' is-sel' : '') + '" data-date="' + x.date + '" aria-pressed="' + (x.date === sel) + '">' +
      '<span class="bl-day-k">' + esc(kindWord(x.date)) + '</span>' +
      '<span class="bl-day-d">' + esc(fmt.toDate(x.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</span>' +
      '<span class="bl-day-n">' + esc(plural(x.entries.length, 'entry').replace('entrys', 'entries') + ' · ' + plural(x.players, 'player')) + '</span>' +
      '<span class="bl-day-l">' + esc(line) + '</span>' + phaseBadge(x.phase) + '</button>';
  }
  function entriesTable(date, list) {
    if (!list.length) return ui.empty({ icon: 'calendar', title: 'No entries yet', text: 'Members enter in the portal. Enter for a member who phones in with the button above.' });
    return '<table class="table bl-tbl"><thead><tr><th>Member</th><th>Group</th><th>Preferred</th><th class="bl-c-win">Window</th><th class="num">Holes</th><th class="bl-c-at">Entered</th><th>Status</th></tr></thead><tbody>' +
      list.map(function (e) {
        const st = e.status === 'withdrawn' ? ui.badge('Withdrawn', 'outline') : e.status === 'won' ? ui.badge('Tee time ' + fmt.time(e.drawnTime), 'good') : e.status === 'missed' ? ui.badge('Missed', 'bad') : ui.badge('Entered', '');
        return '<tr class="bl-tr' + (e.status === 'withdrawn' ? ' is-out' : '') + '" data-id="' + esc(e.id) + '" tabindex="0" aria-label="' + esc(nameOf(e.memberId) + ', ' + prefText(e) + '. Open entry') + '">' +
          '<td data-l="Member"><strong>' + esc(nameOf(e.memberId)) + '</strong>' + (e.source === 'staff' ? '<span class="bl-src">By phone</span>' : '') + '</td>' +
          '<td data-l="Group">' + esc((e.players || []).length + ' · ' + groupText(e)) + '</td>' +
          '<td data-l="Preferred">' + esc(prefText(e)) + '</td>' +
          '<td class="bl-c-win" data-l="Window">' + esc(windowText(e)) + '</td>' +
          '<td class="num" data-l="Holes">' + e.holes + '</td>' +
          '<td class="bl-c-at" data-l="Entered">' + esc(fmt.dateShort(String(e.createdAt).slice(0, 10)) + ', ' + fmt.time(new Date(e.createdAt).toTimeString().slice(0, 5))) + '</td>' +
          '<td data-l="Status">' + st + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function resultsHTML(date, rec) {
    const byId = {}; B.entries(date).forEach(function (e) { byId[e.id] = e; });
    const rs = (rec.results || []).filter(Boolean);
    const won = rs.filter(function (r) { return r.status === 'won'; }), missed = rs.filter(function (r) { return r.status === 'missed'; });
    const tile = function (k, v, sub, act) { return '<button type="button" class="bl-tile" data-act="' + act + '"><span class="label-caps">' + esc(k) + '</span><span class="bl-tile-v">' + esc(String(v)) + '</span>' + (sub ? '<span class="bl-tile-s">' + esc(sub) + '</span>' : '') + '</button>'; };
    const row = function (r, i) {
      const e = byId[r.entryId] || { players: [], memberId: r.memberId, time: '', range: 0, earliest: '', latest: '' };
      return '<tr class="bl-rr' + (r.status === 'won' ? ' is-won' : ' is-missed') + '"' + (r.status === 'won' ? ' data-tt="' + esc(date) + '" tabindex="0"' : '') + '>' +
        '<td class="num" data-l="Drawn">' + (i + 1) + '</td>' +
        '<td data-l="Member"><strong>' + esc(nameOf(r.memberId)) + '</strong><span class="bl-src">' + esc(groupText(e)) + '</span></td>' +
        '<td data-l="Asked for">' + esc(prefText(e) + (e.earliest ? ' (' + windowText(e) + ')' : '')) + '</td>' +
        '<td data-l="Result">' + (r.status === 'won' ? ui.badge(fmt.time(r.time), 'good') : ui.badge('Missed', 'bad') + '<span class="bl-why">' + esc(r.reason || '') + '</span>') + '</td></tr>';
    };
    return '<div class="bl-tiles">' + tile('Entries drawn', rs.length, '', 'bl-go-all') + tile('Tee times given', won.length, rs.length ? Math.round(won.length / rs.length * 100) + '% of entries' : '', 'bl-go-won') + tile('Missed', missed.length, missed.length ? 'Offered the times still open' : '', 'bl-go-missed') + tile('Open times before the draw', rec.open == null ? 'Not recorded' : rec.open, '', 'bl-go-sheet') + '</div>' +
      '<p class="bl-audit">' + esc((rec.demo ? 'Run early for the demo by ' + (rec.staffName || 'staff') : rec.by === 'staff' ? 'Run by ' + (rec.staffName || 'staff') : 'Drawn automatically') + ' on ' + dayShort(String(rec.ranAt).slice(0, 10)) + ' at ' + fmt.time(new Date(rec.ranAt).toTimeString().slice(0, 5)) + '. Draw order from seed ' + rec.seed + ' (the date), so it can be checked again.') + '</p>' +
      (rs.length ? '<table class="table bl-tbl bl-res"><thead><tr><th class="num">Drawn</th><th>Member and group</th><th>Asked for</th><th>Result</th></tr></thead><tbody>' + rs.map(row).join('') + '</tbody></table>' : ui.empty({ icon: 'calendar', title: 'No entries for this day', text: 'Every time stayed open for ordinary booking.' }));
  }
  function render(view, params) {
    B.runDue();
    const list = days();
    if (params && params[0] && list.some(function (x) { return x.date === params[0]; })) sel = params[0];
    if (!sel || !list.some(function (x) { return x.date === sel; })) sel = (list.find(function (x) { return x.phase === 'open'; }) || list.find(function (x) { return x.phase === 'drawn'; }) || list[0] || {}).date || null;
    view.classList.add('bl-page');
    view.innerHTML = ui.pageHeader({ eyebrow: 'Golf', title: 'Weekend ballot',
      subtitle: 'Saturdays, Sundays and holidays are booked by ballot. Entries open 15 days before and close at the draw, 12:00 PM 13 days before. After the draw, times still open book as usual.',
      actions: ui.btn('Enter for a member', { kind: 'primary', icon: 'plus', action: 'bl-new' }) }) +
      '<div class="bl-days" role="group" aria-label="Ballot days"></div>' +
      '<section class="panel bl-detail"></section>';
    function draw() {
      const all = days();
      ui.$('.bl-days', view).innerHTML = all.map(dayCard).join('');
      const x = all.find(function (y) { return y.date === sel; });
      const host = ui.$('.bl-detail', view);
      const nb = ui.$('[data-action=bl-new]', view); if (nb) nb.disabled = !all.some(function (y) { return y.phase === 'open'; });
      if (!x) { host.innerHTML = '<div class="panel-body">' + ui.empty({ icon: 'calendar', title: 'No ballot days coming up', text: 'Saturdays, Sundays and holidays appear here 15 days ahead.' }) + '</div>'; return; }
      const s = x.schedule, rec = B.drawRecord(x.date);
      const ents = B.entries(x.date).slice().sort(function (a, b) { return (a.status === 'withdrawn') - (b.status === 'withdrawn') || String(a.createdAt).localeCompare(String(b.createdAt)); });
      const acts = (x.phase === 'open' ? ui.btn('Enter for a member', { icon: 'plus', action: 'bl-new-here', sm: true }) + (ents.some(function (e) { return e.status === 'entered'; }) ? ui.btn('Run draw now (demo)', { kind: 'ghost', icon: 'refresh', action: 'bl-demo', sm: true }) : '') : '') +
        (x.phase === 'drawn' ? '<a class="btn btn-sm" href="#/teesheet/' + x.date + '">' + Club.icon('teesheet') + '<span>Open the tee sheet</span></a>' : '');
      host.innerHTML = '<div class="panel-head bl-dh"><div><div class="eyebrow">' + esc(kindWord(x.date) + ' ballot') + '</div><h3>' + esc(dayLong(x.date)) + ' ' + phaseBadge(x.phase) + '</h3>' +
          '<p class="bl-sched">' + esc('Entries open ' + dayShort(s.opensOn) + ' · ' + (x.phase === 'drawn' ? 'drawn ' : 'draw ') + drawText(x.date) + (x.phase === 'drawn' ? ' · times still open book as usual' : '')) + '</p></div>' +
          (acts ? '<div class="bl-acts">' + acts + '</div>' : '') + '</div>' +
        '<div class="panel-body' + (rec ? '' : ' flush') + '">' + (rec ? resultsHTML(x.date, rec) +
          (ents.some(function (e) { return e.status === 'withdrawn'; }) ? '<details class="bl-more"><summary>Withdrawn before the draw (' + ents.filter(function (e) { return e.status === 'withdrawn'; }).length + ')</summary>' + entriesTable(x.date, ents.filter(function (e) { return e.status === 'withdrawn'; })) + '</details>' : '')
          : entriesTable(x.date, ents)) + '</div>';
    }
    function refresh() { if (document.body.contains(view)) draw(); }
    pageRefresh = refresh;
    ui.on(view, 'click', '.bl-day', function (e, b) { sel = b.dataset.date; draw(); try { history.replaceState(null, '', '#/ballot/' + sel); } catch (er) { /* file:// */ } });
    ui.on(view, 'click', '[data-action=bl-new]', function () { const open = days().filter(function (y) { return y.phase === 'open'; }); const d = open.some(function (y) { return y.date === sel; }) ? sel : open[0] && open[0].date; if (d) { sel = d; draw(); openEntry(d, null); } });
    ui.on(view, 'click', '[data-action=bl-new-here]', function () { openEntry(sel, null); });
    ui.on(view, 'click', '[data-action=bl-demo]', function () { runDemoDraw(sel); });
    function openRow(tr) { const en = B.entry(tr.dataset.id); if (!en) return; if (en.status === 'entered' && B.phase(en.date) === 'open') openEntry(en.date, en); else showEntry(en); }
    ui.on(view, 'click', 'tr.bl-tr', function (e, tr) { openRow(tr); });
    ui.on(view, 'click', 'tr.bl-rr.is-won', function (e, tr) { location.hash = '#/teesheet/' + tr.dataset.tt; });
    view.addEventListener('keydown', function (e) {
      const tr = e.target.closest && e.target.closest('tr.bl-tr, tr.bl-rr.is-won');
      if (!tr || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); if (tr.classList.contains('bl-tr')) openRow(tr); else location.hash = '#/teesheet/' + tr.dataset.tt;
    });
    ui.on(view, 'click', '.bl-tile', function (e, b) {
      if (b.dataset.act === 'bl-go-sheet') { location.hash = '#/teesheet/' + sel; return; }
      const t = ui.$(b.dataset.act === 'bl-go-missed' ? 'tr.bl-rr.is-missed' : b.dataset.act === 'bl-go-won' ? 'tr.bl-rr.is-won' : '.bl-res', view);
      if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (t.tagName === 'TR') { t.classList.add('bl-flash'); setTimeout(function () { t.classList.remove('bl-flash'); }, 1400); } }
    });
    const off = [S.subscribe('ballotEntries', refresh), S.subscribe('ballotDraws', refresh)];
    draw();
    return function () { off.forEach(function (f) { f(); }); pageRefresh = null; };
  }
  /** A drawn or withdrawn entry: read only. */
  function showEntry(e) {
    const st = e.status === 'won' ? 'Tee time ' + fmt.time(e.drawnTime) : e.status === 'missed' ? 'Missed' : e.status === 'withdrawn' ? 'Withdrawn' : 'Entered';
    ui.drawer({ title: nameOf(e.memberId), eyebrow: 'Ballot entry, ' + dayShort(e.date),
      body: '<dl class="bl-kv"><div><dt>Status</dt><dd>' + esc(st) + '</dd></div><div><dt>Group</dt><dd>' + esc(groupText(e)) + '</dd></div>' +
        '<div><dt>Preferred</dt><dd>' + esc(prefText(e) + ' (' + windowText(e) + ')') + '</dd></div><div><dt>Holes</dt><dd>' + e.holes + '</dd></div>' +
        (e.notes ? '<div><dt>Notes</dt><dd>' + esc(e.notes) + '</dd></div>' : '') +
        (e.missedReason ? '<div><dt>Why</dt><dd>' + esc(e.missedReason) + '</dd></div>' : '') +
        '<div><dt>Entered</dt><dd>' + esc((e.source === 'staff' ? 'By phone, ' + (e.enteredBy || 'staff') : 'Online') + ', ' + fmt.dateShort(String(e.createdAt).slice(0, 10))) + '</dd></div></dl>' +
        (e.teeTimeId ? '<a class="btn" href="#/teesheet/' + e.date + '">' + Club.icon('teesheet') + '<span>Open the tee sheet</span></a>' : '') });
  }

  Club.register({
    id: 'ballot', label: 'Weekend ballot', icon: 'calendar', section: 'Golf', order: 12,
    badge: function () { const n = days().filter(function (x) { return x.phase === 'open'; }).reduce(function (a, x) { return a + x.entries.filter(function (e) { return e.status === 'entered'; }).length; }, 0); return n || null; },
    search: function (q) {
      q = q.toLowerCase();
      return S.where('ballotEntries', function (e) { return e.status !== 'withdrawn' && e.date >= Club.date.today() && nameOf(e.memberId).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (e) { return { label: nameOf(e.memberId) + ', ballot ' + dayShort(e.date), sub: e.status === 'won' ? 'Tee time ' + fmt.time(e.drawnTime) : e.status === 'missed' ? 'Missed' : 'Entered, ' + prefText(e), href: 'ballot/' + e.date, icon: 'calendar' }; });
    },
    render: render
  });
})();
