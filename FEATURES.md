# Feature build (Oct 2026): shared contracts

Read SPEC.md (design + API), PORTAL.md (portal), CLUB.md (St. Boniface facts, never invent facts about the real club)
before this file. These contracts let four engineers build in parallel; follow them exactly.

## Shared helpers already built (js/core, do not edit)
### `Club.teeRules` (js/core/teerules.js)
- `tierRules(member)` -> `{ advanceDays, windows, tierName, golf }` (windows null = unlimited, Eagle)
- `memberCanPlay(member, iso, 'HH:MM')` -> `{ ok, reason }` (category play windows; weekends + Manitoba holidays use weekend windows)
- `bookingOpen('member'|'public', memberOrNull, iso, todayIso?)` -> `{ ok, reason, opensOn, advanceDays }` (members: tier advanceDays 15/13/8; public: 7)
- `publicSlot(iso, time)` -> `{ ok, reason, rate, band: 'weekday'|'twilight'|'weekend', label, requiresMember }`
- `greenFee(iso, time, holes)` -> number (public golfers and members' guests; 9 holes = 60%)
- `isHoliday(iso)`, `holidayName(iso)`, `isWeekendOrHoliday(iso)`, `PUBLIC_ADVANCE_DAYS`, `RATES`
### `Club.cards` (js/core/cards.js, css/cards.css)
- `Club.cards.mount(containerEl, { onChange })` renders a brand-styled card picture plus number/name/expiry/CVC fields
  with live brand detection (Visa, Mastercard, Amex, Discover, Diners, JCB, UnionPay), formatting, flip-to-back for CVC.
- `.validate()` -> `{ ok, errors, card: { brand, brandName, last4, expMonth, expYear, name } }`. **Never store full card
  numbers or CVCs**; store only brand, last4, expMonth, expYear, name.
- `Club.cards.mark(brand, heightPx)` -> small brand logo HTML (for saved cards, receipts: "Visa ending 4242").

## Data contracts (new or extended)
- **Tee time players** gain a third type: `{ memberId: null, name, type: 'public', publicPlayerId, cart, paid }`.
  Tee times may carry `source: 'public' | 'portal' | 'staff'` and `bookedBy` (memberId or publicPlayerId).
- **`publicPlayers`** (owner: public site): `{ id, firstName, lastName, email, phone, postalCode, createdAt,
  password: <demo only: store a simple hash string, never plain text>, cards: [{ id, brand, last4, expMonth, expYear, name }],
  marketingOptIn }`. Email unique (case-insensitive).
- **`publicPayments`** (owner: public site): `{ id, publicPlayerId, teeTimeId, date, amount, tax: 0 (green fees are tax
  included), brand, last4, status: 'paid' | 'refunded', refundedOn, description }`.
- Members' **card payments** keep writing to `payments` with `method: 'Card'` and add `brand`, `last4`.
- **`functions`** (owner: weddings module): weddings and special events in the Banquet Hall (220 seats):
  `{ id, type: 'Wedding'|'Social'|'Corporate'|'Celebration of life'|'Holiday party'|'Meeting', name, contactName, email,
  phone, date, start, end, guests, space: 'Banquet Hall'|'Meeting room'|'Gallery Taphouse & Grill', stage:
  'Enquiry'|'Tour booked'|'Proposal sent'|'Deposit paid'|'Confirmed'|'Completed'|'Lost', packageId, menuNotes, notes,
  quote: { lines: [{ label, qty, unitPrice }], subtotal, tax, total }, deposits: [{ date, amount, method, last4 }],
  history: [{ at, stage, note }] }`.
- **`functionPackages`** (owner: weddings module): `{ id, name, kind: 'Wedding'|'Event', perGuest, minimumGuests,
  includes: [] }` (prices are placeholders; CLUB.md: all-inclusive packages, 220 seats, complimentary parking).
- **`outings`** (owner: outings module): tournaments and corporate golf: `{ id, organization, contactName, email, phone,
  date, format: 'Shotgun'|'Tee times', start, players, packageId, holes: 18|9, stage: 'Enquiry'|'Quoted'|'Deposit paid'|
  'Confirmed'|'Completed'|'Lost', addOns: [], quote: {...}, deposits: [...], teeBlockId, notes, history: [] }`.
  Confirming a shotgun outing writes a `teeBlocks` doc (reason: '<Organization> shotgun') and stores its id.
- **`outingPackages`** (owner: outings module): built from the club's 2026 tournament PDF
  (`/private/tmp/claude-502/-Users-murad-Documents-Golf-Course/55fa76ba-4b7c-4fd7-b34b-b831b2445db3/scratchpad/stb/tourn.pdf`).
- **`leagues`** (owner: league feature in events): `{ id, name, night: 'Wednesday', startTime, season, format:
  'Stableford'|'Stroke play'|'Match play', weeks: [{ date, teeBlockId?, results: [{ memberId, points, gross }] }],
  members: [memberId], status }`. Standings are computed (points total, rounds played, best week).
- **Player names in the members' portal**: friends (and the member's own guests) show in full; everyone else in a group, members, other people's guests and public golfers, shows as first name and last initial ("Tom R."), via `Portal.playerLabel` in js/portal/kit.js. Nobody can opt out. Staff screens show full names. The member directory, friend search and requests keep full names so members can find each other.
- **Friends (members' portal)**: `friendships`, `memberMessages`, `messageReports` and `memberPrivacy`, owned by
  js/portal/friends.js (schemas in SPEC.md, behaviour in PORTAL.md). Request and accept, private messages between friends,
  block and report. Each member chooses what friends see (tee times, handicap, scores and results). Reported messages
  show in the staff dashboard "For your attention" list (dashboard.js) with Dismiss and Contact member.
  Per-friend tee time sharing (`friendSharing`: can see, can join without asking) and requests to join (`joinRequests`):
  approve books through the same Tee times checks; requests expire when the tee time passes.

## New staff modules (script and css tags already in index.html)
| id | label | section | order | icon | file |
|---|---|---|---|---|---|
| functions | Weddings & Events | Hospitality | 15 | events | js/modules/functions.js |
| outings | Group Outings | Golf | 35 | flag | js/modules/outings.js |

## Public site
`public.html` (new page, no staff or member chrome): St. Boniface public tee times. Loads js/core (not app.js), the
staff modules only for seed data via js/portal/shim.js (like member.html), then js/public/*.js. Public players must
create an account (sign up / sign in) before booking.

## Beverage cart: order to the course (Nov 2026)
  - Golfers can edit an open order (change quantities, remove items, update the note) until the cart starts driving to them, from "Edit order" on the order card; removing everything cancels it. Prices stay as ordered and each change is logged on the order for staff. Earlier orders are listed under "Your orders".
Golfers order food and drink from the course; the beverage cart delivers. Dispatch rules are the client's
`cartDispatch.ts`, ported unchanged (types stripped) to `js/core/cartdispatch.js` as `Club.cartDispatch` (pure
functions). `js/modules/cart.js` owns the data (`cartMenu`, `cartOrders`, `$cartFleet`; schemas in SPEC.md) and exposes
`Club.cart` for every page: `placeOrder`, `golferStatus`, `moveGolfer`, `cancelByGolfer`, and the cart actions
`startShift`, `go`, `delivered`, `restock`, `backOnCourse`, `endShift`, `cancelByStaff`. Each change reads the fleet,
calls one dispatch function and writes it back; other tabs update through store subscribe and the storage event.
- **Who orders**: members in the portal (`#/cart`) and signed-in public golfers (`public.html#/cart`), with a tee time
  today and at least one cart on shift. Otherwise the page shows `cartBanner` ("Cart service is closed right now").
  Ordering opens at the tee time (see "Ordering window and location" below); the demo accounts only need a tee time today.
- **Flow**: menu by category (steppers; sold out dimmed), "Where are you?" hole (from the phone's location when it
  is already allowed, "From your location. Change it if that's wrong."; else estimated from when the group teed off
  (`teedOffAt`: the start staff recorded, or the booked time if that start is over 30 minutes earlier) and
  MINUTES_PER_HOLE when reasonable, "You teed off at 8:00 AM, so you're probably on hole 4 by now."; else required) and "We started on 1 / 10", optional note, payment (members:
  "Add to my account" or "Pay at the cart"; public: pay at the cart), sticky bar "3 items · $17.50 · Place order".
  A second order from the same golfer merges into the open order and says so (merge key: golfer id + tee time).
- **Live status card**: `golferMessage` ("You're 3rd in line"), `golferText` once the cart taps Go (its SMS line
  "Reply with your hole number" reads "Tap “I’ve moved” below" in the app), "I’ve moved: I’m on hole …"
  (`updateGolferHole`), Cancel until the cart is heading to them, then Delivered or Cancelled.
- **Payment**: "Add to my account" posts `Club.chargeMember` (category Dining, source `cart`) when the cart marks it
  delivered, so it shows on the statement and in staff billing. Pay-at-the-cart orders record "Paid: card / cash".
  Prices include tax. Alcohol items show "ID may be checked".
- **Staff, Beverage cart (Hospitality)**: My cart (phone-first): start a shift (pick yourself or type a first name,
  cart 1 to 3) or use this phone for a cart already on shift; big Next stop card (hole from `whereIs`, group, items,
  payment and total, note); Go, Delivered (optional "found them at"), Restocking (back in 5 / 10 / 15 min), Back on
  course, End shift (the last cart's orders are cancelled and golfers told); the rest of the line below. Clubhouse:
  carts and lines, an SVG course map of NODES with carts and waiting orders, today's orders and totals (account, card,
  cash), staff cancel. Menu: add, edit, remove, sold out toggle.
- **Entry points**: Home shows a highlighted "Order" quick action when the member plays today and the cart is out (or
  an order is open); My tee times links to it; the public site adds "Order to the course" to its nav for a golfer who
  plays today.
- **PLACEHOLDER menu, confirm with the club**: water, pop, sports drink, coffee, domestic beer, cooler, chips,
  chocolate bar, granola bar (seeded sold out), hot dog, sandwich at plausible prices. No real products or tap beers
  are named. Staff can change everything.
- **Demo**: once a day the module sets up the demo so it works at any hour: Dave Nerada (mem_1003) and the public test
  account Alex Morgan (alex.morgan@example.com, password golfdemo1) get a tee time today if they have none; cart 1 is on
  shift with Amara (Amara Osei, a server in the staff list) and two members' orders in line; two delivered orders
  give the clubhouse view totals. Staff can start a shift at any time of day.
- The device remembers which cart it drives (localStorage `stboniface.cart.device`). As the client's notes say, a real
  deployment must apply fleet changes one at a time on the server; here the browser store is last-writer-wins.

## Golf Canada score posting: DEMO (Nov 2026)
A clearly labelled demo for Golf Canada and members while the club applies for API access. **Nothing connects to Golf
Canada.** Every screen that would talk to Golf Canada says so; scores are saved only in the demo's `scorePosts` collection
(schema in SPEC.md) and `members.handicap` is never changed. Code: `js/portal/scores.js`, `css/portal/scores.css`.
- **Course data**: par, stroke index and yardage come from the store's `holes` (the club scorecard: Black, Green, Silver).
- **Ratings: PLACEHOLDERS, replace with the club's official ratings.** The data has no course rating or slope rating for
  this course. Everything that needs them uses `DEMO_RATINGS` at the top of js/portal/scores.js (one constant, marked
  "placeholder values for the demo only") and is labelled Demo or Placeholder in the UI. A nine-hole round uses half the
  18-hole rating with the same slope (also a placeholder). Playing conditions (PCC) show "Calculated by Golf Canada" and
  count as 0. No rating or slope figure in this file or the app is a real value for St. Boniface.
- **Entry points**: My tee times, Past rounds: "Post score" on a completed round (or "Posted 78"); the tee time detail
  sheet offers it for a checked-in or on-course round once it has had time to finish. Home: one prompt, "Post your score
  from Mon 4:42 PM", for the newest unposted round of the last 7 days (on phones it takes one Coming up row so Home stays
  within 1.5 screens). Profile > Golf: Post a score, Score history, Link Golf Canada account. `#/scores` (not in the main
  nav): score history (10 rows, then Show all), rounds to post, and "Post a score for another round" (date, 9 or 18 holes,
  which nine, tees).
- **Flow** (`#/scores/post/<teeTimeId>` or `#/scores/post`), one decision per step with the sticky action bar:
  Round (prefilled from the tee time: date, time, holes, playing partners; tees) > Score (hole by hole by default, one row
  per hole with par and stroke index and a stepper starting at par, Front 9 / Back 9 on phones and both nines side by side
  from 768px; or Total only) > Attest (optional: a playing partner who is a friend, `Portal.friends.friendsOf`; other
  members, guests and public golfers are listed but cannot be picked) > Review sheet with the demo banner and
  "Post to Golf Canada (demo)" > confirmation.
- **Maths (World Handicap System)**: course handicap = index x slope / 113 + (rating - par), nine holes use half the
  index; net double bogey per hole = par + 2 + strokes received (by stroke index; a plus handicap gives strokes back from
  the easiest holes). Total only posts the entered total as the adjusted score. Differential = 113 / slope x (adjusted -
  rating); a nine-hole score adds the expected nine-hole differential (0.52 x index + 1.2), a demo approximation.
  Demo estimate = average of the lowest differentials of the last 20 (WHS table: 3 scores: lowest 1 minus 2.0 ... 12 to 14:
  lowest 4 ... 20: lowest 8), rounded to a tenth; Golf Canada's caps and exceptional score reduction are not applied.
- **After posting**: the confirmation shows "New handicap index" with "Demo estimate" and how it was worked out; the
  official index stays as it is. Profile > Golf draws the index history with a dashed line to the latest demo estimate.
- **Link Golf Canada account** (Profile > Golf): the member's stored Golf Canada number, "Not connected (demo)", and a
  sheet explaining what linking will do once the club has access. No login, nothing sent.
- **Seed**: 12 past posts for Dave (mem_1003) across this season (`demo: true, seed: true`), differentials around his
  handicapHistory (6.2 to 7.0); the two that fall on days with one of his completed 18-hole tee times are linked to them.
  None of Dave's seeded playing partners are his friends, so attestation from a tee time shows the partner as "Not on
  your friends list"; posting a round not booked in the app offers his friends.

### Call the cart (Nov 2026)
Golfers who would rather pick from what is on board can call the cart instead of ordering from the menu.
- **Golfer side** (portal and public, the shared `Club.cartOrderView`): a "Call the cart to you" card above the menu
  ("The cart comes to your hole and you choose from what's on board", "Call the cart"). Its sheet asks for the hole
  (same estimate as orders), an optional note ("e.g. 4 of us, mostly beer") and, for members, "Add to my account" or
  "Pay at the cart". The status card works as for orders (place in line, "Amara is heading your way…", I've moved,
  Cancel visit, Edit note) and reads "Cart visit · you'll choose from the cart". The card is hidden while an order is
  open (the cart is coming anyway). Ordering items while a visit is open merges them into it and it becomes a normal
  order. "Your orders" shows visits with what was bought ("Cart visit · 2 × Domestic beer, can", "$15.00 · Charged to
  your account") or "Cart visit · nothing bought". Home and My tee times offer "Order or call the cart".
- **Cart staff**: the next stop for a visit says "Cart visit: they'll choose from the cart" with the note and payment
  preference. Delivered opens "What did they buy?": quick steppers over the menu (sold out hidden), a running total,
  payment (Charge to account only for a member who chose it, preselected; otherwise card or cash) and "Nothing
  bought" (no charge). Lines and today's orders label visits; delivered visits count in today's totals.
- **Data**: `Club.cart.callCart({ golfer, hole, note, payment })`; a `cartOrders` doc with `kind: 'visit'` (SPEC.md).
  The dispatch rules are unchanged: a visit is an ordinary dispatch order.
- **Demo**: one member's visit ("4 of us, mostly beer", on account) is seeded in the demo line.
- On the cart pages toasts never take a tap and move to the top while a sheet is open, so a confirmation cannot
  cover the sheet's main button on a phone.

### Group stops and location updates (Nov 2026)
- **Group stop**: golfers on the same tee time who order (or call the cart) share one dispatch entry, keyed
  'group:' + teeTimeId through the dispatch's own merge. The group keeps the earliest order's place, nobody is bumped by
  their own group, and the cart stops once. Each golfer keeps their own order, bill and payment (`groupId` links them).
  Each golfer sees their own status plus "Grouped with Victoria S.'s order. The cart stops once for your group."
  (portal names follow Portal.playerLabel: friends in full, others "First L."; the public site always shortens).
- **Cart staff**: the next stop reads "Hole 5 · Nerada group · 2 orders" with each golfer's items, payment and total.
  Delivered opens a list of the group's orders; each is recorded on its own (its own account charge, or card / cash;
  visits through "What did they buy?"). One golfer can cancel without affecting the others; the stop leaves the line
  when none remain.
- **Location**: the newest order's hole becomes the group's location (updateGolferHole on the entry), and "I've moved"
  from anyone moves the whole group. When a golfer with an open order opens the order page or Home and the location
  is 10+ minutes old, they get "Cart's on its way. Still on hole 14?" (Yes / Change hole), at most once every
  10 minutes per golfer and never while the cart is heading to them. Yes sets the group to the predicted hole
  (whereIs) with holeAt now. On Home it is pinned above the bottom nav, so Home keeps its length.
- **GPS**: while an order is open the golfer's phone shares its position (see "Ordering window and location"); a fix
  under 2 minutes old, accurate to 150 m and on the club premises is mapped to a hole by `Club.holes.locate`
  (js/core/holes.js): the nearest of the 18 OpenStreetMap hole lines (tee to green), where holes within 35 m of the
  nearest count as just as close and the group's predicted hole or the next one wins; two ahead or one behind cost
  20 m; nothing within 90 m of a hole gives no update. The nearest tee box alone (`nearestNodeFromGps`, still used for
  the cart's own position) picked the wrong hole two times in three along the fairways. Hole lines and tee positions
  from OpenStreetMap, to be confirmed by the grounds crew.
  Call the cart and the order page prefill the hole from that fix (`Club.cart.holeFromLoc`). A hole the golfer picks
  by hand (on the form, in Call the cart, or "I've moved") wins over GPS: the order stores `holeHold` (the GPS hole at
  that moment) and fixes there are ignored until a phone in the group reaches a different hole.

### Ordering window and location (Nov 2026)
- **Window**: ordering and Call the cart open at the tee time itself, or earlier once staff mark the group checked in
  or on the course, and close when the round is complete. Before then the order page says "Ordering opens at your
  2:45 PM tee time."; the Tee times link shows the same line and the Home quick action stays hidden until it opens.
  The demo accounts (Dave mem_1003 and the public test account) keep their exemption so the demo works at any hour.
- **Location is required** to place an order or call the cart (enforced in `Club.cart` as well as the page). On first
  use a sheet explains "The cart uses your location to find your group. It's only used while your order is open."
  and asks through navigator.geolocation (a fresh fix, never a cached one). If permission is denied or unavailable,
  the page shows "Turn on location to order" with how to allow it in the browser or phone settings, and a Try again
  button; nothing is placed.
- **At the club**: the fix must be on the club premises: `Club.premises.contains(lat, lon, 50)` (js/core/premises.js),
  the OpenStreetMap boundary of relation 7194105 (308 points, © OpenStreetMap contributors, ODbL) with a 50 m buffer
  for GPS drift and the parking edge. Otherwise "You need to be at the club to order from the cart." The fix must also
  be under 2 minutes old and accurate to 150 m. TEE_GPS (tee positions from OpenStreetMap, to be confirmed by the
  grounds crew) only maps the fix to the nearest hole, which becomes the group's location.
- **Sharing is mandatory while an order is open** (no toggle): one watcher (`watchPosition`) runs on any page of the
  portal or public site while the golfer has an open order or visit, and moves the group (updateGolferHole) when the
  nearest hole changes. At order time the status card says once: "Your location is shared with the cart while your
  order is open, so it can find your group. It's only shared while this page is open in your browser. If you close it,
  the cart uses the last hole we know. It stops when your order is delivered or cancelled." While open it shows
  "Sharing your location while this page is open." If location is turned off mid-order the order stays, the card shows
  "Location off: the cart is using hole N" and "Still on hole N?" covers it. Watching stops when the order closes.
- The order keeps `locShared: true` and `gps: { at, accuracy }`; the raw coordinates are kept only while the order is
  open and are cleared on delivery or cancellation. Demo accounts skip the check (`locSkipped: 'demo'`) and see a small
  "Demo: location check skipped" note, so the demo works on a desktop. The cart staff page is unchanged apart from the
  "Map data © OpenStreetMap contributors" credit under the Clubhouse course diagram.

## Receipts (Nov 2026)
Client request: anything paid or ordered makes a receipt the person can open again later. One engine,
`Club.receipts` (js/core/receipts.js, css/receipts.css; doc shape in its header), keeps them in `receipts`, numbered
R-000001 up, with one design on all three sites and a "Print or save as PDF" button. Prices on receipts include tax.
- **What creates them.** Every `Club.chargeMember` call (any account charge or credit) makes one, with the caller's
  `title` and item `lines`: beverage cart (source `cart`, refId the cartOrders id, item lines with sizes), pro shop
  (`pos`, refId the sale, tax-included unit prices), dining checks (`dining`, dishes plus the service charge), tee sheet
  guest green and cart fees (`teesheet`), event registrations and credits (`events`), lessons and academy programs
  (`lessons`), dues, F&B minimums and manual charges (`billing`, `manual`). Money taken without a charge makes its own:
  beverage cart orders paid at the cart by card or cash (member or public golfer), a member's dining check settled by
  card, payments staff record in Billing (`billing`, with the payment id), and public tee time payments and their
  refunds (`public`, refId the publicPayments id; a refund is a credit receipt). Walk-in sales with no member or
  public golfer get none (the pro shop till still prints its own slip at the counter). Charges and payments from before
  receipts, and earlier public payments, were backfilled once (`$receiptsBackfilled`, `$publicReceiptsBackfilled`).
- **Where they are found.** Public site: My account, Receipts (tee times, refunds and beverage cart purchases, newest
  first); each booking on My bookings keeps its Receipt button (and Refund receipt once refunded). Staff: Billing,
  a member's account, Receipts panel (open and reprint any); Beverage cart, Clubhouse, Today's orders, a Receipt link
  on each delivered order that has one. Members' portal: see PORTAL.md.

## November 2026 additions

### Become a member (public site, `#/join`)
- The new-member offer as the club states it (stbonifacegolfclub.com/Golf/Membership, Nov 2026): $100 share and $250 initiation fee plus GST waived in the first year, plus a one-time 50% joining bonus as club account credit (25% for first-season club purchases, 25% in year two toward share and initiation fee if applicable, remainder toward later dues).
- The four categories with what each includes, the age range and annual dues from `membershipTiers` (labelled a guide; dues are placeholders). Time payment from sign-up until August is mentioned.
- Full categories (Young Adult and Junior by default) show "Join the waitlist"; open ones show "Apply". The form (`#/join/apply/<category>`) collects name, email, phone, date of birth (checked against Junior and Young Adult ages), category, and optionally handicap, how they heard, members who know them and notes, plus consent; prefilled for a signed-in public golfer; no payment online.
- Staff Applications: Online badge, date of birth and age; a "Waiting lists" panel (Offer a place moves the person to Received); a "Categories" panel with an Open / Full switch per category that the public page follows live.

### Tee time waitlist
- When a day or time is full, members (Tee times: "Full · notify me" times, "Notify me if a spot opens" on a full part of the day, or the fully booked days line) and public golfers (the button on a fully booked day) join a waitlist for an exact time or part of the day (any, morning before 11:00 AM, midday 11:00 AM to 2:00 PM, afternoon after 2:00 PM) for 1 to 4 players. One entry per golfer per day.
- Every cancellation path (portal cancel, withdraw, remove a player, Friends withdraw; public cancel; staff cancel, remove a player, move a group, release blocked times) calls `Club.waitlist.released()`, which tells golfers in joining order, skipping anyone whose group does not fit or who could not book that time under `Club.teeRules`. The golfer told has 30 minutes before the next one hears about the same spot; booking is never blocked.
- Notices are not pop-ups: portal Home and Tee times, public My bookings and My account, each with a Book link (`#/tee-times/<date>/<HH:MM>/<players>`, `#/book/<date>/<HH:MM>`). Entries close as booked, return to the list if the spot is taken first, and expire once the time has passed.
- Staff tee sheet: "N waiting" per row and a Waitlist panel per day with contact details, place in line, status, Remove and the notification history.

### Gift cards
- Sold on the public site (by card, signed in or as a guest) and in the members' portal (on account or by card). Preset amounts and the custom range are placeholders (`$giftCardSettings`), editable on the staff Gift cards page. Each card has a 12-character code (no 0, O, 1, I or L), a balance and a history.
- Redeem at the pro shop till, when closing a Gallery check, on the public tee time payment step, at takeout checkout, or by hand on the staff Gift cards page (green fees and other golf shop charges). Partial use keeps the rest; voiding stops the code everywhere. A refunded public tee time puts the gift card part back on the card.
- Purchases get one receipt each; redemptions appear as the payment method on that sale's receipt (e.g. "Gift card ending 7KQ2 and Visa ending 4242"). Anyone can check a balance on the public Gift cards page.

### Takeout
- Gallery menu items (`menuItems`, available, without "On tap"). Members order in the portal (account, card or gift card); public golfers and guests (name, phone, email) on the public site (card or gift card).
- Pickup rules (`$takeoutSettings`): hours 7:00 AM to 9:30 PM and the 30-minute lead time are placeholders; breakfast until 2:00 PM and Friday Night Pizza on Fridays from 5:30 PM come from the club.
- Staff queue (Hospitality > Takeout): New, Ready, Picked up, Cancelled; pause online orders; edit hours. Status shows live to the customer. Cancelling (staff, or the customer while new and at least 30 minutes before pickup, a placeholder) refunds with one credit receipt. Every order gets one receipt.

### 2027 renewal (`#/account/renew`)
- Dues are the tier's `annualDues` (placeholders). Plans: pay in full, or equal monthly instalments from the renewal month until August 2027 (first on the renewal date, then the 1st of each month, last takes the rounding cents). Club fact: yearly dues can be spread from the sign-up date until August.
- Review sheet, then one renewal and one charge (category Dues, receipt "2027 membership renewal"); later instalments post automatically (`Club.billing.renewal.postDue()`). Staff: Billing > 2027 renewals tab and a renewal line on each member's account.

### Season summary (`#/account/summary`)
- All charges and payments this calendar year: totals, by department, by month, top items, payments and credits. "Download summary" prints the summary only.

### Visit feedback
- Never pops up: members' portal "Rate your visits" (`#/feedback`, linked from My account and the More menu) and a section on the public My account page. Completed rounds, meals and lessons from the last 14 days; one tap 1 to 5, optional comment, changeable for 14 days.
- Staff: Administration > Visit feedback: averages for rounds, meals and lessons, weekly trend, low ratings (2 or under) with Mark followed up, recent comments, filter by type.

### Header More menus
- Public site and members' portal: links that don't fit the header move into a More menu (public: Members sign in first, then later-added pages; portal: from the end of the list), so nothing overflows at any width and every page stays reachable. The public phone menu also lists registered pages.

### French / English (public site and members' portal)
- An EN | FR switch in the header and the phone menu (public site and portal) and in the portal's Profile. The choice is kept per device (`stboniface.lang`) and the page reloads in that language. The staff site stays English and does not load any of this.
- js/core/i18n.js translates the rendered page in French mode only (text nodes and placeholder, aria-label, title, alt; never what people type); English mode installs nothing. Dates, times and money follow fr-CA ("jeudi 5 novembre 2026", "13 h 30", "1 234,50 $", handicap "6,2").
- Dictionaries: js/i18n/fr-shared.js (receipts, pickers, cart golfer view, gift cards, takeout, waitlist, feedback, tee rules, generic UI), fr-public.js (public pages; inactive on member.html), fr-portal.js (portal pages; inactive on public.html). Canadian French: heure de départ, voiturette, normale, indice de handicap, boutique du pro, droits de jeu, carte-cadeau, pour emporter, cueillette, reçu, liste d'attente, cotisation, relevé; déjeuner / dîner / souper.
- Kept in English on purpose: names (club, Gallery Taphouse & Grill, Taphouse Bar, people), membership category names (Eagle, Birdie, Young Adult, Junior), and data staff type (event names, menu items, notices, product names).
- Not reachable by the page translator: the downloaded calendar (.ics) files, text inside the logo image, the meta description, and SVG text other than charts.

## Growth analytics in Reports (Nov 2026)
The Reports page was rebuilt on Nov 10, 2026 (see "Reports redesign" below). The analytics added on Nov 9 live in its Members, Growth, Golf and Food, drink and shop sections.

### New things recorded
- Public golfers: optional, unticked "Email me club news and offers" at sign-up, changeable in My account (Email preferences).
- "How did you hear about us?" (optional) on the online application, public account sign-up and the staff New application form. Stored in English whatever language the form was shown in.
- Tee times record when they were cancelled (from now on).
- Daily weather is saved (`weatherLog`) from the live forecast service the site already uses; demo days are marked.


# Commerce and accounting build (Nov 9, 2026): shared contracts

**Status: built and integrated (Nov 9, 2026).** The final shapes and APIs are in SPEC.md (November 2026 table) and PORTAL.md;
the contracts below are kept as the build record. Integration fix: a receipt counts as a member account payment only when its
`paymentId` is a real `payments` doc (tee sheet shop receipts carry `tsp_…`).

Four builders work in parallel: **A** booking extras (promo codes, add-ons, discounts, tee sheet shop payments), **B** daily
close, **C** accounting export, **D** online golf shop. Read SPEC.md, PORTAL.md and CLUB.md first. Every script and
stylesheet tag below is already in the HTML pages; placeholder files exist. **Do not edit index.html, member.html,
public.html, SPEC.md or this file** (the coordinator merges docs at the end: put a short "Docs" section in your final report).

## File ownership (edit only your own; read anything)
| Builder | Owns (may edit) |
|---|---|
| A | js/core/addons.js (new), js/public/book.js, js/public/site.js, js/public/me.js, js/portal/teetimes.js, css/portal/teetimes.css, js/modules/teesheet.js, css/modules/teesheet.css, js/modules/settings.js, css/modules/settings.css, css/public.css (booking parts), js/i18n/fr-booking.js (new) |
| B | js/modules/accounting.js (new), css/modules/accounting.css (new), js/modules/functions.js and js/modules/outings.js (deposit receipts only) |
| C | js/modules/accounting-export.js (new), css/modules/accounting-export.css (new) |
| D | js/core/shop.js (new), css/shop.css (new), js/public/shop.js (new), js/portal/shop.js (new), js/modules/proshop.js, css/modules/proshop.css, js/i18n/fr-shop.js (new) |
| coordinator (done) | js/core/promos.js + css/promos.css (Club.promos), `tenders`/`channel` on receipts (js/core/receipts.js), giftcards.receipt fills tenders and takes `online: true` |

Anything outside your list: stop and say so in your report instead of editing it. Shared files you must not edit:
js/core/* other than yours, js/i18n/fr-shared.js, fr-public.js, fr-portal.js (put French strings in your own fr-*.js via
`Club.i18n.add` / `window.__i18nQueue`, same pattern as fr-shared.js).

## Club.promos (js/core/promos.js, built)
See the header comment in the file. Collection `promoCodes`. Lines are `{ label, amount, kind: 'greenFee'|'cart'|'addon'|'shop' }`.
`check(code, ctx)`, `quote(promo, lines, ctx)`, `redeem(promoId, { source, refId, discount, publicPlayerId, memberId })`,
`release(source, refId)`, `applyBox(host, { site, ctx(), lines(), onChange })`. Promo first, then gift card, then card.
Discount shows on receipts and payment lines as a negative line `'Promo code FALL20'`. Uses: source `'public'` (refId =
publicPayments id) and `'shop'` (refId = shopOrders id). Promo codes are for public golfers and the online shop only.
Members get no pro shop member discount online. Since Nov 10 a member may enter a promo code when booking a tee time in the portal (see A below).

## Receipts: tenders and channel (built)
`Club.receipts.create` now keeps `tenders: [{ method: 'card'|'cash'|'account'|'gift'|'other', amount, online?, ref? }]` and
`channel: 'online'|'counter'`. **Every new place that takes money must pass both.** Online card payments (public site,
portal) are `online: true`, channel 'online'. Money taken at a till (golf shop, Gallery, cart, tee sheet check-in) is
channel 'counter'. `Club.giftcards.receipt(o)` fills tenders from the gift and rest parts; pass `online: true` for online.

## A: add-ons, promo codes, staff discounts, tee sheet shop payments
- `bookingAddons` (js/core/addons.js, `Club.addons`): `{ id, name, price (tax included, 18 holes), price9 (9 holes; null = same), per: 'player'|'booking', active, order, placeholder: true }`.
  Seed placeholders: Rental clubs (per player), Pull cart rental (per player), Sleeve of balls (per booking). Prices are placeholders
  ("set real price"), never presented as the club's real prices. `memberOk: bool` on each add-on says whether members can pick it; since
  Nov 10 the pull cart rental is offered to members too (`$addonsVersion` 2 migrates an untouched "Pull cart" seed to that name and flag).
- Portal promo codes (js/portal/teetimes.js, Nov 10): "Have a promo code?" in the Book sheet (Club.promos.applyBox, site 'portal', ctx with
  memberId). A code reduces only what posts to the member's account at check-in (guest green fee, carts, add-ons); their own golf is
  covered by dues, so a green-fee code with no guest reports "This code applies to green fees. Your golf is covered by dues." The discount
  rides on the booking member's player as a negative add-on line `{ addonId: 'promo', name: 'Promo code X', qty: 1, price: -d, promoId, code }`
  so the staff sheet quotes and posts it unchanged (a credit on the account with its receipt), and is recorded like an online booking: a
  `publicPayments` record (amount 0, status 'account', memberId, source 'portal', promo) for the sheet's Promo pill, plus
  `Club.promos.redeem` (source 'portal', refId that record). A change re-quotes the discount (`Club.promos.amend`); cancelling, withdrawing
  or losing every eligible line refunds the record and releases the use.
- Tee time player gains `addons: [{ addonId, name, qty, price }]` (per player or on the booker for per-booking items).
  Public: priced and paid online at booking, lines kind 'addon'. Members (portal + staff): picked at booking, posted at check-in with
  `Club.chargeMember` (category 'Golf', source 'teesheet', refId tee time id) like the cart fee.
- Public booking: add-ons on the Players step; promo box (`Club.promos.applyBox`) on Payment above the gift card box; `publicPayments`
  gains `promo: { promoId, code, discount }|null`, lines include the negative promo line, `amount` is after discount; `Club.promos.redeem`
  after payment; refund (me.js) calls `Club.promos.release('public', paymentId)` and refunds the amount actually paid.
  `Pub.ensureReceipts` must write `tenders` (online card) and `channel: 'online'`.
- Staff tee sheet: show add-ons and promo on the booking; staff can give a **manual discount** at check-in to a public golfer or a guest paying
  at the shop: amount or percent, required reason, recorded on the player `discount: { amount, reason, by, at }`.
- **Tee sheet shop payments** (needed by B): when staff mark a public golfer or shop-paying guest as paid at the shop, ask Card / Cash
  (and gift card via the existing till widget if easy), record `paidWith: 'card'|'cash'|'gift'` on the player, and create a receipt:
  source 'teesheet', refId tee time id, channel 'counter', tenders, lines = green fee, cart, add-ons, discount. Unticking paid makes a credit receipt.
- Settings gets a **Promotions** tab: list codes (status: active, scheduled, expired, off), uses and dollars given away, create/edit/
  duplicate/turn off (no delete once used), all fields of the promo doc with validation (code unique, percent 1-100, end after start).
  Also an **Add-ons** section to edit add-on names, prices and on/off.

## B: daily close (new staff module `accounting`, label "Accounting", section Administration, order 15, icon 'billing' or 'cash')
- Register with Club.register. Tabs: **Daily close** (default), **Close history**, plus tabs added by C. Expose before registering:
  `window.__accountingTabs` queue: C pushes `{ id, label, order, render(panelEl, ctx) }`; B renders them after its own tabs, sorted by order
  (read the queue at render time, so load order does not matter).
- `Club.accounting = { DRAWERS, classify(receipt), summarize(date), closeFor(date), isClosed(date) }` defined at load:
  - `DRAWERS`: `[{ id: 'shop', name: 'Golf shop' }, { id: 'gallery', name: 'Gallery Taphouse & Grill' }, { id: 'cart', name: 'Beverage cart' }]`.
  - `classify(r)` -> `{ id, date, dept: 'golf'|'proshop'|'dining'|'takeout'|'cart'|'events'|'lessons'|'giftcards'|'dues'|'payments'|'functions'|'outings'|'other',
    drawer: 'shop'|'gallery'|'cart'|null, online: bool, sign: 1|-1 (credit -1), tenders: [{ method, amount, online }] }`. Uses `r.tenders` when present,
    else derives (method + total; a gift card part from `giftCards` history `refId`, `publicPayments.giftAmount/cardAmount`). Online = channel 'online'
    or source in public/portal/online sources. Drawer by source: proshop, teesheet, giftcards, desk, shop (pickup payments only) -> 'shop';
    dining, takeout (paid at the counter) -> 'gallery'; cart -> 'cart'.
  - `summarize(date)` -> `{ date, receipts: [classified], byTender: { card, cash, gift, account, other, onlineCard }, byDept: { dept: net },
    drawers: { shop: { cash, card, gift }, … }, deposits: [...], memberPayments: total, giftCardsSold: total, refunds: total }`.
- `dailyCloses` collection: `{ id: 'close_YYYY-MM-DD', date, status: 'closed'|'reopened', drawers: [{ id, float, counts: { '100': n, '50': n, '20', '10', '5', '2', '1', '0.25', '0.10', '0.05' }, counted, expectedCash, overShort }],
  cardBatch: { expected, terminal, diff }, onlineCard, totals (copy of summarize at close), notes, closedBy (staffId), closedAt, reopenedAt?, reopenedBy?, reopenReason?,
  exports: { quickbooks?: ISO, sage?: ISO, gl?: ISO } }`. Days with no doc are open. Closing locks it (shows read-only); reopen needs a reason.
  Float per drawer defaults in `$accountingSettings: { floats: { shop: 200, gallery: 300, cart: 150 } }` (placeholders, editable).
- Print: a "Daily close report" (Club.ui modal + print like receipts) with tenders, departments, drawers, over/short, card batch, sign-off.
- Seed: closes for the last ~14 days (deterministic, small over/shorts) so history and C's export have data. Seed receipts are already there
  for many days via backfill; if past days have little card/cash, seed is still fine: totals come from summarize.
- Deposit receipts: wedding/function and outing deposits record method but make no receipt. Make one for each new deposit (source 'functions'
  / 'outings', refId the record id, method from the deposit, channel 'counter', tenders) and backfill existing ones once (`$depositReceiptsBackfilled`).

## C: accounting export (js/modules/accounting-export.js, tabs inside B's Accounting page via `window.__accountingTabs`)
- Tabs: **Export** (order 30) and **Account mapping** (order 40).
- `$glAccounts` (getObj): chart of accounts `[{ id, number, name, type: 'asset'|'liability'|'income'|'expense'|'equity' }]`, default a sensible
  small Canadian golf club chart (cash on hand per drawer or one cash account, card clearing, online card clearing, member A/R, gift card liability,
  customer deposits, GST payable, PST payable, revenue lines per dept, promo discounts, over/short). Clearly labelled "default, confirm with your accountant".
- `$glMapping`: dept/tender/tax -> account id. Editable. Validation: every mapping set.
- Journal per day from `Club.accounting.summarize(date)` (if Club.accounting is missing, show an empty state) plus `charges` (member account sales,
  dues) and `payments` (member payments). Tax: prices are tax included; split with `Club.taxRate()` (GST 5 / PST 7 of the 12%), only for taxable
  depts (proshop, dining, takeout, cart, golf). Dues and gift card sales are not taxed (state the assumption in the UI). Debits must equal credits;
  show the journal preview with a balance check before download.
- Formats: QuickBooks Online journal entry import CSV, Sage 50 (Canadian) general journal CSV, generic GL CSV. Range: date range or closed days only (default closed days).
  Record `dailyCloses.exports` timestamps for the days exported, and an `accountingExports` log `{ id, at, by, format, from, to, days, lines, total }`.
- No live connection now (the owner will confirm the club's software). Leave a clear seam: a disabled "Connect to QuickBooks" card explaining it needs the owner's decision.

## D: online golf shop
- `products` gain `online: bool` (sell online), `blurb` (optional). Staff toggle in Pro Shop Inventory. Seed: a sensible subset online.
- `shopOrders`: `{ id ('so_…'), no ('W-0001', $shopOrderSeq), at, date, customer: { memberId|null, publicPlayerId|null, name, email, phone },
  items: [{ productId, name, qty, price }], subtotal, promo: { promoId, code, discount }|null, total (tax included, like the pro shop), pay: { method: 'account'|'card'|'gift'|'mixed', … , receiptId, chargeId|null },
  status: 'new'|'ready'|'picked-up'|'cancelled', readyAt, pickedUpAt, pickedUpBy, cancelledAt, cancelledBy, cancelReason, refund: { amount, receiptId }|null, log: [{ at, text }] }`.
- Stock is taken when the order is placed, put back on cancel. Every placed order also writes a `sales` doc (`channel: 'online'`, `orderId`, payment
  'Member account'|'Card'|'Gift card') so existing Reports count it; existing pro shop sales get no channel (counter).
- `Club.shop` (js/core/shop.js): catalogue, cart (per person, localStorage key `stboniface.shop.cart.<who>`), placeOrder, cancel, status changes,
  and the shared shopping view used by public and portal (like Club.takeout). Pickup at the golf shop only, no shipping.
- Public (`#/shop`, Pub.register nav "Shop") and portal (Portal.register "Shop"): browse by category, search, product detail, cart, checkout
  with `Club.checkout.mount` (members: account or card; public: card) and `Club.promos.applyBox` (public only, ctx where 'shop'). Receipts source 'shop',
  channel 'online', tenders online. Orders list in My account / portal with status and receipt. No member discount.
- Staff Pro Shop: **Online orders** tab (new count badge), Mark ready, Picked up, Cancel with reason and refund (card: credit receipt online tender;
  account: negative chargeMember; gift: back on the card), and the Inventory "Sell online" toggle.
- No product photos exist: use a tasteful category icon tile, never stock photos or invented brand imagery.

## Everyone
- Plain JS, IIFE, no frameworks, runs from python3 -m http.server. Never store full card numbers.
- `Club.pickers` replaces selects and date inputs automatically; never ship native-looking controls (the user rejects them).
- Phones down to 320px; css/mobile.css is shared: add phone rules to your own CSS inside max-width media queries instead.
- French: every visible string on the public site and portal translated in your fr-*.js (A: fr-booking.js, D: fr-shop.js). Staff app is English only.
- Test in WebKit: Playwright is installed at `/private/tmp/claude-502/-Users-murad-Documents-Golf-Course/58306e66-c4a4-44d0-9f0e-aa1f72c4498d/scratchpad/wk`
  (`require('playwright').webkit`). Serve the project with `python3 -m http.server <your port>` from the project folder (not serve.py, it stalls
  WebKit). Ports: A 8771, B 8772, C 8773, D 8774. Use real mouse moves for clicks on sheets. Check no console errors on all three pages.
- Other builders are editing other files at the same time: if a page breaks in a file you don't own, note it and carry on.

### Tee sheet: undo status changes (Nov 2026)
- Check in, Send off, Complete and Mark no-show each show a confirmation with an Undo button (8 seconds).
- Later corrections: the booking details (click a player) offer Undo check-in, Undo send-off, Reopen round or Undo no-show, one step at a time.
- Undoing a check-in credits back the green, cart and add-on fees it posted (a credit receipt, original charge marked reversed) and clears the paid marks it set. Round start and finish times return to what they were. Older rounds without a saved step still step back to the previous status.

### Tee time holds, head count cards, public guest details (Nov 9, 2026)
- **Time cards** (public Book a tee time, portal Tee times): four people under each time (taken places filled, including places someone else is holding), the places left, then the price under a rule. Public: the green fee per golfer. Portal: "Guest $66" (members pay through dues; the guest fee follows the 18/9 holes switch).
- **Hold**: choosing a time holds it for 5 minutes (`Club.holds.MINUTES`, js/core/holds.js). Public: from the moment a time is picked (also through the sign-in step and Payment). Portal: from Continue until the booking sheet closes. The hold covers every free place at that time, so nobody else can take them meanwhile; other golfers see the places as taken, or the time disappears when all of it is held ("On hold" in the portal's Show all times).
- **Countdown card**: "Time left to complete booking" with minutes and seconds and a bar; bottom right on desktop; on phones a slim bar reading 04:57 (bottom on the public site, top in the portal's booking sheet). Turns amber in the last minute; screen readers hear "One minute left".
- **Release**: booking, going back to the times, Change, closing the portal sheet, leaving the portal page, and closing or reloading the browser tab all free the time at once. When the 5 minutes run out the time is released and the golfer is sent back to the times with "Your 5-minute hold on 2:30 PM has ended..." Payment is never taken on an expired hold.
- **Checks**: `Pub.recheck` (before and after the card is processed) and the portal's `checkBooking` (Book flow and Friends joins) refuse places another golfer is holding: "Another golfer is completing a booking at 2:30 PM...".
- **Public guests**: first name, last name and email are all required for each guest (the email cannot be the account holder's). Saved on the tee time player as `firstName`, `lastName`, `email`.
- **Members' portal** is unchanged here: members add only their friends by name; anyone else is a guest with name, mobile and email (privacy decision Nov 9: no member lookup by phone number).
- Not covered yet: the staff tee sheet does not show online holds and can book a held time (the online golfer is then told at payment). Holds live in each browser's storage like the rest of the demo; a live system keeps them on the server.

## November 10, 2026

### Reports redesign (`#/reports`)
- Seven sections: Overview, Revenue, Members, Growth, Golf, Food, drink and shop, Accounts. Every section: headline figures on the page (click for details), one wide main chart with a one-line takeaway computed from the data, supporting panels two per row at equal height, a "…" menu on each (Export CSV, details), "See all" for the full list, and one "About these numbers" at the bottom.
- Overview: six headline figures with sparklines, "What stands out" (sentences from the data) and "Needs attention" (renewals, quiet members, golfers to invite, open applications, golfers turned away, no-shows, low ratings, old balances), each linking to its list.
- Revenue: single-colour monthly bars with department chips; "Where the money comes from"; "Golf season and winter". Members has its own section (roster, categories, age mix, 2027 renewals, members going quiet).
- Chart colours are four validated tokens (`--viz-1..4`: fairway green, brass, lake blue, brick), checked for colour-blind separation and contrast. No donuts; part-to-whole uses ranked rows. Header Export downloads the current section's CSVs.

### Undo on the staff site
- Every reversible staff action shows a confirmation with Undo (8 seconds, with a close button). Things that move through stages also keep a step-back control on the item (for example Back to ready on a picked-up order, Back to booked on a completed lesson, Move back to <stage> on banquets, outings and applications, Undo: back to <status> on a member for 7 days).
- Money is never deleted: undo posts a reversal charge with a credit receipt, a refund sale, a reversing payment, or a gift card history entry, so balances, the daily close and the exports still add up. Undo is refused when the item changed since, or when today is closed in Accounting.
- No undo by design: refunds already sent to a card, messages sent to members, the cart's driver steps that notify golfers, exports, printing, resetting demo data.

### Staff pages
- Pro Shop: order cards on Online orders (and Takeout) open a details drawer with a timeline. The register has a Customer search (members and public golfers) for every tender, so a cash or card receipt reaches that person's account. Promotions and Add-ons moved here from Settings (old links redirect).
- Tee sheet: online holds show as "Held online · 4:50" and staff cannot book over them; a member's promo code shows as its own Promo line.

### Members' portal and public site
- Checkout in three steps everywhere (shop, takeout, gift cards, public tee time payment): Details, Payment, Review, with a full-width card form. Cards are never saved anywhere.
- Members can add a pull cart rental and use a promo code when booking; a member's code reduces only what they pay for (guest fees, cart, add-ons).
- The booking countdown is a small corner pill.
- Phone fields format as you type, (204) 555-0100, on all three sites; numbers on file use the same format (extensions are left as typed).


## November 10 to 12, 2026

### Staff pages
- Tee sheet: each of the six stat boxes opens a details drawer (players, fill, guests, public golfers, no-shows, rounds and pace) for the chosen day; rows open the tee time.
- Lessons: the week grid splits a day into columns only where lessons overlap, so names are readable. Bookings can be for a member (charge to account, or pay at the golf shop) or a non-member (name, phone, email; pays at the golf shop). Golf shop payments use the tee sheet's till (card, cash, gift card, discount) and make a receipt; refunds make a credit receipt; cancelling a paid lesson refunds it.

### Phones (all three sites)
- Fields are 16px so iPhones no longer zoom in; opening a dialog no longer pops up the keyboard; bottom sheets move above the keyboard; the page behind a dialog stays still.
- Buttons and tabs are 44px tall (40px for compact ones); the smallest text is 11px.
- Hover effects apply only on devices with a mouse, so tapped items no longer stay highlighted; taps give a light press effect instead.
- Heights follow the visible screen (dvh) so Safari's toolbar no longer causes jumps.

### Speed
- The portal and public site no longer load staff page code: demo data and shared helpers live in js/shared/. The production build (npm run build, run by Vercel) joins and minifies each page's scripts and styles into one file each.
- Data is saved per collection instead of all at once, so saving after a tap is about 15 times faster. Saved data from older versions moves over automatically.

## November 12, 2026: group outing enquiries from the members' portal
- Members' portal **Group outings** page (`#/outings`): the outing packages from the staff data, add-ons, buffet, terms and contacts, a "Plan an outing" enquiry form, and My enquiries with the status as staff move it through the pipeline (Withdraw while it is still new). Bilingual (fr-portal.js). Not on the public site.
- Staff Group Outings: enquiries from the portal land in Pipeline > Enquiry with a "Members' portal" badge (card, detail hero, Season table), the member link and alternate date on the detail page, and "N from the members' portal" in the Open enquiries figure. All staff actions, Undo and step-back work on them as on hand-entered enquiries. Details in PORTAL.md.

## November 12, 2026: gift card sales, pay at pickup, the register and Post charge
- Staff **Gift cards**: "Sell gift card" (preset amounts from Online amounts, or a whole custom amount in the allowed range; optional recipient name, email, message and "signed from"; the buyer is a member or public golfer found by search, or a walk-in by name). Paid by the member's account (a charge, receipt in their portal) or at the counter with the tee sheet's till (card, cash, another gift card, discount). The card, its history and the receipt are made by `Club.giftcards.purchase` (new `pay.till`). After the sale: the card with Print gift card and Receipt. Undo voids the card (kept on file, never deleted) and reverses the charge or credits the receipt; a paying gift card gets its balance back.
- Online golf shop: **Pay at pickup** in checkout (public site and portal; `Club.checkout.mount({ pickup: true })`). The order is placed unpaid (no receipt, no sales record, no charge; stock is taken as usual) and shows "Pay at pickup" on the confirmation and in My orders. Staff Online orders show "To pay at pickup" and **Take payment** (the tee sheet's till); the receipt goes to the member or public golfer, with a sales record. Picked up on an unpaid order asks to take payment first. Cancelling an unpaid order charges and refunds nothing.
- Pro Shop register: tenders in two rows, Card first (the default for each new sale), Cash, Gift card, Member account; the main button says what happens ("Charge $54.20 by card", "Take $55.00 cash", "Charge $54.20 to account"). On phones the bottom Ticket bar steps aside once the ticket is on screen, so it no longer covers that button.
- Pro Shop Sales: no more sideways scrolling on wide screens (the By tender table stacks under its chart in the side column; the side column moves below the history under 1340px).
- Post charge: after Category, an Item list built from the app's own data (guest green fees, cart fee and add-ons; lesson rate card and programs; pro shop products; menu items; the member's dues; upcoming events with a fee). Choosing one fills Description and Amount, both still editable; Other keeps free text.

## November 12, 2026: staff page redesigns and fixes
- Tee sheet: the day scrolls inside its own box with the column header pinned. Morning, Midday, Afternoon and Evening jump to that part of the day and follow the scroll; there is no All day button and the page stays short.
- Lessons: a thicker current-time line with the time on it.
- Events & Tournaments: stat strips use one equal column per tile (no empty space).
- Course & Grounds: the Golf carts, Chemical log and Weather & agronomy tabs were taken off the page (their data is kept).
- Dining & Banquets: new Floor plan (host stand with arriving next, seated now, walk-ins that outline the tables that fit, table states including needs clearing and Mark table cleared) and new Reservations (day strip, timeline of tables against time with a now line, covers arriving, a Needs a table lane with suggested tables, list view, search). One summary line replaces the four stat boxes.
- Weddings & Events: new To do tab (each open event's next action, grouped by when), Next 60 days and a pipeline summary; pipeline cards name the next step; calendar day panel; each event on one page (next steps, money, plan for the day, documents, contact, activity).
- Reports: KPI tiles show a signed change ("+3") instead of a trend line; every chart has a written explanation; each section has Ideas to grow revenue and the Overview has Top opportunities, all worked out from the club's own figures.
- Long dropdowns (more than 12 choices) have a search box at the top.
