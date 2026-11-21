// Portal tee time booking spot check: node xperf-portaltee.mjs <base>
import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/'; const b = await webkit.launch(); let bad = 0;
for (const W of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); } catch (e) {} });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'member.html#/home', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
  let booked = false;
  for (let d = 2; d <= 6 && !booked; d++) {
    const date = await p.evaluate(n => Club.date.fromToday(n), d);
    await p.evaluate(dt => { location.hash = '#/tee-times/' + dt; }, date); await p.waitForTimeout(1200);
    const n0 = await p.evaluate(() => Club.store.all('teeTimes').filter(t => t.bookedBy === 'mem_1003' && t.source === 'portal').length);
    const chip = p.locator('.tt-slot.st-open:not([disabled]):not([aria-disabled=true])').first();
    if (!(await chip.count())) continue;
    await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(700);
    let clicked = false;
    for (let k = 0; k < 6 && !clicked; k++) {
      const conf = p.locator('[data-act=confirm]:visible').first();
      if (await conf.count()) { await conf.scrollIntoViewIfNeeded(); await conf.click(); clicked = true; break; }
      const next = p.locator('.btn-primary:visible', { hasText: /Continue|Next|Review/ }).first();
      if (!(await next.count())) break;
      await next.scrollIntoViewIfNeeded(); await next.click(); await p.waitForTimeout(700);
    }
    if (!clicked) { console.log(W, date, 'no confirm button'); continue; }
    await p.waitForTimeout(1200);
    const n1 = await p.evaluate(() => Club.store.all('teeTimes').filter(t => t.bookedBy === 'mem_1003' && t.source === 'portal').length);
    booked = n1 === n0 + 1; console.log(W, date, booked ? 'PASS portal tee time booked' : 'not booked (' + n0 + '->' + n1 + ')');
  }
  if (!booked || errs.length) { bad++; console.log('FAIL', W, errs.slice(0, 3)); }
  await c.close();
}
console.log(bad ? 'FAILED' : 'portal booking OK'); await b.close();
