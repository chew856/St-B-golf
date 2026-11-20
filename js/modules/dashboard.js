/* Dashboard: the clubhouse front door. Today at a glance, live. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc;

  /* ---------------- Safe data helpers ---------------- */
  function all(c) { try { const a = S.all(c); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (e) { return []; } }
  function num(v) { return +v || 0; }
  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + num(fn(x)); }, 0); }
  /** Chart heights follow the root font size, so charts grow with the interface on large displays. */
  function px(n) { let f = 16; try { f = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch (e) { /* default */ } return Math.round(n * f / 16); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nowHM() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function sentence(parts) {
    if (!parts.length) return '';
    const s = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
  const DEAD = { cancelled: 1, 'no-show': 1 };

  function playerCount(t) { return Array.isArray(t.players) ? t.players.length : 0; }
  function playerName(p) {
    if (!p) return 'Guest';
    if (p.memberId) { const m = Club.members.get(p.memberId); if (m) return m.firstName + ' ' + m.lastName; }
    return p.name || (p.type === 'guest' ? 'Guest' : 'Member');
  }
  function teeFor(date) { return all('teeTimes').filter(function (t) { return t.date === date && !DEAD[t.status]; }); }
  function byTime(a, b) { return toMin(a.time) - toMin(b.time); }

  /** Most common gap between consecutive tee times, in minutes (default 10). */
  function inferInterval() {
    const byDate = {};
    all('teeTimes').forEach(function (t) { if (t.date && t.time) (byDate[t.date] = byDate[t.date] || {})[t.time] = 1; });
    const counts = {};
    Object.keys(byDate).forEach(function (d) {
      const ts = Object.keys(byDate[d]).map(toMin).sort(function (a, b) { return a - b; });
      for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g >= 6 && g <= 20) counts[g] = (counts[g] || 0) + 1; }
    });
    let best = 10, bc = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bc) { bc = counts[k]; best = +k; } });
    return best;
  }

  /* Revenue for one day, itemised. Shop sales and closed dining checks count directly; house charges count
     unless they mirror one of those (on-account shop and dining sales also post to the ledger). */
  const DEPT = { shop: 'Pro shop', dining: 'Dining', golf: 'Golf fees', events: 'Events', lessons: 'Lessons', dues: 'Dues', other: 'Other' };
  const CAT_DEPT = { 'Pro Shop': 'shop', Dining: 'dining', Golf: 'golf', Events: 'events', Lessons: 'lessons', Dues: 'dues' };
  function localHM(stamp, date) {
    if (!stamp) return '';
    const d = new Date(stamp); if (isNaN(d)) return '';
    return S.iso(d) === date ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
  }
  function revenueOn(date) {
    const sales = all('sales').filter(function (s) { return s.date === date; });
    const orders = all('diningOrders').filter(function (o) { return o.date === date && o.status === 'closed'; });
    const refs = {};
    sales.forEach(function (s) { refs[s.id] = 1; });
    orders.forEach(function (o) { refs[o.id] = 1; });
    const hasShop = all('sales').length > 0, hasDining = all('diningOrders').length > 0;
    const charges = all('charges').filter(function (c) {
      if (c.date !== date || (c.refId && refs[c.refId])) return false;
      if (c.category === 'F&B assessment') return false;   /* the $375 assessment and its credit lines are pre-payment, not takings: the food counts when bought */
      const src = String(c.source || '').toLowerCase();
      if (hasShop && (src === 'proshop' || src === 'pro shop' || src === 'pos')) return false;
      if (hasDining && src === 'dining') return false;
      return true;
    });
    const tx = [];
    sales.forEach(function (s) {
      tx.push({ time: s.time || '', dept: 'shop', amount: num(s.subtotal != null ? s.subtotal : s.total), tender: s.payment || 'Card',
        desc: 'Pro shop sale' + (s.number ? ' No. ' + s.number : ''), who: s.memberId ? Club.members.name(s.memberId) : 'Walk-in' });
    });
    orders.forEach(function (o) {
      tx.push({ time: localHM(o.closedAt, date) || o.time || '', dept: 'dining', amount: num(o.total), tender: o.payment || 'Member account',
        desc: (o.venue || 'Dining') + ' check' + (o.number ? ' No. ' + o.number : ''), who: o.name || (o.memberId ? Club.members.name(o.memberId) : 'Guest') });
    });
    charges.forEach(function (c) {
      tx.push({ time: localHM(c.createdAt, date), dept: CAT_DEPT[c.category] || 'other', amount: num(c.amount), tender: 'House account',
        desc: c.description || c.category || 'House charge', who: c.memberId ? Club.members.name(c.memberId) : '' });
    });
    /* Money taken outside the member ledger: public green fees paid online, golf shop payments at the tee sheet,
       takeout and beverage cart orders paid by card or cash (same rule as Reports). */
    const RC_DEPT = { teesheet: 'golf', public: 'golf', takeout: 'dining', cart: 'dining' };
    const payIds = {}; all('payments').forEach(function (p) { payIds[p.id] = 1; });
    all('receipts').forEach(function (r) {
      if (r.date !== date || !RC_DEPT[r.source] || r.chargeId || payIds[r.paymentId] || r.title === 'Account payment') return;
      if (Array.isArray(r.tenders) && r.tenders.length && r.tenders.every(function (t) { return t.method === 'account'; })) return;
      tx.push({ time: localHM(r.at, date), dept: RC_DEPT[r.source], amount: (r.kind === 'credit' ? -1 : 1) * num(r.total), tender: r.methodLabel || 'Card',
        desc: r.title || 'Payment', who: r.name || (r.memberId ? Club.members.name(r.memberId) : '') });
    });
    const byDept = {}; Object.keys(DEPT).forEach(function (k) { byDept[k] = 0; });
    tx.forEach(function (t) { byDept[t.dept] += t.amount; });
    return { date: date, tx: tx, byDept: byDept, total: sum(tx, function (t) { return t.amount; }) };
  }

  function metrics() {
    const today = D.today();
    const tees = teeFor(today);
    const players = sum(tees, playerCount);
    const out = tees.filter(function (t) { return t.status === 'on-course'; });
    const res = all('diningReservations').filter(function (r) { return r.date === today && !DEAD[r.status]; });
    const covers = sum(res, function (r) { return r.partySize; });
    const rev = revenueOn(today);
    const wos = all('workOrders').filter(function (w) { return w.status !== 'done'; });
    return {
      today: today, tees: tees, players: players, groups: tees.length,
      onCourse: sum(out, playerCount), groupsOut: out.length,
      res: res, covers: covers,
      revenue: Math.round(rev.total), rev: rev,
      openWO: wos.length, urgentWO: wos.filter(function (w) { return w.priority === 'urgent'; }).length
    };
  }

  /* ---------------- Header ---------------- */
  function eventsOn(date) {
    return all('events').filter(function (e) { return e.date === date && e.status !== 'cancelled' && e.status !== 'draft'; })
      .sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
  }
  function summaryLine() {
    const m = metrics();
    const parts = [];
    if (m.players) parts.push(F.num(m.players) + ' ' + plural(m.players, 'player') + ' on the tee sheet');
    eventsOn(m.today).slice(0, 2).forEach(function (e) {
      const evening = toMin(e.start) >= 17 * 60;
      parts.push(e.title + (evening ? ' tonight' : (e.start ? ' at ' + F.time(e.start) : ' today')));
    });
    if (m.covers) parts.push(F.num(m.covers) + ' ' + plural(m.covers, 'guest') + ' booked for dining');
    return parts.length ? sentence(parts) : 'A quiet day at the club. The tee sheet and the Gallery Taphouse & Grill are open for bookings.';
  }

  /* ---------------- Stat strip ---------------- */
  function statsHTML() {
    const m = metrics();
    return drillable(U.stats([
      { label: 'Players today', value: m.players, meta: esc(m.groups + ' ' + plural(m.groups, 'group') + ' on the sheet') },
      { label: 'On course now', value: m.onCourse, meta: (m.groupsOut ? '<span class="live-dot" aria-hidden="true"></span> ' : '') + esc(m.groupsOut ? m.groupsOut + ' ' + plural(m.groupsOut, 'group') + ' out' : 'No groups out') },
      { label: 'Dining room', value: m.covers, meta: esc(m.res.length + ' ' + plural(m.res.length, 'reservation')) },
      { label: 'Revenue today', value: m.revenue, prefix: '$', meta: esc('Shop, dining and house') },
      { label: 'Open work orders', value: m.openWO, meta: m.urgentWO ? '<span class="dash-urgent">' + esc(m.urgentWO + ' urgent') + '</span>' : esc('None urgent') }
    ]), ['players', 'oncourse', 'covers', 'revenue', 'workorders']);
  }
  /** Turn stat tiles into keyboard-accessible buttons that open a drill-down drawer. */
  function drillable(html, keys) {
    const wrap = U.el(html);
    U.$$('.stat', wrap).forEach(function (st, i) {
      if (!keys[i]) return;
      st.classList.add('dash-drill');
      st.setAttribute('role', 'button');
      st.setAttribute('tabindex', '0');
      st.setAttribute('aria-haspopup', 'dialog');
      st.dataset.drill = keys[i];
      st.insertAdjacentHTML('beforeend', '<span class="dash-drill-cue">View details' + Club.icon('chevronRight') + '</span>');
    });
    return wrap.outerHTML;
  }

  /* ---------------- Panels ---------------- */
  function head(title, eyebrow, linkHref, linkLabel) {
    return '<div class="panel-head"><div>' + (eyebrow ? '<div class="eyebrow">' + esc(eyebrow) + '</div>' : '') + '<h3>' + esc(title) + '</h3></div>' +
      (linkHref ? '<a class="s-link dash-link" href="#/' + esc(linkHref) + '">' + esc(linkLabel || 'View all') + '</a>' : '') + '</div>';
  }

  function statusBadge(s) {
    if (s === 'checked-in') return U.badge('Checked in', 'good');
    if (s === 'on-course') return U.badge('On course', 'info');
    if (s === 'completed') return U.badge('Finished', 'plain');
    return U.badge('Booked', 'outline');
  }

  /* The tee panel sits beside the taller course conditions panel; the chart grows to fill the space the row gives it
     (owner, Nov 20: "so much blank space"), between 130px and 360px. Set by fitTeeChart() in render(). */
  let teeChartH = 0;
  function teePanel() {
    const today = D.today();
    const now = nowHM();
    const tees = teeFor(today).sort(byTime);
    let upcoming = tees.filter(function (t) { return (t.status === 'booked' || t.status === 'checked-in') && t.time >= now; });
    let label = 'Next groups up', date = today;
    if (!upcoming.length) {
      const tom = D.addDays(today, 1);
      upcoming = teeFor(tom).sort(byTime);
      label = 'First off tomorrow'; date = tom;
    }
    upcoming = upcoming.slice(0, 5);

    let list;
    if (!upcoming.length) {
      list = U.empty({ icon: 'teesheet', title: 'No groups waiting', text: 'There are no more tee times on the sheet for today or tomorrow morning.', action: U.btn('Book tee time', { kind: 'primary', icon: 'plus', action: 'go', id: 'teesheet/' + today }) });
    } else {
      list = '<div class="dash-groups">' + upcoming.map(function (t) {
        const ps = Array.isArray(t.players) ? t.players : [];
        const guests = ps.filter(function (p) { return p && p.type === 'guest'; }).length;
        const carts = ps.filter(function (p) { return p && p.cart; }).length;
        const mins = date === today ? toMin(t.time) - toMin(now) : null;
        const when = mins == null ? F.weekday(date) : (mins <= 0 ? 'Now' : mins < 60 ? 'In ' + mins + ' min' : 'In ' + Math.floor(mins / 60) + ' h ' + pad(mins % 60) + ' min');
        return '<a class="dash-group" href="#/teesheet/' + esc(date) + '">' +
          '<div class="dash-group-time"><span class="dash-group-clock">' + esc(F.time(t.time)) + '</span><span class="dash-when">' + esc(when) + '</span></div>' +
          '<div class="dash-group-main"><div class="dash-group-names">' + (ps.length ? ps.map(function (p) { return esc(playerName(p)); }).join('<i aria-hidden="true">·</i>') : '<span class="muted">Open slot</span>') + '</div>' +
          '<div class="dash-group-meta">' + esc((t.holes || 18) + ' holes · ' + ps.length + ' ' + plural(ps.length, 'player') + (guests ? ' · ' + guests + ' ' + plural(guests, 'guest') : '') + (carts ? ' · ' + carts + ' ' + plural(carts, 'cart') : ' · Walking')) + '</div></div>' +
          '<div class="dash-group-status">' + statusBadge(t.status) + '</div></a>';
      }).join('') + '</div>';
    }

    // Utilization by hour (today)
    const interval = inferInterval();
    const cap = Math.floor(60 / interval) * 4;
    const allT = all('teeTimes');
    let minH = 24, maxH = 0;
    allT.forEach(function (t) { if (t.time) { const h = Math.floor(toMin(t.time) / 60); if (h < minH) minH = h; if (h > maxH) maxH = h; } });
    if (minH > maxH) { minH = 7; maxH = 17; }
    minH = Math.max(5, minH); maxH = Math.min(19, Math.max(maxH, minH + 1));
    const labels = [], values = [];
    let booked = 0;
    for (let h = minH; h <= maxH; h++) {
      const p = sum(tees.filter(function (t) { return Math.floor(toMin(t.time) / 60) === h; }), playerCount);
      booked += p;
      labels.push((h % 12 || 12) + (h < 12 ? 'a' : 'p'));
      values.push(Math.min(100, Math.round(p / cap * 100)));
    }
    const totalCap = cap * labels.length;
    const peak = values.reduce(function (b, v, i) { return v > values[b] ? i : b; }, 0);
    let chart;
    if (!booked) {
      chart = '<p class="muted dash-note">No players booked today, so utilization will appear once the sheet fills.</p>';
    } else {
      chart = '<div class="dash-util-head"><span class="label-caps">Utilization by hour</span><span class="dash-util-sum">' +
        '<strong>' + Math.round(booked / totalCap * 100) + '%</strong> of capacity · peak ' + esc(labels[peak].replace('a', ' AM').replace('p', ' PM')) + ' at ' + values[peak] + '%</span></div>' +
        Club.charts.bar({ labels: labels, series: [{ name: 'Utilization %', values: values }], height: teeChartH || px(130) });
    }

    return head('Today on the tee', label, 'teesheet/' + today, 'Open tee sheet') +
      '<div class="panel-body dash-tee">' + list + '<div class="dash-util">' + chart + '</div></div>';
  }

  function coursePanel() {
    const cs = S.getObj('courseStatus', null);
    const c = Object.assign({ open: true, cartRule: 'Normal', greenSpeed: null, firmness: null, pins: null, message: '', holes: [] }, cs || {});
    const w = Club.weather || {};
    const t = w.today || {};
    const holes = Array.isArray(c.holes) ? c.holes : [];
    const closed = holes.filter(function (h) { return h && h.status === 'closed'; }).length;
    const gur = holes.filter(function (h) { return h && h.status === 'GUR'; }).length;
    const speed = c.greenSpeed == null || c.greenSpeed === '' ? 'Not posted' : (isNaN(+c.greenSpeed) ? String(c.greenSpeed) : (+c.greenSpeed).toFixed(1) + ' ft');
    const kv = [
      ['Cart rule', c.cartRule || 'Normal'],
      ['Green speed', speed],
      ['Firmness', c.firmness || 'Not posted'],
      ['Pin sheet', c.pins ? c.pins + ' positions' : 'Not posted']
    ];
    const forecast = (w.forecast || []).slice(0, 7);
    const holesLine = [closed ? closed + ' ' + plural(closed, 'hole') + ' closed' : '', gur ? gur + ' ' + plural(gur, 'hole') + ' with ground under repair' : ''].filter(Boolean).join(', ');
    const note = c.message ? '<div class="dash-crew">' + Portal.accordion({ id: 'dash-crew', icon: 'leaf', title: 'Note from the grounds crew', summary: c.message.length > 64 ? c.message.slice(0, 62).replace(/\s+\S*$/, '') + '…' : c.message, body: '<p>' + esc(c.message) + '</p>' }) + '</div>'
      : (!cs ? '<p class="dash-msg-empty">The superintendent has not posted today\'s report yet.</p>' : '');
    return '<div class="panel-head"><div><div class="eyebrow">Course conditions</div><h3>' + esc(c.open ? 'The course is open' : 'The course is closed') + '</h3></div>' +
      '<span class="dash-open ' + (c.open ? 'is-open' : 'is-closed') + '">' + (c.open ? '<span class="live-dot" aria-hidden="true"></span>' : '') + esc(c.open ? 'Open' : 'Closed') + '</span></div>' +
      '<div class="panel-body dash-course">' +
      '<div class="dash-wx">' + Club.icon(t.icon || 'sun', 'dash-wx-icon') +
      '<div class="dash-wx-now"><span class="dash-wx-temp">' + esc(w.nowTemp != null ? w.nowTemp : '') + '°</span><span class="dash-wx-cond">' + esc(t.cond || '') + '</span></div>' +
      '<div class="dash-wx-meta">High ' + esc(t.hi) + '° · Low ' + esc(t.lo) + '°<br>Wind ' + esc(t.wind) + ' km/h · Rain ' + esc(t.rain) + '%</div></div>' +
      '<dl class="dash-cond">' + kv.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      (holesLine ? '<p class="dash-holes">' + Club.icon('flag') + esc(holesLine) + '</p>' : '') +
      note +
      (forecast.length ? '<div class="dash-forecast" role="list" aria-label="Seven day forecast">' + forecast.map(function (d, i) {
        return '<div class="dash-day" role="listitem" data-tip="' + esc(d.cond + ', rain ' + d.rain + '%') + '"><span class="dash-day-n">' + esc(i === 0 ? 'Today' : F.weekday(d.date)) + '</span>' + Club.icon(d.icon) + '<span class="dash-day-t"><strong>' + esc(d.hi) + '°</strong> <span class="dash-day-lo">' + esc(d.lo) + '°</span></span></div>';
      }).join('') + '</div>' : '') +
      '<a class="s-link dash-course-link" href="#/course">Course and grounds</a>' +
      '</div>';
  }

  function eventsPanel() {
    const today = D.today(), end = D.addDays(today, 14);
    const evs = all('events').filter(function (e) { return e.date >= today && e.date <= end && e.status !== 'cancelled' && e.status !== 'draft'; })
      .sort(function (a, b) { return (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')); });
    let body;
    if (!evs.length) body = U.empty({ icon: 'events', title: 'A quiet fortnight', text: 'No events are on the calendar for the next 14 days.' });
    else body = '<ul class="list dash-events">' + evs.slice(0, 3).map(function (e) {
      const regs = Array.isArray(e.registrations) ? e.registrations : [];
      const taken = sum(regs, function (r) { return 1 + num(r && r.guests); });
      const cap = num(e.capacity);
      const pct = cap ? Math.min(100, Math.round(taken / cap * 100)) : 0;
      const d = F.toDate(e.date);
      return '<li><a href="#/events/' + esc(e.id) + '" class="dash-event">' +
        '<div class="dash-date-chip"><span class="dash-date-day">' + d.getDate() + '</span><span class="dash-date-mon">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></div>' +
        '<div class="dash-event-main"><div class="dash-event-title">' + esc(e.title) + '</div>' +
        '<div class="dash-event-meta">' + esc(F.relative(e.date) + (e.start ? ' · ' + F.time(e.start) : '') + (e.venue ? ' · ' + e.venue : '')) + '</div>' +
        (cap ? '<div class="dash-cap"><div class="bar' + (pct >= 90 ? ' brass' : '') + '"><span style="width:' + pct + '%"></span></div><span class="num">' + taken + ' / ' + cap + '</span></div>' : '') +
        '</div></a></li>';
    }).join('') + '</ul>' + (evs.length > 3 ? '<div class="dash-more-row"><a class="s-link" href="#/events">View all ' + evs.length + ' events</a></div>' : '');
    return head('Upcoming events', 'Next 14 days', 'events', 'Calendar') + '<div class="panel-body flush">' + body + '</div>';
  }

  const VENUES = ['Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio', 'Banquet Hall'];
  function diningPanel() {
    const today = D.today();
    const res = all('diningReservations').filter(function (r) { return r.date === today && !DEAD[r.status]; });
    let tonight = res.filter(function (r) { return toMin(r.time) >= 16 * 60; });
    const isTonight = tonight.length > 0;
    if (!isTonight) tonight = res;
    let body;
    if (!tonight.length) {
      body = U.empty({ icon: 'dining', title: 'No reservations yet', text: 'The dining rooms have no bookings for today.', action: U.btn('New reservation', { icon: 'plus', action: 'go', id: 'dining' }) });
    } else {
      const venues = VENUES.slice();
      tonight.forEach(function (r) { if (r.venue && venues.indexOf(r.venue) < 0) venues.push(r.venue); });
      const rows = venues.map(function (v) {
        const rs = tonight.filter(function (r) { return r.venue === v; });
        return { venue: v, parties: rs.length, covers: sum(rs, function (r) { return r.partySize; }) };
      });
      const maxC = Math.max.apply(null, rows.map(function (r) { return r.covers; }).concat([1]));
      const now = nowHM();
      const next = tonight.filter(function (r) { return r.status === 'confirmed' && r.time >= now; }).sort(byTime).slice(0, 3);
      body = '<div class="dash-venues">' + rows.map(function (r) {
        return '<div class="dash-venue' + (r.parties ? '' : ' is-empty') + '"><div class="row between"><span class="dash-venue-name">' + esc(r.venue) + '</span><span class="num"><strong>' + r.covers + '</strong> <span class="muted">' + plural(r.covers, 'guest') + ' · ' + r.parties + ' ' + plural(r.parties, 'party', 'parties') + '</span></span></div>' +
          '<div class="bar"><span style="width:' + Math.round(r.covers / maxC * 100) + '%"></span></div></div>';
      }).join('') + '</div>' +
        (next.length ? '<div class="dash-arrivals"><div class="dash-arrivals-head">Next arrivals</div>' + next.map(function (r) {
          const nm = r.memberId ? Club.members.name(r.memberId) : (r.name || 'Guest');
          return '<div class="dash-arrival"><span class="dash-arrival-time">' + esc(F.time(r.time)) + '</span><span class="dash-arrival-name">' + esc(r.name || nm) + '</span><span class="muted">' + esc(num(r.partySize) + ' guests') + '</span>' + (r.occasion ? U.badge(r.occasion) : '') + '</div>';
        }).join('') + '</div>' : '');
    }
    return head(isTonight ? 'Dining tonight' : 'Dining today', 'Reservations by venue', 'dining', 'Open dining') + '<div class="panel-body">' + body + '</div>';
  }

  function findApplications() {
    let n = 0, sample = '';
    ['membershipApplications', 'applications', 'memberApplications'].forEach(function (c) {
      all(c).forEach(function (a) {
        const st = String(a.status || a.stage || 'pending').toLowerCase();
        if (!a.memberId && !/approv|declin|reject|withdr|elect|admit|accept|closed|archiv|waiting list/.test(st)) { n++; if (!sample) sample = a.name || ((a.firstName || '') + ' ' + (a.lastName || '')).trim(); }
      });
    });
    all('members').forEach(function (m) { if (m.status === 'applicant' || m.status === 'pending') { n++; if (!sample) sample = m.firstName + ' ' + m.lastName; } });
    return { n: n, sample: sample };
  }

  function attentionItems() {
    const items = [];
    const low = all('products').filter(function (p) { return p.reorderAt != null && num(p.stock) <= num(p.reorderAt); })
      .sort(function (a, b) { return num(a.stock) - num(b.stock); });
    if (low.length) items.push({ icon: 'box', kind: 'warn', n: low.length, title: 'Low stock in the pro shop', sub: low.slice(0, 2).map(function (p) { return p.name + ' (' + num(p.stock) + ' left)'; }).join(', '), href: 'proshop' });

    const overdueSt = all('statements').filter(function (s) { return s.status === 'overdue'; });
    const big = all('members').filter(function (m) { return m.status !== 'resigned' && num(m.balance) >= 2500; }).sort(function (a, b) { return num(b.balance) - num(a.balance); });
    const ids = {};
    overdueSt.forEach(function (s) { if (s.memberId) ids[s.memberId] = 1; });
    big.forEach(function (m) { ids[m.id] = 1; });
    const nAcc = Object.keys(ids).length;
    if (nAcc) {
      const top = big[0];
      items.push({ icon: 'billing', kind: 'bad', n: nAcc, title: 'Accounts needing follow-up', sub: (overdueSt.length ? overdueSt.length + ' overdue ' + plural(overdueSt.length, 'statement') : 'Large balances') + (top ? ', largest ' + Club.members.name(top) + ' at ' + F.money0(top.balance) : ''), href: top && !overdueSt.length ? 'billing/' + top.id : 'billing' });
    }

    const urgent = all('workOrders').filter(function (w) { return w.status !== 'done' && w.priority === 'urgent'; });
    if (urgent.length) items.push({ icon: 'maintenance', kind: 'bad', n: urgent.length, title: 'Urgent work ' + plural(urgent.length, 'order'), sub: urgent.slice(0, 2).map(function (w) { return w.title; }).join(', '), href: 'course' });

    const apps = findApplications();
    if (apps.n) items.push({ icon: 'members', kind: 'info', n: apps.n, title: 'Membership ' + plural(apps.n, 'application') + ' pending', sub: apps.sample ? 'Including ' + apps.sample : 'Awaiting review', href: 'members' });

    /* Messages members reported from the portal (Friends). Staff see only the reported message. */
    all('messageReports').filter(function (r) { return r.status === 'open'; }).forEach(function (r) {
      items.push({ icon: 'mail', kind: 'warn', n: 1, title: 'Reported message from ' + Club.members.name(r.reportedId), sub: (r.reason || 'Reported') + ', by ' + Club.members.name(r.reporterId), report: r.id });
    });
    return items;
  }

  function attentionPanel() {
    const items = attentionItems();
    let body;
    if (!items.length) body = U.empty({ icon: 'check', title: 'All in order', text: 'Nothing needs attention right now. Stock, accounts and applications are up to date.' });
    else body = '<ul class="list dash-attn">' + items.map(function (it) {
      if (it.report) return '<li><button type="button" class="dash-attn-row" data-report="' + esc(it.report) + '" style="width:100%;background:none;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer"><span class="dash-attn-icon ' + it.kind + '">' + Club.icon(it.icon) + '</span>' +
        '<span class="dash-attn-main"><span class="dash-attn-title">' + esc(it.title) + '</span><span class="dash-attn-sub">' + esc(it.sub) + '</span></span><span class="dash-attn-n">' + it.n + '</span></button></li>';
      return '<li><a href="#/' + esc(it.href) + '" class="dash-attn-row"><span class="dash-attn-icon ' + it.kind + '">' + Club.icon(it.icon) + '</span>' +
        '<span class="dash-attn-main"><span class="dash-attn-title">' + esc(it.title) + '</span><span class="dash-attn-sub">' + esc(it.sub) + '</span></span>' +
        '<span class="dash-attn-n">' + it.n + '</span></a></li>';
    }).join('') + '</ul>';
    return head('For your attention', items.length ? items.length + ' ' + plural(items.length, 'item') : 'Up to date') + '<div class="panel-body flush">' + body + '</div>';
  }

  /** A reported member message: the message itself only, then Dismiss or Contact member (opens their record). */
  function openReport(id) {
    const r = S.find('messageReports', id); if (!r) return;
    const when = r.at ? F.date(r.at.slice(0, 10)) + ' at ' + F.time(new Date(r.at)) : '';
    U.modal({ title: 'Reported message', eyebrow: 'From ' + Club.members.name(r.reportedId),
      body: '<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid var(--rule-strong);background:var(--hover)">' + esc(r.body || '') + '</blockquote>' +
        '<dl class="kv"><dt>Reported by</dt><dd>' + esc(Club.members.name(r.reporterId)) + '</dd><dt>Reason</dt><dd>' + esc(r.reason || '') + '</dd>' + (r.note ? '<dt>Note</dt><dd>' + esc(r.note) + '</dd>' : '') + (when ? '<dt>Reported</dt><dd>' + esc(when) + '</dd>' : '') + '</dl>' +
        '<p class="muted" style="margin-top:12px">Only this message was shared with staff. The rest of the conversation stays private.</p>',
      actions: [
        /* Undo (js/core/undo.js) reopens the report; the attention panel redraws from its store subscription */
        { label: 'Dismiss', kind: 'ghost', onClick: function () { Club.undo.run(function () { S.update('messageReports', id, { status: 'dismissed', handledAt: new Date().toISOString() }); }, { message: 'Report dismissed', undone: 'Report reopened' }); } },
        { label: 'Contact member', kind: 'primary', onClick: function () {
          Club.undo.run(function () { S.update('messageReports', id, { status: 'contacted', handledAt: new Date().toISOString() }); }, { message: 'Report marked as contacted', undone: 'Report reopened' });
          Club.app.go('members/' + r.reportedId);
        } }
      ] });
  }

  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function celebrationsPanel() {
    const today = D.today();
    const days = []; for (let i = 0; i < 7; i++) days.push(D.addDays(today, i));
    const md = {}; days.forEach(function (d) { md[d.slice(5)] = d; });
    const out = [];
    all('members').forEach(function (m) {
      if (m.status === 'resigned') return;
      if (m.dob && md[String(m.dob).slice(5, 10)]) {
        const d = md[String(m.dob).slice(5, 10)];
        const age = +d.slice(0, 4) - +String(m.dob).slice(0, 4);
        out.push({ m: m, date: d, kind: 'birthday', label: age % 10 === 0 ? ordinal(age) + ' birthday' : 'Birthday', milestone: age % 10 === 0 });
      }
      if (m.memberSince && md[String(m.memberSince).slice(5, 10)]) {
        const d2 = md[String(m.memberSince).slice(5, 10)];
        const yrs = +d2.slice(0, 4) - +String(m.memberSince).slice(0, 4);
        if (yrs > 0 && yrs % 5 === 0) out.push({ m: m, date: d2, kind: 'anniversary', label: yrs + ' years a member', milestone: true });
      }
    });
    out.sort(function (a, b) { return a.date.localeCompare(b.date); });
    let body;
    if (!out.length) body = '<p class="dash-acc-empty">No member birthdays or milestone anniversaries in the next seven days.</p>';
    else body = '<ul class="dash-mini">' + out.slice(0, 7).map(function (c) {
      const tier = Club.members.tier(c.m);
      return '<li><a href="#/members/' + esc(c.m.id) + '" class="dash-celebrate-row">' + U.avatar(c.m.firstName + ' ' + c.m.lastName, 'sm', c.kind === 'anniversary') +
        '<span class="dash-celebrate-main"><span class="person-name">' + esc(c.m.firstName + ' ' + c.m.lastName) + '</span><span class="person-sub">' + esc(c.label + (tier ? ' · ' + tier.name : '')) + '</span></span>' +
        '<span class="dash-celebrate-when' + (c.date === today ? ' is-today' : '') + '">' + esc(c.date === today ? 'Today' : F.weekday(c.date) + ' ' + F.dateShort(c.date).replace(/^\w+ /, '')) + '</span></a></li>';
    }).join('') + '</ul>';
    const first = out[0];
    const summary = !out.length ? 'None this week' : out.length + ' this week · ' + first.m.firstName + ' ' + first.m.lastName + ', ' + (first.date === today ? 'today' : F.weekday(first.date)) + (out.length > 1 ? ' and ' + (out.length - 1) + ' more' : '');
    return { icon: 'gift', title: 'Celebrations', summary: summary, body: body, href: 'members', linkLabel: 'Open members' };
  }

  function lessonsPanel() {
    const today = D.today();
    const ls = all('lessons').filter(function (l) { return l.date === today && l.status !== 'cancelled'; }).sort(byTime);
    let body;
    if (!ls.length) body = '<p class="dash-acc-empty">No lessons are booked today.</p>';
    else body = '<ul class="dash-mini dash-lessons">' + ls.slice(0, 6).map(function (l) {
      return '<li><span class="dash-lesson-time">' + esc(F.time(l.time)) + '</span><span class="dash-lesson-main"><span class="dash-lesson-title">' + esc(l.memberId ? Club.members.name(l.memberId) : (l.guest && l.guest.name) || 'Open booking') + '</span><span class="person-sub">' + esc((l.type || 'Lesson') + ' with ' + Club.staff.name(l.proId) + (l.duration ? ' · ' + l.duration + ' min' : '')) + '</span></span>' + (l.status === 'completed' ? U.badge('Done', 'good') : '') + '</li>';
    }).join('') + '</ul>';
    const now = nowHM(), next = ls.filter(function (l) { return l.status !== 'completed' && l.time >= now; })[0];
    const summary = !ls.length ? 'None booked today' : ls.length + ' ' + plural(ls.length, 'lesson') + ' today · ' + (next ? 'next ' + F.time(next.time) + ' with ' + Club.staff.name(next.proId) : 'all finished');
    return { icon: 'lesson', title: 'Lessons today', summary: summary, body: body, href: 'lessons', linkLabel: ls.length > 6 ? 'View all ' + ls.length + ' lessons' : 'Open lessons' };
  }

  /* ---------------- Drill-down drawers (stat tiles) ---------------- */
  const PACE = (Club.teeRules && Club.teeRules.PACE) || { 18: 234, 9: 117 };   /* handbook: 13 minutes a hole */
  function toHM(m) { m = Math.max(0, Math.round(m)); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function dur(m) { m = Math.round(m); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; }
  /** Time for a table cell, kept on one line. */
  function tm(t) { return esc(F.time(t)).replace(' ', '&nbsp;'); }
  function hourLabel(h) { return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
  function hourShort(h) { return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function pctOf(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function serviceOf(t) { const m = toMin(t); return m < 11 * 60 ? 'Breakfast' : (m < 16 * 60 + 30 ? 'Lunch' : 'Dinner'); }
  function lead(t) {
    const ps = Array.isArray(t.players) ? t.players : [];
    return ps.length ? playerName(ps[0]) + (ps.length > 1 ? ' +' + (ps.length - 1) : '') : 'Open slot';
  }

  /* Building blocks, all HTML strings */
  function dSec(title, aside, inner) {
    return '<section class="dd-sec" data-reveal><div class="dd-sec-head"><h4>' + esc(title) + '</h4>' + (aside ? '<span class="dd-aside">' + aside + '</span>' : '') + '</div>' + inner + '</section>';
  }
  function dKpis(items) {
    return '<div class="dd-kpis" data-reveal>' + items.map(function (k) {
      return '<div><span class="label-caps">' + esc(k.label) + '</span><strong class="serif">' + esc(k.value) + '</strong>' + (k.sub ? '<span class="dd-kpi-sub">' + k.sub + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /** Two-part share bar: split('Members', 30, 'Guests', 8) */
  function dSplit(title, aL, a, bL, b) {
    const t = a + b, pa = t ? a / t * 100 : 0;
    return '<div class="dd-split"><div class="dd-split-head"><span class="label-caps">' + esc(title) + '</span></div>' +
      '<div class="dd-split-bar" role="img" aria-label="' + esc(title + ': ' + aL + ' ' + a + ', ' + bL + ' ' + b) + '">' +
      (a ? '<span class="a" style="flex:' + a + '" data-tip="' + esc(aL + ': ' + a + ' (' + Math.round(pa) + '%)') + '"></span>' : '') +
      (b ? '<span class="b" style="flex:' + b + '" data-tip="' + esc(bL + ': ' + b + ' (' + Math.round(100 - pa) + '%)') + '"></span>' : '') +
      (!t ? '<span class="none"></span>' : '') + '</div>' +
      '<div class="dd-split-legend"><span><i class="a"></i>' + esc(aL) + ' <strong>' + a + '</strong> <span class="muted">' + Math.round(pa) + '%</span></span>' +
      '<span><i class="b"></i>' + esc(bL) + ' <strong>' + b + '</strong> <span class="muted">' + (t ? Math.round(100 - pa) : 0) + '%</span></span></div></div>';
  }
  /** Ruled table. cols: [{ label, num }], rows: arrays of HTML cells */
  function dTable(cols, rows, foot) {
    return '<div class="table-wrap"><table class="table dd-table"><thead><tr>' + cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (cell, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + (i === 0 ? ' data-first' : '') + '>' + cell + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' +
      (foot ? '<tfoot><tr>' + foot.map(function (c, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table></div>';
  }
  function dDelta(cur, prev, what) {
    if (!prev) return '<span class="muted">No ' + esc(what) + ' to compare</span>';
    const d = Math.round((cur - prev) / prev * 100);
    return '<span class="delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%</span> <span class="muted">vs ' + esc(what) + '</span>';
  }
  function dNote(text) { return '<p class="dd-note">' + esc(text) + '</p>'; }
  function dEmpty(icon, title, text) { return '<div class="dd-empty" data-reveal>' + U.empty({ icon: icon, title: title, text: text }) + '</div>'; }
  /** Seven bars ending today, today drawn in the primary colour, earlier days muted. */
  function weekChart(dates, values, money) {
    const last = dates.length - 1;
    return Club.charts.bar({
      labels: dates.map(function (d, i) { return i === last ? 'Today' : F.weekday(d); }),
      series: [
        { name: 'Earlier days', values: values.map(function (v, i) { return i === last ? 0 : v; }), color: 'var(--c5)' },
        { name: 'Today', values: values.map(function (v, i) { return i === last ? v : 0; }), color: 'var(--c1)' }
      ], stacked: true, money: !!money, height: px(170)
    });
  }
  function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(D.addDays(D.today(), -i)); return out; }

  /* Players today */
  function drillPlayers() {
    const today = D.today();
    const tees = teeFor(today);
    const ps = [];
    tees.forEach(function (t) { (Array.isArray(t.players) ? t.players : []).forEach(function (p) { if (p) ps.push({ p: p, t: t }); }); });
    const guests = ps.filter(function (x) { return x.p.type === 'guest'; }).length;
    const nine = ps.filter(function (x) { return +x.t.holes === 9; }).length;
    const carts = ps.filter(function (x) { return x.p.cart; }).length;
    const week = lastDays(7);
    const weekVals = week.map(function (d) { return sum(teeFor(d), playerCount); });
    const prior = weekVals.slice(0, 6), priorAvg = prior.length ? sum(prior, function (v) { return v; }) / prior.length : 0;
    const lastWeekSame = sum(teeFor(D.addDays(today, -7)), playerCount);
    let html = dKpis([
      { label: 'Players', value: F.num(ps.length), sub: dDelta(ps.length, priorAvg, '6-day average') },
      { label: 'Groups', value: F.num(tees.length), sub: esc(tees.length ? (ps.length / tees.length).toFixed(1) + ' per group' : 'None booked') },
      { label: 'Guests', value: F.num(guests), sub: esc(pctOf(guests, ps.length) + '% of the field') },
      { label: 'A week ago', value: F.num(lastWeekSame), sub: dDelta(ps.length, lastWeekSame, F.weekday(today) + ' last week') }
    ]);
    if (!ps.length) {
      html += dEmpty('teesheet', 'No players on the sheet today', 'Tee times booked for today will be analysed here as they come in.');
    } else {
      const interval = inferInterval(), cap = Math.floor(60 / interval) * 4;
      let minH = 24, maxH = 0;
      tees.forEach(function (t) { const h = Math.floor(toMin(t.time) / 60); if (h < minH) minH = h; if (h > maxH) maxH = h; });
      const hours = []; for (let h = minH; h <= maxH; h++) hours.push(h);
      const memV = hours.map(function (h) { return ps.filter(function (x) { return x.p.type !== 'guest' && Math.floor(toMin(x.t.time) / 60) === h; }).length; });
      const gstV = hours.map(function (h) { return ps.filter(function (x) { return x.p.type === 'guest' && Math.floor(toMin(x.t.time) / 60) === h; }).length; });
      html += dSec('Players by hour', esc('Tee times at ' + interval + ' minute intervals'),
        Club.charts.bar({ labels: hours.map(hourShort), series: [{ name: 'Members', values: memV }, { name: 'Guests', values: gstV, color: 'var(--c2)' }], stacked: true, height: px(180) }));
      html += dSec('How they play', '', '<div class="dd-splits">' + dSplit('Members and guests', 'Members', ps.length - guests, 'Guests', guests) +
        dSplit('Round length', '18 holes', ps.length - nine, '9 holes', nine) + dSplit('Getting around', 'Cart', carts, 'Walking', ps.length - carts) + '</div>');
      const busy = hours.map(function (h, i) {
        const gs = tees.filter(function (t) { return Math.floor(toMin(t.time) / 60) === h; });
        return { h: h, groups: gs.length, players: memV[i] + gstV[i] };
      }).sort(function (a, b) { return b.players - a.players || a.h - b.h; }).slice(0, 4);
      html += dSec('Busiest tee times', esc('Capacity ' + cap + ' players an hour'), dTable(
        [{ label: 'Hour' }, { label: 'Groups', num: true }, { label: 'Players', num: true }, { label: 'Filled', num: true }],
        busy.map(function (b) { const u = Math.min(100, pctOf(b.players, cap)); return ['<span class="primary-cell">' + esc(hourLabel(b.h)) + '</span>', b.groups, b.players, '<span class="dd-fill"><span class="bar' + (u >= 90 ? ' brass' : '') + '"><span style="width:' + u + '%"></span></span>' + u + '%</span>']; })));
    }
    html += dSec('The last seven days', dDelta(ps.length, priorAvg, 'the 6-day average'), weekChart(week, weekVals));
    const lost = all('teeTimes').filter(function (t) { return t.date === today && (t.status === 'no-show' || t.status === 'cancelled'); }).sort(byTime);
    const fortnight = all('teeTimes').filter(function (t) { return t.date >= D.addDays(today, -14) && t.date < today && t.status !== 'cancelled'; });
    const ns = fortnight.filter(function (t) { return t.status === 'no-show'; }).length;
    html += dSec('No-shows and cancellations', esc(ns + ' no-' + plural(ns, 'show') + ' in 14 days, ' + pctOf(ns, fortnight.length) + '% of groups'),
      lost.length ? dTable([{ label: 'Tee time' }, { label: 'Group' }, { label: 'Status' }],
        lost.map(function (t) { return ['<span class="primary-cell">' + tm((t.time)) + '</span>', esc(lead(t)), t.status === 'no-show' ? U.badge('No-show', 'bad') : U.badge('Cancelled', 'plain')]; }))
        : dNote('No no-shows or cancellations today.'));
    return { eyebrow: F.dateLong(today), title: 'Players today', body: html, go: 'teesheet/' + today, goLabel: 'Open tee sheet' };
  }

  /* On course now */
  function drillOnCourse() {
    const today = D.today(), now = toMin(nowHM());
    const out = teeFor(today).filter(function (t) { return t.status === 'on-course'; }).sort(byTime);
    const rows = out.map(function (t) {
      const holes = +t.holes === 9 ? 9 : 18, len = PACE[holes];
      const off = toMin(t.startedAt || t.time), el = Math.max(0, now - off);
      const hole = Math.min(holes, Math.floor(el / (len / holes)) + 1);
      const late = t.startedAt ? toMin(t.startedAt) - toMin(t.time) : 0;
      const status = el > len ? { kind: 'bad', label: (el - len) + ' min over' } : late > 10 ? { kind: 'warn', label: 'Off ' + late + ' min late' } : { kind: 'good', label: 'On pace' };
      return { t: t, holes: holes, off: off, el: el, len: len, hole: hole, finish: off + len, status: status, players: playerCount(t) };
    });
    const players = sum(rows, function (r) { return r.players; });
    const behind = rows.filter(function (r) { return r.status.kind !== 'good'; }).length;
    const finished = function (from) { return all('teeTimes').filter(function (t) { return t.date >= from && t.date <= today && t.status === 'completed' && +t.holes !== 9 && t.startedAt && t.finishedAt; }); };
    let done = finished(today), paceWhen = 'today';
    if (!done.length) { done = finished(D.addDays(today, -14)); paceWhen = 'over 14 days'; }
    const avg = done.length ? sum(done, function (t) { return toMin(t.finishedAt) - toMin(t.startedAt); }) / done.length : 0;
    const lastOut = rows.length ? rows.reduce(function (b, r) { return r.finish > b ? r.finish : b; }, 0) : 0;
    let html = dKpis([
      { label: 'Groups out', value: F.num(rows.length), sub: esc(players + ' ' + plural(players, 'player')) },
      { label: 'On pace', value: F.num(rows.length - behind), sub: behind ? '<span class="dash-urgent">' + esc(behind + ' need a look') + '</span>' : esc('Every group') },
      { label: 'Average round', value: avg ? dur(avg) : 'None yet', sub: avg ? esc((avg <= PACE[18] ? 'Within target' : Math.round(avg - PACE[18]) + ' min over target') + ', ' + paceWhen) : esc('No 18-hole finishers') },
      { label: 'Course clear', value: lastOut ? F.time(toHM(lastOut)) : 'Now', sub: esc('Expected last finish') }
    ]);
    if (!rows.length) {
      html += dEmpty('flag', 'No groups on the course', 'Groups appear here once the starter sends them off the first tee.');
    } else {
      const maxH = rows.some(function (r) { return r.holes === 18; }) ? 18 : 9;
      const at = {}; rows.forEach(function (r) { (at[r.hole] = at[r.hole] || []).push(r); });
      const cells = []; for (let h = 1; h <= maxH; h++) cells.push(h);
      const holeDoc = function (h) { return Club.store.find('holes', 'hole_' + h); };
      /* One hidden detail panel per occupied hole; pressing that hole's box reveals it. */
      const details = Object.keys(at).map(function (h) {
        const hd = holeDoc(+h), groups = at[h];
        return '<div class="dd-hole-detail" data-hole-detail="' + h + '" hidden>' +
          '<div class="dd-hole-detail-head"><div><span class="label-caps">Hole ' + h + (hd ? ' · Par ' + hd.par + ' · ' + hd.yards.green + ' yards' : '') + '</span>' +
          '<h4>' + esc(hd ? hd.name : 'Hole ' + h) + '</h4></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hole-close>Close</button></div>' +
          groups.map(function (r) {
            const ps = Array.isArray(r.t.players) ? r.t.players : [];
            return '<div class="dd-hole-group"><div class="dd-hole-group-meta">' +
              '<span class="dd-big">' + tm(toHM(r.off)) + '</span>' +
              '<span class="dd-sub">' + esc(r.holes + ' holes · finish ' + F.time(toHM(r.finish))) + '</span>' + U.badge(r.status.label, r.status.kind) + '</div>' +
              '<ul class="dd-hole-players">' + ps.map(function (p) {
                const nm = playerName(p), m = p.memberId ? Club.members.get(p.memberId) : null;
                return '<li>' + U.avatar(nm, 'sm', p.type === 'guest') +
                  '<span>' + (m ? '<a href="#/members/' + esc(m.id) + '">' + esc(nm) + '</a>' : esc(nm)) +
                  '<span class="dd-sub">' + esc(p.type === 'guest' ? 'Guest' : (m ? 'Member #' + m.memberNo + (m.handicap != null ? ' · ' + F.handicap(m.handicap) : '') : 'Member')) + (p.cart ? ' · Cart' : ' · Walking') + '</span></span></li>';
              }).join('') + '</ul></div>';
          }).join('') + '</div>';
      }).join('');
      html += dSec('Around the course', esc('Press a hole to see who is on it'),
        '<div class="dd-holes" aria-label="Groups by estimated hole">' + cells.map(function (h) {
          const n = (at[h] || []).length;
          const inner = '<span class="dd-hole-n">' + h + '</span><span class="dd-hole-dots">' + (n ? new Array(Math.min(n, 3) + 1).join('<i></i>') : '') + '</span>';
          return n
            ? '<button type="button" class="dd-hole has' + (h === 10 ? ' turn' : '') + '" data-hole="' + h + '" aria-expanded="false" aria-label="' + esc('Hole ' + h + ', ' + n + ' ' + plural(n, 'group') + '. Show who') + '" data-tip="' + esc('Hole ' + h + ': ' + n + ' ' + plural(n, 'group')) + '">' + inner + '</button>'
            : '<div class="dd-hole' + (h === 10 ? ' turn' : '') + '">' + inner + '</div>';
        }).join('') + '</div><div class="dd-holes-legend"><span>Front nine</span><span>Back nine</span></div>' + details);
      html += dSec('Groups out', esc('Pace target ' + dur(PACE[18]) + ' for 18 holes, ' + dur(PACE[9]) + ' for 9 (13 minutes a hole)'), dTable(
        [{ label: 'Group' }, { label: 'Off', num: true }, { label: 'Hole', num: true }, { label: 'Finish', num: true }, { label: 'Pace' }],
        rows.map(function (r) {
          return ['<span class="primary-cell">' + esc(lead(r.t)) + '</span><div class="dd-sub">' + esc(F.time(r.t.time) + ' tee time · ' + r.holes + ' holes') + '</div><div class="dd-prog bar' + (r.status.kind === 'bad' ? ' brass' : '') + '"><span style="width:' + Math.min(100, r.el / r.len * 100).toFixed(1) + '%"></span></div>',
            tm((toHM(r.off))), '<span class="dd-big">' + r.hole + '</span>', tm((toHM(r.finish))), U.badge(r.status.label, r.status.kind)];
        })));
    }
    const pace = avg ? Math.min(100, avg / 300 * 100) : 0;
    html += dSec('Pace of play', esc(done.length + ' 18-hole ' + plural(done.length, 'round') + ' finished ' + paceWhen),
      done.length ? '<div class="dd-pace"><div class="dd-pace-track"><span style="width:' + pace.toFixed(1) + '%"></span><i style="left:' + (PACE[18] / 300 * 100) + '%" data-tip="Target ' + dur(PACE[18]) + '"></i></div><div class="dd-pace-scale"><span>0h</span><span>Target ' + dur(PACE[18]) + '</span><span>5h</span></div></div>' +
        dNote('Average ' + dur(avg) + ', fastest ' + dur(Math.min.apply(null, done.map(function (t) { return toMin(t.finishedAt) - toMin(t.startedAt); }))) + ', slowest ' + dur(Math.max.apply(null, done.map(function (t) { return toMin(t.finishedAt) - toMin(t.startedAt); }))) + '.')
        : dNote('Pace will be measured once the first 18-hole groups come in.'));
    const next = teeFor(today).filter(function (t) { return (t.status === 'booked' || t.status === 'checked-in') && toMin(t.time) >= now - 10; }).sort(byTime).slice(0, 4);
    html += dSec('Next off the tee', '', next.length ? dTable([{ label: 'Tee time' }, { label: 'Group' }, { label: 'Status' }],
      next.map(function (t) { return ['<span class="primary-cell">' + tm((t.time)) + '</span>', esc(lead(t)) + '<div class="dd-sub">' + esc((t.holes || 18) + ' holes · ' + playerCount(t) + ' ' + plural(playerCount(t), 'player')) + '</div>', statusBadge(t.status)]; }))
      : dNote('No more groups waiting to go off today.'));
    return { eyebrow: 'Live at ' + F.time(nowHM()), title: 'On course now', body: html, go: 'teesheet/' + today, goLabel: 'Open tee sheet' };
  }

  /* Dining covers */
  function drillCovers() {
    const today = D.today(), now = nowHM();
    const dayRes = function (d) { return all('diningReservations').filter(function (r) { return r.date === d && !DEAD[r.status]; }); };
    const res = dayRes(today), prev = dayRes(D.addDays(today, -7));
    const covers = sum(res, function (r) { return r.partySize; }), prevC = sum(prev, function (r) { return r.partySize; });
    const seated = res.filter(function (r) { return r.status === 'seated'; });
    let html = dKpis([
      { label: 'Guests', value: F.num(covers), sub: dDelta(covers, prevC, 'last ' + F.weekday(today)) },
      { label: 'Reservations', value: F.num(res.length), sub: esc(res.length ? (covers / res.length).toFixed(1) + ' guests per party' : 'None yet') },
      { label: 'Seated now', value: F.num(sum(seated, function (r) { return r.partySize; })), sub: esc(seated.length + ' ' + plural(seated.length, 'table') + ' in service') },
      { label: 'Last ' + F.weekday(today), value: F.num(prevC), sub: esc(prev.length + ' ' + plural(prev.length, 'reservation')) }
    ]);
    if (!res.length) {
      html += dEmpty('dining', 'No reservations today', 'Bookings for the dining rooms will be analysed here.');
    } else {
      const SV = ['Breakfast', 'Lunch', 'Dinner'];
      const bySvc = function (list) { return SV.map(function (s) { return sum(list.filter(function (r) { return serviceOf(r.time) === s; }), function (r) { return r.partySize; }); }); };
      const venues = VENUES.slice(); res.forEach(function (r) { if (r.venue && venues.indexOf(r.venue) < 0) venues.push(r.venue); });
      html += '<div class="dd-two" data-reveal>' +
        dSec('By service', '', Club.charts.donut({ items: SV.map(function (s, i) { return { label: s, value: bySvc(res)[i] }; }).filter(function (x) { return x.value > 0; }), size: 150, center: { value: String(covers), label: 'Guests' } })) +
        dSec('By venue', '', Club.charts.hbars(venues.map(function (v) { return { label: v, value: sum(res.filter(function (r) { return r.venue === v; }), function (r) { return r.partySize; }) }; }))) + '</div>';
      html += dSec('Against the same day last week', dDelta(covers, prevC, F.dateShort(D.addDays(today, -7))),
        Club.charts.bar({ labels: SV, series: [{ name: 'Today', values: bySvc(res) }, { name: 'Last ' + F.weekday(today), values: bySvc(prev), color: 'var(--c5)' }], height: px(170) }));
      const B = [['Tables for one or two', 1, 2], ['Three or four', 3, 4], ['Five or six', 5, 6], ['Seven to nine', 7, 9], ['Ten or more', 10, 999]];
      const bk = B.map(function (b) { const l = res.filter(function (r) { return num(r.partySize) >= b[1] && num(r.partySize) <= b[2]; }); return { label: b[0], value: l.length }; });
      const occ = {}; res.forEach(function (r) { if (r.occasion) { const o = occ[r.occasion] = occ[r.occasion] || { n: 0, c: 0 }; o.n++; o.c += num(r.partySize); } });
      const occList = Object.keys(occ).sort(function (a, b) { return occ[b].c - occ[a].c; });
      html += '<div class="dd-two" data-reveal>' +
        dSec('Party sizes', esc('Parties'), Club.charts.hbars(bk.filter(function (b) { return b.value > 0; }), { suffix: '' })) +
        dSec('Occasions', esc(occList.length ? occList.length + ' noted' : ''), occList.length ? dTable([{ label: 'Occasion' }, { label: 'Parties', num: true }, { label: 'Covers', num: true }],
          occList.map(function (o) { return [esc(o), occ[o].n, occ[o].c]; })) : dNote('No special occasions noted on today\'s bookings.')) + '</div>';
      const next = res.filter(function (r) { return r.status === 'confirmed' && r.time >= now; }).sort(byTime).slice(0, 6);
      html += dSec('Next arrivals', esc(next.length ? next.length + ' shown' : ''), next.length ? dTable([{ label: 'Time' }, { label: 'Party' }, { label: 'Venue' }, { label: 'Guests', num: true }],
        next.map(function (r) {
          const nm = r.name || (r.memberId ? Club.members.name(r.memberId) : 'Guest');
          return ['<span class="primary-cell">' + tm((r.time)) + '</span>', esc(nm) + (r.occasion ? ' ' + U.badge(r.occasion, 'brass') : ''), esc(r.venue || '') + (r.table ? '<div class="dd-sub">' + (r.venue === 'Banquet Hall' ? '' : 'Table ') + esc(r.table) + '</div>' : ''), num(r.partySize)];
        })) : dNote('No more confirmed arrivals today.'));
    }
    return { eyebrow: F.dateLong(today), title: 'Dining room', body: html, go: 'dining', goLabel: 'Open dining' };
  }

  /* Revenue today */
  function drillRevenue() {
    const today = D.today();
    const rev = revenueOn(today);
    const week = lastDays(7);
    const weekRev = week.map(function (d) { return d === today ? rev.total : revenueOn(d).total; });
    const prior = weekRev.slice(0, 6), avg7 = sum(prior, function (v) { return v; }) / Math.max(1, prior.length);
    const sales = rev.tx.filter(function (t) { return t.amount > 0; });
    const nowS = nowHM();
    const upTo = function (r) { return sum(r.tx.filter(function (t) { return t.time && t.time <= nowS; }), function (t) { return t.amount; }); };
    const byHourToday = upTo(rev);
    const byHourAvg = sum(week.slice(0, 6), function (d) { return upTo(revenueOn(d)); }) / 6;
    let html = dKpis([
      { label: 'Revenue', value: F.money0(rev.total), sub: dDelta(rev.total, avg7, 'a full-day average') },
      { label: 'Transactions', value: F.num(sales.length), sub: esc('Sales, checks and charges') },
      { label: 'Average ticket', value: F.money0(sales.length ? sum(sales, function (t) { return t.amount; }) / sales.length : 0), sub: esc('Before tax and service') },
      { label: 'By this hour', value: F.money0(byHourAvg), sub: dDelta(byHourToday, byHourAvg, 'the same hour, 6-day average') }
    ]);
    if (!rev.tx.length) {
      html += dEmpty('billing', 'No revenue posted yet today', 'Pro shop sales, closed dining checks and house charges will appear here.');
    } else {
      const keys = Object.keys(DEPT).filter(function (k) { return Math.abs(rev.byDept[k]) >= 0.5; }).sort(function (a, b) { return rev.byDept[b] - rev.byDept[a]; });
      html += dSec('By department', esc(keys.length + ' ' + plural(keys.length, 'department') + ' trading'),
        dTable([{ label: 'Department' }, { label: 'Share' }, { label: 'Items', num: true }, { label: 'Revenue', num: true }],
          keys.map(function (k) {
            const v = rev.byDept[k], sh = Math.max(0, pctOf(v, rev.total));
            return ['<span class="primary-cell">' + esc(DEPT[k]) + '</span>', '<span class="dd-fill wide"><span class="bar"><span style="width:' + Math.min(100, sh) + '%"></span></span>' + sh + '%</span>', rev.tx.filter(function (t) { return t.dept === k; }).length, esc(F.money0(v))];
          }), ['Total', '', rev.tx.length, esc(F.money0(rev.total))]));
      const tenders = {}; rev.tx.forEach(function (t) { tenders[t.tender] = (tenders[t.tender] || 0) + t.amount; });
      const tItems = Object.keys(tenders).filter(function (k) { return tenders[k] > 0; }).sort(function (a, b) { return tenders[b] - tenders[a]; }).map(function (k) { return { label: k, value: Math.round(tenders[k]) }; });
      const timed = rev.tx.filter(function (t) { return t.time; });
      let minH = 24, maxH = 0; timed.forEach(function (t) { const h = Math.floor(toMin(t.time) / 60); if (h < minH) minH = h; if (h > maxH) maxH = h; });
      const hours = []; for (let h = minH; h <= maxH; h++) hours.push(h);
      const untimed = sum(rev.tx.filter(function (t) { return !t.time; }), function (t) { return t.amount; });
      html += '<div class="dd-two" data-reveal>' +
        dSec('By tender', '', tItems.length ? Club.charts.donut({ items: tItems, size: 150, money: true, center: { value: rev.total >= 1000 ? '$' + (rev.total / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : F.money0(rev.total), label: 'Today' } }) : dNote('No positive takings yet.')) +
        dSec('By hour', '', hours.length ? Club.charts.bar({ labels: hours.map(hourShort), series: [{ name: 'Revenue', values: hours.map(function (h) { return Math.round(sum(timed.filter(function (t) { return Math.floor(toMin(t.time) / 60) === h; }), function (t) { return t.amount; })); }) }], money: true, height: px(160) }) +
          (Math.abs(untimed) >= 0.5 ? dNote(F.money0(untimed) + ' in house charges carries no time and is left out of this chart.') : '') : dNote('No timed transactions yet.')) + '</div>';
      const top = rev.tx.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 6);
      html += dSec('Largest transactions', '', dTable([{ label: 'Time' }, { label: 'Detail' }, { label: 'Tender' }, { label: 'Amount', num: true }],
        top.map(function (t) { return ['<span class="primary-cell">' + (t.time ? tm(t.time) : 'Today') + '</span>', esc(t.desc) + '<div class="dd-sub">' + esc(DEPT[t.dept] + (t.who ? ' · ' + t.who : '')) + '</div>', esc(t.tender), '<strong>' + esc(F.money0(t.amount)) + '</strong>']; })));
    }
    html += dSec('The last seven days', esc('Six-day average ' + F.money0(avg7) + ' a day'), weekChart(week, weekRev.map(Math.round), true));
    return { eyebrow: F.dateLong(today), title: 'Revenue today', body: html, go: 'billing', goLabel: 'Open billing' };
  }

  /* Open work orders */
  const PRIO = [{ k: 'urgent', l: 'Urgent', c: 'var(--oxblood)' }, { k: 'high', l: 'High', c: 'var(--ochre)' }, { k: 'normal', l: 'Normal', c: 'var(--c1)' }, { k: 'low', l: 'Low', c: 'var(--c3)' }];
  function prioBadge(p) { return U.badge(p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Normal', p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : p === 'low' ? 'plain' : 'info'); }
  function daysBetween(a, b) { return Math.round((F.toDate(b) - F.toDate(a)) / 86400000); }
  function drillWorkOrders() {
    const today = D.today();
    const open = all('workOrders').filter(function (w) { return w.status !== 'done'; });
    const overdue = open.filter(function (w) { return w.dueDate && w.dueDate < today; }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
    const dueToday = open.filter(function (w) { return w.dueDate === today; });
    const prog = open.filter(function (w) { return w.status === 'in-progress'; });
    const where = function (w) { return (w.area || 'General') + (w.hole ? ', hole ' + w.hole : ''); };
    let html = dKpis([
      { label: 'Open', value: F.num(open.length), sub: esc(prog.length + ' in progress') },
      { label: 'Overdue', value: F.num(overdue.length), sub: overdue.length ? '<span class="dash-urgent">' + esc('Past their due date') + '</span>' : esc('Nothing late') },
      { label: 'Due today', value: F.num(dueToday.length), sub: esc(dueToday.length ? 'To finish today' : 'None due') },
      { label: 'Urgent', value: F.num(open.filter(function (w) { return w.priority === 'urgent'; }).length), sub: esc('Highest priority') }
    ]);
    if (!open.length) return { eyebrow: 'Course and grounds', title: 'Open work orders', body: html + dEmpty('check', 'Every work order is closed', 'New jobs logged by the grounds team will be analysed here.'), go: 'course/work', goLabel: 'View all work orders' };
    const areas = {}; open.forEach(function (w) { const a = w.area || 'General'; areas[a] = (areas[a] || 0) + 1; });
    html += '<div class="dd-two" data-reveal>' +
      dSec('By priority', '', Club.charts.hbars(PRIO.map(function (p) { return { label: p.l, value: open.filter(function (w) { return (w.priority || 'normal') === p.k; }).length, color: p.c }; }))) +
      dSec('By area', '', Club.charts.hbars(Object.keys(areas).sort(function (a, b) { return areas[b] - areas[a]; }).slice(0, 6).map(function (a) { return { label: a, value: areas[a] }; }))) + '</div>';
    const who = {}; open.forEach(function (w) { const k = w.assigneeId || ''; const x = who[k] = who[k] || { open: 0, prog: 0, late: 0 }; x.open++; if (w.status === 'in-progress') x.prog++; if (w.dueDate && w.dueDate < today) x.late++; });
    html += dSec('By assignee', '', dTable([{ label: 'Assignee' }, { label: 'Open', num: true }, { label: 'In progress', num: true }, { label: 'Overdue', num: true }],
      Object.keys(who).sort(function (a, b) { return who[b].open - who[a].open; }).map(function (k) {
        return ['<span class="primary-cell">' + esc(k ? Club.staff.name(k) : 'Unassigned') + '</span>', who[k].open, who[k].prog, who[k].late ? '<span class="dash-urgent">' + who[k].late + '</span>' : '<span class="muted">0</span>'];
      })));
    html += dSec('Overdue', esc(overdue.length ? overdue.length + ' ' + plural(overdue.length, 'job') : ''), overdue.length ? dTable([{ label: 'Job' }, { label: 'Priority' }, { label: 'Due', num: true }, { label: 'Late', num: true }],
      overdue.map(function (w) { return ['<span class="primary-cell">' + esc(w.title || 'Work order') + '</span><div class="dd-sub">' + esc(where(w) + ' · ' + Club.staff.name(w.assigneeId)) + '</div>', prioBadge(w.priority), esc(F.dateShort(w.dueDate)), '<span class="dash-urgent">' + daysBetween(w.dueDate, today) + ' ' + plural(daysBetween(w.dueDate, today), 'day') + '</span>']; }))
      : dNote('Every open job is within its due date.'));
    const aged = open.filter(function (w) { return w.createdAt; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }).slice(0, 4);
    if (aged.length) html += dSec('Oldest open', '', dTable([{ label: 'Job' }, { label: 'Status' }, { label: 'Open for', num: true }],
      aged.map(function (w) {
        const d = Math.max(0, daysBetween(S.iso(new Date(w.createdAt)), today));
        return ['<span class="primary-cell">' + esc(w.title || 'Work order') + '</span><div class="dd-sub">' + esc(where(w)) + '</div>', w.status === 'in-progress' ? U.badge('In progress', 'info') : U.badge('Open', 'outline'), d + ' ' + plural(d, 'day')];
      })));
    return { eyebrow: 'Course and grounds', title: 'Open work orders', body: html, go: 'course/work', goLabel: 'View all work orders' };
  }

  const DRILLS = { players: drillPlayers, oncourse: drillOnCourse, covers: drillCovers, revenue: drillRevenue, workorders: drillWorkOrders };
  function openDrill(key) {
    const fn = DRILLS[key]; if (!fn) return;
    let d;
    try { d = fn(); } catch (e) { console.error(e); d = { eyebrow: 'Details', title: 'Details', body: U.empty({ icon: 'alert', title: 'These details could not load', text: e.message }) }; }
    const api = U.drawer({
      eyebrow: d.eyebrow, title: d.title, body: '<div class="dd">' + d.body + '</div>',
      actions: d.go ? [{ label: 'Close', kind: 'ghost' }, { label: d.goLabel, kind: 'primary', onClick: function () { Club.app.go(d.go); } }] : null
    });
    api.el.classList.add('dash-drawer');
    api.el.setAttribute('aria-label', d.title);
    U.on(api.el, 'click', 'a[href^="#/"]', function () { api.close(); });
    /* On course now: pressing an occupied hole shows its groups; pressing it again hides them. */
    function showHole(h) {
      U.$$('[data-hole]', api.el).forEach(function (b) { const on = b.dataset.hole === h; b.classList.toggle('selected', on); b.setAttribute('aria-expanded', on); });
      U.$$('[data-hole-detail]', api.el).forEach(function (p) { p.hidden = p.dataset.holeDetail !== h; });
    }
    U.on(api.el, 'click', '[data-hole]', function (e, b) { showHole(b.classList.contains('selected') ? null : b.dataset.hole); });
    U.on(api.el, 'click', '[data-hole-close]', function () { showHole(null); });
    U.animateIn(api.body);
  }

  /* ---------------- Sections & live refresh ---------------- */
  const SECTIONS = {
    summary: { deps: ['teeTimes', 'events', 'diningReservations'], render: summaryLine, text: true },
    stats: { deps: ['teeTimes', 'diningReservations', 'sales', 'diningOrders', 'charges', 'workOrders'], render: statsHTML, stats: true },
    tee: { deps: ['teeTimes', 'members'], render: teePanel },
    course: { deps: ['$courseStatus'], render: coursePanel },
    events: { deps: ['events'], render: eventsPanel },
    dining: { deps: ['diningReservations', 'members'], render: diningPanel },
    attention: { deps: ['products', 'statements', 'members', 'workOrders', 'membershipApplications', 'applications', 'memberApplications', 'messageReports'], render: attentionPanel },
    celebrate: { deps: ['members'], render: function (open) { return accHTML('celebrate', celebrationsPanel(), open); }, acc: true },
    lessons: { deps: ['lessons', 'members'], render: function (open) { return accHTML('lessons', lessonsPanel(), open); }, acc: true }
  };
  function safe(fn, arg) {
    try { return fn(arg); } catch (e) { console.error(e); return U.empty({ icon: 'alert', title: 'This panel could not load', text: e.message }); }
  }
  function panel(id, cls) { return '<section class="panel dash-panel ' + (cls || '') + '" data-reveal data-sec="' + id + '">' + safe(SECTIONS[id].render) + '</section>'; }
  /** Secondary panels: a collapsed accordion with a one-line summary; the open state survives live refreshes. */
  function accHTML(id, d, open) {
    return Portal.accordion({ id: 'dash-acc-' + id, icon: d.icon, title: d.title, summary: d.summary, open: !!open,
      body: d.body + (d.href ? '<div class="dash-acc-foot"><a class="s-link" href="#/' + esc(d.href) + '">' + esc(d.linkLabel) + '</a></div>' : '') });
  }
  function accSec(id) { return '<div class="dash-acc" data-reveal data-sec="' + id + '">' + safe(SECTIONS[id].render, false) + '</div>'; }
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function render(view) {
    const today = D.today();
    const name = (Club.user && Club.user.firstName) || 'there';
    view.innerHTML = '<div class="dash">' +
      U.pageHeader({
        eyebrow: F.weekday(today) === 'Sat' || F.weekday(today) === 'Sun' ? 'Weekend service at ' + Club.info.short : F.toDate(today).toLocaleDateString('en-US', { weekday: 'long' }) + ' at ' + Club.info.short,
        title: greeting() + ', ' + name,
        subtitle: '<span class="dash-date">' + esc(F.dateLong(today)) + '</span><span class="dash-summary" data-sec="summary">' + esc(safe(summaryLine)) + '</span>',
        actions: U.btn('Book tee time', { kind: 'primary', icon: 'plus', action: 'go', id: 'teesheet/' + today }) +
          U.btn('New reservation', { icon: 'dining', action: 'go', id: 'dining' }) +
          U.btn('Post charge', { icon: 'billing', action: 'go', id: 'billing' }) +
          U.btn('Compose notice', { icon: 'mail', action: 'go', id: 'communications' })
      }) +
      '<div class="dash-stats" data-sec="stats">' + safe(statsHTML) + '</div>' +
      '<div class="grid grid-main-side dash-row">' + panel('tee') + panel('course', 'dark') + '</div>' +
      '<div class="grid grid-3 dash-row">' + panel('attention') + panel('events') + panel('dining') + '</div>' +
      '<div class="grid grid-2 dash-row dash-more">' + accSec('celebrate') + accSec('lessons') + '</div>' +
      '</div>';

    U.on(view, 'click', '[data-action=go]', function (e, b) { Club.app.go(b.dataset.id); });
    U.on(view, 'click', '.stat[data-drill]', function (e, st) { openDrill(st.dataset.drill); });
    U.on(view, 'click', '[data-report]', function (e, b) { openReport(b.dataset.report); });
    U.on(view, 'keydown', '.stat[data-drill]', function (e, st) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); openDrill(st.dataset.drill); }
    });

    const timers = {};
    function refresh(id) {
      clearTimeout(timers[id]);
      timers[id] = setTimeout(function () {
        const el = view.querySelector('[data-sec="' + id + '"]'); if (!el) return;
        const sec = SECTIONS[id];
        if (sec.text) { el.textContent = safe(sec.render); return; }
        const fk = document.activeElement && el.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.drill : null;
        if (sec.acc) { const hadFocus = el.contains(document.activeElement); el.innerHTML = safe(sec.render, !!el.querySelector('.pk-acc.is-open')); if (hadFocus) { const h = el.querySelector('.pk-acc-head'); if (h) h.focus(); } return; }
        el.innerHTML = safe(sec.render);
        if (id === 'tee') setTimeout(fitTeeChart, 60);
        if (fk) { const back = el.querySelector('[data-drill="' + fk + '"]'); if (back) back.focus(); }
        if (sec.stats) {
          U.$$('[data-reveal]', el).forEach(function (n) { n.classList.add('revealed'); });
          U.$$('[data-count]', el).forEach(function (n) {
            n.setAttribute('data-counted', '');
            n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { maximumFractionDigits: +(n.dataset.decimals || 0) });
          });
          return;
        }
        el.classList.add('dash-updated');
        setTimeout(function () { el.classList.remove('dash-updated'); }, 900);
        U.animateIn(el);
      }, 140);
    }
    const colls = {};
    Object.keys(SECTIONS).forEach(function (id) { SECTIONS[id].deps.forEach(function (c) { (colls[c] = colls[c] || []).push(id); }); });
    const unsubs = Object.keys(colls).map(function (c) { return S.subscribe(c, function () { colls[c].forEach(refresh); }); });

    /* Fill the tee panel: measure the empty space under its content and redraw the chart taller (or back down). */
    function fitTeeChart() {
      const el = view.querySelector('[data-sec="tee"]'), svg = el && el.querySelector('.dash-util svg.chart');
      if (!el || !svg || getComputedStyle(el.querySelector('.dash-util')).display === 'none') return;
      /* the empty space sits at the bottom of the panel body (it is stretched to the row height) */
      const body = el.querySelector('.dash-tee') || el, kids = Array.prototype.slice.call(body.children);
      const last = kids[kids.length - 1], cs = getComputedStyle(body);
      const free = body.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) - (last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().bottom);
      const cur = svg.getBoundingClientRect().height, want = Math.max(px(130), Math.min(px(360), Math.round(cur + free - 4)));
      if (Math.abs(want - cur) < 6) return;
      teeChartH = want; const util = el.querySelector('.dash-util'); const html = safe(SECTIONS.tee.render);
      const tmp = document.createElement('div'); tmp.innerHTML = html; const fresh = tmp.querySelector('.dash-util');
      if (util && fresh) util.innerHTML = fresh.innerHTML;
    }
    let fitT = null; function fitSoon() { clearTimeout(fitT); fitT = setTimeout(function () { teeChartH = 0; const el = view.querySelector('[data-sec="tee"] .dash-util'); if (el) { const tmp = document.createElement('div'); tmp.innerHTML = safe(SECTIONS.tee.render); const f = tmp.querySelector('.dash-util'); if (f) el.innerHTML = f.innerHTML; } fitTeeChart(); }, 200); }
    setTimeout(fitTeeChart, 450); setTimeout(fitTeeChart, 1200);
    window.addEventListener('resize', fitSoon);

    // Keep "next groups" and "on course" honest as the clock moves.
    const tick = setInterval(function () { refresh('tee'); refresh('stats'); }, 60000);

    return function () {
      unsubs.forEach(function (u) { u(); });
      clearInterval(tick); window.removeEventListener('resize', fitSoon); clearTimeout(fitT);
      Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
    };
  }

  Club.register({ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: 'Overview', order: 1, render: render });
})();
