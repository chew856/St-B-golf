/* Tee sheet scroll box (Nov 12): the day scrolls inside its own box, the parts of the day jump inside it, the page stays short. */
import { suite, open, human, noHScroll } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
const SH = './shots/';
for (const W of [1440, 1900, 390]) {
  const { b, p } = await open(W, 'teesheet', T);
  try {
    const D = await p.evaluate(() => Club.date.fromToday(3));
    await p.evaluate(d => { location.hash = '#/teesheet/' + d; }, D); await p.waitForTimeout(1200);
    const info = await p.evaluate(() => {
      const box = document.querySelector('.ts-scroll');
      return { box: !!box, scrollable: box.scrollHeight > box.clientHeight + 50, boxH: box.clientHeight, pageH: document.documentElement.scrollHeight, vh: innerHeight,
        btns: [...document.querySelectorAll('.ts-periods button')].map(b => b.textContent.trim().split(/\s+/)[0]),
        hidden: document.querySelectorAll('.ts-row[hidden]').length, rows: document.querySelectorAll('.ts-row').length };
    });
    ok(info.box && info.scrollable && info.hidden === 0, W + ': the whole day is in one scroll box (' + info.rows + ' rows, none hidden)', info);
    ok(!info.btns.includes('All'), W + ': no All day button', info.btns);
    ok(info.pageH < info.vh * 2.2, W + ': the page stays short', info);
    for (const per of ['afternoon', 'evening', 'morning']) {
      await human(p, '.ts-periods button[data-value=' + per + ']'); await p.waitForTimeout(900);
      const r = await p.evaluate(per => {
        const box = document.querySelector('.ts-scroll'), head = document.querySelector('.ts-head');
        const edge = box.getBoundingClientRect().top + (head && head.offsetParent ? head.offsetHeight : 0) + 8;
        const first = [...document.querySelectorAll('.ts-row, .ts-band')].find(x => x.getBoundingClientRect().bottom > edge);
        const t = first && (first.dataset.time || '');
        const active = document.querySelector('.ts-periods button.active');
        return { t, from: { morning: 0, afternoon: 780, evening: 960 }[per], active: active && active.dataset.value, top: box.scrollTop };
      }, per);
      const m = r.t ? +r.t.split(':')[0] * 60 + +r.t.split(':')[1] : null;
      ok(r.active === per && (m == null || (per === 'morning' ? r.top < 5 : m >= r.from - 15)), W + ': ' + per + ' scrolls the box to ' + (r.t || 'its first band'), r);
    }
    /* scrolling by hand moves the highlight */
    await p.evaluate(() => { const box = document.querySelector('.ts-scroll'); box.scrollTop = box.scrollHeight; }); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.querySelector('.ts-periods button.active').dataset.value) === 'evening', W + ': scrolling to the end highlights Evening');
    if (W !== 390) await p.screenshot({ path: SH + 'ts-scroll-' + W + '.png' });
    /* search still filters */
    await p.fill('.ts-search input', 'zzzz-nobody'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.querySelectorAll('.ts-row:not([hidden])').length === 0 && !document.querySelector('.ts-filter-empty').hidden), W + ': search still filters the rows');
    await p.fill('.ts-search input', ''); await p.waitForTimeout(300);
    ok(await noHScroll(p), W + ': no sideways scroll');
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); }
  await b.close();
}
ok(!T.errs.length, 'no page or console errors', T.errs);
T.done();
