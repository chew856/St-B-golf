import { webkit } from 'playwright';
import { B } from './xb-lib.mjs';
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const s = await c.newPage();
  await s.goto(B + 'index.html#/dashboard'); await s.waitForTimeout(1200);
  const D = await s.evaluate(() => Club.date.fromToday(1));
  const t = await s.evaluate(d => { const taken = new Set(Club.store.all('teeTimes').filter(t => t.date === d && t.status !== 'cancelled').map(t => t.time)); return ['10:15','10:24','10:33','10:42','10:51','11:00','11:09','11:18'].find(x => !taken.has(x)) || '10:15'; }, D);
  await s.evaluate(([d, t]) => localStorage.setItem('stboniface.holds.v1', JSON.stringify([{ id: 'h1', owner: 'x', date: d, time: t, places: 2, source: 'portal', createdAt: Date.now(), expiresAt: Date.now() + 280000 }])), [D, t]);
  await s.evaluate(d => { location.hash = '#/teesheet/' + d; }, D); await s.waitForTimeout(1500);
  await s.evaluate(() => { const a = [...document.querySelectorAll('.ts-periods button')].find(b => /All day/.test(b.textContent)); if (a) a.click(); }); await s.waitForTimeout(400);
  await s.evaluate(t => document.querySelector('.ts-row[data-time="' + t + '"]').scrollIntoView({ block: 'center' }), t); await s.waitForTimeout(1200);
  await s.screenshot({ path: 'xb-holdshot-' + W + '.png' });
  await c.close();
}
await b.close();
