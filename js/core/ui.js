/* Club.ui: shared UI kit. Club.fmt: formatters. See SPEC.md for usage. */
(function () {
  window.Club = window.Club || {};

  /* ---------------- Formatters ---------------- */
  const money0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const money2 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
  const num = new Intl.NumberFormat('en-US');
  function toDate(d) {
    if (d instanceof Date) return d;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
    return new Date(d);
  }
  const fmt = {
    money: function (v, cents) { return (cents === false ? money0 : money2).format(+v || 0); },
    money0: function (v) { return money0.format(+v || 0); },
    num: function (v) { return num.format(+v || 0); },
    pct: function (v, d) { return (+v || 0).toFixed(d == null ? 0 : d) + '%'; },
    date: function (d) { return toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
    dateShort: function (d) { return toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
    dateLong: function (d) { return toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); },
    weekday: function (d) { return toDate(d).toLocaleDateString('en-US', { weekday: 'short' }); },
    /** "07:30" -> "7:30 AM" */
    time: function (t) {
      if (!t) return '';
      if (t instanceof Date) return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const p = String(t).split(':'); let h = +p[0]; const m = p[1] || '00'; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m + ' ' + ap;
    },
    relative: function (d) {
      const diff = (toDate(d) - new Date()) / 86400000; const r = Math.round(diff);
      if (r === 0) return 'Today'; if (r === 1) return 'Tomorrow'; if (r === -1) return 'Yesterday';
      return r > 0 ? 'In ' + r + ' days' : Math.abs(r) + ' days ago';
    },
    handicap: function (h) { if (h == null) return '–'; return h < 0 ? '+' + Math.abs(h).toFixed(1) : h.toFixed(1); },
    initials: function (name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); },
    toDate: toDate
  };
  Club.fmt = fmt;

  /* ---------------- Dates ---------------- */
  Club.date = {
    today: function () { return Club.store.iso(new Date()); },
    addDays: function (isoStr, n) { const d = toDate(isoStr); d.setDate(d.getDate() + n); return Club.store.iso(d); },
    fromToday: function (n) { return Club.store.daysFromToday(n); },
    iso: function (d) { return Club.store.iso(toDate(d)); },
    /** Monday-start week array of 7 ISO dates containing isoStr */
    week: function (isoStr) { const d = toDate(isoStr); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); const out = []; for (let i = 0; i < 7; i++) { out.push(Club.store.iso(d)); d.setDate(d.getDate() + 1); } return out; }
  };

  /* ---------------- DOM helpers ---------------- */
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  /** Delegated event: on(root, 'click', '[data-action=x]', fn(e, matchedEl)) */
  function on(root, type, sel, fn) {
    root.addEventListener(type, function (e) { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
  }

  const ui = { esc: esc, el: el, $: $, $$: $$, on: on };

  /* ---------------- Members lookup helpers ---------------- */
  Club.members = {
    get: function (id) { return Club.store.find('members', id); },
    name: function (idOrDoc) { const m = typeof idOrDoc === 'string' ? Club.store.find('members', idOrDoc) : idOrDoc; return m ? m.firstName + ' ' + m.lastName : 'Guest'; },
    tier: function (m) { return m ? Club.store.find('membershipTiers', m.tierId) : null; },
    /** Which hand a member plays: 'Right-handed', 'Left-handed' or null when not recorded. */
    HANDS: [{ value: 'right', label: 'Right-handed' }, { value: 'left', label: 'Left-handed' }],
    hand: function (m) { const h = m && m.hand; return h === 'left' ? 'Left-handed' : h === 'right' ? 'Right-handed' : null; },
    options: function (selectedId) {
      return Club.store.all('members').slice().sort(function (a, b) { return a.lastName.localeCompare(b.lastName); })
        .map(function (m) { return '<option value="' + m.id + '"' + (m.id === selectedId ? ' selected' : '') + '>' + esc(m.lastName + ', ' + m.firstName) + ' · #' + m.memberNo + '</option>'; }).join('');
    }
  };
  /**
   * Post a charge to a member's house account (the shared ledger every module bills).
   * Club.chargeMember(memberId, { description, category, amount, source, refId, date, title?, lines?, noReceipt? })
   * Every non-zero charge also gets a receipt (Club.receipts, js/core/receipts.js): title (else the description) and
   * lines [{ name, qty, price, size? }] (else one line for the description) go on the receipt, not on the charge.
   * noReceipt: true skips it. A negative amount makes a credit receipt.
   */
  Club.chargeMember = function (memberId, c) {
    const m = Club.store.find('members', memberId); if (!m) return null;
    const fields = Object.assign({}, c); delete fields.title; delete fields.lines; delete fields.noReceipt;
    const ch = Club.store.insert('charges', Object.assign({ memberId: memberId, date: Club.date.today(), category: 'Other', source: 'manual', refId: null, statementId: null }, fields, { amount: Math.round((+c.amount || 0) * 100) / 100 }));
    Club.store.update('members', memberId, { balance: Math.round(((m.balance || 0) + ch.amount) * 100) / 100 });
    if (!c.noReceipt && ch.amount && Club.receipts) {
      try {
        const amt = Math.abs(ch.amount);
        Club.receipts.create({ memberId: memberId, kind: ch.amount < 0 ? 'credit' : 'sale', title: c.title || c.description,
          lines: c.lines || [{ name: c.description, qty: 1, price: amt }], total: amt, method: 'account',
          source: ch.source, refId: ch.refId, chargeId: ch.id });
      } catch (e) { console.error('Receipt failed for charge ' + ch.id, e); }
    }
    return ch;
  };
  /* Manitoba: 5% GST + 7% PST */
  Club.taxRate = function () { return Club.store.getObj('taxRate', 0.12); };

  Club.staff = {
    get: function (id) { return Club.store.find('staff', id); },
    name: function (id) { const s = Club.store.find('staff', id); return s ? s.firstName + ' ' + s.lastName : 'Unassigned'; },
    options: function (selectedId, dept) {
      return Club.store.all('staff').filter(function (s) { return !dept || s.department === dept; })
        .map(function (s) { return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.firstName + ' ' + s.lastName) + ' · ' + esc(s.role) + '</option>'; }).join('');
    }
  };

  /* ---------------- Building blocks (return HTML strings) ---------------- */
  ui.pageHeader = function (o) {
    return '<header class="page-head"><div>' +
      (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') +
      '<h1>' + esc(o.title) + '</h1>' +
      (o.subtitle ? '<p class="subtitle">' + o.subtitle + '</p>' : '') +
      '</div>' + (o.actions ? '<div class="page-actions">' + o.actions + '</div>' : '') + '</header>';
  };
  ui.avatar = function (name, size, light) { return '<span class="avatar ' + (size || '') + (light ? ' light' : '') + '">' + esc(fmt.initials(name)) + '</span>'; };
  ui.person = function (name, sub, size) { return '<div class="person">' + ui.avatar(name, size || 'sm') + '<div style="min-width:0"><div class="person-name">' + esc(name) + '</div>' + (sub ? '<div class="person-sub">' + sub + '</div>' : '') + '</div></div>'; };
  ui.badge = function (text, kind) { return '<span class="badge ' + (kind || '') + '">' + esc(text) + '</span>'; };
  ui.btn = function (label, o) {
    o = o || {};
    return '<button type="button" class="btn ' + (o.kind ? 'btn-' + o.kind : '') + (o.sm ? ' btn-sm' : '') + '"' +
      (o.action ? ' data-action="' + o.action + '"' : '') + (o.id ? ' data-id="' + esc(o.id) + '"' : '') + (o.title ? ' title="' + esc(o.title) + '" aria-label="' + esc(o.title) + '"' : '') + '>' +
      (o.icon ? Club.icon(o.icon) : '') + (label ? '<span>' + esc(label) + '</span>' : '') + '</button>';
  };
  ui.empty = function (o) {
    return '<div class="empty">' + Club.icon(o.icon || 'flag') + '<h4>' + esc(o.title) + '</h4>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (o.action || '') + '</div>';
  };
  /** Stat strip: items [{label, value, prefix, suffix, decimals, meta, delta}] value animates via count-up */
  ui.stats = function (items) {
    return '<div class="stats">' + items.map(function (s) {
      const isNum = typeof s.value === 'number';
      return '<div class="stat" data-reveal><span class="label-caps">' + esc(s.label) + '</span><div class="stat-value">' +
        (isNum ? '<span data-count="' + s.value + '" data-prefix="' + esc(s.prefix || '') + '" data-decimals="' + (s.decimals || 0) + '">' + esc(s.prefix || '') + '0</span>' : esc(s.value)) +
        (s.suffix ? '<small>' + esc(s.suffix) + '</small>' : '') + '</div>' +
        ((s.meta || s.delta != null) ? '<div class="stat-meta">' + (s.delta != null ? '<span class="delta ' + (s.delta >= 0 ? 'up' : 'down') + '">' + (s.delta >= 0 ? '▲ ' : '▼ ') + Math.abs(s.delta) + '%</span>' : '') + (s.meta ? '<span>' + s.meta + '</span>' : '') + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  };
  /** Field helper: ui.field({label, name, type, value, options(html), required, hint, span2, placeholder}) */
  ui.field = function (o) {
    const id = 'f_' + o.name + '_' + Math.random().toString(36).slice(2, 6);
    const req = o.required ? ' required' : '';
    let control;
    if (o.type === 'select') control = '<select class="select" id="' + id + '" name="' + o.name + '"' + req + '>' + (o.options || '') + '</select>';
    else if (o.type === 'textarea') control = '<textarea class="textarea" id="' + id + '" name="' + o.name + '"' + req + ' placeholder="' + esc(o.placeholder || '') + '">' + esc(o.value || '') + '</textarea>';
    else control = '<input class="input" id="' + id + '" name="' + o.name + '" type="' + (o.type || 'text') + '" value="' + esc(o.value == null ? '' : o.value) + '"' + req + (o.min != null ? ' min="' + o.min + '"' : '') + (o.max != null ? ' max="' + o.max + '"' : '') + (o.step != null ? ' step="' + o.step + '"' : '') + ' placeholder="' + esc(o.placeholder || '') + '">';
    return '<div class="field' + (o.span2 ? ' span-2' : '') + '"><label for="' + id + '">' + esc(o.label) + (o.required ? ' *' : '') + '</label>' + control + (o.hint ? '<span class="field-hint">' + esc(o.hint) + '</span>' : '') + '</div>';
  };
  ui.options = function (arr, selected) {
    return arr.map(function (o) { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  };
  /** Read a form into an object. Numbers for type=number, booleans for checkboxes. */
  ui.formData = function (form) {
    const out = {};
    $$('input, select, textarea', form).forEach(function (f) {
      if (!f.name) return;
      if (f.type === 'checkbox') out[f.name] = f.checked;
      else if (f.type === 'radio') { if (f.checked) out[f.name] = f.value; }
      else if (f.type === 'number') out[f.name] = f.value === '' ? null : +f.value;
      else out[f.name] = f.value.trim();
    });
    return out;
  };
  /** Validate required fields; marks invalid and returns true when OK. */
  ui.validate = function (form) {
    let ok = true;
    $$('.field-error', form).forEach(function (e) { e.remove(); });
    $$('[required]', form).forEach(function (f) {
      f.classList.remove('invalid');
      if (!String(f.value).trim()) { ok = false; f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">This field is required.</span>'); }
    });
    if (!ok) { const first = $('.invalid', form); if (first) first.focus(); }
    return ok;
  };

  /* ---------------- Overlays ---------------- */
  let openCount = 0;
  /** Phones and tablets: no hover and a coarse pointer. */
  function touchUI() { return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches); }
  ui.touchUI = touchUI;
  /* On-screen keyboard: iOS does not shrink the layout viewport, so a bottom sheet would sit under the keyboard.
     --vvh is the visible height and --kb the keyboard's height; css/mobile.css lifts open sheets by --kb. */
  if (window.visualViewport) {
    let vvRaf = 0;
    const vv = window.visualViewport, root = document.documentElement;
    const syncVV = function () {
      vvRaf = 0;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
      root.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px');
    };
    const onVV = function () { if (!vvRaf) vvRaf = requestAnimationFrame(syncVV); };
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
  }
  /* Where focus goes back to when a dialog closes. A dialog opened by clicking something that cannot take focus (a card
     body) leaves focus on the page, so the last thing pressed is remembered and focus returns to it, or to the first
     control inside the card or row it belongs to. */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  let lastPress = null;
  document.addEventListener('pointerdown', function (e) { lastPress = e.target; }, true);
  function opener() {
    const a = document.activeElement;
    /* A click on plain content focuses the page itself (body, or a container such as <main tabindex="-1">). */
    const page = !a || a === document.body || a === document.documentElement || a.getAttribute('tabindex') === '-1';
    if (!page) return a;
    const t = lastPress && lastPress.closest ? lastPress : null;
    if (t && document.contains(t)) {
      const f = t.closest(FOCUSABLE); if (f) return f;
      const BOX = '[data-id], [data-href], article, li, tr, .card, .panel';
      for (let box = t.closest(BOX); box; box = box.parentElement && box.parentElement.closest(BOX)) { const f2 = $(FOCUSABLE, box); if (f2) return f2; }
    }
    return a && a !== document.body && a !== document.documentElement ? a : null;
  }
  /* The controls Tab can reach inside a dialog, in order: visible ones only, and one stop per radio group (the checked
     radio, else the first). The hidden native controls behind the custom pickers are skipped. */
  function tabStops(root) {
    const seen = {};
    return $$(FOCUSABLE, root).filter(function (x) {
      if (x.classList.contains('cs-native') || !x.getClientRects().length || getComputedStyle(x).visibility === 'hidden') return false;
      if (x.type === 'radio' && x.name) {
        if (seen[x.name]) return false;
        const group = $$('input[type=radio]', root).filter(function (r) { return r.name === x.name; });
        const pick = group.find(function (r) { return r.checked; }) || group[0];
        if (pick !== x) return false;
        seen[x.name] = 1;
      }
      return true;
    });
  }
  function makeOverlay(inner, cls, onClose) {
    const ov = el('<div class="overlay ' + (cls || '') + '" role="dialog" aria-modal="true"></div>');
    ov.appendChild(inner);
    const prevFocus = opener();
    let closed = false;
    function close(result) {
      if (closed) return; closed = true;
      ov.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { ov.remove(); openCount--; if (!openCount) { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; } if (prevFocus && prevFocus.focus && document.contains(prevFocus) && !touchUI()) prevFocus.focus({ preventScroll: true }); }, 170);
      if (onClose) onClose(result);
    }
    /* Keyboard focus stays inside the top dialog: Tab from the last control goes to the first and Shift+Tab from the
       first to the last. A picker list (js/core/pickers.js) or a members' portal sheet opened above it keeps its own keys. */
    function isTop() { return ov === $$('.overlay:not(.closing)').pop(); }
    function elsewhere(n) { return !!(n && n.closest && n.closest('.cs-pop, .ps-sheet, .toasts')); }
    function onKey(e) {
      if (e.key === 'Escape' && ov === $$('.overlay').pop()) { close(); return; }
      if (e.key !== 'Tab' || e.defaultPrevented || !isTop() || elsewhere(document.activeElement)) return;
      const f = tabStops(inner), a = document.activeElement;
      if (!f.length) { e.preventDefault(); if (!inner.hasAttribute('tabindex')) inner.setAttribute('tabindex', '-1'); inner.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!inner.contains(a) || a === inner) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); return; }
      if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); return; }
      /* Anything the list above missed (a control that hides when it loses focus): if Tab still left the dialog, bring it back. */
      const back = e.shiftKey ? last : first;
      setTimeout(function () { const n = document.activeElement; if (!closed && isTop() && !inner.contains(n) && !elsewhere(n)) back.focus(); }, 0);
    }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov); openCount++; document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden';
    /* On touch screens, focusing a field pops the keyboard the moment a dialog opens: focus the dialog itself instead
       (keyboard and screen reader users still land inside it). */
    setTimeout(function () {
      if (touchUI()) { inner.setAttribute('tabindex', '-1'); inner.focus({ preventScroll: true }); return; }
      const f = $('[autofocus], input:not([type=hidden]), select, textarea, button.btn-primary', inner);
      /* Nothing to start on (a confirm that deletes something, a menu of links): focus the dialog itself, so the
         keyboard is inside it and Tab starts at its first control. */
      if (f) f.focus(); else { if (!inner.hasAttribute('tabindex')) inner.setAttribute('tabindex', '-1'); inner.focus({ preventScroll: true }); }
    }, 60);
    return close;
  }
  /**
   * ui.modal({ title, eyebrow, body (html|Element), size: 'lg'|'xl', actions: [{label, kind, onClick(api) -> false keeps open}], onClose })
   * returns { el, body, close }
   */
  /* A double click on whatever opens a modal or drawer would stack two identical ones, so one close press seemed to do
     nothing. A repeat with the same title within a moment gets a detached copy that never shows (its set-up runs harmlessly). */
  let lastOverlay = { key: null, at: 0, ov: null };
  function isRepeat(kind, title) {
    const key = kind + '|' + (title || ''), now = Date.now();
    const repeat = lastOverlay.key === key && now - lastOverlay.at < 700 && lastOverlay.ov && document.body.contains(lastOverlay.ov) && !lastOverlay.ov.classList.contains('closing');
    if (!repeat) lastOverlay = { key: key, at: now, ov: null };
    return repeat;
  }
  function detached(node) {
    const body = $('.modal-body', node);
    return { el: node, body: body, close: function () {}, duplicate: true };
  }
  ui.modal = function (o) {
    const repeat = isRepeat('modal', o.title);
    const m = el('<div class="modal ' + (o.size || '') + '"><div class="modal-head"><div>' + (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') + '<h3>' + esc(o.title || '') + '</h3></div>' + ui.btn('', { icon: 'close', kind: 'ghost', sm: true, action: 'close', title: 'Close' }) + '</div><div class="modal-body"></div>' + (o.actions && o.actions.length ? '<div class="modal-foot"></div>' : '') + '</div>');
    const body = $('.modal-body', m);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    if (repeat) return detached(m);
    const api = { el: m, body: body, close: null };
    api.close = makeOverlay(m, '', o.onClose);
    lastOverlay.ov = m.parentNode;
    $('[data-action=close]', m).addEventListener('click', function () { api.close(); });
    if (o.actions) {
      const foot = $('.modal-foot', m);
      o.actions.forEach(function (a) {
        const b = el(ui.btn(a.label, { kind: a.kind, icon: a.icon }));
        b.addEventListener('click', function () { if (!a.onClick || a.onClick(api) !== false) api.close(); });
        foot.appendChild(b);
      });
    }
    return api;
  };
  ui.drawer = function (o) {
    const repeat = isRepeat('drawer', o.title);
    const d = el('<aside class="drawer"><div class="modal-head"><div>' + (o.eyebrow ? '<div class="eyebrow">' + esc(o.eyebrow) + '</div>' : '') + '<h3>' + esc(o.title || '') + '</h3></div>' + ui.btn('', { icon: 'close', kind: 'ghost', sm: true, action: 'close', title: 'Close' }) + '</div><div class="modal-body"></div>' + (o.actions && o.actions.length ? '<div class="modal-foot"></div>' : '') + '</aside>');
    const body = $('.modal-body', d);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    if (repeat) return detached(d);
    const api = { el: d, body: body };
    api.close = makeOverlay(d, 'drawer-overlay', o.onClose);
    lastOverlay.ov = d.parentNode;
    $('[data-action=close]', d).addEventListener('click', function () { api.close(); });
    if (o.actions) {
      const foot = $('.modal-foot', d);
      o.actions.forEach(function (a) { const b = el(ui.btn(a.label, { kind: a.kind, icon: a.icon })); b.addEventListener('click', function () { if (!a.onClick || a.onClick(api) !== false) api.close(); }); foot.appendChild(b); });
    }
    return api;
  };
  /** ui.confirm({title, text, confirmLabel, cancelLabel, danger}) -> Promise<boolean> */
  ui.confirm = function (o) {
    return new Promise(function (resolve) {
      let answered = false;
      ui.modal({
        title: o.title || 'Are you sure?', body: '<p class="ink-2">' + esc(o.text || '') + '</p>',
        actions: [
          { label: o.cancelLabel || 'Cancel', kind: 'ghost' },
          { label: o.confirmLabel || 'Confirm', kind: o.danger ? 'danger' : 'primary', onClick: function () { answered = true; resolve(true); } }
        ],
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  };
  /** ui.toast(msg, kind, { action: { label, onClick } }): an optional button (e.g. Undo) keeps the toast up longer;
      clicking it runs onClick once and dismisses the toast. */
  ui.toast = function (msg, kind, opts) {
    let wrap = $('.toasts'); if (!wrap) { wrap = el('<div class="toasts" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const act = opts && opts.action;
    const t = el('<div class="toast ' + (kind || '') + (act ? ' has-act' : '') + '">' + Club.icon(kind === 'bad' ? 'alert' : 'check') + '<span>' + esc(msg) + '</span>' +
      (act ? '<button type="button" class="toast-act">' + esc(act.label) + '</button><button type="button" class="toast-x" aria-label="Dismiss">' + Club.icon('close') + '</button>' : '') + '</div>');
    wrap.appendChild(t);
    let gone = false;
    const leave = function () { if (gone) return; gone = true; t.classList.add('leaving'); setTimeout(function () { t.remove(); }, 320); };
    if (act) t.querySelector('.toast-act').addEventListener('click', function () { if (gone) return; leave(); act.onClick(); });
    if (act) t.querySelector('.toast-x').addEventListener('click', leave);
    setTimeout(leave, act ? 8000 : 3200);
  };

  /* ---------------- Tabs ---------------- */
  /**
   * ui.tabs(container, [{id, label, render(panelEl)}], activeId, onChange)
   * Renders a tab strip with a sliding brass underline.
   */
  ui.tabs = function (container, tabs, activeId, onChange) {
    container.innerHTML = '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button class="tab" role="tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') + '<span class="tab-ink"></span></div><div class="tab-host"></div>';
    const host = $('.tab-host', container); const ink = $('.tab-ink', container);
    function activate(id) {
      const t = tabs.find(function (x) { return x.id === id; }) || tabs[0];
      $$('.tab', container).forEach(function (b) { const a = b.dataset.tab === t.id; b.classList.toggle('active', a); b.setAttribute('aria-selected', a); if (a) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = 'translateX(' + b.offsetLeft + 'px)'; } });
      host.innerHTML = ''; const panel = el('<div class="tab-panel"></div>'); host.appendChild(panel); t.render(panel); ui.animateIn(panel);
      if (onChange) onChange(t.id);
    }
    on(container, 'click', '.tab', function (e, b) { activate(b.dataset.tab); });
    activate(activeId || tabs[0].id);
    requestAnimationFrame(function () { const a = $('.tab.active', container); if (a) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = 'translateX(' + a.offsetLeft + 'px)'; } });
    return { activate: activate };
  };

  /** Segmented control: ui.segmented([{value,label}], selected) html; wire with on(root,'click','.segmented button',...) */
  ui.segmented = function (items, selected, name) {
    return '<div class="segmented" data-name="' + esc(name || '') + '">' + items.map(function (i) { return '<button type="button" data-value="' + esc(i.value) + '" class="' + (i.value === selected ? 'active' : '') + '">' + esc(i.label) + '</button>'; }).join('') + '</div>';
  };

  /* ---------------- Motion ---------------- */
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Count up any [data-count] inside root. */
  ui.countUp = function (root) {
    $$('[data-count]:not([data-counted])', root).forEach(function (n) {
      n.setAttribute('data-counted', '');
      const target = +n.dataset.count; const dec = +(n.dataset.decimals || 0); const pre = n.dataset.prefix || '';
      const f = function (v) { return pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
      if (reduce) { n.textContent = f(target); return; }
      const dur = 1100; const t0 = performance.now();
      (function tick(t) { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 4); n.textContent = f(target * e); if (p < 1) requestAnimationFrame(tick); })(t0);
    });
  };
  /** Stagger-reveal [data-reveal] elements and run count-ups. Call after rendering. */
  ui.animateIn = function (root) {
    root = root || document;
    const items = $$('[data-reveal]:not(.revealed)', root);
    items.forEach(function (n, i) { n.dataset.revealing = '1'; setTimeout(function () { n.classList.add('revealed'); delete n.dataset.revealing; }, reduce ? 0 : 40 + i * 55); });
    ui.countUp(root);
    if (Club.charts && Club.charts.animate) Club.charts.animate(root);
  };
  /* Safety net: [data-reveal] content starts invisible and only appears through animateIn, so a section redrawn
     without it (after booking a lesson or a table, a live refresh) stayed blank. Two frames after anything is added,
     content that is neither revealed nor about to be (data-revealing) is shown, and count-ups that never ran show
     their number. Fade-ins started by animateIn are untouched. */
  function settle(nodes) {
    nodes.forEach(function (root) {
      if (!root.isConnected) return;
      const rs = $$('[data-reveal]:not(.revealed)', root); if (root.matches && root.matches('[data-reveal]:not(.revealed)')) rs.push(root);
      rs.forEach(function (n) { if (!n.dataset.revealing) n.classList.add('revealed'); });
      const cs = $$('[data-count]:not([data-counted])', root); if (root.matches && root.matches('[data-count]:not([data-counted])')) cs.push(root);
      cs.forEach(function (n) { const dec = +(n.dataset.decimals || 0); n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); });
    });
  }
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      const added = [];
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) added.push(n); }); });
      if (added.length) requestAnimationFrame(function () { requestAnimationFrame(function () { settle(added); }); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------------- Phone numbers: (204) 555-0100 everywhere ----------------
     Every phone field (input[type=tel]) formats itself as the person types, on all three sites. Numbers with an
     extension or letters ("x215") and numbers that are not 10 digits are left as typed. ui.phone(v) formats a stored
     value, an extension included: "204-233-2497 x215" -> "(204) 233-2497 ext. 215"; a pass after each load rewrites the
     phone fields already on file. */
  function phoneDigits(v) { let d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; }
  function phonePlain(v) { return !/[a-z]/i.test(String(v == null ? '' : v)); }
  ui.phone = function (v) {
    const x = String(v == null ? '' : v).trim().match(/^(.*?)\s*(?:x|ext\.?|extension)\s*(\d{1,6})$/i);
    if (x && phonePlain(x[1]) && phoneDigits(x[1]).length === 10) return ui.phone(x[1]) + ' ext. ' + x[2];
    const d = phoneDigits(v);
    return d.length === 10 && phonePlain(v) ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v == null ? '' : v).trim();
  };
  /** As-you-type: "(204", "(204) 555", "(204) 555-0100". */
  function phoneTyping(v) {
    const d = phoneDigits(v).slice(0, 10);
    if (!d) return '';
    if (d.length <= 3) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function phoneInput(el, typing) {
    const v = el.value;
    if (!v || !phonePlain(v)) return;
    const out = typing ? phoneTyping(v) : (phoneDigits(v).length === 10 ? ui.phone(v) : v);
    if (out === v) return;
    let caret = null;
    try { if (typing && document.activeElement === el && el.selectionStart != null) caret = v.slice(0, el.selectionStart).replace(/\D/g, '').length; } catch (e) { /* no selection API on this input type */ }
    el.value = out;
    if (caret != null) {
      /* keep the caret after the same digit it was after */
      let pos = 0, seen = 0;
      while (pos < out.length && seen < caret) { if (/\d/.test(out[pos])) seen++; pos++; }
      if (caret >= out.replace(/\D/g, '').length) pos = out.length;
      try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }
  }
  function isTel(el) { return el && el.tagName === 'INPUT' && el.type === 'tel'; }
  function dressTel(el) {
    if (el.placeholder && /^[\d\s().-]{10,}$/.test(el.placeholder) && phoneDigits(el.placeholder).length === 10) el.placeholder = ui.phone(el.placeholder);
    phoneInput(el, false);
  }
  document.addEventListener('input', function (e) { if (isTel(e.target) && e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') phoneInput(e.target, true); }, true);
  document.addEventListener('focusout', function (e) { if (isTel(e.target)) phoneInput(e.target, false); }, true);
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (isTel(n)) dressTel(n);
        else if (n.querySelectorAll) n.querySelectorAll('input[type=tel]').forEach(dressTel);
      }); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  /* Phone fields already on file take the same format (keys phone / mobile / cell, up to four levels deep). Runs after
     each page has loaded, since demo records can be seeded late; it only writes when something actually changes. */
  window.addEventListener('load', function () {
    const S = Club.store;
    if (!S || !S.keys) return;
    const fix = function (o, depth) {
      let hit = false;
      if (!o || typeof o !== 'object' || depth > 4) return false;
      Object.keys(o).forEach(function (k) {
        const v = o[k];
        if (typeof v === 'string' && /^(phone|mobile|cell)$/i.test(k)) { const f = ui.phone(v); if (f !== v) { o[k] = f; hit = true; } }
        else if (v && typeof v === 'object') { if (fix(v, depth + 1)) hit = true; }
      });
      return hit;
    };
    setTimeout(function () {
      try { S.keys().forEach(function (k) { const arr = S.all(k); if (k[0] !== '$' && Array.isArray(arr) && fix(arr, 0)) S.replace(k, arr); }); }
      catch (e) { console.warn('Phone format pass skipped', e); }
    }, 400);
  });

  Club.ui = ui;
})();
