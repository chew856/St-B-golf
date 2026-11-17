/* Portal: Friends leagues. Members start a league with friends and play it over a season of weeks.
   The rules live in js/core/friendleagues.js (Club.friendLeagues); this file is only the members' screens.

   Routes (inside Friends, js/portal/friends.js hands them over):
     #/friends/leagues           the member's leagues, invites to answer and "Start a league"
     #/friends/leagues/new       start a league: rules, then players (individual or teams), then review
     #/friends/leagues/<id>      a league: getting ready (players, invites), standings and the week by week grid
   Portal.friendLeagues = { render(host, me, params, onChange), invitesHTML(me), wire(root, me, after), inviteCount(me) }
   Joining a league shares its scores with the other players, so league pages show league rounds even for players
   who keep their scores private elsewhere. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, FL = Club.friendLeagues;
  window.Portal = window.Portal || {};
  if (!FL) return;

  const FR = !!(Club.i18n && Club.i18n.lang && Club.i18n.lang() === 'fr');
  function today() { return Club.date.today(); }
  function member(id) { return S.find('members', id); }
  function fullName(id) { const m = member(id); return m ? m.firstName + ' ' + m.lastName : 'Former member'; }
  function firstName(id) { const m = member(id); return m ? m.firstName : 'A member'; }
  function friendsOf(me) { return Portal.friends && Portal.friends.friendsOf ? Portal.friends.friendsOf(me) : []; }
  /** Friends (and the member) in full, everyone else "Tom R.", as elsewhere in the portal. */
  function nameFor(id, me) { return id === me ? fullName(id) : (Portal.playerLabel ? Portal.playerLabel({ memberId: id }, me) : fullName(id)); }
  function dshort(d) { return fmt.dateShort(d); }
  function num(v) { if (v == null) return '–'; const s = String(Math.round(v * 10) / 10); return FR ? s.replace('.', ',') : s; }
  function valText(lg, v) { const s = FL.valueText(lg, v); return FR ? s.replace(/(\d)\.(\d)/, '$1,$2') : s; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function now() { return new Date().toISOString(); }
  function isCreator(lg, me) { return lg.createdBy === me; }
  function teamOf(lg, id) { return (lg.teams || []).find(function (t) { return t.id === id; }) || null; }
  /** Pieces joined with " · ", each in its own span so each translates on its own. */
  function spans(arr) { return arr.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join(' · '); }
  function rulesLine(lg) {
    return spans([FL.formatOf(lg).label, lg.holes + ' holes', plural(lg.weeks, 'week', 'weeks'), (lg.perWeek === 1 ? '1 game' : lg.perWeek + ' games') + ' a week']);
  }
  function seasonHTML(start, weeks) { return '<span>' + esc(dshort(start) + ' to ' + dshort(Club.date.addDays(start, weeks * 7 - 1))) + '</span> <span>' + esc('(' + plural(weeks, 'week', 'weeks') + ')') + '</span>'; }
  function datesLine(lg) { return dshort(lg.start) + ' to ' + dshort(FL.endDate(lg)); }
  function canInvite(lg, me) { const st = FL.status(lg); return isCreator(lg, me) && (st === 'forming' || st === 'waiting'); }
  function invitesFor(me) { return FL.invitesFor(me).sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); }); }
  /* Undo reverses only its own action: one player's entry (mid given), or the cancelled flag. Restoring a copy of
     the whole member list would also reverse later changes (an accept, another removal, an invite). */
  function snapshot(lg, mid) {
    if (!mid) return { cancelled: !!lg.cancelled, cancelledAt: lg.cancelledAt || null };
    const list = lg.members || [], x = list.find(function (y) { return y.memberId === mid; });
    return { mid: mid, entry: x ? JSON.parse(JSON.stringify(x)) : null, index: x ? list.indexOf(x) : -1 };
  }
  function undoToast(msg, lgId, snap, after) {
    ui.toast(msg, null, { action: { label: 'Undo', onClick: function () {
      const cur = FL.get(lgId); if (!cur) return;
      if (snap.mid) {
        const list = (cur.members || []).filter(function (y) { return y.memberId !== snap.mid; }).map(function (y) { return Object.assign({}, y); });
        if (snap.entry) list.splice(snap.index < 0 ? list.length : Math.min(snap.index, list.length), 0, snap.entry);
        S.update('friendLeagues', lgId, { members: list });
      } else S.update('friendLeagues', lgId, snap);
      ui.toast('Undone'); if (after) after();
    } } });
  }
  function statusPill(lg) {
    const st = FL.status(lg);
    return '<span class="fl-pill fl-pill-' + st + '">' + esc(FL.statusLabel(lg)) + '</span>';
  }

  /* ---------------- Invites (also shown in the Friends Requests tab) ---------------- */
  function inviteRowHTML(lg, me) {
    const e = FL.entry(lg, me) || {}, team = e.teamId ? teamOf(lg, e.teamId) : null;
    const sub = spans(['Starts ' + dshort(lg.start), plural(lg.weeks, 'week', 'weeks'), FL.formatOf(lg).short].concat(team ? ['Team: ' + team.name] : []));
    return '<li class="fl-inv" data-inv-row="' + esc(lg.id) + '"><span class="fl-inv-main">' +
      '<span class="fl-inv-t">' + esc(nameFor(lg.createdBy, me) + ' invited you to ' + lg.name) + '</span>' +
      '<span class="fl-inv-s">' + sub + '</span>' +
      '<a class="p-link fl-inv-more" href="#/friends/leagues/' + encodeURIComponent(lg.id) + '">See details</a></span>' +
      '<span class="fl-inv-act"><button type="button" class="btn btn-sm" data-fl="decline" data-id="' + esc(lg.id) + '" aria-label="' + esc('Decline the invite to ' + lg.name) + '">Decline</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-fl="accept" data-id="' + esc(lg.id) + '" aria-label="' + esc('Accept the invite to ' + lg.name) + '">Accept</button></span></li>';
  }
  function invitesHTML(me) {
    const list = invitesFor(me); if (!list.length) return '';
    return '<section class="fr-block fl-invites"><h2 class="fr-h">League invites</h2><ul class="p-list fl-invs">' + list.map(function (lg) { return inviteRowHTML(lg, me); }).join('') + '</ul></section>';
  }
  function accept(me, id) {
    const lg = FL.get(id); if (!lg) return;
    FL.respond(id, me, true);
    ui.toast('You are in ' + lg.name);
  }
  function decline(me, id, after) {
    const lg = FL.get(id); if (!lg) return;
    const snap = snapshot(lg, me); FL.respond(id, me, false);
    undoToast('Invite to ' + lg.name + ' declined', id, snap, after);
  }
  /** Accept and Decline buttons in any container (Requests tab, league list, league page). */
  function wire(root, me, after) {
    ui.on(root, 'click', '[data-fl=accept]', function (e, b) { accept(me, b.dataset.id); if (after) after(); });
    ui.on(root, 'click', '[data-fl=decline]', function (e, b) { decline(me, b.dataset.id, after); if (after) after(); });
  }

  /* ---------------- League list ---------------- */
  function placeText(lg, me) {
    const st = FL.status(lg);
    if (st !== 'active' && st !== 'complete') return '';
    const s = FL.standings(lg), row = s.rows.find(function (r) { return r.memberId === me; });
    if (!row || row.pos === '–') return st === 'complete' ? '' : row && row.played ? 'No week is complete yet' : 'No games played yet';
    return (st === 'complete' ? 'You finished ' : 'Your place: ') + row.pos + ' of ' + s.rows.length;
  }
  function playersText(lg) {
    const acc = FL.accepted(lg).length, inv = (lg.members || []).filter(function (x) { return x.status === 'invited'; }).length;
    if (lg.mode === 'teams') return plural((lg.teams || []).length, 'team', 'teams') + ' of ' + lg.teamSize;
    return plural(acc, 'player', 'players') + (inv ? ', ' + inv + ' invited' : '');
  }
  function leagueRowHTML(lg, me) {
    const e = FL.entry(lg, me) || {}, place = placeText(lg, me);
    const sub2 = e.status === 'invited' ? 'Invited by ' + nameFor(lg.createdBy, me) : place;
    return '<li><a class="fl-row" href="#/friends/leagues/' + encodeURIComponent(lg.id) + '">' +
      '<span class="fl-row-ic" aria-hidden="true">' + Club.icon('trophy') + '</span>' +
      '<span class="fl-row-main"><span class="fl-row-name">' + esc(lg.name) + '</span>' +
      '<span class="fl-row-sub">' + spans([FL.formatOf(lg).short, playersText(lg)]) + '</span>' +
      '<span class="fl-row-st">' + statusPill(lg) + (sub2 ? '<span class="fl-row-me">' + esc(sub2) + '</span>' : '') + '</span></span>' +
      Club.icon('chevronRight', 'fr-go') + '</a></li>';
  }
  function listHTML(me) {
    const all = FL.listFor(me);
    const invited = invitesFor(me).map(function (x) { return x.id; });
    const mine = all.filter(function (lg) { return invited.indexOf(lg.id) < 0; });
    const live = mine.filter(function (lg) { const st = FL.status(lg); return st === 'forming' || st === 'waiting' || st === 'active'; });
    const past = mine.filter(function (lg) { return live.indexOf(lg) < 0; });
    let h = '<div class="fl-list-head"><div><h2 class="fr-h">Leagues</h2><p class="fl-intro">Play a season with your friends. Rounds you book or post for the league count toward it.</p></div>' +
      '<a class="btn btn-primary fl-start" href="#/friends/leagues/new">' + Club.icon('plus') + '<span>Start a league</span></a></div>';
    h += invitesHTML(me);
    if (!live.length && !past.length) {
      h += '<div class="fr-empty fl-empty">' + ui.empty({ icon: 'trophy', title: 'No leagues yet', text: 'Start a league and invite your friends. Everyone plays their rounds when it suits them, and the standings update as scores are posted.' }) + '</div>';
      return h;
    }
    if (live.length) h += '<section class="fr-block"><h2 class="eyebrow fl-eb">Your leagues</h2><ul class="p-list fl-rows">' + live.map(function (lg) { return leagueRowHTML(lg, me); }).join('') + '</ul></section>';
    if (past.length) h += '<section class="fr-block"><h2 class="eyebrow fl-eb">Finished and cancelled</h2><ul class="p-list fl-rows">' + past.map(function (lg) { return leagueRowHTML(lg, me); }).join('') + '</ul></section>';
    return h;
  }

  /* ---------------- League page ---------------- */
  function memberStatusText(lg, x, me) {
    if (x.memberId === lg.createdBy) return 'Organiser';
    return x.status === 'accepted' ? 'Joined' : x.status === 'invited' ? 'Invited' : x.status === 'declined' ? 'Declined the invite' : '';
  }
  function personRow(lg, x, me) {
    const editable = FL.editable(lg) && isCreator(lg, me) && x.memberId !== me && (x.status === 'accepted' || x.status === 'invited');
    const st = memberStatusText(lg, x, me), off = x.status === 'declined';
    return '<li class="fl-person' + (off ? ' is-off' : '') + '">' + ui.avatar(fullName(x.memberId), 'sm', x.status !== 'accepted') +
      '<span class="fl-person-main"><span class="fl-person-name">' + esc(nameFor(x.memberId, me)) + (x.memberId === me ? ' <span class="fl-you">You</span>' : '') + '</span>' +
      '<span class="fl-person-sub">' + esc(st) + '</span></span>' +
      (editable ? '<button type="button" class="p-link fl-remove" data-fl="remove" data-mid="' + esc(x.memberId) + '" aria-label="' + esc('Remove ' + nameFor(x.memberId, me) + ' from the league') + '">Remove</button>' : '') + '</li>';
  }
  function peopleHTML(lg, me) {
    const shown = (lg.members || []).filter(function (x) { return x.status !== 'removed'; });
    const inv = canInvite(lg, me);
    if (lg.mode !== 'teams') {
      return '<ul class="p-list fl-people">' + shown.map(function (x) { return personRow(lg, x, me); }).join('') + '</ul>' +
        (inv ? '<button type="button" class="btn fl-invite-btn" data-fl="invite">' + Club.icon('plus') + '<span>Invite a friend</span></button>' : '');
    }
    return (lg.teams || []).map(function (t) {
      const ppl = shown.filter(function (x) { return x.teamId === t.id; });
      const filled = ppl.filter(function (x) { return x.status === 'accepted' || x.status === 'invited'; }).length;
      const open = Math.max(0, lg.teamSize - filled);
      let rows = ppl.map(function (x) { return personRow(lg, x, me); }).join('');
      for (let i = 0; i < open; i++) {
        rows += '<li class="fl-person is-open"><span class="fl-slot-ic" aria-hidden="true">' + Club.icon('user') + '</span><span class="fl-person-main"><span class="fl-person-name">Open spot</span></span>' +
          (inv ? '<button type="button" class="btn btn-sm" data-fl="invite" data-team="' + esc(t.id) + '" aria-label="' + esc('Invite a friend to ' + t.name) + '">Invite</button>' : '') + '</li>';
      }
      return '<div class="fl-team"><h3 class="fl-team-h"><span>' + esc(t.name) + '</span><span class="fl-team-n">' + esc(FL.teamMembers(lg, t.id).length + ' of ' + lg.teamSize + ' in') + '</span></h3><ul class="p-list fl-people">' + rows + '</ul></div>';
    }).join('');
  }
  function rulesHTML(lg) {
    const f = FL.formatOf(lg);
    const kv = function (k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; };
    return '<dl class="fl-kv">' +
      kv('Scoring', f.label) + '<div class="fl-kv-note"><dd>' + esc(f.text) + '</dd></div>' +
      '<div><dt>Season</dt><dd>' + seasonHTML(lg.start, lg.weeks) + '</dd></div>' +
      kv('Games', (lg.perWeek === 1 ? '1 game' : lg.perWeek + ' games') + ' a week, ' + lg.holes + ' holes') +
      kv('Players', lg.mode === 'teams' ? 'Teams of ' + lg.teamSize : 'Individual') +
      kv('Organiser', fullName(lg.createdBy)) +
      '</dl><p class="fl-note">Each week starts on a ' + fmt.toDate(lg.start).toLocaleDateString('en-US', { weekday: 'long' }) + '. Missed a week? Play an extra round later and it counts for the week you missed. Games still missing at the end count as the worst score of that week. Until the end, players are ranked on their average per game.</p>';
  }

  /** Standings tables and the week by week grid. */
  function standingsHTML(lg, me) {
    const s = FL.standings(lg), f = FL.formatOf(lg), weekly = lg.format === 'weekly';
    const head = weekly ? '<th scope="col" class="fl-num">Points</th>' : '<th scope="col" class="fl-num">Per game</th><th scope="col" class="fl-num fl-col-tot">Total</th>';
    const vals = function (r) { return weekly ? '<td class="fl-num fl-strong">' + esc(valText(lg, r.total)) + '</td>' : '<td class="fl-num"><span class="fl-strong">' + esc(valText(lg, r.key)) + '</span>' + (r.total != null ? '<span class="fl-tot-sub">' + esc('Total ' + valText(lg, r.total)) + '</span>' : '') + '</td><td class="fl-num fl-col-tot">' + esc(valText(lg, r.total)) + '</td>'; };
    let h = '';
    if (lg.mode === 'teams' && s.teams.length) {
      h += '<section class="fl-sec fl-sec-teams"><h2 class="eyebrow fl-eb">Team standings</h2><div class="fl-tbox"><table class="fl-table"><caption class="fr-sr">Team standings</caption><thead><tr><th scope="col" class="fl-pos">Pos</th><th scope="col">Team</th>' + head + '<th scope="col" class="fl-num">Games</th></tr></thead><tbody>' +
        s.teams.map(function (t) {
          const mine = t.members.indexOf(me) >= 0;
          return '<tr' + (mine ? ' class="is-me"' : '') + '><td class="fl-pos">' + esc(t.pos) + '</td><th scope="row" class="fl-who"><span class="fl-who-n">' + esc(t.name) + '</span><span class="fl-who-s">' + esc(t.members.map(function (id) { return nameFor(id, me); }).join(', ')) + '</span></th>' +
            vals(t) + '<td class="fl-num fl-games">' + esc(t.played + ' of ' + t.of) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    h += '<section class="fl-sec fl-sec-players"><h2 class="eyebrow fl-eb">' + (lg.mode === 'teams' ? 'Player standings' : 'Standings') + '</h2><div class="fl-tbox"><table class="fl-table"><caption class="fr-sr">Player standings</caption><thead><tr><th scope="col" class="fl-pos">Pos</th><th scope="col">Player</th>' + head + '<th scope="col" class="fl-num">Games</th></tr></thead><tbody>' +
      s.rows.map(function (r) {
        const team = r.teamId ? teamOf(lg, r.teamId) : null;
        return '<tr class="fl-prow' + (r.memberId === me ? ' is-me' : '') + '"><td class="fl-pos">' + esc(r.pos) + '</td><th scope="row" class="fl-who"><button type="button" class="fl-who-btn" data-fl="player" data-mid="' + esc(r.memberId) + '" aria-haspopup="dialog">' +
          '<span class="fl-who-n">' + esc(nameFor(r.memberId, me)) + '</span>' + (team ? '<span class="fl-who-s">' + esc(team.name) + '</span>' : '') + '</button></th>' +
          vals(r) + '<td class="fl-num fl-games">' + esc(r.played + ' of ' + r.of) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="fl-legend">' + esc(weekly ? 'Points by weekly finish. Each completed week gives points by place.' : (f.higher ? 'Higher is better. ' : 'Lower is better. ') + (s.done ? 'Final totals.' : 'Ranked on the average per game, so catching up never hurts.')) + '</p></section>';
    h += gridHTML(lg, me, s);
    return h;
  }
  function slotLabel(lg, sl) { return 'Week ' + sl.week + (lg.perWeek > 1 ? ', game ' + sl.game : ''); }
  function slotState(lg, s, sl) {
    if (sl.post) return sl.late ? 'Played ' + dshort(sl.post.date) + ' (late)' : 'Played ' + dshort(sl.post.date);
    if (sl.state === 'missed') return 'Missed';
    if (FL.status(lg) !== 'active') return 'Not played';
    return sl.week < s.weekNow ? 'To catch up' : sl.week === s.weekNow ? 'Not played yet' : 'Coming up';
  }
  function cellHTML(lg, me, s, sl, mid) {
    const who = nameFor(mid, me);
    if (sl.post) {
      const label = who + ', ' + slotLabel(lg, sl) + ': ' + slotState(lg, s, sl) + ', ' + valText(lg, sl.value) + '. Open scorecard';
      return '<button type="button" class="fl-cell is-played' + (sl.late ? ' is-late' : '') + '" data-post="' + esc(sl.post.id) + '" aria-label="' + esc(label) + '" title="' + esc(slotState(lg, s, sl)) + '">' +
        '<span class="fl-v">' + esc(num(sl.value)) + '</span><span class="fl-d">' + esc(dshort(sl.post.date)) + (sl.late ? ' (late)' : '') + '</span></button>';
    }
    if (sl.state === 'missed') return '<span class="fl-cell is-missed" title="Missed, counts as the worst score of the week"><span class="fl-v">' + esc(num(sl.value)) + '</span><span class="fl-d">Missed</span></span>';
    const txt = slotState(lg, s, sl);
    return '<span class="fl-cell is-open' + (txt === 'To catch up' ? ' is-due' : '') + '"><span class="fl-v" aria-hidden="true">–</span><span class="fl-d">' + esc(txt === 'Coming up' ? '' : txt) + '</span></span>';
  }
  function gridHTML(lg, me, s) {
    const weekly = lg.format === 'weekly', cols = lg.weeks + 2;
    let head = '<tr><th scope="col" class="fl-stick">Player</th>';
    for (let w = 1; w <= lg.weeks; w++) head += '<th scope="col" class="fl-wk' + (w === s.weekNow && FL.status(lg) === 'active' ? ' is-now' : '') + '"><span>Week ' + w + '</span><span class="fl-wk-d">' + esc(dshort(FL.weekStart(lg, w))) + '</span></th>';
    head += '<th scope="col" class="fl-num">' + (weekly ? 'Points' : 'Total') + '</th></tr>';
    function row(r) {
      let h = '<tr' + (r.memberId === me ? ' class="is-me"' : '') + '><th scope="row" class="fl-stick"><span class="fl-who-n">' + esc(nameFor(r.memberId, me)) + '</span></th>';
      r.weeks.forEach(function (wk) {
        const wp = s.weekPoints[wk.week] && s.weekPoints[wk.week][r.memberId];
        h += '<td class="fl-wk' + (wk.week === s.weekNow && FL.status(lg) === 'active' ? ' is-now' : '') + '"><div class="fl-cells">' + wk.slots.map(function (sl) { return cellHTML(lg, me, s, sl, r.memberId); }).join('') + '</div>' +
          (wp ? '<span class="fl-wp">' + esc(wp.points + (wp.points === 1 ? ' pt' : ' pts')) + '</span>' : '') + '</td>';
      });
      return h + '<td class="fl-num fl-strong">' + esc(valText(lg, r.total)) + '</td></tr>';
    }
    let body = '';
    if (lg.mode === 'teams') {
      (lg.teams || []).forEach(function (t) {
        const rows = s.rows.filter(function (r) { return r.teamId === t.id; });
        if (!rows.length) return;
        body += '<tr class="fl-team-row"><th scope="colgroup" colspan="' + cols + '"><span class="fl-stick-in">' + esc(t.name) + '</span></th></tr>' + rows.map(row).join('');
      });
    } else body = s.rows.map(row).join('');
    const unit = weekly ? 'net score' : lg.format === 'stableford' ? 'Stableford points' : lg.format === 'net' ? 'net score' : 'gross score';
    return '<section class="fl-sec fl-sec-grid"><h2 class="eyebrow fl-eb">Week by week</h2>' +
      '<p class="fl-legend">Each box is one game and shows the ' + unit + '. Tap a score to see the scorecard.</p>' +
      '<div class="fl-gbox" role="region" aria-label="Week by week scores" tabindex="0"><table class="fl-grid"><caption class="fr-sr">Week by week scores</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></section>';
  }
  function playerSheet(lg, me, mid) {
    const s = FL.standings(lg), r = s.rows.find(function (x) { return x.memberId === mid; }); if (!r) return;
    const slots = s.slots[mid] || [];
    const rows = slots.map(function (sl, k) {
      const meta = sl.value != null ? valText(lg, sl.value) : '';
      return sl.post ? { value: sl.post.id, label: slotLabel(lg, sl), sub: slotState(lg, s, sl), meta: meta }
        : { value: 'x' + k, label: slotLabel(lg, sl), sub: sl.state === 'missed' ? 'Missed, counts as ' + meta : slotState(lg, s, sl), disabled: true, reason: '' };
    });
    Portal.openSheet({ title: nameFor(mid, me), size: 'full', rows: rows, onPick: function (v) { if (Portal.scores && Portal.scores.openPost) Portal.scores.openPost(v); } });
  }

  function leagueHTML(lg, me) {
    const e = FL.entry(lg, me), st = FL.status(lg), probs = FL.problems(lg), creator = isCreator(lg, me);
    let h = '<a class="p-link fr-back fl-back" href="#/friends/leagues">' + Club.icon('chevronLeft') + '<span>Leagues</span></a>' +
      '<header class="fl-title"><p class="eyebrow">Friends league</p><h1>' + esc(lg.name) + '</h1>' +
      '<p class="fl-sub">' + statusPill(lg) + '<span>' + rulesLine(lg) + '</span></p><p class="fl-sub2">' + spans([datesLine(lg)].concat(lg.mode === 'teams' ? ['Teams of ' + lg.teamSize] : [])) + '</p></header>';
    if (e && e.status === 'invited' && st !== 'cancelled') {
      const team = e.teamId ? teamOf(lg, e.teamId) : null;
      h += '<div class="fl-banner" role="note"><p><strong>' + esc(nameFor(lg.createdBy, me) + ' invited you to this league' + (team ? ', on ' + team.name : '') + '.') + '</strong> ' + esc('Joining shares your league scores with the other players.') + '</p>' +
        '<div class="fl-banner-acts"><button type="button" class="btn btn-sm" data-fl="decline" data-id="' + esc(lg.id) + '">Decline</button><button type="button" class="btn btn-primary btn-sm" data-fl="accept" data-id="' + esc(lg.id) + '">Accept</button></div></div>';
    }
    if (st === 'cancelled') {
      h += '<div class="fl-banner is-quiet" role="note"><p>' + esc(lg.cancelled ? 'This league was cancelled.' : 'This league never started: not enough players joined before the end.') + '</p>' +
        (lg.cancelled && creator && today() < lg.start ? '<div class="fl-banner-acts"><button type="button" class="btn btn-sm" data-fl="restore">Restore league</button></div>' : '') + '</div>';
    }
    const setup = st === 'forming' || st === 'waiting' || (st === 'cancelled' && !FL.ready(lg));
    if (setup) {
      h += '<div class="fl-cols"><div class="fl-col">';
      if (st !== 'cancelled') {
        h += '<section class="fl-sec"><h2 class="eyebrow fl-eb">' + (probs.length ? 'Before it can start' : 'Ready to go') + '</h2>' +
          (probs.length ? '<ul class="fl-probs">' + probs.map(function (p) { return '<li>' + Club.icon('clock') + '<span>' + esc(p) + '</span></li>'; }).join('') + '</ul>'
            : '<p class="fl-ok">' + Club.icon('check') + '<span>' + esc(st === 'forming' ? 'Everyone is in. The league starts ' + dshort(lg.start) + '.' : 'Everyone is in.') + '</span></p>') +
          (st === 'waiting' ? '<p class="fl-note">The start date has passed. Rounds count once every spot is filled with a player who has accepted.</p>' : '') +
          (st === 'forming' && creator ? '<p class="fl-note">You can invite or remove players until ' + esc(dshort(lg.start)) + '. The rules lock when the league starts.</p>' : '') + '</section>';
      }
      h += '<section class="fl-sec"><h2 class="eyebrow fl-eb">Players</h2>' + peopleHTML(lg, me) + '</section></div>' +
        '<div class="fl-col"><section class="fl-sec"><h2 class="eyebrow fl-eb">Rules</h2><div class="fl-card">' + rulesHTML(lg) + '</div></section>' +
        (creator && (st === 'forming' || st === 'waiting') ? '<section class="fl-sec fl-danger"><button type="button" class="btn btn-danger" data-fl="cancel">Cancel league</button></section>' : '') +
        '</div></div>';
      return h;
    }
    h += standingsHTML(lg, me);
    h += '<section class="fl-sec">' + Portal.accordion({ id: 'fl-rules-' + lg.id, icon: 'info', title: 'League rules', summary: FL.formatOf(lg).label, body: rulesHTML(lg) }) + '</section>';
    return h;
  }

  function openInvite(lg, me, teamId, after) {
    const inLeague = (lg.members || []).filter(function (x) { return x.status === 'accepted' || x.status === 'invited'; }).map(function (x) { return x.memberId; });
    const fs = friendsOf(me).filter(function (id) { return inLeague.indexOf(id) < 0; });
    if (!fs.length) { ui.toast(friendsOf(me).length ? 'All your friends are already in this league' : 'Add friends first. Leagues are with friends.', 'bad'); return; }
    const team = teamId ? teamOf(lg, teamId) : null;
    Portal.openSheet({ title: team ? 'Invite to ' + team.name : 'Invite a friend', rows: fs.map(function (id) {
      const x = (lg.members || []).find(function (y) { return y.memberId === id; });
      return { value: id, label: fullName(id), sub: x && x.status === 'declined' ? 'Declined before' : (member(id) && member(id).handicap != null ? 'Handicap ' + fmt.handicap(member(id).handicap) : '') };
    }), onPick: function (id) {
      const cur = FL.get(lg.id); if (!cur) return;
      const snap = snapshot(cur, id);
      FL.invite(lg.id, id, teamId || null);
      undoToast('Invite sent to ' + fullName(id), lg.id, snap, after);
      if (after) after();
    } });
  }

  function renderLeague(host, me, id, onChange) {
    function draw() {
      const lg = FL.get(id), e = lg && FL.entry(lg, me);
      if (!lg || !e || e.status === 'removed') {
        host.innerHTML = '<a class="p-link fr-back fl-back" href="#/friends/leagues">' + Club.icon('chevronLeft') + '<span>Leagues</span></a>' +
          '<div class="fr-empty">' + ui.empty({ icon: 'trophy', title: 'This league is not available', text: 'It may have been removed, or you are not in it.' }) + '</div>';
        return;
      }
      host.innerHTML = '<div class="fl-page">' + leagueHTML(lg, me) + '</div>';
      if (onChange) onChange();
    }
    draw();
    wire(host, me, draw);
    ui.on(host, 'click', '[data-post]', function (e, b) { if (Portal.scores && Portal.scores.openPost) Portal.scores.openPost(b.dataset.post); });
    ui.on(host, 'click', '[data-fl=player]', function (e, b) { const lg = FL.get(id); if (lg) playerSheet(lg, me, b.dataset.mid); });
    ui.on(host, 'click', 'tr.fl-prow', function (e, tr) { if (e.target.closest('button')) return; const b = ui.$('[data-fl=player]', tr); if (b) b.click(); });
    ui.on(host, 'click', '[data-fl=invite]', function (e, b) { const lg = FL.get(id); if (lg) openInvite(lg, me, b.dataset.team || null, draw); });
    ui.on(host, 'click', '[data-fl=remove]', function (e, b) {
      const lg = FL.get(id); if (!lg) return; const mid = b.dataset.mid, snap = snapshot(lg, mid);
      FL.removeMember(id, mid); draw();
      undoToast(nameFor(mid, me) + ' removed from the league', id, snap, draw);
    });
    ui.on(host, 'click', '[data-fl=cancel]', function () {
      const lg = FL.get(id); if (!lg) return;
      ui.confirm({ title: 'Cancel ' + lg.name + '?', text: 'Everyone in it will see that it was cancelled. You can restore it before the start date.', confirmLabel: 'Cancel league', cancelLabel: 'Keep league', danger: true }).then(function (ok) {
        if (!ok) return; const snap = snapshot(FL.get(id)); FL.cancel(id); draw();
        undoToast('League cancelled', id, snap, draw);
      });
    });
    ui.on(host, 'click', '[data-fl=restore]', function () { FL.restore(id); draw(); ui.toast('League restored'); });
    const un = [S.subscribe('friendLeagues', draw), S.subscribe('scorePosts', draw)];
    return function () { un.forEach(function (u) { u(); }); };
  }

  /* ---------------- Start a league ---------------- */
  const STEPS = [{ id: 'rules', label: 'Rules' }, { id: 'players', label: 'Players' }, { id: 'review', label: 'Review' }];
  const MAX_TEAMS = 8;
  function renderNew(host, me) {
    const fs = friendsOf(me);
    const st = {
      step: 'rules', name: '', start: Club.date.addDays(today(), 7), weeks: 6, perWeek: 1, holes: 18, format: 'stableford',
      mode: 'individual', picks: [], teamSize: 2, teams: [{ name: '', members: [me] }, { name: '', members: [] }], err: []
    };
    function stepIndex() { return STEPS.findIndex(function (s) { return s.id === st.step; }); }
    function teamName(i) { return String(st.teams[i].name || '').trim() || 'Team ' + (i + 1); }
    function frame(inner) {
      const i = stepIndex();
      return '<div class="fl-flow">' +
        (i > 0 ? '<button type="button" class="p-link fr-back fl-back" data-act="back">' + Club.icon('chevronLeft') + '<span>Back</span></button>'
          : '<a class="p-link fr-back fl-back" href="#/friends/leagues">' + Club.icon('chevronLeft') + '<span>Leagues</span></a>') +
        '<h1 class="fl-flow-h">Start a league</h1>' +
        '<ol class="fl-steps" aria-label="Steps">' + STEPS.map(function (s, k) {
          return '<li class="' + (k < i ? 'is-done' : k === i ? 'is-now' : '') + '"' + (k === i ? ' aria-current="step"' : '') + '><span class="fl-step-n" aria-hidden="true">' + (k < i ? Club.icon('check') : k + 1) + '</span><span class="fl-step-l">' + s.label + '</span></li>';
        }).join('') + '</ol>' +
        '<div class="fl-err" role="alert"' + (st.err.length ? '' : ' hidden') + '>' + Club.icon('alert') + '<div>' + st.err.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div></div>' +
        '<div class="fl-step-body">' + inner + '</div></div>';
    }
    /* ---- Step 1: rules ---- */
    function rulesStep() {
      return '<div class="fl-q"><label class="pk-label" for="fl-name">League name</label><input class="input" id="fl-name" name="name" maxlength="40" autocomplete="off" placeholder="For example, Fall Friends Cup" value="' + esc(st.name) + '"></div>' +
        '<div class="fl-q fl-date"></div>' +
        '<div class="fl-q2"><div class="fl-q fl-weeks"></div><div class="fl-q fl-per"></div></div>' +
        '<p class="fl-hint fl-season">' + esc(seasonText()) + '</p>' +
        '<div class="fl-q"><span class="pk-label" id="fl-holes-l">Holes</span><div class="segmented fl-seg" role="radiogroup" aria-labelledby="fl-holes-l">' +
          [18, 9].map(function (n) { return '<button type="button" role="radio" data-holes="' + n + '" aria-checked="' + (st.holes === n) + '"' + (st.holes === n ? ' class="active"' : '') + '>' + n + ' holes</button>'; }).join('') + '</div>' +
          '<p class="fl-hint">Only rounds of this length count.</p></div>' +
        '<div class="fl-q"><span class="pk-label" id="fl-fmt-l">Scoring</span><div class="fl-opts" role="radiogroup" aria-labelledby="fl-fmt-l">' + FL.FORMATS.map(function (f) {
          const on = st.format === f.value;
          return '<button type="button" class="fl-opt" role="radio" data-format="' + f.value + '" aria-checked="' + on + '"><span class="fl-opt-main"><span class="fl-opt-l">' + esc(f.label) + '</span><span class="fl-opt-s">' + esc(f.text) + '</span></span><span class="fl-radio" aria-hidden="true"></span></button>';
        }).join('') + '</div></div>';
    }
    function seasonText() {
      const end = Club.date.addDays(st.start, st.weeks * 7 - 1);
      return 'Runs ' + dshort(st.start) + ' to ' + dshort(end) + '. Each week starts on a ' + fmt.toDate(st.start).toLocaleDateString('en-US', { weekday: 'long' }) + '. ' +
        plural(st.weeks * st.perWeek, 'game', 'games') + ' for each player.';
    }
    /* ---- Step 2: players ---- */
    function placedOn(id) { return st.teams.findIndex(function (t) { return t.members.indexOf(id) >= 0; }); }
    function personMini(id, sub) {
      return ui.avatar(fullName(id), 'sm') + '<span class="fl-pick-main"><span class="fl-pick-l">' + esc(fullName(id)) + (id === me ? ' <span class="fl-you">You</span>' : '') + '</span>' + (sub ? '<span class="fl-pick-s">' + esc(sub) + '</span>' : '') + '</span>';
    }
    function hcpText(id) { const m = member(id); return m && m.handicap != null ? 'Handicap ' + fmt.handicap(m.handicap) : ''; }
    function playersStep() {
      let h = '<div class="fl-q"><span class="pk-label" id="fl-mode-l">How do you want to play?</span><div class="segmented fl-seg" role="radiogroup" aria-labelledby="fl-mode-l">' +
        [['individual', 'Individual'], ['teams', 'Teams']].map(function (x) { return '<button type="button" role="radio" data-mode="' + x[0] + '" aria-checked="' + (st.mode === x[0]) + '"' + (st.mode === x[0] ? ' class="active"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' +
        '<p class="fl-hint">' + (st.mode === 'teams' ? 'Teams add up their players’ scores. Every team has the same number of players.' : 'Everyone plays for themselves.') + '</p></div>';
      if (!fs.length) return h + '<div class="fl-card">' + ui.empty({ icon: 'members', title: 'Add friends first', text: 'Leagues are with friends. Send a friend request, and once it is accepted you can invite them.', action: '<a class="btn" href="#/friends">Find friends</a>' }) + '</div>';
      if (st.mode === 'individual') {
        h += '<div class="fl-q"><span class="pk-label" id="fl-inv-l">Invite friends</span><ul class="p-list fl-picks" role="group" aria-labelledby="fl-inv-l">' +
          '<li><span class="fl-pick is-fixed">' + personMini(me, 'Organiser') + '<span class="fl-check is-on" aria-hidden="true">' + Club.icon('check') + '</span></span></li>' +
          fs.map(function (id) {
            const on = st.picks.indexOf(id) >= 0;
            return '<li><button type="button" class="fl-pick" role="checkbox" aria-checked="' + on + '" data-pick="' + esc(id) + '">' + personMini(id, hcpText(id)) + '<span class="fl-check' + (on ? ' is-on' : '') + '" aria-hidden="true">' + Club.icon('check') + '</span></button></li>';
          }).join('') + '</ul><p class="fl-hint">' + esc(plural(st.picks.length + 1, 'player', 'players') + ' including you. Invites go to your friends to accept.') + '</p></div>';
        return h;
      }
      h += '<div class="fl-q"><span class="pk-label" id="fl-size-l">Players on each team</span><div class="segmented fl-seg" role="radiogroup" aria-labelledby="fl-size-l">' +
        [2, 3, 4].map(function (n) { return '<button type="button" role="radio" data-size="' + n + '" aria-checked="' + (st.teamSize === n) + '"' + (st.teamSize === n ? ' class="active"' : '') + '>' + n + '</button>'; }).join('') + '</div></div>';
      const filled = st.teams.reduce(function (a, t) { return a + t.members.length; }, 0);
      h += '<p class="fl-hint fl-fill">' + esc(filled + ' of ' + st.teams.length * st.teamSize + ' spots filled. You have ' + plural(fs.length, 'friend', 'friends') + ' to choose from.') + '</p>';
      h += '<div class="fl-teams">' + st.teams.map(function (t, i) {
        let slots = '';
        for (let k = 0; k < st.teamSize; k++) {
          const id = t.members[k];
          slots += id
            ? '<li class="fl-slot">' + personMini(id, '') + '<button type="button" class="btn btn-icon btn-sm fl-slot-x" data-unplace="' + esc(id) + '" aria-label="' + esc('Take ' + (id === me ? 'yourself' : fullName(id)) + ' off ' + teamName(i)) + '">' + Club.icon('close') + '</button></li>'
            : '<li class="fl-slot is-open"><button type="button" class="fl-slot-add" data-place="' + i + '">' + Club.icon('plus') + '<span>Add a player</span></button></li>';
        }
        return '<div class="fl-tcard"><div class="fl-tcard-head"><label class="fr-sr" for="fl-tn-' + i + '">Name of team ' + (i + 1) + '</label>' +
          '<input class="input fl-tname" id="fl-tn-' + i + '" data-tname="' + i + '" maxlength="30" autocomplete="off" placeholder="Team ' + (i + 1) + '" value="' + esc(t.name) + '">' +
          (st.teams.length > 2 ? '<button type="button" class="p-link" data-delteam="' + i + '" aria-label="' + esc('Remove the team ' + teamName(i)) + '">Remove</button>' : '') + '</div>' +
          '<ul class="fl-slots">' + slots + '</ul></div>';
      }).join('') + '</div>' +
        (st.teams.length < MAX_TEAMS ? '<button type="button" class="btn fl-addteam" data-act="add-team">' + Club.icon('plus') + '<span>Add a team</span></button>' : '');
      return h;
    }
    /* ---- Step 3: review ---- */
    function reviewStep() {
      const f = FL.FORMATS.find(function (x) { return x.value === st.format; });
      const kv = function (k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'; };
      let who;
      if (st.mode === 'teams') {
        who = st.teams.map(function (t, i) { return '<div class="fl-rev-team"><p class="fl-rev-th">' + esc(teamName(i)) + '</p><p class="fl-rev-tp">' + esc(t.members.map(function (id) { return id === me ? 'You' : fullName(id); }).join(', ')) + '</p></div>'; }).join('');
      } else who = '<p class="fl-rev-tp">' + esc(['You'].concat(st.picks.map(fullName)).join(', ')) + '</p>';
      const n = st.mode === 'teams' ? st.teams.reduce(function (a, t) { return a + t.members.filter(function (x) { return x !== me; }).length; }, 0) : st.picks.length;
      return '<div class="fl-card"><h2 class="fl-rev-h">' + esc(String(st.name).trim()) + '</h2><dl class="fl-kv">' +
        kv('Scoring', f.label) + '<div><dt>Season</dt><dd>' + seasonHTML(st.start, st.weeks) + '</dd></div>' +
        kv('Games', (st.perWeek === 1 ? '1 game' : st.perWeek + ' games') + ' a week, ' + st.holes + ' holes') +
        kv('Players', st.mode === 'teams' ? plural(st.teams.length, 'team', 'teams') + ' of ' + st.teamSize : 'Individual') + '</dl>' +
        '<h3 class="eyebrow fl-eb">Who is playing</h3>' + who + '</div>' +
        '<p class="fl-note">' + esc(plural(n, 'friend gets', 'friends get') + ' an invite in Friends, Requests. The league starts on ' + dshort(st.start) + ' once everyone has accepted. Until then you can invite or remove players.') + '</p>';
    }

    function validate(step) {
      const e = [];
      if (step === 'rules') {
        if (!String(st.name).trim()) e.push('Give the league a name.');
        if (st.start <= today()) e.push('Choose a start date after today.');
      } else if (step === 'players') {
        if (!fs.length) e.push('Add friends first. Leagues are with friends.');
        else if (st.mode === 'individual') { if (!st.picks.length) e.push('Invite at least one friend.'); }
        else {
          if (placedOn(me) < 0) e.push('Put yourself on a team.');
          st.teams.forEach(function (t, i) { const need = st.teamSize - t.members.length; if (need > 0) e.push(teamName(i) + ' needs ' + plural(need, 'more player', 'more players') + '.'); });
          const names = st.teams.map(function (t, i) { return teamName(i).toLowerCase(); });
          if (names.some(function (x, i) { return names.indexOf(x) !== i; })) e.push('Give each team its own name.');
        }
      }
      return e;
    }
    function draw(focusTop) {
      host.innerHTML = frame(st.step === 'rules' ? rulesStep() : st.step === 'players' ? playersStep() : reviewStep());
      if (st.step === 'rules') {
        const days = []; for (let i = 1; i <= 60; i++) days.push({ date: Club.date.addDays(today(), i) });
        Portal.datePicker(ui.$('.fl-date', host), { label: 'Start date', title: 'Choose a start date', value: st.start, days: days, onChange: function (v) { st.start = v; season(); } });
        Portal.stepper(ui.$('.fl-weeks', host), { label: 'Weeks', value: st.weeks, min: 2, max: 16, onChange: function (v) { st.weeks = v; season(); } });
        Portal.stepper(ui.$('.fl-per', host), { label: 'Games a week', value: st.perWeek, min: 1, max: 3, onChange: function (v) { st.perWeek = v; season(); } });
      }
      bar();
      if (focusTop) { window.scrollTo({ top: 0 }); const h = ui.$('.fl-flow-h', host); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
    }
    function season() { const p = ui.$('.fl-season', host); if (p) p.textContent = seasonText(); bar(); }
    function bar() {
      const f = FL.FORMATS.find(function (x) { return x.value === st.format; });
      if (st.step === 'rules') Portal.actionBar.show({ summaryHTML: esc(f.short + ' · ' + st.holes + ' holes') + '<small>' + esc(plural(st.weeks, 'week', 'weeks') + ' from ' + dshort(st.start)) + '</small>', label: 'Continue', onClick: next });
      else if (st.step === 'players') {
        const n = st.mode === 'teams' ? st.teams.length + ' teams of ' + st.teamSize : plural(st.picks.length + 1, 'player', 'players');
        Portal.actionBar.show({ summaryHTML: esc(st.mode === 'teams' ? 'Teams' : 'Individual') + '<small>' + esc(n) + '</small>', label: 'Continue', onClick: next });
      } else Portal.actionBar.show({ summaryHTML: esc(String(st.name).trim()) + '<small>' + esc('Starts ' + dshort(st.start)) + '</small>', label: 'Create league', onClick: create });
    }
    function next() {
      readName();
      st.err = validate(st.step);
      if (st.err.length) { draw(false); const a = ui.$('.fl-err', host); if (a) a.scrollIntoView({ block: 'nearest' }); return; }
      st.step = STEPS[stepIndex() + 1].id; draw(true);
    }
    function readName() { const n = ui.$('#fl-name', host); if (n) st.name = n.value; }
    function create() {
      const errs = validate('rules').concat(validate('players'));
      if (errs.length) { st.err = errs; st.step = validate('rules').length ? 'rules' : 'players'; draw(true); return; }
      const o = { name: String(st.name).trim(), createdBy: me, start: st.start, weeks: st.weeks, perWeek: st.perWeek, holes: st.holes, format: st.format, mode: st.mode };
      if (st.mode === 'teams') {
        o.teamSize = st.teamSize; o.teams = st.teams.map(function (t, i) { return { name: teamName(i) }; }); o.creatorTeam = placedOn(me);
        o.invites = []; st.teams.forEach(function (t, i) { t.members.forEach(function (id) { if (id !== me) o.invites.push({ memberId: id, teamIndex: i }); }); });
      } else o.invites = st.picks.map(function (id) { return { memberId: id, teamIndex: null }; });
      const doc = FL.create(o);
      Portal.actionBar.hide();
      ui.toast('League created. ' + plural(o.invites.length, 'invite', 'invites') + ' sent');
      Portal.go('friends/leagues/' + doc.id);
    }
    function openPlace(i) {
      const opts = [me].concat(fs);
      Portal.openSheet({ title: 'Add to ' + teamName(i), rows: opts.map(function (id) {
        const on = placedOn(id);
        return { value: id, label: id === me ? fullName(id) + ' (you)' : fullName(id), sub: on >= 0 ? 'On team: ' + teamName(on) + (on === i ? '' : ', tap to move') : hcpText(id), disabled: on === i, reason: on === i ? 'On this team' : '' };
      }), onPick: function (id) {
        st.teams.forEach(function (t) { const k = t.members.indexOf(id); if (k >= 0) t.members.splice(k, 1); });
        st.teams[i].members.push(id); st.err = []; draw(); const b = ui.$('[data-place="' + i + '"]', host) || ui.$('[data-tname="' + i + '"]', host); if (b) b.focus();
      } });
    }

    ui.on(host, 'click', '[data-act=back]', function () { readName(); st.err = []; st.step = STEPS[Math.max(0, stepIndex() - 1)].id; draw(true); });
    ui.on(host, 'input', '#fl-name', function (e, f) { st.name = f.value; });
    ui.on(host, 'keydown', '#fl-name', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    ui.on(host, 'click', '[data-holes]', function (e, b) { st.holes = +b.dataset.holes; readName(); draw(); const x = ui.$('[data-holes="' + st.holes + '"]', host); if (x) x.focus(); });
    ui.on(host, 'click', '[data-format]', function (e, b) { st.format = b.dataset.format; readName(); draw(); const x = ui.$('[data-format="' + st.format + '"]', host); if (x) x.focus(); });
    ui.on(host, 'click', '[data-mode]', function (e, b) { st.mode = b.dataset.mode; st.err = []; draw(); const x = ui.$('[data-mode="' + st.mode + '"]', host); if (x) x.focus(); });
    ui.on(host, 'click', '[data-size]', function (e, b) {
      st.teamSize = +b.dataset.size; st.err = [];
      st.teams.forEach(function (t) { if (t.members.length > st.teamSize) t.members = t.members.slice(0, st.teamSize); });
      draw(); const x = ui.$('[data-size="' + st.teamSize + '"]', host); if (x) x.focus();
    });
    ui.on(host, 'click', '[data-pick]', function (e, b) {
      const id = b.dataset.pick, k = st.picks.indexOf(id);
      if (k >= 0) st.picks.splice(k, 1); else st.picks.push(id);
      st.err = []; draw(); const x = ui.$('[data-pick="' + id + '"]', host); if (x) x.focus();
    });
    ui.on(host, 'input', '[data-tname]', function (e, f) { st.teams[+f.dataset.tname].name = f.value; });
    ui.on(host, 'click', '[data-place]', function (e, b) { openPlace(+b.dataset.place); });
    ui.on(host, 'click', '[data-unplace]', function (e, b) {
      const id = b.dataset.unplace; let ti = -1;
      st.teams.forEach(function (t, i) { const k = t.members.indexOf(id); if (k >= 0) { t.members.splice(k, 1); ti = i; } });
      draw(); const x = ui.$('[data-place="' + ti + '"]', host); if (x) x.focus();
    });
    ui.on(host, 'click', '[data-act=add-team]', function () { st.teams.push({ name: '', members: [] }); st.err = []; draw(); const x = ui.$('[data-tname="' + (st.teams.length - 1) + '"]', host); if (x) x.focus(); });
    ui.on(host, 'click', '[data-delteam]', function (e, b) {
      const i = +b.dataset.delteam, gone = st.teams[i]; st.teams.splice(i, 1); st.err = []; draw();
      ui.toast('Removed the team ' + (String(gone.name).trim() || 'Team ' + (i + 1)), null, { action: { label: 'Undo', onClick: function () {
        if (!host.isConnected) return;   /* the form was left: nothing to put back */
        if (st.teams.length >= MAX_TEAMS) { ui.toast('There is no room for another team', 'bad'); return; }
        /* Friends placed on another team since then stay there: one friend is never on two teams */
        const back = { name: gone.name, members: gone.members.filter(function (id) { return placedOn(id) < 0; }).slice(0, st.teamSize) };
        st.teams.splice(Math.min(i, st.teams.length), 0, back); st.err = []; draw();
      } } });
    });
    draw(false);
    return function () { Portal.actionBar.hide(); };
  }

  /* ---------------- Entry point from Friends ---------------- */
  function render(host, me, params, onChange) {
    params = params || [];
    const m = member(me);
    if (params[0] === 'new') {
      const t = m && S.find('membershipTiers', m.tierId);
      if (t && !t.golf) { host.innerHTML = ui.empty({ icon: 'flag', title: 'Leagues are for golfing members', text: 'Your membership does not include golf. The golf shop can tell you about golfing memberships.' }); return null; }
      return renderNew(host, me);
    }
    if (params[0]) return renderLeague(host, me, decodeURIComponent(params[0]), onChange);
    function draw() { host.innerHTML = listHTML(me); if (onChange) onChange(); }
    draw();
    wire(host, me, draw);
    const un = S.subscribe('friendLeagues', draw);
    return function () { un(); };
  }

  Portal.friendLeagues = {
    render: render, invitesHTML: invitesHTML, wire: wire,
    inviteCount: function (me) { return invitesFor(me).length; }
  };

  /* ---------------- Demo leagues (once) ----------------
     For the demo member: an individual league five weeks in, a teams league four weeks in (rounds placed in their
     weeks, with a missed week caught up later and the current week partly played), and an invite from a friend to a
     league that starts next week. */
  (function demo() {
    const ME = S.DEMO_MEMBER || 'mem_1003';
    if (S.find('demoBackfills', 'friendLeagues1') || !member(ME) || !Portal.friends || !Portal.scores || !Portal.scores.demoPosts) return;
    const done = function () { S.insert('demoBackfills', { id: 'friendLeagues1', at: now() }); };
    const fs = friendsOf(ME).filter(function (id) { const m = member(id); return m && m.handicap != null; });
    if (fs.length < 2 || !S.all('holes').length) { done(); return; }
    const td = today();
    const stamp = function (daysAgo) { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(19, 10, 0, 0); return d.toISOString(); };
    const mem = function (id, startAgo, teamId) { return { memberId: id, status: 'accepted', teamId: teamId || null, invitedAt: stamp(startAgo + 9), respondedAt: stamp(startAgo + 8) }; };
    const OFFS = [1.2, -0.4, 2.3, 0.6, 1.7, -0.9, 0.9];
    function rounds(lgId, mid, days, seedNo, pre) {
      const m = member(mid); const base = Math.max(-2, m.handicap * 113 / 125);
      const plan = days.map(function (d, i) { return [d, i % 3 === 2 ? 'black' : 'green', Math.round((base + OFFS[(i + seedNo) % OFFS.length]) * 10) / 10, (i + seedNo) % 4 === 0 ? 1 : 0]; });
      Portal.scores.demoPosts(mid, plan, seedNo, pre + mid + '_').forEach(function (doc) {
        if (doc.teeTimeId && S.all('scorePosts').some(function (p) { return p.memberId === mid && p.teeTimeId === doc.teeTimeId; })) { doc.teeTimeId = null; doc.time = null; }
        doc.friendLeagueId = lgId;
        S.insert('scorePosts', doc);
      });
    }

    /* 1. Fall Friends Cup: individual, Net Stableford, 8 weeks from 33 days ago (week 5 now) */
    const p1 = [ME].concat(fs.slice(0, 4));
    const lg1 = S.insert('friendLeagues', { id: 'flg_demo_cup', name: 'Fall Friends Cup', createdBy: ME, createdAt: stamp(42), start: Club.date.addDays(td, -33), weeks: 8, perWeek: 1, holes: 18,
      format: 'stableford', mode: 'individual', teamSize: null, teams: [], members: p1.map(function (id) { return mem(id, 33); }), cancelled: false, cancelledAt: null, demo: true });
    /* Weeks are days ago 33-27, 26-20, 19-13, 12-6, 5-0. Player 2 misses week 3 and catches up in week 4;
       player 5 misses week 2 and catches up in week 3; players 2 and 4 have not played week 5 yet. */
    const plan1 = [[31, 24, 17, 8, 4], [30, 23, 11, 7], [30, 22, 15, 9, 3], [32, 25, 18, 10], [29, 16, 14, 7, 1]];
    p1.forEach(function (id, i) { rounds(lg1.id, id, plan1[i], 8100 + i, 'sp_fl1_'); });

    /* 2. Pairs Challenge: teams of two, Net stroke play, 6 weeks from 26 days ago (week 4 now) */
    if (fs.length >= 3) {
      const mates = fs.length >= 4 ? [fs[2], fs[0], fs[3]] : fs.slice(0, 3);
      const teams = [{ id: 'tm_demo_eagles', name: 'Team Eagles' }, { id: 'tm_demo_birdies', name: 'Team Birdies' }];
      const p2 = [[ME, teams[0].id], [mates[0], teams[0].id], [mates[1], teams[1].id], [mates[2], teams[1].id]];
      const lg2 = S.insert('friendLeagues', { id: 'flg_demo_pairs', name: 'Pairs Challenge', createdBy: ME, createdAt: stamp(34), start: Club.date.addDays(td, -26), weeks: 6, perWeek: 1, holes: 18,
        format: 'net', mode: 'teams', teamSize: 2, teams: teams, members: p2.map(function (x) { return mem(x[0], 26, x[1]); }), cancelled: false, cancelledAt: null, demo: true });
      /* Weeks: 26-20, 19-13, 12-6, 5-0. The second player misses week 2 and catches up in week 3. */
      const plan2 = [[21, 14, 11], [26, 12, 7, 1], [20, 16, 6], [24, 13, 8, 2]];
      p2.forEach(function (x, i) { rounds(lg2.id, x[0], plan2[i], 8200 + i, 'sp_fl2_'); });
    }

    /* 3. An invite to the demo member: a friend's league that starts in a week */
    const host = fs[0], other = fs[1];
    S.insert('friendLeagues', { id: 'flg_demo_invite', name: 'Weekly Shootout', createdBy: host, createdAt: stamp(1), start: Club.date.addDays(td, 7), weeks: 4, perWeek: 1, holes: 18,
      format: 'weekly', mode: 'individual', teamSize: null, teams: [],
      members: [{ memberId: host, status: 'accepted', teamId: null, invitedAt: stamp(1), respondedAt: stamp(1) },
        { memberId: other, status: 'accepted', teamId: null, invitedAt: stamp(1), respondedAt: stamp(0) },
        { memberId: ME, status: 'invited', teamId: null, invitedAt: stamp(1), respondedAt: null }],
      cancelled: false, cancelledAt: null, demo: true });
    done();
  })();
})();
