# St. Boniface Golf Club: Management System Spec

A club operations system for St. Boniface Golf Club (see CLUB.md for the club's facts and voice). Plain HTML/CSS/JS,
**no build step, no npm, no frameworks**. Open `index.html` directly (file://) or serve with
`python3 -m http.server`. Data lives in `localStorage` via `Club.store`.

## Hard rules for every module author

1. **Only touch your own files**: `js/modules/<id>.js` and `css/modules/<id>.css`. Never edit `js/core/*`,
   `css/theme.css`, `index.html`, or another module's files. If you need a helper, write it inside your file.
2. **Classic scripts, no ES modules** (`import`/`export` breaks on file://). Wrap the file in an IIFE:
   `(function () { ... })();`. Talk to the rest of the system only through the global `Club`.
3. **Seed your data at the top level of your file** (runs at load, before first render) with
   `Club.store.seed('collection', () => [...])`. Make seed data relative to today (`Club.date.fromToday(n)`),
   realistic for a prestigious private club, and deterministic (`Club.store.R` helpers, call `R.reseed(<your number>)` first).
   Keep each collection under ~1,500 docs. Reference real seeded IDs: members are `mem_1001`…`mem_1064`, staff `stf_1`…`stf_25`
   (see `js/core/store.js` for names/roles), holes `hole_1`…`hole_18`, tiers `tier_founders|tier_full|tier_junior|tier_social|tier_nonresident`.
4. **Register** with `Club.register({...})` (see below). Render with HTML strings into the `view` element you're given.
5. **Build real states**: empty states (`Club.ui.empty`), validation errors (`Club.ui.validate`), confirmations for
   destructive actions (`Club.ui.confirm`), toasts after every save (`Club.ui.toast('Booking saved')`).
6. **Everything must actually work**: create / edit / delete / status changes persist to the store and the UI re-renders.
   Check that the JS parses with no syntax errors. Avoid runtime errors on missing data (e.g. a deleted member).
7. Responsive to 320px wide. Phone-only refinements shared across pages live in `css/mobile.css` (loaded last on every page); every rule there must sit inside a max-width media query (768px or 480px) so desktop never changes. Keyboard focusable controls. Use `<button>` for actions.

## Design language (luxury private country club)

The look is a printed club scorecard and a members' lounge: deep fairway green, brass hairlines, linen paper,
classical serif headings and small-caps labels. Restrained and expensive-feeling. **Use only the CSS variables in
`css/theme.css`**, never new hex colours. Palette roles:

| Token | Role |
|---|---|
| `--night` #0E2A20 | Sidebar, dark feature panels (`.panel.dark`) |
| `--green` / `--green-2` | Primary actions, selected states, "good" data |
| `--brass`, `--brass-ink`, `--brass-soft`, `--brass-tint` | Ornament, hairlines, highlights, eyebrow labels |
| `--linen`, `--paper`, `--parchment`, `--rule`, `--rule-strong` | Surfaces and borders |
| `--ink`, `--ink-2`, `--ink-3` | Text |
| `--moss`, `--ochre`, `--oxblood`, `--slate` (+ `-tint`) | Status only (good / attention / critical / info) |
| `--c1`…`--c6` | Chart series |

**Type**: headings use `var(--font-display)` (Cormorant Garamond); body `var(--font-body)` (Jost). Labels and table headers
use the small caps style `.eyebrow` / `.label-caps`. Large numbers use the display serif (`.stat-value`).

**Do**: hairline borders instead of shadows; generous spacing; `.panel` surfaces; brass used sparingly as accent;
italic serif for flavour text (`.serif` + `font-style: italic`); one dark `.panel.dark` feature per page at most.
**Don't**: emojis, gradients (other than a subtle same-hue one with a job), glassmorphism, drop shadows on cards, bright
colours, coloured left stripes on cards, bouncy hover effects, em dashes in UI copy ("—"). Use sentence case copy and
specific verbs ("Book tee time", "Post charge", "Save member").
Radius: 2px controls, 4px panels, round only for avatars/pills.

**Animations** (already built in, use them):
- Every page fades/rises in automatically. Add `data-reveal` to blocks you want to stagger in (panels, rows of cards);
  the router calls `Club.ui.animateIn(view)` after `render`. If you re-render part of the page later, call
  `Club.ui.animateIn(thatElement)` again.
- Numbers: `<span data-count="1234" data-prefix="$" data-decimals="0">0</span>` counts up (or use `Club.ui.stats`).
- Charts from `Club.charts` draw/grow in automatically after `animateIn`.
- `.bar > span` progress bars grow in. `.live-dot` pulses (use for "live" things, e.g. on course now).
- Keyframes available in theme.css: `rise`, `fade`, `draw-x`, `grow-x`, `grow-y`, `pulse-ring`, `shimmer`.
- Add module-specific motion in your css file where it adds polish (e.g. a tee slot sliding in, a leaderboard row
  reordering, a card flip). Keep it smooth (`var(--ease-out)`), never bouncy. Respect `prefers-reduced-motion`
  (theme.css already globally neutralises durations).

## Global API (from js/core)

### Registry & routing
```js
Club.register({
  id: 'teesheet',             // route: #/teesheet/<params...>
  label: 'Tee Sheet',
  icon: 'teesheet',           // name from js/core/icons.js (Club.iconPaths keys)
  section: 'Golf',            // Overview | Golf | Membership | Hospitality | Course | Administration
  order: 10,                  // sort within section
  badge: () => 3,             // optional small count in the nav (or null)
  search: (q) => [{ label, sub, href: 'teesheet/2026-10-25', icon }], // optional global search provider; q is lowercased
  render(view, params) {      // params = hash segments after the id
    view.innerHTML = '...';
    return () => {};          // optional cleanup (unsubscribe store listeners, timers)
  }
});
Club.app.go('members/mem_1001');   // navigate
Club.app.render();                 // re-render current route
```

### Store (`Club.store`)
`all(coll)`, `find(coll, id)`, `where(coll, pred)`, `insert(coll, doc) -> doc`, `update(coll, id, patch) -> doc`,
`remove(coll, id)`, `replace(coll, arr)`, `getObj(key, fallback)`, `setObj(key, val)`, `seed(coll, fn)`,
`subscribe(coll, fn) -> unsubscribe`, `uid(prefix)`, `R` (deterministic random: `rand, int(a,b), pick(arr), chance(p), reseed(n)`),
`iso(date)`, `daysFromToday(n)`.

### Formatting & dates
`Club.fmt.money(v)`, `money0(v)`, `num(v)`, `pct(v,d)`, `date(iso)`, `dateShort(iso)`, `dateLong(iso)`, `weekday(iso)`,
`time('07:30') -> '7:30 AM'`, `relative(iso)`, `handicap(h)`, `initials(name)`.
`Club.date.today()`, `addDays(iso, n)`, `fromToday(n)`, `week(iso) -> [7 ISO dates, Monday first]`.

### People
`Club.members.get(id)`, `Club.members.name(idOrDoc)`, `Club.members.tier(member)`, `Club.members.options(selectedId)` (HTML `<option>`s).
`Club.staff.get(id)`, `Club.staff.name(id)`, `Club.staff.options(selectedId, department?)`.

### Billing ledger (shared)
`Club.chargeMember(memberId, { description, category, amount, source, refId, date, title?, lines?, noReceipt? })` posts to `charges` and updates
the member's `balance`. **Every module that sells something to a member must use this** (pro shop on account, dining
on account, guest fees, lesson fees, event fees). `Club.taxRate()` returns the sales tax rate.
Every non-zero charge also makes a receipt (below): `title` (else the description) and `lines` (else one line for the
description) go on the receipt only, never on the charge; a negative amount makes a credit; `noReceipt: true` skips it.

### Receipts (`Club.receipts`, js/core/receipts.js + css/receipts.css, all three sites)
Anything paid for or ordered gets a receipt the person can open later (portal, booking site) and staff can reprint.
- `create(o) -> doc`: fills `id`, `no` (next `$receiptSeq`), `at` (now), `date` (today), `kind` ('credit' when total < 0),
  `lines` (one line from the title), `total` (sum of qty x price, stored positive), `name` (from memberId / publicPlayerId),
  `method` ('account' for a member without paymentId, else 'other'), `methodLabel` (from method and kind), `source` ('other').
  Never duplicates: returns the existing receipt with the same `chargeId`, or the same `paymentId`, or, within 5 seconds,
  the same `source`, `refId` (not null), `kind`, `total` and customer whose chargeId / paymentId do not conflict
  (it gains any chargeId, paymentId or note it lacked). Two charges with their own chargeIds always get two receipts.
- `get(id)`, `forMember(memberId)`, `forPublic(publicPlayerId)`, `forRef(source, refId)` (lists newest first).
- `html(r)`: the receipt markup (logo, `Club.info` name, address, phone, Receipt or Credit, number, date and time, customer,
  lines, total, payment line, "Taxes included."). No tax number or breakdown: the club's registration number is unknown.
- `open(idOrDoc)`: shows it in `Club.ui.modal` with Close and Print or save as PDF (prints only the receipt: `body.rc-printing`,
  overlay `.rc-overlay`). Returns the modal api.
- `cardLabel(brand, last4)` -> 'Visa ending 4242'.
- `backfill() -> count`: once per store (`$receiptsBackfilled`), receipts for existing `charges` (method account) and `payments`
  (title 'Account payment', method from the payment). Runs by itself on DOMContentLoaded.

### UI kit (`Club.ui`), all return HTML strings unless noted
- `pageHeader({ eyebrow, title, subtitle, actions })`: every page starts with this.
- `stats([{ label, value, prefix, suffix, decimals, meta, delta }])`: the scorecard stat strip.
- `btn(label, { kind: 'primary'|'brass'|'ghost'|'danger', icon, sm, action, id, title })` -> button with `data-action`/`data-id`.
- `badge(text, 'good'|'warn'|'bad'|'info'|'brass'|'dark'|'outline'|'plain')`, `avatar(name, 'sm'|'lg'|'xl', light)`, `person(name, sub, size)`.
- `empty({ icon, title, text, action })`.
- `field({ label, name, type, value, options, required, hint, span2, placeholder, min, max, step })`, `options(arr, selected)`.
- `formData(formEl)`, `validate(formEl) -> bool`.
- `modal({ title, eyebrow, body, size: 'lg'|'xl', actions: [{ label, kind, icon, onClick(api) }], onClose })` -> `{ el, body, close }`.
  Return `false` from onClick to keep it open (e.g. failed validation).
- `drawer({ title, eyebrow, body, actions })`: right-side panel, same API. Good for record details.
- `confirm({ title, text, confirmLabel, danger }) -> Promise<bool>`; `toast(msg, 'bad'?)`.
- `tabs(containerEl, [{ id, label, render(panelEl) }], activeId, onChange)`: sliding brass underline. (DOM, not string.)
- `segmented([{ value, label }], selected, name)` HTML; wire clicks yourself and toggle `.active`.
- DOM: `esc(str)` (**always escape user data**), `el(html)`, `$(sel, root)`, `$$(sel, root)`, `on(root, type, selector, fn(e, matchedEl))`.
- Motion: `animateIn(root)`, `countUp(root)`.

### Charts (`Club.charts`), return HTML strings
`line({ labels, series: [{ name, values, color? }], height, money, area })`, `bar({ labels, series, height, money, stacked })`,
`donut({ items: [{ label, value, color? }], size, center: { value, label }, money, legend })`, `sparkline(values, { width, height, color })`,
`hbars([{ label, value, max?, brass?, color? }], { money, suffix })`. Any element with `data-tip="text"` gets a hover tooltip.

### Other globals
`Club.info` (name, short, est, address, phone, email), `Club.weather` (`today: {cond, icon, hi, lo, rain, wind}`,
`forecast: [7 days]`, `nowTemp`), `Club.icon(name, cls)`.

### CSS classes available (see theme.css)
Layout: `.grid .grid-2 .grid-3 .grid-4 .grid-main-side .stack .row .row.wrap .row.between .divider .divider.brass`.
Surfaces: `.panel .panel-head .panel-body .panel-body.flush .panel.dark`. Tables: `.table-wrap .table` (+ `th.num td.num`,
`tr.clickable`, `tr.selected`, `.primary-cell`, `tfoot`). Lists: `.list > li`. `.kv` (dl), `.bar > span[style=width:x%]`,
`.flourish`, `.empty`, `.skeleton`, forms: `.field .input .select .textarea .form-grid .span-2 .check .toggle`.
Text: `.eyebrow .label-caps .muted .ink-2 .serif .num .right .center .nowrap`.

## Data model (collections, owners)

`Club.pickers` (js/core/pickers.js, css/pickers.css, loaded on all three sites): every `select.select` and `input[type=date]` is replaced on sight (MutationObserver) by the app's own button plus popover list or calendar; the native control stays hidden in the form holding the value (value setters patched so code changes update the button), so validation, formData and change listeners are unchanged. `data-native` opts a control out. `Club.drill` (js/core/drill.js): stat tiles that open a details drawer (`tiles`, `wire`) and the drawer parts (`sec`, `kpis`, `table`, `note`, `empty`, `share`); used by the beverage cart Clubhouse tab and Events & Tournaments.

`Club.premises` (js/core/premises.js): `contains(lat, lon, bufferMeters)` point-in-polygon on the club boundary from OpenStreetMap relation 7194105 (© OpenStreetMap contributors, ODbL), plus a buffer to the nearest edge. `Club.cartDispatch.TEE_GPS`: the 18 tee positions from OpenStreetMap (to be confirmed by the grounds crew). `Club.holes` (js/core/holes.js): `locate(lat, lon, lastHole)` the hole a golfer is on, from the 18 OpenStreetMap golf=hole lines (tee to green; ways 1203393350 to 1203402792, not the neighbouring course's), TOLERANCE_M 35, OFF_ORDER_M 20, MAX_M 90 (null beyond); `distances(lat, lon)`. Used by `Club.cart` for golfers' phones with the group's predicted hole.

Core (seeded in store.js, read by all): `members`, `membershipTiers`, `staff`, `holes`.

member: `{ id, memberNo, firstName, lastName, email, phone, address, tierId, status: 'active'|'leave'|'suspended'|'resigned',
memberSince, dob, handicap (number|null; negative = plus), ghin, locker, spouse, children, balance, preferences: { cart, dining, notes }, tags: [] }`
tier: `{ id, name, annualDues, monthlyMinimum, golf, description }`
staff: `{ id, firstName, lastName, role, department: 'Administration'|'Golf Operations'|'Agronomy'|'Food & Beverage'|'Events', email, phone, hourlyRate, status }`
hole: `{ id, number, name, par, handicap, yards: { black, blue, white, gold } }`

| Collection | Owner module | Shape |
|---|---|---|
| `teeTimes` | teesheet | `{ id, date, time 'HH:MM', holes: 18\|9, players: [{ memberId\|null, name, type: 'member'\|'guest', cart: bool, paid: bool, hostId?: memberId (guest brought by that member: label and fees go to them, else the group's first member), pays?: 'host'\|'shop' (guests only; 'shop' = the guest pays at the golf shop: at check-in nothing posts to a member account, the player gets payAt: 'shop' like a public golfer and staff tick paid, paidAt: 'shop'), phone?, email?, handicap?: number (guests added in the portal: phone and email are required there, handicap index optional and negative for a plus handicap; kept when staff edit the group and shown on the staff sheet), addedBy?: memberId (member added by someone joining the group) }], startTee?: 1|10 (the tee the group starts on; absent or 1 is the 1st tee, staff set 10 on the tee sheet; the beverage cart predicts the group's position from it), status: 'booked'\|'checked-in'\|'on-course'\|'completed'\|'no-show'\|'cancelled', notes, eventId\|null }` |
| `teeBlocks` | teesheet | `{ id, date, start, end, reason }` (maintenance, shotgun, league) |
| `lessons` | lessons | `{ id, date, time, duration, proId, memberId, type: 'Private lesson'\|'Playing lesson'\|'Club fitting'\|'Junior clinic'\|'Group clinic', price, status: 'scheduled'\|'completed'\|'cancelled', notes }` |
| `charges` | billing | `{ id, memberId, date, description, category: 'Dues'\|'Golf'\|'Pro Shop'\|'Dining'\|'Events'\|'Lessons'\|'Other', amount, source, refId, statementId }` |
| `payments` | billing | `{ id, memberId, date, amount, method: 'ACH'\|'Card'\|'Check', reference }` |
| `statements` | billing | `{ id, memberId, period 'YYYY-MM', issuedOn, total, status: 'draft'\|'sent'\|'paid'\|'overdue' }` |
| `receipts` | core (js/core/receipts.js) | `{ id ('rc_…'), no ('R-000123'), kind: 'sale'\|'credit', at ISO, date 'YYYY-MM-DD', memberId\|null, publicPlayerId\|null, name, title, lines: [{ name, qty, price (unit, CAD, tax included), size? }], total (positive; kind gives the direction), method: 'account'\|'card'\|'cash'\|'other', methodLabel ('Charged to your member account', 'Visa ending 4242', 'Cash', 'Credit to your member account'), source ('cart', 'events', 'lessons', 'dining', 'proshop', 'teesheet', 'billing', 'portal', 'public', …), refId\|null, chargeId\|null, paymentId\|null, note\|null }`. Made by `Club.chargeMember` for every account charge and by `Club.receipts.create` for card, cash and other payments. `$receiptSeq`: last number used; `$receiptsBackfilled`: true once existing charges and payments have receipts. |
| `products` | proshop | `{ id, sku, name, category: 'Apparel'\|'Clubs'\|'Balls'\|'Accessories'\|'Footwear'\|'Headwear', brand, price, cost, stock, reorderAt }` |
| `sales` | proshop | `{ id, date, time, items: [{ productId, name, qty, price }], subtotal, tax, total, payment: 'Member account'\|'Card'\|'Cash', memberId\|null, staffId }` |
| `diningReservations` | dining | `{ id, date, time, venue: 'Main Dining Room'\|'Grill Room'\|'Terrace'\|'Private Dining', partySize, memberId\|null, name, table, status: 'confirmed'\|'seated'\|'completed'\|'cancelled'\|'no-show', occasion, notes }` |
| `menuItems` | dining | `{ id, name, section, price, description, venue, available, dietary: [] }` |
| `diningOrders` | dining | `{ id, date, time, venue, table, memberId\|null, items: [{ menuItemId, name, qty, price }], total, status: 'open'\|'fired'\|'served'\|'closed' }` |
| `events` | events | `{ id, title, type: 'Tournament'\|'Social'\|'Dining'\|'Junior'\|'Ladies'\|'Member-Guest'\|'Private', date, start, end, venue, capacity, price, description, status: 'draft'\|'published'\|'completed'\|'cancelled', registrations: [{ memberId, guests, registeredAt }] }` |
| `tournaments` | events | `{ id, eventId\|null, name, format: 'Stroke play'\|'Stableford'\|'Four-ball'\|'Scramble', date, status: 'upcoming'\|'live'\|'final', field: [{ memberId, handicap, scores: [18 numbers or null] }] }` |
| `announcements` | communications | `{ id, title, body, audience, channels: ['Email','SMS','App'], status: 'draft'\|'scheduled'\|'sent', scheduledFor, sentAt, author, recipients, opens, clicks }` |
| `workOrders` | course | `{ id, title, area, hole\|null, priority: 'low'\|'normal'\|'high'\|'urgent', status: 'open'\|'in-progress'\|'done', assigneeId, dueDate, notes, equipmentId\|null }` |
| `equipment` | course | `{ id, unitNo, name, type: 'Mower'\|'Utility vehicle'\|'Sprayer'\|'Aerator'\|'Other', make, model, hours, serviceIntervalHours, lastServiceHours, status: 'in-service'\|'in-shop'\|'retired' }` |
| `carts` | course | `{ id, number, status: 'available'\|'out'\|'charging'\|'maintenance', battery, lastCheck }` |
| `chemicalLogs` | course | `{ id, date, product, epaReg, target, area, rate, unit, appliedBy, windMph, tempF, reentryHours }` |
| `$courseStatus` (getObj) | course | `{ open: bool, cartRule: 'Normal'\|'90 degree'\|'Cart path only'\|'No carts', greenSpeed, firmness, pins: 'Front'\|'Middle'\|'Back', holes: [{ number, status: 'open'\|'closed'\|'GUR' }], message, updatedAt }` |
| `shifts` | staff | `{ id, staffId, date, start, end, position, notes }` |
| `timeOff` | staff | `{ id, staffId, from, to, reason, status: 'pending'\|'approved'\|'denied' }` |
| `monthlyMetrics` | reports | 12 months of history: `{ id, month 'YYYY-MM', rounds, guestRounds, revenue: { dues, golf, proShop, dining, events, lessons }, members, covers }` |
| `$clubInfo`, `$taxRate` | settings | club profile and tax rate |
| `friendships` | portal friends (js/portal/friends.js) | `{ id, from: memberId, to: memberId, status: 'pending'\|'accepted'\|'declined'\|'cancelled'\|'removed'\|'blocked', blockedBy: memberId\|undefined, createdAt, respondedAt }`. Docs are never deleted; the newest doc in status pending, accepted or blocked is the pair's current relationship. |
| `memberMessages` | portal friends | `{ id, from, to, body (max 1000 chars), at ISO, readAt ISO\|null, auto?: 'join', teeTimeId? }` (auto: sent when a member joins a friend's tee time). Private one-to-one between friends; staff never list these. |
| `messageReports` | portal friends (read by the staff dashboard) | `{ id, messageId, reporterId, reportedId, body (copy of the reported message only), reason, note, at, status: 'open'\|'dismissed'\|'contacted', handledAt }` |
| `memberPrivacy` | portal friends (edited in Profile) | `{ id: 'prv_' + memberId, memberId, teeTimes: bool, handicap: bool, scores: bool, requests: 'all'\|'none' }`. Missing doc means everything shared and requests from all members. |
| `friendSharing` | portal friends | `{ id: 'fs_' + owner + '_' + friend, owner, friend, see: bool, join: bool }`. Per-friend tee time sharing set by `owner` for `friend`; missing doc means both on. `see` off: the friend sees the owner's tee times as private everywhere; `join` off: the friend must request to join. The owner's global `memberPrivacy.teeTimes` applies first. |
| `joinRequests` | portal friends | `{ id, teeTimeId, requesterId, ownerId, party: [players as for a join, the requester first], status: 'pending'\|'approved'\|'declined'\|'cancelled'\|'expired', createdAt, decidedAt }`. Approve runs the Tee times checkBooking/commitBooking for the requester at that moment (all or nothing); pending requests expire once the tee time has passed. |
| `cartMenu` | beverage cart (js/modules/cart.js) | `{ id, name, size ('Tall can', 'Sleeve of 3'; '' for none, shown under the name), category (one of `Club.cart.categories()`: 'Drinks', 'Beer and alcohol', 'Snacks', 'Food', 'Golf', then any staff added, stored in `$cartCategories`; staff remove one with Remove category on the Menu tab, refused while any item is in it (`removeCategory(name)` returns `{ ok: false, error: 'has-items', items }`) or if it is the last), price (tax included), alcohol: bool, soldOut: bool, order }`. Placeholder items (27, a typical Canadian course cart at typical Winnipeg prices; not the club's real menu), edited by staff in Beverage cart, Menu. `$cartMenuVersion` 2: the first 11-item placeholder menu, if unedited (same items, names and prices), was replaced once. Version 3 moved sizes out of v2 names ("Domestic beer, tall can" to name "Domestic beer", size "Tall can") for items not renamed by staff. Order lines keep `size` too. |
| `cartOrders` | beverage cart | `{ id (= the dispatch order id, 'co_…'), kind: 'order'\|'visit' (missing means 'order'), fromVisit (an order that began as a cart visit), date, placedAt (ms), golferType: 'member'\|'public', golferKey ('member:mem_1003' or 'public:<publicPlayerId>'), memberId\|null, publicPlayerId\|null, name, firstName, groupSize, teeTimeId, teeTime, hole, startHole: 1\|10, holeAt (ms), items: [{ itemId, name, qty, price, alcohol }], total, payment: 'account'\|'cart', note, status: 'open'\|'delivered'\|'cancelled', cartId, cartName, golferText (set when the cart taps Go), headingAt, target, merges, deliveredAt, deliveredBy, foundAt (node), paidWith: 'card'\|'cash'\|null, edits (times the golfer changed the order), chargeId (account orders), cancelledAt, cancelledBy: 'golfer'\|'shift'\|'staff'\|'day-end', cancelNote (shown to the golfer), log: [{ at, text }] }`. One open order per golfer per tee time: a second order merges into it. |
| `cartOrders` (kind 'visit') | beverage cart | Call the cart: the cart comes to the golfer's hole and they choose from what is on board. Same fields as an order with `kind: 'visit'`, `items: []`, `total: 0`, the hole, `payment` preference ('account' members only, else 'cart') and note, and the same dispatch entry (`D.addOrder`, merge key golferKey + '\|' + teeTimeId). On delivery the attendant records what was bought: `items`, `total`, `boughtNothing`, `paidWith: 'card'\|'cash'\|null` and, when a member chose their account, `chargeId` (posted with `Club.chargeMember`, category Dining, source `cart`, like an account order). Items ordered in the app while a visit is open merge into it and it becomes `kind: 'order'`, `fromVisit: true`. A golfer can edit only a visit's note. |
| `cartOrders` (group stops) | beverage cart | Golfers on the same tee time share ONE dispatch entry (the group stop): addOrder with `phone: 'group:' + teeTimeId`, so the dispatch's own merge returns the group's entry. Each golfer keeps their own doc (items, bill, payment, status); a doc that joined an existing stop has `groupId` = that entry's id (the first doc's id; a doc without `groupId` is its own entry). The newest order's hole, "I've moved" and "Still on hole N?" Yes from any member call `updateGolferHole` on the entry and update `hole`/`holeAt` on every open doc in it. Delivered records each doc on its own (own charge, or card/cash; visits through "What did they buy?"); the entry leaves the line (`markDelivered` / `cancelOrder`) only with its last open doc. |
| `cartOrders` (location) | beverage cart | `locShared: bool`, `gps: { at (ms), accuracy (m), lat, lon }` (lat/lon only while the order is open; removed on delivery or cancel), `locSkipped: 'demo'` for the demo accounts. `placeOrder` / `callCart` take `loc: { shared, at, accuracy, lat, lon }` and refuse without it (`needLoc`), when stale (over 2 min) or imprecise (over 150 m), or off the premises (`offCourse`: `Club.premises.contains(lat, lon, 50)` is false). `gpsUpdate(orderId, lat, lon, at, accuracy)` (the open-order watcher) applies the same checks and moves the group to the nearest TEE_GPS tee, except while `holeHold` (the GPS hole when the golfer picked a hole by hand: `holePicked` on placeOrder / callCart, or `moveGolfer(id, hole, gpsNode)`) matches the fix; any other location change clears it. `holeFromLoc(golfer, loc)` gives the hole for prefilling. Ordering window: from the tee time, or earlier when the tee time is checked-in / on-course, until the round is complete (demo accounts exempt). |
| `$cartFleet` (getObj) | beverage cart | The dispatch `Fleet` from `Club.cartDispatch` (js/core/cartdispatch.js), stored as one record: `{ carts: [{ id: '1'\|'2'\|'3', name (first name), state: { status: 'serving', at: NodeId, headingTo?: { orderId, node } } \| { status: 'restocking', since, backAt? }, line: [{ id, hole, placedAt, holeAt?, startHole?, phone (merge key: golferKey + '\|' + teeTimeId), bumps }], staffId, shiftStart }] }`. Every change is read, one pure dispatch call, write (`Club.cart.*`). NodeId is 'CH' (clubhouse) or '1'…'18'. |
| `scorePosts` | portal scores (js/portal/scores.js), DEMO | `{ id, memberId, date, time\|null, teeTimeId\|null (null = a round not booked in the app), holes: 18\|9, nine: 'front'\|'back'\|null, tees: 'black'\|'green'\|'silver', entry: 'hole'\|'total', holeScores: [numbers, one per hole played]\|null, gross, adjusted (net double bogey applied when hole by hole), courseHandicap, indexUsed, rating, slope (from DEMO_RATINGS, placeholders), par, pcc: null (calculated by Golf Canada), differential, attestedBy: memberId\|null (a friend from the round), playedWith: [names], estimate: { index, used, of }\|null (demo WHS estimate after this post), status: 'saved-in-demo', postedAt ISO, demo: true, seed?: true }`. Golf Canada score posting demo: nothing is sent to Golf Canada and `members.handicap` is never changed. Seeded once with 12 past posts for mem_1003. |
| `localStorage stboniface.cart.holecheck.<golferKey>` | beverage cart | Per device: when "Still on hole N?" was last shown (at most once every 10 minutes). `stboniface.cart.locok.<golferKey>`: the location explanation was shown. |
| `$cartDay` (getObj) | beverage cart | ISO date of the last daily housekeeping (closes earlier open orders, resets the demo cart and line). |

Read other modules' collections defensively (`Club.store.all('teeTimes')` may be empty if that module failed).

## Cross-links (routes)
`#/members/<memberId>`, `#/teesheet/<YYYY-MM-DD>`, `#/lessons`, `#/billing/<memberId>`, `#/proshop`, `#/dining`,
`#/events/<eventId>`, `#/cart/mine|clubhouse|menu`, `#/communications`, `#/course`, `#/reports`, `#/settings`, `#/dashboard`.

## Modules

| id | label | section | order | icon |
|---|---|---|---|---|
| dashboard | Dashboard | Overview | 1 | dashboard |
| teesheet | Tee Sheet | Golf | 10 | teesheet |
| lessons | Lessons & Academy | Golf | 20 | lesson |
| events | Events & Tournaments | Golf | 30 | trophy |
| members | Members | Membership | 10 | members |
| billing | Billing & Statements | Membership | 20 | billing |
| communications | Communications | Membership | 30 | mail |
| dining | Dining & Banquets | Hospitality | 10 | dining |
| proshop | Pro Shop | Hospitality | 20 | shop |
| cart | Beverage cart | Hospitality | 25 | cart |
| course | Course & Grounds | Course | 10 | course |
| reports | Reports | Administration | 20 | reports |
| settings | Settings | Administration | 30 | settings |
| accounting | Accounting | Administration | 15 | cash |

## November 2026 collections and APIs
| Collection / key | Owner | Shape |
|---|---|---|
| `applications` (additions) | members.js, public join.js | stage `'Waiting list'` (not an open stage: off the board, nav badge and average wait). Online records add `source: 'Online'`, `firstName`, `lastName`, `dob`, `handicap` (plus stored negative), `heardAbout`, `sponsorNames`, `consentAt`, `publicPlayerId`. Waiting-list position: by `submittedOn`, `createdAt`, `id`. |
| `membershipTiers.full` | members.js | boolean set by staff; when missing, `tier_junior` and `tier_nonresident` count as full. `$applicationsWaitlistSeeded` flag. `Club.membership`: `WAIT_STAGE, AGE_RULES, isFull, setFull, ageOn, ageProblem, waitQueue, waitPosition`. |
| `teeWaitlist` | js/core/waitlist.js | `{ id, date, time\|null, window: 'any'\|'morning'\|'midday'\|'afternoon'\|null, players, kind: 'member'\|'public', memberId, publicPlayerId, createdAt, status: 'waiting'\|'notified'\|'booked'\|'expired'\|'removed', notifiedAt, offerTime, holdUntil, had, history: [{ at, text }], bookedAt, bookedTeeTimeId, expiredAt, removedAt, removedBy }`. API `Club.waitlist.join / remove / released / sweep / forPerson / onDate / position / offerOpen / whenText / contact`. |
| `giftCards` | js/core/giftcards.js | code, balance, history; `$giftCardSettings`. Payments gain `giftCardId`, `giftLast4`, `giftAmount`, `cardAmount` (`publicPayments`, `brand: 'giftcard'` when fully covered), `sales` (`payment: 'Gift card'` when fully covered), `diningOrders`. `Club.giftcards`, `Club.checkout` (shared pay panel). Receipt source `'giftcards'`. |
| `takeoutOrders` | js/core/takeout.js | `$takeoutSettings`, `$takeoutSeq`; `Club.takeout` (also the ordering view shared by portal and public). Receipt source `'takeout'`; account charges category Dining. |
| `renewals` | js/modules/billing.js | `{ id, memberId, season: 2027, tierId, plan: 'full'\|'monthly', total, schedule: [{ n, date, amount, chargeId\|null }], createdAt, status: 'renewed' }`; charges refId `renew-<id>-<n>`. `Club.billing.renewal`: `SEASON, schedule(total, fromIso, plan), forMember, renew(id, plan), postDue(), PLAN_LABEL`. |
| `visitFeedback` | js/core/feedback.js | `{ id 'vf_<kind>_<refId>_<personId>', kind, refId, visitDate, visit: { title, sub, time }, memberId\|null, publicPlayerId\|null, name, rating, comment, createdAt, updatedAt, followedUp?, followedUpOn? }`; `$visitFeedbackSeeded` (about 275 demo ratings from others). `Club.feedback`: `visits(who), rate(who, key, { rating, comment }), all(), cardHTML(v), wire(root, who, onSave), WINDOW_DAYS, LOW`. |
| Public site hooks | js/public/site.js | `Pub.register({ ..., nav: { label, order, icon? } })` adds a page to the header and phone menu; `Pub.addAccountSection({ order, html(player), wire(root, player, redraw) })` adds a section to the public My account page. |
| Reports extensions | js/modules/reports.js | `Club.reports.addTab({ id, label, grid, order })` (base orders: revenue 10, golf 30, hospitality 40, accounts 50; growth 20), `Club.reports.addCard({ id, tab, order, title, build(ctx) -> { id, title, eyebrow, html, csv }, wire(cardEl, ctx, api), collections })`, `api.drill(d)`, helpers `Club.reports.h`. Cards in js/modules/reports-golf.js, reports-growth.js, reports-hospitality.js; styles css/modules/reports-extra.css (`rgo-`, `rg-`, `rh-`). |
| `weatherLog` | js/core/club.js | `{ id 'wx_YYYY-MM-DD', date, cond, icon, hi, lo, precip, wind, source: 'live'\|'demo' }`, upserted from each Open-Meteo refresh (past 30 days); live replaces demo. |
| `teeTimes` (additions) | teesheet.js, portal teetimes.js, public me.js | `cancelledAt` (ISO) on every cancel path. `Club.teeSheet.PACE_TARGET`. Demo extension (sources, cancellations, refills, pace) as a migration, `golfDemoVersion`. |
| `publicPlayers` (additions) | public me.js | `marketingOptIn`, `marketingOptInAt`, `heardFrom`. |
| `applications.heardFrom` | members.js, public join.js | English answer from `Club.membership` answer list (older `heardAbout` mapped by `heardFrom()`). Growth demo migration tags inserted records `demo: 'growth-v1'`, log in `$growthDemo`. |

| `promoCodes` | js/core/promos.js (`Club.promos`) | Promo codes for public tee times (green fees, carts, add-ons) and the online shop; never members. Full shape and API in the file header. Managed in Settings > Promotions (`#/settings/promotions`; delete only while never used; docs gain `createdByName`). Promo first, then gift card, then card; the discount is a negative line `'Promo code CODE'`. Uses: source `'public'` (publicPayments id) or `'shop'` (shopOrders id); `release(source, refId)` on refund or cancel. Seeded demo codes WELCOME10, TWILIGHT5, SHOP15, SPRING20 (placeholders). |
| `receipts` (additions) | js/core/receipts.js | `tenders: [{ method: 'card'\|'cash'\|'account'\|'gift'\|'other', amount, online?, ref? }]\|null` and `channel: 'online'\|'counter'\|null`. Every place that takes money passes both (tee sheet, pro shop, Gallery, cart, takeout, billing, public booking, online shop, deposits). `Club.giftcards.receipt` fills tenders and takes `online: true`. Receipts without them are derived by `Club.accounting.classify`. Tee sheet shop receipts carry `paymentId: 'tsp_…'` that is NOT a `payments` doc: a receipt is a member payment only when its paymentId is a real `payments` id. |
| `bookingAddons` | js/core/addons.js (`Club.addons`) | `{ id, name, price (tax incl., 18 holes), price9 (null = same), per: 'player'\|'booking', memberOk, active, order, placeholder }`. Seed: Rental clubs, Pull cart (public only: members have a pull cart as a benefit), Sleeve of balls; prices are placeholders until saved in Settings > Add-ons (`#/settings/addons`). API: `all, get, active('public'\|'member'), price(a, holes), unit, item(a, qty, holes), total(items), summary(items), save(doc), MAX_QTY (4), COLL`. |
| `teeTimes.players` (additions) | book.js, portal teetimes.js, teesheet.js | `addons: [{ addonId, name, qty, price }]` (per-booking items on the booker). Members' and host-paid guests' add-ons post at check-in via `Club.chargeMember` (Golf, source teesheet, refId tee time). Golf shop payers: `paid, paidAt: 'shop', paidWith: 'card'\|'cash'\|'gift', shopPay: { id 'tsp_…', at, by, lines, subtotal, total, method, rest, gift: { id, last4, amount }\|null, cashTendered, change, discount, receiptId }`, `discount: { amount, reason, kind: 'amount'\|'percent', value, by, at }`, `shopRefunds: [{ id, at, by, total, receiptId }]`. Shop payment receipts: source 'teesheet', refId tee time, channel 'counter', tenders, negative `'Discount: <reason>'` line; unticking paid makes the credit. |
| `publicPayments` (additions) | public book.js / me.js | `lines[].kind: 'greenFee'\|'cart'\|'addon'\|'promo'` (`addonId`, `qty` on add-on lines), `promo: { promoId, code, discount }\|null`, `amount` after the discount (0 allowed with a 100% code: no card taken), `brand` null when free, `refundAmount`. Public hooks: `Pub.quote(date, time, holes, party[{ name, cart, adds }], extras{ addonId: qty })`, `Pub.addonList()`, `Pub.paidWith(pay)`. |
| `shopOrders` | js/core/shop.js (`Club.shop`) | Online golf shop. `{ id 'so_…', no 'W-0001' ($shopOrderSeq), at, date, site 'portal'\|'public', customer { memberId, publicPlayerId, name, email, phone }, items [{ productId, name, brand, sku, qty, price (shelf, before tax) }], subtotal, tax, promo\|null, total (paid, tax included), pay { method 'account'\|'card'\|'gift'\|'mixed'\|'none', rest, label, brand, last4, giftCardId, giftLast4, giftAmount, cardAmount, accountAmount, receiptId, chargeId }, saleId, status 'new'\|'ready'\|'picked-up'\|'cancelled', readyAt, pickedUpAt, pickedUpBy, cancelledAt, cancelledBy, cancelReason, refund { amount, receiptId, at }\|null, log [{ at, text }] }`. Pickup at the golf shop only, no member discount. Stock taken at order, back on cancel. Receipts source 'shop', channel 'online'. Account charges: 'Pro Shop', source 'shop'. API: `catalogue(), cart/addToCart/setQty/checkCart(who), totals(items, discount), placeOrder({ customer, lines, promo, pay, site }) -> { ok, order, receipt, msg, code }, setStatus(id, status, by), cancel(id, { by, staffName, staffId, reason }), forMember/forPublic, mount(host, ctx)` (routes `#/shop`, `/item/<id>`, `/basket`, `/orders`, `/order/<id>`). `$shopOnlineSeeded`, `$shopDemoSeeded`. |
| `products` / `sales` (additions) | proshop.js | products: `online` (Inventory "Sell online"), `blurb`. sales: online orders write `{ channel: 'online', orderId, orderNo, discount }`; a cancellation writes a reversal (negative qty and totals, `refundOf`). Counter sales have no channel; their receipts (source 'pos', refId sale id, channel 'counter', tenders) are made at the till. Pro Shop gains an Online orders tab. |
| `dailyCloses` | js/modules/accounting.js | `{ id 'close_YYYY-MM-DD', date, status: 'closed'\|'reopened', drawers: [{ id: 'shop'\|'gallery'\|'cart', float, counts: { '100','50','20','10','5','2','1','0.25','0.10','0.05': n }, counted, expectedCash, overShort }], cardBatch: { expected, terminal, diff }, onlineCard, totals (summarize without receipts), notes, closedBy, closedAt, reopenedAt, reopenedBy, reopenReason, exports: { quickbooks?, sage?, gl? }, log: [{ at, action, by, reason? }], demo? }`. No doc = open. Seeded for the last 14 days (`$dailyClosesSeeded`). `$accountingSettings`: `{ floats: { shop: 200, gallery: 300, cart: 150 } (placeholders), tolerance: 5 }`. `$accountingDrafts`: counts typed before sign-off. |
| `Club.accounting` | js/modules/accounting.js | `DRAWERS, DEPTS, TENDERS, DENOMS, classify(r) -> { id, no, at, date, dept, drawer, online, sign, tenders, total, kind, source, refId, title, name, synthetic }, summarize(date) -> { date, receipts, count, byTender: { card, cash, gift, account, other, onlineCard }, byDept, drawers: { shop\|gallery\|cart: { cash, card, gift, rounding } }, deposits, memberPayments, giftCardsSold, refunds, credits, cashOutside, total, moneyTaken }` (till records without a receipt are included as `synthetic: true` and drop out once a real receipt has the same refId), `closeFor, isClosed, settings, openPastDays, depositReceipt, depositReversed, depositReceiptFor, openReport(date)`. Tabs from other files: `window.__accountingTabs.push({ id, label, order, render(panelEl, ctx) })`, ctx `{ date, params, go(path), refresh() }`; built-in orders close 10, history 20. Routes `#/accounting`, `#/accounting/close/<date>`, `#/accounting/history`, `#/accounting/<tabId>`. Function and outing deposits make receipts (source 'functions'\|'outings', `$depositReceiptsBackfilled`). |
| `$glAccounts`, `$glMapping`, `$glExportSettings`, `accountingExports` | js/modules/accounting-export.js (`Club.accountingExport`) | Export (order 30) and Account mapping (order 40) tabs. `$glAccounts`: `[{ id, number (4 digits), name, type }]`, default 21-account chart ("confirm with your accountant"). `$glMapping`: `{ key: accountId }` for `rev.<dept>`, `tender.cash.<drawer>`, `tender.cash\|card\|onlineCard\|pad\|cheque\|other`, `gst, pst, ar, gift, deposits, promo, overShort, rounding`. `$glExportSettings`: `{ taxed: { dept: bool }, arName, dateFmt }`. `accountingExports`: `{ id, at, by, format: 'quickbooks'\|'sage'\|'gl', mode, from, to, days, lines, total, file }`. One journal per day in cents: receipts' non-account tenders, `charges` (Dr A/R), `payments` (Cr A/R), closed-day over/short, drawer rounding; GST 5% and PST (rate minus 5%) out of tax-included taxed depts; difference of 5¢ or less posted as rounding, more blocks download. Formats: QuickBooks Online journal CSV (`Journal No, Journal Date, Account Name, Debits, Credits, Description, Name`), Sage 50 Canadian general journal .txt, generic GL CSV. No live connection yet (waits on the owner). API: `accounts, mapping, settings, validate, journalFor(date), build({ mode, from, to, skip, format }), file, toCSV`. |

### Tee time holds (js/core/holds.js, Nov 9 2026)
- Own localStorage key `stboniface.holds.v1` (not the club data): `[{ id, owner, date, time, places, source: 'public'|'portal', createdAt, expiresAt }]`. `owner` = this page load.
- `Club.holds`: `MINUTES` (5), `place({ date, time, places, source })`, `release()`, `holding(date, time)`, `mine()`, `heldByOthers(date, time)`, `subscribe(fn)` (other tabs, or someone else's hold running out), `timer({ hold, what, onExpire })` -> `{ stop }`, `stopTimer()`. Releases on `pagehide`.
- `Club.teeHeads(taken)`: the four-person head count HTML (css/holds.css).
- Availability: `Pub.daySlots` and the portal's `daySlots` subtract `heldByOthers` (slot gains `held`, state `'held'` when nothing is left); `Pub.recheck` and `checkBooking` (code `'held'`) refuse held places.
- Public tee time players brought as guests also carry `firstName`, `lastName`, `email`.

## Language (French / English)
`Club.i18n` (js/core/i18n.js; member.html and public.html only): `lang()`, `set(lang)` (saves `stboniface.lang`, reloads), `toggle()`, `add({ strings: { 'Exact English': 'Français' }, patterns: [[RegExp, replacement or fn(m, ...groups)]] })` (a function returning null or m means "not this one"), `t(english)`, `translate(root)`, `missing()` / `clearMissing()` (developer aid), `switcher(cls)`, `switchRow(cls, iconHtml)`. Dictionaries queued before the engine go through `window.__i18nQueue`. French mode replaces Club.fmt at runtime and maps en-* / undefined locales in toLocale*String and Intl.DateTimeFormat to fr-CA (`toLocaleDateString('en-CA')` with no options is kept: it is the yyyy-mm-dd idiom). `[data-i18n-skip]` opts an element out.
