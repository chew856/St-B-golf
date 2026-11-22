/* Multi-step checkout (Club.checkout.steps): every flow end to end in WebKit with human clicks, EN and FR, 1440 and 390.
   node xe-checkout.mjs [en|fr] [1440|390] [flow,...] */
import { webkit } from 'playwright';
import { B, mk, click, type, overflow } from './xe-lib.mjs';
const { res, ok, fails } = mk();
const LANGS = process.argv[2] ? [process.argv[2]] : ['en', 'fr'];
const WIDTHS = process.argv[3] ? [+process.argv[3]] : [1440, 390];
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const SH = 'xe-shots/';
const errs = [];
const b = await webkit.launch();

async function ctx(w, lang, member) {
  const c = await b.newContext({ viewport: { width: w, height: w > 500 ? 900 : 844 } });
  await c.addInitScript(([lang, member]) => { try { localStorage.setItem('stboniface.lang', lang); if (member) localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} }, [lang, member]);
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(lang + ' ' + w + ' ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(lang + ' ' + w + ' console: ' + m.text()); });
  return { c, p };
}
const at = (p, scope) => p.evaluate((s) => { const f = document.querySelector((s || '') + ' .ckf'); return f ? f.dataset.at : null; }, scope || '');
async function noScroll(p, tag) { const o = await overflow(p); ok(o <= 0, tag + ' no horizontal scroll', o); }
async function shot(p, name) { await p.waitForTimeout(250); await p.screenshot({ path: SH + name + '.png', fullPage: false }); }
async function shotStep(p, name, sel) { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(300); await p.screenshot({ path: SH + name + '.png' }); }
async function missingIn(p, sel) {
  return p.evaluate((s) => { const m = (Club.i18n && Club.i18n.missing) ? Club.i18n.missing() : []; const root = document.querySelector(s); if (!root) return []; const txt = root.innerText; /* data stays as typed or as the club named it: people's names, menu items, what the test typed */
    const data = new Set(); Club.store.all('menuItems').forEach(i => data.add(i.name)); Club.store.all('members').concat(Club.store.all('publicPlayers')).forEach(x => { data.add(x.firstName); data.add(x.firstName + ' ' + x.lastName); });
    const typed = ['Jamie Smith', 'Pat Tester', 'Pat'];
    return m.map(x => typeof x === 'string' ? x : x.text || String(x)).filter(t => t && txt.includes(t) && !data.has(t) && !typed.some(y => y.startsWith(t))); }, sel);
}
async function noteHidden(p) { return p.evaluate(() => { const n = document.querySelector('.ck-acct-note'); return !n || getComputedStyle(n).display === 'none'; }); }
async function fillCard(p, num, exp = '12/30', cvc = '123') {
  await type(p, '.ck .cc-in-num', num);
  if (!(await p.inputValue('.ck .cc-in-name'))) await type(p, '.ck .cc-in-name', 'Pat Tester'); await type(p, '.ck .cc-in-exp', exp); await type(p, '.ck .cc-in-cvc', cvc);
}
async function seedGift(p, amount) { return p.evaluate((a) => Club.giftcards.issue({ amount: a, recipient: { name: 'Test' }, source: 'staff' }).code, amount); }
/* A card stored by an older version: it must no longer be shown or used anywhere. */
async function seedSaved(p) {
  await p.evaluate(() => { const w = Club.store.getObj('portalWallet', {}) || {}; w.mem_1003 = Object.assign({}, w.mem_1003 || {}, { cards: [{ id: 'card_xe1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, name: 'Dave Nerada' }] }); Club.store.setObj('portalWallet', w); });
}
async function applyGift(p, code) { await click(p, '.ck-mopt:has(input[value=gift])'); await type(p, '.ck .gc-box-in', code); await click(p, '.ck .gc-box-apply'); }
const T = (lang, en, fr) => lang === 'fr' ? fr : en;

/* ---------------- Portal shop ---------------- */
async function portalShop(lang, w) {
  const tag = `[${lang} ${w} portal shop]`;
  const { c, p } = await ctx(w, lang, true);
  await p.goto(B + 'member.html#/shop'); await p.waitForTimeout(1200);
  const seed = async () => { await p.evaluate(() => { Club.shop.clearCart('mem_mem_1003'); Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 3).slice(0, 2).forEach(x => Club.shop.addToCart('mem_mem_1003', x.id, 1)); }); await p.goto(B + 'member.html#/shop/basket'); await p.waitForTimeout(1100); };
  await seed(); await seedSaved(p);
  await p.goto(B + 'member.html#/shop'); await p.waitForTimeout(500); await p.goto(B + 'member.html#/shop/basket'); await p.waitForTimeout(1100);
  ok(await at(p) === 'details', tag + ' starts on Details');
  ok(await p.locator('.ckf-pb[aria-current=step]').count() === 1, tag + ' current step marked aria-current');
  await shot(p, `xe-${lang}-${w}-pshop-1-details`);
  /* validation on Details */
  await type(p, '.sh-pay input[name=phone]', '12');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'details', tag + ' bad phone stays on Details');
  ok(await p.locator('[data-ckf-step=details] .field-error' + ' >> visible=true').count() > 0, tag + ' phone error shown on Details');
  await type(p, '.sh-pay input[name=phone]', '204-555-0199');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'pay', tag + ' Continue goes to Payment');
  ok(await p.evaluate(() => document.querySelector('.ckf-sr').textContent), tag + ' step announced', await p.evaluate(() => document.querySelector('.ckf-sr').textContent));
  ok(!(await noteHidden(p)), tag + ' account note shows with Charge to my account');
  await shot(p, `xe-${lang}-${w}-pshop-2-payment`);
  await click(p, '.ck-mopt:has(input[value=card])');
  ok(await noteHidden(p), tag + ' account note hidden with Pay by card');
  await shotStep(p, `xe-${lang}-${w}-pshop-2-card`, '.ck-card');
  /* no saved cards and nothing to save a card with: the card form is always a fresh entry */
  ok(await p.locator('.ck input[type=radio][name^=ck-card], .ck-cards, [name=ck-save]').count() === 0, tag + ' no saved-card list or save checkbox');
  ok(!/4242/.test(await p.locator('.ck').innerText()) || /4242 4242 4242 4242/.test(await p.locator('.ck').innerText()), tag + ' old stored card not shown');
  ok(await p.locator('.ck .cc-in-num' + ' >> visible=true').count() === 1, tag + ' new card form shown straight away');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'pay', tag + ' empty card stays on Payment');
  ok(await p.locator('.ck .cc .field-error' + ' >> visible=true').count() >= 3, tag + ' card errors on Payment');
  /* Back keeps what was typed */
  await click(p, '.ckf-step:not([hidden]) .ckf-back');
  ok(await at(p) === 'details', tag + ' Back to Details');
  { const v = await p.inputValue('.sh-pay input[name=phone]'); ok(v.replace(/\D/g, '') === '2045550199', tag + ' phone kept after Back', v); }
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await p.locator('.ck-mopt input[value=card]').isChecked(), tag + ' Pay by card kept after Back');
  await fillCard(p, '4242 4242 4242 4242');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'review', tag + ' new card goes to Review');
  const rv = await p.locator('.sh-review').innerText();
  ok(/4242/.test(rv), tag + ' review names the card', rv.slice(0, 200));
  ok(/(Tax|Taxes|TPS)/i.test(rv), tag + ' review shows tax');
  await shot(p, `xe-${lang}-${w}-pshop-3-review`);
  if (lang === 'fr') { const m = await missingIn(p, '.sh-pay'); ok(!m.length, tag + ' no English left in checkout', m); }
  await noScroll(p, tag);
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1400 });
  ok(/#\/shop\/order\//.test(p.url()), tag + ' card: order placed', p.url());
  let o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o ? { m: o.pay.method, rc: !!(o.pay.receiptId && Club.receipts.get(o.pay.receiptId)), last4: o.pay.last4 } : null; });
  ok(o && o.m === 'card' && o.last4 === '4242' && o.rc, tag + ' card order paid by card with receipt', o);
  ok(await p.evaluate(() => JSON.stringify((Club.store.getObj('portalWallet', {}) || {}).mem_1003 || {})) === JSON.stringify({ cards: [{ id: 'card_xe1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, name: 'Dave Nerada' }] }), tag + ' nothing new written to the wallet');
  await shot(p, `xe-${lang}-${w}-pshop-4-placed`);
  /* account charge */
  await seed();
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  await click(p, '.ck-mopt:has(input[value=account])');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(/(member account|compte de membre)/i.test(await p.locator('.sh-review').innerText()), tag + ' review says charged to account');
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1400 });
  o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o ? { m: o.pay.method, rc: !!(o.pay.receiptId && Club.receipts.get(o.pay.receiptId)) } : null; });
  ok(o && o.m === 'account' && o.rc, tag + ' account order with receipt', o);
  /* new card, with validation, then a declined card shown on Payment */
  await seed();
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  await click(p, '.ck-mopt:has(input[value=card])');
  ok(await p.inputValue('.ck .cc-in-num') === '', tag + ' card form cleared after the last order');
  await fillCard(p, '4000 0000 0000 0002');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'review', tag + ' declined card reaches Review');
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 900 });
  ok(await at(p) === 'pay' && await p.locator('.ck-alert' + ' >> visible=true').count() === 1, tag + ' declined shown on Payment');
  await fillCard(p, '4242 4242 4242 4242');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(/Visa/.test(await p.locator('.sh-review').innerText()), tag + ' review shows the new Visa');
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1400 });
  o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o ? { m: o.pay.method, rc: !!(o.pay.receiptId && Club.receipts.get(o.pay.receiptId)) } : null; });
  ok(o && o.m === 'card' && o.rc, tag + ' new card order with receipt', o);
  /* gift card partial, rest to the account */
  await seed();
  const code = await seedGift(p, 20);
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  await applyGift(p, code);
  ok(await p.locator('.ck-rest' + ' >> visible=true').count() === 1, tag + ' gift partial shows Left to pay');
  await shotStep(p, `xe-${lang}-${w}-pshop-2-gift`, '.ck-giftpane');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  const rv2 = await p.locator('.sh-review').innerText();
  ok(/(Gift card ending|Carte-cadeau se terminant)/i.test(rv2) && /(member account|compte de membre)/i.test(rv2), tag + ' review lists gift card and account', rv2.slice(0, 300));
  await shot(p, `xe-${lang}-${w}-pshop-3-review-gift`);
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1400 });
  o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o ? { m: o.pay.method, g: o.pay.giftAmount, rc: !!(o.pay.receiptId && Club.receipts.get(o.pay.receiptId)) } : null; });
  ok(o && o.g === 20 && o.rc, tag + ' gift partial order with receipt', o);
  await c.close();
}

