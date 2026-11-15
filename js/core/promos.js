/* Club.promos: promo codes for public tee times (green fees, carts, add-ons) and the online golf shop, on all three sites.
   Loaded after js/core/receipts.js and js/core/giftcards.js, before any module. Styles: css/promos.css.
   Staff manage codes in Pro Shop > Promotions (drawn by js/modules/settings.js). Members use codes in the portal's tee time booking
   (js/portal/teetimes.js, since Nov 10): a code reduces what posts to their account at check-in (a guest's green fee, cart
   fees, add-ons); their own golf is covered by dues, so a green-fee code with no guest gives nothing (noMatch explains).
   The portal records the use with source 'portal' (refId its publicPayments record) and memberId.

   Promo doc ('promoCodes'):
     { id ('promo_…'), code ('FALL20', A-Z 0-9 only, 3 to 16 characters, unique), description (staff note, shown to nobody else),
       kind: 'percent'|'amount', value (percent 1-100, or dollars CAD),
       appliesTo: ['greenFee', 'cart', 'addon', 'shop'] (line kinds the discount reduces; at least one),
       startsOn 'YYYY-MM-DD'|null, endsOn 'YYYY-MM-DD'|null (inclusive; compared with the tee date for tee times and today for the shop),
       days: [0..6]|null (tee date weekday, 0 = Sunday; null = any day; ignored for the shop),
       timeFrom 'HH:MM'|null, timeTo 'HH:MM'|null (tee time window, inclusive start, exclusive end; ignored for the shop),
       minTotal number|null (eligible lines must add up to at least this), maxUses number|null (all customers),
       maxPerCustomer number|null, active: bool, createdAt ISO, createdBy staffId|null,
       uses: [{ id, at ISO, source ('public' tee time | 'shop' online order), refId, publicPlayerId|null, memberId|null,
                discount, status: 'used'|'released', releasedAt? }] }

   Lines passed in: [{ label, amount (tax included, CAD), kind: 'greenFee'|'cart'|'addon'|'shop' }].

   Club.promos.normalize(code) -> 'FALL20'
   Club.promos.all() / get(id) / find(code)
   Club.promos.check(code, ctx) -> { ok, promo, msg }       ctx: { where: 'teetime'|'shop', date?, time?, publicPlayerId?, memberId? }
   Club.promos.quote(promo, lines, ctx) -> { ok, discount, eligible, msg, line: { name, qty: 1, price: -discount } }
   Club.promos.redeem(promoId, { source, refId, discount, publicPlayerId, memberId }) -> use
   Club.promos.amend(source, refId, discount) -> use|null    the discount changed (a member changed their booking)
   Club.promos.release(source, refId)    a refund or cancellation gives the use back (status 'released')
   Club.promos.usedCount(promo) / usedBy(promo, { publicPlayerId, memberId }) / givenAway(promo) (dollars of used discounts)
   Club.promos.describe(promo) -> '20% off green fees and carts'      kindsText(promo) -> 'green fees and carts'
   Club.promos.applyBox(host, { site: 'public'|'portal', ctx(), lines(), onChange(state|null), noMatch(promo, quote) }) -> { state(), recheck(), refresh(), clear() }
       "Have a promo code?" link, code field with Apply, and the applied state with the discount and Remove.
       state: { promo, code, discount, label ('FALL20, 20% off green fees'), line (receipt line) }.
       noMatch: the message when a valid code reduces nothing here (else "This code doesn’t apply to anything in this order.").
   Order of operations at checkout: promo discount first, then a gift card covers what is left, then the card. */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const COLL = 'promoCodes';
  const KINDS = { greenFee: 'green fees', cart: 'carts', addon: 'add-ons', shop: 'the online golf shop' };
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  function today() { return Club.date.today(); }
  function normalize(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function all() { return S.all(COLL); }
  function get(id) { return S.find(COLL, id); }
  function find(code) { const n = normalize(code); return n ? all().find(function (p) { return p.code === n; }) || null : null; }
  function live(p) { return (p.uses || []).filter(function (u) { return u.status === 'used'; }); }
  function usedCount(p) { return live(p).length; }
  function usedBy(p, who) {
    who = who || {};
    const em = String(who.email || '').trim().toLowerCase();   /* guests (no account) are matched by their email */
    return live(p).filter(function (u) { return (who.publicPlayerId && u.publicPlayerId === who.publicPlayerId) || (who.memberId && u.memberId === who.memberId) || (em && u.email === em); }).length;
  }
  function givenAway(p) { return r2(live(p).reduce(function (a, u) { return a + (+u.discount || 0); }, 0)); }
  function toMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; }
  function dow(iso) { const d = Club.date && Club.fmt.toDate ? Club.fmt.toDate(iso) : new Date(iso + 'T12:00:00'); return d.getDay(); }

  /** 'green fees and carts': what the code reduces, in words. */
  function kindsText(p) {
    const what = (p && p.appliesTo || []).map(function (k) { return KINDS[k]; }).filter(Boolean);
    return what.length <= 1 ? what.join('') : what.slice(0, -1).join(', ') + ' and ' + what[what.length - 1];
  }
  function describe(p) {
    if (!p) return '';
    return (p.kind === 'percent' ? (+p.value) + '% off ' : fmt.money(p.value) + ' off ') + kindsText(p);
  }

  /** Can this code be used here? Checks everything except the amount (quote does that). */
  function check(code, ctx) {
    ctx = ctx || {};
    const n = normalize(code);
    if (!n) return { ok: false, msg: 'Enter a promo code.' };
    const p = find(n);
    if (!p || !p.active) return { ok: false, msg: 'We don’t recognize that promo code. Please check it and try again.' };
    const where = ctx.where === 'shop' ? 'shop' : 'teetime';
    const kinds = p.appliesTo || [];
    if (where === 'shop' && kinds.indexOf('shop') < 0) return { ok: false, msg: 'This code can’t be used in the online shop.' };
    if (where === 'teetime' && !kinds.some(function (k) { return k !== 'shop'; })) return { ok: false, msg: 'This code is for the online golf shop only.' };
    const d = where === 'shop' ? today() : (ctx.date || today());
    if (p.startsOn && d < p.startsOn) return { ok: false, msg: 'This code starts on ' + fmt.dateLong(p.startsOn) + '.' };
    if (p.endsOn && d > p.endsOn) return { ok: false, msg: where === 'shop' ? 'This code has expired.' : 'This code isn’t valid for ' + fmt.dateLong(d) + '.' };
    if (where === 'teetime') {
      if (Array.isArray(p.days) && p.days.length && p.days.indexOf(dow(d)) < 0) return { ok: false, msg: 'This code isn’t valid on ' + fmt.dateLong(d).split(',')[0] + 's.' };
      const t = toMin(ctx.time), a = toMin(p.timeFrom), b = toMin(p.timeTo);
      if (t != null && ((a != null && t < a) || (b != null && t >= b))) {
        return { ok: false, msg: 'This code is only valid for tee times ' + (a != null && b != null ? 'from ' + fmt.time(p.timeFrom) + ' to ' + fmt.time(p.timeTo) : a != null ? 'from ' + fmt.time(p.timeFrom) : 'before ' + fmt.time(p.timeTo)) + '.' };
      }
    }
    if (p.maxUses != null && usedCount(p) >= +p.maxUses) return { ok: false, msg: 'This code has reached its limit.' };
    if (p.maxPerCustomer != null && (ctx.publicPlayerId || ctx.memberId || ctx.email) && usedBy(p, ctx) >= +p.maxPerCustomer) {
      return { ok: false, msg: 'You have already used this code' + (+p.maxPerCustomer > 1 ? ' ' + p.maxPerCustomer + ' times' : '') + '.' };
    }
    return { ok: true, promo: p, msg: '' };
  }

  /** The discount on these lines: percent of the eligible lines, or a fixed amount capped at them. */
  function quote(p, lines, ctx) {
    if (!p) return { ok: false, discount: 0, eligible: 0, msg: '' };
    const kinds = p.appliesTo || [];
    const eligible = r2((lines || []).reduce(function (a, l) { return a + (kinds.indexOf(l.kind) >= 0 ? (+l.amount || 0) : 0); }, 0));
    if (eligible <= 0) return { ok: false, discount: 0, eligible: 0, msg: 'This code doesn’t apply to anything in this order.' };
    if (p.minTotal != null && eligible < +p.minTotal) return { ok: false, discount: 0, eligible: eligible, msg: 'This code needs at least ' + fmt.money(p.minTotal) + ' of eligible items.' };
    const discount = r2(Math.min(eligible, p.kind === 'percent' ? eligible * (+p.value || 0) / 100 : (+p.value || 0)));
    return { ok: discount > 0, discount: discount, eligible: eligible, msg: '', line: { name: 'Promo code ' + p.code, qty: 1, price: -discount } };
  }

  function redeem(id, o) {
    const p = get(id); if (!p) return null;
    o = o || {};
    const prior = (p.uses || []).find(function (u) { return u.status === 'used' && u.source === o.source && u.refId === o.refId; });
    if (prior) return prior;
    const use = { id: S.uid('pu'), at: new Date().toISOString(), source: o.source || 'public', refId: o.refId || null,
      publicPlayerId: o.publicPlayerId || null, memberId: o.memberId || null, email: String(o.email || '').trim().toLowerCase() || null, discount: r2(o.discount), status: 'used' };
    S.update(COLL, p.id, { uses: (p.uses || []).concat([use]) });
    return use;
  }
  /** The discount of a live use changed (the booking it reduces was changed). */
  function amend(source, refId, discount) {
    let out = null;
    all().forEach(function (p) {
      let hit = false;
      const uses = (p.uses || []).map(function (u) {
        if (u.status === 'used' && u.source === source && u.refId === refId && r2(u.discount) !== r2(discount)) { hit = true; out = Object.assign({}, u, { discount: r2(discount), amendedAt: new Date().toISOString() }); return out; }
        return u;
      });
      if (hit) S.update(COLL, p.id, { uses: uses });
    });
    return out;
  }
  function release(source, refId) {
    let n = 0;
    all().forEach(function (p) {
      let hit = false;
      const uses = (p.uses || []).map(function (u) {
        if (u.status === 'used' && u.source === source && u.refId === refId) { hit = true; n++; return Object.assign({}, u, { status: 'released', releasedAt: new Date().toISOString() }); }
        return u;
      });
      if (hit) S.update(COLL, p.id, { uses: uses });
    });
    return n;
  }

  /* Demo codes (placeholders: the club has not published any promotions). */
  S.seed(COLL, function () {
    const t = today(), add = Club.date.addDays;
    return [
      { id: 'promo_welcome', code: 'WELCOME10', description: 'Demo: first visit, 10% off green fees', kind: 'percent', value: 10, appliesTo: ['greenFee'],
        startsOn: add(t, -30), endsOn: add(t, 60), days: null, timeFrom: null, timeTo: null, minTotal: null, maxUses: null, maxPerCustomer: 1, active: true, createdAt: add(t, -30) + 'T09:00:00.000Z', createdBy: null, uses: [] },
      { id: 'promo_twilight', code: 'TWILIGHT5', description: 'Demo: $5 off twilight green fees, Monday to Thursday', kind: 'amount', value: 5, appliesTo: ['greenFee'],
        startsOn: add(t, -14), endsOn: null, days: [1, 2, 3, 4], timeFrom: '17:30', timeTo: null, minTotal: null, maxUses: null, maxPerCustomer: null, active: true, createdAt: add(t, -14) + 'T09:00:00.000Z', createdBy: null, uses: [] },
      { id: 'promo_shop15', code: 'SHOP15', description: 'Demo: 15% off online golf shop orders over $50', kind: 'percent', value: 15, appliesTo: ['shop'],
        startsOn: add(t, -7), endsOn: add(t, 45), days: null, timeFrom: null, timeTo: null, minTotal: 50, maxUses: 200, maxPerCustomer: 1, active: true, createdAt: add(t, -7) + 'T09:00:00.000Z', createdBy: null, uses: [] },
      { id: 'promo_spring', code: 'SPRING20', description: 'Demo: an expired spring promotion', kind: 'percent', value: 20, appliesTo: ['greenFee', 'cart'],
        startsOn: add(t, -200), endsOn: add(t, -150), days: null, timeFrom: null, timeTo: null, minTotal: null, maxUses: null, maxPerCustomer: 1, active: false, createdAt: add(t, -200) + 'T09:00:00.000Z', createdBy: null, uses: [] }
    ];
  });

  /* ---------------- "Have a promo code?" box ---------------- */
  function applyBox(host, o) {
    o = o || {};
    const link = o.site === 'portal' ? 'p-link' : 'pub-link';
    const uid = Math.random().toString(36).slice(2, 7);
    let applied = null, open = false;
    function compute() {
      if (!applied) return null;
      const p = get(applied); if (!p) return null;
      const ctx = o.ctx ? o.ctx() : {};
      const c = check(p.code, ctx); if (!c.ok) return null;
      const q = quote(p, o.lines ? o.lines() : [], ctx); if (!q.ok) return null;
      return { promo: p, code: p.code, discount: q.discount, label: p.code + ', ' + describe(p), line: q.line };
    }
    function draw(err) {
      const s = compute();
      if (applied && !s && !err) { applied = null; }
      if (s) {
        host.innerHTML = '<div class="pr-box is-applied">' + Club.icon('tag', 'pr-box-icon') +
          '<div class="pr-box-main"><span class="pr-box-t">' + esc(s.code) + ' · ' + esc(fmt.money(s.discount)) + ' off</span>' +
          '<span class="pr-box-s">' + esc(describe(s.promo)) + '</span></div>' +
          '<button type="button" class="' + link + ' pr-box-rm" data-pr="remove">Remove</button></div>';
      } else if (open) {
        host.innerHTML = '<div class="pr-box is-open"><div class="field pr-box-field"><label for="pr-code-' + uid + '">Promo code</label>' +
          '<div class="pr-box-row"><input class="input pr-box-in" id="pr-code-' + uid + '" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="Enter code">' +
          '<button type="button" class="btn pr-box-apply" data-pr="apply">Apply</button></div>' +
          (err ? '<span class="field-error">' + esc(err) + '</span>' : '') + '</div>' +
          '<button type="button" class="' + link + ' pr-box-cancel" data-pr="cancel">Cancel</button></div>';
        const inp = ui.$('.pr-box-in', host);
        if (err) inp.classList.add('invalid');
        setTimeout(function () { if (inp && document.body.contains(inp)) inp.focus(); }, 30);
      } else {
        host.innerHTML = '<button type="button" class="' + link + ' pr-box-open" data-pr="open">' + Club.icon('tag') + '<span>Have a promo code?</span></button>';
      }
      if (o.onChange) o.onChange(s);
    }
    function apply() {
      const inp = ui.$('.pr-box-in', host); const v = inp ? inp.value : '';
      const ctx = o.ctx ? o.ctx() : {};
      const c = check(v, ctx);
      let err = c.ok ? '' : c.msg;
      if (c.ok) {
        const q = quote(c.promo, o.lines ? o.lines() : [], ctx);
        if (!q.ok) err = (!(q.eligible > 0) && o.noMatch ? o.noMatch(c.promo, q) : '') || q.msg || 'This code doesn’t apply to this order.';
      }
      if (err) { draw(err); const i2 = ui.$('.pr-box-in', host); if (i2) i2.value = v; return; }
      applied = c.promo.id; open = false; draw();
    }
    host.addEventListener('click', function (e) {
      const b = e.target.closest('[data-pr]'); if (!b || !host.contains(b)) return;
      const a = b.dataset.pr;
      if (a === 'open') { open = true; draw(); }
      else if (a === 'cancel') { open = false; draw(); }
      else if (a === 'remove') { applied = null; open = false; draw(); }
      else if (a === 'apply') apply();
    });
    host.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('pr-box-in')) { e.preventDefault(); apply(); } });
    host.addEventListener('input', function (e) { if (e.target.classList.contains('pr-box-in')) e.target.value = e.target.value.toUpperCase(); });
    draw();
    return {
      state: compute,
      /** Right before taking payment: the code may have hit its limit or stopped applying. '' when fine. */
      recheck: function () {
        if (!applied) return '';
        const p = get(applied);
        const ctx = o.ctx ? o.ctx() : {};
        const c = p ? check(p.code, ctx) : { ok: false, msg: '' };
        const q = c.ok ? quote(p, o.lines ? o.lines() : [], ctx) : { ok: false };
        if (!c.ok || !q.ok) { applied = null; draw(); return (c.msg || q.msg || 'That promo code no longer applies.') + ' It has been removed from this order.'; }
        return '';
      },
      refresh: function () { draw(); },
      clear: function () { applied = null; open = false; draw(); }
    };
  }

  Club.promos = {
    KINDS: KINDS, normalize: normalize, all: all, get: get, find: find, check: check, quote: quote, redeem: redeem, amend: amend, release: release,
    usedCount: usedCount, usedBy: usedBy, givenAway: givenAway, describe: describe, kindsText: kindsText, applyBox: applyBox
  };
})();
