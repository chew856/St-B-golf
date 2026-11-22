/* Portal: Golf Canada score posting. A clearly labelled DEMO.
   The club is applying for Golf Canada access; until then nothing here talks to Golf Canada. Scores are saved in the
   'scorePosts' collection of this demo only, every screen that would reach Golf Canada says so, and members.handicap
   is never changed (the "new handicap index" is a demo estimate).

   Routes: #/scores (history, rounds to post, "Post a score"), #/scores/post (a round not booked in the app),
   #/scores/post/<teeTimeId> (prefilled from a tee time). Hooks used elsewhere (all optional, checked with Portal.scores):
   homePrompt(m) on Home, pastCell(tt, m) and detailAction(tt, m) in My tee times, golfRowsHTML(m), indexChart(m, hist)
   and wireGolf(sheet, m) in Profile > Golf.

   Course data (par, stroke index, yards) comes from the store's 'holes' collection (the club's scorecard). There are
   no course or slope ratings for this course in the data: anything that needs them uses DEMO_RATINGS below and is
   marked as demo in the UI (DEMO_RATINGS, now in js/core/whs.js). Playing conditions (PCC) are "Calculated by Golf Canada"
   and count as 0 here.

   Redesign (Nov 22): the handicap index is the page's one big serif figure; rounds are hairline rows (a date block,
   the tees, the score in the serif); the posting flow is one clean column with its three steps as words. No cards. */
