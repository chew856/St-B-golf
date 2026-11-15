import { webkit } from 'playwright';
import { B, suite, human } from './xb-lib.mjs';
const S = suite(); const { ok } = S;
const b = await webkit.launch();
for (const W of [1280, 1440, 1600, 1920, 375, 390]) {
  for (const col of (W > 900 ? [false, true] : [false])) {
    const c = await b.newContext({ viewport: { width: W, height: 1000 } }); const p = await c.newPage();
    p.on('pageerror', e => S.errs.push(W + ' ' + e.message));
    await p.goto(B + 'index.html#/proshop/sales', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    if (col) { await human(p, '.sb-toggle, [data-action=sidebar], button[aria-label*="sidebar" i]'); await p.waitForTimeout(500); }
    const isCol = await p.evaluate(() => document.documentElement.classList.contains('sb-collapsed'));
    const r = await p.evaluate(() => {
      const t = document.querySelector('.ps-tender-split'), pr = t.closest('.panel').getBoundingClientRect(), tb = t.querySelector('table').getBoundingClientRect();
      const fld = [...document.querySelectorAll('.ps-sales-tools .cs-val, .ps-sales-tools .df-val, .ps-sales-tools [class*=val]')].map(e => e.scrollWidth <= e.clientWidth + 1);
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, inPanel: tb.right <= pr.right + 0.5 && tb.left >= pr.left - 0.5, fld };
    });
    ok(r.sw <= r.iw + 1 && r.inPanel, W + (col ? ' collapsed' : ' open') + ': no sideways scroll, tender table inside its panel', r);
    if (col) ok(isCol, W + ' sidebar collapsed');
    await p.evaluate(() => document.querySelector('.ps-tender-split').scrollIntoView({ block: 'center' })); await p.waitForTimeout(500);
    await p.screenshot({ path: 'psov-' + W + (col ? '-col' : '') + '.png' });
    await c.close();
  }
}
await b.close(); S.done(); if (S.errs.length) console.log('ERRORS', S.errs);
