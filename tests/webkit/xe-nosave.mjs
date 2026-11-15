/* No card saving anywhere: portal Make a payment (card typed fresh, pays, receipt), public My account (no Saved cards panel),
   and no "save this card" control on any checkout. EN and FR, 1440 and 390. */
import { webkit } from 'playwright';
import { B, mk, click, type, overflow } from './xe-lib.mjs';
const { res, ok, fails } = mk();
const errs = [];
const b = await webkit.launch();
const OLD = { cards: [{ id: 'card_old', brand: 'visa', last4: '1881', expMonth: 12, expYear: 2030, name: 'Dave Nerada' }] };
for (const lang of ['en', 'fr']) for (const w of [1440, 390]) {
  const tag = `[${lang} ${w}]`;
  /* portal: Make a payment */
  let c = await b.newContext({ viewport: { width: w, height: w > 500 ? 900 : 844 } });
  await c.addInitScript((lang) => { localStorage.setItem('stboniface.lang', lang); localStorage.setItem('stboniface.portal.session', 'mem_1003'); }, lang);
  let p = await c.newPage();
  p.on('pageerror', e => errs.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
  await p.goto(B + 'member.html#/home'); await p.waitForTimeout(1000);
  await p.evaluate((OLD) => { const w = Club.store.getObj('portalWallet', {}) || {}; w.mem_1003 = OLD; Club.store.setObj('portalWallet', w); }, OLD);
  await p.goto(B + 'member.html#/account/pay'); await p.waitForTimeout(1200);
  ok(await p.locator('[name=keepCard], [name=cardUse], .pa-card-row, [data-action=rm-card]').count() === 0, tag + ' portal pay: no saved cards, no keep-on-file box');
  ok(!(await p.locator('.pa-pay').innerText()).includes('1881'), tag + ' portal pay: old stored card not shown');
  await click(p, '.pa-opt:has(input[value=other])');
  await type(p, '#pa_other', '25.00');
  await type(p, '.pa-cc .cc-in-num', '4242 4242 4242 4242'); await type(p, '.pa-cc .cc-in-exp', '12/30'); await type(p, '.pa-cc .cc-in-cvc', '123');
  await p.screenshot({ path: `xe-shots/xe-${lang}-${w}-portal-pay.png` });
  ok(await overflow(p) <= 0, tag + ' portal pay: no horizontal scroll');
  await click(p, '.pk-bar-btn');
  await click(p, '.modal .btn-primary, .overlay .btn-primary', { wait: 1200 });
  ok(/account\/receipt\//.test(p.url()), tag + ' portal pay: card payment taken, receipt shown', p.url());
  ok(await p.evaluate(() => JSON.stringify((Club.store.getObj('portalWallet', {}) || {}).mem_1003)) === JSON.stringify(OLD), tag + ' portal pay: nothing written to the wallet');
  await c.close();
  /* public: My account */
  c = await b.newContext({ viewport: { width: w, height: w > 500 ? 900 : 844 } });
  await c.addInitScript((lang) => { localStorage.setItem('stboniface.lang', lang); }, lang);
  p = await c.newPage();
  p.on('pageerror', e => errs.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
  await p.goto(B + 'public.html#/'); await p.waitForTimeout(1000);
  await p.evaluate(() => { const pl = Club.store.all('publicPlayers')[0]; Club.store.update('publicPlayers', pl.id, { cards: [{ id: 'card_old', brand: 'visa', last4: '1881', expMonth: 12, expYear: 2030, name: 'X' }] }); localStorage.setItem('stboniface.public.session', pl.id); });
  await p.goto(B + 'public.html#/account'); await p.reload(); await p.waitForTimeout(1400);
  const t = await p.locator('main, body').first().innerText();
  ok(!/Saved cards|Cartes enregistrées|Wallet|Portefeuille/.test(t) && !t.includes('1881'), tag + ' public My account: no Saved cards panel');
  await p.screenshot({ path: `xe-shots/xe-${lang}-${w}-public-account.png` });
  /* the gift card page as a signed-in golfer: card form only, no save box */
  await p.goto(B + 'public.html#/gifts'); await p.waitForTimeout(1200);
  ok(await p.locator('[name=ck-save], [name=saveCard], .ck-cards').count() === 0 && !(await p.locator('.gp-form').innerText()).includes('1881'), tag + ' public gifts: no saved cards or save box');
  await c.close();
}
await b.close();
ok(!errs.length, 'no page or console errors', errs.slice(0, 6));
console.log(res.join('\n')); console.log(`\n${res.filter(x => x.startsWith('PASS')).length} passed, ${fails()} failed`);
