/* Portal: Home (owner-approved redesign, Nov 21). One thing big: the member's next round on a dark Fairway panel,
   set like a starter's sheet. Everything else is plain and quiet: the greeting, "This week" as one hairline list
   across tee times, lessons, dining, events, ballot results and scores to post, then Friends playing, Account
   (balance and handicap) and Club notices. Two columns from tablet width. Styles: css/portal/home.css (hm-). */
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

  /* ---------------- The member's upcoming plans, all collections merged ----------------
     Each item: cat (the word on the right of a This week row), title and parts (the row's meta line), plus kind and
     sub, the wording the by-day sheet ("View all") has always used. */
  function wonBallot(m) {
    const B = Club.ballot, won = {}; if (!B) return won;
    B.forMember(m.id).forEach(function (e) { if (e.status === 'won' && e.teeTimeId && e.date >= today() && !B.isSeen(e, m.id)) won[e.teeTimeId] = e; });
    return won;
  }
  function myTees(m) {
    const td = today();
    return S.all('teeTimes').filter(function (t) {
      if (!t || t.date < td || ['booked', 'checked-in', 'on-course'].indexOf(t.status) < 0) return false;
      if (!(t.players || []).some(function (p) { return p.memberId === m.id; })) return false;
      return !(t.status === 'booked' && !stillAhead(t.date, t.time, 15));
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  }
  function othersOf(t, m) { return (t.players || []).filter(function (p) { return p.memberId !== m.id; }).map(function (p) { return Portal.playerLabel(p); }); }
  function upcomingFor(m) {
    const td = today(); const out = []; const won = wonBallot(m);
    myTees(m).forEach(function (t) {
      const others = othersOf(t, m);
      out.push({ kind: 'Tee time', cat: 'Golf', tt: t.id, date: t.date, time: t.time, title: t.holes + ' holes', rowTitle: won[t.id] ? 'Ballot: tee time won' : 'Tee time',
        parts: [t.holes + ' holes', others.length ? 'with ' + niceList(others) : 'Just you'],
        sub: others.length ? 'With ' + niceList(others) : 'Just you', href: '#/tee-times/mine', live: t.status === 'on-course' });
    });
    /* Ballot entries that missed, until the member has seen the result (Tee times, Weekend ballot) */
    if (Club.ballot) Club.ballot.forMember(m.id).forEach(function (e) {
      if (e.status !== 'missed' || e.date < td || Club.ballot.isSeen(e, m.id)) return;
      out.push({ kind: 'Ballot', cat: 'Golf', date: e.date, time: '', title: 'Ballot: no tee time', rowTitle: 'Ballot: no tee time', parts: ['See the result'], sub: 'See the result', href: '#/tee-times/ballot', sheet: false });
    });
    S.all('diningReservations').forEach(function (r) {
      if (!r || r.memberId !== m.id || r.date < td || (r.status !== 'confirmed' && r.status !== 'seated')) return;
      if (r.status === 'confirmed' && !stillAhead(r.date, r.time, 30)) return;
      const n = r.partySize || 2, people = n + (n == 1 ? ' person' : ' people');
      out.push({ kind: 'Dining', cat: 'Dining', date: r.date, time: r.time, title: r.venue || 'Dining', parts: [people].concat(r.occasion ? [r.occasion] : []), sub: people + (r.occasion ? ' · ' + r.occasion : ''), href: '#/dining' });
    });
    S.all('events').forEach(function (e) {
      if (!e || e.status !== 'published' || e.date < td) return;
      const reg = (e.registrations || []).find(function (r) { return r.memberId === m.id; }); if (!reg) return;
      const g = +reg.guests || 0, venue = e.venue || 'The clubhouse';
      out.push({ kind: 'Event', cat: 'Event', date: e.date, time: e.start || '00:00', title: e.title, parts: [venue].concat(g ? [g + (g === 1 ? ' guest' : ' guests')] : []),
        sub: venue + (g ? ' · with ' + g + (g === 1 ? ' guest' : ' guests') : ''), href: '#/events/' + encodeURIComponent(e.id) });
    });
    S.all('lessons').forEach(function (l) {
      if (!l || l.memberId !== m.id || l.status !== 'scheduled' || l.date < td) return;
      if (!stillAhead(l.date, l.time, l.duration || 60)) return;
      out.push({ kind: 'Lesson', cat: 'Lesson', date: l.date, time: l.time, title: l.type || 'Lesson', parts: [Club.staff.name(l.proId)], sub: (l.duration || 60) + ' min with ' + Club.staff.name(l.proId), href: '#/lessons' });
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

  /* ---------------- Greeting: the first name in the serif italic, then one quiet line ---------------- */
  const WX = { 'Sunny': 'and sunny', 'Partly cloudy': 'and partly cloudy', 'Overcast': 'and overcast', 'Cloudy': 'and cloudy', 'Breezy': 'and breezy', 'Fog': 'and foggy',
    'Drizzle': 'with drizzle', 'Light rain': 'with light rain', 'Rain': 'and raining', 'Snow': 'and snowing', 'Thunderstorms': 'with thunderstorms' };
  function greetHTML(m) {
    const w = Club.weather || {}; const t = w.today || {};
    const cs = S.getObj('courseStatus', null) || {};
    const rule = String(cs.cartRule || 'Normal');
    const note = cs.open === false ? 'Course closed' : rule === 'Normal' ? '' : rule === 'No carts' ? 'Walking only' : rule === 'Cart path only' ? 'Carts on paths only' : rule === '90 degree' ? 'Carts on 90° rule' : 'Carts: ' + rule.toLowerCase();
    const now = w.nowTemp != null ? w.nowTemp : t.hi;
    const wx = t.cond && now != null ? String(now).replace('-', '−') + '° ' + (WX[t.cond] || 'and ' + String(t.cond).toLowerCase()) : '';
    return '<header class="hm-greet">' +
      '<h1 class="hm-hello"><span class="hm-hello-g">' + greeting() + ',</span> <span class="hm-hello-name" data-i18n-skip>' + esc(m.firstName) + '.</span></h1>' +
      '<p class="hm-today"><time datetime="' + esc(today()) + '">' + esc(fmt.toDate(today()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</time>' +
        (wx ? ' · <span>' + esc(wx) + '</span>' : '') + (note ? ' · <span>' + esc(note) + '</span>' : '') + '</p>' +
    '</header>';
  }

  /* ---------------- Your next round: the one dark panel ----------------
     Today's tee time while it is still to play or in play (Club.play decides when the scorecard opens: 5 minutes
     before), else the next one booked, else today's finished round, else "No round booked". */
  function nextRound(m) {
    const P = Club.play, who = P && P.viewerMember ? P.viewerMember(m) : null;
    const round = function (t) { return P && P.sync ? P.sync.round(t.id) : null; };
    const over = function (t) { return t.status === 'completed' || nowMin() > toMin(t.time) + (PACE[+t.holes === 9 ? 9 : 18] || 234) + 60; };
    const mine = who ? P.teeTimesToday(who) : [];
    const live = mine.find(function (t) { const r = round(t); return r && r.status === 'playing'; }) ||
      mine.find(function (t) { const r = round(t); return !(r && r.status === 'finished') && !over(t); });
    if (live) return live;
    const later = myTees(m).filter(function (t) { return t.date > today(); })[0];
    return later || mine.filter(function (t) { const r = round(t); return r && r.status === 'finished'; }).pop() || null;
  }
  function dayWord(d) {
    const td = today();
    if (d === td) return 'Today';
    if (d === Club.date.addDays(td, 1)) return 'Tomorrow';
    return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function timeParts(t) { const s = fmt.time(t), x = /^(\d{1,2}:\d{2}) ?([AP]M)$/i.exec(s); return x ? [x[1], x[2].toUpperCase()] : [s, '']; }
  function nextHTML(m) {
    const tt = nextRound(m);
    if (!tt) {
      if (!canGolf(m)) return '';
      return '<section class="hm-next is-empty" aria-label="Your next round"><p class="hm-next-eb"><span>Your next round</span></p>' +
        '<p class="hm-next-none">No round booked</p><div class="hm-next-rule"></div>' +
        '<div class="hm-next-acts"><a class="hm-next-btn" href="#/tee-times">Book a tee time</a></div></section>';
    }
    const P = Club.play, isToday = tt.date === today();
    const r = P && P.sync ? P.sync.round(tt.id) : null, w = P ? P.windowFor(tt) : { open: false, early: true, opensAt: tt.time };
    const started = isToday && (!!r || nowMin() > toMin(tt.time));
    const others = othersOf(tt, m), tp = timeParts(tt.time), play = '#/play/' + encodeURIComponent(tt.id);
    let act = '<span></span>';
    if (isToday && P) {
      if (r && r.status === 'playing') act = '<a class="hm-next-btn" href="' + esc(play) + '">Back to scorecard</a>';
      else if (r && r.status === 'finished') act = '<a class="hm-next-btn" href="' + esc(play) + '">See the scorecard</a>';
      else if (w.open) act = '<a class="hm-next-btn" href="' + esc(play) + '">Start scorecard</a>';
      /* .lv-cta-off[data-opens]: js/portal/play.js redraws the page when this time comes */
      else act = '<span class="hm-next-opens lv-cta-off" data-opens="' + esc(w.opensAt) + '">' + esc('Scorecard opens ' + fmt.time(w.opensAt)) + '</span>';
    }
    return '<section class="hm-next" aria-label="' + esc(started ? 'Your round today' : 'Your next round') + '">' +
      '<p class="hm-next-eb"><span>' + (started ? 'Your round today' : 'Your next round') + '</span> · <span>' + (+tt.startTee === 10 ? '10th tee' : '1st tee') + '</span></p>' +
      '<p class="hm-next-time"><time datetime="' + esc(tt.date + 'T' + tt.time) + '">' + esc(tp[0]) + '</time>' + (tp[1] ? '<small>' + esc(tp[1]) + '</small>' : '') + '</p>' +
      '<p class="hm-next-meta"><span>' + esc(dayWord(tt.date)) + '</span> · <span>' + esc((+tt.holes === 9 ? 9 : 18) + ' holes') + '</span> · <span>' + esc(others.length ? 'with ' + niceList(others) : 'Just you') + '</span>' +
        (r && r.status === 'playing' && P.liveHole ? ' · <span>' + esc('On hole ' + P.liveHole(tt)) + '</span>' : '') + '</p>' +
      '<div class="hm-next-rule"></div>' +
      '<div class="hm-next-acts">' + act + '<a class="hm-next-link" href="#/tee-times/mine" data-tt="' + esc(tt.id) + '">Details</a></div>' +
    '</section>';
  }
  /* "Details" and tee time rows open My tee times, then that tee time's details (the row there carries
     data-act="detail" and data-id; js/portal/teetimes.js). */
  function openTeeAfterNav(id) {
    const go = function () {
      window.removeEventListener('hashchange', go);
      setTimeout(function () {
        const b = ui.$$('.p-page [data-act="detail"]').find(function (x) { return x.dataset.id === id; });
        if (b && !document.body.classList.contains('ps-open')) b.click();
      }, 80);
    };
    window.addEventListener('hashchange', go);
    setTimeout(function () { window.removeEventListener('hashchange', go); }, 1500);
  }

  /* ---------------- This week: one plain list, in date order ---------------- */
  function shortDay(d) {
    const td = today();
    if (d === td) return 'Today';
    if (d === Club.date.addDays(td, 1)) return 'Tomorrow';
    return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  /* One row everywhere: date block (weekday over the day number), title, one meta line, the category word. */
  function itemHTML(it) {
    const dt = fmt.toDate(it.date), isToday = it.date === today();
    const meta = (isToday && it.cat !== 'To do' ? ['<span>Today</span>'] : []).concat(it.time && it.cat !== 'To do' ? ['<time>' + esc(fmt.time(it.time)) + '</time>'] : [])
      .concat((it.parts || []).map(function (p) { return '<span>' + esc(p) + '</span>'; }));
    return '<li><a class="hm-item" href="' + esc(it.href) + '"' + (it.tt ? ' data-tt="' + esc(it.tt) + '"' : '') + '>' +
      '<span class="hm-d" aria-hidden="true"><small>' + esc(dt.toLocaleDateString('en-US', { weekday: 'short' })) + '</small><span class="hm-d-n">' + dt.getDate() + '</span></span>' +
      '<span class="hm-item-b"><span class="hm-item-t">' + esc(it.rowTitle || it.title) + (it.live ? ' <span class="badge">On the course</span>' : '') + (it.badge || '') + '</span>' +
        '<span class="hm-item-m"><span class="sr-only">' + esc(shortDay(it.date)) + ' </span>' + meta.join(' · ') + '</span></span>' +
      '<span class="hm-k">' + esc(it.cat) + '</span></a></li>';
  }
  /* The items shown: this week's (today and the six days after) when there are any, else the next ones booked. */
  function weekOf(all) {
    const end = Club.date.addDays(today(), 6);
    const wk = all.filter(function (it) { return it.date <= end; });
    return wk.length ? { title: 'This week', items: wk } : { title: 'Coming up', items: all };
  }
  function weekHTML(all, shown) {
    const w = weekOf(all), dated = all.filter(function (it) { return it.sheet !== false && it.cat !== 'To do'; });
    const body = w.items.length
      ? '<ul class="hm-rows hm-wk">' + w.items.slice(0, shown).map(itemHTML).join('') + '</ul>' +
        (dated.length > 1 ? '<button type="button" class="hm-all" data-act="all-up" aria-haspopup="dialog"><span>View all</span><span class="hm-all-n">' + dated.length + '</span></button>' : '')
      : '<p class="hm-quiet">Nothing booked yet.</p>';
    return '<section class="hm-sec hm-week" aria-labelledby="hm-up-h"><h2 id="hm-up-h" class="hm-h">' + w.title + '</h2>' + body + '</section>';
  }
  function rowTitle(it) { return (String(it.title).toLowerCase().indexOf(it.kind.toLowerCase()) >= 0 ? '' : it.kind + ' · ') + it.title; }
  function openAll(all) {
    Portal.openSheet({ title: 'Coming up', size: 'full', rows: all.filter(function (it) { return it.sheet !== false && it.cat !== 'To do'; }).map(function (it) {
      return { value: it.date + it.time + it.title, group: dayLabel(it.date), label: fmt.time(it.time) + ' · ' + rowTitle(it), sub: it.sub, href: it.href };
    }) });
  }

  /* ---------------- Account: two figures ---------------- */
  function accountHTML(m) {
    const bal = Math.round((+m.balance || 0) * 100) / 100;
    const hcp = canGolf(m) && m.handicap != null
      ? '<a class="hm-fig" href="#/scores"><span class="hm-fig-l">Handicap</span><span class="hm-fig-v">' + esc(fmt.handicap(m.handicap)) + '</span></a>' : '';
    return '<section class="hm-sec hm-acct" aria-labelledby="hm-ac-h"><h2 id="hm-ac-h" class="hm-h">Account</h2><div class="hm-figs">' +
      '<a class="hm-fig" href="#/account"><span class="hm-fig-l">Balance</span><span class="hm-fig-v">' + esc(fmt.money(Math.abs(bal))) + '</span>' +
        (bal < 0 ? '<span class="hm-fig-c">In credit</span>' : '') + '</a>' + hcp + '</div></section>';
  }

  /* ---------------- Club notices: plain rows, the date on the right ---------------- */
  function noticesHTML(m) {
    const ns = noticesFor(m).slice(0, 2);
    return '<section class="hm-sec hm-notices" aria-labelledby="hm-n-h"><h2 id="hm-n-h" class="hm-h">Club notices</h2>' +
      (ns.length ? '<ul class="hm-rows hm-nlist">' + ns.map(function (a) {
        return '<li><a class="hm-n" href="#/club/news/' + encodeURIComponent(a.id) + '"><span class="hm-n-title">' + esc(a.title) + '</span><span class="hm-n-when">' + esc(sentLabel(a.sentAt)) + '</span></a></li>';
      }).join('') + '</ul><a class="hm-all" href="#/club/news"><span>View all</span></a>' : '<p class="hm-quiet">No notices right now.</p>') +
    '</section>';
  }

  /* ---------------- Friends playing: the next friend groups; Join, Approve and Decline are words ---------------- */
  function friendsHTML(m, n) {
    const F = Portal.friends; if (!F || !F.friendsOf(m.id).length) return '';
    const all = F.golfing(m.id, 7);
    /* Groups the member can join (or is in) first, then the next groups. */
    const list = all.filter(function (g) { return F.canJoin(m.id, g); }).concat(all.filter(function (g) { return !F.canJoin(m.id, g); }));
    /* Requests to join this member's tee times come first, with Approve and Decline. */
    const reqs = F.joinInbox ? F.joinInbox(m.id) : [];
    const rows = reqs.slice(0, n).map(function (r) { return F.requestRowHTML(m.id, r); }).concat(list.slice(0, Math.max(0, n - reqs.length)).map(function (g) { return F.rowHTML(m.id, g); }));
    return '<section class="hm-sec hm-friends" aria-labelledby="hm-fr-h"><h2 id="hm-fr-h" class="hm-h">Friends playing</h2>' +
      (rows.length ? '<ul class="hm-rows hm-frlist">' + rows.join('') + '</ul>' : '<p class="hm-quiet">No friends playing this week.</p>') +
      '<a class="hm-all" href="#/friends"><span>View all</span>' + (list.length ? '<span class="hm-all-n">' + list.length + '</span>' : '') + '</a></section>';
  }

  /* ---------------- Page ---------------- */
  Portal.register({
    id: 'home', label: 'Home', icon: 'crest', order: 1, tab: true,
    render: function (view, params, member) {
      const m = Portal.member() || member;
      const wide = !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
      const next = nextRound(m);
      /* This week: everything booked except the round on the panel, with a round to post (js/portal/scores.js) first. */
      const all = upcomingFor(m);
      const list = all.filter(function (it) { return !(next && it.tt === next.id); });
      const post = Portal.scores && Portal.scores.homeItem ? Portal.scores.homeItem(m) : null;
      if (post) list.unshift(Object.assign({ kind: 'Other', cat: 'To do', parts: post.sub ? [post.sub] : [] }, post));
      /* A spot opened for the member's waitlist (js/portal/waitlist.js): a notice above everything else. */
      const wl = function () { return Portal.waitlist ? Portal.waitlist.noticesHTML(Portal.member() || m) : ''; };
      /* The cart on the course (js/portal/cart.js), while the member can order: one plain row under the panel. */
      const cart = Portal.cartAction ? Portal.cartAction(m) : '';
      view.innerHTML = '<div class="wl-host">' + wl() + '</div><div class="hm">' +
        '<div class="hm-main">' + greetHTML(m) + nextHTML(m) + (cart ? '<div class="hm-cart">' + cart + '</div>' : '') + weekHTML(list, wide ? 8 : 6) + '</div>' +
        '<div class="hm-side">' + friendsHTML(m, wide ? 3 : 2) + accountHTML(m) + noticesHTML(m) + '</div></div>';
      if (Portal.waitlist) Portal.waitlist.wire(view, m, function () { ui.$('.wl-host', view).innerHTML = wl(); });
      ui.on(view, 'click', '[data-act=all-up]', function () { openAll(all); });
      ui.on(view, 'click', 'a[data-tt]', function (e, a) { openTeeAfterNav(a.dataset.tt); });
      if (Portal.cartHoleCheck) Portal.cartHoleCheck(view, m);
      if (Portal.friends) Portal.friends.wireJoin(view, m.id, function () { const sec = ui.$('.hm-friends', view); if (sec) sec.outerHTML = friendsHTML(Portal.member() || m, wide ? 3 : 2); });
    }
  });
})();
