import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
const p = await c.newPage(); await p.goto('http://localhost:8001/site/member.html#/tee-times'); await p.waitForTimeout(2000);
console.log(await p.evaluate(() => [...document.querySelectorAll('.tt-chip:not([disabled]):not(.st-mine):not(.is-wl)')].slice(0, 5).map(e => e.className + ' | ' + e.textContent.trim().slice(0, 40) + ' | ' + JSON.stringify(e.dataset))));
await b.close();
