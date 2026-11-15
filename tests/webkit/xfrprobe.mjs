import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext(); await c.addInitScript(() => localStorage.setItem('stboniface.lang', 'fr')); const p = await c.newPage();
await p.goto('http://localhost:8001/site/public.html'); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => ['Add-ons', 'None added', 'Rental clubs', 'Have a promo code?', 'Pull cart', 'Sleeve of balls', 'One more'].map(s => s + ' -> ' + Club.i18n.t(s)))));
await b.close();
