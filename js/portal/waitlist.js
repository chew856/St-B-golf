/* Portal: tee time waitlist (logic in js/core/waitlist.js, Club.waitlist).
   Portal.waitlist.noticesHTML(member)   -> notices for spots that opened (Home and Tee times), each with Book this time
   Portal.waitlist.listHTML(member)      -> the member's waitlist on My tee times, with Leave
   Portal.waitlist.open(member, { date, time, window, players, days }, onDone) -> "Notify me if a spot opens" sheet.
       time: a full tee time; otherwise the member chooses the part of the day. days: several full days to choose from.
   Portal.waitlist.wire(root, member, redraw) -> No thanks / Leave buttons inside root.
   Book links go to #/tee-times/<date>/<HH:MM>/<players>, which selects that time on the Book tab. */
(function () {
  const ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  function W() { return Club.waitlist; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function dayName(d) {
    const td = Club.date.today();
    if (d === td) return 'Today';
    if (d === Club.date.addDays(td, 1)) return 'Tomorrow';
    return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function shortDay(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function ordinal(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'); }
  function bookHref(e) { return '#/tee-times/' + e.date + '/' + e.offerTime + '/' + e.players; }
  function holdLine(e) {
    const until = e.holdUntil ? new Date(e.holdUntil) : null;
    if (until && until.getTime() > Date.now()) return 'You are the first to know until ' + fmt.time(String(until.getHours()).padStart(2, '0') + ':' + String(until.getMinutes()).padStart(2, '0')) + '.';
    return 'It is open to everyone, so book soon.';
  }
  function mine(m) { return W() ? W().forPerson({ memberId: m.id }) : []; }

  /* ---------------- Notices ---------------- */
  function noticesHTML(m) {
    const list = mine(m).filter(function (e) { return e.status === 'notified' && W().offerOpen(e); });
    if (!list.length) return '';
    return '<section class="wl-notices" aria-label="Waitlist">' + list.map(function (e) {
      return '<article class="wl-note" role="status">' +
        '<span class="wl-note-ic" aria-hidden="true">' + Club.icon('bell') + '</span>' +
        '<div class="wl-note-main"><p class="wl-note-k">A spot has opened</p>' +
          '<p class="wl-note-t">' + esc(dayName(e.date)) + ' at ' + esc(fmt.time(e.offerTime)) + '</p>' +
          '<p class="wl-note-s">' + esc(plural(e.players, 'player') + ' from your waitlist. ' + holdLine(e)) + '</p></div>' +
        '<div class="wl-note-acts"><a class="btn btn-primary btn-sm" href="' + esc(bookHref(e)) + '">Book this time</a>' +
          '<button type="button" class="p-link" data-wl-act="decline" data-id="' + esc(e.id) + '">No thanks</button></div>' +
      '</article>';
    }).join('') + '</section>';
  }

  /* ---------------- My tee times: the member's waitlist ---------------- */
  function listHTML(m) {
    const list = mine(m);
    if (!list.length) return '';
    return '<section class="tt-mine-sec wl-mine"><h2 class="tt-mine-h">Waitlist</h2><ul class="p-list wl-list">' + list.map(function (e) {
      const dt = fmt.toDate(e.date);
      const open = e.status === 'notified' && W().offerOpen(e);
      const pos = W().position(e);
      return '<li class="wl-row">' +
        '<span class="tt-row-date" aria-hidden="true"><span class="tt-rd-wk">' + esc(fmt.weekday(e.date)) + '</span><span class="tt-rd-n">' + dt.getDate() + '</span></span>' +
        '<span class="wl-row-main"><span class="wl-row-t">' + esc(shortDay(e.date) + ', ' + W().whenText(e)) + '</span>' +
          '<span class="wl-row-s">' + esc(plural(e.players, 'player')) + ' · ' + (open ? '<a href="' + esc(bookHref(e)) + '">Spot open at ' + esc(fmt.time(e.offerTime)) + '</a>' : esc(pos === 1 ? 'Next in line' : ordinal(pos) + ' in line')) + '</span></span>' +
        '<button type="button" class="btn btn-sm" data-wl-act="leave" data-id="' + esc(e.id) + '" aria-label="' + esc('Leave the waitlist for ' + shortDay(e.date)) + '">Leave</button>' +
      '</li>';
    }).join('') + '</ul><p class="tt-hint">We tell the first golfer in line as soon as a spot opens. Your notice shows on Home and here.</p></section>';
  }

  /* ---------------- Join sheet ---------------- */
  function open(m, o, onDone) {
    o = o || {};
    const days = (o.days || []).slice();
    const st = { date: o.date || days[0], time: o.time || null, window: o.window || 'any', players: Math.max(1, Math.min(4, +o.players || 1)) };
    const sh = Portal.openSheet({ title: 'Notify me if a spot opens',
      content: '<div class="wl-sheet"></div>',
      footer: '<button type="button" class="btn btn-primary tt-full" data-wl="ok">Notify me</button>' });
    function windowsHTML() {
      return '<div class="wl-field"><span class="pk-label" id="wl-win-l">Time of day</span><div class="wl-opts" role="group" aria-labelledby="wl-win-l">' + W().WINDOWS.map(function (w) {
        const ok = W().canWait({ date: st.date, window: w.id, memberId: m.id }, true);
        if (!ok && st.window === w.id) st.window = 'any';
        return '<button type="button" class="wl-opt' + (st.window === w.id ? ' active' : '') + '" data-win="' + w.id + '" aria-pressed="' + (st.window === w.id) + '"' + (ok ? '' : ' disabled') + '>' +
          '<span class="wl-opt-l">' + esc(w.label) + '</span><span class="wl-opt-s">' + esc(ok ? w.sub : 'Not in your play times') + '</span></button>';
      }).join('') + '</div></div>';
    }
    function draw() {
      const body = ui.$('.wl-sheet', sh.body);
      body.innerHTML =
        (days.length > 1 && !st.time ? '<div class="wl-field"><span class="pk-label" id="wl-day-l">Day</span><div class="wl-opts wl-days" role="group" aria-labelledby="wl-day-l">' + days.map(function (d) {
          return '<button type="button" class="wl-opt' + (d === st.date ? ' active' : '') + '" data-day="' + d + '" aria-pressed="' + (d === st.date) + '"><span class="wl-opt-l">' + esc(shortDay(d)) + '</span><span class="wl-opt-s">Fully booked</span></button>';
        }).join('') + '</div></div>'
          : '<div class="tt-sum"><span class="tt-sum-t">' + (st.time ? esc(fmt.time(st.time).split(' ')[0]) + '<small>' + esc(fmt.time(st.time).split(' ')[1]) + '</small>' : Club.icon('calendar')) + '</span><span class="tt-sum-d">' + esc(dayName(st.date)) + '<br>' + (st.time ? 'This tee time is full' : 'Fully booked') + '</span></div>') +
        (st.time ? '' : windowsHTML()) +
        '<div class="wl-field wl-players"></div>' +
        '<p class="tt-hint">We will let you know on Home and on Tee times as soon as a spot opens for your group. The first golfer on the list hears first and has ' + W().HOLD_MIN + ' minutes before the next golfer is told.</p>' +
        '<div class="tt-alert" role="alert" hidden></div>';
      Portal.stepper(ui.$('.wl-players', body), { label: 'Players', value: st.players, min: 1, max: 4, onChange: function (v) { st.players = v; } });
    }
    draw();
    ui.on(sh.body, 'click', '[data-day]', function (e, b) { st.date = b.dataset.day; draw(); const f = ui.$('[data-day="' + st.date + '"]', sh.body); if (f) f.focus(); });
    ui.on(sh.body, 'click', '[data-win]', function (e, b) {
      if (b.disabled) return; st.window = b.dataset.win;
      ui.$$('[data-win]', sh.body).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    });
    const okBtn = ui.$('[data-wl=ok]', sh.foot);
    okBtn.addEventListener('click', function () {
      const al = ui.$('.tt-alert', sh.body); al.hidden = true;
      const r = W().join({ date: st.date, time: st.time, window: st.window, players: st.players, memberId: m.id });
      if (!r.ok) {
        al.innerHTML = Club.icon('alert') + '<div><p>' + esc(r.msg) + '</p>' +
          (r.code === 'open' ? '<a class="btn btn-sm btn-primary" href="' + esc('#/tee-times/' + st.date + '/' + r.time + '/' + st.players) + '" data-wl="go">Book ' + esc(fmt.time(r.time)) + '</a>' : '') + '</div>';
        al.hidden = false; al.scrollIntoView({ block: 'nearest' });
        const go = ui.$('[data-wl=go]', al); if (go) go.addEventListener('click', function () { sh.close(); });
        return;
      }
      const e = r.entry;
      sh.setContent('<div class="tt-done" role="status"><span class="tt-done-ok">' + Club.icon('check') + '</span>' +
        '<h3 class="tt-done-h">You’re on the waitlist</h3>' +
        /* one piece per text node, so "Today", the time and the players each translate in French */
        '<p class="tt-done-d"><span>' + esc(dayName(e.date)) + '</span>, <span>' + esc(W().whenText(e)) + '</span> · <span>' + esc(plural(e.players, 'player')) + '</span></p>' +
        '<p class="tt-done-p">' + esc(W().position(e) === 1 ? 'You are next in line.' : 'You are ' + ordinal(W().position(e)) + ' in line.') + ' We will let you know on Home and on Tee times when a spot opens.</p></div>');
      sh.setFooter('<button type="button" class="btn btn-primary tt-full" data-wl="done">Done</button>');
      const doneAt = Date.now();   /* a double tap on Notify me must not also press Done */
      ui.$('[data-wl=done]', sh.foot).addEventListener('click', function () { if (Date.now() - doneAt > 600) sh.close(); });
      ui.$('[data-wl=done]', sh.foot).focus();
      ui.toast('You are on the waitlist for ' + shortDay(e.date));
      if (onDone) onDone(e);
    });
    return sh;
  }

  /* ---------------- Buttons inside a page ---------------- */
  function wire(root, m, redraw) {
    ui.on(root, 'click', '[data-wl-act=decline], [data-wl-act=leave]', function (e, b) {
      const doc = W() && W().remove(b.dataset.id, 'golfer'); if (!doc) { if (redraw) redraw(); return; }
      ui.toast('You have left the waitlist for ' + shortDay(doc.date));
      if (redraw) redraw();
    });
  }

  Portal.waitlist = { noticesHTML: noticesHTML, listHTML: listHTML, open: open, wire: wire };
})();
