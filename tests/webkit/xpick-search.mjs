/* Long dropdowns get a search box (Nov 12): Post charge > Pro shop items. */
import { suite, human, open, noHScroll } from './xb-lib.mjs';
const S = suite(); const { ok } = S;
async function pick(p, name, text) {
  await human(p, p.locator('.modal .field:has(select[name=' + name + ']) .cs-btn'));
  const opt = p.locator('.cs-pop .cs-opt', { hasText: text }).first();
  await opt.waitFor({ timeout: 4000 }); await opt.evaluate(e => e.scrollIntoView({ block: 'nearest' })); await p.waitForTimeout(150);
  const b = await opt.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350);
}
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'dashboard', S);
  try {
    const mid = await p.evaluate(() => Club.store.all('members').find(m => m.status === 'active').id);
    const prod = await p.evaluate(() => Club.store.all('products').filter(x => x.price > 0).sort((a, b) => b.name.length - a.name.length)[0].name);
    await p.evaluate(id => { location.hash = '#/members/' + id; }, mid); await p.waitForTimeout(1200);
    await human(p, '[data-action=charge]:visible');
    /* a short list has no search box */
    await human(p, p.locator('.modal .field:has(select[name=category]) .cs-btn'));
    ok(await p.locator('.cs-pop .cs-search').count() === 0, W + ': a short list (Category) has no search box');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await pick(p, 'category', 'Pro shop');
    await human(p, p.locator('.modal .field:has(select[name=chargeItem]) .cs-btn')); await p.waitForTimeout(300);
    ok(await p.locator('.cs-pop .cs-search-in').count() === 1, W + ': the long Pro shop item list has a search box');
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('cs-search-in'));
    ok(W === 390 ? true : focused, W + ': on desktop the search box takes the typing straight away', focused);
    await human(p, '.cs-pop .cs-search-in');
    const word = prod.split(/[\s,]+/).find(w => w.length > 3) || prod.slice(0, 5);
    await p.keyboard.type(word.toLowerCase(), { delay: 30 }); await p.waitForTimeout(300);
    const r = await p.evaluate(w => { const vis = [...document.querySelectorAll('.cs-pop .cs-opt:not([hidden])')].map(n => n.textContent.trim()); return { vis, all: document.querySelectorAll('.cs-pop .cs-opt').length, ok: vis.every(t => t.toLowerCase().includes(w.toLowerCase())) }; }, word);
    ok(r.vis.length >= 1 && r.vis.length < r.all && r.ok, W + ': typing "' + word + '" narrows ' + r.all + ' items to ' + r.vis.length, r);
    if (W === 1440) await p.screenshot({ path: './shots/pick-search-1440.png' });
    await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const v = await p.evaluate(() => ({ d: document.querySelector('.modal [name=description]').value, open: !!document.querySelector('.cs-pop') }));
    ok(!v.open && v.d.toLowerCase().includes(word.toLowerCase()), W + ': Enter picks the first match and fills the description', v);
    await human(p, p.locator('.modal .field:has(select[name=chargeItem]) .cs-btn')); await p.waitForTimeout(300);
    await human(p, '.cs-pop .cs-search-in'); await p.keyboard.type('zzzqqq'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !document.querySelector('.cs-pop .cs-none').hidden && !document.querySelector('.cs-pop .cs-opt:not([hidden])')), W + ': no matches shows a message');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(!(await p.locator('.cs-pop').count()), W + ': Escape closes the list');
    ok(await noHScroll(p), W + ': no sideways scroll');
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); }
  await b.close();
}
ok(!S.errs.length, 'no page or console errors', S.errs);
S.done();
