/* Portal: Friends. Request-and-accept friendships between members, a friend's quick rundown (handicap,
   upcoming tee times, league and tournament results, each shown only if that friend shares it), private
   one-to-one messages between friends, blocking and reporting a message to club staff.

   Collections (seeded here once; schemas documented in SPEC.md):
     friendships    { id, from, to, status: 'pending'|'accepted'|'declined'|'cancelled'|'removed'|'blocked',
                      blockedBy, createdAt, respondedAt }      Docs are never deleted; a new doc starts a new relationship.
     memberMessages { id, from, to, body, at, readAt }
     messageReports { id, messageId, reporterId, reportedId, body, reason, note, at, status: 'open'|'dismissed'|'contacted', handledAt }
     memberPrivacy  { id: 'prv_' + memberId, memberId, teeTimes, handicap, scores, requests: 'all'|'none' }
     friendSharing  { id: 'fs_' + owner + '_' + friend, owner, friend, see: bool, join: bool }   per-friend tee time sharing
     joinRequests   { id, teeTimeId, requesterId, ownerId, party: [players as for a join], status: 'pending'|'approved'|
                      'declined'|'cancelled'|'expired', createdAt, decidedAt, reason }
   Staff never see conversations; a reported message appears in the staff dashboard "For your attention" list. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const ACTIVE = ['pending', 'accepted', 'blocked'];
  const DEFAULT_PRIVACY = { teeTimes: true, handicap: true, scores: true, requests: 'all' };
  const REASONS = ['Harassment or bullying', 'Offensive language', 'Spam or selling', 'Something else'];
  const MINUS = '−';

  function today() { return Club.date.today(); }
  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function member(id) { return S.find('members', id); }
  function nameOf(id) { const m = member(id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function firstOf(id) { const m = member(id); return m ? m.firstName : 'This member'; }
  function tierOf(m) { return m ? S.find('membershipTiers', m.tierId) : null; }
  function isGolfer(m) { if (!m || m.status !== 'active') return false; const t = tierOf(m); return t ? !!t.golf : m.tierId !== 'tier_social'; }
  function wide() { return !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches); }
  function dayShort(d) { return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short' }); }
  function dayLabel(d) {
    if (d === today()) return 'Today';
    if (d === Club.date.addDays(today(), 1)) return 'Tomorrow';
    return fmt.toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function msgTime(iso) {
    const dt = new Date(iso); const d = Club.date.iso(dt); const td = today();
    if (d === td) return fmt.time(dt);
    if (d === Club.date.addDays(td, -1)) return 'Yesterday';
    const diff = Math.round((fmt.toDate(td) - fmt.toDate(d)) / 86400000);
    return diff < 7 ? dt.toLocaleDateString('en-US', { weekday: 'short' }) : fmt.dateShort(d);
  }
  function ago(iso) { const r = fmt.relative(Club.date.iso(new Date(iso))); return r === 'Today' ? 'today' : r === 'Yesterday' ? 'yesterday' : r.toLowerCase(); }

  /* ---------------- Tee times ---------------- */
  function upcomingTee(memberId, limit) {
    const td = today(), nm = nowMin();
    return S.all('teeTimes').filter(function (t) {
      if (!t || ['booked', 'checked-in'].indexOf(t.status) < 0 || t.date < td) return false;
      if (t.date === td && toMin(t.time) < nm) return false;
      return (t.players || []).some(function (p) { return p.memberId === memberId; });
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }).slice(0, limit || 99);
  }
  function hasPlayer(t, id) { return (t.players || []).some(function (p) { return p.memberId === id; }); }
  function openSpots(t) { return Math.max(0, 4 - (t.players || []).length); }
  function teeLabel(t) { return dayLabel(t.date) + ' ' + fmt.time(t.time); }

  /* ---------------- Seed (once) ---------------- */
  (function seed() {
    const ME = S.find('members', 'mem_1003') ? 'mem_1003' : null;
    if (!ME) { S.seed('friendships', []); S.seed('memberMessages', []); S.seed('messageReports', []); S.seed('memberPrivacy', []); return; }
    const lg = (S.all('leagues') || [])[0];
    const inLeague = function (id) { return !!(lg && (lg.members || []).indexOf(id) >= 0); };
    const cands = S.all('members').filter(function (m) { return m.id !== ME && isGolfer(m); })
      .map(function (m) { return { id: m.id, no: +m.memberNo, score: (upcomingTee(m.id, 1).length ? 2 : 0) + (inLeague(m.id) ? 1 : 0) }; })
      .sort(function (a, b) { return b.score - a.score || a.no - b.no; }).map(function (c) { return c.id; });
    const friends = cands.slice(0, 4), incoming = cands.slice(4, 6), outgoing = cands.slice(6, 7);
    const at = function (days, h) { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h || 10, 15, 0, 0); return d.toISOString(); };
    S.seed('friendships', function () {
      const out = [];
      friends.forEach(function (id, i) {
        const mine = i % 2 === 0;
        out.push({ from: mine ? ME : id, to: mine ? id : ME, status: 'accepted', createdAt: at(60 - i * 9), respondedAt: at(58 - i * 9) });
      });
      incoming.forEach(function (id, i) { out.push({ from: id, to: ME, status: 'pending', createdAt: at(1 + i * 2, 18) }); });
      outgoing.forEach(function (id) { out.push({ from: ME, to: id, status: 'pending', createdAt: at(4, 9) }); });
      return out;
    });
    S.seed('memberMessages', function () {
      const out = [];
      if (friends[0]) {
        const f = friends[0];
        out.push({ from: f, to: ME, body: 'Good round on Saturday. Same time next week?', at: at(3, 17), readAt: at(3, 18) });
        out.push({ from: ME, to: f, body: 'Count me in. I will book something early if it is open.', at: at(3, 19), readAt: at(2, 8) });
        out.push({ from: f, to: ME, body: 'Perfect, see you on the first tee.', at: at(1, 9), readAt: null });
      }
      if (friends[1]) {
        const f = friends[1];
        out.push({ from: ME, to: f, body: 'Are you playing on Wednesday night?', at: at(6, 12), readAt: at(6, 13) });
        out.push({ from: f, to: ME, body: 'Not this week, but I will be back the week after.', at: at(6, 14), readAt: at(6, 15) });
      }
      return out;
    });
    S.seed('messageReports', []);
    S.seed('memberPrivacy', function () {
      const out = [{ id: 'prv_' + ME, memberId: ME, teeTimes: true, handicap: true, scores: true, requests: 'all' }];
      /* One friend keeps tee times private, so the "keeps tee times private" line can be seen. */
      if (friends[3]) out.push({ id: 'prv_' + friends[3], memberId: friends[3], teeTimes: false, handicap: true, scores: true, requests: 'all' });
      return out;
    });
  })();

  /* ---------------- Relationships ---------------- */
  function pairDocs(a, b) { return S.all('friendships').filter(function (f) { return (f.from === a && f.to === b) || (f.from === b && f.to === a); }); }
  function current(a, b) {
    return pairDocs(a, b).filter(function (f) { return ACTIVE.indexOf(f.status) >= 0; })
      .sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); })[0] || null;
  }
  /** 'friends' | 'outgoing' | 'incoming' | 'blocked' (I blocked them) | 'blockedMe' | 'none' */
  function state(me, other) {
    const f = current(me, other); if (!f) return 'none';
    if (f.status === 'accepted') return 'friends';
    if (f.status === 'blocked') return f.blockedBy === me ? 'blocked' : 'blockedMe';
    return f.from === me ? 'outgoing' : 'incoming';
  }
  function friendsOf(me) {
    const seen = {};
    S.all('friendships').forEach(function (f) {
      if (f.status !== 'accepted' || (f.from !== me && f.to !== me)) return;
      const o = f.from === me ? f.to : f.from;
      if (member(o) && state(me, o) === 'friends') seen[o] = 1;
    });
    return Object.keys(seen).sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); });
  }
  function incoming(me) { return S.all('friendships').filter(function (f) { return f.to === me && f.status === 'pending' && member(f.from); }); }
  function outgoing(me) { return S.all('friendships').filter(function (f) { return f.from === me && f.status === 'pending' && member(f.to); }); }
  function blockedBy(me) { return S.all('friendships').filter(function (f) { return f.status === 'blocked' && f.blockedBy === me; }).map(function (f) { return f.from === me ? f.to : f.from; }); }

  function privacy(id) {
    const d = S.all('memberPrivacy').find(function (p) { return p.memberId === id; });
    return Object.assign({}, DEFAULT_PRIVACY, d || {});
  }
  function setPrivacy(id, patch) {
    const d = S.all('memberPrivacy').find(function (p) { return p.memberId === id; });
    if (d) S.update('memberPrivacy', d.id, patch);
    else S.insert('memberPrivacy', Object.assign({ id: 'prv_' + id, memberId: id }, DEFAULT_PRIVACY, patch));
  }

  /* ---------------- Per-friend tee time sharing ----------------
     The owner's global "Upcoming tee times" setting applies first; then, per friend, "Can see my tee times" and
     "Can join without asking" (both on unless the owner switched them off). */
  function sharing(owner, friend) {
    const d = S.all('friendSharing').find(function (x) { return x.owner === owner && x.friend === friend; });
    return { see: d ? d.see !== false : true, join: d ? d.join !== false : true };
  }
  function setSharing(owner, friend, patch) {
    const id = 'fs_' + owner + '_' + friend; const d = S.find('friendSharing', id);
    if (d) S.update('friendSharing', id, patch); else S.insert('friendSharing', Object.assign({ id: id, owner: owner, friend: friend, see: true, join: true }, patch));
  }
  function seesTees(viewer, owner) { return !!privacy(owner).teeTimes && sharing(owner, viewer).see; }
  function joinsFree(viewer, owner) { return seesTees(viewer, owner) && sharing(owner, viewer).join; }
  /** How `owner` shares tee times with `friend`, in words. */
  function shareLabel(owner, friend) {
    if (!privacy(owner).teeTimes) return 'Hidden from all friends';
    const s = sharing(owner, friend); return !s.see ? 'Hidden' : s.join ? 'Can see and join' : 'Can see, must ask';
  }

  function now() { return new Date().toISOString(); }
  function sendRequest(me, other) {
    const st = state(me, other);
    if (st === 'blocked' || st === 'blockedMe' || privacy(other).requests === 'none') { ui.toast(firstOf(other) + ' is not accepting friend requests'); return false; }
    if (st !== 'none') return false;
    S.insert('friendships', { from: me, to: other, status: 'pending', createdAt: now() });
    ui.toast('Request sent to ' + nameOf(other));
    return true;
  }
  function setStatus(doc, status, extra) { S.update('friendships', doc.id, Object.assign({ status: status, respondedAt: now() }, extra || {})); }
  function block(me, other) {
    const f = current(me, other);
    if (f) setStatus(f, 'blocked', { blockedBy: me });
    else S.insert('friendships', { from: me, to: other, status: 'blocked', blockedBy: me, createdAt: now(), respondedAt: now() });
  }
  function unblock(me, other) { const f = current(me, other); if (f && f.status === 'blocked' && f.blockedBy === me) setStatus(f, 'removed'); }

  /* ---------------- Messages ---------------- */
  function thread(a, b) { return S.all('memberMessages').filter(function (m) { return (m.from === a && m.to === b) || (m.from === b && m.to === a); }).sort(function (x, y) { return String(x.at).localeCompare(String(y.at)); }); }
  function unreadFrom(me, other) { return S.all('memberMessages').filter(function (m) { return m.to === me && m.from === other && !m.readAt; }); }
  function unreadCount(me) {
    return S.all('memberMessages').filter(function (m) { return m.to === me && !m.readAt && state(me, m.from) !== 'blocked'; }).length;
  }
  function convos(me) {
    const last = {};
    S.all('memberMessages').forEach(function (m) {
      if (m.from !== me && m.to !== me) return;
      const o = m.from === me ? m.to : m.from;
      if (state(me, o) === 'blocked' || !member(o)) return;
      if (!last[o] || String(m.at) > String(last[o].at)) last[o] = m;
    });
    return Object.keys(last).map(function (o) { return { other: o, last: last[o], unread: unreadFrom(me, o).length }; })
      .sort(function (a, b) { return String(b.last.at).localeCompare(String(a.last.at)); });
  }
  function markRead(me, other) { unreadFrom(me, other).forEach(function (m) { S.update('memberMessages', m.id, { readAt: now() }); }); }
  function preview(t) { t = String(t || ''); return t.length > 90 ? t.slice(0, 90).replace(/\s+\S*$/, '') + '…' : t; }
  function leagueInvites(me) { return Portal.friendLeagues ? Portal.friendLeagues.inviteCount(me) : 0; }
  function badgeCount(me) { return incoming(me).length + unreadCount(me) + joinInbox(me).length + leagueInvites(me); }

  /* ---------------- Results (real data only) ---------------- */
  const COURSE = { rating: 73.1, slope: 135 };
  const DEFAULT_PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5];
  const DEFAULT_HCP = [7, 3, 15, 1, 11, 9, 17, 5, 13, 8, 16, 2, 12, 6, 10, 18, 14, 4];
  function holeList() {
    const hs = S.all('holes').slice().sort(function (a, b) { return a.number - b.number; });
    return hs.length === 18 ? hs : DEFAULT_PARS.map(function (p, i) { return { number: i + 1, par: p, handicap: DEFAULT_HCP[i] }; });
  }
  function courseHcp(idx, hs) { const par = hs.reduce(function (a, h) { return a + h.par; }, 0); return idx == null ? 0 : Math.round(idx * COURSE.slope / 113 + (COURSE.rating - par)); }
  function strokesOn(ch, si) { if (ch >= 0) return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0); const b = -ch; return -(Math.floor(b / 18) + (si > 18 - b % 18 ? 1 : 0)); }
  /** Same scoring as the events leaderboard: net to par, positions with ties. */
  function finish(t, memberId) {
    const hs = holeList(); const stable = t.format === 'Stableford';
    const lines = (t.field || []).map(function (p) {
      const ch = courseHcp(p.handicap, hs); const o = { id: p.memberId, thru: 0, gross: 0, par: 0, strokes: 0, pts: 0 };
      (p.scores || []).forEach(function (s, i) { if (s == null || !hs[i]) return; const st = strokesOn(ch, hs[i].handicap); o.thru++; o.gross += s; o.par += hs[i].par; o.strokes += st; o.pts += Math.max(0, 2 + hs[i].par + st - s); });
      o.toPar = o.gross - o.strokes - o.par; return o;
    }).filter(function (l) { return l.thru; });
    const key = function (l) { return stable ? -l.pts : l.toPar; };
    lines.sort(function (a, b) { return key(a) - key(b) || b.thru - a.thru; });
    const me = lines.find(function (l) { return l.id === memberId; }); if (!me) return null;
    const first = lines.findIndex(function (l) { return key(l) === key(me); });
    const tied = lines.filter(function (l) { return key(l) === key(me); }).length > 1;
    return { pos: (tied ? 'T' : '') + (first + 1), rank: first + 1, of: lines.length, thru: me.thru, score: stable ? me.pts + ' pts' : (me.toPar === 0 ? 'E' : (me.toPar < 0 ? MINUS + Math.abs(me.toPar) : '+' + me.toPar)) + ' net' };
  }
  function tournaments(id) {
    const yr = today().slice(0, 4);
    return S.all('tournaments').filter(function (t) { return (t.status === 'final' || t.status === 'live') && String(t.date).slice(0, 4) === yr && (t.field || []).some(function (p) { return p.memberId === id; }); })
      .map(function (t) { return { t: t, r: finish(t, id) }; }).filter(function (x) { return x.r; })
      .sort(function (a, b) { return String(b.t.date).localeCompare(String(a.t.date)); });
  }
  function leagueFor(id) {
    if (!Club.league || !Club.league.current) return null;
    const lg = Club.league.current(); if (!lg || (lg.members || []).indexOf(id) < 0) return null;
    const st = Club.league.standings(lg); const row = st.rows.find(function (r) { return r.memberId === id; });
    if (!row || !row.rounds) return null;
    const nights = (lg.weeks || []).filter(function (w) { return Club.league.isPlayed(w); }).slice(-12).reverse()
      .map(function (w) { const r = Club.league.weekRank(w, lg).find(function (x) { return x.memberId === id; }); return r ? { date: w.date, points: r.points, place: (r.tied ? 'T' : '') + r.place } : null; })
      .filter(Boolean).slice(0, 3);
    return { lg: lg, row: row, of: st.rows.filter(function (r) { return r.rounds; }).length, nights: nights, status: Club.league.status(lg) };
  }

  /* ---------------- Hand and recent rounds ---------------- */
  const ROUNDS_SHOWN = 3;
  function handText(m) { const h = Club.members.hand(m); return h ? 'Plays ' + h.toLowerCase() : 'Hand not recorded'; }
  /** Posted scores, newest first (from Scores, js/portal/scores.js). */
  function roundsOf(id) { return Portal.scores && Portal.scores.postsOf ? Portal.scores.postsOf(id) : []; }
  function roundRowHTML(r, hidden) {
    const sc = Portal.scores; const tees = sc.teeLabel ? sc.teeLabel(r.tees) : r.tees;
    const when = fmt.toDate(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const sub = tees + ' tees · ' + r.holes + ' holes' + (sc.diffText ? ' · Differential ' + sc.diffText(r) : '');
    return '<li' + (hidden ? ' hidden' : '') + '><button type="button" class="fr-round" data-fr="round" data-id="' + esc(r.id) + '" aria-label="' + esc(when + ', ' + sub + ', score ' + r.gross + '. Open scorecard') + '">' +
      '<span class="fr-tee-main"><span class="fr-tee-when">' + esc(when) + '</span><span class="fr-tee-sub">' + esc(sub) + '</span></span>' +
      '<span class="fr-round-score">' + r.gross + '</span>' + Club.icon('chevronRight', 'fr-go') + '</button></li>';
  }

  /* ---------------- Friend rundown ---------------- */
  function quiet(text) { return '<p class="fr-quiet">' + Club.icon('eye') + '<span>' + esc(text) + '</span></p>'; }
  function profileHTML(me, fid) {
    const m = member(fid); if (!m) return '<p class="fr-quiet">This member is no longer listed.</p>';
    const t = tierOf(m); const pv = privacy(fid); const first = m.firstName; const mineShare = shareLabel(me, fid);
    let h = '<div class="fr-p-head">' + ui.avatar(m.firstName + ' ' + m.lastName, 'lg') +
      '<div class="fr-p-id"><h2 class="fr-p-name">' + esc(m.firstName + ' ' + m.lastName) + '</h2><p class="fr-p-sub">' + esc((t ? t.name : 'Member') + (m.memberSince ? ' · Member since ' + String(m.memberSince).slice(0, 4) : '')) + '</p>' +
      '<p class="fr-p-hand">' + Club.icon('flag') + '<span>' + esc(handText(m)) + '</span></p></div></div>' +
      '<div class="fr-p-acts"><button type="button" class="btn btn-primary btn-sm" data-fr="message" data-id="' + esc(fid) + '">' + Club.icon('mail') + '<span>Message</span></button>' +
      '<button type="button" class="btn btn-sm" data-fr="menu" data-id="' + esc(fid) + '" aria-haspopup="dialog">' + Club.icon('more') + '<span>More</span></button></div>' +
      '<button type="button" class="fr-share-row" data-fr="sharing" data-id="' + esc(fid) + '" aria-haspopup="dialog">' + Club.icon('key', 'fr-share-ic') + '<span class="fr-share-main"><span class="fr-share-l">Your tee times</span><span class="fr-share-v">' + esc(mineShare) + '</span></span>' + Club.icon('chevronRight', 'fr-go') + '</button>';

    /* Handicap */
    h += '<section class="fr-sec"><h3 class="eyebrow">Handicap</h3>';
    if (!pv.handicap) h += quiet(first + ' keeps their handicap private');
    else if (m.handicap == null) h += '<p class="fr-quiet">No handicap index on record.</p>';
    else {
      const hist = S.all('handicapHistory').filter(function (x) { return x.memberId === fid && typeof x.index === 'number'; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      const yr = today().slice(0, 4); const season = hist.filter(function (x) { return String(x.date).slice(0, 4) === yr; });
      const vals = hist.slice(-12).map(function (x) { return x.index; }); if (!vals.length || vals[vals.length - 1] !== m.handicap) vals.push(m.handicap);
      const ch = season.length ? Math.round((m.handicap - season[0].index) * 10) / 10 : null;
      h += '<div class="fr-hcp"><div><span class="fr-hcp-v">' + esc(fmt.handicap(m.handicap)) + '</span>' +
        (ch != null ? '<span class="fr-hcp-c">' + (Math.abs(ch) < 0.1 ? 'No change this season' : (ch < 0 ? 'Down ' + Math.abs(ch).toFixed(1) : 'Up ' + ch.toFixed(1)) + ' this season') + '</span>' : '') + '</div>' +
        (vals.length > 1 ? '<span class="fr-spark" aria-hidden="true">' + Club.charts.sparkline(vals, { width: 140, height: 40, color: 'var(--forest-500)' }) + '</span>' : '') + '</div>';
    }
    h += '</section>';

    /* Tee times */
    h += '<section class="fr-sec"><h3 class="eyebrow">Upcoming tee times</h3>';
    if (!seesTees(me, fid)) h += quiet(first + ' keeps tee times private');
    else {
      const tees = upcomingTee(fid);
      const shared = tees.filter(function (x) { return hasPlayer(x, me); });
      if (shared.length) h += '<p class="fr-shared">' + Club.icon('check') + '<span>You’re both playing ' + esc(shared.slice(0, 2).map(teeLabel).join(' and ')) + (shared.length > 2 ? ' and ' + (shared.length - 2) + ' more' : '') + '</span></p>';
      if (!tees.length) h += '<p class="fr-quiet">No upcoming tee times.</p>';
      else h += '<ul class="p-list fr-golf fr-tees">' + tees.map(function (x, i) { return golfRowHTML(me, { tee: x, friends: [fid] }, true, i >= 4); }).join('') + '</ul>' +
        (tees.length > 4 ? '<button type="button" class="p-link fr-more-tees" data-fr="more-tees" aria-expanded="false">Show all (' + tees.length + ')</button>' : '');
    }
    h += '</section>';

    /* Scores and results */
    const lr = leagueFor(fid); const tr = tournaments(fid); const rounds = roundsOf(fid);
    if (!pv.scores) h += '<section class="fr-sec"><h3 class="eyebrow">Scores and results</h3>' + quiet(first + ' keeps scores and results private') + '</section>';
    else if (lr || tr.length || rounds.length) {
      h += '<section class="fr-sec"><h3 class="eyebrow">Scores and results</h3>';
      if (rounds.length) {
        h += '<h4 class="fr-sub-h">Recent rounds</h4><ul class="p-list fr-rounds">' + rounds.map(function (r, i) { return roundRowHTML(r, i >= ROUNDS_SHOWN); }).join('') + '</ul>' +
          (rounds.length > ROUNDS_SHOWN ? '<button type="button" class="p-link fr-more-rounds" data-fr="more-rounds" aria-expanded="false">Show all (' + rounds.length + ')</button>' : '');
      }
      if (lr || tr.length) h += (rounds.length ? '<h4 class="fr-sub-h">League and tournaments</h4>' : '');
      h += '<ul class="p-list fr-results">';
      if (lr) h += '<li><span class="fr-tee-main"><span class="fr-tee-when">' + esc(lr.lg.name) + '</span><span class="fr-tee-sub">' + esc((lr.status === 'complete' ? 'Final standing ' : 'Standing ') + lr.row.pos + ' of ' + lr.of + ' · ' + lr.row.total + ' points') + '</span>' +
        (lr.nights.length ? '<span class="fr-tee-sub">Last nights: ' + esc(lr.nights.map(function (n) { return fmt.dateShort(n.date) + ' ' + n.points + ' pts (' + n.place + ')'; }).join(', ')) + '</span>' : '') + '</span></li>';
      tr.forEach(function (x) {
        h += '<li><span class="fr-tee-main"><span class="fr-tee-when">' + esc(x.t.name) + '</span><span class="fr-tee-sub">' + esc((x.t.status === 'live' ? 'Playing now: ' + x.r.pos + ' after ' + x.r.thru + ' holes' : 'Finished ' + x.r.pos + ' of ' + x.r.of) + ' · ' + x.r.score) + '</span></span></li>';
      });
      const finals = tr.filter(function (x) { return x.t.status === 'final'; }).sort(function (a, b) { return a.r.rank - b.r.rank; });
      if (finals.length) h += '<li><span class="fr-tee-main"><span class="fr-tee-when">Best result this season</span><span class="fr-tee-sub">' + esc(finals[0].r.pos + ', ' + finals[0].t.name) + '</span></span></li>';
      h += '</ul></section>';
    }
    return h;
  }

  /* ---------------- Friends golfing and joining ----------------
     Who can join is decided by Portal.teeTimes (js/portal/teetimes.js), the same rules and store writes the
     Tee times page uses: booking window, play times, blocks, max four players and no overlapping rounds. */
  function TT() { return Portal.teeTimes || null; }
  function jState(me, tt) { const m = member(me); return TT() && m ? TT().joinState(m, tt.id) : { ok: false, code: 'na', reason: 'Booking is not available' }; }
  /** Friend tee times from today through `days` ahead, one entry per group with every friend in it. */
  function golfing(me, days) {
    const end = Club.date.addDays(today(), days == null ? 7 : days); const by = {};
    friendsOf(me).forEach(function (fid) {
      if (!seesTees(me, fid)) return;
      upcomingTee(fid).forEach(function (t) { if (t.date > end) return; (by[t.id] = by[t.id] || { tee: t, friends: [] }).friends.push(fid); });
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (a.tee.date + a.tee.time).localeCompare(b.tee.date + b.tee.time); });
  }
  function namesOf(ids, full) {
    const n = ids.map(function (id) { return full ? nameOf(id) : firstOf(id); });
    return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }
  function spotsText(tt) { const o = openSpots(tt); return o ? o + (o === 1 ? ' spot open' : ' spots open') : 'Full'; }
  /** The friend in this group who asks Dave to request first (null when every friend lets him join freely). */
  function askOwner(me, tt, fids) { return (fids || friendsOf(me).filter(function (f) { return hasPlayer(tt, f) && seesTees(me, f); })).find(function (f) { return !joinsFree(me, f); }) || null; }
  function joinCell(me, tt, who, fids) {
    const st = jState(me, tt);
    const req = st.code === 'mine' ? null : myRequest(me, tt.id);
    if (req && req.status === 'pending') return '<span class="fr-in fr-asked">' + Club.icon('clock') + '<span>Requested</span></span><button type="button" class="p-link" data-fr="cancel-req" data-req="' + esc(req.id) + '" aria-label="Cancel request to join ' + esc(teeLabel(tt)) + '">Cancel request</button>';
    const owner = st.ok ? askOwner(me, tt, fids) : null;
    if (req && req.status === 'declined' && (owner || !st.ok)) return '<span class="fr-why">Declined</span>';
    if (st.ok && owner) return '<button type="button" class="btn btn-sm fr-join fr-ask" data-fr="ask" data-tee="' + esc(tt.id) + '" data-owner="' + esc(owner) + '" aria-label="Request to join ' + esc(who) + ', ' + esc(teeLabel(tt)) + '">Request to join</button>';
    if (st.ok) return '<button type="button" class="btn btn-primary btn-sm fr-join" data-fr="join" data-tee="' + esc(tt.id) + '" aria-label="Join ' + esc(who) + ', ' + esc(teeLabel(tt)) + '">Join</button>';
    if (st.code === 'mine') return '<span class="fr-in">' + Club.icon('check') + '<span>You’re in</span></span><button type="button" class="p-link fr-leave" data-fr="leave" data-tee="' + esc(tt.id) + '" aria-label="Leave the ' + esc(teeLabel(tt)) + ' tee time">Leave</button>';
    return '<span class="fr-why">' + esc(st.reason) + '</span>';
  }
  /** One row: friend name(s), time, holes, spots open, and Join or the reason Dave cannot. */
  function golfRowHTML(me, g, withDay, hidden) {
    const t = g.tee; const who = namesOf(g.friends);
    const lead = withDay ? teeLabel(t) : fmt.time(t.time) + ' · ' + who;
    return '<li class="fr-g"' + (hidden ? ' hidden' : '') + '><span class="fr-g-main"><span class="fr-g-who">' + esc(lead) + '</span>' +
      '<span class="fr-g-sub">' + esc(t.holes + ' holes · ' + spotsText(t)) + '</span></span>' +
      '<span class="fr-g-act">' + joinCell(me, t, who, g.friends) + '</span></li>';
  }
  function golfingHTML(me, list, limit) {
    const shown = limit ? list.slice(0, limit) : list; let html = '', day = null;
    shown.forEach(function (g) {
      if (g.tee.date !== day) { if (day) html += '</ul>'; day = g.tee.date; html += '<h3 class="eyebrow fr-day">' + esc(dayLabel(day)) + '</h3><ul class="p-list fr-golf">'; }
      html += golfRowHTML(me, g);
    });
    return html + (day ? '</ul>' : '');
  }
  /** "Priya A. and 1 guest", named as `viewer` (who reads it) should see them: friends in full, others "First L.". */
  function withWhom(players, me, viewer) {
    const mem = players.filter(function (p) { return p.type === 'member' && p.memberId !== me; }).map(function (p) { return Portal.playerLabel(p, viewer || me); });
    const g = players.filter(function (p) { return p.type === 'guest'; }).length;
    const parts = mem.concat(g ? [g + (g === 1 ? ' guest' : ' guests')] : []);
    return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  function sendAuto(me, tt, added) {
    const when = fmt.time(tt.time) + ' tee time' + (tt.date === today() ? '' : ' on ' + fmt.toDate(tt.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    friendsOf(me).filter(function (fid) { return hasPlayer(tt, fid); }).forEach(function (fid) {
      const extra = withWhom(added || [], me, fid);   /* named as this friend should see them */
      S.insert('memberMessages', { from: me, to: fid, body: firstOf(me) + ' joined your ' + when + (extra ? ' with ' + extra : ''), at: now(), readAt: null, auto: 'join', teeTimeId: tt.id });
    });
  }
  /** Join sheet: the Tee times player editor (you, walk or cart, add a member or guest, fees), then Confirm.
      Everyone is added through Portal.teeTimes.join: the same checks as booking, all or nothing. */
  function openJoin(me, ttId, after, ownerId) {
    const tt = S.find('teeTimes', ttId); const T = TT(); const mem = member(me); if (!tt || !T || !mem) return;
    const fids = friendsOf(me).filter(function (fid) { return hasPlayer(tt, fid) && seesTees(me, fid); });
    const ask = !!ownerId;
    const model = { holes: tt.holes || 18, notes: '', existing: (tt.players || []).map(function (p) { return Object.assign({}, p); }),
      players: [{ memberId: me, name: mem.firstName + ' ' + mem.lastName, type: 'member', cart: T.cartDefault(mem, tt.date), paid: false }] };
    const head = function () {
      const extra = model.players.slice(1); const w = withWhom(extra, me);
      return (ask ? 'Ask to join ' : 'Join ') + namesOf(fids) + ' · ' + (w ? 'You + ' + w : teeLabel(tt) + ' · ' + tt.holes + ' holes');
    };
    const sh = Portal.openSheet({ title: ask ? 'Request to join' : 'Join tee time', content:
      '<div class="fr-joinbox"><p class="fr-join-what" aria-live="polite">' + esc(head()) + '</p>' +
      '<p class="fr-join-sub">' + esc(teeLabel(tt) + ' · ' + tt.holes + ' holes · ' + spotsText(tt)) + '</p>' +
      '<div class="fr-editor"></div>' +
      (ask ? '<p class="fr-quiet">' + Club.icon('info') + '<span>' + esc(firstOf(ownerId)) + ' approves requests to join. Nothing is booked until then.</span></p>' : '') +
      '<p class="fr-quiet">' + Club.icon('info') + '<span>Fees are settled at check-in, as for any tee time. Your guests’ fees go on your account. You can leave up to 2 hours before you play.</span></p>' +
      '<div class="fr-join-err" role="alert" hidden></div></div>',
      footer: '<button type="button" class="btn btn-primary" data-fr="confirm-join">' + (ask ? 'Send request' : 'Confirm') + '</button>' });
    const ed = T.editor(ui.$('.fr-editor', sh.body), model, { me: mem, date: tt.date, time: tt.time, excludeId: tt.id, uid: 'fj' + tt.id, league: !ask,
      allowGuests: true, hideNotes: true, hideZeroFees: true, fullNote: 'Group is full', hostId: function () { return me; },
      onChange: function () { const h = ui.$('.fr-join-what', sh.body); if (h) h.textContent = head(); } });
    ui.$('[data-fr=confirm-join]', sh.foot).addEventListener('click', function () {
      ed.validate();
      const self = model.players[0];
      if (ask) { sendJoinRequest(me, ttId, ownerId, model, sh, after); return; }
      const res = T.join(member(me), ttId, { cart: !!self.cart, players: model.players.slice(1), existing: model.existing, friendLeagueId: self.friendLeagueId || null });
      if (!res.ok) { const er = ui.$('.fr-join-err', sh.body); er.hidden = false; er.innerHTML = Club.icon('alert') + '<div><p>Nothing was booked.</p>' + res.errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; er.scrollIntoView({ block: 'nearest' }); return; }
      const doc = res.doc; const added = model.players.slice(1); sendAuto(me, doc, added);
      sh.setContent('<div class="fr-joinbox fr-done"><span class="fr-done-ic">' + Club.icon('check') + '</span><h3 class="fr-done-h">You’re in</h3>' +
        '<p class="fr-join-what">' + esc(teeLabel(doc) + ' · ' + doc.holes + ' holes') + '</p>' +
        '<p class="fr-join-sub">' + esc((doc.players || []).map(function (p) { return p.memberId === me ? 'You' : p.type === 'guest' && p.hostId === me ? p.name + ' (your guest)' : Portal.playerLabel(p, me); }).join(', ')) + '</p>' +
        '<p class="fr-quiet">' + Club.icon('flag') + '<span>It’s in My tee times. ' + esc(namesOf(fids)) + (fids.length === 1 ? ' has' : ' have') + ' a message that you joined.</span></p></div>');
      sh.setFooter('<div class="fr-done-acts"><button type="button" class="btn" data-fr="ics">' + Club.icon('calendar') + '<span>Add to calendar</span></button><button type="button" class="btn btn-primary" data-fr="done">Done</button></div>');
      ui.$('[data-fr=ics]', sh.foot).addEventListener('click', function () { T.downloadIcs(doc); });
      ui.$('[data-fr=done]', sh.foot).addEventListener('click', function () { sh.close(); });
      ui.$('[data-fr=done]', sh.foot).focus();
      ui.toast('You have joined the ' + fmt.time(doc.time) + ' group');
      if (after) after();
    });
  }
  /* ---------------- Requests to join (joinRequests) ---------------- */
  function teeWhen(tt) { return fmt.time(tt.time) + ' tee time' + (tt.date === today() ? '' : ' on ' + fmt.toDate(tt.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })); }
  /** Pending requests whose tee time has passed or gone are closed automatically. */
  function sweepRequests() {
    const td = today(), nm = nowMin();
    S.all('joinRequests').forEach(function (r) {
      if (r.status !== 'pending') return;
      const tt = S.find('teeTimes', r.teeTimeId);
      if (!tt || tt.status !== 'booked' || tt.date < td || (tt.date === td && toMin(tt.time) <= nm)) S.update('joinRequests', r.id, { status: 'expired', decidedAt: now() });
    });
  }
  function myRequest(me, ttId) {
    return S.all('joinRequests').filter(function (r) { return r.requesterId === me && r.teeTimeId === ttId && r.status !== 'cancelled' && r.status !== 'expired'; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })[0] || null;
  }
  function joinInbox(me) {
    sweepRequests();
    return S.all('joinRequests').filter(function (r) { return r.ownerId === me && r.status === 'pending' && member(r.requesterId); })
      .sort(function (a, b) { const x = S.find('teeTimes', a.teeTimeId) || {}, y = S.find('teeTimes', b.teeTimeId) || {}; return String(x.date + x.time).localeCompare(String(y.date + y.time)); });
  }
  function partyCopy(players) { return players.map(function (p) { const o = Object.assign({}, p); delete o.paid; return o; }); }
  function sendJoinRequest(me, ttId, ownerId, model, sh, after) {
    const T = TT(); const self = model.players[0];
    const chk = T.check(member(me), ttId, { cart: !!self.cart, players: model.players.slice(1), existing: model.existing });
    if (!chk.ok) { const er = ui.$('.fr-join-err', sh.body); er.hidden = false; er.innerHTML = Club.icon('alert') + '<div><p>The request was not sent.</p>' + chk.errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div>'; return; }
    const tt = S.find('teeTimes', ttId); const extra = withWhom(model.players.slice(1), me, ownerId);
    S.insert('joinRequests', { teeTimeId: ttId, requesterId: me, ownerId: ownerId, party: partyCopy(model.players), status: 'pending', createdAt: now() });
    S.insert('memberMessages', { from: me, to: ownerId, body: firstOf(me) + ' asked to join your ' + teeWhen(tt) + (extra ? ' with ' + extra : ''), at: now(), readAt: null, auto: 'join-request', teeTimeId: ttId });
    sh.setContent('<div class="fr-joinbox fr-done"><span class="fr-done-ic">' + Club.icon('send') + '</span><h3 class="fr-done-h">Request sent</h3>' +
      '<p class="fr-join-what">' + esc(teeLabel(tt) + ' · ' + tt.holes + ' holes') + '</p>' +
      '<p class="fr-quiet">' + Club.icon('info') + '<span>' + esc(firstOf(ownerId)) + ' will see it in Friends. Nothing is booked until they approve.</span></p></div>');
    sh.setFooter('<button type="button" class="btn btn-primary" data-fr="done">Done</button>');
    ui.$('[data-fr=done]', sh.foot).addEventListener('click', function () { sh.close(); });
    ui.$('[data-fr=done]', sh.foot).focus();
    ui.toast('Request sent to ' + firstOf(ownerId));
    if (after) after();
  }
  function cancelRequest(me, id) { const r = S.find('joinRequests', id); if (r && r.requesterId === me && r.status === 'pending') { S.update('joinRequests', id, { status: 'cancelled', decidedAt: now() }); ui.toast('Request cancelled'); return true; } return false; }
  /** Approve: the same checkBooking and commitBooking as any join, for the requester, at this moment. { ok, errs } */
  function approveRequest(me, id) {
    sweepRequests();
    const r = S.find('joinRequests', id); if (!r || r.ownerId !== me || r.status !== 'pending') return { ok: false, errs: ['This request is no longer waiting.'] };
    const who = member(r.requesterId); const T = TT(); if (!who || !T) return { ok: false, errs: ['This request can no longer be approved.'] };
    const self = r.party[0] || {}; const tt = S.find('teeTimes', r.teeTimeId);
    const res = T.join(who, r.teeTimeId, { cart: !!self.cart, players: r.party.slice(1), noPrefs: true });
    if (!res.ok) return { ok: false, errs: res.errs };
    S.update('joinRequests', id, { status: 'approved', decidedAt: now() });
    S.insert('memberMessages', { from: me, to: r.requesterId, body: firstOf(me) + ' approved your request to join the ' + teeWhen(tt), at: now(), readAt: null, auto: 'join-approved', teeTimeId: r.teeTimeId });
    return { ok: true, errs: [] };
  }
  function declineRequest(me, id) {
    const r = S.find('joinRequests', id); if (!r || r.ownerId !== me || r.status !== 'pending') return false;
    const tt = S.find('teeTimes', r.teeTimeId);
    S.update('joinRequests', id, { status: 'declined', decidedAt: now() });
    if (tt) S.insert('memberMessages', { from: me, to: r.requesterId, body: firstOf(me) + ' declined your request to join the ' + teeWhen(tt), at: now(), readAt: null, auto: 'join-declined', teeTimeId: r.teeTimeId });
    return true;
  }
  function requestRowHTML(me, r) {
    const tt = S.find('teeTimes', r.teeTimeId); const extra = withWhom(r.party.slice(1), r.requesterId, me);
    return '<li class="fr-g fr-jr" data-req-row="' + esc(r.id) + '"><span class="fr-g-main"><span class="fr-g-who">' + esc(firstOf(r.requesterId) + ' asks to join') + '</span>' +
      '<span class="fr-g-sub">' + esc((tt ? teeLabel(tt) : '') + (extra ? ' · with ' + extra : '')) + '</span><span class="fr-jr-err" role="alert" hidden></span></span>' +
      '<span class="fr-g-act"><button type="button" class="p-link" data-fr="decline-req" data-req="' + esc(r.id) + '" aria-label="Decline ' + esc(firstOf(r.requesterId)) + '’s request">Decline</button><button type="button" class="btn btn-primary btn-sm" data-fr="approve-req" data-req="' + esc(r.id) + '" aria-label="Approve ' + esc(firstOf(r.requesterId)) + '’s request">Approve</button></span></li>';
  }

  /* ---------------- Per-friend sharing sheet ---------------- */
  function openSharing(me, fid, after) {
    const first = firstOf(fid); const all = !!privacy(me).teeTimes;
    function body() {
      const s = sharing(me, fid); const dis2 = !all || !s.see;
      const sw = function (key, label, text, on, disabled) {
        const id = 'fr-sw-' + key;
        return '<li><label for="' + id + '" class="fr-sw-text"><span class="fr-sw-l">' + esc(label) + '</span><span class="fr-sw-s">' + esc(text) + '</span></label>' +
          '<label class="fr-sw-ctl" for="' + id + '"><span class="fr-sw-state" aria-hidden="true">' + (on && !disabled ? 'On' : 'Off') + '</span><span class="toggle"><input type="checkbox" id="' + id + '" data-share="' + key + '"' + (on && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span></span></span></label></li>';
      };
      return (all ? '' : '<p class="fr-note">' + Club.icon('info') + '<span>Your upcoming tee times are hidden from all friends. Turn them on in Profile, Friends and privacy.</span></p>') +
        '<ul class="fr-sw">' + sw('see', 'Can see my tee times', 'When off, ' + first + ' sees your tee times as private.', s.see, !all) +
        sw('join', 'Can join without asking', 'When off, ' + first + ' sends a request and you approve it.', s.join, dis2) + '</ul>' +
        '<p class="fr-quiet">' + Club.icon('info') + '<span>Changes save as you go. ' + esc(first) + ' is not told about this setting.</span></p>';
    }
    const sh = Portal.openSheet({ title: 'Sharing with ' + first, content: '<div class="fr-sheet fr-sharebox">' + body() + '</div>', onClose: after });
    ui.on(sh.body, 'change', '[data-share]', function (e, f) {
      const patch = {}; patch[f.dataset.share] = f.checked; setSharing(me, fid, patch);
      sh.setContent('<div class="fr-sheet fr-sharebox">' + body() + '</div>');
      const n = ui.$('[data-share="' + f.dataset.share + '"]', sh.body); if (n) n.focus();
      ui.toast('Saved: ' + shareLabel(me, fid));
    });
  }
  function openSharingList(me) {
    const fs = friendsOf(me);
    const rows = function () { return fs.map(function (fid) { return { value: fid, label: nameOf(fid), sub: shareLabel(me, fid) }; }); };
    Portal.openSheet({ title: 'Per-friend settings', rows: rows(), onPick: function (fid) { openSharing(me, fid, function () { openSharingList(me); }); } });
  }

  function openLeave(me, ttId, after) {
    const tt = S.find('teeTimes', ttId); const T = TT(); if (!tt || !T) return;
    const going = T.leavingWith(member(me), ttId).filter(function (p) { return p.type === 'guest'; });
    const staying = (tt.players || []).filter(function (p) { return p.type === 'member' && p.addedBy === me; });
    const sh = Portal.openSheet({ title: 'Leave tee time', content: '<div class="fr-joinbox"><p class="fr-join-what">Leave the ' + esc(teeLabel(tt)) + ' group?</p>' +
      (going.length ? '<p class="fr-join-sub">' + esc('Your ' + (going.length === 1 ? 'guest ' : 'guests ') + withNames(going) + (going.length === 1 ? ' leaves' : ' leave') + ' with you.') + '</p>' : '') +
      (staying.length ? '<p class="fr-join-sub">' + esc(withNames(staying) + (staying.length === 1 ? ' stays' : ' stay') + ' in the group.') + '</p>' : '') +
      '<p class="fr-join-sub">The rest of the group keeps its tee time.</p><div class="fr-join-err" role="alert" hidden></div></div>',
      footer: '<div class="fr-done-acts"><button type="button" class="btn" data-fr="keep">Keep tee time</button><button type="button" class="btn btn-danger" data-fr="do-leave">Leave</button></div>' });
    ui.$('[data-fr=keep]', sh.foot).addEventListener('click', function () { sh.close(); });
    ui.$('[data-fr=do-leave]', sh.foot).addEventListener('click', function () {
      const r = T.withdraw(member(me), ttId);
      if (!r.ok) { const er = ui.$('.fr-join-err', sh.body); er.hidden = false; er.textContent = r.reason; return; }
      sh.close(); ui.toast('You have left the ' + fmt.time(tt.time) + ' group'); if (after) after();
    });
  }
  function withNames(ps) { const n = ps.map(function (p) { return Portal.playerLabel(p); }); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; }
  /** Join, Leave and "Show all" handlers for any container (page, sheet, Home). */
  function wireJoin(root, me, after) {
    ui.on(root, 'click', '[data-fr=join]', function (e, b) { openJoin(me, b.dataset.tee, after); });
    ui.on(root, 'click', '[data-fr=ask]', function (e, b) { openJoin(me, b.dataset.tee, after, b.dataset.owner); });
    ui.on(root, 'click', '[data-fr=cancel-req]', function (e, b) { if (cancelRequest(me, b.dataset.req) && after) after(); });
    ui.on(root, 'click', '[data-fr=approve-req]', function (e, b) {
      const r = approveRequest(me, b.dataset.req);
      if (!r.ok) { const li = b.closest('[data-req-row]'); const er = li && ui.$('.fr-jr-err', li); if (er) { er.hidden = false; er.textContent = 'Not added: ' + r.errs.join(' '); } ui.toast('Could not approve: ' + r.errs[0], 'bad'); return; }
      ui.toast('Approved. They are in the group'); if (after) after();
    });
    ui.on(root, 'click', '[data-fr=decline-req]', function (e, b) { if (declineRequest(me, b.dataset.req)) { ui.toast('Request declined'); if (after) after(); } });
    ui.on(root, 'click', '[data-fr=sharing]', function (e, b) { openSharing(me, b.dataset.id, after); });
    ui.on(root, 'click', '[data-fr=leave]', function (e, b) { openLeave(me, b.dataset.tee, after); });
    ui.on(root, 'click', '[data-fr=more-rounds]', function (e, b) {
      const open = b.getAttribute('aria-expanded') !== 'true'; const list = b.previousElementSibling;
      ui.$$('li', list).forEach(function (li, i) { if (i >= ROUNDS_SHOWN) li.hidden = !open; });
      b.setAttribute('aria-expanded', open); b.textContent = open ? 'Show fewer' : 'Show all (' + ui.$$('li', list).length + ')';
      if (open) { const f = ui.$('li:nth-child(' + (ROUNDS_SHOWN + 1) + ') button', list); if (f) f.focus(); }
    });
    ui.on(root, 'click', '[data-fr=round]', function (e, b) { if (Portal.scores && Portal.scores.openPost) Portal.scores.openPost(b.dataset.id); });
    ui.on(root, 'click', '[data-fr=more-tees]', function (e, b) {
      const open = b.getAttribute('aria-expanded') !== 'true'; const list = b.previousElementSibling;
      ui.$$('li', list).forEach(function (li, i) { if (i >= 4) li.hidden = !open; });
      b.setAttribute('aria-expanded', open); b.textContent = open ? 'Show fewer' : 'Show all (' + ui.$$('li', list).length + ')';
    });
  }
  function openAllGolfing(me, after) {
    const html = function () { const x = viewList(me); return '<div class="fr-sheet fr-allgolf">' + golfingHTML(me, x.list) + '</div>'; };
    const sh = Portal.openSheet({ title: viewList(me).view === 'join' ? 'Friends golfing you can join' : 'Friends golfing', size: 'full', content: html() });
    wireJoin(sh.body, me, function () { sh.setContent(html()); if (after) after(); });
  }

  /* ---------------- Page ---------------- */
  const draft = {};
  let query = '';
  function tabs(sub, me) {
    const inc = incoming(me).length + joinInbox(me).length + leagueInvites(me), un = unreadCount(me);
    const items = [['', 'Friends', 0], ['requests', 'Requests', inc], ['messages', 'Messages', un]].concat(Portal.friendLeagues ? [['leagues', 'Leagues', 0]] : []);
    return '<nav class="fr-tabs" aria-label="Friends">' + items.map(function (i) {
      const on = i[0] === sub;
      return '<a href="#/friends' + (i[0] ? '/' + i[0] : '') + '"' + (on ? ' class="active" aria-current="page"' : '') + '>' + esc(i[1]) + (i[2] ? '<span class="fr-count" aria-label="' + i[2] + (i[0] === 'messages' ? ' unread' : ' waiting') + '">' + i[2] + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
  }
  function friendRow(me, fid, selected) {
    const m = member(fid); const pv = privacy(fid);
    const bits = [];
    if (pv.handicap && m.handicap != null) bits.push('Handicap ' + fmt.handicap(m.handicap));
    if (seesTees(me, fid)) { const n = upcomingTee(fid, 1)[0]; if (n) bits.push('Next ' + dayShort(n.date) + ' ' + fmt.time(n.time)); }
    const sh = sharing(me, fid); const lock = privacy(me).teeTimes && (!sh.see || !sh.join) ? (!sh.see ? 'Hidden' : 'Must ask') : '';
    return '<li><button type="button" class="fr-row' + (selected ? ' is-selected' : '') + '" data-friend="' + esc(fid) + '"' + (selected ? ' aria-current="true"' : '') + '>' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm') +
      '<span class="fr-row-main"><span class="fr-row-name">' + esc(m.firstName + ' ' + m.lastName) + '</span>' + (bits.length ? '<span class="fr-row-sub">' + esc(bits.join(' · ')) + '</span>' : '') + '</span>' +
      (lock ? '<span class="fr-lock" title="Your tee times: ' + esc(lock === 'Hidden' ? 'hidden from ' + m.firstName : m.firstName + ' must ask to join') + '">' + Club.icon('key') + '<span>' + lock + '</span></span>' : '') + Club.icon('chevronRight', 'fr-go') + '</button></li>';
  }
  function searchResults(me) {
    const q = query.trim().toLowerCase();
    const list = S.all('members').filter(function (m) { return m.id !== me && m.status !== 'resigned' && ((m.firstName + ' ' + m.lastName).toLowerCase().indexOf(q) >= 0 || m.lastName.toLowerCase().indexOf(q) === 0); })
      .sort(function (a, b) { return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName); }).slice(0, 20);
    if (!list.length) return '<p class="fr-quiet">No member matches “' + esc(query.trim()) + '”.</p>';
    return '<ul class="p-list fr-results-list">' + list.map(function (m) {
      const st = state(me, m.id); const t = tierOf(m); let act;
      if (st === 'friends') act = '<span class="badge">Friends</span>';
      else if (st === 'outgoing') act = '<span class="fr-pend">Pending</span><button type="button" class="p-link" data-fr="cancel" data-id="' + esc(m.id) + '">Cancel</button>';
      else if (st === 'incoming') act = '<a class="p-link" href="#/friends/requests">Respond</a>';
      else if (st === 'blocked') act = '<span class="fr-pend">Blocked</span>';
      else if (st === 'blockedMe' || privacy(m.id).requests === 'none') act = '<span class="fr-pend">Not accepting requests</span>';
      else act = '<button type="button" class="btn btn-sm" data-fr="add" data-id="' + esc(m.id) + '">' + Club.icon('plus') + '<span>Add friend</span></button>';
      return '<li>' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm', true) + '<span class="fr-row-main"><span class="fr-row-name">' + esc(m.firstName + ' ' + m.lastName) + '</span><span class="fr-row-sub">' + esc(t ? t.name : 'Member') + '</span></span><span class="fr-act">' + act + '</span></li>';
    }).join('') + '</ul>';
  }

  const GOLF_LIMIT = 6;
  function canJoin(me, g) { const st = jState(me, g.tee); if (st.ok || st.code === 'mine') return true; const r = myRequest(me, g.tee.id); return !!(r && r.status === 'pending'); }
  /** 'join' (groups Dave can join, plus his own) or 'all'. Remembered; defaults to 'join' when there is one. */
  function golfView(me, list) {
    const v = Portal.prefs.get('fr.golfView', null);
    if (v === 'join' || v === 'all') return v;
    return list.some(function (g) { return canJoin(me, g); }) ? 'join' : 'all';
  }
  function viewList(me) { const all = golfing(me, 7); const v = golfView(me, all); return { all: all, view: v, list: v === 'join' ? all.filter(function (g) { return canJoin(me, g); }) : all }; }
  function golfSection(me) {
    const x = viewList(me); const list = x.list; const nJoin = x.all.filter(function (g) { return canJoin(me, g); }).length;
    const seg = x.all.length ? '<div class="segmented fr-view" role="group" aria-label="Show">' + [['join', 'Can join (' + nJoin + ')'], ['all', 'All (' + x.all.length + ')']].map(function (o) {
      const on = o[0] === x.view; return '<button type="button" data-golf-view="' + o[0] + '" aria-pressed="' + on + '"' + (on ? ' class="active"' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>' : '';
    let body;
    if (!x.all.length) body = '<p class="fr-quiet">' + (friendsOf(me).length ? 'None of your friends has a tee time booked this week.' : 'Add friends to see when they are playing.') + '</p>';
    else if (!list.length) body = '<p class="fr-quiet fr-none">No open spots with friends this week. <button type="button" class="p-link" data-golf-view="all">See all (' + x.all.length + ')</button></p>';
    else body = golfingHTML(me, list, GOLF_LIMIT);
    return '<section class="fr-golfing" aria-labelledby="fr-golf-h"><div class="fr-side-head"><h2 class="fr-h" id="fr-golf-h">Friends golfing</h2>' +
      (list.length > GOLF_LIMIT ? '<button type="button" class="p-link" data-fr="all-golf" aria-haspopup="dialog">View all (' + list.length + ')</button>' : '') + '</div>' +
      '<p class="fr-golf-sub">Today and the next 7 days</p>' + seg + body + '</section>';
  }
  function renderFriends(host, me, selected) {
    const fs = friendsOf(me);
    const list = query.trim() ? searchResults(me) :
      (fs.length ? '<ul class="p-list fr-list">' + fs.map(function (id) { return friendRow(me, id, wide() && id === selected); }).join('') + '</ul>'
        : '<div class="fr-empty">' + ui.empty({ icon: 'members', title: 'No friends yet', text: 'Search for a member and send a friend request. Nothing is shared until they accept.' }) + '</div>');
    const friendsBlock = '<section class="fr-mine" aria-labelledby="fr-mine-h"><h2 class="fr-h" id="fr-mine-h">Your friends</h2><label class="fr-search"><span class="fr-search-l">Find a member</span><span class="fr-search-box">' + Club.icon('search') +
        '<input class="input" type="search" name="q" placeholder="Search by name" autocomplete="off" value="' + esc(query) + '"></span></label>' +
        '<div class="fr-list-wrap" aria-live="polite">' + list + '</div></section>';
    if (!wide()) { host.innerHTML = golfSection(me) + friendsBlock; return; }
    const prof = selected && state(me, selected) === 'friends';
    host.innerHTML = '<div class="fr-split"><div class="fr-side">' + friendsBlock + '</div>' +
      '<div class="fr-main fr-panel">' + (prof ? '<button type="button" class="p-link fr-back" data-fr="back-golf">' + Club.icon('chevronLeft') + '<span>Friends golfing</span></button>' + profileHTML(me, selected) : golfSection(me)) + '</div></div>';
  }

  function renderRequests(host, me) {
    const inc = incoming(me).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    const out = outgoing(me);
    const row = function (f, id, acts) {
      const m = member(id); const t = tierOf(m);
      return '<li>' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm', true) + '<span class="fr-row-main"><span class="fr-row-name">' + esc(m.firstName + ' ' + m.lastName) + '</span><span class="fr-row-sub">' + esc((t ? t.name : 'Member') + ' · Sent ' + ago(f.createdAt)) + '</span></span><span class="fr-act">' + acts + '</span></li>';
    };
    const jr = joinInbox(me);
    host.innerHTML = (Portal.friendLeagues ? Portal.friendLeagues.invitesHTML(me) : '') +
      (jr.length ? '<section class="fr-block"><h2 class="fr-h">Join requests</h2><ul class="p-list fr-golf fr-jrs">' + jr.map(function (r) { return requestRowHTML(me, r); }).join('') + '</ul></section>' : '') +
      '<section class="fr-block"><h2 class="fr-h">Friend requests</h2>' +
        (inc.length ? '<ul class="p-list fr-req">' + inc.map(function (f) { return row(f, f.from, '<button type="button" class="btn btn-primary btn-sm" data-fr="accept" data-doc="' + esc(f.id) + '">Accept</button><button type="button" class="btn btn-sm" data-fr="decline" data-doc="' + esc(f.id) + '">Decline</button>'); }).join('') + '</ul>'
          : '<p class="fr-quiet">No requests waiting.</p>') + '</section>' +
      '<section class="fr-block"><h2 class="fr-h">Sent by you</h2>' +
        (out.length ? '<ul class="p-list fr-req">' + out.map(function (f) { return row(f, f.to, '<span class="fr-pend">Pending</span><button type="button" class="p-link" data-fr="cancel" data-id="' + esc(f.to) + '">Cancel</button>'); }).join('') + '</ul>'
          : '<p class="fr-quiet">No requests waiting on others.</p>') + '</section>';
  }

  function chatHTML(me, other) {
    const m = member(other); const ok = state(me, other) === 'friends';
    const msgs = thread(me, other);
    return '<div class="fr-chat">' +
      '<header class="fr-chat-head">' + (wide() ? '' : '<a class="p-link fr-back" href="#/friends/messages">' + Club.icon('chevronLeft') + '<span>Messages</span></a>') +
        '<div class="fr-chat-who">' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm') + '<h2>' + esc(m.firstName + ' ' + m.lastName) + '</h2></div></header>' +
      '<p class="fr-privacy">' + Club.icon('key') + '<span>Messages are private between you and ' + esc(m.firstName) + '. Club staff only see a message if it is reported.</span></p>' +
      '<ol class="fr-msgs" aria-label="Conversation">' + (msgs.length ? msgs.map(function (x) {
        const mine = x.from === me;
        return '<li class="fr-msg' + (mine ? ' is-mine' : '') + '">' + (mine ? '<div class="fr-bubble">' + esc(x.body) + '</div>'
          : '<button type="button" class="fr-bubble" data-fr="msg" data-msg="' + esc(x.id) + '" aria-haspopup="dialog" aria-label="Message from ' + esc(m.firstName) + ': ' + esc(x.body) + '. Options">' + esc(x.body) + '</button>') +
          '<span class="fr-msg-t">' + esc(msgTime(x.at)) + '</span></li>';
      }).join('') : '<li class="fr-quiet">No messages yet. Say hello.</li>') + '</ol>' +
      (ok ? '<form class="fr-composer" data-to="' + esc(other) + '"><label class="sr-only fr-sr" for="fr-text">Message to ' + esc(m.firstName) + '</label>' +
        '<textarea id="fr-text" name="body" rows="1" maxlength="1000" placeholder="Message ' + esc(m.firstName) + '">' + esc(draft[other] || '') + '</textarea>' +
        '<button type="submit" class="btn btn-primary">Send</button></form>'
        : '<p class="fr-quiet">You can only message friends.</p>') +
    '</div>';
  }
  function renderMessages(host, me, other) {
    const cs = convos(me);
    if (wide() && !other && cs.length) other = cs[0].other;
    if (other && member(other)) markRead(me, other);
    const list = '<div class="fr-side"><div class="fr-side-head"><h2 class="fr-h">Conversations</h2><button type="button" class="btn btn-sm" data-fr="new">' + Club.icon('plus') + '<span>New message</span></button></div>' +
      (cs.length ? '<ul class="p-list fr-convos">' + convos(me).map(function (c) {
        const m = member(c.other); const sel = c.other === other;
        return '<li><a class="fr-row' + (sel && wide() ? ' is-selected' : '') + '" href="#/friends/messages/' + encodeURIComponent(c.other) + '">' + ui.avatar(m.firstName + ' ' + m.lastName, 'sm') +
          '<span class="fr-row-main"><span class="fr-row-name">' + esc(m.firstName + ' ' + m.lastName) + '</span><span class="fr-row-sub">' + esc((c.last.from === me ? 'You: ' : '') + preview(c.last.body)) + '</span></span>' +
          '<span class="fr-row-meta"><span>' + esc(msgTime(c.last.at)) + '</span>' + (c.unread ? '<span class="fr-dot"><span class="fr-sr">' + c.unread + ' unread</span></span>' : '') + '</span></a></li>';
      }).join('') + '</ul>' : '<p class="fr-quiet">No conversations yet.</p>') + '</div>';
    if (!wide()) { host.innerHTML = other && member(other) ? chatHTML(me, other) : list; }
    else host.innerHTML = '<div class="fr-split">' + list + '<div class="fr-main fr-panel">' + (other && member(other) ? chatHTML(me, other) : '<p class="fr-quiet">Choose a conversation.</p>') + '</div></div>';
    const box = host.querySelector('.fr-msgs'); if (box) box.scrollTop = box.scrollHeight;
    if (other && member(other) && !wide()) setTimeout(function () { window.scrollTo(0, document.documentElement.scrollHeight); }, 30);
  }

  /* ---------------- Sheets and actions ---------------- */
  function confirmRemove(me, fid, after) {
    ui.confirm({ title: 'Remove ' + nameOf(fid) + '?', text: 'You will no longer see each other’s tee times, handicap or results. You can send a new request later.', confirmLabel: 'Remove friend' }).then(function (ok) {
      if (!ok) return; const f = current(me, fid); if (f) setStatus(f, 'removed'); ui.toast(nameOf(fid) + ' removed from your friends'); if (after) after();
    });
  }
  function confirmBlock(me, fid, after) {
    ui.confirm({ title: 'Block ' + nameOf(fid) + '?', text: 'This removes them as a friend. They will not be able to send you friend requests or messages. You can unblock them in Profile, Friends and privacy.', confirmLabel: 'Block' }).then(function (ok) {
      if (!ok) return; block(me, fid); ui.toast(nameOf(fid) + ' is blocked'); if (after) after();
    });
  }
  function openMenu(me, fid, after) {
    Portal.openSheet({ title: nameOf(fid), rows: [{ value: 'remove', label: 'Remove friend' }, { value: 'block', label: 'Block', sub: 'Also stops requests and messages' }],
      onPick: function (v) { if (v === 'remove') confirmRemove(me, fid, after); else confirmBlock(me, fid, after); } });
  }
  function openReport(me, msgId) {
    const msg = S.find('memberMessages', msgId); if (!msg) return;
    Portal.openSheet({ title: 'Message options', rows: [{ value: 'report', label: 'Report this message', sub: 'Club staff will review it' }, { value: 'block', label: 'Block ' + nameOf(msg.from) }],
      onPick: function (v) {
        if (v === 'block') { confirmBlock(me, msg.from, function () { Portal.go('friends/messages'); }); return; }
        const sh = Portal.openSheet({ title: 'Report message', content:
          '<form class="fr-report" id="fr-report" novalidate><blockquote class="fr-quote">' + esc(msg.body) + '</blockquote>' +
          '<input type="hidden" name="reason" value=""><div class="fr-reason"></div>' +
          ui.field({ label: 'Anything else staff should know (optional)', name: 'note', type: 'textarea' }) +
          '<p class="fr-quiet">Only this message is shared with club staff, not the rest of the conversation.</p></form>',
          footer: '<button type="submit" form="fr-report" class="btn btn-primary">Send report</button>' });
        const form = ui.$('form', sh.body);
        Portal.selectField(ui.$('.fr-reason', sh.body), { label: 'Reason', title: 'Reason', placeholder: 'Choose a reason', rows: REASONS.map(function (r) { return { value: r, label: r }; }), onChange: function (v) { form.elements.reason.value = v; const e = ui.$('.field-error', form); if (e) e.remove(); } });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!form.elements.reason.value) { if (!ui.$('.field-error', form)) ui.$('.fr-reason', form).insertAdjacentHTML('beforeend', '<span class="field-error">Choose a reason.</span>'); return; }
          S.insert('messageReports', { messageId: msg.id, reporterId: me, reportedId: msg.from, body: msg.body, reason: form.elements.reason.value, note: String(form.elements.note.value || '').trim().slice(0, 500), at: now(), status: 'open' });
          sh.close(); ui.toast('Thanks. Club staff will review the message.');
        });
      } });
  }
  function newMessage(me) {
    const fs = friendsOf(me);
    if (!fs.length) { ui.toast('Add a friend first. Messages are between friends only.'); return; }
    Portal.openSheet({ title: 'New message', rows: fs.map(function (id) { return { value: id, label: nameOf(id) }; }), onPick: function (v) { Portal.go('friends/messages/' + v); } });
  }

  function render(view, params, mem) {
    const me = mem.id;
    if (params[0] === 'leagues' && Portal.friendLeagues) {   /* Friends leagues: js/portal/fleagues.js */
      view.innerHTML = (params[1] ? '' : '<header class="fr-title"><h1>Friends</h1><p>Tee times, handicaps and results, shared only between friends.</p></header>' + tabs('leagues', me)) + '<div class="fr-body"></div>';
      const lgDone = Portal.friendLeagues.render(ui.$('.fr-body', view), me, params.slice(1), function () { const t = ui.$('.fr-tabs', view); if (t) t.outerHTML = tabs('leagues', me); updateBadge(); });
      const tab = ui.$('.fr-tabs a.active', view); if (tab) { const nav = tab.parentNode; nav.scrollLeft += tab.getBoundingClientRect().right - nav.getBoundingClientRect().right + 4; }
      updateBadge();
      return lgDone;
    }
    const sub = params[0] === 'requests' || params[0] === 'messages' ? params[0] : '';
    const pick = !sub && params[0] && member(params[0]) ? params[0] : null;
    const other = sub === 'messages' ? params[1] : null;
    const inChat = other && !wide();
    view.innerHTML = (inChat ? '' : '<header class="fr-title"><h1>Friends</h1><p>Tee times, handicaps and results, shared only between friends.</p></header>' + tabs(sub, me)) + '<div class="fr-body"></div>';
    const host = ui.$('.fr-body', view);
    let selected = pick;
    function draw() {
      if (sub === 'requests') renderRequests(host, me);
      else if (sub === 'messages') renderMessages(host, me, other);
      else renderFriends(host, me, selected);
      const t = ui.$('.fr-tabs', view); if (t) t.outerHTML = tabs(sub, me);
      updateBadge();
    }
    draw();
    if (pick && !wide() && state(me, pick) === 'friends') openProfile(pick);

    function openProfile(fid) {
      const sh = Portal.openSheet({ title: nameOf(fid), size: 'full', content: '<div class="fr-sheet">' + profileHTML(me, fid) + '</div>' });
      wireActions(sh.body, function () { sh.close(); draw(); });
      wireJoin(sh.body, me, function () { sh.setContent('<div class="fr-sheet">' + profileHTML(me, fid) + '</div>'); draw(); });
    }
    function wireActions(root, after) {
      ui.on(root, 'click', '[data-fr]', function (e, b) {
        const a = b.dataset.fr, id = b.dataset.id;
        if (a === 'message') Portal.go('friends/messages/' + id);
        else if (a === 'menu') openMenu(me, id, after);
      });
    }
    let tmr;
    ui.on(view, 'input', 'input[name=q]', function (e, f) {
      clearTimeout(tmr); tmr = setTimeout(function () { query = f.value; const w = ui.$('.fr-list-wrap', view); if (w) { const tmp = document.createElement('div'); renderFriends(tmp, me, selected); w.innerHTML = ui.$('.fr-list-wrap', tmp).innerHTML; } }, 150);
    });
    ui.on(view, 'click', '[data-friend]', function (e, b) {
      const fid = b.dataset.friend;
      if (wide()) { selected = fid; draw(); const i = ui.$('.fr-main .fr-p-name', view); if (i) { i.setAttribute('tabindex', '-1'); i.focus({ preventScroll: true }); } }
      else openProfile(fid);
    });
    if (wide()) wireActions(view, function () { selected = null; draw(); });
    wireJoin(view, me, draw);
    if (Portal.friendLeagues) Portal.friendLeagues.wire(view, me, draw);
    ui.on(view, 'click', '[data-fr=all-golf]', function () { openAllGolfing(me, draw); });
    ui.on(view, 'click', '[data-golf-view]', function (e, b) { Portal.prefs.set('fr.golfView', b.dataset.golfView); draw(); const n = ui.$('[data-golf-view="' + b.dataset.golfView + '"].active', view); if (n) n.focus(); });
    ui.on(view, 'click', '[data-fr=back-golf]', function () { selected = null; draw(); });
    ui.on(view, 'click', '[data-fr=add]', function (e, b) { if (sendRequest(me, b.dataset.id)) draw(); });
    ui.on(view, 'click', '[data-fr=cancel]', function (e, b) { const f = current(me, b.dataset.id); if (f && f.status === 'pending') { setStatus(f, 'cancelled'); ui.toast('Request cancelled'); draw(); } });
    ui.on(view, 'click', '[data-fr=accept]', function (e, b) { const f = S.find('friendships', b.dataset.doc); if (f) { setStatus(f, 'accepted'); ui.toast('You and ' + nameOf(f.from) + ' are now friends'); draw(); } });
    ui.on(view, 'click', '[data-fr=decline]', function (e, b) { const f = S.find('friendships', b.dataset.doc); if (f) { setStatus(f, 'declined'); ui.toast('Request declined'); draw(); } });
    ui.on(view, 'click', '[data-fr=new]', function () { newMessage(me); });
    ui.on(view, 'click', '[data-fr=msg]', function (e, b) { openReport(me, b.dataset.msg); });
    ui.on(view, 'input', '.fr-composer textarea', function (e, ta) { draft[ta.closest('form').dataset.to] = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; });
    ui.on(view, 'keydown', '.fr-composer textarea', function (e, ta) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.form.requestSubmit(); } });
    ui.on(view, 'submit', '.fr-composer', function (e, form) {
      e.preventDefault();
      const to = form.dataset.to; const body = String(form.elements.body.value || '').trim();
      if (!body) return;
      if (state(me, to) !== 'friends') { ui.toast('You can only message friends'); return; }
      S.insert('memberMessages', { from: me, to: to, body: body.slice(0, 1000), at: now(), readAt: null });
      delete draft[to]; draw();
      const ta = ui.$('.fr-composer textarea', view); if (ta) ta.focus();
    });
    const ta = ui.$('.fr-composer textarea', view); if (ta && draft[other]) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    const unsub = [S.subscribe('friendships', updateBadge), S.subscribe('memberMessages', updateBadge), S.subscribe('joinRequests', updateBadge), S.subscribe('friendLeagues', updateBadge)];
    return function () { unsub.forEach(function (u) { u(); }); };
  }

  /* ---------------- Nav badge (top nav, phone More button and More list) ---------------- */
  function setBadge(el, n, dot) {
    if (!el) return; let b = el.querySelector('.fr-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'fr-badge' + (dot ? ' is-dot' : ''); el.appendChild(b); }
    b.textContent = dot ? '' : String(n); b.setAttribute('aria-label', n + ' new in Friends'); if (dot) b.setAttribute('role', 'img');
  }
  function updateBadge() {
    const m = Portal.member && Portal.member(); if (!m) return;
    const n = badgeCount(m.id);
    setBadge(document.querySelector('.p-nav a[data-page="friends"]'), n);
    setBadge(document.querySelector('.p-more-btn'), n, true);
    document.querySelectorAll('.p-more-list a[href="#/friends"] span').forEach(function (s) { setBadge(s, n); });
  }
  window.addEventListener('hashchange', function () { setTimeout(updateBadge, 0); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(updateBadge, 0); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.p-more-btn')) setTimeout(updateBadge, 0); });

  /* ---------------- Demo tee times (once) ----------------
     So every Join state can be seen with the demo member, make sure friends' groups exist that Dave can join, and
     that are full, outside his play times, not yet open to him, close to one of his own rounds, and one he is in.
     Each candidate is written as a normal tee time, then checked with the Tee times rules and removed if it does
     not show the intended state. */
  (function demoTees() {
    const ME = 'mem_1003'; const T = Portal.teeTimes; const me = member(ME);
    if (!me || !T || S.getObj('friendsJoinDemo', null)) return;
    const fr = friendsOf(ME).filter(function (id) { return privacy(id).teeTimes; }).slice(0, 3);
    if (!fr.length) return;
    const set = Object.assign({ interval: 9, first: '06:30', last: '19:00' }, S.getObj('teeSheetSettings', {}) || {});
    const slots = []; for (let mm = toMin(set.first); mm <= toMin(set.last); mm += Math.max(5, +set.interval || 9)) slots.push(String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'));
    const td = today(), end = Club.date.addDays(td, 7);
    const pl = function (id) { const m = member(id); return { memberId: id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: true, paid: false }; };
    const busy = function (id, date, time) { return S.all('teeTimes').some(function (x) { return x.date === date && x.status !== 'cancelled' && Math.abs(toMin(x.time) - toMin(time)) < 255 && hasPlayer(x, id); }); };
    const free = function (date, time) { return !S.all('teeTimes').some(function (x) { return x.date === date && x.time === time && x.status !== 'cancelled'; }) && !S.all('teeBlocks').some(function (b) { return b.date === date && time >= b.start && time < b.end; }); };
    const groups = function () { return golfing(ME, 7).concat(fr.reduce(function (a, id) { return a.concat(upcomingTee(id).map(function (t) { return { tee: t }; })); }, [])); };
    const have = function (code) { return groups().some(function (g) { return jState(ME, g.tee).code === code; }); };
    /** Try slots on `dates` until a new group for `players` shows `code` for Dave. */
    function make(code, dates, players, ok) {
      if (have(code)) return;
      for (let i = 0; i < dates.length; i++) for (let k = 0; k < slots.length; k++) {
        const d = dates[i], t = slots[k];
        if (!free(d, t) || (ok && !ok(d, t)) || players.some(function (id) { return busy(id, d, t); })) continue;
        const doc = S.insert('teeTimes', { date: d, time: t, holes: 18, players: players.map(pl), status: 'booked', notes: '', eventId: null, startedAt: null, finishedAt: null, bookedBy: players[0], source: 'portal' });
        if (jState(ME, doc).code === code) return; S.remove('teeTimes', doc.id);
      }
    }
    const days = function (a, b) { const o = []; for (let i = a; i <= b; i++) o.push(Club.date.addDays(td, i)); return o; };
    const others = S.all('members').filter(function (m) { return m.id !== ME && fr.indexOf(m.id) < 0 && m.status === 'active' && m.tierId !== 'tier_social'; }).map(function (m) { return m.id; });
    make('open', days(1, 3), [fr[0]]);
    const f2 = fr[1] || fr[0], f3 = fr[2] || fr[0];
    if (!have('full')) {
      const d = Club.date.addDays(td, 2);
      for (let k = 0; k < slots.length; k++) {
        const t = slots[k]; if (!free(d, t) || busy(f2, d, t)) continue;
        const m3 = others.filter(function (id) { return !busy(id, d, t); }).slice(0, 3); if (m3.length < 3) continue;
        S.insert('teeTimes', { date: d, time: t, holes: 18, players: [f2].concat(m3).map(pl), status: 'booked', notes: '', eventId: null, startedAt: null, finishedAt: null, bookedBy: f2, source: 'portal' }); break;
      }
    }
    make('rule', days(1, 6), [f3], function (d, t) { const wd = fmt.toDate(d).getDay(); return wd > 0 && wd < 6 && toMin(t) >= 480 && toMin(t) < 620; });
    if (!have('clash')) {
      const mine = upcomingTee(ME).filter(function (t) { return t.date > td && t.date <= end; })[0];
      if (mine) make('clash', [mine.date], [f2], function (d, t) { const g = Math.abs(toMin(t) - toMin(mine.time)); return g >= 45 && g <= 150; });
    }
    if (!have('mine')) {
      const mine = upcomingTee(ME).filter(function (t) { return t.date <= end && (t.players || []).length < 4 && t.status === 'booked'; });
      const g = mine.find(function (t) { return !busy(fr[0], t.date, t.time); });
      if (g) S.update('teeTimes', g.id, { players: (g.players || []).concat([pl(fr[0])]) });
    }
    const adv = Club.teeRules ? Club.teeRules.tierRules(me).advanceDays : 13;
    make('locked', [Club.date.addDays(td, adv + 1), Club.date.addDays(td, adv + 2)], [fr[0]], function (d, t) { return Club.teeRules ? Club.teeRules.memberCanPlay(me, d, t).ok : true; });
    S.setObj('friendsJoinDemo', { at: now() });
  })();

  /* ---------------- Demo sharing (once) ----------------
     One friend asks Dave to request before joining, one friend hides tee times from Dave, Dave asks one friend to
     request first, and that friend has asked to join one of Dave's tee times. */
  (function demoSharing() {
    const ME = 'mem_1003'; const T = Portal.teeTimes; const me = member(ME);
    S.seed('friendSharing', []); S.seed('joinRequests', []);
    if (!me || !T || S.getObj('friendsShareDemo', null)) return;
    const fr = friendsOf(ME).filter(function (id) { return privacy(id).teeTimes; }).slice(0, 3);
    if (fr.length < 3) return;
    setSharing(fr[1], ME, { join: false });     // Dave must ask fr[1]
    setSharing(fr[2], ME, { see: false });      // fr[2] hides tee times from Dave
    setSharing(ME, fr[0], { join: false });     // fr[0] must ask Dave
    /* A group of fr[1]'s that Dave could join, so "Request to join" shows. */
    const has = upcomingTee(fr[1]).some(function (t) { return t.date <= Club.date.addDays(today(), 7) && jState(ME, t).ok; });
    if (!has) {
      const set = Object.assign({ interval: 9, first: '06:30', last: '19:00' }, S.getObj('teeSheetSettings', {}) || {});
      const pl = function (id) { const m = member(id); return { memberId: id, name: m.firstName + ' ' + m.lastName, type: 'member', cart: true, paid: false }; };
      outer: for (let i = 1; i <= 4; i++) {
        const d = Club.date.addDays(today(), i);
        for (let mm = toMin(set.first); mm <= toMin(set.last); mm += Math.max(5, +set.interval || 9)) {
          const t = String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0');
          if (S.all('teeTimes').some(function (x) { return x.date === d && x.status !== 'cancelled' && (x.time === t || (hasPlayer(x, fr[1]) && Math.abs(toMin(x.time) - mm) < 255)); })) continue;
          if (S.all('teeBlocks').some(function (b) { return b.date === d && t >= b.start && t < b.end; })) continue;
          const doc = S.insert('teeTimes', { date: d, time: t, holes: 18, players: [pl(fr[1])], status: 'booked', notes: '', eventId: null, startedAt: null, finishedAt: null, bookedBy: fr[1], source: 'portal' });
          if (jState(ME, doc).ok) break outer; S.remove('teeTimes', doc.id);
        }
      }
    }
    /* fr[0] asks to join one of Dave's own upcoming tee times. */
    const asker = member(fr[0]);
    const hostOf = function (t) { const h = (t.players || []).find(function (p) { return p.type === 'member' && p.memberId; }); return t.bookedBy || (h && h.memberId); };
    const mine = upcomingTee(ME).filter(function (t) { return t.date > today() && hostOf(t) === ME && (t.players || []).length < 4 && !hasPlayer(t, fr[0]); });
    const target = mine.find(function (t) { return T.check(asker, t.id, { cart: true }).ok; });
    if (target) {
      S.insert('joinRequests', { teeTimeId: target.id, requesterId: fr[0], ownerId: ME, party: [{ memberId: fr[0], name: asker.firstName + ' ' + asker.lastName, type: 'member', cart: true }], status: 'pending', createdAt: now() });
      S.insert('memberMessages', { from: fr[0], to: ME, body: asker.firstName + ' asked to join your ' + teeWhen(target), at: now(), readAt: null, auto: 'join-request', teeTimeId: target.id });
    }
    S.setObj('friendsShareDemo', { at: now() });
  })();

  Portal.register({ id: 'friends', label: 'Friends', icon: 'members', order: 35, tab: false, render: render });

  /* Shared with Home and Profile */
  Portal.friends = {
    friendsOf: friendsOf, privacy: privacy, setPrivacy: setPrivacy, blockedBy: blockedBy, unblock: unblock, nameOf: nameOf,
    /** Upcoming friend tee times within `days`, respecting each friend's privacy. */
    /** Friend groups from today through `days` ahead (privacy respected): [{ tee, friends: [memberId] }] */
    golfing: golfing,
    canJoin: canJoin,
    /** How the Book tab must treat a group with friends in it: { code: 'private' } when a friend hides their tee times
        from this member, { code: 'ask', owner } when a friend wants a request first, else null. */
    restrict: function (me, tt) {
      const fids = friendsOf(me).filter(function (f) { return hasPlayer(tt, f); });
      if (fids.some(function (f) { return !seesTees(me, f); })) return { code: 'private' };
      const owner = fids.find(function (f) { return !joinsFree(me, f); });
      return owner ? { code: 'ask', owner: owner } : null;
    },
    /** Same row and Join button (or reason) as the Friends page, with the day shown. */
    rowHTML: function (me, g) {
      const t = g.tee; const who = namesOf(g.friends); const st = jState(me, t);
      const inline = !st.ok && st.code !== 'mine';   /* compact: the reason sits on the second line instead of a button */
      const req = myRequest(me, t.id);
      const inline2 = inline && !(req && (req.status === 'pending' || req.status === 'declined'));
      return '<li class="fr-g"><span class="fr-g-main"><span class="fr-g-who">' + esc(teeLabel(t) + ' · ' + who) + '</span><span class="fr-g-sub">' + esc(t.holes + ' holes · ' + spotsText(t)) +
        (inline2 ? ' · <span class="fr-why">' + esc(st.reason) + '</span>' : '') + '</span></span>' + (inline2 ? '' : '<span class="fr-g-act">' + joinCell(me, t, who, g.friends) + '</span>') + '</li>';
    },
    wireJoin: wireJoin,
    teeLabel: teeLabel,
    /** Per-friend sharing: (owner, friend) -> { see, join }; seesTees(viewer, owner) applies the global setting first. */
    sharing: sharing, setSharing: setSharing, seesTees: seesTees, shareLabel: shareLabel, openSharing: openSharing, openSharingList: openSharingList,
    /** Pending requests to join this member's tee times, and the row with Approve / Decline. */
    joinInbox: joinInbox, requestRowHTML: requestRowHTML
  };
})();
