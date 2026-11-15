import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
p.on('pageerror', e => console.log('PAGE', e.message));
await p.goto('http://localhost:8001/site/index.html#/reports/members', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
for (let i = 0; i < 3; i++) {
  const loc = p.locator('#rp-sec-members .rp-more').nth(i);
  await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(100);
  const bb = await loc.boundingBox();
  const at = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.className + ' / ' + e.closest('.rp-panel')?.dataset.panel; }, [bb.x + 16, bb.y + 16]);
  await p.mouse.move(bb.x + 10, bb.y + 10); await p.mouse.move(bb.x + 16, bb.y + 16, { steps: 3 }); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(400);
  console.log(i, 'at', at, 'open:', await p.evaluate(() => { const m = document.querySelector('.rp-menu:not([hidden])'); return m ? m.closest('.rp-panel').dataset.panel : null; }));
  if (i === 0) { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.locator('.rp-menu:not([hidden]) [data-mi-csv]').first().click()]); console.log('dl', !!dl); await p.waitForTimeout(300); }
  else await p.keyboard.press('Escape');
}
await b.close();
