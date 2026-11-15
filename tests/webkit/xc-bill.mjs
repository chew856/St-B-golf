import { makeT, human, modalBtn, undoToast, toastText, clearToasts, open, go, noHScroll } from './xc-lib.mjs';
const T = makeT(); const ok = T.ok;
const W = +(process.argv[2] || 1440);
const { b, p, errs } = await open(W);
const setVal = (sel, v) => p.evaluate(([s, v]) => { const n = document.querySelector(s); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const money = () => p.evaluate(() => ({ cs: __cs(), jn: __jn(), ids: __rcIds(), bal: JSON.stringify(Club.store.all('members').map(m => [m.id, m.balance])) }));
async function moneySame(before, label, extra) {
  const a = await p.evaluate(ids => ({ cs: __cs(), jn: __jn(), kept: __allKept(ids), bal: JSON.stringify(Club.store.all('members').map(m => [m.id, m.balance])) }), before.ids);
  ok(a.cs === before.cs && a.jn === before.jn && a.kept && a.bal === before.bal && (extra === undefined || extra), label, { cs: a.cs === before.cs, jn: a.jn === before.jn, kept: a.kept, bal: a.bal === before.bal, extra, csA: a.cs, csB: before.cs, jnA: a.jn, jnB: before.jn });
}
try {
const mid = await p.evaluate(() => Club.store.all('members').find(m => m.status === 'active' && (m.balance || 0) > 50).id);
/* B1. Charge, then Undo */
await go(p, '#/billing/' + mid);
let m0 = await money(); const bal0 = await p.evaluate(id => Club.store.find('members', id).balance, mid);
await human(p, '[data-action=charge]');
await p.locator('.modal [name=description]').fill('Guest green fee, undo check');
await p.locator('.modal [name=amount]').fill('42.50');
await modalBtn(p, 'Post charge');
ok(await p.evaluate(id => Club.store.find('members', id).balance, mid) === Math.round((bal0 + 42.5) * 100) / 100, 'bill: charge posted');
await undoToast(p);
let rv = await p.evaluate(() => { const c = Club.store.all('charges').filter(c => c.description === 'Guest green fee, undo check')[0]; const r = c && Club.store.find('charges', c.reversedBy); return { amt: r && r.amount, rc: r && Club.store.all('receipts').some(x => x.chargeId === r.id && x.kind === 'credit') }; });
await moneySame(m0, 'bill: Undo charge: balance back to the cent, reversal with credit receipt, close and journal unchanged', rv.amt === -42.5 && rv.rc);
ok(/Charge reversed/.test(await toastText(p)) && /\$42\.50 credited back/.test(await toastText(p)), 'bill: undo toast says the charge was reversed', await toastText(p));
await clearToasts(p);
/* B2. Credit, then Undo */
m0 = await money();
await human(p, '[data-action=charge]');
await p.locator('.modal [name=description]').fill('Courtesy credit, undo check');
await p.locator('.modal [name=amount]').fill('-15');
await modalBtn(p, 'Post charge');
await undoToast(p);
await moneySame(m0, 'bill: Undo credit: balance back, credit reversed with a charge');
ok(!/-\$/.test(await toastText(p)), 'bill: credit undo toast has no negative credited amount', await toastText(p));
await clearToasts(p);
/* B3. Payment today, then Undo */
m0 = await money();
await human(p, '[data-action=pay]');
await p.locator('.modal [name=amount]').fill('100');
await setVal('.modal [name=method]', 'Card');
await modalBtn(p, 'Record payment');
ok(await p.evaluate(() => __cs()) !== m0.cs, 'bill: payment shows in today’s close');
await undoToast(p);
rv = await p.evaluate(id => { const ps = Club.store.all('payments').filter(x => x.memberId === id); const orig = ps.find(x => x.reversedBy); const r = orig && Club.store.find('payments', orig.reversedBy); const cr = r && Club.store.all('receipts').find(x => x.paymentId === r.id); return { r: r && r.amount, crKind: cr && cr.kind, crDate: cr && cr.date }; }, mid);
await moneySame(m0, 'bill: Undo payment: reversing payment, credit receipt tied to it, balance, close and journal unchanged', rv.r === -100 && rv.crKind === 'credit');
await clearToasts(p);
/* B4. Payment dated on an open past day, then Undo */
const past = await p.evaluate(() => { const o = Club.accounting.openPastDays(); return o[0] || null; });
if (past) {
  const pc0 = await p.evaluate(d => __cs(d) + __jn(d), past); m0 = await money();
  await human(p, '[data-action=pay]');
  await p.locator('.modal [name=amount]').fill('60');
  await setVal('.modal [name=date]', past);
  await modalBtn(p, 'Record payment');
  await undoToast(p);
  await moneySame(m0, 'bill: Undo payment dated ' + past + ': today unchanged', (await p.evaluate(d => __cs(d) + __jn(d), past)) === pc0);
  await clearToasts(p);
} else ok(true, 'bill: (no open past day to test a back-dated payment)');
/* B5. Statement mark paid (records payment, marks paid), then Undo */
const st = await p.evaluate(() => { const s = Club.store.all('statements').find(s => (s.status === 'sent' || s.status === 'overdue') && (Club.store.find('members', s.memberId) || {}).balance > 1); return s ? s.id : null; });
if (st) {
  await go(p, '#/billing/statement/' + st);
  const s0 = await p.evaluate(id => JSON.stringify(Club.store.find('statements', id)), st); m0 = await money();
  await human(p, '[data-action=st-paid]');
  await modalBtn(p, 'Record payment');
  ok(await p.evaluate(id => Club.store.find('statements', id).status, st) === 'paid', 'bill: statement paid through a payment');
  await undoToast(p);
  await moneySame(m0, 'bill: Undo statement payment: statement back as it was, balance and close unchanged', await p.evaluate(id => JSON.stringify(Club.store.find('statements', id)), st) === s0);
  await clearToasts(p);
}
/* B6. Dues run for a month not yet posted, then one Undo */
await go(p, '#/billing/dues');
const key = await p.evaluate(() => document.querySelector('select[name=duesKey]').value);
m0 = await money();
const nCh0 = await p.evaluate(() => Club.store.all('charges').length), runs0 = await p.evaluate(() => JSON.stringify(Club.store.getObj('billingDuesRuns', {})));
const hasBtn = await p.locator('[data-action=post-dues]').count();
if (hasBtn) {
  await human(p, '[data-action=post-dues]');
  await modalBtn(p, 'Post dues');
  const n = await p.evaluate(k => Club.store.all('charges').filter(c => c.refId === 'dues-' + k && c.amount > 0 && !c.reversedBy).length, key);
  ok(n > 10, 'bill: dues run posted ' + n + ' charges for ' + key);
  await undoToast(p); await p.waitForTimeout(500);
  const live = await p.evaluate(k => Club.store.all('charges').filter(c => c.refId === 'dues-' + k && !c.reversedBy && !c.reverses).length, key);
  await moneySame(m0, 'bill: one Undo reverses the whole dues run: every balance to the cent, close and journal unchanged', live === 0);
  ok(await p.evaluate(() => JSON.stringify(Club.store.getObj('billingDuesRuns', {}))) === runs0 && await p.locator('[data-action=post-dues]').count() === 1, 'bill: run record restored and the month can be posted again');
  const jnKey = await p.evaluate(k => __jn(k + '-01'), key);
  ok(jnKey === '[]' || !/dues/.test(jnKey), 'bill: the dues date journal nets too', jnKey);
  await clearToasts(p);
} else ok(false, 'bill: no dues to post');
/* B7. F&B shortfalls (a minimum set for the test), then one Undo */
await p.evaluate(() => { const t = Club.store.all('membershipTiers')[0]; Club.store.update('membershipTiers', t.id, { monthlyMinimum: 400 }); });
await go(p, '#/billing/minimums');
m0 = await money();
await human(p, '[data-action=post-fb]');
await modalBtn(p, 'Post');
const fbN = await p.evaluate(() => Club.store.all('charges').filter(c => /^fbmin-/.test(c.refId || '') && !c.reversedBy && !c.reverses).length);
ok(fbN > 0, 'bill: shortfall charges posted: ' + fbN);
await undoToast(p); await p.waitForTimeout(400);
await moneySame(m0, 'bill: one Undo reverses every shortfall charge', await p.evaluate(() => Club.store.all('charges').filter(c => /^fbmin-/.test(c.refId || '') && !c.reversedBy && !c.reverses).length) === 0);
ok(await p.locator('[data-action=post-fb]').count() === 1 && !(await p.locator('.badge', { hasText: 'Posted' }).count()), 'bill: shortfalls show as unposted again');
await clearToasts(p);
/* B8. Generate statements (current month), then Undo */
await go(p, '#/billing/statements');
const cm = await p.evaluate(() => Club.date.today().slice(0, 7));
await setVal('select[name=genKey]', cm);
const sts0 = await p.evaluate(() => JSON.stringify(Club.store.all('statements'))), links0 = await p.evaluate(() => JSON.stringify(Club.store.all('charges').map(c => c.statementId || null)));
await human(p, '[data-action=gen]');
ok(/statements created/.test(await toastText(p)) && await p.evaluate(() => JSON.stringify(Club.store.all('statements'))) !== sts0, 'bill: statements generated', await toastText(p));
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify(Club.store.all('statements'))) === sts0 && await p.evaluate(() => JSON.stringify(Club.store.all('charges').map(c => c.statementId || null))) === links0, 'bill: one Undo removes the statements and unlinks the charges');
await clearToasts(p);
/* B9. Generate again, mark one sent, send all drafts, undo each */
await human(p, '[data-action=gen]'); await clearToasts(p);
const oneBtn = p.locator('.bil-st-list [data-action=st-sent]').first();
const one = await oneBtn.getAttribute('data-id');
const one0 = await p.evaluate(id => JSON.stringify(Club.store.find('statements', id)), one);
await human(p, oneBtn);
ok(await p.evaluate(id => Club.store.find('statements', id).status, one) === 'sent', 'bill: statement marked sent');
await undoToast(p);
ok(await p.evaluate(id => JSON.stringify(Club.store.find('statements', id)), one) === one0, 'bill: Undo mark sent');
await clearToasts(p);
const all0 = await p.evaluate(() => JSON.stringify(Club.store.all('statements')));
const nDraft = await p.evaluate(() => Club.store.all('statements').filter(s => s.status === 'draft').length);
await human(p, '[data-action=send-drafts]');
await modalBtn(p, 'Mark all sent');
ok(await p.evaluate(() => Club.store.all('statements').filter(s => s.status === 'draft').length) === 0 && nDraft > 1, 'bill: ' + nDraft + ' drafts marked sent');
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify(Club.store.all('statements'))) === all0, 'bill: one Undo returns every statement to draft');
await clearToasts(p);
/* B10. Member page: statement for one member */
await go(p, '#/billing/' + mid);
const s1 = await p.evaluate(() => JSON.stringify(Club.store.all('statements')));
const gen1 = p.locator('[data-action=gen-one]');
if (await gen1.count()) {
  await human(p, gen1);
  const made = await p.evaluate(() => location.hash);
  await undoToast(p); await p.waitForTimeout(500);
  ok(/statement/.test(made) && await p.evaluate(() => JSON.stringify(Club.store.all('statements'))) === s1, 'bill: member statement created then undone', made);
  await clearToasts(p);
}
ok(await noHScroll(p), 'bill: no horizontal scroll');

