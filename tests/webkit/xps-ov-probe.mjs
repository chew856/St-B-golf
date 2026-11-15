import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch();
for (const W of [1280, 1440, 1600, 1920, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 1000 } }); const p = await c.newPage();
  await p.goto(B + 'index.html#/proshop/sales'); await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const out = { sw: document.documentElement.scrollWidth, iw: innerWidth, bodySW: document.body.scrollWidth };
    const wide = [];
    document.querySelectorAll('.ps-sales-lower *, .ps-sales-charts *, .ps-sales-filter *, .ps-sales-stats *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1) wide.push(e.tagName + '.' + e.className + ' ' + Math.round(r.right) + ' sw' + e.scrollWidth + ' cw' + e.clientWidth); });
    out.wide = wide.slice(0, 15);
    const sc = []; document.querySelectorAll('*').forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') sc.push(e.tagName + '.' + e.className + ' ' + e.scrollWidth + '/' + e.clientWidth); });
    out.sc = sc.slice(0, 15);
    return out;
  });
  console.log(W, JSON.stringify(r, null, 1));
  await p.screenshot({ path: 'psov-before-' + W + '.png' });
  await c.close();
}
await b.close();
