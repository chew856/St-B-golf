/* Public site: Order to the course. The same flow as the members' portal (Club.cartOrderView in js/portal/cart.js)
   for a signed-in public golfer with a tee time today. Public golfers always pay at the cart. */
(function () {
  'use strict';
  const ui = Club.ui;
  if (!window.Pub || !Club.cartOrderView) return;

  /* Sticky bar for the flow's final button (the portal has Portal.actionBar; the public site has none). */
  let barEl = null;
  const bar = {
    show: function (o) {
      if (!barEl) { barEl = ui.el('<div class="co-pbar" role="region" aria-label="Your order"><div class="co-pbar-in"><div class="co-pbar-sum"></div><button type="button" class="btn btn-primary co-pbar-btn"></button></div></div>'); document.body.appendChild(barEl); }
      ui.$('.co-pbar-sum', barEl).textContent = o.summary || '';
      const b = ui.$('.co-pbar-btn', barEl); b.textContent = o.label || 'Continue'; b.onclick = function () { if (o.onClick) o.onClick(); };
      document.body.classList.add('co-has-bar');
      requestAnimationFrame(function () { if (barEl) barEl.classList.add('open'); });
    },
    hide: function () { if (barEl) barEl.classList.remove('open'); document.body.classList.remove('co-has-bar'); }
  };
  function holeOptions(v) {
    let h = '<option value="">Choose hole</option>';
    for (let i = 1; i <= 18; i++) h += '<option value="' + i + '"' + (+v === i ? ' selected' : '') + '>Hole ' + i + '</option>';
    return h;
  }
  const kit = {
    select: function (el, o) {
      const id = 'co-sel-' + Math.random().toString(36).slice(2, 7);
      el.innerHTML = '<div class="field"><label for="' + id + '">' + ui.esc(o.label) + '</label><select class="select" id="' + id + '">' + holeOptions(o.value) + '</select></div>';
      const s = ui.$('select', el);
      s.addEventListener('change', function () { if (o.onChange) o.onChange(s.value ? +s.value : null); });
      return { value: function () { return s.value ? +s.value : null; }, set: function (v) { s.value = v ? String(v) : ''; } };
    },
    bar: bar,
    sheet: function (o) {
      let ok = null;
      const m = ui.modal({ eyebrow: 'Order to the course', title: o.title, body: o.body,
        actions: [{ label: 'Close', kind: 'ghost' }, { label: o.confirmLabel, kind: 'primary', onClick: function () { return o.onConfirm() !== false; } }] });
      if (m.duplicate) return;
      ok = m.el.querySelector('.modal-foot .btn:last-child');
      o.wire(m.body, function (label) { if (ok) { ok.querySelector('span') ? ok.querySelector('span').textContent = label : ok.textContent = label; ok.classList.toggle('btn-danger', label === 'Cancel order'); ok.classList.toggle('btn-primary', label !== 'Cancel order'); } });
    },
    pickHole: function (current, onPick) {
      ui.modal({ eyebrow: 'Order to the course', title: 'Which hole are you on now?',
        body: '<div class="field"><label for="co-move">Hole</label><select class="select" id="co-move">' + holeOptions(current) + '</select></div>',
        actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Tell the cart', kind: 'primary', onClick: function (api) {
          const v = +ui.$('#co-move', api.body).value; if (!v) return false; onPick(v);
        } }] });
    }
  };

  Pub.register({
    id: 'cart', label: 'Order to the course', title: 'Order to the course', auth: true,
    render: function (view, params, p) {
      return Club.cartOrderView.mount(view, { golfer: { type: 'public', id: p.id, name: p.firstName + ' ' + p.lastName, firstName: p.firstName }, site: 'public', bookHref: '#/', kit: kit });
    }
  });
  /* Location sharing while an order is open, on any public page (see Club.cartOrderView.startWatcher). */
  if (Club.cartOrderView.startWatcher) Club.cartOrderView.startWatcher(function () { const p = Pub.me(); return p ? { type: 'public', id: p.id, name: p.firstName + ' ' + p.lastName, firstName: p.firstName } : null; });
  /** Nav entry: only for a signed-in golfer who plays today (site.js asks before drawing its links). */
  Pub.cartNav = function (p) {
    if (!p || !Club.cart) return false;
    const g = { type: 'public', id: p.id };
    return !!(Club.cart.teeTimeToday(g) || Club.cart.openOrderFor(g));
  };
})();
