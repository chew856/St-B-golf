import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/reports/growth', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => ({
  tabs: [...document.querySelectorAll('.rp-tabs .tab')].map(t => t.textContent),
  cards: [...document.querySelectorAll('#rp-sec-growth .rp-card')].map(c => c.querySelector('h3').textContent + ' :: ' + c.querySelector('.panel-body').innerText.replace(/\s+/g, ' ').slice(0, 700)),
  demo: Club.store.getObj('growthDemo'),
  sw: document.documentElement.scrollWidth
}));
console.log(JSON.stringify(r, null, 1)); console.log('ERRS', errs);
await p.screenshot({ path: 'xrg-growth-1440.png', fullPage: true });
await b.close();
