import { B, T, human, undo, toastText, hasUndo, clearToasts, launch, noHScroll, money } from './xa-lib.mjs';
const { ok, res, fails } = T();
const { b, c, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/proshop/register'); await p.waitForTimeout(1800);
const setStaff = () => p.evaluate(() => { const s = document.querySelector('#ps-staff'); s.value = 'stf_23'; s.dispatchEvent(new Event('change', { bubbles: true })); });
const prodSnap = (ids) => p.evaluate(ids => ids.map(id => Club.store.find('products', id).stock), ids);
const tiles = await p.evaluate(() => [...document.querySelectorAll('.ps-tile:not(.out)')].slice(0, 2).map(t => t.dataset.add));

/* 1. Cash sale for member mem_1003 picked with the customer search */
await human(p, '.ps-tile[data-add="' + tiles[0] + '"]'); await human(p, '.ps-tile[data-add="' + tiles[1] + '"]');
await setStaff();
await human(p, '#ps-cust'); await p.keyboard.type('Nerada', { delay: 40 }); await p.waitForTimeout(300);
const opts = await p.evaluate(() => [...document.querySelectorAll('.ps-cust-opt')].map(o => o.dataset.id + ':' + o.textContent));
ok(opts.some(o => o.startsWith('mem_1003')), 'customer search lists Dave Nerada (mem_1003)', opts);
ok(await p.evaluate(() => document.querySelector('#ps-cust').getAttribute('aria-expanded') === 'true' && document.querySelector('#ps-cust').getAttribute('role') === 'combobox'), 'combobox role and aria-expanded');
await human(p, '.ps-cust-opt[data-id="mem_1003"]');
ok(await p.evaluate(() => /Dave Nerada/.test(document.querySelector('.ps-cust-chip').textContent)), 'chip shows the chosen member');
await human(p, '[data-tender="Cash"]'); await human(p, '[data-cash]');
const st0 = await prodSnap(tiles), m0 = await money(p);
await human(p, '[data-action=complete]');
const sale1 = await p.evaluate(() => { const s = Club.store.all('sales').slice(-1)[0]; const r = Club.store.all('receipts').slice(-1)[0]; return { s: { id: s.id, memberId: s.memberId, payment: s.payment }, r: { no: r.no, memberId: r.memberId, method: r.method, name: r.name, refId: r.refId } }; });
ok(sale1.s.memberId === 'mem_1003' && sale1.s.payment === 'Cash' && sale1.r.memberId === 'mem_1003' && sale1.r.method === 'cash' && sale1.r.refId === sale1.s.id, 'cash sale receipt carries memberId mem_1003', sale1);
ok(await hasUndo(p) && /completed/.test(await toastText(p)), 'cash sale toast has Undo');
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await clearToasts(p);

/* 2. Walk-in card sale stays Walk-in customer */
await human(p, '.ps-tile[data-add="' + tiles[0] + '"]'); await human(p, '[data-tender="Card"]'); await human(p, '[data-action=complete]');
const walk = await p.evaluate(() => { const r = Club.store.all('receipts').slice(-1)[0]; return { name: r.name, memberId: r.memberId, pp: r.publicPlayerId }; });
ok(walk.name === 'Walk-in customer' && !walk.memberId && !walk.pp, 'no customer: Walk-in customer receipt', walk);
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await clearToasts(p);

/* 3. Public golfer cash sale */
await human(p, '.ps-tile[data-add="' + tiles[1] + '"]'); await human(p, '[data-tender="Cash"]'); await human(p, '#ps-cust'); await p.keyboard.type('Fontaine', { delay: 30 }); await p.waitForTimeout(250);
await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await human(p, '[data-cash]'); await human(p, '[data-action=complete]');
const pub = await p.evaluate(() => { const r = Club.store.all('receipts').slice(-1)[0]; return { pp: r.publicPlayerId, inPublic: Club.receipts.forPublic('pp_demo_g01').some(x => x.id === r.id) }; });
ok(pub.pp === 'pp_demo_g01' && pub.inPublic, 'public golfer picked by keyboard: receipt in Club.receipts.forPublic', pub);
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await clearToasts(p);

/* 4. Member account sale then Undo: balance to the cent, stock, refund sale, reversal and credit receipt, nothing deleted */
await human(p, '.ps-tile[data-add="' + tiles[0] + '"]'); await human(p, '.ps-tile[data-add="' + tiles[0] + '"]'); await human(p, '[data-tender="Member account"]');
await human(p, '[data-action=complete]');
ok(await p.evaluate(() => /Choose the member to charge/.test(document.querySelector('.ps-cust').textContent)), 'account tender without a member asks for one');
await human(p, '#ps-cust'); await p.keyboard.type('Sterling', { delay: 30 }); await p.waitForTimeout(250); await human(p, '.ps-cust-opt[data-id="mem_1010"]');
const bal0 = await p.evaluate(() => Club.store.find('members', 'mem_1010').balance), stA = await prodSnap([tiles[0]]), mA = await money(p);
const rcIds0 = await p.evaluate(() => Club.store.all('receipts').map(r => r.id));
await human(p, '[data-action=complete]');
const after1 = await p.evaluate(() => ({ bal: Club.store.find('members', 'mem_1010').balance, sale: Club.store.all('sales').slice(-1)[0].id }));
ok(after1.bal > bal0, 'account sale charged the member', { bal0, after1 });
await undo(p);
const und = await p.evaluate(([sid, ids]) => ({ bal: Club.store.find('members', 'mem_1010').balance, refund: !!Club.store.find('sales', sid + '_u'), lastCh: Club.store.all('charges').slice(-2).map(c => c.amount),
  rc: Club.store.all('receipts').filter(r => ids.indexOf(r.id) < 0).map(r => r.kind), allKept: ids.every(id => Club.store.find('receipts', id)), ticket: document.querySelectorAll('.ps-line').length }), [after1.sale, rcIds0]);
const stB = await prodSnap([tiles[0]]), mB = await money(p);
ok(Math.abs(und.bal - bal0) < 0.001 && und.refund && und.lastCh[0] === -und.lastCh[1] && JSON.stringify(stB) === JSON.stringify(stA) && und.rc.join() === 'sale,credit' && und.allKept && mB.charges === mA.charges + 2 && mB.sales === mA.sales + 2,
  'Undo account sale: balance back to the cent, stock back, refund sale, charge reversal, sale and credit receipts, nothing deleted', { bal0, und, stA, stB, mA, mB });
ok(und.ticket === 1 && /undone/.test(await toastText(p)), 'Undo puts the items back on the ticket', und.ticket);
await clearToasts(p);

/* 5. Inventory: online toggle, receive, edit, delete each with Undo */
await p.goto(B + 'index.html#/proshop/inventory'); await p.waitForTimeout(1500);
const pid = await p.evaluate(() => document.querySelector('input[data-online]').dataset.online);
const prod0 = await p.evaluate(id => JSON.stringify(Club.store.find('products', id)), pid);
await human(p, p.locator('input[data-online="' + pid + '"]').locator('xpath=..'));
const t1 = await p.evaluate(id => Club.store.find('products', id).online, pid);
await undo(p);
ok(await p.evaluate(([id, j]) => JSON.stringify(Club.store.find('products', id)) === j, [pid, prod0]) && t1 !== JSON.parse(prod0).online, 'Sell online toggle and Undo', t1);
await clearToasts(p);
await human(p, '[data-receive="' + pid + '"]'); await human(p, '.modal-foot .btn-primary');
const recv = await p.evaluate(id => Club.store.find('products', id).stock, pid);
await undo(p);
ok(recv > JSON.parse(prod0).stock && await p.evaluate(([id, j]) => JSON.stringify(Club.store.find('products', id)) === j, [pid, prod0]), 'Receive stock and Undo', recv);
await clearToasts(p);
await human(p, '[data-edit-btn="' + pid + '"]'); await p.fill('.modal [name=name]', 'Renamed item'); await human(p, '.modal-foot .btn-primary');
const ren = await p.evaluate(id => Club.store.find('products', id).name, pid); await undo(p);
ok(ren === 'Renamed item' && await p.evaluate(([id, j]) => JSON.stringify(Club.store.find('products', id)) === j, [pid, prod0]), 'Edit product and Undo', ren);
await clearToasts(p);
const idx0 = await p.evaluate(id => Club.store.all('products').findIndex(x => x.id === id), pid);
await human(p, '[data-delete="' + pid + '"]'); await human(p, '.modal-foot .btn-danger');
const gone = await p.evaluate(id => !Club.store.find('products', id), pid); await undo(p);
ok(gone && await p.evaluate(([id, j, i]) => JSON.stringify(Club.store.find('products', id)) === j && Club.store.all('products').findIndex(x => x.id === id) === i, [pid, prod0, idx0]) && await p.locator('[data-delete="' + pid + '"]').count() === 1, 'Delete product and Undo (same place, back in the table)');
await clearToasts(p);

/* 6. Online orders: step, Undo, step back, drawer */
await p.goto(B + 'index.html#/proshop/online'); await p.waitForTimeout(1500);
const so = (no) => p.evaluate(no => { const o = Club.store.all('shopOrders').find(x => x.no === no); return JSON.parse(JSON.stringify(o)); }, no);
const w5a = await so('W-0005');
await human(p, '.ps-oc[data-order="' + w5a.id + '"] [data-oc=ready]');
ok((await so('W-0005')).status === 'ready' && await hasUndo(p), 'Mark ready shows Undo');
await undo(p);
ok(JSON.stringify(await so('W-0005')) === JSON.stringify(w5a), 'Undo Mark ready restores the order exactly');
await clearToasts(p);
// whole card opens the drawer; a button inside does not
await human(p, '.ps-oc[data-order="' + w5a.id + '"] .ps-oc-items');
ok(await p.locator('.drawer.od-drawer').count() === 1, 'clicking the card body opens the drawer');
const dtext = await p.evaluate(() => document.querySelector('.drawer.od-drawer').textContent);
ok(/Customer/.test(dtext) && /Items/.test(dtext) && /Timeline/.test(dtext) && /Order placed online/.test(dtext) && /Tax/.test(dtext) && /Paid with/.test(dtext) && /Receipt/.test(dtext), 'drawer shows customer, items, totals, payment, timeline, receipt');
await human(p, '.drawer.od-drawer [data-oc=ready]');
ok((await so('W-0005')).status === 'ready' && /Marked ready/.test(await p.evaluate(() => document.querySelector('.drawer.od-drawer').textContent)), 'drawer action Mark ready updates the drawer timeline');
await human(p, '.drawer.od-drawer [data-oc="picked-up"]');
const w5p = await so('W-0005');
ok(w5p.status === 'picked-up' && w5p.pickedUpBy && await p.locator('.drawer.od-drawer [data-oc=ready]').count() === 1, 'picked up in the drawer, Back to ready offered', w5p.status);
await human(p, '.drawer.od-drawer [data-oc=ready]');
const w5r = await so('W-0005');
ok(w5r.status === 'ready' && !w5r.pickedUpAt && !w5r.pickedUpBy && /Moved back to ready/.test(w5r.log.slice(-1)[0].text), 'Back to ready from the drawer clears the hand-over', w5r);
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await clearToasts(p);
// picked-up tab: W-0001 has Back to ready on the card
await human(p, '[data-on-status="picked-up"]');
const w1 = await so('W-0001');
ok(await p.locator('.ps-oc[data-order="' + w1.id + '"] [data-oc=ready]').count() === 1, 'Picked up card has Back to ready');
await human(p, '.ps-oc[data-order="' + w1.id + '"] [data-oc=ready]'); await p.waitForTimeout(300);
ok((await so('W-0001')).status === 'ready', 'Back to ready on the card');
await undo(p);
ok(JSON.stringify(await so('W-0001')) === JSON.stringify(w1), 'Undo of Back to ready restores picked up exactly');
await clearToasts(p);
// keyboard: Enter on the focused card opens the drawer; the member link does not open it
await p.evaluate(id => document.querySelector('.ps-oc[data-order="' + id + '"]').focus(), w1.id); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok(await p.locator('.drawer.od-drawer').count() === 1 && /W-0001/.test(await p.evaluate(() => document.querySelector('.drawer.od-drawer h3').textContent)), 'Enter on a focused card opens its drawer');
ok(await p.evaluate(() => !!document.querySelector('.drawer.od-drawer a[href="#/members/mem_1003"]')), 'drawer links the member profile');
await p.screenshot({ path: 'xa-online-drawer-1440.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await human(p, '[data-on-status="new"]');
// Receipt button on a card opens the receipt only
const w6 = await so('W-0006');
await human(p, '.ps-oc[data-order="' + w6.id + '"] [data-oc-rc]');
ok(await p.locator('.drawer.od-drawer').count() === 0 && await p.locator('.modal').count() >= 1, 'Receipt button on the card does not open the drawer');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
// cancel an account-paid order then Undo
const bal27 = await p.evaluate(() => Club.store.find('members', 'mem_1027').balance), stk6 = await p.evaluate(o => o.items.map(l => Club.store.find('products', l.productId).stock), w6);
const rc6 = await p.evaluate(() => Club.store.all('receipts').length);
await human(p, '.ps-oc[data-order="' + w6.id + '"] [data-oc=cancel]'); await p.fill('.modal textarea[name=reason]', 'Out of stock at the warehouse'); await human(p, '.modal-foot .btn-danger');
const c6 = await so('W-0006');
ok(c6.status === 'cancelled' && await hasUndo(p), 'account-paid cancel offers Undo');
await undo(p);
const u6 = await so('W-0006');
const bal27b = await p.evaluate(() => Club.store.find('members', 'mem_1027').balance), stk6b = await p.evaluate(o => o.items.map(l => Club.store.find('products', l.productId).stock), w6);
ok(u6.status === 'new' && Math.abs(bal27b - bal27) < 0.001 && JSON.stringify(stk6) === JSON.stringify(stk6b) && await p.evaluate(n => Club.store.all('receipts').length > n, rc6), 'Undo cancel: order new, balance back to the cent, stock back, receipts kept', { bal27, bal27b, stk6, stk6b });
await clearToasts(p);
// card-paid cancel: no Undo, says so
const w4 = await p.evaluate(() => Club.store.all('shopOrders').find(x => x.no === 'W-0004').id);
await human(p, '[data-on-status="ready"]'); await human(p, '.ps-oc[data-order="' + w4 + '"] [data-oc=cancel]');
ok(/cannot be undone/.test(await p.evaluate(() => document.querySelector('.modal').textContent)), 'card refund modal says it cannot be undone');
await p.fill('.modal textarea[name=reason]', 'Customer asked by phone'); await human(p, '.modal-foot .btn-danger');
ok(!(await hasUndo(p)) && /cancelled/.test(await toastText(p)), 'card refund cancel has no Undo');
ok(await noHScroll(p), '1440: no horizontal scroll');
await c.close();

/* 7. 390 wide: drawer fits, no horizontal scroll */
const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await m.newPage();
q.on('pageerror', e => errs.push(e.message)); q.on('console', x => { if (x.type() === 'error' && !/open-meteo|429|503|Failed to load/.test(x.text())) errs.push(x.text()); });
await q.goto(B + 'index.html#/proshop/online'); await q.waitForTimeout(1500);
await human(q, '.ps-oc .ps-oc-items');
const dw = await q.evaluate(() => { const d = document.querySelector('.drawer.od-drawer'); const r = d.getBoundingClientRect(); return { w: r.width, sw: d.querySelector('.modal-body').scrollWidth, cw: d.querySelector('.modal-body').clientWidth }; });
ok(dw.w <= 390 && dw.sw <= dw.cw + 1, '390: drawer fits without sideways scroll', dw);
await q.screenshot({ path: 'xa-online-drawer-390.png' });
await q.keyboard.press('Escape'); await q.waitForTimeout(300);
ok(await noHScroll(q), '390: online orders no horizontal scroll');
await q.goto(B + 'index.html#/proshop/register'); await q.waitForTimeout(1500);
ok(await noHScroll(q), '390: register no horizontal scroll');
await q.screenshot({ path: 'xa-register-390.png', fullPage: true });
await m.close();

/* 8. The member sees the cash sale receipt in the portal */
const pc = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pp = await pc.newPage();
pp.on('pageerror', e => errs.push(e.message));
// same store: copy localStorage from a fresh staff run is not shared, so ring the sale in this context first
await pp.goto(B + 'index.html#/proshop/register'); await pp.waitForTimeout(1500);
const t2 = await pp.evaluate(() => document.querySelector('.ps-tile:not(.out)').dataset.add);
await human(pp, '.ps-tile[data-add="' + t2 + '"]');
await pp.evaluate(() => { const s = document.querySelector('#ps-staff'); s.value = 'stf_23'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await human(pp, '#ps-cust'); await pp.keyboard.type('Nerada'); await pp.waitForTimeout(250); await human(pp, '.ps-cust-opt[data-id="mem_1003"]');
await human(pp, '[data-tender="Cash"]'); await human(pp, '[data-cash]'); await human(pp, '[data-action=complete]');
const rno = await pp.evaluate(() => Club.store.all('receipts').slice(-1)[0].no);
await pp.evaluate(() => localStorage.setItem('stboniface.portal.session', 'mem_1003'));
await pp.goto(B + 'member.html#/account/receipts'); await pp.waitForTimeout(2500);
let seen = await pp.evaluate(no => document.body.textContent.indexOf(no) >= 0 || /Pro shop sale No/.test(document.body.textContent), rno);
if (!seen) { await pp.goto(B + 'member.html#/account'); await pp.waitForTimeout(2000); const l = pp.locator('a, button', { hasText: 'Receipts' }).first(); if (await l.count()) { await human(pp, l); await pp.waitForTimeout(1200); } seen = await pp.evaluate(no => document.body.textContent.indexOf(no) >= 0 || /Pro shop sale No/.test(document.body.textContent), rno); }
ok(seen, 'member.html My account > Receipts shows the cash sale receipt ' + rno, await pp.evaluate(() => location.hash));
await pp.screenshot({ path: 'xa-portal-receipts-1440.png' });
await pc.close();

ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails() ? 'FAILED ' + fails() : 'ALL PASSED ' + res.length); await b.close();
