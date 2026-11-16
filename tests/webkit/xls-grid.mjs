import { suite, open, human } from './xb-lib.mjs';
/* Lessons & Academy teaching schedule (rebuilt Nov 16): the Day view (a time grid with a column for each pro) and the
   Week view (a row for each pro, a cell for each day), with the Day | Week switch.
   This replaces the checks written for the old combined week grid. Gone with that grid: lanes shared by several pros,
   "at least 10 lessons get the full day width" (every lesson now has its pro's whole column) and soft hyphens in names. */
const T = suite(); const { ok } = T;
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const nb = s => String(s || '').replace(/ /g, ' ');

/* What the store says for one day: each pro's lessons (not cancelled) and academy sessions, and the open time
   (7:00 to 19:00 less every minute taken by a lesson or a session). */
const fromStore = (p, d) => p.evaluate(d => {
  const S = Club.store, toMin = t => +t.split(':')[0] * 60 + +t.split(':')[1];
  const pros = S.all('staff').filter(s => /Golf Professional|Director of Golf/.test(s.role || '') && s.status !== 'inactive');
  const sessions = x => { const o = []; for (let k = 0; k < (+x.weeks || 0); k++) o.push(Club.date.addDays(x.startDate, k * 7)); return o; };
  return pros.map(pr => {
    const ls = S.all('lessons').filter(l => l.proId === pr.id && l.date === d && l.status !== 'cancelled');
    const pg = S.all('programs').filter(x => x.coach === pr.id && sessions(x).indexOf(d) >= 0);
    const taken = new Array(720).fill(0);
    ls.concat(pg).forEach(x => { for (let m = toMin(x.time); m < toMin(x.time) + (+x.duration || 60); m++) if (m >= 420 && m < 1140) taken[m - 420] = 1; });
    const mins = ls.reduce((a, l) => a + (+l.duration || 60), 0), h = v => (Math.round(v / 60 * 10) / 10).toString();
    return { id: pr.id, first: pr.firstName, items: ls.concat(pg).map(x => ({ id: x.id, s: toMin(x.time), e: toMin(x.time) + (+x.duration || 60), name: x.name || (x.memberId ? (Club.members.get(x.memberId) || {}).firstName + ' ' + (Club.members.get(x.memberId) || {}).lastName : (x.guest || {}).name) })),
      sub: ls.length + ' lesson' + (ls.length === 1 ? '' : 's') + ' · ' + h(mins) + ' h', open: h(720 - taken.reduce((a, b) => a + b, 0)) + ' h open' };
  });
}, d);
/* The columns on screen: each visible pro column with its blocks, measured against the time grid. */
const onScreen = p => p.evaluate(() => {
  const body = document.querySelector('.ls-dbody').getBoundingClientRect(), at = y => (y - body.top) / body.height * 720 + 420;
  return [...document.querySelectorAll('.ls-col')].filter(c => c.offsetParent).map(c => {
    const r = c.getBoundingClientRect(), head = document.querySelector('.ls-ph[data-id="' + c.dataset.pro + '"]');
    return { pro: c.dataset.pro, date: c.dataset.date, w: r.width, sub: head.querySelector('small').textContent, open: head.querySelector('.ls-open').textContent,
      blocks: [...c.querySelectorAll('.ls-block')].map(x => { const q = x.getBoundingClientRect(); return { id: x.dataset.id, s: at(q.top), e: at(q.bottom), l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, who: x.querySelector('.ls-b-who').textContent, cols: x.style.getPropertyValue('--cols'),
        clipped: x.scrollHeight > x.clientHeight + 1, fs: [...x.querySelectorAll('span')].filter(s => s.offsetParent).map(s => parseFloat(getComputedStyle(s).fontSize)) }; }) };
  });
});

