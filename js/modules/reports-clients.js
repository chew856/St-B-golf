/* Reports section: Clients. Who spends the most at the club, members and public golfers together, with each client's
   breakdown. Registers through Club.reports.addSection (js/modules/reports.js) and exposes Club.clientStats, which the
   staff member page (js/modules/members.js, Spending tab) uses for the same breakdown.

   Where the money is read from (every figure is a record on file; nothing is estimated):
     charges          the members' house-account ledger. Reversed charges and their reversals are skipped, credits reduce
                      spend, and a balance brought forward is not a purchase.
     receipts         purchases paid by card or cash by a member or a public golfer (a receipt with a chargeId is already
                      on the ledger; "Account payment" receipts are payments toward a statement, not spending).
     publicPayments   green fees paid online by public golfers, when no receipt was made for the payment.
     sales            pro shop counter sales by card or cash with a customer picked, when the sale has no receipt.
     diningOrders     closed checks a member paid by card, when the check has no receipt.
   A sale or a check "on member account" counts once, through its ledger charge. Amounts paid with a gift card are left
   out (the purchase of the gift card is the spend). Purchases with no member or public golfer on them (walk-in
   customers, wedding and outing deposits) cannot be tied to a client and are not in this report.

   Club.clientStats
     .ledger()                               every client purchase and visit on file (build once, pass it on)
     .forClient(key, range, incDues, L?)     one client's figures; key 'm:<memberId>' or 'p:<publicPlayerId>',
                                             range { from, to, label, prev: { from, to, label } | null, all? }
     .breakdownHTML(stats)                   the breakdown markup (department, months, habits, comparison)
     .csv(stats)                             the same as CSV rows
     .memberTab(panel, member)               the Spending tab on the staff member page, with its own period choice */
