/* Members: directory, member profiles, add/edit, status changes, applications pipeline, celebrations.
   Owns collections: handicapHistory, applications. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/members-data.js */
  const { WAIT, today, yearOf, pad, tierFull, setTierFull, ageOn, ageProblem, waitQueue, waitPosition, HEARD_FROM, heardFrom, cleanHeard } = Club.shared.members;


  const STATUSES = [
    { value: 'active', label: 'Active', text: 'Full use of the club and its facilities.' },
    { value: 'leave', label: 'Leave of absence', text: 'Membership held; dues paused and tee times restricted.' },
    { value: 'suspended', label: 'Suspended', text: 'Privileges withdrawn pending committee or account review.' },
    { value: 'resigned', label: 'Resigned', text: 'Membership ended. The record is kept for history.' }
  ];
  const STATUS_KIND = { active: 'good', leave: 'info', suspended: 'warn', resigned: 'outline' };
  const STAGES = ['Received', 'Interview', 'Board review', 'Approved', 'Declined'];
  const OPEN_STAGES = ['Received', 'Interview', 'Board review'];
  const CART_PREFS = ['Walk', 'Cart', 'Pull cart'];
  const DINING_PREFS = ['Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio'];
  function fullName(m) { return m ? (m.firstName + ' ' + m.lastName) : 'Former member'; }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function tierName(id) { const t = S.find('membershipTiers', id); return t ? t.name : 'No tier'; }
  function statusMeta(s) { return STATUSES.find(function (o) { return o.value === s; }) || { value: s, label: s || 'Unknown', text: '' }; }
  function statusBadge(s) { return ui.badge(statusMeta(s).label, STATUS_KIND[s] || 'plain'); }
  function monthOf(iso) { return iso ? +String(iso).slice(5, 7) : null; }
  function dayOf(iso) { return iso ? +String(iso).slice(8, 10) : null; }
  function isOpenApp(a) { return OPEN_STAGES.indexOf(a.stage) >= 0; }
  function nextMemberNo() {
    const nums = S.all('members').map(function (m) { return parseInt(m.memberNo, 10); }).filter(function (n) { return !isNaN(n); });
    return String(Math.max.apply(null, [1000].concat(nums)) + 1);
  }
  function newMemberId(no) { return S.find('members', 'mem_' + no) ? S.uid('mem') : 'mem_' + no; }
  function setErr(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid');
    f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrs(form) {
    ui.$$('.field-error', form).forEach(function (e) { e.remove(); });
    ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
  }
  function focusFirstInvalid(form) { const f = ui.$('.invalid', form); if (f) f.focus(); }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function monthLabel(d) { return d.toLocaleDateString('en-US', { month: 'long' }); }
  function rerender() { Club.app.render(); }
  /* Undo (js/core/undo.js): run fn's store writes and offer Undo on the toast. message may be a function of fn's result.
     After an undo the page redraws (only while Members is showing), unless `after` handles it. */
  function here() { return /^#\/members(\/|$)/.test(location.hash); }
  function undoable(fn, message, undone, after) {
    return Club.undo.run(fn, { message: message, undone: undone, after: function () { if (after) after(); else if (here()) rerender(); } });
  }
  function isDecided(a) { return a.stage === 'Approved' || a.stage === 'Declined'; }
  /* Kept on one line: on phones badges may wrap (mobile.css), which splits a single word in a narrow table cell */
  function onlineBadge(a) { return a.source === 'Online' ? ui.badge('Online', 'info').replace('class="badge info"', 'class="badge info" style="white-space: nowrap"') : ''; }

  /* ---------------- Directory ---------------- */
  /* The directory opens as a dense list (v2); the old 'table' mode is the list, 'cards' stays available. */
  const prefs = Object.assign({ mode: 'list', sort: 'name' }, S.getObj('membersPrefs2', {}));
  if (prefs.mode !== 'cards') prefs.mode = 'list';
  const dir = { q: '', tier: '', status: '', mode: prefs.mode, sort: prefs.sort, limit: 0 };
  const phone = function () { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; };
  const PAGE = { get list() { return phone() ? 10 : 20; }, get cards() { return phone() ? 10 : 18; } };
  let celAll = false;
  let profileTab = 'overview';

  function filtered() {
    const q = dir.q.toLowerCase().trim();
    let list = S.all('members').filter(function (m) {
      if (dir.tier && m.tierId !== dir.tier) return false;
      if (dir.status && m.status !== dir.status) return false;
      if (q) {
        const hay = (m.firstName + ' ' + m.lastName + ' ' + m.memberNo + ' ' + (m.email || '') + ' ' + (m.spouse || '') + ' ' + (m.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    const by = {
      name: function (a, b) { return (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName); },
      since: function (a, b) { return String(a.memberSince || '9999').localeCompare(String(b.memberSince || '9999')); },
      handicap: function (a, b) { const x = a.handicap == null ? 999 : a.handicap, y = b.handicap == null ? 999 : b.handicap; return x - y; },
      balance: function (a, b) { return (b.balance || 0) - (a.balance || 0); }
    };
    return list.slice().sort(by[dir.sort] || by.name);
  }

  function tierStrip() {
    const members = S.all('members');
    const items = [{ id: '', name: 'All members', count: members.length, active: members.filter(function (m) { return m.status === 'active'; }).length }]
      .concat(S.all('membershipTiers').map(function (t) {
        const of = members.filter(function (m) { return m.tierId === t.id; });
        return { id: t.id, name: t.name, count: of.length, active: of.filter(function (m) { return m.status === 'active'; }).length };
      }));
    return '<div class="mem-tiers" data-reveal role="group" aria-label="Filter by tier">' + items.map(function (t) {
      return '<button type="button" class="mem-tier' + (dir.tier === t.id ? ' active' : '') + '" data-tier="' + esc(t.id) + '" aria-pressed="' + (dir.tier === t.id) + '">' +
        '<span class="mem-tier-name">' + esc(t.name) + '</span><span class="mem-tier-count">' + t.count + '</span>' +
        '<span class="mem-tier-meta">' + t.active + ' active</span></button>';
    }).join('') + '</div>';
  }

  function celebrations() {
    const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear(); const d = now.getDate();
    const members = S.all('members').filter(function (x) { return x.status !== 'resigned'; });
    const bdays = members.filter(function (x) { return monthOf(x.dob) === m; }).sort(function (a, b) { return dayOf(a.dob) - dayOf(b.dob); });
    const anns = members.filter(function (x) { return monthOf(x.memberSince) === m && yearOf(x.memberSince) < y; }).sort(function (a, b) { return dayOf(a.memberSince) - dayOf(b.memberSince); });
    function when(day) {
      if (day === d) return ui.badge('Today', 'brass');
      return '<span class="mem-cel-date' + (day < d ? ' past' : '') + '">' + esc(fmt.dateShort(y + '-' + pad(m) + '-' + pad(day))) + '</span>';
    }
    function row(x, sub, day) {
      return '<li><a class="mem-cel-person" href="#/members/' + esc(x.id) + '">' + ui.avatar(fullName(x), 'sm') + '<span><span class="person-name">' + esc(fullName(x)) + '</span><span class="person-sub">' + sub + '</span></span></a>' + when(day) + '</li>';
    }
    /* Upcoming first (today onward), then the ones already passed this month; 3 each until "Show all" */
    function upFirst(list, dayFn) { return list.filter(function (x) { return dayFn(x) >= d; }).concat(list.filter(function (x) { return dayFn(x) < d; })); }
    const bList = upFirst(bdays, function (x) { return dayOf(x.dob); });
    const aList = upFirst(anns, function (x) { return dayOf(x.memberSince); });
    const cut = function (l) { return celAll ? l : l.slice(0, 3); };
    const bHtml = bList.length ? '<ul class="list mem-cel-list">' + cut(bList).map(function (x) { return row(x, 'Turns ' + (y - yearOf(x.dob)), dayOf(x.dob)); }).join('') + '</ul>'
      : '<p class="muted mem-cel-none">No member birthdays this month.</p>';
    const aHtml = aList.length ? '<ul class="list mem-cel-list">' + cut(aList).map(function (x) {
      const yrs = y - yearOf(x.memberSince);
      return row(x, yrs + (yrs === 1 ? ' year' : ' years') + ' a member' + (yrs % 5 === 0 ? ' · <span class="mem-milestone">Milestone</span>' : ''), dayOf(x.memberSince));
    }).join('') + '</ul>' : '<p class="muted mem-cel-none">No membership anniversaries this month.</p>';
    const more = bList.length + aList.length - cut(bList).length - cut(aList).length;
    return '<section class="panel mem-cel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(monthLabel(now)) + '</div><h3>Celebrations</h3></div>' + Club.icon('gift', 'mem-cel-icon') + '</div>' +
      '<div class="panel-body flush"><div class="mem-cel-group"><h4>Birthdays <span class="muted">' + bList.length + '</span></h4></div>' + bHtml +
      '<div class="mem-cel-group"><h4>Anniversaries <span class="muted">' + aList.length + '</span></h4></div>' + aHtml +
      (more > 0 || celAll ? '<div class="mem-cel-more"><button type="button" class="s-link" data-action="cel-all">' + (celAll ? 'Show fewer' : 'Show all (' + (bList.length + aList.length) + ')') + '</button></div>' : '') + '</div></section>';
  }

  function pipelineMini() {
    const apps = S.all('applications');
    return '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Admissions</div><h3>Applications</h3></div>' + ui.btn('Open', { sm: true, action: 'apps', icon: 'chevronRight' }) + '</div>' +
      '<ul class="list">' + STAGES.concat([WAIT]).map(function (s) {
        const n = apps.filter(function (a) { return a.stage === s; }).length;
        return '<li class="row between"><span class="ink-2">' + esc(s) + '</span><span class="num mem-mini-count">' + n + '</span></li>';
      }).join('') + '</ul></section>';
  }

  function cardHtml(m, i) {
    const t = tierOf(m);
    return '<a class="mem-card" href="#/members/' + esc(m.id) + '" style="--i:' + Math.min(i, 14) + '">' +
      '<div class="mem-card-top">' + ui.avatar(fullName(m), 'lg') + (m.status !== 'active' ? ui.badge(m.status === 'leave' ? 'On leave' : statusMeta(m.status).label, STATUS_KIND[m.status] || 'plain') : '') + '</div>' +
      '<div class="mem-card-name">' + esc(fullName(m)) + '</div>' +
      '<div class="mem-card-no">No. ' + esc(m.memberNo) + '</div>' +
      '<div class="mem-card-foot"><span>' + esc(t ? t.name : 'No tier') + '</span><span class="mem-card-hcp" title="Handicap index">' + (m.handicap == null ? 'No index' : 'HCP ' + esc(fmt.handicap(m.handicap))) + '</span></div></a>';
  }

  function tableHtml(list) {
    return '<div class="table-wrap"><table class="table mem-table"><thead><tr><th>Member</th><th>Tier</th><th>Status</th><th class="num">Handicap</th><th class="num">Since</th><th class="num">Balance</th></tr></thead><tbody>' +
      list.map(function (m) {
        const t = tierOf(m);
        return '<tr class="clickable" data-href="members/' + esc(m.id) + '" tabindex="0"><td>' + ui.person(fullName(m), 'No. ' + esc(m.memberNo) + (m.status !== 'active' ? '<span class="mem-sub-status"> · ' + esc(statusMeta(m.status).label) + '</span>' : ''), 'sm') + '</td><td class="nowrap">' + esc(t ? t.name : 'No tier') + '</td><td>' + statusBadge(m.status) + '</td>' +
          '<td class="num">' + esc(fmt.handicap(m.handicap)) + '</td><td class="num"' + (m.memberSince ? ' title="' + esc(fmt.date(m.memberSince)) + '">' + esc(yearOf(m.memberSince)) : '><span class="muted">Not set</span>') + '</td><td class="num' + ((m.balance || 0) < 0 ? ' mem-credit' : '') + '">' + esc(fmt.money(m.balance || 0)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderDirectory(view) {
    const members = S.all('members');
    const openApps = S.all('applications').filter(isOpenApp).length;
    const since = members.reduce(function (a, m) { const y = yearOf(m.memberSince); return y && y < a ? y : a; }, 9999);
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Membership', title: 'Members',
      subtitle: members.length + ' members in the ' + esc(Club.info.short) + ' family' + (since < 9999 ? ', the longest standing since ' + since : '') + '.',
      actions: '<button type="button" class="btn" data-action="apps">' + Club.icon('mail') + '<span>Applications</span>' + (openApps ? '<span class="mem-btn-count">' + openApps + '</span>' : '') + '</button>' +
        ui.btn('Add member', { kind: 'primary', icon: 'plus', action: 'add' })
    }) + tierStrip() +
      '<div class="grid grid-main-side mem-layout"><section class="panel mem-dir" data-reveal>' +
      '<div class="mem-toolbar">' +
      '<label class="mem-search">' + Club.icon('search') + '<input class="input" type="search" name="q" placeholder="Name, number or tag" aria-label="Search members by name, number, email or tag" value="' + esc(dir.q) + '"></label>' +
      '<select class="select" name="status" aria-label="Filter by status"><option value="">All statuses</option>' + ui.options(STATUSES, dir.status) + '</select>' +
      '<select class="select" name="sort" aria-label="Sort">' + ui.options([{ value: 'name', label: 'Sort by name' }, { value: 'since', label: 'Sort by member since' }, { value: 'handicap', label: 'Sort by handicap' }, { value: 'balance', label: 'Sort by balance' }], dir.sort) + '</select>' +
      ui.segmented([{ value: 'list', label: 'List' }, { value: 'cards', label: 'Cards' }], dir.mode, 'mode') +
      '</div><div class="mem-count muted"></div><div class="mem-results"></div><div class="mem-more"></div></section>' +
      '<aside class="stack">' + celebrations() + pipelineMini() + '</aside></div>';

    const results = ui.$('.mem-results', view);
    /* First page (25 rows, or 24 cards), then "Show more" adds a page in place; filters reset to page one */
    function draw(keepScroll) {
      const list = filtered();
      const limit = Math.max(dir.limit || 0, PAGE[dir.mode] || 25);
      const shown = list.slice(0, limit);
      ui.$('.mem-count', view).innerHTML = (list.length > shown.length ? 'Showing <strong>' + shown.length + '</strong> of ' + list.length : '<strong>' + list.length + '</strong>') + (list.length === members.length ? ' members' : ' of ' + members.length + ' members match') +
        ((dir.q || dir.tier || dir.status) ? ' <button type="button" class="s-link mem-link" data-action="clear">Clear filters</button>' : '');
      if (!list.length) {
        results.innerHTML = ui.empty({ icon: 'members', title: 'No members match', text: 'Try a different name or member number, or clear the filters.', action: ui.btn('Clear filters', { action: 'clear' }) });
      } else results.innerHTML = dir.mode === 'cards' ? '<div class="mem-grid">' + shown.map(cardHtml).join('') + '</div>' : tableHtml(shown);
      const left = list.length - shown.length;
      ui.$('.mem-more', view).innerHTML = left > 0 ? '<button type="button" class="btn mem-more-btn" data-action="more">Show ' + Math.min(left, PAGE[dir.mode]) + ' more</button><span class="muted">' + left + ' not shown</span>' : '';
      if (!keepScroll) ui.animateIn(results);
    }
    function reset() { dir.limit = 0; draw(); }
    function syncTierStrip() {
      ui.$$('.mem-tier', view).forEach(function (b) { const a = b.dataset.tier === dir.tier; b.classList.toggle('active', a); b.setAttribute('aria-pressed', a); });
    }
    function savePrefs() { S.setObj('membersPrefs2', { mode: dir.mode, sort: dir.sort }); }
    draw();

    ui.on(view, 'input', 'input[name=q]', function (e, f) { dir.q = f.value; reset(); });
    ui.on(view, 'change', '.mem-toolbar select', function (e, f) {
      dir[f.name] = f.value; if (f.name === 'sort') savePrefs();
      reset();
    });
    ui.on(view, 'click', '.mem-toolbar .segmented button', function (e, b) {
      dir.mode = b.dataset.value; savePrefs();
      ui.$$('.mem-toolbar .segmented button', view).forEach(function (x) { x.classList.toggle('active', x === b); });
      reset();
    });
    ui.on(view, 'click', '[data-action=more]', function () {
      const n = ui.$$(dir.mode === 'cards' ? '.mem-card' : 'tbody tr', results).length;
      dir.limit = n + PAGE[dir.mode]; draw(true);
      const first = (dir.mode === 'cards' ? ui.$$('.mem-card', results) : ui.$$('tbody tr', results))[n]; if (first) first.focus();
    });
    ui.on(view, 'click', '[data-action=cel-all]', function () {
      celAll = !celAll; const old = ui.$('.mem-cel', view); const fresh = ui.el(celebrations()); fresh.classList.add('revealed'); old.replaceWith(fresh);
      const b = ui.$('[data-action=cel-all]', fresh); if (b) b.focus();
    });
    ui.on(view, 'click', '.mem-tier', function (e, b) { dir.tier = dir.tier === b.dataset.tier ? '' : b.dataset.tier; syncTierStrip(); reset(); });
    ui.on(view, 'click', '[data-action=clear]', function () {
      dir.q = ''; dir.tier = ''; dir.status = '';
      ui.$('input[name=q]', view).value = ''; ui.$('select[name=status]', view).value = ''; syncTierStrip(); reset();
    });
    ui.on(view, 'click', 'tr[data-href]', function (e, tr) { Club.app.go(tr.dataset.href); });
    ui.on(view, 'keydown', 'tr[data-href]', function (e, tr) { if (e.key === 'Enter') Club.app.go(tr.dataset.href); });
    ui.on(view, 'click', '[data-action=add]', function () { openMemberForm(null); });
    ui.on(view, 'click', '[data-action=apps]', function () { Club.app.go('members/applications'); });
  }

  /* ---------------- Profile ---------------- */
  function hcpHistory(id) {
    return S.all('handicapHistory').filter(function (h) { return h.memberId === id && typeof h.index === 'number'; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function roundsFor(id) {
    return S.all('teeTimes').filter(function (t) { return t && Array.isArray(t.players) && t.players.some(function (p) { return p && p.memberId === id; }); });
  }
  const TT_KIND = { booked: 'info', 'checked-in': 'brass', 'on-course': 'good', completed: 'plain', 'no-show': 'bad', cancelled: 'outline' };
  /* Stored statuses are lower case ('no-show'); show them as words: 'No show' */
  function resLabel(s) { s = String(s || ''); return s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/-/g, ' ') : ''; }
  const RES_KIND = { confirmed: 'info', seated: 'brass', completed: 'plain', cancelled: 'outline', 'no-show': 'bad', scheduled: 'info', published: 'info', draft: 'outline' };

  function renderProfile(view, id) {
    const m = S.find('members', id);
    if (!m) {
      view.innerHTML = '<a class="mem-back" href="#/members">' + Club.icon('chevronLeft') + 'All members</a>' + ui.empty({ icon: 'members', title: 'Member not found', text: 'This record may have been removed or the link is out of date.', action: ui.btn('Back to directory', { action: 'back', kind: 'primary' }) });
      ui.on(view, 'click', '[data-action=back]', function () { Club.app.go('members'); });
      return;
    }
    const t = tierOf(m);
    const hist = hcpHistory(id);
    const sinceY = yearOf(m.memberSince);
    const yrs = sinceY ? new Date().getFullYear() - sinceY : null;
    const spark = hist.length > 1 ? '<span class="mem-spark" data-tip="Handicap index over the last ' + hist.length + ' revisions">' + Club.charts.sparkline(hist.map(function (h) { return -h.index; }), { width: 96, height: 28, color: 'var(--on-dark-2)' }) + '</span>' : '';
    const bal = m.balance || 0;
    const back = statusBack(m);

    view.innerHTML = '<a class="mem-back" href="#/members">' + Club.icon('chevronLeft') + 'All members</a>' +
      '<section class="panel dark mem-hero" data-reveal>' +
      '<div class="mem-hero-main">' + ui.avatar(fullName(m), 'xl') +
      '<div class="mem-hero-id"><div class="eyebrow">Member No. ' + esc(m.memberNo) + '</div><h1 class="mem-hero-name">' + esc(fullName(m)) + '</h1>' +
      '<div class="row wrap mem-hero-badges">' + ui.badge(t ? t.name : 'No tier', 'plain') + statusBadge(m.status) +
      (back ? '<button type="button" class="mem-status-back" data-action="status-back" title="' + esc('Status changed from ' + statusMeta(back.from).label.toLowerCase() + ' on ' + fmt.date(back.on)) + '">' + Club.icon('chevronLeft') + '<span>Undo: back to ' + esc(statusMeta(back.from).label) + '</span></button>' : '') +
      (m.tags || []).map(function (g) { return ui.badge(g, 'plain'); }).join('') + '</div>' +
      '<p class="mem-since">' + (sinceY ? 'Member since ' + sinceY + (yrs > 0 ? ', ' + yrs + (yrs === 1 ? ' year' : ' years') : '') : 'Joining date not recorded') + '</p></div></div>' +
      '<dl class="mem-facts">' +
      '<div><dt>Handicap index</dt><dd><span class="mem-fact-big">' + esc(fmt.handicap(m.handicap)) + '</span>' + spark + '</dd></div>' +
      '<div><dt>Plays</dt><dd>' + (Club.members.hand(m) ? esc(Club.members.hand(m)) : '<span class="muted">Not recorded</span>') + '</dd></div>' +
      '<div><dt>Golf Canada no.</dt><dd>' + (m.ghin ? esc(m.ghin) : '<span class="muted">None</span>') + '</dd></div>' +
      '<div><dt>Locker</dt><dd>' + (m.locker ? 'No. ' + esc(m.locker) : '<span class="muted">Unassigned</span>') + '</dd></div>' +
      '<div><dt>Account balance</dt><dd><a class="mem-fact-link" href="#/billing/' + esc(m.id) + '">' + esc(fmt.money(bal)) + '</a></dd></div>' +
      '</dl>' +
      '<div class="mem-hero-actions">' +
      ui.btn('Book tee time', { kind: 'brass', icon: 'teesheet', action: 'book' }) + ui.btn('Post charge', { icon: 'billing', action: 'charge' }) +
      ui.btn('Edit', { icon: 'edit', action: 'edit' }) + ui.btn('Change status', { icon: 'refresh', action: 'status' }) + '</div></section>' +
      '<div class="mem-tabs" data-reveal></div>';

    ui.tabs(ui.$('.mem-tabs', view), [
      { id: 'overview', label: 'Overview', render: function (p) { tabOverview(p, m); } },
      { id: 'golf', label: 'Golf', render: function (p) { tabGolf(p, m, hist); } },
      { id: 'activity', label: 'Activity', render: function (p) { tabActivity(p, m); } },
      { id: 'spending', label: 'Spending', render: function (p) { tabSpending(p, m); } },
      { id: 'account', label: 'Account', render: function (p) { tabAccount(p, m); } }
    ], profileTab, function (tid) { profileTab = tid; if (history.replaceState) history.replaceState(null, '', '#/members/' + encodeURIComponent(m.id) + (tid === 'overview' ? '' : '/' + tid)); });

    ui.on(view, 'click', '[data-action=book]', function () { Club.app.go('teesheet'); });
    ui.on(view, 'click', '[data-action=charge]', function () {
      if (Club.billing && Club.billing.postCharge) Club.billing.postCharge(m.id, rerender);
      else ui.toast('Billing is not available right now', 'bad');
    });
    ui.on(view, 'click', '[data-action=edit]', function () { openMemberForm(m); });
    ui.on(view, 'click', '[data-action=status]', function () { openStatus(m); });
    ui.on(view, 'click', '[data-action=status-back]', function () { stepBackStatus(m.id); });
    ui.on(view, 'click', '[data-action=save-notes]', function (e, b) {
      const ta = ui.$('textarea[name=memberNotes]', view);
      undoable(function () { S.update('members', m.id, { notes: ta.value.trim(), notesUpdatedOn: today() }); }, 'Notes saved', 'Notes restored');
      b.closest('.panel').querySelector('.mem-notes-meta').textContent = 'Saved ' + fmt.date(today());
    });
    ui.on(view, 'click', 'tr[data-href]', function (e, tr) { Club.app.go(tr.dataset.href); });
    ui.on(view, 'keydown', 'tr[data-href]', function (e, tr) { if (e.key === 'Enter') Club.app.go(tr.dataset.href); });
  }

  function kv(rows) {
    return '<dl class="kv mem-kv">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + (r[1] == null || r[1] === '' ? '<span class="muted">Not recorded</span>' : r[1]) + '</dd>'; }).join('') + '</dl>';
  }

  function tabOverview(p, m) {
    const pr = m.preferences || {};
    const age = m.dob ? (function () { const d = fmt.toDate(m.dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; })() : null;
    p.innerHTML = '<div class="grid grid-2">' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Contact</h3>' + Club.icon('phone', 'mem-ph-icon') + '</div><div class="panel-body">' + kv([
        ['Email', m.email ? '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' : null],
        ['Phone', m.phone ? esc(m.phone) : null],
        ['Address', m.address ? esc(m.address) : null],
        ['Birthday', m.dob ? esc(fmt.date(m.dob)) + (age != null ? ' <span class="muted">(' + age + ')</span>' : '') : null]
      ]) + '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Family</h3>' + Club.icon('members', 'mem-ph-icon') + '</div><div class="panel-body">' + kv([
        ['Spouse or partner', m.spouse ? esc(m.spouse) : 'None listed'],
        ['Children', m.children ? String(m.children) + (m.children === 1 ? ' child' : ' children') + ' with junior privileges' : 'None listed']
      ]) + '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Preferences</h3>' + Club.icon('star', 'mem-ph-icon') + '</div><div class="panel-body">' + kv([
        ['On the course', pr.cart ? esc(pr.cart) : null],
        ['Favourite spot to eat', pr.dining ? esc(pr.dining) : null],
        ['Service notes', pr.notes ? esc(pr.notes) : null]
      ]) + '<div class="mem-tags"><span class="mem-tags-label">Tags</span><div class="row wrap">' + ((m.tags || []).length ? m.tags.map(function (g) { return ui.badge(g, 'outline'); }).join('') : '<span class="muted">No tags</span>') + '</div></div></div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Office notes</h3><span class="muted mem-notes-meta">' + (m.notesUpdatedOn ? 'Saved ' + esc(fmt.date(m.notesUpdatedOn)) : '') + '</span></div><div class="panel-body">' +
      '<textarea class="textarea" name="memberNotes" aria-label="Office notes" placeholder="Private notes for staff, never shown to the member.">' + esc(m.notes || '') + '</textarea>' +
      '<div class="row mem-notes-foot">' + ui.btn('Save notes', { sm: true, kind: 'primary', action: 'save-notes' }) + '</div></div></section>' +
      '</div>';
  }

  function tabGolf(p, m, hist) {
    const T = today();
    const rounds = roundsFor(m.id);
    const upcoming = rounds.filter(function (r) { return r.date >= T && ['booked', 'checked-in', 'on-course'].indexOf(r.status) >= 0; }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    const recent = rounds.filter(function (r) { return r.date < T || r.status === 'completed'; }).filter(function (r) { return r.status !== 'cancelled'; }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
    const yearRounds = recent.filter(function (r) { return r.status === 'completed' && String(r.date).slice(0, 4) === T.slice(0, 4); }).length;
    const first = hist.length ? hist[0].index : null;
    const change = first != null && m.handicap != null ? Math.round((m.handicap - first) * 10) / 10 : null;

    function rows(list, emptyText) {
      if (!list.length) return ui.empty({ icon: 'flag', title: 'No rounds', text: emptyText });
      return '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Time</th><th class="num">Holes</th><th>Group</th><th>Status</th></tr></thead><tbody>' + list.slice(0, 8).map(function (r) {
        const others = (r.players || []).filter(function (x) { return x && x.memberId !== m.id; }).map(function (x) { return x.memberId ? Club.members.name(x.memberId) : (x.name || 'Guest'); });
        return '<tr class="clickable" data-href="teesheet/' + esc(r.date) + '"><td class="nowrap">' + esc(fmt.date(r.date)) + '</td><td class="nowrap">' + esc(fmt.time(r.time)) + '</td><td class="num">' + esc(r.holes || 18) + '</td><td class="ink-2">' + (others.length ? esc(others.join(', ')) : 'Playing alone') + '</td><td>' + ui.badge(String(r.status || 'booked').replace('-', ' '), TT_KIND[r.status] || 'plain') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    const upList = upcoming.length ? '<ul class="list mem-up">' + upcoming.slice(0, 6).map(function (r) {
      const others = (r.players || []).filter(function (x) { return x && x.memberId !== m.id; }).map(function (x) { return x.memberId ? Club.members.name(x.memberId) : (x.name || 'Guest'); });
      return '<li><a class="mem-stack" href="#/teesheet/' + esc(r.date) + '"><span class="person-name">' + esc(fmt.weekday(r.date) + ', ' + fmt.dateShort(r.date)) + ' · ' + esc(fmt.time(r.time)) + '</span><span class="person-sub">' + (others.length ? 'With ' + esc(others.join(', ')) : 'Playing alone') + '</span></a>' + ui.badge(String(r.status || 'booked').replace('-', ' '), TT_KIND[r.status] || 'plain') + '</li>';
    }).join('') + '</ul>' : ui.empty({ icon: 'teesheet', title: 'Nothing booked', text: 'No upcoming tee times for this member.' });
    let trend;
    if (m.handicap == null && !hist.length) trend = ui.empty({ icon: 'flag', title: 'No handicap on file', text: 'Add a Golf Canada number and index from Edit to track this member’s handicap.' });
    else if (hist.length < 2) trend = ui.empty({ icon: 'reports', title: 'Not enough revisions yet', text: 'The trend appears after two handicap revisions.' });
    else {
      const vals = hist.map(function (h) { return h.index; });
      const labels = hist.map(function (h) { return fmt.toDate(h.date).toLocaleDateString('en-US', { month: 'short' }); });
      trend = vals.every(function (v) { return v >= 0; })
        ? Club.charts.line({ labels: labels, series: [{ name: 'Index', values: vals, color: 'var(--c1)' }], height: 200 })
        : '<div class="mem-wide-spark">' + Club.charts.sparkline(vals.map(function (v) { return -v; }), { width: 600, height: 140, color: 'var(--c1)' }) + '</div>';
    }

    p.innerHTML = ui.stats([
      { label: 'Handicap index', value: fmt.handicap(m.handicap), meta: change == null ? 'No history' : (change === 0 ? 'Unchanged over 12 months' : (change < 0 ? 'Down ' + Math.abs(change).toFixed(1) : 'Up ' + change.toFixed(1)) + ' over 12 months') },
      { label: 'Rounds this year', value: yearRounds, meta: 'Completed on the tee sheet' },
      { label: 'Upcoming', value: upcoming.length, meta: upcoming.length ? 'Next ' + fmt.dateShort(upcoming[0].date) : 'Nothing booked' }
    ]) +
      '<div class="grid grid-main-side mem-gap">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Last 12 revisions</div><h3>Handicap trend</h3></div></div><div class="panel-body">' + trend + '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Upcoming tee times</h3><a href="#/teesheet">Tee sheet</a></div><div class="panel-body flush">' + upList + '</div></section></div>' +
      '<section class="panel mem-gap" data-reveal><div class="panel-head"><h3>Recent rounds</h3></div><div class="panel-body flush">' + rows(recent, 'Rounds appear here once they are played.') + '</div></section>' +
      lessonPanels(m);
    /* Lesson packages: Sell package (one account charge, with Undo) and each package's details (js/modules/lessons.js) */
    const LS = Club.lessonsStaff;
    ui.on(p, 'click', '[data-action=sell-pk]', function () { if (LS) LS.sellPackage({ memberId: m.id, after: function () { if (here()) rerender(); } }); });
    ui.on(p, 'click', '[data-pk]', function (e, b) { if (LS) LS.packageDetail(b.dataset.pk); });
  }
  /* The Golf tab's lesson packages and the pros' lesson notes (staff only: never shown in the members' portal).
     Each note row opens its lesson on the Lessons page (#/lessons/<date>/<lessonId>). */
  function lessonPanels(m) {
    const LP = Club.lessonPacks, LS = Club.lessonsStaff;
    let out = '';
    if (LP && LS) {
      const packs = LP.forMember(m.id);
      out += '<section class="panel mem-gap mem-pks" data-reveal><div class="panel-head"><div><div class="eyebrow">Lessons</div><h3>Lesson packages</h3></div>' + ui.btn('Sell package', { sm: true, icon: 'tag', action: 'sell-pk' }) + '</div><div class="panel-body flush">' +
        (packs.length ? '<ul class="list mem-pk-list">' + packs.map(function (mp) {
          return '<li><button type="button" class="mem-pk' + (LP.expired(mp) || !LP.remaining(mp) ? ' done' : '') + '" data-pk="' + esc(mp.id) + '"><span class="mem-pk-main"><span class="person-name">' + esc(mp.name) + '</span><span class="person-sub">' + esc(LP.coversText(mp.covers) + ' · bought ' + fmt.dateShort(mp.purchasedOn || String(mp.purchasedAt).slice(0, 10))) + '</span></span>' +
            '<span class="mem-pk-left">' + LS.pkgBar(mp) + '<span>' + esc(LS.pkgLeft(mp)) + '</span>' + LS.pkgStateBadge(mp) + '</span></button></li>';
        }).join('') + '</ul>' : ui.empty({ icon: 'lesson', title: 'No lesson packages', text: 'Packages this member buys, here or in the members’ portal, appear here.' })) + '</div></section>';
    }
    const noted = S.all('lessons').filter(function (l) { return l && l.memberId === m.id && String(l.lessonNotes || '').trim(); })
      .sort(function (a, b) { return (String(b.date) + b.time).localeCompare(String(a.date) + a.time); });
    out += '<section class="panel mem-gap mem-lnotes" data-reveal><div class="panel-head"><div><div class="eyebrow">Staff only</div><h3>Lesson notes</h3></div><span class="muted">' + noted.length + ' on record</span></div><div class="panel-body flush">' +
      (noted.length ? '<div class="table-wrap"><table class="table mem-lnotes-t"><thead><tr><th>Date</th><th>Pro</th><th>Notes</th></tr></thead><tbody>' + noted.map(function (l) {
        const pro = Club.staff.get(l.proId), first = String(l.lessonNotes).trim().split(/\n/)[0];
        return '<tr class="clickable" data-href="lessons/' + esc(l.date) + '/' + esc(l.id) + '" tabindex="0" aria-label="' + esc('Open the lesson of ' + fmt.date(l.date)) + '"><td class="nowrap">' + esc(fmt.dateShort(l.date)) + '</td><td class="nowrap">' + esc(pro ? pro.firstName : 'Pro') + '</td><td class="mem-lnote"><span>' + esc(first) + '</span></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted mem-lnotes-hint">Each row opens the lesson with its full notes.</p>'
        : ui.empty({ icon: 'lesson', title: 'No lesson notes yet', text: 'Notes the professionals write in a lesson appear here. Members never see them.' })) + '</div></section>';
    return out;
  }

  function tabActivity(p, m) {
    const dining = S.all('diningReservations').filter(function (r) { return r && r.memberId === m.id; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const events = S.all('events').filter(function (e) { return e && Array.isArray(e.registrations) && e.registrations.some(function (r) { return r && r.memberId === m.id; }); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const lessons = S.all('lessons').filter(function (l) { return l && l.memberId === m.id; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    /* Each history shows its latest 5 rows; "View all" opens the rest in place */
    function panel(title, icon, list, emptyText, head, row) {
      const all = Math.min(list.length, 40);
      return '<section class="panel mem-act" data-reveal><div class="panel-head"><h3>' + esc(title) + '</h3><span class="muted">' + list.length + ' on record</span></div><div class="panel-body flush">' +
        (list.length ? '<div class="table-wrap"><table class="table"><thead><tr>' + head.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.t || h) + '</th>'; }).join('') + '</tr></thead><tbody>' + list.slice(0, 5).map(row).join('') + '</tbody>' +
          (list.length > 5 ? '<tbody hidden class="mem-act-rest">' + list.slice(5, all).map(row).join('') + '</tbody>' : '') + '</table></div>' +
          (list.length > 5 ? '<div class="mem-act-more"><button type="button" class="s-link" data-action="act-all" data-n="' + all + '">View all (' + all + ')</button></div>' : '')
          : ui.empty({ icon: icon, title: 'Nothing yet', text: emptyText })) + '</div></section>';
    }
    p.innerHTML = '<div class="stack">' +
      panel('Dining reservations', 'dining', dining, 'Reservations made in Dining appear here.', ['Date', 'Venue', { t: 'Party', num: true }, 'Occasion', 'Status'], function (r) {
        return '<tr><td class="nowrap">' + esc(fmt.date(r.date)) + (r.time ? ' <span class="muted">' + esc(fmt.time(r.time)) + '</span>' : '') + '</td><td>' + esc(r.venue || '') + '</td><td class="num">' + esc(r.partySize || '') + '</td><td class="ink-2">' + esc(r.occasion || '') + '</td><td>' + ui.badge(resLabel(r.status || 'confirmed'), RES_KIND[r.status] || 'plain') + '</td></tr>';
      }) +
      panel('Event registrations', 'events', events, 'Events this member registers for appear here.', ['Event', 'Date', 'Type', { t: 'Guests', num: true }, 'Status'], function (e) {
        const reg = e.registrations.find(function (r) { return r && r.memberId === m.id; }) || {};
        return '<tr class="clickable" data-href="events/' + esc(e.id) + '" tabindex="0"><td class="primary-cell">' + esc(e.title || 'Event') + '</td><td class="nowrap">' + esc(fmt.date(e.date)) + '</td><td>' + esc(e.type || '') + '</td><td class="num">' + esc(reg.guests || 0) + '</td><td>' + ui.badge(resLabel(e.status || 'published'), RES_KIND[e.status] || 'plain') + '</td></tr>';
      }) +
      panel('Lessons', 'lesson', lessons, 'Lessons booked with our CPGA professionals appear here.', ['Date', 'Type', 'Professional', { t: 'Price', num: true }, 'Status'], function (l) {
        /* Opens Lessons on that day; the lesson id follows, for Lessons to open the lesson itself */
        return '<tr class="clickable" data-href="lessons/' + esc(l.date) + '/' + esc(l.id) + '" tabindex="0"><td class="nowrap">' + esc(fmt.date(l.date)) + (l.time ? ' <span class="muted">' + esc(fmt.time(l.time)) + '</span>' : '') + '</td><td>' + esc(l.type || '') + '</td><td>' + esc(Club.staff.name(l.proId)) + '</td><td class="num">' + (l.packageId ? '<span class="muted">Package</span>' : esc(fmt.money(l.price || 0))) + '</td><td>' + ui.badge(resLabel(l.status || 'scheduled'), RES_KIND[l.status] || 'plain') + '</td></tr>';
      }) + '</div>';
    ui.on(p, 'click', '[data-action=act-all]', function (e, b) {
      const rest = ui.$('.mem-act-rest', b.closest('.mem-act')); if (!rest) return;
      rest.hidden = !rest.hidden; b.textContent = rest.hidden ? 'View all (' + b.dataset.n + ')' : 'Show fewer';
    });
  }

  /* Spending: the client breakdown shared with Reports, Clients (Club.clientStats, js/modules/reports-clients.js) */
  function tabSpending(p, m) {
    if (Club.clientStats && Club.clientStats.memberTab) Club.clientStats.memberTab(p, m);
    else p.innerHTML = ui.empty({ icon: 'billing', title: 'Spending is not available', text: 'The spending breakdown comes from Reports, which is not loaded.' });
  }

  function tabAccount(p, m) {
    const charges = S.all('charges').filter(function (c) { return c.memberId === m.id; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const pays = S.all('payments').filter(function (x) { return x.memberId === m.id; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const mk = today().slice(0, 7), yk = today().slice(0, 4);
    const monthCharges = charges.filter(function (c) { return String(c.date).slice(0, 7) === mk; }).reduce(function (a, c) { return a + (+c.amount || 0); }, 0);
    const ytdPaid = pays.filter(function (x) { return String(x.date).slice(0, 4) === yk; }).reduce(function (a, x) { return a + (+x.amount || 0); }, 0);
    const t = tierOf(m);
    p.innerHTML = '<div class="mem-acct-stats" data-reveal>' +
      '<div><span class="label-caps">Balance due</span><span class="stat-value">' + esc(fmt.money(m.balance || 0)) + '</span></div>' +
      '<div><span class="label-caps">Charges this month</span><span class="stat-value">' + esc(fmt.money(monthCharges)) + '</span></div>' +
      '<div><span class="label-caps">Paid this year</span><span class="stat-value">' + esc(fmt.money(ytdPaid)) + '</span></div>' +
      '<div><span class="label-caps">Monthly dues</span><span class="stat-value">' + (t && t.annualDues == null ? 'Not set' : esc(fmt.money(t ? t.annualDues / 12 : 0))) + '</span></div></div>' +
      '<div class="row wrap mem-acct-actions">' + ui.btn('Open account statement', { kind: 'primary', icon: 'billing', action: 'open-billing' }) + ui.btn('Post charge', { icon: 'plus', action: 'charge' }) + '</div>' +
      '<div class="grid grid-main-side">' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Recent charges</h3><a href="#/billing/' + esc(m.id) + '">Full ledger</a></div><div class="panel-body flush">' +
      (charges.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>' + charges.slice(0, 10).map(function (c) {
        return '<tr><td class="nowrap">' + esc(fmt.date(c.date)) + '</td><td>' + esc(c.description || '') + '</td><td class="ink-2">' + esc(c.category || 'Other') + '</td><td class="num' + (c.amount < 0 ? ' mem-credit' : '') + '">' + esc(fmt.money(c.amount)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : ui.empty({ icon: 'billing', title: 'No charges', text: 'Charges posted to this account will appear here.' })) + '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Payments</h3></div><div class="panel-body flush">' +
      (pays.length ? '<ul class="list">' + pays.slice(0, 6).map(function (x) {
        return '<li class="row between"><span class="mem-stack"><span class="person-name">' + esc(fmt.date(x.date)) + '</span><span class="person-sub">' + esc(Club.billing && Club.billing.methodLabel ? Club.billing.methodLabel(x.method) : (x.method || '')) + (x.reference ? ' · ' + esc(x.reference) : '') + '</span></span><span class="num">' + esc(fmt.money(x.amount)) + '</span></li>';
      }).join('') + '</ul>' : ui.empty({ icon: 'cash', title: 'No payments', text: 'Recorded payments appear here.' })) + '</div></section></div>';
    ui.on(p, 'click', '[data-action=open-billing]', function () { Club.app.go('billing/' + m.id); });
  }

  /* ---------------- Add / edit member ---------------- */
  function openMemberForm(m) {
    const isNew = !m;
    const d = m || { memberNo: nextMemberNo(), status: 'active', tierId: 'tier_full', memberSince: today(), preferences: {}, tags: [], children: 0 };
    const pr = d.preferences || {};
    const sec = function (t) { return '<div class="span-2 mem-form-sec"><h4>' + esc(t) + '</h4></div>'; };
    const body = '<form class="form-grid mem-form" novalidate>' +
      sec('Identity') +
      ui.field({ label: 'First name', name: 'firstName', value: d.firstName, required: true }) +
      ui.field({ label: 'Last name', name: 'lastName', value: d.lastName, required: true }) +
      ui.field({ label: 'Member number', name: 'memberNo', value: d.memberNo, required: true, hint: 'Three to six digits, unique to this member' }) +
      ui.field({ label: 'Tier', name: 'tierId', type: 'select', required: true, options: ui.options(S.all('membershipTiers').map(function (t) { return { value: t.id, label: t.name + ' · ' + (t.annualDues == null ? 'price not set' : fmt.money(t.annualDues, false) + ' a year') }; }), d.tierId) }) +
      ui.field({ label: 'Status', name: 'status', type: 'select', options: ui.options(STATUSES, d.status) }) +
      ui.field({ label: 'Member since', name: 'memberSince', type: 'date', value: d.memberSince, required: true }) +
      ui.field({ label: 'Date of birth', name: 'dob', type: 'date', value: d.dob }) +
      ui.field({ label: 'Tags', name: 'tags', value: (d.tags || []).join(', '), placeholder: 'Board, Committee', hint: 'Separate with commas' }) +
      sec('Contact') +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: d.email, required: true }) +
      ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: d.phone, placeholder: '(555) 410-0000' }) +
      ui.field({ label: 'Address', name: 'address', value: d.address, span2: true }) +
      ui.field({ label: 'Spouse or partner', name: 'spouse', value: d.spouse }) +
      ui.field({ label: 'Children', name: 'children', type: 'number', value: d.children || 0, min: 0, max: 12, step: 1 }) +
      sec('Golf') +
      ui.field({ label: 'Handicap index', name: 'handicap', type: 'number', value: d.handicap, step: 0.1, min: -10, max: 54, hint: 'Use a negative number for a plus handicap' }) +
      ui.field({ label: 'Plays', name: 'hand', type: 'select', options: '<option value="">Not recorded</option>' + ui.options(Club.members.HANDS, d.hand || '') }) +
      ui.field({ label: 'Golf Canada number', name: 'ghin', value: d.ghin, placeholder: '7 digits' }) +
      ui.field({ label: 'Locker', name: 'locker', value: d.locker }) +
      ui.field({ label: 'On the course', name: 'cart', type: 'select', options: ui.options(CART_PREFS, pr.cart || 'Cart') }) +
      sec('Hospitality') +
      ui.field({ label: 'Favourite spot to eat', name: 'dining', type: 'select', options: ui.options(DINING_PREFS, pr.dining || 'Gallery Taphouse & Grill') }) +
      ui.field({ label: 'Service notes', name: 'prefNotes', value: pr.notes, placeholder: 'Prefers a window table, no shellfish' }) +
      '</form>';
    ui.modal({
      title: isNew ? 'Add member' : 'Edit ' + fullName(m), eyebrow: isNew ? 'New member record' : 'Member No. ' + m.memberNo, size: 'lg', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save member', kind: 'primary', icon: 'check', onClick: function (api) {
            const form = ui.$('form', api.el);
            clearErrs(form);
            let ok = ui.validate(form);
            const v = ui.formData(form);
            if (v.memberNo && !/^\d{3,6}$/.test(v.memberNo)) { setErr(form, 'memberNo', 'Use three to six digits.'); ok = false; }
            else if (v.memberNo && S.all('members').some(function (x) { return x.memberNo === v.memberNo && (!m || x.id !== m.id); })) { setErr(form, 'memberNo', 'Number ' + v.memberNo + ' already belongs to ' + Club.members.name(S.all('members').find(function (x) { return x.memberNo === v.memberNo; })) + '.'); ok = false; }
            if (v.email && !EMAIL_RE.test(v.email)) { setErr(form, 'email', 'Enter a valid email address.'); ok = false; }
            if (v.handicap != null && (isNaN(v.handicap) || v.handicap < -10 || v.handicap > 54)) { setErr(form, 'handicap', 'Handicap index must be between +10.0 and 54.0.'); ok = false; }
            if (v.ghin && !/^\d{6,8}$/.test(v.ghin)) { setErr(form, 'ghin', 'Golf Canada numbers are six to eight digits.'); ok = false; }
            if (v.memberSince && v.memberSince > today()) { setErr(form, 'memberSince', 'The joining date cannot be in the future.'); ok = false; }
            if (v.dob && v.dob > today()) { setErr(form, 'dob', 'Date of birth cannot be in the future.'); ok = false; }
            if (v.children != null && (v.children < 0 || v.children > 12 || v.children % 1)) { setErr(form, 'children', 'Enter a whole number from 0 to 12.'); ok = false; }
            if (!ok) { focusFirstInvalid(form); return false; }
            const doc = {
              memberNo: v.memberNo, firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone, address: v.address,
              tierId: v.tierId, status: v.status || 'active', memberSince: v.memberSince, dob: v.dob || null,
              handicap: v.handicap == null ? null : Math.round(v.handicap * 10) / 10, ghin: v.ghin || null, locker: v.locker || null,
              hand: v.hand === 'left' || v.hand === 'right' ? v.hand : null,
              spouse: v.spouse || null, children: v.children || 0,
              preferences: { cart: v.cart, dining: v.dining, notes: v.prefNotes || '' },
              tags: v.tags ? v.tags.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : []
            };
            if (isNew) {
              /* Undo removes the new record (and its first handicap entry) and leaves its page for the directory */
              const created = undoable(function () {
                const c = S.insert('members', Object.assign({ id: newMemberId(doc.memberNo), balance: 0, notes: '' }, doc));
                if (c.handicap != null) S.insert('handicapHistory', { memberId: c.id, date: today(), index: c.handicap });
                return c;
              }, function (c) { return fullName(c) + ' added as member ' + c.memberNo; }, 'New member removed', function () {
                if (decodeURIComponent(location.hash.split('/')[2] || '') === created.id) Club.app.go('members'); else if (here()) rerender();
              });
              Club.app.go('members/' + created.id);
            } else {
              const prevH = m.handicap;
              /* A status changed here is recorded in the status history like the Change status dialog, so the profile
                 offers the same step back. */
              const cur = S.find('members', m.id) || m;
              const moved = doc.status !== cur.status, meta = statusMeta(doc.status);
              if (moved) doc.statusHistory = (cur.statusHistory || []).concat([{ from: cur.status, to: doc.status, on: today(), reason: '' }]);
              const save = function () {
                undoable(function () {
                  S.update('members', m.id, doc);
                  if (doc.handicap != null && doc.handicap !== prevH) S.insert('handicapHistory', { memberId: m.id, date: today(), index: doc.handicap });
                }, moved ? 'Member saved. ' + fullName(doc) + ' is now ' + meta.label.toLowerCase() : 'Member saved', 'Member details restored');
                api.close(); rerender();
              };
              /* Suspending or resigning a member through Edit asks first, the same as the Change status dialog. */
              if (moved && (doc.status === 'suspended' || doc.status === 'resigned')) {
                ui.confirm({
                  title: 'Mark as ' + meta.label.toLowerCase() + '?',
                  text: fullName(doc) + ' will move from ' + statusMeta(cur.status).label.toLowerCase() + ' to ' + meta.label.toLowerCase() + '. ' + meta.text,
                  confirmLabel: 'Save and change status', danger: true
                }).then(function (yes) { if (yes) save(); });
                return false;
              }
              save();
              return false;
            }
          }
        }
      ]
    });
  }

  /* ---------------- Change status ---------------- */
  function openStatus(m) {
    const body = '<form class="mem-status-form"><p class="ink-2">Current status: ' + statusBadge(m.status) + '</p><div class="mem-status-opts" role="radiogroup" aria-label="New status">' +
      STATUSES.map(function (s) {
        return '<label class="mem-status-opt"><input type="radio" name="status" value="' + s.value + '"' + (s.value === m.status ? ' checked' : '') + '><span><strong>' + esc(s.label) + '</strong><span class="muted">' + esc(s.text) + '</span></span></label>';
      }).join('') + '</div>' + ui.field({ label: 'Reason or note', name: 'reason', type: 'textarea', placeholder: 'Recorded on the member file' }) + '</form>';
    ui.modal({
      title: 'Change status', eyebrow: fullName(m), body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Update status', kind: 'primary', onClick: function (api) {
            const v = ui.formData(ui.$('form', api.el));
            if (!v.status || v.status === m.status) { ui.toast('Status unchanged'); return; }
            const meta = statusMeta(v.status);
            const apply = function () {
              const cur = S.find('members', m.id) || m;
              const hist = (cur.statusHistory || []).concat([{ from: cur.status, to: v.status, on: today(), reason: v.reason || '' }]);
              undoable(function () { S.update('members', m.id, { status: v.status, statusHistory: hist }); },
                fullName(m) + ' is now ' + meta.label.toLowerCase(), fullName(m) + ' is back to ' + statusMeta(cur.status).label.toLowerCase());
              api.close(); rerender();
            };
            ui.confirm({
              title: 'Mark as ' + meta.label.toLowerCase() + '?',
              text: fullName(m) + ' will move from ' + statusMeta(m.status).label.toLowerCase() + ' to ' + meta.label.toLowerCase() + '. ' + meta.text,
              confirmLabel: 'Confirm change', danger: v.status === 'suspended' || v.status === 'resigned'
            }).then(function (yes) { if (yes) apply(); });
            return false;
          }
        }
      ]
    });
  }
  /* Step back: for a week after a status change the profile offers "Undo: back to <previous>". It reads the last
     statusHistory entry, and the step back is recorded there too (marked back, so it is not offered again). */
  const STATUS_BACK_DAYS = 7;
  function statusBack(m) {
    const h = (m && m.statusHistory) || [], last = h[h.length - 1];
    if (!last || last.back || !last.from || last.to !== m.status || last.from === m.status) return null;
    return String(last.on || '') >= Club.date.addDays(today(), -STATUS_BACK_DAYS) ? last : null;
  }
  function stepBackStatus(id) {
    const m = S.find('members', id), b = statusBack(m); if (!b) return;
    const was = statusMeta(m.status).label.toLowerCase(), to = statusMeta(b.from).label.toLowerCase();
    undoable(function () {
      S.update('members', m.id, { status: b.from, statusHistory: (m.statusHistory || []).concat([{ from: m.status, to: b.from, on: today(), reason: 'Change from ' + to + ' to ' + was + ' undone', back: true }]) });
    }, fullName(m) + ' is back to ' + to, fullName(m) + ' is ' + was + ' again');
    rerender();
  }

  /* ---------------- Applications pipeline ---------------- */
  function renderApplications(view) {
    const apps = S.all('applications');
    const open = apps.filter(isOpenApp);
    const yk = today().slice(0, 4);
    const approvedYr = apps.filter(function (a) { return a.stage === 'Approved' && String(a.decidedOn || a.submittedOn).slice(0, 4) === yk; }).length;
    const avgDays = open.length ? Math.round(open.reduce(function (s, a) { return s + Math.max(0, -daysUntil(a.submittedOn)); }, 0) / open.length) : 0;

    view.innerHTML = '<a class="mem-back" href="#/members">' + Club.icon('chevronLeft') + 'All members</a>' + ui.pageHeader({
      eyebrow: 'Membership', title: 'Applications',
      subtitle: 'Each new member is proposed and seconded by members in good standing, meets the membership committee, then goes to the board for approval.',
      actions: ui.btn('New application', { kind: 'primary', icon: 'plus', action: 'new-app' })
    }) + ui.stats([
      { label: 'In progress', value: open.length, meta: 'Awaiting a decision' },
      { label: 'Board review', value: apps.filter(function (a) { return a.stage === 'Board review'; }).length, meta: 'Ready for the next meeting' },
      { label: 'Approved this year', value: approvedYr },
      { label: 'Average wait', value: avgDays, suffix: 'days', meta: 'Open applications' }
    ]) + '<div class="mem-board" data-reveal>' + OPEN_STAGES.concat(['Decided']).map(function (stage) {
      const list = apps.filter(function (a) { return stage === 'Decided' ? isDecided(a) : a.stage === stage; })
        .sort(function (a, b) { return stage === 'Decided' ? String(b.decidedOn || b.submittedOn).localeCompare(String(a.decidedOn || a.submittedOn)) : String(a.submittedOn).localeCompare(String(b.submittedOn)); });
      return '<section class="mem-col" data-stage="' + esc(stage) + '"><header class="mem-col-head"><h3>' + esc(stage) + '</h3><span class="mem-col-count">' + list.length + '</span></header><div class="mem-col-body">' +
        (list.length ? list.map(appCard).join('') : '<p class="mem-col-empty">' + esc({ Received: 'New applications land here.', Interview: 'No interviews pending.', 'Board review': 'Nothing awaiting the board.', Decided: 'Approved candidates become members.' }[stage]) + '</p>') +
        '</div></section>';
    }).join('') + '</div>' +
      '<div class="grid grid-main-side mem-gap">' + waitlistPanel() + categoriesPanel() + '</div>';

    ui.on(view, 'click', '[data-action=new-app]', function () { openAppForm(); });
    ui.on(view, 'click', '.mem-cat-toggle button', function (e, b) {
      const t = S.find('membershipTiers', b.closest('.mem-cat-toggle').dataset.name); if (!t) return;
      const full = b.dataset.value === 'full';
      if (full === tierFull(t)) return;
      undoable(function () { setTierFull(t.id, full); },
        full ? t.name + ' marked full. The public page now offers its waiting list' : t.name + ' is open. The public page now takes applications',
        full ? t.name + ' is open again' : t.name + ' is full again');
      rerender();
    });
    ui.on(view, 'click', '[data-app-move]', function (e, b) { e.stopPropagation(); const a = S.find('applications', b.dataset.id); if (a) moveApp(a, b.dataset.appMove); });
    ui.on(view, 'click', '[data-app-back]', function (e, b) { e.stopPropagation(); stepBackApp(b.dataset.appBack); });
    ui.on(view, 'click', '[data-action=app-open]', function (e, b) { const a = S.find('applications', b.dataset.id); if (a) openAppDrawer(a); });
  }

  function daysUntil(iso) { return Math.round((fmt.toDate(iso) - fmt.toDate(today())) / 86400000); }

  /** Age with a warning badge when it is outside the category's published range. */
  function ageHtml(a) {
    const age = ageOn(a.dob); if (age == null) return '';
    const prob = ageProblem(a.proposedTierId, age);
    return esc(age) + (prob ? ' ' + ui.badge('Check age, ' + prob.toLowerCase(), 'warn') : '');
  }

  /* Everyone on a full category's waiting list, by category then place in line. "Offer a place" moves them to Received. */
  function waitlistPanel() {
    const rows = [];
    S.all('membershipTiers').forEach(function (t) { waitQueue(t.id).forEach(function (a, i) { rows.push({ a: a, t: t, pos: i + 1 }); }); });
    return '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Full categories</div><h3>Waiting lists</h3></div><span class="muted">' + rows.length + ' waiting</span></div><div class="panel-body flush">' +
      (rows.length ? '<div class="table-wrap"><table class="table mem-wait"><thead><tr><th class="num">Place</th><th>Applicant</th><th>Source</th><th>Category</th><th class="num">Age</th><th>Waiting since</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
        const a = r.a;
        return '<tr><td class="num">' + r.pos + '</td>' +
          '<td class="nowrap"><button type="button" class="s-link primary-cell" data-action="app-open" data-id="' + esc(a.id) + '">' + esc(a.name) + '</button></td><td class="nowrap">' + (onlineBadge(a) || '<span class="muted">Office</span>') + '</td>' +
          '<td class="nowrap">' + esc(r.t.name) + '</td><td class="num nowrap">' + (ageHtml(a) || '<span class="muted">Not given</span>') + '</td>' +
          '<td class="nowrap">' + esc(fmt.date(a.submittedOn)) + '</td>' +
          '<td class="nowrap"><span class="row">' +
            '<button type="button" class="btn btn-ghost btn-sm btn-icon mem-decline" data-app-move="Declined" data-id="' + esc(a.id) + '" title="Decline application" aria-label="Decline application from ' + esc(a.name) + '">' + Club.icon('close') + '</button>' +
            '<button type="button" class="btn btn-sm" data-app-move="Received" data-id="' + esc(a.id) + '" title="Move to Received to start the application">' + Club.icon('check') + '<span>Offer a place</span></button></span></td></tr>';
      }).join('') + '</tbody></table></div>'
        : ui.empty({ icon: 'members', title: 'No one waiting', text: 'Applications for a full category join its waiting list here, in the order they arrive.' })) +
      '</div></section>';
  }

  /* Open or full per category: the public Become a member page offers Apply or Join the waitlist to match. */
  function categoriesPanel() {
    return '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Public website</div><h3>Categories</h3></div></div>' +
      '<ul class="list">' + S.all('membershipTiers').map(function (t) {
        const full = tierFull(t), n = waitQueue(t.id).length;
        return '<li class="row between"><span class="mem-stack"><span class="person-name">' + esc(t.name) + '</span><span class="person-sub">' + (full ? 'Waiting list' : 'Taking applications') + (n ? ' · ' + n + ' waiting' : '') + '</span></span>' +
          ui.segmented([{ value: 'open', label: 'Open' }, { value: 'full', label: 'Full' }], full ? 'full' : 'open', t.id).replace('class="segmented"', 'class="segmented mem-cat-toggle" role="group" aria-label="' + esc(t.name) + ' category"') + '</li>';
      }).join('') + '</ul>' +
      '<div class="panel-body"><p class="muted">Full categories show Join the waitlist on the public Become a member page, and online applications for them arrive on the waiting list.</p></div></section>';
  }

  function appCard(a) {
    const i = STAGES.indexOf(a.stage);
    const sponsors = (a.sponsorIds || []).map(function (id) { const m = S.find('members', id); return m ? m.firstName[0] + '. ' + m.lastName : 'Former member'; });
    const waited = Math.max(0, -daysUntil(a.submittedOn));
    const pb = prevStage(a);
    let actions = '';
    if (isOpenApp(a)) {
      /* Back goes to the stage it came from (its history), else the stage before it on the board */
      actions = '<span class="mem-app-left">' + (pb ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-app-back="' + esc(a.id) + '" title="Move back to ' + esc(pb) + '" aria-label="Move back to ' + esc(pb) + '">' + Club.icon('chevronLeft') + '</button>'
        : i > 0 ? '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-app-move="' + esc(STAGES[i - 1]) + '" data-id="' + esc(a.id) + '" title="Move back to ' + esc(STAGES[i - 1]) + '" aria-label="Move back to ' + esc(STAGES[i - 1]) + '">' + Club.icon('chevronLeft') + '</button>' : '') +
        '<button type="button" class="btn btn-ghost btn-sm btn-icon mem-decline" data-app-move="Declined" data-id="' + esc(a.id) + '" title="Decline application" aria-label="Decline application">' + Club.icon('close') + '</button></span>' +
        (a.stage === 'Board review'
          ? '<button type="button" class="btn btn-primary btn-sm" data-app-move="Approved" data-id="' + esc(a.id) + '">' + Club.icon('check') + '<span>Approve</span></button>'
          : '<button type="button" class="btn btn-sm" data-app-move="' + esc(STAGES[i + 1]) + '" data-id="' + esc(a.id) + '"><span>' + esc(STAGES[i + 1]) + '</span>' + Club.icon('chevronRight') + '</button>');
    } else if (a.stage === 'Approved') {
      actions = a.memberId && S.find('members', a.memberId) ? '<a class="btn btn-sm" href="#/members/' + esc(a.memberId) + '">' + Club.icon('user') + '<span>View member</span></a>' : '<span class="muted">Member record removed</span>';
    } else if (pb) {
      actions = '<button type="button" class="btn btn-ghost btn-sm" data-app-back="' + esc(a.id) + '">' + Club.icon('chevronLeft') + '<span>Move back to ' + esc(pb) + '</span></button>';
    } else {
      actions = '<button type="button" class="btn btn-ghost btn-sm" data-app-move="Board review" data-id="' + esc(a.id) + '">' + Club.icon('refresh') + '<span>Reopen</span></button>';
    }
    const badges = (isOpenApp(a) ? '' : ui.badge(a.stage, a.stage === 'Approved' ? 'good' : 'bad') + ' ') + onlineBadge(a);
    const age = ageHtml(a);
    return '<article class="mem-app">' + (badges ? '<div class="mem-app-badge">' + badges + '</div>' : '') +
      '<button type="button" class="mem-app-open" data-action="app-open" data-id="' + esc(a.id) + '"><span class="mem-app-name">' + esc(a.name) + '</span><span class="mem-app-tier">' + esc(tierName(a.proposedTierId)) + '</span></button>' +
      (age ? '<div class="mem-app-meta">Born ' + esc(fmt.date(a.dob)) + ' · age ' + age + '</div>' : '') +
      '<div class="mem-app-meta">' + (sponsors.length ? 'Sponsored by ' + esc(sponsors.join(' and ')) : a.sponsorNames ? 'Members named: ' + esc(a.sponsorNames) : 'No sponsors listed') + '</div>' +
      '<div class="mem-app-meta">' + (isOpenApp(a) ? 'Submitted ' + esc(fmt.dateShort(a.submittedOn)) + ' · ' + waited + (waited === 1 ? ' day' : ' days') : 'Decided ' + esc(fmt.dateShort(a.decidedOn || a.submittedOn))) + '</div>' +
      '<div class="mem-app-actions">' + actions + '</div></article>';
  }

  function moveApp(a, to) {
    const from = a.stage;
    const back = a.name + ' is back in ' + (from === WAIT ? 'the waiting list' : from.toLowerCase());
    function write(patch) { S.update('applications', a.id, Object.assign({ stage: to, history: (a.history || []).concat([{ stage: to, on: today() }]) }, patch || {})); }
    function save(patch, msg) { undoable(function () { write(patch); }, msg, back); rerender(); }
    if (to === 'Approved') {
      ui.confirm({ title: 'Approve ' + a.name + '?', text: 'This creates a member record as ' + tierName(a.proposedTierId) + ' with number ' + nextMemberNo() + ', active from today.', confirmLabel: 'Approve and create member' }).then(function (yes) {
        if (!yes) return;
        const parts = String(a.name).trim().split(/\s+/);
        const last = parts.length > 1 ? parts.pop() : '';
        const no = nextMemberNo();
        /* Undo removes the new member record (refused once anything else touches it) and reopens the application */
        undoable(function () {
          /* Online applications carry first and last name, date of birth and handicap; office ones only a full name */
          const mem = S.insert('members', {
            id: newMemberId(no), memberNo: no, firstName: a.firstName || parts.join(' ') || a.name, lastName: a.lastName || last, email: a.email || '', phone: a.phone || '', address: '',
            tierId: a.proposedTierId || 'tier_full', status: 'active', memberSince: today(), dob: a.dob || null, handicap: a.handicap != null ? a.handicap : null, hand: a.hand || null, ghin: null, locker: null,
            spouse: null, children: 0, balance: 0, preferences: { cart: 'Cart', dining: 'Gallery Taphouse & Grill', notes: '' }, tags: ['New member'], notes: a.notes || '', applicationId: a.id
          });
          write({ memberId: mem.id, decidedOn: today() });
        }, 'Welcome, ' + a.name + '. Member ' + no + ' created', back + '. Member ' + no + ' removed');
        rerender();
      });
    } else if (to === 'Declined') {
      ui.confirm({ title: 'Decline ' + a.name + '?', text: 'The application moves to Declined. You can reopen it later if the board reconsiders.', confirmLabel: 'Decline application', danger: true }).then(function (yes) { if (yes) save({ decidedOn: today() }, 'Application declined'); });
    } else if (from === WAIT && to === 'Received') {
      save(null, a.name + ' offered a place and moved to Received');
    } else {
      save(from === 'Declined' ? { decidedOn: null } : null, a.name + ' moved to ' + to.toLowerCase());
    }
  }
  /* Step back: an application can return to the stage it came from (the one before last in its history). Stepping
     back drops the last history entry, so nothing new is stored. Approved is final here: it created a member record. */
  function prevStage(a) {
    const h = (a && a.history) || [];
    if (!a || a.stage === 'Approved' || h.length < 2 || h[h.length - 1].stage !== a.stage) return null;
    const p = h[h.length - 2].stage;
    return p && p !== a.stage && p !== 'Approved' ? p : null;
  }
  function stepBackApp(id) {
    const a = S.find('applications', id), to = prevStage(a); if (!to) return;
    const h = a.history.slice(0, -1), patch = { stage: to, history: h };
    if (to === 'Declined') patch.decidedOn = h[h.length - 1].on || today();
    else if (a.decidedOn) patch.decidedOn = null;
    const label = function (s) { return s === WAIT ? 'the waiting list' : s.toLowerCase(); };
    undoable(function () { S.update('applications', a.id, patch); }, a.name + ' moved back to ' + label(to), a.name + ' is back in ' + label(a.stage));
    rerender();
  }

  function appFields(a) {
    a = a || {};
    const memOpts = function (sel) { return '<option value="">Select a member</option>' + S.all('members').filter(function (m) { return m.status === 'active' || m.id === sel; }).slice().sort(function (x, y) { return x.lastName.localeCompare(y.lastName); }).map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.lastName + ', ' + m.firstName) + ' · #' + esc(m.memberNo) + '</option>'; }).join(''); };
    const sp = a.sponsorIds || [];
    return '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Full name', name: 'name', value: a.name, required: true, span2: true }) +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: a.email, required: true }) +
      ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: a.phone }) +
      ui.field({ label: 'Proposed tier', name: 'proposedTierId', type: 'select', required: true, options: ui.options(S.all('membershipTiers').map(function (t) { return { value: t.id, label: t.name }; }), a.proposedTierId || 'tier_full') }) +
      ui.field({ label: 'Submitted on', name: 'submittedOn', type: 'date', value: a.submittedOn || today(), required: true }) +
      /* Online applicants cannot pick sponsors from the roster, so the office adds them later */
      ui.field({ label: 'Proposer', name: 'sponsor1', type: 'select', required: a.source !== 'Online', options: memOpts(sp[0]) }) +
      ui.field({ label: 'Seconder', name: 'sponsor2', type: 'select', options: memOpts(sp[1]) }) +
      ui.field({ label: 'How they heard about us', name: 'heardFrom', type: 'select', hint: 'Optional', options: '<option value="">Not asked or not given</option>' + ui.options(HEARD_FROM, heardFrom(a)), span2: true }) +
      ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: a.notes, span2: true }) + '</form>';
  }
  function readApp(form) {
    clearErrs(form);
    let ok = ui.validate(form);
    const v = ui.formData(form);
    if (v.email && !EMAIL_RE.test(v.email)) { setErr(form, 'email', 'Enter a valid email address.'); ok = false; }
    if (v.sponsor2 && v.sponsor2 === v.sponsor1) { setErr(form, 'sponsor2', 'The seconder must be a different member.'); ok = false; }
    if (v.submittedOn && v.submittedOn > today()) { setErr(form, 'submittedOn', 'The date cannot be in the future.'); ok = false; }
    if (!ok) { focusFirstInvalid(form); return null; }
    return { name: v.name, email: v.email, phone: v.phone, proposedTierId: v.proposedTierId, submittedOn: v.submittedOn, sponsorIds: [v.sponsor1, v.sponsor2].filter(Boolean), heardFrom: cleanHeard(v.heardFrom), notes: v.notes };
  }

  function openAppForm() {
    ui.modal({
      title: 'New application', eyebrow: 'Membership', body: appFields(null),
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save application', kind: 'primary', icon: 'check', onClick: function (api) {
          const d = readApp(ui.$('form', api.el)); if (!d) return false;
          undoable(function () { S.insert('applications', Object.assign(d, { stage: 'Received', memberId: null, history: [{ stage: 'Received', on: d.submittedOn }] })); },
            'Application from ' + d.name + ' received', 'Application from ' + d.name + ' removed');
          rerender();
        }
      }]
    });
  }

  function openAppDrawer(a) {
    const sponsors = (a.sponsorIds || []).map(function (id) { const m = S.find('members', id); return m ? '<a href="#/members/' + esc(id) + '">' + esc(fullName(m)) + '</a>' : '<span class="muted">Former member</span>'; });
    const pos = waitPosition(a);
    const online = a.source === 'Online';
    const body = '<div class="stack">' +
      '<div class="row wrap">' + ui.badge(a.stage, a.stage === 'Approved' ? 'good' : a.stage === 'Declined' ? 'bad' : a.stage === 'Board review' ? 'brass' : a.stage === WAIT ? 'warn' : 'info') + ui.badge(tierName(a.proposedTierId), 'outline') + onlineBadge(a) + '</div>' +
      kv([['Email', a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>' : null], ['Phone', a.phone ? esc(a.phone) : null], ['Submitted', esc(fmt.date(a.submittedOn)) + (online ? ' <span class="muted">on the public website</span>' : '')]]
        .concat(pos ? [['Waiting list', 'Number ' + pos + ' for ' + esc(tierName(a.proposedTierId))]] : [])
        .concat(online || a.dob ? [['Date of birth', a.dob ? esc(fmt.date(a.dob)) + ' <span class="muted">(age ' + ageHtml(a) + ')</span>' : null]] : [])
        .concat(online ? [['Handicap index', a.handicap != null ? esc(fmt.handicap(a.handicap)) : 'None given']] : [])
        .concat(online || a.hand ? [['Plays', Club.members.hand(a) ? esc(Club.members.hand(a)) : '<span class="muted">Not given</span>']] : [])
        .concat([['Heard about us', heardFrom(a) ? esc(heardFrom(a)) : '<span class="muted">Not given</span>']])
        .concat(online ? [['Members named', a.sponsorNames ? esc(a.sponsorNames) : 'None']] : [])
        .concat([['Sponsors', sponsors.length ? sponsors.join(', ') : null]])
        .concat(online ? [['Consent', a.consentAt ? 'Given ' + esc(fmt.date(String(a.consentAt).slice(0, 10))) : 'Not recorded']] : [])) +
      '<div><h4>Progress</h4><ol class="mem-timeline">' + (a.history || [{ stage: 'Received', on: a.submittedOn }]).map(function (h) { return '<li><span>' + esc(h.stage) + '</span><span class="muted">' + esc(fmt.date(h.on)) + '</span></li>'; }).join('') + '</ol></div>' +
      '<div class="mem-app-edit">' + appFields(a) + '</div></div>';
    const pb = prevStage(a);
    const d = ui.drawer({
      title: a.name, eyebrow: 'Application', body: body,
      actions: [
        { label: 'Delete', kind: 'danger', icon: 'trash', onClick: function (api) {
          ui.confirm({ title: 'Delete this application?', text: 'The application from ' + a.name + ' will be removed. Any member record already created is kept.', confirmLabel: 'Delete application', danger: true }).then(function (yes) {
            if (!yes) return;
            undoable(function () { S.remove('applications', a.id); }, 'Application deleted', 'Application from ' + a.name + ' restored');
            api.close(); rerender();
          });
          return false;
        } }
      ].concat(pb ? [{ label: 'Move back to ' + pb, kind: 'ghost', icon: 'chevronLeft', onClick: function () { stepBackApp(a.id); } }] : []).concat([
        { label: 'Save changes', kind: 'primary', icon: 'check', onClick: function (api) {
          const v = readApp(ui.$('form', api.el)); if (!v) return false;
          undoable(function () { S.update('applications', a.id, v); }, 'Application saved', 'Application changes undone');
          rerender();
        } }
      ])
    });
    void d;
  }

  /* ---------------- Register ---------------- */
  Club.register({
    id: 'members', label: 'Members', icon: 'members', section: 'Membership', order: 10,
    badge: function () { const n = S.all('applications').filter(isOpenApp).length; return n || null; },
    render: function (view, params) {
      const p = params[0];
      if (!p) return renderDirectory(view);
      if (p === 'applications') {
        /* #/members/applications/<id> opens that application (links from Reports, Growth) */
        const out = renderApplications(view);
        const a = params[1] ? S.find('applications', params[1]) : null;
        if (a) setTimeout(function () { if (view.isConnected) openAppDrawer(a); }, 0);
        return out;
      }
      if (p === 'new') { renderDirectory(view); openMemberForm(null); return; }
      if (['overview', 'golf', 'activity', 'spending', 'account'].indexOf(params[1]) >= 0) profileTab = params[1];
      else if (p !== (renderProfile.lastId || '')) profileTab = 'overview';
      renderProfile.lastId = p;
      return renderProfile(view, p);
    }
  });
})();
