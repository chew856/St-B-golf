import { webkit } from 'playwright';
const b = await webkit.launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
await p.goto('http://localhost:8001/site/index.html#/teesheet'); await p.waitForTimeout(1500);
const id = await p.evaluate(() => Club.store.all('teeTimes').find(t => t.date === Club.date.today() && t.status === 'booked' && document.querySelector('.ts-row[data-id="' + t.id + '"] [data-action=advance]')?.offsetParent).id);
await p.click('.ts-row[data-id="' + id + '"] [data-action=advance]'); await p.waitForTimeout(700);
await p.screenshot({ path: 'undo-toast.png', clip: { x: 900, y: 600, width: 540, height: 300 } });
await p.waitForTimeout(400); await p.click('.ts-row[data-id="' + id + '"] .ts-slot.filled'); await p.waitForTimeout(700);
await p.screenshot({ path: 'undo-modal.png' });
await b.close();
