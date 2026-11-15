import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/'; const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
async function human(p, sel) { const loc = p.locator(sel).first(); await loc.waitFor({ timeout: 8000 }); const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 5, y - 3); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(450); }
const b = await webkit.launch();
const c = await b.newContext({ viewport: { width: 1470, height: 900 } }); const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html#/teesheet', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const sb = document.querySelector('.sidebar').getBoundingClientRect(), main = document.querySelector('#view').getBoundingClientRect(), t = document.querySelector('.sb-toggle');
  const act = document.querySelector('.nav-link.active'), ind = document.querySelector('.nav-indicator');
  return { sbW: Math.round(sb.width), mainL: Math.round(main.left), collapsed: document.documentElement.classList.contains('sb-collapsed'), label: t.getAttribute('aria-label'), expanded: t.getAttribute('aria-expanded'),
    labelsShown: [...document.querySelectorAll('.nav-label')].some(l => l.getBoundingClientRect().width > 2), titles: document.querySelectorAll('.nav-link[title]').length, dots: [...document.querySelectorAll('.nav-count')].map(d => Math.round(d.getBoundingClientRect().width)),
    indOk: !act || Math.abs(ind.getBoundingClientRect().top - act.getBoundingClientRect().top) < 2, page: document.documentElement.scrollWidth <= innerWidth + 1 }; });
let s = await st();
ok(!s.collapsed && s.sbW > 200 && s.label === 'Collapse sidebar' && s.expanded === 'true' && s.labelsShown, 'starts open with a "Collapse sidebar" button', s);
await human(p, '.sb-toggle'); await p.waitForTimeout(400);
s = await st();
ok(s.collapsed && s.sbW === 72 && s.mainL <= 80 && !s.labelsShown && s.titles > 10 && s.dots.every(w => w === 8) && s.indOk && s.page && s.label === 'Expand sidebar' && s.expanded === 'false', 'collapses to a 72px icon rail: labels hidden (names on hover), counts as dots, indicator on the active page, content widens', s);
await p.screenshot({ path: 'sidebar-collapsed.png', clip: { x: 0, y: 0, width: 760, height: 900 } });
await human(p, '.nav-link[data-mod="members"]'); await p.waitForTimeout(800);
s = await st(); ok(s.collapsed && /members/.test(await p.evaluate(() => location.hash)) && s.indOk, 'navigating from the rail works and it stays collapsed', s);
await p.reload(); await p.waitForTimeout(1500);
s = await st(); ok(s.collapsed && s.sbW === 72, 'stays collapsed after a reload', s);
await human(p, '.sb-toggle'); await p.waitForTimeout(400);
s = await st(); ok(!s.collapsed && s.sbW > 200 && s.labelsShown && s.indOk, 'expands back', s);
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
ok(await p.evaluate(() => getComputedStyle(document.querySelector('.sb-toggle')).display === 'none' && getComputedStyle(document.querySelector('.menu-toggle')).display !== 'none'), 'phones: no collapse button, the usual menu button');
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
