import { webkit } from 'playwright';
const b = await webkit.launch();
for (const [W, H] of [[1280, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  await p.goto('http://localhost:8001/mock/reports.html', { waitUntil: 'load' }); await p.waitForTimeout(600);
  await p.screenshot({ path: `xrp2-mock-overview-${W}.png`, fullPage: true });
  await p.click('[data-sec=revenue]'); await p.waitForTimeout(400);
  await p.screenshot({ path: `xrp2-mock-revenue-${W}.png`, fullPage: true });
}
// current page
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  await p.goto('http://localhost:8001/site/index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
  await p.screenshot({ path: `xrp2-old-revenue-${W}.png`, fullPage: true });
}
await b.close();
