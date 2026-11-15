import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/', K = 'stboniface.data.v2'; const b = await webkit.launch(); const c = await b.newContext();
await c.route(B + '__t.html', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><script>window.t0=performance.now()</script><script src="js/core/store.js"></script><script>window.t1=performance.now()</script>' }));
await c.route(B + '__blank.html', r => r.fulfill({ contentType: 'text/html', body: '<p>x' }));
const p = await c.newPage(); await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(1500);
const blob = await p.evaluate(() => JSON.stringify(JSON.parse(Club.store.exportJSON())));
const out = [];
for (let i = 0; i < 4; i++) {
  await p.goto(B + '__blank.html'); await p.evaluate(([K, v]) => { Object.keys(localStorage).filter(k => k.startsWith(K)).forEach(k => localStorage.removeItem(k)); localStorage.setItem(K, v); }, [K, blob]);
  await p.goto(B + '__t.html'); const m = await p.evaluate(() => t1 - t0);
  await p.reload(); const n = await p.evaluate(() => t1 - t0);
  out.push([m, n]);
}
console.log('store.js run incl. one-time split (ms) / normal per-collection load (ms):', JSON.stringify(out)); await b.close();
