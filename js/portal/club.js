/* Portal: The club. Course conditions, club news, member directory and club information.
   Read only: courseStatus (course.js), announcements (communications.js), members and staff (core). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;
  const READ = 'portalNewsRead';

  /* Hours: the club's 2025 Membership Handbook (Club.handbook.hours, js/shared/handbook-data.js), with the main line
     under the office and the Gallery's breakfast hours as before. */
  function hoursList() {
    const H = Club.handbook;
    if (!H) return [{ venue: 'Club office', icon: 'billing', lines: [['Main line', Club.info.phone]], note: 'For hours, call the club office at ' + Club.info.phone + '.' }];
    return H.hours.map(function (h) {
      const lines = h.rows.map(function (r) { return [r.days, H.range(r), r.star ? '*' : '']; });
      if (h.id === 'office') lines.push(['Main line', Club.info.phone]);
      if (h.id === 'gallery') lines.push(['Breakfast', 'Served until 2pm']);
      return { venue: h.venue, icon: h.icon, lines: lines, note: h.note };
    });
  }
  /* Key contacts: the real people on the club's contact page. Emails are not published, so contact is by phone. */
  const CONTACTS = [
    { id: 'stf_2', note: 'Golf, the golf shop, lessons and tournaments' },
    { id: 'stf_1', note: 'The clubhouse, weddings and special events' },
    { id: 'stf_12', note: 'The Gallery menu and dietary needs' },
    { id: 'stf_6', note: 'The golf course' },
    { id: 'stf_20', note: 'Accounts and statements' },
    { id: 'stf_19', note: 'General enquiries' }
  ];
  const BENEFITS = [
    'Unlimited season golf', 'Club storage and cleaning', 'Pull cart', 'Private locker rooms', 'Towel service',
    'SIM teaching technology', 'Short game practice facility', 'Pro Shop discounts', 'Advance tee time booking',
    'Friday member play and beverage pricing', 'CPGA professional staff', 'Members’ league', 'Club events',
    'Gallery Taphouse member pricing', 'Reduced meeting room rates'
  ];
  const ETIQUETTE = [
    { title: 'Dress code', text: 'Appropriate golf attire is required for all players. It is expected that members will advise their guests of our dress requirements.', link: ['#/handbook/dress-code', 'Read the full dress code'] },
    { title: 'Soft spikes only', text: 'Soft spikes only, on the course and in the clubhouse.' },
    { title: 'On the course', text: 'Repair pitch marks, rake bunkers, replace divots and keep up with the group ahead.' },
    { title: 'Guests', text: 'Members can bring guests, who pay the green fee. You are responsible for your guests’ conduct and dress. Check in at the golf shop when you arrive.' }
  ];

  /* ---------------- Helpers ---------------- */
  function fresh(id) { return S.find('members', id); }
  /** Desktop has room to show the forecast and hole status open beside the conditions card. */
  function wide() { return !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches); }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function staffBy(role) { return S.all('staff').find(function (s) { return s.role === role && s.status !== 'inactive' && s.status !== 'terminated'; }) || null; }
  function tel(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
  /** '(204) 233-2497 ext. 215' (or an older '204-233-2497 x215') -> { href: 'tel:2042332497,215', label: '(204) 233-2497 ext. 215' } */
  function phoneOf(p) {
    const m = String(p || Club.info.phone).match(/^(.*?)\s*(?:x|ext\.?)\s*(\d+)$/i);
    if (!m) return { href: tel(p || Club.info.phone), label: ui.phone(p || Club.info.phone) };
    return { href: tel(m[1]) + ',' + m[2], label: ui.phone(m[1]) + ' ext. ' + m[2] };
  }
  function stamp(iso) {
    if (!iso) return 'Today’s report is not in yet';
    const d = new Date(iso); const day = Club.date.iso(d);
    return 'Updated ' + (day === Club.date.today() ? 'today' : fmt.dateShort(day)) + ' at ' + fmt.time(d);
  }

  /* Audience rules mirror communications.js: reachable members only, then by audience key. */
  function audienceKey(a) {
    if (a.audienceKey) return a.audienceKey;
    if (!a.audience || a.audience === 'All members') return 'all';
    if (a.audience === 'Golf members') return 'golf';
    if (a.audience === 'Board & committees') return 'board';
    if (a.audience === 'Staff') return 'staff';
    const t = S.all('membershipTiers').find(function (x) { return x.name + ' tier' === a.audience; });
    return t ? 'tier:' + t.id : 'all';
  }
  function reaches(a, m) {
    if (a.status !== 'sent' || !a.sentAt) return false;
    if (m.status === 'resigned' || m.status === 'suspended') return false;
    const k = audienceKey(a);
    if (k === 'all') return true;
    if (k === 'golf') { const t = tierOf(m); return t ? !!t.golf : m.tierId !== 'tier_social'; }
    if (k === 'board') return (m.tags || []).some(function (t) { return t === 'Board' || t === 'Committee'; });
    if (k.indexOf('tier:') === 0) return m.tierId === k.slice(5);
    return false;
  }
  function myNews(m) { return S.all('announcements').filter(function (a) { return reaches(a, m); }).sort(function (a, b) { return String(b.sentAt).localeCompare(String(a.sentAt)); }); }
  function readSet(id) { const all = S.getObj(READ, {}) || {}; return all[id] || []; }
  function markRead(id, annId) { const all = Object.assign({}, S.getObj(READ, {}) || {}); const list = (all[id] || []).slice(); if (list.indexOf(annId) < 0) { list.push(annId); all[id] = list; S.setObj(READ, all); } }

  function inline(s, first) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/\{first_name\}/g, esc(first));
  }
  function richBody(text, first) {
    return esc(text || '').split(/\n{2,}/).map(function (b) {
      const lines = b.split('\n');
      if (lines.every(function (l) { return /^\s*-\s+/.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*-\s+/, ''), first) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(function (l) { return inline(l, first); }).join('<br>') + '</p>';
    }).join('');
  }
  function plain(text, first) { return String(text || '').replace(/\*\*|\*/g, '').replace(/\{first_name\}/g, first).replace(/^\s*-\s+/gm, '').replace(/^Dear [^,\n]+,\s*/i, '').replace(/\s+/g, ' ').trim(); }

  function subnav(active, unread) {
    const items = [['', 'Course'], ['news', 'News'], ['directory', 'Directory'], ['info', 'Club info']];
    return '<nav class="pc-subnav" aria-label="The club">' + items.map(function (i) {
      const on = i[0] === active;
      return '<a href="#/club' + (i[0] ? '/' + i[0] : '') + '"' + (on ? ' class="active" aria-current="page"' : '') + '>' + esc(i[1]) + (i[0] === 'news' && unread ? '<span class="pc-count" aria-label="' + unread + ' new">' + unread + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
  }
  function hero(title, line) {
    return '<header class="pc-title"><h1>' + esc(title) + '</h1>' + (line ? '<p>' + esc(line) + '</p>' : '') + '</header>';
  }
  /* ---------------- Course today ---------------- */
  function renderCourse(host) {
    const st = S.getObj('courseStatus', null);
    const w = Club.weather;
    if (!st) { host.innerHTML = '<section class="panel">' + ui.empty({ icon: 'course', title: 'No course report yet', text: 'The superintendent posts conditions each morning. Please call the golf shop for today’s details.' }) + '</section>'; return; }
    const holes = Array.isArray(st.holes) && st.holes.length ? st.holes : [];
    const gur = holes.filter(function (h) { return h.status === 'GUR'; });
    const closed = holes.filter(function (h) { return h.status === 'closed'; });
    const open = st.open !== false;
    const supt = staffBy('Golf Course Superintendent');
    const cartText = { 'Normal': 'Carts can go anywhere on the fairways and rough.', '90 degree': 'Stay on the path. Cross fairways at right angles only.', 'Cart path only': 'Keep carts on the paths at all times.', 'No carts': 'No carts today. Walking only.' };
    const nums = function (l) { return (l.length === 1 ? 'Hole ' : 'Holes ') + l.map(function (h) { return h.number; }).join(', '); };
    const holesNote = (closed.length ? nums(closed) + ': closed. ' : '') + (gur.length ? nums(gur) + ': ground under repair (free relief).' : '') || 'All 18 holes are in play.';

    const pins = st.pins || 'Middle';
    const affected = closed.length + gur.length;
    const spd = +st.greenSpeed || 0;
    const pace = spd >= 10.5 ? 'fast' : spd >= 9 ? 'medium' : 'slow';
    const tile = function (label, value, note) { return '<div class="pc-tile"><span class="pc-tile-l">' + esc(label) + '</span><span class="pc-tile-v">' + esc(value) + '</span>' + (note ? '<span class="pc-tile-n">' + esc(note) + '</span>' : '') + '</div>'; };
    const lo = w && w.today && w.today.lo != null ? String(w.today.lo).replace('-', '−') : '';
    const neg = function (v) { return String(v).replace('-', '−'); };   /* every temperature with a true minus sign, as the low already was */
    host.innerHTML =
      '<article class="pc-card pc-cond' + (open ? '' : ' is-closed') + '">' +
        '<header class="pc-cond-head"><div>' +
          '<h2 class="pc-cond-state">' + (open ? 'Open for play' : 'Closed today') + '</h2>' +
          '<p class="pc-stamp">' + esc(stamp(st.updatedAt)) + '</p></div>' +
          (w && w.today ? '<p class="pc-now">' + Club.icon(w.today.icon) + '<span>' + esc(neg(w.nowTemp)) + '° ' + esc(w.today.cond) + '<br><span class="pc-now-c">H ' + esc(neg(w.today.hi)) + '° · L ' + esc(lo) + '° · Wind ' + esc(w.today.wind) + ' km/h</span></span></p>' : '') +
        '</header>' +
        '<div class="pc-tiles">' +
          tile('Carts', st.cartRule === '90 degree' ? '90° rule' : (st.cartRule || 'Normal'), cartText[st.cartRule] || '') +
          tile('Greens', spd.toFixed(1) + ' (' + pace + ')', (st.firmness || 'Medium') + ' greens') +
          tile('Pins', pins, pins === 'Back' ? 'Take an extra club in.' : pins === 'Front' ? 'Mind the false fronts.' : '') +
          tile('Holes', affected ? affected + ' affected' : 'All in play', affected ? holesNote : '') +
        '</div>' +
        (st.message ? '<div class="pc-note">' + Portal.accordion({ id: 'pc-note', icon: 'info', title: 'Note from the grounds crew', summary: (supt ? supt.firstName + ' ' + supt.lastName + ', ' : '') + 'Superintendent', body: '<p class="pc-note-p">' + esc(st.message) + '</p>' }) + '</div>' : '') +
      '</article>' +
      '<div class="pc-accs">' +
        (holes.length ? Portal.accordion({ id: 'pc-holes', icon: 'flag', open: wide(), title: 'Hole status', summary: affected ? affected + ' affected' : 'All 18 in play',
          body: '<ol class="pc-hole-grid">' + holes.map(function (h) { const lbl = h.status === 'GUR' ? 'ground under repair' : h.status === 'closed' ? 'closed' : 'in play'; return '<li class="h-' + esc(h.status) + '" aria-label="Hole ' + h.number + ': ' + lbl + '"><span>' + h.number + '</span></li>'; }).join('') + '</ol>' +
            '<ul class="pc-legend"><li><i class="h-open"></i>In play</li><li><i class="h-GUR"></i>Ground under repair</li><li><i class="h-closed"></i>Closed</li></ul>' +
            '<p class="pc-holes-note">' + esc(holesNote) + '</p>' }) : '') +
        Portal.accordion({ id: 'pc-fc', icon: 'calendar', open: wide(), title: '7-day forecast', summary: w.forecast.length > 1 ? 'Tomorrow ' + neg(w.forecast[1].hi) + '° · ' + w.forecast[1].cond : '',
          body: '<ol class="pc-fc">' + w.forecast.map(function (d, i) {
            return '<li' + (i === 0 ? ' class="today"' : '') + '><span class="pc-fc-day">' + esc(i === 0 ? 'Today' : fmt.weekday(d.date)) + '</span>' +
              '<span class="pc-fc-cond">' + Club.icon(d.icon) + '<span>' + esc(d.cond) + '</span></span>' +
              '<span class="pc-fc-rain">' + d.rain + '% rain</span>' +
              '<span class="pc-fc-t">' + neg(d.hi) + '° <span>' + String(d.lo).replace('-', '−') + '°</span></span></li>';
          }).join('') + '</ol>' }) +
      '</div>' +
      '<div class="pc-cta"><a class="btn btn-primary" href="#/tee-times">Book a tee time</a><a class="btn" href="' + tel(Club.info.phone) + '">' + Club.icon('phone') + '<span>Call the golf shop</span></a></div>';
  }

  /* ---------------- Club news ---------------- */
  function renderNews(host, m, refreshNav) {
    const list = myNews(m); const read = readSet(m.id);
    if (!list.length) {
      host.innerHTML = '<section class="panel">' + ui.empty({ icon: 'mail', title: 'No notices just now', text: m.status === 'suspended' ? 'Club notices resume once your account review is complete. The club office is happy to help.' : 'Notices from the club will appear here as they are sent.' }) + '</section>';
      return;
    }
    host.innerHTML = '<ul class="p-list pc-news">' + list.map(function (a) {
      const unread = read.indexOf(a.id) < 0;
      return '<li><button type="button" class="pc-notice' + (unread ? ' unread' : '') + '" data-id="' + esc(a.id) + '" aria-haspopup="dialog">' +
        '<span class="pc-notice-date">' + esc(fmt.dateShort(a.sentAt.slice(0, 10))) + '</span>' +
        '<span class="pc-notice-title">' + esc(a.title) + '</span>' + (unread ? '<span class="badge pc-new">New</span>' : '') +
        Club.icon('chevronRight', 'pc-chev') + '</button></li>';
    }).join('') + '</ul>';
    ui.on(host, 'click', '.pc-notice', function (e, b) {
      const a = S.find('announcements', b.dataset.id); if (!a) return;
      openLetter(a, m);
      markRead(m.id, a.id); b.classList.remove('unread'); const n = ui.$('.pc-new', b); if (n) n.remove();
      refreshNav();
    });
  }
  function openLetter(a, m) {
    const body = '<article class="pc-letter">' +
      '<p class="pc-letter-meta">' + esc(fmt.dateLong(new Date(a.sentAt))) + ' · To ' + esc(a.audience || 'All members') + '</p>' +
      '<h2 class="pc-letter-title">' + esc(a.title) + '</h2>' +
      '<div class="pc-letter-body">' + richBody(a.body, m.firstName) + '</div>' +
      '<p class="pc-sign">From ' + esc(a.author || 'the club office') + '</p>' +
      '<p class="pc-letter-foot">Questions? Call the club office at <a href="' + esc(phoneOf(Club.info.phone).href) + '">' + esc(Club.info.phone) + '</a>.</p></article>';
    ui.drawer({ title: 'Club notice', eyebrow: '', body: body });
  }

  /* ---------------- Directory ---------------- */
  const dir = { q: '', limit: 10 };
  function renderDirectory(host, me) {
    if (dir.limit < (wide() ? 24 : 10)) dir.limit = wide() ? 24 : 10;
    const all = S.all('members').filter(function (m) { return m.status !== 'resigned'; })
      .sort(function (a, b) { return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName); });
    host.innerHTML = '<section class="pc-dirwrap"><div class="pc-dir-head"><label class="pc-search"><span class="pc-search-l">Search</span><span class="pc-search-box">' + Club.icon('search') + '<input class="input" type="search" name="q" placeholder="Search members by name" aria-label="Search members by name" autocomplete="off" value="' + esc(dir.q) + '"></span></label>' +
      '<p class="pc-privacy">' + Club.icon('info') + '<span>To protect privacy, the directory shows only name, membership and year joined. The club office can pass on a message.</span></p></div><div class="pc-dir"></div></section>';
    const out = ui.$('.pc-dir', host);
    function draw() {
      const q = dir.q.trim().toLowerCase();
      const list = q ? all.filter(function (m) { return (m.firstName + ' ' + m.lastName).toLowerCase().indexOf(q) >= 0 || m.lastName.toLowerCase().indexOf(q) === 0; }) : all;
      if (!list.length) { out.innerHTML = ui.empty({ icon: 'members', title: 'No members found', text: 'No member matches "' + dir.q.trim() + '". Try a first or last name.' }); return; }
      const shown = list.slice(0, dir.limit);
      let letter = '';
      out.innerHTML = '<p class="pc-dir-count">' + (q ? list.length + (list.length === 1 ? ' member matches' : ' members match') : list.length + ' members') + '</p><ul class="p-list pc-dir-list">' + shown.map(function (m) {
        const t = tierOf(m); const L = m.lastName[0].toUpperCase(); let h = '';
        if (!q && L !== letter) { letter = L; h = '<li class="pc-letter-head"><h3 class="eyebrow">' + esc(L) + '</h3></li>'; }
        return h + '<li class="pc-dir-row">' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm', m.id !== me.id) + '<span class="pc-dir-main"><span class="person-name">' + esc(m.firstName + ' ' + m.lastName) + (m.id === me.id ? ' <span class="muted">(you)</span>' : '') + '</span><span class="person-sub">' + esc(t ? t.name : 'Member') + (m.memberSince ? ' · Member since ' + esc(String(m.memberSince).slice(0, 4)) : '') + '</span></span></li>';
      }).join('') + '</ul>' + (list.length > shown.length ? '<div class="pc-dir-more">' + ui.btn('Show more', { action: 'more', sm: true }) + '<span class="muted">Showing ' + shown.length + ' of ' + list.length + '</span></div>' : '');
    }
    draw();
    let tmr;
    ui.on(host, 'input', 'input[name=q]', function (e, f) { clearTimeout(tmr); tmr = setTimeout(function () { dir.q = f.value; dir.limit = wide() ? 24 : 10; draw(); }, 120); });
    ui.on(host, 'click', '[data-action=more]', function () { dir.limit += 24; draw(); });
  }

  /* ---------------- Information ---------------- */
  function renderInfo(host) {
    const people = CONTACTS.map(function (c) { const p = S.find('staff', c.id); return p && p.status !== 'inactive' && p.status !== 'terminated' ? { s: p, note: c.note } : null; }).filter(Boolean);
    const main = phoneOf(Club.info.phone);
    const links = [{ label: 'Club website', url: Club.info.website }, { label: 'Weddings and events', url: Club.info.eventsWebsite }].concat(Club.info.social || []).filter(function (l) { return l.url; });
    const about = esc(Club.info.name) + ' is a friendly club for golfers of all ages: a competitive, affordable course, a comfortable clubhouse and pro shop, and good service.';
    const about2 = 'Built in ' + esc(Club.info.est) + ', the course is a classic par 72 with tree-lined fairways, small sloping greens, and well-placed bunkers and water hazards.';
    function telLine(text) { // turn the club number inside a sentence into a tel: link
      const ph = Club.info.phone; const i = text.indexOf(ph);
      return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<a href="' + esc(main.href) + '">' + esc(ph) + '</a>' + esc(text.slice(i + ph.length));
    }
    const callMain = '<a class="p-link pc-call" href="' + esc(main.href) + '">' + Club.icon('phone') + '<span>Main line ' + esc(main.label) + '</span></a>';
    host.innerHTML =
      '<section class="pc-card pc-about"><h2>About the club</h2>' +
        '<p class="pc-about-p">' + about + ' <span class="pc-about-more" hidden>' + about2 + '</span> <button type="button" class="p-link pc-more" aria-expanded="false" data-act="about">More</button></p>' +
        callMain +
      '</section>' +
      '<div class="pc-accs">' +
        Portal.accordion({ id: 'pc-hours', icon: 'clock', title: 'Hours', summary: 'Office · Pro Shop · Gallery · Beer Cart',
          body: '<ul class="pc-rows">' + hoursList().map(function (h) {
            return '<li>' + Club.icon(h.icon, 'pc-row-ic') + '<div class="pc-row-main"><h3>' + esc(h.venue) + '</h3>' + h.lines.map(function (l) {
              const v = l[1] === Club.info.phone ? '<a href="' + esc(main.href) + '">' + esc(l[1]) + '</a>' : '<span>' + esc(l[1]) + '</span>' + (l[2] ? '<span aria-hidden="true">' + l[2] + '</span>' : '');
              return '<p class="pc-hour-line"><span>' + esc(l[0]) + '</span> · ' + v + '</p>'; }).join('') + (h.note ? '<p class="pc-hour-note">' + telLine(h.note) + '</p>' : '') + '</div></li>';
          }).join('') + '</ul>' +
          (Club.handbook ? '<p class="pc-hour-src">From the club’s 2027 Membership Handbook. <a class="p-link" href="#/handbook/hours">Read the handbook</a></p>' : '') }) +
        Portal.accordion({ id: 'pc-people', icon: 'phone', title: 'Who to contact', summary: people.length ? people.length + ' people, by phone' : 'Call the club office',
          body: people.length ? '<ul class="pc-rows pc-people">' + people.map(function (x) {
            const s = x.s; const ph = phoneOf(s.phone);
            return '<li>' + ui.avatar(s.firstName + ' ' + s.lastName, '', true) + '<div class="pc-row-main"><h3>' + esc(s.firstName + ' ' + s.lastName) + '</h3><p class="pc-person-role">' + esc(s.role) + '</p><p class="pc-person-note">' + esc(x.note) + '</p>' +
              '<a class="p-link pc-call" href="' + esc(ph.href) + '">' + Club.icon('phone') + '<span>' + esc(ph.label) + '</span></a></div></li>';
          }).join('') + '</ul>' : '<p>Please call the club office at <a href="' + esc(main.href) + '">' + esc(Club.info.phone) + '</a>.</p>' }) +
        Portal.accordion({ id: 'pc-benefits', icon: 'star', title: 'Membership benefits', summary: BENEFITS.length + ' included',
          body: '<ul class="pc-benefits">' + BENEFITS.map(function (b) { return '<li>' + Club.icon('check') + '<span>' + esc(b) + '</span></li>'; }).join('') + '</ul>' }) +
        Portal.accordion({ id: 'pc-et', icon: 'info', title: 'Dress code and etiquette', summary: 'Golf attire · soft spikes only',
          body: '<ul class="pc-rows">' + ETIQUETTE.map(function (e) { return '<li><div class="pc-row-main"><h3>' + esc(e.title) + '</h3><p>' + esc(e.text) + '</p>' + (e.link && Club.handbook ? '<a class="p-link" href="' + e.link[0] + '">' + esc(e.link[1]) + '</a>' : '') + '</div></li>'; }).join('') + '</ul>' }) +
        (links.length ? Portal.accordion({ id: 'pc-links', icon: 'link', title: 'Website and social', summary: links.map(function (l) { return l.label; }).slice(0, 3).join(' · ') + (links.length > 3 ? ' and more' : ''),
          body: '<ul class="pc-rows pc-links">' + links.map(function (l) { return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + Club.icon('link') + '<span>' + esc(l.label) + '</span>' + Club.icon('chevronRight', 'pc-chev') + '</a></li>'; }).join('') + '</ul>' }) : '') +
      '</div>';
    ui.on(host, 'click', '[data-act=about]', function (e, b) {
      const more = ui.$('.pc-about-more', host); const open = b.getAttribute('aria-expanded') === 'true';
      more.hidden = open; b.setAttribute('aria-expanded', String(!open)); b.textContent = open ? 'More' : 'Less';
    });
  }

  /* ---------------- Register ---------------- */
  Portal.register({
    id: 'club', label: 'The club', icon: 'crest', order: 50, tab: false,
    render: function (view, params, member) {
      const m = fresh(member.id) || member;
      const sub = ['news', 'directory', 'info'].indexOf(params[0]) >= 0 ? params[0] : '';
      const titles = { '': ['Course today', 'Conditions from the grounds crew, and the week ahead.'], news: ['Club news', 'Notices from the club, newest first.'], directory: ['Members', 'Find a fellow member by name.'], info: ['The club', 'Hours, contacts and club customs.'] };
      function unread() { const r = readSet(m.id); return myNews(m).filter(function (a) { return r.indexOf(a.id) < 0; }).length; }
      view.innerHTML = hero(titles[sub][0], titles[sub][1]) + subnav(sub, unread()) + '<div class="pc-body"></div>';
      const host = ui.$('.pc-body', view); host.classList.add('pc-on-' + (sub || 'course'));
      function refreshNav() { const nav = ui.$('.pc-subnav', view); if (nav) nav.outerHTML = subnav(sub, unread()); }
      const unsub = [];
      if (sub === '') { renderCourse(host); unsub.push(S.subscribe('$courseStatus', function () { renderCourse(host); ui.animateIn(host); })); }
      else if (sub === 'news') {
        renderNews(host, m, refreshNav);
        if (params[1]) { const a = S.find('announcements', params[1]); if (a && reaches(a, m)) { openLetter(a, m); markRead(m.id, a.id); refreshNav(); } }
      }
      else if (sub === 'directory') renderDirectory(host, m);
      else renderInfo(host);
      return function () { unsub.forEach(function (u) { u(); }); };
    }
  });
})();
