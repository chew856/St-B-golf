import { webkit } from 'playwright';
const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:8001/site/index.html#/dashboard'); await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const S = Club.store, U = Club.undo, out = {};
  // 1. plain update + delete restore exactly
  const prod = S.all('products')[0]; const before = JSON.stringify(prod); const idx = S.all('products').indexOf(prod);
  const rec1 = U.track(() => { S.update('products', prod.id, { name: 'Changed', newKey: 1 }); });
  out.u1 = U.revert(rec1).ok && JSON.stringify(S.find('products', prod.id)) === before;
  const rec2 = U.track(() => { S.remove('products', prod.id); });
  out.d1 = !S.find('products', prod.id) && U.revert(rec2).ok && JSON.stringify(S.find('products', prod.id)) === before && S.all('products').indexOf(S.find('products', prod.id)) === idx;
  // 2. insert removed
  const rec3 = U.track(() => S.insert('staffNotes', { text: 'x' })); const nid = rec3.result.id;
  out.i1 = U.revert(rec3).ok && !S.find('staffNotes', nid);
  // 3. money: charge to member -> reversal
  const m = S.find('members', 'mem_1010'); const bal0 = m.balance; const nCh = S.all('charges').length, nRc = S.all('receipts').length;
  const rec4 = U.track(() => Club.chargeMember(m.id, { description: 'Test item', category: 'Pro Shop', amount: 42.5, source: 'pos', refId: 'x1', title: 'Test' }));
  const res4 = U.revert(rec4);
  const ch = rec4.result, rv = S.find('charges', ch.id).reversedBy && S.find('charges', S.find('charges', ch.id).reversedBy);
  out.m1 = { ok: res4.ok, credited: res4.credited, balBack: S.find('members', m.id).balance === bal0, charges: S.all('charges').length - nCh, receipts: S.all('receipts').length - nRc, rvAmt: rv && rv.amount, rcKinds: S.all('receipts').slice(-2).map(x => x.kind) };
  // 4. stale: changed after action -> refused
  const rec5 = U.track(() => S.update('products', prod.id, { name: 'Again' }));
  S.update('products', prod.id, { stock: 99 });
  const res5 = U.revert(rec5); out.stale = !res5.ok && /changed/.test(res5.msg);
  S.update('products', prod.id, JSON.parse(before));
  // 5. double undo refused
  out.twice = !U.revert(rec4).ok;
  // 6. receipt seq not rolled back
  return out;
});
ok(r.u1, 'update restored exactly (added keys removed)'); ok(r.d1, 'delete restored with same id and position'); ok(r.i1, 'insert undone');
ok(r.m1.ok && r.m1.credited === 42.5 && r.m1.balBack && r.m1.charges === 2 && r.m1.receipts === 2 && r.m1.rvAmt === -42.5 && r.m1.rcKinds.join() === 'sale,credit', 'money: reversal charge + credit receipt, balance back, nothing deleted', r.m1);
ok(r.stale, 'refuses when something changed since'); ok(r.twice, 'refuses a second undo');
// toast UI
await p.evaluate(() => Club.undo.run(() => Club.store.insert('staffNotes', { text: 'toast' }), { message: 'Note added', undone: 'Note removed' }));
await p.waitForTimeout(400);
const btn = p.locator('.toast.has-act .toast-act').last(); const box = await btn.boundingBox();
await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(400);
ok(await p.evaluate(() => !Club.store.all('staffNotes').some(n => n.text === 'toast') && [...document.querySelectorAll('.toast')].some(t => /Note removed/.test(t.textContent))), 'Undo button on the toast reverts and confirms');
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
