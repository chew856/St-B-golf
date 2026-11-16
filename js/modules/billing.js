/* Billing & Statements: receivables, ledger, dues runs, F&B minimums, statements, member accounts.
   Owns collections: charges, payments, statements. Also exposes Club.billing helpers for other modules. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/billing-data.js */
  const { methodLabel, DUE_DAYS, r2, today, live, mkey, addMonths, monthName, monthEnd, sum, byDate, sweepOverdue, agingAll, agingFor, RENEW_SEASON, renewalFor } = Club.shared.billing;


  const CATS = ['Dues', 'Golf', 'Pro Shop', 'Dining', 'Events', 'Lessons', 'Other'];
  const METHODS = ['ACH', 'Card', 'Check'];
  function stLabel(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
  const ST_KIND = { draft: 'outline', sent: 'info', paid: 'good', overdue: 'bad' };
  /* ---------------- Undo ----------------
     Staff actions run through Club.accounting.undoRun (Club.undo plus the accounting clean-up): charges are reversed with
     a credit receipt, payments get a reversing payment (the balance goes back), statements return to how they were. */
  function undoRun(fn, o) { if (Club.accounting && Club.accounting.undoRun) return Club.accounting.undoRun(fn, o); const r = fn(); const m = typeof o.message === 'function' ? o.message(r) : o.message; if (m) ui.toast(m); return r; }
  /** Redraw after an undo, when Billing (or a member's page, which posts through Billing) is still on screen. */
  function rerenderAfterUndo() { const id = (location.hash.match(/^#\/([^/?]+)/) || [])[1]; if (id === 'billing' || id === 'members') Club.app.render(); if (Club.app.refreshNav) Club.app.refreshNav(); }
  /* A day closed in Accounting (and possibly exported to the books) takes no new entries: they would never reach the
     export. Post on today's date, or reopen the day first. */
  function dayClosed(d) { try { return !!(Club.accounting && Club.accounting.isClosed && Club.accounting.isClosed(d)); } catch (e) { return false; } }
  function closedMsg(d) { return fmt.date(d) + ' is closed in Accounting. Use today’s date, or reopen that day first.'; }
  function curMonth() { return today().slice(0, 7); }
  function monthLabel(key, short) { const p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, 1, 12).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' }); }
  function mname(id) { const m = S.find('members', id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function money(v) { return esc(fmt.money(v)); }
  function setErr(form, name, msg) { const f = form.querySelector('[name="' + name + '"]'); if (!f) return; f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }
  function memberOptions(sel, placeholder) { return '<option value="">' + esc(placeholder || 'Select a member') + '</option>' + Club.members.options(sel); }
  /* Animated money counters that always end on Club.fmt.money formatting */
  function moneyCount(v, cents) { return '<span class="bil-money" data-money="' + r2(v) + '"' + (cents ? ' data-cents="1"' : '') + '>' + esc(fmt.money(0, cents ? undefined : false)) + '</span>'; }
  function runMoney(root) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ui.$$('.bil-money:not([data-done])', root).forEach(function (n) {
      n.setAttribute('data-done', ''); const target = +n.dataset.money; const c = n.dataset.cents ? undefined : false;
      if (reduce) { n.textContent = fmt.money(target, c); return; }
      const t0 = performance.now();
      (function tick(t) { const p = Math.min(1, (t - t0) / 1100); const e = 1 - Math.pow(1 - p, 4); n.textContent = fmt.money(p < 1 ? target * e : target, c); if (p < 1) requestAnimationFrame(tick); })(t0);
    });
  }
  function statStrip(items, cls) {
    return '<div class="stats' + (cls ? ' ' + cls : '') + '">' + items.map(function (s) {
      return '<div class="stat" data-reveal><span class="label-caps">' + esc(s.label) + '</span><div class="stat-value">' + s.html + '</div>' + (s.meta ? '<div class="stat-meta"><span>' + s.meta + '</span></div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /* Prev / next pager for long tables: "51–100 of 1,234" */
  function pager(total, page, size, act) {
    if (total <= size) return '';
    const pages = Math.ceil(total / size), a = page * size + 1, b = Math.min(total, (page + 1) * size);
    return '<nav class="bil-pager" aria-label="Pages"><span class="muted">' + fmt.num(a) + '–' + fmt.num(b) + ' of ' + fmt.num(total) + '</span><div class="bil-pager-btns">' +
      '<button type="button" class="btn btn-sm" data-action="' + act + '" data-page="' + (page - 1) + '"' + (page <= 0 ? ' disabled' : '') + '>' + Club.icon('chevronLeft') + '<span>Previous</span></button>' +
      '<span class="bil-pager-at">Page ' + (page + 1) + ' of ' + pages + '</span>' +
      '<button type="button" class="btn btn-sm" data-action="' + act + '" data-page="' + (page + 1) + '"' + (page >= pages - 1 ? ' disabled' : '') + '><span>Next</span>' + Club.icon('chevronRight') + '</button></div></nav>';
  }
  function go(path) { Club.app.go(path); }
  function rerender() { Club.app.render(); }

  /* ---------------- Modals (also used by Members) ---------------- */
  function openPostCharge(memberId, done, preset) {
    preset = preset || {};
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Member', name: 'memberId', type: 'select', required: true, span2: true, options: memberOptions(memberId) }) +
      ui.field({ label: 'Category', name: 'category', type: 'select', options: ui.options(CATS, preset.category || 'Other') }) +
      ui.field({ label: 'Item', name: 'chargeItem', type: 'select', options: '<option value="other">Other</option>', hint: 'Fills in the description and amount. Both stay editable.' }) +
      ui.field({ label: 'Description', name: 'description', required: true, span2: true, value: preset.description, placeholder: 'Guest green fee, J. Carter' }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), required: true }) +
      ui.field({ label: 'Amount', name: 'amount', type: 'number', step: 0.01, required: true, value: preset.amount, hint: 'Enter a negative amount to post a credit or adjustment' }) +
      ui.field({ label: 'Reference', name: 'refId', placeholder: 'Optional chit or ticket number' }) +
      '<div class="span-2 bil-balance-hint muted"></div></form>';
    const api = ui.modal({
      title: 'Post charge', eyebrow: 'House account', body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Post charge', kind: 'primary', icon: 'check', onClick: function (a) {
          const form = ui.$('form', a.el); clearErrs(form);
          let ok = ui.validate(form); const v = ui.formData(form);
          if (v.amount != null && (isNaN(v.amount) || v.amount === 0)) { setErr(form, 'amount', 'Enter an amount other than zero.'); ok = false; }
          else if (v.amount != null && Math.abs(v.amount) > 100000) { setErr(form, 'amount', 'Amounts over $100,000 must be posted by the controller.'); ok = false; }
          if (v.date && dayClosed(v.date)) { setErr(form, 'date', closedMsg(v.date)); ok = false; }
          if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
          const ch = undoRun(function () {
            return Club.chargeMember(v.memberId, { description: v.description, category: v.category, amount: v.amount, date: v.date, source: 'manual', refId: v.refId || null, title: v.amount < 0 ? 'Account credit' : 'Account charge' });
          }, { message: function (c) { return c ? (c.amount < 0 ? 'Credit of ' + fmt.money(-c.amount) + ' applied to ' + mname(v.memberId) : fmt.money(c.amount) + ' posted to ' + mname(v.memberId)) : null; },
            undone: function () { return v.amount < 0 ? 'Credit taken back with a matching charge' : 'Charge reversed with a matching credit'; }, after: rerenderAfterUndo });
          if (!ch) { ui.toast('That member could not be found', 'bad'); return false; }
          if (done) done(ch);
        }
      }]
    });
    wireBalanceHint(api.el);
    wireChargeItems(api.el);
    return api;
  }

  /* ---------------- Post charge: what the member is paying for ----------------
     The Item list is built only from prices already in the app, read when the dialog opens (and again when the member or
     category changes): Golf from the published green fees (Club.teeRules), the tee sheet's guest and cart fees and the
     booking add-ons; Lessons from the rate card and academy programs; Pro Shop from the product catalogue; Dining from
     the Gallery menu; Dues from the chosen member's category; Events from upcoming events with a fee. "Other" is always
     there and keeps the free text as before. Each item: { group, label, desc, amount }. */
  function chargeItems(cat, memberId) {
    const out = [];
    const add = function (group, label, desc, amount) { amount = r2(amount); if (label && isFinite(amount) && amount > 0) out.push({ group: group, label: label, desc: desc || label, amount: amount }); };
    try {
      if (cat === 'Golf') {
        const TR = Club.teeRules, RT = TR && TR.RATES;
        const st = Object.assign({}, S.getObj('teeSheetSettings', {}) || {});
        const nine = function (v) { return Math.round(v * 0.6); };   /* nine holes are 60% of the full fee (Club.teeRules.greenFee) */
        if (RT) {
          [['weekday', 'weekday'], ['weekend', 'weekend and holiday'], ['twilight', 'twilight']].forEach(function (b) {
            if (!(+RT[b[0]] > 0)) return;
            add('Guest green fees', 'Guest green fee, ' + b[1] + ', 18 holes', 'Guest green fee, ' + b[1] + ', 18 holes', RT[b[0]]);
            add('Guest green fees', 'Guest green fee, ' + b[1] + ', 9 holes', 'Guest green fee, ' + b[1] + ', 9 holes', nine(+RT[b[0]]));
          });
        }
        if (+st.guestFee > 0) add('Guest green fees', 'Guest fee at member-only times', 'Guest green fee, member-only time', st.guestFee);
        if (+st.cartFee > 0) add('Cart', 'Cart fee, per rider', 'Cart fee', st.cartFee);
        if (Club.addons) Club.addons.active().forEach(function (a) {
          const p18 = Club.addons.price(a, 18), p9 = Club.addons.price(a, 9);
          if (p9 !== p18) { add('Add-ons', a.name + ', 18 holes', a.name + ', 18 holes', p18); add('Add-ons', a.name + ', 9 holes', a.name + ', 9 holes', p9); }
          else add('Add-ons', a.name, a.name, p18);
        });
      } else if (cat === 'Lessons') {
        const L = Club.shared && Club.shared.lessons;
        if (L) {
          const rt = L.rates().rates;
          Object.keys(rt).forEach(function (t) { const dur = (L.TYPE_DUR && L.TYPE_DUR[t]) || 60; add('Rate card', t + ' (' + dur + ' min)', t + ', ' + dur + ' minutes', L.priceFor(t, null, dur)); });
          const td = today();
          S.all('programs').forEach(function (pg) {
            const ss = L.programSessions(pg); if (!ss.length || ss[ss.length - 1] < td) return;
            add('Academy programs', pg.name, pg.name + ', ' + (+pg.weeks || ss.length) + ' weeks', pg.price);
          });
        }
      } else if (cat === 'Pro Shop') {
        S.all('products').slice().sort(function (a, b) { return String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)); })
          .forEach(function (pr) { add(pr.category || 'Products', pr.name, pr.name, pr.price); });
      } else if (cat === 'Dining') {
        S.all('menuItems').filter(function (mi) { return mi.available !== false; })
          .forEach(function (mi) { add(mi.section || 'Menu', mi.name, mi.name, mi.price); });
      } else if (cat === 'Dues') {
        const m = memberId ? S.find('members', memberId) : null, t = m ? S.find('membershipTiers', m.tierId) : null;
        if (t && +t.annualDues > 0) {
          add(t.name + ' membership', 'Monthly dues instalment', monthName(curMonth()) + ' dues instalment, ' + t.name + ' membership', t.annualDues / 12);
          add(t.name + ' membership', 'Annual dues', 'Annual dues, ' + t.name + ' membership', t.annualDues);
        }
      } else if (cat === 'Events') {
        const td = today();
        S.all('events').filter(function (e) { return e.date >= td && e.status !== 'cancelled' && e.status !== 'draft' && +e.price > 0; })
          .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
          .forEach(function (e) { add('Upcoming events', e.title + ', ' + fmt.dateShort(e.date), e.title + ', ' + fmt.dateShort(e.date), e.price); });
      }
    } catch (e) { console.error('Charge items for ' + cat + ' could not be listed', e); }
    return out;
  }
  function wireChargeItems(root) {
    const form = ui.$('form', root);
    const cat = ui.$('select[name=category]', form), item = ui.$('select[name=chargeItem]', form), mem = ui.$('select[name=memberId]', form);
    const desc = ui.$('[name=description]', form), amt = ui.$('[name=amount]', form);
    let list = [], filled = null;   /* filled: what the last chosen item wrote, so Other can clear it if staff did not edit it */
    function build() {
      list = chargeItems(cat.value, mem.value);
      let html = '<option value="other">Other</option>', group = null;
      list.forEach(function (x, i) {
        if (x.group !== group) { if (group !== null) html += '</optgroup>'; html += '<optgroup label="' + esc(x.group) + '">'; group = x.group; }
        html += '<option value="i' + i + '">' + esc(x.label + ' · ' + fmt.money(x.amount)) + '</option>';
      });
      if (group !== null) html += '</optgroup>';
      item.innerHTML = html;
      item.value = 'other';
      const h = item.closest('.field') && item.closest('.field').querySelector('.field-hint');
      if (h) h.textContent = list.length ? 'Fills in the description and amount. Both stay editable.' : 'No price list for this category. Type the description and amount.';
    }
    function clearFilled() {
      if (filled && desc.value === filled.desc && String(amt.value) === String(filled.amount)) { desc.value = ''; amt.value = ''; }
      filled = null;
    }
    item.addEventListener('change', function () {
      const x = /^i\d+$/.test(item.value) ? list[+item.value.slice(1)] : null;
      if (!x) { clearFilled(); return; }
      desc.value = x.desc; amt.value = x.amount.toFixed(2);
      filled = { desc: desc.value, amount: amt.value };
      [desc, amt].forEach(function (n) { n.classList.remove('invalid'); const er = n.parentNode.querySelector('.field-error'); if (er) er.remove(); n.dispatchEvent(new Event('input', { bubbles: true })); });
    });
    cat.addEventListener('change', function () { clearFilled(); build(); });
    mem.addEventListener('change', function () { if (cat.value === 'Dues') { clearFilled(); build(); } });
    build();
  }
  function wireBalanceHint(root) {
    const sel = ui.$('select[name=memberId]', root), hint = ui.$('.bil-balance-hint', root);
    function upd() { const m = S.find('members', sel.value); hint.innerHTML = m ? 'Current balance for ' + esc(mname(m.id)) + ': <strong class="ink-2">' + money(m.balance || 0) + '</strong>' : ''; }
    sel.addEventListener('change', upd); upd();
  }
  function openRecordPayment(memberId, done, o) {
    o = o || {};
    const m = S.find('members', memberId);
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Member', name: 'memberId', type: 'select', required: true, span2: true, options: memberOptions(memberId) }) +
      ui.field({ label: 'Amount', name: 'amount', type: 'number', step: 0.01, min: 0.01, required: true, value: o.amount != null ? r2(o.amount) : (m && m.balance > 0 ? r2(m.balance) : '') }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), required: true }) +
      ui.field({ label: 'Method', name: 'method', type: 'select', options: ui.options(METHODS.map(function (x) { return { value: x, label: methodLabel(x) }; }), 'ACH') }) +
      ui.field({ label: 'Reference', name: 'reference', placeholder: 'Cheque number or confirmation' }) +
      '<div class="span-2 bil-balance-hint muted"></div></form>';
    const api = ui.modal({
      title: 'Record payment', eyebrow: o.statement ? 'Statement for ' + monthLabel(o.statement.period) : 'House account', body: body,
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Record payment', kind: 'primary', icon: 'check', onClick: function (a) {
          const form = ui.$('form', a.el); clearErrs(form);
          let ok = ui.validate(form); const v = ui.formData(form);
          if (v.amount != null && (isNaN(v.amount) || v.amount <= 0)) { setErr(form, 'amount', 'Payments must be greater than zero. Post a negative charge for a refund.'); ok = false; }
          if (v.date && v.date > today()) { setErr(form, 'date', 'Payments cannot be dated in the future.'); ok = false; }
          else if (v.date && dayClosed(v.date)) { setErr(form, 'date', closedMsg(v.date)); ok = false; }
          const mem = S.find('members', v.memberId);
          if (v.memberId && !mem) { setErr(form, 'memberId', 'Select a member.'); ok = false; }
          if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
          const amt = r2(v.amount);
          const forSt = o.statement && v.memberId === o.statement.memberId;
          let stPaid = false;
          const p = undoRun(function () {
            const p0 = S.insert('payments', { memberId: v.memberId, date: v.date, amount: amt, method: v.method, reference: v.reference || '' });
            S.update('members', v.memberId, { balance: r2((mem.balance || 0) - amt) });
            /* A statement is paid when this payment covers what is still owed on it, or earlier part payments and this one
               together cover its total; a part payment leaves it open. */
            if (forSt && (amt >= r2(o.amount || 0) - 0.005 || paidToward(o.statement) >= r2(o.statement.total || 0) - 0.005)) { stPaid = true; S.update('statements', o.statement.id, { status: 'paid', paidOn: v.date }); }
            paymentReceipt(p0);
            return p0;
          }, { message: function () { return 'Payment of ' + fmt.money(amt) + ' recorded for ' + mname(v.memberId) + (forSt ? (stPaid ? '. Statement marked paid' : '. Part payment: the statement stays open') : ''); },
            undone: function () { return 'Payment reversed. ' + fmt.money(amt) + ' is back on the balance' + (stPaid ? ' and the statement is open again' : ''); }, after: rerenderAfterUndo });
          if (done) done(p);
        }
      }]
    });
    wireBalanceHint(api.el);
    return api;
  }

  /** The receipt for a payment staff recorded (Club.receipts; card numbers are not taken here, so the method reads 'Card'). */
  const RECEIPT_METHOD = { Card: 'card', Cash: 'cash' };
  function paymentReceipt(p) {
    if (!Club.receipts) return null;
    try {
      return Club.receipts.create({ memberId: p.memberId, title: 'Account payment', lines: [{ name: 'Payment on account', qty: 1, price: p.amount }], total: p.amount,
        date: p.date, method: RECEIPT_METHOD[p.method] || 'other', methodLabel: methodLabel(p.method) || 'Other', source: 'billing', refId: p.id, paymentId: p.id,
        note: p.reference ? 'Reference ' + p.reference : null,
        /* Recorded by staff at the office: the daily close (js/modules/accounting.js) counts card in the terminal batch. */
        tenders: [{ method: RECEIPT_METHOD[p.method] || 'other', amount: p.amount }], channel: 'counter' });
    } catch (e) { console.error('Receipt failed for payment ' + p.id, e); return null; }
  }
  /* The staff dialogs; the shared helpers above come from js/shared/billing-data.js */
  Object.assign(Club.billing, { postCharge: openPostCharge, recordPayment: openRecordPayment });

  /* ---------------- Main page with tabs ---------------- */
  const TABS = ['overview', 'ledger', 'dues', 'minimums', 'statements', 'renewals'];
  const LEDGER_PAGE = 25, ST_PAGE = 20, ACCT_PAGE = 20;
  const lf = { member: '', category: '', source: '', type: 'all', from: '', to: '', q: '', page: 0 };
  const sf = { period: '', status: '', page: 0 };
  let fbShowAll = false;

  function renderMain(view, tab) {
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Membership', title: 'Billing & Statements',
      subtitle: 'House accounts, dues and monthly statements for ' + S.all('members').filter(function (m) { return m.status !== 'resigned'; }).length + ' members.',
      actions: ui.btn('Record payment', { icon: 'cash', action: 'pay' }) + ui.btn('Post charge', { kind: 'primary', icon: 'plus', action: 'charge' })
    }) + '<div class="bil-tabs"></div>';
    ui.tabs(ui.$('.bil-tabs', view), [
      { id: 'overview', label: 'Overview', render: tabOverview },
      { id: 'ledger', label: 'Ledger', render: tabLedger },
      { id: 'dues', label: 'Dues run', render: tabDues },
      { id: 'minimums', label: 'F&B minimums', render: tabMinimums },
      { id: 'statements', label: 'Statements', render: tabStatements },
      { id: 'renewals', label: RENEW_SEASON + ' renewals', render: tabRenewals }
    ], tab, function (id) { if (history.replaceState) history.replaceState(null, '', '#/billing' + (id === 'overview' ? '' : '/' + id)); });
    runMoney(view);
    ui.on(view, 'click', '[data-action=charge]', function () { openPostCharge('', rerender); });
    ui.on(view, 'click', '[data-action=pay]', function () { openRecordPayment('', rerender); });
    ui.on(view, 'click', 'tr[data-href]', function (e, tr) { if (!e.target.closest('button, a')) go(tr.dataset.href); });
  }

  function tabOverview(p) {
    const ag = agingAll(); const ids = Object.keys(ag);
    const tot = { current: 0, d30: 0, d60: 0, d90: 0 };
    ids.forEach(function (id) { ['current', 'd30', 'd60', 'd90'].forEach(function (k) { tot[k] += ag[id][k]; }); });
    const ar = r2(tot.current + tot.d30 + tot.d60 + tot.d90);
    const pastDue = r2(tot.d30 + tot.d60 + tot.d90);
    const pastIds = ids.filter(function (id) { return ag[id].pastDue > 0.005; }).sort(function (a, b) { return ag[b].pastDue - ag[a].pastDue; });
    const owing = ids.filter(function (id) { return ag[id].total > 0.005; }).length;
    const cm = curMonth();
    const monthCharges = S.all('charges').filter(function (c) { return mkey(c.date) === cm && c.date <= today() && c.amount > 0; });
    const billed = r2(sum(monthCharges, function (c) { return c.amount; }));
    const pays = S.all('payments').filter(function (x) { return mkey(x.date) === cm; }).sort(byDate).reverse();
    const collected = r2(sum(pays, function (x) { return x.amount; }));
    const byCat = CATS.map(function (c, i) { return { label: c, value: r2(sum(monthCharges.filter(function (x) { return (x.category || 'Other') === c; }), function (x) { return x.amount; })), color: Club.charts.colors[i % 6] }; }).filter(function (x) { return x.value > 0; });
    const buckets = [['Current', tot.current, '0 to 30 days'], ['31-60 days', tot.d30, 'First reminder'], ['61-90 days', tot.d60, 'Second reminder'], ['90+ days', tot.d90, 'Call from the club office']];
    const pastRow = function (id) {
      const a = ag[id]; const m = S.find('members', id);
      return '<tr class="clickable" data-href="billing/' + esc(id) + '"><td>' + ui.person(mname(id), m ? 'No. ' + esc(m.memberNo) + (m.status !== 'active' ? ' · ' + esc(m.status) : '') : '', 'sm') + '</td><td class="num">' + (a.d30 ? money(a.d30) : '<span class="muted">0</span>') + '</td><td class="num">' + (a.d60 ? money(a.d60) : '<span class="muted">0</span>') + '</td><td class="num' + (a.d90 ? ' bil-bad' : '') + '">' + (a.d90 ? money(a.d90) : '<span class="muted">0</span>') + '</td><td class="num primary-cell">' + money(a.total) + '</td></tr>';
    };
    const byMethod = METHODS.map(function (mth) { return { label: methodLabel(mth), value: r2(sum(pays.filter(function (x) { return x.method === mth; }), function (x) { return x.amount; })) }; });

    p.innerHTML = statStrip([
      { label: 'Accounts receivable', html: moneyCount(ar), meta: owing + ' accounts carry a balance' },
      { label: 'Billed in ' + monthName(cm), html: moneyCount(billed), meta: monthCharges.length + ' charges to date' },
      { label: 'Collected in ' + monthName(cm), html: moneyCount(collected), meta: pays.length + ' payments received' },
      { label: 'Past due', html: moneyCount(pastDue), meta: '<span class="' + (pastIds.length ? 'bil-bad' : '') + '">' + pastIds.length + ' accounts over 30 days</span>' }
    ]) +
      '<div class="grid grid-main-side bil-gap bil-ov"><div class="stack">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Receivables</div><h3>Aging</h3></div><span class="muted">As of ' + esc(fmt.date(today())) + '</span></div><div class="panel-body">' +
      '<div class="bil-aging">' + buckets.map(function (b, i) {
        return '<div class="bil-age' + (i >= 2 && b[1] > 0 ? ' warn' : '') + '"><span class="bil-age-label">' + esc(b[0]) + '</span><span class="bil-age-val">' + esc(fmt.money(b[1], false)) + '</span><span class="bil-age-sub">' + esc(b[2]) + '</span><div class="bar' + (i ? ' brass' : '') + '"><span style="width:' + (ar ? Math.max(1, b[1] / ar * 100) : 0) + '%"></span></div></div>';
      }).join('') + '</div>' +
      (ar > 0 ? '' : ui.empty({ icon: 'check', title: 'Nothing outstanding', text: 'Every account is settled.' })) +
      '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Follow up</div><h3>Past due accounts</h3></div><span class="muted">' + pastIds.length + ' accounts</span></div><div class="panel-body flush">' +
      (pastIds.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th class="num">31-60</th><th class="num">61-90</th><th class="num">90+</th><th class="num">Balance</th></tr></thead><tbody>' + pastIds.slice(0, 5).map(pastRow).join('') + '</tbody>' +
        (pastIds.length > 5 ? '<tbody class="bil-rest" hidden>' + pastIds.slice(5).map(pastRow).join('') + '</tbody>' : '') + '</table></div>' +
        (pastIds.length > 5 ? '<div class="bil-viewall"><button type="button" class="s-link" data-action="past-all" data-n="' + pastIds.length + '">View all (' + pastIds.length + ')</button></div>' : '') : ui.empty({ icon: 'check', title: 'No past due accounts', text: 'Every member is within terms.' })) + '</div></section>' +
      '</div><aside class="stack">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(monthLabel(cm)) + '</div><h3>Revenue by category</h3></div></div><div class="panel-body">' +
      (byCat.length ? Club.charts.donut({ items: byCat, size: 200, money: true, center: { value: fmt.money0(billed), label: 'Month to date' } }) : ui.empty({ icon: 'reports', title: 'No charges this month', text: 'Revenue appears as charges are posted.' })) +
      '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + esc(monthLabel(cm)) + '</div><h3>Collections</h3></div></div><div class="panel-body">' +
      (pays.length ? Club.charts.hbars(byMethod.map(function (x, i) { return { label: x.label, value: x.value, brass: i === 1 }; }), { money: true }) + '<div class="divider"></div><ul class="list bil-paylist">' + pays.slice(0, 4).map(function (x) {
        return '<li class="row between"><a class="bil-stack" href="#/billing/' + esc(x.memberId) + '"><span class="person-name">' + esc(mname(x.memberId)) + '</span><span class="person-sub">' + esc(fmt.dateShort(x.date)) + ' · ' + esc(methodLabel(x.method)) + '</span></a><span class="num">' + money(x.amount) + '</span></li>';
      }).join('') + '</ul>' + (pays.length > 4 ? '<a class="s-link" href="#/billing/ledger" data-action="pays-all">All ' + pays.length + ' payments this month</a>' : '') : ui.empty({ icon: 'cash', title: 'No payments yet this month', text: 'Record a payment to see collections here.' })) + '</div></section>' + '</aside></div>';
    runMoney(p);
    ui.on(p, 'click', '[data-action=past-all]', function (e, b) {
      const rest = ui.$('.bil-rest', b.closest('.panel')); if (!rest) return;
      rest.hidden = !rest.hidden; b.textContent = rest.hidden ? 'View all (' + b.dataset.n + ')' : 'Show fewer';
    });
    ui.on(p, 'click', '[data-action=pays-all]', function () { Object.assign(lf, { member: '', category: '', source: '', type: 'payment', from: curMonth() + '-01', to: '', q: '', page: 0 }); });
  }

  /* ---------------- Ledger ---------------- */
  function ledgerRows() {
    const rows = [];
    S.all('charges').forEach(function (c) { rows.push({ kind: 'charge', id: c.id, date: c.date, memberId: c.memberId, description: c.description || '', category: c.category || 'Other', source: c.source || 'manual', amount: +c.amount || 0, createdAt: c.createdAt }); });
    S.all('payments').forEach(function (x) { rows.push({ kind: 'payment', id: x.id, date: x.date, memberId: x.memberId, description: 'Payment received' + (x.reference ? ', ' + x.reference : ''), category: 'Payment', source: methodLabel(x.method) || 'payment', amount: +x.amount || 0, createdAt: x.createdAt }); });
    return rows;
  }
  function tabLedger(p) {
    const all = ledgerRows();
    const sources = Array.from(new Set(S.all('charges').map(function (c) { return c.source || 'manual'; }))).sort();
    p.innerHTML = '<section class="panel" data-reveal><div class="bil-filters">' +
      '<label class="bil-search">' + Club.icon('search') + '<input class="input" type="search" name="q" placeholder="Search descriptions" aria-label="Search descriptions" value="' + esc(lf.q) + '"></label>' +
      '<select class="select" name="member" aria-label="Member">' + memberOptions(lf.member, 'All members') + '</select>' +
      '<select class="select" name="type" aria-label="Type">' + ui.options([{ value: 'all', label: 'Charges and payments' }, { value: 'charge', label: 'Charges only' }, { value: 'payment', label: 'Payments only' }], lf.type) + '</select>' +
      '<select class="select" name="category" aria-label="Category"><option value="">All categories</option>' + ui.options(CATS, lf.category) + '</select>' +
      '<select class="select" name="source" aria-label="Source"><option value="">All sources</option>' + ui.options(sources, lf.source) + '</select>' +
      '<label class="bil-date"><span>From</span><input class="input" type="date" name="from" value="' + esc(lf.from) + '"></label>' +
      '<label class="bil-date"><span>To</span><input class="input" type="date" name="to" value="' + esc(lf.to) + '"></label>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="lreset">Reset</button></div><div class="bil-ledger"></div></section>';
    const host = ui.$('.bil-ledger', p);
    function draw() {
      const q = lf.q.toLowerCase();
      const rows = all.filter(function (r) {
        if (lf.member && r.memberId !== lf.member) return false;
        if (lf.type !== 'all' && r.kind !== lf.type) return false;
        if (lf.category && (r.kind !== 'charge' || r.category !== lf.category)) return false;
        if (lf.source && (r.kind !== 'charge' || r.source !== lf.source)) return false;
        if (lf.from && r.date < lf.from) return false;
        if (lf.to && r.date > lf.to) return false;
        if (q && (r.description + ' ' + mname(r.memberId)).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(byDate);
      let run = 0; rows.forEach(function (r) { run += r.kind === 'charge' ? r.amount : -r.amount; r.run = r2(run); });
      const ch = r2(sum(rows.filter(function (r) { return r.kind === 'charge'; }), function (r) { return r.amount; }));
      const py = r2(sum(rows.filter(function (r) { return r.kind === 'payment'; }), function (r) { return r.amount; }));
      if (!rows.length) { host.innerHTML = ui.empty({ icon: 'filter', title: 'No entries match', text: 'Widen the date range or clear a filter.', action: ui.btn('Reset filters', { action: 'lreset' }) }); return; }
      const pages = Math.max(1, Math.ceil(rows.length / LEDGER_PAGE)); if (lf.page >= pages) lf.page = pages - 1; if (lf.page < 0) lf.page = 0;
      const shown = rows.slice().reverse().slice(lf.page * LEDGER_PAGE, (lf.page + 1) * LEDGER_PAGE);
      host.innerHTML = '<div class="bil-ledger-sum"><span><span class="bil-sum-label">Entries</span><strong>' + fmt.num(rows.length) + '</strong></span><span><span class="bil-sum-label">Charges</span><strong>' + money(ch) + '</strong></span><span><span class="bil-sum-label">Payments</span><strong>' + money(py) + '</strong></span><span><span class="bil-sum-label">Net</span><strong>' + money(ch - py) + '</strong></span></div>' +
        '<div class="table-wrap" tabindex="0" role="region" aria-label="Ledger entries"><table class="table bil-ledger-table"><thead><tr><th>Date</th><th>Member</th><th>Description</th><th>Category</th><th class="num">Charge</th><th class="num">Payment</th><th class="num">Running net</th></tr></thead><tbody>' +
        shown.map(function (r) {
          return '<tr class="clickable" data-href="billing/' + esc(r.memberId) + '"><td class="nowrap" title="' + esc(fmt.date(r.date)) + '">' + esc(fmt.dateShort(r.date)) + '</td><td class="nowrap">' + esc(mname(r.memberId)) + '</td><td>' + esc(r.description) + '</td><td class="bil-cat-cell">' + (r.kind === 'payment' ? ui.badge('Payment', 'good') : '<span class="ink-2 nowrap">' + esc(r.category) + '</span>') + '<span class="bil-src">' + esc(r.source) + '</span></td>' +
            '<td class="num' + (r.kind === 'charge' && r.amount < 0 ? ' bil-credit' : '') + '">' + (r.kind === 'charge' ? money(r.amount) : '') + '</td><td class="num">' + (r.kind === 'payment' ? money(r.amount) : '') + '</td><td class="num ink-2">' + money(r.run) + '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="4">Totals for ' + fmt.num(rows.length) + ' entries</td><td class="num">' + money(ch) + '</td><td class="num">' + money(py) + '</td><td class="num">' + money(ch - py) + '</td></tr></tfoot></table></div>' +
        pager(rows.length, lf.page, LEDGER_PAGE, 'lpage');
    }
    draw();
    ui.on(p, 'input', '.bil-filters input[name=q]', function (e, f) { lf.q = f.value; lf.page = 0; draw(); });
    ui.on(p, 'change', '.bil-filters select, .bil-filters input[type=date]', function (e, f) { lf[f.name] = f.value; lf.page = 0; draw(); });
    ui.on(p, 'click', '[data-action=lpage]', function (e, b) {
      const fwd = +b.dataset.page > lf.page; lf.page = +b.dataset.page; draw();
      const top = ui.$('.bil-filters', p); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
      const nb = ui.$('[data-action=lpage][data-page="' + (lf.page + (fwd ? 1 : -1)) + '"]', p) || ui.$('[data-action=lpage]:not([disabled])', p); if (nb) nb.focus({ preventScroll: true });
    });
    ui.on(p, 'click', '[data-action=lreset]', function () { Object.assign(lf, { member: '', category: '', source: '', type: 'all', from: '', to: '', q: '', page: 0 }); tabLedger(p); });
  }

  /* ---------------- Dues run ---------------- */
  function duesPosted(key) {
    const runs = S.getObj('billingDuesRuns', {});
    if (runs[key]) return runs[key];
    const ex = S.all('charges').filter(function (c) { return c.refId === 'dues-' + key && live(c); });
    return ex.length ? { postedOn: ex[0].date, count: ex.length, total: r2(sum(ex, function (c) { return c.amount; })) } : null;
  }
  /* Tabs that redraw themselves get a fresh panel each time, so the click handlers of the earlier drawing (which
     hold that drawing's month and list) go away with it instead of piling up and firing on stale data. */
  const panels = {};
  function fresh(p) {
    if (!p.dataset.drawn) { p.dataset.drawn = '1'; return p; }
    const n = p.cloneNode(false); if (p.parentNode) p.replaceWith(n); return n;
  }
  let duesKey = null;
  function tabDues(p) {
    p = fresh(p); panels.dues = p;
    const cm = curMonth(); const choices = [cm, addMonths(cm, 1), addMonths(cm, 2)];
    if (!duesKey || choices.indexOf(duesKey) < 0) duesKey = choices.find(function (k) { return !duesPosted(k); }) || choices[0];
    const posted = duesPosted(duesKey);
    const already = {}; S.all('charges').forEach(function (c) { if (c.refId === 'dues-' + duesKey && live(c)) already[c.memberId] = true; });
    const list = S.all('members').filter(function (m) { return m.status === 'active' && S.find('membershipTiers', m.tierId) && !already[m.id]; })
      .map(function (m) { const t = S.find('membershipTiers', m.tierId); return { m: m, t: t, amount: r2(t.annualDues / 12) }; })
      .sort(function (a, b) { return a.m.lastName.localeCompare(b.m.lastName); });
    const total = r2(sum(list, function (x) { return x.amount; }));
    const byTier = S.all('membershipTiers').map(function (t) { const of = list.filter(function (x) { return x.t.id === t.id; }); return { t: t, n: of.length, total: r2(sum(of, function (x) { return x.amount; })) }; }).filter(function (x) { return x.n; });
    const runs = S.getObj('billingDuesRuns', {});
    const hist = Object.keys(runs).sort().reverse();

    p.innerHTML = '<div class="grid grid-main-side">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Monthly dues</div><h3>' + esc(monthLabel(duesKey)) + '</h3></div>' +
      '<select class="select bil-inline-select" name="duesKey" aria-label="Billing month">' + ui.options(choices.map(function (k) { return { value: k, label: monthLabel(k) + (duesPosted(k) ? ', posted' : '') }; }), duesKey) + '</select></div>' +
      (posted && !list.length ? '<div class="panel-body">' + ui.empty({ icon: 'check', title: monthName(duesKey) + ' dues are posted', text: 'Posted ' + fmt.date(posted.postedOn) + ' for ' + posted.count + ' members, ' + fmt.money(posted.total) + ' in total. A run can only be posted once per month.' }) + '</div>'
        : !list.length ? '<div class="panel-body">' + ui.empty({ icon: 'members', title: 'No active members to bill', text: 'Dues are charged to active members with a membership tier.' }) + '</div>'
          : '<div class="bil-preview-head"><p class="ink-2">' + (posted ? 'Part of this run is already posted. ' : '') + 'Preview: one twelfth of annual dues for <strong>' + list.length + '</strong> active members, dated ' + esc(fmt.date(duesKey + '-01')) + '.</p>' +
          '<div class="row wrap"><span class="bil-total">' + money(total) + '</span>' + ui.btn('Post ' + monthName(duesKey) + ' dues', { kind: 'primary', icon: 'check', action: 'post-dues' }) + '</div></div>' +
          '<div class="bil-dues-acc">' + Portal.accordion({ id: 'bil-dues-list', icon: 'members', title: 'Charges in this run', summary: list.length + ' members · ' + byTier.map(function (x) { return x.t.name + ' ' + x.n; }).join(', '), body: '<div class="table-wrap bil-scroll"><table class="table"><thead><tr><th>Member</th><th>No.</th><th>Tier</th><th class="num">Annual dues</th><th class="num">This month</th></tr></thead><tbody>' + list.map(function (x) {
            return '<tr><td class="primary-cell">' + esc(x.m.lastName + ', ' + x.m.firstName) + '</td><td class="num">' + esc(x.m.memberNo) + '</td><td>' + esc(x.t.name) + '</td><td class="num muted">' + esc(fmt.money(x.t.annualDues, false)) + '</td><td class="num">' + money(x.amount) + '</td></tr>';
          }).join('') + '</tbody><tfoot><tr><td colspan="4">' + list.length + ' members</td><td class="num">' + money(total) + '</td></tr></tfoot></table></div>' }) + '</div>') +
      '</section>' +
      '<aside class="stack">' +
      (list.length ? '<section class="panel" data-reveal><div class="panel-head"><h3>By tier</h3></div><div class="panel-body">' + Club.charts.hbars(byTier.map(function (x, i) { return { label: x.t.name + ' (' + x.n + ')', value: x.total, brass: i % 2 === 1 }; }), { money: true }) + '</div></section>' : '') +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Run history</h3></div><div class="panel-body flush">' +
      (hist.length ? '<ul class="list">' + hist.map(function (k) { const r = runs[k]; return '<li class="row between"><span class="bil-stack"><span class="person-name">' + esc(monthLabel(k)) + '</span><span class="person-sub">Posted ' + esc(fmt.date(r.postedOn)) + ' · ' + r.count + ' members</span></span><span class="num">' + money(r.total) + '</span></li>'; }).join('') + '</ul>' : ui.empty({ icon: 'calendar', title: 'No runs yet', text: 'Each posted month is recorded here.' })) +
      '</div></section></aside></div>';

    ui.on(p, 'change', 'select[name=duesKey]', function (e, f) { duesKey = f.value; tabDues(p); p = panels.dues; ui.animateIn(p); });
    ui.on(p, 'click', '[data-action=post-dues]', function (e, b) {
      ui.confirm({ title: 'Post ' + monthLabel(duesKey) + ' dues?', text: list.length + ' charges totalling ' + fmt.money(total) + ' will be posted to member accounts. This cannot be run twice for the same month.', confirmLabel: 'Post dues' }).then(function (yes) {
        if (!yes) return;
        b.disabled = true;
        const key = duesKey; let n = 0, tot = 0;
        /* One Undo for the whole run: every dues charge is reversed with a credit and the run record goes back. */
        undoRun(function () {
          const have = {}; S.all('charges').forEach(function (c) { if (c.refId === 'dues-' + key && live(c)) have[c.memberId] = true; });
          list.forEach(function (x) {
            if (have[x.m.id]) return;
            const c = Club.chargeMember(x.m.id, { description: monthName(key) + ' dues instalment, ' + x.t.name + ' membership', category: 'Dues', amount: x.amount, source: 'billing', refId: 'dues-' + key, date: key + '-01', title: 'Membership dues' });
            if (c) { n++; tot += c.amount; }
          });
          const runs2 = Object.assign({}, S.getObj('billingDuesRuns', {})); const prev = runs2[key];
          runs2[key] = { postedOn: today(), count: n + (prev ? prev.count : 0), total: r2(tot + (prev ? prev.total : 0)) };
          S.setObj('billingDuesRuns', Object.assign({}, runs2));
        }, { message: function () { return monthName(key) + ' dues posted: ' + n + ' members, ' + fmt.money(tot); }, undone: monthName(key) + ' dues run reversed', after: rerenderAfterUndo });
        tabDues(p); p = panels.dues; ui.animateIn(p);
      });
    });
  }

  /* ---------------- F&B minimums ---------------- */
  let fbKey = null;
  function fbRows(key) {
    const start = key + '-01', end = monthEnd(key);
    const dining = {}; const posted = {};
    S.all('charges').forEach(function (c) {
      if (c.date < start || c.date > end) return;
      if (c.refId && String(c.refId).indexOf('fbmin-') === 0) { if (live(c)) posted[c.memberId] = c; return; }
      if (c.category === 'Dining') dining[c.memberId] = (dining[c.memberId] || 0) + (+c.amount || 0);
    });
    return S.all('members').filter(function (m) { const t = S.find('membershipTiers', m.tierId); return m.status === 'active' && t && t.monthlyMinimum > 0; }).map(function (m) {
      const t = S.find('membershipTiers', m.tierId); const spend = r2(dining[m.id] || 0);
      return { m: m, t: t, min: t.monthlyMinimum, spend: spend, short: r2(Math.max(0, t.monthlyMinimum - spend)), posted: posted[m.id] || null };
    }).sort(function (a, b) { return b.short - a.short || a.m.lastName.localeCompare(b.m.lastName); });
  }
  function tabMinimums(p) {
    p = fresh(p); panels.minimums = p;
    if (!S.all('membershipTiers').some(function (t) { return (+t.monthlyMinimum || 0) > 0; })) {
      p.innerHTML = '<section class="panel bil-gap" data-reveal><div class="panel-head"><div><div class="eyebrow">Food and beverage minimum</div><h3>No minimums set</h3></div></div><div class="panel-body">' +
        ui.empty({ icon: 'dining', title: 'No monthly minimums', text: 'St. Boniface has no monthly food and beverage minimums set. Set one per category in Settings if needed.', action: '<a class="btn btn-ghost" href="#/settings">' + Club.icon('settings') + '<span>Open Settings</span></a>' }) +
        '</div></section>';
      return;
    }
    const cm = curMonth(); const choices = [cm, addMonths(cm, -1), addMonths(cm, -2)];
    if (!fbKey || choices.indexOf(fbKey) < 0) fbKey = cm;
    const rows = fbRows(fbKey);
    const below = rows.filter(function (r) { return r.short > 0 && !r.posted; });
    const postedRows = rows.filter(function (r) { return r.posted; });
    const totalShort = r2(sum(below, function (r) { return r.short; }));
    const isCur = fbKey === cm;
    const shown = fbShowAll ? rows : rows.filter(function (r) { return r.short > 0 || r.posted; });
    p.innerHTML = statStrip([
      { label: 'Members with a minimum', html: '<span data-count="' + rows.length + '">0</span>', meta: 'Active, by tier' },
      { label: 'Below minimum', html: '<span data-count="' + below.length + '">0</span>', meta: isCur ? 'Month to date' : monthLabel(fbKey) },
      { label: 'Shortfall to post', html: moneyCount(totalShort, true), meta: postedRows.length ? postedRows.length + ' already posted' : 'Nothing posted yet' },
      { label: 'Average dining spend', html: moneyCount(rows.length ? sum(rows, function (r) { return r.spend; }) / rows.length : 0), meta: 'Per member with a minimum' }
    ]) +
      '<section class="panel bil-gap" data-reveal><div class="panel-head bil-wrap-head"><div><div class="eyebrow">Food and beverage minimum</div><h3>' + esc(monthLabel(fbKey)) + '</h3></div><div class="row wrap">' +
      '<select class="select bil-inline-select" name="fbKey" aria-label="Month">' + ui.options(choices.map(function (k) { return { value: k, label: monthLabel(k) }; }), fbKey) + '</select>' +
      ui.segmented([{ value: 'short', label: 'Shortfalls' }, { value: 'all', label: 'All members' }], fbShowAll ? 'all' : 'short', 'fbview') +
      ui.btn('Post shortfall charges', { kind: 'primary', icon: 'check', action: 'post-fb' }) + '</div></div>' +
      (isCur ? '<p class="bil-note">Month to date through ' + esc(fmt.dateShort(today())) + '. Shortfall charges are usually posted once the month has closed.</p>' : '') +
      '<div class="panel-body flush">' +
      (shown.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Tier</th><th class="num">Minimum</th><th class="num">Dining spend</th><th class="bil-prog-th">Progress</th><th class="num">Shortfall</th></tr></thead><tbody>' + shown.map(function (r) {
        const pct = Math.min(100, r.spend / r.min * 100);
        return '<tr class="clickable" data-href="billing/' + esc(r.m.id) + '"><td class="primary-cell">' + esc(r.m.lastName + ', ' + r.m.firstName) + '</td><td>' + esc(r.t.name) + '</td><td class="num muted">' + money(r.min) + '</td><td class="num">' + money(r.spend) + '</td><td><div class="bar' + (pct >= 100 ? '' : ' brass') + '"><span style="width:' + Math.max(2, pct) + '%"></span></div></td>' +
          '<td class="num">' + (r.posted ? ui.badge('Posted ' + fmt.money(r.posted.amount), 'good') : r.short > 0 ? '<strong class="bil-bad">' + money(r.short) + '</strong>' : '<span class="muted">Met</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
        : ui.empty({ icon: 'dining', title: 'Every member has met the minimum', text: 'Switch to All members to see each account.' })) + '</div></section>';

    ui.on(p, 'change', 'select[name=fbKey]', function (e, f) { fbKey = f.value; tabMinimums(p); p = panels.minimums; ui.animateIn(p); runMoney(p); });
    ui.on(p, 'click', '.segmented button', function (e, b) { fbShowAll = b.dataset.value === 'all'; tabMinimums(p); p = panels.minimums; ui.animateIn(p); runMoney(p); });
    ui.on(p, 'click', '[data-action=post-fb]', function () {
      if (!below.length) { ui.toast('No unposted shortfalls for ' + monthLabel(fbKey)); return; }
      ui.confirm({ title: 'Post shortfall charges?', text: below.length + ' members fell short of their ' + monthLabel(fbKey) + ' minimum. ' + fmt.money(totalShort) + ' will be charged to their accounts.' + (isCur ? ' The month has not yet closed.' : ''), confirmLabel: 'Post ' + below.length + ' charges' }).then(function (yes) {
        if (!yes) return;
        const key = fbKey; let n = 0;
        undoRun(function () {
          below.forEach(function (r) {
            if (S.all('charges').some(function (c) { return c.memberId === r.m.id && c.refId === 'fbmin-' + key && live(c); })) return;
            if (Club.chargeMember(r.m.id, { description: 'F&B minimum shortfall, ' + monthLabel(key), category: 'Dining', amount: r.short, source: 'billing', refId: 'fbmin-' + key, date: key === curMonth() ? today() : monthEnd(key), title: 'F&B minimum' })) n++;
          });
        }, { message: function () { return n + ' shortfall ' + (n === 1 ? 'charge' : 'charges') + ' posted'; }, undone: 'Shortfall charges reversed', after: rerenderAfterUndo });
        tabMinimums(p); p = panels.minimums; ui.animateIn(p); runMoney(p);
      });
    });
    runMoney(p);
  }

  /* ---------------- Statements ---------------- */
  function buildStatement(memberId, key, existing) {
    const start = key + '-01', end = monthEnd(key);
    const ch = S.all('charges').filter(function (c) { return c.memberId === memberId; });
    const py = S.all('payments').filter(function (x) { return x.memberId === memberId; });
    const pc = ch.filter(function (c) { return c.date >= start && c.date <= end; });
    const pp = py.filter(function (x) { return x.date >= start && x.date <= end; });
    if (!pc.length && !pp.length) return null;
    const opening = r2(sum(ch.filter(function (c) { return c.date < start; }), function (c) { return c.amount; }) - sum(py.filter(function (x) { return x.date < start; }), function (x) { return x.amount; }));
    const c = r2(sum(pc, function (x) { return x.amount; })), pa = r2(sum(pp, function (x) { return x.amount; }));
    return { doc: { memberId: memberId, period: key, issuedOn: today(), dueOn: Club.date.addDays(today(), DUE_DAYS), openingBalance: opening, chargesTotal: c, paymentsTotal: pa, total: r2(opening + c - pa), status: existing ? existing.status : 'draft' }, charges: pc };
  }
  /** Statements for every member with activity in the month. Returns the counts and links [[charge, statementId]] for
      linkCharges, which runs outside Club.undo.track so Undo restores the statements and unlinkCharges the charges. */
  function generate(key) {
    let created = 0, refreshed = 0, kept = 0;
    const links = [];
    const ids = Array.from(new Set(S.all('charges').concat(S.all('payments')).filter(function (x) { return mkey(x.date) === key; }).map(function (x) { return x.memberId; })));
    ids.forEach(function (mid) {
      if (!S.find('members', mid)) return;
      const ex = S.all('statements').find(function (s) { return s.memberId === mid && s.period === key; });
      if (ex && ex.status !== 'draft') { kept++; return; }
      const b = buildStatement(mid, key, ex); if (!b) return;
      let st;
      if (ex) { st = S.update('statements', ex.id, b.doc); refreshed++; }
      else { st = S.insert('statements', Object.assign({ id: 'stm_' + key.replace('-', '') + '_' + mid }, b.doc)); created++; }
      b.charges.forEach(function (c) { if (c.statementId !== st.id) links.push([c, st.id]); });
    });
    return { created: created, refreshed: refreshed, kept: kept, links: links };
  }
  /** Point charges at their statement (saved once) and return [[chargeId, previous statementId]] for unlinkCharges. */
  function linkCharges(links) {
    if (!links || !links.length) return [];
    const back = links.map(function (l) { const was = l[0].statementId == null ? null : l[0].statementId; l[0].statementId = l[1]; return [l[0].id, was]; });
    S.replace('charges', S.all('charges'));
    return back;
  }
  function unlinkCharges(back) {
    if (!back || !back.length) return;
    back.forEach(function (b) { const c = S.find('charges', b[0]); if (c) c.statementId = b[1]; });
    S.replace('charges', S.all('charges'));
  }
  function statementActions(s, sm) {
    let h = '<a class="btn btn-ghost' + (sm ? ' btn-sm' : '') + '" href="#/billing/statement/' + esc(s.id) + '">' + Club.icon('eye') + '<span>View</span></a>';
    if (s.status === 'draft') h += ui.btn('Mark sent', { sm: sm, action: 'st-sent', id: s.id, icon: 'send' });
    if (s.status === 'sent' || s.status === 'overdue') h += ui.btn('Mark paid', { sm: sm, action: 'st-paid', id: s.id, icon: 'check' });
    return h;
  }
  function markSent(id) { S.update('statements', id, { status: 'sent', sentOn: today(), issuedOn: today(), dueOn: Club.date.addDays(today(), DUE_DAYS) }); }
  /* What has been paid toward a statement: payments since the start of its period, less the payments the statement
     already counts (paymentsTotal). The same rule as the members' portal (js/portal/account.js paidToward). */
  function paidToward(s) {
    const start = s.period + '-01';
    return r2(Math.max(0, sum(S.all('payments').filter(function (p) { return p.memberId === s.memberId && p.date >= start; }), function (p) { return p.amount; }) - (+s.paymentsTotal || 0)));
  }
  /* Still owed on a statement: its total less what has been paid toward it, never more than the live balance. */
  function owedOn(s, m) { return r2(Math.max(0, Math.min(m ? (m.balance || 0) : (s.total || 0), (s.total || 0) - paidToward(s)))); }
  function markPaid(id, done) {
    const s = S.find('statements', id); if (!s) return;
    const m = S.find('members', s.memberId);
    const owed = owedOn(s, m);
    if (owed <= 0.005) {
      undoRun(function () { S.update('statements', id, { status: 'paid', paidOn: today() }); }, { message: 'Statement marked paid', undone: 'Statement is ' + s.status + ' again', after: rerenderAfterUndo });
      if (done) done(); return;
    }
    openRecordPayment(s.memberId, done, { amount: owed, statement: s });
  }
  function wireStatementActions(root, done) {
    /* Mark sent only records that the statement went out (nothing is emailed from here), so it can be undone. */
    ui.on(root, 'click', '[data-action=st-sent]', function (e, b) { undoRun(function () { markSent(b.dataset.id); }, { message: 'Statement marked sent', undone: 'Statement is a draft again', after: rerenderAfterUndo }); done(); });
    ui.on(root, 'click', '[data-action=st-paid]', function (e, b) { markPaid(b.dataset.id, done); });
  }
  let genKey = null;
  function tabStatements(p) {
    p = fresh(p); panels.statements = p;
    sweepOverdue();
    const cm = curMonth(); const periods = []; for (let i = 0; i < 6; i++) periods.push(addMonths(cm, -i));
    if (!genKey) genKey = addMonths(cm, -1);
    const all = S.all('statements');
    const list = all.filter(function (s) { return (!sf.period || s.period === sf.period) && (!sf.status || s.status === sf.status); })
      .sort(function (a, b) { return b.period.localeCompare(a.period) || mname(a.memberId).split(' ').pop().localeCompare(mname(b.memberId).split(' ').pop()); });
    if (sf.page * ST_PAGE >= list.length) sf.page = Math.max(0, Math.ceil(list.length / ST_PAGE) - 1);
    const count = function (st) { return all.filter(function (s) { return s.status === st && (!sf.period || s.period === sf.period); }).length; };
    const drafts = all.filter(function (s) { return s.status === 'draft'; });
    p.innerHTML = '<div class="bil-st-top">' +
      '<section class="panel" data-reveal><div class="panel-body bil-gen"><div><div class="eyebrow">Generate</div><h3>Monthly statements</h3><p class="ink-2">One statement per member with activity in the period. Drafts are refreshed; sent and paid statements are left as issued.</p></div>' +
      '<div class="row wrap"><select class="select bil-inline-select" name="genKey" aria-label="Statement period">' + ui.options(periods.map(function (k) { return { value: k, label: monthLabel(k) }; }), genKey) + '</select>' + ui.btn('Generate statements', { kind: 'primary', icon: 'billing', action: 'gen' }) +
      (drafts.length ? ui.btn('Send ' + drafts.length + ' drafts', { icon: 'send', action: 'send-drafts' }) : '') + '</div></div></section>' +
      '<div class="bil-st-counts" data-reveal>' + ['draft', 'sent', 'overdue', 'paid'].map(function (st) {
        return '<button type="button" class="bil-st-count' + (sf.status === st ? ' active' : '') + '" data-st="' + st + '" aria-pressed="' + (sf.status === st) + '"><span class="bil-st-label">' + st[0].toUpperCase() + st.slice(1) + '</span><span class="stat-value">' + count(st) + '</span></button>';
      }).join('') + '</div></div>' +
      '<section class="panel bil-gap bil-st-list" data-reveal><div class="panel-head bil-wrap-head"><h3>Statements</h3><div class="row wrap">' +
      '<select class="select bil-inline-select" name="sfPeriod" aria-label="Filter period"><option value="">All periods</option>' + ui.options(periods.map(function (k) { return { value: k, label: monthLabel(k) }; }), sf.period) + '</select>' +
      '<select class="select bil-inline-select" name="sfStatus" aria-label="Filter status"><option value="">All statuses</option>' + ui.options(['draft', 'sent', 'overdue', 'paid'].map(function (s) { return { value: s, label: s[0].toUpperCase() + s.slice(1) }; }), sf.status) + '</select></div></div><div class="panel-body flush">' +
      (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Period</th><th>Issued</th><th>Due</th><th class="num">Balance due</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>' + list.slice(sf.page * ST_PAGE, (sf.page + 1) * ST_PAGE).map(function (s) {
        return '<tr class="clickable" data-href="billing/statement/' + esc(s.id) + '"><td class="primary-cell nowrap">' + esc(mname(s.memberId)) + '</td><td class="nowrap">' + esc(monthLabel(s.period, true)) + '</td><td class="nowrap">' + esc(fmt.dateShort(s.issuedOn)) + '</td><td class="nowrap">' + (s.dueOn ? esc(fmt.dateShort(s.dueOn)) : '') + '</td><td class="num">' + money(s.total) + '</td><td>' + ui.badge(stLabel(s.status), ST_KIND[s.status]) + '</td><td class="right nowrap"><div class="bil-actions">' + statementActions(s, true) + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' + pager(list.length, sf.page, ST_PAGE, 'stpage')
        : ui.empty({ icon: 'billing', title: 'No statements', text: all.length ? 'No statements match these filters.' : 'Generate statements for a period to get started.' })) + '</div></section>';

    function redraw() { tabStatements(p); p = panels.statements; ui.animateIn(p); }
    ui.on(p, 'change', 'select[name=genKey]', function (e, f) { genKey = f.value; });
    ui.on(p, 'change', 'select[name=sfPeriod]', function (e, f) { sf.period = f.value; sf.page = 0; redraw(); });
    ui.on(p, 'change', 'select[name=sfStatus]', function (e, f) { sf.status = f.value; sf.page = 0; redraw(); });
    ui.on(p, 'click', '.bil-st-count', function (e, b) { sf.status = sf.status === b.dataset.st ? '' : b.dataset.st; sf.page = 0; redraw(); });
    ui.on(p, 'click', '[data-action=stpage]', function (e, b) { sf.page = +b.dataset.page; redraw(); const t = ui.$('.bil-st-list', p); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); });
    ui.on(p, 'click', '[data-action=gen]', function () {
      const key = genKey; let back = [];
      /* One Undo for the whole run: new statements are removed, refreshed drafts go back, charges are unlinked. */
      const r = undoRun(function () { return generate(key); }, {
        message: function (x) { return !x.created && !x.refreshed ? (x.kept ? 'Statements for ' + monthLabel(key) + ' are already issued' : 'No account activity in ' + monthLabel(key)) : x.created + ' statements created, ' + x.refreshed + ' drafts refreshed'; },
        undone: 'Statements for ' + monthLabel(key) + ' put back as they were', after: function () { unlinkCharges(back); rerenderAfterUndo(); } });
      back = linkCharges(r.links);
      sf.period = genKey; sf.status = ''; sf.page = 0; redraw();
    });
    ui.on(p, 'click', '[data-action=send-drafts]', function () {
      ui.confirm({ title: 'Send ' + drafts.length + ' statements?', text: 'Each draft is marked sent and given a due date ' + DUE_DAYS + ' days from today.', confirmLabel: 'Mark all sent' }).then(function (yes) {
        if (!yes) return;
        undoRun(function () { drafts.forEach(function (s) { markSent(s.id); }); }, { message: drafts.length + ' statements marked sent', undone: drafts.length + ' statements are drafts again', after: rerenderAfterUndo });
        redraw();
      });
    });
    wireStatementActions(p, redraw);
  }

  /* ---------------- Renewals: who has renewed for next season ----------------
     Every member who is not resigned, with their renewal (Club.billing.renewal) or "Not yet renewed". Stat tiles open
     details (Club.drill). Wired once per tab panel; the filter and pager redraw only the inner host. */
  const rnf = { show: 'all', page: 0 };
  function renewalRows() {
    return S.all('members').filter(function (m) { return m.status !== 'resigned' && S.find('membershipTiers', m.tierId); }).map(function (m) {
      const r = renewalFor(m.id), sched = r ? r.schedule || [] : [];
      const posted = sched.filter(function (s) { return s.chargeId; });
      return { m: m, t: S.find('membershipTiers', m.tierId), r: r, posted: r2(sum(posted, function (s) { return s.amount; })), left: r2(sum(sched.filter(function (s) { return !s.chargeId; }), function (s) { return s.amount; })),
        next: sched.find(function (s) { return !s.chargeId; }) || null, paidN: posted.length };
    }).sort(function (a, b) { return a.m.lastName.localeCompare(b.m.lastName) || a.m.firstName.localeCompare(b.m.firstName); });
  }
  function planText(x) {
    if (!x.r) return '';
    return x.r.plan === 'monthly' ? 'Monthly, ' + x.paidN + ' of ' + x.r.schedule.length + ' posted' : 'Paid in full';
  }
  function renewBadge(x) { return x.r ? ui.badge('Renewed', 'good') : ui.badge('Not yet renewed', 'outline'); }
  function tabRenewals(p) {
    p.innerHTML = '<div class="bil-rn"></div>';
    const host = ui.$('.bil-rn', p);
    let rows = [];
    const D = Club.drill;
    function who(x) { return '<a href="#/billing/' + esc(x.m.id) + '">' + esc(x.m.lastName + ', ' + x.m.firstName) + '</a>'; }
    const drills = {
      renewed: function () {
        const list = rows.filter(function (x) { return x.r; });
        return { title: 'Renewed for ' + RENEW_SEASON, body: D.kpis([{ label: 'Renewed', value: String(list.length) }, { label: 'Paid in full', value: String(list.filter(function (x) { return x.r.plan === 'full'; }).length) }, { label: 'Monthly', value: String(list.filter(function (x) { return x.r.plan === 'monthly'; }).length) }]) +
          (list.length ? D.sec('Members', list.length + ' renewed', D.table([{ label: 'Member' }, { label: 'Plan' }, { label: 'Renewed' }, { label: 'Posted', num: true }], list.map(function (x) {
            return [who(x), esc(planText(x)), esc(fmt.dateShort(String(x.r.createdAt).slice(0, 10))), money(x.posted)];
          }))) : D.empty('No renewals yet', 'Members renew from My account in the members’ portal.', 'members')) };
      },
      pending: function () {
        const list = rows.filter(function (x) { return !x.r; });
        return { title: 'Not yet renewed', body: (list.length ? D.sec('Members to follow up', list.length + ' members', D.table([{ label: 'Member' }, { label: 'Tier' }, { label: 'Status' }, { label: 'Balance', num: true }], list.map(function (x) {
          return [who(x), esc(x.t.name), esc(x.m.status === 'active' ? 'Active' : stLabel(x.m.status)), money(x.m.balance || 0)];
        }))) : D.empty('Everyone has renewed', 'Every current member has renewed for ' + RENEW_SEASON + '.', 'check')) };
      },
      plans: function () {
        const tiers = S.all('membershipTiers').map(function (t) {
          const of = rows.filter(function (x) { return x.t.id === t.id; }), rn = of.filter(function (x) { return x.r; });
          return [esc(t.name), String(of.length), String(rn.length), String(rn.filter(function (x) { return x.r.plan === 'full'; }).length), String(rn.filter(function (x) { return x.r.plan === 'monthly'; }).length)];
        });
        return { title: 'Plans by category', body: D.sec('By membership category', null, D.table([{ label: 'Category' }, { label: 'Members', num: true }, { label: 'Renewed', num: true }, { label: 'In full', num: true }, { label: 'Monthly', num: true }], tiers)) +
          D.note('Monthly plans spread the year’s dues in equal instalments from the renewal month until August ' + RENEW_SEASON + '.') };
      },
      posted: function () {
        const by = {};
        rows.forEach(function (x) { if (!x.r) return; x.r.schedule.forEach(function (s) { const k = mkey(s.date); by[k] = by[k] || { n: 0, amt: 0, posted: 0 }; by[k].n++; by[k].amt += s.amount; if (s.chargeId) by[k].posted += s.amount; }); });
        const keys = Object.keys(by).sort();
        return { title: RENEW_SEASON + ' dues by month', body: keys.length ? D.sec('Instalments', keys.length + ' months', D.table([{ label: 'Month' }, { label: 'Instalments', num: true }, { label: 'Posted', num: true }, { label: 'Scheduled', num: true }], keys.map(function (k) {
          return [esc(monthLabel(k)), String(by[k].n), money(by[k].posted), money(by[k].amt - by[k].posted)];
        }))) + D.note('Dues amounts in this demo are placeholders.') : D.empty('Nothing scheduled yet', 'Instalments appear here once members renew.', 'calendar') };
      }
    };
    function draw() {
      rows = renewalRows();
      const done = rows.filter(function (x) { return x.r; }), pending = rows.filter(function (x) { return !x.r; });
      const monthly = done.filter(function (x) { return x.r.plan === 'monthly'; }).length;
      const posted = r2(sum(done, function (x) { return x.posted; })), left = r2(sum(done, function (x) { return x.left; }));
      const list = rows.filter(function (x) { return rnf.show === 'all' || (rnf.show === 'renewed' ? x.r : !x.r); });
      const pages = Math.max(1, Math.ceil(list.length / ACCT_PAGE)); if (rnf.page >= pages) rnf.page = pages - 1;
      const shown = list.slice(rnf.page * ACCT_PAGE, (rnf.page + 1) * ACCT_PAGE);
      host.innerHTML = D.tiles(ui.stats([
        { label: 'Renewed for ' + RENEW_SEASON, value: done.length, meta: (rows.length ? Math.round(done.length / rows.length * 100) : 0) + '% of ' + rows.length + ' members' },
        { label: 'Not yet renewed', value: pending.length, meta: pending.filter(function (x) { return x.m.status === 'active'; }).length + ' active members' },
        { label: 'Paying monthly', value: monthly, meta: (done.length - monthly) + ' paid in full' },
        { label: RENEW_SEASON + ' dues posted', value: posted, prefix: '$', decimals: 2, meta: fmt.money(left) + ' still scheduled' }
      ]), ['renewed', 'pending', 'plans', 'posted']) +
        '<section class="panel bil-gap" data-reveal><div class="panel-head bil-wrap-head"><div><div class="eyebrow">' + RENEW_SEASON + ' season</div><h3>Renewal status</h3></div>' +
          ui.segmented([{ value: 'all', label: 'All (' + rows.length + ')' }, { value: 'renewed', label: 'Renewed (' + done.length + ')' }, { value: 'pending', label: 'Not yet (' + pending.length + ')' }], rnf.show, 'rnshow') + '</div>' +
        '<p class="bil-note">Members renew from My account in the members’ portal: in full, or in monthly instalments until August ' + RENEW_SEASON + '. Dues amounts in this demo are placeholders.</p>' +
        '<div class="panel-body flush">' + (shown.length ? '<div class="table-wrap"><table class="table bil-rn-table"><thead><tr><th>Member</th><th>Tier</th><th>' + RENEW_SEASON + '</th><th>Plan</th><th>Next instalment</th><th class="num">Posted</th></tr></thead><tbody>' + shown.map(function (x) {
          return '<tr class="clickable" data-href="billing/' + esc(x.m.id) + '"><td class="primary-cell nowrap">' + esc(x.m.lastName + ', ' + x.m.firstName) + '<span class="bil-src">No. ' + esc(x.m.memberNo) + (x.m.status !== 'active' ? ' · ' + esc(x.m.status) : '') + '</span></td><td>' + esc(x.t.name) + '</td><td>' + renewBadge(x) + '</td>' +
            '<td class="nowrap">' + (x.r ? esc(planText(x)) : '') + '</td><td class="nowrap">' + (x.next ? esc(fmt.dateShort(x.next.date)) + ' · ' + money(x.next.amount) : (x.r ? '<span class="muted">All posted</span>' : '')) + '</td><td class="num">' + (x.r ? money(x.posted) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + pager(list.length, rnf.page, ACCT_PAGE, 'rnpage')
          : ui.empty({ icon: 'members', title: rnf.show === 'renewed' ? 'No renewals yet' : 'Everyone has renewed', text: rnf.show === 'renewed' ? 'Members renew from My account in the members’ portal.' : 'Every current member has renewed for ' + RENEW_SEASON + '.' })) + '</div></section>';
      ui.animateIn(host);
    }
    draw();
    D.wire(p, drills, RENEW_SEASON + ' renewals');
    ui.on(p, 'click', '.segmented[data-name=rnshow] button', function (e, b) { rnf.show = b.dataset.value; rnf.page = 0; draw(); });
    ui.on(p, 'click', '[data-action=rnpage]', function (e, b) { rnf.page = +b.dataset.page; draw(); });
  }

  /* ---------------- Statement letterhead view ---------------- */
  function crest() {
    return Club.logoImg('bil-crest');
  }
  function renderStatement(view, id) {
    const s = S.find('statements', id);
    if (!s) { view.innerHTML = '<a class="bil-back" href="#/billing/statements">' + Club.icon('chevronLeft') + 'Statements</a>' + ui.empty({ icon: 'billing', title: 'Statement not found', text: 'It may have been removed. Generate statements again from the Statements tab.' }); return; }
    const m = S.find('members', s.memberId); const t = m ? S.find('membershipTiers', m.tierId) : null;
    const start = s.period + '-01', end = monthEnd(s.period);
    let items = S.all('charges').filter(function (c) { return c.statementId === s.id; });
    if (!items.length) items = S.all('charges').filter(function (c) { return c.memberId === s.memberId && c.date >= start && c.date <= end; });
    items = items.slice().sort(byDate);
    const pays = S.all('payments').filter(function (x) { return x.memberId === s.memberId && x.date >= start && x.date <= end; }).sort(byDate);
    const cats = CATS.map(function (c) { return { c: c, v: r2(sum(items.filter(function (i) { return (i.category || 'Other') === c; }), function (i) { return i.amount; })) }; }).filter(function (x) { return x.v; });
    const info = Club.info;
    const stNo = s.period.replace('-', '') + '-' + (m ? m.memberNo : '0000');

    view.innerHTML = '<div class="bil-st-bar no-print"><a class="bil-back" href="#/billing/statements">' + Club.icon('chevronLeft') + 'Statements</a><div class="row wrap">' +
      ui.badge(stLabel(s.status), ST_KIND[s.status]) + (m ? '<a class="btn btn-ghost" href="#/billing/' + esc(m.id) + '">' + Club.icon('user') + '<span>Account</span></a>' : '') +
      (s.status === 'draft' ? ui.btn('Mark sent', { action: 'st-sent', id: s.id, icon: 'send' }) : '') + (s.status === 'sent' || s.status === 'overdue' ? ui.btn('Mark paid', { action: 'st-paid', id: s.id, icon: 'check' }) : '') +
      ui.btn('Print', { kind: 'primary', icon: 'print', action: 'print' }) + '</div></div>' +
      '<article class="bil-sheet" data-reveal>' +
      '<header class="bil-lh">' + crest() + '<div class="bil-lh-name">' + esc(info.name) + '</div><div class="bil-lh-est">Established ' + esc(info.est) + '</div><div class="bil-lh-addr">' + esc(info.address) + ' · ' + esc(info.phone) + (info.email ? ' · ' + esc(info.email) : '') + '</div></header>' +
      '<div class="bil-sheet-rule"></div>' +
      '<div class="bil-sheet-meta"><div class="bil-addressee"><div class="bil-sheet-label">Statement for</div><div class="bil-addressee-name">' + esc(m ? m.firstName + ' ' + m.lastName : 'Former member') + '</div>' +
      (m ? '<div>' + esc(m.address || '') + '</div><div>Member No. ' + esc(m.memberNo) + (t ? ' · ' + esc(t.name) : '') + '</div>' : '') + '</div>' +
      '<dl class="bil-sheet-facts"><dt>Statement</dt><dd>' + esc(stNo) + '</dd><dt>Period</dt><dd>' + esc(monthLabel(s.period)) + '</dd><dt>Issued</dt><dd>' + esc(fmt.date(s.issuedOn)) + '</dd><dt>Payment due</dt><dd>' + (s.dueOn ? esc(fmt.date(s.dueOn)) : 'On receipt') + '</dd></dl></div>' +
      '<div class="bil-summary"><div><span>Previous balance</span><strong>' + money(s.openingBalance || 0) + '</strong></div><div><span>Payments received</span><strong>' + money(-(s.paymentsTotal || 0)) + '</strong></div><div><span>New charges</span><strong>' + money(s.chargesTotal || 0) + '</strong></div><div class="bil-summary-due"><span>Balance due</span><strong>' + money(s.total) + '</strong></div></div>' +
      '<h4 class="bil-sheet-h">Charges</h4>' +
      (items.length ? '<table class="table bil-sheet-table"><thead><tr><th>Date</th><th>Description</th><th>Department</th><th class="num">Amount</th></tr></thead><tbody>' + items.map(function (c) {
        return '<tr><td class="nowrap">' + esc(fmt.dateShort(c.date)) + '</td><td>' + esc(c.description || '') + '</td><td>' + esc(c.category || 'Other') + '</td><td class="num">' + money(c.amount) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="3">Total charges</td><td class="num">' + money(sum(items, function (c) { return c.amount; })) + '</td></tr></tfoot></table>' : '<p class="muted">No charges in this period.</p>') +
      (cats.length > 1 ? '<div class="bil-cats">' + cats.map(function (x) { return '<span><span class="bil-cat-label">' + esc(x.c) + '</span>' + money(x.v) + '</span>'; }).join('') + '</div>' : '') +
      '<h4 class="bil-sheet-h">Payments</h4>' +
      (pays.length ? '<table class="table bil-sheet-table"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>' + pays.map(function (x) {
        return '<tr><td class="nowrap">' + esc(fmt.dateShort(x.date)) + '</td><td>' + esc(methodLabel(x.method)) + '</td><td>' + esc(x.reference || '') + '</td><td class="num">' + money(-x.amount) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted">No payments received in this period.</p>') +
      '<footer class="bil-sheet-foot"><p class="bil-sheet-thanks">Thank you for being part of ' + esc(info.name) + '. We look forward to seeing you at the club.</p><p>Please remit by ' + (s.dueOn ? esc(fmt.date(s.dueOn)) : 'return') + '. Yearly dues may be paid in instalments from sign-up until August. Questions about your house account may be directed to the Controller at <span class="nowrap">' + esc(info.phone) + ' ext. 202</span>.</p></footer>' +
      '</article>';

    ui.on(view, 'click', '[data-action=print]', function () { window.print(); });
    wireStatementActions(view, rerender);
  }

  /* ---------------- Member account view ---------------- */
  const acct = { period: '', page: 0, id: null, rcAll: false };
  const RC_SHOW = 6;
  /** Receipts panel: everything the member was given a receipt for (Club.receipts), newest first; staff open and reprint any. */
  function receiptsPanel(id) {
    const list = Club.receipts ? Club.receipts.forMember(id) : [];
    const shown = acct.rcAll ? list : list.slice(0, RC_SHOW);
    return '<section class="panel bil-rc" data-reveal aria-labelledby="bil-rc-h"><div class="panel-head"><h3 id="bil-rc-h">Receipts</h3><span class="muted">' + list.length + '</span></div><div class="panel-body flush">' +
      (list.length ? '<ul class="list">' + shown.map(function (r) {
        const credit = r.kind === 'credit';
        return '<li><button type="button" class="bil-rc-row" data-receipt-open="' + esc(r.id) + '" aria-label="Open ' + (credit ? 'credit ' : 'receipt ') + esc(r.no) + ', ' + esc(r.title) + '">' +
          '<span class="bil-stack"><span class="person-name">' + esc(r.title) + '</span><span class="person-sub">' + esc(fmt.dateShort(r.date)) + ' · ' + esc(r.no) + ' · ' + esc(r.methodLabel) + '</span></span>' +
          '<span class="num' + (credit ? ' bil-credit' : '') + '">' + (credit ? '-' : '') + money(r.total) + '</span></button></li>';
      }).join('') + '</ul>' +
      (list.length > RC_SHOW ? '<div class="bil-rc-more"><button type="button" class="s-link" data-action="rc-all">' + (acct.rcAll ? 'Show fewer' : 'Show all ' + list.length + ' receipts') + '</button></div>' : '')
      : ui.empty({ icon: 'billing', title: 'No receipts yet', text: 'Every charge, credit and payment on this account gets a receipt here.' })) + '</div></section>';
  }
  function renderAccount(view, id) {
    const m = S.find('members', id);
    if (!m) { view.innerHTML = '<a class="bil-back" href="#/billing">' + Club.icon('chevronLeft') + 'Billing</a>' + ui.empty({ icon: 'members', title: 'Account not found', text: 'This member record no longer exists.' }); return; }
    const t = S.find('membershipTiers', m.tierId);
    const a = agingFor(id);
    const ch = S.all('charges').filter(function (c) { return c.memberId === id; });
    const py = S.all('payments').filter(function (x) { return x.memberId === id; });
    const rows = ch.map(function (c) { return { kind: 'charge', date: c.date, description: c.description, category: c.category || 'Other', amount: +c.amount || 0, createdAt: c.createdAt, id: c.id }; })
      .concat(py.map(function (x) { return { kind: 'payment', date: x.date, description: 'Payment received, ' + (x.reference || methodLabel(x.method) || 'thank you'), category: 'Payment', amount: +x.amount || 0, createdAt: x.createdAt, id: x.id }; })).sort(byDate);
    let run = 0; rows.forEach(function (r) { run += r.kind === 'charge' ? r.amount : -r.amount; r.run = r2(run); });
    const periods = Array.from(new Set(rows.map(function (r) { return mkey(r.date); }))).sort().reverse();
    if (acct.period && periods.indexOf(acct.period) < 0) acct.period = '';
    if (acct.id !== id) { acct.id = id; acct.page = 0; acct.rcAll = false; }
    const allShown = rows.filter(function (r) { return !acct.period || mkey(r.date) === acct.period; }).reverse();
    if (acct.page * ACCT_PAGE >= allShown.length) acct.page = 0;
    const shown = allShown.slice(acct.page * ACCT_PAGE, (acct.page + 1) * ACCT_PAGE);
    const stmts = S.all('statements').filter(function (s) { return s.memberId === id; }).sort(function (x, y) { return y.period.localeCompare(x.period); });
    const drift = Math.abs(r2(run) - r2(m.balance || 0)) > 0.01;
    const rn = renewalRows().find(function (x) { return x.m.id === id; }) || null;

    view.innerHTML = '<a class="bil-back" href="#/billing">' + Club.icon('chevronLeft') + 'Billing</a>' + ui.pageHeader({
      eyebrow: 'Member account · No. ' + m.memberNo, title: m.firstName + ' ' + m.lastName,
      subtitle: esc(t ? t.name : 'No tier') + ' · ' + esc(m.status === 'active' ? 'Active' : m.status) + (m.email ? ' · <a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' : ''),
      actions: '<a class="btn btn-ghost" href="#/members/' + esc(id) + '">' + Club.icon('user') + '<span>Profile</span></a>' + ui.btn('Record payment', { icon: 'cash', action: 'pay' }) + ui.btn('Post charge', { kind: 'primary', icon: 'plus', action: 'charge' })
    }) + statStrip([
      { label: 'Balance due', html: moneyCount(m.balance || 0, true), meta: a.credit > 0.005 && (m.balance || 0) < 0 ? 'Account in credit' : (a.pastDue > 0 ? '<span class="bil-bad">' + money(a.pastDue) + ' past due</span>' : 'Within terms') },
      { label: 'Current', html: money(a.current), meta: '0 to 30 days' },
      { label: '31-60 days', html: money(a.d30) },
      { label: '61-90 days', html: money(a.d60) },
      { label: '90+ days', html: '<span class="' + (a.d90 ? 'bil-bad' : '') + '">' + money(a.d90) + '</span>' }
    ], 'bil-stats-5') +
      (drift ? '<p class="bil-note bil-gap">The recorded balance differs from the ledger total of ' + money(run) + '.</p>' : '') +
      '<div class="grid grid-main-side bil-gap">' +
      '<section class="panel" data-reveal><div class="panel-head bil-wrap-head"><h3>Account activity</h3><select class="select bil-inline-select" name="acctPeriod" aria-label="Period"><option value="">All activity</option>' + ui.options(periods.map(function (k) { return { value: k, label: monthLabel(k) }; }), acct.period) + '</select></div><div class="panel-body flush">' +
      (shown.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Charge</th><th class="num">Payment</th><th class="num">Balance</th></tr></thead><tbody>' + shown.map(function (r) {
        return '<tr><td class="nowrap" title="' + esc(fmt.date(r.date)) + '">' + esc(fmt.dateShort(r.date)) + '</td><td>' + esc(r.description || '') + '</td><td class="nowrap">' + (r.kind === 'payment' ? ui.badge('Payment', 'good') : '<span class="ink-2">' + esc(r.category) + '</span>') + '</td><td class="num' + (r.kind === 'charge' && r.amount < 0 ? ' bil-credit' : '') + '">' + (r.kind === 'charge' ? money(r.amount) : '') + '</td><td class="num">' + (r.kind === 'payment' ? money(r.amount) : '') + '</td><td class="num ink-2">' + money(r.run) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + pager(allShown.length, acct.page, ACCT_PAGE, 'apage') : ui.empty({ icon: 'billing', title: 'No activity', text: 'Charges and payments for this member appear here.' })) + '</div></section>' +
      '<aside class="stack"><section class="panel" data-reveal><div class="panel-head"><h3>Statements</h3>' + ui.btn('Generate', { sm: true, action: 'gen-one', icon: 'billing' }) + '</div><div class="panel-body flush">' +
      (stmts.length ? '<ul class="list">' + stmts.map(function (s) {
        return '<li class="row between"><a class="bil-stack" href="#/billing/statement/' + esc(s.id) + '"><span class="person-name">' + esc(monthLabel(s.period)) + '</span><span class="person-sub">' + money(s.total) + ' · issued ' + esc(fmt.dateShort(s.issuedOn)) + '</span></a>' + ui.badge(stLabel(s.status), ST_KIND[s.status]) + '</li>';
      }).join('') + '</ul>' : ui.empty({ icon: 'billing', title: 'No statements yet', text: 'Generate a statement for the current month.' })) + '</div></section>' +
      receiptsPanel(id) +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Account</h3></div><div class="panel-body"><dl class="kv bil-kv"><dt>Tier</dt><dd>' + esc(t ? t.name : 'None') + '</dd><dt>Monthly dues</dt><dd>' + money(t ? t.annualDues / 12 : 0) + '</dd><dt>F&amp;B minimum</dt><dd>' + (t && t.monthlyMinimum ? money(t.monthlyMinimum) + ' a month' : 'None') + '</dd>' +
        '<dt>' + RENEW_SEASON + ' renewal</dt><dd>' + (rn && rn.r ? renewBadge(rn) + ' <span class="ink-2">' + esc(planText(rn)) + '</span>' : renewBadge({})) + '</dd><dt>Phone</dt><dd>' + esc(m.phone || 'Not recorded') + '</dd><dt>Address</dt><dd>' + esc(m.address || 'Not recorded') + '</dd></dl></div></section></aside></div>';

    runMoney(view);
    ui.on(view, 'click', '[data-action=charge]', function () { openPostCharge(id, rerender); });
    ui.on(view, 'click', '[data-action=pay]', function () { openRecordPayment(id, rerender); });
    ui.on(view, 'change', 'select[name=acctPeriod]', function (e, f) { acct.period = f.value; acct.page = 0; rerender(); });
    ui.on(view, 'click', '[data-action=apage]', function (e, b) { acct.page = +b.dataset.page; rerender(); });
    ui.on(view, 'click', '[data-receipt-open]', function (e, b) { Club.receipts.open(b.dataset.receiptOpen); });
    ui.on(view, 'click', '[data-action=rc-all]', function () { acct.rcAll = !acct.rcAll; rerender(); });
    ui.on(view, 'click', '[data-action=gen-one]', function () {
      const key = acct.period || curMonth();
      const ex = S.all('statements').find(function (s) { return s.memberId === id && s.period === key; });
      if (ex && ex.status !== 'draft') { go('billing/statement/' + ex.id); return; }
      const b = buildStatement(id, key, ex);
      if (!b) { ui.toast('No activity in ' + monthLabel(key) + ' to bill', 'bad'); return; }
      let back = [];
      const st = undoRun(function () { return ex ? S.update('statements', ex.id, b.doc) : S.insert('statements', Object.assign({ id: 'stm_' + key.replace('-', '') + '_' + id }, b.doc)); },
        { message: 'Statement for ' + monthLabel(key) + (ex ? ' refreshed' : ' created'), undone: ex ? 'Statement put back as it was' : 'Statement removed',
          after: function () { unlinkCharges(back); if (!ex && /^#\/billing\/statement\//.test(location.hash)) go('billing/' + id); else rerenderAfterUndo(); } });
      back = linkCharges(b.charges.filter(function (c) { return c.statementId !== st.id; }).map(function (c) { return [c, st.id]; }));
      go('billing/statement/' + st.id);
    });
  }

  /* ---------------- Register ---------------- */
  Club.register({
    id: 'billing', label: 'Billing & Statements', icon: 'billing', section: 'Membership', order: 20,
    badge: function () { const n = new Set(S.all('statements').filter(function (s) { return s.status === 'overdue'; }).map(function (s) { return s.memberId; })).size; return n || null; },
    search: function (q) {
      return S.all('statements').filter(function (s) { return (mname(s.memberId) + ' statement ' + monthLabel(s.period)).toLowerCase().indexOf(q) >= 0 && q.indexOf('statement') >= 0; }).slice(0, 4)
        .map(function (s) { return { label: 'Statement, ' + monthLabel(s.period), sub: mname(s.memberId) + ' · ' + fmt.money(s.total), href: 'billing/statement/' + s.id, icon: 'billing' }; });
    },
    render: function (view, params) {
      const p = params[0];
      if (p === 'statement') return renderStatement(view, params[1]);
      if (p && TABS.indexOf(p) >= 0) return renderMain(view, p);
      if (p) return renderAccount(view, p);
      return renderMain(view, 'overview');
    }
  });
})();
