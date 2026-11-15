/* Club.holds: a tee time is held for a few minutes while a golfer completes their booking (public site and members'
   portal), with a countdown card on screen. Holds live in their own localStorage key, not in the club data: they last
   minutes, every tab reads them fresh, and they never reach exports or reports.
   A hold: { id, owner, date, time, places, source: 'public'|'portal', createdAt, expiresAt (ms) }.
   `owner` is this page load, so two tabs of the same golfer hold separately and a reload frees the old hold.
   Availability (Pub.daySlots, the portal's daySlots and checkBooking) counts other people's held places as taken.
   Also Club.teeHeads(taken): the four-person head count drawn on the time cards. */
(function () {
  const KEY = 'stboniface.holds.v1';
  const MINUTES = 5;
  const owner = 'hold_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const listeners = [];
  let cache = null, cacheAt = 0, wake = null;

  function read() {
    if (cache && Date.now() - cacheAt < 1000) return cache;
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); cache = Array.isArray(a) ? a : []; } catch (e) { cache = []; }
    cacheAt = Date.now();
    return cache;
  }
  function write(list) {
    cache = list; cacheAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode: the hold lives in this tab only */ }
  }
  function notify() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  /** Live holds (expired ones are dropped). Wakes the page when someone else's hold runs out, so their time reappears. */
  function all() {
    const now = Date.now(), list = read();
    const live = list.filter(function (h) { return h && +h.expiresAt > now; });
    if (live.length !== list.length) write(live);
    clearTimeout(wake);
    const others = live.filter(function (h) { return h.owner !== owner; });
    if (others.length) {
      const next = Math.min.apply(null, others.map(function (h) { return +h.expiresAt; }));
      wake = setTimeout(function () { cache = null; all(); notify(); }, Math.max(250, next - now + 50));
    }
    return live;
  }
  function mine() { return all().find(function (h) { return h.owner === owner; }) || null; }
  /** Places other golfers are holding at this time right now. */
  function heldByOthers(date, time) {
    return all().reduce(function (a, h) { return a + (h.owner !== owner && h.date === date && h.time === time ? (+h.places || 0) : 0); }, 0);
  }
  /** Hold a time for this page (replaces any hold it had). o: { date, time, places, source } */
  function place(o) {
    const now = Date.now();
    const h = { id: 'hold_' + now.toString(36) + Math.random().toString(36).slice(2, 6), owner: owner, date: o.date, time: o.time,
      places: Math.max(1, Math.min(4, +o.places || 1)), source: o.source || 'public', createdAt: now, expiresAt: now + MINUTES * 60000 };
    write(all().filter(function (x) { return x.owner !== owner; }).concat([h]));
    return h;
  }
  function release() {
    const list = all(); const rest = list.filter(function (x) { return x.owner !== owner; });
    if (rest.length !== list.length) write(rest);
  }
  /** This page's hold on date/time, or null once it has run out or been released. */
  function holding(date, time) { const h = mine(); return h && h.date === date && h.time === time ? h : null; }
  function subscribe(fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  window.addEventListener('storage', function (e) { if (e.key === KEY) { cache = null; all(); notify(); } });
  /* Closing or leaving the page frees the time at once. Safari may keep the page and bring it back with the Back button
     (back/forward cache): the hold is then put back, with its original expiry, so the countdown on screen is still true. */
  let parked = null;
  window.addEventListener('pagehide', function () { parked = mine(); release(); });
  window.addEventListener('pageshow', function (e) {
    const h = parked; parked = null;
    if (!e.persisted || !h || +h.expiresAt <= Date.now()) return;
    write(all().filter(function (x) { return x.owner !== owner; }).concat([h])); notify();
  });

  /* ---------------- The countdown card ---------------- */
  let shown = null;
  function pad(n) { return String(n).padStart(2, '0'); }
  /**
   * Show "Time left to complete booking" for this page's hold. o: { hold, what: '2:30 PM', onExpire }
   * Counts from the stored expiry (not from ticks), so a throttled background tab is still right when it wakes.
   * Returns { stop }. Only one card shows at a time.
   */
  function timer(o) {
    stopTimer();
    const el = document.createElement('div');
    el.className = 'hold-timer';
    el.setAttribute('role', 'timer');
    el.innerHTML =
      '<div class="hold-timer-l">Time left to complete booking</div>' +
      '<div class="hold-timer-v" aria-hidden="true"><span class="hold-timer-u"><b class="hold-m">' + pad(MINUTES) + '</b><small>minutes</small></span>' +
        '<span class="hold-timer-u"><b class="hold-s">00</b><small>seconds</small></span></div>' +
      (o.what ? '<div class="hold-timer-w">Holding ' + Club.ui.esc(o.what) + '</div>' : '') +
      '<div class="hold-timer-bar"><i></i></div>' +
      '<span class="sr-only hold-timer-sr" aria-live="polite"></span>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-in'); });
    const m = el.querySelector('.hold-m'), s = el.querySelector('.hold-s'), bar = el.querySelector('.hold-timer-bar i'), sr = el.querySelector('.hold-timer-sr');
    let said = {}, iv = null;
    const t = { el: el, stop: function () { clearInterval(iv); el.classList.remove('is-in'); setTimeout(function () { el.remove(); }, 220); if (shown === t) shown = null; } };
    function tick() {
      const left = Math.max(0, +o.hold.expiresAt - Date.now()), sec = Math.ceil(left / 1000);
      m.textContent = pad(Math.floor(sec / 60)); s.textContent = pad(sec % 60);
      bar.style.transform = 'scaleX(' + (left / (MINUTES * 60000)).toFixed(4) + ')';
      el.setAttribute('aria-label', 'Time left to complete booking: ' + Math.floor(sec / 60) + ' minutes ' + (sec % 60) + ' seconds');
      el.classList.toggle('is-low', sec <= 60);
      if (sec === 0 && !said.end) { said.end = 1; t.stop(); release(); if (o.onExpire) o.onExpire(); return; }
      if (sec <= 60 && !said.low) { said.low = 1; sr.textContent = 'One minute left to complete your booking.'; }
    }
    iv = setInterval(tick, 250); tick();
    shown = t;
    return t;
  }
  function stopTimer() { if (shown) shown.stop(); }

  Club.holds = { MINUTES: MINUTES, KEY: KEY, all: all, mine: mine, holding: holding, heldByOthers: heldByOthers, place: place, release: release,
    subscribe: subscribe, timer: timer, stopTimer: stopTimer, owner: function () { return owner; } };

  /** The head count on a time card: four people, taken ones filled. Decorative; the card's text says the same. */
  Club.teeHeads = function (taken, cls) {
    taken = Math.max(0, Math.min(4, taken | 0));
    let h = '<span class="tee-heads' + (cls ? ' ' + cls : '') + '" aria-hidden="true">';
    for (let i = 0; i < 4; i++) h += '<span class="tee-head' + (i < taken ? ' is-taken' : '') + '">' + Club.icon('user') + '</span>';
    return h + '</span>';
  };
})();
