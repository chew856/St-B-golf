/* Staff: the Gallery's takeout queue, built for a phone or tablet at the pass. Orders placed in the members' portal and on
   the public site (Club.takeout, js/core/takeout.js) by pickup time: New, Ready, Picked up, Cancelled. Marking an order
   ready or picked up shows on the customer's side straight away; cancelling refunds it (account credit, card refund or
   gift card) with a credit receipt. Pickup hours are placeholders in $takeoutSettings, editable here.
   Every staff change offers Undo on its toast (Club.undo, js/core/undo.js); a card refund has none, since the money has left.
   The whole card opens a details drawer (customer, items, totals, payment, timeline from history, actions); picked-up
   orders keep Back to ready and ready orders Back to new as permanent steps back. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, T = Club.takeout;
  if (!T) return;
  const TABS = [['new', 'New'], ['ready', 'Ready'], ['picked-up', 'Picked up'], ['cancelled', 'Cancelled']];
  const state = { status: 'new', date: null };

  function today() { return Club.date.today(); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function staffName() { return Club.user ? Club.user.firstName + ' ' + Club.user.lastName : 'staff'; }
  function ago(iso) { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago'; }
  function onDay(d) { return S.all(T.COLL).filter(function (o) { return o.date === d; }); }
  function dayLabel(d) { return d === today() ? 'Today' : d === Club.date.addDays(today(), 1) ? 'Tomorrow' : fmt.toDate(d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dueClass(o) {
    if (o.status !== 'new' || o.date !== today()) return '';
    const m = T.minutesUntil(o); return m < 0 ? ' is-late' : m <= 20 ? ' is-soon' : '';
  }
  function times(from, to, step) { const out = []; for (let m = from; m <= to; m += step) out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); return out; }

  const LABEL = { new: 'New', ready: 'Ready', 'picked-up': 'Picked up', cancelled: 'Cancelled' };
  /** The buttons an order offers, on its card and in its drawer: the next step, the step back, receipts and cancel. */
  function actsHTML(o) {
    const rc = T.receiptOf(o), rf = T.refundReceiptOf(o), id = esc(o.id);
    const acts = o.status === 'new' ? '<button type="button" class="btn btn-primary tq-go" data-tq="ready" data-id="' + id + '">' + Club.icon('check') + '<span>Mark ready</span></button>'
      : o.status === 'ready' ? '<button type="button" class="btn btn-primary tq-go" data-tq="picked-up" data-id="' + id + '">' + Club.icon('check') + '<span>Picked up</span></button><button type="button" class="btn btn-ghost btn-sm" data-tq="new" data-id="' + id + '">Back to new</button>'
      : o.status === 'picked-up' ? '<button type="button" class="btn btn-ghost btn-sm" data-tq="ready" data-id="' + id + '">Back to ready</button>' : '';
    return acts +
      (rc ? '<button type="button" class="btn btn-ghost btn-sm" data-tq-rc="' + esc(rc.id) + '">' + Club.icon('billing') + '<span>Receipt</span></button>' : '') +
      (rf ? '<button type="button" class="btn btn-ghost btn-sm" data-tq-rc="' + esc(rf.id) + '">Refund receipt</button>' : '') +
      (o.status === 'new' || o.status === 'ready' ? '<button type="button" class="btn btn-ghost btn-sm tq-cancel" data-tq="cancel" data-id="' + id + '">Cancel</button>' : '');
  }
  function cardHTML(o) {
    const c = o.customer || {}, p = o.payment || {};
    const who = c.kind === 'member' && c.memberId ? '<a href="#/members/' + esc(c.memberId) + '">' + esc(c.name) + '</a> <span class="tq-kind">Member</span>' : esc(c.name) + ' <span class="tq-kind">' + (c.kind === 'public' ? 'Public golfer' : 'Guest') + '</span>';
    return '<article class="tq-card is-' + esc(o.status) + dueClass(o) + '" data-order="' + esc(o.id) + '" role="button" tabindex="0" aria-label="' + esc('Order ' + T.code(o) + ', ' + (c.name || '') + ', ' + LABEL[o.status] + '. Open details') + '">' +
      '<header class="tq-head"><div class="tq-when"><span class="tq-time num">' + esc(fmt.time(o.time)) + '</span><span class="tq-day">' + esc(dayLabel(o.date)) + '</span></div>' +
        '<div class="tq-who"><div class="tq-no">' + esc(T.code(o)) + ' · placed ' + esc(ago(o.placedAt)) + '</div><div class="tq-name">' + who + '</div>' +
        (c.phone ? '<a class="tq-phone" href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + Club.icon('phone') + '<span>' + esc(c.phone) + '</span></a>' : '') + '</div>' +
        '<span class="badge ' + ({ new: 'brass', ready: 'good', 'picked-up': 'outline', cancelled: 'bad' }[o.status]) + '">' + esc(TABS.find(function (t) { return t[0] === o.status; })[1]) + '</span></header>' +
      '<ul class="tq-items">' + o.items.map(function (l) { return '<li><span class="tq-qty num">' + l.qty + '</span><span>' + esc(l.name) + '</span></li>'; }).join('') + '</ul>' +
      (o.notes ? '<p class="tq-notes">' + Club.icon('edit') + '<span>' + esc(o.notes) + '</span></p>' : '') +
      '<div class="tq-pay"><span class="num">' + esc(fmt.money(o.total)) + '</span><span class="muted">' + esc(p.label || '') + '</span></div>' +
      (o.status === 'cancelled' ? '<p class="tq-cancelled">Cancelled ' + (o.cancelledBy === 'customer' ? 'by the customer' : 'by staff') + (o.cancelReason ? ': ' + esc(o.cancelReason) : '') + '. Refunded.</p>' : '') +
      '<div class="tq-acts">' + actsHTML(o) + '</div></article>';
  }

  /* ---------------- Order details drawer (the card opens it) ---------------- */
  function when(iso) { const d = new Date(iso); return (S.iso(d) === today() ? 'Today' : fmt.dateShort(S.iso(d))) + ', ' + fmt.time(d); }
  function byText(by) { return by === 'member' ? 'the member' : by === 'customer' ? 'the customer' : by || 'staff'; }
  /** The order's story from its history: placed, ready, picked up and by whom, steps back, cancelled. */
  function timeline(o) {
    return (o.history || []).map(function (h, i) {
      let t;
      if (h.status === 'new') t = i === 0 ? 'Order placed ' + (o.source === 'portal' ? 'in the members’ portal' : 'on the public site') : 'Moved back to new by ' + byText(h.by);
      else if (h.status === 'ready') t = h.back ? 'Moved back to ready by ' + byText(h.by) : 'Marked ready for pickup by ' + byText(h.by);
      else if (h.status === 'picked-up') t = 'Picked up, handed over by ' + byText(h.by);
      else if (h.status === 'cancelled') t = 'Cancelled ' + (h.by === 'customer' ? 'online by the customer' : 'by staff') + (o.cancelReason ? ': ' + o.cancelReason : '') + '. Refunded.';
      else t = LABEL[h.status] || h.status;
      return { at: h.at, text: t };
    });
  }
  function drawerHTML(o) {
    const c = o.customer || {}, p = o.payment || {};
    const who = c.kind === 'member' && c.memberId ? '<a href="#/members/' + esc(c.memberId) + '">' + esc(c.name) + '</a>' : esc(c.name);
    const kind = c.kind === 'member' ? 'Member' : c.kind === 'public' ? 'Public golfer' : 'Guest';
    const paid = [p.giftAmount > 0 ? 'Gift card ' + fmt.money(p.giftAmount) : '', p.due > 0 ? (p.method === 'account' ? 'Member account ' : (Club.receipts.cardLabel(p.brand, p.last4) || 'Card') + ' online ') + fmt.money(p.due) : ''].filter(Boolean).join(' + ') || p.label || 'Nothing to pay';
    return '<div class="od">' +
      '<div class="od-top"><span class="badge ' + ({ new: 'brass', ready: 'good', 'picked-up': 'outline', cancelled: 'bad' }[o.status]) + '">' + esc(LABEL[o.status]) + '</span><span class="od-when">Pickup ' + esc(T.pickupText(o).replace(/^Today/, 'today')) + '</span></div>' +
      '<section class="od-sec"><h4 class="od-h">Customer</h4><dl class="kv od-kv"><dt>Name</dt><dd>' + who + ' <span class="od-kind">' + kind + '</span></dd>' +
        (c.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(String(c.phone).replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a></dd>' : '') +
        (c.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></dd>' : '') + '</dl></section>' +
      '<section class="od-sec"><h4 class="od-h">Items</h4><ul class="od-items">' + o.items.map(function (l) {
        return '<li><span class="od-qty num">' + l.qty + '</span><span class="od-iname">' + esc(l.name) + '<span class="od-sub">' + esc(fmt.money(l.price)) + ' each</span></span><span class="num">' + esc(fmt.money(l.qty * l.price)) + '</span></li>';
      }).join('') + '</ul>' +
        (o.notes ? '<p class="tq-notes">' + Club.icon('edit') + '<span>' + esc(o.notes) + '</span></p>' : '') +
        '<dl class="od-tot"><dt>Subtotal</dt><dd class="num">' + esc(fmt.money(o.subtotal)) + '</dd><dt>Tax (GST 5% + PST 7%)</dt><dd class="num">' + esc(fmt.money(o.tax)) + '</dd>' +
        '<dt class="od-grand">Total</dt><dd class="od-grand num">' + esc(fmt.money(o.total)) + '</dd><dt>Paid with</dt><dd>' + esc(paid) + '</dd></dl></section>' +
      '<section class="od-sec"><h4 class="od-h">Timeline</h4><ol class="od-tl">' + timeline(o).map(function (e) {
        return '<li><span class="od-tl-t">' + esc(e.text) + '</span><span class="od-tl-at">' + esc(when(e.at)) + '</span></li>';
      }).join('') + '</ol></section>' +
      '<div class="od-acts tq-acts">' + actsHTML(o) + '</div></div>';
  }

  function settingsModal(after) {
    const s = T.settings();
    const opt = function (list, v) { return list.map(function (t) { return '<option value="' + t + '"' + (t === v ? ' selected' : '') + '>' + esc(fmt.time(t)) + '</option>'; }).join(''); };
    const all = times(5 * 60, 23 * 60 + 30, 15);
    const sel = function (label, name, v, list) { return '<div class="field"><label for="tq-' + name + '">' + esc(label) + '</label><select class="select" id="tq-' + name + '" name="' + name + '">' + opt(list || all, v) + '</select></div>'; };
    const num = function (label, name, v, list, unit) { return '<div class="field"><label for="tq-' + name + '">' + esc(label) + '</label><select class="select" id="tq-' + name + '" name="' + name + '">' + list.map(function (x) { return '<option value="' + x + '"' + (+x === +v ? ' selected' : '') + '>' + x + ' ' + unit + '</option>'; }).join('') + '</select></div>'; };
    ui.modal({ eyebrow: 'Takeout', title: 'Pickup hours and rules',
      body: '<p class="gs-ph">' + Club.icon('info') + '<span>Placeholder hours taken from the portal’s Gallery times. Confirm them with the club. Breakfast until 2:00 PM and Friday Night Pizza on Fridays are the club’s own.</span></p>' +
        '<form class="form-grid" novalidate onsubmit="return false">' +
          sel('First pickup', 'open', s.open) + sel('Last pickup', 'close', s.close) +
          sel('Breakfast pickups until', 'breakfastUntil', s.breakfastUntil) + sel('Friday pizza from', 'pizzaFrom', s.pizzaFrom) +
          num('Kitchen needs at least', 'lead', s.lead, [15, 20, 30, 45, 60, 90], 'minutes') + num('Pickup times every', 'step', s.step, [10, 15, 20, 30], 'minutes') +
          num('Order ahead up to', 'daysAhead', s.daysAhead, [0, 1, 2, 3, 6, 13], 'days') + num('Customers can cancel until', 'cancelBefore', s.cancelBefore, [0, 15, 30, 60, 120], 'minutes before') +
        '</form>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: function (api) {
        const v = ui.formData(ui.$('form', api.body));
        if (toMin(v.close) <= toMin(v.open)) { ui.toast('The last pickup must be after the first', 'bad'); return false; }
        Club.undo.run(function () { T.saveSettings({ open: v.open, close: v.close, breakfastUntil: v.breakfastUntil, pizzaFrom: v.pizzaFrom, lead: +v.lead, step: +v.step, daysAhead: +v.daysAhead, cancelBefore: +v.cancelBefore }); },
          { message: 'Takeout settings saved', after: after, undone: 'Takeout settings put back' });
        if (after) after();
      } }] });
  }

  function render(view) {
    if (!state.date || state.date < today()) state.date = today();
    view.classList.add('tq-page');
    function head() {
      const s = T.settings();
      return ui.pageHeader({ eyebrow: 'Gallery Taphouse & Grill', title: 'Takeout',
        subtitle: s.paused ? '<span class="tq-paused">' + Club.icon('alert') + 'Online orders are paused</span>' : 'Taking online orders · pickups ' + esc(fmt.time(s.open)) + ' to ' + esc(fmt.time(s.close)),
        actions: ui.btn(s.paused ? 'Resume online orders' : 'Pause online orders', { kind: s.paused ? 'primary' : 'ghost', sm: true, action: 'tq-pause', icon: s.paused ? 'check' : 'clock' }) + ui.btn('Hours', { kind: 'ghost', sm: true, icon: 'settings', action: 'tq-settings' }) });
    }
    view.innerHTML = '<div class="tq-headwrap">' + head() + '</div><div class="tq-bar"><div class="tq-days" role="tablist" aria-label="Pickup day"></div><div class="tq-tabs" role="tablist" aria-label="Status"></div></div><div class="tq-list" aria-live="polite"></div>';
    function draw() {
      /* Earlier days that still have an order in progress (not picked up, cancelled or refunded) come first, so a
         prepaid order left from yesterday can still be handed over or refunded. */
      const late = S.all(T.COLL).filter(function (o) { return o.date < today() && T.active(o); }).map(function (o) { return o.date; })
        .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
      const days = late.concat([today()].concat(T.days().slice(1)).filter(function (d, i) { return i === 0 || onDay(d).length; }));
      if (days.indexOf(state.date) < 0) state.date = today();
      ui.$('.tq-days', view).innerHTML = days.map(function (d) {
        const n = onDay(d).filter(T.active).length;
        return '<button type="button" role="tab" class="tq-daybtn' + (d === state.date ? ' active' : '') + '" aria-selected="' + (d === state.date) + '" data-day="' + d + '">' + esc(dayLabel(d)) + (n ? '<span class="tq-n">' + n + '</span>' : '') + '</button>';
      }).join('');
      const list = onDay(state.date);
      ui.$('.tq-tabs', view).innerHTML = TABS.map(function (t) {
        const n = list.filter(function (o) { return o.status === t[0]; }).length;
        return '<button type="button" role="tab" class="tq-tab' + (t[0] === state.status ? ' active' : '') + '" aria-selected="' + (t[0] === state.status) + '" data-status="' + t[0] + '">' + esc(t[1]) + '<span class="tq-n">' + n + '</span></button>';
      }).join('');
      const shown = list.filter(function (o) { return o.status === state.status; }).sort(function (a, b) {
        return state.status === 'picked-up' || state.status === 'cancelled' ? String(b.pickedUpAt || b.cancelledAt || '').localeCompare(String(a.pickedUpAt || a.cancelledAt || '')) : (a.time.localeCompare(b.time) || a.no - b.no);
      });
      ui.$('.tq-list', view).innerHTML = shown.length ? '<div class="tq-grid">' + shown.map(cardHTML).join('') + '</div>'
        : '<div class="panel">' + ui.empty({ icon: 'chef', title: state.status === 'new' ? 'No new orders' : 'Nothing here', text: state.status === 'new' ? 'New takeout orders for ' + (state.date === today() ? 'today' : state.date === Club.date.addDays(today(), 1) ? 'tomorrow' : dayLabel(state.date)) + ' appear here as they come in.' : 'Orders move here as the kitchen works through them.' }) + '</div>';
    }
    function redraw() { ui.$('.tq-headwrap', view).innerHTML = head(); draw(); }
    ui.on(view, 'click', '[data-day]', function (e, b) { state.date = b.dataset.day; draw(); });
    ui.on(view, 'click', '[data-status]', function (e, b) { state.status = b.dataset.status; draw(); });
    ui.on(view, 'click', '[data-tq-rc]', function (e, b) { Club.receipts.open(b.dataset.tqRc); });
    ui.on(view, 'click', '[data-action=tq-settings]', function () { settingsModal(redraw); });
    ui.on(view, 'click', '[data-action=tq-pause]', function () {
      const s = T.settings();
      const pause = function (on) {
        Club.undo.run(function () { T.saveSettings({ paused: on }); }, { message: on ? 'Online orders paused' : 'Taking online orders again', after: redraw, undone: on ? 'Taking online orders again' : 'Online orders paused again' });
        redraw();
      };
      if (s.paused) { pause(false); return; }
      ui.confirm({ title: 'Pause online takeout?', text: 'The portal and the public site stop taking new takeout orders until you resume. Orders already placed are not affected.', confirmLabel: 'Pause orders' }).then(function (ok) { if (ok) pause(true); });
    });
    /* One handler for the card and the drawer: the next step, the step back (with Undo on the toast), or cancel. */
    function act(b, done) {
      const o = T.get(b.dataset.id); if (!o) return;
      const to = b.dataset.tq, code = T.code(o);
      if (to === 'cancel') {
        const p = o.payment || {};
        const card = p.method === 'card' && p.due > 0;
        const back = [p.giftAmount > 0 ? fmt.money(p.giftAmount) + ' back on the gift card' : '', p.due > 0 ? fmt.money(p.due) + (p.method === 'account' ? ' credited to the member account' : ' refunded to ' + Club.receipts.cardLabel(p.brand, p.last4)) : ''].filter(Boolean).join(' and ');
        ui.modal({ eyebrow: code + ' · ' + o.customer.name, title: 'Cancel this order?',
          body: '<p class="ink-2">The customer sees it as cancelled' + (back ? ', with ' + esc(back) : '') + '.' + (card ? ' A card refund cannot be undone.' : '') + '</p><form novalidate onsubmit="return false">' + ui.field({ label: 'Reason for the customer (optional)', name: 'reason', placeholder: 'Kitchen closed early' }) + '</form>',
          actions: [{ label: 'Keep order', kind: 'ghost' }, { label: 'Cancel and refund', kind: 'danger', onClick: function (api) {
            const reason = ui.formData(ui.$('form', api.body)).reason;
            /* A refund sent to a card has left the club, so it has no Undo. Account credits and gift card amounts can be put back. */
            if (card) { T.cancel(o.id, { by: 'staff', reason: reason }); ui.toast('Order ' + code + ' cancelled and refunded'); }
            else Club.undo.run(function () { return T.cancel(o.id, { by: 'staff', reason: reason }); }, { message: 'Order ' + code + ' cancelled and refunded', after: done, undone: 'Order ' + code + ' reinstated' });
            done();
          } }] });
        return;
      }
      const from = o.status;
      const rec = Club.undo.track(function () { return T.setStatus(o.id, to, staffName()); });
      if (!rec.result || rec.result.status !== to) { ui.toast('This order has changed. The list has been refreshed', 'bad'); done(); return; }
      const msg = to === 'ready' ? (from === 'picked-up' ? code + ' is back to ready' : code + ' is ready for pickup') : to === 'picked-up' ? code + ' picked up' : code + ' moved back to new';
      Club.undo.offer(msg, rec, { after: done, undone: code + ' is back to ' + LABEL[from].toLowerCase() });
      const card = b.closest('.tq-card'); if (card) { card.classList.add('tq-leaving'); setTimeout(done, 160); } else done();
    }
    ui.on(view, 'click', '[data-tq]', function (e, b) { act(b, function () { draw(); refreshDrawer(); }); });
    /* The whole card opens the details drawer; its own buttons and links keep doing their job. */
    ui.on(view, 'click', '.tq-card', function (e, card) { if (e.target.closest('button, a, input, label, select')) return; openDrawer(card.dataset.order); });
    ui.on(view, 'keydown', '.tq-card', function (e, card) { if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); openDrawer(card.dataset.order); });
    let drawer = null;
    function openDrawer(id) {
      const o = T.get(id); if (!o) return;
      const d = ui.drawer({ eyebrow: 'Takeout order', title: T.code(o) + ' · ' + (o.customer || {}).name, body: drawerHTML(o), onClose: function () { if (drawer && drawer.api === d) drawer = null; } });
      if (d.duplicate) return;
      d.el.classList.add('od-drawer');
      drawer = { api: d, id: id };
      ui.on(d.el, 'click', '[data-tq]', function (e, b) { act(b, function () { draw(); refreshDrawer(); }); });
      ui.on(d.el, 'click', '[data-tq-rc]', function (e, b) { Club.receipts.open(b.dataset.tqRc); });
      ui.on(d.el, 'click', 'a[href^="#/"]', function () { d.close(); });
    }
    function refreshDrawer() {
      if (!drawer || !document.body.contains(drawer.api.el)) { drawer = null; return; }
      const o = T.get(drawer.id); if (!o) { drawer.api.close(); return; }
      drawer.api.body.innerHTML = drawerHTML(o);
    }
    draw();
    /* New orders arrive from the portal and the public site (other tabs): the queue redraws, and minutes refresh. */
    const off = S.subscribe(T.COLL, function () { if (!document.querySelector('.overlay')) draw(); else refreshDrawer(); });
    const offSet = S.subscribe('$takeoutSettings', function () { if (!document.querySelector('.overlay')) redraw(); });
    const tick = setInterval(function () { if (!document.querySelector('.overlay')) draw(); }, 30000);
    return function () { off(); offSet(); clearInterval(tick); };
  }

  Club.register({
    id: 'takeout', label: 'Takeout', icon: 'chef', section: 'Hospitality', order: 12,
    badge: function () { const n = S.all(T.COLL).filter(function (o) { return o.status === 'new' && o.date === today(); }).length; return n || null; },
    search: function (q) {
      q = q.toLowerCase();
      return S.all(T.COLL).filter(function (o) { return (T.code(o) + ' ' + (o.customer || {}).name + ' ' + (o.customer || {}).phone).toLowerCase().indexOf(q) >= 0; }).slice(0, 4)
        .map(function (o) { return { label: T.code(o) + ', ' + o.customer.name, sub: 'Takeout · ' + T.pickupText(o) + ' · ' + T.statusLabel(o), href: 'takeout', icon: 'chef' }; });
    },
    render: render
  });
})();
