import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const S = Club.store; const first = c => S.all(c).map(x => x.date || x.submittedOn || String(x.createdAt||'').slice(0,10)).filter(Boolean).sort()[0];
  const out = {}; ['teeTimes','charges','payments','sales','diningReservations','diningOrders','receipts','renewals','applications','publicPlayers','teeWaitlist','weatherLog','lessons','events','programs','giftCards','promoCodes','products','statements','visitFeedback','cartOrders','takeoutOrders'].forEach(c => { try { out[c] = [S.all(c).length, first(c)]; } catch(e) { out[c] = 'err'; } });
  out.renewalsRecent = S.all('renewals').map(r => r.createdAt).sort().slice(-3);
  out.rates = Club.teeRules && Club.teeRules.RATES; out.tiers = S.all('membershipTiers').map(t => t.name + ':' + t.annualDues);
  out.lessonSample = S.all('lessons')[0]; out.programSample = S.all('programs')[0]; out.eventSample = (S.all('events')[0]||{}); out.product = S.all('products')[0];
  out.gift = (S.all('giftCards')||[])[0]; out.promo = (S.all('promoCodes')||[])[0];
  out.collections = Object.keys(localStorage).filter(k => k.startsWith('stboniface')).map(k => k + ':' + localStorage.getItem(k).length).slice(0,80);
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 9000));
await b.close();
