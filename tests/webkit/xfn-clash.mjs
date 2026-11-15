import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/functions/fn_5'); await p.waitForTimeout(2200);
console.log(await p.evaluate(() => {
  const side = document.querySelector('.fw-ws-side');
  const f = Club.store.find('functions', 'fn_5');
  const d = f && f.date;
  const dining = Club.store.all('diningReservations').filter(r => r.date === d && /banquet|hall/i.test((r.venue || '') + ' ' + (r.room || '') + ' ' + (r.tableId || ''))).map(r => ({ t: r.time, v: r.venue, room: r.room, table: r.tableId, st: r.status, party: r.partySize || r.party, name: r.name }));
  const others = Club.store.all('functions').filter(x => x.id !== 'fn_5' && x.date === d).map(x => ({ id: x.id, st: x.stage, room: x.room }));
  return { date: d, room: f && f.room, sideText: side ? side.innerText.slice(0, 400) : null, dining, others };
}));
await b.close();
