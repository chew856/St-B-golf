/* Billing & Statements: receivables, ledger, dues runs, the F&B assessment, statements, member accounts, and the club's
   billing policies on the staff side (account standing, charge override, time payment follow-up, Refund dues).
   Owns collections: charges, payments, statements. Also exposes Club.billing helpers for other modules. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/billing-data.js */
  const { methodLabel, DUE_DAYS, r2, today, live, mkey, addMonths, monthName, monthEnd, sum, byDate, sweepOverdue, agingAll, agingFor, RENEW_SEASON, renewalFor } = Club.shared.billing;


  const CATS = ['Dues', 'Golf', 'Pro Shop', 'Dining', 'Events', 'Lessons', 'Other'];
  const METHODS = ['ACH', 'EFT', 'Card', 'Debit', 'Cash', 'Check'];
  const FNB_CAT = Club.shared.billing.FNB_CAT, TP = Club.shared.billing.TP;
  const fmtEn = Club.fmtEn || Club.fmt;   /* stored text stays English */
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
  /* Payment methods (the Time Payment Policy accepts EFT, cash, cheque, debit or credit card; pre-authorized debit is the
     club's usual monthly method). Stored values: ACH, EFT, Card (credit card), Debit, Cash, Check. */
  function methodOptions(sel) { return ui.options(METHODS.map(function (x) { return { value: x, label: x === 'Card' ? 'Credit card' : methodLabel(x) }; }), sel || 'ACH'); }
  /** The member's time payment plan, if any, with what is owed on it now. */
  function tpFor(memberId) {
    const RN = Club.billing.renewal, r = memberId ? RN.forMember(memberId) : null;
    return r && r.plan === 'monthly' ? { r: r, ps: RN.status(r) } : null;
  }
  function openRecordPayment(memberId, done, o) {
    o = o || {};
    const m = S.find('members', memberId);
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Member', name: 'memberId', type: 'select', required: true, span2: true, options: memberOptions(memberId) }) +
      ui.field({ label: 'Amount', name: 'amount', type: 'number', step: 0.01, min: 0.01, required: true, value: o.amount != null ? r2(o.amount) : (m && m.balance > 0 ? r2(m.balance) : '') }) +
      ui.field({ label: 'Date', name: 'date', type: 'date', value: today(), required: true }) +
      ui.field({ label: 'Method', name: 'method', type: 'select', options: methodOptions(o.method) }) +
      ui.field({ label: 'Reference', name: 'reference', placeholder: 'Cheque number or confirmation' }) +
      '<div class="span-2 bil-tp-host"></div>' +
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
          const tp = v.toward === 'plan' ? tpFor(v.memberId) : null;
          const fee = tp && v.method === 'Card' ? r2(amt * TP.CARD_FEE) : 0;
          const forSt = o.statement && v.memberId === o.statement.memberId;
          let stPaid = false;
          const p = undoRun(function () {
            const p0 = S.insert('payments', Object.assign({ memberId: v.memberId, date: v.date, amount: amt, method: v.method, reference: v.reference || '' }, tp ? { toward: 'tp-' + tp.r.id } : {}));
            S.update('members', v.memberId, { balance: r2((mem.balance || 0) - amt) });
            /* A statement is paid when this payment covers what is still owed on it, or earlier part payments and this one
               together cover its total; a part payment leaves it open. */
            if (forSt && (amt >= r2(o.amount || 0) - 0.005 || paidToward(o.statement) >= r2(o.statement.total || 0) - 0.005)) { stPaid = true; S.update('statements', o.statement.id, { status: 'paid', paidOn: v.date }); }
            paymentReceipt(p0, tp ? 'Toward the ' + RENEW_SEASON + ' time payment plan.' : null);
            /* Time Payment Policy: credit card payments are subject to a 1.5% processing fee, posted as its own line. */
            if (fee > 0) Club.chargeMember(v.memberId, { description: 'Credit card processing fee (1.5%) on a time payment of ' + fmtEn.money(amt), category: 'Dues', amount: fee, source: 'billing', refId: 'tpcard-' + p0.id, date: v.date,
              title: 'Credit card processing fee', lines: [{ name: 'Processing fee, 1.5% of a ' + fmtEn.money(amt) + ' credit card payment toward the ' + RENEW_SEASON + ' time payment plan', qty: 1, price: fee }] });
            return p0;
          }, { message: function () { return 'Payment of ' + fmt.money(amt) + ' recorded for ' + mname(v.memberId) + (tp ? ' toward the time payment plan' : '') + (fee > 0 ? '. Card fee of ' + fmt.money(fee) + ' added' : '') + (forSt ? (stPaid ? '. Statement marked paid' : '. Part payment: the statement stays open') : ''); },
            undone: function () { return 'Payment reversed. ' + fmt.money(amt) + ' is back on the balance' + (fee > 0 ? ' and the card fee is taken off' : '') + (stPaid ? ' and the statement is open again' : ''); }, after: rerenderAfterUndo });
          if (done) done(p);
        }
      }]
    });
    wireBalanceHint(api.el);
    /* "Apply to": shown when the member has a time payment plan. A credit card payment toward the plan adds the fee. */
    const form = ui.$('form', api.el), host = ui.$('.bil-tp-host', form);
    function drawTp() {
      const tp = tpFor(ui.$('select[name=memberId]', form).value);
      if (!tp) { host.innerHTML = ''; return; }
      const owed = tp.ps.owedNow, nx = tp.ps.next;
      host.innerHTML = '<div class="field"><span class="bil-field-label">Apply to</span><div class="bil-radio-row" role="radiogroup" aria-label="Apply to">' +
        '<label class="bil-radio"><input type="radio" name="toward" value="plan"' + (o.toward !== 'account' ? ' checked' : '') + '><span>' + RENEW_SEASON + ' time payment plan</span></label>' +
        '<label class="bil-radio"><input type="radio" name="toward" value="account"' + (o.toward === 'account' ? ' checked' : '') + '><span>Account balance</span></label></div>' +
        '<span class="field-hint">' + (owed > 0.005 ? esc(fmt.money(owed)) + ' due on the plan now' : nx ? 'Next payment ' + esc(fmt.money(nx.owed || nx.amount)) + ' due ' + esc(fmt.date(nx.date)) : 'Nothing due on the plan') + '</span></div>' +
        '<p class="bil-fee-hint" hidden></p>';
      fee();
    }
    function fee() {
      const h = ui.$('.bil-fee-hint', form); if (!h) return;
      const plan = ui.$('input[name=toward]:checked', form), method = ui.$('[name=method]', form).value, amt = +ui.$('[name=amount]', form).value || 0;
      const on = !!plan && plan.value === 'plan' && method === 'Card';
      h.hidden = !on;
      if (on) h.textContent = 'Credit card payments toward a time payment plan carry a 1.5% processing fee: ' + fmt.money(r2(amt * TP.CARD_FEE)) + ' will be added to the account as its own charge.';
    }
    ui.$('select[name=memberId]', form).addEventListener('change', drawTp);
    form.addEventListener('change', fee); form.addEventListener('input', fee);
    drawTp();
    return api;
  }

  /** The receipt for a payment staff recorded (Club.receipts; card numbers are not taken here, so the method reads 'Card'). */
  const RECEIPT_METHOD = { Card: 'card', Debit: 'card', Cash: 'cash' };
  function paymentReceipt(p, extraNote) {
    if (!Club.receipts) return null;
    try {
      return Club.receipts.create({ memberId: p.memberId, title: 'Account payment', lines: [{ name: 'Payment on account', qty: 1, price: p.amount }], total: p.amount,
        date: p.date, method: RECEIPT_METHOD[p.method] || 'other', methodLabel: methodLabel(p.method) || 'Other', source: 'billing', refId: p.id, paymentId: p.id,
        note: [p.reference ? 'Reference ' + p.reference : '', extraNote || ''].filter(Boolean).join('. ') || null,
        /* Recorded by staff at the office: the daily close (js/modules/accounting.js) counts card in the terminal batch. */
        tenders: [{ method: RECEIPT_METHOD[p.method] || 'other', amount: p.amount }], channel: 'counter' });
    } catch (e) { console.error('Receipt failed for payment ' + p.id, e); return null; }
  }
  /* The staff dialogs; the shared helpers above come from js/shared/billing-data.js */
  Object.assign(Club.billing, { postCharge: openPostCharge, recordPayment: openRecordPayment });

  /* ---------------- Billing policies on the staff site (the club's Membership Handbook) ----------------
     The rules live in js/shared/billing-data.js (Club.billing.standing, fnb, renewal, refunds). Here: badges, the staff
     charge override, the Refund dues dialog, card on file and the collections flags, the F&B assessment tab. */
  function staffName() { return Club.user ? (Club.user.firstName + ' ' + Club.user.lastName).trim() : null; }
  /** "Charging suspended, 75 days" badge (nothing for a member in good standing). */
  function standingBadge(st, withDays) {
    if (!st) return '';
    if (st.level) return ui.badge(st.label + (withDays ? ', ' + st.days + ' days' : ''), st.level >= 90 ? 'bad' : 'warn');
    if (st.tpArrears) return ui.badge('Golf suspended' + (withDays ? ', payment ' + st.tpArrears.days + ' days late' : ''), 'bad');
    return '';
  }
  /** Tills and dialogs call this before charging a member's account. True: go ahead. False: a dialog explains why and,
      for an unpaid account (not a suspended or resigned membership), lets staff allow charging for today with a reason
      (with Undo); proceed() runs once it is allowed. */
  function staffChargeGuard(memberId, proceed) {
    const chk = Club.billing.chargeCheck(memberId);
    if (chk.ok) return true;
    if (chk.hard) { ui.toast(chk.reason || 'This member cannot charge to their account. Take card or cash.', 'bad'); return false; }
    const st = chk.standing;
    const body = '<p class="ink-2 bil-guard-why">' + esc(st.reason) + '</p>' +
      '<p class="bil-fine">Club credit policy: charging is for members in good standing. You can take card or cash instead, or allow charging for the rest of today. The reason is kept on the member’s account.</p>' +
      '<form class="form-grid" novalidate>' + ui.field({ label: 'Reason for allowing it', name: 'reason', type: 'textarea', required: true, span2: true, placeholder: 'For example, the member paid by phone this morning' }) + '</form>';
    ui.modal({ title: 'Charging is suspended for ' + mname(memberId), eyebrow: st.label + ' · ' + st.days + ' days past the statement date', body: body, actions: [
      { label: 'Take card or cash', kind: 'ghost' },
      { label: 'Allow charging today', kind: 'primary', icon: 'check', onClick: function (a) {
        const form = ui.$('form', a.el); clearErrs(form);
        if (!ui.validate(form)) return false;
        const reason = ui.formData(form).reason;
        undoRun(function () { return Club.billing.allowCharging(memberId, reason, staffName()); },
          { message: 'Charging allowed for ' + mname(memberId) + ' for today', undone: 'Override withdrawn. Charging is suspended again', after: rerenderAfterUndo });
        if (proceed) setTimeout(proceed, 60);
      } }
    ] });
    return false;
  }

  /* ---------------- Refund dues ----------------
     Refund Policy: $50.00 administrative fee on all refunds of golf dues; written requests before May 31; after May 31
     only by Board review (a medical note or proof of moving out of province may be required), and the Board may grant a
     two-month credit toward the next season. Each part posts with its own receipt; one Undo takes it all back. */
  function openRefund(memberId, done) {
    const m = S.find('members', memberId); if (!m) { ui.toast('That member could not be found', 'bad'); return; }
    const RF = Club.billing.refunds, t = S.find('membershipTiers', m.tierId);
    const thisYear = +today().slice(0, 4);
    const seasons = [RENEW_SEASON, thisYear].filter(function (y, i, a) { return a.indexOf(y) === i; });
    const info = {}; seasons.forEach(function (y) { info[y] = RF.duesFor(memberId, y); });
    const pick = seasons.find(function (y) { return info[y].charged - info[y].refunded > 0.005; }) || seasons[0];
    const twoMonths = t ? r2(t.annualDues * 2 / 12) : 0;
    const body = '<form class="form-grid bil-refund" novalidate>' +
      ui.field({ label: 'Membership year', name: 'season', type: 'select', options: ui.options(seasons.map(function (y) { return { value: String(y), label: y + ' dues · ' + fmt.money(r2(info[y].charged - info[y].refunded)) + ' to refund' }; }), String(pick)) }) +
      ui.field({ label: 'Amount of dues to refund', name: 'amount', type: 'number', step: 0.01, min: 0, required: true, value: r2(Math.max(0, info[pick].charged - info[pick].refunded)) }) +
      '<div class="field span-2"><label class="check bil-check"><input type="checkbox" name="writing"><span>Request received in writing</span></label></div>' +
      ui.field({ label: 'Date the written request was received', name: 'receivedOn', type: 'date', value: today(), required: true }) +
      ui.field({ label: 'How it goes back to the member', name: 'payback', type: 'select', options: ui.options([{ value: 'account', label: 'Leave as a credit on the account' }, { value: 'Check', label: 'Paid back by cheque' }, { value: 'EFT', label: 'Paid back by EFT' }, { value: 'Card', label: 'Refunded to a credit card' }], 'account') }) +
      '<div class="span-2 bil-refund-when"></div>' +
      '<div class="span-2 bil-refund-board" hidden>' +
        '<label class="check bil-check"><input type="checkbox" name="board"><span>Approved by the Board of Directors</span></label>' +
        ui.field({ label: 'Board decision and reason', name: 'boardReason', type: 'textarea', placeholder: 'For example, medical note received; moving out of province' }) +
        '<label class="check bil-check"><input type="checkbox" name="credit2m"><span class="bil-2m-label">The Board also granted a two-month credit toward the ' + (pick + 1) + ' season</span></label>' +
        ui.field({ label: 'Two-month credit', name: 'credit2mAmount', type: 'number', step: 0.01, min: 0, value: twoMonths, hint: 'Two twelfths of this year’s ' + (t ? t.name : '') + ' dues. Change it if the Board set another amount.' }) +
      '</div>' +
      '<div class="span-2 bil-refund-sum" aria-live="polite"></div></form>';
    const api = ui.modal({ title: 'Refund dues', eyebrow: mname(memberId) + ' · No. ' + m.memberNo, body: body, size: 'lg', actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Record refund', kind: 'primary', icon: 'check', onClick: function (a) { return submit(a); } }
    ] });
    const form = ui.$('form', api.el);
    function q(n) { return form.querySelector('[name="' + n + '"]'); }
    function state() {
      const v = ui.formData(form), season = +v.season, dl = RF.deadline(season);
      const max = r2(info[season].charged - info[season].refunded);
      const late = !!v.receivedOn && v.receivedOn > dl;
      const amt = r2(+v.amount || 0), fee = amt > 0 ? RF.FEE : 0, credit = late && v.credit2m ? r2(+v.credit2mAmount || 0) : 0;
      return { v: v, season: season, dl: dl, max: max, late: late, amt: amt, fee: fee, credit: credit, net: r2(amt - fee) };
    }
    function paint() {
      const x = state();
      ui.$('.bil-refund-when', form).innerHTML = x.v.receivedOn ? (x.late
        ? '<p class="bil-warn-box">' + Club.icon('info') + '<span>Received after May 31, ' + x.season + '. The policy allows no refunds after May 31; the Board of Directors reviews later requests one by one (a medical note or proof of moving out of province may be required). Record it only once the Board has approved it.</span></p>'
        : '<p class="bil-ok-box">' + Club.icon('check') + '<span>Received before the May 31, ' + x.season + ' deadline. The $50.00 administrative fee applies to all refunds of golf dues, even if no golf has been played.</span></p>') : '';
      ui.$('.bil-refund-board', form).hidden = !x.late;
      ui.$('.bil-2m-label', form).textContent = 'The Board also granted a two-month credit toward the ' + (x.season + 1) + ' season';
      ui.$('.bil-refund-sum', form).innerHTML = '<dl class="bil-refund-dl"><div><dt>Dues refunded</dt><dd>' + money(x.amt) + '</dd></div><div><dt>Administrative fee</dt><dd>' + (x.fee ? '-' + money(x.fee) : money(0)) + '</dd></div>' +
        (x.credit ? '<div><dt>Two-month credit toward ' + (x.season + 1) + '</dt><dd>' + money(x.credit) + '</dd></div>' : '') +
        '<div class="bil-refund-total"><dt>' + (x.v.payback === 'account' ? 'Credited to the account' : 'Paid back to the member') + '</dt><dd>' + money(x.net + (x.v.payback === 'account' ? x.credit : 0)) + '</dd></div></dl>' +
        '<p class="field-hint">Dues charged for ' + x.season + ': ' + esc(fmt.money(info[x.season].charged)) + (info[x.season].refunded ? ', already refunded ' + esc(fmt.money(info[x.season].refunded)) : '') + '.</p>';
    }
    form.addEventListener('input', paint); form.addEventListener('change', function (e) {
      if (e.target.name === 'season') { const y = +e.target.value; q('amount').value = r2(Math.max(0, info[y].charged - info[y].refunded)); }
      paint();
    });
    paint();
    /* A checkbox's message goes under its whole label, not inside it. */
    function checkErr(name, msg) { const f = q(name); if (!f) return; f.classList.add('invalid'); f.closest('label').insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
    function submit(a) {
      clearErrs(form);
      const x = state(); let ok = ui.validate(form);
      if (!x.v.writing) { checkErr('writing', 'Refund requests must be received in writing. Tick this once you have it.'); ok = false; }
      if (x.v.receivedOn && x.v.receivedOn > today()) { setErr(form, 'receivedOn', 'The request cannot be dated in the future.'); ok = false; }
      if (!(x.amt >= 0) || x.amt > x.max + 0.005) { setErr(form, 'amount', 'Enter an amount up to the ' + fmt.money(x.max) + ' of dues not yet refunded.'); ok = false; }
      else if (x.amt > 0 && x.amt <= RF.FEE) { setErr(form, 'amount', 'The refund must be more than the $50.00 administrative fee.'); ok = false; }
      else if (!x.amt && !x.credit) { setErr(form, 'amount', 'Enter the dues to refund.'); ok = false; }
      if (x.late) {
        if (!x.v.board) { checkErr('board', 'After May 31 a refund needs the Board’s approval.'); ok = false; }
        if (!String(x.v.boardReason || '').trim()) { setErr(form, 'boardReason', 'Record the Board’s decision and reason.'); ok = false; }
      }
      if (x.v.payback !== 'account' && dayClosed(today())) { setErr(form, 'payback', closedMsg(today())); ok = false; }
      if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
      const season = x.season, tierName = t ? t.name : 'Membership';
      const board = x.late ? ' (Board approved)' : '';
      undoRun(function () {
        const ids = [];
        let pay = null;
        if (x.amt > 0) {
          const cr = Club.chargeMember(memberId, { description: 'Refund of ' + season + ' dues, ' + tierName + ' membership' + board, category: 'Dues', amount: -x.amt, source: 'billing', refId: 'refund-' + season, title: 'Dues refund',
            lines: [{ name: 'Refund of ' + season + ' dues, ' + tierName + ' membership' + board + '. Request received in writing ' + fmtEn.date(x.v.receivedOn), qty: 1, price: x.amt }] });
          const fe = Club.chargeMember(memberId, { description: 'Administrative fee, refund of ' + season + ' dues', category: 'Dues', amount: RF.FEE, source: 'billing', refId: 'refund-' + season, title: 'Refund administrative fee',
            lines: [{ name: 'Administrative fee on all refunds of golf dues', qty: 1, price: RF.FEE }] });
          if (cr) ids.push(cr.id); if (fe) ids.push(fe.id);
        }
        if (x.credit > 0) {
          const c2 = Club.chargeMember(memberId, { description: 'Two-month credit toward the ' + (season + 1) + ' season (Board approved)', category: 'Dues', amount: -x.credit, source: 'billing', refId: 'refund-' + season, title: 'Board credit',
            lines: [{ name: 'Two-month credit toward the ' + (season + 1) + ' season, granted by the Board of Directors', qty: 1, price: x.credit }] });
          if (c2) ids.push(c2.id);
        }
        if (x.v.payback !== 'account' && x.net > 0) {
          const mem = S.find('members', memberId);
          pay = S.insert('payments', { memberId: memberId, date: today(), amount: -x.net, method: x.v.payback, reference: 'Dues refund paid back' });
          S.update('members', memberId, { balance: r2((mem.balance || 0) + x.net) });
          if (Club.receipts) Club.receipts.create({ memberId: memberId, kind: 'credit', title: 'Dues refund paid', lines: [{ name: 'Refund of ' + season + ' dues, less the administrative fee', qty: 1, price: x.net }], total: x.net,
            method: RECEIPT_METHOD[x.v.payback] || 'other', methodLabel: x.v.payback === 'Card' ? 'Refunded to a credit card' : methodLabel(x.v.payback), source: 'billing', refId: pay.id, paymentId: pay.id, channel: 'counter' });
        }
        return S.insert('dueRefunds', { memberId: memberId, season: season, refund: x.amt, fee: x.fee, receivedOn: x.v.receivedOn, inTime: !x.late,
          board: x.late ? { reason: String(x.v.boardReason).trim() } : null, credit2m: x.credit || 0, payback: x.v.payback === 'account' ? null : { method: x.v.payback, paymentId: pay ? pay.id : null },
          chargeIds: ids, by: staffName() });
      }, { message: function () { return 'Refund recorded for ' + mname(memberId) + ': ' + fmt.money(x.amt) + ' less the ' + fmt.money(x.fee) + ' fee' + (x.credit ? ', plus a ' + fmt.money(x.credit) + ' credit' : ''); },
        undone: 'Refund taken back. The dues are on the account again', after: rerenderAfterUndo });
      if (done) done();
    }
    return api;
  }

  /* ---------------- Card on file and the collections flags (staff notes, not automated) ---------------- */
  function toggleCardOnFile(memberId) {
    const m = S.find('members', memberId); if (!m) return;
    const on = !m.cardOnFile;
    undoRun(function () { S.update('members', memberId, { cardOnFile: on, cardOnFileOn: on ? today() : null }); },
      { message: on ? 'Card on file with the club: yes' : 'Card on file with the club: no', undone: 'Card on file put back as it was', after: rerenderAfterUndo });
  }
  function toggleFlag(memberId, key) {
    const m = S.find('members', memberId); if (!m) return;
    const f = Object.assign({ perpetual: null, yearEnd: null, note: '' }, m.arFlags || {});
    const on = !f[key]; f[key] = on ? today() : null;
    const label = key === 'perpetual' ? 'Perpetual delinquency' : 'In arrears at year end';
    undoRun(function () { S.update('members', memberId, { arFlags: f }); }, { message: label + (on ? ' flagged' : ' cleared') + ' for ' + mname(memberId), undone: label + ' put back as it was', after: rerenderAfterUndo });
  }
  function flagBadges(m) {
    const f = Club.billing.arFlags(m);
    return (f.perpetual ? ui.badge('Perpetual delinquency', 'bad') : '') + (f.yearEnd ? ui.badge('In arrears at year end', 'bad') : '');
  }

  /* ---------------- F&B credit (one member) ---------------- */
  function fnbLine(fs) {
    if (!fs.applies && !fs.assessed) return 'Not charged for this category';
    if (!fs.assessed) return fs.status === 'ended' ? 'No ' + fs.year + ' assessment on file' : fs.year + ' assessment not charged yet';
    if (fs.status === 'ended') return money(fs.used) + ' used of ' + money(fs.assessed) + (fs.expired > 0.005 ? ', ' + money(fs.expired) + ' expired ' + esc(fmt.dateShort(fs.end)) : '');
    return money(fs.left) + ' left of ' + money(fs.assessed) + ', until ' + esc(fmt.dateShort(fs.end));
  }
  function fnbPanel(m) {
    const F = Club.billing.fnb, fs = F.state(m.id);
    if (!fs.applies && !fs.assessed) return '';
    const pct = fs.assessed ? Math.min(100, fs.used / fs.assessed * 100) : 0;
    return '<section class="panel bil-fnb-card" data-reveal><div class="panel-head"><div><div class="eyebrow">' + fs.year + ' season, ' + esc(Club.season.dayLabel()) + '</div><h3>F&amp;B credit</h3></div>' + (fs.status === 'ended' ? ui.badge('Season ended', 'outline') : fs.status === 'open' ? ui.badge('In season', 'good') : '') + '</div><div class="panel-body">' +
      '<div class="bil-fnb-figs"><div><span class="bil-sum-label">Used</span><strong>' + money(fs.used) + '</strong></div><div><span class="bil-sum-label">' + (fs.status === 'ended' ? 'Expired' : 'Left') + '</span><strong>' + money(fs.status === 'ended' ? fs.expired : fs.left) + '</strong></div><div><span class="bil-sum-label">Assessment</span><strong>' + money(fs.assessed) + '</strong></div></div>' +
      '<div class="bar" role="progressbar" aria-label="F&amp;B credit used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '"><span style="width:' + Math.max(fs.used ? 2 : 0, pct) + '%"></span></div>' +
      '<p class="bil-fine">' + esc(fnbLine(fs).replace(/<[^>]+>/g, '')) + '. Dining, takeout and beverage cart charges in the season are paid from it first; service charges and gratuities are not. It cannot be transferred and does not carry over.</p>' +
      (fs.next ? '<p class="bil-fine">The ' + (fs.year + 1) + ' assessment of ' + money(fs.amount) + ' is charged on ' + esc(fmt.date(fs.next)) + '.</p>' : '') +
      (fs.applies && !fs.assessed && fs.status !== 'ended' ? ui.btn('Charge ' + fs.year + ' assessment', { sm: true, action: 'fnb-post', icon: 'plus' }) : '') +
      '</div></section>';
  }
  /* ---------------- Account standing (one member) ---------------- */
  function standingPanel(m) {
    const st = Club.billing.standing(m.id), ov = Club.billing.overrideFor(m.id), f = Club.billing.arFlags(m);
    const ok = !st.level && !st.tpArrears && m.status === 'active';
    const lines = [['Charging', st.canCharge], ['Tee times and golf', st.canBook], ['Clubhouse, locker room and amenities', st.canClubhouse]];
    return '<section class="panel bil-standing" data-reveal><div class="panel-head"><div><div class="eyebrow">Credit policy</div><h3>Account standing</h3></div>' + (ok ? ui.badge('Good standing', 'good') : standingBadge(st, true) || ui.badge(st.label, 'bad')) + '</div><div class="panel-body">' +
      (st.reason ? '<p class="bil-standing-why">' + esc(st.reason) + '</p>' : '<p class="bil-fine">Nothing is unpaid 60 days or more after a statement date.</p>') +
      '<ul class="bil-priv">' + lines.map(function (l) { return '<li><span>' + esc(l[0]) + '</span>' + (l[1] ? ui.badge('Allowed', 'good') : ui.badge('Suspended', 'bad')) + '</li>'; }).join('') + '</ul>' +
      (ov ? '<p class="bil-fine">Charging allowed today by ' + esc(ov.by || 'staff') + ': ' + esc(ov.reason) + '</p>' : (!st.canCharge && m.status === 'active' ? ui.btn('Allow charging today', { sm: true, action: 'allow-charge', icon: 'check' }) : '')) +
      '<div class="divider"></div>' +
      '<label class="check bil-check"><input type="checkbox" data-action="card-on-file"' + (m.cardOnFile ? ' checked' : '') + '><span>Card on file with the club' + (m.cardOnFile && m.cardOnFileOn ? ' <span class="muted">(since ' + esc(fmt.dateShort(m.cardOnFileOn)) + ')</span>' : '') + '</span></label>' +
      '<p class="bil-fine">The club keeps the card itself; this site never stores card details.</p>' +
      '<label class="check bil-check"><input type="checkbox" data-action="flag" data-flag="perpetual"' + (f.perpetual ? ' checked' : '') + '><span>Perpetual delinquency</span></label>' +
      '<p class="bil-fine">No charging once the F&amp;B assessment is used up, and no time payment plan in future.</p>' +
      '<label class="check bil-check"><input type="checkbox" data-action="flag" data-flag="yearEnd"' + (f.yearEnd ? ' checked' : '') + '><span>In arrears at year end</span></label>' +
      '<p class="bil-fine">The account may go to collections and the share be forfeited, its value applied to the balance; the member stays liable for any balance above the share.</p>' +
      '</div></section>';
  }
  /* ---------------- Time payment plan (one member) ---------------- */
  const TP_STATE = { paid: ['Paid', 'good'], scheduled: ['Scheduled', 'outline'], due: ['Due today', 'info'], missed: ['Missed', 'warn'], arrears: ['30 days in arrears', 'bad'], legacy: ['On account', 'plain'] };
  function tpPanel(m) {
    const tp = tpFor(m.id); if (!tp) return '';
    const missed = tp.ps.missed;
    return '<section class="panel bil-tp" data-reveal><div class="panel-head"><div><div class="eyebrow">' + RENEW_SEASON + ' dues</div><h3>Time payment plan</h3></div>' + (missed.length ? ui.badge(missed.length + ' missed', 'bad') : ui.badge('Up to date', 'good')) + '</div>' +
      (missed.length ? '<p class="bil-note">' + (m.cardOnFile ? 'Charge the card on file for the missed payment, then record it here.' : 'No card on file: call the member about the missed payment.') + '</p>' : '') +
      '<div class="panel-body flush"><ul class="list bil-tp-list">' + tp.ps.rows.map(function (x) {
        const s = TP_STATE[x.state] || ['', 'plain'];
        return '<li class="row between"><span class="bil-stack"><span class="person-name">' + (x.state === 'legacy' ? 'Instalment ' : 'Payment ') + x.n + ' · ' + esc(fmt.dateShort(x.date)) + '</span><span class="person-sub">' + money(x.amount) + (x.owed > 0.005 && x.owed < x.amount ? ', ' + money(x.owed) + ' still owed' : '') + (x.late ? ', ' + x.late + ' days late' : '') + '</span></span>' + ui.badge(s[0], s[1]) + '</li>';
      }).join('') + '</ul>' +
      (tp.r.adminFee ? '<p class="bil-fine bil-tp-foot">Administration fee ' + money(tp.r.adminFee.amount) + ' charged when the plan was taken. All dues paid in full by August 15, ' + RENEW_SEASON + '.</p>' : '<p class="bil-fine bil-tp-foot">All dues paid in full by August 15, ' + RENEW_SEASON + '.</p>') +
      '</div></section>';
  }

  /* ---------------- F&B assessment tab ---------------- */
  let fnbTabYear = null;
  function tabFnb(p) {
    p = fresh(p); panels.fnb = p;
    const F = Club.billing.fnb, cur = F.year(), years = [cur + 1, cur];
    if (!fnbTabYear || years.indexOf(fnbTabYear) < 0) fnbTabYear = cur;
    const y = fnbTabYear;
    const rows = S.all('members').filter(function (m) { return m.status !== 'resigned' && (F.applies(m) || F.has(m.id, y)); }).map(function (m) { return { m: m, t: S.find('membershipTiers', m.tierId), fs: F.state(m.id, y) }; })
      .sort(function (a, b) { return a.m.lastName.localeCompare(b.m.lastName) || a.m.firstName.localeCompare(b.m.firstName); });
    const assessed = rows.filter(function (x) { return x.fs.assessed > 0; });
    const tot = function (k) { return r2(sum(assessed, function (x) { return x.fs[k]; })); };
    const toPost = F.toPost(y), sample = F.state('', y);
    const ended = sample.status === 'ended';
    const excluded = S.all('membershipTiers').filter(function (t) { return !F.tierApplies(t); }).map(function (t) { return t.name; });
    p.innerHTML = statStrip([
      { label: 'Assessed for ' + y, html: '<span data-count="' + assessed.length + '">0</span>', meta: moneyCount(tot('assessed')) + ' pre-paid' },
      { label: 'Credit used', html: moneyCount(tot('used')), meta: 'Dining, takeout and the beverage cart' },
      { label: ended ? 'Expired ' + fmt.dateShort(sample.end) : 'Credit left', html: moneyCount(ended ? tot('expired') : tot('left')), meta: ended ? 'Not transferable, no carry-over' : 'Until ' + fmt.date(sample.end) },
      { label: 'Not charged yet', html: '<span data-count="' + toPost.length + '">0</span>', meta: 'Active adult members' }
    ]) +
      '<section class="panel bil-gap" data-reveal><div class="panel-head bil-wrap-head"><div><div class="eyebrow">Food and Beverage Assessment</div><h3>' + y + ' season, ' + esc(Club.season.dayLabel()) + '</h3></div><div class="row wrap">' +
      '<select class="select bil-inline-select" name="fnbYear" aria-label="Season">' + ui.options(years.map(function (k) { return { value: String(k), label: k + ' season' }; }), String(y)) + '</select>' +
      (toPost.length && !ended ? ui.btn('Charge ' + y + ' assessments (' + toPost.length + ')', { kind: 'primary', icon: 'check', action: 'fnb-post-all' }) : '') + '</div></div>' +
      '<p class="bil-note">Every adult member pre-pays ' + esc(fmt.money(F.amount())) + ' each season, set up as a credit on the account. Food and drink charged in the clubhouse or from the beverage cart is paid from it first; gratuities and service charges are not. It cannot be transferred, and what is left on ' + esc(fmt.dateShort(sample.end)) + ' expires. ' +
      (excluded.length ? esc(excluded.join(', ')) + ' members are not charged. ' : '') + 'It is charged automatically on opening day. Reports count the food and drink when bought, not the assessment.</p>' +
      '<div class="panel-body flush">' + (rows.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Category</th><th class="num">Assessment</th><th class="num">Used</th><th class="bil-prog-th">Credit</th><th class="num">' + (ended ? 'Expired' : 'Left') + '</th></tr></thead><tbody>' + rows.map(function (x) {
        const pct = x.fs.assessed ? Math.min(100, x.fs.used / x.fs.assessed * 100) : 0;
        return '<tr class="clickable" data-href="billing/' + esc(x.m.id) + '"><td class="primary-cell">' + esc(x.m.lastName + ', ' + x.m.firstName) + '</td><td>' + esc(x.t ? x.t.name : '') + '</td>' +
          '<td class="num">' + (x.fs.assessed ? money(x.fs.assessed) : '<span class="muted">Not charged</span>') + '</td><td class="num">' + money(x.fs.used) + '</td>' +
          '<td><div class="bar' + (pct >= 100 ? '' : ' brass') + '"><span style="width:' + pct + '%"></span></div></td><td class="num">' + money(ended ? x.fs.expired : x.fs.left) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : ui.empty({ icon: 'dining', title: 'No adult members', text: 'The assessment applies to adult categories.' })) + '</div></section>';
    runMoney(p);
    ui.on(p, 'change', 'select[name=fnbYear]', function (e, f) { fnbTabYear = +f.value; tabFnb(p); p = panels.fnb; ui.animateIn(p); });
    ui.on(p, 'click', '[data-action=fnb-post-all]', function (e, b) {
      ui.confirm({ title: 'Charge the ' + y + ' F&B assessment?', text: toPost.length + ' active adult members will each be charged ' + fmt.money(F.amount()) + ', ' + fmt.money(F.amount() * toPost.length) + ' in total, set up as their ' + y + ' F&B credit. Each gets a receipt.', confirmLabel: 'Charge ' + toPost.length + ' members' }).then(function (yes) {
        if (!yes) return;
        b.disabled = true; let n = 0;
        undoRun(function () { toPost.forEach(function (m) { if (F.post(m.id, y).charge) n++; }); }, { message: function () { return y + ' F&B assessment charged to ' + n + ' members'; }, undone: y + ' F&B assessments reversed', after: rerenderAfterUndo });
        tabFnb(p); p = panels.fnb; ui.animateIn(p);
      });
    });
  }

  /* ---------------- Overview: standing and time payment follow-up ---------------- */
  function policyPanels() {
    const all = Club.billing.standingAll();
    const hit = Object.keys(all).filter(function (id) { const s = all[id]; return s.level || s.tpArrears; }).sort(function (a, b) { return all[b].level - all[a].level || all[b].days - all[a].days; });
    const n = function (lv) { return hit.filter(function (id) { return all[id].level === lv; }).length; };
    const tasks = Club.billing.renewal.tasks();
    const flagged = S.all('members').filter(function (m) { const f = Club.billing.arFlags(m); return f.perpetual || f.yearEnd; });
    const row = function (id) {
      const s = all[id], m = S.find('members', id);
      return '<tr class="clickable" data-href="billing/' + esc(id) + '"><td>' + ui.person(mname(id), m ? 'No. ' + esc(m.memberNo) + (m.status !== 'active' ? ' · ' + esc(m.status) : '') : '', 'sm') + '</td><td>' + standingBadge(s) + '</td><td class="num">' + (s.level ? s.days : s.tpArrears.days) + '</td><td class="num">' + money(s.level ? s.amount : s.tpArrears.amount) + '</td></tr>';
    };
    return '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Credit policy</div><h3>Account standing</h3></div><span class="muted">' + hit.length + ' accounts</span></div>' +
      '<p class="bil-note">From the statement date: 60 days, charging suspended; 90 days, tee times and golf too; 120 days, all privileges. A time payment 30 days late suspends tee times and golf.</p>' +
      '<div class="bil-lv">' + [[60, 'Charging suspended'], [90, 'Golf suspended'], [120, 'All privileges suspended']].map(function (x) { return '<div class="bil-lv-box' + (n(x[0]) ? ' warn' : '') + '"><span class="bil-lv-n">' + n(x[0]) + '</span><span class="bil-lv-l">' + esc(x[1]) + '</span><span class="bil-lv-s">' + x[0] + '+ days</span></div>'; }).join('') + '</div>' +
      '<div class="panel-body flush">' + (hit.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Standing</th><th class="num">Days</th><th class="num">Unpaid</th></tr></thead><tbody>' + hit.map(row).join('') + '</tbody></table></div>' : ui.empty({ icon: 'check', title: 'Everyone is in good standing', text: 'No account is 60 days past a statement date.' })) +
      (flagged.length ? '<div class="bil-flagged"><div class="eyebrow">Staff flags</div><ul class="list">' + flagged.map(function (m) { return '<li class="row between"><a href="#/billing/' + esc(m.id) + '">' + esc(mname(m.id)) + '</a><span class="row wrap">' + flagBadges(m) + '</span></li>'; }).join('') + '</ul></div>' : '') +
      '</div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">' + RENEW_SEASON + ' dues</div><h3>Time payment follow-up</h3></div><span class="muted">' + tasks.length + ' to do</span></div><div class="panel-body flush">' +
      (tasks.length ? '<ul class="list bil-tasks">' + tasks.map(function (k) {
        if (k.kind === 'nocard') return '<li class="bil-task"><a class="bil-stack" href="#/billing/' + esc(k.m.id) + '"><span class="person-name">Get a card on file: ' + esc(mname(k.m.id)) + '</span><span class="person-sub">Time payment plan with no card on file with the club</span></a>' + ui.badge('No card', 'warn') + '</li>';
        return '<li class="bil-task"><a class="bil-stack" href="#/billing/' + esc(k.m.id) + '"><span class="person-name">' + (k.card ? 'Charge the card on file: ' : 'Call about a missed payment: ') + esc(mname(k.m.id)) + '</span><span class="person-sub">Payment ' + k.row.n + ', ' + esc(fmt.money(k.row.owed)) + ' due ' + esc(fmt.dateShort(k.row.date)) + ', ' + k.row.late + ' days late</span></a>' +
          '<button type="button" class="btn btn-sm" data-action="tp-pay" data-id="' + esc(k.m.id) + '" data-amount="' + k.row.owed + '">' + Club.icon('card') + '<span>' + (k.card ? 'Record card payment' : 'Record payment') + '</span></button></li>';
      }).join('') + '</ul>' : ui.empty({ icon: 'check', title: 'Nothing to follow up', text: 'Every time payment is on time and has a card on file.' })) + '</div></section>';
  }

  Object.assign(Club.billing, { staffChargeGuard: staffChargeGuard, refundDues: openRefund, standingBadge: standingBadge, fnbLine: fnbLine });

  /* ---------------- Main page with tabs ---------------- */
  const TABS = ['overview', 'ledger', 'dues', 'fnb', 'statements', 'renewals'];
  const LEDGER_PAGE = 25, ST_PAGE = 20, ACCT_PAGE = 20;
  const lf = { member: '', category: '', source: '', type: 'all', from: '', to: '', q: '', page: 0 };
  const sf = { period: '', status: '', page: 0 };

  function renderMain(view, tab) {
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Membership', title: 'Billing & Statements',
      subtitle: 'House accounts, dues and monthly statements for ' + S.all('members').filter(function (m) { return m.status !== 'resigned'; }).length + ' members.',
      actions: ui.btn('Record payment', { icon: 'cash', action: 'pay' }) + ui.btn('Post charge', { kind: 'primary', icon: 'plus', action: 'charge' })
    }) + '<div class="bil-tabs"></div>';
    ui.tabs(ui.$('.bil-tabs', view), [
      { id: 'overview', label: 'Overview', render: tabOverview },
      { id: 'ledger', label: 'Ledger', render: tabLedger },
      { id: 'fnb', label: 'F&B assessment', render: tabFnb },
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
    const byMethod = METHODS.map(function (mth) { return { label: methodLabel(mth), value: r2(sum(pays.filter(function (x) { return x.method === mth; }), function (x) { return x.amount; })) }; })
      .filter(function (x, i) { return x.value > 0 || ['ACH', 'Card', 'Check'].indexOf(METHODS[i]) >= 0; });

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
      policyPanels() +
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
    ui.on(p, 'click', '[data-action=tp-pay]', function (e, b) { openRecordPayment(b.dataset.id, rerender, { amount: +b.dataset.amount, method: 'Card', toward: 'plan' }); });
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
      '<select class="select" name="category" aria-label="Category"><option value="">All categories</option>' + ui.options(CATS.concat([FNB_CAT]), lf.category) + '</select>' +
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

  /* The monthly "Dues run" (1/12 of dues on the 1st) was removed (owner, Nov 20): dues are paid in full or on the
     handbook's time payment plan (renewals). Past demo instalment charges stay in the ledger as history. */

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
    return x.r.plan === 'monthly' ? 'Time payment, ' + x.paidN + ' of ' + x.r.schedule.length + ' posted' : 'Paid in full';
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
          D.note('The time payment plan spreads the year’s dues in equal payments due on the 15th of each month until August 15, ' + RENEW_SEASON + ', after a $50 administration fee.') };
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
        { label: 'On time payment', value: monthly, meta: (done.length - monthly) + ' paid in full' },
        { label: RENEW_SEASON + ' dues posted', value: posted, prefix: '$', decimals: 2, meta: fmt.money(left) + ' still scheduled' }
      ]), ['renewed', 'pending', 'plans', 'posted']) +
        '<section class="panel bil-gap" data-reveal><div class="panel-head bil-wrap-head"><div><div class="eyebrow">' + RENEW_SEASON + ' season</div><h3>Renewal status</h3></div>' +
          ui.segmented([{ value: 'all', label: 'All (' + rows.length + ')' }, { value: 'renewed', label: 'Renewed (' + done.length + ')' }, { value: 'pending', label: 'Not yet (' + pending.length + ')' }], rnf.show, 'rnshow') + '</div>' +
        '<p class="bil-note">Members renew from My account in the members’ portal: in full, or on the time payment plan (members in good standing; $50 administration fee; payments due the 15th of each month; all dues paid by August 15, ' + RENEW_SEASON + '). Dues amounts in this demo are placeholders.</p>' +
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
      '<footer class="bil-sheet-foot"><p class="bil-sheet-thanks">Thank you for being part of ' + esc(info.name) + '. We look forward to seeing you at the club.</p><p>Please remit by ' + (s.dueOn ? esc(fmt.date(s.dueOn)) : 'return') + '. The balance is due on receipt of this statement and is to be paid in full by the last day of the month. Time payment plans: payments are due on the 15th of each month, and all dues are paid in full by August 15. Questions about your house account may be directed to the Controller at <span class="nowrap">' + esc(info.phone) + ' ext. 202</span>.</p></footer>' +
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
    const stHead = standingBadge(Club.billing.standing(id), true), fs = Club.billing.fnb.state(id);

    view.innerHTML = '<a class="bil-back" href="#/billing">' + Club.icon('chevronLeft') + 'Billing</a>' + ui.pageHeader({
      eyebrow: 'Member account · No. ' + m.memberNo, title: m.firstName + ' ' + m.lastName,
      subtitle: esc(t ? t.name : 'No tier') + ' · ' + esc(m.status === 'active' ? 'Active' : m.status) + (m.email ? ' · <a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' : '') +
        (stHead || flagBadges(m) ? ' <span class="bil-head-badges">' + stHead + flagBadges(m) + '</span>' : ''),
      actions: '<a class="btn btn-ghost" href="#/members/' + esc(id) + '">' + Club.icon('user') + '<span>Profile</span></a>' + ui.btn('Refund dues', { icon: 'refresh', action: 'refund' }) + ui.btn('Record payment', { icon: 'cash', action: 'pay' }) + ui.btn('Post charge', { kind: 'primary', icon: 'plus', action: 'charge' })
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
      standingPanel(m) + tpPanel(m) + fnbPanel(m) +
      receiptsPanel(id) +
      '<section class="panel" data-reveal><div class="panel-head"><h3>Account</h3></div><div class="panel-body"><dl class="kv bil-kv"><dt>Tier</dt><dd>' + esc(t ? t.name : 'None') + '</dd><dt>Monthly dues</dt><dd>' + money(t ? t.annualDues / 12 : 0) + '</dd><dt>F&amp;B credit</dt><dd>' + fnbLine(fs) + '</dd><dt>Card on file</dt><dd>' + (m.cardOnFile ? 'Yes, with the club' : 'No') + '</dd>' +
        '<dt>' + RENEW_SEASON + ' renewal</dt><dd>' + (rn && rn.r ? renewBadge(rn) + ' <span class="ink-2">' + esc(planText(rn)) + '</span>' : renewBadge({})) + '</dd><dt>Phone</dt><dd>' + esc(m.phone || 'Not recorded') + '</dd><dt>Address</dt><dd>' + esc(m.address || 'Not recorded') + '</dd></dl></div></section></aside></div>';

    runMoney(view);
    ui.on(view, 'click', '[data-action=charge]', function () { openPostCharge(id, rerender); });
    ui.on(view, 'click', '[data-action=pay]', function () { openRecordPayment(id, rerender); });
    ui.on(view, 'click', '[data-action=refund]', function () { openRefund(id, rerender); });
    ui.on(view, 'click', '[data-action=allow-charge]', function () { staffChargeGuard(id, rerender); });
    ui.on(view, 'change', '[data-action=card-on-file]', function () { toggleCardOnFile(id); rerender(); });
    ui.on(view, 'change', '[data-action=flag]', function (e, b) { toggleFlag(id, b.dataset.flag); rerender(); });
    ui.on(view, 'click', '[data-action=fnb-post]', function () {
      const y = Club.billing.fnb.year();
      const r = undoRun(function () { return Club.billing.fnb.post(id, y); }, { message: function (x) { return x && x.charge ? y + ' F&B assessment charged to ' + mname(id) : (x && x.error) || 'Already charged'; }, undone: y + ' F&B assessment reversed', after: rerenderAfterUndo });
      if (r) rerender();
    });
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
      if (p === 'minimums') return renderMain(view, 'fnb');   /* the old F&B minimums tab: the handbook's assessment replaced it */
      if (p && TABS.indexOf(p) >= 0) return renderMain(view, p);
      if (p) return renderAccount(view, p);
      return renderMain(view, 'overview');
    }
  });
})();
