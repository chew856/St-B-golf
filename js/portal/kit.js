/* Portal kit: the shared mobile building blocks for the members' portal.
   One decision at a time: list pickers and detail/confirm steps open in a bottom sheet, secondary info sits in
   collapsed accordions, numbers use a stepper, and a flow's final button lives in a sticky action bar above the
   bottom nav. Styles are in css/portal-theme.css (.ps-*, .pk-*).

   Portal.openSheet({ title, rows, selected, onPick, content, footer, onClose, size })
     rows: [{ value, label, sub, meta, pill, disabled, reason, group, href }]  -> a list; tapping a row picks it
           (calls onPick(value, row)) and closes the sheet immediately. Rows with href are links.
     content: HTML (or an Element) for detail / confirm / form sheets instead of rows. footer: HTML for a pinned
     bottom area (e.g. a full-width primary button). size: 'full' for a full-height sheet.
     Returns { el, body, foot, close(), setContent(html), setFooter(html) }.
     Drag handle and swipe-down, backdrop tap and Escape close it; focus is trapped and returned on close.
   Portal.selectField(container, { label, title, rows, value, placeholder, icon, onChange })  -> { value(), set(v), update(o) }
   Portal.accordion({ id, icon, title, summary, body, open })  -> HTML string (toggling is wired globally)
   Portal.stepper(container, { label, value, min, max, unit, onChange })  -> { value(), set(v) }
   Portal.actionBar.show({ summary, label, onClick, disabled }), .hide()   (hidden automatically on route change)
   Portal.prefs.get(key, fallback), .set(key, value)                       (per member, localStorage, never throws)
   Portal.receiptsFor(source, refId, memberId) -> that member's receipts for a booking or order, newest first
   Portal.receiptLink(list, { label, btn })    -> HTML for a quiet Receipt link (btn: a full button); '' when list is empty.
                                                  One receipt opens in Club.receipts.open, several in a sheet to choose from. */
