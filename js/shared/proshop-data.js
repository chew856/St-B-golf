/* Pro shop data: the product catalogue, the sales history and the online shop's demo orders.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/proshop.js, which reads these helpers from Club.shared.proshop. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, R = S.R, esc = U.esc;
  const PREFIX = { Apparel: 'AP', Clubs: 'CL', Balls: 'BL', Accessories: 'AC', Footwear: 'FW', Headwear: 'HW' };

  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ------------------------------------------------------------------
     Seed data
     [category, brand, name, price, cost, stock, reorderAt]
     ------------------------------------------------------------------ */
  /* Demo assortment for the Golf Shop, CAD retail. Club-logo items carry the St.B oak tree. */
  const CATALOG = [
    ['Clubs', 'Titleist', 'GT2 Driver', 799.99, 540, 3, 1],
    ['Clubs', 'Titleist', 'Vokey Design SM10 Wedge', 249.99, 165, 8, 3],
    ['Clubs', 'Titleist', 'T150 Irons, 5 to PW, Steel', 1699.99, 1150, 1, 1],
    ['Clubs', 'TaylorMade', 'Qi35 Driver', 749.99, 505, 3, 1],
    ['Clubs', 'TaylorMade', 'Qi35 Fairway Wood', 399.99, 268, 2, 1],
    ['Clubs', 'Callaway', 'Elyte Driver', 749.99, 505, 2, 1],
    ['Clubs', 'Callaway', 'Odyssey Ai-One Putter', 329.99, 215, 4, 2],
    ['Clubs', 'Ping', 'G440 Hybrid', 379.99, 252, 0, 1],
    ['Clubs', 'Ping', 'PLD Milled Anser Putter', 549.99, 365, 1, 1],
    ['Clubs', 'Callaway', 'Women\'s Reva Complete Set', 1299.99, 860, 1, 1],
    ['Balls', 'Titleist', 'Pro V1, Dozen', 69.99, 48, 36, 12],
    ['Balls', 'Titleist', 'Pro V1 St.B Logo, Dozen', 74.99, 51, 9, 12],
    ['Balls', 'Titleist', 'Tour Soft, Dozen', 39.99, 26, 24, 10],
    ['Balls', 'Titleist', 'Velocity, Dozen', 32.99, 21, 20, 10],
    ['Balls', 'TaylorMade', 'Tour Response, Dozen', 49.99, 33, 16, 8],
    ['Balls', 'Callaway', 'Supersoft, Dozen', 34.99, 22, 28, 12],
    ['Balls', 'Callaway', 'Chrome Soft, Dozen', 64.99, 44, 10, 8],
    ['Balls', 'Srixon', 'Soft Feel, Dozen', 32.99, 21, 18, 8],
    ['Apparel', 'FootJoy', 'St. Boniface Crest Polo', 89.99, 46, 22, 8],
    ['Apparel', 'FootJoy', 'Women\'s St. Boniface Crest Polo', 89.99, 46, 12, 6],
    ['Apparel', 'FootJoy', 'Thermal Quarter-Zip', 119.99, 62, 9, 4],
    ['Apparel', 'Under Armour', 'St.B Logo Playoff Polo', 84.99, 44, 18, 6],
    ['Apparel', 'Under Armour', 'Storm Midlayer Half-Zip', 109.99, 57, 6, 4],
    ['Apparel', 'Under Armour', 'Drive Pant', 99.99, 52, 10, 4],
    ['Apparel', 'Adidas', 'Ultimate365 Short', 79.99, 41, 8, 4],
    ['Apparel', 'Adidas', 'Women\'s Ultimate365 Skort', 79.99, 41, 3, 3],
    ['Apparel', 'Adidas', 'St.B Logo Hoodie', 99.99, 50, 11, 4],
    ['Apparel', 'FootJoy', 'HydroLite Rain Jacket', 199.99, 110, 4, 2],
    ['Apparel', 'Callaway', 'Junior Swing Tech Polo', 44.99, 23, 7, 4],
    ['Footwear', 'FootJoy', 'Pro|SL', 219.99, 128, 5, 3],
    ['Footwear', 'FootJoy', 'Women\'s Pro|SL', 219.99, 128, 3, 2],
    ['Footwear', 'FootJoy', 'Fuel Spikeless', 139.99, 82, 6, 3],
    ['Footwear', 'Adidas', 'Tour360 24', 249.99, 146, 2, 2],
    ['Footwear', 'Adidas', 'Retrocross Spikeless', 149.99, 88, 0, 2],
    ['Footwear', 'Under Armour', 'Charged Draw 2 Spikeless', 159.99, 94, 4, 2],
    ['Headwear', 'Titleist', 'St.B Logo Cap', 34.99, 15, 34, 10],
    ['Headwear', 'Titleist', 'St.B Logo Tour Performance Cap', 39.99, 17, 16, 8],
    ['Headwear', 'Imperial', 'St.B Logo Rope Cap', 32.99, 14, 6, 8],
    ['Headwear', 'Imperial', 'St.B Logo Visor', 29.99, 12, 12, 6],
    ['Headwear', 'Adidas', 'St.B Logo Bucket Hat', 36.99, 16, 9, 4],
    ['Headwear', 'Titleist', 'St.B Logo Toque', 34.99, 15, 14, 6],
    ['Headwear', 'Under Armour', 'Iso-Chill Driver Cap', 32.99, 14, 10, 5],
    ['Accessories', 'Titleist', 'Players 4 Stand Bag', 329.99, 205, 3, 2],
    ['Accessories', 'Callaway', 'Org 14 Cart Bag', 379.99, 236, 2, 1],
    ['Accessories', 'FootJoy', 'StaSof Glove', 29.99, 14, 40, 15],
    ['Accessories', 'FootJoy', 'Women\'s StaSof Glove', 29.99, 14, 10, 6],
    ['Accessories', 'FootJoy', 'WeatherSof Glove', 19.99, 9, 36, 15],
    ['Accessories', 'Bushnell', 'Tour V6 Rangefinder', 449.99, 300, 2, 1],
    ['Accessories', 'St. Boniface Golf Club', 'St.B Logo Divot Tool and Ball Marker', 19.99, 7, 16, 6],
    ['Accessories', 'St. Boniface Golf Club', 'St.B Logo Golf Towel', 24.99, 10, 24, 8],
    ['Accessories', 'St. Boniface Golf Club', 'St.B Logo Umbrella', 49.99, 24, 7, 4],
    ['Accessories', 'St. Boniface Golf Club', 'Yardage Book', 15, 5, 30, 10],
    ['Accessories', 'Titleist', 'Tees, Bag of 50', 7.99, 3, 60, 20]
  ];

  S.seed('products', function () {
    return CATALOG.map(function (p, i) {
      return {
        id: 'prd_' + (101 + i),
        sku: PREFIX[p[0]] + '-' + String(1000 + ((i * 37) % 900) + i).slice(-4),
        name: p[2], brand: p[1], category: p[0], price: p[3], cost: p[4], stock: p[5], reorderAt: p[6]
      };
    });
  });

  S.seed('sales', function () {
    R.reseed(4820);
    const prods = S.all('products');
    const members = S.all('members').filter(function (m) { return m.status === 'active'; });
    const weight = { Balls: 6, Headwear: 5, Accessories: 4, Apparel: 4, Footwear: 1.2, Clubs: 0.5 };
    const pool = [];
    prods.forEach(function (p) { const w = Math.round((weight[p.category] || 1) * 2); for (let k = 0; k < w; k++) pool.push(p); });
    const rate = Club.taxRate();
    const staff = ['stf_23', 'stf_23', 'stf_23', 'stf_4', 'stf_5', 'stf_3'];
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const out = []; let no = 5001;
    for (let d = -45; d <= 0; d++) {
      const date = Club.date.fromToday(d);
      const dow = F.toDate(date).getDay(); const weekend = dow === 0 || dow === 6;
      let n = R.int(weekend ? 9 : 5, weekend ? 16 : 11);
      if (d > -12) n = Math.round(n / 2); // the season winds down in late October
      const times = [];
      for (let i = 0; i < n; i++) times.push(R.int(7 * 60, 18 * 60 + 30));
      times.sort(function (a, b) { return a - b; });
      times.forEach(function (t) {
        const lineCount = R.chance(0.55) ? 1 : (R.chance(0.7) ? 2 : 3);
        const items = []; const used = {};
        for (let k = 0; k < lineCount; k++) {
          const p = R.pick(pool); if (used[p.id]) continue; used[p.id] = 1;
          const qty = p.category === 'Balls' ? R.int(1, 3) : (p.category === 'Headwear' || p.name.indexOf('Glove') >= 0 ? R.int(1, 2) : 1);
          items.push({ productId: p.id, name: p.name, qty: qty, price: p.price });
        }
        if (d === 0 && t > nowMin) return;
        const subtotal = r2(items.reduce(function (a, it) { return a + it.qty * it.price; }, 0));
        const tax = r2(subtotal * rate);
        const roll = R.rand();
        const payment = roll < 0.66 ? 'Member account' : (roll < 0.93 ? 'Card' : 'Cash');
        const mem = members.length ? R.pick(members) : null;
        out.push({
          id: 'sale_' + no, number: no, date: date, time: pad(Math.floor(t / 60)) + ':' + pad(t % 60), items: items,
          subtotal: subtotal, tax: tax, total: r2(subtotal + tax), payment: payment,
          memberId: payment === 'Member account' && mem ? mem.id : null, staffId: R.pick(staff)
        });
        no++;
      });
    }
    return out;
  });

  /* ------------------------------------------------------------------
     Online shop seed: which products sell online (once, $shopOnlineSeeded), and a few demo orders in each state
     ------------------------------------------------------------------ */
  /* Clubs are fitted in person, so they stay off the online shop; footwear only in the core sizes-forgiving lines.
     A sold-out item (Retrocross Spikeless) stays listed online as Sold out. */
  const ONLINE_OFF = { Clubs: 1 };
  const ONLINE_FOOTWEAR = ['Pro|SL', 'Fuel Spikeless', 'Retrocross Spikeless'];
  (function seedOnline() {
    if (S.getObj('shopOnlineSeeded', false)) return;
    S.all('products').forEach(function (p) {
      if (p.online !== undefined) return;
      const on = !ONLINE_OFF[p.category] && (p.category !== 'Footwear' || ONLINE_FOOTWEAR.indexOf(p.name) >= 0);
      const patch = { online: on };
      if (on && !p.blurb && /St\.\s?B|St\. Boniface/.test(p.name + ' ' + p.brand)) patch.blurb = 'Carries the St.B oak tree logo of St. Boniface Golf Club, established 1931.';
      S.update('products', p.id, patch);
    });
    S.setObj('shopOnlineSeeded', true);
  })();

  /* Demo orders (W-0001 to W-0006): picked up, cancelled, ready and new, with their receipts, charges and sales docs.
     Built after the receipts backfill (DOMContentLoaded) so their receipts number after the older ones. Not re-run. */
  function seedShopOrders() {
    if (!Club.shop || S.getObj('shopDemoSeeded', false) || S.all('shopOrders').length) return;
    S.setObj('shopDemoSeeded', true);
    const byName = function (n) { return products().find(function (p) { return p.name === n; }); };
    const rate = Club.taxRate();
    const visa = { brand: 'visa', last4: '4242' }, mc = { brand: 'mastercard', last4: '5454' };
    const front = Club.staff.name('stf_23');
    const D = [
      { no: 'W-0001', day: -6, time: '09:14', who: { memberId: 'mem_1003' }, lines: [['Pro V1, Dozen', 2]], pay: 'account', status: 'picked-up', readyMin: 50, pickedDay: -5 },
      { no: 'W-0002', day: -4, time: '19:42', who: { name: 'Alex Morin', email: 'alex.morin@example.com', phone: '204-555-0148' }, lines: [['St.B Logo Hoodie', 1]], pay: 'card', card: visa, promo: 'SHOP15', status: 'picked-up', readyMin: 900, pickedDay: -3 },
      { no: 'W-0003', day: -2, time: '11:05', who: { memberId: 'mem_1018' }, lines: [['HydroLite Rain Jacket', 1], ['St.B Logo Golf Towel', 1]], pay: 'account', status: 'cancelled', cancelReason: 'You asked us to cancel by phone. The full amount is credited to your account.' },
      { no: 'W-0004', day: -1, time: '16:20', who: { memberId: 'mem_1003' }, lines: [['St. Boniface Crest Polo', 1], ['St.B Logo Cap', 1]], pay: 'card', card: mc, status: 'ready', readyMin: 75 },
      { no: 'W-0005', day: 0, time: '07:48', who: { name: 'Priya Shah', email: 'priya.shah@example.com', phone: '204-555-0192' }, lines: [['Tour Soft, Dozen', 1], ['StaSof Glove', 1]], pay: 'card', card: visa, status: 'new' },
      { no: 'W-0006', day: 0, time: '08:31', who: { memberId: 'mem_1027' }, lines: [['Chrome Soft, Dozen', 2], ['Tees, Bag of 50', 1]], pay: 'account', status: 'new' }
    ];
    const stamp = function (day, hm, plusMin) { const d = F.toDate(Club.date.fromToday(day)); const t = hm.split(':'); d.setHours(+t[0], +t[1] + (plusMin || 0), 0, 0); return d; };
    let seq = 0;
    D.forEach(function (x, i) {
      let at = stamp(x.day, x.time);
      if (at > new Date()) at = new Date(Date.now() - (D.length - i) * 7 * 60000);   /* never in the future, early in the day */
      const iso = at.toISOString(), date = S.iso(at), hm = pad(at.getHours()) + ':' + pad(at.getMinutes());
      const items = x.lines.map(function (l) { const p = byName(l[0]); return p ? { productId: p.id, name: p.name, brand: p.brand, sku: p.sku, qty: l[1], price: p.price } : null; }).filter(Boolean);
      if (!items.length) return;
      const m = x.who.memberId ? Club.members.get(x.who.memberId) : null;
      if (x.who.memberId && !m) return;
      const t = Club.shop.totals(items, 0);
      const promoDoc = x.promo && Club.promos ? Club.promos.find(x.promo) : null;
      const q = promoDoc ? Club.promos.quote(promoDoc, Club.shop.promoLines(items), { where: 'shop' }) : null;
      const discount = q && q.ok ? q.discount : 0;
      const total = r2(t.gross - discount);
      const id = 'so_demo_' + (i + 1);
      const customer = m ? { memberId: m.id, publicPlayerId: null, name: m.firstName + ' ' + m.lastName, email: m.email || '', phone: m.phone || '' } : { memberId: null, publicPlayerId: null, name: x.who.name, email: x.who.email, phone: x.who.phone };
      const title = 'Online shop order ' + x.no;
      const rlines = Club.shop.receiptLines(items, t.gross).concat(discount ? [{ name: 'Promo code ' + promoDoc.code, qty: 1, price: -discount }] : []);
      const who = { memberId: customer.memberId, name: customer.memberId ? undefined : customer.name };
      let chargeId = null;
      if (x.pay === 'account') { const ch = Club.chargeMember(m.id, { description: title + ' · ' + Club.shop.itemsText(items), category: 'Pro Shop', amount: total, source: 'shop', refId: id, date: date, noReceipt: true }); chargeId = ch ? ch.id : null; }
      const cardLabel = x.card ? Club.receipts.cardLabel(x.card.brand, x.card.last4) : null;
      const rc = Club.receipts.create(Object.assign({}, who, { at: iso, date: date, title: title, lines: rlines, total: total, method: x.pay, methodLabel: x.pay === 'account' ? 'Charged to your member account' : cardLabel,
        source: 'shop', refId: id, chargeId: chargeId, note: 'Pickup at the golf shop. Order ' + x.no + '.', tenders: [{ method: x.pay, amount: total, online: true }], channel: 'online' }));
      const net = r2(total / (1 + rate));
      const sale = S.insert('sales', { id: 'sale_' + x.no.replace('-', '') + '_demo', date: date, time: hm, items: items.map(function (l) { return { productId: l.productId, name: l.name, qty: l.qty, price: l.price }; }),
        subtotal: net, tax: r2(total - net), total: total, discount: discount, payment: x.pay === 'account' ? 'Member account' : 'Card', memberId: customer.memberId, staffId: null,
        giftCardId: null, giftLast4: null, giftAmount: 0, channel: 'online', orderId: id, orderNo: x.no });
      if (discount) Club.promos.redeem(promoDoc.id, { source: 'shop', refId: id, discount: discount, publicPlayerId: null, memberId: null });
      const log = [{ at: iso, text: 'Order placed online' + (customer.memberId ? ' in the members’ portal' : ' on the public site') }];
      const doc = { id: id, no: x.no, at: iso, date: date, site: customer.memberId ? 'portal' : 'public', customer: customer, items: items,
        subtotal: t.subtotal, tax: t.tax, promo: discount ? { promoId: promoDoc.id, code: promoDoc.code, discount: discount } : null, total: total,
        pay: { method: x.pay, rest: x.pay, label: rc.methodLabel, brand: x.card ? x.card.brand : null, last4: x.card ? x.card.last4 : null, giftCardId: null, giftLast4: null, giftAmount: 0,
          cardAmount: x.pay === 'card' ? total : 0, accountAmount: x.pay === 'account' ? total : 0, receiptId: rc.id, chargeId: chargeId },
        saleId: sale.id, status: 'new', readyAt: null, pickedUpAt: null, pickedUpBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, refund: null, log: log };
      if (x.status === 'ready' || x.status === 'picked-up') {
        const r = new Date(Math.min(Date.now() - 60000, at.getTime() + x.readyMin * 60000));
        doc.readyAt = r.toISOString(); log.push({ at: doc.readyAt, text: 'Marked ready for pickup by ' + front });
      }
      if (x.status === 'picked-up') {
        const pu = stamp(x.pickedDay, '15:10');
        doc.pickedUpAt = (pu > new Date() ? new Date() : pu).toISOString(); doc.pickedUpBy = front; log.push({ at: doc.pickedUpAt, text: 'Picked up, handed over by ' + front });
      }
      if (x.status === 'cancelled') {
        const ca = new Date(Math.min(Date.now() - 60000, at.getTime() + 95 * 60000)), cIso = ca.toISOString(), cDate = S.iso(ca);
        let cId = null;
        if (x.pay === 'account') { const ch = Club.chargeMember(m.id, { description: 'Credit: ' + title + ' cancelled', category: 'Pro Shop', amount: -total, source: 'shop', refId: id, date: cDate, noReceipt: true }); cId = ch ? ch.id : null; }
        const cr = Club.receipts.create(Object.assign({}, who, { at: cIso, date: cDate, kind: 'credit', title: title + ' cancelled', lines: rlines, total: total, method: x.pay,
          methodLabel: x.pay === 'account' ? 'Credit to your member account' : cardLabel, source: 'shop', refId: id, chargeId: cId, note: 'Cancelled by the golf shop. ' + x.cancelReason,
          tenders: [{ method: x.pay, amount: total, online: true }], channel: 'online' }));
        S.insert('sales', { id: sale.id + '_r', date: cDate, time: pad(ca.getHours()) + ':' + pad(ca.getMinutes()), items: sale.items.map(function (l) { return { productId: l.productId, name: l.name, qty: -l.qty, price: l.price }; }),
          subtotal: -sale.subtotal, tax: -sale.tax, total: -sale.total, discount: -sale.discount, payment: sale.payment, memberId: sale.memberId, staffId: 'stf_23',
          giftCardId: null, giftLast4: null, giftAmount: 0, channel: 'online', orderId: id, orderNo: x.no, refundOf: sale.id });
        Object.assign(doc, { cancelledAt: cIso, cancelledBy: front, cancelReason: x.cancelReason, refund: { amount: total, receiptId: cr.id, at: cIso } });
        log.push({ at: cIso, text: 'Cancelled by ' + front + ': ' + x.cancelReason + ' Refunded ' + (Club.fmtEn || F).money(total) + ', stock put back.' });
      }
      doc.status = x.status;
      S.insert('shopOrders', doc);
      seq = Math.max(seq, parseInt(x.no.slice(2), 10));
    });
    if (seq > (+S.getObj('shopOrderSeq', 0) || 0)) S.setObj('shopOrderSeq', seq);
  }
  function runShopSeed() { try { seedShopOrders(); } catch (e) { console.error('Online shop demo orders failed', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runShopSeed); else setTimeout(runShopSeed, 0);

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function products() { return S.all('products'); }

  /* For the staff page (js/modules/proshop.js) */
  Club.shared = Club.shared || {};
  Club.shared.proshop = { r2, pad, products };
})();
