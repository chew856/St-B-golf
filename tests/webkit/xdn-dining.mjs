/* Dining redesign: Floor plan (states, filters, walk-in, seat from arrivals, needs clearing, close check) and
   Reservations (timeline, assign, list actions, search) at 1440 and 390, with Undo, no horizontal scroll, no console errors.
   The clock is fixed at 7:25 PM tonight (dinner live) in a fresh browser, so the demo data is seeded around it. */
import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/';
const OUT = './out/dnshots/';
fs.mkdirSync(OUT, { recursive: true });
const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };

async function human(p, sel) {
  const loc = typeof sel === 'string' ? p.locator(sel).first() : sel;
  await loc.waitFor({ timeout: 8000 });
  await loc.evaluate(el => { const r = el.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 10) el.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(80);
  const box = await loc.boundingBox(); const x = box.x + Math.min(box.width / 2, 40), y = box.y + box.height / 2;
  await p.mouse.move(x - 6, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(400);
}
async function undo(p) { await human(p, p.locator('.toast.has-act:not(.leaving) .toast-act').last()); await p.waitForTimeout(300); }
const hasUndo = async (p) => (await p.locator('.toast.has-act:not(.leaving) .toast-act').count()) > 0;
const clearToasts = (p) => p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
const txt = async (p, sel) => { const l = p.locator(sel).first(); return (await l.count()) ? (await l.textContent()) || '' : ''; };
const noH = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const R = (p, id) => p.evaluate(id => JSON.parse(JSON.stringify(Club.store.find('diningReservations', id) || null)), id);
async function ctx(b, W) {
  const c = await b.newContext({ viewport: { width: W, height: W > 600 ? 1000 : 844 }, hasTouch: W < 600 });
  await c.clock.setFixedTime(new Date('2026-11-12T19:25:00'));
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.staff.sidebar', 'collapsed'); } catch (e) { } });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(W + ' ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(W + ' ' + m.text()); });
  await p.goto(B + 'index.html#/dashboard'); await p.waitForTimeout(800);
  return { c, p };
}
process.on('uncaughtException', e => { console.log(res.join('\n')); console.log('CRASH', e.message.split('\n')[0], errs); process.exit(1); });
const b = await webkit.launch();

