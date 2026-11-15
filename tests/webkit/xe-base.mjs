import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const out = process.argv[2] || 'base';
const b = await webkit.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(B + 'member.html#/shop', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
  await p.evaluate(() => { const pr = Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 0).slice(0, 2); pr.forEach(x => Club.shop.addToCart('mem_mem_1003', x.id, 1)); });
  await p.goto(B + 'member.html#/shop/basket'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `xe-shots/${out}-pshop-${w}.png`, fullPage: true });
  await p.goto(B + 'member.html#/takeout'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `xe-shots/${out}-ptake-${w}.png`, fullPage: false });
  await c.close();
}
await b.close();
