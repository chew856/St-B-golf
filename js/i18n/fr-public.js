/* French (Canada) strings for the public site: public.html and js/public/*.js.
   Exact strings are matched on the trimmed text of each text node (and placeholder, aria-label, title, alt);
   patterns cover text with names, numbers, times or dates inside (those parts are already French in French mode).
   Typography: nb() turns "10 h 30", "60 %", "Note :" and « » spacing into non-breaking spaces. */
(function () {
  'use strict';
  var NB = ' ';
  function nb(s) {
    return typeof s !== 'string' ? s : s
      .replace(/(\d) h (\d\d)/g, '$1' + NB + 'h' + NB + '$2').replace(/(\d) h\b/g, '$1' + NB + 'h')
      .replace(/ ([:%$»])/g, NB + '$1').replace(/« /g, '«' + NB);
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function T(s) {
    if (has(S, s)) return S[s];
    if (window.Club && Club.i18n && typeof Club.i18n.t === 'function') { try { return Club.i18n.t(s); } catch (e) { /* engine not ready */ } }
    return s;
  }
  function pl(n, one, many) { return n + ' ' + (+n <= 1 ? one : many); }
  var BANDS = { 'Weekday': 'Semaine', 'Twilight': 'Crépuscule', 'Weekend & holiday': 'Fin de semaine et fériés' };
  function band(b) { return BANDS[b] || b; }
  var DAYWORD = { 'Today': 'aujourd’hui', 'Tomorrow': 'demain' };
  /** Stored text is English (Club.fmtEn): its dates, times and money shown in French. */
  function F(s) { return window.Club && Club.fmtEn ? Club.fmtEn.fr(s) : s; }
  /** A receipt note's payment split: "Gift card ending 7KQ2: $20.00. Visa ending 4242: $5.00." */
  function parts(s) {
    var a = s.split('. ');
    return a.map(function (x, i) { if (i < a.length - 1) x += '.'; var m = /^(.+? ending [0-9A-Z]{4}|Card|Cash|Member account): (.+)\.$/.exec(x); return m ? (/ ending /.test(m[1]) ? T(m[1].replace(/ ending .*/, '')) + ' se terminant par ' + m[1].slice(-4) : T(m[1])) + ' : ' + F(m[2]) + '.' : T(x); }).join(' ');
  }

  var S = {
    /* ---------- public.html / shell (site.js) ---------- */
    'Public golf at St. Boniface': 'Golf public à St. Boniface',
    'Skip to content': 'Passer au contenu',
    'St. Boniface Golf Club public golf home': 'Accueil du golf public, St. Boniface Golf Club',
    'Public golf': 'Golf public',
    'Main': 'Principal',
    'Open menu': 'Ouvrir le menu',
    'Book a tee time': 'Réserver un départ',
    'My bookings': 'Mes réservations',
    'Order to the course': 'Commander sur le parcours',
    'My account': 'Mon compte',
    'Members sign in here': 'Connexion des membres',
    'More': 'Plus',
    'Sign in': 'Se connecter',
    'Create account': 'Créer un compte',
    'Create an account': 'Créer un compte',
    'Sign out': 'Se déconnecter',
    'Members,': 'Membres,',
    'sign in here': 'connectez-vous ici',
    'to book in the members’ portal.': 'pour réserver dans le portail des membres.',
    'St. Boniface Golf Club is located on Treaty One lands, the traditional territories of the Anishinaabe, Cree, Oji-Cree, Dakota and Dene peoples, and the homeland of the Métis Nation.':
      'Le St. Boniface Golf Club est situé sur les terres du Traité n° 1, territoires traditionnels des peuples anishinaabe, cri, oji-cri, dakota et déné, et patrie de la Nation métisse.',
    'You have signed out. See you on the course': 'Vous êtes déconnecté. À bientôt sur le parcours',
    'This page could not load': 'Cette page n’a pas pu se charger',
    'Calendar invitation downloaded': 'Invitation de calendrier téléchargée',
    'Your browser could not create the calendar file': 'Votre navigateur n’a pas pu créer le fichier de calendrier',
    'That receipt is not available': 'Ce reçu n’est pas disponible',
    'Your payment': 'Votre paiement',
    'Print receipt': 'Imprimer le reçu',
    'Refunded payment': 'Paiement remboursé',
    'Payment receipt': 'Reçu de paiement',
    'Paid with': 'Payé avec',
    'Confirmation': 'Confirmation',
    'Green fees include tax.': 'Les droits de jeu incluent les taxes.',
    'Thank you for choosing St. Boniface. We look forward to welcoming you.': 'Merci d’avoir choisi St. Boniface. Au plaisir de vous accueillir.',
    /* account validation (site.js) */
    'Choose a password.': 'Choisissez un mot de passe.',
    'Use at least 8 characters.': 'Utilisez au moins 8 caractères.',
    'Include at least one letter and one number.': 'Incluez au moins une lettre et un chiffre.',
    'Use letters only, please.': 'Veuillez n’utiliser que des lettres.',
    'Enter your first name.': 'Entrez votre prénom.',
    'Enter your last name.': 'Entrez votre nom de famille.',
    'That email address does not look right.': 'Cette adresse courriel ne semble pas valide.',
    'Enter your email address.': 'Entrez votre adresse courriel.',
    'An account already uses this email. Try signing in instead.': 'Un compte utilise déjà ce courriel. Essayez plutôt de vous connecter.',
    'Enter a 10-digit phone number, for example (204) 555-0123.': 'Entrez un numéro de téléphone à 10 chiffres, par exemple (204) 555-0123.',
    'Enter a phone number so the golf shop can reach you.': 'Entrez un numéro de téléphone pour que la boutique du pro puisse vous joindre.',
    'Use the Canadian format A1A 1A1.': 'Utilisez le format canadien A1A 1A1.',
    'Enter your postal code.': 'Entrez votre code postal.',
    /* availability re-check (site.js) */
    'That tee time has just passed. Please choose a later time.': 'Cette heure de départ vient de passer. Veuillez choisir une heure plus tardive.',
    'The course has closed for today. Please choose another day.': 'Le parcours est fermé pour aujourd’hui. Veuillez choisir un autre jour.',
    'This group has changed since you chose it. Please choose another time.': 'Ce groupe a changé depuis votre choix. Veuillez choisir une autre heure.',
    'This tee time has just filled. Please choose another time.': 'Cette heure de départ vient d’être comblée. Veuillez choisir une autre heure.',
    'club use': 'usage du club',

    /* ---------- Home and booking (book.js) ---------- */
    'Book your tee time 7 days in advance': 'Réservez votre heure de départ 7 jours à l’avance',
    'Built in 1931, St. Boniface Golf Club is a majestic traditional style course with tree-lined fairways, small sloping greens and the Seine River running the length of our signature 17th. We would love to see you on the first tee.':
      'Construit en 1931, le St. Boniface Golf Club est un majestueux parcours de style traditionnel, avec des allées bordées d’arbres, de petits verts en pente et la rivière Seine qui longe notre 17e trou emblématique. Nous serions ravis de vous accueillir au premier tertre.',
    'Find a tee time': 'Trouver un départ',
    'Create your account': 'Créer votre compte',
    'Green fees': 'Droits de jeu',
    'Green fees, tax included': 'Droits de jeu, taxes incluses',
    'Weekday': 'Semaine',
    'Monday to Thursday, 10:30 AM to 3:30 PM': 'Du lundi au jeudi, de 10 h 30 à 15 h 30',
    'Twilight': 'Crépuscule',
    'Weekdays after 5:30 PM': 'En semaine après 17 h 30',
    'Weekend & holiday': 'Fin de semaine et fériés',
    'Weekends and holidays after 1:00 PM': 'Fins de semaine et jours fériés après 13 h',
    'Our signature hole': 'Notre trou emblématique',
    'The par-5 17th': 'Le 17e, une normale 5',
    'Black': 'Noir',
    'Silver': 'Argent',
    'Green': 'Vert',
    'With the Seine River running along the entire hole and plenty of trees along the right side. Two bunkers await most balls that are heading for the putting surface, while the river is there to catch any errant shots that are heading left. The green is sloped from back to front.':
      'La rivière Seine longe tout le trou et de nombreux arbres bordent le côté droit. Deux fosses de sable attendent la plupart des balles qui se dirigent vers la surface de jeu, tandis que la rivière guette les coups égarés vers la gauche. Le vert est incliné de l’arrière vers l’avant.',
    'Before you play': 'Avant de jouer',
    'Good to know': 'Bon à savoir',
    'Dress code.': 'Code vestimentaire.',
    'Our dress code must be adhered to by members and guests.': 'Les membres et les invités doivent respecter notre code vestimentaire.',
    'Soft spikes only,': 'Crampons souples seulement,',
    'on the course and in the clubhouse.': 'sur le parcours et au pavillon.',
    'Check in at the golf shop': 'Présentez-vous à la boutique du pro',
    'fifteen minutes before your tee time.': 'quinze minutes avant votre heure de départ.',
    'Change of plans?': 'Changement de plans?',
    'Stay for a bite.': 'Restez pour une bouchée.',
    'The Gallery Taphouse & Grill overlooks the 18th hole, with six local beers on tap.': 'Le Gallery Taphouse & Grill surplombe le 18e trou et propose six bières locales en fût.',
    'Tee times': 'Heures de départ',
    'Booking steps': 'Étapes de la réservation',
    'Day and time': 'Jour et heure',
    'Players': 'Joueurs',
    'Payment': 'Paiement',
    'Booking is not open right now': 'Les réservations ne sont pas ouvertes pour le moment',
    'Choose a day': 'Choisissez un jour',
    'Closed': 'Fermé',
    'Members': 'Membres',
    'Play over': 'Jeu terminé',
    'Fully booked': 'Complet',
    'Holiday': 'Férié',
    'The course is closed today': 'Le parcours est fermé aujourd’hui',
    'The course is closed for play today.': 'Le parcours est fermé au jeu aujourd’hui.',
    'Member play only': 'Réservé aux membres',
    'There are no public tee times on this day.': 'Il n’y a aucune heure de départ publique ce jour-là.',
    'Play has finished for today': 'Le jeu est terminé pour aujourd’hui',
    'Every public tee time is taken': 'Toutes les heures de départ publiques sont prises',
    'The last public tee time has gone off. We would be delighted to see you another day.': 'Le dernier départ public est parti. Nous serions ravis de vous voir un autre jour.',
    'per golfer': 'par golfeur',
    'None open': 'Aucun de libre',
    'These times have passed.': 'Ces heures sont passées.',
    'Nothing open at this rate.': 'Rien de libre à ce tarif.',
    'Your booking': 'Votre réservation',
    'That tee time is no longer available': 'Cette heure de départ n’est plus disponible',
    'Joining a group': 'Vous joignez un groupe',
    'Your own tee time': 'Votre propre départ',
    'Change': 'Modifier',
    'One quick step': 'Une petite étape',
    'Create an account or sign in to book': 'Créez un compte ou connectez-vous pour réserver',
    'You already have a round close to this time on the same day.': 'Vous avez déjà une partie proche de cette heure le même jour.',
    'You are already booked at this time. You can manage it under My bookings.': 'Vous êtes déjà inscrit à cette heure. Vous pouvez gérer cette réservation sous Mes réservations.',
    'Someone may have just booked it. Please choose another time.': 'Quelqu’un vient peut-être de la réserver. Veuillez choisir une autre heure.',
    'Choose another time': 'Choisir une autre heure',
    'You are joining a group': 'Vous vous joignez à un groupe',
    'Who is playing': 'Qui joue',
    'Your group': 'Votre groupe',
    'No carts today. The course is walking only.': 'Aucune voiturette aujourd’hui. Le parcours se joue à pied seulement.',
    'Holes': 'Trous',
    'set by the group': 'fixé par le groupe',
    'Power cart': 'Voiturette',
    'Back': 'Retour',
    'Continue to payment': 'Continuer vers le paiement',
    'You, the account holder': 'Vous, titulaire du compte',
    'Guest full name': 'Nom complet de l’invité',
    'Guest, pays the green fee': 'Invité, paie le droit de jeu',
    'Walking': 'À pied',
    'Walk': 'À pied',
    'Cart': 'Voiturette',
    'Your transport': 'Votre transport',
    'Remove guest': 'Retirer l’invité',
    'Add a guest': 'Ajouter un invité',
    'Your group is complete with four players.': 'Votre groupe est complet avec quatre joueurs.',
    'That fills the places left at this time.': 'Cela comble les places restantes à cette heure.',
    'Total today': 'Total aujourd’hui',
    'Green fees include tax. You pay online by card when you book.': 'Les droits de jeu incluent les taxes. Vous payez en ligne par carte au moment de réserver.',
    'Please enter your guest’s first and last name.': 'Veuillez entrer le prénom et le nom de votre invité.',
    'Each golfer needs their own name.': 'Chaque golfeur doit avoir son propre nom.',
    'Please complete your guests’ names': 'Veuillez compléter le nom de vos invités',
    'That tee time has just changed. Please choose again': 'Cette heure de départ vient de changer. Veuillez choisir de nouveau',
    '(you)': '(vous)',
    'Pay by card': 'Payer par carte',
    'Secure': 'Sécurisé',
    'Pay with gift card': 'Payer avec la carte-cadeau',
    'By booking you agree to our dress code and the soft spikes rule. Questions? Call the golf shop at': 'En réservant, vous acceptez notre code vestimentaire et la règle des crampons souples. Des questions? Appelez la boutique du pro au',
    'Edit players': 'Modifier les joueurs',
    'Please check your card details': 'Veuillez vérifier les renseignements de votre carte',
    'Please choose a card': 'Veuillez choisir une carte',
    'Enter the 3-digit security code on the back of the card.': 'Entrez le code de sécurité à 3 chiffres au verso de la carte.',
    'Enter the 4-digit security code on the front of the card.': 'Entrez le code de sécurité à 4 chiffres au recto de la carte.',
    'Processing payment': 'Paiement en cours',
    'Your card was declined. Please try another card, or call your card issuer.': 'Votre carte a été refusée. Veuillez essayer une autre carte ou communiquer avec l’émetteur de votre carte.',
    'Your tee time is confirmed': 'Votre heure de départ est confirmée',
    'We look forward to welcoming you. Please check in at the golf shop fifteen minutes before your tee time, and remember our dress code and soft spikes.': 'Au plaisir de vous accueillir. Veuillez vous présenter à la boutique du pro quinze minutes avant votre heure de départ, et n’oubliez pas notre code vestimentaire et les crampons souples.',
    'Add to calendar': 'Ajouter au calendrier',
    'View receipt': 'Voir le reçu',
    'Book another tee time': 'Réserver un autre départ',

    /* ---------- Sign in / sign up, My bookings, My account (me.js) ---------- */
    'First name *': 'Prénom *',
    'Last name *': 'Nom de famille *',
    'Email *': 'Courriel *',
    'Phone *': 'Téléphone *',
    'Postal code *': 'Code postal *',
    'Show password': 'Afficher le mot de passe',
    'Hide password': 'Masquer le mot de passe',
    'Account': 'Compte',
    'Password *': 'Mot de passe *',
    'Confirm password *': 'Confirmer le mot de passe *',
    'At least 8 characters, with a letter and a number.': 'Au moins 8 caractères, dont une lettre et un chiffre.',
    'Send me St. Boniface news and golf offers by email': 'Envoyez-moi les nouvelles et les offres de golf de St. Boniface par courriel',
    'Create my account': 'Créer mon compte',
    'Already have an account?': 'Vous avez déjà un compte?',
    'Forgotten your password? Please call the golf shop at': 'Mot de passe oublié? Veuillez appeler la boutique du pro au',
    'and we will help you back in. New here?': 'et nous vous aiderons à vous reconnecter. Nouveau ici?',
    'Please type your password again.': 'Veuillez entrer votre mot de passe de nouveau.',
    'The passwords do not match.': 'Les mots de passe ne correspondent pas.',
    'Please check the highlighted fields': 'Veuillez vérifier les champs en surbrillance',
    'Enter your password.': 'Entrez votre mot de passe.',
    'That email and password do not match an account. Please try again, or create an account if you are new.': 'Ce courriel et ce mot de passe ne correspondent à aucun compte. Veuillez réessayer, ou créez un compte si vous êtes nouveau.',
    'Welcome back': 'Bon retour',
    'An account lets you book and pay for tee times online, keep your receipts and cancel when plans change.': 'Un compte vous permet de réserver et de payer vos heures de départ en ligne, de conserver vos reçus et d’annuler si vos plans changent.',
    'Sign in to book a tee time, see your bookings and manage your account.': 'Connectez-vous pour réserver un départ, consulter vos réservations et gérer votre compte.',
    'Are you a member?': 'Vous êtes membre?',
    'Cancelled, refunded': 'Annulée, remboursée',
    'Cancelled': 'Annulée',
    'Played': 'Jouée',
    'Missed': 'Manquée',
    'On course': 'Sur le parcours',
    'Checked in': 'Arrivée enregistrée',
    'Confirmed': 'Confirmée',
    'Cancel and refund': 'Annuler et rembourser',
    'Calendar': 'Calendrier',
    'Receipt': 'Reçu',
    'Refund receipt': 'Reçu de remboursement',
    'Upcoming': 'À venir',
    'No upcoming tee times': 'Aucune heure de départ à venir',
    'Past and cancelled': 'Passées et annulées',
    'Nothing here yet': 'Rien ici pour le moment',
    'Rounds you have played and bookings you have cancelled will be kept here with their receipts.': 'Les parties jouées et les réservations annulées seront conservées ici avec leurs reçus.',
    'This booking can no longer be cancelled online. Please call the golf shop': 'Cette réservation ne peut plus être annulée en ligne. Veuillez appeler la boutique du pro',
    'Cancel this tee time?': 'Annuler cette heure de départ?',
    'This booking has changed. Please call the golf shop': 'Cette réservation a changé. Veuillez appeler la boutique du pro',
    'Your tee time has been cancelled': 'Votre heure de départ a été annulée',
    'Keep for your records': 'À conserver pour vos dossiers',
    'Receipts': 'Reçus',
    'Refund': 'Remboursement',
    'Show fewer': 'Afficher moins',
    'No receipts yet': 'Aucun reçu pour le moment',
    'Receipts for tee times, refunds and beverage cart purchases are kept here.': 'Les reçus des heures de départ, des remboursements et des achats à la voiturette-bar sont conservés ici.',
    'Keep your details up to date so the golf shop can reach you about your tee times.': 'Gardez vos coordonnées à jour pour que la boutique du pro puisse vous joindre au sujet de vos heures de départ.',
    'Your details': 'Vos coordonnées',
    'Contact information': 'Coordonnées',
    'Save details': 'Enregistrer',
    'Expired': 'Expirée',
    'Remove': 'Retirer',
    'Security': 'Sécurité',
    'Change password': 'Changer le mot de passe',
    'Current password *': 'Mot de passe actuel *',
    'New password *': 'Nouveau mot de passe *',
    'Confirm new password *': 'Confirmer le nouveau mot de passe *',
    'Update password': 'Mettre à jour le mot de passe',
    'Bookings': 'Réservations',
    'Paid for tee times': 'Payé pour les heures de départ',
    'Your details have been saved': 'Vos coordonnées ont été enregistrées',
    'Enter your current password.': 'Entrez votre mot de passe actuel.',
    'That is not your current password.': 'Ce n’est pas votre mot de passe actuel.',
    'Choose a password you have not used here before.': 'Choisissez un mot de passe que vous n’avez jamais utilisé ici.',
    'Your password has been updated': 'Votre mot de passe a été mis à jour'
  };

  var P = [
    /* ---------- shell ---------- */
    [/^(.+) · St\. Boniface public golf$/, function (m, a) { return T(a) + ' · Golf public St. Boniface'; }],
    [/^Hello, (.+)$/, 'Bonjour, $1'],
    [/^Welcome, (.+)$/, 'Bienvenue, $1'],
    [/^Established (\d{4})$/, 'Fondé en $1'],
    [/^Call the golf shop, (.+)$/, 'Appeler la boutique du pro, $1'],
    [/^Please refresh\. If it keeps happening, call the golf shop at (.+)\.$/, 'Veuillez actualiser la page. Si le problème persiste, appelez la boutique du pro au $1.'],
    [/^Please call the golf shop at (.+)\.$/, 'Veuillez appeler la boutique du pro au $1.'],
    /* ---------- re-check before payment ---------- */
    [/^Public tee times open (\d+) days ahead\. Please choose another day\.$/, 'Les heures de départ publiques ouvrent $1 jours à l’avance. Veuillez choisir un autre jour.'],
    [/^(.+) has just been reserved for (.+)\.$/, function (m, t, r) { return t + ' vient d’être réservé (' + T(r) + ').'; }],
    [/^Someone booked (.+) a moment ago\. Please choose another time\.$/, 'Quelqu’un vient de réserver $1. Veuillez choisir une autre heure.'],
    [/^Another group just booked (.+)\. There (?:is 1 place|are (\d+) places) left to join\.$/, function (m, t, n) { return 'Un autre groupe vient de réserver ' + t + '. Il reste ' + (n ? n + ' places' : '1 place') + ' pour vous joindre au groupe.'; }],
    [/^Only (\d+) places? left at (.+) now\. Please remove a guest or choose another time\.$/, function (m, n, t) { return 'Il ne reste que ' + pl(n, 'place', 'places') + ' à ' + t + '. Veuillez retirer un invité ou choisir une autre heure.'; }],
    [/^You already have a round at (.+) that day\.$/, 'Vous avez déjà une partie à $1 ce jour-là.'],
    /* ---------- fee lines (also stored on payments and receipts) ---------- */
    [/^Green fee, (.+) \((\d+) holes\)$/, function (m, n, h) { return 'Droit de jeu, ' + T(n) + ' (' + h + ' trous)'; }],
    [/^Cart, (.+)$/, function (m, n) { return 'Voiturette, ' + T(n); }],
    [/^Guest (\d+)$/, 'Invité $1'],
    [/^Guest (\d+) full name$/, 'Nom complet de l’invité $1'],
    [/^Guest (\d+) transport$/, 'Transport de l’invité $1'],
    [/^Remove guest (\d+)$/, 'Retirer l’invité $1'],
    [/^Green fees, (.+) at (.+) \((\d+) golfers?, (\d+) holes\)$/, function (m, d, t, n, h) { return 'Droits de jeu, ' + F(d) + ' à ' + F(t) + ' (' + pl(n, 'golfeur', 'golfeurs') + ', ' + h + ' trous)'; }],
    /* ---------- receipts (site.js slip and Club.receipts titles/notes) ---------- */
    [/^Refunded (.+)$/, 'Remboursé le $1'],
    [/^Tee time, (.+)$/, function (m, d) { return 'Heure de départ, ' + F(d); }],
    [/^Tee time refund, (.+)$/, function (m, d) { return 'Remboursement d’heure de départ, ' + F(d); }],
    [/^Tee time refund$/, 'Remboursement d’heure de départ'],
    [/^Tee time (.+?)(?: at (.+?))?(?:, (\d+) holes)?\. Confirmation ([A-Z0-9]+)\.(?: (.+))?$/, function (m, d, t, h, c, x) { return 'Départ le ' + F(d) + (t ? ' à ' + F(t) : '') + (h ? ', ' + h + ' trous' : '') + '. Confirmation ' + c + '.' + (x ? ' ' + parts(x) : ''); }],
    [/^Confirmation ([A-Z0-9]+)\.$/, 'Confirmation $1.'],
    /* ---------- home ---------- */
    [/^Weekend and holiday mornings, 6:00 AM to 1:00 PM, are (.+) when you play with a member, so ask your member host to book\. Nine holes are 60% of the 18-hole fee\.$/,
      'Les matins de fin de semaine et de jours fériés, de 6 h à 13 h, le tarif est de $1 lorsque vous jouez avec un membre : demandez à votre hôte membre de réserver. Le 9 trous coûte 60 % du tarif de 18 trous.'],
    [/^([\d,]+) yds$/, '$1 vg'],
    [/^Cancel online up to (\d+) hours before your tee time for a full refund\. After that, please call the golf shop at$/, 'Annulez en ligne jusqu’à $1 heures avant votre heure de départ pour un remboursement complet. Passé ce délai, veuillez appeler la boutique du pro au'],
    /* ---------- booking, step 1 ---------- */
    [/^Public times for the next (\d+) days\. Each golfer pays the green fee\.$/, 'Les heures publiques des $1 prochains jours. Chaque golfeur paie le droit de jeu.'],
    [/^(\d+) times?$/, function (m, n) { return pl(n, 'départ', 'départs'); }],
    [/^(\d+) times? open$/, function (m, n) { return pl(n, 'départ libre', 'départs libres'); }],
    [/^(.+), (Closed|Members|Play over|Fully booked|\d+ times?)$/, function (m, d, l) { return d + ', ' + (/^\d/.test(l) ? pl(parseInt(l, 10), 'départ', 'départs') : T(l)); }],
    [/^New tee times open each morning\. (.+) opens for booking (tomorrow|soon)\.$/, function (m, d, w) { return 'De nouvelles heures de départ s’ouvrent chaque matin. Les réservations pour le ' + d + ' ouvriront ' + (w === 'tomorrow' ? 'demain' : 'bientôt') + '.'; }],
    [/^See (.+)$/, function (m, d) { var p = d.split(', '); return 'Voir ' + (DAYWORD[p[0]] || p[0]) + (p[1] ? ', ' + p.slice(1).join(', ') : ''); }],
    [/^(.+?), (-?\d+)°C(?: · (\d+)% rain)?$/, function (m, c, t, r) { return T(c) + ', ' + t + ' °C' + (r ? ' · ' + r + ' % de pluie' : ''); }],
    [/^(.+): weekend and holiday times and rates apply\.$/, function (m, h) { return T(h) + ' : les heures et les tarifs de fin de semaine et de jours fériés s’appliquent.'; }],
    [/^(.*?) ?Tee times from tomorrow are open for booking\.$/, function (m, msg) { return (msg ? T(msg) + ' ' : '') + 'Les heures de départ à partir de demain sont ouvertes aux réservations.'; }],
    [/^(.+?) ?Public tee times are Monday to Thursday 10:30 AM to 3:30 PM, weekdays after 5:30 PM, and weekends and holidays after 1:00 PM\.$/, function (m, r) { return T(r) + ' ' + T('Public tee times are Monday to Thursday 10:30 AM to 3:30 PM, weekdays after 5:30 PM, and weekends and holidays after 1:00 PM.'); }],
    [/^(.+) is fully booked\. You might like another day, or call the golf shop to ask about cancellations\.$/, 'Le $1 est complet. Essayez un autre jour, ou appelez la boutique du pro pour vous renseigner sur les annulations.'],
    [/^(Weekday|Twilight|Weekend & holiday) (\d.*\$|\$\d.*)$/, function (m, b, r) { return band(b) + ' ' + r; }],
    [/^(\d+) places? left$/, function (m, n) { return pl(n, 'place restante', 'places restantes'); }],
    [/^(\d+) places?$/, function (m, n) { return pl(n, 'place', 'places'); }],
    [/^(.+?), (Weekday|Twilight|Weekend & holiday) (.+?), (Your booking|\d+ places?(?: left)?)$/, function (m, t, b, r, s) {
      var n = parseInt(s, 10);
      return t + ', ' + band(b) + ' ' + r + ', ' + (s === 'Your booking' ? 'votre réservation' : /left/.test(s) ? pl(n, 'place restante', 'places restantes') : pl(n, 'place', 'places'));
    }],
    /* ---------- booking, step 2 ---------- */
    [/^(Weekday|Twilight|Weekend & holiday) (.+?) per golfer · (Joining a group|Your own tee time)$/, function (m, b, r, k) { return band(b) + ' ' + r + ' par golfeur · ' + T(k); }],
    [/^We will keep your (.+) choice while you do\. Your account lets you see, cancel and get receipts for your bookings\.$/, 'Nous gardons votre choix de $1 pendant ce temps. Votre compte vous permet de consulter et d’annuler vos réservations, et d’en obtenir les reçus.'],
    [/^(\d+) places? left at this time\. The group plays (\d+) holes\.$/, function (m, n, h) { return (+n <= 1 ? 'Il reste 1 place' : 'Il reste ' + n + ' places') + ' à cette heure. Le groupe joue ' + h + ' trous.'; }],
    [/^Carts are (.+) today\.$/, function (m, r) { return 'Voiturettes : ' + T(r.charAt(0).toUpperCase() + r.slice(1)).toLowerCase() + ' aujourd’hui.'; }],
    [/^(\d+) holes$/, '$1 trous'],
    [/^(.+) per rider$/, '$1 par passager'],
    [/^(\d+) of (\d+) places left$/, function (m, a, b) { return a + ' sur ' + b + ' ' + (+b <= 1 ? 'place restante' : 'places restantes'); }],
    [/^(\d+) of (\d+) players$/, '$1 sur $2 joueurs'],
    [/^Up to (\d+) more golfers?$/, function (m, n) { return 'Jusqu’à ' + pl(n, 'golfeur', 'golfeurs') + ' de plus'; }],
    /* ---------- booking, step 3 and confirmation ---------- */
    [/^(\d+) holes · joining a group$/, '$1 trous · avec un groupe'],
    [/^Green fees include tax\. Cancel online up to (\d+) hours before your tee time for a full refund\.$/, 'Les droits de jeu incluent les taxes. Annulez en ligne jusqu’à $1 heures avant votre heure de départ pour un remboursement complet.'],
    [/^Expires (\d\d\/\d\d)$/, 'Expire le $1'],
    [/^(.*) · Expires (\d\d\/\d\d)$/, '$1 · Expire le $2'],
    [/^Pay (.+)$/, 'Payer $1'],
    [/^We could not complete your booking\. You have not been charged\. Please call the golf shop at (.+)\.$/, 'Nous n’avons pas pu terminer votre réservation. Aucun montant n’a été porté à votre carte. Veuillez appeler la boutique du pro au $1.'],
    [/^You have joined the (.+) group$/, 'Vous vous êtes joint au groupe de $1'],
    [/^(\d+) holes · first tee$/, '$1 trous · premier tertre'],
    [/^Playing with (\d+) other golfers?$/, function (m, n) { return 'Vous jouez avec ' + pl(n, 'autre golfeur', 'autres golfeurs'); }],
    [/^(.+) paid with (.+)$/, function (m, a, c) { return a + ' payé avec ' + T(c); }],
    /* ---------- me.js ---------- */
    [/^Welcome to St\. Boniface, (.+)\. Your account is ready$/, 'Bienvenue à St. Boniface, $1. Votre compte est prêt'],
    [/^(.+) · (\d+) holes · (\d+) golfers?(?: · with (\d+) other golfers?)?$/, function (m, d, h, n, o) {
      return T(d) + ' · ' + h + ' trous · ' + pl(n, 'golfeur', 'golfeurs') + (o ? ' · avec ' + pl(o, 'autre golfeur', 'autres golfeurs') : '');
    }],
    [/^(.+?) · (.+?)(?: · refunded (.+))?$/, function (m, a, c, r) {
      if (!/ ending \d{4}$|^Gift card|^Carte/.test(c)) return null;
      return a + ' · ' + T(c) + (r ? ' · remboursé le ' + r : '');
    }],
    [/^Within (\d+) hours of your tee time\. To make changes, please call the golf shop at$/, 'Moins de $1 heures avant votre départ. Pour faire des changements, veuillez appeler la boutique du pro au'],
    [/^Your tee times at St\. Boniface\. Cancel online up to (\d+) hours before you play for a full refund to your card\.$/, 'Vos heures de départ à St. Boniface. Annulez en ligne jusqu’à $1 heures avant de jouer pour un remboursement complet sur votre carte.'],
    [/^The first tee is waiting\. Public tee times open (\d+) days in advance\.$/, 'Le premier tertre vous attend. Les heures de départ publiques ouvrent $1 jours à l’avance.'],
    [/^Your (.+) tee time on (.+) for (\d+) golfers? will be released(?:, and (.+) will be refunded to your (.+)\.|\.)$/, function (m, t, d, n, a, c) {
      return 'Votre départ de ' + t + ' le ' + d + ' pour ' + pl(n, 'golfeur', 'golfeurs') + ' sera libéré' + (a ? ', et ' + a + ' sera remboursé sur votre ' + T(c) + '.' : '.');
    }],
    [/^Cancelled\. (.+) is on its way back to your (.+)$/, function (m, a, c) { return 'Annulé. ' + a + ' sera remboursé sur votre ' + T(c); }],
    [/^Open (credit|receipt) (.+?), (.+)$/, function (m, k, no, t) { return 'Ouvrir ' + (k === 'credit' ? 'le crédit ' : 'le reçu ') + no + ', ' + T(t); }],
    [/^Show all (\d+) receipts$/, 'Afficher les $1 reçus'],
    [/^Public golfer since (.+)$/, 'Golfeur public depuis le $1'],
    [/^Remove (.+ ending \d{4})$/, function (m, c) { return 'Retirer ' + T(c); }],
  ];
  S['Public tee times are Monday to Thursday 10:30 AM to 3:30 PM, weekdays after 5:30 PM, and weekends and holidays after 1:00 PM.'] =
    'Les heures de départ publiques sont du lundi au jeudi de 10 h 30 à 15 h 30, en semaine après 17 h 30, et les fins de semaine et jours fériés après 13 h.';

  /* ---------- Become a member (join.js) ---------- */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function ord(n) { return +n === 1 ? '1er' : n + 'e'; }
  Object.assign(S, {
    'Unlimited golf, 7 days a week': 'Golf illimité, 7 jours sur 7',
    '10% senior discount, ages 60 and over': 'Rabais aîné de 10 %, 60 ans et plus',
    '25% intermediate discount, ages 24 to 39': 'Rabais intermédiaire de 25 %, 24 à 39 ans',
    'Club storage and a private locker': 'Rangement des bâtons et casier privé',
    'Weekdays before 7:30 AM, 10:30 AM to 4 PM and after 5:30 PM': 'En semaine avant 7 h 30, de 10 h 30 à 16 h et après 17 h 30',
    'Weekends after 10:30 AM': 'Fins de semaine après 10 h 30',
    'Weekdays 10:30 AM to 4 PM and after 5:30 PM': 'En semaine de 10 h 30 à 16 h et après 17 h 30',
    'Weekends after 11 AM': 'Fins de semaine après 11 h',
    'A member': 'Un membre',
    'Played here as a guest': 'J’ai joué ici comme invité',
    'Played here as a public golfer': 'J’ai joué ici comme golfeur public',
    'Friends or family': 'Amis ou famille',
    'Social media': 'Médias sociaux',
    'Online search': 'Recherche en ligne',
    /* "How did you hear about us?" (Club.membership.HEARD_FROM): only the option text is translated, values stay English */
    'A member of the club': 'Un membre du club',
    'Friend or family': 'Amis ou famille',
    'Search engine': 'Moteur de recherche',
    'Wedding or event at the club': 'Mariage ou événement au club',
    /* Marketing email opt-in: sign up and My account (me.js) */
    'Email me club news and offers. You can stop anytime.': 'Envoyez-moi par courriel les nouvelles et les offres du club. Vous pouvez vous désabonner en tout temps.',
    'Email preferences': 'Préférences de courriel',
    'Club news and offers': 'Nouvelles et offres du club',
    'You are not getting club news and offers by email.': 'Vous ne recevez pas les nouvelles et les offres du club par courriel.',
    'You are subscribed.': 'Vous êtes abonné.',
    'You will get club news and offers by email': 'Vous recevrez les nouvelles et les offres du club par courriel',
    'You will no longer get club news and offers by email': 'Vous ne recevrez plus les nouvelles et les offres du club par courriel',
    'Other': 'Autre',
    'Annual dues': 'Cotisation annuelle',
    'a year': 'par année',
    'New-member offer': 'Offre aux nouveaux membres',
    'Your first year': 'Votre première année',
    'Share waived': 'Part sociale exonérée',
    'The $100 share, waived in your first year': 'La part sociale de 100 $, exonérée la première année',
    'Initiation fee waived': 'Droit d’entrée exonéré',
    'The $250 initiation fee plus GST, waived in your first year': 'Le droit d’entrée de 250 $ plus TPS, exonéré la première année',
    '50% joining bonus': 'Prime d’adhésion de 50 %',
    'A one-time bonus of 50% off your annual dues, issued as club account credit': 'Une prime unique correspondant à 50 % de votre cotisation annuelle, versée en crédit à votre compte du club',
    'Use 25% in your first season on club purchases. The other 25% is applied in year two toward the share and initiation fee, if applicable, and any credit left over goes toward later years’ dues. For first-time members.':
      'Utilisez 25 % pendant votre première saison pour vos achats au club. Les autres 25 % sont appliqués la deuxième année à la part sociale et au droit d’entrée, s’il y a lieu, et tout crédit restant est appliqué aux cotisations des années suivantes. Pour une première adhésion.',
    'Full': 'Complète',
    'Open': 'Ouverte',
    'This category is full. Join the waiting list and the club office will contact you when a place opens.': 'Cette catégorie est complète. Inscrivez-vous sur la liste d’attente et le bureau du club communiquera avec vous lorsqu’une place se libérera.',
    'Apply now': 'Faire une demande',
    'Join the waitlist': 'S’inscrire sur la liste d’attente',
    'Membership at St. Boniface': 'Adhésion à St. Boniface',
    'Become a member': 'Devenir membre',
    'The private club experience without the private club price': 'L’expérience d’un club privé, sans le prix d’un club privé',
    'See the categories': 'Voir les catégories',
    'Call the office': 'Appeler le bureau',
    'Membership categories': 'Catégories de membres',
    'Annual dues are shown as listed in the club’s system and are a guide only. The club office confirms your dues when it reviews your application. Time payment options are available to spread your yearly dues from your sign-up date until August.':
      'Les cotisations annuelles sont présentées telles qu’elles figurent dans le système du club, à titre indicatif seulement. Le bureau du club confirme votre cotisation lorsqu’il examine votre demande. Des options de paiement échelonné permettent de répartir votre cotisation annuelle de la date de votre inscription jusqu’en août.',
    'How to join': 'Comment devenir membre',
    'Choose a category and apply online.': 'Choisissez une catégorie et faites votre demande en ligne.',
    'It takes a few minutes. If a category is full, you can join its waiting list.': 'Cela prend quelques minutes. Si une catégorie est complète, vous pouvez vous inscrire sur sa liste d’attente.',
    'The club office reviews your application': 'Le bureau du club examine votre demande',
    'and contacts you by email or phone.': 'et communique avec vous par courriel ou par téléphone.',
    'Nothing is paid online.': 'Rien n’est payé en ligne.',
    'The office arranges your dues with you, including time payment until August.': 'Le bureau convient avec vous de votre cotisation, y compris le paiement échelonné jusqu’en août.',
    'Questions about membership? Call the club office at': 'Des questions sur l’adhésion? Appelez le bureau du club au',
    'Full, waiting list': 'Complet, liste d’attente',
    'Membership category *': 'Catégorie de membre *',
    'Date of birth *': 'Date de naissance *',
    'Settings': 'Paramètres',
    'Language': 'Langue',
    'Choose English or French for this site.': 'Choisissez l’anglais ou le français pour ce site.',
    'Which hand do you play? *': 'De quelle main jouez-vous? *',
    'Right-handed': 'Droitier',
    'Left-handed': 'Gaucher',
    'Your friends at the club and the golf shop can see this.': 'Vos amis au club et la boutique du pro peuvent voir ce renseignement.',
    'Choose right-handed or left-handed.': 'Choisissez droitier ou gaucher.',
    'Day': 'Jour',
    'Month': 'Mois',
    'Year': 'Année',
    'Day of birth': 'Jour de naissance',
    'Month of birth': 'Mois de naissance',
    'Year of birth': 'Année de naissance',
    'Junior is for golfers under 18 and Young Adult for ages 19 to 23, so we ask for your date of birth.': 'La catégorie Junior s’adresse aux golfeurs de moins de 18 ans et la catégorie Young Adult, aux 19 à 23 ans : c’est pourquoi nous vous demandons votre date de naissance.',
    'About your golf': 'Votre golf',
    'Optional': 'Facultatif',
    'Handicap index': 'Indice de handicap',
    'For example 14.2': 'Par exemple 14.2',
    'Leave blank if you do not have one. Write a plus handicap as +1.4.': 'Laissez vide si vous n’en avez pas. Inscrivez un handicap plus sous la forme +1.4.',
    'How did you hear about us?': 'Comment avez-vous entendu parler de nous?',
    'Choose one': 'Choisissez',
    'Members who know you': 'Membres qui vous connaissent',
    'For example Jane Smith, Raj Patel': 'Par exemple Jane Smith, Raj Patel',
    'If members could propose or second your application, add their names.': 'Si des membres peuvent proposer ou appuyer votre demande, ajoutez leurs noms.',
    'Anything else the office should know?': 'Autre chose que le bureau devrait savoir?',
    'For example, when you would like to start or any questions': 'Par exemple, quand vous aimeriez commencer, ou vos questions',
    'I confirm these details are correct. The club may contact me about my application and keep these details for membership purposes. *': 'Je confirme que ces renseignements sont exacts. Le club peut communiquer avec moi au sujet de ma demande et conserver ces renseignements aux fins de l’adhésion. *',
    'Send my application': 'Envoyer ma demande',
    'No payment is taken online. The club office arranges dues with you.': 'Aucun paiement n’est perçu en ligne. Le bureau du club convient avec vous de votre cotisation.',
    'First year': 'Première année',
    '$100 share waived': 'Part sociale de 100 $ exonérée',
    '$250 initiation fee plus GST waived': 'Droit d’entrée de 250 $ plus TPS exonéré',
    '50% of annual dues as club account credit': '50 % de la cotisation annuelle en crédit au compte du club',
    'For first-time members.': 'Pour une première adhésion.',
    'See how the credit works': 'Voir comment fonctionne le crédit',
    'Questions': 'Questions',
    'Call the club office': 'Appeler le bureau du club',
    'Membership': 'Adhésion',
    'Apply for membership': 'Demande d’adhésion',
    'Tell us a little about yourself. The club office reviews every application and will be in touch.': 'Parlez-nous un peu de vous. Le bureau du club examine chaque demande et communiquera avec vous.',
    'Your application joins the waiting list and the club office will contact you when a place opens.': 'Votre demande est ajoutée à la liste d’attente et le bureau du club communiquera avec vous lorsqu’une place se libérera.',
    'Join the waiting list': 'S’inscrire sur la liste d’attente',
    'Ages 19 to 23': '19 à 23 ans',
    'Under 18': 'Moins de 18 ans',
    'Choose a membership category.': 'Choisissez une catégorie de membre.',
    'Enter a phone number so the office can reach you.': 'Entrez un numéro de téléphone pour que le bureau puisse vous joindre.',
    'Enter your date of birth.': 'Entrez votre date de naissance.',
    'Enter the day, from 1 to 31.': 'Entrez le jour, de 1 à 31.',
    'Choose the month.': 'Choisissez le mois.',
    'Enter the year with four digits, for example 1990.': 'Entrez l’année en quatre chiffres, par exemple 1990.',
    'Your date of birth must be in the past.': 'Votre date de naissance doit être dans le passé.',
    'Please check the year.': 'Veuillez vérifier l’année.',
    'Use a number such as 14.2, or +1.4 for a plus handicap.': 'Utilisez un nombre comme 14.2, ou +1.4 pour un handicap plus.',
    'A handicap index is between +10.0 and 54.0.': 'Un indice de handicap se situe entre +10,0 et 54,0.',
    'Please tick to confirm so the club can process your application.': 'Veuillez cocher la case pour confirmer, afin que le club puisse traiter votre demande.',
    'You are on the waiting list': 'Vous êtes sur la liste d’attente',
    'Application received': 'Demande reçue',
    'What happens next': 'Prochaines étapes',
    'No payment has been taken. The office arranges your dues with you, and time payment options can spread your yearly dues from your sign-up date until August.': 'Aucun paiement n’a été perçu. Le bureau convient avec vous de votre cotisation, et des options de paiement échelonné peuvent répartir votre cotisation annuelle de la date de votre inscription jusqu’en août.',
    'If this is your first time as a member, your share and initiation fee are waived in your first year and you receive the 50% joining bonus as club account credit.': 'S’il s’agit de votre première adhésion, votre part sociale et votre droit d’entrée sont exonérés la première année, et vous recevez la prime d’adhésion de 50 % en crédit au compte du club.',
    'Questions? Call the club office at': 'Des questions? Appelez le bureau du club au',
    'Back to membership': 'Retour à l’adhésion',

    /* ---------- Gift cards (gifts.js) ---------- */
    'Already have one?': 'Vous en avez déjà une?',
    'Check a balance': 'Vérifier un solde',
    'Gift card code': 'Code de la carte-cadeau',
    'Check': 'Vérifier',
    'Not valid': 'Non valide',
    'This gift card has been voided. Please call the golf shop at': 'Cette carte-cadeau a été annulée. Veuillez appeler la boutique du pro au',
    'This gift card has been fully used.': 'Cette carte-cadeau a été entièrement utilisée.',
    'Returned to the card': 'Remis sur la carte',
    'Voided': 'Annulée',
    'Used': 'Utilisée',
    'Void': 'Annulée',
    'left': 'restant',
    'Enter the gift card code.': 'Entrez le code de la carte-cadeau.',
    'Gift card codes have 12 letters and numbers.': 'Les codes de carte-cadeau comptent 12 lettres et chiffres.',
    'We could not find that gift card. Check the code and try again.': 'Nous n’avons pas trouvé cette carte-cadeau. Vérifiez le code et réessayez.',
    'Gift cards': 'Cartes-cadeaux',
    'Your recipient': 'Votre destinataire',
    'your recipient': 'votre destinataire',
    'Amount': 'Montant',
    'Other amount': 'Autre montant',
    'Amount in dollars *': 'Montant en dollars *',
    'Give a round at St. Boniface': 'Offrez une partie à St. Boniface',
    'A gift card for green fees, the pro shop and the Gallery Taphouse & Grill. Choose an amount, add a note, and print it or save it to send.': 'Une carte-cadeau pour les droits de jeu, la boutique du pro et le Gallery Taphouse & Grill. Choisissez un montant, ajoutez un mot, puis imprimez-la ou enregistrez-la pour l’envoyer.',
    'Who is it for?': 'À qui est-elle destinée?',
    'Recipient’s name *': 'Nom du destinataire *',
    'Recipient’s email *': 'Courriel du destinataire *',
    'Kept with the card. This demonstration does not send email.': 'Conservé avec la carte. Cette démonstration n’envoie pas de courriel.',
    'Message': 'Message',
    '(optional)': '(facultatif)',
    'Happy holidays. See you on the first tee.': 'Joyeuses Fêtes. Au plaisir de vous voir au premier tertre.',
    'Signed from *': 'De la part de *',
    'Your name': 'Votre nom',
    'For your receipt.': 'Pour votre reçu.',
    'Gift cards can be used for green fees at the golf shop, at the pro shop and at the Gallery Taphouse & Grill, and online when you pay for a tee time. Questions? Call the golf shop at':
      'Les cartes-cadeaux sont acceptées pour les droits de jeu et les achats à la boutique du pro, au Gallery Taphouse & Grill, et en ligne lorsque vous payez une heure de départ. Des questions? Appelez la boutique du pro au',
    'Preview': 'Aperçu',
    'Thank you': 'Merci',
    'Your gift card is ready': 'Votre carte-cadeau est prête',
    'For': 'Pour',
    'Code': 'Code',
    'Print or save the gift card': 'Imprimer ou enregistrer la carte-cadeau',
    'Buy another gift card': 'Acheter une autre carte-cadeau',
    'Buy gift card': 'Acheter la carte-cadeau',
    'Enter the recipient’s name.': 'Entrez le nom du destinataire.',
    'Enter the recipient’s email.': 'Entrez le courriel du destinataire.',
    'Enter the name to sign the card with.': 'Entrez le nom à inscrire sur la carte.',
    'Enter your email for the receipt.': 'Entrez votre courriel pour le reçu.',
    'Gifts you sent': 'Cadeaux offerts',
    'No gift cards yet': 'Aucune carte-cadeau pour le moment',
    'Gift cards you buy for green fees, the pro shop or the Gallery are kept here.': 'Les cartes-cadeaux que vous achetez pour les droits de jeu, la boutique du pro ou le Gallery sont conservées ici.',
    'Buy a gift card': 'Acheter une carte-cadeau',

    /* ---------- Takeout (takeout.js) ---------- */
    'Your order': 'Votre commande',
    'View order': 'Voir la commande',
    'Takeout': 'Pour emporter',
    'Order from the Gallery menu and pick up at the clubhouse. Our Friday Night Pizza is for pickup on Fridays.': 'Commandez au menu du Gallery et récupérez votre commande au pavillon. Notre Friday Night Pizza se récupère le vendredi.',
    'Your orders': 'Vos commandes',
    'All orders': 'Toutes les commandes',
    'Takeout orders': 'Commandes pour emporter',
    'No takeout orders yet': 'Aucune commande pour emporter pour le moment',
    'Order from the Gallery menu and pick up at the clubhouse.': 'Commandez au menu du Gallery et récupérez votre commande au pavillon.',
    'Order takeout': 'Commander pour emporter',

    /* ---------- Rate your visits (feedback.js) ---------- */
    'How did it go?': 'Comment ça s’est passé?',
    'Rate your visits': 'Évaluez vos visites',
    'No rounds to rate': 'Aucune partie à évaluer',

    /* ---------- Order to the course (cart.js, public kit) ---------- */
    'Continue': 'Continuer',
    'Choose hole': 'Choisir le trou',
    'Which hole are you on now?': 'À quel trou êtes-vous maintenant?',
    'Hole': 'Trou',
    'Tell the cart': 'Prévenir la voiturette-bar',

    /* ---------- Waitlist (waitlist.js) ---------- */
    'Notify me if a spot opens': 'M’aviser si une place se libère',
    'It is open to everyone, so book soon.': 'Elle est maintenant offerte à tous : réservez vite.',
    'A spot has opened': 'Une place s’est libérée',
    'Book this time': 'Réserver cette heure',
    'No thanks': 'Non merci',
    'Next in line': 'Prochain sur la liste',
    'Leave': 'Quitter',
    'Waitlist': 'Liste d’attente',
    'We tell the first golfer in line as soon as a spot opens. The notice shows here and on My account.': 'Nous avisons le premier golfeur de la liste dès qu’une place se libère. L’avis s’affiche ici et dans Mon compte.',
    'Time of day': 'Moment de la journée',
    'Golfers': 'Golfeurs',
    'Notify me': 'M’aviser',
    'You are on the waitlist': 'Vous êtes sur la liste d’attente',
    'You are next in line.': 'Vous êtes le prochain sur la liste.',
    'Done': 'Terminé'
  });
  var DATE_FR = '((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) [^,]+?)';
  P = P.concat([
    /* Marketing email opt-in, My account (me.js) */
    [/^Subscribed since (.+)\.$/, 'Abonné depuis le $1.'],
    /* join.js */
    [/^Book tee times (\d+) days in advance$/, 'Réservation des départs $1 jours à l’avance'],
    [/^(.+)\. Choose the category that suits how you play and apply online\. The club office reviews every application and will be in touch\.$/, function (m, t) { return T(t) + '. Choisissez la catégorie qui convient à votre façon de jouer et faites votre demande en ligne. Le bureau du club examine chaque demande et communiquera avec vous.'; }],
    [/^(.+) a year$/, '$1 par année'],
    [/^(.+) is full\.$/, 'La catégorie $1 est complète.'],
    [/^Your application joins the waiting list and the club office will contact you when a place opens\. (.+)\.$/, function (m, a) { return T('Your application joins the waiting list and the club office will contact you when a place opens.') + ' ' + T(a) + '.'; }],
    [/^, (.+) a year as listed\.(?: (.+?)\.)? The club office confirms your dues\.$/, function (m, d, a) { return ', ' + d + ' par année selon la liste.' + (a ? ' ' + T(a) + '.' : '') + ' Le bureau du club confirme votre cotisation.'; }],
    [/^The club already has an application from this email address\. To change it, please call the office at (.+)\.$/, 'Le club a déjà reçu une demande de cette adresse courriel. Pour la modifier, veuillez appeler le bureau au $1.'],
    [new RegExp('^(' + MONTHS.join('|') + ') does not have (\\d+) days\\.$'), function (m, mo, d) { var f = MOIS[MONTHS.indexOf(mo)]; return 'Le mois ' + (/^[aeiou]/.test(f) ? 'd’' : 'de ') + f + ' n’a pas ' + d + ' jours.'; }],
    [/^(.+) membership is for (?:ages (\d+) to (\d+)|ages (\d+) and over|golfers under (\d+))\. You are (\d+), so please choose another category\.$/, function (m, t, a, b, o, u, age) {
      return 'La catégorie ' + t + ' s’adresse ' + (a ? 'aux ' + a + ' à ' + b + ' ans' : o ? 'aux ' + o + ' ans et plus' : 'aux golfeurs de moins de ' + u + ' ans') + '. Vous avez ' + age + ' ans : veuillez choisir une autre catégorie.';
    }],
    [/^Thank you, (.+)$/, 'Merci, $1'],
    [/^Your application for (.+) membership is on the waiting list\.$/, 'Votre demande d’adhésion à la catégorie $1 est sur la liste d’attente.'],
    [/^Your application for (.+) membership has reached the club office\.$/, 'Votre demande d’adhésion à la catégorie $1 a été reçue par le bureau du club.'],
    [/^Your place on the (.+) waiting list$/, 'Votre rang sur la liste d’attente $1'],
    [/^(The club office contacts people on the waiting list when a place opens in (.+)\.|The club office reviews applications and will contact you\.) We will use (.+) or (.+)\.$/, function (m, a, t, e, p) {
      return (t ? 'Le bureau du club communique avec les personnes inscrites sur la liste d’attente lorsqu’une place se libère dans la catégorie ' + t + '.' : 'Le bureau du club examine les demandes et communiquera avec vous.') + ' Nous utiliserons ' + e + ' ou ' + p + '.';
    }],
    /* gifts.js */
    [/^Available of (.+)\. Use it for green fees, at the pro shop or at the Gallery Taphouse & Grill\.$/, 'Disponible sur $1. Utilisez-la pour les droits de jeu, à la boutique du pro ou au Gallery Taphouse & Grill.'],
    [/^(.+?) · (Returned to the card|Voided|Used)$/, function (m, d, w) { return d + ' · ' + T(w); }],
    [/^(\d+) to (\d+)$/, '$1 à $2'],
    [/^Any whole amount from (.+) to (.+)\.$/, 'Tout montant entier de $1 à $2.'],
    [/^Choose a whole amount from (.+) to (.+)\.$/, 'Choisissez un montant entier de $1 à $2.'],
    [/^Step (\d+)$/, 'Étape $1'],
    [/^(-?\d+) characters left$/, function (m, n) { return n + ' ' + (Math.abs(+n) <= 1 ? 'caractère restant' : 'caractères restants'); }],
    [/^Print it or save it as a PDF to give to (.+)\. The code works at the golf shop, the Gallery and online\.$/, function (m, n) { return 'Imprimez-la ou enregistrez-la en PDF pour l’offrir à ' + T(n) + '. Le code est accepté à la boutique du pro, au Gallery et en ligne.'; }],
    [/^Buy gift card · (.+)$/, 'Acheter la carte-cadeau · $1'],
    [/^We could not complete your purchase\. You have not been charged\. Please call the golf shop at (.+)\.$/, 'Nous n’avons pas pu terminer votre achat. Aucun montant n’a été porté à votre carte. Veuillez appeler la boutique du pro au $1.'],
    [/^(\$[\d,.]+|[\d\s  ,]+\s?\$) for (.+)$/, '$1 pour $2'],
    /* feedback.js */
    [/^One tap is enough, and a comment is up to you\. Rounds from the last (\d+) days are here, and you can change a rating until then\.$/, 'Un seul toucher suffit, et le commentaire est facultatif. Vos parties des $1 derniers jours sont ici, et vous pouvez modifier une évaluation d’ici là.'],
    [/^After you play, your round shows here for (\d+) days so you can tell us how it went\.$/, 'Après votre partie, elle s’affiche ici pendant $1 jours pour que vous puissiez nous dire comment ça s’est passé.'],
    /* waitlist.js */
    [/^You are the first to know until (.+)\.$/, 'Vous êtes le premier avisé jusqu’à $1.'],
    [new RegExp('^' + DATE_FR + ' at (.+)$'), '$1 à $2'],
    [/^(\d+) golfers? from your waitlist\. (.+)$/, function (m, n, h) { return pl(n, 'golfeur', 'golfeurs') + ' de votre liste d’attente. ' + T(h); }],
    [/^(\d+) golfers? ·(?: (Next in line|(\d+)(?:st|nd|rd|th) in line))?$/, function (m, n, l, o) { return pl(n, 'golfeur', 'golfeurs') + ' ·' + (l ? ' ' + (o ? ord(o) + ' sur la liste' : 'Prochain sur la liste') : ''); }],
    [/^Spot open at (.+)$/, 'Place libre à $1'],
    [/^Leave the waitlist for (.+)$/, 'Quitter la liste d’attente pour le $1'],
    [/^(.+) is fully booked\. Sign in or create an account so we can tell you when a spot opens\.$/, 'Le $1 est complet. Connectez-vous ou créez un compte pour que nous puissions vous aviser lorsqu’une place se libère.'],
    [/^(.+) is fully booked\. We will show a notice on My bookings and My account as soon as a spot opens\.$/, 'Le $1 est complet. Un avis s’affichera dans Mes réservations et Mon compte dès qu’une place se libérera.'],
    [/^The first golfer on the list hears first and has (\d+) minutes before the next golfer is told\. Each golfer pays the green fee when you book\.$/, 'Le premier golfeur de la liste est avisé en premier et dispose de $1 minutes avant que le suivant soit avisé. Chaque golfeur paie le droit de jeu au moment de la réservation.'],
    [/^Book (\d.+)$/, 'Réserver $1'],
    [/^You are (\d+)(?:st|nd|rd|th) in line\.$/, function (m, n) { return 'Vous êtes ' + ord(n) + ' sur la liste.'; }],
    [new RegExp('^' + DATE_FR + ', (.+), (\\d+) golfers?\\. (You are next in line\\.|You are (\\d+)(?:st|nd|rd|th) in line\\.)$'), function (m, d, w, n, y, o) {
      return d + ', ' + T(w) + ', ' + pl(n, 'golfeur', 'golfeurs') + '. ' + (o ? 'Vous êtes ' + ord(o) + ' sur la liste.' : 'Vous êtes le prochain sur la liste.');
    }],
    [/^You are on the waitlist for (.+)$/, 'Vous êtes sur la liste d’attente pour le $1'],
    [/^You have left the waitlist for (.+)$/, 'Vous avez quitté la liste d’attente pour le $1']
  ]);


  /* ---------- Booking rules (Nov 20): the club's 2025 Membership Handbook. Fridays are for members (Club.teeRules
     publicSlot reasons), and the membership categories added from the handbook on Become a member (join.js). ---------- */
  Object.assign(S, {
    'Fridays are for members all day. Public golfers can play on a Friday only as a member’s guest.': 'Le vendredi est réservé aux membres toute la journée. Les golfeurs publics ne peuvent jouer le vendredi qu’à titre d’invités d’un membre.',
    'Public tee times are Monday to Thursday 10:30 AM to 3:30 PM and after 5:30 PM, and weekends and holidays after 1:00 PM. Fridays are for members.': 'Les heures de départ publiques sont du lundi au jeudi de 10 h 30 à 15 h 30 et après 17 h 30, et les fins de semaine et jours fériés après 13 h. Le vendredi est réservé aux membres.',
    'Friday': 'Vendredi',
    'No tee time restrictions': 'Aucune restriction d’heure de départ',
    'Weekends and holidays after 10:30 AM': 'Fins de semaine et jours fériés après 10 h 30',
    'Weekends and holidays after 11 AM': 'Fins de semaine et jours fériés après 11 h',
    'Must meet MGA requirements': 'Doit satisfaire aux exigences de la MGA',
    '5 golf vouchers included': '5 bons de golf inclus',
    'Member at the Opening Mixer in April and the Closing Social in October': 'Participation à titre de membre à la soirée d’ouverture en avril et à la soirée de clôture en octobre',
    '10% member discount in the Gallery and Pro Shop': 'Rabais de membre de 10 % au Gallery et à la boutique du pro',
    'Keeps your membership status': 'Conserve votre statut de membre',
    'No golf': 'Golf non inclus',
    'Price to be set by the club': 'Prix à confirmer par le club',
    'Ages 60 and over, ID required': '60 ans et plus, pièce d’identité requise',
    'Ages 19 to 39, ID required': '19 à 39 ans, pièce d’identité requise',
    '18 and under by August 31': '18 ans ou moins au 31 août'
  });
  P = P.concat([
    [/^, price to be set by the club\.(?: (.+?)\.)? The club office confirms your dues\.$/, function (m, a) { return ', prix à confirmer par le club.' + (a ? ' ' + T(a) + '.' : '') + ' Le bureau du club confirme votre cotisation.'; }]
  ]);

  /* Last: text joined with " · " (payment lines, receipt rows, cart banners) when every part translates on its own or
     is neutral (money, times, codes, French dates). Anything else is left for later dictionaries. */
  var FR_WORD = /[àâçéèêëîïôûùüÿœ’]|\b(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|lun|mar|mer|jeu|ven|sam|dim)\b/i;
  P.push([/^.+ · .+$/, function (m) {
    var parts = m[0].split(' · '), changed = false;
    for (var i = 0; i < parts.length; i++) {
      var x = parts[i], y = T(x);
      if (y !== x) { parts[i] = y; changed = true; continue; }
      if (!/[A-Za-z]{2,}/.test(x.replace(/\b(ml|oz|cl|lb|h|min)\b/g, '')) || /^[A-Z]{1,2}-?\d+$/.test(x) || FR_WORD.test(x)) continue;
      return null;
    }
    return changed ? parts.join(' · ') : null;
  }]);

  Object.keys(S).forEach(function (k) { S[k] = nb(S[k]); });
  P = P.map(function (p) {
    var r = p[1];
    return [p[0], typeof r === 'function' ? function () { var o = r.apply(null, arguments); return o == null ? arguments[0] : nb(o); } : nb(r)];
  });
  var dict = { strings: S, patterns: P };
  /* Public site only: this file is also loaded by member.html, where its wording and broad patterns (Pay ..., the
     " · " fallback) half-translated portal text before fr-portal.js could. Shared strings live in fr-shared.js. */
  var portal = document.body ? document.body.classList.contains('portal') : /member\.html/.test(location.pathname);
  if (portal) return;
  if (window.Club && Club.i18n && typeof Club.i18n.add === 'function') Club.i18n.add(dict);
  else window.__i18nQueue = (window.__i18nQueue || []).concat([dict]);
})();

/* ==========================================================================
   Handbook: the public site's Good to know (js/public/book.js) shows the dress code and hours from the club's 2025
   Membership Handbook. The dress code text itself and the hours lines are translated in js/i18n/fr-portal.js
   (block "Handbook", Club.handbookFr, loaded on this page too); these are the words around them.
   ========================================================================== */
(function () {
  'use strict';
  var portal = document.body ? document.body.classList.contains('portal') : /member\.html/.test(location.pathname);
  if (portal || !window.Club || !Club.i18n || typeof Club.i18n.add !== 'function') return;
  var NB = ' ';
  Club.i18n.add({ strings: {
    'Appropriate golf attire is required for all players.': 'Une tenue de golf appropriée est exigée de tous les joueurs.',
    'Read the dress code': 'Lire le code vestimentaire',
    'Hide the dress code': 'Masquer le code vestimentaire',
    'Hours.': 'Heures.',
    'The Pro Shop is open Monday to Sunday from 6:00 AM, as dictated by business and hours of daylight.': 'La boutique du pro est ouverte du lundi au dimanche dès 6' + NB + 'h, selon l’achalandage et les heures d’ensoleillement.',
    'See all hours': 'Voir toutes les heures',
    'Hide the hours': 'Masquer les heures'
  } });
})();
