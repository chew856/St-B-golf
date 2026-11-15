import { B, human, launch } from './xa-lib.mjs';
const { b, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/takeout'); await p.waitForTimeout(1800);
const made = await p.evaluate(() => {
  const T = Club.takeout, item = T.menu().find(i => i.section !== 'Breakfast' && !/pizza/i.test(i.name)) || T.menu()[0];
  const lines = [{ menuId: item.id, qty: 2 }];
  let date = Club.date.today(), sl = T.slots(date, lines).find(s => s.ok);
  if (!sl) { date = Club.date.addDays(date, 1); sl = T.slots(date, lines).find(s => s.ok); }
  const a = T.place({ customer: { kind: 'member', memberId: 'mem_1010', name: 'Victoria Sterling', phone: '204-555-0100', email: 'v@example.com' }, lines, date, time: sl.time, source: 'portal', pay: { method: 'account' } });
  return { a: a.ok && a.order.id, date, msg: a.msg, all: Club.store.all('takeoutOrders').map(o => [o.id, o.date, o.status]) };
});
console.log(made);
await p.waitForTimeout(500);
console.log(await p.evaluate(() => [document.querySelector('.tq-days').innerHTML.slice(0, 600), document.querySelectorAll('.tq-card').length, location.hash]));
await p.goto(B + 'index.html#/takeout'); await p.waitForTimeout(1200);
console.log(await p.evaluate(() => [document.querySelector('.tq-days').innerHTML.slice(0, 600), document.querySelectorAll('.tq-card').length]));
console.log(errs); await b.close();