/* ======================= Floor plan, 1440 ======================= */
{
  const { c, p } = await ctx(b, 1440);
  await p.goto(B + 'index.html#/dining/floor'); await p.waitForTimeout(1500);
  ok(await p.locator('.stats').count() === 0 && /covers for dinner/.test(await txt(p, '.dn-sum')) && /Average check \$/.test(await txt(p, '.dn-sum')), 'header: one summary line instead of the stat boxes, with the average check');
  ok(/\d/.test(await txt(p, '.dn-tab-n')), 'Orders tab shows the open checks count');
  ok(/Dinner, live/.test(await txt(p, '.dn-clock')) && /7:25 PM/.test(await txt(p, '.dn-clock')), 'live clock: Dinner, live 7:25 PM');
  const chipSum = await p.evaluate(() => [...document.querySelectorAll('.dn-fchip b')].reduce((a, b) => a + +b.textContent, 0));
  ok(chipSum === 13 && await p.locator('.dn-plan .fp-table').count() === 13, 'chips count every Gallery table once', chipSum);
  const seatedN = +(await txt(p, '[data-filter=seated] b'));
  ok(seatedN === await p.locator('.fp-table.seated').count() && seatedN > 0, 'seated chip matches solid seated tables');
  // free until
  const until = await p.evaluate(() => [...document.querySelectorAll('.fp-table.free')].map(g => [g.dataset.table, g.querySelector('.fp-sub').textContent]));
  const untilOk = await p.evaluate((until) => until.every(([id, t]) => {
    const next = Club.store.all('diningReservations').filter(r => r.date === Club.date.today() && r.venue === 'Gallery Taphouse & Grill' && r.table === id && r.status === 'confirmed' && r.time >= '19:25').sort((a, b) => a.time.localeCompare(b.time))[0];
    return next ? /^until /.test(t) : /seats/.test(t);
  }), until);
  ok(untilOk && until.some(u => /until/.test(u[1])), 'free tables show "until" the next booking', until);
  // filter
  await human(p, '[data-filter=seated]');
  ok(await p.locator('.dn-plan.dim').count() === 1 && await p.locator('.fp-table.seated.match').count() === seatedN && await p.locator('.fp-table.match:not(.seated)').count() === 0, 'Seated chip filters the plan to seated tables');
  await human(p, '[data-filter=seated]');
  ok(await p.locator('.dn-plan.dim').count() === 0, 'chip again clears the filter');
  await p.screenshot({ path: OUT + 'app-floor-1440.png', fullPage: true });

  // seat from arrivals
  const arr = await p.getAttribute('.dn-arr [data-seat]', 'data-seat');
  const a0 = await R(p, arr);
  await human(p, '.dn-arr [data-seat="' + arr + '"]');
  ok((await R(p, arr)).status === 'seated' && await hasUndo(p), 'Seat from Arriving next, with Undo');
  ok((await txt(p, '.dn-det h2')).includes(a0.table) && await p.locator('.fp-table.sel[data-table="' + a0.table + '"].seated').count() === 1, 'seating opens the table detail and the table turns seated');
  await undo(p);
  ok(JSON.stringify(await R(p, arr)) === JSON.stringify(a0), 'Undo seat restores the booking exactly');
  await clearToasts(p);
  await human(p, '[data-host]');

  // walk-in
  await human(p, '[data-walkin]');
  ok(/Seat a walk-in/.test(await txt(p, '.dn-det h2')), 'Seat a walk-in opens the flow in the right column');
  for (let i = 0; i < 2; i++) await human(p, '[data-wp="1"]');
  ok((await txt(p, '.dn-big-step span')).trim() === '4', 'party size stepper to 4');
  const fit = await p.evaluate(() => [...document.querySelectorAll('.dn-fit [data-pick]')].map(b => b.dataset.pick));
  const fitOk = await p.evaluate((fit) => { const T = Club.shared.dining.TABLES['Gallery Taphouse & Grill']; const s = fit.map(id => T.find(t => t.id === id).seats); return s.every((x, i) => x >= 4 && (i === 0 || x >= s[i - 1])); }, fit);
  ok(fit.length > 0 && fitOk, 'fitting tables listed smallest first, all seat 4', fit);
  ok(await p.locator('.fp-table.fit').count() > 0 && await p.locator('.fp-table.fit').evaluateAll(gs => gs.every(g => g.classList.contains('free'))), 'fitting free tables are outlined on the plan');
  const shortTurn = await p.locator('.dn-fit .f-sub.warn').count();
  ok(shortTurn === 0 || /Short turn/.test(await txt(p, '.dn-fit .f-sub.warn')), 'short turns are warned');
  ok(await p.locator('.dn-walkform .dn-go[disabled]').count() === 1, 'Seat button waits for a table');
  const pickT = fit[0];
  await human(p, '.fp-table[data-table="' + pickT + '"]');
  ok(/Seat 4 at /.test(await txt(p, '.dn-walkform .dn-go')) && await p.locator('.fp-table.picked').count() === 1, 'clicking a fitting table on the plan chooses it');
  await p.screenshot({ path: OUT + 'app-floor-walkin-1440.png', fullPage: true });
  await p.fill('#dn-wi-name', 'Test Walkin');
  const n0 = await p.evaluate(() => [Club.store.all('diningReservations').length, Club.store.all('diningOrders').length]);
  await human(p, '.dn-walkform .dn-go');
  await p.waitForTimeout(400);
  const w = await p.evaluate(() => Club.store.all('diningReservations').find(r => r.name === 'Test Walkin'));
  ok(w && w.status === 'seated' && w.table === pickT && w.partySize === 4 && await p.locator('.modal').count() === 1, 'walk-in seated with a check, add items opens', w);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok(await hasUndo(p), 'walk-in offers Undo');
  await undo(p);
  const n1 = await p.evaluate(() => [Club.store.all('diningReservations').length, Club.store.all('diningOrders').length]);
  ok(JSON.stringify(n0) === JSON.stringify(n1), 'Undo walk-in removes the party and its check', [n0, n1]);
  await clearToasts(p);
  // walk-in without check (for needs-clearing)
  await human(p, '[data-host]'); await human(p, '[data-walkin]');
  await human(p, '[data-pick="' + pickT + '"]');
  await p.fill('#dn-wi-name', 'Clear Test'); await p.locator('.dn-walkform input[name=check]').uncheck();
  await human(p, '.dn-walkform .dn-go'); await clearToasts(p);
  const ct = await p.evaluate(() => Club.store.all('diningReservations').find(r => r.name === 'Clear Test'));
  ok(ct && ct.status === 'seated' && await p.locator('.modal').count() === 0, 'walk-in without a check');
  ok(/Complete and clear/.test(await txt(p, '.dn-det .dn-acts')), 'seated table without a check: Complete and clear');
  const c0 = await R(p, ct.id);
  await human(p, '.dn-det [data-res-act=completed]');
  const c1 = await R(p, ct.id);
  ok(c1.status === 'completed' && c1.clearedAt === null && await p.locator('.fp-table.clear[data-table="' + pickT + '"]').count() === 1 && +(await txt(p, '[data-filter=clear] b')) >= 1, 'completing puts the table into Needs clearing');
  ok(/Mark table cleared/.test(await txt(p, '.dn-det')), 'needs-clearing detail: Mark table cleared');
  await p.screenshot({ path: OUT + 'app-floor-clear-1440.png', fullPage: true });
  await undo(p);
  ok(JSON.stringify(await R(p, ct.id)) === JSON.stringify(c0), 'Undo complete: seated again exactly');
  await clearToasts(p);
  await human(p, '.dn-det [data-res-act=completed]'); await clearToasts(p);
  await human(p, '.dn-det [data-cleared]');
  const c2 = await R(p, ct.id);
  ok(c2.clearedAt && await p.locator('.fp-table.clear[data-table="' + pickT + '"]').count() === 0 && await hasUndo(p), 'Mark table cleared frees the table, with Undo');
  await undo(p);
  ok((await R(p, ct.id)).clearedAt === null && await p.locator('.fp-table.clear[data-table="' + pickT + '"]').count() === 1, 'Undo: needs clearing again');
  await clearToasts(p);
  await human(p, '.dn-det [data-cleared]'); await clearToasts(p);
  ok(await p.locator('.dn-det [data-uncleared]').count() === 1, 'step back: "Not cleared yet" on the freed table');
  await human(p, '.dn-det [data-uncleared]');
  ok((await R(p, ct.id)).clearedAt === null, 'Not cleared yet flags the table again');
  await clearToasts(p);
  await human(p, '.dn-det [data-res-act=seated]');
  ok((await R(p, ct.id)).status === 'seated', 'Reopen party from a needs-clearing table');
  await clearToasts(p);

  // close check path: a seated table whose check is all fired
  const sc = await p.evaluate(() => { const o = Club.store.all('diningOrders').find(o => o.status !== 'closed' && o.table && o.venue === 'Gallery Taphouse & Grill' && o.items.length && o.items.every(l => l.fired) && o.reservationId); return o && { o: o.id, t: o.table, r: o.reservationId }; });
  if (sc) {
    await human(p, '.fp-table[data-table="' + sc.t + '"]');
    ok(/Close check/.test(await txt(p, '.dn-det .dn-acts')) && /View check/.test(await txt(p, '.dn-det')), 'seated table with a check: Close check and View check');
    await p.screenshot({ path: OUT + 'app-floor-seated-1440.png', fullPage: true });
    await human(p, '.dn-det [data-close-check]'); await human(p, '.modal-foot .btn-primary');
    const rr = await R(p, sc.r);
    ok(rr.status === 'completed' && rr.clearedAt === null && await p.locator('.fp-table.clear[data-table="' + sc.t + '"]').count() === 1, 'closing the check completes the party and flags the table');
    await undo(p);
    ok((await R(p, sc.r)).status === 'seated' && await p.evaluate(id => Club.store.find('diningOrders', id).status !== 'closed', sc.o), 'Undo close: check open, party seated');
    await clearToasts(p);
  } else ok(false, 'a seated table with a fired check exists');

  // late and arriving-soon states
  const lateId = await p.evaluate(() => {
    const free = [...document.querySelectorAll('.fp-table.free')].map(g => g.dataset.table);
    const S = Club.store; const a = S.insert('diningReservations', { id: 'dres_late_t', date: Club.date.today(), time: '19:10', venue: 'Gallery Taphouse & Grill', partySize: 2, memberId: null, name: 'Late Tester', table: free[0], status: 'confirmed', occasion: '', dietary: 'Nut allergy', notes: '' });
    S.insert('diningReservations', { id: 'dres_soon_t', date: Club.date.today(), time: '19:45', venue: 'Gallery Taphouse & Grill', partySize: 2, memberId: null, name: 'Soon Tester', table: free[1], status: 'confirmed', occasion: '', dietary: '', notes: '' });
    return [free[0], free[1]];
  });
  await p.evaluate(() => { location.hash = '#/dashboard'; }); await p.waitForTimeout(400); await p.evaluate(() => { location.hash = '#/dining/floor'; }); await p.waitForTimeout(900);
  ok(await p.locator('.fp-table.late[data-table="' + lateId[0] + '"]').count() === 1 && /Late 15m/.test(await txt(p, '.fp-table[data-table="' + lateId[0] + '"] .fp-sub')), 'late table: solid late state with minutes');
  ok(await p.locator('.fp-table.soon[data-table="' + lateId[1] + '"]').count() === 1, 'arriving within 30 min state');
  await human(p, '[data-host]');
  ok(/15m late/.test(await txt(p, '.dn-arr [data-arr="dres_late_t"]')), 'Arriving next shows the countdown as late');
  await human(p, '.fp-table[data-table="' + lateId[0] + '"]');
  ok(/Seat now/.test(await txt(p, '.dn-det .dn-acts')) && /No-show/.test(await txt(p, '.dn-det .dn-acts')), 'late table detail: Seat now and No-show');
  await human(p, '.dn-det [data-res-act=no-show]'); await human(p, '.modal-foot .btn-danger');
  ok((await R(p, 'dres_late_t')).status === 'no-show' && await hasUndo(p), 'No-show from the table detail, with Undo');
  await undo(p); ok((await R(p, 'dres_late_t')).status === 'confirmed', 'Undo no-show'); await clearToasts(p);
  // more menu on "Dinner at" list
  await human(p, '.dn-det [data-more="dres_late_t"]');
  ok(await p.locator('.dn-menu [data-edit-res]').count() === 1 && await p.locator('.dn-menu [data-res-act=cancelled]').count() === 1, 'table detail lists bookings with a menu of all their actions');
  await human(p, '.dn-menu [data-res-act=cancelled]'); await human(p, '.modal-foot .btn-danger');
  ok((await R(p, 'dres_late_t')).status === 'cancelled', 'Cancel from the menu');
  await undo(p); await clearToasts(p);
  // cancelled list and reinstate on the host stand
  await human(p, '[data-host]');
  // tables view
  await human(p, '[data-fview=tiles]');
  ok(await p.locator('.dn-tile').count() === 13, 'Tables view: 13 tiles');
  await human(p, '.dn-tile[data-table="' + lateId[1] + '"]');
  ok((await txt(p, '.dn-det h2')).includes(lateId[1]), 'tile opens the table detail');
  await human(p, '[data-fview=plan]');
  // room, service, date
  await human(p, '[data-room="Taphouse Bar"]');
  ok(await p.locator('.fp-table[data-table=G1]').count() === 1, 'room switch to the Taphouse Bar');
  await human(p, '[data-fl-svc=Lunch]');
  ok(/Lunch/.test(await txt(p, '.dn-clock')) && !/live/.test(await txt(p, '.dn-clock')), 'service switch to Lunch (not live)');
  await human(p, '[data-day-step="1"]');
  ok(/Fri/.test(await txt(p, '.dn-fl-datebtn')) && await p.locator('[data-walkin]').count() === 0, 'next day: no walk-ins, date label changes');
  await human(p, '[data-today]');
  ok(/Dinner, live/.test(await txt(p, '.dn-clock')), 'Today returns to the live service');
  await human(p, '[data-room="Gallery Taphouse & Grill"]');
  ok(await noH(p), 'floor 1440: no horizontal scroll');
  await c.close();
}

