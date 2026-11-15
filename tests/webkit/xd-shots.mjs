import { webkit } from 'playwright';
const b = await webkit.launch();
for (const W of [1440, 390]) {
  const p = await (await b.newContext({ viewport: { width: W, height: 900 } })).newPage();
  await p.goto('http://localhost:8001/site/index.html#/members'); await p.waitForTimeout(1800);
  const id = await p.evaluate(() => { const m = Club.store.all('members').find(m => m.status === 'active'); Club.store.update('members', m.id, { status: 'suspended', statusHistory: [{ from: 'active', to: 'suspended', on: Club.date.today(), reason: '' }] });
    const a = Club.store.all('applications').find(a => a.stage === 'Received' && a.history.length === 1); Club.store.update('applications', a.id, { stage: 'Declined', decidedOn: Club.date.today(), history: a.history.concat([{ stage: 'Declined', on: Club.date.today() }]) });
    location.hash = '#/members/' + m.id; return m.id; });
  await p.waitForTimeout(1200); await p.screenshot({ path: 'xd-profile-' + W + '.png' });
  await p.evaluate(() => { location.hash = '#/members/applications'; }); await p.waitForTimeout(1200);
  await p.locator('.mem-col[data-stage="Decided"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.locator('.mem-col[data-stage="Decided"]').screenshot({ path: 'xd-apps-' + W + '.png' });
  await p.evaluate(() => Club.ui.toast('Jonathan Ashcroft moved back to received', '', { action: { label: 'Undo', onClick() {} } })); await p.waitForTimeout(500);
  await p.screenshot({ path: 'xd-toast-' + W + '.png' });
}
await b.close();
