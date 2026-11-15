// Reports: KPI change corners (no sparklines), plain-English descriptions under every panel, "Ideas to grow revenue"
// in every section and "Top opportunities" on the Overview. WebKit, real pointer clicks, 1440 and 390.
import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const SECS = ['overview', 'revenue', 'members', 'growth', 'golf', 'food', 'accounts'];
let pass = 0, fail = 0; const out = [];
const ok = (c, m, x) => { if (c) pass++; else { fail++; out.push('FAIL ' + m + (x === undefined ? '' : '  got: ' + JSON.stringify(x).slice(0, 400))); } };
async function human(p, loc) { if (typeof loc === 'string') loc = p.locator(loc).first(); await loc.waitFor({ timeout: 8000 }); await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(80); const bb = await loc.boundingBox(); const x = bb.x + Math.min(bb.width / 2, 60), y = bb.y + bb.height / 2; await p.mouse.move(x - 8, y - 4); await p.mouse.move(x, y, { steps: 4 }); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(450); }
const show = (p, id) => human(p, `.rp-tabs .tab[data-rtab="${id}"]`);
async function period(p, v) { await p.evaluate(() => scrollTo(0, 0)); await human(p, '#rpPeriodBtn'); await human(p, `.rp-opt[data-value="${v}"]`); await p.waitForTimeout(1200); }
const sentences = t => (t.match(/[.!?](?=\s|$)/g) || []).length;

function inspect(id) {
  const sec = document.querySelector('#rp-sec-' + id);
  const kpis = [...sec.querySelectorAll('.rp-kpi')];
  const chg = kpis.map(k => k.querySelector('.rp-chg')).filter(Boolean);
  const panels = [...sec.querySelectorAll('.rp-panel:not(.rp-ideas)')].map(pn => {
    const d = pn.querySelector('.rp-desc'), pb = pn.querySelector('.rp-pb');
    return { title: pn.querySelector('h2').textContent, desc: d ? d.textContent : null, after: !!(d && pb && (pb.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)) };
  });
  const ideas = sec.querySelector('.rp-ideas');
  const items = ideas ? [...ideas.querySelectorAll('.ideas > li')].map(li => ({ t: li.querySelector('h3').textContent, p: li.querySelector('.idea-main p').textContent, est: li.querySelector('.idea-est').textContent, go: (li.querySelector('[data-go]') || {}).dataset ? li.querySelector('[data-go]') && li.querySelector('[data-go]').dataset.go : null })) : [];
  const chgBox = chg.map(c => { const r = c.getBoundingClientRect(), kt = c.closest('.rp-kpi'), k = kt.getBoundingClientRect(), padR = parseFloat(getComputedStyle(kt).paddingRight) || 0, d = c.closest('.rp-kpi').querySelector('.d').getBoundingClientRect(); return { right: Math.round(k.right - padR - r.right), belowValue: r.top >= c.closest('.rp-kpi').querySelector('.v').getBoundingClientRect().bottom - 1, bottomGap: Math.round(d.bottom - r.bottom), w: r.width }; });
  return {
    hs: document.documentElement.scrollWidth - innerWidth,
    sparks: sec.querySelectorAll('.rp-kpi .chart-spark, .rp-kpi svg').length,
    kpis: kpis.length,
    chg: chg.map(c => ({ text: c.textContent, label: c.getAttribute('aria-label'), title: c.getAttribute('title'), cls: c.className, color: getComputedStyle(c).color })),
    chgBox,
    panels, ideas: !!ideas, ideasTitle: ideas ? ideas.querySelector('h2').textContent : null, items,
    em: /—/.test(sec.innerText), emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sec.innerText),
    descSize: panels.length ? getComputedStyle(sec.querySelector('.rp-desc')).fontSize : null
  };
}

