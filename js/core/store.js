/* Club.store: a small localStorage-backed document store shared by every module.
   Collections are arrays of objects with a string `id`. See SPEC.md for schemas.

   Persistence: each collection (and each setObj key, stored as '$key') lives under its own localStorage key,
   KEY + ':' + name, so a save writes only what changed instead of the whole database. Writes are batched
   for 60 ms; `pending` doubles as the list of names to write. Data saved by older versions as one blob under KEY
   is split into per-collection keys on first load (see absorbLegacy).

   Nov 2026:
   - Compact form. A list of plain objects is saved as a table (each key name once, repeated strings once; see pack),
     about a third of the plain JSON, so all three sites' demo data fits well inside Safari's smaller storage. Reading
     gives back exactly the same documents. Plain JSON saved by older versions still reads, and is rewritten compactly
     on load.
   - All or nothing. One save writes every collection changed since the last one, or (storage full) none of them:
     what was written is put back, the changes stay in this tab and are tried again on the next save, and the "storage
     is full" warning shows again each time a save fails.
   - Two tabs. When another tab saves a collection this tab has also changed, the two are merged document by document
     and field by field (see merge3): the other tab's version, with the fields this tab changed laid on top. A save
     this tab made a moment ago is kept in `sent` for a few seconds, because the other tab may have written over it
     without seeing it (both saving within the same few milliseconds); if what arrives lacks it, it is laid back on
     top and saved again. A document deleted in one tab stays deleted even if the other tab edited it. */
