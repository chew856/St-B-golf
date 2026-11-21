/* Public booking site: home page with the welcome hero and the booking flow
   (day and time, players, card payment, confirmation). */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, rules = Club.teeRules;
  const EN = Club.fmtEn;   /* English formatting for stored text (js/i18n/fr-shared.js) */

  /* Booking state survives sign in and route changes within this visit. */
  /* extras: per-booking add-ons { addonId: qty }; each party member keeps its per-player add-ons in adds: [addonId]. */
  const st = { step: 1, date: null, time: null, joinId: null, holes: 18, party: null, extras: {}, confirmed: null, alert: null };
  function resetFlow() { st.step = 1; st.time = null; st.joinId = null; st.holes = 18; st.party = null; st.extras = {}; st.confirmed = null; st.alert = null; st.held = false; st.notice = null; if (Club.holds) Club.holds.release(); }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }

  /* Public simplified (Nov 21): the home page is a booking start. A title, a row of short links to the other pages and
     "Dress code and hours", which opens the club's 2027 Membership Handbook text (Club.handbook) in a dialog. */
  function headHTML() {
    const links = [['gifts', 'gift', 'Gift cards'], ['shop', 'shop', 'Shop'], ['takeout', 'dining', 'Takeout'], ['join', 'members', 'Membership'], ['account', 'user', 'My account']];
    return '<section class="pub-home-head" data-reveal><h1>Book a tee time</h1>' +
      '<nav class="pub-quick" aria-label="More">' + links.map(function (l) { return '<a class="pub-quick-a" href="#/' + l[0] + '">' + Club.icon(l[1]) + '<span>' + l[2] + '</span></a>'; }).join('') +
        '<button type="button" class="pub-quick-a" data-act="know">' + Club.icon('info') + '<span>Dress code and hours</span></button></nav>' +
    '</section>';
  }
  /** The dress code and hours from the handbook, with the soft spikes and check-in rules, in one dialog. */
  function openKnow() {
    const H = Club.handbook;
    const sec = H ? H.get('dress-code') : null, v = sec ? H.view(sec) : null, skip = H && H.french() ? ' data-i18n-skip' : '';
    const hours = H ? '<ul class="pub-hb-hours">' + H.hours.map(function (h) {
      return '<li><h4>' + esc(h.venue) + '</h4>' + h.rows.map(function (r) { return '<p><span>' + esc(r.days) + '</span> · <span>' + esc(H.range(r)) + '</span>' + (r.star ? '<span aria-hidden="true">*</span>' : '') + '</p>'; }).join('') +
        (h.note ? '<p class="pub-hb-note">' + esc(h.note) + '</p>' : '') + '</li>';
    }).join('') + '</ul>' : '';
    const body = '<div class="pub-know-box">' +
      '<ul class="pub-know-rules"><li>' + Club.icon('leaf') + '<span>Soft spikes only.</span></li><li>' + Club.icon('clock') + '<span>Check in at the golf shop 15 minutes before.</span></li></ul>' +
      '<h3>Dress code</h3>' + (v ? '<div class="hb-text"' + skip + ' lang="' + v.lang + '">' + H.html(v.body) + '</div>' : '<p>Appropriate golf attire is required for all players.</p>') +
      (hours ? '<h3>Hours</h3>' + hours : '') +
      '<p class="pub-hb-src">From the club’s 2027 Membership Handbook.</p></div>';
    ui.modal({ title: 'Dress code and hours', body: body, actions: [{ label: 'Close', kind: 'primary' }] }).el.classList.add('pub-know-modal');
  }

  Pub.register({
    id: 'book', label: 'Book a tee time', title: 'Book a tee time',
    render: function (view, params) {
      const wanted = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || '') ? params[0] : null;
      const days = Pub.bookingDays();
      if (wanted && days.indexOf(wanted) >= 0 && wanted !== st.date) { resetFlow(); st.date = wanted; }
      if (!st.date || days.indexOf(st.date) < 0) { resetFlow(); st.date = null; }
      /* #/book/<date>/<HH:MM>: a waitlist notice's Book link goes straight to that time (js/public/waitlist.js). */
      const wantTime = wanted && st.date === wanted && /^\d{2}:\d{2}$/.test(params[1] || '') ? params[1] : null;
      if (wantTime) {
        const p0 = Pub.me(); const s0 = Pub.daySlots(st.date, p0 ? p0.id : null).find(function (x) { return x.time === wantTime; });
        if (s0 && Pub.bookable(s0)) { st.time = s0.time; st.joinId = s0.tt ? s0.tt.id : null; st.holes = s0.tt ? (+s0.tt.holes || 18) : 18; st.party = null; st.extras = {}; st.confirmed = null; st.alert = null; st.step = 2; takeHold(s0); }
        try { history.replaceState(null, '', '#/book/' + st.date); } catch (e) { /* file:// */ }   /* once only: a redraw keeps the golfer's group */
      }

      view.innerHTML = headHTML() +
        '<section class="pub-book" id="book" data-reveal>' +
          '<ol class="pub-steps" aria-label="Booking steps"></ol>' +
          '<div class="pub-stage"></div>' +
        '</section>';

      const stage = ui.$('.pub-stage', view), steps = ui.$('.pub-steps', view);
      let card = null, gift = null, promo = null;   /* the payment step's "Have a promo code?" (Club.promos) and "Use a gift card" boxes */
      let ck = null, flow = null;                    /* the shared pay panel (Club.checkout.mount) and its Payment / Review steps */
      let payQ = null;                               /* the fees the payment step was drawn with (the promo box prices these lines) */

      ui.on(view, 'click', '[data-act=know]', openKnow);

      function stepsHTML() {
        /* Payment and Review are two views of step 3 (one pay panel, so what was typed survives Back). */
        const cur = st.step === 3 && st.review ? 4 : st.step;
        return ['Day and time', 'Players', 'Payment', 'Review'].map(function (l, i) {
          const n = i + 1; const cls = n === cur ? 'active' : n < cur ? 'done' : '';
          return '<li class="' + cls + '"><button type="button" data-step="' + n + '"' + (n < cur ? '' : ' disabled') + (n === cur ? ' aria-current="step"' : '') + '><span class="pub-step-n serif">' + (n < cur ? Club.icon('check') : n) + '</span><span class="pub-step-l">' + l + '</span></button></li>';
        }).join('');
      }
      /* ---- Holds (Club.holds): a chosen time is held for a few minutes while the golfer books, with a countdown ---- */
      let holdTimer = null;
      function takeHold(s) {
        if (!Club.holds) return;
        Club.holds.place({ date: st.date, time: s.time, places: Math.min(4, s.places), source: 'public' });
        st.held = true; st.notice = null;
      }
      function dropHold() { if (holdTimer) { holdTimer.stop(); holdTimer = null; } if (Club.holds) Club.holds.release(); st.held = false; }
      /** The hold ran out (or was lost while away): free the time and start again from the list of times. */
      function holdEnded() {
        const t = st.time;
        if (holdTimer) { holdTimer.stop(); holdTimer = null; }
        if (Club.holds) Club.holds.release();
        st.step = 1; st.time = null; st.joinId = null; st.party = null; st.extras = {}; st.alert = null; st.held = false;
        st.notice = 'Your hold on ' + fmt.time(t) + ' has ended. Please choose a time again.';
        paint(true);
        ui.toast('Your hold on ' + fmt.time(t) + ' has ended', 'bad');
      }
      /** Steps 2 and 3 need this page's hold on the chosen time; the countdown shows while it lasts. */
      function syncHold() {
        if (!Club.holds) return true;
        if (st.confirmed || st.step < 2 || !st.time) { if (holdTimer) { holdTimer.stop(); holdTimer = null; } return true; }
        let h = Club.holds.holding(st.date, st.time);
        if (!h && !st.held) { const s = slotNow(); if (s && Pub.bookable(s)) { takeHold(s); h = Club.holds.holding(st.date, st.time); } }
        if (!h) { holdEnded(); return false; }
        if (!holdTimer || !holdTimer.el.isConnected) holdTimer = Club.holds.timer({ hold: h, what: fmt.time(st.time) + ', ' + fmt.dateShort(st.date), onExpire: function () { holdTimer = null; holdEnded(); } });
        return true;
      }
      function paint(scroll) {
        card = null; ck = null; flow = null; st.review = false;   /* a redraw of step 3 starts on Payment */
        if (!syncHold()) return;
        steps.hidden = !!st.confirmed;
        view.classList.toggle('is-done', !!st.confirmed);
        view.classList.toggle('is-booking', !st.confirmed && st.step > 1);   /* the links row only on the first step */
        steps.innerHTML = stepsHTML();
        stage.classList.remove('pub-stage-in'); void stage.offsetWidth; stage.classList.add('pub-stage-in');
        if (st.confirmed) renderConfirmed();
        else if (st.step === 1) renderTimes();
        else if (st.step === 2) renderPlayers();
        else renderPay();
        ui.animateIn(stage);
        if (scroll) { const top = ui.$('#book', view).getBoundingClientRect().top + window.scrollY - 80; if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top: top, behavior: 'smooth' }); }
      }
      ui.on(steps, 'click', 'button', function (e, b) { const n = +b.dataset.step; if (n === 3 && st.step === 3 && st.review && flow) { flow.go('pay'); return; } if (n < st.step) { if (n === 1) dropHold(); st.step = n; st.alert = null; paint(true); } });

      /* ======================= Step 1: day and time ======================= */
      function summary(d, pid) {
        const sl = Pub.daySlots(d, pid);
        const pub = sl.filter(function (s) { return s.state !== 'members'; });
        const av = sl.filter(Pub.bookable);
        const closed = d === Pub.today() && Pub.courseStatus().open === false;
        return { slots: sl, pub: pub, avail: av.length, closed: closed, mine: sl.some(function (s) { return s.state === 'mine'; }), over: pub.length && pub.every(function (s) { return s.state === 'past' || s.state === 'mine'; }) };
      }
      function renderTimes() {
        const p = Pub.me(); const pid = p ? p.id : null;
        const sums = {}; days.forEach(function (d) { sums[d] = summary(d, pid); });
        if (!st.date) st.date = days.find(function (d) { return sums[d].avail > 0; }) || days[0];
        if (!days.length) { stage.innerHTML = '<div class="panel">' + ui.empty({ icon: 'calendar', title: 'Booking is not open right now', text: 'Please call the golf shop at ' + Club.info.phone + '.' }) + '</div>'; return; }
        stage.innerHTML =
          '<div class="pub-strip-wrap"><div class="pub-strip" role="listbox" aria-label="Choose a day">' + days.map(function (d, i) {
            const s = sums[d]; const dt = fmt.toDate(d);
            const lab = s.closed ? 'Closed' : !s.pub.length ? 'Members' : s.avail ? Pub.plural(s.avail, 'time') : (s.over ? 'Play over' : 'Fully booked');
            const hol = rules.holidayName(d);
            return '<button type="button" role="option" class="pub-day' + (d === st.date ? ' active' : '') + (!s.avail ? ' is-none' : '') + (s.mine ? ' has-mine' : '') + '" data-date="' + d + '" aria-selected="' + (d === st.date) + '" aria-label="' + esc(Pub.longDate(d) + ', ' + lab) + '" style="--i:' + i + '">' +
              '<span class="pub-day-wk">' + (i === 0 ? 'Today' : esc(fmt.weekday(d))) + '</span>' +
              '<span class="pub-day-n serif">' + dt.getDate() + '</span>' +
              '<span class="pub-day-mo">' + esc(dt.toLocaleDateString('en-CA', { month: 'short' }).replace('.', '')) + '</span>' +
              '<span class="pub-day-lab">' + esc(lab) + '</span>' +
              (hol ? '<span class="pub-day-hol" title="' + esc(hol) + '">Holiday</span>' : '') +
            '</button>';
          }).join('') + '</div></div>' +
          (st.notice ? '<p class="hold-ended" role="status">' + Club.icon('clock') + '<span>' + esc(st.notice) + '</span></p>' : '') +
          '<div class="pub-times"></div>';
        drawDay(ui.$('.pub-times', stage), sums[st.date]);
        const act = ui.$('.pub-day.active', stage);
        if (act) requestAnimationFrame(function () { const strip = act.parentNode; strip.scrollLeft = Math.max(0, act.offsetLeft - strip.clientWidth / 2 + act.offsetWidth / 2); });
      }
      function nextDayBtn(from) {
        const p = Pub.me(); const pid = p ? p.id : null;
        const nd = days.find(function (x) { return x > from && summary(x, pid).avail > 0; });
        return nd ? '<button type="button" class="btn btn-primary btn-sm" data-act="pick-day" data-date="' + nd + '">' + esc('See ' + Pub.dayName(nd) + (nd === Club.date.addDays(Pub.today(), 1) ? '' : ', ' + fmt.dateShort(nd))) + '</button>' : '';
      }
      function drawDay(el, sum) {
        const d = st.date;
        const wx = (Club.weather.forecast || []).find(function (w) { return w.date === d; });
        const hol = rules.holidayName(d);
        const head = '<div class="pub-times-head"><h3>' + esc(Pub.longDate(d)) + '</h3>' +
          (wx ? '<span class="pub-wx">' + Club.icon(wx.icon) + esc(wx.cond) + ', ' + esc(wx.hi) + '°C' + (wx.rain >= 50 ? ' · ' + esc(wx.rain) + '% rain' : '') + '</span>' : '') + '</div>' +
          (hol ? '<p class="pub-hol-note">' + Club.icon('star') + '<span>' + esc(hol) + ': weekend and holiday times and rates apply.</span></p>' : '');
        let body;
        if (sum.closed) {
          body = ui.empty({ icon: 'course', title: 'The course is closed today', text: Pub.courseStatus().message || '', action: nextDayBtn(d) });
        } else if (!sum.pub.length) {
          const reason = rules.publicSlot(d, '12:00').reason || 'There are no public tee times on this day.';
          body = ui.empty({ icon: 'members', title: 'Member play only', text: reason, action: nextDayBtn(d) });
        } else if (!sum.avail) {
          body = ui.empty({ icon: 'flag', title: sum.over ? 'No more times today' : 'Fully booked', text: '', action: !sum.over && Pub.waitlist ? '<div class="wl-acts">' + Pub.waitlist.buttonHTML(d) + nextDayBtn(d) + '</div>' : nextDayBtn(d) });
        } else {
          const bands = [];
          sum.pub.forEach(function (s) { let g = bands.find(function (b) { return b.band === s.pub.band; }); if (!g) { g = { band: s.pub.band, label: s.pub.label, rate: s.pub.rate, slots: [] }; bands.push(g); } g.slots.push(s); });
          let idx = 0;
          body = bands.map(function (g) {
            const shown = g.slots.filter(function (s) { return Pub.bookable(s) || s.state === 'mine'; });
            if (!shown.length) return '';   /* nothing to book at this rate: say nothing */
            return '<div class="pub-band"><div class="pub-band-head"><span class="pub-band-name">' + esc(g.label) + '</span><span class="pub-band-rate serif">' + fmt.money(g.rate, false) + '<small> per golfer</small></span></div>' +
              '<div class="pub-chips">' + shown.map(function (s) { return chipHTML(s, idx++); }).join('') + '</div>' +
            '</div>';
          }).join('');
        }
        el.innerHTML = head + body;
      }
      function chipHTML(s, i) {
        const tp = Pub.timeParts(s.time);
        const sub = s.state === 'mine' ? 'Your booking' : s.state === 'partial' ? Pub.plural(s.places, 'place') + ' left' : Pub.plural(s.places, 'place');   /* the price is on the rate's heading */
        return '<button type="button" class="pub-chip st-' + s.state + (s.time === st.time ? ' selected' : '') + '" data-time="' + s.time + '" aria-label="' + esc(fmt.time(s.time) + ', ' + sub + ', ' + fmt.money(s.pub.rate, false) + ' per golfer') + '" style="--i:' + Math.min(i, 30) + '">' +
          '<span class="pub-chip-t serif">' + tp.t + '<small>' + tp.ap + '</small></span>' +
          Club.teeHeads(4 - s.places) +
          '<span class="pub-chip-p">' + esc(sub) + '</span></button>';
      }
      ui.on(view, 'click', '.pub-day', function (e, b) {
        if (b.dataset.date === st.date) return;
        st.date = b.dataset.date; st.time = null; st.joinId = null;
        ui.$$('.pub-day', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
        const p = Pub.me();
        const el = ui.$('.pub-times', view);
        el.classList.remove('pub-swap'); void el.offsetWidth; el.classList.add('pub-swap');
        drawDay(el, summary(st.date, p ? p.id : null));
      });
      ui.on(view, 'click', '[data-act=pick-day]', function (e, b) { const t = ui.$('.pub-day[data-date="' + b.dataset.date + '"]', view); if (t) { t.click(); t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } });
      ui.on(view, 'click', '.pub-chip', function (e, b) {
        if (b.classList.contains('st-mine')) { Pub.go('bookings'); return; }
        const p = Pub.me();
        const s = Pub.daySlots(st.date, p ? p.id : null).find(function (x) { return x.time === b.dataset.time; });
        if (!s || !Pub.bookable(s)) { ui.toast('That tee time is no longer available', 'bad'); paint(); return; }
        ui.$$('.pub-chip.selected', view).forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
        st.time = s.time; st.joinId = s.tt ? s.tt.id : null; st.holes = s.tt ? (+s.tt.holes || 18) : 18;
        st.party = null; st.extras = {}; st.alert = null;
        takeHold(s);
        setTimeout(function () { st.step = 2; paint(true); }, 220);
      });

      /* ======================= Step 2: players ======================= */
      function slotNow() { const p = Pub.me(); return Pub.daySlots(st.date, p ? p.id : null).find(function (x) { return x.time === st.time; }) || null; }
      function selBar() {
        const tp = Pub.timeParts(st.time); const ps = rules.publicSlot(st.date, st.time);
        /* The rate per golfer, and "Joining a group" when the time already has a group (its places left are on the players list). */
        return '<div class="pub-sel" data-reveal><div class="pub-sel-when"><span class="pub-sel-time serif">' + tp.t + '<small>' + tp.ap + '</small></span><div><div class="pub-sel-day">' + esc(Pub.longDate(st.date)) + '</div><div class="muted"><span>' + esc(fmt.money(ps.rate, false)) + '</span> <span>per golfer</span>' + (st.joinId ? ' · <span>Joining a group</span>' : '') + '</div></div></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="change-time">Change</button></div>';
      }
      function ensureParty(p) {
        if (!st.party) st.party = [{ self: true, name: p.firstName + ' ' + p.lastName, cart: false, adds: [] }];
        st.party[0].name = p.firstName + ' ' + p.lastName;
      }
      /** The fees for the group as it stands (guests without a name yet are "Guest 1"...). */
      function fees() {
        return Pub.quote(st.date, st.time, st.holes, (st.party || []).map(function (x, i) { return { name: x.self ? x.name : (x.name.trim() || 'Guest ' + i), cart: x.cart, adds: x.adds }; }), st.extras);
      }
      function renderPlayers() {
        const p = Pub.me();
        if (!p) {
          stage.innerHTML = selBar() +
            '<section class="panel pub-gate" data-reveal><div class="panel-body">' +
              '<div class="pub-gate-head"><h3>Sign in or create an account</h3>' + (Club.holds ? '<p class="muted">' + esc('We’ll hold this time for ' + Club.holds.MINUTES + ' minutes.') + '</p>' : '') + '</div>' +
              '<div class="pub-gate-auth"></div>' +
            '</div></section>';
          Pub.authForm(ui.$('.pub-gate-auth', stage), 'signup', function () { paint(true); }, true);
          return;
        }
        const s = slotNow();
        if (!s || !Pub.bookable(s)) {
          stage.innerHTML = selBar() + '<div class="panel" data-reveal>' + ui.empty({ icon: 'flag', title: 'That tee time is no longer available', text: s && s.state === 'clash' ? 'You already have a round close to this time on the same day.' : s && s.state === 'mine' ? 'You are already booked at this time.' : '', action: ui.btn('Choose another time', { kind: 'primary', action: 'pick-again' }) }) + '</div>';
          return;
        }
        st.joinId = s.tt ? s.tt.id : null;
        if (s.tt) st.holes = +s.tt.holes || 18;
        ensureParty(p);
        const max = Math.min(4, s.places);
        if (st.party.length > max) st.party = st.party.slice(0, max);
        const noCarts = Pub.cartRuleFor(st.date) === 'No carts';
        if (noCarts) st.party.forEach(function (x) { x.cart = false; });
        stage.innerHTML = selBar() +
          '<section class="panel pub-party" data-reveal><div class="panel-head"><h3>Players</h3><span class="muted pub-party-count"></span></div><div class="panel-body">' +
            '<ul class="pub-pl-list"></ul>' +
            '<div class="pub-add-wrap"></div>' +
            (noCarts ? '<p class="pub-rule">' + Club.icon('info') + 'No carts today.</p>' : Pub.cartRuleFor(st.date) !== 'Normal' ? '<p class="pub-rule">' + Club.icon('info') + 'Carts are ' + esc(Pub.cartRuleFor(st.date).toLowerCase()) + ' today.</p>' : '') +
            '<div class="pub-opts"><div class="field"><label>Holes</label>' + (st.joinId ? '<div class="pub-locked">' + st.holes + ' holes <span class="muted">set by the group</span></div>' : ui.segmented([{ value: '18', label: '18 holes' }, { value: '9', label: '9 holes' }], String(st.holes), 'pub-holes')) + '</div>' +
              (noCarts ? '' : '<div class="pub-cart-note"><span class="label-caps">Cart</span><span>' + esc(fmt.money(Pub.cartFee(st.holes))) + ' per rider</span></div>') + '</div>' +
          '</div></section>' +
          (Pub.addonList().length ? '<section class="panel pub-adds" data-reveal aria-labelledby="pub-adds-h"><div class="panel-head"><h3 id="pub-adds-h">Extras <span class="muted pub-opt-word">(optional)</span></h3><span class="muted pub-adds-sum"></span></div>' +
            '<div class="panel-body"><ul class="pub-adds-list"></ul></div></section>' : '') +
          '<section class="pub-fees" data-reveal></section>' +
          '<div class="pub-actions" data-reveal><button type="button" class="btn btn-ghost" data-act="back-1">' + Club.icon('chevronLeft') + '<span>Back</span></button><button type="button" class="btn btn-primary pub-cta" data-act="to-pay"><span>Continue to payment</span>' + Club.icon('chevronRight') + '</button></div>';
        drawParty(max, noCarts);
      }
      function drawParty(max, noCarts) {
        const list = ui.$('.pub-pl-list', stage); if (!list) return;
        list.innerHTML = st.party.map(function (x, i) {
          return '<li class="pub-pl' + (x.self ? ' is-self' : ' is-guest') + (x.fresh ? ' is-fresh' : '') + '" data-i="' + i + '">' +
            '<span class="pub-pl-n serif">' + (i + 1) + '</span>' +
            '<div class="pub-pl-who">' + (x.self ? '<div class="person-name">' + esc(x.name) + '</div><div class="person-sub">You</div>'
              : '<div class="pub-guest-f">' +
                  '<div class="field"><input class="input pub-guest" data-i="' + i + '" data-k="first" placeholder="First name" aria-label="Guest ' + i + ' first name" maxlength="30" autocomplete="off" value="' + esc(x.first || '') + '"></div>' +
                  '<div class="field"><input class="input pub-guest" data-i="' + i + '" data-k="last" placeholder="Last name" aria-label="Guest ' + i + ' last name" maxlength="30" autocomplete="off" value="' + esc(x.last || '') + '"></div>' +
                  '<div class="field pub-guest-email"><input class="input pub-guest" type="email" data-i="' + i + '" data-k="email" placeholder="Email address" aria-label="Guest ' + i + ' email address" maxlength="80" autocomplete="off" inputmode="email" value="' + esc(x.email || '') + '"></div>' +
                '</div><div class="person-sub">Guest ' + i + '</div>') + '</div>' +
            '<div class="pub-pl-ride">' + (noCarts ? '<span class="pub-walk">Walking</span>' : '<div class="segmented pub-ride" data-i="' + i + '" role="group" aria-label="' + esc((x.self ? 'Your' : 'Guest ' + i) + ' transport') + '"><button type="button" data-value="walk" class="' + (x.cart ? '' : 'active') + '">Walk</button><button type="button" data-value="cart" class="' + (x.cart ? 'active' : '') + '">Cart</button></div>') + '</div>' +
            (x.self ? '<span class="pub-pl-x-spacer"></span>' : '<button type="button" class="btn btn-ghost btn-sm btn-icon pub-pl-x" data-act="remove" data-i="' + i + '" aria-label="Remove guest ' + i + '" title="Remove guest">' + Club.icon('close') + '</button>') +
          '</li>';
        }).join('');
        st.party.forEach(function (x) { delete x.fresh; });
        drawAdds();
        ui.$('.pub-party-count', stage).textContent = st.party.length + ' of ' + max + (max < 4 ? ' places left' : ' players');
        ui.$('.pub-add-wrap', stage).innerHTML = st.party.length < max
          ? '<button type="button" class="pub-add-btn" data-act="add-guest">' + Club.icon('plus') + '<span>Add a guest</span></button>'
          : '<p class="muted pub-full">' + (max === 4 ? 'Group full.' : 'No more places at this time.') + '</p>';
        drawFees();
      }
      /* Add-ons: a per-player one has a button for each golfer (pressed = wanted); a per-booking one has a quantity. */
      function drawAdds() {
        const ul = ui.$('.pub-adds-list', stage); if (!ul) return;
        const list = Pub.addonList(), A = Club.addons, max = A.MAX_QTY;
        const live = {}; list.forEach(function (a) { live[a.id] = a; });
        st.party.forEach(function (x) { x.adds = (x.adds || []).filter(function (id) { return live[id] && live[id].per === 'player'; }); });
        Object.keys(st.extras).forEach(function (id) { if (!live[id] || live[id].per !== 'booking' || !(st.extras[id] > 0)) delete st.extras[id]; });
        ul.innerHTML = list.map(function (a) {
          const head = '<div class="pub-addon-head"><span class="pub-addon-name">' + esc(a.name) + '</span><span class="pub-addon-price">' + esc(A.unit(a, st.holes)) + '</span></div>';
          if (a.per === 'booking') {
            const n = st.extras[a.id] || 0;
            return '<li class="pub-addon is-qty" data-addon="' + esc(a.id) + '">' + head +
              '<div class="pub-qty" role="group" aria-label="' + esc(a.name) + '"><button type="button" class="pub-qty-b" data-act="addon-qty" data-d="-1" aria-label="One fewer"' + (n <= 0 ? ' disabled' : '') + '><span aria-hidden="true">&minus;</span></button>' +
              '<output class="pub-qty-v serif" aria-live="polite">' + n + '</output>' +
              '<button type="button" class="pub-qty-b" data-act="addon-qty" data-d="1" aria-label="One more"' + (n >= max ? ' disabled' : '') + '><span aria-hidden="true">+</span></button></div></li>';
          }
          return '<li class="pub-addon" data-addon="' + esc(a.id) + '">' + head +
            '<div class="pub-addon-who" role="group" aria-label="' + esc(a.name) + '">' + st.party.map(function (x, i) {
              const on = x.adds.indexOf(a.id) >= 0;
              const who = x.self ? 'You' : (x.name.trim().split(' ')[0] || 'Guest ' + i);
              return '<button type="button" class="pub-addon-chip' + (on ? ' on' : '') + '" data-act="addon-toggle" data-i="' + i + '" aria-pressed="' + on + '">' + Club.icon('check', 'pub-addon-tick') + '<span>' + esc(who) + '</span></button>';
            }).join('') + '</div></li>';
        }).join('');
        const n = st.party.reduce(function (a, x) { return a + x.adds.length; }, 0) + Object.keys(st.extras).reduce(function (a, k) { return a + st.extras[k]; }, 0);
        const sum = ui.$('.pub-adds-sum', stage); if (sum) sum.textContent = n ? Pub.plural(n, 'item') + ' added' : 'None added';
      }
      ui.on(view, 'click', '[data-act=addon-toggle]', function (e, b) {
        const x = st.party[+b.dataset.i], id = b.closest('[data-addon]').dataset.addon; if (!x) return;
        const k = x.adds.indexOf(id); if (k >= 0) x.adds.splice(k, 1); else x.adds.push(id);
        drawAdds(); drawFees();
        const again = ui.$('.pub-addon[data-addon="' + id + '"] [data-act=addon-toggle][data-i="' + b.dataset.i + '"]', stage); if (again) again.focus();
      });
      ui.on(view, 'click', '[data-act=addon-qty]', function (e, b) {
        const id = b.closest('[data-addon]').dataset.addon, d = +b.dataset.d;
        st.extras[id] = Math.max(0, Math.min(Club.addons.MAX_QTY, (st.extras[id] || 0) + d));
        drawAdds(); drawFees();
        const row = ui.$('.pub-addon[data-addon="' + id + '"]', stage);
        const again = row && (ui.$('[data-act=addon-qty][data-d="' + d + '"]:not([disabled])', row) || ui.$('[data-act=addon-qty]:not([disabled])', row)); if (again) again.focus();
      });
      function drawFees() {
        const el = ui.$('.pub-fees', stage); if (!el) return;
        const q = fees();
        el.innerHTML = '<div class="pub-fees-card"><div class="pub-fees-top"><span class="label-caps">Total</span><span class="pub-fees-total serif">' + esc(fmt.money(q.total)) + '</span></div>' +
          '<ul class="pub-fees-lines">' + q.lines.map(function (l) { return '<li><span>' + esc(l.label) + '</span><span class="num">' + esc(fmt.money(l.amount)) + '</span></li>'; }).join('') + '</ul>' +
          '<p class="pub-fees-note">Tax included.</p></div>';
      }
      ui.on(view, 'click', '[data-act=change-time], [data-act=back-1], [data-action=pick-again]', function () { dropHold(); st.step = 1; st.alert = null; paint(true); });
      ui.on(view, 'click', '.segmented[data-name=pub-holes] button', function (e, b) {
        st.holes = +b.dataset.value; ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); });
        const n = ui.$('.pub-cart-note span:last-child', stage); if (n) n.textContent = fmt.money(Pub.cartFee(st.holes)) + ' per rider';
        drawAdds(); drawFees();
      });
      ui.on(view, 'click', '.pub-ride button', function (e, b) {
        const i = +b.parentNode.dataset.i; st.party[i].cart = b.dataset.value === 'cart';
        ui.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); drawFees();
      });
      ui.on(view, 'click', '[data-act=add-guest]', function () {
        const s = slotNow(); const max = s ? Math.min(4, s.places) : 4;
        if (st.party.length >= max) return;
        st.party.push({ self: false, name: '', first: '', last: '', email: '', cart: false, adds: [], fresh: true });
        drawParty(max, Pub.cartRuleFor(st.date) === 'No carts');
        const ins = ui.$$('.pub-guest', stage); if (ins.length) ins[ins.length - 1].focus();
      });
      ui.on(view, 'click', '[data-act=remove]', function (e, b) {
        st.party.splice(+b.dataset.i, 1);
        const s = slotNow(); drawParty(s ? Math.min(4, s.places) : 4, Pub.cartRuleFor(st.date) === 'No carts');
      });
      view.addEventListener('input', function (e) {
        if (!e.target.classList.contains('pub-guest')) return;
        const g = st.party[+e.target.dataset.i]; if (!g) return;
        g[e.target.dataset.k] = e.target.dataset.k === 'email' ? e.target.value.trim() : e.target.value.replace(/\s+/g, ' ').replace(/^\s/, '');
        g.name = ((g.first || '').trim() + ' ' + (g.last || '').trim()).trim();
        e.target.classList.remove('invalid'); const er = e.target.parentNode.querySelector('.field-error'); if (er) er.remove();
        drawFeesSoon(true);
      });
      let feeTimer = null;
      function drawFeesSoon(adds) { clearTimeout(feeTimer); feeTimer = setTimeout(function () { if (adds) drawAdds(); drawFees(); }, 120); }
      /** Every guest needs a first name, last name and email (the golf shop's contact and their confirmation). */
      function validateGuests() {
        let ok = true; const seen = {};
        const p = Pub.me();
        const self = st.party[0] ? st.party[0].name.toLowerCase() : '';
        const selfEmail = p && p.email ? String(p.email).toLowerCase() : '';
        const clean = function (v) { return String(v || '').trim().replace(/\s+/g, ' '); };
        ui.$$('.pub-guest', stage).forEach(function (inp) { inp.classList.remove('invalid'); inp.removeAttribute('aria-invalid'); const er = inp.parentNode.querySelector('.field-error'); if (er) er.remove(); });
        const err = function (inp, msg) { ok = false; inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true'); inp.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); };
        const name = /^[\p{L}][\p{L}' .-]*$/u;
        st.party.forEach(function (x, i) {
          if (x.self) return;
          x.first = clean(x.first); x.last = clean(x.last); x.email = String(x.email || '').trim(); x.name = (x.first + ' ' + x.last).trim();
          const f = ui.$('.pub-guest[data-i="' + i + '"][data-k=first]', stage), l = ui.$('.pub-guest[data-i="' + i + '"][data-k=last]', stage), m = ui.$('.pub-guest[data-i="' + i + '"][data-k=email]', stage);
          if (!f || !l || !m) return;
          if (!x.first) err(f, 'Please enter a first name.'); else if (!name.test(x.first)) err(f, 'Use letters only, please.');
          if (!x.last) err(l, 'Please enter a last name.'); else if (!name.test(x.last)) err(l, 'Use letters only, please.');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x.email)) err(m, 'Please enter a valid email address.');
          else if (selfEmail && x.email.toLowerCase() === selfEmail) err(m, 'Please use your guest’s own email address.');
          const k = x.name.toLowerCase();
          if (x.first && x.last && (seen[k] || k === self)) err(l, 'Each golfer needs their own name.');
          seen[k] = 1;
        });
        if (!ok) { const f = ui.$('.pub-guest.invalid', stage); if (f) f.focus(); }
        return ok;
      }
      ui.on(view, 'click', '[data-act=to-pay]', function () {
        if (!validateGuests()) { ui.toast('Please complete your guests’ details', 'bad'); return; }
        const s = slotNow();
        if (!s || !Pub.bookable(s) || s.places < st.party.length) { ui.toast('That tee time has just changed. Please choose again', 'bad'); dropHold(); st.step = 1; paint(true); return; }
        st.step = 3; st.alert = null; paint(true);
      });

      /* ======================= Step 3: payment ======================= */
      function renderPay() {
        const p = Pub.me();
        if (!p || !st.party) { st.step = p ? 2 : 1; paint(); return; }
        const q = payQ = fees();
        const tp = Pub.timeParts(st.time);
        stage.innerHTML =
          '<div class="pub-pay">' +
            /* Public simplified (Nov 21): the booking at a glance. Day and time large, then holes, players, carts, extras and the
               total (the fee lines were on the Players step). */
            '<section class="panel pub-order pub-sum" data-reveal aria-label="Your booking"><div class="panel-body">' +
              '<div class="pub-sum-day">' + esc(Pub.longDate(st.date)) + '</div>' +
              '<div class="pub-sum-time serif">' + tp.t + '<small>' + tp.ap + '</small></div>' +
              (st.joinId ? '<div class="pub-sum-join muted">Joining a group</div>' : '') +
              '<dl class="pub-sum-kv"></dl>' +
              '<div class="pub-sum-total"><span>Total</span><span class="serif num pub-sum-amt"></span></div>' +
              '<p class="pub-fees-note">' + esc('Tax included. Cancel up to ' + Pub.REFUND_HOURS + ' hours before for a full refund.') + '</p>' +
            '</div></section>' +
            '<section class="panel pub-card-panel" data-reveal><div class="panel-head"><h3 class="pub-pay-h">Payment</h3><span class="pub-secure">' + Club.icon('key') + 'Secure</span></div><div class="panel-body">' +
              '<div class="pub-alert" role="alert" hidden></div>' +
              '<div class="pub-flow"></div>' +
              '<p class="pub-fine">Dress code and soft spikes apply.</p>' +
            '</div></section>' +
          '</div>';
        /* The booking's own indicator above shows Payment and Review as steps 3 and 4; Back on Payment returns to Players. */
        flow = Club.checkout.steps(ui.$('.pub-flow', stage), { site: 'public', progress: false,
          back: { html: '<button type="button" class="btn btn-ghost ckf-back" data-act="back-2">' + Club.icon('chevronLeft') + '<span>Edit players</span></button>' },
          steps: [
            { id: 'pay', label: 'Payment', next: 'Continue to review',
              html: '<div class="pr-apply-host"></div><p class="pub-free-note" hidden>' + Club.icon('tag') + '<span>Your promo code covers this booking. There is nothing to pay.</span></p><div class="pub-ck"></div>' },
            { id: 'review', label: 'Review', html: '<div class="pub-review"></div>',
              action: '<button type="button" class="btn btn-primary pub-paybtn" data-act="pay">' + Club.icon('check') + '<span>Pay ' + esc(fmt.money(q.total)) + '</span></button>' }
          ],
          leave: function () {
            ui.$('.pub-alert', stage).hidden = true; st.alert = null;
            if (promo) { const pm = promo.recheck(); if (pm) { paintPay(); fail(pm); return false; } }
            if (afterPromo() <= 0 && promoState()) return true;
            const r = ck.validate();
            if (!r.ok && r.declined) ck.fail('');   /* a declined card is only known when paying */
            return r.ok || !!r.declined;
          },
          enter: function (id) {
            st.review = id === 'review';
            steps.innerHTML = stepsHTML();
            const h = ui.$('.pub-pay-h', stage); if (h) { h.textContent = st.review ? 'Review and pay' : 'Payment'; if (Club.i18n) Club.i18n.translate(h); }
            if (!st.review) { ui.$('.pub-alert', stage).hidden = true; st.alert = null; }
            paintPay();
          } });
        /* Promo first, then a gift card covers what is left, then the card (Club.promos.applyBox, then Club.checkout's gift card and card). */
        gift = null; ck = null;
        promo = Club.promos ? Club.promos.applyBox(ui.$('.pr-apply-host', stage), { site: 'public',
          ctx: function () { return { where: 'teetime', date: st.date, time: st.time, publicPlayerId: p.id }; },
          lines: function () { return payQ ? payQ.lines : []; },
          onChange: function () { if (ck) ck.refresh(); else paintPay(); } }) : null;
        ck = Club.checkout.mount(ui.$('.pub-ck', stage), { site: 'public', player: p, account: false, gift: !!Club.giftcards, amount: afterPromo, onChange: paintPay, quiet: true });
        paintPay();
        if (st.alert) showAlert(st.alert);
      }
      function promoState() { return promo ? promo.state() : null; }
      /** What is left after the promo code: the gift card and the card share this. */
      function afterPromo() { const s = promoState(); return payQ ? r2(Math.max(0, payQ.total - (s ? s.discount : 0))) : 0; }
      function payLabel() {
        const net = afterPromo(), g = net > 0 && ck ? ck.gift() : null;
        return net <= 0 ? 'Confirm booking' : g && g.covers ? 'Pay with gift card' : 'Pay ' + fmt.money(g ? g.due : net);
      }
      /** The order lines (with the promo code's line), the gift card box and the pay button, after any change. */
      /** Extras on the booking: "Rental clubs (2), Sleeve of balls" (names as the club set them). */
      function extrasText() {
        const n = {}, order = [];
        payQ.lines.forEach(function (l) { if (l.kind !== 'addon') return; const a = Club.addons && Club.addons.get(l.addonId); const k = a ? a.name : l.label; if (!(k in n)) { n[k] = 0; order.push(k); } n[k] += l.qty || 1; });
        return order.map(function (k) { return n[k] > 1 ? k + ' (' + n[k] + ')' : k; }).join(', ');
      }
      function paintPay() {
        const kv = ui.$('.pub-sum-kv', stage); if (!kv || !payQ) return;
        const s = promoState(), net = afterPromo(), free = net <= 0 && !!s;
        const carts = st.party.filter(function (x) { return x.cart; }).length, extras = extrasText();
        const row = function (k, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; };
        kv.innerHTML = row('Holes', String(st.holes)) + row('Players', String(st.party.length)) + row('Carts', carts ? String(carts) : 'None') +
          (extras ? row('Extras', extras) : '') + (s ? row('Promo code ' + s.code, '−' + fmt.money(s.discount), 'pub-sum-promo') : '');
        ui.$('.pub-sum-amt', stage).textContent = fmt.money(net);
        if (Club.i18n) Club.i18n.translate(kv);
        const b = ui.$('.pub-paybtn', stage), ce = ui.$('.pub-ck', stage), fn = ui.$('.pub-free-note', stage);
        if (ce) ce.hidden = free;   /* a promo code that covers the booking: nothing to choose */
        if (fn) fn.hidden = !free;
        if (b && !b.disabled) b.querySelector('span').textContent = payLabel();
        paintReview(free, s, net);
      }
      /** Review (step 4 in the indicator): how the booking is paid and the total; the booking itself is in the panel beside. */
      function paintReview(free, s, net) {
        const rv = flow && flow.at() === 'review' ? ui.$('.pub-review', stage) : null; if (!rv || !ck) return;
        rv.innerHTML = Club.checkout.reviewHTML([
          { title: 'Payment', edit: 'pay', html: free ? '<p class="pub-rv-free">' + Club.icon('tag') + '<span>' + esc('Covered by promo code ' + s.code) + '</span></p>' : ck.summaryHTML() },
          { title: '', html: (s ? '<dl class="ckf-rv-kv"><div><dt>' + esc('Promo code ' + s.code) + '</dt><dd class="num">' + esc('−' + fmt.money(s.discount)) + '</dd></div></dl>' : '') +
            '<div class="ckf-rv-sum"><span>Total</span><span class="num">' + esc(fmt.money(net)) + '</span></div>' }
        ], 'public');
      }
      ui.on(view, 'click', '[data-act=back-2]', function () { st.step = 2; st.alert = null; paint(true); });
      ui.on(view, 'click', '[data-act=again]', function () { dropHold(); st.step = 1; st.time = null; st.joinId = null; st.alert = null; paint(true); });

      function showAlert(a) {
        const al = ui.$('.pub-alert', stage); if (!al) return;
        al.innerHTML = Club.icon('alert') + '<div><p>' + esc(a.msg) + '</p>' + (a.again ? '<button type="button" class="btn btn-sm btn-primary" data-act="again">Choose another time</button>' : '') + '</div>';
        al.hidden = false; al.classList.remove('shake'); void al.offsetWidth; al.classList.add('shake');
        al.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      function fail(msg, again) { st.alert = { msg: msg, again: !!again }; showAlert(st.alert); }

      ui.on(view, 'click', '[data-act=pay]', function (e, btn) {
        const p = Pub.me(); if (!p) { st.step = 2; paint(true); return; }
        const al = ui.$('.pub-alert', stage); al.hidden = true; st.alert = null;
        // 1. The promo code (it may have reached its limit since it was applied), then the gift card, then the card
        let pay = null;
        if (promo) { const pm = promo.recheck(); if (pm) { if (flow) flow.go('pay', true); paintPay(); return fail(pm); } }
        const pr = promoState(), net = afterPromo();
        let g = null;
        /* A problem with the gift card or the card is shown on the Payment step, next to it. */
        const toPay = function () {
          if (flow && flow.at() !== 'pay') flow.go('pay', true);
          const x = ui.$('[data-ckf-step=pay] .invalid', stage) || ui.$('[data-ckf-step=pay] .ck-alert:not([hidden])', stage);
          if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (x.matches('input')) x.focus({ preventScroll: true }); }
        };
        if (net <= 0 && pr) pay = { brand: null, last4: null, expMonth: null, expYear: null, name: '', save: false, free: true };
        else {
          const r = ck.validate();   /* the gift card (re-checked), then the card typed in */
          if (!r.ok) { toPay(); return; }
          g = r.gift && r.gift.amount > 0 ? r.gift : null;
          if (r.method === 'gift') pay = { brand: 'giftcard', last4: g.last4, expMonth: null, expYear: null, name: '', save: false };
          else pay = { brand: r.card.brand, last4: r.card.last4, expMonth: r.card.expMonth, expYear: r.card.expYear, name: r.card.name, save: false };
        }
        if (g) pay.gift = g;
        if (pr) pay.promo = { promoId: pr.promo.id, code: pr.code, discount: pr.discount };
        // 2. Re-check the slot right before taking payment
        const chk = Pub.recheck(st.date, st.time, st.party.length, st.joinId, p.id);
        if (!chk.ok) return fail(chk.msg, true);
        // 3. "Process" the card (demonstration), then check once more and write
        btn.disabled = true; btn.classList.add('is-busy'); btn.querySelector('span').textContent = pay.free ? 'Confirming your booking' : 'Processing payment';
        ui.$$('.cc-fields input', stage).forEach(function (i) { i.disabled = true; });
        setTimeout(function () {
          if (Club.holds && !Club.holds.holding(st.date, st.time)) { if (holdTimer) holdEnded(); return; }   /* the hold ran out mid-payment: back to the times, nothing was charged */
          const restore = function () { btn.disabled = false; btn.classList.remove('is-busy'); btn.querySelector('span').textContent = payLabel(); ui.$$('.cc-fields input', stage).forEach(function (i) { i.disabled = false; }); };
          if (pay.last4 === '0002') { restore(); return fail('Your card was declined. Please try another card, or call your card issuer.'); }
          const again = Pub.recheck(st.date, st.time, st.party.length, st.joinId, p.id);
          if (!again.ok) { restore(); return fail(again.msg, true); }
          const done = write(p, pay, again.tt);
          if (!done) { restore(); return fail('We could not complete your booking. You have not been charged. Please call the golf shop at ' + Club.info.phone + '.'); }
          // Wipe card inputs; nothing sensitive stays on the page.
          if (ck) ck.remember(null);   /* the card is saved by write() when asked; this only clears the fields */
          st.confirmed = done.id; st.alert = null;
          dropHold();
          paint(true);   /* the success screen says it: no toast on top of it */
        }, 900);
      });

      function write(p, pay, existing) {
        const A = Club.addons;
        /* Add-ons go on the tee time: per-player ones on that golfer, per-booking ones on the account holder. */
        const items = function (x) {
          const out = (x.adds || []).map(function (id) { const a = A && A.get(id); return a && a.active ? A.item(a, 1, st.holes) : null; }).filter(Boolean);
          if (x.self && A) Object.keys(st.extras).forEach(function (id) { const a = A.get(id); if (a && a.active && st.extras[id] > 0) out.push(A.item(a, st.extras[id], st.holes)); });
          return out;
        };
        const party = st.party.map(function (x) {
          const o = { memberId: null, name: x.self ? p.firstName + ' ' + p.lastName : x.name, type: 'public', publicPlayerId: p.id, cart: Pub.cartRuleFor(st.date) === 'No carts' ? false : !!x.cart, paid: true };
          if (!x.self) { o.publicGuest = true; o.firstName = x.first; o.lastName = x.last; o.email = x.email; }
          const ad = items(x); if (ad.length) o.addons = ad;
          return o;
        });
        const q = fees();
        const pr = pay.promo || null;
        const lines = q.lines.concat(pr ? [{ label: 'Promo code ' + pr.code, amount: -pr.discount, kind: 'promo' }] : []);
        let tt;
        if (existing) {
          tt = S.update('teeTimes', existing.id, { players: (existing.players || []).concat(party) });
        } else {
          tt = S.insert('teeTimes', { date: st.date, time: st.time, holes: st.holes, players: party, status: 'booked', notes: '', eventId: null, startedAt: null, finishedAt: null, bookedBy: p.id, source: 'public', paid: true });
        }
        if (!tt) return null;
        const payment = S.insert('publicPayments', {
          id: S.uid('ppay'), publicPlayerId: p.id, teeTimeId: tt.id, date: Pub.today(), amount: r2(q.total - (pr ? pr.discount : 0)), tax: 0, brand: pay.brand, last4: pay.last4,
          status: 'paid', refundedOn: null, description: 'Green fees, ' + EN.longDate(st.date) + ' at ' + EN.time(st.time) + ' (' + Pub.plural(party.length, 'golfer') + ', ' + st.holes + ' holes)',
          lines: lines, promo: pr ? { promoId: pr.promoId, code: pr.code, discount: pr.discount } : null, players: party.length, holes: st.holes, teeDate: st.date, teeTime: st.time
        });
        if (pr && Club.promos) Club.promos.redeem(pr.promoId, { source: 'public', refId: payment.id, discount: pr.discount, publicPlayerId: p.id });
        if (pay.gift && Club.giftcards && payment.amount > 0) Club.giftcards.settleTeeTime(payment, pay.gift);
        try { Pub.ensureReceipts(payment); } catch (e) { console.error('Receipt failed for payment ' + payment.id, e); }
        return payment;   /* no card is saved: the payment keeps only the brand and last four digits */
      }

      /* ======================= Confirmation ======================= */
      /* Public simplified (Nov 21): a check mark, "You're booked", the day, time and players on one line, and two buttons.
         My booking opens this booking in My bookings (#/bookings/<tee time id>), where the calendar file, the receipt and
         cancelling are; Home starts again. */
      function renderConfirmed() {
        const p = Pub.me();
        const pay = S.find('publicPayments', st.confirmed);
        const tt = pay && S.find('teeTimes', pay.teeTimeId);
        if (!pay || !tt) { resetFlow(); paint(); return; }
        const n = p ? (tt.players || []).filter(function (x) { return x.publicPlayerId === p.id; }).length : (pay.players || 1);
        stage.innerHTML =
          '<div class="pub-done" role="status" aria-live="polite">' +
            '<span class="pub-done-check" aria-hidden="true">' + Club.icon('check') + '</span>' +
            '<h2 class="pub-done-h">You’re booked</h2>' +
            '<p class="pub-done-line"><span>' + esc(Pub.longDate(tt.date)) + '</span> · <span>' + esc(fmt.time(tt.time)) + '</span> · <span>' + esc(Pub.plural(n, 'player')) + '</span></p>' +
            '<div class="pub-done-acts">' +
              '<button type="button" class="btn btn-primary pub-done-btn" data-act="done-mine" data-id="' + esc(tt.id) + '" data-pay="' + esc(pay.id) + '">' + Club.icon('calendar') + '<span>My booking</span></button>' +
              '<button type="button" class="btn pub-done-btn" data-act="done-home">' + Club.icon('flag') + '<span>Home</span></button>' +
            '</div>' +
          '</div>';
      }
      ui.on(view, 'click', '[data-act=done-mine]', function (e, b) {
        const id = b.dataset.id, payId = b.dataset.pay;
        resetFlow();
        if (Pub.me()) { Pub.go('bookings/' + encodeURIComponent(id)); return; }
        /* No account signed in (signed out in another tab): the booking's details here. */
        paint();
        if (Pub.bookingDetails) Pub.bookingDetails(id, payId);
      });
      ui.on(view, 'click', '[data-act=done-home]', function () {
        resetFlow(); st.date = null;
        if (/^#?\/?$/.test(location.hash)) { paint(); window.scrollTo({ top: 0 }); } else location.hash = '#/';
      });

      /* Live updates: another tab took a time while this one shows the list. */
      Pub.onExternal = function () { if (st.step === 1 && !st.confirmed && !document.querySelector('.overlay')) paint(); };
      const offHolds = Club.holds ? Club.holds.subscribe(function () { if (Pub.onExternal) Pub.onExternal(); }) : null;

      paint();
      if (wanted) setTimeout(function () { const b = ui.$('#book', view); if (b) b.scrollIntoView({ block: 'start' }); }, 50);
      /* Leaving the page hides the countdown; the hold keeps running and coming back resumes it (or says it ended). */
      return function () { Pub.onExternal = null; clearTimeout(feeTimer); if (offHolds) offHolds(); if (holdTimer) { holdTimer.stop(); holdTimer = null; } };
    }
  });
})();
