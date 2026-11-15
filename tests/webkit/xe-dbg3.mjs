import { webkit } from 'playwright';
import { B } from './xe-lib.mjs';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.goto(B + 'public.html#/'); await p.waitForTimeout(1000);
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'tcc'; d.style.cssText = 'position:fixed;top:100px;left:100px;width:700px;background:#fff;z-index:9999;padding:20px'; document.body.appendChild(d); Club.cards.mount(d, {}); });
await p.waitForTimeout(600);
await p.screenshot({ path: 'xe-shots/dbg-c.png', clip: { x: 100, y: 100, width: 720, height: 300 } });
await b.close();
