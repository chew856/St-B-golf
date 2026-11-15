import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(() => { localStorage.setItem('stboniface.lang', 'fr'); localStorage.setItem('stboniface.portal.session', 'mem_1003'); });
const p = await c.newPage();
await p.goto('http://localhost:8001/site/member.html#/friends/messages'); await p.waitForTimeout(1800);
await p.locator('.fr-convos a').first().click(); await p.waitForTimeout(1200);
const r = await p.evaluate(() => [...document.querySelectorAll('.fr-bubble[aria-label]')].map(b => ({ a: b.getAttribute('aria-label').slice(0, 70), skip: !!b.closest('[data-i18n-skip]'), t: Club.i18n.t(b.getAttribute('aria-label')).slice(0, 50) })));
console.log(JSON.stringify(r, null, 1)); await b.close();
