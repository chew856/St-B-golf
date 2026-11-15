import { suite, open, human, setVal } from './xb-lib.mjs';
const T = suite();
const { b, p } = await open(390, 'events/tournaments/trn_03', T);
await human(p, '[data-action=start]'); await p.waitForTimeout(300);
const add = await p.evaluate(() => document.querySelector('.ev-add-row select option[value^="mem_"]').value);
await setVal(p, '.ev-add-row select', add); await human(p, '[data-action=add-player]');
for (let i = 0; i < 3; i++) {
  console.log(await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => { const r = t.getBoundingClientRect(); const a = t.querySelector('.toast-act'); let hit = null; if (a) { const q = a.getBoundingClientRect(); const h = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); hit = h && (h.closest('.toast') || h).textContent.slice(0, 30); } return [t.className, t.textContent.slice(0, 30), Math.round(r.top), hit]; })));
  await p.waitForTimeout(400);
}
await p.screenshot({ path: 'xb-dbg.png' });
await b.close();