/* ---------------- Takeout (portal and public) ---------------- */
async function takeout(lang, w, site) {
  const tag = `[${lang} ${w} ${site} takeout]`;
  const { c, p } = await ctx(w, lang, site === 'portal');
  const url = B + (site === 'portal' ? 'member.html#/takeout' : 'public.html#/takeout');
  await p.goto(url); await p.waitForTimeout(1300);
  const code = await seedGift(p, 10);
  const paused = await p.evaluate(() => Club.takeout.settings().paused);
  if (paused) { ok(true, tag + ' takeout paused, skipped'); await c.close(); return; }
  await click(p, '.to-sec:not(#to-sec-breakfast) .to-add');
  await click(p, '.to-sec:not(#to-sec-breakfast) .to-add');
  ok(await at(p, '.to-order') === 'details', tag + ' starts on Details');
  /* Continue without a time: error on Details */
  await click(p, '.to-order .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, '.to-order') === 'details' && await p.locator('.to-order .field-error' + ' >> visible=true').count() > 0, tag + ' missing time / contact errors on Details');
  /* time through the club's picker */
  let picked = false;
  for (let k = 0; k < 4 && !picked; k++) {
    const has = await p.locator('.to-time-f .cs-btn').count();
    if (has && !(await p.locator('.to-time-f .cs-btn').isDisabled())) {
      await click(p, '.to-time-f .cs-btn');
      await click(p, '.cs-pop .cs-opt:not(.is-off)[data-i]:not([data-i="0"])');
      picked = await p.evaluate(() => !!document.querySelector('select.to-time').value);
    }
    if (!picked) { const days = p.locator('.to-day:not([disabled]):not(.active)'); if (await days.count()) await click(p, days.nth(0)); }
  }
  ok(picked, tag + ' pickup time chosen');
  if (site === 'public') { await type(p, '#to-name', 'Pat Tester'); await type(p, '#to-email', 'pat@example.com'); await type(p, '.to-order input[name=phone]', '204-555-0111'); }
  else await type(p, '.to-order input[name=phone]', '204-555-0111');
  await shotStep(p, `xe-${lang}-${w}-${site}-take-1-details`, '.to-order .ckf');
  await click(p, '.to-order .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, '.to-order') === 'pay', tag + ' goes to Payment');
  if (site === 'portal') { await click(p, '.ck-mopt:has(input[value=card])'); ok(await noteHidden(p), tag + ' account note hidden with Pay by card'); }
  await applyGift(p, code);
  if (site === 'portal') { await click(p, '.ck-rest-m button[data-value=card]'); ok(await noteHidden(p), tag + ' note hidden when rest by card'); }
  await fillCard(p, '4242 4242 4242 4242');
  await shotStep(p, `xe-${lang}-${w}-${site}-take-2-payment`, '.to-order .ck');
  await click(p, '.to-order .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, '.to-order') === 'review', tag + ' goes to Review');
  ok(await p.locator('.to-lines').isHidden(), tag + ' order lines step aside on Review');
  const rv = await p.locator('.to-review').innerText();
  ok(/(Gift card ending|Carte-cadeau)/i.test(rv) && /Visa/.test(rv), tag + ' review lists gift card and Visa', rv.slice(0, 300));
  await shotStep(p, `xe-${lang}-${w}-${site}-take-3-review`, '.to-order .ckf');
  if (lang === 'fr') { const m = await missingIn(p, '.to-order'); ok(!m.length, tag + ' no English left in checkout', m); }
  await noScroll(p, tag);
  /* Back from Review to Payment, then on */
  await click(p, '.to-order .ckf-step:not([hidden]) .ckf-back');
  ok(await at(p, '.to-order') === 'pay', tag + ' Back to Payment');
  await click(p, '.to-order .ckf-step:not([hidden]) .ckf-next');
  const n0 = await p.evaluate(() => Club.store.all('takeoutOrders').length);
  await click(p, '.to-order .ckf-step:not([hidden]) .to-place', { wait: 1500 });
  const o = await p.evaluate((n0) => { const all = Club.store.all('takeoutOrders'); if (all.length <= n0) return null; const o = all.sort((a, b) => String(b.placedAt).localeCompare(String(a.placedAt)))[0]; const pm = o.payment || {}; return { pm: pm.method, g: pm.giftAmount, rc: !!(pm.receiptId && Club.receipts.get(pm.receiptId)) || Club.receipts.forRef('takeout', o.id).length > 0 }; }, n0);
  ok(o && o.rc, tag + ' order placed with receipt', o);
  await shot(p, `xe-${lang}-${w}-${site}-take-4-placed`);
  await c.close();
}

/* ---------------- Gift card purchase (portal and public) ---------------- */
async function gifts(lang, w, site) {
  const tag = `[${lang} ${w} ${site} gifts]`;
  const { c, p } = await ctx(w, lang, site === 'portal');
  await p.goto(B + (site === 'portal' ? 'member.html#/gifts/buy' : 'public.html#/gifts')); await p.waitForTimeout(1300);
  const sc = site === 'portal' ? '.pg-form' : '.gp-form';
  ok(await at(p, sc) === 'details', tag + ' starts on Details');
  await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, sc) === 'details' && await p.locator(sc + ' .field-error' + ' >> visible=true').count() > 0, tag + ' errors on Details');
  await type(p, sc + ' input[name=toName]', 'Jamie Smith'); await type(p, sc + ' input[name=toEmail]', 'jamie@example.com');
  if (site === 'public') { await type(p, 'input[name=buyerFirst]', 'Pat'); await type(p, 'input[name=buyerLast]', 'Tester'); await type(p, 'input[name=buyerEmail]', 'pat@example.com'); await type(p, 'input[name=from]', 'Pat'); }
  await shotStep(p, `xe-${lang}-${w}-${site}-gift-1-details`, sc + ' .ckf');
  await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, sc) === 'pay', tag + ' goes to Payment');
  if (site === 'portal') { ok(!(await noteHidden(p)), tag + ' account note with account'); await click(p, '.ck-mopt:has(input[value=card])'); ok(await noteHidden(p), tag + ' account note hidden with Pay by card'); }
  await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, sc) === 'pay', tag + ' empty card stays on Payment');
  await fillCard(p, '4242 4242 4242 4242');
  await shotStep(p, `xe-${lang}-${w}-${site}-gift-2-payment`, sc + ' .ck');
  await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, sc) === 'review', tag + ' goes to Review');
  const rv = await p.locator(sc + ' .ckf-rv').innerText();
  ok(/Jamie Smith/.test(rv) && /Visa/.test(rv), tag + ' review shows recipient and card', rv.slice(0, 300));
  await shotStep(p, `xe-${lang}-${w}-${site}-gift-3-review`, sc + ' .ckf');
  if (lang === 'fr') { const m = await missingIn(p, sc); ok(!m.length, tag + ' no English left in checkout', m); }
  await noScroll(p, tag);
  /* Edit on review goes back to Details */
  await click(p, sc + ' .ckf-rv-edit[data-ckf-edit=details]');
  ok(await at(p, sc) === 'details', tag + ' Edit returns to Details');
  await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next'); await click(p, sc + ' .ckf-step:not([hidden]) .ckf-next');
  await click(p, sc + ' .ckf-step:not([hidden]) .gp-buy, ' + sc + ' .ckf-step:not([hidden]) .pg-buy', { wait: 1500 });
  const done = await p.evaluate(() => { const g = Club.giftcards.all().filter(c => c.recipient.email === 'jamie@example.com'); const c = g[g.length - 1]; return c ? { m: c.payment && c.payment.method, rc: !!(c.payment && c.payment.receiptId && Club.receipts.get(c.payment.receiptId)) } : null; });
  ok(done && done.rc, tag + ' gift card bought with receipt', done);
  ok(await p.locator('text=/View receipt|Voir le reçu/').count() > 0, tag + ' View receipt shown');
  await shot(p, `xe-${lang}-${w}-${site}-gift-4-done`);
  await c.close();
}

