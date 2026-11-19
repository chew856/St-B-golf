/* Node test of the live scorecard's game engine (Club.play.engine in js/shared/play-data.js).
   Run from the project folder: node tests/play-engine.test.js
   Loads js/core/whs.js (strokes received by stroke index) and the engine part of play-data.js with no browser. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = { console: console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
['js/core/whs.js', 'js/shared/play-data.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f }); });
const E = ctx.Club.play.engine;

/* Four holes: par 4 (SI 1), par 3 (SI 4), par 5 (SI 2), par 4 (SI 3) */
const H = [{ number: 1, par: 4, handicap: 1 }, { number: 2, par: 3, handicap: 4 }, { number: 3, par: 5, handicap: 2 }, { number: 4, par: 4, handicap: 3 }];
const P = [{ pid: 'a', name: 'Ann', ch: 0, team: 'A' }, { pid: 'b', name: 'Bob', ch: 2, team: 'A' }, { pid: 'c', name: 'Cy', ch: 4, team: 'B' }, { pid: 'd', name: 'Di', ch: 0, team: 'B' }];
function grid(rows) { const g = {}; Object.keys(rows).forEach(function (pid) { g[pid] = {}; rows[pid].forEach(function (v, i) { if (v != null) g[pid][H[i].number] = v; }); }); return g; }
function byPid(res) { const o = {}; res.rows.forEach(function (r) { o[r.pid] = r; }); return o; }
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok ' + n + ' ' + name); }

test('strokes received follow the stroke index', function () {
  assert.deepStrictEqual(Object.assign({}, E.received(H, 2)), { 1: 1, 2: 0, 3: 1, 4: 0 });
  assert.deepStrictEqual(Object.assign({}, E.received(H, 5)), { 1: 2, 2: 1, 3: 1, 4: 1 });
  assert.deepStrictEqual(Object.assign({}, E.received(H, -1)), { 1: 0, 2: -1, 3: 0, 4: 0 });   /* plus handicap gives back on the easiest */
});

const G = grid({ a: [4, 3, 5, 4], b: [5, 4, 6, 4], c: [6, 3, 6, 5], d: [3, 4, 5, 5] });
/* gross: a 16 (E), b 19 (+3), c 20 (+4), d 17 (+1). net: b 19-2=17 (+1), c 20-4=16 (E) */

