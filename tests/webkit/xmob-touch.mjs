import { webkit } from 'playwright';
const B = process.env.BASE || 'http://localhost:8001/site/'; const res = [];
const ok = (c, m, x) => res.push((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(x)));
const b = await webkit.launch();
/* desktop: hover still styles buttons; dialogs focus their first field */
{ const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(B + 'index.html#/teesheet'); await p.waitForTimeout(1800);
  const btn = p.locator('.page-head [data-action=block]'); const bg0 = await btn.evaluate(e => getComputedStyle(e).backgroundColor);
  const bx = await btn.boundingBox(); await p.mouse.move(bx.x + 10, bx.y + 10); await p.waitForTimeout(300);
  const bg1 = await btn.evaluate(e => getComputedStyle(e).backgroundColor);
  ok(bg0 !== bg1, 'desktop: hovering a button still changes its background', { bg0, bg1 });
  await p.goto(B + 'index.html#/lessons'); await p.waitForTimeout(1500);
  await p.locator('.page-head [data-action=book]').click(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && !!document.activeElement.closest('.modal')), 'desktop: dialog focuses its first control', await p.evaluate(() => document.activeElement.tagName));
  ok(await p.evaluate(() => document.documentElement.style.overflow === 'hidden'), 'desktop: page behind the dialog is locked');
}
/* phone: emulate a touch screen (hover: none, pointer: coarse) */
{ const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await c.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /hover: none|pointer: coarse/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); });
  const p = await c.newPage(); await p.goto(B + 'index.html#/lessons'); await p.waitForTimeout(1800);
  await p.locator('.page-head [data-action=book]').tap(); await p.waitForTimeout(500);
  const f = await p.evaluate(() => ({ tag: document.activeElement.tagName, cls: document.activeElement.className }));
  ok(!/INPUT|TEXTAREA|SELECT/.test(f.tag), 'phone: opening a dialog does not pop the keyboard', f);
  const fs = await p.evaluate(() => [...document.querySelectorAll('.modal input.input, .modal textarea, .topbar .search input')].filter(e => e.getBoundingClientRect().width).map(e => parseFloat(getComputedStyle(e).fontSize)));
  ok(fs.length && fs.every(v => v >= 16), 'phone: every visible field is 16px or more', fs);
  await p.evaluate(() => { document.documentElement.style.setProperty('--kb', '300px'); }); await p.waitForTimeout(400);
  const mb = await p.evaluate(() => getComputedStyle(document.querySelector('.overlay .modal')).marginBottom);
  ok(mb === '300px', 'phone: an open sheet lifts above the keyboard height', mb);
  const btns = await p.evaluate(() => [...document.querySelectorAll('.modal .modal-foot .btn')].map(e => Math.round(e.getBoundingClientRect().height)));
  ok(btns.every(h => h >= 44), 'phone: dialog buttons are 44px tall', btns);
}
await b.close(); console.log(res.join('\n'));
