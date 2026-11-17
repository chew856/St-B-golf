// Per-collection store: migration from the old single-key format, legacy fallback, flush-on-hide, quota all-or-none.
// The store saves each collection in a compact form (js/core/store.js, Nov 2026), so raw keys are read back through
// Club.store.stored(name), which decodes them, never with JSON.parse.
import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/';
const KEY = 'stboniface.data.v2', PREFIX = KEY + ':';
const b = await webkit.launch(); let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const BARE = B + '__storeonly.html';
async function ctx() {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  await c.route(BARE, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script src="js/core/store.js"></script>' }));
  return c;
}
const errsOf = p => { const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) e.push(m.text()); }); return e; };
const flush = p => p.evaluate(() => window.dispatchEvent(new Event('pagehide')));

/* ---- 1. A database in the old single-key format (plain JSON of every name, as the code before Nov 12 saved it),
   built from a real seeded database ---- */
const c = await ctx();
let p = await c.newPage(); let errs = errsOf(p);
await p.goto(B + 'index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
for (const u of ['member.html#/home', 'public.html#/book']) { const q = await c.newPage(); await q.goto(B + u, { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(2000); await q.close(); }
const tt0 = await p.evaluate(() => { const S = Club.store; const t = S.all('teeTimes')[3]; S.update('teeTimes', t.id, { notes: 'MIGRATION-MARK' }); S.setObj('migrationProbe', { a: 1 }); S.insert('notes', { text: 'old-format note' }); window.dispatchEvent(new Event('pagehide')); return t.id; });
const old = { raw: await p.evaluate(([K, P]) => { const db = JSON.parse(Club.store.exportJSON()); for (const k of Object.keys(localStorage)) if (k.startsWith(P)) localStorage.removeItem(k); localStorage.setItem(K, JSON.stringify(db)); return localStorage.getItem(K); }, [KEY, PREFIX]) };
ok(old.raw && old.raw.length > 1e6, 'old-format database: one ' + (old.raw.length / 1e6).toFixed(2) + 'M-char key and no per-collection keys');
ok(!errs.length, 'setup ran clean ' + errs.slice(0, 2));
await p.close();
const oldDb = JSON.parse(old.raw);

/* ---- 2. New code: the split happens in store.js load, before any module runs ---- */
p = await c.newPage(); errs = errsOf(p);
await p.goto(BARE, { waitUntil: 'load' }); await p.waitForTimeout(300);
const after = await p.evaluate(([K, P]) => {
  const per = {}; let hasOld = localStorage.getItem(K) !== null;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P)) per[k.slice(P.length)] = JSON.stringify(Club.store.stored(k.slice(P.length))); }
  let raw = 0; for (let i = 0; i < localStorage.length; i++) raw += localStorage.getItem(localStorage.key(i)).length;
  return { hasOld, per, exp: Club.store.exportJSON(), raw };
}, [KEY, PREFIX]);
ok(!after.hasOld, 'old single key removed');
const names = Object.keys(oldDb);
const missing = names.filter(n => after.per[n] !== JSON.stringify(oldDb[n]));
ok(!missing.length && Object.keys(after.per).length === names.length, 'every one of ' + names.length + ' collections/keys reads back identical from its own key ' + missing.slice(0, 5));
ok(names.every(n => JSON.stringify(JSON.parse(after.exp)[n]) === JSON.stringify(oldDb[n])), 'in-memory db equals the old database');
ok(after.raw < old.raw.length * 0.45, 'stored compactly: ' + old.raw.length + ' -> ' + after.raw + ' characters');
await p.close();

