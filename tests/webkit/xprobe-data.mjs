import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const t0 = Date.now();
await p.goto('http://localhost:8001/site/index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
console.log('load ms', Date.now() - t0);
console.log(await p.evaluate(() => {
  const S = Club.store, d = Club.date.fromToday(1);
  const mem = S.all('members'), act = mem.filter(m => m.status === 'active' && m.tierId !== 'tier_social');
  const tt = S.all('teeTimes').filter(t => t.date === d && t.status !== 'cancelled');
  const booked = new Set(); tt.forEach(t => (t.players || []).forEach(x => x.memberId && booked.add(x.memberId)));
  return { members: mem.length, active: act.length, ttTomorrow: tt.length, membersBookedTomorrow: booked.size, freeActive: act.filter(m => !booked.has(m.id)).length, noPlayers: S.all('teeTimes').filter(t => !Array.isArray(t.players)).length, keys: S.keys().length, lsKeys: Object.keys(localStorage).length };
}));
console.log('errors', errs.slice(0, 5));
await b.close();
