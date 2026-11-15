import { webkit } from 'playwright';
import fs from 'fs';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/dining'); await p.waitForTimeout(2000);
const d = await p.evaluate(() => {
  const S = Club.store, t = Club.date.today();
  const mem = id => { const m = id && Club.members.get(id); return m ? { no: m.memberNo, name: m.firstName + ' ' + m.lastName } : null; };
  const res = S.all('diningReservations').filter(r => r.date >= Club.date.addDays(t, -1) && r.date <= Club.date.addDays(t, 14)).map(r => Object.assign({}, r, { member: mem(r.memberId) }));
  const perDay = {}; S.all('diningReservations').forEach(r => { if (r.status !== 'cancelled' && r.status !== 'no-show') perDay[r.date] = (perDay[r.date] || 0) + (+r.partySize || 0); });
  return {
    today: t, now: new Date().toString(),
    tables: Club.shared.dining.TABLES,
    reservations: res,
    coversPerDay: perDay,
    orders: S.all('diningOrders').filter(o => o.status !== 'closed' || o.date === t),
    functions: S.all('functions'),
    packages: S.all('functionPackages'),
    staff: S.all('staff').filter(s => s.id === 'stf_1').map(s => ({ id: s.id, first: s.firstName, last: s.lastName, role: s.role })),
    banquetRes: S.all('diningReservations').filter(r => r.venue === 'Banquet Hall' && r.date >= Club.date.addDays(t, -20) && r.date <= Club.date.addDays(t, 120)),
    info: { name: Club.info.name, phone: Club.info.phone, address: Club.info.address, web: Club.info.eventsWebsite },
    taxRate: Club.taxRate()
  };
});
fs.writeFileSync('./out/mock-dining-events/demo-dump.json', JSON.stringify(d, null, 1));
console.log(d.now, d.reservations.length, d.functions.length, d.orders.length, d.banquetRes.length);
await b.close();
