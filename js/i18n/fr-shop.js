/* French (Canada) for the online golf shop on the public site and in the members' portal (js/core/shop.js, js/public/shop.js,
   js/portal/shop.js), its receipts, and the promo code box it uses (js/core/promos.js). Same pattern as fr-shared.js: exact
   English strings (trimmed text of a text node, placeholder, aria-label, title or alt) and regex patterns for text with names,
   numbers, dates or amounts inside (those parts are already French in French mode, e.g. "16,80 $", "9 h 14").
   Product names, brands and staff-written descriptions stay as staff typed them (marked data-i18n-skip in the shop view).
   Vocabulary: boutique du pro (golf shop), panier (basket), cueillette (pickup), commande (order), code promo. */
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
  /** "Visa ending 4242" -> "Visa se terminant par 4242"; "Gift card ending 7KQ2 and Visa ending 4242" -> both parts. */
  function card(s) {
    return String(s).split(' and ').map(function (x) {
      var m = /^(.+?) ending ([0-9A-Z]{4})$/.exec(x);
      return m ? T(m[1]) + ' se terminant par ' + m[2] : T(x === 'member account' ? 'Member account' : x);
    }).join(' et ');
  }
  var CAT = { Balls: 'balles', Apparel: 'vêtements', Headwear: 'casquettes et chapeaux', Accessories: 'accessoires', Footwear: 'chaussures', Clubs: 'bâtons' };
  function refundBit(s) {
    var m;
    if ((m = /^(.+) goes back on the gift card$/.exec(s))) return m[1] + ' sera remis sur la carte-cadeau';
    if ((m = /^(.+) is credited to your member account$/.exec(s))) return m[1] + ' sera crédité à votre compte de membre';
    if ((m = /^(.+) is refunded to your (.+)$/.exec(s))) return m[1] + ' sera remboursé sur votre ' + card(m[2]);
    return s;
  }

  var S = {
    /* ---------- Page and navigation ---------- */
    'Shop': 'Boutique',
    'Basket': 'Panier',
    'My orders': 'Mes commandes',
    'All': 'Tout',
    'Golf shop': 'Boutique du pro',
    'Shop online': 'Magasiner en ligne',
    'St. Boniface golf shop': 'Boutique du pro St. Boniface',
    'Online golf shop': 'Boutique du pro en ligne',
    'Golf balls, club apparel and accessories from our golf shop. Order online and pick up at the golf shop.': 'Balles de golf, vêtements du club et accessoires de notre boutique du pro. Commandez en ligne et récupérez votre commande à la boutique du pro.',
    'Order from the golf shop and pick it up at the clubhouse. Charge it to your account or pay by card.': 'Commandez à la boutique du pro et récupérez votre commande au pavillon. Portez-la à votre compte ou payez par carte.',

    /* ---------- Browse ---------- */
    'Balls': 'Balles',
    'Apparel': 'Vêtements',
    'Headwear': 'Casquettes et chapeaux',
    'Accessories': 'Accessoires',
    'Footwear': 'Chaussures',
    'Clubs': 'Bâtons',
    'Category': 'Catégorie',
    'Pickup only, at the golf shop. No shipping or delivery.': 'Cueillette seulement, à la boutique du pro. Aucune expédition ni livraison.',
    'Search the shop': 'Rechercher dans la boutique',
    'In stock': 'En stock',
    'Nothing matches your search': 'Aucun article ne correspond à votre recherche',
    'Try another word, or browse all categories.': 'Essayez un autre mot ou parcourez toutes les catégories.',
    'The online shop is being stocked': 'La boutique en ligne est en préparation',
    'Show everything': 'Tout afficher',
    'Your basket': 'Votre panier',
    'Check out': 'Passer à la caisse',
    'Your basket is empty. Add items, then pick them up at the golf shop.': 'Votre panier est vide. Ajoutez des articles, puis récupérez-les à la boutique du pro.',
    'View basket': 'Voir le panier',
    'Added to your basket': 'Ajouté à votre panier',
    'Your basket was updated': 'Votre panier a été mis à jour',
    'You can order up to 10 of each item online.': 'Vous pouvez commander jusqu’à 10 exemplaires de chaque article en ligne.',
    'This item is no longer sold online.': 'Cet article n’est plus vendu en ligne.',

    /* ---------- Item page ---------- */
    'Back to the shop': 'Retour à la boutique',
    'This item is not available online': 'Cet article n’est pas offert en ligne',
    'plus tax': 'plus taxes',
    'Add to basket': 'Ajouter au panier',
    'Quantity': 'Quantité',
    'One fewer': 'Un de moins',
    'One more': 'Un de plus',
    'Same price as in the golf shop. Tax is added at checkout.': 'Même prix qu’à la boutique du pro. Les taxes s’ajoutent au paiement.',
    'More clubs': 'Autres bâtons',

    /* ---------- Basket and checkout ---------- */
    'Keep shopping': 'Continuer à magasiner',
    'Pickup at the golf shop': 'Cueillette à la boutique du pro',
    'Left to pay': 'Reste à payer',
    'Prices are the same as in the golf shop, before tax. Tax is added here, and the total includes it.': 'Les prix sont les mêmes qu’à la boutique du pro, avant taxes. Les taxes s’ajoutent ici et sont comprises dans le total.',
    'Checkout': 'Finaliser la commande',
    'Pickup and payment': 'Cueillette et paiement',
    'The golf shop calls if there is a question about your order.': 'La boutique du pro vous appellera s’il y a une question au sujet de votre commande.',
    'Questions about your order? Call the golf shop at': 'Des questions sur votre commande? Appelez la boutique du pro au',
    'Your basket is empty': 'Votre panier est vide',
    'Your basket is empty.': 'Votre panier est vide.',
    'Browse the golf shop online and pick up your order at the clubhouse.': 'Parcourez la boutique du pro en ligne et récupérez votre commande au pavillon.',
    'Browse the shop': 'Parcourir la boutique',
    'Promo codes are not available on member orders.': 'Les codes promo ne s’appliquent pas aux commandes des membres.',

    /* ---------- Orders ---------- */
    'No online orders yet': 'Aucune commande en ligne pour l’instant',
    'Orders you place in the online golf shop appear here, with their status and receipt.': 'Les commandes passées dans la boutique du pro en ligne s’affichent ici, avec leur état et leur reçu.',
    'Orders placed as a guest on this device appear here. Sign in to see orders on any device.': 'Les commandes passées en tant qu’invité sur cet appareil s’affichent ici. Connectez-vous pour voir vos commandes sur tous vos appareils.',
    'That order is not available': 'Cette commande n’est pas disponible',
    'It may belong to another account. Your orders are under My orders.': 'Elle appartient peut-être à un autre compte. Vos commandes se trouvent sous Mes commandes.',
    'Cancel this order': 'Annuler cette commande',
    'Current': 'En cours',
    'Past orders': 'Commandes passées',
    'Ready at the golf shop': 'Prête à la boutique du pro',
    'We are getting it ready': 'Nous la préparons',
    'Cancelled and refunded': 'Annulée et remboursée',
    'Details': 'Détails',
    'This order was cancelled': 'Cette commande a été annulée',
    'Thank you, your order is in': 'Merci, votre commande est reçue',
    'We will set it aside at the golf shop. This page shows Ready for pickup when it is waiting for you.': 'Nous la mettrons de côté à la boutique du pro. Cette page indiquera Prête pour la cueillette lorsqu’elle vous attendra.',
    'It is waiting for you at the golf shop counter.': 'Elle vous attend au comptoir de la boutique du pro.',
    'The refund went back to how you paid.': 'Le remboursement a été fait selon votre mode de paiement.',
    'Thank you for shopping with us.': 'Merci d’avoir magasiné avec nous.',
    'Print or save receipt': 'Imprimer ou enregistrer le reçu',
    'Golf shop orders': 'Commandes de la boutique du pro',
    'Online shop orders': 'Commandes de la boutique en ligne',
    'No online shop orders yet': 'Aucune commande en ligne pour l’instant',
    'Order golf balls, apparel and accessories online, and pick them up at the golf shop.': 'Commandez des balles de golf, des vêtements et des accessoires en ligne, et récupérez-les à la boutique du pro.',
    'Cancelled online.': 'Annulée en ligne.',
    'Cancelled by the golf shop.': 'Annulée par la boutique du pro.',
    'Nothing to pay': 'Rien à payer',
    /* Pay at pickup (Nov 12) */
    'Pay at pickup': 'Payer à la cueillette',
    'Pay at the golf shop when you pick up your order, by card, cash or gift card. Nothing is charged now.': 'Payez à la boutique du pro lorsque vous récupérez votre commande, par carte, en argent comptant ou par carte-cadeau. Aucun montant n’est facturé maintenant.',
    'Place order · pay at pickup': 'Passer la commande · payer à la cueillette',
    'Cancelled, nothing was charged': 'Annulée, aucun montant facturé',

    /* ---------- Promo code box (js/core/promos.js) ---------- */
    'Have a promo code?': 'Vous avez un code promo?',
    'Promo code': 'Code promo',
    'Enter code': 'Entrez le code',
    'Enter a promo code.': 'Entrez un code promo.',
    'We don’t recognize that promo code. Please check it and try again.': 'Nous ne reconnaissons pas ce code promo. Vérifiez-le et réessayez.',
    'This code can’t be used in the online shop.': 'Ce code ne peut pas être utilisé dans la boutique en ligne.',
    'This code is for the online golf shop only.': 'Ce code est réservé à la boutique du pro en ligne.',
    'This code has expired.': 'Ce code est expiré.',
    'This code has reached its limit.': 'Ce code a atteint sa limite d’utilisation.',
    'You have already used this code.': 'Vous avez déjà utilisé ce code.',
    'This code doesn’t apply to anything in this order.': 'Ce code ne s’applique à aucun article de cette commande.',
    'This code doesn’t apply to this order.': 'Ce code ne s’applique pas à cette commande.',
    'That promo code no longer applies.': 'Ce code promo ne s’applique plus.'
  };

  var P = [
    /* ---------- browse ---------- */
    [/^Only (\d+) left$/, function (m, n) { return +n === 1 ? 'Plus que 1 en stock' : 'Plus que ' + n + ' en stock'; }],
    [/^View all (\d+) items$/, 'Voir les $1 articles'],
    [/^Please check back soon, or visit the golf shop at (.+)\.$/, 'Revenez bientôt ou visitez la boutique du pro au $1.'],
    [/^Add (.+) to basket$/, 'Ajouter $1 au panier'],
    [/^(\d+) items? · (.+)$/, function (m, n, a) { return pl(n, 'article', 'articles') + ' · ' + a; }],
    [/^Total (.+\d.*)$/, 'Total $1'],
    [/^(\d+) added to your basket$/, '$1 ajoutés à votre panier'],
    [/^(.+) removed from your basket$/, '$1 retiré de votre panier'],
    [/^Only (\d+) of (.+) in stock\.$/, 'Il ne reste que $1 exemplaire(s) de $2 en stock.'],
    [/^(.+) is sold out\.$/, '$1 est épuisé.'],
    [/^(.+) is no longer sold online and was taken out of your basket\.$/, '$1 n’est plus vendu en ligne et a été retiré de votre panier.'],
    [/^(.+) just sold out and was taken out of your basket\.$/, '$1 vient d’être épuisé et a été retiré de votre panier.'],
    [/^Only (\d+) of (.+) left\. Your basket was updated\.$/, 'Il ne reste que $1 exemplaire(s) de $2. Votre panier a été mis à jour.'],
    [/^(.+) just sold out$/, '$1 vient d’être épuisé'],
    /* ---------- item page ---------- */
    [/^It may have been taken off the online shop\. The golf shop may still have it: call (.+)\.$/, 'Il a peut-être été retiré de la boutique en ligne. La boutique du pro l’a peut-être encore : appelez le $1.'],
    [/^Sold out online\. Call the golf shop at (.+) to ask when it will be back\.$/, 'Épuisé en ligne. Appelez la boutique du pro au $1 pour savoir quand il sera de retour.'],
    [/^You have (\d+) in your basket, all we can sell online right now\.$/, 'Vous en avez $1 dans votre panier, soit tout ce que nous pouvons vendre en ligne pour le moment.'],
    [/^(\d+) in your basket\.$/, '$1 dans votre panier.'],
    [/^Pickup at the golf shop, (.+)\. No shipping\.$/, 'Cueillette à la boutique du pro, $1. Aucune expédition.'],
    [/^Item ([A-Z]{2}-\d+)$/, 'Article $1'],
    [/^More in (Balls|Apparel|Headwear|Accessories|Footwear|Clubs)$/, function (m, c) { return 'Autres ' + CAT[c]; }],
    /* ---------- basket and checkout ---------- */
    [/^Remove (.+)$/, function (m, n) { return /^(a |an |the |this )/i.test(n) ? null : 'Retirer ' + n; }],
    [/^Promo code ([A-Z0-9]+)$/, 'Code promo $1'],
    [/^(.+)\. We set your order aside at the counter\. My orders shows Ready for pickup when it is waiting for you\. No shipping or delivery\.$/, '$1. Nous mettons votre commande de côté au comptoir. Mes commandes indiquera Prête pour la cueillette lorsqu’elle vous attendra. Aucune expédition ni livraison.'],
    [/^(.+)\. Give your name or order number at the counter\. No shipping or delivery\.$/, '$1. Donnez votre nom ou votre numéro de commande au comptoir. Aucune expédition ni livraison.'],
    [/^Your account cannot take charges right now\. Please pay by card, or call the club office at (.+)\.$/, 'Votre compte ne peut pas recevoir de frais pour le moment. Veuillez payer par carte ou appeler le bureau du club au $1.'],
    [/^We could not place your order\. You have not been charged\. Please call the golf shop at (.+)\.$/, 'Nous n’avons pas pu passer votre commande. Aucun montant ne vous a été facturé. Veuillez appeler la boutique du pro au $1.'],
    [/^Sorry, (.+) just sold out\. It has been taken out of your basket\. You have not been charged\.$/, 'Désolé, $1 vient d’être épuisé. Il a été retiré de votre panier. Aucun montant ne vous a été facturé.'],
    [/^Only (\d+) of (.+) left now\. Your basket has been updated\. You have not been charged\.$/, 'Il ne reste plus que $1 exemplaire(s) de $2. Votre panier a été mis à jour. Aucun montant ne vous a été facturé.'],
    [/^(.+) is no longer sold online\. It has been taken out of your basket\.$/, function (m, n) { return (n === 'An item' ? 'Un article' : n) + ' n’est plus vendu en ligne. Il a été retiré de votre panier.'; }],
    [/^(.+) It has been removed from this order\.$/, function (m, r) { return T(r) + ' Il a été retiré de cette commande.'; }],
    /* ---------- orders and receipts ---------- */
    [/^Order (W-\d+) · (Today), (.+)$/, 'Commande $1 · Aujourd’hui, $3'],
    [/^Order (W-\d+) · (.+)$/, 'Commande $1 · $2'],
    [/^Order (W-\d+)$/, 'Commande $1'],
    [/^Order (W-\d+) (placed|cancelled)$/, function (m, c, w) { return 'Commande ' + c + (w === 'placed' ? ' passée' : ' annulée'); }],
    [/^Cancel order (W-\d+)\?$/, 'Annuler la commande $1?'],
    [/^Your order will be cancelled(?:, and (.+))?\.$/, function (m, back) { return 'Votre commande sera annulée' + (back ? ', et ' + back.split(' and ').map(refundBit).join(' et ') : '') + '.'; }],
    [/^The golf shop already has this order ready\. Please call (.+) to change it$/, 'La boutique du pro a déjà préparé cette commande. Veuillez appeler le $1 pour la modifier'],
    [/^(.+\d.*) refunded$/, '$1 remboursé'],
    [/^(.+\d.*) to pay at the golf shop counter when you collect your order, by card, cash or gift card\. Nothing is charged until then\.$/, '$1 à payer au comptoir de la boutique du pro lorsque vous récupérez votre commande, par carte, en argent comptant ou par carte-cadeau. Rien n’est facturé d’ici là.'],
    [/^(.+\d.*) · Pay at pickup$/, '$1 · À payer à la cueillette'],
    [/^(.+\d.*) · Paid at pickup · (.+)$/, function (m, a, l) { return a + ' · Payée à la cueillette · ' + payWord(l); }],
    [/^Paid at pickup at the golf shop\. Order (W-\d+)\.(?: Discount: (.+)\.)?$/, function (m, c, d) { return 'Payée à la cueillette à la boutique du pro. Commande ' + c + '.' + (d ? ' Rabais : ' + d + '.' : ''); }],
    [/^(Gift card ending \w{4}) and (cash|card)$/, function (m, g, r) { return card(g) + ' et ' + (r === 'cash' ? 'argent comptant' : 'carte'); }],
    [/^(.+\d.*) · (Charged to your member account|Credit to your member account|.+ ending [0-9A-Z]{4}(?: and .+ ending [0-9A-Z]{4})?)$/, function (m, a, l) { return a + ' · ' + (/ending/.test(l) ? card(l) : T(l)); }],
    [/^Online shop order (W-\d+)( cancelled)?$/, function (m, c, x) { return 'Commande en ligne ' + c + ' de la boutique du pro' + (x ? ', annulée' : ''); }],
    [/^Pickup at the golf shop\. Order (W-\d+)\.$/, 'Cueillette à la boutique du pro. Commande $1.'],
    [/^Pickup at the golf shop\. Order (W-\d+)\. (.+)$/, function (m, c, rest) { return 'Cueillette à la boutique du pro. Commande ' + c + '. ' + splitParts(rest); }],
    [/^(Cancelled by the golf shop\.|Cancelled online\.) ((?:Gift card|.+ ending).+)$/, function (m, a, rest) { return T(a) + ' ' + splitParts(rest); }],
    [/^(Cancelled by the golf shop\.|Cancelled online\.) (.+)$/, function (m, a, r) { return T(a) + ' ' + r; }],
    [/^(Gift card ending \w{4}) and (member account|.+ ending \d{4})$/, function (m, g, r) { return card(g) + ' et ' + (r === 'member account' ? 'compte de membre' : card(r)); }],
    /* ---------- promo code box ---------- */
    [/^([A-Z0-9]+) · (.+) off$/, '$1 · $2 de rabais'],
    [/^(\d+)% off (.+)$/, function (m, n, w) { return n + ' % de rabais sur ' + promoWhat(w); }],
    [/^(.+\d.*) off (green fees|carts|add-ons|the online golf shop|.+ and .+)$/, function (m, a, w) { return a + ' de rabais sur ' + promoWhat(w); }],
    [/^This code starts on (.+)\.$/, 'Ce code est valide à partir du $1.'],
    [/^This code needs at least (.+) of eligible items\.$/, 'Ce code exige au moins $1 d’articles admissibles.'],
    [/^You have already used this code (\d+) times\.$/, 'Vous avez déjà utilisé ce code $1 fois.']
  ];
  /** "Gift card ending 9U2N: 20,00 $. Visa ending 4242: 170,38 $." (the split on a gift card receipt). */
  function splitParts(rest) {
    return rest.replace(/\.$/, '').split('. ').map(function (x) { var m = /^(.+ ending [0-9A-Z]{4}|Member account): (.+)$/.exec(x); return m ? card(m[1]) + ' : ' + m[2] : x; }).join('. ') + '.';
  }
  /** How an order paid at pickup was paid: "Cash", "Card", "Gift card ending 7KQ2 and cash". */
  function payWord(l) {
    var m = /^(Gift card ending \w{4})(?: and (cash|card))?$/.exec(l);
    if (m) return card(m[1]) + (m[2] ? ' et ' + (m[2] === 'cash' ? 'argent comptant' : 'carte') : '');
    return l === 'Cash' ? 'argent comptant' : l === 'Card' ? 'carte' : T(l);
  }
  function promoWhat(w) {
    var K = { 'green fees': 'les droits de jeu', 'carts': 'les voiturettes', 'add-ons': 'les options', 'the online golf shop': 'la boutique du pro en ligne' };
    return w.split(/, | and /).map(function (x) { return K[x] || x; }).join(', ').replace(/, ([^,]+)$/, ' et $1');
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
