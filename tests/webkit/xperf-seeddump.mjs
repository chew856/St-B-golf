// node xperf-seeddump.mjs <baseURL> <outPrefix>: fresh-browser seed dump of each page with a fixed clock and seeded Math.random
import { webkit } from 'playwright'; import fs from 'fs';
const B = process.argv[2], OUT = process.argv[3]; const b = await webkit.launch();
for (const pg of ['index.html', 'member.html', 'public.html']) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.clock.setFixedTime(new Date('2026-11-12T10:15:00'));
  await c.route(u => !u.href.startsWith(B), r => r.abort());
  await c.addInitScript(() => { let s = 12345; Math.random = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + pg, { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const json = await p.evaluate(() => Club.store.exportJSON());
  fs.writeFileSync(OUT + '-' + pg.replace('.html', '') + '.json', json);
  console.log(pg, json.length, 'bytes', errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : '');
  await c.close();
}
await b.close();
