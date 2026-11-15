// xd-undo: every staff action in members, staff, communications, settings, feedback and dashboard goes forward,
// shows a toast with Undo, and Undo puts the store back. WebKit, human-like clicks, 1440 and 390.
import { webkit } from 'playwright';
const B = 'http://localhost:8001/site/';
const res = []; let fails = 0, passes = 0; const errs = [];
const ok = (c, m, x) => { res.push((c ? 'PASS ' : 'FAIL ') + m + (c || x === undefined ? '' : '  got: ' + JSON.stringify(x).slice(0, 600))); if (!c) fails++; else passes++; };
async function human(p, loc) {
  if (typeof loc === 'string') loc = p.locator(loc).first();
  await loc.waitFor({ state: 'visible', timeout: 6000 }); await loc.evaluate(e => { const r = e.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight - 10 || r.left < 0 || r.right > innerWidth) e.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(150);
  const box = await loc.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  /* A stack of earlier toasts can sit over the target, as it would for a person: move them out of the way first */
  const covered = await loc.evaluate((e, [x, y]) => { const h = document.elementFromPoint(x, y); return !!(h && h.closest('.toasts') && !e.closest('.toasts')); }, [x, y]);
  if (covered) { await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await p.waitForTimeout(100); }
  const hit = await loc.evaluate((e, [x, y]) => { const h = document.elementFromPoint(x, y); return !h ? 'nothing at point' : e === h || e.contains(h) || h.contains(e) ? '' : h.outerHTML.slice(0, 140); }, [x, y]);
  if (hit) console.log('MISS', await loc.evaluate(e => e.outerHTML.slice(0, 100)), '->', hit);
  await p.mouse.move(x - 6, y - 4); await p.mouse.move(x, y, { steps: 3 }); await p.mouse.down(); await p.mouse.move(x + 1, y + 1); await p.mouse.up(); await p.waitForTimeout(450);
}
const only = process.argv[2] || '';
const b = await webkit.launch();

async function suite(W) {
  const c = await b.newContext({ viewport: { width: W, height: 900 } }); const p = await c.newPage();
  p.on('pageerror', e => errs.push(W + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/open-meteo|429|503|Failed to load resource/.test(m.text())) errs.push(W + ' ' + m.text()); });
  await p.goto(B + 'index.html#/dashboard', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  const go = async h => { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(800); };
  const coll = n => p.evaluate(n => JSON.stringify(Club.store.all(n)), n);
  const find = (n, id) => p.evaluate(([n, id]) => Club.store.find(n, id), [n, id]);
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  const toastText = () => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  const hasUndo = async () => (await p.locator('.toast.has-act .toast-act').count()) > 0;
  const undo = async () => { await human(p, p.locator('.toast.has-act .toast-act').last()); await p.waitForTimeout(500); };
  const btn = name => p.getByRole('button', { name, exact: true }).last();
  const confirm = async label => { await human(p, btn(label)); await p.waitForTimeout(300); };
  const setv = (sel, v) => p.evaluate(([sel, v]) => { const all = [...document.querySelectorAll(sel)]; const e = all[all.length - 1]; if (!e) throw new Error('no ' + sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const typeInto = async (sel, v) => { const l = p.locator(sel).last(); await human(p, l); await l.fill(v); };
  const noScroll = async where => ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), W + ' ' + where + ': no horizontal scroll');
  const want = k => !only || k.indexOf(only) >= 0;
  /** Forward, then Undo; the listed collections must change and then come back exactly. */
  async function trip(name, colls, forward, extra) {
    try {
      await clearToasts();
      const before = {}; for (const n of colls) before[n] = await coll(n);
      await forward();
      await p.waitForTimeout(300);
      const mid = {}; for (const n of colls) mid[n] = await coll(n);
      const changed = colls.some(n => mid[n] !== before[n]);
      const u = await hasUndo();
      ok(changed && u, W + ' ' + name + ': changes the store and offers Undo', { changed, u, toast: await toastText() });
      if (!u) return;
      await undo();
      const back = {}; for (const n of colls) back[n] = await coll(n);
      const same = colls.filter(n => back[n] !== before[n]);
      ok(same.length === 0, W + ' ' + name + ': Undo restores ' + colls.join(', '), { differs: same, toast: await toastText() });
      if (extra) await extra();
    } catch (e) { ok(false, W + ' ' + name + ': threw', e.message); await p.keyboard.press('Escape').catch(() => {}); await p.keyboard.press('Escape').catch(() => {}); }
  }

  /* ================= Members ================= */
  const mid = await p.evaluate(() => Club.store.all('members').find(m => m.status === 'active' && !(m.statusHistory || []).length).id);
  if (want('mem')) {
    await go('#/members/' + mid);
    await trip('Notes saved', ['members'], async () => { await typeInto('textarea[name=memberNotes]', 'Prefers early tee times. xd'); await human(p, '[data-action=save-notes]'); });
    await trip('Member saved', ['members', 'handicapHistory'], async () => { await human(p, '[data-action=edit]'); await typeInto('.modal [name=phone]', '(204) 555-0199'); await setv('.modal [name=handicap]', '7.3'); await human(p, btn('Save member')); });
    await go('#/members/' + mid);
    // status: forward, toast undo
    await trip('Status changed', ['members'], async () => {
      await human(p, '[data-action=status]'); await human(p, p.locator('.mem-status-opt', { hasText: 'Suspended' })); await human(p, btn('Update status')); await confirm('Confirm change');
    }, async () => ok((await find('members', mid)).status === 'active', W + ' status back to active after Undo'));
    // status step-back control on the profile
    try {
      await go('#/members/' + mid);
      await human(p, '[data-action=status]'); await human(p, p.locator('.mem-status-opt', { hasText: 'Leave of absence' })); await human(p, btn('Update status')); await confirm('Confirm change');
      await p.waitForTimeout(400);
      const bk = p.locator('[data-action=status-back]');
      const label = (await bk.count()) ? (await bk.textContent()).trim() : '';
      ok(label === 'Undo: back to Active', W + ' profile shows "Undo: back to Active" after a status change', label);
      await noScroll('member profile with step-back');
      await clearToasts();
      await human(p, bk);
      const m1 = await find('members', mid);
      const h = m1.statusHistory || [];
      ok(m1.status === 'active' && h.length === 2 && h[1].back === true && h[1].from === 'leave' && h[1].to === 'active', W + ' step-back returns to active and records it in the status history', { status: m1.status, h });
      ok((await p.locator('[data-action=status-back]').count()) === 0, W + ' step-back control is not offered again after stepping back');
      ok(JSON.stringify(h).length < 400, W + ' status history stays tiny', JSON.stringify(h).length);
      await undo();
      const m2 = await find('members', mid);
      ok(m2.status === 'leave' && (m2.statusHistory || []).length === 1 && (await p.locator('[data-action=status-back]').count()) === 1, W + ' Undo of the step-back returns to leave and the control comes back', { s: m2.status, n: (m2.statusHistory || []).length });
    } catch (e) { ok(false, W + ' status step-back threw', e.message); }
    // add member
    try {
      await go('#/members/new');
      await clearToasts();
      const before = await coll('members');
      await typeInto('.modal [name=firstName]', 'Xavier'); await typeInto('.modal [name=lastName]', 'Dutest'); await typeInto('.modal [name=email]', 'xd@example.com');
      await human(p, btn('Save member')); await p.waitForTimeout(500);
      const h1 = await p.evaluate(() => location.hash);
      ok(/#\/members\/.+/.test(h1) && (await coll('members')) !== before && await hasUndo(), W + ' Member added: opens the new member with Undo', { h1, t: await toastText() });
      await undo();
      ok((await coll('members')) === before && (await p.evaluate(() => location.hash)) === '#/members', W + ' Member added: Undo removes it and returns to the directory', await p.evaluate(() => location.hash));
    } catch (e) { ok(false, W + ' Member added threw', e.message); }
  }
  if (want('app')) {
    await go('#/members/applications');
    await noScroll('applications');
    const openTier = await p.evaluate(() => { const b = [...document.querySelectorAll('.mem-cat-toggle')].find(g => g.querySelector('button.active').dataset.value === 'open'); return b ? b.dataset.name : null; });
    await trip('Category marked full', ['membershipTiers'], async () => { await human(p, p.locator('.mem-cat-toggle[data-name="' + openTier + '"] button[data-value=full]')); });
    await trip('Application received', ['applications'], async () => {
      await human(p, '[data-action=new-app]'); await typeInto('.modal [name=name]', 'Xenia Dutest'); await typeInto('.modal [name=email]', 'xenia@example.com');
      await p.evaluate(() => { const s = [...document.querySelectorAll('.modal [name=sponsor1]')].pop(); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await human(p, btn('Save application'));
    });
    const recvId = await p.evaluate(() => Club.store.all('applications').find(a => a.stage === 'Received' && (a.history || []).length === 1).id);
    await trip('Application saved', ['applications'], async () => { await human(p, '.mem-app-open[data-id="' + recvId + '"]'); await p.waitForTimeout(500); await typeInto('.drawer [name=notes]', 'Met at the fall scramble. xd'); await human(p, btn('Save changes')); });
    await trip('Application deleted', ['applications'], async () => { await human(p, '.mem-app-open[data-id="' + recvId + '"]'); await p.waitForTimeout(500); await human(p, btn('Delete')); await confirm('Delete application'); });
    await trip('Stage move Received to Interview', ['applications'], async () => { await human(p, '[data-app-move="Interview"][data-id="' + recvId + '"]'); });
    // step back from the card
    try {
      const a0 = await find('applications', recvId);
      await human(p, '[data-app-move="Interview"][data-id="' + recvId + '"]');
      const back = p.locator('[data-app-back="' + recvId + '"]');
      const t = await back.getAttribute('title');
      ok(t === 'Move back to Received', W + ' card offers "Move back to Received"', t);
      await human(p, back);
      const a1 = await find('applications', recvId);
      ok(a1.stage === 'Received' && JSON.stringify(a1.history) === JSON.stringify(a0.history), W + ' Move back returns to Received and drops the history entry', a1);
      // from the drawer, after Declined
      await human(p, '[data-app-move="Declined"][data-id="' + recvId + '"]'); await confirm('Decline application');
      const dec = await find('applications', recvId);
      const cardBtn = p.locator('[data-app-back="' + recvId + '"]');
      ok(dec.stage === 'Declined' && (await cardBtn.textContent()).trim() === 'Move back to Received', W + ' declined card shows "Move back to Received"', await cardBtn.textContent());
      await human(p, '.mem-app-open[data-id="' + recvId + '"]'); await p.waitForTimeout(500);
      await human(p, btn('Move back to Received'));
      const a2 = await find('applications', recvId);
      ok(a2.stage === 'Received' && !a2.decidedOn && a2.history.length === a0.history.length, W + ' drawer "Move back to Received" reopens it', a2);
      await clearToasts();
    } catch (e) { ok(false, W + ' application step-back threw', e.message); }
    // waiting list offer then back
    try {
      const wid = await p.evaluate(() => { const a = Club.store.all('applications').find(a => a.stage === 'Waiting list'); return a ? a.id : null; });
      if (wid) {
        await trip('Waiting list offer a place', ['applications'], async () => { await human(p, '.mem-wait [data-app-move="Received"][data-id="' + wid + '"]'); });
        await human(p, '.mem-wait [data-app-move="Received"][data-id="' + wid + '"]');
        const back = p.locator('[data-app-back="' + wid + '"]');
        ok((await back.getAttribute('title')) === 'Move back to Waiting list', W + ' offered applicant can move back to the waiting list');
        await human(p, back);
        ok((await find('applications', wid)).stage === 'Waiting list', W + ' back on the waiting list');
      } else ok(true, W + ' no waiting list applicant to test (skipped)');
    } catch (e) { ok(false, W + ' waiting list step-back threw', e.message); }
    const brId = await p.evaluate(() => { const a = Club.store.all('applications').find(a => a.stage === 'Board review'); return a ? a.id : null; });
    if (brId) await trip('Application approved', ['applications', 'members'], async () => { await human(p, '[data-app-move="Approved"][data-id="' + brId + '"]'); await confirm('Approve and create member'); });
    await noScroll('applications after moves');
  }

  /* ================= Staff ================= */
  if (want('staff')) {
    /* index.html does not load the Staff module, so load it into the page for this test */
    if (!(await p.evaluate(() => Club.modules.some(m => m.id === 'staff')))) {
      await p.addStyleTag({ url: B + 'css/modules/staff.css' }); await p.addScriptTag({ url: B + 'js/modules/staff.js' });
      await p.evaluate(() => Club.app.refreshNav()); res.push('NOTE ' + W + ' staff.js is not in index.html; loaded into the page for the test');
    }
    await go('#/staff/schedule');
    await noScroll('staff schedule');
    await trip('Shift added', ['shifts'], async () => {
      await human(p, '[data-action=hdr-shift]');
      await p.evaluate(() => { const s = [...document.querySelectorAll('.modal [name=staffId]')].pop(); s.value = 'stf_19'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await setv('.modal [name=start]', '05:00'); await setv('.modal [name=end]', '06:00');
      await human(p, btn('Add shift'));
      if (await btn('Save anyway').count()) await confirm('Save anyway');
    });
    await trip('Shift saved', ['shifts'], async () => { await human(p, '[data-shift]'); await typeInto('.modal [name=notes]', 'Covering banquet setup'); await human(p, btn('Save shift')); });
    await trip('Shift deleted', ['shifts'], async () => { await human(p, '[data-shift]'); await human(p, btn('Delete')); await confirm('Delete shift'); });
    const nextWk = await p.evaluate(() => Club.date.fromToday(7));
    await go('#/staff/schedule/' + nextWk);
    await clearToasts();
    await human(p, '[data-action=copy-week]');
    const copyBtn = p.getByRole('button', { name: /^Copy \d+ shifts$/ });
    if (await copyBtn.count()) {
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await trip('Copy last week', ['shifts'], async () => { await human(p, '[data-action=copy-week]'); await human(p, copyBtn.last()); });
    } else ok(true, W + ' copy last week: nothing to copy this week (skipped): ' + await toastText());
    await go('#/staff/directory');
    await noScroll('staff directory');
    await trip('Staff member added', ['staff'], async () => {
      await human(p, '[data-action=add-staff]'); await typeInto('.modal [name=firstName]', 'Xander'); await typeInto('.modal [name=lastName]', 'Dutest'); await typeInto('.modal [name=role]', 'Server'); await typeInto('.modal [name=email]', 'xander@example.com');
      await human(p, btn('Add staff member'));
    });
    await trip('Staff member saved', ['staff'], async () => { await human(p, '[data-action=edit-staff]'); await typeInto('.modal [name=phone]', '204 555 0144'); await human(p, btn('Save staff member')); });
    await go('#/staff/timeoff');
    await noScroll('staff time off');
    await trip('Time off submitted', ['timeOff'], async () => {
      await human(p, '[data-action=new-to]');
      await p.evaluate(() => { const s = [...document.querySelectorAll('.modal [name=staffId]')].pop(); s.value = 'stf_19'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      const d = await p.evaluate(() => Club.date.fromToday(90)); await setv('.modal [name=from]', d); await setv('.modal [name=to]', d);
      await typeInto('.modal [name=reason]', 'Family commitment'); await human(p, btn('Submit request'));
    });
    // a pending request over scheduled shifts, to approve with shift removal
    const toId = await p.evaluate(() => {
      const t = Club.date.today(); const sh = Club.store.all('shifts').filter(s => s.date > t).sort((a, b) => a.date.localeCompare(b.date))[0];
      Club.store.all('timeOff').filter(x => x.staffId === sh.staffId && x.from <= sh.date && x.to >= sh.date).forEach(x => Club.store.remove('timeOff', x.id));
      return Club.store.insert('timeOff', { staffId: sh.staffId, from: sh.date, to: sh.date, reason: 'Medical appointment', status: 'pending', requestedOn: t }).id;
    });
    await go('#/staff/directory'); await go('#/staff/timeoff');
    await trip('Time off approved, shifts removed', ['timeOff', 'shifts'], async () => { await human(p, '[data-action=approve][data-id="' + toId + '"]'); await human(p, btn('Approve and remove shifts')); });
    await trip('Time off denied', ['timeOff'], async () => { await human(p, '[data-action=deny][data-id="' + toId + '"]'); await confirm('Deny request'); });
    await trip('Time off deleted', ['timeOff'], async () => { await human(p, '[data-action=del-to][data-id="' + toId + '"]'); await confirm('Delete request'); });
  }

  /* ================= Communications ================= */
  if (want('comm')) {
    await go('#/communications/compose');
    await noScroll('communications compose');
    await trip('Draft saved', ['announcements'], async () => { await typeInto('[name=title]', 'Xd draft title'); await typeInto('textarea[name=body]', 'Dear {first_name}, a test.'); await human(p, '[data-action=save-draft]'); }, async () => {
      ok((await p.evaluate(() => location.hash)) === '#/communications/compose' && (await p.locator('.cm-form [name=title]').inputValue()) === 'Xd draft title', W + ' draft text is back in the composer after Undo');
    });
    await human(p, '[data-action=clear]'); await clearToasts();
    await go('#/communications/outbox');
    await noScroll('communications outbox');
    await trip('Schedule cancelled', ['announcements'], async () => { await human(p, '[data-action=unschedule]'); await confirm('Cancel schedule'); });
    await trip('Message deleted', ['announcements'], async () => { await human(p, '.s-draft [data-action=del]'); await confirm('Delete message'); });
    await go('#/communications/templates');
    try {
      await clearToasts();
      await human(p, '[data-action=use]');
      const t1 = await p.locator('.cm-form [name=title]').inputValue();
      ok(t1.length > 0 && await hasUndo(), W + ' Template loaded: composer filled, Undo offered', t1);
      await undo();
      ok((await p.evaluate(() => location.hash)) === '#/communications/templates', W + ' Template loaded: Undo returns to templates', await p.evaluate(() => location.hash));
      await go('#/communications/compose');
      ok((await p.locator('.cm-form [name=title]').inputValue()) === '', W + ' Template loaded: composer is empty again');
    } catch (e) { ok(false, W + ' template threw', e.message); }
    try {
      await go('#/communications/compose'); await clearToasts();
      await typeInto('[name=title]', 'Xd sent'); await typeInto('textarea[name=body]', 'Hello'); await human(p, '[data-action=send]');
      const hasConfirm = await btn('Send now').count(); await confirm('Send now');
      ok(hasConfirm > 0 && !(await hasUndo()) && /sent to/.test(await toastText()), W + ' Send now keeps its confirmation and has no Undo', await toastText());
    } catch (e) { ok(false, W + ' send threw', e.message); }
  }

  /* ================= Settings ================= */
  if (want('set')) {
    await go('#/settings');
    await noScroll('settings profile');
    try {
      await clearToasts();
      const before = await p.evaluate(() => JSON.stringify([Club.store.getObj('clubInfo'), Club.info]));
      await typeInto('[data-form=profile] [name=phone]', '204-555-0100'); await human(p, '[data-action=save-profile]');
      const mid1 = await p.evaluate(() => Club.info.phone);
      ok(/555-0100/.test(mid1) && await hasUndo(), W + ' Club profile saved with Undo', [mid1, await toastText()]);
      await undo();
      const after = await p.evaluate(() => JSON.stringify([Club.store.getObj('clubInfo'), Club.info]));
      ok(after === before && (await p.locator('[data-form=profile] [name=phone]').inputValue()).indexOf('555-0100') < 0, W + ' Club profile Undo restores the stored value, Club.info and the form');
    } catch (e) { ok(false, W + ' profile threw', e.message); }
    await go('#/settings/billing');
    await noScroll('settings billing');
    try {
      await clearToasts();
      const r0 = await p.evaluate(() => Club.taxRate());
      await typeInto('[data-form=tax] [name=rate]', '13'); await human(p, '[data-action=save-tax]');
      const r1 = await p.evaluate(() => Club.taxRate());
      // a sale made at the new rate, as the golf shop would record it
      const sale = await p.evaluate(() => Club.store.insert('sales', { date: Club.date.today(), items: [{ name: 'Glove', qty: 1, price: 20 }], subtotal: 20, tax: Math.round(20 * Club.taxRate() * 100) / 100, total: Math.round(20 * (1 + Club.taxRate()) * 100) / 100, xd: 1 }));
      const snap = () => p.evaluate(() => { const o = JSON.parse(Club.store.exportJSON()); delete o.$taxRate; return JSON.stringify(o); });
      const s0 = await snap();
      await undo();
      const r2 = await p.evaluate(() => Club.taxRate()); const s1 = await snap(); const sale2 = await find('sales', sale.id);
      ok(r1 === 0.13 && r2 === r0, W + ' Sales tax: Undo restores the old rate for new sales', { r0, r1, r2 });
      ok(s0 === s1 && sale2.tax === 2.6, W + ' Sales tax: Undo rewrites no records; a sale made at 13% keeps its tax', sale2 && sale2.tax);
      ok(/Sales already made keep their tax/.test(await toastText()), W + ' Sales tax: undo toast says past sales keep their tax');
      await p.evaluate(id => Club.store.remove('sales', id), sale.id);
    } catch (e) { ok(false, W + ' tax threw', e.message); }
    await trip('Tier added', ['membershipTiers'], async () => { await human(p, '[data-action=add-tier]'); await typeInto('.modal [name=name]', 'Xd Senior'); await setv('.modal [name=annualDues]', '1500'); await human(p, btn('Add tier')); });
    await trip('Tier saved', ['membershipTiers'], async () => { await human(p, '[data-action=edit-tier]'); await setv('.modal [name=annualDues]', '2999'); await human(p, btn('Save tier')); });
    try {
      await human(p, '[data-action=add-tier]'); await typeInto('.modal [name=name]', 'Xd Temp'); await setv('.modal [name=annualDues]', '100'); await human(p, btn('Add tier'));
      const tid = await p.evaluate(() => Club.store.all('membershipTiers').find(t => t.name === 'Xd Temp').id);
      await trip('Tier deleted', ['membershipTiers'], async () => { await human(p, '[data-action=del-tier][data-id="' + tid + '"]'); await confirm('Delete tier'); });
    } catch (e) { ok(false, W + ' tier delete setup threw', e.message); }
    await go('#/settings/promotions');
    await noScroll('settings promotions');
    await trip('Promo created', ['promoCodes'], async () => {
      await human(p, '[data-action=promo-new]'); await typeInto('.modal [name=code]', 'XDTEST'); await typeInto('.modal [name=value]', '10'); await human(p, btn('Create promotion'));
    });
    await trip('Promo saved', ['promoCodes'], async () => { await human(p, '[data-action=promo-edit]'); await typeInto('.modal [name=description]', 'Fall promotion'); await human(p, btn('Save promotion')); });
    const promo = await p.evaluate(() => { const t = Club.date.today(); const x = Club.store.all('promoCodes').find(p => p.active && (!p.endsOn || p.endsOn >= t) && (!p.startsOn || p.startsOn <= t) && (p.appliesTo || []).some(k => k !== 'shop') && !p.days && !p.timeFrom && !p.timeTo); return x ? { id: x.id, code: x.code } : null; });
    if (promo) await trip('Promo turned off', ['promoCodes'], async () => { await human(p, p.locator('tr[data-promo="' + promo.id + '"] .st-row-toggle')); },
      async () => ok((await find('promoCodes', promo.id)).active === true, W + ' promo is on again after Undo'));
    else ok(false, W + ' no active promo to toggle');
    const unused = await p.evaluate(() => { const x = Club.store.all('promoCodes').find(p => !(p.uses || []).length); return x ? x.id : null; });
    if (unused) await trip('Promo deleted', ['promoCodes'], async () => { await human(p, '[data-action=promo-del][data-id="' + unused + '"]'); await confirm('Delete code'); });
    await go('#/settings/addons');
    await noScroll('settings add-ons');
    await trip('Add-on added', ['bookingAddons'], async () => { await human(p, '[data-action=addon-new]'); await typeInto('.modal [name=name]', 'Xd umbrella'); await setv('.modal [name=price]', '5'); await human(p, btn('Add add-on')); });
    await trip('Add-on saved', ['bookingAddons'], async () => { await human(p, '[data-action=addon-edit]'); await setv('.modal [name=price]', '61'); await human(p, btn('Save add-on')); });
    const addon = await p.evaluate(() => { const a = Club.addons.active('public')[0]; return a ? { id: a.id, name: a.name } : null; });
    await trip('Add-on turned off', ['bookingAddons'], async () => { await human(p, p.locator('tr[data-addon="' + addon.id + '"] .st-row-toggle')); },
      async () => ok((await find('bookingAddons', addon.id)).active === true, W + ' add-on is on again after Undo'));
    // the public site offers them again
    try {
      const pp = await c.newPage(); pp.on('pageerror', e => errs.push(W + ' public ' + e.message));
      await pp.goto(B + 'public.html#/book', { waitUntil: 'domcontentloaded' }); await pp.waitForTimeout(1800);
      const r = await pp.evaluate(([aid, code]) => ({ add: Pub.addonList().some(a => a.id === aid), promo: Club.promos.check(code, { where: 'teetime', date: Club.date.fromToday(1) }) }), [addon.id, promo && promo.code]);
      ok(r.add, W + ' public booking offers ' + addon.name + ' again after Undo');
      ok(!promo || r.promo.ok, W + ' public booking accepts ' + (promo && promo.code) + ' again after Undo', r.promo);
      // and the booking page itself shows the add-on once a time is picked
      await pp.evaluate(() => Pub.signIn(Club.store.all('publicPlayers')[0].id, true)); await pp.waitForTimeout(500);
      await pp.goto(B + 'public.html#/book', { waitUntil: 'domcontentloaded' }); await pp.waitForTimeout(1800);
      await human(pp, pp.locator('.pub-chip.st-open').first()); await pp.waitForTimeout(1200);
      const listed = await pp.evaluate(() => [...document.querySelectorAll('.pub-adds-list li')].map(l => l.innerText.split('\n')[0]));
      ok(listed.indexOf(addon.name) >= 0, W + ' public booking page lists ' + addon.name + ' after picking a time', listed);
      const ap = await pp.evaluate(() => !!document.querySelector('.pr-apply-host, .pub-party'));
      ok(ap, W + ' public booking step 2 is showing');
      await pp.close();
    } catch (e) { ok(false, W + ' public check threw', e.message); }
  }

  /* ================= Feedback and dashboard ================= */
  if (want('fb')) {
    await go('#/feedback');
    await noScroll('feedback');
    if (await p.locator('[data-action=vfs-done]').count()) await trip('Feedback followed up', ['visitFeedback'], async () => { await human(p, '[data-action=vfs-done]'); });
    else ok(false, W + ' no low rating to follow up');
  }
  if (want('dash')) {
    const rid = await p.evaluate(() => { const r = Club.store.all('messageReports').find(r => r.status === 'open'); if (r) return r.id;
      const ms = Club.store.all('members'); return Club.store.insert('messageReports', { status: 'open', reportedId: ms[0].id, reporterId: ms[1].id, body: 'A test message', reason: 'Rude', at: new Date().toISOString() }).id; });
    await go('#/clubhouse'); await go('#/dashboard');
    await noScroll('dashboard');
    await trip('Report dismissed', ['messageReports'], async () => { await human(p, '[data-report="' + rid + '"]'); await human(p, btn('Dismiss')); });
    await go('#/dashboard');
    await trip('Report contacted', ['messageReports'], async () => { await human(p, '[data-report="' + rid + '"]'); await human(p, btn('Contact member')); });
  }
  await p.screenshot({ path: 'xd-undo-' + W + '.png' });
  await c.close();
}
for (const W of [1440, 390]) await suite(W);
ok(errs.length === 0, 'no console errors', errs);
console.log(res.join('\n')); console.log(fails ? 'FAILED ' + fails + ' of ' + (fails + passes) : 'ALL PASSED ' + passes); await b.close();