/* ---------------- Public shop (guest) ---------------- */
async function publicShop(lang, w) {
  const tag = `[${lang} ${w} public shop]`;
  const { c, p } = await ctx(w, lang, false);
  await p.goto(B + 'public.html#/shop'); await p.waitForTimeout(1300);
  await p.evaluate(() => { Club.shop.clearCart('guest'); Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 3).slice(0, 1).forEach(x => Club.shop.addToCart('guest', x.id, 2)); });
  await p.goto(B + 'public.html#/shop/basket'); await p.waitForTimeout(1200);
  ok(await at(p) === 'details', tag + ' starts on Details');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await p.locator('[data-ckf-step=details] .field-error' + ' >> visible=true').count() >= 3, tag + ' guest errors on Details');
  await type(p, '#sh-name', 'Pat Tester'); await type(p, '#sh-gphone', '204-555-0123'); await type(p, '#sh-email', 'pat@example.com');
  await shot(p, `xe-${lang}-${w}-pubshop-1-details`);
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'pay', tag + ' goes to Payment');
  ok(await p.locator('.ck-mopt').count() === 3 && await p.locator('.ck-mopt:has(input[value=pickup])').count() === 1, tag + ' guest sees Pay by card, Gift card and Pay at pickup (no account)');
  await click(p, '.ck-mopt:has(input[value=gift])');
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'pay' && await p.locator('.ck-alert' + ' >> visible=true').count() === 1, tag + ' gift card without a code: message on Payment');
  await click(p, '.ck-mopt:has(input[value=card])');
  await fillCard(p, '4242 4242 4242 4242');
  await shot(p, `xe-${lang}-${w}-pubshop-2-payment`);
  await click(p, '.ckf-step:not([hidden]) .ckf-next');
  ok(await at(p) === 'review', tag + ' goes to Review');
  await shot(p, `xe-${lang}-${w}-pubshop-3-review`);
  if (lang === 'fr') { const m = await missingIn(p, '.sh-pay'); ok(!m.length, tag + ' no English left in checkout', m); }
  await noScroll(p, tag);
  await click(p, '.ckf-step:not([hidden]) .sh-place', { wait: 1400 });
  const o = await p.evaluate(() => { const id = location.hash.split('/').pop(); const o = Club.shop.get(id); return o ? { m: o.pay.method, rc: !!(o.pay.receiptId && Club.receipts.get(o.pay.receiptId)) } : null; });
  ok(o && o.m === 'card' && o.rc, tag + ' order with receipt', o);
  await c.close();
}

