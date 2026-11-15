/* Members' portal: Events. Club calendar, invitation-style event pages, RSVP and tournament boards.
   Registrations are written exactly as the staff Events module writes them (js/modules/events.js):
   { memberId, guests, registeredAt, charged } on events[].registrations, seats = 1 + guests, golf-only
   types for golfing tiers, and fees posted with Club.chargeMember (category Events, source events,
   refId event id) using the staff descriptions. Cancelling posts the same credit the staff side would. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc;

  const TYPES = ['Tournament', 'Member-Guest', 'League', 'Ladies', 'Junior', 'Corporate', 'Social', 'Dining', 'Private'];
  const GOLF_TYPES = ['Tournament', 'Member-Guest', 'League'];
  const MAX_GUESTS = 8;
  const COURSE = { rating: 73.1, slope: 135 };
  const DEFAULT_PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5];
  const DEFAULT_HCP = [7, 3, 15, 1, 11, 9, 17, 5, 13, 8, 16, 2, 12, 6, 10, 18, 14, 4];
  const MINUS = '−';
  /* Display labels only: stored type values are unchanged. */
  const TYPE_LABEL = { 'Member-Guest': 'Member-guest' };
  const CHIP_LABEL = { Tournament: 'Tournaments', 'Member-Guest': 'Member-guest', League: 'League nights', Junior: 'Juniors', Social: 'Social', Corporate: 'Corporate', Dining: 'Dining', Private: 'Private' };
  function typeLabel(t) { return TYPE_LABEL[t] || t || 'Social'; }
  const LB_TOP = 10;
  const MINUS_SVG = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';

  /* ---------------- Mirrors of the staff module ---------------- */
  function today() { return Club.date.today(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function seats(ev) { return (ev.registrations || []).reduce(function (a, r) { return a + 1 + (+r.guests || 0); }, 0); }
  function feeFor(ev, guests) { return Math.round((+ev.price || 0) * (1 + (+guests || 0)) * 100) / 100; }
  function isGolfer(m) { return !!m && m.tierId !== 'tier_social'; }
  function memberName(id) { const m = Club.members.get(id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function byDate(a, b) { return (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')); }
  function priceLabel(p) { return +p ? F.money0(p) + ' per person' : 'Free'; }
  function timeRange(ev) { return ev.start ? F.time(ev.start) + (ev.end ? ' to ' + F.time(ev.end) : '') : 'Time to be confirmed'; }
  function monthOf(iso) { return iso.slice(0, 7); }
  function monthLabel(ym) { const p = ym.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function typeKey(t) { return String(t || 'Social').toLowerCase().replace(/[^a-z]+/g, '-'); }

  function holeList() {
    const hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    if (hs.length === 18) return hs;
    return DEFAULT_PARS.map(function (p, i) { return { number: i + 1, par: p, handicap: DEFAULT_HCP[i] }; });
  }
  function parTotal(hs) { return hs.reduce(function (a, h) { return a + h.par; }, 0); }
  function courseHcp(idx, hs) { if (idx == null || isNaN(idx)) return 0; return Math.round(idx * COURSE.slope / 113 + (COURSE.rating - parTotal(hs))); }
  function strokesOn(ch, si) {
    if (ch >= 0) return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0);
    const back = -ch; return -(Math.floor(back / 18) + (si > 18 - back % 18 ? 1 : 0));
  }
  function toPar(v) { return v === 0 ? 'E' : (v < 0 ? MINUS + Math.abs(v) : '+' + v); }
  function toParWords(v) { return v === 0 ? 'Even par' : Math.abs(v) + (v < 0 ? ' under par' : ' over par'); }
  function parClass(v) { return v < 0 ? 'under' : (v === 0 ? 'even' : 'over'); }
  function calcLine(p, hs) {
    const ch = courseHcp(p.handicap, hs);
    const o = { p: p, name: memberName(p.memberId), ch: ch, thru: 0, gross: 0, parPlayed: 0, strokes: 0, pts: 0 };
    (p.scores || []).forEach(function (s, i) {
      if (s == null || !hs[i]) return;
      const h = hs[i], st = strokesOn(ch, h.handicap);
      o.thru++; o.gross += s; o.parPlayed += h.par; o.strokes += st;
      o.pts += Math.max(0, 2 + h.par + st - s);
    });
    o.grossToPar = o.gross - o.parPlayed;
    o.netToPar = o.gross - o.strokes - o.parPlayed;
    o.net = o.thru === 18 ? o.gross - ch : null;
    return o;
  }
  function leaderboard(t, mode) {
    const hs = holeList(); const stable = t.format === 'Stableford';
    const lines = (t.field || []).map(function (p) { return calcLine(p, hs); });
    const key = function (l) { return stable ? -l.pts : (mode === 'gross' ? l.grossToPar : l.netToPar); };
    lines.sort(function (a, b) {
      if (!a.thru !== !b.thru) return a.thru ? -1 : 1;
      if (!a.thru) return a.name.localeCompare(b.name);
      return key(a) - key(b) || b.thru - a.thru || a.name.localeCompare(b.name);
    });
    lines.forEach(function (l) {
      if (!l.thru) { l.pos = ''; return; }
      const k = key(l); const first = lines.findIndex(function (x) { return x.thru && key(x) === k; });
      const tied = lines.filter(function (x) { return x.thru && key(x) === k; }).length > 1;
      l.pos = (tied ? 'T' : '') + (first + 1);
    });
    return lines;
  }

  /* ---------------- Member-facing rules ---------------- */
  function myReg(ev, memberId) { return (ev.registrations || []).find(function (r) { return r.memberId === memberId; }) || null; }
  function placesLeft(ev) { return Math.max(0, (+ev.capacity || 0) - seats(ev)); }
  function isOpen(ev) {
    if (ev.status !== 'published') return false;
    if (ev.date < today()) return false;
    if (ev.date === today() && ev.start && toMin(ev.start) <= nowMin()) return false;
    return true;
  }
  function visible(ev, memberId) {
    if (ev.status !== 'published' || ev.date < today()) return false;
    return ev.type !== 'Private' || !!myReg(ev, memberId);
  }
  function eligibility(ev, m) {
    if (!m || m.status !== 'active') return 'Online registration is open to members in good standing. Please call the club office on ' + Club.info.phone + '.';
    if (GOLF_TYPES.indexOf(ev.type) >= 0 && !isGolfer(m)) return 'This competition is for golfing members. The club office will be happy to suggest another event for you.';
    if (ev.type === 'Private') return 'This is a private occasion arranged through the club office.';
    return '';
  }
  function chargeDesc(ev, g) { return ev.title + (g ? ' (member + ' + g + (g === 1 ? ' guest)' : ' guests)') : ' (member)'); }

  /* ---------------- Calendar file ---------------- */
  function downloadIcs(ev, guests) {
    const esc2 = function (s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
    const stamp = function (date, t) { return date.replace(/-/g, '') + 'T' + String(t || '18:00').replace(':', '') + '00'; };
    const n = new Date();
    const dtstamp = n.getUTCFullYear() + pad(n.getUTCMonth() + 1) + pad(n.getUTCDate()) + 'T' + pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + pad(n.getUTCSeconds()) + 'Z';
    const end = ev.end && ev.end > (ev.start || '') ? ev.end : (ev.start ? pad(Math.min(23, Math.floor(toMin(ev.start) / 60) + 3)) + ':' + (ev.start.split(':')[1] || '00') : '21:00');
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + Club.info.name + '//Members//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + ev.id + '-' + (Portal.member() || {}).id + '@stbonifacegolfclub.com', 'DTSTAMP:' + dtstamp, 'DTSTART:' + stamp(ev.date, ev.start), 'DTEND:' + stamp(ev.date, end),
      'SUMMARY:' + esc2(ev.title), 'LOCATION:' + esc2(ev.venue + ', ' + Club.info.name + ', ' + Club.info.address),
      'DESCRIPTION:' + esc2((guests ? 'Attending with ' + guests + (guests === 1 ? ' guest. ' : ' guests. ') : '') + (ev.description || '')), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = 'stboniface-' + typeKey(ev.title) + '.ics';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
      U.toast('Calendar invitation downloaded');
    } catch (e) { U.toast('Your browser could not create the calendar file', 'bad'); }
  }

  /* ---------------- Fragments ---------------- */
  function shortRange(ev) { return ev.start ? F.time(ev.start) + (ev.end ? '–' + F.time(ev.end) : '') : 'Time to be confirmed'; }
  function shortPrice(p) { return +p ? F.money0(p) : 'Free'; }
  function capBar(ev) {
    const cap = +ev.capacity || 0; const s = seats(ev); const left = placesLeft(ev);
    const pct = cap ? Math.min(100, Math.round(s / cap * 100)) : 0;
    const state = !isOpen(ev) ? 'closed' : left <= 0 ? 'full' : left <= 5 ? 'low' : '';
    const label = state === 'closed' ? s + ' of ' + cap + ' filled · Registration closed' : state === 'full' ? s + ' of ' + cap + ' filled · Full' : left <= 5 ? 'Only ' + left + (left === 1 ? ' spot' : ' spots') + ' left' : left + ' spots left';
    return '<div class="pe-cap' + (state ? ' ' + state : '') + '"><div class="pe-cap-bar" role="presentation"><span style="width:' + pct + '%"></span></div><p class="pe-cap-t">' + esc(label) + '</p></div>';
  }
  function goingBadge() { return '<span class="pe-going">Going</span>'; }
  function dateBlock(iso) {
    const d = F.toDate(iso);
    return '<div class="pe-date" aria-hidden="true"><span class="pe-date-wd">' + esc(d.toLocaleDateString('en-US', { weekday: 'short' })) + '</span><span class="pe-date-n">' + d.getDate() + '</span><span class="pe-date-m">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></div>';
  }
  function card(ev, memberId) {
    const reg = myReg(ev, memberId);
    return '<a class="pe-card t-' + typeKey(ev.type) + (reg ? ' mine' : '') + '" href="#/events/' + esc(ev.id) + '">' +
      dateBlock(ev.date) +
      '<div class="pe-card-body"><div class="pe-card-top"><span class="eyebrow">' + esc(typeLabel(ev.type)) + '</span>' + (reg ? goingBadge() : '') + '</div>' +
      '<h3 class="pe-card-title">' + esc(ev.title) + '</h3><p class="pe-card-meta">' + esc(shortRange(ev) + ' · ' + ev.venue + ' · ' + shortPrice(ev.price)) + '</p>' + capBar(ev) + '</div></a>';
  }
  function liveTag(t) {
    return t.status === 'live' ? '<span class="pe-live"><span class="pe-live-dot" aria-hidden="true"></span>Live</span>' : '<span class="pe-final">Final results</span>';
  }
  function boardHTML(t, mode, memberId, full) {
    const lb = leaderboard(t, mode); const stable = t.format === 'Stableford';
    if (!lb.length) return '<p class="pe-lb-empty">No players have been entered yet.</p>';
    const rows = full ? lb : lb.slice(0, LB_TOP);
    /* Outside the top 10, the member's own row is added below so they can always find themselves. */
    const meIdx = lb.findIndex(function (l) { return l.p.memberId === memberId; });
    if (!full && meIdx >= LB_TOP) rows.push(lb[meIdx]);
    return '<div class="pe-lbt-wrap"><table class="pe-lbt"><colgroup><col class="pe-w-pos"><col><col class="pe-w-num"><col class="pe-w-num"></colgroup><thead><tr><th scope="col" class="pe-c-pos"><abbr title="Position">#</abbr></th><th scope="col">Player</th><th scope="col" class="pe-c-num">Holes</th><th scope="col" class="pe-c-num">' + (stable ? 'Points' : 'Score') + '</th></tr></thead><tbody>' +
      rows.map(function (l) {
        const tp = mode === 'gross' ? l.grossToPar : l.netToPar; const me = l.p.memberId === memberId;
        const val = l.thru ? (stable ? String(l.pts) : toPar(tp)) : '–';
        const words = l.thru ? (stable ? l.pts + ' points' : toParWords(tp)) : 'Not started';
        return '<tr class="' + (l.thru ? '' : 'waiting') + (me ? ' me' : '') + (me && !full && meIdx >= LB_TOP ? ' pe-gap' : '') + '">' +
          '<td class="pe-c-pos">' + (l.pos ? esc(l.pos) : '<span aria-hidden="true">–</span>') + '</td>' +
          '<th scope="row" class="pe-c-name">' + esc(l.name) + (me ? ' <span class="pe-you">You</span>' : '') + (l.thru ? '' : '<span class="pe-lb-wait">Not started</span>') + '</th>' +
          '<td class="pe-c-num pe-c-holes">' + (l.thru ? l.thru + '<span class="pe-stack-l"> holes</span>' : '<span aria-hidden="true">–</span>') + '</td>' +
          '<td class="pe-c-num pe-score ' + (l.thru && !stable ? parClass(tp) : '') + '"><span aria-hidden="true">' + esc(val) + '</span><span class="pe-sr">' + esc(words) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (lb.length > LB_TOP ? '<div class="pe-lb-more-row"><button type="button" class="p-link pe-lb-more" data-lb-full="' + (full ? '0' : '1') + '" aria-expanded="' + !!full + '">' + (full ? 'Top ' + LB_TOP + ' only' : 'Full leaderboard (' + lb.length + ')') + '</button></div>' : '');
  }
  function boardPanel(t, memberId, mode, full) {
    const stable = t.format === 'Stableford';
    return '<section class="pe-lb" data-trn="' + esc(t.id) + '" aria-label="Leaderboard: ' + esc(t.name) + '">' +
      '<header class="pe-lb-top"><div class="pe-lb-head">' + liveTag(t) + '<h3 class="pe-lb-title">' + esc(t.name) + '</h3><p class="pe-lb-sub">' + esc(F.toDate(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + t.format) + '</p></div>' +
      (stable ? '<p class="pe-lb-sub">Stableford points</p>' : U.segmented([{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }], mode, 'board').replace('class="segmented"', 'class="segmented pe-lb-mode" role="group" aria-label="Net or gross scores"')) + '</header>' +
      '<div class="pe-lb-board">' + boardHTML(t, mode, memberId, full) + '</div>' +
      '<p class="pe-lb-foot">Par ' + parTotal(holeList()) + ' · Net uses full course handicap · ' + (t.status === 'live' ? 'Updated as cards come in' : 'Confirmed by the golf shop') + '</p>' +
      '</section>';
  }
  function wireBoards(root, memberId, state) {
    U.on(root, 'click', '.pe-lb .segmented[data-name=board] button', function (e, b) {
      const sec = b.closest('.pe-lb'); const t = S.find('tournaments', sec.dataset.trn); if (!t) return;
      state.mode = b.dataset.value;
      U.$$('.segmented[data-name=board] button', sec).forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
      U.$('.pe-lb-board', sec).innerHTML = boardHTML(t, state.mode, memberId, !!state.full[t.id]);
    });
    U.on(root, 'click', '.pe-lb-more', function (e, b) {
      const sec = b.closest('.pe-lb'); const t = S.find('tournaments', sec.dataset.trn); if (!t) return;
      state.full[t.id] = b.dataset.lbFull === '1';
      U.$('.pe-lb-board', sec).innerHTML = boardHTML(t, state.mode, memberId, state.full[t.id]);
      const nb = U.$('.pe-lb-more', sec); if (nb) nb.focus();
    });
  }
  function showBoards() {
    const cutoff = Club.date.fromToday(-21);
    return S.all('tournaments').filter(function (t) { return t.status === 'live' || (t.status === 'final' && t.date >= cutoff); })
      .sort(function (a, b) { return (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || b.date.localeCompare(a.date); });
  }
  function upcoming(member) { return S.all('events').filter(function (e) { return visible(e, member.id); }).sort(byDate); }
  function pageHead(evs, mine) {
    const n = mine.length;
    return '<section class="p-hero pe-hero"><h1>Events</h1><p class="pe-status">' + evs.length + ' upcoming · ' + (n ? 'You’re going to ' + n : 'You haven’t registered for any yet') + '</p></section>';
  }
  function head(member, active) {
    const evs = upcoming(member);
    return pageHead(evs, evs.filter(function (e) { return myReg(e, member.id); })) + pageTabs(active);
  }
  function mineRow(e, memberId) {
    const r = myReg(e, memberId);
    return '<li><a href="#/events/' + esc(e.id) + '"><span class="pe-mine-main"><span class="pe-mine-when">' + esc(F.toDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (e.start ? ' · ' + F.time(e.start) : '')) + '</span>' +
      '<span class="pe-mine-title">' + esc(e.title) + '</span><span class="pe-mine-sub">' + esc(e.venue + ' · ' + guestLine(r.guests)) + '</span></span>' + Club.icon('chevronRight') + '</a></li>';
  }
  function guestLine(g) { return g ? 'You + ' + g + (g === 1 ? ' guest' : ' guests') : 'Just you'; }

  /* ---------------- Calendar tab ---------------- */
  let typeFilter = 'All';
  const boardState = { mode: 'net', pick: null, full: {} };
  /* Phones keep the Pass 3 limits; tablets and desktops have room to show more. */
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  function isDesk() { return mq('(min-width: 1024px)'); }
  function isTab() { return mq('(min-width: 768px)'); }
  function mineShow() { return isDesk() ? 4 : 2; }
  function openShow() { return isDesk() ? 99 : isTab() ? 4 : 2; }
  /* Re-render the Events page when the layout crosses a breakpoint (e.g. rotating a tablet). */
  ['(min-width: 768px)', '(min-width: 1024px)'].forEach(function (q) {
    const m = window.matchMedia && window.matchMedia(q); if (!m || !m.addEventListener) return;
    m.addEventListener('change', function () { if (/^#\/events\/?$/.test(location.hash) && !document.querySelector('.ps-sheet, .overlay') && Portal.render) Portal.render(); });
  });
  function liveSummary(t, memberId) {
    const lb = leaderboard(t, 'net').filter(function (l) { return l.thru; }).slice(0, 5);
    return '<section class="pe-side-lb" aria-labelledby="pe-slb-h"><div class="pe-side-lb-head"><span class="pe-live"><span class="pe-live-dot" aria-hidden="true"></span>Live</span><h2 id="pe-slb-h" class="pe-lb-title">' + esc(t.name) + '</h2><p class="pe-lb-sub">Top 5 · net</p></div>' +
      '<ol class="pe-side-rows">' + lb.map(function (l) { return '<li' + (l.p.memberId === memberId ? ' class="me"' : '') + '><span class="pe-c-pos">' + esc(l.pos) + '</span><span class="pe-side-name">' + esc(l.name) + '</span><span class="pe-score ' + parClass(l.netToPar) + '"><span aria-hidden="true">' + esc(toPar(l.netToPar)) + '</span><span class="pe-sr">' + esc(toParWords(l.netToPar)) + '</span></span></li>'; }).join('') + '</ol>' +
      '<a class="p-link pe-side-go" href="#/events/leaderboard" data-trn="' + esc(t.id) + '">Full leaderboard' + Club.icon('chevronRight') + '</a></section>';
  }

  function renderIndex(view, member) {
    const evs = upcoming(member);
    const mine = evs.filter(function (e) { return myReg(e, member.id); });
    const types = TYPES.filter(function (t) { return evs.some(function (e) { return e.type === t; }); });
    if (typeFilter !== 'All' && types.indexOf(typeFilter) < 0) typeFilter = 'All';
    const live = S.all('tournaments').filter(function (t) { return t.status === 'live'; })[0];

    view.innerHTML = pageHead(evs, mine) + pageTabs('calendar') + '<div class="pe-cal-layout"><div class="pe-side">' +
      (live ? '<a class="pe-live-banner" href="#/events/leaderboard" data-trn="' + esc(live.id) + '"><span class="pe-live-dot" aria-hidden="true"></span><span class="pe-lbn-t"><span class="pe-lbn-b">Live now: ' + esc(live.name) + '</span><span class="pe-lbn-l">View leaderboard</span></span>' + Club.icon('chevronRight') + '</a>' : '') +
      '<section class="pe-mine" aria-labelledby="pe-mine-h"><h2 id="pe-mine-h">My events</h2>' +
        (mine.length ? '<ul class="p-list pe-mine-list">' + mine.slice(0, mineShow()).map(function (e) { return mineRow(e, member.id); }).join('') +
          (mine.length > mineShow() ? '<li><button type="button" class="pe-mine-all">' + 'All my events (' + mine.length + ')' + Club.icon('chevronRight') + '</button></li>' : '') + '</ul>'
          : '<p class="pe-quiet">You haven’t registered for any events yet. Choose one below.</p>') +
      '</section>' + (live && isDesk() ? liveSummary(live, member.id) : '') + '</div>' +
      '<section class="pe-cal" aria-labelledby="pe-cal-h"><div class="pe-cal-head"><h2 id="pe-cal-h">Upcoming</h2>' +
        (evs.length >= 6 ? '<div class="pe-filter-f"></div>' : '') + '</div>' +
        '<div class="pe-months" aria-live="polite"></div></section></div>';

    if (evs.length >= 6) {
      Portal.selectField(U.$('.pe-filter-f', view), {
        title: 'Show events', value: typeFilter,
        rows: [{ value: 'All', label: 'All events', meta: String(evs.length) }].concat(types.map(function (t) { return { value: t, label: CHIP_LABEL[t] || t, meta: String(evs.filter(function (e) { return e.type === t; }).length) }; })),
        onChange: function (v) { typeFilter = v; drawMonths(); }
      });
    }
    function drawMonths() {
      const list = evs.filter(function (e) { return typeFilter === 'All' || e.type === typeFilter; });
      const groups = {}; list.forEach(function (e) { (groups[monthOf(e.date)] = groups[monthOf(e.date)] || []).push(e); });
      const t0 = today(); const cur = monthOf(t0); const nd = F.toDate(t0); const nxt = monthOf(new Date(nd.getFullYear(), nd.getMonth() + 1, 1).toISOString().slice(0, 10));
      const keys = Object.keys(groups).sort();
      const openKeys = keys.filter(function (k) { return k <= nxt; }); if (!openKeys.length && keys.length) openKeys.push(keys[0]);
      /* Open months show the next OPEN_SHOW events; the rest of an open month sits in a collapsed row, later months are accordions. */
      let shown = 0;
      const host = U.$('.pe-months', view);
      host.innerHTML = list.length ? keys.map(function (k) {
        const evsK = groups[k]; const n = evsK.length; const name = monthLabel(k).replace(' ' + t0.slice(0, 4), '');
        const grid = function (arr) { return '<div class="pe-grid">' + arr.map(function (e) { return card(e, member.id); }).join('') + '</div>'; };
        if (openKeys.indexOf(k) >= 0) {
          const take = Math.max(0, Math.min(n, openShow() - shown)); shown += take;
          const rest = evsK.slice(take);
          if (!take) return '<div class="pe-month pe-month-acc">' + Portal.accordion({ id: 'pe-m-' + k, title: name, summary: n + (n === 1 ? ' event' : ' events'), body: grid(evsK) }) + '</div>';
          return '<div class="pe-month"><h3 class="pe-month-title">' + esc(name) + '</h3>' + grid(evsK.slice(0, take)) +
            (rest.length ? '<div class="pe-month-acc pe-month-rest">' + Portal.accordion({ id: 'pe-mr-' + k, title: 'More in ' + name, summary: rest.length + (rest.length === 1 ? ' event' : ' events'), body: grid(rest) }) + '</div>' : '') + '</div>';
        }
        return '<div class="pe-month pe-month-acc">' + Portal.accordion({ id: 'pe-m-' + k, title: name, summary: n + (n === 1 ? ' event' : ' events'), body: grid(evsK) }) + '</div>';
      }).join('') : '<div class="panel">' + U.empty({ icon: 'events', title: 'No events to show', text: typeFilter === 'All' ? 'New events will appear here as soon as the club announces them.' : 'There are no upcoming events of this type. Try another filter.' }) + '</div>';
      void cur;
    }
    drawMonths();
    U.on(view, 'click', '.pe-mine-all', function () {
      Portal.openSheet({ title: 'My events', size: 'full', rows: mine.map(function (e) {
        const r = myReg(e, member.id);
        return { value: e.id, href: '#/events/' + e.id, label: e.title, sub: F.toDate(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (e.start ? ' · ' + F.time(e.start) : '') + ' · ' + e.venue + ' · ' + guestLine(r.guests) };
      }) });
    });
    U.on(view, 'click', '.pe-live-banner, .pe-side-go', function (e, a) { boardState.pick = a.dataset.trn; });
  }

  /* ---------------- Leaderboard tab ---------------- */
  function renderBoards(view, member) {
    const boards = showBoards();
    if (!boards.some(function (t) { return t.id === boardState.pick; })) boardState.pick = boards[0] ? boards[0].id : null;
    view.innerHTML = head(member, 'leaderboard') +
      (boards.length ? '<div class="pe-lbx' + (boards.length > 1 ? '' : ' one') + '"><div class="pe-lb-pick"></div><div class="pe-board-host"></div></div>'
        : '<div class="panel">' + U.empty({ icon: 'trophy', title: 'No leaderboards right now', text: 'Results from live and recent tournaments appear here.' }) + '</div>');
    if (!boards.length) return;
    function drawBoard() {
      const t = S.find('tournaments', boardState.pick); if (!t) return;
      U.$('.pe-board-host', view).innerHTML = boardPanel(t, member.id, boardState.mode, !!boardState.full[t.id]);
    }
    if (boards.length > 1) {
      Portal.selectField(U.$('.pe-lb-pick', view), {
        label: 'Tournament', title: 'Choose a tournament', icon: 'trophy', value: boardState.pick,
        rows: boards.map(function (x) { return { value: x.id, label: x.name, sub: (x.status === 'live' ? 'Live · ' : 'Final · ') + F.dateShort(x.date) + ' · ' + x.format }; }),
        onChange: function (v) { boardState.pick = v; drawBoard(); }
      });
    }
    drawBoard();
    wireBoards(view, member.id, boardState);
  }

  /* ---------------- Detail ---------------- */
  let justBooked = null;

  function renderEvent(view, id, member) {
    const ev = S.find('events', id);
    const back = '<a class="pe-back" href="#/events">' + Club.icon('chevronLeft') + '<span>All events</span></a>';
    if (!ev || ev.status === 'draft' || (ev.type === 'Private' && !myReg(ev, member.id))) {
      view.innerHTML = back + '<div class="panel">' + U.empty({ icon: 'events', title: 'Event not found', text: 'This event may have been cancelled or not announced yet.', action: '<a class="btn btn-primary" href="#/events">See all events</a>' }) + '</div>';
      return;
    }
    const d = F.toDate(ev.date); const reg = myReg(ev, member.id);
    const trns = S.where('tournaments', function (t) { return t.eventId === ev.id && (t.status === 'live' || t.status === 'final'); });
    view.innerHTML = back + '<div class="pe-dgrid">' +
      '<article class="pe-detail t-' + typeKey(ev.type) + '">' +
        '<div class="pe-card-top"><span class="eyebrow">' + esc(typeLabel(ev.type)) + '</span>' + (reg ? goingBadge() : '') + '</div>' +
        '<h1 class="pe-detail-title">' + esc(ev.title) + '</h1>' +
        '<ul class="pe-meta"><li>' + Club.icon('calendar') + '<span>' + esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (ev.start ? ' · ' + shortRange(ev) : '')) + '</span></li><li>' + Club.icon('pin') + '<span>' + esc(ev.venue) + '</span></li><li>' + Club.icon('tag') + '<span>' + esc(priceLabel(ev.price)) + '</span></li></ul>' +
        (ev.status === 'published' ? capBar(ev) : '') +
        (ev.description ? '<div class="pe-desc clamped"><p id="pe-desc-t">' + esc(ev.description) + '</p><button type="button" class="p-link pe-more" aria-expanded="false" aria-controls="pe-desc-t" hidden>More</button></div>' : '') +
      '</article>' +
      (trns.length ? '<ul class="p-list pe-detail-boards">' + trns.map(function (t) { return '<li><a href="#/events/leaderboard" data-trn="' + esc(t.id) + '" class="pe-board-link">' + Club.icon('trophy') + '<span class="pe-mine-main"><span class="pe-mine-title">Leaderboard</span><span class="pe-mine-sub">' + esc((t.status === 'live' ? 'Live now · ' : 'Final results · ') + t.name) + '</span></span>' + Club.icon('chevronRight') + '</a></li>'; }).join('') + '</ul>' : '') +
      '<div class="pe-rsvp-host"></div></div>';
    const desc = U.$('.pe-desc', view);
    if (desc) {
      const p = U.$('p', desc), b = U.$('.pe-more', desc);
      if (p.scrollHeight > p.clientHeight + 2) b.hidden = false; else desc.classList.remove('clamped');
      b.addEventListener('click', function () { const open = desc.classList.toggle('clamped') === false; b.textContent = open ? 'Less' : 'More'; b.setAttribute('aria-expanded', open); });
    }
    U.on(view, 'click', '.pe-board-link', function (e, a) { boardState.pick = a.dataset.trn; });
    drawRsvp(U.$('.pe-rsvp-host', view), ev.id, member.id);
  }

  function whoLine(g) { return g ? 'You and ' + g + (g === 1 ? ' guest' : ' guests') : 'Just you'; }

  /** The detail header's Going tag and spots-left bar, redrawn after a register, change or cancel. */
  function refreshHead(evId, memberId) {
    const art = document.querySelector('.pe-detail'), ev = S.find('events', evId); if (!art || !ev) return;
    const top = U.$('.pe-card-top', art), tag = top && U.$('.pe-going', top), reg = myReg(ev, memberId);
    if (top && reg && !tag) top.insertAdjacentHTML('beforeend', goingBadge()); else if (tag && !reg) tag.remove();
    const cap = U.$('.pe-cap', art); if (cap && ev.status === 'published') cap.outerHTML = capBar(ev);
  }
  function drawRsvp(host, evId, memberId) {
    const ev = S.find('events', evId); const m = Portal.member();
    if (!ev || !m) return;
    hideBar();
    refreshHead(evId, memberId);
    const reg = myReg(ev, memberId);
    /* Receipts for this event's charges and credits (Club.chargeMember makes them), newest first */
    const rcs = reg ? Portal.receiptsFor('events', ev.id, memberId) : [];
    let html;
    if (justBooked === evId && reg) {
      justBooked = null;
      html = '<section class="pe-rsvp pe-confirm" aria-live="polite"><div class="pe-confirm-head"><span class="pe-att-mark">' + Club.icon('check') + '</span><div><h2>You’re registered</h2>' +
        '<p class="pe-confirm-line">' + esc(ev.title) + ' · ' + esc(F.dateShort(ev.date)) + (ev.start ? ' at ' + esc(F.time(ev.start)) : '') + '</p></div></div>' +
        '<dl class="pe-kv"><div><dt>Who’s going</dt><dd>' + esc(whoLine(reg.guests)) + '</dd></div><div><dt>Charged to your account</dt><dd>' + (reg.charged ? F.money(reg.charged) : 'No charge') + '</dd></div></dl>' +
        '<div class="pe-rsvp-acts">' + U.btn('Add to calendar', { kind: 'primary', icon: 'calendar', action: 'ics' }) + (reg.charged ? Portal.receiptLink(rcs.slice(0, 1), { btn: true, label: 'View receipt' }) : '') + U.btn('Done', { action: 'done' }) + '</div></section>';
    } else if (reg) {
      const names = (reg.guestNames || []).filter(Boolean);
      const rcBtn = Portal.receiptLink(rcs, { btn: true, label: rcs.length > 1 ? 'View receipts' : 'View receipt' });
      html = '<section class="pe-rsvp">' +
        '<div class="pe-confirm-head"><span class="pe-att-mark">' + Club.icon('check') + '</span><div><h2>' + (reg.guests ? 'You’re going with ' + reg.guests + (reg.guests === 1 ? ' guest' : ' guests') : 'You’re going') + '</h2>' +
        (names.length ? '<p class="pe-att-names">Guests: ' + esc(names.join(', ')) + '</p>' : '') +
        '<p class="pe-att-fee">' + (reg.charged ? F.money(reg.charged) + ' charged to your account (Events).' : (+ev.price ? 'Fees for this event are settled with the club office.' : 'This event is free.')) + '</p></div></div>' +
        (isOpen(ev) ? '<div class="pe-rsvp-acts">' + U.btn('Change guests', { icon: 'edit', action: 'modify' }) + U.btn('Add to calendar', { icon: 'calendar', action: 'ics' }) + rcBtn + U.btn('Cancel registration', { kind: 'danger', icon: 'close', action: 'cancel' }) + '</div>'
          : '<p class="pe-closed-note">' + (ev.status === 'cancelled' ? 'This event has been cancelled. The club office will contact you about any fees.' : 'Registration is closed. To make a change, call ' + esc(Club.info.phone) + '.') + '</p>' + (ev.date >= today() || rcBtn ? '<div class="pe-rsvp-acts">' + (ev.date >= today() ? U.btn('Add to calendar', { icon: 'calendar', action: 'ics' }) : '') + rcBtn + '</div>' : '')) +
        '</section>';
    } else if (ev.status === 'cancelled') {
      html = notice('This event has been cancelled', 'This event will not go ahead. See the calendar for other events.');
    } else if (ev.date < today() || ev.status === 'completed') {
      html = notice('This event has finished', 'Thank you to everyone who came. See the calendar for upcoming events.');
    } else if (!isOpen(ev)) {
      html = notice('Registration closed', 'This event has started. If you are arriving late, call the club office on ' + Club.info.phone + '.');
    } else if (placesLeft(ev) <= 0) {
      html = notice('This event is full', 'All spots are taken. If a spot opens up, the club office on ' + Club.info.phone + ' can help.');
    } else if (eligibility(ev, m)) {
      html = notice('Registration through the club office', eligibility(ev, m));
    } else {
      html = null;
    }
    if (html === null) { regFlow(host, ev, null); }
    else host.innerHTML = html;
    if (!host.dataset.wired) {
      host.dataset.wired = '1';
      U.on(host, 'click', '[data-action]', function (e, b) {
        const a = b.dataset.action; const cur = S.find('events', evId); if (!cur) return;
        const r = myReg(cur, memberId);
        if (a === 'ics') downloadIcs(cur, r ? r.guests : 0);
        else if (a === 'done') drawRsvp(host, evId, memberId);
        else if (a === 'modify' && r) regFlow(host, cur, r);
        else if (a === 'keep') drawRsvp(host, evId, memberId);
        else if (a === 'cancel' && r) cancelReg(host, cur, r);
      });
    }
  }
  /* The kit adds the bar's open class in a requestAnimationFrame; re-check after it so a show() that is
     still pending cannot reopen the bar once registration is done. */
  function hideBar() {
    Portal.actionBar.hide();
    requestAnimationFrame(function () { if (!document.querySelector('.pe-reg')) Portal.actionBar.hide(); });
  }
  function notice(title, text) {
    return '<section class="pe-rsvp pe-notice"><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><a class="btn" href="#/events">See all events</a></section>';
  }

  /* Registration: the guests control and the Register / Save button live in the sticky action bar. With no guests the
     bar shows "Add a guest" (a new registration starts with none, Member-Guest too); from one guest it is the − / +
     stepper, and back at 0 the button returns. The page shows the total, optional guest names and any error.
     Validation and charges are unchanged. */
  function regFlow(host, ev0, reg) {
    const oldG = reg ? +reg.guests || 0 : 0;
    let g = reg ? oldG : 0; const names = (reg && reg.guestNames ? reg.guestNames.slice() : []);
    function maxGuests() { const e = S.find('events', ev0.id) || ev0; return Math.max(0, Math.min(MAX_GUESTS, placesLeft(e) + (reg ? 1 + oldG : 0) - 1)); }
    host.innerHTML = '<section class="pe-rsvp pe-reg"><h2>' + (reg ? 'Change your guests' : 'Register') + '</h2><p class="pe-guests-hint"></p><div class="pe-total"></div><div class="pe-names"></div><div class="pe-form-err" role="alert" hidden></div>' +
      (reg ? '<button type="button" class="p-link" data-action="keep">Keep as it was</button>' : '') + '</section>';
    const sec = U.$('.pe-reg', host);
    let stepper = null;
    function saveNames() { U.$$('.pe-names input', sec).forEach(function (i, k) { names[k] = i.value; }); }
    function draw() {
      const ev = S.find('events', ev0.id) || ev0; const max = maxGuests();
      if (g > max) g = max;
      U.$('.pe-guests-hint', sec).textContent = (ev.type === 'Member-Guest' ? 'This event is played with a guest. ' : '') +
        (max === 0 ? 'Only your own spot is left.' : g ? 'Change the number of guests with − and + below (up to ' + max + ').' : 'Bringing someone? Use Add a guest below (up to ' + max + ').');
      saveNames();
      let h = '';
      for (let i = 0; i < g; i++) h += '<div class="field"><label for="pe-gn-' + i + '">Guest ' + (i + 1) + ' name (optional)</label><input class="input" id="pe-gn-' + i + '" maxlength="80" autocomplete="off" value="' + esc(names[i] || '') + '"></div>';
      U.$('.pe-names', sec).innerHTML = h;
      const total = feeFor(ev, g);
      let line;
      if (!reg) line = +ev.price ? (1 + g) + (g ? ' people' : ' person') + ' × ' + F.money0(ev.price) + ', charged to your member account' : 'Free for members and guests';
      else {
        const delta = Math.round((+ev.price || 0) * (g - oldG) * 100) / 100;
        const refund = delta < 0 ? Math.min(-delta, +reg.charged || 0) : 0;
        line = !+ev.price ? 'Free' : delta > 0 ? F.money(delta) + ' will be added to your account' : delta < 0 ? (refund ? 'A credit of ' + F.money(refund) + ' will be added to your account' : 'No change to your account') : 'No change to your account';
      }
      U.$('.pe-total', sec).innerHTML = '<div class="pe-total-row"><span class="pe-total-l">' + (reg ? 'New total' : 'Total') + '</span><span class="pe-total-n">' + (+ev.price ? F.money(total) : 'Free') + '</span></div><p>' + esc(line) + '</p>';
      if (stepper) stepper.update({ value: g, max: max });
      const add = U.$('.pe-bar-g [data-action=add-guest]', Portal.actionBar.el());
      if (add) add.hidden = max === 0;
    }
    /** The bar's guests control: "Add a guest" at 0, the stepper from 1. focus: move focus to the new control. */
    function paintGuests(focus) {
      const host = U.$('.pe-bar-g', Portal.actionBar.el()); if (!host) return;
      stepper = null;
      if (!g) {
        host.innerHTML = U.btn('Add a guest', { icon: 'plus', action: 'add-guest' });
        const add = U.$('[data-action=add-guest]', host);
        add.hidden = maxGuests() === 0;
        add.addEventListener('click', function () { g = 1; draw(); paintGuests(true); });
        if (focus) add.focus();
      } else {
        stepper = Portal.stepper(host, { label: 'Guests', value: g, min: 0, max: maxGuests(), onChange: function (v) { g = v; draw(); if (!g) paintGuests(true); } });
        if (focus) { const plus = U.$('.pk-step[data-d="1"]', host); if (plus && !plus.disabled) plus.focus(); else { const minus = U.$('.pk-step[data-d="-1"]', host); if (minus) minus.focus(); } }
      }
    }
    /** dry: run every check without saving (the review step). Returns true when it would go through. */
    function submit(dry) {
      const err = U.$('.pe-form-err', sec);
      const fail = function (msg) { err.innerHTML = Club.icon('alert') + '<span>' + esc(msg) + '</span>'; err.hidden = false; U.toast(msg, 'bad'); };
      err.hidden = true;
      const gn = U.$$('.pe-names input', sec).map(function (i) { return i.value.trim(); });
      const fresh = S.find('events', ev0.id); const m = Portal.member();
      if (!fresh || !m) return fail('This event is no longer available.');
      if (!isOpen(fresh)) return fail('Registration for this event is closed.');
      if (g < 0 || g > MAX_GUESTS || g % 1) return fail('Please choose between 0 and ' + MAX_GUESTS + ' guests.');
      const existing = myReg(fresh, m.id);
      if (!reg) {
        const el = eligibility(fresh, m); if (el) return fail(el);
        if (existing) return fail('You are already registered for this event.');
        if (seats(fresh) + 1 + g > fresh.capacity) return fail(placesLeft(fresh) ? 'Only ' + placesLeft(fresh) + (placesLeft(fresh) === 1 ? ' spot is left.' : ' spots are left.') : 'This event is now full.');
        if (dry) return true;
        const amount = feeFor(fresh, g);
        const r = { memberId: m.id, guests: g, registeredAt: today(), charged: 0, guestNames: gn };
        if (amount > 0) {
          const ch = Club.chargeMember(m.id, { description: chargeDesc(fresh, g), category: 'Events', amount: amount, source: 'events', refId: fresh.id, date: today(),
            title: fresh.title, lines: [{ name: 'Member registration', qty: 1, price: +fresh.price }].concat(g ? [{ name: 'Guest registration', qty: g, price: +fresh.price }] : []) });
          if (ch) r.charged = ch.amount;
        }
        S.update('events', fresh.id, { registrations: (fresh.registrations || []).concat([r]) });
        justBooked = fresh.id;
        U.toast('You’re registered' + (r.charged ? '. ' + F.money(r.charged) + ' charged to your account' : ''));
      } else {
        if (!existing) return fail('Your registration could not be found. Please refresh.');
        const prevG = +existing.guests || 0;
        if (seats(fresh) - (1 + prevG) + 1 + g > fresh.capacity) return fail('Only ' + (placesLeft(fresh) + prevG) + ' guest spots are left.');
        if (dry) return true;
        let charged = +existing.charged || 0;
        const delta = Math.round((+fresh.price || 0) * (g - prevG) * 100) / 100;
        if (delta > 0) {
          const n = g - prevG;
          const ch = Club.chargeMember(m.id, { description: fresh.title + ' (' + n + ' additional ' + (n === 1 ? 'guest)' : 'guests)'), category: 'Events', amount: delta, source: 'events', refId: fresh.id, date: today(),
            title: fresh.title, lines: [{ name: 'Guest registration', qty: n, price: +fresh.price }] });
          if (ch) charged = Math.round((charged + ch.amount) * 100) / 100;
        } else if (delta < 0) {
          const credit = Math.min(-delta, charged);
          if (credit > 0) {
            const n = prevG - g;
            const ch = Club.chargeMember(m.id, { description: 'Credit: ' + fresh.title + ' (' + n + ' guest ' + (n === 1 ? 'place' : 'places') + ' released)', category: 'Events', amount: -credit, source: 'events', refId: fresh.id, date: today(),
              title: fresh.title, lines: [{ name: n + ' guest ' + (n === 1 ? 'place' : 'places') + ' released', qty: 1, price: credit }] });
            if (ch) charged = Math.round((charged + ch.amount) * 100) / 100;
          }
        }
        S.update('events', fresh.id, { registrations: fresh.registrations.map(function (r) { return r.memberId === m.id ? Object.assign({}, r, { guests: g, guestNames: gn, charged: charged }) : r; }) });
        U.toast(g === prevG ? 'Guest names saved' : 'Your guests have been updated');
      }
      drawRsvp(host, ev0.id, m.id);
      const wrap = U.$('.pe-rsvp', host) || host;
      wrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }
    /* Register (or Save with a change to the bill) opens a review sheet first, so one tap never charges anyone:
       Back changes nothing, and Confirm locks after the first tap. A change to guest names only saves straight away. */
    let busy = false;
    function onRegister() {
      if (busy || !submit(true)) return;
      const ev = S.find('events', ev0.id) || ev0, price = +ev.price || 0;
      const delta = reg ? Math.round(price * (g - oldG) * 100) / 100 : 0;
      if (reg && !delta) { submit(false); return; }
      review(ev, price, delta);
    }
    function review(ev, price, delta) {
      const gn = U.$$('.pe-names input', sec).map(function (i) { return i.value.trim(); }).filter(Boolean);
      const total = feeFor(ev, g), refund = delta < 0 ? Math.min(-delta, +reg.charged || 0) : 0;
      const when = F.toDate(ev.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (ev.start ? ' · ' + shortRange(ev) : '');
      const money = !price ? 'Free' : !reg ? F.money(total) : delta > 0 ? F.money(delta) + ' more' : refund ? F.money(refund) + ' back' : 'No change';
      const moneyLine = !price ? 'Free for members and guests.' : !reg ? 'Charged to your member account when you confirm.' : delta > 0 ? 'Added to your member account when you confirm.' : refund ? 'A credit on your member account when you confirm.' : 'Nothing changes on your account.';
      const terms = !reg ? 'You can cancel online until the event starts' + (price ? ', and what you paid comes back as a credit on your account.' : '.') : delta > 0 ? 'If you remove guests later, their fee comes back as a credit.' : 'Your other spots stay as they are.';
      const ok = !price ? (reg ? 'Confirm change' : 'Confirm registration') : !reg ? 'Confirm and pay ' + F.money(total) : delta > 0 ? 'Confirm and pay ' + F.money(delta) : 'Confirm change';
      const content = '<div class="pe-review"><dl class="pe-kv">' +
          '<div><dt>Event</dt><dd>' + esc(ev.title) + '</dd></div><div><dt>When</dt><dd>' + esc(when) + '</dd></div>' +
          '<div><dt>Who’s going</dt><dd>' + esc(whoLine(g)) + (gn.length ? '<span class="pe-review-sub">Guests: ' + esc(gn.join(', ')) + '</span>' : '') + '</dd></div>' +
          '<div><dt>' + (reg ? 'Change to your bill' : 'Total') + '</dt><dd><strong class="pe-review-total">' + esc(money) + '</strong><span class="pe-review-sub">' + esc(moneyLine) + '</span></dd></div></dl>' +
        '<p class="pe-review-terms">' + esc(terms) + '</p></div>';
      const sh = Portal.openSheet({ title: reg ? 'Confirm your change' : 'Confirm your registration', content: content,
        footer: '<div class="pe-review-acts"><button type="button" class="btn" data-rv="back">Back</button><button type="button" class="btn btn-primary" data-rv="ok">' + esc(ok) + '</button></div>' });
      if (sh.duplicate) return;
      U.on(sh.foot, 'click', '[data-rv]', function (e, b) {
        if (b.dataset.rv === 'back') { sh.close(); return; }
        if (busy) return;
        busy = true; b.disabled = true; b.setAttribute('aria-busy', 'true');
        sh.close();
        submit(false);
        busy = false;
      });
    }
    draw();
    /* Shown after the current task: the kit hides the bar on hashchange, which fires after the route renders. */
    setTimeout(function () {
      if (!document.body.contains(sec)) return;
      Portal.actionBar.show({ summaryHTML: '<div class="pe-bar-g"></div>', label: reg ? 'Save' : 'Register', onClick: onRegister });
      paintGuests(false);
    }, 0);
  }

  function cancelReg(host, ev, reg) {
    const refund = +reg.charged || 0;
    U.confirm({ title: 'Cancel your registration?', text: (reg.guests ? 'Your spots for you and ' + reg.guests + (reg.guests === 1 ? ' guest' : ' guests') : 'Your spot') + ' at ' + ev.title + ' will be released.' + (refund ? ' A credit of ' + F.money(refund) + ' will be added to your account.' : ''), confirmLabel: 'Cancel registration', danger: true }).then(function (ok) {
      if (!ok) return;
      const fresh = S.find('events', ev.id); if (!fresh) return;
      const cur = myReg(fresh, reg.memberId); if (!cur) { drawRsvp(host, ev.id, reg.memberId); return; }
      const amt = +cur.charged || 0;
      S.update('events', fresh.id, { registrations: fresh.registrations.filter(function (r) { return r.memberId !== reg.memberId; }) });
      if (amt) Club.chargeMember(reg.memberId, { description: 'Credit: ' + fresh.title + ' registration cancelled', category: 'Events', amount: -amt, source: 'events', refId: fresh.id, date: today(),
        title: fresh.title, lines: [{ name: 'Registration cancelled', qty: 1, price: amt }] });
      U.toast('Registration cancelled' + (amt ? '. A credit has been added to your account' : ''));
      drawRsvp(host, ev.id, reg.memberId);
    });
  }


  /* ---------------- Members' league ----------------
     Standings and scoring come from Club.league (js/shared/events-data.js, shared with the staff Events module).
     Joining writes the member's id to leagues[].members exactly as the staff roster does. No fee is charged. */
  function pageTabs(active) {
    return '<nav class="pe-tabs" aria-label="Events sections">' + [['calendar', '#/events', 'Calendar'], ['leaderboard', '#/events/leaderboard', 'Leaderboard'], ['league', '#/events/league', 'League']].map(function (t) {
      return '<a href="' + t[1] + '" class="pe-tab' + (active === t[0] ? ' on' : '') + '"' + (active === t[0] ? ' aria-current="page"' : '') + '>' + t[2] + '</a>';
    }).join('') + '</nav>';
  }
  function canGolf(m) {
    if (Club.league && Club.league.canGolf) return Club.league.canGolf(m);
    return isGolfer(m) && (!Club.teeRules || Club.teeRules.tierRules(m).golf !== false);
  }
  function moveHTML(mv) {
    if (mv === 'new') return '<span class="pl-move new">New</span>';
    if (mv == null || mv === 0) return '<span class="pl-move same"><span aria-hidden="true">–</span><span class="pe-sr">No change</span></span>';
    return '<span class="pl-move ' + (mv > 0 ? 'up' : 'down') + '">' + Club.icon(mv > 0 ? 'arrowUp' : 'arrowDown') + '<span aria-hidden="true">' + Math.abs(mv) + '</span><span class="pe-sr">' + (mv > 0 ? 'Up ' : 'Down ') + Math.abs(mv) + '</span></span>';
  }
  function pluralWk(n) { return n + (n === 1 ? ' night' : ' nights'); }


  function renderLeague(view, member) {
    const L = Club.league; const lg = L && L.current ? L.current() : null;
    if (!lg) {
      view.innerHTML = head(member, 'league') +
        '<div class="panel">' + U.empty({ icon: 'trophy', title: 'The league isn’t set up yet', text: 'The golf shop will post the league season here. Questions? Call the club office on ' + Club.info.phone + '.' }) + '</div>';
      return;
    }
    const me = Portal.member() || member;
    const st = L.status(lg); const stroke = lg.format === 'Stroke play';
    const sd = L.standings(lg); const rows = sd.rows;
    const onRoster = (lg.members || []).indexOf(me.id) >= 0;
    const mine = rows.find(function (r) { return r.memberId === me.id; });
    const year = lg.season ? lg.season.start.slice(0, 4) : '';
    const nextW = st !== 'complete' ? (lg.weeks || []).find(function (w) { return w.date >= today() && !w.cancelled; }) : null;
    const lastW = sd.upto != null && sd.upto >= 0 ? lg.weeks[sd.upto] : null;

    let joinHTML = '';
    if (!onRoster && canGolf(me) && me.status === 'active' && st !== 'complete') {
      joinHTML = '<section class="panel pl-join"><div><h2>Join the league</h2>' +
        '<p>It’s free to join. Play the ' + esc(lg.night.toLowerCase()) + 's that suit you. Your points count from the nights you play.</p></div>' +
        U.btn('Join the league', { kind: 'primary', icon: 'plus', action: 'join' }) + '</section>';
    } else if (!onRoster && canGolf(me) && st === 'complete') {
      joinHTML = '<p class="pe-quiet">The ' + esc(year) + ' season has finished. Ask the golf shop about next season.</p>';
    }
    const facts = [(lg.members || []).length + ' members', pluralWk(sd.played.length) + ' played'];
    if (mine && mine.rounds) facts.push('Your position: ' + mine.pos);

    const LG_TOP = 10;
    function standingsHTML(full) {
      if (!(rows.length && sd.played.length)) return '<p class="pe-lb-empty">' + (rows.length ? 'Standings will appear after the first league night.' : 'The roster is being prepared.') + '</p>';
      const meIdx = rows.findIndex(function (r) { return r.memberId === me.id; });
      const show = full ? rows : rows.slice(0, LG_TOP); if (!full && meIdx >= LG_TOP) show.push(rows[meIdx]);
      return '<div class="pe-lbt-wrap"><table class="pe-lbt pl-table"><colgroup><col class="pe-w-pos"><col><col class="pe-w-num"><col class="pe-w-num"></colgroup><thead><tr><th scope="col" class="pe-c-pos"><abbr title="Position">#</abbr></th><th scope="col">Player</th><th scope="col" class="pe-c-num">Points</th><th scope="col" class="pe-c-num">Move</th></tr></thead><tbody>' + show.map(function (r) {
        const isMe = r.memberId === me.id;
        return '<tr class="' + (r.rounds ? '' : 'waiting') + (isMe ? ' me' : '') + (isMe && !full && meIdx >= LG_TOP ? ' pe-gap' : '') + '"' + (isMe ? ' id="pl-me"' : '') + '>' +
          '<td class="pe-c-pos">' + (r.rounds ? esc(r.pos) : '<span aria-hidden="true">–</span>') + '</td><th scope="row" class="pe-c-name">' + esc(r.name) + (isMe ? ' <span class="pe-you">You</span>' : '') + '<span class="pe-lb-wait">' + (r.rounds ? r.rounds + (r.rounds === 1 ? ' round' : ' rounds') : 'No rounds yet') + '</span></th>' +
          '<td class="pe-c-num pe-score">' + r.total + '<span class="pe-stack-l"> points</span></td><td class="pe-c-num pe-c-move">' + moveHTML(r.move) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
        (rows.length > LG_TOP ? '<div class="pe-lb-more-row"><button type="button" class="p-link pl-st-more" data-full="' + (full ? '0' : '1') + '" aria-expanded="' + !!full + '">' + (full ? 'Top ' + LG_TOP + ' only' : 'Full standings (' + rows.length + ')') + '</button></div>' : '');
    }
    view.innerHTML = head(member, 'league') +
      '<section class="pl-head"><h2>' + esc(lg.name) + '</h2>' +
      '<p class="pl-meta">' + esc(lg.night + 's from ' + F.time(lg.startTime) + ' · ' + (+lg.holes === 18 ? '18 holes' : '9 holes') + ', ' + lg.format + ' · ' + F.dateShort(lg.season.start) + '–' + F.dateShort(lg.season.end)) + '</p>' +
      '<p class="pl-facts">' + esc(facts.join(' · ')) + '</p></section>' +
      '<div class="pl-grid"><div class="pl-top">' + joinHTML + nextPanel(lg, nextW, st, rows) + '</div>' +
      '<section class="pe-lb pl-board" aria-labelledby="pl-st-h"><header class="pe-lb-top"><div class="pe-lb-head">' + (st === 'complete' ? '<span class="pe-final">Season complete</span>' : '<span class="pe-live pe-static"><span class="pe-live-dot" aria-hidden="true"></span>In season</span>') +
      '<h3 class="pe-lb-title" id="pl-st-h">Standings</h3><p class="pe-lb-sub">' + esc((st === 'complete' ? 'Final standings' : lastW ? 'After week ' + (sd.upto + 1) + ', ' + F.dateShort(lastW.date) : 'Before the first league night') + ' · ' + (stroke ? 'Points by net finish each night' : 'Stableford points, ' + lg.allowance + '% allowance')) + '</p></div></header>' +
      '<div class="pl-st-host">' + standingsHTML(false) + '</div>' +
      '<p class="pe-lb-foot">Move is the change since the last league night.</p></section>' +
      '<div class="pl-more">' + (onRoster ? myPanel(lg, me.id, mine) : '') + winnersPanel(lg, sd) + '</div></div>';
    U.on(view, 'click', '.pl-st-more', function (e, b) { U.$('.pl-st-host', view).innerHTML = standingsHTML(b.dataset.full === '1'); const nb = U.$('.pl-st-more', view); if (nb) nb.focus(); });

    U.on(view, 'click', '[data-action=join]', function () {
      U.confirm({ title: 'Join the league?', text: 'You will be added to the ' + lg.name + ' for the ' + year + ' season. It’s free, and you play the nights that suit you.', confirmLabel: 'Join the league' }).then(function (ok) {
        if (!ok) return;
        const fresh = S.find('leagues', lg.id); const m = Portal.member();
        if (!fresh || !m) { U.toast('The league could not be found. Please refresh.', 'bad'); return; }
        if (!canGolf(m)) { U.toast('The league is for golfing members.', 'bad'); return; }
        if (L.status(fresh) === 'complete') { U.toast('This season has finished.', 'bad'); Portal.render(); return; }
        if ((fresh.members || []).indexOf(m.id) < 0) S.update('leagues', fresh.id, { members: (fresh.members || []).concat([m.id]) });
        U.toast('You’ve joined the league. See you on ' + fresh.night);
        Portal.render();
      });
    });
    U.on(view, 'click', '.pl-weeks-more', function (e, b) {
      const list = U.$('.pl-weeks', view); const open = list.classList.toggle('all');
      U.$('span', b).textContent = open ? 'Show recent weeks only' : 'Show all ' + b.dataset.n + ' weeks';
      b.setAttribute('aria-expanded', open); U.$('svg', b).classList.toggle('pe-flip', open);
    });
  }
  function nextPanel(lg, w, st, rows) {
    const L = Club.league;
    if (st === 'complete') {
      const champ = rows.filter(function (r) { return r.rank === 1 && r.rounds; });
      if (!champ.length) return '';
      return '<p class="pl-champ-line">' + Club.icon('trophy') + '<span><span class="pl-champ-l">' + esc(lg.season.start.slice(0, 4)) + ' champion' + (champ.length > 1 ? 's' : '') + ':</span> ' + esc(champ.map(function (r) { return r.name; }).join(' and ')) + ' · ' + champ[0].total + ' points</span></p>';
    }
    if (!w) return '<section class="panel pl-card"><h3>Next league night</h3><p class="pl-muted">No more league nights are scheduled.</p></section>';
    const b = L.weekBlock(w);
    return '<section class="panel pl-card"><h3>Next league night</h3><div class="pl-next-row">' + dateBlock(w.date) +
      '<div><p class="pl-next-t">Week ' + (lg.weeks.indexOf(w) + 1) + ' · ' + esc(L.nineLabel(w.nine)) + '</p><p class="pl-muted">' + esc(F.relative(w.date) + ' · first tee ' + F.time(lg.startTime)) + '</p>' +
      (b ? '<p class="pl-note">' + Club.icon('flag') + '<span>Tee times are kept for league play from ' + esc(F.time(b.start)) + '.</span></p>' : '') + '</div></div></section>';
  }
  function myPanel(lg, memberId, mine) {
    const L = Club.league; const stroke = lg.format === 'Stroke play';
    const weeks = (lg.weeks || []).filter(function (w) { return w.date <= today() || L.isPlayed(w); });
    const SHOW = 5;
    return Portal.accordion({ id: 'pl-mine', icon: 'user', title: 'Your season', summary: mine && mine.rounds ? mine.total + ' points · ' + pluralWk(mine.rounds) + ' · best ' + mine.best : 'No rounds yet', body:
      (weeks.length ? '<ul class="pl-weeks">' + weeks.slice().reverse().map(function (w, k) {
        const i = lg.weeks.indexOf(w);
        const rk = L.isPlayed(w) ? L.weekRank(w, lg).find(function (r) { return r.memberId === memberId; }) : null;
        let right;
        if (w.cancelled) right = '<span class="pl-muted">' + esc(w.note || 'Cancelled') + '</span>';
        else if (!L.isPlayed(w)) right = '<span class="pl-muted">Results to come</span>';
        else if (!rk) right = '<span class="pl-muted">' + ((w.absent || []).indexOf(memberId) >= 0 ? 'Absent' : 'Did not play') + '</span>';
        else right = '<span class="pl-wk-score"><b>' + rk.points + ' points</b><span>Gross ' + rk.gross + (stroke ? ' · net ' + rk.net : '') + '</span></span>';
        return '<li class="' + (rk ? '' : 'off') + (k >= SHOW ? ' extra' : '') + '"><span class="pl-wk-main"><span class="pl-wk-t">Week ' + (i + 1) + ' · ' + esc(F.dateShort(w.date)) + '</span><span class="pl-muted">' + esc(L.nineLabel(w.nine)) + (rk ? ' · ' + (rk.tied ? 'tied ' : '') + ordinal(rk.place) + ' of ' + w.results.length : '') + '</span></span>' + right + '</li>';
      }).join('') + '</ul>' + (weeks.length > SHOW ? '<button type="button" class="btn pl-weeks-more" data-n="' + weeks.length + '" aria-expanded="false">' + Club.icon('chevronDown') + '<span>Show all ' + weeks.length + ' weeks</span></button>' : '') : '<p class="pl-muted">Your weekly results will appear here after your first league night.</p>') });
  }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function winnersPanel(lg, sd) {
    const L = Club.league; const stroke = lg.format === 'Stroke play';
    const list = sd.played.slice().reverse().slice(0, 6);
    if (!list.length) return '';
    const last = L.weekWinners(lg.weeks[list[0]], lg);
    return Portal.accordion({ id: 'pl-win', icon: 'trophy', title: 'Recent winners', summary: 'Week ' + (list[0] + 1) + ': ' + last.map(function (r) { return memberName(r.memberId); }).join(', '), body: '<ul class="pl-weeks pl-winners all">' + list.map(function (i) {
      const w = lg.weeks[i]; const ws = L.weekWinners(w, lg);
      return '<li><span class="pl-wk-main"><span class="pl-wk-t">' + esc(ws.map(function (r) { return memberName(r.memberId); }).join(', ')) + '</span><span class="pl-muted">Week ' + (i + 1) + ' · ' + esc(F.dateShort(w.date)) + '</span></span><span class="pl-wk-score"><b>' + (stroke ? 'Net ' + ws[0].net : ws[0].points + ' points') + '</b></span></li>';
    }).join('') + '</ul>' });
  }

  Portal.register({
    id: 'events', label: 'Events', icon: 'events', order: 30, tab: true,
    render: function (view, params, member) {
      if (params[0] === 'league') renderLeague(view, member); else if (params[0] === 'leaderboard') renderBoards(view, member); else if (params[0]) renderEvent(view, params[0], member); else renderIndex(view, member);
    }
  });
})();
