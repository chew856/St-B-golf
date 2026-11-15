import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/dining'); await p.waitForTimeout(1500);
await p.click('.tab[data-tab=menu]'); await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(() => { const i = document.querySelector('[data-avail]'); const par = i && i.parentElement; return { n: document.querySelectorAll('[data-avail]').length, tag: par && par.tagName, cls: par && par.className, vis: par && !!par.offsetParent, rect: par && par.getBoundingClientRect().toJSON(), pane: document.querySelector('.tab.active') && document.querySelector('.tab.active').dataset.tab }; })));
await p.screenshot({ path: 'dbgmenu.png' });
await b.close();
