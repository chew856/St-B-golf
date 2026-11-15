import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(() => { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', 'fr'); });
const p = await c.newPage(); await p.goto('http://localhost:8001/site/member.html#/outings/enquire', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => [...document.querySelectorAll('.po-choice-s, .po-est-s, .po-enq-s')].map(x => x.textContent)));
console.log(await p.evaluate(() => [Club.i18n.t('16 to 40 players'), Club.i18n.t('$130 per player'), Club.i18n.t('16 to 40 players · $130 per player')]));
await b.close();
