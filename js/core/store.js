/* Club.store: a small localStorage-backed document store shared by every module.
   Collections are arrays of objects with a string `id`. See SPEC.md for schemas.

   Persistence: each collection (and each setObj key, stored as '$key') lives under its own localStorage key,
   KEY + ':' + name, so a save writes only what changed instead of the whole ~2 MB database. Writes are batched
   for 60 ms; `pending` doubles as the list of names to write. Data saved by older versions as one blob under KEY
   is split into per-collection keys on first load (see absorbLegacy). */
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

  function storedNames() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } }
    catch (e) { /* storage blocked */ }
    return out.sort();
  }
  function parse(raw) { if (raw == null) return undefined; try { return JSON.parse(raw); } catch (e) { return undefined; } }
  function readName(name) { let raw = null; try { raw = localStorage.getItem(PREFIX + name); } catch (e) { /* storage blocked */ } return parse(raw); }
  function writeName(name) {   /* throws on quota errors */
    if (db[name] === undefined) { localStorage.removeItem(PREFIX + name); seen[name] = null; }
    else { const str = JSON.stringify(db[name]); localStorage.setItem(PREFIX + name, str); seen[name] = str; }
  }

  function load() {
    db = {};
    storedNames().forEach(function (name) {
      let raw = null; try { raw = localStorage.getItem(PREFIX + name); } catch (e) { /* storage blocked */ }
      const v = parse(raw); if (v !== undefined) { db[name] = v; seen[name] = raw; }
    });
    absorbLegacy();
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
     on top of the other tab's data (see the storage listener) instead of being dropped.
     name -> { all: true } or { ids: {id: true}, gone: {id: true} } */
  let saveTimer = null, pending = {}, warned = false, resetting = false;
  let notifyTimer = null, changed = {};   /* names another tab changed, told to listeners shortly (notifySoon) */
  function touch(coll, id, removed) {
    const p = pending[coll] = pending[coll] || { ids: {}, gone: {} };
    if (p.all) return;
    if (id == null) { pending[coll] = { all: true }; return; }
    if (removed) { p.gone[id] = true; delete p.ids[id]; } else { p.ids[id] = true; delete p.gone[id]; }
  }
  function failed(e) {
    console.warn('Store save failed', e);
    if (!warned && window.Club && Club.ui && Club.ui.toast) {   /* storage full: say so once rather than fail silently */
      warned = true;
      Club.ui.toast('Changes could not be saved: this browser’s storage is full. Export your data in Settings, then reset the demo data.', 'bad');
    }
  }
  /* A name that fails to write stays in `pending` and is tried again on the next flush (the data stays in memory). */
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (resetting) return;
    if (legacy) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); pending = {}; } catch (e) { failed(e); }
      return;
    }
    let err = null;
    Object.keys(pending).forEach(function (name) {
      try {
        const now = localStorage.getItem(PREFIX + name);
        if (now !== (seen[name] === undefined ? null : seen[name])) {   /* another tab saved it since: take theirs, mine on top */
          const theirs = parse(now);
          if (now == null || theirs !== undefined) { adopt(name, theirs); notifySoon(); }
        }
        writeName(name); delete pending[name];
      } catch (e) { err = e; }
    });
    if (err) failed(err);
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
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    setObj: function (key, val) { db['$' + key] = val; touch('$' + key); save(); emit('$' + key); },
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
     changes to it not yet written, lay them back on top (document by document) and write the result now, so
     neither tab's work is lost. Listeners are told shortly after, once per burst, so one save in another tab
     that wrote several collections re-renders this tab once. */
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
    if (now === seen[name]) return;   /* nothing this tab does not already have */
    const theirs = parse(now);
    if (now != null && theirs === undefined) return;   /* unreadable: keep what this tab has */
    seen[name] = now;
    if (adopt(name, theirs)) flush();
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
