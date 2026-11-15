/* Dining: adding more of an item already on a check, then Undo, puts the quantity back (bug fixed Nov 13). */
import { suite, open, human, undo, modalBtn } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'dining', T);
  try {
    await human(p, p.locator('.tab', { hasText: 'Orders' }).first()); await p.waitForTimeout(700);
    const oid = await p.evaluate(() => { const c = document.querySelector('[data-order] [data-o=add]'); return c ? c.closest('[data-order]').dataset.order : null; });
    ok(!!oid, W + ': an open check with Add items');
    const addOne = async () => {
      await human(p, '[data-order="' + oid + '"] [data-o=add]'); await p.waitForTimeout(400);
      const inc = p.locator('.modal .dn-add-row:not(.off) [data-inc]').first();
      const mid = await inc.getAttribute('data-inc');
      await human(p, inc); await human(p, p.locator('.modal-foot .btn-primary').last()); await p.waitForTimeout(500);
      return mid;
    };
    const mid = await addOne();
    const q1 = await p.evaluate(([o, m]) => Club.store.find('diningOrders', o).items.filter(l => l.menuItemId === m && !l.fired).reduce((a, l) => a + l.qty, 0), [oid, mid]);
    await addOne();
    const q2 = await p.evaluate(([o, m]) => Club.store.find('diningOrders', o).items.filter(l => l.menuItemId === m && !l.fired).reduce((a, l) => a + l.qty, 0), [oid, mid]);
    ok(q2 === q1 + 1, W + ': adding the same item again adds to its line (' + q1 + ' to ' + q2 + ')', { q1, q2 });
    await undo(p);
    const q3 = await p.evaluate(([o, m]) => Club.store.find('diningOrders', o).items.filter(l => l.menuItemId === m && !l.fired).reduce((a, l) => a + l.qty, 0), [oid, mid]);
    ok(q3 === q1, W + ': Undo puts the quantity back to ' + q1, { q1, q2, q3 });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n').slice(0, 3).join(' / ')); }
  await b.close();
}
ok(!T.errs.length, 'no page or console errors', T.errs);
T.done();
