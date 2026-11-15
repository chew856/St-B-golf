# St. Boniface Golf Club: Club Management System

A complete operations system for St. Boniface Golf Club, 100 Youville Street, Winnipeg (est. 1931).
Club facts, menu, scorecard and contacts used in the system are documented in `CLUB.md`.

## Run it
Run `python3 serve.py` in this folder, then open http://localhost:8000 (staff) or http://localhost:8000/member.html
(members). The server disables browser caching so a normal refresh always shows the latest version.

Data is demo data saved in your browser (localStorage). Reset it any time in **Settings → Data → Reset demo data**.
Press `/` anywhere to search members, bookings, products and events.

## Modules
| Area | Module | Highlights |
|---|---|---|
| Overview | Dashboard | Today at a glance, course conditions, tee, dining, events, attention list, live updates |
| Golf | Tee Sheet | 9-minute tee sheet, bookings, check-in with guest/cart fees, starter panel, blocks |
| Golf | Lessons & Academy | Pro schedules, lesson booking, rate card, academy programs and enrolment |
| Golf | Events & Tournaments | Calendar, invitations, registrations, score entry, live leaderboard, scorecards, members' league |
| Golf | Group Outings | Tournament & corporate packages (from the 2026 package), quotes, deposits, shotgun blocks, pairings |
| Membership | Members | Directory, profiles, handicap trend, applications pipeline, celebrations |
| Membership | Billing & Statements | Ledger, A/R aging, dues run, F&B minimums, printable statements |
| Membership | Communications | Letter composer with live preview, audiences, scheduling, templates, notice board |
| Hospitality | Dining & Banquets | Reservations, floor plans, kitchen tickets, the Gallery menu |
| Hospitality | Weddings & Events | Enquiry pipeline, tours, quotes, card deposits, printable proposals, Banquet Hall calendar |
| Hospitality | Pro Shop | Point of sale, receipts, inventory, reorders, sales analytics |
| Course | Course & Grounds | Routing map with hole status, work orders, equipment, carts, chemical log, agronomy |
| Administration | Reports | Revenue, rounds, membership, A/R, F&B, pro shop; CSV export and print |
| Administration | Accounting | Daily close (drawer counts, card batch, sign-off, printable report), close history, accounting export (QuickBooks Online, Sage 50, general ledger) and account mapping |
| Administration | Settings | Club profile, tax, membership tiers, promotions (promo codes), booking add-ons, data export/reset |

Every sale, fee and dues run posts to one shared member ledger, so Billing always reflects activity from every department.

## Public golf
Open `public.html` (http://localhost:8000/public.html). Non-members create an account, book tee times 7 days ahead
at the published green fees, and pay by card. Bookings appear on the staff tee sheet tagged "Public".
They can add rental clubs, a pull cart or balls, use a promo code or gift card, and shop the online golf shop (`#/shop`,
pickup at the golf shop). Members have the same shop in the portal, paid on account or by card.

## Members' portal
Open `member.html` (http://localhost:8000/member.html). Sign in with any member number (e.g. 1003) and any password,
or tap one of the demo members. Members can book tee times, reserve tables, RSVP to events, book lessons, view their
account and statements, make payments, read club news and update their profile.

The portal shares data with the staff system: a tee time booked by a member appears on the staff tee sheet, and changes
sync instantly between open tabs. See `PORTAL.md` for the technical contract.

## Structure
- `index.html`: app shell
- `css/theme.css`: design system (palette, type, components, motion)
- `js/core/`: store, UI kit, charts, icons, router
- `js/modules/` + `css/modules/`: one file pair per module (staff screens only)
- `js/shared/`: each module's seed data, migrations and shared helpers (`<module>-data.js`), loaded by all three pages
- `tools/build.mjs`: production build (`npm install`, then `npm run build`): copies the site to `dist/` with each page's scripts and styles joined, in order, into one minified, content-hashed file. Vercel runs it on deploy (vercel.json). Local development and tests use the source files.
- `SPEC.md`: the technical contract (API, data model, design rules)
