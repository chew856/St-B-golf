/* Club.app: module registry, hash router, shell chrome (sidebar, topbar, search). */
(function () {
  window.Club = window.Club || {};
  const ui = Club.ui, esc = ui.esc;

  const SECTIONS = ['Overview', 'Golf', 'Membership', 'Hospitality', 'Course', 'Administration'];
  const modules = [];
  let current = null, cleanup = null, lastRoute = null;

  /**
   * Club.register({ id, label, icon, section, order, render(view, params) -> cleanup?, badge?() , search?(q) })
   */
  Club.register = function (m) {
    m.order = m.order == null ? 50 : m.order;
    modules.push(m);
  };
  Club.modules = modules;

  function go(path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); }
  /* #/page/a/b, or #/page?date=2026-11-20 (a query after the page name is not part of its id: a date in it is passed as
     the first parameter, the same as #/page/2026-11-20). The page checks that the date exists. */
  function dec(x) { try { return decodeURIComponent(x); } catch (e) { return x; } }
  function parse() {
    const h = location.hash.replace(/^#\/?/, ''); const qi = h.indexOf('?');
    const parts = (qi < 0 ? h : h.slice(0, qi)).split('/').filter(Boolean).map(dec);
    const query = qi < 0 ? '' : h.slice(qi + 1);
    const params = parts.slice(1);
    const qd = /(?:^|&)date=([^&]*)/.exec(query);
    if (qd && !params.length) params.push(dec(qd[1]));
    return { id: parts[0] || 'dashboard', params: params };
  }

  /* ---------------- Sidebar ---------------- */
  function crestSVG() {
    return '<svg class="crest-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">' +
      '<path d="M24 3l17 6v12.5C41 32 33.8 40 24 45 14.2 40 7 32 7 21.5V9z"/>' +
      '<path d="M24 6.5l14 5v10C38 30 32 36.8 24 41 16 36.8 10 30 10 21.5v-10z" opacity=".5"/>' +
      '<path d="M24 13v18" /><path d="M24 13.5l7 3-7 3" fill="currentColor" fill-opacity=".25"/>' +
      '<path d="M16 33c2.4-1.4 5.1-2.2 8-2.2s5.6.8 8 2.2"/></svg>';
  }
  /* ---------------- Collapsible sidebar (desktop) ----------------
     The topbar button narrows the sidebar to an icon rail (labels on hover via title; counts become a dot). The choice
     is kept per device; the class is set on <html> before the first paint, so a collapsed sidebar never flashes open. */
  const SB_KEY = 'stboniface.staff.sidebar';
  const SB_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/></svg>';
  function labelToggle(b) {
    const c = document.documentElement.classList.contains('sb-collapsed');
    b.setAttribute('aria-label', c ? 'Expand sidebar' : 'Collapse sidebar'); b.setAttribute('title', c ? 'Expand sidebar' : 'Collapse sidebar');
    b.setAttribute('aria-expanded', String(!c));
  }
  function setCollapsed(on) {
    document.documentElement.classList.toggle('sb-collapsed', on);
    try { localStorage.setItem(SB_KEY, on ? 'collapsed' : 'open'); } catch (e) { /* storage blocked */ }
    const b = ui.$('.sb-toggle'); if (b) labelToggle(b);
    /* After the width transition: re-place the active indicator and let charts and sticky bars refit. */
    setTimeout(function () { markActive(); window.dispatchEvent(new Event('resize')); }, 260);
  }
  try { if (localStorage.getItem(SB_KEY) === 'collapsed') document.documentElement.classList.add('sb-collapsed'); } catch (e) { /* storage blocked */ }

  function buildSidebar() {
    const sb = document.getElementById('sidebar');
    const bySection = {};
    modules.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (m) { (bySection[m.section || 'Overview'] = bySection[m.section || 'Overview'] || []).push(m); });
    let html = '<a class="crest" href="#/dashboard" aria-label="' + esc(Club.info.name) + ' home">' + Club.logo() + '<div class="crest-name">' + esc(Club.info.name) + '</div></a><nav class="nav" aria-label="Main"><span class="nav-indicator"></span>';
    SECTIONS.concat(Object.keys(bySection).filter(function (s) { return SECTIONS.indexOf(s) < 0; })).forEach(function (sec) {
      if (!bySection[sec]) return;
      html += '<div class="nav-section"><div class="nav-section-title">' + esc(sec) + '</div>' + bySection[sec].map(function (m) {
        let b = null; try { b = m.badge ? m.badge() : null; } catch (e) { b = null; }
        return '<a class="nav-link" data-mod="' + m.id + '" href="#/' + m.id + '" title="' + esc(m.label) + '">' + Club.icon(m.icon || 'flag') + '<span class="nav-label">' + esc(m.label) + '</span>' + (b ? '<span class="nav-count">' + b + '</span>' : '') + '</a>';
      }).join('') + '</div>';
    });
    html += '</nav><div class="sidebar-foot"><div class="label-caps">Clubhouse</div><div>' + esc(Club.info.address) + '</div><div>' + esc(Club.info.phone) + '</div></div>';
    sb.innerHTML = html;
    markActive();
  }
  function markActive() {
    const id = current && current.id;
    const links = ui.$$('.nav-link');
    let active = null;
    links.forEach(function (l) { const a = l.dataset.mod === id; l.classList.toggle('active', a); if (a) { active = l; l.setAttribute('aria-current', 'page'); } else l.removeAttribute('aria-current'); });
    const ind = ui.$('.nav-indicator');
    if (ind && active) { const nav = ui.$('.nav'); ind.style.opacity = 1; ind.style.height = active.offsetHeight + 'px'; ind.style.transform = 'translateY(' + (active.offsetTop) + 'px)'; ind.style.top = '0px'; void nav; }
    else if (ind) ind.style.opacity = 0;
  }
  Club.app = { go: go, refreshNav: buildSidebar, render: render, modules: modules };

  /* ---------------- Router ---------------- */
  function render() {
    const r = parse();
    let m = modules.find(function (x) { return x.id === r.id; });
    if (!m) m = modules.find(function (x) { return x.id === 'dashboard'; }) || modules[0];
    if (!m) return;
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    /* shared kit: close sheets and the action bar when staff move to another page */
    if (window.Portal && Portal.resetChrome && location.hash !== lastRoute) Portal.resetChrome();
    lastRoute = location.hash;
    const sameModule = current && current.id === m.id;
    current = m;
    const host = document.getElementById('view');
    host.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'view' + (sameModule ? '' : ' view-enter');
    host.appendChild(view);
    document.title = m.label + ' · ' + Club.info.name;
    try { cleanup = m.render(view, r.params) || null; }
    catch (e) {
      console.error(e);
      view.innerHTML = ui.pageHeader({ eyebrow: 'Something went wrong', title: m.label }) + ui.empty({ icon: 'alert', title: 'This page could not load', text: 'Reload the page. If it keeps happening, reset demo data in Settings. Details: ' + e.message });
    }
    ui.animateIn(view);
    markActive();
    document.querySelector('.app').classList.remove('nav-open');
    if (!sameModule) window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', render);

  /* ---------------- Topbar ---------------- */
  function buildTopbar() {
    const tb = document.getElementById('topbar');
    const w = Club.weather.today;
    tb.innerHTML = '<button class="btn btn-ghost btn-icon menu-toggle" aria-label="Open menu">' + Club.icon('menu') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-icon sb-toggle" aria-controls="sidebar">' + SB_ICON + '</button>' +
      '<div class="topbar-date">' + esc(Club.fmt.dateLong(new Date())) + '</div>' +
      '<div class="topbar-spacer"></div>' +
      '<div class="search">' + Club.icon('search') + '<input type="search" placeholder="Search members, bookings, items" aria-label="Search">' + (Club.cardScan ? Club.cardScan.button('search-scan') : '') + '<div class="search-results" role="listbox"></div></div>' +
      '<div class="weather-chip" id="weather-chip" title="' + esc(w.cond) + '">' + Club.icon(w.icon) + '<span><strong>' + Club.weather.nowTemp + '°</strong> ' + esc(w.cond) + ' · Wind ' + w.wind + ' km/h</span></div>' +
      '<div class="user-chip">' + ui.avatar((Club.user.firstName + ' ' + Club.user.lastName).trim(), 'sm', true) + '<span class="user-name">' + esc((Club.user.firstName + ' ' + Club.user.lastName).trim()) + '<br><span class="muted" style="font-size:11px">' + esc(Club.user.role) + '</span></span></div>';
    ui.$('.menu-toggle', tb).addEventListener('click', function () { document.querySelector('.app').classList.toggle('nav-open'); });
    const sbt = ui.$('.sb-toggle', tb);
    sbt.addEventListener('click', function () { setCollapsed(!document.documentElement.classList.contains('sb-collapsed')); });
    labelToggle(sbt);

    const input = ui.$('.search input', tb), box = ui.$('.search-results', tb);
    let hl = -1;
    function results(q) {
      q = q.toLowerCase().trim(); if (q.length < 2) return [];
      /* A membership card (scanner or typed): "STB-M-1003" or the bare number puts that member first, so Enter opens them. */
      const card = Club.members.fromCode(q);
      let out = Club.store.all('members').filter(function (m) { return card ? m.id === card.id : (m.firstName + ' ' + m.lastName + ' ' + m.memberNo + ' ' + m.email).toLowerCase().indexOf(q) >= 0; }).slice(0, 6)
        .map(function (m) { return { label: m.firstName + ' ' + m.lastName, sub: 'Member #' + m.memberNo + (card ? ' · Membership card' : ''), href: 'members/' + m.id, avatar: true }; });
      if (card && /^stb/i.test(q)) return out;
      modules.forEach(function (mod) { if (mod.search) { try { out = out.concat((mod.search(q) || []).slice(0, 4)); } catch (e) { console.error(e); } } });
      modules.forEach(function (mod) { if (mod.label.toLowerCase().indexOf(q) >= 0) out.push({ label: mod.label, sub: 'Go to page', href: mod.id, icon: mod.icon }); });
      return out.slice(0, 12);
    }
    function draw() {
      const rs = results(input.value); hl = -1;
      if (!input.value.trim() || input.value.trim().length < 2) { box.classList.remove('open'); return; }
      box.innerHTML = rs.length ? rs.map(function (r) { return '<a href="#/' + esc(r.href) + '">' + (r.avatar ? ui.avatar(r.label, 'sm') : '<span class="avatar sm light">' + Club.icon(r.icon || 'search') + '</span>') + '<span><div class="person-name">' + esc(r.label) + '</div><div class="person-sub">' + esc(r.sub || '') + '</div></span></a>'; }).join('')
        : '<div class="empty" style="padding:24px">No matches for “' + esc(input.value) + '”.</div>';
      box.classList.add('open');
    }
    /* A card scanner that sends no Enter after the code: a whole "STB-M-..." code that names a member opens them once
       the typing stops. */
    let cardT = null;
    function openCard(m) { clearTimeout(cardT); box.classList.remove('open'); input.value = ''; input.blur(); Club.app.go('members/' + m.id); }
    input.addEventListener('input', function () {
      draw(); clearTimeout(cardT);
      const v = input.value.trim(), m = /^stb[\s-]*m[\s-]*\d+$/i.test(v) ? Club.members.fromCode(v) : null;
      if (m) cardT = setTimeout(function () { if (input.value.trim() === v) openCard(m); }, 400);
    });
    input.addEventListener('focus', draw);
    input.addEventListener('keydown', function (e) {
      const links = ui.$$('a', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links.forEach(function (l, i) { l.classList.toggle('hl', i === hl); }); }
      if (e.key === 'Enter' && links.length) { clearTimeout(cardT); (links[hl] || links[0]).click(); input.blur(); }
      if (e.key === 'Escape') { input.value = ''; box.classList.remove('open'); input.blur(); }
    });
    box.addEventListener('click', function () { box.classList.remove('open'); input.value = ''; });
    const scanBtn = ui.$('[data-card-scan]', tb);
    if (scanBtn) { tb.querySelector('.search').classList.add('has-scan'); scanBtn.addEventListener('click', function () { Club.cardScan.open(openCard); }); }
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('.search')) box.classList.remove('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } });
  }

  /* Refresh nav badges whenever data changes */
  let navTimer;
  Club.store.subscribe('*', function () { clearTimeout(navTimer); navTimer = setTimeout(function () { buildSidebar(); }, 120); });
  let markRaf = 0; window.addEventListener('resize', function () { if (!markRaf) markRaf = requestAnimationFrame(function () { markRaf = 0; markActive(); }); });   /* once per frame */
  /* Background refreshes (another tab's change, live weather) wait while staff are mid-task: a dialog, sheet or
     picker is open, or a field on the page has unsaved typing. The refresh then runs once they are done. */
  const touched = new Set();   /* fields on the page the user has typed in or changed */
  ['input', 'change'].forEach(function (t) {
    document.addEventListener(t, function (e) { if (e.target.closest && e.target.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) touched.add(e.target); }, true);
  });
  function edited(f) {
    if (f.type === 'checkbox' || f.type === 'radio') return f.checked !== f.defaultChecked;
    if (f.tagName === 'SELECT') { const d = Array.prototype.findIndex.call(f.options, function (o) { return o.defaultSelected; }); return f.selectedIndex !== (d < 0 ? 0 : d); }
    return f.value !== f.defaultValue;
  }
  function busy() {
    if (document.querySelector('.overlay, .cs-pop') || document.body.classList.contains('ps-open')) return true;
    let mid = false;
    touched.forEach(function (f) { if (!document.contains(f)) touched.delete(f); else if (edited(f)) mid = true; });
    return mid;
  }
  let staleTimer = null;
  function refresh() {
    if (!busy()) { clearInterval(staleTimer); staleTimer = null; render(); return; }
    if (!staleTimer) staleTimer = setInterval(function () { if (!busy()) { clearInterval(staleTimer); staleTimer = null; render(); } }, 1500);
  }
  window.addEventListener('hashchange', function () { clearInterval(staleTimer); staleTimer = null; });   /* navigating renders fresh anyway */
  Club.store.subscribe('$external', refresh);
  /* Live weather arrived: refresh the top bar chip, and the page when staff are not mid-task. */
  window.addEventListener('club:weather', function () {
    const chip = document.getElementById('weather-chip'), w = Club.weather.today;
    if (chip && w) { chip.title = w.cond; chip.innerHTML = Club.icon(w.icon) + '<span><strong>' + Club.weather.nowTemp + '°</strong> ' + esc(w.cond) + ' · Wind ' + w.wind + ' km/h</span>'; }
    refresh();
  });

  /* Midnight: a page left open overnight moves to the new day. A light check once a minute, and when the tab comes back
     into view, updates the top bar date, the nav counts and (once staff are not mid-task) the page, whose "today" is
     read when it is drawn. */
  let dayShown = null;
  function checkDay() {
    const d = Club.date.today();
    if (!dayShown || d === dayShown) { dayShown = d; return; }
    dayShown = d;
    const el = document.querySelector('#topbar .topbar-date'); if (el) el.textContent = Club.fmt.dateLong(new Date());
    buildSidebar();
    refresh();
  }
  setInterval(checkDay, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });
  window.addEventListener('focus', checkDay);

  document.addEventListener('DOMContentLoaded', function () {
    buildSidebar();
    buildTopbar();
    render();
    dayShown = Club.date.today();
  });
})();
