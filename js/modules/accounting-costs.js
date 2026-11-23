/* Accounting, Monthly costs tab (Nov 23, 2026): what each department cost in a month, typed by the bookkeeper and read
   by Reports > Profit. Joins the Accounting page (js/modules/accounting.js) through window.__accountingTabs, after
   Export (30) and Account mapping (40). Data: Club.costs (js/shared/costs-data.js); nothing is stored here.

   Route: #/accounting/costs, or #/accounting/costs/YYYY-MM for a month (the last 24 months up to this month).
   Typed figures are a draft (kept in memory while staff move between tabs) until Save. Save, Clear this month and the
   demo fills write through Club.undo, so each gets an Undo toast. Pro shop "Stock sold" is read-only and never stored
   when the till covers the month (Club.costs.totals adds the till's figure itself). Prefix mc-. */
(function () {
  'use strict';
  window.__accountingTabs = window.__accountingTabs || [];
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const C = function () { return Club.costs; };
  const RANGE = 24;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ---------------- Months and money ---------------- */
  function thisMonth() { return Club.date.today().slice(0, 7); }
  function addMonths(m, n) { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; const d = new Date(y, mo, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function defaultMonth() { return addMonths(thisMonth(), -1); }
  function monthList() { const out = [], cur = thisMonth(); for (let i = 0; i < RANGE; i++) out.push(addMonths(cur, -i)); return out; }
  function validMonth(m) { return /^\d{4}-\d{2}$/.test(String(m || '')) && monthList().indexOf(m) >= 0; }
  function monthName(m) { return MONTHS[+m.slice(5, 7) - 1] || m; }
  function monthLabel(m) { return monthName(m) + ' ' + m.slice(0, 4); }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  /** "$103,600", or with cents when there are any. */
  function money(v) { v = r2(v); return fmt.money(v, Math.round(v * 100) % 100 ? undefined : false); }
  /** The figure as it sits in a field: "41,200" or "41,200.50". */
  function amtText(v) {
    v = r2(v);
    return v.toLocaleString('en-US', { minimumFractionDigits: Math.round(v * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
  }
  /** null for an empty field, NaN when it is not an amount of 0 or more, otherwise the number. */
  function parseAmt(s) {
    const t = String(s == null ? '' : s).replace(/[\s,$]/g, '');
    if (!t) return null;
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return r2(+t);
  }
  function sameLabel(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

  /* ---------------- State (lives across tab switches) ---------------- */
  let uidSeq = 0;
  const state = { month: null, draft: null, base: '', err: {}, adding: null, addErr: '', addName: '', warn: '', params: null, linkedAt: 0, copiedFrom: null, fromExample: false, markReal: false };

  /** A draft from a saved record (or none). copy: filling from another month, so the till's stock figure always wins. */
  function makeDraft(month, doc, copy) {
    const costs = C(), stock = costs.stockSold(month);
    const typedStock = !!doc && (doc.depts.proShop || []).some(function (l) { return sameLabel(l.label, costs.STOCK) && +l.amount > 0; });
    const stockAuto = stock.covered && (copy || !typedStock);
    const depts = {};
    costs.DEPTS.forEach(function (d) {
      const src = ((doc && doc.depts[d.key]) || []).map(function (l) { return { label: l.label, amount: l.amount }; });
      const lines = [];
      d.lines.forEach(function (label) {
        const isStock = d.key === 'proShop' && sameLabel(label, costs.STOCK);
        const i = src.findIndex(function (l) { return sameLabel(l.label, label); });
        const hit = i >= 0 ? src.splice(i, 1)[0] : null;
        if (isStock && stockAuto) return;
        lines.push({ uid: 'l' + (++uidSeq), label: label, amount: hit ? amtText(hit.amount) : '', added: false });
      });
      src.forEach(function (l) {
        if (stockAuto && d.key === 'proShop' && sameLabel(l.label, costs.STOCK)) return;
        lines.push({ uid: 'l' + (++uidSeq), label: l.label, amount: amtText(l.amount), added: true });
      });
      depts[d.key] = lines;
    });
    return { month: month, depts: depts, stockAuto: stockAuto, stock: stock.amount };
  }
  function sig(draft) {
    return JSON.stringify(C().DEPTS.map(function (d) {
      return draft.depts[d.key].map(function (l) { const a = parseAmt(l.amount); return [l.label.trim(), l.added ? 1 : 0, a === null ? '' : isNaN(a) ? 'x' + l.amount : a]; });
    }));
  }
  function load(month) {
    state.month = month;
    state.draft = makeDraft(month, C().get(month), false);
    state.base = sig(state.draft);
    state.err = {}; state.adding = null; state.addErr = ''; state.addName = ''; state.copiedFrom = null;
    /* Example figures stay flagged as examples until staff say they are the club's real costs. */
    const doc = C().get(month);
    state.fromExample = !!(doc && doc.example); state.markReal = false;
  }
  function dirty() { return !!state.draft && (sig(state.draft) !== state.base || (state.fromExample && state.markReal)); }
  function keepExample() { return state.fromExample && !state.markReal; }
  function findLine(uid) {
    let out = null;
    C().DEPTS.forEach(function (d) { state.draft.depts[d.key].forEach(function (l) { if (l.uid === uid) out = { dept: d.key, line: l }; }); });
    return out;
  }
  function deptTotal(key) {
    let t = state.draft.depts[key].reduce(function (a, l) { const v = parseAmt(l.amount); return a + (v > 0 ? v : 0); }, 0);
    if (key === 'proShop' && state.draft.stockAuto) t += state.draft.stock;
    return r2(t);
  }
  function grandTotal() { return r2(C().DEPTS.reduce(function (a, d) { return a + deptTotal(d.key); }, 0)); }
  /** What Save stores: typed default lines, every added line (0 when left empty). */
  function toDepts() {
    const out = {};
    C().DEPTS.forEach(function (d) {
      out[d.key] = state.draft.depts[d.key].filter(function (l) { return l.added || parseAmt(l.amount) !== null; })
        .map(function (l) { const v = parseAmt(l.amount); return { label: l.label.trim(), amount: v > 0 ? v : 0 }; });
    });
    return out;
  }

  /* ---------------- Validation ---------------- */
  function amtError(l) { const v = parseAmt(l.amount); return v !== null && isNaN(v) ? 'Enter an amount of 0 or more.' : ''; }
  function labelError(deptKey, l) {
    const name = l.label.trim();
    if (!name) return 'Name this line.';
    if (name.length > 60) return 'Keep the name under 60 characters.';
    const d = C().DEPTS.find(function (x) { return x.key === deptKey; });
    const taken = state.draft.depts[deptKey].some(function (o) { return o !== l && sameLabel(o.label, name); }) ||
      (deptKey === 'proShop' && state.draft.stockAuto && sameLabel(name, C().STOCK));
    return taken ? d.label + ' already has a line called ' + name + '.' : '';
  }
  function newNameError(deptKey, name) {
    name = String(name || '').trim();
    if (!name) return 'Name the new line.';
    if (name.length > 60) return 'Keep the name under 60 characters.';
    const d = C().DEPTS.find(function (x) { return x.key === deptKey; });
    if (state.draft.depts[deptKey].some(function (o) { return sameLabel(o.label, name); }) || (deptKey === 'proShop' && state.draft.stockAuto && sameLabel(name, C().STOCK)))
      return d.label + ' already has a line called ' + name + '.';
    return '';
  }
  function validateAll() {
    state.err = {};
    C().DEPTS.forEach(function (d) {
      state.draft.depts[d.key].forEach(function (l) {
        const a = amtError(l); if (a) state.err[l.uid + ':a'] = a;
        if (l.added) { const e = labelError(d.key, l); if (e) state.err[l.uid + ':l'] = e; }
      });
    });
    return !Object.keys(state.err).length;
  }

  /* ---------------- Undo ---------------- */
  function undoRun(fn, o) {
    if (Club.undo && Club.undo.run) return Club.undo.run(fn, o);
    const out = fn(); if (o.message) ui.toast(typeof o.message === 'function' ? o.message(out) : o.message); return out;
  }

  /* ---------------- Store watching (the Accounting page does not call a tab's cleanup) ---------------- */
  const watching = [];
  function sweep() { watching.slice().forEach(function (w) { if (!w.panel.isConnected) w.stop(); }); }
  window.addEventListener('hashchange', sweep);
  function watch(panel, keys, fn) {
    sweep();
    let t = null, unsubs = [];
    const me = { panel: panel, stop: function () { clearTimeout(t); unsubs.forEach(function (u) { u(); }); unsubs = []; const i = watching.indexOf(me); if (i >= 0) watching.splice(i, 1); } };
    watching.push(me);
    unsubs = keys.map(function (k) {
      return S.subscribe(k, function () {
        if (!panel.isConnected) { me.stop(); return; }
        clearTimeout(t); t = setTimeout(function () { if (panel.isConnected) fn(); else me.stop(); }, 120);
      });
    });
    return me.stop;
  }

  /* ---------------- Rendering ---------------- */
  function statusHTML(doc) {
    if (!doc) return '<p class="mc-status is-empty">' + Club.icon('info') + '<span>Not entered yet</span></p>';
    const when = doc.savedAt ? fmt.dateShort(S.iso(new Date(doc.savedAt))) : '';
    if (doc.example) return '<p class="mc-status is-example">' + Club.icon('alert') + '<span><strong>Example figures (demo)</strong>, not the club’s costs' + (when ? '. Filled ' + esc(when) : '') + '</span></p>';
    return '<p class="mc-status is-saved">' + Club.icon('check') + '<span>Saved ' + esc(when) + (doc.savedBy ? ' by ' + esc(doc.savedBy) : '') + '</span></p>';
  }
  function errHTML(key) { const e = state.err[key]; return e ? '<span class="field-error" id="mc-e-' + esc(key.replace(':', '-')) + '">' + esc(e) + '</span>' : ''; }
  function moneyBox(id, value, attrs) {
    return '<div class="mc-money"><span class="mc-cur" aria-hidden="true">$</span><input class="input mc-amt" id="' + id + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + esc(value) + '"' + (attrs || '') + '></div>';
  }
  function lineHTML(deptKey, l) {
    const id = 'mc-a-' + l.uid, aErr = state.err[l.uid + ':a'], lErr = state.err[l.uid + ':l'];
    const desc = aErr ? ' aria-invalid="true" aria-describedby="mc-e-' + l.uid + '-a"' : '';
    if (!l.added) {
      return '<div class="mc-line field" data-uid="' + l.uid + '"><label for="' + id + '">' + esc(l.label) + '</label>' +
        moneyBox(id, l.amount, ' data-uid="' + l.uid + '"' + desc).replace('class="input mc-amt"', 'class="input mc-amt' + (aErr ? ' invalid' : '') + '"') + errHTML(l.uid + ':a') + '</div>';
    }
    const name = l.label.trim() || 'New line';
    return '<div class="mc-line field is-added" data-uid="' + l.uid + '">' +
      '<div class="mc-line-top"><label class="mc-sr" for="mc-l-' + l.uid + '">Line name</label>' +
        '<input class="input mc-label' + (lErr ? ' invalid' : '') + '" id="mc-l-' + l.uid + '" type="text" autocomplete="off" maxlength="80" value="' + esc(l.label) + '" data-uid="' + l.uid + '"' + (lErr ? ' aria-invalid="true" aria-describedby="mc-e-' + l.uid + '-l"' : '') + '>' +
        '<button type="button" class="mc-x" data-action="mc-remove" data-uid="' + l.uid + '" aria-label="Remove ' + esc(name) + '" title="Remove line">' + Club.icon('close') + '</button></div>' +
      errHTML(l.uid + ':l') +
      '<label class="mc-sr" for="' + id + '">' + esc(name) + ', amount</label>' +
      moneyBox(id, l.amount, ' data-uid="' + l.uid + '"' + desc).replace('class="input mc-amt"', 'class="input mc-amt' + (aErr ? ' invalid' : '') + '"') + errHTML(l.uid + ':a') + '</div>';
  }
  function stockHTML() {
    return '<div class="mc-line field is-auto"><label for="mc-stock">' + esc(C().STOCK) + '</label>' +
      moneyBox('mc-stock', amtText(state.draft.stock), ' readonly tabindex="-1" aria-describedby="mc-stock-hint"') +
      '<span class="field-hint" id="mc-stock-hint">From the till, at product cost</span></div>';
  }
  function addHTML(deptKey, label) {
    if (state.adding !== deptKey) return '<div class="mc-add"><button type="button" class="mc-link" data-action="mc-add" data-dept="' + deptKey + '">Add a line</button></div>';
    return '<div class="mc-add is-open field"><label for="mc-new-' + deptKey + '">New ' + esc(label.toLowerCase()) + ' line</label>' +
      '<div class="mc-add-row"><input class="input mc-newname' + (state.addErr ? ' invalid' : '') + '" id="mc-new-' + deptKey + '" type="text" autocomplete="off" maxlength="80" placeholder="Line name" value="' + esc(state.addName) + '"' + (state.addErr ? ' aria-invalid="true" aria-describedby="mc-new-err"' : '') + '>' +
      '<button type="button" class="btn btn-sm" data-action="mc-add-ok" data-dept="' + deptKey + '">Add</button>' +
      '<button type="button" class="mc-link" data-action="mc-add-cancel">Cancel</button></div>' +
      (state.addErr ? '<span class="field-error" id="mc-new-err">' + esc(state.addErr) + '</span>' : '') + '</div>';
  }
  function deptHTML(d) {
    const lines = state.draft.depts[d.key];
    let cells = '';
    if (d.key === 'proShop' && state.draft.stockAuto) cells += stockHTML();
    cells += lines.map(function (l) { return lineHTML(d.key, l); }).join('');
    return '<section class="mc-dept" data-dept="' + d.key + '" aria-labelledby="mc-h-' + d.key + '">' +
      '<div class="mc-dept-head"><h3 id="mc-h-' + d.key + '">' + esc(d.label) + '</h3><span class="mc-dept-total num" data-total="' + d.key + '">' + esc(money(deptTotal(d.key))) + '</span></div>' +
      '<div class="mc-grid">' + cells + addHTML(d.key, d.label) + '</div></section>';
  }

  function render(panel, ctx) {
    panel.classList.add('mc');
    const costs = C();
    if (!costs) { panel.innerHTML = ui.empty({ icon: 'alert', title: 'Monthly costs could not load', text: 'Reload the page and try again.' }); return; }
    /* A deep link (#/accounting/costs/2026-10) picks the month once per page visit; a draft with changes is kept. */
    const params = (ctx && ctx.params) || [];
    if (params !== state.params) {
      state.params = params;
      const linked = params[0] === 'costs' && validMonth(params[1]);
      /* The Accounting page can draw itself twice on a first visit (its demo seed) after it has already taken the month
         off the address, so a link's month is kept for a moment rather than reset to the default. */
      const want = linked ? params[1] : (state.linkedAt && Date.now() - state.linkedAt < 600 ? state.month : defaultMonth());
      if (linked) state.linkedAt = Date.now();
      if (want !== state.month && !dirty()) load(want);
    }
    if (!state.month || !validMonth(state.month)) load(defaultMonth());
    else if (!state.draft) load(state.month);
    else if (!dirty()) load(state.month);   /* pick up anything saved since (another tab, an Undo) */
    state.warn = '';

    function draw(focusSel) {
      const m = state.month, doc = costs.get(m), prev = costs.lastBefore(m), isDirty = dirty(), name = monthName(m);
      const prevName = prev ? (prev.month.slice(0, 4) === m.slice(0, 4) ? monthName(prev.month) : monthLabel(prev.month)) : '';
      const opts = monthList().map(function (k) { return '<option value="' + k + '"' + (k === m ? ' selected' : '') + '>' + esc(monthLabel(k)) + '</option>'; }).join('');
      const exampleMonths = costs.months().filter(function (k) { const d = costs.get(k); return d && d.example; });
      const free = last12().filter(function (k) { return !costs.get(k); });
      const canFillThis = !doc || doc.example;
      const y = window.scrollY;
      state.drawn = seenSig();
      panel.innerHTML = '<div class="mc-wrap">' +
        '<div class="mc-head"><div class="mc-title"><h2>Monthly costs</h2><p class="mc-help">What each department cost in a month. Used by Reports, Profit.</p></div>' +
          '<div class="mc-tools"><div class="mc-month"><label class="mc-sr" for="mc-month">Month</label><select class="select" id="mc-month" name="month">' + opts + '</select></div>' +
            '<button type="button" class="btn" data-action="mc-copy"' + (prev ? '' : ' disabled aria-describedby="mc-copy-why"') + '>' + esc(prev ? 'Copy ' + prevName : 'Copy last month') + '</button>' +
            (prev ? '' : '<span class="mc-why" id="mc-copy-why">Nothing saved before ' + esc(name) + '</span>') + '</div></div>' +
        '<div class="mc-statusrow">' + statusHTML(doc) +
          (state.copiedFrom ? '<span class="mc-note">Copied from ' + esc(monthLabel(state.copiedFrom.month)) + (state.copiedFrom.example ? ', example figures (demo)' : '') + '. Not saved yet.</span>' : '') +
          '<span class="mc-dirty"' + (isDirty ? '' : ' hidden') + '>Unsaved changes</span>' +
          (doc ? '<button type="button" class="mc-link mc-clear" data-action="mc-clear">Clear this month</button>' : '') + '</div>' +
        '<div class="mc-warn" role="alert"' + (state.warn ? '' : ' hidden') + '>' + Club.icon('alert') + '<span>' + esc(state.warn) + '</span></div>' +
        '<form class="mc-form" novalidate onsubmit="return false">' + costs.DEPTS.map(deptHTML).join('') + '</form>' +
        (state.fromExample ? '<label class="mc-real"><span class="toggle"><input type="checkbox" id="mc-real"' + (state.markReal ? ' checked' : '') + '><span></span></span>' +
          '<span class="mc-real-text"><span>These are the club\u2019s real costs</span><span class="mc-why">' + esc(state.markReal ? 'Saving makes them ' + name + '\u2019s real costs.' : 'Off: they stay marked as example figures (demo).') + '</span></span></label>' : '') +
        '<div class="mc-foot"><div class="mc-total"><span>Total for ' + esc(name) + '</span> <strong class="num" data-total="all">' + esc(money(grandTotal())) + '</strong></div>' +
          '<div class="mc-actions"><button type="button" class="btn" data-action="mc-cancel"' + (isDirty ? '' : ' disabled') + '>Cancel</button>' +
          '<button type="button" class="btn btn-primary" data-action="mc-save"' + (isDirty ? '' : ' disabled') + '>' + esc('Save ' + name + ' costs') + '</button></div></div>' +
        '<div class="mc-demo"><p><strong>Demo only.</strong> Example costs are made up so the Profit report has something to show. They are not the club’s costs.</p>' +
          '<div class="mc-demo-actions">' +
            '<button type="button" class="mc-link" data-action="mc-demo-one"' + (canFillThis ? '' : ' disabled title="' + esc(name) + ' has real costs saved"') + '>Fill with example costs (demo)</button>' +
            '<button type="button" class="mc-link" data-action="mc-demo-12"' + (free.length ? '' : ' disabled title="Each of the last 12 months has costs"') + '>Fill the last 12 months with example costs (demo)</button>' +
            '<button type="button" class="mc-link" data-action="mc-demo-clear"' + (exampleMonths.length ? '' : ' disabled title="No example costs saved"') + '>Clear example costs (demo)</button>' +
          '</div>' + (exampleMonths.length ? '<p class="mc-why">' + exampleMonths.length + (exampleMonths.length === 1 ? ' month has' : ' months have') + ' example figures.</p>' : '') + '</div>' +
        '</div>';
      window.scrollTo(0, y);
      if (focusSel) { const f = ui.$(focusSel, panel); if (f) { f.focus(); if (f.select && f.type === 'text') f.select(); } }
      setHash();
    }
    function setHash() {
      setTimeout(function () {
        if (!panel.isConnected || location.hash.indexOf('#/accounting/costs') !== 0) return;
        const h = '#/accounting/costs' + (state.month !== defaultMonth() ? '/' + state.month : '');
        try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { /* file:// may refuse */ }
      }, 0);
    }
    /** After typing: totals, the dirty marker and the footer buttons, without redrawing the fields. */
    function live() {
      costs.DEPTS.forEach(function (d) { const el = ui.$('[data-total="' + d.key + '"]', panel); if (el) el.textContent = money(deptTotal(d.key)); });
      const all = ui.$('[data-total="all"]', panel); if (all) all.textContent = money(grandTotal());
      const isDirty = dirty();
      const mk = ui.$('.mc-dirty', panel); if (mk) mk.hidden = !isDirty;
      ui.$$('[data-action=mc-cancel], [data-action=mc-save]', panel).forEach(function (b) { b.disabled = !isDirty; });
      if (!isDirty) { const n = ui.$('.mc-note', panel); if (n) n.remove(); }
    }
    function fieldErr(input, key, msg) {
      const host = input.closest('.mc-line'); if (!host) return;
      const old = host.querySelector('#mc-e-' + key.replace(':', '-')); if (old) old.remove();
      input.classList.toggle('invalid', !!msg);
      if (msg) {
        state.err[key] = msg;
        input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'mc-e-' + key.replace(':', '-'));
        const box = input.closest('.mc-money') || input.closest('.mc-line-top') || input;
        box.insertAdjacentHTML('afterend', '<span class="field-error" id="mc-e-' + esc(key.replace(':', '-')) + '">' + esc(msg) + '</span>');
      } else { delete state.err[key]; input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
    }
    function warn(msg) {
      state.warn = msg;
      const w = ui.$('.mc-warn', panel); if (!w) return;
      w.hidden = !msg; ui.$('span', w).textContent = msg;
      if (msg) { w.classList.remove('mc-flash'); void w.offsetWidth; w.classList.add('mc-flash'); }
    }
    function blockedByDraft() {
      if (!dirty()) return false;
      warn('Save or discard your changes to ' + monthName(state.month) + ' first.');
      const w = ui.$('.mc-warn', panel); if (w && w.scrollIntoView) { const r = w.getBoundingClientRect(); if (r.top < 70 || r.bottom > window.innerHeight) w.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return true;
    }
    function seenSig() { return JSON.stringify(costs.get(state.month)) + '|' + JSON.stringify(costs.stockSold(state.month)) + '|' + JSON.stringify(costs.months()); }
    function last12() { const out = []; for (let i = 1; i <= 12; i++) out.push(addMonths(thisMonth(), -i)); return out; }
    function reloadIfClean() { if (!dirty()) load(state.month); if (panel.isConnected) draw(); }

    /* ---- Typing ---- */
    panel.addEventListener('input', function (e) {
      const t = e.target;
      if (t.classList.contains('mc-amt') && t.dataset.uid) {
        const f = findLine(t.dataset.uid); if (!f) return;
        f.line.amount = t.value;
        if (state.err[t.dataset.uid + ':a'] && !amtError(f.line)) fieldErr(t, t.dataset.uid + ':a', '');
        live();
      } else if (t.classList.contains('mc-label') && t.dataset.uid) {
        const f = findLine(t.dataset.uid); if (!f) return;
        f.line.label = t.value;
        const rm = ui.$('[data-action=mc-remove][data-uid="' + t.dataset.uid + '"]', panel); if (rm) rm.setAttribute('aria-label', 'Remove ' + (t.value.trim() || 'New line'));
        if (state.err[t.dataset.uid + ':l'] && !labelError(f.dept, f.line)) fieldErr(t, t.dataset.uid + ':l', '');
        live();
      } else if (t.classList.contains('mc-newname')) { state.addName = t.value; }
    });
    panel.addEventListener('change', function (e) {
      const t = e.target;
      if (t.id === 'mc-real') {
        state.markReal = t.checked;
        const w = ui.$('.mc-real .mc-why', panel);
        if (w) w.textContent = state.markReal ? 'Saving makes them ' + monthName(state.month) + '\u2019s real costs.' : 'Off: they stay marked as example figures (demo).';
        live();
        return;
      }
      if (t.id === 'mc-month') {
        const want = t.value;
        if (want === state.month) return;
        if (blockedByDraft()) { t.value = state.month; return; }
        load(want); draw();
        return;
      }
      if (t.classList.contains('mc-amt') && t.dataset.uid) {
        const f = findLine(t.dataset.uid); if (!f) return;
        const msg = amtError(f.line);
        fieldErr(t, t.dataset.uid + ':a', msg);
        const v = parseAmt(f.line.amount);
        if (!msg && v !== null) { f.line.amount = amtText(v); t.value = f.line.amount; live(); }
      } else if (t.classList.contains('mc-label') && t.dataset.uid) {
        const f = findLine(t.dataset.uid); if (!f) return;
        f.line.label = t.value.replace(/\s+/g, ' ').trim(); t.value = f.line.label;
        fieldErr(t, t.dataset.uid + ':l', labelError(f.dept, f.line));
        const lab = ui.$('label[for="mc-a-' + f.line.uid + '"]', panel); if (lab) lab.textContent = (f.line.label || 'New line') + ', amount';
        live();
      }
    });
    panel.addEventListener('keydown', function (e) {
      const t = e.target;
      if (t.classList.contains('mc-newname')) {
        if (e.key === 'Enter') { e.preventDefault(); addLine(state.adding); }
        else if (e.key === 'Escape') { e.preventDefault(); const k = state.adding; state.adding = null; state.addErr = ''; state.addName = ''; draw('[data-action=mc-add][data-dept="' + k + '"]'); }
      } else if (e.key === 'Enter' && (t.classList.contains('mc-amt') || t.classList.contains('mc-label'))) {
        e.preventDefault(); t.blur();
      }
    });

    /* ---- Lines ---- */
    function addLine(deptKey) {
      if (!deptKey) return;
      const input = ui.$('.mc-newname', panel), name = String(input ? input.value : state.addName).replace(/\s+/g, ' ').trim();
      const err = newNameError(deptKey, name);
      if (err) { state.addName = name; state.addErr = err; draw('.mc-newname'); return; }
      const l = { uid: 'l' + (++uidSeq), label: name, amount: '', added: true };
      state.draft.depts[deptKey].push(l);
      state.adding = null; state.addErr = ''; state.addName = '';
      draw('#mc-a-' + l.uid);
    }
    ui.on(panel, 'click', '[data-action=mc-add]', function (e, b) { state.adding = b.dataset.dept; state.addErr = ''; state.addName = ''; draw('.mc-newname'); });
    ui.on(panel, 'click', '[data-action=mc-add-ok]', function (e, b) { addLine(b.dataset.dept); });
    ui.on(panel, 'click', '[data-action=mc-add-cancel]', function () { const k = state.adding; state.adding = null; state.addErr = ''; state.addName = ''; draw('[data-action=mc-add][data-dept="' + k + '"]'); });
    ui.on(panel, 'click', '[data-action=mc-remove]', function (e, b) {
      const f = findLine(b.dataset.uid); if (!f) return;
      const list = state.draft.depts[f.dept];
      list.splice(list.indexOf(f.line), 1);
      delete state.err[f.line.uid + ':a']; delete state.err[f.line.uid + ':l'];
      draw('[data-action=mc-add][data-dept="' + f.dept + '"]');
    });

    /* ---- Copy, Cancel, Save ---- */
    ui.on(panel, 'click', '[data-action=mc-copy]', function () {
      const prev = costs.lastBefore(state.month); if (!prev) return;
      state.draft = makeDraft(state.month, prev, true);
      state.err = {}; state.adding = null; state.copiedFrom = { month: prev.month, example: !!prev.example };
      state.fromExample = !!prev.example; state.markReal = false;
      warn('');
      draw();
    });
    ui.on(panel, 'click', '[data-action=mc-cancel]', function () {
      load(state.month); warn(''); draw();
    });
    ui.on(panel, 'click', '[data-action=mc-save]', function () {
      if (!validateAll()) { draw('.mc-form .invalid'); return; }
      const m = state.month, name = monthName(m), had = !!costs.get(m);
      const ex = keepExample();
      undoRun(function () { return costs.save(m, toDepts(), { example: ex }); }, {
        message: monthLabel(m) + (ex ? ' saved, still marked as example figures (demo)' : ' costs saved'),
        undone: had ? name + ' costs put back as they were' : name + ' costs removed',
        after: function () { if (state.month === m) reloadIfClean(); }
      });
      load(m); warn(''); draw();
    });
    ui.on(panel, 'click', '[data-action=mc-clear]', function () {
      if (blockedByDraft()) return;
      const m = state.month, name = monthName(m); if (!costs.get(m)) return;
      undoRun(function () { costs.remove(m); }, { message: monthLabel(m) + ' costs cleared', undone: name + ' costs restored', after: function () { if (state.month === m) reloadIfClean(); } });
      load(m); draw();
    });

    /* ---- Demo helpers ---- */
    ui.on(panel, 'click', '[data-action=mc-demo-one]', function () {
      if (blockedByDraft()) return;
      const m = state.month, doc = costs.get(m);
      if (doc && !doc.example) { warn(monthName(m) + ' has real costs saved. Clear them first to fill example figures.'); return; }
      undoRun(function () { return costs.save(m, costs.example(m), { example: true }); }, {
        message: 'Example costs filled for ' + monthLabel(m), undone: doc ? 'Example costs put back as they were' : 'Example costs removed',
        after: function () { if (state.month === m) reloadIfClean(); }
      });
      load(m); draw();
    });
    ui.on(panel, 'click', '[data-action=mc-demo-12]', function () {
      if (blockedByDraft()) return;
      const todo = last12().filter(function (k) { return !costs.get(k); });
      if (!todo.length) return;
      undoRun(function () { todo.forEach(function (k) { costs.save(k, costs.example(k), { example: true }); }); return todo.length; }, {
        message: 'Example costs filled for ' + todo.length + (todo.length === 1 ? ' month' : ' months'), undone: 'Example costs removed',
        after: reloadIfClean
      });
      load(state.month); draw();
    });
    ui.on(panel, 'click', '[data-action=mc-demo-clear]', function () {
      if (blockedByDraft()) return;
      const list = costs.months().filter(function (k) { const d = costs.get(k); return d && d.example; });
      if (!list.length) return;
      undoRun(function () { list.forEach(function (k) { costs.remove(k); }); return list.length; }, {
        message: 'Example costs cleared from ' + list.length + (list.length === 1 ? ' month' : ' months'), undone: 'Example costs restored',
        after: reloadIfClean
      });
      load(state.month); draw();
    });

    draw();
    /* Saved elsewhere (another browser tab) or till sales that change the stock figure: redraw unless someone is typing. */
    watch(panel, ['monthlyCosts', 'sales', '$external'], function () {
      if (seenSig() === state.drawn) return;
      if (dirty()) { const st = ui.$('.mc-status', panel), doc = costs.get(state.month); if (st) st.outerHTML = statusHTML(doc); return; }
      const a = document.activeElement;
      if (a && panel.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return;
      load(state.month); draw();
    });
  }

  window.__accountingTabs.push({ id: 'costs', label: 'Monthly costs', order: 50, render: render });
})();
