import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
let pass = 0, fail = 0; const out = [];
function ok(c, msg) { if (c) pass++; else { fail++; out.push('FAIL ' + msg); } }
async function click(p, loc) {
  await loc.evaluate(n => n.scrollIntoView({ block: 'center' })); await p.waitForTimeout(60); const bb = await loc.boundingBox();
  const hit = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + e.className : ''; }, { x: bb.x + Math.min(bb.width / 2, 12), y: bb.y + bb.height / 2 });
  if (/lang|i18n/i.test(hit)) out.push('info click would hit ' + hit);
  const x = bb.x + Math.min(bb.width / 2, 12), y = bb.y + bb.height / 2;
  await p.mouse.move(x - 25, y - 8); await p.mouse.move(x, y, { steps: 5 }); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); await p.waitForTimeout(120);
}
async function type(p, sel, v) { const l = p.locator(sel); await click(p, l); await l.fill(''); await p.keyboard.type(v, { delay: 5 }); }
async function pick(p, selectSel, text) {
  await click(p, p.locator(selectSel).locator('xpath=preceding-sibling::button[1]')); await p.waitForTimeout(250);
  const opt = p.locator('.cs-pop .cs-opt', { hasText: text }).first();
  const n = await opt.count(); if (!n) { out.push('info no option ' + text + ' among ' + (await p.locator('.cs-opt').allInnerTexts()).join('/')); return false; }
  await opt.evaluate(n => n.scrollIntoView({ block: 'nearest' }));
  const bb = await opt.boundingBox(); const x = bb.x + 20, y = bb.y + bb.height / 2;
  await p.mouse.move(x - 20, y - 6); await p.mouse.move(x, y, { steps: 4 }); await p.mouse.down(); await p.waitForTimeout(40); await p.mouse.up(); await p.waitForTimeout(200);
  return true;
}
const store = (p, fn, arg) => p.evaluate(fn, arg);
const b = await webkit.launch();
for (const lang of (process.env.LANGS || 'en,fr').split(',')) for (const W of [1440, 390]) {
  const errs = [], tag = lang + ' ' + W;
  const ctx = await b.newContext({ viewport: { width: W, height: W > 500 ? 900 : 844 } });
  if (lang === 'fr') await ctx.addInitScript(() => { try { localStorage.setItem('stboniface.lang', 'fr'); } catch (e) {} });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const hs = async () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const stamp = lang + W;
  // ---- Sign up, opt-in ON with an answer ----
  await p.goto(B + 'public.html#/signup'); await p.waitForTimeout(1500);
  const lbl = (await p.locator('.pub-auth-form .pub-optin').textContent()).trim();
  ok(lang === 'en' ? lbl === 'Email me club news and offers. You can stop anytime.' : /^Envoyez-moi par courriel les nouvelles/.test(lbl), tag + ' opt-in label: ' + lbl);
  ok(!(await p.locator('[name=marketingOptIn]').isChecked()), tag + ' opt-in unticked by default');
  ok((await p.locator('label[for=pf-heard]').textContent()).trim() === (lang === 'en' ? 'How did you hear about us?' : 'Comment avez-vous entendu parler de nous?'), tag + ' heard label translated');
  await type(p, '#pf-first', 'Test'); await type(p, '#pf-last', 'Golfer'); await type(p, '#pf-email', 'opt.on.' + stamp + '@example.com');
  await type(p, '#pf-phone', '2045550199'); await type(p, '#pf-postal', 'R2H0A1'); await type(p, '#pf-password', 'golfing123'); await type(p, '#pf-confirm', 'golfing123');
  const want1 = lang === 'en' ? ['Search engine', 'Search engine'] : ['Mariage ou événement au club', 'Wedding or event at the club'];
  ok(await pick(p, '[name=heardFrom]', want1[0]), tag + ' picker option found: ' + want1[0]);
  const btnText = (await p.locator('#pf-heard-btn').innerText()).trim();
  ok(btnText === want1[0], tag + ' picker shows chosen text: ' + btnText);
  const vals = await p.evaluate(() => [...document.querySelectorAll('select[name=heardFrom] option')].map(o => o.value).join('|'));
  ok(vals === '|A member of the club|Friend or family|Played here as a guest|Played here as a public golfer|Search engine|Social media|Wedding or event at the club|Other', tag + ' option values stay English');
  await click(p, p.locator('.pub-auth-form .pub-optin input'));
  ok(await p.locator('[name=marketingOptIn]').isChecked(), tag + ' opt-in ticked by click');
  ok(await hs() <= 0, tag + ' signup no horizontal scroll');
  await p.screenshot({ path: `xrg-pub-signup-${lang}-${W}.png`, fullPage: true });
  await click(p, p.locator('.pub-auth-btn'));
  await p.waitForTimeout(1200);
  let pp = await store(p, (e) => Club.store.all('publicPlayers').find(x => x.email === e), 'opt.on.' + stamp + '@example.com');
  ok(pp && pp.marketingOptIn === true && /^\d{4}-\d\d-\d\dT/.test(pp.marketingOptInAt || '') && pp.heardFrom === want1[1], tag + ' stored opt-in on: ' + JSON.stringify(pp && { o: pp.marketingOptIn, at: pp.marketingOptInAt, h: pp.heardFrom }));
  // ---- My account: change later ----
  await p.goto(B + 'public.html#/account'); await p.waitForTimeout(1300);
  const sec = p.locator('.pub-optin-panel');
  ok(await sec.isVisible(), tag + ' account email preferences panel');
  const secTxt = await sec.textContent();
  ok(lang === 'en' ? /Email preferences/.test(secTxt) && /Subscribed since/.test(secTxt) : /Préférences de courriel/.test(secTxt) && /Abonné depuis le/.test(secTxt), tag + ' account panel text: ' + secTxt.replace(/\s+/g, ' ').slice(0, 160));
  ok(await sec.locator('input').isChecked(), tag + ' account checkbox reflects opt-in');
  ok(await p.locator('.pub-details [name=marketingOptIn]').count() === 0, tag + ' details form no longer carries opt-in');
  await p.screenshot({ path: `xrg-pub-account-${lang}-${W}.png`, fullPage: true });
  await click(p, sec.locator('input')); await p.waitForTimeout(500);
  pp = await store(p, (id) => Club.store.find('publicPlayers', id), pp.id);
  ok(pp.marketingOptIn === false && pp.marketingOptInAt === null, tag + ' turned off later');
  const toast = await p.locator('.toast').last().innerText().catch(() => '');
  ok(lang === 'en' ? /no longer get club news/.test(toast) : /ne recevrez plus/.test(toast), tag + ' off toast: ' + toast);
  await click(p, sec.locator('input')); await p.waitForTimeout(500);
  pp = await store(p, (id) => Club.store.find('publicPlayers', id), pp.id);
  ok(pp.marketingOptIn === true && !!pp.marketingOptInAt, tag + ' turned back on later');
  // Saving contact details keeps the opt-in
  await click(p, p.locator('.pub-details button[type=submit]')); await p.waitForTimeout(500);
  pp = await store(p, (id) => Club.store.find('publicPlayers', id), pp.id);
  ok(pp.marketingOptIn === true, tag + ' saving details keeps opt-in');
  ok(await hs() <= 0, tag + ' account no horizontal scroll');
  // ---- Second account: opt-in OFF, no answer ----
  await p.evaluate(() => { localStorage.removeItem('stboniface.public.session'); });
  await p.goto(B + 'public.html#/signup'); await p.reload(); await p.waitForTimeout(1400);
  await type(p, '#pf-first', 'Quiet'); await type(p, '#pf-last', 'Golfer'); await type(p, '#pf-email', 'opt.off.' + stamp + '@example.com');
  await type(p, '#pf-phone', '2045550198'); await type(p, '#pf-postal', 'R2H0A1'); await type(p, '#pf-password', 'golfing123'); await type(p, '#pf-confirm', 'golfing123');
  await click(p, p.locator('.pub-auth-btn')); await p.waitForTimeout(1200);
  const pp2 = await store(p, (e) => Club.store.all('publicPlayers').find(x => x.email === e), 'opt.off.' + stamp + '@example.com');
  if (!pp2) { await p.screenshot({ path: `xrg-dbg-pp2-${lang}-${W}.png` }); }
  ok(pp2 && pp2.marketingOptIn === false && pp2.marketingOptInAt === null && pp2.heardFrom === '', tag + ' stored opt-in off, no answer: ' + JSON.stringify(pp2 && { o: pp2.marketingOptIn, at: pp2.marketingOptInAt, h: pp2.heardFrom }));
  await p.goto(B + 'public.html#/account'); await p.waitForTimeout(1200);
  const offTxt = await p.locator('.pub-optin-panel').textContent().catch(() => 'NONE ' + p.url());
  ok(lang === 'en' ? /You are not getting/.test(offTxt) : /Vous ne recevez pas/.test(offTxt), tag + ' account shows not subscribed ' + offTxt.slice(0, 120));
  // ---- Applications: with and without an answer ----
  async function apply(email, heard) {
    await p.goto(B + 'public.html#/join/apply/birdie'); await p.waitForTimeout(1400);
    await type(p, '#jn-first', 'Pat'); await type(p, '#jn-last', 'Applicant'); await type(p, '#jn-email', email); await type(p, '#jn-phone', '2045550177');
    await type(p, '#jn-dob-d', '14'); 
    const monthOk = await pick(p, '[name=dobMonth]', lang === 'en' ? 'June' : 'juin');
    await type(p, '[name=dobYear]', '1985');
    let picked = true; if (heard) picked = await pick(p, '[name=heardFrom]', heard);
    await click(p, p.locator('.join-consent input'));
    if (heard) await p.screenshot({ path: `xrg-pub-join-${lang}-${W}.png`, fullPage: true });
    ok(await hs() <= 0, tag + ' join form no horizontal scroll');
    if (!monthOk || !picked) await p.screenshot({ path: `xrg-dbg-join-${lang}-${W}.png` });
    await click(p, p.locator('.join-send')); await p.waitForTimeout(1200);
    return { monthOk, picked, app: await store(p, (e) => Club.store.all('applications').find(a => a.email === e), email) };
  }
  const h = lang === 'en' ? ['Social media', 'Social media'] : ['Un membre du club', 'A member of the club'];
  const a1 = await apply('app.on.' + stamp + '@example.com', h[0]);
  ok(a1.monthOk && a1.picked, tag + ' month and heard pickers clicked');
  ok(a1.app && a1.app.heardFrom === h[1] && a1.app.dob === '1985-06-14', tag + ' application stored heardFrom ' + JSON.stringify(a1.app && { h: a1.app.heardFrom, dob: a1.app.dob }));
  ok(/join\/sent/.test(p.url()), tag + ' application sent page');
  const a2 = await apply('app.off.' + stamp + '@example.com', null);
  ok(a2.app && a2.app.heardFrom === '', tag + ' application without answer stores empty');
  // ---- Staff side (same browser storage): English only ----
  if (lang === 'fr') {
    await p.goto(B + 'index.html#/members/applications/' + a1.app.id); await p.waitForTimeout(1600);
    const dtxt = await p.locator('.drawer').last().innerText({ timeout: 4000 }).catch(async () => 'NO DRAWER url=' + p.url() + ' ' + (await p.evaluate(() => document.body.innerText.slice(0, 300))));
    ok(/Heard about us\s*A member of the club/.test(dtxt), tag + ' staff application detail in English ' + dtxt.slice(0, 400));
    const selTxt = await p.evaluate(() => { const s = [...document.querySelectorAll('.drawer select[name=heardFrom]')].pop(); return s ? s.options[s.selectedIndex].text : null; });
    ok(selTxt === 'A member of the club', tag + ' staff form shows English answer: ' + selTxt);
    ok(!/Un membre du club|Mariage ou/.test(await p.evaluate(() => document.body.innerText)), tag + ' no French on staff page');
    await p.screenshot({ path: `xrg-staff-app-fr-${W}.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.goto(B + 'index.html#/reports/growth'); await p.waitForTimeout(2200);
    const heardTxt = await p.locator('[data-report="growth-heard"]').innerText();
    ok(/Wedding or event at the club/.test(heardTxt) && /A member of the club/.test(heardTxt) && !/Mariage|Un membre/.test(heardTxt), tag + ' growth card English');
    await click(p, p.locator('.rg-heard-row', { hasText: 'Wedding or event at the club' })); await p.waitForTimeout(500);
    const hd = await p.locator('.drawer').last().innerText({ timeout: 4000 }).catch(() => 'none');
    ok(/Test Golfer/.test(hd), tag + ' growth heard drawer lists the French-form signup: ' + hd.replace(/\s+/g, ' ').slice(0, 300));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const pubTxt = await p.locator('[data-report="growth-public"]').innerText();
    ok(/13|14|15/.test(pubTxt), tag + ' public card counts new accounts');
  }
  ok(errs.length === 0, tag + ' no console errors: ' + errs.join(' | '));
  await ctx.close();
  console.log(out.join('\n')); out.length = 0;
}
// ---- Staff new application form (EN) with and without the answer ----
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + 'index.html#/members/applications'); await p.waitForTimeout(1600);
  for (const [nm, heard] of [['Office With', 'Friend or family'], ['Office Without', null]]) {
    await click(p, p.locator('[data-action=new-app]')); await p.waitForTimeout(400);
    const m = p.locator('.modal').last();
    await type(p, '.modal [name=name]', nm); await type(p, '.modal [name=email]', nm.replace(' ', '.').toLowerCase() + '@example.com');
    const sp = await m.locator('select[name=sponsor1]').getAttribute('id');
    await click(p, p.locator('#' + sp + '-btn')); await p.waitForTimeout(200); await click(p, p.locator('.cs-opt').nth(2)); await p.waitForTimeout(150);
    if (heard) { const id = await m.locator('select[name=heardFrom]').getAttribute('id'); await click(p, p.locator('#' + id + '-btn')); await p.waitForTimeout(200); await click(p, p.locator('.cs-opt', { hasText: heard })); }
    await click(p, m.locator('.btn-primary')); await p.waitForTimeout(700);
    const a = await p.evaluate((n) => Club.store.all('applications').find(x => x.name === n), nm);
    ok(a && a.heardFrom === (heard || ''), 'staff new application ' + nm + ' heardFrom=' + (a && JSON.stringify(a.heardFrom)));
  }
  ok(errs.length === 0, 'staff form no errors ' + errs.join('|'));
  await ctx.close();
}
await b.close();
console.log(out.join('\n')); console.log(`PASS ${pass} FAIL ${fail}`);
