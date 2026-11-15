import { open, go } from './xc-lib.mjs';
for (const W of [1440, 390]) {
  const { b, p, errs } = await open(W);
  await go(p, '#/functions/fn_9'); await p.waitForTimeout(800);
  await p.screenshot({ path: 'xc-fn-top-' + W + '.png' });
  await go(p, '#/functions'); await p.waitForTimeout(800);
  await p.screenshot({ path: 'xc-fn-board-' + W + '.png' });
  console.log(W, errs);
  await b.close();
}
