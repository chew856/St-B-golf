import { suite, open, human } from './xb-lib.mjs';
const T = suite(); const { ok } = T;
for (const W of [1900, 1440, 390]) {
  const { b, p } = await open(W, 'lessons', T);
  try {
    await p.waitForTimeout(800);
    const st = await p.evaluate(() => {
      const bl = [...document.querySelectorAll('.ls-block')];
      const who = bl.map(x => x.querySelector('.ls-b-last'));
      const trunc = who.filter(w => w.scrollWidth > w.clientWidth + 1).map(w => w.textContent + ' ' + Math.round(w.closest('.ls-block').getBoundingClientRect().width));
      const widths = bl.map(x => Math.round(x.getBoundingClientRect().width)); const dayW = Math.round(document.querySelector('.ls-day').getBoundingClientRect().width);
      const fs = [...new Set(bl.flatMap(x => [...x.querySelectorAll('span')].filter(s => s.offsetParent).map(s => getComputedStyle(s).fontSize)))];
      const full = bl.filter(x => x.style.getPropertyValue('--cols') === '1').length;
      const lanes = document.querySelectorAll('.ls-lane').length;
      /* overlapping blocks in the same day must not intersect horizontally */
      let clash = 0; document.querySelectorAll('.ls-day').forEach(d => { const r = [...d.querySelectorAll('.ls-block')].map(x => x.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], c = r[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) clash++; } });
      return { n: bl.length, full, dayW, minW: Math.min(...widths), trunc, fs, lanes, clash, docW: document.documentElement.scrollWidth, sample: who.slice(0, 6).map(w => w.textContent) };
    });
    console.log(W, JSON.stringify(st));
    ok(st.n > 0 && st.lanes === 0 && st.clash === 0, W + ': blocks laid out with no overlap', st);
    ok(st.fs.every(f => parseFloat(f) >= 12), W + ': block text at least 12px', st.fs);
    ok(st.full >= 10, W + ': many lessons get the full day width', { full: st.full, n: st.n });
    ok(st.docW <= W + 1, W + ': no page horizontal scroll');
    await p.locator('.ls-sched-panel').scrollIntoViewIfNeeded();
    await p.locator('.ls-sched-panel').screenshot({ path: 'xls-grid-' + W + '.png' });
    await p.screenshot({ path: 'xls-page-' + W + '.png' });
    /* tooltip on a lesson */
    if (W !== 390) {
      const blk = p.locator('.ls-block[data-action=lesson]').first(); const bx = await blk.boundingBox();
      await p.mouse.move(bx.x + 4, bx.y + 4); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(400);
      const tip = await p.evaluate(() => { const t = [...document.querySelectorAll('.chart-tip, .tip, [class*=tip]')].find(x => x.classList.contains('show')); return t ? t.textContent : null; });
      const want = await blk.evaluate(e => e.dataset.tipTitle);
      ok(tip && tip.includes(want) && / to /.test(tip) && /with /.test(tip), W + ': tooltip has full name, pro, time range, type', tip);
    }
    /* click empty space on a future day books at that time */
    const fut = await p.evaluate(() => { const t = Club.date.today(); const d = [...document.querySelectorAll('.ls-day')].find(x => x.dataset.date > t); return d ? d.dataset.date : null; });
    if (fut) {
      const day = p.locator('.ls-day[data-date="' + fut + '"]'); await day.scrollIntoViewIfNeeded();
      /* find an empty y in that day at 7:00..18:00 */
      const pt = await day.evaluate(d => { const r = d.getBoundingClientRect(); const bl = [...d.querySelectorAll('.ls-block')].map(x => x.getBoundingClientRect());
        for (let m = 0; m < 11 * 60; m += 15) { const y = r.top + (m + 7) / 720 * r.height; const x = r.left + r.width * 0.5; if (!bl.some(b => x >= b.left && x <= b.right && y >= b.top - 2 && y <= b.bottom + 2)) return { x, y, m: 420 + m }; } return null; });
      if (pt) {
        await p.mouse.move(pt.x - 6, pt.y - 4); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(150);
        const ghost = await day.evaluate(d => { const g = d.querySelector('.ls-ghost.on'); return g ? g.textContent : null; });
        if (W !== 390) ok(!!ghost && /Book/.test(ghost), W + ': hover shows the slot to book', ghost);
        await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500);
        const f = await p.evaluate(() => { const f = document.querySelector('.ls-modal form'); return f ? { date: f.date.value, time: f.time.value, pro: f.proId.value } : null; });
        const hh = String(Math.floor(pt.m / 60)).padStart(2, '0') + ':' + String(pt.m % 60).padStart(2, '0');
        ok(f && f.date === fut && f.time === hh && !!f.pro, W + ': clicking empty space opens booking at that day and time with a pro', { f, fut, hh, ghost });
        if (W === 1440) await p.screenshot({ path: 'xls-book-' + W + '.png' });
        await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      }
    }
    /* filter to one pro: blocks show the lesson type, booking uses that pro */
    if (W === 1900) {
      await human(p, '.segmented[data-name=lspro] button:nth-child(3)'); await p.waitForTimeout(400);
      const one = await p.evaluate(() => ({ grid: document.querySelector('.ls-grid').className, pros: [...new Set([...document.querySelectorAll('.ls-block.pc1,.ls-block.pc2,.ls-block.pc3,.ls-block.pc4')].map(b => b.className.match(/pc\d/)[0]))] }));
      ok(/single/.test(one.grid) && one.pros.length <= 1, W + ': filtering to one pro shows only their lessons', one);
      await p.locator('.ls-sched-panel').screenshot({ path: 'xls-grid-onepro-' + W + '.png' });
      await human(p, '.segmented[data-name=lspro] button:nth-child(1)');
    }
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xls-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
