import { webkit } from 'playwright';
import fs from 'fs';
const B = process.env.BASE || 'http://localhost:8001/site/';
const site = process.argv[2];   // index | member | public
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [320, 360, 375, 390, 414, 430, 768];
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });
if (site === 'member') await ctx.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(B + site + '.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
let routes = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="#/"]')].map(a => a.getAttribute('href')).filter(h => !/signout|logout/.test(h)))]);
if (site === 'public') routes = [...new Set(['#/', ...routes, '#/signin', '#/signup'])];
routes = routes.slice(0, 40);
const out = { site, routes, pages: [] };
const probe = () => {
  const W = innerWidth, vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden],[aria-hidden="true"]'); };
  const clipped = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true; } return false; };
  const name = e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const over = [];
  document.querySelectorAll('body *').forEach(e => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.right > W + 1 && r.left < W && !clipped(e)) over.push(name(e) + ' r=' + Math.round(r.right)); });
  const leaf = over.filter((x, i) => i === over.length - 1 || true).slice(-6);
  const taps = { lt32: 0, lt44: 0, ex: {} };
  document.querySelectorAll('a[href], button, [role=button], input[type=checkbox], input[type=radio], summary, select, .segmented button').forEach(e => {
    if (!vis(e) || e.closest('.sr-only')) return; const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight * 3) return;
    const m = Math.min(r.width, r.height); if (m < 44) { m < 32 ? taps.lt32++ : taps.lt44++; const k = name(e); taps.ex[k] = Math.min(taps.ex[k] || 99, Math.round(m)); } });
  const inputs = []; document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea').forEach(e => { if (!vis(e)) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 16) inputs.push(name(e) + ' ' + fs + 'px'); });
  let small = 0; const smallEx = {}; document.querySelectorAll('body *').forEach(e => { if (!vis(e)) return; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) { small++; smallEx[name(e)] = fs; } });
  const imgs = [...document.querySelectorAll('img')].filter(i => !i.getAttribute('width') && !i.getAttribute('height') && getComputedStyle(i).aspectRatio === 'auto').length;
  return { sw: document.documentElement.scrollWidth, W, over: over.slice(0, 8), taps: { lt32: taps.lt32, lt44: taps.lt44, ex: Object.entries(taps.ex).sort((a, b) => a[1] - b[1]).slice(0, 8) }, inputs: [...new Set(inputs)].slice(0, 8), small, smallEx: Object.entries(smallEx).slice(0, 6), imgs };
};
for (const W of WIDTHS) {
  await p.setViewportSize({ width: W, height: W === 768 ? 1024 : 844 });
  await p.goto(B + site + '.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  for (const r of routes) {
    await p.evaluate(h => { location.hash = h; window.scrollTo(0, 0); }, r); await p.waitForTimeout(650);
    const res = await p.evaluate(probe).catch(e => ({ err: e.message }));
    const keep = { route: r, W, overflow: res.sw > res.W + 1 ? res.sw - res.W : 0, over: res.over };
    if (W === 390 || W === 320) Object.assign(keep, { taps: res.taps, inputs: res.inputs, small: res.small, smallEx: res.smallEx, imgs: res.imgs });
    out.pages.push(keep);
  }
  fs.writeFileSync('../mob-' + site + (process.env.TAG || '') + '.json', JSON.stringify(out, null, 1));
}
out.errs = errs;
fs.writeFileSync('../mob-' + site + (process.env.TAG || '') + '.json', JSON.stringify(out, null, 1));
console.log(site, 'routes', routes.length, 'errors', errs.length);
await b.close();
