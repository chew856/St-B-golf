export const B = 'http://localhost:8001/site/';
export function mk() {
  const res = []; let fails = 0;
  const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
  return { res, ok, fails: () => fails };
}
/* A human click: move the mouse to the element, press, release. */
export async function click(p, sel, opt = {}) {
  const loc = typeof sel === 'string' ? p.locator(sel + ' >> visible=true').first() : sel;
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  await loc.evaluate(e => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await p.waitForTimeout(120);
  const box = await loc.boundingBox();
  const x = box.x + Math.min(box.width / 2, opt.dx || box.width / 2), y = box.y + box.height / 2;
  await p.mouse.move(x - 8, y - 5); await p.mouse.move(x, y, { steps: 3 });
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(opt.wait || 450);
}
export async function type(p, sel, text) {
  await click(p, sel, { wait: 100 });
  const loc = p.locator(sel + ' >> visible=true').first();
  await loc.fill('');
  await p.keyboard.type(text, { delay: 8 });
  await p.waitForTimeout(150);
}
export async function overflow(p) { return p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); }
export async function stepAt(p, root = '') { return p.evaluate((r) => { const f = [...document.querySelectorAll((r ? r + ' ' : '') + '.ckf')].find(x => x.offsetParent !== null || x.getClientRects().length); return f ? f.dataset.at : null; }, root); }
export async function visible(p, sel) { return p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel); }
export async function seedCart(p, who = 'mem_mem_1003', n = 2) {
  await p.evaluate(([who, n]) => { Club.shop.clearCart(who); Club.shop.catalogue().filter(x => Club.shop.stockOf(x) > 2).slice(0, n).forEach(x => Club.shop.addToCart(who, x.id, 1)); }, [who, n]);
}
