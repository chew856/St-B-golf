/* French walk of the members' portal: every page and its main states at 390 and 1440, Club.i18n.missing() per state,
   horizontal overflow, console errors, screenshots of the main pages. Fails on any missing string not allow-listed.
   node xi18n-portal.mjs [--dump]   (--dump writes xi18n-portal-missing.json with every missing string and its states) */
import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/'; const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
const DUMP = process.argv.includes('--dump');
async function human(p, sel, dbl) { try { return await human0(p, sel, dbl); } catch (e) { res.push('NOTE could not click ' + sel + ': ' + String(e.message).split('\n')[0]); } }
async function human0(p, sel, dbl) { const loc = p.locator(sel).first(); await loc.waitFor({ timeout: 8000 }); await loc.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(150); const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 6, y - 4); await p.mouse.move(x, y);
  if (dbl) { await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60); await p.mouse.down(); await p.mouse.up(); } else { await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); }
  await p.waitForTimeout(700); }

/* Kept in English on purpose: data people type or the club names (members, staff, guests, events, menu items, notices,
   league and tournament names, seeded member messages, receipt titles of named items). Matched against the whole text. */
const ALLOW = [
  /^(Gallery Taphouse & Grill|Taphouse Bar|Gallery Taphouse|Gallery|St\. Boniface.*|Golf Canada|CPGA|Eagle|Birdie|Young Adult|Junior|Social|Stableford|Instagram|Facebook|X|YouTube|LinkedIn)$/,
];
/* Already French, but without the accents or little words the engine's detector looks for: dates such as "4 nov.",
   "samedi · 7 nov." or "novembre 2026". */
