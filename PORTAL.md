# Members' Portal Spec

`member.html` is the members' side of the St. Boniface system. It shares `localStorage` data with the staff
system (`index.html`), so anything a member does here appears instantly on the staff side, and vice versa.
Read `SPEC.md` first: the design language, `Club.*` API, and data model all apply here unchanged.

## How it loads
`member.html` loads `js/core/*` (except the staff router `app.js`), then `js/portal/shim.js`, then the shared data files
in `js/shared/` (`<module>-data.js`: each staff module's seeds, migrations and shared helpers such as `Club.billing`,
`Club.cart`, `Club.league`, `Club.membership`). No staff module (`js/modules/`) is loaded here; the staff system loads
each `js/shared/<module>-data.js` just before its `js/modules/<module>.js`, which reads the helpers it shares from
`Club.shared.<module>`. Then `js/portal/app.js` (the portal shell) and the portal pages in `js/portal/*.js`.
`public.html` loads the same shared files. In production each page loads one minified bundle (`npm run build`, see README).

## Hard rules
1. Only touch your own files: `js/portal/<page>.js` and `css/portal/<page>.css`. Never edit core, the shell, staff
   modules, `member.html`, `index.html`, `SPEC.md` or other pages' files.
2. Classic scripts in an IIFE, no import/export. Plain browser JS.
3. **Do not seed data.** All data comes from the seeds in `js/shared/` (owned by the staff modules). You may store small portal-only preferences with
   `Club.store.getObj/setObj` under keys prefixed `portal` (e.g. `portalFavourites`).
4. **Writes must match the staff side exactly.** Before writing to a collection, read the staff module that owns it
   (`js/modules/<owner>.js` and its `js/shared/<owner>-data.js`) and replicate its shape, ID conventions, extra fields, validation and business rules (tee sheet
   interval and hours, blocked times, closed course, member overlap, capacity, table sizes, fee posting rules, etc.)
   so a booking made here renders correctly in the staff module. If the staff module exposes helpers on `Club.*`, use them.
5. Members only see **their own** data (bookings, reservations, charges, statements, registrations). Directory views of
   other members show only name, member since and tier, never balances, contact details or handicaps unless the staff
   data marks them public (it doesn't, so don't).
6. Real states: empty states, validation errors, confirmations for cancellations, toasts after every action.
7. Mobile-first: most members use phones. Must look excellent at 360 to 430px wide and on desktop (max content 1120px).
   Touch targets at least 44px. The shell adds a bottom tab bar under 980px; leave room (already padded).
8. No emojis, no em dashes in UI copy, no new hex colours (theme tokens only), sentence case, warm and courteous
   member-facing voice ("Your tee time is confirmed", "We look forward to seeing you").

## Portal API (js/portal/app.js)
```js
Portal.register({
  id: 'tee-times',        // route member.html#/tee-times/<params>
  label: 'Tee times',     // desktop nav + page title
  short: 'Tee times',     // optional shorter mobile tab label
  icon: 'flag',           // Club.icon name
  order: 10,              // nav order
  tab: true,              // show in the mobile bottom tab bar (only the first 4 by order)
  nav: true,              // false hides it from the desktop top nav (still reachable by link / More menu)
  render(view, params, member) { view.innerHTML = '...'; return () => {}; }  // member = signed-in member doc
});
Portal.member()   // fresh signed-in member doc
Portal.go('dining')  Portal.render()  Portal.signOut()  Portal.crest(cls) -> crest SVG string
```
Everything in `Club.ui`, `Club.fmt`, `Club.date`, `Club.charts`, `Club.members`, `Club.staff`, `Club.chargeMember`,
`Club.weather`, `Club.info`, `Club.icon` is available (see SPEC.md).

## Portal styling (css/portal.css)
- `.p-page` is the page container (the shell adds it). `.p-page-narrow` for reading-width content.
- `.p-hero`: the dark ruled band that opens a page (eyebrow, serif title, short line, optional actions). One per page.
- `.p-section`, `.p-section-head` (with an `h2`) for page sections.
- All theme.css components apply (`.panel`, `.table`, `.badge`, `.btn`, forms, `Club.ui.modal/drawer`...). On phones,
  prefer cards and lists over wide tables, and drawers for detail views.
