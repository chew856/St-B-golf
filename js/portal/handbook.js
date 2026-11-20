/* Portal: Handbook. The club's Membership Handbook (Club.handbook, js/shared/handbook-data.js) for members to read:
   contents by group, a search box that filters sections and marks what matched, each section as an accordion, the
   club's PDF and the date of the last change. #/handbook/<section id> opens that section (e.g. #/handbook/dress-code).
   In French, unedited sections show the club's 2025 text in French (Club.handbookFr, js/i18n/fr-portal.js); sections
   staff changed or added show in English with a short note. The footer (French only) says the English prevails. */
(function () {
  'use strict';
  if (!window.Portal || !Portal.register || !Club.handbook) return;
  const H = Club.handbook, S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;
  const st = { q: '' };

  /** Lower case without accents, so "regle" finds "règle". */
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function wide() { return !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches); }
  function short(id) { return String(id).replace(/^hb_/, ''); }
  function domId(id) { return 'hb-' + short(id); }

  /** Wrap every match of q in the text under root in <mark class="ph-hit">. Returns the number of matches. */
  function mark(root, q) {
    const fq = fold(q); if (!fq) return 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    nodes.forEach(function (n) {
      const text = n.nodeValue;
      /* fold char by char so positions line up with the original text */
      let folded = '', map = [];
      for (let i = 0; i < text.length; i++) { const f = fold(text[i]); for (let j = 0; j < f.length; j++) { folded += f[j]; map.push(i); } }
      let at = folded.indexOf(fq); if (at < 0) return;
      const frag = document.createDocumentFragment(); let last = 0;
      while (at >= 0) {
        const s = map[at], e = map[at + fq.length - 1] + 1;
        if (s > last) frag.appendChild(document.createTextNode(text.slice(last, s)));
        const m = document.createElement('mark'); m.className = 'ph-hit'; m.textContent = text.slice(s, e); frag.appendChild(m);
        last = e; count++;
        at = folded.indexOf(fq, at + fq.length);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
    return count;
  }

  function sectionHTML(sec) {
    const v = H.view(sec), id = domId(sec.id), skip = H.french() ? ' data-i18n-skip' : '';
    const first = H.plain(v.body);
    return '<div class="pk-acc ph-sec" data-acc="' + esc(id) + '" id="' + esc(id) + '" data-sec="' + esc(sec.id) + '">' +
      '<button type="button" class="pk-acc-head" aria-expanded="false" aria-controls="' + esc(id) + '-b">' +
        '<span class="pk-acc-text"' + skip + ' lang="' + v.lang + '"><span class="pk-acc-title">' + esc(v.title) + '</span><span class="pk-acc-sum ph-sum">' + esc(first) + '</span></span>' +
        Club.icon('chevronDown', 'pk-acc-chev') +
      '</button>' +
      '<div class="pk-acc-wrap" id="' + esc(id) + '-b" role="region" aria-label="' + esc(v.title) + '" hidden><div class="pk-acc-body">' +
        (v.untranslated ? '<p class="ph-untr" data-i18n-skip lang="fr">' + Club.icon('info') + '<span>Le club a modifié cette section. La traduction française suivra.</span></p>' : '') +
        '<div class="hb-text ph-text"' + skip + ' lang="' + v.lang + '">' + H.html(v.body) + '</div>' +
      '</div></div></div>';
  }

  function render(view, params) {
    const secs = H.list();
    const groups = H.GROUPS.concat(secs.map(function (s) { return s.group; }).filter(function (g, i, a) { return H.GROUPS.indexOf(g) < 0 && a.indexOf(g) === i; }))
      .map(function (g) { return { name: g, secs: secs.filter(function (s) { return s.group === g; }) }; }).filter(function (g) { return g.secs.length; });
    const skip = H.french() ? ' data-i18n-skip' : '';
    const updated = H.lastUpdated();

    const toc = '<nav class="ph-toc" aria-label="Contents">' + groups.map(function (g) {
      return '<div class="ph-toc-g" data-group="' + esc(g.name) + '"><h3' + skip + '>' + esc(H.groupLabel(g.name)) + '</h3><ul>' + g.secs.map(function (s) {
        return '<li data-sec="' + esc(s.id) + '"><a href="#/handbook/' + esc(short(s.id)) + '" data-go="' + esc(s.id) + '"' + skip + '>' + esc(H.view(s).title) + '</a></li>';
      }).join('') + '</ul></div>';
    }).join('') + '</nav>';

    view.innerHTML =
      '<header class="pc-title ph-title"><h1>Membership handbook</h1><p>Club policies, rules and procedures for the golf course and clubhouse.</p></header>' +
      '<div class="ph-bar">' +
        '<label class="pc-search ph-search"><span class="sr-only">Search the handbook</span><span class="pc-search-box">' + Club.icon('search') +
          '<input class="input" type="search" name="q" placeholder="Search the handbook" aria-label="Search the handbook" autocomplete="off" enterkeyhint="search" value="' + esc(st.q) + '"></span></label>' +
        '<a class="btn ph-pdf" href="' + esc(H.META.pdfUrl) + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a>' +
      '</div>' +
      '<p class="ph-meta"><span>' + esc(H.META.title) + '</span><span class="ph-dot" aria-hidden="true">·</span><span>Last updated ' + esc(fmt.dateLong ? longDate(updated) : updated) + '</span></p>' +
      '<p class="ph-count" role="status" aria-live="polite"></p>' +
      '<div class="ph-layout">' +
        '<aside class="ph-side">' +
          '<div class="pk-acc ph-toc-acc' + (wide() ? ' is-open' : '') + '" data-acc="ph-toc">' +
            '<button type="button" class="pk-acc-head" aria-expanded="' + wide() + '" aria-controls="ph-toc-b">' + Club.icon('book', 'pk-acc-icon') +
              '<span class="pk-acc-text"><span class="pk-acc-title">Contents</span><span class="pk-acc-sum">' + secs.length + ' sections</span></span>' + Club.icon('chevronDown', 'pk-acc-chev') + '</button>' +
            '<div class="pk-acc-wrap" id="ph-toc-b" role="region" aria-label="Contents"' + (wide() ? '' : ' hidden') + '><div class="pk-acc-body">' + toc + '</div></div>' +
          '</div>' +
        '</aside>' +
        '<div class="ph-main">' +
          '<div class="ph-tools"><button type="button" class="p-link ph-all" data-act="all" aria-pressed="false">Open all sections</button></div>' +
          (groups.length ? groups.map(function (g) {
            return '<section class="ph-group" data-group="' + esc(g.name) + '"><h2 class="ph-group-h"' + skip + '>' + esc(H.groupLabel(g.name)) + '</h2>' + g.secs.map(sectionHTML).join('') + '</section>';
          }).join('') : ui.empty({ icon: 'book', title: 'The handbook is not available', text: 'Please call the club office at ' + Club.info.phone + '.' })) +
          '<div class="ph-none" hidden></div>' +
          '<footer class="ph-foot">' +
            '<p>' + esc(H.META.title) + '. The information in this handbook is general in nature and subject to the by-laws of the club.</p>' +
            '<p><a class="p-link" href="' + esc(H.META.pdfUrl) + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a></p>' +
            (H.french() ? '<p class="ph-fr-note" data-i18n-skip lang="fr">Ceci est une traduction française du guide des membres de 2025. En cas de divergence, la version anglaise prévaut.</p>' : '') +
          '</footer>' +
        '</div>' +
      '</div>';

    const input = ui.$('input[name=q]', view), countEl = ui.$('.ph-count', view), none = ui.$('.ph-none', view);
    /* Each section's clean body, to put back before marking a new search. */
    const clean = {};
    ui.$$('.ph-sec', view).forEach(function (el) { clean[el.dataset.sec] = { body: ui.$('.ph-text', el).innerHTML, title: ui.$('.pk-acc-title', el).innerHTML }; });

    function setOpen(el, open) {
      el.classList.toggle('is-open', open);
      const h = ui.$('.pk-acc-head', el), w = ui.$('.pk-acc-wrap', el);
      h.setAttribute('aria-expanded', String(open)); w.hidden = !open; w.style.height = '';
    }
    function search() {
      const q = st.q.trim();
      let shown = 0, hits = 0;
      ui.$$('.ph-sec', view).forEach(function (el) {
        const c = clean[el.dataset.sec];
        ui.$('.ph-text', el).innerHTML = c.body; ui.$('.pk-acc-title', el).innerHTML = c.title;
        if (!q) { el.hidden = false; return; }
        const n = mark(ui.$('.pk-acc-title', el), q) + mark(ui.$('.ph-text', el), q);
        el.hidden = !n; hits += n;
        if (n) { shown++; setOpen(el, true); }
      });
      ui.$$('.ph-group', view).forEach(function (g) { g.hidden = !ui.$$('.ph-sec', g).some(function (el) { return !el.hidden; }); });
      ui.$$('.ph-toc li', view).forEach(function (li) { const el = document.getElementById(domId(li.dataset.sec)); li.hidden = !!(el && el.hidden); });
      ui.$$('.ph-toc-g', view).forEach(function (g) { g.hidden = !ui.$$('li', g).some(function (li) { return !li.hidden; }); });
      if (!q) { countEl.textContent = ''; none.hidden = true; return; }
      countEl.textContent = shown ? (shown === 1 ? '1 section matches' : shown + ' sections match') : '';
      none.hidden = !!shown;
      if (!shown) none.innerHTML = ui.empty({ icon: 'search', title: 'Nothing found', text: 'No section matches "' + q + '". Try another word.' });
    }
    function go(id, focus) {
      const el = document.getElementById(domId(id)); if (!el) return;
      if (el.hidden) { st.q = ''; input.value = ''; search(); }
      setOpen(el, true);
      const hdr = document.querySelector('.p-header'), off = (hdr ? hdr.getBoundingClientRect().height : 0) + 12;
      const y = el.getBoundingClientRect().top + window.pageYOffset - off;
      const smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
      if (focus) { const h = ui.$('.pk-acc-head', el); if (h) h.focus({ preventScroll: true }); }
      try { history.replaceState(null, '', '#/handbook/' + short(id)); } catch (e) { /* file:// */ }
    }

    let tmr;
    input.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { st.q = input.value; search(); }, 120); });
    input.addEventListener('search', function () { st.q = input.value; search(); });
    ui.on(view, 'click', '[data-go]', function (e, a) {
      e.preventDefault();
      if (!wide()) { const tocAcc = ui.$('.ph-toc-acc', view); if (tocAcc) setOpen(tocAcc, false); }
      go(a.dataset.go, true);
    });
    ui.on(view, 'click', '[data-act=all]', function (e, b) {
      const open = b.getAttribute('aria-pressed') !== 'true';
      ui.$$('.ph-sec', view).forEach(function (el) { if (!el.hidden) setOpen(el, open); });
      b.setAttribute('aria-pressed', String(open)); b.textContent = open ? 'Close all sections' : 'Open all sections';
    });

    if (st.q) search();
    const want = params && params[0] ? (H.get(params[0]) || null) : null;
    if (want) setTimeout(function () { go(want.id, false); }, 60);
  }
  /** 'YYYY-MM-DD' -> 'April 19, 2025' (French in French mode through toLocaleDateString). */
  function longDate(iso) { return fmt.toDate ? fmt.toDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : iso; }

  Portal.register({
    id: 'handbook', label: 'Handbook', short: 'Handbook', icon: 'book', order: 52, tab: false,
    render: function (view, params) {
      /* A fresh inner element per drawing, so its listeners never pile up. */
      let host = null;
      const draw = function (p) {
        const h = document.createElement('div'); h.className = 'ph-page';
        if (host) host.replaceWith(h); else { view.innerHTML = ''; view.appendChild(h); }
        host = h; render(h, p);
      };
      draw(params);
      /* Staff edits in another tab: draw again (the search is kept). */
      return S.subscribe(H.COLL, function () { if (!document.body.contains(view)) return; draw([]); if (Club.i18n) Club.i18n.translate(host); });
    }
  });
})();
