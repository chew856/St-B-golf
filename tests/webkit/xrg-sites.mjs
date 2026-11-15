import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; let pass = 0, fail = 0;
const b = await webkit.launch();
for (const W of [1440, 390]) for (const url of ['member.html', 'public.html', 'public.html#/join', 'index.html#/members', 'index.html#/billing/renewals', 'index.html#/reports', 'index.html#/reports/golf', 'index.html#/reports/hospitality']) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(1200);
  await p.goto(B + url); await p.waitForTimeout(1800);
  const hs = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (!errs.length && hs <= 0) pass++; else { fail++; console.log('FAIL', W, url, hs, errs.join(' | ')); }
  await ctx.close();
}
await b.close(); console.log(`PASS ${pass} FAIL ${fail}`);
