# Working on this project (instructions for Claude)

St. Boniface Golf Club management system: plain HTML/CSS/JS, data in the browser (localStorage via `Club.store`).
Three pages: `index.html` (staff, the "manager page"), `member.html` (members' portal), `public.html` (public site).
Live at https://stboniface-golf.vercel.app (search engines blocked; `robots.txt` must stay `Disallow: /`).
Read `HANDOFF.md` first for where the work stands and what is left.

## The owner's standing preferences
- Tell the owner about any design change before making it. If they say "don't do edits until I say green apple",
  only plan or answer until they say "green apple".
- For big edits, use a team of agents working in parallel, each owning its own files.
- Design tokens only (CSS custom properties), no hard-coded colours. No em dashes and no emojis in UI copy.
- Never invent facts about the real club. Prices and details come from data already in the app or from the club.
- Cart dispatch rules in `js/core/cartdispatch.js` belong to the client: never change them.
- No native "Apple preset" controls: no visible native `<select>` or `<input type="date">`. `js/core/pickers.js`
  (Club.pickers) replaces `select.select` and date inputs automatically; long lists (over 12) get a search box.
- Staff site: every reversible action gets an Undo toast (`js/core/undo.js`) and, where sensible, a step-back.
  Cards and boxes should be clickable.
- No saved cards anywhere on the site. Phone numbers auto-format as (204) 555-0100 everywhere.
- French: new public and portal strings need French (`js/i18n/fr-*.js`); the staff site is English only;
  stored values stay English.
- Phones: inputs at least 16px, tap targets 44px (40px compact), no sideways page scroll
  (see the "Touch polish" block at the end of `css/mobile.css`).
- The owner tests in Safari on a Mac. Verify UI changes in Playwright WebKit with real pointer movement
  (mouse down, small moves, up), not only headless Chrome.
- Deploying to production needs the owner's explicit OK.

## Code layout
- `js/core/` shared core (store, ui, undo, pickers, receipts, shop, gift cards...).
- `js/shared/*-data.js` demo data seeds and helpers shared by all three pages (moved out of the staff modules Nov 12).
- `js/modules/` staff pages; `js/portal/` members' portal; `js/public/` public site; `css/` mirrors this.
- A new `.js` or `.css` file must be added to the page's script/link list: the build follows those lists.

## Build and deploy
- Source pages run unbundled for local work: `python3 serve.py` (port 8000) or `python3 -m http.server`.
- Production build: `npm ci && npm run build` makes `dist/` (one minified script and stylesheet per page, hashed).
- Deploy: `vercel deploy --prod --yes` from this folder (Vercel runs `npm ci` and `npm run build` itself, see `vercel.json`).
  `.vercelignore` keeps `*.md`, `tests/`, `node_modules/`, `dist/` and the unused staff schedule files out of the upload.

## Tests
`tests/webkit/` holds the Playwright WebKit suites (copied Nov 12). See `HANDOFF.md` for how to run them.
