import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/'; const b = await webkit.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
if (process.env.ORIG) await c.route('**/js/core/store.js', r => r.fulfill({ path: '../store.orig.js', contentType: 'application/javascript' }));
const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(B + 'index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
const med = a => { a = a.slice().sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(2); };
const loads = [];
for (let i = 0; i < 5; i++) {
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800);
  loads.push(await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; }));
}
const r = await p.evaluate(() => {
  const S = Club.store; let bytes = 0, keys = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('stboniface.data') === 0) { bytes += localStorage.getItem(k).length; keys++; } }
  const tt = S.all('teeTimes'); const flush = () => window.dispatchEvent(new Event('pagehide'));
  flush();
  const one = [];
  for (let i = 0; i < 30; i++) { const t0 = performance.now(); S.update('teeTimes', tt[i].id, { notes: 'bench ' + i }); flush(); one.push(performance.now() - t0); }
  let fs = 0; for (let i = 0; i < 40; i++) { S.update('teeTimes', tt[i].id, { notes: 'f ' + i }); const a = performance.now(); flush(); fs += performance.now() - a; }
  const t0 = performance.now(); for (let i = 0; i < 50; i++) S.update('teeTimes', tt[i].id, { notes: 'bench50 ' + i }); flush(); const fifty = performance.now() - t0;
  /* the parse cost of loading */
  const pt = []; for (let i = 0; i < 5; i++) { const a = performance.now(); if (localStorage.getItem(S.KEY)) JSON.parse(localStorage.getItem(S.KEY)); else for (let j = 0; j < localStorage.length; j++) { const k = localStorage.key(j); if (k.indexOf(S.KEY + ':') === 0) JSON.parse(localStorage.getItem(k)); } pt.push(performance.now() - a); }
  let rs = 0; const rc = S.all('receipts'); for (let i = 0; i < 20; i++) { S.update('receipts', rc[i].id, { note2: 'r' + i }); const a = performance.now(); flush(); rs += performance.now() - a; }
  return { rs: rs / 20, fs: fs / 40, bytes, keys, collections: S.keys().length, teeTimes: tt.length, one, fifty, pt };
});
console.log(JSON.stringify({ dbChars: r.bytes, storageKeys: r.keys, collections: r.collections, teeTimes: r.teeTimes,
  singleUpdateFlushMedianMs: med(r.one), singleUpdateFlushMaxMs: +Math.max(...r.one).toFixed(2), flushOnlyAvgMs: +r.fs.toFixed(2), receiptsFlushAvgMs: +r.rs.toFixed(2), fiftyUpdatesPlusFlushMs: +r.fifty.toFixed(2),
  parseAllMedianMs: med(r.pt), dclMedianMs: med(loads.map(l => l.dcl)), loadMedianMs: med(loads.map(l => l.load)), errs }));
/* cross-tab: time spent in the other tab's storage handling (sync part) per write */
const q = await c.newPage();
await q.addInitScript(() => { window.__h = []; let t = 0; window.addEventListener('storage', () => { if (!t) { t = performance.now(); setTimeout(() => { window.__h.push(window.__end - t); t = 0; }, 200); } }, true); });
await q.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(1500);
await q.evaluate(() => { window.addEventListener('storage', () => { window.__end = performance.now(); }); });
for (let i = 0; i < 8; i++) { await p.evaluate(i => { const S = Club.store; S.update('teeTimes', S.all('teeTimes')[i].id, { notes: 'x' + i + Math.random() }); window.dispatchEvent(new Event('pagehide')); }, i); await q.waitForTimeout(300); }
const h = await q.evaluate(() => window.__h);
console.log('otherTabStorageHandlerMs(sync, median of 8):', med(h), h.map(x => +x.toFixed(1)).join(','));
await b.close();
