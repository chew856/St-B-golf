/* French strings for counting a booking toward a friends league (js/portal/teetimes.js), and the reasons
   Club.friendLeagues.canCount gives (js/core/friendleagues.js). Vouvoiement; dates are already French (fmt uses fr-CA). */
(function () {
  if (!window.Club || !Club.i18n || !Club.i18n.add) return;
  var S = {
    'Friends league': 'Ligue entre amis',
    'Does not count': 'Ne compte pas',
    'A round on its own': 'Une partie hors ligue',
    'Count this round toward': 'Compter cette partie pour',
    'This round cannot count': 'Cette partie ne peut pas compter',
    'That friends league is no longer running. Please choose again.': 'Cette ligue entre amis n’est plus en cours. Veuillez choisir de nouveau.',
    /* canCount reasons without numbers */
    'You are not in this league': 'Vous ne faites pas partie de cette ligue',
    'This league was cancelled': 'Cette ligue a été annulée',
    'The league is waiting for players': 'La ligue attend des joueurs'
  };
  var P = [];
  function pat(re, fn) { P.push([re, fn]); }
  /* One fragment through this file's strings and patterns (for reasons inside longer sentences). */
  function tr(s) {
    s = String(s == null ? '' : s).trim();
    if (Object.prototype.hasOwnProperty.call(S, s)) return S[s];
    for (var i = 0; i < P.length; i++) { var m = P[i][0].exec(s); if (m) { var r = P[i][1](m); if (r != null) return r; } }
    return Club.i18n.t ? Club.i18n.t(s) : s;
  }
  function week(w, g, ofWeek) {
    return ofWeek ? 'la partie ' + g + ' de la semaine ' + w : 'votre partie de la semaine ' + w;
  }
  var LATE = ' (rattrapage)';

  /* canCount reasons with dates or numbers */
  pat(/^The league starts (.+)$/, function (m) { return 'La ligue commence le ' + m[1]; });
  pat(/^The league ended (.+)$/, function (m) { return 'La ligue s’est terminée le ' + m[1]; });
  pat(/^Only (\d+)-hole rounds count$/, function (m) { return 'Seules les parties de ' + m[1] + ' trous comptent'; });
  pat(/^All (\d+) league games are played or booked$/, function (m) { return 'Les ' + m[1] + ' parties de la ligue sont jouées ou réservées'; });
  pat(/^Week (\d+) is already full\. League games can be caught up but not played ahead\.?$/, function (m) {
    return 'La semaine ' + m[1] + ' est déjà complète. Les parties de ligue peuvent être rattrapées, mais pas jouées d’avance';
  });

  /* What the round would be in the league (switch and picker) */
  pat(/^(Counts|Would count) as your week (\d+) game( \(catching up\))?$/, function (m) {
    return (m[1] === 'Counts' ? 'Compte comme ' : 'Compterait comme ') + week(m[2]) + (m[3] ? LATE : '');
  });
  pat(/^(Counts|Would count) as game (\d+) of week (\d+)( \(catching up\))?$/, function (m) {
    return (m[1] === 'Counts' ? 'Compte comme ' : 'Compterait comme ') + week(m[3], m[2], true) + (m[4] ? LATE : '');
  });

  /* Booking errors and toasts (longer sentences first: "Counts toward X" would match them too) */
  pat(/^This round cannot count toward (.+?)\. (.+?)\.?$/, function (m) { return 'Cette partie ne peut pas compter pour ' + m[1] + '. ' + tr(m[2]) + '.'; });
  pat(/^This round now counts toward (.+)$/, function (m) { return 'Cette partie compte maintenant pour ' + (m[1] === 'your league' ? 'votre ligue' : m[1]); });
  pat(/^This round no longer counts toward (.+)$/, function (m) { return 'Cette partie ne compte plus pour ' + (m[1] === 'a league' ? 'une ligue' : m[1]); });
  pat(/^Counts toward (.+) once you post your score$/, function (m) { return 'Compte pour ' + m[1] + ' une fois votre score inscrit'; });
  pat(/^Counts toward (.+)$/, function (m) { return 'Compte pour ' + m[1]; });

  Club.i18n.add({ strings: S, patterns: P });
})();
