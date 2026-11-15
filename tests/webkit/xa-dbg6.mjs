import { B, launch } from './xa-lib.mjs';
const { b, p } = await launch(1440);
await p.goto(B + 'index.html#/cart/mine'); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { const out = []; for (const s of document.styleSheets) { try { for (const r of s.cssRules) if (/toast/.test(r.cssText) && /pointer-events/.test(r.cssText)) out.push((s.href || '').split('/').pop() + ': ' + r.cssText.slice(0, 160)); } catch (e) {} } return out; }));
await p.evaluate(() => Club.ui.toast('x', '', { action: { label: 'Undo', onClick() {} } }));
console.log(await p.evaluate(() => getComputedStyle(document.querySelector('.toast.has-act')).pointerEvents));
await b.close();
