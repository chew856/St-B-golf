import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
async function human(p, sel) { const loc = typeof sel === 'string' ? p.locator(sel).first() : sel; await loc.scrollIntoViewIfNeeded(); await loc.waitFor({ timeout: 8000 }); const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(500); }
const b = await webkit.launch();
for (const W of [1440, 390]) {
const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
// pick a booked group of members with a guest or cart, so check-in posts fees
const id = await p.evaluate(() => { const t = Club.store.all('teeTimes').filter(t => t.date === Club.date.today() && t.status === 'booked' && t.players.some(p => p.cart || p.type === 'guest') && !t.players.some(p => p.publicPlayerId || p.type === 'public'));
  return t.length ? t[0].id : null; });
ok(!!id, W + ': found a booked group', id);
await p.evaluate(id => { const t = Club.store.find('teeTimes', id); location.hash = '#/teesheet'; }, id);
const snap = () => p.evaluate(id => { const t = Club.store.find('teeTimes', id); const ids = [...new Set(t.players.map(x => x.memberId).filter(Boolean))];
  const bal = ids.map(m => Club.store.find('members', m).balance).concat(Club.store.all('members').filter(m => t.players.some(x => x.hostId === m.id)).map(m => m.balance));
  return { status: t.status, paid: t.players.map(x => !!x.paid), s: t.startedAt, f: t.finishedAt, total: Club.store.all('members').reduce((a, m) => a + (m.balance || 0), 0).toFixed(2), undo: (t.undo || []).length, size: JSON.stringify(t.undo || []).length }; }, id);
const s0 = await snap();
// show the right period
await p.evaluate(id => { const t = Club.store.find('teeTimes', id); const btn = [...document.querySelectorAll('[data-period]')].find(b => { const [h, m] = t.time.split(':').map(Number); const min = h * 60 + m; return true; }); }, id);
const rowSel = '.ts-row[data-id="' + id + '"]';
if (!(await p.locator(rowSel).isVisible().catch(() => false))) { await p.evaluate(() => { const a = [...document.querySelectorAll('button')].find(b => /All day/.test(b.textContent)); a && a.click(); }); await p.waitForTimeout(500); }
await human(p, p.locator(rowSel + ' [data-action=advance]'));
let s1 = await snap();
const toast = p.locator('.toast.has-act .toast-act').last();
ok(s1.status === 'checked-in' && +s1.total > +s0.total && await toast.isVisible(), W + ': check in posts fees and shows a toast with Undo', { s0, s1 });
await human(p, toast);
let s2 = await snap();
ok(s2.status === 'booked' && s2.total === s0.total && JSON.stringify(s2.paid) === JSON.stringify(s0.paid) && s2.undo === 0, W + ': Undo from the toast returns to booked and credits the fees back', { s0, s2 });
ok(await p.evaluate(() => /back to booked/.test([...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'))), W + ': confirms with a toast');
// forward three steps
for (let i = 0; i < 3; i++) { await human(p, p.locator(rowSel + ' [data-action=advance]')); await p.waitForTimeout(300); }
let s3 = await snap(); ok(s3.status === 'completed' && s3.s && s3.f && s3.undo === 3 && s3.size < 600, W + ': check in, send off, complete (undo record stays small)', s3);
// open details from a player and step back with the modal buttons
const labels = [];
for (const want of ['Reopen round', 'Undo send-off', 'Undo check-in']) {
  await human(p, p.locator(rowSel + ' .ts-slot.filled').first());
  const btn = p.locator('.modal button', { hasText: want });
  labels.push(await btn.count());
  if (await btn.count()) await human(p, btn.first()); else await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}
let s4 = await snap();
ok(labels.every(n => n === 1) && s4.status === 'booked' && s4.total === s0.total && !s4.s && !s4.f && s4.undo === 0, W + ': details buttons Reopen round, Undo send-off, Undo check-in walk it back to booked, fees credited', { labels, s4, s0 });
// no-show and undo
await human(p, p.locator(rowSel + ' .ts-slot.filled').first());
await human(p, p.locator('.modal button', { hasText: 'Mark no-show' }).first()); await p.waitForTimeout(400);
let s5 = await snap(); ok(s5.status === 'no-show', W + ': marked no-show', s5);
await human(p, p.locator('.toast.has-act .toast-act').last());
let s6 = await snap(); ok(s6.status === 'booked', W + ': Undo no-show from the toast', s6);
// a seeded completed round without saved steps can be reopened
const old = await p.evaluate(() => { const t = Club.store.all('teeTimes').find(t => t.date === Club.date.today() && t.status === 'completed' && !(t.undo || []).length) || Club.store.all('teeTimes').find(t => t.date === Club.date.today() && t.status === 'on-course'); return t ? t.id + '|' + t.status : null; });
if (old) { const [oid, ost] = old.split('|'); const sel = '.ts-row[data-id="' + oid + '"] .ts-slot.filled';
  if (await p.locator(sel).first().isVisible().catch(() => false)) { await human(p, p.locator(sel).first()); const want = ost === 'completed' ? 'Reopen round' : 'Undo send-off';
    const n = await p.locator('.modal button', { hasText: want }).count(); if (n) await human(p, p.locator('.modal button', { hasText: want }).first());
    const st = await p.evaluate(id => Club.store.find('teeTimes', id).status, oid); ok(n === 1 && st === (ost === 'completed' ? 'on-course' : 'checked-in'), W + ': older round without a saved step steps back too', { ost, st, n }); } }
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ': no horizontal scroll');
await p.screenshot({ path: 'undo-' + W + '.png' });
await c.close();
}
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
