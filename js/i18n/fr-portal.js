/* French (Canada) strings for the members' portal: member.html and js/portal/* (except js/portal/cart.js, which is
   in fr-shared.js), plus the module strings the portal shows to members. Agent: portal translator.
   Exact strings are keyed by the trimmed English text of a text node or attribute; patterns cover text with names,
   numbers, dates or times inside (those parts are already French when the engine is on: fmt and toLocale* use fr-CA).
   Conventions: vouvoiement, a non-breaking space before ":" and inside « », no space before ? ! ; */
(function () {
  var NB = ' ';
  var S = {}, P = [];
  function add(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) S[k] = o[k]; }
  function pat(re, to) { P.push([re, to]); }
  /* Translate a fragment through this dictionary (for patterns built of known pieces). */
  function T(s) {
    s = String(s == null ? '' : s); var t = s.trim();
    if (Object.prototype.hasOwnProperty.call(S, t)) return S[t];
    if (window.Club && Club.i18n && typeof Club.i18n.t === 'function') { try { return Club.i18n.t(s); } catch (e) { /* engine not ready */ } }
    return s;
  }
  /* "A, B and C" -> "A, B et C" */
  function et(s) { return String(s).replace(/ and ([^,]+)$/, ' et $1'); }
  /* 1.5 -> 1,5 */
  function dec(s) { return String(s).replace(/(\d)\.(\d)/g, '$1,$2'); }
  function pl(n, one, many) { return (+n === 1 || +n === 0 ? one : many); }
  /* A small matcher over this file's own strings and patterns, for pieces inside composed sentences. */
  function tr(s) {
    s = String(s == null ? '' : s).trim();
    if (Object.prototype.hasOwnProperty.call(S, s)) return S[s];
    for (var i = 0; i < P.length; i++) {
      var m = P[i][0].exec(s); if (!m) continue;
      var r = typeof P[i][1] === 'function' ? P[i][1](m) : s.replace(P[i][0], P[i][1]);
      if (r != null) return r;
    }
    return T(s);
  }

  /* ---------------- Shell: sign in, header, menus, tab bar (js/portal/app.js) ---------------- */
  add({
    'Members’ portal': 'Portail des membres',
    'Member number': 'Numéro de membre',
    'e.g. 1003': 'p. ex. 1003',
    'Password': 'Mot de passe',
    'Any password in this demo': 'N’importe quel mot de passe (démo)',
    'Sign in': 'Se connecter',
    'Demo member': 'Membre de démonstration',
    'Not a member?': 'Pas membre?',
    'Book public golf': 'Réserver une partie publique',
    '· Club staff?': '· Personnel du club?',
    'Open the club system': 'Ouvrir le système du club',
    'We could not find that member number. Check your membership card.': 'Nous n’avons pas trouvé ce numéro de membre. Vérifiez votre carte de membre.',
    'This membership is no longer active. Please call the club office.': 'Cette adhésion n’est plus active. Veuillez appeler le bureau du club.',
    'Members': 'Membres',
    'Main': 'Principal',
    'Quick': 'Accès rapide',
    'More': 'Plus',
    'My profile': 'Mon profil',
    'My account': 'Mon compte',
    'Sign out': 'Se déconnecter',
    'Sign out?': 'Se déconnecter?',
    'You can sign back in any time with your member number.': 'Vous pouvez vous reconnecter en tout temps avec votre numéro de membre.',
    'Menu': 'Menu',
    'This page could not load': 'Cette page n’a pas pu se charger',
    /* kit.js */
    'Close': 'Fermer',
    'Choose': 'Choisir',
    'Fewer': 'Moins',
    'Your selection': 'Votre sélection',
    'Continue': 'Continuer',
    'A member': 'Un membre',
    'Guest': 'Invité',
    'Public golfer': 'Golfeur public',
    'Receipts': 'Reçus',
    'Receipt': 'Reçu',
    /* datepick.js */
    'Date': 'Date',
    'Choose a date': 'Choisissez une date',
    'Previous day': 'Jour précédent',
    'Next day': 'Jour suivant',
    'This week': 'Cette semaine',
    'Next week': 'La semaine prochaine',
    'Not available': 'Non disponible'
  });
  pat(/^Welcome back, (.+)$/, 'Bon retour, $1');
  pat(/^(.+) home$/, '$1 : accueil'.replace(' :', NB + ':'));
  pat(/^Member #(.+)$/, 'Membre nº $1');
  pat(/^Please refresh\. If it keeps happening, call the club office on (.+)\.$/, 'Veuillez actualiser la page. Si le problème persiste, appelez le bureau du club au $1.');
  pat(/^Credit: (.+)$/, 'Crédit' + NB + ': $1');
  pat(/^(.+) and (\d+) more( · .+)?$/, function (m) { return m[1] + ' et ' + m[2] + ' de plus' + (m[3] || ''); });
  pat(/^Week of (.+)$/, 'Semaine du $1');
  pat(/^Today, (.+)$/, 'Aujourd’hui, $1');
  pat(/^(.+) · St\. Boniface Members$/, function (m) { return T(m[1]) + ' · Membres St. Boniface'; });

  /* ---------------- Home (js/portal/home.js) ---------------- */
  var WX = { 'Sunny': 'Ensoleillé', 'Partly cloudy': 'Partiellement nuageux', 'Overcast': 'Couvert', 'Fog': 'Brouillard', 'Drizzle': 'Bruine',
    'Light rain': 'Pluie légère', 'Rain': 'Pluie', 'Snow': 'Neige', 'Thunderstorms': 'Orages', 'Cloudy': 'Nuageux', 'Breezy': 'Venteux' };
  add(WX);
  add({
    'Home': 'Accueil',
    'Course open': 'Parcours ouvert',
    'Course closed': 'Parcours fermé',
    'Carts as normal': 'Voiturettes permises',
    'Walking only': 'Marche seulement',
    'Carts on paths only': 'Voiturettes sur les sentiers seulement',
    'Carts on 90° rule': 'Voiturettes : règle du 90°'.replace(' :', NB + ':'),
    'Tee time': 'Départ',
    'Dining': 'Repas',
    'Events': 'Événements',
    'Lessons': 'Cours',
    'Book a tee time': 'Réserver un départ',
    'Reserve a table': 'Réserver une table',
    'Browse events': 'Voir les événements',
    'Book a lesson': 'Réserver un cours',
    'Quick actions': 'Actions rapides',
    'On the course': 'Sur le parcours',
    'Today': 'Aujourd’hui',
    'Tomorrow': 'Demain',
    'Yesterday': 'Hier',
    'Just you': 'Vous seul',
    'Nothing booked yet. Your tee times, tables, lessons and events will appear here.': 'Rien de réservé pour l’instant. Vos départs, tables, cours et événements apparaîtront ici.',
    'Coming up': 'À venir',
    'View all': 'Tout voir',
    'See all': 'Tout voir',
    'Handicap index': 'Indice de handicap',
    'Steady': 'Stable',
    'Account balance': 'Solde du compte',
    'In credit': 'Solde créditeur',
    'Billed monthly': 'Facturé chaque mois',
    'Nothing owing': 'Aucun montant dû',
    'Club notices': 'Avis du club',
    'No notices right now.': 'Aucun avis pour le moment.',
    'Friends playing this week': 'Amis qui jouent cette semaine',
    'No friends have a tee time booked this week.': 'Aucun de vos amis n’a de départ réservé cette semaine.',
    'The clubhouse': 'Le pavillon',
    'Lesson': 'Cours',
    'Event': 'Événement'
  });
  pat(/^Good morning, (.+)$/, 'Bonjour, $1');
  pat(/^Good afternoon, (.+)$/, 'Bon après-midi, $1');
  pat(/^Good evening, (.+)$/, 'Bonsoir, $1');
  pat(/^(−?-?\d+)° (.+)$/, function (m) { return WX[m[2]] ? m[1] + '° ' + WX[m[2]] : null; });
  pat(/^H (−?-?\d+)° · L (−?-?\d*)°$/, 'Max. $1° · Min. $2°');
  pat(/^First tee (.+) · (.+)$/, function (m) { return 'Premier départ ' + m[1] + ' · ' + T(m[2]); });
  pat(/^Carts: (.+)$/, 'Voiturettes' + NB + ': $1');
  pat(/^Today · (.+)$/, 'Aujourd’hui · $1');
  pat(/^Tomorrow · (.+)$/, 'Demain · $1');
  pat(/^View all \((\d+)\)$/, 'Tout voir ($1)');
  pat(/^(\d+) days ago$/, 'Il y a $1 jours');
  pat(/^([↓↑][\d.,]+) since (.+)$/, function (m) { return dec(m[1]) + ' depuis ' + m[2]; });
  /* "With Tom R., Priya A. and 1 guest": names and guest counts only (a menu description "With choice of soup" is data) */
  pat(/^With ((?:[A-Z\d][^,]*?)(?:, [A-Z\d][^,]*?)*(?: and [A-Z\d].*)?)$/, function (m) { return 'Avec ' + et(m[1]).replace(/\b(\d+) guests?\b/, function (x, n) { return n + ' ' + pl(n, 'invité', 'invités'); }); });
  pat(/^Tee time · (\d+) holes$/, 'Départ · $1 trous');
  pat(/^(Dining|Event|Lesson) · (.+)$/, function (m) { return T(m[1]) + ' · ' + T(m[2]); });
  pat(/^(\d+) (person|people)( · (.+))?$/, function (m) { return m[1] + ' ' + pl(m[1], 'personne', 'personnes') + (m[4] ? ' · ' + T(m[4]) : ''); });
  pat(/^(.+) · with (\d+) guests?$/, function (m) { return T(m[1]) + ' · avec ' + m[2] + ' ' + pl(m[2], 'invité', 'invités'); });
  pat(/^(\d+) min with (.+)$/, '$1 min avec $2');
  pat(/^(.+) · (\d+) holes$/, function (m) { return m[1].split(' · ').map(function (x) { return T(x); }).join(' · ') + ' · ' + m[2] + ' trous'; });
  /* ---------------- Tee times (js/portal/teetimes.js) ---------------- */
  var CART = {
    'allowed': 'permises', 'Allowed': 'Permises', 'Carts allowed': 'Voiturettes permises',
    '90° rule': 'Règle du 90°', 'The 90° rule': 'La règle du 90°',
    'on paths only': 'sur les sentiers seulement', 'Paths only': 'Sentiers seulement', 'Cart path only': 'Sentiers de voiturette seulement',
    'No carts today': 'Aucune voiturette aujourd’hui',
    'Carts can drive on the fairways and rough. Keep them off tees and greens.': 'Les voiturettes peuvent circuler sur les allées et l’herbe longue. Gardez-les à l’écart des tertres de départ et des verts.',
    'Keep to the cart path, then turn onto the fairway at a right angle to reach your ball and drive straight back to the path.': 'Restez sur le sentier, puis tournez à angle droit dans l’allée pour rejoindre votre balle et revenez tout droit au sentier.',
    'Carts stay on the paved paths at all times. Walk from the path to your ball.': 'Les voiturettes restent en tout temps sur les sentiers pavés. Marchez du sentier jusqu’à votre balle.',
    'Carts are not allowed on the course today, so everyone walks.': 'Les voiturettes sont interdites sur le parcours aujourd’hui : tout le monde marche.'.replace(' :', NB + ':')
  };
  add(CART);
  add({
    'Tee times': 'Départs',
    'Walking only today': 'Marche seulement aujourd’hui',
    'Walk': 'À pied',
    'Cart': 'Voiturette',
    'You': 'Vous',
    'Member': 'Membre',
    'Who pays': 'Qui paie',
    'Players': 'Joueurs',
    'Already in the group': 'Déjà dans le groupe',
    'Add a friend': 'Ajouter un ami',
    'Add a guest': 'Ajouter un invité',
    'Your group is full (4 players).': 'Votre groupe est complet (4 joueurs).',
    'Holes': 'Trous',
    '18 holes': '18 trous',
    '9 holes': '9 trous',
    'Notes for the golf shop': 'Notes pour la boutique du pro',
    'Optional': 'Facultatif',
    'An occasion, a pull cart, rental clubs for a guest': 'Une occasion, un chariot, des bâtons de location pour un invité',
    'Due at check-in': 'À payer à l’enregistrement',
    'Nothing is due on your account.': 'Rien n’est porté à votre compte.',
    'No fees for this round. Member golf is included in your dues.': 'Aucuns frais pour cette partie. Le golf des membres est compris dans votre cotisation.',
    'On other members’ accounts': 'Aux comptes d’autres membres',
    'Paid by your guest at the golf shop': 'Payé par votre invité à la boutique du pro',
    'Paid by your guest at the golf shop:': 'Payé par votre invité à la boutique du pro' + NB + ':',
    'Nothing is charged now. Fees post when the group checks in at the golf shop.': 'Rien n’est facturé maintenant. Les frais sont portés au compte quand le groupe s’enregistre à la boutique du pro.',
    'Nine-hole rate applied. Nothing is charged now. Fees post when the group checks in at the golf shop.': 'Tarif de neuf trous appliqué. Rien n’est facturé maintenant. Les frais sont portés au compte quand le groupe s’enregistre à la boutique du pro.',
    'Breakdown': 'Détail',
    'My account': 'Mon compte',
    'Guest pays at shop': 'L’invité',
    'Guests you have brought before': 'Invités que vous avez déjà amenés',
    'Or a new guest': 'Ou un nouvel invité',
    'First name': 'Prénom',
    'Last name': 'Nom',
    'Mobile phone': 'Cellulaire',
    'Email': 'Courriel',
    'name@example.com': 'nom@exemple.com',
    'For the golf shop to confirm the tee time.': 'Pour que la boutique du pro confirme l’heure de départ.',
    '(optional)': '(facultatif)',
    'e.g. 14.2': 'p. ex. 14,2',
    'The guest’s green fee is posted to your account at check-in.': 'Les droits de jeu de l’invité sont portés à votre compte à l’enregistrement.',
    'Your guest pays their green fee at the golf shop when they check in.': 'Votre invité paie ses droits de jeu à la boutique du pro lors de son enregistrement.',
    'Add guest': 'Ajouter l’invité',
    'Please enter a first name.': 'Veuillez entrer un prénom.',
    'Please enter a last name.': 'Veuillez entrer un nom.',
    'Please enter a 10-digit phone number.': 'Veuillez entrer un numéro de téléphone à 10 chiffres.',
    'Please enter a valid email address.': 'Veuillez entrer une adresse courriel valide.',
    'Use a handicap index like 14.2, or +1.5 for a plus handicap.': 'Entrez un indice de handicap comme 14,2, ou +1,5 pour un handicap plus.',
    'Already has a round close to this time.': 'A déjà une partie proche de cette heure.',
    'Search your friends': 'Rechercher vos amis',
    'Search your friends by name': 'Rechercher vos amis par nom',
    'Only your friends can be added to a booking. Add friends on the': 'Seuls vos amis peuvent être ajoutés à une réservation. Ajoutez des amis à la page',
    'Friends': 'Amis',
    'page, or bring your companion as a guest.': ', ou amenez votre partenaire comme invité.',
    'No friends match that name. Anyone else can come as a guest.': 'Aucun ami ne correspond à ce nom. Toute autre personne peut venir comme invité.',
    'Calendar invitation downloaded': 'Invitation de calendrier téléchargée',
    'Your browser could not create the calendar file': 'Votre navigateur n’a pas pu créer le fichier de calendrier',
    'close of play': 'la fin du jeu',
    'Member golf': 'Golf des membres'
  });
  pat(/^You can book up to (\d+) days ahead \(until (.+)\)\.$/, 'Vous pouvez réserver jusqu’à $1 jours à l’avance (jusqu’au $2).');
  pat(/^Carts on (.+)$/, function (m) { var x = T(m[1]); return 'Voiturettes' + NB + ': ' + x.charAt(0).toLowerCase() + x.slice(1); });
  pat(/^(\d+) spots? left$/, function (m) { return m[1] === '1' ? '1 place restante' : m[1] + ' places restantes'; });
  pat(/^(\d+) spots?$/, function (m) { return m[1] + ' ' + pl(m[1], 'place', 'places'); });
  pat(/^(.+) membership does not include golf\.$/, 'L’adhésion $1 ne comprend pas le golf.');
  pat(/^(.+) members play any time, seven days a week\.$/, 'Les membres $1 jouent en tout temps, sept jours sur sept.');
  pat(/^(.+) members play weekdays (.+), and weekends and holidays (.+)\.$/, function (m) { return 'Les membres ' + m[1] + ' jouent en semaine ' + T(m[2]) + ', et les fins de semaine et jours fériés ' + T(m[3]) + '.'; });
  pat(/^Par (\d+) · (.+) yards$/, function (m) { return 'Normale ' + m[1] + ' · ' + m[2].replace(/\bBlack\b/, 'Noir').replace(/\bGreen\b/, 'Vert').replace(/\bSilver\b/, 'Argent').replace(/(\d),(\d{3})/g, '$1' + NB + '$2') + ' verges'; });
  pat(/^(.+)’s transport$/, 'Transport de $1');
  pat(/^Your transport$/, 'Votre transport');
  pat(/^Guest · (.+)$/, 'Invité · $1');
  pat(/^Remove (.+)$/, 'Retirer $1');
  pat(/^(\d) of 4$/, '$1 sur 4');
  pat(/^(\d+) more players? to add, or book just for yourself\.$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + ' à ajouter, ou réservez pour vous seul.'; });
  pat(/^(\d+) items?$/, function (m) { return m[1] + ' ' + pl(m[1], 'élément', 'éléments'); });
  pat(/^(Green fee|Guest green fee|Cart), (.+)$/, function (m) {
    var w = { 'Green fee': 'Droits de jeu', 'Guest green fee': 'Droits de jeu d’invité', 'Cart': 'Voiturette' }[m[1]];
    var who = m[2] === 'you' ? 'vous' : m[2] === 'guest' ? 'invité' : m[2];
    return w + ', ' + who;
  });
  pat(/^(.+) added to your group$/, '$1 ajouté à votre groupe');
  pat(/^Carts allowed\. (.+)$/, function (m) { return 'Voiturettes permises. ' + T(m[1]); });
  pat(/^(Carts on 90° rule|Carts on paths only|No carts today)\. (.+)$/, function (m) { return T(m[1]) + '. ' + T(m[2]); });
  /* Tee rules (js/core/teerules.js) as members see them, also used inside the tee time messages below. */
  function WIN(s) {
    s = String(s);
    if (s === 'at no times' || s === 'no times') return 'à aucun moment';
    return et(s.replace(/\bbefore /g, 'avant ').replace(/\bafter /g, 'après ').replace(/ to /g, ' à '));
  }
  add({
    'That date has passed.': 'Cette date est passée.',
    'That date has passed. Please choose another day.': 'Cette date est passée. Veuillez choisir un autre jour.',
    'That date is outside your booking window.': 'Cette date est hors de votre période de réservation.'
  });
  pat(/^(.+) members play (.+) on (weekends and holidays|weekdays)\.$/, function (m) {
    return 'Les membres ' + m[1] + ' jouent ' + WIN(m[2]) + (m[3] === 'weekdays' ? ' en semaine' : ' les fins de semaine et jours fériés') + '.';
  });
  pat(/^(.+) members can book (\d+) days ahead\. This date opens on (.+)\.$/, 'Les membres $1 peuvent réserver $2 jours à l’avance. Cette date ouvre le $3.');

  add({
    'Your golf privileges are currently paused.': 'Vos privilèges de golf sont actuellement suspendus.',
    'That tee time has just passed. Please choose a later time.': 'Cette heure de départ vient de passer. Veuillez choisir une heure plus tardive.',
    'The course has closed for today. Please choose another day.': 'Le parcours est fermé pour aujourd’hui. Veuillez choisir un autre jour.',
    'This group has changed since you chose it. Please choose another time.': 'Ce groupe a changé depuis que vous l’avez choisi. Veuillez choisir une autre heure.',
    'This tee time has just filled.': 'Cette heure de départ vient de se remplir.',
    'A group can have at most four players.': 'Un groupe peut compter au plus quatre joueurs.',
    'Please enter a name for each guest.': 'Veuillez entrer un nom pour chaque invité.',
    'Outside your play times': 'Hors de vos heures de jeu',
    'Already teed off': 'Déjà parti',
    'Course closed today': 'Parcours fermé aujourd’hui',
    'Reserved for club use': 'Réservé pour le club',
    'Not available on your membership': 'Non offert avec votre adhésion',
    'Full': 'Complet',
    'Just changed': 'Vient de changer',
    'No longer available': 'Plus disponible',
    'You’re in': 'Vous en êtes',
    'Not open to you yet': 'Pas encore ouvert pour vous',
    'Not available to you': 'Non disponible pour vous',
    'This tee time is no longer available.': 'Cette heure de départ n’est plus disponible.',
    'You are already in this group.': 'Vous faites déjà partie de ce groupe.',
    'This tee time has changed. Please check with the golf shop.': 'Cette heure de départ a changé. Veuillez vérifier auprès de la boutique du pro.',
    'You booked this tee time. Manage it in My tee times.': 'Vous avez réservé cette heure de départ. Gérez-la dans Mes départs.',
    'Not posted': 'Non affiché',
    'Course closed today.': 'Parcours fermé aujourd’hui.',
    'Carts': 'Voiturettes',
    'Greens': 'Verts',
    'Pins': 'Drapeaux',
    'Conditions': 'Conditions',
    'From the grounds crew:': 'De l’équipe d’entretien' + NB + ':',
    'Book': 'Réserver',
    'My tee times': 'Mes départs',
    'Your golf privileges are paused': 'Vos privilèges de golf sont suspendus',
    'Your membership is suspended, so you can’t book online. Please call the membership office to restore your account.': 'Votre adhésion est suspendue : vous ne pouvez pas réserver en ligne. Veuillez appeler le bureau des adhésions pour rétablir votre compte.'.replace(' :', NB + ':'),
    'Times': 'Heures',
    'Course and fees': 'Parcours et tarifs',
    'Guest, weekdays': 'Invité, en semaine',
    'Guest, weekends and holidays': 'Invité, fins de semaine et jours fériés',
    'Guest, after 5:30 PM': 'Invité, après 17 h 30',
    'Cart, per rider': 'Voiturette, par personne',
    '60% of the fee': '60' + NB + '% du tarif',
    'Guest green fees go on the host member’s account at check-in.': 'Les droits de jeu des invités sont portés au compte du membre hôte à l’enregistrement.',
    'Good to know': 'Bon à savoir',
    'Change or cancel up to 2 hours before': 'Modification ou annulation jusqu’à 2 heures avant',
    'You can change or cancel up to 2 hours before you play.': 'Vous pouvez modifier ou annuler jusqu’à 2 heures avant votre partie.',
    'Check in at the golf shop 15 minutes before your tee time.': 'Présentez-vous à la boutique du pro 15 minutes avant votre heure de départ.',
    'Members and guests must follow the dress code. Soft spikes only, on the course and in the clubhouse.': 'Les membres et les invités doivent respecter le code vestimentaire. Crampons souples seulement, sur le parcours et dans le pavillon.',
    'That tee time is no longer available': 'Cette heure de départ n’est plus disponible',
    'Not open yet': 'Pas encore ouvert',
    'Closed': 'Fermé',
    'No times left': 'Plus aucune heure',
    'Fully booked': 'Complet',
    'Not open for booking yet': 'Réservations pas encore ouvertes',
    'No times available': 'Aucune heure disponible',
    'Booking times for your membership': 'Heures de réservation de votre adhésion',
    'The course is closed today': 'Le parcours est fermé aujourd’hui',
    'Morning': 'Matin',
    'Midday': 'Midi',
    'Afternoon': 'Après-midi',
    'Time of day': 'Moment de la journée',
    'Notify me if a spot opens': 'M’aviser si une place se libère',
    'Show open times only': 'Afficher seulement les heures libres',
    'Show all times': 'Afficher toutes les heures',
    'Not available for your membership': 'Non offert avec votre adhésion',
    'Your tee time': 'Votre départ',
    'Passed': 'Passé',
    'Reserved': 'Réservé',
    'Near your tee time': 'Près de votre départ',
    'Request to join': 'Demander à se joindre',
    'Private group': 'Groupe privé',
    'Send a request to join from the Friends page.': 'Envoyez une demande à partir de la page Amis.',
    'Full · notify me': 'Complet · m’aviser',
    '· Not available for your membership': '· Non offert avec votre adhésion'
  });
  function REASON(s) { return tr(s); }
  pat(/^(.+) cannot play at this time$/, '$1 ne peut pas jouer à cette heure');
  pat(/^(.+) is no longer a member\. Please remove them from the group\.$/, '$1 n’est plus membre. Veuillez le retirer du groupe.');
  pat(/^(.+) is unable to play at present\. Please remove them or add a guest instead\.$/, '$1 ne peut pas jouer pour le moment. Veuillez le retirer ou ajouter un invité à sa place.');
  pat(/^You are already playing at (.+) that day\.$/, 'Vous jouez déjà à $1 ce jour-là.');
  pat(/^(.+) already has a round close to this time\. Please choose another companion or time\.$/, '$1 a déjà une partie proche de cette heure. Veuillez choisir un autre partenaire ou une autre heure.');
  pat(/^This time is outside your play times\. (.+)$/, function (m) { return 'Cette heure est hors de vos heures de jeu. ' + REASON(m[1]); });
  pat(/^(.+) cannot play at (.+?)\. (.+)$/, function (m) { return m[1] + ' ne peut pas jouer à ' + m[2] + '. ' + REASON(m[3]); });
  pat(/^(.+) cannot be booked for this date yet\. (.+)$/, function (m) { return 'On ne peut pas encore réserver pour ' + m[1] + ' à cette date. ' + REASON(m[2]); });
  pat(/^(.+) has just been reserved for (.+)\.$/, function (m) { return m[1] + ' vient d’être réservé pour ' + (m[2] === 'club use' ? 'le club' : m[2]) + '.'; });
  pat(/^Online booking is not available on your membership\. Please call the golf shop on (.+)\.$/, 'La réservation en ligne n’est pas offerte avec votre adhésion. Veuillez appeler la boutique du pro au $1.');
  pat(/^Someone booked (.+) a moment ago\. Refresh to see the latest tee times\.$/, 'Quelqu’un vient de réserver $1. Actualisez la page pour voir les dernières heures de départ.');
  pat(/^Someone booked (.+) a moment ago\. Please choose another time\.$/, 'Quelqu’un vient de réserver $1. Veuillez choisir une autre heure.');
  pat(/^Another player has just joined this group\. There (?:is now 1 spot|are now (\d+) spots) left\.$/, function (m) { return 'Un autre joueur vient de se joindre à ce groupe. Il reste maintenant ' + (m[1] ? m[1] + ' places.' : '1 place.'); });
  pat(/^Opens to you (.+)$/, 'Ouvert pour vous le $1');
  pat(/^You’re already playing at (.+)$/, 'Vous jouez déjà à $1');
  pat(/^Changes close two hours before play\. Please call the golf shop on (.+)\.$/, 'Les modifications ferment deux heures avant le jeu. Veuillez appeler la boutique du pro au $1.');
  pat(/^(.+) \((fast|medium|slow)\)$/, function (m) { return dec(m[1]) + ' (' + { fast: 'rapides', medium: 'moyens', slow: 'lents' }[m[2]] + ')'; });
  pat(/^Course open · First tee (.+) · (.+)$/, function (m) { return 'Parcours ouvert · Premier départ ' + m[1] + ' · ' + T(m[2]); });
  pat(/^(.+):$/, function (m) { var t = T(m[1]); return t !== m[1] ? t + NB + ':' : null; });
  pat(/^My tee times \((\d+)\)$/, 'Mes départs ($1)');
  pat(/^My tee times, (\d+) upcoming bookings?$/, function (m) { return 'Mes départs, ' + m[1] + ' ' + pl(m[1], 'réservation à venir', 'réservations à venir'); });
  pat(/^Call (.+)$/, 'Appeler le $1');
  pat(/^(.+) · Guests from (.+)$/, function (m) { return m[1].replace(/^Par /, 'Normale ') + ' · Invités à partir de ' + m[2]; });
  pat(/^Guests from (.+)$/, 'Invités à partir de $1');
  pat(/^No times for (\d+) players?$/, function (m) { return 'Aucune heure pour ' + m[1] + ' ' + pl(m[1], 'joueur', 'joueurs'); });
  pat(/^(\d+) times?$/, function (m) { return m[1] + ' ' + pl(m[1], 'heure', 'heures'); });
  pat(/^Your tee time · (.+)$/, 'Votre départ · $1');
  pat(/^(.+), (−?-?\d+)°$/, function (m) { return WX[m[1]] ? WX[m[1]] + ', ' + m[2] + '°' : null; });
  pat(/^(\d+) times? available$/, function (m) { return m[1] + ' ' + pl(m[1], 'heure disponible', 'heures disponibles'); });
  pat(/^Your (.+) membership plays any time, seven days a week\.$/, 'Votre adhésion $1 permet de jouer en tout temps, sept jours sur sept.');
  pat(/^Weekdays: (.+)$/, function (m) { return 'En semaine' + NB + ': ' + WIN(m[1]); });
  pat(/^Weekends and holidays: (.+)$/, function (m) { return 'Fins de semaine et jours fériés' + NB + ': ' + WIN(m[1]); });
  pat(/^(.+) · book (\d+) days ahead$/, '$1 · réservation $2 jours à l’avance');
  pat(/^Opens on (.+)$/, 'Ouvre le $1');
  pat(/^(.+) You can still book from tomorrow\.$/, function (m) { return (m[1] === 'There is no play today.' ? 'Aucun jeu aujourd’hui.' : m[1]) + ' Vous pouvez quand même réserver à partir de demain.'; });
  pat(/^The (morning|midday|afternoon) times have passed\.$/, function (m) { return { morning: 'Les heures du matin sont passées.', midday: 'Les heures du midi sont passées.', afternoon: 'Les heures de l’après-midi sont passées.' }[m[1]]; });
  pat(/^Nothing open in the (morning|midday|afternoon)\.$/, function (m) { return { morning: 'Rien de libre le matin.', midday: 'Rien de libre le midi.', afternoon: 'Rien de libre l’après-midi.' }[m[1]]; });
  pat(/^Try (.+) →$/, 'Essayer $1 →');
  pat(/^(\d+) open$/, function (m) { return m[1] + ' ' + pl(m[1], 'libre', 'libres'); });
  pat(/^(.+) (is|are) fully booked( for (\d+) players)?\.$/, function (m) {
    var names = et(m[1].replace(/(\d+) more days?/, function (x, n) { return n + ' ' + pl(n, 'autre jour', 'autres jours'); }));
    return names + (m[2] === 'is' ? ' est complet' : ' sont complets') + (m[4] ? ' pour ' + m[4] + ' joueurs' : '') + '.';
  });
  pat(/^See (.+)$/, 'Voir $1');
  pat(/^(.+), (Your tee time|Passed|Reserved|Near your tee time|Closed|Not open yet|Full|Full · notify me|\d+ spots?(?: left)?)(?:\. (.+?))?(\. Notify me if a spot opens)?$/, function (m) {
    return m[1] + ', ' + tr(m[2]) + (m[3] ? '. ' + REASON(m[3]) : '') + (m[4] ? '. M’aviser si une place se libère' : '');
  });
  pat(/^(\d+) players? · (\d+) holes( · joining a group)?$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + ' · ' + m[2] + ' trous' + (m[3] ? ' · se joindre à un groupe' : ''); });
  add({
    'Join this tee time': 'Se joindre à ce départ',
    'Confirm tee time': 'Confirmer le départ',
    'You’ve joined the group': 'Vous vous êtes joint au groupe',
    'You’re booked': 'Votre réservation est confirmée',
    'No fees due on your account.': 'Aucuns frais à votre compte.',
    'Please check in at the golf shop 15 minutes before.': 'Veuillez vous présenter à la boutique du pro 15 minutes avant.',
    'Add to calendar': 'Ajouter au calendrier',
    'Done': 'Terminé',
    'Refresh tee times': 'Actualiser les départs',
    'Choose another time': 'Choisir une autre heure',
    'Your tee time is confirmed': 'Votre départ est confirmé',
    'Tee times come with golf memberships': 'Les départs sont réservés aux adhésions golf',
    'Ask a golfing member': 'Demandez à un membre golfeur',
    'to add you to their tee time. They can find you by name when they book.': 'de vous ajouter à son départ. Il peut vous trouver par votre nom au moment de réserver.',
    'Your tee time shows up here': 'Votre départ s’affiche ici',
    'under My tee times, with the date, time and the other players.': 'sous Mes départs, avec la date, l’heure et les autres joueurs.',
    'Check in at the golf shop': 'Présentez-vous à la boutique du pro',
    '15 minutes before you play. The guest green fee goes on your host’s account.': '15 minutes avant de jouer. Les droits de jeu d’invité sont portés au compte de votre hôte.',
    'Call the golf shop': 'Appeler la boutique du pro',
    'Ask about golf membership': 'Se renseigner sur l’adhésion golf',
    'View my tee times': 'Voir mes départs',
    'Upcoming': 'À venir',
    'No tee times booked': 'Aucun départ réservé',
    'When a golfing member adds you to their tee time, it will show up here.': 'Quand un membre golfeur vous ajoutera à son départ, il s’affichera ici.',
    'Past rounds': 'Parties passées',
    'Rounds you finish will be listed here.': 'Les parties que vous terminez s’afficheront ici.',
    'Show more': 'Afficher plus',
    'On course': 'Sur le parcours',
    'Checked in': 'Enregistré',
    'Confirmed': 'Confirmé',
    'Walking': 'À pied',
    'A solo round': 'Une partie en solo',
    'Completed': 'Terminée',
    'No-show': 'Absent',
    'Upcoming tee times': 'Départs à venir',
    'a guest': 'un invité',
    'a public golfer': 'un golfeur public'
  });
  pat(/^You are joining (.+)\.$/, function (m) {
    return 'Vous vous joignez à ' + et(m[1].replace(/\ba guest\b/, 'un invité').replace(/(\d+) guests\b/, '$1 invités').replace(/\ba public golfer\b/, 'un golfeur public').replace(/(\d+) public golfers\b/, '$1 golfeurs publics')) + '.';
  });
  pat(/^(\d+) holes \(set by the group\)$/, '$1 trous (fixé par le groupe)');
  pat(/^(\d+) holes$/, '$1 trous');
  pat(/^(.+) \(guest\)(, .+)?$/, function (m) { return m[0].replace(/ \(guest\)/g, ' (invité)').replace(/^You\b|, You\b/g, function (x) { return x.replace('You', 'Vous'); }); });
  pat(/^You(, .+)$/, function (m) { return 'Vous' + m[1].replace(/ \(guest\)/g, ' (invité)'); });
  pat(/^(.+) due on your account at check-in\. Please check in at the golf shop 15 minutes before\.$/, '$1 à payer à votre compte à l’enregistrement. Veuillez vous présenter à la boutique du pro 15 minutes avant.');
  pat(/^No fees due on your account\. Please check in at the golf shop 15 minutes before\.$/, 'Aucuns frais à votre compte. Veuillez vous présenter à la boutique du pro 15 minutes avant.');
  pat(/^You have joined the (.+) group$/, 'Vous vous êtes joint au groupe de $1');
  pat(/^As a (.+) member, you can play when a golfing member adds you to their tee time\.$/, 'À titre de membre $1, vous pouvez jouer quand un membre golfeur vous ajoute à son départ.');
  pat(/^You have (\d+) tee times? coming up as a guest\.$/, function (m) { return 'Vous avez ' + m[1] + ' ' + pl(m[1], 'départ', 'départs') + ' à venir comme invité.'; });
  pat(/^View all upcoming \((\d+)\)$/, 'Voir tous les départs à venir ($1)');
  pat(/^(\d+) rounds? played$/, function (m) { return m[1] + ' ' + pl(m[1], 'partie jouée', 'parties jouées'); });
  pat(/^(.+) at (.+), (On course|Checked in|Confirmed)\. Open details$/, function (m) { return m[1] + ' à ' + m[2] + ', ' + T(m[3]) + '. Ouvrir les détails'; });
  pat(/^(\d+) holes · (Cart|Walking) · (.+)$/, function (m) { return m[1] + ' trous · ' + T(m[2]) + ' · ' + (m[3] === 'Just you' ? 'Vous seul' : 'Avec ' + et(m[3].replace(/^With /, ''))); });
  pat(/^(.+) · (.+) · (\d+) holes$/, function (m) { return T(m[1]) + ' · ' + T(m[2]) + ' · ' + m[3] + ' trous'; });
  pat(/^(With [A-Z\d].*|A solo round)( · (\d+)h (\d+)m)?$/, function (m) {
    return (m[1] === 'A solo round' ? 'Une partie en solo' : 'Avec ' + et(m[1].replace(/^With /, ''))) + (m[2] ? ' · ' + m[3] + ' h ' + m[4] : '');
  });
  add({
    'This tee time has changed. Please check with the golf shop': 'Cette heure de départ a changé. Veuillez vérifier auprès de la boutique du pro',
    'Changes close two hours before play. Please call the golf shop': 'Les modifications ferment deux heures avant le jeu. Veuillez appeler la boutique du pro',
    'Guest ·': 'Invité ·',
    'Member ·': 'Membre ·',
    'Notes:': 'Notes' + NB + ':',
    'Less than 2 hours to go. To make changes, call the golf shop on': 'Moins de 2 heures avant le départ. Pour faire des modifications, appelez la boutique du pro au',
    'Modify': 'Modifier',
    'Change': 'Modifier',
    'Cancel': 'Annuler',
    'Withdraw': 'Se retirer',
    'Calendar': 'Calendrier',
    'Your tee time': 'Votre départ',
    'Cancel this tee time?': 'Annuler ce départ?',
    'Withdraw from this round?': 'Vous retirer de cette partie?',
    'Keep tee time': 'Garder le départ',
    'Cancel tee time': 'Annuler le départ',
    'Your tee time has been cancelled': 'Votre départ a été annulé',
    'You have withdrawn from the round': 'Vous vous êtes retiré de la partie',
    'Save changes': 'Enregistrer les modifications',
    'Guests settle on the host’s account. Please ask the golf shop to add guests to this group.': 'Les invités sont facturés au compte de l’hôte. Veuillez demander à la boutique du pro d’ajouter des invités à ce groupe.',
    'Only the member who booked can add guests to this group.': 'Seul le membre qui a réservé peut ajouter des invités à ce groupe.',
    'This tee time was changed elsewhere a moment ago.': 'Cette heure de départ vient d’être modifiée ailleurs.',
    'Refresh': 'Actualiser',
    'You cannot remove yourself here. Cancel the tee time instead.': 'Vous ne pouvez pas vous retirer ici. Annulez plutôt le départ.',
    'Your tee time has been updated': 'Votre départ a été mis à jour'
  });
  pat(/^(Guest|Member) · (Cart|Walking)$/, function (m) { return T(m[1]) + ' · ' + T(m[2]); });
  pat(/^(\d+) holes ·$/, '$1 trous ·');
  pat(/^Your (.+) tee time on (.+) will be released( for all (\d+) players in the group)?\. The golf shop will let anyone you invited know\.$/, function (m) {
    return 'Votre départ de ' + m[1] + ' le ' + m[2] + ' sera libéré' + (m[3] ? ' pour les ' + m[4] + ' joueurs du groupe' : '') + '. La boutique du pro avisera les personnes que vous avez invitées.';
  });
  pat(/^You will be removed from the (.+) group on (.+?)(, along with (the guest|the (\d+) guests) you brought)?\. The rest of the group keeps its tee time\.$/, function (m) {
    return 'Vous serez retiré du groupe de ' + m[1] + ' le ' + m[2] + (m[3] ? (m[5] ? ', avec les ' + m[5] + ' invités que vous avez amenés' : ', avec l’invité que vous avez amené') : '') + '. Le reste du groupe garde son heure de départ.';
  });
  pat(/^Change your (.+) tee time$/, 'Modifier votre départ de $1');
  pat(/^Your spot at (.+) tee time$/, 'Votre place au départ de $1');
  /* ---------------- Dining (js/portal/dining.js) ---------------- */
  var MEAL = { 'Breakfast': 'Déjeuner', 'Lunch': 'Dîner', 'Dinner': 'Souper' };
  add(MEAL);
  /* Rooms: the two named rooms keep their names; the generic ones are translated. */
  var ROOM = { 'Patio': 'Terrasse', 'Banquet Hall': 'Salle de banquet' };
  add(ROOM);
  function room(s) { return ROOM[s] || s; }
  var OCC = { 'Birthday': 'Anniversaire de naissance', 'Anniversary': 'Anniversaire', 'Business dinner': 'Repas d’affaires', 'Member-guest': 'Membre-invité', 'Celebration': 'Célébration', 'Private party': 'Réception privée' };
  add(OCC);
  function occ(s) { return OCC[s] || s; }
  function hrs(s) { /* "7:00 to 10:30 AM", "11:30 AM to 3:00 PM" -> "7 h à 10 h 30" */
    return String(s).replace(/(\d{1,2}):(\d{2})(?: (AM|PM))?/g, function (x, h, mi, ap) {
      h = +h; if (ap === 'PM' && h < 12) h += 12;
      return h + ' h' + (mi === '00' ? '' : ' ' + mi);
    }).replace(/ (AM|PM)\b/g, '').replace(/ to /g, ' à ');
  }
  add({
    'Gluten free': 'Sans gluten',
    'Vegetarian': 'Végétarien',
    'Vegan': 'Végane',
    'Seated': 'Attablé',
    'Dined': 'Repas pris',
    'Cancelled': 'Annulé',
    'Not attended': 'Absent',
    'Golf casual': 'Tenue de golf décontractée',
    'golf casual': 'tenue de golf décontractée',
    'As your host wishes': 'Selon le souhait de votre hôte',
    'On the second floor of the clubhouse, overlooking the 18th hole. A diverse menu in a casual, relaxing atmosphere, six local beers on tap and our famous Friday night pizza.': 'Au deuxième étage du pavillon, avec vue sur le 18e trou. Un menu varié dans une ambiance décontractée et relaxante, six bières locales en fût et notre fameuse pizza du vendredi soir.',
    'Breakfast, lunch and dinner every day. Longer hours in golf season. Breakfast until 2:00 PM.': 'Déjeuner, dîner et souper tous les jours. Heures prolongées pendant la saison de golf. Déjeuner servi jusqu’à 14 h.',
    'A relaxed spot for a pint from the local taps and something from the Gallery menu.': 'Un endroit détendu pour une pinte de bière locale en fût et un plat du menu du Gallery.',
    'Outdoor tables at the clubhouse, for a casual meal in the warmer months.': 'Des tables extérieures au pavillon, pour un repas décontracté pendant la belle saison.',
    'In golf season, weather permitting.': 'Pendant la saison de golf, si la météo le permet.',
    'Weddings and special events, with all-inclusive packages and seating for up to 220 guests.': 'Mariages et événements spéciaux, avec forfaits tout compris et places pour jusqu’à 220 invités.',
    'Year-round, by arrangement with our events team.': 'Toute l’année, sur entente avec notre équipe des événements.',
    'Second floor, overlooking the 18th hole': 'Deuxième étage, vue sur le 18e trou',
    'Local taps and the Gallery menu': 'Bières locales en fût et menu du Gallery',
    'Outdoor tables in the warmer months': 'Tables extérieures pendant la belle saison',
    'Closed today': 'Fermé aujourd’hui',
    'Next': 'Prochain',
    'Reserve a table, browse the menus and manage your bookings.': 'Réservez une table, consultez les menus et gérez vos réservations.',
    'Reserve': 'Réserver',
    'My reservations': 'Mes réservations',
    'Menus': 'Menus',
    'When': 'Quand',
    'Party': 'Groupe',
    'Status': 'Statut',
    'Occasion': 'Occasion',
    'Notes': 'Notes',
    'Dress code': 'Code vestimentaire',
    'Cancel reservation': 'Annuler la réservation',
    'View all my reservations': 'Voir toutes mes réservations',
    'Occasion, allergies or requests': 'Occasion, allergies ou demandes',
    'Allergies or diet': 'Allergies ou régime',
    'For example: shellfish allergy': 'Par exemple' + NB + ': allergie aux fruits de mer',
    'The kitchen sees this with your reservation.': 'La cuisine voit cette information avec votre réservation.',
    'Special requests': 'Demandes spéciales',
    'A window table, a high chair, a birthday dessert': 'Une table près de la fenêtre, une chaise haute, un dessert d’anniversaire',
    'About this place': 'À propos de cet endroit',
    'Full menu': 'Menu complet',
    'Where': 'Où',
    'Where would you like to sit?': 'Où aimeriez-vous vous asseoir?',
    'Events and weddings · call to book': 'Événements et mariages · réservation par téléphone',
    'Finished for today': 'Terminé pour aujourd’hui',
    'Your table': 'Votre table',
    'For hours, call': 'Pour les heures, appelez le'
  });
  pat(/^For hours, call the club office at (.+)\.$/, 'Pour les heures, appelez le bureau du club au $1.');
  pat(/^Today (.+) to (.+)$/, 'Aujourd’hui de $1 à $2');
  pat(/^(\d+) guests?$/, function (m) { return m[1] + ' ' + pl(m[1], 'convive', 'convives'); });
  pat(/^(.+) · (\d+) reservations$/, '$1 · $2 réservations');
  pat(/^(.+) · (.+) · (.+) · (\d+) guests?$/, function (m) { return m[1] + ' · ' + m[2] + ' · ' + room(m[3]) + ' · ' + m[4] + ' ' + pl(m[4], 'convive', 'convives'); });
  pat(/^(.+) · (.+) · (\d+) guests?$/, function (m) { return m[1] + ' · ' + room(m[2]) + ' · ' + m[3] + ' ' + pl(m[3], 'convive', 'convives'); });
  pat(/^(\d+) upcoming$/, '$1 à venir');
  pat(/^To change this reservation, call (.+)\.$/, 'Pour modifier cette réservation, appelez le $1.');
  pat(/^To change this reservation, call$/, 'Pour modifier cette réservation, appelez le');
  pat(/^Dress code: (.+)$/, function (m) { return 'Code vestimentaire' + NB + ': ' + T(m[1]); });
  pat(/^On the menu: (.+)$/, function (m) { return 'Au menu' + NB + ': ' + (SEC[m[1].charAt(0).toUpperCase() + m[1].slice(1)] || m[1]).toLowerCase(); });
  pat(/^(.+) · (Today .+|Closed today) · Dress code: (.+)$/, function (m) { return T(m[1]) + ' · ' + tr(m[2]) + ' · Code vestimentaire' + NB + ': ' + T(m[3]); });
  pat(/^(\d+) times?$/, function (m) { return m[1] + ' ' + pl(m[1], 'heure', 'heures'); });
  var SEC = { 'Breakfast': 'Déjeuner', 'Soup & salads': 'Soupes et salades', 'Sandwiches': 'Sandwichs', 'Sides': 'Accompagnements', 'Snacks & shares': 'Bouchées à partager',
    'Baskets & bowls': 'Paniers et bols', 'Handhelds': 'À la main', 'Main attractions': 'Plats principaux', 'On tap': 'En fût' };
  add(SEC);
  add({
    'Guests': 'Invités',
    'Meal': 'Repas',
    'Time': 'Heure',
    'No special occasion': 'Aucune occasion spéciale',
    'Confirm your table': 'Confirmer votre table',
    'Tables are held for 15 minutes. Meals can be charged to your member account.': 'Les tables sont gardées 15 minutes. Les repas peuvent être portés à votre compte de membre.',
    'Confirm': 'Confirmer',
    'Your table is reserved': 'Votre table est réservée',
    'You can change it under My reservations, or call': 'Vous pouvez la modifier sous Mes réservations, ou appeler le',
    'Please choose a time for your table.': 'Veuillez choisir une heure pour votre table.',
    'Please keep dietary notes under 160 characters.': 'Veuillez limiter les notes alimentaires à 160 caractères.',
    'Please keep special requests under 500 characters.': 'Veuillez limiter les demandes spéciales à 500 caractères.',
    'That time has just been taken. Please choose another.': 'Cette heure vient d’être prise. Veuillez en choisir une autre.',
    'No upcoming reservations': 'Aucune réservation à venir',
    'When you reserve a table, it appears here.': 'Quand vous réservez une table, elle apparaît ici.',
    'Past visits': 'Visites passées',
    'None yet': 'Aucune pour l’instant',
    'Your past visits will appear here.': 'Vos visites passées apparaîtront ici.',
    'Upcoming reservations': 'Réservations à venir',
    'Cancel this reservation?': 'Annuler cette réservation?',
    'This reservation can no longer be changed online': 'Cette réservation ne peut plus être modifiée en ligne',
    'Your reservation has been cancelled': 'Votre réservation a été annulée',
    'Change your table': 'Modifier votre table',
    'No times left for this meal.': 'Plus aucune heure pour ce repas.',
    'Please choose a time.': 'Veuillez choisir une heure.',
    'No changes made': 'Aucune modification',
    'Your reservation has been updated': 'Votre réservation a été mise à jour',
    'Breakfast until 2:00 PM · pizza night every Friday.': 'Déjeuner jusqu’à 14 h · soirée pizza tous les vendredis.',
    'The menu is being updated': 'Le menu est en cours de mise à jour',
    'Please ask your server about today’s specials.': 'Demandez à votre serveur les spéciaux du jour.',
    'Tell your server about any allergies. Prices in CAD, plus tax.': 'Informez votre serveur de toute allergie. Prix en dollars canadiens, taxes en sus.',
    'Show the menu for': 'Afficher le menu de',
    'Larger parties: call': 'Groupes plus nombreux' + NB + ': appelez le'
  });
  pat(/^(\d{1,2}:\d{2}(?: [AP]M)? to \d{1,2}:\d{2} [AP]M)( · (\d+) open)?$/, function (m) { return hrs(m[1]) + (m[2] ? ' · ' + m[3] + ' ' + pl(m[3], 'libre', 'libres') : ''); });
  pat(/^(Breakfast|Lunch|Dinner) times$/, function (m) { return 'Heures du ' + MEAL[m[1]].toLowerCase(); });
  pat(/^(.+), full$/, '$1, complet');
  pat(/^The (.+) is closed on this day\. Please choose another date\.$/, function (m) { return 'Le ' + room(m[1]) + ' est fermé ce jour-là. Veuillez choisir une autre date.'; });
  pat(/^(Breakfast|Lunch|Dinner) has finished for today\. Choose another meal or date\.$/, function (m) { return 'Le service du ' + MEAL[m[1]].toLowerCase() + ' est terminé pour aujourd’hui. Choisissez un autre repas ou une autre date.'; });
  pat(/^No tables left for (\d+) guests? at (breakfast|lunch|dinner)\. Try another meal or date\.$/, function (m) { return 'Plus de table pour ' + m[1] + ' ' + pl(m[1], 'convive', 'convives') + ' au ' + MEAL[m[2].charAt(0).toUpperCase() + m[2].slice(1)].toLowerCase() + '. Essayez un autre repas ou une autre date.'; });
  pat(/^You already have a table at (.+) in the (.+) that day\. Change it from My reservations\.$/, function (m) { return 'Vous avez déjà une table à ' + m[1] + ' au ' + room(m[2]) + ' ce jour-là. Modifiez-la depuis Mes réservations.'; });
  pat(/^(.+) · (.+), (.+) · (\d+) guests?$/, function (m) { return room(m[1]) + ' · ' + m[2] + ', ' + m[3] + ' · ' + m[4] + ' ' + pl(m[4], 'convive', 'convives'); });
  pat(/^(\d+) guests? · (.+)$/, function (m) { return m[1] + ' ' + pl(m[1], 'convive', 'convives') + ' · ' + occ(m[2]); });
  pat(/^View all upcoming \((\d+)\)$/, 'Voir tout ce qui est à venir ($1)');
  pat(/^(\d+) visits?$/, function (m) { return m[1] + ' ' + pl(m[1], 'visite', 'visites'); });
  pat(/^(.+) at (.+) · (\d+) guests?$/, function (m) { return m[1] + ' à ' + m[2] + ' · ' + m[3] + ' ' + pl(m[3], 'convive', 'convives'); });
  pat(/^Your table for (\d+) guests? at the (.+) on (.+) at (.+) will be released\.$/, function (m) { return 'Votre table pour ' + m[1] + ' ' + pl(m[1], 'convive', 'convives') + ' au ' + room(m[2]) + ' le ' + m[3] + ' à ' + m[4] + ' sera libérée.'; });
  pat(/^This reservation can no longer be changed online\. Please call (.+)\.$/, 'Cette réservation ne peut plus être modifiée en ligne. Veuillez appeler le $1.');
  pat(/^There is no table for (\d+) guests? at (.+)\. Please choose another time\.$/, function (m) { return 'Il n’y a pas de table pour ' + m[1] + ' ' + pl(m[1], 'convive', 'convives') + ' à ' + m[2] + '. Veuillez choisir une autre heure.'; });
  pat(/^You have another table at (.+) that day\.$/, 'Vous avez une autre table à $1 ce jour-là.');
  pat(/^The (.+) serves the Gallery kitchen menu\. Breakfast until 2:00 PM · pizza night every Friday\.$/, function (m) { return 'Le ' + room(m[1]) + ' sert le menu de la cuisine du Gallery. Déjeuner jusqu’à 14 h · soirée pizza tous les vendredis.'; });
  pat(/^(\d+) items? · from (.+)$/, function (m) { return m[1] + ' ' + pl(m[1], 'plat', 'plats') + ' · à partir de ' + m[2]; });
  pat(/^Show all \((\d+)\)$/, 'Tout afficher ($1)');
  pat(/^Menu for (.+)\. Change place$/, function (m) { return 'Menu du ' + room(m[1]) + '. Changer d’endroit'; });
  pat(/^(.+) · (.+)$/, function (m) { return ROOM[m[2]] ? m[1] + ' · ' + ROOM[m[2]] : (ROOM[m[1]] ? ROOM[m[1]] + ' · ' + m[2] : null); });
  /* ---------------- Events (js/portal/events.js) ---------------- */
  var ETYPE = { 'Tournament': 'Tournoi', 'Member-guest': 'Membre-invité', 'Member-Guest': 'Membre-invité', 'League': 'Ligue', 'Ladies': 'Dames', 'Corporate': 'Entreprise',
    'Social': 'Social', 'Private': 'Privé', 'Tournaments': 'Tournois', 'League nights': 'Soirées de ligue', 'Juniors': 'Juniors' };
  add(ETYPE);
  add({
    'Former member': 'Ancien membre',
    'Free': 'Gratuit',
    'Time to be confirmed': 'Heure à confirmer',
    'Even par': 'Normale',
    'This competition is for golfing members. The club office will be happy to suggest another event for you.': 'Cette compétition est réservée aux membres golfeurs. Le bureau du club se fera un plaisir de vous suggérer un autre événement.',
    'This is a private occasion arranged through the club office.': 'Il s’agit d’une réception privée organisée par le bureau du club.',
    'Going': 'Inscrit',
    'Live': 'En direct',
    'Final results': 'Résultats finaux',
    'No players have been entered yet.': 'Aucun joueur n’a encore été inscrit.',
    'Position': 'Position',
    'Player': 'Joueur',
    'Points': 'Points',
    'Score': 'Score',
    'Not started': 'Pas commencé',
    'holes': 'trous',
    'Stableford points': 'Points Stableford',
    'Net': 'Net',
    'Gross': 'Brut',
    'Net or gross scores': 'Scores nets ou bruts'
  });
  pat(/^(.+) per person$/, '$1 par personne');
  pat(/^(.+) to (\d.+)$/, function (m) { return /\d/.test(m[1]) && !/[a-z]{4,}/i.test(m[1].replace(/\bh\b/g, '')) ? m[1] + ' à ' + m[2] : null; });
  pat(/^Online registration is open to members in good standing\. Please call the club office on (.+)\.$/, 'L’inscription en ligne est offerte aux membres en règle. Veuillez appeler le bureau du club au $1.');
  pat(/^(\d+) under par$/, '$1 sous la normale');
  pat(/^(\d+) over par$/, '$1 au-dessus de la normale');
  pat(/^(\d+) of (\d+) filled · Registration closed$/, '$1 sur $2 places prises · Inscriptions fermées');
  pat(/^(\d+) of (\d+) filled · Full$/, '$1 sur $2 places prises · Complet');
  pat(/^Only (\d+) spots? left$/, function (m) { return m[1] === '1' ? 'Plus que 1 place' : 'Plus que ' + m[1] + ' places'; });
  pat(/^(.+) · (.+) · (Free|.*\$.*)$/, function (m) { return tr(m[1]) + ' · ' + room(m[2]) + ' · ' + T(m[3]); });
  pat(/^(\d+) points$/, '$1 points');
  pat(/^Top (\d+) only$/, 'Les $1 premiers seulement');
  pat(/^Full leaderboard \((\d+)\)$/, 'Classement complet ($1)');
  pat(/^Leaderboard: (.+)$/, 'Classement' + NB + ': $1');
  pat(/^(.+) · (Stableford|Stroke play|Match play|Scramble|Best ball)$/, function (m) { return m[1] + ' · ' + T(m[2]); });
  pat(/^Par (\d+) · Net uses full course handicap · (Updated as cards come in|Confirmed by the golf shop)$/, function (m) {
    return 'Normale ' + m[1] + ' · Le net utilise le handicap de parcours complet · ' + (m[2] === 'Updated as cards come in' ? 'Mis à jour à la remise des cartes' : 'Confirmé par la boutique du pro');
  });
  add({
    'Top 5 · net': '5 premiers · net',
    'Full leaderboard': 'Classement complet',
    'View leaderboard': 'Voir le classement',
    'My events': 'Mes événements',
    'You haven’t registered for any events yet. Choose one below.': 'Vous n’êtes inscrit à aucun événement pour l’instant. Choisissez-en un ci-dessous.',
    'Show events': 'Afficher les événements',
    'All events': 'Tous les événements',
    'No events to show': 'Aucun événement à afficher',
    'New events will appear here as soon as the club announces them.': 'Les nouveaux événements apparaîtront ici dès que le club les annoncera.',
    'There are no upcoming events of this type. Try another filter.': 'Aucun événement à venir de ce type. Essayez un autre filtre.',
    'No leaderboards right now': 'Aucun classement pour le moment',
    'Results from live and recent tournaments appear here.': 'Les résultats des tournois en cours et récents apparaissent ici.',
    'Tournament': 'Tournoi',
    'Choose a tournament': 'Choisissez un tournoi',
    'Event not found': 'Événement introuvable',
    'This event may have been cancelled or not announced yet.': 'Cet événement a peut-être été annulé ou n’a pas encore été annoncé.',
    'See all events': 'Voir tous les événements',
    'Leaderboard': 'Classement',
    'Less': 'Moins',
    'You’re registered': 'Vous êtes inscrit',
    'Who’s going': 'Participants',
    'Charged to your account': 'Porté à votre compte',
    'No charge': 'Sans frais',
    'View receipt': 'Voir le reçu',
    'View receipts': 'Voir les reçus',
    'You’re going': 'Vous y allez',
    'Fees for this event are settled with the club office.': 'Les frais de cet événement se règlent avec le bureau du club.',
    'This event is free.': 'Cet événement est gratuit.',
    'Change guests': 'Modifier les invités',
    'Cancel registration': 'Annuler l’inscription',
    'This event has been cancelled. The club office will contact you about any fees.': 'Cet événement a été annulé. Le bureau du club communiquera avec vous au sujet des frais.',
    'This event has been cancelled': 'Cet événement a été annulé',
    'This event will not go ahead. See the calendar for other events.': 'Cet événement n’aura pas lieu. Consultez le calendrier pour d’autres événements.',
    'This event has finished': 'Cet événement est terminé',
    'Thank you to everyone who came. See the calendar for upcoming events.': 'Merci à tous ceux qui sont venus. Consultez le calendrier pour les événements à venir.',
    'Registration closed': 'Inscriptions fermées',
    'This event is full': 'Cet événement est complet',
    'Registration through the club office': 'Inscription par le bureau du club',
    'All events': 'Tous les événements'
  });
  pat(/^(\d+) upcoming · (You’re going to (\d+)|You haven’t registered for any yet)$/, function (m) {
    return m[1] + ' à venir · ' + (m[3] ? 'Vous êtes inscrit à ' + m[3] : 'Vous n’êtes inscrit à aucun pour l’instant');
  });
  pat(/^(.+) · (You \+ (\d+) guests?|Just you)$/, function (m) { return room(m[1]) + ' · ' + (m[3] ? 'Vous + ' + m[3] + ' ' + pl(m[3], 'invité', 'invités') : 'Vous seul'); });
  pat(/^Live now: (.+)$/, 'En direct' + NB + ': $1');
  pat(/^All my events \((\d+)\)$/, 'Tous mes événements ($1)');
  pat(/^(\d+) events?$/, function (m) { return m[1] + ' ' + pl(m[1], 'événement', 'événements'); });
  pat(/^More in (.+)$/, 'Plus en $1');
  pat(/^(.+) · (.+) · (You \+ (\d+) guests?|Just you)$/, function (m) { return m[1] + ' · ' + room(m[2]) + ' · ' + (m[4] ? 'Vous + ' + m[4] + ' ' + pl(m[4], 'invité', 'invités') : 'Vous seul'); });
  pat(/^(Live|Final) · (.+) · (.+)$/, function (m) { return (m[1] === 'Live' ? 'En direct · ' : 'Final · ') + m[2] + ' · ' + T(m[3]); });
  pat(/^(Live now|Final results) · (.+)$/, function (m) { return (m[1] === 'Live now' ? 'En direct · ' : 'Résultats finaux · ') + m[2]; });
  pat(/^You and (\d+) guests?$/, function (m) { return 'Vous et ' + m[1] + ' ' + pl(m[1], 'invité', 'invités'); });
  pat(/^(.+) · (.+) at (.+)$/, function (m) { return /\d/.test(m[3]) ? m[1] + ' · ' + m[2] + ' à ' + m[3] : null; });
  pat(/^You’re going with (\d+) guests?$/, function (m) { return 'Vous y allez avec ' + m[1] + ' ' + pl(m[1], 'invité', 'invités'); });
  pat(/^Guests: (.+)$/, 'Invités' + NB + ': $1');
  pat(/^(.+) charged to your account \(Events\)\.$/, '$1 porté à votre compte (Événements).');
  pat(/^Registration is closed\. To make a change, call (.+)\.$/, 'Les inscriptions sont fermées. Pour faire une modification, appelez le $1.');
  pat(/^This event has started\. If you are arriving late, call the club office on (.+)\.$/, 'Cet événement est commencé. Si vous arrivez en retard, appelez le bureau du club au $1.');
  pat(/^All spots are taken\. If a spot opens up, the club office on (.+) can help\.$/, 'Toutes les places sont prises. Si une place se libère, le bureau du club au $1 peut vous aider.');
  add({
    'See all events': 'Voir tous les événements',
    'Change your guests': 'Modifier vos invités',
    'Register': 'S’inscrire',
    'Keep as it was': 'Garder tel quel',
    'Free for members and guests': 'Gratuit pour les membres et les invités',
    'No change to your account': 'Aucun changement à votre compte',
    'New total': 'Nouveau total',
    'Total': 'Total',
    'This event is no longer available.': 'Cet événement n’est plus disponible.',
    'Registration for this event is closed.': 'Les inscriptions à cet événement sont fermées.',
    'You are already registered for this event.': 'Vous êtes déjà inscrit à cet événement.',
    'This event is now full.': 'Cet événement est maintenant complet.',
    'Your registration could not be found. Please refresh.': 'Votre inscription est introuvable. Veuillez actualiser la page.',
    'Guest names saved': 'Noms des invités enregistrés',
    'Your guests have been updated': 'Vos invités ont été mis à jour',
    'No change': 'Aucun changement',
    'Free for members and guests.': 'Gratuit pour les membres et les invités.',
    'Charged to your member account when you confirm.': 'Porté à votre compte de membre lorsque vous confirmez.',
    'Added to your member account when you confirm.': 'Ajouté à votre compte de membre lorsque vous confirmez.',
    'A credit on your member account when you confirm.': 'Un crédit à votre compte de membre lorsque vous confirmez.',
    'Nothing changes on your account.': 'Rien ne change à votre compte.',
    'You can cancel online until the event starts, and what you paid comes back as a credit on your account.': 'Vous pouvez annuler en ligne jusqu’au début de l’événement; le montant payé vous revient en crédit à votre compte.',
    'You can cancel online until the event starts.': 'Vous pouvez annuler en ligne jusqu’au début de l’événement.',
    'If you remove guests later, their fee comes back as a credit.': 'Si vous retirez des invités plus tard, leurs frais vous reviennent en crédit.',
    'Your other spots stay as they are.': 'Vos autres places restent telles quelles.',
    'Confirm change': 'Confirmer la modification',
    'Confirm registration': 'Confirmer l’inscription',
    'Event': 'Événement',
    'Change to your bill': 'Changement à votre facture',
    'Confirm your change': 'Confirmer votre modification',
    'Confirm your registration': 'Confirmer votre inscription',
    'Back': 'Retour',
    'Member registration': 'Inscription du membre',
    'Guest registration': 'Inscription d’invité'
  });
  pat(/^(This event is played with a guest\. )?(Only your own spot is left\.|Change the number of guests with − and \+ below \(up to (\d+)\)\.|Bringing someone\? Use Add a guest below \(up to (\d+)\)\.)$/, function (m) {
    var a = m[1] ? 'Cet événement se joue avec un invité. ' : '';
    if (m[3]) return a + 'Modifiez le nombre d’invités avec − et + ci-dessous (jusqu’à ' + m[3] + ').';
    if (m[4]) return a + 'Vous amenez quelqu’un? Utilisez Ajouter un invité ci-dessous (jusqu’à ' + m[4] + ').';
    return a + 'Il ne reste que votre place.';
  });
  pat(/^Guest (\d+) name \(optional\)$/, 'Nom de l’invité $1 (facultatif)');
  pat(/^(\d+) (people|person) × (.+), charged to your member account$/, function (m) { return m[1] + ' ' + pl(m[1], 'personne', 'personnes') + ' × ' + m[3] + ', porté à votre compte de membre'; });
  pat(/^(.+) will be added to your account$/, '$1 sera ajouté à votre compte');
  pat(/^A credit of (.+) will be added to your account$/, 'Un crédit de $1 sera ajouté à votre compte');
  pat(/^Please choose between 0 and (\d+) guests\.$/, 'Veuillez choisir entre 0 et $1 invités.');
  pat(/^Only (\d+) spots? (is|are) left\.$/, function (m) { return 'Il ne reste que ' + m[1] + ' ' + pl(m[1], 'place', 'places') + '.'; });
  pat(/^Only (\d+) guest spots are left\.$/, 'Il ne reste que $1 places d’invité.');
  pat(/^You’re registered\. (.+) charged to your account$/, 'Vous êtes inscrit. $1 porté à votre compte');
  pat(/^(.+) more$/, function (m) { return /\$/.test(m[1]) ? m[1] + ' de plus' : null; });
  pat(/^(.+) back$/, function (m) { return /\$/.test(m[1]) ? m[1] + ' remboursé' : null; });
  pat(/^Confirm and pay (.+)$/, 'Confirmer et payer $1');
  pat(/^(\d+) guest (place|places) released$/, function (m) { return m[1] + ' ' + pl(m[1], 'place d’invité libérée', 'places d’invité libérées'); });
  var DAYW = { 'Monday': 'lundi', 'Tuesday': 'mardi', 'Wednesday': 'mercredi', 'Thursday': 'jeudi', 'Friday': 'vendredi', 'Saturday': 'samedi', 'Sunday': 'dimanche' };
  var NINE = { 'Back nine': 'Retour', 'Front nine': 'Aller', 'Eighteen holes': 'Dix-huit trous' };
  add(NINE);
  var FMT = { 'Stroke play': 'Partie par coups', 'Stableford': 'Stableford', 'Four-ball': 'Quatre balles', 'Match play': 'Partie par trous', 'Scramble': 'Mêlée', 'Best ball': 'Meilleure balle' };
  add(FMT);
  function ord(s) { return String(s).replace(/(\d+)(st|nd|rd|th)\b/g, function (x, n) { return n + (n === '1' ? 're' : 'e'); }); }
  add({
    'Registration cancelled': 'Inscription annulée',
    'Cancel your registration?': 'Annuler votre inscription?',
    'Save': 'Enregistrer',
    'Events sections': 'Sections des événements',
    'Calendar': 'Calendrier',
    'League': 'Ligue',
    'New': 'Nouveau',
    'No change': 'Aucun changement',
    'The league isn’t set up yet': 'La ligue n’est pas encore organisée',
    'Join the league': 'Se joindre à la ligue',
    'Join the league?': 'Se joindre à la ligue?',
    'Standings will appear after the first league night.': 'Le classement apparaîtra après la première soirée de ligue.',
    'The roster is being prepared.': 'La liste des joueurs est en préparation.',
    'Move': 'Variation',
    'No rounds yet': 'Aucune partie pour l’instant',
    'Season complete': 'Saison terminée',
    'In season': 'En saison',
    'Standings': 'Classement',
    'Move is the change since the last league night.': 'La variation indique le changement depuis la dernière soirée de ligue.',
    'The league could not be found. Please refresh.': 'La ligue est introuvable. Veuillez actualiser la page.',
    'The league is for golfing members.': 'La ligue est réservée aux membres golfeurs.',
    'This season has finished.': 'Cette saison est terminée.',
    'Show recent weeks only': 'Afficher seulement les semaines récentes',
    'Next league night': 'Prochaine soirée de ligue',
    'No more league nights are scheduled.': 'Aucune autre soirée de ligue n’est prévue.',
    'Your season': 'Votre saison',
    'Results to come': 'Résultats à venir',
    'Absent': 'Absent',
    'Did not play': 'N’a pas joué',
    'Your weekly results will appear here after your first league night.': 'Vos résultats hebdomadaires apparaîtront ici après votre première soirée de ligue.',
    'Recent winners': 'Gagnants récents',
    'Final standings': 'Classement final',
    'Before the first league night': 'Avant la première soirée de ligue',
    'Points by net finish each night': 'Points selon le rang net de chaque soirée'
  });
  pat(/^(Your spots for you and (\d+) guests?|Your spot) at (.+) will be released\.( A credit of (.+) will be added to your account\.)?$/, function (m) {
    return (m[2] ? 'Vos places, pour vous et ' + m[2] + ' ' + pl(m[2], 'invité', 'invités') + ', à « ' : 'Votre place à « ').replace(/« /, '«' + NB) + m[3] + NB + '» sera libérée.'.replace('sera', m[2] ? 'seront' : 'sera').replace('libérée', m[2] ? 'libérées' : 'libérée') +
      (m[4] ? ' Un crédit de ' + m[5] + ' sera ajouté à votre compte.' : '');
  });
  pat(/^Registration cancelled\. A credit has been added to your account$/, 'Inscription annulée. Un crédit a été ajouté à votre compte');
  pat(/^(Up|Down) (\d+)$/, function (m) { return (m[1] === 'Up' ? 'En hausse de ' : 'En baisse de ') + m[2]; });
  pat(/^The golf shop will post the league season here\. Questions\? Call the club office on (.+)\.$/, 'La boutique du pro affichera la saison de la ligue ici. Des questions? Appelez le bureau du club au $1.');
  pat(/^It’s free to join\. Play the (.+)s that suit you\. Your points count from the nights you play\.$/, function (m) { return 'L’inscription est gratuite. Jouez les ' + (DAYW[m[1].charAt(0).toUpperCase() + m[1].slice(1)] || m[1]) + 's qui vous conviennent. Vos points comptent à partir des soirées où vous jouez.'; });
  pat(/^The (\d{4}) season has finished\. Ask the golf shop about next season\.$/, 'La saison $1 est terminée. Renseignez-vous auprès de la boutique du pro pour la prochaine saison.');
  pat(/^(\d+) members · (\d+) nights? played( · Your position: (.+))?$/, function (m) {
    return m[1] + ' membres · ' + m[2] + ' ' + pl(m[2], 'soirée jouée', 'soirées jouées') + (m[3] ? ' · Votre position' + NB + ': ' + m[4] : '');
  });
  pat(/^(\d+) rounds?$/, function (m) { return m[1] + ' ' + pl(m[1], 'partie', 'parties'); });
  pat(/^Full standings \((\d+)\)$/, 'Classement complet ($1)');
  pat(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s from (.+) · (18|9) holes, (.+) · (.+)$/, function (m) {
    var d = DAYW[m[1]]; return d.charAt(0).toUpperCase() + d.slice(1) + 's dès ' + m[2] + ' · ' + m[3] + ' trous, ' + (FMT[m[4]] || m[4]) + ' · ' + m[5].replace('–', ' au ');
  });
  pat(/^(After week (\d+), (.+)|Final standings|Before the first league night) · (Points by net finish each night|Stableford points, (\d+)% allowance)$/, function (m) {
    var a = m[2] ? 'Après la semaine ' + m[2] + ', ' + m[3] : T(m[1]);
    return a + ' · ' + (m[5] ? 'Points Stableford, allocation de ' + m[5] + NB + '%' : T(m[4]));
  });
  pat(/^You will be added to the (.+) for the (\d{4}) season\. It’s free, and you play the nights that suit you\.$/, 'Vous serez ajouté à la ligue « $1 » pour la saison $2. C’est gratuit, et vous jouez les soirées qui vous conviennent.'.replace('« ', '«' + NB).replace(' »', NB + '»'));
  pat(/^You’ve joined the league\. See you on (.+)$/, function (m) { return 'Vous vous êtes joint à la ligue. À ' + (DAYW[m[1]] || m[1]) + '!'; });
  pat(/^Show all (\d+) weeks$/, 'Afficher les $1 semaines');
  pat(/^(\d{4}) champions?:$/, function (m) { return 'Champion' + (m[0].indexOf('champions') >= 0 ? 's' : '') + ' ' + m[1] + NB + ':'; });
  pat(/^(.+) · (\d+) points$/, function (m) { return et(m[1]) + ' · ' + m[2] + ' points'; });
  pat(/^Week (\d+) · (.+)$/, function (m) { return 'Semaine ' + m[1] + ' · ' + T(m[2]); });
  pat(/^(Today|Tomorrow|In (\d+) days) · first tee (.+)$/, function (m) { return (m[2] ? 'Dans ' + m[2] + ' jours' : T(m[1])) + ' · premier départ ' + m[3]; });
  pat(/^(.+) · first tee (.+)$/, '$1 · premier départ $2');
  pat(/^In (\d+) days$/, 'Dans $1 jours');
  pat(/^Tee times are kept for league play from (.+)\.$/, 'Les départs sont réservés au jeu de la ligue à partir de $1.');
  pat(/^(\d+) points · (\d+) nights? · best (.+)$/, function (m) { return m[1] + ' points · ' + m[2] + ' ' + pl(m[2], 'soirée', 'soirées') + ' · meilleur' + NB + ': ' + m[3]; });
  pat(/^Gross (\d+)( · net (\d+))?$/, function (m) { return 'Brut ' + m[1] + (m[2] ? ' · net ' + m[3] : ''); });
  pat(/^(Back nine|Front nine|Eighteen holes)( · (tied )?(\d+)(st|nd|rd|th) of (\d+))?$/, function (m) {
    return NINE[m[1]] + (m[2] ? ' · ' + (m[3] ? 'ex aequo ' : '') + m[4] + (m[4] === '1' ? 're' : 'e') + ' sur ' + m[6] : '');
  });
  pat(/^Week (\d+): (.+)$/, 'Semaine $1' + NB + ': $2');
  pat(/^Net (\d+)$/, 'Net $1');
  /* ---------------- Friends (js/portal/friends.js) ---------------- */
  var REASONS = { 'Harassment or bullying': 'Harcèlement ou intimidation', 'Offensive language': 'Propos offensants', 'Spam or selling': 'Pourriel ou vente', 'Something else': 'Autre chose' };
  add(REASONS);
  add({
    'This member': 'Ce membre',
    'today': 'aujourd’hui',
    'yesterday': 'hier',
    'Hidden from all friends': 'Masqués pour tous les amis',
    'Hidden': 'Masqués',
    'Can see and join': 'Peut voir et se joindre',
    'Can see, must ask': 'Peut voir, doit demander',
    'This member is no longer listed.': 'Ce membre n’est plus inscrit.',
    'Message': 'Message',
    'Your tee times': 'Vos départs',
    'Handicap': 'Handicap',
    'No handicap index on record.': 'Aucun indice de handicap au dossier.',
    'No change this season': 'Aucun changement cette saison',
    'Upcoming tee times': 'Départs à venir',
    'No upcoming tee times.': 'Aucun départ à venir.',
    'Scores and results': 'Scores et résultats',
    'Best result this season': 'Meilleur résultat de la saison',
    'Booking is not available': 'Réservation non disponible',
    'Full': 'Complet',
    'Requested': 'Demandé',
    'Cancel request': 'Annuler la demande',
    'Declined': 'Refusée',
    'Request to join': 'Demander à se joindre',
    'Join': 'Se joindre',
    'Leave': 'Quitter'
  });
  pat(/^(.+) is not accepting friend requests$/, '$1 n’accepte pas les demandes d’amitié');
  pat(/^Request sent to (.+)$/, 'Demande envoyée à $1');
  pat(/^(.+) · Member since (\d{4})$/, 'Membre $1 · Membre depuis $2'.replace('Membre Membre', 'Membre'));
  pat(/^(.+) keeps their handicap private$/, '$1 garde son handicap privé');
  pat(/^(Down|Up) ([\d.]+) this season$/, function (m) { return (m[1] === 'Down' ? 'En baisse de ' : 'En hausse de ') + dec(m[2]) + ' cette saison'; });
  pat(/^(.+) keeps tee times private$/, '$1 garde ses départs privés');
  pat(/^You’re both playing (.+)$/, function (m) { return 'Vous jouez tous les deux ' + et(m[1].replace(/ and (\d+) more$/, ' et $1 autres')).replace(/\bToday\b/g, 'aujourd’hui').replace(/\bTomorrow\b/g, 'demain'); });
  pat(/^Show all \((\d+)\)$/, 'Tout afficher ($1)');
  pat(/^(.+) keeps scores and results private$/, '$1 garde ses scores et résultats privés');
  pat(/^(Final standing|Standing) (T?\d+) of (\d+) · (\d+) points$/, function (m) { return (m[1] === 'Standing' ? 'Rang ' : 'Rang final ') + m[2].replace(/^T/, 'ex aequo ') + ' sur ' + m[3] + ' · ' + m[4] + ' points'; });
  pat(/^Last nights: (.+)$/, function (m) { return 'Dernières soirées' + NB + ': ' + m[1].replace(/ pts \(T?(\d+)\)/g, function (x, n) { return ' pts (' + (x.indexOf('(T') >= 0 ? 'ex aequo ' : '') + n + (n === '1' ? 're' : 'e') + ')'; }); });
  pat(/^(Playing now: (T?\d+) after (\d+) holes|Finished (T?\d+) of (\d+)) · (.+)$/, function (m) {
    var a = m[2] ? 'En jeu' + NB + ': ' + m[2].replace(/^T/, 'ex aequo ') + ' après ' + m[3] + ' trous' : 'Terminé ' + m[4].replace(/^T/, 'ex aequo ') + ' sur ' + m[5];
    return a + ' · ' + m[6].replace(/ net$/, ' net').replace(/\bE net\b/, 'N net');
  });
  pat(/^(T?\d+), (.+)$/, function (m) { return m[1].replace(/^T/, 'ex aequo ') + ', ' + m[2]; });
  pat(/^(\d+) spots? open$/, function (m) { return m[1] + ' ' + pl(m[1], 'place libre', 'places libres'); });
  pat(/^Cancel request to join (.+)$/, 'Annuler la demande pour se joindre à $1');
  pat(/^Request to join (.+), (.+)$/, function (m) { return 'Demander à se joindre à ' + et(m[1]) + ', ' + m[2]; });
  pat(/^Join (.+), (.+)$/, function (m) { return 'Se joindre à ' + et(m[1]) + ', ' + m[2]; });
  pat(/^Leave the (.+) tee time$/, 'Quitter le départ de $1');
  /* "Today 2:27 PM" / "Tomorrow …" at the start of a tee label */
  function tl(s) { return String(s).replace(/^Today\b/, 'Aujourd’hui').replace(/^Tomorrow\b/, 'Demain'); }
  function guestsW(s) { return et(String(s).replace(/\b1 guest\b/, '1 invité').replace(/\b(\d+) guests\b/, '$1 invités')); }
  add({
    'Group is full': 'Le groupe est complet',
    'Request to join': 'Demander à se joindre',
    'Join tee time': 'Se joindre au départ',
    'Fees are settled at check-in, as for any tee time. Your guests’ fees go on your account. You can leave up to 2 hours before you play.': 'Les frais se règlent à l’enregistrement, comme pour tout départ. Les frais de vos invités sont portés à votre compte. Vous pouvez vous retirer jusqu’à 2 heures avant de jouer.',
    'Send request': 'Envoyer la demande',
    'Nothing was booked.': 'Rien n’a été réservé.',
    'The request was not sent.': 'La demande n’a pas été envoyée.',
    'Request sent': 'Demande envoyée',
    'Request cancelled': 'Demande annulée',
    'This request is no longer waiting.': 'Cette demande n’est plus en attente.',
    'This request can no longer be approved.': 'Cette demande ne peut plus être approuvée.',
    'Decline': 'Refuser',
    'Approve': 'Approuver',
    'On': 'Oui',
    'Off': 'Non',
    'Your upcoming tee times are hidden from all friends. Turn them on in Profile, Friends and privacy.': 'Vos départs à venir sont masqués pour tous vos amis. Activez-les dans Profil, Amis et confidentialité.',
    'Can see my tee times': 'Peut voir mes départs',
    'Can join without asking': 'Peut se joindre sans demander',
    'Per-friend settings': 'Réglages par ami',
    'Leave tee time': 'Quitter le départ',
    'The rest of the group keeps its tee time.': 'Le reste du groupe garde son heure de départ.',
    'Approved. They are in the group': 'Approuvée. La personne fait partie du groupe',
    'Request declined': 'Demande refusée'
  });
  pat(/^(Today|Tomorrow) (\d.*)$/, function (m) { return tl(m[0]); });
  pat(/^(.+) · (\d+) holes · (.+)$/, function (m) { return tl(m[1]) + ' · ' + m[2] + ' trous · ' + tr(m[3]); });
  pat(/^(.+) joined your (.+?) tee time( on (.+?))?( with (.+))?$/, function (m) { return m[1] + ' s’est joint à votre départ de ' + m[2] + (m[3] ? ' le ' + m[4] : '') + (m[5] ? ' avec ' + guestsW(m[6]) : ''); });
  pat(/^([^:]+?) asked to join your (.+?) tee time( on (.+?))?( with (.+))?$/, function (m) { return m[1] + ' a demandé à se joindre à votre départ de ' + m[2] + (m[3] ? ' le ' + m[4] : '') + (m[5] ? ' avec ' + guestsW(m[6]) : ''); });
  pat(/^(.+) approved your request to join the (.+?) tee time( on (.+))?$/, function (m) { return m[1] + ' a approuvé votre demande pour le départ de ' + m[2] + (m[3] ? ' le ' + m[4] : ''); });
  pat(/^(.+) declined your request to join the (.+?) tee time( on (.+))?$/, function (m) { return m[1] + ' a refusé votre demande pour le départ de ' + m[2] + (m[3] ? ' le ' + m[4] : ''); });
  pat(/^(Ask to join|Join) (.+?) · (You \+ (.+)|(.+) · (\d+) holes)$/, function (m) {
    return (m[1] === 'Join' ? 'Se joindre à ' : 'Demander à se joindre à ') + et(m[2]) + ' · ' + (m[4] ? 'Vous + ' + guestsW(m[4]) : tl(m[5]) + ' · ' + m[6] + ' trous');
  });
  pat(/^(.+) approves requests to join\. Nothing is booked until then\.$/, '$1 approuve les demandes. Rien n’est réservé d’ici là.');
  pat(/^(.+) \(your guest\)(, .+)?$/, function (m) { return m[0].replace(/ \(your guest\)/g, ' (votre invité)').replace(/^You,|, You\b/g, function (x) { return x.replace('You', 'Vous'); }); });
  pat(/^It’s in My tee times\. (.+) (has|have) a message that you joined\.$/, function (m) { return 'C’est dans Mes départs. ' + et(m[1]) + (m[2] === 'has' ? ' a reçu' : ' ont reçu') + ' un message indiquant que vous vous êtes joint.'; });
  pat(/^(.+) will see it in Friends\. Nothing is booked until they approve\.$/, '$1 la verra dans Amis. Rien n’est réservé avant son approbation.');
  pat(/^(.+) asks to join$/, '$1 demande à se joindre');
  pat(/^(.+?)( · with (.+))$/, function (m) { return /\d/.test(m[1]) ? tl(m[1]) + ' · avec ' + guestsW(m[3]) : null; });
  pat(/^Decline (.+)’s request$/, 'Refuser la demande de $1');
  pat(/^Approve (.+)’s request$/, 'Approuver la demande de $1');
  pat(/^When off, (.+) sees your tee times as private\.$/, 'Désactivé, $1 voit vos départs comme privés.');
  pat(/^When off, (.+) sends a request and you approve it\.$/, 'Désactivé, $1 envoie une demande et vous l’approuvez.');
  pat(/^Changes save as you go\. (.+) is not told about this setting\.$/, 'Les modifications s’enregistrent au fur et à mesure. $1 n’est pas avisé de ce réglage.');
  pat(/^Sharing with (.+)$/, 'Partage avec $1');
  pat(/^Saved: (.+)$/, function (m) { return 'Enregistré' + NB + ': ' + T(m[1]); });
  pat(/^Leave the (.+) group\?$/, function (m) { return 'Quitter le groupe de ' + tl(m[1]) + '?'; });
  pat(/^Your (guest|guests) (.+) (leaves|leave) with you\.$/, function (m) { return (m[1] === 'guest' ? 'Votre invité ' : 'Vos invités ') + et(m[2]) + (m[1] === 'guest' ? ' part' : ' partent') + ' avec vous.'; });
  pat(/^(.+) (stays|stay) in the group\.$/, function (m) { return et(m[1]) + (m[2] === 'stays' ? ' reste' : ' restent') + ' dans le groupe.'; });
  pat(/^You have left the (.+) group$/, 'Vous avez quitté le groupe de $1');
  pat(/^Not added: (.+)$/, function (m) { return 'Non ajouté' + NB + ': ' + tr(m[1]); });
  pat(/^Could not approve: (.+)$/, function (m) { return 'Approbation impossible' + NB + ': ' + tr(m[1]); });
  add({
    'Show fewer': 'Afficher moins',
    'Friends golfing you can join': 'Amis qui jouent et que vous pouvez rejoindre',
    'Friends golfing': 'Amis qui jouent',
    'Requests': 'Demandes',
    'Messages': 'Messages',
    'Must ask': 'Doit demander',
    'Pending': 'En attente',
    'Respond': 'Répondre',
    'Blocked': 'Bloqué',
    'Not accepting requests': 'N’accepte pas les demandes',
    'Add friend': 'Ajouter comme ami',
    'Show': 'Afficher',
    'None of your friends has a tee time booked this week.': 'Aucun de vos amis n’a de départ réservé cette semaine.',
    'Add friends to see when they are playing.': 'Ajoutez des amis pour voir quand ils jouent.',
    'No open spots with friends this week.': 'Aucune place libre avec vos amis cette semaine.',
    'Today and the next 7 days': 'Aujourd’hui et les 7 prochains jours',
    'No friends yet': 'Aucun ami pour l’instant',
    'Search for a member and send a friend request. Nothing is shared until they accept.': 'Recherchez un membre et envoyez une demande d’amitié. Rien n’est partagé avant son acceptation.',
    'Your friends': 'Vos amis',
    'Find a member': 'Trouver un membre',
    'Search by name': 'Rechercher par nom',
    'Join requests': 'Demandes pour se joindre',
    'Friend requests': 'Demandes d’amitié',
    'Accept': 'Accepter',
    'No requests waiting.': 'Aucune demande en attente.',
    'Sent by you': 'Envoyées par vous',
    'No requests waiting on others.': 'Aucune demande en attente chez les autres.',
    'Conversation': 'Conversation',
    'No messages yet. Say hello.': 'Aucun message pour l’instant. Dites bonjour.',
    'Send': 'Envoyer',
    'You can only message friends.': 'Vous ne pouvez écrire qu’à vos amis.',
    'Conversations': 'Conversations',
    'New message': 'Nouveau message',
    'No conversations yet.': 'Aucune conversation pour l’instant.',
    'Choose a conversation.': 'Choisissez une conversation.',
    'You will no longer see each other’s tee times, handicap or results. You can send a new request later.': 'Vous ne verrez plus vos départs, handicaps ou résultats respectifs. Vous pourrez envoyer une nouvelle demande plus tard.',
    'Remove friend': 'Retirer l’ami',
    'This removes them as a friend. They will not be able to send you friend requests or messages. You can unblock them in Profile, Friends and privacy.': 'Cette personne sera retirée de vos amis. Elle ne pourra plus vous envoyer de demandes d’amitié ni de messages. Vous pouvez la débloquer dans Profil, Amis et confidentialité.',
    'Block': 'Bloquer',
    'Also stops requests and messages': 'Bloque aussi les demandes et les messages',
    'Message options': 'Options du message',
    'Report this message': 'Signaler ce message',
    'Club staff will review it': 'Le personnel du club l’examinera',
    'Report message': 'Signaler le message',
    'Anything else staff should know (optional)': 'Autre chose que le personnel devrait savoir (facultatif)',
    'Only this message is shared with club staff, not the rest of the conversation.': 'Seul ce message est transmis au personnel du club, pas le reste de la conversation.',
    'Send report': 'Envoyer le signalement',
    'Reason': 'Motif',
    'Choose a reason': 'Choisissez un motif',
    'Choose a reason.': 'Choisissez un motif.',
    'Thanks. Club staff will review the message.': 'Merci. Le personnel du club examinera le message.',
    'Add a friend first. Messages are between friends only.': 'Ajoutez d’abord un ami. Les messages sont réservés aux amis.',
    'Tee times, handicaps and results, shared only between friends.': 'Départs, handicaps et résultats, partagés seulement entre amis.'
  });
  pat(/^(\d+) (unread|waiting)$/, function (m) { return m[1] + ' ' + (m[2] === 'unread' ? pl(m[1], 'non lu', 'non lus') : 'en attente'); });
  pat(/^Handicap (.+?)( · Next (.+))?$/, function (m) { return 'Handicap ' + dec(m[1]) + (m[2] ? ' · Prochain' + NB + ': ' + m[3] : ''); });
  pat(/^Next (.+)$/, 'Prochain' + NB + ': $1');
  pat(/^Your tee times: hidden from (.+)$/, 'Vos départs' + NB + ': masqués pour $1');
  pat(/^Your tee times: (.+) must ask to join$/, 'Vos départs' + NB + ': $1 doit demander à se joindre');
  pat(/^No member matches “(.+)”\.$/, 'Aucun membre ne correspond à «' + NB + '$1' + NB + '».');
  pat(/^Can join \((\d+)\)$/, 'Peut se joindre ($1)');
  pat(/^All \((\d+)\)$/, 'Tous ($1)');
  pat(/^See all \((\d+)\)$/, 'Tout voir ($1)');
  pat(/^(.+) · Sent (.+)$/, function (m) {
    var w = m[2] === 'today' ? 'aujourd’hui' : m[2] === 'yesterday' ? 'hier' : m[2].replace(/^(\d+) days ago$/, 'il y a $1 jours').replace(/^in (\d+) days$/, 'dans $1 jours');
    return (m[1] === 'Member' ? 'Membre' : m[1]) + ' · Envoyée ' + w.charAt(0).toLowerCase() + w.slice(1);
  });
  pat(/^Messages are private between you and (.+)\. Club staff only see a message if it is reported\.$/, 'Les messages sont privés entre vous et $1. Le personnel du club ne voit un message que s’il est signalé.');
  pat(/^Message from (.+?): ([\s\S]+)\. Options$/, function (m) { return 'Message de ' + m[1] + NB + ': ' + tr(m[2]) + '. Options'; });
  pat(/^Message to (.+)$/, 'Message à $1');
  pat(/^Message (?!de |à )(.+)$/, 'Écrire à $1');   /* not French output being read again */
  pat(/^You: ([\s\S]+)$/, 'Vous' + NB + ': $1');
  pat(/^Remove (.+)\?$/, 'Retirer $1?');
  pat(/^(.+) removed from your friends$/, '$1 a été retiré de vos amis');
  pat(/^Block (.+)\?$/, 'Bloquer $1?');
  pat(/^(.+) is blocked$/, '$1 est bloqué');
  pat(/^Block (.+)$/, 'Bloquer $1');
  pat(/^You and (.+) are now friends$/, 'Vous et $1 êtes maintenant amis');
  pat(/^You can only message friends$/, 'Vous ne pouvez écrire qu’à vos amis');
  pat(/^(\d+) new in Friends$/, function (m) { return m[1] + ' ' + pl(m[1], 'nouveauté', 'nouveautés') + ' dans Amis'; });
  pat(/^(\d+) holes · (\d+ spots? open|Full)( ·)?$/, function (m) { return m[1] + ' trous · ' + tr(m[2]) + (m[3] ? ' ·' : ''); });
  pat(/^((?:Today|Tomorrow|\S+\.?\s\d+\s\S+\.?|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+) )?(\d{1,2}(?::\d{2} [AP]M|\sh(?:\s\d{2})?)) · (.+)$/, function (m) {
    /* After the time: translatable pieces (e.g. "Tee time · 18 holes" in Coming up) are translated; names keep "and" -> "et". */
    var rest = m[3].split(' · ').map(function (x) { return T(x); }).join(' · ');
    return (m[1] ? tl(m[1]) : '') + m[2] + ' · ' + (rest !== m[3] ? rest : et(m[3]));
  });
  /* ---------------- Lessons (js/portal/lessons.js) ---------------- */
  var LTYPE = { 'Private lesson': 'Cours privé', 'Playing lesson': 'Cours sur le parcours', 'Club fitting': 'Ajustement de bâtons', 'Junior clinic': 'Clinique junior', 'Group clinic': 'Clinique de groupe' };
  add(LTYPE);
  add({
    'One to one on the practice tee or with our SIM teaching technology.': 'En tête-à-tête sur le champ de pratique ou avec notre technologie d’enseignement SIM.',
    'On the course, strategy and shot selection.': 'Sur le parcours : stratégie et choix de coups.'.replace(' :', NB + ':'),
    'Finding the right clubs and shafts for your swing.': 'Trouver les bons bâtons et les bonnes tiges pour votre élan.',
    'Part of our Junior Golf program.': 'Fait partie de notre programme de golf junior.',
    'A small group, a shared focus and good company.': 'Un petit groupe, un objectif commun et de la bonne compagnie.',
    'Lessons for golfers of all abilities, by arrangement.': 'Cours pour golfeurs de tous les niveaux, sur rendez-vous.',
    'Full swing, short game and competitive juniors.': 'Élan complet, petit jeu et juniors de compétition.',
    'Putting and wedge play, and the ladies’ clinics.': 'Coups roulés, cocheurs et cliniques pour dames.',
    'Beginners, Junior Golf and club fitting.': 'Débutants, golf junior et ajustement de bâtons.',
    'your professional': 'votre professionnel',
    'Dates to be announced': 'Dates à annoncer',
    'Evening': 'Soir',
    'Cancel online up to 24 hours before. Within 24 hours, please call the golf shop. The fee is charged to your account after the lesson.': 'Annulez en ligne jusqu’à 24 heures avant. Dans les 24 heures précédentes, veuillez appeler la boutique du pro. Les frais sont portés à votre compte après le cours.',
    'Private lessons with our CPGA professionals, plus clinics through the season.': 'Cours privés avec nos professionnels CPGA, et cliniques tout au long de la saison.',
    'My lessons': 'Mes cours',
    'Clinics': 'Cliniques',
    'With': 'Avec',
    'Fee': 'Frais',
    'Note': 'Note',
    'Cancel lesson': 'Annuler le cours',
    'View all my lessons': 'Voir tous mes cours',
    'Cancel this lesson?': 'Annuler ce cours?',
    'This lesson can no longer be cancelled online': 'Ce cours ne peut plus être annulé en ligne',
    'Your lesson has been cancelled': 'Votre cours a été annulé',
    'Length': 'Durée'
  });
  function lt(s) { return LTYPE[s] || s; }
  pat(/^Begins (.+)$/, 'Débute le $1');
  pat(/^Concluded (.+)$/, 'Terminé le $1');
  pat(/^Week (\d+) of (\d+)$/, 'Semaine $1 sur $2');
  pat(/^Lessons are taught between (.+) and (.+)\.$/, 'Les cours se donnent entre $1 et $2.');
  pat(/^(.+) is already teaching (.+) to (.+)\.$/, '$1 donne déjà un cours de $2 à $3.');
  pat(/^You already have a lesson (.+) to (.+) with (.+)\.$/, 'Vous avez déjà un cours de $1 à $2 avec $3.');
  pat(/^(.+) is coaching (.+) (\d\S*(?: [AP]M|\sh(?:\s\d{2})?)?) to (.+)\.$/, '$1 anime $2 de $3 à $4.');
  pat(/^(.+) · (\d+) lessons$/, '$1 · $2 cours');
  pat(/^(.+) · (Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic) · (.+)$/, function (m) { return m[1] + ' · ' + lt(m[2]) + ' · ' + m[3]; });
  pat(/^(.+), (.+) to (.+)$/, function (m) { return /\d/.test(m[2]) && /\d/.test(m[3]) ? m[1] + ', de ' + m[2] + ' à ' + m[3] : null; });
  pat(/^Within 24 hours, please call the golf shop at$/, 'Dans les 24 heures précédentes, veuillez appeler la boutique du pro au');
  pat(/^to make changes\.$/, 'pour faire des modifications.');
  pat(/^(Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic) with (.+), (.+) at (.+)\. You won’t be charged\.$/, function (m) { return lt(m[1]) + ' avec ' + m[2] + ', le ' + m[3] + ' à ' + m[4] + '. Aucuns frais ne vous seront facturés.'; });
  pat(/^You can’t book online right now\. Please call the golf shop at$/, 'Vous ne pouvez pas réserver en ligne pour le moment. Veuillez appeler la boutique du pro au');
  pat(/^(\d+) min$/, '$1 min');
  function dayPl(d) { var x = DAYW[d]; return x ? x + 's' : d + 's'; }
  add({
    'Note for your professional': 'Note pour votre professionnel',
    'What you want to work on, or clubs to bring': 'Ce que vous voulez travailler, ou les bâtons à apporter',
    'Not teaching': 'N’enseigne pas',
    'Your lesson': 'Votre cours',
    'First available': 'Premier disponible',
    'Any professional who is free at your time': 'Tout professionnel libre à l’heure choisie',
    'Private lessons for all abilities.': 'Cours privés pour tous les niveaux.',
    'Professional': 'Professionnel',
    'Choose a professional': 'Choisissez un professionnel',
    'Lesson': 'Cours',
    'Choose a lesson': 'Choisissez un cours',
    'Book lesson': 'Réserver le cours',
    'Your professional': 'Votre professionnel',
    'Our professionals': 'Nos professionnels',
    'Any professional instead': 'Plutôt n’importe quel professionnel',
    'Please arrive 10 minutes early and check in at the golf shop.': 'Veuillez arriver 10 minutes à l’avance et vous présenter à la boutique du pro.',
    'Confirm your lesson': 'Confirmer votre cours',
    'Online booking is unavailable on your account. Please call the golf shop.': 'La réservation en ligne n’est pas offerte à votre compte. Veuillez appeler la boutique du pro.',
    'Please choose a time for your lesson.': 'Veuillez choisir une heure pour votre cours.',
    'Please keep your notes under 500 characters.': 'Veuillez limiter vos notes à 500 caractères.',
    'That time is too soon to book online. Please choose a later time.': 'Cette heure est trop rapprochée pour réserver en ligne. Veuillez choisir une heure plus tardive.',
    'That professional is not teaching on this day.': 'Ce professionnel n’enseigne pas ce jour-là.',
    'Your lesson is booked': 'Votre cours est réservé',
    'No lessons booked': 'Aucun cours réservé',
    'When you book a lesson, it appears here.': 'Quand vous réservez un cours, il apparaît ici.',
    'Past lessons': 'Cours passés',
    'Awaiting sign-off': 'En attente de validation',
    'Your past lessons will appear here.': 'Vos cours passés apparaîtront ici.',
    'Upcoming lessons': 'Cours à venir',
    'Finished. Thank you for joining.': 'Terminé. Merci de votre participation.',
    'To enroll, call the golf shop': 'Pour vous inscrire, appelez la boutique du pro',
    'Enroll': 'S’inscrire',
    'Coach': 'Entraîneur',
    'To be confirmed': 'À confirmer',
    'Level': 'Niveau',
    'All abilities': 'Tous les niveaux',
    'Spots to be confirmed': 'Places à confirmer',
    'for the program': 'pour le programme',
    'No clinics or programs right now': 'Aucune clinique ni aucun programme pour le moment',
    'New clinics are being planned. Please check back soon.': 'De nouvelles cliniques sont en préparation. Revenez bientôt.',
    'You are already enrolled': 'Vous êtes déjà inscrit',
    'The program is now full': 'Le programme est maintenant complet',
    'Enrolment has closed': 'Les inscriptions sont fermées',
    'Your spot will be released. The program fee is not refunded automatically. The golf shop will contact you about any refund.': 'Votre place sera libérée. Les frais du programme ne sont pas remboursés automatiquement. La boutique du pro communiquera avec vous au sujet d’un remboursement.',
    'Golf Professional': 'Professionnel de golf',
    'Director of Golf': 'Directeur du golf',
    'Head Golf Professional': 'Professionnel de golf en chef',
    'Associate Golf Professional': 'Professionnel de golf adjoint',
    'Assistant Golf Professional': 'Professionnel de golf adjoint'
  });
  pat(/^(.+) · (.+)$/, function (m) { return SPEC_ROLE(m); });
  function SPEC_ROLE(m) { var r = S[m[1]]; if (r && /Golf|Director/.test(m[1])) return r + ' · ' + T(m[2]); return null; }
  pat(/^from (.+)$/, 'à partir de $1');
  pat(/^(.+)\/hr$/, '$1/h');
  pat(/^(.+) doesn’t teach on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s\. Choose another day, or First available\.$/, function (m) { return m[1] + ' n’enseigne pas le ' + DAYW[m[2]] + '. Choisissez un autre jour, ou Premier disponible.'; });
  pat(/^No (\d+)-minute times left on this day\. Try another day or a shorter lesson\.$/, 'Plus aucune plage de $1 minutes ce jour-là. Essayez un autre jour ou un cours plus court.');
  pat(/^(Morning|Afternoon|Evening) times$/, function (m) { return 'Heures ' + { Morning: 'du matin', Afternoon: 'de l’après-midi', Evening: 'du soir' }[m[1]]; });
  pat(/^Nothing open in the (morning|afternoon|evening)\. Try another time of day or date\.$/, function (m) { return 'Rien de libre ' + { morning: 'le matin', afternoon: 'l’après-midi', evening: 'le soir' }[m[1]] + '. Essayez un autre moment de la journée ou une autre date.'; });
  pat(/^(Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic) · (\d+) min · (.+) · (.+)$/, function (m) { return lt(m[1]) + ' · ' + m[2] + ' min · ' + m[3] + ' · ' + m[4]; });
  pat(/^(.+) · (.+) for (\d+) min$/, function (m) { return T(m[1]) + ' · ' + m[2] + ' pour ' + m[3] + ' min'; });
  pat(/^Choose (.+)$/, 'Choisir $1');
  pat(/^(Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic), (\d+) min$/, function (m) { return lt(m[1]) + ', ' + m[2] + ' min'; });
  pat(/^Your lesson with (.+) is booked$/, 'Votre cours avec $1 est réservé');
  pat(/^(Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic) with (.+)$/, function (m) { return lt(m[1]) + ' avec ' + m[2]; });
  pat(/^(.+) · (Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic)$/, function (m) { return m[1] + ' · ' + lt(m[2]); });
  pat(/^(\d+) min · (.+)$/, '$1 min · $2');
  pat(/^(\d+) lessons?$/, function (m) { return m[1] + ' cours'; });
  pat(/^By invitation from (.+)$/, function (m) { return 'Sur invitation de ' + (m[1] === 'the golf shop' ? 'la boutique du pro' : m[1]); });
  pat(/^(Enrolled · )?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s, (.+?) · (Full|(\d+) spots? left) · (.+)$/, function (m) {
    return (m[1] ? 'Inscrit · ' : '') + 'Les ' + dayPl(m[2]) + ', ' + m[3] + ' · ' + (m[5] ? m[5] + ' ' + pl(m[5], 'place restante', 'places restantes') : 'Complet') + ' · ' + m[6];
  });
  pat(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s, (.+)$/, function (m) { return 'Les ' + dayPl(m[1]) + ', ' + m[2]; });
  pat(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s$/, function (m) { return 'Les ' + dayPl(m[1]); });
  pat(/^(\d+) weeks from (.+) · (.+)$/, function (m) { return m[1] + ' semaines à partir du ' + m[2] + ' · ' + tr(m[3]); });
  pat(/^(\d+) of (\d+) spots filled( · (\d+) spots? left)?$/, function (m) { return m[1] + ' sur ' + m[2] + ' places prises' + (m[3] ? ' · ' + m[4] + ' ' + pl(m[4], 'place restante', 'places restantes') : ''); });
  pat(/^Spots to be confirmed · (\d+) spots? left$/, function (m) { return 'Places à confirmer · ' + m[1] + ' ' + pl(m[1], 'place restante', 'places restantes'); });
  pat(/^Enroll in (.+)\?$/, 'S’inscrire à « $1 »?'.replace('« ', '«' + NB).replace(' »', NB + '»'));
  pat(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s at (.+) for (\d+) weeks with (.+)\. The program fee of (.+) will be posted to your member account\.$/, function (m) {
    return 'Les ' + dayPl(m[1]) + ' à ' + m[2] + ' pendant ' + m[3] + ' semaines avec ' + m[4] + '. Les frais du programme de ' + m[5] + ' seront portés à votre compte de membre.';
  });
  pat(/^You are enrolled in (.+?)(\. (.+) posted to your account)?$/, function (m) { return 'Vous êtes inscrit à « '.replace('« ', '«' + NB) + m[1] + NB + '»' + (m[2] ? '. ' + m[3] + ' porté à votre compte' : ''); });
  pat(/^Withdraw from (.+)\?$/, 'Vous retirer de « $1 »?'.replace('« ', '«' + NB).replace(' »', NB + '»'));
  pat(/^You have withdrawn from (.+)$/, 'Vous vous êtes retiré de « $1 »'.replace('« ', '«' + NB).replace(' »', NB + '»'));
  /* ---------------- The club (js/portal/club.js) ---------------- */
  var PINS = { 'Middle': 'Centre', 'Back': 'Arrière', 'Front': 'Avant', 'Mixed': 'Variés' };
  var FIRM = { 'Medium': 'Moyens', 'Firm': 'Fermes', 'Soft': 'Mous', 'Fast': 'Rapides' };
  /* 'Back' stays the Back button (Retour): a pin position of Back reads Retour too, the one word the DOM approach cannot tell apart */
  add({ 'Middle': 'Centre', 'Front': 'Avant', 'Mixed': 'Variés' });
  add({ 'Firm': 'Fermes', 'Soft': 'Mous' });
  add({
    'Daily': 'Tous les jours',
    'Breakfast, lunch and dinner': 'Déjeuner, dîner et souper',
    'Served until 2pm': 'Servi jusqu’à 14 h',
    'Longer hours during the golf season.': 'Heures prolongées pendant la saison de golf.',
    'Golf shop': 'Boutique du pro',
    'Book online or call the golf shop': 'Réservez en ligne ou appelez la boutique du pro',
    'Practice and instruction': 'Pratique et enseignement',
    'Short game practice facility': 'Installation de pratique du petit jeu',
    'SIM teaching technology': 'Technologie d’enseignement SIM',
    'With our professionals': 'Avec nos professionnels',
    'Club office': 'Bureau du club',
    'Main line': 'Ligne principale',
    'Membership, accounts and general questions.': 'Adhésions, comptes et questions générales.',
    'Golf, the golf shop, lessons and tournaments': 'Golf, boutique du pro, cours et tournois',
    'The clubhouse, weddings and special events': 'Le pavillon, les mariages et les événements spéciaux',
    'The Gallery menu and dietary needs': 'Le menu du Gallery et les besoins alimentaires',
    'The golf course': 'Le parcours de golf',
    'Accounts and statements': 'Comptes et relevés',
    'General enquiries': 'Renseignements généraux',
    'Unlimited season golf': 'Golf illimité pendant la saison',
    'Club storage and cleaning': 'Entreposage et nettoyage des bâtons',
    'Pull cart': 'Chariot',
    'Private locker rooms': 'Vestiaires privés',
    'Towel service': 'Service de serviettes',
    'Pro Shop discounts': 'Rabais à la boutique du pro',
    'Advance tee time booking': 'Réservation des départs à l’avance',
    'Friday member play and beverage pricing': 'Jeu des membres le vendredi et prix spéciaux sur les boissons',
    'CPGA professional staff': 'Professionnels CPGA',
    'Members’ league': 'Ligue des membres',
    'Club events': 'Événements du club',
    'Gallery Taphouse member pricing': 'Prix membres au Gallery Taphouse',
    'Reduced meeting room rates': 'Tarifs réduits pour les salles de réunion',
    'For members and guests: golf attire on the course, golf casual in the clubhouse. Not sure? Ask the golf shop.': 'Pour les membres et les invités : tenue de golf sur le parcours, tenue de golf décontractée au pavillon. Un doute? Demandez à la boutique du pro.'.replace(' :', NB + ':'),
    'Soft spikes only': 'Crampons souples seulement',
    'Soft spikes only, on the course and in the clubhouse.': 'Crampons souples seulement, sur le parcours et au pavillon.',
    'Repair pitch marks, rake bunkers, replace divots and keep up with the group ahead.': 'Réparez les marques de balle, ratissez les fosses de sable, replacez les mottes et suivez le rythme du groupe devant vous.',
    'Members can bring guests, who pay the green fee. You are responsible for your guests’ conduct and dress. Check in at the golf shop when you arrive.': 'Les membres peuvent amener des invités, qui paient les droits de jeu. Vous êtes responsable de la conduite et de la tenue de vos invités. Présentez-vous à la boutique du pro à votre arrivée.',
    'Guests': 'Invités',
    'Today’s report is not in yet': 'Le rapport du jour n’est pas encore arrivé',
    'Course': 'Parcours',
    'News': 'Nouvelles',
    'Directory': 'Répertoire',
    'Club info': 'Infos',
    'The club': 'Le club',
    'No course report yet': 'Aucun rapport sur le parcours pour l’instant',
    'The superintendent posts conditions each morning. Please call the golf shop for today’s details.': 'Le surintendant affiche les conditions chaque matin. Veuillez appeler la boutique du pro pour les détails du jour.',
    'Carts can go anywhere on the fairways and rough.': 'Les voiturettes peuvent circuler partout dans les allées et l’herbe longue.',
    'Stay on the path. Cross fairways at right angles only.': 'Restez sur le sentier. Traversez les allées à angle droit seulement.',
    'Keep carts on the paths at all times.': 'Gardez les voiturettes sur les sentiers en tout temps.',
    'No carts today. Walking only.': 'Aucune voiturette aujourd’hui. Marche seulement.',
    'All 18 holes are in play.': 'Les 18 trous sont en jeu.',
    'Open for play': 'Ouvert au jeu',
    'Closed today': 'Fermé aujourd’hui',
    'Normal': 'Normal',
    'Take an extra club in.': 'Prenez un bâton de plus.',
    'Mind the false fronts.': 'Attention aux faux devants.',
    'All in play': 'Tous en jeu',
    'Note from the grounds crew': 'Note de l’équipe d’entretien',
    'Superintendent': 'Surintendant',
    'Hole status': 'État des trous',
    'All 18 in play': 'Les 18 en jeu'
  });
  pat(/^Updated (today|.+) at (.+)$/, function (m) { return 'Mis à jour ' + (m[1] === 'today' ? 'aujourd’hui' : 'le ' + m[1]) + ' à ' + m[2]; });
  pat(/^(\d+) new$/, function (m) { return m[1] + ' ' + pl(m[1], 'nouveau', 'nouveaux'); });
  pat(/^H (−?-?\d+)° · L (−?-?\d*)° · Wind (\d+) km\/h$/, 'Max. $1° · Min. $2° · Vent $3' + NB + 'km/h');
  pat(/^([\d.,]+) \((fast|medium|slow)\)$/, function (m) { return dec(m[1]) + ' (' + { fast: 'rapides', medium: 'moyens', slow: 'lents' }[m[2]] + ')'; });
  pat(/^(Medium|Firm|Soft|Fast|.+) greens$/, function (m) { return 'Verts ' + (FIRM[m[1]] || m[1]).toLowerCase(); });
  pat(/^(\d+) affected$/, function (m) { return m[1] + ' ' + pl(m[1], 'touché', 'touchés'); });
  pat(/^((?:Holes?) [\d, ]+: closed\. ?)?((?:Holes?) [\d, ]+: ground under repair \(free relief\)\.)?$/, function (m) {
    var f = function (s) { return s.replace(/^Holes? /, function (x) { return x === 'Hole ' ? 'Trou ' : 'Trous '; }).replace(':', NB + ':'); };
    return ((m[1] ? f(m[1]).replace('closed.', 'fermé' + (/^Trous/.test(f(m[1])) ? 's' : '') + '.') : '') + (m[2] ? f(m[2]).replace('ground under repair (free relief).', 'terrain en réparation (dégagement gratuit).') : '')).trim();
  });
  pat(/^(.+), Superintendent$/, '$1, surintendant');
  pat(/^Hole (\d+): (ground under repair|closed|in play)$/, function (m) { return 'Trou ' + m[1] + NB + ': ' + { 'ground under repair': 'terrain en réparation', closed: 'fermé', 'in play': 'en jeu' }[m[2]]; });
  add({
    'In play': 'En jeu',
    'Ground under repair': 'Terrain en réparation',
    '7-day forecast': 'Prévisions sur 7 jours',
    'No notices just now': 'Aucun avis pour le moment',
    'Club notices resume once your account review is complete. The club office is happy to help.': 'Les avis du club reprendront une fois l’examen de votre compte terminé. Le bureau du club se fera un plaisir de vous aider.',
    'Notices from the club will appear here as they are sent.': 'Les avis du club apparaîtront ici dès leur envoi.',
    'Questions? Call the club office at': 'Des questions? Appelez le bureau du club au',
    'Club notice': 'Avis du club',
    'Search': 'Rechercher',
    'Search members by name': 'Rechercher des membres par nom',
    'To protect privacy, the directory shows only name, membership and year joined. The club office can pass on a message.': 'Pour protéger la vie privée, le répertoire n’affiche que le nom, le type d’adhésion et l’année d’adhésion. Le bureau du club peut transmettre un message.',
    'No members found': 'Aucun membre trouvé',
    '(you)': '(vous)',
    'Club website': 'Site Web du club',
    'Weddings and events': 'Mariages et événements',
    'About the club': 'À propos du club',
    'Hours': 'Heures',
    'Gallery daily · Golf shop · Club office': 'Gallery tous les jours · Boutique du pro · Bureau du club',
    'Who to contact': 'Qui joindre',
    'Call the club office': 'Appeler le bureau du club',
    'Please call the club office at': 'Veuillez appeler le bureau du club au',
    'Membership benefits': 'Avantages de l’adhésion',
    'Dress code and etiquette': 'Code vestimentaire et étiquette',
    'Golf attire · soft spikes only': 'Tenue de golf · crampons souples seulement',
    'Website and social': 'Site Web et réseaux sociaux',
    'Course today': 'Le parcours aujourd’hui',
    'Conditions from the grounds crew, and the week ahead.': 'Les conditions de l’équipe d’entretien et la semaine à venir.',
    'Club news': 'Nouvelles du club',
    'Notices from the club, newest first.': 'Les avis du club, du plus récent au plus ancien.',
    'Find a fellow member by name.': 'Trouvez un autre membre par son nom.',
    'Hours, contacts and club customs.': 'Heures, personnes-ressources et usages du club.',
    'Golf Course Superintendent': 'Surintendant du parcours',
    'All members': 'Tous les membres',
    'Golf members': 'Membres golfeurs',
    'Board & committees': 'Conseil et comités',
    'Staff': 'Personnel'
  });
  pat(/^Tomorrow (−?-?\d+)° · (.+)$/, function (m) { return 'Demain ' + m[1] + '° · ' + (WX[m[2]] || m[2]); });
  pat(/^(\d+)% rain$/, '$1' + NB + '% de pluie');
  pat(/^(.+) · To (.+)$/, function (m) { return m[1] + ' · À ' + (S[m[2]] ? S[m[2]].charAt(0).toLowerCase() + S[m[2]].slice(1) : m[2].replace(/ tier$/, '')); });
  pat(/^From (.+)$/, function (m) { return 'De ' + (m[1] === 'the club office' ? 'la part du bureau du club' : m[1]); });
  pat(/^No member matches "(.+)"\. Try a first or last name\.$/, 'Aucun membre ne correspond à «' + NB + '$1' + NB + '». Essayez un prénom ou un nom.');
  pat(/^(\d+) members? match(es)?$/, function (m) { return m[1] + ' ' + pl(m[1], 'membre correspond', 'membres correspondent'); });
  pat(/^(\d+) members$/, '$1 membres');
  pat(/^(.+) · Member since (\d{4})$/, function (m) { return (m[1] === 'Member' ? 'Membre' : m[1]) + ' · Membre depuis ' + m[2]; });
  pat(/^Showing (\d+) of (\d+)$/, '$1 sur $2 affichés');
  pat(/^(.+) is a friendly club for golfers of all ages: a competitive, affordable course, a comfortable clubhouse and pro shop, and good service\.$/, 'Le $1 est un club convivial pour les golfeurs de tous âges' + NB + ': un parcours stimulant et abordable, un pavillon et une boutique du pro confortables, et un bon service.');
  pat(/^Built in (.+), the course is a classic par 72 with tree-lined fairways, small sloping greens, and well-placed bunkers and water hazards\.$/, 'Aménagé en $1, le parcours est un classique à normale 72, avec des allées bordées d’arbres, de petits verts en pente et des fosses de sable et obstacles d’eau bien placés.');
  pat(/^Main line (.+)$/, 'Ligne principale $1');
  pat(/^(.+) ext\. (\d+)$/, '$1, poste $2');
  pat(/^For hours, call the club office at$/, 'Pour les heures, appelez le bureau du club au');
  pat(/^(\d+) people, by phone$/, '$1 personnes, par téléphone');
  pat(/^(\d+) included$/, '$1 compris');
  /* "Club website · Weddings and events · Facebook and more": translate each piece, then "and more". */
  pat(/^(.+) and more$/, function (m) { return m[1].split(' · ').map(function (x) { return T(x); }).join(' · ') + ' et plus'; });
  /* ---------------- Profile (js/portal/profile.js) ---------------- */
  add({
    'By cart': 'En voiturette',
    'With a pull cart': 'Avec un chariot',
    'Pull cart': 'Chariot',
    'Text messages': 'Messages texte',
    'Statements, club news and event invitations.': 'Relevés, nouvelles du club et invitations aux événements.',
    'Frost delays, course closures and tee time reminders.': 'Retards pour cause de gel, fermetures du parcours et rappels de départs.',
    'Portal notices': 'Avis du portail',
    'Notices on your portal home page and club news.': 'Avis sur la page d’accueil du portail et nouvelles du club.',
    'Leave of absence': 'Congé',
    'Account under review': 'Compte en cours d’examen',
    'Resigned': 'Démissionnaire',
    'Membership card': 'Carte de membre',
    'Phone': 'Téléphone',
    'Home address': 'Adresse du domicile',
    'Street, city, postal code': 'Rue, ville, code postal',
    'Spouse or partner': 'Conjoint ou partenaire',
    'None listed': 'Aucun',
    'Children': 'Enfants',
    'Changes save as you go. Statements and important account notices are always sent by email.': 'Les modifications s’enregistrent au fur et à mesure. Les relevés et les avis importants sur le compte sont toujours envoyés par courriel.',
    'How you get around': 'Comment vous vous déplacez',
    'Dietary and service notes': 'Notes alimentaires et de service',
    'For example: no shellfish, likes the patio': 'Par exemple' + NB + ': pas de fruits de mer, aime la terrasse',
    'Golf Canada no.': 'Nº Golf Canada',
    'Not recorded': 'Non inscrit',
    'Locker': 'Casier',
    'None assigned': 'Aucun attribué',
    'Your index over time': 'Votre indice au fil du temps',
    'Index': 'Indice',
    'Your index history will show here as scores are posted.': 'L’historique de votre indice s’affichera ici à mesure que des scores seront inscrits.',
    'The golf shop updates your index from posted scores, and can help with lockers.': 'La boutique du pro met à jour votre indice à partir des scores inscrits et peut vous aider pour les casiers.',
    'Friends see when you are playing and can ask to join.': 'Vos amis voient quand vous jouez et peuvent demander à se joindre.',
    'Your handicap index and how it has changed this season.': 'Votre indice de handicap et son évolution cette saison.',
    'League standings and tournament finishes.': 'Classements de la ligue et résultats des tournois.',
    'Friends see tee times, handicap and results': 'Vos amis voient vos départs, votre handicap et vos résultats',
    'Nothing shared with friends': 'Rien n’est partagé avec vos amis',
    'All friends can see and join': 'Tous vos amis peuvent voir et se joindre',
    'Choose what your friends can see. Nothing is shared with members who are not your friends.': 'Choisissez ce que vos amis peuvent voir. Rien n’est partagé avec les membres qui ne sont pas vos amis.',
    'Who can send me friend requests': 'Qui peut m’envoyer des demandes d’amitié',
    'Nobody': 'Personne',
    'Off while upcoming tee times are hidden from all friends': 'Désactivé tant que vos départs à venir sont masqués pour tous vos amis',
    'Blocked members': 'Membres bloqués',
    'Unblock': 'Débloquer',
    'Changes save as you go.': 'Les modifications s’enregistrent au fur et à mesure.',
    'Enter a valid email address.': 'Entrez une adresse courriel valide.',
    'Enter a phone number with 10 to 15 digits, for example (204) 555-0100.': 'Entrez un numéro de téléphone de 10 à 15 chiffres, par exemple (204) 555-0100.',
    'Please keep the address under 140 characters.': 'Veuillez limiter l’adresse à 140 caractères.',
    'Your details are already up to date': 'Vos coordonnées sont déjà à jour',
    'Your details have been updated': 'Vos coordonnées ont été mises à jour',
    'Please keep notes under 300 characters. The club office is happy to take longer requests.': 'Veuillez limiter les notes à 300 caractères. Le bureau du club se fera un plaisir de prendre les demandes plus longues.',
    'Personal details': 'Renseignements personnels',
    'Email, phone and address': 'Courriel, téléphone et adresse',
    'Family on your membership': 'Famille inscrite à votre adhésion',
    'Notifications': 'Notifications',
    'Email, text and portal: all on': 'Courriel, texte et portail' + NB + ': tous activés',
    'All off': 'Tous désactivés',
    'Friends and privacy': 'Amis et confidentialité',
    'Preferences': 'Préférences',
    'Golf': 'Golf',
    'Statements': 'Relevés',
    'Balance, charges and payments': 'Solde, frais et paiements',
    'Profile': 'Profil',
    'Your membership': 'Votre adhésion',
    'Profile settings': 'Réglages du profil',
    'Save details': 'Enregistrer les coordonnées',
    'Save preferences': 'Enregistrer les préférences',
    'Favourite place to eat': 'Endroit préféré pour manger',
    'Friend requests turned off. Saved.': 'Demandes d’amitié désactivées. Enregistré.',
    'All members can send you requests. Saved.': 'Tous les membres peuvent vous envoyer des demandes. Enregistré.',
    'Upcoming tee times': 'Départs à venir'
  });
  pat(/^No\. (.+)$/, 'Nº $1');
  pat(/^Member since (\d{4})$/, 'Membre depuis $1');
  pat(/^(.+) · (Leave of absence|Account under review|Resigned)$/, function (m) { return (m[1] === 'Member' ? 'Membre' : m[1]) + ' · ' + T(m[2]); });
  pat(/^(\d+) (child|children)(, with junior privileges)?$/, function (m) { return m[1] + ' ' + pl(m[1], 'enfant', 'enfants') + (m[3] ? ', avec privilèges juniors' : ''); });
  pat(/^To add or change family members, call the club office at$/, 'Pour ajouter ou modifier des membres de la famille, appelez le bureau du club au');
  pat(/^(Down|Up) ([\d.]+) since (.+)$/, function (m) { return (m[1] === 'Down' ? 'En baisse de ' : 'En hausse de ') + dec(m[2]) + ' depuis ' + m[3]; });
  pat(/^No change since (.+)$/, 'Aucun changement depuis $1');
  pat(/^(Friends see .+|Friends see tee times, handicap and results|Nothing shared with friends) · Requests off$/, function (m) { return tr(m[1]) + ' · Demandes désactivées'; });
  pat(/^Friends see (.+)$/, function (m) { return 'Vos amis voient ' + m[1].replace('upcoming tee times', 'vos départs à venir').replace('handicap', 'votre handicap').replace('scores and results', 'vos scores et résultats'); });
  pat(/^(\d+) hidden( · (\d+) must ask)?$/, function (m) { return m[1] + ' ' + pl(m[1], 'masqué', 'masqués') + (m[2] ? ' · ' + m[3] + ' ' + pl(m[3], 'doit', 'doivent') + ' demander' : ''); });
  pat(/^(\d+) must ask$/, function (m) { return m[1] + ' ' + pl(m[1], 'doit', 'doivent') + ' demander'; });
  pat(/^(.+?) · (\d+) (child|children)$/, function (m) { return m[1] + ' · ' + m[2] + ' ' + pl(m[2], 'enfant', 'enfants'); });
  pat(/^((?:Email|Text messages|Portal notices)(?:, (?:Email|Text messages|Portal notices))*) on$/, function (m) { return m[1].split(', ').map(T).join(', ') + ' activés'; });
  pat(/^(Walking|By cart|With a pull cart) · (.+)$/, function (m) { return T(m[1]) + ' · ' + room(m[2]); });
  pat(/^Handicap (.+) · Locker (.+)$/, function (m) { return 'Handicap ' + dec(m[1]) + ' · Casier ' + m[2]; });
  pat(/^(.+) · (\d+) years?$/, function (m) { return m[1] + ' · ' + m[2] + ' ' + pl(m[2], 'an', 'ans'); });
  pat(/^(Email|Text messages|Portal notices) turned (on|off)\. Saved\.$/, function (m) { return T(m[1]) + (m[2] === 'on' ? ' activé' : ' désactivé') + 's. Enregistré.'; });
  pat(/^(Upcoming tee times|Handicap|Scores and results) (shared with|hidden from) friends\. Saved\.$/, function (m) { return T(m[1]) + (m[2] === 'shared with' ? ' : partagé avec vos amis. Enregistré.' : ' : masqué pour vos amis. Enregistré.').replace(' :', NB + ':'); });
  pat(/^(.+) unblocked$/, '$1 débloqué');
  /* Membership category descriptions (js/core/store.js), shown whole in Profile > Your membership. */
  add({
    'Unlimited golf, 7 days a week. Club storage and a private locker. Book 15 days in advance.': 'Golf illimité, 7 jours sur 7. Entreposage des bâtons et casier privé. Réservation 15 jours à l’avance.',
    'Weekdays before 7:30am, 10:30am to 4pm and after 5:30pm; weekends after 10:30am. Club storage and a private locker. Book 13 days in advance.': 'En semaine avant 7 h 30, de 10 h 30 à 16 h et après 17 h 30; la fin de semaine après 10 h 30. Entreposage des bâtons et casier privé. Réservation 13 jours à l’avance.'.replace(/(\d) h/g, '$1' + NB + 'h').replace(/h (\d)/g, 'h' + NB + '$1'),
    'Ages 19 to 23. Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am. Club storage and a private locker. Book 8 days in advance.': '19 à 23 ans. En semaine de 10 h 30 à 16 h et après 17 h 30; la fin de semaine après 11 h. Entreposage des bâtons et casier privé. Réservation 8 jours à l’avance.'.replace(/(\d) h/g, '$1' + NB + 'h').replace(/h (\d)/g, 'h' + NB + '$1'),
    'Under 18. Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am. Book 8 days in advance.': 'Moins de 18 ans. En semaine de 10 h 30 à 16 h et après 17 h 30; la fin de semaine après 11 h. Réservation 8 jours à l’avance.'.replace(/(\d) h/g, '$1' + NB + 'h').replace(/h (\d)/g, 'h' + NB + '$1')
  });
  /* ---------------- My account (js/portal/account.js) ---------------- */
  var CAT = { 'Dues': 'Cotisation', 'Golf': 'Golf', 'Pro Shop': 'Boutique du pro', 'Dining': 'Restauration', 'Events': 'Événements', 'Lessons': 'Cours', 'Other': 'Autre', 'Payment': 'Paiement' };
  var SRC = { 'Golf shop': 'Boutique du pro', 'Gallery Taphouse': 'Gallery Taphouse', 'Club events': 'Événements du club', 'Club office': 'Bureau du club' };
  add({ 'Dues': 'Cotisation', 'Pro Shop': 'Boutique du pro', 'Other': 'Autre', 'Payment': 'Paiement' });
  add({
    'Account charge': 'Frais au compte',
    'Payment received, thank you': 'Paiement reçu, merci',
    'Paid': 'Payé',
    'Past due': 'En souffrance',
    'Issued': 'Émis',
    'Overview': 'Aperçu',
    'Activity': 'Activité',
    'Pay': 'Payer',
    'Dining this month': 'Restauration ce mois-ci',
    'Monthly minimum': 'Minimum mensuel',
    'Dining minimum progress': 'Progression du minimum de restauration',
    'Food and drink minimum': 'Minimum de nourriture et boissons',
    'Credit': 'Crédit',
    'Settled': 'Réglé',
    'Nothing is due. Thank you.': 'Aucun montant dû. Merci.',
    'On receipt': 'Sur réception',
    'Next statement': 'Prochain relevé',
    'Your balance, statements and payments in one place.': 'Votre solde, vos relevés et vos paiements au même endroit.',
    'Your account': 'Votre compte',
    'Current balance': 'Solde actuel',
    'Payment due': 'Paiement dû',
    'Last payment': 'Dernier paiement',
    'None yet': 'Aucun pour l’instant',
    'Your payments will appear here': 'Vos paiements apparaîtront ici',
    'Latest statement': 'Dernier relevé',
    'None issued': 'Aucun émis',
    'Statements are issued monthly': 'Les relevés sont émis chaque mois',
    'Make a payment': 'Faire un paiement',
    'View statement': 'Voir le relevé',
    'To date': 'À ce jour',
    'No charges yet this month.': 'Aucuns frais ce mois-ci pour l’instant.',
    'Recent activity': 'Activité récente',
    'View all activity': 'Voir toute l’activité',
    'No activity yet': 'Aucune activité pour l’instant',
    'Your charges and payments will appear here.': 'Vos frais et paiements apparaîtront ici.'
  });
  pat(/^Due (.+)$/, 'Échéance le $1');
  pat(/^Member number (.+?)( · (.+) membership)?$/, function (m) { return 'Numéro de membre ' + m[1] + (m[2] ? ' · Adhésion ' + m[3] : ''); });
  pat(/^A shortfall of (.+) has been applied for (.+)\. It appears in your activity\.$/, 'Un manque à gagner de $1 a été appliqué pour $2. Il figure dans votre activité.');
  pat(/^You have met your (.+) minimum\. Thank you\.$/, 'Vous avez atteint votre minimum de $1. Merci.');
  pat(/^You have (.+) left to spend toward your (.+) minimum, with (today|1 day|(\d+) days) left in the month\. Anything left over is added to your account at month end\.$/, function (m) {
    var left = m[3] === 'today' ? 'aujourd’hui seulement' : m[3] === '1 day' ? '1 jour' : m[4] + ' jours';
    return 'Il vous reste ' + m[1] + ' à dépenser pour atteindre votre minimum de ' + m[2] + ', et ' + left + ' avant la fin du mois. Tout solde restant est porté à votre compte à la fin du mois.';
  });
  pat(/^(Dues|Golf|Pro Shop|Dining|Events|Lessons|Other)( · (Golf shop|Gallery Taphouse|Club events|Club office))?$/, function (m) { return CAT[m[1]] + (m[2] ? ' · ' + SRC[m[3]] : ''); });
  pat(/^(.+) will go toward your next charges$/, '$1 sera appliqué à vos prochains frais');
  pat(/^(Past due · )?(.+) statement$/, function (m) { return (m[1] ? 'En souffrance · ' : '') + 'Relevé de ' + m[2]; });
  pat(/^New charges will be on your (.+) statement$/, 'Les nouveaux frais figureront sur votre relevé de $1');
  pat(/^(.+) is more than 30 days old\. If you have already paid, you can ignore this\.$/, '$1 date de plus de 30 jours. Si vous avez déjà payé, ne tenez pas compte de ce message.');
  pat(/^This month · (.+) to date$/, 'Ce mois-ci · $1 à ce jour');
  pat(/^(.+) · by department$/, '$1 · par service');
  /* The balance counts up with an English "$" prefix on French digits ("$1 196,30"): put the dollar sign after. */
  pat(/^([-−]?)\$(\d[\d   ]*(?:,\d+)?)$/, function (m) { return m[1] + m[2] + NB + '$'; });
  add({
    'Your spending by department, ready to print': 'Vos dépenses par service, prêtes à imprimer',
    'Season total so far': 'Total de la saison à ce jour',
    'View and download': 'Voir et télécharger',
    'Rate your visits': 'Évaluez vos visites',
    'Tell us how your rounds and meals went': 'Dites-nous comment se sont passés vos parties et vos repas',
    'Paid in full': 'Payé en entier',
    'Monthly instalments': 'Versements mensuels',
    'Renewed': 'Renouvelé',
    'View your plan': 'Voir votre plan',
    'Placeholder amount in this demo.': 'Montant fictif dans cette démo.',
    'You are renewed for next season': 'Votre adhésion est renouvelée pour la prochaine saison',
    'Renewal for next season': 'Renouvellement pour la prochaine saison',
    'Today, charged when you confirm': 'Aujourd’hui, porté au compte lorsque vous confirmez',
    'Posted': 'Porté au compte',
    'Scheduled': 'Prévu',
    'Back to my account': 'Retour à mon compte',
    'Renewal is not available': 'Le renouvellement n’est pas offert',
    'Please call the club office to renew your membership.': 'Veuillez appeler le bureau du club pour renouveler votre adhésion.',
    'Your plan': 'Votre plan',
    'Membership': 'Adhésion',
    'Season': 'Saison',
    'Plan': 'Plan',
    'Dues for the year': 'Cotisation de l’année',
    'On your account so far': 'À votre compte jusqu’ici',
    'Still to come': 'À venir',
    'Each instalment is added to your account on its date and appears on that month’s statement.': 'Chaque versement est porté à votre compte à sa date et figure sur le relevé de ce mois.',
    'Remaining schedule': 'Échéancier restant',
    'Schedule': 'Échéancier',
    'All on your account': 'Tout est à votre compte',
    'Please call the club office': 'Veuillez appeler le bureau du club',
    'Choose how to pay next season’s dues. Nothing is charged until you confirm.': 'Choisissez comment payer la cotisation de la prochaine saison. Rien n’est facturé avant votre confirmation.',
    'Placeholder amount in this demo, not a confirmed club price.': 'Montant fictif dans cette démo, et non un prix confirmé du club.',
    'How would you like to pay?': 'Comment souhaitez-vous payer?',
    'Payment plan': 'Mode de paiement',
    'Pay in full': 'Payer en entier',
    'Charged to your member account today': 'Porté à votre compte de membre aujourd’hui',
    'Yearly dues can be spread from the sign-up date until August.': 'La cotisation annuelle peut être étalée de la date d’inscription jusqu’en août.',
    'Your schedule': 'Votre échéancier',
    'One payment today': 'Un seul paiement aujourd’hui',
    'today, in full': 'aujourd’hui, en entier',
    'Renewing': 'Renouvellement',
    'First charge': 'Premier montant',
    'The full amount is added to your account today and appears on your next statement.': 'Le montant total est porté à votre compte aujourd’hui et figurera sur votre prochain relevé.',
    'Confirm your renewal': 'Confirmer votre renouvellement',
    'Confirm renewal': 'Confirmer le renouvellement',
    'That membership could not be found.': 'Cette adhésion est introuvable.',
    'Please call the club office to renew.': 'Veuillez appeler le bureau du club pour renouveler.',
    'Balance brought forward': 'Solde reporté',
    'Payment received': 'Paiement reçu',
    'Membership dues': 'Cotisation des membres'
  });
  pat(/^(\d{4}) season summary$/, 'Sommaire de la saison $1');
  pat(/^Nothing has been charged to your account in (\d{4}) yet\.$/, 'Rien n’a encore été porté à votre compte en $1.');
  pat(/^(\d+) visits? from the last 14 days to rate$/, function (m) { return m[1] + ' ' + pl(m[1], 'visite', 'visites') + ' des 14 derniers jours à évaluer'; });
  pat(/^Monthly instalments, (\d+) of (\d+) on your account$/, 'Versements mensuels, $1 sur $2 à votre compte');
  pat(/^(\d+) monthly instalments of (.+?)( \(the last is (.+)\))?$/, function (m) { return m[1] + ' versements mensuels de ' + m[2] + (m[3] ? ' (le dernier est de ' + m[4] + ')' : ''); });
  pat(/^Next instalment (.+) on (.+)\. (\d+) of (\d+) still to come\.$/, 'Prochain versement de $1 le $2. Il en reste $3 sur $4.');
  pat(/^Your (\d{4}) dues of (.+) are on your account\. Thank you\.$/, 'Votre cotisation $1 de $2 est à votre compte. Merci.');
  pat(/^To renew for (\d{4}), please call the club office at$/, 'Pour renouveler pour $1, veuillez appeler le bureau du club au');
  pat(/^(.+) dues for (\d{4})$/, 'Cotisation $1 pour $2');
  pat(/^Pay in full(, or in (\d+) monthly instalments of (.+?)( \(the last is (.+)\))? from (.+) until August)?\.$/, function (m) {
    return 'Payez en entier' + (m[1] ? ', ou en ' + m[2] + ' versements mensuels de ' + m[3] + (m[4] ? ' (le dernier est de ' + m[5] + ')' : '') + ' de ' + m[6] + ' jusqu’en août' : '') + '.';
  });
  pat(/^Renew for (\d{4})$/, 'Renouveler pour $1');
  pat(/^(\d{4}) membership$/, 'Adhésion $1');
  pat(/^Instalment (\d+) of (\d+)$/, 'Versement $1 sur $2');
  pat(/^Your (\d{4}) membership$/, 'Votre adhésion $1');
  pat(/^You are renewed for (\d{4})\. Thank you, (.+)\.$/, 'Votre adhésion est renouvelée pour $1. Merci, $2.');
  pat(/^Renewed (.+)$/, 'Renouvelé le $1');
  pat(/^Everything for (\d{4}) is on your account\. Questions\? Call the club office at (.+)\.$/, 'Tout pour $1 est à votre compte. Des questions? Appelez le bureau du club au $2.');
  pat(/^Each instalment is added to your account on its date and appears on that month’s statement\. Questions\? Call the club office at (.+)\.$/, 'Chaque versement est porté à votre compte à sa date et figure sur le relevé de ce mois. Des questions? Appelez le bureau du club au $1.');
  pat(/^(\d+) of (\d+) still to come$/, '$1 sur $2 à venir');
  pat(/^Your membership cannot be renewed online\. The club office at (.+) can help\.$/, 'Votre adhésion ne peut pas être renouvelée en ligne. Le bureau du club au $1 peut vous aider.');
  pat(/^(\d+) payments, (.+) to August (\d{4})$/, '$1 paiements, de $2 à août $3');
  pat(/^Total for (\d{4})$/, 'Total pour $1');
  pat(/^today, then (\d+) more$/, 'aujourd’hui, puis $1 autres');
  pat(/^(.+) membership, (\d{4}) season$/, 'Adhésion $1, saison $2');
  pat(/^Monthly instalments, (\d+) payments$/, 'Versements mensuels, $1 paiements');
  pat(/^The other (\d+) instalments are added to your account on the 1st of each month until August (\d{4}) and appear on your monthly statements\.$/, 'Les $1 autres versements sont portés à votre compte le 1er de chaque mois jusqu’en août $2 et figurent sur vos relevés mensuels.');
  pat(/^You are already renewed for (\d{4})$/, 'Votre adhésion est déjà renouvelée pour $1');
  pat(/^Thank you\. You are renewed for (\d{4})$/, 'Merci. Votre adhésion est renouvelée pour $1');
  /* Charge descriptions written by the club system (js/modules/*), as members read them in Activity and statements. */
  pat(/^(\d{4}) dues, (.+) membership(, instalment (\d+) of (\d+)|, paid in full)$/, function (m) { return 'Cotisation ' + m[1] + ', adhésion ' + m[2] + (m[4] ? ', versement ' + m[4] + ' sur ' + m[5] : ', payée en entier'); });
  pat(/^(\d{4}) membership renewal$/, 'Renouvellement de l’adhésion $1');
  pat(/^(.+) membership, (\d{4}) season(, instalment (\d+) of (\d+))?$/, function (m) { return 'Adhésion ' + m[1] + ', saison ' + m[2] + (m[3] ? ', versement ' + m[4] + ' sur ' + m[5] : ''); });
  pat(/^(.+) dues instalment, (.+) membership$/, 'Versement de cotisation de $1, adhésion $2');
  pat(/^Guest green fee: (.+) \((\d+) holes\)$/, 'Droits de jeu d’invité' + NB + ': $1 ($2 trous)');
  pat(/^Cart fee: (.+) \((\d+) holes\)$/, 'Frais de voiturette' + NB + ': $1 ($2 trous)');
  pat(/^Payment received, (.+)$/, function (m) { return 'Paiement reçu, ' + (m[1] === 'thank you' ? 'merci' : T(m[1])); });
  pat(/^F&B minimum shortfall, (.+)$/, 'Manque à gagner du minimum de restauration, $1');
  pat(/^Academy: (.+)$/, 'Académie' + NB + ': $1');
  pat(/^(Private lesson|Playing lesson|Club fitting|Junior clinic|Group clinic) with (.+) \((\d+) min\)$/, function (m) { return lt(m[1]) + ' avec ' + m[2] + ' (' + m[3] + ' min)'; });
  pat(/^Pro Shop sale No\. (.+?) · (.+)$/, 'Vente à la boutique du pro nº $1 · $2');
  pat(/^Beverage cart · (.+)$/, 'Voiturette-bar · $1');
  pat(/^Gift card (.+) for (.+)$/, 'Carte-cadeau $1 pour $2');
  pat(/^Credit: (.+) registration cancelled$/, 'Crédit' + NB + ': inscription annulée, $1');
  pat(/^(.+) \(member( \+ (\d+) guests?)?\)$/, function (m) { return m[1] + ' (membre' + (m[2] ? ' + ' + m[3] + ' ' + pl(m[3], 'invité', 'invités') : '') + ')'; });
  pat(/^(.+) \((\d+) additional guests?\)$/, function (m) { return m[1] + ' (' + m[2] + ' ' + pl(m[2], 'invité supplémentaire', 'invités supplémentaires') + ')'; });
  pat(/^Credit: (.+) \((\d+) guest (place|places) released\)$/, function (m) { return 'Crédit' + NB + ': ' + m[1] + ' (' + m[2] + ' ' + pl(m[2], 'place d’invité libérée', 'places d’invité libérées') + ')'; });
  /* Sample charge descriptions seeded by the club system (js/modules/billing.js); product names stay as sold. */
  add({
    'Guest green fee, weekday': 'Droits de jeu d’invité, semaine',
    'Guest green fee, weekend': 'Droits de jeu d’invité, fin de semaine',
    'Power cart, 18 holes': 'Voiturette motorisée, 18 trous',
    'Power cart, 9 holes': 'Voiturette motorisée, 9 trous',
    'Guest green fee and power cart': 'Droits de jeu d’invité et voiturette motorisée',
    'Regrip, full set': 'Remplacement des poignées, ensemble complet',
    'Gallery Taphouse & Grill lunch': 'Gallery Taphouse & Grill, dîner',
    'Gallery Taphouse & Grill dinner': 'Gallery Taphouse & Grill, souper',
    'Gallery Taphouse & Grill breakfast': 'Gallery Taphouse & Grill, déjeuner',
    'Meeting room booking': 'Réservation de salle de réunion',
    'Member-guest entry': 'Inscription au tournoi membre-invité',
    'Club championship entry': 'Inscription au championnat du club',
    'Members’ league night': 'Soirée de la ligue des membres',
    'Club event entry': 'Inscription à un événement du club',
    'Holiday party, two tickets': 'Réception des Fêtes, deux billets',
    'Private lesson, 60 minutes': 'Cours privé, 60 minutes',
    'Playing lesson, 9 holes': 'Cours sur le parcours, 9 trous',
    'Club fitting session': 'Séance d’ajustement de bâtons',
    'Junior Golf program': 'Programme de golf junior',
    'SIM teaching session': 'Séance d’enseignement SIM'
  });
  add({
    'Download summary': 'Télécharger le sommaire',
    'Download summary opens your device’s print window: choose Save as PDF to keep a copy.': 'Télécharger le sommaire ouvre la fenêtre d’impression de votre appareil' + NB + ': choisissez Enregistrer en PDF pour en garder une copie.',
    'Prepared for': 'Préparé pour',
    'Covers': 'Période',
    'Charges': 'Frais',
    'Credits and refunds': 'Crédits et remboursements',
    'Season total': 'Total de la saison',
    'Payments made': 'Paiements effectués',
    'By department': 'Par service',
    'Department': 'Service',
    'Items': 'Articles',
    'Share': 'Part',
    'Amount': 'Montant',
    'By month': 'Par mois',
    'Month': 'Mois',
    'Entries': 'Entrées',
    'Compared with other months': 'Comparé aux autres mois',
    'Top items': 'Principaux articles',
    'Item': 'Article',
    'Times': 'Fois',
    'Payments and credits': 'Paiements et crédits',
    'Account credit': 'Crédit au compte',
    'Account activity': 'Activité du compte',
    'Every charge and payment on your account, newest first.': 'Tous les frais et paiements de votre compte, du plus récent au plus ancien.',
    'All activity': 'Toute l’activité',
    'Payments': 'Paiements',
    'All months': 'Tous les mois',
    'Nothing to show': 'Rien à afficher',
    'Nothing matches these filters.': 'Rien ne correspond à ces filtres.',
    'Clear filters': 'Effacer les filtres',
    'A receipt for everything you pay for or order, ready to view, print or save.': 'Un reçu pour tout ce que vous payez ou commandez, prêt à consulter, imprimer ou enregistrer.',
    'Item or receipt number': 'Article ou numéro de reçu',
    'No receipts yet': 'Aucun reçu pour l’instant',
    'When you pay or order something at the club, its receipt will be kept here for you.': 'Quand vous payez ou commandez quelque chose au club, le reçu est conservé ici pour vous.',
    'Show receipts from': 'Afficher les reçus de',
    'No receipts match': 'Aucun reçu ne correspond',
    'Try another word or month.': 'Essayez un autre mot ou un autre mois.',
    'Clear search': 'Effacer la recherche',
    'Your monthly statements from the club office.': 'Vos relevés mensuels du bureau du club.',
    'No statements yet': 'Aucun relevé pour l’instant',
    'Your first statement comes at the start of the month after your account opens.': 'Votre premier relevé arrive au début du mois suivant l’ouverture de votre compte.',
    'Back to statements': 'Retour aux relevés',
    'Statement not found': 'Relevé introuvable',
    'This statement is not available on your account. Please contact the club office if you need a copy.': 'Ce relevé n’est pas disponible à votre compte. Communiquez avec le bureau du club si vous avez besoin d’une copie.',
    'Print': 'Imprimer',
    'Statement for': 'Relevé de',
    'Statement': 'Relevé',
    'Period': 'Période',
    'Previous balance': 'Solde précédent',
    'Payments received': 'Paiements reçus',
    'New charges': 'Nouveaux frais',
    'Balance due': 'Solde dû',
    'Description': 'Description',
    'Total charges': 'Total des frais',
    'No charges in this period.': 'Aucuns frais pour cette période.',
    'Method': 'Mode',
    'Reference': 'Référence',
    'Card payment': 'Paiement par carte',
    'No payments received in this period.': 'Aucun paiement reçu pour cette période.',
    'Card': 'Carte'
  });
  pat(/^Established (.+)$/, 'Fondé en $1');
  pat(/^Member number (.+) · (.+)$/, 'Numéro de membre $1 · $2');
  pat(/^January 1 to (.+)$/, function (m) { return 'Du 1er janvier au ' + m[1]; });
  pat(/^(\d+) issued$/, function (m) { return m[1] + ' ' + pl(m[1], 'émis', 'émis'); });
  pat(/^(\d+) payments?$/, function (m) { return m[1] + ' ' + pl(m[1], 'paiement', 'paiements'); });
  pat(/^No payments in (\d{4})\.$/, 'Aucun paiement en $1.');
  pat(/^No credits or refunds in (\d{4})\.$/, 'Aucun crédit ni remboursement en $1.');
  pat(/^Nothing was charged to your account in (\d{4})\.$/, 'Rien n’a été porté à votre compte en $1.');
  pat(/^Thank you for a wonderful (\d{4}) season at (.+)\.$/, 'Merci pour cette merveilleuse saison $1 au $2.');
  pat(/^This summary lists the charges, credits and payments on your account from (.+)\. Taxes are included\. Your balance today is (.+)\. Questions about your account\? Call the Controller at$/, function (m) {
    return 'Ce sommaire présente les frais, crédits et paiements portés à votre compte ' + m[1].replace(/^January 1 to /, 'du 1er janvier au ') + '. Les taxes sont incluses. Votre solde aujourd’hui est de ' + m[2] + '. Des questions sur votre compte? Appelez le contrôleur au';
  });
  pat(/^(.+) season summary$/, 'Sommaire de la saison $1');
  pat(/^(.+) ext\. 202$/, '$1, poste 202');
  pat(/^Credit (.+), (.+), (.+), (.+)$/, 'Crédit $1, $2, $3, $4');
  pat(/^Receipt (R-.+?), (.+), (.+), (.+)$/, 'Reçu $1, $2, $3, $4');
  pat(/^(R-\d+)( · (\d+) items)?( · (.+))?$/, function (m) { return m[1] + (m[2] ? ' · ' + m[3] + ' articles' : '') + (m[4] ? ' · ' + T(m[5]) : ''); });
  pat(/^(\d+) receipts?$/, function (m) { return m[1] + ' ' + pl(m[1], 'reçu', 'reçus'); });
  pat(/^Issued (.+?)( · due (.+?))?( · paid (.+))?$/, function (m) { return 'Émis le ' + m[1] + (m[2] ? ' · échéance le ' + m[3] : '') + (m[4] ? ' · payé le ' + m[5] : ''); });
  pat(/^Pay (.+)$/, function (m) { return /\d/.test(m[1]) ? 'Payer ' + m[1] : null; });
  pat(/^Thank you for being a member of (.+)\.$/, 'Merci d’être membre du $1.');
  pat(/^Please pay by (.+)\. Questions about your account\? Call the Controller at$/, function (m) { return 'Veuillez payer ' + (m[1] === 'return' ? 'par retour du courrier' : 'd’ici le ' + m[1]) + '. Des questions sur votre compte? Appelez le contrôleur au'; });
  add({
    'Cheque': 'Chèque',
    'Received by the club office': 'Reçu par le bureau du club',
    'Remove': 'Retirer',
    'Security code *': 'Code de sécurité *',
    'Make a payment': 'Faire un paiement',
    'Pay your account by card.': 'Payez votre compte par carte.',
    'Choose an amount': 'Choisissez un montant',
    'Full balance': 'Solde complet',
    'Everything you owe today': 'Tout ce que vous devez aujourd’hui',
    'Another amount': 'Un autre montant',
    'Enter any amount': 'Entrez n’importe quel montant',
    'Pay by card': 'Payer par carte',
    'Secure': 'Sécurisé',
    'Balance today': 'Solde aujourd’hui',
    'Balance after this payment': 'Solde après ce paiement',
    'Credited right away. We never store your full card number or security code.': 'Crédité immédiatement. Nous ne conservons jamais votre numéro de carte complet ni votre code de sécurité.',
    'Pay now': 'Payer maintenant',
    'Enter the amount you would like to pay.': 'Entrez le montant que vous souhaitez payer.',
    'Enter an amount in dollars and cents, for example 250.00.': 'Entrez un montant en dollars et en cents, par exemple 250,00.',
    'Payments must be greater than zero.': 'Les paiements doivent être supérieurs à zéro.',
    'There is nothing due for that option': 'Aucun montant n’est dû pour cette option',
    'Confirm your payment': 'Confirmer votre paiement',
    'We could not take that payment. Please call the club office.': 'Nous n’avons pas pu traiter ce paiement. Veuillez appeler le bureau du club.',
    'Account payment': 'Paiement au compte',
    'Payment on account': 'Paiement au compte',
    'Receipts for everything you pay for or order.': 'Les reçus de tout ce que vous payez ou commandez.',
    'Receipt not found': 'Reçu introuvable',
    'This receipt is not available on your account. All of your receipts are listed under Receipts.': 'Ce reçu n’est pas disponible à votre compte. Tous vos reçus figurent sous Reçus.',
    'Payment received': 'Paiement reçu',
    'New balance': 'Nouveau solde',
    'in credit': 'en crédit',
    'Print or save as PDF': 'Imprimer ou enregistrer en PDF',
    'All receipts': 'Tous les reçus',
    'Account': 'Compte'
  });
  pat(/^(Visa|Mastercard|American Express|Discover|Diners Club|JCB|UnionPay|Card) ending (\d{4})$/, function (m) { return (m[1] === 'Card' ? 'Carte' : m[1]) + ' se terminant par ' + m[2]; });
  pat(/^Remove (.+) ending (\d{4})$/, 'Retirer $1 se terminant par $2');
  pat(/^Your account is (in credit by (.+)|fully paid)\. You can still pay ahead\. The amount is kept as a credit for future charges\.$/, function (m) {
    return 'Votre compte est ' + (m[2] ? 'créditeur de ' + m[2] : 'entièrement payé') + '. Vous pouvez tout de même payer d’avance. Le montant est conservé en crédit pour vos prochains frais.';
  });
  pat(/^Past due since (.+)$/, 'En souffrance depuis le $1');
  pat(/^For payments over (.+), please call the Controller at (.+)\.$/, 'Pour les paiements de plus de $1, veuillez appeler le contrôleur au $2.');
  pat(/^Enter the (\d)-digit security code on the (front|back) of the card\.$/, function (m) { return 'Entrez le code de sécurité à ' + m[1] + ' chiffres au ' + (m[2] === 'front' ? 'recto' : 'verso') + ' de la carte.'; });
  pat(/^Pay (.+) to (.+) with your (.+) ending (\d{4})\?$/, 'Payer $1 au $2 avec votre $3 se terminant par $4?');
  pat(/^Thank you\. Your payment of (.+) has been received$/, 'Merci. Votre paiement de $1 a été reçu');
  pat(/^Pays your (.+) (statement|statements)\.$/, function (m) { return 'Paie votre relevé de ' + et(m[1]).replace(' et ', ' et de ') + '.'; });
  pat(/^Thank you, (.+)\. Your account has been updated\.$/, 'Merci, $1. Votre compte a été mis à jour.');
  /* ---------------- Score posting demo (js/portal/scores.js) ---------------- */
  var TEE = { 'Black': 'Noirs', 'Green': 'Verts', 'Silver': 'Argent' };
  function tee(s) { return TEE[s] || s; }
  add({
    'Black': 'Noirs', 'Silver': 'Argent',
    'Demo only. This app is not yet connected to Golf Canada. Scores are saved in this demo, not your Golf Canada record.': 'Démo seulement. Cette application n’est pas encore reliée à Golf Canada. Les scores sont enregistrés dans cette démo, pas dans votre dossier Golf Canada.',
    'Demo.': 'Démo.',
    'Not connected to Golf Canada. Scores stay in this demo.': 'Non relié à Golf Canada. Les scores restent dans cette démo.',
    'Demo': 'Démo',
    'Not attested': 'Non attesté',
    'No scores yet. Scores you post in this demo will be listed here.': 'Aucun score pour l’instant. Les scores que vous inscrivez dans cette démo s’afficheront ici.',
    'Tees': 'Tertres',
    'Gross / adjusted': 'Brut / ajusté',
    'Differential': 'Différentiel',
    'Attested by': 'Attesté par',
    'Score history, newest first': 'Historique des scores, du plus récent au plus ancien',
    'Posted as a total only, so there is no hole-by-hole card.': 'Inscrit en total seulement : il n’y a donc pas de carte trou par trou.'.replace(' :', NB + ':'),
    'Front nine': 'Aller',
    'Back nine': 'Retour',
    'Hole': 'Trou',
    'Par': 'Normale',
    'Out': 'Aller',
    'In': 'Retour',
    'Over net double bogey: counts as net double bogey in the adjusted score.': 'Au-delà du double bogey net' + NB + ': compte comme double bogey net dans le score ajusté.',
    'Course handicap': 'Handicap de parcours',
    'Course rating / slope': 'Évaluation du parcours / pente',
    'Placeholder': 'Fictif',
    'Playing conditions': 'Conditions de jeu',
    'Calculated by Golf Canada': 'Calculé par Golf Canada',
    'Played with': 'Joué avec',
    'Index after this score': 'Indice après ce score',
    'Demo estimate': 'Estimation démo',
    'Adjusted': 'Ajusté',
    'Scores': 'Scores',
    'Your club record': 'Votre dossier au club',
    'Needs 3 scores': 'Exige 3 scores',
    'Rounds to post': 'Parties à inscrire',
    'Post a score for another round': 'Inscrire un score pour une autre partie',
    'A round not booked in the app': 'Une partie non réservée dans l’application',
    'Your rounds from the last two weeks are all posted.': 'Vos parties des deux dernières semaines sont toutes inscrites.',
    'Score history': 'Historique des scores',
    'Post score': 'Inscrire le score',
    'Round': 'Partie',
    'Attest': 'Attestation',
    'We could not find that round': 'Nous n’avons pas trouvé cette partie',
    'It may have been cancelled. You can still post a score for a round that is not in the app.': 'Elle a peut-être été annulée. Vous pouvez tout de même inscrire un score pour une partie qui n’est pas dans l’application.',
    'Post a score': 'Inscrire un score',
    'This round is already posted': 'Cette partie est déjà inscrite',
    'View score': 'Voir le score',
    'This round has not finished yet': 'Cette partie n’est pas encore terminée',
    'You can post your score once the round is complete.': 'Vous pourrez inscrire votre score une fois la partie terminée.',
    'Steps': 'Étapes',
    'Demo only. Nothing is sent to Golf Canada.': 'Démo seulement. Rien n’est envoyé à Golf Canada.',
    'Which nine': 'Quel neuf',
    'Front 9': 'Aller',
    'Back 9': 'Retour',
    'holes 1 to 9': 'trous 1 à 9',
    'holes 10 to 18': 'trous 10 à 18',
    'Yardage and par from the club scorecard. Course and slope ratings: calculated by Golf Canada (placeholders in this demo).': 'Verges et normale tirées de la carte de pointage du club. Évaluations du parcours et de la pente' + NB + ': calculées par Golf Canada (valeurs fictives dans cette démo).',
    'gives 1 back': 'rend 1 coup',
    'How to enter your score': 'Comment entrer votre score',
    'Hole by hole': 'Trou par trou',
    'Total only': 'Total seulement',
    'Adjusted gross score': 'Score brut ajusté',
    'Count any hole worse than net double bogey as net double bogey. Post hole by hole and the app works this out for you.': 'Comptez tout trou au-delà du double bogey net comme un double bogey net. Inscrivez trou par trou et l’application le calcule pour vous.',
    'Nine': 'Neuf',
    'Played with you': 'A joué avec vous',
    'Not on your friends list': 'Pas dans votre liste d’amis',
    'Guests cannot attest in the app': 'Les invités ne peuvent pas attester dans l’application',
    'Cannot attest in the app': 'Ne peut pas attester dans l’application',
    'Friend': 'Ami',
    'A playing partner can attest your score. This is optional.': 'Un partenaire de jeu peut attester votre score. C’est facultatif.',
    'Who attests your score': 'Qui atteste votre score',
    'No attestation': 'Aucune attestation',
    'Post without a marker': 'Inscrire sans marqueur',
    'None of your playing partners are on your friends list, so they cannot attest in the app.': 'Aucun de vos partenaires de jeu n’est dans votre liste d’amis : ils ne peuvent donc pas attester dans l’application.'.replace(' :', NB + ':'),
    'You played this round on your own.': 'Vous avez joué cette partie seul.',
    'Add friends in Friends to have them attest your scores.': 'Ajoutez des amis dans Amis pour qu’ils attestent vos scores.',
    'In the demo the attestation is saved with your score. Nobody is notified.': 'Dans la démo, l’attestation est enregistrée avec votre score. Personne n’est avisé.',
    'Date played': 'Date jouée',
    'Review': 'Vérifier',
    'Review your score': 'Vérifier votre score',
    'Entered': 'Entré',
    'Post to Golf Canada (demo)': 'Inscrire auprès de Golf Canada (démo)',
    'Score saved in the demo': 'Score enregistré dans la démo',
    'Saved in the demo': 'Enregistré dans la démo',
    'Score saved in this demo': 'Score enregistré dans cette démo',
    'New handicap index': 'Nouvel indice de handicap',
    'Post at least 3 scores to see a demo estimate of your index.': 'Inscrivez au moins 3 scores pour voir une estimation démo de votre indice.',
    'Golf Canada (demo)': 'Golf Canada (démo)',
    'Demo, not sent to Golf Canada': 'Démo, non envoyé à Golf Canada',
    'Link Golf Canada account': 'Relier le compte Golf Canada',
    'Not connected (demo)': 'Non relié (démo)',
    'What linking will do': 'Ce que la liaison permettra',
    'Post scores from this app straight to your Golf Canada record.': 'Inscrire les scores de cette application directement dans votre dossier Golf Canada.',
    'Show your official handicap index and score history here.': 'Afficher ici votre indice de handicap officiel et votre historique des scores.',
    'Let a playing partner attest your score from their phone.': 'Permettre à un partenaire de jeu d’attester votre score depuis son téléphone.',
    'The club is applying for access to Golf Canada. Once it has access, you will sign in with your Golf Canada account here to link it. Until then this is a demo: nothing is sent to or read from Golf Canada.': 'Le club a demandé l’accès à Golf Canada. Une fois l’accès obtenu, vous vous connecterez ici avec votre compte Golf Canada pour le relier. D’ici là, il s’agit d’une démo' + NB + ': rien n’est envoyé à Golf Canada ni lu de Golf Canada.',
    'Link account (once the club has access)': 'Relier le compte (quand le club aura l’accès)',
    'Scores are for golfing members': 'Les scores sont réservés aux membres golfeurs',
    'Your membership does not include golf. The golf shop can tell you about golfing memberships.': 'Votre adhésion ne comprend pas le golf. La boutique du pro peut vous renseigner sur les adhésions golf.',
    'Optional': 'Facultatif'
  });
  pat(/^(.+), (Black|Green|Silver) tees, (\d+) holes\. Gross (\d+), adjusted (\d+), differential (.+)\. (Attested by (.+)|Not attested)\. Open details$/, function (m) {
    return m[1] + ', tertres ' + tee(m[2]).toLowerCase() + ', ' + m[3] + ' trous. Brut ' + m[4] + ', ajusté ' + m[5] + ', différentiel ' + dec(m[6]) + '. ' + (m[8] ? 'Attesté par ' + m[8] : 'Non attesté') + '. Ouvrir les détails';
  });
  pat(/^(Black|Green|Silver)( · 9 holes)?$/, function (m) { return tee(m[1]) + (m[2] ? ' · 9 trous' : ''); });
  pat(/^Diff$/, 'Diff.');
  pat(/^Counts as (\d+)$/, 'Compte pour $1');
  pat(/^, counts as (\d+)$/, ', compte pour $1');
  /* Friend profile: which hand they play and their recent rounds (js/portal/friends.js) */
  add({
    'Hand not recorded': 'Main non indiquée',
    'Plays right-handed': 'Joue en droitier',
    'Plays left-handed': 'Joue en gaucher',
    'Recent rounds': 'Parties récentes',
    'League and tournaments': 'Ligue et tournois',
    'Which hand do you play?': 'De quelle main jouez-vous?',
    'Right-handed': 'Droitier',
    'Left-handed': 'Gaucher',
    'Your friends at the club and the golf shop can see this. You can change it in Profile.': 'Vos amis au club et la boutique du pro peuvent voir ce renseignement. Vous pouvez le modifier dans Profil.',
    'Plays': 'Joue',
    'Played alone': 'Joué seul'
  });
  pat(/^Welcome, (.+)\. One quick question before you start\.$/, 'Bienvenue, $1. Une petite question avant de commencer.');
  pat(/^Saved: (Right|Left)-handed$/, function (m) { return 'Enregistré' + NB + ': ' + (m[1] === 'Right' ? 'droitier' : 'gaucher'); });
  pat(/^(Black|Green|Silver) tees · (\d+) holes · Differential (.+)$/, function (m) { return 'Tertres ' + tee(m[1]).toLowerCase() + ' · ' + m[2] + ' trous · Différentiel ' + dec(m[3]); });
  pat(/^(.+), (Black|Green|Silver) tees · (\d+) holes · Differential (.+), score (\d+)\. Open scorecard$/, function (m) {
    return m[1] + ', tertres ' + tee(m[2]).toLowerCase() + ' · ' + m[3] + ' trous · différentiel ' + dec(m[4]) + ', score ' + m[5] + '. Ouvrir la carte de score';
  });
  pat(/^((.+) · )?(\d+) holes( \((front|back) nine\))? · (Black|Green|Silver) tees$/, function (m) {
    return (m[2] ? tl(m[2]) + ' · ' : '') + m[3] + ' trous' + (m[5] ? ' (' + (m[5] === 'back' ? 'retour' : 'aller') + ')' : '') + ' · tertres ' + tee(m[6]).toLowerCase();
  });
  pat(/^(.+) · (.+) · (\d+) holes( \((front|back) nine\))? · (Black|Green|Silver) tees$/, function (m) {
    return m[1] + ' · ' + m[2] + ' · ' + m[3] + ' trous' + (m[5] ? ' (' + (m[5] === 'back' ? 'retour' : 'aller') + ')' : '') + ' · tertres ' + tee(m[6]).toLowerCase();
  });
  pat(/^Best (\d+) of (\d+)$/, 'Meilleurs $1 sur $2');
  pat(/^(\d+) scores?$/, function (m) { return m[1] + ' score' + (m[1] === '1' ? '' : 's'); });
  pat(/^(\d+) holes · (A solo round|With (.+))$/, function (m) { return m[1] + ' trous · ' + (m[3] ? 'Avec ' + et(m[3]) : 'Une partie en solo'); });
  pat(/^You posted (\d+) for this round in the demo\.$/, 'Vous avez inscrit $1 pour cette partie dans la démo.');
  pat(/^(.+) · (\d+) holes$/, function (m) { return tl(m[1]) + ' · ' + m[2] + ' trous'; });
  pat(/^(\d+) holes$/, '$1 trous');
  pat(/^([\d,   ]+) yards · Par (\d+)$/, function (m) { return m[1].replace(/,/g, ' ') + ' verges · Normale ' + m[2]; });
  pat(/^Par (\d+)$/, 'Normale $1');
  pat(/^SI (\d+)( · ((\d+) strokes?|gives 1 back))?$/, function (m) { return 'ID ' + m[1] + (m[2] ? ' · ' + (m[4] ? m[4] + ' ' + pl(m[4], 'coup', 'coups') : 'rend 1 coup') : ''); });
  pat(/^Hole (\d+), par (\d+)$/, 'Trou $1, normale $2');
  pat(/^One (fewer|more) on hole (\d+)$/, function (m) { return (m[1] === 'fewer' ? 'Un de moins au trou ' : 'Un de plus au trou ') + m[2]; });
  pat(/^One (fewer|more)$/, function (m) { return m[1] === 'fewer' ? 'Un de moins' : 'Un de plus'; });
  pat(/^Net double bogey, course handicap (−?-?\d+) \(demo\)$/, 'Double bogey net, handicap de parcours $1 (démo)');
  pat(/^Each hole counts at most net double bogey: par plus 2, plus any strokes you receive there\. Your course handicap from the (Black|Green|Silver) tees is (−?-?\d+) \(from your index (.+) and placeholder demo ratings\), so you receive (a stroke on the (hardest hole|(\d+) hardest holes) by stroke index|no strokes)\.$/, function (m) {
    var rec = m[6] ? 'un coup sur les ' + m[6] + ' trous les plus difficiles selon l’indice de difficulté' : m[5] ? 'un coup sur le trou le plus difficile selon l’indice de difficulté' : 'aucun coup';
    return 'Chaque trou compte au plus un double bogey net' + NB + ': la normale plus 2, plus les coups que vous recevez à ce trou. Votre handicap de parcours depuis les tertres ' + tee(m[1]).toLowerCase() + ' est de ' + m[2] + ' (selon votre indice ' + dec(m[3]) + ' et des évaluations démo fictives) : vous recevez donc '.replace(' :', NB + ':') + rec + '.';
  });
  pat(/^Your adjusted total for (\d+) holes$/, 'Votre total ajusté pour $1 trous');
  pat(/^(Today|Yesterday), (.+)$/, function (m) { return (m[1] === 'Today' ? 'Aujourd’hui, ' : 'Hier, ') + m[2]; });
  pat(/^(\d+) holes · (Black|Green|Silver) tees$/, function (m) { return m[1] + ' trous · tertres ' + tee(m[2]).toLowerCase(); });
  pat(/^Total (\d+) · Adjusted (\d+)$/, 'Total $1 · Ajusté $2');
  pat(/^Course handicap (−?-?\d+) \(demo\)$/, 'Handicap de parcours $1 (démo)');
  pat(/^Enter a whole number from (\d+) to (\d+)\.$/, 'Entrez un nombre entier de $1 à $2.');
  pat(/^The differential uses placeholder ratings( and the nine-hole expected score)?, so it is a demo figure\. Golf Canada calculates the real one\.$/, function (m) { return 'Le différentiel utilise des évaluations fictives' + (m[1] ? ' et le score attendu sur neuf trous' : '') + ' : c’est donc un chiffre démo. Golf Canada calcule le véritable.'.replace(' :', NB + ':'); });
  pat(/^(\d+) \(adjusted (\d+)\) on (.+)\. Nothing was sent to Golf Canada\.$/, '$1 (ajusté $2) le $3. Rien n’a été envoyé à Golf Canada.');
  pat(/^Best (\d+) of your last (\d+) differentials(, (minus )?([\d.]+))?( \(WHS uses the best 8 of 20 once you have 20 scores\))?\. Your official index stays (.+) until Golf Canada updates it\.$/, function (m) {
    return 'Meilleurs ' + m[1] + ' de vos ' + m[2] + ' derniers différentiels' + (m[3] ? ', ' + (m[4] ? 'moins ' : '') + dec(m[5]) : '') + (m[6] ? ' (le SHM utilise les 8 meilleurs sur 20 une fois que vous avez 20 scores)' : '') + '. Votre indice officiel reste ' + dec(m[7]) + ' jusqu’à ce que Golf Canada le mette à jour.';
  });
  pat(/^(\d+) scores? in this demo$/, function (m) { return m[1] + ' score' + (m[1] === '1' ? '' : 's') + ' dans cette démo'; });
  pat(/^(No\. (.+) · )?Not connected \(demo\)$/, function (m) { return (m[1] ? 'Nº ' + m[2] + ' · ' : '') + 'Non relié (démo)'; });
  pat(/^Demo estimate (.+), (.+)$/, function (m) { return 'Estimation démo ' + dec(m[1]) + ', ' + m[2]; });
  pat(/^Handicap index from (.+) to (.+), (.+) to (.+?)(\. Demo estimate (.+), shown dashed\.)?$/, function (m) {
    return 'Indice de handicap de ' + m[1] + ' à ' + m[2] + ', de ' + dec(m[3]) + ' à ' + dec(m[4]) + (m[5] ? '. Estimation démo ' + dec(m[6]) + ', en pointillé.' : '');
  });
  pat(/^Post your score from (.+?)(, (\d+) holes( with (.+))?\. Demo, not sent to Golf Canada)?$/, function (m) {
    var w = m[1].replace(/^today, /, 'aujourd’hui, ');
    return 'Inscrivez votre score de ' + w + (m[2] ? ', ' + m[3] + ' trous' + (m[4] ? ' avec ' + et(m[5]) : '') + '. Démo, non envoyé à Golf Canada' : '');
  });
  pat(/^(\d+) holes( · (\d+) more to post)?$/, function (m) { return m[1] + ' trous' + (m[2] ? ' · ' + m[3] + ' autre' + (m[3] === '1' ? '' : 's') + ' à inscrire' : ''); });
  pat(/^Posted (\d+)$/, 'Inscrit $1');
  pat(/^Post score for (.+) at (.+)$/, 'Inscrire le score du $1 à $2');
  /* ---------------- Gift cards (js/portal/gifts.js) ---------------- */
  add({
    'Gift cards': 'Cartes-cadeaux',
    'Gifts': 'Cadeaux',
    'For green fees, the pro shop and the Gallery Taphouse & Grill.': 'Pour les droits de jeu, la boutique du pro et le Gallery Taphouse & Grill.',
    'Your recipient': 'Votre destinataire',
    'Buy gift card': 'Acheter la carte-cadeau',
    'Choose an amount': 'Choisissez un montant',
    'Your gift card is ready': 'Votre carte-cadeau est prête',
    'Print or save the gift card': 'Imprimer ou enregistrer la carte-cadeau',
    'Buy another gift card': 'Acheter une autre carte-cadeau',
    'Amount': 'Montant',
    'Other amount': 'Autre montant',
    'Amount in dollars *': 'Montant en dollars *',
    'Who is it for?': 'Pour qui?',
    'Recipient’s name': 'Nom du destinataire',
    'Recipient’s email': 'Courriel du destinataire',
    'Kept with the card. This demonstration does not send email.': 'Conservé avec la carte. Cette démonstration n’envoie pas de courriel.',
    'Message (optional)': 'Message (facultatif)',
    'Happy holidays. See you on the first tee.': 'Joyeuses Fêtes. On se voit au premier départ.',
    'Signed from': 'De la part de',
    'Payment': 'Paiement',
    'Preview': 'Aperçu',
    'Use letters only, please.': 'Veuillez utiliser des lettres seulement.',
    'Enter the recipient’s name.': 'Entrez le nom du destinataire.',
    'That email address does not look right.': 'Cette adresse courriel ne semble pas valide.',
    'Enter the recipient’s email.': 'Entrez le courriel du destinataire.',
    'Enter the name to sign the card with.': 'Entrez le nom à inscrire sur la carte.',
    'Please check the highlighted fields': 'Veuillez vérifier les champs en surbrillance',
    'Processing payment': 'Traitement du paiement',
    'Buying': 'Achat en cours',
    'Void': 'Annulée',
    'Used': 'Utilisée',
    'left': 'restant',
    'Gift cards for you': 'Cartes-cadeaux pour vous',
    'Gift cards you bought': 'Cartes-cadeaux que vous avez achetées',
    'No gift cards yet': 'Aucune carte-cadeau pour l’instant',
    'Gift cards you buy are kept here with their balances.': 'Les cartes-cadeaux que vous achetez sont conservées ici avec leur solde.',
    'Buy a gift card': 'Acheter une carte-cadeau',
    'Balance': 'Solde',
    'Bought': 'Achetée',
    'Returned to the card': 'Remis sur la carte',
    'Voided': 'Annulée',
    'Not used yet.': 'Pas encore utilisée.',
    'Print or save': 'Imprimer ou enregistrer',
    'Check a balance': 'Vérifier un solde',
    'Gift card code': 'Code de la carte-cadeau',
    'Check': 'Vérifier',
    'Enter the gift card code.': 'Entrez le code de la carte-cadeau.',
    'Gift card codes have 12 letters and numbers.': 'Les codes de carte-cadeau comptent 12 lettres et chiffres.',
    'We could not find that gift card. Check the code and try again.': 'Nous n’avons pas trouvé cette carte-cadeau. Vérifiez le code et réessayez.',
    'Not valid': 'Non valide',
    'This gift card has been fully used.': 'Cette carte-cadeau a été entièrement utilisée.',
    'Buy': 'Acheter',
    'My gift cards': 'Mes cartes-cadeaux'
  });
  pat(/^Print it or save it as a PDF to give to (.+?)\.( (.+)\.)?$/, function (m) { return 'Imprimez-la ou enregistrez-la en PDF pour la remettre à ' + m[1] + '.' + (m[2] ? ' ' + tr(m[3]) + '.' : ''); });
  pat(/^Buy gift card · (.+)$/, 'Acheter la carte-cadeau · $1');
  pat(/^(.+) gift card$/, 'Carte-cadeau de $1');
  pat(/^(\d+) to (\d+)$/, '$1 à $2');
  pat(/^Any whole amount from (.+) to (.+)\.$/, 'Tout montant entier de $1 à $2.');
  pat(/^(\d+) characters left$/, function (m) { return m[1] + ' ' + pl(m[1], 'caractère restant', 'caractères restants'); });
  pat(/^Choose a whole amount from (.+) to (.+)\.$/, 'Choisissez un montant entier de $1 à $2.');
  pat(/^Your account cannot take new charges right now\. Please pay by card, or call the club office at (.+)\.$/, 'Votre compte ne peut pas recevoir de nouveaux frais pour le moment. Veuillez payer par carte ou appeler le bureau du club au $1.');
  pat(/^We could not complete your purchase\. Nothing was charged\. Please call the club office at (.+)\.$/, 'Nous n’avons pas pu terminer votre achat. Rien n’a été facturé. Veuillez appeler le bureau du club au $1.');
  pat(/^(.+) · (from|for) (.+)$/, function (m) { return /\$/.test(m[1]) ? m[1] + ' · ' + (m[2] === 'from' ? 'de ' + (m[3] === 'a friend' ? 'un ami' : m[3]) : 'pour ' + m[3]) : null; });
  pat(/^This gift card has been voided\. Please call the golf shop at (.+)\.$/, 'Cette carte-cadeau a été annulée. Veuillez appeler la boutique du pro au $1.');
  pat(/^Available of (.+)\.$/, 'Disponible sur $1.');
  /* ---------------- Takeout (js/portal/takeout.js) and Rate your visits (js/portal/feedback.js) ---------------- */
  add({
    'Takeout': 'Pour emporter',
    'Order from the Gallery menu and pick up at the clubhouse. Charge it to your account or pay by card.': 'Commandez du menu du Gallery et passez prendre votre commande au pavillon. Portez-la à votre compte ou payez par carte.',
    'On the way': 'En préparation',
    'All orders': 'Toutes les commandes',
    'Current': 'En cours',
    'Past orders': 'Commandes passées',
    'No takeout orders yet': 'Aucune commande pour emporter pour l’instant',
    'Order from the Gallery menu and pick it up at the clubhouse.': 'Commandez du menu du Gallery et passez la prendre au pavillon.',
    'Order takeout': 'Commander pour emporter',
    'Order': 'Commander',
    'My orders': 'Mes commandes',
    'Rounds': 'Parties',
    'Meals': 'Repas',
    'All': 'Tout',
    'Rate': 'Évaluer',
    'Nothing to rate right now': 'Rien à évaluer pour le moment',
    'Your ratings go to the club team to help improve the course, the dining room and lessons. They are not shown to other members.': 'Vos évaluations sont transmises à l’équipe du club pour améliorer le parcours, la salle à manger et les cours. Elles ne sont pas montrées aux autres membres.'
  });
  pat(/^(\d+) current$/, '$1 en cours');
  pat(/^All (\d+) visits? rated\. Thank you\.$/, function (m) { return (m[1] === '1' ? 'La visite est évaluée' : 'Les ' + m[1] + ' visites sont évaluées') + '. Merci.'; });
  pat(/^(\d+) of (\d+) rated$/, '$1 sur $2 évaluées');
  pat(/^How did it go\? One tap is enough, and a comment is up to you\. Your visits from the last (\d+) days are here, and you can change a rating any time until then\.$/, 'Comment ça s’est passé? Un seul toucher suffit, et le commentaire est facultatif. Vos visites des $1 derniers jours sont ici, et vous pouvez modifier une évaluation en tout temps d’ici là.');
  pat(/^After a round, a meal or a lesson, your visit shows here for (\d+) days so you can tell us how it went\.$/, 'Après une partie, un repas ou un cours, votre visite s’affiche ici pendant $1 jours pour que vous puissiez nous dire comment ça s’est passé.');
  /* ---------------- Tee time waitlist (js/portal/waitlist.js) ---------------- */
  function ordFr(s) { return String(s).replace(/^(\d+)(st|nd|rd|th)$/, function (x, n) { return n + (n === '1' ? 're' : 'e'); }); }
  add({
    'A spot has opened': 'Une place s’est libérée',
    'Book this time': 'Réserver cette heure',
    'No thanks': 'Non merci',
    'Waitlist': 'Liste d’attente',
    'Next in line': 'Prochain sur la liste',
    'We tell the first golfer in line as soon as a spot opens. Your notice shows on Home and here.': 'Nous avisons le premier golfeur sur la liste dès qu’une place se libère. Votre avis s’affiche sur l’Accueil et ici.',
    'Notify me': 'M’aviser',
    'Not in your play times': 'Hors de vos heures de jeu',
    'Day': 'Jour',
    'This tee time is full': 'Cette heure de départ est complète',
    'You’re on the waitlist': 'Vous êtes sur la liste d’attente',
    'You are next in line.': 'Vous êtes le prochain sur la liste.',
    'It is open to everyone, so book soon.': 'La place est ouverte à tous : réservez vite.'.replace(' :', NB + ':')
  });
  pat(/^You are the first to know until (.+)\.$/, 'Vous êtes le premier avisé jusqu’à $1.');
  pat(/^(.+) at (.+)$/, function (m) { return /^(Today|Tomorrow)$/.test(m[1]) || /^\d{1,2}(:\d{2}|\s?h)/.test(m[2]) && m[2].length < 24 && /[a-zé]/i.test(m[1]) && m[1].length < 30 ? tl(m[1]) + ' à ' + m[2] : null; });   /* times only: "Sat, Nov 14 at 3:40 PM", never "Pickup at the golf shop. Order W-0004." */
  pat(/^(\d+) players? from your waitlist\. (.+)$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + ' de votre liste d’attente. ' + tr(m[2]); });
  pat(/^(\d+) players?$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs'); });
  pat(/^(\d+) players? ·$/, function (m) { return m[1] + ' ' + pl(m[1], 'joueur', 'joueurs') + ' ·'; });
  pat(/^Spot open at (.+)$/, 'Place libre à $1');
  pat(/^(\d+)(st|nd|rd|th) in line$/, function (m) { return m[1] + (m[1] === '1' ? 're' : 'e') + ' sur la liste'; });
  pat(/^Leave the waitlist for (.+)$/, 'Quitter la liste d’attente du $1');
  pat(/^We will let you know on Home and on Tee times as soon as a spot opens for your group\. The first golfer on the list hears first and has (\d+) minutes before the next golfer is told\.$/, 'Nous vous aviserons sur l’Accueil et dans Départs dès qu’une place se libère pour votre groupe. Le premier golfeur sur la liste est avisé en premier et dispose de $1 minutes avant que le suivant soit avisé.');
  pat(/^Book (.+)$/, function (m) { return /\d/.test(m[1]) ? 'Réserver ' + m[1] : null; });
  pat(/^(.+), (.+) · (\d+) players?$/, function (m) { return tl(m[1]) + ', ' + tr(m[2]) + ' · ' + m[3] + ' ' + pl(m[3], 'joueur', 'joueurs'); });
  pat(/^You are (\d+)(st|nd|rd|th) in line\. We will let you know on Home and on Tee times when a spot opens\.$/, function (m) { return 'Vous êtes ' + m[1] + (m[1] === '1' ? 're' : 'e') + ' sur la liste. Nous vous aviserons sur l’Accueil et dans Départs quand une place se libérera.'; });
  pat(/^You are next in line\. We will let you know on Home and on Tee times when a spot opens\.$/, 'Vous êtes le prochain sur la liste. Nous vous aviserons sur l’Accueil et dans Départs quand une place se libérera.');
  pat(/^You are on the waitlist for (.+)$/, 'Vous êtes sur la liste d’attente du $1');
  pat(/^You have left the waitlist for (.+)$/, 'Vous avez quitté la liste d’attente du $1');
  /* ---------------- Pieces and exact forms for text that the shared and public dictionaries split first ----------------
     Their patterns run before this file's, and some answer for portal text: the " · " fallback translates each piece on
     its own, "Cart, (.+)" translates its tail, and "(.+?) · with (.+?)" leaves the tail in English. Exact strings win
     over every pattern, so the forms the portal draws are listed here, and the pieces are given their own entries. */
  (function () {
    var venues = ['The Course', 'Banquet Hall', 'Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio', 'Short game practice facility', 'The clubhouse'];
    var o = {};
    venues.forEach(function (v) {
      for (var n = 1; n <= 8; n++) o[v + ' · with ' + n + (n === 1 ? ' guest' : ' guests')] = tr(v) + ' · avec ' + n + ' ' + pl(n, 'invité', 'invités');
    });
    for (var h = 1; h <= 18; h++) { o['One fewer on hole ' + h] = 'Un de moins au trou ' + h; o['One more on hole ' + h] = 'Un de plus au trou ' + h; }
    add(o);
  })();
  add({
    'The Course': 'Le parcours',
    'Short game practice facility': 'Installation de pratique du petit jeu',
    'Cart, you': 'Voiturette, vous',
    'Cart, guest': 'Voiturette, invité',
    'Green fee, guest': 'Droits de jeu, invité',
    'Guest green fee, guest': 'Droits de jeu d’invité, invité',
    'You haven’t registered for any yet': 'Vous n’êtes inscrit à aucun pour l’instant',
    '· Breakfast, lunch and dinner': '· Déjeuner, dîner et souper',
    '· Served until 2pm': '· Servi jusqu’à 14' + NB + 'h',
    '· Book online or call the golf shop': '· Réservez en ligne ou appelez la boutique du pro',
    '· Members': '· Membres',
    '· With our professionals': '· Avec nos professionnels',
    /* Block reasons the golf shop picks (js/modules/teesheet.js), as members read them on the booking rules */
    'Corporate tournament, shotgun start': 'Tournoi d’entreprise, départ simultané',
    'Friday member play': 'Jeu des membres du vendredi',
    'Greens mowing and rolling': 'Tonte et roulage des verts',
    'Junior golf': 'Golf junior',
    /* Program levels (js/modules/lessons.js) */
    'Ages 8 to 14': '8 à 14 ans',
    'Handicap 18 and under': 'Handicap de 18 et moins',
    'New to golf': 'Nouveaux golfeurs',
    /* Staff roles shown in Club info, Lessons and contacts */
    'Administrative Assistant': 'Adjoint administratif',
    'Assistant Superintendent': 'Surintendant adjoint',
    'Back Shop Supervisor': 'Superviseur de l’atelier',
    'Bar Manager': 'Gérant du bar',
    'Bartender': 'Barman',
    'Controller': 'Contrôleur',
    'Director of Clubhouse Operations': 'Directeur des opérations du pavillon',
    'Equipment Manager': 'Responsable de l’équipement',
    'Executive Chef': 'Chef exécutif',
    'Food & Beverage Manager': 'Directeur de la restauration',
    'Front Desk': 'Réception',
    'Grounds Crew': 'Équipe d’entretien',
    'Irrigation Technician': 'Technicien en irrigation',
    'Pro Shop Associate': 'Préposé à la boutique du pro',
    'Server': 'Serveur',
    'Sous Chef': 'Sous-chef',
    'Special Events Coordinator': 'Coordonnateur des événements spéciaux',
    'Starter': 'Préposé aux départs'
  });
  pat(/^You’re going to (\d+)$/, 'Vous êtes inscrit à $1');
  pat(/^(\d+) weeks from (.+)$/, '$1 semaines à partir du $2');
  pat(/^(Join|Request to join) (.+), ((?:Today|Tomorrow|\S+\.? \d+ \S+\.?) .+)$/, function (m) { return (m[1] === 'Join' ? 'Se joindre à ' : 'Demander à se joindre à ') + et(m[2]) + ', ' + tl(m[3]); });
  pat(/^Cancel request to join ((?:Today|Tomorrow).+)$/, function (m) { return 'Annuler la demande pour se joindre à ' + tl(m[1]); });
  pat(/^Leave the ((?:Today|Tomorrow).+) tee time$/, function (m) { return 'Quitter le départ de ' + tl(m[1]); });
  pat(/^(.+)–close of play: closed for (.+)$/, function (m) { return m[1] + '–la fin du jeu' + NB + ': fermé pour ' + (m[2] === 'club use' ? 'le club' : tr(m[2].charAt(0).toUpperCase() + m[2].slice(1)).toLowerCase()); });
  pat(/^(.+): closed for (.+)$/, function (m) { return m[1] + NB + ': fermé pour ' + (m[2] === 'club use' ? 'le club' : tr(m[2].charAt(0).toUpperCase() + m[2].slice(1)).toLowerCase()); });
  pat(/^(Receipt|Credit) (R-\d+), (.+), (\d+ \S+ \d{4}), (.+)$/, function (m) { return (m[1] === 'Credit' ? 'Crédit ' : 'Reçu ') + m[2] + ', ' + tr(m[3]) + ', ' + m[4] + ', ' + m[5]; });
  /* "Pay in full, or in 10 monthly instalments of …" (My account, next season): fr-public's /^Pay (.+)$/ answers first and
     translates only "Pay", so the exact sentences are added once the renewal rules are loaded (one per membership category). */
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var RN = Club.billing && Club.billing.renewal, F = Club.fmt; if (!RN || !Club.i18n || !Club.store || !document.body.classList.contains('portal')) return;
      var today = Club.date.today(), p = today.split('-').map(Number);
      var month = new Date(p[0], p[1] - 1, 1, 12).toLocaleDateString('en-US', { month: 'long' }), o = {};
      Club.store.all('membershipTiers').forEach(function (t) {
        var s = RN.schedule(t.annualDues, today, 'monthly'); if (s.length < 2) return;
        var a = s[0].amount, b = s[s.length - 1].amount, last = Math.abs(a - b) > 0.005;
        var en = 'Pay in full, or in ' + s.length + ' monthly instalments of ' + F.money(a) + (last ? ' (the last is ' + F.money(b) + ')' : '') + ' from ' + month + ' until August.';
        o[en] = 'Payez en entier, ou en ' + s.length + ' versements mensuels de ' + F.money(a) + (last ? ' (le dernier est de ' + F.money(b) + ')' : '') + ' de ' + month + ' jusqu’en août.';
      });
      Club.i18n.add({ strings: o });
    } catch (e) { /* the sentence stays as the shared dictionaries leave it */ }
  });

  /* Most specific first: patterns with more literal text are tried before broad ones such as "(.+) · (.+)", so a broad
     pattern never answers for a sentence a fuller pattern was written for. Stable for equal weights. */
  function weight(re) {   /* literal characters in the pattern (alternatives included); wildcards count for nothing */
    return re.source.replace(/\[[^\]]*\][*+?]?/g, '').replace(/\\[dDsSwWb][*+?]?|\{\d+(,\d*)?\}|\(\?:/g, '').replace(/\\(.)/g, '$1')
      .replace(/\.[*+?]\??/g, '').replace(/[\^$()|*+?]/g, '').length;
  }
  P = P.map(function (p, i) { return { p: p, w: weight(p[0]), i: i }; }).sort(function (a, b) { return b.w - a.w || a.i - b.i; }).map(function (x) { return x.p; });
  var dict = { strings: S, patterns: P };
  /* Portal pages only (member.html, <body class="portal">): this file is also loaded by public.html, and the portal's
     wording (and its broader patterns) must not change the public site's French. */
  var portal = document.body ? document.body.classList.contains('portal') : /member\.html/.test(location.pathname);
  if (!portal) return;
  if (window.Club && Club.i18n && typeof Club.i18n.add === 'function') Club.i18n.add(dict);
  else window.__i18nQueue = (window.__i18nQueue || []).concat([dict]);
})();

