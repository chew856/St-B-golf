import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
for (const sel of ['[data-panel="golf-pace"] .rgo-pace-row[data-arg="band:0"]', '[data-panel="golf-demand"] .rowbtn[data-drill="slot"]']) {
  const loc = p.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox();
  const x = bb.x + Math.min(bb.width / 2, 40), y = bb.y + bb.height / 2;
  console.log(sel, bb, await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.tagName + '.' + e.className + ' in ' + (e.closest('button') || {}).className; }, [x, y]));
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600);
  console.log('drawer', await p.evaluate(() => document.querySelector('aside.drawer h3')?.textContent));
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
}
await b.close();
