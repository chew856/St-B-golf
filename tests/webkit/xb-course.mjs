import { suite, open, human, undo, toastText, modalBtn, noHScroll, setVal } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const go = async (p, h) => { await p.evaluate(h => { location.hash = '#/' + h; }, h); await p.waitForTimeout(900); };
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'course/status', T);
  const ev = (f, a) => p.evaluate(f, a);
  const hole = n => ev(n => Club.store.getObj('courseStatus').holes.find(h => h.number === n).status, n);
  try {
    /* hole status, undo; an older undo is refused after a newer change */
    const h3 = await hole(3);
    await human(p, '.cg-strip-btn[data-hole="3"]'); await human(p, '.cg-dt .segmented[data-name=holeStatus] button[data-value="GUR"]');
    const a1 = await hole(3); await undo(p);
    ok(a1 === 'GUR' && await hole(3) === h3, W + ': hole 3 marked GUR, Undo puts it back', { h3, a1 });
    await human(p, '.cg-dt .segmented[data-name=holeStatus] button[data-value="GUR"]');
    await human(p, '.cg-strip-btn[data-hole="4"]'); await human(p, '.cg-dt .segmented[data-name=holeStatus] button[data-value="closed"]');
    await human(p, p.locator('.toast.has-act:not(.leaving) .toast-act').first());
    ok(await hole(3) === 'GUR' && /changed since/.test(await toastText(p)), W + ': older hole Undo refused after a newer change');
    await undo(p);
    ok(await hole(4) === 'open' && await hole(3) === 'GUR', W + ': newest hole change still undoes');
    /* conditions */
    const gs0 = await ev(() => Club.store.getObj('courseStatus').greenSpeed);
    await human(p, '[data-acc="cg-cond"] .pk-acc-head'); await setVal(p, '.cg-cond-form [name=greenSpeed]', '12.3'); await human(p, '[data-action=save-cond]');
    const gs1 = await ev(() => Club.store.getObj('courseStatus').greenSpeed); await undo(p);
    ok(gs1 === 12.3 && await ev(() => Club.store.getObj('courseStatus').greenSpeed) === gs0, W + ': conditions published, Undo restores the earlier ones', { gs0, gs1 });
    /* work orders */
    await go(p, 'course/work'); const w0 = await ev(() => Club.store.all('workOrders').length);
    await human(p, '[data-action=new-wo]'); await setVal(p, '.modal [name=title]', 'Rake bunker 7 faces'); await setVal(p, '.modal [name=area]', 'Bunkers');
    await setVal(p, '.modal [name=assigneeId]', await ev(() => document.querySelector('.modal [name=assigneeId] option[value^="stf"]').value));
    await modalBtn(p, 'Create work order'); await p.waitForTimeout(400);
    const w1 = await ev(() => Club.store.all('workOrders').length); await undo(p);
    ok(w1 === w0 + 1 && await ev(() => Club.store.all('workOrders').length) === w0, W + ': work order created, Undo removes it');
    const mv = await ev(() => { const b = document.querySelector('[data-action=move-wo]'); return b.dataset.id; }); const [wid, to] = mv.split('|');
    const ws0 = await ev(id => Club.store.find('workOrders', id).status, wid);
    await human(p, '[data-action=move-wo][data-id="' + mv + '"]'); const ws1 = await ev(id => Club.store.find('workOrders', id).status, wid); await undo(p);
    ok(ws1 === to && await ev(id => Club.store.find('workOrders', id).status, wid) === ws0 && /Moved back/.test(await toastText(p)), W + ': moved, Undo moves it back', { ws0, ws1 });
    const wo0 = await ev(id => JSON.stringify(Club.store.find('workOrders', id)), wid);
    await human(p, '[data-action=edit-wo][data-id="' + wid + '"]'); await setVal(p, '.modal [name=title]', 'Edited title here'); await modalBtn(p, 'Save work order'); await p.waitForTimeout(300); await undo(p);
    ok(await ev(id => JSON.stringify(Club.store.find('workOrders', id)), wid) === wo0, W + ': work order saved, Undo restores it exactly');
    const wi = await ev(id => Club.store.all('workOrders').findIndex(w => w.id === id), wid);
    await human(p, '[data-action=edit-wo][data-id="' + wid + '"]'); await modalBtn(p, 'Delete'); await p.waitForTimeout(300); await modalBtn(p, 'Delete work order'); await p.waitForTimeout(400);
    const wg = await ev(id => !Club.store.find('workOrders', id), wid); await undo(p);
    ok(wg && await ev(id => Club.store.all('workOrders').findIndex(w => w.id === id), wid) === wi, W + ': work order deleted, Undo restores it in place');
    /* equipment */
    await go(p, 'course/equipment'); const e0 = await ev(() => Club.store.all('equipment').length);
    await human(p, '[data-action=new-eq]'); for (const [k, v] of [['unitNo', 'Z-99'], ['name', 'Test mower'], ['make', 'Toro'], ['model', 'X1']]) await setVal(p, '.modal [name=' + k + ']', v);
    await modalBtn(p, 'Add unit'); await p.waitForTimeout(400); const e1 = await ev(() => Club.store.all('equipment').length); await undo(p);
    ok(e1 === e0 + 1 && await ev(() => Club.store.all('equipment').length) === e0, W + ': unit added, Undo removes it');
    const eid = await ev(() => document.querySelector('[data-action=svc-eq]').dataset.id); const eq0 = await ev(id => JSON.stringify(Club.store.find('equipment', id)), eid);
    await human(p, '[data-action=svc-eq][data-id="' + eid + '"]'); await modalBtn(p, 'Log service'); await p.waitForTimeout(300);
    const svc = await ev(id => Club.store.find('equipment', id).lastServiceDate, eid); await undo(p);
    ok(svc === await ev(() => Club.date.today()) && await ev(id => JSON.stringify(Club.store.find('equipment', id)), eid) === eq0, W + ': service logged, Undo restores the unit exactly');
    const shopBtn = await ev(() => { const b = document.querySelector('[data-action=shop-eq]'); return b && b.dataset.id; });
    await human(p, '[data-action=shop-eq][data-id="' + shopBtn + '"]'); const sh1 = await ev(id => Club.store.find('equipment', id).status, shopBtn); await undo(p);
    ok(sh1 === 'in-shop' && await ev(id => Club.store.find('equipment', id).status, shopBtn) === 'in-service', W + ': sent to shop, Undo back in service');
    await human(p, '[data-action=shop-eq][data-id="' + shopBtn + '"]'); await human(p, '[data-action=ret-eq][data-id="' + shopBtn + '"]'); const sh2 = await ev(id => Club.store.find('equipment', id).status, shopBtn); await undo(p);
    ok(sh2 === 'in-service' && await ev(id => Club.store.find('equipment', id).status, shopBtn) === 'in-shop', W + ': returned, Undo back in the shop');
    await human(p, '[data-action=ret-eq][data-id="' + shopBtn + '"]');
    const eq1 = await ev(id => JSON.stringify(Club.store.find('equipment', id)), eid);
    await human(p, '[data-action=edit-eq][data-id="' + eid + '"]'); await setVal(p, '.modal [name=name]', 'Renamed unit'); await modalBtn(p, 'Save unit'); await p.waitForTimeout(300); await undo(p);
    ok(await ev(id => JSON.stringify(Club.store.find('equipment', id)), eid) === eq1, W + ': unit saved, Undo restores it');
    /* Golf carts, Chemical log and Weather & agronomy were taken off the page (Nov 12) */
    await go(p, 'course');
    const tabs = await ev(() => [...document.querySelectorAll('.cg-tabs .tab')].map(t => t.textContent.trim()));
    ok(tabs.join('|') === 'Course status|Work orders|Equipment', W + ': only Course status, Work orders and Equipment tabs', tabs);
    await go(p, 'course/carts');
    ok(await ev(() => document.querySelector('.cg-tabs .tab.active').textContent.trim()) === 'Course status', W + ': an old link to a removed tab opens Course status');
    ok(await noHScroll(p), W + ': no horizontal scroll');
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xb-course-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
