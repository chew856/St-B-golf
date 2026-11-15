import { webkit } from 'playwright';
const B = process.argv[2] || 'http://localhost:8001/site/'; const res = []; let fails = 0;
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
const b = await webkit.launch();
for (const lang of ['en', 'fr']) for (const w of [1920, 1470, 1280, 1100, 1024, 990]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await c.newPage();
  await p.goto(B + 'member.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
  await p.evaluate(l => { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', l); }, lang);
  await p.goto(B + 'member.html#/home'); await p.reload(); await p.waitForTimeout(2200);
  const s = await p.evaluate(() => { const name = document.querySelector('.p-brand-name'), inner = document.querySelector('.p-header-inner');
    return { nameLines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)), fits: inner.scrollWidth <= inner.clientWidth + 1, page: document.documentElement.scrollWidth <= innerWidth + 1,
      bar: [...document.querySelectorAll('.p-nav > a')].map(a => a.textContent.replace(/\d+$/, '')), more: [...document.querySelectorAll('.p-navmore-pop a')].map(a => a.textContent) }; });
  ok(s.nameLines === 1 && s.fits && s.page, lang + ' ' + w + ': brand on one line, fits; bar [' + s.bar.join(', ') + ']' + (s.more.length ? ' · More [' + s.more.join(', ') + ']' : ''), s);
  if (w === 1470) await p.screenshot({ path: 'hdr-' + lang + '-1470.png', clip: { x: 0, y: 0, width: 1470, height: 120 } });
  await c.close();
}
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED ' + res.length); await b.close();
