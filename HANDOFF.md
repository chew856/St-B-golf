# Handoff: where the work stands (November 12, 2026)

Everything below is deployed at https://stboniface-golf.vercel.app (deployed Nov 12 at about 4:30 PM, checked live:
all three sites and all 32 pages load clean, search engines still blocked). Standing preferences for Claude are in
`CLAUDE.md`; feature history is in `FEATURES.md`.

## Moving to the new laptop
1. Copy this whole folder. You can leave out `node_modules/` and `dist/`; they are rebuilt.
2. Install Node.js (LTS) and the Vercel CLI (`npm i -g vercel`), then run `vercel login` and `vercel link` in this
   folder. Pick the existing project **stboniface-golf**, so deploys keep going to the same address.
3. `npm ci` installs the build tool (esbuild). `npm run build` checks that the production build works.
4. Run the site locally: `python3 serve.py`, then open http://localhost:8000. Demo data lives in each browser, so a new
   laptop starts with fresh demo data.
5. Claude's memory from the old laptop does not move across. `CLAUDE.md` holds the standing preferences and this file
   holds the open items, so a new Claude session starts informed.

## Running the tests (optional)
The Playwright WebKit suites are in `tests/webkit/` (about 45 suites and their helper files).
1. `cd tests/webkit && npm i && npx playwright install webkit`
2. Most tests expect the site at http://localhost:8001/site/. To set that up, make a folder containing a symbolic link
   named `site` that points to this project, then run `python3 -m http.server 8001` inside that folder.
3. Run one suite with `node xsmoke.mjs http://localhost:8001/site/`. To run them all, use `zsh runall.sh` (takes about
   an hour). Screenshots go to `tests/webkit/shots/` or the tests folder.

## Done this week (all deployed)
- Phones:
  - All three sites: 16px fields (iPhones no longer zoom in), no keyboard popping up when a dialog opens, sheets
    moving above the keyboard, the page staying still behind dialogs.
  - 44px buttons, smallest text 11px, hover effects only on mouse devices, `dvh` heights.
- Speed:
  - The portal and public site no longer load staff code (`js/shared/`).
  - Production build: one minified file per page.
  - Data saves per collection, about 15 times faster.
- Tee sheet:
  - The day scrolls inside its own box, and the parts of the day jump inside it.
  - Each of the six stat boxes opens a details drawer.
- Lessons:
  - Readable week grid and a thicker now-line.
  - Member or non-member bookings, with pay on account or at the golf shop.
- Events: equal stat boxes. Course & Grounds: only Course status, Work orders and Equipment tabs.
- Dining & Banquets: new Floor plan and Reservations (approved mock-ups).
- Weddings & Events: new page with To do, pipeline, calendar day panel and a one-page event view (approved mock-up).
- Reports:
  - "+3" style changes instead of trend lines, and written explanations under every chart.
  - Ideas to grow revenue in every section, plus Top opportunities on the Overview.
- Pro Shop:
  - The Sales tab no longer scrolls sideways.
  - Register payment buttons say what will happen ("Charge $54.20 by card").
  - Pay at pickup for online orders, with Take payment in Online orders.
- Gift cards: Sell gift card on the staff page. Post charge: Item list from the club's price lists.
- Long dropdowns have a search box.
- Members' portal: Group outings page with an enquiry form that lands in the staff Pipeline.

## Done Nov 15 (hand and recent rounds deployed; sign-in question deployed)
- Which hand a member plays (`members.hand`: 'right', 'left' or null; label via `Club.members.hand(m)`):
  - Required on the public membership application; carried onto the member record when staff approve it.
  - Staff member page shows "Plays"; staff can set or change it under Edit, Golf. Demo members were filled in once.
  - Always shown on a friend's profile in the portal (not tied to any privacy setting).
- Friend profile: "Recent rounds" from posted scores (last 3, Show all for the rest; tapping one opens the scorecard).
  Hidden when the friend keeps scores private. Dave's friends got demo rounds once (`demoBackfills` marker).
- Portal sign-in asks "Which hand do you play?" when it is not on record (`askHand` in js/portal/app.js). It cannot be
  skipped: `Portal.openSheet({ locked: true })` has no close button, Escape, tap outside or swipe. Members change it
  in Profile > Golf ("Plays", Change).
- Tested in Chromium only (no WebKit on the cloud machine): check in Safari before deploying.