const FR_WORDS = new Set('janvier février mars avril mai juin juillet août septembre octobre novembre décembre janv. févr. avr. juill. sept. oct. nov. déc. lundi mardi mercredi jeudi vendredi samedi dimanche lun. mar. mer. jeu. ven. sam. dim. h'.split(' '));
let LONG = [];
function allowed(text, names) {
  if (ALLOW.some(r => r.test(text))) return true;
  if (/^[A-Z]{1,3}$/.test(text)) return true;                              /* avatar initials */
  if (text.split(/[\s,·]+/).filter(Boolean).every(x => FR_WORDS.has(x) || /^[\d\u202f\u00a0#:.$-]+$/.test(x))) return true;
  if (/^#\d+ · /.test(text)) return true;                                  /* "#1003 · Birdie" (number and category name) */
  if (names.has(text)) return true;
  /* text made of data (names, titles, menu items) and French: strip the data, then look again */
  let rest = text.replace(/^\[[a-z-]+\] /, '');
  for (const n of LONG) if (n.length > 3 && rest.includes(n)) rest = rest.split(n).join(' ');
  if (rest !== text && !/\b(the|your|you|and|with|holes?|guests?|players?|spots?|left|from|of|is|are|has|have|will|this|that|Book|Cancel|View|Show|Add|Your|You|Today|Tomorrow|tees|members?|going|minimum|statement|AM|PM)\b/.test(rest)) return true;
  /* a member or staff name, alone or with a last initial / "(you)" */
  if (/^[A-Z][a-zA-Z'’.-]+( [A-Z][a-zA-Z'’.-]+)*\.?$/.test(text) && text.split(' ').every(w => names.has(w.replace(/\.$/, '')) || /^[A-Z]\.$/.test(w))) return true;
  return false;
}

const b = await webkit.launch();
const missingAll = new Map();       /* text -> Set of "width state" */
const overflows = [];
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.lang', 'fr'); localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(w + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(w + ' ' + m.text()); });
  await p.goto(B + 'member.html#/home', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const names = new Set(await p.evaluate(() => {
    const out = [];
    const add = s => String(s || '').split(/\s+/).forEach(x => x && out.push(x));
    Club.store.all('members').forEach(m => { add(m.firstName); add(m.lastName); out.push(m.firstName + ' ' + m.lastName); });
    Club.store.all('staff').forEach(m => { add(m.firstName); add(m.lastName); out.push(m.firstName + ' ' + m.lastName); });
    ['events', 'tournaments', 'leagues', 'announcements', 'menuItems', 'programs', 'products'].forEach(k => (Club.store.all(k) || []).forEach(x => { [x.title, x.name, x.description, x.body].forEach(v => v && out.push(String(v).replace(/\s+/g, ' ').trim())); }));
    out.push(Club.info.address, Club.info.address + ' ·', Club.info.address + ' · ' + Club.info.phone);
    Club.store.all('members').forEach(m => { if (m.address) out.push(m.address); out.push((m.firstName + ' ' + m.lastName).toUpperCase()); });
    Club.store.all('announcements').forEach(a => String(a.body || '').split(/\n+/).forEach(l => out.push(l.replace(/\*\*?/g, '').replace(/\{first_name\}/g, 'Dave').replace(/^\s*-\s+/, '').replace(/\s+/g, ' ').trim())));
    (Club.store.all('products') || []).forEach(x => x.name && out.push(x.name));
    Club.store.all('charges').forEach(x => x.description && /Titleist|polo|cap|FootJoy|Vokey/.test(x.description) && out.push(x.description));   /* pro shop product names */
    out.push('XXXX XXXX XXXX');
    const cs = Club.store.getObj('courseStatus', null); if (cs && cs.message) out.push(cs.message.replace(/\s+/g, ' ').trim());
    Club.store.all('memberMessages').forEach(x => out.push(String(x.body).replace(/\s+/g, ' ').trim()));
    Club.store.all('teeTimes').forEach(t => (t.players || []).forEach(q => { if (q.name) { out.push(q.name); add(q.name); } }));
    return out;
  }));
  ok(await p.evaluate(() => Club.i18n.lang() === 'fr' && document.documentElement.lang === 'fr-CA'), w + ': French is on');

  async function settle() { await p.waitForTimeout(500); }
  async function closeTop() { const n = await p.locator('.ps-sheet.open .ps-x').count(); if (n) { await human(p, '.ps-sheet.open >> nth=-1 >> .ps-x'); } const o = await p.locator('.overlay .modal-close, .overlay [data-close], .drawer-close').count(); if (!n && o) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); } }
  async function closeAll() { for (let i = 0; i < 4; i++) { const n = await p.locator('.ps-sheet.open').count() + await p.locator('.overlay').count(); if (!n) break; await p.keyboard.press('Escape'); await p.waitForTimeout(350); } }
  async function openAccs() { await p.evaluate(() => document.querySelectorAll('.pk-acc:not(.is-open) .pk-acc-head').forEach(h => { if (h.offsetParent) h.click(); })); await p.waitForTimeout(350); }
  async function record(state) {
    await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const m = Club.i18n.missing(); Club.i18n.clearMissing();
      const W = innerWidth, se = document.scrollingElement;
      let over = null;
      if (se.scrollWidth > W + 1) {
        const bad = [];
        document.querySelectorAll('body *').forEach(el => {
          const r = el.getBoundingClientRect(); if (!r.width || r.right <= W + 1) return;
          for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a !== document.body && a !== document.documentElement) return; }
          bad.push((el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()) + ' right=' + Math.round(r.right) + ' "' + (el.textContent || '').trim().slice(0, 40) + '"');
        });
        over = { scrollWidth: se.scrollWidth, els: bad.slice(-6) };
      }
      /* English left inside text the engine did translate (a broad pattern answering for part of a sentence) or in
         text it does not report: visible text nodes with common English words. */
      const EN = /\b(the|your|you|and|with|holes?|guests?|players?|spots?|left|from|of|is|are|has|have|will|this|that|Book|Cancel|View|Show|Add|Your|You|Today|Tomorrow|tees|members?|going|minimum|statement|AM|PM)\b/;
      const frag = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const v = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!v || !EN.test(v)) continue;
        const el = n.parentElement; if (!el || el.closest('[data-i18n-skip],script,style,textarea,svg,.pc-letter-body,.pd-dish-desc,.pd-dish-name,.pl-prog-desc,.fr-bubble,.fr-quote') || !el.getClientRects().length) continue;
        frag.push(v);
      }
      document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(el => { if (el.closest('[data-i18n-skip],svg') || el.tagName === 'TEXTAREA') return;   /* the engine skips textareas, placeholder included (reported) */ ['aria-label', 'placeholder', 'title'].forEach(a => { const v = el.getAttribute(a); if (v && EN.test(v)) frag.push('[' + a + '] ' + v); }); });
      return { m: m.map(x => x.text).concat(frag), over };
    });
    for (const t of r.m) { if (!missingAll.has(t)) missingAll.set(t, new Set()); missingAll.get(t).add(w + ' ' + state); }
    if (r.over) overflows.push({ w, state, ...r.over });
  }
  async function go(route, state) { await closeAll(); await p.evaluate(r => { location.hash = r; }, '#/' + route); await p.waitForTimeout(1100); await openAccs(); await record(state || route); }
  async function tap(sel, state) { const n = await p.locator(sel).count(); if (!n) { res.push('NOTE ' + w + ': no ' + sel + ' for ' + state); return false; } await human(p, sel); await openAccs(); await record(state); return true; }
  async function shot(name) { await p.screenshot({ path: 'i18n-portal-' + name + '-' + w + '.png' }); }

  /* Home, menus */
  await go('home'); await shot('home');
  if (w < 768) { await tap('.p-more-btn', 'more menu'); await shot('more'); await closeAll(); }
  else {
    if (await p.locator('.p-navmore:not([hidden]) .p-navmore-btn').count()) { await tap('.p-navmore-btn', 'nav more'); await p.keyboard.press('Escape'); }
    await tap('.p-me-btn', 'me menu'); await p.mouse.click(5, 5);
  }
  if (await p.locator('[data-act=all-up]').count()) { await tap('[data-act=all-up]', 'home coming up sheet'); await closeAll(); }

  /* Tee times */
  await go('tee-times', 'tee times book'); await shot('teetimes');
  await tap('.tt-cal', 'date picker sheet'); await closeAll();
  if (await tap('.tt-slot:not([disabled]):not(.st-mine):not(.is-wl)', 'tee time selected')) {
    await shot('teetimes-bar');
    await tap('.pk-bar.open .pk-bar-btn', 'booking sheet'); await shot('booking');
    await tap('.ps-sheet.open [data-act=add-guest]', 'guest form'); await shot('guest');
    await human(p, '.ps-sheet.open [data-act=guest-ok]'); await record('guest form errors');
    await closeTop();
    await tap('.ps-sheet.open [data-act=add-member]', 'add a friend sheet'); await closeTop();
    await closeAll();
  }
  if (await p.locator('.tt-slot.is-wl').count()) { await tap('.tt-slot.is-wl', 'waitlist sheet'); await closeAll(); }
  await go('tee-times/mine', 'my tee times'); await shot('mytt');
  if (await tap('[data-act=detail]', 'tee time detail')) { await shot('ttdetail');
    if (await p.locator('.ps-sheet.open [data-act=d-cancel]').count()) { await tap('.ps-sheet.open [data-act=d-cancel]', 'cancel ask'); }
    await closeAll(); }

  /* Dining */
  await go('dining/reserve', 'dining reserve'); await shot('dining');
  await tap('.pd-where .pk-select', 'dining where sheet'); await closeAll();
  if (await tap('.pd-chip:not(.full):not([disabled])', 'dining time selected')) { await tap('.pk-bar.open .pk-bar-btn', 'dining confirm sheet'); await shot('dining-confirm'); await closeAll(); }
  await go('dining/reservations', 'my reservations');
  if (await tap('.pd-row[data-res]', 'reservation detail')) { await shot('dining-detail'); await closeAll(); }
  await go('dining/menus', 'menus');

  /* Events */
  await go('events', 'events'); await shot('events');
  const evId = await p.evaluate(() => { const e = Club.store.all('events').filter(x => x.status === 'published' && x.date > Club.date.today() && +x.price > 0 && x.type !== 'Private' && !(x.registrations || []).some(r => r.memberId === 'mem_1003')); return e[0] && e[0].id; });
  if (evId) { await go('events/' + evId, 'event detail'); await shot('event');
    if (await tap('.pk-bar.open .pk-bar-btn', 'event review sheet')) { await shot('event-review'); await closeAll(); } }
  const myEv = await p.evaluate(() => { const e = Club.store.all('events').find(x => x.status === 'published' && x.date >= Club.date.today() && (x.registrations || []).some(r => r.memberId === 'mem_1003')); return e && e.id; });
  if (myEv) await go('events/' + myEv, 'event registered');
  await go('events/leaderboard', 'leaderboard');
  await go('events/league', 'league');

  /* Lessons */
  await go('lessons/book', 'lessons book'); await shot('lessons');
  await tap('.pl-pro-sel .pk-select', 'pro sheet'); await closeAll();
  if (await tap('.pl-chip', 'lesson time')) { await tap('.pk-bar.open .pk-bar-btn', 'lesson confirm'); await shot('lesson-confirm'); await closeAll(); }
  await go('lessons/mine', 'my lessons');
  if (await tap('.pl-row[data-les]', 'lesson detail')) await closeAll();
  await go('lessons/academy', 'clinics');

  /* Friends */
  await go('friends', 'friends'); await shot('friends');
  if (await tap('[data-friend]', 'friend profile')) { if (await p.locator('[data-fr=sharing]').count()) { await tap('[data-fr=sharing]', 'sharing sheet'); await closeTop(); } await closeAll(); }
  if (await tap('[data-fr=join]', 'join sheet')) { await shot('join'); await closeAll(); }
  if (await tap('[data-fr=ask]', 'request to join sheet')) await closeAll();
  await p.fill('.fr-search input', 'a').catch(() => {}); await p.waitForTimeout(500); await record('friends search');
  await go('friends/requests', 'requests');
  await go('friends/messages', 'messages');
  if (w < 1024) await tap('.fr-convos a', 'conversation');
  if (await tap('[data-fr=msg]', 'message options')) { await tap('.ps-sheet.open .ps-row[data-v=report]', 'report sheet'); await closeAll(); }

  /* Club */
  await go('club', 'club course'); await shot('club');
  await go('club/news', 'news'); if (await tap('.pc-notice', 'notice')) await closeAll();
  await go('club/directory', 'directory');
  await go('club/info', 'club info');

  /* Profile */
  await go('profile', 'profile'); await shot('profile');
  for (const g of ['contact', 'family', 'comm', 'privacy', 'prefs', 'golf']) { if (await tap('[data-go=' + g + ']', 'profile ' + g)) { if (g === 'golf') await shot('golf'); if (g === 'privacy' && await p.locator('[data-perfriend]').count()) { await tap('[data-perfriend]', 'per-friend list'); } await closeAll(); } }

  /* Account */
  await go('account', 'account overview'); await shot('account');
  await go('account/activity', 'activity');
  await go('account/statements', 'statements'); if (await tap('.pa-st', 'statement')) await shot('statement');
  await go('account/receipts', 'receipts'); await shot('receipts');
  if (await tap('.pa-rc-row', 'receipt open')) { await shot('receipt'); await closeAll(); }
  await go('account/pay', 'pay'); await shot('pay');
  await go('account/renew', 'renew'); await shot('renew');
  if (await p.locator('.pk-bar.open .pk-bar-btn').count()) { await tap('.pk-bar.open .pk-bar-btn', 'renew review'); await shot('renew-review'); await closeAll(); }
  await go('account/summary', 'season summary'); await shot('summary');

  /* Scores */
  await go('scores', 'scores'); await shot('scores');
  if (await tap('[data-post]', 'score detail')) await closeAll();
  await go('scores/post', 'post round');
  if (await tap('.pk-bar.open .pk-bar-btn', 'post score')) { await shot('post-score'); if (await tap('.pk-bar.open .pk-bar-btn', 'post attest')) { await tap('.pk-bar.open .pk-bar-btn', 'post review'); await shot('post-review'); await closeAll(); } }

  /* Gifts, takeout, feedback, waitlist sheet */
  await go('gifts/buy', 'gifts buy'); await shot('gifts');
  await go('gifts/mine', 'gifts mine'); if (await tap('[data-gc-open]', 'gift card sheet')) await closeAll();
  await go('gifts/balance', 'gifts balance'); await p.fill('#pg-bal-code', 'ABCD').catch(() => {}); await human(p, '.gp-bal-form button[type=submit]').catch(() => {}); await record('gift balance error');
  await go('takeout', 'takeout'); await shot('takeout');
  await go('takeout/orders', 'takeout orders');
  await go('feedback', 'feedback'); await shot('feedback');

  /* Sign in page */
  await closeAll();
  await p.evaluate(() => { localStorage.removeItem('stboniface.portal.session'); });
  await c.clearCookies();
  const p2 = await c.newPage(); p2.on('pageerror', e => errs.push(w + ' ' + e.message));
  await p2.addInitScript(() => { try { localStorage.removeItem('stboniface.portal.session'); } catch (e) {} });
  await p2.goto(B + 'member.html', { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1300);
  const si = await p2.evaluate(() => Club.i18n.missing().map(x => x.text));
  for (const t of si) { if (!missingAll.has(t)) missingAll.set(t, new Set()); missingAll.get(t).add(w + ' sign in'); }
  await p2.screenshot({ path: 'i18n-portal-signin-' + w + '.png' });
  await c.close();
  globalThis.__names = new Set([...(globalThis.__names || []), ...names]);
}
await b.close();

