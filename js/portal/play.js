/* Play: the live scorecard screens, shared by the members' portal (this file registers #/play there) and the public
   site (js/public/play.js registers #/play there and loads this file too, like js/portal/cart.js).

   Club.playView(view, { teeTimeId, who, surface: 'portal' | 'public', doneHref, sheet(o) }) draws one tee time's
   scorecard and keeps it live: the setup (choose a game), each hole, and the finish. Every read and write of round
   state goes through Club.play.sync (js/shared/play-data.js); the game scoring is Club.play.engine.
   Portal hooks: Portal.play.homeCard(m) on Home, Portal.play.detailAction(tt, m) in My tee times.
   Styles: css/portal/play.css (lv-). French: the "Play (live scorecard)" block and the "Redesign: golf pages" block
   of js/i18n/fr-portal.js.
   Redesign (Nov 22): hairlines and words, no cards. The setup is a hairline list of games with the chosen one marked;
   the hole screen sets the hole number very large in the serif with par, stroke index and yards as a quiet line, each
   player as a hairline row with the score between a minus and a plus, and the standings as a plain list; the finish
   is a results list with serif totals and words for the actions. */
(function () {
  'use strict';
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, P = Club.play;
  if (!P || !P.sync) return;
  const E = P.engine;
  if (Club.iconPaths) {
    if (!Club.iconPaths.minus) Club.iconPaths.minus = '<path d="M5 12h14"/>';
    if (!Club.iconPaths.scorecard) Club.iconPaths.scorecard = '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>';
    if (!Club.iconPaths.share) Club.iconPaths.share = '<path d="M12 14.5V4M8 7.5L12 3.5l4 4"/><path d="M7 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 17.5 11H17"/>';
  }
  const TEE_LABEL = { black: 'Black', green: 'Green', silver: 'Silver' };
  const MIN = 1, MAX = 15;
  const drafts = {};    /* teeTimeId -> setup choices, kept across redraws (a background redraw re-mounts the page) */
  const holeAt = {};    /* roundId -> hole index this device is looking at (also in sessionStorage, for a reload) */
  let refocus = null;   /* data-fk of the control that had focus before a redraw */

  function toMin(t) { const p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function holeKey(rid) { return 'stboniface.play.hole.' + rid; }
  function getHole(rid) { if (holeAt[rid] != null) return holeAt[rid]; try { const v = sessionStorage.getItem(holeKey(rid)); return v == null ? null : +v; } catch (e) { return null; } }
  function setHole(rid, i) { holeAt[rid] = i; try { sessionStorage.setItem(holeKey(rid), String(i)); } catch (e) { /* private mode */ } }
  function ordinalTee(n) { return +n === 10 ? '10th tee' : '1st tee'; }
  function holesText(n) { return n + ' holes'; }
  function gameText(game, scoring) { const g = E.gameOf(game); return (game === 'skins' ? 'Skins with carry-over' : game === 'skins-nc' ? 'Skins, no carry-over' : g.label) + ', ' + (scoring === 'gross' ? 'gross' : 'net'); }
  /* First names on the hole screen; first name and initial when two players share one */
  function labels(players) {
    const first = function (p) { return String(p.name || '').split(' ')[0] || p.name; };
    const out = {};
    players.forEach(function (p) {
      const f = first(p), dup = players.some(function (q) { return q !== p && first(q) === f; });
      const last = String(p.name || '').split(' ').slice(1).join(' ');
      out[p.pid] = dup && last ? f + ' ' + last.charAt(0) + '.' : f;
    });
    return out;
  }
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (!(s < 60)) { if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago'; const d = new Date(iso); return fmt.time(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); }
    return 'just now';
  }
  function an(n) { return (n === 8 || n === 11 || n === 18) ? 'an ' + n : 'a ' + n; }
  function strokeNote(s) { return s > 1 ? 'Gets ' + s + ' strokes here' : s === 1 ? 'Gets a stroke here' : s < 0 ? 'Gives a stroke back here' : ''; }
  function playersLine(tt, who) {
    return (tt.players || []).map(function (p) {
      const mine = who.kind === 'member' ? p.memberId === who.id : (p.publicPlayerId === who.id && !p.publicGuest);
      if (mine) return 'You';
      const nm = p.memberId && Club.members.get(p.memberId) ? Club.members.name(p.memberId) : (p.name || 'Guest');
      return nm + (!p.memberId && !(p.publicPlayerId && !p.publicGuest) ? ' (guest)' : '');
    }).join(', ');
  }

  /* ---------------- The Play card for a tee time (portal Home, the Play page list, public My bookings) ---------------- */
  /* "10:30 AM" as the time and a small AM or PM (French "10 h 30" has none) */
  function timeHTML(t) { const v = fmt.time(t), x = /^(\d{1,2}:\d{2}) ?([AP]M)$/i.exec(v); return x ? esc(x[1]) + '<small>' + esc(x[2].toUpperCase()) + '</small>' : esc(v); }
  /* solo: the only tee time on the page (the "not open yet" screen), set on the one dark panel. In a list of several
     tee times each is a plain block between hairlines. */
  function cardHTML(tt, who, href, solo) {
    const w = P.windowFor(tt), r = P.sync.round(tt.id);
    let act;
    if (r && r.status === 'playing') {
      const h = P.liveHole(tt);
      act = '<a class="btn btn-primary lv-cta" href="' + esc(href) + '">Back to scorecard</a>' +
        '<p class="lv-card-note">' + esc('On hole ' + h + ' · ' + gameText(r.game, r.scoring)) + '</p>';
    } else if (r && r.status === 'finished') {
      act = '<a class="btn btn-primary lv-cta" href="' + esc(href) + '">See the scorecard</a><p class="lv-card-note">Round complete</p>';
    } else if (w.open) {
      act = '<a class="btn btn-primary lv-cta" href="' + esc(href) + '">Start scorecard</a>';
    } else {
      act = '<button type="button" class="lv-cta lv-cta-off" disabled aria-disabled="true" data-opens="' + esc(w.opensAt) + '">' + esc('Scorecard opens ' + fmt.time(w.opensAt)) + '</button>';
    }
    return '<section class="lv-tcard' + (solo ? ' is-solo' : '') + (w.open || r ? ' is-open' : '') + '" aria-label="' + esc('Today, ' + fmt.time(tt.time) + ' tee time') + '">' +
      '<p class="lv-eb">' + esc('Today · ' + ordinalTee(tt.startTee)) + '</p>' +
      '<p class="lv-tcard-time">' + timeHTML(tt.time) + '</p>' +
      '<p class="lv-tcard-who"><span>' + esc(holesText(+tt.holes === 9 ? 9 : 18)) + '</span> · <span>' + esc(playersLine(tt, who)) + '</span></p>' +
      '<div class="lv-tcard-acts">' + act + '</div></section>';
  }
  Club.playCard = cardHTML;

  /* ---------------- The scorecard view ---------------- */
  Club.playView = function (view, o) {
    const who = o.who, ttId = o.teeTimeId;
    let mode = null, editing = false, pending = false, alive = true;
    view.classList.add('lv-host');

    function tee() { return S.find('teeTimes', ttId); }
    function draftFor(tt, round) {
      if (!drafts[ttId]) {
        const d = { game: 'stroke', scoring: 'net', tees: 'green', index: {}, team: {} };
        if (Portal_prefs()) d.tees = Portal_prefs().get('gc.tees', 'green');
        if (round) { d.game = round.game; d.scoring = round.scoring; d.tees = round.tees; round.players.forEach(function (p) { d.index[p.pid] = p.index; d.team[p.pid] = p.team; }); }
        else P.playersOf(tt).forEach(function (p, i) { d.team[p.pid] = i < 2 ? 'A' : 'B'; });   /* best ball: the first two against the other two */
        drafts[ttId] = d;
      }
      return drafts[ttId];
    }
    function Portal_prefs() { return o.surface === 'portal' && window.Portal && Portal.prefs ? Portal.prefs : null; }

    function draw() {
      if (!alive) return;
      const fk = document.activeElement && view.contains(document.activeElement) ? document.activeElement.getAttribute('data-fk') : null;
      const tt = tee();
      if (!tt) { mode = 'none'; view.innerHTML = '<div class="lv-root">' + ui.empty({ icon: 'flag', title: 'We could not find that tee time', text: 'It may have been cancelled or moved.', action: '<a class="btn" href="' + esc(o.doneHref) + '">Done</a>' }) + '</div>'; return; }
      if (!P.inGroup(tt, who)) { mode = 'none'; view.innerHTML = '<div class="lv-root">' + ui.empty({ icon: 'flag', title: 'This scorecard is for the players in this group', text: 'Anyone in the group with an account can keep score.', action: '<a class="btn" href="' + esc(o.doneHref) + '">Done</a>' }) + '</div>'; return; }
      const round = P.sync.round(tt.id), w = P.windowFor(tt);
      if (round && round.status === 'finished') { mode = 'finish'; editing = false; view.innerHTML = finishHTML(tt, round); }
      else if (round && !editing) { mode = 'hole'; view.innerHTML = holeHTML(tt, round); }
      else if (!round && !w.open) { mode = 'closed'; view.innerHTML = closedHTML(tt, w); }
      else { mode = 'setup'; view.innerHTML = setupHTML(tt, round); }
      if (Club.i18n) Club.i18n.translate(view);
      const want = fk || refocus; refocus = null;
      if (want) { const el = view.querySelector('[data-fk="' + want + '"]'); if (el) el.focus({ preventScroll: true }); }
    }
    /* A redraw between a finger going down and coming up would swallow the tap (another phone's change arriving
       mid-press): wait until the press ends. */
    let pressing = false, deferred = false;
    view.addEventListener('pointerdown', function () { pressing = true; });
    const release = function () { if (!pressing) return; pressing = false; if (deferred) { deferred = false; setTimeout(schedule, 0); } };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    function schedule() {
      if (pressing) { deferred = true; return; }
      if (pending || !alive) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if (!alive || !document.body.contains(view)) return;
        /* Setting up: only a round started by someone else in the group changes this screen (keeps typing intact) */
        if (mode === 'setup' && !editing && !P.sync.round(ttId)) return;
        if (mode === 'setup' && editing) return;
        draw();
      });
    }

    /* ---- Not open yet ---- */
    function closedHTML(tt, w) {
      return '<div class="lv-root">' + band('Live scorecard', 'Play') +
        (w.past ? '<p class="lv-quiet">Play was open on the day of this tee time only.</p>'
          : cardHTML(tt, who, '#', true) + '<p class="lv-help lv-help-top">Opens 5 minutes before your tee time. Your group keeps score together, each on their own phone.</p>') +
        '</div>';
    }
    function band(k, h) { return '<header class="lv-band"><p class="lv-band-k">' + esc(k) + '</p><h1 class="lv-band-h">' + esc(h) + '</h1></header>'; }

    /* ---- Setup: choose a game ---- */
    function setupHTML(tt, round) {
      const d = draftFor(tt, round);
      const players = round ? round.players : P.playersOf(tt);
      const four = players.length === 4;
      if (d.game === 'bestball' && !four) d.game = 'stroke';
      const opt = function (g, extra) {
        const on = d.game === g.id, off = g.id === 'bestball' && !four;
        return '<button type="button" class="lv-opt' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-game="' + g.id + '" data-fk="game-' + g.id + '"' + (off ? ' disabled aria-disabled="true"' : '') + '>' +
          '<span class="lv-opt-main"><span class="lv-opt-l">' + esc(g.label) + '</span><span class="lv-opt-s">' + esc(off ? 'Needs 4 players' : g.sub) + '</span></span>' +
          (on ? '<span class="lv-opt-k" aria-hidden="true">Selected</span>' : '') + '</button>' + (extra || '');
      };
      const G = E.GAMES;
      const seg = function (name, items, val, label) {
        return '<div class="lv-seg" role="radiogroup" aria-label="' + esc(label) + '">' + items.map(function (x) {
          return '<button type="button" role="radio" aria-checked="' + (val === x[0]) + '" class="' + (val === x[0] ? 'is-on' : '') + '" data-' + name + '="' + x[0] + '" data-fk="' + name + '-' + x[0] + '">' + esc(x[1]) + '</button>';
        }).join('') + '</div>';
      };
      const k = tt.date === Club.date.today() ? 'Today · ' : '';
      return '<div class="lv-root lv-setup">' + band(k + fmt.time(tt.time) + ' · ' + holesText(+tt.holes === 9 ? 9 : 18) + (+tt.startTee === 10 ? ' · 10th tee' : ''), editing ? 'Change the game' : 'Choose a game') +
        '<div class="lv-setup-grid"><div class="lv-setup-col">' +
        '<div class="lv-games" role="radiogroup" aria-label="Game">' + G.map(function (g) { return opt(g); }).join('') + '</div>' +
        '<div class="lv-q"><span class="lv-q-l">Scoring</span>' + seg('scoring', [['gross', 'Gross'], ['net', 'Net']], d.scoring, 'Scoring') + '</div>' +
        '<div class="lv-q"><span class="lv-q-l" id="lv-tees-l">Tees</span>' + seg('tees', [['black', 'Black'], ['green', 'Green'], ['silver', 'Silver']], d.tees, 'Tees') + '</div>' +
        '</div><div class="lv-setup-col">' +
        '<h2 class="lv-eb lv-sec-h">Players and strokes</h2>' +
        '<ul class="lv-plist">' + players.map(function (p) { return playerSetupRow(tt, p, d); }).join('') + '</ul>' +
        '<p class="lv-note" data-scratch>' + esc(scratchNote(tt, players, d)) + '</p>' +
        (d.game === 'bestball' ? '<p class="lv-help">Tap a team to switch a player between Team A and Team B.</p>' : '') +
        (editing ? '<div class="lv-acts2"><button type="button" class="btn btn-primary" data-act="save-game" data-fk="save-game">Save game</button><button type="button" class="lv-link" data-act="cancel-edit" data-fk="cancel-edit">Back to the scorecard</button></div>'
          : '<button type="button" class="btn btn-primary lv-go" data-act="start" data-fk="start">Start on hole ' + P.orderFor(tt)[0] + '</button>') +
        '</div></div></div>';
    }
    function idxOf(p, d) { const v = Object.prototype.hasOwnProperty.call(d.index, p.pid) ? d.index[p.pid] : p.index; return v == null || v === '' || isNaN(+v) || +v < -10 || +v > 54 ? null : +v; }
    function getsText(tt, p, d) {
      const idx = idxOf(p, d);
      if (d.scoring === 'gross') return idx == null ? 'No handicap' : 'Index ' + fmt.handicap(idx);
      const ch = P.chFor(idx, d.tees, tt);
      return ch < 0 ? 'Gives ' + Math.abs(ch) : 'Gets ' + ch;
    }
    function playerSetupRow(tt, p, d) {
      const pill = p.kind === 'public' ? '<span class="lv-pill">Public</span>' : p.kind === 'guest' ? '<span class="lv-pill">Guest</span>' : '';
      const team = d.team[p.pid] || p.team || 'A';
      const editable = p.kind !== 'member';
      const raw = Object.prototype.hasOwnProperty.call(d.index, p.pid) ? d.index[p.pid] : p.index;
      return '<li class="lv-prow">' +
        '<span class="lv-prow-main"><span class="lv-prow-n">' + esc(p.name) + ' ' + pill + '</span>' +
          '<span class="lv-prow-s" data-gets="' + esc(p.pid) + '">' + esc(getsText(tt, p, d)) + '</span></span>' +
        (editable ? '<label class="lv-hcp"><span class="lv-hcp-l">Index</span><input class="input lv-hcp-in" type="text" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="None" data-hcp="' + esc(p.pid) + '" data-fk="hcp-' + esc(p.pid) + '" value="' + esc(raw == null ? '' : raw) + '" aria-label="' + esc('Handicap index for ' + p.name + ', optional') + '"></label>' : '') +
        (d.game === 'bestball' ? '<button type="button" class="lv-team" data-team="' + esc(p.pid) + '" data-fk="team-' + esc(p.pid) + '" aria-label="' + esc(p.name + ': Team ' + team + '. Switch team') + '">Team ' + team + '</button>' : '') +
      '</li>';
    }
    function scratchNote(tt, players, d) {
      if (d.scoring !== 'net') return '';
      const none = players.filter(function (p) { return idxOf(p, d) == null; }).map(function (p) { return p.name.split(' ')[0]; });
      if (!none.length) return 'Strokes come from each player’s handicap and the stroke index of each hole.';
      return (none.length === 1 ? none[0] + ' has no handicap, so plays off scratch.' : none.slice(0, -1).join(', ') + ' and ' + none[none.length - 1] + ' have no handicap, so play off scratch.') + ' Add an index above.';
    }
    function teamsOk(players, d) {
      if (d.game !== 'bestball') return true;
      const a = players.filter(function (p) { return (d.team[p.pid] || p.team) === 'A'; }).length;
      return a === 2;
    }

    /* ---- Each hole ---- */
    function holeIndex(round) {
      let i = getHole(round.id);
      if (i == null || isNaN(i) || i < 0 || i >= round.order.length) {
        const sc = P.sync.scores(round.id);
        i = round.order.findIndex(function (n) { return round.players.some(function (p) { return !(sc[p.pid] && sc[p.pid][n]); }); });
        if (i < 0) i = round.order.length - 1;
        setHole(round.id, i);
      }
      return i;
    }
    function holeHTML(tt, round) {
      const i = holeIndex(round), n = round.order[i], holes = P.holesOf(round.order), h = holes[i];
      if (!h) return '<div class="lv-root">' + ui.empty({ icon: 'alert', title: 'The course card is missing', text: 'Please refresh the page.' }) + '</div>';
      const g = P.gridOf(round), names = labels(round.players), net = round.scoring === 'net';
      const recv = {}; round.players.forEach(function (p) { recv[p.pid] = net ? E.received(holes, p.ch)[n] || 0 : 0; });
      const yards = ['black', 'green', 'silver'].map(function (t) { return (h.yards || {})[t] ? h.yards[t] + ' ' + TEE_LABEL[t] : ''; }).filter(Boolean).join(' · ');
      const dots = round.order.map(function (x, k) {
        const done = round.players.every(function (p) { return g.raw[p.pid] && g.raw[p.pid][x]; });
        return '<span class="' + (k === i ? 'is-cur' : done ? 'is-done' : '') + '"></span>';
      }).join('');
      /* Who last changed a score on this hole */
      let last = null;
      round.players.forEach(function (p) { const c = g.raw[p.pid] && g.raw[p.pid][n]; if (c && c.at && !c.auto && (!last || c.at > last.at)) last = Object.assign({ pid: p.pid }, c); });
      let syncLine;
      if (last && last.by) {
        const byMe = last.by.pid === who.pid, self = last.by.pid === last.pid;
        const by = byMe ? 'You' : (last.by.name || 'Someone');
        syncLine = by + ' entered ' + an(last.strokes) + (self ? '' : ' for ' + (last.pid === who.pid ? 'you' : names[last.pid])) + ' · ' + ago(last.at);
      }
      const rows = round.players.map(function (p) {
        const c = g.raw[p.pid] && g.raw[p.pid][n], v = c ? c.strokes : h.par, s = recv[p.pid];
        const subs = [];
        if (net && s) subs.push(strokeNote(s));
        if (c && c.by) subs.push('Entered by ' + (c.by.pid === who.pid ? 'you' : c.by.name));
        else if (p.kind === 'guest') subs.push('Guest');
        else if (!net || !s) subs.push(p.kind === 'public' ? 'Public' : 'Member');
        const cls = !c ? ' is-default' : v < h.par ? ' is-under' : '';
        return '<li class="lv-pr">' +
          '<span class="lv-pr-main"><span class="lv-pr-n">' + esc(names[p.pid]) + (net && s > 0 ? '<span class="lv-dot" aria-hidden="true"></span>' : '') + '</span>' +
            '<span class="lv-pr-s">' + esc(subs.join(' · ')) + '</span></span>' +
          '<span class="lv-stp">' +
            '<button type="button" class="lv-stp-b" data-dn="' + esc(p.pid) + '" data-fk="dn-' + esc(p.pid) + '" aria-label="' + esc('One less for ' + names[p.pid]) + '"' + (v <= MIN ? ' disabled' : '') + '>' + Club.icon('minus') + '</button>' +
            '<button type="button" class="lv-stp-v' + cls + '" data-ok="' + esc(p.pid) + '" data-fk="ok-' + esc(p.pid) + '" aria-label="' + esc(names[p.pid] + ', ' + v + (c ? '' : ', par shown, not entered yet. Tap to enter ' + v)) + '">' + v + '</button>' +
            '<button type="button" class="lv-stp-b" data-up="' + esc(p.pid) + '" data-fk="up-' + esc(p.pid) + '" aria-label="' + esc('One more for ' + names[p.pid]) + '"' + (v >= MAX ? ' disabled' : '') + '>' + Club.icon('plus') + '</button>' +
          '</span></li>';
      }).join('');
      const st = P.standingsOf(round, false);
      const lastHole = i === round.order.length - 1;
      const missing = lastHole ? round.order.filter(function (x) { return x !== n && !round.players.some(function (p) { return g.raw[p.pid] && g.raw[p.pid][x]; }); }) : [];
      const prev = i > 0 ? '<button type="button" class="lv-prev" data-go="' + (i - 1) + '" data-fk="prev">' + Club.icon('chevronLeft') + '<span>Hole ' + round.order[i - 1] + '</span></button>' : '<button type="button" class="lv-prev" data-act="card" data-fk="prev"><span>Card</span></button>';
      const next = lastHole ? '<button type="button" class="btn btn-primary lv-next" data-act="finish" data-fk="next"><span>Finish round</span></button>'
        : '<button type="button" class="btn btn-primary lv-next" data-go="' + (i + 1) + '" data-fk="next"><span>Hole ' + round.order[i + 1] + '</span>' + Club.icon('chevronRight') + '</button>';
      return '<div class="lv-root lv-holev">' +
        '<header class="lv-hhead"><h1 class="lv-sr">' + esc('Hole ' + n + ' of ' + round.order.length) + '</h1><p class="lv-eb lv-hk" aria-hidden="true">Hole</p>' +
          '<div class="lv-hn"><span class="lv-num" aria-hidden="true">' + n + '</span>' +
          '<div class="lv-meta"><span>Par ' + h.par + ' · Stroke index ' + h.handicap + '</span><span>' + esc(yards) + '</span></div></div>' +
          '<div class="lv-dots" aria-hidden="true">' + dots + '</div></header>' +
        '<div class="lv-hole-grid"><div class="lv-hole-main">' +
          (syncLine ? '<p class="lv-sync" aria-live="polite"><i aria-hidden="true"></i><span>' + esc(syncLine) + '</span></p>' : '<p class="lv-sync is-quiet"><span>Anyone in your group can enter or change any score</span></p>') +
          '<ul class="lv-prs">' + rows + '</ul>' +
          (missing.length ? '<p class="lv-help">' + esc((missing.length === 1 ? 'Hole ' + missing[0] + ' has' : 'Holes ' + listText(missing) + ' have') + ' no scores entered, so par counts there.') + '</p>' : '') +
          '<div class="lv-navb">' + prev + next + '</div>' +
        '</div><div class="lv-hole-side">' + stripHTML(round, st, names) + '</div></div></div>';
    }
    function listText(a) { return a.length < 2 ? String(a[0]) : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function stripHTML(round, st, names) {
      const nm = function (r) { return r.members ? r.members.map(function (pid) { return names[pid]; }).join(' and ') : names[r.pid]; };
      return '<button type="button" class="lv-strip" data-act="card" data-fk="strip" aria-haspopup="dialog">' +
        '<span class="lv-strip-h"><span class="lv-eb">' + esc(gameText(round.game, round.scoring) + (st.thru ? ' · after ' + st.thru : '')) + '</span><span class="lv-strip-c">Scorecard</span></span>' +
        st.rows.map(function (r, k) {
          return '<span class="lv-strip-r' + (st.thru && r.rank === 1 ? ' is-lead' : '') + '"><span>' + esc(nm(r)) + '</span><span class="lv-strip-v">' + esc(st.thru ? E.valueText(st.game, r.value) : '–') + '</span></span>';
        }).join('') +
        (st.carry && st.thru ? '<span class="lv-strip-n">' + esc(st.carry + (st.carry === 1 ? ' skin carries' : ' skins carry') + ' to the next hole') + '</span>' : '') +
        '</button>';
    }

    /* ---- The full card (sheet) ---- */
    function cardTable(round, names, canGo) {
      const holes = P.holesOf(round.order), g = P.gridOf(round), net = round.scoring === 'net';
      const recv = {}; round.players.forEach(function (p) { recv[p.pid] = E.received(holes, p.ch); });
      const cur = holeIndex(round);
      /* Holes nobody has reached yet stay blank (owner, Nov 19: par showing on later holes looked like real scores).
         A reached hole with no score still shows par in grey, as it counts as par at Finish. */
      let upto = round.status === 'playing' ? Math.max(cur, round.reached != null ? round.order.indexOf(+round.reached) : -1) : holes.length - 1;
      g.scored.forEach(function (n) { upto = Math.max(upto, round.order.indexOf(n)); });
      const val = function (p, h, k) { const c = g.grid[p.pid] && g.grid[p.pid][h.number]; return c != null ? c : k <= upto ? h.par : null; };
      const idx = function (h) { return round.order.indexOf(h.number); };
      const sumOf = function (p, list) { let n = 0, any = false; list.forEach(function (h) { const v = val(p, h, idx(h)); if (v != null) { n += v; any = true; } }); return any ? n : ''; };
      let html = '<table class="lv-card"><thead><tr><th scope="col">Hole</th><th scope="col">Par</th>' + round.players.map(function (p) { return '<th scope="col">' + esc(names[p.pid]) + '</th>'; }).join('') + '</tr></thead><tbody>';
      const sub = function (label, list) {
        const parShown = list.filter(function (h) { return idx(h) <= upto; });
        return '<tr class="lv-card-sub"><th scope="row">' + label + '</th><td>' + (parShown.length ? parShown.reduce(function (a, h) { return a + h.par; }, 0) : '') + '</td>' +
          round.players.map(function (p) { return '<td>' + sumOf(p, list) + '</td>'; }).join('') + '</tr>';
      };
      let run = [];
      holes.forEach(function (h, k) {
        html += '<tr' + (k === cur ? ' class="is-cur"' : '') + '><th scope="row">' + (canGo ? '<button type="button" class="lv-card-go" data-goto="' + k + '" aria-label="' + esc('Go to hole ' + h.number) + '">' + h.number + '</button>' : h.number) + '</th><td>' + h.par + '</td>' +
          round.players.map(function (p) {
            const c = g.grid[p.pid] && g.grid[p.pid][h.number], s = net ? recv[p.pid][h.number] : 0, v = val(p, h, k);
            return '<td class="' + (c == null ? 'is-default' : c < h.par ? 'is-under' : '') + '">' + (v != null ? v : '') + (s > 0 ? '<span class="lv-dot sm" aria-hidden="true"></span>' : '') + '</td>';
          }).join('') + '</tr>';
        run.push(h);
        if (round.order.length === 18 && run.length === 9) { html += sub(h.number <= 9 ? 'Out' : 'In', run); run = []; }
      });
      /* Totals count only the holes shown, so mid-round they read as "so far" */
      const shown = holes.filter(function (h, k) { return k <= upto; });
      const partial = upto < holes.length - 1;
      html += '<tr class="lv-card-tot"><th scope="row">' + (partial ? 'So far' : 'Total') + '</th><td>' + shown.reduce(function (a, h) { return a + h.par; }, 0) + '</td>' + round.players.map(function (p) { return '<td>' + sumOf(p, holes) + '</td>'; }).join('') + '</tr>';
      if (net) html += '<tr class="lv-card-sub"><th scope="row">Net</th><td></td>' + round.players.map(function (p) { const gs = sumOf(p, holes); if (gs === '') return '<td></td>'; const rs = shown.reduce(function (a, h) { return a + (recv[p.pid][h.number] || 0); }, 0); return '<td>' + (gs - rs) + '</td>'; }).join('') + '</tr>';
      return html + '</tbody></table>';
    }
    function openCard() {
      const tt = tee(), round = tt && P.sync.round(tt.id); if (!round) return;
      const names = labels(round.players);
      const playing = round.status === 'playing';
      const sh = o.sheet({ title: 'Scorecard', size: 'full',
        html: '<div class="lv-cardwrap"><p class="lv-help">' + esc(gameText(round.game, round.scoring) + ' · ' + TEE_LABEL[round.tees] + ' tees' + (round.scoring === 'net' ? '. A dot marks a stroke received.' : '')) + '</p>' + cardTable(round, names, playing) + '</div>',
        footer: playing ? '<button type="button" class="btn lv-full" data-act="edit-game">Change the game</button>' : '' });
      ui.on(sh.body, 'click', '[data-goto]', function (e, b) { setHole(round.id, +b.dataset.goto); reach(round, +b.dataset.goto); sh.close(); draw(); top(); });
      if (sh.foot) ui.on(sh.foot, 'click', '[data-act=edit-game]', function () { sh.close(); editing = true; delete drafts[ttId]; draftFor(tt, P.sync.round(tt.id)); draw(); top(); });
      if (Club.i18n) Club.i18n.translate(sh.body);
    }
    function reach(round, i) {
      const n = round.order[i], at = round.reached != null ? round.order.indexOf(+round.reached) : -1;
      if (i > at) P.sync.patch(round.id, { reached: n });
    }
    function top() { const r = view.querySelector('.lv-root'); if (r && r.getBoundingClientRect().top < 0) window.scrollTo({ top: Math.max(0, window.scrollY + r.getBoundingClientRect().top - 80) }); }

    /* ---- Finish ---- */
    function finishHTML(tt, round) {
      const st = P.standingsOf(round, true), holes = P.holesOf(round.order), g = P.gridOf(round);
      const tot = {}; E.totals(holes, round.players, g.grid).forEach(function (t) { tot[t.pid] = t; });
      const net = round.scoring === 'net', game = st.game;
      const extra = game === 'stroke' ? null : game === 'stableford' ? 'Points' : game === 'par' ? 'Result' : game === 'bestball' ? null : 'Skins';
      let table;
      if (game === 'bestball') {
        table = '<table class="lv-res"><thead><tr><th scope="col"><span class="lv-sr">Place</span></th><th scope="col">Team</th><th scope="col" class="n">' + (net ? 'Net' : 'Gross') + '</th></tr></thead><tbody>' +
          st.rows.map(function (r) { return '<tr' + (r.rank === 1 ? ' class="is-win"' : '') + '><td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td class="n">' + esc(E.toPar(r.value)) + '</td></tr>'; }).join('') + '</tbody></table>' +
          playersTable(round.players.slice().sort(function (a, b) { return tot[a.pid].gross - tot[b.pid].gross; }), tot, net);
      } else {
        table = '<table class="lv-res"><thead><tr><th scope="col"><span class="lv-sr">Place</span></th><th scope="col">Player</th><th scope="col" class="n">Gross</th>' + (net ? '<th scope="col" class="n">Net</th>' : '') + (extra ? '<th scope="col" class="n">' + extra + '</th>' : '') + '</tr></thead><tbody>' +
          st.rows.map(function (r) {
            const t = tot[r.pid];
            return '<tr' + (r.rank === 1 ? ' class="is-win"' : '') + '><td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td class="n">' + t.gross + '</td>' + (net ? '<td class="n">' + t.net + '</td>' : '') +
              (extra ? '<td class="n">' + esc(game === 'par' ? E.valueText(game, r.value) : String(r.value)) + '</td>' : '') + '</tr>';
          }).join('') + '</tbody></table>' +
          (st.carry ? '<p class="lv-help">' + esc(st.carry + (st.carry === 1 ? ' skin was' : ' skins were') + ' still carried after the last hole, so nobody won ' + (st.carry === 1 ? 'it' : 'them') + '.') + '</p>' : '');
      }
      const posted = (round.posted || []).map(function (x) {
        let txt, ok = true;
        if (x.kind === 'member') txt = x.already ? x.name + ' · Already posted for this round' : x.notPosted ? x.name + ' · Not posted' : x.name + ' · Member scores' + (x.estimate != null ? ', handicap updated' : '');
        else if (x.kind === 'public') txt = x.name + ' · ' + (x.already ? 'Already in My rounds' : 'Public account, My rounds');
        else { txt = x.name + ' · Guest, no account, not posted'; ok = false; }
        if (x.notPosted && x.kind !== 'guest') ok = false;
        return '<li class="lv-post' + (ok ? '' : ' is-no') + '"><span class="lv-post-ck" aria-hidden="true">' + (ok ? Club.icon('check') : Club.icon('minus')) + '</span><span>' + esc(txt) + '</span></li>';
      }).join('');
      const reopen = P.canReopen(round);
      return '<div class="lv-root lv-fin">' + band(gameText(round.game, round.scoring) + ' · ' + holesText(round.order.length), 'Round complete') +
        '<div class="lv-fin-grid"><div class="lv-res-wrap">' + table +
          '<div class="lv-fin-links"><button type="button" class="lv-link" data-act="card" data-fk="card">See the full card</button>' +
          '<button type="button" class="lv-link" data-act="share" data-fk="share">Share the scorecard</button></div></div>' +
        '<div class="lv-fin-side"><section class="lv-posted"><h2 class="lv-eb">Posted to their accounts</h2><ul class="lv-posts">' + posted + '</ul></section>' +
        '<a class="btn btn-primary lv-full" href="' + esc(o.doneHref) + '" data-fk="done">Done</a>' +
        (reopen ? '<p class="lv-help lv-reopen">Finished by mistake? <button type="button" class="lv-link" data-act="reopen" data-fk="reopen">Reopen the round</button> (possible for ' + P.REOPEN_MINUTES + ' minutes; the posted scores are taken back).</p>' : '') +
        '</div></div></div>';
    }
    function playersTable(list, tot, net) {
      return '<table class="lv-res lv-res-2"><thead><tr><th scope="col">Player</th><th scope="col" class="n">Gross</th>' + (net ? '<th scope="col" class="n">Net</th>' : '') + '</tr></thead><tbody>' +
        list.map(function (p) { const t = tot[p.pid]; return '<tr><td>' + esc(p.name) + '</td><td class="n">' + t.gross + '</td>' + (net ? '<td class="n">' + t.net + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
    }
    function shareText(round) {
      const st = P.standingsOf(round, true), holes = P.holesOf(round.order), g = P.gridOf(round), net = round.scoring === 'net';
      const tot = {}; E.totals(holes, round.players, g.grid).forEach(function (t) { tot[t.pid] = t; });
      const lines = [Club.info.name, fmt.date(round.date) + ', ' + fmt.time(round.time) + ' · ' + holesText(round.order.length) + ' · ' + TEE_LABEL[round.tees] + ' tees', gameText(round.game, round.scoring), ''];
      st.rows.forEach(function (r) {
        if (r.members) { lines.push(r.rank + '. ' + r.name + ' ' + E.toPar(r.value)); return; }
        const t = tot[r.pid];
        lines.push(r.rank + '. ' + r.name + ' ' + t.gross + (net ? ' (net ' + t.net + ')' : '') + (st.game === 'stroke' ? '' : ' · ' + E.valueText(st.game, r.value)));
      });
      lines.push('', 'Hole ' + holes.map(function (h) { return h.number; }).join(' '), 'Par ' + holes.map(function (h) { return h.par; }).join(' '));
      round.players.forEach(function (p) { lines.push(p.name + ': ' + holes.map(function (h) { const c = g.grid[p.pid] && g.grid[p.pid][h.number]; return c != null ? c : h.par; }).join(' ') + ' = ' + tot[p.pid].gross); });
      return lines.join('\n');
    }
    function share(round) {
      const text = shareText(round), title = 'Scorecard, ' + Club.info.short;
      const copy = function () {
        const done = function () { ui.toast('Scorecard copied. Paste it into a message'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        function fallback() {
          const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
          let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          ta.remove(); if (ok) done(); else ui.toast('Could not copy the scorecard on this device', 'bad');
        }
      };
      if (navigator.share) navigator.share({ title: title, text: text }).catch(function (e) { if (!e || e.name !== 'AbortError') copy(); });
      else copy();
    }

    /* ---------------- Events ---------------- */
    ui.on(view, 'click', '[data-game]', function (e, b) { if (b.disabled) return; draftFor(tee()).game = b.dataset.game; refocus = 'game-' + b.dataset.game; draw(); });
    ui.on(view, 'click', '[data-scoring]', function (e, b) { draftFor(tee()).scoring = b.dataset.scoring; refocus = 'scoring-' + b.dataset.scoring; draw(); });
    ui.on(view, 'click', '[data-tees]', function (e, b) { const d = draftFor(tee()); d.tees = b.dataset.tees; if (Portal_prefs()) Portal_prefs().set('gc.tees', d.tees); refocus = 'tees-' + b.dataset.tees; draw(); });
    ui.on(view, 'click', '[data-team]', function (e, b) { const d = draftFor(tee()); const tt = tee(), r = P.sync.round(ttId); const p = (r ? r.players : P.playersOf(tt)).find(function (x) { return x.pid === b.dataset.team; }); const cur = d.team[b.dataset.team] || (p && p.team) || 'A'; d.team[b.dataset.team] = cur === 'A' ? 'B' : 'A'; refocus = 'team-' + b.dataset.team; draw(); });
    view.addEventListener('input', function (e) {
      const t = e.target; if (!t.dataset || !t.dataset.hcp) return;
      const tt = tee(), d = draftFor(tt), v = t.value.trim().replace(',', '.');
      d.index[t.dataset.hcp] = v === '' ? null : v;
      const bad = v !== '' && (isNaN(+v) || +v < -10 || +v > 54);
      t.classList.toggle('invalid', bad);
      const r = P.sync.round(ttId), players = r ? r.players : P.playersOf(tt);
      players.forEach(function (p) { const s = view.querySelector('[data-gets="' + p.pid + '"]'); if (s) s.textContent = Club.i18n ? Club.i18n.t(getsText(tt, p, d)) : getsText(tt, p, d); });
      const note = view.querySelector('[data-scratch]'); if (note) note.textContent = Club.i18n ? Club.i18n.t(scratchNote(tt, players, d)) : scratchNote(tt, players, d);
    });
    ui.on(view, 'click', '[data-act=start]', function () {
      const tt = tee(); if (!tt) return;
      const d = draftFor(tt), players = P.playersOf(tt);
      if (!teamsOk(players, d)) { ui.toast('Best ball needs two players on each team', 'bad'); return; }
      const bad = view.querySelector('.lv-hcp-in.invalid'); if (bad) { ui.toast('A handicap index is a number from -10 to 54', 'bad'); bad.focus(); return; }
      if (P.sync.round(tt.id)) { ui.toast('Someone in your group already started the scorecard'); draw(); return; }
      const setup = P.setupFor(tt, { game: d.game, scoring: d.scoring, tees: d.tees, index: d.index, team: d.team });
      if (who.kind === 'public' && Object.prototype.hasOwnProperty.call(d.index, who.pid)) P.saveOwnIndex(who, idxOf({ pid: who.pid }, d));
      const r = P.sync.start(tt.id, setup, who);
      setHole(r.id, 0); reach(r, 0);
      delete drafts[ttId];
      draw(); top();
    });
    ui.on(view, 'click', '[data-act=save-game]', function () {
      const tt = tee(), r = tt && P.sync.round(tt.id); if (!r) return;
      const d = draftFor(tt, r);
      if (!teamsOk(r.players, d)) { ui.toast('Best ball needs two players on each team', 'bad'); return; }
      const bad = view.querySelector('.lv-hcp-in.invalid'); if (bad) { ui.toast('A handicap index is a number from -10 to 54', 'bad'); bad.focus(); return; }
      const before = { game: r.game, scoring: r.scoring, tees: r.tees, players: r.players };
      const players = r.players.map(function (p) { return Object.assign({}, p, { index: idxOf(p, d), team: d.team[p.pid] || p.team }); });
      P.sync.patch(r.id, { game: E.gameOf(d.game).id, scoring: d.scoring === 'gross' ? 'gross' : 'net', tees: d.tees, players: P.withHandicaps({ players: players, holes: r.holes, startTee: r.startTee }, d.tees) });
      if (who.kind === 'public' && Object.prototype.hasOwnProperty.call(d.index, who.pid)) P.saveOwnIndex(who, idxOf({ pid: who.pid }, d));
      editing = false; delete drafts[ttId]; draw(); top();
      ui.toast('Game changed to ' + gameText(d.game, d.scoring).toLowerCase(), null, { action: { label: 'Undo', onClick: function () { if (P.sync.round(ttId)) { P.sync.patch(r.id, before); ui.toast('Game changed back'); } } } });
    });
    ui.on(view, 'click', '[data-act=cancel-edit]', function () { editing = false; delete drafts[ttId]; draw(); top(); });
    function bump(pid, delta) {
      const tt = tee(), r = tt && P.sync.round(tt.id); if (!r || r.status !== 'playing') return;
      const i = holeIndex(r), n = r.order[i], h = P.holesOf([n])[0]; if (!h) return;
      const sc = P.sync.scores(r.id), c = sc[pid] && sc[pid][n];
      const v = Math.max(MIN, Math.min(MAX, (c ? c.strokes : h.par) + delta));
      if (c && c.strokes === v) return;
      P.sync.setScore(r.id, pid, n, v, who);
      reach(r, i);
    }
    ui.on(view, 'click', '[data-dn]', function (e, b) { refocus = 'dn-' + b.dataset.dn; bump(b.dataset.dn, -1); });
    ui.on(view, 'click', '[data-up]', function (e, b) { refocus = 'up-' + b.dataset.up; bump(b.dataset.up, 1); });
    ui.on(view, 'click', '[data-ok]', function (e, b) { refocus = 'ok-' + b.dataset.ok; bump(b.dataset.ok, 0); });
    /* The screen starts each score at par, so moving on with Next (or finishing) without touching a player's score
       means they made par: save it (owner, Nov 19). Going back, or jumping from the card, saves nothing. */
    function fillPar(r, k) {
      const n = r.order[k], h = n != null && P.holesOf([n])[0]; if (!h) return;
      const sc = P.sync.scores(r.id);
      r.players.forEach(function (p) { if (!(sc[p.pid] && sc[p.pid][n])) P.sync.setScore(r.id, p.pid, n, h.par, who, true); });
    }
    ui.on(view, 'click', '[data-go]', function (e, b) {
      const r = P.sync.round(ttId); if (!r) return;
      const i = Math.max(0, Math.min(r.order.length - 1, +b.dataset.go));
      if (b.classList.contains('lv-next')) fillPar(r, holeIndex(r));
      setHole(r.id, i); reach(r, i); refocus = b.classList.contains('lv-next') ? 'next' : 'prev'; draw(); top();
    });
    ui.on(view, 'click', '[data-act=card]', function () { openCard(); });
    ui.on(view, 'click', '[data-act=finish]', function () {
      const r = P.sync.round(ttId); if (!r || r.status !== 'playing') return;
      fillPar(r, holeIndex(r));
      const done = P.finish(r.id, who);
      if (!done) return;
      draw(); top();
      const n = (done.posted || []).filter(function (x) { return !x.notPosted && !x.already; }).length;
      ui.toast(n ? 'Round finished. Scores posted for ' + n + (n === 1 ? ' player' : ' players') : 'Round finished', null, { action: { label: 'Undo', onClick: function () { if (P.reopen(r.id, who)) { ui.toast('Round reopened. The posted scores were taken back'); draw(); } } } });
    });
    ui.on(view, 'click', '[data-act=reopen]', function () {
      const r = P.sync.round(ttId); if (!r) return;
      if (P.reopen(r.id, who)) { setHole(r.id, r.order.length - 1); ui.toast('Round reopened. The posted scores were taken back'); draw(); top(); }
      else { ui.toast('This round can no longer be reopened', 'bad'); draw(); }
    });
    ui.on(view, 'click', '[data-act=share]', function () { const r = P.sync.round(ttId); if (r) share(r); });

    const unsub = P.sync.subscribe(schedule);
    const unTee = S.subscribe('teeTimes', schedule);
    /* "just now" ages, and Play opens at its time without a reload */
    const tick = setInterval(function () { if (mode === 'hole' || mode === 'closed' || mode === 'finish') schedule(); }, 30000);
    draw();
    return function () {
      alive = false; unsub(); unTee(); clearInterval(tick);
      document.removeEventListener('pointerup', release, true); document.removeEventListener('pointercancel', release, true);
      const a = document.activeElement; if (a && view.contains(a)) refocus = a.getAttribute('data-fk');
    };
  };

  /* ---------------- Members' portal ---------------- */
  if (!window.Portal || !Portal.register) return;
  function portalSheet(o) {
    const sh = Portal.openSheet({ title: o.title, size: o.size, content: o.html, footer: o.footer || '' });
    return { body: sh.body, foot: sh.foot, close: sh.close };
  }
  function ctx(m, id) { return { teeTimeId: id, who: P.viewerMember(m), surface: 'portal', doneHref: '#/home', sheet: portalSheet }; }
  Portal.play = {
    /** Home: the Play card for today's tee time (empty when there is none today). */
    homeCard: function (m) {
      const who = P.viewerMember(m), tt = who && P.focusTeeTime(who);
      return tt ? '<div class="lv-home">' + cardHTML(tt, who, '#/play/' + encodeURIComponent(tt.id)) + '</div>' : '';
    },
    /** My tee times, a tee time's details: Play while it is open today. */
    detailAction: function (tt, m) {
      const who = P.viewerMember(m);
      if (!tt || !who || !P.inGroup(tt, who) || tt.status === 'cancelled' || tt.status === 'no-show') return '';
      const r = P.sync.round(tt.id);
      if (!P.windowFor(tt).open && !r) return tt.date === Club.date.today() ? '<button type="button" class="btn" disabled aria-disabled="true">' + esc('Play opens at ' + fmt.time(P.windowFor(tt).opensAt)) + '</button>' : '';
      if (tt.date !== Club.date.today()) return '';
      return '<a class="btn btn-primary" href="#/play/' + encodeURIComponent(tt.id) + '">' + Club.icon('flag') + '<span>' + (r && r.status === 'finished' ? 'See the scorecard' : 'Play') + '</span></a>';
    }
  };
  Portal.register({
    id: 'play', label: 'Play', short: 'Play', icon: 'scorecard', order: 15, tab: true,
    render: function (view, params, member) {
      const m = Portal.member() || member, who = P.viewerMember(m);
      if (params[0]) return Club.playView(view, ctx(m, params[0]));
      const list = P.teeTimesToday(who);
      if (list.length === 1) return Club.playView(view, ctx(m, list[0].id));
      if (!list.length) {
        view.innerHTML = '<div class="lv-root">' + band0('Live scorecard', 'Play') + '<div class="lv-none"><p class="lv-none-t">No tee time today</p>' +
          '<p class="lv-help">Opens 5 minutes before your tee time. Your group keeps score together, each on their own phone.</p>' +
          '<a class="btn btn-primary" href="#/tee-times">Book a tee time</a></div></div>';
        return;
      }
      view.innerHTML = '<div class="lv-root">' + band0('Live scorecard', 'Play') + '<div class="lv-list">' + list.map(function (tt) { return cardHTML(tt, who, '#/play/' + encodeURIComponent(tt.id)); }).join('') + '</div></div>';
    }
  });
  /* Play opens 5 minutes before the tee time: Home or Play showing "Play opens at ..." redraws once that time comes
     (unless a sheet or dialog is open). */
  setInterval(function () {
    const b = document.querySelector('.p-page .lv-cta-off[data-opens]');
    if (!b || document.body.classList.contains('ps-open') || document.querySelector('.overlay')) return;
    const t = b.getAttribute('data-opens').split(':'), now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= (+t[0]) * 60 + (+t[1])) Portal.render();
  }, 20000);
  function band0(k, h) { return '<header class="lv-band"><p class="lv-band-k">' + esc(k) + '</p><h1 class="lv-band-h">' + esc(h) + '</h1></header>'; }
})();
