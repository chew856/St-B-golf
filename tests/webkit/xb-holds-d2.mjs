import { webkit } from 'playwright';
import { suite, human, B, setVal, modalBtn, noHScroll } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } });
  const watch = (pg, tag) => { pg.on('pageerror', e => T.errs.push(W + tag + ' ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) T.errs.push(W + tag + ' ' + m.text()); }); };
  const staff = await c.newPage(); watch(staff, ' staff');
  await staff.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await staff.waitForTimeout(1500);
  const D = await staff.evaluate(() => Club.date.fromToday(2));
  const pub = await c.newPage(); watch(pub, ' public');
  try {
    await pub.goto(B + 'public.html#/book/' + D, { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(1800);
    await staff.evaluate(d => { location.hash = '#/teesheet/' + d; }, D); await staff.waitForTimeout(900);
    await staff.evaluate(() => { const a = [...document.querySelectorAll('.ts-periods button')].find(b => /All day/.test(b.textContent)); if (a) a.click(); }); await staff.waitForTimeout(400);
    /* the public golfer picks a time that the staff sheet shows with open places */
    const chipT = await pub.evaluate(() => { const rows = [...document.querySelectorAll('.pub-chip')].filter(c => !/st-(past|full|mine|closed)/.test(c.className)); return rows.length ? rows[Math.min(3, rows.length - 1)].dataset.time : null; });
    ok(!!chipT, W + ': public site lists times', chipT);
    await pub.bringToFront(); await human(pub, '.pub-chip[data-time="' + chipT + '"]'); await pub.waitForTimeout(600);
    const hold = await staff.evaluate(() => JSON.parse(localStorage.getItem('stboniface.holds.v1') || '[]'));
    ok(hold.length === 1 && hold[0].time === chipT && hold[0].source === 'public', W + ': picking a time places a hold', hold);
    await staff.bringToFront(); await staff.waitForTimeout(1300);
    const row = '.ts-row[data-time="' + chipT + '"]';
    const p1 = await staff.locator(row + ' .ts-mark.held').textContent().catch(() => null);
    await staff.waitForTimeout(1200);
    const p2 = await staff.locator(row + ' .ts-mark.held').textContent().catch(() => null);
    const tip = await staff.locator(row + ' .ts-mark.held').getAttribute('title').catch(() => null);
    ok(/^Held online · [0-5]:\d\d$/.test(p1 || '') && p1 !== p2 && /Public golfer choosing a time/.test(tip || '') && /frees itself/i.test(tip || '') && /this browser only/.test(tip || ''), W + ': held pill counts down, tooltip says who and that it frees itself', { p1, p2, tip });
    const slots = await staff.evaluate(r => [...document.querySelectorAll(r + ' .ts-slot.open')].map(s => [s.classList.contains('is-held'), s.getAttribute('aria-disabled'), s.title]), row);
    ok(slots.length > 0 && slots.every(s => s[0] && s[1] === 'true' && /^Held online for \d:\d\d$/.test(s[2])), W + ': open places are shown as held and disabled', slots);
    const vis = staff.locator(row + ' .ts-slot.open.is-held').first();
    if (await vis.isVisible()) { await human(staff, vis); }
    ok(await staff.locator('.modal').count() === 0, W + ': clicking a held place opens nothing');
    /* the booking modal opened another way: says the time is held, blocks save, offers another time */
    const n0 = await staff.evaluate(() => Club.store.all('teeTimes').length);
    await human(staff, '.page-head [data-action=book-new]');
    await setVal(staff, '.ts-form [name=time]', chipT); await staff.waitForTimeout(300);
    const note = await staff.locator('.ts-heldnote').textContent();
    ok(await staff.locator('.ts-heldnote').isVisible() && /is held online for \d:\d\d while a golfer books online\. Wait for the hold to end, or choose another time\./.test(note), W + ': booking modal says the time is held', note);
    const mem = await staff.evaluate(d => Club.store.all('members').find(m => m.status === 'active' && m.tierId !== 'tier_social' && !Club.store.all('teeTimes').some(t => t.date === d && t.players.some(x => x.memberId === m.id))).id, D);
    await setVal(staff, '.ts-form [name=member_0]', mem); await staff.evaluate(() => { const o = document.querySelector('.ts-form [name=override]'); if (o) o.checked = true; });
    await modalBtn(staff, 'Book tee time'); await staff.waitForTimeout(400);
    ok(await staff.evaluate(() => Club.store.all('teeTimes').length) === n0 && /held online/.test(await staff.locator('.ts-alert').textContent()), W + ': save is refused on a held time');
    await human(staff, '.ts-heldnote [data-held=other]'); await staff.waitForTimeout(300);
    const t2 = await staff.evaluate(() => document.querySelector('.ts-form [name=time]').value);
    ok(t2 !== chipT && await staff.locator('.ts-heldnote').isHidden(), W + ': Choose another time moves off the held time', t2);
    await staff.keyboard.press('Escape'); await staff.waitForTimeout(400);
    if (await staff.locator('.modal').count()) { await human(staff, staff.locator('.modal [data-action=close]').last()); }
    /* release from the public page: the row frees within a second, no full re-render */
    await staff.evaluate(r => { document.querySelector(r).dataset.mark = 'same'; }, row);
    await pub.bringToFront(); await human(pub, '[data-act=change-time]'); await pub.waitForTimeout(300);
    const released = await staff.evaluate(() => JSON.parse(localStorage.getItem('stboniface.holds.v1') || '[]').length);
    await staff.bringToFront(); await staff.waitForTimeout(1100);
    const freed = await staff.evaluate(r => { const el = document.querySelector(r); return { same: el.dataset.mark === 'same', pill: !!el.querySelector('.ts-mark.held'), held: el.querySelectorAll('.ts-slot.is-held,[aria-disabled=true]').length, open: el.querySelectorAll('.ts-slot.open').length }; }, row);
    ok(released === 0 && freed.same && !freed.pill && freed.held === 0 && freed.open > 0, W + ': released on the public page, the row frees within a second in place', { released, freed });
    /* expiry: hold again, then fake the expiry */
    await pub.bringToFront(); await human(pub, '.pub-chip[data-time="' + chipT + '"]'); await pub.waitForTimeout(600);
    await staff.bringToFront(); await staff.waitForTimeout(1200);
    const again = await staff.locator(row + ' .ts-mark.held').count();
    await staff.evaluate(() => { const k = 'stboniface.holds.v1'; const a = JSON.parse(localStorage.getItem(k) || '[]'); a.forEach(h => h.expiresAt = Date.now() - 1); localStorage.setItem(k, JSON.stringify(a)); });
    await staff.waitForTimeout(2100);
    const exp = await staff.evaluate(r => { const el = document.querySelector(r); return { pill: !!el.querySelector('.ts-mark.held'), held: el.querySelectorAll('.ts-slot.is-held').length }; }, row);
    ok(again === 1 && !exp.pill && exp.held === 0, W + ': an expired hold frees the row', { again, exp });
    ok(await noHScroll(staff), W + ': no horizontal scroll');
    await staff.screenshot({ path: 'xb-holds-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await staff.screenshot({ path: 'xb-holds-err-' + W + '.png' }); await pub.screenshot({ path: 'xb-holds-err-pub-' + W + '.png' }); }
  await c.close();
}
await b.close();
ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
