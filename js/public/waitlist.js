/* Public booking site: tee time waitlist (logic in js/core/waitlist.js, Club.waitlist).
   A fully booked day offers "Notify me if a spot opens" (Pub.waitlist.buttonHTML in js/public/book.js). The golfer
   picks the part of the day and how many golfers; signing in first if needed. When a spot opens, a notice with a
   Book link shows on My bookings (Pub.waitlist.noticesHTML / listHTML in js/public/me.js) and on My account (below). */
(function () {
  'use strict';
  const ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  function W() { return Club.waitlist; }
  function ordinal(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'); }
  function shortDay(d) { return fmt.toDate(d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }).replace(/\./g, ''); }
  function bookHref(e) { return '#/book/' + e.date + '/' + e.offerTime; }
  function hm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function mine(p) { return W() && p ? W().forPerson({ publicPlayerId: p.id }) : []; }

  function buttonHTML(date) {
    return '<button type="button" class="btn btn-sm" data-act="wl-pub" data-date="' + esc(date) + '">' + Club.icon('bell') + '<span>Notify me if a spot opens</span></button>';
  }

  /* ---------------- Notices and the golfer's list ---------------- */
  function noticesHTML(p) {
    const list = mine(p).filter(function (e) { return e.status === 'notified' && W().offerOpen(e); });
    return list.map(function (e) {
      const until = e.holdUntil ? new Date(e.holdUntil) : null;
      const hold = until && until.getTime() > Date.now() ? 'You are the first to know until ' + fmt.time(hm(until)) + '.' : 'It is open to everyone, so book soon.';
      return '<article class="wl-note" role="status" data-reveal>' +
        '<span class="wl-note-ic" aria-hidden="true">' + Club.icon('bell') + '</span>' +
        '<div class="wl-note-main"><p class="wl-note-k">A spot has opened</p>' +
          '<p class="wl-note-t">' + esc(Pub.longDate(e.date)) + ' at ' + esc(fmt.time(e.offerTime)) + '</p>' +
          '<p class="wl-note-s">' + esc(Pub.plural(e.players, 'golfer') + ' from your waitlist. ' + hold) + '</p></div>' +
        '<div class="wl-note-acts"><a class="btn btn-primary btn-sm" href="' + esc(bookHref(e)) + '">Book this time</a>' +
          '<button type="button" class="pub-link" data-wl-act="leave" data-id="' + esc(e.id) + '">No thanks</button></div>' +
      '</article>';
    }).join('');
  }
  function rowsHTML(p) {
    return '<ul class="wl-list">' + mine(p).map(function (e) {
      const open = e.status === 'notified' && W().offerOpen(e);
      const pos = W().position(e);
      return '<li class="wl-row"><span class="wl-row-main"><span class="wl-row-t">' + esc(shortDay(e.date) + ', ' + W().whenText(e)) + '</span>' +
        '<span class="wl-row-s">' + esc(Pub.plural(e.players, 'golfer')) + ' · ' + (open ? '<a href="' + esc(bookHref(e)) + '">Spot open at ' + esc(fmt.time(e.offerTime)) + '</a>' : esc(pos === 1 ? 'Next in line' : ordinal(pos) + ' in line')) + '</span></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-wl-act="leave" data-id="' + esc(e.id) + '" aria-label="' + esc('Leave the waitlist for ' + shortDay(e.date)) + '">' + Club.icon('close') + '<span>Leave</span></button></li>';
    }).join('') + '</ul>';
  }
  /** My bookings: a Waitlist section ('' when the golfer is not waiting for anything). */
  function listHTML(p) {
    if (!mine(p).length) return '';
    return '<section class="pub-sec wl-sec"><div class="pub-sec-head"><h2>Waitlist</h2></div>' +
      '<div class="panel" data-reveal><div class="panel-body flush">' + rowsHTML(p) + '</div></div>' +
      '<p class="muted wl-fine">We tell the first golfer in line as soon as a spot opens. The notice shows here and on My account.</p></section>';
  }

  /* My account: the same notices and list in a panel. */
  Pub.addAccountSection({
    order: 5,
    html: function (p) {
      if (!mine(p).length) return '';
      return '<section class="panel wl-acc" data-reveal aria-labelledby="wl-acc-h"><div class="panel-head"><div><div class="eyebrow">Tee times</div><h3 id="wl-acc-h">Waitlist</h3></div>' + Club.icon('bell', 'pub-head-icon') + '</div>' +
        '<div class="panel-body">' + noticesHTML(p) + rowsHTML(p) + '</div></section>';
    }
  });

  /* ---------------- "Notify me if a spot opens" ---------------- */
  function open(date) {
    const st = { window: 'any', players: 1, doneAt: 0 };
    const m = ui.modal({ eyebrow: 'Waitlist', title: 'Notify me if a spot opens', body: '<div class="wl-pub"></div>' });
    m.el.classList.add('wl-modal');
    const host = ui.$('.wl-pub', m.body);
    function draw() {
      const p = Pub.me();
      if (!p) {
        host.innerHTML = '<p class="wl-lead">' + esc(Pub.longDate(date)) + ' is fully booked. Sign in or create an account so we can tell you when a spot opens.</p><div class="wl-auth"></div>';
        Pub.authForm(ui.$('.wl-auth', host), 'signin', function () { draw(); }, true);
        return;
      }
      const wins = W().WINDOWS.filter(function (w) { return W().canWait({ date: date, window: w.id, publicPlayerId: p.id }, true); });
      if (!wins.some(function (w) { return w.id === st.window; })) st.window = 'any';
      host.innerHTML =
        '<p class="wl-lead">' + esc(Pub.longDate(date)) + ' is fully booked. We will show a notice on My bookings and My account as soon as a spot opens.</p>' +
        '<div class="field"><label id="wl-win-l">Time of day</label><div class="wl-opts" role="group" aria-labelledby="wl-win-l">' + wins.map(function (w) {
          return '<button type="button" class="wl-opt' + (w.id === st.window ? ' active' : '') + '" data-win="' + w.id + '" aria-pressed="' + (w.id === st.window) + '"><span class="wl-opt-l">' + esc(w.label) + '</span><span class="wl-opt-s">' + esc(w.sub) + '</span></button>';
        }).join('') + '</div></div>' +
        '<div class="field"><label id="wl-n-l">Golfers</label><div class="segmented wl-n" role="group" aria-labelledby="wl-n-l">' + [1, 2, 3, 4].map(function (n) {
          return '<button type="button" data-value="' + n + '" class="' + (n === st.players ? 'active' : '') + '" aria-pressed="' + (n === st.players) + '">' + n + '</button>';
        }).join('') + '</div></div>' +
        '<p class="field-hint">The first golfer on the list hears first and has ' + W().HOLD_MIN + ' minutes before the next golfer is told. Each golfer pays the green fee when you book.</p>' +
        '<div class="pub-alert" role="alert" hidden></div>' +
        '<div class="wl-pub-acts"><button type="button" class="btn btn-ghost" data-wl="cancel">Cancel</button><button type="button" class="btn btn-primary" data-wl="ok">' + Club.icon('bell') + '<span>Notify me</span></button></div>';
    }
    ui.on(host, 'click', '[data-win]', function (e, b) {
      st.window = b.dataset.win;
      ui.$$('[data-win]', host).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    });
    ui.on(host, 'click', '.wl-n button', function (e, b) {
      st.players = +b.dataset.value;
      ui.$$('.wl-n button', host).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
    });
    /* A double tap on Notify me must not also press Done, which appears in its place. */
    ui.on(host, 'click', '[data-wl=cancel], [data-wl=close]', function (e) { if (Date.now() - st.doneAt < 600) { e.preventDefault(); return; } m.close(); });
    ui.on(host, 'click', '[data-wl=ok]', function () {
      const p = Pub.me(); if (!p) { draw(); return; }
      const al = ui.$('.pub-alert', host); al.hidden = true;
      const r = W().join({ date: date, window: st.window, players: st.players, publicPlayerId: p.id });
      if (!r.ok) {
        al.innerHTML = Club.icon('alert') + '<div><p>' + esc(r.msg) + '</p>' + (r.code === 'open' ? '<a class="btn btn-sm btn-primary" data-wl="close" href="' + esc('#/book/' + date + '/' + r.time) + '">Book ' + esc(fmt.time(r.time)) + '</a>' : '') + '</div>';
        al.hidden = false;
        return;
      }
      const pos = W().position(r.entry);
      st.doneAt = Date.now();
      host.style.minHeight = host.offsetHeight + 'px';   /* same size, so a second tap does not land on the backdrop */
      host.innerHTML = '<div class="wl-done" role="status"><span class="wl-done-ic">' + Club.icon('check') + '</span>' +
        '<h4>You are on the waitlist</h4><p>' + esc(Pub.longDate(date) + ', ' + W().whenText(r.entry) + ', ' + Pub.plural(r.entry.players, 'golfer') + '. ' + (pos === 1 ? 'You are next in line.' : 'You are ' + ordinal(pos) + ' in line.')) + '</p>' +
        '<div class="wl-pub-acts"><a class="btn btn-ghost" href="#/bookings" data-wl="close">My bookings</a><button type="button" class="btn btn-primary" data-wl="close">Done</button></div></div>';
      ui.toast('You are on the waitlist for ' + shortDay(date));
    });
    draw();
    return m;
  }

  /* Buttons anywhere on the public site: Notify me, No thanks and Leave. */
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('[data-act=wl-pub], [data-wl-act]');
    if (!t || !t.closest('#public')) return;
    if (t.dataset.act === 'wl-pub') { open(t.dataset.date); return; }
    const p = Pub.me(); const ent = Club.store.find(W().COLL, t.dataset.id);
    if (!p || !ent || ent.publicPlayerId !== p.id) return;
    const doc = W().remove(ent.id, 'golfer');
    if (doc) ui.toast('You have left the waitlist for ' + shortDay(doc.date));
    Pub.render();
  });

  Pub.waitlist = { buttonHTML: buttonHTML, noticesHTML: noticesHTML, listHTML: listHTML, open: open };
})();
