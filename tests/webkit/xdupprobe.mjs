import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:8001/site/index.html#/dashboard'); await p.waitForTimeout(2500);
const r = await p.evaluate(() => Club.store.all('receipts').filter(r => (r.source === 'functions' && r.refId === 'fn_1') || (r.source === 'outings' && r.refId === 'out_1')).map(r => ({ no: r.no, title: r.title, total: r.total, at: r.at, date: r.date, chargeId: r.chargeId, paymentId: r.paymentId, method: r.method })));
console.log(JSON.stringify(r, null, 1)); await b.close();
