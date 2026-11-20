/* Settings > Handbook: staff edit the club's Membership Handbook (Club.handbook, js/shared/handbook-data.js), which
   members read in the portal (js/portal/handbook.js) and whose dress code the public site shows.
   Sections are listed by group; each row opens an edit dialog (title, group and the text in simple markup, with a
   live preview). Rows move up and down inside their group, sections can be added and deleted, and "Restore the 2025
   handbook" puts every section back to the club's 2025 text. Every change offers Undo (js/core/undo.js).
   Editing is in English (the staff site is English only). French readers see the club's French translation of each
   section only while it is still the 2025 text; edited and added sections show to them in English until translated.
   settings.js draws this as its "Handbook" tab through Club.handbookAdmin.tab(panel). */
(function () {
  'use strict';
  if (!window.Club || !Club.handbook) return;
  const H = Club.handbook, S = Club.store, U = Club.ui, esc = U.esc;
  const HINT = 'A blank line starts a new paragraph. Start a line with "- " for a bullet, "1. " for a numbered item or "### " for a small heading. Put ** on both sides of words to make them bold.';

  function longDate(iso) { return Club.fmt.toDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function inGroup(g) { return H.list().filter(function (s) { return s.group === g; }); }
  function groupsInUse() {
    const secs = H.list();
    return H.GROUPS.concat(secs.map(function (s) { return s.group; }).filter(function (g, i, a) { return H.GROUPS.indexOf(g) < 0 && a.indexOf(g) === i; }))
      .map(function (g) { return { name: g, secs: secs.filter(function (s) { return s.group === g; }) }; });
  }
  function nextOrder(g) { return inGroup(g).reduce(function (m, s) { return Math.max(m, +s.order || 0); }, 0) + 10; }
  function run(fn, message, undone) { return Club.undo.run(fn, { message: message, undone: undone }); }
  function state(s) {
    const o = H.original(s.id);
    if (!o) return { label: 'Added', french: false };
    if (o.title !== s.title || o.body !== s.body) return { label: 'Edited', french: false };
    return { label: '', french: true };
  }

  /* ---------------- Edit dialog ---------------- */
  function edit(sec, group) {
    const isNew = !sec;
    const start = sec || { group: group || H.GROUPS[0], title: '', body: '' };
    const orig = sec ? H.original(sec.id) : null;
    const groups = groupsInUse().map(function (g) { return g.name; });
    const m = U.modal({
      title: isNew ? 'New handbook section' : 'Edit ' + sec.title, eyebrow: 'Membership handbook', size: 'lg',
      body: '<form class="form-grid hbx-form" novalidate>' +
        U.field({ label: 'Group', name: 'group', type: 'select', options: U.options(groups, start.group), required: true }) +
        U.field({ label: 'Title', name: 'title', value: start.title, required: true, placeholder: 'For example, Pace of play policy' }) +
        '<div class="span-2 hbx-split">' +
          '<div class="field hbx-edit"><label for="hbx-body">Text *</label><textarea class="textarea hbx-body" id="hbx-body" name="body" required spellcheck="true">' + esc(start.body) + '</textarea>' +
            '<span class="field-hint">' + esc(HINT) + '</span></div>' +
          '<div class="hbx-prev-wrap"><div class="label-caps">Preview</div><div class="hb-text hbx-prev" aria-live="polite"></div></div>' +
        '</div>' +
        (orig ? '<p class="span-2 hbx-orig muted">' + (state(sec).label === 'Edited' ? 'This section was changed from the 2025 handbook, so French readers see it in English. ' : 'French readers see the club’s translation of this section. Saving a change shows it to them in English until it is translated. ') +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="hbx-orig">Put back the 2025 text</button></p>'
          : '<p class="span-2 hbx-orig muted">A section added here shows in English to French readers.</p>') +
        '</form>',
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: isNew ? 'Add section' : 'Save section', kind: 'primary', icon: 'check', onClick: function (api) {
          const form = U.$('form', api.body);
          if (!U.validate(form)) return false;
          const d = U.formData(form);
          const body = String(form.body.value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
          if (isNew) {
            const doc = { id: S.uid('hb'), group: d.group, title: d.title, body: body, order: nextOrder(d.group), updatedAt: new Date().toISOString() };
            run(function () { S.insert(H.COLL, doc); }, 'Section added: ' + d.title, d.title + ' removed');
            return true;
          }
          const now = S.find(H.COLL, sec.id); if (!now) { U.toast('This section was deleted in the meantime.', 'bad'); return true; }
          if (now.title === d.title && now.body === body && now.group === d.group) { U.toast('No changes to save'); return true; }
          const patch = { title: d.title, body: body, group: d.group };
          if (d.group !== now.group) patch.order = nextOrder(d.group);
          run(function () { S.update(H.COLL, now.id, patch); }, 'Section saved: ' + d.title, now.title + ' is back as it was');
          return true;
        } }
      ]
    });
    m.el.classList.add('hbx-modal');
    const form = U.$('form', m.body), prev = U.$('.hbx-prev', m.body);
    function preview() { prev.innerHTML = H.html(form.body.value) || '<p class="muted">Nothing to show yet.</p>'; }
    preview();
    form.addEventListener('input', preview);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    U.on(form, 'click', '[data-action=hbx-orig]', function () {
      form.title.value = orig.title; form.body.value = orig.body; preview();
      U.toast('The 2025 text is in the form. Save to keep it.');
    });
    return m;
  }

  /* ---------------- Moving, deleting, restoring ---------------- */
  function move(id, dir) {
    const sec = S.find(H.COLL, id); if (!sec) return;
    const list = inGroup(sec.group), i = list.findIndex(function (s) { return s.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const other = list[j];
    const order = list.map(function (s) { return s.id; });
    order[i] = other.id; order[j] = sec.id;
    run(function () {
      order.forEach(function (sid, k) { const want = (k + 1) * 10, d = S.find(H.COLL, sid); if (d && +d.order !== want) S.update(H.COLL, sid, { order: want }); });
    }, (dir < 0 ? 'Moved up: ' : 'Moved down: ') + sec.title, sec.title + ' is back in its place');
  }
  function del(id) {
    const sec = S.find(H.COLL, id); if (!sec) return;
    U.confirm({ title: 'Delete ' + sec.title + '?', text: 'Members will no longer see this section in the handbook. You can undo this right after, or bring back the 2025 text later with Restore the 2025 handbook.', confirmLabel: 'Delete section', danger: true })
      .then(function (yes) { if (yes) run(function () { S.remove(H.COLL, sec.id); }, sec.title + ' deleted', sec.title + ' restored'); });
  }
  function restore() {
    U.confirm({ title: 'Restore the 2025 handbook?', text: 'Every section goes back to the club’s 2025 text and order. Sections added here are removed and deleted ones come back. You can undo this right after.', confirmLabel: 'Restore the 2025 handbook' })
      .then(function (yes) { if (yes) run(function () { H.restore(); }, 'The 2025 handbook is restored', 'Your handbook edits are back'); });
  }

  /* ---------------- Tab ---------------- */
  function tab(panel) {
    function draw() {
      const groups = groupsInUse().filter(function (g) { return g.secs.length; });
      const secs = H.list();
      const edited = secs.filter(function (s) { return state(s).label === 'Edited'; }).length, added = secs.filter(function (s) { return state(s).label === 'Added'; }).length;
      const removed = H.SEED.filter(function (o) { return !S.find(H.COLL, o.id); }).length;
      const asIs = !edited && !added && !removed && H.SEED.every(function (o) { const s = S.find(H.COLL, o.id); return s && s.group === o.group && +s.order === o.order; });
      const changes = [edited ? edited + ' edited' : '', added ? added + ' added' : '', removed ? removed + ' deleted' : ''].filter(Boolean).join(', ');
      panel.innerHTML = '<div class="hbx">' +
        '<section class="panel hbx-head" data-reveal><div class="panel-head"><div><div class="eyebrow">Membership handbook</div><h3>' + esc(H.META.title) + '</h3></div>' +
          (asIs ? U.badge('As published', 'good') : U.badge('Edited here', 'brass')) + '</div><div class="panel-body">' +
          '<p class="ink-2 hbx-lead">Members read this in the portal under Handbook; the public site shows its dress code. ' + secs.length + ' sections' + (changes ? ' (' + esc(changes) + ')' : '') + '. Last updated ' + esc(longDate(H.lastUpdated())) + '.</p>' +
          '<p class="muted hbx-fr">' + Club.icon('info') + '<span>Edit in English. French readers see the club’s translation of each 2025 section. A section you change or add shows to them in English until it is translated.</span></p>' +
          '<div class="hbx-actions">' + U.btn('Add section', { kind: 'primary', icon: 'plus', action: 'hbx-add' }) +
            '<a class="btn btn-ghost" href="member.html#/handbook" target="_blank" rel="noopener">' + Club.icon('eye') + '<span>View in the portal</span></a>' +
            '<a class="btn btn-ghost" href="' + esc(H.META.pdfUrl) + '" target="_blank" rel="noopener">' + Club.icon('download') + '<span>Download the PDF</span></a>' +
            (asIs ? '' : U.btn('Restore the 2025 handbook', { kind: 'ghost', icon: 'refresh', action: 'hbx-restore' })) +
          '</div></div></section>' +
        (groups.length ? groups.map(function (g) {
          return '<section class="panel hbx-group" data-reveal><div class="panel-head"><div><h3>' + esc(g.name) + '</h3></div><span class="muted hbx-n">' + g.secs.length + ' ' + (g.secs.length === 1 ? 'section' : 'sections') + '</span></div>' +
            '<div class="panel-body flush"><ul class="list hbx-list">' + g.secs.map(function (s, i) {
              const st = state(s);
              return '<li class="hbx-row" data-id="' + esc(s.id) + '">' +
                '<button type="button" class="hbx-main" data-action="hbx-edit" data-id="' + esc(s.id) + '" aria-label="Edit ' + esc(s.title) + '">' +
                  '<span class="hbx-title">' + esc(s.title) + (st.label ? ' ' + U.badge(st.label, 'brass') : '') + (st.french ? '' : ' ' + U.badge('English only', 'outline')) + '</span>' +
                  '<span class="hbx-sum muted">' + esc(H.summary(s.body)) + '</span></button>' +
                '<span class="hbx-acts">' +
                  '<button type="button" class="btn btn-ghost btn-sm hbx-ic" data-action="hbx-up" data-id="' + esc(s.id) + '" title="Move up" aria-label="Move ' + esc(s.title) + ' up"' + (i === 0 ? ' disabled' : '') + '>' + Club.icon('arrowUp') + '</button>' +
                  '<button type="button" class="btn btn-ghost btn-sm hbx-ic" data-action="hbx-down" data-id="' + esc(s.id) + '" title="Move down" aria-label="Move ' + esc(s.title) + ' down"' + (i === g.secs.length - 1 ? ' disabled' : '') + '>' + Club.icon('arrowDown') + '</button>' +
                  '<button type="button" class="btn btn-ghost btn-sm hbx-ic hbx-del" data-action="hbx-del" data-id="' + esc(s.id) + '" title="Delete" aria-label="Delete ' + esc(s.title) + '">' + Club.icon('trash') + '</button>' +
                '</span></li>';
            }).join('') + '</ul></div></section>';
        }).join('') : '<section class="panel">' + U.empty({ icon: 'box', title: 'The handbook is empty', text: 'Add a section, or restore the 2025 handbook.' }) + '</section>') +
        '</div>';
      U.animateIn(panel);
    }
    draw();
    const unsub = S.subscribe(H.COLL, function () { if (document.body.contains(panel)) draw(); });
    U.on(panel, 'click', '[data-action=hbx-add]', function () { edit(null); });
    U.on(panel, 'click', '[data-action=hbx-edit]', function (e, b) { const s = S.find(H.COLL, b.dataset.id); if (s) edit(s); });
    U.on(panel, 'click', '[data-action=hbx-up]', function (e, b) { move(b.dataset.id, -1); });
    U.on(panel, 'click', '[data-action=hbx-down]', function (e, b) { move(b.dataset.id, 1); });
    U.on(panel, 'click', '[data-action=hbx-del]', function (e, b) { del(b.dataset.id); });
    U.on(panel, 'click', '[data-action=hbx-restore]', restore);
    return unsub;
  }

  Club.handbookAdmin = { tab: tab, edit: edit };
})();
