import { suite, open, human, undo, toastText, modalBtn, noHScroll, setVal, money } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const go = async (p, h) => { await p.evaluate(h => { location.hash = '#/' + h; }, h); await p.waitForTimeout(800); };
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'events', T);
  const ev = (f, a) => p.evaluate(f, a);
  const st = (c, id) => ev(([c, id]) => { const d = Club.store.find(c, id); return d ? d.status : null; }, [c, id]);
  try {
    /* 1. register with a fee, undo */
    const pk = await ev(() => { const S = Club.store, t = Club.date.today();
      for (const e of S.all('events').filter(e => e.status === 'published' && e.date >= t && +e.price > 0 && ['Tournament', 'Member-Guest', 'League'].indexOf(e.type) < 0)) {
        const seats = e.registrations.reduce((a, r) => a + 1 + (+r.guests || 0), 0); const m = S.all('members').find(m => m.status === 'active' && !e.registrations.some(r => r.memberId === m.id));
        if (m && e.capacity - seats >= 2) return [e.id, m.id, e.price]; } return null; });
    const [E, mid, price] = pk;
    await go(p, 'events/' + E);
    const r0 = await ev(e => Club.store.find('events', e).registrations.length, E); const m0 = await money(p, [mid]);
    await human(p, '[data-action=register]'); await setVal(p, '.ev-reg-form [name=memberId]', mid); await setVal(p, '.ev-reg-form [name=guests]', '1');
    await modalBtn(p, 'Register member'); await p.waitForTimeout(500);
    const m1 = await money(p, [mid]);
    ok((+m1.bal[0] - +m0.bal[0]).toFixed(2) === (price * 2).toFixed(2) && await ev(e => Club.store.find('events', e).registrations.length, E) === r0 + 1, W + ': registered, fee posted', { m0, m1 });
    await undo(p);
    const m2 = await money(p, [mid]);
    ok(m2.bal[0] === m0.bal[0] && m2.charges === m0.charges + 2 && m2.receipts === m0.receipts + 2 && await ev(e => Club.store.find('events', e).registrations.length, E) === r0, W + ': Undo removes it and reverses the fee to the cent (reversal + credit receipt)', { m2 });
    /* 2. remove a registration (credit posted), undo charges again */
    await human(p, '[data-action=register]'); await setVal(p, '.ev-reg-form [name=memberId]', mid); await modalBtn(p, 'Register member'); await p.waitForTimeout(500);
    const m3 = await money(p, [mid]);
    await human(p, '[data-action=unregister][data-id="' + mid + '"]'); await modalBtn(p, 'Remove registration'); await p.waitForTimeout(500);
    const m4 = await money(p, [mid]);
    ok(m4.bal[0] === m0.bal[0] && m4.charges === m3.charges + 1, W + ': registration removed, credit posted', { m3, m4 });
    await undo(p);
    const m5 = await money(p, [mid]);
    ok(m5.bal[0] === m3.bal[0] && m5.charges === m4.charges + 1 && m5.receipts === m4.receipts + 1 && await ev(([e, id]) => Club.store.find('events', e).registrations.some(r => r.memberId === id), [E, mid]) && /charged again/.test(await toastText(p)), W + ': Undo re-registers and charges the credit again', { m5, t: await toastText(p) });
    /* 3. edit save, undo */
    const title0 = await ev(e => Club.store.find('events', e).title, E);
    await human(p, '.ev-head-actions [data-action=edit]'); await setVal(p, '.ev-form [name=title]', 'Season-End Banquet test'); await modalBtn(p, 'Save event'); await p.waitForTimeout(500);
    const t1 = await ev(e => Club.store.find('events', e).title, E); await undo(p);
    ok(t1 === 'Season-End Banquet test' && await ev(e => Club.store.find('events', e).title, E) === title0, W + ': event saved, Undo puts the old details back');
    /* 4. publish, undo */
    await go(p, 'events/evt_19'); await human(p, '[data-action=publish]'); const s1 = await st('events', 'evt_19'); await undo(p);
    ok(s1 === 'published' && await st('events', 'evt_19') === 'draft', W + ': publish, Undo back to draft');
    /* 5. complete, undo; complete then the permanent step back, undo */
    await go(p, 'events/evt_08'); await human(p, '[data-action=complete]'); const s2 = await st('events', 'evt_08'); await undo(p);
    ok(s2 === 'completed' && await st('events', 'evt_08') === 'published', W + ': mark completed, Undo back to published');
    await human(p, '[data-action=complete]'); await human(p, '[data-action=uncomplete]'); const s3 = await st('events', 'evt_08'); await undo(p);
    ok(s3 === 'published' && await st('events', 'evt_08') === 'completed', W + ': Back to published step back, and its Undo');
    await human(p, '[data-action=uncomplete]');
    /* 6. cancel and reinstate */
    await go(p, 'events/evt_10'); await human(p, '[data-action=cancel]'); await modalBtn(p, 'Cancel event'); await p.waitForTimeout(400);
    const s4 = await st('events', 'evt_10'); await undo(p);
    ok(s4 === 'cancelled' && await st('events', 'evt_10') === 'published', W + ': cancel, Undo reinstates');
    await human(p, '[data-action=cancel]'); await modalBtn(p, 'Cancel event'); await p.waitForTimeout(400);
    await human(p, '[data-action=reinstate]'); const s5 = await st('events', 'evt_10'); await undo(p);
    ok(s5 === 'published' && await st('events', 'evt_10') === 'cancelled', W + ': reinstate, Undo cancels again');
    await human(p, '[data-action=reinstate]');
    /* 7. create, undo */
    await go(p, 'events'); const n0 = await ev(() => Club.store.all('events').length);
    await human(p, '[data-action=new-ev]'); await setVal(p, '.ev-form [name=title]', 'Undo test night'); await modalBtn(p, 'Create event'); await p.waitForTimeout(700);
    const n1 = await ev(() => Club.store.all('events').length); const onNew = await ev(() => /#\/events\/evt/.test(location.hash));
    await undo(p); await p.waitForTimeout(500);
    ok(n1 === n0 + 1 && onNew && await ev(() => Club.store.all('events').length) === n0 && await ev(() => location.hash === '#/events'), W + ': create event, Undo removes it and leaves its page', { n0, n1 });
    /* 8. tournaments: start / back to upcoming, add and remove players, delete */
    await go(p, 'events/tournaments/trn_03');
    await human(p, '[data-action=start]'); const t2 = await st('tournaments', 'trn_03'); await undo(p);
    ok(t2 === 'live' && await st('tournaments', 'trn_03') === 'upcoming', W + ': start scoring, Undo back to upcoming');
    await human(p, '[data-action=start]'); await human(p, '[data-action=unstart]'); const t3 = await st('tournaments', 'trn_03'); await undo(p);
    ok(t3 === 'upcoming' && await st('tournaments', 'trn_03') === 'live', W + ': Back to upcoming step back, and its Undo');
    const f0 = await ev(() => JSON.stringify(Club.store.find('tournaments', 'trn_03').field));
    const add = await ev(() => document.querySelector('.ev-add-row select option[value^="mem_"]').value);
    await setVal(p, '.ev-add-row select', add); await human(p, '[data-action=add-player]');
    const f1 = await ev(() => Club.store.find('tournaments', 'trn_03').field.length); await undo(p);
    ok(f1 === JSON.parse(f0).length + 1 && await ev(() => JSON.stringify(Club.store.find('tournaments', 'trn_03').field)) === f0, W + ': add player, Undo restores the field', { f1, n0: JSON.parse(f0).length, now: await ev(() => Club.store.find('tournaments', 'trn_03').field.length), st: await ev(() => Club.store.find('tournaments', 'trn_03').status), t: await toastText(p) });
    await human(p, '[data-action=rm-player]'); const f2 = await ev(() => Club.store.find('tournaments', 'trn_03').field.length); await undo(p);
    ok(f2 === JSON.parse(f0).length - 1 && await ev(() => JSON.stringify(Club.store.find('tournaments', 'trn_03').field)) === f0, W + ': remove player, Undo puts them back in order');
    /* 9. finalize (completes the linked event), undo; finalize then Reopen reverses both */
    await go(p, 'events/tournaments/trn_02');
    await human(p, '[data-action=finalize]'); await modalBtn(p, 'Finalize results'); await p.waitForTimeout(400);
    const z1 = [await st('tournaments', 'trn_02'), await st('events', 'evt_08')]; await undo(p);
    const z2 = [await st('tournaments', 'trn_02'), await st('events', 'evt_08'), await ev(() => 'closedEvent' in Club.store.find('tournaments', 'trn_02'))];
    ok(z1.join() === 'final,completed' && z2.join() === 'live,published,false', W + ': finalize completes the event; Undo reverses both', { z1, z2 });
    await human(p, '[data-action=finalize]'); await modalBtn(p, 'Finalize results'); await p.waitForTimeout(400);
    await human(p, '[data-action=reopen]');
    const z3 = [await st('tournaments', 'trn_02'), await st('events', 'evt_08')]; await undo(p);
    const z4 = [await st('tournaments', 'trn_02'), await st('events', 'evt_08')];
    ok(z3.join() === 'live,published' && z4.join() === 'final,completed', W + ': Reopen scoring reverses finalizing (event back to published); its Undo is final again', { z3, z4 });
    await human(p, '[data-action=reopen]');
    await go(p, 'events/tournaments/trn_03'); const i0 = await ev(() => Club.store.all('tournaments').findIndex(t => t.id === 'trn_03'));
    await human(p, '.page-head [data-action=delete]'); await modalBtn(p, 'Delete tournament'); await p.waitForTimeout(500);
    const gone = await ev(() => !Club.store.find('tournaments', 'trn_03')); await undo(p);
    ok(gone && await ev(() => Club.store.all('tournaments').findIndex(t => t.id === 'trn_03')) === i0, W + ': delete tournament, Undo restores it in place');
    /* 10. delete an event with a linked tournament, undo restores both links */
    await go(p, 'events/evt_08'); await human(p, '.ev-head-actions [data-action=delete]'); await modalBtn(p, 'Delete event'); await p.waitForTimeout(500);
    const d1 = await ev(() => [!Club.store.find('events', 'evt_08'), Club.store.find('tournaments', 'trn_02').eventId]); await undo(p);
    ok(d1[0] && d1[1] === null && await ev(() => !!Club.store.find('events', 'evt_08') && Club.store.find('tournaments', 'trn_02').eventId === 'evt_08'), W + ': delete event, Undo restores it and the tournament link', d1);
    /* 11. league: new season (undo), new season again, block tee sheet (undo), save (undo), delete (undo) */
    await go(p, 'events/league'); const lg0 = await ev(() => Club.store.all('leagues').length);
    await human(p, '[data-action=lg-new]'); await modalBtn(p, 'Create league'); await p.waitForTimeout(500);
    const lg1 = await ev(() => Club.store.all('leagues').length); await undo(p);
    ok(lg1 === lg0 + 1 && await ev(() => Club.store.all('leagues').length) === lg0, W + ': new season created, Undo removes it');
    await human(p, '[data-action=lg-new]'); await modalBtn(p, 'Create league'); await p.waitForTimeout(500);
    const tb0 = await ev(() => Club.store.all('teeBlocks').length);
    await human(p, '[data-action=lg-block]'); const tb1 = await ev(() => Club.store.all('teeBlocks').length); await undo(p);
    const lgNew = await ev(() => Club.store.all('leagues').slice().sort((a, b) => b.season.start.localeCompare(a.season.start))[0]);
    ok(tb1 === tb0 + 1 && await ev(() => Club.store.all('teeBlocks').length) === tb0 && lgNew.weeks.every(w => !w.teeBlockId), W + ': league night block, Undo removes the block and the link', { tb0, tb1 });
    await human(p, '[data-action=lg-edit]'); await setVal(p, '.modal [name=name]', 'Undo league'); await modalBtn(p, 'Save league'); await p.waitForTimeout(400);
    const nm = await ev(id => Club.store.find('leagues', id).name, lgNew.id); await undo(p);
    ok(nm === 'Undo league' && await ev(id => Club.store.find('leagues', id).name, lgNew.id) === lgNew.name, W + ': league saved, Undo restores the setup');
    await human(p, '[data-action=lg-edit]'); await modalBtn(p, 'Delete league'); await p.waitForTimeout(300); await modalBtn(p, 'Delete league'); await p.waitForTimeout(500);
    const lgGone = await ev(id => !Club.store.find('leagues', id), lgNew.id); await undo(p);
    ok(lgGone && await ev(id => !!Club.store.find('leagues', id), lgNew.id) && await p.locator('.lg-pick, [data-action=lg-edit]').count() > 0, W + ': league deleted, Undo restores it');
    ok(await noHScroll(p), W + ': no horizontal scroll');
    await p.screenshot({ path: 'xb-events-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xb-events-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
