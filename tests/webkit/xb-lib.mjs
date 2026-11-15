import { webkit } from 'playwright';
export const B = 'http://localhost:8001/site/';
export function suite() {
  const res = []; let fails = 0; const errs = [];
  const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
  const done = () => { console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails + ' of ' + res.length : 'ALL PASSED ' + res.length); };
  return { res, ok, errs, done, get fails() { return fails; } };
}
export async function human(p, sel) {
  const loc = typeof sel === 'string' ? p.locator(sel).first() : sel;
  await loc.waitFor({ timeout: 8000 }); await loc.evaluate(e => { if (!e.closest('.toast, .modal, .drawer')) e.scrollIntoView({ block: 'center' }); }); await loc.scrollIntoViewIfNeeded();
  let box = await loc.boundingBox();
  /* a toast covering the target (they sit at the top on phones): wait for it to leave, as a person would */
  for (let i = 0; i < 40; i++) { const covered = await loc.evaluate((e, pt) => { const h = document.elementFromPoint(pt[0], pt[1]); return !e.closest('.toast') && !!(h && !e.contains(h) && h.closest('.toast')); }, [box.x + box.width / 2, box.y + box.height / 2]); if (!covered) break; await p.waitForTimeout(250); box = await loc.boundingBox(); }
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(450);
}
export async function open(W, hash, S) {
  const b = await webkit.launch();
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
  p.on('pageerror', e => S.errs.push(W + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) S.errs.push(W + ' ' + m.text()); });
  await p.goto(B + 'index.html#/' + hash, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  return { b, c, p };
}
/** Click the Undo button on the newest toast that has one. */
export async function undo(p) {
  /* toasts slide as older ones leave: wait until the newest Undo button stops moving, then click it */
  const loc = p.locator('.toast.has-act:not(.leaving) .toast-act').last(); await loc.waitFor({ timeout: 8000 });
  for (let i = 0; i < 20 && await p.locator('.toast:not(.has-act), .toast.leaving').count(); i++) await p.waitForTimeout(200);
  let prev = null; for (let i = 0; i < 20; i++) { const bx = await loc.boundingBox(); if (prev && bx && Math.abs(bx.y - prev.y) < 0.5) break; prev = bx; await p.waitForTimeout(120); }
  await human(p, loc); await p.waitForTimeout(300);
}
export async function toastText(p) { return p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')); }
export async function modalBtn(p, text) { await human(p, p.locator('.modal-foot button', { hasText: text }).last()); }
export async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
/** Set a form control's value (native selects behind Club.pickers, date inputs) and fire change. */
export async function setVal(p, sel, v) {
  await p.evaluate(([sel, v]) => { const els = document.querySelectorAll(sel); const e = els[els.length - 1]; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
}
/** Money snapshot for members: balances to the cent, charge/receipt counts. */
export async function money(p, ids) {
  return p.evaluate(ids => { const S = Club.store; return { bal: ids.map(id => (S.find('members', id) || {}).balance.toFixed(2)), charges: S.all('charges').length, receipts: S.all('receipts').length }; }, ids);
}
