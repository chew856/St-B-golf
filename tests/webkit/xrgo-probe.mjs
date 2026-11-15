import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => JSON.stringify(Club.store.all('teeTimes').filter(t => t.source === 'public').slice(0, 4).map(t => [t.id, t.date, t.time, t.status, t.players.map(x => x.type).join('/')]))));
await b.close();