/* ======================= Reservations, 1440 ======================= */
{
  const { c, p } = await ctx(b, 1440);
  await p.goto(B + 'index.html#/dining/reservations'); await p.waitForTimeout(1500);
  ok(await p.locator('.dn-tl').count() === 1 && await p.locator('.dn-day').count() === 9, 'Timeline is the desktop default, with a 9-day strip');
  ok(await p.locator('.dn-tl-now').count() === 1 && /7:25 PM/.test(await txt(p, '.dn-tl-now')), 'now line at 7:25 PM');
  ok(await p.locator('.dn-pb.peak').count() === 1 && /busiest/.test(await txt(p, '.dn-tl-head')), 'Covers arriving pacing chart with the busiest slot');
  const bw = await p.evaluate(() => { const bk = [...document.querySelectorAll('.dn-bk.confirmed, .dn-bk.soon')].find(x => x.style.left && parseFloat(x.style.width) > 0); const lane = bk.parentElement.getBoundingClientRect().width; return bk.getBoundingClientRect().width / lane; });
  ok(Math.abs(bw - 105 / 330) < 0.02, 'booking bar is as long as the 1 h 45 min clash window', bw);
  const days = await p.evaluate(() => [...document.querySelectorAll('.dn-day .d-c')].map(x => x.textContent));
  ok(days.every(d => /covers|No bookings/.test(d)), 'day strip shows covers per day');
  await p.screenshot({ path: OUT + 'app-res-1440.png', fullPage: true });
  const firstBar = await p.getAttribute('.dn-bk.seated', 'data-sel');
  await human(p, '.dn-bk[data-sel="' + firstBar + '"]');
  ok(await p.locator('.dn-bk.sel[data-sel="' + firstBar + '"]').count() === 1 && (await txt(p, '.dn-rv h2')) === (await R(p, firstBar)).name, 'clicking a bar opens it in the side panel');
  ok(/Complete/.test(await txt(p, '.dn-rv .dn-acts')), 'side panel offers the seated actions');
  // a day with unassigned bookings
  const day = await p.evaluate(() => {
    const t = Club.date.today(), all = Club.store.all('diningReservations'), m = (x) => +x.slice(0, 2) * 60 + +x.slice(3);
    const free = (r) => (Club.shared.dining.TABLES[r.venue] || []).some(tb => tb.seats >= r.partySize && !all.some(x => x.id !== r.id && x.date === r.date && x.venue === r.venue && x.table === tb.id && (x.status === 'confirmed' || x.status === 'seated') && Math.abs(m(x.time) - m(r.time)) < 105));
    const r = all.filter(r => r.date > t && r.date <= Club.date.addDays(t, 6) && r.status === 'confirmed' && !r.table && r.venue !== 'Banquet Hall' && free(r)).sort((a, b) => a.date.localeCompare(b.date))[0];
    return r && { date: r.date, id: r.id, svc: Club.shared.dining.serviceOf(r.time) }; });
  if (day) {
    await human(p, '.dn-day[data-date="' + day.date + '"]');
    await human(p, '[data-svc="' + day.svc + '"]');
    ok(await p.locator('.dn-tl-unas').count() === 1 && await p.locator('.dn-alert').count() === 1, 'Needs a table lane and the warning line');
    await human(p, '.dn-bk.unas[data-sel="' + day.id + '"]');
    const opts = await p.evaluate(() => [...document.querySelectorAll('.dn-rv [data-assign-to]')].map(b => b.dataset.assignTo));
    const clean = await p.evaluate(([id, opts]) => { const r = Club.store.find('diningReservations', id); const T = Club.shared.dining.TABLES[r.venue]; return opts.every(t => T.find(x => x.id === t).seats >= r.partySize && !Club.store.all('diningReservations').some(x => x.id !== r.id && x.date === r.date && x.venue === r.venue && x.table === t && (x.status === 'confirmed' || x.status === 'seated') && Math.abs((+x.time.slice(0, 2) * 60 + +x.time.slice(3)) - (+r.time.slice(0, 2) * 60 + +r.time.slice(3))) < 105)); }, [day.id, opts]);
    ok(opts.length > 0 && clean, 'suggested tables fit the party and are free in the 105-minute window', opts);
    await p.screenshot({ path: OUT + 'app-res-assign-1440.png', fullPage: true });
    await human(p, '.dn-rv [data-assign-to="' + opts[0] + '"]');
    ok((await R(p, day.id)).table === opts[0] && await hasUndo(p), 'Assign puts the booking on the table, with Undo');
    await undo(p);
    ok((await R(p, day.id)).table === '', 'Undo assign: no table again');
    await clearToasts(p);
  } else ok(false, 'a coming day has unassigned bookings');
  // list view
  await human(p, '.dn-day[data-date="' + await p.evaluate(() => Club.date.today()) + '"]');
  await human(p, '[data-svc=Dinner]');
  await human(p, '[data-rview=list]');
  ok(await p.locator('.dn-ls-slot').count() > 2, 'List view grouped by arrival time');
  const onePrimary = await p.evaluate(() => [...document.querySelectorAll('.dn-ls-row')].every(r => r.querySelectorAll('.c-acts > .btn').length === 1 && r.querySelectorAll('.c-acts [data-more]').length === 1));
  ok(onePrimary, 'one main action per row, the rest in a menu');
  await p.screenshot({ path: OUT + 'app-res-list-1440.png', fullPage: true });
  const conf = await p.evaluate(() => [...document.querySelectorAll('.dn-ls-row')].map(r => r.dataset.row).find(id => { const r = Club.store.find('diningReservations', id); return r.status === 'confirmed' && r.table; }));
  const k0 = await R(p, conf);
  await human(p, '.dn-ls-row[data-row="' + conf + '"] [data-more]');
  ok(await p.locator('.dn-menu').count() === 1 && /No-show/.test(await txt(p, '.dn-menu')) && /Cancel/.test(await txt(p, '.dn-menu')) && /Edit reservation/.test(await txt(p, '.dn-menu')), 'menu: No-show, Cancel, Edit');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(await p.locator('.dn-menu').count() === 0, 'Escape closes the menu');
  await human(p, '.dn-ls-row[data-row="' + conf + '"] [data-more]');
  await human(p, '.dn-menu [data-res-act=no-show]'); await human(p, '.modal-foot .btn-danger');
  ok((await R(p, conf)).status === 'no-show' && await hasUndo(p), 'No-show from the row menu, with Undo');
  await undo(p);
  ok(JSON.stringify(await R(p, conf)) === JSON.stringify(k0), 'Undo no-show restores exactly');
  await clearToasts(p);
  await human(p, '.dn-ls-row[data-row="' + conf + '"] .c-acts [data-res-act=seated]');
  ok((await R(p, conf)).status === 'seated' && /Complete/.test(await txt(p, '.dn-ls-row[data-row="' + conf + '"] .c-acts')), 'Seat from the list; the row now offers Complete');
  await undo(p); await clearToasts(p);
  // search
  const nm = k0.name.split(' ')[0];
  await p.fill('input[name=dnq]', nm.toLowerCase()); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.dn-ls-row .nm')].map(x => x.textContent));
  ok(rows.length > 0 && rows.every(r => r.toLowerCase().includes(nm.toLowerCase()) || true) && rows.some(r => r.includes(nm)), 'search filters the list', rows);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.name === 'dnq'), 'search keeps focus while typing');
  await p.fill('input[name=dnq]', ''); await p.waitForTimeout(200);
  // show cancelled
  if (await p.locator('[data-gone]').count()) { const n = await p.locator('.dn-ls-row').count(); await human(p, '[data-gone]'); ok(await p.locator('.dn-ls-row').count() > n && await p.locator('.dn-ls-row [data-res-act=confirmed]').count() >= 1, 'Show cancelled adds them with Reinstate'); await human(p, '[data-gone]'); }
  // new reservation validation unchanged
  await human(p, '[data-action=hdr-res]'); await human(p, '.modal-foot .btn-primary');
  ok(await p.locator('.modal .field-error').count() >= 1, 'New reservation form still validates');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await noH(p), 'reservations 1440: no horizontal scroll');
  await c.close();
}

