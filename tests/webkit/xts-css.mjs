import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
await p.evaluate(() => { location.hash = '#/teesheet/' + Club.date.fromToday(-1); }); await p.waitForTimeout(900);
await p.locator('.ts-stats .stat[data-drill="rounds"]').click(); await p.waitForTimeout(800);
console.log(await p.evaluate(() => { const t = document.querySelector('.ts-dd-table'), td = t.querySelector('tbody td:nth-child(2)'); const cs = getComputedStyle(td), ct = getComputedStyle(t);
  return { tw: t.offsetWidth, wrapW: t.parentNode.clientWidth, minW: ct.minWidth, tdws: cs.whiteSpace, tdW: td.offsetWidth, sheets: [...document.styleSheets].filter(s => (s.href||'').includes('teesheet')).map(s => s.href) }; }));
await b.close();
