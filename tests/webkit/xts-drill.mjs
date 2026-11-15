import { suite, open, human, noHScroll } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const SH = './shots/';
const keys = ['players', 'filled', 'guests', 'public', 'noshows', 'rounds'];
for (const W of [1440, 390]) {
  const { b, p } = await open(W, 'teesheet', T);
  try {
    for (const day of [0, -1]) {
      const D = await p.evaluate(n => Club.date.fromToday(n), day);
      await p.evaluate(h => { location.hash = '#/teesheet/' + h; }, D); await p.waitForTimeout(900);
      ok(await p.locator('.ts-stats .stat[data-drill]').count() === 6, W + ' day' + day + ': six clickable boxes');
      for (const k of keys) {
        await human(p, '.ts-stats .stat[data-drill="' + k + '"]'); await p.waitForTimeout(500);
        const info = await p.evaluate(() => { const d = document.querySelector('.drawer.dash-drawer'); if (!d) return null; const r = d.getBoundingClientRect();
          return { title: d.querySelector('h3').textContent, secs: d.querySelectorAll('.dd-sec').length, charts: d.querySelectorAll('svg.chart').length, err: !!d.querySelector('.empty h4') && /could not load/.test(d.textContent), w: Math.round(r.width), sw: d.querySelector('.modal-body').scrollWidth, cw: d.querySelector('.modal-body').clientWidth, rows: d.querySelectorAll('tr[data-tt]').length }; });
        ok(info && !info.err && info.secs >= 2 && info.sw <= info.cw + 1, W + ' day' + day + ' ' + k + ': drawer "' + (info && info.title) + '" ' + (info && info.secs) + ' sections ' + (info && info.charts) + ' charts ' + (info && info.rows) + ' rows', info);
        if (day === -1 || k === 'players' || k === 'public') await p.screenshot({ path: SH + 'tsdd-' + W + '-' + k + (day ? '-y' : '') + '.png', fullPage: false });
        if (info && info.rows && k === 'rounds') {
          await human(p, '.drawer tr[data-tt]'); await p.waitForTimeout(600);
          ok(await p.locator('.modal .ts-form, .modal').count() > 0 && await p.locator('.drawer.dash-drawer').count() === 0, W + ': a row opens the tee time');
          await p.keyboard.press('Escape'); await p.waitForTimeout(400);
        } else { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
        if (await p.locator('.drawer').count()) { await human(p, '.drawer [data-action=close]'); await p.waitForTimeout(400); }
      }
    }
    ok(await noHScroll(p), W + ': no sideways scroll');
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); }
  await b.close();
}
ok(!T.errs.length, 'no page or console errors', T.errs);
T.done();
