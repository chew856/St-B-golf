/* Portal: Group outings (#/outings). Tournaments and corporate golf for a member's company, charity, club or group.
   Shows the club's outing packages exactly as the staff Group Outings module keeps them (outingPackages, seeded from the
   club's 2026 tournament package in js/shared/outings-data.js): player ranges, format, price per player, what is
   included, when each is offered, the food and beverage add-ons, the buffet, the terms and the tournament contacts.
   Nothing here is made up: every fact comes from that data.

   Routes: #/outings (packages and My enquiries), #/outings/enquire[/<packageId>] (the enquiry form),
   #/outings/sent/<outingId> (the confirmation).
   An enquiry is written to the staff collection `outings` in the same shape the staff "New enquiry" form saves
   (js/modules/outings.js openForm), stage 'Enquiry', plus source: 'portal', memberId, altDate, formatPref and
   packageUnsure, so it appears in staff Group Outings > Pipeline with a "Members' portal" badge and every staff action
   works on it as on a hand-entered one. The member follows the stage here (read only) and can withdraw while it is
   still new: that closes it as Lost with the reason "Withdrawn by member", which staff can reopen.
   Styles: css/portal/outings.css (.po-*). French: js/i18n/fr-portal.js (Group outings block).

   Redesign (Nov 22): no cards. The packages read like a printed rate card (the name, the price per player in the
   serif, what is included as a plain list, Enquire as a text link); My enquiries are hairline rows with a date block
   and the status as a word; the form is one column of sections under small capitals, with the package as a hairline
   list and the format as words. */
