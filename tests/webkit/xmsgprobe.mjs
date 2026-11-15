import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext(); const p = await c.newPage();
await p.goto('http://localhost:8001/site/member.html'); await p.evaluate(() => localStorage.setItem('stboniface.lang', 'fr')); await p.reload(); await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const s1 = 'Message from Charlotte: Charlotte a demandé à se joindre à votre départ de 15 h 39 le dim. 15 nov.. Options';
  const s2 = 'Message from Charlotte: Charlotte asked to join your tee time. Options';
  const d = document.createElement('div'); d.innerHTML = '<button aria-label="' + s1 + '">x</button><button aria-label="' + s2 + '">y</button>'; document.body.appendChild(d); Club.i18n.translate(d);
  return [Club.i18n.t(s1), Club.i18n.t(s2), [...d.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))];
});
console.log(JSON.stringify(r, null, 1)); await b.close();
