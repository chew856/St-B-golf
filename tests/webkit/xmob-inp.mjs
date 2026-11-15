import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
for (const h of ['#/dashboard', '#/communications', '#/proshop', '#/members']) {
  await p.goto('http://localhost:8001/site/index.html' + h); await p.waitForTimeout(1500);
  console.log(h, await p.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')].filter(e => e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => (e.closest('[class]') ? e.closest('[class]').className.split(' ')[0] : '') + '>' + e.tagName + '.' + e.className + '[' + (e.placeholder || e.name) + '] ' + getComputedStyle(e).fontSize)));
}
await b.close();
