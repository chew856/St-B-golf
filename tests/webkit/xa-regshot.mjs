import { B, human, launch } from './xa-lib.mjs';
for (const W of [1440, 390]) {
  const { b, p, errs } = await launch(W);
  await p.goto(B + 'index.html#/proshop/register'); await p.waitForTimeout(1500);
  await human(p, '.ps-tile:not(.out)');
  await human(p, '#ps-cust'); await p.keyboard.type('ster', { delay: 30 }); await p.waitForTimeout(300);
  await p.locator('.ps-cust').scrollIntoViewIfNeeded();
  await p.screenshot({ path: 'xa-cust-list-' + W + '.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.locator('.ps-cust').scrollIntoViewIfNeeded();
  await p.screenshot({ path: 'xa-cust-chip-' + W + '.png' });
  console.log(W, errs, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await b.close();
}