- Motion: `data-reveal` staggers, `data-count` counts up, charts draw. Add page-specific polish in your CSS
  (e.g. a time chip selecting with a brass fill, a booking confirmation card that rises in like an envelope opening).

## Pages
| id | label | order | tab | owner agent |
|---|---|---|---|---|
| home | Home | 1 | yes | A |
| tee-times | Tee times | 10 | yes | A |
| dining | Dining | 20 | yes | B |
| events | Events | 30 | yes | B |
| friends | Friends | 35 | no (top nav and More menu, with a count badge) | C |
| lessons | Lessons | 40 | no | B |
| club | The club | 50 | no | C |
| account | My account (Overview, Activity, Statements, Receipts, Pay) | 60 | no | C |
| profile | Profile | 70 | no (nav: false) | C |
| cart | Order to the course | 12 | no (nav: false; Home quick action, My tee times link, More menu) | beverage cart |
| scores | Scores (Golf Canada posting, DEMO) | 72 | no (nav: false; Profile > Golf, My tee times, Home prompt) | score posting |
| shop | Shop (online golf shop) | 24 | no | online shop |
| outings | Group outings (packages, enquiry form, My enquiries) | 45 | no (top nav or its More menu; phone More menu) | group outings |

## Testing
The real server is http://localhost:8000/member.html. A test server on :8001 has a sign-in helper:
`http://localhost:8001/login.html?m=<memberId>&h=<route>` signs in as that member and opens `site/member.html#/<route>`.
Screenshot helper (fresh profile, signed in, reduced motion, prints console errors):
`$SCRATCH/portaltest/shot.sh <route> <out.png> [width] [memberId]`

## Portal theme (v2: refined, premium)
`css/portal-theme.css` (loaded last on member.html, scoped to `body.portal`) is the single source of truth: forest
(`--forest-950/900/800/700/500`), sage (`--sage-200/100/50`), mist `--bg`, `--surface` cards with a hairline and
`--shadow-card`, `--text/-2/-3`, `--on-dark/-2`, `--danger`, `--warn`. Lora (serif, 500) only for H1/H2, the home greeting
and display numbers; Inter 400/500 everywhere else, 600 only on primary buttons, never 700. 16px body, 13px minimum,
12px uppercase eyebrows at most once per section. 48px buttons and inputs, 10px controls, 14px cards, iOS segmented
controls, tabs that scroll rather than wrap, `.p-list` inset grouped lists, `.p-link` quiet links.
`js/portal/datepick.js` (`Portal.datePicker`) is the shared Square-style date field and "Choose a date" sheet used by
tee times, dining and lessons. The staff system and public site do not load either file.

