/* Reports data: the monthly history seed (monthlyMetrics).
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/reports.js, which reads these helpers from Club.shared.reports. */
(function () {
  'use strict';
  const S = Club.store, U = Club.ui, F = Club.fmt, D = Club.date, esc = U.esc, R = S.R;

  /* ---------------- Helpers ---------------- */
  function all(c) { try { const a = S.all(c); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (e) { return []; } }
  function num(v) { return +v || 0; }
  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + num(fn(x)); }, 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function r0(v) { return Math.round(v); }
  const DEAD = { cancelled: 1, 'no-show': 1 };

  function curKey() { return D.today().slice(0, 7); }
  /** Month key offset from a key: shiftKey('2026-10', -1) -> '2026-09' */
  function shiftKey(k, n) { const y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; const d = new Date(y, m, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function daysIn(k) { return new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate(); }

  /* ---------------- Seed: 12 months of history ---------------- */
  // A Winnipeg golf season, index 0 = January. The course is closed November to March, rounds peak June to August.
  // Dining and the Banquet Hall carry on all year, with holiday parties in December and weddings through the summer.
  const ROUND_F = [0, 0, 0, 0.18, 0.86, 1.14, 1.22, 1.16, 0.9, 0.42, 0.02, 0];
  const GUEST_SHARE = [0, 0, 0, 0.14, 0.2, 0.24, 0.26, 0.25, 0.22, 0.18, 0.1, 0];
  const COVER_F = [0.55, 0.6, 0.62, 0.72, 0.95, 1.12, 1.18, 1.12, 0.96, 0.82, 0.74, 1.1];
  const CHECK_F = [0.96, 1.0, 0.96, 0.98, 1.0, 1.02, 1.04, 1.03, 1.0, 0.98, 1.0, 1.12];
  const SHOP = [1200, 1100, 2400, 9500, 26000, 31500, 29000, 24000, 14500, 6500, 2200, 4800];
  const EVENTS = [8500, 10500, 11500, 14000, 26000, 41000, 46000, 43000, 38000, 21000, 17000, 47000];
  const LESSONS = [900, 900, 1400, 3800, 8600, 9200, 8400, 6800, 3600, 1300, 700, 600];

  S.seed('monthlyMetrics', function () {
    R.reseed(2020);
    const today = D.today(), cur = curKey(), curM = +cur.slice(5, 7) - 1;
    // Calibrate rounds and covers against whatever the tee sheet and dining modules hold.
    const tees = all('teeTimes').filter(function (t) { return t.date && t.date <= today && !DEAD[t.status]; });
    const tDates = {}; tees.forEach(function (t) { tDates[t.date] = 1; });
    const nT = Object.keys(tDates).length;
    let peakDaily = 92;
    if (nT >= 3) peakDaily = Math.max(30, Math.min(240, sum(tees, function (t) { return (t.players || []).length; }) / nT / Math.max(0.2, ROUND_F[curM])));
    const res = all('diningReservations').filter(function (r) { return r.date && r.date <= today && !DEAD[r.status]; });
    const rDates = {}; res.forEach(function (r) { rDates[r.date] = 1; });
    const nR = Object.keys(rDates).length;
    let coversDaily = 46;
    if (nR >= 3) coversDaily = Math.max(20, Math.min(160, sum(res, function (r) { return r.partySize; }) / nR / Math.max(0.2, COVER_F[curM])));
    // Dues follow the live roster.
    const live = all('members').filter(function (m) { return m.status !== 'resigned'; });
    const M = live.length || 64;
    let dues = sum(live, function (m) { const t = S.find('membershipTiers', m.tierId); return t ? t.annualDues / 12 : 0; });
    if (!dues) dues = 70500;

    const out = [];
    for (let i = 12; i >= 1; i--) {
      const k = shiftKey(cur, -i), mi = +k.slice(5, 7) - 1, days = daysIn(k);
      const noise = function () { return 0.94 + R.rand() * 0.12; };
      const members = Math.max(1, M - Math.floor(i / 3) + (i === 7 ? 1 : 0));
      const rounds = r0(peakDaily * ROUND_F[mi] * days * noise());
      const guestRounds = r0(rounds * GUEST_SHARE[mi] * (0.92 + R.rand() * 0.16));
      const covers = r0(coversDaily * COVER_F[mi] * days * noise());
      const check = 34 * CHECK_F[mi] * (0.97 + R.rand() * 0.06);
      out.push({
        id: 'mm_' + k, month: k, rounds: rounds, guestRounds: guestRounds, members: members, covers: covers,
        revenue: {
          dues: r0(dues * members / M * (0.995 + R.rand() * 0.01)),
          golf: r0(guestRounds * 70 + rounds * 9 * (0.9 + R.rand() * 0.2)),
          proShop: r0(SHOP[mi] * noise()),
          dining: r0(covers * check),
          events: r0(EVENTS[mi] * noise()),
          lessons: r0(LESSONS[mi] * noise())
        }
      });
    }
    return out;
  });

  /* For the staff page (js/modules/reports.js) */
  Club.shared = Club.shared || {};
  Club.shared.reports = { all, num, sum, pad, r0, DEAD, curKey, shiftKey, daysIn };
})();
