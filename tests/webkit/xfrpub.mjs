import { webkit } from 'playwright';
const b = await webkit.launch(); const errs = []; const miss = new Map();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); await c.addInitScript(() => { try { localStorage.setItem('stboniface.lang', 'fr'); } catch (e) {} });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  for (const r of ['book', 'join', 'takeout', 'shop', 'gifts', 'waitlist', 'feedback', 'me', 'cart']) {
    await p.goto('http://localhost:8001/site/public.html#/' + r); await p.waitForTimeout(1300);
    if (r === 'book') { const s = p.locator('[data-time]:not([disabled])').first(); if (await s.count()) { await s.click(); await p.waitForTimeout(900); } }
    (await p.evaluate(() => { const S = Club.store; const data = new Set(); ['menuItems', 'products', 'membershipTiers', 'takeoutItems'].forEach(k => S.all(k).forEach(d => ['name', 'description', 'desc', 'category', 'brand', 'notes'].forEach(f => { if (d[f]) data.add(String(d[f]).trim()); })));
  const m = Club.i18n.missing().map(x => x.text).filter(t => !data.has(t.trim()) && ![...data].some(d => d.length > 12 && t.includes(d))); Club.i18n.clearMissing(); return m; })).forEach(t => miss.set(t, W + ' ' + r));
  }
  await c.close();
}
const left = [...miss.entries()].filter(([t]) => /[a-z]{3,} [a-z]{3,}/i.test(t) && !/St\. Boniface|Gallery|Taphouse|example\.com|Youville/.test(t));
console.log('missing English strings:', left.length); left.slice(0, 25).forEach(([t, w]) => console.log(' -', JSON.stringify(t), '@', w)); console.log('errors', errs);
await b.close();
