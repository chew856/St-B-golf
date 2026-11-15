import { webkit } from 'playwright';
const B = process.argv[2]; const b = await webkit.launch(); let bad = 0;
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
const routes = ['dashboard','teesheet','lessons','members','billing','proshop','dining','functions','outings','events','communications','course','reports','settings','cart','giftcards','takeout','feedback','accounting'].map(r => 'index.html#/' + r)
  .concat(['member.html#/home','member.html#/tee-times','member.html#/events','member.html#/friends','member.html#/account','member.html#/dining','member.html#/lessons','member.html#/cart','member.html#/club','public.html#/','public.html#/book','public.html#/join','public.html#/cart']);
for (const u of routes) {
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1100);
  const len = await p.evaluate(() => document.body.innerText.trim().length);
  if (errs.length || len < 80) { bad++; console.log('FAIL', u, len, errs.slice(0, 2)); }
  await p.close();
}
console.log(bad ? 'FAILED ' + bad : 'all ' + routes.length + ' routes clean'); await b.close();
