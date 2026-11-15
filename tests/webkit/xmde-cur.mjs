import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const OUT = './out/mock-dining-events/current/';
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
  await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(1800);
  const go = async h => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(1200); };
  const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: OUT + n + '-' + W + '.png', fullPage: true }); };
  await go('#/dining/reservations'); await shot('dining-res');
  await go('#/dining/floor'); await shot('dining-floor');
  // dinner service
  await p.evaluate(() => { const b = [...document.querySelectorAll('.segmented button')].find(x => x.textContent.trim() === 'Dinner'); b && b.click(); }); await shot('dining-floor-dinner');
  await p.evaluate(() => { const g = document.querySelector('.fp-table.seated') || document.querySelector('.fp-table'); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'dining-floor-drawer-' + W + '.png' });
  await p.keyboard.press('Escape');
  await go('#/functions'); await shot('fn-pipeline');
  await p.evaluate(() => { [...document.querySelectorAll('.tab')].find(x => /Calendar/.test(x.textContent)).click(); }); await shot('fn-calendar');
  await p.evaluate(() => { [...document.querySelectorAll('.tab')].find(x => /Packages/.test(x.textContent)).click(); }); await shot('fn-packages');
  const id = await p.evaluate(() => (Club.store.all('functions').find(f => f.stage === 'Deposit paid' && f.type === 'Wedding') || Club.store.all('functions')[0]).id);
  await go('#/functions/' + id); await shot('fn-detail-overview');
  for (const t of ['Quote', 'Proposal', 'Payments']) { await p.evaluate(t => { [...document.querySelectorAll('.tab')].find(x => x.textContent.trim() === t).click(); }, t); await shot('fn-detail-' + t.toLowerCase()); }
  await c.close();
}
await b.close();
