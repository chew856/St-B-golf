import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => console.log('PAGE', e.message));
await p.goto('http://localhost:8001/site/index.html#/reports/golf', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
console.log(await p.evaluate(() => [...document.querySelectorAll('[data-panel="golf-pace"] .rgo-pace-row')].map(r => r.tagName + ' ' + r.dataset.arg + ' ' + r.getBoundingClientRect().height)));
await p.evaluate(() => { const btn = document.createElement('button'); btn.dataset.drill = 'pace'; btn.dataset.arg = 'wd:5'; document.querySelector('#rp-sec-golf').appendChild(btn); btn.click(); });
await p.waitForTimeout(600); await p.keyboard.press('Escape'); await p.waitForTimeout(600);
console.log(await p.evaluate(() => ({ hidden: document.querySelector('#rp-sec-golf').hidden, rows: document.querySelectorAll('[data-panel="golf-pace"] .rgo-pace-row').length, tab: location.hash })));
await b.close();
