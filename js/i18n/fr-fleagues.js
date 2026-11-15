/* French strings for friends leagues: js/portal/fleagues.js and the league switch when booking (js/portal/teetimes.js).
   This file covers the league screens and the rules engine's own words (js/core/friendleagues.js: formats, status,
   what is missing). Conventions as in fr-portal.js: vouvoiement, a non-breaking space before ":", decimals with a
   comma. Dates and weekdays inside the patterns are already French when the engine is on (fmt uses fr-CA). */
(function () {
  if (!window.Club || !Club.i18n || !Club.i18n.add) return;
  var NB = ' ';
  var S = {
    /* Engine: formats, status, what is missing */
    'Net Stableford points': 'Points Stableford nets',
    'Net stroke play': 'Partie par coups nets',
    'Gross stroke play': 'Partie par coups bruts',
    'Points by weekly finish': 'Points selon le rang de la semaine',
    'Stableford': 'Stableford',
    'Net strokes': 'Coups nets',
    'Gross strokes': 'Coups bruts',
    'Weekly finish': 'Rang de la semaine',
    'Points on each hole after handicap strokes. Most points wins.': 'Des points à chaque trou après les coups de handicap. Le plus de points l’emporte.',
    'Strokes after handicap. Lowest total wins.': 'Les coups après handicap. Le plus petit total l’emporte.',
    'Strokes with no handicaps. Lowest total wins.': 'Les coups sans handicap. Le plus petit total l’emporte.',
    'Each week players are ranked on their net score and get points by place. Most points wins.': 'Chaque semaine, les joueurs sont classés selon leur score net et reçoivent des points selon leur rang. Le plus de points l’emporte.',
    'Waiting for players': 'En attente de joueurs',
    'Finished': 'Terminée',
    'Cancelled': 'Annulée',
    'At least two teams are needed': 'Il faut au moins deux équipes',
    'At least two players are needed': 'Il faut au moins deux joueurs',

    /* League list and invites */
    'Leagues': 'Ligues',
    'Play a season with your friends. Rounds you book or post for the league count toward it.': 'Jouez une saison avec vos amis. Les parties que vous réservez ou inscrivez pour la ligue y comptent.',
    'Start a league': 'Créer une ligue',
    'League invites': 'Invitations à des ligues',
    'See details': 'Voir les détails',
    'Accept': 'Accepter',
    'Decline': 'Refuser',
    'No leagues yet': 'Aucune ligue pour l’instant',
    'Start a league and invite your friends. Everyone plays their rounds when it suits them, and the standings update as scores are posted.': 'Créez une ligue et invitez vos amis. Chacun joue ses parties quand cela lui convient, et le classement se met à jour à mesure que les scores sont inscrits.',
    'Your leagues': 'Vos ligues',
    'Finished and cancelled': 'Terminées et annulées',
    'No games played yet': 'Aucune partie jouée pour l’instant',
    'Undo': 'Annuler',
    'Undone': 'Annulé',

    /* League page */
    'Friends league': 'Ligue entre amis',
    'Organiser': 'Organisateur',
    'Joined': 'Inscrit',
    'Invited': 'Invité',
    'Declined the invite': 'A refusé l’invitation',
    'Open spot': 'Place libre',
    'Invite a friend': 'Inviter un ami',
    'Invite': 'Inviter',
    'Remove': 'Retirer',
    'You': 'Vous',
    'Scoring': 'Pointage',
    'Season': 'Saison',
    'Games': 'Parties',
    'Players': 'Joueurs',
    'Who is playing': 'Qui joue',
    'Individual': 'Individuel',
    'Teams': 'Équipes',
    'Rules': 'Règlement',
    'League rules': 'Règlement de la ligue',
    'Before it can start': 'Avant le début',
    'Ready to go': 'Prête à commencer',
    'Everyone is in.': 'Tout le monde est inscrit.',
    'The start date has passed. Rounds count once every spot is filled with a player who has accepted.': 'La date de début est passée. Les parties compteront dès que chaque place sera occupée par un joueur qui a accepté.',
    'Cancel league': 'Annuler la ligue',
    'Keep league': 'Garder la ligue',
    'Restore league': 'Rétablir la ligue',
    'League cancelled': 'Ligue annulée',
    'League restored': 'Ligue rétablie',
    'This league was cancelled.': 'Cette ligue a été annulée.',
    'This league never started: not enough players joined before the end.': 'Cette ligue n’a jamais commencé' + NB + ': trop peu de joueurs se sont inscrits avant la fin.',
    'Joining shares your league scores with the other players.': 'En vous inscrivant, vous partagez vos scores de la ligue avec les autres joueurs.',
    'This league is not available': 'Cette ligue n’est pas accessible',
    'It may have been removed, or you are not in it.': 'Elle a peut-être été supprimée, ou vous n’en faites pas partie.',
    'All your friends are already in this league': 'Tous vos amis font déjà partie de cette ligue',
    'Add friends first. Leagues are with friends.': 'Ajoutez d’abord des amis. Les ligues se jouent entre amis.',
    'Declined before': 'A déjà refusé',
    'Everyone in it will see that it was cancelled. You can restore it before the start date.': 'Tous ses joueurs verront qu’elle a été annulée. Vous pouvez la rétablir avant la date de début.',
    'Team standings': 'Classement des équipes',
    'Player standings': 'Classement des joueurs',
    'Standings': 'Classement',
    'Pos': 'Rang',
    'Team': 'Équipe',
    'Player': 'Joueur',
    'Per game': 'Par partie',
    'Total': 'Total',
    'Points': 'Points',
    'Points by weekly finish. Each completed week gives points by place.': 'Points selon le rang de la semaine. Chaque semaine complète donne des points selon le rang.',
    'Higher is better. Ranked on the average per game, so catching up never hurts.': 'Le plus haut l’emporte. Classement selon la moyenne par partie' + NB + ': rattraper une semaine ne nuit jamais.',
    'Lower is better. Ranked on the average per game, so catching up never hurts.': 'Le plus bas l’emporte. Classement selon la moyenne par partie' + NB + ': rattraper une semaine ne nuit jamais.',
    'Higher is better. Final totals.': 'Le plus haut l’emporte. Totaux finaux.',
    'Lower is better. Final totals.': 'Le plus bas l’emporte. Totaux finaux.',
    'Week by week': 'Semaine par semaine',
    'Week by week scores': 'Scores semaine par semaine',
    'Missed': 'Manquée',
    'To catch up': 'À rattraper',
    'Not played yet': 'Pas encore jouée',
    'Not played': 'Non jouée',
    'Coming up': 'À venir',
    'Missed, counts as the worst score of the week': 'Manquée' + NB + ': compte comme le pire score de la semaine',

    /* Start a league */
    'Back': 'Retour',
    'Steps': 'Étapes',
    'Review': 'Vérifier',
    'Continue': 'Continuer',
    'Create league': 'Créer la ligue',
    'League name': 'Nom de la ligue',
    'For example, Fall Friends Cup': 'Par exemple, Coupe d’automne entre amis',
    'Start date': 'Date de début',
    'Choose a start date': 'Choisir une date de début',
    'Weeks': 'Semaines',
    'Games a week': 'Parties par semaine',
    'Holes': 'Trous',
    '18 holes': '18 trous',
    '9 holes': '9 trous',
    'Only rounds of this length count.': 'Seules les parties de cette longueur comptent.',
    'How do you want to play?': 'Comment voulez-vous jouer' + NB + '?',
    'Teams add up their players’ scores. Every team has the same number of players.': 'Les équipes additionnent les scores de leurs joueurs. Chaque équipe compte le même nombre de joueurs.',
    'Everyone plays for themselves.': 'Chacun joue pour soi.',
    'Add friends first': 'Ajoutez d’abord des amis',
    'Leagues are with friends. Send a friend request, and once it is accepted you can invite them.': 'Les ligues se jouent entre amis. Envoyez une demande d’amitié; une fois acceptée, vous pourrez inviter cette personne.',
    'Find friends': 'Trouver des amis',
    'Invite friends': 'Inviter des amis',
    'Players on each team': 'Joueurs par équipe',
    'Add a player': 'Ajouter un joueur',
    'Add a team': 'Ajouter une équipe',
    'On this team': 'Dans cette équipe',
    'Give the league a name.': 'Donnez un nom à la ligue.',
    'Choose a start date after today.': 'Choisissez une date de début après aujourd’hui.',
    'Invite at least one friend.': 'Invitez au moins un ami.',
    'Put yourself on a team.': 'Placez-vous dans une équipe.',
    'Give each team its own name.': 'Donnez un nom différent à chaque équipe.',
    'Leagues are for golfing members': 'Les ligues sont réservées aux membres golfeurs'
  };

  function pl(n, one, many) { return (+n === 1 || +n === 0 ? one : many); }
  function weeks(n) { return n + ' ' + pl(n, 'semaine', 'semaines'); }
  function games(n) { return n + ' ' + pl(n, 'partie', 'parties'); }
  function late(s) { return s ? ' (en retard)' : ''; }
  function unit(u) { return u === 'Stableford points' ? 'les points Stableford' : u === 'net score' ? 'le score net' : 'le score brut'; }
  /** "8 weeks", "2 teams of 2", "3 players, 1 invited" and other small pieces joined with " · " */
  function piece(s) {
    var m;
    if (Object.prototype.hasOwnProperty.call(S, s)) return S[s];
    if ((m = /^(\d+) weeks?$/.exec(s))) return weeks(m[1]);
    if ((m = /^(\d+) holes$/.exec(s))) return m[1] + ' trous';
    if ((m = /^(\d+) games? a week$/.exec(s))) return games(m[1]) + ' par semaine';
    if ((m = /^(\d+) teams? of (\d)$/.exec(s))) return m[1] + ' ' + pl(m[1], 'équipe', 'équipes') + ' de ' + m[2];
    if ((m = /^(\d+) players?(?:, (\d+) invited)?$/.exec(s))) return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + (m[2] ? ', ' + m[2] + ' ' + pl(m[2], 'invité', 'invités') : '');
    if ((m = /^Starts (.+)$/.exec(s))) return 'Commence le ' + m[1];
    if ((m = /^Teams of (\d)$/.exec(s))) return 'Équipes de ' + m[1];
    if ((m = /^Team: (.+)$/.exec(s))) return 'Équipe' + NB + ': ' + m[1];
    if ((m = /^(.+) to (.+)$/.exec(s))) return 'Du ' + m[1] + ' au ' + m[2];
    return null;
  }
  function pieces(m) {
    var parts = m[0].split(' · '), out = [];
    for (var i = 0; i < parts.length; i++) { var t = piece(parts[i]); if (t == null) return null; out.push(t); }
    return out.join(' · ');
  }

  var P = [
    /* Status, problems and rules lines */
    [/^Week (\d+) of (\d+)$/, 'Semaine $1 sur $2'],
    [/^(\d+) invites? not answered yet$/, function (m) { return m[1] === '1' ? '1 invitation sans réponse' : m[1] + ' invitations sans réponse'; }],
    [/^(.+) needs (\d+) more players?\.?$/, function (m) { return Club.i18n.t(m[1]) + ' a besoin de ' + m[2] + ' ' + pl(m[2], 'joueur', 'joueurs') + ' de plus' + (/\.$/.test(m[0]) ? '.' : ''); }],
    [/^(?:Net Stableford points|Net stroke play|Gross stroke play|Points by weekly finish|Stableford|Net strokes|Gross strokes|Weekly finish) · .+$/, pieces],
    [/^(?:Starts .+|\d+ weeks?|\d+ players?.*|\d+ teams? of \d)(?: · .+)+$/, pieces],
    [/^.+ to .+ · Teams of \d$/, pieces],
    [/^Starts (.+)$/, 'Commence le $1'],
    [/^Teams of (\d)$/, 'Équipes de $1'],
    [/^Team: (.+)$/, 'Équipe' + NB + ': $1'],
    [/^(\d+) teams? of (\d)$/, function (m) { return piece(m[0]); }],
    [/^(\d+) players?(?:, (\d+) invited)?$/, function (m) { return piece(m[0]); }],
    [/^(\d+) weeks? from (.+)$/, function (m) { return weeks(m[1]) + ' à partir du ' + m[2]; }],
    [/^(\d+) weeks?$/, function (m) { return weeks(m[1]); }],
    [/^\((\d+) weeks?\)$/, function (m) { return '(' + weeks(m[1]) + ')'; }],
    [/^(\d+) games? a week$/, function (m) { return games(m[1]) + ' par semaine'; }],
    [/^(.+?) to (.+?) \((\d+) weeks?\)$/, function (m) { return 'Du ' + m[1] + ' au ' + m[2] + ' (' + weeks(m[3]) + ')'; }],
    [/^(\d) games? a week, (9|18) holes$/, function (m) { return games(m[1]) + ' par semaine, ' + m[2] + ' trous'; }],
    [/^(\d{1,2} \S+|\S+ \d{1,2}) to (\d{1,2} \S+|\S+ \d{1,2})$/, 'Du $1 au $2'],

    /* Invites */
    [/^(.+) invited you to this league(?:, on (.+))?\.$/, function (m) { return m[1] + ' vous invite dans cette ligue' + (m[2] ? ', dans l’équipe ' + m[2] : '') + '.'; }],
    [/^(.+) invited you to (.+)$/, '$1 vous invite à la ligue $2'],
    [/^Invited by (.+)$/, 'Invitation de $1'],
    [/^Decline the invite to (.+)$/, 'Refuser l’invitation à $1'],
    [/^Accept the invite to (.+)$/, 'Accepter l’invitation à $1'],
    [/^Invite to (.+) declined$/, 'Invitation à $1 refusée'],
    [/^You are in (.+)$/, 'Vous faites partie de $1'],
    [/^Invite sent to (.+)$/, 'Invitation envoyée à $1'],
    [/^Invite to (.+)$/, 'Inviter dans $1'],
    [/^Invite a friend to (.+)$/, 'Inviter un ami dans $1'],
    [/^Your place: (\S+) of (\d+)$/, 'Votre rang' + NB + ': $1 sur $2'],
    [/^You finished (\S+) of (\d+)$/, 'Rang final' + NB + ': $1 sur $2'],

    /* League page */
    [/^Everyone is in\. The league starts (.+)\.$/, 'Tout le monde est inscrit. La ligue commence le $1.'],
    [/^You can invite or remove players until (.+)\. The rules lock when the league starts\.$/, 'Vous pouvez inviter ou retirer des joueurs jusqu’au $1. Le règlement est fixé au début de la ligue.'],
    [/^Remove (.+) from the league$/, 'Retirer $1 de la ligue'],
    [/^(.+) removed from the league$/, '$1 a été retiré de la ligue'],
    [/^Cancel (.+)\?$/, 'Annuler ' + '$1' + NB + '?'],
    [/^(\d+) of (\d+) in$/, '$1 sur $2 inscrits'],
    [/^(\d+) of (\d+)$/, '$1 sur $2'],
    [/^Each week starts on a (\S+)\. Missed a week\? Play an extra round later and it counts for the week you missed\. Games still missing at the end count as the worst score of that week\. Until the end, players are ranked on their average per game\.$/,
      'Chaque semaine commence un $1. Vous avez manqué une semaine' + NB + '? Jouez une partie de plus plus tard et elle comptera pour la semaine manquée. Les parties encore manquantes à la fin comptent comme le pire score de cette semaine. Jusqu’à la fin, les joueurs sont classés selon leur moyenne par partie.'],
    [/^-?\d+(?:,\d)? pts$/, function (m) { return m[0]; }],
    [/^-?\d+,\d$/, function (m) { return m[0]; }],
    [/^\d{1,2} (?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?$/, function (m) { return m[0]; }],   /* already French (fmt.dateShort) */
    [/^Total (-?\d+(?:,\d)?(?: pts)?)$/, 'Total $1'],
    [/^Week (\d+)$/, 'Semaine $1'],
    [/^Week (\d+), game (\d+)$/, 'Semaine $1, partie $2'],
    [/^Played (.+?)( \(late\))?$/, function (m) { return 'Jouée le ' + m[1] + late(m[2]); }],
    [/^(\d{1,2} \S+|\S+ \d{1,2}) \(late\)$/, '$1 (en retard)'],
    [/^Missed, counts as (.+)$/, 'Manquée, compte pour $1'],
    [/^(.+), Week (\d+)(?:, game (\d+))?: Played (.+?)( \(late\))?, (.+)\. Open scorecard$/, function (m) {
      return m[1] + ', semaine ' + m[2] + (m[3] ? ', partie ' + m[3] : '') + ' ' + NB + ': jouée le ' + m[4] + late(m[5]) + ', ' + m[6] + '. Ouvrir la carte de pointage';
    }],
    [/^Each box is one game and shows the (Stableford points|net score|gross score)\. Tap a score to see the scorecard\.$/, function (m) { return 'Chaque case est une partie et indique ' + unit(m[1]) + '. Touchez un score pour voir la carte de pointage.'; }],

    /* Start a league */
    [/^Runs (.+?) to (.+?)\. Each week starts on a (\S+)\. (\d+) games? for each player\.$/, function (m) { return 'Du ' + m[1] + ' au ' + m[2] + '. Chaque semaine commence un ' + m[3] + '. ' + games(m[4]) + ' pour chaque joueur.'; }],
    [/^(\d+) players? including you\. Invites go to your friends to accept\.$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + ', vous compris. Vos amis reçoivent une invitation à accepter.'; }],
    [/^(\d+) of (\d+) spots filled\. You have (\d+) friends? to choose from\.$/, function (m) { return m[1] + ' ' + pl(m[1], 'place occupée', 'places occupées') + ' sur ' + m[2] + '. Vous avez ' + m[3] + ' ' + pl(m[3], 'ami', 'amis') + ' parmi qui choisir.'; }],
    [/^Name of team (\d+)$/, 'Nom de l’équipe $1'],
    [/^Team (\d+)$/, 'Équipe $1'],
    [/^Take yourself off (.+)$/, 'Vous retirer de $1'],
    [/^Take (.+) off (.+)$/, 'Retirer $1 de $2'],
    [/^Remove the team (.+)$/, 'Retirer l’équipe $1'],
    [/^Removed the team (.+)$/, 'Équipe $1 retirée'],
    [/^Add to (.+)$/, 'Ajouter à $1'],
    [/^(.+) \(you\)$/, '$1 (vous)'],
    [/^On team: (.+?)(, tap to move)?$/, function (m) { return 'Équipe' + NB + ': ' + m[1] + (m[2] ? ', touchez pour déplacer' : ''); }],
    [/^You, (.+)$/, 'Vous, $1'],
    [/^(\d+) friends? gets? an invite in Friends, Requests\. The league starts on (.+) once everyone has accepted\. Until then you can invite or remove players\.$/, function (m) {
      return m[1] + ' ' + pl(m[1], 'ami reçoit', 'amis reçoivent') + ' une invitation dans Amis, Demandes. La ligue commence le ' + m[2] + ' une fois que tout le monde a accepté. D’ici là, vous pouvez inviter ou retirer des joueurs.';
    }],
    [/^League created\. (\d+) invites? sent$/, function (m) { return 'Ligue créée. ' + m[1] + ' ' + pl(m[1], 'invitation envoyée', 'invitations envoyées'); }]
  ];

  Club.i18n.add({ strings: S, patterns: P });
})();
