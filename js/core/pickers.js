/* Club.pickers: the app's own dropdown list and calendar in place of the browser's (Safari's menus and date popover).
   Every <select class="select"> and <input type="date"> on a page is enhanced automatically (a MutationObserver
   watches for new ones): the native control stays in the form, hidden, and keeps the value, so forms, ui.validate,
   ui.formData and change listeners work unchanged. A button shows the value and opens a popover list or calendar.
   Focus stays on the button while it is open (the list is driven by aria-activedescendant), so the focus traps
   of modals and sheets are never involved; Escape closes only the popover. Setting .value from code updates the
   button too. Skipped: <select multiple>, anything with data-native, and controls already enhanced. */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const esc = function (s) { return Club.ui.esc(s); };
  const SV = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const SI = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  const IV = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let open = null, uid = 0;   /* open = { pop, btn, onKey, close } */

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function fire(node) { node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }
  /** Make value (and selectedIndex) setters on this element refresh the button. */
  function watch(node, prop, d, refresh) {
    Object.defineProperty(node, prop, { configurable: true, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); refresh(); } });
  }
  /** The visible button, inserted before the native control (so errors added after it still sit under both). */
  function makeButton(native, kind) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = native.className.split(/\s+/).filter(function (c) { return c && c !== 'cs-native' && c !== 'invalid'; }).join(' ') + ' cs-btn cs-' + kind;
    if (native.getAttribute('style')) btn.setAttribute('style', native.getAttribute('style'));
    btn.id = (native.id || 'cs' + (++uid)) + '-btn';
    btn.setAttribute('aria-haspopup', kind === 'date' ? 'dialog' : 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const lab = native.id ? document.querySelector('label[for="' + CSS.escape(native.id) + '"]') : null;
    if (lab) { if (!lab.id) lab.id = native.id + '-lab'; btn.setAttribute('aria-labelledby', lab.id + ' ' + btn.id); }
    else if (native.getAttribute('aria-label')) btn.setAttribute('aria-label', native.getAttribute('aria-label'));
    native.parentNode.insertBefore(btn, native);
    native.classList.add('cs-native'); native.tabIndex = -1; native.setAttribute('aria-hidden', 'true');
    native.addEventListener('focus', function () { btn.focus(); });   /* ui.validate focuses the first invalid field */
    return btn;
  }
  function mirror(native, btn, refresh) {
    new MutationObserver(function () {
      btn.disabled = native.disabled;
      btn.hidden = native.hidden || native.style.display === 'none';
      btn.classList.toggle('invalid', native.classList.contains('invalid'));
      refresh();
    }).observe(native, { attributes: true, attributeFilter: ['class', 'disabled', 'hidden', 'style'], childList: true, subtree: true, characterData: true });
    native.addEventListener('change', refresh);
    btn.disabled = native.disabled;
    btn.hidden = native.hidden || native.style.display === 'none';   /* also when the control starts out hidden */
  }

  /* ---------------- Popover ---------------- */
  function close(refocus) {
    if (!open) return;
    const o = open; open = null;
    o.pop.remove(); o.btn.setAttribute('aria-expanded', 'false'); o.btn.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', o.outside, true);
    window.removeEventListener('resize', o.reflow); document.removeEventListener('scroll', o.scrolled, true);
    if (refocus) o.btn.focus();
  }
  function place(pop, btn) {
    const r = btn.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    pop.style.minWidth = Math.max(r.width, 200) + 'px';
    pop.style.maxHeight = '';
    const h = pop.offsetHeight, below = vh - r.bottom - 8, above = r.top - 8;
    const up = h > below && above > below;
    const room = Math.max(160, up ? above : below);
    if (h > room) pop.style.maxHeight = room + 'px';
    pop.style.top = (up ? Math.max(8, r.top - Math.min(h, room) - 4) : r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, vw - pop.offsetWidth - 8)) + 'px';
  }
  function show(btn, pop, onKey) {
    close();
    document.body.appendChild(pop);
    place(pop, btn);
    btn.setAttribute('aria-expanded', 'true');
    pop.addEventListener('pointerdown', function (e) { if (!e.target.closest('.cs-search')) e.preventDefault(); });   /* keep focus on the button (the search box takes its own) */
    const o = { pop: pop, btn: btn, onKey: onKey,
      outside: function (e) { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); },
      reflow: function () { place(pop, btn); },
      scrolled: function (e) { if (!pop.contains(e.target)) close(); } };
    open = o;
    /* Safari does not focus a button on click, so focus it here: the list's keys (arrows, Enter, type-to-jump)
       are handled on the button. */
    if (document.activeElement !== btn) btn.focus({ preventScroll: true });
    document.addEventListener('pointerdown', o.outside, true);
    window.addEventListener('resize', o.reflow); document.addEventListener('scroll', o.scrolled, true);
  }

  /* ---------------- Dropdown list ---------------- */
  function enhanceSelect(sel) {
    if (sel.dataset.cs || sel.multiple || sel.hasAttribute('data-native') || !sel.parentNode) return;
    sel.dataset.cs = '1';
    const btn = makeButton(sel, 'select');
    function refresh() { const o = sel.options[sel.selectedIndex]; const t = o ? o.text : ''; const v = btn.querySelector('.cs-val'); if (v) v.textContent = t; else btn.innerHTML = '<span class="cs-val">' + esc(t) + '</span>'; }
    watch(sel, 'value', SV, refresh); watch(sel, 'selectedIndex', SI, refresh);
    mirror(sel, btn, refresh); refresh();
    let active = -1, typed = '', typedAt = 0;
    function opts() { return Array.prototype.slice.call(sel.options); }
    function choose(i) {
      const o = sel.options[i]; if (!o || o.disabled) return;
      if (sel.selectedIndex !== i) { SI.set.call(sel, i); refresh(); fire(sel); }
      close(true);
    }
    function setActive(pop, i) {
      active = i;
      pop.querySelectorAll('.cs-opt').forEach(function (n) { n.classList.toggle('is-active', +n.dataset.i === i); });
      const n = pop.querySelector('.cs-opt[data-i="' + i + '"]');
      if (n) { btn.setAttribute('aria-activedescendant', n.id); n.scrollIntoView({ block: 'nearest' }); }
    }
    function shown(pop, i) { const n = pop.querySelector('.cs-opt[data-i="' + i + '"]'); return !!n && !n.hidden; }
    function step(pop, dir) {
      const os = opts(); let i = active;
      for (let k = 0; k < os.length; k++) { i = (i + dir + os.length) % os.length; if (!os[i].disabled && shown(pop, i)) break; }
      setActive(pop, i);
    }
    /* Long lists (more than 12 choices) get a search box at the top that filters as you type (Nov 12). */
    const SEARCH_AT = 12;
    function filter(pop, q) {
      q = q.trim().toLowerCase();
      let first = -1, any = false;
      pop.querySelectorAll('.cs-opt').forEach(function (n) {
        const hit = !q || n.textContent.toLowerCase().indexOf(q) >= 0;
        n.hidden = !hit;
        if (hit) { any = true; if (first < 0 && !n.classList.contains('is-off')) first = +n.dataset.i; }
      });
      pop.querySelectorAll('.cs-group').forEach(function (g) {
        let n = g.nextElementSibling, vis = false;
        while (n && !n.classList.contains('cs-group')) { if (n.classList.contains('cs-opt') && !n.hidden) { vis = true; break; } n = n.nextElementSibling; }
        g.hidden = !vis;
      });
      const none = pop.querySelector('.cs-none'); if (none) none.hidden = any;
      if (!shown(pop, active) && first >= 0) setActive(pop, first);
    }
    function openList() {
      if (sel.disabled) return;
      const base = btn.id + '-o';
      const searchable = opts().filter(function (o) { return !o.disabled; }).length > SEARCH_AT;
      let html = '<div class="cs-pop' + (searchable ? ' has-search' : '') + '" role="listbox" id="' + base + 's" aria-labelledby="' + (btn.getAttribute('aria-labelledby') || btn.id) + '">' +
        (searchable ? '<div class="cs-search" role="presentation"><input type="search" class="input cs-search-in" placeholder="Search" aria-label="Search the list" autocomplete="off" enterkeyhint="done"></div><div class="cs-none" hidden>No matches</div>' : ''), group = null;
      opts().forEach(function (o, i) {
        const g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : null;
        if (g && g !== group) { html += '<div class="cs-group" role="presentation">' + esc(g) + '</div>'; group = g; }
        const on = i === sel.selectedIndex;
        html += '<div class="cs-opt' + (on ? ' is-on' : '') + (o.disabled ? ' is-off' : '') + '" role="option" id="' + base + i + '" data-i="' + i + '" aria-selected="' + on + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' +
          '<span class="cs-tick" aria-hidden="true">' + (Club.icon ? Club.icon('check') : '') + '</span><span>' + esc(o.text) + '</span></div>';
      });
      const pop = el(html + '</div>');
      btn.setAttribute('aria-controls', pop.id);
      pop.addEventListener('click', function (e) { const n = e.target.closest('.cs-opt'); if (n && !n.classList.contains('is-off')) choose(+n.dataset.i); });
      pop.addEventListener('mousemove', function (e) { const n = e.target.closest('.cs-opt'); if (n && +n.dataset.i !== active && !n.classList.contains('is-off')) setActive(pop, +n.dataset.i); });
      show(btn, pop);
      setActive(pop, sel.selectedIndex >= 0 ? sel.selectedIndex : 0);
      const sIn = pop.querySelector('.cs-search-in');
      if (sIn) {
        sIn.addEventListener('input', function () { filter(pop, sIn.value); });
        sIn.addEventListener('keydown', onKey);
        /* On touch screens the box waits for a tap, so the keyboard does not cover the list straight away. */
        if (!(Club.ui && Club.ui.touchUI && Club.ui.touchUI())) sIn.focus({ preventScroll: true });
      }
    }
    btn.addEventListener('click', function () { if (open && open.btn === btn) close(true); else openList(); });
    btn.addEventListener('keydown', onKey);
    function onKey(e) {
      const isOpen = open && open.btn === btn, pop = isOpen ? open.pop : null;
      const inSearch = e.target && e.target.classList && e.target.classList.contains('cs-search-in');
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.key === 'Tab') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); step(pop, 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); step(pop, -1); return; }
      if (inSearch && (e.key === 'Home' || e.key === 'End' || e.key === ' ' || e.key.length === 1)) return;   /* typing goes into the search box */
      if (e.key === 'Home') { e.preventDefault(); active = -1; step(pop, 1); return; }
      if (e.key === 'End') { e.preventDefault(); active = 0; step(pop, -1); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (shown(pop, active)) choose(active); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {   /* type to jump */
        const sIn = pop.querySelector('.cs-search-in');
        if (sIn) { e.preventDefault(); sIn.focus({ preventScroll: true }); sIn.value += e.key; filter(pop, sIn.value); return; }
        const now = Date.now(); typed = (now - typedAt < 700 ? typed : '') + e.key.toLowerCase(); typedAt = now;
        const os = opts(), hit = os.findIndex(function (o) { return !o.disabled && o.text.toLowerCase().indexOf(typed) === 0; });
        if (hit >= 0) setActive(pop, hit);
      }
    }
  }

  /* ---------------- Calendar ---------------- */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parse(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function enhanceDate(inp) {
    if (inp.dataset.cs || inp.hasAttribute('data-native') || !inp.parentNode) return;
    inp.dataset.cs = '1';
    const btn = makeButton(inp, 'date');
    function refresh() {
      const d = parse(inp.value);
      btn.innerHTML = (Club.icon ? Club.icon('calendar') : '') + '<span class="cs-val' + (d ? '' : ' is-empty') + '">' + esc(d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a date') + '</span>';
    }
    watch(inp, 'value', IV, refresh);
    mirror(inp, btn, refresh); refresh();
    let view = null, focusDay = null;
    function allowed(d) { const mn = parse(inp.min), mx = parse(inp.max); return (!mn || d >= mn) && (!mx || d <= mx); }
    function pick(d) { if (!d || !allowed(d)) return; if (inp.value !== iso(d)) { IV.set.call(inp, iso(d)); refresh(); fire(inp); } close(true); }
    function draw(pop) {
      const first = new Date(view.getFullYear(), view.getMonth(), 1), start = new Date(first); start.setDate(1 - first.getDay());
      const sel = parse(inp.value), today = iso(new Date());
      let days = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const k = iso(d), out = d.getMonth() !== view.getMonth(), ok = allowed(d);
        days += '<button type="button" tabindex="-1" class="cs-day' + (out ? ' is-out' : '') + (k === today ? ' is-today' : '') + (sel && k === iso(sel) ? ' is-on' : '') + (focusDay && k === iso(focusDay) ? ' is-active' : '') + '" data-d="' + k + '"' + (ok ? '' : ' disabled') +
          ' aria-label="' + esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '"' + (sel && k === iso(sel) ? ' aria-pressed="true"' : '') + '>' + d.getDate() + '</button>';
      }
      pop.innerHTML = '<div class="cs-cal-head"><button type="button" tabindex="-1" class="cs-nav" data-m="-1" aria-label="Previous month">' + (Club.icon ? Club.icon('chevronLeft') : '‹') + '</button>' +
          '<span class="cs-cal-t" aria-live="polite">' + MONTHS[view.getMonth()] + ' ' + view.getFullYear() + '</span>' +
          '<button type="button" tabindex="-1" class="cs-nav" data-m="1" aria-label="Next month">' + (Club.icon ? Club.icon('chevronRight') : '›') + '</button></div>' +
        '<div class="cs-cal-grid" role="grid"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>' + days + '</div>' +
        '<div class="cs-cal-foot"><button type="button" tabindex="-1" class="cs-link" data-today' + (allowed(parse(today)) ? '' : ' disabled') + '>Today</button>' +
          (inp.required ? '' : '<button type="button" tabindex="-1" class="cs-link" data-clear>Clear</button>') + '</div>';
      if (open && open.pop === pop) place(pop, btn);
    }
    function move(pop, days, months) {
      const d = new Date(focusDay || parse(inp.value) || new Date());
      if (months) d.setMonth(d.getMonth() + months); else d.setDate(d.getDate() + days);
      focusDay = d; view = new Date(d.getFullYear(), d.getMonth(), 1); draw(pop);
    }
    function openCal() {
      if (inp.disabled) return;
      const cur = parse(inp.value) || parse(iso(new Date()));   /* midnight, so a max of today can be picked by keyboard */
      view = new Date(cur.getFullYear(), cur.getMonth(), 1); focusDay = cur;
      const pop = el('<div class="cs-pop cs-cal" role="dialog" aria-label="Choose a date"></div>');
      pop.addEventListener('click', function (e) {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.m) { view.setMonth(view.getMonth() + +b.dataset.m); focusDay = null; draw(pop); return; }
        if (b.dataset.d) { pick(parse(b.dataset.d)); return; }
        if (b.hasAttribute('data-today')) { pick(parse(iso(new Date()))); return; }
        if (b.hasAttribute('data-clear')) { if (inp.value) { IV.set.call(inp, ''); refresh(); fire(inp); } close(true); }
      });
      show(btn, pop);
      draw(pop);
    }
    btn.addEventListener('click', function () { if (open && open.btn === btn) close(true); else openCal(); });
    btn.addEventListener('keydown', function (e) {
      const isOpen = open && open.btn === btn, pop = isOpen ? open.pop : null;
      if (!isOpen) { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCal(); } return; }
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (k === 'Tab') { close(); return; }
      const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [-7, 0], ArrowDown: [7, 0], PageUp: [0, -1], PageDown: [0, 1] };
      if (map[k]) { e.preventDefault(); move(pop, map[k][0], map[k][1]); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(focusDay); }
    });
  }

  /* ---------------- Time list ----------------
     <input type="time">: a dropdown of times every `step` (the input's step in seconds, else 15 minutes), within min and
     max. A value that is not on the step is listed too, so an existing time is never lost. */
  function hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function mins(s) { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
  function timeLabel(s) {
    if (Club.fmt && Club.fmt.time) return Club.fmt.time(s);
    const m = mins(s), h = Math.floor(m / 60) % 12 || 12; return h + ':' + String(m % 60).padStart(2, '0') + (m < 720 ? ' AM' : ' PM');
  }
  function enhanceTime(inp) {
    if (inp.dataset.cs || inp.hasAttribute('data-native') || !inp.parentNode) return;
    inp.dataset.cs = '1';
    const btn = makeButton(inp, 'time');
    btn.setAttribute('aria-haspopup', 'listbox');
    function refresh() {
      const v = IV.get.call(inp);
      btn.innerHTML = (Club.icon ? Club.icon('clock') : '') + '<span class="cs-val' + (v ? '' : ' is-empty') + '">' + esc(v ? timeLabel(v) : 'Choose a time') + '</span>';
    }
    watch(inp, 'value', IV, refresh);
    mirror(inp, btn, refresh); refresh();
    let active = -1, typed = '', typedAt = 0, list = [];
    function times() {
      const st = +inp.step >= 60 ? Math.round(+inp.step / 60) : 15;
      const lo = mins(inp.min) != null ? mins(inp.min) : 0, hi = mins(inp.max) != null ? mins(inp.max) : 23 * 60 + 59;
      const out = []; for (let m = Math.ceil(lo / st) * st; m <= hi; m += st) out.push(hm(m));
      const v = IV.get.call(inp);
      if (v && out.indexOf(v.slice(0, 5)) < 0) { out.push(v.slice(0, 5)); out.sort(); }
      return out;
    }
    function choose(i) {
      const v = list[i]; if (!v) return;
      if (IV.get.call(inp) !== v) { IV.set.call(inp, v); refresh(); fire(inp); }
      close(true);
    }
    function setActive(pop, i) {
      active = i;
      pop.querySelectorAll('.cs-opt').forEach(function (n) { n.classList.toggle('is-active', +n.dataset.i === i); });
      const n = pop.querySelector('.cs-opt[data-i="' + i + '"]');
      if (n) { btn.setAttribute('aria-activedescendant', n.id); n.scrollIntoView({ block: 'nearest' }); }
    }
    function openList() {
      if (inp.disabled) return;
      list = times();
      const base = btn.id + '-o', v = (IV.get.call(inp) || '').slice(0, 5);
      const pop = el('<div class="cs-pop" role="listbox" id="' + base + 's" aria-labelledby="' + (btn.getAttribute('aria-labelledby') || btn.id) + '">' + list.map(function (t, i) {
        const on = t === v;
        return '<div class="cs-opt' + (on ? ' is-on' : '') + '" role="option" id="' + base + i + '" data-i="' + i + '" aria-selected="' + on + '"><span class="cs-tick" aria-hidden="true">' + (Club.icon ? Club.icon('check') : '') + '</span><span>' + esc(timeLabel(t)) + '</span></div>';
      }).join('') + '</div>');
      btn.setAttribute('aria-controls', pop.id);
      pop.addEventListener('click', function (e) { const n = e.target.closest('.cs-opt'); if (n) choose(+n.dataset.i); });
      pop.addEventListener('mousemove', function (e) { const n = e.target.closest('.cs-opt'); if (n && +n.dataset.i !== active) setActive(pop, +n.dataset.i); });
      show(btn, pop);
      /* Start on the current time, else the nearest to midday, so the list opens somewhere useful. */
      let i = list.indexOf(v);
      if (i < 0) { const noon = 12 * 60; i = 0; list.forEach(function (t, k) { if (Math.abs(mins(t) - noon) < Math.abs(mins(list[i]) - noon)) i = k; }); }
      setActive(pop, i);
    }
    btn.addEventListener('click', function () { if (open && open.btn === btn) close(true); else openList(); });
    btn.addEventListener('keydown', function (e) {
      const isOpen = open && open.btn === btn, pop = isOpen ? open.pop : null;
      if (!isOpen) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); } return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.key === 'Tab') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(pop, Math.min(list.length - 1, active + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(pop, Math.max(0, active - 1)); return; }
      if (e.key === 'Home') { e.preventDefault(); setActive(pop, 0); return; }
      if (e.key === 'End') { e.preventDefault(); setActive(pop, list.length - 1); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {   /* type to jump: "2" finds 2:00, "2:3" finds 2:30 */
        const now = Date.now(); typed = (now - typedAt < 900 ? typed : '') + e.key.toLowerCase(); typedAt = now;
        const hit = list.findIndex(function (t) { return timeLabel(t).toLowerCase().indexOf(typed) === 0 && mins(t) >= 6 * 60; });
        const any = hit >= 0 ? hit : list.findIndex(function (t) { return timeLabel(t).toLowerCase().indexOf(typed) === 0; });
        if (any >= 0) setActive(pop, any);
      }
    });
  }

  /* ---------------- Date and time ----------------
     <input type="datetime-local">: a date picker and a time list side by side (unnamed helper inputs, enhanced like
     any other), writing "YYYY-MM-DDTHH:MM" back to the original input. */
  function enhanceDateTime(inp) {
    if (inp.dataset.cs || inp.hasAttribute('data-native') || !inp.parentNode) return;
    inp.dataset.cs = '1';
    const wrap = document.createElement('span');
    wrap.className = 'cs-dt';
    const d = document.createElement('input'); d.type = 'date'; d.className = inp.className;
    const t = document.createElement('input'); t.type = 'time'; t.className = inp.className;
    if (inp.min) { d.min = inp.min.slice(0, 10); }
    if (inp.max) { d.max = inp.max.slice(0, 10); }
    if (inp.getAttribute('aria-label')) { d.setAttribute('aria-label', inp.getAttribute('aria-label') + ', date'); t.setAttribute('aria-label', inp.getAttribute('aria-label') + ', time'); }
    else { d.setAttribute('aria-label', 'Date'); t.setAttribute('aria-label', 'Time'); }
    function split() { const v = IV.get.call(inp) || ''; IV.set.call(d, v.slice(0, 10)); IV.set.call(t, v.slice(11, 16)); }
    split();
    wrap.appendChild(d); wrap.appendChild(t);
    inp.parentNode.insertBefore(wrap, inp);
    inp.classList.add('cs-native'); inp.tabIndex = -1; inp.setAttribute('aria-hidden', 'true');
    watch(inp, 'value', IV, function () { split(); d.value = d.value; t.value = t.value; });   /* re-set so their buttons redraw */
    function join() {
      const dv = IV.get.call(d), tv = IV.get.call(t);
      const v = dv && tv ? dv + 'T' + tv : '';
      if (IV.get.call(inp) !== v) { IV.set.call(inp, v); fire(inp); }
    }
    d.addEventListener('change', function (e) { e.stopPropagation(); join(); });
    t.addEventListener('change', function (e) { e.stopPropagation(); join(); });
    d.addEventListener('input', function (e) { e.stopPropagation(); });
    t.addEventListener('input', function (e) { e.stopPropagation(); });
    inp.addEventListener('focus', function () { const b = wrap.querySelector('.cs-btn'); if (b) b.focus(); });
    new MutationObserver(function () { wrap.classList.toggle('invalid', inp.classList.contains('invalid')); wrap.querySelectorAll('.cs-btn').forEach(function (b) { b.classList.toggle('invalid', inp.classList.contains('invalid')); }); })
      .observe(inp, { attributes: true, attributeFilter: ['class'] });
    enhanceDate(d); enhanceTime(t);
  }

  /* ---------------- Auto-enhance ---------------- */
  const SEL = { 'select.select': enhanceSelect, 'input[type=date]': enhanceDate, 'input[type=time]': enhanceTime, 'input[type=datetime-local]': enhanceDateTime };
  function enhance(root) {
    if (!root || !root.querySelectorAll) return;
    Object.keys(SEL).forEach(function (q) {
      if (root.matches && root.matches(q)) SEL[q](root);
      root.querySelectorAll(q).forEach(SEL[q]);
    });
  }
  function start() {
    /* Escape with a popover open closes only the popover. Listening on window in the capture phase runs before
       the document-level Escape handlers of modals and sheets, so they never see it. */
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !open) return;
      e.preventDefault(); e.stopImmediatePropagation();
      close(document.contains(open.btn));
    }, true);
    enhance(document.body);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) enhance(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  Club.pickers = { enhance: enhance, close: function () { close(); } };
})();
