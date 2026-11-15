import { webkit } from 'playwright';
const D = './out/mock-dining-events/';
const jobs = process.argv.slice(2).map(s => s.split('@')); // file?query@name
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  for (const [f, name] of jobs) {
    await p.goto('file://' + D + f); await p.waitForTimeout(900);
    await p.screenshot({ path: D + 'shots/' + name + '-' + W + '.png', fullPage: true });
    const hs = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (hs > 1) errs.push(name + ' hscroll ' + hs);
  }
  if (errs.length) console.log(W, errs.join('\n'));
  await c.close();
}
await b.close();
