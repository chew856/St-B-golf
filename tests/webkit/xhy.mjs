import { webkit } from 'playwright';
const b = await webkit.launch(); const p = await b.newPage();
await p.setContent('<html lang="en"><body>' + ['Winslow','Langley','Pemberton','Merriweather','Carrington','Ashford','Montgomery','Lockhart','Radcliffe'].map(n => '<div style="width:52px;font:600 13.5px sans-serif;word-break:break-all;text-wrap:balance;margin:4px;background:#ddd"><span class="t">' + n + '</span></div>').join('') + '</body></html>');
console.log(await p.evaluate(() => [...document.querySelectorAll('.t')].map(s => { const r = document.createRange(); const t = s.firstChild; let lines = [], cur = '', top = null; for (let i = 0; i < t.length; i++) { r.setStart(t, i); r.setEnd(t, i + 1); const y = Math.round(r.getBoundingClientRect().top); if (top !== null && y !== top) { lines.push(cur); cur = ''; } top = y; cur += t.data[i]; } lines.push(cur); return lines.join('/'); })));
console.log(await b.version());
await b.close();
