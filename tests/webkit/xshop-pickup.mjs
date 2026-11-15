/* Pay at pickup: public guest and portal member place unpaid orders; staff take payment with the tee sheet till; Picked up asks for payment first. */
import { webkit } from 'playwright';
import { B, mk, click, type, overflow } from './xe-lib.mjs';
const { res, ok, fails } = mk();
const errs = [];
const b = await webkit.launch();
async function ctx(w, lang, member) {
  const c = await b.newContext({ viewport: { width: w, height: w > 500 ? 900 : 844 } });
  await c.addInitScript(([lang, member]) => { try { localStorage.setItem('stboniface.lang', lang); if (member) localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} }, [lang, member]);
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(w + ' ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(w + ' console: ' + m.text()); });
  return { c, p };
}
const at = p => p.evaluate(() => { const f = document.querySelector('.ckf'); return f ? f.dataset.at : null; });
const missing = (p, sel) => p.evaluate(s => { const m = Club.i18n && Club.i18n.missing ? Club.i18n.missing() : []; const root = document.querySelector(s); if (!root) return []; const txt = root.innerText;
  const data = new Set(); Club.store.all('products').forEach(x => data.add(x.name)); return m.map(x => typeof x === 'string' ? x : x.text || String(x)).filter(t => t && txt.includes(t) && !data.has(t) && !/Pat Tester|Dave|Nerada/.test(t)); }, sel);

for (const W of [1440, 390]) {
  for (const lang of ['en', 'fr']) {
    /* ---- public guest ---- */
    const tag = `[${lang} ${W} public]`;
    const { c, p } = await ctx(W, lang, false);
    await p.goto(B + 'public.html#/shop'); await p.waitForTimeout(1300);
    const pid = await p.evaluate(() => { Club.shop.clearCart('guest'); const x = Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 3)[0]; Club.shop.addToCart('guest', x.id, 2); return x.id; });
    const stock0 = await p.evaluate(id => Club.store.find('products', id).stock, pid);
    const n0 = await p.evaluate(() => ({ rc: Club.store.all('receipts').length, sales: Club.store.all('sales').length }));
    await p.goto(B + 'public.html#/shop/basket'); await p.waitForTimeout(1200);
    await type(p, '#sh-name', 'Pat Tester'); await type(p, '#sh-gphone', '2045550123'); await type(p, '#sh-email', 'pat@example.com');
    await click(p, '.ckf-step:not([hidden]) .ckf-next');
    ok(await at(p) === 'pay', tag + ' on Payment');
    await click(p, '.ck-mopt:has(input[value=pickup])');
    const vis = await p.evaluate(() => ({ note: !document.querySelector('.ck-pickup').hidden, card: !!document.querySelector('.ck-pay').hidden }));
    ok(vis.note && vis.card, tag + ' Pay at pickup: note shown, no card fields', vis);
    await p.screenshot({ path: `pk-${lang}-${W}-pub-pay.png` });
    await click(p, '.ckf-step:not([hidden]) .ckf-next');
    ok(await at(p) === 'review', tag + ' Review');
    const lbl = await p.locator('.sh-place').textContent();
    ok(lang === 'en' ? /Place order · pay at pickup/.test(lbl) : /payer à la cueillette/.test(lbl), tag + ' Place order label says pay at pickup', lbl);
    if (lang === 'fr') { const m = await missing(p, '.sh-pay'); ok(!m.length, tag + ' no English in checkout', m); }
    await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1500 });
    const o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o && { id: o.id, m: o.pay.method, rc: o.pay.receiptId, sale: o.saleId, total: o.total, status: o.status }; });
    const n1 = await p.evaluate(() => ({ rc: Club.store.all('receipts').length, sales: Club.store.all('sales').length }));
    const stock1 = await p.evaluate(id => Club.store.find('products', id).stock, pid);
    ok(o && o.m === 'pickup' && !o.rc && !o.sale && o.status === 'new' && n1.rc === n0.rc && n1.sales === n0.sales && stock1 === stock0 - 2, tag + ' unpaid order: no receipt, no sale, stock taken', { o, n0, n1, stock0, stock1 });
    const conf = await p.evaluate(() => document.querySelector('.sh-pickup-pay') && document.querySelector('.sh-pickup-pay').innerText);
    ok(conf && (lang === 'en' ? /Pay at pickup[\s\S]*to pay at the golf shop counter/.test(conf) : /Payer à la cueillette[\s\S]*à payer au comptoir[\s\S]*d’ici là/.test(conf)), tag + ' confirmation shows Pay at pickup', conf);
    if (lang === 'fr') { const m = await missing(p, '.sh-done'); ok(!m.length, tag + ' confirmation all French', m); }
    await p.screenshot({ path: `pk-${lang}-${W}-pub-done.png` });
    await p.goto(B + 'public.html#/shop/orders'); await p.waitForTimeout(1200);
    const hist = await p.evaluate(id => { const c = document.querySelector('[data-order="' + id + '"]'); return c && c.innerText; }, o.id);
    ok(hist && (lang === 'en' ? /Pay at pickup/.test(hist) : /cueillette/.test(hist)), tag + ' order history shows Pay at pickup', hist);
    if (lang === 'fr') { const m = await missing(p, '.sh-ocards'); ok(!m.length, tag + ' order history all French', m); }
    await p.screenshot({ path: `pk-${lang}-${W}-pub-orders.png` });
    if (lang === 'en') {
      /* customer cancels: nothing charged */
      await click(p, `[data-order="${o.id}"] [data-sh-cancel]`); await click(p, '.modal-foot .btn-danger, .modal-foot button:has-text("Cancel order")');
      const cx = await p.evaluate(id => { const o = Club.shop.get(id); return { st: o.status, ref: o.refund && o.refund.amount, rc: Club.store.all('receipts').filter(r => r.refId === id).length, txt: document.querySelector('[data-order="' + id + '"] .sh-ocard-pay').textContent }; }, o.id);
      ok(cx.st === 'cancelled' && cx.ref === 0 && cx.rc === 0 && /nothing was charged/.test(cx.txt), tag + ' cancelled online: nothing charged, no receipts', cx);
    }
    await c.close();
  }
  /* ---- portal member, then staff takes payment ---- */
  const tag = `[en ${W} portal+staff]`;
  const { c, p } = await ctx(W, 'en', true);
  await p.goto(B + 'member.html#/shop'); await p.waitForTimeout(1200);
  await p.evaluate(() => { Club.shop.clearCart('mem_mem_1003'); Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 3).slice(0, 2).forEach(x => Club.shop.addToCart('mem_mem_1003', x.id, 1)); });
  await p.goto(B + 'member.html#/shop/basket'); await p.waitForTimeout(1200);
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  if (await at(p) === 'details') { await type(p, '#sh-phone', '2045550123'); await click(p, '.ckf-step:not([hidden]) .ckf-next'); }
  ok(await p.locator('.ck-mopt').count() === 4, tag + ' member sees account, card, gift card and pay at pickup');
  await click(p, '.ck-mopt:has(input[value=pickup])'); await click(p, '.ckf-step:not([hidden]) .ckf-next');
  const bal0 = await p.evaluate(() => Club.store.find('members', 'mem_1003').balance);
  if (W < 500 && await p.locator('.sh-place >> visible=true').count() === 0) await click(p, '.p-actionbar button, .pab button'); else await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1500 });
  await p.waitForTimeout(800);
  const po = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o && { id: o.id, no: o.no, m: o.pay.method, total: o.total, bal: Club.store.find('members', 'mem_1003').balance }; });
  ok(po && po.m === 'pickup' && po.bal === bal0, tag + ' member order unpaid, balance unchanged', po);
  await p.screenshot({ path: `pk-en-${W}-portal-done.png` });
  /* staff (same browser storage) */
  await p.goto(B + 'index.html#/proshop/online'); await p.waitForTimeout(1500);
  const card = `.ps-oc[data-order="${po.id}"]`;
  ok(/To pay at pickup/.test(await p.locator(card).innerText()), tag + ' staff card shows To pay at pickup');
  await p.screenshot({ path: `pk-en-${W}-staff-card.png` });
  /* Picked up asks for payment first */
  await click(p, `${card} [data-oc="picked-up"]`);
  ok(/Take payment first/.test(await p.locator('.modal').last().innerText()), tag + ' Picked up on an unpaid order asks to take payment');
  await click(p, '.modal-foot button:has-text("Take payment")', { wait: 700 });
  ok(await p.locator('.ts-pay').count() === 1, tag + ' till opens');
  const due = await p.evaluate(() => document.querySelector('.ts-pay-due strong').textContent);
  ok(due.replace(/[^\d.]/g, '') === po.total.toFixed(2), tag + ' till total equals the order total', { due, total: po.total });
  await p.screenshot({ path: `pk-en-${W}-staff-till.png` });
  await click(p, '.ts-pay [data-tender="cash"]'); await click(p, '.ts-pay [data-cash]'); await click(p, '.modal-foot button:has-text("Record payment")', { wait: 700 });
  const paid = await p.evaluate(id => { const o = Club.shop.get(id); const r = Club.receipts.get(o.pay.receiptId); const s = Club.store.find('sales', o.saleId);
    return { st: o.status, paidAt: !!o.pay.paidAt, cash: o.pay.cashAmount, rc: r && { mem: r.memberId, method: r.method, total: r.total, ch: r.channel }, sale: s && { pay: s.payment, total: s.total, ch: s.channel }, portal: Club.receipts.forMember('mem_1003').some(x => x.id === o.pay.receiptId), t: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|') }; }, po.id);
  ok(paid.st === 'picked-up' && paid.paidAt && paid.cash === po.total && paid.rc && paid.rc.mem === 'mem_1003' && paid.rc.method === 'cash' && paid.rc.total === po.total && paid.rc.ch === 'counter' && paid.sale && paid.sale.pay === 'Cash' && paid.portal && /paid, .* by cash, and picked up/.test(paid.t),
    tag + ' paid by cash and picked up: receipt to the member (portal), cash sale', paid);
  /* Undo */
  await click(p, '.toast.has-act:not(.leaving) .toast-act');
  const und = await p.evaluate(id => { const o = Club.shop.get(id); return { st: o.status, unpaid: Club.shop.unpaid(o), credit: Club.store.all('receipts').filter(r => r.refId === id && r.kind === 'credit').length, refund: Club.store.all('sales').filter(s => s.orderId === id).reduce((a, s) => a + s.total, 0) }; }, po.id);
  ok(und.st === 'new' && und.unpaid && und.credit === 1 && Math.abs(und.refund) < 0.001, tag + ' Undo: unpaid and new again, credit receipt, sales net to zero', und);
  /* Take payment from the drawer, by card */
  await p.waitForTimeout(500);
  await click(p, `.ps-oc[data-order="${po.id}"] .ps-oc-items`, { wait: 700 });
  ok(await p.locator('.od-drawer [data-oc="pay"]').count() === 1 && /To pay at pickup/.test(await p.locator('.od-drawer').innerText()), tag + ' drawer shows To pay at pickup and Take payment');
  await p.screenshot({ path: `pk-en-${W}-staff-drawer.png` });
  await click(p, '.od-drawer [data-oc="pay"]', { wait: 600 });
  await click(p, '.modal-foot button:has-text("Record payment")', { wait: 700 });
  const paid2 = await p.evaluate(id => { const o = Club.shop.get(id); return { st: o.status, card: o.pay.cardAmount, label: o.pay.label, noPay: !document.querySelector('.od-drawer [data-oc=pay]'), drawer: document.querySelector('.od-drawer') && document.querySelector('.od-drawer').innerText }; }, po.id);
  ok(paid2.st === 'new' && paid2.card === po.total && /Card at pickup/.test(paid2.drawer || '') && paid2.noPay, tag + ' card payment from the drawer; drawer shows Card at pickup', paid2);
  await p.goto(B + 'member.html#/shop/orders'); await p.waitForTimeout(1300);
  const ph = await p.evaluate(id => { const c = document.querySelector('[data-order="' + id + '"]'); return c && c.innerText; }, po.id);
  ok(/Paid at pickup · Card/.test(ph || '') && /Receipt/.test(ph || ''), tag + ' portal order history shows Paid at pickup with a receipt', ph);
  ok(await overflow(p) <= 0, tag + ' no sideways scroll');
  await c.close();
}
await b.close();
ok(!errs.length, 'no page or console errors', errs.slice(0, 8));
console.log(res.join('\n')); console.log(`\n${res.filter(x => x.startsWith('PASS')).length} passed, ${fails()} failed`);
