import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports'); await p.waitForTimeout(2000);
await p.screenshot({ path: 'rp-top.png', fullPage: false });
for (const t of ['revenue', 'growth', 'golf', 'hospitality', 'accounts']) {
  await p.evaluate(t => document.querySelector('[data-rtab="' + t + '"]').click(), t); await p.waitForTimeout(900);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: 'rp-' + t + '.png', fullPage: true });
  console.log(t, h);
}
await b.close();
