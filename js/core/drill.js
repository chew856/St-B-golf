/* Club.drill: stat tiles that open a details drawer, and the parts the drawers are built from (the dashboard's look:
   .dd-* and .dash-drill styles in css/modules/dashboard.css). Used by the beverage cart and Events & Tournaments.

   html = Club.drill.tiles(ui.stats([...]), ['key1', 'key2', ...])   tiles become keyboard-accessible buttons
   Club.drill.wire(root, { key1: fn, ... }, eyebrow)                  fn() returns { title, body, go?, goLabel? }
   Club.drill.sec / kpis / table / note / empty / share                 building blocks for the body */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const ui = Club.ui, esc = ui.esc;
  const D = {
    sec: function (title, aside, inner) { return '<section class="dd-sec" data-reveal><div class="dd-sec-head"><h4>' + esc(title) + '</h4>' + (aside ? '<span class="dd-aside">' + esc(aside) + '</span>' : '') + '</div>' + inner + '</section>'; },
    kpis: function (items) { return '<div class="dd-kpis" data-reveal>' + items.map(function (k) { return '<div><span class="label-caps">' + esc(k.label) + '</span><strong class="serif">' + esc(k.value) + '</strong>' + (k.sub ? '<span class="dd-kpi-sub">' + esc(k.sub) + '</span>' : '') + '</div>'; }).join('') + '</div>'; },
    /** cols: [{ label, num }]; rows and foot: arrays of cell HTML. */
    table: function (cols, rows, foot) {
      return '<div class="table-wrap"><table class="table dd-table"><thead><tr>' + cols.map(function (c) { return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (cell, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + cell + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' +
        (foot ? '<tfoot><tr>' + foot.map(function (c, i) { return '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table></div>';
    },
    note: function (text) { return '<p class="dd-note">' + esc(text) + '</p>'; },
    empty: function (title, text, icon) { return '<div class="dd-empty" data-reveal>' + ui.empty({ icon: icon || 'flag', title: title, text: text }) + '</div>'; },
    /** A thin bar and a percentage: v as a share of total. */
    share: function (v, total) { const p = total ? Math.round(v / total * 100) : 0; return '<span class="dd-fill wide"><span class="bar"><span style="width:' + Math.min(100, Math.max(0, p)) + '%"></span></span>' + p + '%</span>'; },
    /** The stat tiles as keyboard-accessible buttons (the dashboard's tile style), keyed in order. */
    tiles: function (html, keys) {
      const wrap = ui.el(html);
      ui.$$('.stat', wrap).forEach(function (st, i) {
        if (!keys[i]) return;
        st.classList.add('dash-drill'); st.setAttribute('role', 'button'); st.setAttribute('tabindex', '0'); st.setAttribute('aria-haspopup', 'dialog'); st.dataset.drill = keys[i];
        st.insertAdjacentHTML('beforeend', '<span class="dash-drill-cue">View details' + Club.icon('chevronRight') + '</span>');
      });
      return '<div class="dash-stats">' + wrap.outerHTML + '</div>';
    },
    open: function (d, eyebrow) {
      const api = ui.drawer({ eyebrow: eyebrow, title: d.title, body: '<div class="dd">' + d.body + '</div>',
        actions: d.go ? [{ label: 'Close', kind: 'ghost' }, { label: d.goLabel, kind: 'primary', onClick: function () { Club.app.go(d.go); } }] : null });
      if (api.duplicate) return api;
      api.el.classList.add('dash-drawer'); api.el.setAttribute('aria-label', d.title);
      ui.on(api.el, 'click', 'a[href^="#/"]', function () { api.close(); });
      ui.animateIn(api.body);
      return api;
    },
    /** Clicks and Enter / Space on [data-drill] tiles inside root open drills[key](). */
    wire: function (root, drills, eyebrow) {
      function go(key) {
        const fn = drills[key]; if (!fn) return;
        let d;
        try { d = fn(); } catch (e) { console.error(e); d = { title: 'Details', body: D.empty('These details could not load', e.message, 'alert') }; }
        D.open(d, typeof eyebrow === 'function' ? eyebrow() : eyebrow);
      }
      ui.on(root, 'click', '.stat[data-drill]', function (e, st) { go(st.dataset.drill); });
      ui.on(root, 'keydown', '.stat[data-drill]', function (e, st) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); go(st.dataset.drill); } });
    }
  };
  Club.drill = D;
})();
