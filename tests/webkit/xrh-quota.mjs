import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => { const used = Object.keys(localStorage).reduce((a,k)=>a+k.length+localStorage.getItem(k).length,0); let lo = 0, hi = 8e6; while (hi - lo > 10000) { const mid = (lo+hi)>>1; try { localStorage.setItem('__q', 'x'.repeat(mid)); lo = mid; } catch (e) { hi = mid; } } localStorage.removeItem('__q'); return { used, free: lo }; });
console.log(r);
await b.close();
