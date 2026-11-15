import { makeT, human, modalBtn, undoToast, toastText, clearToasts, open, go, noHScroll } from './xc-lib.mjs';
const T = makeT(); const ok = T.ok;
const W = +(process.argv[2] || 1440);
const { b, p, errs } = await open(W);
const doc = (c, id) => p.evaluate(([c, id]) => JSON.stringify(Club.store.find(c, id)), [c, id]);
const field = (c, id, k) => p.evaluate(([c, id, k]) => { const d = Club.store.find(c, id); return d ? d[k] : undefined; }, [c, id, k]);
const setVal = (sel, v) => p.evaluate(([s, v]) => { const n = document.querySelector(s); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const card = (id, part) => p.locator('[data-flip="' + id + '"] ' + part);
/* Redesign (Nov 12): move back and mark lost sit in each card's "..." menu; the event page keeps them in its "..." menu. */
/* Phones show one pipeline stage at a time: tap that card's stage chip first (Weddings & Events board only). */
const showCard = async (id) => { if (!/^fn_/.test(id)) return; const st = await field('functions', id, 'stage'); const chip = p.locator('.fw-stagechips [data-stage="' + st + '"]'); if (await chip.count() && await chip.isVisible()) await human(p, chip); };
const cardMenu = async (id) => { await showCard(id); await human(p, card(id, '.fw-more')); };
const detailMenu = async () => { await human(p, '.fn-actions [data-action=more]'); };

try {
/* ================= Weddings & Events ================= */
await go(p, '#/functions');
await human(p, p.locator('.tab', { hasText: 'Pipeline' }).first());   // To do is the first tab now
// A. Enquiry -> Tour booked (tour modal), then Undo
let d0 = await doc('functions', 'fn_6');
await showCard('fn_6'); await human(p, card('fn_6', '.fn-move-next'));
await modalBtn(p, 'Book tour');
ok(await field('functions', 'fn_6', 'stage') === 'Tour booked' && /Tour booked for/.test(await toastText(p)), 'fn: card next books a tour');
await undoToast(p);
ok(await doc('functions', 'fn_6') === d0 && /is back in enquiry/.test(await toastText(p)), 'fn: Undo tour booked restores the enquiry exactly');
await clearToasts(p);
// B. Tour booked -> Proposal sent (quote created) then Undo
d0 = await doc('functions', 'fn_15');
await showCard('fn_15'); await human(p, card('fn_15', '.fn-move-next'));
ok(await field('functions', 'fn_15', 'stage') === 'Proposal sent' && !!(await field('functions', 'fn_15', 'quote')), 'fn: move to proposal sent writes a quote');
await undoToast(p);
ok(await doc('functions', 'fn_15') === d0, 'fn: Undo stage move restores record (quote removed too)');
await clearToasts(p);
// C. Mark lost with picker reason, then Undo
d0 = await doc('functions', 'fn_10');
await cardMenu('fn_10'); await human(p, '.fw-menu .fn-move-lost');
await human(p, p.locator('.modal .cs-btn').first());
await human(p, p.locator('.cs-opt', { hasText: 'Over budget' }).first());
await modalBtn(p, 'Mark lost');
ok(await field('functions', 'fn_10', 'stage') === 'Lost', 'fn: mark lost from the card');
await undoToast(p);
ok(await doc('functions', 'fn_10') === d0, 'fn: Undo mark lost');
await clearToasts(p);
// D. Step back on card (fn_9 Proposal sent), toast Undo, then permanent step back
d0 = await doc('functions', 'fn_9');
await cardMenu('fn_9');
const backTitle = await p.locator('.fw-menu [data-back]').getAttribute('aria-label');
await human(p, '.fw-menu [data-back]');
ok(backTitle === 'Move back to tour booked' && await field('functions', 'fn_9', 'stage') === 'Tour booked', 'fn: card step-back moves to the previous stage', backTitle);
await undoToast(p);
ok(await doc('functions', 'fn_9') === d0, 'fn: Undo step-back');
await clearToasts(p);
// E. Lost card step back: show closed
await human(p, '.fn-closed');
d0 = await doc('functions', 'fn_13');
await cardMenu('fn_13');
ok(await p.locator('.fw-menu [data-back]').getAttribute('aria-label') === 'Move back to proposal sent', 'fn: lost card offers Move back to proposal sent');
await human(p, '.fw-menu [data-back]');
ok(await field('functions', 'fn_13', 'stage') === 'Proposal sent' && await field('functions', 'fn_13', 'lostReason') === null, 'fn: lost event steps back to the stage it was lost from');
await undoToast(p);
ok(await doc('functions', 'fn_13') === d0, 'fn: Undo lost step-back');
await human(p, '.fn-closed');
await clearToasts(p);
// Detail page step-back button
await go(p, '#/functions/fn_9');
await detailMenu(); await human(p, p.locator('.fw-menu button', { hasText: 'Move back to tour booked' }));
ok(await field('functions', 'fn_9', 'stage') === 'Tour booked', 'fn: detail Move back to tour booked');
await detailMenu();
ok(await p.locator('.fw-menu button', { hasText: 'Move back to enquiry' }).count() === 1, 'fn: detail now offers Move back to enquiry');
await human(p, p.locator('.fw-menu button', { hasText: 'Move back to enquiry' }));
ok(await field('functions', 'fn_9', 'stage') === 'Enquiry', 'fn: second step back to enquiry (permanent)');
await clearToasts(p);

// F. Deposit recorded (cash, today) then Undo: money checks
await go(p, '#/functions/fn_8');   // payments are in the Money section of the one-page event view
let cs0 = await p.evaluate(() => __cs()), jn0 = await p.evaluate(() => __jn()), ids0 = await p.evaluate(() => __rcIds());
d0 = await doc('functions', 'fn_8');
await human(p, '[data-action=deposit]');
await human(p, p.locator('.modal .segmented button', { hasText: 'Cash' }));
await setVal('.modal [name=amount]', '250');
await modalBtn(p, /Record (deposit|payment)/);
let mid = await p.evaluate(() => ({ cs: __cs(), n: Club.store.find('functions', 'fn_8').deposits.length }));
ok(mid.cs !== cs0 && mid.n === 2, 'fn: cash deposit recorded and shows in today’s close', mid);
await undoToast(p);
let after = await p.evaluate(ids => ({ cs: __cs(), jn: __jn(), kept: __allKept(ids), credit: Club.store.all('receipts').filter(r => r.source === 'functions' && r.refId === 'fn_8' && r.kind === 'credit' && r.date === Club.date.today()).length }), ids0);
ok(await doc('functions', 'fn_8') === d0 && after.cs === cs0 && after.jn === jn0 && after.kept && after.credit === 1, 'fn: Undo deposit: record back, close and journal unchanged, credit receipt added, nothing deleted', { after, cs0 });
await clearToasts(p);
// G. Remove a past deposit, Undo, remove again after the 5 s duplicate window
ids0 = await p.evaluate(() => __rcIds()); cs0 = await p.evaluate(() => __cs()); jn0 = await p.evaluate(() => __jn()); d0 = await doc('functions', 'fn_8');
await human(p, p.locator('[data-dep-del]').first());
await modalBtn(p, 'Remove payment');
ok(await p.evaluate(() => Club.store.find('functions', 'fn_8').deposits.length) === 0 && await p.evaluate(() => __cs()) !== cs0, 'fn: payment removed with a credit in today’s close');
await undoToast(p);
after = await p.evaluate(ids => ({ cs: __cs(), jn: __jn(), kept: __allKept(ids) }), ids0);
ok(await doc('functions', 'fn_8') === d0 && after.cs === cs0 && after.jn === jn0 && after.kept, 'fn: Undo payment removed: payment back, close and journal unchanged', { after, cs0 });
await clearToasts(p);
await p.waitForTimeout(5300);
await human(p, p.locator('[data-dep-del]').first());
await modalBtn(p, 'Remove payment');
const net = await p.evaluate(() => { const d = Club.store.find('functions', 'fn_8'); const gone = 'dep_fn_8_1'; return Club.store.all('receipts').filter(r => r.refId === 'fn_8' && (r.tenders || []).some(t => t.ref === gone)).reduce((a, r) => a + (r.kind === 'credit' ? -1 : 1) * r.total, 0); });
ok(Math.abs(net) < 0.005, 'fn: removing the same payment again after an undo takes it back out (receipts net to 0)', net);
await undoToast(p); await clearToasts(p);
// H. Past-dated deposit: undo nets on that day, today unchanged
const yday = await p.evaluate(() => { const o = Club.accounting.openPastDays(); return o.length ? o[0] : Club.date.addDays(Club.date.today(), -1); });
const ycs0 = await p.evaluate(d => __cs(d), yday); cs0 = await p.evaluate(() => __cs());
const yClosed = await p.evaluate(d => Club.accounting.isClosed(d), yday);
await human(p, '[data-action=deposit]');
await human(p, p.locator('.modal .segmented button', { hasText: 'Cheque' }));
await setVal('.modal [name=amount]', '100'); await setVal('.modal [name=date]', yday);
await modalBtn(p, /Record (deposit|payment)/);
ok(await p.evaluate(d => __cs(d), yday) !== ycs0, 'fn: deposit dated yesterday lands in yesterday’s close');
await undoToast(p);
const yAfter = await p.evaluate(d => __cs(d), yday), tAfter = await p.evaluate(() => __cs());
ok(yClosed ? tAfter !== cs0 : (yAfter === ycs0 && tAfter === cs0), 'fn: Undo of a deposit dated ' + yday + ' (closed: ' + yClosed + ') ' + (yClosed ? 'is reversed today' : 'is reversed on that day; both days net'), { yAfter, ycs0 });
await clearToasts(p);

// I. Overview: run sheet + notes
await go(p, '#/functions/fn_7');
d0 = await doc('functions', 'fn_7');
await human(p, '[data-action=rs-edit]');
await p.locator('.fn-rs input[data-k=item]').first().fill('Room set, coffee station ready and podium');
await human(p, '[data-action=rs-save]');
ok(/podium/.test(await doc('functions', 'fn_7')), 'fn: run sheet saved');
await undoToast(p);
ok(await doc('functions', 'fn_7') === d0, 'fn: Undo run sheet');
await clearToasts(p);
await human(p, '[data-action=menu-edit]');
await setVal('.fn-menu', 'Two vegetarian meals');
await human(p, '[data-action=save-menu]');
ok(/Two vegetarian meals/.test(await doc('functions', 'fn_7')), 'fn: notes saved');
await undoToast(p);
ok(await doc('functions', 'fn_7') === d0, 'fn: Undo notes');
await clearToasts(p);
// J. Quote save
await go(p, '#/functions/fn_7');
await human(p, '[data-action=q-edit]');
await p.locator('.fn-q-qty').first().fill('150');
await human(p, '[data-action=q-save]');
ok(await p.evaluate(() => Club.store.find('functions', 'fn_7').quote.lines[0].qty) === 150, 'fn: quote saved');
await undoToast(p);
ok(await doc('functions', 'fn_7') === d0, 'fn: Undo quote');
await clearToasts(p);
// K. Edit details
await go(p, '#/functions/fn_7');
await human(p, p.locator('.fn-side [data-action=edit]').first());
await p.locator('.modal [name=guests]').fill('150');
await modalBtn(p, 'Save details');
ok(await field('functions', 'fn_7', 'guests') === 150, 'fn: details saved');
await undoToast(p);
ok(await doc('functions', 'fn_7') === d0, 'fn: Undo details');
await clearToasts(p);
// L. New enquiry
await go(p, '#/functions');
const n0 = await p.evaluate(() => Club.store.all('functions').length);
await human(p, '[data-action=new]');
await p.locator('.modal [name=name]').fill('Test enquiry, undo check');
await p.locator('.modal [name=contactName]').fill('Pat Test');
await p.locator('.modal [name=email]').fill('pat.test@example.com');
await setVal('.modal [name=date]', await p.evaluate(() => Club.date.addDays(Club.date.today(), 90)));
await p.locator('.modal [name=guests]').fill('60');
await modalBtn(p, 'Save enquiry');
await p.screenshot({ path: 'xc-fn-enq.png' });
ok(await p.evaluate(() => Club.store.all('functions').length) === n0 + 1 && /#\/functions\/.+/.test(await p.evaluate(() => location.hash)), 'fn: enquiry saved and opened');
await undoToast(p); await p.waitForTimeout(600);
ok(await p.evaluate(() => Club.store.all('functions').length) === n0 && await p.evaluate(() => location.hash) === '#/functions', 'fn: Undo enquiry removes it and returns to the pipeline');
await clearToasts(p);
// M. Package save
await human(p, p.locator('.tab', { hasText: 'Packages' }).first());
d0 = await doc('functionPackages', 'fpk_wedding');
await human(p, p.locator('[data-action=edit-pkg]').first());
await p.locator('.modal [name=perGuest]').fill('101');
await modalBtn(p, 'Save package');
ok(await field('functionPackages', 'fpk_wedding', 'perGuest') === 101, 'fn: package saved');
await undoToast(p);
ok(await doc('functionPackages', 'fpk_wedding') === d0, 'fn: Undo package');
await clearToasts(p);
await human(p, p.locator('.tab', { hasText: 'Pipeline' }).first());
// N. Delete event + Undo
d0 = await doc('functions', 'fn_16');
const idx0 = await p.evaluate(() => Club.store.all('functions').findIndex(f => f.id === 'fn_16'));
await go(p, '#/functions/fn_16');
await detailMenu(); await human(p, p.locator('.fw-menu button', { hasText: 'Delete event' }));
await modalBtn(p, 'Delete event');
ok(!(await p.evaluate(() => Club.store.find('functions', 'fn_16'))), 'fn: event deleted');
await undoToast(p); await p.waitForTimeout(600);
ok(await doc('functions', 'fn_16') === d0 && await p.evaluate(() => Club.store.all('functions').findIndex(f => f.id === 'fn_16')) === idx0 && await p.evaluate(() => location.hash) === '#/functions/fn_16', 'fn: Undo delete restores the event in place and opens it');
await clearToasts(p);
ok(await noHScroll(p), 'fn: no horizontal scroll on the event page');
await p.screenshot({ path: 'xc-fn-detail-' + W + '.png' });
await go(p, '#/functions'); ok(await noHScroll(p), 'fn: no horizontal scroll on the pipeline');

/* ================= Group outings ================= */
await go(p, '#/outings');
await human(p, '.fn-closed');
// O1. Confirmed shotgun: mark lost releases block; Undo puts it back
d0 = await doc('outings', 'out_6'); const blk0 = await doc('teeBlocks', 'tb_out_6');
ok(blk0 !== 'null', 'out: seeded confirmed shotgun has a block');
await human(p, card('out_6', '.fn-move-lost'));
await setVal('.modal [name=reason]', 'Over budget');
await modalBtn(p, 'Mark lost and release times');
ok(await field('outings', 'out_6', 'stage') === 'Lost' && await doc('teeBlocks', 'tb_out_6') === 'null', 'out: mark lost releases the tee sheet block');
await undoToast(p);
ok(await doc('outings', 'out_6') === d0 && await doc('teeBlocks', 'tb_out_6') === blk0 && /blocked again/.test(await toastText(p)), 'out: Undo mark lost restores the outing and the same block');
await clearToasts(p);
// O2. Mark lost for real, then step back blocks again; Undo step back releases
await human(p, card('out_6', '.fn-move-lost'));
await setVal('.modal [name=reason]', 'Over budget');
await modalBtn(p, 'Mark lost and release times');
await clearToasts(p);
ok(await card('out_6', '[data-back]').getAttribute('aria-label') === 'Move back to confirmed', 'out: lost shotgun offers Move back to confirmed');
await human(p, card('out_6', '[data-back]'));
let o6 = await p.evaluate(() => { const o = Club.store.find('outings', 'out_6'); const b = o.teeBlockId && Club.store.find('teeBlocks', o.teeBlockId); return { st: o.stage, b: b && [b.date, b.start, b.end], w: [o.date, o.blockStart, o.blockEnd] }; });
ok(o6.st === 'Confirmed' && JSON.stringify(o6.b) === JSON.stringify(o6.w), 'out: step back from lost re-blocks the saved window', o6);
await undoToast(p);
o6 = await p.evaluate(() => { const o = Club.store.find('outings', 'out_6'); return { st: o.stage, id: o.teeBlockId, n: Club.store.all('teeBlocks').filter(b => /Prairie Lights/.test(b.reason)).length }; });
ok(o6.st === 'Lost' && !o6.id && o6.n === 0, 'out: Undo step back releases the block again', o6);
await clearToasts(p);
await human(p, card('out_6', '[data-back]'));   // leave it confirmed with a block
await clearToasts(p);
// O3. Confirmed -> step back to deposit paid releases; Undo restores
d0 = await doc('outings', 'out_6'); const bid = await field('outings', 'out_6', 'teeBlockId'); const b1 = await doc('teeBlocks', bid);
await human(p, card('out_6', '[data-back]'));
ok(await field('outings', 'out_6', 'stage') === 'Deposit paid' && await doc('teeBlocks', bid) === 'null', 'out: step back from confirmed releases tee times');
await undoToast(p);
ok(await doc('outings', 'out_6') === d0 && await doc('teeBlocks', bid) === b1, 'out: Undo restores confirmed and the block');
await clearToasts(p);
// O4. Confirm shotgun (out_7 deposit paid) blocks; Undo removes block
d0 = await doc('outings', 'out_7'); const nb0 = await p.evaluate(() => Club.store.all('teeBlocks').length);
await human(p, card('out_7', '.fn-move-next'));
await modalBtn(p, 'Confirm and block tee times');
ok(await field('outings', 'out_7', 'stage') === 'Confirmed' && await p.evaluate(() => Club.store.all('teeBlocks').length) === nb0 + 1, 'out: confirm blocks the tee sheet');
await undoToast(p);
ok(await doc('outings', 'out_7') === d0 && await p.evaluate(() => Club.store.all('teeBlocks').length) === nb0, 'out: Undo confirm removes the block');
await clearToasts(p);
// O5. Quoted -> deposit (enquiry stage move by quote)
await go(p, '#/outings/out_8');
await human(p, p.locator('.tab', { hasText: 'Payments' }).first());
d0 = await doc('outings', 'out_8'); cs0 = await p.evaluate(() => __cs()); jn0 = await p.evaluate(() => __jn()); ids0 = await p.evaluate(() => __rcIds());
await human(p, '[data-action=deposit]');
await human(p, p.locator('.modal .segmented button', { hasText: 'Cash' }));
await modalBtn(p, 'Record payment');
ok(await field('outings', 'out_8', 'stage') === 'Deposit paid', 'out: initial deposit moves to deposit paid');
await undoToast(p);
after = await p.evaluate(ids => ({ cs: __cs(), jn: __jn(), kept: __allKept(ids) }), ids0);
ok(await doc('outings', 'out_8') === d0 && after.cs === cs0 && after.jn === jn0 && after.kept, 'out: Undo deposit: back to quoted, close and journal unchanged', { after, cs0 });
await clearToasts(p);
// O6. Payment removed + undo (out_7 has a deposit)
await go(p, '#/outings/out_7');
await human(p, p.locator('.tab', { hasText: 'Payments' }).first());
d0 = await doc('outings', 'out_7'); cs0 = await p.evaluate(() => __cs()); jn0 = await p.evaluate(() => __jn());
await human(p, p.locator('[data-dep-del]').first());
await modalBtn(p, 'Remove payment');
await undoToast(p);
ok(await doc('outings', 'out_7') === d0 && await p.evaluate(() => __cs()) === cs0 && await p.evaluate(() => __jn()) === jn0, 'out: Undo payment removed (close and journal unchanged)');
await clearToasts(p);
// O7. Quote save (enquiry out_10 -> quoted)
await go(p, '#/outings/out_10');
d0 = await doc('outings', 'out_10');
await human(p, p.locator('.tab', { hasText: 'Quote' }).first());
await human(p, '[data-action=q-save]');
ok(await field('outings', 'out_10', 'stage') === 'Quoted', 'out: saving the first quote moves to quoted');
await undoToast(p);
ok(await doc('outings', 'out_10') === d0, 'out: Undo quote');
await clearToasts(p);
// O8. Golfer list (out_6 confirmed) and F&B
await go(p, '#/outings/out_6');
d0 = await doc('outings', 'out_6');
await human(p, p.locator('.tab', { hasText: 'Day-of' }).first());
await p.locator('.ot-roster').fill('Golfer One\nGolfer Two');
await human(p, '[data-action=save-roster]');
ok((await field('outings', 'out_6', 'roster')).length === 2, 'out: golfer list saved');
await undoToast(p);
ok(await doc('outings', 'out_6') === d0, 'out: Undo golfer list');
await clearToasts(p);
await go(p, '#/outings/out_6');
await human(p, p.locator('.tab', { hasText: 'Overview' }).first());
const fbOpen = p.locator('.acc-head, [aria-controls]', { hasText: /F&B|Food/ }).first();
if (await fbOpen.count()) await human(p, fbOpen).catch(() => {});
await setVal('.ot-buffet [name=bar]', 'Tickets');
await human(p, '[data-action=save-fb]');
const barNow = await field('outings', 'out_6', 'bar');
await undoToast(p);
ok(barNow === 'Tickets' && await doc('outings', 'out_6') === d0, 'out: F&B saved then undone', barNow);
await clearToasts(p);
// O9. Edit details
await go(p, '#/outings/out_6');
await human(p, p.locator('.fn-side [data-action=edit], .fn-tabs-host [data-action=edit]').first());
await p.locator('.modal [name=organization]').fill("Prairie Lights Children's Fund classic");
await modalBtn(p, 'Save');
const blkReason = await p.evaluate(() => { const o = Club.store.find('outings', 'out_6'); return Club.store.find('teeBlocks', o.teeBlockId).reason; });
await undoToast(p);
ok(/classic shotgun/.test(blkReason) && await doc('outings', 'out_6') === d0 && await p.evaluate(() => /charity classic shotgun/.test(Club.store.find('teeBlocks', Club.store.find('outings', 'out_6').teeBlockId).reason)), 'out: edit details (block renamed) undone, block name back', blkReason);
await clearToasts(p);
// O10. Delete with block + Undo
d0 = await doc('outings', 'out_6'); const bId = await field('outings', 'out_6', 'teeBlockId'); const bDoc = await doc('teeBlocks', bId);
await go(p, '#/outings/out_6');
await human(p, '.fn-actions [data-action=delete]');
await modalBtn(p, 'Delete outing');
ok(await doc('outings', 'out_6') === 'null' && await doc('teeBlocks', bId) === 'null', 'out: outing deleted and block released');
await undoToast(p); await p.waitForTimeout(600);
ok(await doc('outings', 'out_6') === d0 && await doc('teeBlocks', bId) === bDoc && await p.evaluate(() => location.hash) === '#/outings/out_6', 'out: Undo delete restores the outing, its block and opens it');
await clearToasts(p);
// O11. Detail step back button + new enquiry
ok(await p.locator('.fn-actions button', { hasText: 'Move back to deposit paid' }).count() === 1, 'out: detail page shows Move back to deposit paid');
ok(await noHScroll(p), 'out: no horizontal scroll on the outing page');
await p.screenshot({ path: 'xc-out-detail-' + W + '.png' });
await go(p, '#/outings'); ok(await noHScroll(p), 'out: no horizontal scroll on the pipeline');
await p.screenshot({ path: 'xc-out-board-' + W + '.png' });
// storage: nothing about undo persisted
const size = await p.evaluate(() => { const s = JSON.stringify(Club.store.all('functions')) + JSON.stringify(Club.store.all('outings')); return /"undo"|"ops"/.test(s); });
ok(!size, 'no undo history persisted on functions or outings');
} catch (e) { ok(false, 'script stopped: ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xc-fn-err-' + W + '.png' }); }
ok(errs.length === 0, 'no console errors', errs);
console.log(T.res.join('\n')); console.log(T.fails ? 'FAILED ' + T.fails + ' of ' + T.res.length : 'ALL PASSED ' + T.res.length); await b.close();
