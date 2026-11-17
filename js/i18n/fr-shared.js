/* French (Canada) strings shared by the public site and the members' portal: Club.ui generics, pickers, card form
   (js/core/cards.js), receipts, gift cards, takeout, waitlist, visit feedback, tee rules (reasons shown to golfers) and
   the beverage cart golfer view (js/portal/cart.js with the golfer messages of js/modules/cart.js and cartdispatch).
   Exact strings match the trimmed text of a text node (or placeholder, aria-label, title, alt); patterns take text with
   names, numbers, times or dates inside (those parts are already French in French mode, e.g. "13 h 30", "8,50 $"). */

/* Club.fmtEn: English formatters for text that is STORED (receipt titles and notes, payment descriptions, gift card,
   takeout, shop and waitlist history). In French mode Club.fmt and the toLocale* calls switch to fr-CA (js/core/i18n.js)
   and fmt.time adds an invisible U+2060 mark, but stored values must stay English, so code that builds stored text uses
   Club.fmtEn. It uses no locale APIs, so it is English in both languages; the French display translates the stored
   English through the patterns below (enDates). The staff site does not load this file: its Club.fmt is English, so
   callers use (Club.fmtEn || Club.fmt). */
(function () {
  'use strict';
  window.Club = window.Club || {};
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function toDate(d) {
    if (d instanceof Date) return d;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
    return new Date(d);
  }
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function money(v, cents) {
    v = +v || 0;
    var c = cents !== false, a = Math.abs(v), s = c ? a.toFixed(2) : String(Math.round(a)), p = s.split('.');
    return (v < 0 && +s !== 0 ? '-' : '') + '$' + group(p[0]) + (p[1] ? '.' + p[1] : '');
  }
  function time(t) {
    if (!t) return '';
    var h, m;
    if (t instanceof Date) { h = t.getHours(); m = String(t.getMinutes()).padStart(2, '0'); }
    else { var p = String(t).split(':'); h = +p[0]; m = p[1] || '00'; }
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  var mon = function (d, long) { var n = MONTHS[toDate(d).getMonth()]; return long ? n : n.slice(0, 3); };
  var day = function (d, long) { var n = DAYS[toDate(d).getDay()]; return long ? n : n.slice(0, 3); };
  Club.fmtEn = {
    money: money,
    money0: function (v) { return money(v, false); },
    time: time,
    /** "Nov 21, 2026" */
    date: function (d) { return mon(d) + ' ' + toDate(d).getDate() + ', ' + toDate(d).getFullYear(); },
    /** "Nov 21" */
    dateShort: function (d) { return mon(d) + ' ' + toDate(d).getDate(); },
    /** "Saturday, November 21, 2026" */
    dateLong: function (d) { return day(d, true) + ', ' + mon(d, true) + ' ' + toDate(d).getDate() + ', ' + toDate(d).getFullYear(); },
    /** "Saturday, November 21" (the public site's long day, Pub.longDate) */
    longDate: function (d) { return day(d, true) + ', ' + mon(d, true) + ' ' + toDate(d).getDate(); },
    /** "Saturday, Nov 21" */
    dayShortMonth: function (d) { return day(d, true) + ', ' + mon(d) + ' ' + toDate(d).getDate(); },
    weekday: function (d) { return day(d); },
    /** French display of the English dates, clock times and money inside stored text (used by the patterns that
        translate it): "Saturday, November 21 at 7:30 AM" -> "samedi 21 novembre at 7 h 30", "Nov 21" -> "21 nov.",
        "$12.50" -> "12,50 $". The words around them are left to the pattern. */
    fr: function (s) { return frBits(s); }
  };

  var NB = ' ', NNB = ' ';
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MON_RE = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?';
  var DAY_RE = '(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)';
  function monthIx(w) { w = w.replace('.', ''); for (var i = 0; i < 12; i++) if (MONTHS[i] === w || MONTHS[i].slice(0, 3) === w.slice(0, 3)) return i; return -1; }
  function mois(w, i) { return MONTHS.indexOf(w) >= 0 ? MOIS[i] : MOIS3[i]; }   /* "November" -> "novembre", "Nov" -> "nov." */
  function dayIx(w) { for (var i = 0; i < 7; i++) if (DAYS[i] === w || DAYS[i].slice(0, 3) === w) return i; return -1; }
  function frBits(s) {
    if (s == null) return s;
    return String(s)
      .replace(/\b(\d{1,2}):(\d{2}) ?([AP])\.?M\.?/g, function (x, h, m, ap) {
        h = +h % 12; if (ap === 'P') h += 12;
        return h + NB + 'h' + (m !== '00' ? NB + m : '');
      })
      .replace(new RegExp('\\b' + DAY_RE + ',? ' + MON_RE + ' (\\d{1,2})(?:, (\\d{4}))?\\b', 'g'), function (x, d, mo, n, y) {
        var di = dayIx(d), mi = monthIx(mo);
        return (d.length > 3 ? JOURS[di] : JOURS[di].slice(0, 3) + '.') + ' ' + n + ' ' + mois(mo, mi) + (y ? ' ' + y : '');
      })
      .replace(new RegExp('\\b' + MON_RE + ' (\\d{1,2})(?:, (\\d{4}))?\\b', 'g'), function (x, mo, n, y) {
        return n + ' ' + mois(mo, monthIx(mo)) + (y ? ' ' + y : '');
      })
      .replace(/([-−]?)\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g, function (x, sign, n, c) {
        return sign + n.replace(/,/g, NNB) + (c ? ',' + c : '') + NB + '$';
      });
  }
})();

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
    if (window.Club && Club.i18n && typeof Club.i18n.t === 'function') { try { return Club.i18n.t(s); } catch (e) { /* not ready */ } }
    return s;
  }
  function pl(n, one, many) { return n + ' ' + (Math.abs(+n) <= 1 ? one : many); }
  /** Stored text is English (Club.fmtEn): its dates, times and money shown in French. */
  function F(s) { return window.Club && Club.fmtEn ? Club.fmtEn.fr(s) : s; }
  function ord(n) { return +n === 1 ? '1er' : n + 'e'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /** "Visa ending 4242" -> "Visa se terminant par 4242" (Card, Gift card are translated; brand names are kept). */
  function card(s) {
    var m = /^(.+?) ending ([0-9A-Z]{4})$/.exec(s);
    return m ? T(m[1]) + ' se terminant par ' + m[2] : T(s);
  }
  /** Club.teeRules.describeWindows output (times already French): "before 7 h 30, 10 h 30 to 16 h and after 17 h 30". */
  function windowsFr(s) {
    if (s === 'at no times') return 'à aucun moment';
    return s.replace(/\bbefore /g, 'avant ').replace(/\bafter /g, 'après ').replace(/(^|, | and )([^,]+?) to /g, '$1de $2 à ').replace(/ and /g, ' et ');
  }
  var CARTS = 'la voiturette-bar';

  var S = {
    /* ---------- Shared by the public site and the portal (fr-public.js and fr-portal.js load on one page each) ---------- */
    'St. Boniface Golf Club is located on Treaty One lands, the traditional territories of the Anishinaabe, Cree, Oji-Cree, Dakota and Dene peoples, and the homeland of the Métis Nation.':
      'Le St. Boniface Golf Club est situé sur les terres du Traité n° 1, territoires traditionnels des peuples anishinaabe, cri, oji-cri, dakota et déné, et patrie de la Nation métisse.',
    /* cart rules (Course & Grounds) as golfers see them */
    '90 degree': 'Règle du 90°', 'Cart path only': 'Sentiers de voiturette seulement', 'No carts': 'Aucune voiturette',

    /* ---------- Club.ui generics ---------- */
    'Close': 'Fermer',
    'Cancel': 'Annuler',
    'Confirm': 'Confirmer',
    'Are you sure?': 'Êtes-vous certain?',
    'This field is required.': 'Ce champ est obligatoire.',
    'Guest': 'Invité',
    'guest': 'invité',
    'Today': 'Aujourd’hui',
    'Tomorrow': 'Demain',
    'Yesterday': 'Hier',
    'Remove': 'Retirer',
    'Add': 'Ajouter',
    'Yes': 'Oui',
    'Done': 'Terminé',
    'Total': 'Total',
    'Date': 'Date',
    'Payment': 'Paiement',
    'Receipt': 'Reçu',
    'Refund': 'Remboursement',
    'Refund receipt': 'Reçu de remboursement',
    'View receipt': 'Voir le reçu',
    'Secure': 'Sécurisé',
    'Menu': 'Menu',
    'Hole': 'Trou',
    'Member': 'Membre',
    'Public golfer': 'Golfeur public',
    'Open': 'Ouverte',
    'Full': 'Complète',
    'Cancelled': 'Annulée',
    'Cancelled, refunded': 'Annulée, remboursée',
    'Delivered': 'Livrée',
    'Sign in': 'Se connecter',
    'Phone *': 'Téléphone *',
    'Email *': 'Courriel *',
    '(optional)': '(facultatif)',
    'For your receipt.': 'Pour votre reçu.',
    'Please check the highlighted fields': 'Veuillez vérifier les champs en surbrillance',
    'That email address does not look right.': 'Cette adresse courriel ne semble pas valide.',
    'Enter a 10-digit phone number, for example (204) 555-0123.': 'Entrez un numéro de téléphone à 10 chiffres, par exemple (204) 555-0123.',
    'Enter your email for the receipt.': 'Entrez votre courriel pour le reçu.',
    'Processing payment': 'Paiement en cours',

    /* ---------- Pickers (js/core/pickers.js; month and weekday names come from the engine) ---------- */
    'Choose a date': 'Choisir une date',
    'Previous month': 'Mois précédent',
    'Next month': 'Mois suivant',
    'Clear': 'Effacer',
    /* the search box at the top of long lists */
    'Search': 'Rechercher',
    'Search the list': 'Rechercher dans la liste',
    'No matches': 'Aucun résultat',

    /* ---------- Card form (js/core/cards.js) and checkout (Club.checkout) ---------- */
    'Card': 'Carte',
    'Cardholder': 'Titulaire',
    'Your name': 'Votre nom',
    'Expires': 'Expire',
    'MM/YY': 'MM/AA',
    'Card number *': 'Numéro de carte *',
    'Name on card *': 'Nom sur la carte *',
    'As shown on the card': 'Tel qu’il figure sur la carte',
    'Expiry *': 'Expiration *',
    'Security code *': 'Code de sécurité *',
    'Enter your card number.': 'Entrez votre numéro de carte.',
    'That card number is not valid. Check the digits and try again.': 'Ce numéro de carte n’est pas valide. Vérifiez les chiffres et réessayez.',
    'Enter the name shown on the card.': 'Entrez le nom inscrit sur la carte.',
    'Enter the expiry as MM/YY.': 'Entrez la date d’expiration sous la forme MM/AA.',
    'The month must be between 01 and 12.': 'Le mois doit être entre 01 et 12.',
    'This card has expired.': 'Cette carte est expirée.',
    'Check the expiry year.': 'Vérifiez l’année d’expiration.',
    'Enter the 3-digit security code on the back of the card.': 'Entrez le code de sécurité à 3 chiffres au verso de la carte.',
    'Enter the 4-digit security code on the front of the card.': 'Entrez le code de sécurité à 4 chiffres au recto de la carte.',
    'Charge to my account': 'Porter à mon compte',
    'Pay by card': 'Payer par carte',
    'Added to your member account and shown on your next statement.': 'Ajouté à votre compte de membre et indiqué sur votre prochain relevé.',
    'We keep only the card brand and the last four digits, for your receipt. Never the full number or the security code.': 'Nous conservons seulement le type de carte et les quatre derniers chiffres, pour votre reçu. Jamais le numéro complet ni le code de sécurité.',
    'We keep only the card brand and the last four digits, for your receipt. This is a demo: try 4242 4242 4242 4242.': 'Nous conservons seulement le type de carte et les quatre derniers chiffres, pour votre reçu. Ceci est une démo : essayez 4242 4242 4242 4242.',
    'to see your orders on any device.': 'pour voir vos commandes sur n’importe quel appareil.',
    'to keep this gift card with your account.': 'pour garder cette carte-cadeau dans votre compte.',
    'Demonstration site: try Visa 4242 4242 4242 4242 with any future expiry.': 'Site de démonstration : essayez Visa 4242 4242 4242 4242 avec n’importe quelle date d’expiration future.',
    'Please check your card details': 'Veuillez vérifier les renseignements de votre carte',
    'Please choose a card': 'Veuillez choisir une carte',
    'Your card was declined. Please try another card, or call your card issuer.': 'Votre carte a été refusée. Veuillez essayer une autre carte ou communiquer avec l’émetteur de votre carte.',
    /* Checkout steps (Club.checkout.steps): Details, Payment, Review, on the shop, takeout, gift card and tee time pages */
    'Checkout steps': 'Étapes du paiement',
    'Details': 'Détails',
    'Continue to payment': 'Continuer vers le paiement',
    'Continue to review': 'Continuer vers la vérification',
    'How would you like to pay?': 'Comment souhaitez-vous payer?',
    'Pay the rest with': 'Payer le reste avec',
    'Pay the rest by card': 'Payer le reste par carte',
    'Enter your gift card code and choose Apply, or choose another way to pay.': 'Entrez le code de votre carte-cadeau et choisissez Appliquer, ou choisissez un autre mode de paiement.',
    'Charged to your member account': 'Porté à votre compte de membre',
    'New card': 'Nouvelle carte',
    'Edit': 'Modifier',
    'Items': 'Articles',
    'Name': 'Nom',
    'Review': 'Vérifier',
    'When': 'Quand',
    'Phone': 'Téléphone',
    'Email': 'Courriel',
    'Signed from': 'De la part de',
    'Choose how to pay': 'Choisissez comment payer',
    'Review and pay': 'Vérifier et payer',

    /* ---------- Receipts (js/core/receipts.js) ---------- */
    'Credit': 'Crédit',
    'Credited to': 'Crédité à',
    'Customer': 'Client',
    'Quantity': 'Quantité',
    'Item': 'Article',
    'Amount': 'Montant',
    'Total credit': 'Crédit total',
    'Taxes included.': 'Taxes incluses.',
    'Print or save as PDF': 'Imprimer ou enregistrer en PDF',
    'That receipt is not available': 'Ce reçu n’est pas disponible',
    'Credit to your member account': 'Crédité à votre compte de membre',
    'Charged to your member account': 'Porté à votre compte de membre',
    'Cash': 'Comptant',
    'Other': 'Autre',
    'Pre-authorized debit': 'Prélèvement préautorisé',
    'Cheque': 'Chèque',
    'Purchase': 'Achat',
    'Account charge': 'Frais au compte',
    'Account payment': 'Paiement au compte',
    'Payment on account': 'Paiement sur le compte',
    'Beverage cart': 'Voiturette-bar',
    'Member account': 'Compte de membre',

    /* ---------- Gift cards (js/core/giftcards.js) ---------- */
    'Gift card': 'Carte-cadeau',
    'Golf shop': 'Boutique du pro',
    'Tee time paid online': 'Départ payé en ligne',
    'Gallery takeout': 'Commande pour emporter du Gallery',
    'Gift card sale': 'Vente de carte-cadeau',
    'Gift card code': 'Code de la carte-cadeau',
    'Enter the gift card code.': 'Entrez le code de la carte-cadeau.',
    'Gift card codes have 12 letters and numbers. Check the code and try again.': 'Les codes de carte-cadeau comptent 12 lettres et chiffres. Vérifiez le code et réessayez.',
    'We could not find that gift card. Check the code and try again.': 'Nous n’avons pas trouvé cette carte-cadeau. Vérifiez le code et réessayez.',
    'This gift card has been fully used.': 'Cette carte-cadeau a été entièrement utilisée.',
    'This gift card has been voided.': 'Cette carte-cadeau a été annulée.',
    'That gift card is not on file.': 'Cette carte-cadeau n’est pas au dossier.',
    'Enter an amount greater than zero.': 'Entrez un montant supérieur à zéro.',
    'Green fees · Pro shop · Gallery Taphouse & Grill': 'Droits de jeu · Boutique du pro · Gallery Taphouse & Grill',
    'For': 'Pour',
    'That gift card is not available': 'Cette carte-cadeau n’est pas disponible',
    'Your gift card': 'Votre carte-cadeau',
    'Apply': 'Appliquer',
    'Use a gift card': 'Utiliser une carte-cadeau',
    'Apply a gift card': 'Appliquer une carte-cadeau',
    'That gift card can no longer be used. It has been removed from this payment.': 'Cette carte-cadeau ne peut plus être utilisée. Elle a été retirée de ce paiement.',
    'That gift card has no balance left. It has been removed from this payment.': 'Cette carte-cadeau n’a plus de solde. Elle a été retirée de ce paiement.',
    'Paid in full by gift card': 'Payé en totalité par carte-cadeau',
    'Still to pay': 'Reste à payer',
    'Void': 'Annulée',

    /* ---------- Takeout (js/core/takeout.js) ---------- */
    'Breakfast': 'Déjeuner',
    'Soup & salads': 'Soupes et salades',
    'Sandwiches': 'Sandwichs',
    'Sides': 'Accompagnements',
    'Snacks & shares': 'Bouchées et plats à partager',
    'Baskets & bowls': 'Paniers et bols',
    'Handhelds': 'À manger avec les mains',
    'Main attractions': 'Plats principaux',
    'Order received': 'Commande reçue',
    'Ready for pickup': 'Prête pour la cueillette',
    'Picked up': 'Récupérée',
    'Received': 'Reçue',
    'Add something from the menu first.': 'Ajoutez d’abord un article du menu.',
    'Add something from the menu first': 'Ajoutez d’abord un article du menu',
    'Choose a pickup time.': 'Choisissez une heure de cueillette.',
    'That pickup time is no longer available. Please choose another.': 'Cette heure de cueillette n’est plus disponible. Veuillez en choisir une autre.',
    'Enter the name for the order.': 'Entrez le nom pour la commande.',
    'Choose a card to pay with.': 'Choisissez une carte pour payer.',
    'Cancelled by the Gallery.': 'Annulée par le Gallery.',
    'Cancelled online.': 'Annulée en ligne.',
    'Gluten free': 'Sans gluten',
    'Vegetarian': 'Végétarien',
    'Vegan': 'Végétalien',
    'Fridays': 'Le vendredi',
    'Pizza': 'Pizza',
    'Menu sections': 'Sections du menu',
    'Phone for this order *': 'Téléphone pour cette commande *',
    'The Gallery calls if there is a question about your order.': 'Le Gallery vous appellera s’il y a une question au sujet de votre commande.',
    'Ordering as a guest.': 'Commande en tant qu’invité.',
    'Name for the order *': 'Nom pour la commande *',
    'Pickup at the clubhouse': 'Cueillette au pavillon',
    'Your order': 'Votre commande',
    'Notes for the kitchen': 'Notes pour la cuisine',
    'Allergies, sauce on the side, cutlery': 'Allergies, sauce à part, ustensiles',
    'Place order': 'Passer la commande',
    'Place order · paid by gift card': 'Passer la commande · payée par carte-cadeau',
    'Prices include tax at checkout. Questions about your order? Call the clubhouse at': 'Les taxes s’ajoutent au moment du paiement. Des questions sur votre commande? Appelez le pavillon au',
    'Subtotal': 'Sous-total',
    'Tax': 'Taxes',
    'GST 5% + PST 7%': 'TPS 5 % + TVP 7 %',
    'Add dishes from the menu. Pickup is at the Gallery Taphouse & Grill.': 'Ajoutez des plats du menu. La cueillette se fait au Gallery Taphouse & Grill.',
    'No more pickups today. Please choose another day.': 'Plus aucune cueillette aujourd’hui. Veuillez choisir un autre jour.',
    'Pickup': 'Cueillette',
    'Pickup day': 'Jour de cueillette',
    'Pickup time *': 'Heure de cueillette *',
    'Choose a time': 'Choisir une heure',
    'No times for this order': 'Aucune heure pour cette commande',
    'Morning': 'Matin',
    'Afternoon': 'Après-midi',
    'Evening': 'Soir',
    'Enter a phone number for the order.': 'Entrez un numéro de téléphone pour la commande.',
    'Placing your order': 'Commande en cours',
    'Cancel order': 'Annuler la commande',
    'Keep order': 'Garder la commande',
    'The kitchen has already started on this order. Please call the clubhouse': 'La cuisine a déjà commencé cette commande. Veuillez appeler le pavillon',
    'At the Gallery Taphouse & Grill, second floor of the clubhouse.': 'Au Gallery Taphouse & Grill, au deuxième étage du pavillon.',
    'Order something else': 'Commander autre chose',
    'Your orders': 'Vos commandes',

    /* ---------- Waitlist (js/core/waitlist.js) ---------- */
    'Any time': 'N’importe quand',
    'Any time that day': 'N’importe quelle heure ce jour-là',
    'Before 11:00 AM': 'Avant 11 h',
    'Midday': 'Midi',
    '11:00 AM to 2:00 PM': 'De 11 h à 14 h',
    'After 2:00 PM': 'Après 14 h',
    'any time': 'n’importe quand',
    'in the morning (before 11:00 AM)': 'en matinée (avant 11 h)',
    'in the midday (11:00 AM to 2:00 PM)': 'en milieu de journée (de 11 h à 14 h)',
    'in the afternoon (after 2:00 PM)': 'en après-midi (après 14 h)',
    'That tee time could not be found.': 'Cette heure de départ est introuvable.',
    'There are no public tee times left then.': 'Il ne reste aucune heure de départ publique à ce moment-là.',
    'Your membership does not play at these times.': 'Votre catégorie de membre ne permet pas de jouer à ces heures.',
    'You already have a round close to these times.': 'Vous avez déjà une partie proche de ces heures.',

    /* ---------- Tee rules (js/core/teerules.js) ---------- */
    'That date has passed.': 'Cette date est passée.',
    'Weekend and holiday mornings before 1:00 PM are for public golfers playing with a member.': 'Les matins de fin de semaine et de jours fériés avant 13 h sont réservés aux golfeurs publics qui jouent avec un membre.',
    'Not open to public play.': 'Non ouvert au jeu public.',
    'Friday daytime is reserved for member play.': 'Le vendredi, le jeu de jour est réservé aux membres.',
    'Public tee times are Monday to Thursday 10:30 AM to 3:30 PM, weekdays after 5:30 PM, and weekends and holidays after 1:00 PM.': 'Les heures de départ publiques sont du lundi au jeudi de 10 h 30 à 15 h 30, en semaine après 17 h 30, et les fins de semaine et jours fériés après 13 h.',
    'Weekday': 'Semaine',
    'Twilight': 'Crépuscule',
    'Weekend & holiday': 'Fin de semaine et fériés',
    "New Year's Day": 'Jour de l’An',
    'Louis Riel Day': 'Journée Louis-Riel',
    'Victoria Day': 'Fête de Victoria',
    'Canada Day': 'Fête du Canada',
    'Terry Fox Day': 'Journée Terry-Fox',
    'Labour Day': 'Fête du Travail',
    'National Day for Truth and Reconciliation': 'Journée nationale de la vérité et de la réconciliation',
    'Thanksgiving': 'Action de grâce',
    'Remembrance Day': 'Jour du Souvenir',
    'Christmas Day': 'Noël',
    'Boxing Day': 'Lendemain de Noël',

    /* ---------- Weather words (Club.weather, shown with tee times) ---------- */
    'Sunny': 'Ensoleillé',
    'Partly cloudy': 'Partiellement nuageux',
    'Overcast': 'Couvert',
    'Fog': 'Brouillard',
    'Drizzle': 'Bruine',
    'Light rain': 'Pluie légère',
    'Rain': 'Pluie',
    'Snow': 'Neige',
    'Thunderstorms': 'Orages',
    'Cloudy': 'Nuageux',
    'Breezy': 'Venteux',

    /* ---------- Visit feedback (js/core/feedback.js) ---------- */
    'Poor': 'Mauvais',
    'Fair': 'Passable',
    'Good': 'Bien',
    'Very good': 'Très bien',
    'Excellent': 'Excellent',
    'Round': 'Partie',
    'Rounds': 'Parties',
    'Meal': 'Repas',
    'Meals': 'Repas',
    'Lesson': 'Leçon',
    'Lessons': 'Leçons',
    'How was your round?': 'Comment s’est passée votre partie?',
    'How was your meal?': 'Comment était votre repas?',
    'How was your lesson?': 'Comment s’est passée votre leçon?',
    'Round of golf': 'Partie de golf',
    'Rated': 'Évaluée',
    'Comment': 'Commentaire',
    'Anything you would like the club to know': 'Tout ce que vous aimeriez faire savoir au club',
    'Update comment': 'Mettre à jour le commentaire',
    'Save comment': 'Enregistrer le commentaire',
    'This visit can no longer be rated.': 'Cette visite ne peut plus être évaluée.',
    'Thank you. Your comment has been saved.': 'Merci. Votre commentaire a été enregistré.',
    'Your comment has been removed.': 'Votre commentaire a été supprimé.',

    /* ---------- Beverage cart, golfer view (js/portal/cart.js, js/modules/cart.js, js/core/cartdispatch.js) ---------- */
    'Order to the course': 'Commander sur le parcours',
    'Drinks': 'Boissons',
    'Beer and alcohol': 'Bière et alcool',
    'Snacks': 'Collations',
    'Food': 'Nourriture',
    'Golf': 'Golf',
    'Clubhouse': 'Pavillon',
    'Cart service is closed right now': 'Le service de voiturette-bar est fermé pour le moment',
    'Cart is on the course': 'La voiturette-bar est sur le parcours',
    'Cart is restocking': 'La voiturette-bar se réapprovisionne',
    'No orders waiting': 'Aucune commande en attente',
    '1 order waiting': '1 commande en attente',
    'No one in line': 'Personne en file',
    'The cart uses your location to find your group. It’s only used while your order is open.': 'La voiturette-bar utilise votre position pour trouver votre groupe. Elle n’est utilisée que pendant que votre commande est ouverte.',
    'Your location is shared with the cart while your order is open, so it can find your group. It’s only shared while this page is open in your browser. If you close it, the cart uses the last hole we know. It stops when your order is delivered or cancelled.':
      'Votre position est partagée avec la voiturette-bar pendant que votre commande est ouverte, pour qu’elle puisse trouver votre groupe. Elle n’est partagée que pendant que cette page est ouverte dans votre navigateur. Si vous la fermez, la voiturette-bar utilise le dernier trou connu. Le partage s’arrête lorsque votre commande est livrée ou annulée.',
    'Demo: location check skipped': 'Démo : vérification de la position ignorée',
    'You need to be at the club to order from the cart': 'Vous devez être au club pour commander à la voiturette-bar',
    'Turn on location to order': 'Activez la localisation pour commander',
    'Your location shows you away from the club. Ordering and Call the cart work at the club.': 'Votre position indique que vous n’êtes pas au club. Commander et Appeler la voiturette-bar fonctionnent au club.',
    'In your browser, allow location for this site when it asks, or in the site settings (the icon beside the address).': 'Dans votre navigateur, autorisez la localisation pour ce site lorsqu’il le demande, ou dans les réglages du site (l’icône à côté de l’adresse).',
    'iPhone: Settings, Privacy and Security, Location Services: turn it on, and allow it for your browser.': 'iPhone : Réglages, Confidentialité et sécurité, Service de localisation : activez-le et autorisez-le pour votre navigateur.',
    'Android: Settings, Location: turn it on, and allow it for your browser.': 'Android : Paramètres, Localisation : activez-la et autorisez-la pour votre navigateur.',
    'Try again': 'Réessayer',
    'Location is not available on this device': 'La localisation n’est pas disponible sur cet appareil',
    'Location is off, so we can’t place the order yet': 'La localisation est désactivée : nous ne pouvons pas encore passer la commande',
    'We couldn’t get your location. Please try again': 'Nous n’avons pas pu obtenir votre position. Veuillez réessayer',
    'Share your location': 'Partager votre position',
    'Share my location': 'Partager ma position',
    'Your phone will ask you to allow it.': 'Votre téléphone vous demandera de l’autoriser.',
    'Paid by card': 'Payé par carte',
    'Paid by cash': 'Payé comptant',
    'Nothing charged': 'Rien de facturé',
    'Charged to your account': 'Porté à votre compte',
    'On your account': 'À votre compte',
    'Paid at the cart': 'Payé à la voiturette-bar',
    'Pay at the cart': 'Payer à la voiturette-bar',
    'Call the cart to you': 'Faites venir la voiturette-bar',
    'The cart comes to your hole and you choose from what’s on board.': 'La voiturette-bar vient à votre trou et vous choisissez parmi ce qu’elle transporte.',
    'Call the cart': 'Appeler la voiturette-bar',
    'Cart visit done': 'Visite de la voiturette-bar terminée',
    'Cart visit cancelled': 'Visite de la voiturette-bar annulée',
    'Order cancelled': 'Commande annulée',
    'On the way': 'En route',
    'Your cart visit': 'Votre visite de la voiturette-bar',
    'Cart visit': 'Visite de la voiturette-bar',
    'Change hole': 'Changer de trou',
    'Includes the items you added later.': 'Comprend les articles ajoutés plus tard.',
    'ID may be checked for alcohol.': 'Une pièce d’identité peut être demandée pour l’alcool.',
    'ID may be checked': 'Pièce d’identité possiblement demandée',
    'I’ve moved: I’m on hole …': 'J’ai changé de trou : je suis au trou …',
    'Edit note': 'Modifier la note',
    'Edit order': 'Modifier la commande',
    'Cancel visit': 'Annuler la visite',
    'Got it': 'Compris',
    'Sharing your location while this page is open.': 'Votre position est partagée tant que cette page est ouverte.',
    'Menu categories': 'Catégories du menu',
    'Sold out': 'Épuisé',
    'Where are you?': 'Où êtes-vous?',
    'Which hole are you on?': 'À quel trou êtes-vous?',
    'Which hole are you on now?': 'À quel trou êtes-vous maintenant?',
    'Choose hole': 'Choisir le trou',
    'Note for the cart (optional)': 'Note pour la voiturette-bar (facultatif)',
    'e.g. No ice, please': 'p. ex. Sans glace, s’il vous plaît',
    'e.g. 4 of us, mostly beer': 'p. ex. Nous sommes 4, surtout de la bière',
    'Add a note for the cart': 'Ajouter une note pour la voiturette-bar',
    'Add to my account': 'Ajouter à mon compte',
    'Charged when it’s delivered. Shows on your statement.': 'Porté au compte à la livraison. Figure sur votre relevé.',
    'Card or cash when it arrives.': 'Carte ou comptant à son arrivée.',
    'Whatever you choose is charged to your account.': 'Ce que vous choisissez est porté à votre compte.',
    'Card or cash at the cart.': 'Carte ou comptant à la voiturette-bar.',
    'You pay at the cart, by card or cash, when it arrives.': 'Vous payez à la voiturette-bar, par carte ou comptant, à son arrivée.',
    'You pay at the cart, by card or cash.': 'Vous payez à la voiturette-bar, par carte ou comptant.',
    'Nothing was charged.': 'Rien n’a été facturé.',
    'No round today': 'Aucune partie aujourd’hui',
    'Your round is complete': 'Votre partie est terminée',
    'Not quite yet': 'Pas tout de suite',
    'Ordering to the course opens on the day you play. You can order once you have a tee time today.': 'Les commandes sur le parcours ouvrent le jour où vous jouez. Vous pourrez commander dès que vous aurez une heure de départ aujourd’hui.',
    'Your round today is complete. We hope you enjoyed it.': 'Votre partie d’aujourd’hui est terminée. Nous espérons que vous l’avez appréciée.',
    'Your order is still listed above.': 'Votre commande figure toujours ci-dessus.',
    'The beverage cart is not out on the course at the moment. Please check back soon.': 'La voiturette-bar n’est pas sur le parcours en ce moment. Revenez bientôt.',
    'Add to your order': 'Ajouter à votre commande',
    'From your location. Change it if that’s wrong.': 'D’après votre position. Modifiez-le si c’est inexact.',
    'Choose the hole you’re on so the cart can find you.': 'Choisissez le trou où vous êtes pour que la voiturette-bar vous trouve.',
    'Add to order': 'Ajouter à la commande',
    'Choose the hole you’re on.': 'Choisissez le trou où vous êtes.',
    'Choose the hole you’re on': 'Choisissez le trou où vous êtes',
    'Added to your cart visit, which is now an order': 'Ajouté à votre visite de la voiturette-bar, qui devient une commande',
    'Added to your open order': 'Ajouté à votre commande ouverte',
    'Sorry, that has just sold out': 'Désolé, cet article vient d’être épuisé',
    'Edit your note': 'Modifier votre note',
    'Save note': 'Enregistrer la note',
    'A cart visit has nothing to change but the note. To order specific items, use the menu.': 'Une visite de la voiturette-bar ne comporte rien à modifier, sauf la note. Pour commander des articles précis, utilisez le menu.',
    'No changes to save': 'Aucune modification à enregistrer',
    'Your note is updated': 'Votre note est mise à jour',
    'Removed': 'Retiré',
    'Sold out, can’t add more': 'Épuisé, impossible d’en ajouter',
    'Nothing left on the order': 'Plus rien dans la commande',
    'Change what you ordered before the cart heads your way. To add something new, use the menu.': 'Modifiez votre commande avant que la voiturette-bar se dirige vers vous. Pour ajouter quelque chose, utilisez le menu.',
    'Edit your order': 'Modifier votre commande',
    'Save changes': 'Enregistrer les modifications',
    'Your order is cancelled': 'Votre commande est annulée',
    'Your order is updated': 'Votre commande est mise à jour',
    'Cancel your cart visit?': 'Annuler votre visite de la voiturette-bar?',
    'Cancel your order?': 'Annuler votre commande?',
    'The cart won’t come by for this visit. Nothing has been charged.': 'La voiturette-bar ne passera pas pour cette visite. Rien n’a été facturé.',
    'Your cart visit is cancelled': 'Votre visite de la voiturette-bar est annulée',
    'Thanks, location is on. You can order now': 'Merci, la localisation est activée. Vous pouvez commander maintenant',
    'Where the cart expects you': 'Là où la voiturette-bar vous attend',
    'My order': 'Ma commande',
    'Order': 'Commander',
    'Order or call the cart': 'Commander ou appeler la voiturette-bar',
    'Your cart order': 'Votre commande à la voiturette-bar',
    'Cart order': 'Commande à la voiturette-bar',
    'Dismiss': 'Fermer',
    'Continue': 'Continuer',
    'Tell the cart': 'Prévenir la voiturette-bar',
    'This cart visit was cancelled.': 'Cette visite de la voiturette-bar a été annulée.',
    'This order was cancelled.': 'Cette commande a été annulée.',
    'We are finding a cart to come to you.': 'Nous cherchons une voiturette-bar qui viendra à vous.',
    'We are finding a cart for your order.': 'Nous cherchons une voiturette-bar pour votre commande.',
    "You're next! The cart is on its way to you.": 'Vous êtes le prochain! La voiturette-bar est en route vers vous.',
    'Please share your location so the cart can find your group.': 'Veuillez partager votre position pour que la voiturette-bar trouve votre groupe.',
    'Your location is out of date. Please try again.': 'Votre position n’est plus à jour. Veuillez réessayer.',
    'Your location is not precise enough yet. Please try again in a moment.': 'Votre position n’est pas encore assez précise. Veuillez réessayer dans un moment.',
    'You need to be at the club to order from the cart.': 'Vous devez être au club pour commander à la voiturette-bar.',
    'Cart service is closed right now. Please try again later.': 'Le service de voiturette-bar est fermé pour le moment. Veuillez réessayer plus tard.',
    'An item in your order is no longer on the menu. Please check your order.': 'Un article de votre commande n’est plus au menu. Veuillez vérifier votre commande.',
    'Add at least one item to your order.': 'Ajoutez au moins un article à votre commande.',
    'Choose the hole you are on.': 'Choisissez le trou où vous êtes.',
    'This account cannot take charges right now. Please choose Pay at the cart.': 'Ce compte ne peut pas recevoir de frais pour le moment. Veuillez choisir Payer à la voiturette-bar.',
    'We could not place your order. Please try again.': 'Nous n’avons pas pu passer votre commande. Veuillez réessayer.',
    'We could not find your open order. Please refresh and try again.': 'Nous ne trouvons pas votre commande ouverte. Veuillez actualiser la page et réessayer.',
    'You already have an order open, so the cart is coming to you anyway.': 'Vous avez déjà une commande ouverte : la voiturette-bar viendra à vous de toute façon.',
    'We could not call the cart. Please try again.': 'Nous n’avons pas pu appeler la voiturette-bar. Veuillez réessayer.',
    'Choose a hole from 1 to 18.': 'Choisissez un trou de 1 à 18.',
    'This order is no longer open.': 'Cette commande n’est plus ouverte.',
    'We could not work out your hole. Please choose it.': 'Nous n’avons pas pu déterminer votre trou. Veuillez le choisir.',
    'The cart is already on its way to you, so this order can no longer be cancelled.': 'La voiturette-bar est déjà en route vers vous : cette commande ne peut plus être annulée.',
    'The cart is already on its way to you, so this order can no longer be changed.': 'La voiturette-bar est déjà en route vers vous : cette commande ne peut plus être modifiée.'
  };

  /* French date words the pages build themselves (fr-CA toLocaleDateString, dots removed): kept as they are, listed so
     Club.i18n.missing() does not report them. */
  ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.',
    'janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc',
    'janv.', 'févr.', 'avr.', 'juil.', 'sept.', 'oct.', 'nov.', 'déc.'].forEach(function (w) { if (!has(S, w)) S[w] = w; });
  var DAYS_FR = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
  var MOIS_FR = '(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|(?:janv|févr|avr|juil|sept|oct|nov|déc)\\.?)';
  var P = [
    /* A whole French date ("jeudi 5 novembre", "jeu. 5 nov. 2026") is already French: a no-break space after the
       weekday marks it as done (otherwise Club.i18n.missing() reports it). */
    [new RegExp('^(' + DAYS_FR + '|(?:lun|mar|mer|jeu|ven|sam|dim)\\.?) (\\d{1,2}(?:er)? ' + MOIS_FR + '(?: \\d{4})?)$'), function (m, d, r) { return d + NB + r; }],
    /* ---------- cards and payment ---------- */
    [/^(.+?) ending ([0-9A-Z]{4})$/, function (m) { return card(m[0]); }],
    [/^(.+? ending [0-9A-Z]{4}) and (.+)$/, function (m, a, b) { return card(a) + ' et ' + (b === 'member account' ? 'compte de membre' : b === 'card' ? 'carte' : card(b)); }],
    [/^(.+) detected$/, function (m, b) { return T(b) + ' détectée'; }],
    /* the checkout steps' live announcement: "Step 2 of 3: Payment" */
    [/^Step (\d) of (\d): (.+)$/, function (m, a, b, l) { return nb('Étape ' + a + ' sur ' + b + ' : ' + T(l)); }],
    [/^(\d) digits$/, '$1 chiffres'],
    [/^Enter the (\d)-digit security code on the (front|back) of the card\.$/, function (m, n, w) { return 'Entrez le code de sécurité à ' + n + ' chiffres au ' + (w === 'front' ? 'recto' : 'verso') + ' de la carte.'; }],
    [/^Expires (\d\d\/\d\d)$/, 'Expire le $1'],
    /* ---------- receipts ---------- */
    [/^(Receipt|Credit) (R-\d+)$/, function (m, k, n) { return (k === 'Credit' ? 'Crédit ' : 'Reçu ') + n; }],
    [/^(.+) each$/, '$1 chacun'],
    [/^Beverage cart · (.+)$/, function (m, i) { return 'Voiturette-bar · ' + T(i); }],
    /* ---------- gift cards ---------- */
    [/^This gift card is no longer valid\. Please call the golf shop at (.+)\.$/, 'Cette carte-cadeau n’est plus valide. Veuillez appeler la boutique du pro au $1.'],
    [/^Only (.+) is left on this gift card\.$/, 'Il ne reste que $1 sur cette carte-cadeau.'],
    [/^Gift card for (.+)$/, 'Carte-cadeau pour $1'],
    [/^Gift card (\w{4}) for (.+)$/, 'Carte-cadeau $1 pour $2'],
    [/^(Gift card ending \w{4})(?:, for (.+?))?\. Valid for green fees, the pro shop and the Gallery Taphouse & Grill\.$/, function (m, l, e) { return card(l) + (e ? ', pour ' + e : '') + '. Valable pour les droits de jeu, la boutique du pro et le Gallery Taphouse & Grill.'; }],
    [/^From (.+)$/, 'De la part de $1'],
    [/^Use it at the golf shop or the Gallery Taphouse & Grill, or enter the code when you pay for a tee time online\. Check the balance on the club’s public site\. (.+)$/, 'Utilisez-la à la boutique du pro ou au Gallery Taphouse & Grill, ou entrez le code lorsque vous payez une heure de départ en ligne. Consultez le solde sur le site public du club. $1'],
    [/^(.+) applied · (.+) left on the card after this$/, '$1 appliqué · $2 restant sur la carte après cet achat'],
    [/^(.+) left on the card after this$/, '$1 restant sur la carte après cet achat'],
    [/^(.+) will be applied to this (.+) total\.$/, '$1 sera appliqué à ce total de $2.'],
    [/^(Gift card ending \w{4}): (.+?) back on the card\.(?: (.+ ending \d{4}): (.+) refunded\.)?$/, function (m, g, a, c, b) { return card(g) + ' : ' + F(a) + ' remis sur la carte.' + (c ? ' ' + card(c) + ' : ' + F(b) + ' remboursé.' : ''); }],
    /* ---------- takeout ---------- */
    [/^(.+) is for pickup on Fridays only\.( There is no Friday open for orders right now\.)?$/, function (m, i, x) { return i + ' : cueillette le vendredi seulement.' + (x ? ' Aucun vendredi n’est ouvert aux commandes pour le moment.' : ''); }],
    [/^(.+) is ready from (.+)\.$/, '$1 : prête à partir de $2.'],
    [/^Breakfast is served until (.+)\.$/, 'Le déjeuner est servi jusqu’à $1.'],
    [/^Online takeout orders are paused right now\. Please call the (Gallery|clubhouse) at (.+)\.$/, function (m, w, p) { return 'Les commandes pour emporter en ligne sont suspendues pour le moment. Veuillez appeler ' + (w === 'Gallery' ? 'le Gallery' : 'le pavillon') + ' au ' + p + '.'; }],
    [/^(.+) is no longer available\. Please remove it\.$/, function (m, i) { return (i === 'An item' ? 'Un article' : i) + ' n’est plus offert. Veuillez le retirer.'; }],
    [/^Choose between 1 and (\d+) of (.+)\.$/, 'Choisissez entre 1 et $1 : $2.'],
    [/^Choose a pickup day in the next (\d+) days\.$/, 'Choisissez un jour de cueillette dans les $1 prochains jours.'],
    [/^Takeout order (T\d+)( cancelled)?$/, function (m, c, x) { return 'Commande pour emporter ' + c + (x ? ' annulée' : ''); }],
    [/^Pickup (.+) at the Gallery Taphouse & Grill\.$/, function (m, w) { return 'Cueillette ' + pickup(w) + ' au Gallery Taphouse & Grill.'; }],
    [/^(Cancelled by the Gallery\.|Cancelled online\.) (.+)$/, function (m, a, r) { return T(a) + ' ' + T(r); }],
    [/^Order status: (.+)$/, function (m, s) { return 'État de la commande : ' + T(s); }],
    [/^Add (.+)$/, function (m, n) { return /^(a |an |at |to |some)/i.test(n) || / to basket$/.test(n) ? null : 'Ajouter ' + n; }],   /* "Add X to basket" is in fr-shop.js */
    [/^(.+) quantity$/, 'Quantité : $1'],
    [/^One fewer (.+)$/, 'Un de moins : $1'],
    [/^One more (.+)$/, 'Un de plus : $1'],
    [/^Fridays from (.+)$/, 'Le vendredi dès $1'],
    [/^Pickup until (.+)$/, 'Cueillette jusqu’à $1'],
    [/^(\d+) items?$/, function (m, n) { return pl(n, 'article', 'articles'); }],
    [/^Breakfast \(until (.+?)\) and (.+) \(from (.+?)\) cannot be picked up together\. Please place them as two orders\.$/, 'Le déjeuner (jusqu’à $1) et $2 (à partir de $3) ne peuvent pas être récupérés ensemble. Veuillez passer deux commandes.'],
    [/^(.+), closed$/, '$1, fermé'],
    [new RegExp('^Choose (' + DAYS_FR + ' .+)$'), 'Choisir le $1'],
    [/^Pickup moved to (.+): (.+) is for Fridays only$/, 'Cueillette déplacée au $1 : $2 se récupère le vendredi seulement'],
    [/^Place order · (.+)$/, 'Passer la commande · $1'],
    [/^We could not place your order\. You have not been charged\. Please call the clubhouse at (.+)\.$/, 'Nous n’avons pas pu passer votre commande. Aucun montant n’a été porté à votre carte. Veuillez appeler le pavillon au $1.'],
    [/^Order (T\d+) (placed|cancelled|received)$/, function (m, c, w) { return 'Commande ' + c + ' ' + ({ placed: 'passée', cancelled: 'annulée', received: 'reçue' })[w]; }],
    [/^Order (T\d+)$/, 'Commande $1'],
    [/^Pickup (.+)$/, function (m, w) { return /^(today|Today|.+ at .+)$/.test(w) ? 'Cueillette ' + pickup(w) : null; }],
    [/^This order can no longer be cancelled online\. Please call the clubhouse at (.+)$/, 'Cette commande ne peut plus être annulée en ligne. Veuillez appeler le pavillon au $1'],
    [/^Cancel order (T\d+)\?$/, 'Annuler la commande $1?'],
    [/^Your order for pickup (.+?) will be cancelled(?:, and (.+))?\.$/, function (m, w, back) {
      return 'Votre commande pour la cueillette ' + pickup(w) + ' sera annulée' + (back ? ', et ' + back.split(' and ').map(refundBit).join(' et ') : '') + '.';
    }],
    /* ---------- waitlist ---------- */
    [/^at (.+)$/, function (m, t) { return /\d/.test(t) ? 'à ' + t : null; }],
    [/^You are already on the waitlist for (.+?), (any time|at .+|in the .+)\.$/, function (m, d, w) { return 'Vous êtes déjà sur la liste d’attente pour le ' + d + ', ' + T(w) + '.'; }],
    [/^There is a spot open at (.+) right now\.$/, 'Une place est libre à $1 en ce moment.'],
    [/^(.+?), (any time|at .+|in the (?:morning|midday|afternoon) \(.+\))$/, function (m, d, w) { return d + ', ' + T(w); }],
    /* ---------- tee rules ---------- */
    [/^(.+) membership does not include golf\.$/, 'La catégorie $1 n’inclut pas le golf.'],
    [/^(.+) members play (.+) on (weekdays|weekends and holidays)\.$/, function (m, t, w, k) { return 'Les membres ' + t + ' jouent ' + windowsFr(w) + ' ' + (k === 'weekdays' ? 'en semaine' : 'les fins de semaine et jours fériés') + '.'; }],
    [/^(?:Public tee times open|(.+) members can book) (\d+) days ahead\. This date opens on (.+)\.$/, function (m, t, n, d) {
      return (t ? 'Les membres ' + t + ' peuvent réserver ' : 'Les heures de départ publiques ouvrent ') + n + ' jours à l’avance. Cette date ouvre le ' + d + (/\.$/.test(d) ? '' : '.');
    }],
    /* ---------- feedback ---------- */
    [/^(\d+) holes · (.+) tee time$/, '$1 trous · départ à $2'],
    [/^(Breakfast|Lunch|Dinner)(?: at (.+))?$/, function (m, w, v) { return ({ Breakfast: 'Déjeuner', Lunch: 'Dîner', Dinner: 'Souper' })[w] + (v ? ' au ' + v : ''); }],
    [/^(.+) · table for (\d+)$/, '$1 · table pour $2'],
    [/^(.+?) · with (.+?)( · \d+ min)?$/, function (m, a, b, c) { return / · \d+ holes · \d+ golfers?$/.test(a) ? null : a + ' · avec ' + b + (c || ''); }],   /* the My bookings line has its own pattern */
    [/^(How was your (?:round|meal|lesson)\?) 1 is poor, 5 is excellent$/, function (m, q) { return T(q) + ' 1 signifie mauvais, 5 signifie excellent'; }],
    [/^([1-5]), (Poor|Fair|Good|Very good|Excellent)$/, function (m, n, l) { return n + ', ' + T(l); }],
    [/^You rated this (poor|fair|good|very good|excellent)\. You can change it until (.+)\.$/, function (m, l, d) { return 'Votre évaluation : ' + T(cap(l)).toLowerCase() + '. Vous pouvez la modifier jusqu’au ' + d + (/\.$/.test(d) ? '' : '.'); }],
    [/^Thank you\. You rated this (poor|fair|good|very good|excellent)\. You can change it or add a comment\.$/, function (m, l) { return 'Merci. Votre évaluation : ' + T(cap(l)).toLowerCase() + '. Vous pouvez la modifier ou ajouter un commentaire.'; }],
    /* ---------- beverage cart ---------- */
    [/^Hole (\d+)$/, 'Trou $1'],
    [/^Cart is restocking \((?:back in ~(\d+) min|back any minute)\)$/, function (m, n) { return 'La voiturette-bar se réapprovisionne (' + (n ? 'de retour dans ~' + n + ' min' : 'de retour d’une minute à l’autre') + ')'; }],
    [/^All (\d+) carts are restocking$/, 'Les $1 voiturettes-bars se réapprovisionnent'],
    [/^(\d+) carts on the course(?: \((\d+) restocking\))?$/, function (m, n, r) { return n + ' voiturettes-bars sur le parcours' + (r ? ' (' + r + ' en réapprovisionnement)' : ''); }],
    [/^(\d+) orders waiting$/, '$1 commandes en attente'],
    [/^(\d+) in line$/, '$1 en file'],
    [/^Grouped with (.+) (orders?)\. The cart stops once for your group\.$/, function (m, n, o) { return 'Regroupé avec ' + (o === 'order' ? 'la commande de ' : 'les commandes de ') + n.replace(/ and ([^,]+)$/, ' et $1') + '. La voiturette-bar s’arrête une seule fois pour votre groupe.'; }],
    [/^The cart knows you’re on hole (\d+) now$/, 'La voiturette-bar sait maintenant que vous êtes au trou $1'],
    [/^(?:(.+) is|The cart is) heading your way now\. Watch for the cart around (the clubhouse|the (\d+)(?:st|nd|rd|th) tee)\. Moved on\? (?:Tap “I’ve moved” below\.|Reply with your hole number\.)$/, function (m, who, w, n) {
      return (who ? who + ' se dirige' : CARTS.charAt(0).toUpperCase() + CARTS.slice(1) + ' se dirige') + ' vers vous. Surveillez la voiturette-bar ' + (n ? 'près du ' + ord(n) + ' tertre' : 'près du pavillon') + '. Vous avez changé de trou? Touchez « J’ai changé de trou » ci-dessous.';
    }],
    [/^(.+) · placed (.+)$/, function (m, e, t) { return T(e) + ' · passée à ' + t; }],
    [/^You're next! (.+) is on the way to you\.$/, 'Vous êtes le prochain! $1 est en route vers vous.'],
    [/^You're (next|\d+(?:st|nd|rd|th)) in line(?: for (.+)'s cart)?\.(?: (.+))?$/, function (m, p, who, rest) {
      var n = parseInt(p, 10);
      return 'Vous êtes ' + (p === 'next' ? 'le prochain' : ord(n)) + ' sur la liste' + (who ? ' de la voiturette-bar de ' + who : '') + '.' + (rest ? ' ' + restock(rest) : '');
    }],
    [/^(Delivered by|The cart came by with) (.+) at (.+)\. Enjoy the rest of your round\.$/, function (m, k, who, t) { return (k === 'Delivered by' ? 'Livrée par ' + who : 'La voiturette-bar est passée avec ' + who) + ' à ' + t + '. Bonne fin de partie.'; }],
    [/^(Delivered|The cart came by) at (.+)\. Enjoy the rest of your round\.$/, function (m, k, t) { return (k === 'Delivered' ? 'Livrée' : 'La voiturette-bar est passée') + ' à ' + t + '. Bonne fin de partie.'; }],
    [/^Cart’s on its way\. Still on hole (\d+)\?$/, 'La voiturette-bar est en route. Toujours au trou $1?'],
    [/^Cart visit · (nothing bought|you’ll choose from the cart|.+)$/, function (m, x) { return 'Visite de la voiturette-bar · ' + (x === 'nothing bought' ? 'aucun achat' : x === 'you’ll choose from the cart' ? 'vous choisirez sur place' : x); }],
    [/^Location off: the cart is using hole (\d+)$/, 'Localisation désactivée : la voiturette-bar se fie au trou $1'],
    [/^(Items you add here turn your cart visit into an order|New items are added to your open order)(, on your account\.|, paid at the cart\.)$/, function (m, a, b) {
      return (a.indexOf('Items') === 0 ? 'Les articles ajoutés ici transforment votre visite de la voiturette-bar en commande' : 'Les nouveaux articles s’ajoutent à votre commande ouverte') + (b.indexOf('account') >= 0 ? ', à votre compte.' : ', payés à la voiturette-bar.');
    }],
    [/^(Today|Yesterday)(, .+)?$/, function (m, d, r) { return T(d) + (r || ''); }],
    [/^(Visited|Delivered) at (.+)$/, function (m, k, t) { return (k === 'Visited' ? 'Visitée' : 'Livrée') + ' à ' + t; }],
    [/^(\d+) orders?$/, function (m, n) { return pl(n, 'commande', 'commandes'); }],
    [/^Ordering opens at your (.+) tee time\.$/, 'Les commandes ouvrent à votre heure de départ, $1.'],
    [/^You teed off( on the 10th tee)? at (.+), so you’re probably on hole (\d+) by now\. Change it if you’re elsewhere\.$/, function (m, ten, t, h) { return 'Vous êtes parti' + (ten ? ' du 10e tertre' : '') + ' à ' + t + ' : vous êtes probablement au trou ' + h + ' maintenant. Modifiez-le si vous êtes ailleurs.'; }],
    [/^Your order is in\. (.+)$/, function (m, s) { return 'Votre commande est passée. ' + T(s); }],
    [/^The cart is coming to you\. (.+)$/, function (m, s) { return 'La voiturette-bar s’en vient. ' + T(s); }],
    [/^Thanks\. (?:(.+) knows|The cart knows) (your group is|you’re) on hole (\d+)$/, function (m, who, g, h) { return 'Merci. ' + (who ? who + ' sait' : 'La voiturette-bar sait') + ' que ' + (g === 'your group is' ? 'votre groupe est' : 'vous êtes') + ' au trou ' + h; }],
    [/^Thanks\. The cart knows you’re on hole (\d+)$/, 'Merci. La voiturette-bar sait que vous êtes au trou $1'],
    [/^(.+) (has|have) just sold out and came off your order$/, function (m, i, h) { return i + (h === 'has' ? ' vient d’être épuisé et a été retiré' : ' viennent d’être épuisés et ont été retirés') + ' de votre commande'; }],
    [/^(.+)\. Nothing has been charged\.$/, '$1. Rien n’a été facturé.'],
    [/^(.+) has just sold out\. Please remove it and try again\.$/, '$1 vient d’être épuisé. Veuillez le retirer et réessayer.'],
    [/^You can order up to (\d+) of each item(, including your open order\.|\.)$/, function (m, n, x) { return 'Vous pouvez commander jusqu’à ' + n + ' de chaque article' + (x === '.' ? '.' : ', y compris votre commande ouverte.'); }],
    [/^(.+) has sold out, so you can keep or reduce it but not add more\.$/, '$1 est épuisé : vous pouvez le garder ou en réduire la quantité, mais pas en ajouter.'],
    [/^(Your cart visit|Your cart order): (.+)$/, function (m, k, s) { return T(k) + ' : ' + T(s); }],
    [/^Order or call the cart\. (.+)$/, function (m, s) { return 'Commander ou appeler la voiturette-bar. ' + T(s); }]
  ];

  /** "today at 13 h" / "jeudi 5 nov. at 13 h" -> "aujourd’hui à 13 h" / "le jeudi 5 nov. à 13 h" (takeout pickups). */
  function pickup(w) {
    var m = /^(.+) at (.+)$/.exec(w);
    if (!m) return w;
    var d = /^today$/i.test(m[1]) ? 'aujourd’hui' : 'le ' + F(m[1]);
    return d + ' à ' + F(m[2]);
  }
  function refundBit(s) {
    var m;
    if ((m = /^(.+) goes back on the gift card$/.exec(s))) return m[1] + ' sera remis sur la carte-cadeau';
    if ((m = /^(.+) is credited to your member account$/.exec(s))) return m[1] + ' sera crédité à votre compte de membre';
    if ((m = /^(.+) is refunded to your (.+)$/.exec(s))) return m[1] + ' sera remboursé sur votre ' + card(m[2]);
    return s;
  }
  function restock(s) {
    var m = /^(?:(.+) is|The cart is) restocking at the clubhouse and (will be back out shortly|will be back out in about (\d+) min|should be back out any minute)\.$/.exec(s);
    if (!m) return T(s);
    var who = m[1] ? m[1] + ' se réapprovisionne' : 'La voiturette-bar se réapprovisionne';
    return who + ' au pavillon et ' + (m[3] ? 'sera de retour dans environ ' + m[3] + ' min.' : /shortly/.test(m[2]) ? 'sera de retour sous peu.' : 'devrait être de retour d’une minute à l’autre.');
  }

  Object.keys(S).forEach(function (k) { S[k] = nb(S[k]); });
  P = P.map(function (p) {
    var r = p[1];
    return [p[0], typeof r === 'function' ? function () { var o = r.apply(null, arguments); return o == null ? arguments[0] : nb(o); } : nb(r)];
  });
  var dict = { strings: S, patterns: P };
  if (window.Club && Club.i18n && typeof Club.i18n.add === 'function') Club.i18n.add(dict);
  else window.__i18nQueue = (window.__i18nQueue || []).concat([dict]);
})();
