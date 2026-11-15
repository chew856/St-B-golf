import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/';
let pass = 0, fail = 0; const out = [];
function ok(c, msg) { if (c) pass++; else { fail++; out.push('FAIL ' + msg); } }
async function click(p, loc) {
  await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(60); const bb = await loc.boundingBox();
  const x = bb.x + Math.min(bb.width / 2, 60), y = bb.y + bb.height / 2;
  await p.mouse.move(x - 30, y - 10); await p.mouse.move(x, y, { steps: 6 }); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up();
}
const tab = (p, id) => p.evaluate(id => document.querySelector(`.rp-tabs .tab[data-rtab="${id}"]`).click(), id).then(() => p.waitForTimeout(500));
/* Growth and Members panels moved: age mix, quiet members and renewals now live in Members. */
const PANELS = { growth: ['growth-public', 'growth-guests', 'growth-heard'], members: ['members-age', 'members-quiet', 'members-renewal'] };
const DRAWERS = [['members', 'age'], ['members', 'quiet'], ['members', 'renewal'], ['growth', 'golfers'], ['growth', 'guests'], ['growth', 'heard']];
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: W, height: W > 500 ? 900 : 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports/growth', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  const hs = async () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(await hs() <= 0, W + ' no horizontal scroll on Growth');
  ok(await p.locator('#rp-sec-growth .rp-panel:not(.rp-ideas)').count() === 5, W + ' growth: pipeline plus four panels');
  ok(await p.locator('#rp-sec-members .rp-panel:not(.rp-ideas)').count() === 5, W + ' members: roll plus four panels');
  await p.screenshot({ path: `xrg-staff-${W}.png`, fullPage: true });
  // Panel CSVs from the "..." menus
  for (const sec of ['growth', 'members']) {
    await tab(p, sec);
    for (const id of PANELS[sec]) {
      await click(p, p.locator(`[data-panel="${id}"] .rp-more`)); await p.waitForTimeout(200);
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), click(p, p.locator('.rp-menu:not([hidden]) [data-mi-csv]').first())]);
      let lines = 0; if (dl) { const f = await dl.path(); lines = fs.readFileSync(f, 'utf8').split('\r\n').length; }
      ok(dl && lines > 2, `${W} panel CSV ${id} (${lines} lines, ${dl && dl.suggestedFilename()})`);
      await p.waitForTimeout(150);
    }
  }
  // Drawers from each panel's footer link
  for (const [sec, k] of DRAWERS) {
    await tab(p, sec);
    const btn = p.locator(`#rp-sec-${sec} .rp-pf [data-drill="${k}"]`).first();
    if (!(await btn.count())) { ok(false, W + ' see-all link ' + k); continue; }
    await click(p, btn); await p.waitForTimeout(500);
    const dr = p.locator('.drawer.rp-drawer').last();
    ok(await dr.isVisible(), `${W} drawer opens: ${k}`);
    const title = await dr.locator('h3').first().textContent();
    const rows = await dr.locator('table tbody tr').count();
    ok(rows > 0, `${W} drawer ${k} "${title}" has rows (${rows})`);
    const dw = await p.evaluate(() => { const d = [...document.querySelectorAll('.drawer')].pop(); const b = d.querySelector('.modal-body'); return b.scrollWidth - b.clientWidth; });
    ok(dw <= 2 || W === 390, `${W} drawer ${k} body no side scroll (${dw})`);
    const tw = await p.evaluate(() => [...[...document.querySelectorAll('.drawer')].pop().querySelectorAll('.table-wrap')].map(w => w.scrollWidth - w.clientWidth).filter(x => x > 2));
    if (tw.length) out.push(`info ${W} drawer ${k} table inner overflow ${tw.join(',')}`);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), click(p, dr.locator('.modal-foot .btn', { hasText: 'Export CSV' }))]);
    ok(!!dl, `${W} drawer CSV ${k} ${dl && dl.suggestedFilename()}`);
    await p.screenshot({ path: `xrg-drawer-${k}-${W}.png` });
    await click(p, dr.locator('[data-action=close]')); await p.waitForTimeout(400);
    ok(await p.locator('.drawer').count() === 0, `${W} drawer ${k} closes`);
  }
  // Keyboard: focus the quiet link and press Enter, then Escape
  await tab(p, 'members');
  await p.locator('#rp-sec-members .rp-pf [data-drill="quiet"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(450);
  ok(await p.locator('.drawer.rp-drawer').count() === 1, W + ' Enter opens drawer');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  ok(await p.locator('.drawer').count() === 0, W + ' Escape closes drawer');
  // Golfer details from the panel
  await tab(p, 'growth');
  await click(p, p.locator('[data-panel="growth-public"] [data-drill="golfer"]').first()); await p.waitForTimeout(500);
  const gtxt = await p.locator('.drawer.rp-drawer').last().innerText();
  ok(/Marketing email/.test(gtxt) && /Heard about us/.test(gtxt), W + ' golfer drawer shows opt-in and heard-from');
  await p.screenshot({ path: `xrg-drawer-golfer-${W}.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // From the golfers list drawer, open a golfer (closes list, opens detail)
  await click(p, p.locator('#rp-sec-growth .rp-pf [data-drill="golfers"]')); await p.waitForTimeout(450);
  await click(p, p.locator('.drawer.rp-drawer [data-rg-golfer]').first()); await p.waitForTimeout(700);
  ok(await p.locator('.drawer.rp-drawer').count() === 1 && /Marketing email/.test(await p.locator('.drawer.rp-drawer').innerText()), W + ' list drawer to golfer drawer');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // Heard row opens filtered drawer
  if (await p.locator('[data-panel="growth-heard"] .rowbtn').count()) {
    await click(p, p.locator('[data-panel="growth-heard"] .rowbtn').first()); await p.waitForTimeout(450);
    ok(await p.locator('.drawer.rp-drawer table tbody tr').count() > 0, W + ' heard row drawer lists people');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  } else ok(false, W + ' heard rows present');
  await p.waitForTimeout(3800);   // let toasts clear
  // Member link from the age drawer navigates and closes the drawer
  await tab(p, 'members');
  await click(p, p.locator('#rp-sec-members .rp-pf [data-drill="age"]')); await p.waitForTimeout(450);
  await click(p, p.locator('.drawer.rp-drawer a[href^="#/members/mem_"]').first()); await p.waitForTimeout(900);
  ok(/#\/members\/mem_/.test(p.url()) && await p.locator('.drawer').count() === 0, W + ' member link opens profile ' + p.url().split('#')[1]);
  // Application deep link
  await p.goto(B + 'index.html#/members/applications/app_101'); await p.waitForTimeout(1200);
  const atxt = await p.locator('.drawer').last().innerText().catch(() => '');
  ok(/Heard about us\s*Played here as a guest/.test(atxt), W + ' application deep link shows heard-from');
  ok(await hs() <= 0, W + ' applications page no horizontal scroll');
  await p.screenshot({ path: `xrg-app-${W}.png` });
  ok(errs.length === 0, W + ' no console errors: ' + errs.join(' | '));
  await ctx.close();
}
await b.close();
console.log(out.join('\n')); console.log(`PASS ${pass} FAIL ${fail}`);
