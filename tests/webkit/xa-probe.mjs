import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/takeout'); await p.waitForTimeout(2000);
console.log(await p.evaluate(() => ({
  to: Club.store.all('takeoutOrders').map(o => [o.no, o.status, o.date, o.payment && o.payment.method]),
  so: Club.store.all('shopOrders').map(o => [o.no, o.status, o.pay.method, o.customer.memberId]),
  pp: Club.store.all('publicPlayers').slice(0, 3).map(x => [x.id, x.firstName, x.lastName]),
  m: ['mem_1003', 'mem_1010'].map(id => { const m = Club.store.find('members', id); return [m.firstName, m.lastName, m.status, m.balance]; }),
  cart: Object.keys(Club.cart || {}), res: Club.store.all('diningReservations').filter(r => r.date === Club.date.today()).map(r => [r.id, r.status, r.table, r.name]).slice(0, 12),
  dord: Club.store.all('diningOrders').filter(o => o.status !== 'closed').map(o => [o.id, o.status, o.memberId, o.items.length]),
  gc: Club.store.all('giftCards').map(g => [g.id, g.status, g.balance]).slice(0, 4),
  cartOrders: Club.store.all('cartOrders').filter(o => o.date === Club.date.today()).map(o => [o.id, o.status, o.payment, o.kind, o.memberId]),
  fleet: Club.store.getObj('cartFleet', null) && Club.store.getObj('cartFleet').carts.map(c => [c.id, c.name, c.line.length]),
})));
await b.close();