## Friends leagues (built Nov 15, deployed Nov 17)
Members start a league with friends: individual or teams (2 to 4 a team, same size), creator picks start date, weeks,
games a week, 9 or 18 holes and one of four formats. Missed weeks are caught up (the next round fills the earliest open
week; no playing ahead); games never played take the worst score of that week when the league ends.
- Rules engine: `js/core/friendleagues.js` (`Club.friendLeagues`, collection `friendLeagues`; data model in its header).
- Portal: Leagues tab on Friends (`js/portal/fleagues.js`, `css/portal/fleagues.css`), invites under Requests.
- Booking: "Counts toward <league>" in the booking sheet, My tee times and when joining a friend's group
  (`js/portal/teetimes.js`). It sits on the player's entry as `friendLeagueId` and is copied to the score post.
  A league round booked but never scored frees its game after 14 days.
- Staff: read-only Friends leagues tab in Events & Tournaments (`js/modules/events.js`).
- French: `js/i18n/fr-fleagues.js`, `js/i18n/fr-fleagues-book.js`. Demo: two running leagues and one invite for Dave.
- Open: joining by request (friend approves) cannot carry a league choice yet; members cannot leave a league;
  teams rank on players' average per game mid-season while the table also shows totals.
- Tested in Chromium only: check in Safari before deploying.

## Client analytics (built and deployed Nov 15; tab renames deployed)
Staff Reports has a "Client spending" tab (the old Accounts tab is now "Unpaid accounts" and no longer has
"Top members by spend") (`js/modules/reports-clients.js`, `Club.clientStats`): every member and public golfer
ranked by spend, filters for Everyone / Members / Public golfers and Including / Excluding dues, spend by department
and by membership category, and a breakdown per client (department, by month, visits and habits, compared with
others). The same breakdown is the Spending tab on the staff member page.
- Spend = house-account charges plus card or cash purchases, less credits; account payments, balance brought forward,
  reversed charges and gift card amounts do not count. A visit = a day with a purchase, round, dining visit or lesson.
- Public golfers: receipts with a publicPlayerId plus paid `publicPayments`. Walk-ins with no account and wedding or
  outing deposits are left out.
- Demo data limits: client spend starts Sep 1, so longer periods have no previous period to compare with; public
  golfers only have green fees on record.
- Tested in Chromium only: check in Safari before deploying.

## Client ideas, Growth plan and demo history (built Nov 15, deployed Nov 17)
- Client spending has an "Ideas to grow revenue" list of 13 ideas (`js/modules/reports-clients.js`), each with the
  clients behind it. Short periods (under 28 days of records) show none.
- Reports has a Growth plan tab, second after Overview (`js/modules/reports-plan.js`): every section's ideas in one
  list ranked by yearly value, with Mark done / Dismiss / Move back to open and Undo. Marks live in the `growthPlan`
  collection under stable keys (`<section>:<idea id or title slug>`). Overview leaves out done and dismissed ideas.
- Demo history (`js/shared/clients-history-data.js`, runs once, marker `clientHistory1`, loaded by index.html only):
  about 2,220 made-up house charges from Dec 2025 to Aug 2026 with about 540 matching payments, 28 public green fee
  payments, four new demo members (Marcus Oyelaran, Colette Arsenault, Sophie Lachance, Henri Beaulieu) and two new
  demo public golfers (Isabelle Gauthier, Devon Sinclair), plus planted patterns so each idea has people behind it.
  What members owe today is unchanged; "Billed" and "Collected in period" on Unpaid accounts rose because they
  count period activity.
- Language is a setting now (deployed? no): out of the top bars; portal Profile, public My account, and a switch on
  signed-out pages.
- Tested in Chromium only: check in Safari before deploying.

## Leaderboard, month receipts, My account layout (built and deployed Nov 16)
- Reports has a staff-only Leaderboard tab after Golf (`js/modules/reports-leaderboard.js`): golfers with 10 or more
  rounds in the Reports period, ranked on lowest scores (gross and net, 18 holes; 9 holes separately), birdies, eagles
  or better, holes in one, most rounds, most improved, plus hole records and a "Not yet qualified" list. Rounds are
  every posted score (`scorePosts`) plus completed tournament cards, counted once when both exist for the same day.
  Net uses placeholder ratings that differ between posts and tournament cards until the club's official ratings are
  entered in one place.
