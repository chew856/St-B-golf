import { webkit } from 'playwright';
const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
async function human(p, loc) { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await p.mouse.move(x - 4, y - 2); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500); }
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8001/site/index.html#/settings'); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => [...document.querySelectorAll('.st-tabs .tab')].map(t => t.textContent.trim()));
  ok(!st.includes('Promotions') && !st.includes('Add-ons') && st.includes('Club profile'), W + ': Settings no longer has Promotions or Add-ons', st);
  await p.goto('http://localhost:8001/site/index.html#/proshop'); await p.waitForTimeout(1200);
  const pt = await p.evaluate(() => [...document.querySelectorAll('.ps-tabs .tab')].map(t => t.textContent.trim()));
  ok(pt.includes('Promotions') && pt.includes('Add-ons'), W + ': Pro Shop has Promotions and Add-ons tabs', pt);
  await human(p, p.locator('.ps-tabs .tab', { hasText: 'Promotions' }));
  ok(await p.evaluate(() => /WELCOME10/.test(document.querySelector('.ps-tabs').innerText) && location.hash === '#/proshop/promotions'), W + ': Promotions lists the codes, address #/proshop/promotions');
  await human(p, p.locator('.ps-tabs .tab', { hasText: 'Add-ons' }));
  ok(await p.evaluate(() => /Rental clubs/.test(document.querySelector('.ps-tabs').innerText)), W + ': Add-ons lists rental clubs');
  // toggle an add-on and undo, from its new home
  const before = await p.evaluate(() => JSON.stringify(Club.store.getObj('addons') || Club.store.all('addons')));
  const tog = p.locator('.ps-tabs input[type=checkbox]').first();
  if (await tog.count()) { await human(p, tog.locator('xpath=..')); const undo = p.locator('.toast.has-act .toast-act').last(); ok(await undo.isVisible(), W + ': turning an add-on off shows Undo'); await human(p, undo);
    ok(await p.evaluate(b => JSON.stringify(Club.store.getObj('addons') || Club.store.all('addons')) === b, before), W + ': Undo restores it'); }
  await human(p, p.locator('.ps-tabs .tab', { hasText: 'Register' }));
  ok(await p.evaluate(() => !!document.querySelector('.ps-tabs [data-add]')), W + ': back to Register works');
  await p.goto('http://localhost:8001/site/index.html#/settings/addons'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => location.hash === '#/proshop/addons' && /Rental clubs/.test(document.body.innerText)), W + ': old Settings link goes to Pro Shop > Add-ons', await p.evaluate(() => location.hash));
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ': no horizontal scroll');
}
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
