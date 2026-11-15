/* Club.undo: Undo for staff actions (staff site only; loaded after ui.js and receipts.js).

   Record what an action changes, then offer Undo on its toast:

     const rec = Club.undo.track(function () { ...the action's store writes...; return result; });
     Club.undo.offer('Order W-0004 picked up', rec, { after: rerender });

   or in one step (message may be a function of the action's return value):

     Club.undo.run(function () { ... }, { message: 'Product deleted', after: rerender, undone: 'Product restored' });

   track() records every Club.store write made synchronously inside fn (insert, update, remove, replace, setObj).
   Nested track() calls fold into the outer one. Nothing is persisted: the record lives as long as the toast.

   Undo reverses the writes newest first. Plain records are put back exactly as they were (deleted ones come back
   with the same id and position). Money is never silently erased, so the books and the daily close still add up:
     charges        a matching reversal charge (negative amount) with a credit receipt; original gets reversedBy
     receipts       a sale receipt not covered by a reversed charge gets a credit receipt (and a credit gets a sale)
     sales          a refund sale ('<id>_u', negative quantities and amounts, refundOf)
     payments       a reversing payment (negative amount, reverses) and the member balance goes back
     publicPayments a reversing entry (negative amount, reverses)
     giftCards      the balance goes back through a history entry (refund or redeem), a void is lifted with a note
                    a card sold in the action is voided ('Sale undone'), never deleted, so its code and history stay on file
     members        every field is restored except balance, which the charge and payment reversals settle
     $...Seq keys   receipt and order sequences never go backwards
   Undo is refused (with a toast saying why) when:
     - something recorded changed after the action (another tab, another staff member, a later step), or
     - the action moved money and today is closed in Accounting (Club.accounting.isClosed). */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui;
  const MONEY = { charges: 1, receipts: 1, sales: 1, payments: 1, publicPayments: 1, giftCards: 1 };
  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  const copy = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  const today = function () { return Club.date.today(); };

  let rec = null, depth = 0;
  const raw = { insert: S.insert, update: S.update, remove: S.remove, replace: S.replace, setObj: S.setObj };

  function seen(c, id) { return rec.ops.some(function (o) { return o.c === c && o.id === id && (o.t === 'ins' || o.t === 'upd'); }); }
  S.insert = function (c, doc) {
    const d = raw.insert.apply(S, arguments);
    if (rec && d) rec.ops.push({ t: 'ins', c: c, id: d.id });
    return d;
  };
  S.update = function (c, id) {
    if (rec && !seen(c, id)) { const d = S.find(c, id); if (d) rec.ops.push({ t: 'upd', c: c, id: id, before: copy(d) }); }
    return raw.update.apply(S, arguments);
  };
  S.remove = function (c, id) {
    if (rec) { const arr = S.all(c), i = arr.findIndex(function (d) { return d.id === id; }); if (i >= 0) rec.ops.push({ t: 'rem', c: c, id: id, doc: copy(arr[i]), index: i }); }
    return raw.remove.apply(S, arguments);
  };
  S.replace = function (c) {
    if (rec) rec.ops.push({ t: 'rep', c: c, before: copy(S.all(c)) });
    return raw.replace.apply(S, arguments);
  };
  S.setObj = function (k) {
    if (rec) rec.ops.push({ t: 'obj', k: k, before: copy(S.getObj(k)) });
    return raw.setObj.apply(S, arguments);
  };

  /** Run fn and record its store writes. Returns { result, ops, money, after }. */
  function track(fn) {
    if (rec) { depth++; try { return { result: fn(), nested: true }; } finally { depth--; } }
    rec = { ops: [] };
    let result;
    const mine = rec;
    try { result = fn(); }
    finally { rec = null; }
    mine.result = result;
    mine.money = mine.ops.some(function (o) { return MONEY[o.c] || (o.t === 'upd' && o.c === 'members' && o.before.balance !== (S.find('members', o.id) || {}).balance); });
    /* What each touched record looks like right after the action, to spot later changes. */
    mine.after = {};
    mine.ops.forEach(function (o) {
      if (o.t === 'ins' || o.t === 'upd') { const d = S.find(o.c, o.id); mine.after[o.c + '|' + o.id] = d ? JSON.stringify(d) : null; }
      else if (o.t === 'obj') mine.after['$' + o.k] = JSON.stringify(S.getObj(o.k));
    });
    return mine;
  }

  function changedSince(r) {
    return r.ops.some(function (o) {
      /* a settings-style key written again since (sequences only ever move forward, so they do not count) */
      if (o.t === 'obj') return !/Seq$/.test(o.k) && JSON.stringify(S.getObj(o.k)) !== r.after['$' + o.k];
      if (o.t !== 'ins' && o.t !== 'upd') return false;
      const d = S.find(o.c, o.id), was = r.after[o.c + '|' + o.id];
      return (d ? JSON.stringify(d) : null) !== was;
    });
  }

  /* ---------------- Money reversals (usable on their own too) ---------------- */
  /** Post the opposite of a charge to the same account, with a credit (or sale) receipt; marks the original reversedBy. */
  function reverseCharge(id, o) {
    const c = S.find('charges', id); if (!c || c.reversedBy) return null;
    o = o || {};
    /* Undoing a reversal charges again; it never stacks "Reversed: Reversed:". */
    const base = String(c.description || '').replace(/^(Reversed|Charged again): /, '');
    const prefix = o.prefix || (c.reverses || /^Reversed: /.test(c.description || '') ? 'Charged again: ' : 'Reversed: ');
    const cr = Club.chargeMember(c.memberId, { description: prefix + base, category: c.category, amount: -c.amount, source: c.source,
      refId: c.refId, date: today(), title: o.title || 'Correction', lines: o.lines });
    if (cr) {
      raw.update.call(S, 'charges', c.id, { reversedBy: cr.id }); raw.update.call(S, 'charges', cr.id, { reverses: c.id });
      /* The original charge's receipt is covered by this reversal's receipt, so nothing credits it a second time later. */
      const crRc = S.all('receipts').filter(function (r) { return r.chargeId === cr.id; })[0];
      S.all('receipts').filter(function (r) { return r.chargeId === c.id && !r.reversedBy; })
        .forEach(function (r) { raw.update.call(S, 'receipts', r.id, { reversedBy: crRc ? crRc.id : cr.id }); });
    }
    return cr;
  }
  /** The opposite receipt for one that stands on its own (card, cash or gift card sale; or a credit). */
  function creditReceipt(id, o) {
    const r = S.find('receipts', id); if (!r || r.reversedBy || !Club.receipts) return null;
    o = o || {};
    const credit = r.kind !== 'credit';
    const out = Club.receipts.create({ memberId: r.memberId || null, publicPlayerId: r.publicPlayerId || null, name: r.memberId || r.publicPlayerId ? undefined : r.name,
      kind: credit ? 'credit' : 'sale', title: o.title || (r.title + (credit ? ' reversed' : ' reinstated')), lines: r.lines, total: r.total,
      method: r.method, methodLabel: r.methodLabel, source: r.source, refId: r.refId, tenders: r.tenders, channel: r.channel,
      note: o.note || ('Receipt ' + r.no + (credit ? ' reversed.' : ' reinstated.')), fresh: true });
    if (out) raw.update.call(S, 'receipts', r.id, { reversedBy: out.id });
    return out;
  }
  function refundSale(id) {
    const s = S.find('sales', id); if (!s || S.find('sales', id + '_u')) return null;
    const neg = function (v) { return v == null ? v : -v; };
    return raw.insert.call(S, 'sales', Object.assign({}, s, { id: s.id + '_u', date: today(), createdAt: new Date().toISOString(),
      items: (s.items || []).map(function (i) { return Object.assign({}, i, { qty: -i.qty }); }),
      subtotal: neg(s.subtotal), tax: neg(s.tax), total: neg(s.total), discount: neg(s.discount || 0), giftAmount: neg(s.giftAmount || 0), refundOf: s.id, undo: true }));
  }
  function reversePayment(c, id) {
    const p = S.find(c, id); if (!p || p.reversedBy) return null;
    const rv = raw.insert.call(S, c, Object.assign({}, p, { id: S.uid(c.slice(0, 3)), date: today(), createdAt: new Date().toISOString(), amount: -p.amount,
      reverses: p.id, reference: 'Reversed', note: 'Undo' }));
    raw.update.call(S, c, p.id, { reversedBy: rv.id });
    if (c === 'payments' && p.memberId) { const m = S.find('members', p.memberId); if (m) raw.update.call(S, 'members', m.id, { balance: r2((m.balance || 0) + p.amount) }); }
    return rv;
  }
  function restoreGiftCard(before) {
    const G = Club.giftcards, now = S.find('giftCards', before.id); if (!now || !G) return;
    if (now.status === 'void' && before.status !== 'void') {
      raw.update.call(S, 'giftCards', now.id, { status: before.status, balance: before.balance, voidedAt: null, voidReason: '',
        history: (now.history || []).concat([{ at: new Date().toISOString(), type: 'adjust', amount: r2(before.balance), balance: r2(before.balance), where: 'desk', note: 'Void undone' }]) });
      return;
    }
    const diff = r2(before.balance - now.balance);
    if (diff > 0) G.refund(now.id, diff, { where: 'desk', note: 'Undo' });
    else if (diff < 0) G.redeem(now.id, -diff, { where: 'desk', note: 'Undo' });
  }

  /* ---------------- Plain restores (exact, without recording) ---------------- */
  function setDoc(c, id, doc) {
    const arr = S.all(c).slice(), i = arr.findIndex(function (d) { return d.id === id; });
    if (doc) { if (i >= 0) arr[i] = doc; else arr.push(doc); } else if (i >= 0) arr.splice(i, 1);
    raw.replace.call(S, c, arr);
  }
  function putBack(c, doc, index) {
    const arr = S.all(c).slice();
    if (arr.some(function (d) { return d.id === doc.id; })) return;
    arr.splice(Math.min(index, arr.length), 0, doc);
    raw.replace.call(S, c, arr);
  }

  /** Reverse a record. Returns { ok, msg?, credited }. */
  function revert(r) {
    if (!r || !r.ops || !r.ops.length) return { ok: false, msg: 'Nothing to undo.' };
    if (r.undone) return { ok: false, msg: 'Already undone.' };
    if (changedSince(r)) return { ok: false, msg: 'This has changed since, so it can no longer be undone here.' };
    if (r.money && Club.accounting && Club.accounting.isClosed && Club.accounting.isClosed(today())) return { ok: false, msg: 'Today is closed in Accounting. Reopen the day to undo this.' };
    const insCharges = {}, reversedCharges = {};
    r.ops.forEach(function (o) { if (o.t === 'ins' && o.c === 'charges') insCharges[o.id] = 1; });
    let credited = 0;
    for (let i = r.ops.length - 1; i >= 0; i--) {
      const o = r.ops[i];
      if (o.t === 'ins') {
        if (o.c === 'charges') { const c = S.find('charges', o.id); const cr = reverseCharge(o.id); if (cr) { reversedCharges[o.id] = 1; if (c.amount > 0) credited += c.amount; } }
        else if (o.c === 'receipts') { const rc = S.find('receipts', o.id); if (rc && !(rc.chargeId && insCharges[rc.chargeId])) creditReceipt(o.id); }
        else if (o.c === 'sales') refundSale(o.id);
        else if (o.c === 'payments' || o.c === 'publicPayments') reversePayment(o.c, o.id);
        else if (o.c === 'giftCards' && Club.giftcards) { const gc = S.find('giftCards', o.id); if (gc && gc.status !== 'void') Club.giftcards.void(o.id, 'Sale undone', Club.user ? (Club.user.firstName + ' ' + Club.user.lastName).trim() : null); }
        else setDoc(o.c, o.id, null);
      } else if (o.t === 'upd') {
        if (o.c === 'giftCards') restoreGiftCard(o.before);
        else if (o.c === 'members') { const now = S.find('members', o.id); setDoc('members', o.id, Object.assign({}, o.before, { balance: now ? now.balance : o.before.balance })); }
        else if (o.c === 'charges' && S.find('charges', o.id) && S.find('charges', o.id).reversedBy && !o.before.reversedBy) { /* a reversal this undo just made: keep */ }
        else setDoc(o.c, o.id, o.before);
      } else if (o.t === 'rem') putBack(o.c, o.doc, o.index);
      else if (o.t === 'rep') { if (!MONEY[o.c]) raw.replace.call(S, o.c, o.before); }
      else if (o.t === 'obj') { if (!/Seq$/.test(o.k)) raw.setObj.call(S, o.k, o.before); }
    }
    r.undone = true;
    return { ok: true, credited: r2(credited) };
  }

  /** Toast with an Undo button for a record. opts: { kind, after(), undone (message or fn(result)), refused() } */
  function offer(msg, r, opts) {
    opts = opts || {};
    if (!r || !r.ops || !r.ops.length) { ui.toast(msg, opts.kind); return; }
    ui.toast(msg, opts.kind, { action: { label: 'Undo', onClick: function () {
      const res = revert(r);
      if (!res.ok) { ui.toast(res.msg, 'bad'); if (opts.refused) opts.refused(res); return; }
      try { if (opts.after) opts.after(res); } catch (e) { console.error(e); }
      const u = typeof opts.undone === 'function' ? opts.undone(res) : opts.undone;
      ui.toast((u || 'Undone') + (res.credited ? '. ' + Club.fmt.money(res.credited) + ' credited back' : ''));
    } } });
  }

  /** track + offer. opts.message: string or fn(result); returning a falsy message skips the toast (e.g. validation failed). */
  function run(fn, opts) {
    opts = opts || {};
    const r = track(fn);
    if (r.nested) return r.result;
    const msg = typeof opts.message === 'function' ? opts.message(r.result) : opts.message;
    if (msg) offer(msg, r, opts);
    return r.result;
  }

  Club.undo = { track: track, revert: revert, offer: offer, run: run, reverseCharge: reverseCharge, creditReceipt: creditReceipt, refundSale: refundSale, reversePayment: reversePayment, changedSince: changedSince };
})();
