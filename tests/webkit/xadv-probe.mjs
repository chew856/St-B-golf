import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const kind = process.argv[2] || 'm12', only = process.argv[3];
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
await p.addInitScript(k => { try { localStorage.setItem('stboniface.reports.period', JSON.stringify({ kind: k })); } catch (e) {} }, kind);
await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
const r = await p.evaluate(only => [...document.querySelectorAll('.rp-sec')].filter(s => !only || s.dataset.sec === only).map(s => ({
  sec: s.dataset.sec,
  kpis: [...s.querySelectorAll('.rp-kpi')].map(k => k.querySelector('.l').textContent + ' = ' + k.querySelector('.v').textContent + (k.querySelector('.rp-chg') ? '  [' + k.querySelector('.rp-chg').textContent + ' | ' + k.querySelector('.rp-chg').getAttribute('aria-label') + ' | ' + k.querySelector('.rp-chg').className + ']' : '')),
  panels: [...s.querySelectorAll('.rp-panel:not(.rp-ideas)')].map(pn => pn.querySelector('h2').textContent + ' :: ' + (pn.querySelector('.rp-desc') ? pn.querySelector('.rp-desc').textContent : 'NO DESC')),
  ideas: [...s.querySelectorAll('.rp-ideas .ideas > li')].map(li => li.querySelector('h3').textContent + ' || ' + li.querySelector('.idea-main p').textContent + ' || ' + (li.querySelector('.idea-why') || {}).textContent + ' || ' + li.querySelector('.idea-est').textContent),
  ideasEmpty: (s.querySelector('.rp-ideas .rp-empty') || {}).textContent
})), only);
console.log(JSON.stringify(r, null, 1)); console.log('ERRORS', errs);
await b.close();
