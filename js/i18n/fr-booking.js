/* French (Canada) strings for booking extras on the public site and the members' portal (Nov 2026): add-ons
   (js/core/addons.js) on the public Players step and the portal player editor, the "Have a promo code?" box and its
   messages (js/core/promos.js), promo and free-booking lines on the payment step, confirmation and My bookings, and the
   gift card refund wording. Same pattern as fr-shared.js: exact strings match the trimmed text of a text node (or
   placeholder, aria-label, title, alt); patterns take text with names, money, dates or codes inside (already French in
   French mode, e.g. "35,00 $"). Add-on names are staff data: the three the club starts with are translated here; names
   staff add later stay as typed, like menu items. */
(function () {
  'use strict';
  var NB = ' ';
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
  /** "Visa ending 4242" -> "Visa se terminant par 4242". */
  function card(s) { var m = /^(.+?) ending ([0-9A-Z]{4})$/.exec(s); return m ? T(m[1]) + ' se terminant par ' + m[2] : T(s); }

  /* The add-ons the club starts with (Club.addons seed). */
  var ADDON = { 'Rental clubs': 'Location de bâtons', 'Pull cart': 'Chariot manuel', 'Pull cart rental': 'Location de chariot manuel', 'Sleeve of balls': 'Étui de trois balles' };
  /** "Rental clubs" / "Sleeve of balls x 2" -> French, or null when it is not a known add-on. */
  function addon(s) {
    var m = /^(.+?)(?: x (\d+)| \((\d+)\))?$/.exec(s);
    if (!m || !has(ADDON, m[1])) return null;
    return ADDON[m[1]] + (m[2] ? ' x ' + m[2] : m[3] ? ' (' + m[3] + ')' : '');
  }
  function who(s) { return s === 'you' ? 'vous' : s === 'guest' ? 'invité' : T(s); }
  /** Club.promos.describe: "20% off green fees and carts", "5,00 $ off the online golf shop". */
  var KIND = { 'green fees': 'les droits de jeu', 'carts': 'les voiturettes', 'add-ons': 'les suppléments', 'the online golf shop': 'la boutique de golf en ligne' };
  /* "applies to green fees and carts": à + les = aux. */
  var KIND_A = { 'green fees': 'aux droits de jeu', 'carts': 'aux voiturettes', 'add-ons': 'aux suppléments', 'the online golf shop': 'à la boutique de golf en ligne' };
  function kinds(list, map) {
    map = map || KIND;
    var parts = list.split(/, | and /), out = [];
    for (var i = 0; i < parts.length; i++) { if (!has(map, parts[i])) return null; out.push(map[parts[i]]); }
    return out.length < 2 ? out.join('') : out.slice(0, -1).join(', ') + ' et ' + out[out.length - 1];
  }
  function describe(s) {
    var m = /^(.+?) off (.+)$/.exec(s); if (!m) return null;
    var k = kinds(m[2]); return k ? m[1] + ' de rabais sur ' + k : null;
  }

  var S = {
    /* ---------- Add-ons: public Players step and portal player editor ---------- */
    'Add-ons': 'Suppléments',
    'Optional': 'Facultatif',
    'Paid with your green fees and waiting for you at the golf shop.': 'Payés avec vos droits de jeu et prêts pour vous à la boutique du pro.',
    'None added': 'Aucun ajouté',
    'You': 'Vous',
    'One fewer': 'Un de moins',
    'One more': 'Un de plus',
    'Charged to your account when the group checks in, with any cart fees. Pull carts come with your membership.': 'Porté à votre compte à l’enregistrement du groupe, avec les frais de voiturette. Le chariot manuel est inclus dans votre adhésion.',
    'Charged to your account when the group checks in, with any cart fees.': 'Porté à votre compte à l’enregistrement du groupe, avec les frais de voiturette.',
    'Your profile says you walk with your own pull cart. Add this only if you need to rent one.': 'Votre profil indique que vous marchez avec votre propre chariot. N’ajoutez ceci que si vous devez en louer un.',

    /* ---------- Promo code box (Club.promos.applyBox) and its messages ---------- */
    'Have a promo code?': 'Vous avez un code promo?',
    'Promo code': 'Code promo',
    'Enter code': 'Entrez le code',
    'Apply': 'Appliquer',
    'Remove': 'Retirer',
    'Cancel': 'Annuler',
    'Enter a promo code.': 'Entrez un code promo.',
    'We don’t recognize that promo code. Please check it and try again.': 'Nous ne reconnaissons pas ce code promo. Veuillez le vérifier et réessayer.',
    'This code can’t be used in the online shop.': 'Ce code ne peut pas être utilisé dans la boutique en ligne.',
    'This code is for the online golf shop only.': 'Ce code est réservé à la boutique de golf en ligne.',
    'This code has expired.': 'Ce code est expiré.',
    'This code has reached its limit.': 'Ce code a atteint sa limite d’utilisation.',
    'You have already used this code.': 'Vous avez déjà utilisé ce code.',
    'This code doesn’t apply to anything in this order.': 'Ce code ne s’applique à aucun article de cette commande.',
    'This code doesn’t apply to this order.': 'Ce code ne s’applique pas à cette commande.',
    'That promo code no longer applies.': 'Ce code promo ne s’applique plus.',

    /* ---------- Payment step and confirmation ---------- */
    'Your promo code covers this booking. There is nothing to pay.': 'Votre code promo couvre cette réservation. Vous n’avez rien à payer.',
    'Confirm booking': 'Confirmer la réservation',
    'Confirming your booking': 'Confirmation de votre réservation',
    'Cancel tee time': 'Annuler le départ',

    /* ---------- Holds (js/core/holds.js), head count cards, public guest details (Nov 9) ---------- */
    'Time left to complete booking': 'Temps restant pour réserver',
    'First name': 'Prénom',
    'Last name': 'Nom',
    'Please enter a first name.': 'Veuillez entrer un prénom.',
    'Please enter a last name.': 'Veuillez entrer un nom.',
    'Please enter a valid email address.': 'Veuillez entrer une adresse courriel valide.',
    'minutes': 'minutes',
    'seconds': 'secondes',
    'One minute left to complete your booking.': 'Il reste une minute pour terminer votre réservation.',
    'On hold': 'Retenue',
    'Email address': 'Adresse courriel',
    'Please use your guest’s own email address.': 'Veuillez utiliser l’adresse courriel de votre invité.',
    'Please complete your guests’ details': 'Veuillez compléter les coordonnées de vos invités',
    'Your hold on this time has ended. Please choose a time again.': 'Le délai pour réserver cette heure est écoulé. Veuillez choisir une heure de nouveau.'
  };
  S['Rental clubs'] = ADDON['Rental clubs'];
  S['Pull cart'] = ADDON['Pull cart'];
  S['Pull cart rental'] = ADDON['Pull cart rental'];
  S['Sleeve of balls'] = ADDON['Sleeve of balls'];

  var P = [
    /* Holds and time cards */
    [/^Holding (.+)$/, 'Retenue pour vous : $1'],
    [/^The time you choose is held for (\d+) minutes while you complete your booking\.$/, 'L’heure choisie est retenue pour vous pendant $1 minutes, le temps de terminer votre réservation.'],
    [/^When you continue, the time is held for (\d+) minutes while you add your group\.$/, 'Quand vous continuez, l’heure est retenue pour vous pendant $1 minutes, le temps d’ajouter votre groupe.'],
    [/^Your (\d+)-minute hold on (.+) has ended, so the time was released for other golfers\. Please choose a time again\.$/, 'Le délai de $1 minutes pour réserver $2 est écoulé : l’heure a été libérée pour les autres golfeurs. Veuillez choisir une heure de nouveau.'],
    [/^Your hold on (.+) has ended$/, 'Le délai pour réserver $1 est écoulé'],
    [/^Time left to complete booking: (\d+) minutes (\d+) seconds$/, 'Temps restant pour réserver : $1 minutes $2 secondes'],
    [/^(.+) is held for you while you do\. Your account lets you see, cancel and get receipts for your bookings\.$/, '$1 est retenue pour vous pendant ce temps. Votre compte vous permet de voir et d’annuler vos réservations et d’obtenir vos reçus.'],
    [/^Another golfer is completing a booking at (.+)\. Please choose another time, or try again in a few minutes\.$/, 'Un autre golfeur est en train de réserver ' + '$1' + '. Veuillez choisir une autre heure ou réessayer dans quelques minutes.'],
    [/^Guest (\d[\d\s ,]*\s?\$)$/, 'Invité : $1'],
    [/^(.+?), (Your booking|\d+ places?(?: left)?), (.+) per golfer$/, function (m, t, st, r) { return t + ', ' + T(st) + ', ' + r + ' par golfeur'; }],
    [/^(.+?), (\d+ spots?(?: left)?), guest green fee (.+)$/, function (m, t, st, f) { return t + ', ' + T(st) + ', droit de jeu invité ' + f; }],
    [/^(.+?), On hold$/, '$1, retenue'],
    /* Public guests: first name, last name and email */
    [/^Guest (\d+) first name$/, 'Prénom de l’invité $1'],
    [/^Guest (\d+) last name$/, 'Nom de l’invité $1'],
    [/^Guest (\d+) email address$/, 'Adresse courriel de l’invité $1'],
    [/^Guest (\d+), pays the green fee\. Their confirmation goes to this email\.$/, 'Invité $1, paie le droit de jeu. Sa confirmation sera envoyée à ce courriel.'],
    /* Add-ons */
    [/^(\d+) items? added$/, function (m, n) { return pl(n, 'article ajouté', 'articles ajoutés'); }],
    [/^(\d+) items? · (.+)$/, function (m, n, a) { return /\$$/.test(a) ? pl(n, 'article', 'articles') + ' · ' + a : null; }],
    [/^(.+\s\$) per player$/, '$1 par joueur'],
    [/^(.+\s\$) each$/, '$1 chacun'],
    /* "Rental clubs, Alex Morgan" (public lines), "Rental clubs, you" (portal fees), "Sleeve of balls (2)" */
    [/^(.+?), (.+)$/, function (m, a, b) {
      var x = addon(a);
      if (x) return x + ', ' + who(b);
      /* "Rental clubs, Sleeve of balls x 2, Pull cart": every part an add-on */
      var parts = m[0].split(', '), out = [];
      for (var i = 0; i < parts.length; i++) { var y = addon(parts[i]); if (!y) return null; out.push(y); }
      return out.join(', ');
    }],
    [/^(Rental clubs|Pull cart rental|Pull cart|Sleeve of balls)(?: x (\d+)| \((\d+)\))$/, function (m) { return addon(m[0]); }],
    /* Portal fee breakdown summary with a promo code: "2 items · WELCOME10" */
    [/^(\d+) items? · ([A-Z0-9]{3,16})$/, function (m, n, c) { return pl(n, 'article', 'articles') + ' · ' + c; }],

    /* Promo codes */
    [/^Promo code ([A-Z0-9]+)$/, 'Code promo $1'],
    /* A member's code that reduces nothing in their booking (js/portal/teetimes.js promoNoMatch) */
    [/^This code applies to (.+)\. (Your golf is covered by dues|There is nothing in this booking for it to reduce)\.$/, function (m, k, why) {
      var a = kinds(k, KIND_A); if (!a) return null;
      return 'Ce code s’applique ' + a + '. ' + (why === 'Your golf is covered by dues' ? 'Votre golf est compris dans votre cotisation.' : 'Rien dans cette réservation ne peut être réduit.');
    }],
    [/^Promo code ([A-Z0-9]+), (.+) off$/, 'Code promo $1, $2 de rabais'],
    [/^([A-Z0-9]+) · (.+) off$/, '$1 · $2 de rabais'],
    [/^Covered by promo code ([A-Z0-9]+)$/, 'Couvert par le code promo $1'],
    [/^Promo code ([A-Z0-9]+) saved you (.+)$/, 'Le code promo $1 vous a fait économiser $2'],
    [/^(.+?) off (.+)$/, function (m) { return describe(m[0]); }],
    [/^This code starts on (.+)\.$/, 'Ce code commence le $1.'],
    [/^This code isn’t valid for (.+)\.$/, 'Ce code n’est pas valide pour le $1.'],
    [/^This code isn’t valid on (.+)s\.$/, function (m, d) { return 'Ce code n’est pas valide le ' + String(d).split(' ')[0].replace(/s$/, '') + '.'; }],
    [/^This code is only valid for tee times (?:from (.+) to (.+)|from (.+)|before (.+))\.$/, function (m, a, b, c, d) {
      return 'Ce code n’est valide que pour les départs ' + (a ? 'de ' + a + ' à ' + b : c ? 'à partir de ' + c : 'avant ' + d) + '.';
    }],
    [/^You have already used this code (\d+) times\.$/, 'Vous avez déjà utilisé ce code $1 fois.'],
    [/^This code needs at least (.+) of eligible items\.$/, 'Ce code exige au moins $1 d’articles admissibles.'],
    [/^(.+) It has been removed from this (order|payment)\.$/, function (m, a, k) { return T(a) + (k === 'order' ? ' Il a été retiré de cette commande.' : ' Il a été retiré de ce paiement.'); }],

    /* My bookings payment line, in pieces: "213,80 $ ·", "Gift card ending 7KQ2 and Visa ending 4242", "· refunded 9 nov." */
    [/^· refunded (.+)$/, '· remboursé le $1'],

    /* Refunds of a booking paid partly or fully with a gift card (js/public/me.js) */
    [/^Your (.+) tee time on (.+) for (\d+) golfers? will be released, and (.+) goes back on your gift card ending in ([0-9A-Z]{4})(?: and (.+) is refunded to your (.+))?\.$/, function (m, t, d, n, g, l4, c, cl) {
      return 'Votre départ de ' + t + ' le ' + d + ' pour ' + pl(n, 'golfeur', 'golfeurs') + ' sera libéré, ' + g + ' sera remis sur votre carte-cadeau se terminant par ' + l4 +
        (c ? ' et ' + c + ' sera remboursé sur votre ' + card(cl) : '') + '.';
    }],
    [/^Cancelled\. (.+) goes back on your gift card ending in ([0-9A-Z]{4})(?: and (.+) is refunded to your (.+))?$/, function (m, g, l4, c, cl) {
      return 'Annulé. ' + g + ' sera remis sur votre carte-cadeau se terminant par ' + l4 + (c ? ' et ' + c + ' sera remboursé sur votre ' + card(cl) : '');
    }]
  ];

  Object.keys(S).forEach(function (k) { S[k] = nb(S[k]); });
  P = P.map(function (p) {
    var r = p[1];
    return [p[0], typeof r === 'function' ? function () { var o = r.apply(null, arguments); return o == null ? arguments[0] : nb(o); } : nb(r)];
  });
  var dict = { strings: S, patterns: P };
  if (window.Club && Club.i18n && typeof Club.i18n.add === 'function') Club.i18n.add(dict);
  else window.__i18nQueue = (window.__i18nQueue || []).concat([dict]);
})();
