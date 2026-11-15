/* Club.i18n: the French / English switch for the public site and the members' portal (never loaded by the staff site).
   The pages are written in English. In French, a MutationObserver translates the rendered DOM: text nodes and the
   placeholder, aria-label, title and alt attributes (and the value of button-like inputs), from dictionaries of exact
   English strings and regex patterns that js/i18n/fr-*.js add. Club.fmt and the toLocale* / Intl.DateTimeFormat
   date and number calls switch to Canadian French at the same time. English mode installs nothing at all.

   Club.i18n.lang() -> 'en' | 'fr'        Club.i18n.set(lang) saves and reloads; Club.i18n.toggle()
   Club.i18n.add({ strings: { 'English': 'Français' }, patterns: [[/^Regex (.+)$/, 'Remplacement $1' | fn(m)]] })
   Club.i18n.t(english)                  the French in French mode, else the input unchanged
   Club.i18n.translate(root)             translate a subtree now (the observer does this for new and changed nodes)
   Club.i18n.missing() / clearMissing()  visible English-looking text seen with no translation (a translator's aid)
   Club.i18n.switcher(cls)               the EN | FR segmented control's HTML (clicks are handled here)

   Lookup: the text is trimmed (its outer whitespace is kept in the output) and runs of spaces / newlines inside are
   collapsed to one space; then the exact strings, then the dictionary patterns in the order added, then the engine's
   own patterns (months, days, "$8.50", "7:30 AM"). A pattern function gets the match array and may return null to
   pass; inside one, Club.i18n.t(m[1]) translates a captured fragment. Skipped: [data-i18n-skip], <script>, <style>,
   <textarea>, contenteditable, SVG other than charts, and the values people type. Dictionaries may also be queued before this file
   runs: window.__i18nQueue = [dict, ...] is drained here, and later pushes go straight to add(). */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const KEY = 'stboniface.lang';
  const lang = (function () { try { return localStorage.getItem(KEY) === 'fr' ? 'fr' : 'en'; } catch (e) { return 'en'; } })();
  const FR = lang === 'fr';

  function set(l) {
    l = l === 'fr' ? 'fr' : 'en';
    try { localStorage.setItem(KEY, l); } catch (e) { /* private mode: the reload falls back to English */ }
    location.reload();
  }

  /* ---------------- The switch (both languages) ---------------- */
  /* A globe for the labelled row (added to the icon set here so js/core/icons.js stays as it is). */
  if (Club.iconPaths && !Club.iconPaths.globe) Club.iconPaths.globe = '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/>';
  /** EN | FR as two toggle buttons in a labelled group. data-i18n-skip keeps the engine off its own labels. */
  function switcher(cls) {
    const b = function (l, label, full) {
      return '<button type="button" class="i18n-opt" data-i18n-set="' + l + '" lang="' + l + '" aria-pressed="' + (lang === l) + '" aria-label="' + full + '">' + label + '</button>';
    };
    return '<div class="i18n-switch' + (cls ? ' ' + cls : '') + '" role="group" aria-label="' + (FR ? 'Langue' : 'Language') + '" data-i18n-skip>' +
      b('en', 'EN', 'English') + b('fr', 'FR', 'Français') + '</div>';
  }
  /** The switch with a visible "Language" label, for menus and settings lists (icon: optional leading SVG). */
  function switchRow(cls, icon) {
    return '<div class="i18n-row' + (cls ? ' ' + cls : '') + '" data-i18n-skip>' + (icon || '') + '<span class="i18n-row-l" aria-hidden="true">' + (FR ? 'Langue' : 'Language') + '</span>' + switcher() + '</div>';
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-i18n-set]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.i18nSet !== lang) set(b.dataset.i18nSet);
  });

  /** An array whose push hands each dictionary to fn (so late `__i18nQueue.push(dict)` still lands). */
  function queue(fn) { const a = []; a.push = function () { for (let i = 0; i < arguments.length; i++) fn(arguments[i]); return 0; }; return a; }

  const api = {
    lang: function () { return lang; },
    set: set,
    toggle: function () { set(FR ? 'en' : 'fr'); },
    switcher: switcher, switchRow: switchRow,
    add: function () {}, t: function (s) { return s; }, translate: function () {},
    missing: function () { return []; }, clearMissing: function () {}
  };
  Club.i18n = api;

  /* English: nothing else. Queued dictionaries are dropped and later pushes ignored (no cost, no observer). */
  if (!FR) { window.__i18nQueue = queue(function () {}); return; }

  document.documentElement.lang = 'fr-CA';

  /* ---------------- Dictionary ---------------- */
  const strings = new Map(), patterns = [], base = [];
  const frValues = new Set();          /* dictionary French and pattern output: never reported as missing */
  let cache = new Map();               /* key -> translation or null, cleared when the dictionary grows */
  let started = false, rescan = 0;
  let done = new WeakMap();            /* text node -> its value when last looked up (reset when the dictionary grows) */
  const MARK = '\u2060', MARKS = / ?\u2060/g;   /* see frTime */

  function add(dict) {
    if (!dict) return;
    const s = dict.strings || {};
    Object.keys(s).forEach(function (k) { const n = norm(k); strings.set(n, s[k]); frValues.add(norm(String(s[k]))); });
    (dict.patterns || []).forEach(function (p) { if (p && p[0] instanceof RegExp) patterns.push([p[0], p[1], literal(p[0])]); });
    cache = new Map(); done = new WeakMap();
    /* Late dictionaries (lazy pages) re-run the whole page once, batched. */
    if (started && !rescan) rescan = setTimeout(function () { rescan = 0; translate(document.documentElement); }, 0);
  }
  /** The longest run of plain text every match must contain (outside groups, no top-level |), so a pattern can be
      skipped with one indexOf instead of running the regex: /^(.+) paid with (.+)$/ -> " paid with ". */
  function literal(re) {
    if (re.flags.indexOf('i') >= 0) return '';
    const src = re.source; let best = '', cur = '', depth = 0, i = 0;
    const flush = function () { if (cur.length > best.length) best = cur; cur = ''; };
    const past = function (ch) { const j = src.indexOf(ch, i); return j < 0 ? src.length : j + 1; };   /* index after ch */
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        const n = src[i + 1];
        if (/[A-Za-z0-9]/.test(n)) {   /* \d, \s, \u2019, \p{..}, \k<..>, back references: not plain text */
          flush();
          i = n === 'u' ? (src[i + 2] === '{' ? past('}') : i + 6) : n === 'x' ? i + 4 : n === 'c' ? i + 3 : (n === 'p' || n === 'P') ? past('}') : n === 'k' ? past('>') : i + 2;
          continue;
        }
        if (depth === 0) cur += n; else flush();
        i += 2; continue;
      }
      if (c === '[') { flush(); i++; while (i < src.length && src[i] !== ']') i += src[i] === '\\' ? 2 : 1; i++; continue; }
      if (c === '(') { flush(); depth++; i++; continue; }
      if (c === ')') { flush(); depth--; i++; continue; }
      if (c === '|') { if (depth === 0) return ''; flush(); i++; continue; }
      if (c === '?' || c === '*' || c === '+' || c === '{') {   /* a quantifier: its character is not certain */
        cur = cur.slice(0, -1); flush();
        i = c === '{' ? past('}') : i + 1; continue;
      }
      if (c === '^' || c === '$' || c === '.') { flush(); i++; continue; }
      if (depth === 0) cur += c; else flush();
      i++;
    }
    flush();
    return best;
  }
  function norm(s) { return s.replace(/[ \t\n\r]+/g, ' ').trim(); }
  function apply(p, key) {
    const re = p[0], rep = p[1];
    if (p[2] && key.indexOf(p[2]) < 0) return null;
    re.lastIndex = 0;
    const m = re.exec(key);
    if (!m) return null;
    if (typeof rep === 'function') {
      const r = rep.apply(null, [m].concat(m.slice(1)));   /* fn(m) or, like String.replace, fn(m, $1, $2, ...) */
      if (r == null || r === m) return null;   /* null (or the match itself) means "not this one" */
      return key.slice(0, m.index) + r + key.slice(m.index + m[0].length);
    }
    re.lastIndex = 0;
    return key.replace(re, rep);
  }
  /** French for a normalised key, or null. */
  function lookup(key) {
    if (cache.has(key)) return cache.get(key);
    let r = strings.has(key) ? strings.get(key) : null;
    for (let i = 0; r == null && i < patterns.length; i++) r = apply(patterns[i], key);
    for (let i = 0; r == null && i < base.length; i++) r = apply(base[i], key);
    if (cache.size > 8000) cache = new Map();
    cache.set(key, r);
    return r;
  }
  function t(s) {
    if (s == null || s === '') return s;
    s = String(s);
    if (s.indexOf(MARK) >= 0) s = s.replace(MARKS, '');
    const key = norm(s); if (!key) return s;
    const r = lookup(key);
    if (r == null || r === key) return s;
    if (frValues.size < 20000) frValues.add(norm(r));
    const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0];
    return lead + r + trail;
  }

  /* ---------------- Dates, times and money in Canadian French ---------------- */
  const NNBSP = '\u202F', NBSP = '\u00A0';
  const enNum = Intl.NumberFormat;
  /** 1234.5 -> "1 234,50" (narrow no-break space thousands, decimal comma). */
  const nf = {};
  function frNum(v, minD, maxD) {
    const k = minD + '-' + maxD, f = nf[k] || (nf[k] = new enNum('en-US', { minimumFractionDigits: minD, maximumFractionDigits: maxD }));
    return f.format(v).replace(/,/g, NNBSP).replace('.', ',');
  }
  function frMoney(v, cents) {
    v = +v || 0;
    return (v < 0 ? '-' : '') + frNum(Math.abs(v), cents === false ? 0 : 2, cents === false ? 0 : 2) + NBSP + '$';
  }
  /** "13:30" -> "13 h 30", "07:00" -> "7 h". Pages split fmt.time(t) on ' ' to set AM / PM in small type, so the
      French ends in a space and an invisible word joiner (MARK): part 0 is the whole time, part 1 is the mark. The
      engine strips " MARK" from every text node and attribute it reads, so "à 13 h 30 MARK." shows as "à 13 h 30." */
  function frTime(h, m) { return +h + NBSP + 'h' + (+m ? NBSP + String(m).padStart(2, '0') : '') + ' ' + MARK; }

  const fmt = Club.fmt;
  if (fmt) {
    const toDate = fmt.toDate;
    const dl = function (d, o) { return toDate(d).toLocaleDateString('fr-CA', o); };
    fmt.money = function (v, cents) { return frMoney(v, cents); };
    fmt.money0 = function (v) { return frMoney(v, false); };
    fmt.num = function (v) { return frNum(+v || 0, 0, 3); };
    fmt.handicap = function (h) { if (h == null) return '–'; return (h < 0 ? '+' + Math.abs(h).toFixed(1) : (+h).toFixed(1)).replace('.', ','); };
    fmt.pct = function (v, d) { return (+v || 0).toFixed(d == null ? 0 : d).replace('.', ',') + NBSP + '%'; };
    fmt.date = function (d) { return dl(d, { day: 'numeric', month: 'short', year: 'numeric' }); };
    fmt.dateShort = function (d) { return dl(d, { day: 'numeric', month: 'short' }); };
    fmt.dateLong = function (d) { return dl(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
    fmt.weekday = function (d) { return dl(d, { weekday: 'short' }); };
    fmt.time = function (v) {
      if (!v) return '';
      if (v instanceof Date) return frTime(v.getHours(), v.getMinutes());
      const p = String(v).split(':'); return frTime(p[0], p[1] || 0);
    };
    fmt.relative = function (d) {
      const r = Math.round((toDate(d) - new Date()) / 86400000);
      if (r === 0) return 'Aujourd’hui'; if (r === 1) return 'Demain'; if (r === -1) return 'Hier';
      return r > 0 ? 'Dans ' + r + ' jours' : 'Il y a ' + Math.abs(r) + ' jours';
    };
  }

  /* Calls that name an English locale (or none) get fr-CA with the same options; 12-hour clocks become 24-hour. */
  function loc(l) { return l == null || /^en(-|$)/i.test(Array.isArray(l) ? l[0] || '' : String(l)) ? 'fr-CA' : l; }
  function opts(o) {
    if (!o || (o.hour12 == null && o.hourCycle == null)) return o;
    o = Object.assign({}, o); delete o.hour12; delete o.hourCycle; return o;
  }
  const DP = Date.prototype;
  ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(function (name) {
    const orig = DP[name];
    DP[name] = function (l, o) {
      /* 'en-CA' with no options is the ISO yyyy-mm-dd idiom: leave it alone. */
      if (l === 'en-CA' && o == null && name === 'toLocaleDateString') return orig.call(this, l);
      const out = orig.call(this, loc(l), opts(o));
      /* WebKit writes fr-CA clock times as 13:30; Canadian usage (and fmt.time) is 13 h 30. */
      return name === 'toLocaleDateString' ? out : out.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, function (x, h, m) { return frTime(h, m).replace(MARKS, '').trim(); });
    };
  });
  const NumLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) {
    const fl = loc(l);
    if (fl !== 'fr-CA' || (o && o.style && o.style !== 'decimal')) return NumLocale.call(this, fl, o);
    /* Plain numbers: the same digits as English with French separators (consistent with fmt.num). */
    return NumLocale.call(this, 'en-US', o).replace(/,/g, NNBSP).replace('.', ',');
  };
  const DTF = Intl.DateTimeFormat;
  const FrDTF = function (l, o) { return new DTF(loc(l), opts(o)); };
  FrDTF.prototype = DTF.prototype;
  FrDTF.supportedLocalesOf = DTF.supportedLocalesOf;
  Intl.DateTimeFormat = FrDTF;

  /* Engine patterns, tried after the dictionaries': whole-node money and clock times built without Club.fmt, and
     the calendar words the pickers draw (month headings, weekday letters). */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const cal = {};
  MONTHS.forEach(function (m, i) { cal[m] = MOIS[i]; cal[m.slice(0, 3)] = MOIS3[i]; });
  cal.Sept = 'sept.';
  DAYS.forEach(function (d, i) { cal[d] = JOURS[i]; cal[d.slice(0, 3)] = JOURS[i].slice(0, 3) + '.'; cal[d.slice(0, 2)] = JOURS[i].slice(0, 2); });
  const calWords = Object.keys(cal).join('|');
  base.push(
    [/^([-+−]?)\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?$/, function (m) { return m[1] + m[2].replace(/,/g, NNBSP) + (m[3] ? ',' + m[3] : '') + NBSP + '$'; }],
    [/^(\d{1,2}):(\d{2}) ?([AP])\.?M\.?$/i, function (m) { let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return frTime(h, m[2]).replace(MARKS, ''); }],
    [new RegExp('^(' + calWords + ')( \\d{4})?$'), function (m) { return cal[m[1]] + (m[2] || ''); }]
  );

  /* ---------------- Walking the DOM ---------------- */
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const ATTR_SEL = '[placeholder],[aria-label],[title],[alt],input[type=button],input[type=submit],input[type=reset]';
  /* SVG is skipped (icons, card marks) except Club.charts' <svg class="chart">, whose axis labels are text. */
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  const SKIP_SEL = '[data-i18n-skip],script,style,textarea,noscript,svg:not(.chart),[contenteditable]:not([contenteditable=false])';
  /* Attributes (placeholder, aria-label, title) are safe to translate on a textarea; only what people type is not. */
  const ATTR_SKIP_SEL = '[data-i18n-skip],script,style,noscript,svg:not(.chart),[contenteditable]:not([contenteditable=false])';

  const LETTER = /[A-Za-z$\u2060]/;   /* no letters, no "$" and no time mark: nothing to translate */
  function skipEl(el) { return SKIP_TAGS[el.tagName] || (el.tagName === 'svg' && !el.classList.contains('chart')) || el.hasAttribute('data-i18n-skip') || (el.isContentEditable && el.contentEditable === 'true'); }
  function text(node) {
    const v = node.nodeValue;
    if (!LETTER.test(v) || done.get(node) === v) return;
    const out = t(v);
    if (out !== v) { node.nodeValue = out; done.set(node, out); }
    else { done.set(node, v); if (looksEnglish(v)) note(norm(v), node.parentNode); }
  }
  function attrs(el) {
    for (let i = 0; i < ATTRS.length; i++) {
      const v = el.getAttribute(ATTRS[i]);
      if (v) { const out = t(v); if (out !== v) el.setAttribute(ATTRS[i], out); else if (looksEnglish(v)) note(norm(v), el); }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value) { const out = t(el.value); if (out !== el.value) el.value = out; }
  }
  /** Translate a subtree (iterative walk; skipped elements prune their whole subtree). */
  function walk(root) {
    if (root.nodeType === 3) { const p = root.parentElement; if (p && !p.closest(SKIP_SEL)) text(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && root.closest(SKIP_SEL)) { if (!root.closest(ATTR_SKIP_SEL) && root.matches(ATTR_SEL)) attrs(root); return; }
    let n = root.firstChild;
    while (n && n !== root) {
      let down = false;
      if (n.nodeType === 3) text(n);
      else if (n.nodeType === 1 && !skipEl(n)) down = !!n.firstChild;
      if (down) { n = n.firstChild; continue; }
      while (n && n !== root && !n.nextSibling) n = n.parentNode;
      if (n && n !== root) n = n.nextSibling;
    }
    if (root.nodeType === 1 && root.matches(ATTR_SEL)) attrs(root);
    const list = root.querySelectorAll(ATTR_SEL);
    for (let i = 0; i < list.length; i++) if (!list[i].closest(ATTR_SKIP_SEL)) attrs(list[i]);
  }
  function translate(root) {
    if (!root) return;
    if (obs) handle(obs.takeRecords());      /* first whatever the page changed and the observer has not seen yet */
    walk(root);
    if (obs) obs.takeRecords();              /* then drop the records of our own writes */
  }

  /* ---------------- Observer ---------------- */
  let obs = null;
  function handle(records) {
    if (!records.length) return;
    const roots = new Set(), els = new Set();
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.type === 'childList') { for (let j = 0; j < r.addedNodes.length; j++) roots.add(r.addedNodes[j]); }
      else if (r.type === 'characterData') roots.add(r.target);
      else if (r.type === 'attributes') els.add(r.target);
    }
    /* Nodes inside another added node are covered by its walk. */
    roots.forEach(function (n) {
      if (!n.isConnected) return;
      for (let p = n.parentNode; p; p = p.parentNode) if (roots.has(p)) return;
      walk(n);
    });
    els.forEach(function (el) { if (el.isConnected && !roots.has(el) && !el.closest(ATTR_SKIP_SEL)) attrs(el); });
  }
  function start() {
    if (started) return;
    started = true;
    obs = new MutationObserver(function (records) { handle(records); obs.takeRecords(); });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat('value') });
    translate(document.documentElement);
  }

  /* ---------------- Missing strings (developer aid) ---------------- */
  const missed = new Map();            /* text -> { text, hashes: Set, count } */
  let pending = [], noteTimer = 0;
  const FRENCH = /[àâæçéèêëîïôœùûüÿÀÂÇÉÈÊÎÔÛ’]|\b(le|la|les|des|du|une|et|pour|avec|vous|votre|vos|dans|sur)\b/i;
  function looksEnglish(v) {
    const s = norm(v);
    if (s.length < 2 || !/[A-Za-z]{2,}/.test(s) || /^[A-Z]{2,3}$/.test(s)) return false;   /* initials, codes */
    if (frValues.has(s) || FRENCH.test(s)) return false;
    if (/^[\w.+-]+@[\w.-]+$|^https?:|^[#\d\s().:\-+$%,/hAPM]*$/.test(s)) return false;   /* emails, links, numbers, times, money */
    return true;
  }
  /* Visibility is checked a little later, in one batch (a layout read per node would make translating slow). */
  function note(s, el) {
    pending.push([s, el, location.hash || '#']);
    if (!noteTimer) noteTimer = setTimeout(flushNotes, 400);
  }
  function flushNotes() {
    noteTimer = 0;
    const list = pending; pending = [];
    list.forEach(function (x) {
      const el = x[1];
      if (el && el.isConnected && el.nodeType === 1 && !el.getClientRects().length && el.tagName !== 'OPTION' && el.tagName !== 'TITLE') return;
      let e = missed.get(x[0]);
      if (!e) { e = { text: x[0], hashes: new Set(), count: 0 }; missed.set(x[0], e); }
      e.hashes.add(x[2]); e.count++;
    });
  }

  Object.assign(api, {
    add: add, t: t, translate: translate,
    missing: function () {
      flushNotes();
      return Array.from(missed.values()).filter(function (e) { return lookup(e.text) == null; })
        .map(function (e) { return { text: e.text, hashes: Array.from(e.hashes), count: e.count }; });
    },
    clearMissing: function () { pending = []; missed.clear(); }
  });

  /* Dictionaries queued before this ran, then any pushed later. */
  const q = window.__i18nQueue;
  if (Array.isArray(q)) q.forEach(add);
  window.__i18nQueue = queue(add);

  start();
})();
