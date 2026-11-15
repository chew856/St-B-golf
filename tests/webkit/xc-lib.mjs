import { webkit } from 'playwright';
export const B = 'http://localhost:8001/site/';
export function makeT() {
  const res = []; let fails = 0;
  const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x).slice(0, 900))); if (!c) fails++; };
  return { ok, res, get fails() { return fails; } };
}
export async function human(p, sel) {
  const loc = typeof sel === 'string' ? p.locator(sel).first() : sel;
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  await loc.evaluate(e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (r.top < 90 || r.bottom > innerHeight - 10 || r.left < 0 || r.right > innerWidth || !hit || !(hit === e || e.contains(hit))) e.scrollIntoView({ block: 'center', inline: 'center' }); });
  await p.waitForTimeout(80);
  const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 6, y - 4); await p.mouse.move(x, y, { steps: 3 }); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up();
  await p.waitForTimeout(450);
}
export async function modalBtn(p, text) { await human(p, p.locator('.modal button', { hasText: text }).last()); }
export async function undoToast(p) { await human(p, p.locator('.toast.has-act .toast-act').last()); await p.waitForTimeout(300); }
export async function toastText(p) { return p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')); }
export async function clearToasts(p) { await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); }
export async function open(W) {
  const b = await webkit.launch();
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const r = v => Math.round(v * 100) / 100;
    window.__cs = d => { const s = Club.accounting.summarize(d || Club.date.today()); return JSON.stringify({ total: s.total, bt: s.byTender, bd: s.byDept, mt: s.moneyTaken, dr: s.drawers, mp: s.memberPayments, dep: r(s.deposits.reduce((a, x) => a + x.amount, 0)), cash: s.cashOutside }); };
    window.__jn = d => { const j = Club.accountingExport.journalFor(d || Club.date.today()); const m = {}; j.lines.forEach(l => { m[l.key] = r((m[l.key] || 0) + l.debit - l.credit); }); Object.keys(m).forEach(k => { if (Math.abs(m[k]) < 0.005) delete m[k]; }); return JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])); };
    window.__rcIds = () => Club.store.all('receipts').map(x => x.id);
    window.__allKept = ids => { const have = new Set(Club.store.all('receipts').map(x => x.id)); return ids.every(i => have.has(i)); };
  });
  return { b, c, p, errs };
}
export async function go(p, hash) { await p.evaluate(h => { location.hash = h; }, hash); await p.waitForTimeout(700); }
export async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
