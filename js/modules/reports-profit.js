/* Reports section: Profit (Nov 23, 2026). Registers through Club.reports.addSection (js/modules/reports.js), right after
   Revenue. Money in per department comes from the Revenue rows (ctx.rows, r.revenue[deptKey]); costs come from the
   monthly costs the bookkeeper enters under Accounting, Monthly costs (Club.costs, js/shared/costs-data.js). Nothing is
   assumed about costs: a month without a record shows money in only, and profit counts only the months with costs.

   Costs are kept by the month. When the period covers part of a month (month to date, a custom range, a day view) that
   month's costs are counted by day: 22 of November's 30 days count 22/30 of its costs. Every amount is rounded to whole
   dollars per department and month before it is added up, so the department table, the monthly chart and the headline
   figures always agree.

   "Money left on the table" lists figures from the club's own records, each saying what it assumes: empty places in
   public weekday hours on the quietest weekdays (Club.teeRules), members who charged nothing beyond dues (the Unpaid
   accounts section's spend data), open places at upcoming events and clinics, balances more than 60 days old (the Unpaid
   accounts section's ageing), promo code discounts (Club.promos records), guest and public no-shows not charged and
   public golfers turned away from full tee times (the Golf section's data). An item with nothing behind it is left out.
   Styles: css/modules/reports-profit.css. */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc, H = Club.reports.h;
  const num = H.num, sum = H.sum, plural = H.plural, ms = H.moneyShort, all = H.all;

  /* ---------------- Departments ---------------- */
  /* Departments with costs of their own, in Club.costs order and wording; dues have none; shared costs have no money in. */
  const FALLBACK = [{ key: 'dining', label: 'Dining' }, { key: 'golf', label: 'Golf' }, { key: 'events', label: 'Events' }, { key: 'proShop', label: 'Pro shop' }, { key: 'lessons', label: 'Lessons' }, { key: 'shared', label: 'Shared costs' }];
  function costDepts() { return ((Club.costs && Club.costs.DEPTS) || FALLBACK).filter(function (d) { return d.key !== 'shared'; }); }
  function costKeys() { return ((Club.costs && Club.costs.DEPTS) || FALLBACK).map(function (d) { return d.key; }); }
  const REV_KEYS = ['dues', 'golf', 'proShop', 'dining', 'events', 'lessons'];
  const PAGE = { dues: 'billing', golf: 'teesheet', proShop: 'proshop', dining: 'dining', events: 'events', lessons: 'lessons', shared: null };
  const PAGE_LABEL = { billing: 'Open billing', teesheet: 'Open the tee sheet', proshop: 'Open the pro shop', dining: 'Open dining', events: 'Open events', lessons: 'Open lessons' };
  function deptLabel(k) { if (k === 'dues') return 'Dues'; const d = ((Club.costs && Club.costs.DEPTS) || FALLBACK).filter(function (x) { return x.key === k; })[0]; return d ? d.label : k; }

  /* ---------------- Small helpers ---------------- */
  function daysIn(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate(); }
  function monthName(k) { return H.monthLong(k).split(' ')[0]; }
  function signed(v) { return v < 0 ? '-' + ms(-v) : ms(v); }
  function signed0(v) { return v < 0 ? '-' + F.money0(-v) : F.money0(v); }
  /** "3 months": the count and its word (H.plural gives the word alone). */
  function pl(n, one, many) { return F.num(n) + ' ' + plural(n, one, many); }
  function pctTxt(n, d) { return d ? Math.round(n / d * 100) + '%' : ''; }
  function lower(s) { s = String(s || ''); return s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function toMin(t) { return H.toMin(t); }
  function hhmm(m) { return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60); }
  function wdOf(d) { return (F.toDate(d).getDay() + 6) % 7; }   /* Monday 0 */
  const WD_PL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
  function secData(id, key, ctx) { const s = Club.reports.get(id); return s && s.data && s.data[key] ? s.data[key](ctx) : null; }
  /** "December to March" for a run of calendar months, otherwise "December, February and March". */
  function monthsText(list) {
    if (!list.length) return '';
    let run = true;
    for (let i = 1; i < list.length; i++) if (H.shiftKey(list[i - 1].key, 1) !== list[i].key) run = false;
    if (run && list.length >= 3) return monthName(list[0].key) + ' to ' + monthName(list[list.length - 1].key);
    return H.joinAnd(list.map(function (m) { return monthName(m.key); }));
  }
  /** Where staff enter monthly costs: the Accounting tab the costs module registers, else Accounting itself. */
  function costsHref() {
    const q = Array.isArray(window.__accountingTabs) ? window.__accountingTabs : [];
    const t = q.filter(function (x) { return x && x.id && /cost/i.test(x.id + ' ' + (x.label || '')); })[0];
    return '#/accounting' + (t ? '/' + t.id : '');
  }

  /* ==================================================================================================
     The period's months: money in from the Revenue rows, costs from Club.costs
     ================================================================================================== */
  function profitData(ctx) {
    return H.memo(ctx, 'profit', function () {
      const T = D.today(), byKey = {}, months = [];
      ctx.rows.forEach(function (r) {
        const k = String(r.key).slice(0, 7);
        let m = byKey[k];
        if (!m) { m = byKey[k] = { key: k, rows: [], days: 0, rev: {}, toDate: false }; REV_KEYS.forEach(function (x) { m.rev[x] = 0; }); months.push(m); }
        m.rows.push(r);
        m.days += r.days || H.spanDays(r.from, r.to);
        REV_KEYS.forEach(function (x) { m.rev[x] += num(r.revenue && r.revenue[x]); });
        if (r.mtd || r.to === T) m.toDate = true;
      });
      const C = Club.costs, keys = costKeys();
      months.forEach(function (m) {
        REV_KEYS.forEach(function (x) { m.rev[x] = Math.round(m.rev[x]); });
        m.revTotal = sum(REV_KEYS, function (x) { return m.rev[x]; });
        m.dim = daysIn(m.key);
        m.frac = Math.min(1, m.days / m.dim);
        m.part = m.frac < 0.999;
        m.label = H.monthLabel(m.key);
        const t = C ? C.totals(m.key) : null;
        if (!t) { m.costed = false; return; }
        m.costed = true; m.example = !!t.example;
        m.cost = {}; keys.forEach(function (x) { m.cost[x] = Math.round(num(t[x]) * m.frac); });
        m.costTotal = sum(keys, function (x) { return m.cost[x]; });
        m.profit = m.revTotal - m.costTotal;
        const doc = C.get(m.key) || { depts: {} };
        m.lines = {};
        keys.forEach(function (x) {
          const list = ((doc.depts && doc.depts[x]) || []).map(function (l) { return { label: l.label, amount: num(l.amount) * m.frac }; });
          if (x === 'proShop' && t.stockAuto > 0) list.push({ label: 'Stock sold (from product costs)', amount: t.stockAuto * m.frac });
          m.lines[x] = list;
        });
      });
      const costed = months.filter(function (m) { return m.costed; }), missing = months.filter(function (m) { return !m.costed; });
      const d = {
        months: months, costed: costed, missing: missing, example: costed.some(function (m) { return m.example; }),
        moneyIn: sum(months, function (m) { return m.revTotal; }),
        inCosted: sum(costed, function (m) { return m.revTotal; }),
        costs: sum(costed, function (m) { return m.costTotal; }),
        costedMonths: sum(costed, function (m) { return m.frac; })   /* month equivalents, for "a month" rates */
      };
      d.profit = d.inCosted - d.costs;
      /* Departments: money in and costs over the months with costs entered. */
      const rows = costDepts().map(function (x) { return deptRow(x.key, costed); });
      rows.sort(function (a, b) { return b.in - a.in; });
      rows.push(deptRow('dues', costed));
      d.depts = rows;
      d.shared = deptRow('shared', costed);
      d.maxAbs = Math.max.apply(null, rows.concat([d.shared]).map(function (r) { return Math.abs(r.profit); }).concat([1]));
      return d;
    });
  }
  function deptRow(k, costed) {
    const r = { key: k, label: deptLabel(k), in: 0, cost: 0, lines: [] };
    const lines = {}, order = [];
    costed.forEach(function (m) {
      if (k !== 'shared') r.in += num(m.rev[k]);
      if (k !== 'dues') {
        r.cost += num(m.cost[k]);
        (m.lines[k] || []).forEach(function (l) { if (!(l.label in lines)) { lines[l.label] = 0; order.push(l.label); } lines[l.label] += l.amount; });
      }
    });
    r.lines = order.map(function (l) { return { label: l, amount: Math.round(lines[l]) }; }).filter(function (l) { return l.amount > 0; });
    r.profit = r.in - r.cost;
    r.margin = r.in ? r.profit / r.in : null;
    return r;
  }
  function linesText(r) {
    if (r.key === 'dues') return 'No costs of their own';
    if (!r.lines.length) return r.cost ? '' : 'No costs entered';
    return r.lines.map(function (l, i) { return (i ? lower(l.label) : l.label) + ' ' + ms(l.amount); }).join(', ');
  }

  /* ==================================================================================================
     Money left on the table
     ================================================================================================== */
  /* Empty places in public weekday hours (Monday to Thursday, the hours Club.teeRules opens to public golfers at the
     weekday rate) on days the tee sheet was in use, blocked times taken off. */
  function teeGaps(ctx) {
    const R = Club.teeRules; if (!R) return null;
    const T = D.today(), DEAD = H.DEAD;
    const st = Object.assign({ interval: 9, first: '06:30', last: '19:00' }, Club.store.getObj('teeSheetSettings', {}) || {});
    const step = Math.max(5, +st.interval || 9), times = [];
    for (let m = toMin(st.first); m <= toMin(st.last); m += step) times.push(m);
    const dates = {}, players = {};
    all('teeTimes').forEach(function (t) {
      if (!t || !t.date || t.date < ctx.from || t.date > ctx.to || t.date >= T) return;
      dates[t.date] = 1;
      if (DEAD[t.status]) return;
      const s = R.publicSlot(t.date, t.time);
      if (s.ok && s.band === 'weekday') players[t.date] = (players[t.date] || 0) + (t.players || []).length;
    });
    const blocks = {}; all('teeBlocks').forEach(function (b) { if (b && b.date && dates[b.date]) (blocks[b.date] = blocks[b.date] || []).push(b); });
    const wd = [0, 1, 2, 3].map(function () { return { days: 0, cap: 0, players: 0, fee: 0 }; });
    Object.keys(dates).forEach(function (d) {
      const w = wdOf(d); if (w > 3 || (R.isHoliday && R.isHoliday(d))) return;
      const open = times.filter(function (m) {
        const s = R.publicSlot(d, hhmm(m)); if (!s.ok || s.band !== 'weekday') return false;
        return !(blocks[d] || []).some(function (b) { return m >= toMin(b.start) && m < toMin(b.end); });
      });
      if (!open.length) return;
      const g = wd[w]; g.days++; g.cap += open.length * 4; g.players += Math.min(open.length * 4, players[d] || 0);
      g.fee = R.greenFee(d, hhmm(open[0]), 18);
    });
    const used = wd.map(function (g, i) { return Object.assign({ wd: i, fill: g.cap ? g.players / g.cap : 0 }, g); }).filter(function (g) { return g.days && g.cap; });
    if (!used.length) return null;
    const avg = sum(used, function (g) { return g.players; }) / sum(used, function (g) { return g.cap; });
    let quiet = used.filter(function (g) { return g.fill <= avg; }).sort(function (a, b) { return a.wd - b.wd; });
    if (!quiet.length) quiet = [used.slice().sort(function (a, b) { return a.fill - b.fill; })[0]];
    const empty = sum(quiet, function (g) { return g.cap - g.players; });
    const fee = quiet[0].fee || (R.RATES && R.RATES.weekday) || 0;
    if (!(empty > 0) || !(fee > 0)) return null;
    return { quiet: quiet, empty: empty, days: sum(quiet, function (g) { return g.days; }), fee: fee, amount: Math.round(empty * 0.1 * fee) };
  }
  /** Active members (joined by the end of the period) who charged nothing beyond dues in it. */
  function noSpend(ctx) {
    return H.memo(ctx, 'profit-nospend', function () {
      const s = secData('accounts', 'spend', ctx); if (!s) return null;
      const f = ctx.ix.first.ch; if (!f || f > ctx.to) return null;
      const from = f > ctx.from ? f : ctx.from, days = H.spanDays(from, ctx.to);
      const active = all('members').filter(function (m) { return m.status === 'active' && !(String(m.memberSince || '').slice(0, 10) > ctx.to); });
      const spent = {}; s.list.forEach(function (a) { spent[a.id] = 1; });
      const none = active.filter(function (m) { return !spent[m.id]; });
      const spenders = active.length - none.length;
      const each = spenders ? s.list.filter(function (a) { return a.m && a.m.status === 'active'; }).reduce(function (t, a) { return t + a.total; }, 0) / spenders : 0;
      return { active: active, none: none, each: each, months: days / 30.4375, days: days, from: from };
    });
  }
  function openPlaces() {
    const T = D.today();
    const ev = all('events').filter(function (e) { return e && e.date && e.date >= T && e.status !== 'cancelled' && e.status !== 'draft' && num(e.capacity) > 0 && num(e.price) > 0; }).map(function (e) {
      const taken = sum((e.registrations || []).filter(function (g) { return g && !g.cancelled; }), function (g) { return 1 + num(g.guests); });
      return { open: Math.max(0, num(e.capacity) - taken), price: num(e.price) };
    }).filter(function (x) { return x.open > 0; });
    const pg = all('programs').filter(function (p) { return p && p.startDate && p.startDate >= T && num(p.capacity) > 0 && num(p.price) > 0 && p.status !== 'cancelled'; })
      .map(function (p) { return { open: Math.max(0, num(p.capacity) - (p.enrolled || []).length), price: num(p.price) }; }).filter(function (x) { return x.open > 0; });
    const worth = function (l) { return sum(l, function (x) { return x.open * x.price; }); };
    return { ev: ev, pg: pg, places: sum(ev.concat(pg), function (x) { return x.open; }), amount: Math.round(worth(ev) + worth(pg)) };
  }
  function promoUse(ctx) {
    const byCode = {}, players = {}, inR = H.inRange(ctx);
    all('publicPlayers').forEach(function (p) { if (p && p.id) players[p.id] = p; });
    const local = function (at) { const d = new Date(at); return isNaN(d) ? '' : Club.store.iso(d); };
    all('promoCodes').forEach(function (p) {
      (p.uses || []).forEach(function (u) {
        if (!u || u.status !== 'used' || !(num(u.discount) > 0)) return;
        const day = local(u.at); if (!inR(day)) return;
        const c = byCode[p.code] = byCode[p.code] || { code: p.code, n: 0, amount: 0, fresh: {}, tee: 0 };
        c.n++; c.amount += num(u.discount);
        if (u.publicPlayerId) c.tee++;
        /* A new golfer: a public player whose account was made the day of the booking or the day before. */
        const pp = u.publicPlayerId && players[u.publicPlayerId];
        if (pp && pp.createdAt && local(pp.createdAt) >= D.addDays(day, -1)) c.fresh[pp.id] = 1;
      });
    });
    const list = Object.keys(byCode).map(function (k) { const c = byCode[k]; c.amount = Math.round(c.amount * 100) / 100; c.newGolfers = Object.keys(c.fresh).length; return c; }).sort(function (a, b) { return b.amount - a.amount; });
    return { list: list, amount: Math.round(sum(list, function (c) { return c.amount; })) };
  }
  function noShowFees(ctx) {
    const c = secData('golf', 'cancel', ctx), R = Club.teeRules; if (!c || !R) return null;
    let n = 0, groups = 0, amount = 0;
    c.noShows.forEach(function (t) {
      let any = false;
      (t.players || []).forEach(function (p) { if (p && (p.type === 'guest' || p.type === 'public') && !p.paid) { n++; any = true; amount += R.greenFee(t.date, t.time, t.holes || 18); } });
      if (any) groups++;
    });
    return { n: n, groups: groups, amount: Math.round(amount) };
  }

  function missed(ctx) {
    return H.memo(ctx, 'profit-missed', function () {
      const out = [];
      function safe(fn) { try { return fn(); } catch (e) { console.error(e); return null; } }
      const tee = safe(function () { return teeGaps(ctx); });
      if (tee && tee.amount >= 1) {
        const names = H.joinAnd(tee.quiet.map(function (g) { return WD_PL[g.wd]; }));
        const fills = H.joinAnd(tee.quiet.map(function (g) { return Math.round(g.fill * 100) + '%'; }));
        out.push({ id: 'tee', title: 'Empty tee times on quiet days', amount: tee.amount, unit: 'in this period',
          text: names + ' in public weekday hours, 10:30 AM to 3:30 PM, ' + 'were ' + fills + ' full' + ' on the tee sheet: ' + F.num(tee.empty) + ' places went unsold over ' + pl(tee.days, 'day') + '. Selling 1 in 10 of them at the ' + F.money0(tee.fee) + ' public weekday fee would have brought ' + F.money0(tee.amount) + '.',
          assume: 'Assumes 1 in 10 empty places sold at the published weekday green fee. Blocked times and holidays are left out.',
          href: '#/teesheet', link: 'Open the tee sheet' });
      }
      const ns = safe(function () { return noSpend(ctx); });
      if (ns && ns.none.length && ns.each > 0 && ns.days >= 28) {
        const n = ns.none.length, half = Math.floor(n / 2) || 1, amt = Math.round(half * ns.each);
        out.push({ id: 'nospend', title: 'Members who spend nothing beyond dues', amount: amt, unit: 'in this period',
          text: n + ' of ' + ns.active.length + ' active members charged nothing beyond dues in this period. ' + (n === 1 ? 'If they had' : 'If half of them had') + ' spent like the average member who did (' + F.money0(ns.each / Math.max(0.5, ns.months)) + ' a month), the club would have taken ' + F.money0(amt) + ' more.',
          assume: 'Assumes ' + (n === 1 ? 'that member' : half + ' of the ' + n) + ' spent the average of members with house charges, ' + F.money0(ns.each) + ' in this period' + (ns.from > ctx.from ? '; house charges on file begin ' + F.dateShort(ns.from) : '') + '.',
          drill: 'nospend', link: 'See who they are' });
      }
      const op = safe(openPlaces);
      if (op && op.amount >= 1) {
        const bits = [];
        if (op.ev.length) bits.push(op.ev.length + ' upcoming ' + plural(op.ev.length, 'event'));
        if (op.pg.length) bits.push(op.pg.length + ' ' + plural(op.pg.length, 'clinic'));
        out.push({ id: 'places', title: 'Open places at events and clinics', amount: op.amount, unit: 'still to sell',
          text: H.joinAnd(bits) + ' ' + (op.ev.length + op.pg.length === 1 ? 'has ' : 'have ') + F.num(op.places) + ' ' + plural(op.places, 'place') + ' left, worth ' + F.money0(op.amount) + ' at their listed prices.',
          href: op.ev.length ? '#/events' : '#/lessons', link: op.ev.length ? 'Open events' : 'Open lessons', href2: op.ev.length && op.pg.length ? '#/lessons' : '', link2: 'Open lessons' });
      }
      const ag = safe(function () { return secData('accounts', 'aging', ctx); });
      if (ag && ag.late >= 1) {
        const n = ag.lateAccounts.length;
        out.push({ id: 'late', title: 'Balances more than 60 days old', amount: Math.round(ag.late), unit: 'not collected',
          text: n + ' ' + plural(n, 'account owes', 'accounts owe') + ' money that is more than 60 days old' + (ag.tot[3] >= 1 ? '; ' + F.money0(ag.tot[3]) + ' of it is over 90 days' : '') + '. Ageing is as of today.',
          href: '#/billing', link: 'Open billing' });
      }
      const pr = safe(function () { return promoUse(ctx); });
      if (pr && pr.amount >= 1) {
        const parts = pr.list.slice(0, 4).map(function (c) { return c.code + ' ' + F.money(c.amount) + ' (' + pl(c.n, 'use') + (c.newGolfers ? ', ' + pl(c.newGolfers, 'new golfer') : '') + ')'; });
        const fresh = sum(pr.list, function (c) { return c.newGolfers; }), teeUses = sum(pr.list, function (c) { return c.tee; });
        out.push({ id: 'promo', title: 'Promo code discounts', amount: pr.amount, unit: 'given away',
          text: pr.list.length + ' ' + plural(pr.list.length, 'code') + ' gave away ' + F.money0(pr.amount) + ' in this period: ' + parts.join(', ') + (pr.list.length > 4 ? ' and more' : '') + '.' + (teeUses && !fresh ? ' None of the tee time uses came from a golfer new to the club.' : ''),
          assume: teeUses ? 'A new golfer is a public golfer whose account was made the day of the booking or the day before.' : '',
          href: '#/proshop/promotions', link: 'Open promotions' });
      }
      const nf = safe(function () { return noShowFees(ctx); });
      if (nf && nf.amount >= 1) {
        out.push({ id: 'noshow', title: 'No-shows', amount: nf.amount, unit: 'green fees',
          text: pl(nf.n, 'guest or public player', 'guest and public players') + ' in ' + pl(nf.groups, 'booked group') + ' did not show and ' + (nf.n === 1 ? 'was' : 'were') + ' not charged, ' + F.money0(nf.amount) + ' at the published green fees.',
          href: '#/teesheet', link: 'Open the tee sheet' });
      }
      const dm = safe(function () { return secData('golf', 'demand', ctx); });
      if (dm && dm.lost && dm.lost.dollars >= 1) {
        out.push({ id: 'waitlist', title: 'Golfers turned away from full tee times', amount: Math.round(dm.lost.dollars), unit: 'green fees',
          text: pl(dm.lost.players, 'public golfer') + ' on the waitlist ' + (dm.lost.players === 1 ? 'was' : 'were') + ' never placed, ' + F.money0(dm.lost.dollars) + ' at the public green fee for the times they asked for.' + (dm.memberLost ? ' ' + pl(dm.memberLost, 'member') + ' also missed out; their golf is in dues, so they are not counted.' : ''),
          href: '#/teesheet', link: 'Open the waitlist on the tee sheet' });
      }
      out.sort(function (a, b) { return b.amount - a.amount; });
      return { list: out, total: sum(out, function (x) { return x.amount; }) };
    });
  }

  /* ==================================================================================================
     Headline figures
     ================================================================================================== */
  function kpis(ctx) {
    const d = profitData(ctx), mm = missed(ctx), n = d.months.length, c = d.costed.length;
    const prev = ctx.prev ? H.periodTotals(ctx.prev.rows).revenue : 0;
    const out = [{ label: 'Money in', value: ms(d.moneyIn), d: esc(ctx.line), chg: H.prevPct(d.moneyIn, prev, ctx, 'revenue'), go: 'revenue', aria: 'Money in ' + F.money0(d.moneyIn) }];
    if (c) {
      out.push({ label: 'Costs', value: ms(d.costs), d: esc('Entered for ' + c + ' of ' + n + ' ' + plural(n, 'month')), drill: 'months', aria: 'Costs ' + F.money0(d.costs) });
      out.push({ label: 'Profit', value: signed(d.profit), d: esc(d.inCosted ? pctTxt(d.profit, d.inCosted) + ' of money in' : 'No money in'), drill: 'months', aria: 'Profit ' + signed0(d.profit) });
    } else {
      out.push({ label: 'Costs', value: 'None yet', d: esc('Entered for 0 of ' + n + ' ' + plural(n, 'month')), href: costsHref(), aria: 'No costs entered' });
      out.push({ label: 'Profit', value: 'Not yet', d: esc('Needs the monthly costs'), href: costsHref(), aria: 'Profit not available' });
    }
    out.push({ label: 'Missed money', value: mm.list.length ? ms(mm.total) : 'None', d: esc(mm.list.length ? pl(mm.list.length, 'place') + ' to look, below' : 'Nothing on file for this period'), aria: 'Missed money ' + F.money0(mm.total) });
    return out;
  }

  /* ==================================================================================================
     Profit by department
     ================================================================================================== */
  function barCell(v, max) {
    const w = Math.min(100, Math.abs(v) / (max || 1) * 100);
    return '<span class="rpf-bar" aria-hidden="true"><span class="rpf-half l">' + (v < 0 ? '<i style="width:' + w.toFixed(1) + '%"></i>' : '') + '</span><span class="rpf-half r">' + (v > 0 ? '<i style="width:' + w.toFixed(1) + '%"></i>' : '') + '</span></span>';
  }
  function deptTableHTML(d) {
    const head = '<thead><tr><th>Department</th><th class="num">Money in</th><th class="num">Costs</th><th class="rpf-barh"><span>Loss</span><span>Profit</span></th><th class="num">Profit</th><th class="num">Margin</th></tr></thead>';
    function row(r, cls) {
      const pcls = r.profit < 0 ? ' class="num rpf-p is-loss"' : ' class="num rpf-p"';
      const aria = r.label + ': money in ' + F.money0(r.in) + ', costs ' + F.money0(r.cost) + ', ' + (r.profit < 0 ? 'loss ' + F.money0(-r.profit) : 'profit ' + F.money0(r.profit)) + '. See by month';
      return '<tr class="rpf-row' + (cls ? ' ' + cls : '') + '" data-drill="dept" data-arg="' + esc(r.key) + '">' +
        '<td class="rpf-dept"><button type="button" class="rpf-name" data-drill="dept" data-arg="' + esc(r.key) + '" aria-label="' + esc(aria) + '">' + esc(r.label) + '</button><span class="rpf-lines">' + esc(linesText(r)) + '</span></td>' +
        '<td class="num" data-label="Money in">' + (r.key === 'shared' ? '<span class="muted">-</span>' : esc(ms(r.in))) + '</td>' +
        '<td class="num" data-label="Costs">' + (r.key === 'dues' ? '<span class="muted">-</span>' : esc(ms(r.cost))) + '</td>' +
        '<td class="rpf-barc">' + barCell(r.profit, d.maxAbs) + '</td>' +
        '<td' + pcls + ' data-label="Profit"><strong>' + esc(signed(r.profit)) + '</strong></td>' +
        '<td class="num rpf-m" data-label="Margin">' + (r.margin == null ? '<span class="muted">-</span>' : esc(Math.round(r.margin * 100) + '%')) + '</td></tr>';
    }
    const whole = '<tr class="rpf-total"><td class="rpf-dept"><span class="rpf-name">Whole club</span></td><td class="num" data-label="Money in">' + esc(ms(d.inCosted)) + '</td><td class="num" data-label="Costs">' + esc(ms(d.costs)) + '</td><td class="rpf-barc"></td>' +
      '<td class="num rpf-p' + (d.profit < 0 ? ' is-loss' : '') + '" data-label="Profit"><strong>' + esc(signed(d.profit)) + '</strong></td><td class="num rpf-m" data-label="Margin">' + esc(d.inCosted ? pctTxt(d.profit, d.inCosted) : '-') + '</td></tr>';
    return '<div class="table-wrap rpf-tw"><table class="table rpf-table">' + head + '<tbody>' + d.depts.map(function (r) { return row(r); }).join('') + row(d.shared, 'rpf-shared') + '</tbody><tfoot>' + whole + '</tfoot></table></div>';
  }
  function countsLine(d) {
    const c = d.costed.length, n = d.months.length;
    if (c === n) return '';
    return 'Profit counts the ' + (c === 1 ? 'one month' : c + ' months') + ' with costs entered; ' + H.joinAnd(d.missing.map(function (m) { return monthName(m.key); })) + ' ' + (d.missing.length === 1 ? 'shows' : 'show') + ' money in only.';
  }
  function deptPanel(ctx) {
    const d = profitData(ctx);
    const withCosts = d.depts.filter(function (r) { return r.key !== 'dues' && r.in > 0; });
    const best = withCosts.slice().sort(function (a, b) { return b.margin - a.margin; })[0];
    const losers = d.depts.filter(function (r) { return r.profit < 0; });
    const take = [];
    if (best && best.margin > 0) take.push(best.label + ' make' + (/s$/.test(best.label) ? '' : 's') + ' the most for each dollar taken (' + Math.round(best.margin * 100) + '%).');
    if (losers.length > 2) { const w = losers.slice().sort(function (x, y) { return x.profit - y.profit; })[0]; take.push(H.numWord(losers.length).replace(/^./, function (c) { return c.toUpperCase(); }) + ' departments ran at a loss, ' + w.label.toLowerCase() + ' the most at ' + ms(-w.profit) + '.'); }
    else if (losers.length) take.push(H.joinAnd(losers.map(function (r) { return r.label.toLowerCase() + ' lost ' + ms(-r.profit); })).replace(/^./, function (s) { return s.toUpperCase(); }) + ': ' + (losers.length === 1 ? 'costs were' : 'their costs were') + ' more than ' + (losers.length === 1 ? 'it brought' : 'they brought') + ' in.');
    else if (withCosts.length) take.push('Every department with costs made money.');
    const cl = countsLine(d);
    return { id: 'profit-depts', title: 'Profit by department', take: H.sents(take.concat([cl])), body: deptTableHTML(d),
      desc: H.sents(['Money in comes from the till, the tee sheet and member charges, as in Revenue.', 'Costs are what the club entered under Accounting, Monthly costs' + (d.costed.some(function (m) { return m.part; }) ? ', counted by day for part months' : '') + '.', 'Shared costs belong to no one department, so they are shown on their own line.', 'Select a department to see it month by month.']),
      csvId: 'profit-depts' };
  }

  /* ==================================================================================================
     Profit by month: diverging columns
     ================================================================================================== */
  function monthChart(ctx, d) {
    const ms_ = d.months, maxPos = Math.max.apply(null, d.costed.map(function (m) { return Math.max(0, m.profit); }).concat([0]));
    const maxNeg = Math.max.apply(null, d.costed.map(function (m) { return Math.max(0, -m.profit); }).concat([0]));
    const plot = H.px(200), both = maxPos + maxNeg || 1;
    const upH = maxNeg && !maxPos ? Math.round(plot * 0.25) : maxPos && !maxNeg ? plot : Math.max(H.px(40), Math.round(plot * maxPos / both));
    const dnH = maxNeg ? Math.max(H.px(40), plot - upH) : 0;
    const scale = Math.max(maxPos / Math.max(1, upH), maxNeg / Math.max(1, dnH)) || 1;
    const best = d.costed.length ? d.costed.reduce(function (b, m) { return m.profit > b.profit ? m : b; }, d.costed[0]) : null;
    const worst = d.costed.length ? d.costed.reduce(function (b, m) { return m.profit < b.profit ? m : b; }, d.costed[0]) : null;
    const crossYear = ms_.length && ms_[0].key.slice(0, 4) !== ms_[ms_.length - 1].key.slice(0, 4);
    const cols = ms_.map(function (m, i) {
      const year = (i === 0 && (crossYear || ms_.length > 1)) || (crossYear && m.key.slice(5) === '01') ? m.key.slice(0, 4) : '';
      /* The first month's year gives way on narrow charts when January follows straight after (the labels would touch). */
      const yCls = i === 0 && ms_[1] && ms_[1].key.slice(5) === '01' ? ' rpf-yr0' : '';
      const title = H.monthLong(m.key) + (m.part ? (m.toDate ? ' to date' : ', ' + m.days + ' of ' + m.dim + ' days') : '');
      if (!m.costed) {
        return '<div class="rpf-col is-none" role="listitem"><div class="rpf-colbtn" data-tip-title="' + esc(title) + '" data-tip="' + esc('No costs entered. Money in ' + F.money0(m.revTotal)) + '" aria-label="' + esc(title + ': no costs entered') + '">' +
          '<span class="rpf-up" style="height:' + (upH + H.px(18)) + 'px"><span class="rpf-none">No costs</span></span><span class="rpf-dn" style="height:' + (dnH + H.px(18)) + 'px"></span></div>' +
          '<span class="rpf-lbl">' + esc(m.label) + '</span><span class="rpf-yr' + yCls + '">' + esc(year) + '</span></div>';
      }
      const v = m.profit, h = Math.max(v ? 2 : 0, Math.round(Math.abs(v) / scale));
      const ext = (m === best && v > 0) || (m === worst && v < 0) ? ' is-ext' : '';
      const tip = 'Money in ' + F.money0(m.revTotal) + ', costs ' + F.money0(m.costTotal) + ', ' + (v < 0 ? 'loss ' + F.money0(-v) : 'profit ' + F.money0(v)) + (m.example ? ' (example costs)' : '');
      const bar = '<i class="' + (v < 0 ? 'loss' : 'gain') + (m.part ? ' part' : '') + '" style="height:' + h + 'px"></i>';
      const lab = '<span class="rpf-v' + ext + '">' + esc(signed(v)) + '</span>';
      return '<div class="rpf-col' + (v < 0 ? ' is-loss' : '') + '" role="listitem"><button type="button" class="rpf-colbtn" data-drill="month" data-arg="' + esc(m.key) + '" data-tip-title="' + esc(title) + '" data-tip="' + esc(tip) + '" aria-label="' + esc(title + ': ' + tip + '. See the month') + '">' +
        '<span class="rpf-up" style="height:' + (upH + H.px(18)) + 'px">' + (v >= 0 ? lab + bar : '') + '</span>' +
        '<span class="rpf-dn" style="height:' + (dnH + H.px(18)) + 'px">' + (v < 0 ? bar + lab : '') + '</span></button>' +
        '<span class="rpf-lbl">' + esc(m.label) + '</span><span class="rpf-yr' + yCls + '">' + esc(year) + '</span></div>';
    }).join('');
    return '<div class="rpf-chart"><div class="rpf-cols" role="list" aria-label="Profit by month" style="--n:' + ms_.length + '">' + cols + '</div></div>';
  }
  function monthPanel(ctx) {
    const d = profitData(ctx);
    const loss = d.costed.filter(function (m) { return m.profit < 0; }), gain = d.costed.filter(function (m) { return m.profit > 0; });
    const take = [];
    if (loss.length) {
      const tot = -sum(loss, function (m) { return m.profit; }), worst = loss.reduce(function (b, m) { return m.profit < b.profit ? m : b; }, loss[0]);
      take.push('The club lost money in ' + (loss.length === d.costed.length && loss.length > 1 ? 'every month with costs' : loss.length >= 3 && monthsText(loss).indexOf(' to ') > 0 ? 'the months from ' + monthsText(loss) : monthsText(loss)) + ', ' + ms(tot) + ' in all.');
      if (loss.length > 1) take.push('The biggest loss was ' + monthName(worst.key) + ' at ' + signed(worst.profit) + '.');
    } else if (gain.length) take.push('Every month with costs entered made money.');
    if (gain.length) { const b = gain.reduce(function (x, m) { return m.profit > x.profit ? m : x; }, gain[0]); take.push('The best was ' + monthName(b.key) + ' at ' + ms(b.profit) + '.'); }
    const desc = ['Each column is one month: money in minus costs. Green is profit, red is a loss.'];
    const part = d.months.filter(function (m) { return m.part; });
    if (ctx.gran === 'day') desc.push('Costs are entered by the month, so for these ' + pl(ctx.days, 'day') + ' each month counts its costs by day: ' + H.joinAnd(part.map(function (m) { return m.days + ' of ' + monthName(m.key) + '\'s ' + m.dim + ' days'; })) + '.');
    else part.forEach(function (m) { desc.push(monthName(m.key) + ' is ' + (m.toDate ? 'month to date' : 'part of the month') + ' (striped)' + (m.costed ? ', with ' + m.days + ' of its ' + m.dim + ' days of costs' : '') + '.'); });
    if (d.missing.length) desc.push((d.missing.length === 1 ? monthName(d.missing[0].key) + ' has' : d.missing.length + ' months have') + ' no costs yet, so ' + (d.missing.length === 1 ? 'it is' : 'they are') + ' left as a gap.');
    return { id: 'profit-months', cls: 'wide', title: 'Profit by month', take: H.sents(take), body: monthChart(ctx, d), desc: H.sents(desc.slice(0, 4)), csvId: 'profit-months', drill: 'months', drillLabel: 'See the table' };
  }

  /* ==================================================================================================
     Money left on the table, Costs still to enter, the empty state
     ================================================================================================== */
  function missedPanel(ctx) {
    const mm = missed(ctx);
    const body = mm.list.length ? '<ol class="ideas rpf-missed">' + mm.list.map(function (x) {
      const act = x.drill ? '<button type="button" class="rp-link" data-drill="' + esc(x.drill) + '" aria-haspopup="dialog">' + esc(x.link) + '</button>' : '<a class="rp-link" href="' + esc(x.href) + '">' + esc(x.link) + '</a>';
      const act2 = x.href2 ? '<a class="rp-link" href="' + esc(x.href2) + '">' + esc(x.link2) + '</a>' : '';
      return '<li data-missed="' + esc(x.id) + '"><div class="idea-main"><h3>' + esc(x.title) + '</h3><p>' + esc(x.text) + '</p>' + (x.assume ? '<p class="idea-why">' + esc(x.assume) + '</p>' : '') +
        '<div class="rpf-acts">' + act + act2 + '</div></div><div class="idea-est"><b>' + esc(x.amount >= 1e4 ? ms(x.amount) : F.money0(x.amount)) + '</b><span>' + esc(x.unit) + '</span></div></li>';
    }).join('') + '</ol>' : '<p class="rp-empty">Nothing on file points to money left on the table in this period.</p>';
    return { id: 'profit-missed', cls: 'wide', title: 'Money left on the table',
      take: mm.list.length ? 'About ' + ms(mm.total) + ' the club could still earn or collect, largest first. Each figure comes from the club\'s own records and says what it assumes.' : '',
      body: body, csvId: mm.list.length ? 'profit-missed' : null };
  }
  function toEnterPanel(ctx) {
    const d = profitData(ctx); if (!d.missing.length || !d.costed.length) return null;
    const list = d.missing.slice().reverse(), first = list[0];
    const head = list.length === 1 ? monthName(first.key) + ' costs are not entered yet, so ' + monthName(first.key) + ' shows money in only.' : list.length + ' months in this period have no costs yet, so they show money in only.';
    const chips = list.length > 1 ? '<ul class="rpf-chipsl">' + list.map(function (m) { return '<li>' + esc(H.monthLabel(m.key, true) + (m.toDate ? ' to date' : '')) + '</li>'; }).join('') + '</ul>' : '';
    return { id: 'profit-toenter', cls: 'wide rpf-toenter', title: 'Costs still to enter', take: head,
      body: chips + '<div class="rpf-enter"><p>The bookkeeper enters each month\'s costs by department, or copies last month and changes what is different.</p><a class="btn btn-primary" href="' + esc(costsHref()) + '">' + esc('Enter ' + monthName(first.key) + ' costs') + '</a></div>' };
  }
  function emptyPanel(ctx) {
    /* Costs on file for other months: name the months this period needs. */
    const some = Club.costs && Club.costs.months().length, ms_ = profitData(ctx).months;
    const which = ms_.length === 1 ? monthName(ms_[0].key) + '\'s costs are' : 'the costs for these months are';
    return { id: 'profit-empty', cls: 'wide rpf-emptyp', title: some ? 'No costs entered for this period yet' : 'No costs entered yet',
      take: some ? 'Profit appears once ' + which + ' entered under Accounting, Monthly costs.' : 'Profit appears once the club\'s monthly costs are entered under Accounting, Monthly costs.',
      body: '<div class="rpf-enter"><p>Money in is above. Each department\'s profit, and the profit by month, show here once the costs for a month are entered.</p><a class="btn btn-primary" href="' + esc(costsHref()) + '">Enter monthly costs</a></div>' };
  }
  function main(ctx) { const d = profitData(ctx); return d.costed.length ? deptPanel(ctx) : emptyPanel(ctx); }
  function panels(ctx) {
    const d = profitData(ctx), out = [];
    if (d.costed.length) out.push(monthPanel(ctx));
    out.push(missedPanel(ctx));
    const te = toEnterPanel(ctx); if (te) out.push(te);
    return out;
  }

  /* ==================================================================================================
     Drills, CSV, about, facts, ideas
     ================================================================================================== */
  function monthsTable(d, fn) {
    return H.rTable([{ label: 'Month' }, { label: 'Money in', num: true }, { label: 'Costs', num: true }, { label: 'Profit', num: true }, { label: 'Margin', num: true }],
      d.months.slice().reverse().map(function (m) {
        const v = fn(m);
        return ['<span class="primary-cell">' + esc(H.monthLabel(m.key, true) + (m.part ? (m.toDate ? ' to date' : ' (part)') : '')) + '</span>' + (m.example ? ' <span class="muted">example</span>' : ''),
          esc(F.money0(v.in)), v.cost == null ? '<span class="muted">Not entered</span>' : esc(F.money0(v.cost)),
          v.cost == null ? '<span class="muted">-</span>' : '<strong' + (v.in - v.cost < 0 ? ' class="rd-late"' : '') + '>' + esc(signed0(v.in - v.cost)) + '</strong>',
          v.cost == null || !v.in ? '<span class="muted">-</span>' : esc(pctTxt(v.in - v.cost, v.in))];
      }));
  }
  function drillMonths(ctx) {
    const d = profitData(ctx);
    let html = H.rKpis([
      { label: 'Money in', value: F.money0(d.moneyIn), sub: esc(ctx.line) },
      { label: 'Costs', value: d.costed.length ? F.money0(d.costs) : 'None', sub: esc('Entered for ' + d.costed.length + ' of ' + d.months.length + ' ' + plural(d.months.length, 'month')) },
      { label: 'Profit', value: d.costed.length ? signed0(d.profit) : 'Not yet', sub: esc(d.costed.length && d.inCosted ? pctTxt(d.profit, d.inCosted) + ' of money in' : '') },
      { label: 'Months with costs', value: String(d.costed.length), sub: esc(d.example ? 'Some use example costs (demo)' : 'From Accounting') }
    ]);
    html += H.rSec('By month', 'Latest first', monthsTable(d, function (m) { return { in: m.revTotal, cost: m.costed ? m.costTotal : null }; }));
    return { title: 'Profit by month', body: html, csv: monthsCSV(ctx), go: costsHref().slice(2), goLabel: 'Open monthly costs' };
  }
  function drillDept(ctx, key) {
    const d = profitData(ctx), r = d.depts.concat([d.shared]).filter(function (x) { return x.key === key; })[0];
    if (!r) return null;
    let html = H.rKpis([
      { label: 'Money in', value: key === 'shared' ? 'None' : F.money0(r.in), sub: esc(key === 'shared' ? 'Shared costs have no money in' : 'Months with costs') },
      { label: 'Costs', value: key === 'dues' ? 'None' : F.money0(r.cost), sub: esc(key === 'dues' ? 'Dues have no costs of their own' : pl(d.costed.length, 'month') + ' entered') },
      { label: r.profit < 0 ? 'Loss' : 'Profit', value: signed0(r.profit), sub: '' },
      { label: 'Margin', value: r.margin == null ? '-' : Math.round(r.margin * 100) + '%', sub: esc('Of money in') }
    ]);
    html += H.rSec('By month', 'Latest first', monthsTable(d, function (m) { return { in: key === 'shared' ? 0 : num(m.rev[key]), cost: m.costed ? (key === 'dues' ? 0 : num(m.cost[key])) : null }; }));
    if (r.lines.length) html += H.rSec('Cost lines', 'Months with costs', H.rTable([{ label: 'Line' }, { label: 'Share' }, { label: 'Amount', num: true }],
      r.lines.slice().sort(function (a, b) { return b.amount - a.amount; }).map(function (l) { const sh = r.cost ? Math.round(l.amount / r.cost * 100) : 0; return ['<span class="primary-cell">' + esc(l.label) + '</span>', '<span class="rd-fill"><span class="bar"><span style="width:' + Math.max(0, Math.min(100, sh)) + '%"></span></span>' + sh + '%</span>', esc(F.money0(l.amount))]; })));
    if (d.missing.length) html += H.rNote(countsLine(d));
    const csv = [['Month', 'Money in', 'Costs', 'Profit']].concat(d.months.map(function (m) { const i = key === 'shared' ? 0 : num(m.rev[key]), c = m.costed ? (key === 'dues' ? 0 : num(m.cost[key])) : ''; return [m.key + (m.part ? ' (part)' : ''), i, c, c === '' ? '' : i - c]; }));
    const pg = PAGE[key];
    return { title: r.label + ', profit', body: html, csv: csv, go: pg || costsHref().slice(2), goLabel: pg ? PAGE_LABEL[pg] : 'Open monthly costs' };
  }
  function drillMonth(ctx, key) {
    const d = profitData(ctx), m = d.months.filter(function (x) { return x.key === key; })[0];
    if (!m || !m.costed) return null;
    const rows = costDepts().map(function (x) { return x.key; }).concat(['dues', 'shared']).map(function (k) {
      const i = k === 'shared' ? 0 : num(m.rev[k]), c = k === 'dues' ? 0 : num(m.cost[k]);
      return { k: k, i: i, c: c, p: i - c };
    });
    let html = H.rKpis([
      { label: 'Money in', value: F.money0(m.revTotal), sub: esc(m.part ? m.days + ' of ' + m.dim + ' days' : 'Whole month') },
      { label: 'Costs', value: F.money0(m.costTotal), sub: esc(m.example ? 'Example costs (demo)' : m.part ? 'Counted by day' : 'As entered') },
      { label: m.profit < 0 ? 'Loss' : 'Profit', value: signed0(m.profit), sub: esc(m.revTotal ? pctTxt(m.profit, m.revTotal) + ' of money in' : '') },
      { label: 'Biggest cost', value: (function () { const b = rows.filter(function (x) { return x.c > 0; }).sort(function (a, b2) { return b2.c - a.c; })[0]; return b ? deptLabel(b.k) : 'None'; })(), sub: '' }
    ]);
    html += H.rSec('By department', '', H.rTable([{ label: 'Department' }, { label: 'Money in', num: true }, { label: 'Costs', num: true }, { label: 'Profit', num: true }],
      rows.map(function (x) { return ['<span class="primary-cell">' + esc(deptLabel(x.k)) + '</span>', x.k === 'shared' ? '<span class="muted">-</span>' : esc(F.money0(x.i)), x.k === 'dues' ? '<span class="muted">-</span>' : esc(F.money0(x.c)), '<strong' + (x.p < 0 ? ' class="rd-late"' : '') + '>' + esc(signed0(x.p)) + '</strong>']; }),
      ['Whole club', esc(F.money0(m.revTotal)), esc(F.money0(m.costTotal)), esc(signed0(m.profit))]));
    const csv = [['Department', 'Money in', 'Costs', 'Profit']].concat(rows.map(function (x) { return [deptLabel(x.k), x.i, x.c, x.p]; })).concat([['Whole club', m.revTotal, m.costTotal, m.profit]]);
    return { title: H.monthLong(m.key) + (m.toDate ? ' to date' : ''), body: html, csv: csv, csvName: 'stboniface-profit-' + m.key + '.csv', go: costsHref().slice(2), goLabel: 'Open monthly costs' };
  }
  function drillNoSpend(ctx) {
    const ns = noSpend(ctx);
    if (!ns || !ns.none.length) return { title: 'Members who spend nothing beyond dues', body: H.rNote('Every active member charged something beyond dues in this period.') };
    const list = ns.none.slice().sort(function (a, b) { return Club.members.name(a).localeCompare(Club.members.name(b)); });
    let html = H.rKpis([
      { label: 'Members', value: F.num(ns.none.length), sub: esc('of ' + ns.active.length + ' active') },
      { label: 'Average member', value: F.money0(ns.each), sub: esc('Charged in this period') },
      { label: 'A month', value: F.money0(ns.each / Math.max(0.5, ns.months)), sub: esc('Average member who spent') },
      { label: 'Period', value: pl(ns.days, 'day'), sub: esc(ns.from > ctx.from ? 'Charges begin ' + F.dateShort(ns.from) : ctx.line) }
    ]);
    html += H.rSec('Who they are', pl(list.length, 'member'), H.rTable([{ label: 'Member' }, { label: 'Member no' }, { label: 'Since' }],
      list.map(function (m) { return ['<a class="primary-cell" href="#/members/' + esc(m.id) + '">' + esc(Club.members.name(m)) + '</a>', esc(m.memberNo || ''), esc(m.memberSince ? F.dateShort(String(m.memberSince).slice(0, 10)) : '')]; })));
    const csv = [['Member', 'Member no', 'Member since']].concat(list.map(function (m) { return [Club.members.name(m), m.memberNo || '', String(m.memberSince || '').slice(0, 10)]; }));
    return { title: 'Members who spend nothing beyond dues', body: html, csv: csv, go: 'members', goLabel: 'Open members' };
  }

  function deptCSV(ctx) {
    const d = profitData(ctx); if (!d.costed.length) return [];
    const rows = [['Department', 'Money in', 'Costs', 'Profit', 'Margin %', 'Cost lines']];
    d.depts.concat([d.shared]).forEach(function (r) { rows.push([r.label, r.key === 'shared' ? '' : r.in, r.key === 'dues' ? '' : r.cost, r.profit, r.margin == null ? '' : Math.round(r.margin * 1000) / 10, r.lines.map(function (l) { return l.label + ' ' + l.amount; }).join('; ')]); });
    rows.push(['Whole club', d.inCosted, d.costs, d.profit, d.inCosted ? Math.round(d.profit / d.inCosted * 1000) / 10 : '', '']);
    rows.push([]); rows.push(['Months with costs', d.costed.map(function (m) { return m.key + (m.example ? ' (example)' : ''); }).join('; ')]);
    return rows;
  }
  function monthsCSV(ctx) {
    const d = profitData(ctx);
    return [['Month', 'Days', 'Money in', 'Costs', 'Profit', 'Margin %', 'Costs from']].concat(d.months.map(function (m) {
      return [m.key + (m.part ? (m.toDate ? ' (to date)' : ' (part)') : ''), m.days, m.revTotal, m.costed ? m.costTotal : '', m.costed ? m.profit : '', m.costed && m.revTotal ? Math.round(m.profit / m.revTotal * 1000) / 10 : '', !m.costed ? 'Not entered' : m.example ? 'Example (demo)' : m.part ? 'Accounting, counted by day' : 'Accounting'];
    }));
  }
  function missedCSV(ctx) {
    const mm = missed(ctx);
    return [['Rank', 'Where to look', 'Details', 'Amount', 'Unit', 'Assumption']].concat(mm.list.map(function (x, i) { return [i + 1, x.title, x.text, x.amount, x.unit, x.assume || '']; }));
  }

  function about(ctx) {
    const d = profitData(ctx), out = [];
    out.push('Money in is the Revenue section\'s figure for each department. ' + H.marksText(ctx));
    out.push('Costs are the monthly figures entered under Accounting, Monthly costs. Profit counts only the months with costs; a month without them shows money in only. When the period covers part of a month, that month\'s costs are counted by day.');
    out.push('Dues have no costs of their own. Shared costs, such as the clubhouse and insurance, belong to no one department and are shown on their own line.');
    if (d.example) out.push('Some months use example costs (demo), not the club\'s figures.');
    out.push('Money left on the table: figures from the club\'s own records, as of the period chosen. Open event and clinic places and balances more than 60 days old are as of today.');
    return out.concat(ctx.notes || []);
  }
  function facts(ctx) {
    const d = profitData(ctx); if (!d.costed.length || !d.inCosted) return [];
    const out = [{ text: 'The club ' + (d.profit < 0 ? 'lost ' + F.money0(-d.profit) : 'made a profit of ' + F.money0(d.profit) + ', ' + pctTxt(d.profit, d.inCosted) + ' of money in,') + ' over the ' + (d.costed.length === 1 ? 'one month' : d.costed.length + ' months') + ' with costs entered' + (d.example ? ' (example costs)' : '') + '.', where: 'Profit' }];
    return out;
  }
  function ideas(ctx) {
    const d = profitData(ctx), out = [];
    if (!d.costed.length || d.costedMonths < 0.9) return out;
    const ex = d.example ? ' Some months use example costs (demo), not the club\'s figures.' : '';
    const per = d.costedMonths;
    d.depts.filter(function (r) { return r.key !== 'dues' && r.profit < 0 && r.in > 0; }).sort(function (a, b) { return a.profit - b.profit; }).slice(0, 2).forEach(function (r) {
      const big = r.lines.slice().sort(function (a, b) { return b.amount - a.amount; })[0], mo = -r.profit / per;
      out.push({ id: 'loss-' + r.key, title: r.label + ' ' + (/s$/.test(r.label) ? 'lose' : 'loses') + ' money', text: 'Over the ' + pl(d.costed.length, 'month') + ' with costs entered, ' + r.label.toLowerCase() + ' took in ' + F.money0(r.in) + ' and cost ' + F.money0(r.cost) + ', a loss of ' + F.money0(-r.profit) + (big ? '. The largest cost is ' + lower(big.label) + ' at ' + F.money0(big.amount) : '') + '. Breaking even would add about ' + F.money0(mo) + ' a month.',
        assume: 'Assumes ' + r.label.toLowerCase() + ' breaks even, at this period\'s monthly rate, for twelve months. Costs are the figures entered under Accounting.' + ex, amount: mo, per: 'a month', year: mo * 12 });
    });
    const loss = d.costed.filter(function (m) { return m.profit < 0; });
    if (loss.length && out.length < 3) {
      const lc = sum(loss, function (m) { return m.costTotal; }), yr = 0.1 * lc * 12 / per;
      if (yr >= 1) out.push({ id: 'losing-months', title: 'Trim costs in the months that lose money', text: monthsText(loss).replace(/^./, function (s) { return s.toUpperCase(); }) + ' lost ' + F.money0(-sum(loss, function (m) { return m.profit; })) + ' in all, on costs of ' + F.money0(lc) + '. Costs 10% lower in those months would save about ' + F.money0(yr) + ' a year.',
        assume: 'Assumes costs 10% lower in the months that lost money, with this period\'s pattern over twelve months.' + ex, amount: yr, per: 'a year', year: yr });
    }
    return out.slice(0, 3);
  }

  /* The example-costs note sits above the headline figures (the page draws sections without a slot for it). */
  function wire(el, ctx) {
    const d = profitData(ctx), old = el.querySelector('.rpf-note');
    if (old) old.remove();
    if (!d.example) return;
    const n = document.createElement('p');
    n.className = 'rpf-note';
    n.textContent = 'Some months use example costs (demo), not the club\'s figures.';
    const k = el.querySelector('.rp-kpis');
    el.insertBefore(n, k || el.firstChild.nextSibling);
  }

  Club.reports.addSection({
    id: 'profit', label: 'Profit', order: 25,
    collections: ['monthlyCosts', 'charges', 'sales', 'diningOrders', 'teeTimes', 'teeWaitlist', 'teeBlocks', 'events', 'programs', 'promoCodes', 'members', 'products', 'monthlyMetrics'],
    kpis: kpis, main: main, panels: panels, about: about, facts: facts, ideas: ideas, wire: wire,
    ideasTitle: 'Ideas to improve profit',
    csv: function (ctx) {
      return [{ id: 'profit-depts', title: 'Profit by department', rows: deptCSV(ctx) }, { id: 'profit-months', title: 'Profit by month', rows: monthsCSV(ctx) }, { id: 'profit-missed', title: 'Money left on the table', rows: missedCSV(ctx) }];
    },
    drills: { dept: drillDept, month: drillMonth, months: drillMonths, nospend: drillNoSpend },
    data: { profit: profitData, missed: missed }
  });
})();
