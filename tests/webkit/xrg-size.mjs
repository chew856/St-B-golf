import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch();
async function run(block) {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  if (block) await p.route('**/reports-growth.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const s = localStorage.getItem('stboniface.data.v2') || ''; const db = JSON.parse(s); const per = {}; Object.keys(db).forEach(k => per[k] = JSON.stringify(db[k]).length); return { total: s.length, per }; });
  await ctx.close(); return r;
}
const a = await run(true), c = await run(false);
console.log('without', a.total, 'with', c.total, 'added', c.total - a.total);
const keys = new Set([...Object.keys(a.per), ...Object.keys(c.per)]);
for (const k of keys) { const d = (c.per[k] || 0) - (a.per[k] || 0); if (Math.abs(d) > 200) console.log(k, d); }
await b.close();
