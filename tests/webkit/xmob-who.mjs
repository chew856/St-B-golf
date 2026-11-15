import { webkit } from 'playwright';
const b = await webkit.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
const p = await c.newPage();
const seen = {};
for (const u of ['index.html#/dashboard', 'index.html#/teesheet', 'index.html#/reports', 'index.html#/members', 'index.html#/proshop', 'index.html#/billing', 'index.html#/settings', 'public.html#/', 'public.html#/shop', 'member.html#/home', 'member.html#/account', 'member.html#/scores']) {
  await p.goto('http://localhost:8001/site/' + u); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button]')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && Math.min(r.width, r.height) < 44 && r.top < innerHeight * 3 && getComputedStyle(e).display !== 'inline'; })
    .map(e => { const r = e.getBoundingClientRect(); const par = e.parentElement; return (par.className || par.tagName).toString().split(' ')[0] + ' > ' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 3).join('.') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18) + '"'; }));
  r.forEach(x => { const k = x.replace(/ \d+x\d+.*/, ''); if (!seen[k]) { seen[k] = 1; console.log(u.split('#')[0].replace('.html', ''), x); } });
}
await b.close();
