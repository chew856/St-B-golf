import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/growth'); await p.waitForTimeout(2200);
for (const id of ['growth-age', 'growth-renewal', 'growth-public', 'growth-heard']) await p.locator(`[data-report="${id}"]`).screenshot({ path: `xrg-card-${id}-390.png` });
await b.close();
