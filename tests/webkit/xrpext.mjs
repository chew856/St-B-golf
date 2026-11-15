import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
const r = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('.rp-tabs .tab')].map(t => t.textContent), panels: document.querySelectorAll('.rp-panel').length, sections: Club.reports.sections().map(s => s.id), api: typeof Club.reports.addSection }));
console.log(JSON.stringify(r), errs);
await b.close();
