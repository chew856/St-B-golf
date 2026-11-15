/* Public site: "Rate your visits" on My account (Pub.addAccountSection, js/public/site.js). The golfer's rounds from the
   last 14 days, each with a one-tap 1 to 5 rating and an optional comment (Club.feedback, js/core/feedback.js). It never
   pops up: it is a section people find on their account page. The account page redraws everything and then calls wire,
   so wire binds to this section's own element each time. Styles: css/public/feedback.css. */
(function () {
  'use strict';
  if (!window.Pub || !Club.feedback) return;
  const ui = Club.ui, F = Club.feedback;

  Pub.addAccountSection({
    order: 20,
    html: function (p) {
      const list = F.visits({ publicPlayerId: p.id });
      return '<section class="panel pfb" data-reveal aria-labelledby="pfb-h"><div class="panel-head"><div><div class="eyebrow">How did it go?</div><h3 id="pfb-h">Rate your visits</h3></div>' + Club.icon('star', 'pub-head-icon') + '</div>' +
        '<div class="panel-body">' + (list.length
          ? '<p class="pfb-intro">One tap is enough, and a comment is up to you. Rounds from the last ' + F.WINDOW_DAYS + ' days are here, and you can change a rating until then.</p><div class="vf-list">' + list.map(function (v) { return F.cardHTML(v); }).join('') + '</div>'
          : ui.empty({ icon: 'flag', title: 'No rounds to rate', text: 'After you play, your round shows here for ' + F.WINDOW_DAYS + ' days so you can tell us how it went.' })) +
        '</div></section>';
    },
    wire: function (root, p) {
      const sec = ui.$('.pfb', root);
      if (sec) F.wire(sec, { publicPlayerId: p.id });
    }
  });
})();
