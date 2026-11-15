import { webkit } from 'playwright';
const SH = './shots/';
const b = await webkit.launch();
for (const W of [390, 1440]) {
  const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage();
  await p.goto('http://localhost:8001/site/index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  const st = p.locator('.ts-stats .stat[data-drill="players"]'); await st.scrollIntoViewIfNeeded(); const bx = await st.boundingBox();
  await p.mouse.move(bx.x + 40, bx.y + 30); await p.waitForTimeout(400);
  await p.screenshot({ path: SH + 'tsdd-hover-' + W + '.png', clip: { x: Math.max(0, bx.x - 10), y: bx.y - 10, width: Math.min(W - Math.max(0, bx.x - 10), 900), height: bx.height + 20 } });
  if (W === 390) { await p.evaluate(() => { location.hash = '#/teesheet/' + Club.date.fromToday(-1); }); await p.waitForTimeout(900);
    await p.locator('.ts-stats .stat[data-drill="rounds"]').click(); await p.waitForTimeout(800); await p.screenshot({ path: SH + 'tsdd-390-rounds2.png' }); }
}
await b.close();
