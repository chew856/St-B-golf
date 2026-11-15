import { webkit } from 'playwright';
import { B, click, type } from './xe-lib.mjs';
const b = await webkit.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text()); });
  await p.goto(B + 'member.html#/shop'); await p.waitForTimeout(1200);
  await p.evaluate(() => { Club.shop.clearCart('mem_mem_1003'); const pr = Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 0).slice(0, 2); pr.forEach(x => Club.shop.addToCart('mem_mem_1003', x.id, 1)); });
  await p.goto(B + 'member.html#/shop/basket'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `xe-shots/peek-pshop1-${w}.png`, fullPage: true });
  await click(p, '.ckf-next');
  await p.screenshot({ path: `xe-shots/peek-pshop2-${w}.png`, fullPage: true });
  await click(p, '.ck-mopt:has(input[value=card])');
  await p.screenshot({ path: `xe-shots/peek-pshop2c-${w}.png`, fullPage: true });
  await c.close();
}
await b.close();