- Demo rounds (`js/shared/leaderboard-data.js`, runs once, marker `leaderboard1`, loaded by all three pages): 234
  made-up posts for 21 demo members, Apr 18 to Nov 12, 2026, including one hole in one (Imogen Whitmore, hole 5,
  Aug 1) and 7 eagles. Handicaps, friends leagues and Dave's own scores are unchanged.
- Client breakdown: selecting a month lists its purchases, and each opens its receipt (made on demand for older
  charges and online green fees). Public My account: short panels moved to the right column.
- Tested in Chromium only.

## Lessons schedule redesign (built and deployed Nov 16)
The combined week grid on Lessons & Academy is replaced by two views with a Day | Week switch (approved mock-ups):
- Day (default): a strip of the seven days, then a time grid with one column per professional. Blocks show the time
  range, the client's full name and the lesson type; each column header shows lessons, hours and "h open" (the 7 AM
  to 7 PM span minus that pro's lessons and academy sessions; the data has no days off). Open space books with that
  pro, date and time. On phones one pro shows at a time.
- Week: a row per professional, each day listing lessons as time and last name, three shown and "N more".
- The pro filter, roster cards, dialogs and Undo are unchanged. Book lesson moved into the schedule toolbar.
- Tests: `tests/webkit/xls-grid.mjs` was rewritten for the new views; xb-lessons, xls-pay, xmob-touch and xb-lib were
  updated. xls-hover, xls-measure and xls-trunc probed the old grid and no longer apply. Item 2 below is obsolete.
- Member Spending tab (Nov 16): opens on Including dues; Period is a dropdown with Custom dates.
- Tested in Chromium only.

## Bug hunt and first fixes (Nov 16, deployed Nov 17)
A six-tester bug hunt found 9 high, 26 medium and about 40 low bugs (list kept outside the repo; ask Claude for it).
Fixed and tested in Chromium:
- Portal statements paid in parts are marked paid (`js/portal/account.js` paidToward, owedOn, postPayment).
- Client spending: an online green fee receipt opened twice is reused, not duplicated (`reports-clients.js` receiptFor,
  publicReceipt); Revenue counts every paid online green fee once, with or without a receipt (`reports.js` liveIndex);
  a charge reversed and charged again counts again (`reports-clients.js` buildLedger correction chains).
