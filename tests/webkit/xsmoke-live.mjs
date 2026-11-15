import { webkit } from 'playwright';
const B = 'https://stboniface-golf.vercel.app/'; const errs = [];
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo/.test(m.text())) errs.push(m.text()); }); p.on('response', r => { if (r.status() >= 400 && /stboniface-golf/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
for (const u of ['index.html#/dashboard', 'member.html#/home', 'public.html#/', 'public.html#/account']) { await p.goto(B + u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200); }
console.log(errs.length ? errs.join('\n') : 'all three sites load clean'); await b.close();