for (const W of [1900, 1440, 390]) {
  const { b, p } = await open(W, 'lessons', T);
  const phone = W === 390;
  try {
    await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.querySelector('.ls-sched-panel').dataset.view === 'day' && !!document.querySelector('.ls-dpill.on[data-date="' + Club.date.today() + '"]') && !document.querySelector('.ls-grid, .ls-day')), W + ': opens on the Day view, on today; the old week grid is gone');
    /* tomorrow by a dated link: the Day view opens on that day */
    const D = await p.evaluate(() => Club.date.fromToday(1));
    await p.evaluate(d => { location.hash = '#/lessons/' + d; }, D); await p.waitForTimeout(900);
    const want = await fromStore(p, D);
    /* phones show one pro at a time: go through the picker; wider screens show every column at once */
    const seen = [];
    for (const pr of phone ? want : [null]) {
      if (pr) { const pick = p.locator('.ls-propick button[data-value="' + pr.id + '"]:not(.active)'); if (await pick.count()) await human(p, pick); }
      const cols = await onScreen(p);
      if (phone) ok(cols.length === 1 && cols[0].pro === pr.id, W + ': one pro column at a time (' + pr.first + ')', cols.map(c => c.pro));
      seen.push(...cols);
    }
    const bad = [], sizes = [];
    seen.forEach(c => {
      const w = want.find(x => x.id === c.pro);
      if (c.date !== D || nb(c.sub) !== w.sub || nb(c.open) !== w.open) bad.push({ pro: c.pro, sub: nb(c.sub), want: w.sub, open: c.open, wantOpen: w.open });
      if (c.blocks.map(x => x.id).sort().join() !== w.items.map(x => x.id).sort().join()) bad.push({ pro: c.pro, got: c.blocks.map(x => x.id), want: w.items.map(x => x.id) });
      c.blocks.forEach((x, i) => { const it = w.items.find(y => y.id === x.id); if (!it) return;
        if (Math.abs(x.s - it.s) > 1.5 || Math.abs(x.e - it.e) > 3.5 || x.who !== it.name || x.clipped) bad.push({ id: x.id, s: x.s, e: x.e, who: x.who, clipped: x.clipped, it });
        sizes.push(...x.fs);
        /* a lesson alone in its time has the pro's whole column; no two blocks of a column overlap */
        const alone = !w.items.some(y => y.id !== it.id && y.s < it.e && it.s < y.e);
        if (alone && (x.cols !== '1' || x.w < c.w - 24)) bad.push({ id: x.id, narrow: x.w, col: c.w });
        c.blocks.slice(i + 1).forEach(y => { if (x.l < y.r - 1 && y.l < x.r - 1 && x.t < y.b - 1 && y.t < x.b - 1) bad.push({ clash: [x.id, y.id] }); });
      });
    });
    const n = seen.reduce((a, c) => a + c.blocks.length, 0);
    ok(seen.map(c => c.pro).join() === want.map(x => x.id).join() && n > 0 && !bad.length, W + ': every lesson once, in its pro column, at its time, full name, not clipped; counts and "h open" match the store (' + n + ' blocks)', bad.slice(0, 4));
    ok(sizes.every(f => f >= 12), W + ': block text at least 12px', [...new Set(sizes)]);
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= W + 1, W + ': Day view, no page horizontal scroll');
    await p.locator('.ls-sched-panel').scrollIntoViewIfNeeded();
    await p.locator('.ls-sched-panel').screenshot({ path: 'xls-day-' + W + '.png' });
    /* tooltip on a lesson */
    if (!phone) {
      const blk = p.locator('.ls-block[data-action=lesson]').first(); await blk.evaluate(e => e.scrollIntoView({ block: 'center' })); const bx = await blk.boundingBox();
      await p.mouse.move(bx.x + 4, bx.y + 4); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(400);
      const tip = await p.evaluate(() => { const t = [...document.querySelectorAll('.chart-tip, .tip, [class*=tip]')].find(x => x.classList.contains('show')); return t ? t.textContent : null; });
      const title = await blk.evaluate(e => e.dataset.tipTitle);
      ok(tip && tip.includes(title) && / to /.test(tip) && /with /.test(tip), W + ': tooltip has full name, pro, time range, type', tip);
    }
    /* open space in a pro's column books with that pro at that time */
    const pt = await p.evaluate(() => {
      const col = [...document.querySelectorAll('.ls-col')].filter(c => c.offsetParent).pop(), r = col.getBoundingClientRect(), bl = [...col.querySelectorAll('.ls-block')].map(x => x.getBoundingClientRect());
      for (let m = 8 * 60; m <= 17 * 60; m += 15) { const y0 = r.top + (m - 420) / 720 * r.height, y1 = r.top + (m + 60 - 420) / 720 * r.height;
        if (!bl.some(q => q.top < y1 + 2 && y0 - 2 < q.bottom)) { scrollTo(0, scrollY + y0 - innerHeight / 2); const q = col.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + (m - 420 + 6) / 720 * q.height, m, pro: col.dataset.pro }; } }
      return null; });
    if (pt) {
      await p.waitForTimeout(200);
      await p.mouse.move(pt.x - 6, pt.y - 4); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(150);
      const ghost = await p.evaluate(() => { const g = document.querySelector('.ls-ghost.on'); return g ? g.textContent : null; });
      if (!phone) ok(!!ghost && /^\+ Book .* with /.test(ghost), W + ': hover shows the slot to book, with the pro', ghost);
      await p.mouse.down(); await p.mouse.move(pt.x + 1, pt.y + 1); await p.mouse.up(); await p.waitForTimeout(500);
      const f = await p.evaluate(() => { const f = document.querySelector('.ls-modal form'); return f ? { date: f.date.value, time: f.time.value, pro: f.proId.value } : null; });
      ok(f && f.date === D && f.time === hm(pt.m) && f.pro === pt.pro, W + ': open space opens booking for that pro, day and time', { f, D, pt, ghost });
      if (W === 1440) await p.screenshot({ path: 'xls-book-' + W + '.png' });
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    } else ok(false, W + ': no open hour found to test booking');
    /* filter to one pro: one wide column */
    if (W === 1900) {
      await human(p, '.segmented[data-name=lspro] button:nth-child(3)'); await p.waitForTimeout(400);
      const one = await onScreen(p);
      ok(one.length === 1 && one[0].pro === want[1].id && one[0].blocks.length === want[1].items.length, W + ': filtering to one pro shows only their column', one.map(c => c.pro));
      await p.locator('.ls-sched-panel').screenshot({ path: 'xls-day-onepro-' + W + '.png' });
      await human(p, '.segmented[data-name=lspro] button:nth-child(1)');
    }

    /* ---- Week view ---- */
    await human(p, '.segmented[data-name=lsview] button[data-value=week]'); await p.waitForTimeout(400);
    const wk = await p.evaluate(() => ({ view: document.querySelector('.ls-sched-panel').dataset.view, stored: localStorage.getItem('stboniface.lessons.view'), rows: [...document.querySelectorAll('.ls-wp')].map(x => x.dataset.id), heads: [...document.querySelectorAll('.ls-wh')].filter(x => x.offsetParent).length, days: [...document.querySelectorAll('.ls-wc-day')].filter(x => x.offsetParent).length,
      cells: [...document.querySelectorAll('.ls-wc')].map(c => ({ chips: c.querySelectorAll('.ls-chip').length, more: c.querySelector('.ls-more') ? c.querySelector('.ls-more').textContent : '', tot: c.querySelector('.ls-wc-tot').textContent })),
      labels: [...document.querySelectorAll('.ls-chip')].every(c => / to /.test(c.getAttribute('aria-label')) && / with /.test(c.getAttribute('aria-label'))),
      cut: [...document.querySelectorAll('.ls-chip .ls-c-w')].filter(w => w.scrollWidth > w.clientWidth + 1).map(w => w.textContent), docW: document.documentElement.scrollWidth }));
    ok(wk.view === 'week' && wk.stored === 'week' && wk.rows.join() === want.map(x => x.id).join() && wk.cells.length === want.length * 7, W + ': Week view has a row for each pro and seven days each, and the choice is stored', wk.rows);
    ok(wk.cells.every(c => c.chips <= 3 && (c.more === '' || /^\d+ more$/.test(c.more)) && /lesson|session/.test(c.tot)) && wk.labels && !wk.cut.length, W + ': cells show up to three lessons, an "N more" control and a total; names are not cut', wk.cut);
    ok(phone ? wk.heads === 0 && wk.days === want.length * 7 : wk.heads === 7, W + ': ' + (phone ? 'stacked by pro with a label for each day' : 'seven day headers'), { heads: wk.heads, days: wk.days });
    ok(wk.docW <= W + 1, W + ': Week view, no page horizontal scroll');
    await p.locator('.ls-sched-panel').scrollIntoViewIfNeeded();
    await p.locator('.ls-sched-panel').screenshot({ path: 'xls-week-' + W + '.png' });
    /* "N more" expands the cell in place and collapses */
    if (await p.locator('.ls-more').count()) {
      const key = await p.locator('.ls-more').first().getAttribute('data-key'), sel = '.ls-more[data-key="' + key + '"]';
      const extra = parseInt(await p.locator(sel).textContent(), 10), cell = () => p.evaluate(sel => { const c = document.querySelector(sel).closest('.ls-wc'); return { n: c.querySelectorAll('.ls-chip').length, t: c.querySelector('.ls-more').textContent }; }, sel);
      await human(p, sel); const c1 = await cell();
      await human(p, sel); const c2 = await cell();
      ok(c1.n === 3 + extra && c1.t === 'Show fewer' && c2.n === 3 && c2.t === extra + ' more', W + ': "N more" expands the cell in place and collapses again', { c1, c2 });
    }
    /* a chip opens that lesson */
    const chip = p.locator('.ls-chip.st-scheduled[data-action=lesson]').first();
    if (await chip.count()) {
      const id = await chip.getAttribute('data-id'); await human(p, chip);
      const f = await p.evaluate(id => { const f = document.querySelector('.ls-modal form'), l = Club.store.find('lessons', id); return f ? f.date.value === l.date && f.time.value === l.time && f.proId.value === l.proId && f.memberId.value === (l.memberId || '') : false; }, id);
      ok(f, W + ': a chip opens that lesson'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    }
    /* a day goes back to the Day view on that day */
    const D2 = await p.evaluate(() => Club.date.week(Club.date.today())[3]);
    await human(p, (phone ? '.ls-wc-day' : '.ls-wh') + '[data-date="' + D2 + '"]');
    ok(await p.evaluate(d => document.querySelector('.ls-sched-panel').dataset.view === 'day' && !!document.querySelector('.ls-dpill.on[data-date="' + d + '"]'), D2), W + ': a day in the Week view opens the Day view on that day');
    await p.screenshot({ path: 'xls-page-' + W + '.png' });
  } catch (e) { ok(false, W + ': script error ' + e.message.split('\n')[0]); await p.screenshot({ path: 'xls-err-' + W + '.png' }); }
  await b.close();
}
T.ok(T.errs.length === 0, 'no console errors', T.errs);
T.done();
