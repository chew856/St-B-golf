import { open, go, human } from './xc-lib.mjs';
const { b, p } = await open(1440);
await go(p, '#/functions'); await human(p, p.locator('.fw-tabs .tab', { hasText: 'Pipeline' }).first());
console.log(await p.evaluate(() => { const bt = document.querySelector('.fw-card[data-flip="fn_9"] .fw-next'); const cs = getComputedStyle(bt); const sp = bt.querySelector('span'); return { w: bt.offsetWidth, sw: sp.scrollWidth, spw: sp.offsetWidth, maxW: cs.maxWidth, flex: cs.flex, pad: cs.padding, foot: bt.parentElement.offsetWidth, spcs: getComputedStyle(sp).maxWidth, spflex: getComputedStyle(sp).flex }; }));
await b.close();
