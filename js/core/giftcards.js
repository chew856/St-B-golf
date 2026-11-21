/* Club.giftcards: gift cards for green fees, the pro shop and the Gallery Taphouse & Grill, on all three sites.
   Club.checkout: the shared pay panel (member account, a card typed fresh each time, a gift card) used by the shop,
   takeout and gift card pages of the portal and the public site, and the public tee time payment. Loaded after js/core/receipts.js, before any module.

   Gift card doc ('giftCards'):
     { id ('gc_…'), code ('7Q4MH2XC7KQ2', 12 characters, no 0 O 1 I L), amount (first value, CAD), balance, status: 'active'|'void',
       date ('YYYY-MM-DD' bought), recipient: { name, email }, message, from (the name it is signed with),
       buyer: { memberId|null, publicPlayerId|null, name, email }, source ('public'|'portal'|'staff'),
       payment: { method: 'account'|'card'|'cash'|'gift', label, receiptId, chargeId }, voidedAt, voidReason,
       history: [{ id, at, date, type: 'issue'|'redeem'|'refund'|'void', amount (+ adds, - takes), balance (after), where, refId, note, by }] }
   Where a card was used (history.where): 'proshop' (golf shop till, also green fees), 'dining' (Gallery checks), 'public'
   (tee time paid online), 'takeout', 'desk' (redeemed by hand on the staff Gift cards page).

   Club.giftcards.find(code) / get(id) / check(code) -> { ok, card, msg } / label(card) 'Gift card ending 7KQ2' / codeText(card)
   Club.giftcards.purchase({ amount, recipient, message, from, buyer, source, pay: { method, brand, last4 } }) -> { card, receipt }
     pay.till: a sale at the golf shop counter, the tee sheet till's result (staff Gift cards page, Sell gift card)
   Club.giftcards.redeem(id, amount, { where, refId, note, by }) -> { ok, card, entry, msg }   partial amounts keep the rest
   Club.giftcards.refund(id, amount, ctx) / void(id, reason, by)
   Club.giftcards.receipt(o)       one receipt for a sale paid partly or fully by gift card (methodLabel names both)
   Club.giftcards.cardHTML(card) / open(card)   the printable gift card, and a modal to print or save it as a PDF
   Club.giftcards.applyBox(host, { site, amount(), onChange(state) })  "Use a gift card": code, Apply, applied state
   Club.giftcards.settleTeeTime(payment, gift)  a public tee time payment that used a gift card (js/public/book.js)
   Club.giftcards.tillHTML / tillApply / tillState   the staff till widget (js/modules/proshop.js, js/modules/dining.js)
   Club.checkout.mount(host, { site, member, player, account, gift, pickup, amount(), onChange }) -> { validate(), remember(r), due(), refresh(), fail(msg), describe(), summaryHTML() }
   Club.checkout.steps(host, { site, steps, back, leave(id), enter(id) }) -> { go(id), next(), at(), fail(msg), body(id) }
     The checkout flows (shop and takeout on both sites, gift card purchase on both, the public tee time payment) run as
     steps: 1 Details (the flow's own fields), 2 Payment (this pay panel), 3 Review (items, totals, how it is paid, the button).

   Settings ($giftCardSettings): preset amounts and the custom range are placeholders for the club to confirm. */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  /* Stored text (notes, titles) is always English: Club.fmtEn on the public site and portal, where Club.fmt can be French. */
  const EN = Club.fmtEn || fmt;
  const COLL = 'giftCards';
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  /* Placeholders: the club has not published gift card amounts. Staff change them on the Gift cards page. */
  const DEFAULTS = { presets: [25, 50, 100, 150], min: 10, max: 500 };
  const WHERE = { proshop: 'Golf shop', dining: 'Gallery Taphouse & Grill', public: 'Tee time paid online', takeout: 'Gallery takeout', desk: 'Golf shop', giftcards: 'Gift card sale', shop: 'Online golf shop' };

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function today() { return Club.date.today(); }
  function settings() { return Object.assign({}, DEFAULTS, S.getObj('giftCardSettings', {}) || {}); }
  function saveSettings(p) { S.setObj('giftCardSettings', Object.assign({}, S.getObj('giftCardSettings', {}) || {}, p)); }

  /* ---------------- Codes ---------------- */
  function normalize(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function newCode() {
    let c;
    do { c = ''; for (let i = 0; i < 12; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; } while (find(c));
    return c;
  }
  function groups(code) { return normalize(code).replace(/(.{4})(?=.)/g, '$1 '); }
  function codeText(card) { return groups(card && card.code); }
  function last4(card) { return String(card && card.code || '').slice(-4); }
  function label(card) { return 'Gift card ending ' + last4(card); }
  function all() { return S.all(COLL); }
  function get(id) { return S.find(COLL, id); }
  function find(code) { const n = normalize(code); return n ? all().find(function (c) { return c.code === n; }) || null : null; }
  function state(card) { return !card ? 'none' : card.status === 'void' ? 'void' : r2(card.balance) <= 0 ? 'used' : 'active'; }
  function check(code) {
    const n = normalize(code);
    if (!n) return { ok: false, msg: 'Enter the gift card code.' };
    if (n.length !== 12) return { ok: false, msg: 'Gift card codes have 12 letters and numbers. Check the code and try again.' };
    const card = find(n);
    if (!card) return { ok: false, msg: 'We could not find that gift card. Check the code and try again.' };
    if (card.status === 'void') return { ok: false, card: card, msg: 'This gift card is no longer valid. Please call the golf shop at ' + Club.info.phone + '.' };
    if (r2(card.balance) <= 0) return { ok: false, card: card, msg: 'This gift card has been fully used.' };
    return { ok: true, card: card };
  }

  /* ---------------- Ledger ---------------- */
  function entry(card, type, amount, ctx) {
    ctx = ctx || {};
    const bal = r2((card.balance || 0) + amount);
    const e = { id: S.uid('gce'), at: new Date().toISOString(), date: today(), type: type, amount: r2(amount), balance: bal, where: ctx.where || null, refId: ctx.refId || null, note: ctx.note || null, by: ctx.by || null };
    return { e: e, bal: bal };
  }
  function issue(o) {
    const amount = r2(o.amount);
    const card = { id: S.uid('gc'), code: newCode(), amount: amount, balance: 0, status: 'active', date: today(),
      recipient: { name: String(o.recipient && o.recipient.name || '').trim(), email: String(o.recipient && o.recipient.email || '').trim().toLowerCase() },
      message: String(o.message || '').trim().slice(0, 240), from: String(o.from || '').trim().slice(0, 60),
      buyer: Object.assign({ memberId: null, publicPlayerId: null, name: '', email: '' }, o.buyer || {}), source: o.source || 'public',
      payment: null, voidedAt: null, voidReason: null, history: [] };
    const x = entry(card, 'issue', amount, { where: 'giftcards', note: 'Gift card bought', by: o.by });
    card.balance = x.bal; card.history = [x.e];
    return S.insert(COLL, card);
  }
  /** Sell a gift card: the card, then the payment (member account charge, or a card receipt). One receipt per card. */
  function purchase(o) {
    const card = issue(o);
    const pay = o.pay || {};
    const who = card.recipient.name || 'a guest';
    const lines = [{ name: 'Gift card for ' + who, qty: 1, price: card.amount }];
    const note = label(card) + (card.recipient.email ? ', for ' + card.recipient.email : '') + '. Valid for green fees, the pro shop and the Gallery Taphouse & Grill.';
    let rc = null, chargeId = null, methodLabel;
    if (pay.method === 'account' && card.buyer.memberId) {
      const ch = Club.chargeMember(card.buyer.memberId, { description: 'Gift card ' + last4(card) + ' for ' + who, category: 'Other', amount: card.amount, source: 'giftcards', refId: card.id, date: today(), title: 'Gift card', lines: lines });
      chargeId = ch ? ch.id : null;
      rc = Club.receipts ? Club.receipts.forRef('giftcards', card.id)[0] || null : null;
      if (rc && !rc.note) rc = S.update('receipts', rc.id, Object.assign({ note: note }, o.source === 'staff' ? { channel: 'counter' } : {}));
      methodLabel = 'Charged to your member account';
    } else if (pay.till) {
      /* Sold at the golf shop counter (staff Gift cards page): pay is the tee sheet till's result (Club.teeSheet.takePayment):
         card or cash, another gift card, and any discount (a line on the receipt; the card keeps its full value). */
      const t = pay.till, g = t.gift && t.gift.amount > 0 ? t.gift : null, rest = r2(t.rest);
      const m = rest > 0 ? (t.method === 'cash' ? 'cash' : 'card') : null;
      if (g) redeem(g.id, g.amount, { where: 'giftcards', refId: card.id, note: 'Paid for ' + label(card), by: o.by });
      methodLabel = g ? 'Gift card ending ' + g.last4 + (m ? ' and ' + m : '') : m === 'cash' ? 'Cash' : m ? 'Card' : 'No charge';
      if (Club.receipts) rc = Club.receipts.create({ memberId: card.buyer.memberId, publicPlayerId: card.buyer.memberId ? null : card.buyer.publicPlayerId,
        name: card.buyer.memberId || card.buyer.publicPlayerId ? undefined : card.buyer.name || undefined,
        title: 'Gift card', lines: lines.concat((t.lines || []).filter(function (l) { return l.price < 0; })), total: t.total, method: m || 'other', methodLabel: methodLabel,
        source: 'giftcards', refId: card.id, channel: 'counter', fresh: true,
        tenders: (g ? [{ method: 'gift', amount: g.amount, ref: g.id }] : []).concat(m ? [{ method: m, amount: rest }] : []),
        note: note + (t.discount ? ' Discount: ' + t.discount.reason + '.' : '') + (t.change > 0 ? ' Cash tendered ' + EN.money(t.cashTendered) + ', change ' + EN.money(t.change) + '.' : '') });
    } else {
      methodLabel = Club.receipts ? Club.receipts.cardLabel(pay.brand, pay.last4) : 'Card';
      if (Club.receipts) rc = Club.receipts.create({ memberId: card.buyer.memberId, publicPlayerId: card.buyer.memberId ? null : card.buyer.publicPlayerId,
        name: card.buyer.memberId || card.buyer.publicPlayerId ? undefined : card.buyer.name || undefined,
        title: 'Gift card', lines: lines, total: card.amount, method: 'card', methodLabel: methodLabel, source: 'giftcards', refId: card.id, note: note });
    }
    const out = S.update(COLL, card.id, { payment: { method: pay.method === 'account' ? 'account' : pay.till ? (pay.till.rest > 0 ? (pay.till.method === 'cash' ? 'cash' : 'card') : 'gift') : 'card', label: methodLabel, brand: pay.brand || null, last4: pay.last4 || null, receiptId: rc ? rc.id : null, chargeId: chargeId } });
    return { card: out, receipt: rc };
  }
  function redeem(id, amount, ctx) {
    const card = get(id); amount = r2(amount);
    if (!card) return { ok: false, msg: 'That gift card is not on file.' };
    if (card.status === 'void') return { ok: false, card: card, msg: 'This gift card has been voided.' };
    if (!(amount > 0)) return { ok: false, card: card, msg: 'Enter an amount greater than zero.' };
    if (amount > r2(card.balance) + 0.001) return { ok: false, card: card, msg: 'Only ' + fmt.money(card.balance) + ' is left on this gift card.' };
    const x = entry(card, 'redeem', -amount, ctx);
    const out = S.update(COLL, id, { balance: x.bal, history: (card.history || []).concat([x.e]) });
    return { ok: true, card: out, entry: x.e, amount: amount };
  }
  function refund(id, amount, ctx) {
    const card = get(id); amount = r2(amount);
    if (!card || !(amount > 0)) return null;
    const x = entry(card, 'refund', amount, ctx);
    /* A voided card stays at zero: the refund is recorded but not added back. */
    if (card.status === 'void') { x.e.balance = card.balance; x.e.note = (x.e.note || 'Refund') + ' (card void, not added back)'; x.bal = card.balance; }
    return S.update(COLL, id, { balance: x.bal, history: (card.history || []).concat([x.e]) });
  }
  function voidCard(id, reason, by) {
    const card = get(id); if (!card || card.status === 'void') return card;
    const x = entry(card, 'void', -r2(card.balance), { where: 'desk', note: reason || 'Voided', by: by });
    return S.update(COLL, id, { status: 'void', balance: 0, voidedAt: new Date().toISOString(), voidReason: reason || '', history: (card.history || []).concat([x.e]) });
  }
  function history(card) { return (card && card.history || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }); }
  function redeemed(card) { return r2((card.history || []).reduce(function (a, e) { return a + (e.type === 'redeem' ? -e.amount : e.type === 'refund' ? -e.amount : 0); }, 0)); }

  /** One receipt for a sale paid partly or fully with a gift card. o: { memberId|publicPlayerId|name, title, lines, total, gift: { card, amount },
      rest: { method: 'account'|'card'|'cash', label, amount }, source, refId, chargeId, note }. The total is the whole sale. */
  function receipt(o) {
    if (!Club.receipts) return null;
    const g = o.gift, rest = o.rest || { amount: 0 };
    const restOn = r2(rest.amount) > 0;
    const parts = [label(g.card) + ': ' + EN.money(g.amount)];
    if (restOn) parts.push((rest.label || 'Card') + ': ' + EN.money(rest.amount));
    return Club.receipts.create({ memberId: o.memberId || null, publicPlayerId: o.memberId ? null : (o.publicPlayerId || null), name: o.name || undefined,
      kind: o.kind === 'credit' ? 'credit' : 'sale', title: o.title, lines: o.lines, total: o.total, method: restOn ? (rest.method || 'other') : 'other',
      methodLabel: label(g.card) + (restOn ? ' and ' + (rest.method === 'account' ? 'member account' : rest.label || 'card') : ''),
      source: o.source, refId: o.refId, chargeId: o.chargeId || null, note: [o.note, restOn ? parts.join('. ') + '.' : ''].filter(Boolean).join(' ') || null,
      tenders: [{ method: 'gift', amount: g.amount, ref: g.card.id, online: !!o.online }].concat(restOn ? [{ method: rest.method === 'account' ? 'account' : rest.method === 'cash' ? 'cash' : rest.method === 'card' ? 'card' : 'other', amount: rest.amount, online: !!o.online }] : []),
      channel: o.online ? 'online' : (o.channel || null) });
  }

  /* ---------------- The printable gift card ---------------- */
  function cardHTML(card) {
    const who = card.recipient && card.recipient.name;
    const voided = card.status === 'void';
    return '<article class="gcv' + (voided ? ' is-void' : '') + '" aria-label="' + esc(label(card)) + '">' +
      '<div class="gcv-face">' +
        '<div class="gcv-top">' + Club.logo('gcv-crest') + '<span class="gcv-club">' + esc(Club.info.name) + '</span></div>' +
        '<div class="gcv-kind">Gift card</div>' +
        '<div class="gcv-amt">' + esc(fmt.money(card.amount, Math.round(card.amount) !== card.amount)) + '</div>' +
        '<div class="gcv-valid">Green fees · Pro shop · Gallery Taphouse &amp; Grill</div>' +
      '</div>' +
      '<div class="gcv-body">' +
        (who ? '<p class="gcv-to">For <strong>' + esc(who) + '</strong></p>' : '') +
        (card.message ? '<p class="gcv-msg">' + esc(card.message) + '</p>' : '') +
        (card.from ? '<p class="gcv-from">From ' + esc(card.from) + '</p>' : '') +
        '<div class="gcv-code"><span class="gcv-code-l">Gift card code</span><span class="gcv-code-v">' + esc(codeText(card)) + '</span></div>' +
        (voided ? '<p class="gcv-void">This gift card has been voided.</p>' : '') +
        '<p class="gcv-fine">Use it at the golf shop or the Gallery Taphouse &amp; Grill, or enter the code when you pay for a tee time online. Check the balance on the club’s public site. ' + esc(Club.info.address) + ' · ' + esc(Club.info.phone) + '</p>' +
      '</div>' +
    '</article>';
  }
  function stopPrinting() { document.body.classList.remove('rc-printing'); }
  /** The gift card in a modal with Print or save as PDF (the receipt print rules in css/receipts.css print only this overlay). */
  function open(idOrCard) {
    const card = typeof idOrCard === 'string' ? get(idOrCard) : idOrCard;
    if (!card) { ui.toast('That gift card is not available', 'bad'); return null; }
    const api = ui.modal({ eyebrow: label(card), title: 'Your gift card', body: '<div class="gcv-wrap">' + cardHTML(card) + '</div>', actions: [
      { label: 'Close', kind: 'ghost' },
      { label: 'Print or save as PDF', kind: 'primary', icon: 'print', onClick: function () {
        document.body.classList.add('rc-printing');
        window.addEventListener('afterprint', stopPrinting, { once: true });
        window.print();
        return false;
      } }
    ], onClose: stopPrinting });
    if (api.duplicate) return api;
    api.el.classList.add('gcv-modal');
    if (api.el.parentNode) api.el.parentNode.classList.add('rc-overlay');
    return api;
  }

  /* ---------------- "Use a gift card" box (online payments) ---------------- */
  /** applyBox(host, { site: 'public'|'portal', amount() -> total due, onChange(state|null), inline }).
      state: { card, amount (applied), due (left to pay), covers, last4, label }.
      inline: the code field shows straight away, with no Cancel (Club.checkout's "Gift card" choice). */
  function applyBox(host, o) {
    o = o || {};
    const link = o.site === 'portal' ? 'p-link' : 'pub-link';
    let applied = null, open = !!o.inline, asked = !o.inline;   /* asked: focus the field only once the customer acts */
    function compute() {
      if (!applied) return null;
      const card = get(applied) || null; if (!card) return null;
      const total = r2(o.amount ? o.amount() : 0);
      const amount = r2(Math.min(card.balance, total));
      return { card: card, amount: amount, due: r2(total - amount), covers: amount >= total - 0.001 && total > 0, last4: last4(card), label: label(card) };
    }
    function draw(err) {
      const s = compute();
      if (s) {
        host.innerHTML = '<div class="gc-box is-applied">' + Club.icon('gift', 'gc-box-icon') +
          '<div class="gc-box-main"><span class="gc-box-t">' + esc(s.label) + '</span>' +
          '<span class="gc-box-s">' + esc(fmt.money(s.amount)) + ' applied · ' + esc(fmt.money(r2(s.card.balance - s.amount))) + ' left on the card after this</span></div>' +
          '<button type="button" class="' + link + ' gc-box-rm" data-gc="remove">Remove</button></div>';
      } else if (open) {
        host.innerHTML = '<div class="gc-box is-open"><div class="field gc-box-field"><label for="gc-code-' + (o.site || 'x') + '">Gift card code</label>' +
          '<div class="gc-box-row"><input class="input gc-box-in" id="gc-code-' + (o.site || 'x') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="XXXX XXXX XXXX">' +
          '<button type="button" class="btn gc-box-apply" data-gc="apply">Apply</button></div>' +
          (err ? '<span class="field-error">' + esc(err) + '</span>' : '') + '</div>' +
          (o.inline ? '' : '<button type="button" class="' + link + ' gc-box-cancel" data-gc="cancel">Cancel</button>') + '</div>';
        const inp = ui.$('.gc-box-in', host);
        if (err) inp.classList.add('invalid');
        if (asked) setTimeout(function () { if (inp && document.body.contains(inp)) inp.focus(); }, 30);
      } else {
        host.innerHTML = '<button type="button" class="' + link + ' gc-box-open" data-gc="open">' + Club.icon('gift') + '<span>Use a gift card</span></button>';
      }
      if (o.onChange) o.onChange(s);
    }
    function apply() {
      const inp = ui.$('.gc-box-in', host); const v = inp ? inp.value : '';
      const r = check(v);
      if (!r.ok) { draw(r.msg); const i2 = ui.$('.gc-box-in', host); if (i2) i2.value = v; return; }
      applied = r.card.id; open = false; draw();
    }
    host.addEventListener('click', function (e) {
      const b = e.target.closest('[data-gc]'); if (!b || !host.contains(b)) return;
      const a = b.dataset.gc;
      asked = true;
      if (a === 'open') { open = true; draw(); }
      else if (a === 'cancel') { open = false; draw(); }
      else if (a === 'remove') { applied = null; open = !!o.inline; draw(); }
      else if (a === 'apply') apply();
    });
    host.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('gc-box-in')) { e.preventDefault(); asked = true; apply(); } });
    host.addEventListener('input', function (e) { if (e.target.classList.contains('gc-box-in')) { e.target.value = e.target.value.toUpperCase(); } });
    draw();
    return {
      state: compute,
      /** Right before taking payment: the card may have been used elsewhere since it was applied. '' when fine. */
      recheck: function () {
        const s = compute(); if (!applied) return '';
        if (!s || s.card.status === 'void') { applied = null; draw(); return 'That gift card can no longer be used. It has been removed from this payment.'; }
        if (s.amount <= 0) { applied = null; draw(); return 'That gift card has no balance left. It has been removed from this payment.'; }
        return '';
      },
      refresh: function () { draw(); },
      clear: function () { applied = null; open = !!o.inline; draw(); },
      focus: function () { const i = ui.$('.gc-box-in', host); if (i) i.focus(); }
    };
  }

  /** A public tee time payment that used a gift card (js/public/book.js writes the payment, then calls this): takes the
      gift card amount, notes the split on the payment and makes its one receipt with the gift card as the method. */
  function settleTeeTime(payment, g) {
    const card = get(g.card.id); if (!card) return payment;
    const amount = r2(Math.min(card.balance, g.amount, payment.amount));
    const res = redeem(card.id, amount, { where: 'public', refId: payment.id, note: 'Tee time ' + (payment.teeDate ? EN.dateShort(payment.teeDate) : '') + (payment.teeTime ? ' at ' + EN.time(payment.teeTime) : '') });
    if (!res.ok) return payment;
    const cardAmount = r2(payment.amount - amount);
    const p = S.update('publicPayments', payment.id, { giftCardId: card.id, giftLast4: last4(card), giftAmount: amount, cardAmount: cardAmount });
    const conf = 'Confirmation ' + String(payment.id).replace(/^[a-z]+_?/i, '').toUpperCase() + '.';
    const tee = payment.teeDate ? 'Tee time ' + (EN.longDate ? EN.longDate(payment.teeDate) : window.Pub ? Pub.longDate(payment.teeDate) : EN.date(payment.teeDate)) + (payment.teeTime ? ' at ' + EN.time(payment.teeTime) : '') + (payment.holes ? ', ' + payment.holes + ' holes' : '') + '. ' : '';
    receipt({ publicPlayerId: payment.publicPlayerId, title: 'Tee time' + (payment.teeDate ? ', ' + EN.dateShort(payment.teeDate) : ''),
      lines: (payment.lines || []).map(function (l) { return { name: l.label, qty: 1, price: l.amount }; }), total: payment.amount,
      gift: { card: card, amount: amount }, rest: { method: 'card', label: Club.receipts.cardLabel(payment.brand, payment.last4), amount: cardAmount },
      source: 'public', refId: payment.id, note: tee + conf, online: true });
    return p;
  }
  function paidWith(pay) {
    if (!pay || !pay.giftCardId) return '';
    const g = 'Gift card ending ' + (pay.giftLast4 || '');
    return +pay.cardAmount > 0 ? g + ' and ' + Club.receipts.cardLabel(pay.brand, pay.last4) : g;
  }
  /* A refunded tee time puts the gift card part back on the card (js/public/me.js refunds the payment). The credit receipt
     is made here first, naming the gift card, so the site's own refund receipt is not added on top. */
  S.subscribe('publicPayments', function () {
    S.all('publicPayments').forEach(function (p) {
      if (p.status !== 'refunded' || !p.giftCardId || !(+p.giftAmount > 0)) return;
      const card = get(p.giftCardId); if (!card) return;
      if ((card.history || []).some(function (e) { return e.type === 'refund' && e.refId === p.id; })) return;
      refund(card.id, p.giftAmount, { where: 'public', refId: p.id, note: 'Tee time cancelled online' });
      if (Club.receipts && !Club.receipts.forRef('public', p.id).some(function (r) { return r.kind === 'credit'; })) {
        try {
          Club.receipts.create({ publicPlayerId: p.publicPlayerId, kind: 'credit', title: 'Tee time refund' + (p.teeDate ? ', ' + EN.dateShort(p.teeDate) : ''),
            lines: (p.lines || []).map(function (l) { return { name: l.label, qty: 1, price: l.amount }; }), total: p.amount, method: +p.cardAmount > 0 ? 'card' : 'other',
            methodLabel: paidWith(p), source: 'public', refId: p.id, channel: 'online',
            tenders: [{ method: 'gift', amount: p.giftAmount, online: true, ref: card.id }].concat(+p.cardAmount > 0 ? [{ method: 'card', amount: p.cardAmount, online: true }] : []),
            note: label(card) + ': ' + EN.money(p.giftAmount) + ' back on the card.' + (+p.cardAmount > 0 ? ' ' + Club.receipts.cardLabel(p.brand, p.last4) + ': ' + EN.money(p.cardAmount) + ' refunded.' : '') });
        } catch (e) { console.error('Refund receipt failed for ' + p.id, e); }
      }
    });
  });

  /* ---------------- Staff till widget (pro shop ticket, Gallery check) ---------------- */
  /** tillState(applied { id }, total) -> { card, amount, due, covers } | null, with the amount capped at the balance and total. */
  function tillState(applied, total) {
    if (!applied) return null;
    const card = get(applied.id); if (!card || card.status === 'void') return null;
    total = r2(total);
    const amount = r2(Math.max(0, Math.min(card.balance, total)));
    return { card: card, amount: amount, due: r2(total - amount), covers: total > 0 && amount >= total - 0.001 };
  }
  function tillHTML(applied, total) {
    const s = tillState(applied, total);
    if (!s) return '<div class="gc-till"><button type="button" class="btn btn-sm gc-till-add" data-gc-till="add">' + Club.icon('gift') + '<span>Apply a gift card</span></button></div>';
    return '<div class="gc-till is-applied' + (s.covers ? ' is-covered' : '') + '">' +
      '<div class="gc-till-row"><span class="gc-till-l">' + Club.icon('gift') + '<span>' + esc(label(s.card)) + '</span></span><span class="num">−' + esc(fmt.money(s.amount)) + '</span></div>' +
      '<div class="gc-till-sub"><span>' + esc(fmt.money(r2(s.card.balance - s.amount))) + ' left on the card after this</span><button type="button" class="btn btn-ghost btn-sm" data-gc-till="remove">Remove</button></div>' +
      '<div class="gc-till-due"><span>' + (s.covers ? 'Paid in full by gift card' : 'Still to pay') + '</span><strong class="num">' + esc(fmt.money(s.due)) + '</strong></div></div>';
  }
  /** Staff enter or scan a code: tillApply({ total, onApply({ id }|null) }) opens a small modal showing the balance. */
  function tillApply(o) {
    const m = ui.modal({ eyebrow: 'Gift card', title: 'Apply a gift card', size: '',
      body: '<form class="gc-till-form" novalidate onsubmit="return false"><div class="field"><label for="gc-till-code">Gift card code</label><input class="input gc-till-in" id="gc-till-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="XXXX XXXX XXXX"></div><div class="gc-till-look" aria-live="polite"></div></form>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Apply', kind: 'primary', icon: 'check', onClick: function (api) {
        const inp = ui.$('.gc-till-in', api.body); const r = check(inp.value);
        ui.$$('.field-error', api.body).forEach(function (x) { x.remove(); }); inp.classList.remove('invalid');
        if (!r.ok) { inp.classList.add('invalid'); inp.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(r.msg) + '</span>'); inp.focus(); return false; }
        o.onApply({ id: r.card.id });
        ui.toast(label(r.card) + ' applied');
      } }] });
    if (m.duplicate) return;
    const inp = ui.$('.gc-till-in', m.body), look = ui.$('.gc-till-look', m.body);
    inp.addEventListener('input', function () {
      inp.value = inp.value.toUpperCase(); inp.classList.remove('invalid'); ui.$$('.field-error', m.body).forEach(function (x) { x.remove(); });
      const c = normalize(inp.value).length === 12 ? find(inp.value) : null;
      look.innerHTML = c ? '<div class="gc-till-found"><span>' + esc(label(c)) + (c.recipient && c.recipient.name ? ' · ' + esc(c.recipient.name) : '') + '</span><strong class="num">' + (c.status === 'void' ? 'Void' : esc(fmt.money(c.balance))) + '</strong></div>' +
        (c.status !== 'void' && c.balance > 0 ? '<p class="muted">' + esc(fmt.money(Math.min(c.balance, o.total))) + ' will be applied to this ' + esc(fmt.money(o.total)) + ' total.</p>' : '') : '';
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); const b = ui.$('.modal-foot .btn-primary', m.el); if (b) b.click(); } });
  }

  /* ---------------- Club.checkout: the pay panel for online orders ---------------- */
  /* No card is ever saved: every card payment is typed fresh, and only the brand and last four digits are kept (on the receipt). */
  function brandName(id) { const b = Club.cards.brands.find(function (x) { return x.id === id; }); return b ? b.name : 'Card'; }

  function checkout(host, o) {
    o = Object.assign({ site: 'public', member: null, player: null, account: false, gift: true, pickup: false }, o || {});
    const P = o.site === 'portal';
    const cls = P ? { opt: 'pa-opt', optT: 'pa-opt-title', optB: 'pa-opt-body', mark: 'pa-mark', newc: 'pa-newcard' }
      : { opt: 'pub-card-opt', optT: 'pub-card-opt-t', optB: 'pub-card-opt-main', mark: 'pub-mark', newc: 'pub-newcard' };
    const uid = Math.random().toString(36).slice(2, 7);
    let method = o.account ? 'account' : 'card';
    /* The way chosen in the list: 'account', 'card' or 'gift'. With a gift card, method is how any rest is paid. */
    let kind = method;
    let card = null, gift = null, lastCard = null;
    /* Full-width choices: Charge to my account (members, where allowed), Pay by card, Gift card. */
    /* pickup (the online golf shop only): pay at the golf shop counter when the order is collected. Nothing is taken now. */
    const kinds = (o.account ? [['account', 'billing', 'Charge to my account']] : []).concat([['card', 'card', 'Pay by card']], o.gift ? [['gift', 'gift', 'Gift card']] : [], o.pickup ? [['pickup', 'shop', 'Pay at pickup']] : []);
    function kindsHTML() {
      if (kinds.length < 2) return '';
      return '<div class="ck-methods" role="radiogroup" aria-label="How would you like to pay?">' + kinds.map(function (k) {
        return '<label class="' + cls.opt + ' ck-mopt"><input type="radio" name="ck-m-' + uid + '" value="' + k[0] + '"' + (kind === k[0] ? ' checked' : '') + '>' +
          '<span class="' + cls.mark + ' ck-mopt-icon">' + Club.icon(k[1]) + '</span><span class="' + cls.optB + '"><span class="' + cls.optT + '">' + esc(k[2]) + '</span></span></label>';
      }).join('') + '</div>';
    }
    host.innerHTML = '<div class="ck ck-' + o.site + '">' +
      kindsHTML() +
      (o.gift ? '<div class="ck-giftpane"' + (kind === 'gift' ? '' : ' hidden') + '><div class="ck-gift"></div>' +
        '<div class="ck-rest" hidden><p class="ck-rest-due"><span>Left to pay</span> <strong class="num ck-rest-amt"></strong></p>' +
          (o.account ? '<p class="ck-rest-h">Pay the rest with</p><div class="ck-rest-m">' + ui.segmented([{ value: 'account', label: 'Charge to my account' }, { value: 'card', label: 'Pay by card' }], method, 'ck-rest') + '</div>'
            : '<p class="ck-rest-h">Pay the rest by card</p>') + '</div></div>' : '') +
      (o.pickup ? '<div class="ck-pickup" hidden><p class="ck-acct-note">' + Club.icon('shop') + '<span>Pay at the golf shop when you pick up your order, by card, cash or gift card. Nothing is charged now.</span></p></div>' : '') +
      '<div class="ck-pay">' +
        (o.account ? '<p class="ck-acct-note">' + Club.icon('billing') + '<span>Added to your member account and shown on your next statement.</span></p>' : '') +
        '<div class="ck-card"' + (method === 'card' ? '' : ' hidden') + '>' +
          '<div class="' + cls.newc + ' ck-new"><div class="ck-cc"></div>' +
            (o.quiet ? '' : '<p class="field-hint">We keep only the card brand and the last four digits, for your receipt. Never the full number or the security code.</p>') +   /* quiet: the public booking, kept short */
            '<p class="field-hint">Demonstration site: try Visa 4242 4242 4242 4242 with any future expiry.</p>' +
          '</div></div>' +
      '</div>' +
      '<div class="ck-alert pub-alert" role="alert" hidden></div>' +
    '</div>';
    const root = ui.$('.ck', host);
    card = Club.cards.mount(ui.$('.ck-cc', root), {});
    const nm = ui.$('.cc-in-name', root), who = o.member || o.player;
    if (nm && who) { nm.value = who.firstName + ' ' + who.lastName; nm.dispatchEvent(new Event('input')); }
    function paint() {
      const g = gift ? gift.state() : null;
      if (kind !== 'gift') method = kind;
      const covered = kind === 'gift' && !!(g && g.covers), rest = kind === 'gift' && !!g && !covered;
      root.classList.toggle('is-covered', covered);
      root.dataset.kind = kind;
      const gp = ui.$('.ck-giftpane', root); if (gp) gp.hidden = kind !== 'gift';
      const rs = ui.$('.ck-rest', root); if (rs) { rs.hidden = !rest; if (rest) ui.$('.ck-rest-amt', rs).textContent = fmt.money(g.due); }
      /* With a gift card, the account or card part shows once a card is applied and something is left to pay. */
      ui.$('.ck-pay', root).hidden = (kind === 'gift' && !rest) || kind === 'pickup';
      const pk = ui.$('.ck-pickup', root); if (pk) pk.hidden = kind !== 'pickup';
      const c = ui.$('.ck-card', root); if (c) c.hidden = method !== 'card';
      const n = ui.$('.ck-acct-note', root); if (n) n.hidden = method !== 'account';
      if (o.onChange) o.onChange();
    }
    if (o.gift) gift = applyBox(ui.$('.ck-gift', root), { site: o.site, inline: true, amount: function () { return o.amount(); }, onChange: function () { if (root) paint(); } });
    root.addEventListener('click', function (e) {
      const b = e.target.closest('.segmented[data-name=ck-rest] button'); if (!b) return;
      method = b.dataset.value; ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); paint();
    });
    root.addEventListener('change', function (e) {
      if (e.target.name === 'ck-m-' + uid) {
        kind = e.target.value; fail('');
        if (kind === 'gift') { const sg = ui.$('.segmented[data-name=ck-rest] button.active', root); method = sg ? sg.dataset.value : o.account ? 'account' : 'card'; }
        if (kind !== 'gift' && gift && gift.state()) gift.clear(); else paint();
        if (kind === 'gift' && gift) gift.focus();
        return;
      }
    });
    paint();
    function fail(msg) {
      const al = ui.$('.ck-alert', root); if (!al) return;
      if (!msg) { al.hidden = true; return; }
      al.innerHTML = Club.icon('alert') + '<div><p>' + esc(msg) + '</p></div>'; al.hidden = false;
      al.classList.remove('shake'); void al.offsetWidth; al.classList.add('shake');
      al.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return {
      el: root,
      due: function () { const g = gift ? gift.state() : null; return g ? g.due : r2(o.amount()); },
      gift: function () { return gift ? gift.state() : null; },
      method: function () { return method; },
      kind: function () { return kind; },
      refresh: function () { if (gift) gift.refresh(); else paint(); },
      fail: fail,
      /** How the amount is being paid, for a Review step: [{ icon, brand, text, amount }] from what is chosen now
          (the card named is the one last checked by validate()). */
      describe: function () {
        const g = gift ? gift.state() : null, out = [];
        if (kind === 'pickup') return [{ icon: 'shop', brand: null, text: 'Pay at pickup', amount: r2(o.amount()) }];
        if (g && g.amount > 0) out.push({ icon: 'gift', brand: null, text: g.label, amount: g.amount });
        if (g && g.covers) return out;
        const rest = g ? g.due : r2(o.amount());
        if (method === 'account') { out.push({ icon: 'billing', brand: null, text: 'Charged to your member account', amount: rest }); return out; }
        const c = lastCard;
        out.push({ icon: 'card', brand: c ? c.brand : null, text: c ? brandName(c.brand) + ' ending ' + c.last4 : 'New card', amount: rest });
        return out;
      },
      summaryHTML: function () {
        return '<ul class="ck-rv-pay">' + this.describe().map(function (x) {
          return '<li><span class="' + cls.mark + ' ck-rv-mark">' + (x.brand ? Club.cards.mark(x.brand, 16) : Club.icon(x.icon)) + '</span><span class="ck-rv-t">' + esc(x.text) + '</span><span class="num">' + esc(fmt.money(x.amount)) + '</span></li>';
        }).join('') + '</ul>';
      },
      /** { ok, method: 'account'|'card'|'gift'|'pickup', card: { brand, last4, expMonth, expYear, name }|null, save (always false: no card is saved), gift: state|null, due } */
      validate: function () {
        fail('');
        const g = gift ? gift.state() : null;
        if (kind === 'pickup') return { ok: true, method: 'pickup', card: null, save: false, gift: null, due: r2(o.amount()) };
        if (kind === 'gift' && !g) { fail('Enter your gift card code and choose Apply, or choose another way to pay.'); if (gift) gift.focus(); return { ok: false }; }
        if (gift) { const gm = gift.recheck(); if (gm) { fail(gm); return { ok: false }; } }
        const due = g ? g.due : r2(o.amount());
        if (g && g.covers) return { ok: true, method: 'gift', card: null, save: false, gift: g, due: 0 };
        if (!g && !(due > 0.004)) return { ok: true, method: 'none', card: null, save: false, gift: null, due: 0 };   /* nothing to pay (a 100% code): no card needed */
        if (method === 'account') return { ok: true, method: 'account', card: null, save: false, gift: g, due: due };
        const r = card.validate();
        if (!r.ok) { ui.toast('Please check your card details', 'bad'); return { ok: false }; }
        const c = r.card;
        lastCard = c;
        /* Demonstration: a card ending 0002 is declined, as on the booking page. */
        if (c.last4 === '0002') { fail('Your card was declined. Please try another card, or call your card issuer.'); return { ok: false, declined: true }; }
        return { ok: true, method: 'card', card: c, save: false, gift: g, due: due };
      },
      /** After a successful payment: wipe what was typed (no card is ever saved). */
      remember: function () {
        if (card) card.reset();
        lastCard = null;
      }
    };
  }

  /* ---------------- Club.checkout.steps: Details, Payment, Review ---------------- */
  /** steps(host, { site, steps: [{ id, label, html, next (Continue label), action (the last step's own button HTML) }],
        back: { href, label } (a way out from the first step), progress (default true: "1 Details · 2 Payment · 3 Review"),
        leave(id) -> bool (check a step before Continue moves on), enter(id) (a step is now shown) })
      -> { el, at() (current id), go(id), next(), fail(msg) (on the current step), body(id), label() (the current main action) }
      Every step stays in the page while hidden, so what was typed survives Back and Continue. */
  function steps(host, o) {
    o = Object.assign({ site: 'public', progress: true }, o || {});
    const list = o.steps, uid = Math.random().toString(36).slice(2, 7);
    let at = 0;
    host.innerHTML = '<div class="ckf ckf-' + o.site + (o.sticky ? ' ckf-sticky' : '') + '">' +
      (o.progress ? '<ol class="ckf-prog" aria-label="Checkout steps">' + list.map(function (s, i) {
        return '<li><button type="button" class="ckf-pb" data-ckf-go="' + i + '"><span class="ckf-pn" aria-hidden="true">' + (i + 1) + '</span><span class="ckf-pl">' + esc(s.label) + '</span></button></li>';
      }).join('') + '</ol>' : '') +
      '<p class="ckf-sr" aria-live="polite"></p>' +
      list.map(function (s, i) {
        const back = i > 0 ? '<button type="button" class="btn btn-ghost ckf-back" data-ckf-back="1">' + Club.icon('chevronLeft') + '<span>Back</span></button>'
          : o.back && o.back.html ? o.back.html
          : o.back ? '<a class="btn btn-ghost ckf-back" href="' + esc(o.back.href) + '">' + Club.icon('chevronLeft') + '<span>' + esc(o.back.label) + '</span></a>' : '';
        return '<section class="ckf-step" data-ckf-step="' + esc(s.id) + '" id="ckf-' + uid + '-' + i + '" tabindex="-1" aria-label="' + esc(s.label) + '"' + (i ? ' hidden' : '') + '>' +
          '<div class="ckf-body">' + (s.html || '') + '</div>' +
          '<div class="ckf-alert pub-alert" role="alert" hidden></div>' +
          '<div class="ckf-nav' + (back ? '' : ' is-solo') + '">' + back +
            (s.action || '<button type="button" class="btn btn-primary ckf-next" data-ckf-next="1"><span>' + esc(s.next || 'Continue') + '</span>' + Club.icon('chevronRight') + '</button>') + '</div>' +
        '</section>';
      }).join('') + '</div>';
    const root = ui.$('.ckf', host);
    const stepEl = function (i) { return ui.$$('.ckf-step', root).filter(function (x) { return x.parentNode === root; })[i]; };
    function index(id) { return typeof id === 'number' ? id : list.findIndex(function (s) { return s.id === id; }); }
    function paintProg() {
      root.dataset.at = list[at].id;
      ui.$$('.ckf-pb', root).forEach(function (b, i) {
        b.parentNode.className = i === at ? 'is-current' : i < at ? 'is-done' : '';
        b.disabled = i >= at;
        if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        ui.$('.ckf-pn', b).innerHTML = i < at ? Club.icon('check') : String(i + 1);
      });
    }
    function fail(msg) {
      ui.$$('.ckf-alert', root).forEach(function (a) { if (a.closest('.ckf') === root) a.hidden = true; });
      if (!msg) return;
      const al = ui.$('.ckf-alert', stepEl(at)); if (!al) return;
      al.innerHTML = Club.icon('alert') + '<div><p>' + esc(msg) + '</p></div>'; al.hidden = false;
      al.classList.remove('shake'); void al.offsetWidth; al.classList.add('shake');
      al.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    /** Show step id. quiet: no scrolling or focus (an error handler places the focus itself). */
    function go(id, quiet) {
      const i = index(id); if (i < 0 || i >= list.length) return;
      const from = list[at].id; at = i;
      list.forEach(function (s, k) { stepEl(k).hidden = k !== at; });
      fail('');
      paintProg();
      const sr = ui.$('.ckf-sr', root); sr.textContent = '';
      setTimeout(function () { sr.textContent = 'Step ' + (at + 1) + ' of ' + list.length + ': ' + list[at].label; }, 60);
      if (o.enter) o.enter(list[at].id, from);
      if (quiet) return;
      const top = root.getBoundingClientRect().top;
      if (top < 72 || top > window.innerHeight * 0.5) window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: 'smooth' });
      stepEl(at).focus({ preventScroll: true });
    }
    function next() {
      const s = list[at];
      if (s.action) { const a = ui.$('.ckf-nav > :last-child', stepEl(at)); if (a && !a.disabled) a.click(); return; }
      fail('');
      if (o.leave && !o.leave(s.id)) return;
      go(at + 1);
    }
    root.addEventListener('click', function (e) {
      const b = e.target.closest('[data-ckf-next], [data-ckf-back], [data-ckf-go], [data-ckf-edit]'); if (!b || b.closest('.ckf') !== root) return;
      if (b.dataset.ckfNext) next();
      else if (b.dataset.ckfBack) go(at - 1);
      else if (b.dataset.ckfEdit) { if (index(b.dataset.ckfEdit) < at) go(b.dataset.ckfEdit); }
      else if (+b.dataset.ckfGo < at) go(+b.dataset.ckfGo);
    });
    /* Enter in a field of a step moves on, like Continue (the gift card and promo boxes handle their own Enter). */
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
      const t = e.target;
      if (!t.matches || !t.matches('input:not([type=checkbox]):not([type=radio])') || t.closest('.gc-box, .pr-box') || list[at].action) return;
      e.preventDefault(); next();
    });
    paintProg();
    return {
      el: root,
      at: function () { return list[at].id; },
      go: go,
      next: next,
      fail: fail,
      body: function (id) { const s = stepEl(index(id)); return s ? ui.$('.ckf-body', s) : null; },
      label: function () { return list[at].next || ''; }
    };
  }
  /** The Review step's parts: [{ title, edit (a step id, shows Edit), html }]. */
  function reviewHTML(parts, site) {
    const link = site === 'portal' ? 'p-link' : 'pub-link';
    return '<div class="ckf-rv">' + parts.filter(Boolean).map(function (x) {
      return '<section class="ckf-rv-sec">' + (x.title ? '<div class="ckf-rv-h"><span class="ckf-rv-t">' + esc(x.title) + '</span>' +
        (x.edit ? '<button type="button" class="' + link + ' ckf-rv-edit" data-ckf-edit="' + esc(x.edit) + '">Edit <span class="ckf-sr">' + esc(x.title) + '</span></button>' : '') + '</div>' : '') + x.html + '</section>';
    }).join('') + '</div>';
  }

  Club.giftcards = {
    settings: settings, saveSettings: saveSettings, DEFAULTS: DEFAULTS, WHERE: WHERE,
    all: all, get: get, find: find, check: check, normalize: normalize, groups: groups, codeText: codeText, last4: last4, label: label, state: state,
    issue: issue, purchase: purchase, redeem: redeem, refund: refund, void: voidCard, history: history, redeemed: redeemed, receipt: receipt,
    cardHTML: cardHTML, open: open, applyBox: applyBox, settleTeeTime: settleTeeTime, paidWith: paidWith,
    tillState: tillState, tillHTML: tillHTML, tillApply: tillApply
  };
  Club.checkout = { mount: checkout, steps: steps, reviewHTML: reviewHTML };
})();
