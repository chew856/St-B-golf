/* Staff: "Scan card" with the device camera, for the members' digital membership card (js/portal/card.js).
   The card's QR code holds "STB-M-<member number>" (Club.members.cardCode). A barcode scanner that types the code
   (keyboard wedge) needs nothing from here: the search boxes take the code as typed. This file only adds the camera
   way, and only where the browser can read QR codes itself (BarcodeDetector: Chrome on Android, ChromeOS, macOS).
   Elsewhere (Safari, Firefox) supported() is false and the button is never shown; there is no fallback reader.
   Club.cardScan.supported() -> boolean
   Club.cardScan.button(cls) -> '<button ... data-card-scan>' HTML, or '' where unsupported
   Club.cardScan.open(onMember(member)) -> opens the camera dialog; calls onMember once with the member found. */
(function () {
  const ui = Club.ui, esc = ui.esc;

  function supported() {
    return typeof window.BarcodeDetector === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
  }
  function button(cls) {
    if (!supported()) return '';
    return '<button type="button" class="btn btn-ghost btn-icon ' + esc(cls || '') + '" data-card-scan aria-label="Scan membership card" title="Scan membership card">' + Club.icon('scan') + '</button>';
  }

  function open(onMember) {
    if (!supported()) return null;
    let stream = null, timer = null, done = false, detector = null;
    const d = ui.modal({ title: 'Scan membership card', eyebrow: 'Camera', body:
      '<div class="cscan"><video class="cscan-video" playsinline muted autoplay></video><span class="cscan-frame" aria-hidden="true"></span></div>' +
      '<p class="cscan-msg" role="status">Hold the member’s card code inside the square.</p>',
      onClose: stop });
    if (d.duplicate) return d;
    const video = ui.$('.cscan-video', d.body), msg = ui.$('.cscan-msg', d.body);
    function stop() {
      done = true; clearTimeout(timer);
      if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* already stopped */ } });
      stream = null;
    }
    function tick() {
      if (done) return;
      detector.detect(video).then(function (codes) {
        if (done) return;
        const raw = (codes || []).map(function (c) { return c.rawValue; }).find(function (v) { return /^stb/i.test(String(v || '').trim()); });
        const m = raw ? Club.members.fromCode(raw) : null;
        if (m) { stop(); d.close(); onMember(m); return; }
        if (raw) msg.textContent = 'That card code does not match a member: ' + raw;
        timer = setTimeout(tick, 250);
      }).catch(function () { if (!done) timer = setTimeout(tick, 400); });
    }
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); }
    catch (e) { msg.textContent = 'This browser cannot read QR codes. Type the member number instead.'; return d; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      if (done) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; video.srcObject = s;
      const go = function () { if (!done) tick(); };
      if (video.readyState >= 2) go(); else video.addEventListener('loadeddata', go, { once: true });
    }).catch(function () {
      msg.textContent = 'The camera is not available. Allow camera access, or type the member number instead.';
    });
    return d;
  }

  Club.cardScan = { supported: supported, button: button, open: open };
})();
