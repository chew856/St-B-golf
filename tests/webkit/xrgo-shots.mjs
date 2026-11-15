import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
for (const id of ['rgo-pace', 'rgo-demand', 'rgo-cancel']) await p.locator(`[data-report="${id}"]`).screenshot({ path: `xrgo-card-${id}-390.png` });
await b.close();
