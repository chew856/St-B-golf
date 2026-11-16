import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/lessons'); await p.waitForTimeout(1500);
await p.locator('.ls-sched-head [data-action=book]').click(); await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  const m = document.querySelector('.overlay .modal'); const out = [];
  const walk = (rules, href) => [...rules].forEach(r => { if (r.cssRules && !r.selectorText) { if (!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules, href); return; } if (r.selectorText && m.matches(r.selectorText) && /margin|max-height/.test(r.style.cssText)) out.push(href.split('/').pop() + ' | ' + r.selectorText.slice(0, 60) + ' | ' + (r.style.marginBottom || r.style.margin || '') + ' | mh ' + r.style.maxHeight); });
  [...document.styleSheets].forEach(s => { try { walk(s.cssRules, s.href || 'inline'); } catch (e) {} });
  return out;
}));
await b.close();