(function () {
  'use strict';
  if (!window.Portal || !Club.shared || !Club.shared.outings) return;
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, O = Club.shared.outings;
  const WITHDRAWN = 'Withdrawn by member';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  /* What the member sees for each staff stage. */
  const STATUS = {
    'Enquiry': { label: 'Enquiry received', kind: 'info', text: 'The club has your enquiry and will be in touch.' },
    'Quoted': { label: 'Quote sent', kind: 'good', text: 'The club has prepared a quote for your outing.' },
    'Deposit paid': { label: 'Deposit received', kind: 'good', text: 'Your deposit is on file and your date is held.' },
    'Confirmed': { label: 'Outing confirmed', kind: 'good', text: 'Your outing is confirmed. We look forward to welcoming your group.' },
    'Completed': { label: 'Outing played', kind: 'plain', text: 'Thank you for bringing your group to the club.' },
    'Lost': { label: 'Enquiry closed', kind: 'plain', text: 'This enquiry is closed. Please call the club if you would like to pick it up again.' }
  };
  const STEPS = [['Enquiry', 'Received'], ['Quoted', 'Quote'], ['Deposit paid', 'Deposit'], ['Confirmed', 'Confirmed']];
  const FORMATS = [['Tee times', 'Tee time starts'], ['Shotgun', 'Shotgun start'], ['No preference', 'No preference']];
  let draft = null, lastRoute = null;

  /* ---------------- Data helpers ---------------- */
  function pkgs() { return S.where('outingPackages', function (p) { return p.kind === 'package'; }).sort(function (a, b) { return a.minPlayers - b.minPlayers; }); }
  function addOns() { return S.where('outingPackages', function (p) { return p.kind === 'addon'; }); }
  function pkg(id) { const p = id ? S.find('outingPackages', id) : null; return p && p.kind === 'package' ? p : null; }
  function months() { const set = {}; pkgs().forEach(function (p) { (p.months || []).forEach(function (m) { set[m] = 1; }); }); return Object.keys(set).map(Number).sort(function (a, b) { return a - b; }); }
  function minPlayers() { return Math.min.apply(null, pkgs().map(function (p) { return p.minPlayers; }).concat([Infinity])); }
  function maxPlayers() { return Math.max.apply(null, pkgs().map(function (p) { return p.maxPlayers; }).concat([-Infinity])); }
  function fits(n) { return pkgs().find(function (p) { return n >= p.minPlayers && n <= p.maxPlayers; }) || null; }
  function monthName(m) { return new Date(2026, m - 1, 1).toLocaleDateString('en-CA', { month: 'long' }); }
  function shotgunMin() { const p = pkgs().find(function (x) { return x.format === 'Shotgun'; }); return p ? p.minPlayers : 100; }
  function range(p) { return p.minPlayers + ' to ' + p.maxPlayers + ' players'; }
  function unit(a) { return a.unit === 'pp' ? 'per player' : a.unit === 'ticket' ? 'per ticket' : 'each'; }
  function stamp() { return new Date().toISOString().slice(0, 19); }
  function mine(m) {
    return S.where('outings', function (o) { return o.source === 'portal' && o.memberId === m.id; })
      .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  }
  /** The member chose Not sure and the club has not quoted yet: the suggested package is not theirs to show. */
  function unsureYet(o) { return !!o.packageUnsure && (o.stage === 'Enquiry' || o.stage === 'Lost'); }
  function status(o) { return o.stage === 'Lost' && o.lostReason === WITHDRAWN ? { label: 'Withdrawn', kind: 'plain', text: 'You withdrew this enquiry.' } : (STATUS[o.stage] || STATUS.Enquiry); }
  function badge(o) { const s = status(o); return '<span class="badge ' + s.kind + ' po-status">' + esc(s.label) + '</span>'; }
  function dateLabel(iso) { return iso ? fmt.toDate(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  /** The first sentence (a full stop after a lowercase word, so "St. Boniface" does not end it). */
  function firstSentence(s) { const m = String(s || '').match(/^.*?[a-z]{2,}\.(?=\s|$)/); return m ? m[0] : String(s || ''); }
  function tel(p, ext) { return 'tel:' + String(p || '').replace(/[^\d+]/g, '') + (ext ? ',' + ext : ''); }

  /* Season days for the date picker: the months the packages are offered, from tomorrow on. Out of season (October to
     April) that is next season; during the season, the rest of this one and all of next. */
  function seasonDays() {
    const t = Club.date.today(), ms = months(); if (!ms.length) return [];
    const y = +t.slice(0, 4), m = +t.slice(5, 7);
    const years = m > ms[ms.length - 1] ? [y + 1] : m < ms[0] ? [y] : [y, y + 1];
    const out = [];
    years.forEach(function (yr) {
      ms.forEach(function (mo) {
        const n = new Date(yr, mo, 0).getDate();
        for (let d = 1; d <= n; d++) {
          const iso = yr + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          if (iso <= t) continue;
          if (Club.teeRules && Club.teeRules.isFriday(iso)) continue;   /* no tournaments or outside golf events on a Friday (Membership Handbook) */
          out.push({ date: iso, meta: pkgs().filter(function (p) { return (p.months || []).indexOf(mo) >= 0; }).map(function (p) { return p.short; }).join(', ') });
        }
      });
    });
    return out;
  }
  /* Rows for the first "Choose a date" sheet, worded like the date picker's own (js/portal/datepick.js). */
  function sheetRows(days) {
    const multi = days.length && days[0].date.slice(0, 4) !== days[days.length - 1].date.slice(0, 4);
    return days.map(function (x) {
      const d = fmt.toDate(x.date), w = Club.date.week(x.date)[0];
      const wo = { month: 'short', day: 'numeric' }; if (multi) wo.year = 'numeric';
      return { value: x.date, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), meta: x.meta, group: 'Week of ' + fmt.toDate(w).toLocaleDateString('en-US', wo) };
    });
  }
  /** A date field that starts empty ("Choose a date"); once a date is picked it is the portal date picker. */
  function dateField(root, o) {
    let dp = null;
    function empty() {
      dp = null;
      root.innerHTML = '<div class="dp po-dp"><span class="dp-label">' + esc(o.label) + '</span><div class="dp-row">' +
        '<button type="button" class="dp-field po-dp-empty" aria-haspopup="dialog" aria-expanded="false">' + Club.icon('calendar') + '<span class="dp-field-text">Choose a date</span>' + Club.icon('chevronDown', 'dp-chev') + '</button></div></div>';
      const b = ui.$('.dp-field', root);
      b.addEventListener('click', function () {
        b.setAttribute('aria-expanded', 'true');
        Portal.openSheet({ title: o.title, rows: sheetRows(o.days), selected: null,
          onPick: function (v) { set(v); o.onChange(v); const f = ui.$('.dp-field', root); if (f) f.focus(); },
          onClose: function () { const f = ui.$('.po-dp-empty', root); if (f) f.setAttribute('aria-expanded', 'false'); } });
      });
    }
    function set(v) {
      if (!v) { empty(); return; }
      if (dp) { dp.set(v); return; }
      dp = Portal.datePicker(root, { label: o.label, title: o.title, days: o.days, value: v, onChange: function (iso) { o.onChange(iso); } });
      ui.$('.dp', root).classList.add('po-dp');
    }
    set(o.value);
    return { set: set, focus: function () { const f = ui.$('.dp-field', root); if (f) f.focus(); } };
  }

  /* ---------------- Shared pieces ---------------- */
  function pkgCard(p) {
    return '<article class="po-pkg" data-reveal>' +
      '<div class="po-pkg-head"><span class="eyebrow">' + esc(range(p)) + '</span><h3>' + esc(p.name) + '</h3></div>' +
      '<div class="po-price"><span class="po-price-n">' + esc(fmt.money0(p.perPlayer)) + '</span><span class="po-price-u">per player</span></div>' +
      '<p class="po-pkg-fmt"><span>' + esc('Format: ' + p.format) + '</span></p>' +
      '<p class="po-pkg-when"><span>' + esc(p.availability) + '</span></p>' +
      '<ul class="po-incl">' + (p.includes || []).map(function (x) { return '<li><span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' +
      '<a class="p-link po-pkg-go" href="#/outings/enquire/' + esc(p.id) + '">Enquire about this package</a>' +
    '</article>';
  }
  function contactsHTML() {
    return '<ul class="po-people">' + O.PDF.contacts.map(function (c) {
      return '<li><div class="po-person"><span class="po-person-n" data-i18n-skip>' + esc(c.name) + '</span><span class="po-person-r">' + esc(c.title) + '</span>' +
        '<span class="po-person-links"><a class="p-link" href="' + esc(tel(Club.info.phone, c.ext)) + '"><span>' + esc(Club.info.phone + ' ext. ' + c.ext) + '</span></a>' +
        '<a class="p-link" href="mailto:' + esc(c.email) + '"><span>' + esc(c.email) + '</span></a></span></div></li>';
    }).join('') + '</ul>';
  }
  function infoHTML() {
    const groups = {};
    addOns().forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });
    const B = O.PDF.buffet;
    const buffetPkgs = pkgs().filter(function (p) { return p.buffet; }).map(function (p) { return p.name; });
    const carvery = addOns().find(function (a) { return a.id === 'ao_carvery'; });
    return '<div class="po-accs">' +
      Portal.accordion({ id: 'po-addons', title: 'Food and beverage add-ons', summary: addOns().length + ' options, priced per player or per item',
        body: Object.keys(groups).map(function (g) {
          return '<h4 class="po-acc-h">' + esc(g) + '</h4><ul class="po-rows">' + groups[g].map(function (a) {
            return '<li><span class="po-row-main"><span class="po-row-t">' + esc(a.name) + '</span>' + (a.desc ? '<span class="po-row-s">' + esc(a.desc) + '</span>' : '') + '</span><span class="po-row-p"><span>' + esc(fmt.money(a.price)) + '</span><small>' + esc(unit(a)) + '</small></span></li>';
          }).join('') + '</ul>';
        }).join('') + '<p class="po-fine">All pricing is surcharge inclusive.</p>' }) +
      Portal.accordion({ id: 'po-buffet', title: 'Build your own buffet', summary: buffetPkgs.length ? 'Included with the ' + buffetPkgs.join(' and ') : '',
        body: '<p class="po-p">' + esc(B.includes) + '.</p>' +
          [['Salads', 'salad', 'Choose 1'], ['Hot items', 'hot', 'Choose 2'], ['Vegetables', 'vegetable', 'Choose 1'], ['Starch', 'starch', 'Choose 1']].map(function (g) {
            return '<h4 class="po-acc-h"><span>' + esc(g[0]) + '</span><span class="po-acc-n">' + esc(g[2]) + '</span></h4><p class="po-p">' + esc(B[g[1]].join(', ')) + '</p>';
          }).join('') +
          (carvery ? '<h4 class="po-acc-h"><span>' + esc(carvery.name) + '</span><span class="po-acc-n">' + esc(fmt.money(carvery.price) + ' per player') + '</span></h4><p class="po-p">' + esc(B.carvery.join(', ')) + '</p>' : '') }) +
      Portal.accordion({ id: 'po-terms', title: 'Tournament terms', summary: 'Deposits, payment, numbers and food and beverage',
        body: '<dl class="po-terms">' + O.PDF.terms.map(function (t) { return '<div><dt>' + esc(t[0]) + '</dt><dd>' + esc(t[1]) + '</dd></div>'; }).join('') + '</dl>' }) +
      Portal.accordion({ id: 'po-contacts', title: 'Tournament contacts', summary: O.PDF.contacts.map(function (c) { return c.name; }).join(' and '), body: contactsHTML() }) +
    '</div>';
  }

  /* ---------------- #/outings ---------------- */
  function enquiryRow(o) {
    const p = pkg(o.packageId);
    const d = fmt.toDate(o.date);
    return '<li><button type="button" class="po-enq" data-enq="' + esc(o.id) + '">' +
      '<span class="po-dblock"><small>' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</small><span class="po-dblock-n">' + d.getDate() + '</span></span>' +
      '<span class="po-enq-main"><span class="po-enq-t" data-i18n-skip>' + esc(o.organization) + '</span>' +
      '<span class="po-enq-s">' + esc(o.players + ' players') + (p && !unsureYet(o) ? ' · ' + esc(p.name) : '') + '</span></span>' +
      badge(o) + '</button></li>';
  }
  function renderMain(view, m) {
    const list = mine(m);
    view.innerHTML = '<section class="p-hero po-hero" data-reveal><div class="eyebrow">Tournaments and corporate golf</div><h1>Group outings</h1>' +
        '<p>' + esc(firstSentence(O.PDF.blurb)) + '</p>' +
        '<div class="po-hero-acts"><a class="btn btn-primary" href="#/outings/enquire">Plan an outing</a></div></section>' +
      '<div class="po-main">' +
        '<section class="po-mine" data-reveal><div class="p-section-head"><h2>My enquiries</h2></div>' +
          (list.length ? '<ul class="po-enqs">' + list.map(enquiryRow).join('') + '</ul>'
            : '<div class="po-empty"><p>Your enquiries and their progress show here.</p><a class="p-link" href="#/outings/enquire">Send an enquiry</a></div>') +
        '</section>' +
        '<section class="po-pkgs-sec"><div class="p-section-head"><h2>Packages</h2></div><div class="po-pkgs">' + pkgs().map(pkgCard).join('') + '</div>' +
          '<p class="po-fine">All pricing is surcharge inclusive. From the club’s 2026 tournament package.</p></section>' +
        '<section class="po-info" data-reveal><div class="p-section-head"><h2>Good to know</h2></div>' + infoHTML() + '</section>' +
      '</div>';
    ui.on(view, 'click', '[data-enq]', function (e, b) { openEnquiry(b.dataset.enq, m, function () { Portal.render(); }); });
  }

  /** One enquiry: where it stands, what was sent, and Withdraw while it is still new. */
  function openEnquiry(id, m, after) {
    const o = S.find('outings', id); if (!o || o.memberId !== m.id) return;
    const p = pkg(o.packageId), st = status(o);
    const idx = STEPS.findIndex(function (s) { return s[0] === o.stage; });
    const lost = o.stage === 'Lost';
    const steps = o.stage === 'Completed' ? STEPS.length : idx;
    const fp = (FORMATS.find(function (f) { return f[0] === (o.formatPref || o.format); }) || FORMATS[0])[1];
    const paid = O.paid(o);
    const body = '<div class="po-sheet">' +
      '<div class="po-sheet-top">' + badge(o) + '<p>' + esc(st.text) + '</p></div>' +
      (lost ? '' : '<ol class="po-steps">' + STEPS.map(function (s, i) {
        const cls = i < steps || (i === steps && o.stage === 'Completed') ? 'done' : i === steps ? 'current' : '';
        return '<li class="' + cls + '"' + (cls === 'current' ? ' aria-current="step"' : '') + '><span class="po-step-n" aria-hidden="true">' + (i + 1) + '</span><span>' + esc(s[1]) + '</span></li>';
      }).join('') + '</ol>') +
      '<dl class="po-kv">' +
        '<div><dt>Group</dt><dd data-i18n-skip>' + esc(o.organization) + '</dd></div>' +
        '<div><dt>Preferred date</dt><dd>' + esc(dateLabel(o.date)) + '</dd></div>' +
        (o.altDate ? '<div><dt>Alternate date</dt><dd>' + esc(dateLabel(o.altDate)) + '</dd></div>' : '') +
        '<div><dt>Players</dt><dd>' + esc(String(o.players)) + '</dd></div>' +
        '<div><dt>Package</dt><dd>' + (unsureYet(o) ? 'Not sure yet' : p ? esc(p.name) : 'Not sure yet') + '</dd></div>' +
        '<div><dt>Format</dt><dd>' + esc(fp) + '</dd></div>' +
        (o.quote && !lost && o.stage !== 'Enquiry' ? '<div><dt>Quote</dt><dd>' + esc(fmt.money(o.quote.total)) + '</dd></div>' : '') +
        (paid > 0 ? '<div><dt>Paid so far</dt><dd>' + esc(fmt.money(paid)) + '</dd></div>' : '') +
        '<div><dt>Contact</dt><dd><span data-i18n-skip>' + esc(o.contactName) + '</span><br><span class="po-muted" data-i18n-skip>' + esc([o.email, o.phone].filter(Boolean).join(' · ')) + '</span></dd></div>' +
        (o.notes ? '<div class="po-kv-wide"><dt>Notes</dt><dd data-i18n-skip>' + esc(o.notes) + '</dd></div>' : '') +
        '<div><dt>Sent</dt><dd>' + esc(fmt.date(String(o.createdAt || '').slice(0, 10) || Club.date.today())) + '</dd></div>' +
      '</dl>' +
      (o.stage === 'Enquiry' ? '<div class="po-sheet-acts"><button type="button" class="btn po-withdraw" data-act="withdraw">Withdraw enquiry</button></div>' : '') +
    '</div>';
    const sh = Portal.openSheet({ title: o.organization, content: body });
    ui.$('.ps-head h2', sh.el).setAttribute('data-i18n-skip', '');
    ui.on(sh.body, 'click', '[data-act=withdraw]', function () {
      sh.setContent('<div class="po-sheet po-confirm"><h3>Withdraw this enquiry?</h3><p>The club will see that you withdrew it. To plan an outing later, send a new enquiry.</p>' +
        '<div class="po-sheet-acts"><button type="button" class="btn" data-act="keep">Keep enquiry</button><button type="button" class="btn btn-danger" data-act="confirm-withdraw">Withdraw enquiry</button></div></div>');
      const b = ui.$('[data-act=keep]', sh.body); if (b) b.focus();
    });
    ui.on(sh.body, 'click', '[data-act=keep]', function () { sh.close(); openEnquiry(id, m, after); });
    ui.on(sh.body, 'click', '[data-act=confirm-withdraw]', function () {
      const cur = S.find('outings', id);
      sh.close();
      if (!cur || cur.memberId !== m.id) { if (after) after(); return; }
      if (cur.stage !== 'Enquiry') { ui.toast('The club has already started on this enquiry. Please call ' + Club.info.phone + ' to make a change.', 'bad'); if (after) after(); return; }
      S.update('outings', id, { stage: 'Lost', lostReason: WITHDRAWN, withdrawnAt: stamp(), history: (cur.history || []).concat([{ at: stamp(), stage: 'Lost', note: 'Withdrawn by the member in the members’ portal' }]) });
      ui.toast('Your enquiry has been withdrawn');
      if (after) after();
    });
  }

  /* ---------------- #/outings/enquire ---------------- */
  function freshDraft(m, pkgId) {
    return { memberId: m.id, organization: '', players: '', date: null, altDate: null, packageId: pkg(pkgId) ? pkgId : 'unsure', formatPref: 'No preference',
      contactName: (m.firstName + ' ' + m.lastName).trim(), email: m.email || '', phone: m.phone ? ui.phone(m.phone) : '', notes: '' };
  }
  function players() { const n = String(draft.players).trim(); return /^\d+$/.test(n) ? +n : NaN; }
  /** Friendly checks from the package data and the tournament terms: shown as notes, never blocking. */
  function advice() {
    const out = [], n = players(), p = pkg(draft.packageId), mo = draft.date ? +draft.date.slice(5, 7) : 0;
    if (p && n >= minPlayers() && n <= maxPlayers() && (n < p.minPlayers || n > p.maxPlayers)) { const f = fits(n); out.push('The ' + p.name + ' is for ' + range(p) + '.' + (f ? ' For ' + n + ' players, the ' + f.name + ' fits.' : '')); }
    if (p && mo && (p.months || []).indexOf(mo) < 0) out.push(p.name + ': ' + p.availability.toLowerCase() + '.');
    if (draft.formatPref === 'Shotgun' && n > 0 && n < shotgunMin()) out.push('Shotgun events need at least ' + shotgunMin() + ' players or pay the equivalent course rental.');
    return out;
  }
  function estimate() {
    const n = players(), p = pkg(draft.packageId) || (draft.packageId === 'unsure' && n ? fits(n) : null);
    if (!p || !(n >= minPlayers() && n <= maxPlayers())) return null;
    return { p: p, n: n, total: n * p.perPlayer };
  }
  function summaryHTML() {
    const e = estimate(), p = pkg(draft.packageId), n = players();
    const rows = [];
    rows.push(['Package', p ? p.name : 'Not sure yet']);
    if (n > 0) rows.push(['Players', String(n)]);
    if (draft.date) rows.push(['Preferred date', fmt.dateShort(draft.date)]);
    if (draft.altDate) rows.push(['Alternate date', fmt.dateShort(draft.altDate)]);
    return '<h2 class="po-h">Your enquiry</h2><dl class="po-kv">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      (e ? '<div class="po-est"><span class="po-est-l">Package estimate</span><span class="po-est-n">' + esc(fmt.money0(e.total)) + '</span><span class="po-est-s">' + esc(e.n + ' players at ' + fmt.money0(e.p.perPlayer) + ' per player' + (p ? '' : ', ' + e.p.name)) + '</span><span class="po-est-s">Before taxes and any add-ons. The club confirms the price in your quote.</span></div>' : '') +
      '<p class="po-fine">This is an enquiry, not a booking. The club will follow up with you.</p>';
  }
  function barSummary() {
    const p = pkg(draft.packageId), n = players();
    return (p ? p.name : 'Not sure of the package') + (n > 0 ? ' · ' + n + ' players' : '');
  }

  function renderEnquire(view, m, pkgId) {
    if (!draft || draft.memberId !== m.id || (pkgId && !Portal.background())) draft = freshDraft(m, pkgId);
    const days = seasonDays(), ms = months();
    const choice = function (id, title, sub) {
      const on = draft.packageId === id;
      return '<button type="button" role="radio" class="po-choice' + (on ? ' active' : '') + '" aria-checked="' + on + '" data-pkg="' + esc(id) + '"><span class="po-choice-main"><span class="po-choice-t">' + esc(title) + '</span><span class="po-choice-s">' + [].concat(sub).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join(' · ') + '</span></span><span class="po-choice-k" aria-hidden="true">Selected</span></button>';
    };
    view.innerHTML = '<a class="po-back" href="#/outings">' + Club.icon('chevronLeft') + '<span>Group outings</span></a>' +
      '<section class="p-hero po-hero" data-reveal><h1>Plan a group outing</h1><p>Tell us your group and dates. The club replies with availability and a quote.</p></section>' +
      '<div class="p-cols po-cols"><form class="po-form" novalidate>' +
        '<section class="po-card"><h2 class="po-h">Your group</h2><div class="form-grid">' +
          '<div class="field span-2"><label for="po-org">Organisation or group name *</label><input class="input" id="po-org" name="organization" maxlength="80" autocomplete="organization" value="' + esc(draft.organization) + '" placeholder="Company, charity, club or group"></div>' +
          '<div class="field"><label for="po-players">Expected players *</label><input class="input" id="po-players" name="players" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="' + esc(draft.players) + '" placeholder="' + minPlayers() + ' to ' + maxPlayers() + '"><span class="field-hint">' + esc('Packages are for ' + minPlayers() + ' to ' + maxPlayers() + ' players.') + '</span></div>' +
        '</div></section>' +
        '<section class="po-card"><h2 class="po-h">Dates</h2><div class="po-dates"><div class="po-date" data-f="date"></div><div class="po-date" data-f="altDate"></div></div>' +
          '<p class="field-hint po-date-hint">' + esc('Outings run ' + monthName(ms[0]) + ' to ' + monthName(ms[ms.length - 1]) + '. Each date shows the packages offered that month.') + '</p></section>' +
        '<section class="po-card"><h2 class="po-h">Package and format</h2>' +
          '<div class="po-choices" role="radiogroup" aria-label="Package">' + pkgs().map(function (p) { return choice(p.id, p.name, [range(p), fmt.money0(p.perPlayer) + ' per player']); }).join('') +
            choice('unsure', 'Not sure', 'The club will suggest one for your group') + '</div>' +
          '<div class="po-fmt"><span class="pk-label" id="po-fmt-l">Format</span><div class="segmented po-seg" role="radiogroup" aria-labelledby="po-fmt-l">' + FORMATS.map(function (f) {
            const on = draft.formatPref === f[0];
            return '<button type="button" role="radio" data-fmt="' + esc(f[0]) + '" aria-checked="' + on + '"' + (on ? ' class="active"' : '') + '>' + esc(f[1]) + '</button>';
          }).join('') + '</div></div>' +
          '<div class="po-advice" aria-live="polite"></div></section>' +
        '<section class="po-card"><h2 class="po-h">Contact</h2><div class="form-grid">' +
          '<div class="field span-2"><label for="po-name">Contact name *</label><input class="input" id="po-name" name="contactName" maxlength="60" autocomplete="name" value="' + esc(draft.contactName) + '"></div>' +
          '<div class="field"><label for="po-email">Email *</label><input class="input" id="po-email" name="email" type="email" maxlength="120" autocomplete="email" value="' + esc(draft.email) + '"></div>' +
          '<div class="field"><label for="po-phone">Phone</label><input class="input" id="po-phone" name="phone" type="tel" inputmode="tel" maxlength="24" autocomplete="tel-national" value="' + esc(draft.phone) + '" placeholder="(204) 555-0123"></div>' +
        '</div><p class="field-hint">From your profile. Change if someone else should be contacted.</p></section>' +
        '<section class="po-card"><h2 class="po-h">Food and notes</h2>' +
          '<div class="field"><label for="po-notes">Food, drinks and anything else (optional)</label><textarea class="textarea" id="po-notes" name="notes" maxlength="1000" rows="4" placeholder="Meal ideas, prizes, hole sponsors, contests, special requests">' + esc(draft.notes) + '</textarea><span class="field-hint">The food and beverage add-ons and the buffet are listed on the Group outings page.</span></div></section>' +
        '<div class="po-send-row"><button type="submit" class="btn btn-primary po-send">Send enquiry</button></div>' +
      '</form><aside class="po-side"><div class="po-card po-summary" aria-live="polite"></div></aside></div>';

    const form = ui.$('.po-form', view);
    const fields = {};
    ['date', 'altDate'].forEach(function (k) {
      fields[k] = dateField(ui.$('[data-f=' + k + ']', view), { label: k === 'date' ? 'Preferred date *' : 'Alternate date (optional)', title: k === 'date' ? 'Choose a preferred date' : 'Choose an alternate date', days: days, value: draft[k],
        onChange: function (v) { draft[k] = v; clearErr(k); paint(); } });
    });
    if (draft.altDate) addClear();
    function addClear() {
      const host = ui.$('[data-f=altDate]', view); if (ui.$('.po-clear', host)) return;
      host.insertAdjacentHTML('beforeend', '<button type="button" class="p-link po-clear" data-act="clear-alt">Remove alternate date</button>');
    }
    function paint() {
      ui.$('.po-summary', view).innerHTML = summaryHTML();
      const a = advice();
      ui.$('.po-advice', view).innerHTML = a.length ? '<div class="po-note"><ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
      if (draft.altDate) addClear(); else { const c = ui.$('.po-clear', view); if (c) c.remove(); }
      if (window.innerWidth < 1024) Portal.actionBar.show({ summary: barSummary(), label: 'Send enquiry', onClick: send });
      else Portal.actionBar.hide();
    }
    function clearErr(name) {
      const host = name === 'date' || name === 'altDate' ? ui.$('[data-f=' + name + ']', view) : null;
      const el = host || ui.$('[name="' + name + '"]', form); if (!el) return;
      el.classList.remove('invalid', 'po-invalid'); const fld = host || el.closest('.field') || el.parentNode; const er = fld && fld.querySelector('.field-error'); if (er) er.remove();
    }
    function err(name, msg) {
      const host = name === 'date' || name === 'altDate' ? ui.$('[data-f=' + name + ']', view) : name === 'packageId' ? ui.$('.po-choices', view) : null;
      if (host) { host.classList.add('po-invalid'); if (!host.querySelector('.field-error')) host.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>'); return; }
      const i = ui.$('[name="' + name + '"]', form); if (!i) return;
      i.classList.add('invalid'); const fld = i.closest('.field'); if (fld && !fld.querySelector('.field-error')) fld.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
    }
    form.addEventListener('input', function (e) {
      const t = e.target; if (!t.name || !Object.prototype.hasOwnProperty.call(draft, t.name)) return;
      if (t.name === 'players') t.value = t.value.replace(/\D/g, '').slice(0, 3);
      draft[t.name] = t.value; clearErr(t.name);
      if (t.name === 'players') paint();
    });
    ui.on(view, 'click', '[data-pkg]', function (e, b) {
      draft.packageId = b.dataset.pkg;
      ui.$$('[data-pkg]', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
      paint();
    });
    ui.on(view, 'click', '[data-fmt]', function (e, b) {
      draft.formatPref = b.dataset.fmt;
      ui.$$('[data-fmt]', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
      paint();
    });
    ui.on(view, 'click', '[data-act=clear-alt]', function () { draft.altDate = null; fields.altDate.set(null); clearErr('altDate'); paint(); fields.altDate.focus(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(); });

    let sending = false;
    function send() {
      if (sending) return;
      ui.$$('.field-error', view).forEach(function (x) { x.remove(); });
      ui.$$('.invalid, .po-invalid', view).forEach(function (x) { x.classList.remove('invalid', 'po-invalid'); });
      const d = draft, n = players();
      let ok = true;
      if (!String(d.organization).trim()) { err('organization', 'Enter the name of your organisation or group.'); ok = false; }
      if (!String(d.players).trim()) { err('players', 'Enter how many players you expect.'); ok = false; }
      else if (!(n >= minPlayers() && n <= maxPlayers())) { err('players', 'Packages are for ' + minPlayers() + ' to ' + maxPlayers() + ' players.'); ok = false; }
      if (!d.date) { err('date', 'Choose a preferred date.'); ok = false; }
      if (d.altDate && d.altDate === d.date) { err('altDate', 'Choose a different date from your preferred date, or remove it.'); ok = false; }
      if (!String(d.contactName).trim()) { err('contactName', 'Enter a contact name.'); ok = false; }
      if (!String(d.email).trim()) { err('email', 'Enter an email address so the club can reply.'); ok = false; }
      else if (!EMAIL_RE.test(String(d.email).trim())) { err('email', 'That email address does not look right.'); ok = false; }
      const ph = String(d.phone || '').trim();
      if (ph && String(ph).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) { err('phone', 'Enter a 10-digit phone number, or leave it blank.'); ok = false; }
      if (!ok) {
        const x = ui.$('.invalid, .po-invalid', view);
        if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); const f = x.matches('input, textarea') ? x : ui.$('button', x); if (f) f.focus({ preventScroll: true }); }
        ui.toast('Please check the highlighted fields', 'bad');
        return;
      }
      sending = true;
      const unsure = d.packageId === 'unsure';
      const p = unsure ? fits(n) : pkg(d.packageId);
      const format = d.formatPref === 'Shotgun' ? 'Shotgun' : d.formatPref === 'Tee times' ? 'Tee times' : (p && p.format === 'Shotgun' ? 'Shotgun' : 'Tee times');
      const who = (Portal.member() || m);
      let note = 'Enquiry sent from the members’ portal by ' + who.firstName + ' ' + who.lastName + ' (#' + who.memberNo + ')';
      if (unsure && p) note += '. Not sure of the package: ' + p.name + ' suggested for ' + n + ' players';
      if (d.altDate) note += '. Alternate date ' + fmt.date(d.altDate);
      let doc = null;
      try {
        doc = S.insert('outings', {
          organization: String(d.organization).trim(), contactName: String(d.contactName).trim(), email: String(d.email).trim(), phone: ph ? ui.phone(ph) : '',
          date: d.date, altDate: d.altDate || null, players: n, format: format, formatPref: d.formatPref, start: format === 'Shotgun' ? '12:00' : '11:00', holes: 18,
          packageId: p ? p.id : null, packageUnsure: unsure, addOns: [], notes: String(d.notes || '').trim(),
          stage: 'Enquiry', quote: null, deposits: [], teeBlockId: null, roster: [], buffet: null, bar: '',
          source: 'portal', memberId: who.id,
          history: [{ at: stamp(), stage: 'Enquiry', note: note }]
        });
      } catch (x) { console.error(x); }
      sending = false;
      if (!doc) { ui.toast('We could not send your enquiry. Please try again, or call the club office at ' + Club.info.phone + '.', 'bad'); return; }
      draft = null;
      Portal.actionBar.hide();
      Portal.go('outings/sent/' + doc.id);
      ui.toast('Your enquiry has been sent');
    }
    paint();
  }

  /* ---------------- #/outings/sent/<id> ---------------- */
  function renderSent(view, m, id) {
    const o = S.find('outings', id);
    if (!o || o.memberId !== m.id) { Portal.go('outings'); return; }
    const p = pkg(o.packageId), c = O.PDF.contacts[0];
    view.innerHTML = '<a class="po-back" href="#/outings">' + Club.icon('chevronLeft') + '<span>Group outings</span></a>' +
      '<section class="po-done" data-reveal><div class="po-done-mark">' + Club.icon('check') + '</div>' +
        '<h1>Your enquiry has been sent</h1>' +
        '<p>' + esc('Thank you, ' + m.firstName + '. The club has your enquiry and will be in touch about availability and a quote.') + '</p>' +
        '<dl class="po-kv po-done-kv">' +
          '<div><dt>Group</dt><dd data-i18n-skip>' + esc(o.organization) + '</dd></div>' +
          '<div><dt>Preferred date</dt><dd>' + esc(dateLabel(o.date)) + '</dd></div>' +
          (o.altDate ? '<div><dt>Alternate date</dt><dd>' + esc(dateLabel(o.altDate)) + '</dd></div>' : '') +
          '<div><dt>Players</dt><dd>' + esc(String(o.players)) + '</dd></div>' +
          '<div><dt>Package</dt><dd>' + (o.packageUnsure ? 'Not sure yet' : p ? esc(p.name) : 'Not sure yet') + '</dd></div>' +
          '<div><dt>Status</dt><dd>' + badge(o) + '</dd></div>' +
        '</dl>' +
        '<div class="po-done-acts"><a class="btn btn-primary" href="#/outings">See my enquiries</a><a class="p-link" href="#/home">Back to Home</a></div>' +
        (c ? '<p class="po-fine"><span>' + esc('Questions in the meantime? Call ' + c.name + ', ' + c.title + ':') + '</span> <a class="p-link po-call" href="' + esc(tel(Club.info.phone, c.ext)) + '">' + esc(Club.info.phone + ' ext. ' + c.ext) + '</a></p>' : '') +
      '</section>';
  }

  Portal.register({
    id: 'outings', label: 'Group outings', short: 'Outings', icon: 'trophy', order: 45, tab: false,
    render: function (view, params, member) {
      const m = Portal.member() || member;
      view.classList.add('po-page');
      /* The router keeps the scroll position within a page: moving between the list, the form and the confirmation starts at the top. */
      const route = params.join('/');
      if (route !== lastRoute && !Portal.background()) window.scrollTo({ top: 0 });
      lastRoute = route;
      if (params[0] === 'enquire') { renderEnquire(view, m, params[1]); return function () { Portal.actionBar.hide(); }; }
      if (params[0] === 'sent' && params[1]) { renderSent(view, m, params[1]); return; }
      renderMain(view, m);
    }
  });
})();
