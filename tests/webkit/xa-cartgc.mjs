import { B, T, human, undo, toastText, hasUndo, clearToasts, launch, noHScroll, money } from './xa-lib.mjs';
const { ok, res, fails } = T();
const { b, c, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/cart/mine'); await p.waitForTimeout(1800);
const fleet = () => p.evaluate(() => JSON.stringify(Club.store.getObj('cartFleet', null)));
const co = (id) => p.evaluate(id => JSON.stringify(Club.store.find('cartOrders', id)), id);
if (await p.locator('[data-use="1"]').count()) await human(p, '[data-use="1"]');
if (await p.locator('[data-act=go]').count()) { await human(p, '[data-act=go]'); await clearToasts(p); }
await p.waitForTimeout(300);
const eid = await p.evaluate(() => { const b = document.querySelector('[data-act=delivered]'); return b && b.dataset.entry; });
ok(!!eid, 'cart driver view has a Delivered button', eid);
const docs = await p.evaluate(eid => Club.cart.entryDocs(eid).map(d => ({ id: d.id, pay: d.payment, visit: d.kind === 'visit', mem: d.memberId })), eid);
const d0 = docs[0];
const f0 = await fleet(), o0 = await co(d0.id), m0 = await money(p), bal0 = d0.mem ? await p.evaluate(m => Club.store.find('members', m).balance, d0.mem) : null;
await human(p, '[data-act=delivered]');
if (await p.locator('[data-rec]').count()) await human(p, '[data-rec="' + d0.id + '"]');
if (d0.visit) { await human(p, '[data-binc]'); await human(p, '[data-bsave=items]'); }
else await human(p, d0.pay === 'account' ? '[data-paid=account]' : '[data-paid=card]');
await p.waitForTimeout(300);
const del = JSON.parse(await co(d0.id));
ok(del.status === 'delivered' && await hasUndo(p), 'delivered with Undo on the toast (' + (d0.visit ? 'visit' : d0.pay) + ')', del.status);
const m1 = await money(p);
await undo(p);
const bal1 = d0.mem ? await p.evaluate(m => Club.store.find('members', m).balance, d0.mem) : null, m2 = await money(p);
ok(await co(d0.id) === o0 && await fleet() === f0 && (bal0 === null || Math.abs(bal1 - bal0) < 0.001) && m2.receipts >= m1.receipts && m2.charges >= m1.charges,
  'Undo delivered: order open again, fleet line restored, balance back to the cent, receipts kept', { bal0, bal1, m0, m1, m2 });
ok(/open again/.test(await toastText(p)), 'Undo toast confirms', await toastText(p));
await clearToasts(p);
// guard
await p.waitForTimeout(300);
await human(p, '[data-act=delivered]');
if (await p.locator('[data-rec]').count()) await human(p, '[data-rec="' + d0.id + '"]');
if (d0.visit) { await human(p, '[data-binc]'); await human(p, '[data-bsave=items]'); } else await human(p, d0.pay === 'account' ? '[data-paid=account]' : '[data-paid=card]');
await p.evaluate(() => { const f = Club.store.getObj('cartFleet'); f.carts[0].name = f.carts[0].name + ' '; Club.store.setObj('cartFleet', f); });
await undo(p);
ok(JSON.parse(await co(d0.id)).status === 'delivered' && /changed since/.test(await toastText(p)), 'Undo refused once the cart line changed', await toastText(p));
await p.evaluate(() => { const f = Club.store.getObj('cartFleet'); f.carts[0].name = f.carts[0].name.trim(); Club.store.setObj('cartFleet', f); });
await clearToasts(p);
// clubhouse: staff cancel and undo
await human(p, '.tab[data-tab=clubhouse]'); await p.waitForTimeout(400);
const cid = await p.evaluate(() => { const b = document.querySelector('[data-cancel]'); return b && b.dataset.cancel; });
if (cid) {
  const fc = await fleet(), oc = await co(cid);
  await human(p, '[data-cancel="' + cid + '"]'); await human(p, '.modal-foot .btn-danger');
  ok(JSON.parse(await co(cid)).status === 'cancelled' && await hasUndo(p), 'staff cancel with Undo');
  await undo(p);
  ok(await co(cid) === oc && await fleet() === fc, 'Undo staff cancel: order and cart line restored exactly');
  await clearToasts(p);
} else ok(false, 'an open order to cancel');
ok(await noHScroll(p), 'cart clubhouse 1440 no horizontal scroll');
// menu
await human(p, '.tab[data-tab=menu]'); await p.waitForTimeout(300);
const menu0 = await p.evaluate(() => JSON.stringify(Club.store.all('cartMenu'))), cats0 = await p.evaluate(() => JSON.stringify(Club.store.getObj('cartCategories', null)));
const sid = await p.evaluate(() => document.querySelector('[data-sold]').dataset.sold);
await human(p, p.locator('[data-sold="' + sid + '"]').locator('xpath=..'));
ok(await p.evaluate(id => Club.store.find('cartMenu', id).soldOut, sid) && await hasUndo(p), 'sold out toggle with Undo');
await undo(p); ok(await p.evaluate(() => JSON.stringify(Club.store.all('cartMenu'))) === menu0, 'Undo sold out'); await clearToasts(p);
const rid = await p.evaluate(() => document.querySelector('[data-remove]').dataset.remove);
await human(p, '[data-remove="' + rid + '"]'); await human(p, '.modal-foot .btn-danger');
ok(!(await p.evaluate(id => Club.store.find('cartMenu', id), rid)), 'remove a cart menu item');
await undo(p); ok(await p.evaluate(() => JSON.stringify(Club.store.all('cartMenu'))) === menu0, 'Undo remove item (same place)'); await clearToasts(p);
await human(p, '[data-action=add-item]'); await p.fill('.modal [name=name]', 'Test freezie'); await human(p, '.modal .cx-cat-new'); await p.fill('.modal [name=newCategory]', 'Frozen'); await p.fill('.modal [name=price]', '3'); await human(p, '.modal-foot .btn-primary');
ok(await p.evaluate(() => Club.store.all('cartMenu').some(m => m.name === 'Test freezie' && m.category === 'Frozen')), 'add an item in a new category');
await undo(p);
ok(await p.evaluate(() => JSON.stringify(Club.store.all('cartMenu'))) === menu0 && await p.evaluate(() => JSON.stringify(Club.store.getObj('cartCategories', null))) === cats0, 'Undo add: item and new category gone');
await clearToasts(p);
// remove an empty category then undo: make one empty first
await human(p, '[data-action=add-item]'); await p.fill('.modal [name=name]', 'Tmp'); await human(p, '.modal .cx-cat-new'); await p.fill('.modal [name=newCategory]', 'Empty one'); await p.fill('.modal [name=price]', '1'); await human(p, '.modal-foot .btn-primary'); await clearToasts(p);
const tmp = await p.evaluate(() => Club.store.all('cartMenu').find(m => m.name === 'Tmp').id);
await human(p, '[data-remove="' + tmp + '"]'); await human(p, '.modal-foot .btn-danger'); await clearToasts(p);
const catsE = await p.evaluate(() => JSON.stringify(Club.store.getObj('cartCategories', null)));
await human(p, '[data-rmcat="Empty one"]'); await human(p, '.modal-foot .btn-danger');
ok(!(await p.evaluate(() => Club.store.getObj('cartCategories').includes('Empty one'))), 'remove an empty category');
await undo(p); ok(await p.evaluate(() => JSON.stringify(Club.store.getObj('cartCategories', null))) === catsE, 'Undo remove category'); await clearToasts(p);
// start a shift on cart 2 and undo
await human(p, '.tab[data-tab=mine]'); await p.waitForTimeout(300);
if (await p.locator('[data-act=switch]').count()) await human(p, '[data-act=switch]');
const fs0 = await fleet();
await p.fill('#cx-fname', 'Robin'); await human(p, '.cx-seg button[data-cart="2"]'); await human(p, '.cx-form button[type=submit]');
ok(JSON.parse(await fleet()).carts.length === JSON.parse(fs0).carts.length + 1 && await hasUndo(p), 'start a shift, with Undo');
await undo(p); ok(await fleet() === fs0, 'Undo start shift'); await clearToasts(p);

/* ---------------- Gift cards ---------------- */
const gid = await p.evaluate(() => Club.giftcards.purchase({ amount: 100, recipient: { name: 'Sam Test', email: 'sam@example.com' }, message: '', from: 'Jo', buyer: { name: 'Jo Buyer', email: 'jo@example.com' }, source: 'staff', pay: { method: 'card', brand: 'visa', last4: '4242' } }).card.id);
await p.waitForTimeout(800);
await p.goto(B + 'index.html#/giftcards/' + gid); await p.waitForTimeout(1500);
const g = () => p.evaluate(id => JSON.parse(JSON.stringify(Club.store.find('giftCards', id))), gid);
const g0 = await g();
await human(p, p.locator('.drawer .modal-foot button', { hasText: 'Redeem' }));
await p.fill('.modal [name=amount]', '25.50'); await human(p, p.locator('.modal .modal-foot button', { hasText: 'Redeem' }));
ok((await g()).balance === 74.5 && await hasUndo(p), 'redeem 25.50 by hand, with Undo');
await undo(p); await p.waitForTimeout(400);
const g1 = await g();
ok(g1.balance === 100 && g1.history.length === g0.history.length + 2 && g1.history.slice(-1)[0].type === 'refund', 'Undo redeem: balance back through a history entry', { bal: g1.balance, h: g1.history.map(e => e.type) });
ok(await p.evaluate(() => /\$100\.00/.test(document.querySelector('.drawer .gs-bal').textContent)), 'the open drawer shows the restored balance');
await clearToasts(p);
await human(p, p.locator('.drawer .modal-foot button', { hasText: 'Void' }));
await p.fill('.modal [name=reason]', 'Reported lost'); await human(p, p.locator('.modal .modal-foot button', { hasText: 'Void gift card' }));
ok((await g()).status === 'void' && (await g()).balance === 0 && await hasUndo(p), 'void with Undo');
await undo(p); await p.waitForTimeout(400);
const g2 = await g();
ok(g2.status === 'active' && g2.balance === 100, 'Undo void: active again with its balance', g2.status);
await clearToasts(p);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const gs0 = await p.evaluate(() => JSON.stringify(Club.store.getObj('giftCardSettings', null)));
await human(p, '[data-action=gs-settings]'); await p.fill('.modal [name=max]', '900'); await human(p, '.modal-foot .btn-primary');
ok(await p.evaluate(() => Club.giftcards.settings().max === 900), 'gift card amounts saved');
await undo(p); ok(await p.evaluate(() => JSON.stringify(Club.store.getObj('giftCardSettings', null))) === gs0, 'Undo gift card amounts');
ok(await noHScroll(p), 'gift cards 1440 no horizontal scroll');
await c.close();
const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await m.newPage();
q.on('pageerror', e => errs.push(e.message));
for (const h of ['cart/clubhouse', 'cart/menu', 'giftcards', 'proshop/inventory']) { await q.goto(B + 'index.html#/' + h); await q.waitForTimeout(1300); ok(await noHScroll(q), '390: ' + h + ' no horizontal scroll'); }
await m.close();
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails() ? 'FAILED ' + fails() : 'ALL PASSED ' + res.length); await b.close();
