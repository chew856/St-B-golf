/* Club.feedback: post-visit ratings ("How was your round?", "How was your meal?", "How was your lesson?").
   Nothing here ever pops up: people find their visits on the members' portal (#/feedback, js/portal/feedback.js) or on
   the public My account page (js/public/feedback.js) and rate them when they choose to. Staff read the results on
   the Visit feedback page (js/modules/feedback.js). Loaded after js/core/ui.js, before any module.

   Feedback doc ('visitFeedback'):
     { id ('vf_<kind>_<refId>_<personId>'), kind: 'round'|'meal'|'lesson', refId (teeTimes / diningReservations / lessons id),
       visitDate 'YYYY-MM-DD', visit: { title, sub, time }, memberId|null, publicPlayerId|null, name,
       rating 1..5, comment ('' or up to 500 characters), createdAt, updatedAt, followedUp?: true (staff) }
   One doc per person per visit; rating again or editing the comment updates it.

   What can be rated: visits that happened in the last WINDOW_DAYS days (today included):
     round   a teeTimes doc with status 'completed' the person played in (members: players[].memberId; public golfers:
             players[].publicPlayerId, the booking account)
     meal    a diningReservations doc with status 'completed' booked under the member
     lesson  a lessons doc with status 'completed' for the member

   Club.feedback.visits(who) -> [visit]   who: { memberId } or { publicPlayerId }. Newest first. visit:
                                          { key ('round:<refId>'), kind, refId, date, time, title, sub, question, until (last
                                          day it can be rated), fb (the doc or null) }
   Club.feedback.rate(who, key, { rating?, comment? }) -> doc | null   null when the visit is not open for rating
   Club.feedback.all()                    every doc (demo ratings from other people are added once, $visitFeedbackSeeded)
   Club.feedback.cardHTML(visit)          the rating card (same markup on both sites; styled by css/portal/feedback.css
                                          and css/public/feedback.css)
   Club.feedback.wire(root, who, onSave)  one tap on a number saves the rating; the comment saves with its button.
                                          Binds once per root element; cards re-render in place. */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const COLL = 'visitFeedback';
  const WINDOW_DAYS = 14;
  const LOW = 2;                                       /* ratings at or below this are flagged for staff */
  const MAX_COMMENT = 500;
  const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const KINDS = {
    round: { label: 'Round', plural: 'Rounds', question: 'How was your round?', icon: 'flag' },
    meal: { label: 'Meal', plural: 'Meals', question: 'How was your meal?', icon: 'dining' },
    lesson: { label: 'Lesson', plural: 'Lessons', question: 'How was your lesson?', icon: 'lesson' }
  };
  const DEMO_PUBLIC = 'pp_demo_cart';                  /* js/modules/cart.js DEMO_PUBLIC_ID: left unrated for the demo */

  function today() { return Club.date.today(); }
  function from() { return Club.date.addDays(today(), -WINDOW_DAYS); }
  function whoId(who) { return who.memberId || who.publicPlayerId; }
  function docId(kind, refId, who) { return 'vf_' + kind + '_' + refId + '_' + whoId(who); }
  function mealWord(t) { const h = +String(t || '12').split(':')[0]; return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : 'Dinner'; }

  /* ---------------- Visits ---------------- */
  function roundVisit(t) {
    return { kind: 'round', refId: t.id, date: t.date, time: t.time, title: 'Round of golf', sub: (t.holes || 18) + ' holes · ' + fmt.time(t.time) + ' tee time' };
  }
  function mealVisit(d) {
    const n = +d.partySize || 1;
    return { kind: 'meal', refId: d.id, date: d.date, time: d.time, title: mealWord(d.time) + (d.venue ? ' at ' + d.venue : ''), sub: fmt.time(d.time) + ' · table for ' + n };
  }
  function lessonVisit(l) {
    const pro = Club.staff && l.proId ? Club.staff.name(l.proId) : '';
    return { kind: 'lesson', refId: l.id, date: l.date, time: l.time, title: l.type || 'Lesson', sub: fmt.time(l.time) + (pro && pro !== 'Unassigned' ? ' · with ' + pro : '') + (l.duration ? ' · ' + l.duration + ' min' : '') };
  }
  /** Every visit this person made in the window (rated or not), newest first. */
  function rawVisits(who) {
    const lo = from(), hi = today();
    const inWin = function (d) { return d && d.date >= lo && d.date <= hi; };
    const out = [];
    S.all('teeTimes').forEach(function (t) {
      if (t.status !== 'completed' || !inWin(t)) return;
      const mine = (t.players || []).some(function (p) { return who.memberId ? p.memberId === who.memberId : p.publicPlayerId === who.publicPlayerId; });
      if (mine) out.push(roundVisit(t));
    });
    if (who.memberId) {
      S.all('diningReservations').forEach(function (d) { if (d.memberId === who.memberId && d.status === 'completed' && inWin(d)) out.push(mealVisit(d)); });
      S.all('lessons').forEach(function (l) { if (l.memberId === who.memberId && l.status === 'completed' && inWin(l)) out.push(lessonVisit(l)); });
    }
    return out.sort(function (a, b) { return (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')); });
  }
  function visits(who) {
    if (!who || !whoId(who)) return [];
    seed();
    return rawVisits(who).map(function (v) {
      return Object.assign(v, { key: v.kind + ':' + v.refId, question: KINDS[v.kind].question, until: Club.date.addDays(v.date, WINDOW_DAYS), fb: S.find(COLL, docId(v.kind, v.refId, who)) });
    });
  }
  function personName(who) {
    if (who.memberId) return Club.members.name(who.memberId);
    const p = S.find('publicPlayers', who.publicPlayerId);
    return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : 'Public golfer';
  }

  /* ---------------- Saving ---------------- */
  function rate(who, key, o) {
    o = o || {};
    const v = visits(who).find(function (x) { return x.key === key; });
    if (!v) return null;                                 /* not this person's, not finished, or older than the window */
    const patch = {};
    if (o.rating != null) {
      const r = Math.round(+o.rating);
      if (!(r >= 1 && r <= 5)) return null;
      patch.rating = r;
    }
    if (o.comment != null) patch.comment = String(o.comment).replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
    if (v.fb) return S.update(COLL, v.fb.id, patch);
    if (!patch.rating) return null;                      /* a comment needs a rating first */
    return S.insert(COLL, Object.assign({
      id: docId(v.kind, v.refId, who), kind: v.kind, refId: v.refId, visitDate: v.date, visit: { title: v.title, sub: v.sub, time: v.time || '' },
      memberId: who.memberId || null, publicPlayerId: who.publicPlayerId || null, name: personName(who), comment: ''
    }, patch));
  }

  /* ---------------- Demo ratings from other people (once) ----------------
     So the staff page has something to show. Only real visits in the data are rated; the demo member and the demo public
     golfer are left alone. Comments are short general opinions, never claims about the club. */
  const COMMENTS = {
    round: { hi: ['Great round, thank you.', 'Greens were rolling nicely.', 'Course was in lovely shape.', 'Good pace all the way round.', 'Friendly starter and a smooth start.'],
      mid: ['Pace was a little slow on the back nine.', 'A few bunkers needed raking.', 'Fine round, the greens were a bit slow.'],
      lo: ['We waited on almost every tee.', 'Slow play all day, nobody moved groups along.', 'Our tee time started 20 minutes late.', 'Greens were very bumpy today.', 'Hard to get a drink on the course.'] },
    meal: { hi: ['Lovely meal and great service.', 'Food came out quickly after our round.', 'Our server was excellent.', 'Very good, we will be back.'],
      mid: ['Good food, a bit of a wait for the bill.', 'Busy night, service was slower than usual.'],
      lo: ['Our food arrived cold.', 'We waited 40 minutes for our mains.', 'The order was wrong and took a long time to fix.', 'Nobody came to take our order for a while.'] },
    lesson: { hi: ['Really helpful lesson, my swing feels better.', 'Clear advice I could use straight away.', 'Patient and encouraging.'],
      mid: ['Good lesson, would have liked more time on putting.'],
      lo: ['The lesson started late and felt rushed.'] }
  };
  let seeded = false;
  function seed() {
    if (seeded) return;
    seeded = true;
    if (S.getObj('visitFeedbackSeeded', false)) return;
    try {
      const T = today(), lo = Club.date.addDays(T, -42);
      if (!S.all('teeTimes').length && !S.all('diningReservations').length) { seeded = false; return; }   /* data not ready yet */
      const R = S.R; R.reseed(4417);
      const skip = function (id) { return id === S.DEMO_MEMBER || id === DEMO_PUBLIC; };
      const out = [];
      function pickRating() { const x = R.rand(); return x < 0.03 ? 1 : x < 0.08 ? 2 : x < 0.24 ? 3 : x < 0.6 ? 4 : 5; }
      function add(v, who, chance) {
        if (!R.chance(chance)) return;
        const rating = pickRating(), pool = COMMENTS[v.kind][rating <= LOW ? 'lo' : rating === 3 ? 'mid' : 'hi'];
        const withComment = rating <= LOW || R.chance(rating === 3 ? 0.6 : 0.3);
        const at = new Date(fmt.toDate(Club.date.addDays(v.date, R.int(1, 3))).getTime() + R.int(8, 20) * 3600000);
        const stamp = (at > new Date() ? new Date() : at).toISOString();
        out.push({ id: docId(v.kind, v.refId, who), kind: v.kind, refId: v.refId, visitDate: v.date, visit: { title: v.title, sub: v.sub, time: v.time || '' },
          memberId: who.memberId || null, publicPlayerId: who.publicPlayerId || null, name: personName(who), rating: rating,
          comment: withComment ? R.pick(pool) : '', createdAt: stamp, updatedAt: stamp, seeded: true });
      }
      S.all('teeTimes').forEach(function (t) {
        if (t.status !== 'completed' || t.date < lo || t.date >= T) return;
        (t.players || []).forEach(function (p) {
          if (p.memberId && !skip(p.memberId)) add(roundVisit(t), { memberId: p.memberId }, 0.12);
          else if (p.publicPlayerId && !p.publicGuest && !skip(p.publicPlayerId)) add(roundVisit(t), { publicPlayerId: p.publicPlayerId }, 0.3);
        });
      });
      S.all('diningReservations').forEach(function (d) { if (d.status === 'completed' && d.memberId && !skip(d.memberId) && d.date >= lo && d.date < T) add(mealVisit(d), { memberId: d.memberId }, 0.4); });
      S.all('lessons').forEach(function (l) { if (l.status === 'completed' && l.memberId && !skip(l.memberId) && l.date >= lo && l.date < T) add(lessonVisit(l), { memberId: l.memberId }, 0.35); });
      const have = {}; S.all(COLL).forEach(function (d) { have[d.id] = 1; });
      const fresh = out.filter(function (d) { if (have[d.id]) return false; have[d.id] = 1; return true; });
      if (fresh.length) S.replace(COLL, S.all(COLL).concat(fresh));
      S.setObj('visitFeedbackSeeded', true);
    } catch (e) { console.error('Visit feedback seed failed', e); }
  }
  function all() { seed(); return S.all(COLL); }

  /* ---------------- Card markup (portal and public site) ---------------- */
  function scaleHTML(v) {
    const cur = v.fb ? v.fb.rating : 0;
    return '<div class="vf-scale" role="group" aria-label="' + esc(v.question + ' 1 is poor, 5 is excellent') + '">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<button type="button" class="vf-n' + (n === cur ? ' is-on' : '') + (cur && n < cur ? ' is-below' : '') + '" data-rate="' + n + '" aria-pressed="' + (n === cur) + '" aria-label="' + n + ', ' + LABELS[n] + '">' + n + '</button>';
    }).join('') + '</div><div class="vf-ends" aria-hidden="true"><span>Poor</span><span>Excellent</span></div>';
  }
  function cardHTML(v, note) {
    const d = fmt.toDate(v.date), fb = v.fb;
    const when = Club.date.addDays(today(), -1) === v.date ? 'Yesterday' : v.date === today() ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return '<article class="vf-card' + (fb ? ' is-rated' : '') + '" data-vf="' + esc(v.key) + '" aria-labelledby="vf-t-' + esc(v.refId) + '">' +
      '<div class="vf-head"><span class="vf-icon" aria-hidden="true">' + Club.icon(KINDS[v.kind].icon) + '</span>' +
        '<div class="vf-what"><span class="vf-when">' + esc(when) + '</span><h3 class="vf-title" id="vf-t-' + esc(v.refId) + '">' + esc(v.title) + '</h3><span class="vf-sub">' + esc(v.sub) + '</span></div>' +
        (fb ? '<span class="vf-tag">' + Club.icon('check') + '<span>Rated</span></span>' : '') + '</div>' +
      '<p class="vf-q">' + esc(v.question) + '</p>' + scaleHTML(v) +
      '<p class="vf-status" role="status" aria-live="polite">' + (note ? esc(note) : fb ? 'You rated this ' + esc(LABELS[fb.rating].toLowerCase()) + '. You can change it until ' + esc(fmt.dateShort(v.until)) + '.' : '') + '</p>' +
      (fb ? '<div class="vf-comment"><label class="vf-cl" for="vf-c-' + esc(v.refId) + '">Comment <span>(optional)</span></label>' +
        '<textarea class="textarea vf-ta" id="vf-c-' + esc(v.refId) + '" rows="2" maxlength="' + MAX_COMMENT + '" placeholder="Anything you would like the club to know">' + esc(fb.comment || '') + '</textarea>' +
        '<div class="vf-cacts"><button type="button" class="btn btn-sm vf-save" data-vf-save>' + (fb.comment ? 'Update comment' : 'Save comment') + '</button></div></div>' : '') +
    '</article>';
  }
  function wire(root, who, onSave) {
    if (!root || root.dataset.vfWired) return;
    root.dataset.vfWired = '1';
    function card(el) { return el.closest('[data-vf]'); }
    function repaint(c, note, focusSel) {
      const v = visits(who).find(function (x) { return x.key === c.dataset.vf; });
      if (!v) return;
      const fresh = ui.el(cardHTML(v, note));
      c.replaceWith(fresh);
      if (focusSel) { const f = ui.$(focusSel, fresh); if (f) f.focus({ preventScroll: true }); }
      if (onSave) onSave(v);
    }
    ui.on(root, 'click', '[data-rate]', function (e, b) {
      const c = card(b); if (!c) return;
      const n = +b.dataset.rate;
      const doc = rate(who, c.dataset.vf, { rating: n });
      if (!doc) { repaint(c, 'This visit can no longer be rated.'); return; }
      repaint(c, 'Thank you. You rated this ' + LABELS[n].toLowerCase() + '. You can change it or add a comment.', '[data-rate="' + n + '"]');
    });
    ui.on(root, 'click', '[data-vf-save]', function (e, b) {
      const c = card(b); if (!c) return;
      const ta = ui.$('.vf-ta', c);
      const doc = rate(who, c.dataset.vf, { comment: ta ? ta.value : '' });
      if (!doc) { repaint(c, 'This visit can no longer be rated.'); return; }
      repaint(c, doc.comment ? 'Thank you. Your comment has been saved.' : 'Your comment has been removed.', '[data-vf-save]');
    });
  }

  Club.feedback = { COLL: COLL, WINDOW_DAYS: WINDOW_DAYS, LOW: LOW, LABELS: LABELS, KINDS: KINDS, MAX_COMMENT: MAX_COMMENT,
    visits: visits, rate: rate, all: all, cardHTML: cardHTML, wire: wire, seed: seed };
})();
