import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1900, height: 1000 } })).newPage();
await p.goto('http://localhost:8001/site/index.html#/' + (process.argv[2] || 'events')); await p.waitForTimeout(1800);
console.log(await p.evaluate(() => { const s = document.querySelector('.stats'); return { gtc: getComputedStyle(s).gridTemplateColumns, kids: [...s.children].map(c => c.className + ' ' + Math.round(c.getBoundingClientRect().width)) }; }));
await b.close();
