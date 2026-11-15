import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const lang = process.argv[2] || 'en'; const routes = (process.argv[3] || 'outings,outings/enquire').split(',');
const b = await webkit.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  await c.addInitScript((l) => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', l); } catch (e) {} }, lang);
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'member.html#/home', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
  for (const r of routes) {
    await p.evaluate(r => { location.hash = '#/' + r; }, r); await p.waitForTimeout(1000);
    const info = await p.evaluate(() => ({ ov: document.scrollingElement.scrollWidth > innerWidth + 1, h: document.scrollingElement.scrollHeight, miss: Club.i18n.missing().slice(0, 40) }));
    console.log(w, r, JSON.stringify(info));
    await p.screenshot({ path: 'po/peek-' + lang + '-' + r.replace(/\//g, '_') + '-' + w + '.png', fullPage: true });
  }
  console.log(w, 'errors', errs);
  await c.close();
}
await b.close();
