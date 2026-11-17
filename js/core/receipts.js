/* Club.receipts: one receipt for everything a person pays for or orders, kept in the 'receipts' collection so the
   member (portal), the public golfer (booking site) or staff can open it again later. One design on all three sites
   (css/receipts.css). Loaded after js/core/ui.js and js/core/club.js, before any module.

   Receipt doc ('receipts'):
     { id ('rc_…'), no ('R-000123', sequence in $receiptSeq), kind: 'sale'|'credit', at (ISO timestamp), date ('YYYY-MM-DD'),
       memberId|null, publicPlayerId|null, name (customer's full name), title (short heading: 'Beverage cart', 'Account payment'),
       lines: [{ name, qty, price (unit price, CAD), size? }], total (always positive; kind gives the direction),
       method: 'account'|'card'|'cash'|'other', methodLabel ('Charged to your member account', 'Visa ending 4242', 'Cash',
       'Credit to your member account'), source ('cart', 'events', 'lessons', 'dining', 'proshop', 'teesheet', 'billing',
       'portal', 'public', … as the caller passes), refId|null, chargeId|null, paymentId|null, note|null,
       tenders: [{ method: 'card'|'cash'|'account'|'gift'|'other', amount, online?, ref? }]|null (Nov 2026: how the money was
       taken, split by tender; pass it from any new code that takes money), channel: 'online'|'counter'|null }

   Club.receipts.create(o) -> doc       o: any of the fields above. Filled in when missing: id, no, at (now), date (today),
                                        kind ('credit' when total < 0, else 'sale'), lines (one line from title), total (sum of
                                        qty x price), name (from memberId or publicPlayerId), method ('account' for a member
                                        without a paymentId, else 'other'), methodLabel (from method and kind), source ('other').
                                        Never duplicates: returns the existing receipt when one has the same chargeId, or the same
                                        paymentId, or (within 5 seconds) the same source, refId (not null), kind, total and
                                        customer, provided their chargeId / paymentId / tender refs do not differ. When neither has
                                        a chargeId or paymentId (a double tap, not a charge and its record), the match must also be
                                        within 1.5 seconds and say exactly the same (title, lines, payment, note), so two separate
                                        payments of the same amount on one record keep a receipt each. A match gains any chargeId,
                                        paymentId or note it lacked.
   Club.receipts.get(id)                the doc or null
   Club.receipts.forMember(memberId)    newest first
   Club.receipts.forPublic(publicPlayerId)  newest first
   Club.receipts.forRef(source, refId)  newest first
   Club.receipts.html(r)                the receipt markup (string)
   Club.receipts.open(idOrDoc)          shows it in Club.ui.modal with Close and Print or save as PDF; returns the modal api
   Club.receipts.cardLabel(brand, last4)  'Visa ending 4242' (brand ids as Club.cards: 'visa', 'mastercard', …)
   Club.receipts.backfill() -> count    once per store ($receiptsBackfilled): receipts for existing charges and payments.
                                        Runs by itself on DOMContentLoaded, after every module has seeded its data.

   Club.chargeMember (js/core/ui.js) makes the receipt for every account charge (pass lines and title to it; noReceipt: true
   skips it). Payments recorded straight into 'payments' need their own create({ paymentId, … }). */