/* Added when fr-public.js was limited to the public site (it no longer runs on member.html): its " · " joiner and a few
   strings the portal had borrowed from it. Portal pages only, same gate as above. */
(function () {
  var portal = document.body ? document.body.classList.contains('portal') : /member\.html/.test(location.pathname);
  if (!portal || !window.Club || !Club.i18n || typeof Club.i18n.add !== 'function') return;
  var NB = ' ';
  function T(s) { try { return Club.i18n.t(s); } catch (e) { return s; } }
  var FR_WORD = /[àâçéèêëîïôûùüÿœ’]|\b(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|lun|mar|mer|jeu|ven|sam|dim)\b/i;
  Club.i18n.add({
    strings: {
      'The private club experience without the private club price': 'L’expérience d’un club privé, sans le prix d’un club privé',
      'Password *': 'Mot de passe *',
      'Signed from *': 'De la part de *'
    },
    patterns: [
      [/^(.+?) · (\d+) guests?$/, function (m, a, n) { return T(a) + ' · ' + n + (n === '1' ? ' invité' : ' invités'); }],
      [/^(.+?) · (\d+) orders? waiting$/, function (m, a, n) { return T(a) + ' · ' + n + (n === '1' ? ' commande en attente' : ' commandes en attente'); }],
      [/^(.+?)\. (Cart .+)$/, function (m, a, b) { var y = T(b); return y === b ? null : a + '. ' + y; }],
      [/^Message from (.+?): (.+)\. Options$/, function (m, who, msg) { return 'Message de ' + who + NB + ': ' + msg.replace(/\.$/, '') + '. Options'; }],
      [/^Club website · Weddings and events · (.+)$/, function (m, rest) { return 'Site Web du club · Mariages et événements · ' + T(rest); }],
      [/^(.+) · Received by the club office$/, function (m, d) { return d + ' · Reçu par le bureau du club'; }],
      /* Last: text joined with " · " when every part translates on its own or is neutral (times, money, French dates). */
      [/^.+ · .+$/, function (m) {
        var parts = m[0].split(' · '), changed = false;
        for (var i = 0; i < parts.length; i++) {
          var x = parts[i], y = T(x);
          if (y !== x) { parts[i] = y; changed = true; continue; }
          if (!/[A-Za-z]{2,}/.test(x.replace(/\b(h|min)\b/g, '')) || FR_WORD.test(x)) continue;
          return null;
        }
        return changed ? parts.join(' · ') : null;
      }]
    ]
  });
})();

