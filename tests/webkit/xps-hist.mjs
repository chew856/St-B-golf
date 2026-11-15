import { webkit } from 'playwright';
const b = await webkit.launch();
for (const W of [1280, 1440, 1600, 1920]) for (const col of [0,1]) {
  const c = await b.newContext({ viewport: { width: W, height: 1000 } }); const p = await c.newPage();
  await p.goto('http://localhost:8001/site/index.html#/proshop/sales'); await p.waitForTimeout(1200);
  if (col) await p.evaluate(() => document.querySelector('.sb-toggle').click()); await p.waitForTimeout(400);
  console.log(W, col, await p.evaluate(() => { const w = document.querySelector('.ps-history .table-wrap'); return w ? w.scrollWidth + '/' + w.clientWidth : 'none'; }));
  await c.close();
}
await b.close();