(function () {
  'use strict';
  window.Club = window.Club || {};
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;
  const COLL = 'receipts';
  const WINDOW_MS = 5000, TAP_MS = 1500;
  const METHODS = ['account', 'card', 'cash', 'other'];

  const r2 = function (v) { return Math.round((+v || 0) * 100) / 100; };
  function blank(v) { return v === undefined || v === null || v === ''; }

  function cardLabel(brand, last4) {
    const b = Club.cards && Club.cards.brands ? Club.cards.brands.find(function (x) { return x.id === brand; }) : null;
    return (b ? b.name : 'Card') + (last4 ? ' ending ' + last4 : '');
  }
  function defaultLabel(method, kind) {
    if (method === 'account') return kind === 'credit' ? 'Credit to your member account' : 'Charged to your member account';
    if (method === 'card') return 'Card';
    if (method === 'cash') return 'Cash';
    return 'Other';
  }
  function customerName(o) {
    if (o.memberId) { const m = S.find('members', o.memberId); if (m) return m.firstName + ' ' + m.lastName; }
    if (o.publicPlayerId) { const p = S.find('publicPlayers', o.publicPlayerId); if (p) return [p.firstName, p.lastName].filter(Boolean).join(' '); }
    return 'Guest';
  }
  function cleanLines(lines) {
    return (lines || []).filter(Boolean).map(function (l) {
      const out = { name: String(l.name == null ? '' : l.name), qty: +l.qty > 0 ? +l.qty : 1, price: r2(l.price) };
      if (l.size) out.size = String(l.size);
      return out;
    });
  }
  function sum(lines) { return r2(lines.reduce(function (a, l) { return a + l.qty * l.price; }, 0)); }

  /** The next number: one past the highest used so far, in this tab or saved by another tab a moment ago (the stored
      sequence is read fresh, and setObj writes a sequence at once), or past the receipts themselves if the sequence was
      lost (or `scan`). */
  function nextNo(scan) {
    let n = Math.max(+S.getObj('receiptSeq', 0) || 0, +S.stored('$receiptSeq') || 0);
    if ((scan || !n) && S.all(COLL).length) S.all(COLL).forEach(function (r) { const k = parseInt(String(r.no).slice(2), 10); if (k > n) n = k; });
    n++;
    S.setObj('receiptSeq', n);
    return n;
  }
  function label(n) { return 'R-' + String(n).padStart(6, '0'); }

  /** The receipt this one would duplicate, if any (see create). */
  function findDup(d) {
    const all = S.all(COLL);
    if (d.chargeId) { const x = all.find(function (r) { return r.chargeId === d.chargeId; }); if (x) return x; }
    if (d.paymentId) { const x = all.find(function (r) { return r.paymentId === d.paymentId; }); if (x) return x; }
    if (d.refId == null) return null;
    const now = Date.parse(d.at) || Date.now();
    /* Recent receipts are at the end; a flow that both charges and records only ever repeats within a moment. */
    for (let i = all.length - 1, seen = 0; i >= 0 && seen < 60; i--, seen++) {
      const r = all[i];
      if (Math.abs(now - Date.parse(r.at)) > WINDOW_MS) continue;
      if (r.source !== d.source || r.refId !== d.refId || r.kind !== d.kind || r.total !== d.total) continue;
      if ((r.memberId || null) !== d.memberId || (r.publicPlayerId || null) !== d.publicPlayerId) continue;
      if ((d.chargeId && r.chargeId && r.chargeId !== d.chargeId) || (d.paymentId && r.paymentId && r.paymentId !== d.paymentId)) continue;
      const rRefs = tenderRefs(r), dRefs = tenderRefs(d);
      if (rRefs && dRefs && rRefs !== dRefs) continue;   /* e.g. two deposits on one wedding: each tender names its own payment */
      if (!d.chargeId && !d.paymentId && !r.chargeId && !r.paymentId) {
        /* nothing ties them to one charge or payment: only a double tap, so a moment apart and word for word the same */
        if (Math.abs(now - Date.parse(r.at)) > TAP_MS) continue;
        if (r.title !== d.title || r.method !== d.method || r.methodLabel !== d.methodLabel || (r.note || null) !== d.note ||
          JSON.stringify(r.lines || []) !== JSON.stringify(d.lines)) continue;
      }
      return r;
    }
    return null;
  }

  function tenderRefs(r) {
    const refs = (r.tenders || []).map(function (t) { return t && t.ref ? String(t.ref) : ''; }).filter(Boolean);
    return refs.length ? refs.sort().join('|') : '';
  }

  /** The full doc from a partial one, without an id or number yet. */
  function build(o) {
    const lines0 = cleanLines(o.lines);
    let total = blank(o.total) ? sum(lines0) : r2(o.total);
    const kind = o.kind === 'credit' || o.kind === 'sale' ? o.kind : (total < 0 ? 'credit' : 'sale');
    total = Math.abs(total);
    const title = String(o.title || (lines0[0] && lines0[0].name) || (kind === 'credit' ? 'Credit' : 'Purchase'));
    const lines = lines0.length ? lines0 : [{ name: title, qty: 1, price: total }];
    const memberId = o.memberId || null, publicPlayerId = o.publicPlayerId || null;
    const method = METHODS.indexOf(o.method) >= 0 ? o.method : (memberId && !o.paymentId ? 'account' : 'other');
    const at = o.at || new Date().toISOString();
    return {
      kind: kind, at: at, date: o.date || S.iso(new Date(at)),
      memberId: memberId, publicPlayerId: publicPlayerId, name: o.name || customerName(o), title: title,
      lines: lines, total: total, method: method, methodLabel: o.methodLabel || defaultLabel(method, kind),
      source: o.source || 'other', refId: blank(o.refId) ? null : o.refId, chargeId: o.chargeId || null, paymentId: o.paymentId || null,
      note: o.note || null,
      tenders: cleanTenders(o.tenders), channel: o.channel === 'online' || o.channel === 'counter' ? o.channel : null
    };
  }
  /** How the money was taken, when the caller knows it (Nov 2026, read by the daily close in js/modules/accounting.js):
      [{ method: 'card'|'cash'|'account'|'gift'|'other', amount (positive), online?: true (paid on the public site or the portal,
      settled by the card processor, not the shop terminal), ref? (gift card id, payment id) }]. null when not given. */
  const TENDERS = ['card', 'cash', 'account', 'gift', 'other'];
  function cleanTenders(t) {
    if (!Array.isArray(t) || !t.length) return null;
    const out = t.filter(function (x) { return x && TENDERS.indexOf(x.method) >= 0 && r2(x.amount) > 0; }).map(function (x) {
      const o = { method: x.method, amount: r2(x.amount) };
      if (x.online) o.online = true;
      if (x.ref) o.ref = String(x.ref);
      return o;
    });
    return out.length ? out : null;
  }

  function create(o) {
    o = o || {};
    const d = build(o);
    /* o.fresh: a deliberate new receipt (an Undo reinstating or reversing a sale) is never merged into a recent one. */
    const dup = o.fresh ? null : findDup(d);
    if (dup) {
      const patch = {};
      ['chargeId', 'paymentId', 'note', 'tenders', 'channel'].forEach(function (k) { if (d[k] && !dup[k]) patch[k] = d[k]; });
      return Object.keys(patch).length ? S.update(COLL, dup.id, patch) : dup;
    }
    const n = nextNo();
    const doc = S.insert(COLL, Object.assign({ id: o.id || S.uid('rc'), no: label(n) }, d));
    madeHere[doc.id] = Date.now();
    return doc;
  }

  /* Two tabs (say the staff till and the members' portal) can make a receipt in the same few milliseconds, before
     either sees the other's number, and so give both the same one. Once both receipts are in this tab (Club.store
     merges the two saves), the one made first keeps the number; the later one, if this tab made it, takes the next
     free number. Both tabs reach the same verdict, and only the tab that made a receipt renumbers it. */
  const madeHere = {};
  function firstMade(a, b) { return String(a.createdAt || a.at).localeCompare(String(b.createdAt || b.at)) || String(a.id).localeCompare(String(b.id)); }
  function checkNumbers() {
    const ids = Object.keys(madeHere); if (!ids.length) return;
    const now = Date.now(), byNo = {};
    S.all(COLL).forEach(function (r) { (byNo[r.no] = byNo[r.no] || []).push(r); });
    ids.forEach(function (id) {
      if (now - madeHere[id] > 60000) { delete madeHere[id]; return; }
      const r = S.find(COLL, id), same = r ? byNo[r.no] || [] : [];
      if (same.length < 2 || same.slice().sort(firstMade)[0].id === r.id) return;
      S.update(COLL, r.id, { no: label(nextNo(true)) });
    });
  }
  S.subscribe('$external', checkNumbers);

  function newestFirst(a, b) { return String(b.at).localeCompare(String(a.at)) || String(b.no).localeCompare(String(a.no)); }
  function get(id) { return S.find(COLL, id); }
  function forMember(id) { return S.where(COLL, function (r) { return r.memberId === id; }).sort(newestFirst); }
  function forPublic(id) { return S.where(COLL, function (r) { return r.publicPlayerId === id; }).sort(newestFirst); }
  function forRef(source, refId) { return S.where(COLL, function (r) { return r.source === source && r.refId === refId; }).sort(newestFirst); }

  /* ---------------- Markup ---------------- */
  /** A payment on account settles a balance; it is not a sale, so no tax is in it. */
  function taxFree(r) {
    const lines = r.lines || [];
    return r.title === 'Account payment' || (lines.length > 0 && lines.every(function (l) { return l.name === 'Payment on account'; }));
  }
  function when(r) {
    const t = new Date(r.at);
    const sameDay = !isNaN(t) && S.iso(t) === r.date;
    return fmt.date(r.date) + (sameDay ? ', ' + fmt.time(t) : '');
  }
  function html(r) {
    if (!r) return '';
    const credit = r.kind === 'credit';
    const rows = (r.lines || []).map(function (l) {
      const sub = [l.size, l.qty > 1 ? fmt.money(l.price) + ' each' : ''].filter(Boolean).join(' · ');
      return '<tr><td class="rc-qty">' + esc(l.qty) + ' x</td><td class="rc-item">' + esc(l.name) + (sub ? '<span class="rc-sub">' + esc(sub) + '</span>' : '') + '</td>' +
        '<td class="rc-amt">' + esc(fmt.money(l.qty * l.price)) + '</td></tr>';
    }).join('');
    return '<article class="rc' + (credit ? ' rc-credit' : '') + '" data-receipt="' + esc(r.id) + '" aria-label="' + esc((credit ? 'Credit ' : 'Receipt ') + r.no) + '">' +
      '<header class="rc-head">' + Club.logoImg('rc-logo') +
        '<div class="rc-club">' + esc(Club.info.name) + '</div>' +
        '<div class="rc-addr">' + esc(Club.info.address) + '<br>' + esc(Club.info.phone) + '</div></header>' +
      '<div class="rc-titlerow"><h2 class="rc-kind">' + (credit ? 'Credit' : 'Receipt') + '</h2><span class="rc-no">' + esc(r.no) + '</span></div>' +
      '<p class="rc-title">' + esc(r.title) + '</p>' +
      '<dl class="rc-meta"><div><dt>Date</dt><dd>' + esc(when(r)) + '</dd></div><div><dt>' + (credit ? 'Credited to' : 'Customer') + '</dt><dd>' + esc(r.name) + '</dd></div></dl>' +
      '<table class="rc-lines"><thead><tr><th class="rc-qty"><span class="rc-sr">Quantity</span></th><th class="rc-item">Item</th><th class="rc-amt">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="rc-total"><span>' + (credit ? 'Total credit' : 'Total') + '</span><strong>' + esc(fmt.money(r.total)) + '</strong></div>' +
      '<div class="rc-pay"><span>' + (credit ? 'Refund' : 'Payment') + '</span><span>' + esc(r.methodLabel) + '</span></div>' +
      (r.note ? '<p class="rc-note">' + esc(r.note) + '</p>' : '') +
      (taxFree(r) ? '' : '<p class="rc-foot">Taxes included.</p>') +
    '</article>';
  }

  /* ---------------- Modal and print ---------------- */
  function stopPrinting() { document.body.classList.remove('rc-printing'); }
  function open(idOrDoc) {
    const r = typeof idOrDoc === 'string' ? get(idOrDoc) : idOrDoc;
    if (!r) { ui.toast('That receipt is not available', 'bad'); return null; }
    const api = ui.modal({
      eyebrow: r.title, title: (r.kind === 'credit' ? 'Credit ' : 'Receipt ') + r.no, body: html(r),
      actions: [
        { label: 'Close', kind: 'ghost' },
        { label: 'Print or save as PDF', kind: 'primary', icon: 'print', onClick: function () {
          /* Print rules (css/receipts.css) show only the overlay marked rc-overlay while body.rc-printing is set. */
          document.body.classList.add('rc-printing');
          window.addEventListener('afterprint', stopPrinting, { once: true });
          window.print();
          return false;
        } }
      ],
      onClose: stopPrinting
    });
    if (api.duplicate) return api;
    api.el.classList.add('rc-modal');
    if (api.el.parentNode) api.el.parentNode.classList.add('rc-overlay');
    return api;
  }

  /* ---------------- Backfill ---------------- */
  /** When a seeded record happened: its createdAt if that is on its date, else midday on its date. */
  function stamp(x) {
    if (x.createdAt && x.date && S.iso(new Date(x.createdAt)) === x.date) return x.createdAt;
    if (x.date) { const p = String(x.date).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12).toISOString(); }
    return x.createdAt || new Date().toISOString();
  }
  function paymentMethod(p) {
    if (p.method === 'Card') return { method: 'card', methodLabel: p.last4 ? cardLabel(p.brand, p.last4) : (/ending \d{4}/.test(p.reference || '') ? 'Card ' + p.reference.match(/ending \d{4}/)[0] : 'Card') };
    if (p.method === 'Cash') return { method: 'cash', methodLabel: 'Cash' };
    if (p.method === 'ACH') return { method: 'other', methodLabel: 'Pre-authorized debit' };
    if (p.method === 'Check') return { method: 'other', methodLabel: 'Cheque' };
    return { method: 'other', methodLabel: p.method || 'Other' };
  }
  function backfill() {
    if (S.getObj('receiptsBackfilled', false)) return 0;
    const have = S.all(COLL), byCharge = {}, byPay = {};
    have.forEach(function (r) { if (r.chargeId) byCharge[r.chargeId] = 1; if (r.paymentId) byPay[r.paymentId] = 1; });
    const out = [];
    S.all('charges').forEach(function (c) {
      const amt = r2(c.amount); if (!amt || byCharge[c.id]) return;
      byCharge[c.id] = 1;
      const kind = amt < 0 ? 'credit' : 'sale';
      const title = c.title || c.description || 'Account charge';
      out.push(build({ memberId: c.memberId, kind: kind, at: stamp(c), date: c.date, title: title, lines: c.lines || [{ name: c.description || title, qty: 1, price: Math.abs(amt) }],
        total: Math.abs(amt), method: 'account', source: c.source, refId: c.refId, chargeId: c.id }));
    });
    S.all('payments').forEach(function (p) {
      const amt = r2(p.amount); if (amt <= 0 || byPay[p.id]) return;
      byPay[p.id] = 1;
      out.push(build(Object.assign({ memberId: p.memberId, kind: 'sale', at: stamp(p), date: p.date, title: 'Account payment', lines: [{ name: 'Payment on account', qty: 1, price: amt }],
        total: amt, source: 'billing', refId: null, paymentId: p.id }, paymentMethod(p))));
    });
    out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    let n = Math.max(+S.getObj('receiptSeq', 0) || 0, +S.stored('$receiptSeq') || 0);
    /* Ids from the charge or payment: if two tabs backfill at the same moment, their copies merge into one. */
    const docs = out.map(function (d) { n++; return Object.assign({ id: 'rc_' + (d.chargeId ? 'c_' + d.chargeId : 'p_' + d.paymentId), no: label(n) }, d); });
    if (docs.length) { S.setObj('receiptSeq', n); S.replace(COLL, docs.concat(have)); }
    S.setObj('receiptsBackfilled', true);
    return docs.length;
  }
  function autoBackfill() { try { backfill(); } catch (e) { console.error('Receipts backfill failed', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoBackfill); else setTimeout(autoBackfill, 0);

  Club.receipts = { create: create, get: get, forMember: forMember, forPublic: forPublic, forRef: forRef, html: html, open: open, backfill: backfill, cardLabel: cardLabel };
})();
