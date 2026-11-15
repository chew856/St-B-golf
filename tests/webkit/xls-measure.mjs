import { suite, open } from './xb-lib.mjs';
const T = suite();
const { b, p } = await open(1900, 'lessons', T); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(() => {
  const s = document.createElement('span'); s.style.cssText = 'position:absolute;font-size:12px;white-space:nowrap'; document.querySelector('.ls-block').appendChild(s);
  const names = [...new Set(Club.store.all('lessons').map(l => (Club.members.get(l.memberId) || {}).lastName).filter(Boolean))];
  const out = {}; for (const w of [500, 600]) { s.style.fontWeight = w; const ws = names.map(n => { s.textContent = n; return s.offsetWidth; }).sort((a, b) => a - b); out[w] = { n: ws.length, p50: ws[ws.length >> 1], p80: ws[Math.floor(ws.length * 0.8)], p95: ws[Math.floor(ws.length * 0.95)], max: ws[ws.length - 1] }; }
  const day = document.querySelector('.ls-sched'); out.avail = day.clientWidth; return out;
})));
await b.close();
