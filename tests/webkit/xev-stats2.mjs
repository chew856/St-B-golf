import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/events'); await p.waitForTimeout(1800);
console.log(await p.evaluate(() => {
  const s = document.querySelector('.stats');
  const out = { m1: s.matches('.stats:where(:has(> .stat:nth-child(4):last-child))'), m2: s.matches('.stats:has(> .stat:nth-child(4):last-child)'), html: s.outerHTML.slice(0, 200), rules: [] };
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { const walk = rr => { if (rr.cssRules && !rr.selectorText) { if (!rr.media || matchMedia(rr.media.mediaText).matches) [...rr.cssRules].forEach(walk); return; } if (rr.selectorText && rr.style.gridTemplateColumns && s.matches(rr.selectorText)) out.rules.push((sh.href || '').split('/').pop() + ' | ' + rr.selectorText + ' | ' + rr.style.gridTemplateColumns); }; walk(r); } } catch (e) {} }
  return out;
}));
await b.close();
