/* Public site: Become a member. The new-member offer, the membership categories and an online application.
   Categories and dues come from `membershipTiers`; whether a category is full comes from Club.membership
   (js/modules/members.js), which staff set on the Applications page. An application is written to the staff
   `applications` collection in the office's shape plus source 'Online': stage 'Received' for an open category,
   or the waiting list stage for a full one. No payment is taken online.
   Routes: #/join (overview), #/join/apply/<category> (form), #/join/sent (confirmation). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  function M() { return Club.membership; }

  /* What each category includes: play allowances from the club's 2025 Membership Handbook; storage and lockers as the
     club publishes them (stbonifacegolfclub.com, Golf > Membership). Order here is the order on the page. */
  const LOCKER = 'Club storage and a private locker';
  const EAGLE = ['No tee time restrictions', 'Book tee times 15 days in advance', LOCKER];
  const BIRDIE = ['Weekdays before 7:30 AM, 10:30 AM to 4 PM and after 5:30 PM', 'Weekends and holidays after 10:30 AM', 'Book tee times 13 days in advance', LOCKER];
  const SOCIAL = ['Member at the Opening Mixer in April and the Closing Social in October', '10% member discount in the Gallery and Pro Shop', 'Keeps your membership status'];
  const FACTS = {
    tier_founders: EAGLE,
    tier_eagle60: EAGLE,
    tier_eagleint: EAGLE,
    tier_full: BIRDIE,
    tier_birdieint: BIRDIE,
    tier_junior: ['Weekdays 10:30 AM to 4 PM and after 5:30 PM', 'Weekends and holidays after 10:30 AM', 'Book tee times 8 days in advance', LOCKER],
    tier_nonresident: ['Must meet MGA requirements', 'Weekdays 10:30 AM to 4 PM and after 5:30 PM', 'Weekends and holidays after 11 AM', 'Book tee times 8 days in advance'],
    tier_social: ['5 golf vouchers included'].concat(SOCIAL),
    tier_clubhouse: SOCIAL.concat(['No golf'])
  };
  /* "How did you hear about us?" answers: Club.membership.HEARD_FROM (js/modules/members.js), stored in English as `heardFrom`. */
  function heardList() { return M().HEARD_FROM; }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let sentId = null;   /* the application just sent, for the confirmation */

  /* ---------------- Helpers ---------------- */
  function slug(t) { return String(t.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  /** Published categories first, in the club's order, then any the office adds. */
  function tiers() {
    const order = Object.keys(FACTS);
    return S.all('membershipTiers').slice().sort(function (a, b) {
      const x = order.indexOf(a.id), y = order.indexOf(b.id);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });
  }
  function includes(t) { return FACTS[t.id] || (t.description ? [t.description] : []); }
  function ageLabel(t) { const r = M().AGE_RULES[t.id]; return r ? r.label : ''; }
  function isFull(t) { return M().isFull(t); }
  /* The handbook's newer categories have no price yet (annualDues null): say so instead of showing $0. */
  function priced(t) { return t.annualDues != null && t.annualDues !== ''; }
  function dues(t) {
    if (!priced(t)) return '<span class="label-caps">Annual dues</span><span class="join-dues-tbd">Price to be set by the club</span>';
    return '<span class="label-caps">Annual dues</span><span class="join-dues-amt serif">' + esc(fmt.money(t.annualDues, false)) + '</span><span class="join-dues-per">a year</span>';
  }
  function officeLink() { return '<a href="' + Pub.phoneHref() + '">' + esc(Club.info.phone) + '</a>'; }
  function nameOk(v) { return /^[\p{L}][\p{L}' .-]{0,39}$/u.test(String(v || '').trim()); }
  function phoneOk(v) { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 && /^[2-9]/.test(d) && /^[2-9]/.test(d.slice(3)); }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ---------------- Overview ---------------- */
  function offerHTML() {
    return '<div class="join-offer" aria-label="New-member offer">' +
      '<div class="label-caps">New-member offer</div>' +
      '<h2 class="join-offer-t">Your first year</h2>' +
      '<ul>' +
        '<li><span class="join-offer-name">Share waived</span><span class="join-offer-when">The $100 share, waived in your first year</span></li>' +
        '<li><span class="join-offer-name">Initiation fee waived</span><span class="join-offer-when">The $250 initiation fee plus GST, waived in your first year</span></li>' +
        '<li><span class="join-offer-name">50% joining bonus</span><span class="join-offer-when">A one-time bonus of 50% off your annual dues, issued as club account credit</span></li>' +
      '</ul>' +
      '<p class="join-offer-note">Use 25% in your first season on club purchases. The other 25% is applied in year two toward the share and initiation fee, if applicable, and any credit left over goes toward later years’ dues. For first-time members.</p>' +
    '</div>';
  }
  function catCard(t, i) {
    const full = isFull(t), age = ageLabel(t);
    return '<article class="panel join-cat' + (full ? ' is-full' : '') + '" data-tier="' + esc(t.id) + '" style="--i:' + i + '">' +
      '<div class="join-cat-head"><div><h3>' + esc(t.name) + '</h3>' + (age ? '<div class="join-cat-age">' + esc(age) + '</div>' : '') + '</div>' +
        (full ? ui.badge('Full', 'warn') : ui.badge('Open', 'good')) + '</div>' +
      '<ul class="join-inc">' + includes(t).map(function (x) { return '<li>' + Club.icon('check') + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' +
      (full ? '<p class="join-full-note">' + Club.icon('clock') + '<span>This category is full. Join the waiting list and the club office will contact you when a place opens.</span></p>' : '') +
      '<div class="join-cat-foot"><div class="join-dues">' + dues(t) + '</div>' +
        '<a class="btn ' + (full ? 'join-wait-btn' : 'btn-primary join-apply-btn') + '" href="#/join/apply/' + esc(slug(t)) + '">' + (full ? '<span>Join the waitlist</span>' : '<span>Apply now</span>') + Club.icon('chevronRight') + '</a></div>' +
    '</article>';
  }
  function overview(view) {
    view.innerHTML =
      '<section class="pub-hero join-hero" data-reveal>' +
        '<div class="join-hero-copy">' +
          '<div class="eyebrow">Membership at ' + esc(Club.info.short) + '</div>' +
          '<h1>Become a member</h1>' +
          '<p class="pub-hero-lead serif">' + esc(Club.info.tagline) + '. Choose the category that suits how you play and apply online. The club office reviews every application and will be in touch.</p>' +
          '<div class="pub-hero-actions"><a class="btn btn-brass" href="#join-cats" data-act="jump">' + Club.icon('members') + '<span>See the categories</span></a>' +
            '<a class="btn pub-btn-night" href="' + Pub.phoneHref() + '">' + Club.icon('phone') + '<span>Call the office</span></a></div>' +
        '</div>' + offerHTML() +
      '</section>' +
      '<section class="pub-sec join-sec" id="join-cats"><div class="pub-sec-head"><h2>Membership categories</h2></div>' +
        '<div class="join-cats">' + tiers().map(catCard).join('') + '</div>' +
        '<p class="pub-fine join-dues-note">Annual dues are shown as listed in the club’s system and are a guide only. The club office confirms your dues when it reviews your application. Time payment options are available to spread your yearly dues from your sign-up date until August.</p>' +
      '</section>' +
      '<section class="pub-sec join-sec"><div class="pub-sec-head"><h2>How to join</h2></div>' +
        '<ol class="join-steps">' +
          '<li><span class="join-step-n serif">1</span><span><strong>Choose a category and apply online.</strong> It takes a few minutes. If a category is full, you can join its waiting list.</span></li>' +
          '<li><span class="join-step-n serif">2</span><span><strong>The club office reviews your application</strong> and contacts you by email or phone.</span></li>' +
          '<li><span class="join-step-n serif">3</span><span><strong>Nothing is paid online.</strong> The office arranges your dues with you, including time payment until August.</span></li>' +
        '</ol>' +
        '<p class="join-call">Questions about membership? Call the club office at ' + officeLink() + '.</p>' +
      '</section>';
    ui.on(view, 'click', '[data-act=jump]', function (e) {
      e.preventDefault();
      const to = ui.$('#join-cats', view); if (to) to.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- Application form ---------------- */
  function catOptions(sel) {
    return tiers().map(function (t) {
      const full = isFull(t), age = ageLabel(t);
      return '<label class="join-opt' + (full ? ' is-full' : '') + '"><input type="radio" name="tierId" value="' + esc(t.id) + '"' + (t.id === sel ? ' checked' : '') + '>' +
        '<span class="join-opt-name">' + esc(t.name) + '</span>' +
        '<span class="join-opt-s">' + (full ? 'Full, waiting list' : priced(t) ? esc(fmt.money(t.annualDues, false)) + ' a year' : 'Price to be set by the club') + '</span>' +
        (age ? '<span class="join-opt-age">' + esc(age) + '</span>' : '') + '</label>';
    }).join('');
  }
  function formHTML(p, sel) {
    p = p || {};
    return '<form class="panel join-form" novalidate><div class="panel-body">' +
      '<div class="field join-cat-field"><span class="join-legend" id="jn-cat-l">Membership category *</span>' +
        '<div class="join-opts" role="radiogroup" aria-labelledby="jn-cat-l">' + catOptions(sel) + '</div>' +
        '<div class="join-cat-note" aria-live="polite"></div></div>' +
      '<h3 class="join-h">Your details</h3>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="jn-first">First name *</label><input class="input" id="jn-first" name="firstName" autocomplete="given-name" maxlength="40" value="' + esc(p.firstName || '') + '"></div>' +
        '<div class="field"><label for="jn-last">Last name *</label><input class="input" id="jn-last" name="lastName" autocomplete="family-name" maxlength="40" value="' + esc(p.lastName || '') + '"></div>' +
        '<div class="field"><label for="jn-email">Email *</label><input class="input" id="jn-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" value="' + esc(p.email || '') + '"></div>' +
        '<div class="field"><label for="jn-phone">Phone *</label><input class="input" id="jn-phone" name="phone" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="(204) 555-0123" maxlength="20" value="' + esc(p.phone || '') + '"></div>' +
        '<div class="field span-2 join-dob"><label for="jn-dob-d" id="jn-dob-l">Date of birth *</label>' +
          '<div class="join-dob-row" role="group" aria-labelledby="jn-dob-l">' +
            '<input class="input" id="jn-dob-d" name="dobDay" inputmode="numeric" autocomplete="bday-day" maxlength="2" placeholder="Day" aria-label="Day of birth">' +
            '<select class="select" name="dobMonth" aria-label="Month of birth"><option value="">Month</option>' + MONTHS.map(function (m, i) { return '<option value="' + pad(i + 1) + '">' + m + '</option>'; }).join('') + '</select>' +
            '<input class="input" name="dobYear" inputmode="numeric" autocomplete="bday-year" maxlength="4" placeholder="Year" aria-label="Year of birth">' +
          '</div><span class="field-hint">Junior is for golfers under 18 and Young Adult for ages 19 to 23, so we ask for your date of birth.</span></div>' +
        '<div class="field span-2 join-hand-field"><span class="join-legend" id="jn-hand-l">Which hand do you play? *</span>' +
          '<div class="join-opts join-hands" role="radiogroup" aria-labelledby="jn-hand-l">' + Club.members.HANDS.map(function (h) {
            return '<label class="join-opt join-hand' + (p.hand === h.value ? ' selected' : '') + '"><input type="radio" name="hand" value="' + h.value + '"' + (p.hand === h.value ? ' checked' : '') + '><span class="join-opt-name">' + esc(h.label) + '</span></label>';
          }).join('') + '</div><span class="field-hint">Your friends at the club and the golf shop can see this.</span></div>' +
      '</div>' +
      '<h3 class="join-h">About your golf <span class="join-opt-tag">Optional</span></h3>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="jn-hcp">Handicap index</label><input class="input" id="jn-hcp" name="handicap" inputmode="decimal" maxlength="5" placeholder="For example 14.2"><span class="field-hint">Leave blank if you do not have one. Write a plus handicap as +1.4.</span></div>' +
        '<div class="field"><label for="jn-heard">How did you hear about us?</label><select class="select" id="jn-heard" name="heardFrom"><option value="">Choose one</option>' + ui.options(heardList(), '') + '</select></div>' +
        '<div class="field span-2"><label for="jn-spons">Members who know you</label><input class="input" id="jn-spons" name="sponsorNames" maxlength="160" placeholder="For example Jane Smith, Raj Patel"><span class="field-hint">If members could propose or second your application, add their names.</span></div>' +
        '<div class="field span-2"><label for="jn-notes">Anything else the office should know?</label><textarea class="textarea" id="jn-notes" name="notes" maxlength="1000" placeholder="For example, when you would like to start or any questions"></textarea></div>' +
      '</div>' +
      '<div class="field join-consent-field"><label class="check join-consent"><input type="checkbox" name="consent"><span>I confirm these details are correct. The club may contact me about my application and keep these details for membership purposes. *</span></label></div>' +
      '<div class="join-submit"><button type="submit" class="btn btn-primary join-send">' + Club.icon('send') + '<span>Send my application</span></button>' +
        '<p class="pub-fine">No payment is taken online. The club office arranges dues with you.</p></div>' +
    '</div></form>';
  }
  function sideHTML() {
    return '<aside class="join-side">' +
      '<section class="panel join-side-card"><div class="panel-body">' +
        '<div class="eyebrow">New-member offer</div><h3>First year</h3>' +
        '<ul class="join-inc">' +
          '<li>' + Club.icon('check') + '<span>$100 share waived</span></li>' +
          '<li>' + Club.icon('check') + '<span>$250 initiation fee plus GST waived</span></li>' +
          '<li>' + Club.icon('check') + '<span>50% of annual dues as club account credit</span></li>' +
        '</ul><p class="pub-fine">For first-time members. <a href="#/join">See how the credit works</a>.</p>' +
      '</div></section>' +
      '<section class="panel join-side-card"><div class="panel-body">' +
        '<div class="eyebrow">Questions</div><h3>Call the club office</h3>' +
        '<p class="join-side-phone">' + Club.icon('phone') + officeLink() + '</p>' +
      '</div></section>' +
    '</aside>';
  }

  function apply(view, wanted, p) {
    const pick = tiers().find(function (t) { return slug(t) === wanted || t.id === wanted; }) || null;
    view.innerHTML = '<a class="join-back" href="#/join">' + Club.icon('chevronLeft') + 'Membership</a>' +
      '<section class="pub-page-head" data-reveal><div class="eyebrow">Become a member</div><h1>Apply for membership</h1>' +
        '<p class="serif">Tell us a little about yourself. The club office reviews every application and will be in touch.</p></section>' +
      '<div class="join-apply">' + formHTML(p, pick ? pick.id : '') + sideHTML() + '</div>';
    const form = ui.$('form', view);

    function current() { const r = ui.$('input[name=tierId]:checked', form); return r ? S.find('membershipTiers', r.value) : null; }
    /* The note under the categories and the button follow the chosen category and whether it is full. */
    function sync() {
      const t = current(), note = ui.$('.join-cat-note', form), btn = ui.$('.join-send span', form);
      ui.$$('.join-opt', form).forEach(function (l) { l.classList.toggle('selected', !!ui.$('input:checked', l)); });
      if (!t) { note.innerHTML = ''; btn.textContent = 'Send my application'; return; }
      const full = isFull(t), age = ageLabel(t);
      note.innerHTML = full
        ? '<p class="join-note is-full">' + Club.icon('clock') + '<span><strong>' + esc(t.name) + ' is full.</strong> Your application joins the waiting list and the club office will contact you when a place opens.' + (age ? ' ' + esc(age) + '.' : '') + '</span></p>'
        : '<p class="join-note">' + Club.icon('info') + '<span><strong>' + esc(t.name) + '</strong>, ' + (priced(t) ? esc(fmt.money(t.annualDues, false)) + ' a year as listed.' : 'price to be set by the club.') + (age ? ' ' + esc(age) + '.' : '') + ' The club office confirms your dues.</span></p>';
      btn.textContent = full ? 'Join the waiting list' : 'Send my application';
      if (history.replaceState) history.replaceState(null, '', '#/join/apply/' + slug(t));
    }
    /* Staff marked a category full or open (another tab): redraw the choices, keep everything typed. */
    function refreshCats() {
      const t = current();
      ui.$('.join-opts', form).innerHTML = catOptions(t ? t.id : '');
      sync();
    }
    sync();

    ui.on(form, 'change', 'input[name=tierId]', function () {
      const g = ui.$('.join-cat-field', form); g.classList.remove('invalid'); const er = ui.$('.field-error', g); if (er) er.remove();
      sync();
    });
    /* A field's error goes as soon as it is changed (the date of birth clears as one) */
    function clearField(f) {
      const fld = f.closest('.field'); if (!fld || !ui.$('.field-error', fld)) return;
      ui.$$('.invalid', fld).forEach(function (x) { x.classList.remove('invalid'); x.removeAttribute('aria-invalid'); });
      ui.$$('.field-error', fld).forEach(function (x) { x.remove(); });
    }
    form.addEventListener('input', function (e) { if (e.target.name !== 'tierId' && e.target.name !== 'hand') clearField(e.target); });
    ui.on(form, 'change', 'input[name=hand]', function () {
      const g = ui.$('.join-hand-field', form); g.classList.remove('invalid'); const er = ui.$('.field-error', g); if (er) er.remove();
      ui.$$('.join-hand', form).forEach(function (l) { l.classList.toggle('selected', !!ui.$('input:checked', l)); });
    });
    form.addEventListener('change', function (e) { if (e.target.name === 'dobMonth' || e.target.name === 'consent') clearField(e.target); });
    form.addEventListener('blur', function (e) {
      const t = e.target;
      if (t.name === 'phone' && t.value) t.value = Pub.normPhone(t.value);
      if (t.name === 'dobDay' && /^\d$/.test(t.value)) t.value = '0' + t.value;
    }, true);
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(form, current()); });

    return S.subscribe('membershipTiers', refreshCats);
  }

  /** Validates the form. Returns the application fields, or null after marking the problems. */
  function read(form, t) {
    Pub.clearErrs(form);
    const g = ui.$('.join-cat-field', form); g.classList.remove('invalid');
    const v = ui.formData(form);
    let ok = true;
    if (!t) { g.classList.add('invalid'); g.insertAdjacentHTML('beforeend', '<span class="field-error">Choose a membership category.</span>'); ok = false; }
    if (!nameOk(v.firstName)) { Pub.setErr(form, 'firstName', v.firstName ? 'Use letters only, please.' : 'Enter your first name.'); ok = false; }
    if (!nameOk(v.lastName)) { Pub.setErr(form, 'lastName', v.lastName ? 'Use letters only, please.' : 'Enter your last name.'); ok = false; }
    if (!Pub.EMAIL_RE.test(v.email || '')) { Pub.setErr(form, 'email', v.email ? 'That email address does not look right.' : 'Enter your email address.'); ok = false; }
    else {
      const e = v.email.toLowerCase();
      const dup = S.all('applications').some(function (a) { return String(a.email || '').toLowerCase() === e && a.stage !== 'Approved' && a.stage !== 'Declined'; });
      if (dup) { Pub.setErr(form, 'email', 'The club already has an application from this email address. To change it, please call the office at ' + Club.info.phone + '.'); ok = false; }
    }
    if (v.hand !== 'right' && v.hand !== 'left') { const hg = ui.$('.join-hand-field', form); hg.classList.add('invalid'); hg.insertAdjacentHTML('beforeend', '<span class="field-error">Choose right-handed or left-handed.</span>'); ok = false; }
    if (!phoneOk(v.phone)) { Pub.setErr(form, 'phone', v.phone ? 'Enter a 10-digit phone number, for example (204) 555-0123.' : 'Enter a phone number so the office can reach you.'); ok = false; }

    /* Date of birth: a real date, in the past, and inside the category's age range */
    let dob = null;
    const dd = String(v.dobDay || ''), yy = String(v.dobYear || ''), mm = v.dobMonth || '';
    const dobErr = function (part, msg) { ['dobDay', 'dobMonth', 'dobYear'].forEach(function (n) { if (n === part || !part) { const f = form.querySelector('[name=' + n + ']'); f.classList.add('invalid'); f.setAttribute('aria-invalid', 'true'); } }); ui.$('.join-dob', form).insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>'); ok = false; };
    if (!dd && !mm && !yy) dobErr('', 'Enter your date of birth.');
    else if (!/^\d{1,2}$/.test(dd) || +dd < 1 || +dd > 31) dobErr('dobDay', 'Enter the day, from 1 to 31.');
    else if (!mm) dobErr('dobMonth', 'Choose the month.');
    else if (!/^\d{4}$/.test(yy)) dobErr('dobYear', 'Enter the year with four digits, for example 1990.');
    else {
      const d = new Date(+yy, +mm - 1, +dd);
      if (d.getMonth() !== +mm - 1) dobErr('dobDay', MONTHS[+mm - 1] + ' does not have ' + +dd + ' days.');
      else {
        dob = yy + '-' + mm + '-' + pad(dd);
        const age = M().ageOn(dob);
        if (dob >= Pub.today()) { dobErr('', 'Your date of birth must be in the past.'); dob = null; }
        else if (age > 110) { dobErr('dobYear', 'Please check the year.'); dob = null; }
        else if (t && M().ageProblem(t.id, age)) {
          const r = M().AGE_RULES[t.id];
          dobErr('', t.name + ' membership is for ' + (r.min != null && r.max != null ? 'ages ' + r.min + ' to ' + r.max : r.min != null ? 'ages ' + r.min + ' and over' : 'golfers under ' + (r.max + 1)) + '. You are ' + age + ', so please choose another category.');
          dob = null;
        }
      }
    }

    let hcp = null;
    const hs = String(v.handicap || '').replace(/\s+/g, '');
    if (hs) {
      if (!/^\+?\d{1,2}(\.\d)?$/.test(hs)) { Pub.setErr(form, 'handicap', 'Use a number such as 14.2, or +1.4 for a plus handicap.'); ok = false; }
      else {
        hcp = (hs[0] === '+' ? -1 : 1) * parseFloat(hs.replace('+', ''));
        if (hcp < -10 || hcp > 54) { Pub.setErr(form, 'handicap', 'A handicap index is between +10.0 and 54.0.'); ok = false; }
      }
    }
    if (!v.consent) { Pub.setErr(form, 'consent', 'Please tick to confirm so the club can process your application.'); ok = false; }
    if (!ok) return null;
    const first = v.firstName.trim().replace(/\s+/g, ' '), last = v.lastName.trim().replace(/\s+/g, ' ');
    return { firstName: first, lastName: last, name: first + ' ' + last, email: v.email.trim().toLowerCase(), phone: Pub.normPhone(v.phone), dob: dob, hand: v.hand,
      handicap: hcp == null ? null : Math.round(hcp * 10) / 10, heardFrom: M().cleanHeard(v.heardFrom), sponsorNames: String(v.sponsorNames || '').trim(), notes: String(v.notes || '').trim() };
  }

  function submit(form, t) {
    const btn = ui.$('.join-send', form);
    if (btn.disabled) return;
    const d = read(form, t);
    if (!d) {
      const first = ui.$('.invalid', form);
      if (first && (first.classList.contains('join-cat-field') || first.classList.contains('join-hand-field'))) { ui.$('input[type=radio]', first).focus(); first.scrollIntoView({ block: 'center' }); }
      else if (first) first.focus();
      ui.toast('Please check the highlighted fields', 'bad');
      return;
    }
    btn.disabled = true;
    /* Full or open is read again now, in case the office changed it while the form was open. */
    const stage = isFull(t) ? M().WAIT_STAGE : 'Received';
    const on = Pub.today(), p = Pub.me();
    const app = S.insert('applications', Object.assign(d, {
      id: S.uid('app'), proposedTierId: t.id, sponsorIds: [], stage: stage, submittedOn: on, memberId: null,
      history: [{ stage: stage, on: on }], source: 'Online', consentAt: new Date().toISOString(), publicPlayerId: p ? p.id : null
    }));
    sentId = app.id;
    Pub.go('join/sent');
  }

  /* ---------------- Confirmation ---------------- */
  function sent(view) {
    const a = sentId ? S.find('applications', sentId) : null;
    if (!a) { location.replace('#/join'); return; }
    const t = S.find('membershipTiers', a.proposedTierId) || { name: 'Membership' };
    const wait = a.stage === M().WAIT_STAGE, pos = M().waitPosition(a);
    view.innerHTML = '<section class="panel join-done" data-reveal><div class="panel-body">' +
      Club.logo('pub-crest lg join-done-crest') +
      '<div class="eyebrow">' + (wait ? 'You are on the waiting list' : 'Application received') + '</div>' +
      '<h1>Thank you, ' + esc(a.firstName || a.name) + '</h1>' +
      '<p class="serif join-done-lead">' + (wait ? 'Your application for ' + esc(t.name) + ' membership is on the waiting list.' : 'Your application for ' + esc(t.name) + ' membership has reached the club office.') + '</p>' +
      (wait && pos ? '<div class="join-pos"><span class="label-caps">Your place on the ' + esc(t.name) + ' waiting list</span><span class="join-pos-n serif">' + pos + '</span></div>' : '') +
      '<h2 class="join-h">What happens next</h2>' +
      '<ol class="join-steps">' +
        '<li><span class="join-step-n serif">1</span><span>' + (wait ? 'The club office contacts people on the waiting list when a place opens in ' + esc(t.name) + '.' : 'The club office reviews applications and will contact you.') + ' We will use ' + esc(a.email) + ' or ' + esc(a.phone) + '.</span></li>' +
        '<li><span class="join-step-n serif">2</span><span>No payment has been taken. The office arranges your dues with you, and time payment options can spread your yearly dues from your sign-up date until August.</span></li>' +
        '<li><span class="join-step-n serif">3</span><span>If this is your first time as a member, your share and initiation fee are waived in your first year and you receive the 50% joining bonus as club account credit.</span></li>' +
      '</ol>' +
      '<p class="join-call">Questions? Call the club office at ' + officeLink() + '.</p>' +
      '<div class="join-done-acts"><a class="btn" href="#/join">' + Club.icon('chevronLeft') + '<span>Back to membership</span></a><a class="btn btn-primary" href="#/">' + Club.icon('flag') + '<span>Book a tee time</span></a></div>' +
    '</div></section>';
  }

  Pub.register({
    id: 'join', label: 'Become a member', title: 'Become a member', nav: { label: 'Become a member', order: 10 },
    render: function (view, params, p) {
      view.classList.add('join-page');
      if (params[0] === 'apply') { window.scrollTo({ top: 0 }); return apply(view, params[1] || '', p); }
      if (params[0] === 'sent') { window.scrollTo({ top: 0 }); return sent(view); }
      overview(view);
      /* Staff marked a category full or open: redraw while nobody is in a dialog. */
      return S.subscribe('membershipTiers', function () { if (!document.querySelector('.overlay')) Pub.render(); });
    }
  });
})();