const b = await webkit.launch();
const snap = {};
for (const [W, H] of [[1440, 900], [390, 844]]) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429/.test(m.text())) errs.push(m.text()); });
  await p.goto(B + 'index.html#/reports', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  try {
    ok(/Dec 2025 to Nov 12, 2026|to Nov/.test(await p.textContent('.rp-range')), W + ' default period is the last 12 months');
    const m12 = {};
    for (const s of SECS) {
      await show(p, s);
      const i = await p.evaluate(inspect, s); m12[s] = i;
      ok(i.hs <= 0, `${W} ${s}: no horizontal scroll`, i.hs);
      ok(i.sparks === 0, `${W} ${s}: no sparklines in KPI tiles`, i.sparks);
      ok(i.kpis >= 3, `${W} ${s}: KPI tiles present`, i.kpis);
      ok(i.panels.length >= 2 && i.panels.every(x => x.desc && x.after), `${W} ${s}: a description under every panel`, i.panels.filter(x => !x.desc || !x.after).map(x => x.title));
      ok(i.panels.every(x => { const n = sentences(x.desc || ''); return n >= 2 && n <= 4; }), `${W} ${s}: descriptions are 2 to 4 sentences`, i.panels.map(x => [x.title, sentences(x.desc || '')]).filter(x => x[1] < 2 || x[1] > 4));
      ok(i.ideas && i.items.length >= 3 && i.items.length <= 5, `${W} ${s}: an Ideas block with 3 to 5 ideas`, { ideas: i.ideas, n: i.items.length });
      ok(i.items.every(x => x.t && x.p.length > 40 && (/\d/.test(x.p) || /^No /.test(x.p) && /No estimate/.test(x.est))), `${W} ${s}: every idea states the number it rests on (or that there is none on file)`, i.items.filter(x => !/\d/.test(x.p)));
      const ranked = i.items.map(x => { const m = x.est.match(/\+\$([\d,.]+)(K|M)?/); return m ? 1 : 0; });
      ok(ranked.join('') === ranked.slice().sort((a, b) => b - a).join(''), `${W} ${s}: ideas with an estimate come before those without`, i.items.map(x => x.est));
      ok(!i.em && !i.emoji, `${W} ${s}: no em dashes or emojis`);
      ok(i.chg.every(c => c.label && c.title === c.label && /^(Up|Down|No change|\d)/.test(c.label) && /\b(good|bad|flat)\b/.test(c.cls)), `${W} ${s}: KPI changes carry a label and a good/bad/flat colour`, i.chg);
      ok(i.chgBox.every(c => c.right <= 2 && c.belowValue), `${W} ${s}: KPI change sits at the lower right of its tile`, i.chgBox);
      if (s === 'overview') {
        ok(i.ideasTitle === 'Top opportunities' && i.items.length === 5 && i.items.every(x => x.go && SECS.includes(x.go) && x.go !== 'overview'), `${W} overview: Top opportunities lists 5 ideas, each linking to its section`, i.items.map(x => x.go));
      } else ok(i.ideasTitle === 'Ideas to grow revenue', `${W} ${s}: block is titled Ideas to grow revenue`, i.ideasTitle);
      await p.evaluate(() => scrollTo(0, 0));
      await p.screenshot({ path: `xadv-${s}-${W}.png`, fullPage: true });
    }
    // Members tile: the user's example, "+3" with "Up 3 since Dec 2025"
    const mem = m12.members.chg[0];
    ok(mem && /^\+\d+$/.test(mem.text) && /^Up \d+ since \w{3} \d{4}$/.test(mem.label) && /good/.test(mem.cls), W + ' members: roll change reads like "+3", "Up 3 since Dec 2025", in the good colour', mem);
    // Top opportunities link goes to the section and its ideas
    await show(p, 'overview');
    const target = m12.overview.items[0].go;
    await human(p, '#rp-sec-overview .rp-ideas .ideas > li:first-child [data-go]');
    await p.waitForTimeout(700);
    const went = await p.evaluate(t => ({ tab: document.querySelector('.rp-tabs .tab[aria-selected=true]').dataset.rtab, ideasTop: Math.round(document.querySelector('#rp-sec-' + t + ' .rp-ideas').getBoundingClientRect().top), vh: innerHeight }), target);
    ok(went.tab === target && went.ideasTop < went.vh && went.ideasTop > -200, `${W} overview: an opportunity link opens ${target} at its ideas`, went);
    // Period change: text and changes follow the filter
    await period(p, 'd7');
    for (const s of SECS) {
      await show(p, s);
      const i = await p.evaluate(inspect, s);
      ok(i.chg.length >= 1, `${W} ${s}: last 7 days shows at least one KPI change`, i.chg);
      ok(i.panels.every(x => x.desc) && i.ideas, `${W} ${s}: last 7 days keeps descriptions and ideas`);
      ok(i.hs <= 0, `${W} ${s}: last 7 days no horizontal scroll`, i.hs);
      const before = m12[s].panels.map(x => x.desc).join('|') + m12[s].items.map(x => x.p).join('|'), after = i.panels.map(x => x.desc).join('|') + i.items.map(x => x.p).join('|');
      ok(before !== after, `${W} ${s}: descriptions and ideas change with the period`);
      if (W === 1440 && s === 'golf') await p.screenshot({ path: `xadv-golf-d7-1440.png`, fullPage: true });
    }
    // Chips update the main chart's description
    await show(p, 'revenue');
    const d0 = await p.textContent('#rp-sec-revenue .wide .rp-desc');
    await human(p, '#rp-sec-revenue .rp-chip[data-chip="dining"]');
    const d1 = await p.textContent('#rp-sec-revenue .wide .rp-desc');
    ok(d0 !== d1 && /dining revenue/.test(d1), W + ' revenue: a chip rewrites the description under the chart', d1);
    // The ideas CSV exports from the menu
    await period(p, 'm12'); await show(p, 'golf');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), (async () => { await human(p, '#rp-sec-golf .rp-ideas .rp-more'); await human(p, '.rp-menu:not([hidden]) [data-mi-csv]'); })()]);
    ok(dl && /golf-ideas/.test(dl.suggestedFilename()), W + ' golf: ideas export as CSV', dl && dl.suggestedFilename());
  } catch (e) { ok(false, W + ' test crashed: ' + e.message.split('\n')[0]); }
  ok(errs.length === 0, W + ' no console errors', errs);
  await ctx.close();
}
await b.close();
console.log(out.join('\n')); console.log(`PASS ${pass} FAIL ${fail}`);
