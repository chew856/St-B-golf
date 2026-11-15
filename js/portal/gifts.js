/* Members' portal: Gift cards. Buy one for green fees, the pro shop and the Gallery Taphouse & Grill, charged to the member
   account or paid by card; print or save it; see the cards bought and received; check any card's balance.
   Gift cards live in Club.giftcards (js/core/giftcards.js). */
(function () {
  'use strict';
  if (!window.Portal || !Club.giftcards) return;
  const S = Club.store, U = Club.ui, F = Club.fmt, esc = U.esc, G = Club.giftcards;
  let lastTab = 'buy', draft = null, done = null;

  function money(v) { return F.money(v, Math.round(v) !== +v); }
  function fresh(m) { const st = G.settings(); return { memberId: m.id, amount: st.presets[Math.min(1, st.presets.length - 1)] || st.min, custom: false, toName: '', toEmail: '', message: '', from: m.firstName }; }
  function nameOk(v) { return /^[\p{L}][\p{L}' .-]{0,59}$/u.test(String(v || '').trim()); }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function render(view, params, member) {
    const m = Portal.member() || member;
    if (!draft || draft.memberId !== m.id) { draft = fresh(m); done = null; }
    const st = G.settings();
    let pay = null, tabs = null, flow = null;
    const startTab = ['buy', 'mine', 'balance'].indexOf(params[0]) >= 0 ? params[0] : lastTab;
    view.innerHTML = '<section class="p-hero pg-hero" data-reveal><h1>Gift cards</h1><p>For green fees, the pro shop and the Gallery Taphouse &amp; Grill.</p></section><div class="pg-tabs"></div>';

    function bought() { return G.all().filter(function (c) { return c.buyer && c.buyer.memberId === m.id; }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }); }
    function received() { const e = String(m.email || '').toLowerCase(); return e ? G.all().filter(function (c) { return c.recipient && c.recipient.email === e && !(c.buyer && c.buyer.memberId === m.id); }) : []; }

    /* ---------- Buy ---------- */
    function preview() { return G.cardHTML({ code: 'XXXXXXXXXXXX', amount: +draft.amount || 0, recipient: { name: draft.toName || 'Your recipient' }, message: draft.message, from: draft.from, status: 'active' }); }
    function buyLabel() { const a = +draft.amount; return a >= st.min && a <= st.max ? 'Buy gift card · ' + F.money(a) : 'Buy gift card'; }
    /* Phones and tablets: the bar carries the step's main button (Continue to payment, Continue to review, Buy). */
    function showBar() {
      if (lastTab !== 'buy' || done || !flow || window.innerWidth >= 880) { Portal.actionBar.hide(); return; }
      const a = +draft.amount, ok = a >= st.min && a <= st.max;
      Portal.actionBar.show({ summary: ok ? money(a) + ' gift card' : 'Choose an amount', label: flow.at() === 'review' ? buyLabel() : flow.label(), disabled: false, onClick: buy });
    }
    function paintBuy() { const b = U.$('.pg-buy span', view); if (b && !busy) b.textContent = buyLabel(); }
    /** Step 3: the gift card, who it is for, and how it is paid. */
    function paintReview() {
      const rv = flow && flow.at() === 'review' ? U.$('.pg-review', view) : null; if (!rv || !pay) return;
      rv.innerHTML = Club.checkout.reviewHTML([
        { title: 'Gift card', edit: 'details', html: '<dl class="ckf-rv-kv"><div><dt>Amount</dt><dd>' + esc(F.money(+draft.amount || 0)) + '</dd></div><div><dt>For</dt><dd><span data-i18n-skip>' + esc(draft.toName.trim()) + '</span><br><span class="muted" data-i18n-skip>' + esc(draft.toEmail.trim()) + '</span></dd></div>' +
          (draft.message.trim() ? '<div><dt>Message</dt><dd data-i18n-skip>' + esc(draft.message.trim()) + '</dd></div>' : '') + '<div><dt>Signed from</dt><dd data-i18n-skip>' + esc(draft.from.trim()) + '</dd></div></dl>' },
        { title: 'Payment', edit: 'pay', html: pay.summaryHTML() },
        { title: '', html: '<div class="ckf-rv-sum"><span>Total</span><span class="num">' + esc(F.money(+draft.amount || 0)) + '</span></div>' }
      ], 'portal');
    }
    function drawBuy(panel) {
      lastTab = 'buy'; pay = null;
      const card = done ? G.get(done) : null;
      if (card) {
        Portal.actionBar.hide();
        const rc = card.payment && card.payment.receiptId ? Club.receipts.get(card.payment.receiptId) : null;
        panel.innerHTML = '<div class="p-cols pg-done"><div class="pg-done-card">' + G.cardHTML(card) + '</div>' +
          '<div class="pg-done-side"><h2>Your gift card is ready</h2><p class="muted">Print it or save it as a PDF to give to ' + esc(card.recipient.name) + '. ' + esc(card.payment ? card.payment.label : '') + '.</p>' +
          '<div class="pg-done-acts">' + U.btn('Print or save the gift card', { kind: 'primary', icon: 'print', action: 'pg-print', id: card.id }) +
            (rc ? Portal.receiptLink([rc], { btn: true, label: 'View receipt' }) : '') +
            '<button type="button" class="p-link" data-action="pg-again">Buy another gift card</button></div></div></div>';
        return;
      }
      panel.innerHTML = '<div class="p-cols pg-cols"><form class="pg-form" novalidate><div class="pg-flow"></div></form>' +
        '<aside class="pg-side"><div class="pk-label">Preview</div><div class="pg-preview">' + preview() + '</div></aside></div>';
      /* Buying in steps (Club.checkout.steps): 1 Details (amount and recipient), 2 Payment, 3 Review. */
      flow = Club.checkout.steps(U.$('.pg-flow', panel), { site: 'portal',
        steps: [
          { id: 'details', label: 'Details', next: 'Continue to payment', html: detailsHTML() },
          { id: 'pay', label: 'Payment', next: 'Continue to review', html: '<section class="pg-card"><h2 class="pg-h">Payment</h2><div class="pg-pay"></div></section>' },
          { id: 'review', label: 'Review', html: '<section class="pg-card pg-review"></section>',
            action: '<button type="button" class="btn btn-primary pg-buy" data-action="pg-buy">' + Club.icon('gift') + '<span>' + esc(buyLabel()) + '</span></button>' }
        ],
        leave: function (id) {
          if (id === 'details') return detailsOk();
          const r = pay.validate();
          if (!r.ok && r.declined) pay.fail('');   /* a declined card is only known at Buy */
          return r.ok || !!r.declined;
        },
        enter: function () { paintReview(); paintBuy(); showBar(); } });
      const f = U.$('.pg-form', panel);
      U.$$('input[name=toEmail], input[name=toName], input[name=from]', f).forEach(function (i) { i.maxLength = i.name === 'toEmail' ? 120 : 60; i.autocomplete = 'off'; });
      pay = Club.checkout.mount(U.$('.pg-pay', panel), { site: 'portal', member: m, account: true, gift: false, amount: function () { return +draft.amount || 0; }, onChange: function () { paintReview(); } });
      showBar();
    }
    function detailsHTML() {
      return '<section class="pg-card"><h2 class="pg-h">Amount</h2><div class="gp-amounts" role="radiogroup" aria-label="Amount">' + st.presets.map(function (a) {
            const on = !draft.custom && +draft.amount === +a;
            return '<button type="button" role="radio" aria-checked="' + on + '" class="gp-amt' + (on ? ' active' : '') + '" data-amt="' + a + '">' + esc(money(a)) + '</button>';
          }).join('') + '<button type="button" role="radio" aria-checked="' + draft.custom + '" class="gp-amt gp-amt-other' + (draft.custom ? ' active' : '') + '" data-amt="other">Other amount</button></div>' +
          '<div class="field gp-custom"' + (draft.custom ? '' : ' hidden') + '><label for="pg-custom">Amount in dollars *</label><input class="input" id="pg-custom" name="custom" type="number" inputmode="decimal" min="' + st.min + '" max="' + st.max + '" step="1" value="' + (draft.custom ? esc(draft.amount || '') : '') + '" placeholder="' + st.min + ' to ' + st.max + '"><span class="field-hint">Any whole amount from ' + esc(money(st.min)) + ' to ' + esc(money(st.max)) + '.</span></div></section>' +
          '<section class="pg-card"><h2 class="pg-h">Who is it for?</h2><div class="form-grid">' +
            U.field({ label: 'Recipient’s name', name: 'toName', value: draft.toName, required: true }) +
            U.field({ label: 'Recipient’s email', name: 'toEmail', type: 'email', value: draft.toEmail, required: true, hint: 'Kept with the card. This demonstration does not send email.' }) +
            '<div class="field span-2"><label for="pg-msg">Message (optional)</label><textarea class="textarea" id="pg-msg" name="message" maxlength="240" rows="3" placeholder="Happy holidays. See you on the first tee.">' + esc(draft.message) + '</textarea><span class="field-hint pg-count">' + (240 - draft.message.length) + ' characters left</span></div>' +
            U.field({ label: 'Signed from', name: 'from', value: draft.from, required: true, span2: true }) +
          '</div></section>';
    }
    function repaint() { const pv = U.$('.pg-preview', view); if (pv) pv.innerHTML = preview(); paintBuy(); showBar(); }
    U.on(view, 'click', '[data-amt]', function (e, b) {
      draft.custom = b.dataset.amt === 'other';
      if (!draft.custom) draft.amount = +b.dataset.amt; else { const v = +(U.$('#pg-custom', view) || {}).value; draft.amount = v || ''; }
      U.$$('.gp-amt', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
      U.$('.gp-custom', view).hidden = !draft.custom; if (draft.custom) U.$('#pg-custom', view).focus();
      repaint();
    });
    view.addEventListener('input', function (e) {
      const t = e.target, f = U.$('.pg-form', view); if (!f || !f.contains(t) || !t.name) return;
      if (t.classList.contains('invalid')) { t.classList.remove('invalid'); const er = (t.closest('.field') || t.parentNode).querySelector('.field-error'); if (er) er.remove(); }
      if (t.name === 'custom') draft.amount = t.value === '' ? '' : +t.value;
      else if (Object.prototype.hasOwnProperty.call(draft, t.name) && t.name !== 'memberId') draft[t.name] = t.value;
      if (t.name === 'message') { const c = U.$('.pg-count', view); if (c) c.textContent = (240 - t.value.length) + ' characters left'; }
      if (t.name === 'custom' || t.name === 'toName' || t.name === 'message' || t.name === 'from') repaint();
    });
    function err(f, name, msg) {
      const i = U.$('[name="' + name + '"]', f); if (!i) return;
      i.classList.add('invalid'); const fld = i.closest('.field'); if (fld && !fld.querySelector('.field-error')) fld.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
    }
    let busy = false;
    /** Step 1: the amount and the recipient. Errors show on that step. */
    function detailsOk() {
      const f = U.$('.pg-form', view); if (!f) return false;
      U.$$('.field-error', f).forEach(function (x) { if (!x.closest('.cc, .ck')) x.remove(); });
      U.$$('.invalid', f).forEach(function (x) { if (!x.closest('.cc, .ck')) x.classList.remove('invalid'); });
      let ok = true; const a = +draft.amount;
      if (!a || a < st.min || a > st.max || Math.round(a) !== a) { if (!draft.custom) { draft.custom = true; } err(f, 'custom', 'Choose a whole amount from ' + money(st.min) + ' to ' + money(st.max) + '.'); U.$('.gp-custom', view).hidden = false; ok = false; }
      if (!nameOk(draft.toName)) { err(f, 'toName', draft.toName ? 'Use letters only, please.' : 'Enter the recipient’s name.'); ok = false; }
      if (!EMAIL_RE.test(String(draft.toEmail).trim())) { err(f, 'toEmail', draft.toEmail ? 'That email address does not look right.' : 'Enter the recipient’s email.'); ok = false; }
      if (!String(draft.from).trim()) { err(f, 'from', 'Enter the name to sign the card with.'); ok = false; }
      if (!ok) { if (flow.at() !== 'details') flow.go('details', true); const x = U.$('.invalid', f); if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); x.focus({ preventScroll: true }); } U.toast('Please check the highlighted fields', 'bad'); }
      return ok;
    }
    /** A payment problem found at Buy: back to step 2, where the message and the field are. */
    function toPay(msg) {
      if (flow.at() !== 'pay') flow.go('pay', true);
      if (msg) pay.fail(msg);
      const x = U.$('[data-ckf-step=pay] .invalid', view) || U.$('[data-ckf-step=pay] .ck-alert:not([hidden])', view);
      if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (x.matches('input')) x.focus({ preventScroll: true }); }
    }
    function buy() {
      const f = U.$('.pg-form', view); if (!f || busy || !flow) return;
      if (flow.at() !== 'review') { flow.next(); return; }
      flow.fail('');
      if (!detailsOk()) return;
      const a = +draft.amount;
      const res = pay.validate(); if (!res.ok) { toPay(); return; }
      if (res.method === 'account' && (m.status === 'suspended' || m.status === 'resigned')) { toPay('Your account cannot take new charges right now. Please pay by card, or call the club office at ' + Club.info.phone + '.'); return; }
      busy = true;
      const bb = U.$('.pg-buy', view); if (bb) { bb.disabled = true; bb.classList.add('is-busy'); U.$('span', bb).textContent = res.method === 'card' ? 'Processing payment' : 'Buying'; }
      if (window.innerWidth < 880) Portal.actionBar.show({ summary: money(a) + ' gift card', label: res.method === 'card' ? 'Processing payment' : 'Buying', disabled: true });
      setTimeout(function () {
        let out = null;
        try {
          out = G.purchase({ amount: a, recipient: { name: draft.toName.trim(), email: draft.toEmail.trim() }, message: draft.message, from: draft.from.trim(),
            buyer: { memberId: m.id, name: m.firstName + ' ' + m.lastName, email: m.email || '' }, source: 'portal',
            pay: res.method === 'account' ? { method: 'account' } : { method: 'card', brand: res.card.brand, last4: res.card.last4 } });
        } catch (x) { console.error(x); }
        busy = false;
        if (bb) { bb.disabled = false; bb.classList.remove('is-busy'); paintBuy(); }
        if (!out) { showBar(); flow.fail('We could not complete your purchase. Nothing was charged. Please call the club office at ' + Club.info.phone + '.'); return; }
        pay.remember(res);
        done = out.card.id; draft = fresh(m);
        tabs.activate('buy'); window.scrollTo({ top: 0, behavior: 'smooth' });
        U.toast('Your gift card is ready');
      }, 700);
    }
    U.on(view, 'click', '[data-action=pg-buy]', function () { buy(); });
    U.on(view, 'click', '[data-action=pg-print]', function (e, b) { G.open(b.dataset.id); });
    U.on(view, 'click', '[data-action=pg-again]', function () { done = null; draft = fresh(m); tabs.activate('buy'); });

    /* ---------- My gift cards ---------- */
    function rowHTML(c, sub) {
      const s = G.state(c);
      return '<button type="button" class="pg-row" data-gc-open="' + esc(c.id) + '"><span class="pg-row-icon">' + Club.icon('gift') + '</span><span class="pg-row-main"><span class="pg-row-t">' + esc(money(c.amount)) + ' · ' + esc(sub) + '</span>' +
        '<span class="pg-row-s">' + esc(F.date(c.date)) + ' · ' + esc(G.label(c)) + '</span></span><span class="pg-row-bal">' + (s === 'void' ? 'Void' : s === 'used' ? 'Used' : esc(F.money(c.balance)) + '<small>left</small>') + '</span>' + Club.icon('chevronRight', 'pg-row-go') + '</button>';
    }
    function drawMine(panel) {
      lastTab = 'mine'; Portal.actionBar.hide();
      const b = bought(), r = received();
      panel.innerHTML = (r.length ? '<section class="pg-list"><h2 class="pg-h">Gift cards for you</h2><div class="pg-rows">' + r.map(function (c) { return rowHTML(c, 'from ' + (c.from || c.buyer.name || 'a friend')); }).join('') + '</div></section>' : '') +
        '<section class="pg-list"><h2 class="pg-h">Gift cards you bought</h2>' + (b.length ? '<div class="pg-rows">' + b.map(function (c) { return rowHTML(c, 'for ' + c.recipient.name); }).join('') + '</div>'
          : U.empty({ icon: 'gift', title: 'No gift cards yet', text: 'Gift cards you buy are kept here with their balances.', action: U.btn('Buy a gift card', { kind: 'primary', action: 'pg-tobuy' }) })) + '</section>';
    }
    U.on(view, 'click', '[data-gc-open]', function (e, b) { cardSheet(b.dataset.gcOpen); });
    U.on(view, 'click', '[data-action=pg-tobuy]', function () { tabs.activate('buy'); });
    function cardSheet(id) {
      const c = G.get(id); if (!c) return;
      const rc = c.payment && c.payment.receiptId && c.buyer.memberId === m.id ? Club.receipts.get(c.payment.receiptId) : null;
      const hist = G.history(c).filter(function (e) { return e.type !== 'issue'; });
      const sh = Portal.openSheet({ title: G.label(c), content: '<div class="pg-sheet">' + G.cardHTML(c) +
        '<dl class="pg-kv"><div><dt>Balance</dt><dd>' + (c.status === 'void' ? 'Void' : esc(F.money(c.balance))) + '</dd></div><div><dt>Bought</dt><dd>' + esc(F.date(c.date)) + '</dd></div></dl>' +
        (hist.length ? '<ul class="pg-hist">' + hist.map(function (e) { return '<li><span>' + esc(F.dateShort(e.date)) + ' · ' + esc(e.type === 'refund' ? 'Returned to the card' : e.type === 'void' ? 'Voided' : G.WHERE[e.where] || 'Used') + '</span><span class="num">' + (e.amount > 0 ? '+' : '−') + esc(F.money(Math.abs(e.amount))) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Not used yet.</p>') +
        '<div class="pg-sheet-acts">' + U.btn('Print or save', { icon: 'print', action: 'pg-print', id: c.id }) + (rc ? Portal.receiptLink([rc], { btn: true }) : '') + '</div></div>' });
      U.on(sh.body, 'click', '[data-action=pg-print]', function () { G.open(c.id); });
    }

    /* ---------- Check a balance ---------- */
    function drawBalance(panel) {
      lastTab = 'balance'; Portal.actionBar.hide();
      panel.innerHTML = '<section class="pg-card pg-bal"><h2 class="pg-h">Check a balance</h2><form class="gp-bal-form" novalidate><div class="field"><label for="pg-bal-code">Gift card code</label><div class="gp-bal-row"><input class="input gp-bal-in" id="pg-bal-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="XXXX XXXX XXXX"><button type="submit" class="btn btn-primary">Check</button></div></div></form><div class="gp-bal-out" aria-live="polite"></div></section>';
      const form = U.$('form', panel), inp = U.$('.gp-bal-in', panel), out = U.$('.gp-bal-out', panel);
      inp.addEventListener('input', function () { inp.value = inp.value.toUpperCase(); inp.classList.remove('invalid'); const er = form.querySelector('.field-error'); if (er) er.remove(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); const er = form.querySelector('.field-error'); if (er) er.remove();
        const n = G.normalize(inp.value), c = n.length === 12 ? G.find(n) : null;
        if (!c) { inp.classList.add('invalid'); U.$('.field', form).insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(!n ? 'Enter the gift card code.' : n.length !== 12 ? 'Gift card codes have 12 letters and numbers.' : 'We could not find that gift card. Check the code and try again.') + '</span>'); out.innerHTML = ''; return; }
        const s = G.state(c);
        out.innerHTML = '<div class="gp-bal-res is-' + s + '"><div class="gp-bal-top"><span class="gp-bal-l">' + esc(G.label(c)) + '</span><span class="gp-bal-amt">' + (s === 'void' ? 'Not valid' : esc(F.money(c.balance))) + '</span></div>' +
          '<p class="gp-bal-s">' + (s === 'void' ? 'This gift card has been voided. Please call the golf shop at ' + esc(Club.info.phone) + '.' : s === 'used' ? 'This gift card has been fully used.' : 'Available of ' + esc(money(c.amount)) + '.') + '</p></div>';
      });
    }

    tabs = U.tabs(U.$('.pg-tabs', view), [
      { id: 'buy', label: 'Buy', render: drawBuy },
      { id: 'mine', label: 'My gift cards', render: drawMine },
      { id: 'balance', label: 'Check a balance', render: drawBalance }
    ], startTab);
  }

  Portal.register({ id: 'gifts', label: 'Gift cards', short: 'Gifts', icon: 'gift', order: 55, tab: false, render: render });
})();
