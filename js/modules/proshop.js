/* Pro Shop: point of sale, inventory, sales history and the online shop's orders.
   Owns collections: products, sales. Posts member-account sales to the shared ledger via Club.chargeMember.
   Online golf shop (Club.shop, js/core/shop.js): products carry online (Inventory "Sell online") and blurb; the Online
   orders tab prepares shopOrders (Mark ready, Picked up, Cancel and refund). Online sales are 'sales' docs with channel 'online'.
   Undo (Club.undo, js/core/undo.js): every staff change here offers Undo on its toast (a sale is reversed with a refund sale,
   credit receipts and the stock put back). Online order cards open a details drawer and keep a step back (Back to new,
   Back to ready). The register takes an optional customer (member or public golfer) so the receipt reaches their account. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, R = S.R, esc = U.esc;
  /* Data helpers shared with the members' portal and public site: js/shared/proshop-data.js */
  const { r2, pad, products } = Club.shared.proshop;


  const CATS = ['Apparel', 'Clubs', 'Balls', 'Accessories', 'Footwear', 'Headwear'];
  const CAT_ICON = { Apparel: 'tag', Clubs: 'flag', Balls: 'ball', Accessories: 'gift', Footwear: 'box', Headwear: 'crest' };
  const TENDERS = ['Member account', 'Card', 'Cash'];
  /** Canada has no pennies: a cash payment is rounded to the nearest 5 cents (the daily close counts it that way). */
  function cashDue(v) { return Math.round((+v || 0) * 20) / 20; }
  /** Tax label from the rate set in Settings (12% reads GST 5% + PST 7%, the Manitoba split). */
  function taxLabel() { const r = Math.round(Club.taxRate() * 10000) / 100; return r === 12 ? 'GST 5% + PST 7%' : 'Tax ' + r + '%'; }
  const TENDER_ICON = { 'Member account': 'user', Card: 'card', Cash: 'cash', 'Gift card': 'gift' };
  /* The register's tender buttons (Nov 12): in-person ways first, so a walk-in is charged by card or cash without hunting.
     'Gift card' opens the gift card till; a card that does not cover the total leaves the rest to Card, Cash or the account. */
  const REG_TENDERS = ['Card', 'Cash', 'Gift card', 'Member account'];
  function nowHM() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function money(v) { return F.money(v); }
  function product(id) { return S.find('products', id); }
  function status(p) { return p.stock <= 0 ? 'out' : (p.stock <= p.reorderAt ? 'low' : 'ok'); }
  function statusBadge(p) {
    const s = status(p);
    return s === 'out' ? U.badge('Out of stock', 'bad') : (s === 'low' ? U.badge('Low stock', 'warn') : U.badge('In stock', 'good'));
  }
  function lowCount() { return products().filter(function (p) { return status(p) !== 'ok'; }).length; }
  function margin(p) { return p.price > 0 ? (p.price - p.cost) / p.price * 100 : 0; }
  function nextSaleNo() { return S.all('sales').reduce(function (m, s) { return Math.max(m, s.number || 0); }, 5000) + 1; }
  function memberLabel(id) { const m = id && Club.members.get(id); return m ? m.firstName + ' ' + m.lastName + ' · #' + m.memberNo : 'Member no longer on file'; }
  function publicName(id) { const p = id && S.find('publicPlayers', id); return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Public golfer' : 'Public golfer'; }
  function fieldError(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid');
    f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
    f.focus();
  }
  function clearErrors(form) {
    U.$$('.field-error', form).forEach(function (e) { e.remove(); });
    U.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
  }
  function crest() { return Club.logoImg('ps-crest'); }
  /* Remembered per workstation (the associate at this register), never throws */
  function pref(k, v) {
    const P = window.Portal && Portal.prefs; if (!P) return v === undefined ? '' : undefined;
    if (v === undefined) return P.get('proshop.' + k, ''); P.set('proshop.' + k, v);
  }
  /* Pagination for the long tables: "21 to 40 of 219" plus page buttons (first, last and a window round the current page) */
  /* 10 rows a page on phones and for the sales history, 15 for the inventory ledger on larger screens */
  let PER = 15;
  function setPer(n) { PER = window.matchMedia && window.matchMedia('(max-width: 768px)').matches ? 10 : n; }
  function pageCount(total) { return Math.max(1, Math.ceil(total / PER)); }
  function pager(key, page, total) {
    const pages = pageCount(total); if (total <= PER) return '';
    const from = (page - 1) * PER + 1, to = Math.min(total, page * PER);
    const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    let html = '', last = 0;
    nums.forEach(function (n) {
      if (n - last > 1) html += '<span class="ps-pager-gap" aria-hidden="true">…</span>';
      html += '<button type="button" class="ps-pager-n' + (n === page ? ' active' : '') + '" data-page-key="' + key + '" data-page="' + n + '"' + (n === page ? ' aria-current="page"' : '') + ' aria-label="Page ' + n + '">' + n + '</button>';
      last = n;
    });
    return '<nav class="ps-pager" aria-label="Pages"><span class="ps-pager-info">' + from + ' to ' + to + ' of ' + F.num(total) + '</span><div class="ps-pager-btns">' +
      '<button type="button" class="ps-pager-n" data-page-key="' + key + '" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">' + Club.icon('chevronLeft') + '</button>' + html +
      '<button type="button" class="ps-pager-n" data-page-key="' + key + '" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Next page">' + Club.icon('chevronRight') + '</button></div></nav>';
  }


  /* ------------------------------------------------------------------
     State (kept across tab switches and re-renders)
     ------------------------------------------------------------------ */
  const state = {
    tab: 'register', cat: 'All', q: '', ticket: [], tender: 'Card', cust: null, cash: '', staffId: '', gift: null,
    invQ: '', invCat: 'All', invStatus: 'all', highlight: null,
    salesFrom: null, salesTo: null, salesTender: 'All', salesPage: 1, invPage: 1, reorderAll: false
  };

  function ticketTotals() {
    const subtotal = r2(state.ticket.reduce(function (a, l) { const p = product(l.productId); return a + (p ? p.price * l.qty : 0); }, 0));
    const tax = r2(subtotal * Club.taxRate());
    return { subtotal: subtotal, tax: tax, total: r2(subtotal + tax), units: state.ticket.reduce(function (a, l) { return a + l.qty; }, 0) };
  }
  /** Receipt lines (Club.receipts) at tax-included unit prices that add up to exactly `total`: any cent of rounding
      goes on one unit (split onto its own line when every line has more than one). */
  function taxedLines(items, total) {
    const sub = items.reduce(function (a, l) { return a + l.qty * l.price; }, 0), f = sub ? total / sub : 1;
    const out = items.map(function (l) { return { name: l.name, qty: l.qty, price: r2(l.price * f) }; });
    const diff = r2(total - out.reduce(function (a, l) { return a + l.qty * l.price; }, 0));
    if (diff && out.length) {
      const one = out.find(function (l) { return l.qty === 1; });
      if (one) one.price = r2(one.price + diff);
      else { const last = out[out.length - 1]; last.qty--; out.push({ name: last.name, qty: 1, price: r2(last.price + diff) }); }
    }
    return out;
  }
  /** What is left to pay after a gift card applied to the ticket (Club.giftcards, js/core/giftcards.js). */
  function giftOn(total) { const g = Club.giftcards ? Club.giftcards.tillState(state.gift, total) : null; return g && g.amount > 0 ? g : null; }
  function pruneTicket() {
    state.ticket = state.ticket.filter(function (l) { return product(l.productId); });
  }

  /* ------------------------------------------------------------------
     Receipt
     ------------------------------------------------------------------ */
  function receiptHTML(sale, change) {
    const staff = Club.staff.get(sale.staffId);
    const member = sale.memberId ? Club.members.get(sale.memberId) : null;
    return '<div class="ps-receipt" id="ps-receipt">' +
      '<div class="ps-receipt-head">' + crest() +
      '<div class="ps-receipt-club">' + esc(Club.info.name) + '</div>' +
      '<div class="ps-receipt-sub">Golf Shop · Established ' + esc(Club.info.est) + '</div>' +
      '<div class="ps-receipt-addr">' + esc(Club.info.address) + '<br>' + esc(Club.info.phone) + '</div></div>' +
      '<div class="ps-receipt-meta"><span>Sale No. ' + esc(sale.number || sale.id) + '</span><span>' + esc(F.date(sale.date)) + ' · ' + esc(F.time(sale.time)) + '</span></div>' +
      '<div class="ps-receipt-rule"></div>' +
      '<table class="ps-receipt-items"><tbody>' + sale.items.map(function (it) {
        return '<tr><td>' + esc(it.name) + '<div class="ps-receipt-qty">' + it.qty + ' at ' + money(it.price) + '</div></td><td class="num">' + money(it.qty * it.price) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="ps-receipt-rule"></div>' +
      '<dl class="ps-receipt-totals"><dt>Subtotal</dt><dd>' + money(sale.subtotal) + '</dd><dt>Tax (' + esc(taxLabel()) + ')</dt><dd>' + money(sale.tax) + '</dd>' +
      '<dt class="ps-receipt-grand">Total</dt><dd class="ps-receipt-grand">' + money(sale.total) + '</dd></dl>' +
      '<div class="ps-receipt-rule"></div>' +
      '<dl class="ps-receipt-totals">' + (sale.giftAmount ? '<dt>Gift card ending ' + esc(sale.giftLast4) + '</dt><dd>−' + money(sale.giftAmount) + '</dd>' : '') + '<dt>Tender</dt><dd>' + esc(sale.payment) + '</dd>' +
      (member ? '<dt>' + (sale.payment === 'Member account' ? 'Account' : 'Customer') + '</dt><dd>' + esc(member.firstName + ' ' + member.lastName) + ' · #' + esc(member.memberNo) + '</dd>' : (sale.memberId ? '<dt>Account</dt><dd>Member no longer on file</dd>' : '')) +
      (sale.publicPlayerId ? '<dt>Customer</dt><dd>' + esc(publicName(sale.publicPlayerId)) + ' · public golfer</dd>' : '') +
      (sale.payment === 'Cash' && sale.cashTendered ? '<dt>Cash tendered</dt><dd>' + money(sale.cashTendered) + '</dd><dt>Change</dt><dd>' + money(change != null ? change : Math.max(0, sale.cashTendered - cashDue(sale.total))) + '</dd>' : '') +
      '<dt>Served by</dt><dd>' + esc(staff ? staff.firstName + ' ' + staff.lastName.charAt(0) + '.' : 'Golf shop') + '</dd></dl>' +
      (sale.payment === 'Member account' ? '<div class="ps-receipt-sign"><span>Member signature</span></div>' : '') +
      '<div class="ps-receipt-thanks">' + (member ? 'Thank you, ' + esc(member.firstName) + '. See you on the course.' : 'Thank you for visiting the St. Boniface Golf Shop.') + '</div>' +
      '</div>';
  }
  /* Receipts for counter sales (Club.receipts, source 'pos' like the account sales, refId the sale): money taken at the golf
     shop till, channel 'counter' with tenders, so the daily close (js/modules/accounting.js) counts the golf shop drawer. */
  /* With a customer picked on the register, the receipt carries their memberId or publicPlayerId, so it shows in the members'
     portal (My account, Receipts) or on the public site's My account; without one it stays a walk-in receipt. */
  function counterReceipt(sale, items, total, gift, due, tender) {
    if (!Club.receipts) return null;
    const title = 'Pro shop sale No. ' + sale.number, lines = taxedLines(items, total);
    const method = tender === 'Cash' ? 'cash' : 'card';
    const who = sale.memberId ? { memberId: sale.memberId } : sale.publicPlayerId ? { publicPlayerId: sale.publicPlayerId } : { name: 'Walk-in customer' };
    try {
      if (gift) return Club.giftcards.receipt(Object.assign({}, who, { title: title, lines: lines, total: total, gift: gift,
        rest: { method: method, label: method === 'cash' ? 'Cash' : 'Card', amount: due }, source: 'pos', refId: sale.id, channel: 'counter' }));
      return Club.receipts.create(Object.assign({}, who, { title: title, lines: lines, total: total, method: method, methodLabel: method === 'cash' ? 'Cash' : 'Card',
        source: 'pos', refId: sale.id, date: sale.date, tenders: [{ method: method, amount: total }], channel: 'counter' }));
    } catch (e) { console.error('Receipt failed for sale ' + sale.id, e); return null; }
  }
  /** The receipt chargeMember made for an account sale: an account tender at the counter. */
  function tagAccountReceipt(ch) {
    if (!ch || !Club.receipts) return;
    const rc = S.all('receipts').find(function (r) { return r.chargeId === ch.id; });
    if (rc && !rc.tenders) S.update('receipts', rc.id, { tenders: [{ method: 'account', amount: Math.abs(r2(ch.amount)) }], channel: 'counter' });
  }
  function showReceipt(sale, change) {
    U.modal({
      eyebrow: 'Receipt', title: 'Sale No. ' + (sale.number || ''),
      body: receiptHTML(sale, change),
      actions: [
        { label: 'Print receipt', kind: 'ghost', icon: 'print', onClick: function () { document.body.classList.add('ps-printing'); window.print(); setTimeout(function () { document.body.classList.remove('ps-printing'); }, 300); return false; } },
        { label: 'Done', kind: 'primary' }
      ]
    });
  }

  /* ------------------------------------------------------------------
     Product modals
     ------------------------------------------------------------------ */
  function productModal(p, after) {
    const isNew = !p; p = p || { sku: '', name: '', brand: '', category: 'Apparel', price: '', cost: '', stock: 0, reorderAt: 4, online: false, blurb: '' };
    const body = '<form class="form-grid" novalidate>' +
      U.field({ label: 'SKU', name: 'sku', value: p.sku, required: true, placeholder: 'AP-1042' }) +
      U.field({ label: 'Category', name: 'category', type: 'select', options: U.options(CATS, p.category) }) +
      U.field({ label: 'Product name', name: 'name', value: p.name, required: true, span2: true, placeholder: 'St. Boniface Crest Polo' }) +
      U.field({ label: 'Brand', name: 'brand', value: p.brand, required: true, span2: true, placeholder: 'FootJoy' }) +
      U.field({ label: 'Retail price', name: 'price', type: 'number', value: p.price, required: true, min: 0, step: '0.01' }) +
      U.field({ label: 'Unit cost', name: 'cost', type: 'number', value: p.cost, required: true, min: 0, step: '0.01' }) +
      U.field({ label: isNew ? 'Opening stock' : 'Stock on hand', name: 'stock', type: 'number', value: p.stock, required: true, min: 0, step: 1 }) +
      U.field({ label: 'Reorder at', name: 'reorderAt', type: 'number', value: p.reorderAt, required: true, min: 0, step: 1, hint: 'Flags the item as low stock at or below this level.' }) +
      '<div class="span-2 ps-margin-preview"></div>' +
      '<div class="field span-2 ps-online-f"><label class="check ps-online-check"><span class="toggle"><input type="checkbox" name="online"' + (p.online ? ' checked' : '') + '><span></span></span><span><strong>Sell online</strong><span class="muted">Listed in the online golf shop on the public site and the members’ portal, for pickup here. Sold out items stay listed as Sold out.</span></span></label></div>' +
      '<div class="field span-2"><label for="ps-blurb">Online description <span class="muted">(optional)</span></label><textarea class="textarea" id="ps-blurb" name="blurb" maxlength="240" rows="2" placeholder="One or two plain sentences shown on the item page">' + esc(p.blurb || '') + '</textarea></div>' +
      '</form>';
    const m = U.modal({
      eyebrow: isNew ? 'Inventory' : p.sku, title: isNew ? 'Add product' : 'Edit product', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Add product' : 'Save product', kind: 'primary', onClick: function (api) {
            const form = U.$('form', api.body);
            clearErrors(form);
            if (!U.validate(form)) return false;
            const d = U.formData(form);
            const sku = d.sku.toUpperCase();
            if (products().some(function (x) { return x.sku.toUpperCase() === sku && (isNew || x.id !== p.id); })) { fieldError(form, 'sku', 'Another product already uses this SKU.'); return false; }
            if (!(d.price > 0)) { fieldError(form, 'price', 'Enter a retail price above zero.'); return false; }
            if (d.cost < 0) { fieldError(form, 'cost', 'Cost cannot be negative.'); return false; }
            if (d.stock < 0 || Math.floor(d.stock) !== d.stock) { fieldError(form, 'stock', 'Enter a whole number of units.'); return false; }
            if (d.reorderAt < 0 || Math.floor(d.reorderAt) !== d.reorderAt) { fieldError(form, 'reorderAt', 'Enter a whole number.'); return false; }
            const doc = { sku: sku, name: d.name, brand: d.brand, category: d.category, price: r2(d.price), cost: r2(d.cost), stock: d.stock, reorderAt: d.reorderAt, online: !!d.online, blurb: String(d.blurb || '').slice(0, 240) };
            Club.undo.run(function () { if (isNew) S.insert('products', Object.assign({ id: S.uid('prd') }, doc)); else S.update('products', p.id, doc); },
              { message: isNew ? 'Product added' : 'Product saved', after: function () { pruneTicket(); if (after) after(); }, undone: isNew ? doc.name + ' removed again' : 'Changes to ' + p.name + ' undone' });
            if (after) after();
          }
        }
      ]
    });
    const form = U.$('form', m.body);
    function preview() {
      const d = U.formData(form);
      const el = U.$('.ps-margin-preview', form);
      if (d.price > 0 && d.cost != null) {
        const mg = (d.price - d.cost) / d.price * 100;
        el.innerHTML = '<span class="ps-margin-l">Margin</span> <span class="num ps-margin-num">' + F.pct(mg, 1) + '</span> <span class="muted">' + money(d.price - d.cost) + ' per unit</span>' + (mg < 0 ? ' ' + U.badge('Below cost', 'bad') : '');
      } else el.innerHTML = '<span class="muted">Enter price and cost to see the margin.</span>';
    }
    form.addEventListener('input', preview); preview();
  }

  function receiveModal(p, after) {
    const suggest = Math.max(1, p.reorderAt * 2 - p.stock);
    const body = '<div class="ps-receive-head"><div><div class="muted">' + esc(p.brand) + ' · ' + esc(p.sku) + '</div><div class="ps-receive-name">' + esc(p.name) + '</div></div>' +
      '<div class="ps-receive-onhand"><span class="muted">On hand</span><span class="num">' + p.stock + '</span></div></div>' +
      '<form class="form-grid" novalidate>' +
      U.field({ label: 'Units received', name: 'qty', type: 'number', value: suggest, required: true, min: 1, step: 1 }) +
      U.field({ label: 'Unit cost', name: 'cost', type: 'number', value: p.cost, required: true, min: 0, step: '0.01' }) +
      U.field({ label: 'Purchase order or packing slip', name: 'ref', placeholder: 'PO 2291', span2: true }) +
      '</form>';
    U.modal({
      eyebrow: 'Receive stock', title: 'Receive shipment', body: body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Receive stock', kind: 'primary', icon: 'box', onClick: function (api) {
            const form = U.$('form', api.body);
            clearErrors(form);
            if (!U.validate(form)) return false;
            const d = U.formData(form);
            if (!(d.qty >= 1) || Math.floor(d.qty) !== d.qty) { fieldError(form, 'qty', 'Enter a whole number of at least 1.'); return false; }
            if (d.cost < 0) { fieldError(form, 'cost', 'Cost cannot be negative.'); return false; }
            const cur = product(p.id); if (!cur) { U.toast('This product was removed', 'bad'); return; }
            Club.undo.run(function () { S.update('products', p.id, { stock: cur.stock + d.qty, cost: r2(d.cost), lastReceived: { date: Club.date.today(), qty: d.qty, ref: d.ref } }); },
              { message: 'Received ' + d.qty + (d.qty === 1 ? ' unit of ' : ' units of ') + p.name, after: after, undone: 'Stock receipt undone. ' + p.name + ' is back to ' + cur.stock + ' on hand' });
            if (after) after();
          }
        }
      ]
    });
  }

  async function deleteProduct(p, after) {
    const ok = await U.confirm({ title: 'Delete product?', text: p.name + ' (' + p.sku + ') will be removed from inventory. Past sales keep their line items.', confirmLabel: 'Delete product', danger: true });
    if (!ok) return;
    Club.undo.run(function () { S.remove('products', p.id); }, { message: p.name + ' deleted', after: after, undone: p.name + ' restored' });
    pruneTicket();
    if (after) after();
  }

  /* ------------------------------------------------------------------
     Register
     ------------------------------------------------------------------ */
  function renderRegister(panel) {
    panel.innerHTML = '<div class="ps-register">' +
      '<section class="ps-catalog">' +
      '<div class="ps-toolbar">' +
      '<label class="ps-search">' + Club.icon('search') + '<input class="input" type="search" name="q" placeholder="Search by name, brand or scan a SKU" value="' + esc(state.q) + '" aria-label="Search products"></label>' +
      '<div class="ps-chips" role="group" aria-label="Category">' + ['All'].concat(CATS).map(function (c) {
        return '<button type="button" class="ps-chip' + (state.cat === c ? ' active' : '') + '" data-cat="' + c + '">' + esc(c) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="ps-grid"></div></section>' +
      '<aside class="panel ps-ticket" aria-label="Current ticket"></aside>' +
      '</div>' +
      '<button type="button" class="ps-ticket-bar" data-action="jump-ticket"></button>';

    const grid = U.$('.ps-grid', panel), tk = U.$('.ps-ticket', panel), bar = U.$('.ps-ticket-bar', panel);
    /* Phones: the bar pinned to the bottom jumps to the ticket. Once the ticket is on screen it steps aside, so it never
       sits over the ticket's own Charge button. */
    let tkInView = false;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(function (en) {
        if (!document.body.contains(tk)) { io.disconnect(); return; }
        tkInView = en[en.length - 1].isIntersecting; bar.classList.toggle('show', state.ticket.length > 0 && !tkInView);
      });
      io.observe(tk);
    }

    function filtered() {
      const q = state.q.toLowerCase().trim();
      return products().filter(function (p) {
        if (state.cat !== 'All' && p.category !== state.cat) return false;
        if (q && (p.name + ' ' + p.brand + ' ' + p.sku).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return CATS.indexOf(a.category) - CATS.indexOf(b.category) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name); });
    }
    function drawGrid() {
      let list = filtered();
      if (!list.length) {
        grid.innerHTML = '<div class="ps-grid-empty panel">' + U.empty({ icon: 'search', title: 'No products found', text: state.q ? 'Nothing matches "' + state.q + '" in ' + (state.cat === 'All' ? 'the shop' : state.cat) + '. Try a SKU or a brand name.' : 'There are no products in this category yet.' }) + '</div>';
        return;
      }
      const phone = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      const cap = phone && !state.q && state.cat === 'All' && !state.gridAll && list.length > 12 ? 12 : list.length;
      const rest = list.length - cap;
      list = list.slice(0, cap);
      grid.innerHTML = list.map(function (p) {
        const st = status(p); const inT = state.ticket.find(function (l) { return l.productId === p.id; });
        return '<button type="button" class="ps-tile ' + st + '" data-add="' + p.id + '"' + (st === 'out' ? ' aria-disabled="true"' : '') + ' aria-label="Add ' + esc(p.name) + ', ' + money(p.price) + '">' +
          '<span class="ps-tile-brand">' + esc(p.brand) + '</span>' +
          '<span class="ps-tile-name">' + esc(p.name) + '</span>' +
          '<span class="ps-tile-foot"><span class="ps-tile-price">' + money(p.price) + '</span><span class="ps-tile-stock">' + (st === 'out' ? 'Sold out' : p.stock + ' left') + '</span></span>' +
          (inT ? '<span class="ps-tile-count">' + inT.qty + '</span>' : '') +
          '</button>';
      }).join('') + (rest > 0 ? '<button type="button" class="s-link ps-grid-more" data-action="grid-all">View all ' + (list.length + rest) + ' products</button>' : '');
    }
    function drawTicket() {
      pruneTicket();
      const t = ticketTotals();
      const lines = state.ticket.map(function (l) {
        const p = product(l.productId);
        return '<div class="ps-line" data-line="' + p.id + '">' +
          '<div class="ps-line-main"><div class="ps-line-name">' + esc(p.name) + '</div><div class="ps-line-sub">' + esc(p.brand) + ' · ' + esc(p.sku) + ' · ' + money(p.price) + ' each</div></div>' +
          '<div class="ps-stepper"><button type="button" data-step="-1" aria-label="Decrease quantity">&minus;</button><span class="num" aria-live="polite">' + l.qty + '</span><button type="button" data-step="1" aria-label="Increase quantity"' + (l.qty >= p.stock ? ' class="at-max"' : '') + '>+</button></div>' +
          '<div class="ps-line-total num">' + money(p.price * l.qty) + '</div>' +
          '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="' + p.id + '" title="Remove ' + esc(p.name) + '" aria-label="Remove ' + esc(p.name) + '">' + Club.icon('close') + '</button>' +
          '</div>';
      }).join('');
      let tender = '';
      const g0 = giftOn(t.total);
      if (state.tender === 'Gift card') {
        tender = !g0 ? '<p class="ps-tender-note">Scan or type the gift card code. Any balance left stays on the card.</p>' + (state.ticket.length ? Club.giftcards.tillHTML(null, t.total) : '')
          : g0.covers ? '' : '<p class="ps-tender-note">The gift card covers ' + money(g0.amount) + '. Choose Card, Cash or Member account for the ' + money(g0.due) + ' still to pay.</p>';
      } else if (state.tender === 'Member account') {
        tender = '<p class="ps-tender-note">Charged to the account of the member chosen as the customer.</p>';
      } else if (state.tender === 'Card') {
        tender = '<p class="ps-tender-note">Present the total on the card terminal, then complete the sale once approved.</p>';
      } else {
        const quick = [cashDue(t.total), Math.ceil(t.total / 20) * 20, Math.ceil(t.total / 50) * 50, Math.ceil(t.total / 100) * 100].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
        tender = '<div class="field"><label for="ps-cash">Cash tendered</label><input class="input num" id="ps-cash" name="cash" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="' + esc(state.cash) + '"></div>' +
          (t.total > 0 ? '<div class="ps-quick">' + quick.map(function (v, i) { return '<button type="button" class="btn btn-sm" data-cash="' + v + '">' + (i === 0 ? 'Exact' : F.money0(v)) + '</button>'; }).join('') + '</div>' : '') +
          '<div class="ps-change">' + changeHTML(t.total) + '</div>';
      }
      tk.innerHTML = '<div class="panel-head"><div><div class="eyebrow">Sale No. ' + nextSaleNo() + '</div><h3>Ticket</h3></div>' +
        (state.ticket.length ? U.btn('Clear', { kind: 'ghost', sm: true, action: 'clear' }) : '') + '</div>' +
        '<div class="ps-lines">' + (lines || '<div class="ps-ticket-empty"><span class="ps-ticket-empty-t">Tap an item to begin a sale.</span><span class="muted">Search by SKU to scan straight onto the ticket.</span></div>') + '</div>' +
        '<dl class="ps-totals"><dt>Subtotal <span class="muted">' + t.units + (t.units === 1 ? ' item' : ' items') + '</span></dt><dd class="num">' + money(t.subtotal) + '</dd>' +
        '<dt>Tax <span class="muted">' + esc(taxLabel()) + '</span></dt><dd class="num">' + money(t.tax) + '</dd>' +
        '<dt class="ps-grand">Total</dt><dd class="ps-grand num">' + money(t.total) + '</dd></dl>' +
        custHTML(t.total) +
        (Club.giftcards && state.ticket.length && g0 ? Club.giftcards.tillHTML(state.gift, t.total) : '') +
        '<div class="ps-tender"><div class="ps-tender-label" id="ps-tender-l">Tender</div>' +
        '<div class="segmented ps-tenders" role="radiogroup" aria-labelledby="ps-tender-l">' + REG_TENDERS.filter(function (x) { return x !== 'Gift card' || Club.giftcards; }).map(function (x) {
          return '<button type="button" role="radio" aria-checked="' + (state.tender === x) + '" class="ps-tender-btn' + (state.tender === x ? ' active' : '') + '" data-tender="' + x + '">' + Club.icon(TENDER_ICON[x]) + '<span>' + esc(x === 'Member account' ? 'Member account' : x) + '</span></button>';
        }).join('') + '</div>' +
        '<form class="ps-tender-body" novalidate onsubmit="return false">' + tender +
        '<div class="field"><label for="ps-staff">Associate</label><select class="select" id="ps-staff" name="staffId"><option value="">Select an associate</option>' + Club.staff.options(state.staffId, 'Golf Operations') + '</select></div>' +
        '</form></div>' +
        '<div class="ps-complete-wrap"><button type="button" class="btn btn-primary ps-complete" data-action="complete"' + (state.ticket.length ? '' : ' disabled') + '>' + Club.icon(completeIcon(t.total)) + '<span>' + esc(completeLabel(t.total)) + '</span></button></div>';
      bar.innerHTML = '<span class="ps-bar-l">Ticket</span><span>' + t.units + (t.units === 1 ? ' item' : ' items') + '</span><strong class="num">' + money(t.total) + '</strong>';
      bar.classList.toggle('show', state.ticket.length > 0 && !tkInView);
    }
    /** The register's main button says what will happen: "Charge $54.20 by card", "Take $55.00 cash", "Charge $54.20 to account". */
    function completeLabel(total) {
      if (!state.ticket.length || !(total > 0)) return 'Complete sale';
      const g = giftOn(total), due = g ? g.due : total;
      if (g && g.covers) return 'Complete sale · paid by gift card';
      if (state.tender === 'Gift card') return g ? 'Choose how to pay ' + money(due) : 'Apply a gift card';
      if (state.tender === 'Cash') return 'Take ' + money(cashDue(due)) + ' cash';
      if (state.tender === 'Member account') return 'Charge ' + money(due) + ' to account';
      return 'Charge ' + money(due) + ' by card';
    }
    function completeIcon(total) { const g = giftOn(total); return state.tender === 'Gift card' && !(g && g.covers) ? 'gift' : state.tender === 'Card' && !(g && g.covers) ? 'card' : state.tender === 'Cash' && !(g && g.covers) ? 'cash' : 'check'; }
    /** Gift card tender: scan or type the code. A card that leaves something to pay hands the rest to Card. */
    function applyGift() {
      Club.giftcards.tillApply({ total: ticketTotals().total, onApply: function (g) {
        state.gift = g;
        const on = giftOn(ticketTotals().total);
        if (on && !on.covers && state.tender === 'Gift card') state.tender = 'Card';
        drawTicket();
      } });
    }
    /* ---- Customer: an optional search over members and public golfers (required for the member account tender) ---- */
    function custDoc() {
      const c = state.cust; if (!c) return null;
      const d = c.kind === 'member' ? Club.members.get(c.id) : S.find('publicPlayers', c.id);
      return d ? { kind: c.kind, id: c.id, doc: d } : null;
    }
    function acctTender(total) { const g = giftOn(total); return state.tender === 'Member account' && !(g && g.covers); }
    function custHTML(total) {
      const acct = acctTender(total), c = custDoc();
      let inner;
      if (c) {
        const d = c.doc, name = [d.firstName, d.lastName].filter(Boolean).join(' ');
        let sub;
        if (c.kind === 'member') { const tier = Club.members.tier(d); sub = 'Member #' + esc(d.memberNo) + (tier ? ' · ' + esc(tier.name) : '') + (acct ? ' · Balance ' + money(d.balance) : ''); }
        else sub = 'Public golfer' + (d.email ? ' · ' + esc(d.email) : '');
        const warn = acct && c.kind === 'member' && (d.status === 'suspended' || d.status === 'resigned');
        inner = '<div class="ps-cust-chip">' + U.person(name, sub) + '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-cust-clear aria-label="Remove ' + esc(name) + ' as the customer" title="Remove customer">' + Club.icon('close') + '</button></div>' +
          (warn ? '<div class="ps-member-warn">' + U.badge(d.status === 'suspended' ? 'Suspended' : 'Resigned', 'bad') + ' <span>Charging privileges are not available.</span></div>' : '');
      } else {
        inner = '<div class="ps-cust-wrap">' + Club.icon('search') + '<input class="input" id="ps-cust" name="customer" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ps-cust-list" placeholder="Search members and public golfers">' + (Club.cardScan ? Club.cardScan.button('ps-cust-scan') : '') + '</div>' +
          '<ul class="ps-cust-list" id="ps-cust-list" role="listbox" aria-label="Matching customers" hidden></ul>';
      }
      return '<div class="field ps-cust"><label for="ps-cust">' + (acct ? 'Member to charge' : 'Customer <span class="muted">(optional)</span>') + '</label>' + inner +
        (c || acct ? '' : '<span class="ps-cust-hint">Their receipt goes to their account online. Leave empty for a walk-in.</span>') + '</div>';
    }
    function custMatches(q) {
      q = q.trim().toLowerCase(); if (!q) return [];
      /* A membership card scanned or typed: "STB-M-1003" finds that member alone; a bare member number puts them first.
         Either way Enter picks them. */
      const card = Club.members.fromCode(q), isCode = card && /^stb/i.test(q);
      const digits = q.replace(/\D/g, '');
      const hit = function (parts) { return parts.join(' ').toLowerCase().indexOf(q) >= 0; };
      const mem = S.all('members').filter(function (m) { return hit([m.firstName + ' ' + m.lastName, m.lastName + ', ' + m.firstName, '#' + m.memberNo, m.email || '']) || (digits.length >= 3 && String(m.memberNo).indexOf(digits) >= 0); })
        .sort(function (a, b) { return (card ? (b.id === card.id) - (a.id === card.id) : 0) || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName); })
        .filter(function (m) { return !isCode || m.id === card.id; }).slice(0, 6)
        .map(function (m) { const tier = Club.members.tier(m); return { kind: 'member', id: m.id, name: m.firstName + ' ' + m.lastName, sub: 'Member #' + m.memberNo + (tier ? ' · ' + tier.name : '') + (m.status && m.status !== 'active' ? ' · ' + m.status.charAt(0).toUpperCase() + m.status.slice(1) : '') }; });
      const pub = isCode ? [] : S.all('publicPlayers').filter(function (p) { return hit([(p.firstName || '') + ' ' + (p.lastName || ''), p.email || '']) || (digits.length >= 4 && String(p.phone || '').replace(/\D/g, '').indexOf(digits) >= 0); })
        .slice(0, 4).map(function (p) { return { kind: 'public', id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(' '), sub: 'Public golfer' + (p.email ? ' · ' + p.email : '') }; });
      return mem.concat(pub);
    }
    let custActive = -1;
    function custList(show) {
      const inp = U.$('#ps-cust', tk), list = U.$('#ps-cust-list', tk); if (!inp || !list) return;
      const found = show ? custMatches(inp.value) : [];
      custActive = found.length ? 0 : -1;
      list.innerHTML = found.length ? found.map(function (f, i) {
        return '<li role="option" id="ps-cust-o' + i + '" class="ps-cust-opt' + (i === 0 ? ' is-active' : '') + '" aria-selected="' + (i === 0) + '" data-kind="' + f.kind + '" data-id="' + esc(f.id) + '"><b>' + esc(f.name) + '</b><span>' + esc(f.sub) + '</span></li>';
      }).join('') : '<li class="ps-cust-none">No member or public golfer matches.</li>';
      const open = show && inp.value.trim().length > 0;
      list.hidden = !open; inp.setAttribute('aria-expanded', String(open));
      if (custActive >= 0) inp.setAttribute('aria-activedescendant', 'ps-cust-o0'); else inp.removeAttribute('aria-activedescendant');
    }
    function custMove(d) {
      const inp = U.$('#ps-cust', tk), opts = U.$$('.ps-cust-opt', tk); if (!opts.length) return;
      custActive = (custActive + d + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.classList.toggle('is-active', i === custActive); o.setAttribute('aria-selected', String(i === custActive)); });
      inp.setAttribute('aria-activedescendant', opts[custActive].id); opts[custActive].scrollIntoView({ block: 'nearest' });
    }
    function custPick(kind, id) {
      state.cust = { kind: kind, id: id };
      drawTicket();
      const x = U.$('[data-cust-clear]', tk); if (x) x.focus();
    }
    function changeHTML(total) {
      const cash = parseFloat(state.cash);
      if (!state.cash || isNaN(cash)) return '<span>Change due</span><span class="num muted">' + money(0) + '</span>';
      total = cashDue(total);
      if (cash + 0.001 < total) return '<span>Still due</span><span class="num ps-short">' + money(total - cash) + '</span>';
      return '<span>Change due</span><span class="num">' + money(Math.max(0, cash - total)) + '</span>';
    }
    function flash(id) {
      const tile = grid.querySelector('[data-add="' + id + '"]'); if (tile) { tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash'); }
      const line = tk.querySelector('[data-line="' + id + '"]'); if (line) line.classList.add('pulse');
    }
    function add(id, n) {
      const p = product(id); if (!p) return;
      const line = state.ticket.find(function (l) { return l.productId === id; });
      const have = line ? line.qty : 0;
      if (p.stock <= 0) { U.toast(p.name + ' is out of stock', 'bad'); return; }
      if (have + n > p.stock) { U.toast('Only ' + p.stock + ' of ' + p.name + ' in stock', 'bad'); return; }
      if (line) line.qty += n; else state.ticket.push({ productId: id, qty: n });
      drawGrid(); drawTicket(); flash(id);
    }
    function step(id, d) {
      const line = state.ticket.find(function (l) { return l.productId === id; }); if (!line) return;
      if (d > 0) return add(id, 1);
      line.qty -= 1; if (line.qty <= 0) state.ticket = state.ticket.filter(function (l) { return l !== line; });
      drawGrid(); drawTicket();
    }

    U.on(panel, 'click', '[data-cat]', function (e, b) { state.cat = b.dataset.cat; U.$$('.ps-chip', panel).forEach(function (c) { c.classList.toggle('active', c === b); }); drawGrid(); });
    U.on(panel, 'click', '[data-add]', function (e, b) { add(b.dataset.add, 1); });
    U.on(panel, 'click', '[data-step]', function (e, b) { step(b.closest('[data-line]').dataset.line, +b.dataset.step); });
    U.on(panel, 'click', '[data-remove]', function (e, b) { state.ticket = state.ticket.filter(function (l) { return l.productId !== b.dataset.remove; }); drawGrid(); drawTicket(); });
    U.on(panel, 'click', '[data-tender]', function (e, b) {
      state.tender = b.dataset.tender; drawTicket();
      if (state.tender === 'Gift card' && state.ticket.length && !giftOn(ticketTotals().total) && Club.giftcards) applyGift();
    });
    U.on(panel, 'click', '[data-cash]', function (e, b) { state.cash = String(b.dataset.cash); const i = U.$('#ps-cash', tk); if (i) i.value = state.cash; U.$('.ps-change', tk).innerHTML = changeHTML(ticketTotals().total); });
    U.on(panel, 'click', '[data-action=grid-all]', function () { state.gridAll = true; drawGrid(); });
    /* Clear starts a new ticket: the customer and any applied gift card go too, so the next sale cannot be charged to them. */
    U.on(panel, 'click', '[data-action=clear]', function () {
      const was = { ticket: state.ticket.slice(), cash: state.cash, cust: state.cust, gift: state.gift, tender: state.tender };
      if (!was.ticket.length && !was.cust && !was.gift) return;
      state.ticket = []; state.cash = ''; state.cust = null; state.gift = null; drawGrid(); drawTicket();
      U.toast('Ticket cleared', '', { action: { label: 'Undo', onClick: function () { Object.assign(state, was); drawGrid(); drawTicket(); } } });
    });
    U.on(panel, 'click', '[data-action=jump-ticket]', function () { tk.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    U.on(panel, 'click', '[data-action=complete]', function () { complete(); });
    U.on(panel, 'click', '[data-gc-till]', function (e, b) {
      if (b.dataset.gcTill === 'remove') { state.gift = null; drawTicket(); return; }
      applyGift();
    });
    /* Customer combobox: type to search, arrows and Enter to choose, Escape to close; the chip's close button clears it. */
    U.on(panel, 'input', '#ps-cust', function (e, i) { i.classList.remove('invalid'); U.$$('.ps-cust .field-error', tk).forEach(function (x) { x.remove(); }); custList(true); });
    U.on(panel, 'keydown', '#ps-cust', function (e, i) {
      const list = U.$('#ps-cust-list', tk), open = list && !list.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) custList(true); else custMove(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { e.preventDefault(); const o = open && U.$$('.ps-cust-opt', tk)[custActive]; if (o) custPick(o.dataset.kind, o.dataset.id); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); custList(false); }
    });
    U.on(panel, 'focusout', '#ps-cust', function () { setTimeout(function () { const i = U.$('#ps-cust', tk); if (i && document.activeElement !== i) custList(false); }, 120); });
    U.on(panel, 'pointerdown', '.ps-cust-opt', function (e) { e.preventDefault(); });
    U.on(panel, 'click', '.ps-cust-opt', function (e, o) { custPick(o.dataset.kind, o.dataset.id); });
    U.on(panel, 'click', '[data-card-scan]', function () { Club.cardScan.open(function (m) { custPick('member', m.id); }); });
    U.on(panel, 'click', '[data-cust-clear]', function () { state.cust = null; drawTicket(); const i = U.$('#ps-cust', tk); if (i) i.focus(); });
    U.on(panel, 'change', '#ps-staff', function (e, s) { state.staffId = s.value; pref('staffId', s.value); s.classList.remove('invalid'); U.$$('.field-error', tk).forEach(function (x) { if (x.previousElementSibling === s) x.remove(); }); });
    U.on(panel, 'input', '#ps-cash', function (e, i) { state.cash = i.value; i.classList.remove('invalid'); U.$('.ps-change', tk).innerHTML = changeHTML(ticketTotals().total); });
    const search = U.$('input[name=q]', panel);
    search.addEventListener('input', function () { state.q = search.value; drawGrid(); });
    search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const q = search.value.trim().toUpperCase(); if (!q) return;
      const exact = products().find(function (p) { return p.sku.toUpperCase() === q; });
      const list = filtered();
      const hit = exact || (list.length === 1 ? list[0] : null);
      if (hit) { e.preventDefault(); state.q = ''; search.value = ''; drawGrid(); add(hit.id, 1); }
    });

    function complete() {
      pruneTicket();
      if (!state.ticket.length) { U.toast('Add an item to the ticket first', 'bad'); return; }
      for (let i = 0; i < state.ticket.length; i++) {
        const l = state.ticket[i]; const p = product(l.productId);
        if (l.qty > p.stock) {
          U.toast(p.stock ? 'Only ' + p.stock + ' of ' + p.name + ' left. Quantity adjusted.' : p.name + ' is now out of stock. Removed from ticket.', 'bad');
          if (p.stock) l.qty = p.stock; else state.ticket.splice(i, 1);
          drawGrid(); drawTicket(); return;
        }
      }
      const form = U.$('.ps-tender-body', tk); clearErrors(form);
      U.$$('.ps-cust .field-error', tk).forEach(function (x) { x.remove(); });
      const t = ticketTotals();
      const gift = giftOn(t.total), due = gift ? gift.due : t.total;
      const tender = due > 0 ? state.tender : 'Gift card';
      let cashTendered = null;
      if (tender === 'Gift card' && due > 0) {
        if (!gift) applyGift(); else U.toast('Choose Card, Cash or Member account for the ' + money(due) + ' still to pay', 'bad');
        return;
      }
      if (!state.staffId) { fieldError(form, 'staffId', 'Choose the associate making this sale.'); return; }
      const cust = custDoc();
      const custErr = function (msg) { const box = U.$('.ps-cust', tk); if (!box) return; box.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>'); const i = U.$('#ps-cust', box); if (i) { i.classList.add('invalid'); i.focus(); } };
      if (tender === 'Member account') {
        if (!cust || cust.kind !== 'member') { custErr(cust ? 'Only a member can charge to an account. Take card or cash.' : 'Choose the member to charge.'); return; }
        if (cust.doc.status === 'suspended' || cust.doc.status === 'resigned') { custErr('This member cannot charge to their account. Take card or cash.'); return; }
        /* Credit policy (js/shared/billing-data.js): an account 60 days past its statement date cannot charge; staff can
           allow it for today with a reason, and the sale then completes. */
        if (Club.billing && Club.billing.staffChargeGuard && !Club.billing.staffChargeGuard(cust.doc.id, complete)) return;
      } else if (tender === 'Cash') {
        cashTendered = parseFloat(state.cash);
        if (isNaN(cashTendered)) { fieldError(form, 'cash', 'Enter the cash tendered.'); return; }
        if (cashTendered + 0.001 < cashDue(due)) { fieldError(form, 'cash', 'Cash tendered is ' + money(cashDue(due) - cashTendered) + ' short of the total.'); return; }
      }
      const memberId = cust && cust.kind === 'member' ? cust.id : null, publicPlayerId = cust && cust.kind === 'public' ? cust.id : null;
      const no = nextSaleNo();
      const items = state.ticket.map(function (l) { const p = product(l.productId); return { productId: p.id, name: p.name, qty: l.qty, price: p.price }; });
      /* Every write of the sale is recorded, so the toast's Undo reverses it: a refund sale, the stock back, the account charge
         reversed or a credit receipt, and the gift card amount put back. */
      const rec = Club.undo.track(function () {
        const sale = S.insert('sales', {
          id: 'sale_' + no + '_' + Date.now().toString(36).slice(-4), number: no, date: Club.date.today(), time: nowHM(), items: items,
          subtotal: t.subtotal, tax: t.tax, total: t.total, payment: tender,
          memberId: memberId, publicPlayerId: publicPlayerId, staffId: state.staffId,
          cashTendered: cashTendered, giftCardId: gift ? gift.card.id : null, giftLast4: gift ? Club.giftcards.last4(gift.card) : null, giftAmount: gift ? gift.amount : 0
        });
        if (gift) Club.giftcards.redeem(gift.card.id, gift.amount, { where: 'proshop', refId: sale.id, note: 'Pro shop sale No. ' + no, by: Club.staff.name(state.staffId) });
        items.forEach(function (it) { const p = product(it.productId); if (p) S.update('products', p.id, { stock: Math.max(0, p.stock - it.qty) }); });
        if (tender === 'Member account') {
          const ch = Club.chargeMember(memberId, {
            description: 'Pro Shop sale No. ' + no + ' · ' + items.map(function (it) { return (it.qty > 1 ? it.qty + ' x ' : '') + it.name; }).join(', '),
            category: 'Pro Shop', amount: due, source: 'pos', refId: sale.id, date: sale.date,
            title: 'Pro shop sale No. ' + no, lines: taxedLines(items, t.total), noReceipt: !!gift
          });
          if (gift) Club.giftcards.receipt({ memberId: memberId, title: 'Pro shop sale No. ' + no, lines: taxedLines(items, t.total), total: t.total, gift: gift, rest: { method: 'account', amount: due }, source: 'pos', refId: sale.id, chargeId: ch ? ch.id : null, channel: 'counter' });
          else tagAccountReceipt(ch);
        } else counterReceipt(sale, items, t.total, gift, due, tender);
        return sale;
      });
      const sale = rec.result;
      const change = cashTendered != null ? r2(Math.max(0, cashTendered - cashDue(due))) : null;   /* change on the 5-cent rounded total */
      state.ticket = []; state.cash = ''; state.cust = null; state.gift = null; state.tender = 'Card';   /* the next customer starts on Card */
      drawGrid(); drawTicket();
      Club.undo.offer(tender === 'Member account' ? 'Sale No. ' + no + ' charged to the member account' : 'Sale No. ' + no + ' completed', rec, {
        undone: 'Sale No. ' + no + ' undone. Stock is back and the items are on the ticket again' + (tender === 'Card' && due > 0 ? '. Refund the card on the terminal' : tender === 'Cash' && due > 0 ? '. Give back the cash' : ''),
        after: function () {
          /* Put the items back on an empty ticket so the sale can be rung again; the receipt modal for it is closed. */
          const m = document.querySelector('#ps-receipt'); const ov = m && m.closest('.overlay'); if (ov) { const x = ov.querySelector('[data-action=close]'); if (x) x.click(); }
          if (!state.ticket.length) state.ticket = items.filter(function (it) { return product(it.productId); }).map(function (it) { return { productId: it.productId, qty: Math.min(it.qty, product(it.productId).stock) }; }).filter(function (l) { return l.qty > 0; });
          if (!state.cust && cust) state.cust = { kind: cust.kind, id: cust.id };
          if (document.body.contains(tk)) { drawGrid(); drawTicket(); }
        }
      });
      showReceipt(sale, change);
    }

    if (!state.staffId) { const st = pref('staffId'); if (st && Club.staff.get(st)) state.staffId = st; }
    drawGrid(); drawTicket();
  }

  /* ------------------------------------------------------------------
     Inventory
     ------------------------------------------------------------------ */
  function renderInventory(panel) {
    panel.innerHTML = '<div class="ps-inv-stats"></div>' +
      '<div class="panel ps-inv-panel" data-reveal><div class="panel-head ps-inv-head"><div><div class="eyebrow">Stock ledger</div><h3>Inventory</h3></div>' +
      '<div class="ps-inv-tools">' +
      '<label class="ps-search sm">' + Club.icon('search') + '<input class="input" type="search" name="invq" placeholder="SKU, name or brand" value="' + esc(state.invQ) + '" aria-label="Filter inventory"></label>' +
      '<select class="select" name="invcat" aria-label="Category">' + U.options(['All'].concat(CATS).map(function (c) { return { value: c, label: c === 'All' ? 'All categories' : c }; }), state.invCat) + '</select>' +
      U.segmented([{ value: 'all', label: 'All' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out' }, { value: 'online', label: 'Online' }], state.invStatus, 'invstatus') +
      U.btn('Add product', { kind: 'primary', icon: 'plus', action: 'add-product', sm: true }) +
      '</div></div><div class="panel-body flush ps-inv-table"></div></div>' +
      '<div class="grid grid-2 ps-inv-lower">' +
      Portal.accordion({ id: 'ps-acc-reorder', icon: 'box', title: 'Reorder list', summary: 'At or below reorder level', open: !!state.accReorder, body: '<div class="ps-reorder"></div>' }) +
      Portal.accordion({ id: 'ps-acc-bycat', icon: 'reports', title: 'Stock by category', summary: 'Retail value on hand', open: !!state.accBycat, body: '<div class="ps-bycat"></div>' }) +
      '</div>';

    function drawStats(animate) {
      const ps = products();
      const units = ps.reduce(function (a, p) { return a + Math.max(0, p.stock); }, 0);
      const retail = ps.reduce(function (a, p) { return a + Math.max(0, p.stock) * p.price; }, 0);
      const cost = ps.reduce(function (a, p) { return a + Math.max(0, p.stock) * p.cost; }, 0);
      const low = lowCount(); const out = ps.filter(function (p) { return p.stock <= 0; }).length;
      const items = [
        { label: 'Products', value: ps.length, meta: CATS.length + ' categories' },
        { label: 'Units on hand', value: units },
        { label: 'Retail value', value: Math.round(retail), prefix: '$', meta: 'Cost ' + F.money0(cost) },
        { label: 'Needs attention', value: low, meta: out + ' out of stock' }
      ];
      if (!animate) items.forEach(function (i) { i.value = (i.prefix || '') + F.num(i.value); i.prefix = ''; });
      U.$('.ps-inv-stats', panel).innerHTML = U.stats(items);
      if (!animate) U.$$('[data-reveal]', U.$('.ps-inv-stats', panel)).forEach(function (n) { n.classList.add('revealed'); });
    }
    function filtered() {
      const q = state.invQ.toLowerCase().trim();
      return products().filter(function (p) {
        if (state.invCat !== 'All' && p.category !== state.invCat) return false;
        if (state.invStatus === 'low' && status(p) === 'ok') return false;
        if (state.invStatus === 'out' && status(p) !== 'out') return false;
        if (state.invStatus === 'online' && p.online !== true) return false;
        if (q && (p.sku + ' ' + p.name + ' ' + p.brand).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return CATS.indexOf(a.category) - CATS.indexOf(b.category) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name); });
    }
    function drawTable() {
      let list = filtered();
      setPer(15);
      const host = U.$('.ps-inv-table', panel);
      if (!products().length) { host.innerHTML = U.empty({ icon: 'shop', title: 'No products yet', text: 'Add the first product to start selling in the shop.', action: U.btn('Add product', { kind: 'primary', icon: 'plus', action: 'add-product' }) }); return; }
      if (!list.length) { host.innerHTML = U.empty({ icon: 'filter', title: 'Nothing matches these filters', text: 'Clear the search or choose another category.' }); return; }
      if (state.highlight) { const hi = list.findIndex(function (p) { return p.id === state.highlight; }); if (hi >= 0) state.invPage = Math.floor(hi / PER) + 1; }
      state.invPage = Math.max(1, Math.min(pageCount(list.length), state.invPage));
      const all = list; list = list.slice((state.invPage - 1) * PER, state.invPage * PER);
      host.innerHTML = '<div class="table-wrap"><table class="table ps-inv"><thead><tr><th>SKU</th><th>Product</th><th>Brand</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num">Margin</th><th class="num">Stock</th><th>Status</th><th class="center">Sell online</th><th class="right"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
        list.map(function (p) {
          return '<tr class="clickable' + (state.highlight === p.id ? ' selected' : '') + '" data-edit="' + p.id + '">' +
            '<td class="ps-sku num">' + esc(p.sku) + '</td>' +
            '<td class="primary-cell">' + esc(p.name) + '</td>' +
            '<td class="ink-2 ps-brand">' + esc(p.brand) + '</td>' +
            '<td class="ink-2">' + esc(p.category) + '</td>' +
            '<td class="num">' + money(p.price) + '</td>' +
            '<td class="num muted">' + money(p.cost) + '</td>' +
            '<td class="num">' + F.pct(margin(p), 1) + '</td>' +
            '<td class="num"><span class="ps-stock ' + status(p) + '">' + p.stock + '</span><span class="muted"> / ' + p.reorderAt + '</span></td>' +
            '<td>' + statusBadge(p) + '</td>' +
            '<td class="center ps-online-cell"><label class="toggle" title="' + (p.online ? 'Sold online. Turn off to take it off the online shop' : 'Not sold online. Turn on to list it in the online shop') + '"><input type="checkbox" data-online="' + p.id + '"' + (p.online ? ' checked' : '') + ' aria-label="Sell ' + esc(p.name) + ' online"><span></span></label></td>' +
            '<td class="right nowrap ps-row-actions">' +
            '<button type="button" class="btn btn-icon btn-sm" data-receive="' + p.id + '" title="Receive stock for ' + esc(p.name) + '" aria-label="Receive stock for ' + esc(p.name) + '">' + Club.icon('box') + '</button>' +
            '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit-btn="' + p.id + '" title="Edit ' + esc(p.name) + '" aria-label="Edit ' + esc(p.name) + '">' + Club.icon('edit') + '</button>' +
            '<button type="button" class="btn btn-ghost btn-icon btn-sm ps-del" data-delete="' + p.id + '" title="Delete ' + esc(p.name) + '" aria-label="Delete ' + esc(p.name) + '">' + Club.icon('trash') + '</button>' +
            '</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="7">' + all.length + (all.length === 1 ? ' product' : ' products') + (all.length > list.length ? ' in all' : '') + '</td><td class="num">' + F.num(all.reduce(function (a, p) { return a + Math.max(0, p.stock); }, 0)) + '</td><td></td><td class="center muted">' + all.filter(function (p) { return p.online; }).length + ' online</td><td></td></tr></tfoot></table></div>' + pager('inv', state.invPage, all.length);
      if (state.highlight) {
        const row = host.querySelector('tr.selected'); if (row) setTimeout(function () { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 200);
      }
    }
    function drawReorder() {
      const list = products().filter(function (p) { return status(p) !== 'ok'; }).sort(function (a, b) { return a.stock / Math.max(1, a.reorderAt) - b.stock / Math.max(1, b.reorderAt); });
      const host = U.$('.ps-reorder', panel);
      let est = 0;
      list.forEach(function (p) { est += Math.max(1, p.reorderAt * 2 - p.stock) * p.cost; });
      const sum = U.$('[data-acc="ps-acc-reorder"] .pk-acc-sum', panel);
      if (sum) sum.textContent = list.length ? list.length + (list.length === 1 ? ' item' : ' items') + ' to reorder · about ' + F.money0(est) : 'Every product is above its reorder level';
      if (!list.length) { host.innerHTML = U.empty({ icon: 'check', title: 'Fully stocked', text: 'Every product is above its reorder level.' }); return; }
      const SHOW = 6; const shown = state.reorderAll ? list : list.slice(0, SHOW);
      host.innerHTML = '<ul class="list ps-reorder-list">' + shown.map(function (p) {
        const sug = Math.max(1, p.reorderAt * 2 - p.stock);
        return '<li><div class="ps-reorder-main"><div class="person-name">' + esc(p.name) + '</div><div class="person-sub">' + esc(p.brand) + ' · ' + esc(p.sku) + ' · ' + (p.stock <= 0 ? 'None on hand' : p.stock + ' on hand') + ', reorder at ' + p.reorderAt + '</div></div>' +
          '<div class="ps-reorder-sug"><span class="muted">Order</span><span class="num">' + sug + '</span></div>' +
          '<button type="button" class="btn btn-sm" data-receive="' + p.id + '">' + Club.icon('box') + '<span>Receive</span></button></li>';
      }).join('') + '</ul>' + (list.length > SHOW ? '<div class="ps-reorder-more"><button type="button" class="s-link" data-action="reorder-all">' + (state.reorderAll ? 'Show fewer' : 'View all (' + list.length + ')') + '</button></div>' : '') +
        '<div class="ps-reorder-foot"><span>Estimated order cost</span><span class="num">' + money(est) + '</span></div>';
    }
    function drawByCat() {
      const tot = products().reduce(function (a, p) { return a + Math.max(0, p.stock) * p.price; }, 0);
      const sum = U.$('[data-acc="ps-acc-bycat"] .pk-acc-sum', panel); if (sum) sum.textContent = F.money0(tot) + ' retail value on hand across ' + CATS.length + ' categories';
      U.$('.ps-bycat', panel).innerHTML = Club.charts.hbars(CATS.map(function (c, i) {
        return { label: c, value: Math.round(products().filter(function (p) { return p.category === c; }).reduce(function (a, p) { return a + Math.max(0, p.stock) * p.price; }, 0)), brass: i % 2 === 1 };
      }).sort(function (a, b) { return b.value - a.value; }), { money: true });
    }
    function redraw() { drawStats(false); drawTable(); drawReorder(); drawByCat(); U.animateIn(panel); }

    U.on(panel, 'click', '[data-action=add-product]', function () { productModal(null, redraw); });
    U.on(panel, 'click', '[data-receive]', function (e, b) { e.stopPropagation(); const p = product(b.dataset.receive); if (p) receiveModal(p, redraw); });
    U.on(panel, 'click', '[data-delete]', function (e, b) { e.stopPropagation(); const p = product(b.dataset.delete); if (p) deleteProduct(p, redraw); });
    U.on(panel, 'click', '[data-edit-btn]', function (e, b) { e.stopPropagation(); const p = product(b.dataset.editBtn); if (p) productModal(p, redraw); });
    U.on(panel, 'click', 'tr[data-edit]', function (e, tr) { if (e.target.closest('button, .toggle')) return; const p = product(tr.dataset.edit); if (p) productModal(p, redraw); });
    U.on(panel, 'change', 'input[data-online]', function (e, inp) {
      const p = product(inp.dataset.online); if (!p) return;
      Club.undo.run(function () { S.update('products', p.id, { online: inp.checked }); }, {
        message: inp.checked ? p.name + ' is now sold online' + (p.stock > 0 ? '' : ' (shown as sold out until restocked)') : p.name + ' is no longer sold online',
        after: function () { if (document.body.contains(panel)) drawTable(); }, undone: inp.checked ? p.name + ' is off the online shop again' : p.name + ' is sold online again' });
      inp.closest('.toggle').title = inp.checked ? 'Sold online. Turn off to take it off the online shop' : 'Not sold online. Turn on to list it in the online shop';
      const f = U.$('.ps-inv tfoot .center', panel); if (f) f.textContent = filtered().filter(function (x) { return x.online; }).length + ' online';
      if (state.invStatus === 'online' && !inp.checked) drawTable();
    });
    U.on(panel, 'click', '.segmented button', function (e, b) { state.invStatus = b.dataset.value; U.$$('.segmented button', panel).forEach(function (x) { x.classList.toggle('active', x === b); }); state.highlight = null; state.invPage = 1; drawTable(); });
    U.$('select[name=invcat]', panel).addEventListener('change', function (e) { state.invCat = e.target.value; state.highlight = null; state.invPage = 1; drawTable(); });
    U.$('input[name=invq]', panel).addEventListener('input', function (e) { state.invQ = e.target.value; state.highlight = null; state.invPage = 1; drawTable(); });
    U.on(panel, 'click', '[data-page-key=inv]', function (e, b) { if (b.disabled) return; state.invPage = +b.dataset.page; state.highlight = null; drawTable(); const t = U.$('.ps-inv-panel', panel); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); });
    U.on(panel, 'accordion', '[data-acc^="ps-acc-"]', function (e, a) { if (a.dataset.acc === 'ps-acc-reorder') state.accReorder = e.detail.open; else state.accBycat = e.detail.open; });
    U.on(panel, 'click', '[data-action=reorder-all]', function () { state.reorderAll = !state.reorderAll; drawReorder(); });

    drawStats(true); drawTable(); drawReorder(); drawByCat();
  }

  /* ------------------------------------------------------------------
     Sales
     ------------------------------------------------------------------ */
  function renderSales(panel) {
    if (!state.salesFrom) { state.salesFrom = Club.date.fromToday(-29); state.salesTo = Club.date.today(); }
    panel.innerHTML = '<div class="panel ps-sales-filter" data-reveal><div class="ps-sales-tools">' +
      '<div class="field"><label for="ps-from">From</label><input class="input" id="ps-from" type="date" name="from" value="' + state.salesFrom + '"></div>' +
      '<div class="field"><label for="ps-to">To</label><input class="input" id="ps-to" type="date" name="to" value="' + state.salesTo + '"></div>' +
      '<div class="field"><label for="ps-tender-f">Tender</label><select class="select" id="ps-tender-f" name="tender">' + U.options(['All'].concat(TENDERS, ['Gift card']).map(function (t) { return { value: t, label: t === 'All' ? 'All tenders' : t }; }), state.salesTender) + '</select></div>' +
      '<div class="ps-ranges">' + [['Today', 0], ['7 days', 6], ['30 days', 29], ['45 days', 44]].map(function (r) { return '<button type="button" class="btn btn-ghost btn-sm" data-range="' + r[1] + '">' + r[0] + '</button>'; }).join('') + '</div>' +
      '</div></div>' +
      '<div class="ps-sales-stats"></div>' +
      Portal.accordion({ id: 'ps-acc-daily', icon: 'reports', title: 'Daily sales, last 30 days', summary: ' ', open: !!state.accDaily, body: '<div class="ps-daily"></div>' }) +
      '<div class="grid ps-sales-lower">' +
      '<div class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Selected period</div><h3>Sales history</h3></div><span class="ps-hist-count muted"></span></div><div class="panel-body flush ps-history"></div></div>' +
      '<div class="ps-sales-side">' +
      '<div class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Selected period</div><h3>By tender</h3></div></div><div class="panel-body ps-tender-split"></div></div>' +
      '<div class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">By revenue</div><h3>Top sellers</h3></div></div><div class="panel-body ps-top"></div></div>' +
      '</div></div>';

    /* How a sale was paid, for the filter and the split: a sale paid wholly by gift card is 'Gift card'. */
    function tenderOf(s) { return s.payment === 'Gift card' || (s.giftAmount > 0 && Math.abs(r2(s.giftAmount) - r2(s.total)) < 0.005) ? 'Gift card' : s.payment; }
    function tenderOk(s) { return state.salesTender === 'All' || tenderOf(s) === state.salesTender; }
    function inRange() {
      const from = state.salesFrom <= state.salesTo ? state.salesFrom : state.salesTo, to = state.salesFrom <= state.salesTo ? state.salesTo : state.salesFrom;
      return S.all('sales').filter(function (s) { return s.date >= from && s.date <= to && tenderOk(s); })
        .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time) || (b.number || 0) - (a.number || 0); });
    }
    function draw(animate) {
      const list = inRange();
      /* Refunds (negative sales, including an undone sale) reduce revenue but are not sales of their own. */
      const count = list.filter(function (s) { return s.total > 0 && !s.refundOf; }).length;
      const revenue = list.reduce(function (a, s) { return a + s.total; }, 0);
      const net = list.reduce(function (a, s) { return a + s.subtotal; }, 0);
      const units = list.reduce(function (a, s) { return a + s.items.reduce(function (b, it) { return b + it.qty; }, 0); }, 0);
      const statsItems = [
        { label: 'Sales', value: count, meta: F.num(units) + ' units' },
        { label: 'Revenue', value: Math.round(revenue), prefix: '$', meta: 'Net of tax ' + F.money0(net) },
        { label: 'Average ticket', value: count ? Math.round(revenue / count) : 0, prefix: '$' },
        { label: 'Gross margin', value: grossMargin(list), suffix: '%', decimals: 1 }
      ];
      if (!animate) statsItems.forEach(function (i) { i.value = (i.prefix || '') + (i.decimals ? i.value.toFixed(i.decimals) : F.num(i.value)); i.prefix = ''; });
      const st = U.$('.ps-sales-stats', panel); st.innerHTML = U.stats(statsItems);
      if (!animate) U.$$('[data-reveal]', st).forEach(function (n) { n.classList.add('revealed'); });

      // daily chart: always the last 30 days, respects tender filter
      const labels = [], vals = []; let tot30 = 0;
      for (let d = -29; d <= 0; d++) {
        const iso = Club.date.fromToday(d);
        const v = S.all('sales').filter(function (s) { return s.date === iso && tenderOk(s); }).reduce(function (a, s) { return a + s.total; }, 0);
        labels.push(F.dateShort(iso)); vals.push(Math.round(v)); tot30 += v;
      }
      U.$('.ps-daily', panel).innerHTML = Club.charts.bar({ labels: labels, series: [{ name: state.salesTender === 'All' ? 'Sales' : state.salesTender, values: vals }], height: 180, money: true });
      const dsum = U.$('[data-acc="ps-acc-daily"] .pk-acc-sum', panel); if (dsum) dsum.textContent = F.money0(tot30) + ' over 30 days' + (state.salesTender === 'All' ? '' : ', ' + state.salesTender.toLowerCase());

      // tender split
      /* Gift card money is its own tender; a sale paid partly by gift card splits between the card and the rest. */
      const giftPart = function (s) { return Math.min(Math.abs(+s.giftAmount || 0), Math.abs(s.total)) * (s.total < 0 ? -1 : 1); };
      const byT = TENDERS.concat(['Gift card']).map(function (t, i) {
        const amt = function (s) { const g = giftPart(s); return t === 'Gift card' ? g : (s.payment === t ? s.total - g : 0); };
        const ls = list.filter(function (s) { return Math.abs(amt(s)) > 0.004; });
        return { label: t, value: Math.round(ls.reduce(function (a, s) { return a + amt(s); }, 0)), count: ls.filter(function (s) { return s.total > 0 && !s.refundOf; }).length, color: ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'][i] };
      });
      const tsHost = U.$('.ps-tender-split', panel);
      if (!list.length) tsHost.innerHTML = U.empty({ icon: 'billing', title: 'No sales', text: 'No sales were recorded in this period.' });
      else tsHost.innerHTML = Club.charts.donut({ items: byT.filter(function (x) { return x.value > 0; }), size: 132, money: true, center: { value: revenue >= 10000 ? '$' + (revenue / 1000).toFixed(1) + 'k' : F.money0(revenue), label: 'Revenue' } }) +
        '<table class="table ps-tender-table"><tbody>' + byT.map(function (x) { return '<tr><td><span class="ps-swatch" style="background:' + x.color + '"></span>' + esc(x.label) + '</td><td class="num muted">' + x.count + '</td><td class="num">' + money(x.value) + '</td></tr>'; }).join('') + '</tbody></table>';

      // top sellers
      const agg = {};
      list.forEach(function (s) { s.items.forEach(function (it) { const k = it.productId || it.name; agg[k] = agg[k] || { name: it.name, qty: 0, rev: 0 }; agg[k].qty += it.qty; agg[k].rev += it.qty * it.price; }); });
      const topAll = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 8);
      const top = state.topAll ? topAll : topAll.slice(0, 5);
      U.$('.ps-top', panel).innerHTML = top.length ? '<ol class="ps-top-list">' + top.map(function (t, i) {
        return '<li><span class="ps-rank num">' + (i + 1) + '</span><div class="ps-top-main"><div class="row between"><span class="ps-top-name">' + esc(t.name) + '</span><span class="num">' + F.money0(t.rev) + '</span></div><div class="bar' + (i ? '' : ' brass') + '"><span style="width:' + Math.max(3, t.rev / top[0].rev * 100) + '%"></span></div><div class="person-sub">' + t.qty + (t.qty === 1 ? ' unit' : ' units') + '</div></div></li>';
      }).join('') + '</ol>' + (topAll.length > 5 ? '<button type="button" class="s-link ps-top-more" data-action="top-all">' + (state.topAll ? 'Show top 5' : 'View top ' + topAll.length) + '</button>' : '') : U.empty({ icon: 'trophy', title: 'No sellers yet', text: 'Top products appear once sales are recorded.' });

      drawHistory(list);
      U.animateIn(panel);
    }
    function grossMargin(list) {
      let rev = 0, cost = 0;
      list.forEach(function (s) { s.items.forEach(function (it) { const p = product(it.productId); rev += it.qty * it.price; cost += it.qty * (p ? p.cost : it.price * 0.55); }); });
      return rev ? Math.round((rev - cost) / rev * 1000) / 10 : 0;
    }
    function drawHistory(list) {
      const host = U.$('.ps-history', panel);
      U.$('.ps-hist-count', panel).textContent = list.length + (list.length === 1 ? ' sale' : ' sales');
      if (!list.length) { host.innerHTML = U.empty({ icon: 'calendar', title: 'No sales in this period', text: 'Widen the date range or choose a different tender.' }); return; }
      setPer(10);
      state.salesPage = Math.max(1, Math.min(pageCount(list.length), state.salesPage));
      const shown = list.slice((state.salesPage - 1) * PER, state.salesPage * PER);
      host.innerHTML = '<div class="table-wrap"><table class="table ps-hist"><thead><tr><th>Date</th><th>Sale</th><th>Items</th><th>Tender</th><th class="num">Total</th></tr></thead><tbody>' +
        shown.map(function (s) {
          const units = s.items.reduce(function (a, it) { return a + it.qty; }, 0);
          return '<tr class="clickable" data-sale="' + esc(s.id) + '"><td class="nowrap"><div class="primary-cell">' + esc(F.dateShort(s.date)) + '</div><div class="person-sub">' + esc(F.time(s.time)) + '</div></td>' +
            '<td class="nowrap num muted">' + (s.channel === 'online' ? '<span class="ps-online-tag">' + (s.total < 0 ? 'Refund ' : 'Online ') + esc(s.orderNo || '') + '</span>' : 'No. ' + esc(s.number || '')) + '</td>' +
            '<td><div class="ps-hist-items">' + esc(s.items.map(function (it) { return (it.qty > 1 ? it.qty + ' x ' : '') + it.name; }).join(', ')) + '</div><div class="person-sub">' + units + (units === 1 ? ' unit' : ' units') + '</div></td>' +
            '<td class="nowrap">' + esc(s.payment) + (s.memberId ? '<div class="person-sub">' + esc(memberLabel(s.memberId)) + '</div>' : s.publicPlayerId ? '<div class="person-sub">' + esc(publicName(s.publicPlayerId)) + ' · public</div>' : '') + '</td>' +
            '<td class="num nowrap">' + money(s.total) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        pager('sales', state.salesPage, list.length);
    }

    U.on(panel, 'change', 'input[type=date], select[name=tender]', function () {
      const f = U.$('[name=from]', panel).value, t = U.$('[name=to]', panel).value;
      if (f) state.salesFrom = f; if (t) state.salesTo = t;
      state.salesTender = U.$('[name=tender]', panel).value; state.salesPage = 1; draw(false);
    });
    U.on(panel, 'click', '[data-range]', function (e, b) {
      state.salesTo = Club.date.today(); state.salesFrom = Club.date.fromToday(-(+b.dataset.range)); state.salesPage = 1;
      U.$('[name=from]', panel).value = state.salesFrom; U.$('[name=to]', panel).value = state.salesTo; draw(false);
    });
    U.on(panel, 'click', '[data-action=top-all]', function () { state.topAll = !state.topAll; draw(false); });
    U.on(panel, 'accordion', '[data-acc="ps-acc-daily"]', function (e) { state.accDaily = e.detail.open; });
    U.on(panel, 'click', '[data-page-key=sales]', function (e, b) { if (b.disabled) return; state.salesPage = +b.dataset.page; drawHistory(inRange()); const t = U.$('.ps-history', panel); if (t && t.getBoundingClientRect().top < 0) t.closest('.panel').scrollIntoView({ block: 'start' }); });
    U.on(panel, 'click', '[data-sale]', function (e, tr) {
      const s = S.find('sales', tr.dataset.sale); if (!s) return;
      if (s.channel === 'online' && Club.shop) {
        const o = Club.shop.get(s.orderId), rc = o ? (s.total < 0 ? Club.shop.refundReceiptOf(o) : Club.shop.receiptOf(o)) : null;
        if (rc) { Club.receipts.open(rc); return; }
      }
      showReceipt(s);
    });

    draw(true);
  }

  /* ------------------------------------------------------------------
     Online orders (Club.shop, js/core/shop.js): prepare, hand over, cancel and refund
     ------------------------------------------------------------------ */
  const ON_TABS = [['new', 'New'], ['ready', 'Ready'], ['picked-up', 'Picked up'], ['cancelled', 'Cancelled']];
  let onlineOff = null;
  function staffName() { return Club.user ? Club.user.firstName + ' ' + Club.user.lastName : 'Golf shop'; }
  function staffId() { return Club.user && Club.user.id ? Club.user.id : null; }
  function newOnline() { return Club.shop ? S.all('shopOrders').filter(function (o) { return o.status === 'new'; }).length : 0; }
  function ago(iso) {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    if (m < 24 * 60) return Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago';
    return F.dateShort(S.iso(new Date(iso))) + ', ' + F.time(new Date(iso));
  }
  function refundText(o) {
    const p = o.pay || {}, counter = p.method === 'pickup';
    return [p.giftAmount > 0 ? money(p.giftAmount) + ' back on gift card ending ' + (p.giftLast4 || '') : '',
      p.accountAmount > 0 ? money(p.accountAmount) + ' credited to the member account' : '',
      p.cardAmount > 0 ? money(p.cardAmount) + ' refunded to ' + (counter ? 'the card on the terminal' : Club.receipts.cardLabel(p.brand, p.last4)) : '',
      p.cashAmount > 0 ? money(p.cashAmount) + ' cash to give back' : ''].filter(Boolean).join(', ');
  }
  function staffPay(p) {
    if (p.method === 'pickup' && !p.paidAt) return 'To pay at pickup';
    const counter = p.method === 'pickup';
    const both = p.giftAmount > 0 && (p.accountAmount > 0 || p.cardAmount > 0 || p.cashAmount > 0);
    return [p.giftAmount > 0 ? 'Gift card ending ' + (p.giftLast4 || '') + (both ? ' ' + money(p.giftAmount) : '') : '',
      p.accountAmount > 0 ? 'Member account' + (both ? ' ' + money(p.accountAmount) : '') : '',
      p.cardAmount > 0 ? (counter ? 'Card' : Club.receipts.cardLabel(p.brand, p.last4) + ' online') + (both ? ' ' + money(p.cardAmount) : '') : '',
      p.cashAmount > 0 ? 'Cash' + (both ? ' ' + money(p.cashAmount) : '') : ''].filter(Boolean).join(' + ') + (counter ? ' at pickup' : '') || 'Nothing to pay';
  }
  /** The buttons an order offers, on its card and in its drawer: the next step, the step back, receipts and cancel. */
  function onlineActsHTML(o) {
    const SH = Club.shop, rc = SH.receiptOf(o), rf = SH.refundReceiptOf(o), id = esc(o.id);
    const owe = SH.unpaid(o) && (o.status === 'new' || o.status === 'ready');
    const payBtn = function (primary) { return '<button type="button" class="btn ' + (primary ? 'btn-primary ps-oc-go' : 'btn-sm') + ' ps-oc-pay-btn" data-oc="pay" data-id="' + id + '">' + Club.icon('card') + '<span>Take payment' + (primary ? ' · ' + money(o.total) : '') + '</span></button>'; };
    const acts = o.status === 'new'
      ? '<button type="button" class="btn btn-primary ps-oc-go" data-oc="ready" data-id="' + id + '">' + Club.icon('check') + '<span>Mark ready</span></button>' + (owe ? payBtn(false) : '') + '<button type="button" class="btn btn-sm" data-oc="picked-up" data-id="' + id + '">Picked up</button>'
      : o.status === 'ready' ? (owe ? payBtn(true) + '<button type="button" class="btn btn-sm" data-oc="picked-up" data-id="' + id + '">Picked up</button>'
        : '<button type="button" class="btn btn-primary ps-oc-go" data-oc="picked-up" data-id="' + id + '">' + Club.icon('check') + '<span>Picked up</span></button>') + '<button type="button" class="btn btn-ghost btn-sm" data-oc="new" data-id="' + id + '">Back to new</button>'
      : o.status === 'picked-up' ? '<button type="button" class="btn btn-ghost btn-sm" data-oc="ready" data-id="' + id + '">Back to ready</button>' : '';
    return acts +
      (rc ? '<button type="button" class="btn btn-ghost btn-sm" data-oc-rc="' + esc(rc.id) + '">' + Club.icon('billing') + '<span>Receipt</span></button>' : '') +
      (rf ? '<button type="button" class="btn btn-ghost btn-sm" data-oc-rc="' + esc(rf.id) + '">Refund receipt</button>' : '') +
      (o.status === 'new' || o.status === 'ready' ? '<button type="button" class="btn btn-ghost btn-sm ps-oc-cancel" data-oc="cancel" data-id="' + id + '">' + (SH.unpaid(o) ? 'Cancel order' : 'Cancel and refund') + '</button>' : '');
  }
  function onlineCardHTML(o) {
    const c = o.customer || {}, p = o.pay || {}, SH = Club.shop;
    const who = c.memberId ? '<a href="#/members/' + esc(c.memberId) + '">' + esc(c.name) + '</a> <span class="ps-oc-kind">Member</span>'
      : esc(c.name) + ' <span class="ps-oc-kind">' + (c.publicPlayerId ? 'Public golfer' : 'Guest') + '</span>';
    /* The whole card opens the order on a click; for the keyboard and screen readers the order number is the button
       (a card that is itself a button cannot hold the action buttons and links inside it). */
    return '<article class="ps-oc is-' + esc(o.status) + '" data-order="' + esc(o.id) + '">' +
      '<header class="ps-oc-head"><button type="button" class="ps-oc-no" data-oc-open aria-label="' + esc('Order ' + o.no + ', ' + (c.name || '') + ', ' + SH.statusLabel(o) + '. Open details') + '"><span class="num">' + esc(o.no) + '</span><span class="ps-oc-ago">' + esc(ago(o.at)) + '</span></button>' +
        '<div class="ps-oc-who"><div class="ps-oc-name">' + who + '</div>' + U.badge(SH.statusLabel(o), SH.BADGE[o.status]) + '</div></header>' +
      '<div class="ps-oc-contact">' + (c.phone ? '<a href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + Club.icon('phone') + '<span>' + esc(c.phone) + '</span></a>' : '') +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + Club.icon('mail') + '<span>' + esc(c.email) + '</span></a>' : '') + '</div>' +
      '<ul class="ps-oc-items">' + o.items.map(function (l) {
        const pr = product(l.productId);
        return '<li><span class="ps-oc-qty num">' + l.qty + '</span><span class="ps-oc-iname">' + esc(l.name) + '<span class="person-sub">' + esc([l.brand, l.sku || (pr && pr.sku)].filter(Boolean).join(' · ')) + '</span></span><span class="num muted">' + money(l.qty * l.price) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="ps-oc-pay"><span><strong class="num">' + money(o.total) + '</strong> <span class="muted">tax included</span>' + (o.promo ? ' · ' + esc('Promo ' + o.promo.code + ' −' + money(o.promo.discount)) : '') + '</span>' +
        (SH.unpaid(o) && o.status !== 'cancelled' ? U.badge('To pay at pickup', 'warn') : '<span class="muted">' + esc(staffPay(p)) + '</span>') + '</div>' +
      (o.status === 'picked-up' ? '<p class="ps-oc-note">' + Club.icon('check') + '<span>Picked up ' + esc(ago(o.pickedUpAt)) + (o.pickedUpBy ? ', handed over by ' + esc(o.pickedUpBy) : '') + '.</span></p>' : '') +
      (o.status === 'ready' && o.readyAt ? '<p class="ps-oc-note">' + Club.icon('clock') + '<span>Ready ' + esc(ago(o.readyAt)) + '. The customer sees Ready for pickup.</span></p>' : '') +
      (o.status === 'cancelled' ? '<p class="ps-oc-cancelled">Cancelled ' + (o.cancelledBy === 'customer' ? 'online by the customer' : 'by ' + esc(o.cancelledBy || 'staff')) + (o.cancelReason ? ': ' + esc(o.cancelReason) : '.') + (o.refund && !(o.refund.amount > 0) && p.method === 'pickup' ? ' Nothing was charged, stock put back.' : ' Refunded ' + money(o.refund ? o.refund.amount : o.total) + ', stock put back.') + '</p>' : '') +
      '<div class="ps-oc-acts">' + onlineActsHTML(o) + '</div></article>';
  }
  /** The order details drawer: customer, contact, items, totals and payment, the timeline from the order's log, and the actions. */
  function when(iso) { const d = new Date(iso); return (S.iso(d) === Club.date.today() ? 'Today' : F.dateShort(S.iso(d))) + ', ' + F.time(d); }
  function onlineDrawerHTML(o) {
    const c = o.customer || {}, p = o.pay || {}, SH = Club.shop;
    const who = c.memberId ? '<a href="#/members/' + esc(c.memberId) + '">' + esc(c.name) + '</a>' : esc(c.name);
    const kind = c.memberId ? 'Member' : c.publicPlayerId ? 'Public golfer' : 'Guest';
    return '<div class="od">' +
      '<div class="od-top">' + U.badge(SH.statusLabel(o), SH.BADGE[o.status]) + '<span class="od-when">Placed ' + esc(when(o.at).replace(/^Today/, 'today')) + ' on the ' + (o.site === 'portal' ? 'members’ portal' : 'public site') + '</span></div>' +
      '<section class="od-sec"><h4 class="od-h">Customer</h4><dl class="kv od-kv"><dt>Name</dt><dd>' + who + ' <span class="od-kind">' + kind + '</span></dd>' +
        (c.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a></dd>' : '') +
        (c.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></dd>' : '') + '</dl></section>' +
      '<section class="od-sec"><h4 class="od-h">Items</h4><ul class="od-items">' + o.items.map(function (l) {
        const pr = product(l.productId);
        return '<li><span class="od-qty num">' + l.qty + '</span><span class="od-iname">' + esc(l.name) + '<span class="od-sub">' + esc([l.brand, l.sku || (pr && pr.sku), money(l.price) + ' each'].filter(Boolean).join(' · ')) + '</span></span><span class="num">' + money(l.qty * l.price) + '</span></li>';
      }).join('') + '</ul>' +
        '<dl class="od-tot"><dt>Subtotal</dt><dd class="num">' + money(o.subtotal) + '</dd><dt>Tax (' + esc(taxLabel()) + ')</dt><dd class="num">' + money(o.tax) + '</dd>' +
        (o.promo ? '<dt>Promo code ' + esc(o.promo.code) + '</dt><dd class="num od-off">−' + money(o.promo.discount) + '</dd>' : '') +
        '<dt class="od-grand">Total</dt><dd class="od-grand num">' + money(o.total) + '</dd>' +
        (SH.unpaid(o) && o.status !== 'cancelled' ? '<dt>Payment</dt><dd>' + U.badge('To pay at pickup', 'warn') + '</dd>' : '<dt>Paid with</dt><dd>' + esc(staffPay(p)) + '</dd>') +
        (p.discount && p.discount.amount > 0 ? '<dt>Discount at pickup</dt><dd class="num od-off">−' + money(p.discount.amount) + ' <span class="muted">' + esc(p.discount.reason) + '</span></dd>' : '') +
        (o.refund ? '<dt>Refunded</dt><dd>' + esc(refundText(o) || money(o.refund.amount)) + '</dd>' : '') + '</dl></section>' +
      '<section class="od-sec"><h4 class="od-h">Timeline</h4><ol class="od-tl">' + (o.log || []).map(function (e) {
        return '<li><span class="od-tl-t">' + esc(e.text) + '</span><span class="od-tl-at">' + esc(when(e.at)) + '</span></li>';
      }).join('') + '</ol></section>' +
      '<div class="od-acts ps-oc-acts">' + onlineActsHTML(o) + '</div></div>';
  }
  function renderOnline(panel) {
    if (onlineOff) { onlineOff(); onlineOff = null; }
    if (!Club.shop) { panel.innerHTML = '<div class="panel">' + U.empty({ icon: 'shop', title: 'The online shop is not available', text: 'Reload the page to try again.' }) + '</div>'; return; }
    state.onStatus = state.onStatus || 'new';
    const onCount = products().filter(function (p) { return p.online; }).length;
    panel.innerHTML = '<div class="ps-on-top"><div class="ps-on-tabs" role="tablist" aria-label="Order status"></div>' +
      '<label class="ps-search sm ps-on-search">' + Club.icon('search') + '<input class="input" type="search" name="onq" placeholder="Order number or name" value="' + esc(state.onQ || '') + '" aria-label="Find an online order"></label></div>' +
      '<p class="ps-on-info">' + Club.icon('info') + '<span>Online orders are paid when placed, or here at pickup when the customer chose Pay at pickup, and picked up here. Stock comes off when the order is placed and goes back if you cancel. ' + onCount + ' products are sold online (Inventory, Sell online). Select an order for its details.</span></p>' +
      '<div class="ps-on-list" aria-live="polite"></div>';
    function draw() {
      if (!document.body.contains(panel)) return;
      const all = S.all('shopOrders'), q = String(state.onQ || '').trim().toLowerCase();
      U.$('.ps-on-tabs', panel).innerHTML = ON_TABS.map(function (t) {
        const n = all.filter(function (o) { return o.status === t[0]; }).length;
        return '<button type="button" role="tab" class="ps-on-tab' + (t[0] === state.onStatus ? ' active' : '') + '" aria-selected="' + (t[0] === state.onStatus) + '" data-on-status="' + t[0] + '">' + esc(t[1]) + '<span class="ps-on-n">' + n + '</span></button>';
      }).join('');
      let list = all.filter(function (o) { return o.status === state.onStatus; });
      if (q) list = all.filter(function (o) { return (o.no + ' ' + (o.customer || {}).name + ' ' + (o.customer || {}).phone + ' ' + (o.customer || {}).email).toLowerCase().indexOf(q) >= 0; });
      list.sort(function (a, b) {
        if (!q && (state.onStatus === 'new' || state.onStatus === 'ready')) return String(a.at).localeCompare(String(b.at));
        return String(b.pickedUpAt || b.cancelledAt || b.at).localeCompare(String(a.pickedUpAt || a.cancelledAt || a.at));
      });
      const shown = list.slice(0, 30);
      U.$('.ps-on-list', panel).innerHTML = shown.length ? '<div class="ps-oc-grid">' + shown.map(onlineCardHTML).join('') + '</div>' + (list.length > shown.length ? '<p class="muted center">Showing the latest 30 of ' + list.length + '. Search by order number or name to find an older one.</p>' : '')
        : '<div class="panel">' + U.empty({ icon: q ? 'search' : 'shop', title: q ? 'No orders match' : state.onStatus === 'new' ? 'No new online orders' : 'Nothing here', text: q ? 'Try the order number (W-0012) or the customer’s name.' : state.onStatus === 'new' ? 'Orders from the public site and the members’ portal appear here as they come in.' : 'Orders move here as you work through them.' }) + '</div>';
      paintTabCount();
    }
    function both() { draw(); refreshDrawer(); }
    /* One handler for the card and the drawer. A step (or a step back) offers Undo on its toast. */
    function act(b) {
      const o = Club.shop.get(b.dataset.id); if (!o) return;
      const to = b.dataset.oc, from = o.status;
      if (to === 'cancel') { cancelModal(o, both); return; }
      if (to === 'pay') { takePay(o, false); return; }
      /* An order to pay at pickup is paid before it is handed over. */
      if (to === 'picked-up' && Club.shop.unpaid(o)) {
        U.modal({ eyebrow: o.no + ' · ' + o.customer.name, title: 'Take payment first', body: '<p class="ink-2">This order has not been paid. ' + esc(money(o.total)) + ' is due at pickup. Take the payment, and the order is marked picked up.</p>',
          actions: [{ label: 'Not now', kind: 'ghost' }, { label: 'Take payment', kind: 'primary', icon: 'card', onClick: function () { setTimeout(function () { takePay(Club.shop.get(o.id), true); }, 0); } }] });
        return;
      }
      const rec = Club.undo.track(function () { return Club.shop.setStatus(o.id, to, staffName()); });
      if (!rec.result || rec.result.status !== to) { U.toast('This order has changed. The list has been refreshed', 'bad'); both(); return; }
      const msg = to === 'ready' ? (from === 'picked-up' ? o.no + ' is back to ready' : o.no + ' is ready for pickup') : to === 'picked-up' ? o.no + ' picked up' : o.no + ' moved back to new';
      Club.undo.offer(msg, rec, { after: both, undone: o.no + ' is back to ' + ({ new: 'new', ready: 'ready', 'picked-up': 'picked up' }[from] || from) });
      const card = b.closest('.ps-oc'); if (card) { card.classList.add('ps-oc-leaving'); setTimeout(both, 160); } else both();
    }
    /* Pay at pickup: the tee sheet's till (card, cash, gift card, discount) takes the order total; then picked up, when asked. */
    function takePay(o, thenPickup) {
      if (!o || !Club.shop.unpaid(o)) { U.toast('This order is already paid', 'bad'); both(); return; }
      const T = Club.teeSheet && Club.teeSheet.takePayment;
      if (!T) { U.toast('The golf shop till could not open. Reload the page and try again.', 'bad'); return; }
      const c = o.customer || {};
      const lines = o.items.map(function (l) { return { name: l.name, qty: l.qty, price: l.price }; })
        .concat([{ name: 'Tax (' + taxLabel() + ')', qty: 1, price: o.tax }], o.promo ? [{ name: 'Promo code ' + o.promo.code, qty: 1, price: -o.promo.discount }] : []);
      T({ eyebrow: 'Online order ' + o.no, name: c.name || 'Customer', kind: (c.memberId ? 'Member' : c.publicPlayerId ? 'Public golfer' : 'Guest') + ', paying at pickup', lines: lines,
        onDone: function (pay) {
          const rec = Club.undo.track(function () {
            const r = Club.shop.payAtPickup(o.id, pay, { staffName: staffName(), staffId: staffId() });
            if (r.ok && thenPickup) Club.shop.setStatus(o.id, 'picked-up', staffName());
            return r;
          }), res = rec.result;
          if (!res.ok) { U.toast(res.msg, 'bad'); both(); return; }
          const how = pay.rest > 0 ? (pay.method === 'cash' ? 'cash' : 'card') : 'gift card';
          Club.undo.offer(o.no + ' paid, ' + money(pay.total) + ' by ' + how + (thenPickup ? ', and picked up' : ''), rec, { after: both,
            undone: 'Payment for ' + o.no + ' undone' + (pay.rest > 0 ? (pay.method === 'cash' ? '. Give back the cash' : '. Refund the card on the terminal') : '') });
          both();
        } });
    }
    U.on(panel, 'click', '[data-on-status]', function (e, b) { state.onStatus = b.dataset.onStatus; state.onQ = ''; const i = U.$('[name=onq]', panel); if (i) i.value = ''; draw(); });
    U.$('[name=onq]', panel).addEventListener('input', function (e) { state.onQ = e.target.value; draw(); });
    U.on(panel, 'click', '[data-oc-rc]', function (e, b) { Club.receipts.open(b.dataset.ocRc); });
    U.on(panel, 'click', '[data-oc]', function (e, b) { act(b); });
    /* The whole card opens the drawer; its buttons and links keep doing their own job. */
    U.on(panel, 'click', '.ps-oc', function (e, card) { if (e.target.closest('button:not([data-oc-open]), a, input, label, select')) return; openDrawer(card.dataset.order); });
    let drawer = null;
    function openDrawer(id) {
      const o = Club.shop.get(id); if (!o) return;
      const d = U.drawer({ eyebrow: 'Online order', title: o.no + ' · ' + ((o.customer || {}).name || ''), body: onlineDrawerHTML(o), onClose: function () { if (drawer && drawer.api === d) drawer = null; } });
      if (d.duplicate) return;
      d.el.classList.add('od-drawer');
      drawer = { api: d, id: id };
      U.on(d.el, 'click', '[data-oc]', function (e, b) { act(b); });
      U.on(d.el, 'click', '[data-oc-rc]', function (e, b) { Club.receipts.open(b.dataset.ocRc); });
      U.on(d.el, 'click', 'a[href^="#/"]', function () { d.close(); });
    }
    function refreshDrawer() {
      if (!drawer || !document.body.contains(drawer.api.el)) { drawer = null; return; }
      const o = Club.shop.get(drawer.id); if (!o) { drawer.api.close(); return; }
      drawer.api.body.innerHTML = onlineDrawerHTML(o);
    }
    draw();
    const off1 = S.subscribe('shopOrders', function () { if (!document.body.contains(panel)) return; if (!document.querySelector('.overlay')) draw(); else refreshDrawer(); });
    onlineOff = function () { off1(); };
  }
  /* Cancel and refund. A refund sent to a card has left the club, so that has no Undo (the modal is the confirmation);
     an order paid only by member account or gift card can be put back from the toast. */
  function cancelModal(o, after) {
    const back = refundText(o), card = (o.pay || {}).cardAmount > 0, owe = Club.shop.unpaid(o);
    const paid = (o.pay || {}).paidTotal != null ? o.pay.paidTotal : o.total;
    U.modal({ eyebrow: o.no + ' · ' + o.customer.name, title: owe ? 'Cancel this order?' : 'Cancel and refund this order?',
      body: '<p class="ink-2">The customer sees the order as cancelled with your reason. ' + (owe ? 'Nothing was charged (Pay at pickup).' : esc(money(paid)) + ' goes back the way they paid' + (back ? ': ' + esc(back) : '') + '.') + ' The items go back into stock.' + (card ? ' A card refund cannot be undone.' : '') + '</p>' +
        '<form novalidate onsubmit="return false">' + U.field({ label: 'Reason for the customer', name: 'reason', type: 'textarea', required: true, placeholder: 'For example: this item was damaged and we have no other in stock.' }) + '</form>',
      actions: [{ label: 'Keep order', kind: 'ghost' }, { label: owe ? 'Cancel order' : 'Cancel and refund', kind: 'danger', onClick: function (api) {
        const form = U.$('form', api.body); clearErrors(form);
        const reason = U.formData(form).reason;
        if (!reason || reason.length < 3) { fieldError(form, 'reason', 'Give the customer a short reason.'); return false; }
        const go = function () { return Club.shop.cancel(o.id, { by: 'staff', staffName: staffName(), staffId: staffId(), reason: reason }); };
        const msg = 'Order ' + o.no + ' cancelled. ' + (owe ? 'Nothing was charged, stock put back' : money(paid) + ' refunded and stock put back');
        let res;
        if (card) { res = go(); if (res.ok) U.toast(msg); }
        else { const rec = Club.undo.track(go); res = rec.result; if (res.ok) Club.undo.offer(msg, rec, { after: after, undone: 'Order ' + o.no + ' reinstated. Refund reversed and stock taken off again' }); }
        if (!res.ok) U.toast(res.msg, 'bad');
        if (after) after();
      } }] });
  }
  function paintTabCount() {
    const tab = U.$('.ps-tabs .tab[data-tab="online"]'); if (!tab) return;
    const n = newOnline(); let c = U.$('.ps-tab-n', tab);
    if (!n) { if (c) c.remove(); }
    else { if (!c) { c = document.createElement('span'); c.className = 'ps-tab-n'; tab.appendChild(c); } c.textContent = String(n); c.setAttribute('aria-label', n + ' new'); }
    const a = U.$('.ps-tabs .tab.active'), ink = U.$('.ps-tabs .tab-ink');
    if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = 'translateX(' + a.offsetLeft + 'px)'; }
  }

  /* ------------------------------------------------------------------
     Registration
     ------------------------------------------------------------------ */
  Club.register({
    id: 'proshop', label: 'Pro Shop', icon: 'shop', section: 'Hospitality', order: 20,
    badge: function () { const n = lowCount(); return n || null; },
    search: function (q) {
      const orders = Club.shop ? S.all('shopOrders').filter(function (o) { return (o.no + ' ' + (o.customer || {}).name).toLowerCase().indexOf(q) >= 0; }).slice(0, 3).map(function (o) {
        return { label: o.no + ', ' + o.customer.name, sub: 'Online order · ' + Club.shop.statusLabel(o) + ' · ' + money(o.total), href: 'proshop/online', icon: 'shop' };
      }) : [];
      return orders.concat(products().filter(function (p) { return (p.name + ' ' + p.sku + ' ' + p.brand).toLowerCase().indexOf(q) >= 0; }).slice(0, 4).map(function (p) {
        return { label: p.name, sub: p.sku + ' · ' + p.brand + ' · ' + money(p.price) + ' · ' + (p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'), href: 'proshop/inventory/' + p.id, icon: 'shop' };
      }));
    },
    render: function (view, params) {
      const tabs = [{ id: 'register', label: 'Register', render: renderRegister }, { id: 'online', label: 'Online orders', render: renderOnline }, { id: 'inventory', label: 'Inventory', render: renderInventory }, { id: 'sales', label: 'Sales', render: renderSales },
        { id: 'promotions', label: 'Promotions', render: function (panel) { extTab('promotions', panel); } },
        { id: 'addons', label: 'Add-ons', render: function (panel) { extTab('addons', panel); } }];
      /* Promotions and Add-ons are drawn by js/modules/settings.js (Club.settingsTabs); their cleanup runs when the tab or page changes. */
      let extOff = null;
      function extClean() { if (extOff) { try { extOff(); } catch (e) { console.error(e); } extOff = null; } }
      function extTab(id, panel) { extClean(); const fn = Club.settingsTabs && Club.settingsTabs[id]; extOff = fn ? (fn(panel) || null) : null; }
      if (params[0] && tabs.some(function (t) { return t.id === params[0]; })) state.tab = params[0];
      state.highlight = state.tab === 'inventory' && params[1] ? params[1] : null;
      if (state.highlight) { state.invQ = ''; state.invCat = 'All'; state.invStatus = 'all'; }
      const today = S.where('sales', function (s) { return s.date === Club.date.today(); });
      const todayRev = today.reduce(function (a, s) { return a + s.total; }, 0);
      view.innerHTML = U.pageHeader({
        eyebrow: 'Hospitality · Golf Shop', title: 'Pro Shop',
        subtitle: esc(today.length + (today.length === 1 ? ' sale' : ' sales') + ' today, ' + money(todayRev) + ' taken. ' + (lowCount() ? lowCount() + ' items need restocking.' : 'All items stocked.') + (newOnline() ? ' ' + newOnline() + (newOnline() === 1 ? ' online order' : ' online orders') + ' to prepare.' : '')),
        actions: U.btn('Receive stock', { icon: 'box', action: 'goto-inventory' }) + U.btn('Add product', { kind: 'primary', icon: 'plus', action: 'header-add' })
      }) + '<div class="ps-tabs"></div>';
      const host = U.$('.ps-tabs', view);
      const api = U.tabs(host, tabs, state.tab, function (id) {
        state.tab = id;
        if (id !== 'promotions' && id !== 'addons') extClean();
        if (id !== 'online' && onlineOff) { onlineOff(); onlineOff = null; }
        try { history.replaceState(null, '', '#/proshop/' + id); } catch (e) { /* file:// may refuse */ }
      });
      paintTabCount();
      const offTab = S.subscribe('shopOrders', function () { paintTabCount(); });
      U.on(view, 'click', '[data-action=header-add]', function () { productModal(null, function () { api.activate(state.tab); }); });
      U.on(view, 'click', '[data-action=goto-inventory]', function () { state.invStatus = 'low'; api.activate('inventory'); });
      return function () { offTab(); extClean(); if (onlineOff) { onlineOff(); onlineOff = null; } };
    }
  });
})();