(function () {
  const KEY = 'stboniface.data.v2';
  const PREFIX = KEY + ':';
  const listeners = {};
  let db = {};
  /* true only if the one-time split could not be written (storage full): this tab then keeps saving the whole
     database under KEY exactly as before, and the split is tried again on the next load. */
  let legacy = false;
  /* The raw string this tab last read or wrote for each name. A flush compares it with what is in storage now, so a
     save another tab made a moment ago (its storage event not yet delivered) is taken in first, not overwritten. */
  const seen = {};
  /* name -> { prev: what storage held before this tab's first save in the run (the base its changes were made on),
     mine: the string it last wrote, changes: what it changed (as in `pending`), at: when the run started } */
  const sent = {};
  const SENT_MS = 3000;

  /* ---------- Compact storage form ---------- */
  const PACK = '~pack';
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype; }
  function allPlain(a) { for (let i = 0; i < a.length; i++) if (!plain(a[i])) return false; return true; }
  /** The keys JSON.stringify would write for x, in its order. */
  function jsonKeys(x) {
    const own = Object.keys(x);
    for (let i = 0; i < own.length; i++) {
      const v = x[own[i]];
      if (v === undefined || typeof v === 'function') return own.filter(function (k) { const w = x[k]; return w !== undefined && typeof w !== 'function'; });
    }
    return own;
  }
  /* A list of plain objects as a table: k = the distinct key lists (shapes); each row = [shape, values in that order].
     A column of strings (or null) that repeat enough is kept as numbers into d[column]; a column of lists of plain
     objects (or null) becomes a table of its own in n[column], whose rows are handed back to each document in turn. */
  function packTable(list) {
    const shapes = [], shapeAt = new Map(), cols = new Map(), keysOf = new Array(list.length), shapeOf = new Array(list.length);
    for (let j = 0; j < list.length; j++) {
      const ks = jsonKeys(list[j]), sig = ks.join('\u0001');
      let si = shapeAt.get(sig);
      if (si === undefined) { si = shapes.length; shapeAt.set(sig, si); shapes.push(ks); ks.forEach(function (k) { cols.set(k, true); }); }
      keysOf[j] = ks; shapeOf[j] = si;
    }
    const t = { k: shapes }, dictAt = new Map(), nested = new Map();
    cols.forEach(function (_, k) {
      let kind = '', count = null;
      for (let j = 0; j < list.length; j++) {
        const v = list[j][k];
        if (v === null || v === undefined) continue;
        if (typeof v === 'string') {
          if (kind === 'n') { kind = 'x'; break; }
          kind = 's'; if (!count) count = new Map();
          count.set(v, (count.get(v) || 0) + 1);
          if (j === 300 && count.size > 280) { kind = 'x'; break; }   /* nearly all different (ids, times): no dictionary */
        } else if (Array.isArray(v) && allPlain(v)) {
          if (kind === 's') { kind = 'x'; break; }
          kind = 'n';
        } else { kind = 'x'; break; }
      }
      if (kind === 's') {
        const words = Array.from(count.keys()).sort(function (a, b) { return count.get(b) - count.get(a); });
        let asText = 0, asDict = 0;
        words.forEach(function (w, i) { const n = count.get(w); asText += n * (w.length + 3); asDict += w.length + 3 + n * (String(i).length + 1); });
        if (asDict < asText * 0.8) { (t.d = t.d || {})[k] = words; const at = new Map(); words.forEach(function (w, i) { at.set(w, i); }); dictAt.set(k, at); }
      } else if (kind === 'n') {
        const all = [];
        list.forEach(function (x) { const v = x[k]; if (Array.isArray(v)) for (let i = 0; i < v.length; i++) all.push(v[i]); });
        const sub = packTable(all);
        nested.set(k, { rows: sub.r, at: 0 }); delete sub.r; (t.n = t.n || {})[k] = sub;
      }
    });
    t.r = new Array(list.length);
    for (let j = 0; j < list.length; j++) {
      const x = list[j], ks = keysOf[j], row = new Array(ks.length + 1); row[0] = shapeOf[j];
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i], v = x[k], dk = dictAt.get(k), nk = nested.get(k);
        if (dk && typeof v === 'string') row[i + 1] = dk.get(v);
        else if (nk && Array.isArray(v)) { row[i + 1] = nk.rows.slice(nk.at, nk.at + v.length); nk.at += v.length; }
        else row[i + 1] = v;
      }
      t.r[j] = row;
    }
    return t;
  }
  function unpackTable(t, rows) {
    const d = t.d || {}, n = t.n || {}, out = new Array(rows.length);
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j], ks = t.k[row[0]], x = {};
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i], v = row[i + 1];
        x[k] = d[k] && typeof v === 'number' ? d[k][v] : (n[k] && Array.isArray(v) ? unpackTable(n[k], v) : v);
      }
      out[j] = x;
    }
    return out;
  }
  /** What is saved for a value: a list of plain objects as a table, anything else as it is. */
  function pack(v) { if (!Array.isArray(v) || !v.length || !allPlain(v)) return v; const t = packTable(v); t[PACK] = 1; return t; }
  function unpack(v) { return v && typeof v === 'object' && !Array.isArray(v) && v[PACK] === 1 && Array.isArray(v.k) && Array.isArray(v.r) ? unpackTable(v, v.r) : v; }

  function storedNames() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } }
    catch (e) { /* storage blocked */ }
    return out.sort();
  }
  function parse(raw) { if (raw == null) return undefined; try { return unpack(JSON.parse(raw)); } catch (e) { return undefined; } }
  function readName(name) { let raw = null; try { raw = localStorage.getItem(PREFIX + name); } catch (e) { /* storage blocked */ } return parse(raw); }
  function serialize(name) { return JSON.stringify(pack(db[name])); }
  function writeName(name) {   /* throws on quota errors */
    if (db[name] === undefined) { localStorage.removeItem(PREFIX + name); seen[name] = null; }
    else { const str = serialize(name); localStorage.setItem(PREFIX + name, str); seen[name] = str; }
  }

  function load() {
    db = {};
    storedNames().forEach(function (name) {
      let raw = null; try { raw = localStorage.getItem(PREFIX + name); } catch (e) { /* storage blocked */ }
      const v = parse(raw); if (v !== undefined) { db[name] = v; seen[name] = raw; }
    });
    absorbLegacy();
    compactOld();
  }
  /* Collections saved as plain JSON (before the compact form) are rewritten compactly once. The new copy is smaller
     than the one it replaces, so this always fits; if it fails anyway, the old copy stays and still reads. */
  function compactOld() {
    if (legacy) return;
    Object.keys(seen).forEach(function (name) {
      const raw = seen[name];
      if (!raw || raw.length < 2048 || raw.charAt(0) !== '[' || db[name] === undefined) return;
      try { const str = serialize(name); if (str.length < raw.length) { localStorage.setItem(PREFIX + name, str); seen[name] = str; } }
      catch (e) { /* stays in the old form */ }
    });
  }

  /* One-time migration from the single-key format, also run when a tab still on the old code saves the whole
     database again (storage event on KEY). On a first migration the old data is taken as it is. If per-collection
     data already exists, the old blob was written after the split by an old tab, so it is laid on top document by
     document (its documents win, nothing else is dropped; sequences never go backwards; $seeded is a union).
     The old key is removed only once every collection has been written; if that fails, everything is put back
     exactly as it was and this tab saves in the old format. */
  function absorbLegacy() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (raw == null) return false;
    const old = parse(raw);
    if (!old || typeof old !== 'object' || Array.isArray(old)) {
      console.warn('Store: data under ' + KEY + ' could not be read; it is left in place untouched.');
      return false;
    }
    const fresh = Object.keys(db).length === 0;
    const names = Object.keys(old);
    names.forEach(function (name) {
      const theirs = old[name], mine = db[name];
      if (fresh || mine === undefined) db[name] = theirs;
      else if (Array.isArray(theirs) && Array.isArray(mine)) {
        const at = {}; mine.forEach(function (d, i) { if (d && d.id != null) at[d.id] = i; });
        const out = mine.slice();
        theirs.forEach(function (d) { if (d && d.id != null && at[d.id] !== undefined) out[at[d.id]] = d; else out.push(d); });
        db[name] = out;
      }
      else if (name === '$seeded') db[name] = Object.assign({}, mine, theirs);
      else if (/Seq$/.test(name) && typeof mine === 'number' && typeof theirs === 'number') db[name] = Math.max(mine, theirs);
      else db[name] = theirs;
    });
    /* Write the split. The old key goes first so the copy fits next to it; it is held in `raw` until done. */
    const prev = {};
    try {
      names.forEach(function (name) { try { prev[name] = localStorage.getItem(PREFIX + name); } catch (e) { prev[name] = null; } });
      localStorage.removeItem(KEY);
      names.forEach(writeName);
      legacy = false;
      return true;
    } catch (e) {
      console.warn('Store: could not split the saved data into per-collection keys; keeping the old format', e);
      names.forEach(function (name) { try { if (prev[name] == null) localStorage.removeItem(PREFIX + name); else localStorage.setItem(PREFIX + name, prev[name]); } catch (err) { /* best effort */ } });
      try { localStorage.setItem(KEY, raw); } catch (err) { console.error('Store: could not restore the old-format data', err); }
      legacy = true;
      names.forEach(function (name) { touch(name); });   /* keep the merged result for the next save */
      return true;
    }
  }

  /* Writes are batched for 60 ms. `pending` records what this tab changed since its last write: it is the set of
     names the next flush writes, and when another tab saves one of them first, this tab's changes are laid back
     on top of the other tab's data (see reconcile) instead of being dropped.
     name -> { all: true } or { ids: {id: true}, gone: {id: true} } */
  let saveTimer = null, pending = {}, resetting = false;
  let notifyTimer = null, changed = {};   /* names another tab changed, told to listeners shortly (notifySoon) */
  function touch(coll, id, removed) {
    const p = pending[coll] = pending[coll] || { ids: {}, gone: {} };
    if (p.all) return;
    if (id == null) { pending[coll] = { all: true }; return; }
    if (removed) { p.gone[id] = true; delete p.ids[id]; } else { p.ids[id] = true; delete p.gone[id]; }
  }
  function unionChanges(a, b) {
    if (!a) return b; if (!b) return a;
    if (a.all || b.all) return { all: true };
    return { ids: Object.assign({}, a.ids, b.ids), gone: Object.assign({}, a.gone, b.gone) };
  }
  function freshSent(name) {
    const q = sent[name];
    if (q && Date.now() - q.at > SENT_MS) { delete sent[name]; return null; }
    return q || null;
  }
  function failed(e) {
    console.warn('Store save failed', e);
    /* Storage full: say so every time a save fails, never fail silently (one warning on screen at a time, not a stack
       of the same one while saves keep failing). */
    const msg = 'Changes could not be saved: this browser’s storage is full. Export your data in Settings, then reset the demo data.';
    const showing = Array.prototype.some.call(document.querySelectorAll('.toast.bad:not(.leaving)'), function (t) { return t.textContent.indexOf(msg) >= 0; });
    if (!showing && window.Club && Club.ui && Club.ui.toast) Club.ui.toast(msg, 'bad');
  }
  /* Every name changed since the last save is written, or none: if one write fails (storage full), the ones already
     written are put back as they were, so storage never holds half of a change (a balance without the charge and
     receipt behind it). The changes stay in this tab, in `pending`, and are tried again on the next save. */
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (resetting) return;
    if (legacy) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); pending = {}; } catch (e) { failed(e); }
      return;
    }
    const names = Object.keys(pending);
    if (!names.length) return;
    /* Another tab may have saved some of these a moment ago (its storage event not delivered yet): take theirs first. */
    names.forEach(function (name) {
      let now = null;
      try { now = localStorage.getItem(PREFIX + name); } catch (e) { return; }
      if (now !== (seen[name] === undefined ? null : seen[name])) { reconcile(name, now); seen[name] = now; notifySoon(); }
    });
    const done = [], t = Date.now();
    try {
      Object.keys(pending).forEach(function (name) {
        const before = seen[name] === undefined ? null : seen[name];
        writeName(name);
        done.push({ name: name, before: before });
      });
    } catch (e) {
      done.reverse().forEach(function (w) {
        try { if (w.before == null) localStorage.removeItem(PREFIX + w.name); else localStorage.setItem(PREFIX + w.name, w.before); seen[w.name] = w.before; }
        catch (err) { console.error('Store: could not put back ' + w.name, err); }
      });
      failed(e);
      return;
    }
    done.forEach(function (w) {
      const q = freshSent(w.name);
      sent[w.name] = { prev: q ? q.prev : w.before, mine: seen[w.name], changes: unionChanges(q && q.changes, pending[w.name]), at: q ? q.at : t };
      delete pending[w.name];
    });
  }
  /* A counter (a name ending in Seq, e.g. $receiptSeq) is written at once, so another tab taking the next number a
     moment later reads this one. Ahead of the records it numbers is harmless (a gap); behind never happens. */
  function writeNow(name) {
    if (legacy || resetting) return;
    try {
      const now = localStorage.getItem(PREFIX + name);
      if (now !== (seen[name] === undefined ? null : seen[name])) { reconcile(name, now); seen[name] = now; notifySoon(); }
      const before = seen[name] === undefined ? null : seen[name];
      writeName(name);
      const q = freshSent(name);
      sent[name] = { prev: q ? q.prev : before, mine: seen[name], changes: { all: true }, at: q ? q.at : Date.now() };
      delete pending[name];
    } catch (e) { /* stays pending: the next save writes it, or reports the failure */ }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 60);
  }
  function hasPending() { for (const k in pending) return true; return false; }
  function emit(coll) {
    (listeners[coll] || []).slice().forEach(function (fn) { try { fn(db[coll]); } catch (e) { console.error(e); } });
    (listeners['*'] || []).slice().forEach(function (fn) { try { fn(coll); } catch (e) { console.error(e); } });
  }
  /* Unique within this tab even when thousands are made in one millisecond (bulk seeding): the time, a counter for
     ids made in the same millisecond, and five random characters against another tab doing the same. */
  let uidT = 0, uidN = 0;
  function rand5() {
    let n;
    try { const a = new Uint32Array(1); window.crypto.getRandomValues(a); n = a[0] % 60466176; } catch (e) { n = Math.floor(Math.random() * 60466176); }
    return ('0000' + n.toString(36)).slice(-5);
  }
  function uid(prefix) {
    const t = Date.now();
    if (t === uidT) uidN++; else { uidT = t; uidN = 0; }
    return (prefix || 'id') + '_' + t.toString(36) + (uidN ? uidN.toString(36) : '') + rand5();
  }

  const store = {
    KEY: KEY,
    uid: uid,
    /** All docs in a collection (live array, do not mutate directly). */
    all: function (coll) { return db[coll] || []; },
    get: function (coll) { return db[coll] || []; },
    find: function (coll, id) { return (db[coll] || []).find(function (d) { return d.id === id; }) || null; },
    where: function (coll, pred) { return (db[coll] || []).filter(pred); },
    insert: function (coll, doc) {
      db[coll] = db[coll] || [];
      const d = Object.assign({ id: uid(coll.slice(0, 3)), createdAt: new Date().toISOString() }, doc);
      db[coll].push(d); touch(coll, d.id); save(); emit(coll); return d;
    },
    update: function (coll, id, patch) {
      const d = store.find(coll, id); if (!d) return null;
      Object.assign(d, typeof patch === 'function' ? patch(d) : patch, { updatedAt: new Date().toISOString() });
      touch(coll, id); save(); emit(coll); return d;
    },
    remove: function (coll, id) {
      db[coll] = (db[coll] || []).filter(function (d) { return d.id !== id; }); touch(coll, id, true); save(); emit(coll);
    },
    replace: function (coll, arr) { db[coll] = arr; touch(coll); save(); emit(coll); },
    /** Settings-style single object stored under a key. */
    getObj: function (key, fallback) { return db['$' + key] !== undefined ? db['$' + key] : fallback; },
    setObj: function (key, val) {
      db['$' + key] = val; touch('$' + key);
      if (/Seq$/.test(key)) writeNow('$' + key);
      save(); emit('$' + key);
    },
    /** Seed a collection once. `make` is an array or a function returning one. A collection that has been seeded
        is remembered in $seeded, so one the user has emptied (e.g. every promo code deleted) stays empty. */
    seed: function (coll, make) {
      const done = db.$seeded || {};
      if (db[coll] && db[coll].length) {
        if (!done[coll]) { done[coll] = true; db.$seeded = done; touch('$seeded'); save(); }
        return;
      }
      if (done[coll]) return;
      db[coll] = (typeof make === 'function' ? make() : make).map(function (d) { return Object.assign({ id: uid(coll.slice(0, 3)) }, d); });
      touch(coll);
      if (db[coll].length) { done[coll] = true; db.$seeded = done; touch('$seeded'); }   /* an empty seed may be filled later */
      save();
    },
    subscribe: function (coll, fn) {
      (listeners[coll] = listeners[coll] || []).push(fn);
      return function () { listeners[coll] = listeners[coll].filter(function (f) { return f !== fn; }); };
    },
    reset: function () {
      clearTimeout(saveTimer); saveTimer = null; pending = {}; resetting = true;
      try { storedNames().forEach(function (name) { localStorage.removeItem(PREFIX + name); }); localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      location.reload();
    },
    exportJSON: function () { return JSON.stringify(db, null, 2); },
    /** Names of every collection and $key on file. */
    keys: function () { return Object.keys(db); },
    /** A collection (or '$key') as saved in this browser right now, read fresh from storage: another tab may have
        changed it in the last moment (e.g. taken a tee time). undefined when nothing is saved under it. */
    stored: function (coll) {
      if (legacy) { let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { /* blocked */ } const all = parse(raw); return all ? all[coll] : undefined; }
      return readName(coll);
    }
  };
  /* ---------- Deterministic random helpers for seed data ---------- */
  let s = 1924;
  function rand() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
  const R = {
    rand: rand,
    int: function (a, b) { return Math.floor(rand() * (b - a + 1)) + a; },
    pick: function (arr) { return arr[Math.floor(rand() * arr.length)]; },
    chance: function (p) { return rand() < p; },
    reseed: function (n) { s = n; }
  };
  store.R = R;

  /* ---------- Date helpers (seed data is relative to today) ---------- */
  function iso(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function daysFromToday(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); }
  store.iso = iso;
  store.daysFromToday = daysFromToday;

  load();

  /* Another tab (staff system, members' portal or public site) saved. Each saved collection arrives as its own
     storage event: take that collection at once, so this tab never writes back a stale copy; if this tab has
     changes to it the other tab may not have (see reconcile), merge them in and write the result now, so neither
     tab's work is lost. Listeners are told shortly after, once per burst, so one save in another tab that wrote
     several collections re-renders this tab once. */

  function same(a, b) {
    if (a === b) return true;
    if (a === undefined || b === undefined || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  /** Field by field: theirs, with the fields this tab changed (mine differs from base) laid on top. When both
      changed a field, an unsaved change here (`mineWins`) wins; one this tab already saved gives way to theirs. */
  function mergeFields(base, mine, theirs, mineWins, out) {
    const res = {}; let differs = false;
    const keys = Object.keys(theirs);
    Object.keys(mine).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(theirs, k)) keys.push(k); });
    keys.forEach(function (k) {
      const m = mine[k], t = theirs[k], b = base ? base[k] : undefined;
      let v = t;
      if (!same(m, b) && (mineWins || same(t, b))) { v = m; if (!same(m, t)) differs = true; }
      if (v !== undefined) res[k] = v;
    });
    /* Fill `out` (this tab's own object, so code holding it sees the result) or a new one */
    const target = out || {};
    if (out) Object.keys(out).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(res, k)) delete out[k]; });
    Object.assign(target, res);
    return { value: target, differs: differs };
  }
  function byId(arr) { const m = new Map(); (arr || []).forEach(function (d) { if (d && d.id != null) m.set(String(d.id), d); }); return m; }
  /** Three-way merge of one saved name. base: what this tab's changes were made on; mine: this tab's copy; theirs:
      what another tab saved; ch: what this tab changed; local: its unsaved changes (they win a clash).
      -> { value, differs (the result has something theirs lacks, so it must be saved again) } */
  function merge3(name, base, mine, theirs, ch, local) {
    if (Array.isArray(mine) && (Array.isArray(theirs) || theirs === undefined)) {
      const gone = theirs === undefined;   /* the whole collection removed elsewhere: keep only what this tab changed */
      const T = gone ? [] : theirs;
      const bMap = byId(Array.isArray(base) ? base : []), mMap = byId(mine), tMap = byId(T);
      /* A collection seeded here and in another tab at the same moment: one copy only (the same one in both tabs). */
      if (ch.all && !gone && !bMap.size && tMap.size && (!Array.isArray(base) || !base.length)) {
        const mineStr = JSON.stringify(pack(mine)), theirStr = JSON.stringify(pack(theirs));
        return mineStr < theirStr ? { value: mine, differs: true } : { value: theirs, differs: false };
      }
      let ids;
      if (ch.all) { ids = new Set(); bMap.forEach(function (_, id) { ids.add(id); }); mMap.forEach(function (_, id) { ids.add(id); }); }
      else ids = new Set(Object.keys(ch.ids || {}).concat(Object.keys(ch.gone || {})));
      const out = T.slice(), at = new Map(); out.forEach(function (d, i) { if (d && d.id != null) at.set(String(d.id), i); });
      const drop = new Set(), add = [];
      let differs = false;
      ids.forEach(function (id) {
        const b = bMap.get(id), m = mMap.get(id), t = tMap.get(id);
        const mineWins = !!local && (!!local.all || !!(local.ids && local.ids[id]) || !!(local.gone && local.gone[id]));
        if (m === undefined) {   /* deleted here */
          if (t !== undefined) { drop.add(id); differs = true; }
          return;
        }
        if (b === undefined) {   /* added here */
          if (t === undefined) { add.push(m); differs = true; }
          else if (mineWins && !same(m, t)) { out[at.get(id)] = mergeFields(undefined, m, t, true, m).value; differs = true; }
          return;
        }
        if (t === undefined) {   /* deleted in the other tab: it stays deleted, even if edited here */
          if (gone) { add.push(m); differs = true; }
          return;
        }
        if (same(m, b)) return;   /* not changed here after all */
        const r = mergeFields(b, m, t, mineWins, m);
        out[at.get(id)] = r.value;
        if (r.differs) differs = true;
      });
      const value = (drop.size ? out.filter(function (d) { return !(d && d.id != null && drop.has(String(d.id))); }) : out).concat(add);
      return { value: value, differs: differs };
    }
    if (theirs === undefined) return local ? { value: mine, differs: mine !== undefined } : { value: undefined, differs: false };
    if (name === '$seeded' && plain(mine) && plain(theirs)) {
      const v = Object.assign({}, theirs, mine);
      return { value: v, differs: !same(v, theirs) };
    }
    if (/Seq$/.test(name) && typeof mine === 'number' && typeof theirs === 'number') return { value: Math.max(mine, theirs), differs: mine > theirs };
    if (plain(mine) && plain(theirs) && (base === undefined || plain(base))) return mergeFields(base || {}, mine, theirs, !!local, null);
    if (same(mine, base)) return { value: theirs, differs: false };
    if (local || same(theirs, base)) return { value: mine, differs: !same(mine, theirs) };
    return { value: theirs, differs: false };
  }
  /* Another tab saved `name` (raw: the string it saved). Take it in, keeping every change of this tab's that it may
     lack: unsaved ones (pending) and, for a few seconds, ones this tab saved that it may have written over without
     seeing (sent; dropped early when the other tab's save replaced this tab's own, oldRaw, so it had seen it).
     Returns true when this tab must save the result again (its pending names then include `name`). */
  function reconcile(name, raw, oldRaw) {
    const p = pending[name];
    let q = freshSent(name);
    if (q && oldRaw != null && oldRaw === q.mine) { delete sent[name]; q = null; }
    const theirs = parse(raw);
    if (raw != null && theirs === undefined) return false;   /* unreadable: keep this tab's copy */
    changed[name] = true;
    if (!p && !q) { if (theirs === undefined) delete db[name]; else db[name] = theirs; return false; }
    const base = parse(q ? q.prev : seen[name]);
    const ch = unionChanges(p, q && q.changes);
    let r;
    try { r = merge3(name, base, db[name], theirs, ch, p); }
    catch (e) { console.error('Store: could not merge ' + name + ' from another tab; keeping this tab’s copy', e); return true; }
    if (r.value === undefined) delete db[name]; else db[name] = r.value;
    if (!p && !r.differs) { delete sent[name]; return false; }   /* the other tab had all of it */
    if (!p) pending[name] = ch;
    return true;
  }
  /* Legacy mode only (the whole database under one key): take another tab's copy of one name, with this tab's
     unsaved documents laid back on top. */
  function adopt(name, theirs) {
    const before = db[name], p = pending[name];
    if (theirs === undefined) delete db[name]; else db[name] = theirs;
    if (p) {
      if (p.all || name.charAt(0) === '$') {
        if (name === '$seeded') db.$seeded = Object.assign({}, db.$seeded, before);
        else if (before === undefined) delete db[name]; else db[name] = before;
      } else {
        const local = before || [];
        const arr = (Array.isArray(db[name]) ? db[name] : []).filter(function (d) { return !p.gone[d.id]; });
        Object.keys(p.ids).forEach(function (id) {
          const doc = local.find(function (d) { return d.id === id; }); if (!doc) return;
          const i = arr.findIndex(function (d) { return d.id === id; });
          if (i >= 0) arr[i] = doc; else arr.push(doc);
        });
        db[name] = arr;
      }
    }
    changed[name] = true;
    return !!p;
  }
  function notifySoon() {
    if (notifyTimer !== null) return;
    notifyTimer = setTimeout(function () {
      notifyTimer = null;
      const names = Object.keys(changed); changed = {};
      names.forEach(emit);
      (listeners['$external'] || []).slice().forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
    }, 16);
  }
  window.addEventListener('storage', function (e) {
    if (resetting) return;
    if (e.key === null) {   /* storage cleared in another tab: write everything back on this tab's next save */
      Object.keys(db).forEach(function (name) { touch(name); });
      return;
    }
    if (e.key === KEY) {
      if (e.newValue == null) return;
      if (legacy) {   /* this tab saves the whole database too: take the other tab's copy collection by collection */
        const all = parse(e.newValue); if (!all) return;
        let mine = false;
        Object.keys(db).concat(Object.keys(all)).filter(function (k, i, a) { return a.indexOf(k) === i; })
          .forEach(function (name) { if (adopt(name, all[name])) mine = true; });
        if (mine) flush();
      } else {
        /* a tab still on the old code saved: split its data in (only the names it holds change) */
        const all = parse(e.newValue);
        const mine = pending; pending = {};
        const before = {}; Object.keys(mine).forEach(function (n) { before[n] = db[n]; });
        absorbLegacy();
        Object.keys(all || {}).forEach(function (n) { changed[n] = true; });
        /* lay this tab's unsaved changes back on top */
        Object.keys(mine).forEach(function (n) { const cur = db[n]; pending[n] = mine[n]; db[n] = before[n]; adopt(n, cur); });
        if (hasPending()) flush();
      }
      notifySoon();
      return;
    }
    if (e.key.indexOf(PREFIX) !== 0 || legacy) return;
    const name = e.key.slice(PREFIX.length);
    /* What is saved now, which can be newer than this event (a later save, maybe this tab's own, already landed). */
    let now = e.newValue; try { now = localStorage.getItem(e.key); } catch (err) { /* storage blocked */ }
    if (!pending[name] && !freshSent(name)) {   /* nothing of this tab's own to keep: take what is saved now */
      if (now === seen[name]) return;
      const theirs = parse(now);
      if (now != null && theirs === undefined) return;   /* unreadable: keep what this tab has */
      seen[name] = now;
      if (theirs === undefined) delete db[name]; else db[name] = theirs;
      changed[name] = true;
      notifySoon();
      return;
    }
    /* This tab changed it too. Merge the version the event carries (it may be one that wrote over this tab's own
       save, which is what is in storage now), or, if this tab already has that one, what is saved now. */
    const fromEvent = e.newValue !== seen[name];
    const raw = fromEvent ? e.newValue : now;
    if (raw === seen[name]) return;
    const again = reconcile(name, raw, fromEvent ? e.oldValue : undefined);
    if (now === raw) seen[name] = now;
    if (again) flush();
    notifySoon();
  });
  /* Write anything still batched before the page goes away or is hidden (closing a tab, following a link,
     switching apps on a phone, which may discard the page without another event). */
  window.addEventListener('pagehide', function () { if (hasPending()) flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && hasPending()) flush(); });
  /* ---------- Core seed: tiers, members, staff, course ---------- */
  /* St. Boniface membership categories. IDs are stable (modules reference them); dues are placeholders
     because the club does not publish prices. playWindows are the published times each category may tee off
     (null = unlimited); see Club.teeRules in js/core/teerules.js. */
  store.seed('membershipTiers', [
    { id: 'tier_founders', name: 'Eagle', annualDues: 3450, monthlyMinimum: 0, golf: true, advanceDays: 15, playWindows: null, description: 'Unlimited golf, 7 days a week. Club storage and a private locker. Book 15 days in advance.', color: 'night' },
    { id: 'tier_full', name: 'Birdie', annualDues: 2650, monthlyMinimum: 0, golf: true, advanceDays: 13, playWindows: { weekday: [['00:00', '07:30'], ['10:30', '16:00'], ['17:30', '23:59']], weekend: [['10:30', '23:59']] }, description: 'Weekdays before 7:30am, 10:30am to 4pm and after 5:30pm; weekends after 10:30am. Club storage and a private locker. Book 13 days in advance.', color: 'green' },
    { id: 'tier_junior', name: 'Young Adult', annualDues: 1150, monthlyMinimum: 0, golf: true, advanceDays: 8, playWindows: { weekday: [['10:30', '16:00'], ['17:30', '23:59']], weekend: [['11:00', '23:59']] }, description: 'Ages 19 to 23. Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am. Club storage and a private locker. Book 8 days in advance.', color: 'brass' },
    { id: 'tier_nonresident', name: 'Junior', annualDues: 450, monthlyMinimum: 0, golf: true, advanceDays: 8, playWindows: { weekday: [['10:30', '16:00'], ['17:30', '23:59']], weekend: [['11:00', '23:59']] }, description: 'Under 18. Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am. Book 8 days in advance.', color: 'parchment' },
  ]);

  store.seed('members', function () {
    R.reseed(1924);
    const first = ['James', 'Eleanor', 'William', 'Charlotte', 'Henry', 'Margaret', 'Edward', 'Catherine', 'Thomas', 'Victoria', 'Richard', 'Elizabeth', 'Charles', 'Josephine', 'George', 'Harriet', 'Frederick', 'Louisa', 'Arthur', 'Beatrice', 'Hugh', 'Imogen', 'Robert', 'Cecilia', 'Philip', 'Olivia', 'Alexander', 'Georgina', 'Benjamin', 'Amelia', 'Nathaniel', 'Clara', 'Daniel', 'Rosalind', 'Samuel', 'Florence', 'Andrew', 'Diana', 'Michael', 'Julia', 'David', 'Priya', 'Kenji', 'Sofia', 'Marcus', 'Aisha', 'Lucas', 'Mei', 'Rafael', 'Hannah'];
    const last = ['Whitmore', 'Ashford', 'Harrington', 'Pemberton', 'Kensington', 'Blackwood', 'Sterling', 'Montgomery', 'Fairfax', 'Langley', 'Carrington', 'Wellesley', 'Hawthorne', 'Davenport', 'Thornton', 'Prescott', 'Radcliffe', 'Beaumont', 'Winslow', 'Chandler', 'Aldridge', 'Ellsworth', 'Kingsley', 'Lockhart', 'Merriweather', 'Nakamura', 'Okafor', 'Castellano', 'Patel', 'Lindqvist'];
    const tiers = ['tier_founders', 'tier_full', 'tier_full', 'tier_full', 'tier_junior', 'tier_full', 'tier_founders', 'tier_nonresident'];
    const streets = ['Youville Street', 'Taché Avenue', 'Provencher Boulevard', 'Marion Street', 'Des Meurons Street', 'Rue Messager', 'Dollard Boulevard', 'St. Mary\'s Road'];
    const out = [];
    for (let i = 0; i < 64; i++) {
      const fn = first[i % first.length];
      const ln = last[(i * 7 + 3) % last.length];
      const tier = tiers[R.int(0, tiers.length - 1)];
      const sinceYear = R.int(1986, 2025);
      const status = i % 23 === 7 ? 'suspended' : (i % 17 === 5 ? 'leave' : 'active');
      const golfer = true;
      out.push({
        id: 'mem_' + (1001 + i),
        memberNo: String(1001 + i),
        firstName: fn, lastName: ln,
        email: (fn[0] + ln).toLowerCase() + '@example.com',
        phone: '(555) ' + R.int(200, 989) + '-' + String(R.int(1000, 9999)),
        address: R.int(10, 980) + ' ' + R.pick(streets),
        tierId: tier,
        status: status,
        memberSince: sinceYear + '-0' + R.int(1, 9) + '-1' + R.int(0, 9),
        dob: R.int(1948, 1992) + '-0' + R.int(1, 9) + '-2' + R.int(0, 8),
        handicap: golfer ? Math.round((R.rand() * 26 - 2) * 10) / 10 : null,
        ghin: golfer ? String(R.int(1000000, 9999999)) : null,
        locker: golfer && R.chance(0.7) ? String(R.int(1, 240)) : null,
        spouse: R.chance(0.45) ? R.pick(first) + ' ' + ln : null,
        children: R.chance(0.3) ? R.int(1, 3) : 0,
        balance: Math.round((R.chance(0.2) ? R.rand() * 4200 : R.rand() * 900) * 100) / 100,
        preferences: { cart: R.pick(['Walk', 'Cart', 'Pull cart']), dining: R.pick(['Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio']), notes: '' },
        tags: R.chance(0.15) ? ['Board'] : (R.chance(0.2) ? ['Committee'] : [])
      });
    }
    return out;
  });

  /* Which hand each demo member plays ('right' or 'left'; null means not recorded). Demo members only, filled once
     where the field is missing, also in browsers seeded before it existed: about one in nine plays left-handed. */
  store.all('members').forEach(function (m) {
    const n = +String(m.id).replace('mem_', '');
    if (m.hand === undefined && n >= 1001 && n <= 1064) store.update('members', m.id, { hand: n % 9 === 4 ? 'left' : 'right' });
  });

  /* The members' portal demo account (shown on the sign-in page). Applied to existing data too. */
  store.DEMO_MEMBER = 'mem_1003';
  (function () {
    const m = store.find('members', store.DEMO_MEMBER);
    if (m && !(m.firstName === 'Dave' && m.lastName === 'Nerada')) {
      store.update('members', m.id, { firstName: 'Dave', lastName: 'Nerada', email: 'dnerada@example.com', spouse: m.spouse ? m.spouse.split(' ')[0] + ' Nerada' : null });
    }
  })();

  store.seed('staff', [
    { id: 'stf_1', firstName: 'Carly', lastName: 'Dalmyn', role: 'Director of Clubhouse Operations', department: 'Administration', email: 'cdalmyn@stboniface.example', phone: '204-233-2497 x215', hourlyRate: null, status: 'active' },
    { id: 'stf_2', firstName: 'Steve', lastName: 'Wood', role: 'Director of Golf', department: 'Golf Operations', email: 'swood@stboniface.example', phone: '204-233-2497 x209', hourlyRate: null, status: 'active' },
    { id: 'stf_3', firstName: 'Declan', lastName: 'Reyes', role: 'Head Golf Professional', department: 'Golf Operations', email: 'dreyes@stboniface.example', phone: '204-233-2497', hourlyRate: null, status: 'active' },
    { id: 'stf_4', firstName: 'Nora', lastName: 'Lindgren', role: 'Assistant Golf Professional', department: 'Golf Operations', email: 'nlindgren@stboniface.example', phone: '204-233-2497', hourlyRate: 32, status: 'active' },
    { id: 'stf_5', firstName: 'Tobias', lastName: 'Achebe', role: 'Assistant Golf Professional', department: 'Golf Operations', email: 'tachebe@stboniface.example', phone: '204-233-2497', hourlyRate: 30, status: 'active' },
    { id: 'stf_6', firstName: 'Craig', lastName: 'Campbell', role: 'Golf Course Superintendent', department: 'Agronomy', email: 'ccampbell@stboniface.example', phone: '204-235-1549', hourlyRate: null, status: 'active' },
    { id: 'stf_7', firstName: 'Rosa', lastName: 'Delgado', role: 'Assistant Superintendent', department: 'Agronomy', email: 'rdelgado@stboniface.example', phone: '204-233-2497', hourlyRate: 34, status: 'active' },
    { id: 'stf_8', firstName: 'Kwame', lastName: 'Mensah', role: 'Equipment Manager', department: 'Agronomy', email: 'kmensah@stboniface.example', phone: '204-233-2497', hourlyRate: 31, status: 'active' },
    { id: 'stf_9', firstName: 'Liam', lastName: 'Byrne', role: 'Grounds Crew', department: 'Agronomy', email: 'lbyrne@stboniface.example', phone: '204-233-2497', hourlyRate: 19, status: 'active' },
    { id: 'stf_10', firstName: 'Mateo', lastName: 'Silva', role: 'Grounds Crew', department: 'Agronomy', email: 'msilva@stboniface.example', phone: '204-233-2497', hourlyRate: 19, status: 'active' },
    { id: 'stf_11', firstName: 'Grace', lastName: 'Thornbury', role: 'Irrigation Technician', department: 'Agronomy', email: 'gthornbury@stboniface.example', phone: '204-233-2497', hourlyRate: 26, status: 'active' },
    { id: 'stf_12', firstName: 'Ian', lastName: 'Wong', role: 'Executive Chef', department: 'Food & Beverage', email: 'iwong@stboniface.example', phone: '204-233-2497 x206', hourlyRate: null, status: 'active' },
    { id: 'stf_13', firstName: 'Sienna', lastName: 'Park', role: 'Food & Beverage Manager', department: 'Food & Beverage', email: 'spark@stboniface.example', phone: '204-233-2497', hourlyRate: null, status: 'active' },
    { id: 'stf_14', firstName: 'Oliver', lastName: 'Quinn', role: 'Sous Chef', department: 'Food & Beverage', email: 'oquinn@stboniface.example', phone: '204-233-2497', hourlyRate: 28, status: 'active' },
    { id: 'stf_15', firstName: 'Amara', lastName: 'Osei', role: 'Server', department: 'Food & Beverage', email: 'aosei@stboniface.example', phone: '204-233-2497', hourlyRate: 16, status: 'active' },
    { id: 'stf_16', firstName: 'Ethan', lastName: 'Clarke', role: 'Server', department: 'Food & Beverage', email: 'eclarke@stboniface.example', phone: '204-233-2497', hourlyRate: 16, status: 'active' },
    { id: 'stf_17', firstName: 'Isabel', lastName: 'Varga', role: 'Bartender', department: 'Food & Beverage', email: 'ivarga@stboniface.example', phone: '204-233-2497', hourlyRate: 18, status: 'active' },
    { id: 'stf_18', firstName: 'Henrik', lastName: 'Dahl', role: 'Bar Manager', department: 'Food & Beverage', email: 'hdahl@stboniface.example', phone: '204-233-2497', hourlyRate: 27, status: 'active' },
    { id: 'stf_19', firstName: 'Tori', lastName: 'Sawchyn', role: 'Administrative Assistant', department: 'Administration', email: 'tsawchyn@stboniface.example', phone: '204-233-2497 x200', hourlyRate: null, status: 'active' },
    { id: 'stf_20', firstName: 'Leslie', lastName: 'Filopoulos', role: 'Controller', department: 'Administration', email: 'lfilopoulos@stboniface.example', phone: '204-233-2497 x202', hourlyRate: null, status: 'active' },
    { id: 'stf_21', firstName: 'Clara', lastName: 'Bishop', role: 'Special Events Coordinator', department: 'Events', email: 'cbishop@stboniface.example', phone: '204-233-2497', hourlyRate: null, status: 'active' },
    { id: 'stf_22', firstName: 'Samuel', lastName: 'Ortiz', role: 'Starter', department: 'Golf Operations', email: 'sortiz@stboniface.example', phone: '204-233-2497', hourlyRate: 18, status: 'active' },
    { id: 'stf_23', firstName: 'Ruby', lastName: 'Fenwick', role: 'Pro Shop Associate', department: 'Golf Operations', email: 'rfenwick@stboniface.example', phone: '204-233-2497', hourlyRate: 17, status: 'active' },
    { id: 'stf_24', firstName: 'Ahmed', lastName: 'Karim', role: 'Back Shop Supervisor', department: 'Golf Operations', email: 'akarim@stboniface.example', phone: '204-233-2497', hourlyRate: 22, status: 'active' },
    { id: 'stf_25', firstName: 'Harriet', lastName: 'Vance', role: 'Front Desk', department: 'Administration', email: 'hvance@stboniface.example', phone: '204-233-2497', hourlyRate: 20, status: 'active' }
  ]);

  /* From the 2025 St. Boniface scorecard: men's par and handicap, Black / Green / Silver tees. */
  store.seed('holes', function () {
    const pars = [4, 4, 4, 4, 3, 4, 4, 4, 5, 4, 5, 3, 5, 3, 4, 4, 5, 3];
    const hcp = [8, 4, 10, 12, 14, 18, 16, 2, 6, 3, 17, 5, 7, 9, 13, 11, 1, 15];
    const black = [357, 365, 379, 379, 163, 332, 282, 366, 520, 441, 483, 220, 516, 205, 330, 325, 516, 169];
    const green = [340, 355, 368, 361, 145, 326, 271, 355, 497, 430, 471, 206, 496, 185, 316, 319, 504, 159];
    const silver = [320, 292, 320, 346, 127, 317, 256, 339, 444, 418, 461, 223, 476, 165, 301, 312, 448, 154];
    return pars.map(function (p, i) {
      return { id: 'hole_' + (i + 1), number: i + 1, name: 'Hole ' + (i + 1), par: p, handicap: hcp[i], yards: { black: black[i], green: green[i], silver: silver[i] } };
    });
  });

  window.Club = window.Club || {};
  Club.store = store;
})();
