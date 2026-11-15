import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const SECS = ['overview', 'revenue', 'members', 'growth', 'golf', 'food', 'accounts'];
const b = await webkit.launch();
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  for (const s of SECS) {
    await p.evaluate(id => { const t = document.querySelector(`.rp-tabs .tab[data-rtab="${id}"]`); if (t) t.click(); }, s);
    await p.waitForTimeout(700);
    const info = await p.evaluate(id => {
      const sec = document.querySelector('#rp-sec-' + id); if (!sec) return { missing: true };
      const panels = [...sec.querySelectorAll('.rp-panel')].map(x => ({ id: x.dataset.panel, h: Math.round(x.getBoundingClientRect().height), w: Math.round(x.getBoundingClientRect().width), empty: !x.querySelector('.rp-pb').innerHTML.trim() }));
      return { kpis: sec.querySelectorAll('.rp-kpi').length, panels, hscroll: document.documentElement.scrollWidth - innerWidth, em: /—/.test(sec.innerText), txt: sec.innerText.slice(0, 0) };
    }, s);
    console.log(W, s, JSON.stringify(info));
    await p.screenshot({ path: `xrp2-${s}-${W}.png`, fullPage: true });
  }
  console.log(W, 'errors:', errs);
  await ctx.close();
}
await b.close();
