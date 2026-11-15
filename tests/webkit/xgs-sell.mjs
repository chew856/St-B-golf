import { suite, human, open, undo, toastText, modalBtn, noHScroll } from './xb-lib.mjs';
const S = suite(); const { ok } = S;
const clear = p => p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
const closeAll = async p => { for (let i = 0; i < 4 && await p.locator('.overlay').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(350); } };
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'giftcards', S);
  await p.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  /* 1. Member, charged to account */
  await human(p, '[data-action=gs-sell]');
  ok(await p.locator('.gs-sell').count() === 1, W + ' sell dialog opens');
  await human(p, '.gs-seg[data-name=amt] button[data-value="100"]');
  await human(p, '#gs-sell-cust'); await p.keyboard.type('Nerada', { delay: 30 }); await p.waitForTimeout(250);
  await human(p, '.gs-cust-opt[data-id="mem_1003"]');
  const payDef = await p.evaluate(() => document.querySelector('.gs-seg[data-name=pay] button.active').dataset.value);
  ok(payDef === 'account', W + ' a member buyer defaults to Charge to member account', payDef);
  await human(p, '[name=toName]'); await p.keyboard.type('Sam Green', { delay: 10 });
  await human(p, '[name=toEmail]'); await p.keyboard.type('sam@example.com', { delay: 5 });
  await human(p, '[name=message]'); await p.keyboard.type('Happy birthday', { delay: 5 });
  const btnTxt = await p.locator('.modal-foot .btn-primary').last().textContent();
  ok(/Charge \$100\.00 to account/.test(btnTxt), W + ' button says what will happen', btnTxt);
  await p.screenshot({ path: 'gs-sell-' + W + '.png' });
  ok(await noHScroll(p), W + ' no sideways scroll with the dialog');
  const m0 = await p.evaluate(() => ({ bal: Club.store.find('members', 'mem_1003').balance, n: Club.giftcards.all().length }));
  await human(p, p.locator('.modal-foot .btn-primary').last());
  const s1 = await p.evaluate(() => { const c = Club.giftcards.all().slice(-1)[0]; const r = Club.receipts.get(c.payment.receiptId); const ch = Club.store.find('charges', c.payment.chargeId);
    return { src: c.source, amt: c.amount, buyer: c.buyer.memberId, to: c.recipient.name, msg: c.message, from: c.from, bal: Club.store.find('members', 'mem_1003').balance, ch: ch && ch.amount, chM: ch && ch.memberId, rc: r && { mem: r.memberId, src: r.source, total: r.total, ch: r.channel }, portal: Club.receipts.forMember('mem_1003').some(x => x.id === (r && r.id)), id: c.id }; });
  ok(s1.src === 'staff' && s1.amt === 100 && s1.buyer === 'mem_1003' && s1.to === 'Sam Green' && s1.msg === 'Happy birthday' && s1.ch === 100 && s1.chM === 'mem_1003' && Math.abs(s1.bal - m0.bal - 100) < 0.001 && s1.rc && s1.rc.mem === 'mem_1003' && s1.rc.src === 'giftcards' && s1.portal,
    W + ' account sale: card, $100 charge to the member, receipt in their portal receipts', s1);
  ok(await p.locator('.gs-sold').count() === 1 && /Gift card sold/.test(await p.locator('.gs-sold').textContent()), W + ' sold dialog shows the card');
  await p.screenshot({ path: 'gs-sold-' + W + '.png' });
  await human(p, p.locator('.gs-sold .modal-foot button', { hasText: 'Print gift card' }));
  ok(await p.evaluate(() => window.__prints === 1 && document.body.classList.contains('rc-printing')), W + ' Print gift card prints');
  await human(p, p.locator('.gs-sold .modal-foot button', { hasText: 'Receipt' })); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /Gift card/.test([...document.querySelectorAll('.overlay')].pop().textContent)), W + ' Receipt opens');
  await closeAll(p);
  ok(/sold, \$100\.00 charged to Dave Nerada/.test(await toastText(p)), W + ' toast names the account charge', await toastText(p));
  await undo(p);
  const u1 = await p.evaluate(id => { const c = Club.giftcards.get(id); return { st: c.status, bal: c.balance, mbal: Club.store.find('members', 'mem_1003').balance, rev: !!Club.store.find('charges', c.payment.chargeId).reversedBy, credit: Club.receipts.forMember('mem_1003').some(r => r.kind === 'credit' && r.source === 'giftcards' && r.refId === id) }; }, s1.id);
  ok(u1.st === 'void' && u1.bal === 0 && Math.abs(u1.mbal - m0.bal) < 0.001 && u1.rev && u1.credit, W + ' Undo: card voided (kept), charge reversed with a credit receipt, balance back to the cent', u1);
  await clear(p);

  /* 2. Validation then walk-in paying cash at the counter (custom amount) */
  await human(p, '[data-action=gs-sell]');
  await human(p, '.gs-seg[data-name=amt] button[data-value="custom"]'); await p.keyboard.type('7');
  await human(p, '.gs-seg[data-name=who] button[data-value="walk"]');
  ok(await p.evaluate(() => document.querySelector('.gs-seg[data-name=pay] button[data-value=account]').disabled), W + ' walk-in: account option disabled');
  await human(p, p.locator('.modal-foot .btn-primary').last());
  const errs = await p.evaluate(() => [...document.querySelectorAll('.gs-sell .field-error')].map(e => e.textContent));
  ok(errs.length === 2 && /whole amount from \$10 to \$500/.test(errs[0]) && /buyer’s name/.test(errs[1]), W + ' validation: amount range and buyer name', errs);
  await p.fill('[name=custom]', ''); await human(p, '[name=custom]'); await p.keyboard.type('75');
  await human(p, '[name=buyerName]'); await p.keyboard.type('Pat Walker', { delay: 10 });
  ok(/Take payment · \$75\.00/.test(await p.locator('.modal-foot .btn-primary').last().textContent()), W + ' counter button label');
  await human(p, p.locator('.modal-foot .btn-primary').last()); await p.waitForTimeout(300);
  ok(await p.locator('.ts-pay').count() === 1, W + ' till opens');
  await p.screenshot({ path: 'gs-till-' + W + '.png' });
  await human(p, '.ts-pay [data-tender="cash"]'); await human(p, '.ts-pay [data-cash]');
  await modalBtn(p, 'Record payment'); await p.waitForTimeout(400);
  const s2 = await p.evaluate(() => { const c = Club.giftcards.all().slice(-1)[0]; const r = Club.receipts.get(c.payment.receiptId);
    return { id: c.id, amt: c.amount, bal: c.balance, buyer: c.buyer.name, pm: c.payment.method, rc: { name: r.name, method: r.method, total: r.total, tenders: r.tenders, ch: r.channel, src: r.source }, overlays: document.querySelectorAll('.overlay').length, sold: !!document.querySelector('.gs-sold') }; });
  ok(s2.amt === 75 && s2.bal === 75 && s2.buyer === 'Pat Walker' && s2.pm === 'cash' && s2.rc.name === 'Pat Walker' && s2.rc.method === 'cash' && s2.rc.total === 75 && s2.rc.ch === 'counter' && s2.rc.src === 'giftcards' && JSON.stringify(s2.rc.tenders) === '[{"method":"cash","amount":75}]' && s2.overlays === 1 && s2.sold,
    W + ' walk-in cash sale: card $75, cash receipt to Pat Walker, only the sold dialog left open', s2);
  await closeAll(p);
  await undo(p);
  const u2 = await p.evaluate(id => ({ st: Club.giftcards.get(id).status, credit: Club.receipts.forRef('giftcards', id).filter(r => r.kind === 'credit').length, t: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|') }), s2.id);
  ok(u2.st === 'void' && u2.credit === 1 && /Give back the cash/.test(u2.t), W + ' Undo cash sale: voided, credit receipt, give back the cash', u2);
  await clear(p);

  /* 3. Paid with another gift card in the till; Undo puts its balance back */
  const pay = await p.evaluate(() => Club.giftcards.purchase({ amount: 200, recipient: { name: 'Payer' }, buyer: { name: 'X' }, source: 'staff', pay: { method: 'card', brand: 'visa', last4: '4242' } }).card);
  await human(p, '[data-action=gs-sell]');
  await human(p, '.gs-seg[data-name=amt] button[data-value="50"]');
  await human(p, '#gs-sell-cust'); await p.keyboard.type('Fontaine', { delay: 30 }); await p.waitForTimeout(250);
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await human(p, p.locator('.modal-foot .btn-primary').last()); await p.waitForTimeout(300);
  await human(p, '.ts-pay [data-gc-till=add]'); await p.waitForTimeout(300);
  await human(p, '.gc-till-in'); await p.keyboard.type(pay.code, { delay: 10 }); await modalBtn(p, 'Apply'); await p.waitForTimeout(300);
  await modalBtn(p, 'Record payment'); await p.waitForTimeout(400);
  const s3 = await p.evaluate(pid => { const c = Club.giftcards.all().slice(-1)[0]; const r = Club.receipts.get(c.payment.receiptId); return { id: c.id, pp: c.buyer.publicPlayerId, payBal: Club.giftcards.get(pid).balance, rc: { pp: r.publicPlayerId, tenders: r.tenders, label: r.methodLabel }, inPublic: Club.receipts.forPublic(c.buyer.publicPlayerId).some(x => x.id === r.id) }; }, pay.id);
  ok(s3.pp && s3.payBal === 150 && s3.rc.pp === s3.pp && s3.inPublic && s3.rc.tenders[0].method === 'gift' && s3.rc.tenders[0].amount === 50, W + ' public golfer paid by gift card: paying card down $50, receipt in their account', s3);
  await closeAll(p); await undo(p);
  const u3 = await p.evaluate(([id, pid]) => ({ st: Club.giftcards.get(id).status, payBal: Club.giftcards.get(pid).balance }), [s3.id, pay.id]);
  ok(u3.st === 'void' && u3.payBal === 200, W + ' Undo: new card voided, paying card back to $200', u3);
  ok(await noHScroll(p), W + ' page no sideways scroll');
  await p.screenshot({ path: 'gs-page-' + W + '.png' });
  await b.close();
}
S.done(); if (S.errs.length) console.log('ERRORS', S.errs);