(function () {
  window.Portal = window.Portal || {};
  const ui = Club.ui, esc = ui.esc;
  const reduce = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  let seq = 0;

  /* ---------------- Bottom sheet ---------------- */
  const stack = [];
  Portal.openSheet = function (o) {
    o = o || {};
    const id = 'ps' + (++seq);
    const lastFocus = document.activeElement;
    const scrim = ui.el('<div class="ps-scrim"></div>');
    const sheet = ui.el('<div class="ps-sheet' + (o.size === 'full' ? ' is-full' : '') + (o.locked ? ' is-locked' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">' +
      (o.locked ? '' : '<div class="ps-grab" aria-hidden="true"><span></span></div>') +
      '<div class="ps-head"><h2 id="' + id + '-t">' + esc(o.title || '') + '</h2>' +
        (o.locked ? '' : '<button type="button" class="ps-x" aria-label="Close">' + Club.icon('close') + '</button>') + '</div>' +
      '<div class="ps-body"></div><div class="ps-foot"' + (o.footer ? '' : ' hidden') + '></div></div>');
    const body = ui.$('.ps-body', sheet), foot = ui.$('.ps-foot', sheet);
    let closed = false;
    const api = {};            /* filled in below; registered on the sheet stack before the handlers run */

    function rowsHTML(rows) {
      let html = '<div class="ps-list" role="listbox" aria-labelledby="' + id + '-t">', group = null;
      rows.forEach(function (r) {
        if (r.group && r.group !== group) { html += '<div class="ps-group eyebrow" role="presentation">' + esc(r.group) + '</div>'; group = r.group; }
        const sel = o.selected != null && String(r.value) === String(o.selected);
        const inner = '<span class="ps-row-main"><span class="ps-row-label">' + esc(r.label) + '</span>' +
            (r.sub ? '<span class="ps-row-sub">' + esc(r.sub) + '</span>' : '') + '</span>' +
          (r.pill ? '<span class="ps-pill">' + esc(r.pill) + '</span>' : '') +
          ((r.disabled ? r.reason : r.meta) ? '<span class="ps-row-meta">' + esc(r.disabled ? (r.reason || '') : r.meta) + '</span>' : '') +
          (r.href ? Club.icon('chevronRight', 'ps-row-go') : '<span class="ps-tick" aria-hidden="true">' + Club.icon('check') + '</span>');
        html += r.href
          ? '<a class="ps-row" href="' + esc(r.href) + '"' + (/^https?:|^tel:|^mailto:/.test(r.href) ? ' target="' + (/^https?:/.test(r.href) ? '_blank' : '_self') + '" rel="noopener"' : '') + '>' + inner + '</a>'
          : '<button type="button" class="ps-row" role="option" data-v="' + esc(r.value) + '" aria-selected="' + sel + '"' + (r.disabled ? ' disabled aria-disabled="true"' : '') + '>' + inner + '</button>';
      });
      return html + '</div>';
    }
    function setContent(c) { body.innerHTML = ''; if (typeof c === 'string') body.innerHTML = c; else if (c) body.appendChild(c); }
    function setFooter(h) { foot.innerHTML = h || ''; foot.hidden = !h; }

    if (o.rows) setContent(rowsHTML(o.rows)); else setContent(o.content || '');
    setFooter(o.footer || '');

    /* A double tap on the row that opens a sheet would stack two identical sheets, so one close button press seemed
       to do nothing. The repeat gets a detached copy: the caller's set-up code runs against it harmlessly and it never shows. */
    const top = stack[stack.length - 1];
    if (top && top.title === (o.title || '') && Date.now() - top.openedAt < 700) {
      return { el: sheet, body: body, foot: foot, close: function () {}, setContent: setContent, setFooter: setFooter, duplicate: true };
    }
    api.title = o.title || ''; api.openedAt = Date.now(); api.locked = !!o.locked;
    document.body.appendChild(scrim); document.body.appendChild(sheet);
    stack.push(api);
    document.body.classList.add('ps-open');
    requestAnimationFrame(function () { scrim.classList.add('open'); sheet.classList.add('open'); });

    function close(silent) {
      if (closed) return; closed = true;
      sheet.classList.remove('open'); scrim.classList.remove('open');
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove('ps-open');
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      setTimeout(function () { sheet.remove(); scrim.remove(); }, reduce() ? 0 : 220);
      if (!silent) { const back = lastFocus && lastFocus !== document.body && document.body.contains(lastFocus) ? lastFocus : null; if (back && back.focus) back.focus(); }
      if (o.onClose) o.onClose();
    }
    function onKey(e) {
      if (stack[stack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!o.locked) close(); return; }
      if (e.key === 'Tab') {                                   /* focus trap */
        const f = ui.$$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', sheet).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement && document.activeElement.classList.contains('ps-row')) {
        const rows = ui.$$('.ps-row:not([disabled])', sheet), i = rows.indexOf(document.activeElement);
        e.preventDefault(); const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', function () { if (!o.locked) close(); });
    if (!o.locked) ui.$('.ps-x', sheet).addEventListener('click', function () { close(); });
    ui.on(sheet, 'click', 'button.ps-row', function (e, b) {
      if (b.disabled) return;
      const r = (o.rows || []).find(function (x) { return String(x.value) === b.dataset.v; });
      close(true);
      if (o.onPick) o.onPick(r ? r.value : b.dataset.v, r);
    });
    ui.on(sheet, 'click', 'a.ps-row', function () { close(true); });

    /* swipe down on the handle or header to close */
    let y0 = null, dy = 0;
    /* Only a bottom sheet (phones) can be dragged down, and never from a button: on wider screens the sheet is a centred
       dialog, and a drag there replaced its centring transform, so the dialog jumped under the pointer mid-click and the
       close button never received the click (Safari, where a click carries a little pointer movement). */
    function draggable(e) { return !o.locked && !e.target.closest('button, a, input, select, textarea') && !window.matchMedia('(min-width: 768px)').matches; }
    let dragging = false;
    function down(e) { if (!draggable(e)) { y0 = null; return; } y0 = (e.touches ? e.touches[0] : e).clientY; dy = 0; dragging = false; }
    function move(e) {
      if (y0 == null) return; dy = Math.max(0, (e.touches ? e.touches[0] : e).clientY - y0);
      if (!dragging && dy < 6) return;                        /* a tap with a little movement is still a tap */
      if (!dragging) { dragging = true; sheet.style.transition = 'none'; }
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() { if (y0 == null) return; if (dragging) { sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 80) close(); } y0 = null; dragging = false; }
    [ui.$('.ps-grab', sheet), ui.$('.ps-head', sheet)].filter(Boolean).forEach(function (h) { h.addEventListener('touchstart', down, { passive: true }); h.addEventListener('mousedown', down); });
    sheet.addEventListener('touchmove', move, { passive: true }); document.addEventListener('mousemove', move);
    sheet.addEventListener('touchend', up); document.addEventListener('mouseup', up);

    Object.assign(api, { el: sheet, body: body, foot: foot, close: function () { close(); }, setContent: setContent, setFooter: setFooter });
    setTimeout(function () {
      const t = ui.$('.ps-row[aria-selected="true"]', sheet) || ui.$('.ps-row:not([disabled])', sheet) || ui.$('input, select, textarea, button:not(.ps-x)', body) || ui.$('.ps-x', sheet);
      if (t) { t.focus({ preventScroll: true }); if (t.scrollIntoView && t.classList.contains('ps-row')) t.scrollIntoView({ block: 'nearest' }); }
    }, 40);
    return api;
  };

  /* ---------------- Select field ---------------- */
  Portal.selectField = function (root, o) {
    o = Object.assign({ label: '', title: '', rows: [], value: null, placeholder: 'Choose', icon: null }, o || {});
    const id = 'sf' + (++seq);
    function current() { return o.rows.find(function (r) { return String(r.value) === String(o.value); }); }
    function render() {
      const c = current();
      root.innerHTML = '<div class="pk-field">' +
        (o.label ? '<span class="pk-label" id="' + id + '-l">' + esc(o.label) + '</span>' : '') +
        '<button type="button" class="pk-select" aria-haspopup="dialog"' + (o.label ? ' aria-labelledby="' + id + '-l ' + id + '-v"' : '') + '>' +
          (o.icon ? Club.icon(o.icon) : '') +
          '<span class="pk-select-text" id="' + id + '-v">' + (c ? '<span class="pk-select-main">' + esc(c.label) + '</span>' + (c.sub && o.showSub ? '<span class="pk-select-sub">' + esc(c.sub) + '</span>' : '') : '<span class="pk-select-ph">' + esc(o.placeholder) + '</span>') + '</span>' +
          Club.icon('chevronDown', 'pk-chev') +
        '</button></div>';
      ui.$('.pk-select', root).addEventListener('click', function () {
        Portal.openSheet({ title: o.title || o.label, rows: o.rows, selected: o.value, onPick: function (v) { o.value = v; render(); if (o.onChange) o.onChange(v, current()); } });
      });
    }
    render();
    return { value: function () { return o.value; }, set: function (v) { o.value = v; render(); }, update: function (x) { Object.assign(o, x || {}); render(); } };
  };

  /* ---------------- Accordion ---------------- */
  Portal.accordion = function (o) {
    o = o || {};
    const id = o.id || ('acc' + (++seq));
    return '<div class="pk-acc' + (o.open ? ' is-open' : '') + '" data-acc="' + esc(id) + '">' +
      '<button type="button" class="pk-acc-head" aria-expanded="' + !!o.open + '" aria-controls="' + esc(id) + '-b">' +
        (o.icon ? Club.icon(o.icon, 'pk-acc-icon') : '') +
        '<span class="pk-acc-text"><span class="pk-acc-title">' + esc(o.title || '') + '</span>' +
          (o.summary ? '<span class="pk-acc-sum">' + esc(o.summary) + '</span>' : '') + '</span>' +
        Club.icon('chevronDown', 'pk-acc-chev') +
      '</button>' +
      '<div class="pk-acc-wrap" id="' + esc(id) + '-b" role="region"' + (o.open ? '' : ' hidden') + '><div class="pk-acc-body">' + (o.body || '') + '</div></div></div>';
  };
  document.addEventListener('click', function (e) {
    const h = e.target.closest && e.target.closest('.pk-acc-head'); if (!h) return;
    const acc = h.parentElement, wrap = acc.querySelector('.pk-acc-wrap'), open = !acc.classList.contains('is-open');
    acc.classList.toggle('is-open', open); h.setAttribute('aria-expanded', open);
    if (reduce()) { wrap.hidden = !open; return; }
    if (open) {
      wrap.hidden = false; const hgt = wrap.scrollHeight; wrap.style.height = '0px';
      requestAnimationFrame(function () { wrap.style.height = hgt + 'px'; });
      setTimeout(function () { wrap.style.height = ''; }, 220);
    } else {
      wrap.style.height = wrap.scrollHeight + 'px';
      requestAnimationFrame(function () { wrap.style.height = '0px'; });
      setTimeout(function () { wrap.hidden = true; wrap.style.height = ''; }, 210);
    }
    acc.dispatchEvent(new CustomEvent('accordion', { bubbles: true, detail: { open: open } }));
  });

  /* ---------------- Stepper ---------------- */
  Portal.stepper = function (root, o) {
    o = Object.assign({ label: '', value: 1, min: 1, max: 4, unit: '' }, o || {});
    const id = 'st' + (++seq);
    function render() {
      root.innerHTML = '<div class="pk-stepper">' + (o.label ? '<span class="pk-label" id="' + id + '-l">' + esc(o.label) + '</span>' : '') +
        '<div class="pk-step-row" role="group"' + (o.label ? ' aria-labelledby="' + id + '-l"' : '') + '>' +
          '<button type="button" class="pk-step" data-d="-1" aria-label="Fewer"' + (o.value <= o.min ? ' disabled' : '') + '>' + '<span aria-hidden="true">−</span></button>' +
          '<output class="pk-step-val" aria-live="polite">' + esc(o.value) + (o.unit ? ' <span class="pk-step-unit">' + esc(o.unit) + '</span>' : '') + '</output>' +
          '<button type="button" class="pk-step" data-d="1" aria-label="More"' + (o.value >= o.max ? ' disabled' : '') + '>' + '<span aria-hidden="true">+</span></button>' +
        '</div></div>';
      ui.$$('.pk-step', root).forEach(function (b) {
        b.addEventListener('click', function () {
          const v = Math.max(o.min, Math.min(o.max, o.value + (+b.dataset.d)));
          if (v === o.value) return; o.value = v; const d = b.dataset.d; render();
          const nb = ui.$('.pk-step[data-d="' + d + '"]', root); if (nb && !nb.disabled) nb.focus(); else { const ob = ui.$('.pk-step:not([disabled])', root); if (ob) ob.focus(); }
          if (o.onChange) o.onChange(v);
        });
      });
    }
    render();
    return { value: function () { return o.value; }, set: function (v) { o.value = v; render(); }, update: function (x) { Object.assign(o, x || {}); render(); } };
  };

  /* ---------------- Sticky action bar ---------------- */
  let bar = null, barVisible = false;
  Portal.actionBar = {
    show: function (o) {
      barVisible = true;
      o = o || {};
      if (!bar) { bar = ui.el('<div class="pk-bar" role="region" aria-label="Your selection"><div class="pk-bar-sum"></div><button type="button" class="btn btn-primary pk-bar-btn"></button></div>'); document.body.appendChild(bar); }
      ui.$('.pk-bar-sum', bar).innerHTML = o.summaryHTML || esc(o.summary || '');
      const b = ui.$('.pk-bar-btn', bar);
      b.textContent = o.label || 'Continue'; b.disabled = !!o.disabled;
      b.onclick = function () { if (!b.disabled && o.onClick) o.onClick(); };
      document.body.classList.add('has-bar');
      requestAnimationFrame(function () { if (barVisible) bar.classList.add('open'); });   /* a hide() before this frame wins */
    },
    hide: function () { barVisible = false; if (!bar) return; bar.classList.remove('open'); document.body.classList.remove('has-bar'); },
    el: function () { return bar; }
  };
  /* Called by the portal router before each page renders (js/portal/app.js), so a page that shows a bar on its
     first render keeps it, and nothing from the previous page lingers. */
  /* ---------------- How a player's name shows to a member ----------------
     Friends (and the viewer's own guests, whose names they entered) show in full. Everyone else, members, other
     people's guests and public golfers, shows as first name and last initial: "Tom R.". Staff screens show full names. */
  Portal.shortName = function (full) {
    const w = String(full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!w.length) return '';
    return w.length === 1 ? w[0] : w[0] + ' ' + w[w.length - 1].charAt(0).toUpperCase() + '.';
  };
  Portal.playerLabel = function (p, viewerId) {
    if (!p) return '';
    const viewer = viewerId || (Portal.member && Portal.member() ? Portal.member().id : null);
    if (p.memberId) {
      const m = Club.members.get(p.memberId); const full = m ? m.firstName + ' ' + m.lastName : (p.name || 'A member');
      if (p.memberId === viewer) return full;
      const friends = Portal.friends && viewer ? Portal.friends.friendsOf(viewer) : [];
      return friends.indexOf(p.memberId) >= 0 ? full : Portal.shortName(full);
    }
    if (p.type === 'guest' && p.hostId && p.hostId === viewer) return p.name || 'Guest';
    return Portal.shortName(p.name) || (p.type === 'public' ? 'Public golfer' : 'Guest');
  };

  /* ---------------- Receipts (Club.receipts, js/core/receipts.js) ----------------
     Pages show a Receipt link next to something the member paid for; My account > Receipts lists them all. */
  Portal.receiptsFor = function (source, refId, memberId) {
    if (!Club.receipts || refId == null) return [];
    return Club.receipts.forRef(source, refId).filter(function (r) { return r.memberId === memberId; });
  };
  Portal.receiptAmount = function (r) { return (r.kind === 'credit' ? '−' : '') + Club.fmt.money(r.total); };
  Portal.receiptLink = function (list, o) {
    o = o || {};
    list = (list || []).filter(Boolean);
    if (!list.length) return '';
    const label = o.label || (list.length > 1 ? 'Receipts' : 'Receipt');
    return '<button type="button" class="' + (o.btn ? 'btn' : 'p-link p-rc-link') + '" data-receipts="' + esc(list.map(function (r) { return r.id; }).join(' ')) + '">' +
      Club.icon('billing') + '<span>' + esc(label) + '</span></button>';
  };
  function openReceipts(ids) {
    const list = ids.map(function (id) { return Club.receipts.get(id); }).filter(Boolean);
    if (list.length < 2) { Club.receipts.open(list[0] || ids[0]); return; }
    Portal.openSheet({ title: 'Receipts', rows: list.map(function (r) {
      const l = r.lines || [], what = l.length && l[0].name !== r.title ? l[0].name + (l.length > 1 ? ' and ' + (l.length - 1) + ' more' : '') : '';
      return { value: r.id, label: r.kind === 'credit' ? 'Credit: ' + r.title : r.title, sub: [what, Club.fmt.date(r.date), r.no].filter(Boolean).join(' · '), meta: Portal.receiptAmount(r) };
    }), onPick: function (id) { Club.receipts.open(id); } });
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-receipts]');
    if (!b || !Club.receipts) return;
    e.preventDefault(); e.stopPropagation();          /* capture phase: a tappable row around the link does not open too */
    openReceipts(String(b.dataset.receipts).split(' ').filter(Boolean));
  }, true);

  /* A locked sheet (the required hand question) stays open across page changes: only its own answer closes it. */
  Portal.resetChrome = function () { Portal.actionBar.hide(); stack.slice().reverse().forEach(function (s) { if (!s.locked) s.close(); }); };

  /* ---------------- Remembered defaults ---------------- */
  function key() { let m = null; try { m = localStorage.getItem('stboniface.portal.session'); } catch (e) { /* storage blocked */ } return 'stboniface.portal.prefs.' + (m || 'anon'); }
  Portal.prefs = {
    get: function (k, fallback) { try { const all = JSON.parse(localStorage.getItem(key()) || '{}'); return all[k] !== undefined ? all[k] : fallback; } catch (e) { return fallback; } },
    set: function (k, v) { try { const all = JSON.parse(localStorage.getItem(key()) || '{}'); all[k] = v; localStorage.setItem(key(), JSON.stringify(all)); } catch (e) { /* private mode */ } }
  };
})();
