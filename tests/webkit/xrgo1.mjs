import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const errs = [];
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const S = Club.store; const tt = S.all('teeTimes'); const st = {}; tt.forEach(t => st[t.status] = (st[t.status] || 0) + 1);
  const src = {}; tt.forEach(t => src[t.source] = (src[t.source] || 0) + 1);
  const wl = S.all('teeWaitlist'); const ws = {}; wl.forEach(e => ws[e.status + '/' + e.kind] = (ws[e.status + '/' + e.kind] || 0) + 1);
  const wx = S.all('weatherLog');
  return { st, src, ws, wx: wx.length, wet: wx.filter(w => w.precip >= 1).length, wxs: wx.slice(-14).map(w => w.date.slice(5) + ' ' + w.cond + ' ' + w.hi + '/' + w.lo + ' ' + w.precip + ' ' + w.source),
    cards: [...document.querySelectorAll('#rp-sec-golf .rp-card')].map(c => c.dataset.report + ': ' + c.querySelector('h3').textContent + ' | ' + c.querySelector('.panel-body').innerText.slice(0, 300).replace(/\n+/g, ' / ')) };
});
console.log(JSON.stringify(r, null, 1)); console.log('errs', errs);
await p.screenshot({ path: 'xrgo-1440.png', fullPage: true });
await b.close();
