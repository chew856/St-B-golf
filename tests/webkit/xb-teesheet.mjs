import { suite, open, human, undo, toastText, modalBtn, noHScroll, setVal } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const go = async (p, h) => { await p.evaluate(h => { location.hash = '#/' + h; }, h); await p.waitForTimeout(900); };
async function allDay(p) { const b = p.locator('.ts-periods button', { hasText: 'All day' }); if (await b.count() && !(await b.first().getAttribute('class') || '').includes('active')) await human(p, b.first()); }
async function openRow(p, id) { await allDay(p); await human(p, '.ts-row[data-id="' + id + '"] .ts-slot.filled'); }
async function override(p) { await p.evaluate(() => { const o = document.querySelector('.ts-form [name=override]'); if (o) o.checked = true; }); }
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'teesheet', T);
  const ev = (f, a) => p.evaluate(f, a);
  try {
    /* the first day ahead with members free to book (the demo fills some days, e.g. Fridays, with member play) */
    const D = await ev(() => { for (let k = 1; k <= 6; k++) { const d = Club.date.fromToday(k); const busy = new Set(); Club.store.all('teeTimes').forEach(t => { if (t.date === d && t.status !== 'cancelled') (t.players || []).forEach(x => x.memberId && busy.add(x.memberId)); }); if (Club.store.all('members').filter(m => m.status === 'active' && m.tierId !== 'tier_social' && !busy.has(m.id)).length >= 6) return d; } return Club.date.fromToday(2); });
    await go(p, 'teesheet/' + D);
    const mem = await ev(d => Club.store.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !Club.store.all('teeTimes').some(t => t.date === d && t.players.some(x => x.memberId === m.id))).id, D);
    const snapR = () => ev(() => ({ rc: Club.store.all('receipts').length, ts: Club.store.all('teeTimes').length }));
    /* 1. book with a member and a public golfer who pays at the golf shop with a discount; undo */
    const r0 = await snapR();
    await human(p, '.ts-bar [data-action=book-new]');
    await setVal(p, '.ts-form [name=member_0]', mem);
    await human(p, '.ts-form .ts-prow[data-i="1"] [data-kind-to=public]');
    await setVal(p, '.ts-form [name=pub_1]', 'Pat Publicgolfer');
    await human(p, '.ts-form [name=pubpaid_1]');
    await human(p, '.ts-pay [data-pay=disc-add]'); await setVal(p, '#ts-pay-dv', '5'); await setVal(p, '#ts-pay-dr', 'Aeration on the greens');
    await modalBtn(p, 'Record payment'); await p.waitForTimeout(300);
    await override(p); await modalBtn(p, 'Book tee time'); await p.waitForTimeout(600);
    const b1 = await ev(() => { const S = Club.store; const t = S.all('teeTimes')[S.all('teeTimes').length - 1]; const pub = t.players.find(x => x.type === 'public'); const rc = S.find('receipts', pub.shopPay.receiptId);
      return { id: t.id, paid: pub.paid, disc: pub.discount && pub.discount.amount, rk: rc.kind, rt: rc.total, sub: pub.shopPay.subtotal }; });
    const r1 = await snapR();
    ok(r1.ts === r0.ts + 1 && b1.paid && b1.disc === 5 && b1.rk === 'sale' && Math.abs(b1.rt - (b1.sub - 5)) < 0.001 && r1.rc === r0.rc + 1, W + ': booked; shop payment with a $5 discount and its receipt', { b1, r0, r1 });
    await undo(p);
    const u1 = await ev(id => { const S = Club.store; const rcs = S.all('receipts').filter(r => r.refId === id); return { tt: !!S.find('teeTimes', id), kinds: rcs.map(r => r.kind), rev: rcs.filter(r => r.reversedBy).length, tot: rcs.map(r => r.total) }; }, b1.id);
    const r2 = await snapR();
    ok(!u1.tt && u1.kinds.join() === 'sale,credit' && u1.rev === 1 && u1.tot[0] === u1.tot[1] && r2.rc === r1.rc + 1 && /payment reversed/.test(await toastText(p)), W + ': Undo removes the booking; the shop payment gets a credit receipt, nothing deleted', { u1, t: await toastText(p) });
    /* 2. book again (paid at the shop), then untick paid (refund on save), undo the refund */
    await human(p, '.ts-bar [data-action=book-new]');
    await setVal(p, '.ts-form [name=member_0]', mem);
    await human(p, '.ts-form .ts-prow[data-i="1"] [data-kind-to=public]'); await setVal(p, '.ts-form [name=pub_1]', 'Pat Publicgolfer');
    await human(p, '.ts-form [name=pubpaid_1]'); await modalBtn(p, 'Record payment'); await p.waitForTimeout(300);
    await override(p); await modalBtn(p, 'Book tee time'); await p.waitForTimeout(600);
    const B2 = await ev(() => Club.store.all('teeTimes')[Club.store.all('teeTimes').length - 1].id);
    const before2 = await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), B2);
    await openRow(p, B2); await human(p, '.ts-form [name=pubpaid_1]'); await modalBtn(p, 'Refund on save'); await p.waitForTimeout(300);
    await override(p); await modalBtn(p, 'Save changes'); await p.waitForTimeout(600);
    const rf = await ev(id => { const S = Club.store, t = S.find('teeTimes', id), pub = t.players.find(x => x.type === 'public'); return { paid: pub.paid, kinds: S.all('receipts').filter(r => r.refId === id).map(r => r.kind) }; }, B2);
    await undo(p);
    const rf2 = await ev(id => { const S = Club.store, t = S.find('teeTimes', id), pub = t.players.find(x => x.type === 'public'); return { paid: pub.paid, sp: !!pub.shopPay, kinds: S.all('receipts').filter(r => r.refId === id).map(r => r.kind) }; }, B2);
    ok(!rf.paid && rf.kinds.join() === 'sale,credit' && rf2.paid && rf2.sp && rf2.kinds.join() === 'sale,credit,sale' && await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), B2) === before2, W + ': untick paid refunds on save; Undo reinstates the payment (new sale receipt) and the booking exactly', { rf, rf2 });
    /* 3. edit (move to another time), undo; and refusal when the old slot is booked since */
    const G = await ev(d => { const all = Club.store.all('teeTimes').filter(t => t.date === d && t.status !== 'cancelled'); const t = all.find(t => t.status === 'booked' && t.source !== 'staff' && t.time >= '08:00' && !t.players.some(x => x.type === 'public' || x.publicPlayerId) && !all.some(o => o.id !== t.id && o.players.some(x => x.memberId && t.players.some(y => y.memberId === x.memberId)))); return t.id; }, D);
    const g0 = await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), G);
    await openRow(p, G);
    const pickT = () => ev(id => { const S = Club.store, g = S.find('teeTimes', id), mins = t => +t.split(':')[0] * 60 + +t.split(':')[1];
      const mine = g.players.map(x => x.memberId).filter(Boolean);
      const busy = S.all('teeTimes').filter(t => t.date === g.date && t.id !== g.id && t.status !== 'cancelled' && t.status !== 'no-show' && t.players.some(x => mine.indexOf(x.memberId) >= 0)).map(t => mins(t.time));
      return [...document.querySelectorAll('.ts-form [name=time] option:not([disabled])')].map(o => o.value).find(v => v !== g.time && busy.every(b => Math.abs(b - mins(v)) >= 260)); }, G);
    const T1 = await pickT(); await setVal(p, '.ts-form [name=time]', T1);
    await override(p); await modalBtn(p, 'Save changes'); await p.waitForTimeout(600);
    const g1 = await ev(id => Club.store.find('teeTimes', id).time, G); await undo(p);
    ok(g1 !== JSON.parse(g0).time && await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), G) === g0 && /moved back/i.test(await toastText(p)), W + ': group moved, Undo moves it back exactly', { g1, g0: JSON.parse(g0).time, now: await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), G), g0s: g0, t: await toastText(p) });
    await openRow(p, G); await setVal(p, '.ts-form [name=time]', T1); await override(p); await modalBtn(p, 'Save changes'); await p.waitForTimeout(600);
    await ev(([d, t]) => Club.store.insert('teeTimes', { date: d, time: t, holes: 18, players: [{ type: 'guest', name: 'Someone Else', memberId: null }], status: 'booked', source: 'staff' }), [D, JSON.parse(g0).time]);
    await undo(p);
    ok(await ev(id => Club.store.find('teeTimes', id).time, G) === g1 && /Another group has booked/.test(await toastText(p)), W + ': Undo of a move is refused once the old slot is booked');
    /* 4. cancel with the waitlist told; undo puts it back and says so; refusal once rebooked */
    const C = await ev(([d, g]) => Club.store.all('teeTimes').find(t => t.date === d && t.status === 'booked' && t.id !== g && t.source !== 'staff' && t.time > '09:00').id, [D, G]);
    const ct = await ev(id => Club.store.find('teeTimes', id).time, C);
    const gN = await ev(id => Club.store.find('teeTimes', id).players.length, C);
    const wl = await ev(([d, time, gN]) => { const S = Club.store, R = Club.teeRules;
      const m = S.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !S.all('teeTimes').some(t => t.date === d && t.players.some(x => x.memberId === m.id)) && (!R || R.memberCanPlay(m, d, time).ok)) || S.insert('members', Object.assign({}, S.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social'), { id: 'mem_xb' + Math.random().toString(36).slice(2, 7), memberNo: String(9000 + Math.floor(Math.random() * 900)), balance: 0 }));
      return S.insert('teeWaitlist', { id: 'wl_xb', date: d, time: time, window: null, players: Math.min(4, 5 - gN), kind: 'member', memberId: m.id, publicPlayerId: null, createdAt: new Date(Date.now() - 3600e3).toISOString(), status: 'waiting', notifiedAt: null, offerTime: null, holdUntil: null, had: [], history: [{ at: new Date().toISOString(), text: 'Joined' }] }).id; }, [D, ct, gN]);
    const c0 = await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), C);
    await openRow(p, C); await modalBtn(p, 'Cancel tee time'); await p.waitForTimeout(300); await modalBtn(p, 'Cancel tee time'); await p.waitForTimeout(900);
    const cs = await ev(([id, w]) => [Club.store.find('teeTimes', id).status, Club.store.find('teeWaitlist', w).status], [C, wl]);
    const told = /has been told/.test(await toastText(p));
    await undo(p); await p.waitForTimeout(300);
    const cu = await ev(([id, w]) => { const e = Club.store.find('teeWaitlist', w); return [Club.store.find('teeTimes', id).status, e.status, e.history.some(h => /Notified/.test(h.text))]; }, [C, wl]);
    ok(cs.join() === 'cancelled,notified' && told, W + ': cancel releases the time and the waitlist is told', cs);
    ok(cu[0] === 'booked' && await ev(id => JSON.stringify(Club.store.find('teeTimes', id)), C) === c0 && cu[1] === 'waiting' && cu[2] && /already told about the opening/.test(await toastText(p)), W + ': Undo puts the tee time back, says the golfer was already told, and keeps their history', { cu, t: await toastText(p) });
    await openRow(p, C); await modalBtn(p, 'Cancel tee time'); await p.waitForTimeout(300); await modalBtn(p, 'Cancel tee time'); await p.waitForTimeout(900);
    await ev(([d, t]) => Club.store.insert('teeTimes', { date: d, time: t, holes: 18, players: [{ type: 'guest', name: 'Walk In', memberId: null }], status: 'booked', source: 'staff' }), [D, ct]);
    await undo(p);
    ok(await ev(id => Club.store.find('teeTimes', id).status, C) === 'cancelled' && /Another group has booked/.test(await toastText(p)), W + ': Undo of a cancellation is refused once someone books the slot');
    /* 5. waitlist remove, undo */
    const wl2 = await ev(d => { const S = Club.store; const m = S.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !S.all('teeTimes').some(t => t.date === d && t.players.some(x => x.memberId === m.id)) && !S.all('teeWaitlist').some(w => w.date === d && w.memberId === m.id)) || S.insert('members', Object.assign({}, S.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social'), { id: 'mem_xb' + Math.random().toString(36).slice(2, 7), memberNo: String(9000 + Math.floor(Math.random() * 900)), balance: 0 }));
      return S.insert('teeWaitlist', { id: 'wl_xb2', date: d, time: null, window: 'any', players: 4, kind: 'member', memberId: m.id, publicPlayerId: null, createdAt: new Date(Date.now() - 7200e3).toISOString(), status: 'waiting', notifiedAt: null, offerTime: null, holdUntil: null, had: [], history: [{ at: new Date().toISOString(), text: 'Joined' }] }).id; }, D);
    await ev(d => { Club.waitlist.reconcile(d); Club.app.render(); }, D); await p.waitForTimeout(600);
    const w0 = await ev(id => JSON.stringify(Club.store.find('teeWaitlist', id)), wl2);
    const accOpen = await p.locator('[data-side=waitlist] .pk-acc.is-open').count(); if (!accOpen) await human(p, '[data-side=waitlist] .pk-acc-head');
    await human(p, '[data-action=wl-remove][data-id="' + wl2 + '"]'); await modalBtn(p, 'Remove'); await p.waitForTimeout(500);
    const ws = await ev(id => Club.store.find('teeWaitlist', id).status, wl2); await undo(p);
    ok(ws === 'removed' && await ev(id => Club.store.find('teeWaitlist', id).status, wl2) === JSON.parse(w0).status && /back on the waitlist/.test(await toastText(p)), W + ': removed from the waitlist, Undo puts them back', { ws, w0: JSON.parse(w0).status, now: await ev(id => Club.store.find('teeWaitlist', id).status, wl2), t: await toastText(p) });
    /* 6. block create and remove, undo */
    const tb0 = await ev(() => Club.store.all('teeBlocks').length);
    await human(p, '.page-head [data-action=block]'); await setVal(p, '.ts-form [name=reason]', 'Junior golf'); await modalBtn(p, 'Block times'); await p.waitForTimeout(500);
    const tb1 = await ev(() => Club.store.all('teeBlocks').length); await undo(p);
    ok(tb1 === tb0 + 1 && await ev(() => Club.store.all('teeBlocks').length) === tb0, W + ': times blocked, Undo removes the block');
    await go(p, 'teesheet');
    const blk = await ev(() => { const b = Club.store.all('teeBlocks').find(b => b.date === Club.date.today()); return b && b.id; });
    if (blk) {
      const bi = await ev(id => Club.store.all('teeBlocks').findIndex(b => b.id === id), blk);
      if (!await p.locator('[data-side=blocks] .pk-acc.is-open').count()) await human(p, '[data-side=blocks] .pk-acc-head');
      await human(p, '[data-action=unblock][data-id="' + blk + '"]'); await modalBtn(p, 'Release times'); await p.waitForTimeout(500);
      const gone = await ev(id => !Club.store.find('teeBlocks', id), blk); await undo(p);
      ok(gone && await ev(id => Club.store.all('teeBlocks').findIndex(b => b.id === id), blk) === bi, W + ': block released, Undo puts it back');
    } else ok(true, W + ': (no block today to release)');
    /* 7. golf fees */
    const f0 = await ev(() => JSON.stringify(Club.store.getObj('teeSheetSettings', null)));
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(300);
    if (!await p.locator('[data-action=fees]').first().isVisible()) await human(p, '[data-side=fees] .pk-acc-head'); await p.waitForTimeout(300);
    await human(p, '[data-action=fees]'); await setVal(p, '.modal [name=cartFee]', '31'); await modalBtn(p, 'Save fees'); await p.waitForTimeout(400);
    const f1 = await ev(() => Club.store.getObj('teeSheetSettings').cartFee); await undo(p);
    ok(f1 === 31 && await ev(() => JSON.stringify(Club.store.getObj('teeSheetSettings', null))) === f0, W + ': golf fees saved, Undo restores them');
    ok(await noHScroll(p), W + ': no horizontal scroll');
    await p.screenshot({ path: 'xb-teesheet-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xb-teesheet-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
