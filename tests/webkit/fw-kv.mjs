import { open, go } from './xc-lib.mjs';
const { b, p } = await open(390);
await go(p, '#/functions/fn_5');
console.log(await p.evaluate(() => { const k = document.querySelector('.fw-kv'); const cs = getComputedStyle(k); return [k.className, cs.display, cs.gridTemplateColumns, k.parentElement.className, getComputedStyle(k.querySelector('dt')).gridColumn]; }));
await b.close();
