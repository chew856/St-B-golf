import { open, go, human, noHScroll } from './xc-lib.mjs';
const W = +(process.argv[2] || 1440);
const only = process.argv[3] || '';
const { b, p, errs } = await open(W);
const out = 'fwshots/';
const shot = async (n) => { await p.waitForTimeout(500); await p.screenshot({ path: out + n + '-' + W + '.png', fullPage: true }); console.log(n, 'hscroll ok:', await noHScroll(p)); };
const tab = async (t) => { await human(p, p.locator('.fw-tabs .tab', { hasText: t }).first()); };
if (!only || only === 'main') {
await go(p, '#/functions'); await shot('todo');
await tab('Pipeline'); await shot('pipeline');
await tab('Calendar'); await shot('calendar');
if (W > 800) { await human(p, '.fw-cday[data-date="' + await p.evaluate(() => Club.store.find('functions','fn_5').date) + '"] .fw-dn'); await shot('calendar-sel'); }
await tab('Packages'); await shot('packages');
}
if (!only || only === 'detail') {
await go(p, '#/functions/fn_11'); await shot('fn11');
await go(p, '#/functions/fn_5'); await human(p, '[data-action=q-toggle]'); await shot('fn5');
await go(p, '#/functions/fn_9'); await human(p, '[data-action=letter]'); await p.waitForTimeout(400); await p.screenshot({ path: out + 'letter-' + W + '.png' }); console.log('letter');
}
console.log('errors', errs);
await b.close();
