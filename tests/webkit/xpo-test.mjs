/* Group outings: members' portal enquiry -> staff Pipeline -> member sees status; withdraw. 1440 and 390, en and fr.
   node xpo-test.mjs   (screenshots in po/) */
import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/'; const OUT = 'po/';
const res = []; let fails = 0;
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x))); if (!c) fails++; };
async function human(p, sel) {
  const loc = p.locator(sel).first(); await loc.waitFor({ timeout: 8000 }); await loc.evaluate(el => el.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(150);   /* centred: clear of the sticky top bar */
  const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x - 6, y - 4); await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(450);
}
async function typeIn(p, sel, text, clear) { await human(p, sel); if (clear) { await p.locator(sel).first().fill(''); } await p.keyboard.type(text, { delay: 8 }); }
const b = await webkit.launch();
for (const lang of ['en', 'fr']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = lang + '-' + w; const FR = lang === 'fr';
  const c = await b.newContext({ viewport: { width: w, height: h } });
  await c.addInitScript((l) => { try { localStorage.setItem('stboniface.portal.session', 'mem_1003'); localStorage.setItem('stboniface.lang', l); } catch (e) {} }, lang);
  const errs = [];
  const watch = (p, who) => { p.on('pageerror', e => errs.push(who + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(who + ' ' + m.text()); }); };
  const p = await c.newPage(); watch(p, 'portal');
  try {
  await p.goto(B + 'member.html#/home', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1400);
  const overflow = async (pg, state) => { const o = await pg.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1); ok(!o, tag + ' no horizontal scroll: ' + state); };
  const FRW = new Set('janvier février mars avril mai juin juillet août septembre octobre novembre décembre janv. févr. avr. juill. sept. oct. nov. déc. lundi mardi mercredi jeudi vendredi samedi dimanche lun. mar. mer. jeu. ven. sam. dim.'.split(' '));
  const frDate = (t) => t.split(/[\s,·]+/).filter(Boolean).every(x => FRW.has(x) || /^[\d\u202f\u00a0#:.$-]+$/.test(x));
  const missing = async (state) => { if (!FR) return; const m = (await p.evaluate(() => { const x = Club.i18n.missing(); Club.i18n.clearMissing(); return x; })).filter(x => !frDate(x.text)); ok(!m.length, tag + ' French complete: ' + state, m.slice(0, 12));
    const eng = await p.evaluate(() => { const out = []; document.querySelectorAll('.p-page, .ps-sheet.open, .pk-bar.open').forEach(r => { const c = r.cloneNode(true); c.querySelectorAll('[data-i18n-skip], input, textarea, script, style').forEach(x => x.remove());
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && /\b(players?|per|package|the|and|your|with|enquiry|enquiries|Choose|Outing|from|to|of|at|Call)\b/.test(t)) out.push(t); } }); return out; });
    ok(!eng.length, tag + ' no English words left: ' + state, eng.slice(0, 10)); };

  /* Navigation: the page is in the header (or its More menu) on desktop and in the phone More menu */
  if (w >= 1024) ok(await p.locator('.p-nav a[data-page=outings]').count() === 1, tag + ' Group outings link in the header nav');
  else { await human(p, '.p-tabbar .p-more-btn'); await p.waitForTimeout(400); ok(await p.locator('.p-more a.p-more-row[href="#/outings"]').count() === 1, tag + ' Group outings on the phone More page'); }   /* More is a page since the Nov 21 redesign */

  await p.evaluate(() => { if (Club.i18n.clearMissing) Club.i18n.clearMissing(); location.hash = '#/outings'; }); await p.waitForTimeout(1100);
  ok(await p.locator('.po-pkg').count() === 3, tag + ' three packages shown');
  const pk = await p.evaluate(() => [...document.querySelectorAll('.po-price-n')].map(n => n.textContent));
  ok(pk.length === 3 && /130/.test(pk[0]) && /160/.test(pk[1]) && /150/.test(pk[2]), tag + ' package prices from the data', pk);
  await missing('outings page'); await overflow(p, 'outings page');
  await p.evaluate(() => document.querySelectorAll('.pk-acc:not(.is-open) .pk-acc-head').forEach(h => h.click())); await p.waitForTimeout(400);
  await missing('outings accordions open'); await overflow(p, 'accordions open');
  await p.screenshot({ path: OUT + 'outings-' + tag + '.png', fullPage: true });
  await p.evaluate(() => document.querySelectorAll('.pk-acc.is-open .pk-acc-head').forEach(h => h.click())); await p.waitForTimeout(300);

  /* Enquire from the Eagle card */
  await human(p, '.po-pkg >> nth=1 >> .po-pkg-go'); await p.waitForTimeout(700);
  ok(/#\/outings\/enquire\/op_eagle/.test(p.url()), tag + ' Enquire opens the form with the package', p.url());
  ok(await p.locator('.po-choice.active[data-pkg=op_eagle]').count() === 1, tag + ' Eagle preselected');
  const send = async () => { if (w >= 1024) await human(p, '.po-send'); else await human(p, '.pk-bar.open .pk-bar-btn'); await p.waitForTimeout(500); };
  /* Empty submit: friendly errors */
  await p.locator('#po-name').fill(''); await send();
  const errsShown = await p.evaluate(() => [...document.querySelectorAll('.po-form .field-error')].map(e => e.textContent));
  ok(errsShown.length >= 4, tag + ' empty form shows errors', errsShown);
  await missing('form errors'); await overflow(p, 'form errors');
  await p.screenshot({ path: OUT + 'form-errors-' + tag + '.png', fullPage: false });
  /* Fill it in */
  const org = 'Test Golf Day ' + tag;
  await typeIn(p, '#po-org', org);
  await typeIn(p, '#po-players', '7a2');
  ok(await p.inputValue('#po-players') === '72', tag + ' players field keeps digits only');
  await typeIn(p, '#po-name', 'Dave Nerada');
  await typeIn(p, '#po-phone', '2045550123', true);
  await p.keyboard.press('Tab');
  ok(await p.inputValue('#po-phone') === '(204) 555-0123', tag + ' phone formats as typed', await p.inputValue('#po-phone'));
  await human(p, '.po-date[data-f=date] .dp-field'); await p.waitForTimeout(400);
  ok(await p.locator('.ps-sheet.open .ps-row').count() > 100, tag + ' season dates in the sheet');
  await missing('date sheet'); await p.screenshot({ path: OUT + 'date-sheet-' + tag + '.png' });
  await human(p, '.ps-sheet.open .ps-row >> nth=12'); await p.waitForTimeout(500);
  await human(p, '.po-date[data-f=altDate] .dp-field'); await p.waitForTimeout(400);
  await human(p, '.ps-sheet.open .ps-row >> nth=14'); await p.waitForTimeout(500);
  await human(p, '[data-fmt="Tee times"]');
  await typeIn(p, '#po-notes', 'BBQ lunch and prizes for closest to the pin.');
  const dsel = await p.evaluate(() => [...document.querySelectorAll('.po-date .dp-field-text')].map(x => x.textContent));
  ok(dsel.length === 2 && !/Choose|Choisi/.test(dsel.join()), tag + ' both dates chosen', dsel);
  await missing('form filled'); await overflow(p, 'form filled');
  await p.screenshot({ path: OUT + 'form-' + tag + '.png', fullPage: true });
  await send(); await p.waitForTimeout(700);
  ok(/#\/outings\/sent\//.test(p.url()), tag + ' confirmation shown', p.url());
  const id = p.url().split('/').pop();
  const doc = await p.evaluate((id) => Club.store.find('outings', id), id);
  ok(doc && doc.source === 'portal' && doc.memberId === 'mem_1003' && doc.stage === 'Enquiry' && doc.organization === org && doc.players === 72 && doc.packageId === 'op_eagle' && doc.altDate && doc.altDate !== doc.date && doc.phone === '(204) 555-0123' && doc.format === 'Tee times' && doc.history.length === 1 && Array.isArray(doc.deposits) && doc.quote === null, tag + ' enquiry saved in the staff shape', doc);
  await missing('confirmation'); await overflow(p, 'confirmation');
  await p.screenshot({ path: OUT + 'sent-' + tag + '.png', fullPage: true });
  await p.evaluate(() => { location.hash = '#/outings'; }); await p.waitForTimeout(1000);
  const rowStatus = async (o) => p.evaluate((o) => { const b = [...document.querySelectorAll('.po-enq')].find(x => x.dataset.enq === o); return b ? b.querySelector('.po-status').textContent : null; }, o);
  ok(await rowStatus(id) === (FR ? 'Demande reçue' : 'Enquiry received'), tag + ' My enquiries shows it as received', await rowStatus(id));

  /* Staff: Pipeline */
  const s = await c.newPage(); watch(s, 'staff');
  await s.goto(B + 'index.html#/outings', { waitUntil: 'domcontentloaded' }); await s.waitForTimeout(1500);
  const card = await s.evaluate((id) => { const a = document.querySelector('[data-flip="' + id + '"]'); return a ? { col: a.closest('.fn-col').getAttribute('aria-label'), badge: (a.querySelector('.ot-portal') || {}).textContent } : null; }, id);
  ok(card && card.col === 'Enquiry' && card.badge === 'Members’ portal', tag + ' staff Pipeline: in Enquiry with the Members’ portal badge', card);
  const navBadge = await s.evaluate(() => { const a = document.querySelector('a[href="#/outings"]'); return a ? a.textContent.replace(/\D+/g, ' ').trim() : ''; });
  const nEnq = await s.evaluate(() => Club.store.all('outings').filter(o => o.stage === 'Enquiry').length);
  ok(navBadge.split(' ').includes(String(nEnq)), tag + ' staff nav badge counts portal enquiries', { navBadge, nEnq });
  await overflow(s, 'staff pipeline');
  await s.evaluate((id) => document.querySelector('[data-flip="' + id + '"]').scrollIntoView({ block: 'center', inline: 'center' }), id);
  await s.screenshot({ path: OUT + 'staff-pipeline-' + tag + '.png' });
  await human(s, '[data-flip="' + id + '"] [data-move="Quoted"]'); await s.waitForTimeout(600);
  ok(await s.evaluate((id) => Club.store.find('outings', id).stage, id) === 'Quoted', tag + ' staff moved it to Quoted');
  const undoBtn = s.locator('.toast button', { hasText: 'Undo' });
  ok(await undoBtn.count() >= 1, tag + ' staff move shows Undo');
  if (await undoBtn.count()) { await human(s, '.toast button:has-text("Undo")'); await s.waitForTimeout(600); ok(await s.evaluate((id) => Club.store.find('outings', id).stage, id) === 'Enquiry', tag + ' Undo puts it back in Enquiry'); await human(s, '[data-flip="' + id + '"] [data-move="Quoted"]'); await s.waitForTimeout(600); }
  const q = await s.evaluate((id) => Club.store.find('outings', id), id);
  ok(q.stage === 'Quoted' && q.quote && q.quote.total > 0, tag + ' Quoted with a quote built from the package', { stage: q.stage, total: q.quote && q.quote.total });
  await s.goto(B + 'index.html#/outings/' + id, { waitUntil: 'domcontentloaded' }); await s.waitForTimeout(1400);
  const det = await s.evaluate(() => ({ member: (document.querySelector('.fn-side a[href^="#/members/"]') || {}).textContent, alt: [...document.querySelectorAll('dt')].some(d => d.textContent === 'Alternate date'), hero: !!document.querySelector('.fn-hero-badge .ot-portal') }));
  ok(det.member && /Dave/.test(det.member) && det.alt && det.hero, tag + ' staff detail: member link, alternate date, badge', det);
  await overflow(s, 'staff detail');
  await s.screenshot({ path: OUT + 'staff-detail-' + tag + '.png' });

  /* Member sees the new status (live, from the other tab's change) */
  await p.bringToFront(); await p.waitForTimeout(1200);
  let st = await rowStatus(id);
  if (st !== (FR ? 'Soumission envoyée' : 'Quote sent')) { res.push('NOTE ' + tag + ' status not live (' + st + '), reloading'); await p.reload(); await p.waitForTimeout(1300); st = await rowStatus(id); }
  ok(st === (FR ? 'Soumission envoyée' : 'Quote sent'), tag + ' member sees Quote sent', st);
  await human(p, '[data-enq="' + id + '"]'); await p.waitForTimeout(500);
  ok(await p.locator('.ps-sheet.open [data-act=withdraw]').count() === 0, tag + ' no Withdraw once quoted');
  await missing('quoted sheet'); await overflow(p, 'quoted sheet');
  await p.screenshot({ path: OUT + 'quoted-sheet-' + tag + '.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  /* A second enquiry, Not sure of the package, then withdraw it */
  await p.evaluate(() => { location.hash = '#/outings/enquire'; }); await p.waitForTimeout(900);
  const org2 = 'Second Group ' + tag;
  await typeIn(p, '#po-org', org2); await typeIn(p, '#po-players', '24');
  await human(p, '.po-choice[data-pkg=unsure]');
  await human(p, '.po-date[data-f=date] .dp-field'); await p.waitForTimeout(400); await human(p, '.ps-sheet.open .ps-row >> nth=20'); await p.waitForTimeout(400);
  await send(); await p.waitForTimeout(700);
  const id2 = p.url().split('/').pop();
  const d2 = await p.evaluate((id) => Club.store.find('outings', id), id2);
  ok(d2 && d2.packageUnsure === true && d2.packageId === 'op_birdie' && d2.altDate === null, tag + ' Not sure: Birdie suggested for 24 players', d2 && { pkg: d2.packageId, unsure: d2.packageUnsure });
  await p.evaluate(() => { location.hash = '#/outings'; }); await p.waitForTimeout(900);
  await human(p, '[data-enq="' + id2 + '"]'); await p.waitForTimeout(500);
  await missing('enquiry sheet'); await p.screenshot({ path: OUT + 'enquiry-sheet-' + tag + '.png' });
  await human(p, '.ps-sheet.open [data-act=withdraw]'); await p.waitForTimeout(300);
  await missing('withdraw confirm'); await p.screenshot({ path: OUT + 'withdraw-confirm-' + tag + '.png' });
  await human(p, '.ps-sheet.open [data-act=confirm-withdraw]'); await p.waitForTimeout(800);
  const d3 = await p.evaluate((id) => Club.store.find('outings', id), id2);
  ok(d3.stage === 'Lost' && d3.lostReason === 'Withdrawn by member', tag + ' withdrawn: closed as lost with the reason', { stage: d3.stage, r: d3.lostReason });
  ok(await rowStatus(id2) === (FR ? 'Retirée' : 'Withdrawn'), tag + ' member sees Withdrawn', await rowStatus(id2));
  await missing('after withdraw'); await overflow(p, 'after withdraw');
  await p.screenshot({ path: OUT + 'mine-' + tag + '.png', fullPage: false });
  await p.evaluate(() => document.querySelector('.po-mine').scrollIntoView()); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + 'mine-list-' + tag + '.png' });
  /* staff: reopen the withdrawn one, then the member sees it again as received (and can withdraw again) */
  await s.goto(B + 'index.html#/outings', { waitUntil: 'domcontentloaded' }); await s.waitForTimeout(1300);
  await s.evaluate(() => { const c = document.querySelector('.fn-closed'); if (c && !c.checked) c.click(); }); await s.waitForTimeout(500);
  const lostCard = await s.evaluate((id) => { const a = document.querySelector('[data-flip="' + id + '"]'); return a ? a.closest('.fn-col').getAttribute('aria-label') + ' / ' + (a.querySelector('.fn-card-lost') || {}).textContent : null; }, id2);
  ok(lostCard === 'Lost / Withdrawn by member', tag + ' staff sees it in Lost: withdrawn by member', lostCard);
  await human(s, '[data-flip="' + id2 + '"] [data-move="Enquiry"]'); await s.waitForTimeout(600);
  ok(await s.evaluate((id) => Club.store.find('outings', id).stage, id2) === 'Enquiry', tag + ' staff Reopen works on a portal enquiry');
  await p.bringToFront(); await p.waitForTimeout(1200);
  if (await rowStatus(id2) !== (FR ? 'Demande reçue' : 'Enquiry received')) { await p.reload(); await p.waitForTimeout(1300); }
  ok(await rowStatus(id2) === (FR ? 'Demande reçue' : 'Enquiry received'), tag + ' member sees it received again', await rowStatus(id2));
  ok(!errs.length, tag + ' no console errors', errs.slice(0, 5));
  } catch (e) { ok(false, tag + ' crashed: ' + String(e.message).split('\n')[0] + ' @ ' + (String(e.stack).match(/xpo-test.mjs:(\d+)/g) || []).join(',')); await p.screenshot({ path: OUT + 'crash-' + tag + '.png' }).catch(() => {}); res.push('url ' + p.url()); }
  await c.close();
}
await b.close();
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
