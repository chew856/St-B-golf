import { B, human, launch } from './xa-lib.mjs';
const { b, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/dining'); await p.waitForTimeout(1800);
await human(p, '.tab[data-tab=orders]'); await p.waitForTimeout(600);
console.log(await p.evaluate(() => [...document.querySelectorAll('.dn-ticket')].map(x => x.dataset.order + ' ' + x.className + ' ' + x.querySelector('.dn-ticket-foot').textContent)));
console.log(errs); await p.screenshot({ path: 'xa-dbg2.png' }); await b.close();