- Friends leagues: a one-game week can no longer take two games when the later day is booked first
  (`friendleagues.js` canCount loops over the round's week and later weeks).
- Wedding, event and outing card deposits keep only brand and last four (`functions.js`, `outings.js`); older deposits
  lose the extra fields the next time a deposit is recorded on that record.
Still open from the hunt: browser storage (two tabs saving at once, storage nearly full, Safari's smaller limit), staff
"Record payment" and "Mark paid" still ignore earlier part payments (`billing.js`), two same-amount payments seconds
apart give one receipt (`receipts.js` double-click guard), and the medium and low items. These were fixed in batch 2 (next section).

## Bug fix batch 2 and final pass (Nov 16 to 17, deployed Nov 17)
Fixed and tested in Chromium (the WebKit suites need a Mac run before deploying):
- **Browser storage** (`js/core/store.js`). Each collection is saved in a compact table form (key names and repeated
  strings once), about a third of plain JSON, so all three sites' demo data fits inside Safari's smaller storage.
  Older saves still read and are rewritten compactly on load. A save is all or none: if storage is full, nothing of
  that save is written, the warning shows, and everything is tried again on the next save. When two tabs change the
  same collection, the changes merge document by document and field by field. Read raw saved data with
  `Club.store.stored(name)`, never `JSON.parse(localStorage...)`. **After deploying, reload any open tabs** (staff
  tills, portal, public site): a tab still running the old code would save in the old format.
- **Stored text stays English**: notes, titles, receipts and histories are built with `Club.fmtEn` (in
  `js/i18n/fr-shared.js`; callers use `Club.fmtEn || Club.fmt`, since the staff page does not load it). French
  displays translate them. The seed builders in `js/shared/` now use it too.
- Staff "Record payment" and "Mark paid" count earlier part payments; two quick same-amount payments get two receipts;
  Reports (short periods average per day, members who joined later are left out of earlier periods, prorated months,
  the tab bar scrolls); tee sheet step back has its own Undo; Lessons (cancelled lessons, defaults, off-hours, Undo of
  a move, deep links, and `#/lessons/<date>/<lessonId>` from a member's Activity tab opens that lesson); portal and
  friends leagues (hand question, duplicate scores, ties, Undo); public site (label taps, header fit, My account).
- Final pass: the club phone shows as (204) 233-2497 everywhere, staff extensions as "(204) 233-2497 ext. 209"
  ("poste" in French), tel: links digits only. Dialogs keep keyboard focus inside them (Tab and Shift+Tab cycle,
  Escape closes, focus goes back to what opened them, also after a mouse click on a card). `--text-3` is a touch
  darker (#616C65) so small grey text passes 4.5:1 on the light sage fills. Raw colours in the stylesheets are now
  tokens defined once in `css/theme.css` and `css/staff-theme.css`. Phone tap targets 44px (40px compact) on the
  remaining staff links, tabs, pagers and table controls. Suspending or resigning a member through Edit asks first
  and the toast names the new status. The build no longer copies `js/`, `css/` or `shots/` into `dist/` (11 MB to
  5 MB) and checks that every file a built page refers to is there.
Waiting on the owner:
- Receipts backfill runs once, on whichever page opens first: a browser that opens the portal or public site first
  never gets receipts for the ~2,800 staff-seeded demo charges. Keep, or run it on every page?
- French tables show a tied place as "É1". Confirm the wording.
- Reports Leaderboard: the 18 hole buttons are 35 by 46px on phones (9 in a row). Needs a layout decision.
- Left as they are: card network brand colours (`css/cards.css`, `js/core/cards.js`) and mask colours.

## Tee Sheet redesign and Lessons features (Nov 17, deployed Nov 17)
- **Tee Sheet** (`js/modules/teesheet.js`, `css/modules/teesheet.css`): the owner's "Option C" list. Plain player
  names, faint "+ Add" spots, thin empty rows with "+ Book <time>", status word plus one action, "Next up" row,
  starter column (Today tiles, On course, Pace). The bar is one line from about 1440px wide: the two filters are
  dropdowns (All/Open/Booked times; All players/Members/Public golfers), Today also jumps to the current time when
  already on today, the date is short ("Tue, Nov 17"), and the search box shrinks first.
- **Lessons Day view** fits 7 AM to 7 PM on one screen (`--hour: 2.75rem` in `css/modules/lessons.css`).
- **Drag to move** a lesson in Day or Week view (staff), with Undo; refused onto a busy pro or off hours.
- **Repeat weekly** (staff only): 4, 6, 8 or 10 weeks, clashes shown as chips with a "pick another time" list, all
  lessons share a `seriesId`; cancelling one asks "Just this lesson" or "This and the rest of the series".
- **Lesson packages**: staff set them up in the rate card section (`lessonPackages`), sell them to a member (one
  Lessons charge and receipt), members buy them in the portal Lessons "Packages" tab. Bought packages are
  `memberPackages` (`Club.lessonPacks` in `js/shared/lessonpacks-data.js`). A lesson using a package has price 0 and
  `packageId`; cancelling gives the lesson back. Reports count the sale once, not the lessons.
- **Lesson notes** (`lessonNotes`, staff only): in the lesson dialog and the member's Golf tab. Never shown in the portal.
Waiting on the owner: season end (Oct 31) and the package prices ($475, $200, $320) are placeholders; the demo
seeds put $475 and $200 package sales on two members' accounts (keep or offset); long-press drag on Safari and iPad
needs a real-device check.

## Future: live location on the course
The owner plans live location for golfers. The tee sheet's "On pace", hole and finish estimate are computed from the
4h 15m target today (js/modules/teesheet.js starter column); switch them to real positions when live location exists.

## Still to do or decide
1. **Resolved Nov 13**: run alone, `xpo-test.mjs` (Group outings) passes all 192 checks and `xe-checkout.mjs`
   passes 418. The one failure is the outside weather service answering 503, not the site.
   The earlier failures came from running many suites at once.
2. **Resolved Nov 16**: the Lessons grid test (`xls-grid.mjs`) was rewritten with the new Day and Week views; the
   old "at least 10 lessons with a whole day column" check is gone (every lesson now has its pro's whole column).
3. **Dining undo bug: fixed Nov 13, deployed.** Adding more of an item to an existing line on a dining
   check, then pressing Undo, used to keep the higher quantity. `js/modules/dining.js` now updates a copy of the line.
   The test is `tests/webkit/xdn-addundo.mjs` (7 of 7 pass); xa-hosp, xdn-dining and xd-undo still pass.
   Deploy it with the next change.
4. **Gift card sale discount**: the counter till allows a discount on a gift card sale. The receipt shows it and the
   card keeps its full value. Decide whether discounts on gift card sales should be allowed.
5. **Demo data**: the demo puts a Banquet Hall dining booking (Holiday party, 6 PM) on Nov 20, the day of a confirmed
   celebration of life. The event page correctly warns "This date is already in use". Decide whether the demo seed
   should avoid confirmed event dates.
6. **Dining revenue basis in Reports** (`js/modules/reports.js`, `dayVals`): closed Gallery checks count before
   service and tax, but dining account charges include them. Pick one basis.
7. **Unused files**: `js/modules/staff.js` and `css/modules/staff.css` (staff shifts and time off) are loaded by no
   page. Delete them or switch the Staff page on.
8. **Accounting software**: the live QuickBooks or Sage connection waits until the club owner says which software they
   use. File exports already work. With QuickBooks Online, build against Intuit's sandbox first.
9. **Placeholders to confirm with the club** (invented or estimated until the club provides them):
   - **Money:**
     - membership dues amounts
     - cart fee, twilight rate, lesson rates and event prices
     - the 18% dining service charge
     - booking add-on prices (rental clubs, pull cart, sleeve of balls)
     - gift card preset amounts and custom range
     - cash drawer floats ($200 golf shop, $300 Gallery, $150 cart)
     - the GST/PST registration number for receipts
   - **Dining and food:**
     - whether the Taphouse Bar and Patio exist, with their names and hours
     - the 6 tap beers, the Friday pizza menu and its $18 price
     - breakfast reservation hours
     - the beverage cart menu and prices
     - the online dining party limit (10) and the added 10-seat tables T9 and G12
     - takeout hours, lead time and cancellation window
   - **Course:**
     - real cart-path distances for cart dispatch
     - the official course rating and slope per tee
   - **Accounting and promotions:** the default chart of accounts for the accounting export (ask the accountant), and the demo promo codes.
10. **Deliberately not done**:
    - The staff page doesn't use `viewport-fit=cover`, to avoid content under the notch in landscape.
    - Small progress bars still animate their width.
    - The staff page bundle is 1.6 MB. Loading each staff module only when its page opens would be a separate job.
    - Some dense tee-sheet cells stay at 36 to 40px.
11. **Cheaper agents**: big jobs have used Opus agents. Options: run them on Sonnet (a `.claude/agents/` file with
    `model: sonnet`, or `model: "sonnet"` per agent).
10. **Automatic monthly payment (owner decided Nov 15, waiting on the club's payment processor)**: every member must
   connect a payment method when they sign in (mandatory), choosing a card or pre-authorized debit from a bank
   account, and the monthly statement is charged to it automatically. Do not build until the club chooses a
   processor. This replaces the "no saved cards" rule for this one purpose: the processor holds the card or bank
   details, the site keeps only a reference. Needs a server and real database (charges must run with no browser
   open), signed consent for recurring charges, and handling for declined or expired payments.
11. **Apple Pay and Google Pay (owner decided Nov 15, waiting on the club's payment processor)**: wherever someone
   pays right away (beverage cart orders, golf shop, lessons, takeout and the other checkouts), show Apple Pay on
   Apple devices and Google Pay on Android or Chrome, with the card form as the fallback. For both public golfers
   and members (members can pay right away instead of charging their account). Do not build until the club
   chooses a processor. The card stays in the phone wallet, so the "no saved cards" rule still holds. First step
   when building: list how each checkout takes payment today.


## Test on a real iPhone and Android phone
1. Tap the staff search bar and dialog fields: the page should not zoom in.
2. Open Book lesson or Book tee time: the keyboard stays down until you tap a field.
3. Tap a field near the bottom of a sheet: the sheet moves above the keyboard, and Save stays visible.
4. Scroll inside a dialog past its end: the page behind does not move.
5. Tap a card or button: a brief press effect, no highlight that stays.
6. Scroll so Safari's toolbar hides and shows: nothing jumps.
7. Rotate on the tee sheet and in a dialog: the layout recovers, with no sideways scroll.
8. First load on mobile data (public site and portal) should feel quicker.
9. Book on the public site with the staff tee sheet open in another tab: it appears without a reload.
10. Open the site in a browser that used it before: the earlier data is still there.
