import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503/.test(m.text())) errs.push(m.text()); });
for (const h of ['proshop/register', 'proshop/online', 'proshop/inventory', 'proshop/sales', 'takeout', 'dining', 'cart', 'giftcards']) {
  await p.goto(B + 'index.html#/' + h); await p.waitForTimeout(1500);
  console.log(h, await p.evaluate(() => document.querySelector('main, .view, #view') ? document.title : 'no main'), errs.length);
}
console.log(errs); await b.close();
