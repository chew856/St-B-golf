/* Portal: Membership card (#/card). The digital card replaces the plastic one: the club's Membership Handbook (Credit
   policy) says each member is issued a membership card with their Club account number and shows it to charge purchases.
   Redesign (Nov 21, owner-approved): the page goes dark while the card is shown (body.mc-dark, removed on leaving).
   - The card: Fairway green with a double brass border (engraved look), the white St.B mark, the season it is for in
     brass capitals (the season under way or the last one, until the next opens; next season once the member has
     renewed for it, Club.billing.renewal), the member's name in the signature serif, the membership type (tier) in
     brass capitals, then Member (number) and Since (year, when on record), and the mark again as a faint watermark.
   - Below it, a Paper panel: the QR code, dark on Paper with its 4-module quiet zone, holding "STB-M-<member number>"
     (Club.members.cardCode), beside the card number in words. It is not a secret: it only names the member, as the
     number on the old card did. Staff scan it (a barcode scanner types it into any member search box, or Scan card on
     Chrome) or type the number by hand (js/core/app.js, Pro Shop, Dining). Drawn with the vendored qrcode-generator
     (js/vendor/qrcode-generator.js, MIT).
   - Charging suspended (Club.billing.standing(memberId).canCharge false): "Charging paused: <reason>" between the two.
   Entry points: Home quick actions, My account overview, the name menu and the phone Menu sheet (Account group).
   French: the "Membership card (Nov 21)" and "Redesign: card and dining (Nov 21)" blocks in js/i18n/fr-portal.js. */
(function () {
  'use strict';
  if (!window.Portal || !Portal.register) return;
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt;

  /** QR code as an SVG: one path of dark modules on a light square with a 4-module quiet zone (colours from tokens). */
  function qrSVG(text) {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), Z = 4, size = n + Z * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + Z) + ' ' + (r + Z) + 'h1v1h-1z';
    return '<svg class="mc-qr-svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' +
      '<rect class="mc-qr-bg" width="' + size + '" height="' + size + '"/><path class="mc-qr-ink" d="' + d + '"/></svg>';
  }

  /** The season the card is for: next season once renewed for it, else the one under way (or the last one). */
  function seasonYear(m) {
    const T = Club.date.today(), y = +T.slice(0, 4);
    let year = Club.season && T < Club.season.start(y) ? y - 1 : y;
    const R = Club.billing && Club.billing.renewal;
    const r = R && R.forMember ? R.forMember(m.id) : null;
    if (r && +r.season > year) year = +r.season;
    return year;
  }

  /** Why charging is paused, in the member's words (the staff wording is in Club.billing.standing().reason). */
  function pausedReason(m, st) {
    if (m.status === 'suspended') return 'Your membership is suspended.';
    if (m.status === 'resigned') return 'This membership has been resigned.';
    if (st.level) return fmt.money(st.amount) + ' is unpaid ' + st.days + ' days after the statement date.';
    return 'Please call the club office.';
  }

  function render(view, params, member) {
    const m = S.find('members', member.id) || member;
    const t = Club.members.tier(m);
    const code = Club.members.cardCode(m);
    const name = m.firstName + ' ' + m.lastName;
    const since = m.memberSince ? String(m.memberSince).slice(0, 4) : '';
    const st = Club.billing && Club.billing.standing ? Club.billing.standing(m.id) : null;
    const paused = st && !st.canCharge;
    const tier = t && t.name ? (/member/i.test(t.name) ? t.name : t.name + ' member') : 'Member';
    document.body.classList.add('mc-dark');
    view.innerHTML =
      '<div class="mc-wrap">' +
        '<h1 class="mc-eyebrow">Membership</h1>' +
        '<article class="mc-card" aria-labelledby="mc-name">' +
          '<span class="mc-mark" aria-hidden="true">' + Portal.crest('mc-mark-logo') + '</span>' +
          '<header class="mc-top">' + Portal.crest('mc-logo') +
            '<p class="mc-season"><span data-i18n-skip>' + esc(seasonYear(m)) + '</span> <span>Season</span></p></header>' +
          '<h2 class="mc-name" id="mc-name" data-i18n-skip>' + esc(name) + '</h2>' +
          '<p class="mc-tier">' + esc(tier) + '</p>' +
          '<dl class="mc-facts">' +
            '<div><dt>Member</dt><dd data-i18n-skip>' + esc(m.memberNo) + '</dd></div>' +
            (since ? '<div><dt>Since</dt><dd data-i18n-skip>' + esc(since) + '</dd></div>' : '') +
          '</dl>' +
        '</article>' +
        (paused ? '<div class="mc-paused" role="status">' + Club.icon('alert') + '<p><strong>Charging paused:</strong> <span>' + esc(pausedReason(m, st)) + '</span>' +
          (st.level && m.status !== 'suspended' && m.status !== 'resigned' ? ' <a href="#/account/pay">Make a payment</a>' : '') + '</p></div>' : '') +
        '<section class="mc-qrp" aria-labelledby="mc-code-l">' +
          '<div class="mc-qr" role="img" aria-label="' + esc('QR code ' + code) + '">' + qrSVG(code) + '</div>' +
          '<div class="mc-qrp-text">' +
            '<p class="mc-code-l" id="mc-code-l">Card number</p>' +
            '<p class="mc-code" data-i18n-skip>' + esc(code) + '</p>' +
            '<p class="mc-note">Show at the golf shop or the Gallery to charge to your account.</p>' +
          '</div>' +
        '</section>' +
      '</div>';
    /* Leaving the page (or signing out) puts the light page back */
    return function () { document.body.classList.remove('mc-dark'); };
  }

  Portal.register({ id: 'card', label: 'Membership card', short: 'Card', icon: 'idcard', order: 61, tab: false, nav: false, render: render });
  Portal.memberCard = { qrSVG: qrSVG, seasonYear: seasonYear };
})();
