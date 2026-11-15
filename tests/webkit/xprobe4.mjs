import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => Club.store.all('applications').map(a => { const o = Object.assign({}, a); delete o.notes; return o; }).slice(0, 3)), null, 1).slice(0, 2500));
console.log(JSON.stringify(await p.evaluate(() => Club.store.all('membershipTiers').map(t => [t.id, t.name]))));
await b.close();
