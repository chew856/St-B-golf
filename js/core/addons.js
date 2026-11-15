/* Club.addons: optional extras golfers add to a tee time (rental clubs, a pull cart, a sleeve of balls), on all three
   sites. Loaded after js/core/promos.js, before any module. Staff edit them in Pro Shop > Add-ons (drawn by js/modules/settings.js).

   Add-on doc ('bookingAddons'):
     { id ('addon_…'), name, price (tax included, CAD, 18 holes), price9 (9 holes; null = same as price),
       per: 'player'|'booking', memberOk: bool (members may pick it in the portal and on the staff sheet), active: bool,
       order, placeholder: true (the price is a placeholder the club has not confirmed; cleared when staff save a price) }
   The club does not publish rental or extras prices: every seeded price is a placeholder ("set real price").
   The pull cart is a rental ("Pull cart rental") offered to members too since Nov 10 (the owner's wish: the portal offers
   what the public site offers). A member whose profile says they walk with their own pull cart simply does not add it.
   $addonsVersion (2): a one-off migration flips a stored "Pull cart" seed to memberOk and the clearer name.

   On a tee time, each player may carry addons: [{ addonId, name, qty, price (unit, tax included, at booking time) }].
   Per-player items sit on that player; per-booking items sit on the player who booked (the first of their party).
   Public golfers pay for them online with the green fee (Pub.quote lines kind 'addon'); members' items post to the
   account at check-in with Club.chargeMember (category Golf, source 'teesheet'), like the cart fee.

   Club.addons.all() / get(id) / active('public'|'member'|undefined)   sorted by order
   Club.addons.price(addon, holes) -> unit price for 18 or 9 holes
   Club.addons.unit(addon, holes) -> '$35.00 per player' / '$12.00 each'
   Club.addons.item(addon, qty, holes) -> { addonId, name, qty, price }      the line kept on a player
   Club.addons.total(items) -> dollars    Club.addons.summary(items) -> 'Rental clubs, Sleeve of balls x 2'
   Club.addons.save(doc) -> doc (insert when no id)   Club.addons.MAX_QTY (per-booking quantity limit) */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, fmt = Club.fmt;
  const COLL = 'bookingAddons';
  const MAX_QTY = 4;
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }

  /* Placeholders: typical Winnipeg public course prices, not the club's. Staff set the real ones in Pro Shop > Add-ons. */
  S.seed(COLL, function () {
    return [
      { id: 'addon_clubs', name: 'Rental clubs', price: 35, price9: 25, per: 'player', memberOk: true, active: true, order: 1, placeholder: true },
      { id: 'addon_pullcart', name: 'Pull cart rental', price: 8, price9: 5, per: 'player', memberOk: true, active: true, order: 2, placeholder: true },
      { id: 'addon_balls', name: 'Sleeve of balls', price: 12, price9: null, per: 'booking', memberOk: true, active: true, order: 3, placeholder: true }
    ];
  });
  /* Migration 2 (Nov 10): a store seeded before the pull cart was offered to members. Only the untouched seed changes:
     an add-on staff have saved (placeholder cleared) keeps whatever they chose. */
  if ((+S.getObj('addonsVersion', 1) || 1) < 2) {
    const pc = S.find(COLL, 'addon_pullcart');
    if (pc && pc.placeholder) S.update(COLL, pc.id, { memberOk: true, name: pc.name === 'Pull cart' ? 'Pull cart rental' : pc.name });
    S.setObj('addonsVersion', 2);
  }

  function all() {
    return S.all(COLL).slice().sort(function (a, b) { return (+a.order || 0) - (+b.order || 0) || String(a.name).localeCompare(String(b.name)); });
  }
  function get(id) { return S.find(COLL, id); }
  function active(who) { return all().filter(function (a) { return a.active && (who !== 'member' || a.memberOk); }); }
  function price(a, holes) { return r2(+holes === 9 && a.price9 != null && a.price9 !== '' ? a.price9 : a.price); }
  function unit(a, holes) { return fmt.money(price(a, holes)) + (a.per === 'booking' ? ' each' : ' per player'); }
  function item(a, qty, holes) { return { addonId: a.id, name: a.name, qty: Math.max(1, Math.round(+qty || 1)), price: price(a, holes) }; }
  function total(items) { return r2((items || []).reduce(function (s, x) { return s + (+x.qty || 1) * (+x.price || 0); }, 0)); }
  function summary(items) {
    return (items || []).map(function (x) { return x.name + (+x.qty > 1 ? ' x ' + x.qty : ''); }).join(', ');
  }
  function save(doc) {
    if (doc.id && get(doc.id)) return S.update(COLL, doc.id, doc);
    const order = all().reduce(function (m, a) { return Math.max(m, +a.order || 0); }, 0) + 1;
    return S.insert(COLL, Object.assign({ id: S.uid('addon'), order: order, active: true, memberOk: true, per: 'player', price9: null, placeholder: false }, doc));
  }

  Club.addons = { COLL: COLL, MAX_QTY: MAX_QTY, all: all, get: get, active: active, price: price, unit: unit, item: item, total: total, summary: summary, save: save };
})();
