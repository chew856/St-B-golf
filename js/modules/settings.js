/* Settings: club profile, billing configuration, data management, about. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc;
  const VERSION = '1.0.0';
  const STORE_KEY = Club.store.KEY;
  const SECTIONS = ['Overview', 'Golf', 'Membership', 'Hospitality', 'Course', 'Administration'];

  function all(c) { try { const a = S.all(c); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (e) { return []; } }
  function num(v) { return +v || 0; }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  /* ---------------- Validation helpers ---------------- */
  function fieldError(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid');
    f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrors(form) {
    U.$$('.field-error', form).forEach(function (e) { e.remove(); });
    U.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
  }
  function focusFirstError(form) { const f = U.$('.invalid', form); if (f) f.focus(); }
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function sectionHead(title, text) {
    return '<div class="st-section-head"><h3>' + esc(title) + '</h3>' + (text ? '<p class="muted">' + esc(text) + '</p>' : '') + '</div>';
  }

  /* ---------------- Undo (js/core/undo.js) ----------------
     Each change below offers Undo on its toast; the tabs redraw from their store subscriptions. Single-value settings
     (club profile, tax rate) are only put back while they still hold what this change saved: undo.js checks records
     for later changes but not single values, so that check lives here. message may be a function of fn's result;
     guard() may return a reason the undo cannot run now. */
  function undoable(fn, message, undone, after, guard) {
    const rec = Club.undo.track(fn), saved = {};
    (rec.ops || []).forEach(function (o) { if (o.t === 'obj') saved[o.k] = JSON.stringify(S.getObj(o.k)); });
    const msg = typeof message === 'function' ? message(rec.result) : message;
    if (!msg) return rec.result;
    if (!rec.ops || !rec.ops.length) { U.toast(msg); return rec.result; }
    U.toast(msg, '', { action: { label: 'Undo', onClick: function () {
      if (Object.keys(saved).some(function (k) { return JSON.stringify(S.getObj(k)) !== saved[k]; })) { U.toast('This has changed since, so it can no longer be undone here.', 'bad'); return; }
      const why = guard && guard();
      if (why) { U.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { U.toast(res.msg, 'bad'); return; }
      try { if (after) after(); } catch (e) { console.error(e); }
      U.toast(undone || 'Undone');
    } } });
    return rec.result;
  }

  /* ---------------- Club profile ---------------- */
  function profileTab(panel) {
    const i = Club.info;
    panel.innerHTML = '<div class="grid grid-main-side st-grid">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Club profile</div><h3>Identity and contact</h3></div></div><div class="panel-body">' +
      '<form class="form-grid st-form" novalidate data-form="profile">' +
      U.field({ label: 'Club name', name: 'name', value: i.name, required: true, span2: true }) +
      U.field({ label: 'Short name', name: 'short', value: i.short, required: true, hint: 'Shown beside the logo and in page titles.' }) +
      U.field({ label: 'Established', name: 'est', type: 'number', value: i.est, required: true, min: 1700, max: new Date().getFullYear(), step: 1 }) +
      U.field({ label: 'Address', name: 'address', value: i.address, required: true, span2: true }) +
      U.field({ label: 'Phone', name: 'phone', type: 'tel', value: i.phone, required: true }) +
      U.field({ label: 'Email', name: 'email', type: 'email', value: i.email, hint: 'Optional. Leave blank to show the phone number only.' }) +
      '<div class="span-2 st-form-foot">' + U.btn('Save profile', { kind: 'primary', icon: 'check', action: 'save-profile' }) + '</div>' +
      '</form></div></section>' +
      '<section class="panel st-preview" data-reveal><div class="panel-head"><div><div class="eyebrow">Preview</div><h3>Letterhead</h3></div></div><div class="panel-body" data-preview></div></section>' +
      '</div>';
    const form = U.$('form', panel);
    function preview() {
      const d = U.formData(form);
      U.$('[data-preview]', panel).innerHTML = '<div class="st-letterhead">' + Club.logoImg('st-crest') +
        '<div class="st-lh-name serif">' + esc(d.name || 'Club name') + '</div>' +
        '<div class="label-caps">Established ' + esc(d.est || '') + '</div><div class="flourish st-flourish">' + Club.icon('flag') + '</div>' +
        '<div class="st-lh-contact">' + esc(d.address || '') + '<br>' + esc([d.phone, d.email].filter(Boolean).join(' · ')) + '</div></div>';
    }
    preview();
    form.addEventListener('input', preview);
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
    U.on(panel, 'click', '[data-action=save-profile]', save);
    function save() {
      if (!U.validate(form)) return;
      const d = U.formData(form);
      let ok = true;
      const yr = new Date().getFullYear();
      if (!(d.est >= 1700 && d.est <= yr) || d.est % 1) { fieldError(form, 'est', 'Enter a year between 1700 and ' + yr + '.'); ok = false; }
      if (d.email && !EMAIL.test(d.email)) { fieldError(form, 'email', 'Enter a valid email address.'); ok = false; }
      if (d.short.length > 24) { fieldError(form, 'short', 'Keep the short name under 24 characters.'); ok = false; }
      if (!ok) { focusFirstError(form); return; }
      const info = { name: d.name, short: d.short, est: d.est, address: d.address, phone: d.phone, email: d.email || '' };
      const was = {}; Object.keys(info).forEach(function (k) { was[k] = Club.info[k]; });
      undoable(function () { S.setObj('clubInfo', info); }, 'Club profile saved', 'Club profile restored', function () {
        apply(was);
        if (/^#\/settings\/?$/.test(location.hash)) Club.app.render();
      });
      apply(info);
    }
    function apply(info) {
      Object.assign(Club.info, info);
      Club.app.refreshNav();
      const cur = Club.modules.find(function (m) { return m.id === 'settings'; });
      if (/^#\/settings/.test(location.hash)) document.title = (cur ? cur.label : 'Settings') + ' · ' + Club.info.name;
    }
  }

  /* ---------------- Billing ---------------- */
  function tierForm(t) {
    t = t || {};
    return '<form class="form-grid" novalidate>' +
      U.field({ label: 'Tier name', name: 'name', value: t.name, required: true, span2: true, placeholder: 'For example, Senior' }) +
      U.field({ label: 'Annual dues', name: 'annualDues', type: 'number', value: t.annualDues, required: true, min: 0, step: 50, hint: 'Canadian dollars a year, payable in instalments until August.' }) +
      U.field({ label: 'Monthly F&B minimum', name: 'monthlyMinimum', type: 'number', value: t.monthlyMinimum != null ? t.monthlyMinimum : 0, required: true, min: 0, step: 10, hint: 'St. Boniface has no minimums today. Leave at 0 for none.' }) +
      '<div class="field span-2"><label class="st-toggle-row"><span class="toggle"><input type="checkbox" name="golf"' + (t.golf !== false ? ' checked' : '') + '><span></span></span><span><strong>Golf privileges</strong><span class="field-hint st-block">Members of this tier may book tee times without invitation.</span></span></label></div>' +
      U.field({ label: 'Description', name: 'description', type: 'textarea', value: t.description, span2: true, placeholder: 'Privileges and eligibility' }) +
      '</form>';
  }
  function editTier(t) {
    const isNew = !t;
    const m = U.modal({
      title: isNew ? 'Add membership tier' : 'Edit ' + t.name, eyebrow: 'Membership tiers', body: tierForm(t),
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: isNew ? 'Add tier' : 'Save tier', kind: 'primary', icon: 'check', onClick: function (api) {
            const form = U.$('form', api.body);
            if (!U.validate(form)) return false;
            const d = U.formData(form);
            let ok = true;
            const dup = all('membershipTiers').some(function (x) { return x.name.toLowerCase() === d.name.toLowerCase() && (!t || x.id !== t.id); });
            if (dup) { fieldError(form, 'name', 'A tier with this name already exists.'); ok = false; }
            if (d.annualDues == null || d.annualDues < 0) { fieldError(form, 'annualDues', 'Dues cannot be negative.'); ok = false; }
            if (d.monthlyMinimum == null || d.monthlyMinimum < 0) { fieldError(form, 'monthlyMinimum', 'The minimum cannot be negative.'); ok = false; }
            if (!ok) { focusFirstError(form); return false; }
            const doc = { name: d.name, annualDues: Math.round(d.annualDues), monthlyMinimum: Math.round(d.monthlyMinimum), golf: !!d.golf, description: d.description };
            if (isNew) {
              let base = 'tier_' + d.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'tier_custom';
              let id = base, n = 2;
              while (S.find('membershipTiers', id)) id = base + '_' + n++;
              /* Undo removes the new tier, unless a member or application has been put on it since */
              undoable(function () { S.insert('membershipTiers', Object.assign({ id: id, color: 'parchment' }, doc)); }, d.name + ' tier added', d.name + ' tier removed', null, function () {
                return all('members').some(function (x) { return x.tierId === id; }) || all('applications').some(function (x) { return x.proposedTierId === id; }) ? d.name + ' is in use now, so it can no longer be removed here.' : '';
              });
            } else {
              undoable(function () { S.update('membershipTiers', t.id, doc); }, d.name + ' tier saved', t.name + ' tier restored');
            }
          }
        }
      ]
    });
    /* A live line under annual dues: what it comes to each month, and how many members it applies to. */
    const form = U.$('form', m.body), dues = form && U.$('[name=annualDues]', form);
    if (dues) {
      const used = t ? all('members').filter(function (x) { return x.tierId === t.id && x.status !== 'resigned'; }).length : 0;
      const line = U.el('<p class="st-dues-live" aria-live="polite"></p>');
      dues.closest('.field').appendChild(line);
      const upd = function () { const v = num(dues.value); line.textContent = (v > 0 ? 'About ' + F.money0(v / 12) + ' a month' : 'No annual dues') + (used ? ' · ' + used + ' current ' + plural(used, 'member') + ' on this tier' : ''); };
      dues.addEventListener('input', upd); upd();
    }
    return m;
  }
  function billingTab(panel) {
    function draw() {
      const rate = Club.taxRate();
      const tiers = all('membershipTiers');
      const members = all('members');
      const count = {}; members.forEach(function (m) { if (m.status !== 'resigned') count[m.tierId] = (count[m.tierId] || 0) + 1; });
      const anyUse = {}; members.forEach(function (m) { anyUse[m.tierId] = (anyUse[m.tierId] || 0) + 1; });
      const duesRoll = tiers.reduce(function (a, t) { return a + num(t.annualDues) * (count[t.id] || 0); }, 0);
      panel.innerHTML = '<div class="grid grid-main-side st-grid">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Membership tiers</div><h3>Dues and privileges</h3></div>' + U.btn('Add tier', { kind: 'primary', icon: 'plus', sm: true, action: 'add-tier' }) + '</div>' +
        '<div class="panel-body flush">' + (tiers.length ? '<div class="table-wrap"><table class="table st-tiers"><thead><tr><th>Tier</th><th class="num">Annual dues</th><th class="num">F&amp;B min.</th><th>Golf</th><th class="num">Members</th><th></th></tr></thead><tbody>' +
        tiers.map(function (t) {
          const used = anyUse[t.id] || 0;
          return '<tr class="clickable st-tier-row" data-tier="' + esc(t.id) + '"><td><div class="primary-cell">' + esc(t.name) + '</div>' + (t.description ? '<div class="muted st-desc" title="' + esc(t.description) + '">' + esc(t.description) + '</div>' : '') + '</td>' +
            '<td class="num">' + esc(F.money0(t.annualDues)) + '</td><td class="num">' + (num(t.monthlyMinimum) > 0 ? esc(F.money0(t.monthlyMinimum)) + '<span class="muted"> / mo</span>' : '<span class="muted">None</span>') + '</td>' +
            '<td>' + (t.golf ? U.badge('Included', 'good') : U.badge('By invitation', 'plain')) + '</td>' +
            '<td class="num">' + (count[t.id] || 0) + '</td>' +
            '<td class="nowrap right">' + U.btn('', { icon: 'edit', kind: 'ghost', sm: true, action: 'edit-tier', id: t.id, title: 'Edit ' + t.name }) +
            '<span class="st-del" ' + (used ? 'data-tip="In use by ' + used + ' ' + plural(used, 'member') + '"' : '') + '>' + U.btn('', { icon: 'trash', kind: 'ghost', sm: true, action: 'del-tier', id: t.id, title: used ? 'In use by ' + used + ' ' + plural(used, 'member') + ', cannot delete' : 'Delete ' + t.name }).replace('<button', used ? '<button disabled' : '<button') + '</span></td></tr>';
        }).join('') + '</tbody><tfoot><tr><td>Annual dues roll</td><td class="num">' + esc(F.money0(duesRoll)) + '</td><td colspan="4" class="muted st-foot-note">across ' + Object.keys(count).reduce(function (a, k) { return a + count[k]; }, 0) + ' current members</td></tr></tfoot></table></div>'
          : U.empty({ icon: 'members', title: 'No tiers defined', text: 'Add a membership tier to set dues and privileges.', action: U.btn('Add tier', { kind: 'primary', icon: 'plus', action: 'add-tier' }) })) +
        '</div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Taxes</div><h3>Sales tax, Manitoba</h3></div></div><div class="panel-body">' +
        '<form novalidate data-form="tax">' +
        U.field({ label: 'Combined sales tax rate (%)', name: 'rate', type: 'number', value: (Math.round(rate * 10000) / 100), required: true, min: 0, max: 20, step: 0.01, hint: 'GST 5% + PST 7% = 12%. Applied to pro shop and dining sales.' }) +
        '<div class="st-tax-example muted">A ' + esc(F.money(100)) + ' sale carries <strong data-tax-ex>' + esc(F.money(100 * rate)) + '</strong> tax.</div>' +
        U.btn('Save tax rate', { kind: 'primary', icon: 'check', action: 'save-tax' }) +
        '</form></div></section>' +
        '</div>';
      U.animateIn(panel);
    }
    draw();
    U.on(panel, 'input', '[name=rate]', function (e, f) { const ex = U.$('[data-tax-ex]', panel); if (ex) ex.textContent = F.money(num(f.value)); });
    U.on(panel, 'submit', 'form[data-form=tax]', function (e) { e.preventDefault(); saveTax(); });
    U.on(panel, 'click', '[data-action=save-tax]', saveTax);
    function saveTax() {
      const form = U.$('form[data-form=tax]', panel);
      if (!U.validate(form)) return;
      const v = U.formData(form).rate;
      if (v == null || isNaN(v) || v < 0 || v > 20) { fieldError(form, 'rate', 'Enter a rate between 0 and 20 percent.'); focusFirstError(form); return; }
      /* Undo only puts the rate back for sales from now on. Every sale, receipt and charge stores the tax it was
         charged, so nothing already recorded is rewritten, either way. */
      const was = Math.round(Club.taxRate() * 10000) / 100;
      undoable(function () { S.setObj('taxRate', Math.round(v * 100) / 10000); },
        'Sales tax set to ' + (Math.round(v * 100) / 100) + '% for new sales', 'Sales tax back to ' + was + '% for new sales. Sales already made keep their tax');
    }
    U.on(panel, 'click', '[data-action=add-tier]', function () { editTier(null); });
    U.on(panel, 'click', 'tr[data-tier]', function (e, tr) { if (e.target.closest('button, a, .st-del')) return; const t = S.find('membershipTiers', tr.dataset.tier); if (t) editTier(t); });
    U.on(panel, 'click', '[data-action=edit-tier]', function (e, b) { const t = S.find('membershipTiers', b.dataset.id); if (t) editTier(t); });
    U.on(panel, 'click', '[data-action=del-tier]', function (e, b) {
      const t = S.find('membershipTiers', b.dataset.id); if (!t) return;
      const used = all('members').filter(function (m) { return m.tierId === t.id; }).length;
      if (used) { U.toast(t.name + ' is in use by ' + used + ' ' + plural(used, 'member') + ' and cannot be deleted', 'bad'); return; }
      U.confirm({ title: 'Delete ' + t.name + '?', text: 'This tier has no members. It will be removed from the dues schedule.', confirmLabel: 'Delete tier', danger: true })
        .then(function (yes) { if (yes) undoable(function () { S.remove('membershipTiers', t.id); }, t.name + ' tier deleted', t.name + ' tier restored'); });
    });
    const unsubs = [S.subscribe('membershipTiers', draw), S.subscribe('members', draw), S.subscribe('$taxRate', draw)];
    return function () { unsubs.forEach(function (u) { u(); }); };
  }

  /* ---------------- Promotions (Club.promos, js/core/promos.js: collection promoCodes) ----------------
     Codes for public golfers' tee times and the online golf shop. Status: Off (turned off), Scheduled (starts later),
     Expired (ended, or reached its limit), else Active. A code that has been used is never deleted: turn it off. */
  const PROMO_COLL = 'promoCodes';
  const WEEK = [{ v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' }];
  const APPLIES = [{ v: 'greenFee', l: 'Green fees' }, { v: 'cart', l: 'Power carts' }, { v: 'addon', l: 'Add-ons (rental clubs and extras)' }, { v: 'shop', l: 'Online golf shop' }];
  const PSTATUS = { active: ['Active', 'good'], scheduled: ['Scheduled', 'info'], expired: ['Expired', 'plain'], off: ['Off', 'outline'] };
  function P() { return Club.promos || null; }
  function promoStatus(p) {
    const t = D.today();
    if (!p.active) return 'off';
    if (p.endsOn && t > p.endsOn) return 'expired';
    if (p.maxUses != null && P().usedCount(p) >= +p.maxUses) return 'expired';
    if (p.startsOn && t < p.startsOn) return 'scheduled';
    return 'active';
  }
  function promoStatusLabel(p) {
    const s = promoStatus(p);
    if (s === 'expired' && !(p.endsOn && D.today() > p.endsOn)) return 'Limit reached';
    return PSTATUS[s][0];
  }
  function promoWhen(p) {
    const dates = p.startsOn && p.endsOn ? F.dateShort(p.startsOn) + ' to ' + F.dateShort(p.endsOn) : p.startsOn ? 'From ' + F.dateShort(p.startsOn) : p.endsOn ? 'Until ' + F.dateShort(p.endsOn) : 'No end date';
    const days = Array.isArray(p.days) && p.days.length && p.days.length < 7 ? WEEK.filter(function (d) { return p.days.indexOf(d.v) >= 0; }).map(function (d) { return d.l; }).join(', ') : '';
    const times = p.timeFrom && p.timeTo ? F.time(p.timeFrom) + ' to ' + F.time(p.timeTo) : p.timeFrom ? 'from ' + F.time(p.timeFrom) : p.timeTo ? 'before ' + F.time(p.timeTo) : '';
    return [dates, days, times].filter(Boolean).join(' · ');
  }
  function timeOpts(sel) {
    const out = [{ value: '', label: 'Any time' }];
    for (let m = 6 * 60; m <= 21 * 60; m += 30) { const v = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); out.push({ value: v, label: F.time(v) }); }
    if (sel && !out.some(function (o) { return o.value === sel; })) out.push({ value: sel, label: F.time(sel) });
    return U.options(out, sel || '');
  }
  function uniqueCode(base) {
    let c = P().normalize(base).slice(0, 14) || 'PROMO', n = 2, out = c;
    while (P().find(out)) out = c.slice(0, 14) + n++;
    return out;
  }
  function promoForm(p, used) {
    p = p || {};
    const kind = p.kind === 'amount' ? 'amount' : 'percent';
    const applies = p.appliesTo || ['greenFee'];
    const days = Array.isArray(p.days) ? p.days : [];
    return '<form class="st-promo-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="st-pc-code">Code *</label><input class="input st-code-in" id="st-pc-code" name="code" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="FALL20" value="' + esc(p.code || '') + '"' + (used ? ' readonly aria-readonly="true"' : '') + '>' +
          '<span class="field-hint">' + (used ? 'This code has been used, so it cannot be renamed. Duplicate it to make a new code.' : '3 to 16 letters and numbers. Golfers type it at checkout.') + '</span></div>' +
        U.field({ label: 'Staff note', name: 'description', value: p.description || '', placeholder: 'What it is for. Only staff see this.' }) +
        '<div class="field"><label id="st-pc-kind-l">Discount *</label>' + U.segmented([{ value: 'percent', label: 'Percent off' }, { value: 'amount', label: 'Dollars off' }], kind, 'pkind') +
          '<input type="hidden" name="kind" value="' + kind + '"></div>' +
        '<div class="field"><label for="st-pc-value" data-value-label>' + (kind === 'percent' ? 'Percent *' : 'Dollars *') + '</label><input class="input" id="st-pc-value" name="value" type="number" min="' + (kind === 'percent' ? 1 : 0.01) + '" max="' + (kind === 'percent' ? 100 : 1000) + '" step="' + (kind === 'percent' ? 1 : 0.01) + '" inputmode="decimal" value="' + esc(p.value == null ? '' : p.value) + '"><span class="field-hint" data-value-hint>' + (kind === 'percent' ? 'From 1 to 100.' : 'Taken off the eligible items, never more than they cost.') + '</span></div>' +
        '<fieldset class="field span-2 st-fs"><legend>Applies to *</legend><div class="st-checks" data-group="appliesTo">' + APPLIES.map(function (a) {
          return '<label class="check"><input type="checkbox" name="ap_' + a.v + '"' + (applies.indexOf(a.v) >= 0 ? ' checked' : '') + '> ' + esc(a.l) + '</label>';
        }).join('') + '</div><span class="field-hint">Tee time codes work for public golfers booking online and for members booking in the portal. A member\u2019s own golf is covered by dues, so for members a code only reduces what they pay for: guest green fees, carts and add-ons.</span></fieldset>' +
        U.field({ label: 'Starts on', name: 'startsOn', type: 'date', value: p.startsOn || '' }) +
        U.field({ label: 'Ends on', name: 'endsOn', type: 'date', value: p.endsOn || '', hint: 'Inclusive. Leave blank for no end date.' }) +
        '<fieldset class="field span-2 st-fs"><legend>Days of play</legend><div class="st-days">' + WEEK.map(function (d) {
          return '<label class="st-day"><input type="checkbox" name="day_' + d.v + '"' + (days.indexOf(d.v) >= 0 ? ' checked' : '') + '><span>' + d.l + '</span></label>';
        }).join('') + '</div><span class="field-hint">The tee time\'s day. None ticked means any day. Ignored in the online shop.</span></fieldset>' +
        U.field({ label: 'Tee times from', name: 'timeFrom', type: 'select', options: timeOpts(p.timeFrom) }) +
        U.field({ label: 'Tee times before', name: 'timeTo', type: 'select', options: timeOpts(p.timeTo) }) +
        U.field({ label: 'Minimum spend', name: 'minTotal', type: 'number', value: p.minTotal == null ? '' : p.minTotal, min: 0, step: 0.01, placeholder: 'None', hint: 'Eligible items must add up to at least this.' }) +
        U.field({ label: 'Total uses allowed', name: 'maxUses', type: 'number', value: p.maxUses == null ? '' : p.maxUses, min: 1, step: 1, placeholder: 'No limit' }) +
        U.field({ label: 'Uses per golfer', name: 'maxPerCustomer', type: 'number', value: p.maxPerCustomer == null ? '' : p.maxPerCustomer, min: 1, step: 1, placeholder: 'No limit' }) +
        '<div class="field"><label class="st-toggle-row"><span class="toggle"><input type="checkbox" name="active"' + (p.active !== false ? ' checked' : '') + '><span></span></span><span><strong>On</strong><span class="field-hint st-block">Turn off to stop the code being accepted.</span></span></label></div>' +
      '</div>' +
      '<p class="st-promo-preview" aria-live="polite"></p>' +
    '</form>';
  }
  function readPromo(form, p) {
    clearErrors(form);
    const d = U.formData(form);
    const code = P().normalize(d.code);
    let ok = true;
    const err = function (name, msg) { fieldError(form, name, msg); ok = false; };
    if (!code) err('code', 'Enter a code.');
    else if (code.length < 3 || code.length > 16) err('code', 'Use 3 to 16 letters and numbers.');
    else { const other = P().find(code); if (other && (!p || other.id !== p.id)) err('code', 'Another promotion already uses ' + code + '.'); }
    const kind = d.kind === 'amount' ? 'amount' : 'percent';
    if (d.value == null || isNaN(d.value)) err('value', kind === 'percent' ? 'Enter a percent from 1 to 100.' : 'Enter the dollars off.');
    else if (kind === 'percent' && (d.value < 1 || d.value > 100 || d.value % 1)) err('value', 'Use a whole percent from 1 to 100.');
    else if (kind === 'amount' && (d.value <= 0 || d.value > 1000)) err('value', 'Enter an amount between $0.01 and $1,000.');
    const appliesTo = APPLIES.filter(function (a) { return d['ap_' + a.v]; }).map(function (a) { return a.v; });
    if (!appliesTo.length) { const g = U.$('[data-group=appliesTo]', form); g.classList.add('invalid'); g.insertAdjacentHTML('afterend', '<span class="field-error">Choose at least one thing the code takes money off.</span>'); ok = false; }
    if (d.startsOn && !/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn)) err('startsOn', 'Choose a valid date.');
    if (d.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(d.endsOn)) err('endsOn', 'Choose a valid date.');
    else if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) err('endsOn', 'The end date must be on or after the start date.');
    if (d.timeFrom && d.timeTo && d.timeTo <= d.timeFrom) err('timeTo', 'Choose a time after ' + F.time(d.timeFrom) + '.');
    if (d.minTotal != null && (d.minTotal < 0 || d.minTotal > 10000)) err('minTotal', 'Enter an amount of $0 or more, or leave it blank.');
    const used = p ? P().usedCount(p) : 0;
    if (d.maxUses != null && (d.maxUses < 1 || d.maxUses % 1)) err('maxUses', 'Use a whole number of 1 or more, or leave it blank.');
    else if (d.maxUses != null && d.maxUses < used) err('maxUses', 'It has already been used ' + used + ' times.');
    if (d.maxPerCustomer != null && (d.maxPerCustomer < 1 || d.maxPerCustomer % 1)) err('maxPerCustomer', 'Use a whole number of 1 or more, or leave it blank.');
    if (!ok) { focusFirstError(form); return null; }
    const days = WEEK.filter(function (w) { return d['day_' + w.v]; }).map(function (w) { return w.v; }).sort();
    return { code: code, description: d.description || '', kind: kind, value: kind === 'percent' ? Math.round(d.value) : Math.round(d.value * 100) / 100, appliesTo: appliesTo,
      startsOn: d.startsOn || null, endsOn: d.endsOn || null, days: days.length && days.length < 7 ? days : null, timeFrom: d.timeFrom || null, timeTo: d.timeTo || null,
      minTotal: d.minTotal != null ? Math.round(d.minTotal * 100) / 100 : null, maxUses: d.maxUses != null ? d.maxUses : null, maxPerCustomer: d.maxPerCustomer != null ? d.maxPerCustomer : null, active: !!d.active };
  }
  /** Create (p null), edit (p) or duplicate (copy) a promotion. */
  function editPromo(p, copy) {
    const used = p && !copy ? P().usedCount(p) > 0 || (p.uses || []).length > 0 : false;
    const start = copy ? Object.assign({}, copy, { code: uniqueCode(copy.code), active: true }) : p;
    const m = U.modal({ title: copy ? 'Duplicate ' + copy.code : p ? 'Edit ' + p.code : 'New promo code', eyebrow: 'Promotions', size: 'lg', body: promoForm(start, used), actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: p && !copy ? 'Save promotion' : 'Create promotion', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = U.$('form', api.body);
        const doc = readPromo(form, copy ? null : p); if (!doc) return false;
        /* Undo is refused once a golfer has used the code (its record changes) */
        if (p && !copy) { const was = p.code; undoable(function () { S.update(PROMO_COLL, p.id, doc); }, doc.code + ' saved', was + ' restored to how it was'); }
        else undoable(function () { S.insert(PROMO_COLL, Object.assign({ id: S.uid('promo'), createdAt: new Date().toISOString(), createdBy: null, createdByName: Club.user ? Club.user.firstName + ' ' + Club.user.lastName : null, uses: [] }, doc)); }, doc.code + ' created', doc.code + ' removed');
      } }
    ] });
    if (m.duplicate) return;
    m.el.classList.add('st-promo-modal');
    const form = U.$('form', m.body);
    function preview() {
      const d = U.formData(form);
      const v = d.value;
      const appliesTo = APPLIES.filter(function (a) { return d['ap_' + a.v]; }).map(function (a) { return a.v; });
      const out = U.$('.st-promo-preview', form);
      if (!(v > 0) || !appliesTo.length) { out.textContent = ''; return; }
      out.innerHTML = Club.icon('tag') + '<span>Golfers see: <strong>' + esc(P().normalize(d.code) || 'CODE') + '</strong>, ' + esc(P().describe({ kind: d.kind, value: v, appliesTo: appliesTo })) + '</span>';
    }
    U.on(form, 'click', '.segmented[data-name=pkind] button', function (e, b) {
      U.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); });
      form.kind.value = b.dataset.value;
      const pct = b.dataset.value === 'percent', inp = form.value;
      inp.min = pct ? 1 : 0.01; inp.max = pct ? 100 : 1000; inp.step = pct ? 1 : 0.01;
      U.$('[data-value-label]', form).textContent = pct ? 'Percent *' : 'Dollars *';
      U.$('[data-value-hint]', form).textContent = pct ? 'From 1 to 100.' : 'Taken off the eligible items, never more than they cost.';
      preview();
    });
    form.addEventListener('input', function (e) {
      if (e.target.name === 'code' && !e.target.readOnly) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const f = e.target.closest('.field'); if (f) { U.$$('.field-error', f).forEach(function (x) { x.remove(); }); U.$$('.invalid', f).forEach(function (x) { x.classList.remove('invalid'); }); e.target.classList.remove('invalid'); }
      preview();
    });
    form.addEventListener('change', preview);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    preview();
    if (!used) setTimeout(function () { form.code.focus(); form.code.select(); }, 80);
  }
  function whoUsed(u) {
    if (u.memberId) return Club.members.name(u.memberId);
    const pp = u.publicPlayerId ? S.find('publicPlayers', u.publicPlayerId) : null;
    return pp ? pp.firstName + ' ' + pp.lastName : 'Public golfer';
  }
  function togglePromo(id, on) {
    const x = S.find(PROMO_COLL, id); if (!x) return;
    undoable(function () { S.update(PROMO_COLL, x.id, { active: !!on }); },
      x.code + (on ? ' turned on. Golfers can use it again' : ' turned off. Golfers can no longer use it'),
      x.code + (on ? ' is off again' : ' is on again. Golfers can use it'));
  }
  function promoDetail(p) {
    const uses = (p.uses || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    const st = promoStatus(p);
    const d = U.drawer({ eyebrow: 'Promo code', title: p.code, body:
      '<div class="st-promo-d">' +
        '<p>' + U.badge(promoStatusLabel(p), PSTATUS[st][1]) + ' <span class="ink-2">' + esc(P().describe(p)) + '</span></p>' +
        (p.description ? '<p class="muted">' + esc(p.description) + '</p>' : '') +
        '<dl class="kv"><dt>Valid</dt><dd>' + esc(promoWhen(p)) + '</dd>' +
          '<dt>Minimum spend</dt><dd>' + (p.minTotal != null ? esc(F.money(p.minTotal)) : 'None') + '</dd>' +
          '<dt>Uses</dt><dd>' + P().usedCount(p) + (p.maxUses != null ? ' of ' + p.maxUses : '') + (p.maxPerCustomer != null ? ' · ' + p.maxPerCustomer + ' per golfer' : '') + '</dd>' +
          '<dt>Given away</dt><dd>' + esc(F.money(P().givenAway(p))) + '</dd>' +
          '<dt>Created</dt><dd>' + (p.createdAt ? esc(F.date(String(p.createdAt).slice(0, 10))) : 'Unknown') + (p.createdByName ? ' by ' + esc(p.createdByName) : '') + '</dd></dl>' +
        '<h4 class="st-sub">Uses</h4>' +
        (uses.length ? '<ul class="list st-uses">' + uses.map(function (u) {
          return '<li><div class="st-use-main"><span>' + esc(whoUsed(u)) + '</span><span class="muted">' + esc(F.date(String(u.at).slice(0, 10))) + ' · ' + (u.source === 'shop' ? 'Online golf shop' : 'Tee time booked online') + (u.status === 'released' ? ' · given back after a refund' : '') + '</span></div>' +
            '<span class="num' + (u.status === 'released' ? ' st-released' : '') + '">' + esc(F.money(u.discount)) + '</span></li>';
        }).join('') + '</ul>' : U.empty({ icon: 'tag', title: 'Not used yet', text: 'Each use is listed here with the golfer and the discount.' })) +
      '</div>',
      actions: [{ label: 'Close', kind: 'ghost' },
        { label: 'Duplicate', kind: 'ghost', onClick: function () { editPromo(null, S.find(PROMO_COLL, p.id)); } },
        { label: p.active ? 'Turn off' : 'Turn on', kind: 'ghost', onClick: function () { const x = S.find(PROMO_COLL, p.id); if (x) togglePromo(x.id, !x.active); } },
        { label: 'Edit', kind: 'primary', icon: 'edit', onClick: function () { editPromo(S.find(PROMO_COLL, p.id)); } }] });
    return d;
  }
  function promosTab(panel) {
    const st = { filter: 'all', q: '' };
    if (!P()) { panel.innerHTML = '<section class="panel">' + U.empty({ icon: 'tag', title: 'Promotions are not available', text: 'The promotions engine did not load. Refresh the page.' }) + '</section>'; return; }
    panel.innerHTML = '<div class="st-promos"><div class="st-promo-stats"></div>' +
      '<section class="panel" data-reveal><div class="panel-head st-promo-head"><div><div class="eyebrow">Promotions</div><h3>Promo codes</h3></div>' +
        '<div class="st-promo-tools"><label class="st-search">' + Club.icon('search') + '<input class="input" type="search" placeholder="Find a code" aria-label="Find a promo code"></label>' +
        U.segmented([{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'expired', label: 'Expired' }, { value: 'off', label: 'Off' }], 'all', 'pfilter') +
        U.btn('New promo code', { kind: 'primary', icon: 'plus', sm: true, action: 'promo-new' }) + '</div></div>' +
      '<div class="panel-body flush st-promo-list"></div></section>' +
      '<p class="muted st-promo-note">Promo codes are for public golfers booking tee times online and for the online golf shop. Members get no promo codes. A code that has been used cannot be deleted: turn it off instead.</p></div>';
    function draw() {
      const all = P().all().slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
      const counts = { active: 0, scheduled: 0, expired: 0, off: 0 };
      all.forEach(function (p) { counts[promoStatus(p)]++; });
      const uses = all.reduce(function (a, p) { return a + P().usedCount(p); }, 0), given = all.reduce(function (a, p) { return a + P().givenAway(p); }, 0);
      U.$('.st-promo-stats', panel).innerHTML = U.stats([
        { label: 'Active codes', value: counts.active, meta: counts.scheduled ? counts.scheduled + ' scheduled' : 'None scheduled' },
        { label: 'Times used', value: uses, meta: 'Refunded uses are given back' },
        { label: 'Given away', value: Math.round(given * 100) / 100, prefix: '$', decimals: 2, meta: 'Discounts on used codes' }
      ]);
      U.$$('.st-promo-stats [data-count]', panel).forEach(function (n) { n.setAttribute('data-counted', ''); n.textContent = (n.dataset.prefix || '') + Number(n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: +n.dataset.decimals || 0, maximumFractionDigits: +n.dataset.decimals || 0 }); });
      const list = all.filter(function (p) { return (st.filter === 'all' || promoStatus(p) === st.filter) && (!st.q || p.code.indexOf(st.q.toUpperCase()) >= 0 || String(p.description || '').toLowerCase().indexOf(st.q.toLowerCase()) >= 0); });
      const host = U.$('.st-promo-list', panel);
      if (!all.length) { host.innerHTML = U.empty({ icon: 'tag', title: 'No promo codes yet', text: 'Create a code to offer public golfers money off green fees, carts or add-ons, or online shop orders.', action: U.btn('New promo code', { kind: 'primary', icon: 'plus', action: 'promo-new' }) }); return; }
      if (!list.length) { host.innerHTML = U.empty({ icon: 'search', title: 'No codes match', text: st.q ? 'No promo code matches "' + st.q + '".' : 'No codes are ' + st.filter + ' right now.', action: U.btn('Show all codes', { sm: true, action: 'promo-all' }) }); return; }
      host.innerHTML = '<div class="table-wrap"><table class="table st-promos-t"><thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Status</th><th class="num">Uses</th><th>On</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
        list.map(function (p) {
          const s = promoStatus(p), n = P().usedCount(p), ever = (p.uses || []).length;
          return '<tr class="clickable" data-promo="' + esc(p.id) + '"><td><div class="primary-cell st-code">' + esc(p.code) + '</div>' + (p.description ? '<div class="muted st-desc" title="' + esc(p.description) + '">' + esc(p.description) + '</div>' : '') + '</td>' +
            '<td>' + esc(P().describe(p)) + (p.minTotal != null ? '<div class="muted st-desc">Minimum ' + esc(F.money(p.minTotal)) + '</div>' : '') + '</td>' +
            '<td class="st-when">' + esc(promoWhen(p)) + '</td>' +
            '<td>' + U.badge(promoStatusLabel(p), PSTATUS[s][1]) + '</td>' +
            '<td class="num st-uses-c"><span>' + n + (p.maxUses != null ? '<span class="muted"> of ' + p.maxUses + '</span>' : '') + '</span><span class="st-given">' + esc(F.money(P().givenAway(p)) + ' given') + '</span></td>' +
            '<td><label class="toggle st-row-toggle" title="' + esc((p.active ? 'Turn off ' : 'Turn on ') + p.code) + '"><input type="checkbox" data-action="promo-toggle" data-id="' + esc(p.id) + '"' + (p.active ? ' checked' : '') + ' aria-label="' + esc(p.code + ' on') + '"><span></span></label></td>' +
            '<td class="nowrap right st-row-acts">' + U.btn('', { icon: 'edit', kind: 'ghost', sm: true, action: 'promo-edit', id: p.id, title: 'Edit ' + p.code }) +
              U.btn('Duplicate', { kind: 'ghost', sm: true, action: 'promo-dup', id: p.id, title: 'Duplicate ' + p.code }) +
              (ever ? '' : U.btn('', { icon: 'trash', kind: 'ghost', sm: true, action: 'promo-del', id: p.id, title: 'Delete ' + p.code })) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    draw();
    U.on(panel, 'click', '.segmented[data-name=pfilter] button', function (e, b) { U.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); st.filter = b.dataset.value; draw(); });
    U.on(panel, 'input', '.st-search input', function (e, i) { st.q = i.value.trim(); draw(); });
    U.on(panel, 'click', '[data-action=promo-all]', function () { st.filter = 'all'; st.q = ''; U.$('.st-search input', panel).value = ''; U.$$('.segmented[data-name=pfilter] button', panel).forEach(function (x) { x.classList.toggle('active', x.dataset.value === 'all'); }); draw(); });
    U.on(panel, 'click', '[data-action=promo-new]', function () { editPromo(null); });
    U.on(panel, 'click', 'tr[data-promo]', function (e, tr) { if (e.target.closest('button, a, label, input')) return; const p = S.find(PROMO_COLL, tr.dataset.promo); if (p) promoDetail(p); });
    U.on(panel, 'click', '[data-action=promo-edit]', function (e, b) { const p = S.find(PROMO_COLL, b.dataset.id); if (p) editPromo(p); });
    U.on(panel, 'click', '[data-action=promo-dup]', function (e, b) { const p = S.find(PROMO_COLL, b.dataset.id); if (p) editPromo(null, p); });
    U.on(panel, 'change', '[data-action=promo-toggle]', function (e, box) {
      const p = S.find(PROMO_COLL, box.dataset.id); if (p) togglePromo(p.id, box.checked);
    });
    U.on(panel, 'click', '[data-action=promo-del]', function (e, b) {
      const p = S.find(PROMO_COLL, b.dataset.id); if (!p) return;
      if ((p.uses || []).length) { U.toast(p.code + ' has been used, so it cannot be deleted. Turn it off instead', 'bad'); return; }
      U.confirm({ title: 'Delete ' + p.code + '?', text: 'It has never been used. It will be removed and golfers will no longer be able to enter it.', confirmLabel: 'Delete code', danger: true })
        .then(function (yes) { if (yes) undoable(function () { S.remove(PROMO_COLL, p.id); }, p.code + ' deleted', p.code + ' restored'); });
    });
    const unsub = S.subscribe(PROMO_COLL, draw);
    return function () { unsub(); };
  }

  /* ---------------- Add-ons (Club.addons, js/core/addons.js: collection bookingAddons) ----------------
     Rental clubs, a pull cart, a sleeve of balls: offered when booking (public site and members' portal). Prices are
     placeholders until staff save them. Add-ons are turned off rather than deleted (bookings keep their names and prices). */
  function addonForm(a) {
    a = a || {};
    return '<form class="form-grid" novalidate>' +
      U.field({ label: 'Name', name: 'name', value: a.name || '', required: true, span2: true, placeholder: 'For example, Rental clubs' }) +
      U.field({ label: 'Price, 18 holes', name: 'price', type: 'number', value: a.price == null ? '' : a.price, required: true, min: 0, step: 0.01, hint: 'Canadian dollars, tax included.' }) +
      U.field({ label: 'Price, 9 holes', name: 'price9', type: 'number', value: a.price9 == null ? '' : a.price9, min: 0, step: 0.01, placeholder: 'Same as 18 holes' }) +
      '<div class="field span-2"><label>Charged</label>' + U.segmented([{ value: 'player', label: 'Per player' }, { value: 'booking', label: 'Per booking, by quantity' }], a.per === 'booking' ? 'booking' : 'player', 'aper') +
        '<input type="hidden" name="per" value="' + (a.per === 'booking' ? 'booking' : 'player') + '"></div>' +
      '<div class="field span-2"><label class="st-toggle-row"><span class="toggle"><input type="checkbox" name="memberOk"' + (a.memberOk !== false ? ' checked' : '') + '><span></span></span><span><strong>Members can choose it</strong><span class="field-hint st-block">Members are charged on account at check-in. Members get a pull cart with their membership, so Pull cart is for public golfers only.</span></span></label></div>' +
      '<div class="field span-2"><label class="st-toggle-row"><span class="toggle"><input type="checkbox" name="active"' + (a.active !== false ? ' checked' : '') + '><span></span></span><span><strong>Offered when booking</strong><span class="field-hint st-block">Turn off to stop offering it. Bookings that already have it keep it.</span></span></label></div>' +
      (a.placeholder ? '<p class="span-2 st-ph-note">' + Club.icon('alert') + '<span>The price is a placeholder. Saving confirms these as the club\'s real prices.</span></p>' : '') +
    '</form>';
  }
  function editAddon(a) {
    const A = Club.addons;
    const m = U.modal({ title: a ? 'Edit ' + a.name : 'New add-on', eyebrow: 'Add-ons', body: addonForm(a), actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: a ? 'Save add-on' : 'Add add-on', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = U.$('form', api.body);
        clearErrors(form);
        if (!U.validate(form)) return false;
        const d = U.formData(form);
        let ok = true;
        const name = String(d.name || '').replace(/\s+/g, ' ').trim();
        if (name.length > 40) { fieldError(form, 'name', 'Keep the name to 40 characters.'); ok = false; }
        if (A.all().some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!a || x.id !== a.id); })) { fieldError(form, 'name', 'Another add-on has this name.'); ok = false; }
        if (d.price == null || d.price < 0 || d.price > 1000) { fieldError(form, 'price', 'Enter a price from $0 to $1,000.'); ok = false; }
        if (d.price9 != null && (d.price9 < 0 || (d.price != null && d.price9 > d.price))) { fieldError(form, 'price9', 'The 9-hole price must be $0 or more, and not more than the 18-hole price.'); ok = false; }
        if (!ok) { focusFirstError(form); return false; }
        const doc = { name: name, price: Math.round(d.price * 100) / 100, price9: d.price9 == null ? null : Math.round(d.price9 * 100) / 100, per: d.per === 'booking' ? 'booking' : 'player', memberOk: !!d.memberOk, active: !!d.active, placeholder: false };
        if (a) doc.id = a.id;
        /* Bookings keep each add-on's name and price, so undoing a new one never changes a booking */
        undoable(function () { A.save(doc); }, name + (a ? ' saved' : ' added'), a ? a.name + ' restored to how it was' : name + ' removed');
      } }
    ] });
    if (m.duplicate) return;
    const form = U.$('form', m.body);
    U.on(form, 'click', '.segmented[data-name=aper] button', function (e, b) { U.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); form.per.value = b.dataset.value; });
  }
  function addonsTab(panel) {
    const A = Club.addons;
    if (!A) { panel.innerHTML = '<section class="panel">' + U.empty({ icon: 'box', title: 'Add-ons are not available', text: 'The add-ons list did not load. Refresh the page.' }) + '</section>'; return; }
    function draw() {
      const list = A.all();
      const ph = list.filter(function (a) { return a.placeholder; }).length;
      panel.innerHTML = '<div class="grid grid-main-side st-grid">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Booking extras</div><h3>Add-ons</h3></div>' + U.btn('New add-on', { kind: 'primary', icon: 'plus', sm: true, action: 'addon-new' }) + '</div>' +
        '<div class="panel-body flush">' + (list.length ? '<div class="table-wrap"><table class="table st-addons"><thead><tr><th>Add-on</th><th class="num">18 holes</th><th class="num">9 holes</th><th>Charged</th><th>Members</th><th>Offered</th><th><span class="sr-only">Edit</span></th></tr></thead><tbody>' +
          list.map(function (a) {
            return '<tr class="clickable" data-addon="' + esc(a.id) + '"><td><div class="primary-cell">' + esc(a.name) + '</div>' + (a.placeholder ? U.badge('Placeholder price', 'warn') : '') + '</td>' +
              '<td class="num">' + esc(F.money(a.price)) + '</td><td class="num">' + (a.price9 == null ? '<span class="muted">Same</span>' : esc(F.money(a.price9))) + '</td>' +
              '<td>' + (a.per === 'booking' ? 'Per booking' : 'Per player') + '</td>' +
              '<td>' + (a.memberOk ? U.badge('Yes', 'good') : U.badge('Public only', 'plain')) + '</td>' +
              '<td><label class="toggle st-row-toggle" title="' + esc((a.active ? 'Stop offering ' : 'Offer ') + a.name) + '"><input type="checkbox" data-action="addon-toggle" data-id="' + esc(a.id) + '"' + (a.active ? ' checked' : '') + ' aria-label="' + esc('Offer ' + a.name + ' when booking') + '"><span></span></label></td>' +
              '<td class="nowrap right">' + U.btn('', { icon: 'edit', kind: 'ghost', sm: true, action: 'addon-edit', id: a.id, title: 'Edit ' + a.name }) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : U.empty({ icon: 'box', title: 'No add-ons', text: 'Add rental clubs or other extras golfers can pick when they book.', action: U.btn('New add-on', { kind: 'primary', icon: 'plus', action: 'addon-new' }) })) +
        '</div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">How they work</div><h3>Charging for add-ons</h3></div></div><div class="panel-body st-addon-how">' +
          (ph ? '<p class="st-ph-note">' + Club.icon('alert') + '<span>' + ph + ' ' + plural(ph, 'price is a placeholder', 'prices are placeholders') + '. Set the club\'s real prices before going live.</span></p>' : '') +
          '<ul class="st-bullets"><li>Public golfers pay for add-ons online with their green fees, and promo codes can include them.</li>' +
          '<li>Members pick add-ons in the members\' portal. They post to the member\'s account at check-in, like the cart fee.</li>' +
          '<li>Guests paying at the golf shop pay for theirs with their green fee.</li></ul></div></section>' +
        '</div>';
      U.animateIn(panel);
    }
    draw();
    U.on(panel, 'click', '[data-action=addon-new]', function () { editAddon(null); });
    U.on(panel, 'click', '[data-action=addon-edit]', function (e, b) { const a = A.get(b.dataset.id); if (a) editAddon(a); });
    U.on(panel, 'click', 'tr[data-addon]', function (e, tr) { if (e.target.closest('button, a, label, input')) return; const a = A.get(tr.dataset.addon); if (a) editAddon(a); });
    U.on(panel, 'change', '[data-action=addon-toggle]', function (e, box) {
      const a = A.get(box.dataset.id); if (!a) return;
      const on = box.checked;
      undoable(function () { A.save({ id: a.id, active: on }); }, a.name + (on ? ' is offered when booking' : ' is no longer offered'), a.name + (on ? ' is off again' : ' is offered when booking again'));
    });
    const unsub = S.subscribe(A.COLL, draw);
    return function () { unsub(); };
  }

  /* ---------------- Data ---------------- */
  function bytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }
  function dataTab(panel) {
    let raw = '';
    /* Each collection is saved under STORE_KEY + ':' + name (Nov 12); older saves used one STORE_KEY blob. */
    /* onDisk: what each collection takes in storage (its compact saved form, js/core/store.js), so the sizes below add up to "used". */
    const onDisk = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === STORE_KEY || k.indexOf(STORE_KEY + ':') === 0) { const v = k + (localStorage.getItem(k) || ''); raw += v; if (k !== STORE_KEY) onDisk[k.slice(STORE_KEY.length + 1)] = v.length; } } } catch (e) { raw = ''; }
    let parsed = {};
    try { parsed = JSON.parse(S.exportJSON()) || {}; } catch (e) { parsed = {}; }
    const keys = Object.keys(parsed);
    const used = raw.length || JSON.stringify(parsed).length; // JSON is ASCII: one byte per character
    const quota = 5 * 1024 * 1024; // browsers allow about 5 MB per origin
    const pct = Math.min(100, used / quota * 100);
    const rows = keys.map(function (k) {
      const v = parsed[k];
      return { key: k, label: k.charAt(0) === '$' ? k.slice(1) : k, docs: Array.isArray(v) ? v.length : null, size: onDisk[k] != null ? onDisk[k] : JSON.stringify(v).length };
    }).sort(function (a, b) { return b.size - a.size; });
    const docs = rows.reduce(function (a, r) { return a + (r.docs || 0); }, 0);
    const maxSize = rows.length ? rows[0].size : 1;

    panel.innerHTML = '<div class="grid grid-2 st-grid">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Storage</div><h3>Usage in this browser</h3></div></div><div class="panel-body">' +
      '<div class="st-usage"><div class="stat-value"><span>' + esc(bytes(used)) + '</span></div><span class="muted">of about 5 MB available</span></div>' +
      '<div class="bar st-usage-bar' + (pct > 80 ? ' brass' : '') + '"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
      '<p class="muted st-usage-meta">' + F.num(docs) + ' records across ' + rows.length + ' collections and settings, stored locally on this device.</p>' +
      (rows.length ? Portal.accordion({ id: 'st-colls', icon: 'box', title: 'By collection', summary: rows.length + ' collections and settings · largest ' + rows[0].label + ' (' + bytes(rows[0].size) + ')',
        body: '<div class="table-wrap st-colls"><table class="table"><thead><tr><th>Collection</th><th class="num">Records</th><th class="num">Size</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td><span class="primary-cell">' + esc(r.label) + '</span><div class="bar st-mini"><span style="width:' + (r.size / maxSize * 100).toFixed(1) + '%"></span></div></td><td class="num">' + (r.docs == null ? '<span class="muted">setting</span>' : F.num(r.docs)) + '</td><td class="num">' + esc(bytes(r.size)) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' }) : U.empty({ icon: 'box', title: 'Nothing stored yet', text: 'Data appears here as modules seed and save records.' })) +
      '</div></section>' +
      '<div class="stack">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Backup</div><h3>Export all data</h3></div></div><div class="panel-body">' +
      '<p class="ink-2">Download every collection and setting as a single JSON file. Keep it as a backup or share it with the Controller or your IT partner.</p>' +
      U.btn('Export JSON', { kind: 'primary', icon: 'download', action: 'export' }) + '</div></section>' +
      '<section class="panel st-danger" data-reveal><div class="panel-head"><div><div class="eyebrow">Danger zone</div><h3>Reset demo data</h3></div></div><div class="panel-body">' +
      '<p class="ink-2">Erase all bookings, accounts, sales and settings in this browser and reload the original demonstration data. This cannot be undone.</p>' +
      U.btn('Reset demo data', { kind: 'danger', icon: 'refresh', action: 'reset' }) + '</div></section>' +
      '</div></div>';

    U.on(panel, 'click', '[data-action=export]', function () {
      download('stboniface-data-' + D.today() + '.json', S.exportJSON(), 'application/json');
      U.toast('Data exported');
    });
    U.on(panel, 'click', '[data-action=reset]', function () {
      U.confirm({ title: 'Reset all demo data?', text: 'Every change made in this browser will be erased and the original demonstration data restored. Export a backup first if you need one.', confirmLabel: 'Reset data', danger: true })
        .then(function (yes) { if (yes) { U.toast('Restoring demo data'); setTimeout(function () { S.reset(); }, 400); } });
    });
  }

  /* ---------------- Golf season ----------------
     Opening and closing day (owner, Nov 17), stored as 'golfSeason' and read through Club.season (js/core/ui.js).
     The same days apply every year; until the club saves its own, April 1 to October 31 stands in. */
  function seasonTab(panel) {
    const year = +D.today().slice(0, 4);
    function draw() {
      const g = Club.season.get();
      panel.innerHTML = '<div class="grid grid-main-side st-grid">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Golf season</div><h3>Opening and closing day</h3></div>' +
        (g.confirmed ? U.badge('Set by the club', 'good') : U.badge('Placeholder', 'brass')) + '</div><div class="panel-body">' +
        '<p class="ink-2 st-season-lead">' + (g.confirmed ? 'The course is open ' + esc(Club.season.dayLabel()) + ' each year.' :
          'These dates are placeholders until the club enters its own. Change them and save to set the season.') + '</p>' +
        '<form class="form-grid st-form" novalidate data-form="season">' +
        U.field({ label: 'Opening day', name: 'open', type: 'date', value: year + '-' + g.open, required: true, hint: 'The first day golf is played.' }) +
        U.field({ label: 'Closing day', name: 'close', type: 'date', value: year + '-' + g.close, required: true, hint: 'The last day golf is played.' }) +
        '<p class="muted span-2 st-season-note">Only the day and month are kept: the same dates are used every year. Update them each spring if they change.</p>' +
        '<div class="span-2 st-form-foot">' + U.btn('Save season', { kind: 'primary', icon: 'check', action: 'save-season' }) + '</div>' +
        '</form></div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Where it is used</div><h3>' + esc(Club.season.label()) + '</h3></div></div><div class="panel-body flush">' +
        '<ul class="list st-season-uses">' +
        [['lessons', 'lesson', 'Lesson packages', 'Packages set to "End of season" expire on the closing day.'],
         ['reports', 'reports', 'Reports', 'Golf season against winter, season-to-date figures and season estimates.'],
         ['events/league', 'trophy', "Members' league", 'New seasons start on these dates, and league nights must fall inside them.'],
         ['outings', 'flag', 'Group outings', 'Tournament dates must fall inside the season.']].map(function (u) {
          return '<li><a href="#/' + u[0] + '" class="st-mod"><span class="st-mod-icon">' + Club.icon(u[1]) + '</span><span class="st-mod-main"><span class="st-mod-name">' + esc(u[2]) + '</span><span class="muted">' + esc(u[3]) + '</span></span></a></li>';
        }).join('') + '</ul></div></section></div>';
      U.animateIn(panel);
    }
    draw();
    U.on(panel, 'submit', 'form[data-form=season]', function (e) { e.preventDefault(); save(); });
    U.on(panel, 'click', '[data-action=save-season]', save);
    function save() {
      const form = U.$('form[data-form=season]', panel);
      clearErrors(form);
      if (!U.validate(form)) return;
      const d = U.formData(form), open = String(d.open || '').slice(5, 10), close = String(d.close || '').slice(5, 10);
      if (!/^\d\d-\d\d$/.test(open)) { fieldError(form, 'open', 'Choose the opening day.'); focusFirstError(form); return; }
      if (!/^\d\d-\d\d$/.test(close)) { fieldError(form, 'close', 'Choose the closing day.'); focusFirstError(form); return; }
      if (close <= open) { fieldError(form, 'close', 'The closing day must come after the opening day in the same year.'); focusFirstError(form); return; }
      const was = Club.season.get();
      if (was.confirmed && was.open === open && was.close === close) { U.toast('No changes to save'); return; }
      undoable(function () { S.setObj('golfSeason', { open: open, close: close, confirmed: true }); },
        function () { return 'Golf season set: ' + Club.season.dayLabel(); },
        'Golf season back to ' + Club.season.dayLabel() + (was.confirmed ? '' : ' (placeholder)'), draw);
      draw();
    }
  }

  /* ---------------- About ---------------- */
  function aboutTab(panel) {
    const mods = Club.modules.slice().sort(function (a, b) {
      const sa = SECTIONS.indexOf(a.section), sb = SECTIONS.indexOf(b.section);
      return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || a.order - b.order;
    });
    panel.innerHTML = '<div class="grid grid-main-side st-grid">' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Installed modules</div><h3>' + mods.length + ' ' + plural(mods.length, 'module') + '</h3></div></div><div class="panel-body flush">' +
      '<ul class="list st-mods">' + mods.map(function (m) {
        return '<li><a href="#/' + esc(m.id) + '" class="st-mod">' + '<span class="st-mod-icon">' + Club.icon(m.icon || 'flag') + '</span><span class="st-mod-main"><span class="st-mod-name">' + esc(m.label) + '</span><span class="muted">#/' + esc(m.id) + '</span></span>' + U.badge(m.section || 'Overview', 'outline') + '</a></li>';
      }).join('') + '</ul></div></section>' +
      '<div class="stack">' +
      '<section class="panel" data-reveal><div class="panel-body st-about">' + Club.logoImg('st-crest') +
      '<div class="eyebrow">Club management system</div><h2>' + esc(Club.info.short) + ' Club Suite</h2><p class="st-ver">Version ' + VERSION + '</p><p class="muted">Built for ' + esc(Club.info.name) + ', ' + esc(Club.info.address) + '. ' + esc(Club.info.tagline || '') + '.</p>' +
      '<dl class="kv"><dt>Club</dt><dd>' + esc(Club.info.name) + '</dd><dt>Established</dt><dd>' + esc(Club.info.est) + '</dd><dt>Data</dt><dd>Stored in this browser</dd><dt>Sales tax</dt><dd>' + (Math.round(Club.taxRate() * 10000) / 100) + '%' + (Math.abs(Club.taxRate() - 0.12) < 0.0001 ? ' (GST 5% + PST 7%)' : '') + '</dd><dt>Currency</dt><dd>Canadian dollars</dd></dl></div></section>' +
      '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Keyboard</div><h3>Shortcuts</h3></div></div><div class="panel-body"><dl class="st-keys">' +
      '<div><dt><kbd>/</kbd></dt><dd>Focus the search bar from anywhere</dd></div>' +
      '<div><dt><kbd>&uarr;</kbd> <kbd>&darr;</kbd></dt><dd>Move through search results</dd></div>' +
      '<div><dt><kbd>Enter</kbd></dt><dd>Open the highlighted result</dd></div>' +
      '<div><dt><kbd>Esc</kbd></dt><dd>Close a dialog or clear the search</dd></div>' +
      '</dl></div></section></div></div>';
  }

  /* ---------------- Page ---------------- */
  const TABS = [
    { id: 'profile', label: 'Club profile', fn: profileTab },
    { id: 'season', label: 'Golf season', fn: seasonTab },
    { id: 'billing', label: 'Billing', fn: billingTab },
    /* Handbook: the members' handbook editor (js/modules/settings-handbook.js) */
    { id: 'handbook', label: 'Handbook', fn: function (panel) { return Club.handbookAdmin ? Club.handbookAdmin.tab(panel) : null; } },
    { id: 'data', label: 'Data', fn: dataTab },
    { id: 'about', label: 'About', fn: aboutTab }
  ];
  /* Promotions and Add-ons are run by the golf shop, so they live on the Pro Shop page (js/modules/proshop.js), which
     draws them with these two functions. Old links to #/settings/promotions and #/settings/addons go there. */
  Club.settingsTabs = { promotions: promosTab, addons: addonsTab };
  function render(view, params) {
    if (params[0] === 'promotions' || params[0] === 'addons') { setTimeout(function () { Club.app.go('proshop/' + params[0]); }, 0); return; }
    const initial = TABS.some(function (t) { return t.id === params[0]; }) ? params[0] : 'profile';
    view.innerHTML = '<div class="st-page">' + U.pageHeader({ eyebrow: 'Administration', title: 'Settings', subtitle: 'Club profile, golf season, dues schedule, taxes, the members’ handbook and data for ' + esc(Club.info.name) + '.' }) + '<div class="st-tabs"></div></div>';
    let tabCleanup = null;
    U.tabs(U.$('.st-tabs', view), TABS.map(function (t) {
      return { id: t.id, label: t.label, render: function (panel) { if (tabCleanup) { tabCleanup(); tabCleanup = null; } tabCleanup = t.fn(panel) || null; } };
    }), initial, function (id) {
      try { history.replaceState(null, '', '#/settings' + (id === 'profile' ? '' : '/' + id)); } catch (e) { /* ignore */ }
    });
    return function () { if (tabCleanup) tabCleanup(); };
  }

  Club.register({ id: 'settings', label: 'Settings', icon: 'settings', section: 'Administration', order: 30, render: render });
})();
