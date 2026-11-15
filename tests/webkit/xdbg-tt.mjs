import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 390, height: 900 } }); const p = await c.newPage();
await p.goto('http://localhost:8001/site/index.html#/proshop/sales'); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { const t = document.querySelector('.ps-tender-table'), h = t.parentNode; const cs = getComputedStyle(t); const tb = t.querySelector('tbody'), tr = t.querySelector('tr'); return { td: getComputedStyle(t).display, tbd: getComputedStyle(tb).display, tbw: tb.getBoundingClientRect().width, trw: tr.getBoundingClientRect().width, tw: t.getBoundingClientRect().width, hw: h.clientWidth, w: cs.width, flex: cs.flex, disp: getComputedStyle(h).display, dir: getComputedStyle(h).flexDirection, ai: getComputedStyle(h).alignItems, maxw: cs.maxWidth, as: cs.alignSelf }; }));
await b.close();
