/* Public site: Gift cards. Buy a gift card by card (signed in, or as a guest), print or save it,
   and check any card's balance. Signed-in golfers also see the cards they bought under My account.
   Gift cards themselves live in Club.giftcards (js/core/giftcards.js). */
(function () {
  'use strict';
  if (!window.Pub || !Club.giftcards) return;
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, G = Club.giftcards;

  /* A tee time paid fully by gift card is stored with brand 'giftcard' (js/public/book.js): name it that way wherever the
     site shows a payment's card (My bookings, the refund prompt). */
  const cardLine0 = Pub.cardLine, markChip0 = Pub.markChip;
  Pub.cardLine = function (brand, last4) { return brand === 'giftcard' ? 'Gift card ending ' + last4 : cardLine0(brand, last4); };
  Pub.markChip = function (brand, h) { return brand === 'giftcard' ? '<span class="pub-mark" data-brand="giftcard">' + Club.icon('gift', 'gp-mark-gift') + '</span>' : markChip0(brand, h); };

  function money(v) { return fmt.money(v, Math.round(v) !== +v); }
  function nameOk(v) { return /^[\p{L}][\p{L}' .-]{0,59}$/u.test(String(v || '').trim()); }

  /* Kept while the visitor moves around the site, cleared after a purchase. */
  let draft = null, done = null, owner = null;   /* owner: who the draft and the finished card belong to ('guest' or a player id) */
  function fresh(p) {
    const st = G.settings();
    return { amount: st.presets[Math.min(1, st.presets.length - 1)] || st.min, custom: false, toName: '', toEmail: '', message: '', from: p ? p.firstName : '', buyerFirst: '', buyerLast: '', buyerEmail: '' };
  }

  /* ---------------- Balance check ---------------- */
  function balanceHTML() {
    return '<section class="panel gp-bal" data-reveal aria-labelledby="gp-bal-h"><div class="panel-head"><div><div class="eyebrow">Already have one?</div><h3 id="gp-bal-h">Check a balance</h3></div>' + Club.icon('search', 'pub-head-icon') + '</div><div class="panel-body">' +
      '<form class="gp-bal-form" novalidate><div class="field"><label for="gp-bal-code">Gift card code</label><div class="gp-bal-row"><input class="input gp-bal-in" id="gp-bal-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="XXXX XXXX XXXX">' +
      '<button type="submit" class="btn btn-primary">Check</button></div></div></form><div class="gp-bal-out" aria-live="polite"></div></div></section>';
  }
  function balanceResult(card) {
    const st = G.state(card);
    const hist = G.history(card).filter(function (e) { return e.type !== 'issue'; }).slice(0, 5);
    return '<div class="gp-bal-res is-' + st + '"><div class="gp-bal-top"><span class="gp-bal-l">' + esc(G.label(card)) + '</span>' +
      '<span class="gp-bal-amt serif">' + (st === 'void' ? 'Not valid' : esc(fmt.money(card.balance))) + '</span></div>' +
      '<p class="gp-bal-s">' + (st === 'void' ? 'This gift card has been voided. Please call the golf shop at <a href="' + Pub.phoneHref() + '">' + esc(Club.info.phone) + '</a>.' : st === 'used' ? 'This gift card has been fully used.' : 'Available of ' + esc(money(card.amount)) + '. Use it for green fees, at the pro shop or at the Gallery Taphouse &amp; Grill.') + '</p>' +
      (hist.length ? '<ul class="gp-bal-hist">' + hist.map(function (e) {
        return '<li><span>' + esc(fmt.dateShort(e.date)) + ' · ' + esc(e.type === 'refund' ? 'Returned to the card' : e.type === 'void' ? 'Voided' : G.WHERE[e.where] || 'Used') + '</span><span class="num">' + (e.amount > 0 ? '+' : e.amount < 0 ? '−' : '') + esc(fmt.money(Math.abs(e.amount))) + '</span></li>';
      }).join('') + '</ul>' : '') + '</div>';
  }
  function wireBalance(root) {
    const form = ui.$('.gp-bal-form', root); if (!form) return;
    const inp = ui.$('.gp-bal-in', form), out = ui.$('.gp-bal-out', root);
    inp.addEventListener('input', function () { inp.value = inp.value.toUpperCase(); inp.classList.remove('invalid'); const er = form.querySelector('.field-error'); if (er) er.remove(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const er = form.querySelector('.field-error'); if (er) er.remove();
      const n = G.normalize(inp.value), card = n.length === 12 ? G.find(n) : null;
      if (!card) {
        inp.classList.add('invalid');
        ui.$('.field', form).insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(!n ? 'Enter the gift card code.' : n.length !== 12 ? 'Gift card codes have 12 letters and numbers.' : 'We could not find that gift card. Check the code and try again.') + '</span>');
        out.innerHTML = ''; inp.focus(); return;
      }
      out.innerHTML = balanceResult(card);
    });
  }

  /* ---------------- Page ---------------- */
  Pub.register({
    id: 'gifts', label: 'Gift cards', title: 'Gift cards', nav: { label: 'Gift cards', order: 30, icon: 'gift' },
    render: function (view, params, p) {
      const st = G.settings();
      /* Someone else is using the page now (signed out, or another account signed in): never show the previous buyer's
         card code or typed details. */
      const who = p ? p.id : 'guest';
      if (owner !== null && owner !== who) { done = null; draft = null; }
      owner = who;
      if (!draft) draft = fresh(p);
      if (p && !draft.from) draft.from = p.firstName;
      let pay = null, flow = null;

      function preview() {
        return G.cardHTML({ code: 'XXXXXXXXXXXX', amount: +draft.amount || 0, recipient: { name: draft.toName || 'Your recipient' }, message: draft.message, from: draft.from, status: 'active' });
      }
      function amountHTML() {
        return '<div class="gp-amounts" role="radiogroup" aria-label="Amount">' + st.presets.map(function (a) {
          const on = !draft.custom && +draft.amount === +a;
          return '<button type="button" role="radio" aria-checked="' + on + '" class="gp-amt' + (on ? ' active' : '') + '" data-amt="' + a + '">' + esc(money(a)) + '</button>';
        }).join('') + '<button type="button" role="radio" aria-checked="' + draft.custom + '" class="gp-amt gp-amt-other' + (draft.custom ? ' active' : '') + '" data-amt="other">Other amount</button></div>' +
          '<div class="field gp-custom"' + (draft.custom ? '' : ' hidden') + '><label for="gp-custom">Amount in dollars *</label><input class="input" id="gp-custom" name="custom" type="number" inputmode="decimal" min="' + st.min + '" max="' + st.max + '" step="1" value="' + (draft.custom ? esc(draft.amount || '') : '') + '" placeholder="' + st.min + ' to ' + st.max + '"><span class="field-hint">Any whole amount from ' + esc(money(st.min)) + ' to ' + esc(money(st.max)) + '.</span></div>';
      }
      function formHTML() {
        return '<section class="pub-page-head" data-reveal><div class="eyebrow">Gift cards</div><h1>Give a round at St. Boniface</h1><p class="serif">A gift card for green fees, the pro shop and the Gallery Taphouse &amp; Grill. Choose an amount, add a note, and print it or save it to send.</p></section>' +
          '<div class="gp-grid">' +
            '<form class="gp-form" novalidate data-reveal><div class="gp-flow"></div></form>' +
            '<aside class="gp-side stack"><div class="gp-preview" data-reveal><div class="label-caps">Preview</div><div class="gp-preview-card">' + preview() + '</div></div>' + balanceHTML() + '</aside>' +
          '</div>';
      }
      /* Buying in steps (Club.checkout.steps): 1 Details (amount, recipient, and the buyer when not signed in), 2 Payment, 3 Review. */
      function detailsHTML() {
        return '<div class="stack">' +
              '<section class="panel"><div class="panel-head"><div><h3>Amount</h3></div></div><div class="panel-body">' + amountHTML() + '</div></section>' +
              '<section class="panel"><div class="panel-head"><div><h3>Who is it for?</h3></div></div><div class="panel-body"><div class="form-grid">' +
                '<div class="field"><label for="gp-toname">Recipient’s name *</label><input class="input" id="gp-toname" name="toName" maxlength="60" autocomplete="off" value="' + esc(draft.toName) + '"></div>' +
                '<div class="field"><label for="gp-toemail">Recipient’s email *</label><input class="input" id="gp-toemail" name="toEmail" type="email" inputmode="email" maxlength="120" autocomplete="off" value="' + esc(draft.toEmail) + '"><span class="field-hint">Kept with the card. This demonstration does not send email.</span></div>' +
                '<div class="field span-2"><label for="gp-msg">Message <span class="muted">(optional)</span></label><textarea class="textarea" id="gp-msg" name="message" maxlength="240" rows="3" placeholder="Happy holidays. See you on the first tee.">' + esc(draft.message) + '</textarea><span class="field-hint gp-count">' + (240 - draft.message.length) + ' characters left</span></div>' +
                '<div class="field span-2"><label for="gp-from">Signed from *</label><input class="input" id="gp-from" name="from" maxlength="60" value="' + esc(draft.from) + '" placeholder="Your name"></div>' +
              '</div></div></section>' +
              (p ? '' : '<section class="panel"><div class="panel-head"><div><h3>Your details</h3></div></div><div class="panel-body">' +
                '<p class="muted gp-acct">For your receipt. <a href="#/signin" data-act="gp-signin">Sign in</a> to keep this gift card with your account.</p><div class="form-grid">' +
                '<div class="field"><label for="gp-bfirst">First name *</label><input class="input" id="gp-bfirst" name="buyerFirst" autocomplete="given-name" maxlength="40" value="' + esc(draft.buyerFirst) + '"></div>' +
                '<div class="field"><label for="gp-blast">Last name *</label><input class="input" id="gp-blast" name="buyerLast" autocomplete="family-name" maxlength="40" value="' + esc(draft.buyerLast) + '"></div>' +
                '<div class="field span-2"><label for="gp-bemail">Email *</label><input class="input" id="gp-bemail" name="buyerEmail" type="email" inputmode="email" autocomplete="email" maxlength="120" value="' + esc(draft.buyerEmail) + '"></div>' +
              '</div></div></section>') +
            '</div>';
      }
      function payHTML() {
        return '<section class="panel pub-card-panel"><div class="panel-head"><div><h3>Pay by card</h3></div><span class="pub-secure">' + Club.icon('key') + 'Secure</span></div><div class="panel-body">' +
                '<div class="gp-pay"></div>' +
                '<p class="pub-fine">Gift cards can be used for green fees at the golf shop, at the pro shop and at the Gallery Taphouse &amp; Grill, and online when you pay for a tee time. Questions? Call the golf shop at <a href="' + Pub.phoneHref() + '">' + esc(Club.info.phone) + '</a>.</p>' +
              '</div></section>';
      }
      /** Step 3: the gift card, who it is for, the buyer, and the card paying. */
      function paintReview() {
        const rv = flow && flow.at() === 'review' ? ui.$('.gp-review', view) : null; if (!rv || !pay) return;
        rv.innerHTML = Club.checkout.reviewHTML([
          { title: 'Gift card', edit: 'details', html: '<dl class="ckf-rv-kv"><div><dt>Amount</dt><dd>' + esc(fmt.money(+draft.amount || 0)) + '</dd></div><div><dt>For</dt><dd><span data-i18n-skip>' + esc(draft.toName.trim()) + '</span><br><span class="muted" data-i18n-skip>' + esc(draft.toEmail.trim()) + '</span></dd></div>' +
            (draft.message.trim() ? '<div><dt>Message</dt><dd data-i18n-skip>' + esc(draft.message.trim()) + '</dd></div>' : '') + '<div><dt>Signed from</dt><dd data-i18n-skip>' + esc(draft.from.trim()) + '</dd></div></dl>' },
          p ? null : { title: 'Your details', edit: 'details', html: '<dl class="ckf-rv-kv"><div><dt>Name</dt><dd data-i18n-skip>' + esc((draft.buyerFirst + ' ' + draft.buyerLast).trim()) + '</dd></div><div><dt>Email</dt><dd>' + esc(draft.buyerEmail.trim()) + '</dd></div></dl>' },
          { title: 'Payment', edit: 'pay', html: pay.summaryHTML() },
          { title: '', html: '<div class="ckf-rv-sum"><span>Total</span><span class="num">' + esc(fmt.money(+draft.amount || 0)) + '</span></div>' }
        ], 'public');
      }
      function doneHTML(card) {
        const rc = card.payment && card.payment.receiptId ? Club.receipts.get(card.payment.receiptId) : null;
        return '<section class="pub-page-head" data-reveal><div class="eyebrow">Thank you</div><h1>Your gift card is ready</h1><p class="serif">Print it or save it as a PDF to give to ' + esc(card.recipient.name || 'your recipient') + '. The code works at the golf shop, the Gallery and online.</p></section>' +
          '<div class="gp-grid gp-done">' +
            '<div class="gp-done-card" data-reveal>' + G.cardHTML(card) + '</div>' +
            '<div class="stack"><section class="panel" data-reveal><div class="panel-body gp-done-body">' +
              '<dl class="gp-kv"><div><dt>Amount</dt><dd>' + esc(fmt.money(card.amount)) + '</dd></div><div><dt>For</dt><dd>' + esc(card.recipient.name) + '<br><span class="muted">' + esc(card.recipient.email) + '</span></dd></div>' +
                '<div><dt>Code</dt><dd class="gp-code">' + esc(G.codeText(card)) + '</dd></div><div><dt>Paid with</dt><dd>' + esc(card.payment ? card.payment.label : '') + '</dd></div></dl>' +
              '<div class="gp-done-acts"><button type="button" class="btn btn-primary" data-act="gp-print" data-id="' + esc(card.id) + '">' + Club.icon('print') + '<span>Print or save the gift card</span></button>' +
                (rc ? '<button type="button" class="btn" data-act="gp-receipt" data-id="' + esc(rc.id) + '">' + Club.icon('billing') + '<span>View receipt</span></button>' : '') +
                '<button type="button" class="pub-link" data-act="gp-again">Buy another gift card</button></div>' +
            '</div></section>' + balanceHTML() + '</div>' +
          '</div>';
      }
      function buyLabel() { const a = +draft.amount; return a >= st.min && a <= st.max ? 'Buy gift card · ' + fmt.money(a) : 'Buy gift card'; }

      function draw() {
        pay = null;
        const card = done ? G.get(done) : null;
        if (card) { view.innerHTML = doneHTML(card); wireBalance(view); return; }
        view.innerHTML = formHTML();
        flow = Club.checkout.steps(ui.$('.gp-flow', view), { site: 'public', sticky: true,
          steps: [
            { id: 'details', label: 'Details', next: 'Continue to payment', html: detailsHTML() },
            { id: 'pay', label: 'Payment', next: 'Continue to review', html: payHTML() },
            { id: 'review', label: 'Review', html: '<section class="panel"><div class="panel-body gp-review"></div></section>',
              action: '<button type="button" class="btn btn-primary pub-paybtn gp-buy" data-act="gp-buy">' + Club.icon('gift') + '<span></span></button>' }
          ],
          leave: function (id) {
            if (id === 'details') return validate();
            const r = pay.validate();
            if (!r.ok && r.declined) pay.fail('');   /* a declined card is only known at Buy */
            return r.ok || !!r.declined;
          },
          enter: function () { paintReview(); } });
        pay = Club.checkout.mount(ui.$('.gp-pay', view), { site: 'public', player: p, account: false, gift: false, amount: function () { return +draft.amount || 0; }, onChange: function () { paintReview(); } });
        ui.$('.gp-buy span', view).textContent = buyLabel();
        wireBalance(view);
      }
      function repaintPreview() {
        const host = ui.$('.gp-preview-card', view); if (host) host.innerHTML = preview();
        const b = ui.$('.gp-buy span', view); if (b && !b.parentNode.disabled) b.textContent = buyLabel();
      }

      ui.on(view, 'click', '[data-amt]', function (e, b) {
        const a = b.dataset.amt;
        draft.custom = a === 'other';
        if (!draft.custom) draft.amount = +a;
        else { const v = +(ui.$('#gp-custom', view) || {}).value; draft.amount = v || ''; }
        ui.$$('.gp-amt', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
        const f = ui.$('.gp-custom', view); f.hidden = !draft.custom;
        if (draft.custom) ui.$('#gp-custom', view).focus();
        repaintPreview();
      });
      view.addEventListener('input', function (e) {
        const t = e.target; if (!t.name || !ui.$('.gp-form', view) || !ui.$('.gp-form', view).contains(t)) return;
        if (t.classList.contains('invalid')) { t.classList.remove('invalid'); const er = (t.closest('.field') || t.parentNode).querySelector('.field-error'); if (er) er.remove(); }
        if (t.name === 'custom') draft.amount = t.value === '' ? '' : +t.value;
        else if (draft.hasOwnProperty(t.name)) draft[t.name] = t.value;
        if (t.name === 'message') { const c = ui.$('.gp-count', view); if (c) c.textContent = (240 - t.value.length) + ' characters left'; }
        if (t.name === 'custom' || t.name === 'toName' || t.name === 'message' || t.name === 'from') repaintPreview();
      });
      ui.on(view, 'click', '[data-act=gp-signin]', function (e) { e.preventDefault(); Pub.afterAuth = '#/gifts'; Pub.go('signin'); });

      function validate() {
        const form = ui.$('.gp-form', view);
        Pub.clearErrs(form);
        let ok = true;
        const a = +draft.amount;
        if (draft.custom) {
          if (!a || a < st.min || a > st.max || Math.round(a) !== a) { Pub.setErr(form, 'custom', 'Choose a whole amount from ' + money(st.min) + ' to ' + money(st.max) + '.'); ok = false; }
        } else if (!(a > 0)) ok = false;
        if (!nameOk(draft.toName)) { Pub.setErr(form, 'toName', draft.toName ? 'Use letters only, please.' : 'Enter the recipient’s name.'); ok = false; }
        if (!Pub.EMAIL_RE.test(String(draft.toEmail).trim())) { Pub.setErr(form, 'toEmail', draft.toEmail ? 'That email address does not look right.' : 'Enter the recipient’s email.'); ok = false; }
        if (!String(draft.from).trim()) { Pub.setErr(form, 'from', 'Enter the name to sign the card with.'); ok = false; }
        if (!p) {
          if (!nameOk(draft.buyerFirst)) { Pub.setErr(form, 'buyerFirst', 'Enter your first name.'); ok = false; }
          if (!nameOk(draft.buyerLast)) { Pub.setErr(form, 'buyerLast', 'Enter your last name.'); ok = false; }
          if (!Pub.EMAIL_RE.test(String(draft.buyerEmail).trim())) { Pub.setErr(form, 'buyerEmail', draft.buyerEmail ? 'That email address does not look right.' : 'Enter your email for the receipt.'); ok = false; }
        }
        if (!ok) { if (flow && flow.at() !== 'details') flow.go('details', true); Pub.focusFirstErr(form); ui.toast('Please check the highlighted fields', 'bad'); }
        return ok;
      }
      ui.on(view, 'click', '[data-act=gp-buy]', function (e, btn) {
        if (btn.disabled) return;
        flow.fail('');
        if (!validate()) return;
        const res = pay.validate();
        if (!res.ok) {   /* back to step 2, where the message and the field are */
          flow.go('pay', true);
          const x = ui.$('[data-ckf-step=pay] .invalid', view) || ui.$('[data-ckf-step=pay] .ck-alert:not([hidden])', view);
          if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (x.matches('input')) x.focus({ preventScroll: true }); }
          return;
        }
        btn.disabled = true; btn.classList.add('is-busy'); btn.querySelector('span').textContent = 'Processing payment';
        setTimeout(function () {
          const me = Pub.me();
          const buyer = me ? { publicPlayerId: me.id, name: me.firstName + ' ' + me.lastName, email: me.email } : { name: draft.buyerFirst.trim() + ' ' + draft.buyerLast.trim(), email: draft.buyerEmail.trim().toLowerCase() };
          let out = null;
          try {
            out = G.purchase({ amount: +draft.amount, recipient: { name: draft.toName.trim(), email: draft.toEmail.trim() }, message: draft.message, from: draft.from.trim(), buyer: buyer, source: 'public',
              pay: { method: 'card', brand: res.card.brand, last4: res.card.last4 } });
          } catch (err) { console.error(err); }
          if (!out) { btn.disabled = false; btn.classList.remove('is-busy'); btn.querySelector('span').textContent = buyLabel(); flow.fail('We could not complete your purchase. You have not been charged. Please call the golf shop at ' + Club.info.phone + '.'); return; }
          pay.remember(res);
          done = out.card.id; draft = null;
          draw(); ui.animateIn(view); window.scrollTo({ top: 0, behavior: 'smooth' });
          ui.toast('Your gift card is ready');
        }, 700);
      });
      ui.on(view, 'click', '[data-act=gp-print]', function (e, b) { G.open(b.dataset.id); });
      ui.on(view, 'click', '[data-act=gp-receipt]', function (e, b) { Club.receipts.open(b.dataset.id); });
      ui.on(view, 'click', '[data-act=gp-again]', function () { done = null; draft = fresh(Pub.me()); draw(); ui.animateIn(view); window.scrollTo({ top: 0 }); });
      draw();
    }
  });

  /* ---------------- My account: gift cards I bought ---------------- */
  Pub.addAccountSection({
    order: 30, side: true,   /* right column of My account, to balance the two columns */
    html: function (p) {
      const list = G.all().filter(function (c) { return c.buyer && c.buyer.publicPlayerId === p.id; }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      return '<section class="panel gp-acc" data-reveal aria-labelledby="gp-acc-h"><div class="panel-head"><div><div class="eyebrow">Gifts you sent</div><h3 id="gp-acc-h">Gift cards</h3></div>' + Club.icon('gift', 'pub-head-icon') + '</div>' +
        '<div class="panel-body' + (list.length ? ' flush' : '') + '">' +
        (list.length ? '<ul class="gp-acc-list">' + list.map(function (c) {
          const s = G.state(c);
          return '<li><button type="button" class="gp-acc-row" data-gp-card="' + esc(c.id) + '"><span class="gp-acc-main"><span class="gp-acc-t">' + esc(money(c.amount)) + ' for ' + esc(c.recipient.name) + '</span>' +
            '<span class="gp-acc-s">' + esc(fmt.date(c.date)) + ' · ' + esc(G.label(c)) + '</span></span><span class="gp-acc-bal">' + (s === 'void' ? 'Void' : s === 'used' ? 'Used' : esc(fmt.money(c.balance)) + '<small>left</small>') + '</span>' + Club.icon('chevronRight', 'pub-rc-go') + '</button></li>';
        }).join('') + '</ul>' : ui.empty({ icon: 'gift', title: 'No gift cards yet', text: 'Gift cards you buy for green fees, the pro shop or the Gallery are kept here.', action: '<a class="btn btn-sm" href="#/gifts">Buy a gift card</a>' })) +
        '</div></section>';
    },
    wire: function (root) {
      ui.$$('[data-gp-card]', root).forEach(function (b) { b.addEventListener('click', function () { G.open(b.dataset.gpCard); }); });
    }
  });
})();