test('stroke play gross', function () {
  const r = E.standings('stroke', 'gross', H, P, G), x = byPid(r);
  assert.strictEqual(r.rows[0].pid, 'a');
  assert.deepStrictEqual([x.a.value, x.b.value, x.c.value, x.d.value], [0, 3, 4, 1]);
  assert.deepStrictEqual([x.a.rank, x.d.rank, x.b.rank, x.c.rank], [1, 2, 3, 4]);
  assert.strictEqual(E.valueText('stroke', -1), '−1');
  assert.strictEqual(E.valueText('stroke', 0), 'E');
});
test('stroke play net with ties sharing a rank', function () {
  const r = E.standings('stroke', 'net', H, P, G), x = byPid(r);
  assert.deepStrictEqual([x.a.value, x.b.value, x.c.value, x.d.value], [0, 1, 0, 1]);
  assert.deepStrictEqual([x.a.rank, x.c.rank, x.b.rank, x.d.rank], [1, 1, 3, 3]);
  assert.strictEqual(x.c.net, 16); assert.strictEqual(x.c.gross, 20);
});
test('stableford points (2 for par, 3 birdie, 1 bogey, 0 worse)', function () {
  const g = E.standings('stableford', 'gross', H, P, G), x = byPid(g);
  assert.deepStrictEqual([x.a.value, x.b.value, x.c.value, x.d.value], [8, 5, 4, 7]);   /* d: 3 + 1 + 2 + 1 */
  const nt = byPid(E.standings('stableford', 'net', H, P, G));
  assert.deepStrictEqual([nt.b.value, nt.c.value], [7, 8]);   /* b net 4,4,5,4 -> 2+1+2+2; c net 5,2,5,4 -> 1+3+2+2 */
});
test('par game: win, halve or lose each hole', function () {
  const x = byPid(E.standings('par', 'gross', H, P, G));
  assert.deepStrictEqual([x.a.value, x.b.value, x.c.value, x.d.value], [0, -3, -3, -1]);   /* d: +1 -1 0 -1 */
  assert.strictEqual(E.valueText('par', 2), '2 up');
  assert.strictEqual(E.valueText('par', 0), 'All square');
  assert.strictEqual(E.valueText('par', -1), '1 down');
});
test('skins with carry-over: ties carry to the next hole', function () {
  /* hole 1: d alone low (3) -> 1 skin; hole 2: a and c tie on 3 -> carry; hole 3: a and d tie on 5 -> carry; hole 4: a and b tie on 4 -> carry 3 left */
  const r = E.standings('skins', 'gross', H, P, G), x = byPid(r);
  assert.deepStrictEqual([x.a.value, x.b.value, x.c.value, x.d.value], [0, 0, 0, 1]);
  assert.strictEqual(r.carry, 3);
  const g2 = grid({ a: [4, 3, 5, 3], b: [5, 4, 6, 4], c: [6, 3, 6, 5], d: [3, 4, 5, 5] });
  const r2 = byPid(E.standings('skins', 'gross', H, P, g2));
  assert.strictEqual(r2.a.value, 3);   /* hole 4 wins the 3 carried skins */
});
test('skins without carry-over: a tied hole is nobody\'s', function () {
  const g2 = grid({ a: [4, 3, 5, 3], b: [5, 4, 6, 4], c: [6, 3, 6, 5], d: [3, 4, 5, 5] });
  const r = E.standings('skins-nc', 'gross', H, P, g2), x = byPid(r);
  assert.deepStrictEqual([x.a.value, x.d.value], [1, 1]);
  assert.strictEqual(r.carry, 0);
});
test('net skins use strokes received', function () {
  /* hole 1 (SI 1): c gets 1 (ch 4 -> 1,1,1,1), b gets 1: net a 4, b 4, c 5, d 3 -> d; hole 2: c net 2 alone */
  const x = byPid(E.standings('skins', 'net', H, P, G));
  assert.ok(x.c.value >= 1);
});
test('best ball: teams of 2, best score on each hole', function () {
  const r = E.standings('bestball', 'gross', H, P, G);
  const t = {}; r.rows.forEach(function (row) { t[row.team] = row; });
  /* A (a,b): 4,3,5,4 = 16 -> E. B (c,d): 3,3,5,5 = 16 -> E */
  assert.strictEqual(t.A.value, 0); assert.strictEqual(t.B.value, 0);
  assert.strictEqual(t.A.rank, 1); assert.strictEqual(t.B.rank, 1);
  const rn = E.standings('bestball', 'net', H, P, G), tn = {}; rn.rows.forEach(function (row) { tn[row.team] = row; });
  /* B net: c gets 1 a hole: 5,2,5,4 vs d 3,4,5,5 -> 3,2,5,4 = 14 -> -2 */
  assert.strictEqual(tn.B.value, -2); assert.strictEqual(tn.B.rank, 1);
});
test('strokes spread over the whole round while only part of it is played', function () {
  /* After hole 1 only, Cy (ch 4 over 4 holes) still gets 1 stroke there, not all 4 */
  const g = grid({ c: [5, null, null, null] });
  const x = byPid(E.standings('stableford', 'net', [H[0]], P, g, H));
  assert.strictEqual(x.c.value, 2);   /* 5 - 1 = net 4 = par */
  assert.strictEqual(x.c.net, 4);
});
test('a missing score counts as par', function () {
  const g = grid({ a: [5, null, null, null] });
  const x = byPid(E.standings('stroke', 'gross', H, P, g));
  assert.strictEqual(x.a.value, 1); assert.strictEqual(x.b.value, 0);
});
console.log('All ' + n + ' engine tests passed');
