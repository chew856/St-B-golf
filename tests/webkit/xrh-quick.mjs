import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/reports/hospitality', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => { const s = Club.reportsHospitality.sample(); const c = s.cart.list, t = s.takeout.list;
  return { cart: c.length, cartSample: c.filter(o=>o.sample).length, cartFirst: s.cart.first, cartRange: [c.filter(o=>o.sample).map(o=>o.date).sort()[0], c.filter(o=>o.sample).map(o=>o.date).sort().pop()],
    to: t.length, toFirst: s.takeout.first, toRange: [t.map(o=>o.date).sort()[0], t.map(o=>o.date).sort().pop()], nos: [t[0] && t[0].no, t[t.length-1] && t[t.length-1].no],
    cards: [...document.querySelectorAll('#rp-sec-hospitality .rp-card')].map(c => c.dataset.report + ':' + c.querySelector('h3').textContent),
    texts: [...document.querySelectorAll('#rp-sec-hospitality .rp-card')].slice(2).map(c => c.innerText.slice(0, 1500)) }; });
console.log(JSON.stringify(r, null, 1)); console.log(errs);
await p.screenshot({ path: 'xrh-q-1440.png', fullPage: true });
await b.close();