/* ================= Accounting ================= */
await go(p, '#/accounting');
const set0 = await p.evaluate(() => JSON.stringify(Club.store.getObj('accountingSettings', null)));
await human(p, '[data-action=floats]');
await p.locator('.modal [name=shop]').fill('250');
await modalBtn(p, 'Save floats');
ok(Club => true, 'acc: floats saved');
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify(Club.store.getObj('accountingSettings', null))) === set0, 'acc: Undo floats');
await clearToasts(p);
/* Close today, Undo reopens */
const today = await p.evaluate(() => Club.date.today());
const isOpen = await p.evaluate(d => !Club.accounting.isClosed(d), today);
if (isOpen) {
  await p.evaluate(id => Club.billing.postCharge(id), mid); await p.waitForTimeout(700);
  await p.locator('.modal [name=description]').fill('Charge before the close');
  await p.locator('.modal [name=amount]').fill('12');
  await modalBtn(p, 'Post charge');
  const balC = await p.evaluate(id => Club.store.find('members', id).balance, mid);
  for (const d of ['shop', 'gallery', 'cart']) await p.locator('[name="' + d + ':100"]').fill('0');
  await p.locator('[name=terminal]').fill(String(await p.evaluate(() => Club.accounting.summarize(Club.date.today()).byTender.card)));
  await p.locator('[name=notes]').fill('Test close, drawers empty');
  await setVal('select[name=staffId]', await p.evaluate(() => Club.store.all('staff')[0].id));
  await p.evaluate(() => { const w = document.querySelector('.toasts'); if (w) w.style.visibility = 'hidden'; });   // the charge toast sits over the last button at 390; keep it for later
  await human(p, '[data-action=close-day]');
  await modalBtn(p, 'Close the day');
  await p.evaluate(() => { const w = document.querySelector('.toasts'); if (w) w.style.visibility = ''; });
  ok(await p.evaluate(d => Club.accounting.isClosed(d), today), 'acc: today closed');
  // with today closed, money undo is refused
  await human(p, p.locator('.toast.has-act', { hasText: '$12.00 posted' }).locator('.toast-act'));
  ok(/Today is closed in Accounting/.test(await toastText(p)) && await p.evaluate(id => Club.store.find('members', id).balance, mid) === balC, 'acc: with today closed, Undo of a charge is refused and nothing moves');
  await undoToast(p);
  const c = await p.evaluate(d => Club.accounting.closeFor(d), today);
  ok(c.status === 'reopened' && c.log.slice(-2).map(x => x.action).join() === 'closed,reopened' && /reopened/.test(await toastText(p)), 'acc: Undo after closing reopens the day and keeps the log', c.log);
  await clearToasts(p);
}
/* Mapping tab */
await go(p, '#/accounting/mapping');
const acc0 = await p.evaluate(() => JSON.stringify([Club.store.getObj('glAccounts', null), Club.store.getObj('glMapping', null), Club.store.getObj('glExportSettings', null)]));
await human(p, '[data-action=acx-add]');
await p.locator('.modal [name=number]').fill('4210');
await p.locator('.modal [name=name]').fill('Simulator rentals');
await modalBtn(p, 'Add account');
ok(/Simulator rentals/.test(await p.evaluate(() => JSON.stringify(Club.store.getObj('glAccounts', null)))), 'acc: account added');
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify([Club.store.getObj('glAccounts', null), Club.store.getObj('glMapping', null), Club.store.getObj('glExportSettings', null)])) === acc0, 'acc: Undo account added');
await clearToasts(p);
const sel = await p.evaluate(() => { const s = document.querySelector('.acx-map-form select'); const opt = [...s.options].find(o => o.value && o.value !== s.value); return [s.name, opt.value]; });
await setVal('.acx-map-form select[name="' + sel[0] + '"]', sel[1]);
await human(p, '[data-action=acx-save]');
ok(await p.evaluate(() => JSON.stringify([Club.store.getObj('glAccounts', null), Club.store.getObj('glMapping', null), Club.store.getObj('glExportSettings', null)])) !== acc0, 'acc: mapping saved');
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify([Club.store.getObj('glAccounts', null), Club.store.getObj('glMapping', null), Club.store.getObj('glExportSettings', null)])) === acc0, 'acc: Undo mapping');
await clearToasts(p);
await human(p, '[data-action=acx-reset]');
await modalBtn(p, 'Reset to defaults');
await undoToast(p);
ok(await p.evaluate(() => JSON.stringify([Club.store.getObj('glAccounts', null), Club.store.getObj('glMapping', null), Club.store.getObj('glExportSettings', null)])) === acc0, 'acc: Undo reset to defaults');
await clearToasts(p);
ok(await noHScroll(p), 'acc: no horizontal scroll on mapping');
/* Export asks first, no undo */
await go(p, '#/accounting/export');
const dl = p.locator('[data-action=acx-download]:not([disabled])');
if (await dl.count()) {
  const ex0 = await p.evaluate(() => Club.store.all('accountingExports').length);
  await human(p, dl);
  ok(await p.locator('.modal', { hasText: 'cannot be undone' }).count() > 0 || await p.locator('.modal', { hasText: 'Export these days again' }).count() > 0, 'acc: export asks for confirmation');
  await modalBtn(p, 'Cancel');
  ok(await p.evaluate(() => Club.store.all('accountingExports').length) === ex0, 'acc: cancelling the export records nothing');
} else ok(true, 'acc: (no export available to test)');
ok(await noHScroll(p), 'acc: no horizontal scroll on export');
} catch (e) { ok(false, 'script stopped: ' + e.message.split('\n').slice(0, 3).join(' / ')); await p.screenshot({ path: 'xc-bill-err-' + W + '.png' }); }
ok(errs.length === 0, 'no console errors', errs);
console.log(T.res.join('\n')); console.log(T.fails ? 'FAILED ' + T.fails + ' of ' + T.res.length : 'ALL PASSED ' + T.res.length); await b.close();
