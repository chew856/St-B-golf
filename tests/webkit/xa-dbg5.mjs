import { B, human, launch } from './xa-lib.mjs';
const { b, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/cart/mine'); await p.waitForTimeout(1800);
if (await p.locator('[data-use="1"]').count()) await human(p, '[data-use="1"]');
if (await p.locator('[data-act=go]').count()) await human(p, '[data-act=go]');
await human(p, '[data-act=delivered]');
await p.waitForTimeout(300);
console.log(await p.evaluate(() => [...document.querySelectorAll('.overlay, .sheet, [class*=sheet]')].map(e => e.className + ' ' + getComputedStyle(e).zIndex).slice(0, 8)));
if (await p.locator('[data-rec]').count()) await human(p, '[data-rec]');
const vis = await p.locator('[data-bsave=items]').count();
if (vis) { await human(p, '[data-binc]'); await human(p, '[data-bsave=items]'); } else await human(p, '[data-paid]');
for (const t of [100, 600, 1200]) {
  await p.waitForTimeout(t);
  console.log(t, await p.evaluate(() => { const a = [...document.querySelectorAll('.toast-act')].pop(); if (!a) return 'none'; const r = a.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const chain = []; for (let n = e; n && chain.length < 6; n = n.parentElement) chain.push(n.tagName + '.' + n.className + '[' + getComputedStyle(n).zIndex + ',' + getComputedStyle(n).position + ']'); const tc = a.closest('.toasts'); return [a.closest('.toast').outerHTML.slice(0, 200), document.querySelectorAll('.toast').length, r.x, r.y, chain.join(' < '), tc.parentElement.tagName, getComputedStyle(a.closest('.toast')).pointerEvents, getComputedStyle(tc).pointerEvents, getComputedStyle(tc).position, getComputedStyle(tc).top]; }));
}
console.log(errs); await b.close();
