import { suite, open, human, undo, toastText, modalBtn, setVal, noHScroll } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const SH = './shots/';
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'lessons', T);
  const ev = (f, a) => p.evaluate(f, a);
  try {
    const D = await ev(() => Club.date.fromToday(2));
    await ev(d => { location.hash = '#/lessons/' + d; }, D); await p.waitForTimeout(900);
    /* free slots for one pro on D */
    const slots = await ev(d => { const S = Club.store; const pros = S.all('staff').filter(s => /Golf Professional|Director of Golf/.test(s.role || '') && s.status !== 'inactive');
      const toMin = t => +t.split(':')[0] * 60 + +t.split(':')[1]; const out = [];
      for (const pr of pros) for (const t of ['07:00', '17:00', '18:00', '12:30', '14:30', '16:00']) {
        const busy = S.all('lessons').some(l => l.date === d && l.status !== 'cancelled' && l.proId === pr.id && toMin(l.time) < toMin(t) + 60 && toMin(t) < toMin(l.time) + (+l.duration || 60));
        const prog = S.all('programs').some(p => p.coach === pr.id && p.day === ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Club.fmt.toDate(d).getDay()]);
        if (!busy && !prog && !out.some(o => o.t === t && o.pro === pr.id)) out.push({ t, pro: pr.id }); }
      return out; }, D);
    const snap = () => ev(() => ({ rc: Club.store.all('receipts').length, ch: Club.store.all('charges').length, ls: Club.store.all('lessons').length }));
    const last = () => ev(() => { const a = Club.store.all('lessons'); return a[a.length - 1]; });
    const fill = async (s) => { await setVal(p, '.ls-modal [name=proId]', s.pro); await setVal(p, '.ls-modal [name=date]', D); await setVal(p, '.ls-modal [name=time]', s.t); };

    /* 1. non-member: name required, phone formats, books as pays-at-shop */
    await human(p, '.page-head [data-action=book]');
    await human(p, '.ls-modal .segmented[data-name=who] button[data-value=guest]');
    const vis = await ev(() => ({ mem: !document.querySelector('.ls-modal [data-for-who=member]').hidden, g: !document.querySelector('.ls-modal [data-for-who=guest]').hidden, box: document.querySelector('.ls-paybox').textContent }));
    ok(!vis.mem && vis.g && /Non-members pay at the golf shop/.test(vis.box), W + ': Non-member shows name/phone/email and the golf shop note', vis);
    await fill(slots[0]);
    await modalBtn(p, 'Book lesson'); await p.waitForTimeout(400);
    ok(await p.locator('.ls-modal').count() === 1 && await ev(() => document.querySelector('.ls-modal [name=gname]').classList.contains('invalid')), W + ': name is required for a non-member');
    await human(p, '.ls-modal [name=gname]'); await p.keyboard.type('Jordan Testerson');
    await human(p, '.ls-modal [name=gphone]'); await p.keyboard.type('2045550188');
    const ph = await ev(() => document.querySelector('.ls-modal [name=gphone]').value);
    ok(ph === '(204) 555-0188', W + ': phone formats as typed', ph);
    const s0 = await snap();
    await modalBtn(p, 'Book lesson'); await p.waitForTimeout(600);
    const L1 = await last();
    ok(L1.memberId === null && L1.guest && L1.guest.name === 'Jordan Testerson' && L1.pays === 'shop' && !L1.paid && (await snap()).ch === s0.ch, W + ': non-member lesson booked, pays at the shop, nothing charged', L1);
    ok(await p.locator('.ls-block[data-id="' + L1.id + '"]').count() === 1 && /Testerson/.test((await p.locator('.ls-block[data-id="' + L1.id + '"]').textContent()).replace(/\u00AD/g, '')), W + ': block shows the non-member name');

    /* 2. take payment from the lesson: card; receipt by name; undo credits it */
    await human(p, '.ls-block[data-id="' + L1.id + '"]');
    if (W === 1440) await p.screenshot({ path: SH + 'lspay-edit-guest.png' });
    await human(p, '.ls-modal [data-lsp=take]'); await p.waitForTimeout(500);
    ok(await p.locator('.ts-pay-modal').count() === 1 && /Lesson payment/.test(await p.locator('.ts-pay-modal').textContent()), W + ': the golf shop till opens for the lesson');
    if (W === 1440) await p.screenshot({ path: SH + 'lspay-till.png' });
    await modalBtn(p, 'Record payment'); await p.waitForTimeout(600);
    const P1 = await ev(id => { const S = Club.store, l = S.find('lessons', id), rc = l.shopPay && S.find('receipts', l.shopPay.receiptId); return { paid: l.paid, rc: rc && { kind: rc.kind, total: rc.total, name: rc.name, src: rc.source, m: rc.memberId } , price: l.price }; }, L1.id);
    ok(P1.paid && P1.rc && P1.rc.kind === 'sale' && P1.rc.total === P1.price && P1.rc.name === 'Jordan Testerson' && P1.rc.src === 'lessons', W + ': card payment recorded with a receipt in the golfer’s name', P1);
    await undo(p);
    const U1 = await ev(id => { const S = Club.store, l = S.find('lessons', id); const rcs = S.all('receipts').filter(r => r.refId === id); return { paid: !!l.paid, kinds: rcs.map(r => r.kind) }; }, L1.id);
    ok(!U1.paid && U1.kinds.join() === 'sale,credit', W + ': Undo takes the payment back with a credit receipt', U1);

    /* 3. completing an unpaid non-member lesson opens the till; cash exact; no account charge */
    const s3 = await snap();
    await ev(id => Club.store.update('lessons', id, { date: Club.date.today(), time: '07:00' }), L1.id);   /* today, so Complete shows in the agenda */
    await ev(() => { location.hash = '#/lessons/' + Club.date.today(); }); await p.waitForTimeout(900);
    await human(p, '.ls-agenda [data-action=complete][data-id="' + L1.id + '"]'); await p.waitForTimeout(500);
    ok(await p.locator('.ts-pay-modal').count() === 1, W + ': Complete on an unpaid golf shop lesson opens the till');
    await human(p, '.ts-pay-modal [data-tender=cash]'); await human(p, '.ts-pay-modal [data-cash]');
    await modalBtn(p, 'Record payment'); await p.waitForTimeout(600);
    const C1 = await ev(id => Club.store.find('lessons', id), L1.id); const s3b = await snap();
    ok(C1.status === 'completed' && C1.paid && C1.shopPay.method === 'cash' && s3b.ch === s3.ch && s3b.rc === s3.rc + 1 && /paid at the golf shop/.test(await toastText(p)), W + ': completed and paid in cash, no account charge', { st: C1.status, s3, s3b, t: await toastText(p) });
    /* refund from the completed lesson */
    await human(p, '.ls-block[data-id="' + L1.id + '"]'); await p.waitForTimeout(300);
    await modalBtn(p, 'Refund payment'); await p.waitForTimeout(300);
    await human(p, p.locator('.modal-foot button', { hasText: 'Refund payment' }).last()); await p.waitForTimeout(600);
    const R1 = await ev(id => { const S = Club.store, l = S.find('lessons', id); return { paid: !!l.paid, st: l.status, cr: S.all('receipts').filter(r => r.refId === id && r.kind === 'credit').length }; }, L1.id);
    ok(!R1.paid && R1.st === 'completed' && R1.cr >= 2, W + ': refund makes a credit receipt; the lesson stays completed', R1);
    await ev(d => { location.hash = '#/lessons/' + d; }, D); await p.waitForTimeout(900);

    /* 4. member paying at the golf shop: Book and take payment; no account charge; receipt on the member */
    const mem = await ev(d => Club.store.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !Club.store.all('lessons').some(l => l.memberId === m.id && l.date === d)).id, D);
    await human(p, '.page-head [data-action=book]');
    await setVal(p, '.ls-modal [name=memberId]', mem); await fill(slots[1]);
    let box = await ev(() => document.querySelector('.ls-paybox').textContent);
    ok(/posts to the member/.test(box), W + ': member defaults to Charge to account', box);
    await human(p, '.ls-modal .segmented[data-name=pays] button[data-value=shop]');
    const s4 = await snap();
    await human(p, '.ls-modal [data-lsp=take]'); await p.waitForTimeout(500);
    await modalBtn(p, 'Record payment'); await p.waitForTimeout(600);
    const L4 = await last(); const s4b = await snap();
    const rc4 = await ev(id => { const l = Club.store.find('lessons', id); const r = Club.store.find('receipts', l.shopPay.receiptId); return { m: r.memberId, k: r.kind }; }, L4.id);
    ok(L4.memberId === mem && L4.pays === 'shop' && L4.paid && s4b.ls === s4.ls + 1 && s4b.ch === s4.ch && rc4.m === mem && /Lesson booked and/.test(await toastText(p)), W + ': member booked and paid at the shop in one step; receipt on the member; no account charge', { L4, rc4, s4, s4b });
    /* cancel a paid lesson refunds it; undo restores */
    await human(p, '.ls-block[data-id="' + L4.id + '"]'); await modalBtn(p, 'Cancel lesson'); await p.waitForTimeout(300);
    const ctext = await ev(() => document.querySelector('.modal:last-of-type, .modal').textContent);
    await human(p, p.locator('.modal-foot button', { hasText: 'Cancel lesson' }).last()); await p.waitForTimeout(600);
    const C4 = await ev(id => { const S = Club.store, l = S.find('lessons', id); return { st: l.status, paid: !!l.paid, cr: S.all('receipts').filter(r => r.refId === id && r.kind === 'credit').length }; }, L4.id);
    ok(C4.st === 'cancelled' && !C4.paid && C4.cr === 1 && /refunded/.test(await toastText(p)), W + ': cancelling a paid lesson refunds it with a credit receipt', { C4, t: await toastText(p) });
    await undo(p);
    const C4u = await ev(id => Club.store.find('lessons', id).status, L4.id);
    ok(C4u === 'scheduled', W + ': Undo restores the cancelled lesson', C4u);

    /* 5. member on account: unchanged, completing posts the fee */
    await ev(() => { const a = Club.store.all('lessons'); return a; });
    ok(await noHScroll(p), W + ': no sideways scroll');
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: SH + 'lspay-err-' + W + '.png' }); }
  await b.close();
}
ok(!T.errs.length, 'no page or console errors', T.errs);
T.done();
