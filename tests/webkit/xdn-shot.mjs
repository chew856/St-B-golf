import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const OUT = './out/dnshots/';
import fs from 'fs'; fs.mkdirSync(OUT, { recursive: true });
const which = process.argv[2] || 'all';
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: W > 600 ? 1000 : 844 } });
  await c.clock.setFixedTime(new Date('2026-11-12T19:25:00'));
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.staff.sidebar', 'collapsed'); } catch (e) {} });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/dining/floor'); await p.waitForTimeout(1800);
  await p.screenshot({ path: OUT + 'floor-' + W + '.png', fullPage: true });
  await p.goto(B + 'index.html#/dining/reservations'); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + 'res-' + W + '.png', fullPage: true });
  console.log(W, 'errors', errs, 'hscroll', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await c.close();
}
await b.close();
