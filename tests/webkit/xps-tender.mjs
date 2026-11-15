import { suite, human, open, undo, toastText, modalBtn, noHScroll } from './xb-lib.mjs';
const S = suite(); const { ok } = S;
const lbl = p => p.evaluate(() => document.querySelector('.ps-complete').textContent.trim());
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'proshop/register', S);
  await p.evaluate(() => { const s = document.querySelector('#ps-staff'); s.value = 'stf_23'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  const order = await p.evaluate(() => [...document.querySelectorAll('.ps-tenders [data-tender]')].map(b => b.dataset.tender + (b.classList.contains('active') ? '*' : '')).join(','));
  ok(order === 'Card*,Cash,Gift card,Member account', W + ' tenders Card (default), Cash, Gift card, Member account', order);
  const tile = await p.evaluate(() => [...document.querySelectorAll('.ps-tile:not(.out)')][0].dataset.add);
  await human(p, '.ps-tile[data-add="' + tile + '"]');
  const tot = await p.evaluate(() => document.querySelector('.ps-grand.num').textContent.trim());
  ok((await lbl(p)) === 'Charge ' + tot + ' by card', W + ' button: Charge ' + tot + ' by card', await lbl(p));
  await human(p, '[data-tender="Cash"]'); ok(/^Take \$[\d,.]+ cash$/.test(await lbl(p)), W + ' Cash label', await lbl(p));
  await human(p, '[data-tender="Member account"]'); ok((await lbl(p)) === 'Charge ' + tot + ' to account', W + ' account label', await lbl(p));
  await p.screenshot({ path: 'ps-tender-acct-' + W + '.png' });
  /* Gift card tender: a $20 card, the rest by card */
  const gc = await p.evaluate(() => Club.giftcards.purchase({ amount: 20, recipient: { name: 'T' }, buyer: { name: 'T' }, source: 'staff', pay: { method: 'card', brand: 'visa', last4: '4242' } }).card);
  await human(p, '[data-tender="Gift card"]'); await p.waitForTimeout(300);
  ok(await p.locator('.gc-till-in').count() === 1, W + ' Gift card tender opens the code dialog');
  await human(p, '.gc-till-in'); await p.keyboard.type(gc.code, { delay: 10 }); await modalBtn(p, 'Apply'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ t: document.querySelector('.ps-tenders .active').dataset.tender, l: document.querySelector('.ps-complete').textContent.trim() }));
  ok(after.t === 'Card' && /^Charge \$[\d,.]+ by card$/.test(after.l), W + ' partial gift card: rest goes to Card, label shows the rest', after);
  await p.screenshot({ path: 'ps-tender-gift-' + W + '.png' });
  const n0 = await p.evaluate(() => Club.store.all('sales').length);
  await human(p, '[data-action=complete]'); await p.waitForTimeout(400);
  const sale = await p.evaluate(() => { const s = Club.store.all('sales').slice(-1)[0]; const r = Club.store.all('receipts').slice(-1)[0]; return { pay: s.payment, g: s.giftAmount, rc: r.tenders, name: r.name, tender: document.querySelector('.ps-tenders .active').dataset.tender }; });
  ok(sale.pay === 'Card' && sale.g === 20 && sale.rc.length === 2 && sale.name === 'Walk-in customer' && sale.tender === 'Card', W + ' walk-in sale: $20 gift card + card, receipt split, next sale starts on Card', sale);
  ok(/completed/.test(await toastText(p)), W + ' completed toast with Undo');
  if (W < 900) ok(await p.evaluate(() => !document.querySelector('.ps-ticket-bar').classList.contains('show') || !document.querySelector('.ps-tile')), W + ' ticket bar hidden while the ticket is on screen');
  await undo(p);
  ok(await p.evaluate(id => Club.giftcards.get(id).balance === 20, gc.id), W + ' Undo puts $20 back on the gift card');
  ok(await noHScroll(p), W + ' no sideways scroll');
  await b.close();
}
S.done(); if (S.errs.length) console.log('ERRORS', S.errs);
