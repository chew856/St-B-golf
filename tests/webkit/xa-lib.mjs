import { webkit } from 'playwright';
export const B = 'http://localhost:8001/site/';
export function T() {
  const res = []; let fails = 0;
  const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
  return { ok, res, fails: () => fails };
}
export async function human(p, sel) {
  const loc = typeof sel === 'string' ? p.locator(sel).first() : sel;
  await loc.waitFor({ timeout: 8000 }); await loc.evaluate(el => { const r = el.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight - 10) el.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(60);
  const box = await loc.boundingBox(); const x = box.x + Math.min(box.width / 2, 40), y = box.y + box.height / 2;
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(450);
}
export async function undo(p) { await human(p, p.locator('.toast.has-act:not(.leaving) .toast-act').last()); await p.waitForTimeout(300); }
export async function toastText(p) { return p.evaluate(() => [...document.querySelectorAll('.toast:not(.leaving)')].map(t => t.textContent).join(' | ')); }
export async function hasUndo(p) { return (await p.locator('.toast.has-act:not(.leaving) .toast-act').count()) > 0; }
export async function clearToasts(p) { await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.parentNode.removeChild(t))); }
export async function launch(W) {
  const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: W || 1440, height: 900 } }); const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  return { b, c, p, errs };
}
export async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
export const money = (p) => p.evaluate(() => ({ charges: Club.store.all('charges').length, receipts: Club.store.all('receipts').length, sales: Club.store.all('sales').length, total: Club.store.all('members').reduce((a, m) => a + (m.balance || 0), 0).toFixed(2) }));