(function () {
  'use strict';
  if (!window.Club || !Club.reports || !Club.reports.addSection) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, Dt = Club.date, esc = U.esc, H = Club.reports.h;
  const all = H.all, num = H.num, sum = H.sum, plural = H.plural, DEAD = H.DEAD;

  /* ---------------- Helpers ---------------- */
  function today() { return Dt.today(); }
  function r2(v) { return Math.round(num(v) * 100) / 100; }
  function money0(v) { return F.money0(v); }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function pct1(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }
  function ordinal(n) { const t = n % 100, s = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + s; }
  function played(t) { const T = today(); return !!t.date && t.date <= T && !DEAD[t.status] && (t.date < T || t.status === 'completed' || t.status === 'on-course' || t.status === 'checked-in'); }
  function monthEnd(k) { return k + '-' + H.pad(new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate()); }
  function lower(s) { return String(s || '').toLowerCase(); }
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* Departments, in the order they are listed. Dues come last and only when dues are included. */
  const DEPTS = ['Golf', 'Pro Shop', 'Dining', 'Beverage cart', 'Takeout', 'Lessons', 'Events', 'Gift cards', 'Other', 'Dues'];
  const CHARGE_CAT = { Golf: 'Golf', 'Pro Shop': 'Pro Shop', Dining: 'Dining', Events: 'Events', Lessons: 'Lessons', Dues: 'Dues' };
  const SOURCE_DEPT = { teesheet: 'Golf', public: 'Golf', cart: 'Beverage cart', takeout: 'Takeout', dining: 'Dining', pos: 'Pro Shop', proshop: 'Pro Shop', shop: 'Pro Shop', lessons: 'Lessons', events: 'Events', giftcards: 'Gift cards' };
  function chargeDept(c) {
    if (c.category === 'Dues') return 'Dues';
    if (c.source === 'cart') return 'Beverage cart';
    if (c.source === 'takeout') return 'Takeout';
    if (c.source === 'giftcards') return 'Gift cards';
    return CHARGE_CAT[c.category] || 'Other';
  }
  function receiptDept(r) {
    if (SOURCE_DEPT[r.source]) return SOURCE_DEPT[r.source];
    return r.source === 'billing' && /dues|renewal|membership/i.test(r.title || '') ? 'Dues' : 'Other';
  }
  const NOT_ITEM = /^(tax|gst|pst|service|gratuity|tip|promo code|discount)\b/i;
  function itemsOf(lines, nameKey, priceKey) {
    return (lines || []).filter(function (l) { return l && l[nameKey] && num(l[priceKey]) > 0 && !NOT_ITEM.test(l[nameKey]); })
      .map(function (l) { const q = num(l.qty) || 1; return { name: String(l[nameKey]), qty: q, amount: q * num(l[priceKey]) }; });
  }

  /* ---------------- The ledger: every purchase and visit that names a client ---------------- */
  function buildLedger() {
    const T = today(), entries = [], visits = [], first = {};
    function seen(k, d) { if (d && (!first[k] || d < first[k])) first[k] = d; }
    /* online: paid on the website, so the day of the purchase is not a visit to the club. A credit takes its items back. */
    function add(key, date, amount, dept, items, online) {
      amount = r2(amount);
      if (!key || !date || date > T || !amount) return;
      seen('spend', date);
      const its = dept === 'Dues' ? [] : amount > 0 ? items || [] : (items || []).map(function (it) { return { name: it.name, qty: -it.qty, amount: -it.amount }; });
      entries.push({ key: key, date: date, amount: amount, dept: dept, items: its, online: !!online });
    }
    const receipts = all('receipts'), byCharge = {}, hasRef = {}, publicRef = {};
    receipts.forEach(function (r) {
      if (r.chargeId) byCharge[r.chargeId] = r;
      if (r.refId) { hasRef[r.refId] = 1; if (r.source === 'public') publicRef[r.refId] = 1; }
    });
    const payIds = {}; all('payments').forEach(function (p) { payIds[p.id] = 1; });

    /* 1. The members' ledger */
    const charges = all('charges'), undone = {};
    charges.forEach(function (c) { if (c.reversedBy) { undone[c.id] = 1; undone[c.reversedBy] = 1; } if (c.reverses) { undone[c.id] = 1; undone[c.reverses] = 1; } });
    charges.forEach(function (c) {
      if (!c.memberId || undone[c.id] || c.refId === 'opening' || /^Balance brought forward/i.test(c.description || '')) return;
      const rc = byCharge[c.id];
      add('m:' + c.memberId, c.date, c.amount, chargeDept(c), rc && rc.lines && rc.lines.length ? itemsOf(rc.lines, 'name', 'price') : [{ name: c.description || 'House charge', qty: 1, amount: Math.abs(num(c.amount)) }], rc && rc.channel === 'online');
    });

    /* 2. Purchases paid by card or cash: receipts that are not on the ledger and are not account payments */
    receipts.forEach(function (r) {
      const key = r.memberId ? 'm:' + r.memberId : r.publicPlayerId ? 'p:' + r.publicPlayerId : null;
      if (!key || r.chargeId || r.title === 'Account payment' || (r.paymentId && payIds[r.paymentId])) return;
      let amt;
      if (Array.isArray(r.tenders) && r.tenders.length) amt = sum(r.tenders.filter(function (t) { return t && t.method !== 'account' && t.method !== 'gift'; }), function (t) { return t.amount; });
      else amt = r.method === 'account' ? 0 : num(r.total);
      add(key, r.date, r.kind === 'credit' ? -amt : amt, receiptDept(r), itemsOf(r.lines, 'name', 'price'), r.channel === 'online');
    });

    /* 3. Green fees paid online by public golfers, when the payment has no receipt of its own */
    all('publicPayments').forEach(function (p) {
      if (!p.publicPlayerId || p.status !== 'paid' || publicRef[p.id]) return;
      add('p:' + p.publicPlayerId, p.date, p.giftCardId ? num(p.cardAmount) : num(p.amount), 'Golf', itemsOf(p.lines, 'label', 'amount'), true);
    });

    /* 4. Pro shop counter sales by card or cash with a customer picked, when the sale has no receipt.
          Online orders (orderId) and their refunds are covered by the order's own receipts. */
    all('sales').forEach(function (s) {
      const key = s.memberId ? 'm:' + s.memberId : s.publicPlayerId ? 'p:' + s.publicPlayerId : null;
      if (!key || s.payment === 'Member account' || s.orderId || hasRef[s.id] || (s.refundOf && hasRef[s.refundOf])) return;
      add(key, s.date, num(s.total) - (num(s.total) > 0 ? num(s.giftAmount) : 0), 'Pro Shop', itemsOf(s.items, 'name', 'price'));
    });

    /* 5. Dining checks a member paid by card, when the check has no receipt */
    all('diningOrders').forEach(function (o) {
      if (!o.memberId || o.status !== 'closed' || !o.payment || o.payment === 'Member account' || hasRef[o.id]) return;
      add('m:' + o.memberId, o.date, o.grandTotal != null ? o.grandTotal : o.total, 'Dining', itemsOf(o.items, 'name', 'price'));
    });

    /* Visits that are not purchases: rounds played, dining reservations honoured, lessons taken */
    all('teeTimes').forEach(function (t) {
      seen('tee', t.date);
      if (!played(t)) return;
      const once = {};
      (t.players || []).forEach(function (p) {
        const key = p && (p.memberId ? 'm:' + p.memberId : p.publicPlayerId && !p.publicGuest ? 'p:' + p.publicPlayerId : null);
        if (key && !once[key]) { once[key] = 1; visits.push({ key: key, date: t.date, t: 'round' }); }
      });
    });
    all('diningReservations').forEach(function (r) {
      seen('res', r.date);
      if (r.memberId && r.date && r.date <= T && (r.status === 'completed' || r.status === 'seated')) visits.push({ key: 'm:' + r.memberId, date: r.date, t: 'dining' });
    });
    all('lessons').forEach(function (l) {
      seen('lesson', l.date);
      const key = l.memberId ? 'm:' + l.memberId : l.guest && l.guest.publicPlayerId ? 'p:' + l.guest.publicPlayerId : null;
      if (key && l.date && l.date <= T && l.status === 'completed') visits.push({ key: key, date: l.date, t: 'lesson' });
    });
    return { entries: entries, visits: visits, first: first };
  }

  /* ---------------- Who a client is ---------------- */
  function who(key) {
    const id = key.slice(2);
    if (key.charAt(0) === 'm') {
      const m = Club.members.get(id), t = m ? Club.members.tier(m) : null;
      return { key: key, kind: 'member', id: id, m: m, name: m ? Club.members.name(m) : 'Former member', type: 'Member', cat: m ? (t ? t.name : 'No category') : 'Former members', catWord: m && t ? t.name + ' member' : 'member' };
    }
    const p = S.find('publicPlayers', id);
    return { key: key, kind: 'public', id: id, p: p, name: p ? ([p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Public golfer') : 'Public golfer, account closed', type: 'Public', cat: 'Public golfers', catWord: 'public golfer' };
  }

  /* ---------------- Totals for a date range ---------------- */
  function blank(key) { return { key: key, has: false, total: 0, dues: 0, depts: {}, months: {}, days: {}, dining: {}, rounds: 0, lessons: 0, items: {} }; }
  function aggregate(L, from, to) {
    const map = {};
    function slot(key) { return map[key] || (map[key] = blank(key)); }
    L.entries.forEach(function (e) {
      if (e.date < from || e.date > to) return;
      const c = slot(e.key), k = e.date.slice(0, 7), mo = c.months[k] || (c.months[k] = { all: 0, dues: 0 });
      c.has = true; c.total += e.amount; c.depts[e.dept] = (c.depts[e.dept] || 0) + e.amount; mo.all += e.amount;
      if (e.dept === 'Dues') { c.dues += e.amount; mo.dues += e.amount; return; }
      e.items.forEach(function (it) { const x = c.items[it.name] || (c.items[it.name] = { name: it.name, qty: 0, amount: 0 }); x.qty += it.qty; x.amount += it.amount; });
      if (e.amount <= 0 || e.online) return;
      c.days[e.date] = 1;
      if (e.dept === 'Dining') c.dining[e.date] = 1;
    });
    L.visits.forEach(function (v) {
      if (v.date < from || v.date > to) return;
      const c = slot(v.key);
      c.days[v.date] = 1;
      if (v.t === 'round') c.rounds++; else if (v.t === 'lesson') c.lessons++; else c.dining[v.date] = 1;
    });
    Object.keys(map).forEach(function (k) {
      const c = map[k];
      c.total = r2(c.total); c.dues = r2(c.dues); c.spend = r2(c.total - c.dues);
      c.visits = Object.keys(c.days).length; c.diningVisits = Object.keys(c.dining).length;
      c.who = who(k);
    });
    return map;
  }
  function valueOf(c, inc) { return c ? (inc ? c.total : c.spend) : 0; }
  /** A client's departments under the dues switch, largest first. */
  function deptsOf(c, inc) {
    return DEPTS.filter(function (d) { return (inc || d !== 'Dues') && c.depts[d]; }).map(function (d) { return { label: d, value: r2(c.depts[d]) }; }).sort(function (a, b) { return b.value - a.value; });
  }
  function mainDept(c, inc) { const d = deptsOf(c, inc)[0]; return d && d.value > 0 ? d.label : ''; }
  /** Clients with spend under the dues switch, largest first. aud: 'all' | 'member' | 'public'. */
  function ranking(map, inc, aud) {
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (c) { return c.has && valueOf(c, inc) !== 0 && (aud === 'all' || !aud || c.who.kind === aud); })
      .sort(function (a, b) { return valueOf(b, inc) - valueOf(a, inc) || a.who.name.localeCompare(b.who.name); });
  }

  /* ---------------- One client's figures ---------------- */
  function monthsOf(c, range, L, inc) {
    const start = L.first.spend && L.first.spend > range.from ? L.first.spend : range.from, out = [];
    if (start > range.to) return out;
    const cross = start.slice(0, 4) !== range.to.slice(0, 4);
    for (let k = start.slice(0, 7); k <= range.to.slice(0, 7); k = H.shiftKey(k, 1)) {
      const mo = c.months[k], v = mo ? (inc ? mo.all : mo.all - mo.dues) : 0;
      const whole = range.from <= k + '-01' && range.to >= monthEnd(k) && (!L.first.spend || L.first.spend <= k + '-01');
      out.push({ key: k, label: H.monthLabel(k, cross), value: r2(v), whole: whole });
    }
    return out;
  }
  /** range: { from, to, label, prev: { from, to, label } | null }. The earlier period compares only when records cover it. */
  function forClient(key, range, incDues, L) {
    L = L || buildLedger();
    const inc = !!incDues, map = aggregate(L, range.from, range.to);
    const c = map[key] || Object.assign(blank(key), { spend: 0, visits: 0, diningVisits: 0, who: who(key) });
    const everyone = ranking(map, inc, 'all'), kind = everyone.filter(function (x) { return x.who.kind === c.who.kind; });
    const cat = everyone.filter(function (x) { return x.who.cat === c.who.cat; });
    const v = valueOf(c, inc), totalAll = sum(everyone, function (x) { return valueOf(x, inc); });
    const prevOn = !!(range.prev && L.first.spend && L.first.spend <= range.prev.from);
    const prevMap = prevOn ? aggregate(L, range.prev.from, range.prev.to) : null;
    const items = Object.keys(c.items).map(function (k) { return c.items[k]; }).filter(function (it) { return it.qty > 0 && it.amount > 0; }).sort(function (a, b) { return b.qty - a.qty || b.amount - a.amount; });
    const wd = [0, 0, 0, 0, 0, 0, 0]; Object.keys(c.days).forEach(function (d) { wd[F.toDate(d).getDay()]++; });
    const busiest = c.visits ? wd.indexOf(Math.max.apply(null, wd)) : -1;
    return {
      key: key, c: c, who: c.who, range: range, inc: inc, value: v, any: c.has || c.visits > 0,
      depts: deptsOf(c, inc), months: monthsOf(c, range, L, inc), items: items,
      perVisit: c.visits ? c.spend / c.visits : 0, busiest: busiest >= 0 ? WEEKDAYS[busiest] : '', busiestN: busiest >= 0 ? wd[busiest] : 0,
      prevOn: prevOn, prevValue: prevOn ? valueOf(prevMap[key], inc) : 0,
      rankAll: everyone.indexOf(c) + 1, nAll: everyone.length, rankKind: kind.indexOf(c) + 1, nKind: kind.length,
      totalAll: totalAll, share: pct1(v, totalAll), allAvg: everyone.length ? totalAll / everyone.length : 0,
      catN: cat.length, catAvg: cat.length ? sum(cat, function (x) { return valueOf(x, inc); }) / cat.length : 0, first: L.first
    };
  }

  /* ---------------- The breakdown (drawer in Reports, Spending tab on the member page) ---------------- */
  function changeSub(st) {
    if (st.range.all) return '<span class="muted">Everything on file</span>';
    if (!st.range.prev || !st.prevOn) return '<span class="muted">The period before is not on file</span>';
    if (!(st.prevValue > 0)) return '<span class="muted">Nothing in the period before</span>';
    const d = H.pctChange(st.value, st.prevValue);
    return '<span class="delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%</span> <span class="muted">vs previous period</span>';
  }
  function againstAvg(v, avg) { if (!avg) return null; return Math.round((v - avg) / avg * 100); }
  function coverageNote(st) {
    const f = st.first, r = st.range, bits = [];
    if (f.tee && f.tee > r.from) bits.push('the tee sheet from ' + F.dateShort(f.tee));
    if (st.who.kind === 'member' && f.res && f.res > r.from) bits.push('dining reservations from ' + F.dateShort(f.res));
    if (f.lesson && f.lesson > r.from) bits.push('lessons from ' + F.dateShort(f.lesson));
    return bits.length ? 'Rounds, dining visits and lessons are counted from the records on file: ' + H.joinAnd(bits) + '.' : '';
  }
  function breakdownHTML(st) {
    const c = st.c, w = st.who, v = st.value, duesWord = st.inc ? 'dues included' : 'dues excluded';
    if (!st.any) return '<div class="dd-empty">' + U.empty({ icon: 'billing', title: 'No spending on file', text: w.name + ' has no purchases or visits on file for ' + st.range.label + '.' }) + '</div>';
    const vsCat = againstAvg(v, st.catAvg);
    let html = H.rKpis([
      { label: 'Spend', value: money0(v), sub: changeSub(st) },
      { label: 'Visits', value: F.num(c.visits), sub: esc(c.visits ? money0(st.perVisit) + ' a visit' : 'None on file') },
      { label: 'Rank', value: st.rankAll ? st.rankAll + ' of ' + st.nAll : 'None', sub: esc(st.rankAll ? st.share + '% of all client spend' : 'No spend in this period') },
      { label: 'Against the average', value: vsCat == null || st.catN < 2 ? 'None' : (vsCat >= 0 ? '+' : '') + vsCat + '%', sub: esc(st.catN >= 2 ? 'Average ' + w.catWord + ' ' + money0(st.catAvg) : 'No other ' + w.catWord + ' to compare') }
    ]);

    /* By department */
    const pos = st.depts.filter(function (d) { return d.value > 0; }), credits = st.depts.filter(function (d) { return d.value < 0; });
    html += H.rSec('By department', esc(duesWord.charAt(0).toUpperCase() + duesWord.slice(1)), pos.length
      ? Club.charts.ranked(pos, { total: sum(pos, function (d) { return d.value; }), fmt: money0 }) +
        (credits.length ? H.rNote('Credits outweigh purchases in ' + H.joinAnd(credits.map(function (d) { return d.label.toLowerCase() + ' (' + money0(d.value) + ')'; })) + '.') : '')
      : H.rNote('No purchases in this period' + (st.inc ? '.' : ' beyond dues.')));

    /* Over time */
    const ms = st.months;
    if (ms.length) {
      const rows = ms.map(function (m, i) {
        const p = i ? ms[i - 1] : null;
        let ch = '<span class="muted">-</span>';
        if (p && p.whole && m.whole && p.value > 0) { const d = H.pctChange(m.value, p.value); ch = '<span class="rd-chg ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '%</span>'; }
        return ['<span class="primary-cell">' + esc(m.label + (m.whole ? '' : '*')) + '</span>', ch, '<strong>' + esc(money0(m.value)) + '</strong>'];
      }).reverse();
      html += H.rSec('Over time', 'Spend by month',
        (ms.length > 1 ? Club.charts.bar({ labels: ms.map(function (m) { return m.label.replace(/ \d{4}$/, '') + (m.whole ? '' : '*'); }), series: [{ name: 'Spend', values: ms.map(function (m) { return Math.max(0, m.value); }), color: 'var(--viz-1)' }], money: true, height: H.px(180) }) : '') +
        H.rTable([{ label: 'Month' }, { label: 'Change', num: true }, { label: 'Spend', num: true }], rows, ['Total', changeCell(st.value, st.prevValue, st.prevOn), esc(money0(v))]) +
        H.rNote((ms.some(function (m) { return !m.whole; }) ? 'Months marked * are partial, so they are not compared. ' : '') + 'Each month is compared with the month before; the total with ' +
          (st.range.all ? 'nothing, because this is everything on file.' : !st.range.prev ? 'the period before, which is not on file.' : st.prevOn ? st.range.prev.label + '.' : st.range.prev.label + ', which is not on file.')));
    }

    /* Visits and habits */
    const kv = [['Rounds played', F.num(c.rounds)], ['Dining visits', F.num(c.diningVisits)], ['Lessons taken', F.num(c.lessons)],
      ['Average spend per visit', c.visits ? F.money(st.perVisit) + ' over ' + c.visits + ' ' + plural(c.visits, 'visit') : 'No visits on file'],
      ['Busiest day', st.busiest ? st.busiest + ', ' + st.busiestN + ' of ' + c.visits + ' ' + plural(c.visits, 'visit') : 'No visits on file']];
    const top = st.items.slice(0, 5), note = coverageNote(st);
    html += H.rSec('Visits and habits', '', '<dl class="rg-kv">' + kv.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' + (note ? H.rNote(note) : ''));
    html += H.rSec('Most-bought items', top.length ? 'Top ' + top.length + ' of ' + st.items.length : '', top.length
      ? H.rTable([{ label: 'Item' }, { label: 'Times', num: true }, { label: 'Amount', num: true }], top.map(function (it) { return [esc(it.name), F.num(it.qty), esc(money0(it.amount))]; }))
      : H.rNote('No itemised purchases in this period.'));

    /* Compared with others */
    const kindWord = w.kind === 'member' ? 'members' : 'public golfers', vsAll = againstAvg(v, st.allAvg);
    const cmp = [['<span class="primary-cell">' + esc(w.name) + '</span>', '<span class="muted">-</span>', '<strong>' + esc(money0(v)) + '</strong>']];
    function avgRow(label, avg, d) { cmp.push([esc(label), d == null ? '<span class="muted">-</span>' : '<span class="rd-chg ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '%</span>', esc(money0(avg))]); }
    if (st.catN >= 2) avgRow('Average ' + w.catWord + ' (' + st.catN + ')', st.catAvg, vsCat);
    if (st.nAll >= 2) avgRow('Average client (' + st.nAll + ')', st.allAvg, vsAll);
    const first = w.name.split(' ')[0];
    const line = !st.rankAll ? first + ' has no spend in this period, so there is no rank to show.'
      : H.sents([first + ' ranks ' + ordinal(st.rankAll) + ' of ' + st.nAll + ' ' + plural(st.nAll, 'client') + ' and ' + ordinal(st.rankKind) + ' of ' + st.nKind + ' ' + kindWord + ', with ' + st.share + '% of all client spend.',
        st.catN >= 2 && vsCat != null ? 'That is ' + (vsCat === 0 ? 'level with' : Math.abs(vsCat) + '% ' + (vsCat > 0 ? 'above' : 'below')) + ' the average ' + w.catWord + ' who spent in this period.' : '']);
    html += H.rSec('Compared with others', '', H.rTable([{ label: 'Spend in this period' }, { label: w.name.split(' ')[0] + ' against it', num: true }, { label: 'Amount', num: true }], cmp) + H.rNote(line));
    html += H.rNote('Spend is what was charged to the account or paid by card or cash, less credits, ' + duesWord + '. A visit is a day with a purchase at the club, a round played, a dining reservation kept or a lesson taken; the average per visit leaves dues out.');
    return html;
  }
  function changeCell(cur, prev, on) {
    if (!on || !(prev > 0)) return '<span class="muted">-</span>';
    const d = H.pctChange(cur, prev);
    return '<span class="rd-chg ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + '%</span>';
  }
  function clientCSV(st) {
    const c = st.c, w = st.who;
    return [['Client', w.name], ['Type', w.type + (w.kind === 'member' ? ', ' + w.cat : ' golfer')], ['Period', st.range.from + ' to ' + st.range.to], ['Dues', st.inc ? 'Included' : 'Excluded'],
      ['Spend', st.value.toFixed(2)], ['Previous period', st.prevOn ? st.prevValue.toFixed(2) : 'Not on file'], ['Rank', st.rankAll ? st.rankAll + ' of ' + st.nAll : ''], ['Share of all client spend', st.share + '%'],
      ['Average ' + w.catWord, st.catAvg.toFixed(2)], [], ['Department', 'Spend']].concat(st.depts.map(function (d) { return [d.label, d.value.toFixed(2)]; }))
      .concat([[], ['Month', 'Spend']]).concat(st.months.map(function (m) { return [m.key + (m.whole ? '' : ' (partial)'), m.value.toFixed(2)]; }))
      .concat([[], ['Visits', c.visits], ['Rounds played', c.rounds], ['Dining visits', c.diningVisits], ['Lessons taken', c.lessons], ['Average spend per visit', st.perVisit.toFixed(2)], ['Busiest day', st.busiest], [], ['Item', 'Times', 'Amount']])
      .concat(st.items.map(function (it) { return [it.name, it.qty, it.amount.toFixed(2)]; }));
  }

  /* ---------------- The Spending tab on the staff member page ---------------- */
  const TAB_KEY = 'stboniface.members.spending';
  const TAB_PERIODS = [{ value: 'season', label: 'This season' }, { value: 'm12', label: 'Last 12 months' }, { value: 'all', label: 'All time' }];
  function tabRange(kind, L) {
    const T = today(), y = +T.slice(0, 4);
    if (kind === 'season') {
      const sy = T < y + '-04-01' ? y - 1 : y, to = T < sy + '-10-31' ? T : sy + '-10-31';
      return { from: sy + '-04-01', to: to, label: 'the ' + sy + ' season, April to October', prev: { from: (sy - 1) + '-04-01', to: (sy - 1) + to.slice(4), label: 'the ' + (sy - 1) + ' season' } };
    }
    if (kind === 'all') { const f = L.first.spend && L.first.spend < T ? L.first.spend : T; return { from: f, to: T, label: 'all the records on file, from ' + F.date(f), prev: null, all: true }; }
    const from = H.shiftKey(T.slice(0, 7), -11) + '-01', pf = H.shiftKey(from.slice(0, 7), -12) + '-01';
    return { from: from, to: T, label: 'the last 12 months', prev: { from: pf, to: Dt.addDays(from, -1), label: 'the 12 months before' } };
  }
  function seg(items, selected, name, label) {
    return '<div class="segmented" role="group" aria-label="' + esc(label) + '" data-name="' + esc(name) + '">' + items.map(function (i) {
      return '<button type="button" data-value="' + esc(i.value) + '" class="' + (i.value === selected ? 'active' : '') + '" aria-pressed="' + (i.value === selected) + '">' + esc(i.label) + '</button>';
    }).join('') + '</div>';
  }
  const DUES_OPTS = [{ value: 'ex', label: 'Excluding dues' }, { value: 'in', label: 'Including dues' }];
  function memberTab(p, m) {
    let period = 'm12', inc = false;
    try { const o = JSON.parse(localStorage.getItem(TAB_KEY) || 'null'); if (o && TAB_PERIODS.some(function (x) { return x.value === o.period; })) { period = o.period; inc = !!o.inc; } } catch (e) { /* storage unavailable */ }
    function draw(focus) {
      const L = buildLedger(), range = tabRange(period, L), st = forClient('m:' + m.id, range, inc, L);
      p.innerHTML = '<section class="panel cl-tab" data-reveal><div class="panel-head cl-tab-head"><div><h3>Spending</h3><p class="cl-tab-range">' + esc(F.date(range.from) + ' to ' + F.date(range.to)) + '</p></div>' +
        '<div class="cl-filters">' + seg(TAB_PERIODS, period, 'period', 'Period') + seg(DUES_OPTS, inc ? 'in' : 'ex', 'dues', 'Dues') + '</div></div>' +
        '<div class="panel-body"><div class="rd cl-rd">' + breakdownHTML(st) + '</div>' +
        '<p class="cl-tab-foot"><a class="s-link" href="#/reports/clients">See every client in Reports</a></p></div></section>';
      U.animateIn(p);
      if (focus) { const b = p.querySelector('.segmented[data-name="' + focus + '"] button.active'); if (b) b.focus(); }
    }
    U.on(p, 'click', '.cl-filters .segmented button', function (e, b) {
      const name = b.closest('.segmented').dataset.name;
      if (name === 'period') period = b.dataset.value; else inc = b.dataset.value === 'in';
      try { localStorage.setItem(TAB_KEY, JSON.stringify({ period: period, inc: inc })); } catch (err) { /* ignore */ }
      draw(name);
    });
    draw();
  }

  Club.clientStats = { ledger: buildLedger, forClient: forClient, breakdownHTML: breakdownHTML, csv: clientCSV, memberTab: memberTab };

  /* =====================================================================
     The Reports section
     ===================================================================== */
  const FLT_KEY = 'stboniface.reports.clients';
  const AUD = [{ value: 'all', label: 'Everyone' }, { value: 'member', label: 'Members' }, { value: 'public', label: 'Public golfers' }];
  const flt = { aud: 'all', inc: false };
  try { const o = JSON.parse(localStorage.getItem(FLT_KEY) || 'null'); if (o && AUD.some(function (a) { return a.value === o.aud; })) { flt.aud = o.aud; flt.inc = !!o.inc; } } catch (e) { /* storage unavailable */ }
  let refocus = null, showAll = false;
  const TABLE_ROWS = 15;

  function ledger(ctx) { return H.memo(ctx, 'cl-ledger', buildLedger); }
  function current(ctx) { return H.memo(ctx, 'cl-cur', function () { return aggregate(ledger(ctx), ctx.from, ctx.to); }); }
  /** The earlier period, when the report has one and client records cover all of it. */
  function previous(ctx) {
    return H.memo(ctx, 'cl-prev', function () { const L = ledger(ctx); return H.coversPrev(ctx, L.first.spend) ? aggregate(L, ctx.prev.from, ctx.prev.to) : null; });
  }
  function audWord(n) { return flt.aud === 'member' ? plural(n, 'member') : flt.aud === 'public' ? plural(n, 'public golfer') : plural(n, 'client'); }
  function duesWord() { return flt.inc ? 'dues included' : 'dues excluded'; }
  function val(c) { return valueOf(c, flt.inc); }
  /** Everything the section shows under the current filters. */
  function view(ctx) {
    return H.memo(ctx, 'cl-view-' + flt.aud + '-' + flt.inc, function () {
      const list = ranking(current(ctx), flt.inc, flt.aud), prev = previous(ctx);
      const total = sum(list, val), spenders = list.filter(function (c) { return val(c) > 0; });
      const top10 = sum(list.slice(0, 10), val);
      const depts = {}, cats = {};
      list.forEach(function (c) {
        deptsOf(c, flt.inc).forEach(function (d) { const x = depts[d.label] || (depts[d.label] = { label: d.label, value: 0, n: 0 }); x.value += d.value; if (d.value > 0) x.n++; });
        const g = cats[c.who.cat] || (cats[c.who.cat] = { label: c.who.cat, value: 0, n: 0, kind: c.who.kind }); g.value += val(c); g.n++;
      });
      const sorted = spenders.map(val).sort(function (a, b) { return a - b; }), mid = sorted.length;
      const out = { list: list, total: total, n: spenders.length, avg: spenders.length ? total / spenders.length : 0, top10: top10, top10share: pct(top10, total),
        median: mid ? (mid % 2 ? sorted[(mid - 1) / 2] : (sorted[mid / 2 - 1] + sorted[mid / 2]) / 2) : 0,
        members: spenders.filter(function (c) { return c.who.kind === 'member'; }).length, publics: spenders.filter(function (c) { return c.who.kind === 'public'; }).length,
        depts: Object.keys(depts).map(function (k) { return depts[k]; }).sort(function (a, b) { return b.value - a.value; }),
        cats: Object.keys(cats).map(function (k) { return cats[k]; }).sort(function (a, b) { return b.value - a.value; }),
        prevOn: !!prev, prev: prev };
      if (prev) {
        const pl = ranking(prev, flt.inc, flt.aud), ps = pl.filter(function (c) { return val(c) > 0; });
        out.pTotal = sum(pl, val); out.pN = ps.length; out.pAvg = ps.length ? out.pTotal / ps.length : 0;
      }
      return out;
    });
  }
  function prevVal(v, c) { return v.prev ? valueOf(v.prev[c.key], flt.inc) : 0; }
  function typeText(c) { return c.who.kind === 'member' ? 'Member' : 'Public'; }

  /* ---------------- Headline numbers ---------------- */
  function kpis(ctx) {
    const v = view(ctx);
    const who_ = flt.aud === 'all' ? v.members + ' ' + plural(v.members, 'member') + ' and ' + v.publics + ' ' + plural(v.publics, 'public golfer') : flt.aud === 'member' ? 'Members only' : 'Public golfers only';
    return [
      { label: flt.aud === 'member' ? 'Members who spent' : flt.aud === 'public' ? 'Public golfers who spent' : 'Clients who spent', value: F.num(v.n), d: esc(who_), chg: v.prevOn ? H.pctVs(v.n, v.pN, ctx) : null, drill: 'ranking', aria: 'Clients who spent: ' + v.n },
      { label: 'Total spend', value: H.moneyShort(v.total), d: esc(flt.inc ? 'Dues included' : 'Dues excluded'), chg: v.prevOn ? H.pctVs(v.total, v.pTotal, ctx) : null, drill: 'ranking', aria: 'Total spend ' + money0(v.total) },
      { label: 'Average per client', value: money0(v.avg), d: esc(v.n ? 'Half spent ' + money0(v.median) + ' or less' : 'No spend in this period'), chg: v.prevOn ? H.pctVs(v.avg, v.pAvg, ctx) : null, drill: 'ranking' },
      { label: 'From the top 10 clients', value: v.top10share + '%', d: esc(v.n ? money0(v.top10) + ' of ' + money0(v.total) : 'No spend in this period'), drill: 'ranking', aria: 'Share of spend from the top 10 clients: ' + v.top10share + '%' }
    ];
  }

  /* ---------------- Top spenders (main chart) ---------------- */
  function subOf(c) { const d = mainDept(c, flt.inc); return (c.who.kind === 'member' ? c.who.cat + ' member' : 'Public golfer') + (d ? ', mostly ' + d.toLowerCase() : ''); }
  function main(ctx) {
    const v = view(ctx), top = v.list.slice(0, 10), a = top[0];
    const take = !v.list.length ? 'No ' + audWord(2) + ' spent anything in this period, ' + duesWord() + '.'
      : a.who.name + ' spent the most, ' + money0(val(a)) + (mainDept(a, flt.inc) ? ', mostly on ' + mainDept(a, flt.inc).toLowerCase() : '') + '. ' + v.n + ' ' + audWord(v.n) + ' spent ' + money0(v.total) + ' in all, ' + duesWord() + '.';
    const body = top.length ? Club.charts.ranked(top.map(function (c) {
      return { label: c.who.name, sub: subOf(c), value: val(c), attrs: 'data-drill="client" data-arg="' + esc(c.key) + '" aria-haspopup="dialog" aria-label="' + esc(c.who.name + ' ' + money0(val(c)) + ', ' + pct(val(c), v.total) + '% of spend. See their breakdown') + '"' };
    }), { total: v.total, fmt: money0 }) : '<p class="rp-empty">Nothing to rank yet.</p>';
    return { id: 'clients-top', title: 'Top spenders', take: take, body: body, desc: topDesc(ctx, v), foot: v.list.length ? 'The share beside each bar is of all spend shown.' : '', csvId: 'clients', drill: 'ranking', drillLabel: v.list.length > 10 ? 'See all ' + v.list.length : 'See the table' };
  }
  function topDesc(ctx, v) {
    if (!v.list.length) return H.sents(['This chart ranks clients by what they spent at the club in the selected dates.', 'Nothing is on file for these filters, so choose a longer period or another group.']);
    const one = v.list.filter(function (c) { return deptsOf(c, false).filter(function (d) { return d.value > 0; }).length === 1; }).length;
    return H.sents(['Each row is one client\'s spend in this period: house-account charges plus anything paid by card or cash, less credits.',
      v.list.length > 10 ? 'The ten shown spent ' + money0(v.top10) + ' together, ' + v.top10share + '% of the ' + money0(v.total) + ' spent by ' + v.n + ' ' + audWord(v.n) + '.' : 'Together they spent ' + money0(v.total) + '.',
      v.n ? 'The average was ' + money0(v.avg) + ' and half of them spent ' + money0(v.median) + ' or less' + (v.avg > v.median * 1.3 ? ', so a small group carries much of the total.' : ', so spending is spread fairly evenly.') : '',
      one ? one + ' ' + plural(one, 'client') + ' spent in only one department' + (flt.inc ? ' beyond dues' : '') + '.' : '']);
  }

  /* ---------------- Supporting panels ---------------- */
  function panels(ctx) {
    const v = view(ctx);
    const d0 = v.depts[0];
    const posD = v.depts.filter(function (d) { return d.value > 0; });
    const pDept = { id: 'clients-depts', title: 'Spend by department', take: !posD.length ? 'No spend to split in this period.' : d0.label + ' took the most, ' + money0(d0.value) + ', ' + pct(d0.value, v.total) + '% of spend' + (posD[1] ? ', ahead of ' + posD[1].label.toLowerCase() + ' at ' + pct(posD[1].value, v.total) + '%' : '') + '.',
      body: posD.length ? Club.charts.ranked(posD.map(function (d) { return { label: d.label, sub: d.n + ' ' + plural(d.n, 'client'), value: d.value, attrs: 'data-drill="ranking" data-arg="' + esc('dept:' + d.label) + '" aria-haspopup="dialog" aria-label="' + esc(d.label + ' ' + money0(d.value) + ', ' + pct(d.value, v.total) + '% of spend. See who spent there') + '"' }; }), { total: v.total, fmt: money0 }) : '<p class="rp-empty">Nothing on file for these filters.</p>',
      desc: deptDesc(v, posD), csvId: 'clients-depts', drill: 'ranking', drillLabel: 'See every client' };
    const c0 = v.cats.slice().sort(function (a, b) { return b.value / b.n - a.value / a.n; })[0];
    const pCat = { id: 'clients-cats', title: 'Spend by membership category', take: !v.cats.length ? 'No spend to split in this period.' : v.cats[0].label + ' ' + (v.cats[0].kind === 'member' ? 'members ' : '') + 'spent the most together, ' + money0(v.cats[0].value) + '.' + (v.cats.length > 1 && c0 ? (c0 === v.cats[0] ? ' They also spent the most each, ' : ' ' + c0.label + ' ' + (c0.kind === 'member' ? 'members ' : '') + 'spent the most each, ') + money0(c0.value / c0.n) + ' on average.' : ''),
      body: v.cats.length ? Club.charts.ranked(v.cats.map(function (g) { return { label: g.label, sub: g.n + ' ' + plural(g.n, 'client') + ', ' + money0(g.value / g.n) + ' each on average', value: g.value, attrs: 'data-drill="ranking" data-arg="' + esc('cat:' + g.label) + '" aria-haspopup="dialog" aria-label="' + esc(g.label + ' ' + money0(g.value) + '. See these clients') + '"' }; }), { total: v.total, fmt: money0 }) : '<p class="rp-empty">Nothing on file for these filters.</p>',
      desc: catDesc(v), csvId: 'clients-cats', drill: 'ranking', drillLabel: 'See every client' };
    return [pDept, pCat, tablePanel(ctx, v)];
  }
  function deptDesc(v, posD) {
    if (!posD.length) return H.sents(['Each row will show one department\'s share of client spend.', 'Nothing is on file for these filters.']);
    const small = posD[posD.length - 1], wide = posD.slice().sort(function (a, b) { return b.n - a.n; })[0];
    return H.sents(['Each row is one department\'s share of the ' + money0(v.total) + ' these ' + audWord(v.n) + ' spent, with the number of clients who bought there.',
      wide ? wide.label + ' reached the most clients, ' + wide.n + ' of ' + v.n + '.' : '',
      posD.length > 2 ? 'The smallest, ' + small.label.toLowerCase() + ', took ' + money0(small.value) + ' from ' + small.n + ' ' + plural(small.n, 'client') + '.' : '',
      'Select a department to see who spent the most there.']);
  }
  function catDesc(v) {
    if (!v.cats.length) return H.sents(['Each row will show one membership category, with public golfers as their own group.', 'Nothing is on file for these filters.']);
    const pub = v.cats.filter(function (g) { return g.kind === 'public'; })[0], mem = v.cats.filter(function (g) { return g.kind === 'member'; });
    const mN = sum(mem, function (g) { return g.n; }), mV = sum(mem, function (g) { return g.value; });
    return H.sents(['Each row is one membership category, with public golfers as their own group, and the average spend of a client in it.',
      pub && mN ? 'The average member spent ' + money0(mV / mN) + ' and the average public golfer ' + money0(pub.value / pub.n) + '.' : '',
      'A client\'s breakdown compares them with the average of their own category.']);
  }

  /* ---------------- The table of every client ---------------- */
  function chgCell(v, c) { return changeCell(val(c), prevVal(v, c), v.prevOn); }
  function nameCell(c) {
    return c.who.kind === 'member' && c.who.m ? '<a class="primary-cell" href="#/members/' + esc(c.who.id) + '">' + esc(c.who.name) + '</a>' : '<span class="primary-cell">' + esc(c.who.name) + '</span>';
  }
  function tablePanel(ctx, v) {
    const rows = showAll ? v.list : v.list.slice(0, TABLE_ROWS);
    const body = !v.list.length ? '<p class="rp-empty">No one to list for these filters.</p>' :
      '<div class="table-wrap"><table class="table cl-table"><thead><tr><th class="num cl-rank">Rank</th><th>Client</th><th class="cl-hide-s">Type</th><th class="num">Spend</th><th class="cl-hide-s">Main department</th><th class="num cl-hide-s">Visits</th><th class="num">Change</th></tr></thead><tbody>' +
      rows.map(function (c, i) {
        return '<tr class="clickable" data-cl-open="' + esc(c.key) + '" tabindex="0" aria-haspopup="dialog" aria-label="' + esc(c.who.name + ', ' + money0(val(c)) + '. See their breakdown') + '"><td class="num cl-rank">' + (i + 1) + '</td><td>' + nameCell(c) +
          '<div class="dd-sub cl-show-s">' + esc(typeText(c) + (mainDept(c, flt.inc) ? ', ' + mainDept(c, flt.inc).toLowerCase() : '')) + '</div></td>' +
          '<td class="cl-hide-s">' + esc(typeText(c)) + '<div class="dd-sub">' + esc(c.who.kind === 'member' ? c.who.cat : 'Online account') + '</div></td>' +
          '<td class="num"><strong>' + esc(money0(val(c))) + '</strong></td><td class="cl-hide-s">' + esc(mainDept(c, flt.inc) || 'None') + '</td><td class="num cl-hide-s">' + F.num(c.visits) + '</td><td class="num">' + chgCell(v, c) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td class="cl-rank"></td><td>Total, ' + v.list.length + ' ' + audWord(v.list.length) + '</td><td class="cl-hide-s"></td><td class="num">' + esc(money0(v.total)) + '</td><td class="cl-hide-s"></td><td class="cl-hide-s"></td><td class="num">' + changeCell(v.total, v.pTotal, v.prevOn) + '</td></tr></tfoot></table></div>' +
      (v.list.length > TABLE_ROWS ? '<div class="cl-more"><button type="button" class="rp-link" data-cl-all>' + (showAll ? 'Show the top ' + TABLE_ROWS : 'Show all ' + v.list.length) + '</button></div>' : '');
    return { id: 'clients-table', cls: 'wide', title: 'Every client by spend', take: !v.list.length ? 'No ' + audWord(2) + ' spent anything in this period.' : 'Ranked by spend in this period, ' + duesWord() + '. Select a client to see their breakdown.',
      body: body, foot: esc(v.prevOn ? 'Change is against ' + ctx.prev.label + '.' : 'The period before is not on file, so no change is shown.'), csvId: 'clients' };
  }

  /* ---------------- CSV ---------------- */
  function listCSV(ctx, list) {
    const v = view(ctx), cols = DEPTS.filter(function (d) { return flt.inc || d !== 'Dues'; }).filter(function (d) { return list.some(function (c) { return c.depts[d]; }); });
    return [['Rank', 'Client', 'Type', 'Category', 'Member no', 'Spend', 'Main department', 'Visits', 'Rounds', 'Dining visits', 'Lessons', 'Previous period', 'Change %'].concat(cols)].concat(list.map(function (c, i) {
      const p = prevVal(v, c), w = c.who;
      return [i + 1, w.name, w.kind === 'member' ? 'Member' : 'Public golfer', w.kind === 'member' ? w.cat : '', w.m ? w.m.memberNo : '', val(c).toFixed(2), mainDept(c, flt.inc), c.visits, c.rounds, c.diningVisits, c.lessons,
        v.prevOn ? p.toFixed(2) : 'Not on file', v.prevOn && p > 0 ? H.pctChange(val(c), p) : ''].concat(cols.map(function (d) { return r2(c.depts[d]).toFixed(2); }));
    })).concat([[], ['Filters', AUD.filter(function (a) { return a.value === flt.aud; })[0].label, flt.inc ? 'Including dues' : 'Excluding dues', ctx.from + ' to ' + ctx.to]]);
  }
  function csv(ctx) {
    const v = view(ctx);
    return [
      { id: 'clients', title: 'Clients by spend', rows: listCSV(ctx, v.list) },
      { id: 'clients-depts', title: 'Client spend by department', rows: [['Department', 'Spend', 'Share', 'Clients']].concat(v.depts.map(function (d) { return [d.label, d.value.toFixed(2), pct1(d.value, v.total) + '%', d.n]; })) },
      { id: 'clients-cats', title: 'Client spend by membership category', rows: [['Category', 'Clients', 'Spend', 'Average per client']].concat(v.cats.map(function (g) { return [g.label, g.n, g.value.toFixed(2), (g.value / g.n).toFixed(2)]; })) }
    ];
  }

  /* ---------------- Drill drawers ---------------- */
  function clientRange(ctx) { return { from: ctx.from, to: ctx.to, label: ctx.line, prev: ctx.prev ? { from: ctx.prev.from, to: ctx.prev.to, label: ctx.prev.label } : null }; }
  function clientDrill(ctx, key) {
    const st = forClient(String(key), clientRange(ctx), flt.inc, ledger(ctx)), w = st.who;
    const intro = w.kind === 'member'
      ? (w.m ? '<a class="primary-cell" href="#/members/' + esc(w.id) + '">' + esc(w.name) + '</a>' + esc(', ' + w.cat + ' member, No. ' + w.m.memberNo) : esc('A former member whose record is no longer on file'))
      : esc(w.name + ', public golfer' + (w.p && w.p.createdAt ? ' with an online account since ' + F.date(String(w.p.createdAt).slice(0, 10)) : ''));
    return { title: w.name, body: '<p class="cl-who" data-reveal>' + intro + '</p>' + breakdownHTML(st), csv: clientCSV(st), csvId: 'client-' + w.id,
      go: w.kind === 'member' && w.m ? 'members/' + w.id + '/spending' : null, goLabel: w.kind === 'member' && w.m ? 'Open profile' : null, noNotes: true };
  }
  function rankingDrill(ctx, arg) {
    const v = view(ctx);
    let list = v.list, title = flt.aud === 'member' ? 'Members by spend' : flt.aud === 'public' ? 'Public golfers by spend' : 'Clients by spend', amount = val, what = 'Spend';
    arg = String(arg || '');
    if (arg.indexOf('dept:') === 0) {
      const d = arg.slice(5);
      amount = function (c) { return r2(c.depts[d]); };
      list = v.list.filter(function (c) { return amount(c) > 0; }).sort(function (a, b) { return amount(b) - amount(a); });
      title = d + ' spend by client'; what = d;
    } else if (arg.indexOf('cat:') === 0) {
      const g = arg.slice(4);
      list = v.list.filter(function (c) { return c.who.cat === g; }); title = g + (g === 'Public golfers' ? '' : ' members') + ' by spend';
    }
    const total = sum(list, amount);
    let body = H.rKpis([
      { label: 'Clients', value: F.num(list.length), sub: esc(flt.inc ? 'Dues included' : 'Dues excluded') },
      { label: what, value: money0(total), sub: esc(ctx.line) },
      { label: 'Average', value: money0(list.length ? total / list.length : 0), sub: esc('Per client listed') },
      { label: 'Top spender', value: list.length ? money0(amount(list[0])) : 'None', sub: esc(list.length ? list[0].who.name : '') }
    ]);
    body += H.rSec('Ranked by spend', list.length ? 'Select a name for the breakdown' : '', list.length ? H.rTable([{ label: 'Rank', num: true }, { label: 'Client' }, { label: 'Share' }, { label: what, num: true }],
      list.map(function (c, i) {
        const sh = pct(amount(c), total);
        return [String(i + 1), '<button type="button" class="cl-name" data-cl-client="' + esc(c.key) + '">' + esc(c.who.name) + '</button><div class="dd-sub">' + esc(subOf(c)) + '</div>',
          '<span class="rd-fill"><span class="bar"><span style="width:' + Math.max(0, Math.min(100, sh)) + '%"></span></span>' + sh + '%</span>', '<strong>' + esc(money0(amount(c))) + '</strong>'];
      }), ['', 'Total', '', esc(money0(total))]) : H.rNote('No one to list for these filters.'));
    return { title: title, body: body, csv: listCSV(ctx, list), csvId: 'clients-list', noNotes: true, wire: function (api, c, open) {
      U.on(api.el, 'click', '[data-cl-client]', function (e, b) { const k = b.dataset.clClient; api.close(); setTimeout(function () { open(clientDrill(ctx, k)); }, 200); });
    } };
  }

  /* ---------------- Ideas to grow revenue ----------------
     Thirteen ideas: three here, ten more below (see "Ten more ideas"), each with the list of clients behind it (a drill drawer). They follow the Show filter (everyone,
     members, public golfers) and always leave dues out: dues are billed, not a sign of anyone using the club.
       quiet     Big spenders gone quiet. "Earlier" runs from the start of the period (or of client records) to 31 days
                 before the period ends; "recent" is the last 30 days of the period. A big spender is in the top quarter
                 by earlier spend; quiet means recent spend is a quarter or less of their own earlier 30-day average.
                 When the recent days fall outside April to October, green fees and the beverage cart are left out of
                 both sides, so the course closing does not make every golfer look quiet.
       nodine    Members who play often but never dine: rounds at or above the threshold (three, or two a month over the
                 tee sheet days in the period, whichever is more) with no dining charge and no dining visit. Needs 14
                 tee sheet days and 28 days of spending records in the period.
       onedept   Clients who spent in one department only, against the second-largest department of clients in the same
                 membership category (public golfers together) who spent in two or more.
     An idea is left out when the records are too short to support it (see the MIN_ constants). */
  const MONTH = 30.4375, QUIET_DAYS = 30, MIN_EARLIER_DAYS = 30, MIN_POOL = 8, QUIET_SHARE = 0.25, MIN_TEE_DAYS = 14, MIN_SPEND_DAYS = 28, MIN_PEERS = 3;
  const COURSE_DEPTS = { Golf: 1, 'Beverage cart': 1 };
  function audOK(c) { return flt.aud === 'all' || c.who.kind === flt.aud; }
  /** Someone the club can still reach: an active member, or a public golfer whose account is open. */
  function reachable(c) { return c.who.kind === 'member' ? !!(c.who.m && c.who.m.status === 'active') : !!c.who.p; }
  function audPhrase(n) { return flt.aud === 'member' ? plural(n, 'member') : flt.aud === 'public' ? plural(n, 'public golfer') : plural(n, 'client'); }
  function spendFrom(ctx) { const f = ledger(ctx).first.spend; return f && f > ctx.from ? f : ctx.from; }
  function posDepts(c) { return deptsOf(c, false).filter(function (d) { return d.value > 0; }); }

  function quietData(ctx) {
    return H.memo(ctx, 'cl-quiet-' + flt.aud, function () {
      const L = ledger(ctx), f = L.first.spend;
      if (!f || f > ctx.to) return null;
      const rFrom = Dt.addDays(ctx.to, -(QUIET_DAYS - 1)), eFrom = spendFrom(ctx), eTo = Dt.addDays(rFrom, -1);
      if (eFrom > eTo) return null;
      const eDays = H.spanDays(eFrom, eTo);
      if (eDays < MIN_EARLIER_DAYS) return null;
      const winter = !H.inSeasonKey(rFrom.slice(0, 7)) || !H.inSeasonKey(ctx.to.slice(0, 7));
      const amt = function (c) { return c ? r2(sum(Object.keys(c.depts).filter(function (d) { return d !== 'Dues' && !(winter && COURSE_DEPTS[d]); }), function (d) { return c.depts[d]; })) : 0; };
      const early = aggregate(L, eFrom, eTo), recent = aggregate(L, rFrom, ctx.to);
      const pool = Object.keys(early).map(function (k) { return early[k]; }).filter(function (c) { return audOK(c) && reachable(c) && amt(c) > 0; })
        .sort(function (a, b) { return amt(b) - amt(a) || a.who.name.localeCompare(b.who.name); });
      if (pool.length < MIN_POOL) return null;
      const top = pool.slice(0, Math.ceil(pool.length / 4));
      const rows = top.map(function (c) { const e = amt(c), now = Math.max(0, amt(recent[c.key])); return { c: c, early: e, rate: e / eDays * QUIET_DAYS, now: now }; })
        .filter(function (r) { return r.now <= r.rate * QUIET_SHARE; }).sort(function (a, b) { return (b.rate - b.now) - (a.rate - a.now); });
      const gap = sum(rows, function (r) { return r.rate - r.now; });
      return { rows: rows, pool: pool.length, top: top.length, cutoff: amt(top[top.length - 1]), eFrom: eFrom, eTo: eTo, rFrom: rFrom, rTo: ctx.to, winter: winter,
        was: sum(rows, function (r) { return r.rate; }), now: sum(rows, function (r) { return r.now; }), gap: gap, amount: gap / 2, months: winter ? 12 : 7 };
    });
  }
  function noDineData(ctx) {
    return H.memo(ctx, 'cl-nodine', function () {
      if (flt.aud === 'public') return null;
      const L = ledger(ctx), tf = L.first.tee;
      if (!tf || tf > ctx.to || !L.first.spend || L.first.spend > ctx.to) return null;
      const from = tf > ctx.from ? tf : ctx.from, days = H.spanDays(from, ctx.to);
      if (days < MIN_TEE_DAYS || H.spanDays(spendFrom(ctx), ctx.to) < MIN_SPEND_DAYS) return null;
      const need = Math.max(3, Math.round(days / 15)), months = H.spanDays(spendFrom(ctx), ctx.to) / MONTH;
      const cur = current(ctx), members = Object.keys(cur).map(function (k) { return cur[k]; }).filter(function (c) { return c.who.kind === 'member' && reachable(c); });
      const diners = members.filter(function (c) { return c.depts.Dining > 0; });
      if (diners.length < MIN_PEERS || months < 0.2) return null;
      const avg = sum(diners, function (c) { return c.depts.Dining; }) / diners.length / months;
      const players = members.filter(function (c) { return c.rounds >= need; });
      const rows = players.filter(function (c) { return !(c.depts.Dining > 0) && !c.diningVisits; }).sort(function (a, b) { return b.rounds - a.rounds || a.who.name.localeCompare(b.who.name); });
      return { rows: rows, need: need, from: from, days: days, players: players.length, diners: diners.length, avg: avg, amount: rows.length * avg / 2, resFrom: L.first.res, spendFrom: spendFrom(ctx) };
    });
  }
  function oneDeptData(ctx) {
    return H.memo(ctx, 'cl-onedept-' + flt.aud, function () {
      const L = ledger(ctx), f = L.first.spend;
      if (!f || f > ctx.to) return null;
      const from = spendFrom(ctx), days = H.spanDays(from, ctx.to);
      if (days < MIN_SPEND_DAYS) return null;
      const months = days / MONTH, cur = current(ctx), everyone = Object.keys(cur).map(function (k) { return cur[k]; }).filter(reachable);
      const peers = {};
      everyone.forEach(function (c) {
        const d = posDepts(c);
        if (d.length < 2) return;
        const g = peers[c.who.cat] || (peers[c.who.cat] = { n: 0, second: 0, depts: {} });
        g.n++; g.second += d[1].value; g.depts[d[1].label] = (g.depts[d[1].label] || 0) + 1;
      });
      const rows = everyone.filter(function (c) { return audOK(c) && posDepts(c).length === 1; }).map(function (c) {
        const d = posDepts(c)[0], g = peers[c.who.cat], ok = !!(g && g.n >= MIN_PEERS);
        return { c: c, dept: d.label, value: d.value, peers: g ? g.n : 0, second: ok ? g.second / g.n / months : null };
      }).sort(function (a, b) { return b.value - a.value || a.c.who.name.localeCompare(b.c.who.name); });
      const est = rows.filter(function (r) { return r.second != null; });
      const depts = {}; rows.forEach(function (r) { depts[r.dept] = (depts[r.dept] || 0) + 1; });
      const lead = Object.keys(depts).sort(function (a, b) { return depts[b] - depts[a]; })[0];
      return { rows: rows, est: est.length, from: from, days: days, months: months, peers: peers, lead: lead, leadN: lead ? depts[lead] : 0,
        each: est.length ? sum(est, function (r) { return r.second; }) / est.length : 0, amount: sum(est, function (r) { return r.second; }) / 4 };
    });
  }
  function ideas(ctx) {
    const out = [], q = quietData(ctx), nd = noDineData(ctx), od = oneDeptData(ctx);
    if (q && q.rows.length) {
      const n = q.rows.length, left = q.winter ? ' Green fees and the beverage cart are left out of both, because the last 30 days fall outside the golf season.' : '';
      out.push({ id: 'quiet-spenders', title: 'Win back big spenders who have gone quiet',
        text: n + ' of the ' + q.top + ' biggest-spending ' + audPhrase(q.top) + ' from ' + F.dateShort(q.eFrom) + ' to ' + F.dateShort(q.eTo) + ' ' + (n === 1 ? 'has' : 'have') + ' spent little or nothing in the last 30 days: ' + money0(q.now) + ' together, against ' + money0(q.was) + ' in an average 30 days before. A call or a personal invitation that brings back half of what is missing would add about ' + money0(q.amount) + ' a month.',
        assume: 'A big spender is in the top quarter of the ' + q.pool + ' ' + audPhrase(q.pool) + ' who spent from ' + F.dateShort(q.eFrom) + ' to ' + F.dateShort(q.eTo) + ' (' + money0(q.cutoff) + ' or more, dues excluded). Quiet means ' + F.dateShort(q.rFrom) + ' to ' + F.dateShort(q.rTo) + ' came to a quarter or less of their own earlier 30-day average.' + left + ' Assumes half the gap comes back, over ' + (q.winter ? 'twelve months.' : 'the seven golf season months.'),
        amount: q.amount, per: 'a month', year: q.amount * q.months, drill: 'idea-quiet', drillLabel: n === 1 ? 'See who it is' : 'See the ' + n + ' ' + audPhrase(n) });
    }
    if (nd && nd.rows.length) {
      const n = nd.rows.length;
      out.push({ id: 'play-never-dine', title: 'Invite frequent golfers to the dining room',
        text: n + ' of the ' + nd.players + ' ' + plural(nd.players, 'member') + ' who played ' + nd.need + ' rounds or more since ' + F.dateShort(nd.from) + ' ' + (n === 1 ? 'has' : 'have') + ' no dining charge and no dining visit on file in this period. The ' + nd.diners + ' ' + plural(nd.diners, 'member') + ' who do dine spent ' + money0(nd.avg) + ' a month each in the dining room. A table offer after the round that brings half of them in would add about ' + money0(nd.amount) + ' a month.',
        assume: 'Counts active members with ' + nd.need + ' rounds or more in the ' + nd.days + ' tee sheet days of this period (three rounds, or two a month, whichever is more), no dining charge since ' + F.dateShort(nd.spendFrom) + ' and no reservation kept' + (nd.resFrom && nd.resFrom > ctx.from ? ' (reservations on file begin ' + F.dateShort(nd.resFrom) + ')' : '') + '. Takeout and the beverage cart are not dining. Assumes half of them dine at the average of members who do, for twelve months.',
        amount: nd.amount, per: 'a month', year: nd.amount * 12, drill: 'idea-nodine', drillLabel: n === 1 ? 'See who it is' : 'See the ' + n + ' members' });
    }
    if (od && od.rows.length) {
      const n = od.rows.length, rest = n - od.est;
      const since = od.from > ctx.from ? ' since ' + F.dateShort(od.from) : ' in this period';
      const text = [n + ' ' + audPhrase(n) + ' spent in one department only' + since + (od.lead ? ', ' + (od.leadN === n ? (n === 1 ? '' : 'all ') + 'in ' : od.leadN + ' of them in ') + od.lead.toLowerCase() : '') + '.'];
      if (od.est) text.push('Clients in the same membership category who use more of the club spent ' + money0(od.each) + ' a month in their second department. If one in four of ' + (rest ? 'the ' + od.est + ' with clients to compare' : 'them') + ' did the same, it would add about ' + money0(od.amount) + ' a month.');
      if (rest) text.push(od.est ? 'For the other ' + rest + ' there are too few similar clients on file to estimate from.' : 'Too few similar clients on file spent in two departments, so there is no estimate. An offer in a second department, such as a dining credit with a green fee, is the place to start.');
      out.push({ id: 'one-department', title: 'Offer a second department to one-department clients', text: H.sents(text),
        assume: 'Dues are never counted as a department. A similar client is in the same membership category (public golfers together) and spent in two or more departments; the figure is the average of their second-largest department a month, used when a category has ' + MIN_PEERS + ' or more of them.' + (od.est ? ' Assumes one in four adds a second department at that average, for twelve months.' : ' No estimate: no category has enough of them.'),
        amount: od.est ? od.amount : null, per: 'a month', year: od.est ? od.amount * 12 : 0, drill: 'idea-onedept', drillLabel: n === 1 ? 'See who it is' : 'See the ' + n + ' ' + audPhrase(n) });
    }
    return out.concat(moreIdeas(ctx));
  }

  /* ---- Ten more ideas (members' habits, spending levels, public golfers and new members). Same rules. ----
       dine-only        members with regular dining visits and no pro shop or lesson spend (and no lesson taken)
       no-extras        frequent golfers with no power cart and no guest green fee charge
       no-events        active members with no event charge and no event entry in the period
       one-weekday      clients with ONE_DAY_VISITS visits or more, all on the same day of the week
       below-category   active members under half their membership category's average spend
       dropping         clients whose spend fell by a tenth or more two full months running (needs three full months;
                        someone who stopped outright after the first month is not counted, that is "gone quiet")
       low-per-visit    frequent visitors under half their category's spend per visit
       public-spenders  public golfers who spent half or more of the lowest adult dues as listed, prorated
       new-members      members who joined 14 to 90 days before the period ends, under a quarter of the usual spend
       came-once        public golfers with one paid round on file and nothing in the 30 days or more since */
  const ONE_DAY_VISITS = 4, NEW_MIN_DAYS = 14, NEW_MAX_DAYS = 90, ONCE_DAYS = 30, EXTRA_ITEM = /^(power )?cart\b|guest green fee/i;
  function spendWindow(ctx) { const f = ledger(ctx).first.spend; if (!f || f > ctx.to) return null; const from = spendFrom(ctx), days = H.spanDays(from, ctx.to); return { from: from, days: days, months: days / MONTH, ok: days >= MIN_SPEND_DAYS }; }
  /** Every active member, with their figures for the period (zeros when nothing is on file). */
  function activeMembers(ctx) {
    return H.memo(ctx, 'cl-active', function () {
      const cur = current(ctx);
      return all('members').filter(function (m) { return m.status === 'active'; }).map(function (m) { const k = 'm:' + m.id; return cur[k] || Object.assign(blank(k), { spend: 0, visits: 0, diningVisits: 0, who: who(k) }); });
    });
  }
  function reachableClients(ctx) { const cur = current(ctx); return Object.keys(cur).map(function (k) { return cur[k]; }).filter(reachable); }
  function dv(c, d) { return Math.max(0, num(c.depts[d])); }
  function freqNeed(days) { return Math.max(3, Math.round(days / 15)); }

  function dineOnlyData(ctx) {
    return H.memo(ctx, 'cl-dineonly', function () {
      const w = spendWindow(ctx);
      if (flt.aud === 'public' || !w || !w.ok) return null;
      const need = freqNeed(w.days), regular = activeMembers(ctx).filter(function (c) { return c.diningVisits >= need; });
      const other = function (c) { return dv(c, 'Pro Shop') + dv(c, 'Lessons'); };
      const rows = regular.filter(function (c) { return !other(c) && !c.lessons; }).sort(function (a, b) { return b.diningVisits - a.diningVisits || a.who.name.localeCompare(b.who.name); });
      const buyers = regular.filter(function (c) { return other(c) > 0; });
      if (buyers.length < MIN_PEERS) return null;
      const avg = sum(buyers, other) / buyers.length / w.months;
      return { rows: rows, need: need, w: w, regular: regular.length, buyers: buyers.length, avg: avg, amount: rows.length * avg / 4 };
    });
  }
  function extrasOf(c) { return sum(Object.keys(c.items).filter(function (k) { return EXTRA_ITEM.test(k); }), function (k) { return Math.max(0, c.items[k].amount); }); }
  function noExtrasData(ctx) {
    return H.memo(ctx, 'cl-noextras', function () {
      const L = ledger(ctx), tf = L.first.tee, w = spendWindow(ctx);
      if (flt.aud === 'public' || !w || !w.ok || !tf || tf > ctx.to) return null;
      const from = tf > ctx.from ? tf : ctx.from, days = H.spanDays(from, ctx.to);
      if (days < MIN_TEE_DAYS) return null;
      const need = freqNeed(days), golfers = activeMembers(ctx).filter(function (c) { return c.rounds >= need; });
      const rows = golfers.filter(function (c) { return !extrasOf(c); }).sort(function (a, b) { return b.rounds - a.rounds || a.who.name.localeCompare(b.who.name); });
      const users = golfers.filter(function (c) { return extrasOf(c) > 0; });
      if (users.length < MIN_PEERS) return null;
      const avg = sum(users, extrasOf) / users.length / w.months;
      return { rows: rows, need: need, from: from, days: days, w: w, golfers: golfers.length, users: users.length, avg: avg, amount: rows.length * avg / 4 };
    });
  }
  function noEventsData(ctx) {
    return H.memo(ctx, 'cl-noevents', function () {
      const w = spendWindow(ctx);
      if (flt.aud === 'public' || !w || !w.ok) return null;
      const entered = {};
      all('events').forEach(function (e) { if (e.date && e.date >= ctx.from && e.date <= ctx.to && e.status !== 'cancelled') (e.registrations || []).forEach(function (g) { if (g && g.memberId && !g.cancelled) entered[g.memberId] = 1; }); });
      const members = activeMembers(ctx), goers = members.filter(function (c) { return dv(c, 'Events') > 0; });
      if (goers.length < MIN_PEERS) return null;
      const rows = members.filter(function (c) { return !dv(c, 'Events') && !entered[c.who.id]; }).sort(function (a, b) { return b.spend - a.spend || a.who.name.localeCompare(b.who.name); });
      const avg = sum(goers, function (c) { return dv(c, 'Events'); }) / goers.length / w.months;
      return { rows: rows, w: w, members: members.length, goers: goers.length, avg: avg, amount: rows.length * avg / 4 };
    });
  }
  function oneDayData(ctx) {
    return H.memo(ctx, 'cl-oneday-' + flt.aud, function () {
      const w = spendWindow(ctx);
      if (!w || !w.ok) return null;
      const rows = reachableClients(ctx).filter(function (c) { return audOK(c) && c.visits >= ONE_DAY_VISITS; }).map(function (c) {
        const wd = {}; Object.keys(c.days).forEach(function (d) { wd[F.toDate(d).getDay()] = 1; });
        const ks = Object.keys(wd);
        return ks.length === 1 ? { c: c, day: WEEKDAYS[+ks[0]], per: c.spend > 0 ? c.spend / c.visits : 0 } : null;
      }).filter(Boolean).sort(function (a, b) { return b.c.visits - a.c.visits || a.c.who.name.localeCompare(b.c.who.name); });
      return { rows: rows, w: w, amount: sum(rows, function (r) { return r.per; }) / 2 };
    });
  }
  function belowCatData(ctx) {
    return H.memo(ctx, 'cl-below', function () {
      const w = spendWindow(ctx);
      if (flt.aud === 'public' || !w || !w.ok) return null;
      const cats = {};
      activeMembers(ctx).forEach(function (c) { const g = cats[c.who.cat] || (cats[c.who.cat] = { n: 0, total: 0 }); g.n++; g.total += Math.max(0, c.spend); });
      const rows = activeMembers(ctx).map(function (c) { const g = cats[c.who.cat]; return g.n >= MIN_PEERS && g.total > 0 ? { c: c, avg: g.total / g.n, spend: Math.max(0, c.spend) } : null; })
        .filter(function (r) { return r && r.spend < r.avg / 2; }).sort(function (a, b) { return (b.avg - b.spend) - (a.avg - a.spend) || a.c.who.name.localeCompare(b.c.who.name); });
      const gap = sum(rows, function (r) { return r.avg - r.spend; });
      return { rows: rows, w: w, members: activeMembers(ctx).length, gap: gap, amount: gap / 2 / w.months };
    });
  }
  function droppingData(ctx) {
    return H.memo(ctx, 'cl-dropping-' + flt.aud, function () {
      const L = ledger(ctx), w = spendWindow(ctx);
      if (!w) return null;
      const ks = [];
      for (let k = w.from.slice(0, 7); k <= ctx.to.slice(0, 7); k = H.shiftKey(k, 1)) if (k + '-01' >= w.from && monthEnd(k) <= ctx.to) ks.push(k);
      if (ks.length < 3) return null;
      const m = ks.slice(-3), winter = m.some(function (k) { return !H.inSeasonKey(k); }), by = {};
      L.entries.forEach(function (e) {
        const k = e.date.slice(0, 7), i = m.indexOf(k);
        if (i < 0 || e.dept === 'Dues' || (winter && COURSE_DEPTS[e.dept])) return;
        (by[e.key] = by[e.key] || [0, 0, 0])[i] += e.amount;
      });
      const rows = Object.keys(by).map(function (k) { return { c: Object.assign(blank(k), { who: who(k) }), v: by[k].map(r2) }; })
        .filter(function (r) { return audOK(r.c) && reachable(r.c) && r.v[0] > 0 && r.v[1] > 0 && r.v[1] <= r.v[0] * 0.9 && r.v[2] <= r.v[1] * 0.9; })
        .sort(function (a, b) { return (b.v[0] - b.v[2]) - (a.v[0] - a.v[2]); });
      const drop = sum(rows, function (r) { return r.v[0] - Math.max(0, r.v[2]); });
      return { rows: rows, months: m, labels: m.map(function (k) { return H.monthLabel(k); }), winter: winter, drop: drop, amount: drop / 2 };
    });
  }
  function lowVisitData(ctx) {
    return H.memo(ctx, 'cl-lowvisit-' + flt.aud, function () {
      const w = spendWindow(ctx);
      if (!w || !w.ok) return null;
      const need = Math.max(ONE_DAY_VISITS, freqNeed(w.days)), pool = reachableClients(ctx).filter(function (c) { return c.visits >= need && c.spend > 0; }), cats = {};
      pool.forEach(function (c) { const g = cats[c.who.cat] || (cats[c.who.cat] = { n: 0, spend: 0, visits: 0 }); g.n++; g.spend += c.spend; g.visits += c.visits; });
      const rows = pool.filter(audOK).map(function (c) { const g = cats[c.who.cat]; return g.n >= MIN_PEERS ? { c: c, per: c.spend / c.visits, cat: g.spend / g.visits } : null; })
        .filter(function (r) { return r && r.per < r.cat / 2; }).sort(function (a, b) { return (b.cat - b.per) * b.c.visits - (a.cat - a.per) * a.c.visits; });
      const gap = sum(rows, function (r) { return (r.cat - r.per) * r.c.visits; });
      return { rows: rows, need: need, w: w, pool: pool.length, gap: gap, amount: gap / 2 / w.months };
    });
  }
  function adultTier() { const AR = (Club.membership && Club.membership.AGE_RULES) || {}; return all('membershipTiers').filter(function (t) { return !AR[t.id] && num(t.annualDues) > 0; }).sort(function (a, b) { return num(a.annualDues) - num(b.annualDues); })[0] || null; }
  /** Public golfers the Growth section already knows: who has applied or joined, and who its rounds-based invitation names. */
  function growthGolfers(ctx) {
    const g = Club.reports.get('growth'), out = { off: {}, invited: {} };
    let list = []; try { list = g && g.data && g.data.golfers ? g.data.golfers(ctx) || [] : []; } catch (e) { console.error(e); }
    list.forEach(function (x) { if (!x || !x.p) return; if (x.group !== 'invite') out.off[x.p.id] = 1; else if (x.inP && x.p.marketingOptIn) out.invited[x.p.id] = 1; });
    return out;
  }
  function publicSpendData(ctx) {
    return H.memo(ctx, 'cl-pubspend', function () {
      const w = spendWindow(ctx), t = adultTier();
      if (flt.aud === 'member' || !w || !w.ok || !t) return null;
      const dues = num(t.annualDues), bar = dues * w.days / 365 / 2, gg = growthGolfers(ctx);
      const rows = reachableClients(ctx).filter(function (c) { return c.who.kind === 'public' && !gg.off[c.who.id] && c.spend >= bar; }).sort(function (a, b) { return b.spend - a.spend; });
      /* The Growth section's "Invite regular public golfers to join" may already name every one of them. */
      return { rows: rows, w: w, tier: t, dues: dues, prorated: dues * w.days / 365, bar: bar, covered: rows.length > 0 && rows.every(function (c) { return gg.invited[c.who.id]; }), amount: dues };
    });
  }
  function newMemberData(ctx) {
    return H.memo(ctx, 'cl-newmembers', function () {
      const L = ledger(ctx), w = spendWindow(ctx);
      if (flt.aud === 'public' || !w || !w.ok) return null;
      const lo = Dt.addDays(ctx.to, -NEW_MAX_DAYS), hi = Dt.addDays(ctx.to, -NEW_MIN_DAYS), cats = {};
      activeMembers(ctx).forEach(function (c) { const g = cats[c.who.cat] || (cats[c.who.cat] = { n: 0, total: 0 }); g.n++; g.total += Math.max(0, c.spend); });
      const joined = activeMembers(ctx).filter(function (c) { const d = String(c.who.m.memberSince || '').slice(0, 10); return d >= lo && d <= hi && d >= L.first.spend; });
      if (!joined.length) return null;
      const rows = joined.map(function (c) {
        const d = String(c.who.m.memberSince).slice(0, 10), days = H.spanDays(d, ctx.to), g = cats[c.who.cat];
        if (g.n < MIN_PEERS || !g.total) return null;
        const own = aggregate(L, d, ctx.to)[c.key], spend = own ? Math.max(0, own.spend) : 0, usual = g.total / g.n / w.days * days;
        return { c: c, joined: d, days: days, spend: spend, usual: usual };
      }).filter(function (r) { return r && r.spend <= r.usual / 4; }).sort(function (a, b) { return b.joined.localeCompare(a.joined); });
      return { rows: rows, joined: joined.length, lo: lo, hi: hi, amount: sum(rows, function (r) { return (r.usual / 2 - r.spend) / (r.days / MONTH); }) };
    });
  }
  function cameOnceData(ctx) {
    return H.memo(ctx, 'cl-once', function () {
      const L = ledger(ctx);
      if (flt.aud === 'member' || !L.first.spend || L.first.spend > ctx.to) return null;
      const by = {};
      L.entries.forEach(function (e) { if (e.key.charAt(0) !== 'p' || e.date > ctx.to) return; const x = by[e.key] = by[e.key] || { n: 0, golf: 0, paid: 0, first: e.date, last: e.date, rounds: 0 }; x.n++; if (e.dept === 'Golf' && e.amount > 0) { x.golf++; x.paid += e.amount; } if (e.date > x.last) x.last = e.date; });
      L.visits.forEach(function (v) { const x = by[v.key]; if (!x || v.date > ctx.to) return; if (v.t === 'round') x.rounds++; if (v.date > x.last) x.last = v.date; });
      const rows = Object.keys(by).map(function (k) { const x = by[k]; return { c: Object.assign(blank(k), { who: who(k) }), paid: r2(x.paid), on: x.first, last: x.last, since: H.spanDays(x.last, ctx.to) - 1, x: x }; })
        .filter(function (r) { return reachable(r.c) && r.x.n === 1 && r.x.golf === 1 && r.x.rounds <= 1 && r.on >= ctx.from && r.since >= ONCE_DAYS; }).sort(function (a, b) { return b.since - a.since; });
      return { rows: rows, paid: sum(rows, function (r) { return r.paid; }), amount: sum(rows, function (r) { return r.paid; }) / 4 };
    });
  }
  function seeLabel(n, word) { return n === 1 ? 'See who it is' : 'See the ' + n + ' ' + (word || audPhrase(n)); }
  function moreIdeas(ctx) {
    const out = [], has = function (n) { return n === 1 ? 'has' : 'have'; };
    const d1 = dineOnlyData(ctx), d2 = noExtrasData(ctx), d3 = noEventsData(ctx), d4 = oneDayData(ctx), d5 = belowCatData(ctx), d6 = droppingData(ctx), d7 = lowVisitData(ctx), d8 = publicSpendData(ctx), d9 = newMemberData(ctx), d10 = cameOnceData(ctx);
    if (d1 && d1.rows.length) { const n = d1.rows.length; out.push({ id: 'dine-only', title: 'Bring regular diners into the shop and onto the lesson tee',
      text: n + ' of the ' + d1.regular + ' ' + plural(d1.regular, 'member') + ' with ' + d1.need + ' dining visits or more since ' + F.dateShort(d1.w.from) + ' ' + has(n) + ' no pro shop or lesson spend in this period. The ' + d1.buyers + ' regular diners who do buy there spent ' + money0(d1.avg) + ' a month each on the two. A shop offer or a lesson voucher with dinner that reaches one in four would add about ' + money0(d1.amount) + ' a month.',
      assume: 'A regular diner is an active member with ' + d1.need + ' dining visits or more in the ' + d1.w.days + ' days on file (three, or two a month, whichever is more). Assumes one in four spends what regular diners who use the shop or take lessons do, for twelve months.',
      amount: d1.amount, per: 'a month', year: d1.amount * 12, drill: 'idea-list', drillArg: 'dine-only', drillLabel: seeLabel(n, 'members') }); }
    if (d2 && d2.rows.length) { const n = d2.rows.length; out.push({ id: 'no-extras', title: 'Offer carts and guest days to frequent golfers',
      text: n + ' of the ' + d2.golfers + ' ' + plural(d2.golfers, 'member') + ' who played ' + d2.need + ' rounds or more since ' + F.dateShort(d2.from) + ' ' + has(n) + ' no power cart and no guest green fee charge in this period. The ' + d2.users + ' frequent golfers who do spent ' + money0(d2.avg) + ' a month each on carts and guests. A guest day or a cart pass that reaches one in four would add about ' + money0(d2.amount) + ' a month.',
      assume: 'A frequent golfer is an active member with ' + d2.need + ' rounds or more in the ' + d2.days + ' tee sheet days of this period; cart and guest charges are counted since ' + F.dateShort(d2.w.from) + '. Assumes one in four spends what frequent golfers who use carts or bring guests do, over the seven golf season months.',
      amount: d2.amount, per: 'a month', year: d2.amount * 7, drill: 'idea-list', drillArg: 'no-extras', drillLabel: seeLabel(n, 'members') }); }
    if (d3 && d3.rows.length) { const n = d3.rows.length; out.push({ id: 'no-events', title: 'Invite members who never come to events',
      text: n + ' of ' + d3.members + ' active members ' + has(n) + ' no event charge and no event entry since ' + F.dateShort(d3.w.from) + '. The ' + d3.goers + ' who came spent ' + money0(d3.avg) + ' a month each on events. A personal invitation that brings one in four to an event would add about ' + money0(d3.amount) + ' a month.',
      assume: 'Counts active members with no charge in the events department and no entry to an event held in this period. Assumes one in four spends what members who came to events do, for twelve months.',
      amount: d3.amount, per: 'a month', year: d3.amount * 12, drill: 'idea-list', drillArg: 'no-events', drillLabel: seeLabel(n, 'members') }); }
    if (d4 && d4.rows.length && d4.amount >= 1) { const n = d4.rows.length; out.push({ id: 'one-weekday', title: 'Give one-day-a-week clients a reason to come twice',
      text: n + ' ' + audPhrase(n) + ' made ' + ONE_DAY_VISITS + ' visits or more since ' + F.dateShort(d4.w.from) + ', every one on the same day of the week. They spend ' + money0(sum(d4.rows, function (r) { return r.per; }) / n) + ' a visit on average. One more visit a month on another day from half of them would add about ' + money0(d4.amount) + ' a month.',
      assume: 'Counts clients with ' + ONE_DAY_VISITS + ' visits or more, all on one weekday. Assumes half of them make one more visit a month at their own average spend per visit (dues excluded), for twelve months.',
      amount: d4.amount, per: 'a month', year: d4.amount * 12, drill: 'idea-list', drillArg: 'one-weekday', drillLabel: seeLabel(n) }); }
    if (d5 && d5.rows.length) { const n = d5.rows.length; out.push({ id: 'below-category', title: 'Lift members who spend well below their category',
      text: n + ' of ' + d5.members + ' active members spent less than half the average of their own membership category since ' + F.dateShort(d5.w.from) + ', ' + money0(d5.gap) + ' below it together. Closing half of that gap, with offers matched to what each one already uses, would add about ' + money0(d5.amount) + ' a month.',
      assume: 'Compares each active member with the average of all active members in the same category, dues excluded, where the category has ' + MIN_PEERS + ' members or more. Assumes half the gap is closed, for twelve months.',
      amount: d5.amount, per: 'a month', year: d5.amount * 12, drill: 'idea-list', drillArg: 'below-category', drillLabel: seeLabel(n, 'members') }); }
    if (d6 && d6.rows.length) { const n = d6.rows.length; out.push({ id: 'dropping', title: 'Check in with clients whose spending keeps falling',
      text: n + ' ' + audPhrase(n) + ' spent less in ' + d6.labels[1] + ' than in ' + d6.labels[0] + ', and less again in ' + d6.labels[2] + ': ' + money0(d6.drop) + ' a month lower in all. A call to ask how things are going, before the habit goes, that wins back half would add about ' + money0(d6.amount) + ' a month.',
      assume: 'Counts clients who spent in the first two of the last three full months and whose spend fell by a tenth or more in each of the last two, dues excluded.' + (d6.winter ? ' Green fees and the beverage cart are left out, because one of the months is outside the golf season.' : '') + ' Assumes half the fall comes back, for twelve months.',
      amount: d6.amount, per: 'a month', year: d6.amount * 12, drill: 'idea-list', drillArg: 'dropping', drillLabel: seeLabel(n) }); }
    if (d7 && d7.rows.length) { const n = d7.rows.length; out.push({ id: 'low-per-visit', title: 'Raise the spend of frequent visitors who spend little',
      text: n + ' of the ' + d7.pool + ' ' + plural(d7.pool, 'client') + ' with ' + d7.need + ' visits or more since ' + F.dateShort(d7.w.from) + ' spent less than half of what their membership category spends a visit. They are already here: a drink after the round or a lunch offer that closes half the gap would add about ' + money0(d7.amount) + ' a month.',
      assume: 'Spend per visit is spend (dues excluded) over days visited, against the same figure for clients of the same category with ' + d7.need + ' visits or more. Assumes half the gap is closed at their present number of visits, for twelve months.',
      amount: d7.amount, per: 'a month', year: d7.amount * 12, drill: 'idea-list', drillArg: 'low-per-visit', drillLabel: seeLabel(n) }); }
    if (d8 && d8.rows.length && !d8.covered) { const n = d8.rows.length; out.push({ id: 'public-spenders', title: 'Show high-spending public golfers what membership costs',
      text: n + ' public ' + plural(n, 'golfer') + ' spent ' + money0(d8.bar) + ' or more since ' + F.dateShort(d8.w.from) + ', half of what ' + d8.tier.name + ' dues as listed come to over the same days (' + money0(d8.prorated) + '). ' + d8.rows[0].who.name + ' spent the most, ' + money0(d8.rows[0].spend) + '. For golfers paying this much in green fees a membership is close to the same money; one of them joining would add ' + money0(d8.dues) + ' a year.',
      assume: 'Uses ' + d8.tier.name + ' dues as listed, ' + money0(d8.dues) + ' a year, the lowest-dues category with no age limit, prorated to ' + d8.w.days + ' days. Golfers who have applied or joined are left out. Assumes one new member; this is a list by money spent, where the Growth section lists public golfers by rounds played.',
      amount: d8.dues, per: 'a year', year: d8.dues, drill: 'idea-list', drillArg: 'public-spenders', drillLabel: seeLabel(n, 'public golfers') }); }
    if (d9 && d9.rows.length && d9.amount >= 1) { const n = d9.rows.length; out.push({ id: 'new-members', title: 'Welcome new members who have not spent yet',
      text: n + ' of the ' + d9.joined + ' ' + plural(d9.joined, 'member') + ' who joined between ' + F.dateShort(d9.lo) + ' and ' + F.dateShort(d9.hi) + ' ' + has(n) + ' spent little or nothing beyond dues since. A welcome round with a host member or a first dinner on the club sets the habit early; bringing them to half the usual spend of their category would add about ' + money0(d9.amount) + ' a month.',
      assume: 'Counts active members who joined ' + NEW_MIN_DAYS + ' to ' + NEW_MAX_DAYS + ' days before the period ends and have spent a quarter or less of what the average member of their category spends over as many days. Assumes they reach half that average, for twelve months.',
      amount: d9.amount, per: 'a month', year: d9.amount * 12, drill: 'idea-list', drillArg: 'new-members', drillLabel: seeLabel(n, 'members') }); }
    if (d10 && d10.rows.length) { const n = d10.rows.length; out.push({ id: 'came-once', title: 'Bring back public golfers who came once',
      text: n + ' public ' + plural(n, 'golfer') + ' paid for one round in this period, ' + money0(d10.paid) + ' together, and ' + has(n) + ' nothing on file in the ' + ONCE_DAYS + ' days or more since. A thank-you email with a return offer that brings back one in four would add about ' + money0(d10.amount) + '.',
      assume: 'Counts public golfers with one paid round and no other purchase or round on file, last seen ' + ONCE_DAYS + ' days or more before the period ends. Assumes one in four comes back once and pays what they paid the first time.',
      amount: d10.amount, per: 'one time', year: d10.amount, drill: 'idea-list', drillArg: 'came-once', drillLabel: seeLabel(n, 'public golfers') }); }
    return out;
  }
  /* One drawer for the ten: LISTS[arg] says what to show for each client. */
  const LISTS = {
    'dine-only': { data: dineOnlyData, title: 'Regular diners with no shop or lesson spend', cols: ['Dining visits', 'Dining spend'], cell: function (c) { return [F.num(c.diningVisits), money0(dv(c, 'Dining'))]; },
      note: function (d) { return 'Each is an active member with ' + d.need + ' dining visits or more since ' + F.dateShort(d.w.from) + ', no pro shop or lesson charge and no lesson taken. Regular diners who do buy there spent ' + money0(d.avg) + ' a month each on the two.'; } },
    'no-extras': { data: noExtrasData, title: 'Frequent golfers with no cart or guest charges', cols: ['Rounds', 'Golf spend'], cell: function (c) { return [F.num(c.rounds), money0(dv(c, 'Golf'))]; },
      note: function (d) { return 'Each is an active member with ' + d.need + ' rounds or more since ' + F.dateShort(d.from) + ' and no power cart or guest green fee charge since ' + F.dateShort(d.w.from) + '. Frequent golfers who do have them spent ' + money0(d.avg) + ' a month each on the two.'; } },
    'no-events': { data: noEventsData, title: 'Members who have not come to an event', cols: ['Visits', 'Other spend'], cell: function (c) { return [F.num(c.visits), money0(c.spend)]; },
      note: function (d) { return 'Each is an active member with no charge in the events department and no entry to an event held in this period. Members who came spent ' + money0(d.avg) + ' a month each on events. Other spend leaves dues out.'; } },
    'one-weekday': { data: oneDayData, title: 'Clients who visit on one day of the week', row: true, cols: ['Their day', 'Visits', 'Spend a visit'], cell: function (r) { return [r.day, F.num(r.c.visits), money0(r.per)]; },
      note: function () { return 'Each made ' + ONE_DAY_VISITS + ' visits or more in this period, all on the same day of the week. A visit is a day with a purchase at the club, a round played, a dining reservation kept or a lesson taken.'; } },
    'below-category': { data: belowCatData, title: 'Members well below their category', row: true, cols: ['Spend', 'Category average', 'Gap'], cell: function (r) { return [money0(r.spend), money0(r.avg), money0(r.avg - r.spend)]; },
      note: function (d) { return 'Each is an active member who spent less than half the average of all active members in the same membership category since ' + F.dateShort(d.w.from) + ', dues excluded.'; } },
    dropping: { data: droppingData, title: 'Clients whose spending keeps falling', row: true, colsOf: function (d) { return d.labels; }, cell: function (r) { return r.v.map(money0); },
      note: function (d) { return 'Each spent a tenth or more less in ' + d.labels[1] + ' than in ' + d.labels[0] + ', and a tenth or more less again in ' + d.labels[2] + ', dues excluded.' + (d.winter ? ' Green fees and the beverage cart are left out, because one of the months is outside the golf season.' : ''); } },
    'low-per-visit': { data: lowVisitData, title: 'Frequent visitors who spend little a visit', row: true, cols: ['Visits', 'Spend a visit', 'Category a visit'], cell: function (r) { return [F.num(r.c.visits), money0(r.per), money0(r.cat)]; },
      note: function (d) { return 'Each made ' + d.need + ' visits or more since ' + F.dateShort(d.w.from) + ' and spent less than half of what clients of the same category with as many visits spend a visit, dues excluded.'; } },
    'public-spenders': { data: publicSpendData, title: 'Public golfers who spend like members', cols: ['Rounds', 'Spend', 'Of dues as listed'], cell: function (c, d) { return [F.num(c.rounds), money0(c.spend), pct(c.spend, d.prorated) + '%']; },
      note: function (d) { return d.tier.name + ' dues as listed are ' + money0(d.dues) + ' a year, ' + money0(d.prorated) + ' over the ' + d.w.days + ' days since ' + F.dateShort(d.w.from) + '. Each golfer here spent half of that or more and has not applied.'; } },
    'new-members': { data: newMemberData, title: 'New members who have not spent yet', row: true, cols: ['Joined', 'Spend since', 'Usual for the category'], cell: function (r) { return [F.dateShort(r.joined), money0(r.spend), money0(r.usual)]; },
      note: function () { return 'Each joined ' + NEW_MIN_DAYS + ' to ' + NEW_MAX_DAYS + ' days before the period ends and has spent a quarter or less of what the average member of their category spends over as many days, dues excluded.'; } },
    'came-once': { data: cameOnceData, title: 'Public golfers who came once', row: true, cols: ['Paid on', 'Paid', 'Days since last seen'], cell: function (r) { return [F.dateShort(r.on), money0(r.paid), F.num(r.since)]; },
      note: function () { return 'Each has one paid round on file and no other purchase or round, and was last seen ' + ONCE_DAYS + ' days or more before the period ends.'; } }
  };
  function listDrill(ctx, arg) {
    const def = LISTS[String(arg)], d = def ? def.data(ctx) : null;
    if (!d || !d.rows.length) return noList('No one fits this idea in this period, or the records are too short to tell.');
    const cols = def.colsOf ? def.colsOf(d) : def.cols, cOf = function (r) { return def.row ? r.c : r; };
    const body = H.rKpis([{ label: 'On this list', value: F.num(d.rows.length), sub: esc(ctx.line) }, { label: 'Estimate', value: d.amount >= 1 ? money0(d.amount) : 'None', sub: esc(String(arg) === 'public-spenders' ? 'A year, if one joins' : String(arg) === 'came-once' ? 'One time' : 'A month') }]) +
      H.rSec('Who they are', 'Select a name for the breakdown', H.rTable([{ label: 'Client' }].concat(cols.map(function (l) { return { label: l, num: true }; })),
        d.rows.map(function (r) { return [whoCell(cOf(r))].concat(def.cell(r, d).map(function (v) { return esc(v); })); }))) + H.rNote(def.note(d));
    const csv = [['Client', 'Type', 'Category', 'Member no'].concat(cols)].concat(d.rows.map(function (r) { return whoCSV(cOf(r)).concat(def.cell(r, d).map(function (v) { return String(v).replace(/[$,]/g, ''); })); })).concat([[], ['Period', ctx.from + ' to ' + ctx.to], ['Dues', 'Excluded']]);
    return { title: def.title, body: body, csv: csv, csvId: 'clients-' + arg, noNotes: true, wire: openClient(ctx) };
  }
  /* The drawers behind the ideas: the clients, with the figure that put each on the list. A name opens the breakdown. */
  function whoCell(c) { return '<button type="button" class="cl-name" data-cl-client="' + esc(c.key) + '">' + esc(c.who.name) + '</button><div class="dd-sub">' + esc(c.who.kind === 'member' ? c.who.cat + ' member' : 'Public golfer') + '</div>'; }
  function whoCSV(c) { return [c.who.name, c.who.kind === 'member' ? 'Member' : 'Public golfer', c.who.kind === 'member' ? c.who.cat : '', c.who.m ? c.who.m.memberNo : '']; }
  function openClient(ctx) {
    return function (api, c, open) { U.on(api.el, 'click', '[data-cl-client]', function (e, b) { const k = b.dataset.clClient; api.close(); setTimeout(function () { open(clientDrill(ctx, k)); }, 200); }); };
  }
  function noList(text) { return { title: 'Nothing to list', body: H.rNote(text), csv: [], noNotes: true }; }
  function quietDrill(ctx) {
    const q = quietData(ctx);
    if (!q || !q.rows.length) return noList('No big spender has gone quiet in this period, or the records are too short to tell.');
    const body = H.rKpis([
      { label: 'Gone quiet', value: F.num(q.rows.length), sub: esc('of the ' + q.top + ' biggest spenders') },
      { label: 'Earlier, per 30 days', value: money0(q.was), sub: esc(F.dateShort(q.eFrom) + ' to ' + F.dateShort(q.eTo)) },
      { label: 'Last 30 days', value: money0(q.now), sub: esc(F.dateShort(q.rFrom) + ' to ' + F.dateShort(q.rTo)) },
      { label: 'Missing', value: money0(q.gap), sub: esc('A month, against their own average') }
    ]) + H.rSec('Who they are', 'Select a name for the breakdown', H.rTable([{ label: 'Client' }, { label: 'Earlier spend', num: true }, { label: 'Per 30 days', num: true }, { label: 'Last 30 days', num: true }],
      q.rows.map(function (r) { return [whoCell(r.c), esc(money0(r.early)), esc(money0(r.rate)), '<strong>' + esc(money0(r.now)) + '</strong>']; }),
      ['Total', esc(money0(sum(q.rows, function (r) { return r.early; }))), esc(money0(q.was)), esc(money0(q.now))])) +
      H.rNote('A big spender is in the top quarter of the ' + q.pool + ' ' + audPhrase(q.pool) + ' who spent from ' + F.dateShort(q.eFrom) + ' to ' + F.dateShort(q.eTo) + ', ' + money0(q.cutoff) + ' or more with dues excluded. Each is listed because the last 30 days came to a quarter or less of their own earlier 30-day average.' + (q.winter ? ' Green fees and the beverage cart are left out, because the last 30 days fall outside the golf season.' : ''));
    const csv = [['Client', 'Type', 'Category', 'Member no', 'Earlier spend', 'Earlier per 30 days', 'Last 30 days']].concat(q.rows.map(function (r) { return whoCSV(r.c).concat([r.early.toFixed(2), r.rate.toFixed(2), r.now.toFixed(2)]); }))
      .concat([[], ['Earlier', q.eFrom + ' to ' + q.eTo], ['Last 30 days', q.rFrom + ' to ' + q.rTo], ['Dues', 'Excluded'], ['Green fees and beverage cart', q.winter ? 'Excluded' : 'Included']]);
    return { title: 'Big spenders gone quiet', body: body, csv: csv, csvId: 'clients-quiet-spenders', noNotes: true, wire: openClient(ctx) };
  }
  function noDineDrill(ctx) {
    const nd = noDineData(ctx);
    if (!nd || !nd.rows.length) return noList('Every member who plays often has dined in this period, or the records are too short to tell.');
    const body = H.rKpis([
      { label: 'Play but never dine', value: F.num(nd.rows.length), sub: esc('of ' + nd.players + ' with ' + nd.need + ' rounds or more') },
      { label: 'Their rounds', value: F.num(sum(nd.rows, function (c) { return c.rounds; })), sub: esc('Since ' + F.dateShort(nd.from)) },
      { label: 'Members who dine', value: F.num(nd.diners), sub: esc('With a dining charge in this period') },
      { label: 'They spend', value: money0(nd.avg), sub: esc('A month each in the dining room') }
    ]) + H.rSec('Who they are', 'Select a name for the breakdown', H.rTable([{ label: 'Member' }, { label: 'Rounds', num: true }, { label: 'Dining', num: true }, { label: 'Other spend', num: true }],
      nd.rows.map(function (c) { return [whoCell(c), '<strong>' + F.num(c.rounds) + '</strong>', esc(money0(0)), esc(money0(c.spend))]; }))) +
      H.rNote('Each is an active member with ' + nd.need + ' rounds or more since ' + F.dateShort(nd.from) + ', no dining charge since ' + F.dateShort(nd.spendFrom) + ' and no dining reservation kept' + (nd.resFrom && nd.resFrom > ctx.from ? ' (reservations on file begin ' + F.dateShort(nd.resFrom) + ')' : '') + '. Other spend leaves dues out.');
    const csv = [['Client', 'Type', 'Category', 'Member no', 'Rounds', 'Dining spend', 'Dining visits', 'Other spend']].concat(nd.rows.map(function (c) { return whoCSV(c).concat([c.rounds, '0.00', 0, c.spend.toFixed(2)]); }))
      .concat([[], ['Rounds counted', nd.from + ' to ' + ctx.to], ['Threshold', nd.need + ' rounds'], ['Average dining spend a month of members who dine', nd.avg.toFixed(2)]]);
    return { title: 'Members who play but never dine', body: body, csv: csv, csvId: 'clients-play-never-dine', noNotes: true, wire: openClient(ctx) };
  }
  function oneDeptDrill(ctx) {
    const od = oneDeptData(ctx);
    if (!od || !od.rows.length) return noList('Every client spent in two departments or more in this period, or the records are too short to tell.');
    const body = H.rKpis([
      { label: 'One department only', value: F.num(od.rows.length), sub: esc(od.lead ? od.leadN + ' in ' + od.lead.toLowerCase() : '') },
      { label: 'They spent', value: money0(sum(od.rows, function (r) { return r.value; })), sub: esc(F.dateShort(od.from) + ' to ' + F.dateShort(ctx.to)) },
      { label: 'With clients to compare', value: F.num(od.est), sub: esc('Same category, two departments or more') },
      { label: 'Similar clients spend', value: od.est ? money0(od.each) : 'None', sub: esc(od.est ? 'A month in their second department' : 'Not enough on file') }
    ]) + H.rSec('Who they are', 'Select a name for the breakdown', H.rTable([{ label: 'Client' }, { label: 'Only department' }, { label: 'Spend', num: true }, { label: 'Similar clients, second department', num: true }],
      od.rows.map(function (r) { return [whoCell(r.c), esc(r.dept), '<strong>' + esc(money0(r.value)) + '</strong>', r.second != null ? esc(money0(r.second) + ' a month') : '<span class="muted">None to compare</span>']; }))) +
      H.rNote('Dues are never counted as a department. A similar client is in the same membership category (public golfers together) and spent in two or more departments; the figure is the average of their second-largest department a month, shown when a category has ' + MIN_PEERS + ' or more of them.');
    const csv = [['Client', 'Type', 'Category', 'Member no', 'Only department', 'Spend', 'Similar clients', 'Their second department a month']].concat(od.rows.map(function (r) { return whoCSV(r.c).concat([r.dept, r.value.toFixed(2), r.peers, r.second != null ? r.second.toFixed(2) : '']); }))
      .concat([[], ['Period', od.from + ' to ' + ctx.to], ['Dues', 'Never counted as a department']]);
    return { title: 'Clients in one department only', body: body, csv: csv, csvId: 'clients-one-department', noNotes: true, wire: openClient(ctx) };
  }

  /* ---------------- Filters and the table's clicks ---------------- */
  function filtersHTML() { return '<div class="cl-filters cl-bar" data-reveal>' + seg(AUD, flt.aud, 'aud', 'Show') + seg(DUES_OPTS, flt.inc ? 'in' : 'ex', 'dues', 'Dues') + '</div>'; }
  function wire(el, ctx, api) {
    const before = el.querySelector('.rp-kpis') || el.querySelector('.rp-grid');
    if (before && !el.querySelector('.cl-bar')) before.insertAdjacentHTML('beforebegin', filtersHTML());
    if (refocus) { const b = el.querySelector(refocus); refocus = null; if (b && !el.hidden) b.focus({ preventScroll: true }); }
    U.on(el, 'click', '.cl-bar .segmented button', function (e, b) {
      const name = b.closest('.segmented').dataset.name;
      if (name === 'aud') flt.aud = b.dataset.value; else flt.inc = b.dataset.value === 'in';
      try { localStorage.setItem(FLT_KEY, JSON.stringify(flt)); } catch (err) { /* ignore */ }
      refocus = '.cl-bar .segmented[data-name="' + name + '"] button[data-value="' + b.dataset.value + '"]';
      api.redraw();
    });
    U.on(el, 'click', '[data-cl-all]', function () { showAll = !showAll; refocus = '[data-cl-all]'; api.redraw(); });
    U.on(el, 'click', 'tr[data-cl-open]', function (e, tr) { if (e.target.closest('a')) return; api.drill('client', tr.dataset.clOpen); });
    U.on(el, 'keydown', 'tr[data-cl-open]', function (e, tr) { if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); api.drill('client', tr.dataset.clOpen); } });
  }

  /* ---------------- About these numbers ---------------- */
  function about(ctx) {
    const L = ledger(ctx), f = L.first, out = [];
    out.push('Spend is what a client was charged on their house account plus anything they paid by card or cash, less credits and refunds. Reversed charges are left out, a balance brought forward is not a purchase, payments toward a statement are not spending, and amounts settled with a gift card count when the card was bought. Dues are ' + (flt.inc ? 'included' : 'excluded') + '; the switch above changes that.');
    out.push('A visit is a day on which the client bought something at the club, played a round, kept a dining reservation or took a lesson. Online payments and online shop orders are spend, but the day they were made is not a visit. The average per visit always leaves dues out.');
    out.push('Public golfers are people with an online account: their spend is the green fees and add-ons they paid online and anything rung up against their account at the club. Purchases by people with no account, such as walk-in pro shop sales and dining checks paid by card, cannot be tied to a person and are not in this report. Wedding, banquet and outing deposits belong to function clients and are left out too.');
    out.push('A pro shop sale or dining check put on a member\'s account counts once, through the charge on their ledger.');
    const cov = [H.coverage(f.spend, ctx, 'Client spending'), f.tee && f.tee > ctx.from ? 'Rounds are counted from ' + F.date(f.tee) + ', when the tee sheet on file begins.' : ''].filter(Boolean);
    if (cov.length) out.push(cov.join(' '));
    out.push('The ideas to grow revenue follow the Show filter above and always leave dues out. Each one opens the list of clients behind it.');
    out.push(previous(ctx) ? 'Change compares each client with ' + ctx.prev.label + '.' : 'Change against the period before is shown only when client records cover the whole earlier period; for these dates they do not.');
    return out;
  }

  Club.reports.addSection({
    id: 'clients', label: 'Client spending', order: 75,
    collections: ['charges', 'receipts', 'payments', 'publicPayments', 'publicPlayers', 'sales', 'diningOrders', 'teeTimes', 'diningReservations', 'lessons', 'members', 'membershipTiers'],
    kpis: kpis, main: main, panels: panels, about: about, csv: csv, wire: wire, ideas: ideas, ideasMore: true,
    drills: { client: clientDrill, ranking: rankingDrill, 'idea-quiet': quietDrill, 'idea-nodine': noDineDrill, 'idea-onedept': oneDeptDrill, 'idea-list': listDrill },
    data: { ledger: ledger, current: current, view: view, quiet: quietData, noDine: noDineData, oneDept: oneDeptData, lists: LISTS, filters: function () { return { aud: flt.aud, inc: flt.inc }; } }
  });
})();
