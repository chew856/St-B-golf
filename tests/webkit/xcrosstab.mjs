// Cross-tab with the per-collection store: public booking shows on the open staff tee sheet, staff changes reach the
// public and portal tabs, and simultaneous writes from two tabs both survive.
import { webkit } from 'playwright';
import { click, type } from './xe-lib.mjs';
const B = process.argv[2] || 'http://localhost:8001/site/';
const b = await webkit.launch(); let bad = 0;
const ok = (c, m, x) => { if (!c) { bad++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } else console.log('ok  ', m); };
const errs = [];
const watch = (p, tag) => { p.on('pageerror', e => errs.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(tag + ' ' + m.text()); }); };
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const staff = await c.newPage(); watch(staff, W + ' staff');
  await staff.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await staff.waitForTimeout(1500);
  const D = await staff.evaluate(() => Club.date.fromToday(2));
  const pid = await staff.evaluate(() => Club.store.all('publicPlayers')[0].id);
  await staff.evaluate(d => { location.hash = '#/teesheet/' + d; }, D); await staff.waitForTimeout(900);
  await staff.evaluate(() => { const a = [...document.querySelectorAll('.ts-periods button')].find(b => /All day/.test(b.textContent)); if (a) a.click(); }); await staff.waitForTimeout(400);
  const portal = await c.newPage(); watch(portal, W + ' portal');
  await portal.goto(B + 'member.html#/teetimes', { waitUntil: 'domcontentloaded' }); await portal.waitForTimeout(1200);
  const pub = await c.newPage(); watch(pub, W + ' public');
  await pub.goto(B + 'public.html#/', { waitUntil: 'domcontentloaded' }); await pub.waitForTimeout(800);
  await pub.evaluate(id => localStorage.setItem('stboniface.public.session', id), pid);
  await pub.goto(B + 'public.html#/book/' + D); await pub.reload(); await pub.waitForTimeout(1600);
  try {
    /* 1. public books and pays; the staff tee sheet (open, not reloaded) shows the booking */
    const n0 = await staff.evaluate(() => Club.store.all('teeTimes').length);
    const ids0 = await staff.evaluate(() => Club.store.all('teeTimes').map(t => t.id));
    const chip = pub.locator('button.pub-chip[data-time]:not([disabled])');
    const time = await chip.nth(2).getAttribute('data-time');
    await click(pub, chip.nth(2), { wait: 900 });
    await click(pub, '[data-act=to-pay]', { wait: 900 });
    await type(pub, '.ck .cc-in-num', '4242 4242 4242 4242');
    if (!(await pub.inputValue('.ck .cc-in-name'))) await type(pub, '.ck .cc-in-name', 'Pat Tester');
    await type(pub, '.ck .cc-in-exp', '12/30'); await type(pub, '.ck .cc-in-cvc', '123');
    await click(pub, '.pub-card-panel .ckf-step:not([hidden]) .ckf-next');
    await click(pub, '.pub-card-panel .ckf-step:not([hidden]) .pub-paybtn', { wait: 1800 });
    const booked = await pub.evaluate(([pid, d, t]) => { const x = Club.store.all('teeTimes').filter(tt => tt.date === d && tt.time === t && tt.players.some(p => p.publicPlayerId === pid))[0]; return x ? x.id : null; }, [pid, D, time]);
    ok(!!booked && await pub.locator('.pub-done').count() > 0, W + ': public booking confirmed at ' + time, booked);
    await staff.bringToFront(); await staff.waitForTimeout(900);
    const seen = await staff.evaluate(([id, t, pid]) => {
      const S = Club.store, tt = S.find('teeTimes', id), pl = S.find('publicPlayers', pid);
      const row = document.querySelector('.ts-row[data-time="' + t + '"]');
      return { inStore: !!tt, n: S.all('teeTimes').length, rowHasName: !!row && row.textContent.includes(pl.lastName), pay: S.all('publicPayments').some(p => p.publicPlayerId === pid) };
    }, [booked, time, pid]);
    /* A public golfer may join a group already on that time (no new tee time), depending on the day and hour the test runs. */
    seen.joined = ids0.includes(booked);
    ok(seen.inStore && seen.n === n0 + (seen.joined ? 0 : 1) && seen.rowHasName && seen.pay, W + ': staff tee sheet shows it without reload', seen);

    /* 2. staff cancels it on the tee sheet tab: the public tab sees the slot open again */
    await staff.evaluate(id => Club.store.update('teeTimes', id, { status: 'cancelled' }), booked);
    await pub.waitForTimeout(700);
    ok(await pub.evaluate(id => Club.store.find('teeTimes', id).status, booked) === 'cancelled', W + ': public tab has the staff change');

    /* 3. staff books a member; the portal (open) shows it */
    const mine = await staff.evaluate(([d]) => Club.store.insert('teeTimes', { date: d, time: '15:51', holes: 18, status: 'booked', players: [{ memberId: 'mem_1003', name: 'Dave Nerada' }], source: 'staff' }).id, [D]);
    await portal.bringToFront(); await portal.waitForTimeout(900);
    ok(await portal.evaluate(id => !!Club.store.find('teeTimes', id), mine), W + ': portal tab has the staff booking');

    /* 4. both tabs change teeTimes inside one 60 ms save batch (the second edit lands before the first tab's save
       reaches it): the second tab lays its edit on top of the first tab's save, so neither is lost */
    const ids = await staff.evaluate(() => Club.store.all('teeTimes').slice(10, 13).map(t => t.id));
    await staff.evaluate(id => Club.store.update('teeTimes', id, { notes: 'from staff' }), ids[0]);
    await pub.waitForTimeout(25);
    await pub.evaluate(id => Club.store.update('teeTimes', id, { notes: 'from public' }), ids[1]);
    await staff.waitForTimeout(700);
    const both = await Promise.all([staff, pub, portal].map(p => p.evaluate(ids => { const S = Club.store; return [S.find('teeTimes', ids[0]).notes, S.find('teeTimes', ids[1]).notes]; }, ids)));
    const disk = await staff.evaluate(ids => { const a = Club.store.stored('teeTimes'); return ids.map(id => a.find(t => t.id === id).notes); }, ids);
    ok(both.every(x => x[0] === 'from staff' && x[1] === 'from public') && disk[0] === 'from staff' && disk[1] === 'from public', W + ': overlapping edits from two tabs both kept (all tabs and storage)', { both, disk });
    /* 4b. truly simultaneous saves (both tabs write within the same millisecond, before either hears of the other):
       last save wins, as with the old store; every tab must end up agreeing with storage */
    await Promise.all([
      staff.evaluate(id => { Club.store.update('teeTimes', id, { notes: 'sim staff' }); window.dispatchEvent(new Event('pagehide')); }, ids[2]),
      pub.evaluate(id => { Club.store.update('teeTimes', id, { notes: 'sim public' }); window.dispatchEvent(new Event('pagehide')); }, ids[0])
    ]);
    await staff.waitForTimeout(700);
    const sim = await Promise.all([staff, pub, portal].map(p => p.evaluate(ids => { const S = Club.store; return [S.find('teeTimes', ids[2]).notes, S.find('teeTimes', ids[0]).notes].join('|'); }, ids)));
    const simDisk = await staff.evaluate(ids => { const a = Club.store.stored('teeTimes'); return [a.find(t => t.id === ids[2]).notes, a.find(t => t.id === ids[0]).notes].join('|'); }, ids);
    ok(sim.every(x => x === simDisk), W + ': simultaneous saves: all tabs agree with storage (' + simDisk + ')', { sim, simDisk });

    /* 5. stored() reads the other tab's change straight from storage */
    ok(await pub.evaluate(id => Club.store.stored('teeTimes').some(t => t.id === id), mine), W + ': Club.store.stored sees the latest saved copy');
    await staff.bringToFront(); await staff.waitForTimeout(400);
    await staff.screenshot({ path: 'xcrosstab-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await pub.screenshot({ path: 'xcrosstab-err-pub-' + W + '.png' }); }
  await c.close();
}
ok(!errs.length, 'no page or console errors', errs.slice(0, 6));
console.log(bad ? 'FAILED ' + bad : 'cross-tab suite passed'); await b.close(); process.exit(bad ? 1 : 0);
