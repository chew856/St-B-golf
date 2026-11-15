/* Portal booking with the pull cart add-on and a promo code, then the staff tee sheet: pills, fee quote, check-in, charges.
   node xg-promo.mjs  (WebKit, 1440 and 390, English and French) */
import { webkit } from 'playwright';
import { suite, human, noHScroll } from './xb-lib.mjs';
const B = 'http://localhost:8001/site/';
const T = suite(); const { ok } = T;
const shots = 'shots/';

async function ctx(b, W, lang) {
  const c = await b.newContext({ viewport: { width: W, height: W > 500 ? 900 : 844 } });
  await c.addInitScript(([l]) => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', l); } catch (e) {} }, [lang]);
  const p = await c.newPage();
  p.on('pageerror', e => T.errs.push(W + lang + ' ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource|Growth demo data failed/.test(m.text())) T.errs.push(W + lang + ' ' + m.text()); });
  return { c, p };
}
const text = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const has = (p, sel) => p.evaluate(s => !!document.querySelector(s), sel);
const amt = s => parseFloat(String(s || '').replace(/[^\d,.-]/g, '').replace(',', '.'));

for (const [W, lang] of [[1440, 'en'], [390, 'fr'], [390, 'en'], [1440, 'fr']]) {
  const tag = W + '-' + lang;
  const b = await webkit.launch();
  const { c, p } = await ctx(b, W, lang);
  try {
    await p.goto(B + 'member.html#/tee-times', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    /* the member walks with their own pull cart (profile), so the add-on carries its rental note */
    await p.evaluate(() => { const m = Club.store.find('members', 'mem_1003'); Club.store.update('members', 'mem_1003', { preferences: Object.assign({}, m.preferences, { cart: 'Pull cart' }) }); });
    const seed = await p.evaluate(() => ({ pc: Club.store.find('bookingAddons', 'addon_pullcart'), v: Club.store.getObj('addonsVersion'), member: Club.addons.active('member').map(a => a.name) }));
    ok(seed.pc.memberOk === true && seed.pc.name === 'Pull cart rental' && seed.v === 2 && seed.member.indexOf('Pull cart rental') >= 0, tag + ': pull cart rental is member-eligible (migration 2)', seed);
    /* 1. choose the first open time */
    await human(p, (await p.locator('.tt-chip.st-open:not([disabled]):not(.st-mine):not(.is-wl)').count()) ? '.tt-chip.st-open:not([disabled]):not(.st-mine):not(.is-wl)' : '.tt-chip:not([disabled]):not(.st-mine):not(.is-wl)');
    const when = await p.evaluate(() => ({ date: document.querySelector('.tt-chip.selected') && Club.date.today(), time: document.querySelector('.tt-chip.selected').dataset.time }));
    await human(p, '.pk-bar-btn'); await p.waitForTimeout(600);
    ok(await has(p, '.ps-sheet .tt-editor'), tag + ': booking sheet open');
    /* 2. the add-ons: pull cart for me, with the own-cart note */
    await human(p, '.pk-acc[data-acc=tt-adds-acc] .pk-acc-head'); await p.waitForTimeout(300);
    const addNames = await p.evaluate(() => [...document.querySelectorAll('.tt-add .tt-add-name')].map(e => e.textContent.trim()));
    ok(addNames.length === 3 && addNames.some(n => /Pull cart rental|Location de chariot manuel/.test(n)), tag + ': three add-ons offered to the member, pull cart rental among them', addNames);
    ok(await has(p, '.tt-add[data-addon=addon_pullcart] .tt-add-note'), tag + ': own pull cart note shows for this member');
    await human(p, '.tt-add[data-addon=addon_pullcart] [data-act=tt-add-toggle][data-i="0"]'); await p.waitForTimeout(300);
    const hint = await text(p, '.pk-acc[data-acc=tt-adds-acc] .tt-hint');
    ok(!/membership|adhésion/.test(hint || ''), tag + ': the add-on hint no longer says pull carts come with membership', hint);
    /* 3. a green-fee code with no guest: nothing to reduce, said plainly */
    const link = await text(p, '.tt-promo-host [data-pr=open]');
    ok(link === (lang === 'fr' ? 'Vous avez un code promo?' : 'Have a promo code?'), tag + ': "Have a promo code?" link in the sheet', link);
    await human(p, '.tt-promo-host [data-pr=open]'); await p.waitForTimeout(200);
    await p.fill('.tt-promo-host .pr-box-in', 'welcome10'); await human(p, '.tt-promo-host [data-pr=apply]'); await p.waitForTimeout(300);
    const zero = await text(p, '.tt-promo-host .field-error');
    ok(zero === (lang === 'fr' ? 'Ce code s’applique aux droits de jeu. Votre golf est compris dans votre cotisation.' : 'This code applies to green fees. Your golf is covered by dues.'), tag + ': $0 message for a green-fee code with no guest', zero);
    await p.screenshot({ path: shots + 'xg-zero-' + tag + '.png' });
    await human(p, '.tt-promo-host [data-pr=cancel]'); await p.waitForTimeout(200);
    /* 4. add a guest, then the code applies to the guest's green fee */
    await human(p, '.tt-editor [data-act=add-guest]'); await p.waitForTimeout(400);
    await p.fill('#tt-g-first', 'Pat'); await p.fill('#tt-g-last', 'Guestly'); await p.fill('#tt-g-phone', '204-555-0123'); await p.fill('#tt-g-email', 'pat.guestly@example.com');
    await human(p, '[data-act=guest-ok]'); await p.waitForTimeout(500);
    const before = amt(await text(p, '.tt-editor .tt-due-amt'));
    await human(p, '.tt-promo-host [data-pr=open]'); await p.waitForTimeout(200);
    await p.fill('.tt-promo-host .pr-box-in', 'WELCOME10'); await human(p, '.tt-promo-host [data-pr=apply]'); await p.waitForTimeout(400);
    const applied = await text(p, '.tt-promo-host .pr-box.is-applied .pr-box-t');
    const after = amt(await text(p, '.tt-editor .tt-due-amt'));
    const gf = await p.evaluate(t => Club.teeRules.greenFee(Club.date.today(), t, 18), when.time);
    const disc = Math.round(gf * 10) / 100;
    ok(/WELCOME10/.test(applied || '') && Math.abs(before - after - disc) < 0.005, tag + ': code applied, due at check-in drops by 10% of the guest green fee', { applied, before, after, gf, disc });
    await human(p, '.tt-editor .tt-due .pk-acc-head'); await p.waitForTimeout(300);
    const lines = await p.evaluate(() => [...document.querySelectorAll('.tt-editor .tt-fees-lines li')].map(l => l.textContent.trim()));
    ok(lines.some(l => /(Promo code|Code promo) WELCOME10/.test(l) && /−/.test(l)), tag + ': breakdown shows the promo line as a deduction', lines);
    ok(await noHScroll(p), tag + ': no horizontal scroll (booking sheet)');
    await p.screenshot({ path: shots + 'xg-sheet-' + tag + '.png' });
    /* 5. confirm */
    await human(p, '.ps-sheet [data-act=confirm]'); await p.waitForTimeout(900);
    const done = await text(p, '.tt-done');
    const rec = await p.evaluate(() => {
      const S = Club.store; const tts = S.all('teeTimes').filter(t => t.source === 'portal' && t.bookedBy === 'mem_1003').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const tt = tts[0]; const me = tt.players.find(x => x.memberId === 'mem_1003'); const pr = (me.addons || []).find(x => x.addonId === 'promo');
      const pay = S.all('publicPayments').find(x => x.teeTimeId === tt.id && x.promo); const promo = S.find('promoCodes', 'promo_welcome');
      const use = (promo.uses || []).find(u => u.refId === (pay && pay.id));
      return { id: tt.id, date: tt.date, time: tt.time, adds: (me.addons || []).map(x => x.addonId), pr: pr && { price: pr.price, code: pr.code, promoId: pr.promoId }, pay: pay && { amount: pay.amount, status: pay.status, memberId: pay.memberId, disc: pay.promo.discount }, use: use && { source: use.source, memberId: use.memberId, discount: use.discount, status: use.status } };
    });
    ok(/WELCOME10/.test(done || '') && rec.adds.join() === 'addon_pullcart,promo' && rec.pr && Math.abs(rec.pr.price + disc) < 0.005 && rec.pr.promoId === 'promo_welcome', tag + ': booked with the pull cart and the promo line on the member', rec);
    ok(rec.pay && rec.pay.amount === 0 && rec.pay.status === 'account' && rec.pay.memberId === 'mem_1003' && Math.abs(rec.pay.disc - disc) < 0.005 && rec.use && rec.use.source === 'portal' && rec.use.memberId === 'mem_1003' && rec.use.status === 'used', tag + ': promo record and use recorded like the public site', rec);
    await p.screenshot({ path: shots + 'xg-done-' + tag + '.png' });
    await human(p, '.ps-sheet [data-act=done]'); await p.waitForTimeout(500);
    /* 6. My tee times detail shows the add-on and the code */
    await human(p, '.tab[data-tab=mine]'); await p.waitForTimeout(500);
    await human(p, '.tt-row[data-id="' + rec.id + '"]'); await p.waitForTimeout(500);
    const det = await text(p, '.ps-sheet .tt-detail-pl');
    ok(/Pull cart rental|Location de chariot manuel/.test(det || '') && /WELCOME10/.test(det || ''), tag + ': detail sheet lists the rental and the promo code', det);
    ok(await noHScroll(p), tag + ': no horizontal scroll (detail)');
    await p.screenshot({ path: shots + 'xg-detail-' + tag + '.png' });
    await human(p, '.ps-sheet .ps-x'); await p.waitForTimeout(300);
    /* 7. staff: the tee sheet row, its pills, the fee quote, check-in and what posts */
    const moved = await p.evaluate(id => { const t = Club.store.find('teeTimes', id); const td = Club.date.today(); if (t.date !== td) { Club.store.update('teeTimes', id, { date: td }); return true; } return false; }, rec.id);
    await p.waitForTimeout(200);
    await p.goto(B + 'index.html#/teesheet/' + (await p.evaluate(() => Club.date.today())), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    const allDay = p.locator('.ts-periods button', { hasText: 'All day' }); if (await allDay.count()) await human(p, allDay.first());
    await p.waitForTimeout(300);
    const pills = await p.evaluate(id => { const r = document.querySelector('.ts-row[data-id="' + id + '"]'); return r ? { add: !!r.querySelector('.ts-mark.add'), promo: !!r.querySelector('.ts-mark.promo'), title: (r.querySelector('.ts-mark.promo') || {}).title } : null; }, rec.id);
    ok(pills && pills.add && pills.promo && /WELCOME10/.test(pills.title), tag + ': tee sheet row has the Add-ons and Promo pills' + (moved ? ' (booking moved to today for check-in)' : ''), pills);
    await human(p, '.ts-row[data-id="' + rec.id + '"] .ts-slot.filled'); await p.waitForTimeout(700);
    const q = await p.evaluate(() => ({ promo: (document.querySelector('.ts-promo') || {}).textContent, total: (document.querySelector('.ts-quote-v') || {}).textContent, extra: [...document.querySelectorAll('.ts-pextra')].map(e => e.textContent.trim()).join(' | ') }));
    const expect = await p.evaluate(id => { const S = Club.store, t = S.find('teeTimes', id), st = Object.assign({ cartFee: 28 }, S.getObj('teeSheetSettings', {})); const f = t.holes === 9 ? 0.6 : 1;
      let tot = 0; t.players.forEach(p => { if (p.type === 'guest') tot += Club.teeRules.greenFee(t.date, t.time, t.holes); if (p.cart) tot += st.cartFee * f; (p.addons || []).forEach(x => { tot += (+x.qty || 1) * x.price; }); }); return Math.round(tot * 100) / 100; }, rec.id);
    ok(/WELCOME10/.test(q.promo || '') && Math.abs(amt(q.total) - expect) < 0.005 && /Promo code WELCOME10/.test(q.extra), tag + ': staff booking form shows the promo and a discounted quote', { q, expect });
    await p.screenshot({ path: shots + 'xg-staff-' + tag + '.png' });
    ok(await noHScroll(p), tag + ': no horizontal scroll (staff form)');
    await human(p, p.locator('.modal-foot button', { hasText: 'Close' }).last()); await p.waitForTimeout(400);
    const m0 = await p.evaluate(() => ({ ch: Club.store.all('charges').length, rc: Club.store.all('receipts').length, bal: Club.store.find('members', 'mem_1003').balance }));
    await human(p, '.ts-row[data-id="' + rec.id + '"] .ts-next'); await p.waitForTimeout(900);
    const post = await p.evaluate(([id, m0]) => { const S = Club.store; const t = S.find('teeTimes', id);
      const ch = S.all('charges').filter(c => c.refId === id && c.source === 'teesheet'); const rc = S.all('receipts').filter(r => r.refId === id);
      return { status: t.status, paid: t.players.every(p => p.paid), n: ch.length, sum: Math.round(ch.reduce((a, c) => a + c.amount, 0) * 100) / 100, who: [...new Set(ch.map(c => c.memberId))], titles: ch.map(c => c.title || c.description),
        credit: rc.filter(r => r.kind === 'credit').map(r => r.title + ' ' + r.total), sales: rc.filter(r => r.kind === 'sale').length, bal: Math.round((S.find('members', 'mem_1003').balance - m0.bal) * 100) / 100 }; }, [rec.id, m0]);
    ok(post.status === 'checked-in' && post.paid && Math.abs(post.sum - expect) < 0.005 && post.who.join() === 'mem_1003' && post.bal === expect, tag + ': check-in posts the discounted total to the member account', { post, expect });
    ok(post.credit.length === 1 && /Promo code WELCOME10/.test(post.credit[0]) && Math.abs(amt(post.credit[0].replace(/.*WELCOME10/, '')) - disc) < 0.005 && post.sales >= 2, tag + ': receipts: a credit for the promo code and sales for the rest', post);
    await p.screenshot({ path: shots + 'xg-checkedin-' + tag + '.png' });
  } catch (e) { ok(false, tag + ': script error ' + e.message); await p.screenshot({ path: shots + 'xg-fail-' + tag + '.png' }).catch(() => {}); }
  await c.close(); await b.close();
}
ok(!T.errs.length, 'no console or page errors', T.errs);
T.done();
