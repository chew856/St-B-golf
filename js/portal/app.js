/* Portal: the members' side. Sign-in, page registry, router, header and mobile tab bar. */
(function () {
  const ui = Club.ui, esc = ui.esc;
  const SESSION = 'stboniface.portal.session';
  const pages = [];
  let current = null, cleanup = null, lastRoute = null, chromeFor = null, chromeMenu = null;
  /* A member is mid-flow when a sheet, dialog or the sticky action bar is showing: background refreshes wait. */
  function busy() { return document.body.classList.contains('ps-open') || document.body.classList.contains('has-bar') || !!document.querySelector('.overlay'); }

  function getSession() { try { return localStorage.getItem(SESSION); } catch (e) { return null; } }
  function setSession(id) { try { if (id) localStorage.setItem(SESSION, id); else localStorage.removeItem(SESSION); } catch (e) { /* private mode */ } }

  const Portal = {
    pages: pages,
    /** Portal.register({ id, label, short, icon, order, tab, nav, hidden, render(view, params, member) -> cleanup? })
        hidden(): optional; true leaves the page out of the menus and its address goes to Home (e.g. Leaderboards
        while staff have them turned off). */
    register: function (p) { p.order = p.order == null ? 50 : p.order; pages.push(p); },
    member: function () { const id = getSession(); return id ? Club.store.find('members', id) : null; },
    go: function (path) { location.hash = '#/' + String(path).replace(/^#?\/?/, ''); },
    render: render,
    signOut: function () { setSession(null); location.hash = ''; boot(); },
    /** Portal.firstName() for greetings */
    firstName: function () { const m = Portal.member(); return m ? m.firstName : ''; }
  };
  window.Portal = Portal;

  /* The St.B oak-tree mark, tinted by the surrounding colour. */
  function crest(cls) { return Club.logo(cls || 'p-crest'); }
  Portal.crest = crest;

  function parse() {
    const h = location.hash.replace(/^#\/?/, ''); const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { id: parts[0] || 'home', params: parts.slice(1) };
  }
  function shown(p) { try { return !(p.hidden && p.hidden()); } catch (e) { return true; } }
  /* Menu order, most important first (owner, Nov 21): the header links, the tab bar (pages with tab: true, first 4)
     and the account menu follow it. A page not listed here falls in after these, by its own `order`. */
  const MENU = ['home', 'account', 'tee-times', 'play', 'dining', 'events', 'lessons', 'friends', 'scores', 'leaderboards',
    'handbook', 'club', 'gifts', 'shop', 'takeout', 'cart', 'outings', 'feedback', 'profile'];
  function rank(p) { const i = MENU.indexOf(p.id); return i < 0 ? 1000 + p.order : i; }
  function sorted() { return pages.slice().sort(function (a, b) { return rank(a) - rank(b); }).filter(shown); }
  /* The phone Menu sheet in labelled groups, Account first. Pages in no group go under Club. */
  const SHEET = [
    { label: 'Account', ids: ['account', 'profile'] },
    { label: 'Golf', ids: ['tee-times', 'play', 'scores', 'lessons', 'leaderboards', 'outings'] },
    { label: 'Food and drink', ids: ['dining', 'takeout', 'cart'] },
    { label: 'Club', ids: ['events', 'friends', 'handbook', 'club', 'gifts', 'shop', 'feedback'] }
  ];
  function sheetHTML(list) {
    const placed = {}; SHEET.forEach(function (g) { g.ids.forEach(function (id) { placed[id] = 1; }); });
    const link = function (p) { return '<a href="#/' + p.id + '">' + Club.icon(p.icon || 'flag') + '<span>' + esc(p.label) + '</span>' + Club.icon('chevronRight') + '</a>'; };
    return SHEET.map(function (g, gi) {
      const ps = g.ids.map(function (id) { return list.find(function (p) { return p.id === id; }); }).filter(Boolean)
        .concat(gi === SHEET.length - 1 ? list.filter(function (p) { return !placed[p.id] && p.id !== 'home'; }) : []);
      return ps.length ? '<div class="p-more-group"><p class="p-more-h">' + esc(g.label) + '</p>' + ps.map(link).join('') + '</div>' : '';
    }).join('');
  }
  function menuKey() { return sorted().map(function (p) { return p.id; }).join(); }

  /* ---------------- Sign in ---------------- */
  function signIn() {
    document.body.className = 'portal signed-out';
    const root = document.getElementById('portal');
    const demo = [Club.store.find('members', Club.store.DEMO_MEMBER)].filter(Boolean);
    root.innerHTML =
      '<main class="p-signin">' +
        '<div class="p-signin-card" data-reveal>' +
          '<div class="p-signin-crest">' + Club.logoImg('p-signin-logo') + '</div>' +
          '<div class="eyebrow center">Members’ portal</div>' +
          '<h1 class="center">' + esc(Club.info.short) + '</h1>' +
          '<p class="p-signin-sub center">' + esc(Club.info.tagline) + '</p>' +
          '<form class="p-signin-form" novalidate>' +
            ui.field({ label: 'Member number', name: 'memberNo', required: true, placeholder: 'e.g. 1003' }) +
            ui.field({ label: 'Password', name: 'password', type: 'password', required: true, placeholder: 'Any password in this demo' }) +
            '<button class="btn btn-primary p-signin-btn" type="submit">Sign in</button>' +
          '</form>' +
          '<div class="flourish p-or"><span class="label-caps">Demo member</span></div>' +
          '<div class="p-demo">' + demo.map(function (m) {
            return '<button type="button" class="p-demo-btn" data-id="' + m.id + '">' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm') + '<span><span class="person-name">' + esc(m.firstName + ' ' + m.lastName) + '</span><span class="person-sub">#' + esc(m.memberNo) + ' · ' + esc((Club.members.tier(m) || {}).name || '') + '</span></span></button>';
          }).join('') + '</div>' +
        '</div>' +
        (Club.i18n ? '<div class="p-signin-lang">' + Club.i18n.switcher() + '</div>' : '') +
        '<p class="p-signin-foot">Not a member? <a href="public.html">Book public golf</a> \u00b7 Club staff? <a href="index.html">Open the club system</a></p>' +
      '</main>';
    const form = ui.$('form', root);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ui.validate(form)) return;
      const d = ui.formData(form);
      const m = Club.store.all('members').find(function (x) { return x.memberNo === d.memberNo.replace(/^#/, ''); });
      const field = ui.$('[name=memberNo]', form);
      ui.$$('.field-error', form).forEach(function (n) { n.remove(); });
      if (!m) { field.classList.add('invalid'); field.insertAdjacentHTML('afterend', '<span class="field-error">We could not find that member number. Check your membership card.</span>'); field.focus(); return; }
      if (m.status === 'resigned') { field.classList.add('invalid'); field.insertAdjacentHTML('afterend', '<span class="field-error">This membership is no longer active. Please call the club office.</span>'); field.focus(); return; }
      enter(m.id);
    });
    ui.on(root, 'click', '.p-demo-btn', function (e, b) { enter(b.dataset.id); });
    ui.animateIn(root);
  }
  function enter(id) {
    setSession(id);
    if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/home';
    boot();
    const m = Portal.member(); if (m) ui.toast('Welcome back, ' + m.firstName);
  }

  /* ---------------- Chrome ---------------- */
  function chrome() {
    document.body.className = 'portal signed-in';
    const m = Portal.member();
    const root = document.getElementById('portal');
    const list = sorted();
    const tabs = list.filter(function (p) { return p.tab; }).slice(0, 4);
    root.innerHTML =
      '<header class="p-header"><div class="p-header-inner">' +
        '<a class="p-brand" href="#/home" aria-label="' + esc(Club.info.name) + ' home">' + crest() + '<span><span class="p-brand-name">' + esc(Club.info.short) + '</span><span class="p-brand-sub">Members</span></span></a>' +
        '<nav class="p-nav" aria-label="Main">' + list.filter(function (p) { return p.nav !== false && p.id !== 'account'; })   /* My account is in the name menu (owner, Nov 21) */.map(function (p, i) { return '<a href="#/' + p.id + '" data-page="' + p.id + '" data-ord="' + i + '">' + esc(p.label) + '</a>'; }).join('') +
          '<div class="p-navmore" hidden><button type="button" class="p-navmore-btn" aria-haspopup="true" aria-expanded="false">More' + Club.icon('chevronDown') + '</button><div class="p-navmore-pop" hidden></div></div>' +
          '<span class="p-nav-ink"></span></nav>' +
        /* Language is a setting in Profile now (and on the sign-in page), not a header switch */
        '<div class="p-me">' +
          '<button class="p-me-btn" type="button" aria-haspopup="true" aria-expanded="false">' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm') + '<span class="p-me-name">' + esc(m.firstName) + '</span>' + Club.icon('chevronDown') + '</button>' +
          '<div class="p-me-menu" role="menu">' +
            '<div class="p-me-head"><div class="person-name">' + esc(m.firstName + ' ' + m.lastName) + '</div><div class="person-sub">Member #' + esc(m.memberNo) + '</div></div>' +
            '<a href="#/account" role="menuitem">' + Club.icon('billing') + 'My account</a>' +
            '<a href="#/profile" role="menuitem">' + Club.icon('user') + 'My profile</a>' +
            '<button type="button" data-action="signout" role="menuitem">' + Club.icon('logout') + 'Sign out</button>' +
          '</div>' +
        '</div>' +
      '</div></header>' +
      '<main id="p-view" class="p-main" tabindex="-1"></main>' +
      '<footer class="p-footer"><div class="flourish">' + crest('p-crest sm') + '</div><p class="serif">' + esc(Club.info.name) + '</p>' +
        '<p>' + esc(Club.info.address) + ' \u00b7 <a href="tel:' + esc(Club.info.phone.replace(/[^0-9]/g, '')) + '">' + esc(Club.info.phone) + '</a>' + (Club.info.email ? ' \u00b7 <a href="mailto:' + esc(Club.info.email) + '">' + esc(Club.info.email) + '</a>' : '') + '</p>' +
        '<p class="p-social">' + (Club.info.social || []).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>'; }).join(' \u00b7 ') + '</p>' +
        (Club.info.landAcknowledgement ? '<p class="p-land">' + esc(Club.info.landAcknowledgement) + '</p>' : '') + '</footer>' +
      '<nav class="p-tabbar" aria-label="Quick">' + tabs.map(function (p) { return '<a href="#/' + p.id + '" data-page="' + p.id + '">' + Club.icon(p.icon || 'flag') + '<span>' + esc(p.short || p.label) + '</span></a>'; }).join('') +
        '<button type="button" class="p-more-btn">' + Club.icon('menu') + '<span>More</span></button></nav>';

    const me = ui.$('.p-me', root), meBtn = ui.$('.p-me-btn', root);
    meBtn.addEventListener('click', function () { const o = me.classList.toggle('open'); meBtn.setAttribute('aria-expanded', o); });
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('.p-me')) { me.classList.remove('open'); meBtn.setAttribute('aria-expanded', 'false'); } });
    ui.on(root, 'click', '.p-me-menu a', function () { me.classList.remove('open'); });
    ui.on(root, 'click', '[data-action=signout]', function () { ui.confirm({ title: 'Sign out?', text: 'You can sign back in any time with your member number.', confirmLabel: 'Sign out' }).then(function (ok) { if (ok) Portal.signOut(); }); });
    ui.$('.p-more-btn', root).addEventListener('click', function () {
      const d = ui.drawer({ title: 'Menu', eyebrow: Club.info.short, body: '<div class="p-more-list">' + sheetHTML(list) + '<div class="p-more-group"><button type="button" data-action="signout">' + Club.icon('logout') + '<span>Sign out</span></button></div></div>' });
      ui.on(d.body, 'click', 'a', function () { d.close(); });
      ui.on(d.body, 'click', '[data-action=signout]', function () { d.close(); Portal.signOut(); });
    });
    const navMore = ui.$('.p-navmore', root), navMoreBtn = ui.$('.p-navmore-btn', root), navMorePop = ui.$('.p-navmore-pop', root);
    navMoreBtn.addEventListener('click', function () { const o = navMorePop.hidden; navMorePop.hidden = !o; navMoreBtn.setAttribute('aria-expanded', o); });
    document.addEventListener('mousedown', function (e) { if (!navMore.contains(e.target)) { navMorePop.hidden = true; navMoreBtn.setAttribute('aria-expanded', 'false'); } });
    ui.on(navMorePop, 'click', 'a', function () { navMorePop.hidden = true; navMoreBtn.setAttribute('aria-expanded', 'false'); });
    /* Escape at document level: Safari does not focus a button on click, so the key never reaches the menu itself. */
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !navMorePop.hidden) { navMorePop.hidden = true; navMoreBtn.setAttribute('aria-expanded', 'false'); navMoreBtn.focus(); } });
    let fitT = null;
    const refit = function () { clearTimeout(fitT); fitT = setTimeout(function () { fitNav(); markActive(); }, 60); };
    window.addEventListener('resize', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    /* Links change width after the header is drawn (the Friends badge arrives later), which moved the underline off its
       link and could squeeze the brand: re-fit on any change inside the nav, ignoring fitNav's own moves. */
    new MutationObserver(function () { if (!fitting) refit(); }).observe(ui.$('.p-nav', root), { childList: true, subtree: true, characterData: true });
    if (Club.i18n) Club.i18n.translate(ui.$('.p-header', root));   /* French labels are longer: measure those */
    fitNav();
  }

  let fitting = false;

  /* Priority menu: when the header is too narrow for every page, pages move into More from the end of the list
     (MENU order), so Home, Tee times and Play stay in the bar longest. My account is not in the bar: it is in the name menu. */
  function fitNav() {
    const nav = ui.$('.p-nav'), inner = ui.$('.p-header-inner'), more = nav && ui.$('.p-navmore', nav);
    if (!nav || !more || getComputedStyle(nav).display === 'none') return;
    const pop = ui.$('.p-navmore-pop', more);
    fitting = true; setTimeout(function () { fitting = false; }, 0);   /* the observer's callback for these moves runs before this resets */
    const links = ui.$$('a[data-ord]', nav).sort(function (a, b) { return a.dataset.ord - b.dataset.ord; });
    links.forEach(function (a) { nav.insertBefore(a, more); });
    more.hidden = true; pop.hidden = true;
    const brand = ui.$('.p-brand');   /* the bar squeezes the brand before it overflows */
    const over = function () { return inner.scrollWidth > inner.clientWidth + 1 || nav.scrollWidth > nav.clientWidth + 1 || (brand && brand.scrollWidth > brand.clientWidth + 1); };
    if (!over()) return;
    more.hidden = false;
    const out = [];
    links.slice(3).reverse().forEach(function (a) { if (over()) { out.push(a); pop.appendChild(a); } });
    out.reverse().forEach(function (a) { pop.appendChild(a); });
  }

  function markActive() {
    const id = current && current.id;
    ui.$$('.p-nav a, .p-tabbar a').forEach(function (a) { const on = a.dataset.page === id; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const navMore = ui.$('.p-navmore'); if (navMore) navMore.classList.toggle('has-active', !!ui.$('.p-navmore-pop a.active'));
    const ink = ui.$('.p-nav-ink'), act = ui.$('.p-nav > a.active') || (navMore && !navMore.hidden && navMore.classList.contains('has-active') ? navMore : null);
    if (ink && act) { ink.style.opacity = 1; ink.style.width = act.offsetWidth + 'px'; ink.style.transform = 'translateX(' + act.offsetLeft + 'px)'; }
    else if (ink) ink.style.opacity = 0;
  }

  /* ---------------- Router ---------------- */
  function render() {
    const m = Portal.member();
    if (!m) { signIn(); return; }
    /* The header shows the signed-in member: rebuild it when someone else signed in (in another tab). */
    if (!document.getElementById('p-view') || chromeFor !== m.id || chromeMenu !== menuKey()) { chrome(); chromeFor = m.id; chromeMenu = menuKey(); }
    const r = parse();
    let p = pages.find(function (x) { return x.id === r.id && shown(x); }) || pages.find(function (x) { return x.id === 'home'; }) || sorted()[0];
    if (!p) return;
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    if (Portal.resetChrome && location.hash !== lastRoute) Portal.resetChrome();   /* only when the member moves to another page */
    lastRoute = location.hash;
    cleanup = null;
    const same = current && current.id === p.id;
    current = p;
    const host = document.getElementById('p-view');
    host.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'p-page' + (same ? '' : ' view-enter');
    host.appendChild(view);
    document.title = p.label + ' · ' + Club.info.short + ' Members';
    try { cleanup = p.render(view, r.params, m) || null; }
    catch (e) {
      console.error(e);
      view.innerHTML = ui.empty({ icon: 'alert', title: 'This page could not load', text: 'Please refresh. If it keeps happening, call the club office on ' + Club.info.phone + '.' });
    }
    ui.animateIn(view);
    markActive();
    if (!same) window.scrollTo({ top: 0 });
  }
  function boot() {
    document.getElementById('portal').innerHTML = '';
    current = null;
    render();
    askHand();
  }
  /* Which hand the member plays: asked once, at sign-in, when the club has no answer on record. It cannot be skipped
     (no close button, Escape or tap outside); it can be changed later in Profile > Golf. */
  let handSheet = null, handFor = null;
  function closeHand() { const s = handSheet; handSheet = null; handFor = null; if (s) s.close(); }
  function askHand() {
    const m = Portal.member();
    /* The question is for one member: drop it when another member signed in (or out) in another tab, or when this
       member's hand was answered elsewhere. */
    if (handSheet) {
      const was = handFor && Club.store.find('members', handFor);
      if (!m || m.id !== handFor || !was || Club.members.hand(was)) closeHand();
    }
    if (!m || handSheet || Club.members.hand(m)) return;
    const forId = m.id;
    const sh = Portal.openSheet({ title: 'Which hand do you play?', locked: true, onClose: function () { if (handSheet === sh) { handSheet = null; handFor = null; } }, content:
      '<div class="p-hand-ask"><p class="p-hand-q">Welcome, ' + esc(m.firstName) + '. One quick question before you start.</p>' +
        '<div class="p-hand-opts">' + Club.members.HANDS.map(function (h) { return '<button type="button" class="btn p-hand-btn" data-hand="' + h.value + '">' + esc(h.label) + '</button>'; }).join('') + '</div>' +
        '<p class="p-hand-note">Your friends at the club and the golf shop can see this. You can change it in Profile.</p></div>' });
    if (sh.duplicate) return;
    handSheet = sh; handFor = forId;
    ui.on(sh.body, 'click', '[data-hand]', function (e, b) {
      if (handSheet !== sh) return;
      const who = Club.store.find('members', forId), cur = Portal.member();
      /* Only the member the question was shown for, while signed in here, and only if nobody has answered yet */
      if (!who || !cur || cur.id !== forId || Club.members.hand(who)) { closeHand(); askHand(); return; }
      Club.store.update('members', forId, { hand: b.dataset.hand });
      closeHand();
      ui.toast('Saved: ' + Club.members.hand({ hand: b.dataset.hand }));
    });
    const first = ui.$('[data-hand]', sh.body); if (first) setTimeout(function () { first.focus(); }, 50);
  }
  /* Any page change re-asks while the hand is still missing (a locked sheet is never closed by the router, but a
     sheet closed some other way must come back). */
  window.addEventListener('hashchange', function () { if (Portal.member()) { render(); askHand(); } });
  Club.store.subscribe('members', function () { if (handSheet) askHand(); });
  /* Signed in or out in another tab: this tab follows straight away rather than mixing two members. */
  window.addEventListener('storage', function (e) { if (e.key === SESSION) boot(); });
  /* Background redraws (new weather, another tab's change). Pages can ask Portal.background() to keep what the
     member had chosen (e.g. the tee-time date) instead of starting over. */
  let bg = false;
  Portal.background = function () { return bg; };
  function backgroundRender() {
    if (!Portal.member() || !document.getElementById('p-view') || busy()) return;
    bg = true; try { render(); } finally { bg = false; }
  }
  window.addEventListener('club:weather', backgroundRender);
  Club.store.subscribe('$external', backgroundRender);
  document.addEventListener('DOMContentLoaded', boot);
})();
