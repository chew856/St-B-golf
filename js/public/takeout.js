/* Public site: Takeout from the Gallery Taphouse & Grill, for signed-in public golfers and guests (name, phone, email).
   Card payment, or a gift card. The ordering view and order cards are shared with the portal (Club.takeout in
   js/core/takeout.js); this file adds the page, the guest's orders on this device, and a My account section. */
(function () {
  'use strict';
  if (!window.Pub || !Club.takeout) return;
  const S = Club.store, ui = Club.ui, esc = ui.esc, T = Club.takeout;
  const GUEST_KEY = 'stboniface.takeout.guest';     /* order ids placed as a guest on this device, newest first */

  function guestIds() { try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]') || []; } catch (e) { return []; } }
  function addGuestId(id) { try { localStorage.setItem(GUEST_KEY, JSON.stringify([id].concat(guestIds().filter(function (x) { return x !== id; })).slice(0, 12))); } catch (e) { /* private mode */ } }
  function myOrders(p) { return p ? T.forPublic(p.id) : T.byIds(guestIds()).filter(function (o) { return o.customer && o.customer.kind === 'guest'; }); }

  /* Sticky bar on phones (the public site has no Portal.actionBar). */
  let barEl = null;
  const bar = {
    show: function (o) {
      if (!barEl) { barEl = ui.el('<div class="to-pbar" role="region" aria-label="Your order"><div class="to-pbar-in"><span class="to-pbar-sum"></span><button type="button" class="btn btn-primary to-pbar-btn"></button></div></div>'); document.body.appendChild(barEl); }
      ui.$('.to-pbar-sum', barEl).textContent = o.summary || '';
      const b = ui.$('.to-pbar-btn', barEl); b.textContent = o.label || 'View order'; b.onclick = function () { if (o.onClick) o.onClick(); };
      document.body.classList.add('to-has-bar');
      requestAnimationFrame(function () { if (barEl && document.body.classList.contains('to-has-bar')) barEl.classList.add('open'); });
    },
    hide: function () { if (barEl) barEl.classList.remove('open'); document.body.classList.remove('to-has-bar'); }
  };

  let placed = null;     /* the order just placed, shown as the confirmation until "Order something else" */
  /** The order belongs to whoever is using the site now (not a golfer who has since signed out). */
  function mineNow(o) { const me = Pub.me(); return me ? o.customer.publicPlayerId === me.id : o.customer.kind === 'guest' && guestIds().indexOf(o.id) >= 0; }

  Pub.register({
    id: 'takeout', label: 'Takeout', title: 'Takeout', nav: { label: 'Takeout', order: 20, icon: 'dining' },
    render: function (view, params, p) {
      let stopOrder = null;
      view.innerHTML = '<section class="pub-page-head" data-reveal><div class="eyebrow">Gallery Taphouse &amp; Grill</div><h1>Takeout</h1>' +
        '<p>Order online, pick up at the clubhouse. Friday Night Pizza is Fridays only.</p></section>' +
        '<div class="to-mine" aria-live="polite"></div><div class="to-host"></div>';
      const mine = ui.$('.to-mine', view), host = ui.$('.to-host', view);

      function drawMine() {
        const me = Pub.me();
        const list = myOrders(me).filter(function (o) { return T.active(o) || (o.id === placed); }).slice(0, 4);
        const shown = list.filter(function (o) { return o.id !== placed; });
        mine.innerHTML = shown.length ? '<section class="to-mine-sec" data-reveal><div class="to-mine-h"><h2>Your orders</h2>' + (me ? '<a class="pub-link" href="#/account">All orders</a>' : '') + '</div><div class="to-cards">' + shown.map(function (o) { return T.orderCardHTML(o, { site: 'public' }); }).join('') + '</div></section>' : '';
        ui.$$('[data-reveal]', mine).forEach(function (n) { n.classList.add('revealed'); });
      }
      function drawMain() {
        if (stopOrder) { stopOrder(); stopOrder = null; }
        const o = placed ? T.get(placed) : null;
        if (o && !mineNow(o)) placed = null;
        if (o && placed) { host.innerHTML = '<div class="to-done-wrap">' + T.confirmHTML(o) + '</div>'; ui.$$('[data-reveal]', host).forEach(function (n) { n.classList.add('revealed'); }); return; }
        const me = Pub.me();
        stopOrder = T.mountOrder(host, { site: 'public', key: me ? 'pub_' + me.id : 'guest', bar: bar, player: me, account: false,
          customer: me ? { kind: 'public', publicPlayerId: me.id, name: me.firstName + ' ' + me.lastName, phone: me.phone || '', email: me.email || '' } : null,
          onPlaced: function (order) {
            if (!me) addGuestId(order.id);
            placed = order.id; drawMain(); drawMine(); window.scrollTo({ top: 0, behavior: 'smooth' });
          } });
      }
      T.wireCards(view, function () { drawMine(); if (placed) drawMain(); });
      ui.on(view, 'click', '[data-to-again]', function () { placed = null; drawMain(); drawMine(); ui.animateIn(host); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      /* The kitchen marks orders ready in the staff system (another tab): status updates here as it happens. */
      const off = S.subscribe(T.COLL, function () { if (document.querySelector('.overlay')) return; drawMine(); if (placed && !ui.$('.to-wrap', host)) drawMain(); });
      drawMine(); drawMain();
      return function () { off(); if (stopOrder) stopOrder(); bar.hide(); };
    }
  });

  /* ---------------- My account: takeout orders ---------------- */
  Pub.addAccountSection({
    order: 20,
    html: function (p) {
      const list = T.forPublic(p.id).slice(0, 5);
      return '<section class="panel to-acc" data-reveal aria-labelledby="to-acc-h"><div class="panel-head"><div><div class="eyebrow">Gallery Taphouse &amp; Grill</div><h3 id="to-acc-h">Takeout orders</h3></div>' + Club.icon('dining', 'pub-head-icon') + '</div>' +
        '<div class="panel-body">' + (list.length ? '<div class="to-cards">' + list.map(function (o) { return T.orderCardHTML(o, { site: 'public' }); }).join('') + '</div>'
          : ui.empty({ icon: 'dining', title: 'No takeout orders yet', text: 'Order from the Gallery menu and pick up at the clubhouse.', action: '<a class="btn btn-sm" href="#/takeout">Order takeout</a>' })) + '</div></section>';
    },
    wire: function (root, p, redraw) {
      const sec = ui.$('.to-acc', root); if (!sec || sec.dataset.wired) return;
      sec.dataset.wired = '1';
      T.wireCards(sec, redraw);
    }
  });
})();
