/* Communications: compose member announcements, outbox with engagement, templates and the club notice board.
   Owns collection: announcements. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  /* Data helpers shared with the members' portal and public site: js/shared/communications-data.js */
  const { AUTHOR, audiences, audienceLabel, recipientCount } = Club.shared.communications;

  const CHANNELS = ['Email', 'SMS', 'App'];
  /* Real titles from the club's contact page, used when a message is signed by a named person. */
  const SIGNER_ROLE = { 'Craig Campbell': 'Course Superintendent', 'Steve Wood': 'Director of Golf', 'Carly Dalmyn': 'Director of Clubhouse Operations and Special Events', 'Ian Wong': 'Executive Chef', 'Leslie Filopoulos': 'Controller', 'Tori Sawchyn': 'Administrative Assistant' };
  function signerRole(name) { return SIGNER_ROLE[name] || (name && name !== AUTHOR.name ? 'On behalf of the club' : AUTHOR.role); }
  const SAMPLE_NAME = 'Eleanor';
  function keyFromLabel(label) { const a = audiences().find(function (x) { return x.label === label; }); return a ? a.key : 'all'; }
  function docKey(a) { return a.audienceKey || keyFromLabel(a.audience); }

  /* ---------------- Text formatting (rich-ish body) ---------------- */
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/\{first_name\}/g, '<span class="cm-merge">' + SAMPLE_NAME + '</span>');
  }
  function richBody(text) {
    const blocks = esc(text || '').split(/\n{2,}/);
    return blocks.map(function (b) {
      const lines = b.split('\n');
      if (lines.every(function (l) { return /^\s*-\s+/.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*-\s+/, '')) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  function plain(text) { return String(text || '').replace(/\*\*|\*/g, '').replace(/\{first_name\}/g, SAMPLE_NAME).replace(/^\s*-\s+/gm, '').replace(/\s+/g, ' ').trim(); }
  function smsText(title, body) { return 'St. Boniface GC: ' + (title || 'Your message') + '. ' + plain(body); }

  function crest() { return Club.logoImg('cm-crest'); }
  function mark() { return Club.logo('cm-mark'); }
  function letterHTML(a) {
    const when = a.status === 'sent' && a.sentAt ? a.sentAt : (a.status === 'scheduled' && a.scheduledFor ? a.scheduledFor : new Date().toISOString());
    return '<article class="cm-letter">' +
      '<header class="cm-letterhead">' + crest() + '<div class="cm-lh-name">' + esc(Club.info.name) + '</div><div class="cm-lh-sub">Established ' + esc(Club.info.est) + '</div></header>' +
      '<div class="cm-letter-meta"><span>' + esc(fmt.dateLong(new Date(when))) + '</span><span>To: ' + esc(a.audience || 'All members') + '</span></div>' +
      '<h2 class="cm-letter-title">' + (a.title ? esc(a.title) : '<span class="cm-ph">Your headline appears here</span>') + '</h2>' +
      '<div class="cm-letter-body">' + (a.body ? richBody(a.body) : '<p class="cm-ph">Begin writing and the letter takes shape here, exactly as members will read it.</p>') + '</div>' +
      '<div class="cm-sign"><span>With warm regards,</span><span class="cm-sign-name">' + esc(a.author || AUTHOR.name) + '</span><span class="cm-sign-role">' + esc(signerRole(a.author || AUTHOR.name)) + '</span></div>' +
      '<footer class="cm-letter-foot">' + esc(Club.info.name) + ' · ' + esc(Club.info.address) + ' · ' + esc(Club.info.phone) + '<br>You are receiving this as a member of ' + esc(Club.info.short) + '. Manage your preferences with the club office.</footer>' +
      '</article>';
  }
  function smsHTML(a) {
    const t = smsText(a.title, a.body); const segs = Math.max(1, Math.ceil(t.length / 160));
    return '<div class="cm-phone"><div class="cm-phone-top"><span class="cm-phone-av">' + mark() + '</span><div><div class="person-name">' + esc(Club.info.short) + '</div><div class="person-sub">Text message</div></div></div>' +
      '<div class="cm-bubble">' + esc(t.length > 480 ? t.slice(0, 477) + '...' : t) + '</div>' +
      '<div class="cm-sms-count">' + t.length + ' characters · ' + segs + (segs === 1 ? ' segment' : ' segments') + (segs > 2 ? ' · consider shortening' : '') + '</div></div>';
  }
  function appHTML(a) {
    return '<div class="cm-push-wrap"><div class="cm-push"><div class="cm-push-head"><span class="cm-push-icon">' + mark() + '</span><span>' + esc(Club.info.short) + '</span><span class="cm-push-time">now</span></div>' +
      '<div class="cm-push-title">' + esc(a.title || 'Your headline') + '</div><div class="cm-push-body">' + esc(plain(a.body) || 'Message preview') + '</div></div>' +
      '<p class="muted cm-push-note">Appears on the member app home screen and notice board.</p></div>';
  }

  /* ---------------- Templates ---------------- */
  const TEMPLATES = [
    { id: 'frost', category: 'Course', icon: 'cloud', title: 'Frost delay: first tee times moved back', audienceKey: 'golf', channels: ['SMS', 'App'], author: 'Craig Campbell',
      body: 'Good morning {first_name},\n\nFrost has settled on the course overnight. To protect the greens, the **first tee time is moved back until the frost lifts**. All later times will shift in order and the Golf Shop will confirm your new time.\n\nCoffee and breakfast are on at the Gallery Taphouse & Grill while you wait. Breakfast is served until 2 PM.' },
    { id: 'closure', category: 'Course', icon: 'course', title: 'Course closure for maintenance', audienceKey: 'all', channels: ['Email', 'App'], author: 'Craig Campbell',
      body: 'Dear {first_name},\n\nThe course will be **closed on Monday and Tuesday** while our grounds crew carries out greens aeration and topdressing.\n\n- The short game practice facility remains open\n- The Gallery Taphouse & Grill is open for breakfast, lunch and dinner as usual\n- Tee time bookings resume Wednesday morning\n\nThank you for your patience. The greens will be at their best for the weeks ahead.' },
    { id: 'pizza', category: 'Dining', icon: 'dining', title: 'Friday night pizza at the Gallery', audienceKey: 'all', channels: ['Email', 'App'],
      body: 'Dear {first_name},\n\nOur famous **Friday night pizza menu** is on again this week at the Gallery Taphouse & Grill, upstairs overlooking the 18th hole.\n\nPair it with one of our 6 local beers on tap, including the house feature tap. Members enjoy Gallery member pricing. Call the club at (204) 233-2497 to reserve a table.' },
    { id: 'invite', category: 'Events', icon: 'events', title: 'You are invited: a club social night', audienceKey: 'all', channels: ['Email', 'App'],
      body: 'Dear {first_name},\n\nJoin fellow members and friends for *a relaxed evening of good food and good company* in the Banquet Hall.\n\n- Doors open at 6:00 PM\n- Dinner served at 7:00 PM\n- Guests are welcome\n\nSpace is limited. Reply to this message or call the club office at (204) 233-2497 to reserve your seats.' },
    { id: 'dues', category: 'Billing', icon: 'billing', title: 'A reminder: your dues instalment', audienceKey: 'all', channels: ['Email'],
      body: 'Dear {first_name},\n\nThis is a friendly reminder that your next **dues instalment** is coming up. Yearly dues can be paid in instalments from sign-up until August, and your monthly statement shows the amount due.\n\nIf you have any questions about your house account, please call the club office at (204) 233-2497.' },
    { id: 'welcome', category: 'Membership', icon: 'members', title: 'Welcome to St. Boniface Golf Club', audienceKey: 'all', channels: ['Email'],
      body: 'Dear {first_name},\n\nWelcome to St. Boniface Golf Club. We are so glad you have joined us for the private club experience without the private club price.\n\nAs a first-time member you receive our **new member bonus**: a one-time credit of 50% of your annual dues, with 25% for club purchases in your first season and 25% toward your share and initiation fee in year two.\n\n- Book tee times up to your category’s advance booking window\n- Enjoy Pro Shop discounts and Gallery member pricing\n- Join the members’ league and club events\n\nWe look forward to seeing you on the course and in the clubhouse.' },
    { id: 'teetime', category: 'Golf', icon: 'teesheet', title: 'Tee time reminder', audienceKey: 'golf', channels: ['SMS', 'App'],
      body: 'Hi {first_name}, a reminder of your tee time tomorrow at St. Boniface. Please arrive a little early and check in at the Golf Shop. Soft spikes only, and the dress code applies to members and guests. Need to change it? Call (204) 233-2497.' }
  ];

  /** Promote scheduled messages whose time has passed. */
  function processDue() {
    const now = new Date().toISOString();
    S.all('announcements').filter(function (a) { return a.status === 'scheduled' && a.scheduledFor && a.scheduledFor <= now; }).forEach(function (a) {
      S.update('announcements', a.id, { status: 'sent', sentAt: a.scheduledFor, recipients: recipientCount(docKey(a)), opens: 0, clicks: 0 });
    });
  }

  /* ---------------- Module state ---------------- */
  let tab = 'compose';
  let outFilter = 'all';
  const OUT_PAGE = 10; let outLimit = OUT_PAGE;
  let previewMode = 'Email';
  let draft = blankDraft();
  function blankDraft() { return { id: null, title: '', body: '', audienceKey: 'all', channels: ['Email', 'App'], mode: 'now', scheduledFor: '' }; }
  function localInput(iso) { const d = new Date(iso); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }
  function defaultSchedule() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return localInput(d.toISOString()); }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function when(a) { return a.status === 'sent' ? a.sentAt : a.status === 'scheduled' ? a.scheduledFor : (a.updatedAt || a.createdAt); }
  function dt(iso) { if (!iso) return ''; const d = new Date(iso); return fmt.dateShort(d) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function chanBadges(list) { return '<span class="cm-chans">' + (list || []).map(function (c) { return '<span class="cm-chan">' + esc(c) + '</span>'; }).join('') + '</span>'; }
  function statusBadge(s) { return ui.badge(s.charAt(0).toUpperCase() + s.slice(1), { draft: 'outline', scheduled: 'info', sent: 'good' }[s] || 'plain'); }

  let host = null; let tabsApi = null;
  function goTab(id) { tab = id; if (tabsApi) tabsApi.activate(id); }

  /* ---------------- Undo (js/core/undo.js) ----------------
     Saving, un-scheduling and deleting offer Undo on their toast. o.guard() may return a reason the undo cannot run
     now (undo.js has no hook for that); o.after() may return the message to show once undone. Sent messages have no
     undo: the confirmation before sending stays. */
  function here() { return /^#\/communications(\/|$)/.test(location.hash); }
  function redraw(toTab) {
    if (!here()) { if (toTab) tab = toTab; return; }
    if (toTab) { try { history.replaceState(null, '', '#/communications/' + toTab); } catch (e) { /* ignore */ } }
    Club.app.render();
  }
  /** o: { guard(), after() (redraws; may return the undone message), undone } */
  function offerUndo(msg, rec, o) {
    o = o || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg); return; }
    ui.toast(msg, '', { action: { label: 'Undo', onClick: function () {
      const why = o.guard && o.guard();
      if (why) { ui.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      let said = null;
      try { if (o.after) said = o.after(); else redraw(); } catch (e) { console.error(e); }
      ui.toast(said || o.undone || 'Undone');
    } } });
  }
  function copyDraft() { return JSON.parse(JSON.stringify(draft)); }
  /** Loading a template or a copy, or clearing, replaces the composer text. Undo puts the earlier text back while the
      composer is untouched since, and returns to fromTab when there was no earlier text. */
  function offerDraftUndo(msg, prev, fromTab) {
    const loaded = JSON.stringify(draft), had = !!(prev.title || prev.body);
    ui.toast(msg, '', { action: { label: 'Undo', onClick: function () {
      if (JSON.stringify(draft) !== loaded) { ui.toast('The composer has changed since, so it can no longer be undone here.', 'bad'); return; }
      draft = prev; redraw(had ? 'compose' : (fromTab || 'compose'));
      ui.toast(had ? 'Earlier text is back in the composer' : 'Composer emptied');
    } } });
  }

  /* ---------------- Compose ---------------- */
  function renderCompose(panel) {
    const d = draft;
    const audOpts = audiences().map(function (a) { return { value: a.key, label: a.label }; });
    panel.innerHTML = '<div class="cm-compose">' +
      '<form class="panel cm-form" novalidate data-reveal><div class="panel-head"><div><h3>' + (d.id ? 'Edit message' : 'New message') + '</h3><div class="person-sub">' + (d.id ? 'Editing a saved ' + esc((S.find('announcements', d.id) || {}).status || 'draft') : 'Write once, send by email, text and the member app') + '</div></div>' +
      (d.id || d.title || d.body ? ui.btn('Clear', { kind: 'ghost', sm: true, icon: 'close', action: 'clear' }) : '') + '</div><div class="panel-body">' +
      ui.field({ label: 'Title', name: 'title', value: d.title, required: true, placeholder: 'e.g. Frost delay: first tee moved to 9:30 AM' }) +
      '<div class="field"><label for="cm_body">Message *</label><div class="cm-toolbar" role="toolbar" aria-label="Formatting">' +
      '<button type="button" class="cm-tool" data-fmt="bold" title="Bold" aria-label="Bold"><strong>B</strong></button>' +
      '<button type="button" class="cm-tool" data-fmt="italic" title="Italic" aria-label="Italic"><em>I</em></button>' +
      '<button type="button" class="cm-tool" data-fmt="list" title="Bulleted list" aria-label="Bulleted list">' + Club.icon('menu') + '</button>' +
      '<button type="button" class="cm-tool cm-tool-wide" data-fmt="name" title="Insert first name">First name</button>' +
      '</div>' +
      '<textarea class="textarea cm-body" id="cm_body" name="body" required rows="9" placeholder="Dear {first_name},">' + esc(d.body) + '</textarea><span class="field-hint">Wrap text in **double asterisks** for bold or *single* for italic. Lines starting with a dash become a list.</span></div>' +
      '<div class="cm-aud-row">' +
      '<div class="field"><label for="cm_aud">Audience</label><select class="select" id="cm_aud" name="audienceKey">' + ui.options(audOpts, d.audienceKey) + '</select><span class="field-hint cm-reach"></span></div>' +
      '<div class="field"><label>Channels</label><div class="cm-chan-picks" data-name="channels">' + CHANNELS.map(function (c) { return '<label class="check cm-pick"><input type="checkbox" name="ch_' + c + '" value="' + c + '"' + (d.channels.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + c + '</span></label>'; }).join('') + '</div></div>' +
      '</div>' +
      '<div class="field"><label>Delivery</label>' + ui.segmented([{ value: 'now', label: 'Send now' }, { value: 'schedule', label: 'Schedule' }], d.mode, 'mode') + '</div>' +
      '<div class="cm-sched"' + (d.mode === 'schedule' ? '' : ' hidden') + '>' + ui.field({ label: 'Send on', name: 'scheduledFor', type: 'datetime-local', value: d.scheduledFor || defaultSchedule() }) + '</div>' +
      '</div><div class="cm-form-foot">' + ui.btn('Save draft', { kind: 'ghost', icon: 'edit', action: 'save-draft' }) + '<span class="cm-foot-spacer"></span>' +
      '<button type="button" class="btn btn-primary cm-send" data-action="send">' + Club.icon('send') + '<span>' + (d.mode === 'schedule' ? 'Schedule message' : 'Send now') + '</span></button></div></form>' +
      '<aside class="cm-preview" data-reveal><div class="cm-preview-bar"><span class="eyebrow">Live preview</span>' + ui.segmented(CHANNELS.map(function (c) { return { value: c, label: c }; }), previewMode, 'preview') + '</div><div class="cm-preview-host"></div></aside>' +
      '</div>';
    const form = ui.$('form', panel);
    function read() {
      const f = ui.formData(form);
      draft.title = f.title; draft.body = ui.$('[name=body]', form).value; draft.audienceKey = f.audienceKey;
      draft.channels = CHANNELS.filter(function (c) { return f['ch_' + c]; });
      if (f.scheduledFor != null) draft.scheduledFor = f.scheduledFor;
    }
    function refresh() {
      read();
      const n = recipientCount(draft.audienceKey);
      ui.$('.cm-reach', form).innerHTML = 'Reaches <strong>' + fmt.num(n) + '</strong> ' + (draft.audienceKey === 'staff' ? 'staff' : (n === 1 ? 'member' : 'members')) + (draft.audienceKey === 'staff' ? '' : '. Excludes suspended accounts.');
      const a = { title: draft.title, body: draft.body, audience: audienceLabel(draft.audienceKey), author: draft.author || AUTHOR.name, status: 'draft' };
      ui.$('.cm-preview-host', panel).innerHTML = previewMode === 'SMS' ? smsHTML(a) : previewMode === 'App' ? appHTML(a) : letterHTML(a);
      ui.$('.cm-preview', panel).classList.toggle('cm-off', draft.channels.indexOf(previewMode) < 0);
    }
    function wrapSel(before, after) {
      const ta = ui.$('[name=body]', form); const s = ta.selectionStart, e = ta.selectionEnd; const v = ta.value;
      const sel = v.slice(s, e) || 'text';
      ta.value = v.slice(0, s) + before + sel + after + v.slice(e);
      ta.focus(); ta.setSelectionRange(s + before.length, s + before.length + sel.length); refresh();
    }
    ui.on(panel, 'click', '.cm-tool', function (e, b) {
      const ta = ui.$('[name=body]', form);
      if (b.dataset.fmt === 'bold') wrapSel('**', '**');
      else if (b.dataset.fmt === 'italic') wrapSel('*', '*');
      else if (b.dataset.fmt === 'name') { const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '{first_name}' + ta.value.slice(ta.selectionEnd); ta.focus(); ta.setSelectionRange(s + 12, s + 12); refresh(); }
      else if (b.dataset.fmt === 'list') {
        const s = ta.selectionStart, v = ta.value; const ls = v.lastIndexOf('\n', s - 1) + 1;
        ta.value = v.slice(0, ls) + '- ' + v.slice(ls); ta.focus(); ta.setSelectionRange(s + 2, s + 2); refresh();
      }
    });
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    ui.on(panel, 'click', '.cm-form .segmented button', function (e, b) {
      draft.mode = b.dataset.value;
      ui.$$('.cm-form .segmented button', panel).forEach(function (x) { x.classList.toggle('active', x === b); });
      const sc = ui.$('.cm-sched', panel); sc.hidden = draft.mode !== 'schedule';
      if (draft.mode === 'schedule') { const inp = ui.$('[name=scheduledFor]', sc); if (!inp.value) inp.value = defaultSchedule(); }
      ui.$('.cm-send span', panel).textContent = draft.mode === 'schedule' ? 'Schedule message' : 'Send now';
    });
    ui.on(panel, 'click', '.cm-preview .segmented button', function (e, b) {
      previewMode = b.dataset.value; ui.$$('.cm-preview .segmented button', panel).forEach(function (x) { x.classList.toggle('active', x === b); }); refresh();
    });
    ui.on(panel, 'click', '[data-action=clear]', function () {
      read(); const prev = copyDraft();
      draft = blankDraft(); goTab('compose');
      if (prev.title || prev.body) offerDraftUndo('Composer cleared', prev);
    });
    ui.on(panel, 'click', '[data-action=save-draft]', function () {
      read();
      clearErrs(form);
      if (!draft.title) { fieldErr(form, 'title', 'Give the draft a title so you can find it later.'); ui.$('[name=title]', form).focus(); return; }
      /* Undo puts the saved record back as it was and the text back in the composer (if the composer is empty) */
      const prev = copyDraft();
      const rec = Club.undo.track(function () { saveDoc('draft'); });
      draft = blankDraft(); goTab('outbox');
      offerUndo('Draft saved', rec, { after: function () {
        if (draft.id || draft.title || draft.body) { redraw(); return 'Draft save undone'; }
        draft = prev; redraw('compose'); return 'Draft save undone. The text is back in the composer';
      } });
    });
    ui.on(panel, 'click', '[data-action=send]', async function () {
      read(); clearErrs(form);
      let ok = ui.validate(form);
      if (!draft.channels.length) { ok = false; ui.$('.cm-chan-picks', form).insertAdjacentHTML('afterend', '<span class="field-error">Choose at least one channel.</span>'); }
      if (draft.mode === 'schedule') {
        const v = draft.scheduledFor; const t = v ? new Date(v) : null;
        if (!t || isNaN(t)) { ok = false; fieldErr(form, 'scheduledFor', 'Choose a date and time to send.'); }
        else if (t <= new Date()) { ok = false; fieldErr(form, 'scheduledFor', 'Choose a time in the future.'); }
      }
      const n = recipientCount(draft.audienceKey);
      if (ok && !n) { ok = false; fieldErr(form, 'audienceKey', 'This audience has no recipients.'); }
      if (!ok) return;
      const chans = draft.channels.join(draft.channels.length === 2 ? ' and ' : ', ');
      const sched = draft.mode === 'schedule';
      const yes = await ui.confirm({ title: sched ? 'Schedule this message?' : 'Send this message now?', text: '"' + draft.title + '" will ' + (sched ? 'go out on ' + dt(new Date(draft.scheduledFor).toISOString()) + ' to ' : 'go to ') + fmt.num(n) + ' recipients (' + audienceLabel(draft.audienceKey) + ') by ' + chans + '.', confirmLabel: sched ? 'Schedule message' : 'Send now' });
      if (!yes) return;
      if (sched && Club.undo) {
        /* Scheduling can be taken back (nothing has gone out yet): Undo returns the message to the composer as it was. */
        const was = Object.assign({}, draft, { channels: draft.channels.slice() });
        const rec = Club.undo.track(function () { return saveDoc('scheduled'); });
        Club.undo.offer('Message scheduled', rec, { after: function () { draft = was; goTab('compose'); }, undone: 'Schedule cancelled. The message is back in the composer' });
      } else {
        saveDoc(sched ? 'scheduled' : 'sent');
        ui.toast(sched ? 'Message scheduled' : 'Message sent to ' + fmt.num(n) + ' recipients');
      }
      draft = blankDraft(); outFilter = 'all'; goTab('outbox');
    });
    refresh();
  }
  function fieldErr(form, name, msg) { const f = form.querySelector('[name="' + name + '"]'); if (!f) return; f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>'); }
  function clearErrs(form) { ui.$$('.field-error', form).forEach(function (e) { e.remove(); }); ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); }); }

  function saveDoc(status) {
    const n = recipientCount(draft.audienceKey);
    const doc = {
      title: draft.title, body: draft.body, audience: audienceLabel(draft.audienceKey), audienceKey: draft.audienceKey, channels: draft.channels.slice(), status: status,
      scheduledFor: status === 'scheduled' ? new Date(draft.scheduledFor).toISOString() : null,
      sentAt: status === 'sent' ? new Date().toISOString() : null, author: draft.author || AUTHOR.name,
      recipients: status === 'sent' ? n : 0, opens: 0, clicks: 0
    };
    if (draft.id && S.find('announcements', draft.id)) return S.update('announcements', draft.id, doc);
    return S.insert('announcements', Object.assign({ id: S.uid('ann') }, doc));
  }
  function loadIntoComposer(a, asCopy) {
    draft = { id: asCopy ? null : a.id, author: a.author || '', title: asCopy ? a.title + ' (copy)' : a.title, body: a.body || '', audienceKey: docKey(a), channels: (a.channels || []).slice(), mode: !asCopy && a.status === 'scheduled' ? 'schedule' : 'now', scheduledFor: !asCopy && a.scheduledFor ? localInput(a.scheduledFor) : '' };
    goTab('compose');
  }

  /* ---------------- Outbox ---------------- */
  function renderOutbox(panel) {
    const all = S.all('announcements').slice().sort(function (a, b) {
      const o = { draft: 0, scheduled: 1, sent: 2 };
      if (a.status !== b.status) return o[a.status] - o[b.status];
      return a.status === 'scheduled' ? String(a.scheduledFor).localeCompare(String(b.scheduledFor)) : String(when(b)).localeCompare(String(when(a)));
    });
    const counts = { all: all.length, draft: 0, scheduled: 0, sent: 0 };
    all.forEach(function (a) { counts[a.status] = (counts[a.status] || 0) + 1; });
    const full = outFilter === 'all' ? all : all.filter(function (a) { return a.status === outFilter; });
    const list = full.slice(0, outLimit);
    panel.innerHTML = '<div class="cm-out-bar">' + ui.segmented([{ value: 'all', label: 'All ' + counts.all }, { value: 'draft', label: 'Drafts ' + counts.draft }, { value: 'scheduled', label: 'Scheduled ' + counts.scheduled }, { value: 'sent', label: 'Sent ' + counts.sent }], outFilter, 'out') +
      ui.btn('New message', { kind: 'primary', icon: 'plus', sm: true, action: 'new' }) + '</div>' +
      (list.length ? '<div class="panel cm-out" data-reveal><div class="cm-out-head"><span>Message</span><span>Status</span><span class="num">Recipients</span><span>Opened</span><span>Clicked</span><span></span></div>' + list.map(function (a) {
        const op = pct(a.opens, a.recipients), cl = pct(a.clicks, a.recipients); const sent = a.status === 'sent';
        const fresh = sent && !a.opens && (Date.now() - new Date(a.sentAt).getTime()) < 86400000;
        /* The row opens the message on a click; for the keyboard the title is the button (a row that is itself a
           button cannot hold the Edit, Duplicate and Delete buttons). */
        return '<div class="cm-out-row s-' + a.status + '" data-id="' + esc(a.id) + '">' +
          '<div class="cm-out-main"><button type="button" class="cm-out-title" aria-label="' + esc('Open ' + (a.title || 'Untitled draft')) + '">' + esc(a.title || 'Untitled draft') + '</button><div class="person-sub">' + esc(a.audience || '') + ' · ' + chanBadges(a.channels) + '</div></div>' +
          '<div class="cm-out-status">' + statusBadge(a.status) + '<div class="person-sub">' + esc(a.status === 'draft' ? 'Edited ' + fmt.relative(when(a)).toLowerCase() : dt(when(a))) + '</div></div>' +
          '<div class="cm-out-rec num"><span class="cm-out-label">Recipients</span>' + (sent ? fmt.num(a.recipients) : '<span class="muted">' + fmt.num(recipientCount(docKey(a))) + ' est.</span>') + '</div>' +
          '<div class="cm-out-rate"><span class="cm-out-label">Opened</span>' + (sent ? (fresh ? '<span class="muted cm-await">Awaiting opens</span>' : '<div class="cm-rate"><div class="bar"><span style="width:' + op + '%"></span></div><span class="num">' + op + '%</span></div>') : '<span class="muted">–</span>') + '</div>' +
          '<div class="cm-out-rate"><span class="cm-out-label">Clicked</span>' + (sent ? (fresh ? '<span class="muted">–</span>' : '<div class="cm-rate"><div class="bar brass"><span style="width:' + cl + '%"></span></div><span class="num">' + cl + '%</span></div>') : '<span class="muted">–</span>') + '</div>' +
          '<div class="cm-out-actions">' +
          (a.status !== 'sent' ? ui.btn('', { kind: 'ghost', sm: true, icon: 'edit', action: 'edit', id: a.id, title: 'Edit' }) : '') +
          ui.btn('', { kind: 'ghost', sm: true, icon: 'refresh', action: 'dup', id: a.id, title: 'Duplicate' }) +
          (a.status === 'scheduled' ? ui.btn('', { kind: 'ghost', sm: true, icon: 'clock', action: 'unschedule', id: a.id, title: 'Cancel schedule' }) : '') +
          ui.btn('', { kind: 'ghost', sm: true, icon: 'trash', action: 'del', id: a.id, title: 'Delete' }) +
          '</div></div>';
      }).join('') + (full.length > list.length ? '<div class="cm-out-more"><button type="button" class="btn btn-sm" data-action="out-more">Show ' + Math.min(OUT_PAGE, full.length - list.length) + ' more</button><span class="muted">' + list.length + ' of ' + full.length + ' messages</span></div>' : '') + '</div>'
        : ui.empty({ icon: 'mail', title: outFilter === 'all' ? 'No messages yet' : 'No ' + (outFilter === 'draft' ? 'drafts' : outFilter + ' messages'), text: 'Compose a message or start from a template.', action: ui.btn('Compose message', { kind: 'primary', icon: 'plus', action: 'new' }) }));
    ui.on(panel, 'click', '.cm-out-bar .segmented button', function (e, b) { outFilter = b.dataset.value; outLimit = OUT_PAGE; goTab('outbox'); });
    ui.on(panel, 'click', '[data-action=out-more]', function () {
      const n = list.length; outLimit += OUT_PAGE; renderOutbox(panel); ui.animateIn(panel);
      const r = ui.$$('.cm-out-row .cm-out-title', panel)[n]; if (r) r.focus();
    });
    ui.on(panel, 'click', '[data-action=new]', function () { draft = blankDraft(); goTab('compose'); });
    ui.on(panel, 'click', '.cm-out-row', async function (e, r) {
      const btn = e.target.closest('[data-action]');
      const a = S.find('announcements', r.dataset.id); if (!a) return;
      if (!btn) { viewMessage(a.id, panel); return; }
      e.stopPropagation();
      await rowAction(btn.dataset.action, a, panel);
    });
  }
  async function rowAction(act, a, panel) {
    if (act === 'edit') loadIntoComposer(a, false);
    else if (act === 'dup') { const prev = copyDraft(), from = tab; loadIntoComposer(a, true); offerDraftUndo('Copied into the composer', prev, from); }
    else if (act === 'unschedule') {
      if (await ui.confirm({ title: 'Cancel scheduled send?', text: '"' + a.title + '" will move back to drafts and will not be sent.', confirmLabel: 'Cancel schedule' })) {
        const at = a.scheduledFor;
        const rec = Club.undo.track(function () { S.update('announcements', a.id, { status: 'draft', scheduledFor: null }); });
        goTab('outbox');
        /* Undo schedules it again, but only while its send time is still ahead */
        offerUndo('Schedule cancelled, saved as draft', rec, { undone: 'Scheduled again for ' + dt(at),
          guard: function () { return at && new Date(at) <= new Date() ? 'Its send time has passed. Schedule it again from the composer.' : ''; } });
      }
    } else if (act === 'del') {
      if (await ui.confirm({ title: 'Delete message?', text: a.status === 'sent' ? 'This removes "' + a.title + '" and its engagement history from the outbox. Members who received it keep their copy.' : '"' + a.title + '" will be deleted.', confirmLabel: 'Delete message', danger: true })) {
        const rec = Club.undo.track(function () { S.remove('announcements', a.id); });
        if (draft.id === a.id) draft = blankDraft();
        goTab('outbox');
        offerUndo('Message deleted', rec, { undone: 'Message restored' });
      }
    }
  }
  function viewMessage(id, panel) {
    const a = S.find('announcements', id); if (!a) return;
    const sent = a.status === 'sent';
    const body = '<div class="cm-view-stats">' +
      '<div><span class="label-caps">Recipients</span><span class="cm-stat-num">' + fmt.num(sent ? a.recipients : recipientCount(docKey(a))) + '</span></div>' +
      '<div><span class="label-caps">Opened</span><span class="cm-stat-num">' + (sent ? pct(a.opens, a.recipients) + '%' : '–') + '</span></div>' +
      '<div><span class="label-caps">Clicked</span><span class="cm-stat-num">' + (sent ? pct(a.clicks, a.recipients) + '%' : '–') + '</span></div></div>' +
      '<dl class="kv cm-view-kv"><dt>Status</dt><dd>' + statusBadge(a.status) + '</dd><dt>' + (sent ? 'Sent' : a.status === 'scheduled' ? 'Scheduled for' : 'Last edited') + '</dt><dd>' + esc(dt(when(a))) + '</dd><dt>Audience</dt><dd>' + esc(a.audience) + '</dd><dt>Channels</dt><dd>' + chanBadges(a.channels) + '</dd><dt>Author</dt><dd>' + esc(a.author || AUTHOR.name) + '</dd></dl>' +
      '<div class="cm-view-letter">' + letterHTML(a) + '</div>';
    const actions = [{ label: 'Duplicate', kind: 'ghost', icon: 'refresh', onClick: function () { const prev = copyDraft(), from = tab; loadIntoComposer(a, true); offerDraftUndo('Copied into the composer', prev, from); } }];
    if (!sent) actions.push({ label: 'Edit', kind: 'primary', icon: 'edit', onClick: function () { loadIntoComposer(a, false); } });
    ui.drawer({ title: a.title, eyebrow: a.status === 'sent' ? 'Sent message' : a.status === 'scheduled' ? 'Scheduled message' : 'Draft', body: body, actions: actions });
  }

  /* ---------------- Templates ---------------- */
  function renderTemplates(panel) {
    panel.innerHTML = '<p class="cm-intro">Reusable letters for the moments that come round each season. Choose one to fill the composer, then adjust the details.</p>' +
      '<div class="cm-tpl-grid">' + TEMPLATES.map(function (t) {
        return '<article class="panel cm-tpl" data-reveal><div class="cm-tpl-top"><span class="cm-tpl-icon">' + Club.icon(t.icon) + '</span><span class="eyebrow">' + esc(t.category) + '</span></div>' +
          '<h3>' + esc(t.title) + '</h3><p class="cm-tpl-ex">' + esc(plain(t.body).slice(0, 150)) + '...</p>' +
          '<div class="cm-tpl-foot"><span class="person-sub">' + esc(audienceLabel(t.audienceKey)) + ' · ' + chanBadges(t.channels) + '</span>' + ui.btn('Use template', { sm: true, kind: 'primary', action: 'use', id: t.id }) + '</div></article>';
      }).join('') + '</div>';
    ui.on(panel, 'click', '[data-action=use]', async function (e, b) {
      const t = TEMPLATES.find(function (x) { return x.id === b.dataset.id; }); if (!t) return;
      if ((draft.title || draft.body) && !(await ui.confirm({ title: 'Replace the current draft?', text: 'The composer has unsaved text. Using this template will replace it.', confirmLabel: 'Use template' }))) return;
      const prev = copyDraft();
      draft = { id: null, author: t.author || '', title: t.title, body: t.body, audienceKey: t.audienceKey, channels: t.channels.slice(), mode: 'now', scheduledFor: '' };
      goTab('compose');
      offerDraftUndo('Template loaded into the composer', prev, 'templates');
    });
  }

  /* ---------------- Notice board ---------------- */
  function renderNotices(panel) {
    let cs = null; try { cs = Club.store.getObj('courseStatus', null); } catch (e) { cs = null; }
    const wx = Club.weather && Club.weather.today;
    const holes = cs && Array.isArray(cs.holes) ? cs.holes : [];
    const closed = holes.filter(function (h) { return h && h.status === 'closed'; }).map(function (h) { return h.number; });
    const gur = holes.filter(function (h) { return h && h.status === 'GUR'; }).map(function (h) { return h.number; });
    const course = '<section class="panel dark cm-course" data-reveal><div class="panel-head"><div><div class="eyebrow">' + (cs ? '<span class="live-dot"></span> Posted ' + esc(cs.updatedAt ? dt(cs.updatedAt) : 'today') : 'Course status') + '</div><h3>Today on the course</h3></div>' +
      (wx ? '<div class="cm-wx">' + Club.icon(wx.icon) + '<span><strong>' + esc(wx.hi) + '°</strong> ' + esc(wx.cond) + '</span></div>' : '') + '</div><div class="panel-body">' +
      (cs ? '<div class="cm-course-state ' + (cs.open === false ? 'closed' : 'open') + '"><span class="cm-course-big">' + (cs.open === false ? 'Course closed' : 'Course open') + '</span></div>' +
        (cs.message ? '<p class="cm-course-msg">' + esc(cs.message) + '</p>' : '') +
        '<dl class="cm-course-kv">' +
        '<div><dt>Carts</dt><dd>' + esc(cs.cartRule || 'Normal') + '</dd></div>' +
        '<div><dt>Green speed</dt><dd>' + esc(cs.greenSpeed != null && cs.greenSpeed !== '' ? cs.greenSpeed : '–') + '</dd></div>' +
        '<div><dt>Firmness</dt><dd>' + esc(cs.firmness || '–') + '</dd></div>' +
        '<div><dt>Pins</dt><dd>' + esc(cs.pins || '–') + '</dd></div></dl>' +
        (closed.length || gur.length ? '<p class="cm-course-holes">' + (closed.length ? 'Closed: hole' + (closed.length > 1 ? 's ' : ' ') + closed.join(', ') + '. ' : '') + (gur.length ? 'Ground under repair on ' + gur.join(', ') + '.' : '') + '</p>' : '<p class="cm-course-holes">All eighteen holes in play.</p>')
        : '<p class="cm-course-msg">The superintendent has not posted today’s course report yet.</p><a class="btn btn-brass btn-sm" href="#/course">Open Course &amp; Grounds</a>') +
      (cs ? '<div class="cm-course-actions">' + ui.btn('Notify golfers', { kind: 'brass', sm: true, icon: 'send', action: 'notify-course' }) + '</div>' : '') +
      '</div></section>';
    const since = Date.now() - 14 * 86400000;
    const recent = S.all('announcements').filter(function (a) { return a.status === 'sent' && a.sentAt && new Date(a.sentAt).getTime() >= since && a.audienceKey !== 'staff' && a.audienceKey !== 'board'; })
      .sort(function (a, b) { return b.sentAt.localeCompare(a.sentAt); }).slice(0, 6);
    const soon = S.all('announcements').filter(function (a) { return a.status === 'scheduled'; }).sort(function (a, b) { return String(a.scheduledFor).localeCompare(String(b.scheduledFor)); });
    let evs = [];
    try { const t0 = Club.date.today(), t14 = Club.date.fromToday(14); evs = S.all('events').filter(function (e) { return e && e.status === 'published' && e.date >= t0 && e.date <= t14; }).sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }).slice(0, 5); } catch (e) { evs = []; }
    panel.innerHTML = '<div class="cm-board">' +
      '<div class="cm-board-side">' + course +
      '<div class="panel" data-reveal><div class="panel-head"><h3>Coming up at the club</h3><a href="#/events" class="s-link">Calendar</a></div>' +
      (evs.length ? '<ul class="list cm-evs">' + evs.map(function (e) { const d = fmt.toDate(e.date); return '<li><a href="#/events/' + esc(e.id) + '" class="cm-ev"><span class="cm-ev-date"><span class="cm-ev-day">' + d.getDate() + '</span><span class="cm-ev-mon">' + esc(d.toLocaleDateString('en-US', { month: 'short' })) + '</span></span><span style="min-width:0"><span class="person-name">' + esc(e.title) + '</span><span class="person-sub">' + esc(fmt.weekday(e.date) + ' · ' + fmt.time(e.start) + ' · ' + e.venue) + '</span></span></a></li>'; }).join('') + '</ul>'
        : '<div class="panel-body"><p class="muted" style="margin:0">No published events in the next two weeks.</p></div>') + '</div></div>' +
      '<div class="cm-board-main">' +
      '<div class="cm-board-title"><h2>Notice board</h2><span class="muted">Pinned for members in the clubhouse and app</span></div>' +
      (recent.length ? '<div class="cm-notes">' + recent.map(function (a, i) {
        return '<article class="cm-note" data-reveal><div class="cm-note-meta">' + esc(fmt.relative(a.sentAt.slice(0, 10)) + ' · ' + a.audience) + '</div><h4>' + esc(a.title) + '</h4><p>' + esc(plain(a.body).slice(0, 170)) + (plain(a.body).length > 170 ? '...' : '') + '</p><button type="button" class="cm-note-more" data-view="' + esc(a.id) + '">Read notice</button></article>';
      }).join('') + '</div>' : ui.empty({ icon: 'bell', title: 'The board is clear', text: 'Messages sent to members in the last two weeks are pinned here.' })) +
      (soon.length ? '<div class="panel cm-soon" data-reveal><div class="panel-head"><h3>Going out soon</h3></div><ul class="list">' + soon.map(function (a) { return '<li>' + Club.icon('clock') + '<div style="flex:1;min-width:0"><div class="person-name">' + esc(a.title) + '</div><div class="person-sub">' + esc(dt(a.scheduledFor) + ' · ' + a.audience) + '</div></div><button type="button" class="btn btn-ghost btn-sm" data-view="' + esc(a.id) + '">View</button></li>'; }).join('') + '</ul></div>' : '') +
      '</div></div>';
    ui.on(panel, 'click', '[data-view]', function (e, b) { viewMessage(b.dataset.view); });
    ui.on(panel, 'click', '[data-action=notify-course]', function () {
      const msg = cs && cs.message ? cs.message : '', prev = copyDraft();
      draft = { id: null, title: 'Course update: ' + (cs && cs.open === false ? 'course closed' : 'carts ' + String(cs && cs.cartRule || 'Normal').toLowerCase()), body: 'Good morning {first_name},\n\n' + (msg || 'Here is today’s course report from the superintendent.') + '\n\n- Carts: ' + (cs.cartRule || 'Normal') + '\n- Pins: ' + (cs.pins || 'Middle'), audienceKey: 'golf', channels: ['SMS', 'App'], mode: 'now', scheduledFor: '' };
      goTab('compose'); offerDraftUndo('Course update drafted in the composer', prev, 'notices');
    });
  }

  /* ---------------- Page ---------------- */
  function render(view, params) {
    processDue();
    view.classList.add('cm-view');
    const valid = ['compose', 'outbox', 'templates', 'notices'];
    let openId = null;
    if (params[0] === 'message' && params[1]) { tab = 'outbox'; openId = params[1]; }
    else if (valid.indexOf(params[0]) >= 0) tab = params[0];
    const all = S.all('announcements');
    const since = Date.now() - 30 * 86400000;
    const sent30 = all.filter(function (a) { return a.status === 'sent' && a.sentAt && new Date(a.sentAt).getTime() >= since; });
    const measured = sent30.filter(function (a) { return a.recipients && a.opens; });
    const avgOpen = measured.length ? measured.reduce(function (s, a) { return s + a.opens / a.recipients; }, 0) / measured.length * 100 : 0;
    const avgClick = measured.length ? measured.reduce(function (s, a) { return s + a.clicks / a.recipients; }, 0) / measured.length * 100 : 0;
    const sched = all.filter(function (a) { return a.status === 'scheduled'; });
    const drafts = all.filter(function (a) { return a.status === 'draft'; }).length;
    view.innerHTML = ui.pageHeader({
      eyebrow: 'Membership · Correspondence', title: 'Communications',
      subtitle: 'Letters, notices and friendly updates from the club to its members.',
      actions: ui.btn('Use a template', { kind: 'ghost', icon: 'star', action: 'to-templates' }) + ui.btn('New message', { kind: 'primary', icon: 'plus', action: 'to-compose' })
    }) + ui.stats([
      { label: 'Sent, last 30 days', value: sent30.length, meta: fmt.num(sent30.reduce(function (s, a) { return s + (a.recipients || 0); }, 0)) + ' deliveries' },
      { label: 'Average open rate', value: Math.round(avgOpen), suffix: '%', meta: 'Across measured sends' },
      { label: 'Average click rate', value: Math.round(avgClick * 10) / 10, decimals: 1, suffix: '%', meta: 'Links and replies' },
      { label: 'Scheduled', value: sched.length, meta: sched.length ? 'Next ' + esc(dt(sched.map(function (a) { return a.scheduledFor; }).sort()[0])) : drafts + ' drafts waiting' }
    ]) + '<div class="cm-tabs-host"></div>';
    host = ui.$('.cm-tabs-host', view);
    ui.on(view, 'click', '[data-action=to-compose]', function () { draft = blankDraft(); goTab('compose'); });
    ui.on(view, 'click', '[data-action=to-templates]', function () { goTab('templates'); });
    tabsApi = ui.tabs(host, [
      { id: 'compose', label: 'Compose', render: renderCompose },
      { id: 'outbox', label: 'Outbox', render: renderOutbox },
      { id: 'templates', label: 'Templates', render: renderTemplates },
      { id: 'notices', label: 'Notice board', render: renderNotices }
    ], tab, function (id) { tab = id; try { history.replaceState(null, '', '#/communications/' + id); } catch (e) { /* ignore */ } window.scrollTo({ top: Math.min(window.scrollY, host.offsetTop - 90) }); });
    if (openId) setTimeout(function () { viewMessage(openId); }, 200);
    return function () { tabsApi = null; host = null; };
  }

  Club.register({
    id: 'communications', label: 'Communications', icon: 'mail', section: 'Membership', order: 30,
    badge: function () { const n = S.all('announcements').filter(function (a) { return a.status === 'scheduled'; }).length; return n || null; },
    search: function (q) {
      return S.all('announcements').filter(function (a) { return String(a.title).toLowerCase().indexOf(q) >= 0; })
        .map(function (a) { return { label: a.title, sub: 'Message · ' + a.status.charAt(0).toUpperCase() + a.status.slice(1), href: 'communications/message/' + a.id, icon: 'mail' }; });
    },
    render: render
  });
})();