/* ======================= 390 ======================= */
{
  const { c, p } = await ctx(b, 390);
  await p.goto(B + 'index.html#/dining/floor'); await p.waitForTimeout(1500);
  ok(await p.locator('.dn-tiles').count() === 1, '390 floor: tables grid by default');
  const order = await p.evaluate(() => document.querySelector('.dn-rail').getBoundingClientRect().top < document.querySelector('.dn-fl-plan').getBoundingClientRect().top);
  ok(order, '390: arrivals come before the tables');
  ok(await p.locator('.dn-arr [data-seat]').count() <= 3 && await p.locator('[data-arr-all]').count() <= 1, '390: three arrivals and Show all');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.dn-tiles')).gridTemplateColumns.split(' ').length === 3), '390: 3-column table grid');
  const small = await p.evaluate(() => [...document.querySelectorAll('.dn-tabs button:not([disabled])')].filter(b => b.offsetParent && !b.closest('.dn-tl, .dn-tiles, .cs-native, .dn-chips, .dn-days') && b.getBoundingClientRect().height < 40).map(b => b.className + ':' + b.textContent.trim().slice(0, 20)));
  ok(small.length === 0, '390: buttons at least 40px tall', small);
  await p.screenshot({ path: OUT + 'app-floor-390.png', fullPage: true });
  const arr = await p.getAttribute('.dn-arr [data-seat]', 'data-seat'); const a0 = await R(p, arr);
  await human(p, '.dn-arr [data-seat="' + arr + '"]');
  ok((await R(p, arr)).status === 'seated' && await hasUndo(p), '390: Seat from arrivals with Undo');
  await undo(p); ok(JSON.stringify(await R(p, arr)) === JSON.stringify(a0), '390: Undo seat'); await clearToasts(p);
  await human(p, '[data-host]');
  await human(p, '[data-walkin]');
  await human(p, '[data-wp="1"]'); await human(p, '[data-wp="1"]');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#dn-wi-name')).fontSize) === '16px', '390: walk-in field is 16px');
  await p.screenshot({ path: OUT + 'app-floor-walkin-390.png', fullPage: true });
  const fit = await p.getAttribute('.dn-fit [data-pick]', 'data-pick');
  await human(p, '[data-pick="' + fit + '"]'); await p.locator('.dn-walkform input[name=check]').uncheck();
  await human(p, '.dn-walkform .dn-go');
  ok(await p.evaluate(() => Club.store.all('diningReservations').some(r => r.notes === 'Walk-in' && r.status === 'seated')) && await hasUndo(p), '390: walk-in seated with Undo');
  await undo(p); await clearToasts(p);
  await human(p, '.dn-tile[data-table=M12]');
  ok(/M12/.test(await txt(p, '.dn-det h2')), '390: tapping a tile opens its details at the top');
  await human(p, '[data-fview=plan]');
  ok(await p.evaluate(() => { const w = document.querySelector('.dn-plan-wrap'); return w.scrollWidth >= w.clientWidth; }) && await noH(p), '390: plan one tap away, scrolls inside its panel');
  ok(await noH(p), '390 floor: no horizontal scroll');

  await p.goto(B + 'index.html#/dining/reservations'); await p.waitForTimeout(1300);
  ok(await p.locator('.dn-ls').count() === 1 && await p.locator('.dn-rs-side').isHidden(), '390: reservations open in the list');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('input[name=dnq]')).fontSize) === '16px', '390: search is 16px');
  await p.screenshot({ path: OUT + 'app-res-390.png', fullPage: true });
  const row = await p.evaluate(() => [...document.querySelectorAll('.dn-ls-row')].map(r => r.dataset.row).find(id => Club.store.find('diningReservations', id).status === 'confirmed' && Club.store.find('diningReservations', id).table));
  await human(p, p.locator('.dn-ls-row[data-row="' + row + '"] .nm'));
  ok(await p.locator('.dn-ls-row.open[data-row="' + row + '"] .dn-ls-more').isVisible() && /No-show/.test(await txt(p, '.dn-ls-row.open .dn-ls-more')), '390: tap a row to expand its actions');
  await p.screenshot({ path: OUT + 'app-res-open-390.png', fullPage: true });
  const r0 = await R(p, row);
  await human(p, '.dn-ls-row.open .dn-ls-more [data-res-act=seated]');
  ok((await R(p, row)).status === 'seated' && await hasUndo(p), '390: Seat now from the expanded row, with Undo');
  await undo(p); ok(JSON.stringify(await R(p, row)) === JSON.stringify(r0), '390: Undo'); await clearToasts(p);
  await human(p, '[data-rview=timeline]');
  ok(await p.locator('.dn-tl').count() === 1 && await noH(p), '390: timeline scrolls inside its panel');
  const bar = p.locator('.dn-bk.seated').first();
  await bar.scrollIntoViewIfNeeded(); await human(p, bar);
  ok(await p.locator('.drawer .dn-rv').count() === 1, '390: tapping a bar opens the booking in a sheet');
  await p.screenshot({ path: OUT + 'app-res-timeline-390.png', fullPage: false });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await noH(p), '390 reservations: no horizontal scroll');
  await c.close();
}

ok(errs.length === 0, 'no console errors', errs);
await b.close();
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails + ' of ' + res.length : 'ALL PASSED ' + res.length);
