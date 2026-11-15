import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text(), JSON.stringify(m.location())); });
await p.goto('http://localhost:8001/site/index.html#/dashboard'); await p.waitForTimeout(2500);
console.log('--- functions'); await p.evaluate(() => location.hash = '#/functions'); await p.waitForTimeout(1500);
console.log('--- detail'); await p.evaluate(() => location.hash = '#/functions/fn_9'); await p.waitForTimeout(1500);
await b.close();
