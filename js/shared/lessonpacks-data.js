/* Lesson packages: definitions staff set up in the rate card, purchases by members, and the rules for using one.
   Loaded by the staff page and the members' portal, after js/shared/lessons-data.js. Staff screens are in
   js/modules/lessons.js (rate card, booking, Sell to member) and js/modules/members.js (Golf tab); the portal's in
   js/portal/lessons.js (Packages tab, booking).

   'lessonPackages' (definitions):
     { id ('lpk_...'), name, covers: { type (a lesson type), duration (minutes) | null (any length), proId | null (any pro) },
       lessons (whole number 1 to 50), price (dollars and cents, entered by staff), onSale (members and staff can buy it),
       expiry: { kind: 'none' | 'seasonEnd' | 'months', months (1 to 24, for 'months') }, placeholder (demo price, until
       staff save a price) }
   'memberPackages' (purchases):
     { id ('mpk_...'), memberId, packageId, name and covers (copied at purchase, so a later edit or delete of the
       definition does not change what was bought), lessons, used: [lessonId], price, purchasedAt (ISO time),
       purchasedOn (YYYY-MM-DD), expiresOn (YYYY-MM-DD, the last day it can be used) | null, chargeId | null,
       source: 'portal' | 'staff' }
   A lesson booked on a package has packageId (the purchase's id) and price 0: completing it posts nothing, and the
   package sale's one account charge (category Lessons, source 'lessons', refId the purchase id) is the revenue.
   Cancelling the lesson gives the lesson back (it leaves `used`); restoring it takes it again. */
