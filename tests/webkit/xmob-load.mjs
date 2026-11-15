import { webkit } from 'playwright';
const b = await webkit.launch();
for (const u of ['index.html#/dashboard', 'member.html#/home', 'public.html#/']) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const p = await c.newPage(); const runs = [];
  for (let i = 0; i < 3; i++) {
    await p.goto((process.env.BASE || 'http://localhost:8001/site/') + u, { waitUntil: 'load' }); await p.waitForTimeout(800);
    runs.push(await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), ls: Math.round(JSON.stringify(localStorage).length / 1024) }; }));
  }
  console.log(u, JSON.stringify(runs));
  await c.close();
}
await b.close();
