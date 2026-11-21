# Members' app redesign plan: "Inter with a touch of serif"

The approved concept (Nov 21): Inter for everything you read, Bodoni Moda only for the signature moments, the club's
deep greens, one aged-brass accent, hairlines and space instead of boxes and shadows. Concept board:
`shots/redesign-concept-mix.png`.

Each step is built, shown to the owner as screenshots, and deployed only on the owner's OK. Every step keeps all
features, French, phone rules (16px inputs, 44px taps) and the design-token rule.

## Step 1. Foundations (colours, fonts, surfaces)
- New tokens in `css/portal-theme.css`: Ink #12201A, Fairway #1D3528, Mist #E9ECE4 (page), Paper #F4F5F0 (raised),
  Rule #C9CEC1 (hairlines), Oak #7E8558 (labels), Brass #A8864E (the only accent: "you are here").
- Fonts: Inter (already loaded) for all text; add Bodoni Moda to `member.html` for the signature class only
  (`.sig`): big times, dates, the member's name, venue names.
- Surfaces: drop card shadows; separate with hairlines and spacing; small radii (3 to 4px for panels, 10px for the
  membership card). Labels in small spaced capitals in Oak.
- Result: every page already looks calmer before any layout changes.

## Step 2. Navigation
- Phone tab bar becomes words (Home, Tee times, Dining, Card, More) with a brass underline for the current page;
  no icon set.
- Tablet and desktop top bar: same words, same brass underline.

## Step 3. Home
- "Good afternoon, *Dave.*" (name in the serif, italic).
- One dark Fairway panel: "Your next round", the time set large in the serif, who you play with, Start scorecard.
- "This week" as a plain list with serif dates and a small category word (Lesson, Event, Golf).
- Account balance, handicap, friends and notices follow as quiet sections.

## Step 4. Tee times
- Date strip as words and serif numbers with a brass underline.
- 18 / 9 and players as one slim row.
- Times as a starter's sheet: serif times, four small spot marks, one action word (Join, Book), full times greyed.
- The chosen time pinned at the bottom with Continue.
- My tee times and Weekend ballot in the same list style.

## Step 5. Membership card
- Engraved look: Fairway green, double brass hairline, oak watermark, name in the serif.
- QR code on Paper below the card so it always scans.
- Later, when the club has an Apple developer account: Add to Apple Wallet.

## Step 6. Dining
- Menus set like the printed table menu: venue name in the serif, centred; course headings in small capitals;
  prices without dollar signs; diet filters as words with a brass underline.
- Reservations and takeout in the same list style.

## Step 7. Everything else
- Events, Lessons, Friends, Leaderboards, Scores, My account, Profile, Handbook, The club, Gift cards, Shop,
  Takeout, Group outings: the Step 1 foundations plus the list style, page by page.
- Then the public site gets the same foundations so both feel like one club.

## Checks for every step
- Safari on iPad and iPhone (the owner's devices), English and French, phone, iPad and desktop widths.
- No page errors, no sideways scroll, 44px taps, readable contrast (brass is for marks, not small text).

## Open decisions
- Whether the staff site gets the same look later, or stays as a working tool.
