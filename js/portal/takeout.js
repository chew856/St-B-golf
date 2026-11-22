/* Members' portal: Takeout from the Gallery Taphouse & Grill. Order for pickup, charge it to the member account or pay by
   card (or a gift card), and follow the order as the kitchen marks it ready. The ordering view and the order cards are
   shared with the public site (Club.takeout in js/core/takeout.js). */
(function () {
  'use strict';
  if (!window.Portal || !Club.takeout) return;
  const S = Club.store, U = Club.ui, esc = U.esc, T = Club.takeout;
  let lastTab = 'order', placed = null;

  function render(view, params, member) {
    const m = Portal.member() || member;
    let stopOrder = null, tabs = null;
    const startTab = params[0] === 'orders' ? 'orders' : lastTab;
    /* Redesign (Nov 22): a title and one quiet line, the two sections as words; the menu, the order and the order
       cards are restyled for the portal in css/portal/takeout.css (a printed menu list, hairline rows, serif prices). */
    const BAR = Portal.inkBar || Portal.actionBar;
    view.innerHTML = '<header class="pt-hero"><h1 class="pg-title">Takeout</h1><p class="pg-sub">Order from the Gallery menu and pick up at the clubhouse. Charge it to your account or pay by card.</p></header><div class="pt-tabs"></div>';

    function mine() { return T.forMember(m.id); }
    function activeHTML() {
      const list = mine().filter(function (o) { return T.active(o) && o.id !== placed; }).slice(0, 3);
      return list.length ? '<section class="to-mine-sec"><div class="to-mine-h"><h2>On the way</h2><button type="button" class="p-link" data-pt="orders">All orders</button></div><div class="to-cards">' + list.map(function (o) { return T.orderCardHTML(o, { site: 'portal' }); }).join('') + '</div></section>' : '';
    }
    function drawOrder(panel) {
      lastTab = 'order';
      if (stopOrder) { stopOrder(); stopOrder = null; }
      let o = placed ? T.get(placed) : null;
      if (o && o.customer.memberId !== m.id) { placed = null; o = null; }
      panel.innerHTML = '<div class="pt-active">' + activeHTML() + '</div><div class="pt-host"></div>';
      const host = U.$('.pt-host', panel);
      if (o) { host.innerHTML = '<div class="to-done-wrap">' + T.confirmHTML(o) + '</div>'; return; }
      stopOrder = T.mountOrder(host, { site: 'portal', key: 'mem_' + m.id, bar: BAR, member: m, account: true,
        customer: { kind: 'member', memberId: m.id, name: m.firstName + ' ' + m.lastName, phone: m.phone || '', email: m.email || '' },
        onPlaced: function (order) { placed = order.id; tabs.activate('order'); paintCount(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    }
    function drawOrders(panel) {
      lastTab = 'orders';
      if (stopOrder) { stopOrder(); stopOrder = null; }
      BAR.hide();
      const list = mine();
      const act = list.filter(T.active), past = list.filter(function (o) { return !T.active(o); }).slice(0, 15);
      panel.innerHTML = list.length
        ? (act.length ? '<section class="to-mine-sec"><h2 class="pt-h">Current</h2><div class="to-cards">' + act.map(function (o) { return T.orderCardHTML(o, { site: 'portal' }); }).join('') + '</div></section>' : '') +
          (past.length ? '<section class="to-mine-sec"><h2 class="pt-h">Past orders</h2><div class="to-cards">' + past.map(function (o) { return T.orderCardHTML(o, { site: 'portal' }); }).join('') + '</div></section>' : '')
        : '<div class="pt-blank"><p class="pt-blank-t">No takeout orders yet</p><p class="pg-quiet">Order from the Gallery menu and pick it up at the clubhouse.</p><button type="button" class="p-link" data-action="pt-order">Order takeout</button></div>';
    }
    function paintCount() {
      const tab = U.$('.pt-tabs .tab[data-tab="orders"]', view); if (!tab) return;
      const n = mine().filter(T.active).length; let c = U.$('.pt-tab-n', tab);
      if (!n) { if (c) c.remove(); }
      else { if (!c) { c = document.createElement('span'); c.className = 'pt-tab-n'; tab.appendChild(c); } c.textContent = String(n); c.setAttribute('aria-label', n + ' current'); }
      const a = U.$('.pt-tabs .tab.active', view), ink = U.$('.pt-tabs .tab-ink', view);
      if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = 'translateX(' + a.offsetLeft + 'px)'; }
    }
    tabs = U.tabs(U.$('.pt-tabs', view), [
      { id: 'order', label: 'Order', render: drawOrder },
      { id: 'orders', label: 'My orders', render: drawOrders }
    ], startTab);
    paintCount();
    T.wireCards(view, function () { refresh(); });
    U.on(view, 'click', '[data-pt=orders]', function () { tabs.activate('orders'); });
    U.on(view, 'click', '[data-action=pt-order]', function () { tabs.activate('order'); });
    U.on(view, 'click', '[data-to-again]', function () { placed = null; tabs.activate('order'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    /* Status changes from the kitchen (staff system, another tab) and cancellations update the lists in place. */
    function refresh() {
      paintCount();
      if (document.querySelector('.overlay') || document.body.classList.contains('ps-open')) return;
      if (lastTab === 'orders') { const p = U.$('.pt-tabs .tab-panel', view); if (p) drawOrders(p); }
      else { const a = U.$('.pt-active', view); if (a) a.innerHTML = activeHTML(); if (placed && !U.$('.to-wrap', view)) { const h = U.$('.pt-host', view); const o = T.get(placed); if (h && o) h.innerHTML = '<div class="to-done-wrap">' + T.confirmHTML(o) + '</div>'; } }
    }
    const off = S.subscribe(T.COLL, function () { setTimeout(refresh, 0); });
    return function () { off(); if (stopOrder) stopOrder(); if (BAR.release) BAR.release(); };
  }

  Portal.register({ id: 'takeout', label: 'Takeout', short: 'Takeout', icon: 'dining', order: 22, tab: false, render: render });
})();
