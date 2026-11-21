/* Portal: Home. Greeting card, quick actions, what's coming up (grouped: tee times, lessons, dining, events, to do),
   friends playing, account snapshot, handicap and club notices. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const PACE = (Club.teeRules && Club.teeRules.PACE) || { 18: 234, 9: 117 };   /* handbook: 13 minutes a hole */

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function today() { return Club.date.today(); }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function canGolf(m) { const t = tierOf(m); return t ? !!t.golf : m.tierId !== 'tier_social'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function dayLabel(d) {
    const td = today(); const dt = fmt.toDate(d);
    const short = dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (d === td) return 'Today · ' + short;
    if (d === Club.date.addDays(td, 1)) return 'Tomorrow · ' + short;
    return dt.toLocaleDateString('en-US', { weekday: 'long' }) + ' · ' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function niceList(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
  function stillAhead(date, time, mins) { return date > today() || (date === today() && toMin(time) + (mins || 0) >= nowMin()); }
  function playerName(p) { if (p.type === 'member' && p.memberId) { const m = Club.members.get(p.memberId); if (m) return m.firstName + ' ' + m.lastName; } return p.name || 'Guest'; }

  /* ---------------- The member's upcoming plans, all collections merged ---------------- */
  function upcomingFor(m) {
    const td = today(); const out = [];
    S.all('teeTimes').forEach(function (t) {
      if (!t || t.date < td || ['booked', 'checked-in', 'on-course'].indexOf(t.status) < 0) return;
      if (!(t.players || []).some(function (p) { return p.memberId === m.id; })) return;
      if (t.status === 'booked' && !stillAhead(t.date, t.time, 15)) return;
      const others = (t.players || []).filter(function (p) { return p.memberId !== m.id; });
      out.push({ kind: 'Tee time', icon: 'flag', date: t.date, time: t.time, title: t.holes + ' holes',
        sub: others.length ? 'With ' + niceList(others.map(function (p) { return Portal.playerLabel(p); })) : 'Just you', href: '#/tee-times/mine', live: t.status === 'on-course' });
    });
    S.all('diningReservations').forEach(function (r) {
      if (!r || r.memberId !== m.id || r.date < td || (r.status !== 'confirmed' && r.status !== 'seated')) return;
      if (r.status === 'confirmed' && !stillAhead(r.date, r.time, 30)) return;
      out.push({ kind: 'Dining', icon: 'dining', date: r.date, time: r.time, title: r.venue || 'Dining', sub: (r.partySize || 2) + ((r.partySize || 2) == 1 ? ' person' : ' people') + (r.occasion ? ' · ' + r.occasion : ''), href: '#/dining' });
    });
    S.all('events').forEach(function (e) {
      if (!e || e.status !== 'published' || e.date < td) return;
      if (!(e.registrations || []).some(function (r) { return r.memberId === m.id; })) return;
      const reg = (e.registrations || []).find(function (r) { return r.memberId === m.id; });
      out.push({ kind: 'Event', icon: 'events', date: e.date, time: e.start || '00:00', title: e.title, sub: (e.venue || 'The clubhouse') + (reg && +reg.guests ? ' · with ' + reg.guests + (+reg.guests === 1 ? ' guest' : ' guests') : ''), href: '#/events/' + encodeURIComponent(e.id) });
    });
    S.all('lessons').forEach(function (l) {
      if (!l || l.memberId !== m.id || l.status !== 'scheduled' || l.date < td) return;
      if (!stillAhead(l.date, l.time, l.duration || 60)) return;
      out.push({ kind: 'Lesson', icon: 'lesson', date: l.date, time: l.time, title: l.type || 'Lesson', sub: (l.duration || 60) + ' min with ' + Club.staff.name(l.proId), href: '#/lessons' });
    });
    return out.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }

  /* ---------------- Notices: the communications module's audience rules ---------------- */
  function audienceKey(a) {
    if (a.audienceKey) return a.audienceKey;
    const label = a.audience || 'All members';
    if (label === 'All members') return 'all';
    if (label === 'Golf members') return 'golf';
    if (label === 'Board & committees') return 'board';
    if (label === 'Staff') return 'staff';
    const t = S.all('membershipTiers').find(function (x) { return x.name + ' tier' === label; });
    return t ? 'tier:' + t.id : 'all';
  }
  function reaches(a, m) {
    const k = audienceKey(a);
    if (k === 'all') return true;
    if (k === 'golf') return canGolf(m);
    if (k === 'board') return (m.tags || []).some(function (t) { return t === 'Board' || t === 'Committee'; });
    if (k.indexOf('tier:') === 0) return m.tierId === k.slice(5);
    return false;
  }
  function plain(body, m) {
    return String(body || '').replace(/\{first_name\}/g, m.firstName).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      .replace(/^\s*-\s+/gm, '').replace(/^Dear [^,\n]+,\s*/i, '').replace(/\s+/g, ' ').trim();
  }
  function noticesFor(m) {
    return S.all('announcements').filter(function (a) { return a && a.status === 'sent' && a.sentAt && reaches(a, m); })
      .sort(function (a, b) { return String(b.sentAt).localeCompare(String(a.sentAt)); }).slice(0, 3);
  }
  function sentLabel(iso) {
    const d = Club.date.iso(new Date(iso)); const td = today();
    if (d === td) return 'Today'; if (d === Club.date.addDays(td, -1)) return 'Yesterday';
    const diff = Math.round((fmt.toDate(td) - fmt.toDate(d)) / 86400000);
    return diff < 7 ? diff + ' days ago' : fmt.dateShort(d);
  }

  /* ---------------- Pieces ---------------- */
  /* Coming up shows the next one of each kind on phones and the next three on wide screens; "All n" opens the page. */
  const WIDE = window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  function perGroup() { return WIDE ? 3 : 1; }


  function heroHTML(m) {
    const w = Club.weather || {}; const t = w.today || {};
    const cs = S.getObj('courseStatus', null) || {};
    const st = Object.assign({ first: '06:30', last: '17:00' }, S.getObj('teeSheetSettings', {}) || {});
    const rule = String(cs.cartRule || 'Normal');
    const open = cs.open !== false;
    const carts = rule === 'Normal' ? 'Carts as normal' : rule === 'No carts' ? 'Walking only' : rule === 'Cart path only' ? 'Carts on paths only' : rule === '90 degree' ? 'Carts on 90° rule' : 'Carts: ' + rule.toLowerCase();
    const now = w.nowTemp != null ? w.nowTemp : t.hi;
    const lo = t.lo != null ? String(t.lo).replace('-', '−') : '';
    return '<section class="hm-hero" aria-labelledby="hm-hero-h">' +
      '<span class="hm-mark" aria-hidden="true">' + Portal.crest('hm-mark-svg') + '</span>' +
      '<p class="hm-hero-date"><time datetime="' + esc(today()) + '">' + esc(fmt.toDate(today()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</time></p>' +
      '<h1 id="hm-hero-h" class="hm-hello">' + greeting() + ', <span class="hm-hello-name">' + esc(m.firstName) + '</span></h1>' +
      '<div class="hm-hero-row">' +
        (t.cond ? '<div class="hm-hero-col">' + Club.icon(t.icon || 'sun') + '<div><p class="hm-hero-main">' + esc(String(now).replace('-', '−')) + '° ' + esc(t.cond) + '</p><p class="hm-hero-sub">H ' + esc(String(t.hi).replace('-', '−')) + '° · L ' + esc(lo) + '°</p></div></div>' : '') +
        '<div class="hm-hero-col">' + Club.icon(open ? 'flag' : 'alert') + '<div>' +
          (open ? '<p class="hm-hero-main">Course open</p><p class="hm-hero-sub">First tee ' + esc(fmt.time(st.first)) + ' · ' + esc(carts) + '</p>'
            : '<p class="hm-hero-main">Course closed</p>' + (cs.message ? '<p class="hm-hero-sub">' + esc(String(cs.message).split('.')[0]) + '.</p>' : '')) +
        '</div></div>' +
      '</div>' +
    '</section>';
  }

  function actionsHTML() {
    const items = [
      { href: '#/tee-times', icon: 'flag', label: 'Tee time', aria: 'Book a tee time' },
      { href: '#/dining', icon: 'dining', label: 'Dining', aria: 'Reserve a table' },
      { href: '#/events', icon: 'events', label: 'Events', aria: 'Browse events' },
      { href: '#/lessons', icon: 'lesson', label: 'Lessons', aria: 'Book a lesson' }
    ];
    return '<nav class="hm-actions" aria-label="Quick actions">' + items.map(function (a) {
      return '<a class="hm-action" href="' + a.href + '" aria-label="' + esc(a.aria) + '"><span class="hm-action-ic">' + Club.icon(a.icon) + '</span><span class="hm-action-l">' + esc(a.label) + '</span></a>';
    }).join('') + (Portal.cartAction ? Portal.cartAction(Portal.member()) : '') +
      /* The digital membership card (js/portal/card.js): a full-width row under the tiles */
      '<a class="hm-action mc-action" href="#/card"><span class="hm-action-ic">' + Club.icon('idcard') + '</span><span class="hm-action-l">Membership card</span>' + Club.icon('chevronRight') + '</a></nav>';
  }

  /* ---------------- Coming up: one labelled group per kind, each with its own rows ---------------- */
  const GROUPS = [
    { kind: 'Tee time', label: 'Tee times', icon: 'flag', href: '#/tee-times/mine' },
    { kind: 'Lesson', label: 'Lessons', icon: 'lesson', href: '#/lessons' },
    { kind: 'Dining', label: 'Dining', icon: 'dining', href: '#/dining' },
    { kind: 'Event', label: 'Events', icon: 'events', href: '#/events' },
    { kind: 'Other', label: 'To do', icon: 'scorecard', href: '' }
  ];
  function rowTitle(it) { return (String(it.title).toLowerCase().indexOf(it.kind.toLowerCase()) >= 0 ? '' : it.kind + ' · ') + it.title; }
  /* One row layout everywhere: date block, title, one meta line (time first), chevron. The row is the action. */
  function rowHTML(it) {
    const dt = fmt.toDate(it.date), isToday = it.date === today();
    return '<li><a class="hm-row" href="' + it.href + '">' +
      '<span class="hm-date' + (isToday ? ' is-today' : '') + '" aria-hidden="true"><span class="hm-date-w">' + esc(dt.toLocaleDateString('en-US', { weekday: 'short' })) + '</span><span class="hm-date-n">' + dt.getDate() + '</span></span>' +
      '<span class="hm-row-body"><span class="hm-row-title">' + esc(it.title) + (it.live ? ' <span class="badge">On the course</span>' : '') + (it.badge || '') + '</span>' +
        '<span class="hm-row-sub"><span class="sr-only">' + esc(shortDay(it.date)) + ' </span>' + (isToday ? '<span>Today</span> · ' : '') + (it.time ? '<time>' + esc(fmt.time(it.time)) + '</time>' : '') + (it.sub ? (it.time ? ' · ' : '') + '<span>' + esc(it.sub) + '</span>' : '') + '</span></span>' +
      Club.icon('chevronRight', 'hm-row-go') + '</a></li>';
  }
  function shortDay(d) {
    const td = today();
    if (d === td) return 'Today';
    if (d === Club.date.addDays(td, 1)) return 'Tomorrow';
    return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function upcomingHTML(all, per) {
    let body;
    if (!all.length) {
      body = '<div class="hm-empty"><p>Nothing booked yet.</p>' +
        '<a class="btn btn-sm" href="#/tee-times">' + Club.icon('flag') + '<span>Book a tee time</span></a></div>';
    } else {
      body = '<div class="hm-groups">' + GROUPS.map(function (g) {
        const items = all.filter(function (it) { return it.kind === g.kind; }); if (!items.length) return '';
        const more = items.length > per && g.href ? '<a class="p-link hm-g-more" href="' + g.href + '">View all (' + items.length + ')</a>' : '';
        return '<div class="hm-group" data-kind="' + esc(g.kind) + '"><div class="hm-g-head"><span class="hm-g-ic" aria-hidden="true">' + Club.icon(g.icon) + '</span><h3 class="hm-g-t">' + esc(g.label) + '</h3>' + more + '</div>' +
          '<ul class="p-list hm-list">' + items.slice(0, per).map(rowHTML).join('') + '</ul></div>';
      }).join('') + '</div>';
    }
    const dated = all.filter(function (it) { return it.kind !== 'Other'; });
    const more = dated.length > 3 ? '<button type="button" class="p-link" data-act="all-up" aria-haspopup="dialog">By day</button>' : '';
    return '<section class="hm-section hm-upcoming" aria-labelledby="hm-up-h"><div class="hm-head"><h2 id="hm-up-h">Coming up</h2>' + more + '</div>' + body + '</section>';
  }
  function openAll(all) {
    Portal.openSheet({ title: 'Coming up', size: 'full', rows: all.filter(function (it) { return it.kind !== 'Other'; }).map(function (it) {
      return { value: it.date + it.time + it.title, group: dayLabel(it.date), label: fmt.time(it.time) + ' · ' + rowTitle(it), sub: it.sub, href: it.href };
    }) });
  }

  function tilesHTML(m) {
    const bal = Math.round((+m.balance || 0) * 100) / 100;
    let hcp = '';
    if (canGolf(m) && m.handicap != null) {
      const hist = S.all('handicapHistory').filter(function (h) { return h && h.memberId === m.id && typeof h.index === 'number'; })
        .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).slice(-12);
      const vals = hist.map(function (h) { return h.index; });
      if (!vals.length || vals[vals.length - 1] !== m.handicap) vals.push(m.handicap);
      const delta = vals.length > 1 ? Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10 : 0;
      const since = hist.length > 1 ? fmt.toDate(hist[0].date).toLocaleDateString('en-US', { month: 'short' }) : null;
      const trend = !since || Math.abs(delta) < 0.1 ? 'Steady' : (delta < 0 ? '↓' + Math.abs(delta).toFixed(1) : '↑' + delta.toFixed(1)) + ' since ' + since;
      hcp = '<a class="hm-tile" href="#/profile"><span class="hm-tile-l">Handicap index</span>' +
        '<span class="hm-hcp-line"><span class="hm-tile-v">' + esc(fmt.handicap(m.handicap)) + '</span>' +
        (vals.length > 1 ? '<span class="hm-spark" aria-hidden="true">' + Club.charts.sparkline(vals, { width: 120, height: 32, color: 'var(--forest-500)' }) + '</span>' : '') + '</span>' +
        '<span class="hm-tile-c">' + esc(trend) + '</span>' + Club.icon('chevronRight', 'hm-tile-go') + '</a>';
    }
    return '<div class="hm-tiles' + (hcp ? '' : ' one') + '">' +
      '<a class="hm-tile" href="#/account"><span class="hm-tile-l">Account balance</span><span class="hm-tile-v">' + esc(fmt.money(Math.abs(bal))) + '</span>' +
        '<span class="hm-tile-c">' + (bal < 0 ? 'In credit' : bal > 0 ? 'Billed monthly' : 'Nothing owing') + '</span>' + Club.icon('chevronRight', 'hm-tile-go') + '</a>' +
      hcp + '</div>';
  }

  function noticesHTML(m) {
    const ns = noticesFor(m).slice(0, 2);
    return '<section class="hm-section hm-notices" aria-labelledby="hm-n-h"><div class="hm-head"><h2 id="hm-n-h">Club notices</h2><a class="p-link" href="#/club/news">See all</a></div>' +
      (ns.length ? '<ul class="p-list hm-nlist">' + ns.map(function (a) {
        return '<li><a class="hm-n" href="#/club/news/' + encodeURIComponent(a.id) + '"><span class="hm-n-title">' + esc(a.title) + '</span><span class="hm-n-when">' + esc(sentLabel(a.sentAt)) + '</span>' + Club.icon('chevronRight', 'hm-row-go') + '</a></li>';
      }).join('') + '</ul>' : '<p class="hm-quiet">No notices right now.</p>') +
    '</section>';
  }

  /* Friends playing this week: the next two friend groups with the same Join button (or reason) as Friends. */
  function friendsHTML(m) {
    const F = Portal.friends; if (!F || !F.friendsOf(m.id).length) return '';
    const all = F.golfing(m.id, 7);
    /* Groups Dave can join (or is in) first, then the next groups. */
    const list = all.filter(function (g) { return F.canJoin(m.id, g); }).concat(all.filter(function (g) { return !F.canJoin(m.id, g); }));
    /* Requests to join this member's tee times come first, with Approve and Decline. */
    const reqs = F.joinInbox ? F.joinInbox(m.id) : [];
    const rows = reqs.slice(0, 2).map(function (r) { return F.requestRowHTML(m.id, r); }).concat(list.slice(0, Math.max(0, 2 - reqs.length)).map(function (g) { return F.rowHTML(m.id, g); }));
    return '<section class="hm-section hm-friends" aria-labelledby="hm-fr-h"><div class="hm-head hm-fr-head"><h2 id="hm-fr-h">Friends playing</h2><a class="p-link" href="#/friends">View all' + (list.length > 2 ? ' (' + list.length + ')' : '') + '</a></div>' +
      (rows.length ? '<ul class="p-list fr-golf hm-frlist">' + rows.join('') + '</ul>'
        : '<p class="hm-quiet">No friends playing this week.</p>') + '</section>';
  }

  /* ---------------- Page ---------------- */
  Portal.register({
    id: 'home', label: 'Home', icon: 'crest', order: 1, tab: true,
    render: function (view, params, member) {
      const m = Portal.member() || member;
      const all = upcomingFor(m);
      /* A round to post (score posting demo, js/portal/scores.js) is the "To do" group of Coming up. */
      const post = Portal.scores && Portal.scores.homeItem ? Portal.scores.homeItem(m) : null;
      if (post) all.push(Object.assign({ kind: 'Other' }, post));
      /* Today's tee time with its Play button (live scorecard, js/portal/play.js) sits under the greeting. */
      /* A spot opened for the member's waitlist (js/portal/waitlist.js): a notice above everything else. */
      const wl = function () { return Portal.waitlist ? Portal.waitlist.noticesHTML(Portal.member() || m) : ''; };
      view.innerHTML = '<div class="wl-host">' + wl() + '</div><div class="hm-layout">' + heroHTML(m) + (Portal.play ? Portal.play.homeCard(m) : '') + actionsHTML() + upcomingHTML(all, perGroup()) + friendsHTML(m) + tilesHTML(m) + noticesHTML(m) + '</div>';
      if (Portal.waitlist) Portal.waitlist.wire(view, m, function () { ui.$('.wl-host', view).innerHTML = wl(); });
      ui.on(view, 'click', '[data-act=all-up]', function () { openAll(all); });
      if (Portal.cartHoleCheck) Portal.cartHoleCheck(view, m);
      if (Portal.friends) Portal.friends.wireJoin(view, m.id, function () { const sec = ui.$('.hm-friends', view); if (sec) sec.outerHTML = friendsHTML(Portal.member() || m); });
    }
  });
})();
