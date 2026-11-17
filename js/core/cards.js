/* Club.cards: card entry with live brand detection and a card picture styled like the detected brand.
   Used by the members' portal (account payments) and the public booking page.
   Full card numbers are never returned for storage: validate() gives brand, last 4 and expiry only.

   const card = Club.cards.mount(containerEl, { onChange(state) {} });   // renders picture + fields
   const r = card.validate();   // { ok, errors: {field: msg}, card: { brand, brandName, last4, expMonth, expYear, name } }
   Club.cards.mark(brand, size) // small brand logo HTML for saved-card lists */
(function () {
  window.Club = window.Club || {};
  const esc = function (s) { return Club.ui.esc(s); };

  /* Order matters: more specific prefixes first. */
  const BRANDS = [
    { id: 'amex', name: 'American Express', re: /^3[47]/, lengths: [15], cvc: 4, gaps: [4, 10] },
    { id: 'diners', name: 'Diners Club', re: /^(36|38|30[0-5])/, lengths: [14, 16], cvc: 3, gaps: [4, 10] },
    { id: 'jcb', name: 'JCB', re: /^35(2[89]|[3-8])/, lengths: [16, 17, 18, 19], cvc: 3, gaps: [4, 8, 12] },
    { id: 'discover', name: 'Discover', re: /^(6011|65|64[4-9]|622(12[6-9]|1[3-9]\d|[2-8]\d\d|9[01]\d|92[0-5]))/, lengths: [16, 17, 18, 19], cvc: 3, gaps: [4, 8, 12] },
    { id: 'unionpay', name: 'UnionPay', re: /^62/, lengths: [16, 17, 18, 19], cvc: 3, gaps: [4, 8, 12] },
    { id: 'mastercard', name: 'Mastercard', re: /^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/, lengths: [16], cvc: 3, gaps: [4, 8, 12] },
    { id: 'visa', name: 'Visa', re: /^4/, lengths: [13, 16, 19], cvc: 3, gaps: [4, 8, 12] }
  ];
  const UNKNOWN = { id: 'unknown', name: 'Card', lengths: [16], cvc: 3, gaps: [4, 8, 12] };

  function detect(num) {
    const d = String(num || '').replace(/\D/g, '');
    if (!d) return UNKNOWN;
    return BRANDS.find(function (b) { return b.re.test(d); }) || UNKNOWN;
  }
  function luhn(d) {
    let sum = 0, dbl = false;
    for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; }
    return d.length > 0 && sum % 10 === 0;
  }
  function format(d, brand) {
    const max = Math.max.apply(null, brand.lengths);
    d = d.slice(0, max);
    let out = '';
    for (let i = 0; i < d.length; i++) { if (brand.gaps.indexOf(i) >= 0) out += ' '; out += d[i]; }
    return out;
  }
  /** Picture of the number: typed digits, the rest as dots, grouped like the brand prints it. */
  function display(d, brand) {
    const len = Math.max.apply(null, brand.lengths.filter(function (l) { return l <= 16; }).concat([brand.lengths[0]]));
    let out = '';
    for (let i = 0; i < len; i++) { if (brand.gaps.indexOf(i) >= 0) out += ' '; out += i < d.length ? d[i] : '•'; }
    return out;
  }

  /* Brand marks, drawn as small SVGs in each brand's colours. */
  function mark(id, h) {
    h = h || 28;
    switch (id) {
      case 'visa':
        return '<svg class="cc-mark" viewBox="0 0 64 22" style="height:' + h + 'px" aria-label="Visa"><text x="32" y="18" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="21" fill="currentColor" letter-spacing="1">VISA</text></svg>';
      case 'mastercard':
        return '<svg class="cc-mark" viewBox="0 0 48 30" style="height:' + h + 'px" aria-label="Mastercard"><defs><clipPath id="mcL"><circle cx="17" cy="15" r="13"/></clipPath></defs><circle cx="17" cy="15" r="13" fill="#EB001B"/><circle cx="31" cy="15" r="13" fill="#F79E1B"/><circle cx="31" cy="15" r="13" fill="#FF5F00" clip-path="url(#mcL)"/></svg>';
      case 'amex':
        return '<svg class="cc-mark" viewBox="0 0 60 30" style="height:' + h + 'px" aria-label="American Express"><rect x="1" y="1" width="58" height="28" rx="3" fill="#fff"/><text x="30" y="13" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="9" fill="#1F72CD" letter-spacing=".5">AMERICAN</text><text x="30" y="24" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="9" fill="#1F72CD" letter-spacing=".5">EXPRESS</text></svg>';
      case 'discover':
        return '<svg class="cc-mark" viewBox="0 0 84 22" style="height:' + h + 'px" aria-label="Discover"><text x="0" y="16" font-family="Arial, sans-serif" font-weight="800" font-size="15" fill="currentColor">DISC</text><circle cx="47" cy="11" r="7.5" fill="#FF6000"/><text x="56" y="16" font-family="Arial, sans-serif" font-weight="800" font-size="15" fill="currentColor">VER</text></svg>';
      case 'diners':
        return '<svg class="cc-mark" viewBox="0 0 44 30" style="height:' + h + 'px" aria-label="Diners Club"><circle cx="22" cy="15" r="13" fill="#fff"/><circle cx="17" cy="15" r="8.5" fill="none" stroke="#0079BE" stroke-width="2.6"/><circle cx="27" cy="15" r="8.5" fill="none" stroke="#0079BE" stroke-width="2.6"/></svg>';
      case 'jcb':
        return '<svg class="cc-mark" viewBox="0 0 54 30" style="height:' + h + 'px" aria-label="JCB"><rect x="1" y="2" width="16" height="26" rx="4" fill="#0B4EA2"/><rect x="19" y="2" width="16" height="26" rx="4" fill="#E21836"/><rect x="37" y="2" width="16" height="26" rx="4" fill="#00A651"/><text x="9" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="11" fill="#fff">J</text><text x="27" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="11" fill="#fff">C</text><text x="45" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="11" fill="#fff">B</text></svg>';
      case 'unionpay':
        return '<svg class="cc-mark" viewBox="0 0 56 30" style="height:' + h + 'px" aria-label="UnionPay"><path d="M6 2h16l-6 26H0z" fill="#E21836"/><path d="M20 2h16l-6 26H14z" fill="#00447C"/><path d="M34 2h16l-6 26H28z" fill="#007B84"/><text x="28" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="8.5" fill="#fff">UnionPay</text></svg>';
      default:
        return Club.icon('card', 'cc-mark cc-mark-generic');
    }
  }

  function html() {
    return '<div class="cc">' +
      '<div class="cc-stage" aria-hidden="true"><div class="cc-card" data-brand="unknown">' +
        '<div class="cc-face cc-front">' +
          '<div class="cc-top"><span class="cc-chip"></span><span class="cc-brand">' + mark('unknown', 30) + '</span></div>' +
          '<div class="cc-number">•••• •••• •••• ••••</div>' +
          '<div class="cc-bottom"><div><span class="cc-cap">Cardholder</span><span class="cc-name">Your name</span></div><div class="right"><span class="cc-cap">Expires</span><span class="cc-exp">MM/YY</span></div></div>' +
        '</div>' +
        '<div class="cc-face cc-back"><div class="cc-stripe"></div><div class="cc-sig"><span class="cc-cvc-show">•••</span></div><div class="cc-back-brand">' + mark('unknown', 24) + '</div></div>' +
      '</div></div>' +
      '<div class="cc-fields form-grid">' +
        '<div class="field span-2"><label for="cc-num">Card number *</label><div class="cc-num-wrap"><input class="input cc-in-num" id="cc-num" name="ccnumber" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"><span class="cc-num-mark"></span></div><span class="cc-detected field-hint" aria-live="polite"></span></div>' +
        '<div class="field span-2"><label for="cc-name">Name on card *</label><input class="input cc-in-name" id="cc-name" name="ccname" autocomplete="cc-name" placeholder="As shown on the card"></div>' +
        '<div class="field"><label for="cc-exp">Expiry *</label><input class="input cc-in-exp" id="cc-exp" name="ccexp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></div>' +
        '<div class="field"><label for="cc-cvc">Security code *</label><input class="input cc-in-cvc" id="cc-cvc" name="cccvc" inputmode="numeric" autocomplete="cc-csc" placeholder="3 digits" maxlength="4"></div>' +
      '</div></div>';
  }

  function mount(root, opts) {
    opts = opts || {};
    root.innerHTML = html();
    const $ = function (s) { return root.querySelector(s); };
    const card = $('.cc-card'), num = $('.cc-in-num'), nm = $('.cc-in-name'), exp = $('.cc-in-exp'), cvc = $('.cc-in-cvc');
    let brand = UNKNOWN;

    function setBrand(b) {
      if (b.id === brand.id) return;
      brand = b;
      card.dataset.brand = b.id;
      card.classList.remove('cc-swap'); void card.offsetWidth; card.classList.add('cc-swap');
      $('.cc-brand').innerHTML = mark(b.id, b.id === 'amex' ? 34 : 30);
      $('.cc-back-brand').innerHTML = mark(b.id, 24);
      $('.cc-num-mark').innerHTML = b.id === 'unknown' ? '' : mark(b.id, 18);
      $('.cc-detected').textContent = b.id === 'unknown' ? '' : b.name + ' detected';
      cvc.placeholder = b.cvc + ' digits';
      cvc.maxLength = b.cvc;
    }
    function digits() { return num.value.replace(/\D/g, ''); }
    function paint() {
      const d = digits();
      setBrand(detect(d));
      $('.cc-number').textContent = display(d, brand);
      $('.cc-name').textContent = nm.value.trim() ? nm.value.trim().toUpperCase().slice(0, 26) : 'Your name';
      $('.cc-exp').textContent = exp.value || 'MM/YY';
      $('.cc-cvc-show').textContent = cvc.value ? cvc.value.replace(/./g, '•') : '•••'.slice(0, brand.cvc) + (brand.cvc === 4 ? '•' : '');
      if (opts.onChange) opts.onChange({ brand: brand.id, brandName: brand.name, last4: d.slice(-4) });
    }

    num.addEventListener('input', function () {
      const pos = num.selectionStart, before = num.value.length;
      const d = digits();
      num.value = format(d, detect(d));
      const delta = num.value.length - before;
      try { num.setSelectionRange(pos + delta, pos + delta); } catch (e) { /* not focusable */ }
      paint();
    });
    nm.addEventListener('input', paint);
    exp.addEventListener('input', function (e) {
      let d = exp.value.replace(/\D/g, '').slice(0, 4);
      if (d.length === 1 && +d > 1) d = '0' + d;
      exp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : (d.length === 2 && e.inputType !== 'deleteContentBackward' ? d + '/' : d);
      paint();
    });
    cvc.addEventListener('input', function () { cvc.value = cvc.value.replace(/\D/g, '').slice(0, brand.cvc); paint(); });
    /* Amex prints its code on the front; every other brand on the back, so flip for them. */
    cvc.addEventListener('focus', function () { if (brand.id !== 'amex') card.classList.add('flipped'); });
    cvc.addEventListener('blur', function () { card.classList.remove('flipped'); });
    paint();

    /* An error under a field goes as soon as that field is changed (it used to stay until the next Pay press) */
    root.addEventListener('input', function (e) {
      const i = e.target; if ([num, nm, exp, cvc].indexOf(i) < 0 || !i.classList.contains('invalid')) return;
      i.classList.remove('invalid');
      const f = i.closest('.field'); if (f) f.querySelectorAll('.field-error').forEach(function (n) { n.remove(); });
    });
    function err(input, msg) {
      input.classList.add('invalid');
      const f = input.closest('.field'); if (f) f.insertAdjacentHTML('beforeend', '<span class="field-error">' + esc(msg) + '</span>');
    }
    return {
      el: root,
      brand: function () { return brand.id; },
      focus: function () { num.focus(); },
      reset: function () { num.value = nm.value = exp.value = cvc.value = ''; paint(); },
      validate: function () {
        root.querySelectorAll('.field-error').forEach(function (n) { n.remove(); });
        [num, nm, exp, cvc].forEach(function (i) { i.classList.remove('invalid'); });
        const errors = {};
        const d = digits();
        if (!d) errors.number = 'Enter your card number.';
        else if (brand.lengths.indexOf(d.length) < 0 || !luhn(d)) errors.number = 'That card number is not valid. Check the digits and try again.';
        if (!nm.value.trim()) errors.name = 'Enter the name shown on the card.';
        const m = /^(\d{2})\/(\d{2})$/.exec(exp.value);
        let mm = 0, yy = 0;
        if (!m) errors.exp = 'Enter the expiry as MM/YY.';
        else {
          mm = +m[1]; yy = 2000 + +m[2];
          const now = new Date(), endOfMonth = new Date(yy, mm, 0, 23, 59);
          if (mm < 1 || mm > 12) errors.exp = 'The month must be between 01 and 12.';
          else if (endOfMonth < now) errors.exp = 'This card has expired.';
          else if (yy > now.getFullYear() + 20) errors.exp = 'Check the expiry year.';
        }
        if (cvc.value.length !== brand.cvc) errors.cvc = 'Enter the ' + brand.cvc + '-digit security code' + (brand.id === 'amex' ? ' on the front of the card.' : ' on the back of the card.');
        if (errors.number) err(num, errors.number);
        if (errors.name) err(nm, errors.name);
        if (errors.exp) err(exp, errors.exp);
        if (errors.cvc) err(cvc, errors.cvc);
        const first = root.querySelector('.invalid'); if (first) first.focus();
        const ok = !Object.keys(errors).length;
        return { ok: ok, errors: errors, card: ok ? { brand: brand.id, brandName: brand.name, last4: d.slice(-4), expMonth: mm, expYear: yy, name: nm.value.trim() } : null };
      }
    };
  }

  Club.cards = { detect: function (n) { const b = detect(n); return { brand: b.id, brandName: b.name }; }, luhn: function (n) { return luhn(String(n).replace(/\D/g, '')); }, mark: mark, mount: mount, brands: BRANDS.map(function (b) { return { id: b.id, name: b.name }; }) };
})();
