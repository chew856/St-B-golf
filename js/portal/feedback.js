/* Portal: Rate your visits (#/feedback). The member's rounds, meals and lessons from the last 14 days, each with a
   one-tap 1 to 5 rating and an optional comment (Club.feedback, js/core/feedback.js). The client was clear that this
   must never pop up: the page is only reached from My account and the menu, and nothing on it opens by itself.
   Ratings can be changed any time inside the 14 days. Styles: css/portal/feedback.css (.vf-*).
   Redesign (Nov 22): one calm column of visits between hairlines; All / Rounds / Meals / Lessons as words. */
(function () {
  'use strict';
  const ui = Club.ui, esc = ui.esc, F = Club.feedback;
  if (!F) return;
  const SHOW = [['all', 'All'], ['round', 'Rounds'], ['meal', 'Meals'], ['lesson', 'Lessons']];
  let show = 'all';

  function countLine(all) {
    const done = all.filter(function (v) { return v.fb; }).length;
    return done === all.length ? 'All ' + all.length + (all.length === 1 ? ' visit' : ' visits') + ' rated. Thank you.' : done + ' of ' + all.length + ' rated';
  }

  Portal.register({
    id: 'feedback', label: 'Rate your visits', short: 'Rate', icon: 'star', order: 62, tab: false, nav: false,
    render: function (view, params, member) {
      const who = { memberId: member.id };
      function draw() {
        const all = F.visits(who);
        const kinds = SHOW.filter(function (s) { return s[0] === 'all' || all.some(function (v) { return v.kind === s[0]; }); });
        if (!kinds.some(function (s) { return s[0] === show; })) show = 'all';
        const list = all.filter(function (v) { return show === 'all' || v.kind === show; });
        view.innerHTML = '<a class="vf-back" href="#/account">' + Club.icon('chevronLeft') + '<span>My account</span></a>' +
          '<section class="p-hero vf-hero" data-reveal><h1>Rate your visits</h1><p>Visits from the last ' + F.WINDOW_DAYS + ' days. Tap to rate; you can change it within that time.</p></section>' +
          (all.length
            ? '<div class="vf-bar" data-reveal>' + (kinds.length > 2 ? '<div class="segmented vf-seg" role="group" aria-label="Show">' + kinds.map(function (s) {
                return '<button type="button" data-show="' + s[0] + '" class="' + (s[0] === show ? 'active' : '') + '" aria-pressed="' + (s[0] === show) + '">' + esc(s[1]) + '</button>';
              }).join('') + '</div>' : '') + '<p class="vf-count" aria-live="polite">' + esc(countLine(all)) + '</p></div>' +
              '<div class="vf-list">' + list.map(function (v) { return F.cardHTML(v); }).join('') + '</div>'
            : '<section class="vf-empty" data-reveal>' + ui.empty({ icon: 'star', title: 'Nothing to rate right now', text: 'Rounds, meals and lessons show here for ' + F.WINDOW_DAYS + ' days.' }) + '</section>') +
          '<p class="vf-fine">Only the club team sees your ratings.</p>';
      }
      draw();
      F.wire(view, who, function () { const c = ui.$('.vf-count', view); if (c) c.textContent = countLine(F.visits(who)); });
      ui.on(view, 'click', '[data-show]', function (e, b) { show = b.dataset.show; draw(); ui.animateIn(view); });
    }
  });
})();
