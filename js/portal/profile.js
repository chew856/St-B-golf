/* Portal: Profile. Member card, a membership accordion and one row per section; each row opens a sheet
   (personal details, family, notifications, preferences, golf).
   Contact and preference edits write to the members collection with the same shape and validation as
   the staff member form (js/modules/members.js). Communication opt-ins live in getObj('portalPrefs').
   "Members' leaderboards" (golfers, while staff show the boards): members.leaderboardHidden true takes the member off
   the boards other members see in the portal (js/portal/leaderboards.js); staff boards still list them. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;
  /* Same lists as the staff member form (js/modules/members.js). */
  const CART_PREFS = ['Walk', 'Cart', 'Pull cart'];
  const DINING_PREFS = ['Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio'];
  const CART_LABEL = { Walk: 'Walking', Cart: 'By cart', 'Pull cart': 'With a pull cart' };
  const CART_SHORT = { Walk: 'Walk', Cart: 'Cart', 'Pull cart': 'Pull cart' };
  /** Older saved values (from before the venue rename) map onto the new list. */
  function diningPref(v) {
    if (DINING_PREFS.indexOf(v) >= 0) return v;
    if (/bar|grill room/i.test(v || '')) return 'Taphouse Bar';
    if (/patio|terrace/i.test(v || '')) return 'Patio';
    return 'Gallery Taphouse & Grill';
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PREFS = 'portalPrefs';
  const CHANNELS = [
    { key: 'email', label: 'Email', text: 'Statements, club news and event invitations.' },
    { key: 'sms', label: 'Text messages', text: 'Frost delays, course closures and tee time reminders.' },
    { key: 'app', label: 'Portal notices', text: 'Notices on your portal home page and club news.' }
  ];
  const STATUS = { active: null, leave: ['Leave of absence', 'info'], suspended: ['Account under review', 'warn'], resigned: ['Resigned', 'outline'] };

  function fresh(id) { return S.find('members', id); }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function setErr(form, name, msg) { const f = form.querySelector('[name="' + name + '"]'); if (!f) return; f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }
  function commPrefs(id) { const all = S.getObj(PREFS, {}) || {}; return Object.assign({ email: true, sms: true, app: true }, all[id] || {}); }
  function saveComm(id, patch) { const all = Object.assign({}, S.getObj(PREFS, {}) || {}); all[id] = Object.assign({}, all[id] || {}, patch, { updatedAt: new Date().toISOString() }); S.setObj(PREFS, all); }
  function hcpHistory(id) { return S.all('handicapHistory').filter(function (h) { return h.memberId === id && typeof h.index === 'number'; }).sort(function (a, b) { return a.date.localeCompare(b.date); }); }
  function isGolfer(m) { const t = tierOf(m); return t ? !!t.golf : m.handicap != null; }

  /* ---------------- Membership card ---------------- */
  function card(m) {
    const t = tierOf(m); const st = STATUS[m.status];
    return '<div class="pp-card" role="group" aria-label="Membership card">' +
        '<span class="pp-card-grain" aria-hidden="true"></span>' +
        '<div class="pp-card-top">' + Portal.crest('pp-card-crest') + '<span class="pp-card-eyebrow">Member</span></div>' +
        '<div class="pp-card-bottom">' +
          '<div class="pp-card-holder">' + esc(m.firstName + ' ' + m.lastName) + '</div>' +
          '<div class="pp-card-meta"><span>' + esc(t ? t.name : 'Member') + (st ? ' · ' + esc(st[0]) : '') + '</span>' +
            '<span class="num">No. ' + esc(m.memberNo) + '</span>' +
            (m.memberSince ? '<span>Member since ' + esc(String(m.memberSince).slice(0, 4)) + '</span>' : '') + '</div>' +
        '</div></div>';
  }

  /* ---------------- Sheet contents ---------------- */
  function contactForm(m) {
    return '<form class="pp-form" id="pp-f-contact" data-form="contact" novalidate>' +
      ui.field({ label: 'Email', name: 'email', type: 'email', value: m.email, required: true }) +
      ui.field({ label: 'Phone', name: 'phone', type: 'tel', value: m.phone, placeholder: '(204) 555-0100' }) +
      ui.field({ label: 'Home address', name: 'address', value: m.address, placeholder: 'Street, city, postal code' }) +
      '</form>';
  }
  function familyBody(m) {
    return '<dl class="pp-kv"><div><dt>Spouse or partner</dt><dd>' + (m.spouse ? esc(m.spouse) : 'None listed') + '</dd></div>' +
      '<div><dt>Children</dt><dd>' + (m.children ? esc(m.children + (m.children === 1 ? ' child' : ' children')) + ', with junior privileges' : 'None listed') + '</dd></div></dl>' +
      '<p class="pp-note">' + Club.icon('info') + '<span>To add or change family members, call the club office at <a href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</span></p>';
  }
  function commBody(m) {
    const p = commPrefs(m.id);
    return '<ul class="pp-comm">' + CHANNELS.map(function (c) {
        const id = 'pp_c_' + c.key;
        return '<li><label for="' + id + '" class="pp-comm-text"><span class="pp-comm-l">' + esc(c.label) + '</span><span class="pp-comm-s">' + esc(c.text) + '</span></label>' +
          '<label class="pp-comm-ctl" for="' + id + '"><span class="pp-state" aria-hidden="true">' + (p[c.key] ? 'On' : 'Off') + '</span><span class="toggle pp-toggle"><input type="checkbox" id="' + id + '" data-chan="' + c.key + '"' + (p[c.key] ? ' checked' : '') + '><span></span></span></label></li>';
      }).join('') + '</ul>' +
      '<p class="pp-note">' + Club.icon('info') + '<span>Saves as you go. Statements and account notices always go by email.</span></p>';
  }
  function prefsForm(m) {
    const pr = m.preferences || {};
    const cart = CART_PREFS.indexOf(pr.cart) >= 0 ? pr.cart : 'Cart';
    return '<form class="pp-form" id="pp-f-prefs" data-form="prefs" novalidate>' +
      (isGolfer(m) ? '<div class="field"><span class="pp-label" id="pp-cart-l">How you get around</span>' +
        '<div class="segmented pp-seg" role="radiogroup" aria-labelledby="pp-cart-l">' + CART_PREFS.map(function (c) {
          return '<button type="button" role="radio" data-cart="' + esc(c) + '" aria-checked="' + (c === cart) + '"' + (c === cart ? ' class="active"' : '') + '>' + esc(CART_SHORT[c]) + '</button>';
        }).join('') + '</div></div>' : '') +
      '<input type="hidden" name="cart" value="' + esc(cart) + '">' +
      '<input type="hidden" name="dining" value="' + esc(diningPref(pr.dining)) + '">' +
      '<div class="pp-dining"></div>' +
      dietField(pr) +
      ui.field({ label: 'Dietary and service notes', name: 'notes', type: 'textarea', value: pr.notes, placeholder: 'For example: no shellfish, likes the patio' }) +
      '</form>';
  }
  /* ---------------- Dining diet filter (Nov 21) ----------------
     members.preferences.diet: English labels, the default filter on Dining > Menus (js/portal/dining.js, which also
     saves it when the member taps a chip there). The chips reuse the Menus chip style (css/portal/dining.css). */
  const DIET_PREFS = ['Vegetarian', 'Vegan', 'Gluten free'];
  function dietOf(pr) { const d = (pr || {}).diet; return Array.isArray(d) ? DIET_PREFS.filter(function (x) { return d.indexOf(x) >= 0; }) : []; }
  function dietField(pr) {
    const on = dietOf(pr);
    return '<div class="field pp-diet"><span class="pp-label" id="pp-diet-l">Dietary preferences</span>' +
      '<div class="pd-diet-chips" role="group" aria-labelledby="pp-diet-l">' + DIET_PREFS.map(function (d) {
        const p = on.indexOf(d) >= 0;
        return '<button type="button" class="pd-diet-chip' + (p ? ' on' : '') + '" data-diet-pref="' + esc(d) + '" aria-pressed="' + p + '">' + Club.icon('check', 'pd-diet-tick') + '<span>' + esc(d) + '</span></button>';
      }).join('') + '</div>' +
      '<input type="hidden" name="diet" value="' + esc(on.join(',')) + '">' +
      '<span class="field-hint">The dining menus open showing only these dishes.</span></div>';
  }
  /* French decimals on the chart's axis ("2,5"): the shared chart writes them with a point */
  function frAxis(svg) { return Club.i18n && Club.i18n.lang && Club.i18n.lang() === 'fr' ? svg.replace(/(<text[^>]*>-?\d+)\.(\d+<\/text>)/g, '$1,$2') : svg; }
  function golfBody(m) {
    const hist = hcpHistory(m.id).slice(-12);
    const vals = hist.map(function (h) { return h.index; });
    let trend = '';
    if (vals.length > 1) {
      const d = Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
      const since = fmt.toDate(hist[0].date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });   /* "Dec 2025"; French "déc. 2025" */
      trend = d < 0 ? 'Down ' + Math.abs(d).toFixed(1) + ' since ' + since : d > 0 ? 'Up ' + d.toFixed(1) + ' since ' + since : 'No change since ' + since;
    }
    const allPos = vals.every(function (v) { return v >= 0; });
    const demoChart = Portal.scores ? Portal.scores.indexChart(m, hist) : null;   /* score posting demo (js/portal/scores.js) */
    return '<div class="pp-golf-top"><span class="pp-golf-l">Handicap index</span><span class="pp-hcp">' + esc(fmt.handicap(m.handicap)) + '</span>' + (trend ? '<span class="pp-trend">' + esc(trend) + '</span>' : '') + '</div>' +
      '<dl class="pp-kv"><div><dt>Plays</dt><dd class="pp-hand"><span class="pp-hand-v">' + esc(Club.members.hand(m) || 'Not recorded') + '</span><button type="button" class="p-link" data-act="hand" aria-haspopup="dialog">Change</button></dd></div><div><dt>Golf Canada no.</dt><dd class="num">' + (m.ghin ? esc(m.ghin) : 'Not recorded') + '</dd></div><div><dt>Locker</dt><dd>' + (m.locker ? 'No. ' + esc(m.locker) : 'None assigned') + '</dd></div></dl>' +
      (Portal.scores ? Portal.scores.golfRowsHTML(m) : '') +
      (demoChart || (vals.length > 1 && allPos ? '<div class="pp-chart"><h3 class="pp-chart-h">Your index over time</h3>' + frAxis(Club.charts.line({ labels: hist.map(function (h) { return fmt.toDate(h.date).toLocaleDateString('en-US', { month: 'short' }); }), series: [{ name: 'Index', values: vals, color: 'var(--forest-800)' }], height: 180 })) + '</div>'
        : vals.length > 1 ? '<div class="pp-chart pp-spark">' + Club.charts.sparkline(vals.map(function (v) { return -v; }), { width: 320, height: 60, color: 'var(--forest-800)' }) + '</div>'
          : '<p class="pp-chart-empty">Your index history will show here as scores are posted.</p>')) +
      '<p class="pp-note">' + Club.icon('info') + '<span>The golf shop updates your index from posted scores, and can help with lockers.</span></p>';
  }

  /* ---------------- Friends and privacy (memberPrivacy collection, owned by friends.js) ---------------- */
  const SHARE = [
    { key: 'handicap', label: 'Handicap', text: 'Your handicap index and how it has changed this season.' },
    { key: 'scores', label: 'Scores and results', text: 'League standings and tournament finishes.' }
  ];
  function privacySummary(id) {
    const p = Portal.friends.privacy(id); const on = SHARE.filter(function (x) { return p[x.key]; });
    return (on.length === SHARE.length ? 'Friends see tee times, handicap and results' : 'Friends see tee times' + (on.length ? ', ' + on.map(function (x) { return x.label.toLowerCase(); }).join(', ') : '')) + (p.requests === 'none' ? ' · Requests off' : '');
  }
  function privacyBody(id) {
    const p = Portal.friends.privacy(id); const blocked = Portal.friends.blockedBy(id);
    return '<p class="pp-intro">Friends always see your upcoming tee times and can join them. Choose what else they see.</p>' +
      '<ul class="pp-comm">' + SHARE.map(function (c) {
        const fid = 'pp_s_' + c.key;
        return '<li><label for="' + fid + '" class="pp-comm-text"><span class="pp-comm-l">' + esc(c.label) + '</span><span class="pp-comm-s">' + esc(c.text) + '</span></label>' +
          '<label class="pp-comm-ctl" for="' + fid + '"><span class="pp-state" aria-hidden="true">' + (p[c.key] ? 'On' : 'Off') + '</span><span class="toggle pp-toggle"><input type="checkbox" id="' + fid + '" data-share="' + c.key + '"' + (p[c.key] ? ' checked' : '') + '><span></span></span></label></li>';
      }).join('') + '</ul>' +
      '<div class="field pp-req"><span class="pp-label" id="pp-req-l">Who can send me friend requests</span>' +
        '<div class="segmented pp-seg" role="radiogroup" aria-labelledby="pp-req-l">' + [['all', 'All members'], ['none', 'Nobody']].map(function (o) {
          return '<button type="button" role="radio" data-req="' + o[0] + '" aria-checked="' + (p.requests === o[0]) + '"' + (p.requests === o[0] ? ' class="active"' : '') + '>' + o[1] + '</button>';
        }).join('') + '</div></div>' +
      (blocked.length ? '<div class="pp-blocked"><span class="pp-label">Blocked members</span><ul class="pp-comm">' + blocked.map(function (b) {
        return '<li><span class="pp-comm-text"><span class="pp-comm-l">' + esc(Portal.friends.nameOf(b)) + '</span></span><button type="button" class="btn btn-sm" data-unblock="' + esc(b) + '">Unblock</button></li>';
      }).join('') + '</ul></div>' : '') +
      '<p class="pp-note">' + Club.icon('info') + '<span>Changes save as you go.</span></p>';
  }

  /* ---------------- Members' leaderboards: show me or not (members.leaderboardHidden: true when off) ----------------
     Staff boards always list everyone; this only takes the member off the boards other members see. */
  function lbOn() { return !!(window.Club && Club.leaderboard && Club.leaderboard.settings().show); }
  function lbBody(m) {
    const on = !m.leaderboardHidden;
    return '<ul class="pp-comm"><li><label for="pp_lb" class="pp-comm-text"><span class="pp-comm-l">Show me on the members\' leaderboards</span>' +
        '<span class="pp-comm-s">Your name, place and scores, seen by members.</span></label>' +
        '<label class="pp-comm-ctl" for="pp_lb"><span class="pp-state" aria-hidden="true">' + (on ? 'On' : 'Off') + '</span><span class="toggle pp-toggle"><input type="checkbox" id="pp_lb" data-lb-show' + (on ? ' checked' : '') + '><span></span></span></label></li></ul>' +
      '<p class="pp-note">' + Club.icon('info') + '<span>Saves as you go. Club staff always see every round.</span></p>' +
      '<a class="pp-set pp-lb-open" href="#/leaderboards">' + Club.icon('trophy', 'pp-set-ic') + '<span class="pp-set-main"><span class="pp-set-l">Open Leaderboards</span></span>' + Club.icon('chevronRight', 'pp-set-go') + '</a>';
  }

  /* ---------------- Saves (same validation and store writes as before) ---------------- */
  function saveContact(m, form) {
    clearErrs(form);
    let ok = ui.validate(form);
    const v = ui.formData(form);
    if (v.email && !EMAIL_RE.test(v.email)) { setErr(form, 'email', 'Enter a valid email address.'); ok = false; }
    const digits = String(v.phone || '').replace(/\D/g, '');
    if (v.phone && (!/^[\d\s()+.\-]+$/.test(v.phone) || digits.length < 10 || digits.length > 15)) { setErr(form, 'phone', 'Enter a phone number with 10 to 15 digits, for example (204) 555-0100.'); ok = false; }
    if (v.address && v.address.length > 140) { setErr(form, 'address', 'Please keep the address under 140 characters.'); ok = false; }
    if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
    const cur = fresh(m.id);
    if (cur.email === v.email && (cur.phone || '') === v.phone && (cur.address || '') === v.address) { ui.toast('Your details are already up to date'); return true; }
    S.update('members', m.id, { email: v.email, phone: v.phone, address: v.address });
    ui.toast('Your details have been updated');
    return true;
  }
  function savePrefs(m, form) {
    clearErrs(form);
    const v = ui.formData(form);
    if (v.notes && v.notes.length > 300) { setErr(form, 'notes', 'Please keep notes under 300 characters. The club office is happy to take longer requests.'); const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
    const cur = fresh(m.id);
    const prefs = Object.assign({}, cur.preferences || {}, { cart: CART_PREFS.indexOf(v.cart) >= 0 ? v.cart : ((cur.preferences || {}).cart || 'Cart'), dining: diningPref(v.dining), notes: v.notes || '', diet: dietOf({ diet: String(v.diet || '').split(',') }) });
    S.update('members', m.id, { preferences: prefs });
    ui.toast('Your details have been updated');
    return true;
  }

  /* ---------------- Page ---------------- */
  function render(view, member) {
    const id = member.id;
    function rowsHTML(m) {
      const p = commPrefs(m.id); const on = CHANNELS.filter(function (c) { return p[c.key]; }).map(function (c) { return c.label; });
      const pr = m.preferences || {};
      const row = function (act, icon, label, sub, href) {
        const inner = Club.icon(icon, 'pp-set-ic') + '<span class="pp-set-main"><span class="pp-set-l">' + esc(label) + '</span>' + (sub ? '<span class="pp-set-s">' + esc(sub) + '</span>' : '') + '</span>' + (act === 'signout' ? '' : Club.icon('chevronRight', 'pp-set-go'));
        return '<li>' + (href ? '<a class="pp-set" href="' + href + '">' + inner + '</a>' : '<button type="button" class="pp-set' + (act === 'signout' ? ' pp-set-out' : '') + '" data-go="' + act + '" aria-haspopup="dialog">' + inner + '</button>') + '</li>';
      };
      return row('contact', 'user', 'Personal details', m.email || 'Email, phone and address') +
        row('family', 'members', 'Family on your membership', m.spouse || m.children ? [m.spouse, m.children ? m.children + (m.children === 1 ? ' child' : ' children') : ''].filter(Boolean).join(' · ') : 'None listed') +
        row('comm', 'bell', 'Notifications', on.length === CHANNELS.length ? 'Email, text and portal: all on' : on.length ? on.join(', ') + ' on' : 'All off') +
        (Portal.friends ? row('privacy', 'key', 'Friends and privacy', privacySummary(m.id)) : '') +
        row('prefs', 'star', 'Preferences', [isGolfer(m) ? CART_LABEL[pr.cart || 'Cart'] : '', diningPref(pr.dining)].filter(Boolean).join(' · ')) +
        (isGolfer(m) ? row('golf', 'flag', 'Golf', 'Handicap ' + fmt.handicap(m.handicap) + (m.locker ? ' · Locker ' + m.locker : '')) : '') +
        (isGolfer(m) && lbOn() ? row('leaderboards', 'trophy', 'Members\' leaderboards', m.leaderboardHidden ? 'You are hidden from other members' : 'Other members can see you') : '') +
        row('', 'billing', 'Statements', 'Balance, charges and payments', '#/account') +
        (Club.i18n ? '<li>' + Club.i18n.switchRow('pp-lang', Club.icon('globe', 'pp-set-ic')) + '</li>' : '') +
        row('signout', 'logout', 'Sign out');
    }
    const m0 = fresh(id) || member;
    const t = tierOf(m0); const st = STATUS[m0.status];
    const years = m0.memberSince ? new Date().getFullYear() - +String(m0.memberSince).slice(0, 4) : 0;
    view.innerHTML =
      '<header class="pp-title"><h1>Profile</h1></header>' +
      '<div class="pp-layout">' + card(m0) +
      (t ? '<div class="pp-member">' + Portal.accordion({ id: 'pp-tier', icon: 'crest', title: 'Your membership', summary: t.name + (years >= 1 ? ' · ' + years + (years === 1 ? ' year' : ' years') : ''),
        body: (t.description ? '<p class="pp-tier-d">' + esc(t.description) + '</p>' : '') +
          (st ? '<p class="pp-status">' + ui.badge(st[0], st[1]) + '<span>Questions? Call the club office at <a href="tel:' + esc(Club.info.phone.replace(/[^\d+]/g, '')) + '">' + esc(Club.info.phone) + '</a>.</span></p>' : '') }) + '</div>' : '') +
      '<ul class="p-list pp-settings" aria-label="Profile settings">' + rowsHTML(m0) + '</ul></div>';
    function refresh() { const l = ui.$('.pp-settings', view); if (l) l.innerHTML = rowsHTML(fresh(id) || member); }

    ui.on(view, 'click', '[data-go]', function (e, b) {
      const m = fresh(id) || member; const go = b.dataset.go;
      if (go === 'signout') { ui.confirm({ title: 'Sign out?', text: 'You can sign back in any time with your member number.', confirmLabel: 'Sign out' }).then(function (ok) { if (ok) Portal.signOut(); }); return; }
      if (go === 'contact') {
        const sh = Portal.openSheet({ title: 'Personal details', size: 'full', content: contactForm(m), footer: '<button type="submit" form="pp-f-contact" class="btn btn-primary">Save details</button>', onClose: refresh });
        ui.on(sh.body, 'submit', 'form', function (ev, form) { ev.preventDefault(); if (saveContact(fresh(id), form)) sh.close(); });
      } else if (go === 'family') {
        Portal.openSheet({ title: 'Family on your membership', content: familyBody(m) });
      } else if (go === 'comm') {
        const sh = Portal.openSheet({ title: 'Notifications', content: commBody(m), onClose: refresh });
        ui.on(sh.body, 'change', 'input[data-chan]', function (ev, f) {
          const patch = {}; patch[f.dataset.chan] = f.checked;
          saveComm(id, patch);
          const ctl = f.closest('.pp-comm-ctl'); const w = ctl && ui.$('.pp-state', ctl); if (w) w.textContent = f.checked ? 'On' : 'Off';
          const c = CHANNELS.find(function (x) { return x.key === f.dataset.chan; });
          ui.toast(c.label + (f.checked ? ' turned on' : ' turned off') + '. Saved.');
        });
      } else if (go === 'prefs') {
        const sh = Portal.openSheet({ title: 'Preferences', size: 'full', content: prefsForm(m), footer: '<button type="submit" form="pp-f-prefs" class="btn btn-primary">Save preferences</button>', onClose: refresh });
        const form = ui.$('form', sh.body);
        Portal.selectField(ui.$('.pp-dining', sh.body), { label: 'Favourite place to eat', title: 'Favourite place to eat', icon: 'dining', value: form.elements.dining.value,
          rows: DINING_PREFS.map(function (d) { return { value: d, label: d }; }), onChange: function (v) { form.elements.dining.value = v; } });
        ui.on(sh.body, 'click', '[data-cart]', function (ev, btn) {
          ui.$$('[data-cart]', sh.body).forEach(function (x) { const on = x === btn; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
          form.elements.cart.value = btn.dataset.cart;
        });
        /* Dining diet filter (Nov 21): chips toggle; saved with the rest on "Save preferences" */
        ui.on(sh.body, 'click', '[data-diet-pref]', function (ev, btn) {
          const p = btn.getAttribute('aria-pressed') !== 'true';
          btn.classList.toggle('on', p); btn.setAttribute('aria-pressed', String(p));
          form.elements.diet.value = ui.$$('[data-diet-pref][aria-pressed="true"]', sh.body).map(function (x) { return x.dataset.dietPref; }).join(',');
        });
        ui.on(sh.body, 'submit', 'form', function (ev, f) { ev.preventDefault(); if (savePrefs(fresh(id), f)) sh.close(); });
      } else if (go === 'privacy') {
        const sh = Portal.openSheet({ title: 'Friends and privacy', content: privacyBody(id), onClose: refresh });
        ui.on(sh.body, 'change', 'input[data-share]', function (ev, f) {
          const patch = {}; patch[f.dataset.share] = f.checked; Portal.friends.setPrivacy(id, patch);
          const w = ui.$('.pp-state', f.closest('.pp-comm-ctl')); if (w) w.textContent = f.checked ? 'On' : 'Off';
          ui.toast((SHARE.find(function (x) { return x.key === f.dataset.share; }) || {}).label + (f.checked ? ' shared with friends' : ' hidden from friends') + '. Saved.');
        });
        ui.on(sh.body, 'click', '[data-req]', function (ev, btn) {
          ui.$$('[data-req]', sh.body).forEach(function (x) { const on = x === btn; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
          Portal.friends.setPrivacy(id, { requests: btn.dataset.req });
          ui.toast(btn.dataset.req === 'none' ? 'Friend requests turned off. Saved.' : 'All members can send you requests. Saved.');
        });
        ui.on(sh.body, 'click', '[data-unblock]', function (ev, btn) {
          Portal.friends.unblock(id, btn.dataset.unblock); ui.toast(Portal.friends.nameOf(btn.dataset.unblock) + ' unblocked');
          const box = btn.closest('.pp-blocked'); btn.closest('li').remove();
          if (box && !ui.$('li', box)) box.remove();   /* no heading left over once the last member is unblocked */
        });
      } else if (go === 'leaderboards') {
        const sh = Portal.openSheet({ title: 'Members\' leaderboards', content: lbBody(m), onClose: refresh });
        ui.on(sh.body, 'change', 'input[data-lb-show]', function (ev, f) {
          const show = f.checked;
          S.update('members', id, { leaderboardHidden: !show });
          const w = ui.$('.pp-state', f.closest('.pp-comm-ctl')); if (w) w.textContent = show ? 'On' : 'Off';
          ui.toast(show ? 'You are shown on the members\' leaderboards. Saved.' : 'You are hidden from the members\' leaderboards. Saved.', null, { action: { label: 'Undo', onClick: function () {
            S.update('members', id, { leaderboardHidden: show });
            if (f.isConnected) { f.checked = !show; if (w) w.textContent = !show ? 'On' : 'Off'; }
            refresh();
          } } });
        });
      } else if (go === 'golf') {
        const sh = Portal.openSheet({ title: 'Golf', size: 'full', content: golfBody(m) });
        if (Portal.scores) Portal.scores.wireGolf(sh, m);
        ui.on(sh.body, 'click', '[data-act=hand]', function () {
          const cur = Portal.member() || m;
          Portal.openSheet({ title: 'Which hand do you play?', rows: Club.members.HANDS, selected: cur.hand || null, onPick: function (v) {
            if (v === cur.hand) return;
            S.update('members', cur.id, { hand: v });
            const out = ui.$('.pp-hand-v', sh.body); if (out) out.textContent = Club.members.hand({ hand: v });
            ui.toast('Saved: ' + Club.members.hand({ hand: v }));
          } });
        });
      }
    });
  }

  Portal.register({
    id: 'profile', label: 'Profile', icon: 'user', order: 70, tab: false, nav: false,
    render: function (view, params, member) { render(view, fresh(member.id) || member); }
  });
})();
