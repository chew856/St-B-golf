/* Beverage cart: on-course food and drink orders, delivered by the beverage cart.
   Owns: cartMenu, cartOrders (collections) and $cartFleet (the dispatch fleet, one record), $cartDay (daily housekeeping).
   Dispatch rules come from Club.cartDispatch (js/core/cartdispatch.js, the client's logic). Every fleet change is
   read the fleet, call one pure dispatch function, write the fleet; order details live in cartOrders, keyed by the
   dispatch order id. Club.cart is shared by this staff page, the members' portal (js/portal/cart.js) and the public
   site (js/public/cart.js). Members' "Add to my account" orders post to the ledger with Club.chargeMember on delivery.
   A "cart visit" (Call the cart) is a cartOrders doc with kind 'visit' and no items: the golfer picks from what is on
   the cart, and the attendant records what was bought when marking it delivered.
   Group stops: golfers on the same tee time share ONE dispatch entry (merge key 'group:' + teeTimeId through the
   dispatch's own addOrder merge), so the cart stops once and nobody is bumped by their own group. Each golfer keeps
   their own cartOrders doc (own items, bill and payment) attached to the entry by groupId; the entry id is the first
   doc's id. The newest order's hole, an "I've moved" or a "Still on hole N?" Yes from anyone updates the whole entry.
   Undo (Club.undo, js/core/undo.js): delivered, cart visit recorded and staff cancel offer Undo while the fleet is unchanged
   (offerFleetUndo); menu and category edits always do. Shift, heading and restock steps have no Undo: they follow the
   dispatch rules and tell golfers straight away, and each has its own opposite button. */
