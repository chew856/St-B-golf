import { webkit } from 'playwright';
const b = await webkit.launch();
for (const W of [390, 1440]) {
const p = await (await b.newContext({ viewport: { width: W, height: 844 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/growth'); await p.waitForTimeout(2200);
console.log(W, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#rp-sec-growth .table-wrap')].map(w => w.closest('[data-report]').dataset.report + ':' + (w.scrollWidth - w.clientWidth)))));
}
await b.close();
