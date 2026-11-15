/* Members' portal: the online golf shop (#/shop). Order from the golf shop and pick it up at the clubhouse; charge it to
   the member account or pay by card (or a gift card). Members pay the same prices as in the shop (no promo codes, no
   member discount online). The shop itself is shared with the public site (Club.shop.mount in js/core/shop.js). */
(function () {
  'use strict';
  if (!window.Portal || !Club.shop) return;
  const ui = Club.ui, SH = Club.shop;
  let lastSub = null;

  function render(view, params, member) {
    const m = Portal.member() || member;
    const sub = (params || []).join('/');
    if (lastSub !== null && sub !== lastSub) window.scrollTo({ top: 0 });
    lastSub = sub;
    const browse = !params[0];
    view.innerHTML = '<section class="p-hero sh-hero" data-reveal><h1>Golf shop</h1>' +
      (browse ? '<p>Order from the golf shop and pick it up at the clubhouse. Charge it to your account or pay by card.</p>' : '') + '</section><div class="sh-host"></div>';
    return SH.mount(ui.$('.sh-host', view), { site: 'portal', who: 'mem_' + m.id, params: params || [], bar: Portal.actionBar, member: m,
      account: m.status !== 'suspended' && m.status !== 'resigned', promo: false,
      customer: { memberId: m.id, name: m.firstName + ' ' + m.lastName, phone: m.phone || '', email: m.email || '' },
      orders: function () { return SH.forMember(m.id); }, owns: function (o) { return o.customer && o.customer.memberId === m.id; } });
  }

  Portal.register({ id: 'shop', label: 'Shop', short: 'Shop', icon: 'shop', order: 24, tab: false, render: render });
})();
