import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/'; const b = await webkit.launch(); let bad = 0;
for (const W of [1440, 390]) { const c = await b.newContext({ viewport: { width: W, height: 900 } }); await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  for (const u of ['index.html#/dashboard', 'index.html#/teesheet', 'index.html#/proshop', 'index.html#/dining', 'index.html#/billing', 'index.html#/reports', 'index.html#/settings', 'index.html#/accounting', 'member.html#/home', 'member.html#/teetimes', 'member.html#/shop', 'public.html#/book', 'public.html#/shop', 'public.html#/join']) {
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.goto(B + u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1300);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); const empty = await p.evaluate(() => document.body.innerText.trim().length < 80);
    if (errs.length || ov || empty) { bad++; console.log('FAIL', W, u, errs.slice(0, 2), ov ? 'h-scroll' : '', empty ? 'empty' : ''); }
    await p.close(); }
  await c.close(); }
console.log(bad ? 'FAILED ' + bad : 'all three sites load clean'); await b.close();