## Portal kit (Pass 3: mobile-first, one decision at a time)
`js/portal/kit.js`: `Portal.openSheet` (every list picker plus detail/confirm sheets: drag handle, swipe-down, backdrop,
Escape, focus trap), `Portal.selectField`, `Portal.accordion` (collapsed by default), `Portal.stepper`,
`Portal.actionBar` (the one sticky bar above the bottom nav for a flow's final button), `Portal.prefs` (remembered
defaults per member). The router calls `Portal.resetChrome()` only when the route changes; background refreshes wait
while a sheet, dialog or the action bar is showing. Responsive frame (css/portal-theme.css): under 768
is the phone layout with the bottom nav; 768 to 1023 is tablet (bottom nav, wider content, sheets as centred dialogs);
1024 and up is desktop (top nav in the header, no bottom nav, content up to 1200px, 1320px from 1440, side columns per
page via min-width media queries in each page's CSS); 1800 and 2400 scale the root font for projectors. Phone layouts
are the base and must not change when editing wider ones. Targets: every page ≤ 2 screen heights at 390×844 with
sections collapsed, Home ≤ 1.5; about 1 to 1.5 at 1440×900.

Staff system (index.html, `body.staff`): css/staff-theme.css carries the same v2 tokens and type for the staff app,
css/kit.css shares the sheet, date picker and action bar with the portal (staff sheets sit above dialogs). Targets:
≤ 2.0 screens at 1440×900, ≤ 3.0 at 390×844. Root font scales at 1800 and 2400 for projectors, and the sidebar
width is in rem there.

## Receipts (Club.receipts, js/core/receipts.js)
- Every account charge gets a receipt (Club.chargeMember makes it); see the header of js/core/receipts.js.
- `#/account/receipts` (My account, Receipts tab): the member's receipts newest first, grouped by month, 10 then Show
  more. Search (title, item, receipt number) and a month `Portal.selectField`; no native select or date input. Credits
  show as "−$40.00 Credit". Tapping a row opens `Club.receipts.open` (modal with Print or save as PDF).
- Paying online (`#/account/pay`) records the payment and its receipt (`source: 'portal'`, method card,
  "Visa ending 4242", a note naming any statement it settles), then shows `#/account/receipt/<receipt id>`: the receipt
  inline with Print or save as PDF, plus the balance before and after (just after paying) or today's balance (later).
  An older link with a payment id still works.
- Shared helpers (js/portal/kit.js): `Portal.receiptsFor(source, refId, memberId)` and `Portal.receiptLink(list, { label, btn })`.
  One receipt opens straight away, several open a sheet to choose from. Used by: event registration ("View receipt" on
  "You’re registered", "View receipt(s)" on "You’re going"; portal event charges pass the event as the receipt title and
  member and guest lines), past lessons (`lessons`, lesson id), past rounds (`teesheet`, tee time id, guest and cart fees)
  and past dining visits (`dining`, the check whose reservationId is the visit). The links only show when a receipt exists.
- Order to the course: delivered orders in Your orders have a Receipt link (`Club.receipts.forRef('cart', order.id)`,
  opened with `Club.receipts.open`, so it also works on the public site).

## Order to the course (js/portal/cart.js, css/portal/cart.css)
- `#/cart`: the golfer side of the beverage cart (see FEATURES.md). `Club.cartOrderView.mount(view, ctx)` renders the
  flow and the live status card; the public site reuses it (js/public/cart.js, css/public/cart.css maps that site's
  tokens onto the v2 names). All writes go through `Club.cart` (js/shared/cart-data.js).
- Kit: `Portal.selectField` for the hole, `Portal.actionBar` for "N items · $total · Place order" (or "Add to order"),
  `Portal.openSheet` for "I’ve moved". The unsent order is kept per member across re-renders; items that sell out
  while in it are removed with a toast.
- Call the cart: a "Call the cart to you" card above the menu opens a `ctx.kit.sheet` with the hole (`ctx.kit.select`,
  a nested sheet in the portal, a native select in the public modal), a note and, for members, payment. Visits use
  `Club.cart.callCart`; `Club.cart.label(order)` gives the wording ("Cart visit · you'll choose from the cart").
- `Portal.cartAction(member)` adds a highlighted fifth Home quick action (a full-width row from 1024px) when the member
  plays today and a cart is on shift, or has an open order. `Portal.cartLink(member)` adds the link above My tee times.
- Live: `Club.cart.onChange` (store subscribe plus the storage event) refreshes the status card in place; the card
  also refreshes every 20 seconds so positions and restock countdowns stay current.

## Friends (js/portal/friends.js, css/portal/friends.css)
- Request and accept: search members on the Friends tab, "Add friend" sends a pending request; nothing is shared until
  it is accepted. Requests tab: Accept or Decline incoming, Cancel sent. A friend can be removed or blocked from their
  rundown ("More"). Blocking unfriends and stops requests and messages; unblock in Profile, Friends and privacy.
- Friends golfing (top of the Friends tab; main panel from 1024px): friends' groups today and the next 7 days, grouped
  by day, one row per group (time, friend names, holes, spots open) with a Join button, or the reason Dave cannot join:
  "Full", "Outside your play times", "Opens to you <date>", "You're already playing at <time>", or "You're in" with Leave.
  Join opens a confirm sheet with the Tee times player editor (walk or cart prefilled, Add a member, Add a guest up to
  the spots open, Due at check-in) and adds everyone, all or nothing, to that existing tee time through
  Portal.teeTimes.join (js/portal/teetimes.js: same rules and store write as the Tee times page's join: booking window,
  play times, blocks, max four, no overlapping rounds). Leave uses Portal.teeTimes.withdraw (the My tee times Withdraw
  path); guests the member brought leave with them, members they added stay. Friends in the group get an automatic chat
  message ("Dave joined your 2:36 PM tee time with 1 guest"). Tee times and Friends share one checkBooking and
  commitBooking in teetimes.js; the staff sheet labels a guest with hostId as that member's guest and posts fees to them. Home shows the next two
  rows with the same Join button or reason. The demo seed makes sure each state exists (friendsJoinDemo flag).
- Friend rundown (sheet on phones, panel beside the list from 1024px): handicap with this season's change and a trend
  line (handicapHistory), upcoming tee times with the same Join button or reason, tee times you share, league standing
  and the last nights' points (Club.league), and this year's tournament finishes with the best result. Items with no
  data are left out; items the friend keeps private show a quiet line such as "James keeps tee times private".
- Messages: conversation list (preview, time, unread dot) and a chat with the composer pinned at the bottom; list and
  chat side by side from 1024px. Friends only. Tapping a received message offers Report (reason plus optional note) or
  Block. Reports appear in the staff dashboard "For your attention" list; staff see only the reported message.
- Profile has a "Friends and privacy" row: share upcoming tee times, handicap, scores and results (all on by default) and
  who can send friend requests (All members or Nobody), plus the blocked list.
- Badge: incoming requests plus unread messages, on the Friends top nav item, the phone More button and its menu row.
- Seed (once, for the demo member mem_1003): 4 accepted friends chosen from golfers with upcoming tee times or league
  results, 2 incoming requests, 1 sent request, two short conversations, and one friend who keeps tee times private.
  Other members cannot reply in the demo; there are no automatic replies.

### Who pays for a guest
Every guest row in the shared player editor (Book, join from Tee times, Friends join, Change) has "Who pays": "On my
account" (default) or "Guest pays at the golf shop", stored as `pays: 'host' | 'shop'`. "Due at check-in" counts only the
member's own share; shop-paid guests show as "Paid by your guest at the golf shop: $66.00". The staff tee sheet labels them
"Guest of <host> · pays at shop", does not post their fees at check-in (they follow the public golfer pay-at-shop path),
and staff mark them paid with "Green fee paid at the golf shop" in the group form.

### Per-friend sharing and requests to join
- Each member can set, per friend, "Can see my tee times" and "Can join without asking" (both on by default). Set from
  the "Your tee times" row in a friend's rundown, or Profile, Friends and privacy, Per-friend settings. The global
  "Upcoming tee times" switch applies first: when it is off, nobody sees them and the per-friend switches are disabled.
  The Your friends list shows "Hidden" or "Must ask" on restricted friends.
- A hidden friend sees the owner's tee times as private everywhere (Friends golfing, rundown, Home, "You're both
  playing"), with the same quiet line as the global setting ("Dave keeps tee times private").
- Must ask: the button is "Request to join". The same sheet as Join (players, guests, who pays) ends in "Send request";
  the party is checked but nothing is booked. A joinRequests doc and an auto message ("Dave asked to join your 2:36 PM
  tee time with 1 guest") are created. The owner approves or declines in Friends, Requests, Join requests, and on Home.
  Approve uses Portal.teeTimes.join for the requester (same checks and write as any join); if it no longer fits, the
  reason shows and nothing is written. The requester sees Requested (with Cancel request), then You're in or Declined.
  Requests expire once the tee time has passed. Request rows count as "Can join".

## Golf Canada score posting, DEMO (js/portal/scores.js, css/portal/scores.css)
- Not connected to Golf Canada: every screen says so ("Demo only. This app is not yet connected to Golf Canada. Scores are
  saved in this demo, not your Golf Canada record." on Scores and the review sheet). Writes only `scorePosts`; never
  `members.handicap`. Course and slope ratings are placeholders in `DEMO_RATINGS` (top of scores.js). See FEATURES.md.
- Routes: `#/scores` (history, rounds to post, post a score), `#/scores/post` (a round not booked in the app),
  `#/scores/post/<teeTimeId>`. Steps Round > Score > Attest render in place with `Portal.actionBar`; the review and the
  confirmation use `Portal.openSheet`; the tees and attester are radio cards, date uses `Portal.selectField`, the
  adjusted score explanation is a `Portal.accordion`.
- Hooks (each guarded with `Portal.scores`): `homePrompt(m)` (Home, inside Coming up; one fewer upcoming row on phones),
  `pastCell(tt, m)` and `detailAction(tt, m)` (My tee times), `golfRowsHTML(m)`, `indexChart(m, hist)` and
  `wireGolf(sheet, m)` (Profile > Golf). `Portal.scores.calc` exposes the WHS maths for testing.
- Seeds its own demo data (an exception to rule 3, asked for by the club): 12 posts for mem_1003.

## Online golf shop (js/portal/shop.js, css/shop.css)
- `Club.shop.mount` (js/core/shop.js) renders Shop / Basket / My orders. Same prices as the counter: tax is added at checkout; no member
  discount and no promo code. Pay on account (default) or by card, with an optional gift card. Pickup at the golf shop only.
- Phones show the first 12 items, then "View all"; categories and search show every match; sold-out items stay listed.
  `Portal.actionBar` shows "View basket" while browsing and "Place order" on the basket.
- After ordering, `#/shop/order/<id>` shows a status tracker and the receipt. My orders lists current and past orders with Receipt /
  Refund receipt; "Cancel order" while the order is still new. Staff prepare orders in Pro Shop, Online orders.

## Tee time add-ons (js/portal/teetimes.js)
- `Portal.teeTimes.editor(root, model, opts)` shows an Add-ons section (member-allowed items from `Club.addons.active('member')`) only with
  `opts.addons === true`; they post to the account at check-in like the cart fee. `join(m, ttId, { addons })` takes the joiner's add-ons.
  Friends joins (js/portal/friends.js) do not pass add-ons yet. Members never see promo codes.

## Group outings (js/portal/outings.js, css/portal/outings.css)
- `#/outings`: the club's outing packages exactly as the staff Packages tab keeps them (`outingPackages`, js/shared/outings-data.js):
  player range, price per player, format, when offered, inclusions; accordions for the add-ons, the buffet, the tournament terms
  and the two tournament contacts. Nothing is invented. My enquiries lists the member's own enquiries with their status.
- `#/outings/enquire[/<packageId>]`: organisation, expected players (16 to 144 from the data), preferred date and optional
  alternate date (`Portal.datePicker`, season days only, starting empty), package or Not sure, format (tee times, shotgun,
  no preference), contact (prefilled, phone formats as typed), food and notes. Package and terms mismatches show as notes,
  never blocking. Final button in `Portal.actionBar` under 1024px.
- Writes one `outings` doc in the staff "New enquiry" shape, stage 'Enquiry', plus `source: 'portal'`, `memberId`, `altDate`,
  `formatPref`, `packageUnsure` (Not sure stores the package that fits the numbers). Staff see a "Members' portal" badge,
  the member link and the alternate date; the nav badge counts it like any new enquiry.
- Member status labels: Enquiry received, Quote sent (with the quote total), Deposit received, Outing confirmed, Outing played,
  Enquiry closed or Withdrawn. Withdraw (only while 'Enquiry') sets stage 'Lost', `lostReason: 'Withdrawn by member'`; staff can Reopen.

