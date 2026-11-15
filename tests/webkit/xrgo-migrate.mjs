import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const res = []; let fails = 0;
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
const b = await webkit.launch();
const KEY = 'stboniface.data.v2';

// 1. A fresh store, then strip the golf demo extension to look like a store seeded before it existed.
const c0 = await b.newContext(); await c0.route(/open-meteo/, r => r.abort()); const p0 = await c0.newPage();
await p0.goto(B + 'index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p0.waitForTimeout(2500);
const fresh = await p0.evaluate(() => ({ flag: Club.store.getObj('golfDemoVersion'), cancelled: Club.store.all('teeTimes').filter(t => t.status === 'cancelled').length, refills: Club.store.all('teeTimes').filter(t => /_w$/.test(t.id)).length }));
ok(fresh.flag === 1 && fresh.cancelled > 20 && fresh.refills > 5, 'fresh seed: demo history present and the flag set (no second pass)', fresh);
const old = await p0.evaluate((KEY) => {
  const db = JSON.parse(localStorage.getItem(KEY)); const T = Club.date.today();
  const seeded = id => /^tt_\d{8}_\d{4}$/.test(id);
  db.teeTimes = db.teeTimes.filter(t => !/_w$/.test(t.id)).map(t => {
    if (!seeded(t.id)) return t;
    const x = Object.assign({}, t); delete x.source; delete x.bookedBy;
    if (x.cancelledAt) { delete x.cancelledAt; if (x.date < T) { x.status = 'completed'; x.startedAt = x.time; const m = +x.time.slice(0, 2) * 60 + +x.time.slice(3) + 255; x.finishedAt = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); x.players.forEach(p => p.paid = true); } else x.status = 'booked'; }
    return x;
  });
  delete db.teeWaitlist; delete db.$golfDemoVersion;
  // A booking the user made while testing: past, completed, from the portal.
  const d = Club.date.addDays(T, -3);
  db.teeTimes.push({ id: 'tt_user_portal1', date: d, time: '13:21', holes: 18, players: [{ memberId: 'mem_1003', name: 'Dave Nerada', type: 'member', cart: true, paid: true }], status: 'completed', notes: 'mine', eventId: null, startedAt: '13:21', finishedAt: '17:40', bookedBy: 'mem_1003', source: 'portal', createdAt: new Date().toISOString() });
  return JSON.stringify(db);
}, KEY);
await c0.close();

async function migrated(label) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.route(/open-meteo/, r => r.abort()); const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|Failed to load|network/i.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'robots.txt'); await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, old]);
  const before = JSON.parse(old); const T = await p.evaluate(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const keep = before.teeTimes.filter(t => t.date >= T || t.id === 'tt_user_portal1');
  await p.goto(B + 'index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  const s = await p.evaluate(() => { const S = Club.store, tt = S.all('teeTimes'), wl = S.all('teeWaitlist');
    return { flag: S.getObj('golfDemoVersion'), tt: JSON.stringify(tt), wl: JSON.stringify(wl), cancelled: tt.filter(t => t.status === 'cancelled').length, refills: tt.filter(t => /_w$/.test(t.id)).length,
      wlBooked: wl.filter(e => e.status === 'booked').length, wlFuture: wl.filter(e => e.date >= Club.date.today()).length, wlN: wl.length,
      empties: [...document.querySelectorAll('#rp-sec-golf .rp-card .empty h4')].map(e => e.textContent),
      kpis: [...document.querySelectorAll('[data-report^="rgo-"] .rgo-kpis')].map(k => k.innerText.replace(/\n+/g, ' | ')) }; });
  const after = JSON.parse(s.tt); const byId = {}; after.forEach(t => byId[t.id] = t);
  const changedKeep = keep.filter(t => JSON.stringify(byId[t.id]) !== JSON.stringify(t)).map(t => t.id);
  ok(s.flag === 1, `${label}: flag set to version 1`, s.flag);
  ok(s.cancelled > 10 && s.refills > 3, `${label}: cancellations (${s.cancelled}) and waitlist refills (${s.refills}) filled in`, s);
  ok(s.wlN > 20 && s.wlBooked === s.refills && s.wlFuture === 0, `${label}: waitlist has ${s.wlN} entries, ${s.wlBooked} booked refills, none today or later`, s);
  ok(changedKeep.length === 0, `${label}: today, the future and the user's portal booking are untouched (${keep.length} checked)`, changedKeep.slice(0, 5));
  ok(after.filter(t => t.date >= T && !/_w$/.test(t.id)).length === before.teeTimes.filter(t => t.date >= T).length && after.every(t => !/_w$/.test(t.id) || t.date < T), `${label}: nothing added for today or later`);
  ok(s.empties.length === 0, `${label}: every Golf card has data`, s.empties);
  ok(errs.length === 0, `${label}: no console errors`, errs);
  console.log('   ' + label + ' KPIs: ' + s.kpis.join('  //  '));
  // Reload: no second pass
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
  const again = await p.evaluate(() => ({ tt: JSON.stringify(Club.store.all('teeTimes')), wl: Club.store.all('teeWaitlist').length }));
  ok(again.tt === s.tt && again.wl === s.wlN, `${label}: a reload changes nothing (runs once)`);
  await c.close();
  return s;
}
const a = await migrated('existing store, run 1');
const a2 = await migrated('existing store, run 2');
ok(a.tt === a2.tt && a.wl === a2.wl, 'deterministic: the same store migrates to the same records');
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length);
await b.close();