/* ---- 3. The app works on the migrated data ---- */
for (const u of ['index.html#/teesheet', 'index.html#/dashboard', 'index.html#/billing', 'member.html#/teetimes', 'public.html#/book']) {
  const q = await c.newPage(); const e = errsOf(q);
  await q.goto(B + u, { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(1500);
  const txt = await q.evaluate(() => document.body.innerText.length);
  ok(!e.length && txt > 80, 'loads clean after migration: ' + u + ' ' + e.slice(0, 2));
  if (u === 'index.html#/teesheet') {
    const s = await q.evaluate(id => { const S = Club.store; return { note: (S.find('teeTimes', id) || {}).notes, probe: S.getObj('migrationProbe'), note2: S.all('notes').some(n => n.text === 'old-format note') }; }, tt0);
    ok(s.note === 'MIGRATION-MARK' && s.probe && s.probe.a === 1 && s.note2, 'old edits present (update, setObj, insert)');
    await q.evaluate(id => Club.store.update('teeTimes', id, { notes: 'NEW-FORMAT-EDIT' }), tt0); await flush(q);
    const one = await q.evaluate(id => Club.store.stored('teeTimes').find(t => t.id === id).notes, tt0);
    ok(one === 'NEW-FORMAT-EDIT', 'new write lands in the teeTimes key');
  }
  await q.close();
}
p = await c.newPage(); await p.goto(BARE);
ok(await p.evaluate(id => Club.store.find('teeTimes', id).notes, tt0) === 'NEW-FORMAT-EDIT', 'edit survives reload');

/* ---- 4. A tab still on the old code saves the whole blob after the split: laid on top, nothing dropped ---- */
const late = await p.evaluate(([K, id]) => {
  const S = Club.store, tt = S.all('teeTimes'), n = tt.length;
  const blob = { teeTimes: [Object.assign({}, S.find('teeTimes', id), { notes: 'FROM-OLD-TAB' }), { id: 'tee_fromold', date: '2099-01-01', time: '07:00', players: [] }], $receiptSeq: 1, $seeded: { zzz: true } };
  localStorage.setItem(K, JSON.stringify(blob));
  return { n, seq: S.getObj('receiptSeq') };
}, [KEY, tt0]);
await p.reload(); await p.waitForTimeout(200);
const lr = await p.evaluate(([K, id]) => { const S = Club.store; return { hasOld: localStorage.getItem(K) !== null, n: S.all('teeTimes').length, note: S.find('teeTimes', id).notes, added: !!S.find('teeTimes', 'tee_fromold'), seq: S.getObj('receiptSeq'), seeded: S.getObj('seeded') }; }, [KEY, tt0]);
ok(!lr.hasOld && lr.n === late.n + 1 && lr.note === 'FROM-OLD-TAB' && lr.added, 'late old-format blob merged by document (' + late.n + ' -> ' + lr.n + ')');
ok(lr.seq === late.seq || (late.seq == null && lr.seq === 1), 'sequence did not go backwards (' + late.seq + ' -> ' + lr.seq + ')');
ok(lr.seeded.zzz && lr.seeded.teeTimes && lr.seeded.members, '$seeded is a union');
await p.evaluate(() => { Club.store.remove('teeTimes', 'tee_fromold'); window.dispatchEvent(new Event('pagehide')); });

/* ---- 5. Live: another tab (still on the old code) saves the whole database under the old key while this one is open ---- */
const po = await c.newPage(); await po.goto(B + 'robots.txt');
await po.evaluate(K => localStorage.setItem(K, JSON.stringify({ notes: [{ id: 'note_oldtab', text: 'from old tab' }] })), KEY);
await p.waitForTimeout(400);
const live = await p.evaluate(K => ({ hasOld: localStorage.getItem(K) !== null, note: !!Club.store.find('notes', 'note_oldtab'), storedNote: !!(Club.store.stored('notes') || []).find(n => n.id === 'note_oldtab'), tt: Club.store.all('teeTimes').length, members: Club.store.all('members').length }), KEY);
ok(live.note && live.storedNote && !live.hasOld && live.tt === late.n && live.members > 50, 'new tab absorbed a live old-tab save without losing anything ' + JSON.stringify(live));
await po.close();

/* ---- 6. Split fails (storage full): old key restored untouched, tab keeps the old format ---- */
const c2 = await ctx();
const p2 = await c2.newPage();
await c2.route(B + '__blank.html', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><p>blank' }));
await p2.goto(B + '__blank.html'); await p2.evaluate(([K, raw]) => { for (const k of Object.keys(localStorage)) localStorage.removeItem(k); localStorage.setItem(K, raw); }, [KEY, old.raw]);
await p2.addInitScript(P => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith(P) && !window.__allow) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); }; }, PREFIX);
await p2.goto(BARE); await p2.waitForTimeout(200);
const f = await p2.evaluate(([K, P]) => ({ same: localStorage.getItem(K), per: Object.keys(localStorage).filter(k => k.startsWith(P)).length, n: Club.store.all('teeTimes').length }), [KEY, PREFIX]);
console.log(f.same === old.raw, f.per, f.n); ok(f.same === old.raw && f.per === 0 && f.n === oldDb.teeTimes.length, 'failed split: old key byte-identical, no partial keys, data in memory');
await p2.evaluate(id => { Club.store.update('teeTimes', id, { notes: 'LEGACY-SAVE' }); window.dispatchEvent(new Event('pagehide')); }, tt0);
ok(await p2.evaluate(([K, id]) => JSON.parse(localStorage.getItem(K)).teeTimes.find(t => t.id === id).notes, [KEY, tt0]) === 'LEGACY-SAVE', 'legacy mode keeps saving the whole database under the old key');
await p2.evaluate(() => { window.__allow = true; });
await p2.addInitScript(() => { window.__allow = true; });
await p2.reload(); await p2.waitForTimeout(200);
const g = await p2.evaluate(([K, P, id]) => ({ old: localStorage.getItem(K) !== null, per: Object.keys(localStorage).filter(k => k.startsWith(P)).length, note: Club.store.find('teeTimes', id).notes }), [KEY, PREFIX, tt0]);
ok(!g.old && g.per === names.length && g.note === 'LEGACY-SAVE', 'next load with room: split completes ' + JSON.stringify(g));

