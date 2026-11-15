import { B, launch } from './xa-lib.mjs';
const { b, p, errs } = await launch(1440);
await p.goto(B + 'index.html#/proshop/online'); await p.waitForTimeout(1200);
await p.evaluate(() => localStorage.setItem('stboniface.portal.session', 'mem_1003'));
for (const u of ['member.html#/shop', 'member.html#/takeout', 'member.html#/account/receipts', 'public.html#/shop', 'public.html#/takeout']) { await p.goto(B + u); await p.waitForTimeout(1500); console.log(u, errs.length); }
console.log(errs); await b.close();
