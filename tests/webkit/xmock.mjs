import { webkit } from 'playwright';
const b = await webkit.launch();
for (const [W, tag] of [[1280, 'desk'], [390, 'phone']]) {
  const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8001/mock/reports.html'); await p.waitForTimeout(1200);
  await p.screenshot({ path: 'mock-overview-' + tag + '.png', fullPage: true });
  await p.click('[data-sec=revenue]'); await p.waitForTimeout(600);
  await p.screenshot({ path: 'mock-revenue-' + tag + '.png', fullPage: true });
  console.log(tag, 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth), errs);
}
await b.close();