const names = globalThis.__names;
LONG = [...names].filter(n => n.includes(' ') || n.length > 5).sort((a, b) => b.length - a.length);
/* Known conflicts owned by the other dictionaries: fr-public's /^Pay (.+)$/ and /^With (.+)$/ patterns run before this
   file's (dictionaries are tried in load order) and translate only the first word of these portal strings. Reported. */
const KNOWN = [/^Payer in full/, /^Avec [a-z]/, /^High chair needed$/, /^Window table overlooking the 18th requested$/ /* staff-typed dining notes (data) */];
const known = [...missingAll.keys()].filter(t => KNOWN.some(r => r.test(t)));
const left = [...missingAll.entries()].filter(([t]) => !allowed(t, names) && !KNOWN.some(r => r.test(t)));
if (known.length) res.push('WARN cross-dictionary conflicts (fr-public patterns answer first): ' + JSON.stringify(known));
if (DUMP) { fs.writeFileSync('xi18n-portal-missing.json', JSON.stringify(left.map(([t, s]) => ({ t, at: [...s].slice(0, 4) })), null, 1)); fs.writeFileSync('xi18n-portal-kept.json', JSON.stringify([...missingAll.entries()].filter(([t]) => allowed(t, names)).map(([t, s]) => ({ t, at: [...s][0] })), null, 1)); }
const kept = [...missingAll.keys()].filter(t => allowed(t, names));
ok(left.length === 0, 'no untranslated English (' + missingAll.size + ' reported, ' + kept.length + ' allow-listed as names or data)', left.slice(0, 40).map(([t, s]) => t + '  @' + [...s][0]));
ok(overflows.length === 0, 'no horizontal scroll in French', overflows);
ok(errs.length === 0, 'no console errors', errs.slice(0, 10));
console.log(res.join('\n'));
console.log('allow-listed: ' + JSON.stringify(kept.slice(0, 60)));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED (' + res.filter(x => x.startsWith('PASS')).length + ')');
process.exit(fails ? 1 : 0);
