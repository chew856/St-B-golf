import { webkit } from 'playwright';
import fs from 'fs';
const B = 'http://localhost:8001/site/';
const SECS = ['overview', 'revenue', 'members', 'growth', 'golf', 'food', 'accounts'];
let pass = 0, fail = 0; const out = [];
const ok = (c, m, x) => { if (c) pass++; else { fail++; out.push('FAIL ' + m + (x === undefined ? '' : '  got: ' + JSON.stringify(x).slice(0, 300))); } };
async function human(p, loc) { if (typeof loc === 'string') loc = p.locator(loc).first(); await loc.waitFor({ timeout: 8000 }); await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(80); const bb = await loc.boundingBox(); const x = bb.x + Math.min(bb.width / 2, 60), y = bb.y + bb.height / 2; await p.mouse.move(x - 8, y - 4); await p.mouse.move(x, y, { steps: 4 }); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(450); }
const drawer = p => p.evaluate(() => { const d = document.querySelector('aside.drawer'); if (!d) return null; const r = d.getBoundingClientRect(), b = d.querySelector('.modal-body'); return { title: d.querySelector('h3').textContent, right: Math.round(r.right), over: b.scrollWidth - b.clientWidth, text: b.innerText.length, em: /—/.test(d.innerText) }; });
async function closeDrawer(p, how) { if (how === 'esc') await p.keyboard.press('Escape'); else await human(p, 'aside.drawer [data-action=close]'); await p.waitForTimeout(500); return !(await p.evaluate(() => !!document.querySelector('aside.drawer'))); }
const hs = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const show = (p, id) => p.evaluate(id => document.querySelector(`.rp-tabs .tab[data-rtab="${id}"]`).click(), id).then(() => p.waitForTimeout(500));

