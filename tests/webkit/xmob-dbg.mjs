import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/lessons'); await p.waitForTimeout(1500);
await p.locator('.page-head [data-action=book]').click(); await p.waitForTimeout(500);
console.log(await p.evaluate(() => {
  document.documentElement.style.setProperty('--kb', '300px');
  const m = document.querySelector('.overlay .modal'); const cs = getComputedStyle(m);
  const sheet = [...document.styleSheets].find(s => /mobile\.css/.test(s.href || ''));
  let found = []; try { [...sheet.cssRules].forEach(r => { if (r.cssText.includes('--kb')) found.push(r.cssText.slice(0, 120)); }); } catch (e) { found = ['err ' + e.message]; }
  return { cls: m.className, mb: cs.marginBottom, kb: getComputedStyle(document.documentElement).getPropertyValue('--kb'), rules: sheet ? sheet.cssRules.length : 'no sheet', found };
}));
await b.close();