/* ---- 7. A save fails for one collection: none of that save is written (all or none), the warning shows, and
   everything is retried on the next save ---- */
const p3 = await c2.newPage(); const e3 = errsOf(p3);
await p3.goto(B + 'index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p3.waitForTimeout(1500);
const q7 = await p3.evaluate(([P, id]) => {
  const S = Club.store, set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === P + 'teeTimes') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return set.call(this, k, v); };
  S.update('teeTimes', id, { notes: 'QUOTA-1' }); S.setObj('probe7', 1); window.dispatchEvent(new Event('pagehide'));
  const r = { tt: S.stored('teeTimes').find(t => t.id === id).notes, probe: S.stored('$probe7'), toast: document.body.innerText.includes('could not be saved') };
  Storage.prototype.setItem = set;
  S.setObj('probe7', 2); window.dispatchEvent(new Event('pagehide'));
  r.tt2 = S.stored('teeTimes').find(t => t.id === id).notes; r.probe2 = S.stored('$probe7');
  return r;
}, [PREFIX, tt0]);
ok(q7.tt !== 'QUOTA-1' && q7.probe === undefined && q7.toast && q7.tt2 === 'QUOTA-1' && q7.probe2 === 2, 'quota error: none of the save written, warning shown, all retried on next save ' + JSON.stringify(q7));

/* ---- 8. Flush when the page is hidden (phone backgrounds the tab), before the 60 ms timer ---- */
const h = await p3.evaluate(([P, id]) => {
  Club.store.update('teeTimes', id, { notes: 'HIDDEN-FLUSH' });
  const before = Club.store.stored('teeTimes').find(t => t.id === id).notes;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.visibilityState;
  return { before, after: Club.store.stored('teeTimes').find(t => t.id === id).notes };
}, [PREFIX, tt0]);
ok(h.before !== 'HIDDEN-FLUSH' && h.after === 'HIDDEN-FLUSH', 'visibilitychange hidden writes batched changes at once');
ok(!e3.length, 'no page errors ' + e3.slice(0, 2));

console.log(bad ? 'FAILED ' + bad : 'migration suite passed'); await b.close(); process.exit(bad ? 1 : 0);
