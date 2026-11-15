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

## Done Nov 15 (hand and recent rounds deployed; sign-in question NOT DEPLOYED YET)
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

## Friends leagues (built Nov 15, NOT DEPLOYED YET)
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

## Still to do or decide
1. **Resolved Nov 13**: run alone, `xpo-test.mjs` (Group outings) passes all 192 checks and `xe-checkout.mjs`
   passes 418. The one failure is the outside weather service answering 503, not the site.
   The earlier failures came from running many suites at once.
2. **Lessons grid test** (`xls-grid.mjs`) wants at least 10 lessons with a whole day column to themselves; today's
   demo week gives 8 of 69. It is date-dependent. Either relax the test or improve the layout further.
3. **Dining undo bug: fixed Nov 13, NOT DEPLOYED YET.** Adding more of an item to an existing line on a dining
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
