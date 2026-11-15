/* Lessons & Academy: weekly teaching schedule by pro, lesson bookings, rate card and group programs. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/lessons-data.js */
  const { DAY_START, DAY_END, SPAN, DAYS, TYPE_DUR, toMin, toHM, nowMin, dayName, alignTo, overlap, rates, priceFor, programSessions } = Club.shared.lessons;

  const TYPES = ['Private lesson', 'Playing lesson', 'Club fitting', 'Junior clinic', 'Group clinic'];
  const DURATIONS = [30, 45, 60, 90];
  const SPECIALTY = {
    /* stf_2 Steve Wood is the club's real Director of Golf: state his title only. stf_3..stf_5 are fictional demo pros. */
    stf_2: 'Leads golf operations and the CPGA professional staff at St. Boniface.',
    stf_3: 'CPGA professional. Full swing coaching on SIM teaching technology and the short game school.',
    stf_4: 'CPGA professional. Putting and wedge play; leads the ladies\u2019 clinic and simulator winter lessons.',
    stf_5: 'CPGA professional. Adult beginners, Junior Golf clinics and club fitting.'
  };
  const WEEKLY_HOURS = 30;
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(fmt.toDate(d)); }
  function range(t, dur) { return fmt.time(t) + ' to ' + fmt.time(toHM(toMin(t) + dur)); }
  function hrs(m) { const h = m / 60; return (Math.round(h * 10) / 10).toString(); }
  /* Soft hyphens at rough syllable breaks (Pem-ber-ton, Win-slow), so a name in a narrow block wraps
     onto a second line at a sensible point. Hidden unless the line actually breaks there. */
  const ONSET = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|sc|sk|sl|sm|sn|sp|st|sw|tr|wh|ch|sh|th|ph|qu)$/i;
  function softBreaks(name) {
    const w = String(name || '');
    if (w.length < 6 || /[^A-Za-z]/.test(w)) return w;
    const vowel = function (c) { return /[aeiouy]/i.test(c); };
    const cuts = [];
    for (let i = 1; i < w.length - 1; i++) {
      if (!vowel(w[i - 1]) || vowel(w[i])) continue;
      let j = i; while (j < w.length && !vowel(w[j])) j++;
      if (j >= w.length) break;
      const cl = w.slice(i, j);
      const at = cl.length === 1 || /^(ch|sh|th|ph|wh)$/i.test(cl) ? i : (ONSET.test(cl.slice(-2)) && cl.length > 2 ? j - 2 : j - 1);
      if (at >= 3 && w.length - at >= 2) cuts.push(at);
      i = j - 1;
    }
    let out = '', last = 0; cuts.forEach(function (c) { out += w.slice(last, c) + '\u00AD'; last = c; });
    return out + w.slice(last);
  }
  /* Calendar layout for one day: items ({s, e} in minutes) that overlap in time share the width in the
     fewest columns; an item with no overlap gets the full width, and items stretch right into free columns.
     Sets col, span and cols on each item. */
  function layoutDay(items) {
    items.sort(function (a, b) { return a.s - b.s || (b.e - b.s) - (a.e - a.s); });
    let cluster = [], end = -1;
    function place() {
      const lanes = [];
      cluster.forEach(function (it) {
        let c = lanes.findIndex(function (laneEnd) { return laneEnd <= it.s; });
        if (c < 0) { c = lanes.length; lanes.push(0); }
        lanes[c] = it.e; it.col = c;
      });
      cluster.forEach(function (it) {
        it.cols = lanes.length; it.span = 1;
        for (let c = it.col + 1; c < lanes.length; c++) {
          if (cluster.some(function (o) { return o !== it && o.col === c && o.s < it.e && it.s < o.e; })) break;
          it.span++;
        }
      });
    }
    items.forEach(function (it) {
      if (cluster.length && it.s >= end) { place(); cluster = []; end = -1; }
      cluster.push(it); end = Math.max(end, it.e);
    });
    if (cluster.length) place();
    return items;
  }

  function pros() {
    return S.all('staff').filter(function (s) { return /Golf Professional|Director of Golf/.test(s.role || '') && s.status !== 'inactive'; });
  }
  function proIndex(id) { const i = pros().findIndex(function (p) { return p.id === id; }); return i < 0 ? 0 : i % 4; }
  function proFirst(id) { const s = Club.staff.get(id); return s ? s.firstName : 'Pro'; }
  function memberName(id) { const m = Club.members.get(id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }

  /* ---------------- Who pays (Nov 10) ----------------
     A lesson is for a member (memberId) or a non-member (memberId null, guest: { name, phone, email, publicPlayerId? }).
     pays: 'account' (members only: the fee posts to the account when the lesson is completed, as before) or 'shop' (paid at
     the golf shop; always for non-members). A golf shop payment uses the tee sheet's till (Club.teeSheet.takePayment) and is
     kept on the lesson as paid: true, shopPay { id ('lsp_...'), at, by, lines, subtotal, total, discount, gift, method, rest,
     receiptId }. It makes a receipt (source 'lessons', refId the lesson, channel 'counter'); a refund makes the matching
     credit receipt (paymentId + '_r') and puts any gift card part back on the card. */
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function studentName(l) { return l && l.memberId ? memberName(l.memberId) : (l && l.guest && l.guest.name) || 'Non-member'; }
  function atShop(l) { return !!l && (!l.memberId || l.pays === 'shop'); }
  function staffName() { return Club.user ? (Club.user.firstName + ' ' + Club.user.lastName).trim() : 'Golf shop'; }
  function payWord(m) { return m === 'cash' ? 'cash' : m === 'gift' ? 'gift card' : 'card'; }
  function paidLine(sp) {
    if (Club.teeSheet && Club.teeSheet.payLine) return Club.teeSheet.payLine(sp);
    return 'Paid by ' + payWord(sp.method) + ' · ' + fmt.money(sp.total);
  }
  function payText(l) { return !atShop(l) ? 'Charged to the member\u2019s account' : l.paid ? 'Paid at the golf shop' : 'Pays at the golf shop'; }
  function lessonLines(l) { return [{ name: l.type + ' with ' + Club.staff.name(l.proId) + ' (' + l.duration + ' min)', qty: 1, price: r2(l.price) }]; }
  function lessonReceipt(l, sp, kind) {
    if (!Club.receipts) return null;
    const g = sp.gift && sp.gift.amount > 0 ? sp.gift : null, rest = r2(sp.rest), credit = kind === 'credit';
    const tenders = (g ? [{ method: 'gift', amount: g.amount, ref: g.id }] : []).concat(rest > 0 ? [{ method: sp.method === 'cash' ? 'cash' : 'card', amount: rest }] : []);
    const label = g ? 'Gift card ending ' + g.last4 + (rest > 0 ? ' and ' + (sp.method === 'cash' ? 'cash' : 'card') : '') : sp.method === 'cash' ? 'Cash' : 'Card';
    const pp = !l.memberId && l.guest && l.guest.publicPlayerId ? l.guest.publicPlayerId : null;
    return Club.receipts.create({
      memberId: l.memberId || null, publicPlayerId: pp, name: l.memberId || pp ? undefined : studentName(l), kind: credit ? 'credit' : 'sale',
      title: (credit ? 'Lesson refund, ' : 'Lesson, ') + fmt.dateShort(l.date), lines: sp.lines, total: sp.total,
      method: rest > 0 ? (sp.method === 'cash' ? 'cash' : 'card') : 'other', methodLabel: label,
      source: 'lessons', refId: l.id, paymentId: credit ? sp.id + '_r' : sp.id, tenders: tenders, channel: 'counter', fresh: true,
      note: (credit ? 'Refunded at the golf shop. ' : 'Paid at the golf shop. ') + l.type + ' with ' + Club.staff.name(l.proId) + ', ' + fmt.dateShort(l.date) + ' at ' + fmt.time(l.time) + '.' +
        (sp.discount && !credit ? ' Discount: ' + sp.discount.reason + '.' : '')
    });
  }
  /** Record a golf shop payment on a lesson (call inside Club.undo.track). */
  function recordPay(l, pay) {
    const sp = Object.assign({ id: S.uid('lsp'), at: new Date().toISOString(), by: staffName() }, pay);
    if (sp.gift && sp.gift.amount > 0 && Club.giftcards) Club.giftcards.redeem(sp.gift.id, sp.gift.amount, { where: 'proshop', refId: l.id, note: 'Lesson ' + fmt.dateShort(l.date) + ', ' + studentName(l), by: staffName() });
    const rc = lessonReceipt(l, sp, 'sale');
    sp.receiptId = rc ? rc.id : null;
    S.update('lessons', l.id, { paid: true, shopPay: sp });
    return sp;
  }
  /** Refund a lesson's golf shop payment (call inside Club.undo.track). Returns the amount refunded. */
  function refundPay(l) {
    const sp = l && l.shopPay; if (!l || !l.paid || !sp) return 0;
    if (sp.gift && sp.gift.amount > 0 && Club.giftcards) Club.giftcards.refund(sp.gift.id, sp.gift.amount, { where: 'proshop', refId: l.id, note: 'Lesson payment refunded, ' + studentName(l), by: staffName() });
    lessonReceipt(l, sp, 'credit');
    S.update('lessons', l.id, { paid: false, shopPay: null, refunds: (l.refunds || []).concat([{ id: sp.id, total: sp.total, at: new Date().toISOString(), by: staffName() }]) });
    return r2(sp.total);
  }
  /** Open the golf shop till for a lesson v (a saved lesson, or the form's values). */
  function takePay(v, onDone) {
    const T = Club.teeSheet && Club.teeSheet.takePayment;
    if (!T) { ui.toast('The golf shop till could not open. Reload the page and try again.', 'bad'); return; }
    T({ eyebrow: 'Lesson payment', name: studentName(v), kind: v.memberId ? 'Member, paying at the golf shop' : 'Non-member', lines: lessonLines(v), onDone: onDone });
  }

  /* ---------------- Undo (js/core/undo.js) ----------------
     Every staff action's toast offers Undo. undoOffer is Club.undo.offer plus check(), which may refuse first (a second
     guard for the rate card, saved with S.setObj). */
  const CHANGED = 'This has changed since, so it can no longer be undone here.';
  function undoOffer(msg, rec, o) {
    o = o || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg, o.kind); return; }
    ui.toast(msg, o.kind, { action: { label: 'Undo', onClick: function () {
      const why = o.check && o.check(); if (why) { ui.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { if (o.after) o.after(res); } catch (e) { console.error(e); }
      const u = typeof o.undone === 'function' ? o.undone(res) : o.undone;
      ui.toast((u || 'Undone') + (res.credited > 0 ? '. ' + fmt.money(res.credited) + ' credited back' : ''));
    } } });
  }
  function undoRun(fn, o) { const rec = Club.undo.track(fn); const msg = typeof o.message === 'function' ? o.message(rec.result) : o.message; if (msg) undoOffer(msg, rec, o); return rec.result; }
  function objGuard(key) { const snap = JSON.stringify(S.getObj(key, null)); return function () { return JSON.stringify(S.getObj(key, null)) !== snap ? CHANGED : null; }; }
  function dayClosed() { return !!(Club.accounting && Club.accounting.isClosed && Club.accounting.isClosed(Club.date.today())); }
  function programState(p) {
    const today = Club.date.today(); const ss = programSessions(p);
    if (!ss.length) return { key: 'draft', label: 'No sessions' };
    if (today < ss[0]) return { key: 'upcoming', label: 'Starts ' + fmt.dateShort(ss[0]) };
    if (today > ss[ss.length - 1]) return { key: 'finished', label: 'Concluded ' + fmt.dateShort(ss[ss.length - 1]) };
    const wk = ss.filter(function (d) { return d <= today; }).length;
    return { key: 'running', label: 'Week ' + wk + ' of ' + ss.length };
  }
  function programOn(date, coach) {
    return S.where('programs', function (p) { return (!coach || p.coach === coach) && programSessions(p).indexOf(date) >= 0; });
  }

  /* ---------------- Module ---------------- */
  let proFilter = 'all';
  const accOpen = {};                                            /* secondary panels' open state, kept across weeks */

  Club.register({
    id: 'lessons', label: 'Lessons & Academy', icon: 'lesson', section: 'Golf', order: 20,
    badge: function () { const t = Club.date.today(); const n = S.where('lessons', function (l) { return l.date === t && l.status === 'scheduled'; }).length; return n || null; },
    search: function (q) {
      const out = [];
      S.all('programs').forEach(function (p) { if (String(p.name).toLowerCase().indexOf(q) >= 0) out.push({ label: p.name, sub: 'Academy program · ' + p.day + 's with ' + Club.staff.name(p.coach), href: 'lessons', icon: 'lesson' }); });
      const t = Club.date.today(), to = Club.date.fromToday(14);
      S.all('lessons').filter(function (l) { return l.status === 'scheduled' && l.date >= t && l.date <= to; }).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })
        .forEach(function (l) { if (studentName(l).toLowerCase().indexOf(q) >= 0) out.push({ label: studentName(l), sub: l.type + ' · ' + fmt.dateShort(l.date) + ' ' + fmt.time(l.time) + ' with ' + proFirst(l.proId), href: 'lessons/' + l.date, icon: 'lesson' }); });
      return out.slice(0, 6);
    },
    render: render
  });

  function render(view, params) {
    const today = Club.date.today();
    const anchor = validDate(params[0]) ? params[0] : today;
    const week = Club.date.week(anchor);
    const state = { week: week, flash: null };
    const P = pros();
    if (proFilter !== 'all' && !P.some(function (p) { return p.id === proFilter; })) proFilter = 'all';

    view.innerHTML =
      ui.pageHeader({
        eyebrow: 'CPGA professional staff', title: 'Lessons & Academy',
        subtitle: '<span class="ls-sub">' + esc(weekLabel(week)) + '</span> <span class="badge plain ls-rel">' + (week.indexOf(today) >= 0 ? 'This week' : (week[0] > today ? 'Upcoming' : 'Past week')) + '</span>',
        actions: ui.btn('New program', { icon: 'plus', action: 'new-program' }) + ui.btn('Book lesson', { kind: 'primary', icon: 'plus', action: 'book' })
      }) +
      '<div class="ls-stats"></div>' +
      '<section class="panel ls-sched-panel" data-reveal>' +
        '<div class="panel-head ls-sched-head">' +
          '<div class="ls-weeknav">' + ui.btn('', { icon: 'chevronLeft', kind: 'ghost', sm: true, action: 'prev', title: 'Previous week' }) +
            '<button type="button" class="btn btn-sm' + (week.indexOf(today) >= 0 ? ' btn-primary' : '') + '" data-action="this-week">This week</button>' +
            ui.btn('', { icon: 'chevronRight', kind: 'ghost', sm: true, action: 'next', title: 'Next week' }) +
            '<h3 class="ls-weektitle">Teaching schedule</h3></div>' +
          '<div class="ls-profilter"></div>' +
        '</div>' +
        '<div class="ls-sched"></div>' +
        '<div class="ls-legend"></div>' +
      '</section>' +
      '<div class="ls-lower">' +
        '<div class="ls-sec">' +
          secAcc('programs', 'lesson', 'Group programs') +
          secAcc('roster', 'members', 'Professionals') +
          secAcc('rates', 'tag', 'Rate card') +
        '</div>' +
        '<aside class="ls-side">' +
          '<section class="panel ls-today" data-reveal></section>' +
        '</aside>' +
      '</div>';

    function secAcc(id, icon, title) { return '<div class="ls-acc ls-acc-' + id + '" data-sec="' + id + '" data-reveal>' + Portal.accordion({ id: 'ls-acc-' + id, icon: icon, title: title, summary: ' ', body: '', open: !!accOpen[id] }) + '</div>'; }
    function setSec(id, summary, html) { const h = ui.$('[data-sec="' + id + '"]', view); if (!h) return; ui.$('.pk-acc-sum', h).textContent = summary; ui.$('.pk-acc-body', h).innerHTML = html; }
    ui.on(view, 'accordion', '.ls-acc', function (e, a) { accOpen[a.dataset.sec] = e.detail.open; });

    /* ---- data for the visible week ---- */
    function weekLessons() { return S.where('lessons', function (l) { return l.date >= week[0] && l.date <= week[6]; }); }

    function renderStats(animate) {
      const ls = weekLessons(); const live = ls.filter(function (l) { return l.status !== 'cancelled'; });
      const done = ls.filter(function (l) { return l.status === 'completed'; });
      const mins = live.reduce(function (a, l) { return a + (+l.duration || 0); }, 0);
      const rev = live.reduce(function (a, l) { return a + (+l.price || 0); }, 0);
      const doneRev = done.reduce(function (a, l) { return a + (+l.price || 0); }, 0);
      const active = S.all('programs').filter(function (p) { const k = programState(p).key; return k === 'running' || k === 'upcoming'; });
      const enrol = active.reduce(function (a, p) { return a + (p.enrolled || []).length; }, 0);
      const cancelled = ls.length - live.length;
      const host = ui.$('.ls-stats', view);
      host.innerHTML = ui.stats([
        { label: 'Lessons this week', value: live.length, meta: done.length + ' completed' },
        { label: 'Teaching hours', value: Math.round(mins / 6) / 10, decimals: 1, meta: 'Across ' + P.length + ' professionals' },
        { label: 'Lesson revenue', value: rev, prefix: '$', meta: fmt.money0(doneRev) + ' posted' },
        { label: 'Academy enrolment', value: enrol, meta: active.length + ' active programs' },
        { label: 'Cancellations', value: cancelled, meta: cancelled ? 'This week' : 'None this week' }
      ]);
      if (!animate) {
        ui.$$('[data-reveal]', host).forEach(function (n) { n.classList.add('revealed'); });
        ui.$$('[data-count]', host).forEach(function (n) { const dec = +(n.dataset.decimals || 0); n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + Number(n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); });
      }
    }

    function renderRoster() {
      const ls = weekLessons().filter(function (l) { return l.status !== 'cancelled'; });
      const wkMins = ls.reduce(function (a, l) { return a + (+l.duration || 0); }, 0);
      setSec('roster', P.length + ' professionals · ' + hrs(wkMins) + ' teaching hours this week' + (proFilter !== 'all' ? ' · showing ' + proFirst(proFilter) : ''), '<div class="ls-roster">' + P.map(function (p) {
        const mine = ls.filter(function (l) { return l.proId === p.id; });
        const mins = mine.reduce(function (a, l) { return a + (+l.duration || 0); }, 0);
        const rev = mine.reduce(function (a, l) { return a + (+l.price || 0); }, 0);
        const sel = proFilter === p.id;
        return '<button type="button" class="panel ls-pro pc' + (proIndex(p.id) + 1) + (sel ? ' selected' : '') + (proFilter !== 'all' && !sel ? ' dim' : '') + '" data-action="pro" data-id="' + p.id + '" aria-pressed="' + sel + '">' +
          '<div class="ls-pro-top">' + ui.avatar(p.firstName + ' ' + p.lastName, '') + '<div class="ls-pro-id"><div class="ls-pro-name">' + esc(p.firstName + ' ' + p.lastName) + '</div><div class="ls-pro-role">' + esc(p.role) + '</div></div><i class="ls-swatch"></i></div>' +
          '<p class="ls-pro-spec">' + esc(SPECIALTY[p.id] || 'Private instruction for all abilities.') + '</p>' +
          '<div class="ls-pro-metrics"><div><span class="label-caps">Lessons</span><b>' + mine.length + '</b></div><div><span class="label-caps">Hours</span><b>' + hrs(mins) + '</b></div><div><span class="label-caps">Revenue</span><b>' + fmt.money0(rev) + '</b></div></div>' +
          '<div class="bar ls-pro-bar" title="' + hrs(mins) + ' of ' + WEEKLY_HOURS + ' teaching hours"><span style="width:' + Math.min(100, mins / 60 / WEEKLY_HOURS * 100) + '%"></span></div>' +
          '</button>';
      }).join('') + '</div><p class="muted ls-hint">Select a professional to show only their lessons in the schedule.</p>');
    }

    function renderFilter() {
      ui.$('.ls-profilter', view).innerHTML = ui.segmented([{ value: 'all', label: 'All pros' }].concat(P.map(function (p) { return { value: p.id, label: p.firstName }; })), proFilter, 'lspro');
      ui.$('.ls-legend', view).innerHTML = P.map(function (p) { return '<span class="pc' + (proIndex(p.id) + 1) + '"><i></i>' + esc(p.firstName + ' ' + p.lastName) + '</span>'; }).join('') +
        '<span class="ls-leg-prog"><i></i>Academy session</span><span class="ls-leg-done"><i></i>Completed</span><span class="muted ls-leg-hint">Click an open space to book</span>';
    }

    function renderSchedule() {
      const shown = proFilter === 'all' ? P : P.filter(function (p) { return p.id === proFilter; });
      const ls = weekLessons().filter(function (l) { return l.status !== 'cancelled'; });
      const cancelled = weekLessons().filter(function (l) { return l.status === 'cancelled'; });
      let hours = '';
      for (let h = DAY_START; h < DAY_END; h += 60) hours += '<span style="top:' + ((h - DAY_START) / SPAN * 100) + '%">' + fmt.time(toHM(h)).replace(':00', '') + '</span>';
      const heads = week.map(function (d) {
        const n = ls.filter(function (l) { return l.date === d && shown.some(function (p) { return p.id === l.proId; }); }).length;
        return '<div class="ls-dayhead' + (d === today ? ' today' : '') + '"><span class="ls-dh-wk">' + esc(fmt.weekday(d)) + '</span><span class="ls-dh-n serif">' + fmt.toDate(d).getDate() + '</span><span class="ls-dh-c">' + (n ? n + ' lesson' + (n === 1 ? '' : 's') : 'Open') + '</span></div>';
      }).join('');
      const shownIds = shown.map(function (p) { return p.id; });
      const multi = shown.length > 1;
      const widths = [];
      const cols = week.map(function (d) {
        /* Everything on this day as timed items: lessons and academy sessions of the pros shown. */
        const items = ls.filter(function (l) { return l.date === d && shownIds.indexOf(l.proId) >= 0; }).map(function (l) { return { lesson: l, s: toMin(l.time), e: toMin(l.time) + (+l.duration || 60) }; })
          .concat(programOn(d).filter(function (pr) { return shownIds.indexOf(pr.coach) >= 0; }).map(function (pr) { return { prog: pr, s: toMin(pr.time), e: toMin(pr.time) + (pr.duration || 60) }; }));
        layoutDay(items);
        widths.push(items.reduce(function (mx, it) { return Math.max(mx, it.cols); }, 1));
        const blocks = items.map(function (it) {
          const pos = 'top:' + ((it.s - DAY_START) / SPAN * 100) + '%;height:' + ((it.e - it.s) / SPAN * 100) + '%;--col:' + it.col + ';--span:' + it.span + ';--cols:' + it.cols;
          const size = (it.e - it.s) <= 30 ? ' tiny' : ((it.e - it.s) >= 60 ? ' tall' + ((it.e - it.s) >= 90 ? ' xl' : '') : '');
          const tm = '<span class="ls-b-time">' + fmt.time(toHM(it.s)).replace(/ [AP]M/, '') + '</span>';
          if (it.prog) {
            const pr = it.prog;
            return '<button type="button" class="ls-block ls-progblock' + size + '" data-action="program" data-id="' + esc(pr.id) + '" style="' + pos + '" data-tip-title="' + esc(pr.name) + '" data-tip="' + esc('Academy session with ' + Club.staff.name(pr.coach) + ' · ' + range(pr.time, pr.duration || 60) + ' · ' + (pr.enrolled || []).length + ' enrolled') + '">' +
              tm + '<span class="ls-b-who"><span class="ls-b-last">' + esc(pr.name) + '</span></span>' + (multi ? '<span class="ls-b-sub">' + esc(proFirst(pr.coach)) + '</span>' : '') + '</button>';
          }
          const l = it.lesson, gp = !l.memberId && l.guest && l.guest.name ? String(l.guest.name).trim().split(/\s+/) : null;
          const m = l.memberId ? Club.members.get(l.memberId) : gp ? { lastName: gp[gp.length - 1], firstName: gp.length > 1 ? gp[0] : '' } : null;
          /* "Last, F." when it fits; the initial drops out first when the block is narrow */
          const who = '<span class="ls-b-last">' + (m ? esc(softBreaks(m.lastName)) + '</span>' + (m.firstName ? '<span class="ls-b-ini">, ' + esc(String(m.firstName).charAt(0)) + '.</span>' : '') : (l.memberId ? 'Former member' : 'Non-member') + '</span>');
          return '<button type="button" class="ls-block pc' + (proIndex(l.proId) + 1) + ' st-' + l.status + size + (state.flash === l.id ? ' ls-new' : '') + '" data-action="lesson" data-id="' + esc(l.id) + '" style="' + pos + '" data-tip-title="' + esc(studentName(l) + (l.memberId ? '' : ', non-member')) + '" data-tip="' + esc(l.type + ' with ' + Club.staff.name(l.proId) + ' · ' + range(l.time, +l.duration || 60) + (atShop(l) ? ' · ' + payText(l) : '') + (l.status === 'completed' ? ' · Completed' : '')) + '">' +
            tm + '<span class="ls-b-who">' + who + '</span><span class="ls-b-sub">' + esc(multi ? proFirst(l.proId) : l.type) + '</span></button>';
        }).join('');
        let nowLine = '';
        if (d === today) { const n = nowMin(); if (n > DAY_START && n < DAY_END) nowLine = '<span class="ls-now" style="top:' + ((n - DAY_START) / SPAN * 100) + '%" aria-label="Now, ' + esc(fmt.time(toHM(n))) + '"><span class="ls-now-t">' + esc(fmt.time(toHM(n)).replace(/ [AP]M$/, '')) + '</span></span>'; }
        return '<div class="ls-day' + (d === today ? ' today' : '') + (d < today ? ' past' : '') + '" data-date="' + d + '">' + blocks + nowLine + '<span class="ls-ghost" aria-hidden="true"></span></div>';
      }).join('');
      /* Busy days get more width: each day's share follows its most lessons at once, with room for every lane. */
      const tracks = widths.map(function (n) { return 'minmax(max(var(--day-min), calc(' + n + ' * var(--lane-min))), ' + Math.max(2, n) + 'fr)'; }).join(' ');
      ui.$('.ls-sched', view).innerHTML = '<div class="ls-grid' + (multi ? ' multi' : ' single') + '" style="grid-template-columns:var(--hour-col) ' + tracks + '"><div class="ls-corner"></div>' + heads + '<div class="ls-hours">' + hours + '</div>' + cols + '</div>' +
        (cancelled.length ? '<p class="muted ls-cxl">' + cancelled.length + ' cancelled lesson' + (cancelled.length === 1 ? '' : 's') + ' this week are hidden from the grid.</p>' : '');
      state.flash = null;
    }

    function renderToday() {
      const el = ui.$('.ls-today', view);
      const ls = S.where('lessons', function (l) { return l.date === today && l.status !== 'cancelled'; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      const sess = programOn(today).map(function (p) { return { prog: p, time: p.time }; });
      const items = ls.map(function (l) { return { lesson: l, time: l.time }; }).concat(sess).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      const n = nowMin();
      el.innerHTML = '<div class="panel-head"><div><div class="eyebrow">' + esc(fmt.dateLong(today)) + '</div><h3>On the lesson tee today</h3></div></div>' +
        (items.length ? '<ul class="ls-agenda">' + items.map(function (it) {
          if (it.prog) {
            const p = it.prog;
            return '<li><span class="ls-ag-time serif">' + fmt.time(p.time).replace(' ', '<small>') + '</small></span><div class="ls-ag-main"><div class="ls-ag-name">' + esc(p.name) + '</div><div class="ls-ag-sub">' + (p.enrolled || []).length + ' enrolled · ' + esc(Club.staff.name(p.coach)) + '</div></div><span class="badge dark">Academy</span></li>';
          }
          const l = it.lesson; const due = toMin(l.time) + (+l.duration || 60) <= n;
          return '<li><span class="ls-ag-time serif">' + fmt.time(l.time).replace(' ', '<small>') + '</small></span><div class="ls-ag-main"><div class="ls-ag-name">' + esc(studentName(l)) + '</div><div class="ls-ag-sub">' + esc(l.type) + ' · ' + l.duration + ' min · ' + esc(proFirst(l.proId)) + (atShop(l) ? ' · ' + (l.paid ? 'Paid at the shop' : 'Pays at the shop') : '') + '</div></div>' +
            (l.status === 'completed' ? '<span class="ls-ag-done">' + Club.icon('check') + '</span>' : '<button type="button" class="btn btn-sm ls-dark-btn' + (due ? ' due' : '') + '" data-action="complete" data-id="' + esc(l.id) + '">Complete</button>') + '</li>';
        }).join('') + '</ul>' : '<div class="panel-body"><p class="muted ls-quiet">No lessons are booked for today. The teaching bays are free for walk-ins.</p></div>');
    }

    function renderRates() {
      const r = rates();
      setSec('rates', 'Private lesson ' + fmt.money0(r.rates['Private lesson']) + ' per hour · ' + TYPES.length + ' lesson types',
        '<div class="ls-rates-body"><table class="table ls-ratetable"><thead><tr><th>Lesson type</th><th class="num">Rate</th></tr></thead><tbody>' +
        TYPES.map(function (t) { return '<tr><td>' + esc(t) + '</td><td class="num">' + fmt.money0(r.rates[t]) + '</td></tr>'; }).join('') +
        '</tbody></table><div class="ls-prem">' + P.map(function (p) { const v = r.premium[p.id] || 1; return '<div class="row between"><span class="ink-2">' + esc(p.firstName + ' ' + p.lastName) + '</span><span class="num">' + (v === 1 ? 'Standard' : '+' + Math.round((v - 1) * 100) + '%') + '</span></div>'; }).join('') + '</div>' +
        '<div class="ls-acc-acts">' + ui.btn('Edit rate card', { sm: true, icon: 'edit', action: 'rates' }) + '</div></div>');
    }

    function programCard(p) {
      const st = programState(p); const n = (p.enrolled || []).length; const cap = +p.capacity || 0; const left = cap - n;
      const pct = cap ? Math.min(100, n / cap * 100) : 0;
      const capBadge = left <= 0 ? ui.badge('Full', 'bad') : left <= 2 ? ui.badge(left + ' place' + (left === 1 ? '' : 's') + ' left', 'warn') : ui.badge(left + ' places open', 'good');
      const coach = Club.staff.get(p.coach);
      return '<article class="ls-prog st-' + st.key + '" data-id="' + esc(p.id) + '">' +
        '<div class="row between ls-prog-top"><span class="label-caps">' + esc(st.label) + '</span>' + (st.key === 'finished' ? ui.badge('Concluded', 'plain') : capBadge) + '</div>' +
        '<h4 class="ls-prog-name">' + esc(p.name) + '</h4>' +
        '<p class="ls-prog-desc">' + esc(p.description || '') + '</p>' +
        '<dl class="ls-prog-kv"><dt>When</dt><dd>' + esc(p.day) + 's, ' + fmt.time(p.time) + ' · ' + (p.duration || 60) + ' min</dd><dt>Coach</dt><dd>' + esc(coach ? coach.firstName + ' ' + coach.lastName : 'Unassigned') + '</dd><dt>Level</dt><dd>' + esc(p.level || 'All abilities') + '</dd><dt>Fee</dt><dd>' + fmt.money0(p.price) + ' for ' + p.weeks + ' weeks</dd></dl>' +
        '<div class="ls-cap"><div class="row between"><span class="ink-2">' + n + ' of ' + cap + ' enrolled</span><span class="muted">' + Math.round(pct) + '%</span></div><div class="bar' + (left <= 0 ? ' brass' : '') + '"><span style="width:' + pct + '%"></span></div></div>' +
        '<div class="ls-prog-acts">' + ui.btn('Enroll member', { sm: true, kind: left > 0 && st.key !== 'finished' ? 'primary' : '', icon: 'plus', action: 'enroll', id: p.id }) + ui.btn('Roster', { sm: true, icon: 'members', action: 'roster', id: p.id }) + ui.btn('', { sm: true, kind: 'ghost', icon: 'edit', action: 'edit-program', id: p.id, title: 'Edit program' }) + '</div>' +
        '</article>';
    }
    function renderPrograms() {
      const progs = S.all('programs').slice().sort(function (a, b) {
        const o = { running: 0, upcoming: 1, finished: 2, draft: 3 };
        return (o[programState(a).key] - o[programState(b).key]) || (a.startDate < b.startDate ? -1 : 1);
      });
      const live = progs.filter(function (p) { const k = programState(p).key; return k === 'running' || k === 'upcoming'; });
      const enr = live.reduce(function (a, p) { return a + (p.enrolled || []).length; }, 0);
      const openPl = live.reduce(function (a, p) { return a + Math.max(0, (+p.capacity || 0) - (p.enrolled || []).length); }, 0);
      setSec('programs', progs.length ? live.length + ' active · ' + enr + ' enrolled · ' + openPl + ' places open' : 'No programs yet',
        (progs.length ? '<div class="ls-proggrid">' + progs.map(programCard).join('') + '</div><div class="ls-acc-acts">' + ui.btn('New program', { sm: true, icon: 'plus', action: 'new-program' }) + '</div>' :
          ui.empty({ icon: 'lesson', title: 'No academy programs yet', text: 'Create a clinic or school to start taking enrolments.', action: ui.btn('New program', { kind: 'primary', icon: 'plus', action: 'new-program' }) })));
    }

    function refresh() { renderStats(false); renderRoster(); renderFilter(); renderSchedule(); renderToday(); renderPrograms(); renderRates(); }
    /* After an Undo: redraw this page if it is still showing, or the lessons page staff moved to. */
    function again() { if (document.body.contains(view)) refresh(); else if (/^#\/lessons/.test(location.hash)) Club.app.render(); }
    renderStats(true); renderRoster(); renderFilter(); renderSchedule(); renderToday(); renderPrograms(); renderRates();

    /* ---- events ---- */
    ui.on(view, 'click', '[data-action]', function (e, b) {
      const a = b.dataset.action, id = b.dataset.id;
      if (a === 'prev') Club.app.go('lessons/' + Club.date.addDays(week[0], -7));
      else if (a === 'next') Club.app.go('lessons/' + Club.date.addDays(week[0], 7));
      else if (a === 'this-week') Club.app.go('lessons/' + today);
      else if (a === 'book') openLesson({ date: week.indexOf(today) >= 0 ? today : week[0], proId: proFilter !== 'all' ? proFilter : null });
      else if (a === 'lesson') { e.stopPropagation(); const l = S.find('lessons', id); if (l) openLesson({ lesson: l }); }
      else if (a === 'program') { e.stopPropagation(); openRoster(id); }
      else if (a === 'pro') { proFilter = proFilter === id ? 'all' : id; renderRoster(); renderFilter(); renderSchedule(); }
      else if (a === 'complete') completeLesson(id);
      else if (a === 'rates') openRates();
      else if (a === 'new-program') openProgram(null);
      else if (a === 'edit-program') openProgram(S.find('programs', id));
      else if (a === 'enroll') openEnroll(id);
      else if (a === 'roster') openRoster(id);
    });
    ui.on(view, 'click', '.segmented[data-name=lspro] button', function (e, b) { proFilter = b.dataset.value; renderRoster(); renderFilter(); renderSchedule(); });
    /* Empty space in a day books at that time. The pro is the filtered one, or else the first pro free
       for an hour from then (staff can change it in the form). */
    function slotAt(day, e) {
      const r = day.getBoundingClientRect();
      const m = DAY_START + Math.floor(((e.clientY - r.top) / r.height * SPAN) / 15) * 15;
      return Math.max(DAY_START, Math.min(DAY_END - 30, m));
    }
    function proFor(d, m) {
      if (proFilter !== 'all') return proFilter;
      const free = P.find(function (p) {
        return !S.where('lessons', function (l) { return l.date === d && l.proId === p.id && l.status !== 'cancelled' && overlap(m, 60, toMin(l.time), +l.duration || 60); }).length &&
          !programOn(d, p.id).some(function (pr) { return overlap(m, 60, toMin(pr.time), pr.duration || 60); });
      });
      return free ? free.id : null;
    }
    function isPast(d, m) { return d < today || (d === today && m < nowMin()); }
    ui.on(view, 'click', '.ls-day', function (e, day) {
      if (e.target.closest('.ls-block')) return;
      const m = slotAt(day, e), d = day.dataset.date;
      if (isPast(d, m)) { ui.toast('That time has passed. Choose a later slot', 'bad'); return; }
      openLesson({ date: d, time: toHM(m), proId: proFor(d, m) });
    });
    let ghostKey = '';
    view.addEventListener('mousemove', function (e) {
      const day = e.target.closest && e.target.closest('.ls-day');
      ui.$$('.ls-ghost.on', view).forEach(function (g) { if (!day || g.parentNode !== day) g.classList.remove('on'); });
      if (!day) { ghostKey = ''; return; }
      const g = ui.$('.ls-ghost', day); if (!g) return;
      const m = slotAt(day, e), d = day.dataset.date;
      if (e.target.closest('.ls-block') || isPast(d, m)) { g.classList.remove('on'); ghostKey = ''; return; }
      const key = d + m; if (key === ghostKey && g.classList.contains('on')) return; ghostKey = key;
      const pro = proFor(d, m);
      g.style.top = ((m - DAY_START) / SPAN * 100) + '%'; g.style.height = (Math.min(60, DAY_END - m) / SPAN * 100) + '%';
      g.textContent = fmt.time(toHM(m)).replace(/ [AP]M/, '') + ' · ' + (pro ? 'Book with ' + proFirst(pro) : 'Book');
      g.classList.add('on');
    });
    view.addEventListener('mouseleave', function () { ui.$$('.ls-ghost.on', view).forEach(function (g) { g.classList.remove('on'); }); ghostKey = ''; });

    /* ---- lesson modal ---- */
    function conflicts(data, selfId) {
      const errs = [];
      const s = toMin(data.time), d = +data.duration;
      if (s + d > DAY_END) errs.push('Lessons must finish by ' + fmt.time(toHM(DAY_END)) + '.');
      S.where('lessons', function (l) { return l.date === data.date && l.status !== 'cancelled' && l.id !== selfId; }).forEach(function (l) {
        if (!overlap(s, d, toMin(l.time), +l.duration || 60)) return;
        if (l.proId === data.proId) errs.push(Club.staff.name(l.proId) + ' is already teaching ' + range(l.time, l.duration) + ' (' + l.type.toLowerCase() + ' with ' + studentName(l) + ').');
        else if (data.memberId && l.memberId === data.memberId) errs.push(memberName(l.memberId) + ' already has a lesson ' + range(l.time, l.duration) + ' with ' + proFirst(l.proId) + '.');
      });
      programOn(data.date, data.proId).forEach(function (p) { if (overlap(s, d, toMin(p.time), p.duration || 60)) errs.push(Club.staff.name(p.coach) + ' is coaching ' + p.name + ' ' + range(p.time, p.duration || 60) + '.'); });
      return errs;
    }

    function openLesson(o) {
      const l = o.lesson || null; const isEdit = !!l;
      if (isEdit && l.status !== 'scheduled') return openLessonDetail(l);
      const data = isEdit ? l : { date: o.date || today, time: o.time || '09:00', proId: o.proId || (P[0] && P[0].id), memberId: '', type: 'Private lesson', duration: 60, notes: '' };
      const who0 = isEdit && !l.memberId ? 'guest' : 'member', pays0 = isEdit && l.pays === 'shop' ? 'shop' : 'account', g0 = (isEdit && l.guest) || {};
      const times = []; for (let m = DAY_START; m <= DAY_END - 30; m += 15) times.push({ value: toHM(m), label: fmt.time(toHM(m)) });
      if (times.every(function (t) { return t.value !== data.time; })) times.push({ value: data.time, label: fmt.time(data.time) });
      const body = '<form class="ls-form" novalidate><div class="ls-alert" role="alert" hidden></div><div class="form-grid">' +
        '<div class="field span-2 ls-f-who"><label id="ls_who_l">Who is the lesson for?</label>' + ui.segmented([{ value: 'member', label: 'Member' }, { value: 'guest', label: 'Non-member' }], who0, 'who') + '<input type="hidden" name="who" value="' + who0 + '"></div>' +
        '<div class="field span-2" data-for-who="member"><label for="ls_member">Member *</label><select class="select" id="ls_member" name="memberId"' + (who0 === 'member' ? ' required' : '') + '><option value="">Select a member</option>' + Club.members.options(data.memberId) + '</select></div>' +
        '<div class="field span-2" data-for-who="guest"><label for="ls_gname">Name *</label><input class="input" id="ls_gname" name="gname" maxlength="80" autocomplete="off" placeholder="First and last name" value="' + esc(g0.name || '') + '"' + (who0 === 'guest' ? ' required' : '') + '></div>' +
        '<div class="field" data-for-who="guest"><label for="ls_gphone">Phone</label><input class="input" id="ls_gphone" name="gphone" type="tel" autocomplete="off" placeholder="(204) 555-0100" value="' + esc(g0.phone || '') + '"></div>' +
        '<div class="field" data-for-who="guest"><label for="ls_gemail">Email</label><input class="input" id="ls_gemail" name="gemail" type="email" autocomplete="off" placeholder="name@example.com" value="' + esc(g0.email || '') + '"></div>' +
        '<div class="field span-2" data-for-who="member"><label>How will they pay?</label>' + ui.segmented([{ value: 'account', label: 'Charge to account' }, { value: 'shop', label: 'Pay at the golf shop' }], pays0, 'pays') + '<input type="hidden" name="pays" value="' + pays0 + '"></div>' +
        '<div class="span-2 ls-paybox" aria-live="polite"></div>' +
        ui.field({ label: 'Professional', name: 'proId', type: 'select', options: ui.options(P.map(function (p) { return { value: p.id, label: p.firstName + ' ' + p.lastName + ' · ' + p.role }; }), data.proId), required: true }) +
        ui.field({ label: 'Lesson type', name: 'type', type: 'select', options: ui.options(TYPES, data.type), required: true }) +
        ui.field({ label: 'Date', name: 'date', type: 'date', value: data.date, required: true }) +
        ui.field({ label: 'Start time', name: 'time', type: 'select', options: ui.options(times, data.time), required: true }) +
        '<div class="field"><label>Duration</label>' + ui.segmented(DURATIONS.map(function (d) { return { value: String(d), label: d + ' min' }; }), String(data.duration), 'duration') + '<input type="hidden" name="duration" value="' + data.duration + '"></div>' +
        ui.field({ label: 'Price', name: 'price', type: 'number', value: isEdit ? l.price : priceFor(data.type, data.proId, data.duration), min: 0, step: 5, required: true, hint: 'From the rate card. Adjust for packages or courtesy lessons.' }) +
        ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: data.notes, placeholder: 'Focus areas, equipment, follow-ups', span2: true }) +
        '</div></form>';
      const actions = [];
      if (isEdit) actions.push({ label: 'Cancel lesson', kind: 'danger', icon: 'trash', onClick: function (api) { cancelLesson(l, api); return false; } });
      actions.push({ label: isEdit ? 'Close' : 'Cancel', kind: 'ghost' });
      if (isEdit) actions.push({ label: 'Mark completed', kind: 'brass', icon: 'check', onClick: function () { const v = check(); if (!v) return false; return completeLesson(l.id, function () { return save(true); }, v); } });
      actions.push({ label: isEdit ? 'Save changes' : 'Book lesson', kind: 'primary', icon: 'check', onClick: function () { return save(false); } });
      const m = ui.modal({ eyebrow: isEdit ? 'Scheduled · ' + fmt.dateShort(l.date) : 'Academy booking', title: isEdit ? l.type + ' with ' + proFirst(l.proId) : 'Book lesson', size: 'lg', body: body, actions: actions });
      m.el.classList.add('ls-modal');
      const form = ui.$('form', m.body);
      let priceTouched = isEdit;
      function reprice() { if (!priceTouched) form.price.value = priceFor(form.type.value, form.proId.value, +form.duration.value); }
      ui.on(form, 'click', '.segmented button', function (e, b) {
        const seg = b.closest('.segmented'); ui.$$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); });
        form[seg.dataset.name].value = b.dataset.value; reprice();
      });
      form.price.addEventListener('input', function () { priceTouched = true; });
      form.addEventListener('change', function (e) {
        if (e.target.name === 'type' && !isEdit) { const d = TYPE_DUR[form.type.value] || 60; form.duration.value = d; ui.$$('.segmented[data-name=duration] button', form).forEach(function (x) { x.classList.toggle('active', +x.dataset.value === d); }); }
        if (e.target.name === 'type' || e.target.name === 'proId') reprice();
      });
      /* Member or non-member, and how a member pays: show the matching fields and the payment box. */
      function curWho() { return form.who.value === 'guest' ? 'guest' : 'member'; }
      function curShop() { return curWho() === 'guest' || form.pays.value === 'shop'; }
      function syncWho() {
        const w = curWho();
        ui.$$('[data-for-who]', form).forEach(function (x) { x.hidden = x.dataset.forWho !== w; });
        form.memberId.required = w === 'member'; form.gname.required = w === 'guest';
        ui.$$('[data-for-who] .invalid', form).forEach(function (x) { x.classList.remove('invalid'); });
        ui.$$('[data-for-who] .field-error', form).forEach(function (x) { x.remove(); });
        paintPay();
      }
      function paintPay() {
        const box = ui.$('.ls-paybox', form); let h = '';
        if (isEdit && l.paid && l.shopPay) {
          const rc = l.shopPay.receiptId ? S.find('receipts', l.shopPay.receiptId) : null;
          h = '<div class="ls-pay-state is-paid">' + Club.icon('check') + '<div><strong>Paid at the golf shop</strong><span>' + esc(paidLine(l.shopPay) + (rc ? ' · Receipt ' + rc.no : '')) + '</span></div>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-lsp="refund">Refund payment</button></div>';
        } else if (curShop()) {
          h = '<div class="ls-pay-state">' + Club.icon('card') + '<div><strong>' + (curWho() === 'guest' ? 'Non-members pay at the golf shop' : 'Paid at the golf shop') + '</strong><span>Card, cash or gift card. Take it now, or when the lesson is completed.</span></div>' +
            '<button type="button" class="btn btn-sm" data-lsp="take">' + (isEdit ? 'Take payment' : 'Book and take payment') + '</button></div>';
        } else h = '<p class="field-hint ls-pay-hint">The lesson fee posts to the member\u2019s account when the lesson is marked completed.</p>';
        box.innerHTML = h;
      }
      ui.on(form, 'click', '.segmented[data-name=who] button, .segmented[data-name=pays] button', function () { syncWho(); });
      ui.on(form, 'click', '[data-lsp]', function (e, b) {
        if (b.dataset.lsp === 'take') {
          const doc = check(); if (!doc) return;
          m.close();
          takePay(doc, function (pay) {
            let saved = null;
            const rec = Club.undo.track(function () { saved = write(doc); recordPay(saved, pay); return saved; });
            state.flash = saved.id;
            undoOffer((isEdit ? 'Payment of ' : 'Lesson booked and ') + (isEdit ? fmt.money(pay.total) + ' recorded for ' + studentName(saved) : fmt.money(pay.total) + ' paid at the golf shop'), rec, { after: again, undone: isEdit ? 'Payment undone' : 'Booking and payment undone' });
            if (week.indexOf(saved.date) < 0) Club.app.go('lessons/' + saved.date); else refresh();
          });
        } else if (b.dataset.lsp === 'refund') {
          if (dayClosed()) { ui.toast('Today is closed in Accounting. Reopen the day to refund the lesson payment.', 'bad'); return; }
          ui.confirm({ title: 'Refund this payment?', text: fmt.money(l.shopPay.total) + ' paid at the golf shop for ' + studentName(l) + '\u2019s lesson. A credit receipt is made' + (l.shopPay.gift && l.shopPay.gift.amount > 0 ? ' and the gift card part goes back on the card' : '') + '. The lesson stays booked.', confirmLabel: 'Refund payment', danger: true }).then(function (ok) {
            if (!ok) return;
            m.close();
            let back = 0;
            const rec = Club.undo.track(function () { back = refundPay(S.find('lessons', l.id)); });
            state.flash = l.id;
            undoOffer(fmt.money(back) + ' refunded to ' + studentName(l), rec, { after: again, undone: 'Refund undone' });
            refresh();
          });
        }
      });
      syncWho();
      /** Validate the form; returns the lesson's values, or false (errors shown). */
      function check() {
        const al = ui.$('.ls-alert', form); al.hidden = true;
        ui.$$('.invalid', form).forEach(function (x) { x.classList.remove('invalid'); });
        if (!ui.validate(form)) return false;
        const f = ui.formData(form); f.duration = +f.duration;
        const guest = f.who === 'guest';
        if (guest) f.memberId = null;
        const errs = [];
        const mem = guest ? null : Club.members.get(f.memberId);
        if (mem && mem.status === 'suspended') errs.push(memberName(f.memberId) + ' is suspended and cannot book lessons.');
        const gname = String(f.gname || '').replace(/\s+/g, ' ').trim(), gemail = String(f.gemail || '').trim().toLowerCase();
        if (guest && gname.length < 2) { errs.push('Enter the non-member\u2019s name.'); form.gname.classList.add('invalid'); }
        if (guest && gemail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gemail)) { errs.push('Check the email address.'); form.gemail.classList.add('invalid'); }
        const pays = guest ? 'shop' : (f.pays === 'shop' ? 'shop' : 'account');
        if (isEdit && l.paid) {
          if (pays === 'account') errs.push('This lesson is already paid at the golf shop. Refund the payment before charging it to the account.');
          if (r2(f.price) !== r2(l.price)) errs.push('This lesson is already paid at the golf shop. Refund the payment before changing the price.');
        }
        if (!validDate(f.date)) errs.push('Choose a valid date.');
        else if ((!isEdit || f.date !== l.date || f.time !== l.time) && (f.date < today || (f.date === today && toMin(f.time) < nowMin()))) errs.push('That time has already passed. Choose a later slot.');
        if (f.price == null || f.price < 0) { errs.push('Enter a price of zero or more.'); form.price.classList.add('invalid'); }
        const c = conflicts(f, isEdit ? l.id : null);
        if (c.length) { form.time.classList.add('invalid'); }
        const all = errs.concat(c);
        if (all.length) { al.innerHTML = Club.icon('alert') + '<div>' + all.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>'; al.hidden = false; al.scrollIntoView({ block: 'nearest' }); return false; }
        /* A non-member with an online golfer account (same email) gets the receipt there too. */
        const pp = guest && gemail ? (S.all('publicPlayers') || []).find(function (x) { return x && String(x.email || '').toLowerCase() === gemail; }) : null;
        return { date: f.date, time: f.time, duration: f.duration, proId: f.proId, memberId: guest ? null : f.memberId, type: f.type, price: f.price, notes: f.notes, pays: pays,
          guest: guest ? { name: gname, phone: String(f.gphone || '').trim(), email: gemail, publicPlayerId: pp ? pp.id : null } : null };
      }
      function write(doc) { return isEdit ? S.update('lessons', l.id, doc) : S.insert('lessons', Object.assign({}, doc, { status: 'scheduled', charged: false })); }
      function save(quiet) {
        const doc = check(); if (!doc) return false;
        const f = doc;
        /* quiet: Mark completed saves first, inside the completion's own Undo record. */
        const saved = quiet ? write(doc) : undoRun(function () { return write(doc); }, { message: isEdit ? 'Lesson updated' : 'Lesson booked with ' + proFirst(f.proId) + ' on ' + fmt.dateShort(f.date) + ' at ' + fmt.time(f.time),
          after: again, undone: isEdit ? 'Lesson changes undone' : 'Booking removed' });
        state.flash = saved.id;
        if (week.indexOf(f.date) < 0) { m.close(); Club.app.go('lessons/' + f.date); return; }
        if (proFilter !== 'all' && proFilter !== f.proId) proFilter = 'all';
        refresh();
      }
    }

    function openLessonDetail(l) {
      const g = l.guest || {};
      const whoHTML = l.memberId ? '<dt>Member</dt><dd><a href="#/members/' + esc(l.memberId) + '">' + esc(memberName(l.memberId)) + '</a></dd>'
        : '<dt>Non-member</dt><dd>' + esc(studentName(l)) + ([g.phone, g.email].filter(Boolean).length ? '<div class="muted">' + esc([g.phone, g.email].filter(Boolean).join(' · ')) + '</div>' : '') + '</dd>';
      const rc = l.paid && l.shopPay && l.shopPay.receiptId ? S.find('receipts', l.shopPay.receiptId) : null;
      const payHTML = '<dt>Payment</dt><dd>' + (!atShop(l) ? 'Charged to the member\u2019s account' : l.paid && l.shopPay ? esc(paidLine(l.shopPay) + (rc ? ' · Receipt ' + rc.no : '')) : l.status === 'cancelled' ? 'Nothing paid' : ui.badge('Still to pay at the golf shop', 'warn')) + '</dd>';
      const body = '<dl class="kv ls-detail">' + whoHTML + '<dt>Professional</dt><dd>' + esc(Club.staff.name(l.proId)) + '</dd><dt>When</dt><dd>' + esc(fmt.dateLong(l.date)) + ', ' + range(l.time, l.duration) + '</dd><dt>Price</dt><dd>' + fmt.money(l.price) + '</dd>' + payHTML + '<dt>Status</dt><dd>' + (l.status === 'completed' ? ui.badge('Completed', 'good') : ui.badge('Cancelled', 'bad')) + '</dd>' + (l.notes ? '<dt>Notes</dt><dd>' + esc(l.notes) + '</dd>' : '') + '</dl>' +
        '<p class="muted ls-detail-note">' + (l.status === 'completed' ? (atShop(l) ? 'This lesson is paid at the golf shop. Back to booked keeps the payment; refund it here if needed.' : 'The lesson fee was posted to the member’s account when it was completed. Back to booked reverses it with a credit.') : 'This lesson was cancelled and no fee was charged.') + '</p>';
      const actions = [{ label: 'Close', kind: 'ghost' }];
      if (l.paid && l.shopPay) actions.push({ label: 'Refund payment', kind: 'ghost', onClick: function () {
        if (dayClosed()) { ui.toast('Today is closed in Accounting. Reopen the day to refund the lesson payment.', 'bad'); return false; }
        ui.confirm({ title: 'Refund this payment?', text: fmt.money(l.shopPay.total) + ' paid at the golf shop for ' + studentName(l) + '\u2019s lesson. A credit receipt is made.', confirmLabel: 'Refund payment', danger: true }).then(function (ok) {
          if (!ok) return; let back = 0;
          const rec = Club.undo.track(function () { back = refundPay(S.find('lessons', l.id)); });
          state.flash = l.id; undoOffer(fmt.money(back) + ' refunded to ' + studentName(l), rec, { after: again, undone: 'Refund undone' }); refresh();
        });
      } });
      if (l.status === 'completed' && atShop(l) && !l.paid && +l.price > 0) actions.push({ label: 'Take payment', kind: 'primary', icon: 'check', onClick: function () {
        takePay(l, function (pay) {
          const rec = Club.undo.track(function () { recordPay(S.find('lessons', l.id), pay); });
          state.flash = l.id; undoOffer('Payment of ' + fmt.money(pay.total) + ' recorded for ' + studentName(l), rec, { after: again, undone: 'Payment undone' }); refresh();
        });
      } });
      /* Step back for later corrections: a completed lesson returns to booked and its posted fee is reversed. */
      if (l.status === 'completed') actions.push({ label: 'Back to booked', kind: 'ghost', icon: 'refresh', onClick: function () { return uncompleteLesson(l.id); } });
      if (l.status === 'cancelled' && (l.date > today || (l.date === today && toMin(l.time) > nowMin()))) actions.push({ label: 'Restore lesson', kind: 'primary', onClick: function () {
        const c = conflicts(l, l.id); if (c.length) { ui.toast(c[0], 'bad'); return false; }
        undoRun(function () { return S.update('lessons', l.id, { status: 'scheduled' }); }, { message: 'Lesson restored', after: again, undone: 'Lesson cancelled again' });
        state.flash = l.id; refresh();
      } });
      ui.modal({ eyebrow: l.status === 'completed' ? 'Completed lesson' : 'Cancelled lesson', title: l.type, body: body, actions: actions });
    }

    /** Complete a lesson and post its fee. pre: a save to run first in the same Undo record (false stops); v: the values
        that save will write (the form's), so a golf shop lesson is paid for at its new price.
        A lesson paid at the golf shop and not paid yet opens the till first: completing it takes the payment. */
    function completeLesson(id, pre, v) {
      const l0 = S.find('lessons', id); if (!l0 || l0.status !== 'scheduled') return;
      const val = v || l0;
      if (atShop(val) && !l0.paid && +val.price > 0) {
        takePay(Object.assign({}, l0, val), function (pay) { finishComplete(id, pre, pay); });
        return;
      }
      return finishComplete(id, pre, null);
    }
    function finishComplete(id, pre, pay) {
      const l0 = S.find('lessons', id); if (!l0 || l0.status !== 'scheduled') return;
      let posted = null;
      const rec = Club.undo.track(function () {
        if (pre && pre() === false) return false;
        const l = S.find('lessons', id); if (!l || l.status !== 'scheduled') return false;
        if (pay) recordPay(l, pay);
        else if (!atShop(l) && !l.charged && +l.price > 0) posted = Club.chargeMember(l.memberId, { description: l.type + ' with ' + Club.staff.name(l.proId) + ' (' + l.duration + ' min)', category: 'Lessons', amount: l.price, source: 'lessons', refId: l.id, date: l.date, title: 'Lesson' });
        S.update('lessons', id, { status: 'completed', charged: !!posted || !!l.charged });
        return true;
      });
      if (rec.result !== true) return false;
      state.flash = id; refresh();
      undoOffer('Lesson completed' + (posted ? '. ' + fmt.money(posted.amount) + ' posted to ' + memberName(l0.memberId) : pay ? '. ' + fmt.money(pay.total) + ' paid at the golf shop' : ''), rec, { after: again, undone: 'Lesson back to booked' });
    }
    /** Completed back to booked: the fee posted for it is reversed with a credit receipt (nothing is deleted). */
    function uncompleteLesson(id) {
      const l = S.find('lessons', id); if (!l || l.status !== 'completed') return;
      const fees = S.where('charges', function (c) { return c.source === 'lessons' && c.refId === id && +c.amount > 0 && !c.reversedBy; });
      if (fees.length && dayClosed()) { ui.toast('Today is closed in Accounting. Reopen the day to reverse the lesson fee.', 'bad'); return false; }
      let credited = 0;
      const rec = Club.undo.track(function () {
        fees.forEach(function (c) { if (Club.undo.reverseCharge(c.id, { title: 'Lesson correction' })) credited += +c.amount; });
        /* Older lessons were marked charged without a ledger entry: they stay marked so completing again does not bill twice. */
        S.update('lessons', id, { status: 'scheduled', charged: fees.length ? false : !!l.charged });
      });
      state.flash = id; refresh();
      undoOffer(studentName(l) + '’s lesson is back to booked' + (credited ? '. ' + fmt.money(credited) + ' credited back' : ''), rec, { after: again, undone: 'Lesson completed again' });
    }
    function cancelLesson(l, api) {
      const paid = l.paid && l.shopPay ? r2(l.shopPay.total) : 0;
      if (paid && dayClosed()) { ui.toast('Today is closed in Accounting. Reopen the day to refund the lesson payment.', 'bad'); return; }
      ui.confirm({ title: 'Cancel this lesson?', text: l.type + ' for ' + studentName(l) + ' with ' + Club.staff.name(l.proId) + ', ' + fmt.dateShort(l.date) + ' at ' + fmt.time(l.time) + '. ' + (paid ? 'The ' + fmt.money(paid) + ' paid at the golf shop is refunded with a credit receipt.' : 'No fee will be charged.'), confirmLabel: 'Cancel lesson', danger: true }).then(function (ok) {
        if (!ok) return;
        undoRun(function () { const cur = S.find('lessons', l.id); if (cur && cur.paid) refundPay(cur); return S.update('lessons', l.id, { status: 'cancelled' }); }, { message: paid ? 'Lesson cancelled and ' + fmt.money(paid) + ' refunded' : 'Lesson cancelled', after: again, undone: 'Lesson restored' });
        api.close(); refresh();
      });
    }

    /* ---- rate card ---- */
    function openRates() {
      const r = rates();
      const body = '<form class="ls-form" novalidate><div class="label-caps ls-fhead">Hourly rate by lesson type</div><div class="form-grid">' +
        TYPES.map(function (t, i) { return ui.field({ label: t, name: 'rate_' + i, type: 'number', value: r.rates[t], min: 0, step: 5, required: true }); }).join('') +
        '</div><div class="label-caps ls-fhead">Professional premium</div><div class="form-grid">' +
        P.map(function (p) { return ui.field({ label: p.firstName + ' ' + p.lastName, name: 'prem_' + p.id, type: 'number', value: Math.round(((r.premium[p.id] || 1) - 1) * 100), min: 0, max: 200, step: 5, hint: 'Percent above the base rate' }); }).join('') +
        '</div><p class="muted ls-hint">New rates apply to lessons booked from now on. Existing bookings keep their price.</p></form>';
      const m = ui.modal({ eyebrow: 'Academy pricing', title: 'Rate card', body: body, size: 'lg', actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save rate card', kind: 'primary', icon: 'check', onClick: function () {
        const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
        const f = ui.formData(form); const out = { rates: {}, premium: {} };
        let bad = false;
        TYPES.forEach(function (t, i) { const v = f['rate_' + i]; if (v == null || v < 0) bad = true; out.rates[t] = v; });
        P.forEach(function (p) { const v = f['prem_' + p.id] || 0; if (v < 0) bad = true; out.premium[p.id] = Math.round((1 + v / 100) * 100) / 100; });
        if (bad) { ui.toast('Rates must be zero or more', 'bad'); return false; }
        const rec = Club.undo.track(function () { S.setObj('lessonRates', out); });
        renderRates(); undoOffer('Rate card saved', rec, { check: objGuard('lessonRates'), after: again, undone: 'Rate card changes undone' });
      } }] });
    }

    /* ---- programs ---- */
    function openProgram(p) {
      const isEdit = !!p;
      const d = p || { name: '', coach: P[0] && P[0].id, day: 'Saturday', time: '09:00', duration: 60, weeks: 6, startDate: alignTo(Club.date.fromToday(7), 'Saturday'), capacity: 10, price: 400, level: '', description: '', enrolled: [] };
      const times = []; for (let m = DAY_START; m <= DAY_END - 60; m += 15) times.push({ value: toHM(m), label: fmt.time(toHM(m)) });
      const body = '<form class="ls-form" novalidate><div class="ls-alert" role="alert" hidden></div><div class="form-grid">' +
        ui.field({ label: 'Program name', name: 'name', value: d.name, required: true, span2: true, placeholder: 'e.g. Spring Junior Golf clinic' }) +
        ui.field({ label: 'Coach', name: 'coach', type: 'select', options: ui.options(P.map(function (x) { return { value: x.id, label: x.firstName + ' ' + x.lastName }; }), d.coach), required: true }) +
        ui.field({ label: 'Level', name: 'level', value: d.level, placeholder: 'e.g. Ages 8 to 14' }) +
        ui.field({ label: 'Day', name: 'day', type: 'select', options: ui.options(DAYS.slice(1).concat(['Sunday']), d.day), required: true }) +
        ui.field({ label: 'Start time', name: 'time', type: 'select', options: ui.options(times, d.time), required: true }) +
        ui.field({ label: 'Session length (min)', name: 'duration', type: 'select', options: ui.options(['60', '90', '120'], String(d.duration || 60)) }) +
        ui.field({ label: 'First session', name: 'startDate', type: 'date', value: d.startDate, required: true }) +
        ui.field({ label: 'Weeks', name: 'weeks', type: 'number', value: d.weeks, min: 1, max: 52, step: 1, required: true }) +
        ui.field({ label: 'Capacity', name: 'capacity', type: 'number', value: d.capacity, min: 1, max: 60, step: 1, required: true }) +
        ui.field({ label: 'Program fee', name: 'price', type: 'number', value: d.price, min: 0, step: 5, required: true }) +
        ui.field({ label: 'Description', name: 'description', type: 'textarea', value: d.description, span2: true }) +
        '</div></form>';
      const actions = [];
      if (isEdit) actions.push({ label: 'Delete program', kind: 'danger', icon: 'trash', onClick: function (api) {
        ui.confirm({ title: 'Delete ' + p.name + '?', text: 'The program and its roster of ' + (p.enrolled || []).length + ' members will be removed. Fees already posted stay on member accounts.', confirmLabel: 'Delete program', danger: true }).then(function (ok) {
          if (!ok) return;
          undoRun(function () { S.remove('programs', p.id); }, { message: 'Program deleted', after: again, undone: p.name + ' restored with its roster' });
          api.close(); refresh();
        });
        return false;
      } });
      actions.push({ label: 'Cancel', kind: 'ghost' });
      actions.push({ label: isEdit ? 'Save program' : 'Create program', kind: 'primary', icon: 'check', onClick: function () {
        const form = ui.$('form', m.body); const al = ui.$('.ls-alert', form); al.hidden = true;
        if (!ui.validate(form)) return false;
        const f = ui.formData(form); const errs = [];
        f.duration = +f.duration || 60;
        if (!validDate(f.startDate)) errs.push('Choose a valid first session date.');
        else if (dayName(f.startDate) !== f.day) { errs.push('The first session falls on a ' + dayName(f.startDate) + '. Choose a ' + f.day + ', such as ' + fmt.dateShort(alignTo(f.startDate, f.day)) + '.'); form.startDate.classList.add('invalid'); }
        if (!(f.weeks >= 1)) errs.push('Run the program for at least one week.');
        if (!(f.capacity >= 1)) errs.push('Capacity must be at least one place.');
        else if (isEdit && f.capacity < (p.enrolled || []).length) { errs.push('Capacity cannot be below the ' + p.enrolled.length + ' members already enrolled.'); form.capacity.classList.add('invalid'); }
        if (f.price == null || f.price < 0) errs.push('Enter a fee of zero or more.');
        if (toMin(f.time) + f.duration > DAY_END) errs.push('Sessions must finish by ' + fmt.time(toHM(DAY_END)) + '.');
        if (errs.length) { al.innerHTML = Club.icon('alert') + '<div>' + errs.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + '</div>'; al.hidden = false; return false; }
        const doc = { name: f.name, coach: f.coach, day: f.day, time: f.time, duration: f.duration, weeks: f.weeks, startDate: f.startDate, capacity: f.capacity, price: f.price, level: f.level, description: f.description };
        undoRun(function () { return isEdit ? S.update('programs', p.id, doc) : S.insert('programs', Object.assign(doc, { enrolled: [] })); },
          { message: isEdit ? 'Program saved' : 'Program created. Enrolment is open', after: again, undone: isEdit ? 'Program changes undone' : 'Program removed' });
        refresh();
      } });
      const m = ui.modal({ eyebrow: 'Academy', title: isEdit ? 'Edit program' : 'New program', body: body, size: 'lg', actions: actions });
      m.el.classList.add('ls-modal');
    }

    function openEnroll(id) {
      const p = S.find('programs', id); if (!p) return;
      const n = (p.enrolled || []).length; const full = n >= p.capacity; const done = programState(p).key === 'finished';
      const opts = Club.store.all('members').filter(function (mm) { return (p.enrolled || []).indexOf(mm.id) < 0 && mm.status === 'active'; })
        .sort(function (a, b) { return a.lastName.localeCompare(b.lastName); })
        .map(function (mm) { return '<option value="' + mm.id + '">' + esc(mm.lastName + ', ' + mm.firstName) + ' · #' + mm.memberNo + '</option>'; }).join('');
      const body = '<form class="ls-form" novalidate>' +
        (full || done ? '<div class="ls-alert" role="alert">' + Club.icon('alert') + '<div>' + (done ? 'This program has concluded. Enrolment is closed.' : 'All ' + p.capacity + ' places are taken. Raise the capacity in the program settings to add more members.') + '</div></div>' : '') +
        '<div class="ls-enroll-sum"><span class="label-caps">' + esc(p.day) + 's · ' + fmt.time(p.time) + '</span><span class="serif">' + (p.capacity - n) + ' of ' + p.capacity + ' places open</span></div>' +
        '<div class="field"><label for="ls_enr">Member *</label><select class="select" id="ls_enr" name="memberId" required' + (full || done ? ' disabled' : '') + '><option value="">Select a member</option>' + opts + '</select></div>' +
        '<label class="check"><input type="checkbox" name="charge" checked' + (full || done ? ' disabled' : '') + '> Post the ' + fmt.money0(p.price) + ' program fee to the member’s account</label></form>';
      const actions = [{ label: 'Cancel', kind: 'ghost' }];
      if (!full && !done) actions.push({ label: 'Enroll member', kind: 'primary', icon: 'check', onClick: function () {
        const form = ui.$('form', m.body); if (!ui.validate(form)) return false;
        const f = ui.formData(form); const cur = S.find('programs', id);
        if ((cur.enrolled || []).indexOf(f.memberId) >= 0) { ui.toast('Already enrolled', 'bad'); return false; }
        if ((cur.enrolled || []).length >= cur.capacity) { ui.toast('The program is full', 'bad'); return false; }
        undoRun(function () {
          S.update('programs', id, { enrolled: (cur.enrolled || []).concat([f.memberId]) });
          if (f.charge && +cur.price > 0) Club.chargeMember(f.memberId, { description: 'Academy: ' + cur.name, category: 'Lessons', amount: cur.price, source: 'lessons', refId: cur.id, title: 'Academy program', lines: [{ name: cur.name, qty: 1, price: +cur.price }] });
        }, { message: memberName(f.memberId) + ' enrolled in ' + cur.name + (f.charge && +cur.price > 0 ? '. ' + fmt.money0(cur.price) + ' posted' : ''), after: again, undone: memberName(f.memberId) + ' taken off the roster' });
        refresh();
      } });
      const m = ui.modal({ eyebrow: p.name, title: 'Enroll member', body: body, actions: actions });
    }

    function openRoster(id) {
      const p = S.find('programs', id); if (!p) return;
      const d = ui.drawer({ eyebrow: 'Academy roster', title: p.name, body: '', actions: [{ label: 'Close', kind: 'ghost' }, { label: 'Enroll member', kind: 'primary', icon: 'plus', onClick: function () { setTimeout(function () { openEnroll(id); }, 200); } }] });
      function draw() {
        const cur = S.find('programs', id); if (!cur) { d.close(); return; }
        const st = programState(cur); const list = cur.enrolled || [];
        d.body.innerHTML = '<div class="ls-r-sum"><div><span class="label-caps">Coach</span><div>' + esc(Club.staff.name(cur.coach)) + '</div></div><div><span class="label-caps">Schedule</span><div>' + esc(cur.day) + 's, ' + fmt.time(cur.time) + '</div></div><div><span class="label-caps">Status</span><div>' + esc(st.label) + '</div></div></div>' +
          '<div class="ls-cap"><div class="row between"><span class="ink-2">' + list.length + ' of ' + cur.capacity + ' places filled</span></div><div class="bar"><span style="width:' + Math.min(100, list.length / cur.capacity * 100) + '%"></span></div></div>' +
          (list.length ? '<ul class="list ls-r-list">' + list.map(function (mid) {
            const mem = Club.members.get(mid); const tier = Club.members.tier(mem);
            return '<li>' + ui.person(memberName(mid), mem ? '#' + mem.memberNo + (tier ? ' · ' + esc(tier.name) : '') : 'No longer on the roll') + '<span style="flex:1"></span>' + ui.btn('Remove', { sm: true, kind: 'ghost', action: 'unenroll', id: mid }) + '</li>';
          }).join('') + '</ul>' : ui.empty({ icon: 'members', title: 'Nobody enrolled yet', text: 'Enroll members to fill this program.' }));
      }
      draw();
      ui.on(d.body, 'click', '[data-action=unenroll]', function (e, b) {
        const mid = b.dataset.id;
        ui.confirm({ title: 'Remove ' + memberName(mid) + '?', text: 'They will be taken off the ' + p.name + ' roster. Any program fee already posted is not refunded automatically.', confirmLabel: 'Remove member', danger: true }).then(function (ok) {
          if (!ok) return;
          const cur = S.find('programs', id); if (!cur) return;
          undoRun(function () { S.update('programs', id, { enrolled: (cur.enrolled || []).filter(function (x) { return x !== mid; }) }); },
            { message: memberName(mid) + ' removed from ' + cur.name, after: function () { if (document.body.contains(d.body)) draw(); again(); }, undone: memberName(mid) + ' is back on the roster' });
          draw(); refresh();
        });
      });
    }

    const timer = setInterval(function () { if (document.body.contains(view) && week.indexOf(today) >= 0) { const n = ui.$('.ls-now', view); const v = nowMin(); if (n && v > DAY_START && v < DAY_END) { n.style.top = ((v - DAY_START) / SPAN * 100) + '%'; const t = ui.$('.ls-now-t', n); if (t) t.textContent = fmt.time(toHM(v)).replace(/ [AP]M$/, ''); n.setAttribute('aria-label', 'Now, ' + fmt.time(toHM(v))); } } }, 60000);
    return function () { clearInterval(timer); };
  }

  function weekLabel(week) {
    const a = fmt.toDate(week[0]), b = fmt.toDate(week[6]);
    const m1 = a.toLocaleDateString('en-US', { month: 'long' }), m2 = b.toLocaleDateString('en-US', { month: 'long' });
    return 'Week of ' + m1 + ' ' + a.getDate() + ' to ' + (m1 === m2 ? '' : m2 + ' ') + b.getDate() + ', ' + b.getFullYear();
  }
})();
