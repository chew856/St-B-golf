import { suite, open, human, lessonBlock, undo, toastText, modalBtn, noHScroll, setVal, money } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'lessons', T);
  try {
  const ev = (f, a) => p.evaluate(f, a);
  /* a future, uncharged scheduled lesson with a price, and a second one to cancel */
  const pick = await ev(() => { const t = Club.date.today(), S = Club.store; const now = new Date().getHours() * 60 + new Date().getMinutes();
    const ok = l => l.status === 'scheduled' && !l.charged && +l.price > 0 && (l.date > t) && l.date <= Club.date.fromToday(6);
    const ls = S.all('lessons').filter(ok); return ls.length > 1 ? [ls[0].id, ls[1].id] : null; });
  ok(!!pick, W + ': found scheduled lessons', pick);
  const [L, L2] = pick;
  const info = await ev(id => { const l = Club.store.find('lessons', id); return { date: l.date, memberId: l.memberId, price: l.price }; }, L);
  await p.evaluate(d => { location.hash = '#/lessons/' + d; }, info.date); await p.waitForTimeout(900);

  /* 1. book, then undo */
  const n0 = await ev(() => Club.store.all('lessons').length);
  await human(p, '.ls-sched-head [data-action=book]');
  const slot = await ev(() => { const S = Club.store, d = Club.date.fromToday(1); const pros = S.all('staff').filter(s => /Golf Professional|Director of Golf/.test(s.role || '') && s.status !== 'inactive');
    const toMin = t => +t.split(':')[0] * 60 + +t.split(':')[1];
    for (const t of ['17:00', '17:15', '17:30', '16:00', '15:00', '14:00', '12:00']) for (const pr of pros) {
      const busy = S.all('lessons').some(l => l.date === d && l.status !== 'cancelled' && l.proId === pr.id && toMin(l.time) < toMin(t) + 60 && toMin(t) < toMin(l.time) + (+l.duration || 60));
      const prog = S.all('programs').some(p => p.coach === pr.id); if (!busy && !prog) return { d, t, pro: pr.id }; }
    for (const t of ['17:00', '17:30']) for (const pr of pros) { const busy = S.all('lessons').some(l => l.date === d && l.status !== 'cancelled' && l.proId === pr.id && toMin(l.time) < toMin(t) + 60 && toMin(t) < toMin(l.time) + 60); if (!busy) return { d, t, pro: pr.id }; }
    return null; });
  const mem = await ev(() => Club.store.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !Club.store.all('lessons').some(l => l.memberId === m.id && l.date === Club.date.fromToday(1))).id);
  await setVal(p, '.ls-modal [name=proId]', slot.pro); await setVal(p, '.ls-modal [name=memberId]', mem); await setVal(p, '.ls-modal [name=date]', slot.d); await setVal(p, '.ls-modal [name=time]', slot.t);
  await modalBtn(p, 'Book lesson'); await p.waitForTimeout(600);
  const n1 = await ev(() => Club.store.all('lessons').length);
  ok(n1 === n0 + 1 && /Lesson booked/.test(await toastText(p)), W + ': lesson booked, toast with Undo', { n0, n1, slot, t: await toastText(p) });
  await undo(p);
  ok(await ev(() => Club.store.all('lessons').length) === n0 && /Booking removed/.test(await toastText(p)), W + ': Undo removes the booking');
  await p.evaluate(d => { location.hash = '#/lessons/' + d; }, info.date); await p.waitForTimeout(900);

  /* 2. complete with a fee, then undo */
  const m0 = await money(p, [info.memberId]);
  await lessonBlock(p, L); await modalBtn(p, 'Mark completed'); await p.waitForTimeout(500);
  const m1 = await money(p, [info.memberId]); const st1 = await ev(id => Club.store.find('lessons', id), L);
  ok(st1.status === 'completed' && st1.charged && (+m1.bal[0] - +m0.bal[0]).toFixed(2) === (+info.price).toFixed(2) && m1.charges === m0.charges + 1 && m1.receipts === m0.receipts + 1, W + ': completed, fee posted with a receipt', { m0, m1, st1 });
  await undo(p);
  const m2 = await money(p, [info.memberId]); const st2 = await ev(id => { const S = Club.store; const ch = S.all('charges').filter(c => c.refId === id); return { l: S.find('lessons', id), ch: ch.map(c => [c.amount, !!c.reversedBy, !!c.reverses]), rc: S.all('receipts').filter(r => r.refId === id).map(r => r.kind) }; }, L);
  ok(st2.l.status === 'scheduled' && !st2.l.charged && m2.bal[0] === m0.bal[0] && m2.charges === m0.charges + 2 && m2.receipts === m0.receipts + 2 && JSON.stringify(st2.ch) === JSON.stringify([[info.price, true, false], [-info.price, false, true]]) && st2.rc.join() === 'sale,credit',
    W + ': Undo: back to booked, balance to the cent, reversal charge and credit receipt, nothing deleted', { m0, m2, st2, t: await toastText(p) });
  ok(/credited back/.test(await toastText(p)), W + ': undo toast says the fee was credited back');

  /* 3. complete again, then the permanent step back from the lesson details */
  await lessonBlock(p, L); await modalBtn(p, 'Mark completed'); await p.waitForTimeout(500);
  const m3 = await money(p, [info.memberId]);
  await lessonBlock(p, L);
  const hasBack = await p.locator('.modal-foot button', { hasText: 'Back to booked' }).count();
  await modalBtn(p, 'Back to booked'); await p.waitForTimeout(500);
  const m4 = await money(p, [info.memberId]); const st4 = await ev(id => Club.store.find('lessons', id), L);
  ok(hasBack === 1 && st4.status === 'scheduled' && !st4.charged && m4.bal[0] === m0.bal[0] && m4.charges === m3.charges + 1 && m4.receipts === m3.receipts + 1, W + ': Back to booked reverses the fee (credit charge and receipt)', { m3, m4, st4 });
  await undo(p);
  const m5 = await money(p, [info.memberId]); const st5 = await ev(id => Club.store.find('lessons', id), L);
  ok(st5.status === 'completed' && m5.bal[0] === m3.bal[0] && m5.charges === m4.charges + 1, W + ': Undo of the step back completes it again and re-posts the fee', { m5, st5 });

  /* 4. cancel, then undo */
  await lessonBlock(p, L2); await modalBtn(p, 'Cancel lesson'); await p.waitForTimeout(300); await modalBtn(p, 'Cancel lesson'); await p.waitForTimeout(500);
  const c1 = await ev(id => Club.store.find('lessons', id).status, L2);
  await undo(p);
  ok(c1 === 'cancelled' && await ev(id => Club.store.find('lessons', id).status, L2) === 'scheduled', W + ': cancel, then Undo restores the lesson', c1);

  /* 5. rate card, undo, and the guard when saved again since */
  await human(p, '.ls-acc-rates .pk-acc-head'); await human(p, '[data-action=rates]');
  await setVal(p, '.modal [name=rate_0]', '105'); await modalBtn(p, 'Save rate card');
  const r1 = await ev(() => Club.store.getObj('lessonRates').rates['Private lesson']);
  await undo(p);
  const r2 = await ev(() => Club.store.getObj('lessonRates').rates['Private lesson']);
  ok(r1 === 105 && r2 === 95, W + ': rate card saved, Undo puts the old rates back', { r1, r2 });
  await human(p, '[data-action=rates]'); await setVal(p, '.modal [name=rate_0]', '110'); await modalBtn(p, 'Save rate card'); await p.waitForTimeout(300);
  await human(p, '[data-action=rates]'); await setVal(p, '.modal [name=rate_0]', '120'); await modalBtn(p, 'Save rate card'); await p.waitForTimeout(300);
  await human(p, p.locator('.toast.has-act:not(.leaving) .toast-act').first()); await p.waitForTimeout(300);
  ok(await ev(() => Club.store.getObj('lessonRates').rates['Private lesson']) === 120 && /changed since/.test(await toastText(p)), W + ': an older rate card Undo is refused after a newer save');
  await undo(p);
  ok(await ev(() => Club.store.getObj('lessonRates').rates['Private lesson']) === 110, W + ': the newest save still undoes');

  /* 6. programs: create, enrol with a fee, remove from roster, delete */
  const pg0 = await ev(() => Club.store.all('programs').length);
  await human(p, '.page-head [data-action=new-program]'); await setVal(p, '.modal [name=name]', 'Test clinic'); await modalBtn(p, 'Create program'); await p.waitForTimeout(400);
  const pg1 = await ev(() => Club.store.all('programs').length); await undo(p);
  ok(pg1 === pg0 + 1 && await ev(() => Club.store.all('programs').length) === pg0, W + ': program created, Undo removes it', { pg0, pg1 });
  const em = await ev(() => { const p = Club.store.find('programs', 'prg_winter'); return Club.store.all('members').find(m => m.status === 'active' && p.enrolled.indexOf(m.id) < 0).id; });
  const e0 = await money(p, [em]); const roster0 = await ev(() => Club.store.find('programs', 'prg_winter').enrolled.slice());
  await human(p, '.ls-acc-programs .pk-acc-head'); await human(p, '[data-action=enroll][data-id=prg_winter]');
  await setVal(p, '.modal #ls_enr', em); await modalBtn(p, 'Enroll member'); await p.waitForTimeout(400);
  const e1 = await money(p, [em]);
  ok((+e1.bal[0] - +e0.bal[0]).toFixed(2) === '240.00' && await ev(id => Club.store.find('programs', 'prg_winter').enrolled.includes(id), em), W + ': enrolled with the program fee posted', { e0, e1 });
  await undo(p);
  const e2 = await money(p, [em]);
  ok(e2.bal[0] === e0.bal[0] && e2.charges === e0.charges + 2 && e2.receipts === e0.receipts + 2 && JSON.stringify(await ev(() => Club.store.find('programs', 'prg_winter').enrolled)) === JSON.stringify(roster0), W + ': Undo takes them off and reverses the fee to the cent', { e0, e2 });
  await human(p, '[data-action=roster][data-id=prg_winter]'); await p.waitForTimeout(400);
  await human(p, '.drawer [data-action=unenroll]'); await modalBtn(p, 'Remove member'); await p.waitForTimeout(400);
  const after = await ev(() => Club.store.find('programs', 'prg_winter').enrolled.length);
  await undo(p);
  ok(after === roster0.length - 1 && JSON.stringify(await ev(() => Club.store.find('programs', 'prg_winter').enrolled)) === JSON.stringify(roster0) && await p.locator('.drawer [data-action=unenroll]').count() === roster0.length, W + ': removed from the roster, Undo puts them back (drawer redrawn)', { after });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const idx0 = await ev(() => Club.store.all('programs').findIndex(p => p.id === 'prg_short'));
  await human(p, '[data-action=edit-program][data-id=prg_short]'); await modalBtn(p, 'Delete program'); await p.waitForTimeout(300); await modalBtn(p, 'Delete program'); await p.waitForTimeout(400);
  const gone = await ev(() => !Club.store.find('programs', 'prg_short'));
  await undo(p);
  ok(gone && await ev(() => Club.store.all('programs').findIndex(p => p.id === 'prg_short')) === idx0, W + ': program deleted, Undo restores it in place with its roster');

  /* 7. closed day: the money step back is refused */
  if (W === 1440) {
    await lessonBlock(p, L);
    await ev(() => { window.__ic = Club.accounting.isClosed; Club.accounting.isClosed = () => true; });
    await modalBtn(p, 'Back to booked'); await p.waitForTimeout(300);
    ok(await ev(id => Club.store.find('lessons', id).status, L) === 'completed' && /closed in Accounting/.test(await toastText(p)), W + ': step back refused when today is closed');
    await ev(() => { Club.accounting.isClosed = window.__ic; }); await p.keyboard.press('Escape');
  }
  ok(await noHScroll(p), W + ': no horizontal scroll');
  await p.screenshot({ path: 'xb-lessons-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xb-lessons-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
