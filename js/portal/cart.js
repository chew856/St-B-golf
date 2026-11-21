/* Order to the course: the golfer's side of the beverage cart.
   Club.cartOrderView.mount(view, ctx) renders the ordering flow and the live status card; the members' portal page
   (#/cart, registered below) and the public site (js/public/cart.js) both use it with their own small kit adapters.
   All rules and writes go through Club.cart (js/shared/cart-data.js). Updates from other tabs arrive through
   Club.cart.onChange (store subscribe plus the storage event). */
(function () {
  'use strict';
  const ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const drafts = {};                    /* unsent order per golfer, kept across re-renders */
  const FINISHED_SHOW_MIN = 90;         /* delivered or cancelled orders stay on the status card this long */

  function C() { return Club.cart; }
  /** The client's dispatch banner says "2 in line", meaning everyone waiting for the cart. On golfer pages that read as the
      golfer's own place, so it is worded as orders waiting here; the golfer's own place is on their order card. */
  function golferBanner() {
    return Club.cart.banner().replace(/\bNo one in line\b/, 'No orders waiting').replace(/\b1 in line\b/, '1 order waiting').replace(/\b(\d+) in line\b/, '$1 orders waiting');
  }
  function hm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function draftFor(key) { return drafts[key] || (drafts[key] = { qty: {}, cat: null, hole: null, holeTouched: false, holeFrom: null, note: '', noteOpen: false, payment: 'account' }); }
  function draftItems(d) { return Object.keys(d.qty).filter(function (k) { return d.qty[k] > 0; }).map(function (k) { return { itemId: k, qty: d.qty[k] }; }); }
  /** Items that sold out (or left the menu) while in the golfer's draft come out of it; returns their names. */
  function purgeDraft(d) {
    const byId = {}; Club.cart.menu().forEach(function (m) { byId[m.id] = m; });
    const gone = [];
    Object.keys(d.qty).forEach(function (k) { if (d.qty[k] > 0 && (!byId[k] || byId[k].soldOut)) { gone.push(byId[k] ? byId[k].name : 'An item'); delete d.qty[k]; } });
    return gone;
  }
  /** "Charlotte W." for anyone but friends (the portal's rule); the public site always shortens. */
  function shortName(n) { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0) + '.' : p[0] || 'A golfer'; }
  function possessive(n) { return n + '’s'; }
  /** "Grouped with Charlotte W.’s order. The cart stops once for your group." */
  function groupNote(others, nameOf) {
    if (!others || !others.length) return '';
    const names = others.map(function (d) { return possessive(nameOf(d)); });
    const list = names.length < 2 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return 'Grouped with ' + list + (names.length < 2 ? ' order' : ' orders') + '. The cart stops once for your group.';
  }
  const LOC_WHY = 'The cart uses your location to find your group. It’s only used while your order is open.';
  const LOC_OK = 'stboniface.cart.locok.';   /* the golfer has seen the explanation once (per device) */
  function locExplained(key) { try { return localStorage.getItem(LOC_OK + key) === '1'; } catch (e) { return false; } }
  function setLocExplained(key) { try { localStorage.setItem(LOC_OK + key, '1'); } catch (e) { /* storage blocked */ } }
  const LOC_SHARED = 'Your location is shared with the cart while your order is open, so it can find your group. It’s only shared while this page is open in your browser. If you close it, the cart uses the last hole we know. It stops when your order is delivered or cancelled.';
  /* Location sharing while an order is open: mandatory, one watcher for the signed-in golfer on whichever page of the
     portal or public site is open (started at the bottom of this file and in js/public/cart.js). Each fix goes to
     Club.cart.gpsUpdate (on the premises and fresh only; the hole from Club.holes = the group's location). It stops when the order
     closes. If permission is revoked mid-order the order stays, the golfer sees a notice and "Still on hole N?" covers it. */
  const watcher = { golfer: null, id: null, state: null, listeners: [] };
  function watchState(key) { return watcher.golfer && Club.cart.golferKey(watcher.golfer) === key ? watcher.state : null; }
  function notifyWatch() { watcher.listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function syncWatch() {
    const gf = watcher.getGolfer ? watcher.getGolfer() : null;
    const o = gf && Club.cart && !Club.cart.isDemo(gf) ? Club.cart.openOrderFor(gf) : null;
    const want = !!o && !!navigator.geolocation && watcher.state !== 'lost';
    if (gf && watcher.golfer && Club.cart.golferKey(gf) !== Club.cart.golferKey(watcher.golfer)) stopWatch();
    watcher.golfer = gf;
    if (!o && watcher.state === 'lost') { watcher.state = null; notifyWatch(); }
    if (want && watcher.id == null) {
      watcher.state = 'sharing'; notifyWatch();
      watcher.id = navigator.geolocation.watchPosition(function (pos) {
        const cur = watcher.golfer ? Club.cart.openOrderFor(watcher.golfer) : null; if (!cur) { stopWatch(); return; }
        if (watcher.state !== 'sharing') { watcher.state = 'sharing'; notifyWatch(); }
        const r = Club.cart.gpsUpdate(cur.id, pos.coords.latitude, pos.coords.longitude, pos.timestamp || Date.now(), pos.coords.accuracy);
        if (r.node) watcher.lastNode = r.node;
        if (r.ok && !r.same) { ui.toast('The cart knows you’re on hole ' + r.hole + ' now'); notifyWatch(); }
      }, function (err) {
        if (err && err.code === 1) { stopWatch(); watcher.state = 'lost'; notifyWatch(); }
      }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 });
    } else if (!want && watcher.id != null) stopWatch();
  }
  function stopWatch() { if (watcher.id != null && navigator.geolocation) navigator.geolocation.clearWatch(watcher.id); watcher.id = null; watcher.lastNode = null; if (watcher.state === 'sharing') { watcher.state = null; notifyWatch(); } }
  /** Start following the signed-in golfer: getGolfer() -> { type, id, name, firstName } or null. */
  function startWatcher(getGolfer) {
    watcher.getGolfer = getGolfer;
    const kick = function () { setTimeout(syncWatch, 0); };
    if (Club.cart) Club.cart.onChange(kick);
    window.addEventListener('hashchange', kick);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (watcher.state === 'lost') watcher.state = null; kick(); } });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
  }
  /* The dispatch text was written for SMS; in the app the golfer replies with the button below it. */
  function appText(t) { return String(t || '').replace('Reply with your hole number.', 'Tap “I’ve moved” below.'); }

  /** ctx = { golfer: { type, id, name, firstName }, site: 'portal'|'public', bookHref, kit: { select(el, o), bar: { show(o), hide() }, pickHole(current, onPick) } } */
  function mount(view, ctx) {
    const cart = C();
    const g = ctx.golfer, key = cart.golferKey(g), d = draftFor(key);
    const member = g.type === 'member';
    if (!member) d.payment = 'cart';
    let off = null, tick = null, holeField = null, hc = null, lastLoc = null, locProblem = null;
    const demo = cart.isDemo(g);
    const nameOf = ctx.nameOf || function (doc) { return shortName(doc.name); };

    /* ---------- Location: required to order or call the cart (demo accounts skip it) ---------- */
    function locHTML() {
      if (demo) return '<p class="co-locnote">' + Club.icon('pin') + '<span>Demo: location check skipped</span></p>';
      if (!locProblem) return '';
      const off = locProblem === 'off-course';
      return '<section class="co-locpanel" role="alert" aria-labelledby="co-loc-h"><h2 id="co-loc-h" class="co-loc-t">' + (off ? 'You need to be at the club to order from the cart' : 'Turn on location to order') + '</h2>' +
        '<p class="co-loc-s">' + esc(off ? 'Your location shows you away from the club. Ordering and Call the cart work at the club.' : LOC_WHY) + '</p>' +
        (off ? '' : '<ul class="co-loc-how"><li>In your browser, allow location for this site when it asks, or in the site settings (the icon beside the address).</li>' +
          '<li>iPhone: Settings, Privacy and Security, Location Services: turn it on, and allow it for your browser.</li>' +
          '<li>Android: Settings, Location: turn it on, and allow it for your browser.</li></ul>') +
        '<button type="button" class="btn btn-primary co-loc-retry" data-act="loc-retry">Try again</button></section>';
    }
    function paintLoc() { const h = ui.$('.co-lochost', view); if (h) h.innerHTML = locHTML(); }
    function fromPos(pos) { return { shared: true, at: pos.timestamp || Date.now(), accuracy: pos.coords.accuracy, lat: pos.coords.latitude, lon: pos.coords.longitude }; }
    /** The hole the last fresh position puts the golfer on, or null. */
    function gpsHole() { return lastLoc && Date.now() - lastLoc.at < 90000 ? cart.holeFromLoc(g, lastLoc) : null; }
    /** Prefill the hole from the phone when location is already allowed (no prompt; the order still asks for a fresh fix). */
    function quietLocate() {
      if (demo || !navigator.geolocation || !navigator.permissions || !locExplained(key)) return;
      navigator.permissions.query({ name: 'geolocation' }).then(function (st) {
        if (st.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(function (pos) {
          if (!view.isConnected) return;
          lastLoc = fromPos(pos);
          const gh = gpsHole();
          if (!gh || d.holeTouched || cart.openOrderFor(g)) return;
          d.hole = gh; d.holeFrom = 'gps';
          if (holeField) holeField.set(gh);
          const h = ui.$('.co-where .co-hint', view); if (h) h.textContent = holeHint();
        }, function () {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      }).catch(function () {});
    }
    /** Calls next(loc) with a fresh position (or null for demo accounts). First use explains why, in a sheet. */
    function withLocation(next) {
      if (demo) { next(null); return; }
      if (lastLoc && Date.now() - lastLoc.at < 90000) { next(lastLoc); return; }
      if (!navigator.geolocation) { locProblem = 'unavailable'; paintLoc(); ui.toast('Location is not available on this device', 'bad'); return; }
      function ask() {
        navigator.geolocation.getCurrentPosition(function (pos) {
          lastLoc = fromPos(pos);
          locProblem = null; paintLoc(); next(lastLoc);
        }, function (err) {
          lastLoc = null; locProblem = err && err.code === 1 ? 'denied' : 'unavailable'; paintLoc();
          const p = ui.$('.co-locpanel', view); if (p) p.scrollIntoView({ block: 'center', behavior: 'smooth' });
          ui.toast(err && err.code === 1 ? 'Location is off, so we can’t place the order yet' : 'We couldn’t get your location. Please try again', 'bad');
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });   /* a fresh fix at order time, never a cached one from the drive in */
      }
      if (locExplained(key)) { ask(); return; }
      ctx.kit.sheet({ title: 'Share your location', confirmLabel: 'Share my location',
        body: '<div class="co-ed co-locask"><p class="co-ed-lead">' + esc(LOC_SHARED) + '</p><p class="co-ed-lead">Your phone will ask you to allow it.</p></div>',
        wire: function () {}, onConfirm: function () { setLocExplained(key); ask(); return true; } });
    }
    /** Once, at order time: location is shared while the order is open. */
    function tellShared() { const o = cart.openOrderFor(g); watcher.tellFor = o ? o.id : null; refreshStatus(); }
    /** After a refused order: re-ask, or explain that they must be at the club. */
    function locRefused(r) {
      if (r.offCourse) { locProblem = 'off-course'; lastLoc = null; paintLoc(); return true; }
      if (r.needLoc) { lastLoc = null; locProblem = 'unavailable'; paintLoc(); return true; }
      return false;
    }

    function shownOrder() {
      const o = cart.latestOrderFor(g); if (!o) return null;
      if (o.status === 'open') return o;
      const at = Date.parse(o.status === 'delivered' ? o.deliveredAt : o.cancelledAt) || o.placedAt;
      return Date.now() - at < FINISHED_SHOW_MIN * 60000 ? o : null;
    }

    /** How an order is (or was) paid, in the golfer's words. */
    function payText(o, done) {
      if (o.paidWith) return 'Paid by ' + o.paidWith;
      if (done && cart.isVisit(o) && !o.chargeId) return 'Nothing charged';
      if (o.payment === 'account') return done ? 'Charged to your account' : 'On your account';
      return done ? 'Paid at the cart' : 'Pay at the cart';
    }
    /** Call the cart: the choice above the menu, for golfers without an open order. */
    function callHTML() {
      return '<section class="co-call" aria-labelledby="co-call-h"><span class="co-call-ic" aria-hidden="true">' + Club.icon('cart') + '</span>' +
        '<div class="co-call-main"><h2 id="co-call-h" class="co-call-t">Call the cart to you</h2><p class="co-call-s">It comes to your hole. Choose from what’s on board.</p></div>' +
        '<button type="button" class="btn btn-primary co-call-btn" data-act="call">Call the cart</button></section>';
    }
    function statusHTML() {
      const o = shownOrder(); if (!o) return '';
      const st = cart.golferStatus(o.id); if (!st) return '';
      const ic = st.state === 'delivered' ? 'check' : st.state === 'cancelled' ? 'close' : 'cart';
      const visit = cart.isVisit(o);
      const eyebrow = st.state === 'delivered' ? (visit ? 'Cart visit done' : 'Delivered') : st.state === 'cancelled' ? (visit ? 'Cart visit cancelled' : 'Order cancelled') : st.state === 'heading' ? 'On the way' : (visit ? 'Your cart visit' : 'Your order');
      const pay = payText(o, st.state === 'delivered');
      const money = visit && !(st.state === 'delivered' && o.total > 0) ? '' : fmt.money(o.total) + ' · ';
      return '<section class="co-status is-' + st.state + '" aria-labelledby="co-st-h" aria-live="polite">' +
        '<div class="co-st-top"><span class="co-st-ic" aria-hidden="true">' + Club.icon(ic) + '</span><div class="co-st-head">' +
          '<p class="co-st-eyebrow">' + esc(eyebrow) + ' · placed ' + esc(fmt.time(hm(o.placedAt))) + '</p>' +
          '<h2 class="co-st-msg" id="co-st-h">' + esc(st.message) + '</h2></div></div>' +
        (st.text ? '<p class="co-st-text">' + esc(appText(st.text)) + '</p>' : '') +
        (st.group && st.group.length && (st.state === 'waiting' || st.state === 'heading') ? '<p class="co-st-group">' + Club.icon('members') + '<span>' + esc(groupNote(st.group, nameOf)) + '</span></p>' : '') +
        (hcFor(o, st) ? '<div class="co-hc" role="group" aria-labelledby="co-hc-q"><p class="co-hc-q" id="co-hc-q">Cart’s on its way. Still on hole ' + esc(hc.hole) + '?</p>' +
          '<div class="co-hc-btns"><button type="button" class="btn btn-sm co-hc-yes" data-act="hc-yes">Yes</button><button type="button" class="btn btn-sm" data-act="hc-change">Change hole</button></div></div>' : '') +
        '<p class="co-st-items">' + esc(cart.label(o)) + '</p>' +
        '<p class="co-st-meta"><span>' + esc(money) + esc(pay) + '</span>' + (st.state === 'waiting' || st.state === 'heading' ? '<span>Hole ' + esc(o.hole) + '</span>' : '') + '</p>' +
        (o.merges && (st.state === 'waiting' || st.state === 'heading') ? '<p class="co-st-note">Includes the items you added later.</p>' : '') +
        (cart.hasAlcohol(o.items) && st.state !== 'delivered' && st.state !== 'cancelled' ? '<p class="co-st-note">' + Club.icon('info') + ' ID may be checked for alcohol.</p>' : '') +
        (st.state === 'waiting' || st.state === 'heading' ? '<div class="co-st-acts"><button type="button" class="btn co-moved" data-act="moved">' + Club.icon('pin') + '<span>I’ve moved: I’m on hole …</span></button>' +
          (st.canCancel ? '<button type="button" class="btn co-edit" data-act="edit">' + Club.icon('edit') + '<span>' + (visit ? 'Edit note' : 'Edit order') + '</span></button>' +
            '<button type="button" class="' + (ctx.site === 'portal' ? 'p-link' : 'pub-link') + ' co-cancel" data-act="cancel">' + (visit ? 'Cancel visit' : 'Cancel order') + '</button>' : '') + '</div>' : '') +
        (!demo && (st.state === 'waiting' || st.state === 'heading') ? (watchState(key) === 'lost'
          ? '<p class="co-loclost" role="status">' + Club.icon('alert') + '<span>Location off: the cart is using hole ' + esc(o.hole) + '</span></p>'
          : (watcher.tellFor === o.id ? '<div class="co-shared" role="note"><p>' + esc(LOC_SHARED) + '</p><button type="button" class="' + (ctx.site === 'portal' ? 'p-link' : 'pub-link') + '" data-act="loc-ok">Got it</button></div>' : '') +
            '<p class="co-gps">' + Club.icon('pin') + '<span>Sharing your location while this page is open.</span></p>') : '') +
      '</section>';
    }
    /** "Still on hole N?" for this order: asked at most once every 10 minutes (Club.cart.holeCheck), and kept on the
        card for this visit to the page until answered. Never while the cart is heading to them. */
    function hcFor(o, st) {
      if (st.state !== 'waiting') return false;
      if (hc && hc.orderId === o.id && !hc.done) return true;
      if (hc && hc.orderId === o.id) return false;
      const q = cart.holeCheck(g); if (!q) return false;
      hc = q; cart.markHoleCheck(g); return true;
    }
    function itemsHTML() {
      const menu = cart.menu();
      const cats = cart.categories().filter(function (c) { return menu.some(function (m) { return m.category === c; }); });
      if (!d.cat || cats.indexOf(d.cat) < 0) d.cat = cats[0];
      const count = function (c) { return menu.filter(function (m) { return m.category === c; }).reduce(function (a, m) { return a + (d.qty[m.id] || 0); }, 0); };
      return '<div class="co-cats" role="tablist" aria-label="Menu categories">' + cats.map(function (c) {
          const n = count(c);
          return '<button type="button" role="tab" class="co-cat' + (c === d.cat ? ' active' : '') + '" aria-selected="' + (c === d.cat) + '" data-cat="' + esc(c) + '">' + esc(c) + (n ? ' <span class="co-cat-n">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<ul class="co-items" role="tabpanel" aria-label="' + esc(d.cat || 'Menu') + '">' + menu.filter(function (m) { return m.category === d.cat; }).map(function (m) {
          const q = d.qty[m.id] || 0;
          const ctl = m.soldOut ? '<span class="co-out">Sold out</span>'
            : q ? '<div class="co-step" role="group" aria-label="' + esc(m.name) + ' quantity"><button type="button" data-dec="' + esc(m.id) + '" aria-label="One fewer ' + esc(m.name) + '">' + '<span aria-hidden="true">−</span></button><output aria-live="polite">' + q + '</output><button type="button" data-inc="' + esc(m.id) + '" aria-label="One more ' + esc(m.name) + '"' + (q >= 20 ? ' disabled' : '') + '><span aria-hidden="true">+</span></button></div>'
            : '<button type="button" class="co-add" data-inc="' + esc(m.id) + '" aria-label="Add ' + esc(m.name) + '">' + Club.icon('plus') + '<span>Add</span></button>';
          return '<li class="co-item' + (m.soldOut ? ' is-out' : '') + (q ? ' is-in' : '') + '"><span class="co-item-main"><span class="co-item-n">' + esc(m.name) + '</span>' +
            '<span class="co-item-s">' + esc((m.size ? m.size + ' · ' : '') + fmt.money(m.price)) + '</span>' + (m.alcohol ? '<span class="co-item-s">ID may be checked</span>' : '') + '</span>' + ctl + '</li>';
        }).join('') + '</ul>';
    }

    function formHTML(open) {
      if (!open && !d.holeTouched) {
        const gh = gpsHole(), est = gh ? null : cart.estimateHole(cart.teeTimeToday(g));
        d.hole = gh || est; d.holeFrom = gh ? 'gps' : est ? 'tee' : null;
      }
      return (open ? '' :
        '<section class="co-sec co-where" aria-labelledby="co-where-h"><h2 id="co-where-h">Where are you?</h2>' +
          '<div class="co-where-grid"><div class="co-hole"></div></div>' +
          '<p class="co-hint">' + esc(holeHint()) + '</p>' +
        '</section>') +
      '<section class="co-sec co-notes">' + (d.noteOpen || d.note
        ? '<div class="field"><label for="co-note">Note for the cart (optional)</label><textarea class="textarea co-note" id="co-note" maxlength="200" rows="2" placeholder="e.g. No ice, please">' + esc(d.note) + '</textarea></div>'
        : '<button type="button" class="' + (ctx.site === 'portal' ? 'p-link' : 'pub-link') + ' co-addnote" data-act="note">' + Club.icon('edit') + '<span>Add a note for the cart</span></button>') + '</section>' +
      (open ? '<p class="co-hint co-merge-hint">' + Club.icon('info') + '<span>' + (cart.isVisit(open) ? 'Items you add here turn your cart visit into an order' : 'New items are added to your open order') + (open.payment === 'account' ? ', on your account.' : ', paid at the cart.') + '</span></p>'
        : member ? '<section class="co-sec co-paysec" aria-labelledby="co-pay-h"><h2 id="co-pay-h">Payment</h2><div class="co-pay" role="radiogroup" aria-labelledby="co-pay-h">' +
            payOpt('account', 'Add to my account', 'Charged when it’s delivered. Shows on your statement.') +
            payOpt('cart', 'Pay at the cart', 'Card or cash when it arrives.') + '</div></section>'
        : '<p class="co-hint co-merge-hint">' + Club.icon('cash') + '<span>You pay at the cart, by card or cash, when it arrives.</span></p>');
    }
    function payOpt(v, t, s) {
      return '<button type="button" role="radio" class="co-payopt' + (d.payment === v ? ' active' : '') + '" aria-checked="' + (d.payment === v) + '" data-pay="' + v + '"><span class="co-radio" aria-hidden="true"></span><span class="co-pay-main"><span class="co-pay-t">' + esc(t) + '</span><span class="co-pay-s">' + esc(s) + '</span></span></button>';
    }

    /** Earlier orders (any day), so a delivered or cancelled order can always be found again. */
    function historyHTML() {
      const shown = shownOrder(), live = shown && shown.status === 'open' ? shown : null;   /* only an order still in progress is left to the card */
      const list = cart.orders().filter(function (o) { return o.golferKey === key && (!live || o.id !== live.id); })
        .sort(function (a, b) { return b.placedAt - a.placedAt; }).slice(0, 10);
      if (!list.length) return '';
      const td = Club.date.today();
      const when = function (o) {
        const day = o.date === td ? 'Today' : o.date === Club.date.addDays(td, -1) ? 'Yesterday' : fmt.toDate(o.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return day + ', ' + fmt.time(hm(o.placedAt));
      };
      const state = function (o) {
        const v = cart.isVisit(o), money = v && !(o.status === 'delivered' && o.total > 0) ? '' : fmt.money(o.total) + ' · ';
        if (o.status === 'delivered') return { cls: 'is-done', t: (v ? 'Visited' : 'Delivered') + (o.deliveredAt ? ' at ' + fmt.time(hm(Date.parse(o.deliveredAt))) : ''), s: money + payText(o, true) };
        if (o.status === 'cancelled') return { cls: 'is-off', t: 'Cancelled', s: o.cancelNote || 'Nothing was charged.' };
        return { cls: 'is-open', t: 'Open', s: money + payText(o, false) };
      };
      return '<details class="co-sec co-history"' + (live ? '' : ' open') + '><summary><span class="co-hist-h">Your orders</span><span class="co-hist-n">' + list.length + (list.length === 1 ? ' order' : ' orders') + '</span></summary>' +
        '<ul class="co-hist">' + list.map(function (o) {
          const st = state(o);
          /* A delivered order's receipt (the account charge's, or the one staff made at the cart); Club.receipts is on all three sites */
          const rc = o.status === 'delivered' && Club.receipts ? Club.receipts.forRef('cart', o.id)[0] : null;
          return '<li class="co-hist-row ' + st.cls + '"><div class="co-hist-top"><span class="co-hist-when">' + esc(when(o)) + '</span><span class="co-hist-pill">' + esc(st.t) + '</span></div>' +
            '<p class="co-hist-items">' + esc(cart.label(o)) + '</p>' +
            '<div class="co-hist-foot"><p class="co-hist-meta">' + esc(st.s) + '</p>' +
            (rc ? '<button type="button" class="co-hist-rc" data-co-receipt="' + esc(rc.id) + '">' + Club.icon('billing') + '<span>Receipt</span></button>' : '') + '</div></li>';
        }).join('') + '</ul></details>';
    }

    function render() {
      const el = cart.eligibility(g);
      const open = cart.openOrderFor(g);
      const service = cart.serviceOpen();
      let body;
      if (!el.ok && !open) {
        body = '<div class="co-empty panel">' + ui.empty({ icon: 'cart', title: el.reason === 'no-tee' ? 'No round today' : el.reason === 'done' ? 'Your round is complete' : 'Not quite yet', text: el.text,
          action: el.reason === 'no-tee' && ctx.bookHref ? '<a class="btn btn-primary" href="' + esc(ctx.bookHref) + '">' + Club.icon('flag') + '<span>Book a tee time</span></a>' : '' }) + '</div>';
      } else if (!service) {
        body = '<div class="co-empty panel">' + ui.empty({ icon: 'cart', title: 'Cart service is closed right now', text: open ? 'Your order is still listed above.' : 'The beverage cart is not out on the course at the moment. Please check back soon.' }) + '</div>';
      } else {
        body = '<div class="co-cols"><section class="co-sec co-menu" aria-labelledby="co-menu-h"><h2 id="co-menu-h">' + (open ? 'Add to your order' : 'Menu') + '</h2><div class="co-itemsbox">' + itemsHTML() + '</div></section>' +
          '<div class="co-side">' + formHTML(open) + '</div></div>';
      }
      view.innerHTML = '<div class="co co-' + ctx.site + '">' +
        '<header class="co-head ' + (ctx.site === 'portal' ? 'p-hero' : '') + '"><h1>Order to the course</h1>' +
          '<p class="co-banner' + (service ? '' : ' is-closed') + '">' + (service ? '<span class="co-live" aria-hidden="true"></span>' : '') + '<span class="co-banner-t">' + esc(golferBanner()) + '</span></p></header>' +
        '<div class="co-statushost">' + statusHTML() + '</div>' + '<div class="co-lochost">' + (el.ok && service ? locHTML() : '') + '</div>' + '<div class="co-callhost">' + (el.ok && service && !open ? callHTML() : '') + '</div>' + body + '<div class="co-histhost">' + historyHTML() + '</div></div>';
      const hole = ui.$('.co-hole', view);
      if (hole) {
        holeField = ctx.kit.select(hole, { label: 'Hole', title: 'Which hole are you on?', value: d.hole, placeholder: 'Choose hole',
          rows: Array.from({ length: 18 }, function (_, i) { return { value: i + 1, label: 'Hole ' + (i + 1) }; }),
          onChange: function (v) { d.hole = +v || null; d.holeTouched = true; clearErr(); const h = ui.$('.co-where .co-hint', view); if (h) h.textContent = 'Choose the hole you’re on so the cart can find you.'; } });
      } else holeField = null;
      bar();
    }
    /** The hint under the hole box: where the prefilled hole came from. */
    function holeHint() {
      const tt = cart.teeTimeToday(g);
      if (d.hole && !d.holeTouched && d.holeFrom === 'gps') return 'From your location. Change it if that’s wrong.';
      if (d.hole && !d.holeTouched && tt) return teeHint(tt, d.hole);
      return 'Choose the hole you’re on so the cart can find you.';
    }
    /** "You teed off at 8:00 AM, so you’re probably on hole 4 by now." (the time the estimate counts from) */
    function teeHint(tt, hole) {
      return 'You teed off' + (cart.startTeeOf(tt) === 10 ? ' on the 10th tee' : '') + ' at ' + fmt.time(cart.teedOffAt(tt)) + ', so probably on hole ' + hole + '. Change it if not.';
    }
    function clearErr() { ui.$$('.co-where .field-error', view).forEach(function (n) { n.remove(); }); }

    function bar() {
      const items = draftItems(d);
      const open = cart.openOrderFor(g);
      if (!items.length || !cart.serviceOpen() || (!open && !cart.eligibility(g).ok)) { ctx.kit.bar.hide(); return; }
      const byId = {}; cart.menu().forEach(function (m) { byId[m.id] = m; });
      const n = items.reduce(function (a, l) { return a + l.qty; }, 0);
      const total = items.reduce(function (a, l) { return a + l.qty * ((byId[l.itemId] || {}).price || 0); }, 0);
      ctx.kit.bar.show({ summary: plural(n, 'item') + ' · ' + fmt.money(total), label: open ? 'Add to order' : 'Place order', onClick: submit });
    }

    function refreshItems() { const box = ui.$('.co-itemsbox', view); if (box) box.innerHTML = itemsHTML(); bar(); }
    function refreshStatus() {
      const host = ui.$('.co-statushost', view); if (!host) return;
      const had = !!cart.openOrderFor(g);
      host.innerHTML = statusHTML();
      const hh = ui.$('.co-histhost', view);
      if (hh) { const was = ui.$('details', hh); const keep = was ? was.open : null; hh.innerHTML = historyHTML(); const now = ui.$('details', hh); if (now && keep != null) now.open = keep; }
      const b = ui.$('.co-banner-t', view); if (b) b.textContent = golferBanner();
      return had;
    }

    function submit() {
      const items = draftItems(d);
      const open = cart.openOrderFor(g);
      const noteEl = ui.$('#co-note', view); if (noteEl) d.note = noteEl.value;
      if (!open && !(d.hole >= 1) && (demo || d.holeTouched)) { holeErr(); return; }
      withLocation(function (loc) {
        /* Not chosen by hand: the phone's hole replaces the estimate. */
        if (!open && !d.holeTouched) { const gh = cart.holeFromLoc(g, loc); if (gh) { d.hole = gh; d.holeFrom = 'gps'; } }
        if (!open && !(d.hole >= 1)) { holeErr(); return; }
        place(items, loc);
      });
    }
    function holeErr() {
      clearErr();
      const h = ui.$('.co-hole', view);
      if (h) { h.insertAdjacentHTML('beforeend', '<span class="field-error" role="alert">Choose the hole you’re on.</span>'); h.scrollIntoView({ block: 'center', behavior: 'smooth' }); const btn = ui.$('button, select', h); if (btn) btn.focus({ preventScroll: true }); }
      ui.toast('Choose the hole you’re on', 'bad');
    }
    function place(items, loc) {
      const r = cart.placeOrder({ golfer: g, items: items, hole: d.hole, holePicked: !!d.holeTouched, note: d.note, payment: d.payment, loc: loc });
      if (!r.ok) { if (locRefused(r)) { ui.toast(r.error, 'bad'); return; } ui.toast(r.error, 'bad'); render(); return; }
      d.qty = {}; d.note = ''; d.noteOpen = false; d.holeTouched = false; d.holeFrom = null;
      ctx.kit.bar.hide();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      ui.toast(r.fromVisit ? 'Added to your cart visit, which is now an order' : r.merged ? 'Added to your open order' : 'Your order is in. ' + (cart.golferStatus(r.doc.id) || {}).message);
      if (!demo && !r.merged) tellShared();
      syncWatch();
    }

    /* ---------- events ---------- */
    ui.on(view, 'click', '[data-co-receipt]', function (e, b) { Club.receipts.open(b.dataset.coReceipt); });
    ui.on(view, 'click', '[data-cat]', function (e, b) { d.cat = b.dataset.cat; refreshItems(); const t = ui.$('.co-cat.active', view); if (t) t.focus(); });
    ui.on(view, 'keydown', '.co-cat', function (e, b) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = ui.$$('.co-cat', view), i = all.indexOf(b), n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      e.preventDefault(); if (n) n.click();
    });
    ui.on(view, 'click', '[data-inc]', function (e, b) {
      const id = b.dataset.inc; const m = cart.menu().find(function (x) { return x.id === id; });
      if (!m || m.soldOut) { ui.toast('Sorry, that has just sold out', 'bad'); refreshItems(); return; }
      d.qty[id] = Math.min(20, (d.qty[id] || 0) + 1); refreshItems();
      const nb = ui.$('[data-inc="' + id + '"]', view); if (nb) nb.focus();
    });
    ui.on(view, 'click', '[data-dec]', function (e, b) {
      const id = b.dataset.dec; d.qty[id] = Math.max(0, (d.qty[id] || 0) - 1); refreshItems();
      const nb = ui.$('[data-dec="' + id + '"]', view) || ui.$('[data-inc="' + id + '"]', view); if (nb) nb.focus();
    });
    ui.on(view, 'click', '[data-pay]', function (e, b) {
      d.payment = b.dataset.pay;
      ui.$$('[data-pay]', view).forEach(function (x) { const a = x === b; x.classList.toggle('active', a); x.setAttribute('aria-checked', a); });
    });
    ui.on(view, 'click', '[data-act=note]', function () { d.noteOpen = true; const s = ui.$('.co-notes', view); if (s) { s.innerHTML = '<div class="field"><label for="co-note">Note for the cart (optional)</label><textarea class="textarea co-note" id="co-note" maxlength="200" rows="2" placeholder="e.g. No ice, please"></textarea></div>'; ui.$('#co-note', s).focus(); } });
    ui.on(view, 'input', '#co-note', function (e, t) { d.note = t.value; });
    ui.on(view, 'click', '[data-act=moved]', function () {
      const o = cart.openOrderFor(g); if (!o) { refreshStatus(); return; }
      ctx.kit.pickHole(o.hole, function (h) {
        const r = cart.moveGolfer(o.id, h, watcher.lastNode || gpsHole());
        if (!r.ok) { ui.toast(r.error, 'bad'); return; }
        const st = cart.golferStatus(o.id);
        if (hc) hc.done = true;
        ui.toast('Thanks. ' + (st && st.cartName ? st.cartName + ' knows' : 'The cart knows') + (r.moved > 1 ? ' your group is' : ' you’re') + ' on hole ' + h);
        refreshStatus();
      });
    });
    ui.on(view, 'click', '[data-act=hc-yes]', function () {
      const o = cart.openOrderFor(g); if (!o) { refreshStatus(); return; }
      const r = cart.confirmHole(o.id);
      if (hc) hc.done = true;
      ui.toast(r.ok ? 'Thanks. The cart knows you’re on hole ' + r.hole : r.error, r.ok ? undefined : 'bad');
      refreshStatus();
    });
    ui.on(view, 'click', '[data-act=hc-change]', function () { const m = ui.$('[data-act=moved]', view); if (m) m.click(); });
    /* Edit order: change quantities (0 removes a line) and the note until the cart heads to the golfer. */
    ui.on(view, 'click', '[data-act=edit]', function () {
      const o = cart.openOrderFor(g); if (!o) { refreshStatus(); return; }
      if (cart.isVisit(o)) {
        let vnote = o.note || '';
        ctx.kit.sheet({ title: 'Edit your note', confirmLabel: 'Save note',
          body: '<div class="co-ed"><p class="co-ed-lead">A cart visit has nothing to change but the note. To order specific items, use the menu.</p>' +
            '<div class="field"><label for="co-vn">Note for the cart (optional)</label><textarea class="textarea" id="co-vn" maxlength="200" rows="2" placeholder="e.g. 4 of us, mostly beer">' + esc(vnote) + '</textarea></div></div>',
          wire: function (root) { ui.on(root, 'input', '#co-vn', function (e, t) { vnote = t.value; }); },
          onConfirm: function () {
            const r = cart.editByGolfer(o.id, null, vnote);
            if (!r.ok) { ui.toast(r.error, 'bad'); refreshStatus(); return true; }
            ui.toast(r.unchanged ? 'No changes to save' : 'Your note is updated'); refreshStatus(); return true;
          } });
        return;
      }
      const lines = (o.items || []).map(function (it) { return { itemId: it.itemId, name: it.name, size: it.size || '', price: +it.price, qty: +it.qty, alcohol: !!it.alcohol }; });
      let noteVal = o.note || '';
      const soldOut = {}; cart.menu().forEach(function (m) { if (m.soldOut) soldOut[m.id] = 1; });
      function rows() {
        return '<ul class="co-ed-list">' + lines.map(function (l, i) {
          const max = soldOut[l.itemId] ? (o.items[i] || {}).qty : 20;
          return '<li class="co-ed-row' + (l.qty ? '' : ' is-gone') + '"><span class="co-item-main"><span class="co-item-n">' + esc(l.name) + '</span><span class="co-item-s">' +
            esc(l.qty ? (l.size ? l.size + ' · ' : '') + fmt.money(l.price) + ' each' : 'Removed') + (soldOut[l.itemId] ? ' · Sold out, can’t add more' : '') + '</span></span>' +
            '<div class="co-step" role="group" aria-label="' + esc(l.name) + ' quantity"><button type="button" data-edec="' + i + '" aria-label="One fewer ' + esc(l.name) + '"' + (l.qty ? '' : ' disabled') + '><span aria-hidden="true">−</span></button>' +
            '<output aria-live="polite">' + l.qty + '</output><button type="button" data-einc="' + i + '" aria-label="One more ' + esc(l.name) + '"' + (l.qty >= max ? ' disabled' : '') + '><span aria-hidden="true">+</span></button></div></li>';
        }).join('') + '</ul>';
      }
      function totals() {
        const n = lines.reduce(function (a, l) { return a + l.qty; }, 0), t = lines.reduce(function (a, l) { return a + l.qty * l.price; }, 0);
        return n ? plural(n, 'item') + ' · ' + fmt.money(t) : 'Nothing left on the order';
      }
      const body = '<div class="co-ed"><p class="co-ed-lead">Change what you ordered before the cart heads your way. To add something new, use the menu.</p>' +
        '<div class="co-ed-host">' + rows() + '</div><p class="co-ed-total" aria-live="polite">' + esc(totals()) + '</p>' +
        '<div class="field"><label for="co-ed-note">Note for the cart (optional)</label><textarea class="textarea" id="co-ed-note" maxlength="200" rows="2" placeholder="e.g. No ice, please">' + esc(noteVal) + '</textarea></div></div>';
      ctx.kit.sheet({
        title: 'Edit your order', body: body, confirmLabel: 'Save changes',
        wire: function (root, setConfirm) {
          function redraw() {
            ui.$('.co-ed-host', root).innerHTML = rows(); ui.$('.co-ed-total', root).textContent = totals();
            setConfirm(lines.some(function (l) { return l.qty; }) ? 'Save changes' : 'Cancel order');
          }
          ui.on(root, 'click', '[data-einc]', function (e, b) { const l = lines[+b.dataset.einc]; if (l.qty < 20) { l.qty++; redraw(); } });
          ui.on(root, 'click', '[data-edec]', function (e, b) { const l = lines[+b.dataset.edec]; if (l.qty > 0) { l.qty--; redraw(); } });
          ui.on(root, 'input', '#co-ed-note', function (e, t) { noteVal = t.value; });
        },
        onConfirm: function () {
          const r = cart.editByGolfer(o.id, lines, noteVal);
          if (!r.ok) { ui.toast(r.error, 'bad'); refreshStatus(); return true; }
          ui.toast(r.cancelled ? 'Your order is cancelled' : r.unchanged ? 'No changes to save' : 'Your order is updated');
          render(); return true;
        }
      });
    });
    ui.on(view, 'click', '[data-act=cancel]', function () {
      const o = cart.openOrderFor(g); if (!o) return;
      const v = cart.isVisit(o);
      ui.confirm({ title: v ? 'Cancel your cart visit?' : 'Cancel your order?', text: (v ? 'The cart won’t come by for this visit' : cart.itemsText(o.items)) + '. Nothing has been charged.', confirmLabel: v ? 'Cancel visit' : 'Cancel order', danger: true }).then(function (ok) {
        if (!ok) return;
        const r = cart.cancelByGolfer(o.id);
        if (!r.ok) { ui.toast(r.error, 'bad'); refreshStatus(); return; }
        ui.toast(v ? 'Your cart visit is cancelled' : 'Your order is cancelled'); render();
      });
    });
    /* Call the cart: hole (same estimate as orders), optional note, payment for members. */
    ui.on(view, 'click', '[data-act=loc-ok]', function () { watcher.tellFor = null; refreshStatus(); });
    ui.on(view, 'click', '[data-act=loc-retry]', function () { locProblem = null; lastLoc = null; paintLoc(); withLocation(function () { ui.toast('Thanks, location is on. You can order now'); }); });
    ui.on(view, 'click', '[data-act=call]', function () {
      if (cart.openOrderFor(g)) { render(); return; }
      withLocation(function (loc) { openCall(loc); });
    });
    function openCall(callLoc) {
      const tt = cart.teeTimeToday(g);
      /* The hole picked on the order form, else the phone's hole, else the tee-time estimate. */
      const own = d.holeTouched && d.hole ? d.hole : null, gh = own ? null : cart.holeFromLoc(g, callLoc), est = own || gh ? null : cart.estimateHole(tt);
      let hole = own || gh || est, picked = !!own, cnote = '', cpay = member ? d.payment : 'cart', croot = null;
      const body = '<div class="co-callsheet"><div class="co-call-hole"></div>' +
        '<p class="co-hint co-call-hint">' + (gh ? 'From your location. Change it if that’s wrong.' : est && tt ? esc(teeHint(tt, est)) : 'Choose the hole you’re on so the cart can find you.') + '</p>' +
        '<div class="field"><label for="co-call-note">Note for the cart (optional)</label><textarea class="textarea" id="co-call-note" maxlength="200" rows="2" placeholder="e.g. 4 of us, mostly beer"></textarea></div>' +
        (member ? '<div class="co-sec"><p class="co-label" id="co-cpay-l">Payment</p><div class="co-pay" role="radiogroup" aria-labelledby="co-cpay-l">' +
            ['account', 'cart'].map(function (v) { return '<button type="button" role="radio" class="co-payopt' + (cpay === v ? ' active' : '') + '" aria-checked="' + (cpay === v) + '" data-cpay="' + v + '"><span class="co-radio" aria-hidden="true"></span><span class="co-pay-main"><span class="co-pay-t">' + (v === 'account' ? 'Add to my account' : 'Pay at the cart') + '</span><span class="co-pay-s">' + (v === 'account' ? 'Whatever you choose is charged to your account.' : 'Card or cash at the cart.') + '</span></span></button>'; }).join('') + '</div></div>'
          : '<p class="co-hint">' + Club.icon('cash') + '<span>You pay at the cart, by card or cash.</span></p>') + '</div>';
      ctx.kit.sheet({ title: 'Call the cart', confirmLabel: 'Call the cart', body: body,
        wire: function (root) {
          croot = root;
          ctx.kit.select(ui.$('.co-call-hole', root), { label: 'Where are you?', title: 'Which hole are you on?', value: hole, placeholder: 'Choose hole',
            rows: Array.from({ length: 18 }, function (_, i) { return { value: i + 1, label: 'Hole ' + (i + 1) }; }),
            onChange: function (v) { hole = +v || null; picked = true; const er = ui.$('.co-call-hole .field-error', root); if (er) er.remove(); } });
          ui.on(root, 'input', '#co-call-note', function (e, t) { cnote = t.value; });
          ui.on(root, 'click', '[data-cpay]', function (e, b) { cpay = b.dataset.cpay; ui.$$('[data-cpay]', root).forEach(function (x) { const a = x === b; x.classList.toggle('active', a); x.setAttribute('aria-checked', a); }); });
        },
        onConfirm: function () {
          if (!(hole >= 1)) {
            const h = croot && ui.$('.co-call-hole', croot);
            if (h && !ui.$('.field-error', h)) h.insertAdjacentHTML('beforeend', '<span class="field-error" role="alert">Choose the hole you’re on.</span>');
            ui.toast('Choose the hole you’re on', 'bad'); return false;
          }
          const r = cart.callCart({ golfer: g, hole: hole, holePicked: picked, note: cnote, payment: cpay, loc: callLoc });
          if (!r.ok) { ui.toast(r.error, 'bad'); if (!locRefused(r)) render(); return true; }
          if (member) d.payment = cpay;
          render(); window.scrollTo({ top: 0, behavior: 'smooth' });
          ui.toast('The cart is coming to you. ' + (cart.golferStatus(r.doc.id) || {}).message);
          if (!demo) tellShared();
          syncWatch();
          return true;
        } });
    }

    /* ---------- live updates (this tab and others) ---------- */
    let sig = null, dataTimer = null;
    function signature() { return [cart.serviceOpen(), !!cart.openOrderFor(g), cart.eligibility(g).ok, cart.menu().map(function (m) { return m.id + (m.soldOut ? 1 : 0); }).join()].join('|'); }
    function onData() {
      const gone = purgeDraft(d);
      if (gone.length) ui.toast(gone.join(', ') + (gone.length === 1 ? ' has' : ' have') + ' just sold out and came off your order', 'bad');
      const now = signature();
      if (now !== sig) { sig = now; const ae = document.activeElement; const inNote = ae && ae.id === 'co-note'; if (!inNote) { render(); return; } }
      refreshStatus();
    }
    purgeDraft(d); render(); sig = signature(); quietLocate();
    const onWatch = function () { refreshStatus(); }; watcher.listeners.push(onWatch);
    off = cart.onChange(function () { clearTimeout(dataTimer); dataTimer = setTimeout(onData, 60); });
    tick = setInterval(function () { refreshStatus(); }, 20000);
    return function () { if (off) off(); clearInterval(tick); clearTimeout(dataTimer); ctx.kit.bar.hide(); watcher.listeners = watcher.listeners.filter(function (f) { return f !== onWatch; }); };
  }

  Club.cartOrderView = { mount: mount, appText: appText, shortName: shortName, startWatcher: startWatcher, watchState: function () { return watcher.state; } };

  /* ======================= Members' portal ======================= */
  if (!window.Portal || !Portal.register) return;
  function memberGolfer(m) { return { type: 'member', id: m.id, name: m.firstName + ' ' + m.lastName, firstName: m.firstName }; }
  const portalKit = {
    select: function (el, o) { return Portal.selectField(el, o); },
    /** o = { title, body (html), confirmLabel, wire(root, setConfirm(label)), onConfirm() -> true closes } */
    sheet: function (o) {
      const sh = Portal.openSheet({ title: o.title, content: o.body, footer: '<button type="button" class="btn btn-primary tt-full co-ed-ok">' + ui.esc(o.confirmLabel) + '</button>' });
      if (sh.duplicate) return;
      const btn = ui.$('.co-ed-ok', sh.foot);
      o.wire(sh.body, function (label) { btn.textContent = label; btn.classList.toggle('btn-danger', label === 'Cancel order'); btn.classList.toggle('btn-primary', label !== 'Cancel order'); });
      btn.addEventListener('click', function () { if (o.onConfirm() !== false) sh.close(); });
    },
    bar: { show: function (o) { Portal.actionBar.show(o); }, hide: function () { Portal.actionBar.hide(); } },
    pickHole: function (current, onPick) {
      Portal.openSheet({ title: 'Which hole are you on now?', selected: current, rows: Array.from({ length: 18 }, function (_, i) { return { value: i + 1, label: 'Hole ' + (i + 1), sub: i + 1 === +current ? 'Where the cart expects you' : '' }; }), onPick: function (v) { onPick(+v); } });
    }
  };
  startWatcher(function () { const m = Portal.member(); return m ? memberGolfer(m) : null; });
  Portal.register({
    id: 'cart', label: 'Order to the course', short: 'Order', icon: 'cart', order: 12, tab: false, nav: false,
    render: function (view, params, member) {
      const m = Portal.member() || member;
      return mount(view, { golfer: memberGolfer(m), site: 'portal', bookHref: '#/tee-times', kit: portalKit,
        nameOf: function (d) { return Portal.playerLabel ? Portal.playerLabel({ memberId: d.memberId, name: d.name, type: d.golferType === 'public' ? 'public' : 'member' }, m.id) : shortName(d.name); } });
    }
  });
  /** Home: a highlighted fifth quick action when the member plays today and the cart is out (or an order is open). */
  Portal.cartAction = function (m) {
    if (!Club.cart || !m) return '';
    const g = memberGolfer(m), open = Club.cart.openOrderFor(g);
    if (!open && !(Club.cart.eligibility(g).ok && Club.cart.serviceOpen())) return '';
    const st = open ? Club.cart.golferStatus(open.id) : null;
    const aria = open ? (Club.cart.isVisit(open) ? 'Your cart visit: ' : 'Your cart order: ') + st.message : 'Order or call the cart. ' + golferBanner();
    return '<a class="hm-action co-action" href="#/cart" aria-label="' + esc(aria) + '"><span class="hm-action-ic">' + Club.icon('cart') + (open ? '<span class="co-action-dot" aria-hidden="true"></span>' : '') + '</span>' +
      '<span class="hm-action-l">' + (open ? (Club.cart.isVisit(open) ? 'Cart visit' : 'My order') : 'Order') + '</span><span class="co-action-s">' + esc(open ? st.message : 'Order or call the cart') + '</span></a>';
  };
  /** Home: the compact "Still on hole N?" check, pinned above the bottom nav so Home keeps its length. */
  Portal.cartHoleCheck = function (view, m) {
    if (!Club.cart || !m || !view) return;
    const g = memberGolfer(m), q = Club.cart.holeCheck(g); if (!q) return;
    Club.cart.markHoleCheck(g);
    const el = ui.el('<div class="co-hcbar" role="region" aria-label="Cart order"><p class="co-hc-q">Cart’s on its way. Still on hole ' + esc(q.hole) + '?</p>' +
      '<div class="co-hc-btns"><button type="button" class="btn btn-sm co-hc-yes" data-act="hc-yes">Yes</button><a class="btn btn-sm" href="#/cart">Change hole</a>' +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm co-hc-x" data-act="hc-x" aria-label="Dismiss">' + Club.icon('close') + '</button></div></div>');
    view.appendChild(el);
    ui.on(el, 'click', '[data-act=hc-yes]', function () { const r = Club.cart.confirmHole(q.orderId); ui.toast(r.ok ? 'Thanks. The cart knows you’re on hole ' + r.hole : r.error, r.ok ? undefined : 'bad'); el.remove(); });
    ui.on(el, 'click', '[data-act=hc-x]', function () { el.remove(); });
  };
  /** Tee times: a link under today's booking. */
  Portal.cartLink = function (m) {
    if (!Club.cart || !m) return '';
    const g = memberGolfer(m);
    const el = Club.cart.eligibility(g);
    if (!el.ok && el.reason !== 'early' && !Club.cart.openOrderFor(g)) return '';
    const open = Club.cart.openOrderFor(g), st = open ? Club.cart.golferStatus(open.id) : null;
    if (!open && !el.ok) return '<a class="co-ttlink" href="#/cart">' + Club.icon('cart') + '<span><span class="co-ttlink-t">Order or call the cart</span><span class="co-ttlink-s">' + esc(el.text) + '</span></span>' + Club.icon('chevronRight', 'co-entry-go') + '</a>';
    return '<a class="co-ttlink" href="#/cart">' + Club.icon('cart') + '<span><span class="co-ttlink-t">' + (open ? (Club.cart.isVisit(open) ? 'Your cart visit' : 'Your cart order') : 'Order or call the cart') + '</span><span class="co-ttlink-s">' + esc(open && st ? st.message + ' · ' + Club.cart.label(open) : golferBanner()) + '</span></span>' + Club.icon('chevronRight', 'co-entry-go') + '</a>';
  };
})();
