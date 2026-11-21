/* Portal: Handbook. The club's Membership Handbook (Club.handbook, js/shared/handbook-data.js) for members to read,
   all on one page like the printed book (approved "Option C", Nov 20): one white sheet with the St.B cover at the top,
   the contents and search in a left column that follows the page, and every section open, one after another.
   - Each handbook group starts a chapter (big condensed heading with a short olive rule) and its sections follow as
     subheadings. The Welcome group has no chapter heading of its own: each of its sections is a chapter.
   - Lists of "**Name:** value" lines (board, management team) and short "Days: hours" lines (hours of operation) are
     shown as two columns. The stored text is never changed; this is only how it is drawn.
   - Scroll-spy: the contents marks the section being read. Clicking an item scrolls there. #/handbook/<section id>
     opens the page at that section (e.g. #/handbook/dress-code).
   - Search marks matches in place and hides sections without one; the contents follows.
   - Phones: the contents is a "Contents · <section>" button that stays at the top and opens the list in a sheet.
   French: unedited sections show the club's 2025 text in French (Club.handbookFr, js/i18n/fr-portal.js); sections staff
   changed or added show in English with a short note. The footer (French only) says the English prevails. */
(function () {
  'use strict';
  if (!window.Portal || !Portal.register || !Club.handbook) return;
  const H = Club.handbook, S = Club.store, ui = Club.ui, esc = ui.esc;
  const st = { q: '' };
  const WIDE = '(min-width: 1024px)';
  const BAND = 'Welcome to “The Friendly Club”, we are glad you are here!';

  /** Lower case without accents, so "regle" finds "règle". */
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function wide() { return !!(window.matchMedia && window.matchMedia(WIDE).matches); }
  function smooth() { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function short(id) { return String(id).replace(/^hb_/, ''); }
  function domId(id) { return 'hb-' + short(id); }

  /** English titles in title case, as in the printed handbook ("Board of Directors"). French keeps sentence case. */
  const SMALL = /^(a|an|and|as|at|by|for|in|of|on|or|the|to|with)$/i;
  function titleCase(s) {
    return String(s).split(' ').map(function (w, i) {
      if (i && SMALL.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  /** Wrap every match of q in the text under root in <mark class="hb-hit">. Returns the number of matches. */
  function mark(root, q) {
    const fq = fold(q); if (!fq || !root) return 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    nodes.forEach(function (n) {
      const text = n.nodeValue;
      /* fold char by char so positions line up with the original text */
      let folded = '';
      const map = [];
      for (let i = 0; i < text.length; i++) { const f = fold(text[i]); for (let j = 0; j < f.length; j++) { folded += f[j]; map.push(i); } }
      let at = folded.indexOf(fq); if (at < 0) return;
      const frag = document.createDocumentFragment(); let last = 0;
      while (at >= 0) {
        const s = map[at], e = map[at + fq.length - 1] + 1;
        if (s > last) frag.appendChild(document.createTextNode(text.slice(last, s)));
        const m = document.createElement('mark'); m.className = 'hb-hit'; m.textContent = text.slice(s, e); frag.appendChild(m);
        last = e; count++;
        at = folded.indexOf(fq, at + fq.length);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
    return count;
  }

  /* ---------------- Two-column lists (drawing only) ---------------- */
  const KEY_LINE = /^([^:]{2,40}?)\s*:\s+(.{1,60})$/;
  /** "<li><strong>President:</strong> Michelle Miyai</li>" lists and "Monday to Friday: 8:30 am – 5:00 pm" lines
      become <dl class="hb-kv">. Anything that does not fit the pattern exactly is left as it is. */
  function columns(root) {
    ui.$$('ul', root).forEach(function (ul) {
      const items = Array.prototype.slice.call(ul.children);
      const rows = items.map(function (li) {
        const b = li.firstChild;
        if (!b || b.nodeName !== 'STRONG' || !/:\s*$/.test(b.textContent)) return null;
        const val = li.textContent.slice(b.textContent.length).trim();
        return val && val.length <= 60 ? { k: b.textContent.replace(/\s*:\s*$/, ''), v: li.innerHTML.slice(b.outerHTML.length).trim() } : null;
      });
      if (rows.length < 2 || rows.some(function (r) { return !r; })) return;
      ul.replaceWith(kv(rows));
    });
    ui.$$('p', root).forEach(function (p) {
      if (p.querySelector('strong, a')) return;
      const lines = p.innerHTML.split(/<br\s*\/?>/i).map(function (l) { return l.trim(); });
      const rows = lines.map(function (l) { const tmp = document.createElement('span'); tmp.innerHTML = l; const m = KEY_LINE.exec(tmp.textContent); return m ? { k: m[1], v: esc(m[2]) } : null; });
      if (rows.some(function (r) { return !r; })) return;
      p.replaceWith(kv(rows));
    });
  }
  function kv(rows) {
    const dl = document.createElement('dl'); dl.className = 'hb-kv';
    dl.innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r.k) + '</dt><dd>' + r.v + '</dd></div>'; }).join('');
    return dl;
  }

  /* ---------------- Markup ---------------- */
  function sectionHTML(sec, chapter) {
    const v = H.view(sec), id = domId(sec.id), skip = H.french() ? ' data-i18n-skip' : '';
    let body = v.body;
    /* The Welcome section opens with the cover's own line ("Welcome to “The Friendly Club”…"): not repeated below it. */
    if (sec.id === 'hb_welcome' && H.isOriginal(sec)) body = body.replace(/^\*\*[^\n]*\*\*\s*\n\s*\n/, '');
    const title = v.lang === 'en' && !chapter ? titleCase(v.title) : v.title;
    const head = chapter
      ? '<h2 class="hb-chap hb-sec-h"' + skip + ' lang="' + v.lang + '">' + esc(title) + '</h2>'
      : '<h3 class="hb-sub hb-sec-h"' + skip + ' lang="' + v.lang + '">' + esc(title) + '</h3>';
    return '<section class="hb-sec' + (chapter ? ' hb-chapter' : '') + '" id="' + esc(id) + '" data-sec="' + esc(sec.id) + '">' + head +
      (v.untranslated ? '<p class="hb-untr" data-i18n-skip lang="fr">' + Club.icon('info') + '<span>Le club a modifié cette section. La traduction française suivra.</span></p>' : '') +
      '<div class="hb-text hb-body-text"' + skip + ' lang="' + v.lang + '">' + H.html(body) + '</div>' +
    '</section>';
  }

  function render(view, params) {
    const secs = H.list();
    const groups = H.GROUPS.concat(secs.map(function (s) { return s.group; }).filter(function (g, i, a) { return H.GROUPS.indexOf(g) < 0 && a.indexOf(g) === i; }))
      .map(function (g) { return { name: g, secs: secs.filter(function (s) { return s.group === g; }) }; }).filter(function (g) { return g.secs.length; });
    const skip = H.french() ? ' data-i18n-skip' : '';
    const updated = H.lastUpdated();
    const pdf = esc(H.META.pdfUrl);

    const toc = groups.map(function (g) {
      return '<div class="hb-toc-g" data-group="' + esc(g.name) + '"><h3' + skip + '>' + esc(H.groupLabel(g.name)) + '</h3><ul>' + g.secs.map(function (s) {
        return '<li data-sec="' + esc(s.id) + '"><a href="#/handbook/' + esc(short(s.id)) + '" data-go="' + esc(s.id) + '"' + skip + '>' + esc(H.view(s).title) + '</a></li>';
      }).join('') + '</ul></div>';
    }).join('');

    const flow = groups.length ? groups.map(function (g) {
      /* The first group (Welcome) has no heading of its own: each of its sections starts a chapter. */
      if (g.name === H.GROUPS[0]) return '<div class="hb-group" data-group="' + esc(g.name) + '">' + g.secs.map(function (s) { return sectionHTML(s, true); }).join('') + '</div>';
      return '<div class="hb-group hb-chapter" data-group="' + esc(g.name) + '"><h2 class="hb-chap"' + skip + '>' + esc(H.groupLabel(g.name)) + '</h2>' +
        g.secs.map(function (s) { return sectionHTML(s, false); }).join('') + '</div>';
    }).join('') : ui.empty({ icon: 'book', title: 'The handbook is not available', text: 'Please call the club office at ' + Club.info.phone + '.' });

    view.innerHTML =
      '<article class="hb-sheet">' +
        '<header class="hb-cover">' +
          '<h1 class="hb-cover-t">Membership handbook</h1>' +
          Club.logoImg('hb-cover-logo') +
          '<div class="hb-band"><p class="hb-band-t">' + esc(BAND) + '</p>' +
            '<p class="hb-band-m"><span>' + esc(H.META.year + ' edition') + '</span><span class="hb-dot" aria-hidden="true">·</span><span>Last updated ' + esc(longDate(updated)) + '</span></p></div>' +
        '</header>' +
        '<div class="hb-body">' +
          '<aside class="hb-side"><div class="hb-side-in">' +
            '<div class="hb-find">' +
              '<label class="hb-search"><span class="sr-only">Search the handbook</span>' + Club.icon('search') +
                '<input class="input" type="search" name="q" placeholder="Search the handbook" aria-label="Search the handbook" autocomplete="off" enterkeyhint="search" value="' + esc(st.q) + '">' +
                '<button type="button" class="hb-clear" data-act="clear" aria-label="Clear the search"' + (st.q ? '' : ' hidden') + '>' + Club.icon('close') + '</button>' +
              '</label>' +
              '<p class="hb-count" role="status" aria-live="polite"></p>' +
            '</div>' +
            '<nav class="hb-toc" aria-label="Contents">' + toc + '</nav>' +
            '<a class="btn hb-pdf" href="' + pdf + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a>' +
          '</div></aside>' +
          '<div class="hb-jump"><button type="button" class="hb-jump-b" data-act="toc" aria-haspopup="dialog">' + Club.icon('book') +
            '<span class="hb-jump-l">Contents</span><span class="hb-dot" aria-hidden="true">·</span><span class="hb-jump-cur"' + skip + '></span>' + Club.icon('chevronDown', 'hb-jump-chev') + '</button></div>' +
          '<div class="hb-flow">' + flow +
            '<div class="hb-none" hidden></div>' +
            '<footer class="hb-foot">' +
              '<p>' + esc(H.META.title) + '. The information in this handbook is general in nature and subject to the by-laws of the club.</p>' +
              '<p><a class="p-link" href="' + pdf + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a></p>' +
              (H.french() ? '<p class="hb-fr-note" data-i18n-skip lang="fr">Ceci est une traduction française du guide des membres de 2027. En cas de divergence, la version anglaise prévaut.</p>' : '') +
            '</footer>' +
          '</div>' +
        '</div>' +
      '</article>';

    ui.$$('.hb-body-text', view).forEach(columns);

    const input = ui.$('input[name=q]', view), clearBtn = ui.$('.hb-clear', view), countEl = ui.$('.hb-count', view), none = ui.$('.hb-none', view);
    const nav = ui.$('.hb-toc', view), cur = ui.$('.hb-jump-cur', view), jump = ui.$('.hb-jump', view);
    const secEls = ui.$$('.hb-sec', view);
    /* Each section's clean heading and text, to put back before marking a new search. */
    const clean = {};
    secEls.forEach(function (el) { clean[el.dataset.sec] = { body: ui.$('.hb-body-text', el).innerHTML, title: ui.$('.hb-sec-h', el).innerHTML }; });

    /* ---------- Where the page sits under the sticky header ---------- */
    function headerH() { const h = document.querySelector('.p-header'); return h ? h.getBoundingClientRect().height : 0; }
    function offset() { return headerH() + (wide() || !jump ? 0 : jump.getBoundingClientRect().height) + 16; }
    function setTop() { view.style.setProperty('--hb-top', Math.round(headerH()) + 'px'); }
    setTop();

    /* ---------- Scroll-spy ---------- */
    let active = null, lock = 0;
    function setActive(id) {
      if (id === active) return;
      active = id;
      ui.$$('.hb-toc a', view).forEach(function (a) {
        const on = a.dataset.go === id;
        a.classList.toggle('is-on', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
      const sec = id && H.get(id);
      cur.textContent = sec ? H.view(sec).title : '';
      /* keep the marked item in view inside the contents column (never scrolls the page itself) */
      const a = id && nav.querySelector('a[data-go="' + id + '"]'), box = ui.$('.hb-side-in', view);
      if (a && box && box.scrollHeight > box.clientHeight + 1) {
        const ar = a.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (ar.top < br.top + 8 || ar.bottom > br.bottom - 8) box.scrollTop += ar.top - br.top - box.clientHeight / 3;
      }
    }
    function spy() {
      if (Date.now() < lock) return;
      const shown = secEls.filter(function (el) { return !el.hidden && !el.parentElement.hidden; });
      if (!shown.length) { setActive(null); return; }
      const line = offset() + Math.min(120, window.innerHeight * 0.2);
      let pick = shown[0];
      shown.forEach(function (el) { if (el.getBoundingClientRect().top <= line) pick = el; });
      /* at the very bottom, the last section is the one being read even if its heading never reaches the line */
      const doc = document.documentElement;
      if (window.innerHeight + window.pageYOffset >= doc.scrollHeight - 2) {
        const last = shown[shown.length - 1];
        if (last.getBoundingClientRect().top < window.innerHeight) pick = last;
      }
      setActive(pick.dataset.sec);
    }
    let raf = 0;
    function onScroll() {
      if (lock && Date.now() < lock) lock = Date.now() + 160;   /* a jump is still scrolling: wait until it settles */
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; spy(); });
    }
    function onResize() { setTop(); spy(); }

    /* ---------- Search ---------- */
    function search() {
      const q = st.q.trim();
      let shown = 0;
      clearBtn.hidden = !st.q;
      secEls.forEach(function (el) {
        const c = clean[el.dataset.sec], text = ui.$('.hb-body-text', el), head = ui.$('.hb-sec-h', el);
        text.innerHTML = c.body; head.innerHTML = c.title;
        if (!q) { el.hidden = false; return; }
        const n = mark(head, q) + mark(text, q);
        el.hidden = !n;
        if (n) shown++;
      });
      ui.$$('.hb-group', view).forEach(function (g) { g.hidden = !ui.$$('.hb-sec', g).some(function (el) { return !el.hidden; }); });
      ui.$$('.hb-toc li', view).forEach(function (li) { const el = document.getElementById(domId(li.dataset.sec)); li.hidden = !!(el && el.hidden); });
      ui.$$('.hb-toc-g', view).forEach(function (g) { g.hidden = !ui.$$('li', g).some(function (li) { return !li.hidden; }); });
      if (!q) { countEl.textContent = ''; none.hidden = true; }
      else {
        countEl.textContent = shown ? (shown === 1 ? '1 section matches' : shown + ' sections match') : '';
        none.hidden = !!shown;
        if (!shown) none.innerHTML = ui.empty({ icon: 'search', title: 'Nothing found', text: 'No section matches "' + q + '". Try another word.' }) +
          '<p class="hb-none-act"><button type="button" class="btn" data-act="clear">Clear the search</button></p>';
      }
      active = null; spy();
    }
    function clearSearch(focus) {
      st.q = ''; input.value = ''; search();
      if (focus) input.focus({ preventScroll: true });
    }

    /* ---------- Jump to a section ---------- */
    function go(id, how) {
      const el = document.getElementById(domId(id)); if (!el) return;
      if (el.hidden || el.parentElement.hidden) clearSearch(false);
      const y = el.getBoundingClientRect().top + window.pageYOffset - offset();
      const animate = how !== 'instant' && smooth();
      setActive(id);
      lock = Date.now() + (animate ? 900 : 120);
      window.scrollTo({ top: Math.max(0, y), behavior: animate ? 'smooth' : 'auto' });
      if (how === 'focus') { const h = ui.$('.hb-sec-h', el); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
      try { history.replaceState(null, '', '#/handbook/' + short(id)); } catch (e) { /* file:// */ }
    }
    function openContents() {
      const rows = [];
      groups.forEach(function (g) {
        g.secs.forEach(function (s) {
          const el = document.getElementById(domId(s.id));
          if (el && (el.hidden || el.parentElement.hidden)) return;
          rows.push({ value: s.id, label: H.view(s).title, group: H.groupLabel(g.name) });
        });
      });
      const sh = Portal.openSheet({ title: 'Contents', rows: rows, selected: active, size: 'full',
        footer: '<a class="btn hb-pdf" href="' + pdf + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a>',
        onPick: function (v) { setTimeout(function () { go(v, 'focus'); }, 30); } });
      /* bring the current section into view in the list */
      const on = sh && sh.body && sh.body.querySelector('[aria-selected="true"]');
      if (on) setTimeout(function () { on.scrollIntoView({ block: 'center' }); }, 40);
    }

    let tmr;
    input.addEventListener('input', function () { clearBtn.hidden = !input.value; clearTimeout(tmr); tmr = setTimeout(function () { st.q = input.value; search(); }, 120); });
    input.addEventListener('search', function () { clearTimeout(tmr); st.q = input.value; search(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { e.preventDefault(); clearSearch(true); } });
    ui.on(view, 'click', '[data-go]', function (e, a) { e.preventDefault(); go(a.dataset.go, 'focus'); });
    ui.on(view, 'click', '[data-act=clear]', function () { clearSearch(true); });
    ui.on(view, 'click', '[data-act=toc]', openContents);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    if (st.q) search(); else spy();
    const want = params && params[0] ? (H.get(params[0]) || null) : null;
    if (want) setTimeout(function () { go(want.id, 'instant'); }, 60);

    return function () {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      clearTimeout(tmr); if (raf) cancelAnimationFrame(raf);
    };
  }
  /** 'YYYY-MM-DD' -> 'April 19, 2025' (the French dictionaries turn the whole line into French). */
  function longDate(iso) { const fmt = Club.fmt; return fmt && fmt.toDate ? fmt.toDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : iso; }

  Portal.register({
    id: 'handbook', label: 'Handbook', short: 'Handbook', icon: 'book', order: 52, tab: false,
    render: function (view, params) {
      /* A fresh inner element per drawing, so its listeners never pile up. */
      let host = null, stop = null;
      const draw = function (p) {
        if (stop) stop();
        const h = document.createElement('div'); h.className = 'hb-page';
        if (host) host.replaceWith(h); else { view.innerHTML = ''; view.appendChild(h); }
        host = h; stop = render(h, p);
      };
      draw(params);
      /* Staff edits in another tab: draw again (the search is kept). */
      const unsub = S.subscribe(H.COLL, function () { if (!document.body.contains(view)) return; draw([]); if (Club.i18n) Club.i18n.translate(host); });
      return function () { if (stop) stop(); if (typeof unsub === 'function') unsub(); };
    }
  });
})();