/* ---------------- Public tee time (hold countdown) ---------------- */
async function teeTime(lang, w) {
  const tag = `[${lang} ${w} tee time]`;
  const { c, p } = await ctx(w, lang, false);
  await p.goto(B + 'public.html#/'); await p.waitForTimeout(1000);
  const pid = await p.evaluate(() => { const pl = Club.store.all('publicPlayers')[0]; localStorage.setItem('stboniface.public.session', pl.id); return pl.id; });
  const cardsBefore = await p.evaluate((pid) => JSON.stringify((Club.store.find('publicPlayers', pid) || {}).cards || null), pid);
  await p.goto(B + 'public.html#/book'); await p.reload(); await p.waitForTimeout(1500);
  const code = await seedGift(p, 15);
  let chip = p.locator('button.pub-chip[data-time]:not([disabled]):not(.st-mine):not(.st-full):not(.st-past)');
  for (let k = 0; k < 5 && !(await chip.count()); k++) { const d = p.locator('[data-act=pick-day]:not([disabled])'); if (await d.count() > k + 1) await click(p, d.nth(k + 1), { wait: 900 }); chip = p.locator('button.pub-chip[data-time]:not([disabled]):not(.st-mine):not(.st-full):not(.st-past)'); }
  if (!(await chip.count())) { ok(false, tag + ' no bookable time found'); await c.close(); return; }
  await click(p, chip.nth(0), { wait: 900 });
  ok(await p.locator('.hold-timer').count() === 1, tag + ' hold countdown on Players');
  await click(p, '[data-act=to-pay]', { wait: 900 });
  ok(await p.locator('.pub-steps li').count() === 4, tag + ' booking indicator has 4 steps');
  ok(await at(p, '.pub-card-panel') === 'pay', tag + ' Payment step');
  ok(await p.locator('.hold-timer.is-in').count() === 1, tag + ' hold countdown on Payment');
  await applyGift(p, code);
  ok(await p.locator('.ck-rest' + ' >> visible=true').count() === 1, tag + ' gift partial: rest by card');
  await click(p, '.pub-card-panel .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, '.pub-card-panel') === 'pay', tag + ' no card yet: stays on Payment');
  ok(await p.locator('.pub-card-panel input[type=radio][name^=ck-card], .pub-card-panel [name=ck-save], .pub-card-panel [name=saveCard]').count() === 0, tag + ' no saved cards or save checkbox');
  await fillCard(p, '4242 4242 4242 4242');
  await shotStep(p, `xe-${lang}-${w}-tee-2-payment`, '.pub-card-panel');
  await click(p, '.pub-card-panel .ckf-step:not([hidden]) .ckf-next');
  ok(await at(p, '.pub-card-panel') === 'review', tag + ' Review step');
  ok(await p.locator('.pub-steps li.active [aria-current=step]').count() === 1 && await p.locator('.pub-steps li.active button').getAttribute('data-step') === '4', tag + ' indicator on step 4');   /* public redesign (Nov 22): the steps are words, no numbers */
  ok(await p.locator('.hold-timer.is-in').count() === 1, tag + ' hold countdown still on Review');
  const ov = await p.evaluate(() => { const a = document.querySelector('.hold-timer').getBoundingClientRect(), b = document.querySelector('.pub-paybtn').getBoundingClientRect(); return { timerTop: a.top, timerBottom: a.bottom, btn: b.top }; });
  await p.locator('.pub-paybtn').scrollIntoViewIfNeeded();
  await shot(p, `xe-${lang}-${w}-tee-3-review`);
  if (lang === 'fr') { const m = await missingIn(p, '.pub-pay'); ok(!m.length, tag + ' no English left in checkout', m); }
  await noScroll(p, tag);
  await click(p, '.pub-card-panel .ckf-step:not([hidden]) .ckf-back');
  ok(await at(p, '.pub-card-panel') === 'pay', tag + ' Back to Payment keeps the hold') ;
  ok(await p.locator('.hold-timer.is-in').count() === 1, tag + ' countdown after Back');
  await click(p, '.pub-card-panel .ckf-step:not([hidden]) .ckf-next');
  await click(p, '.pub-card-panel .ckf-step:not([hidden]) .pub-paybtn', { wait: 1800 });
  const conf = await p.evaluate((pid) => { const pays = Club.store.all('publicPayments').filter(x => x.publicPlayerId === pid); const x = pays[pays.length - 1]; return x ? { brand: x.brand, last4: x.last4, rc: Club.receipts ? Club.receipts.all ? Club.receipts.all().some(r => r.refId === x.id || (r.ref && r.ref === x.id)) : true : true, ticket: !!document.querySelector('.pub-done') } : null; }, pid);
  ok(conf && conf.ticket && conf.last4 === '4242', tag + ' booking confirmed and paid', conf);
  ok(await p.evaluate((pid) => JSON.stringify((Club.store.find('publicPlayers', pid) || {}).cards || null), pid) === cardsBefore, tag + ' no card written to the golfer');
  ok(await p.locator('.hold-timer').count() === 0 || await p.locator('.hold-timer.is-in').count() === 0, tag + ' countdown gone after booking');
  await shot(p, `xe-${lang}-${w}-tee-4-confirmed`);
  await c.close();
}

const FLOWS = { pshop: portalShop, ptake: (l, w) => takeout(l, w, 'portal'), pubtake: (l, w) => takeout(l, w, 'public'), pgift: (l, w) => gifts(l, w, 'portal'), pubgift: (l, w) => gifts(l, w, 'public'), pubshop: publicShop, tee: teeTime };
for (const lang of LANGS) for (const w of WIDTHS) for (const [k, f] of Object.entries(FLOWS)) {
  if (ONLY && !ONLY.includes(k)) continue;
  try { await f(lang, w); } catch (e) { console.log(e.stack.split('\n').slice(0,6).join('\n')); ok(false, `[${lang} ${w} ${k}] crashed: ` + String(e.message).split('\n')[0]); }
}
await b.close();
ok(!errs.length, 'no page or console errors', errs.slice(0, 8));
console.log(res.join('\n'));
console.log(`\n${res.filter(x => x.startsWith('PASS')).length} passed, ${fails()} failed`);