(function () {
  const S = Club.store, fmt = Club.fmt;
  const fe = function () { return Club.fmtEn || Club.fmt; };
  const today = function () { return Club.date.today(); };
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  /* "End of season" packages run to the golf season's closing day, set by staff in Settings (Club.season, js/core/ui.js;
     October 31 until the club enters its dates). Read when a package is bought, so a Settings change applies to packages
     bought after it; a purchase keeps the expiresOn it was given. */
  function seasonEnd() { return Club.season ? Club.season.get().close : '10-31'; }
  const TYPES = ['Private lesson', 'Playing lesson', 'Club fitting', 'Junior clinic', 'Group clinic'];

  function proFirst(id) { const s = S.find('staff', id); return s ? s.firstName : 'Pro'; }
  function addMonths(iso, n) {
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n, d = +iso.slice(8, 10);
    const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    const last = new Date(yy, mm + 1, 0).getDate();
    return yy + '-' + String(mm + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }
  /** The last day a package bought on `from` can be used, or null for no expiry. */
  function expiryFor(expiry, from) {
    const k = expiry && expiry.kind;
    if (k === 'months') return addMonths(from, Math.max(1, +expiry.months || 1));
    if (k === 'seasonEnd') {
      if (Club.season) return Club.season.endAfter(from);
      const end = from.slice(0, 4) + '-' + seasonEnd(); return from <= end ? end : (+from.slice(0, 4) + 1) + '-' + seasonEnd();
    }
    return null;
  }
  function expiryText(expiry) {
    const k = expiry && expiry.kind;
    if (k === 'months') { const n = +expiry.months || 1; return n + (n === 1 ? ' month' : ' months'); }
    if (k === 'seasonEnd') return 'End of season';
    return 'No expiry';
  }
  /** "Private lesson, 60 min, any pro" / "Private lesson, 30 min, Nora" / "Junior clinic" (staff rate card). */
  function coversText(c) {
    c = c || {};
    const out = [c.type || 'Lesson'];
    if (c.duration) out.push(c.duration + ' min');
    if (c.proId) out.push(proFirst(c.proId)); else if (c.duration) out.push('any pro');
    return out.join(', ');
  }
  /** "30-minute private lessons with Nora" / "junior clinics" */
  function forText(c) {
    c = c || {};
    return (c.duration ? c.duration + '-minute ' : '') + String(c.type || 'Lesson').toLowerCase() + 's' + (c.proId ? ' with ' + proFirst(c.proId) : '');
  }
  /** "4 × 30 min with Nora · 6 months" / "8 × Junior clinic · No expiry" (a package on sale, in the portal). */
  function offerText(p) {
    const c = p.covers || {};
    const what = c.type === 'Private lesson' && c.duration ? c.duration + ' min' : (c.type || 'Lesson') + (c.duration ? ', ' + c.duration + ' min' : '');
    return p.lessons + ' × ' + what + (c.proId ? ' with ' + proFirst(c.proId) : '') + ' · ' + expiryText(p.expiry);
  }
  /** "Private lesson, 60 minutes, any pro" (a member's package). */
  function heldText(c) {
    c = c || {};
    return [c.type || 'Lesson'].concat(c.duration ? [c.duration + ' minutes'] : []).concat([c.proId ? 'with ' + proFirst(c.proId) : 'any pro']).join(', ');
  }

  function defs() { return S.all('lessonPackages'); }
  function def(id) { return S.find('lessonPackages', id); }
  function get(id) { return S.find('memberPackages', id); }
  function remaining(mp) { return mp ? Math.max(0, (+mp.lessons || 0) - (mp.used || []).length) : 0; }
  function expired(mp, on) { return !!(mp && mp.expiresOn && (on || today()) > mp.expiresOn); }
  /** A member's packages: usable ones first (soonest expiry first), then used up, then expired. */
  function forMember(memberId) {
    const rank = function (mp) { return expired(mp) ? 2 : remaining(mp) ? 0 : 1; };
    return S.where('memberPackages', function (mp) { return mp.memberId === memberId; }).sort(function (a, b) {
      return rank(a) - rank(b) || String(a.expiresOn || '9999').localeCompare(String(b.expiresOn || '9999')) || String(a.purchasedAt).localeCompare(String(b.purchasedAt));
    });
  }
  function coversLesson(c, l) {
    return !!(c && l) && c.type === l.type && (!c.duration || +c.duration === +l.duration) && (!c.proId || c.proId === l.proId);
  }
  /** Why package mp cannot pay for lesson l (null when it can). selfId: the lesson itself when it already uses mp. */
  function whyNot(mp, l, selfId) {
    if (!mp) return 'That package is no longer on file.';
    if (!coversLesson(mp.covers, l)) return mp.name + ' is for ' + forText(mp.covers) + ' only.';
    if (expired(mp)) return mp.name + ' expired on ' + fmt.dateShort(mp.expiresOn) + '.';
    if (mp.expiresOn && l.date > mp.expiresOn) return mp.name + ' expires on ' + fmt.dateShort(mp.expiresOn) + ', before this lesson.';
    const mine = selfId && (mp.used || []).indexOf(selfId) >= 0;
    if (!mine && !remaining(mp)) return 'All ' + mp.lessons + ' lessons in ' + mp.name + ' are used.';
    return null;
  }
  /** The member's packages that can pay for lesson l, best first (soonest expiry). */
  function usable(memberId, l, selfId) {
    if (!memberId) return [];
    return forMember(memberId).filter(function (mp) { return !whyNot(mp, l, selfId); });
  }
  /** Use one lesson of package mpId for lessonId (no-op when it is already counted). */
  function take(mpId, lessonId) {
    const mp = get(mpId); if (!mp) return null;
    if ((mp.used || []).indexOf(lessonId) >= 0) return mp;
    return S.update('memberPackages', mpId, { used: (mp.used || []).concat([lessonId]) });
  }
  /** Give lessonId's lesson back to package mpId. */
  function giveBack(mpId, lessonId) {
    const mp = get(mpId); if (!mp || (mp.used || []).indexOf(lessonId) < 0) return mp;
    return S.update('memberPackages', mpId, { used: mp.used.filter(function (x) { return x !== lessonId; }) });
  }

  /** Buy package packageId for a member: one account charge (category Lessons) with a receipt.
      Returns { mp, charge } or { error }. Staff wrap it in Club.undo.track for Undo. */
  function sell(memberId, packageId, source) {
    const p = def(packageId), m = S.find('members', memberId);
    if (!p) return { error: 'That package is no longer offered.' };
    if (!p.onSale) return { error: p.name + ' is not on sale.' };
    if (!m) return { error: 'That member is no longer on file.' };
    if (m.status !== 'active') return { error: m.firstName + ' ' + m.lastName + '’s membership is ' + (m.status || 'not active') + ', so packages cannot be sold to them.' };
    const now = new Date().toISOString(), on = today(), price = r2(p.price);
    let mp = S.insert('memberPackages', {
      id: S.uid('mpk'), memberId: memberId, packageId: p.id, name: p.name, covers: JSON.parse(JSON.stringify(p.covers || {})), lessons: +p.lessons,
      used: [], price: price, purchasedAt: now, purchasedOn: on, expiresOn: expiryFor(p.expiry, on), chargeId: null, source: source === 'portal' ? 'portal' : 'staff'
    });
    let ch = null;
    if (price > 0) {
      ch = Club.chargeMember(memberId, { description: p.name, category: 'Lessons', amount: price, source: 'lessons', refId: mp.id, date: on, title: 'Lesson package', lines: [{ name: p.name, qty: 1, price: price }] });
      if (ch) mp = S.update('memberPackages', mp.id, { chargeId: ch.id });
    }
    return { mp: mp, charge: ch };
  }

  Club.lessonPacks = {
    TYPES: TYPES,
    /** 'MM-DD' of the season's closing day, read now (a getter, so Settings changes show at once). */
    get SEASON_END() { return seasonEnd(); },
    defs: defs, def: def, get: get, forMember: forMember, remaining: remaining, expired: expired,
    coversLesson: coversLesson, whyNot: whyNot, usable: usable, take: take, giveBack: giveBack, sell: sell,
    expiryFor: expiryFor, expiryText: expiryText, coversText: coversText, forText: forText, offerText: offerText, heldText: heldText, addMonths: addMonths
  };

  /* ---------------- Demo (once per browser, 'demoBackfills' marker 'lessonPacks1') ----------------
     Three packages with placeholder prices worked out from the demo rate card (lesson rate x lessons, no discount), one
     purchase each for the demo member (S.DEMO_MEMBER) and one other member with lessons already used, and pro notes
     on a few of their past lessons. Lessons added here have fixed ids (les_pkd_...), placed where the pro is free. */
  const MARK = 'lessonPacks1';
  (function seed() {
    if (S.find('demoBackfills', MARK) || !S.all('staff').length) return;
    const rates = Club.shared && Club.shared.lessons ? Club.shared.lessons : null;
    const price = function (type, proId, dur) { return rates ? rates.priceFor(type, proId, dur) : 0; };
    const defsNew = [
      { id: 'lpk_five', name: 'Five private lessons', covers: { type: 'Private lesson', duration: 60, proId: null }, lessons: 5, price: 5 * price('Private lesson', 'stf_4', 60), expiry: { kind: 'seasonEnd' }, onSale: true, placeholder: true },
      { id: 'lpk_short', name: 'Short game pack', covers: { type: 'Private lesson', duration: 30, proId: 'stf_4' }, lessons: 4, price: 4 * price('Private lesson', 'stf_4', 30), expiry: { kind: 'months', months: 6 }, onSale: true, placeholder: true },
      { id: 'lpk_junior', name: 'Junior starter', covers: { type: 'Junior clinic', duration: null, proId: null }, lessons: 8, price: 8 * price('Junior clinic', 'stf_5', 60), expiry: { kind: 'none' }, onSale: false, placeholder: true }
    ];
    defsNew.forEach(function (d) { if (!def(d.id)) S.insert('lessonPackages', d); });

    const toMin = function (t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
    const toHM = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    const overlap = function (a1, d1, a2, d2) { return a1 < a2 + d2 && a2 < a1 + d1; };
    const sessions = function (p) { const o = []; for (let k = 0; k < (+p.weeks || 0); k++) o.push(Club.date.addDays(p.startDate, k * 7)); return o; };
    function free(date, proId, memberId, s, dur) {
      if (S.all('lessons').some(function (l) { return l.date === date && l.status !== 'cancelled' && (l.proId === proId || l.memberId === memberId) && overlap(s, dur, toMin(l.time), +l.duration || 60); })) return false;
      return !S.all('programs').some(function (p) { return p.coach === proId && sessions(p).indexOf(date) >= 0 && overlap(s, dur, toMin(p.time), +p.duration || 60); });
    }
    /** A completed lesson on the package, n days ago, with the first pro (of `order`) free between 9 AM and 5 PM. */
    function pastLesson(id, memberId, mp, ago, dur, order, note) {
      if (S.find('lessons', id)) return null;
      const date = Club.date.fromToday(-ago);
      for (let i = 0; i < order.length; i++) for (let s = 9 * 60; s + dur <= 17 * 60; s += 30) {
        if (!free(date, order[i], memberId, s, dur)) continue;
        return S.insert('lessons', { id: id, date: date, time: toHM(s), duration: dur, proId: order[i], memberId: memberId, type: mp.covers.type, price: 0, status: 'completed',
          notes: '', charged: false, pays: 'account', packageId: mp.id, lessonNotes: note || '' });
      }
      return null;
    }
    function purchase(id, memberId, p, ago) {
      if (get(id) || !S.find('members', memberId)) return get(id);
      const on = Club.date.fromToday(-ago), at = on + 'T15:20:00.000Z';
      let mp = S.insert('memberPackages', { id: id, memberId: memberId, packageId: p.id, name: p.name, covers: JSON.parse(JSON.stringify(p.covers)), lessons: p.lessons, used: [],
        price: r2(p.price), purchasedAt: at, purchasedOn: on, expiresOn: expiryFor(p.expiry, on), chargeId: null, source: id === 'mpk_demo1' ? 'portal' : 'staff', demo: true });
      const ch = Club.chargeMember(memberId, { description: p.name, category: 'Lessons', amount: r2(p.price), source: 'lessons', refId: id, date: on, noReceipt: true });
      if (ch) {
        S.update('charges', ch.id, { createdAt: at });
        if (Club.receipts) { try { Club.receipts.create({ memberId: memberId, kind: 'sale', title: 'Lesson package', lines: [{ name: p.name, qty: 1, price: r2(p.price) }], total: r2(p.price), method: 'account', source: 'lessons', refId: id, chargeId: ch.id, at: at, date: on }); } catch (e) { console.error(e); } }
        mp = S.update('memberPackages', id, { chargeId: ch.id });
      }
      return mp;
    }
    const NOTES = [
      'Ball position drifting forward with the driver. Set-up checklist given.',
      'Chipping: weight forward, hands ahead. Good progress on distance control from 20 yards.',
      'Grip too strong, clubface closed at the top. Worked on a neutral grip with alignment sticks.\nPractise: 30 slow half swings a day before the next lesson.',
      'Putting: eyes over the ball and a shorter backstroke. Ladder drill from 3, 6 and 9 feet.',
      'Takeaway too far inside. Club parallel to the target line at hip height; mirror work at home.',
      'Bunker play: open the face before taking the grip, splash the sand two inches behind the ball.'
    ];
    function noteOld(memberId, k) {
      /* Notes on up to two of the member's own past completed lessons (oldest notes first, so the newest is k + 1) */
      const T = today();
      S.where('lessons', function (l) { return l.memberId === memberId && l.status === 'completed' && l.date < T && !l.lessonNotes && !/^les_pkd_/.test(l.id); })
        .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); }).slice(0, 2).reverse()
        .forEach(function (l, i) { S.update('lessons', l.id, { lessonNotes: NOTES[(k + i) % NOTES.length] }); });
    }

    const dave = S.DEMO_MEMBER || 'mem_1003';
    const five = def('lpk_five'), short = def('lpk_short');
    if (five && S.find('members', dave)) {
      noteOld(dave, 0);
      const mp = purchase('mpk_demo1', dave, five, 16);
      if (mp) {
        [['les_pkd_1', 12, 3], ['les_pkd_2', 5, 2]].forEach(function (x) {
          const l = pastLesson(x[0], dave, mp, x[1], 60, ['stf_3', 'stf_4', 'stf_5', 'stf_2'], NOTES[x[2]]);
          if (l) take(mp.id, l.id);
        });
      }
    }
    /* A second member: the active golfer (not Dave) with the most completed lessons on file */
    const counts = {};
    S.all('lessons').forEach(function (l) { if (l.memberId && l.memberId !== dave && l.status === 'completed') counts[l.memberId] = (counts[l.memberId] || 0) + 1; });
    const other = Object.keys(counts).filter(function (id) { const m = S.find('members', id); return m && m.status === 'active'; })
      .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); })[0];
    if (short && other) {
      noteOld(other, 4);
      const mp = purchase('mpk_demo2', other, short, 30);
      if (mp) { const l = pastLesson('les_pkd_3', other, mp, 9, 30, ['stf_4'], NOTES[1]); if (l) take(mp.id, l.id); }
    }
    S.insert('demoBackfills', { id: MARK, at: new Date().toISOString(), packages: defsNew.length, purchases: ['mpk_demo1', 'mpk_demo2'].filter(get).length });
  })();
})();
