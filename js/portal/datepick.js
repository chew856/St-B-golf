/* Portal.datePicker: a Square-style date field for the members' portal.
   A select-style field (calendar icon, "Tuesday, October 27", chevron) with ‹ › buttons to step a day.
   Tapping it opens "Choose a date" in the shared bottom sheet (Portal.openSheet, js/portal/kit.js). Dates are
   grouped under This week / Next week, each row shows its availability, and unbookable days are dimmed
   with a reason. It is a proper dialog: focus moves in and is trapped, Escape or a backdrop tap closes it,
   and focus returns to the field. Styles live in css/portal-theme.css (.dp-*).

   const dp = Portal.datePicker(containerEl, {
     label: 'Date', title: 'Choose a date', value: '2026-10-27',
     days: [{ date: '2026-10-27', meta: '23 times', pill: 'Your tee time · 2:27 PM', disabled: false, reason: 'Fully booked' }, ...],
     note: '<icon> Drizzle, 5° · 23 times available',   // optional HTML line under the field
     onChange: function (iso) { ... }
   });
   compact: true shows "Wed, Nov 18" on one line and leaves out the ‹ › buttons (the staff tee time dialog).
   dp.set(iso)  dp.update({ days, note, value })  dp.value()  dp.open()  dp.close() */
(function () {
  window.Portal = window.Portal || {};
  const ui = Club.ui, esc = ui.esc;
  let uid = 0;

  function d(iso) { return Club.fmt.toDate(iso); }
  function fieldText(iso) { return d(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  function shortText(iso) { return d(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }); }
  function compactText(iso) { return d(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function rowText(iso) {
    return iso === Club.date.today() ? 'Today, ' + d(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : d(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function weekStart(iso) { return Club.date.week(iso)[0]; }
  function groupName(iso) {
    const t = weekStart(Club.date.today()), w = weekStart(iso);
    if (w === t) return 'This week';
    if (w === Club.date.addDays(t, 7)) return 'Next week';
    return 'Week of ' + d(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  Portal.datePicker = function (root, opts) {
    opts = Object.assign({ label: 'Date', title: 'Choose a date', days: [], value: null, note: '' }, opts || {});
    const id = 'dp' + (++uid);
    let value = opts.value || ((opts.days.find(function (x) { return !x.disabled; }) || opts.days[0] || {}).date) || Club.date.today();

    function enabledIndex(dir) {
      const list = opts.days, i = list.findIndex(function (x) { return x.date === value; });
      for (let j = i + dir; j >= 0 && j < list.length; j += dir) if (!list[j].disabled) return j;
      return -1;
    }
    function render() {
      root.innerHTML = '<div class="dp">' +
        '<span class="dp-label" id="' + id + '-l">' + esc(opts.label) + '</span>' +
        '<div class="dp-row">' +
          '<button type="button" class="dp-field" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="' + id + '-l ' + id + '-v">' +
            Club.icon('calendar') + '<span class="dp-field-text" id="' + id + '-v">' + (opts.compact ? '<span class="dp-compact">' + esc(compactText(value)) + '</span>' : '<span class="dp-long">' + esc(fieldText(value)) + '</span><span class="dp-short">' + esc(shortText(value)) + '</span>') + '</span>' + Club.icon('chevronDown', 'dp-chev') +
          '</button>' +
          (opts.compact ? '' :
          '<button type="button" class="dp-step" data-dp="prev" aria-label="Previous day"' + (enabledIndex(-1) < 0 ? ' disabled' : '') + '>' + Club.icon('chevronLeft') + '</button>' +
          '<button type="button" class="dp-step" data-dp="next" aria-label="Next day"' + (enabledIndex(1) < 0 ? ' disabled' : '') + '>' + Club.icon('chevronRight') + '</button>') +
        '</div>' +
        (opts.note ? '<div class="dp-note">' + opts.note + '</div>' : '') +
      '</div>';
      ui.$('.dp-field', root).addEventListener('click', open);
      ui.$$('.dp-step', root).forEach(function (b) {
        b.addEventListener('click', function () { const j = enabledIndex(b.dataset.dp === 'prev' ? -1 : 1); if (j >= 0) choose(opts.days[j].date, true); });
      });
    }
    function choose(iso, keepFocusOn) {
      if (!iso || iso === value) return;
      value = iso;
      const which = keepFocusOn === true ? document.activeElement && document.activeElement.dataset && document.activeElement.dataset.dp : null;
      render();
      if (which) { const b = ui.$('[data-dp="' + which + '"]', root); if (b && !b.disabled) b.focus(); else ui.$('.dp-field', root).focus(); }
      if (opts.onChange) opts.onChange(value);
    }

    /* The "Choose a date" list uses the shared bottom sheet (js/portal/kit.js): one sheet for every picker. */
    let sheetApi = null;
    function open() {
      if (sheetApi) return;
      const f = ui.$('.dp-field', root); if (f) f.setAttribute('aria-expanded', 'true');
      sheetApi = Portal.openSheet({
        title: opts.title, selected: value,
        rows: opts.days.map(function (x) { return { value: x.date, label: rowText(x.date), meta: x.meta || '', pill: x.pill || '', disabled: !!x.disabled, reason: x.reason || 'Not available', group: groupName(x.date) }; }),
        onPick: function (v) { choose(v); const f = ui.$('.dp-field', root); if (f) f.focus(); },
        onClose: function () { sheetApi = null; const g = ui.$('.dp-field', root); if (g) { g.setAttribute('aria-expanded', 'false'); setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) g.focus(); }, 0); } }
      });
    }
    function close() { if (sheetApi) sheetApi.close(); }

    render();
    return {
      el: root,
      value: function () { return value; },
      set: function (iso) { if (iso && iso !== value) { value = iso; render(); } },
      update: function (o) { Object.assign(opts, o || {}); if (o && o.value) value = o.value; render(); },
      open: open,
      close: close
    };
  };
})();