/* Group outings (js/portal/outings.js): the page, the enquiry form, My enquiries, and the outing package data it shows
   (outingPackages and the tournament package text in js/shared/outings-data.js). Stored values stay in English.
   Portal pages only, same gate as above. */
(function () {
  var portal = document.body ? document.body.classList.contains('portal') : /member\.html/.test(location.pathname);
  if (!portal || !window.Club || !Club.i18n || typeof Club.i18n.add !== 'function') return;
  var NB = ' ';
  function T(s) { try { return Club.i18n.t(s); } catch (e) { return s; } }
  function lc(s) { s = String(s); return s.charAt(0).toLowerCase() + s.slice(1); }
  var PKG = { 'Birdie package': 'Forfait Birdie', 'Eagle package': 'Forfait Eagle', 'Platinum package': 'Forfait Platinum' };
  function names() { var o = Club.shared && Club.shared.outings; return o && o.PDF ? o.PDF.contacts.map(function (c) { return c.name; }) : []; }
  Club.i18n.add({
    strings: Object.assign({}, PKG, {
      /* Page and nav */
      'Group outings': 'Sorties de groupe',
      'Outings': 'Sorties',
      'Tournaments and corporate golf': 'Tournois et golf d’entreprise',
      'Located less than 4 km from Portage and Main, St. Boniface Golf Club is an excellent place to host your company or charity golf tournament.': 'À moins de 4 km de Portage et Main, le Club de golf St. Boniface est un excellent endroit pour accueillir le tournoi de golf de votre entreprise ou de votre organisme de bienfaisance.',
      'Plan an outing': 'Planifier une sortie',
      'My enquiries': 'Mes demandes',
      'Enquiries you send are kept here, and you can follow them as the club takes them forward.': 'Les demandes que vous envoyez sont conservées ici, et vous pouvez suivre leur progression à mesure que le club y donne suite.',
      'Send an enquiry': 'Envoyer une demande',
      'Packages': 'Forfaits',
      'Package': 'Forfait',
      'All pricing is surcharge inclusive. From the club’s 2026 tournament package.': 'Tous les prix incluent les suppléments. Tirés du forfait tournoi 2026 du club.',
      'All pricing is surcharge inclusive.': 'Tous les prix incluent les suppléments.',
      'Good to know': 'Bon à savoir',
      'per player': 'par joueur',
      'per ticket': 'par billet',
      'each': 'chacun',
      'Enquire about this package': 'Se renseigner sur ce forfait',
      /* Package data */
      'Format: Tee times': 'Formule' + NB + ': départs à heures fixes',
      'Format: Tee times or modified shotgun': 'Formule' + NB + ': départs à heures fixes ou départ simultané modifié',
      'Format: Shotgun': 'Formule' + NB + ': départ simultané',
      'Only available May and July': 'Offert seulement en mai et en juillet',
      'Only available May, July and September': 'Offert seulement en mai, en juillet et en septembre',
      '100 to 144 players, full shotgun': 'De 100 à 144 joueurs, départ simultané complet',
      '18-hole green fee (tee times)': 'Droit de jeu 18 trous (départs à heures fixes)',
      '18-hole green fee (tee times or modified shotgun only)': 'Droit de jeu 18 trous (départs à heures fixes ou départ simultané modifié seulement)',
      '18-hole green fee (shotgun)': 'Droit de jeu 18 trous (départ simultané)',
      'Shared power cart': 'Voiturette électrique partagée',
      'BBQ lunch': 'Dîner barbecue',
      'Buffet dinner': 'Souper buffet',
      /* Add-ons */
      'Food and beverage add-ons': 'Suppléments nourriture et boissons',
      'Food and beverage': 'Nourriture et boissons',
      'On-course food station': 'Station de restauration sur le parcours',
      'Beverage': 'Boissons',
      'Buffet': 'Buffet',
      'Registration station': 'Station d’inscription',
      'Carne asada tacos': 'Tacos carne asada',
      'DanDan Asian noodles': 'Nouilles asiatiques dan dan',
      'Fish and chips': 'Poisson-frites',
      'Sweet and sour meatball kabobs': 'Brochettes de boulettes aigres-douces',
      'Mac and cheese bar': 'Bar à macaroni au fromage',
      'Pulled pork sliders': 'Mini-burgers au porc effiloché',
      'Domestic beverage ticket': 'Billet pour boisson domestique',
      'Bottled water': 'Eau embouteillée',
      'On-course "adult" beverage station': 'Station de boissons «' + NB + 'pour adultes' + NB + '» sur le parcours',
      'Carvery': 'Station de découpe',
      'Exchange buffet dinner for (3) on-course stations': 'Remplacer le souper buffet par (3) stations sur le parcours',
      'Choice of all beef hotdog or CAB burger and a bottled Pepsi beverage': 'Au choix, hot-dog pur bœuf ou burger CAB, et une boisson Pepsi en bouteille',
      'Coffee and tea, fresh baked muffins': 'Café et thé, muffins frais du jour',
      'Margaritas, sangria or Caesars': 'Margaritas, sangria ou Caesars',
      'Roasted top sirloin, baked ham, pork loin': 'Haut de surlonge rôti, jambon au four, longe de porc',
      'Available only for the Platinum (100+ players) package': 'Offert seulement avec le forfait Platinum (100 joueurs et plus)',
      /* Buffet */
      'Build your own buffet': 'Composez votre buffet',
      'Fresh rolls and butter, 1 salad, 2 hot items, 1 vegetable, 1 starch, assorted dessert station, coffee and tea station.': 'Petits pains frais et beurre, 1 salade, 2 plats chauds, 1 légume, 1 féculent, station de desserts variés, station de café et de thé.',
      'Salads': 'Salades', 'Hot items': 'Plats chauds', 'Vegetables': 'Légumes', 'Starch': 'Féculents',
      'Choose 1': 'Choisir 1', 'Choose 2': 'Choisir 2',
      'Caesar salad, Tossed salad, Greek salad, Coleslaw, Potato salad, Pasta salad, Spinach salad': 'Salade César, salade verte, salade grecque, salade de chou, salade de pommes de terre, salade de pâtes, salade d’épinards',
      'Swedish meatballs, Perogies, Cabbage rolls, Pork schnitzel, Rotisserie chicken pieces, BBQ chicken pieces, Baked mac and cheese, BBQ ribs': 'Boulettes suédoises, pyrohy, cigares au chou, schnitzel de porc, morceaux de poulet rôti, morceaux de poulet barbecue, macaroni au fromage gratiné, côtes levées barbecue',
      'Vegetable medley, Green beans, Corn, Broccoli and cauliflower with cheese sauce': 'Mélange de légumes, haricots verts, maïs, brocoli et chou-fleur sauce au fromage',
      'Herb roasted potatoes, Dauphinoise potatoes, Lemon potatoes, Wild rice pilaf, Seasoned wedges, Baked potatoes': 'Pommes de terre rôties aux fines herbes, gratin dauphinois, pommes de terre au citron, pilaf de riz sauvage, quartiers de pommes de terre assaisonnés, pommes de terre au four',
      'Roasted top sirloin, Baked ham, Pork loin': 'Haut de surlonge rôti, jambon au four, longe de porc',
      /* Terms (the club's 2026 tournament agreement) */
      'Tournament terms': 'Conditions des tournois',
      'Deposits, payment, numbers and food and beverage': 'Dépôts, paiement, nombre de participants, nourriture et boissons',
      'Initial payment': 'Paiement initial',
      'Tournaments with under 100 players are required to pay a $500.00 initial deposit. Tournaments over 100 players require a $1,000.00 initial deposit. Initial payments are non-refundable and non-transferable. This payment will be applied to your final invoice, barring any damage to the course and equipment.': 'Les tournois de moins de 100 joueurs doivent verser un dépôt initial de 500,00' + NB + '$. Les tournois de plus de 100 joueurs exigent un dépôt initial de 1' + NB + '000,00' + NB + '$. Les paiements initiaux ne sont ni remboursables ni transférables. Ce paiement sera appliqué à votre facture finale, sauf en cas de dommages au parcours ou à l’équipement.',
      'Payment methods': 'Modes de paiement',
      'Accepted methods of payment are cash, cheque, debit, e-transfer, Visa, Mastercard and American Express. All credit card payments are subject to a 2.5% processing fee. A credit card number is required with bookings.': 'Les modes de paiement acceptés sont l’argent comptant, le chèque, la carte de débit, le virement électronique, Visa, Mastercard et American Express. Tous les paiements par carte de crédit sont assujettis à des frais de traitement de 2,5' + NB + '%. Un numéro de carte de crédit est exigé pour toute réservation.',
      'Final payment': 'Paiement final',
      'The balance of the total costs accrued is due within 30 days upon completion of your event. You will be invoiced by email within 7 business days of your event. If payment is not received within these guidelines, the credit card listed on the contract will be charged for the full amount owing. A charge of 2% per month will be applied on all overdue accounts.': 'Le solde des coûts engagés est payable dans les 30 jours suivant la fin de votre événement. Vous recevrez une facture par courriel dans les 7 jours ouvrables suivant votre événement. Si le paiement n’est pas reçu dans ces délais, la carte de crédit inscrite au contrat sera débitée du montant total dû. Des frais de 2' + NB + '% par mois s’appliquent à tous les comptes en souffrance.',
      'Guaranteed numbers': 'Nombre garanti',
      'Guaranteed numbers for golf and a list of all golfers is required no later than 5 days prior to the tournament. Guaranteed numbers for all meal service are required 5 business days before the event. If guaranteed numbers are not received, the club will prepare for the estimated number of guests on the contract and reserves the right to invoice for the estimated or actual number, whichever is greater, for both golf and meal service.': 'Le nombre garanti de golfeurs et la liste de tous les golfeurs doivent être fournis au plus tard 5 jours avant le tournoi. Le nombre garanti pour tout service de repas est exigé 5 jours ouvrables avant l’événement. Si le nombre garanti n’est pas reçu, le club se préparera pour le nombre estimé de personnes inscrit au contrat et se réserve le droit de facturer le nombre estimé ou réel, selon le plus élevé des deux, pour le golf comme pour les repas.',
      'Damages': 'Dommages',
      'Any damages to the facility, golf course or rental equipment such as power carts and clubs are the responsibility of the tournament organization and will be charged on your final invoice.': 'Tout dommage aux installations, au parcours ou à l’équipement de location, comme les voiturettes électriques et les bâtons, est la responsabilité de l’organisation du tournoi et sera facturé sur votre facture finale.',
      'Consumption of alcohol': 'Consommation d’alcool',
      'As per LGCA regulations, St. Boniface Golf Club must supply all alcoholic beverages consumed on the golf course. Private coolers are not permitted. Sample stations conducted by hole sponsors may be conducted at the discretion of our management team, in accordance with LGCA regulations.': 'Conformément aux règlements de la LGCA, le Club de golf St. Boniface doit fournir toutes les boissons alcoolisées consommées sur le parcours. Les glacières personnelles ne sont pas permises. Des stations de dégustation tenues par les commanditaires de trous peuvent être autorisées à la discrétion de notre équipe de direction, conformément aux règlements de la LGCA.',
      'Tee time and modified shotgun tournaments': 'Tournois avec départs à heures fixes et départ simultané modifié',
      'All golf events under 100 players are subject to tee times beginning at 11am or a modified shotgun start at the discretion of St. Boniface Golf Club. Tee time and modified shotgun events will not have sole use of the golf course.': 'Tous les événements de golf de moins de 100 joueurs se jouent avec des départs à heures fixes à compter de 11 h ou un départ simultané modifié, à la discrétion du Club de golf St. Boniface. Ces événements n’ont pas l’usage exclusif du parcours.',
      'Shotgun tournaments': 'Tournois avec départ simultané',
      'All shotgun events must have a minimum of 100 players or pay the equivalent course rental. Full field events are to be held Tuesday to Thursday with a 12:00pm start time, unless otherwise approved by St. Boniface Golf Club.': 'Tous les événements avec départ simultané doivent compter au moins 100 joueurs ou payer l’équivalent de la location du parcours. Les événements à pleine capacité ont lieu du mardi au jeudi avec un départ à 12 h, sauf autorisation contraire du Club de golf St. Boniface.',
      'All organized golf events with over 16 participants are required to arrange for a minimum of one pre-ordered meal. All food and beverage service must be provided by the golf club unless otherwise approved. F&B arrangements must be submitted a minimum of 8 weeks prior to the event.': 'Tous les événements de golf organisés de plus de 16 participants doivent prévoir au moins un repas commandé à l’avance. Tout le service de nourriture et de boissons doit être fourni par le club, sauf autorisation contraire. Les choix de nourriture et de boissons doivent être soumis au moins 8 semaines avant l’événement.',
      /* Contacts */
      'Tournament contacts': 'Personnes-ressources pour les tournois',
      'Director of Golf Operations': 'Directeur des opérations de golf',
      /* Statuses */
      'Enquiry received': 'Demande reçue',
      'Quote sent': 'Soumission envoyée',
      'Deposit received': 'Dépôt reçu',
      'Outing confirmed': 'Sortie confirmée',
      'Outing played': 'Sortie terminée',
      'Enquiry closed': 'Demande fermée',
      'Withdrawn': 'Retirée',
      'The club has your enquiry and will be in touch.': 'Le club a bien reçu votre demande et communiquera avec vous.',
      'The club has prepared a quote for your outing.': 'Le club a préparé une soumission pour votre sortie.',
      'Your deposit is on file and your date is held.': 'Votre dépôt est enregistré et votre date est réservée.',
      'Your outing is confirmed. We look forward to welcoming your group.': 'Votre sortie est confirmée. Nous avons hâte d’accueillir votre groupe.',
      'Thank you for bringing your group to the club.': 'Merci d’avoir choisi le club pour votre groupe.',
      'This enquiry is closed. Please call the club if you would like to pick it up again.': 'Cette demande est fermée. Veuillez appeler le club si vous souhaitez la reprendre.',
      'You withdrew this enquiry.': 'Vous avez retiré cette demande.',
      'Received': 'Reçue', 'Quote': 'Soumission', 'Deposit': 'Dépôt',
      /* Enquiry details */
      'Group': 'Groupe',
      'Preferred date': 'Date souhaitée',
      'Alternate date': 'Autre date',
      'Format': 'Formule',
      'Paid so far': 'Payé à ce jour',
      'Contact': 'Coordonnées',
      'Sent': 'Envoyée',
      'Not sure yet': 'Pas encore décidé',
      'Withdraw enquiry': 'Retirer la demande',
      'Withdraw this enquiry?': 'Retirer cette demande?',
      'The club will see that you withdrew it. To plan an outing later, send a new enquiry.': 'Le club verra que vous l’avez retirée. Pour planifier une sortie plus tard, envoyez une nouvelle demande.',
      'Keep enquiry': 'Garder la demande',
      'Your enquiry has been withdrawn': 'Votre demande a été retirée',
      'Your enquiry has been sent': 'Votre demande a été envoyée',
      /* Form */
      'Plan a group outing': 'Planifier une sortie de groupe',
      'Tell us about your group and the dates you have in mind. The club will be in touch about availability and a quote.': 'Parlez-nous de votre groupe et des dates envisagées. Le club communiquera avec vous au sujet des disponibilités et d’une soumission.',
      'Your group': 'Votre groupe',
      'Organisation or group name *': 'Nom de l’organisation ou du groupe *',
      'Company, charity, club or group': 'Entreprise, organisme de bienfaisance, club ou groupe',
      'Expected players *': 'Nombre de joueurs prévu *',
      'Dates': 'Dates',
      'Preferred date *': 'Date souhaitée *',
      'Alternate date (optional)': 'Autre date (facultatif)',
      'Choose a preferred date': 'Choisissez une date souhaitée',
      'Choose an alternate date': 'Choisissez une autre date',
      'Remove alternate date': 'Retirer l’autre date',
      'Package and format': 'Forfait et formule',
      'Not sure': 'Je ne sais pas',
      'The club will suggest one for your group': 'Le club vous en suggérera un pour votre groupe',
      'Tee time starts': 'Départs à heures fixes',
      'Shotgun start': 'Départ simultané',
      'No preference': 'Aucune préférence',
      'Contact name *': 'Nom de la personne-ressource *',
      'From your member profile. Change them here if the club should reach someone else.': 'Tirés de votre profil de membre. Modifiez-les ici si le club doit joindre quelqu’un d’autre.',
      'Food and notes': 'Repas et notes',
      'Food, drinks and anything else (optional)': 'Repas, boissons et autres précisions (facultatif)',
      'Meal ideas, prizes, hole sponsors, contests, special requests': 'Idées de repas, prix, commanditaires de trous, concours, demandes spéciales',
      'The food and beverage add-ons and the buffet are listed on the Group outings page.': 'Les suppléments nourriture et boissons et le buffet figurent sur la page Sorties de groupe.',
      'Send enquiry': 'Envoyer la demande',
      'Your enquiry': 'Votre demande',
      'Package estimate': 'Estimation du forfait',
      'Before taxes and any add-ons. The club confirms the price in your quote.': 'Avant taxes et suppléments. Le club confirmera le prix dans votre soumission.',
      'This is an enquiry, not a booking. The club will follow up with you.': 'Il s’agit d’une demande, et non d’une réservation. Le club fera le suivi avec vous.',
      'Not sure of the package': 'Forfait à déterminer',
      'Enter the name of your organisation or group.': 'Entrez le nom de votre organisation ou de votre groupe.',
      'Enter how many players you expect.': 'Indiquez le nombre de joueurs prévu.',
      'Choose a preferred date.': 'Choisissez une date souhaitée.',
      'Choose a different date from your preferred date, or remove it.': 'Choisissez une date différente de la date souhaitée, ou retirez-la.',
      'Enter a contact name.': 'Entrez le nom d’une personne-ressource.',
      'Enter an email address so the club can reply.': 'Entrez une adresse courriel pour que le club puisse vous répondre.',
      'Enter a 10-digit phone number, or leave it blank.': 'Entrez un numéro de téléphone à 10 chiffres, ou laissez le champ vide.',
      /* Confirmation */
      'See my enquiries': 'Voir mes demandes',
      'Back to Home': 'Retour à l’accueil'
    }),
    patterns: [
      [/^(\d+) to (\d+) players$/, '$1 à $2 joueurs'],
      [/^(\d+) to (\d+)$/, '$1 à $2'],
      [/^(\d+) players?$/, function (m, n) { return n + (+n > 1 ? ' joueurs' : ' joueur'); }],
      [/^(\$?[\d.,]+(?:\s?\$)?) per player$/, function (m, a) { return T(a) + ' par joueur'; }],
      [/^(\d+) options, priced per player or per item$/, '$1 options, prix par joueur ou à l’unité'],
      [/^Included with the (.+) and (.+)$/, function (m, a, b) { return PKG[a] && PKG[b] ? 'Inclus avec le ' + lc(PKG[a]) + ' et le ' + lc(PKG[b]) : null; }],
      [/^Included with the (.+)$/, function (m, a) { return PKG[a] ? 'Inclus avec le ' + lc(PKG[a]) : null; }],
      [/^(.+) and (.+)$/, function (m, a, b) { var n = names(); return n.indexOf(a) >= 0 && n.indexOf(b) >= 0 ? a + ' et ' + b : null; }],
      [/^(Birdie|Eagle|Platinum)(, (Birdie|Eagle|Platinum))*$/, function (m) { return m[0]; }],
      [/^Packages are for (\d+) to (\d+) players\.$/, 'Les forfaits s’adressent aux groupes de $1 à $2 joueurs.'],
      [/^Outings run (.+) to (.+)\. Each date shows the packages offered that month\.$/, 'Les sorties ont lieu de $1 à $2. Chaque date indique les forfaits offerts ce mois-là.'],
      [/^The (.+ package) is for (\d+) to (\d+) players\.(?: For (\d+) players, the (.+ package) fits\.)?$/, function (m, a, x, y, n, b) {
        if (!PKG[a] || (b && !PKG[b])) return null;
        return 'Le ' + lc(PKG[a]) + ' s’adresse aux groupes de ' + x + ' à ' + y + ' joueurs.' + (b ? ' Pour ' + n + ' joueurs, le ' + lc(PKG[b]) + ' convient.' : '');
      }],
      [/^(.+ package): (.+)\.$/, function (m, a, b) { var t = T(b); return PKG[a] && t !== b ? PKG[a] + NB + ': ' + lc(t) + '.' : null; }],
      [/^Shotgun events need at least (\d+) players or pay the equivalent course rental\.$/, 'Les départs simultanés exigent au moins $1 joueurs, sinon il faut payer l’équivalent de la location du parcours.'],
      [/^(\d+) players at (.+?) per player(?:, (.+ package))?$/, function (m, n, a, p) { if (p && !PKG[p]) return null; return n + ' joueurs à ' + T(a) + ' par joueur' + (p ? ', ' + PKG[p] : ''); }],
      [/^Thank you, (.+?)\. The club has your enquiry and will be in touch about availability and a quote\.$/, 'Merci, $1. Le club a bien reçu votre demande et communiquera avec vous au sujet des disponibilités et d’une soumission.'],
      [/^Questions in the meantime\? Call (.+?), (.+):$/, function (m, who, title) { var t = T(title); return t === title ? null : 'Des questions d’ici là? Appelez ' + who + ', ' + lc(t) + NB + ':'; }],
      [/^The club has already started on this enquiry\. Please call (.+) to make a change\.$/, 'Le club a déjà commencé à traiter cette demande. Veuillez appeler le $1 pour la modifier.'],
      [/^We could not send your enquiry\. Please try again, or call the club office at (.+)\.$/, 'Nous n’avons pas pu envoyer votre demande. Veuillez réessayer ou appeler le bureau du club au $1.']
    ]
  });
  /* "16 to 40 players": an earlier general pattern ("<number> to <number…>") would leave "players" in English, so the
     package ranges are added as exact strings once the package data has loaded (exact strings are looked up first). */
  document.addEventListener('DOMContentLoaded', function () {
    var add = {};
    ((Club.store && Club.store.all('outingPackages')) || []).forEach(function (p) {
      if (p.kind === 'package') add[p.minPlayers + ' to ' + p.maxPlayers + ' players'] = p.minPlayers + ' à ' + p.maxPlayers + ' joueurs';
    });
    Club.i18n.add({ strings: add });
  });
})();
