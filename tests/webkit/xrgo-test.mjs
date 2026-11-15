import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/'; const res = []; let fails = 0;
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
async function human(p, loc) { if (typeof loc === 'string') loc = p.locator(loc).first(); await loc.waitFor({ timeout: 8000 }); await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(60); const box = await loc.boundingBox(); const x = box.x + Math.min(box.width / 2, 40), y = box.y + box.height / 2;
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(500); }
const drawerOpen = p => p.evaluate(() => { const d = document.querySelector('aside.drawer'); if (!d) return null; const r = d.getBoundingClientRect(); return { title: d.querySelector('h3').textContent, w: Math.round(r.width), right: Math.round(r.right), tables: d.querySelectorAll('table').length, text: d.querySelector('.modal-body').innerText.length, em: /—/.test(d.innerText) }; });
async function closeDrawer(p, how) {
  if (how === 'esc') await p.keyboard.press('Escape'); else await human(p, 'aside.drawer [data-action=close]');
  await p.waitForTimeout(600); return !(await p.evaluate(() => !!document.querySelector('aside.drawer')));
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

const PANELS = ['golf-pace', 'golf-demand', 'golf-cancel', 'golf-weather'];
const DRILL = { 'golf-pace': 'pace', 'golf-demand': 'demand', 'golf-cancel': 'cancel', 'golf-weather': 'weather' };
const CSV = { 'golf-pace': 'pace', 'golf-demand': 'demand', 'golf-cancel': 'cancel', 'golf-weather': 'weather' };
/* A drill the section exposes by key and argument, clicked as a real button inside the section (the panels show
   bands and top slots; weekday and booking-source drills are reached from the same delegated handler). */
async function drillBtn(p, key, arg) {
  await p.evaluate(([k, a]) => { document.querySelectorAll('.xt-drill').forEach(x => x.remove()); const btn = document.createElement('button'); btn.className = 'xt-drill'; btn.dataset.drill = k; if (a != null) btn.dataset.arg = a; btn.textContent = 'x'; btn.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:100;width:30px;height:30px'; document.querySelector('#rp-sec-golf').appendChild(btn); }, [key, arg]);
  await human(p, '.xt-drill');
}

const b = await webkit.launch();
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true, hasTouch: W < 500 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  const info = await p.evaluate(() => ({ active: document.querySelector('.rp-tabs .tab.active')?.dataset.rtab, panels: [...document.querySelectorAll('#rp-sec-golf .rp-panel:not(.rp-ideas)')].map(c => c.dataset.panel),
    empties: [...document.querySelectorAll('#rp-sec-golf .rp-panel')].filter(x => !x.querySelector('.rp-pb').innerHTML.trim()).map(x => x.dataset.panel), em: /—/.test(document.querySelector('#rp-sec-golf').innerText) }));
  ok(info.active === 'golf' && JSON.stringify(info.panels) === JSON.stringify(['golf-rounds', 'golf-util', 'golf-played'].concat(PANELS)), W + ': Golf shows rounds, tee sheet use, how played and the four panels in order', info.panels);
  ok(info.empties.length === 0, W + ': no panel is empty with the demo data', info.empties);
  ok(!info.em, W + ': no em dashes in the Golf section');
  ok(await noScroll(p), W + ': no horizontal page scroll');
  await p.screenshot({ path: `xrgo-golf-${W}.png`, fullPage: true });

  // Each panel's "See ..." link opens its details drawer, closes with the close button
  for (const id of PANELS) {
    await human(p, `[data-panel="${id}"] .rp-pf [data-drill="${DRILL[id]}"]`);
    const d = await drawerOpen(p);
    ok(d && d.tables >= 1 && d.text > 200 && !d.em && d.right <= W + 1, `${W}: ${id} opens a details drawer with tables`, d);
    if (id === 'golf-pace' || W === 390) await p.screenshot({ path: `xrgo-drawer-${id}-${W}.png` });
    ok(await closeDrawer(p, 'btn'), `${W}: ${id} drawer closes with the close button`);
  }
  // Row-level drills
  await drillBtn(p, 'pace', 'wd:5');
  let d = await drawerOpen(p); ok(d && /^Pace on Saturdays/.test(d.title) && d.tables >= 1, `${W}: pace weekday drill opens "Pace on Saturdays"`, d);
  ok(await closeDrawer(p, 'esc'), `${W}: Escape closes it`);
  await human(p, '[data-panel="golf-pace"] .rgo-pace-row[data-arg="band:0"]');
  d = await drawerOpen(p); ok(d && /morning tee times/.test(d.title), `${W}: pace band row opens the morning drawer`, d); await closeDrawer(p, 'esc');
  await human(p, '[data-panel="golf-demand"] .rowbtn[data-drill="slot"]');
  d = await drawerOpen(p); ok(d && d.tables >= 2, `${W}: most wanted slot opens its requests`, d); await closeDrawer(p, 'esc');
  await drillBtn(p, 'cancel', 'portal');
  d = await drawerOpen(p); ok(d && /members' portal/.test(d.title), `${W}: the booking source drill opens that source`, d); await closeDrawer(p, 'esc');
  await human(p, '[data-panel="golf-weather"] .rp-link[data-drill="weather"]');
  d = await drawerOpen(p); ok(d && /Weather and rounds/.test(d.title) && d.tables >= 3, `${W}: weather "See day by day" opens`, d);
  if (W === 390) await p.screenshot({ path: `xrgo-drawer-weather-day-${W}.png` });
  await closeDrawer(p, 'esc');
  await p.evaluate(() => document.querySelectorAll('.xt-drill').forEach(x => x.remove()));

  // Keyboard: focus a pace row and a KPI figure, press Enter / Space
  await p.focus('[data-panel="golf-pace"] .rgo-pace-row[data-arg="band:3"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  d = await drawerOpen(p); ok(d && /evening/.test(d.title), `${W}: Enter on a focused pace row opens it`, d); await closeDrawer(p, 'esc');
  await p.focus('#rp-sec-golf .rp-kpi button[data-drill="pace"]'); await p.keyboard.press(' '); await p.waitForTimeout(500);
  d = await drawerOpen(p); ok(d && /Pace/.test(d.title), `${W}: Space on a focused KPI figure opens it`, d); await closeDrawer(p, 'esc');
  await p.focus('[data-panel="golf-demand"] .rowbtn[data-drill="slot"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  d = await drawerOpen(p); ok(!!d, `${W}: Enter on the slot button opens it`, d); await closeDrawer(p, 'esc');

  // CSV export for each panel, from its "..." menu
  for (const id of PANELS) {
    await human(p, `[data-panel="${id}"] .rp-more`);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), human(p, '.rp-menu:not([hidden]) [data-mi-csv]')]);
    let rows = 0, head = '';
    if (dl) { const f = await dl.path(); const t = fs.readFileSync(f, 'utf8'); const lines = t.split(/\r\n/); rows = lines.length; head = lines[0]; if (W === 1440) fs.writeFileSync(`xrgo-${id}.csv`, t); }
    ok(dl && rows > 5 && new RegExp('stboniface-' + CSV[id] + '-').test(dl.suggestedFilename()), `${W}: ${id} CSV downloads (${rows} lines: ${head.slice(0, 60)})`, dl && dl.suggestedFilename());
  }
  ok(await noScroll(p), W + ': still no horizontal scroll after the drawers');
  ok(errs.length === 0, W + ': no console errors', errs);
  await ctx.close();
}

// Offline: the weather service is unreachable, demo rows are used and labelled
{
  const errs = []; const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await ctx.route(/open-meteo/, r => r.abort());
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|Failed to load|network/i.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  const w = await p.evaluate(() => ({ src: [...new Set(Club.store.all('weatherLog').map(x => x.source))], n: Club.store.all('weatherLog').length, txt: document.querySelector('#rp-sec-golf .rp-about').textContent.replace(/\n+/g, ' / ') }));
  ok(w.n === 14 && w.src.join() === 'demo' && /demo readings/.test(w.txt), 'offline: 14 demo weather rows, and About these numbers says the days use demo readings', w);
  console.log('   offline weather note: ' + (w.txt.match(/A wet day[^.]*\.[^.]*\./) || [''])[0]);
  await p.locator('[data-panel="golf-weather"]').screenshot({ path: 'xrgo-weather-offline.png' });
  ok(errs.length === 0, 'offline: no console errors', errs);
  await ctx.close();
}

// The club.js change on the members' portal and the public site
for (const page of ['member.html', 'public.html']) {
  const errs = []; const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + page, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
  const s = await p.evaluate(() => ({ wx: Club.store.all('weatherLog').length, wl: Club.store.all('teeWaitlist').length, w: !!(Club.weather && Club.weather.today) }));
  ok(errs.length === 0 && s.w && s.wx >= 14, `${page} loads with no errors (weather log ${s.wx} rows, waitlist ${s.wl})`, errs);
  await ctx.close();
}
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length);
await b.close();
