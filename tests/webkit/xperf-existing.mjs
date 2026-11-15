// Existing-data check: a store first written by the old code, then reopened by old vs new code on every page.
import { webkit } from 'playwright';
const B = process.argv[2]; const b = await webkit.launch(); const out = {};
for (const v of ['before', 'after']) {
  const c = await b.newContext(); await c.clock.setFixedTime(new Date('2026-11-12T10:15:00'));
  await c.route(u => !u.href.startsWith(B), r => r.abort());
  const errs = []; let q; let i = 0;
  for (const u of ['before/member.html', v + '/public.html', v + '/index.html', v + '/member.html']) {
    q = await c.newPage(); const seed = 1000 + (++i) * 7919;
    await q.addInitScript(sd => { let s = sd; Math.random = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }, seed);
    q.on('pageerror', e => errs.push(e.message));
    await q.goto(B + u, { waitUntil: 'domcontentloaded', timeout: 20000 }); await q.waitForTimeout(2500);
    if (i < 4) await q.close();
  }
  out[v] = await q.evaluate(() => Club.store.exportJSON()); console.log(v, out[v].length, errs.slice(0, 2));
  await c.close();
}
console.log(out.before === out.after ? 'existing data: IDENTICAL' : 'existing data: DIFFERENT'); await b.close();
