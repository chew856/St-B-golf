/* Staff: Gift cards. Look up a code (typed or scanned), see its balance and history, redeem by hand (green fees and other
   golf shop sales that are not rung through the till), print it again, and void it. Gift card amounts offered online are
   placeholders kept in $giftCardSettings. Redemptions at the pro shop till and on Gallery checks happen in those pages
   (js/modules/proshop.js, js/modules/dining.js); everything is recorded on the card by Club.giftcards (js/core/giftcards.js).
   Redeem, void and the online amounts offer Undo on their toast (Club.undo): the balance goes back through a history entry.
   Sell gift card (Nov 12): a sale at the golf shop, charged to a member's account or paid at the counter through the tee
   sheet's till; Undo voids the card and reverses the charge or the receipt. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, G = Club.giftcards;
  if (!G) return;
  const state = { q: '', filter: 'active' };
  const PURPOSE = [{ value: 'green', label: 'Green fees', where: 'proshop', note: 'Green fees' }, { value: 'shop', label: 'Pro shop', where: 'proshop', note: 'Pro shop' }, { value: 'gallery', label: 'Gallery', where: 'dining', note: 'Gallery Taphouse & Grill' }];

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function staffName() { return Club.user ? Club.user.firstName + ' ' + Club.user.lastName : 'Staff'; }
  function monthStart() { const d = new Date(); return Club.store.iso(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function badge(c) { const s = G.state(c); return ui.badge(s === 'void' ? 'Void' : s === 'used' ? 'Used' : 'Active', s === 'void' ? 'bad' : s === 'used' ? 'outline' : 'good'); }
  function whereText(e) {
    if (e.type === 'issue') return 'Bought' + (e.note && e.note !== 'Gift card bought' ? ', ' + e.note : '');
    if (e.type === 'void') return 'Voided' + (e.note ? ': ' + e.note : '');
    if (e.type === 'refund') return 'Returned' + (e.note ? ': ' + e.note : '');
    return (G.WHERE[e.where] || 'Used') + (e.note ? ' · ' + e.note : '');
  }
  function filtered() {
    const q = state.q.trim().toLowerCase(), n = G.normalize(state.q);
    return G.all().filter(function (c) {
      const s = G.state(c);
      if (state.filter !== 'all' && s !== state.filter) return false;
      if (!q) return true;
      return (n.length >= 3 && c.code.indexOf(n) >= 0) || [c.recipient.name, c.recipient.email, c.buyer.name, c.buyer.email, c.from].join(' ').toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }

  /* ---------------- Card drawer ---------------- */
  let shown = null, pageRefresh = null;   /* the card drawer on screen and the page's refresh, so an Undo shows the card as it is again */
  function reopen(id) {
    if (shown && shown.id === id && document.body.contains(shown.api.el)) { shown.api.close(); setTimeout(function () { openCard(id, pageRefresh); }, 220); }
    if (pageRefresh) pageRefresh();
  }
  function openCard(id, after) {
    const c = G.get(id); if (!c) { ui.toast('That gift card is not on file', 'bad'); return; }
    const rc = c.payment && c.payment.receiptId ? Club.receipts.get(c.payment.receiptId) : null;
    const buyer = c.buyer || {};
    const bLink = buyer.memberId ? '<a href="#/members/' + esc(buyer.memberId) + '">' + esc(Club.members.name(buyer.memberId)) + '</a> · member' : esc(buyer.name || 'Guest') + (buyer.publicPlayerId ? ' · public golfer' : ' · guest');
    const body = '<div class="gs-drawer"><div class="gcv-wrap">' + G.cardHTML(c) + '</div>' +
      '<div class="gs-bal"><div><span class="label-caps">Balance</span><strong class="num">' + esc(fmt.money(c.balance)) + '</strong></div><div><span class="label-caps">Of</span><span class="num">' + esc(fmt.money(c.amount)) + '</span></div>' + badge(c) + '</div>' +
      '<dl class="gs-kv">' +
        '<div><dt>Code</dt><dd class="gs-code">' + esc(G.codeText(c)) + '</dd></div>' +
        '<div><dt>For</dt><dd>' + esc(c.recipient.name || '') + (c.recipient.email ? '<br><span class="muted">' + esc(c.recipient.email) + '</span>' : '') + '</dd></div>' +
        '<div><dt>Bought by</dt><dd>' + bLink + (buyer.email ? '<br><span class="muted">' + esc(buyer.email) + '</span>' : '') + '</dd></div>' +
        '<div><dt>Bought</dt><dd>' + esc(fmt.date(c.date)) + ' · ' + esc({ public: 'public site', portal: 'members’ portal', staff: 'golf shop' }[c.source] || c.source || '') + '</dd></div>' +
        '<div><dt>Paid with</dt><dd>' + esc(c.payment ? c.payment.label : '') + '</dd></div>' +
        (c.message ? '<div><dt>Message</dt><dd>' + esc(c.message) + '</dd></div>' : '') +
        (c.status === 'void' ? '<div><dt>Voided</dt><dd>' + esc(fmt.date(c.voidedAt)) + (c.voidReason ? ': ' + esc(c.voidReason) : '') + '</dd></div>' : '') +
      '</dl>' +
      '<h4 class="gs-h">History</h4><ul class="gs-hist">' + G.history(c).map(function (e) {
        return '<li><div class="gs-hist-main"><span>' + esc(whereText(e)) + '</span><span class="muted">' + esc(fmt.date(e.date)) + ', ' + esc(fmt.time(new Date(e.at))) + (e.by ? ' · ' + esc(e.by) : '') + '</span></div>' +
          '<div class="gs-hist-amt"><span class="num' + (e.amount < 0 ? ' is-out' : '') + '">' + (e.amount > 0 ? '+' : e.amount < 0 ? '−' : '') + esc(fmt.money(Math.abs(e.amount))) + '</span><span class="muted num">' + esc(fmt.money(e.balance)) + '</span></div></li>';
      }).join('') + '</ul></div>';
    const active = G.state(c) === 'active';
    const d = ui.drawer({ eyebrow: 'Gift card', title: G.label(c), body: body, actions: [
      { label: 'Print', kind: 'ghost', icon: 'print', onClick: function () { G.open(c.id); return false; } }
    ].concat(rc ? [{ label: 'Receipt', kind: 'ghost', icon: 'billing', onClick: function () { Club.receipts.open(rc); return false; } }] : [])
      .concat(c.status !== 'void' ? [{ label: 'Void', kind: 'danger', icon: 'close', onClick: function (api) { voidCard(c.id, function () { api.close(); if (after) after(); setTimeout(function () { openCard(c.id, after); }, 220); }); return false; } }] : [])
      .concat(active ? [{ label: 'Redeem', kind: 'primary', icon: 'check', onClick: function (api) { redeemModal(c.id, function () { api.close(); if (after) after(); setTimeout(function () { openCard(c.id, after); }, 220); }); return false; } }] : []) });
    if (d.el) d.el.classList.add('gs-drawer-el');
    if (!d.duplicate) shown = { id: c.id, api: d };
  }
  function redeemModal(id, after) {
    const c = G.get(id); if (!c) return;
    let purpose = 'green';
    const m = ui.modal({ eyebrow: G.label(c) + ' · ' + fmt.money(c.balance) + ' available', title: 'Redeem a gift card',
      body: '<form class="gs-redeem" novalidate onsubmit="return false"><div class="field"><label>For</label>' + ui.segmented(PURPOSE.map(function (p) { return { value: p.value, label: p.label }; }), purpose, 'gs-purpose') + '</div>' +
        '<div class="form-grid">' + ui.field({ label: 'Amount', name: 'amount', type: 'number', min: 0.01, max: c.balance, step: 0.01, value: '', required: true, placeholder: '0.00', hint: 'Up to ' + fmt.money(c.balance) + '. Any balance left stays on the card.' }) +
        ui.field({ label: 'Note', name: 'note', placeholder: 'Sale or tee time reference (optional)' }) + '</div></form>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Redeem', kind: 'primary', icon: 'check', onClick: function (api) {
        const f = ui.$('form', api.body); const v = ui.formData(f);
        ui.$$('.field-error', f).forEach(function (x) { x.remove(); }); ui.$$('.invalid', f).forEach(function (x) { x.classList.remove('invalid'); });
        const amt = r2(v.amount);
        const cur = G.get(id);
        const bad = !(amt > 0) ? 'Enter an amount greater than zero.' : amt > r2(cur.balance) ? 'Only ' + fmt.money(cur.balance) + ' is left on this card.' : '';
        if (bad) { const i = ui.$('[name=amount]', f); i.classList.add('invalid'); i.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(bad) + '</span>'); i.focus(); return false; }
        const p = PURPOSE.find(function (x) { return x.value === purpose; });
        /* The redemption gets a receipt paid by gift card, so the daily close and the journal see it: gift card liability
           goes down and the department's revenue goes up. Undo credits the receipt along with the card. */
        const SRC = { green: 'teesheet', shop: 'proshop', gallery: 'dining' };
        const rec = Club.undo.track(function () {
          const out = G.redeem(id, amt, { where: p.where, note: p.note + (v.note ? ': ' + v.note : ''), by: staffName() });
          if (out.ok && G.receipt) {
            G.receipt({ memberId: null, name: (cur.recipient && cur.recipient.name) || 'Gift card holder', title: p.label + ', paid by gift card',
              lines: [{ name: p.note + (v.note ? ': ' + v.note : ''), qty: 1, price: amt }], total: amt, gift: { card: out.card, amount: amt },
              source: SRC[purpose] || 'proshop', refId: id, channel: 'counter' });
          }
          return out;
        }), res = rec.result;
        if (!res.ok) { ui.toast(res.msg, 'bad'); return false; }
        Club.undo.offer(fmt.money(amt) + ' redeemed. ' + fmt.money(res.card.balance) + ' left on the card', rec, { after: function () { reopen(id); }, undone: fmt.money(amt) + ' put back on ' + G.label(cur) });
        if (after) after();
      } }] });
    if (m.duplicate) return;
    ui.on(m.body, 'click', '.segmented button', function (e, b) { purpose = b.dataset.value; ui.$$('.segmented button', m.body).forEach(function (x) { x.classList.toggle('active', x === b); }); });
  }
  function voidCard(id, after) {
    const c = G.get(id); if (!c) return;
    ui.modal({ eyebrow: G.label(c), title: 'Void this gift card?',
      body: '<p class="ink-2">The code stops working everywhere straight away' + (c.balance > 0 ? ' and its ' + esc(fmt.money(c.balance)) + ' balance is cleared' : '') + '. Any refund to the buyer is made separately.</p>' +
        '<form novalidate onsubmit="return false">' + ui.field({ label: 'Reason', name: 'reason', required: true, placeholder: 'Reported lost, replaced with a new card' }) + '</form>',
      actions: [{ label: 'Keep card', kind: 'ghost' }, { label: 'Void gift card', kind: 'danger', onClick: function (api) {
        const f = ui.$('form', api.body); if (!ui.validate(f)) return false;
        Club.undo.run(function () { G.void(id, ui.formData(f).reason, staffName()); }, { message: G.label(c) + ' voided', after: function () { reopen(id); }, undone: G.label(c) + ' is active again with its ' + fmt.money(c.balance) + ' balance' });
        if (after) after();
      } }] });
  }
  function settingsModal(after) {
    const st = G.settings();
    ui.modal({ eyebrow: 'Gift cards', title: 'Online amounts',
      body: '<p class="gs-ph">' + Club.icon('info') + '<span>Placeholder values for the demonstration. Confirm the amounts with the club.</span></p><form class="form-grid" novalidate onsubmit="return false">' +
        ui.field({ label: 'Preset amounts', name: 'presets', value: st.presets.join(', '), span2: true, hint: 'Dollar amounts, separated by commas.' }) +
        ui.field({ label: 'Smallest custom amount', name: 'min', type: 'number', min: 1, step: 1, value: st.min }) +
        ui.field({ label: 'Largest custom amount', name: 'max', type: 'number', min: 1, step: 1, value: st.max }) + '</form>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: function (api) {
        const f = ui.$('form', api.body), v = ui.formData(f);
        ui.$$('.field-error', f).forEach(function (x) { x.remove(); });
        const presets = String(v.presets || '').split(/[,\s]+/).map(function (x) { return Math.round(+x); }).filter(function (x) { return x > 0; });
        const bad = function (n, msg) { const i = ui.$('[name=' + n + ']', f); i.classList.add('invalid'); i.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); };
        let ok = true;
        if (!presets.length || presets.length > 6) { bad('presets', 'Enter one to six amounts.'); ok = false; }
        if (!(v.min >= 1)) { bad('min', 'At least $1.'); ok = false; }
        if (!(v.max > v.min)) { bad('max', 'Larger than the smallest amount.'); ok = false; }
        if (!ok) return false;
        Club.undo.run(function () { G.saveSettings({ presets: presets.sort(function (a, b) { return a - b; }), min: Math.round(v.min), max: Math.round(v.max) }); },
          { message: 'Gift card amounts saved', after: after, undone: 'Gift card amounts put back' });
        if (after) after();
      } }] });
  }

  /* ---------------- Sell a gift card at the golf shop ----------------
     Amount (the online presets, or a whole custom amount within the settings' range), who it is for (optional name, email,
     message), who buys it (a member or public golfer found by search, or a walk-in by name) and how it is paid: charged to
     the member's account, or taken at the counter with the tee sheet's till (card, cash, gift card, discount). The card,
     its history and the receipt are made by Club.giftcards.purchase, as online. Undo voids the card and reverses the money. */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function custMatches(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const hit = function (parts) { return parts.join(' ').toLowerCase().indexOf(q) >= 0; };
    const mem = S.all('members').filter(function (m) { return hit([m.firstName + ' ' + m.lastName, m.lastName + ', ' + m.firstName, '#' + m.memberNo, m.email || '']) || (digits.length >= 3 && String(m.memberNo).indexOf(digits) >= 0); })
      .sort(function (a, b) { return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName); }).slice(0, 6)
      .map(function (m) { const t = Club.members.tier(m); return { kind: 'member', id: m.id, name: m.firstName + ' ' + m.lastName, sub: 'Member #' + m.memberNo + (t ? ' · ' + t.name : '') + (m.status && m.status !== 'active' ? ' · ' + m.status.charAt(0).toUpperCase() + m.status.slice(1) : '') }; });
    const pub = S.all('publicPlayers').filter(function (p) { return hit([(p.firstName || '') + ' ' + (p.lastName || ''), p.email || '']) || (digits.length >= 4 && String(p.phone || '').replace(/\D/g, '').indexOf(digits) >= 0); })
      .slice(0, 4).map(function (p) { return { kind: 'public', id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Public golfer', sub: 'Public golfer' + (p.email ? ' · ' + p.email : '') }; });
    return mem.concat(pub);
  }
  function custDoc(c) {
    if (!c) return null;
    const d = c.kind === 'member' ? Club.members.get(c.id) : S.find('publicPlayers', c.id);
    return d ? { kind: c.kind, id: c.id, doc: d, name: [d.firstName, d.lastName].filter(Boolean).join(' ') } : null;
  }
  function canCharge(c) { return !!c && c.kind === 'member' && c.doc.status !== 'suspended' && c.doc.status !== 'resigned'; }
  function stopPrinting() { document.body.classList.remove('rc-printing'); }

  function sellModal(after) {
    const st = G.settings();
    const d = { amount: st.presets[Math.min(1, st.presets.length - 1)] || st.min, custom: false, who: 'file', cust: null, pay: 'counter' };
    let active = -1;
    const radio = function (name, items, sel) {
      return '<div class="segmented gs-seg" role="radiogroup" data-name="' + name + '">' + items.map(function (i) {
        return '<button type="button" role="radio" data-value="' + esc(i.value) + '" aria-checked="' + (i.value === sel) + '" class="' + (i.value === sel ? 'active' : '') + '"' + (i.disabled ? ' disabled' : '') + '>' + esc(i.label) + '</button>';
      }).join('') + '</div>';
    };
    const body = '<form class="gs-sell" novalidate onsubmit="return false">' +
      '<section class="gs-sell-sec"><div class="label-caps" id="gs-sell-al">Amount</div>' +
        radio('amt', st.presets.map(function (a) { return { value: String(a), label: fmt.money0(a) }; }).concat([{ value: 'custom', label: 'Custom' }]), String(d.amount)).replace('role="radiogroup"', 'role="radiogroup" aria-labelledby="gs-sell-al"') +
        '<div class="field gs-sell-custom" hidden><label for="gs-sell-custom">Amount in dollars *</label><input class="input num" id="gs-sell-custom" name="custom" type="number" inputmode="decimal" min="' + st.min + '" max="' + st.max + '" step="1" placeholder="' + st.min + ' to ' + st.max + '">' +
          '<span class="field-hint">Any whole amount from ' + esc(fmt.money0(st.min)) + ' to ' + esc(fmt.money0(st.max)) + '.</span></div></section>' +
      '<section class="gs-sell-sec"><div class="label-caps" id="gs-sell-bl">Bought by</div>' +
        radio('who', [{ value: 'file', label: 'Member or golfer on file' }, { value: 'walk', label: 'Walk-in' }], d.who).replace('role="radiogroup"', 'role="radiogroup" aria-labelledby="gs-sell-bl"') +
        '<div class="gs-sell-file"></div>' +
        '<div class="form-grid gs-sell-walk" hidden>' +
          '<div class="field"><label for="gs-sell-bn">Buyer’s name *</label><input class="input" id="gs-sell-bn" name="buyerName" maxlength="60" autocomplete="off"></div>' +
          '<div class="field"><label for="gs-sell-be">Buyer’s email</label><input class="input" id="gs-sell-be" name="buyerEmail" type="email" maxlength="120" autocomplete="off" placeholder="Optional"></div></div></section>' +
      '<section class="gs-sell-sec"><div class="label-caps">For</div><div class="form-grid">' +
        '<div class="field"><label for="gs-sell-tn">Recipient’s name</label><input class="input" id="gs-sell-tn" name="toName" maxlength="60" autocomplete="off" placeholder="Optional"></div>' +
        '<div class="field"><label for="gs-sell-te">Recipient’s email</label><input class="input" id="gs-sell-te" name="toEmail" type="email" maxlength="120" autocomplete="off" placeholder="Optional"></div>' +
        '<div class="field span-2"><label for="gs-sell-msg">Message</label><textarea class="textarea" id="gs-sell-msg" name="message" maxlength="240" rows="2" placeholder="Optional. Printed on the card."></textarea></div>' +
        '<div class="field span-2"><label for="gs-sell-from">Signed from</label><input class="input" id="gs-sell-from" name="from" maxlength="60" autocomplete="off" placeholder="The buyer’s name"></div>' +
      '</div></section>' +
      '<section class="gs-sell-sec"><div class="label-caps" id="gs-sell-pl">Payment</div><div class="gs-sell-pay"></div><p class="gs-sell-note"></p></section>' +
    '</form>';
    const m = ui.modal({ eyebrow: 'Gift cards', title: 'Sell a gift card', size: 'lg', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Take payment', kind: 'primary', icon: 'check', onClick: function (api) { return submit(api); } }
    ] });
    if (m.duplicate) return;
    m.el.classList.add('gs-sell-modal');
    const f = ui.$('.gs-sell', m.body);
    function amount() { return d.custom ? r2(ui.$('[name=custom]', f).value) : +d.amount; }
    function cust() { return d.who === 'file' ? custDoc(d.cust) : null; }
    function drawFile() {
      const host = ui.$('.gs-sell-file', f), c = custDoc(d.cust);
      if (c) {
        const sub = c.kind === 'member' ? 'Member #' + esc(c.doc.memberNo) + (Club.members.tier(c.doc) ? ' · ' + esc(Club.members.tier(c.doc).name) : '') + ' · Balance ' + esc(fmt.money(c.doc.balance)) : 'Public golfer' + (c.doc.email ? ' · ' + esc(c.doc.email) : '');
        host.innerHTML = '<div class="gs-cust-chip">' + ui.person(c.name, sub) + '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-gs-cust-clear aria-label="Remove ' + esc(c.name) + ' as the buyer" title="Remove buyer">' + Club.icon('close') + '</button></div>' +
          (c.kind === 'member' && !canCharge(c) ? '<p class="gs-sell-warn">' + ui.badge(c.doc.status === 'suspended' ? 'Suspended' : 'Resigned', 'bad') + ' <span>Charging privileges are not available. Take payment at the counter.</span></p>' : '');
      } else {
        host.innerHTML = '<div class="field gs-cust"><label for="gs-sell-cust" class="sr-only">Find the buyer</label><div class="gs-cust-wrap">' + Club.icon('search') +
          '<input class="input" id="gs-sell-cust" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gs-cust-list" placeholder="Search members and public golfers"></div>' +
          '<ul class="gs-cust-list" id="gs-cust-list" role="listbox" aria-label="Matching people" hidden></ul></div>';
      }
    }
    function drawPay() {
      const c = cust(), acct = canCharge(c);
      if (d.pay === 'account' && !acct) d.pay = 'counter';
      ui.$('.gs-sell-pay', f).innerHTML = radio('pay', [{ value: 'counter', label: 'Pay at the counter' }, { value: 'account', label: 'Charge to member account', disabled: !acct }], d.pay).replace('role="radiogroup"', 'role="radiogroup" aria-labelledby="gs-sell-pl"');
      ui.$('.gs-sell-note', f).textContent = d.pay === 'account' ? 'Added to ' + c.name + '’s account and shown on their next statement. The receipt is in their portal.'
        : 'Card, cash or another gift card, with an optional discount, in the golf shop till.' + (acct ? '' : ' To charge an account, choose a member as the buyer.');
      label();
    }
    function label() {
      const a = amount(), ok = a >= st.min && a <= st.max && Math.round(a) === a || (!d.custom && a > 0);
      const b = ui.$('.modal-foot .btn-primary span', m.el); if (!b) return;
      b.textContent = d.pay === 'account' ? 'Charge ' + (ok ? fmt.money(a) + ' ' : '') + 'to account' : 'Take payment' + (ok ? ' · ' + fmt.money(a) : '');
    }
    function setSeg(name, v) { ui.$$('.segmented[data-name=' + name + '] button', f).forEach(function (x) { const on = x.dataset.value === v; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); }); }
    function list(show) {
      const inp = ui.$('#gs-sell-cust', f), ul = ui.$('#gs-cust-list', f); if (!inp || !ul) return;
      const found = show ? custMatches(inp.value) : [];
      active = found.length ? 0 : -1;
      ul.innerHTML = found.length ? found.map(function (x, i) {
        return '<li role="option" id="gs-cust-o' + i + '" class="gs-cust-opt' + (i === 0 ? ' is-active' : '') + '" aria-selected="' + (i === 0) + '" data-kind="' + x.kind + '" data-id="' + esc(x.id) + '"><b>' + esc(x.name) + '</b><span>' + esc(x.sub) + '</span></li>';
      }).join('') : '<li class="gs-cust-none">No member or public golfer matches. Choose Walk-in to type a name.</li>';
      const open = show && inp.value.trim().length > 0;
      ul.hidden = !open; inp.setAttribute('aria-expanded', String(open));
      if (active >= 0) inp.setAttribute('aria-activedescendant', 'gs-cust-o0'); else inp.removeAttribute('aria-activedescendant');
    }
    function move(n) {
      const inp = ui.$('#gs-sell-cust', f), opts = ui.$$('.gs-cust-opt', f); if (!opts.length) return;
      active = (active + n + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.classList.toggle('is-active', i === active); o.setAttribute('aria-selected', String(i === active)); });
      inp.setAttribute('aria-activedescendant', opts[active].id); opts[active].scrollIntoView({ block: 'nearest' });
    }
    function pick(kind, id) {
      d.cust = { kind: kind, id: id };
      if (kind === 'member' && canCharge(custDoc(d.cust)) && !d.payChosen) d.pay = 'account';
      clearErr(); drawFile(); drawPay();
      const x = ui.$('[data-gs-cust-clear]', f); if (x) x.focus();
    }
    function clearErr() { ui.$$('.field-error', f).forEach(function (x) { x.remove(); }); ui.$$('.invalid', f).forEach(function (x) { x.classList.remove('invalid'); }); }
    function err(sel, msg) { const i = ui.$(sel, f); if (!i) return; i.classList.add('invalid'); (i.closest('.gs-cust-wrap') || i).insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }

    f.addEventListener('click', function (e) {
      const b = e.target.closest('button'); if (!b || !f.contains(b) || b.disabled) return;
      const seg = b.closest('.segmented');
      if (seg && seg.dataset.name === 'amt') {
        d.custom = b.dataset.value === 'custom'; if (!d.custom) d.amount = +b.dataset.value;
        setSeg('amt', b.dataset.value); ui.$('.gs-sell-custom', f).hidden = !d.custom; clearErr();
        if (d.custom) ui.$('[name=custom]', f).focus();
        label();
      } else if (seg && seg.dataset.name === 'who') {
        d.who = b.dataset.value; setSeg('who', d.who); clearErr();
        ui.$('.gs-sell-file', f).hidden = d.who !== 'file'; ui.$('.gs-sell-walk', f).hidden = d.who !== 'walk';
        drawPay();
        const i = ui.$(d.who === 'walk' ? '[name=buyerName]' : '#gs-sell-cust', f); if (i) i.focus();
      } else if (seg && seg.dataset.name === 'pay') { d.pay = b.dataset.value; d.payChosen = true; drawPay(); }
      else if (b.hasAttribute('data-gs-cust-clear')) { d.cust = null; drawFile(); drawPay(); const i = ui.$('#gs-sell-cust', f); if (i) i.focus(); }
    });
    f.addEventListener('input', function (e) {
      const t = e.target; t.classList.remove('invalid'); const fld = t.closest('.field'), er = fld && fld.querySelector('.field-error'); if (er) er.remove();
      if (t.id === 'gs-sell-cust') list(true);
      if (t.name === 'custom') label();
    });
    f.addEventListener('keydown', function (e) {
      if (e.target.id !== 'gs-sell-cust') return;
      const ul = ui.$('#gs-cust-list', f), open = ul && !ul.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) list(true); else move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); const o = open && ui.$$('.gs-cust-opt', f)[active]; if (o) pick(o.dataset.kind, o.dataset.id); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); list(false); }
    });
    f.addEventListener('focusout', function (e) { if (e.target.id === 'gs-sell-cust') setTimeout(function () { const i = ui.$('#gs-sell-cust', f); if (i && document.activeElement !== i) list(false); }, 120); });
    f.addEventListener('pointerdown', function (e) { if (e.target.closest('.gs-cust-opt')) e.preventDefault(); });
    f.addEventListener('click', function (e) { const o = e.target.closest('.gs-cust-opt'); if (o) pick(o.dataset.kind, o.dataset.id); });
    drawFile(); drawPay();

    function submit(api) {
      clearErr();
      const v = ui.formData(f), a = amount(), c = cust();
      let ok = true;
      if (!(a >= st.min && a <= st.max && Math.round(a) === a) && (d.custom || !(a > 0))) { err('[name=custom]', 'Choose a whole amount from ' + fmt.money0(st.min) + ' to ' + fmt.money0(st.max) + '.'); ok = false; }
      if (d.who === 'file' && !c) { err('#gs-sell-cust', 'Find the buyer, or choose Walk-in.'); ok = false; }
      if (d.who === 'walk' && String(v.buyerName || '').length < 2) { err('[name=buyerName]', 'Enter the buyer’s name.'); ok = false; }
      if (d.who === 'walk' && v.buyerEmail && !EMAIL_RE.test(v.buyerEmail)) { err('[name=buyerEmail]', 'That email address does not look right.'); ok = false; }
      if (v.toEmail && !EMAIL_RE.test(v.toEmail)) { err('[name=toEmail]', 'That email address does not look right.'); ok = false; }
      if (d.pay === 'account' && !canCharge(c)) { ui.toast('Only an active member can charge to an account. Take payment at the counter.', 'bad'); ok = false; }
      if (!ok) { const i = ui.$('.invalid', f); if (i) i.focus(); return false; }
      const buyer = c ? { memberId: c.kind === 'member' ? c.id : null, publicPlayerId: c.kind === 'public' ? c.id : null, name: c.name, email: c.doc.email || '' }
        : { memberId: null, publicPlayerId: null, name: v.buyerName, email: String(v.buyerEmail || '').toLowerCase() };
      const sale = { amount: a, recipient: { name: v.toName || '', email: v.toEmail || '' }, message: v.message || '', from: v.from || (v.toName ? buyer.name : ''), buyer: buyer, source: 'staff', by: staffName() };
      if (d.pay === 'account') { sell(sale, null); return; }
      const T = Club.teeSheet && Club.teeSheet.takePayment;
      if (!T) { ui.toast('The golf shop till could not open. Reload the page and try again.', 'bad'); return false; }
      T({ eyebrow: 'Gift card sale', name: buyer.name, kind: c ? (c.kind === 'member' ? 'Member, paying at the golf shop' : 'Public golfer') : 'Walk-in',
        lines: [{ name: 'Gift card for ' + (sale.recipient.name || 'a guest'), qty: 1, price: a }],
        onDone: function (pay) { sell(sale, pay); api.close(); } });
      return false;
    }
    function sell(sale, pay) {
      const rec = Club.undo.track(function () { return G.purchase(Object.assign({}, sale, { pay: pay ? { method: 'counter', till: pay } : { method: 'account' } })); });
      const out = rec.result, card = out.card, lb = G.label(card);
      let sold = null;
      const back = pay && pay.rest > 0 ? (pay.method === 'cash' ? '. Give back the cash' : '. Refund the card on the terminal') : '';
      Club.undo.offer(lb + ' sold' + (pay ? '' : ', ' + fmt.money(card.amount) + ' charged to ' + sale.buyer.name + '’s account'), rec, {
        after: function () { if (sold && document.body.contains(sold.el)) sold.close(); if (after) after(); },
        undone: lb + ' voided and the sale reversed' + back });
      if (after) after();
      sold = soldModal(card, out.receipt);
    }
  }
  /** After a sale: the card, how it was paid, and Print (the card only, as the online card prints) or the receipt. */
  function soldModal(card, rc) {
    const api = ui.modal({ eyebrow: G.label(card), title: 'Gift card sold',
      body: '<div class="gcv-wrap">' + G.cardHTML(card) + '</div><p class="gs-sold-pay">' + Club.icon('check') + '<span>' + esc(card.payment && card.payment.method === 'account' ? 'Charged to ' + (card.buyer.name || 'the member') + '’s account' : card.payment ? card.payment.label : '') + ' · ' + esc(fmt.money(rc ? rc.total : card.amount)) + '</span></p>',
      actions: [{ label: 'Close', kind: 'ghost' }].concat(rc ? [{ label: 'Receipt', kind: 'ghost', icon: 'billing', onClick: function () { Club.receipts.open(rc.id); return false; } }] : [])
        .concat([{ label: 'Print gift card', kind: 'primary', icon: 'print', onClick: function () {
          document.body.classList.add('rc-printing'); window.addEventListener('afterprint', stopPrinting, { once: true }); window.print(); return false;
        } }]), onClose: stopPrinting });
    if (api.duplicate) return api;
    api.el.classList.add('gcv-modal', 'gs-sold');
    if (api.el.parentNode) api.el.parentNode.classList.add('rc-overlay');
    return api;
  }

  /* ---------------- Page ---------------- */
  function render(view, params) {
    view.classList.add('gs-page');
    view.innerHTML = ui.pageHeader({ eyebrow: 'Hospitality', title: 'Gift cards', subtitle: 'Sold at the golf shop, on the public site and in the members’ portal. Good for green fees, the pro shop and the Gallery Taphouse &amp; Grill.',
      actions: ui.btn('Online amounts', { kind: 'ghost', icon: 'settings', action: 'gs-settings' }) + ui.btn('Sell gift card', { kind: 'primary', icon: 'plus', action: 'gs-sell' }) }) +
      '<div class="gs-stats"></div>' +
      '<section class="panel gs-look" data-reveal><div class="panel-body"><form class="gs-look-form" novalidate><label class="label-caps" for="gs-look-in">Look up a gift card</label>' +
        '<div class="gs-look-row"><input class="input gs-look-in" id="gs-look-in" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="Type or scan the 12-character code">' +
        '<button type="submit" class="btn btn-primary">' + Club.icon('search') + '<span>Look up</span></button></div><div class="gs-look-msg" aria-live="polite"></div></form></div></section>' +
      '<section class="panel gs-list" data-reveal><div class="panel-head gs-list-head"><div><div class="eyebrow">All cards</div><h3>Gift cards</h3></div><div class="gs-tools">' +
        '<label class="gs-search">' + Club.icon('search') + '<input class="input" type="search" name="gsq" placeholder="Name, email or code" aria-label="Search gift cards" value="' + esc(state.q) + '"></label>' +
        ui.segmented([{ value: 'active', label: 'Active' }, { value: 'used', label: 'Used' }, { value: 'void', label: 'Void' }, { value: 'all', label: 'All' }], state.filter, 'gs-filter') + '</div></div>' +
      '<div class="panel-body flush gs-table"></div></section>';

    function drawStats() {
      const all = G.all(), ms = monthStart();
      const active = all.filter(function (c) { return G.state(c) === 'active'; });
      const sold = all.filter(function (c) { return c.date >= ms; });
      const red = all.reduce(function (a, c) { return a + (c.history || []).filter(function (e) { return e.type === 'redeem' && e.date >= ms; }).reduce(function (x, e) { return x - e.amount; }, 0); }, 0);
      ui.$('.gs-stats', view).innerHTML = ui.stats([
        { label: 'Active cards', value: active.length },
        { label: 'Outstanding balance', value: r2(active.reduce(function (a, c) { return a + c.balance; }, 0)), prefix: '$', decimals: 2 },
        { label: 'Sold this month', value: r2(sold.reduce(function (a, c) { return a + c.amount; }, 0)), prefix: '$', decimals: 2, meta: sold.length + (sold.length === 1 ? ' card' : ' cards') },
        { label: 'Redeemed this month', value: r2(red), prefix: '$', decimals: 2 }
      ]);
    }
    function drawTable() {
      const list = filtered(), host = ui.$('.gs-table', view);
      if (!list.length) {
        host.innerHTML = ui.empty({ icon: 'gift', title: G.all().length ? 'No gift cards match' : 'No gift cards sold yet', text: G.all().length ? 'Try another search or filter.' : 'Cards sold at the golf shop, on the public site or in the members’ portal appear here.' });
        return;
      }
      host.innerHTML = '<table class="table gs-tbl"><thead><tr><th>Code</th><th>For</th><th class="gs-col-by">Bought by</th><th class="gs-col-date">Bought</th><th class="num">Amount</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>' +
        list.slice(0, 200).map(function (c) {
          return '<tr class="gs-tr" data-gc="' + esc(c.id) + '" tabindex="0" aria-label="' + esc(G.label(c) + ', ' + (c.recipient.name || '')) + '"><td class="gs-code" data-l="Code">' + esc(G.codeText(c)) + '</td><td data-l="For">' + esc(c.recipient.name || '') + '</td>' +
            '<td class="gs-col-by" data-l="Bought by">' + esc(c.buyer.memberId ? Club.members.name(c.buyer.memberId) : c.buyer.name || 'Guest') + '</td><td class="gs-col-date" data-l="Bought">' + esc(fmt.dateShort(c.date)) + '</td>' +
            '<td class="num" data-l="Amount">' + esc(fmt.money(c.amount)) + '</td><td class="num gs-balcell" data-l="Balance">' + esc(fmt.money(c.balance)) + '</td><td data-l="Status">' + badge(c) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    pageRefresh = function () { if (document.body.contains(view)) refresh(); };
    function refresh() { drawStats(); drawTable(); ui.$$('[data-reveal]', view).forEach(function (n) { n.classList.add('revealed'); }); ui.$$('[data-count]', view).forEach(function (n) { const dec = +(n.dataset.decimals || 0); n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }); }

    const look = ui.$('.gs-look-form', view), lin = ui.$('.gs-look-in', view);
    lin.addEventListener('input', function () { lin.value = lin.value.toUpperCase(); lin.classList.remove('invalid'); ui.$('.gs-look-msg', view).textContent = ''; });
    look.addEventListener('submit', function (e) {
      e.preventDefault();
      const c = G.find(lin.value);
      if (!c) { lin.classList.add('invalid'); ui.$('.gs-look-msg', view).innerHTML = '<span class="field-error">' + esc(G.normalize(lin.value) ? 'No gift card with that code.' : 'Enter or scan a code.') + '</span>'; lin.focus(); return; }
      lin.value = ''; openCard(c.id, refresh);
    });
    ui.on(view, 'click', '.gs-tr', function (e, tr) { openCard(tr.dataset.gc, refresh); });
    ui.on(view, 'keydown', '.gs-tr', function (e, tr) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(tr.dataset.gc, refresh); } });
    ui.on(view, 'click', '.segmented[data-name=gs-filter] button', function (e, b) { state.filter = b.dataset.value; ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); drawTable(); });
    ui.on(view, 'input', 'input[name=gsq]', function (e, i) { state.q = i.value; drawTable(); });
    ui.on(view, 'click', '[data-action=gs-settings]', function () { settingsModal(refresh); });
    ui.on(view, 'click', '[data-action=gs-sell]', function () { sellModal(refresh); });
    drawStats(); drawTable();
    if (params[0]) setTimeout(function () { openCard(params[0], refresh); }, 80);
    const off = S.subscribe('giftCards', function () { if (!document.querySelector('.overlay')) refresh(); });
    return function () { off(); };
  }

  Club.register({
    id: 'giftcards', label: 'Gift cards', icon: 'gift', section: 'Hospitality', order: 22,
    search: function (q) {
      const n = G.normalize(q); q = q.toLowerCase();
      return G.all().filter(function (c) { return (n.length >= 4 && c.code.indexOf(n) >= 0) || (c.recipient.name + ' ' + c.buyer.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (c) { return { label: G.label(c) + ', ' + c.recipient.name, sub: fmt.money(c.balance) + ' of ' + fmt.money(c.amount), href: 'giftcards/' + c.id, icon: 'gift' }; });
    },
    render: render
  });
})();
