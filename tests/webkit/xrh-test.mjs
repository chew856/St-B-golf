import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/';
let pass = 0, fail = 0; const out = [];
function ok(cond, msg) { if (cond) pass++; else fail++; out.push((cond ? 'PASS ' : 'FAIL ') + msg); }
const b = await webkit.launch();

async function click(p, sel) {
  const el = p.locator(sel).first(); await el.evaluate(x => x.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150);
  const bx = await el.boundingBox(); const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
  await p.mouse.move(x - 30, y - 20); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
}
async function drawer(p) { await p.waitForTimeout(600); return p.evaluate(() => { const d = document.querySelector('aside.drawer'); if (!d) return null; const body = d.querySelector('.modal-body'); return { title: d.querySelector('h3').textContent, over: body.scrollWidth - body.clientWidth, text: body.innerText.slice(0, 400), wide: d.getBoundingClientRect().width }; }); }
async function closeDrawer(p) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); return p.evaluate(() => !document.querySelector('aside.drawer')); }

for (const W of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: W, height: W > 500 ? 900 : 844 }, acceptDownloads: true, hasTouch: false });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports/food', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  const ids = await p.evaluate(() => [...document.querySelectorAll('#rp-sec-food .rp-panel')].map(c => c.dataset.panel));
  ok(['food-takeout', 'food-cartholes', 'food-carttimes', 'food-shop', 'food-check'].every(i => ids.includes(i)) && ids[0] === 'food-covers', W + ': section holds dining guests, then check, takeout, cart, shop (' + ids.join(',') + ')');
  const hs = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cards: [...document.querySelectorAll('#rp-sec-food .rp-panel')].map(c => c.scrollWidth - c.clientWidth) }));
  ok(hs.sw <= hs.iw, W + ': no horizontal page scroll (' + hs.sw + ' <= ' + hs.iw + ')');
  ok(hs.cards.every(v => v <= 1), W + ': no panel overflows its width (' + hs.cards.join(',') + ')');
  for (const id of ['takeout', 'cartholes', 'carttimes']) await p.locator('[data-panel="food-' + id + '"]').screenshot({ path: 'xrh-card-' + id + '-' + W + '.png' });
  const cells = await p.evaluate(() => { const c = [...document.querySelectorAll('.rh-hole')]; return { n: c.length, labels: c.every(x => /^Hole \d+: /.test(x.getAttribute('aria-label'))), focusable: c.every(x => x.tagName === 'BUTTON'), w: Math.min(...c.map(x => x.getBoundingClientRect().width)) }; });
  ok(cells.n === 18 && cells.labels && cells.focusable, W + ': 18 labelled hole buttons (min width ' + Math.round(cells.w) + 'px)');

  // Hole click with a real pointer
  await click(p, '.rh-hole[data-arg="13"]');
  let d = await drawer(p);
  ok(d && d.title === 'Hole 13' && /Top items/i.test(d.text + '') !== null, W + ': clicking hole 13 opens its drawer (' + (d && d.title) + ')');
  ok(d && d.over <= 1, W + ': hole drawer has no horizontal overflow (' + (d && d.over) + ')');
  const dtext = await p.evaluate(() => document.querySelector('aside.drawer .modal-body').innerText);
  ok(/Top items/.test(dtext) && /Latest orders/.test(dtext), W + ': hole drawer shows top items and latest orders');
  await p.screenshot({ path: 'xrh-drawer-hole-' + W + '.png' });
  ok(await closeDrawer(p), W + ': Escape closes the hole drawer');

  await click(p, '.rh-ch');
  d = await drawer(p); ok(d && d.title === 'Clubhouse or no hole', W + ': clubhouse figure opens its drawer');
  await closeDrawer(p);

  // Keyboard: focus hole 5, Enter
  await p.focus('.rh-hole[data-arg="5"]'); await p.keyboard.press('Enter');
  d = await drawer(p); ok(d && d.title === 'Hole 5', W + ': Enter on hole 5 opens its drawer');
  await closeDrawer(p);
  await p.focus('.rh-hole[data-arg="6"]'); await p.keyboard.press('Space');
  d = await drawer(p); ok(d && d.title === 'Hole 6', W + ': Space on hole 6 opens its drawer');
  await closeDrawer(p);

  // Details drawers
  for (const [key, title, must] of [['takeout', 'Takeout', /Top items[\s\S]*Repeat customers/], ['cartholes', 'Orders by hole', /Where the cart could wait/], ['carttimes', 'Cart delivery times', /Every hour/]]) {
    await click(p, '#rp-sec-food .rp-pf [data-drill="' + key + '"]');
    d = await drawer(p);
    const t = await p.evaluate(() => { const x = document.querySelector('aside.drawer .modal-body'); return x ? x.innerText : ''; });
    ok(d && d.title === title && must.test(t), W + ': ' + key + ' details drawer opens (' + (d && d.title) + ')');
    ok(d && d.over <= 1, W + ': ' + key + ' drawer has no horizontal overflow (' + (d && d.over) + ')');
    await p.waitForTimeout(700);
    await p.screenshot({ path: 'xrh-drawer-' + key + '-' + W + '.png' });
    ok(await closeDrawer(p), W + ': ' + key + ' drawer closes');
  }

  // CSV exports
  for (const id of ['takeout', 'cartholes', 'carttimes']) {
    await click(p, '[data-panel="food-' + id + '"] .rp-more'); await p.waitForTimeout(200);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), click(p, '.rp-menu:not([hidden]) [data-mi-csv]')]);
    let rows = [];
    if (dl) { const path = await dl.path(); const txt = fs.readFileSync(path, 'utf8'); rows = txt.split(/\r\n/); fs.writeFileSync('xrh-' + id + '-' + W + '.csv', txt); }
    ok(dl && rows.length > 10 && /^stboniface-/.test(dl.suggestedFilename()), W + ': ' + id + ' CSV downloads (' + (dl ? dl.suggestedFilename() : 'none') + ', ' + rows.length + ' rows; head: ' + (rows[0] || '') + ')');
  }

  // Period: This month (live cart orders only, sample takeout through yesterday)
  await p.evaluate(() => scrollTo(0, 0)); await click(p, '#rpPeriodBtn'); await p.waitForTimeout(300);
  await click(p, '.rp-opt[data-value="this"]'); await p.waitForTimeout(1500);
  const tm = await p.evaluate(() => ({ holes: document.querySelectorAll('#rp-sec-food .rp-kpi .v')[3]?.textContent, to: document.querySelectorAll('#rp-sec-food .rp-kpi .v')[2]?.textContent, line: document.querySelector('.rp-range').textContent,
    real: Club.store.all('cartOrders').filter(o => o.date >= Club.date.today().slice(0, 7) + '-01' && o.status !== 'cancelled').length }));
  ok(tm.holes === String(tm.real), W + ': This month: cart orders follow the period (' + tm.holes + ' shown, ' + tm.real + ' on file) ' + tm.line);
  await p.locator('[data-panel="food-cartholes"]').screenshot({ path: 'xrh-card-cartholes-thismonth-' + W + '.png' });
  await p.evaluate(() => scrollTo(0, 0)); await click(p, '#rpPeriodBtn'); await p.waitForTimeout(300);
  await click(p, '.rp-opt[data-value="m12"]'); await p.waitForTimeout(1500);
  const back = await p.evaluate(() => document.querySelectorAll('#rp-sec-food .rp-kpi .v')[3]?.textContent);
  ok(back && back !== tm.holes, W + ': Last 12 months restores the season (' + back + ')');
  ok(errs.length === 0, W + ': no console errors' + (errs.length ? ' ' + errs.join(' | ') : ''));
  await ctx.close();
}

// Clubhouse page: same figures with and without this module
async function clubhouse(block) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  if (block) await ctx.route('**/reports-food.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/cart/clubhouse', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ tiles: [...document.querySelectorAll('.cx-house .stat')].map(s => s.querySelector('.label-caps').textContent + '=' + s.querySelector('.stat-value').textContent + ' | ' + (s.querySelector('.stat-meta') || {}).textContent), orders: Club.store.all('cartOrders').length, to: Club.store.all('takeoutOrders').length }));
  if (!block) await p.screenshot({ path: 'xrh-clubhouse-1440.png' });
  await ctx.close(); return { r, errs };
}
const withMod = await clubhouse(false), without = await clubhouse(true);
ok(JSON.stringify(withMod.r) === JSON.stringify(without.r), 'Clubhouse tiles identical with and without the module: ' + withMod.r.tiles.join(' ; '));
ok(withMod.r.orders === 5 && withMod.r.to === 0, 'Store untouched: cartOrders ' + withMod.r.orders + ', takeoutOrders ' + withMod.r.to);
ok(withMod.errs.length === 0, 'Clubhouse: no console errors ' + withMod.errs.join(' | '));
await b.close();
console.log(out.join('\n')); console.log('PASS ' + pass + ' FAIL ' + fail);
