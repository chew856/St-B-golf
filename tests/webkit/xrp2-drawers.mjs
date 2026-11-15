import { webkit } from 'playwright';
const b = await webkit.launch();
const errs = [];
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:8001/site/index.html#/reports/food', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
  for (const [sec, key] of [['food', 'covers'], ['golf', 'rounds']]) {
    await p.evaluate(([s, k]) => { document.querySelector(`.rp-tabs .tab[data-rtab="${s}"]`).click(); document.querySelector(`#rp-sec-${s} [data-drill="${k}"]`).click(); }, [sec, key]);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `xrp2-drawer-${key}-${W}.png` });
    const r = await p.evaluate(() => { const b = document.querySelector('aside.drawer .modal-body'); return { over: b.scrollWidth - b.clientWidth, ranked: b.querySelectorAll('.rows').length }; });
    console.log(W, key, JSON.stringify(r));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  }
}
console.log('errors', errs); await b.close();
