import { webkit } from 'playwright';
const b = await webkit.launch();
for (const w of [1470, 1100]) {
const c = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await c.newPage();
await p.goto('https://stboniface-golf.vercel.app/member.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.setItem('stboniface.portal.session', 'mem_1003')); await p.goto('https://stboniface-golf.vercel.app/member.html#/home'); await p.waitForTimeout(2000);
console.log(w, JSON.stringify(await p.evaluate(() => { const c = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round((r.top + r.bottom) / 2)]; };
  const range = document.createRange(); const a = document.querySelector('.p-nav > a'); range.selectNodeContents(a); const tr = range.getBoundingClientRect();
  return { header: c('.p-header-inner'), brandName: c('.p-brand-name'), brand: c('.p-brand'), navLink: c('.p-nav > a'), navText: [Math.round(tr.top), Math.round(tr.bottom), Math.round((tr.top + tr.bottom) / 2)], more: c('.p-navmore-btn'), lang: c('.p-lang, .i18n-switch'), me: c('.p-me-btn'), avatar: c('.p-me-btn .avatar') }; })));
await c.close(); }
await b.close();
