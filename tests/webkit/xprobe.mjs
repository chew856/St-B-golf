import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
for (const k of ['m12','m6','m3','last','this','d14','d7','ytd','lastyear']) {
  const r = await p.evaluate(k => { localStorage.setItem('stboniface.reports.period', JSON.stringify({kind:k})); return k; }, k);
  await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.reload(); await p.waitForTimeout(1500);
  const info = await p.evaluate(() => { return { line: document.querySelector('.rp-range').textContent, kpis: [...document.querySelectorAll('.rp-sec')].map(s => s.dataset.sec + ': ' + [...s.querySelectorAll('.rp-kpi')].map(k => k.querySelector('.l').textContent + '=' + k.querySelector('.v').textContent + ' [' + k.querySelector('.d').textContent + ']').join(' | ')) }; });
  console.log(k, JSON.stringify(info, null, 1));
}
await b.close();