(function () {
  'use strict';
  const S = Club.store, D = Club.cartDispatch, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  if (!D) { console.error('Beverage cart: js/core/cartdispatch.js is not loaded'); return; }
  /* Data helpers shared with the members' portal and public site: js/shared/cart-data.js */
  const { CART_IDS, MAX_QTY, today, hm, r2, nodeLabel, entryDocs, groupName, fleet, categories, removeCategory, menu, orders, order, todays, cartOf, headingTo, itemsText, hasAlcohol, isVisit, label, banner, golferStatus, startShift, go, delivered, restock, backOnCourse, endShift, cancelByStaff } = Club.shared.cart;

  const DEVICE_KEY = 'stboniface.cart.device';           /* which cart this phone drives (per device) */
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function minsAgo(ms) { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'just now' : m + ' min ago'; }
  /** A category by name: an existing one (any capitalization) or a new one added at the end. */
  function ensureCategory(name) {
    const list = categories(), hit = list.find(function (c) { return c.toLowerCase() === name.toLowerCase(); });
    if (hit) return hit;
    S.setObj('cartCategories', list.concat([name]));
    return name;
  }

  /** Undo on the toast for a step that also changed the dispatch fleet (delivered, cancelled). Club.undo puts records back,
      but the fleet is one shared record other carts and golfers change all the time, so Undo is only offered back while the
      fleet is exactly as this step left it; otherwise it refuses rather than overwrite a newer line. Money posted by the
      step is reversed by Club.undo (charge reversal with a credit receipt, or a credit receipt for card and cash). */
  function offerFleetUndo(msg, rec, opts) {
    opts = opts || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg); return; }
    const fleetAfter = JSON.stringify(S.getObj('cartFleet', null));
    ui.toast(msg, '', { action: { label: 'Undo', onClick: function () {
      if (JSON.stringify(S.getObj('cartFleet', null)) !== fleetAfter) { ui.toast('The cart line has changed since, so this can no longer be undone here.', 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { if (opts.after) opts.after(); } catch (e) { console.error(e); }
      ui.toast((opts.undone || 'Undone') + (res.credited ? '. ' + fmt.money(res.credited) + ' credited back' : ''));
    } } });
  }
  /** The receipt for a delivered order, if it has one. */
  function receiptFor(d) { return Club.receipts && d ? Club.receipts.forRef('cart', d.id)[0] || null : null; }

  /* ======================================================================
     Staff page: Beverage cart (phone-first cart screen, clubhouse view, menu editor)
     ====================================================================== */
  function device() { try { return localStorage.getItem(DEVICE_KEY); } catch (e) { return null; } }
  function setDevice(id) { try { if (id) localStorage.setItem(DEVICE_KEY, id); else localStorage.removeItem(DEVICE_KEY); } catch (e) { /* private mode */ } }
  function wide() { return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches; }
  function stateLabel(c) {
    if (!c) return '';
    if (c.state.status === 'restocking') {
      const left = c.state.backAt ? Math.ceil((c.state.backAt - Date.now()) / 60000) : null;
      return left == null ? 'Restocking' : left > 0 ? 'Restocking, back in about ' + left + ' min' : 'Restocking, back any minute';
    }
    const h = headingTo(c);
    return h ? 'Heading to ' + nodeLabel(h.node).toLowerCase() : c.line.length ? 'At ' + nodeLabel(c.state.at).toLowerCase() + ', ready to go' : 'At ' + nodeLabel(c.state.at).toLowerCase();
  }
  function backText(c) {
    const left = c.state.backAt ? Math.ceil((c.state.backAt - Date.now()) / 60000) : null;
    return left == null ? 'Back shortly' : left > 0 ? 'Back in about ' + left + ' min' : 'Back any minute';
  }
  function payLine(d) {
    if (isVisit(d)) return d.payment === 'account'
      ? '<span class="cx-pay is-acct">' + Club.icon('billing') + '<span>Prefers their member account</span></span>'
      : '<span class="cx-pay is-due">' + Club.icon('cash') + '<span>Pays at the cart, card or cash</span></span>';
    return d.payment === 'account'
      ? '<span class="cx-pay is-acct">' + Club.icon('billing') + '<span>On member account · ' + esc(fmt.money(d.total)) + '</span></span>'
      : '<span class="cx-pay is-due">' + Club.icon('cash') + '<span>Pay at the cart · <strong>' + esc(fmt.money(d.total)) + ' due</strong></span></span>';
  }
  function itemsList(d) {
    if (isVisit(d)) return '<p class="cx-visit">' + Club.icon('cart') + '<span>Cart visit: they’ll choose from the cart</span></p>';
    return '<ul class="cx-items">' + (d.items || []).map(function (it) {
      return '<li><span class="cx-qty">' + esc(it.qty) + ' ×</span><span>' + esc(it.name) + (it.size ? ' <span class="cx-size">' + esc(it.size) + '</span>' : '') + '</span>' + (it.alcohol ? '<span class="cx-id">ID may be checked</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function groupLine(d) { return esc(d.name) + (d.groupSize > 1 ? '<span class="cx-group"> · group of ' + esc(d.groupSize) + '</span>' : ''); }

  /* ---------- My cart (the phone screen) ---------- */
  function renderMine(panel, rerender) {
    const f = fleet(), mineId = device(), c = mineId ? cartOf(f, mineId) : null;
    if (!c) { if (mineId) setDevice(null); renderStart(panel, f, rerender); return; }   /* its shift was ended on another phone */
    const now = Date.now();
    const line = c.line, h = headingTo(c), restocking = c.state.status === 'restocking';
    const grp = line[0] ? entryDocs(line[0].id) : [];
    const first = grp[0] || null;
    let main;
    if (restocking) {
      main = '<section class="cx-next is-restock" aria-label="Restocking">' +
        '<p class="cx-eyebrow">Restocking at the clubhouse</p><p class="cx-where">' + esc(backText(c)) + '</p>' +
        '<p class="cx-sub">' + (line.length ? plural(line.length, 'order') + ' waiting for you' : 'No orders waiting') + '</p></section>' +
        '<div class="cx-actions"><button type="button" class="btn btn-primary cx-big" data-act="back">' + Club.icon('cart') + '<span>Back on course</span></button>' +
        '<button type="button" class="btn cx-mid" data-act="end">' + Club.icon('logout') + '<span>End shift</span></button></div>';
    } else if (!first) {
      main = '<section class="cx-next is-empty" aria-label="Next stop"><p class="cx-eyebrow">Next stop</p><p class="cx-where">No orders</p>' +
        '<p class="cx-sub">New orders appear here on their own. You are at ' + esc(nodeLabel(c.state.at).toLowerCase()) + '.</p></section>' +
        '<div class="cx-actions two"><button type="button" class="btn cx-mid" data-act="restock">' + Club.icon('box') + '<span>Restocking</span></button>' +
        '<button type="button" class="btn cx-mid" data-act="end">' + Club.icon('logout') + '<span>End shift</span></button></div>';
    } else {
      const lead = line[0], going = !!(h && h.orderId === lead.id);
      const node = going ? h.node : D.whereIs(lead, now);
      const moved = String(first.hole) !== node;
      main = '<section class="cx-next' + (going ? ' is-going' : '') + '" aria-label="Next stop">' +
          '<div class="cx-next-top"><p class="cx-eyebrow">' + (going ? 'Heading to' : 'Next stop') + '</p><span class="cx-ago">' + esc(minsAgo(first.placedAt)) + '</span></div>' +
          '<p class="cx-where">' + esc(nodeLabel(node)) + '</p>' +
          (grp.length > 1
            ? '<p class="cx-sub"><strong class="cx-grp">' + esc(groupName(grp)) + ' · ' + grp.length + ' orders</strong>' + (moved ? '<br><span class="cx-hint">Last reported hole ' + esc(first.hole) + '</span>' : '') + '</p>' +
              '<p class="cx-hint cx-once">One stop for the group. Each order is billed separately.</p>' +
              grp.map(function (d) { return '<div class="cx-gdoc"><p class="cx-gname">' + esc(d.name) + '</p>' + itemsList(d) + payLine(d) + (d.note ? '<p class="cx-note">' + Club.icon('info') + '<span>' + esc(d.note) + '</span></p>' : '') + '</div>'; }).join('')
            : '<p class="cx-sub">' + groupLine(first) + (moved ? '<br><span class="cx-hint">Ordered from hole ' + esc(first.hole) + (first.holeAt !== first.placedAt ? ' (moved)' : '') + '</span>' : '') + '</p>' +
              itemsList(first) + payLine(first) +
              (first.note ? '<p class="cx-note">' + Club.icon('info') + '<span>' + esc(first.note) + '</span></p>' : '')) +
        '</section>' +
        '<div class="cx-actions">' +
          (going ? '<button type="button" class="btn btn-primary cx-big" data-act="delivered" data-id="' + esc(first.id) + '" data-entry="' + esc(lead.id) + '">' + Club.icon('check') + '<span>Delivered</span></button>'
                 : '<button type="button" class="btn btn-primary cx-big" data-act="go">' + Club.icon('cart') + '<span>Go</span></button>') +
          '<div class="cx-actions two"><button type="button" class="btn cx-mid" data-act="restock">' + Club.icon('box') + '<span>Restocking</span></button>' +
          '<button type="button" class="btn cx-mid" data-act="end">' + Club.icon('logout') + '<span>End shift</span></button></div>' +
        '</div>';
    }
    const rest = restocking ? line : line.slice(1);
    panel.innerHTML = '<div class="cx-mine">' +
      '<div class="cx-who"><span class="cx-cartno" aria-hidden="true">' + esc(c.id) + '</span><span class="cx-who-t"><span class="cx-who-n">Cart ' + esc(c.id) + ' · ' + esc(c.name || 'No name') + '</span><span class="cx-who-s">' + esc(stateLabel(c)) + ' · ' + esc(plural(line.length, 'order')) + ' in line</span></span>' +
        '<button type="button" class="s-link" data-act="switch">Switch</button></div>' +
      main +
      '<section class="cx-rest" aria-labelledby="cx-rest-h"><h2 id="cx-rest-h" class="cx-h">' + (restocking ? 'Your line' : 'Then') + '</h2>' +
        (rest.length ? '<ol class="s-list cx-line">' + rest.map(function (o, i) {
          const ds = entryDocs(o.id);
          if (ds.length > 1) return '<li><span class="cx-place">' + (restocking ? i + 1 : i + 2) + '</span><span class="cx-line-main"><span class="cx-line-t">' + esc(nodeLabel(D.whereIs(o, now))) + ' · ' + esc(groupName(ds)) + ' · ' + ds.length + ' orders</span>' +
            '<span class="cx-line-s">' + esc(ds.map(function (d) { return d.firstName + ': ' + (isVisit(d) ? 'cart visit' : itemsText(d.items)); }).join(' · ')) + '</span></span><span class="cx-line-amt">' + esc(fmt.money(ds.reduce(function (a, d) { return a + (+d.total || 0); }, 0))) + '<small>' + ds.length + ' bills</small></span></li>';
          const d = ds[0] || order(o.id) || { name: 'Order', items: [], total: 0, payment: 'cart' };
          return '<li><span class="cx-place">' + (restocking ? i + 1 : i + 2) + '</span><span class="cx-line-main"><span class="cx-line-t">' + esc(nodeLabel(D.whereIs(o, now))) + ' · ' + esc(d.name) + '</span>' +
            '<span class="cx-line-s">' + esc(isVisit(d) ? 'Cart visit' + (d.note ? ' · ' + d.note : '') : itemsText(d.items)) + '</span></span><span class="cx-line-amt">' + esc(isVisit(d) ? 'Visit' : fmt.money(d.total)) + '<small>' + (d.payment === 'account' ? 'Account' : 'At cart') + '</small></span></li>';
        }).join('') + '</ol>' : '<p class="cx-quiet">' + (restocking ? 'No one is waiting.' : 'No one else is waiting.') + '</p>') +
      '</section></div>';
    wireMine(panel, c, rerender);
  }
  function wireMine(panel, c, rerender) {
    ui.on(panel, 'click', '[data-act=switch]', function () { setDevice(null); rerender(); });
    ui.on(panel, 'click', '[data-act=go]', function () {
      const r = go(c.id);
      if (!r.ok) { ui.toast(r.error, 'bad'); return; }
      ui.toast('On your way to ' + nodeLabel(r.target).toLowerCase() + '. The golfer has been told');
      rerender();
    });
    ui.on(panel, 'click', '[data-act=delivered]', function (e, b) {
      const ds = entryDocs(b.dataset.entry || b.dataset.id);
      if (ds.length > 1) { openGroupDelivered(c.id, b.dataset.entry, rerender); return; }
      const d = ds[0] || order(b.dataset.id); if (!d) return;
      if (isVisit(d)) openVisitDelivered(c.id, d.id, rerender); else openDelivered(c.id, d.id, rerender);
    });
    ui.on(panel, 'click', '[data-act=restock]', function () {
      const sh = Portal.openSheet({ title: 'Restocking', content: '<p class="cx-sheet-p">Waiting orders move to another cart if that serves them sooner. When will you be back out?</p>' +
        '<div class="cx-sheet-btns">' + [5, 10, 15].map(function (m) { return '<button type="button" class="btn cx-mid" data-min="' + m + '">Back in ' + m + ' min</button>'; }).join('') +
        '<button type="button" class="btn btn-ghost cx-mid" data-min="0">Not sure</button></div>' });
      ui.on(sh.body, 'click', '[data-min]', function (e, b) { const r = restock(c.id, +b.dataset.min); sh.close(); ui.toast(r.ok ? 'Restocking. Golfers have been told' : r.error, r.ok ? undefined : 'bad'); rerender(); });
    });
    ui.on(panel, 'click', '[data-act=back]', function () { const r = backOnCourse(c.id); ui.toast(r.ok ? 'Back on the course' : r.error, r.ok ? undefined : 'bad'); rerender(); });
    ui.on(panel, 'click', '[data-act=end]', function () {
      const f = fleet(), last = f.carts.length === 1, n = (cartOf(f, c.id) || { line: [] }).line.length;
      ui.confirm({ title: 'End your shift?', danger: last && n > 0, confirmLabel: 'End shift',
        text: n ? (last ? 'You are the only cart on the course. ' + plural(n, 'waiting order') + ' will be cancelled and the golfers told. Nothing is charged.' : plural(n, 'waiting order') + ' will move to the other carts.') : 'Cart ' + c.id + ' will go off shift.' })
        .then(function (ok) {
          if (!ok) return;
          const r = endShift(c.id); setDevice(null);
          if (!r.ok) { ui.toast(r.error, 'bad'); rerender(); return; }
          ui.toast(r.orphaned ? 'Shift ended. ' + plural(r.orphaned, 'order') + ' cancelled and golfers told' : 'Shift ended. Thank you');
          rerender();
        });
    });
  }
  function holeOptions(sel) {
    let h = '<option value="">Where expected</option><option value="CH"' + (sel === 'CH' ? ' selected' : '') + '>Clubhouse</option>';
    for (let i = 1; i <= 18; i++) h += '<option value="' + i + '"' + (String(sel) === String(i) ? ' selected' : '') + '>Hole ' + i + '</option>';
    return h;
  }
  function openDelivered(cartId, id, rerender) {
    const d = order(id); if (!d) return;
    const acct = d.payment === 'account';
    const sh = Portal.openSheet({ title: 'Delivered to ' + d.firstName,
      content: '<div class="cx-del">' +
        '<p class="cx-del-amt">' + esc(fmt.money(d.total)) + '<small>' + (acct ? 'Goes on ' + esc(d.firstName) + '’s member account' : 'Due now at the cart') + '</small></p>' +
        '<div class="field"><label for="cx-found">Found them at</label><select class="select" id="cx-found">' + holeOptions('') + '</select></div>' +
        (hasAlcohol(d.items) ? '<p class="cx-hint">' + Club.icon('info') + ' Alcohol in this order: ID may be checked.</p>' : '') +
        '<div class="cx-sheet-btns">' + (acct
          ? '<button type="button" class="btn btn-primary cx-big" data-paid="account">' + Club.icon('check') + '<span>Delivered, add to account</span></button>'
          : '<p class="cx-paid-l">Paid:</p><button type="button" class="btn btn-primary cx-mid" data-paid="card">' + Club.icon('card') + '<span>Card</span></button><button type="button" class="btn btn-primary cx-mid" data-paid="cash">' + Club.icon('cash') + '<span>Cash</span></button>') +
        '</div></div>' });
    let sent = false;   /* a double tap must not post twice or show an error after the success */
    ui.on(sh.body, 'click', '[data-paid]', function (e, b) {
      if (sent) return; sent = true;
      const found = ui.$('#cx-found', sh.body).value || null;
      const rec = Club.undo.track(function () { return delivered(cartId, id, { foundHole: found, paidWith: b.dataset.paid === 'account' ? null : b.dataset.paid }); });
      const r = rec.result;
      sh.close();
      if (!r.ok) { ui.toast(r.error, 'bad'); rerender(); return; }
      offerFleetUndo(acct ? fmt.money(d.total) + ' charged to ' + d.name + '’s account' : 'Delivered to ' + d.firstName + ', paid by ' + b.dataset.paid, rec,
        { after: rerender, undone: d.name + '’s order is open again' + (acct ? '' : '. Refund the ' + b.dataset.paid + ' payment by hand') });
      rerender();
    });
  }
  /** Group stop delivered: one row per golfer, each recorded separately (its own charge, or card / cash; visits go
      through "What did they buy?"). The stop leaves the line when the last one is recorded. */
  function openGroupDelivered(cartId, eid, rerender) {
    const first = entryDocs(eid);
    if (!first.length) return;
    function rows() {
      const ds = entryDocs(eid);
      return '<p class="cx-sheet-p">' + esc(groupName(first)) + ': record each order. Each is billed on its own.</p><ul class="s-list cx-grows">' + ds.map(function (d) {
        return '<li><span class="cx-line-main"><span class="cx-line-t">' + esc(d.name) + '</span><span class="cx-line-s">' + esc(isVisit(d) ? 'Cart visit, they choose from the cart' : itemsText(d.items) + ' · ' + fmt.money(d.total)) + ' · ' + (d.payment === 'account' ? 'account' : 'pay at the cart') + '</span></span>' +
          '<button type="button" class="btn btn-primary btn-sm" data-rec="' + esc(d.id) + '">Record</button></li>';
      }).join('') + '</ul>';
    }
    const sh = Portal.openSheet({ title: 'Delivered to the ' + groupName(first), content: rows() });
    if (sh.duplicate) return;
    function after() { if (!entryDocs(eid).length) { sh.close(); rerender(); return; } sh.setContent(rows()); rerender(); }
    ui.on(sh.body, 'click', '[data-rec]', function (e, b) {
      const d = order(b.dataset.rec); if (!d || d.status !== 'open') { after(); return; }
      if (isVisit(d)) openVisitDelivered(cartId, d.id, after); else openDelivered(cartId, d.id, after);
    });
  }
  /** Cart visit delivered: "What did they buy?" Quick steppers over the menu (sold out hidden), a running total,
      payment (Charge to account only for a member who chose it, and then preselected; otherwise card or cash), or Nothing bought. */
  function openVisitDelivered(cartId, id, rerender) {
    const d = order(id); if (!d) return;
    const acctOk = d.payment === 'account' && !!d.memberId;
    const qty = {}; let pay = acctOk ? 'account' : 'card';
    const list = menu().filter(function (m) { return !m.soldOut; });
    function total() { return r2(list.reduce(function (a, m) { return a + (qty[m.id] || 0) * m.price; }, 0)); }
    function count() { return list.reduce(function (a, m) { return a + (qty[m.id] || 0); }, 0); }
    function rows() {
      return categories().map(function (cat) {
        const ms = list.filter(function (m) { return m.category === cat; }); if (!ms.length) return '';
        return '<p class="cx-buy-cat">' + esc(cat) + '</p><ul class="cx-buy">' + ms.map(function (m) {
          const q = qty[m.id] || 0;
          return '<li class="' + (q ? 'is-in' : '') + '"><span class="cx-line-main"><span class="cx-line-t">' + esc(m.name) + '</span><span class="cx-line-s">' + esc((m.size ? m.size + ' · ' : '') + fmt.money(m.price)) + '</span>' + (m.alcohol ? '<span class="cx-line-s">ID may be checked</span>' : '') + '</span>' +
            '<span class="cx-step" role="group" aria-label="' + esc(m.name) + ' bought"><button type="button" data-bdec="' + esc(m.id) + '" aria-label="One fewer ' + esc(m.name) + '"' + (q ? '' : ' disabled') + '>−</button>' +
            '<output aria-live="polite">' + q + '</output><button type="button" data-binc="' + esc(m.id) + '" aria-label="One more ' + esc(m.name) + '"' + (q >= MAX_QTY ? ' disabled' : '') + '>+</button></span></li>';
        }).join('') + '</ul>';
      }).join('');
    }
    function payHTML() {
      const opts = (acctOk ? [['account', 'Charge to account']] : []).concat([['card', 'Card'], ['cash', 'Cash']]);
      return '<div class="segmented cx-seg cx-payseg" role="radiogroup" aria-label="Payment">' + opts.map(function (o) {
        return '<button type="button" role="radio" data-bpay="' + o[0] + '" aria-checked="' + (pay === o[0]) + '"' + (pay === o[0] ? ' class="active"' : '') + '>' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    }
    function footHTML() {
      const n = count();
      return '<div class="cx-buy-foot"><p class="cx-buy-total" aria-live="polite">' + (n ? esc(plural(n, 'item') + ' · ' + fmt.money(total())) : 'Nothing added yet') + '</p>' +
        payHTML() +
        '<div class="cx-actions two"><button type="button" class="btn cx-mid" data-bsave="none">Nothing bought</button>' +
        '<button type="button" class="btn btn-primary cx-mid" data-bsave="items"' + (n ? '' : ' disabled') + '>' + (n ? 'Save ' + esc(fmt.money(total())) : 'Save') + '</button></div></div>';
    }
    const sh = Portal.openSheet({ title: 'What did they buy?', size: 'full',
      content: '<div class="cx-del"><p class="cx-sheet-p">Cart visit for ' + esc(d.name) + (d.note ? ' · “' + esc(d.note) + '”' : '') + '. ' + (acctOk ? 'They asked to put it on their member account.' : 'They pay at the cart.') + '</p>' +
        '<div class="field"><label for="cx-found">Found them at</label><select class="select" id="cx-found">' + holeOptions('') + '</select></div>' +
        '<div class="cx-buy-host">' + rows() + '</div></div>', footer: footHTML() });
    if (sh.duplicate) return;
    function redraw() { ui.$('.cx-buy-host', sh.body).innerHTML = rows(); sh.setFooter(footHTML()); }
    ui.on(sh.body, 'click', '[data-binc]', function (e, b) { qty[b.dataset.binc] = Math.min(MAX_QTY, (qty[b.dataset.binc] || 0) + 1); redraw(); const n = ui.$('[data-binc="' + b.dataset.binc + '"]', sh.body); if (n) n.focus(); });
    ui.on(sh.body, 'click', '[data-bdec]', function (e, b) { qty[b.dataset.bdec] = Math.max(0, (qty[b.dataset.bdec] || 0) - 1); redraw(); const n = ui.$('[data-bdec="' + b.dataset.bdec + '"]:not([disabled])', sh.body) || ui.$('[data-binc="' + b.dataset.bdec + '"]', sh.body); if (n) n.focus(); });
    ui.on(sh.foot, 'click', '[data-bpay]', function (e, b) { pay = b.dataset.bpay; sh.setFooter(footHTML()); });
    let sent = false;
    ui.on(sh.foot, 'click', '[data-bsave]', function (e, b) {
      if (sent || b.disabled) return; sent = true;
      const none = b.dataset.bsave === 'none';
      const items = none ? [] : list.filter(function (m) { return qty[m.id] > 0; }).map(function (m) { return { itemId: m.id, qty: qty[m.id] }; });
      const rec = Club.undo.track(function () { return delivered(cartId, id, { foundHole: ui.$('#cx-found', sh.body).value || null, items: items, paidWith: none ? null : pay }); });
      const r = rec.result;
      sh.close();
      if (!r.ok) { ui.toast(r.error, 'bad'); rerender(); return; }
      const paidHand = !none && !r.doc.chargeId && r.doc.paidWith;
      offerFleetUndo(none ? 'Cart visit done, nothing bought' : r.doc.chargeId ? fmt.money(r.doc.total) + ' charged to ' + d.name + '’s account' : 'Cart visit done, ' + fmt.money(r.doc.total) + ' paid by ' + r.doc.paidWith, rec,
        { after: rerender, undone: d.name + '’s cart visit is open again' + (paidHand ? '. Refund the ' + paidHand + ' payment by hand' : '') });
      rerender();
    });
  }
  function renderStart(panel, f, rerender) {
    const on = f.carts;
    const fb = S.all('staff').filter(function (s) { return s.status !== 'inactive'; })
      .sort(function (a, b) { return ((a.department === 'Food & Beverage' ? 0 : 1) - (b.department === 'Food & Beverage' ? 0 : 1)) || a.firstName.localeCompare(b.firstName); });
    const free = CART_IDS.filter(function (id) { return !cartOf(f, id); });
    panel.innerHTML = '<div class="cx-start">' +
      (on.length ? '<section class="cx-onshift" aria-labelledby="cx-on-h"><h2 id="cx-on-h" class="cx-h">On shift now</h2><div class="s-list">' + on.map(function (c) {
        return '<button type="button" data-use="' + esc(c.id) + '"><span class="cx-cartno" aria-hidden="true">' + esc(c.id) + '</span><span class="cx-line-main"><span class="cx-line-t">Cart ' + esc(c.id) + ' · ' + esc(c.name || 'No name') + '</span><span class="cx-line-s">' + esc(stateLabel(c)) + ' · ' + esc(plural(c.line.length, 'order')) + '</span></span><span class="cx-use">Use this phone</span></button>';
      }).join('') + '</div></section>' : '') +
      (free.length ? '<section class="panel cx-startform" aria-labelledby="cx-st-h"><div class="panel-body"><h2 id="cx-st-h" class="cx-h">Start a shift</h2>' +
        '<form novalidate class="cx-form">' +
          '<div class="field"><label for="cx-staff">Who is driving?</label><select class="select" id="cx-staff" name="staffId"><option value="">Choose yourself</option>' +
            fb.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.firstName + ' ' + s.lastName) + ' · ' + esc(s.role) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="cx-fname">Or type your first name</label><input class="input" id="cx-fname" name="first" maxlength="24" autocomplete="given-name" placeholder="First name"></div>' +
          '<div class="field"><span class="cx-flabel" id="cx-cart-l">Cart</span><div class="segmented cx-seg" role="radiogroup" aria-labelledby="cx-cart-l">' + CART_IDS.map(function (id, i) {
            const busy = !!cartOf(f, id); const sel = id === free[0];
            return '<button type="button" role="radio" data-cart="' + id + '" aria-checked="' + sel + '"' + (sel ? ' class="active"' : '') + (busy ? ' disabled title="Cart ' + id + ' is on shift"' : '') + '>Cart ' + id + '</button>';
          }).join('') + '</div></div>' +
          '<button type="submit" class="btn btn-primary cx-big">' + Club.icon('cart') + '<span>Start shift</span></button>' +
        '</form></div></section>' : '<p class="cx-quiet">All three carts are on shift. Choose one above to use this phone for it.</p>') +
    '</div>';
    ui.on(panel, 'click', '[data-use]', function (e, b) { setDevice(b.dataset.use); rerender(); });
    ui.on(panel, 'click', '.cx-seg button', function (e, b) { if (b.disabled) return; ui.$$('.cx-seg button', panel).forEach(function (x) { const a = x === b; x.classList.toggle('active', a); x.setAttribute('aria-checked', a); }); });
    const form = ui.$('.cx-form', panel);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ui.$$('.field-error', form).forEach(function (n) { n.remove(); });
      const sid = ui.$('#cx-staff', form).value, typed = ui.$('#cx-fname', form).value.trim().replace(/\s+/g, ' ');
      const st = sid ? Club.staff.get(sid) : null;
      const name = typed ? typed.split(' ')[0] : st ? st.firstName : '';
      if (!name) { ui.$('#cx-fname', form).insertAdjacentHTML('afterend', '<span class="field-error">Choose yourself or type your first name.</span>'); ui.$('#cx-staff', form).focus(); return; }
      const cb = ui.$('.cx-seg button.active', form); const cartId = cb ? cb.dataset.cart : null;
      if (!cartId) { ui.toast('Choose a cart', 'bad'); return; }
      const rec = Club.undo.track(function () { return startShift(cartId, name.charAt(0).toUpperCase() + name.slice(1), typed ? null : sid); }), r = rec.result;
      if (!r.ok) { ui.toast(r.error, 'bad'); rerender(); return; }
      setDevice(cartId);
      /* Started on the wrong cart or by the wrong name: Undo while nothing has moved in the line since. */
      offerFleetUndo('Shift started on cart ' + cartId + '. Have a good one, ' + name, rec, { after: rerender, undone: 'Shift on cart ' + cartId + ' not started' });
      rerender();
    });
  }

  /* ---------- Clubhouse view ---------- */
  function mapSVG(f) {
    const now = Date.now(), N = D.NODES;
    const waiting = {};
    f.carts.forEach(function (c) { c.line.forEach(function (o) { const n = D.whereIs(o, now); waiting[n] = (waiting[n] || 0) + 1; }); });
    let s = '<svg class="cx-map" viewBox="20 -10 1080 1000" role="img" aria-labelledby="cx-map-t cx-map-d"><title id="cx-map-t">Course map</title><desc id="cx-map-d">' +
      esc(f.carts.map(function (c) { return 'Cart ' + c.id + ': ' + stateLabel(c); }).join('. ') || 'No carts on shift') + '. ' + esc(Object.keys(waiting).map(function (n) { return waiting[n] + ' waiting at ' + nodeLabel(n).toLowerCase(); }).join(', ')) + '</desc>';
    D.EDGES.forEach(function (e) { const a = N[e[0]], b = N[e[1]]; s += '<line class="cx-edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>'; });
    f.carts.forEach(function (c) { const h = headingTo(c); if (!h) return; const a = N[c.state.at], b = N[h.node]; s += '<line class="cx-route" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>'; });
    Object.keys(N).forEach(function (k) {
      const p = N[k];
      if (waiting[k]) s += '<circle class="cx-wait" cx="' + p.x + '" cy="' + p.y + '" r="34"/>';
      s += k === 'CH' ? '<rect class="cx-node is-ch" x="' + (p.x - 30) + '" y="' + (p.y - 20) + '" width="60" height="40" rx="8"/><text class="cx-node-t" x="' + p.x + '" y="' + (p.y + 7) + '">CH</text>'
        : '<circle class="cx-node" cx="' + p.x + '" cy="' + p.y + '" r="21"/><text class="cx-node-t" x="' + p.x + '" y="' + (p.y + 7) + '">' + k + '</text>';
      if (waiting[k]) s += '<text class="cx-wait-t" x="' + (p.x + 30) + '" y="' + (p.y - 26) + '">' + waiting[k] + '</text>';
    });
    f.carts.forEach(function (c, i) {
      const at = c.state.status === 'restocking' ? 'CH' : c.state.at, p = N[at];
      const dx = (i - (f.carts.length - 1) / 2) * 50;
      s += '<g class="cx-cartdot' + (c.state.status === 'restocking' ? ' is-restock' : '') + '"><circle cx="' + (p.x + dx) + '" cy="' + (p.y + 52) + '" r="24"/><text x="' + (p.x + dx) + '" y="' + (p.y + 60) + '">' + esc(c.id) + '</text></g>';
    });
    return s + '</svg>';
  }
  /* ---------- Clubhouse: the four stat tiles open a details drawer (same parts as the dashboard's) ---------- */
  const DR = Club.drill, dSec = DR.sec, dKpis = DR.kpis, dTable = DR.table, dNote = DR.note, share = DR.share;
  function dEmpty(title, text) { return DR.empty(title, text, 'cart'); }
  function mins(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
  function hourShort(h) { return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function deliveredMs(o) { return o.deliveredAt ? Date.parse(o.deliveredAt) - o.placedAt : null; }
  function salesOf(list) { return r2(list.reduce(function (a, o) { return a + (+o.total || 0); }, 0)); }
  /** Bars per hour of the day (between the first and last hour with data). */
  function hourBars(list, at, value, name, money) {
    if (!list.length) return dNote('Nothing yet today.');
    const hs = list.map(function (o) { return new Date(at(o)).getHours(); }), lo = Math.min.apply(null, hs), hi = Math.max.apply(null, hs), hours = [];
    for (let h = lo; h <= hi; h++) hours.push(h);
    return Club.charts.bar({ labels: hours.map(hourShort), height: 180, money: money, whole: true, series: [{ name: name, values: hours.map(function (h) { return r2(list.filter(function (o) { return new Date(at(o)).getHours() === h; }).reduce(function (a, o) { return a + value(o); }, 0)); }) }] });
  }
  /** Items in a list of orders, most sold first: [{ name, itemId, qty, rev }]. */
  function tally(list) {
    const items = {};
    list.forEach(function (o) { (o.items || []).forEach(function (it) { const k = it.itemId || it.name; const x = items[k] = items[k] || { name: it.name, qty: 0, rev: 0, itemId: it.itemId }; x.qty += +it.qty || 0; x.rev = r2(x.rev + (+it.qty || 0) * (+it.price || 0)); }); });
    return Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.qty - a.qty || b.rev - a.rev || a.name.localeCompare(b.name); });
  }
  function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); out.push(S.iso(d)); } return out; }

  function drillCarts() {
    const f = fleet(), td = todays(), now = Date.now();
    const on = f.carts, off = CART_IDS.filter(function (id) { return !on.some(function (c) { return c.id === id; }); });
    const doneBy = function (id) { return td.filter(function (o) { return o.status === 'delivered' && String(o.cartId) === String(id); }); };
    const stops = td.filter(function (o) { return o.status === 'delivered'; }).length;
    let html = dKpis([
      { label: 'On shift', value: on.length + ' of ' + CART_IDS.length, sub: off.length ? plural(off.length, 'cart') + ' off shift' : 'Every cart is out' },
      { label: 'Restocking', value: String(on.filter(function (c) { return c.state.status === 'restocking'; }).length), sub: 'At the clubhouse' },
      { label: 'Delivered today', value: String(stops), sub: on.length ? 'About ' + Math.round(stops / on.length) + ' per cart on shift' : 'No carts on shift' },
      { label: 'Longest shift', value: on.length ? mins(Math.max.apply(null, on.map(function (c) { return c.shiftStart ? now - c.shiftStart : 0; }))) : 'None', sub: 'So far today' }
    ]);
    if (!on.length) html += dEmpty('No carts on shift', 'Golfers see “Cart service is closed right now”. Start a shift from the My cart tab.');
    else html += dSec('Each cart', plural(on.length, 'cart') + ' on shift', dTable([{ label: 'Cart' }, { label: 'Status' }, { label: 'On since' }, { label: 'In line', num: true }, { label: 'Delivered', num: true }, { label: 'Sales', num: true }],
      on.map(function (c) {
        const dn = doneBy(c.id);
        return ['<span class="primary-cell">Cart ' + esc(c.id) + '</span><div class="dd-sub">' + esc(c.name || 'No name') + '</div>', esc(stateLabel(c)),
          c.shiftStart ? esc(fmt.time(hm(c.shiftStart))) + '<div class="dd-sub">' + esc(mins(now - c.shiftStart)) + '</div>' : 'Today', c.line.length, dn.length, esc(fmt.money(salesOf(dn)))];
      })));
    if (off.length) html += dSec('Off shift', '', dNote((off.length === 1 ? 'Cart ' + off[0] + ' is' : 'Carts ' + off.slice(0, -1).join(', ') + ' and ' + off[off.length - 1] + ' are') + ' not out. An attendant starts a shift from the My cart tab on the cart phone.'));
    return { title: 'Carts on shift', body: html, go: 'cart/mine', goLabel: 'Open My cart' };
  }
  function drillWaiting() {
    const f = fleet(), now = Date.now();
    const open = todays().filter(function (o) { return o.status === 'open'; }).sort(function (a, b) { return a.placedAt - b.placedAt; });
    const waits = open.map(function (o) { return now - o.placedAt; });
    const stopsN = f.carts.reduce(function (a, c) { return a + c.line.length; }, 0);
    const heading = open.filter(function (o) { const g = golferStatus(o.id); return g && g.state === 'heading'; }).length;
    let html = dKpis([
      { label: 'Stops in line', value: String(stopsN), sub: plural(open.length, 'open order') + (open.length > stopsN ? ' (group stops share one)' : '') },
      { label: 'Longest wait', value: waits.length ? mins(Math.max.apply(null, waits)) : 'None', sub: open.length ? 'Since ' + open[0].name + ' ordered' : 'No one waiting' },
      { label: 'Average wait', value: waits.length ? mins(waits.reduce(function (a, b) { return a + b; }, 0) / waits.length) : 'None', sub: 'So far, for open orders' },
      { label: 'Cart on the way', value: String(heading), sub: heading === 1 ? 'Order being driven to' : 'Orders being driven to' }
    ]);
    if (!open.length) return { title: 'Waiting', body: html + dEmpty('No one is waiting', 'New orders and cart visits appear here the moment golfers place them.') };
    /* In serving order: the stop the cart is driving to, then by place in line. */
    const rank = function (o) { const g = golferStatus(o.id) || {}; return g.state === 'heading' ? 0 : g.place || 99; };
    const served = open.slice().sort(function (a, b) { return rank(a) - rank(b) || a.placedAt - b.placedAt; });
    html += dSec('The line', 'In the order the cart will serve them', dTable([{ label: 'Golfer' }, { label: 'Where' }, { label: 'Waiting' }, { label: 'Order' }, { label: 'Status' }, { label: 'Total', num: true }],
      served.map(function (o) {
        const g = golferStatus(o.id) || {};
        return ['<span class="primary-cell">' + esc(o.name) + '</span>' + (o.golferType === 'public' ? '<div class="dd-sub">Public golfer</div>' : ''), 'Hole ' + esc(o.hole),
          esc(mins(now - o.placedAt)) + '<div class="dd-sub">Since ' + esc(fmt.time(hm(o.placedAt))) + '</div>', esc(isVisit(o) ? 'Cart visit' : itemsText(o.items)),
          esc(g.state === 'heading' ? 'Cart on the way' : (g.place ? ordinal(g.place) + ' in line' : 'Waiting') + (o.cartId ? ', cart ' + o.cartId : '')), esc(isVisit(o) ? 'Visit' : fmt.money(o.total))];
      })));
    const byHole = {}; open.forEach(function (o) { byHole[o.hole] = (byHole[o.hole] || 0) + 1; });
    const busy = Object.keys(byHole).sort(function (a, b) { return byHole[b] - byHole[a]; })[0];
    html += dNote(plural(open.filter(isVisit).length, 'cart visit') + ' and ' + plural(open.filter(function (o) { return !isVisit(o); }).length, 'order') + ' open' + (busy && byHole[busy] > 1 ? '. Busiest spot: hole ' + busy + ' with ' + byHole[busy] + '.' : '.'));
    return { title: 'Waiting', body: html };
  }
  function drillDelivered() {
    const td = todays(), done = td.filter(function (o) { return o.status === 'delivered'; }), cancelled = td.filter(function (o) { return o.status === 'cancelled'; });
    const times = done.map(deliveredMs).filter(function (v) { return v != null && v >= 0; });
    const visits = done.filter(isVisit), nothing = visits.filter(function (o) { return o.boughtNothing; });
    let html = dKpis([
      { label: 'Delivered', value: String(done.length), sub: plural(visits.length, 'cart visit') + ' included' },
      { label: 'Average time', value: times.length ? mins(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : 'None', sub: 'From order to delivery' },
      { label: 'Fastest', value: times.length ? mins(Math.min.apply(null, times)) : 'None', sub: times.length ? 'Slowest ' + mins(Math.max.apply(null, times)) : 'Order to delivery' },
      { label: 'Cancelled', value: String(cancelled.length), sub: td.length ? Math.round(cancelled.length / td.length * 100) + '% of today’s orders' : 'No orders yet' }
    ]);
    if (!done.length && !cancelled.length) return { title: 'Delivered today', body: html + dEmpty('Nothing delivered yet today', 'Deliveries, cart visits and cancellations appear here through the day.') };
    html += dSec('Deliveries by hour', '', hourBars(done, function (o) { return Date.parse(o.deliveredAt); }, function () { return 1; }, 'Deliveries'));
    const carts = {}; done.forEach(function (o) { const k = o.cartId || '?'; (carts[k] = carts[k] || []).push(o); });
    html += dSec('By cart', '', dTable([{ label: 'Cart' }, { label: 'Delivered', num: true }, { label: 'Average time', num: true }],
      Object.keys(carts).sort().map(function (k) { const ts = carts[k].map(deliveredMs).filter(function (v) { return v != null; }); return ['<span class="primary-cell">Cart ' + esc(k) + '</span>' + (carts[k][0].deliveredBy ? '<div class="dd-sub">' + esc(carts[k][0].deliveredBy) + '</div>' : ''), carts[k].length, ts.length ? esc(mins(ts.reduce(function (a, b) { return a + b; }, 0) / ts.length)) : '']; })));
    if (visits.length) html += dSec('Cart visits', plural(visits.length, 'visit'), dNote(nothing.length ? plural(nothing.length, 'visit') + ' ended with nothing bought; ' + (visits.length - nothing.length) + ' sold something, ' + fmt.money(salesOf(visits)) + ' in all.' : 'Every visit sold something, ' + fmt.money(salesOf(visits)) + ' in all.'));
    const why = { golfer: 'Golfer cancelled', staff: 'Staff cancelled', shift: 'Service closed' };
    if (cancelled.length) html += dSec('Cancellations', plural(cancelled.length, 'order'), dTable([{ label: 'Golfer' }, { label: 'Placed' }, { label: 'Why' }, { label: 'Order' }],
      cancelled.map(function (o) { return ['<span class="primary-cell">' + esc(o.name) + '</span>', esc(fmt.time(hm(o.placedAt))), esc(why[o.cancelledBy] || 'Cancelled'), esc(isVisit(o) ? 'Cart visit' : itemsText(o.items))]; })));
    return { title: 'Delivered today', body: html };
  }
  function drillSales() {
    const td = todays(), done = td.filter(function (o) { return o.status === 'delivered'; }), total = salesOf(done);
    const paid = done.filter(function (o) { return (+o.total || 0) > 0; });
    const days = lastDays(7), dayTotals = days.map(function (d) { return salesOf(orders().filter(function (o) { return o.date === d && o.status === 'delivered'; })); });
    const prior = dayTotals.slice(0, 6).filter(function (v) { return v > 0; }), avg = prior.length ? prior.reduce(function (a, b) { return a + b; }, 0) / prior.length : 0;
    const list = tally(done).sort(function (a, b) { return b.rev - a.rev || b.qty - a.qty; });
    const units = list.reduce(function (a, x) { return a + x.qty; }, 0);
    let html = dKpis([
      { label: 'Sales', value: fmt.money(total), sub: avg ? (total >= avg ? 'Up ' : 'Down ') + Math.abs(Math.round((total - avg) / avg * 100)) + '% on the recent daily average' : 'No earlier days to compare' },
      { label: 'Paid orders', value: String(paid.length), sub: plural(done.length - paid.length, 'stop') + ' with nothing sold' },
      { label: 'Average order', value: paid.length ? fmt.money(total / paid.length) : '$0.00', sub: 'Across paid orders' },
      { label: 'Items sold', value: String(units), sub: plural(list.length, 'different item') }
    ]);
    if (!done.length) return { title: 'Sales today', body: html + dEmpty('No sales yet today', 'Sales count when an order is delivered: charged to a member account or paid by card or cash.') };
    const acct = salesOf(done.filter(function (o) { return o.payment === 'account' && !o.paidWith; })), card = salesOf(done.filter(function (o) { return o.paidWith === 'card'; })), cash = salesOf(done.filter(function (o) { return o.paidWith === 'cash'; }));
    const pay = [{ label: 'Member account', value: acct }, { label: 'Card', value: card }, { label: 'Cash', value: cash }].filter(function (x) { return x.value > 0; });
    html += '<div class="dd-two" data-reveal>' +
      dSec('By payment', '', pay.length ? Club.charts.donut({ items: pay, size: 150, money: true, center: { value: fmt.money0(total), label: 'Today' } }) : dNote('No paid orders yet.')) +
      dSec('Sales by hour', '', hourBars(done, function (o) { return Date.parse(o.deliveredAt); }, function (o) { return +o.total || 0; }, 'Sales', true)) + '</div>';
    html += dSec('Top items', plural(list.length, 'item'), dTable([{ label: 'Item' }, { label: 'Share of sales' }, { label: 'Sold', num: true }, { label: 'Sales', num: true }],
      list.slice(0, 8).map(function (x) { return ['<span class="primary-cell">' + esc(x.name) + '</span>', share(x.rev, total), x.qty, esc(fmt.money(x.rev))]; }),
      list.length > 8 ? ['Other ' + (list.length - 8), '', list.slice(8).reduce(function (a, x) { return a + x.qty; }, 0), esc(fmt.money(list.slice(8).reduce(function (a, x) { return a + x.rev; }, 0)))] : null));
    const byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
    const cats = {}; list.forEach(function (x) { const c = (byId[x.itemId] || {}).category || 'Other'; cats[c] = r2((cats[c] || 0) + x.rev); });
    const catKeys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    const mem = salesOf(done.filter(function (o) { return o.golferType !== 'public'; }));
    html += '<div class="dd-two" data-reveal>' +
      dSec('By category', '', dTable([{ label: 'Category' }, { label: 'Share' }, { label: 'Sales', num: true }], catKeys.map(function (c) { return ['<span class="primary-cell">' + esc(c) + '</span>', share(cats[c], total), esc(fmt.money(cats[c]))]; }))) +
      dSec('Who bought', '', dTable([{ label: 'Golfers' }, { label: 'Share' }, { label: 'Sales', num: true }], [['<span class="primary-cell">Members</span>', share(mem, total), esc(fmt.money(mem))], ['<span class="primary-cell">Public golfers</span>', share(r2(total - mem), total), esc(fmt.money(r2(total - mem)))]])) + '</div>';
    html += dSec('The last seven days', avg ? 'Average ' + fmt.money(avg) + ' on days with sales' : '', Club.charts.bar({ labels: days.map(function (d, i) { return i === days.length - 1 ? 'Today' : fmt.weekday(d); }), height: 180, money: true, whole: true,
      series: [{ name: 'Earlier days', values: dayTotals.map(function (v, i) { return i === days.length - 1 ? 0 : v; }), color: 'var(--c5)' }, { name: 'Today', values: dayTotals.map(function (v, i) { return i === days.length - 1 ? v : 0; }), color: 'var(--c1)' }], stacked: true }));
    return { title: 'Sales today', body: html, go: 'billing', goLabel: 'Open billing' };
  }
  function drillItems() {
    const td = todays(), done = td.filter(function (o) { return o.status === 'delivered'; }), list = tally(done);
    const onOrder = tally(td.filter(function (o) { return o.status === 'open'; }));
    const byId = {}; S.all('cartMenu').forEach(function (m) { byId[m.id] = m; });
    const out = S.all('cartMenu').filter(function (m) { return m.soldOut; });
    const units = list.reduce(function (a, x) { return a + x.qty; }, 0), total = salesOf(done);
    let html = dKpis([
      { label: 'Top seller', value: list.length ? list[0].name : 'None yet', sub: list.length ? list[0].qty + ' sold · ' + fmt.money(list[0].rev) : 'No deliveries yet' },
      { label: 'Items sold', value: String(units), sub: plural(list.length, 'different item') },
      { label: 'On order now', value: String(onOrder.reduce(function (a, x) { return a + x.qty; }, 0)), sub: 'In open orders, not yet delivered' },
      { label: 'Sold out', value: String(out.length), sub: out.length ? 'On the menu right now' : 'Everything is available' }
    ]);
    if (!list.length && !onOrder.length) html += dEmpty('Nothing sold yet today', 'Items count once an order is delivered. Open orders show under On order now.');
    if (list.length) html += dSec('Sold today', 'Most sold first', dTable([{ label: 'Item' }, { label: 'Category' }, { label: 'Share of sales' }, { label: 'Sold', num: true }, { label: 'Sales', num: true }],
      list.map(function (x) { const m = byId[x.itemId] || {}; return ['<span class="primary-cell">' + esc(x.name) + '</span>' + (m.size ? '<div class="dd-sub">' + esc(m.size) + '</div>' : ''), esc(m.category || 'Other'), share(x.rev, total), x.qty, esc(fmt.money(x.rev))]; }),
      ['Total', '', '', units, esc(fmt.money(total))]));
    if (onOrder.length) html += dSec('On order now', 'Load these on the cart', dTable([{ label: 'Item' }, { label: 'Ordered', num: true }],
      onOrder.map(function (x) { const m = byId[x.itemId] || {}; return ['<span class="primary-cell">' + esc(x.name) + '</span>' + (m.size ? '<div class="dd-sub">' + esc(m.size) + '</div>' : ''), x.qty]; })));
    if (out.length) html += dSec('Sold out', '', dNote(out.map(function (m) { return m.name; }).join(', ') + '. Turn them back on from the Menu tab when restocked.'));
    return { title: 'Items today', body: html, go: 'cart/menu', goLabel: 'Open menu' };
  }
  const DRILLS = { carts: drillCarts, waiting: drillWaiting, delivered: drillDelivered, sales: drillSales, items: drillItems };

  function renderClubhouse(panel, rerender) {
    const f = fleet(), td = todays(), now = Date.now();
    const done = td.filter(function (o) { return o.status === 'delivered'; });
    const sum = function (arr) { return r2(arr.reduce(function (a, o) { return a + (+o.total || 0); }, 0)); };
    const acct = sum(done.filter(function (o) { return o.payment === 'account' && !o.paidWith; })), card = sum(done.filter(function (o) { return o.paidWith === 'card'; })), cash = sum(done.filter(function (o) { return o.paidWith === 'cash'; }));
    const waiting = f.carts.reduce(function (a, c) { return a + c.line.length; }, 0);
    panel.innerHTML = '<div class="cx-house">' + DR.tiles(ui.stats([
        { label: 'Carts on shift', value: f.carts.length, meta: f.carts.filter(function (c) { return c.state.status === 'restocking'; }).length + ' restocking' },
        { label: 'Waiting', value: waiting, meta: 'orders in line' },
        { label: 'Delivered today', value: done.length, meta: plural(done.filter(isVisit).length, 'cart visit') + ' · ' + plural(td.filter(function (o) { return o.status === 'cancelled'; }).length, 'cancellation') },
        { label: 'Sales today', value: sum(done), prefix: '$', decimals: 2, meta: 'Account ' + fmt.money(acct) + ' · card ' + fmt.money(card) + ' · cash ' + fmt.money(cash) },
        (function () {
          const top = tally(done);
          return { label: 'Top seller', value: top.length ? top[0].name : 'None yet',
            meta: top.length ? esc(top[0].qty + ' sold' + (top.length > 1 ? ' · then ' + top.slice(1, 3).map(function (x) { return x.name + ' (' + x.qty + ')'; }).join(', ') : '')) : 'Shows once orders are delivered' };
        })()
      ]), ['carts', 'waiting', 'delivered', 'sales', 'items']) +
      '<div class="cx-house-grid">' +
        '<section class="panel cx-mappanel" aria-labelledby="cx-map-h"><div class="panel-head"><h3 id="cx-map-h">On the course</h3><span class="cx-legend"><span class="cx-lg-cart"></span>Cart <span class="cx-lg-wait"></span>Waiting order</span></div><div class="panel-body">' + mapSVG(f) + '<p class="cx-credit">Map data © OpenStreetMap contributors</p></div></section>' +
        '<section class="cx-carts" aria-labelledby="cx-carts-h"><h2 id="cx-carts-h" class="cx-h">Carts</h2>' +
          (f.carts.length ? f.carts.map(function (c) {
            return '<article class="panel cx-cartcard"><div class="panel-head"><h3><span class="cx-cartno" aria-hidden="true">' + esc(c.id) + '</span>Cart ' + esc(c.id) + ' · ' + esc(c.name || 'No name') + '</h3>' +
              (c.state.status === 'restocking' ? ui.badge('Restocking', 'warn') : headingTo(c) ? ui.badge('Driving', 'good') : ui.badge('On course', 'plain')) + '</div>' +
              '<div class="panel-body"><p class="cx-sub">' + esc(stateLabel(c)) + (c.shiftStart ? ' · on since ' + esc(fmt.time(hm(c.shiftStart))) : '') + '</p>' +
              (c.line.length ? '<ol class="cx-mini">' + c.line.map(function (o) { const ds = entryDocs(o.id); const d = ds.length > 1 ? { name: groupName(ds) + ' · ' + ds.length + ' orders', total: ds.reduce(function (a, x) { return a + (+x.total || 0); }, 0), items: [] } : (ds[0] || order(o.id) || { name: 'Order', items: [], total: 0 }); const h = headingTo(c);
                return '<li' + (h && h.orderId === o.id ? ' class="is-going"' : '') + '><span>' + esc(nodeLabel(h && h.orderId === o.id ? h.node : D.whereIs(o, now))) + '</span><span>' + esc(d.name) + (isVisit(d) ? ' <span class="cx-tag">Cart visit</span>' : '') + '</span><span class="num">' + esc(isVisit(d) ? 'Visit' : fmt.money(d.total)) + '</span></li>'; }).join('') + '</ol>'
                : '<p class="cx-quiet">No orders in line.</p>') + '</div></article>';
          }).join('') : '<div class="panel">' + ui.empty({ icon: 'cart', title: 'No carts on shift', text: 'Golfers see “Cart service is closed right now”. Start a shift from the My cart tab.' }) + '</div>') +
        '</section>' +
      '</div>' +
      '<section class="panel cx-orders" aria-labelledby="cx-ord-h"><div class="panel-head"><h3 id="cx-ord-h">Today’s orders</h3><span class="muted">' + plural(td.length, 'order') + '</span></div>' +
        (td.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Golfer</th><th>Items</th><th>Where</th><th>Payment</th><th class="num">Total</th><th>Status</th><th><span class="cx-sr">Actions</span></th></tr></thead><tbody>' +
          td.map(function (o) {
            const st = o.status === 'open' ? (function () { const g = golferStatus(o.id); return g && g.state === 'heading' ? ui.badge('Cart on the way', 'good') : ui.badge((g && g.place ? ordinal(g.place) + ' in line' : 'Waiting') + (o.cartId ? ', cart ' + o.cartId : ''), 'info'); })()
              : o.status === 'delivered' ? ui.badge('Delivered ' + fmt.time(hm(Date.parse(o.deliveredAt))), 'plain') : ui.badge('Cancelled', 'bad');
            return '<tr><td class="nowrap">' + esc(fmt.time(hm(o.placedAt))) + '</td><td class="primary-cell">' + esc(o.name) + (o.golferType === 'public' ? ' <span class="muted">(public)</span>' : '') + '</td><td>' + esc(label(o)) + '</td>' +
              '<td class="nowrap">' + esc(o.status === 'delivered' ? nodeLabel(o.foundAt || String(o.hole)) : 'Hole ' + o.hole) + '</td>' +
              '<td class="nowrap">' + (o.paidWith ? 'Paid by ' + esc(o.paidWith) : o.payment === 'account' ? (o.status === 'delivered' && !o.chargeId && isVisit(o) ? 'Nothing charged' : 'Member account') : 'Pay at the cart') + '</td><td class="num">' + esc(isVisit(o) && o.status !== 'delivered' ? 'Visit' : fmt.money(o.total)) + '</td><td>' + st + '</td>' +
              '<td class="right">' + (o.status === 'open' ? '<button type="button" class="s-link" data-cancel="' + esc(o.id) + '">Cancel</button>'
                : o.status === 'delivered' && receiptFor(o) ? '<button type="button" class="s-link" data-rcpt="' + esc(o.id) + '" aria-label="Receipt for ' + esc(o.name) + '">Receipt</button>' : '') + '</td></tr>';
          }).join('') + '</tbody><tfoot><tr><td colspan="5">Delivered total</td><td class="num">' + esc(fmt.money(sum(done))) + '</td><td colspan="2"></td></tr></tfoot></table></div>'
          : '<div class="panel-body">' + ui.empty({ icon: 'cart', title: 'No orders yet today', text: 'Orders from members and public golfers appear here as they come in.' }) + '</div>') +
      '</section></div>';
    DR.wire(panel, DRILLS, function () { return 'Beverage cart · ' + fmt.dateLong(today()); });
    ui.on(panel, 'click', '[data-rcpt]', function (e, b) { const r = receiptFor(order(b.dataset.rcpt)); if (r) Club.receipts.open(r); });
    ui.on(panel, 'click', '[data-cancel]', function (e, b) {
      const d = order(b.dataset.cancel); if (!d) return;
      ui.confirm({ title: isVisit(d) ? 'Cancel this cart visit?' : 'Cancel this order?', text: d.name + '’s ' + (isVisit(d) ? 'cart visit' : 'order (' + itemsText(d.items) + ')') + ' will be cancelled and the golfer told. Nothing is charged.', confirmLabel: 'Cancel order', danger: true })
        .then(function (ok) {
          if (!ok) return;
          const rec = Club.undo.track(function () { return cancelByStaff(d.id); }), r = rec.result;
          if (r.ok) offerFleetUndo(d.name + '’s ' + (isVisit(d) ? 'cart visit' : 'order') + ' cancelled', rec, { after: rerender, undone: d.name + '’s ' + (isVisit(d) ? 'cart visit' : 'order') + ' is open again' });
          else ui.toast(r.error, 'bad');
          rerender();
        });
    });
  }
  function ordinal(n) { return D.ordinal(n); }

  /* ---------- Menu editor ---------- */
  function renderMenu(panel, rerender) {
    const items = menu();
    panel.innerHTML = '<div class="cx-menu">' +
      '<div class="cx-menu-head"><p class="muted">Placeholder menu: confirm items and prices with the club. Golfers see changes straight away; sold out items can’t be ordered.</p>' + ui.btn('Add item', { kind: 'primary', icon: 'plus', action: 'add-item' }) + '</div>' +
      /* Every category shows, empty ones too, each with Remove category (refused while it has items). */
      categories().map(function (cat, ci) {
        const list = items.filter(function (m) { return m.category === cat; });
        return '<section class="cx-menu-sec" aria-labelledby="cx-mc-' + ci + '"><div class="cx-sec-head"><h2 class="cx-h" id="cx-mc-' + ci + '">' + esc(cat) + '</h2>' +
          '<button type="button" class="btn btn-ghost btn-sm cx-rmcat" data-rmcat="' + esc(cat) + '" aria-label="Remove the ' + esc(cat) + ' category">' + Club.icon('trash') + '<span>Remove category</span></button></div>' +
          (list.length ? '<ul class="s-list">' + list.map(function (m) {
            return '<li class="' + (m.soldOut ? 'is-out' : '') + '"><span class="cx-line-main"><span class="cx-line-t">' + esc(m.name) + (m.alcohol ? ' <span class="badge plain">Alcohol</span>' : '') + '</span>' +
              '<span class="cx-line-s">' + esc((m.size ? m.size + ' · ' : '') + fmt.money(m.price)) + (m.soldOut ? ' · Sold out' : '') + '</span></span>' +
              '<label class="cx-sold"><span>Sold out</span><span class="toggle"><input type="checkbox" data-sold="' + esc(m.id) + '"' + (m.soldOut ? ' checked' : '') + ' aria-label="' + esc(m.name) + ' sold out"><span></span></span></label>' +
              '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-edit="' + esc(m.id) + '" aria-label="Edit ' + esc(m.name) + '">' + Club.icon('edit') + '</button>' +
              '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="' + esc(m.id) + '" aria-label="Remove ' + esc(m.name) + '">' + Club.icon('trash') + '</button></li>';
          }).join('') + '</ul>' : '<p class="cx-quiet">No items in this category.</p>') + '</section>';
      }).join('') + '</div>';
    ui.on(panel, 'change', '[data-sold]', function (e, inp) {
      const m = S.find('cartMenu', inp.dataset.sold); if (!m) return;
      Club.undo.run(function () { S.update('cartMenu', m.id, { soldOut: inp.checked }); }, { message: m.name + (inp.checked ? ' marked sold out' : ' back on the menu'), after: rerender, undone: m.name + (inp.checked ? ' back on the menu' : ' marked sold out again') });
      rerender();
    });
    ui.on(panel, 'click', '[data-action=add-item]', function () { editItem(null, rerender); });
    ui.on(panel, 'click', '[data-rmcat]', function (e, b) {
      const cat = b.dataset.rmcat, inCat = S.all('cartMenu').filter(function (m) { return m.category === cat; });
      if (inCat.length) {
        const names = inCat.map(function (m) { return m.name; }), shown = names.slice(0, 5).join(', ') + (names.length > 5 ? ' and ' + (names.length - 5) + ' more' : '');
        ui.modal({ eyebrow: 'Beverage cart menu', title: cat + ' can’t be removed yet',
          body: '<p>It still has ' + plural(inCat.length, 'item') + ' on the menu: ' + esc(shown) + '.</p><p class="muted">Move them to another category (edit each item and pick a new category) or remove them, then remove the category.</p>',
          actions: [{ label: 'OK', kind: 'primary' }] });
        return;
      }
      if (categories().length <= 1) { ui.modal({ eyebrow: 'Beverage cart menu', title: 'Keep at least one category', body: '<p>' + esc(cat) + ' is the only category left, so the menu needs it.</p>', actions: [{ label: 'OK', kind: 'primary' }] }); return; }
      ui.confirm({ title: 'Remove the ' + cat + ' category?', text: 'It has no items, so golfers won’t notice a change. You can add it back any time with New category.', confirmLabel: 'Remove category', danger: true })
        .then(function (ok) {
          if (!ok) return;
          const rec = Club.undo.track(function () { return removeCategory(cat); }), r = rec.result;
          if (!r.ok) { ui.toast(r.error === 'has-items' ? cat + ' has items again, so it was kept' : 'Keep at least one category', 'bad'); rerender(); return; }
          Club.undo.offer(cat + ' category removed', rec, { after: rerender, undone: cat + ' category is back' });
          rerender();
        });
    });
    ui.on(panel, 'click', '[data-edit]', function (e, b) { editItem(S.find('cartMenu', b.dataset.edit), rerender); });
    ui.on(panel, 'click', '[data-remove]', function (e, b) {
      const m = S.find('cartMenu', b.dataset.remove); if (!m) return;
      ui.confirm({ title: 'Remove ' + m.name + '?', text: 'It comes off the golfers’ menu. Orders already placed keep it.', confirmLabel: 'Remove item', danger: true })
        .then(function (ok) { if (!ok) return; Club.undo.run(function () { S.remove('cartMenu', m.id); }, { message: m.name + ' removed', after: rerender, undone: m.name + ' is back on the menu' }); rerender(); });
    });
  }
  function editItem(m, rerender) {
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Name', name: 'name', value: m ? m.name : '', required: true, span2: true, placeholder: 'e.g. Iced tea' }) +
      ui.field({ label: 'Size (optional)', name: 'size', value: m ? m.size || '' : '', span2: true, placeholder: 'e.g. Tall can', hint: 'Shown under the name' }) +
      '<div class="field span-2"><span class="cx-cat-lab" id="cx-cat-l">Category</span><div class="cx-cats" role="radiogroup" aria-labelledby="cx-cat-l">' +
        categories().map(function (c) { const on = c === (m ? m.category : categories()[0]); return '<button type="button" role="radio" class="cx-cat-chip' + (on ? ' active' : '') + '" aria-checked="' + on + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
        '<button type="button" role="radio" class="cx-cat-chip cx-cat-new" aria-checked="false" data-cat="">' + Club.icon('plus') + '<span>New category</span></button></div>' +
        '<div class="cx-cat-newf" hidden>' + ui.field({ label: 'New category name', name: 'newCategory', placeholder: 'e.g. Ice cream' }) + '</div></div>' +
      ui.field({ label: 'Price', name: 'price', type: 'number', value: m ? m.price : '', required: true, min: 0, step: 0.05, hint: 'Tax included' }) +
      '<label class="check span-2"><input type="checkbox" name="alcohol"' + (m && m.alcohol ? ' checked' : '') + '> Contains alcohol (golfers see “ID may be checked”)</label>' +
      '<label class="check span-2"><input type="checkbox" name="soldOut"' + (m && m.soldOut ? ' checked' : '') + '> Sold out</label></form>';
    let cat = m ? m.category : categories()[0], isNew = false;
    const modal = ui.modal({ eyebrow: 'Beverage cart menu', title: m ? 'Edit item' : 'Add item', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: m ? 'Save item' : 'Add item', kind: 'primary', onClick: function (api) {
        const form = ui.$('form', api.body);
        if (!ui.validate(form)) return false;
        const v = ui.formData(form), price = r2(parseFloat(v.price));
        if (!(price >= 0) || price > 500) { const p = ui.$('[name=price]', form); p.classList.add('invalid'); p.insertAdjacentHTML('afterend', '<span class="field-error">Enter a price from $0 to $500.</span>'); return false; }
        const rec = Club.undo.track(function () {
        let category = cat;
        if (isNew) {
          const nf = ui.$('[name=newCategory]', form), nv = String(nf.value || '').replace(/\s+/g, ' ').trim();
          ui.$$('.cx-cat-newf .field-error', form).forEach(function (e) { e.remove(); }); nf.classList.remove('invalid');
          if (!nv || nv.length > 30) { nf.classList.add('invalid'); nf.insertAdjacentHTML('afterend', '<span class="field-error">' + (nv ? 'Keep it to 30 characters.' : 'Name the new category.') + '</span>'); nf.focus(); return false; }
          category = ensureCategory(nv);
        }
        const doc = { name: String(v.name).trim().slice(0, 60), size: String(v.size || '').trim().slice(0, 30), category: category, price: price, alcohol: !!ui.$('[name=alcohol]', form).checked, soldOut: !!ui.$('[name=soldOut]', form).checked };
        if (m) S.update('cartMenu', m.id, doc); else S.insert('cartMenu', Object.assign({ id: S.uid('cm'), order: 100 + S.all('cartMenu').length }, doc));
        return true;
        });
        if (rec.result !== true) return false;
        Club.undo.offer(m ? 'Item saved' : 'Item added', rec, { after: rerender, undone: m ? 'Changes to ' + m.name + ' undone' : 'Item taken off the menu' });
        rerender();
      } }
    ] });
    if (modal.duplicate) return;
    /* Category chips: one is chosen; "New category" opens a name field. */
    ui.on(modal.body, 'click', '.cx-cat-chip', function (e, chip) {
      isNew = chip.classList.contains('cx-cat-new');
      if (!isNew) cat = chip.dataset.cat;
      ui.$$('.cx-cat-chip', modal.body).forEach(function (c) { const on = c === chip; c.classList.toggle('active', on); c.setAttribute('aria-checked', on); });
      const nf = ui.$('.cx-cat-newf', modal.body); nf.hidden = !isNew;
      if (isNew) ui.$('[name=newCategory]', nf).focus();
    });
    ui.on(modal.body, 'input', '[name=newCategory]', function (e, inp) { inp.classList.remove('invalid'); ui.$$('.cx-cat-newf .field-error', modal.body).forEach(function (x) { x.remove(); }); });
  }

  /* ---------- Registration ---------- */
  let tabState = null;
  Club.register({
    id: 'cart', label: 'Beverage cart', icon: 'cart', section: 'Hospitality', order: 25,
    badge: function () { const n = fleet().carts.reduce(function (a, c) { return a + c.line.length; }, 0); return n || null; },
    search: function (q) {
      return todays().filter(function (o) { return (o.name + ' ' + itemsText(o.items)).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (o) { return { label: o.name + (isVisit(o) ? ', cart visit' : ', cart order'), sub: label(o) + ' · ' + fmt.money(o.total), href: 'cart/clubhouse', icon: 'cart' }; });
    },
    render: function (view, params) {
      const tabs = ['mine', 'clubhouse', 'menu'];
      const tab = tabs.indexOf(params[0]) >= 0 ? params[0] : (tabState || (wide() ? 'clubhouse' : 'mine'));
      view.classList.add('cx-page');
      view.innerHTML = ui.pageHeader({ eyebrow: 'Hospitality', title: 'Beverage cart', subtitle: esc(banner()) }) + '<div class="cx-tabs"></div>';
      let active = tab, panel = null;
      const renders = { mine: renderMine, clubhouse: renderClubhouse, menu: renderMenu };
      function rerender() {
        if (!panel || !document.body.contains(panel)) return;
        const sub = ui.$('.page-head .subtitle', view); if (sub) sub.textContent = banner();
        const fresh = panel.cloneNode(false); panel.replaceWith(fresh); panel = fresh;
        renders[active](panel, rerender);
        /* A refresh shows the new content at once: the fade-in and count-up only play when the tab opens (ui.tabs),
           and without this the stat tiles (data-reveal) stayed invisible after the first refresh. */
        ui.$$('[data-reveal]', panel).forEach(function (n) { n.classList.add('revealed'); });
        ui.$$('[data-count]', panel).forEach(function (n) {
          const dec = +(n.dataset.decimals || 0);
          n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        });
      }
      ui.tabs(ui.$('.cx-tabs', view), [
        { id: 'mine', label: 'My cart', render: function (p) { panel = p; renderMine(p, rerender); } },
        { id: 'clubhouse', label: 'Clubhouse', render: function (p) { panel = p; renderClubhouse(p, rerender); } },
        { id: 'menu', label: 'Menu', render: function (p) { panel = p; renderMenu(p, rerender); } }
      ], tab, function (id) { active = id; tabState = id; try { history.replaceState(null, '', '#/cart/' + id); } catch (e) { /* file:// */ } });
      /* Changes made in this tab re-render the panel; another tab's changes re-render the page (app router). */
      const off = Club.cart.onChange(function () { clearTimeout(t1); t1 = setTimeout(function () { if (!document.body.classList.contains('ps-open') && !document.querySelector('.overlay')) rerender(); }, 80); });
      let t1 = null;
      /* Groups keep moving: refresh positions and countdowns every 30 seconds. */
      const tick = setInterval(function () { if (!document.body.classList.contains('ps-open') && !document.querySelector('.overlay') && active !== 'menu') rerender(); }, 30000);
      return function () { off(); clearInterval(tick); clearTimeout(t1); };
    }
  });
})();
