import { suite, open, human } from './xb-lib.mjs';
const T = suite();
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'events/evt_08', T);
  await human(p, '[data-action=complete]'); await p.waitForTimeout(500);
  await p.screenshot({ path: 'xb-shot-evdone-' + W + '.png' });
  await p.evaluate(() => { location.hash = '#/events/tournaments/trn_02'; }); await p.waitForTimeout(900);
  await p.screenshot({ path: 'xb-shot-trn-' + W + '.png' });
  await b.close();
}
console.log(T.errs);
