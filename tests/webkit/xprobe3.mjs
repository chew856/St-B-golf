import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const S = Club.store; const o = {};
  const sample = (c, n) => { const a = S.all(c) || []; return { n: a.length, ex: a.slice(0, n || 1) }; };
  o.outings = S.all("outings").map(x => [x.organization, x.date, x.stage, x.players, x.quote && x.quote.subtotal, (x.history||[])[0] && x.history[0].at]);
  o.promo = S.all('promoCodes').map(p => ({ code: p.code, kind: p.kind, value: p.value, uses: (p.uses||[]).length, use0: (p.uses||[])[0], applies: p.appliesTo, active: p.active }));
  
  
  o.teeKeys = [...new Set(S.all('teeTimes').flatMap(t => Object.keys(t)))];
  o.playerKeys = [...new Set(S.all('teeTimes').flatMap(t => (t.players||[]).flatMap(p => Object.keys(p||{}))))];
  o.teeRules = Club.teeRules ? Object.keys(Club.teeRules) : null; o.twilight = Club.teeRules && (Club.teeRules.TWILIGHT || Club.teeRules.twilightFrom);
  o.teeSettings = S.getObj('teeSheetSettings', {});
  o.products = S.all('products').map(p => [p.name, p.category, p.price, p.cost, p.stock, p.reorderAt]).slice(0, 60);
  o.staff = S.all('staff').map(s => [s.id, s.role, s.name || s.firstName]);
  o.lessonKeys = [...new Set(S.all('lessons').map(l => l.status))]; o.lessonTypes = [...new Set(S.all('lessons').map(l => l.type + ':' + l.price))];
  o.lessonsRange = [S.all('lessons').map(l=>l.date).sort()[0], S.all('lessons').map(l=>l.date).sort().pop()];
  o.events = S.all('events').map(e => [e.title, e.date, e.status, e.capacity, e.price, (e.registrations||[]).length]);
  o.programs = S.all('programs').map(e => [e.name, e.startDate, e.capacity, e.price, (e.enrolled||[]).length, e.weeks]);
  o.giftKeys = Object.keys(Club).filter(k => /gift|promo|addon|outing|lesson|event|shop|teeRules|billing|dining/i.test(k));
  o.leagues = sample('leagues', 1);
  o.receiptSources = [...new Set(S.all('receipts').map(r => r.source))];
  o.salesSample = S.all('sales')[0];
  o.chargeCats = [...new Set(S.all('charges').map(c => c.category))];
  return o;
});
console.log(JSON.stringify(r, null, 1).slice(0, 14000));
await b.close();
