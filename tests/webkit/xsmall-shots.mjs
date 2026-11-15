import { webkit } from 'playwright';
const SH = './shots/';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/events'); await p.waitForTimeout(1800);
const st = p.locator('.stats').first(); await st.screenshot({ path: SH + 'events-stats-1900.png' });
await p.goto('http://localhost:8001/site/index.html#/lessons'); await p.waitForTimeout(1800);
const now = p.locator('.ls-now'); if (await now.count()) { await now.scrollIntoViewIfNeeded(); const bx = await now.boundingBox(); await p.screenshot({ path: SH + 'lessons-now-1900.png', clip: { x: Math.max(0, bx.x - 300), y: Math.max(0, bx.y - 120), width: 900, height: 240 } }); }
console.log('now line:', await now.count());
await p.goto('http://localhost:8001/site/index.html#/course'); await p.waitForTimeout(1500);
console.log('course tabs:', await p.evaluate(() => [...document.querySelectorAll('.cg-tabs .tab')].map(t => t.textContent.trim())));
await b.close();
