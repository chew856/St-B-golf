/* Public booking site: sign up, sign in, My bookings and My account. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;

  /* ---------------- Auth forms (pages and the inline gate in the booking flow) ---------------- */
  function detailFields(p) {
    p = p || {};
    return '<div class="form-grid">' +
      '<div class="field"><label for="pf-first">First name *</label><input class="input" id="pf-first" name="firstName" autocomplete="given-name" maxlength="40" value="' + esc(p.firstName || '') + '"></div>' +
      '<div class="field"><label for="pf-last">Last name *</label><input class="input" id="pf-last" name="lastName" autocomplete="family-name" maxlength="40" value="' + esc(p.lastName || '') + '"></div>' +
      '<div class="field span-2"><label for="pf-email">Email *</label><input class="input" id="pf-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" value="' + esc(p.email || '') + '"></div>' +
      '<div class="field"><label for="pf-phone">Phone *</label><input class="input" id="pf-phone" name="phone" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="204-555-0123" maxlength="20" value="' + esc(p.phone || '') + '"></div>' +
      '<div class="field"><label for="pf-postal">Postal code *</label><input class="input pub-postal" id="pf-postal" name="postalCode" autocomplete="postal-code" placeholder="R2H 0A1" maxlength="7" value="' + esc(p.postalCode || '') + '"></div>' +
    '</div>';
  }
  function pwField(name, label, ac, hint) {
    return '<div class="field"><label for="pf-' + name + '">' + esc(label) + ' *</label><div class="pub-pw"><input class="input" id="pf-' + name + '" name="' + name + '" type="password" autocomplete="' + ac + '" maxlength="72"><button type="button" class="pub-pw-eye" data-act="peek" aria-label="Show password" title="Show password">' + Club.icon('eye') + '</button></div>' + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</div>';
  }
  /* Growth analytics fields (Reports, Growth): the marketing email opt-in and "How did you hear about us?". */
  const OPTIN_TEXT = 'Email me club news and offers. You can stop anytime.';
  function heardField() {
    const list = Club.membership ? Club.membership.HEARD_FROM : [];
    if (!list.length) return '';
    return '<div class="form-grid"><div class="field span-2"><label for="pf-heard">How did you hear about us?</label><select class="select" id="pf-heard" name="heardFrom"><option value="">Choose one</option>' + ui.options(list, '') + '</select></div></div>';
  }
  function wireCommon(form) {
    ui.on(form, 'click', '[data-act=peek]', function (e, b) { const i = b.parentNode.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.classList.toggle('on', show); });
    form.addEventListener('input', function (e) { const t = e.target; if (t.classList.contains('invalid')) { t.classList.remove('invalid'); const er = (t.closest('.field') || t.parentNode).querySelector('.field-error'); if (er) er.remove(); } });
    form.addEventListener('blur', function (e) { const t = e.target; if (t.name === 'postalCode' && t.value) t.value = Pub.normPostal(t.value); if (t.name === 'phone' && t.value) t.value = Pub.normPhone(t.value); }, true);
  }

  /** Renders sign up / sign in into el. onDone(player) after success. compact: inline gate inside booking. */
  Pub.authForm = function (el, mode, onDone, compact) {
    function draw() {
      el.innerHTML =
        '<div class="pub-auth' + (compact ? ' compact' : '') + '">' +
          '<div class="segmented pub-auth-switch" role="tablist" aria-label="Account">' +
            '<button type="button" role="tab" data-mode="signup" class="' + (mode === 'signup' ? 'active' : '') + '" aria-selected="' + (mode === 'signup') + '">Create account</button>' +
            '<button type="button" role="tab" data-mode="signin" class="' + (mode === 'signin' ? 'active' : '') + '" aria-selected="' + (mode === 'signin') + '">Sign in</button></div>' +
          (mode === 'signup'
            ? '<form class="pub-auth-form" novalidate data-mode="signup">' + detailFields() +
                '<div class="form-grid">' + pwField('password', 'Password', 'new-password', 'At least 8 characters, with a letter and a number.') + pwField('confirm', 'Confirm password', 'new-password') + '</div>' +
                heardField() +
                '<label class="check pub-optin"><input type="checkbox" name="marketingOptIn"> ' + OPTIN_TEXT + '</label>' +
                '<button type="submit" class="btn btn-primary pub-auth-btn">' + Club.icon('check') + '<span>Create my account</span></button>' +
                '<p class="pub-fine">Already have an account? <button type="button" class="pub-link" data-mode="signin">Sign in</button></p>' +
              '</form>'
            : '<form class="pub-auth-form" novalidate data-mode="signin">' +
                '<div class="field"><label for="pf-semail">Email *</label><input class="input" id="pf-semail" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120"></div>' +
                pwField('password', 'Password', 'current-password') +
                '<div class="pub-alert" role="alert" hidden></div>' +
                '<button type="submit" class="btn btn-primary pub-auth-btn">' + Club.icon('key') + '<span>Sign in</span></button>' +
                '<p class="pub-fine">Forgotten your password? Please call the golf shop at <a href="' + Pub.phoneHref() + '">' + esc(Club.info.phone) + '</a> and we will help you back in. New here? <button type="button" class="pub-link" data-mode="signup">Create an account</button></p>' +
              '</form>') +
        '</div>';
      const form = ui.$('form', el);
      wireCommon(form);
      form.addEventListener('submit', function (e) { e.preventDefault(); if (mode === 'signup') signup(form); else signin(form); });
      if (!compact) { const f = ui.$('input', form); if (f) setTimeout(function () { f.focus(); }, 80); }
    }
    ui.on(el, 'click', '[data-mode]', function (e, b) { if (b.dataset.mode === mode) return; mode = b.dataset.mode; draw(); const f = ui.$('form input', el); if (f) f.focus(); });

    function signup(form) {
      Pub.clearErrs(form);
      const d = Pub.readDetails(form, null);
      const pw = ui.$('[name=password]', form).value, cf = ui.$('[name=confirm]', form).value;
      let ok = !!d;
      const prob = Pub.passwordProblem(pw);
      if (prob) { Pub.setErr(form, 'password', prob); ok = false; }
      if (!cf) { Pub.setErr(form, 'confirm', 'Please type your password again.'); ok = false; }
      else if (cf !== pw) { Pub.setErr(form, 'confirm', 'The passwords do not match.'); ok = false; }
      if (!ok) { Pub.focusFirstErr(form); ui.toast('Please check the highlighted fields', 'bad'); return; }
      /* Optional, both: the email opt-in (unticked by default) and how they heard about the club, stored in English. */
      const optIn = !!ui.$('[name=marketingOptIn]', form).checked, heard = ui.$('[name=heardFrom]', form);
      const now = new Date().toISOString();
      const p = S.insert('publicPlayers', Object.assign({ id: S.uid('pp'), createdAt: now, password: Pub.hashPassword(pw) }, d,
        { marketingOptIn: optIn, marketingOptInAt: optIn ? now : null, heardFrom: Club.membership ? Club.membership.cleanHeard(heard ? heard.value : '') : '' }));
      ui.$('[name=password]', form).value = ''; ui.$('[name=confirm]', form).value = '';
      Pub.signIn(p.id, true);
      ui.toast('Welcome to St. Boniface, ' + p.firstName + '. Your account is ready');
      onDone(p);
    }
    function signin(form) {
      Pub.clearErrs(form);
      const al = ui.$('.pub-alert', form); al.hidden = true;
      const email = ui.$('[name=email]', form).value.trim(), pw = ui.$('[name=password]', form).value;
      let ok = true;
      if (!Pub.EMAIL_RE.test(email)) { Pub.setErr(form, 'email', email ? 'That email address does not look right.' : 'Enter your email address.'); ok = false; }
      if (!pw) { Pub.setErr(form, 'password', 'Enter your password.'); ok = false; }
      if (!ok) { Pub.focusFirstErr(form); return; }
      const p = Pub.byEmail(email);
      if (!p || !Pub.checkPassword(pw, p.password)) {
        al.innerHTML = Club.icon('alert') + '<div><p>That email and password do not match an account. Please try again, or create an account if you are new.</p></div>';
        al.hidden = false; al.classList.remove('shake'); void al.offsetWidth; al.classList.add('shake');
        ui.$('[name=password]', form).value = ''; ui.$('[name=password]', form).focus();
        return;
      }
      ui.$('[name=password]', form).value = '';
      Pub.signIn(p.id);
      onDone(p);
    }
    draw();
  };

  function authPage(mode) {
    return function (view) {
      if (Pub.me()) { location.replace('#/' + (Pub.afterAuth ? Pub.afterAuth.replace(/^#\//, '') : 'bookings')); return; }
      view.innerHTML = '<div class="pub-auth-page">' +
        '<section class="pub-auth-intro" data-reveal>' + Club.logo('pub-crest lg') +
          '<div class="eyebrow">Public golf at ' + esc(Club.info.short) + '</div>' +
          '<h1>' + (mode === 'signup' ? 'Create your account' : 'Welcome back') + '</h1>' +
          '<p class="serif">' + (mode === 'signup' ? 'An account lets you book and pay for tee times online, keep your receipts and cancel when plans change.' : 'Sign in to book a tee time, see your bookings and manage your account.') + '</p>' +
          '<p class="pub-auth-members">Are you a member? <a href="member.html">Members sign in here</a>.</p>' +
        '</section>' +
        '<section class="panel pub-auth-panel" data-reveal><div class="panel-body"></div></section></div>';
      Pub.authForm(ui.$('.pub-auth-panel .panel-body', view), mode, function () {
        const to = Pub.afterAuth; Pub.afterAuth = null;
        location.hash = to || '#/';
      });
    };
  }
  Pub.register({ id: 'signin', label: 'Sign in', render: authPage('signin') });
  Pub.register({ id: 'signup', label: 'Create an account', render: authPage('signup') });

  /* ---------------- My bookings ---------------- */
  function bookingInfo(tt, p) {
    const mine = (tt.players || []).filter(function (x) { return x.publicPlayerId === p.id; });
    const pay = Pub.paymentFor(tt.id, p.id);
    const mins = Pub.minutesUntil(tt.date, tt.time);
    const active = tt.status !== 'cancelled' && mine.length > 0;
    const upcoming = active && (tt.status === 'booked' || tt.status === 'checked-in' || tt.status === 'on-course') && mins > -30 && tt.date >= Pub.today();
    return { tt: tt, mine: mine, pay: pay, mins: mins, upcoming: upcoming, refundable: upcoming && tt.status === 'booked' && mins >= Pub.REFUND_HOURS * 60 };
  }
  function myBookings(p) {
    const ids = {};
    const live = Pub.myTeeTimes(p.id).map(function (tt) { ids[tt.id] = 1; return bookingInfo(tt, p); });
    /* Cancelled or refunded bookings where our players were removed from a shared group */
    const gone = S.where('publicPayments', function (x) { return x.publicPlayerId === p.id && !ids[x.teeTimeId]; }).map(function (pay) {
      const tt = S.find('teeTimes', pay.teeTimeId) || { id: pay.teeTimeId, date: pay.teeDate || pay.date, time: pay.teeTime || '00:00', holes: pay.holes || 18, players: [], status: 'cancelled' };
      return { tt: tt, mine: [], pay: pay, mins: 0, upcoming: false, refundable: false, removed: true };
    });
    return live.concat(gone);
  }
  function statusBadge(b) {
    const s = b.tt.status;
    if (b.removed || s === 'cancelled') return ui.badge(b.pay && b.pay.status === 'refunded' ? 'Cancelled, refunded' : 'Cancelled', 'outline');
    if (s === 'completed') return ui.badge('Played', 'good');
    if (s === 'no-show') return ui.badge('Missed', 'bad');
    if (s === 'on-course') return ui.badge('On course', 'good');
    if (s === 'checked-in') return ui.badge('Checked in', 'good');
    return ui.badge('Confirmed', 'brass');
  }
  function cardHTML(b) {
    const tt = b.tt; const dt = fmt.toDate(tt.date); const tp = Pub.timeParts(tt.time);
    const others = (tt.players || []).length - b.mine.length;
    const names = b.mine.map(function (x) { return x.name; });
    const adds = Club.addons ? Club.addons.summary([].concat.apply([], b.mine.map(function (x) { return x.addons || []; }))) : '';
    return '<article class="panel pub-bk" data-id="' + esc(tt.id) + '" data-reveal>' +
      '<div class="pub-bk-date"><span class="pub-bk-wk">' + esc(fmt.weekday(tt.date)) + '</span><span class="pub-bk-n serif">' + dt.getDate() + '</span><span class="pub-bk-mo">' + esc(dt.toLocaleDateString('en-CA', { month: 'short' }).replace('.', '')) + '</span></div>' +
      '<div class="pub-bk-main">' +
        '<div class="pub-bk-top"><span class="pub-bk-time serif">' + tp.t + '<small>' + tp.ap + '</small></span>' + statusBadge(b) + '</div>' +
        '<div class="pub-bk-meta">' + esc(Pub.dayName(tt.date)) + ' · ' + tt.holes + ' holes · ' + esc(Pub.plural(b.mine.length || (b.pay && b.pay.players) || 1, 'golfer')) + (others > 0 && b.upcoming ? ' · with ' + Pub.plural(others, 'other golfer') : '') + '</div>' +
        (names.length ? '<div class="pub-bk-names">' + esc(names.join(', ')) + '</div>' : '') +
        (adds ? '<div class="pub-bk-adds">' + Club.icon('box') + '<span>' + esc(adds) + '</span></div>' : '') +
        (b.pay ? '<div class="pub-bk-pay">' + Pub.markChip(b.pay.brand, 14) + /* Separate text nodes, so the page translator reads "Gift card ending 7KQ2 and Visa ending 4242" on its own. */
          '<span>' + esc(fmt.money(b.pay.amount)) + ' · <span>' + esc(Pub.paidWith(b.pay)) + '</span>' + (b.pay.status === 'refunded' ? '<span> · refunded ' + esc(fmt.dateShort(b.pay.refundedOn || b.pay.date)) + '</span>' : '') + '</span></div>' : '') +
        (b.pay && b.pay.promo ? '<div class="pub-bk-adds pub-bk-promo">' + Club.icon('tag') + '<span>' + esc('Promo code ' + b.pay.promo.code + ', ' + fmt.money(b.pay.promo.discount) + ' off') + '</span></div>' : '') +
        (b.upcoming && !b.refundable && tt.status === 'booked' ? '<p class="pub-bk-lock">' + Club.icon('clock') + '<span>Within ' + Pub.REFUND_HOURS + ' hours of your tee time. To make changes, please call the golf shop at <a href="' + Pub.phoneHref() + '">' + esc(Club.info.phone) + '</a>.</span></p>' : '') +
      '</div>' +
      '<div class="pub-bk-acts">' +
        (b.refundable ? '<button type="button" class="btn btn-sm btn-danger" data-act="cancel" data-id="' + esc(tt.id) + '">' + Club.icon('close') + '<span>Cancel and refund</span></button>' : '') +
        (b.upcoming ? '<button type="button" class="btn btn-sm" data-act="ics" data-id="' + esc(tt.id) + '">' + Club.icon('calendar') + '<span>Calendar</span></button>' : '') +
        (b.pay ? '<button type="button" class="btn btn-sm btn-ghost" data-act="receipt" data-id="' + esc(b.pay.id) + '">' + Club.icon('billing') + '<span>Receipt</span></button>' : '') +
        (b.pay && b.pay.status === 'refunded' && Club.receipts ? '<button type="button" class="btn btn-sm btn-ghost" data-act="refund-receipt" data-id="' + esc(b.pay.id) + '">' + Club.icon('billing') + '<span>Refund receipt</span></button>' : '') +
      '</div>' +
    '</article>';
  }

  Pub.register({
    id: 'bookings', label: 'My bookings', auth: true,
    render: function (view, params, p) {
      function draw() {
        p = Pub.me(); if (!p) return;
        const all = myBookings(p);
        const up = all.filter(function (b) { return b.upcoming; }).sort(function (a, b) { return (a.tt.date + a.tt.time).localeCompare(b.tt.date + b.tt.time); });
        const past = all.filter(function (b) { return !b.upcoming; }).sort(function (a, b) { return (b.tt.date + b.tt.time).localeCompare(a.tt.date + a.tt.time); });
        view.innerHTML =
          '<section class="pub-page-head" data-reveal><div class="eyebrow">Hello, ' + esc(p.firstName) + '</div><h1>My bookings</h1><p class="serif">Your tee times at ' + esc(Club.info.short) + '. Cancel online up to ' + Pub.REFUND_HOURS + ' hours before you play for a full refund to your card.</p></section>' +
          (Pub.waitlist ? Pub.waitlist.noticesHTML(p) : '') +
          '<section class="pub-sec"><div class="pub-sec-head"><h2>Upcoming</h2><a class="btn btn-primary btn-sm" href="#/">' + Club.icon('plus') + '<span>Book a tee time</span></a></div>' +
            (up.length ? '<div class="pub-bk-list">' + up.map(cardHTML).join('') + '</div>' : '<div class="panel" data-reveal>' + ui.empty({ icon: 'flag', title: 'No upcoming tee times', text: 'The first tee is waiting. Public tee times open ' + Club.teeRules.PUBLIC_ADVANCE_DAYS + ' days in advance.', action: '<a class="btn btn-primary" href="#/">Find a tee time</a>' }) + '</div>') +
          '</section>' +
          (Pub.waitlist ? Pub.waitlist.listHTML(p) : '') +
          '<section class="pub-sec"><div class="pub-sec-head"><h2>Past and cancelled</h2></div>' +
            (past.length ? '<div class="pub-bk-list">' + past.map(cardHTML).join('') + '</div>' : '<div class="panel" data-reveal>' + ui.empty({ icon: 'trophy', title: 'Nothing here yet', text: 'Rounds you have played and bookings you have cancelled will be kept here with their receipts.' }) + '</div>') +
          '</section>';
        ui.animateIn(view);
      }
      ui.on(view, 'click', '[data-act=receipt]', function (e, b) { Pub.openReceipt(b.dataset.id); });
      ui.on(view, 'click', '[data-act=refund-receipt]', function (e, b) { Pub.openReceipt(b.dataset.id, true); });
      ui.on(view, 'click', '[data-act=ics]', function (e, b) {
        const tt = S.find('teeTimes', b.dataset.id); const me = Pub.me(); if (!tt || !me) return;
        Pub.downloadIcs(tt, { id: me.id, list: (tt.players || []).filter(function (x) { return x.publicPlayerId === me.id; }).map(function (x) { return x.name; }).join(', ') });
      });
      ui.on(view, 'click', '[data-act=cancel]', function (e, btn) {
        const me = Pub.me(); const tt0 = S.find('teeTimes', btn.dataset.id); if (!me || !tt0) return;
        const b = bookingInfo(tt0, me);
        if (!b.refundable) { ui.toast('This booking can no longer be cancelled online. Please call the golf shop', 'bad'); draw(); return; }
        const back = b.pay ? refundText(b.pay) : '';
        ui.confirm({ title: 'Cancel this tee time?', text: 'Your ' + fmt.time(tt0.time) + ' tee time on ' + Pub.longDate(tt0.date) + ' for ' + Pub.plural(b.mine.length, 'golfer') + ' will be released' + (back ? ', and ' + back + '.' : '.'), confirmLabel: back ? 'Cancel and refund' : 'Cancel tee time', danger: true }).then(function (ok) {
          if (!ok) return;
          const fresh = S.find('teeTimes', tt0.id); const again = fresh && bookingInfo(fresh, me);
          if (!again || !again.refundable) { ui.toast('This booking has changed. Please call the golf shop', 'bad'); draw(); return; }
          const rest = (fresh.players || []).filter(function (x) { return x.publicPlayerId !== me.id; });
          if (!rest.length) S.update('teeTimes', fresh.id, { status: 'cancelled', cancelledOn: Pub.today(), cancelledAt: new Date().toISOString(), cancelledBy: me.id });
          else S.update('teeTimes', fresh.id, { players: rest });
          if (Club.waitlist) Club.waitlist.released(fresh.date, fresh.time, 'a public golfer cancelled');   // the freed places go to the waitlist
          /* The refund is what was actually paid (after any promo code); a promo code use is given back (Club.promos.release),
             a gift card part goes back on the gift card (js/core/giftcards.js). */
          let toast = 'Your tee time has been cancelled';
          if (again.pay && again.pay.status === 'paid') {
            const refunded = S.update('publicPayments', again.pay.id, { status: 'refunded', refundedOn: Pub.today(), refundAmount: Pub.r2(again.pay.amount) });
            if (Club.promos) Club.promos.release('public', again.pay.id);
            try { Pub.ensureReceipts(refunded); } catch (err) { console.error('Refund receipt failed for ' + again.pay.id, err); }
            if (+again.pay.amount > 0) toast = again.pay.giftCardId ? 'Cancelled. ' + refundText(again.pay) : 'Cancelled. ' + fmt.money(again.pay.amount) + ' is on its way back to your ' + Pub.cardLine(again.pay.brand, again.pay.last4);
          }
          const card = ui.$('.pub-bk[data-id="' + fresh.id + '"]', view);
          const fin = function () { draw(); ui.toast(toast); };
          if (card) { card.classList.add('leaving'); setTimeout(fin, 300); } else fin();
        });
      });
      draw();
    }
  });

  /** Where a refund goes: '$66.00 will be refunded to your Visa ending 4242', or the gift card and card parts. '' when nothing was paid. */
  function refundText(pay) {
    const amt = Pub.r2(pay.amount);
    if (!(amt > 0)) return '';
    const card = Pub.cardLine(pay.brand, pay.last4);
    if (pay.giftCardId) {
      const g = Pub.r2(pay.giftAmount), c = Pub.r2(pay.cardAmount);
      const gl = fmt.money(g) + ' goes back on your gift card ending in ' + (pay.giftLast4 || '');
      return c > 0 ? gl + ' and ' + fmt.money(c) + ' is refunded to your ' + card : gl;
    }
    return fmt.money(amt) + ' will be refunded to your ' + card;
  }

  /* ---------------- My account ---------------- */
  const RC_SHOW = 8;
  let rcAll = false;
  /** Receipts: everything this golfer paid for or was refunded (Club.receipts.forPublic): tee times, refunds and
      beverage cart purchases, newest first. Each opens the receipt to print or save. */
  function receiptsPanel(p) {
    const list = Club.receipts ? Club.receipts.forPublic(p.id) : [];
    const shown = rcAll ? list : list.slice(0, RC_SHOW);
    return '<section class="panel pub-rc" data-reveal aria-labelledby="pub-rc-h"><div class="panel-head"><div><div class="eyebrow">Keep for your records</div><h3 id="pub-rc-h">Receipts</h3></div>' + Club.icon('billing', 'pub-head-icon') + '</div>' +
      '<div class="panel-body' + (list.length ? ' flush' : '') + '">' +
      (list.length ? '<ul class="pub-rc-list">' + shown.map(function (r) {
        const credit = r.kind === 'credit';
        return '<li><button type="button" class="pub-rc-row" data-act="open-rc" data-id="' + esc(r.id) + '" aria-label="Open ' + (credit ? 'credit ' : 'receipt ') + esc(r.no) + ', ' + esc(r.title) + '">' +
          '<span class="pub-rc-main"><span class="pub-rc-t">' + esc(r.title) + '</span><span class="pub-rc-s">' + esc(fmt.date(r.date)) + ' · ' + esc(r.no) + ' · ' + esc(r.methodLabel) + '</span></span>' +
          '<span class="pub-rc-amt' + (credit ? ' is-credit' : '') + '">' + (credit ? '<small>Refund</small>' : '') + esc(fmt.money(r.total)) + '</span>' + Club.icon('chevronRight', 'pub-rc-go') + '</button></li>';
      }).join('') + '</ul>' +
      (list.length > RC_SHOW ? '<div class="pub-rc-more"><button type="button" class="pub-link" data-act="rc-all">' + (rcAll ? 'Show fewer' : 'Show all ' + list.length + ' receipts') + '</button></div>' : '')
      : ui.empty({ icon: 'billing', title: 'No receipts yet', text: 'Receipts for tee times, refunds and beverage cart purchases are kept here.' })) +
      '</div></section>';
  }
  Pub.register({
    id: 'account', label: 'My account', auth: true,
    render: function (view) {
      function draw() {
        const p = Pub.me(); if (!p) return;
        const pays = S.where('publicPayments', function (x) { return x.publicPlayerId === p.id; });
        const spent = Pub.r2(pays.filter(function (x) { return x.status === 'paid'; }).reduce(function (a, x) { return a + (+x.amount || 0); }, 0));
        view.innerHTML =
          '<section class="pub-page-head" data-reveal><div class="eyebrow">Public golfer since ' + esc(fmt.date(String(p.createdAt || '').slice(0, 10) || Pub.today())) + '</div><h1>My account</h1><p class="serif">Keep your details up to date so the golf shop can reach you about your tee times.</p></section>' +
          '<div class="pub-acc">' +
            '<div class="stack">' +
            '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Your details</div><h3>Contact information</h3></div></div><div class="panel-body">' +
              '<form class="pub-details" novalidate>' + detailFields(p) +
                '<div class="pub-form-acts"><button type="submit" class="btn btn-primary">' + Club.icon('check') + '<span>Save details</span></button></div>' +
              '</form></div></section>' +
            receiptsPanel(p) +
            /* Sections other files add (Pub.addAccountSection in js/public/site.js), in order. */
            Pub.accountSections.slice().sort(function (a, b) { return (a.order || 50) - (b.order || 50); }).map(function (sec) { try { return sec.html(p) || ''; } catch (e) { console.error(e); return ''; } }).join('') +
            '</div>' +
            '<div class="stack">' +
              '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Security</div><h3>Change password</h3></div></div><div class="panel-body">' +
                '<form class="pub-pwform" novalidate>' + pwField('current', 'Current password', 'current-password') + pwField('password', 'New password', 'new-password', 'At least 8 characters, with a letter and a number.') + pwField('confirm', 'Confirm new password', 'new-password') +
                  '<div class="pub-form-acts"><button type="submit" class="btn">' + Club.icon('key') + '<span>Update password</span></button></div></form>' +
              '</div></section>' +
              '<section class="panel pub-acc-sum" data-reveal><div class="panel-body"><div><span class="label-caps">Bookings</span><strong class="serif">' + pays.length + '</strong></div><div><span class="label-caps">Green fees paid</span><strong class="serif">' + esc(fmt.money(spent)) + '</strong></div>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-act="signout">' + Club.icon('logout') + '<span>Sign out</span></button></div></section>' +
            '</div>' +
          '</div>';
        const df = ui.$('.pub-details', view), pf = ui.$('.pub-pwform', view);
        wireCommon(df); wireCommon(pf);
        df.addEventListener('submit', function (e) {
          e.preventDefault(); Pub.clearErrs(df);
          const me = Pub.me(); const d = Pub.readDetails(df, me.id);
          if (!d) { Pub.focusFirstErr(df); ui.toast('Please check the highlighted fields', 'bad'); return; }
          S.update('publicPlayers', me.id, d);
          /* Keep the account holder's name current on upcoming tee times. */
          const full = d.firstName + ' ' + d.lastName;
          Pub.myTeeTimes(me.id).forEach(function (tt) {
            if (tt.status !== 'booked') return;
            let changed = false;
            const pl = (tt.players || []).map(function (x) { if (x.publicPlayerId === me.id && !x.publicGuest && x.name !== full) { changed = true; return Object.assign({}, x, { name: full }); } return x; });
            if (changed) S.update('teeTimes', tt.id, { players: pl });
          });
          Pub.paintHeader();
          ui.toast('Your details have been saved');
          draw();
        });
        pf.addEventListener('submit', function (e) {
          e.preventDefault(); Pub.clearErrs(pf);
          const me = Pub.me(); const v = { cur: ui.$('[name=current]', pf).value, pw: ui.$('[name=password]', pf).value, cf: ui.$('[name=confirm]', pf).value };
          let ok = true;
          if (!v.cur) { Pub.setErr(pf, 'current', 'Enter your current password.'); ok = false; }
          else if (!Pub.checkPassword(v.cur, me.password)) { Pub.setErr(pf, 'current', 'That is not your current password.'); ok = false; }
          const prob = Pub.passwordProblem(v.pw); if (prob) { Pub.setErr(pf, 'password', prob); ok = false; }
          if (!prob && v.pw === v.cur) { Pub.setErr(pf, 'password', 'Choose a password you have not used here before.'); ok = false; }
          if (v.cf !== v.pw) { Pub.setErr(pf, 'confirm', 'The passwords do not match.'); ok = false; }
          if (!ok) { Pub.focusFirstErr(pf); return; }
          S.update('publicPlayers', me.id, { password: Pub.hashPassword(v.pw) });
          ui.$$('input', pf).forEach(function (i) { i.value = ''; });
          ui.toast('Your password has been updated');
        });
        Pub.accountSections.forEach(function (sec) { if (sec.wire) { try { sec.wire(view, p, draw); } catch (e) { console.error(e); } } });
      }
      ui.on(view, 'click', '[data-act=open-rc]', function (e, b) { const me = Pub.me(), r = Club.receipts.get(b.dataset.id); if (me && r && r.publicPlayerId === me.id) Club.receipts.open(r); });
      ui.on(view, 'click', '[data-act=rc-all]', function () { rcAll = !rcAll; draw(); ui.$$('[data-reveal]', view).forEach(function (n) { n.classList.add('revealed'); }); });
      draw();
    }
  });

  /* ---------------- My account: club news by email ----------------
     The opt-in from sign up, changed here at any time. Saved as soon as the box changes: marketingOptIn (bool) and
     marketingOptInAt (ISO when they opted in, null when off). */
  Pub.addAccountSection({
    order: 5,
    html: function (p) {
      return '<section class="panel pub-optin-panel" data-reveal aria-labelledby="pub-optin-h"><div class="panel-head"><div><div class="eyebrow">Email preferences</div><h3 id="pub-optin-h">Club news and offers</h3></div>' + Club.icon('mail', 'pub-head-icon') + '</div><div class="panel-body">' +
        '<label class="check pub-optin"><input type="checkbox" name="marketingOptIn" data-act="optin"' + (p.marketingOptIn ? ' checked' : '') + '> ' + OPTIN_TEXT + '</label>' +
        '<p class="pub-fine pub-optin-state" aria-live="polite">' + optinState(p) + '</p></div></section>';
    },
    wire: function (root) {
      const box = ui.$('[data-act=optin]', root); if (!box) return;
      box.addEventListener('change', function () {
        const me = Pub.me(); if (!me) return;
        const on = !!box.checked;
        if (!!me.marketingOptIn === on) return;
        const fresh = S.update('publicPlayers', me.id, { marketingOptIn: on, marketingOptInAt: on ? new Date().toISOString() : null });
        const st = ui.$('.pub-optin-state', root); if (st && fresh) st.textContent = optinState(fresh);
        ui.toast(on ? 'You will get club news and offers by email' : 'You will no longer get club news and offers by email');
      });
    }
  });
  /* ---------------- My account: language ---------------- */
  if (Club.i18n) Pub.addAccountSection({
    order: 90,
    html: function () {
      return '<section class="panel pub-lang-panel" data-reveal aria-labelledby="pub-lang-h"><div class="panel-head"><div><div class="eyebrow">Settings</div><h3 id="pub-lang-h">Language</h3></div>' + Club.icon('globe', 'pub-head-icon') + '</div><div class="panel-body">' +
        '<div class="pub-lang-line"><p class="pub-fine pub-lang-note">Choose English or French for this site.</p>' + Club.i18n.switchRow('pub-lang-set') + '</div></div></section>';
    }
  });
  function optinState(p) {
    if (!p.marketingOptIn) return 'You are not getting club news and offers by email.';
    return p.marketingOptInAt ? 'Subscribed since ' + fmt.date(S.iso(new Date(p.marketingOptInAt))) + '.' : 'You are subscribed.';
  }
})();
