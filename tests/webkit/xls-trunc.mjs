import { suite, open } from './xb-lib.mjs';
const T = suite();
for (const W of [1900, 1440, 390]) { const { b, p } = await open(W, 'lessons', T); await p.waitForTimeout(800);
console.log(W, JSON.stringify(await p.evaluate(() => { const who = [...document.querySelectorAll('.ls-block .ls-b-last')];
  const t = who.filter(w => w.scrollWidth > w.clientWidth + 1 || w.scrollHeight > w.clientHeight + 1); return { n: who.length, trunc: t.length, sched: [document.querySelector('.ls-sched').clientWidth, document.querySelector('.ls-sched').scrollWidth] }; })));
await b.close(); }
