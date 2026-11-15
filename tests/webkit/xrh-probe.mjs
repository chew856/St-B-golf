import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/reports/hospitality', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => { const raw = localStorage.getItem(Club.store.KEY) || ''; const db = JSON.parse(raw); const sizes = Object.keys(db).map(k => [k, JSON.stringify(db[k]).length]).sort((a,b)=>b[1]-a[1]).slice(0,15);
 return { total: raw.length, sizes, cart: Club.store.all('cartOrders').length, to: Club.store.all('takeoutOrders').length, users: Club.store.all('publicPlayers').length }; });
console.log(JSON.stringify(r, null, 1), errs);
await b.close();
