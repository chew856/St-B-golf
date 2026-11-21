/* Promo code on a member booking: changing the booking re-quotes the discount (removing the guest drops it and releases
   the use); cancelling releases it; the public site still offers the renamed pull cart rental. node xg-promo2.mjs */
import { webkit } from 'playwright';
import { suite, human, noHScroll } from './xb-lib.mjs';
const B = 'http://localhost:8001/site/';
const T = suite(); const { ok } = T;
const text = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const b = await webkit.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', 'en'); } catch (e) {} });
const p = await c.newPage();
p.on('pageerror', e => T.errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource|Growth demo data failed/.test(m.text())) T.errs.push(m.text()); });
const state = () => p.evaluate(() => {
  const S = Club.store; const tts = S.all('teeTimes').filter(t => t.source === 'portal' && t.bookedBy === 'mem_1003').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const tt = tts[0]; const me = tt.players.find(x => x.memberId === 'mem_1003'); const pr = (me.addons || []).find(x => x.addonId === 'promo');
  const pay = S.all('publicPayments').find(x => x.teeTimeId === tt.id && x.promo); const promo = S.find('promoCodes', 'promo_welcome');
  const use = pay && (promo.uses || []).find(u => u.refId === pay.id);
  return { id: tt.id, status: tt.status, n: tt.players.length, pr: pr && pr.price, pay: pay && { status: pay.status, disc: pay.promo.discount }, use: use && { status: use.status, discount: use.discount } };
});
/* My tee times lists the next four; later ones are behind "View all upcoming" (redesign, Nov 21) */
async function openRow(id) {
  const sel = '.tt-row[data-id="' + id + '"]';
  if (!(await p.locator(sel).count()) && await p.locator('[data-act=all-up]').count()) { await human(p, '[data-act=all-up]'); await p.waitForTimeout(500); }
  await human(p, sel);
}
async function bookWithPromo(guestCart) {
  await p.goto(B + 'member.html#/tee-times', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  /* book two days ahead: a booking within two hours of play cannot be changed (the portal's rule) */
  await human(p, '.tt-day[data-date="' + (await p.evaluate(() => Club.date.fromToday(2))) + '"]'); await p.waitForTimeout(700);   /* the day strip (redesign, Nov 21) */
  let chips = p.locator('.tt-slot.st-open:not([disabled]):not(.st-mine):not(.is-wl)'); if (!(await chips.count())) chips = p.locator('.tt-slot:not([disabled]):not(.st-mine):not(.is-wl)');   /* an empty time: a partly booked one joins that group */
  await human(p, chips.nth(Math.min(2, await chips.count() - 1)));
  await human(p, '.pk-bar-btn'); await p.waitForTimeout(600);
  await human(p, '.tt-editor [data-act=add-guest]'); await p.waitForTimeout(400);
  await p.fill('#tt-g-first', 'Pat'); await p.fill('#tt-g-last', 'Guestly'); await p.fill('#tt-g-phone', '204-555-0123'); await p.fill('#tt-g-email', 'pat.guestly@example.com');
  await human(p, '[data-act=guest-ok]'); await p.waitForTimeout(500);
  if (guestCart) { await human(p, '.tt-editor .tt-ride[data-i="1"] button[data-value=cart]'); await p.waitForTimeout(200); }
  await human(p, '.tt-promo-host [data-pr=open]'); await p.waitForTimeout(200);
  await p.fill('.tt-promo-host .pr-box-in', 'WELCOME10'); await human(p, '.tt-promo-host [data-pr=apply]'); await p.waitForTimeout(400);
  await human(p, '.ps-sheet [data-act=confirm]'); await p.waitForTimeout(900);
  await human(p, '.ps-sheet [data-act=done]'); await p.waitForTimeout(400);
}
try {
  /* 1. book, then change: the guest leaves, so a green-fee code has nothing left to reduce */
  await bookWithPromo(false);
  const s0 = await state();
  ok(s0.pr < 0 && s0.pay && s0.pay.status === 'account' && s0.use && s0.use.status === 'used', 'booked with the code', s0);
  await human(p, '.tab[data-tab=mine]'); await p.waitForTimeout(500);
  await openRow(s0.id); await p.waitForTimeout(500);
  await human(p, '.ps-sheet [data-act=d-modify]'); await p.waitForTimeout(600);
  const dueBefore = await text(p, '.tt-editor .tt-due-amt');
  await human(p, '.tt-editor .tt-pl:not(.is-self) [data-act=remove]'); await p.waitForTimeout(400);
  const dueAfter = await text(p, '.tt-editor .tt-due-amt');
  const linesAfter = await p.evaluate(() => [...document.querySelectorAll('.tt-editor .tt-fees-lines li')].map(l => l.textContent));
  ok(dueBefore !== dueAfter && !linesAfter.some(l => /Promo code/.test(l)), 'change sheet: removing the guest drops the promo line from the quote', { dueBefore, dueAfter, linesAfter });
  await human(p, '.ps-sheet [data-act=save]'); await p.waitForTimeout(700);
  const s1 = await state();
  ok(s1.n === 1 && s1.pr == null && s1.pay.status === 'refunded' && s1.use.status === 'released', 'saved: no promo line, record refunded, use released', s1);
  /* 2. book again (the code is one per member: the released use lets it be used again), with a guest cart; change holes to 9 and the discount re-quotes */
  await bookWithPromo(true);
  const s2 = await state();
  ok(s2.pr < 0 && s2.pay.status === 'account', 'a released code can be used again on a new booking', s2);
  await human(p, '.tab[data-tab=mine]'); await p.waitForTimeout(500);
  await openRow(s2.id); await p.waitForTimeout(500);
  await human(p, '.ps-sheet [data-act=d-modify]'); await p.waitForTimeout(600);
  const nine = p.locator('.segmented[data-name=tt-holes-ed] button[data-value="9"]');
  if (await nine.count()) { await human(p, nine); await p.waitForTimeout(400); await human(p, '.ps-sheet [data-act=save]'); await p.waitForTimeout(700); }
  const s3 = await state();
  const expect9 = await p.evaluate(id => { const t = Club.store.find('teeTimes', id); return Math.round(Club.teeRules.greenFee(t.date, t.time, t.holes) * 10) / 100; }, s3.id);
  ok(Math.abs(-s3.pr - expect9) < 0.005 && Math.abs(s3.pay.disc - expect9) < 0.005 && Math.abs(s3.use.discount - expect9) < 0.005, 'nine holes: the discount re-quotes on the line, the record and the use', { s3, expect9 });
  /* 3. cancel: the record is refunded and the use released */
  await openRow(s3.id); await p.waitForTimeout(500);
  await human(p, '.ps-sheet [data-act=d-cancel]'); await p.waitForTimeout(400);
  await human(p, '.ps-sheet [data-act=d-yes]'); await p.waitForTimeout(600);
  const s4 = await state();
  ok(s4.status === 'cancelled' && s4.pay.status === 'refunded' && s4.use.status === 'released', 'cancelled: record refunded, use released', s4);
  ok(await noHScroll(p), 'no horizontal scroll');
  /* 4. public site: the renamed add-on and the box still there */
  await p.goto(B + 'public.html#/book', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const pub = await p.evaluate(() => ({ names: Club.addons.active('public').map(a => a.name), fr: Club.i18n ? Club.i18n.t('Pull cart rental') : null }));
  ok(pub.names.indexOf('Pull cart rental') >= 0 && pub.names.length === 3, 'public site offers Pull cart rental', pub);
} catch (e) { ok(false, 'script error ' + e.message); await p.screenshot({ path: 'shots/xg2-fail.png' }).catch(() => {}); }
await b.close();
ok(!T.errs.length, 'no console or page errors', T.errs);
T.done();