const b = await webkit.launch();
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  try {
  ok(await p.evaluate(() => document.querySelector('.rp-tabs').getAttribute('role') === 'tablist' && document.querySelectorAll('.rp-tabs [role=tab]').length === 7), W + ' tablist with 7 tabs');

  for (const s of SECS) {
    await show(p, s);
    const info = await p.evaluate(id => {
      const sec = document.querySelector('#rp-sec-' + id);
      const panels = [...sec.querySelectorAll('.rp-panel:not(.wide)')].map(x => ({ top: Math.round(x.getBoundingClientRect().top), h: Math.round(x.getBoundingClientRect().height) }));
      const rows = {}; panels.forEach(x => (rows[x.top] = rows[x.top] || []).push(x.h));
      const unequal = Object.values(rows).filter(hs => Math.max(...hs) - Math.min(...hs) > 1).length;
      const nested = sec.querySelectorAll('.rp-panel .rp-panel, .rp-panel .panel, .rp-panel .stats, .rp-panel .rp-kpis').length;
      const eyebrows = [...sec.querySelectorAll('.rp-panel *')].filter(e => { const cs = getComputedStyle(e); return cs.textTransform === 'uppercase' && e.textContent.trim(); }).length;
      const shadows = [...sec.querySelectorAll('.rp-panel')].filter(e => getComputedStyle(e).boxShadow !== 'none').length;
      const sizes = [...sec.querySelectorAll('.rp-panel')].map(pn => { const set = new Set(); pn.querySelectorAll('*').forEach(e => { if (e.closest('svg') || e.closest('.rp-menu')) return; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { set.add(getComputedStyle(e).fontSize); break; } }); return set.size; });
      const empties = [...sec.querySelectorAll('.rp-panel')].filter(x => !x.querySelector('.rp-pb').innerHTML.trim()).length;
      return { hs: document.documentElement.scrollWidth - innerWidth, unequal, nested, eyebrows, shadows, sizes, empties, em: /—/.test(sec.innerText), kpis: sec.querySelectorAll('.rp-kpi').length, about: !!sec.querySelector('.rp-about') };
    }, s);
    ok(info.hs <= 0, `${W} ${s}: no horizontal scroll`, info.hs);
    ok(info.unequal === 0, `${W} ${s}: equal panel heights per row`, info);
    ok(info.nested === 0 && info.eyebrows === 0 && info.shadows === 0, `${W} ${s}: no boxes in boxes, uppercase eyebrows or shadows`, info);
    ok(info.sizes.every(n => n <= 3), `${W} ${s}: at most three text sizes per panel`, info.sizes);
    ok(info.empties === 0 && !info.em && info.kpis >= 3 && info.about, `${W} ${s}: panels filled, KPIs, about, no em dashes`, info);
    await p.screenshot({ path: `xrp2-${s}-${W}.png`, fullPage: true });

    // every drill in the section (footer links, KPI buttons, menu items) opens a drawer
    const drills = await p.evaluate(id => [...new Set([...document.querySelectorAll(`#rp-sec-${id} [data-drill]`)].map(e => e.dataset.drill + '\u0001' + (e.dataset.arg || '')))], s);
    for (const d of drills.slice(0, 12)) {
      const [key, arg] = d.split('\u0001');
      const sel = `#rp-sec-${s} [data-drill="${key}"]` + (arg ? `[data-arg="${arg}"]` : ':not([data-arg])');
      const loc = p.locator(sel).first();
      if (!(await loc.count())) { ok(false, `${W} ${s}: drill ${d} element`); continue; }
      await human(p, loc);
      const dr = await drawer(p);
      ok(dr && dr.text > 80 && dr.right <= W + 1 && dr.over <= 2 && !dr.em, `${W} ${s}: drill "${d}" opens a drawer (${dr && dr.title})`, dr);
      ok(await closeDrawer(p, 'esc'), `${W} ${s}: Escape closes "${d}"`);
    }
    // the header Export downloads the section's CSV
    await p.evaluate(() => scrollTo(0, 0));
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), human(p, '[data-action=export]')]);
    let lines = 0; if (dl) { const t = fs.readFileSync(await dl.path(), 'utf8'); lines = t.split('\r\n').length; if (W === 1440) fs.writeFileSync(`xrp2-${s}.csv`, t); }
    ok(dl && lines > 3 && new RegExp('stboniface-' + s).test(dl.suggestedFilename()), `${W} ${s}: header Export downloads (${lines} lines)`, dl && dl.suggestedFilename());
    await p.waitForTimeout(200);
    // every "..." menu: opens, has Export CSV, exports, Escape closes and returns focus
    const menus = await p.locator(`#rp-sec-${s} .rp-more`).count();
    for (let i = 0; i < menus; i++) {
      const btn = p.locator(`#rp-sec-${s} .rp-more`).nth(i);
      await human(p, btn);
      const open = await p.evaluate(() => { const m = document.querySelector('.rp-menu:not([hidden])'); return m ? { items: [...m.querySelectorAll('.rp-mi')].map(x => x.textContent), focused: document.activeElement.classList.contains('rp-mi') } : null; });
      ok(open && open.items.includes('Export CSV') && open.focused, `${W} ${s}: menu ${i} opens with Export CSV and focus inside`, open);
      const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), human(p, p.locator('.rp-menu:not([hidden]) [data-mi-csv]').first())]);
      ok(!!dl2, `${W} ${s}: menu ${i} Export CSV downloads`, dl2 && dl2.suggestedFilename());
      ok(await p.evaluate(() => !document.querySelector('.rp-menu:not([hidden])')), `${W} ${s}: menu ${i} closed after export`);
      await p.waitForTimeout(150);
    }
  }
  // Chips filter the main chart
  await show(p, 'revenue');
  const before = await p.evaluate(() => ({ take: document.querySelector('#rp-sec-revenue .wide .rp-take').textContent, bars: [...document.querySelectorAll('#rp-sec-revenue .wide .cbar path')].map(x => x.getAttribute('d')).join('|') }));
  await human(p, '#rp-sec-revenue .rp-chip[data-chip="golf"]');
  const after = await p.evaluate(() => ({ take: document.querySelector('#rp-sec-revenue .wide .rp-take').textContent, bars: [...document.querySelectorAll('#rp-sec-revenue .wide .cbar path')].map(x => x.getAttribute('d')).join('|'), pressed: document.querySelector('#rp-sec-revenue .rp-chip[aria-pressed=true]').dataset.chip, w: document.querySelector('#rp-sec-revenue .wide svg').getBoundingClientRect().width }));
  ok(before.take !== after.take && before.bars !== after.bars && after.pressed === 'golf' && /Golf brought in/.test(after.take), W + ' revenue chips filter the chart and takeaway', after.take);
  // Tooltip on hover
  const hit = p.locator('#rp-sec-revenue .wide .chit').nth(7);
  const bb = await hit.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(250);
  const tip = await p.evaluate(() => { const t = document.querySelector('.chart-tip.show'); return t ? t.innerText : null; });
  ok(tip && /Golf/.test(tip) && /\$/.test(tip), W + ' hover tooltip shows the month and value', tip);
  await p.mouse.move(5, 5);
  // Period change redraws
  const line0 = await p.textContent('.rp-range');
  await p.evaluate(() => scrollTo(0, 0));
  await human(p, '#rpPeriodBtn'); await human(p, '.rp-opt[data-value="this"]'); await p.waitForTimeout(1200);
  const line1 = await p.textContent('.rp-range'); const kpi = await p.textContent('#rp-sec-revenue .rp-kpi .v');
  ok(line0 !== line1 && /November 2026/.test(line1) && kpi, W + ' period change redraws (' + line1 + ', revenue ' + kpi + ')');
  ok(await p.evaluate(() => !!document.querySelector('.rp-sec:not([hidden]) .chart-cols')), W + ' charts redrawn after period change');
  await p.evaluate(() => scrollTo(0, 0)); await human(p, '#rpPeriodBtn'); await human(p, '.rp-opt[data-value="m12"]'); await p.waitForTimeout(1200);
  // Keyboard: tabs arrow keys, KPI button Enter, drawer Escape, menu arrows
  await p.focus('.rp-tabs .tab[aria-selected=true]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  const tabNow = await p.evaluate(() => ({ sel: document.querySelector('.rp-tabs .tab[aria-selected=true]').dataset.rtab, focus: document.activeElement.dataset.rtab, shown: [...document.querySelectorAll('.rp-sec:not([hidden])')].map(s => s.dataset.sec) }));
  ok(tabNow.sel === 'members' && tabNow.focus === 'members' && tabNow.shown.join() === 'members', W + ' ArrowRight moves the tab and panel', tabNow);
  await p.focus('#rp-sec-members .rp-kpi button.v'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  ok(!!(await drawer(p)), W + ' Enter on a KPI figure opens its drawer'); ok(await closeDrawer(p, 'esc'), W + ' Escape closes it');
  await p.focus('#rp-sec-members .rp-more'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  const kd = await drawer(p); ok(!!kd, W + ' keyboard: menu ArrowDown, Enter opens the drill', kd && kd.title); await closeDrawer(p, 'esc');
  // Overview: KPI figure jumps to its section; attention link opens a drawer in another section
  await show(p, 'overview');
  await human(p, '#rp-sec-overview .rp-kpi button[data-go="golf"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelector('.rp-tabs .tab[aria-selected=true]').dataset.rtab === 'golf'), W + ' overview figure jumps to Golf');
  await show(p, 'overview');
  await human(p, '#rp-sec-overview .notes.att [data-drill]');
  const od = await drawer(p); ok(od && /renew/i.test(od.title), W + ' attention link opens the renewals drawer', od && od.title); await closeDrawer(p, 'btn');
  // Print: all sections shown, charts fit
  await p.emulateMedia({ media: 'print' }); await p.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await p.waitForTimeout(400);
  const pr = await p.evaluate(() => ({ visible: [...document.querySelectorAll('.rp-sec')].filter(s => getComputedStyle(s).display !== 'none').length, tabs: getComputedStyle(document.querySelector('.rp-tabs')).display, more: getComputedStyle(document.querySelector('.rp-more-wrap')).display, titles: [...document.querySelectorAll('.rp-print-title')].filter(t => getComputedStyle(t).display !== 'none').length, about: [...document.querySelectorAll('.rp-about')].every(d => d.open) }));
  ok(pr.visible === 7 && pr.tabs === 'none' && pr.more === 'none' && pr.titles === 7 && pr.about, W + ' print shows all 7 sections with titles, no tabs or menus', pr);
  if (W === 1440) await p.screenshot({ path: 'xrp2-print-1440.png', fullPage: true });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await p.emulateMedia({ media: 'screen' }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.querySelectorAll('.rp-sec:not([hidden])').length === 1), W + ' after print one section again');
  ok(await hs(p) <= 0, W + ' still no horizontal scroll');
  } catch (e) { ok(false, W + ' test crashed: ' + e.message.split('\n')[0]); }
  ok(errs.length === 0, W + ' no console errors', errs);
  await ctx.close();
}
await b.close();
console.log(out.join('\n')); console.log(`PASS ${pass} FAIL ${fail}`);
