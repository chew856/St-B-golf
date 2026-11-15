import { webkit } from 'playwright';
const B = 'https://stboniface-golf.vercel.app/';
const b = await webkit.launch(); const errs = [];
for (const [page, path] of [['public', 'public.html#/'], ['member', 'member.html#/home']]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + path.split('#')[0], { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('stboniface.lang', 'fr'); localStorage.setItem('stboniface.portal.session', 'mem_1003'); });
  await p.goto(B + path); await p.reload(); await p.waitForTimeout(2000);
  console.log(page, JSON.stringify(await p.evaluate(() => ({ lang: document.documentElement.lang, nav: [...document.querySelectorAll('.pub-nav > a, .p-nav > a')].slice(0, 4).map(a => a.textContent), sw: [...document.querySelectorAll('.i18n-opt')].map(x => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')).slice(0, 2), h1: document.querySelector('h1')?.textContent }))));
  await c.close();
}
console.log(errs.length ? errs : 'no page errors'); await b.close();
