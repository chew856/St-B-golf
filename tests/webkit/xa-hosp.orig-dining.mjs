import { B, T, human, undo, toastText, hasUndo, clearToasts, launch, noHScroll, money } from './xa-lib.mjs';
const { ok, res, fails } = T();
const { b, c, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/takeout'); await p.waitForTimeout(1800);
/* two takeout orders: one on the member account, one by card */
const made = await p.evaluate(() => {
  const T = Club.takeout, item = T.menu().find(i => i.section !== 'Breakfast' && !/pizza/i.test(i.name)) || T.menu()[0];
  const lines = [{ menuId: item.id, qty: 2 }];
  let date = Club.date.today(), sl = T.slots(date, lines).find(s => s.ok);
  if (!sl) { date = Club.date.addDays(date, 1); sl = T.slots(date, lines).find(s => s.ok); }
  const a = T.place({ customer: { kind: 'member', memberId: 'mem_1010', name: 'Victoria Sterling', phone: '204-555-0100', email: 'v@example.com' }, lines, date, time: sl.time, source: 'portal', pay: { method: 'account' } });
  const c = T.place({ customer: { kind: 'guest', name: 'Pat Guest', phone: '204-555-0111', email: 'pat@example.com' }, lines, date, time: sl.time, source: 'public', pay: { method: 'card', card: { brand: 'visa', last4: '4242' } } });
  return { a: a.ok && a.order.id, c: c.ok && c.order.id, date, msg: a.msg || c.msg };
});
ok(made.a && made.c, 'two takeout orders placed for the test', made);
await p.waitForTimeout(800); await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(600); await p.goto(B + 'index.html#/takeout'); await p.waitForTimeout(1200);
if (await p.locator('[data-day="' + made.date + '"]').count()) await human(p, '[data-day="' + made.date + '"]');
const to = (id) => p.evaluate(id => JSON.parse(JSON.stringify(Club.store.find('takeoutOrders', id))), id);
const a0 = await to(made.a);
await human(p, '.tq-card[data-order="' + made.a + '"] [data-tq=ready]');
ok((await to(made.a)).status === 'ready' && await hasUndo(p), 'takeout Mark ready with Undo');
await undo(p);
ok(JSON.stringify(await to(made.a)) === JSON.stringify(a0), 'Undo Mark ready restores the order exactly');
await clearToasts(p);
await human(p, '.tq-card[data-order="' + made.a + '"] [data-tq=ready]'); await clearToasts(p);
await human(p, '[data-status=ready]'); await human(p, '.tq-card[data-order="' + made.a + '"] [data-tq="picked-up"]'); await clearToasts(p);
await human(p, '[data-status="picked-up"]');
const ap = await to(made.a);
ok(ap.status === 'picked-up' && await p.locator('.tq-card[data-order="' + made.a + '"] [data-tq=ready]').count() === 1, 'Picked up card offers Back to ready');
await human(p, '.tq-card[data-order="' + made.a + '"] [data-tq=ready]');
const ab = await to(made.a);
ok(ab.status === 'ready' && !ab.pickedUpAt && ab.readyAt === ap.readyAt && ab.history.slice(-1)[0].back, 'Back to ready keeps the ready time and clears pickup', ab);
await undo(p);
ok(JSON.stringify(await to(made.a)) === JSON.stringify(ap), 'Undo Back to ready restores picked up exactly');
await clearToasts(p);
// drawer
await human(p, '.tq-card[data-order="' + made.a + '"] .tq-items');
ok(await p.locator('.drawer.od-drawer').count() === 1, 'takeout card opens the drawer');
const dt = await p.evaluate(() => document.querySelector('.drawer.od-drawer').textContent);
ok(/Victoria Sterling/.test(dt) && /Member/.test(dt) && /204-555-0100/.test(dt) && /Subtotal/.test(dt) && /Paid with/.test(dt) && /Order placed in the members’ portal/.test(dt) && /Picked up, handed over by/.test(dt) && /Receipt/.test(dt), 'takeout drawer: customer, contact, items, totals, payment, timeline, receipt');
ok(await p.evaluate(() => !!document.querySelector('.drawer.od-drawer a[href="#/members/mem_1010"]')), 'takeout drawer links the member');
await human(p, '.drawer.od-drawer [data-tq=ready]');
ok((await to(made.a)).status === 'ready' && /Moved back to ready/.test(await p.evaluate(() => document.querySelector('.drawer.od-drawer').textContent)), 'Back to ready from the drawer, timeline updated');
await p.screenshot({ path: 'xa-takeout-drawer-1440.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await clearToasts(p);
// keyboard
await human(p, '[data-status=ready]');
await p.evaluate(id => document.querySelector('.tq-card[data-order="' + id + '"]').focus(), made.a); await p.keyboard.press(' '); await p.waitForTimeout(400);
ok(await p.locator('.drawer.od-drawer').count() === 1, 'Space on a focused takeout card opens the drawer');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
// phone link inside card does not open the drawer
ok(await p.evaluate(id => { const a = document.querySelector('.tq-card[data-order="' + id + '"] .tq-phone'); a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); return !document.querySelector('.drawer.od-drawer'); }, made.a), 'phone link in the card does not open the drawer');
// cancel account order then Undo
const bal0 = await p.evaluate(() => Club.store.find('members', 'mem_1010').balance), m0 = await money(p);
await human(p, '.tq-card[data-order="' + made.a + '"] [data-tq=cancel]'); await human(p, '.modal-foot .btn-danger');
const bal1 = await p.evaluate(() => Club.store.find('members', 'mem_1010').balance);
ok((await to(made.a)).status === 'cancelled' && bal1 < bal0 && await hasUndo(p), 'account takeout cancel credits and offers Undo', { bal0, bal1 });
await undo(p);
const bal2 = await p.evaluate(() => Club.store.find('members', 'mem_1010').balance), m1 = await money(p);
ok((await to(made.a)).status === 'ready' && Math.abs(bal2 - bal0) < 0.001 && m1.receipts > m0.receipts && m1.charges === m0.charges + 2, 'Undo takeout cancel: back to ready, balance back to the cent, receipts and charges kept', { bal0, bal2, m0, m1 });
await clearToasts(p);
// card order cancel: no undo
await human(p, '[data-status=new]');
await human(p, '.tq-card[data-order="' + made.c + '"] [data-tq=cancel]');
ok(/cannot be undone/.test(await p.evaluate(() => document.querySelector('.modal').textContent)), 'card takeout cancel warns it cannot be undone');
await human(p, '.modal-foot .btn-danger');
ok(!(await hasUndo(p)), 'card takeout cancel has no Undo');
await clearToasts(p);
// settings and pause
const set0 = await p.evaluate(() => JSON.stringify(Club.store.getObj('takeoutSettings', null)));
await human(p, '[data-action=tq-pause]'); await human(p, '.modal-foot .btn-primary');
ok(await p.evaluate(() => Club.takeout.settings().paused === true), 'paused online takeout');
await undo(p);
ok(await p.evaluate(s0 => JSON.stringify(Club.store.getObj('takeoutSettings', null)) === s0, set0), 'Undo pause puts settings back');
await clearToasts(p);
await human(p, '[data-action=tq-settings]'); await p.evaluate(() => { const s = document.querySelector('.modal [name=lead]'); s.value = '60'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await human(p, '.modal-foot .btn-primary');
ok(await p.evaluate(() => Club.takeout.settings().lead === 60), 'takeout settings saved');
await undo(p);
ok(await p.evaluate(s0 => JSON.stringify(Club.store.getObj('takeoutSettings', null)) === s0, set0), 'Undo settings save');
await clearToasts(p);
ok(await noHScroll(p), 'takeout 1440 no horizontal scroll');

/* ---------------- Dining ---------------- */
await p.goto(B + 'index.html#/dining'); await p.waitForTimeout(1500);
const rs = (id) => p.evaluate(id => JSON.parse(JSON.stringify(Club.store.find('diningReservations', id))), id);
let rid = await p.evaluate(() => { const r = Club.store.all('diningReservations').find(r => r.date === Club.date.today() && r.status === 'confirmed' && r.table && !Club.store.all('diningReservations').some(x => x.id !== r.id && x.status === 'seated' && x.date === r.date && x.venue === r.venue && x.table === r.table)); return r.id; });
await human(p, '.tab[data-tab=reservations]');
await p.evaluate(() => { const b = [...document.querySelectorAll('[data-svc]')].find(x => x.dataset.svc === 'All'); if (b) b.click(); });
await p.waitForTimeout(300);
const rid2 = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-res-act=seated]')].find(x => x.offsetParent && (() => { const r = Club.store.find('diningReservations', x.dataset.id); return r && r.table && !Club.store.all('diningReservations').some(y => y.id !== r.id && y.status === 'seated' && y.date === r.date && y.venue === r.venue && y.table === r.table); })()); return b ? b.dataset.id : null; });
if (rid2) rid = rid2;
const r0 = await rs(rid);
await human(p, '[data-res-act=seated][data-id="' + rid + '"]');
ok((await rs(rid)).status === 'seated' && await hasUndo(p), 'Seat a party with Undo');
await undo(p);
ok(JSON.stringify(await rs(rid)) === JSON.stringify(r0), 'Undo seat restores the reservation exactly');
await clearToasts(p);
await human(p, '[data-res-act=seated][data-id="' + rid + '"]'); await clearToasts(p);
ok(await p.locator('[data-res-act=confirmed][data-id="' + rid + '"]').count() === 1, 'seated reservation offers Unseat');
await human(p, '[data-res-act=confirmed][data-id="' + rid + '"]');
const r1 = await rs(rid);
ok(r1.status === 'confirmed' && !r1.seatedAt, 'Unseat steps back to confirmed', r1);
await clearToasts(p);
await human(p, '[data-res-act=seated][data-id="' + rid + '"]'); await clearToasts(p);
await human(p, '[data-res-act=completed][data-id="' + rid + '"]'); await clearToasts(p);
ok((await rs(rid)).status === 'completed' && await p.locator('[data-res-act=seated][data-id="' + rid + '"]').count() === 1, 'completed reservation offers Reopen');
const seatedAt = (await rs(rid)).seatedAt;
await human(p, '[data-res-act=seated][data-id="' + rid + '"]');
ok((await rs(rid)).status === 'seated' && (await rs(rid)).seatedAt === seatedAt, 'Reopen steps back to seated, keeping the seated time');
await clearToasts(p);
// cancel reservation (confirm first) then Undo
await human(p, '[data-res-act=confirmed][data-id="' + rid + '"]'); await clearToasts(p);
const r2 = await rs(rid);
await human(p, '[data-res-act=cancelled][data-id="' + rid + '"]'); await human(p, '.modal-foot .btn-danger');
ok((await rs(rid)).status === 'cancelled' && await hasUndo(p), 'Cancel after confirmation, with Undo');
await undo(p);
ok(JSON.stringify(await rs(rid)) === JSON.stringify(r2), 'Undo cancel restores the reservation');
await clearToasts(p);

// Orders
await human(p, '.tab[data-tab=orders]');
const od = (id) => p.evaluate(id => JSON.parse(JSON.stringify(Club.store.find('diningOrders', id))), id);
const served = await p.evaluate(() => [...document.querySelectorAll('.dn-ticket [data-o=serve]')].map(x => x.closest('[data-order]').dataset.order).find(id => Club.store.find('diningOrders', id).memberId));
const f0 = await od(served);
await human(p, '[data-order="' + served + '"] [data-o=serve]');
ok((await od(served)).status === 'served' && await hasUndo(p), 'mark a check served, with Undo');
await undo(p); ok(JSON.stringify(await od(served)) === JSON.stringify(f0), 'Undo served'); await clearToasts(p);
await human(p, '[data-order="' + served + '"] [data-o=serve]'); await clearToasts(p);
const s0 = await od(served);
await human(p, '[data-order="' + served + '"] [data-o=unserve]');
ok((await od(served)).status === 'fired', 'Back to kitchen on a served check');
await undo(p);
ok(JSON.stringify(await od(served)) === JSON.stringify(s0), 'Undo Back to kitchen');
await clearToasts(p);
// close to member account then Undo
const mem = s0.memberId; const balA = await p.evaluate(m => Club.store.find('members', m).balance, mem), mA = await money(p);
await human(p, '[data-order="' + served + '"] [data-o=close]'); await human(p, '.modal-foot .btn-primary');
const balB = await p.evaluate(m => Club.store.find('members', m).balance, mem);
ok((await od(served)).status === 'closed' && balB > balA && await hasUndo(p), 'Close check to member account, with Undo', { balA, balB });
await undo(p);
const balC = await p.evaluate(m => Club.store.find('members', m).balance, mem), mB = await money(p);
ok(JSON.stringify(await od(served)) === JSON.stringify(s0) && Math.abs(balC - balA) < 0.001 && mB.charges === mA.charges + 2 && mB.receipts === mA.receipts + 2, 'Undo close: check open again, balance back to the cent, reversal charge and credit receipt added', { balA, balC, mA, mB });
await clearToasts(p);
// close again, then Reopen from Closed today
await human(p, '[data-order="' + served + '"] [data-o=close]'); await human(p, '.modal-foot .btn-primary'); await clearToasts(p);
const balD = await p.evaluate(m => Club.store.find('members', m).balance, mem), mC = await money(p);
await p.evaluate(() => { const a = document.querySelector('[data-acc="dn-closed"]'); if (a && !a.classList.contains('is-open')) a.querySelector('button').click(); });
await p.waitForTimeout(400);
await human(p, '[data-reopen="' + served + '"]'); await human(p, '.modal-foot .btn-primary');
const balE = await p.evaluate(m => Club.store.find('members', m).balance, mem), mD = await money(p), sE = await od(served);
ok(sE.status === 'served' && !sE.closedAt && Math.abs(balE - balA) < 0.001 && mD.charges === mC.charges + 1 && mD.receipts === mC.receipts + 1, 'Reopen a closed check: payment reversed to the cent, check back to served, nothing deleted', { balD, balE, balA, mC, mD, st: sE.status });
await undo(p);
ok((await od(served)).status === 'closed' && Math.abs(await p.evaluate(m => Club.store.find('members', m).balance, mem) - balD) < 0.001, 'Undo of Reopen closes it again with the charge back');
await clearToasts(p);
// fire and remove line
const open = await p.evaluate(() => { const o = Club.store.all('diningOrders').find(o => o.status === 'open' && o.items.some(l => !l.fired)); return o && o.id; });
if (open) {
  const o0 = await od(open);
  await human(p, '[data-order="' + open + '"] [data-rm]');
  ok((await od(open)).items.length === o0.items.length - 1, 'remove an unfired line');
  await undo(p); ok(JSON.stringify(await od(open)) === JSON.stringify(o0), 'Undo remove line'); await clearToasts(p);
  await human(p, '[data-order="' + open + '"] [data-o=fire]');
  ok((await od(open)).status === 'fired', 'fire a check');
  await undo(p); ok(JSON.stringify(await od(open)) === JSON.stringify(o0), 'Undo fire'); await clearToasts(p);
}
// menu 86
await human(p, '.tab[data-tab=menu]');
const mid = await p.evaluate(() => [...document.querySelectorAll('[data-avail]')].find(i => i.parentElement.offsetParent).dataset.avail);
const mi0 = await p.evaluate(id => JSON.stringify(Club.store.find('menuItems', id)), mid);
await human(p, p.locator('[data-avail="' + mid + '"]').locator('xpath=..'));
const avail1 = await p.evaluate(id => Club.store.find('menuItems', id).available, mid);
await undo(p);
ok(avail1 !== JSON.parse(mi0).available && await p.evaluate(([id, j]) => JSON.stringify(Club.store.find('menuItems', id)) === j, [mid, mi0]), "86 toggle and Undo");
ok(await noHScroll(p), 'dining 1440 no horizontal scroll');
await c.close();

/* 390: takeout drawer */
const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await m.newPage();
q.on('pageerror', e => errs.push(e.message));
await q.goto(B + 'index.html#/takeout'); await q.waitForTimeout(1500);
const d2 = await q.evaluate(() => { const T = Club.takeout, item = T.menu().find(i => i.section !== 'Breakfast' && !/pizza/i.test(i.name)); const lines = [{ menuId: item.id, qty: 1 }]; let date = Club.date.today(), sl = T.slots(date, lines).find(s => s.ok); if (!sl) { date = Club.date.addDays(date, 1); sl = T.slots(date, lines).find(s => s.ok); }
  const a = T.place({ customer: { kind: 'member', memberId: 'mem_1003', name: 'Dave Nerada', phone: '204-555-0100', email: 'dnerada@example.com' }, lines, date, time: sl.time, source: 'portal', pay: { method: 'account' } }); return { id: a.order.id, date }; });
await q.waitForTimeout(800); await q.goto(B + 'index.html#/dashboard'); await q.waitForTimeout(600); await q.goto(B + 'index.html#/takeout'); await q.waitForTimeout(1200);
if (await q.locator('[data-day="' + d2.date + '"]').count()) await human(q, '[data-day="' + d2.date + '"]');
await human(q, '.tq-card[data-order="' + d2.id + '"] .tq-items');
const dw = await q.evaluate(() => { const d = document.querySelector('.drawer.od-drawer'); return { w: d.getBoundingClientRect().width, sw: d.querySelector('.modal-body').scrollWidth, cw: d.querySelector('.modal-body').clientWidth }; });
ok(dw.w <= 390 && dw.sw <= dw.cw + 1, '390: takeout drawer fits', dw);
await q.screenshot({ path: 'xa-takeout-drawer-390.png' });
await q.keyboard.press('Escape'); await q.waitForTimeout(300);
ok(await noHScroll(q), '390: takeout no horizontal scroll');
await q.goto(B + 'index.html#/dining'); await q.waitForTimeout(1500); await human(q, '.tab[data-tab=orders]');
ok(await noHScroll(q), '390: dining orders no horizontal scroll');
await m.close();
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails() ? 'FAILED ' + fails() : 'ALL PASSED ' + res.length); await b.close();
