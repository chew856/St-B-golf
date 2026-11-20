/* Portal: My account. Balance, activity, statements (printable letterhead), receipts, online payments, the F&B credit
   (Food & Beverage Assessment, adult members) and any suspension under the club's credit policy. Reads charges, payments and statements (owned by js/modules/billing.js). Writes payments,
   member.balance and statement status exactly as the staff "Record payment" flow does, plus the payment's receipt
   (Club.receipts, js/core/receipts.js). Also next season's renewal (#/account/renew, Club.billing.renewal), the season
   summary (#/account/summary, printable) and a link to Rate your visits (js/portal/feedback.js). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;

  const CATS = ['Dues', 'Golf', 'Pro Shop', 'Dining', 'F&B assessment', 'Events', 'Lessons', 'Other'];
  const CAT_COLOR = { Dues: 'var(--c1)', Golf: 'var(--c3)', 'Pro Shop': 'var(--c4)', Dining: 'var(--c2)', 'F&B assessment': 'var(--c2)', Events: 'var(--c5)', Lessons: 'var(--c6)', Other: 'var(--rule-strong)' };
  const CAT_ICON = { Dues: 'crest', Golf: 'flag', 'Pro Shop': 'shop', Dining: 'dining', 'F&B assessment': 'dining', Events: 'events', Lessons: 'lesson', Other: 'tag', Payment: 'check' };
  const SOURCE = { teesheet: 'Golf shop', proshop: 'Golf shop', dining: 'Gallery Taphouse', events: 'Club events', lessons: 'Golf shop', billing: 'Club office', manual: 'Club office' };
  const MAX_PAYMENT = 50000;

  /* ---------------- Helpers ---------------- */
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  function today() { return Club.date.today(); }
  function curMonth() { return today().slice(0, 7); }
  function mkey(d) { return String(d || '').slice(0, 7); }
  function monthLabel(key, short) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, 1, 12).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' }); }
  function monthName(key) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, 1, 12).toLocaleDateString('en-US', { month: 'long' }); }
  function monthEnd(key) { const p = key.split('-').map(Number); return S.iso(new Date(p[0], p[1], 0, 12)); }
  function money(v) { return esc(fmt.money(v)); }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (+(f ? f(x) : x) || 0); }, 0); }
  function byDate(a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)); }
  function setErr(form, name, msg) { const f = form.querySelector('[name="' + name + '"]'); if (!f) return; f.classList.add('invalid'); const host = f.closest('.pa-inline') || f; host.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }
  function fresh(id) { return S.find('members', id); }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }

  function myCharges(id) { return S.all('charges').filter(function (c) { return c.memberId === id; }); }
  function myPayments(id) { return S.all('payments').filter(function (p) { return p.memberId === id; }); }
  /* Members only see statements the club has issued (drafts stay with the office). */
  function myStatements(id) { return S.all('statements').filter(function (s) { return s.memberId === id && s.status !== 'draft'; }).sort(function (a, b) { return b.period.localeCompare(a.period); }); }
  function openStatements(id) { return myStatements(id).filter(function (s) { return s.status === 'sent' || s.status === 'overdue'; }); }
  /* A statement's total is the balance due at the end of its period, so every payment the statement does not already
     count goes toward it: payments dated after the period (the rule js/shared/billing-data.js uses when it marks seeded
     statements paid), plus any dated inside the period but recorded after it was made. Several part payments add up. */
  function paidToward(s) {
    const start = s.period + '-01';
    return r2(Math.max(0, sum(myPayments(s.memberId).filter(function (p) { return p.date >= start; }), function (p) { return p.amount; }) - (+s.paymentsTotal || 0)));
  }
  /* What is still owed on a statement: its total less what has been paid toward it, never more than the live balance
     (so a credit counts) and never charges made after the statement. */
  function owedOn(s, m) { return r2(Math.max(0, Math.min((m && m.balance) || 0, (s.total || 0) - paidToward(s)))); }

  function rows(id) {
    const out = myCharges(id).map(function (c) {
      return { kind: 'charge', id: c.id, date: c.date, description: c.description || 'Account charge', category: CATS.indexOf(c.category) >= 0 ? c.category : 'Other', source: c.source, amount: +c.amount || 0, createdAt: c.createdAt };
    }).concat(myPayments(id).map(function (p) {
      return { kind: 'payment', id: p.id, date: p.date, description: 'Payment received, thank you', sub: payMethod(p), category: 'Payment', method: p.method, brand: p.method === 'Card' ? p.brand : null, amount: +p.amount || 0, createdAt: p.createdAt };
    }));
    return out.sort(byDate).reverse();
  }

  function statusLabel(s) {
    if (s.status === 'paid') return ui.badge('Paid', 'good');
    if (s.status === 'overdue') return ui.badge('Past due', 'bad');
    return ui.badge(s.dueOn ? 'Due ' + fmt.dateShort(s.dueOn) : 'Issued', 'info');
  }

  function subnav(active) {
    const items = [['', 'Overview'], ['activity', 'Activity'], ['statements', 'Statements'], ['receipts', 'Receipts'], ['pay', 'Pay']];
    return '<nav class="pa-subnav" aria-label="My account">' + items.map(function (i) {
      return '<a href="#/account' + (i[0] ? '/' + i[0] : '') + '"' + (i[0] === active ? ' class="active" aria-current="page"' : '') + '>' + esc(i[1]) + '</a>';
    }).join('') + '</nav>';
  }
  function hero(m, title, line) {
    const t = tierOf(m);
    return '<section class="p-hero pa-hero" data-reveal><h1>' + esc(title) + '</h1><p class="pa-hero-line">' + esc(line) + '</p>' +
      '<p class="pa-hero-meta">Member number ' + esc(m.memberNo) + (t ? ' · ' + esc(t.name) + ' membership' : '') + '</p></section>';
  }

  /* ---------------- Overview ---------------- */
  /* F&B credit (the club's Food & Beverage Assessment, Club.billing.fnb): adult members pre-pay it each season; dining,
     takeout and beverage cart purchases are paid from it first, gratuities are not; what is left at season end expires. */
  function fbPanel(m) {
    const F = Club.billing && Club.billing.fnb; if (!F) return '';
    const f = F.state(m.id);
    if (!f.applies && !f.assessed) return '';
    const pct = f.assessed ? Math.min(100, f.used / f.assessed * 100) : 0;
    let head, note;
    if (!f.assessed) {
      head = '<p class="pa-fb-line">Your ' + f.year + ' F&amp;B credit of ' + money(f.amount) + ' is not on your account yet.</p>';
      note = f.status === 'ended' ? 'The ' + (f.year + 1) + ' assessment of ' + fmt.money(f.amount) + ' is charged on ' + fmt.date(f.next) + '.' : 'It is charged at the start of the season, ' + fmt.date(f.start) + '.';
    } else if (f.status === 'ended') {
      head = '<p class="pa-fb-line">' + f.year + ' F&amp;B credit: ' + money(f.used) + ' used of ' + money(f.assessed) + '</p>';
      note = (f.expired > 0.005 ? fmt.money(f.expired) + ' was left on ' + fmt.date(f.end) + ' and has expired. ' : 'You used all of it. ') + 'The ' + (f.year + 1) + ' assessment of ' + fmt.money(f.amount) + ' is charged on ' + fmt.date(f.next) + '.';
    } else {
      head = '<p class="pa-fb-line">F&amp;B credit: ' + money(f.left) + ' left of ' + money(f.assessed) + ', until ' + esc(fmt.dateShort(f.end)) + '</p>';
      note = 'Food and drink in the clubhouse, takeout and the beverage cart are paid from it first. Anything left after ' + fmt.date(f.end) + ' expires.';
    }
    const body = head +
      '<div class="pa-fb-figs"><div><span class="pa-fig-l">Credit used</span><span class="pa-fb-val">' + money(f.used) + '</span></div><div class="right"><span class="pa-fig-l">' + (f.status === 'ended' ? 'Credit expired' : 'Credit left') + '</span><span class="pa-fb-val muted">' + money(f.status === 'ended' ? f.expired : f.left) + '</span></div></div>' +
      '<div class="bar pa-fb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '" aria-label="F&amp;B credit used"><span style="width:' + Math.max(f.used ? 2 : 0, pct) + '%"></span></div>' +
      '<p class="pa-fb-note">' + esc(note) + '</p>' +
      '<p class="pa-fine">Gratuities and service charges are not paid from the credit. It cannot be transferred.</p>' +
      (f.status === 'open' && f.left > 0.005 ? '<a class="p-link" href="#/dining">Reserve a table' + Club.icon('chevronRight') + '</a>' : '');
    return '<section class="panel pa-fb" data-reveal><div class="panel-head"><div><h3>Food and beverage credit</h3><div class="pa-head-sub">' + f.year + ' season, ' + esc(Club.season ? Club.season.dayLabel() : '') + '</div></div>' + Club.icon('dining', 'pa-head-icon') + '</div><div class="panel-body">' + body + '</div></section>';
  }
  /* Credit policy (Club.billing.standing): what is suspended on the account, and why. */
  function standingNote(m) {
    const st = Club.billing && Club.billing.standing ? Club.billing.standing(m.id) : null;
    if (!st || (!st.level && !st.tpArrears)) return '';
    const what = st.level >= 120 ? 'All club privileges are suspended on your account.' : st.level >= 90 ? 'Charging, tee time booking and golf are suspended on your account.' : st.level >= 60 ? 'Charging to your account is suspended.' : 'Tee time booking and golf are suspended on your account.';
    const why = st.level ? fmt.money(st.amount) + ' is unpaid ' + st.days + ' days after the statement date.' : 'Your time payment of ' + fmt.money(st.tpArrears.amount) + ' due ' + fmt.date(st.tpArrears.date) + ' is ' + st.tpArrears.days + ' days late.';
    return '<div class="pa-standing" role="status">' + Club.icon('info') + '<span><strong>' + esc(what) + '</strong> ' + esc(why) + ' Please make a payment, or call the club office at ' + esc(Club.info.phone) + '.</span></div>';
  }

  function rowHTML(r) {
    const d = fmt.toDate(r.date);
    const isPay = r.kind === 'payment';
    const sub = isPay ? (r.sub || 'Payment') : r.category + (SOURCE[r.source] ? ' · ' + SOURCE[r.source] : '');
    return '<li class="pa-row' + (isPay ? ' is-pay' : '') + (r.amount < 0 ? ' is-credit' : '') + '">' +
      '<span class="pa-date" aria-hidden="true"><span class="pa-date-d">' + d.getDate() + '</span><span class="pa-date-m">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></span>' +
      (isPay && r.brand ? '<span class="pa-row-icon pa-row-card">' + Club.cards.mark(r.brand, 12) + '</span>' : '<span class="pa-row-icon" style="--cat:' + (isPay ? 'var(--moss)' : CAT_COLOR[r.category]) + '">' + Club.icon(CAT_ICON[r.category] || 'tag') + '</span>') +
      '<span class="pa-row-main"><span class="pa-row-desc">' + esc(r.description) + '</span><span class="pa-row-sub">' + esc(sub) + '<span class="pa-sr"> · ' + esc(fmt.date(r.date)) + '</span></span></span>' +
      '<span class="pa-row-amt num">' + (isPay ? '<span class="pa-pay-amt">' + money(r.amount) + '</span><span class="pa-row-tag">Paid</span>' : money(r.amount) + (r.amount < 0 ? '<span class="pa-row-tag">Credit</span>' : '')) + '</span></li>';
  }

  function renderOverview(view, m) {
    const latest = myStatements(m.id)[0] || null;
    const open = openStatements(m.id);
    const pays = myPayments(m.id).slice().sort(byDate);
    const last = pays[pays.length - 1] || null;
    const bal = r2(m.balance || 0);
    const aging = Club.billing && Club.billing.aging ? Club.billing.aging(m.id) : { pastDue: 0 };
    const key = curMonth();
    const month = myCharges(m.id).filter(function (c) { return mkey(c.date) === key && c.date <= today() && c.amount > 0; });
    const byCat = CATS.map(function (c) { return { label: c, value: r2(sum(month.filter(function (x) { return (CATS.indexOf(x.category) >= 0 ? x.category : 'Other') === c; }), function (x) { return x.amount; })), color: CAT_COLOR[c] }; }).filter(function (x) { return x.value > 0; });
    const monthTotal = r2(sum(byCat, function (x) { return x.value; }));
    const recent = rows(m.id).slice(0, 3);
    const fb = fbPanel(m);

    let dueLine, dueSub;
    if (bal <= 0.005) { dueLine = bal < -0.005 ? 'In credit' : 'Settled'; dueSub = bal < -0.005 ? money(-bal) + ' will go toward your next charges' : 'Nothing is due. Thank you.'; }
    else if (open.some(function (s) { return owedOn(s, m) > 0.005; })) { const s = open.find(function (s) { return owedOn(s, m) > 0.005; }); dueLine = s.dueOn ? fmt.date(s.dueOn) : 'On receipt'; dueSub = (s.status === 'overdue' ? 'Past due · ' : '') + monthLabel(s.period) + ' statement'; }
    else { dueLine = 'Next statement'; dueSub = 'New charges will be on your ' + monthName(key) + ' statement'; }

    view.innerHTML = hero(m, 'My account', 'Your balance, statements and payments in one place.') + subnav('') +
      '<div class="pa-ovwrap"><div class="grid pa-ov">' +
        '<section class="panel pa-balance" data-reveal><div class="panel-body">' +
          '<div class="eyebrow">Your account</div><div class="pa-bal-h">Current balance</div>' +
          '<div class="pa-bal-val"><span data-count="' + Math.abs(bal) + '" data-prefix="' + (bal < -0.005 ? '-$' : '$') + '" data-decimals="2">' + esc(fmt.money(0)) + '</span></div>' +
          standingNote(m) +
          (aging.pastDue > 0.005 && bal > 0.005 ? '<p class="pa-past">' + Club.icon('info') + '<span>' + money(Math.min(aging.pastDue, bal)) + ' is more than 30 days old. If you have already paid, you can ignore this.</span></p>' : '') +
          '<dl class="pa-facts"><div><dt>Payment due</dt><dd>' + esc(dueLine) + '</dd><dd class="muted">' + dueSub + '</dd></div>' +
          '<div><dt>Last payment</dt><dd>' + (last ? money(last.amount) : 'None yet') + '</dd><dd class="muted">' + (last ? esc(fmt.date(last.date)) + ' · ' + esc(payMethod(last)) : 'Your payments will appear here') + '</dd></div>' +
          '<div><dt>Latest statement</dt><dd>' + (latest ? '<a href="#/account/statement/' + esc(latest.id) + '">' + esc(monthLabel(latest.period)) + '</a>' : 'None issued') + '</dd><dd>' + (latest ? statusLabel(latest) : '<span class="muted">Statements are issued monthly</span>') + '</dd></div></dl>' +
          '<div class="pa-bal-actions">' + (bal > 0.005 ? '<a class="btn btn-primary" href="#/account/pay">' + Club.icon('card') + '<span>Make a payment</span></a>' : '') +
          (latest ? '<a class="btn" href="#/account/statement/' + esc(latest.id) + '">' + Club.icon('billing') + '<span>View statement</span></a>' : '') + '</div>' +
        '</div></section>' +
        '<div class="pa-month" data-reveal>' + Portal.accordion({ id: 'pa-month', icon: 'billing', title: 'This month · ' + fmt.money0(monthTotal) + ' to date', summary: monthLabel(key) + ' · by department',
          body: byCat.length ? Club.charts.donut({ items: byCat, size: 140, money: true, center: { value: fmt.money0(monthTotal), label: 'To date' } })
            : '<p class="muted">No charges yet this month.</p>' }) + '</div>' +
      '</div>' +
      '<div class="grid pa-ov2' + (fb ? '' : ' pa-ov2-single') + '">' + fb +
        '<section class="panel pa-recent" data-reveal><div class="panel-head"><h3>Recent activity</h3></div><div class="panel-body flush">' +
          (recent.length ? '<ul class="pa-list">' + recent.map(rowHTML).join('') + '<li class="pa-all"><a href="#/account/activity">View all activity' + Club.icon('chevronRight') + '</a></li></ul>' : ui.empty({ icon: 'billing', title: 'No activity yet', text: 'Your charges and payments will appear here.' })) +
        '</div></section>' +
      '</div></div>' + moreHTML(m);
  }

  /* ---------------- Overview: next season, the year so far, visits ---------------- */
  function moreHTML(m) {
    const ys = yearData(m, YEAR);
    const top = ys.deps.filter(function (d) { return d.net > 0; }).sort(function (a, b) { return b.net - a.net; }).slice(0, 3);
    const toRate = Club.feedback ? Club.feedback.visits({ memberId: m.id }).filter(function (v) { return !v.fb; }).length : 0;
    return '<div class="grid pa-ov3">' + renewCard(m) +
      '<section class="panel pa-ys-card" data-reveal><div class="panel-head"><div><h3>' + YEAR + ' season summary</h3><div class="pa-head-sub">Your spending by department, ready to print</div></div>' + Club.icon('reports', 'pa-head-icon') + '</div><div class="panel-body">' +
        (ys.items ? '<div class="pa-rn-fig"><span class="pa-fig-l">Season total so far</span><span class="pa-rn-val">' + money(ys.total) + '</span></div>' +
          '<ul class="pa-ys-mini">' + top.map(function (d) { return '<li><span class="pa-ys-dot" style="--cat:' + CAT_COLOR[d.c] + '"></span><span>' + esc(d.c) + '</span><span class="num">' + money(d.net) + '</span></li>'; }).join('') + '</ul>'
          : '<p class="pa-rn-line">Nothing has been charged to your account in ' + YEAR + ' yet.</p>') +
        '<a class="p-link" href="#/account/summary">View and download' + Club.icon('chevronRight') + '</a></div></section>' +
      '<a class="pa-linkrow" href="#/feedback" data-reveal><span class="pa-st-icon">' + Club.icon('star') + '</span><span class="pa-st-main"><span class="pa-st-period">Rate your visits</span><span class="pa-row-sub">' +
        esc(toRate ? toRate + (toRate === 1 ? ' visit' : ' visits') + ' from the last 14 days to rate' : 'Tell us how your rounds and meals went') + '</span></span>' + Club.icon('chevronRight', 'pa-chev') + '</a>' +
    '</div>';
  }

  /* ---------------- Next season: renew (Club.billing.renewal, js/shared/billing-data.js) ----------------
     Dues are the tier's annualDues: placeholders in this demo, shown as amounts only, never as the club's prices.
     Pay in full, or the time payment plan from the club's Membership Handbook: for members in good standing, a $50
     administration fee when applying, payments due on the 15th of each month, all dues paid by August 15; a valid credit
     card must be on file with the club office (this site never stores one) and is charged if a payment is missed; credit
     card payments carry a 1.5% fee; 30 days in arrears suspends tee time booking and golf. Renew opens a review sheet;
     Confirm records the renewal and charges the full amount, or the administration fee, to the account with a receipt. */
  function renewApi() { return Club.billing && Club.billing.renewal ? Club.billing.renewal : null; }
  function canRenew(m) { return m.status !== 'suspended' && m.status !== 'resigned' && !!tierOf(m); }
  function planLine(r) {
    const done = r.schedule.filter(function (s) { return s.chargeId; }).length;
    return r.plan === 'monthly' ? 'Time payment plan, ' + done + ' of ' + r.schedule.length + ' payments on your account' : 'Paid in full';
  }
  function instalmentsLine(sched) {
    const a = sched[0].amount, b = sched[sched.length - 1].amount;
    return sched.length + ' payments of ' + fmt.money(a) + (Math.abs(a - b) > 0.005 ? ' (the last is ' + fmt.money(b) + ')' : '') + ', due on the 15th';
  }
  const TP_TAG = { paid: ['Paid', 'good'], scheduled: ['Scheduled', 'outline'], due: ['Due today', 'info'], missed: ['Missed', 'warn'], arrears: ['30 days late', 'bad'], legacy: ['Posted', 'plain'] };
  function renewCard(m) {
    const RN = renewApi(), t = tierOf(m);
    if (!RN || !t) return '';
    const r = RN.forMember(m.id);
    let body;
    if (r) {
      const ps = RN.status ? RN.status(r) : null;
      const left = r.schedule.filter(function (s) { return !s.chargeId; }), next = ps ? ps.next : left[0];
      const missed = ps ? ps.missed : [];
      body = '<div class="pa-rn-state">' + ui.badge('Renewed', 'good') + '<span>' + esc(planLine(r)) + '</span></div>' +
        (missed.length ? '<p class="pa-rn-line pa-rn-late">' + esc('A payment of ' + fmt.money(missed[0].owed) + ' was due ' + fmt.date(missed[0].date) + '. Please pay it now; the card on file with the club is charged for missed payments.') + '</p>'
          : '<p class="pa-rn-line">' + (next ? 'Next payment ' + money(next.owed || next.amount) + ' due ' + esc(fmt.date(next.date)) + '. ' + left.length + ' of ' + r.schedule.length + ' still to come.' : 'Your ' + RN.SEASON + ' dues of ' + money(r.total) + ' are on your account. Thank you.') + '</p>') +
        '<a class="p-link" href="#/account/renew">View your plan' + Club.icon('chevronRight') + '</a>';
    } else if (!canRenew(m)) {
      body = '<p class="pa-rn-line">To renew for ' + RN.SEASON + ', please call the club office at <a class="nowrap" href="tel:' + esc(String(Club.info.phone).replace(/[^0-9+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</p>';
    } else {
      const sched = RN.schedule(t.annualDues, today(), 'monthly');
      body = '<div class="pa-rn-fig"><span class="pa-fig-l">' + esc(t.name) + ' dues for ' + RN.SEASON + '</span><span class="pa-rn-val">' + money(t.annualDues) + '</span></div>' +
        '<p class="pa-rn-line">Pay in full' + (sched.length > 1 ? ', or on the time payment plan: ' + esc(sched.length) + ' payments due on the 15th of each month until August 15' : '') + '.</p>' +
        '<p class="pa-fine pa-rn-demo">Placeholder amount in this demo.</p>' +
        '<a class="btn btn-primary pa-rn-go" href="#/account/renew">' + Club.icon('crest') + '<span>Renew for ' + RN.SEASON + '</span></a>';
    }
    return '<section class="panel pa-rn-card" data-reveal><div class="panel-head"><div><h3>' + RN.SEASON + ' membership</h3><div class="pa-head-sub">' + (r ? 'You are renewed for next season' : 'Renewal for next season') + '</div></div>' + Club.icon('crest', 'pa-head-icon') + '</div><div class="panel-body">' + body + '</div></section>';
  }
  function schedRows(sched, r, m) {
    const RN = renewApi(), ps = r && r.plan === 'monthly' && RN && RN.status ? RN.status(r) : null;
    return '<ol class="pa-rn-list">' + sched.map(function (s, i) {
      const d = fmt.toDate(s.date), posted = !!s.chargeId, st = ps ? ps.rows[i] : null;
      const rc = posted && Club.receipts ? Club.receipts.forMember(m.id).filter(function (x) { return x.chargeId === s.chargeId; }) : [];
      const what = sched.length === 1 ? 'Paid in full' : 'Payment ' + s.n + ' of ' + sched.length;
      const when = !r && s.date === today() ? 'Today, charged when you confirm' : (sched.length > 1 ? 'Due ' : '') + fmt.date(s.date);
      const tag = st ? TP_TAG[st.state] : posted ? ['Posted', 'plain'] : ['Scheduled', 'outline'];
      return '<li class="pa-rn-row' + (posted ? ' is-posted' : '') + '"><span class="pa-date" aria-hidden="true"><span class="pa-date-d">' + d.getDate() + '</span><span class="pa-date-m">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></span>' +
        '<span class="pa-row-main"><span class="pa-row-desc">' + esc(what) + '</span><span class="pa-row-sub">' + esc(when) + '</span>' + (rc.length ? Portal.receiptLink(rc) : '') + '</span>' +
        '<span class="pa-row-amt num">' + money(s.amount) + (r ? '<span class="pa-row-tag">' + esc(tag[0]) + '</span>' : '') + '</span></li>';
    }).join('') + '</ol>';
  }
  /* The Time Payment Policy, in the member's words (shown before they choose the plan and on their plan). */
  function tpTerms(RN) {
    return '<ul class="pa-tp-terms">' +
      '<li>A $50.00 administration fee applies to every time payment application.</li>' +
      '<li>Payments are due on the 15th of each month, and all dues are paid in full by August 15, ' + RN.SEASON + '.</li>' +
      '<li>Pay by EFT, cash, cheque, debit or credit card. Credit card payments carry a 1.5% processing fee.</li>' +
      '<li>A valid credit card must be on file with the club office. It is charged if a monthly payment is missed. This website never stores your card.</li>' +
      '<li>A payment 30 days in arrears suspends tee time booking and golf until it is paid.</li></ul>';
  }
  let renewPlan = 'full';
  let renewBusy = false;
  function renderRenew(view, m) {
    const RN = renewApi(), t = tierOf(m);
    const back = '<a class="pa-back" href="#/account">' + Club.icon('chevronLeft') + '<span>Back to my account</span></a>';
    if (!RN || !t) { view.innerHTML = back + '<section class="panel">' + ui.empty({ icon: 'crest', title: 'Renewal is not available', text: 'Please call the club office to renew your membership.' }) + '</section>'; return; }
    const SEASON = RN.SEASON, r = RN.forMember(m.id);
    if (r) {
      const left = r.schedule.filter(function (s) { return !s.chargeId; });
      const posted = r2(sum(r.schedule.filter(function (s) { return s.chargeId; }), function (s) { return s.amount; }));
      const ps = r.plan === 'monthly' && RN.status ? RN.status(r) : null;
      const owe = ps ? ps.owedNow : 0;
      view.innerHTML = hero(m, 'Your ' + SEASON + ' membership', 'You are renewed for ' + SEASON + '. Thank you, ' + m.firstName + '.') + subnav('renew') +
        '<div class="grid pa-rn">' +
          '<section class="panel pa-rn-done" data-reveal><div class="panel-head"><div><h3>Your plan</h3><div class="pa-head-sub">Renewed ' + esc(fmt.date(String(r.createdAt).slice(0, 10))) + '</div></div>' + ui.badge('Renewed', 'good') + '</div><div class="panel-body">' +
            '<dl class="pa-review-kv"><div><dt>Membership</dt><dd>' + esc((S.find('membershipTiers', r.tierId) || t).name) + '</dd></div><div><dt>Season</dt><dd>' + SEASON + '</dd></div>' +
            '<div><dt>Plan</dt><dd>' + esc(RN.PLAN_LABEL[r.plan]) + '</dd></div><div><dt>Dues for the year</dt><dd>' + money(r.total) + '</dd></div>' +
            (r.adminFee ? '<div><dt>Administration fee</dt><dd>' + money(r.adminFee.amount) + '</dd></div>' : '') +
            '<div><dt>On your account so far</dt><dd>' + money(posted) + '</dd></div><div><dt>Still to come</dt><dd class="pa-rv-amt">' + money(r2(r.total - posted)) + '</dd></div></dl>' +
            (owe > 0.005 ? '<p class="pa-rn-line pa-rn-late">' + esc(fmt.money(owe) + ' is due on your plan now.') + '</p><a class="btn btn-primary" href="#/account/pay/plan">' + Club.icon('card') + '<span>Pay ' + esc(fmt.money(owe)) + '</span></a>' : '') +
            (r.plan === 'monthly' ? tpTerms(RN) : '') +
            '<p class="pa-fine">' + (left.length ? 'Each payment is added to your account on its due date and appears on that month’s statement.' : 'Everything for ' + SEASON + ' is on your account.') + ' Questions? Call the club office at ' + esc(Club.info.phone) + '.</p>' +
          '</div></section>' +
          '<section class="panel pa-rn-sched" data-reveal><div class="panel-head"><div><h3>' + (left.length ? 'Remaining schedule' : 'Schedule') + '</h3><div class="pa-head-sub">' + esc(left.length ? left.length + ' of ' + r.schedule.length + ' still to come' : 'All on your account') + '</div></div></div><div class="panel-body flush">' + schedRows(r.schedule, r, m) + '</div></section>' +
        '</div>';
      return;
    }
    if (!canRenew(m)) { view.innerHTML = back + '<section class="panel">' + ui.empty({ icon: 'crest', title: 'Please call the club office', text: 'Your membership cannot be renewed online. The club office at ' + Club.info.phone + ' can help.' }) + '</section>'; return; }
    const total = r2(t.annualDues), start = today();
    const monthly = RN.schedule(total, start, 'monthly'), full = RN.schedule(total, start, 'full');
    const el = RN.eligible ? RN.eligible(m.id) : { ok: true };
    const tpOk = monthly.length > 1 && el.ok;
    if (!tpOk) renewPlan = 'full';
    const fee = RN.TP ? RN.TP.FEE : 50;
    function opt(value, title, amount, sub, off) {
      return '<label class="pa-opt' + (off ? ' is-off' : '') + '"><input type="radio" name="renewPlan" value="' + value + '"' + (value === renewPlan ? ' checked' : '') + (off ? ' disabled' : '') + '><span class="pa-opt-body"><span class="pa-opt-title">' + esc(title) + '</span><span class="pa-opt-sub">' + esc(sub) + '</span></span><span class="pa-opt-amt num">' + money(amount) + '</span></label>';
    }
    view.innerHTML = hero(m, 'Renew for ' + SEASON, 'Choose how to pay next season’s dues. Nothing is charged until you confirm.') + subnav('renew') +
      '<div class="grid pa-rn">' +
        '<div class="stack">' +
          '<section class="panel" data-reveal><div class="panel-head"><h3>Your membership</h3>' + Club.icon('crest', 'pa-head-icon') + '</div><div class="panel-body">' +
            '<dl class="pa-review-kv"><div><dt>Membership</dt><dd>' + esc(t.name) + '</dd></div><div><dt>Season</dt><dd>' + SEASON + '</dd></div><div><dt>Dues for the year</dt><dd class="pa-rv-amt">' + money(total) + '</dd></div></dl>' +
            '<p class="pa-fine">Placeholder amount in this demo, not a confirmed club price.</p></div></section>' +
          '<section class="panel" data-reveal><div class="panel-head"><h3>How would you like to pay?</h3></div><div class="panel-body">' +
            '<div class="pa-opts" role="radiogroup" aria-label="Payment plan">' + opt('full', 'Pay in full', total, 'Charged to your member account today') +
              (monthly.length > 1 ? opt('monthly', 'Time payment plan', monthly[0].amount, el.ok ? fmt.money(fee) + ' administration fee today, then ' + monthly.length + ' payments due on the 15th, ' + monthName(mkey(monthly[0].date)) + ' to August 15, ' + SEASON : el.reason, !el.ok) : '') + '</div>' +
            (monthly.length > 1 ? '<h4 class="pa-rn-rh">Time payment plan</h4>' + tpTerms(RN) : '') + '</div></section>' +
        '</div>' +
        '<section class="panel pa-rn-sched" data-reveal><div class="panel-head"><div><h3>Your schedule</h3><div class="pa-head-sub pa-rn-sub"></div></div></div><div class="panel-body flush"><div class="pa-rn-host"></div>' +
          '<div class="pa-rn-total"><span>Total for ' + SEASON + '</span><strong class="num">' + money(total) + '</strong></div></div></section>' +
      '</div>';
    function sched() { return renewPlan === 'monthly' ? monthly : full; }
    function paint() {
      const s = sched();
      ui.$('.pa-rn-host', view).innerHTML = schedRows(s, null, m);
      ui.$('.pa-rn-sub', view).textContent = s.length > 1 ? instalmentsLine(s) : 'One payment today';
      Portal.actionBar.show({ summaryHTML: s.length > 1 ? '<span class="pa-bar-amt">' + esc(fmt.money(fee)) + '</span><small>' + esc('fee today, then ' + s.length + ' payments') + '</small>' : '<span class="pa-bar-amt">' + esc(fmt.money(s[0].amount)) + '</span><small>' + esc('today, in full') + '</small>', label: 'Renew for ' + SEASON, onClick: review });
    }
    function review() {
      const s = sched(), first = s[0], tp = s.length > 1;
      const content = '<div class="pa-rn-review"><dl class="pa-review-kv">' +
          '<div><dt>Renewing</dt><dd>' + esc(t.name) + ' membership, ' + SEASON + ' season</dd></div>' +
          '<div><dt>Plan</dt><dd>' + esc(tp ? 'Time payment plan, ' + s.length + ' payments' : 'Pay in full') + '</dd></div>' +
          '<div><dt>Dues for the year</dt><dd>' + money(total) + '</dd></div>' +
          '<div><dt>' + (tp ? 'Charged today' : 'First charge') + '</dt><dd><span class="pa-rv-amt">' + money(tp ? fee : first.amount) + '</span><span class="pa-rn-rsub">' + esc(tp ? 'Administration fee, charged to your member account today' : 'Charged to your member account today') + '</span></dd></div></dl>' +
        (tp ? '<h4 class="pa-rn-rh">Payments</h4><ol class="pa-rn-mini">' + s.map(function (x) { return '<li><span>' + esc(fmt.date(x.date)) + '</span><span class="num">' + money(x.amount) + '</span></li>'; }).join('') + '</ol>' : '') +
        '<p class="pa-rn-terms">' + esc(tp ? 'Each payment is added to your account on the 15th of its month and is due that day. All dues are paid in full by August 15, ' + SEASON + '.' : 'The full amount is added to your account today and appears on your next statement.') + '</p>' +
        (tp ? '<label class="check pa-rn-agree"><input type="checkbox" name="tpAgree"><span>I have a valid credit card on file with the club office, or will call ' + esc(Club.info.phone) + ' to give one. It is charged if a payment is missed.</span></label>' : '') + '</div>';
      const sh = Portal.openSheet({ title: 'Confirm your renewal', content: content,
        footer: '<div class="pa-rn-acts"><button type="button" class="btn" data-rv="back">Back</button><button type="button" class="btn btn-primary" data-rv="ok">Confirm renewal</button></div>' });
      if (sh.duplicate) return;
      ui.on(sh.foot, 'click', '[data-rv]', function (e, b) {
        if (b.dataset.rv === 'back') { sh.close(); return; }
        if (renewBusy) return;
        const agree = sh.body ? ui.$('input[name=tpAgree]', sh.body) : document.querySelector('input[name=tpAgree]');
        if (tp && agree && !agree.checked) { ui.toast('Please confirm the card on file with the club office', 'bad'); agree.focus(); return; }
        renewBusy = true; b.disabled = true; b.setAttribute('aria-busy', 'true');
        const res = RN.renew(m.id, renewPlan);
        sh.close();
        renewBusy = false;
        if (res.error) { ui.toast(res.error, 'bad'); return; }
        Portal.actionBar.hide();
        ui.toast(res.duplicate ? 'You are already renewed for ' + SEASON : 'Thank you. You are renewed for ' + SEASON);
        Portal.render();
      });
    }
    ui.on(view, 'change', 'input[name=renewPlan]', function (e, f) { renewPlan = f.value; paint(); });
    paint();
  }

  /* ---------------- Season summary (#/account/summary) ----------------
     Everything charged to the account in the season (calendar year of today, up to today), from 'charges' and
     'payments': totals by department and by month, the top items, payments and credits. The page is a letterhead sheet
     (.pa-printable): Download summary prints it, and the print rules below show only the sheet. */
  const YEAR = today().slice(0, 4);
  function catOf(c) { return CATS.indexOf(c.category) >= 0 ? c.category : 'Other'; }
  function yearData(m, year) {
    const ch = myCharges(m.id).filter(function (c) { return String(c.date).slice(0, 4) === year && c.date <= today(); }).sort(byDate);
    const pays = myPayments(m.id).filter(function (p) { return String(p.date).slice(0, 4) === year && p.date <= today(); }).sort(byDate);
    const pos = ch.filter(function (c) { return c.amount > 0; }), neg = ch.filter(function (c) { return c.amount < 0; });
    const deps = CATS.map(function (c) {
      const of = ch.filter(function (x) { return catOf(x) === c; });
      return { c: c, n: of.filter(function (x) { return x.amount > 0; }).length, net: r2(sum(of, function (x) { return x.amount; })) };
    }).filter(function (d) { return d.n || d.net; });
    const months = Array.from(new Set(ch.map(function (c) { return mkey(c.date); }))).sort().map(function (k) {
      const of = ch.filter(function (c) { return mkey(c.date) === k; });
      return { k: k, n: of.length, net: r2(sum(of, function (c) { return c.amount; })) };
    });
    const by = {};
    pos.forEach(function (c) { const k = c.description || 'Account charge'; by[k] = by[k] || { name: k, c: catOf(c), n: 0, total: 0 }; by[k].n++; by[k].total = r2(by[k].total + c.amount); });
    const top = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.total - a.total || b.n - a.n; }).slice(0, 5);
    const stmts = myStatements(m.id).filter(function (s) { return s.period.slice(0, 4) === year; });
    return { year: year, items: ch.length, charges: r2(sum(pos, function (c) { return c.amount; })), credits: r2(sum(neg, function (c) { return c.amount; })), total: r2(sum(ch, function (c) { return c.amount; })),
      deps: deps, months: months, top: top, credList: neg, pays: pays, paid: r2(sum(pays, function (p) { return p.amount; })), stmts: stmts, from: ch.length ? ch[0].date : null };
  }
  function shareBar(v, max) { const p = max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0; return '<span class="pa-ys-bar" aria-hidden="true"><span style="width:' + (p ? Math.max(2, p) : 0) + '%"></span></span>'; }
  function renderSummary(view, m) {
    const d = yearData(m, YEAR), t = tierOf(m), info = Club.info;
    const pct = function (v) { return d.total > 0 ? Math.round(v / d.total * 100) + '%' : ''; };
    const maxDep = Math.max.apply(null, d.deps.map(function (x) { return x.net; }).concat([0]));
    const maxMon = Math.max.apply(null, d.months.map(function (x) { return x.net; }).concat([0]));
    const range = 'January 1 to ' + fmt.toDate(today()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const empty = '<p class="muted">Nothing was charged to your account in ' + YEAR + '.</p>';
    view.innerHTML = '<div class="pa-st-bar"><a class="pa-back" href="#/account">' + Club.icon('chevronLeft') + '<span>Back to my account</span></a><div class="pa-st-bar-actions">' +
        ui.btn('Download summary', { kind: 'primary', icon: 'download', action: 'ys-print' }) + '</div></div>' +
      '<p class="pa-ys-hint">Download summary opens your device’s print window: choose Save as PDF to keep a copy.</p>' +
      '<div class="pa-sheet-wrap"><article class="pa-sheet pa-printable pa-ys" data-reveal aria-label="' + esc(YEAR + ' season summary') + '">' +
        '<header class="pa-lh">' + crest() + '<div class="pa-lh-name">' + esc(info.name) + '</div><div class="pa-lh-est">Established ' + esc(info.est) + '</div><div class="pa-lh-addr">' + esc(info.address) + ' · ' + esc(info.phone) + (info.email ? ' · ' + esc(info.email) : '') + '</div></header>' +
        '<div class="pa-sheet-rule"></div>' +
        '<h2 class="pa-ys-title">' + YEAR + ' season summary</h2>' +
        '<div class="pa-sheet-meta"><div class="pa-addressee"><div class="pa-fig-l">Prepared for</div><div class="pa-addressee-name">' + esc(m.firstName + ' ' + m.lastName) + '</div><div>Member number ' + esc(m.memberNo) + (t ? ' · ' + esc(t.name) : '') + '</div></div>' +
          '<dl class="pa-sheet-facts"><dt>Season</dt><dd>' + YEAR + '</dd><dt>Covers</dt><dd>' + esc(range) + '</dd><dt>Statements</dt><dd>' + d.stmts.length + ' issued</dd></dl></div>' +
        '<div class="pa-summary pa-ys-figs"><div><span>Charges</span><strong data-ys="charges">' + money(d.charges) + '</strong></div><div><span>Credits and refunds</span><strong data-ys="credits">' + money(d.credits) + '</strong></div>' +
          '<div class="pa-summary-due"><span>Season total</span><strong data-ys="total">' + money(d.total) + '</strong></div><div><span>Payments made</span><strong data-ys="paid">' + money(d.paid) + '</strong></div></div>' +
        '<h4 class="pa-sheet-h">By department</h4>' +
        (d.deps.length ? '<table class="table pa-sheet-table pa-ys-table" data-ys="deps"><thead><tr><th>Department</th><th class="num">Items</th><th class="pa-ys-sh">Share</th><th class="num">Amount</th></tr></thead><tbody>' + d.deps.map(function (x) {
          return '<tr data-dep="' + esc(x.c) + '"><td><span class="pa-ys-dot" style="--cat:' + CAT_COLOR[x.c] + '"></span>' + esc(x.c) + '</td><td class="num">' + x.n + '</td><td class="pa-ys-sh">' + shareBar(x.net, maxDep) + '<span class="pa-ys-pct">' + esc(pct(x.net)) + '</span></td><td class="num nowrap">' + money(x.net) + '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td>Season total</td><td class="num">' + sum(d.deps, function (x) { return x.n; }) + '</td><td class="pa-ys-sh"></td><td class="num nowrap">' + money(d.total) + '</td></tr></tfoot></table>' : empty) +
        '<h4 class="pa-sheet-h">By month</h4>' +
        (d.months.length ? '<table class="table pa-sheet-table pa-ys-table" data-ys="months"><thead><tr><th>Month</th><th class="num">Entries</th><th class="pa-ys-sh"><span class="pa-sr">Compared with other months</span></th><th class="num">Amount</th></tr></thead><tbody>' + d.months.map(function (x) {
          return '<tr data-month="' + esc(x.k) + '"><td class="nowrap">' + esc(monthName(x.k)) + '</td><td class="num">' + x.n + '</td><td class="pa-ys-sh">' + shareBar(x.net, maxMon) + '</td><td class="num nowrap">' + money(x.net) + '</td></tr>';
        }).join('') + '</tbody></table>' : empty) +
        '<h4 class="pa-sheet-h">Top items</h4>' +
        (d.top.length ? '<table class="table pa-sheet-table pa-ys-table" data-ys="top"><thead><tr><th>Item</th><th class="pa-col-dept">Department</th><th class="num">Times</th><th class="num">Amount</th></tr></thead><tbody>' + d.top.map(function (x) {
          return '<tr><td>' + esc(x.name) + '<span class="pa-dept-inline">' + esc(x.c) + '</span></td><td class="pa-col-dept">' + esc(x.c) + '</td><td class="num">' + x.n + '</td><td class="num nowrap">' + money(x.total) + '</td></tr>';
        }).join('') + '</tbody></table>' : empty) +
        '<h4 class="pa-sheet-h">Payments and credits</h4>' +
        '<div class="pa-ys-two"><div><h5 class="pa-ys-h5">Payments made</h5>' + (d.pays.length ? '<table class="table pa-sheet-table" data-ys="pays"><tbody>' + d.pays.map(function (p) {
            return '<tr><td class="nowrap">' + esc(fmt.dateShort(p.date)) + '</td><td>' + esc(payMethod(p)) + '</td><td class="num nowrap">' + money(p.amount) + '</td></tr>';
          }).join('') + '</tbody><tfoot><tr><td colspan="2">' + d.pays.length + (d.pays.length === 1 ? ' payment' : ' payments') + '</td><td class="num nowrap">' + money(d.paid) + '</td></tr></tfoot></table>' : '<p class="muted">No payments in ' + YEAR + '.</p>') + '</div>' +
          '<div><h5 class="pa-ys-h5">Credits and refunds</h5>' + (d.credList.length ? '<table class="table pa-sheet-table" data-ys="credits"><tbody>' + d.credList.map(function (c) {
            return '<tr><td class="nowrap">' + esc(fmt.dateShort(c.date)) + '</td><td>' + esc(c.description || 'Account credit') + '</td><td class="num nowrap">' + money(c.amount) + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="muted">No credits or refunds in ' + YEAR + '.</p>') + '</div></div>' +
        '<footer class="pa-sheet-foot"><p class="pa-sheet-thanks">Thank you for a wonderful ' + YEAR + ' season at ' + esc(info.name) + '.</p><p>This summary lists the charges, credits and payments on your account from ' + esc(range) + '. Taxes are included. Your balance today is ' + money(m.balance || 0) + '. Questions about your account? Call the Controller at <a class="nowrap" href="tel:' + esc(String(info.phone).replace(/[^0-9+]/g, '')) + ',202">' + esc(info.phone) + ' ext. 202</a>.</p></footer>' +
      '</article></div>';
    ui.on(view, 'click', '[data-action=ys-print]', function () { window.print(); });
  }

  /* ---------------- Activity ---------------- */
  const af = { cat: '', month: '', limit: 8 };
  function renderActivity(view, m) {
    const all = rows(m.id);
    const months = Array.from(new Set(all.map(function (r) { return mkey(r.date); }))).sort().reverse();
    if (af.month && months.indexOf(af.month) < 0) af.month = '';
    view.innerHTML = hero(m, 'Account activity', 'Every charge and payment on your account, newest first.') + subnav('activity') +
      '<section class="panel pa-actpanel" data-reveal><div class="pa-filters">' +
        '<label class="pa-filter"><span class="pa-filter-l">Department</span><select class="select" name="cat"><option value="">All activity</option>' + ui.options(CATS.concat(['Payment']).map(function (c) { return { value: c, label: c === 'Payment' ? 'Payments' : c }; }), af.cat) + '</select></label>' +
        '<label class="pa-filter"><span class="pa-filter-l">Month</span><select class="select" name="month"><option value="">All months</option>' + ui.options(months.map(function (k) { return { value: k, label: monthLabel(k) }; }), af.month) + '</select></label>' +
      '</div><div class="pa-act"></div></section>';
    const host = ui.$('.pa-act', view);
    function draw() {
      const list = all.filter(function (r) { return (!af.cat || r.category === af.cat) && (!af.month || mkey(r.date) === af.month); });
      if (!list.length) {
        host.innerHTML = ui.empty({ icon: 'filter', title: 'Nothing to show', text: all.length ? 'Nothing matches these filters.' : 'Your charges and payments will appear here.', action: all.length ? ui.btn('Clear filters', { action: 'clear' }) : '' });
        return;
      }
      const ch = r2(sum(list.filter(function (r) { return r.kind === 'charge'; }), function (r) { return r.amount; }));
      const py = r2(sum(list.filter(function (r) { return r.kind === 'payment'; }), function (r) { return r.amount; }));
      const shown = list.slice(0, af.limit);
      let lastKey = '';
      host.innerHTML = '<div class="pa-act-sum"><span><span class="pa-fig-l">Entries</span><strong>' + fmt.num(list.length) + '</strong></span><span><span class="pa-fig-l">Charges</span><strong>' + money(ch) + '</strong></span><span><span class="pa-fig-l">Payments</span><strong>' + money(py) + '</strong></span></div>' +
        '<ul class="pa-list">' + shown.map(function (r) {
          const k = mkey(r.date); let h = '';
          if (k !== lastKey) { lastKey = k; h = '<li class="pa-month-head"><span>' + esc(monthLabel(k)) + '</span></li>'; }
          return h + rowHTML(r);
        }).join('') + '</ul>' +
        (list.length > shown.length ? '<div class="pa-more">' + ui.btn('Show more', { action: 'more' }) + '<span class="muted">Showing ' + shown.length + ' of ' + list.length + '</span></div>' : '');
      ui.animateIn(host);
    }
    draw();
    ui.on(view, 'change', '.pa-filters select', function (e, f) { af[f.name] = f.value; af.limit = 8; draw(); });
    ui.on(view, 'click', '[data-action=more]', function () { af.limit += 20; draw(); });
    ui.on(view, 'click', '[data-action=clear]', function () { af.cat = ''; af.month = ''; af.limit = 8; ui.$$('.pa-filters select', view).forEach(function (s) { s.value = ''; }); draw(); });
  }

  /* ---------------- Receipts ----------------
     Every receipt on the member's account (Club.receipts.forMember), newest first, grouped by month. Search matches the
     title, any item and the receipt number; the month is a Portal.selectField. Tapping a row opens Club.receipts.open. */
  const RC_FIRST = 10;                           /* rows before Show more (keeps the phone page short) */
  const rf = { q: '', month: '', limit: RC_FIRST };
  function norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function rcMatches(r, q) {
    if (!q) return true;
    const hay = norm([r.title, r.no, r.no.replace(/^R-0*/, ''), r.methodLabel].concat((r.lines || []).map(function (l) { return l.name + ' ' + (l.size || ''); })).join(' | '));
    return q.split(' ').every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function rcRowHTML(r) {
    const d = fmt.toDate(r.date), credit = r.kind === 'credit';
    const items = (r.lines || []).length > 1 ? (r.lines.length + ' items') : '';
    return '<li><button type="button" class="pa-row pa-rc-row' + (credit ? ' is-credit' : '') + '" data-receipts="' + esc(r.id) + '" aria-label="' + esc((credit ? 'Credit ' : 'Receipt ') + r.no + ', ' + r.title + ', ' + fmt.date(r.date) + ', ' + fmt.money(r.total)) + '">' +
      '<span class="pa-date" aria-hidden="true"><span class="pa-date-d">' + d.getDate() + '</span><span class="pa-date-m">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></span>' +
      '<span class="pa-row-main"><span class="pa-row-desc">' + esc(r.title) + '</span><span class="pa-row-sub">' + esc([r.no, items, r.methodLabel].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="pa-row-amt num">' + esc(Portal.receiptAmount(r)) + (credit ? '<span class="pa-row-tag">Credit</span>' : '') + '</span>' +
      Club.icon('chevronRight', 'pa-chev') + '</button></li>';
  }
  function renderReceipts(view, m) {
    const all = Club.receipts ? Club.receipts.forMember(m.id) : [];
    const months = Array.from(new Set(all.map(function (r) { return mkey(r.date); }))).sort().reverse();
    if (rf.month && months.indexOf(rf.month) < 0) rf.month = '';
    view.innerHTML = hero(m, 'Receipts', 'A receipt for everything you pay for or order, ready to view, print or save.') + subnav('receipts') +
      (all.length ? '<section class="panel pa-rcpanel" data-reveal><div class="pa-filters pa-rc-filters">' +
          '<div class="pa-filter pa-rc-search"><label class="pa-filter-l" for="pa-rc-q">Search</label><div class="pa-rc-q">' + Club.icon('search') +
            '<input class="input" id="pa-rc-q" type="search" name="q" placeholder="Item or receipt number" autocomplete="off" value="' + esc(rf.q) + '"></div></div>' +
          '<div class="pa-filter pa-rc-month"></div>' +
        '</div><div class="pa-rcs" aria-live="polite"></div></section>'
        : '<section class="panel" data-reveal>' + ui.empty({ icon: 'billing', title: 'No receipts yet', text: 'When you pay or order something at the club, its receipt will be kept here for you.' }) + '</section>');
    if (!all.length) return;
    const host = ui.$('.pa-rcs', view);
    const month = Portal.selectField(ui.$('.pa-rc-month', view), { label: 'Month', title: 'Show receipts from', value: rf.month, icon: 'calendar',
      rows: [{ value: '', label: 'All months' }].concat(months.map(function (k) { const n = all.filter(function (r) { return mkey(r.date) === k; }).length; return { value: k, label: monthLabel(k), meta: n + (n === 1 ? ' receipt' : ' receipts') }; })),
      onChange: function (v) { rf.month = v; rf.limit = RC_FIRST; draw(); } });
    function draw() {
      const q = norm(rf.q);
      const list = all.filter(function (r) { return (!rf.month || mkey(r.date) === rf.month) && rcMatches(r, q); });
      if (!list.length) {
        host.innerHTML = ui.empty({ icon: 'search', title: 'No receipts match', text: 'Try another word or month.', action: ui.btn('Clear search', { action: 'rc-clear' }) });
        return;
      }
      const shown = list.slice(0, rf.limit);
      let lastKey = '';
      host.innerHTML = '<p class="pa-rc-count">' + esc(list.length + (list.length === 1 ? ' receipt' : ' receipts')) + '</p><ul class="pa-list">' + shown.map(function (r) {
          const k = mkey(r.date); let h = '';
          if (k !== lastKey) { lastKey = k; h = '<li class="pa-month-head"><span>' + esc(monthLabel(k)) + '</span></li>'; }
          return h + rcRowHTML(r);
        }).join('') + '</ul>' +
        (list.length > shown.length ? '<div class="pa-more">' + ui.btn('Show more', { action: 'rc-more' }) + '<span class="muted">Showing ' + shown.length + ' of ' + list.length + '</span></div>' : '');
    }
    draw();
    ui.on(view, 'input', '#pa-rc-q', function (e, f) { rf.q = f.value; rf.limit = RC_FIRST; draw(); });
    ui.on(view, 'click', '[data-action=rc-more]', function () { rf.limit += 20; draw(); });
    ui.on(view, 'click', '[data-action=rc-clear]', function () { rf.q = ''; rf.month = ''; rf.limit = RC_FIRST; ui.$('#pa-rc-q', view).value = ''; month.set(''); draw(); });
  }

  /* ---------------- Statements ---------------- */
  function renderStatements(view, m) {
    const list = myStatements(m.id);
    view.innerHTML = hero(m, 'Statements', 'Your monthly statements from the club office.') + subnav('statements') +
      (list.length ? '<ul class="p-list pa-st-list" data-reveal>' + list.map(function (s) {
        const owed = s.status === 'paid' ? 0 : owedOn(s, m);
        return '<li><a class="pa-st" href="#/account/statement/' + esc(s.id) + '">' +
          '<span class="pa-st-icon">' + Club.icon('billing') + '</span>' +
          '<span class="pa-st-main"><span class="pa-st-period">' + esc(monthLabel(s.period)) + '</span><span class="pa-row-sub">Issued ' + esc(fmt.date(s.issuedOn)) + (s.status !== 'paid' && s.dueOn ? ' · due ' + esc(fmt.date(s.dueOn)) : '') + (s.status === 'paid' && s.paidOn ? ' · paid ' + esc(fmt.date(s.paidOn)) : '') + '</span></span>' +
          '<span class="pa-st-amt"><span class="num">' + money(s.total) + '</span>' + statusLabel(s) + '</span>' +
          Club.icon('chevronRight', 'pa-chev') + '</a>' +
          (owed > 0.005 ? '<a class="p-link pa-st-pay" href="#/account/pay/' + esc(s.id) + '">Pay ' + money(owed) + Club.icon('chevronRight') + '</a>' : '') + '</li>';
      }).join('') + '</ul>' : '<section class="panel" data-reveal>' + ui.empty({ icon: 'billing', title: 'No statements yet', text: 'Your first statement comes at the start of the month after your account opens.' }) + '</section>');
  }

  function crest() { return Club.logoImg('pa-crest'); }

  function renderStatement(view, m, id) {
    const s = S.find('statements', id);
    if (!s || s.memberId !== m.id || s.status === 'draft') {
      view.innerHTML = '<a class="pa-back" href="#/account/statements">' + Club.icon('chevronLeft') + '<span>Back to statements</span></a>' + '<section class="panel">' + ui.empty({ icon: 'billing', title: 'Statement not found', text: 'This statement is not available on your account. Please contact the club office if you need a copy.' }) + '</section>';
      return;
    }
    const t = tierOf(m); const start = s.period + '-01', end = monthEnd(s.period);
    let items = S.all('charges').filter(function (c) { return c.statementId === s.id && c.memberId === m.id; });
    if (!items.length) items = myCharges(m.id).filter(function (c) { return c.date >= start && c.date <= end; });
    items = items.slice().sort(byDate);
    const pays = myPayments(m.id).filter(function (x) { return x.date >= start && x.date <= end; }).sort(byDate);
    const cats = CATS.map(function (c) { return { c: c, v: r2(sum(items.filter(function (i) { return (i.category || 'Other') === c; }), function (i) { return i.amount; })) }; }).filter(function (x) { return x.v; });
    const info = Club.info;
    const stNo = s.period.replace('-', '') + '-' + m.memberNo;
    const owed = s.status === 'paid' ? 0 : owedOn(s, m);

    view.innerHTML = '<div class="pa-st-bar"><a class="pa-back" href="#/account/statements">' + Club.icon('chevronLeft') + '<span>Back to statements</span></a><div class="pa-st-bar-actions">' + statusLabel(s) +
      (owed > 0.005 ? '<a class="btn btn-primary" href="#/account/pay/' + esc(s.id) + '">' + Club.icon('card') + '<span>Pay ' + money(owed) + '</span></a>' : '') +
      ui.btn('Print', { icon: 'print', action: 'print' }) + '</div></div>' +
      '<div class="pa-sheet-wrap"><article class="pa-sheet pa-printable" data-reveal>' +
        '<header class="pa-lh">' + crest() + '<div class="pa-lh-name">' + esc(info.name) + '</div><div class="pa-lh-est">Established ' + esc(info.est) + '</div><div class="pa-lh-addr">' + esc(info.address) + ' · ' + esc(info.phone) + (info.email ? ' · ' + esc(info.email) : '') + '</div></header>' +
        '<div class="pa-sheet-rule"></div>' +
        '<div class="pa-sheet-meta"><div class="pa-addressee"><div class="pa-fig-l">Statement for</div><div class="pa-addressee-name">' + esc(m.firstName + ' ' + m.lastName) + '</div><div>' + esc(m.address || '') + '</div><div>Member number ' + esc(m.memberNo) + (t ? ' · ' + esc(t.name) : '') + '</div></div>' +
        '<dl class="pa-sheet-facts"><dt>Statement</dt><dd>' + esc(stNo) + '</dd><dt>Period</dt><dd>' + esc(monthLabel(s.period)) + '</dd><dt>Issued</dt><dd>' + esc(fmt.date(s.issuedOn)) + '</dd><dt>Payment due</dt><dd>' + (s.dueOn ? esc(fmt.date(s.dueOn)) : 'On receipt') + '</dd></dl></div>' +
        '<div class="pa-summary"><div><span>Previous balance</span><strong>' + money(s.openingBalance || 0) + '</strong></div><div><span>Payments received</span><strong>' + money(-(s.paymentsTotal || 0)) + '</strong></div><div><span>New charges</span><strong>' + money(s.chargesTotal || 0) + '</strong></div><div class="pa-summary-due"><span>Balance due</span><strong>' + money(s.total) + '</strong></div></div>' +
        '<h4 class="pa-sheet-h">Charges</h4>' +
        (items.length ? '<table class="table pa-sheet-table"><thead><tr><th>Date</th><th>Description</th><th class="pa-col-dept">Department</th><th class="num">Amount</th></tr></thead><tbody>' + items.map(function (c) {
          return '<tr><td class="nowrap">' + esc(fmt.dateShort(c.date)) + '</td><td>' + esc(c.description || '') + '<span class="pa-dept-inline">' + esc(c.category || 'Other') + '</span></td><td class="pa-col-dept">' + esc(c.category || 'Other') + '</td><td class="num nowrap">' + money(c.amount) + '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="2" class="pa-tf-label">Total charges</td><td class="pa-col-dept"></td><td class="num nowrap">' + money(sum(items, function (c) { return c.amount; })) + '</td></tr></tfoot></table>' : '<p class="muted">No charges in this period.</p>') +
        (cats.length > 1 ? '<div class="pa-cats">' + cats.map(function (x) { return '<span><span class="pa-fig-l">' + esc(x.c) + '</span>' + money(x.v) + '</span>'; }).join('') + '</div>' : '') +
        '<h4 class="pa-sheet-h">Payments</h4>' +
        (pays.length ? '<table class="table pa-sheet-table"><thead><tr><th>Date</th><th>Method</th><th class="pa-col-dept">Reference</th><th class="num">Amount</th></tr></thead><tbody>' + pays.map(function (x) {
          return '<tr><td class="nowrap">' + esc(fmt.dateShort(x.date)) + '</td><td>' + esc(payMethod(x)) + '</td><td class="pa-col-dept">' + esc(x.method === 'Card' ? 'Card payment' : x.method === 'Check' ? String(x.reference || '') : 'Club office') + '</td><td class="num nowrap">' + money(-x.amount) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">No payments received in this period.</p>') +
        '<footer class="pa-sheet-foot"><p class="pa-sheet-thanks">Thank you for being a member of ' + esc(info.name) + '.</p><p>Please pay by ' + (s.dueOn ? esc(fmt.date(s.dueOn)) : 'return') + '. Questions about your account? Call the Controller at <a class="nowrap" href="tel:' + esc(String(info.phone).replace(/[^0-9+]/g, '')) + ',202">' + esc(info.phone) + ' ext. 202</a>.</p></footer>' +
      '</article></div>';
    ui.on(view, 'click', '[data-action=print]', function () { window.print(); });
  }

  /* ---------------- Make a payment (card only) ---------------- */
  /* No card is saved: each payment is typed fresh. Cards stored by older versions ($portalWallet) are no longer read. */
  function brandName(id) { const b = Club.cards.brands.find(function (x) { return x.id === id; }); return b ? b.name : 'Card'; }
  function cardLabel(brand, last4) { return brandName(brand) + ' ending ' + last4; }
  function markChip(brand, h) { return '<span class="pa-mark">' + Club.cards.mark(brand || 'unknown', h || 18) + '</span>'; }
  /** How a payment's method reads to the member. */
  function payMethod(p) {
    if (p.method === 'Card') return p.brand && p.last4 ? cardLabel(p.brand, p.last4) : 'Card';
    if (p.method === 'Check') return 'Cheque';
    return 'Received by the club office';
  }

  function renderPay(view, m, stId) {
    const bal = r2(m.balance || 0);
    const open = openStatements(m.id);
    let st = stId ? open.find(function (s) { return s.id === stId; }) : null;
    if (!st) st = open[0] || null;
    const stOwed = st ? owedOn(st, m) : 0;
    const showStmt = st && stOwed > 0.005 && Math.abs(stOwed - bal) > 0.005;
    /* Time payment plan: what is due now (or the next payment, to pay ahead). A credit card payment toward the plan
       carries the club's 1.5% processing fee, added to the account as its own charge. */
    const RN = renewApi(), plan = RN && RN.status ? RN.forMember(m.id) : null, ps = plan && plan.plan === 'monthly' ? RN.status(plan) : null;
    const planAmt = ps ? (ps.owedNow > 0.005 ? ps.owedNow : ps.next ? r2(ps.next.owed || ps.next.amount) : 0) : 0;
    const planRow = ps ? (ps.missed[0] || ps.rows.find(function (x) { return x.state === 'due'; }) || ps.next) : null;
    const cardFee = function (a) { return r2(a * (RN && RN.TP ? RN.TP.CARD_FEE : 0.015)); };
    const initial = stId === 'plan' && planAmt > 0 ? 'plan' : bal > 0.005 ? (stId && showStmt ? 'statement' : 'full') : 'other';

    function opt(value, title, amount, sub) {
      return '<label class="pa-opt"><input type="radio" name="amountOpt" value="' + value + '"' + (value === initial ? ' checked' : '') + '><span class="pa-opt-body"><span class="pa-opt-title">' + esc(title) + '</span>' + (sub ? '<span class="pa-opt-sub">' + esc(sub) + '</span>' : '') + '</span>' + (amount != null ? '<span class="pa-opt-amt num">' + money(amount) + '</span>' : '') + '</label>';
    }
    view.innerHTML = hero(m, 'Make a payment', 'Pay your account by card.') + subnav('pay') +
      '<form class="grid pa-pay" novalidate autocomplete="on">' +
        '<div class="stack">' +
          '<section class="panel" data-reveal><div class="panel-head"><div><h3>Choose an amount</h3></div></div><div class="panel-body">' +
            (bal <= 0.005 ? '<p class="pa-note">Your account is ' + (bal < -0.005 ? 'in credit by ' + esc(fmt.money(-bal)) : 'fully paid') + '. You can still pay ahead. The amount is kept as a credit for future charges.</p>' : '') +
            '<div class="pa-opts">' +
              (bal > 0.005 ? opt('full', 'Full balance', bal, 'Everything you owe today') : '') +
              (planAmt > 0 ? opt('plan', 'Time payment', planAmt, 'Plus a 1.5% card fee of ' + fmt.money(cardFee(planAmt)) + '.' + (planRow ? (planRow.state === 'missed' || planRow.state === 'arrears' ? ' Missed, was due ' : ' Due ') + fmt.date(planRow.date) + '.' : '')) : '') +
              (showStmt ? opt('statement', monthName(st.period) + ' statement', stOwed, st.status === 'overdue' ? 'Past due since ' + fmt.date(st.dueOn) : (st.dueOn ? 'Due ' + fmt.date(st.dueOn) : 'Issued ' + fmt.date(st.issuedOn))) : '') +
              opt('other', 'Another amount', null, 'Enter any amount') +
            '</div>' +
            '<div class="field pa-other"' + (initial === 'other' ? '' : ' hidden') + '><label for="pa_other">Amount</label><div class="pa-inline pa-money"><span aria-hidden="true">$</span><input class="input" id="pa_other" name="other" inputmode="decimal" placeholder="0.00" autocomplete="off"></div></div>' +
          '</div></section>' +
          '<section class="panel" data-reveal><div class="panel-head"><div><h3>Pay by card</h3></div><span class="pa-secure">' + Club.icon('key') + '<span>Secure</span></span></div><div class="panel-body">' +
            '<div class="pa-newcard"><div class="pa-cc"></div>' +
              '<p class="field-hint">We keep only the card brand and the last four digits, for your receipt. This is a demo: try 4242 4242 4242 4242.</p>' +
            '</div>' +
          '</div></section>' +
        '</div>' +
        '<div class="pa-review" data-reveal>' +
          '<dl class="pa-review-kv"><div><dt>Balance today</dt><dd class="num">' + money(bal) + '</dd></div><div><dt>Balance after this payment</dt><dd class="pa-rv-after num">' + money(bal) + '</dd></div></dl>' +
          '<p class="pa-fine pa-rv-fee" hidden></p>' +
          '<p class="pa-fine">Credited right away. We never store your full card number or security code.</p>' +
        '</div>' +
      '</form>';

    const form = ui.$('form', view);
    function q(sel) { return ui.$(sel, form); }
    const card = Club.cards.mount(q('.pa-cc'), { onChange: function () { updateReview(); } });
    const nm = ui.$('.cc-in-name', form); if (nm && !nm.value) { nm.value = m.firstName + ' ' + m.lastName; nm.dispatchEvent(new Event('input')); }
    function amountOpt() { const r = q('input[name=amountOpt]:checked'); return r ? r.value : 'other'; }
    function parseAmt(s) { s = String(s || '').replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN; return r2(+s); }
    function amount() { const o = amountOpt(); if (o === 'full') return bal; if (o === 'statement') return stOwed; if (o === 'plan') return planAmt; return parseAmt(q('[name=other]').value); }
    function updateReview() {
      const a = amount(); const ok = !isNaN(a) && a > 0;
      q('.pa-rv-after').textContent = fmt.money(r2(bal - (ok ? a : 0) + (ok && amountOpt() === 'plan' ? cardFee(a) : 0)));
      const fe = q('.pa-rv-fee'); fe.hidden = !(ok && amountOpt() === 'plan');
      if (!fe.hidden) fe.textContent = 'A 1.5% credit card processing fee of ' + fmt.money(cardFee(a)) + ' is added to your account as its own charge.';
      const d = (ui.$('.cc-in-num', form).value || '').replace(/\D/g, ''), b = Club.cards.detect(d).brand;
      const html = d.length >= 4 && b !== 'unknown' ? markChip(b, 14) + '<span>' + esc(cardLabel(b, d.slice(-4))) + '</span>' : 'Card';
      /* the final button lives in the sticky bar */
      Portal.actionBar.show({ summaryHTML: '<span class="pa-bar-amt">' + esc(fmt.money(ok ? a : 0)) + '</span><small class="pa-bar-card">' + html + '</small>', label: ok ? 'Pay ' + fmt.money(a) : 'Pay now', disabled: !ok, onClick: function () { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); } });
    }
    ui.on(form, 'change', 'input[name=amountOpt]', function () { const o = amountOpt() === 'other'; q('.pa-other').hidden = !o; if (o) q('[name=other]').focus(); updateReview(); });
    ui.on(form, 'input', '[name=other]', updateReview);
    updateReview();

    function validate() {
      clearErrs(form);
      let ok = true;
      const a = amount();
      if (amountOpt() === 'other') {
        const raw = q('[name=other]').value.trim();
        if (!raw) { setErr(form, 'other', 'Enter the amount you would like to pay.'); ok = false; }
        else if (isNaN(a)) { setErr(form, 'other', 'Enter an amount in dollars and cents, for example 250.00.'); ok = false; }
        else if (a <= 0) { setErr(form, 'other', 'Payments must be greater than zero.'); ok = false; }
        else if (a > MAX_PAYMENT) { setErr(form, 'other', 'For payments over ' + fmt.money(MAX_PAYMENT, false) + ', please call the Controller at ' + Club.info.phone + '.'); ok = false; }
      } else if (!(a > 0)) { ok = false; ui.toast('There is nothing due for that option', 'bad'); }
      let result = null;
      const r = card.validate();
      if (!r.ok) ok = false;
      else result = { brand: r.card.brand, last4: r.card.last4 };
      if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return null; }
      return result;
    }

    /* The balance can change while this page is open (a payment from another tab or device, a new charge). The full
       balance and statement amounts were read when the page opened, so check them again before taking money. */
    function balanceMoved() {
      const now = fresh(m.id); if (!now) return false;
      if (amountOpt() === 'other' || Math.abs(r2(now.balance || 0) - bal) < 0.005) return false;
      ui.toast('Your balance changed to ' + fmt.money(r2(now.balance || 0)) + ' since you opened this page. Please check the amount.', 'bad');
      renderPay(view, now, stId); ui.animateIn(view);
      return true;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (balanceMoved()) return;
      const c = validate(); if (!c) return;
      const a = amount();
      const label = cardLabel(c.brand, c.last4);
      ui.confirm({ title: 'Confirm your payment', text: 'Pay ' + fmt.money(a) + ' to ' + Club.info.short + ' with your ' + label + '?', confirmLabel: 'Pay ' + fmt.money(a) }).then(function (yes) {
        if (!yes) return;
        if (balanceMoved()) return;
        /* Wipe sensitive inputs before anything else happens */
        card.reset();
        const res = postPayment(m.id, a, c.brand, c.last4, amountOpt() === 'plan' && plan ? plan : null);
        if (!res) { ui.toast('We could not take that payment. Please call the club office.', 'bad'); return; }
        ui.toast('Thank you. Your payment of ' + fmt.money(a) + ' has been received');
        justPaid = res;
        Portal.go('account/receipt/' + (res.receipt ? res.receipt.id : res.payment.id));
      });
    });
  }

  /* Mirrors Club.billing.recordPayment (staff): insert into payments, reduce member.balance, mark statement paid. */
  function postPayment(memberId, amount, brand, last4, plan) {
    const mem = fresh(memberId); if (!mem) return null;
    const amt = r2(amount); if (!(amt > 0)) return null;
    const before = r2(mem.balance || 0);
    const date = today();
    const open = openStatements(memberId);
    const label = cardLabel(brand, last4);
    const p = S.insert('payments', Object.assign({ memberId: memberId, date: date, amount: amt, method: 'Card', brand: brand, last4: last4, reference: label + ', members portal' }, plan ? { toward: 'tp-' + plan.id } : {}));
    S.update('members', memberId, { balance: r2(before - amt) });
    const after = r2(before - amt);
    const settled = [];
    /* Oldest first. A statement is paid once the payments toward it (this one included) cover its total; paying the
       whole balance pays them all. A payment larger than one statement carries on to the next, as totals carry over. */
    open.slice().reverse().forEach(function (s) {
      if (after <= 0.005 || paidToward(s) >= r2(s.total || 0) - 0.005) { S.update('statements', s.id, { status: 'paid', paidOn: date }); settled.push(s); }
    });
    const receipt = Club.receipts ? Club.receipts.create({ memberId: memberId, paymentId: p.id, title: 'Account payment', date: date,
      lines: [{ name: 'Payment on account', qty: 1, price: amt }], total: amt, method: 'card', methodLabel: Club.receipts.cardLabel(brand, last4), source: 'portal',
      note: plan ? 'Toward your ' + plan.season + ' time payment plan.' : settled.length ? 'Pays your ' + settled.map(function (s) { return monthLabel(s.period); }).join(' and ') + (settled.length === 1 ? ' statement.' : ' statements.') : null }) : null;
    /* Time Payment Policy: credit card payments carry a 1.5% processing fee, as its own charge with its receipt. */
    if (plan) {
      const TPc = renewApi() && renewApi().TP ? renewApi().TP.CARD_FEE : 0.015, fee = r2(amt * TPc), FE = Club.fmtEn || Club.fmt;
      if (fee > 0) Club.chargeMember(memberId, { description: 'Credit card processing fee (1.5%) on a time payment of ' + FE.money(amt), category: 'Dues', amount: fee, source: 'billing', refId: 'tpcard-' + p.id, date: date,
        title: 'Credit card processing fee', lines: [{ name: 'Processing fee, 1.5% of a ' + FE.money(amt) + ' credit card payment toward the ' + plan.season + ' time payment plan', qty: 1, price: fee }] });
    }
    return { payment: p, receipt: receipt, before: before, after: after, settled: settled, label: label };
  }

  /* The confirmation after paying online: the payment's receipt (kept, so it is in Receipts later) and what it did to the
     balance. justPaid holds the before and after balances for the page shown straight after paying; on a later visit
     the page shows today's balance instead. Takes a receipt id, or a payment id from an older link. */
  let justPaid = null;
  function renderReceipt(view, m, id) {
    let rc = Club.receipts ? Club.receipts.get(id) : null;
    if (!rc && Club.receipts) {
      const pay = S.find('payments', id);
      if (pay && pay.memberId === m.id) rc = Club.receipts.forMember(m.id).find(function (r) { return r.paymentId === pay.id; }) ||
        Club.receipts.create({ memberId: m.id, paymentId: pay.id, title: 'Account payment', date: pay.date, lines: [{ name: 'Payment on account', qty: 1, price: +pay.amount || 0 }],
          total: +pay.amount || 0, method: pay.method === 'Card' ? 'card' : 'other', methodLabel: payMethod(pay), source: 'billing' });
    }
    if (!rc || rc.memberId !== m.id) {
      view.innerHTML = hero(m, 'Receipt', 'Receipts for everything you pay for or order.') + subnav('receipts') + '<section class="panel">' + ui.empty({ icon: 'billing', title: 'Receipt not found', text: 'This receipt is not available on your account. All of your receipts are listed under Receipts.', action: '<a class="btn" href="#/account/receipts">View receipts</a>' }) + '</section>';
      return;
    }
    const r = justPaid && rc.paymentId && justPaid.payment.id === rc.paymentId ? justPaid : null;
    const isPay = !!rc.paymentId;
    const after = r ? r.after : r2(m.balance || 0);
    view.innerHTML = (isPay ? hero(m, 'Payment received', 'Thank you, ' + m.firstName + '. Your account has been updated.') : hero(m, 'Receipt', rc.title)) + subnav(isPay && r ? 'pay' : 'receipts') +
      '<div class="pa-receipt-wrap">' +
        (isPay ? '<dl class="pa-receipt-kv pa-rc-bal" data-reveal>' +
          (r ? '<div><dt>Previous balance</dt><dd class="num">' + money(r.before) + '</dd></div>' : '') +
          '<div><dt>' + (r ? 'New balance' : 'Balance today') + '</dt><dd class="num"><strong>' + money(after) + '</strong>' + (after < -0.005 ? ' <span class="muted">in credit</span>' : '') + '</dd></div>' +
        '</dl>' : '') +
        '<div class="pa-printable pa-rc-print" data-reveal>' + Club.receipts.html(rc) + '</div>' +
        '<div class="pa-receipt-actions">' + ui.btn('Print or save as PDF', { kind: 'primary', icon: 'print', action: 'print' }) +
          '<a class="btn" href="#/account/receipts">' + Club.icon('billing') + '<span>All receipts</span></a>' +
          (isPay ? '<a class="btn" href="#/account"><span>Back to my account</span></a>' : '') + '</div>' +
      '</div>';
    ui.on(view, 'click', '[data-action=print]', function () { window.print(); });
  }

  /* ---------------- Register ---------------- */
  Portal.register({
    id: 'account', label: 'My account', short: 'Account', icon: 'billing', order: 60, tab: false,
    render: function (view, params, member) {
      const m = fresh(member.id) || member;
      const sub = params[0] || '';
      if (sub === 'activity') renderActivity(view, m);
      else if (sub === 'statements') renderStatements(view, m);
      else if (sub === 'statement') renderStatement(view, m, params[1]);
      else if (sub === 'receipts') renderReceipts(view, m);
      else if (sub === 'pay') renderPay(view, m, params[1]);
      else if (sub === 'receipt') renderReceipt(view, m, params[1]);
      else if (sub === 'renew') renderRenew(view, m);
      else if (sub === 'summary') renderSummary(view, m);
      else renderOverview(view, m);
    }
  });
})();
