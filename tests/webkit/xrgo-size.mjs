import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext(); await c.route(/open-meteo/, r => r.abort()); const p = await c.newPage();
await p.goto('http://localhost:8001/site/index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => { const S = Club.store, L = x => JSON.stringify(x).length; const tt = S.all('teeTimes');
  return { total: localStorage.getItem(S.KEY).length, weatherLog: L(S.all('weatherLog')), teeWaitlist: L(S.all('teeWaitlist')),
    source: tt.filter(t => t.source && !/demo_g/.test(t.id)).length * 18, 
    cancelledAt: tt.filter(t => t.cancelledAt).length * 41, refills: L(tt.filter(t => /_w$/.test(t.id))) }; }));
await b.close();
