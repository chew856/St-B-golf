/* Post charge: the Item dropdown (category price lists) from Members and from Billing, at 1440 and 390. */
import { suite, human, open, undo, toastText, modalBtn, noHScroll } from './xb-lib.mjs';
const S = suite(); const { ok } = S;
async function pick(p, name, text) {
  await human(p, p.locator('.modal .field:has(select[name=' + name + ']) .cs-btn'));
  const opt = p.locator('.cs-pop .cs-opt', { hasText: text }).first();
  await opt.waitFor({ timeout: 4000 });
  await opt.evaluate(e => e.scrollIntoView({ block: 'nearest' })); await p.waitForTimeout(150);
  const b = await opt.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await p.mouse.move(x - 4, y - 2); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350);
}
const itemTexts = p => p.evaluate(() => [...document.querySelector('.modal select[name=chargeItem]').options].map(o => o.text));
const vals = p => p.evaluate(() => ({ d: document.querySelector('.modal [name=description]').value, a: document.querySelector('.modal [name=amount]').value }));
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'dashboard', S);
  const mid = await p.evaluate(() => Club.store.all('members').find(m => m.status === 'active' && m.tierId === 'tier_full').id);
  const data = await p.evaluate(() => ({ cart: Club.store.getObj('teeSheetSettings').cartFee, prods: Club.store.all('products').filter(x => x.price > 0).length,
    menu: Club.store.all('menuItems').filter(x => x.available !== false && x.price > 0).length,
    ev: Club.store.all('events').filter(e => e.date >= Club.date.today() && e.status !== 'cancelled' && e.status !== 'draft' && e.price > 0).length,
    addons: Club.addons.active().length, tier: Club.store.find('membershipTiers', 'tier_full') }));

  /* A. From the member's profile: Golf > Cart fee, edit both fields, post, Undo */
  await p.evaluate(id => { location.hash = '#/members/' + id; }, mid); await p.waitForTimeout(1200);
  const bal0 = await p.evaluate(id => Club.store.find('members', id).balance, mid);
  await human(p, '[data-action=charge]:visible');
  ok(JSON.stringify(await itemTexts(p)) === '["Other"]', W + ' default category Other: Item lists only Other');
  ok(/No price list/.test(await p.locator('.modal .field:has(select[name=chargeItem]) .field-hint').textContent()), W + ' no-data hint shown');
  await pick(p, 'category', 'Golf');
  const golf = await itemTexts(p);
  ok(golf.some(t => /^Guest green fee, weekday, 18 holes · \$66\.00$/.test(t)) && golf.some(t => /^Cart fee, per rider/.test(t)) && golf.filter(t => /Rental clubs|Pull cart|Sleeve/.test(t)).length >= data.addons, W + ' Golf lists green fees, cart fee and add-ons', golf);
  if (W === 1440) { await human(p, p.locator('.modal .field:has(select[name=chargeItem]) .cs-btn')); await p.waitForTimeout(300); await p.screenshot({ path: 'pc-golf-open-' + W + '.png' }); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await pick(p, 'chargeItem', 'Cart fee');
  let v = await vals(p);
  ok(v.d === 'Cart fee' && +v.a === data.cart, W + ' Cart fee fills description and amount', v);
  await p.locator('.modal [name=description]').fill('Cart fee, J. Carter'); await p.locator('.modal [name=amount]').fill('30.50');
  ok(await noHScroll(p), W + ' no sideways scroll with the dialog open');
  await p.screenshot({ path: 'pc-member-' + W + '.png' });
  const rc0 = await p.evaluate(() => Club.store.all('receipts').length);
  await modalBtn(p, 'Post charge');
  const ch = await p.evaluate(id => { const c = Club.store.all('charges').filter(c => c.memberId === id).slice(-1)[0]; return { d: c.description, a: c.amount, cat: c.category, id: c.id, rc: Club.store.all('receipts').some(r => r.chargeId === c.id), bal: Club.store.find('members', id).balance }; }, mid);
  ok(ch.d === 'Cart fee, J. Carter' && ch.a === 30.5 && ch.cat === 'Golf' && ch.rc && Math.abs(ch.bal - bal0 - 30.5) < 0.001, W + ' edited item posted as Golf with a receipt', ch);
  await undo(p);
  const un = await p.evaluate(([id, cid]) => { const c = Club.store.find('charges', cid); const r = c && Club.store.find('charges', c.reversedBy); return { bal: Club.store.find('members', id).balance, rev: r && r.amount, cr: !!r && Club.store.all('receipts').some(x => x.chargeId === r.id && x.kind === 'credit') }; }, [mid, ch.id]);
  ok(Math.abs(un.bal - bal0) < 0.001 && un.rev === -30.5 && un.cr && /Charge reversed/.test(await toastText(p)), W + ' Undo reverses with a credit receipt', un);

  /* B. From Billing: choose the member, Dues lists the tier dues; Other clears untouched item text; free text posts */
  await p.evaluate(() => { location.hash = '#/billing'; }); await p.waitForTimeout(1200);
  await human(p, '[data-action=charge]:visible');
  const mname = await p.evaluate(id => [...document.querySelector('.modal select[name=memberId]').options].find(o => o.value === id).text, mid);
  await pick(p, 'memberId', mname);
  await pick(p, 'category', 'Dues');
  const dues = await itemTexts(p);
  const inst = Math.round(data.tier.annualDues / 12 * 100) / 100;
  ok(dues.length === 3 && dues.some(t => t.indexOf('Monthly dues instalment · $' + inst.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) === 0) && dues.some(t => /Annual dues · \$2,650\.00/.test(t)), W + ' Dues lists the member category dues', dues);
  await pick(p, 'chargeItem', 'Monthly dues instalment');
  v = await vals(p); ok(/dues instalment, Birdie membership/.test(v.d) && +v.a === inst, W + ' dues item fills', v);
  await pick(p, 'category', 'Pro Shop');
  v = await vals(p); ok(v.d === '' && v.a === '', W + ' changing category clears untouched item text', v);
  ok((await itemTexts(p)).length === data.prods + 1, W + ' Pro Shop lists every product', [(await itemTexts(p)).length, data.prods]);
  await pick(p, 'category', 'Dining');
  ok((await itemTexts(p)).length === data.menu + 1, W + ' Dining lists the available menu', [(await itemTexts(p)).length, data.menu]);
  await pick(p, 'category', 'Events');
  ok((await itemTexts(p)).length === data.ev + 1, W + ' Events lists upcoming events with a fee', [(await itemTexts(p)).length, data.ev]);
  await pick(p, 'category', 'Lessons');
  const ls = await itemTexts(p);
  ok(ls.some(t => /^Private lesson \(60 min\) · \$95\.00$/.test(t)), W + ' Lessons lists the rate card', ls);
  if (W === 390) { await human(p, p.locator('.modal .field:has(select[name=chargeItem]) .cs-btn')); await p.waitForTimeout(300); await p.screenshot({ path: 'pc-lessons-open-' + W + '.png' });
    ok(await p.evaluate(() => { const r = document.querySelector('.cs-pop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), W + ' item list fits the screen'); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await pick(p, 'chargeItem', 'Private lesson');
  await p.locator('.modal [name=amount]').fill('90');
  await pick(p, 'chargeItem', 'Other');
  v = await vals(p); ok(v.d === 'Private lesson, 60 minutes' && v.a === '90', W + ' Other keeps text once staff edited it', v);
  await pick(p, 'category', 'Other');
  ok(JSON.stringify(await itemTexts(p)) === '["Other"]', W + ' Other category: only Other');
  await p.locator('.modal [name=description]').fill('Locker key replacement'); await p.locator('.modal [name=amount]').fill('12');
  await p.screenshot({ path: 'pc-billing-' + W + '.png' });
  const bal1 = await p.evaluate(id => Club.store.find('members', id).balance, mid);
  await modalBtn(p, 'Post charge');
  const c2 = await p.evaluate(id => { const c = Club.store.all('charges').filter(c => c.memberId === id).slice(-1)[0]; return { d: c.description, a: c.amount, cat: c.category, bal: Club.store.find('members', id).balance }; }, mid);
  ok(c2.d === 'Locker key replacement' && c2.a === 12 && c2.cat === 'Other' && Math.abs(c2.bal - bal1 - 12) < 0.001, W + ' free text Other charge posts', c2);
  await undo(p);
  ok(Math.abs(await p.evaluate(id => Club.store.find('members', id).balance, mid) - bal1) < 0.001, W + ' Undo of free text charge');
  ok(await noHScroll(p), W + ' no sideways scroll on Billing');
  await b.close();
}
S.done(); if (S.errs.length) { console.log('ERRORS', S.errs); }
