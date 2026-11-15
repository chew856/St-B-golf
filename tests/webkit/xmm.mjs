import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports'); await p.waitForTimeout(2000);
const d = await p.evaluate(() => {
  const mm = Club.store.all('monthlyMetrics').map(m => ({ k: m.month, r: m.rounds, g: m.guestRounds, c: m.covers, mem: m.members, rev: m.revenue }));
  const stats = [...document.querySelectorAll('.rp-body .stat, .rp-body [class*=stat]')].slice(0, 4).map(s => s.innerText.replace(/\n/g, ' | '));
  const dept = [...document.querySelectorAll('.rp-dept-totals > *')].map(x => x.innerText.replace(/\n/g, ' '));
  return { mm, stats, dept };
});
console.log(JSON.stringify(d));
await b.close();