(function () {
  'use strict';

  const S = Club.store, ui = Club.ui, fmt = Club.fmt, esc = ui.esc;
  const DONE_AFTER = { 18: 200, 9: 100 };   /* minutes after the tee time before a checked-in or on-course round can be posted */
  const RECENT_DAYS = 7;                    /* Home prompts for rounds this recent */
  const BANNER = 'Demo only: not connected to Golf Canada. Scores stay in this app.';

  /* ---------------- Course data and WHS maths: Club.whs (js/core/whs.js), shared with the live scorecard ---------------- */
  const W = Club.whs;
  const DEMO_RATINGS = W.DEMO_RATINGS, TEES = W.TEES;
  const sum = W.sum, holesAll = W.holesAll, holesFor = W.holesFor, parOf = W.parOf, yardsOf = W.yardsOf, teeLabel = W.teeLabel, ratingFor = W.ratingFor;
  const courseHandicap = W.courseHandicap, strokesPerHole = W.strokesPerHole, ndbCaps = W.ndbCaps, adjustedOf = W.adjustedOf;
  const differential = W.differential, estimate = W.estimate;

  /* ---------------- Store helpers ---------------- */
  function newestFirst(a, b) { return (b.date + (b.time || '99:99') + (b.postedAt || '')).localeCompare(a.date + (a.time || '99:99') + (a.postedAt || '')); }
  function postsOf(mid) { return S.where('scorePosts', function (p) { return p.memberId === mid; }).sort(newestFirst); }
  function postFor(mid, ttId) { return ttId ? S.all('scorePosts').find(function (p) { return p.memberId === mid && p.teeTimeId === ttId; }) || null : null; }
  function estimateFor(mid) { return estimate(postsOf(mid).map(function (p) { return p.differential; })); }
  function latestAppPost(mid) { return postsOf(mid).filter(function (p) { return !p.seed && p.estimate; }).sort(function (a, b) { return String(b.postedAt).localeCompare(String(a.postedAt)); })[0] || null; }
  function shortName(id) { const m = id && Club.members.get(id); return m ? m.firstName + ' ' + m.lastName.charAt(0) + '.' : ''; }
  function memberName(id) { const m = id && Club.members.get(id); return m ? m.firstName + ' ' + m.lastName : ''; }
  function friendsOf(mid) { return Portal.friends && Portal.friends.friendsOf ? Portal.friends.friendsOf(mid) : []; }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function isGolfer(m) { const t = tierOf(m); return t ? !!t.golf : !!m && m.handicap != null; }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function minutesSince(tt) { const d = fmt.toDate(tt.date); d.setHours(0, toMin(tt.time), 0, 0); return (Date.now() - d.getTime()) / 60000; }
  function leagueOf(tt, mid) { const p = tt && (tt.players || []).find(function (x) { return x.memberId === mid; }); return (p && p.friendLeagueId) || null; }
  function inRound(tt, mid) { return (tt.players || []).some(function (p) { return p.memberId === mid; }); }
  function partnerName(p) { return Portal.playerLabel(p); }   /* friends in full, everyone else "Tom R." */
  function partners(tt, mid) { return (tt.players || []).filter(function (p) { return p.memberId !== mid; }); }
  function niceList(arr) { return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1]; }
  /* A list of names shown on its own (no sentence around it for the French patterns to work on): "et" in French */
  function namesList(arr) { const fr = Club.i18n && Club.i18n.lang && Club.i18n.lang() === 'fr'; return arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + (fr ? ' et ' : ' and ') + arr[arr.length - 1]; }
  function indexOn(mid, date, fallback) {
    const h = S.all('handicapHistory').filter(function (x) { return x.memberId === mid && typeof x.index === 'number' && x.date <= date; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];
    return h ? h.index : fallback;
  }
  /** A round of the member's that is finished: completed, or checked in / on course long enough ago. */
  function canPost(tt, mid) {
    if (!tt || !inRound(tt, mid)) return false;
    if (tt.status === 'completed') return true;
    return (tt.status === 'on-course' || tt.status === 'checked-in') && minutesSince(tt) >= DONE_AFTER[+tt.holes === 9 ? 9 : 18];
  }
  function toPost(m, days) {
    const from = days ? Club.date.addDays(Club.date.today(), -days) : '0000';
    return S.all('teeTimes').filter(function (t) { return t && t.date >= from && t.date <= Club.date.today() && canPost(t, m.id) && !postFor(m.id, t.id); })
      .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
  }

  /* ---------------- Seed: about 12 past demo posts for Dave (mem_1003) ---------------- */
  /* Differentials chosen to sit around his handicapHistory (6.2 to 7.0 this season). Two line up with his completed
     tee times when the tee sheet has an 18-hole round on that day. Marked demo: true and seed: true. */
  /** Demo posts for one member from a plan of [days ago, tees, target differential, strokes over net double bogey]. */
  function demoPosts(mid, plan, seedNo, idPre) {
    const R = S.R; R.reseed(seedNo);
    const m = S.find('members', mid);
    if (!m || !S.all('holes').length) return [];
    const fr = friendsOf(mid);
    return plan.map(function (p, i) {
      const date = Club.date.fromToday(-p[0]);
      const tt = S.all('teeTimes').find(function (t) { return t.date === date && t.status === 'completed' && +t.holes === 18 && inRound(t, mid); }) || null;
      const idx = indexOn(mid, date, m.handicap), tee = p[1], r = ratingFor(tee, 18), hs = holesFor(18);
      const ch = courseHandicap(idx, tee, 18), caps = ndbCaps(hs, ch);
      const scores = fakeCard(hs, caps, Math.round(p[2] * r.slope / 113 + r.rating), R, p[3]);
      const ags = adjustedOf(scores, caps);
      const others = tt ? partners(tt, mid) : [];
      const attest = tt ? ((others.find(function (q) { return q.memberId && fr.indexOf(q.memberId) >= 0; }) || {}).memberId || null)
        : (fr.length && i % 3 !== 2 ? fr[i % fr.length] : null);
      return {
        id: idPre + (i + 1), memberId: mid, date: date, time: tt ? tt.time : null, teeTimeId: tt ? tt.id : null,
        holes: 18, nine: null, tees: tee, entry: 'hole', holeScores: scores, gross: sum(scores), adjusted: ags,
        courseHandicap: ch, indexUsed: idx, rating: r.rating, slope: r.slope, par: parOf(hs), pcc: null,
        differential: differential(ags, tee, 18, idx), attestedBy: attest,
        playedWith: tt ? others.map(partnerName) : (attest ? [memberName(attest)] : []),
        estimate: null, status: 'saved-in-demo', postedAt: date + 'T19:30:00', demo: true, seed: true
      };
    });
  }
  S.seed('scorePosts', function () {
    return demoPosts(S.DEMO_MEMBER || 'mem_1003', [   /* [days ago, tees, target differential, strokes over net double bogey on one hole] */
      [170, 'green', 8.6, 0], [156, 'green', 10.4, 2], [141, 'black', 7.3, 0], [127, 'green', 9.1, 0], [112, 'green', 6.2, 0], [98, 'black', 11.6, 3],
      [84, 'green', 7.8, 0], [69, 'green', 5.9, 0], [55, 'black', 8.4, 1], [40, 'green', 6.6, 0], [10, 'green', 9.4, 2], [2, 'black', 6.8, 0]
    ], 5150, 'sp_seed_');
  });
  /* Demo posts for Dave's friends, so a friend's profile has recent rounds to show. Added once, also in browsers
     that seeded scorePosts before friends had rounds; the 'demoBackfills' marker keeps it from coming back. */
  (function friendRounds() {
    const mid = S.DEMO_MEMBER || 'mem_1003';
    if (S.find('demoBackfills', 'friendRounds') || !S.find('members', mid)) return;
    friendsOf(mid).forEach(function (fid, k) {
      const f = S.find('members', fid); if (!f || f.handicap == null || postsOf(fid).length) return;
      const base = Math.max(-2, f.handicap * 113 / 125);
      const offs = [[150, 2.4, 1], [118, 0.8, 0], [86, 3.1, 2], [52, 1.2, 0], [27, -0.4, 0], [9, 1.9, 1], [3 + k, 0.6, 0]];
      demoPosts(fid, offs.map(function (o, i) { return [o[0] + k * 2, i % 3 === 1 ? 'black' : 'green', Math.round((base + o[1]) * 10) / 10, o[2]]; }), 7300 + k, 'sp_fseed_' + fid + '_')
        .forEach(function (doc) { S.insert('scorePosts', doc); });
    });
    S.insert('demoBackfills', { id: 'friendRounds', at: new Date().toISOString() });
  })();
  /** A plausible hole-by-hole card whose adjusted total is `target`; `blow` adds one hole over net double bogey. */
  function fakeCard(hs, caps, target, R, blow) {
    const n = hs.length, sc = hs.map(function (h) { return h.par; });
    let need = target - parOf(hs), g;
    const birdies = need > 4 ? R.int(0, 2) : 0;
    for (let b = 0, k = 0; b < birdies && k < 60; k++) { g = R.int(0, n - 1); if (sc[g] === hs[g].par && hs[g].par >= 4) { sc[g]--; b++; need++; } }
    for (let k = 0; need > 0 && k < 800; k++) { g = R.int(0, n - 1); if (sc[g] < Math.min(caps[g], hs[g].par + 2)) { sc[g]++; need--; } }
    for (let k = 0; need < 0 && k < 800; k++) { g = R.int(0, n - 1); if (sc[g] >= hs[g].par) { sc[g]--; need++; } }
    if (blow) {
      let i = 0; sc.forEach(function (v, k) { if (v - caps[k] > sc[i] - caps[i]) i = k; });
      let back = caps[i] - sc[i]; sc[i] = caps[i] + blow;          /* the adjusted total rises by `back`: take it off elsewhere */
      for (let k = 0; back > 0 && k < 800; k++) { g = R.int(0, n - 1); if (g !== i && sc[g] > hs[g].par) { sc[g]--; back--; } }
      for (let k = 0; back > 0 && k < 800; k++) { g = R.int(0, n - 1); if (g !== i && sc[g] >= hs[g].par) { sc[g]--; back--; } }
    }
    return sc;
  }

  /* ---------------- Shared bits of UI ---------------- */
  function dayShort(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dayLong(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function bannerHTML(short) {
    return '<div class="gc-banner" role="note"><p>' +
      (short ? '<span class="gc-banner-k">Demo.</span> Not connected to Golf Canada. Scores stay in this demo.' : esc(BANNER)) + '</p></div>';
  }
  function demoPill(txt) { return '<span class="gc-pill">' + esc(txt || 'Demo') + '</span>'; }
  /* One decimal, with a comma in French ("4,5"); a plus differential shows "+" */
  function dec1(x) { const s = x < 0 ? '+' + Math.abs(x).toFixed(1) : (+x).toFixed(1); return Club.i18n && Club.i18n.lang && Club.i18n.lang() === 'fr' ? s.replace('.', ',') : s; }
  function diffText(p) { return dec1(p.differential); }

  /* A date block: the weekday in small capitals over the day number */
  function dblock(d) {
    const x = fmt.toDate(d);
    return '<span class="gc-dblock"><small>' + esc(x.toLocaleDateString('en-US', { weekday: 'short' })) + '</small><span class="gc-dblock-n">' + x.getDate() + '</span></span>';
  }
  function monthLabel(d) {
    const x = fmt.toDate(d), o = { month: 'long' };
    if (x.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return x.toLocaleDateString('en-US', o);
  }
  function historyRows(posts) {
    return posts.map(function (p) {
      const att = p.attestedBy ? memberName(p.attestedBy) : '';
      const label = dayLong(p.date) + ', ' + teeLabel(p.tees) + ' tees, ' + p.holes + ' holes. Gross ' + p.gross + ', adjusted ' + p.adjusted +
        ', differential ' + diffText(p) + '. ' + (att ? 'Attested by ' + att : 'Not attested') + '. Open details';
      return '<li><button type="button" class="gc-hrow" data-post="' + esc(p.id) + '" aria-label="' + esc(label) + '">' +
        dblock(p.date) +
        '<span class="gc-h-main"><span class="gc-h-tees"><span>' + esc(teeLabel(p.tees) + ' tees') + '</span>' + (+p.holes === 9 ? ' · <span>9 holes</span>' : '') + '</span>' +
          '<span class="gc-h-sub">' + (p.adjusted !== p.gross ? '<span>Adjusted</span> ' + p.adjusted + ' · ' : '') +
            (att ? '<span>Attested by</span> <span class="gc-long" data-i18n-skip>' + esc(att) + '</span><span class="gc-short" aria-hidden="true" data-i18n-skip>' + esc(shortName(p.attestedBy)) + '</span>' : '<span>Not attested</span>') + '</span></span>' +
        '<span class="gc-h-fig"><span class="gc-h-score">' + p.gross + '</span><span class="gc-h-diff"><span class="gc-h-dk">Diff </span>' + esc(diffText(p)) + '</span></span>' +
        '</button></li>';
    }).join('');
  }
  /* The history: a month in small capitals, then that month's rounds as hairline rows */
  function historyHTML(posts, shown) {
    if (!posts.length) return '<p class="gc-empty">No scores yet. Scores you post in this demo will be listed here.</p>';
    const groups = [];
    posts.slice(0, shown).forEach(function (p) {
      const k = p.date.slice(0, 7), g = groups[groups.length - 1];
      if (g && g.k === k) g.list.push(p); else groups.push({ k: k, label: monthLabel(p.date), list: [p] });
    });
    return '<div class="gc-hlist-wrap">' + groups.map(function (g) {
      return '<h3 class="gc-month">' + esc(g.label) + '</h3><ul class="gc-hlist" aria-label="Score history, newest first">' + historyRows(g.list) + '</ul>';
    }).join('') + '</div>' +
      (posts.length > shown ? '<button type="button" class="p-link gc-showall" data-act="show-all">Show all (' + posts.length + ')</button>' : '');
  }

  /* Scorecard grid for a posted hole-by-hole score */
  function cardHTML(p) {
    if (p.entry !== 'hole' || !p.holeScores) return '<p class="gc-note">Posted as a total only, so there is no hole-by-hole card.</p>';
    const hs = holesFor(p.holes, p.nine), caps = ndbCaps(hs, p.courseHandicap);
    const halves = +p.holes === 9 ? [[0, 9, p.nine === 'back' ? 'In' : 'Out']] : [[0, 9, 'Out'], [9, 18, 'In']];
    return halves.map(function (h) {
      const idx = []; for (let i = h[0]; i < h[1]; i++) idx.push(i);
      const cell = function (i) {
        const v = p.holeScores[i], par = hs[i].par, capped = v > caps[i];
        const cls = capped ? 'is-capped' : v < par ? 'is-under' : v > par ? 'is-over' : '';
        return '<td><span class="gc-sc ' + cls + '"' + (capped ? ' title="Counts as ' + caps[i] + '"' : '') + '>' + v + '</span>' + (capped ? '<span class="gc-sr">, counts as ' + caps[i] + '</span>' : '') + '</td>';
      };
      /* the column widths go on a colgroup: a fixed-layout table ignored them on the first row's cells, so the labels
         overlapped the first hole and the total was cut off */
      return '<div class="gc-card-wrap"><table class="gc-card"><caption class="gc-sr">' + (h[2] === 'Out' ? 'Front nine' : 'Back nine') + '</caption>' +
        '<colgroup><col class="gc-col-l">' + idx.map(function () { return '<col>'; }).join('') + '<col class="gc-col-t"></colgroup>' +
        '<tr><th scope="row">Hole</th>' + idx.map(function (i) { return '<th scope="col">' + hs[i].number + '</th>'; }).join('') + '<th scope="col">' + h[2] + '</th></tr>' +
        '<tr><th scope="row">Par</th>' + idx.map(function (i) { return '<td>' + hs[i].par + '</td>'; }).join('') + '<td>' + sum(idx.map(function (i) { return hs[i].par; })) + '</td></tr>' +
        '<tr class="gc-card-you"><th scope="row">Score</th>' + idx.map(cell).join('') + '<td>' + sum(idx.map(function (i) { return p.holeScores[i]; })) + '</td></tr>' +
        '</table></div>';
    }).join('') + (p.gross > p.adjusted ? '<p class="gc-note gc-note-sm"><span class="gc-sc is-capped" aria-hidden="true">8</span> Over net double bogey: counts as net double bogey in the adjusted score.</p>' : '');
  }
  function openPost(id) {
    const p = S.find('scorePosts', id); if (!p) return;
    const tt = p.teeTimeId ? S.find('teeTimes', p.teeTimeId) : null;
    const att = p.attestedBy ? memberName(p.attestedBy) : '';
    Portal.openSheet({ title: dayLong(p.date), size: 'full', content: '<div class="gc-detail">' +
      '<p class="gc-detail-sub">' + esc([p.time ? fmt.time(p.time) : '', p.holes + ' holes' + (+p.holes === 9 ? ' (' + (p.nine === 'back' ? 'back' : 'front') + ' nine)' : ''), teeLabel(p.tees) + ' tees'].filter(Boolean).join(' · ')) + '</p>' +
      statsHTML(p.gross, p.adjusted, p.differential) +
      cardHTML(p) +
      '<dl class="gc-kv">' +
        '<div><dt>Course handicap</dt><dd>' + p.courseHandicap + ' ' + demoPill() + '</dd></div>' +
        '<div><dt>Playing conditions</dt><dd>Calculated by Golf Canada</dd></div>' +
        '<div><dt>Played with</dt><dd>' + esc(p.playedWith && p.playedWith.length ? namesList(p.playedWith) : tt ? (Portal.member() && Portal.member().id !== p.memberId ? 'Played alone' : 'Just you') : 'Not recorded') + '</dd></div>' +
        '<div><dt>Attested by</dt><dd>' + esc(att || 'Not attested') + '</dd></div>' +
        (p.estimate ? '<div><dt>Index after this score</dt><dd>' + esc(fmt.handicap(p.estimate.index)) + ' ' + demoPill('Demo estimate') + '</dd></div>' : '') +
      '</dl>' + bannerHTML(true) + '</div>' });
  }
  function statsHTML(gross, adj, diff) {
    return '<div class="gc-stats">' +
      '<div class="gc-stat"><span class="gc-stat-k">Gross</span><span class="gc-stat-v">' + gross + '</span></div>' +
      '<div class="gc-stat"><span class="gc-stat-k">Adjusted</span><span class="gc-stat-v">' + adj + '</span></div>' +
      '<div class="gc-stat"><span class="gc-stat-k">Differential</span><span class="gc-stat-v">' + esc(dec1(diff)) + '</span>' + demoPill() + '</div></div>';
  }

  /* ---------------- #/scores: history, rounds to post, post a score ---------------- */
  function renderOverview(view, m) {
    const posts = postsOf(m.id), est = estimateFor(m.id), due = toPost(m, 14);
    let shown = 10;
    view.innerHTML =
      '<section class="p-hero gc-hero"><h1>Scores</h1></section>' +
      bannerHTML(false) +
      '<div class="gc-cols">' +
        '<div class="gc-side">' +
          '<section class="gc-idx" aria-label="Handicap index"><p class="gc-idx-k">Handicap index</p>' +
            '<p class="gc-idx-v">' + esc(fmt.handicap(m.handicap)) + '</p><p class="gc-idx-s">Your club record</p></section>' +
          '<p class="gc-est"><span class="gc-est-k">Demo estimate</span><span class="gc-est-s">' + (est ? 'Best ' + est.used + ' of ' + est.of : 'Needs 3 scores') + '</span>' +
            '<span class="gc-est-v">' + (est ? esc(fmt.handicap(est.index)) : '–') + '</span></p>' +
          '<section class="gc-sec gc-due" aria-labelledby="gc-d-h"><div class="gc-sec-head"><h2 id="gc-d-h">Rounds to post</h2>' +
              (due.length > 2 ? '<button type="button" class="p-link" data-act="all-due" aria-haspopup="dialog">View all (' + due.length + ')</button>' : '') + '</div>' +
            '<ul class="gc-duelist">' + due.slice(0, 2).map(dueRow).join('') +
              '<li><a class="gc-due-row gc-due-manual" href="#/scores/post"><span class="gc-due-main"><span class="gc-due-t">Post a score for another round</span><span class="gc-due-s">A round not booked in the app</span></span></a></li>' +
            '</ul>' + (due.length ? '' : '<p class="gc-hint">Your rounds from the last two weeks are all posted.</p>') +
          '</section>' +
        '</div>' +
        '<div class="gc-main">' +
          '<section class="gc-sec" aria-labelledby="gc-h-h"><div class="gc-sec-head"><h2 id="gc-h-h">Score history</h2><span class="gc-count">' + posts.length + (posts.length === 1 ? ' score' : ' scores') + '</span></div>' +
            '<div class="gc-history">' + historyHTML(posts, shown) + '</div></section>' +
        '</div>' +
      '</div>';
    ui.on(view, 'click', '[data-post]', function (e, b) { openPost(b.dataset.post); });
    ui.on(view, 'click', '[data-act=show-all]', function () { shown = 1e6; ui.$('.gc-history', view).innerHTML = historyHTML(postsOf(m.id), shown); if (Club.i18n) Club.i18n.translate(ui.$('.gc-history', view)); const f = ui.$$('.gc-hrow', view)[10]; if (f) f.focus(); });
    ui.on(view, 'click', '[data-act=all-due]', function () {
      Portal.openSheet({ title: 'Rounds to post', size: 'full', rows: due.map(function (t) { return { value: t.id, label: dayShort(t.date) + ' · ' + fmt.time(t.time), sub: roundSub(t, m.id), href: '#/scores/post/' + encodeURIComponent(t.id) }; }) });
    });
  }
  function roundSub(t, mid, short) {
    const o = partners(t, mid).map(partnerName);
    return t.holes + ' holes · ' + (!o.length ? 'A solo round' : 'With ' + (short && o.length > 1 ? o[0] + ' +' + (o.length - 1) : niceList(o)));
  }
  function dueRow(t) {
    const m = Portal.member();
    return '<li><a class="gc-due-row" href="#/scores/post/' + encodeURIComponent(t.id) + '" aria-label="' + esc('Post score for ' + dayShort(t.date) + ' at ' + fmt.time(t.time)) + '">' + dblock(t.date) +
      '<span class="gc-due-main"><span class="gc-due-t">' + esc(fmt.time(t.time)) + '</span>' +
      '<span class="gc-due-s">' + esc(roundSub(t, m.id, true)) + '</span></span><span class="gc-due-cta">Post score</span></a></li>';
  }

  /* ---------------- #/scores/post[/teeTimeId]: one decision at a time ---------------- */
  const STEPS = [{ id: 'round', label: 'Round' }, { id: 'score', label: 'Score' }, { id: 'attest', label: 'Attest' }];
  function renderFlow(view, m, ttId) {
    const tt = ttId ? S.find('teeTimes', ttId) : null;
    if (ttId && (!tt || !inRound(tt, m.id))) {
      view.innerHTML = '<div class="gc-flow">' + ui.empty({ icon: 'flag', title: 'We could not find that round', text: 'It may have been cancelled. You can still post a score for a round that is not in the app.', action: '<a class="btn btn-primary" href="#/scores/post">Post a score</a>' }) + '</div>';
      return;
    }
    const already = tt && postFor(m.id, tt.id);
    if (already) {
      view.innerHTML = '<div class="gc-flow">' + ui.empty({ icon: 'check', title: 'This round is already posted', text: 'You posted ' + already.gross + ' for this round in the demo.', action: '<button type="button" class="btn" data-post="' + esc(already.id) + '">View score</button> <a class="btn" href="#/scores">Score history</a>' }) + '</div>';
      ui.on(view, 'click', '[data-post]', function (e, b) { openPost(b.dataset.post); });
      return;
    }
    if (tt && !canPost(tt, m.id)) {
      view.innerHTML = '<div class="gc-flow">' + ui.empty({ icon: 'clock', title: 'This round has not finished yet', text: 'You can post your score once the round is complete.', action: '<a class="btn" href="#/tee-times/mine">My tee times</a>' }) + '</div>';
      return;
    }
    const lastTee = Portal.prefs.get('gc.tees', 'green');
    const st = {
      step: 'round', tt: tt, date: tt ? tt.date : Club.date.today(), time: tt ? tt.time : null, holes: tt ? (+tt.holes === 9 ? 9 : 18) : 18,
      nine: 'front', tees: DEMO_RATINGS[lastTee] ? lastTee : 'green', mode: Portal.prefs.get('gc.mode', 'hole') === 'total' ? 'total' : 'hole',
      half: 'front', byHole: {}, total: null, attest: null
    };
    const index = m.handicap;

    function hs() { return holesFor(st.holes, st.nine); }
    function ch() { return courseHandicap(index, st.tees, st.holes, st.nine); }
    function scores() { return hs().map(function (h) { return st.byHole[h.number] != null ? st.byHole[h.number] : h.par; }); }
    function totals() {
      const h = hs(), sc = scores(), caps = ndbCaps(h, ch());
      if (st.mode === 'total') { const t = st.total != null ? st.total : parOf(h); return { gross: t, adjusted: t, caps: caps, sc: null }; }
      return { gross: sum(sc), adjusted: adjustedOf(sc, caps), caps: caps, sc: sc,
        out: st.holes === 18 ? sum(sc.slice(0, 9)) : null, inn: st.holes === 18 ? sum(sc.slice(9)) : null };
    }
    function stepIndex() { return STEPS.findIndex(function (s) { return s.id === st.step; }); }

    function frame(inner) {
      const i = stepIndex();
      return '<div class="gc-flow">' +
        '<div class="gc-flow-top">' + (i > 0 ? '<button type="button" class="p-link gc-back" data-act="back">' + Club.icon('chevronLeft') + '<span>Back</span></button>'
          : '<a class="p-link gc-back" href="' + (tt ? '#/tee-times/mine' : '#/scores') + '">' + Club.icon('chevronLeft') + '<span>' + (tt ? 'My tee times' : 'Scores') + '</span></a>') + demoPill() + '</div>' +
        '<h1 class="gc-flow-h">Post a score</h1>' +
        '<ol class="gc-steps" aria-label="Steps">' + STEPS.map(function (s, k) {
          return '<li class="' + (k < i ? 'is-done' : k === i ? 'is-now' : '') + '"' + (k === i ? ' aria-current="step"' : '') + '><span class="gc-step-n" aria-hidden="true">' + (k + 1) + '</span><span class="gc-step-l">' + s.label + '</span></li>';
        }).join('') + '</ol>' +
        '<div class="gc-step-body">' + inner + '</div>' +
        '<p class="gc-flow-foot"><span>Demo only. Nothing is sent to Golf Canada.</span></p>' +
      '</div>';
    }

    /* ---- Step 1: the round ---- */
    function roundHTML() {
      const others = tt ? partners(tt, m.id) : [];
      const head = tt
        ? '<div class="gc-round">' + dblock(tt.date) + '<div><p class="gc-round-t">' + esc(dayLong(tt.date)) + '</p>' +
            '<p class="gc-round-s">' + esc(fmt.time(tt.time) + ' · ' + tt.holes + ' holes') + '</p>' +
            '<p class="gc-round-s">' + esc(others.length ? 'With ' + niceList(others.map(partnerName)) : 'A solo round') + '</p></div></div>'
        : '<div class="gc-q gc-date"></div>' +
          '<div class="gc-q gc-q-row"><span class="pk-label" id="gc-holes-l">Holes</span><div class="segmented gc-seg" role="radiogroup" aria-labelledby="gc-holes-l">' +
            [18, 9].map(function (n) { return '<button type="button" role="radio" data-holes="' + n + '" aria-checked="' + (st.holes === n) + '"' + (st.holes === n ? ' class="active"' : '') + '>' + n + ' holes</button>'; }).join('') + '</div></div>';
      const nine = st.holes === 9 ? '<div class="gc-q gc-q-row"><span class="pk-label" id="gc-nine-l">Which nine</span><div class="segmented gc-seg" role="radiogroup" aria-labelledby="gc-nine-l">' +
        [['front', 'Front 9 (holes 1 to 9)'], ['back', 'Back 9 (holes 10 to 18)']].map(function (x) { return '<button type="button" role="radio" data-nine="' + x[0] + '" aria-checked="' + (st.nine === x[0]) + '"' + (st.nine === x[0] ? ' class="active"' : '') + '>' + x[1].replace(/ \(.*/, '') + '<span class="gc-sr"> ' + x[1].replace(/.*\(|\)/g, '') + '</span></button>'; }).join('') + '</div></div>' : '';
      const h = holesFor(st.holes, st.nine);
      const tees = '<div class="gc-q gc-q-list"><span class="pk-label" id="gc-tees-l">Tees</span><div class="gc-opts" role="radiogroup" aria-labelledby="gc-tees-l">' + TEES.map(function (t) {
        const on = st.tees === t.id;
        return '<button type="button" class="gc-opt" role="radio" data-tee="' + t.id + '" aria-checked="' + on + '"><span class="gc-dot gc-dot-' + t.id + '" aria-hidden="true"></span>' +
          '<span class="gc-opt-main"><span class="gc-opt-l">' + t.label + '</span><span class="gc-opt-s">' + yardsOf(h, t.id).toLocaleString('en-CA') + ' yards · Par ' + parOf(h) + '</span></span>' +
          '<span class="gc-opt-k" aria-hidden="true">Selected</span></button>';
      }).join('') + '</div><p class="gc-hint">Yardage and par from the club scorecard.</p></div>';
      return head + nine + tees;
    }
    /* ---- Step 2: the score ---- */
    function holeRow(h, i, sc, caps, strokes) {
      const v = sc[i], capped = v > caps[i];
      const cls = capped ? 'is-capped' : v < h.par ? 'is-under' : v > h.par ? 'is-over' : '';
      return '<li class="gc-hole" data-n="' + h.number + '">' +
        '<span class="gc-hno">' + h.number + '</span>' +
        '<span class="gc-hmeta"><span class="gc-hpar">Par ' + h.par + '</span><span class="gc-hsi">SI ' + h.handicap + (strokes[i] > 0 ? ' · ' + (strokes[i] === 1 ? '1 stroke' : strokes[i] + ' strokes') : strokes[i] < 0 ? ' · gives 1 back' : '') + '</span>' +
          '<span class="gc-hcap"' + (capped ? '' : ' hidden') + '>Counts as ' + caps[i] + '</span></span>' +
        '<span class="gc-step" role="group" aria-label="Hole ' + h.number + ', par ' + h.par + '">' +
          '<button type="button" class="gc-stp" data-d="-1" aria-label="One fewer on hole ' + h.number + '"' + (v <= 1 ? ' disabled' : '') + '><span aria-hidden="true">−</span></button>' +
          '<output class="gc-val ' + cls + '" aria-live="polite">' + v + '</output>' +
          '<button type="button" class="gc-stp" data-d="1" aria-label="One more on hole ' + h.number + '"' + (v >= 15 ? ' disabled' : '') + '><span aria-hidden="true">+</span></button>' +
        '</span></li>';
    }
    function scoreHTML() {
      const h = hs(), c = ch(), t = totals(), strokes = strokesPerHole(h, c);
      const mode = '<div class="segmented gc-seg gc-mode" role="radiogroup" aria-label="How to enter your score">' +
        [['hole', 'Hole by hole'], ['total', 'Total only']].map(function (x) { return '<button type="button" role="radio" data-mode="' + x[0] + '" aria-checked="' + (st.mode === x[0]) + '"' + (st.mode === x[0] ? ' class="active"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
      const explain = Portal.accordion({ id: 'gc-ndb', title: 'Adjusted gross score', summary: 'Net double bogey, course handicap ' + c + ' (demo)',
        body: '<p class="gc-acc-p">Each hole counts at most net double bogey: par plus 2, plus any strokes you receive there. Your course handicap from the ' + teeLabel(st.tees) + ' tees is ' + c +
          ' (from your index ' + esc(fmt.handicap(index)) + ' and placeholder demo ratings), so you receive ' + (c > 0 ? 'a stroke on the ' + (c === 1 ? 'hardest hole' : c + ' hardest holes') + ' by stroke index' : 'no strokes') + '.</p>' });
      if (st.mode === 'total') {
        const lo = st.holes === 9 ? 27 : 54, hi = st.holes === 9 ? 80 : 160;
        return mode + '<div class="gc-total">' +
          '<label class="pk-label" for="gc-total-in">Your adjusted total for ' + st.holes + ' holes</label>' +
          '<span class="gc-step gc-step-lg"><button type="button" class="gc-stp" data-t="-1" aria-label="One fewer">−</button>' +
            '<input id="gc-total-in" class="input gc-total-in" type="number" inputmode="numeric" min="' + lo + '" max="' + hi + '" value="' + t.gross + '" aria-describedby="gc-total-hint">' +
            '<button type="button" class="gc-stp" data-t="1" aria-label="One more">+</button></span>' +
          '<p class="gc-hint" id="gc-total-hint">Count any hole worse than net double bogey as net double bogey. Post hole by hole and the app works this out for you.</p>' +
          '<p class="field-error gc-total-err" hidden></p></div>' + explain;
      }
      const sc = t.sc, caps = t.caps;
      const nines = st.holes === 18 ? [['front', 0, 9, 'Out'], ['back', 9, 18, 'In']] : [[st.nine, 0, 9, st.nine === 'back' ? 'In' : 'Out']];
      return mode +
        (st.holes === 18 ? '<div class="segmented gc-seg gc-half" role="tablist" aria-label="Nine">' +
          [['front', 'Front 9'], ['back', 'Back 9']].map(function (x) { return '<button type="button" role="tab" data-half="' + x[0] + '" aria-selected="' + (st.half === x[0]) + '"' + (st.half === x[0] ? ' class="active"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' : '') +
        '<div class="gc-nines">' + nines.map(function (n) {
          const idx = []; for (let i = n[1]; i < n[2]; i++) idx.push(i);
          return '<section class="gc-nine' + (st.holes === 18 && st.half !== n[0] ? ' is-off' : '') + '" data-nine="' + n[0] + '" aria-label="' + (n[0] === 'back' ? 'Back nine' : 'Front nine') + '">' +
            '<ol class="gc-holes">' + idx.map(function (i) { return holeRow(h[i], i, sc, caps, strokes); }).join('') + '</ol>' +
            '<p class="gc-nine-t"><span>' + n[3] + '</span><span class="gc-nine-v" data-sum="' + n[0] + '">' + sum(idx.map(function (i) { return sc[i]; })) + '</span></p></section>';
        }).join('') + '</div>' +
        '<div class="gc-sum" aria-live="polite">' + sumHTML(t) + '</div>' + explain;
    }
    function sumHTML(t) {
      return (st.holes === 18 ? '<span><span class="gc-sum-k">Out</span><span class="gc-sum-v">' + t.out + '</span></span><span><span class="gc-sum-k">In</span><span class="gc-sum-v">' + t.inn + '</span></span>' : '') +
        '<span><span class="gc-sum-k">Total</span><span class="gc-sum-v">' + t.gross + '</span></span>' +
        '<span class="gc-sum-adj"><span class="gc-sum-k">Adjusted</span><span class="gc-sum-v">' + t.adjusted + '</span></span>';
    }
    /* ---- Step 3: attest (optional) ---- */
    function attestOptions() {
      const fr = friendsOf(m.id);
      if (tt) {
        return partners(tt, m.id).map(function (p) {
          const friend = p.memberId && fr.indexOf(p.memberId) >= 0;
          return { id: p.memberId || '', label: partnerName(p).replace(/^a /, 'A '), ok: !!friend,
            why: friend ? 'Played with you' : p.type === 'member' ? 'Not on your friends list' : p.type === 'guest' ? 'Guests cannot attest in the app' : 'Cannot attest in the app' };
        });
      }
      return fr.map(function (id) { return { id: id, label: memberName(id), ok: true, why: 'Friend' }; }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    }
    function attestHTML() {
      const opts = attestOptions(), any = opts.some(function (o) { return o.ok; });
      const opt = function (o) {
        const on = (st.attest || '') === o.id && o.ok;
        return '<button type="button" class="gc-opt" role="radio" data-att="' + esc(o.id) + '" aria-checked="' + on + '"' + (o.ok ? '' : ' disabled aria-disabled="true"') + '>' +
          '<span class="gc-opt-main"><span class="gc-opt-l">' + esc(o.label) + '</span><span class="gc-opt-s">' + esc(o.why) + '</span></span><span class="gc-opt-k" aria-hidden="true">Selected</span></button>';
      };
      return '<p class="gc-lead">A playing partner can attest your score. This is optional.</p>' +
        '<div class="gc-opts" role="radiogroup" aria-label="Who attests your score">' + opt({ id: '', label: 'No attestation', ok: true, why: 'Post without a marker' }) + opts.map(opt).join('') + '</div>' +
        (!any ? '<p class="gc-hint">' + (tt ? (partners(tt, m.id).length ? 'None of your playing partners are on your friends list, so they cannot attest in the app.' : 'You played this round on your own.') : 'Add friends in Friends to have them attest your scores.') + '</p>' : '') +
        '<p class="gc-hint">In the demo the attestation is saved with your score. Nobody is notified.</p>';
    }

    /* ---- Render a step, then show the sticky action bar ---- */
    let dateField = null;
    function draw(focusTop) {
      view.innerHTML = frame(st.step === 'round' ? roundHTML() : st.step === 'score' ? scoreHTML() : attestHTML());
      if (st.step === 'round' && !tt) {
        const days = []; for (let i = 0; i <= 30; i++) days.push(Club.date.fromToday(-i));
        dateField = Portal.selectField(ui.$('.gc-date', view), { label: 'Date played', title: 'Date played', icon: 'calendar', value: st.date,
          rows: days.map(function (d, i) { return { value: d, label: i === 0 ? 'Today, ' + fmt.dateShort(d) : i === 1 ? 'Yesterday, ' + fmt.dateShort(d) : dayShort(d) }; }),
          onChange: function (v) { st.date = v; bar(); } });
      }
      bar();
      if (focusTop) { const h = ui.$('.gc-flow-h', view); window.scrollTo({ top: 0 }); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
    }
    function bar() {
      if (st.step === 'round') {
        Portal.actionBar.show({ summaryHTML: esc(st.holes + ' holes · ' + teeLabel(st.tees) + ' tees') + '<small>' + esc(tt ? dayShort(tt.date) + ' · ' + fmt.time(tt.time) : dayShort(st.date)) + '</small>', label: 'Continue', onClick: function () { go('score'); } });
      } else if (st.step === 'score') {
        const t = totals();
        Portal.actionBar.show({ summaryHTML: 'Total ' + t.gross + ' · Adjusted ' + t.adjusted + '<small>Course handicap ' + ch() + ' (demo)</small>', label: 'Continue', onClick: function () { if (validTotal()) go('attest'); } });
      } else {
        const name = st.attest ? memberName(st.attest) : '';
        Portal.actionBar.show({ summaryHTML: esc(name ? 'Attested by ' + name : 'No attestation') + '<small>Optional</small>', label: 'Review', onClick: review });
      }
    }
    function go(step) { st.step = step; draw(true); }
    function validTotal() {
      if (st.mode !== 'total') return true;
      const inp = ui.$('#gc-total-in', view), err = ui.$('.gc-total-err', view);
      const v = +inp.value, lo = +inp.min, hi = +inp.max;
      if (!inp.value || !isFinite(v) || v !== Math.round(v) || v < lo || v > hi) {
        err.textContent = 'Enter a whole number from ' + lo + ' to ' + hi + '.'; err.hidden = false; inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true'); inp.focus(); return false;
      }
      return true;
    }
    function refreshScore(n) {
      const t = totals(), h = hs(), i = h.findIndex(function (x) { return x.number === n; });
      const row = ui.$('.gc-hole[data-n="' + n + '"]', view);
      if (row && i >= 0) {
        const v = t.sc[i], capped = v > t.caps[i], val = ui.$('.gc-val', row);
        val.textContent = v; val.className = 'gc-val ' + (capped ? 'is-capped' : v < h[i].par ? 'is-under' : v > h[i].par ? 'is-over' : '');
        const cap = ui.$('.gc-hcap', row); cap.hidden = !capped; cap.textContent = 'Counts as ' + t.caps[i];
        ui.$('[data-d="-1"]', row).disabled = v <= 1; ui.$('[data-d="1"]', row).disabled = v >= 15;
      }
      ui.$$('[data-sum]', view).forEach(function (s) { s.textContent = s.dataset.sum === 'back' && st.holes === 18 ? t.inn : st.holes === 18 ? t.out : t.gross; });
      const sm = ui.$('.gc-sum', view); if (sm) sm.innerHTML = sumHTML(t);
      bar();
    }

    ui.on(view, 'click', '[data-act=back]', function () { go(STEPS[Math.max(0, stepIndex() - 1)].id); });
    ui.on(view, 'click', '[data-holes]', function (e, b) { st.holes = +b.dataset.holes; draw(); const x = ui.$('[data-holes="' + st.holes + '"]', view); if (x) x.focus(); });
    ui.on(view, 'click', '[data-nine]', function (e, b) { if (b.tagName !== 'BUTTON') return; st.nine = b.dataset.nine; draw(); const x = ui.$('button[data-nine="' + st.nine + '"]', view); if (x) x.focus(); });
    ui.on(view, 'click', '[data-tee]', function (e, b) { st.tees = b.dataset.tee; Portal.prefs.set('gc.tees', st.tees); draw(); const x = ui.$('[data-tee="' + st.tees + '"]', view); if (x) x.focus(); });
    ui.on(view, 'click', '[data-mode]', function (e, b) {
      if (st.mode === 'total') { const inp = ui.$('#gc-total-in', view); if (inp && inp.value) st.total = +inp.value; }
      st.mode = b.dataset.mode; Portal.prefs.set('gc.mode', st.mode); draw(); const x = ui.$('[data-mode="' + st.mode + '"]', view); if (x) x.focus();
    });
    ui.on(view, 'click', '[data-half]', function (e, b) {
      st.half = b.dataset.half;
      ui.$$('[data-half]', view).forEach(function (x) { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
      ui.$$('.gc-nine', view).forEach(function (s) { s.classList.toggle('is-off', s.dataset.nine !== st.half); });
    });
    ui.on(view, 'click', '.gc-hole .gc-stp', function (e, b) {
      const n = +b.closest('.gc-hole').dataset.n, h = holesAll().find(function (x) { return x.number === n; });
      const cur = st.byHole[n] != null ? st.byHole[n] : h.par;
      st.byHole[n] = Math.max(1, Math.min(15, cur + (+b.dataset.d)));
      refreshScore(n);
      if (b.disabled) { const o = ui.$('.gc-hole[data-n="' + n + '"] .gc-stp:not([disabled])', view); if (o) o.focus(); }
    });
    ui.on(view, 'click', '[data-t]', function (e, b) {
      const inp = ui.$('#gc-total-in', view); const v = (+inp.value || totals().gross) + (+b.dataset.t);
      inp.value = Math.max(+inp.min, Math.min(+inp.max, v)); st.total = +inp.value; inp.classList.remove('invalid'); inp.removeAttribute('aria-invalid'); ui.$('.gc-total-err', view).hidden = true; bar();
    });
    view.addEventListener('input', function (e) {
      if (e.target.id !== 'gc-total-in') return;
      const v = Math.round(+e.target.value); if (e.target.value && isFinite(v)) st.total = v;
      e.target.classList.remove('invalid'); e.target.removeAttribute('aria-invalid'); ui.$('.gc-total-err', view).hidden = true; bar();
    });
    view.addEventListener('keydown', function (e) { if (e.target.id === 'gc-total-in' && e.key === 'Enter') { e.preventDefault(); if (validTotal()) go('attest'); } });
    ui.on(view, 'click', '[data-att]', function (e, b) {
      if (b.disabled) return; st.attest = b.dataset.att || null;
      ui.$$('[data-att]', view).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); bar();
    });

    /* ---- Review sheet, then post (demo) ---- */
    function buildDoc() {
      const h = hs(), c = ch(), t = totals(), r = ratingFor(st.tees, st.holes);
      return {
        id: S.uid('sp'), memberId: m.id, date: st.date, time: st.time, teeTimeId: tt ? tt.id : null,
        holes: st.holes, nine: st.holes === 9 ? st.nine : null, tees: st.tees, entry: st.mode,
        holeScores: st.mode === 'hole' ? t.sc.slice() : null, gross: t.gross, adjusted: t.adjusted,
        courseHandicap: c, indexUsed: index, rating: r.rating, slope: r.slope, par: parOf(h), pcc: null,
        differential: differential(t.adjusted, st.tees, st.holes, index), attestedBy: st.attest || null,
        playedWith: tt ? partners(tt, m.id).map(partnerName) : (st.attest ? [memberName(st.attest)] : []),
        estimate: null, status: 'saved-in-demo', postedAt: new Date().toISOString(), demo: true,
        /* A round booked to count toward a friends league (js/core/friendleagues.js) carries the league here */
        friendLeagueId: leagueOf(tt, m.id)
      };
    }
    /* The same score already in the history: posted from this flow, or an identical manual entry minutes ago
       (a second tab, or the flow left open and posted again). */
    function samePost(d) {
      const key = function (x) { return [x.date, x.time || '', x.teeTimeId || '', x.holes, x.nine || '', x.tees, x.entry, x.gross, x.adjusted, (x.holeScores || []).join(','), x.attestedBy || ''].join('|'); };
      const k = key(d), since = new Date(Date.now() - 10 * 60000).toISOString();
      return postsOf(m.id).find(function (p) { return !p.seed && String(p.postedAt || '') >= since && key(p) === k; }) || null;
    }
    let posted = null;
    const flowHash = location.hash;
    function leave() { if (location.hash === flowHash) Portal.go(tt ? 'tee-times/mine' : 'scores'); }
    function review() {
      if (posted) { ui.toast('This score is already posted', 'bad'); leave(); return; }
      const d = buildDoc();
      const sh = Portal.openSheet({ title: 'Review your score', size: 'full',
        /* After posting, closing the confirmation any way (Done, X, Escape, tap outside) leaves the flow */
        onClose: function () { if (posted) leave(); },
        content: '<div class="gc-review">' + bannerHTML(false) +
          '<p class="gc-review-round">' + esc([dayShort(d.date), d.time ? fmt.time(d.time) : '', d.holes + ' holes' + (d.nine ? ' (' + d.nine + ' nine)' : ''), teeLabel(d.tees) + ' tees'].filter(Boolean).join(' · ')) + '</p>' +
          statsHTML(d.gross, d.adjusted, d.differential) +
          '<dl class="gc-kv">' +
            '<div><dt>Entered</dt><dd>' + (d.entry === 'hole' ? 'Hole by hole' : 'Total only') + '</dd></div>' +
            '<div><dt>Course handicap</dt><dd>' + d.courseHandicap + ' ' + demoPill() + '</dd></div>' +
            '<div><dt>Playing conditions</dt><dd>Calculated by Golf Canada</dd></div>' +
            '<div><dt>Attested by</dt><dd>' + esc(d.attestedBy ? memberName(d.attestedBy) : 'Not attested') + '</dd></div>' +
          '</dl>' +
          '<p class="gc-hint">The differential uses placeholder ratings' + (d.holes === 9 ? ' and the nine-hole expected score' : '') + ', so it is a demo figure. Golf Canada calculates the real one.</p></div>',
        footer: '<button type="button" class="btn btn-primary gc-full" data-act="post">Post to Golf Canada (demo)</button>' });
      ui.$('[data-act=post]', sh.foot).addEventListener('click', function () {
        if (posted) return;
        if (tt && postFor(m.id, tt.id)) { sh.close(); ui.toast('This round is already posted', 'bad'); Portal.go('scores'); return; }
        if (samePost(d)) { posted = samePost(d); ui.toast('This score is already posted', 'bad'); sh.close(); return; }
        const doc = S.insert('scorePosts', d);
        posted = doc;
        const est = estimateFor(m.id);
        S.update('scorePosts', doc.id, { estimate: est ? { index: est.index, used: est.used, of: est.of } : null });
        Portal.actionBar.hide();
        confirmView(sh, doc, est);
        ui.toast('Score saved in the demo');
      });
    }
    function confirmView(sh, doc, est) {
      const head = ui.$('.ps-head h2', sh.el); if (head) head.textContent = 'Saved in the demo';
      sh.setContent('<div class="gc-done">' +
        '<span class="gc-done-ic">' + Club.icon('check') + '</span>' +
        '<h3 class="gc-done-h">Score saved in this demo</h3>' +
        '<p class="gc-done-p">' + esc(doc.gross + ' (adjusted ' + doc.adjusted + ') on ' + dayShort(doc.date) + '. Nothing was sent to Golf Canada.') + '</p>' +
        (est ? '<div class="gc-new"><span class="gc-new-k">New handicap index</span><span class="gc-new-v">' + esc(fmt.handicap(est.index)) + '</span>' + demoPill('Demo estimate') +
          '<p class="gc-new-s">Best ' + est.used + ' of your last ' + est.of + ' differentials' + (est.adjust ? ', ' + est.adjust.toFixed(1).replace('-', 'minus ') : '') + (est.of < 20 ? ' (WHS uses the best 8 of 20 once you have 20 scores)' : '') +
          '. Your official index stays ' + esc(fmt.handicap(index)) + ' until Golf Canada updates it.</p></div>'
          : '<p class="gc-hint">Post at least 3 scores to see a demo estimate of your index.</p>') +
        '</div>');
      sh.setFooter('<div class="gc-done-acts"><a class="btn" href="#/scores">Score history</a><button type="button" class="btn btn-primary" data-act="done">Done</button></div>');
      ui.$('[data-act=done]', sh.foot).addEventListener('click', function () { sh.close(); });
      const t = ui.$('.gc-done-h', sh.body); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
    }

    draw(false);
    return function () { Portal.actionBar.hide(); };
  }

  /* ---------------- Profile > Golf: rows, link sheet and the index chart with the demo point ---------------- */
  function golfRowsHTML(m) {
    const n = postsOf(m.id).length;
    const row = function (attr, icon, label, sub) {
      const inner = Club.icon(icon, 'pp-set-ic') + '<span class="pp-set-main"><span class="pp-set-l">' + esc(label) + '</span><span class="pp-set-s">' + esc(sub) + '</span></span>' + Club.icon('chevronRight', 'pp-set-go');
      return '<li>' + (attr.indexOf('href') === 0 ? '<a class="pp-set" ' + attr + '>' + inner + '</a>' : '<button type="button" class="pp-set" ' + attr + ' aria-haspopup="dialog">' + inner + '</button>') + '</li>';
    };
    return '<ul class="p-list pp-settings gc-golf-rows" aria-label="Golf Canada (demo)">' +
      row('href="#/scores/post"', 'plus', 'Post a score', 'Demo, not sent to Golf Canada') +
      row('href="#/scores"', 'trophy', 'Score history', n ? n + (n === 1 ? ' score' : ' scores') + ' in this demo' : 'No scores yet') +
      row('data-gc-link', 'link', 'Link Golf Canada account', (m.ghin ? 'No. ' + m.ghin + ' · ' : '') + 'Not connected (demo)') +
      '</ul>';
  }
  function openLink(m) {
    Portal.openSheet({ title: 'Link Golf Canada account', content: '<div class="gc-link">' +
      '<dl class="gc-kv"><div><dt>Golf Canada no.</dt><dd class="num">' + (m.ghin ? esc(m.ghin) : 'Not recorded') + '</dd></div>' +
        '<div><dt>Status</dt><dd>Not connected (demo)</dd></div></dl>' +
      '<h3 class="gc-link-h">What linking will do</h3>' +
      '<ul class="gc-bullets"><li>Post scores from this app straight to your Golf Canada record.</li>' +
        '<li>Show your official handicap index and score history here.</li>' +
        '<li>Let a playing partner attest your score from their phone.</li></ul>' +
      '<p class="gc-link-p">The club is applying for access to Golf Canada. Once it has access, you will sign in with your Golf Canada account here to link it. Until then this is a demo: nothing is sent to or read from Golf Canada.</p>' +
      '</div>',
      footer: '<button type="button" class="btn gc-full" disabled>Link account (once the club has access)</button>' });
  }
  /* Index history (solid) and the latest demo estimate (dashed). Returns null when there is no demo estimate yet,
     so Profile keeps its usual chart. */
  function indexChart(m, hist) {
    const last = latestAppPost(m.id);
    if (!last || !hist || !hist.length) return null;
    return '<div class="pp-chart gc-chart"><h3 class="pp-chart-h">Your index over time</h3><div class="gc-ch" data-gc-chart>' + chartSVG(chartData(m, hist), 340) + '</div>' +
      '<p class="gc-ch-legend"><span><i class="gc-ch-key"></i>Index</span><span><i class="gc-ch-key is-demo"></i>Demo estimate ' + esc(fmt.handicap(last.estimate.index)) + ', ' + esc(fmt.dateShort(last.date)) + '</span></p></div>';
  }
  function chartData(m, hist) {
    const last = latestAppPost(m.id);
    return { pts: hist.map(function (h) { return { label: fmt.toDate(h.date).toLocaleDateString('en-US', { month: 'short' }), v: h.index }; }),
      demo: last ? { label: 'Demo', v: last.estimate.index } : null };
  }
  function chartSVG(d, W) {
    const H = 180, pl = 34, pr = 18, pt = 22, pb = 26;
    const vals = d.pts.map(function (p) { return p.v; }).concat(d.demo ? [d.demo.v] : []);
    const lo = Math.floor(Math.min.apply(null, vals) - 0.5), hi = Math.ceil(Math.max.apply(null, vals) + 0.5);
    const n = d.pts.length + (d.demo ? 1 : 0);
    const x = function (i) { return pl + (n <= 1 ? 0 : i * (W - pl - pr) / (n - 1)); };
    const y = function (v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1)); };
    const f = function (v) { return Math.round(v * 10) / 10; };
    const stepY = hi - lo > 4 ? 2 : 1;
    let s = '<svg class="gc-ch-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc('Handicap index from ' + d.pts[0].label + ' to ' + d.pts[d.pts.length - 1].label + ', ' + fmt.handicap(d.pts[0].v) + ' to ' + fmt.handicap(d.pts[d.pts.length - 1].v) + (d.demo ? '. Demo estimate ' + fmt.handicap(d.demo.v) + ', shown dashed.' : '')) + '">';
    for (let v = lo; v <= hi; v += stepY) s += '<line class="gc-ch-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + f(y(v)) + '" y2="' + f(y(v)) + '"/><text class="gc-ch-t" x="' + (pl - 8) + '" y="' + f(y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    const labels = d.pts.map(function (p) { return p.label; }).concat(d.demo ? [d.demo.label] : []);
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pl - pr) / 40))));
    labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) s += '<text class="gc-ch-t' + (d.demo && i === n - 1 ? ' is-demo' : '') + '" x="' + f(x(i)) + '" y="' + (H - 6) + '" text-anchor="' + (i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle') + '">' + esc(l) + '</text>'; });
    const pts = d.pts.map(function (p, i) { return f(x(i)) + ',' + f(y(p.v)); });
    s += '<polyline class="gc-ch-line" points="' + pts.join(' ') + '"/>';
    const li = d.pts.length - 1;
    s += '<circle class="gc-ch-dot" cx="' + f(x(li)) + '" cy="' + f(y(d.pts[li].v)) + '" r="3.5"/>';
    if (d.demo) {
      const dx = f(x(n - 1)), dy = f(y(d.demo.v));
      s += '<line class="gc-ch-demo" x1="' + f(x(li)) + '" y1="' + f(y(d.pts[li].v)) + '" x2="' + dx + '" y2="' + dy + '"/>' +
        '<circle class="gc-ch-ring" cx="' + dx + '" cy="' + dy + '" r="5"/>' +
        '<text class="gc-ch-t is-demo" x="' + f(dx - 9) + '" y="' + f(d.demo.v <= d.pts[li].v ? Math.min(dy + 19, H - pb - 2) : Math.max(dy - 10, 12)) + '" text-anchor="end">' + esc(fmt.handicap(d.demo.v)) + '</text>';
    }
    return s + '</svg>';
  }
  function wireGolf(sh, m) {
    ui.on(sh.body, 'click', '[data-gc-link]', function () { openLink(Club.store.find('members', m.id) || m); });
    const host = ui.$('[data-gc-chart]', sh.body); if (!host) return;
    const hist = S.all('handicapHistory').filter(function (h) { return h.memberId === m.id && typeof h.index === 'number'; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(-12);
    let w0 = 0;
    const fit = function () { const w = Math.round(host.clientWidth); if (w && Math.abs(w - w0) > 3) { w0 = w; host.innerHTML = chartSVG(chartData(m, hist), w); } };
    requestAnimationFrame(fit);
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(host); }
  }

  /* ---------------- Hooks for Home and My tee times ---------------- */
  function homePrompt(m) {
    if (!m || !isGolfer(m)) return '';
    const list = toPost(m, RECENT_DAYS); if (!list.length) return '';
    const t = list[0], o = partners(t, m.id);
    const when = t.date === Club.date.today() ? 'today, ' + fmt.time(t.time) : fmt.weekday(t.date) + ' ' + fmt.time(t.time);
    return '<a class="gc-home" href="#/scores/post/' + encodeURIComponent(t.id) + '" aria-label="' + esc('Post your score from ' + when + ', ' + t.holes + ' holes' + (o.length ? ' with ' + niceList(o.map(partnerName)) : '') + '. Demo, not sent to Golf Canada') + '">' +
      '<span class="gc-home-main"><span class="gc-home-t">Post your score from ' + esc(when) + '</span>' +
      '<span class="gc-home-s">' + esc(t.holes + ' holes' + (list.length > 1 ? ' · ' + (list.length - 1) + ' more to post' : '')) + ' ' + demoPill() + '</span></span>' +
      Club.icon('chevronRight', 'gc-go') + '</a>';
  }
  /* The same prompt as a Coming up row on Home ("To do" group): date, title, one meta line. */
  function homeItem(m) {
    if (!m || !isGolfer(m)) return null;
    const list = toPost(m, RECENT_DAYS); if (!list.length) return null;
    const t = list[0];
    return { date: t.date, time: t.time, title: 'Post your score', badge: ' ' + demoPill(), sub: t.holes + ' holes' + (list.length > 1 ? ' · ' + (list.length - 1) + ' more to post' : ''), href: '#/scores/post/' + encodeURIComponent(t.id) };
  }
  function pastCell(tt, m) {
    const p = postFor(m.id, tt.id);
    if (p) return '<span class="tt-pill">Posted ' + p.gross + '</span>';
    return '<a class="btn btn-sm gc-post-btn" href="#/scores/post/' + encodeURIComponent(tt.id) + '" aria-label="' + esc('Post score for ' + dayShort(tt.date) + ' at ' + fmt.time(tt.time)) + '">Post score</a>';
  }
  function detailAction(tt, m) {
    if (tt.status === 'completed' || !canPost(tt, m.id) || postFor(m.id, tt.id)) return '';
    return '<a class="btn" href="#/scores/post/' + encodeURIComponent(tt.id) + '">Post score</a>';
  }

  Portal.scores = {
    homeItem: homeItem,
    DEMO_RATINGS: DEMO_RATINGS,
    calc: { courseHandicap: courseHandicap, strokesPerHole: strokesPerHole, ndbCaps: ndbCaps, adjustedOf: adjustedOf, differential: differential, estimate: estimate, holesFor: holesFor },
    demoPosts: demoPosts, postsOf: postsOf, postFor: postFor, teeLabel: teeLabel, diffText: diffText, openPost: openPost, estimateFor: estimateFor, canPost: canPost, toPost: toPost,
    homePrompt: homePrompt, pastCell: pastCell, detailAction: detailAction,
    golfRowsHTML: golfRowsHTML, indexChart: indexChart, wireGolf: wireGolf, openLink: openLink
  };

  Portal.register({
    id: 'scores', label: 'Scores', icon: 'trophy', order: 72, tab: false, nav: false,
    render: function (view, params, member) {
      const m = Portal.member() || member;
      if (!isGolfer(m)) { view.innerHTML = ui.empty({ icon: 'flag', title: 'Scores are for golfing members', text: 'Your membership does not include golf. The golf shop can tell you about golfing memberships.' }); return; }
      if (params[0] === 'post') return renderFlow(view, m, params[1] || null);
      renderOverview(view, m);
    }
  });
})();
