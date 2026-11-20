/* Club.shop: the online golf shop. Products staff mark "Sell online" in the Pro Shop inventory (js/modules/proshop.js) are
   sold on the public site (js/public/shop.js) and in the members' portal (js/portal/shop.js), for pickup at the golf shop
   only (no shipping). Staff prepare and hand over orders on the Pro Shop "Online orders" tab. Loaded on all three sites
   after js/core/promos.js and before any module. Styles: css/shop.css (public and portal; the portal remaps its tokens).

   Products ('products', owned by the pro shop) gain: online: bool (sell online), blurb: string (optional, shown on the item page).
   Shelf prices are before tax, as at the golf shop till: an order adds GST 5% + PST 7% (Club.taxRate()) exactly like a
   counter sale, so the online total is what the same items cost in the shop. Members pay the same prices (no member discount).

   Order doc ('shopOrders'):
     { id ('so_…'), no ('W-0001', sequence in $shopOrderSeq), at (ISO placed), date ('YYYY-MM-DD'), site: 'portal'|'public',
       customer: { memberId|null, publicPlayerId|null, name, email, phone },
       items: [{ productId, name, brand, sku, qty, price (shelf price, before tax) }],
       subtotal (before tax), tax (on the subtotal), promo: { promoId, code, discount (tax included) }|null,
       total (what was paid, tax included: subtotal + tax − promo),
       pay: { method: 'account'|'card'|'gift'|'mixed'|'none'|'pickup', rest: 'account'|'card'|'cash'|null, label, brand, last4, giftCardId, giftLast4,
              giftAmount, cardAmount, accountAmount, cashAmount, receiptId, chargeId|null,
              pickup only: due, paidAt|null, paidBy, paidTotal (after any discount at the till), discount|null },
       saleId (the 'sales' doc, channel 'online'), status: 'new'|'ready'|'picked-up'|'cancelled',
       readyAt, pickedUpAt, pickedUpBy, cancelledAt, cancelledBy ('customer' or the staff name), cancelReason,
       refund: { amount, receiptId, at }|null, log: [{ at, text }] }

   Money: promo first (Club.promos, kind 'shop', tax-included line amounts), then a gift card, then the member account or a card.
   Receipts: source 'shop', refId the order id, channel 'online', tenders online. Account charges: category 'Pro Shop', source 'shop'.
   Every placed order also writes a 'sales' doc ({ channel: 'online', orderId, orderNo }); a cancellation writes its reversal
   (negative quantities and totals, refundOf) so pro shop reports net it out.

   Club.shop.catalogue() / product(id) / categories(list) / catLabel / tileHTML(cat, size) / availability(p)
   Club.shop.cart(who) / setCart(who, lines) / addToCart(who, id, n) / setQty(who, id, qty) / clearCart(who) / checkCart(who) -> notes
   Club.shop.totals(items, discount) / priced(lines) / promoLines(items) / receiptLines(items, gross)
   Club.shop.placeOrder({ customer, lines, promo (applyBox state), pay (Club.checkout result), site }) -> { ok, order, receipt, msg, code, short }
   Pay at pickup (Nov 12): pay.method 'pickup' places the order unpaid (no receipt, no sales doc, no charge; stock is taken as usual).
   Staff take the payment in the Pro Shop with the tee sheet's till: Club.shop.payAtPickup(id, till, { staffName, staffId }) makes the
   receipt (channel 'counter'), the sales doc and marks it paid. Club.shop.unpaid(o) / payLaterText(o).
   Club.shop.setStatus(id, 'ready'|'picked-up'|'new', by) / cancel(id, { by: 'customer'|'staff', staffName, staffId, reason }) -> { ok, order, receipt }
   Club.shop.forMember / forPublic / byIds / get / active / statusLabel / receiptOf / refundReceiptOf / counts()
   Club.shop.mount(host, ctx): the shop the customer sees, shared by the public site and the portal (see the section below). */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  /* Stored text (the order log) is always English: Club.fmtEn on the public site and portal, where Club.fmt can be French. */
  const EN = Club.fmtEn || fmt;
  const COLL = 'shopOrders';
  const CART_KEY = 'stboniface.shop.cart.';
  /* The order shoppers browse in (the pro shop till keeps its own). */
  const CATS = ['Balls', 'Apparel', 'Headwear', 'Accessories', 'Footwear', 'Clubs'];
  const CAT_ICON = { Balls: 'ball', Apparel: 'shopShirt', Headwear: 'shopCap', Accessories: 'shopBag', Footwear: 'shopShoe', Clubs: 'shopClub' };
  const MAX_QTY = 10;
  const LOW = 3;
  const STATUS = { new: 'Order received', ready: 'Ready for pickup', 'picked-up': 'Picked up', cancelled: 'Cancelled' };
  const BADGE = { new: 'brass', ready: 'good', 'picked-up': 'outline', cancelled: 'bad' };

  /* Category line icons for the product tiles (no product photos exist; added to the icon set here so js/core/icons.js stays as it is). */
  const P = Club.iconPaths || {};
  if (!P.shopShirt) P.shopShirt = '<path d="M9 3.5L4 6l1.6 4.2 2.2-.9V20.5h8.4V9.3l2.2.9L20 6l-5-2.5"/><path d="M9 3.5c.5 1.5 1.6 2.4 3 2.4s2.5-.9 3-2.4"/><path d="M12 5.9V9"/>';
  if (!P.shopCap) P.shopCap = '<path d="M3.5 15.5c0-4.6 3.2-8.3 7.5-8.3s7.5 3.7 7.5 8.3"/><path d="M3.5 15.5h15c1.6 0 2.6.5 2.5 1.3-.1.6-.9 1-2.2 1H10.5"/><path d="M11 7.2V5.8"/><path d="M11 7.2c-1.3 2.2-1.8 5-1.8 8.3"/>';
  if (!P.shopShoe) P.shopShoe = '<path d="M3.5 17V9.2c0-.5.4-.9.9-.9h2.3c.5 1.3 1.6 2 3 2h1.6l7 3.6c1.4.7 2.2 1.8 2.2 3.1v0z"/><path d="M3.5 17h17v1.3H3.5z"/><path d="M11 11.2l-1 1.6M13.5 12.4l-1 1.6"/>';
  if (!P.shopClub) P.shopClub = '<path d="M17.5 3.5L9.6 16.4"/><path d="M9.6 16.4l-1.8 3.1c-.3.6-1 .9-1.6.7l-2-.6c-.6-.2-.8-.8-.5-1.3l.9-1.5c.3-.5.9-.7 1.4-.5z"/><path d="M16.2 5.7l1.8 1.1"/>';
  if (!P.shopBag) P.shopBag = '<rect x="7" y="8.5" width="10" height="12" rx="2"/><path d="M9.5 8.5V4M12 8.5V3.5M14.5 8.5V5"/><path d="M7 12.5h10"/><path d="M17 11h1.5v5H17"/>';

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function nowHM() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function today() { return Club.date.today(); }
  function rate() { return Club.taxRate(); }
  function int0(v) { return Math.max(0, Math.floor(+v || 0)); }

  /* ---------------- Catalogue ---------------- */
  function product(id) { return S.find('products', id); }
  function isOnline(p) { return !!p && p.online === true; }
  function catIndex(c) { const i = CATS.indexOf(c); return i < 0 ? 99 : i; }
  function byCat(a, b) { return catIndex(a.category) - catIndex(b.category) || String(a.category).localeCompare(String(b.category)) || String(a.brand || '').localeCompare(String(b.brand || '')) || String(a.name).localeCompare(String(b.name)); }
  /** Every product sold online, sold-out ones included (shown as Sold out, never hidden). */
  function catalogue() { return S.all('products').filter(isOnline).slice().sort(byCat); }
  function categories(list) {
    const seen = {};
    return CATS.concat(list.map(function (p) { return p.category; })).filter(function (c) {
      if (!c || seen[c]) return false; seen[c] = 1;
      return list.some(function (p) { return p.category === c; });
    });
  }
  function catIcon(c) { return CAT_ICON[c] || 'shop'; }
  function stockOf(p) { return p ? int0(p.stock) : 0; }
  /** { state: 'ok'|'low'|'out', label } as the customer sees it. */
  function availability(p) {
    const n = stockOf(p);
    if (n <= 0) return { state: 'out', label: 'Sold out' };
    if (n <= LOW) return { state: 'low', label: 'Only ' + n + ' left' };
    return { state: 'ok', label: 'In stock' };
  }
  /** The tasteful stand-in for a product photo: the category's line icon on a tinted square. size: 'sm'|'md'|'lg'. */
  function tileHTML(cat, size) {
    return '<span class="sh-tile sh-tile-' + (size || 'md') + ' sh-cat-' + esc(String(cat || '').toLowerCase()) + '" aria-hidden="true">' + Club.icon(catIcon(cat), 'sh-tile-icon') + '</span>';
  }
  /** Products as stored in localStorage now: another tab (the till, another shopper) may have sold the last one. */
  function storedProducts() {
    try {
      const products = S.stored('products');
      if (!Array.isArray(products)) return null;
      const out = {}; products.forEach(function (p) { out[p.id] = p; }); return out;
    } catch (e) { return null; }
  }
  function freshStock(p, stored) {
    const s = stored && stored[p.id] ? int0(stored[p.id].stock) : null;
    return s == null ? stockOf(p) : Math.min(stockOf(p), s);
  }

  /* ---------------- Money ---------------- */
  /** Basket lines -> priced items (products that still exist), quantities kept as given. */
  function priced(lines) {
    return (lines || []).map(function (l) {
      const p = product(l.productId); if (!p) return null;
      return { productId: p.id, name: p.name, brand: p.brand || '', sku: p.sku || '', category: p.category, qty: Math.max(1, Math.floor(+l.qty || 1)), price: r2(p.price) };
    }).filter(Boolean);
  }
  function totals(items, discount) {
    const subtotal = r2(items.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    const tax = r2(subtotal * rate()), gross = r2(subtotal + tax);
    const d = r2(Math.min(gross, Math.max(0, +discount || 0)));
    return { subtotal: subtotal, tax: tax, gross: gross, discount: d, total: r2(gross - d), count: items.reduce(function (a, l) { return a + l.qty; }, 0) };
  }
  /** Lines for Club.promos (tax-included amounts, kind 'shop'). */
  function promoLines(items) {
    const out = items.map(function (l) { return { label: l.name, amount: r2(l.qty * l.price * (1 + rate())), kind: 'shop' }; });
    /* Rounding each line can leave the lines a cent off the order's tax-included total; put the cent on the last line
       so a percentage code works on the real total (and a 100% code leaves nothing to pay). */
    const gross = totals(items, 0).gross, diff = r2(gross - out.reduce(function (a, l) { return a + l.amount; }, 0));
    if (diff && out.length) out[out.length - 1].amount = r2(out[out.length - 1].amount + diff);
    return out;
  }
  /** Receipt lines at tax-included unit prices that add up to exactly gross (any rounding cent on one unit), as the till does. */
  function receiptLines(items, gross) {
    const sub = items.reduce(function (a, l) { return a + l.qty * l.price; }, 0), f = sub ? gross / sub : 1;
    const out = items.map(function (l) { return { name: l.name, qty: l.qty, price: r2(l.price * f) }; });
    const diff = r2(gross - out.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    if (diff && out.length) {
      const one = out.find(function (l) { return l.qty === 1; });
      if (one) one.price = r2(one.price + diff);
      else { const last = out[out.length - 1]; last.qty--; out.push({ name: last.name, qty: 1, price: r2(last.price + diff) }); }
    }
    return out;
  }
  function itemsText(items) { return (items || []).map(function (l) { return (l.qty > 1 ? l.qty + ' x ' : '') + l.name; }).join(', '); }

  /* ---------------- Basket (per person, on this device) ---------------- */
  function cart(who) {
    try {
      const a = JSON.parse(localStorage.getItem(CART_KEY + (who || 'guest')) || '[]');
      return Array.isArray(a) ? a.filter(function (l) { return l && l.productId && +l.qty > 0; }).map(function (l) { return { productId: String(l.productId), qty: Math.floor(+l.qty) }; }) : [];
    } catch (e) { return []; }
  }
  function setCart(who, lines) {
    const clean = (lines || []).filter(function (l) { return l && l.qty > 0; }).map(function (l) { return { productId: l.productId, qty: Math.floor(l.qty) }; });
    try { if (clean.length) localStorage.setItem(CART_KEY + (who || 'guest'), JSON.stringify(clean)); else localStorage.removeItem(CART_KEY + (who || 'guest')); } catch (e) { /* private mode: the basket lasts for this page only */ }
    window.dispatchEvent(new CustomEvent('club:shopcart', { detail: { who: who } }));
    return clean;
  }
  function qtyIn(who, id) { const l = cart(who).find(function (x) { return x.productId === id; }); return l ? l.qty : 0; }
  function maxFor(p) { return Math.min(MAX_QTY, stockOf(p)); }
  /** Add n of a product: { ok, qty, msg } (capped at the stock on hand and MAX_QTY). */
  function addToCart(who, id, n) {
    const p = product(id);
    if (!isOnline(p)) return { ok: false, qty: 0, msg: 'This item is no longer sold online.' };
    if (stockOf(p) <= 0) return { ok: false, qty: 0, msg: p.name + ' is sold out.' };
    const lines = cart(who), l = lines.find(function (x) { return x.productId === id; });
    const have = l ? l.qty : 0, cap = maxFor(p), want = have + Math.max(1, Math.floor(+n || 1));
    const qty = Math.min(cap, want);
    if (qty <= have) return { ok: false, qty: have, msg: stockOf(p) <= MAX_QTY ? 'Only ' + stockOf(p) + ' of ' + p.name + ' in stock.' : 'You can order up to ' + MAX_QTY + ' of each item online.' };
    if (l) l.qty = qty; else lines.push({ productId: id, qty: qty });
    setCart(who, lines);
    return { ok: true, qty: qty, msg: qty < want ? 'Only ' + stockOf(p) + ' of ' + p.name + ' in stock.' : '' };
  }
  function setQty(who, id, qty) {
    const p = product(id);
    const lines = cart(who).map(function (l) { return l.productId === id ? { productId: id, qty: Math.max(0, Math.min(p ? maxFor(p) : 0, Math.floor(+qty || 0))) } : l; });
    return setCart(who, lines);
  }
  function clearCart(who) { return setCart(who, []); }
  /** Brings the basket in line with the shop now: items no longer online or sold out are removed, quantities capped at
      the stock. Returns the messages for the customer (empty when nothing changed). */
  function checkCart(who) {
    const notes = [], out = [];
    cart(who).forEach(function (l) {
      const p = product(l.productId);
      if (!isOnline(p)) { notes.push((p ? p.name : 'An item') + ' is no longer sold online and was taken out of your basket.'); return; }
      const st = stockOf(p);
      if (st <= 0) { notes.push(p.name + ' just sold out and was taken out of your basket.'); return; }
      const cap = maxFor(p);
      if (l.qty > cap) { notes.push('Only ' + st + ' of ' + p.name + ' left. Your basket was updated.'); out.push({ productId: l.productId, qty: cap }); return; }
      out.push(l);
    });
    if (notes.length) setCart(who, out);
    return notes;
  }

  /* ---------------- Orders ---------------- */
  function get(id) { return S.find(COLL, id); }
  function nextNo() {
    let n = +S.getObj('shopOrderSeq', 0) || 0;
    S.all(COLL).forEach(function (o) { const k = parseInt(String(o.no || '').replace(/\D/g, ''), 10); if (k > n) n = k; });
    n++; S.setObj('shopOrderSeq', n);
    return 'W-' + String(n).padStart(4, '0');
  }
  function fail(msg, code, extra) { return Object.assign({ ok: false, msg: msg, code: code || 'error' }, extra || {}); }
  function payLabel(method, card) { return method === 'account' ? 'Member account' : card || 'Card'; }

  /** Take an order: checks the stock at this moment (fresh from storage), the promo code and the payment, then takes the
      stock, redeems the gift card, charges the account or records the card, writes the order, the sales doc and one receipt. */
  function placeOrder(o) {
    o = o || {};
    const c = o.customer || {};
    const name = String(c.name || '').trim().replace(/\s+/g, ' ');
    const lines = (o.lines || []).filter(function (l) { return l && +l.qty > 0; });
    if (!lines.length) return fail('Your basket is empty.', 'empty');
    if (!name) return fail('Enter the name for the order.', 'name');
    const stored = storedProducts(), short = [], have = {};
    for (let i = 0; i < lines.length; i++) {
      const p = product(lines[i].productId), q = Math.floor(+lines[i].qty);
      if (!isOnline(p)) return fail((p ? p.name : 'An item') + ' is no longer sold online. It has been taken out of your basket.', 'gone', { productId: lines[i].productId });
      if (!(q >= 1 && q <= MAX_QTY)) return fail('Choose between 1 and ' + MAX_QTY + ' of ' + p.name + '.', 'qty');
      have[p.id] = freshStock(p, stored);
      if (q > have[p.id]) short.push({ productId: p.id, name: p.name, have: have[p.id], want: q });
    }
    if (short.length) {
      const s = short[0];
      return fail(s.have ? 'Only ' + s.have + ' of ' + s.name + ' left now. Your basket has been updated. You have not been charged.' : 'Sorry, ' + s.name + ' just sold out. It has been taken out of your basket. You have not been charged.', 'stock', { short: short });
    }
    const items = priced(lines);

    /* Promo code: public golfers only (members get none). */
    let promo = null;
    if (o.promo && o.promo.promo && Club.promos) {
      if (c.memberId) return fail('Promo codes are not available on member orders.', 'promo');
      const ck = Club.promos.check(o.promo.promo.code, { where: 'shop', publicPlayerId: c.publicPlayerId || null, email: c.email || null });
      if (!ck.ok) return fail(ck.msg + ' It has been removed from this order.', 'promo');
      const q = Club.promos.quote(ck.promo, promoLines(items), { where: 'shop' });
      if (!q.ok) return fail((q.msg || 'That promo code no longer applies.') + ' It has been removed from this order.', 'promo');
      promo = { promoId: ck.promo.id, code: ck.promo.code, discount: q.discount };
    }
    const t = totals(items, promo ? promo.discount : 0);

    /* Payment: gift card first, then the account or a card. */
    const pay = o.pay || {};
    const atPickup = pay.method === 'pickup' && t.total > 0;
    const g = !atPickup && pay.gift && pay.gift.card && Club.giftcards ? Club.giftcards.get(pay.gift.card.id) : null;
    if (g && (g.status === 'void' || r2(g.balance) <= 0)) return fail('That gift card can no longer be used. It has been removed from this payment.', 'gift');
    const giftAmount = g ? r2(Math.min(g.balance, t.total)) : 0;
    const due = r2(t.total - giftAmount);
    const rest = atPickup || due <= 0 ? null : pay.method === 'account' && c.memberId ? 'account' : 'card';
    if (rest === 'card' && !(pay.card && pay.card.last4)) return fail('Choose a card to pay with.', 'card');
    if (rest === 'account') {
      const m = S.find('members', c.memberId);
      if (!m || m.status === 'suspended' || m.status === 'resigned') return fail('Your account cannot take charges right now. Please pay by card, or call the club office at ' + Club.info.phone + '.', 'account');
      /* Credit policy (Club.billing.chargeCheck): no charging 60 days after a statement date, unless staff allowed it today. */
      if (Club.billing && Club.billing.chargeCheck && !Club.billing.chargeCheck(m.id).ok) return fail(Club.billing.memberChargeMessage(m.id), 'account');
    }
    const method = giftAmount > 0 && rest ? 'mixed' : giftAmount > 0 ? 'gift' : rest || 'none';
    const cardLabel = rest === 'card' ? Club.receipts.cardLabel(pay.card.brand, pay.card.last4) : null;

    const at = new Date().toISOString(), no = nextNo();
    const memberId = c.memberId || null, publicPlayerId = memberId ? null : (c.publicPlayerId || null);
    const order = S.insert(COLL, { id: S.uid('so'), no: no, at: at, date: today(), site: o.site || (memberId ? 'portal' : 'public'),
      customer: { memberId: memberId, publicPlayerId: publicPlayerId, name: name, email: String(c.email || '').trim().toLowerCase(), phone: String(c.phone || '').trim() },
      items: items.map(function (l) { return { productId: l.productId, name: l.name, brand: l.brand, sku: l.sku, qty: l.qty, price: l.price }; }),
      subtotal: t.subtotal, tax: t.tax, promo: promo, total: t.total, pay: null, saleId: null, status: 'new',
      readyAt: null, pickedUpAt: null, pickedUpBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, refund: null,
      log: [{ at: at, text: 'Order placed online' + (memberId ? ' in the members’ portal' : ' on the public site') }] });

    /* Stock is taken now and goes back on cancel. */
    items.forEach(function (l) { const p = product(l.productId); if (p) S.update('products', p.id, { stock: Math.max(0, Math.min(stockOf(p), have[p.id]) - l.qty) }); });

    /* Pay at pickup: the order waits unpaid. No receipt and no sales record until the golf shop takes the payment. */
    if (atPickup) {
      if (promo) Club.promos.redeem(promo.promoId, { source: 'shop', refId: order.id, discount: promo.discount, publicPlayerId: publicPlayerId, memberId: null, email: c.email || null });
      const out0 = S.update(COLL, order.id, { pay: { method: 'pickup', rest: null, label: 'Pay at pickup', due: t.total, paidAt: null, paidBy: null, paidTotal: null, discount: null,
        brand: null, last4: null, giftCardId: null, giftLast4: null, giftAmount: 0, cardAmount: 0, accountAmount: 0, cashAmount: 0, receiptId: null, chargeId: null },
        log: order.log.concat([{ at: at, text: 'To pay at pickup: ' + EN.money(t.total) }]) });
      return { ok: true, order: out0, receipt: null };
    }
    const title = 'Online shop order ' + no;
    if (g && giftAmount > 0) Club.giftcards.redeem(g.id, giftAmount, { where: 'shop', refId: order.id, note: title });
    let chargeId = null;
    if (rest === 'account') {
      const ch = Club.chargeMember(memberId, { description: title + ' · ' + itemsText(items), category: 'Pro Shop', amount: due, source: 'shop', refId: order.id, date: today(), noReceipt: true });
      chargeId = ch ? ch.id : null;
    }
    const rlines = receiptLines(items, t.gross).concat(promo ? [{ name: 'Promo code ' + promo.code, qty: 1, price: -promo.discount }] : []);
    const who = { memberId: memberId, publicPlayerId: publicPlayerId, name: memberId || publicPlayerId ? undefined : name };
    const note = 'Pickup at the golf shop. Order ' + no + '.';
    let rc = null;
    if (giftAmount > 0) {
      rc = Club.giftcards.receipt(Object.assign({}, who, { title: title, lines: rlines, total: t.total, gift: { card: g, amount: giftAmount },
        rest: { method: rest || 'card', label: rest ? payLabel(rest, cardLabel) : '', amount: due }, source: 'shop', refId: order.id, chargeId: chargeId, note: note, online: true }));
    } else if (rest) {
      rc = Club.receipts.create(Object.assign({}, who, { title: title, lines: rlines, total: t.total, method: rest, methodLabel: rest === 'account' ? 'Charged to your member account' : cardLabel,
        source: 'shop', refId: order.id, chargeId: chargeId, note: note, tenders: [{ method: rest, amount: t.total, online: true }], channel: 'online' }));
    } else {
      rc = Club.receipts.create(Object.assign({}, who, { title: title, lines: rlines, total: 0, method: 'other', methodLabel: 'Nothing to pay', source: 'shop', refId: order.id, note: note, channel: 'online' }));
    }

    /* The pro shop's sales record, so Reports and the Sales tab count it (channel 'online'). */
    const net = r2(t.total / (1 + rate()));
    const sale = S.insert('sales', { id: 'sale_' + no.replace('-', '') + '_' + Date.now().toString(36).slice(-4), date: order.date, time: nowHM(),
      items: items.map(function (l) { return { productId: l.productId, name: l.name, qty: l.qty, price: l.price }; }),
      subtotal: net, tax: r2(t.total - net), total: t.total, discount: promo ? promo.discount : 0,
      payment: rest === 'account' ? 'Member account' : rest === 'card' ? 'Card' : 'Gift card', memberId: memberId, staffId: null,
      giftCardId: g && giftAmount ? g.id : null, giftLast4: g && giftAmount ? Club.giftcards.last4(g) : null, giftAmount: giftAmount,
      channel: 'online', orderId: order.id, orderNo: no });
    if (promo) Club.promos.redeem(promo.promoId, { source: 'shop', refId: order.id, discount: promo.discount, publicPlayerId: publicPlayerId, memberId: null, email: c.email || null });

    const label = rc && rc.methodLabel ? rc.methodLabel : rest === 'account' ? 'Charged to your member account' : cardLabel;
    const out = S.update(COLL, order.id, { saleId: sale.id, pay: { method: method, rest: rest, label: label,
      brand: rest === 'card' ? pay.card.brand : null, last4: rest === 'card' ? pay.card.last4 : null,
      giftCardId: g && giftAmount ? g.id : null, giftLast4: g && giftAmount ? Club.giftcards.last4(g) : null, giftAmount: giftAmount,
      cardAmount: rest === 'card' ? due : 0, accountAmount: rest === 'account' ? due : 0, receiptId: rc ? rc.id : null, chargeId: chargeId } });
    return { ok: true, order: out, receipt: rc };
  }

  /* ---------------- Status ---------------- */
  /* Staff can step a picked-up order back to ready (a correction): the hand-over is cleared, the ready time kept. */
  const NEXT = { ready: ['new', 'picked-up'], 'picked-up': ['new', 'ready'], new: ['ready'] };
  function setStatus(id, status, by) {
    const o = get(id); if (!o || !NEXT[status] || NEXT[status].indexOf(o.status) < 0) return o;
    const at = new Date().toISOString(), who = by || 'staff';
    const back = status === 'ready' && o.status === 'picked-up';
    const patch = { status: status, log: (o.log || []).concat([{ at: at, text: back ? 'Moved back to ready by ' + who : status === 'ready' ? 'Marked ready for pickup by ' + who : status === 'picked-up' ? 'Picked up, handed over by ' + who : 'Moved back to new by ' + who }]) };
    if (status === 'ready') { patch.readyAt = back && o.readyAt ? o.readyAt : at; patch.pickedUpAt = null; patch.pickedUpBy = null; }
    if (status === 'picked-up') { patch.pickedUpAt = at; patch.pickedUpBy = who; }
    if (status === 'new') patch.readyAt = null;
    return S.update(COLL, id, patch);
  }
  function unpaid(o) { return !!o && !!o.pay && o.pay.method === 'pickup' && !o.pay.paidAt; }
  /** The customer's note for an order to pay at pickup. */
  function payLaterText(o) { return fmt.money(o.total) + ' to pay at the golf shop counter when you collect your order, by card, cash or gift card. Nothing is charged until then.'; }
  /** Staff take the payment for an order placed with Pay at pickup. till: the tee sheet till's result (Club.teeSheet.takePayment):
      { lines, total, discount, gift: { id, last4, amount }|null, method: 'card'|'cash'|'gift'|'none', rest, cashTendered, change }.
      Redeems any gift card, makes the receipt (to the member or public golfer, channel 'counter') and the sales record. */
  function payAtPickup(id, till, ctx) {
    ctx = ctx || {};
    const o = get(id);
    if (!o) return fail('That order could not be found.');
    if (o.status === 'cancelled') return fail('This order was cancelled.');
    if (!unpaid(o)) return fail('This order is already paid.');
    const c = o.customer || {}, at = new Date().toISOString();
    const memberId = c.memberId || null, publicPlayerId = memberId ? null : (c.publicPlayerId || null);
    const g = till.gift && till.gift.amount > 0 ? till.gift : null, rest = r2(till.rest), m = rest > 0 ? (till.method === 'cash' ? 'cash' : 'card') : null;
    const title = 'Online shop order ' + o.no;
    if (g && Club.giftcards) Club.giftcards.redeem(g.id, g.amount, { where: 'shop', refId: o.id, note: title + ', paid at pickup', by: ctx.staffName || null });
    const disc = till.discount && till.discount.amount > 0 ? till.discount : null;
    const rlines = receiptLines(o.items, r2(o.subtotal + o.tax)).concat(o.promo ? [{ name: 'Promo code ' + o.promo.code, qty: 1, price: -o.promo.discount }] : [], disc ? [{ name: 'Discount: ' + disc.reason, qty: 1, price: -disc.amount }] : []);
    const methodLabel = g ? 'Gift card ending ' + g.last4 + (m ? ' and ' + m : '') : m === 'cash' ? 'Cash' : m ? 'Card' : 'Nothing to pay';
    const rc = Club.receipts ? Club.receipts.create({ memberId: memberId, publicPlayerId: publicPlayerId, name: memberId || publicPlayerId ? undefined : c.name,
      title: title, lines: rlines, total: till.total, method: m || 'other', methodLabel: methodLabel, source: 'shop', refId: o.id, channel: 'counter', fresh: true,
      tenders: (g ? [{ method: 'gift', amount: g.amount, ref: g.id }] : []).concat(m ? [{ method: m, amount: rest }] : []),
      note: 'Paid at pickup at the golf shop. Order ' + o.no + '.' + (disc ? ' Discount: ' + disc.reason + '.' : '') }) : null;
    const net = r2(till.total / (1 + rate()));
    const sale = S.insert('sales', { id: 'sale_' + o.no.replace('-', '') + '_' + Date.now().toString(36).slice(-4), date: today(), time: nowHM(),
      items: o.items.map(function (l) { return { productId: l.productId, name: l.name, qty: l.qty, price: l.price }; }),
      subtotal: net, tax: r2(till.total - net), total: till.total, discount: r2((o.promo ? o.promo.discount : 0) + (disc ? disc.amount : 0)),
      payment: m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : 'Gift card', memberId: memberId, staffId: ctx.staffId || null, cashTendered: till.cashTendered != null ? till.cashTendered : null,
      giftCardId: g ? g.id : null, giftLast4: g ? g.last4 : null, giftAmount: g ? g.amount : 0, channel: 'online', orderId: o.id, orderNo: o.no });
    const out = S.update(COLL, id, { saleId: sale.id,
      pay: Object.assign({}, o.pay, { paidAt: at, paidBy: ctx.staffName || 'staff', paidTotal: till.total, discount: disc, rest: m, label: 'Paid at pickup · ' + methodLabel,
        giftCardId: g ? g.id : null, giftLast4: g ? g.last4 : null, giftAmount: g ? g.amount : 0, cardAmount: m === 'card' ? rest : 0, cashAmount: m === 'cash' ? rest : 0, accountAmount: 0, receiptId: rc ? rc.id : null }),
      log: (o.log || []).concat([{ at: at, text: 'Paid at the golf shop, ' + EN.money(till.total) + ' (' + methodLabel.charAt(0).toLowerCase() + methodLabel.slice(1) + '), taken by ' + (ctx.staffName || 'staff') }]) });
    return { ok: true, order: out, receipt: rc };
  }
  /** Customers can cancel online until the golf shop has the order ready. */
  function canCancel(o) { return !!o && o.status === 'new'; }
  /** Cancel and refund to the original tender: stock back, gift card amount back on the card, account credited, card refunded
      (one credit receipt), the promo use released and the sale reversed. */
  function cancel(id, ctx) {
    ctx = ctx || {};
    const o = get(id);
    if (!o) return fail('That order could not be found.');
    if (o.status === 'cancelled') return fail('This order was already cancelled.');
    if (o.status === 'picked-up') return fail('This order has been picked up. Refund it at the golf shop till.');
    const p = o.pay || {}, c = o.customer || {};
    const at = new Date().toISOString();
    const staff = ctx.by !== 'customer';
    const title = 'Online shop order ' + o.no + ' cancelled';
    o.items.forEach(function (l) { const pr = product(l.productId); if (pr) S.update('products', pr.id, { stock: stockOf(pr) + l.qty }); });
    const gross = r2(o.subtotal + o.tax);
    const rlines = receiptLines(o.items, gross).concat(o.promo ? [{ name: 'Promo code ' + o.promo.code, qty: 1, price: -o.promo.discount }] : []);
    const who = { memberId: c.memberId || null, publicPlayerId: c.memberId ? null : (c.publicPlayerId || null), name: c.memberId || c.publicPlayerId ? undefined : c.name };
    const note = (staff ? 'Cancelled by the golf shop.' : 'Cancelled online.') + (ctx.reason ? ' ' + String(ctx.reason).trim() : '');
    const counter = p.method === 'pickup', notPaid = unpaid(o);   /* paid at the golf shop counter, or not paid at all */
    const cardLabel = p.last4 ? Club.receipts.cardLabel(p.brand, p.last4) : 'Card';
    const restLabel = p.rest === 'account' ? 'Member account' : p.rest === 'cash' ? 'Cash' : cardLabel;
    const paidTotal = notPaid ? 0 : p.paidTotal != null ? p.paidTotal : o.total;
    let chargeId = null, rc = null;
    if (p.giftCardId && p.giftAmount > 0) Club.giftcards.refund(p.giftCardId, p.giftAmount, { where: 'shop', refId: o.id, note: title, by: staff ? ctx.staffName || null : null });
    if (p.accountAmount > 0 && c.memberId) {
      const ch = Club.chargeMember(c.memberId, { description: 'Credit: ' + title, category: 'Pro Shop', amount: -p.accountAmount, source: 'shop', refId: o.id, date: today(), noReceipt: true });
      chargeId = ch ? ch.id : null;
    }
    const restAmt = r2((p.accountAmount || 0) + (p.cardAmount || 0) + (p.cashAmount || 0));
    const rlines2 = rlines.concat(p.discount && p.discount.amount > 0 ? [{ name: 'Discount: ' + p.discount.reason, qty: 1, price: -p.discount.amount }] : []);
    if (p.giftCardId && p.giftAmount > 0) {
      rc = Club.giftcards.receipt(Object.assign({}, who, { kind: 'credit', title: title, lines: rlines2, total: paidTotal, gift: { card: Club.giftcards.get(p.giftCardId) || { code: String(p.giftLast4 || '') }, amount: p.giftAmount },
        rest: { method: p.rest || 'card', label: restLabel, amount: restAmt }, source: 'shop', refId: o.id, chargeId: chargeId, note: note, online: !counter, channel: counter ? 'counter' : null }));
    } else if (restAmt > 0) {
      const rm = p.rest === 'account' ? 'account' : p.rest === 'cash' ? 'cash' : 'card';
      rc = Club.receipts.create(Object.assign({}, who, { kind: 'credit', title: title, lines: rlines2, total: paidTotal, method: rm,
        methodLabel: p.rest === 'account' ? 'Credit to your member account' : restLabel, source: 'shop', refId: o.id, chargeId: chargeId, note: note,
        tenders: [{ method: rm, amount: restAmt, online: !counter }], channel: counter ? 'counter' : 'online' }));
    }
    if (o.promo && Club.promos) Club.promos.release('shop', o.id);
    const sale = o.saleId ? S.find('sales', o.saleId) : null;
    if (sale) {
      S.insert('sales', { id: sale.id + '_r', date: today(), time: nowHM(), items: sale.items.map(function (i) { return { productId: i.productId, name: i.name, qty: -i.qty, price: i.price }; }),
        subtotal: -sale.subtotal, tax: -sale.tax, total: -sale.total, discount: -(sale.discount || 0), payment: sale.payment, memberId: sale.memberId || null, staffId: staff ? ctx.staffId || null : null,
        giftCardId: sale.giftCardId || null, giftLast4: sale.giftLast4 || null, giftAmount: -(sale.giftAmount || 0), channel: 'online', orderId: o.id, orderNo: o.no, refundOf: sale.id });
    }
    const out = S.update(COLL, id, { status: 'cancelled', cancelledAt: at, cancelledBy: staff ? (ctx.staffName || 'staff') : 'customer', cancelReason: String(ctx.reason || '').trim(),
      refund: { amount: paidTotal, receiptId: rc ? rc.id : null, at: at },
      log: (o.log || []).concat([{ at: at, text: (staff ? 'Cancelled by ' + (ctx.staffName || 'staff') : 'Cancelled online by the customer') + (ctx.reason ? ': ' + ctx.reason : '') + '. ' + (notPaid ? 'Nothing was charged' : 'Refunded ' + EN.money(paidTotal)) + ', stock put back.' }]) });
    return { ok: true, order: out, receipt: rc };
  }

  /* ---------------- Lookups ---------------- */
  function newestFirst(a, b) { return String(b.at).localeCompare(String(a.at)); }
  function forMember(id) { return S.where(COLL, function (o) { return o.customer && o.customer.memberId === id; }).sort(newestFirst); }
  function forPublic(id) { return S.where(COLL, function (o) { return o.customer && o.customer.publicPlayerId === id; }).sort(newestFirst); }
  function byIds(ids) { return (ids || []).map(get).filter(Boolean).sort(newestFirst); }
  function active(o) { return o.status === 'new' || o.status === 'ready'; }
  function statusLabel(o) { return STATUS[o.status] || o.status; }
  function receiptOf(o) { return o && o.pay && o.pay.receiptId && Club.receipts ? Club.receipts.get(o.pay.receiptId) : null; }
  function refundReceiptOf(o) { return o && o.refund && o.refund.receiptId && Club.receipts ? Club.receipts.get(o.refund.receiptId) : null; }
  function counts() { const n = { new: 0, ready: 0, 'picked-up': 0, cancelled: 0 }; S.all(COLL).forEach(function (o) { if (n[o.status] != null) n[o.status]++; }); return n; }
  function placedText(o) { return o.date === today() ? 'Today, ' + fmt.time(new Date(o.at)) : fmt.date(o.date); }
  function payText(o) {
    const p = o.pay || {};
    if (o.status === 'cancelled') return o.refund && !(o.refund.amount > 0) && p.method === 'pickup' ? 'Cancelled, nothing was charged' : fmt.money(o.refund && o.refund.amount > 0 ? o.refund.amount : o.total) + ' refunded';
    if (unpaid(o)) return fmt.money(o.total) + ' · Pay at pickup';
    return fmt.money(p.paidTotal != null ? p.paidTotal : o.total) + (p.label ? ' · ' + p.label : '');
  }

  /* ---------------- Customer-side markup ---------------- */
  function progressHTML(o) {
    if (o.status === 'cancelled') return '<p class="sh-track-off">' + Club.icon('close') + '<span>' + (o.pay && o.pay.method === 'pickup' && !(o.refund && o.refund.amount > 0) ? 'Cancelled' : 'Cancelled and refunded') + '</span></p>';
    const steps = [['new', 'Received'], ['ready', 'Ready for pickup'], ['picked-up', 'Picked up']];
    const at = steps.findIndex(function (s) { return s[0] === o.status; });
    return '<ol class="sh-track" aria-label="Order status: ' + esc(statusLabel(o)) + '">' + steps.map(function (s, i) {
      return '<li class="' + (i < at ? 'done' : i === at ? 'now' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '><span class="sh-track-dot">' + (i <= at ? Club.icon('check') : '') + '</span><span class="sh-track-l">' + esc(s[1]) + '</span></li>';
    }).join('') + '</ol>';
  }
  function orderCardHTML(o, opts) {
    opts = opts || {};
    const link = opts.site === 'portal' ? 'p-link' : 'pub-link';
    const rc = receiptOf(o), rf = refundReceiptOf(o);
    const head = o.status === 'ready' ? 'Ready at the golf shop' : o.status === 'new' ? 'We are getting it ready' : o.status === 'picked-up' ? 'Picked up' : 'Cancelled';
    return '<article class="sh-ocard is-' + esc(o.status) + '" data-order="' + esc(o.id) + '">' +
      '<header class="sh-ocard-head"><div><span class="sh-ocard-no">Order ' + esc(o.no) + ' · ' + esc(placedText(o)) + '</span><h4>' + esc(head) + '</h4></div>' +
        '<span class="badge ' + (BADGE[o.status] || '') + '">' + esc(statusLabel(o)) + '</span></header>' +
      progressHTML(o) +
      '<ul class="sh-ocard-items">' + o.items.map(function (l) { return '<li>' + tileHTML((product(l.productId) || {}).category || '', 'xs') + '<span class="sh-ocard-qty num">' + l.qty + ' x</span><span class="sh-ocard-name" data-i18n-skip>' + esc(l.name) + '</span></li>'; }).join('') + '</ul>' +
      (o.status === 'cancelled' && o.cancelReason ? '<p class="sh-ocard-note">' + esc(o.cancelReason) + '</p>' : '') +
      (unpaid(o) && o.status !== 'cancelled' ? '<p class="sh-paylater">' + Club.icon('shop') + '<span><strong>Pay at pickup</strong> <span>' + esc(payLaterText(o)) + '</span></span></p>' : '') +
      '<div class="sh-ocard-foot"><span class="sh-ocard-pay">' + esc(payText(o)) + '</span><span class="sh-ocard-acts">' +
        (opts.view ? '<a class="' + link + '" href="#/shop/order/' + esc(o.id) + '">Details</a>' : '') +
        (rc ? '<button type="button" class="' + link + '" data-sh-rc="' + esc(rc.id) + '">Receipt</button>' : '') +
        (rf ? '<button type="button" class="' + link + '" data-sh-rc="' + esc(rf.id) + '">Refund receipt</button>' : '') +
        (canCancel(o) ? '<button type="button" class="btn btn-sm btn-ghost sh-ocancel" data-sh-cancel="' + esc(o.id) + '">Cancel order</button>' : '') +
      '</span></div></article>';
  }
  /** Receipt and Cancel buttons inside root (bind once per root). onChange() after a cancel. */
  function wireCards(root, onChange) {
    root.addEventListener('click', function (e) {
      const r = e.target.closest('[data-sh-rc]'); if (r && root.contains(r)) { Club.receipts.open(r.dataset.shRc); return; }
      const b = e.target.closest('[data-sh-cancel]'); if (!b || !root.contains(b)) return;
      const o = get(b.dataset.shCancel); if (!o) return;
      if (!canCancel(o)) { ui.toast('The golf shop already has this order ready. Please call ' + Club.info.phone + ' to change it', 'bad'); if (onChange) onChange(); return; }
      const p = o.pay || {};
      const back = [p.giftAmount > 0 ? fmt.money(p.giftAmount) + ' goes back on the gift card' : '',
        p.accountAmount > 0 ? fmt.money(p.accountAmount) + ' is credited to your member account' : '',
        p.cardAmount > 0 ? fmt.money(p.cardAmount) + ' is refunded to your ' + Club.receipts.cardLabel(p.brand, p.last4) : ''].filter(Boolean).join(' and ');
      ui.confirm({ title: 'Cancel order ' + o.no + '?', text: 'Your order will be cancelled' + (back ? ', and ' + back + '.' : '.'), confirmLabel: 'Cancel order', cancelLabel: 'Keep order', danger: true }).then(function (yes) {
        if (!yes) return;
        const cur = get(o.id);
        if (!canCancel(cur)) { ui.toast('The golf shop already has this order ready. Please call ' + Club.info.phone + ' to change it', 'bad'); if (onChange) onChange(); return; }
        const res = cancel(o.id, { by: 'customer' });
        if (res.ok) ui.toast('Order ' + o.no + ' cancelled'); else ui.toast(res.msg, 'bad');
        if (onChange) onChange();
      });
    });
  }
  /** The confirmation right after placing an order, with its receipt. */
  function confirmHTML(o, opts) {
    opts = opts || {};
    const rc = receiptOf(o);
    return '<article class="sh-done" role="status" aria-live="polite">' +
      '<div class="sh-done-icon">' + Club.icon('check') + '</div>' +
      '<div class="eyebrow">Order ' + esc(o.no) + '</div>' +
      '<h2>' + esc(o.status === 'cancelled' ? 'This order was cancelled' : o.status === 'picked-up' ? 'Picked up' : o.status === 'ready' ? 'Ready for pickup' : 'Thank you, your order is in') + '</h2>' +
      '<p class="sh-done-where">' + esc(o.status === 'new' ? 'We will set it aside at the golf shop. This page shows Ready for pickup when it is waiting for you.' : o.status === 'ready' ? 'It is waiting for you at the golf shop counter.' : o.status === 'cancelled' ? (o.pay && o.pay.method === 'pickup' && !(o.refund && o.refund.amount > 0) ? 'Nothing was charged.' : 'The refund went back to how you paid.') : 'Thank you for shopping with us.') + '</p>' +
      progressHTML(o) +
      (unpaid(o) && o.status !== 'cancelled' ? '<div class="sh-pickup sh-pickup-pay">' + Club.icon('billing') + '<div><strong>Pay at pickup</strong><span>' + esc(payLaterText(o)) + '</span></div></div>' : '') +
      '<div class="sh-pickup">' + Club.icon('pin') + '<div><strong>Pickup at the golf shop</strong><span>' + esc(Club.info.address) + '. Give your name or order number at the counter. No shipping or delivery.</span></div></div>' +
      (rc ? '<div class="sh-done-rc">' + Club.receipts.html(rc) + '</div>' : '') +
      '<div class="sh-done-acts">' + (rc ? '<button type="button" class="btn" data-sh-rc="' + esc(rc.id) + '">' + Club.icon('print') + '<span>Print or save receipt</span></button>' : '') +
        '<a class="btn" href="#/shop/orders">' + Club.icon('box') + '<span>My orders</span></a>' +
        '<a class="btn btn-primary" href="#/shop">' + Club.icon('shop') + '<span>Keep shopping</span></a></div>' +
    '</article>';
  }

  /* ==================================================================
     The shop the customer sees, the same on the portal and the public site.
     mount(host, ctx) ctx: { site: 'portal'|'public', who (basket key), params (route after #/shop),
       customer: { memberId, publicPlayerId, name, phone, email } | null for a guest, member, player,
       account (may charge a member account), promo (show the promo box), orders() -> this person's orders,
       owns(order) -> bool, bar: { show({ summary, label, onClick }), hide() }, onPlaced(order) } -> cleanup()
     Routes: #/shop, #/shop/item/<productId>, #/shop/basket, #/shop/orders, #/shop/order/<orderId>.
     ================================================================== */
  const view = { q: '', cat: 'All', draft: {}, all: false };
  function priceHTML(v) { return esc(fmt.money(v)); }
  function phoneOk(v) { let x = String(v || '').replace(/\D/g, ''); if (x.length === 11 && x[0] === '1') x = x.slice(1); return x.length === 10; }
  function wide() { return window.matchMedia && window.matchMedia('(min-width: 880px)').matches; }

  function mount(host, ctx) {
    const P = ctx.site === 'portal';
    const link = P ? 'p-link' : 'pub-link';
    const who = ctx.who || 'guest';
    const params = ctx.params || [];
    const route = params[0] === 'item' ? 'item' : params[0] === 'basket' ? 'basket' : params[0] === 'orders' ? 'orders' : params[0] === 'order' ? 'order' : 'browse';
    const d = view.draft[who] = view.draft[who] || { name: ctx.customer ? ctx.customer.name : '', phone: ctx.customer ? ctx.customer.phone || '' : '', email: ctx.customer ? ctx.customer.email || '' : '' };
    let pay = null, promoBox = null, flow = null, busy = false, offs = [];

    const notes = checkCart(who);
    if (notes.length && route !== 'order') setTimeout(function () { notes.forEach(function (n) { ui.toast(n, 'bad'); }); }, 50);

    function basket() { return priced(cart(who)); }
    function navHTML() {
      const n = totals(basket()).count, a = (ctx.orders ? ctx.orders() : []).filter(active).length;
      const item = function (href, r, label, count) { const on = route === r || (r === 'browse' && route === 'item') || (r === 'orders' && route === 'order'); return '<a class="sh-navlink' + (on ? ' active' : '') + '" href="' + href + '"' + (on ? ' aria-current="page"' : '') + '><span>' + esc(label) + '</span>' + (count ? '<span class="sh-n">' + count + '</span>' : '') + '</a>'; };
      return item('#/shop', 'browse', 'Shop', 0) + item('#/shop/basket', 'basket', 'Basket', n) + item('#/shop/orders', 'orders', 'My orders', a);
    }
    host.innerHTML = '<div class="sh sh-' + ctx.site + ' sh-r-' + route + '"><nav class="sh-nav" aria-label="Online golf shop">' + navHTML() + '</nav><div class="sh-body"></div></div>';
    const root = ui.$('.sh', host), body = ui.$('.sh-body', root);
    function paintNav() { const n = ui.$('.sh-nav', root); if (n) n.innerHTML = navHTML(); }

    /* ---------- Browse ---------- */
    function ctlHTML(p) {
      const n = qtyIn(who, p.id), st = stockOf(p);
      if (st <= 0) return '<span class="sh-soldout">Sold out</span>';
      if (!n) return '<button type="button" class="btn btn-sm sh-add" data-sh-add="' + esc(p.id) + '" aria-label="Add ' + esc(p.name) + ' to basket">' + Club.icon('plus') + '<span>Add</span></button>';
      return stepHTML(p, n);
    }
    function stepHTML(p, n) {
      return '<div class="sh-step" role="group" aria-label="' + esc(p.name) + ' quantity"><button type="button" data-sh-step="-1" data-id="' + esc(p.id) + '" aria-label="One fewer ' + esc(p.name) + '">−</button><output aria-live="polite">' + n + '</output><button type="button" data-sh-step="1" data-id="' + esc(p.id) + '" aria-label="One more ' + esc(p.name) + '"' + (n >= maxFor(p) ? ' disabled' : '') + '>+</button></div>';
    }
    function cardHTML(p) {
      const av = availability(p);
      return '<article class="sh-card is-' + av.state + '" data-pid="' + esc(p.id) + '">' +
        '<a class="sh-card-link" href="#/shop/item/' + encodeURIComponent(p.id) + '">' + tileHTML(p.category, 'md') +
          '<span class="sh-card-brand" data-i18n-skip>' + esc(p.brand || '') + '</span><span class="sh-card-name" data-i18n-skip>' + esc(p.name) + '</span></a>' +
        '<div class="sh-card-foot"><span class="sh-card-price num">' + priceHTML(p.price) + (av.state === 'low' ? '<span class="sh-card-low">' + esc(av.label) + '</span>' : '') + '</span><span class="sh-card-ctl">' + ctlHTML(p) + '</span></div></article>';
    }
    function filtered() {
      const q = view.q.trim().toLowerCase();
      return catalogue().filter(function (p) {
        if (view.cat !== 'All' && p.category !== view.cat) return false;
        if (q && (p.name + ' ' + (p.brand || '') + ' ' + p.category + ' ' + (Club.i18n ? Club.i18n.t(p.category) : '')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    }
    function drawGrid() {
      const g = ui.$('.sh-grid', body); if (!g) return;
      const list = filtered();
      const cnt = ui.$('.sh-count', body); if (cnt) cnt.textContent = list.length + (list.length === 1 ? ' item' : ' items');
      /* Phones: the first 12 of everything, then View all (a category or a search shows every match). */
      const cap = !view.all && !view.q.trim() && view.cat === 'All' && window.matchMedia('(max-width: 767px)').matches && list.length > 12 ? 12 : list.length;
      g.innerHTML = list.length ? list.slice(0, cap).map(cardHTML).join('') + (cap < list.length ? '<button type="button" class="btn sh-all" data-sh-all="1">View all ' + list.length + ' items</button>' : '')
        : '<div class="sh-grid-empty">' + ui.empty({ icon: 'search', title: catalogue().length ? 'Nothing matches your search' : 'The online shop is being stocked', text: catalogue().length ? 'Try another word, or browse all categories.' : 'Please check back soon, or visit the golf shop at ' + Club.info.address + '.', action: catalogue().length && (view.q || view.cat !== 'All') ? '<button type="button" class="btn btn-sm" data-sh-reset="1">Show everything</button>' : '' }) + '</div>';
    }
    function miniHTML() {
      const items = basket(), t = totals(items);
      return '<div class="panel-head"><div><div class="eyebrow">Pickup at the golf shop</div><h3>Your basket</h3></div><span class="sh-mini-n">' + (t.count ? t.count + (t.count === 1 ? ' item' : ' items') : '') + '</span></div><div class="panel-body">' +
        (items.length ? '<ul class="sh-mini-lines">' + items.map(function (l) { return '<li><span class="sh-mini-name"><span class="num">' + l.qty + ' x</span> <span data-i18n-skip>' + esc(l.name) + '</span></span><span class="num">' + priceHTML(l.qty * l.price) + '</span></li>'; }).join('') + '</ul>' +
          '<dl class="sh-totals"><div><dt>Subtotal</dt><dd class="num">' + priceHTML(t.subtotal) + '</dd></div><div><dt>Tax</dt><dd class="num">' + priceHTML(t.tax) + '</dd></div><div class="sh-total"><dt>Total</dt><dd class="num">' + priceHTML(t.gross) + '</dd></div></dl>' +
          '<a class="btn btn-primary sh-mini-go" href="#/shop/basket">' + Club.icon('check') + '<span>Check out</span></a>'
          : '<p class="sh-empty-line">' + Club.icon('shop') + '<span>Your basket is empty. Add items, then pick them up at the golf shop.</span></p>') + '</div>';
    }
    function paintMini() { const m = ui.$('.sh-mini', body); if (m) m.innerHTML = miniHTML(); }
    function paintBar() {
      if (!ctx.bar) return;
      const t = totals(basket());
      if (route === 'basket') {
        /* Phones: the bar carries the step's main button (Continue to payment, Continue to review, Place order). */
        const step = flow ? flow.at() : 'review';
        if (t.count && !wide()) ctx.bar.show({ summary: 'Total ' + fmt.money(dueNow()), label: busy ? 'Placing your order' : step === 'review' ? 'Place order' : flow.label(), onClick: function () { placeNow(); } });
        else ctx.bar.hide();
        return;
      }
      if ((route === 'browse' || route === 'item') && t.count && !wide()) ctx.bar.show({ summary: t.count + (t.count === 1 ? ' item' : ' items') + ' · ' + fmt.money(t.gross), label: 'View basket', onClick: function () { location.hash = '#/shop/basket'; } });
      else ctx.bar.hide();
    }
    function drawBrowse() {
      const cats = categories(catalogue());
      if (view.cat !== 'All' && cats.indexOf(view.cat) < 0) view.cat = 'All';
      body.innerHTML = '<div class="sh-browse"><div class="sh-main">' +
        '<p class="sh-notice">' + Club.icon('pin') + '<span>Pickup only, at the golf shop. No shipping or delivery.</span></p>' +
        '<div class="sh-tools"><label class="sh-search">' + Club.icon('search') + '<input class="input" type="search" name="q" value="' + esc(view.q) + '" placeholder="Search the shop" aria-label="Search the shop" autocomplete="off"></label><span class="sh-count" aria-live="polite"></span></div>' +
        '<div class="sh-cats" role="group" aria-label="Category">' + ['All'].concat(cats).map(function (c) { return '<button type="button" class="sh-chip' + (view.cat === c ? ' active' : '') + '" data-sh-cat="' + esc(c) + '" aria-pressed="' + (view.cat === c) + '">' + (c === 'All' ? '<span>All</span>' : Club.icon(catIcon(c)) + '<span>' + esc(c) + '</span>') + '</button>'; }).join('') + '</div>' +
        '<div class="sh-grid"></div></div>' +
        '<aside class="sh-mini panel" aria-label="Your basket">' + miniHTML() + '</aside></div>';
      drawGrid();
    }
    function repaintCard(id) {
      const p = product(id); if (!p) return;
      ui.$$('[data-pid="' + id + '"]', body).forEach(function (el) { const c = ui.$('.sh-card-ctl', el); if (c) c.innerHTML = ctlHTML(p); });
      const dc = ui.$('.sh-dctl', body); if (dc && dc.dataset.id === id) drawDetailCtl(p);
      paintMini(); paintNav(); paintBar();
    }

    /* ---------- Item page ---------- */
    let dqty = 1;
    function drawDetailCtl(p) {
      const host2 = ui.$('.sh-dctl', body); if (!host2) return;
      const st = stockOf(p), inb = qtyIn(who, p.id), room = Math.max(0, maxFor(p) - inb);
      dqty = Math.max(1, Math.min(dqty, room || 1));
      host2.innerHTML = st <= 0
        ? '<p class="sh-out-note">' + Club.icon('info') + '<span>Sold out online. Call the golf shop at ' + esc(Club.info.phone) + ' to ask when it will be back.</span></p>'
        : room <= 0
          ? '<p class="sh-in-note">' + Club.icon('check') + '<span>You have ' + inb + ' in your basket, all we can sell online right now.</span></p><a class="btn btn-primary sh-dgo" href="#/shop/basket">View basket</a>'
          : '<div class="sh-dbuy"><div class="sh-step sh-step-lg" role="group" aria-label="Quantity"><button type="button" data-sh-dq="-1" aria-label="One fewer"' + (dqty <= 1 ? ' disabled' : '') + '>−</button><output aria-live="polite">' + dqty + '</output><button type="button" data-sh-dq="1" aria-label="One more"' + (dqty >= room ? ' disabled' : '') + '>+</button></div>' +
            '<button type="button" class="btn btn-primary sh-dadd" data-sh-dadd="' + esc(p.id) + '">' + Club.icon('plus') + '<span>Add to basket</span></button></div>' +
            (inb ? '<p class="sh-in-note">' + Club.icon('check') + '<span>' + inb + ' in your basket.</span> <a class="' + link + '" href="#/shop/basket">View basket</a></p>' : '');
    }
    function drawItem(id) {
      const p = product(id);
      if (!isOnline(p)) {
        body.innerHTML = '<div class="panel sh-panel-empty">' + ui.empty({ icon: 'shop', title: 'This item is not available online', text: 'It may have been taken off the online shop. The golf shop may still have it: call ' + Club.info.phone + '.', action: '<a class="btn btn-sm" href="#/shop">Back to the shop</a>' }) + '</div>';
        return;
      }
      const av = availability(p);
      const more = catalogue().filter(function (x) { return x.category === p.category && x.id !== p.id; }).slice(0, 4);
      body.innerHTML = '<a class="sh-back ' + link + '" href="#/shop">' + Club.icon('chevronLeft') + '<span>Back to the shop</span></a>' +
        '<article class="sh-item">' + tileHTML(p.category, 'lg') +
          '<div class="sh-item-info"><div class="eyebrow">' + esc(p.category) + '</div>' +
            '<h2 class="sh-item-name" data-i18n-skip>' + esc(p.name) + '</h2>' + (p.brand ? '<div class="sh-item-brand" data-i18n-skip>' + esc(p.brand) + '</div>' : '') +
            '<div class="sh-item-price"><span class="num">' + priceHTML(p.price) + '</span><span class="sh-item-tax">plus tax</span></div>' +
            '<p class="sh-avail is-' + av.state + '">' + esc(av.label) + '</p>' +
            (p.blurb ? '<p class="sh-item-blurb" data-i18n-skip>' + esc(p.blurb) + '</p>' : '') +
            '<div class="sh-dctl" data-id="' + esc(p.id) + '"></div>' +
            '<ul class="sh-facts"><li>' + Club.icon('pin') + '<span>Pickup at the golf shop, ' + esc(Club.info.address) + '. No shipping.</span></li>' +
              '<li>' + Club.icon('tag') + '<span>Same price as in the golf shop. Tax is added at checkout.</span></li>' +
              (p.sku ? '<li>' + Club.icon('box') + '<span>Item ' + esc(p.sku) + '</span></li>' : '') + '</ul>' +
          '</div></article>' +
        (more.length ? '<section class="sh-more"><h3>More ' + esc(p.category === 'Clubs' ? 'clubs' : 'in ' + p.category) + '</h3><div class="sh-grid sh-grid-more">' + more.map(cardHTML).join('') + '</div></section>' : '');
      dqty = 1; drawDetailCtl(p);
    }

    /* ---------- Basket and checkout ---------- */
    function promoState() { return promoBox ? promoBox.state() : null; }
    function orderTotals() { const s = promoState(); return totals(basket(), s ? s.discount : 0); }
    function dueNow() { const g = pay ? pay.gift() : null; return g ? g.due : orderTotals().total; }
    function linesHTML() {
      const items = basket();
      return '<ul class="sh-lines">' + items.map(function (l) {
        const p = product(l.productId);
        return '<li data-pid="' + esc(l.productId) + '">' + tileHTML(l.category, 'sm') +
          '<div class="sh-line-main"><a class="sh-line-name" href="#/shop/item/' + encodeURIComponent(l.productId) + '" data-i18n-skip>' + esc(l.name) + '</a><span class="sh-line-sub"><span data-i18n-skip>' + esc(l.brand) + '</span> · <span class="sh-line-each">' + priceHTML(l.price) + ' each</span></span></div>' +
          '<div class="sh-line-ctl">' + stepHTML(p, l.qty) + '<button type="button" class="sh-line-rm" data-sh-rm="' + esc(l.productId) + '" aria-label="Remove ' + esc(l.name) + '">' + Club.icon('trash') + '</button></div>' +
          '<span class="sh-line-amt num">' + priceHTML(l.qty * l.price) + '</span></li>';
      }).join('') + '</ul>';
    }
    function totalsHTML() {
      const t = orderTotals(), s = promoState(), g = pay ? pay.gift() : null;
      return '<dl class="sh-totals"><div><dt>Subtotal</dt><dd class="num">' + priceHTML(t.subtotal) + '</dd></div>' +
        '<div><dt>Tax <span class="muted">GST 5% + PST 7%</span></dt><dd class="num">' + priceHTML(t.tax) + '</dd></div>' +
        (s ? '<div class="sh-disc"><dt>Promo code ' + esc(s.code) + '</dt><dd class="num">−' + priceHTML(s.discount) + '</dd></div>' : '') +
        '<div class="sh-total"><dt>Total</dt><dd class="num">' + priceHTML(t.total) + '</dd></div>' +
        (g && g.amount > 0 ? '<div class="sh-disc"><dt>' + esc(g.label) + '</dt><dd class="num">−' + priceHTML(g.amount) + '</dd></div><div class="sh-total"><dt>Left to pay</dt><dd class="num">' + priceHTML(g.due) + '</dd></div>' : '') + '</dl>';
    }
    function whoHTML() {
      if (ctx.customer) {
        return '<div class="sh-who"><div class="sh-who-name">' + Club.icon('user') + '<span>' + esc(ctx.customer.name) + '</span></div>' +
          '<div class="field"><label for="sh-phone">Phone for this order *</label><input class="input" id="sh-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="' + esc(d.phone) + '" placeholder="(204) 555-0123"><span class="field-hint">The golf shop calls if there is a question about your order.</span></div></div>';
      }
      return '<div class="sh-who"><p class="sh-who-note">Ordering as a guest. ' + (P ? '' : '<a href="#/signin" data-sh-signin="1">Sign in</a> to see your orders on any device.') + '</p><div class="form-grid">' +
        '<div class="field span-2"><label for="sh-name">Name for the order *</label><input class="input" id="sh-name" name="name" autocomplete="name" maxlength="60" value="' + esc(d.name) + '"></div>' +
        '<div class="field"><label for="sh-gphone">Phone *</label><input class="input" id="sh-gphone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="' + esc(d.phone) + '" placeholder="(204) 555-0123"></div>' +
        '<div class="field"><label for="sh-email">Email *</label><input class="input" id="sh-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" value="' + esc(d.email) + '"><span class="field-hint">For your receipt.</span></div></div></div>';
    }
    function drawBasket() {
      const items = basket();
      if (!items.length) {
        body.innerHTML = '<div class="panel sh-panel-empty">' + ui.empty({ icon: 'shop', title: 'Your basket is empty', text: 'Browse the golf shop online and pick up your order at the clubhouse.', action: '<a class="btn btn-primary btn-sm" href="#/shop">Browse the shop</a>' }) + '</div>';
        return;
      }
      body.innerHTML = '<div class="sh-checkout">' +
        '<section class="panel sh-basket" aria-labelledby="sh-basket-h"><div class="panel-head"><div><div class="eyebrow">Pickup at the golf shop</div><h3 id="sh-basket-h">Your basket</h3></div><a class="' + link + ' sh-keep" href="#/shop">Keep shopping</a></div>' +
          '<div class="panel-body"><div class="sh-lines-host">' + linesHTML() + '</div><div class="sh-totals-host">' + totalsHTML() + '</div>' +
          '<p class="sh-fine">Prices are the same as in the golf shop, before tax. Tax is added here, and the total includes it.</p></div></section>' +
        '<aside class="panel sh-pay" aria-labelledby="sh-pay-h"><div class="panel-head"><div><div class="eyebrow">Checkout</div><h3 id="sh-pay-h">Pickup and payment</h3></div>' + (P ? '' : '<span class="pub-secure">' + Club.icon('key') + 'Secure</span>') + '</div><div class="panel-body">' +
          '<div class="sh-flow"></div>' +
          '<p class="sh-fine">Questions about your order? Call the golf shop at <a href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</p>' +
        '</div></aside></div>';
      /* Checkout in steps (Club.checkout.steps): 1 Details (pickup and contact), 2 Payment (promo code, then the pay panel), 3 Review. */
      flow = Club.checkout.steps(ui.$('.sh-flow', body), { site: ctx.site, back: { href: '#/shop', label: 'Keep shopping' },
        steps: [
          { id: 'details', label: 'Details', next: 'Continue to payment',
            html: '<div class="sh-pickup">' + Club.icon('pin') + '<div><strong>Pickup at the golf shop</strong><span>' + esc(Club.info.address) + '. We set your order aside at the counter. My orders shows Ready for pickup when it is waiting for you. No shipping or delivery.</span></div></div>' + whoHTML() },
          { id: 'pay', label: 'Payment', next: 'Continue to review', html: (ctx.promo ? '<div class="sh-promo"></div>' : '') + '<div class="sh-payhost"></div>' },
          { id: 'review', label: 'Review', html: '<div class="sh-review"></div><div class="sh-sum"></div>',
            action: '<button type="button" class="btn btn-primary sh-place" data-sh-place="1">' + Club.icon('check') + '<span>Place order</span></button>' }
        ],
        leave: function (id) {
          if (id === 'details') return detailsOk();
          if (promoBox) { const pm = promoBox.recheck(); if (pm) { pay.fail(pm); paintSums(); return false; } }
          const r = pay.validate();
          if (!r.ok && r.declined) pay.fail('');   /* a declined card is only known when the order is placed */
          return r.ok || !!r.declined;
        },
        enter: function () { paintSums(); } });
      if (ctx.promo && Club.promos) {
        promoBox = Club.promos.applyBox(ui.$('.sh-promo', body), { site: ctx.site, ctx: function () { return { where: 'shop', publicPlayerId: ctx.customer ? ctx.customer.publicPlayerId || null : null }; },
          lines: function () { return promoLines(basket()); }, onChange: function () { if (pay) { paintSums(); pay.refresh(); } } });
      }
      pay = Club.checkout.mount(ui.$('.sh-payhost', body), { site: ctx.site, member: ctx.member || null, player: ctx.player || null, account: !!ctx.account, gift: true, pickup: true,
        amount: function () { return orderTotals().total; }, onChange: function () { paintSums(); } });
      paintSums();
    }
    function paintSums() {
      const th = ui.$('.sh-totals-host', body); if (th) th.innerHTML = totalsHTML();
      const g = pay ? pay.gift() : null, t = orderTotals();
      const sum = ui.$('.sh-sum', body);
      if (sum) sum.innerHTML = '<span>' + (g && g.amount > 0 ? 'Left to pay' : 'Total') + '</span><strong class="num">' + priceHTML(dueNow()) + '</strong>';
      const b = ui.$('.sh-place span', body);
      if (b && !busy) b.textContent = pay && pay.kind() === 'pickup' && t.total > 0 ? 'Place order · pay at pickup' : g && g.covers ? 'Place order · paid by gift card' : 'Place order · ' + fmt.money(g ? g.due : t.total);
      paintReview();
      paintBar();
    }
    /** Step 3: the items, the totals with tax and any promo code, the pickup contact and how it is paid. */
    function paintReview() {
      const rv = flow && flow.at() === 'review' ? ui.$('.sh-review', body) : null; if (!rv || !pay) return;
      const items = basket();
      rv.innerHTML = Club.checkout.reviewHTML([
        { title: 'Items', html: '<ul class="ckf-rv-lines">' + items.map(function (l) { return '<li><span><span class="num">' + l.qty + ' x</span> <span data-i18n-skip>' + esc(l.name) + '</span></span><span class="num">' + priceHTML(l.qty * l.price) + '</span></li>'; }).join('') + '</ul>' + totalsHTML() },
        { title: 'Pickup at the golf shop', edit: 'details', html: '<dl class="ckf-rv-kv"><div><dt>Name</dt><dd data-i18n-skip>' + esc(ctx.customer ? ctx.customer.name : d.name) + '</dd></div><div><dt>Phone</dt><dd>' + esc(d.phone) + '</dd></div>' +
          (ctx.customer ? '' : '<div><dt>Email</dt><dd>' + esc(d.email) + '</dd></div>') + '</dl>' },
        { title: 'Payment', edit: 'pay', html: pay.summaryHTML() }
      ], ctx.site);
    }
    function redrawLines() {
      checkCart(who);
      if (!basket().length) { teardownPay(); drawBasket(); paintNav(); paintBar(); return; }
      const lh = ui.$('.sh-lines-host', body); if (lh) lh.innerHTML = linesHTML();
      if (promoBox) promoBox.refresh();
      if (pay) pay.refresh();
      paintSums(); paintNav();
    }
    function teardownPay() { pay = null; promoBox = null; flow = null; }
    function fieldErr(name, msg) {
      const f = ui.$('.sh-pay [name="' + name + '"]', body); if (!f) return;
      f.classList.add('invalid'); f.setAttribute('aria-invalid', 'true');
      const fld = f.closest('.field'); if (fld && !fld.querySelector('.field-error')) fld.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
    }
    /** Step 1: the name, phone and email for the order. Errors show on that step. */
    function detailsOk() {
      const panel = ui.$('.sh-pay', body);
      ui.$$('.field-error', panel).forEach(function (x) { if (!x.closest('.cc, .pr-box, .gc-box')) x.remove(); });
      ui.$$('.invalid', panel).forEach(function (x) { if (!x.closest('.cc, .pr-box, .gc-box')) { x.classList.remove('invalid'); x.removeAttribute('aria-invalid'); } });
      let ok = true;
      if (!ctx.customer && String(d.name || '').trim().length < 2) { fieldErr('name', 'Enter the name for the order.'); ok = false; }
      if (!phoneOk(d.phone)) { fieldErr('phone', d.phone ? 'Enter a 10-digit phone number, for example (204) 555-0123.' : 'Enter a phone number for the order.'); ok = false; }
      if (!ctx.customer && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || '').trim())) { fieldErr('email', d.email ? 'That email address does not look right.' : 'Enter your email for the receipt.'); ok = false; }
      if (!ok) { if (flow && flow.at() !== 'details') flow.go('details', true); ui.toast('Please check the highlighted fields', 'bad'); const f = ui.$('.sh-pay .invalid', body); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } }
      return ok;
    }
    /** A payment problem found when placing the order: back to step 2, where the message and the field are. */
    function toPay(msg) {
      if (flow && flow.at() !== 'pay') flow.go('pay', true);
      if (msg) pay.fail(msg);
      const f = ui.$('[data-ckf-step=pay] .invalid', body) || ui.$('[data-ckf-step=pay] .ck-alert:not([hidden])', body);
      if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (f.matches('input')) f.focus({ preventScroll: true }); }
    }
    function placeNow() {
      if (busy || !pay) return;
      if (flow && flow.at() !== 'review') { flow.next(); return; }
      if (flow) flow.fail('');
      const notes2 = checkCart(who);
      if (notes2.length) { notes2.forEach(function (n) { ui.toast(n, 'bad'); }); redrawLines(); if (!basket().length) return; flow.fail(notes2[0]); return; }
      if (!detailsOk()) return;
      if (promoBox) { const pm = promoBox.recheck(); if (pm) { paintSums(); toPay(pm); return; } }
      const res = pay.validate(); if (!res.ok) { toPay(); return; }
      busy = true;
      const btn = ui.$('.sh-place', body); btn.disabled = true; btn.classList.add('is-busy');
      ui.$('span', btn).textContent = res.method === 'card' ? 'Processing payment' : 'Placing your order';
      paintBar();
      setTimeout(function () {
        const c = ctx.customer ? Object.assign({}, ctx.customer, { phone: String(d.phone).trim() }) : { name: String(d.name).trim(), phone: String(d.phone).trim(), email: String(d.email).trim() };
        let out;
        try { out = placeOrder({ customer: c, lines: cart(who), promo: promoState(), pay: res, site: ctx.site }); }
        catch (x) { console.error(x); out = fail('We could not place your order. You have not been charged. Please call the golf shop at ' + Club.info.phone + '.'); }
        busy = false;
        const here = body.contains(btn);
        if (here) { btn.disabled = false; btn.classList.remove('is-busy'); }
        if (!out.ok && !here) return;
        if (!out.ok) {
          if (out.code === 'stock') {
            (out.short || []).forEach(function (s) { setQty(who, s.productId, Math.min(s.have, MAX_QTY)); });
            ui.toast(out.short && out.short[0] && !out.short[0].have ? out.short[0].name + ' just sold out' : 'Your basket was updated', 'bad');
          } else if (out.code === 'gone') setQty(who, out.productId, 0);
          else if (out.code === 'promo' && promoBox) promoBox.clear();
          if (!basket().length) { drawBasket(); paintNav(); paintBar(); ui.toast(out.msg, 'bad'); return; }
          redrawLines();
          if (out.code === 'promo') toPay(out.msg); else if (flow) flow.fail(out.msg);
          return;
        }
        pay.remember(res);
        clearCart(who);
        delete view.draft[who];
        if (ctx.bar) ctx.bar.hide();
        ui.toast('Order ' + out.order.no + ' placed');
        if (ctx.onPlaced) ctx.onPlaced(out.order, out.receipt);
        location.hash = '#/shop/order/' + out.order.id;
      }, 700);
    }

    /* ---------- Orders ---------- */
    function drawOrders() {
      const list = ctx.orders ? ctx.orders() : [];
      const act = list.filter(active), past = list.filter(function (o) { return !active(o); }).slice(0, 20);
      body.innerHTML = list.length
        ? (act.length ? '<section class="sh-osec"><h2 class="sh-h">Current</h2><div class="sh-ocards">' + act.map(function (o) { return orderCardHTML(o, { site: ctx.site, view: true }); }).join('') + '</div></section>' : '') +
          (past.length ? '<section class="sh-osec"><h2 class="sh-h">Past orders</h2><div class="sh-ocards">' + past.map(function (o) { return orderCardHTML(o, { site: ctx.site, view: true }); }).join('') + '</div></section>' : '')
        : '<div class="panel sh-panel-empty">' + ui.empty({ icon: 'box', title: 'No online orders yet', text: ctx.customer ? 'Orders you place in the online golf shop appear here, with their status and receipt.' : 'Orders placed as a guest on this device appear here. Sign in to see orders on any device.', action: '<a class="btn btn-sm" href="#/shop">Browse the shop</a>' }) + '</div>';
    }
    function drawOrder(id) {
      const o = get(id);
      if (!o || (ctx.owns && !ctx.owns(o))) {
        body.innerHTML = '<div class="panel sh-panel-empty">' + ui.empty({ icon: 'box', title: 'That order is not available', text: 'It may belong to another account. Your orders are under My orders.', action: '<a class="btn btn-sm" href="#/shop/orders">My orders</a>' }) + '</div>';
        return;
      }
      body.innerHTML = '<div class="sh-done-wrap">' + confirmHTML(o) + (canCancel(o) ? '<p class="sh-done-cancel"><button type="button" class="' + link + '" data-sh-cancel="' + esc(o.id) + '">Cancel this order</button></p>' : '') + '</div>';
    }

    function draw() {
      if (route === 'item') drawItem(params[1]);
      else if (route === 'basket') drawBasket();
      else if (route === 'orders') drawOrders();
      else if (route === 'order') drawOrder(params[1]);
      else drawBrowse();
      paintBar();
    }

    /* ---------- Events ---------- */
    root.addEventListener('click', function (e) {
      const t = e.target.closest('button, a'); if (!t || !root.contains(t)) return;
      if (t.dataset.shAdd) {
        const r = addToCart(who, t.dataset.shAdd, 1);
        if (!r.ok) { ui.toast(r.msg, 'bad'); repaintCard(t.dataset.shAdd); return; }
        if (r.msg) ui.toast(r.msg, 'bad'); else ui.toast('Added to your basket');
        const id = t.dataset.shAdd; repaintCard(id);
        const s = ui.$('[data-pid="' + id + '"] [data-sh-step="1"]', body); if (s && !s.disabled) s.focus(); else { const o2 = ui.$('[data-pid="' + id + '"] [data-sh-step="-1"]', body); if (o2) o2.focus(); }
        return;
      }
      if (t.dataset.shStep) {
        const id = t.dataset.id, n = qtyIn(who, id) + (+t.dataset.shStep);
        if (+t.dataset.shStep > 0) { const r = addToCart(who, id, 1); if (!r.ok) ui.toast(r.msg, 'bad'); }
        else setQty(who, id, n);
        if (route === 'basket') {
          redrawLines();
          const b = ui.$('[data-pid="' + id + '"] [data-sh-step="' + t.dataset.shStep + '"]', body); if (b && !b.disabled) b.focus();
        } else {
          repaintCard(id);
          const b = ui.$('[data-pid="' + id + '"] [data-sh-step="' + t.dataset.shStep + '"]', body) || ui.$('[data-pid="' + id + '"] .sh-add', body); if (b && !b.disabled) b.focus();
        }
        return;
      }
      if (t.dataset.shRm) { const p = product(t.dataset.shRm); setQty(who, t.dataset.shRm, 0); ui.toast((p ? p.name : 'Item') + ' removed from your basket'); redrawLines(); return; }
      if (t.dataset.shCat) {
        view.cat = t.dataset.shCat;
        ui.$$('.sh-chip', body).forEach(function (c) { const on = c === t; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on); });
        drawGrid(); return;
      }
      if (t.dataset.shAll) { view.all = true; drawGrid(); const n = ui.$$('.sh-card-link', body)[12]; if (n) n.focus(); return; }
      if (t.dataset.shReset) { view.q = ''; view.cat = 'All'; drawBrowse(); return; }
      if (t.dataset.shDq) {
        const p = product(ui.$('.sh-dctl', body).dataset.id); dqty += +t.dataset.shDq; drawDetailCtl(p);
        const b = ui.$('[data-sh-dq="' + t.dataset.shDq + '"]', body); if (b && !b.disabled) b.focus(); return;
      }
      if (t.dataset.shDadd) {
        const r = addToCart(who, t.dataset.shDadd, dqty);
        if (!r.ok) ui.toast(r.msg, 'bad'); else ui.toast(r.msg || (dqty > 1 ? dqty + ' added to your basket' : 'Added to your basket'), r.msg ? 'bad' : undefined);
        dqty = 1; repaintCard(t.dataset.shDadd);
        const v = ui.$('.sh-in-note a, .sh-dgo', body); if (v) v.focus();
        return;
      }
      if (t.dataset.shSignin) { e.preventDefault(); if (window.Pub) { Pub.afterAuth = '#/shop/basket'; Pub.go('signin'); } return; }
      if (t.dataset.shPlace) { placeNow(); }
    });
    root.addEventListener('input', function (e) {
      const t = e.target;
      if (t.name === 'q' && t.closest('.sh-search')) { view.q = t.value; drawGrid(); return; }
      if ((t.name === 'name' || t.name === 'phone' || t.name === 'email') && t.closest('.sh-who')) {
        d[t.name] = t.value;
        if (t.classList.contains('invalid')) { t.classList.remove('invalid'); t.removeAttribute('aria-invalid'); const er = (t.closest('.field') || t.parentNode).querySelector('.field-error'); if (er) er.remove(); }
      }
    });
    if (route === 'orders' || route === 'order') wireCards(root, function () { draw(); paintNav(); });
    else root.addEventListener('click', function (e) { const r = e.target.closest('[data-sh-rc]'); if (r && root.contains(r)) Club.receipts.open(r.dataset.shRc); });

    /* Stock changes (the till, staff, another shopper) and order status updates show as they happen. */
    function idle() { return !busy && !document.querySelector('.overlay') && !document.body.classList.contains('ps-open'); }
    offs.push(S.subscribe('products', function () {
      if (!idle()) return;
      if (route === 'browse') { const n = checkCart(who); n.forEach(function (x) { ui.toast(x, 'bad'); }); drawGrid(); paintMini(); paintNav(); paintBar(); }
      else if (route === 'item') { const p = product(params[1]); if (p && isOnline(p) && ui.$('.sh-dctl', body)) { checkCart(who); drawItem(p.id); paintNav(); paintBar(); } else drawItem(params[1]); }
      else if (route === 'basket') { const n = checkCart(who); if (n.length) { n.forEach(function (x) { ui.toast(x, 'bad'); }); redrawLines(); } }
    }));
    offs.push(S.subscribe(COLL, function () { if (!idle()) return; paintNav(); if (route === 'orders' || route === 'order') draw(); }));
    let rsz = 0; const onResize = function () { if (!rsz) rsz = requestAnimationFrame(function () { rsz = 0; paintBar(); }); };   /* once per frame: iOS fires resize while its toolbar slides */
    window.addEventListener('resize', onResize);
    draw();
    return function () { offs.forEach(function (f) { f(); }); window.removeEventListener('resize', onResize); if (ctx.bar) ctx.bar.hide(); };
  }

  Club.shop = {
    COLL: COLL, CATS: CATS, MAX_QTY: MAX_QTY, STATUS: STATUS, BADGE: BADGE,
    product: product, isOnline: isOnline, catalogue: catalogue, categories: categories, catIcon: catIcon, tileHTML: tileHTML, availability: availability, stockOf: stockOf,
    priced: priced, totals: totals, promoLines: promoLines, receiptLines: receiptLines, itemsText: itemsText,
    cart: cart, setCart: setCart, addToCart: addToCart, setQty: setQty, clearCart: clearCart, checkCart: checkCart, qtyIn: qtyIn,
    placeOrder: placeOrder, setStatus: setStatus, cancel: cancel, canCancel: canCancel, get: get, unpaid: unpaid, payAtPickup: payAtPickup, payLaterText: payLaterText,
    forMember: forMember, forPublic: forPublic, byIds: byIds, active: active, statusLabel: statusLabel, receiptOf: receiptOf, refundReceiptOf: refundReceiptOf,
    counts: counts, placedText: placedText, payText: payText, progressHTML: progressHTML, orderCardHTML: orderCardHTML, wireCards: wireCards, confirmHTML: confirmHTML,
    mount: mount
  };
})();
