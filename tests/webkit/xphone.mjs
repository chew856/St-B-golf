import { webkit } from 'playwright';
const res = []; let fails = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1470, height: 900 } }); const p = await c.newPage();
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503/.test(m.text())) errs.push(m.text()); });
// public: pick a time -> account form + countdown
await p.goto('http://localhost:8001/site/public.html#/book'); await p.waitForTimeout(1500);
const slot = p.locator('[data-time]:not([disabled])').first(); await slot.click(); await p.waitForTimeout(900);
const tel = p.locator('input[type=tel]').first(); await tel.waitFor({ timeout: 8000 });
ok(/^\(\d{3}\) \d{3}-\d{4}$/.test(await tel.getAttribute('placeholder')), 'placeholder shows (204) 555-0100 style', await tel.getAttribute('placeholder'));
await tel.click(); await p.keyboard.type('2049489393', { delay: 30 });
ok(await tel.inputValue() === '(204) 948-9393', 'typing digits formats as you type', await tel.inputValue());
await tel.fill(''); await p.keyboard.type('204', { delay: 30 }); ok(await tel.inputValue() === '(204', 'partial: (204', await tel.inputValue());
await p.keyboard.type('5', { delay: 30 }); ok(await tel.inputValue() === '(204) 5', 'partial: (204) 5', await tel.inputValue());
await tel.fill(''); await p.keyboard.type('1-204-555-0100', { delay: 20 }); ok(await tel.inputValue() === '(204) 555-0100', 'typed with dashes and a leading 1', await tel.inputValue());
// edit in the middle keeps caret sensible
await tel.fill('(204) 555-0100'); await tel.evaluate(el => el.setSelectionRange(4, 4)); await p.keyboard.press('Backspace'); await p.keyboard.type('9');
ok(await tel.inputValue() === '(209) 555-0100', 'editing a middle digit works', await tel.inputValue());
await tel.evaluate(el => el.setSelectionRange(el.value.length, el.value.length)); for (let i = 0; i < 14; i++) await p.keyboard.press('Backspace');
ok(await tel.inputValue() === '', 'can be cleared with backspace', await tel.inputValue());
// countdown (public redesign, Nov 22): one quiet line in the page under the booking steps, never a card over the form
const t = await p.evaluate(() => { const h = document.querySelector('.hold-timer'); if (!h) return null; const r = h.getBoundingClientRect();
  return { h: Math.round(r.height), inPage: !!h.closest('.pub-hold-host'), position: getComputedStyle(h).position, label: h.getAttribute('aria-label'), text: h.innerText.replace(/\s+/g, ' ').trim() }; });
ok(t && t.h <= 60 && /Time left/.test(t.label) && /\d\d\D{0,2}\d\d/.test(t.text), 'countdown is one quiet line (was a 232 x 230 card) and still announces the time left', t);
ok(t && t.inPage && t.position === 'static', 'countdown sits in the page, clear of the booking form', t);
await p.screenshot({ path: 'phone-hold-1470.png' });
// staff: stored phones formatted once; member form formats
const s = await c.newPage(); s.on('pageerror', e => errs.push(e.message));
await s.goto('http://localhost:8001/site/index.html#/members'); await s.waitForTimeout(2600);
const st = await s.evaluate(() => { const bad = []; ['members', 'publicPlayers', 'applications', 'staff'].forEach(k => Club.store.all(k).forEach(d => { if (d.phone && !/[a-z]/i.test(d.phone) && d.phone.replace(/\D/g, '').length === 10 && !/^\(\d{3}\) \d{3}-\d{4}$/.test(d.phone)) bad.push(k + ':' + d.phone); })); return { bad: bad.slice(0, 5), flag: Club.store.getObj('phoneFmt'), ext: Club.store.all('staff').filter(x => /x\d/.test(x.phone)).length, fn: Club.ui.phone('204.555.0100') }; });
ok(st.bad.length === 0 && st.ext > 0 && st.fn === '(204) 555-0100', 'numbers on file are in one format; extensions left alone', st);
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
