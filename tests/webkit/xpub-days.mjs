import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/public.html#/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => {
  const S = Club.store, out = [];
  for (let i = 0; i < 5; i++) { const d = Club.date.fromToday(i); out.push({ d, booked: S.where('teeTimes', t => t.date === d && t.status !== 'cancelled').length, blocks: S.where('teeBlocks', x => x.date === d).map(x => x.start + '-' + x.end + ' ' + x.reason).join('; ') }); }
  return { today: Club.date.today(), now: new Date().toString(), out, chips: [...document.querySelectorAll('.pub-day, [data-date]')].slice(0, 8).map(e => (e.dataset.date || '') + ' ' + e.textContent.trim().slice(0, 30)), body: document.querySelector('.pub-main, main') ? document.querySelector('.pub-main, main').innerText.slice(0, 600) : '' };
}));
await b.close();
