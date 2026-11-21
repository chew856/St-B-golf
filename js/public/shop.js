/* Public site: the online golf shop (#/shop), for signed-in public golfers and guests (name, phone, email). Card payment,
   a gift card and promo codes; pickup at the golf shop only. The shop itself is shared with the portal (Club.shop.mount in
   js/core/shop.js); this file adds the page, the guest's orders on this device and a My account section. */
(function () {
  'use strict';
  if (!window.Pub || !Club.shop) return;
  const S = Club.store, ui = Club.ui, esc = ui.esc, SH = Club.shop;
  const GUEST_KEY = 'stboniface.shop.guest';     /* order ids placed as a guest on this device, newest first */

  function guestIds() { try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]') || []; } catch (e) { return []; } }
  function addGuestId(id) { try { localStorage.setItem(GUEST_KEY, JSON.stringify([id].concat(guestIds().filter(function (x) { return x !== id; })).slice(0, 20))); } catch (e) { /* private mode */ } }
  function myOrders(p) { return p ? SH.forPublic(p.id) : SH.byIds(guestIds()).filter(function (o) { return o.customer && !o.customer.publicPlayerId && !o.customer.memberId; }); }
  function owns(o) { const p = Pub.me(); return p ? o.customer.publicPlayerId === p.id : !o.customer.publicPlayerId && !o.customer.memberId && guestIds().indexOf(o.id) >= 0; }

  /* Sticky bar on phones (the public site has no Portal.actionBar). */
  let barEl = null;
  const bar = {
    show: function (o) {
      if (!barEl) { barEl = ui.el('<div class="sh-pbar" role="region" aria-label="Your basket"><div class="sh-pbar-in"><span class="sh-pbar-sum"></span><button type="button" class="btn btn-primary sh-pbar-btn"></button></div></div>'); document.body.appendChild(barEl); }
      ui.$('.sh-pbar-sum', barEl).textContent = o.summary || '';
      const b = ui.$('.sh-pbar-btn', barEl); b.textContent = o.label || 'View basket'; b.onclick = function () { if (o.onClick) o.onClick(); };
      document.body.classList.add('sh-has-bar');
      if (Club.i18n) Club.i18n.translate(barEl);
      requestAnimationFrame(function () { if (barEl && document.body.classList.contains('sh-has-bar')) barEl.classList.add('open'); });
    },
    hide: function () { if (barEl) barEl.classList.remove('open'); document.body.classList.remove('sh-has-bar'); }
  };

  let lastSub = null;
  Pub.register({
    id: 'shop', label: 'Shop', title: 'Golf shop', nav: { label: 'Shop', order: 25, icon: 'shop' },
    render: function (view, params, p) {
      const sub = (params || []).join('/');
      if (lastSub !== null && sub !== lastSub) window.scrollTo({ top: 0 });
      lastSub = sub;
      const browse = !params[0];
      view.innerHTML = '<section class="pub-page-head sh-head" data-reveal><div class="eyebrow">' + esc(Club.info.short) + ' golf shop</div><h1>Shop online</h1>' +
        (browse ? '<p>Order online, pick up at the golf shop.</p>' : '') + '</section><div class="sh-host"></div>';
      const stop = SH.mount(ui.$('.sh-host', view), { site: 'public', who: p ? 'pp_' + p.id : 'guest', params: params || [], bar: bar, player: p, account: false, promo: true,
        customer: p ? { publicPlayerId: p.id, name: p.firstName + ' ' + p.lastName, phone: p.phone || '', email: p.email || '' } : null,
        orders: function () { return myOrders(Pub.me()); }, owns: owns,
        onPlaced: function (order) { if (!Pub.me()) addGuestId(order.id); } });
      return function () { stop(); bar.hide(); };
    }
  });

  /* ---------------- My account: golf shop orders ---------------- */
  Pub.addAccountSection({
    order: 25, side: true,   /* right column of My account, to balance the two columns */
    html: function (p) {
      const list = SH.forPublic(p.id).slice(0, 4);
      return '<section class="panel sh-acc" data-reveal aria-labelledby="sh-acc-h"><div class="panel-head"><div><div class="eyebrow">Golf shop</div><h3 id="sh-acc-h">Online shop orders</h3></div>' +
        (list.length ? '<a class="pub-link" href="#/shop/orders">All orders</a>' : Club.icon('shop', 'pub-head-icon')) + '</div>' +
        '<div class="panel-body">' + (list.length ? '<div class="sh-ocards">' + list.map(function (o) { return SH.orderCardHTML(o, { site: 'public', view: true }); }).join('') + '</div>'
          : ui.empty({ icon: 'shop', title: 'No online shop orders yet', text: 'Order golf balls, apparel and accessories online, and pick them up at the golf shop.', action: '<a class="btn btn-sm" href="#/shop">Shop online</a>' })) + '</div></section>';
    },
    wire: function (root, p, redraw) {
      const sec = ui.$('.sh-acc', root); if (!sec || sec.dataset.wired) return;
      sec.dataset.wired = '1';
      SH.wireCards(sec, redraw);
    }
  });
})();
