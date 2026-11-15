/* Weddings & Events redesign (Nov 12, 2026): To do, pipeline moves with undo, calendar day panel, one-page event view.
   node xc-fw.mjs 1440 | 390 */
import { makeT, human, modalBtn, undoToast, toastText, clearToasts, open, go, noHScroll } from './xc-lib.mjs';
const T = makeT(); const ok = T.ok;
const W = +(process.argv[2] || 1440), phone = W < 769;
const { b, p, errs } = await open(W);
const doc = (c, id) => p.evaluate(([c, id]) => JSON.stringify(Club.store.find(c, id)), [c, id]);
const field = (c, id, k) => p.evaluate(([c, id, k]) => { const d = Club.store.find(c, id); return d ? d[k] : undefined; }, [c, id, k]);
const setVal = (sel, v) => p.evaluate(([s, v]) => { const n = document.querySelector(s); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const text = (sel) => p.evaluate(s => { const n = document.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const shot = (n) => p.screenshot({ path: 'fwshots/xc-fw-' + n + '-' + W + '.png', fullPage: true });
const tab = (t) => human(p, p.locator('.fw-tabs .tab', { hasText: t }).first());
const quick = (id) => human(p, '.fw-todo [data-quick][data-id="' + id + '"]');
const rcCount = (id) => p.evaluate(id => Club.store.all('receipts').filter(r => r.source === 'functions' && r.refId === id).length, id);
const showCard = async (id) => { const st = await field('functions', id, 'stage'); const chip = p.locator('.fw-stagechips [data-stage="' + st + '"]'); if (await chip.isVisible()) await human(p, chip); };
const card = (id, part) => p.locator('.fw-card[data-flip="' + id + '"] ' + part);
await p.evaluate(() => { window.print = function () { const t = document.querySelector('.fn-print-target'); window.__printed = (window.__printed || []).concat([t ? t.textContent.replace(/\s+/g, ' ') : '']); }; });

try {
/* ================= To do ================= */
await go(p, '#/functions');
ok(await p.evaluate(() => { const t = document.querySelectorAll('.fw-tabs .tab'); return t[0].dataset.tab === 'todo' && t[0].classList.contains('active'); }), 'todo: To do is the first, active tab');
ok(/^\d+ this week$/.test(await text('.fw-tab-n')), 'todo: tab shows the count due this week', await text('.fw-tab-n'));
ok(/open enquir.*booked in the next 12 months.*deposits held.*Next:/.test(await text('.fw-sum')), 'todo: one summary line replaces the stat boxes', await text('.fw-sum'));
ok(await p.locator('.stats').count() === 0, 'todo: no stat boxes');
const groups = await p.evaluate(() => [...document.querySelectorAll('.fw-group .fw-sec-title h3')].map(h => h.textContent));
ok(JSON.stringify(groups) === JSON.stringify(['This week', 'Waiting on the client', 'Coming up later']), 'todo: three groups', groups);
ok(/Final numbers due/.test(await text('.fw-todo li[data-ev="fn_5"]')), 'todo: final numbers date read from the menu notes', await text('.fw-todo li[data-ev="fn_5"]'));
ok(await p.locator('.fw-agenda-panel .fw-agenda li').count() > 0 && await p.locator('.fw-agenda-panel li.dining').count() > 0, 'todo: Next 60 days lists events and Banquet Hall dining bookings');
await shot('todo');
ok(await noHScroll(p), 'todo: no horizontal scroll');

// Book tour from To do, then Undo
let d0 = await doc('functions', 'fn_16');
await quick('fn_16'); await modalBtn(p, 'Book tour');
ok(await field('functions', 'fn_16', 'stage') === 'Tour booked' && /Tour/.test(await text('.fw-todo li[data-ev="fn_16"] .fw-t-act')), 'todo: Book tour moves the enquiry and the row updates', await text('.fw-todo li[data-ev="fn_16"] .fw-t-act'));
await undoToast(p);
ok(await doc('functions', 'fn_16') === d0 && /New enquiry/.test(await text('.fw-todo li[data-ev="fn_16"] .fw-t-act')), 'todo: Undo puts the enquiry back');
await clearToasts(p);
// Update guests opens the details on the guest count
d0 = await doc('functions', 'fn_5');
await quick('fn_5');
await p.waitForTimeout(300);
if (!phone) ok(await p.evaluate(() => document.activeElement && document.activeElement.name) === 'guests', 'todo: Update guests puts the cursor in Guests');
await p.locator('.modal [name=guests]').fill('95');
await modalBtn(p, 'Save details');
ok(await field('functions', 'fn_5', 'guests') === 95, 'todo: guests updated');
await undoToast(p);
ok(await doc('functions', 'fn_5') === d0, 'todo: Undo guests');
await clearToasts(p);
// Record deposit (cash) from To do, with receipt; Undo nets the close
d0 = await doc('functions', 'fn_9');
let cs0 = await p.evaluate(() => __cs()), rc0 = await rcCount('fn_9');
await quick('fn_9');
await human(p, p.locator('.modal .segmented button', { hasText: 'Cash' }));
await modalBtn(p, 'Record deposit');
ok(await field('functions', 'fn_9', 'stage') === 'Deposit paid' && await rcCount('fn_9') === rc0 + 1 && await p.evaluate(() => __cs()) !== cs0, 'todo: Record deposit moves to deposit paid with a receipt in today’s close');
await undoToast(p);
ok(await doc('functions', 'fn_9') === d0 && await p.evaluate(() => __cs()) === cs0, 'todo: Undo deposit: record back, close unchanged');
await clearToasts(p);
// Confirm booking from To do
d0 = await doc('functions', 'fn_11');
await quick('fn_11');
ok(await field('functions', 'fn_11', 'stage') === 'Confirmed' && /moved to confirmed/.test(await toastText(p)), 'todo: Confirm booking in one click');
await undoToast(p);
ok(await doc('functions', 'fn_11') === d0, 'todo: Undo confirm');
await clearToasts(p);
// Row opens the event; Open board switches tab
await human(p, '.fw-todo li[data-ev="fn_15"] .fw-t-act');
ok(await p.evaluate(() => location.hash) === '#/functions/fn_15', 'todo: a row opens its event');
await go(p, '#/functions');
await human(p, '[data-go-tab=pipeline]');
ok(await text('.fw-tabs .tab.active') === 'Pipeline', 'todo: Open board shows the pipeline');

/* ================= Pipeline ================= */
await go(p, '#/functions'); await tab('Pipeline');
const visCols = await p.evaluate(() => [...document.querySelectorAll('.fw-col')].filter(c => c.offsetParent).length);
ok(phone ? visCols === 1 && await p.locator('.fw-stagechips').isVisible() : visCols === 5, 'pipeline: ' + (phone ? 'one stage at a time with stage chips' : 'five columns'), visCols);
ok(/Confirm booking/.test(await text('.fw-card[data-flip="fn_8"] .fw-next')), 'pipeline: card names its next step', await text('.fw-card[data-flip="fn_8"] .fw-next'));
await shot('pipeline');
ok(await noHScroll(p), 'pipeline: no horizontal scroll');
d0 = await doc('functions', 'fn_8');
await showCard('fn_8'); await human(p, card('fn_8', '.fw-next'));
ok(await field('functions', 'fn_8', 'stage') === 'Confirmed', 'pipeline: card button confirms the booking');
await undoToast(p);
ok(await doc('functions', 'fn_8') === d0, 'pipeline: Undo card move');
await clearToasts(p);
d0 = await doc('functions', 'fn_14');
await showCard('fn_14'); await human(p, card('fn_14', '.fw-more'));
ok(await p.locator('.fw-menu button', { hasText: 'Move back to tour booked' }).count() === 1 && await p.locator('.fw-menu button', { hasText: 'Mark lost' }).count() === 1, 'pipeline: card menu has move back and mark lost');
await human(p, p.locator('.fw-menu button', { hasText: 'Move back to tour booked' }));
ok(await field('functions', 'fn_14', 'stage') === 'Tour booked', 'pipeline: move back from the menu');
await undoToast(p);
ok(await doc('functions', 'fn_14') === d0, 'pipeline: Undo move back');
await clearToasts(p);
// Show completed and lost: lost card offers Reopen
await human(p, '.fn-closed');
await showCard('fn_13');
ok(/Reopen/.test(await text('.fw-card[data-flip="fn_13"] .fw-next')), 'pipeline: lost card offers Reopen');
d0 = await doc('functions', 'fn_13');
await human(p, card('fn_13', '.fw-next'));
ok(await field('functions', 'fn_13', 'stage') === 'Enquiry', 'pipeline: Reopen');
await undoToast(p);
ok(await doc('functions', 'fn_13') === d0, 'pipeline: Undo reopen');
await clearToasts(p);
await human(p, '.fn-closed');

/* ================= Calendar ================= */
await go(p, '#/functions'); await tab('Calendar');
if (phone) {
  ok(await p.locator('.fw-cal-agenda').isVisible() && !(await p.locator('.fw-cal-panel').isVisible()), 'calendar: phone shows the month agenda');
  ok(/Celebration of life for Irene Szymanski/.test(await text('.fw-cal-agenda')), 'calendar: agenda lists this month’s events');
} else {
  const d5 = await field('functions', 'fn_5', 'date');
  await human(p, '.fw-cday[data-date="' + d5 + '"] .fw-dn');
  ok(/Irene Szymanski/.test(await text('.fw-dayp')) && await p.locator('.fw-dayp .fw-box.warn').count() === 1, 'calendar: day panel lists the event and says the hall is taken', await text('.fw-dayp'));
  const free = await p.evaluate(() => { const t = Club.date.today(); for (let i = 1; i < 25; i++) { const d = Club.date.addDays(t, i); if (d.slice(0, 7) !== t.slice(0, 7)) break; const busy = Club.store.all('functions').some(f => f.date === d && f.stage !== 'Lost') || Club.store.all('diningReservations').some(r => r.date === d && r.venue === 'Banquet Hall' && r.status !== 'cancelled'); if (!busy) return d; } return null; });
  await human(p, '.fw-cday[data-date="' + free + '"] .fw-dn');
  ok(await p.locator('.fw-dayp .fw-box.ok').count() === 1 && /Start an enquiry for/.test(await text('.fw-dayp [data-action=cal-new]')), 'calendar: a free day says the hall is free', free);
  await shot('calendar');
  await human(p, '.fw-dayp [data-action=cal-new]');
  ok(await p.locator('.modal h3', { hasText: 'New enquiry' }).count() === 1 && await p.evaluate(() => document.querySelector('.modal [name=date]').value) === free, 'calendar: Start an enquiry opens the form on that date');
  await modalBtn(p, 'Cancel'); await p.waitForTimeout(300);
  const past = await p.evaluate(() => Club.date.addDays(Club.date.today(), -3));
  if (past.slice(0, 7) === (await p.evaluate(() => Club.date.today())).slice(0, 7)) { await human(p, '.fw-cday[data-date="' + past + '"] .fw-dn'); ok(/This date has passed/.test(await text('.fw-dayp')), 'calendar: a past day cannot start an enquiry'); }
  await human(p, '[data-action=cal-next]');
  ok(await text('.fw-cal-title') !== null && await p.locator('.fw-cday.sel').count() === 1, 'calendar: next month keeps a selected day');
}
if (phone) await shot('calendar');
ok(await noHScroll(p), 'calendar: no horizontal scroll');
await tab('Packages');
ok(await p.locator('.fn-pkg').count() >= 6 && await p.locator('[data-action=edit-pkg]').count() >= 6, 'packages: listed with Edit');
ok(await noHScroll(p), 'packages: no horizontal scroll');

/* ================= Event page ================= */
await go(p, '#/functions/fn_5');
ok(/7 of 9 done/.test(await text('#fw-next .panel-head')), 'event: Next steps counts done items', await text('#fw-next .panel-head'));
ok(await p.locator('#fw-next [data-task=guests]').count() === 1, 'event: checklist offers Update guests');
ok(await p.locator('.fw-steps li').count() === 6 && await p.locator('.fw-steps li.cur').count() === 1, 'event: compact stepper');
/* the demo's Banquet Hall dining bookings move with today's date, so the hall may be free or already in use that day */
ok(await p.evaluate(() => { const s = document.querySelector('.fw-ws-side'); return !!s && (/nothing else in the Banquet Hall/.test(s.innerText) || /This date is already in use/.test(s.innerText)); }), 'event: date clash check shows whether the hall is free');
ok(await p.locator('.fw-act li').count() >= 5, 'event: activity');
await human(p, '[data-action=q-toggle]');
ok(await p.locator('#fw-money .fw-tbl tfoot').count() === 1 && /GST 5% \+ PST 7%/.test(await text('#fw-money')), 'event: quote lines with GST and PST');
await shot('fn5');
ok(await noHScroll(p), 'event: no horizontal scroll');
// printable run sheet
await human(p, '[data-action=print-rs]');
let printed = await p.evaluate(() => (window.__printed || []).slice(-1)[0] || '');
ok(/Run sheet/.test(printed) && /Room set, coffee station ready/.test(printed) && /Confirm final numbers/.test(printed), 'event: run sheet prints with timings and menu notes', printed.slice(0, 200));
await p.waitForTimeout(1600);
ok(await p.locator('.fw-print-host').count() === 0, 'event: print sheet removed afterwards');
// More menu
await human(p, '.fn-actions [data-action=more]');
const items = await p.evaluate(() => [...document.querySelectorAll('.fw-menu button')].map(x => x.textContent.trim()));
ok(JSON.stringify(items) === JSON.stringify(['Edit details', 'Move back to deposit paid', 'Mark lost', 'Delete event']), 'event: More menu', items);
await p.keyboard.press('Escape');
if (phone) {
  await human(p, '[data-jump=fw-money]'); await p.waitForTimeout(700);
  const top = await p.evaluate(() => document.getElementById('fw-money').getBoundingClientRect().top);
  ok(top > -5 && top < 140, 'event: phone section chips jump to Money', top);
}

// Quote edit with live totals, save, undo
await go(p, '#/functions/fn_9');
d0 = await doc('functions', 'fn_9');
await human(p, '[data-action=q-edit]');
const t0 = await text('[data-t=total]');
await p.locator('.fn-q-qty').first().fill('80');
const t1 = await text('[data-t=total]');
ok(t0 !== t1, 'quote: total updates as you type', [t0, t1]);
await human(p, '[data-action=q-save]');
const q = await p.evaluate(() => Club.store.find('functions', 'fn_9').quote);
ok(q.lines[0].qty === 80 && (await text('#fw-money .fw-money')).includes(t1), 'quote: saved and the Money figures follow', t1);
await undoToast(p);
ok(await doc('functions', 'fn_9') === d0, 'quote: Undo');
await clearToasts(p);

// Record a card deposit, receipt in Documents, Undo
await go(p, '#/functions/fn_14');
d0 = await doc('functions', 'fn_14'); cs0 = await p.evaluate(() => __cs()); rc0 = await rcCount('fn_14');
await human(p, '[data-action=deposit]');
await p.locator('.modal [name=amount]').fill('500');
await p.locator('.modal [name=ccnumber]').fill('4242 4242 4242 4242');
await p.locator('.modal [name=ccname]').fill('Chloe Lavallee');
await p.locator('.modal [name=ccexp]').fill('12/29');
await p.locator('.modal [name=cccvc]').fill('123');
await modalBtn(p, 'Record deposit');
const dep = await p.evaluate(() => (Club.store.find('functions', 'fn_14').deposits || [])[0]);
ok(dep && dep.amount === 500 && dep.last4 === '4242' && !JSON.stringify(dep).includes('4242424242424242') && await field('functions', 'fn_14', 'stage') === 'Deposit paid', 'deposit: card deposit recorded (last four only), moved to deposit paid', dep);
ok(await rcCount('fn_14') === rc0 + 1 && /Receipt, deposit of \$500\.00/.test(await text('#fw-docs')), 'deposit: receipt listed under Documents');
await human(p, p.locator('#fw-docs [data-dep-rc]').first());
ok(await p.locator('.modal h3', { hasText: /^Receipt / }).count() === 1, 'deposit: receipt opens');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await undoToast(p);
ok(await doc('functions', 'fn_14') === d0 && await p.evaluate(() => __cs()) === cs0, 'deposit: Undo, close unchanged');
await clearToasts(p);

// Run sheet from the checklist, menu notes
await go(p, '#/functions/fn_11');
d0 = await doc('functions', 'fn_11');
await human(p, '#fw-next [data-task=runsheet]');
ok(await p.locator('#fw-plan .fn-rs li').count() === 1, 'run sheet: Add timings opens the editor');
await setVal('#fw-plan input[data-k=time]', '18:00');
await p.locator('#fw-plan input[data-k=item]').first().fill('Guests arrive');
await human(p, '[data-action=rs-add]');
await p.locator('#fw-plan input[data-k=item]').last().fill('Dinner service');
await setVal('#fw-plan li:last-child input[data-k=time]', '17:30');
await human(p, '[data-action=rs-save]');
const rs = await field('functions', 'fn_11', 'runSheet');
ok(rs.length === 2 && rs[0].time === '17:30' && rs[1].item === 'Guests arrive' && /5:30 PM/.test(await text('#fw-plan .fw-rs')), 'run sheet: saved in time order', rs);
ok(/Run sheet ready/.test(await text('#fw-next')), 'run sheet: checklist ticks it off');
await undoToast(p);
ok(await doc('functions', 'fn_11') === d0, 'run sheet: Undo');
await clearToasts(p);
await human(p, '[data-action=menu-edit]');
await p.locator('.fn-menu').fill('Two vegetarian meals');
await human(p, '[data-action=save-menu]');
ok(await field('functions', 'fn_11', 'menuNotes') === 'Two vegetarian meals', 'notes: saved');
await undoToast(p);
ok(await doc('functions', 'fn_11') === d0, 'notes: Undo');
await clearToasts(p);
await shot('fn11');

// Proposal: preview, print, mark sent
await go(p, '#/functions/fn_15');
await human(p, '[data-action=letter]');
ok(/Dear Megan/.test(await text('.modal .fn-letter')) && /Pricing to follow/.test(await text('.modal .fn-letter')), 'proposal: preview shows the letter');
await modalBtn(p, 'Print proposal');
printed = await p.evaluate(() => (window.__printed || []).slice(-1)[0] || '');
ok(/Dear Megan/.test(printed), 'proposal: prints the letter');
await shot('letter');
await modalBtn(p, 'Close'); await p.waitForTimeout(300);
d0 = await doc('functions', 'fn_15');
await human(p, '#fw-docs [data-action=mark-sent]');
ok(await field('functions', 'fn_15', 'stage') === 'Proposal sent' && !!(await field('functions', 'fn_15', 'quote')) && /Sent /.test(await text('#fw-docs')), 'proposal: Mark sent moves the stage and attaches a quote');
await undoToast(p);
ok(await doc('functions', 'fn_15') === d0, 'proposal: Undo mark sent');
await clearToasts(p);
ok(await noHScroll(p), 'event: no horizontal scroll (fn_15)');
} catch (e) { ok(false, 'script stopped: ' + e.message.split('\n')[0]); await p.screenshot({ path: 'fwshots/xc-fw-err-' + W + '.png' }); }
ok(errs.length === 0, 'no console errors', errs);
console.log(T.res.join('\n')); console.log(T.fails ? 'FAILED ' + T.fails + ' of ' + T.res.length : 'ALL PASSED ' + T.res.length); await b.close();
