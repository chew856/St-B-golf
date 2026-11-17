/* Course & Grounds: course status map, work orders, equipment fleet, golf carts, chemical log, weather & agronomy.
   Owns collections: workOrders, equipment, carts, chemicalLogs, agronomyReadings and $courseStatus. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
     Helpers
     ====================================================================== */
  const PRI = { urgent: ['Urgent', 'bad'], high: ['High', 'warn'], normal: ['Normal', 'info'], low: ['Low', 'plain'] };
  const PRI_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
  const COLS = [{ id: 'open', label: 'Open' }, { id: 'in-progress', label: 'In progress' }, { id: 'done', label: 'Done' }];
  const AREAS = ['Greens', 'Tees', 'Fairways', 'Rough', 'Bunkers', 'Irrigation', 'Cart paths', 'Short game practice facility', 'Clubhouse grounds', 'Maintenance facility'];
  const EQ_TYPES = ['Mower', 'Utility vehicle', 'Sprayer', 'Aerator', 'Other'];
  const EQ_STATUS = { 'in-service': ['In service', 'good'], 'in-shop': ['In shop', 'warn'], retired: ['Retired', 'plain'] };
  const CART_STATUS = { available: ['Available', 'good', 'Ready'], out: ['On course', 'info', 'Out'], charging: ['Charging', 'brass', 'Charging'], maintenance: ['Maintenance', 'bad', 'Shop'] };
  const CART_RULES = ['Normal', '90 degree', 'Cart path only', 'No carts'];
  const FIRMNESS = ['Soft', 'Medium', 'Firm', 'Very firm'];
  const UNITS = ['mL/100 m²', 'g/100 m²', 'kg/100 m²', 'L/ha', 'mL/ha', 'kg/ha'];

  function today() { return Club.date.today(); }
  function getStatus() {
    const st = S.getObj('courseStatus', null) || {};
    if (!Array.isArray(st.holes) || st.holes.length !== 18) { st.holes = []; for (let i = 1; i <= 18; i++) st.holes.push({ number: i, status: 'open' }); }
    return st;
  }
  function saveStatus(patch) { const st = Object.assign({}, getStatus(), patch, { updatedAt: new Date().toISOString() }); S.setObj('courseStatus', st); return st; }

  /* ---------------- Undo (js/core/undo.js) ----------------
     Every staff action's toast offers Undo. undoOffer is Club.undo.offer plus check(), which can refuse first: undo.js
     does not watch settings objects (S.setObj), so course conditions are checked here before they are put back. */
  const CHANGED = 'This has changed since, so it can no longer be undone here.';
  function undoOffer(msg, rec, o) {
    o = o || {};
    if (!rec || !rec.ops || !rec.ops.length) { ui.toast(msg, o.kind); return; }
    ui.toast(msg, o.kind, { action: { label: 'Undo', onClick: function () {
      const why = o.check && o.check(); if (why) { ui.toast(why, 'bad'); return; }
      const res = Club.undo.revert(rec);
      if (!res.ok) { ui.toast(res.msg, 'bad'); return; }
      try { if (o.after) o.after(res); } catch (e) { console.error(e); }
      ui.toast((typeof o.undone === 'function' ? o.undone(res) : o.undone) || 'Undone');
    } } });
  }
  function undoRun(fn, o) { const rec = Club.undo.track(fn); const msg = typeof o.message === 'function' ? o.message(rec.result) : o.message; if (msg) undoOffer(msg, rec, o); return rec.result; }
  function statusGuard() { const snap = JSON.stringify(S.getObj('courseStatus', null)); return function () { return JSON.stringify(S.getObj('courseStatus', null)) !== snap ? CHANGED : null; }; }
  function holeDoc(n) { return S.find('holes', 'hole_' + n) || { number: n, name: 'Hole ' + n, par: '', handicap: '', yards: {} }; }
  function isOverdue(w) { return w.status !== 'done' && w.dueDate && w.dueDate < today(); }
  function stamp(iso) {
    if (!iso) return 'Not yet updated';
    const d = new Date(iso); const day = Club.date.iso(d);
    return (day === today() ? 'Today' : fmt.dateShort(day)) + ' at ' + fmt.time(d);
  }
  function settle(root) {
    ui.$$('[data-reveal]', root).forEach(function (n) { n.classList.add('revealed'); });
    ui.$$('[data-count]:not([data-counted])', root).forEach(function (n) {
      n.setAttribute('data-counted', '');
      const dec = +(n.dataset.decimals || 0);
      n.textContent = (n.dataset.prefix || '') + (+n.dataset.count).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    });
    if (Club.charts && Club.charts.animate) Club.charts.animate(root);
  }
  function fieldError(form, name, msg) {
    const f = form.querySelector('[name="' + name + '"]'); if (!f) return;
    f.classList.add('invalid'); f.insertAdjacentHTML('afterend', '<span class="field-error">' + esc(msg) + '</span>');
  }
  function clearErrors(form) {
    ui.$$('.field-error', form).forEach(function (e) { e.remove(); });
    ui.$$('.invalid', form).forEach(function (e) { e.classList.remove('invalid'); });
  }
  function eqLabel(e) { return e ? e.unitNo + ' · ' + e.make + ' ' + e.model : ''; }
  function svcInfo(e) {
    const used = Math.max(0, (e.hours || 0) - (e.lastServiceHours || 0));
    const pct = e.serviceIntervalHours ? used / e.serviceIntervalHours : 0;
    const state = e.status === 'retired' ? 'retired' : pct >= 1 ? 'overdue' : pct >= 0.85 ? 'due' : 'ok';
    return { used: used, pct: pct, state: state, left: Math.round(e.serviceIntervalHours - used) };
  }
  function draggable() { return !('ontouchstart' in window); }
  function phone() { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }
  /* Pagination for long tables: "1 to 10 of 21" with page buttons */
  function pager(page, total, per) {
    const pages = Math.max(1, Math.ceil(total / per)); if (total <= per) return '';
    let html = '';
    for (let i = 1; i <= pages; i++) html += '<button type="button" class="cg-pager-n' + (i === page ? ' active' : '') + '" data-page="' + i + '"' + (i === page ? ' aria-current="page"' : '') + ' aria-label="Page ' + i + '">' + i + '</button>';
    return '<nav class="cg-pager" aria-label="Pages"><span class="cg-pager-info">' + ((page - 1) * per + 1) + ' to ' + Math.min(total, page * per) + ' of ' + total + '</span><div class="cg-pager-btns">' +
      '<button type="button" class="cg-pager-n" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">' + Club.icon('chevronLeft') + '</button>' + html +
      '<button type="button" class="cg-pager-n" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Next page">' + Club.icon('chevronRight') + '</button></div></nav>';
  }

  /* ======================================================================
     Course map (SVG)

     Source: City of Winnipeg Golf Lands Repurposing Study, "St. Boniface Golf Club, Site inventory & opportunities
     notes" (Fig. 6, HTFC Planning & Design with Vrbanic, aerial plan at 1:4,000). Each hole is the plan's black
     tee-to-green line: tee, dogleg points, green. Coordinates are plan units, x = (sheet x - 120) * 2 and
     y = (sheet y - 60) * 2 on the 792 x 612 sheet, which puts the property in a 1040 x 980 box. One unit is about
     1.19 yards: every hole's drawn line matches its Black yardage within 1%. The plan is drawn with north to the
     right and the map keeps that orientation (no rotation anywhere). Boundary = the plan's property line; river
     and ponds follow the aerial photo along the property line. The overview is drawn in the same yardage-book
     style as the hole pages, kept calm: holes, water, tree belts and four labels. Nothing here is invented, except
     hole 17's two greenside bunkers on its hole page, which CLUB.md describes.
     ====================================================================== */
  const PLAN = {
    w: 1040, h: 980, ydPerUnit: 1.194,
    // per hole, in play order: [tee (Black), ...dogleg points, green]
    holes: [
      [[944, 252], [891, 455], [852, 535]],
      [[910, 482], [857, 685], [864, 781]],
      [[827, 784], [632, 861], [526, 883]],
      [[486, 840], [684, 774], [786, 737]],
      [[824, 762], [804, 627]],
      [[788, 696], [585, 749], [520, 770]],
      [[532, 806], [322, 801], [295, 798]],
      [[262, 785], [469, 752], [540, 686]],
      [[561, 707], [746, 616], [834, 474], [857, 420]],
      [[830, 406], [708, 576], [561, 640]],
      [[516, 660], [319, 733], [158, 781], [132, 788]],
      [[145, 748], [275, 617]],
      [[255, 704], [447, 619], [606, 568], [660, 553]],
      [[713, 514], [541, 522]],
      [[538, 491], [334, 537], [275, 570]],
      [[254, 501], [444, 413], [496, 378]],
      [[476, 464], [685, 462], [826, 370], [872, 339]],
      [[927, 252], [883, 117]]
    ],
    boundary: [929,200,911,224,913,226,903,237,893,244,880,260,864,290,863,288,821,341,815,343,800,340,802,339,798,332,790,272,772,228,762,221,707,202,691,203,687,211,691,222,723,255,721,256,737,269,742,277,743,286,741,291,724,303,692,301,692,299,676,302,668,312,668,318,690,333,690,351,678,423,671,438,661,447,661,445,654,444,653,446,618,449,599,455,573,456,574,458,561,462,538,464,530,462,519,451,516,441,522,424,540,414,562,409,578,396,582,385,584,385,582,372,565,329,554,321,550,320,498,327,451,316,451,315,428,312,403,305,383,306,380,320,381,390,380,398,372,406,360,411,342,408,244,418,197,434,197,432,172,430,158,430,145,445,138,466,136,466,138,480,148,483,158,481,178,468,191,468,204,472,238,519,240,525,238,537,232,550,223,559,222,557,202,572,177,575,162,565,151,562,150,564,130,557,110,559,115,778,110,784,109,792,109,797,116,808,118,818,314,814,316,848,319,853,489,848,493,852,495,943,636,891,691,875,893,805,892,767,921,758,918,574,951,553,945,373,1007,370,1000,359,976,292,973,260,971,260,981,221,980,209,965,184,955,175,928,156,913,153,885,152,887,153,883,161,881,160,888,169,921,179,929,184,929,200],
    clubGrounds: [876,247,887,235,889,227,901,213,915,202,915,192,899,183,881,177,871,167,872,159,880,145,897,142,921,144,934,148,953,162,942,37,771,52],
    river: [1060,416,1020,390,1012,380,994,369,992,364,970,301,965,282,963,258,969,227,968,215,944,162,926,150,902,147,882,149,877,160,883,172,918,190,921,202,894,232,882,248,870,268,834,320,820,346,807,351,799,347,792,339,788,324,780,273,772,250,764,237,755,230,744,226,714,215,708,214,704,215,703,219,708,227,743,265,749,275,749,286,747,293,743,299,730,308,719,310,692,311,686,313,697,336,699,347,698,359,685,426,678,440,667,450,657,453,629,457,555,471,539,471,528,468,519,462,512,452,510,445,510,434,515,424,523,415,533,409,558,399,564,394,569,388,571,382,571,370,564,352,557,338,551,334,541,331,510,335,490,334,412,317,398,317,393,320,390,330,390,377,388,393,384,404,373,414,358,418,322,418,255,426,205,440,170,441,163,443,155,450,150,460,151,468,157,469,183,461,194,461,202,463,208,467,217,475,242,511,247,525,245,540,238,554,224,568,207,578,188,582,176,581,146,571,127,568,118,567,100,574,88,604,70,668,44,682,-120,720],
    ponds: [
      [700,486,712,470,728,452,746,436,766,428,784,430,796,438,804,424,816,412,830,408,840,414,842,432,836,456,824,472,808,478,796,472,784,462,770,468,754,480,734,490,714,494],
      [276,778,290,772,308,772,318,780,316,792,300,796,284,794,276,786]
    ],
    clubhouse: { at: [914, 76], size: [34, 22] },
    roads: [[732, 49, 1010, 21], [396, 1000, 1030, 778]],
    labels: [
      { t: 'Rue Youville', at: [850, 38], rot: -5.6, kind: 'road' },
      { t: 'Archibald St', at: [680, 900.5], rot: -19.2, kind: 'road' },
      { t: 'Seine River', at: [470, 292], rot: 3, kind: 'water' },
      { t: 'Clubhouse', at: [890, 80], kind: 'place', anchor: 'end' }
    ]
  };
  /* Tree masses (plus single trees as x, y, radius) and approximate marsh extents from the same plan. The hole
     page packs them densely; the overview map thins them to calm belts between the holes. */
  const PLAN_NATURE = {
    marsh: [
      [500,832,530,824,564,826,580,834,568,844,536,850,508,848],
      [536,902,570,890,610,880,634,880,624,894,590,908,556,916,536,914]
    ],
    trees: [
      [383,305,405,307,419,317,449,317,459,323,473,323,477,327,479,325,487,331,497,331,501,327,507,331,515,331,519,327,523,329,533,325,539,325,543,329,553,325,563,331,569,353,575,359,575,369,583,375,583,385,573,393,571,401,551,413,543,411,527,421,523,419,509,437,513,443,509,449,499,451,485,447,481,455,475,453,463,469,449,471,439,483,417,481,405,489,397,489,381,505,375,503,369,509,353,511,347,511,343,507,337,513,321,519,315,527,301,527,293,531,289,535,293,541,289,553,277,547,279,539,275,535,267,533,263,537,261,549,243,569,233,573,227,571,221,575,215,573,211,577,221,585,229,581,241,585,255,601,259,601,267,593,271,593,283,577,287,575,295,583,309,567,325,567,331,561,339,561,343,557,337,551,345,545,349,545,347,551,351,555,367,543,373,543,389,535,395,523,399,527,415,519,415,523,423,527,429,521,433,523,439,519,443,525,439,539,441,551,453,565,469,567,477,577,477,587,467,597,451,597,431,607,417,601,395,611,383,597,375,597,365,603,357,601,335,609,331,607,327,611,333,617,345,617,347,621,341,627,331,623,323,627,317,621,305,627,301,619,303,615,297,609,293,609,293,603,297,599,291,593,285,599,275,601,255,621,231,653,217,665,217,671,207,677,195,691,189,693,159,723,161,727,141,747,135,745,131,749,127,767,119,775,119,781,115,785,119,799,123,803,127,799,143,795,149,789,149,785,153,785,159,791,167,787,175,777,187,773,203,773,215,781,225,777,241,787,249,787,255,791,263,789,267,783,273,795,289,809,289,813,273,813,263,819,255,813,243,819,237,813,231,819,219,817,215,813,207,817,179,815,169,819,163,819,159,815,133,819,125,815,121,819,123,873,117,881,111,881,103,875,103,827,105,819,111,819,115,813,111,809,109,811,111,807,103,795,107,789,105,757,99,743,111,735,109,733,119,713,107,701,105,703,101,699,99,683,103,671,103,655,89,631,89,613,67,583,69,569,73,573,77,569,77,561,87,561,91,565,99,563,103,567,107,567,111,561,119,569,133,565,137,569,157,571,173,581,177,581,183,573,187,581,199,581,211,569,215,569,237,547,243,533,239,529,245,525,239,515,231,509,221,487,203,469,187,463,179,469,173,465,155,479,143,479,137,473,137,467,147,447,161,431,179,431,187,437,193,437,215,431,221,425,225,429,233,425,239,427,247,419,251,425,257,419,281,419,295,411,301,415,305,409,317,409,327,415,333,411,373,411,385,399,387,391,383,361,387,355,383,351,379,357,379,347,383,343,381,315,387,309],
      [737,497,741,501,737,511,727,519,725,527,709,545,661,581,631,591,623,591,605,603,595,603,589,607,579,605,553,615,545,623,543,633,537,637,541,645,541,657,531,671,521,679,519,689,503,699,493,711,489,711,459,741,449,743,445,747,445,753,439,749,435,753,399,753,387,755,373,763,363,759,327,759,321,765,317,753,325,753,345,743,347,745,367,737,371,733,367,729,377,721,379,727,375,731,379,735,401,725,411,727,419,721,419,713,423,713,435,699,441,699,441,703,431,711,429,717,433,721,443,719,457,709,457,701,463,697,469,697,495,681,505,685,509,681,505,673,511,677,515,673,515,665,523,661,527,663,531,659,525,647,527,641,515,631,499,639,495,643,497,649,481,661,473,661,457,649,451,657,439,663,423,679,403,681,391,677,369,695,355,699,351,697,341,703,337,707,337,713,333,715,325,715,319,709,313,713,299,713,293,719,275,719,259,731,225,739,221,743,223,749,219,753,207,753,205,751,209,745,205,741,183,757,179,755,171,761,165,759,151,769,143,763,153,753,161,757,167,753,163,743,169,735,177,731,179,725,185,723,193,735,203,715,209,715,223,707,241,691,249,671,245,665,247,657,253,655,257,659,277,641,271,633,271,629,275,627,279,627,285,633,289,631,297,637,299,635,301,647,287,659,287,665,283,663,283,657,279,653,275,657,271,669,263,679,267,683,273,679,275,683,267,689,259,683,253,689,257,693,243,711,251,719,257,717,267,703,295,697,325,677,335,679,343,685,347,681,341,675,343,669,369,657,383,659,387,655,385,647,389,643,409,645,433,641,445,627,451,625,457,635,461,631,467,635,471,631,465,627,475,623,491,623,491,631,495,635,499,631,503,633,507,627,499,619,501,615,507,619,513,611,521,609,527,613,531,621,547,601,551,603,559,597,563,599,577,593,585,593,601,581,613,581,627,573,641,573,651,567,659,569,683,549,681,545,675,539,671,539,641,547,635,541,639,537,647,537,653,533,657,535,665,531,671,533,685,529,713,529],
      [695,205,703,205,725,215,739,215,759,225,777,243,783,265,781,269,789,275,785,279,791,289,785,295,795,305,791,325,795,331,793,335,803,343,821,343,837,327,861,297,861,291,867,285,865,283,877,273,881,261,893,247,891,243,895,239,899,243,903,239,911,239,917,243,919,251,925,257,931,251,931,247,937,247,937,253,933,263,925,263,921,267,917,279,903,291,903,295,897,301,883,305,857,321,843,339,825,351,805,357,793,367,779,371,769,369,757,391,747,393,737,389,721,405,693,417,687,425,683,425,677,413,683,409,681,403,689,395,687,393,693,385,689,377,693,371,691,367,695,363,695,341,691,325,681,315,681,309,691,305,703,309,715,307,725,311,745,293,745,285,741,281,749,275,741,269,737,261,725,255,709,239,705,239,705,233,697,227,689,213],
      [715,475,729,479,729,485,721,485,711,495,715,499,723,499,709,499,699,505,675,505,657,511,645,511,641,507,619,507,615,511,603,511,579,505,571,507,551,497,543,503,531,505,527,509,529,519,525,525,539,545,547,541,549,543,555,537,581,533,585,529,591,529,599,537,617,535,631,525,635,529,631,537,633,539,597,557,587,555,589,545,583,541,579,545,579,551,571,551,567,555,571,559,581,559,565,559,553,563,549,561,535,573,513,573,501,585,493,581,485,559,485,539,481,531,491,509,507,509,515,503,517,505,527,495,539,495,543,489,547,491,559,483,577,481,593,489,619,489,627,483,633,483,639,491,645,485,659,485,667,491,677,483,677,479,685,483],
      [633,309,639,309,649,315,659,329,677,345,677,361,671,383,673,393,669,397,673,413,659,429,651,427,645,421,643,413,645,403,655,389,633,373,623,381,623,385,613,395,613,413,625,431,623,437,617,441,603,439,585,445,569,443,561,449,557,447,551,451,533,451,525,443,529,433,537,427,545,429,563,423,569,415,573,415,579,409,585,409,595,397,595,389,599,383,591,369,591,361,581,347,585,335,599,329,607,333,627,311],
      [573,771,573,777,579,783,579,787,575,791,569,791,547,811,529,821,523,819,513,827,501,823,495,829,477,833,473,837,473,841,479,847,495,849,501,857,509,851,525,847,551,849,563,841,569,845,559,855,537,855,511,861,503,857,499,861,509,873,509,899,515,905,527,909,529,907,535,913,547,913,551,917,557,913,561,915,555,919,551,917,545,923,523,931,515,929,507,919,507,907,499,887,493,883,495,873,483,853,473,853,463,847,453,859,431,847,415,847,411,851,405,847,385,847,379,853,369,853,361,847,339,847,335,853,309,829,309,821,305,817,313,813,335,835,343,835,349,829,347,825,355,817,365,815,369,811,373,815,371,819,355,831,361,837,369,839,373,835,373,829,381,835,423,835,429,829,443,831,451,825,471,825,483,817,493,815,499,821,517,803,529,803,527,807,531,811,549,795,551,787,561,781,567,781],
      [833,41,863,41,865,45,845,49,841,47,833,51,801,51,791,65,801,83,811,83,821,77,835,77,839,81,845,79,845,87,853,93,871,87,877,91,885,85,903,85,905,89,899,95,903,99,907,97,911,105,909,109,917,113,913,117,897,101,899,97,895,93,885,95,875,91,865,99,859,97,851,109,855,113,861,111,871,119,871,125,863,131,855,125,851,117,853,113,843,107,841,97,835,91,821,93,815,99,813,105,823,113,827,121,825,127,829,139,829,153,835,157,841,175,849,181,847,189,853,197,867,207,891,203,895,205,895,215,887,223,889,225,881,239,873,243,863,233,865,229,841,205,841,177,833,173,833,165,827,161,829,155,825,151,823,153,813,139,813,125,809,113,795,99,797,95,791,89,791,83,783,79,777,71,779,61,771,57,773,49,827,45],
      [833,505,839,507,839,527,835,539,839,543,839,551,831,567,841,587,839,593,825,605,807,607,799,613,785,615,779,621,769,639,777,645,783,637,787,637,791,645,779,651,783,657,781,675,769,683,767,691,763,685,769,681,753,669,725,673,719,679,703,685,703,671,727,661,753,641,761,641,773,629,769,625,769,619,781,605,781,593,803,573,799,565,801,557,813,549,811,545,817,539,817,529,827,515,825,507,829,511],
      [965,369,971,375,975,371,979,373,975,373,963,385,955,383,947,393,947,403,943,409,943,429,949,433,943,447,953,467,949,473,949,479,953,483,953,551,949,555,955,559,955,565,953,569,935,577,931,573,933,569,947,557,937,543,923,543,931,521,927,499,933,485,931,481,937,473,935,471,947,471,951,465,939,447,931,453,927,451,923,455,925,459,921,445,925,441,927,421,933,411,933,401,937,397,939,383,947,375,953,381],
      [697,675,699,679,691,685,691,689,681,689,667,701,655,701,639,711,633,713,627,707,619,707,607,717,601,717,589,725,579,725,569,731,535,741,521,735,525,725,541,713,549,715,553,711,547,707,545,701,553,695,563,695,567,691,563,685,567,681,579,693,579,697,573,703,577,707,585,707,595,701,607,701,619,693,623,697,633,697,675,683,687,687,691,683,689,679],
      [845,797,851,797,855,801,855,807,861,813,859,815,855,813,845,821,837,821,801,835,795,829,791,833,791,839,767,849,759,849,753,855,749,853,743,859,737,857,711,867,695,869,695,865,699,867,707,857,713,863,717,863,721,859,715,853,715,849,719,849,723,857,731,855,739,847,737,843,749,849,753,845,751,843,757,837,765,835,775,823,783,819,801,819,809,811,825,811,839,805],
      [965,277,973,277,977,285,975,299,979,315,985,323,983,325,989,331,989,351,995,359,993,369,987,369,975,361,969,361,965,365,953,359,951,355,953,347,965,337,969,327,961,309,961,285],
      [793,689,801,689,807,695,799,703,789,705,781,715,773,717,751,735,737,739,725,737,721,741,715,739,697,753,691,747,687,749,683,745,677,753,673,749,667,757,657,763,641,763,651,751,665,751,671,743,675,747,679,743,687,745,691,739,697,741,711,731,717,737,725,729,729,733,735,727,731,723,743,717,761,719,769,715,781,701,781,697],
      [915,291,919,291,923,297,923,305,919,311,921,313,917,317,919,339,915,345,915,363,907,371,909,375,903,395,899,391,889,399,891,403,887,409,891,413,895,411,889,417,885,417,875,407,883,403,887,385,901,367,901,361,905,357,907,333,903,329,901,311],
      [905,579,911,581,917,589,913,603,919,607,913,623,917,627,913,643,915,651,909,659,903,655,905,637,901,619,897,615,903,601,897,595,897,587],
      [545,465,549,469,553,467,557,475,549,479,547,477,541,483,537,481,523,487,517,483,509,491,499,491,489,481,501,467,525,471,539,469],
      [853,717,859,723,859,727,855,733,845,729,841,733,841,743,847,753,855,749,857,757,851,759,847,755,839,761,829,749,825,723,829,719,835,725,843,727],
      [951,169,959,173,957,179,969,193,973,193,971,199,975,217,969,225,963,225,955,219,961,205,955,195,955,185,947,173],
      [655,625,673,627,669,639,651,647,635,645,635,637,641,631],
      [797,741,813,751,809,765,805,769,797,765,777,765,773,761,775,757,787,751],
      [963,233,969,233,973,241,973,255,969,259,967,269,959,267,953,259],
      [937,31,941,33,943,41,937,39,929,43,877,43,881,39,897,37,915,39,919,35,933,35],
      [927,115,933,117,931,119,937,127,947,127,943,139,937,139,929,147,933,153,931,155,927,153,925,137,929,121],
      [663,869,671,875,677,873,677,877,649,885,645,889,635,887,627,893,621,891,621,887,627,889,633,883,639,887,647,877,657,875],
      [729,777,733,781,725,789,723,787,693,805,689,803,689,797,699,789,711,787],
      [891,743,893,753,887,763,889,773,885,779,887,793,883,797,885,801,875,809,873,805,883,795,883,759,889,753],
      [909,459,915,459,919,467,909,473,905,471,897,481,899,485,895,487,895,475,905,467],
      [859,469,863,471,855,477,855,483,851,487,853,493,851,495,847,491,843,495,847,501,843,501,841,485,847,485,853,479,851,473],
      [747,415,755,421,755,427,745,433,739,429,739,421],
      [883,507,887,511,885,535,879,533,879,511],
      [945,221,949,221,953,227,947,241,941,243,939,231],
      [455,775,471,787,469,793,461,785,455,793,445,793,457,783,453,777],
      [835,621,835,639,831,647,829,649,823,643,817,645,817,639,825,643,833,639,831,629],
      [831,655,835,655,837,659,831,665,829,675,825,677,823,663],
      [673,805,679,807,677,813,669,817,657,817],
      [863,347,869,347,873,351,867,363,861,359],
      [357,623,365,623,365,633,355,635,351,631],
      [407,781,411,783,407,787,409,791,399,797,395,793,395,785,399,783,403,787],
      [919,659,921,685,915,693,913,681,919,677],
      [803,717,811,721,811,733,807,737],
      [845,373,849,375,843,381,845,385,833,393,833,385],
      [619,827,623,827,619,835,621,839,617,841,613,837,607,841,605,837,613,837],
      [473,473,481,473,483,477,473,485,467,481],
      [654,664,676,640,700,622,724,604,734,580,746,560,760,544,776,524,788,512,796,516,788,536,772,560,760,584,744,604,720,624,692,644,664,668]
    ],
    specimens: [890,152,3,905,152,5,945,159,6,929,279,6,949,369,4,1003,370,3,850,392,4,819,393,3,867,397,5,899,402,3,810,413,5,674,438,4,652,449,5,862,454,6,625,452,5,569,464,6,883,494,5,861,571,5,559,577,7,896,574,4,835,608,3,887,638,4,588,653,6,576,660,4,549,662,3,887,665,4,559,668,3,889,678,5,222,693,7,387,694,6,876,704,4,829,712,5,840,711,3,279,733,4,920,738,4,516,738,4,505,746,3,492,757,5,764,758,4,271,767,6,636,765,3,291,768,3,617,769,6,748,768,4,502,778,6,840,772,4,467,774,3,592,779,6,753,780,3,420,784,5,434,781,3,331,785,7,361,786,6,490,784,4,741,782,3,379,788,3,388,790,5,434,790,4,826,791,3,496,796,4,505,795,3,328,818,4,646,823,4,634,828,5,631,836,3,316,845,3,583,847,4,601,855,7,685,867,5,612,895,3,532,899,6,598,900,4,586,905,3,494,913,3,570,911,4]
  };
  const TEES = ['black', 'green', 'silver'];
  const EXPAND_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
  const ST_SHORT = { open: 'Open', GUR: 'GUR', closed: 'Closed' };
  const ST_LONG = { open: 'Open', GUR: 'Ground under repair', closed: 'Closed' };
  function stKey(s) { return s === 'GUR' ? 'gur' : s === 'closed' ? 'closed' : 'open'; }

  /* ---------- geometry helpers ---------- */
  function flatPts(a) { const o = []; for (let i = 0; i + 1 < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }
  function lineD(p) { return p.map(function (q, i) { return (i ? 'L' : 'M') + r1(q[0]) + ',' + r1(q[1]); }).join(''); }
  function r1(v) { return Math.round(v * 10) / 10; }
  // Catmull-Rom spline through the points, as cubic beziers (soft organic outlines)
  function smoothD(p, closed) {
    const n = p.length; if (n < 3) return lineD(p) + (closed ? 'Z' : '');
    const at = function (i) { return closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]; };
    let d = 'M' + r1(p[0][0]) + ',' + r1(p[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += 'C' + r1(p1[0] + (p2[0] - p0[0]) / 6) + ',' + r1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 6) + ',' + r1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + r1(p2[0]) + ',' + r1(p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }
  function plen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  // point and unit direction at distance d from the start of a polyline
  function along(p, d) {
    if (d <= 0) { const u = unit(p[0], p[1]); return { x: p[0][0] + u[0] * d, y: p[0][1] + u[1] * d, u: u }; }
    for (let i = 1; i < p.length; i++) {
      const L = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= L || i === p.length - 1) { const u = unit(p[i - 1], p[i]); const t = Math.min(d, L); return { x: p[i - 1][0] + u[0] * t, y: p[i - 1][1] + u[1] * t, u: u }; }
      d -= L;
    }
  }
  function unit(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
  function subPath(p, d0, d1) {
    const s = along(p, d0); const out = [[s.x, s.y]];
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc > d0 && acc < d1) out.push(p[i]);
    }
    const e = along(p, d1); out.push([e.x, e.y]);
    return out;
  }
  function distToSeg(q, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
    return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
  }
  function distToLine(q, p) { let m = Infinity; for (let i = 1; i < p.length; i++) m = Math.min(m, distToSeg(q, p[i - 1], p[i])); return m; }
  function deg(u) { return Math.atan2(u[1], u[0]) * 180 / Math.PI; }
  // does any segment of polyline a come within dist of polyline p (sampled every few units)
  function nearLine(a, p, dist) {
    for (let i = 1; i < a.length; i++) {
      const L = Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]), steps = Math.max(1, Math.ceil(L / 6));
      for (let s = 0; s <= steps; s++) { const t = s / steps; if (distToLine([a[i - 1][0] + (a[i][0] - a[i - 1][0]) * t, a[i - 1][1] + (a[i][1] - a[i - 1][1]) * t], p) < dist) return true; }
    }
    return false;
  }

  // Number badges sit just behind each tee; a few relaxation passes keep neighbouring badges from overlapping.
  function badgeLayout(r) {
    const pos = PLAN.holes.map(function (p) { const u = unit(p[0], p[1]); const ax = p[0][0] - u[0] * (r * 1.05), ay = p[0][1] - u[1] * (r * 1.05); return { ax: ax, ay: ay, x: ax, y: ay }; });
    const min = 2 * r + 4;
    for (let it = 0; it < 90; it++) {
      pos.forEach(function (q) { q.x += (q.ax - q.x) * 0.06; q.y += (q.ay - q.y) * 0.06; });
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i], b = pos[j]; let dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
    return pos;
  }

  /* ---------- the overview map ---------- */
  function holeAria(n, status) {
    const h = holeDoc(n);
    return 'Hole ' + n + ', par ' + h.par + ', ' + ((h.yards && h.yards.black) || '') + ' yards, ' + ST_LONG[status] + '. Select for details';
  }
  /* The overview is drawn as a yardage-book course page in plan units (north to the right, as the plan is).
     The status-free artwork is built once and cached; only the hole classes change with status. Sizes that must
     stay constant on screen (badges, type, compass, footer, outlines) scale with --k, set in layout(). */
  const OV_I = 12;   // frame inset, plan units
  let ovArt = null;
  function overviewArt() {
    if (ovArt) return ovArt;
    const W = PLAN.w, H = PLAN.h;
    const holes = PLAN.holes.map(function (p, i) {
      const n = i + 1, h = holeDoc(n), black = +(h.yards && h.yards.black) || Math.round(plen(p) * PLAN.ydPerUnit);
      const py = plen(p) / black, hs = holeShapes(p, n, black, +h.par, py);
      const u = unit(p[0], p[1]);
      const cw = function () { return 6 * py; };
      return { n: n, p: p, py: py, hs: hs, carry: corridor(hs.C, hs.dAt(0), hs.dAt(black - 12), cw, cw, 8), tee: p[0], teeAng: deg(u) + 90, pin: [hs.G[0] - hs.lat[0] * hs.gw * 0.3, hs.G[1] - hs.lat[1] * hs.gw * 0.3] };
    });
    // trees: the plan's tree masses and single trees, on a coarser grid than the hole page and kept clear of every
    // hole's line of play, green and tee, so they read as calm belts between the holes
    const crowns = [];
    const lbl = PLAN.labels.map(function (l) {
      const water = l.kind === 'water', place = l.kind === 'place', fs = (water ? 13 : place ? 12.5 : 9) * 1.8;
      const w = l.t.length * fs * (water || place ? 0.5 : 0.82), x0 = l.anchor === 'end' ? l.at[0] - w : l.at[0] - w / 2;
      const dy = place ? 0 : -fs * 0.35;
      return [x0 - 6, l.at[1] + dy - fs * 0.7, x0 + w + 6, l.at[1] + dy + fs * 0.7];
    });
    const ok = function (x, y, r) {
      if (x < OV_I + r || x > W - OV_I - r || y < OV_I + r || y > H - OV_I - r) return false;
      if (Math.hypot(x - 78, y - 78) < 70 + r) return false;   // the compass
      // keep the labels on clear ground (sizes as drawn on a desktop screen)
      for (let j = 0; j < lbl.length; j++) { const b = lbl[j]; if (x > b[0] - r && x < b[2] + r && y > b[1] - r && y < b[3] + r) return false; }
      for (let i = 0; i < holes.length; i++) {
        const o = holes[i], hs = o.hs;
        if (distToLine([x, y], hs.C) < 21 * o.py + r * 0.5) return false;
        if (Math.hypot(x - hs.G[0], y - hs.G[1]) < Math.max(hs.gl, hs.gw) + 12 * o.py + r * 0.6) return false;
        if (Math.hypot(x - o.tee[0], y - o.tee[1]) < 30 + r) return false;   // keep the number badge on clear ground
      }
      return true;
    };
    /* The overview keeps trees light: wider spacing and smaller crowns than the hole page, and no single
       specimen trees, so the tree belts frame the holes instead of competing with them. */
    const put = function (x, y, r) { crowns.push([x, y, r * 0.62]); };
    const box = { x0: 0, y0: 0, x1: W, y1: H };
    PLAN_NATURE.trees.forEach(function (t, i) { packTrees(flatPts(t), box, 19, 40 + i, ok, put); });
    // drop lone crowns: on the overview a stray tree reads as noise, a belt reads as trees
    const kept = crowns.filter(function (c) {
      let nb = 0;
      for (let i = 0; i < crowns.length && nb < 2; i++) { const o = crowns[i]; if (o !== c && Math.abs(o[0] - c[0]) < 32 && Math.abs(o[1] - c[1]) < 32 && Math.hypot(o[0] - c[0], o[1] - c[1]) < 28) nb++; }
      return nb >= 2;
    });
    crowns.length = 0; Array.prototype.push.apply(crowns, kept);
    const circ = function (x, y, r) { return 'M' + r1(x - r) + ',' + r1(y) + 'a' + r1(r) + ',' + r1(r) + ' 0 1,0 ' + r1(2 * r) + ',0a' + r1(r) + ',' + r1(r) + ' 0 1,0 ' + r1(-2 * r) + ',0'; };
    const treeD = crowns.map(function (c) { return circ(c[0], c[1], c[2]); }).join('');
    const treeHL = crowns.map(function (c) { return circ(c[0] - c[2] * 0.24, c[1] - c[2] * 0.28, c[2] * 0.48); }).join('');

    let base = '<rect class="yb-paper" x="0" y="0" width="' + W + '" height="' + (H + 200) + '"/>';
    base += PLAN.roads.map(function (r) { return '<path class="cg-road" d="' + lineD(flatPts(r)) + '"/>'; }).join('');
    base += '<path class="cg-parcel" d="' + smoothD(flatPts(PLAN.boundary), true) + '"/>';
    base += '<path class="cg-grounds" d="' + lineD(flatPts(PLAN.clubGrounds)) + 'Z"/>';
    const rd = smoothD(flatPts(PLAN.river), false);
    base += '<path class="yb-river-edge cg-river-edge" d="' + rd + '"/><path class="yb-river cg-river" d="' + rd + '"/>';
    base += PLAN_NATURE.marsh.map(function (m) { return '<path class="yb-marsh" fill="url(#cgov-marsh)" d="' + smoothD(flatPts(m), true) + '"/>'; }).join('');
    base += PLAN.ponds.map(function (pd) { return '<path class="yb-pond cg-pond" d="' + smoothD(flatPts(pd), true) + '"/>'; }).join('');
    const c = PLAN.clubhouse;
    base += '<rect class="cg-club" x="' + (c.at[0] - c.size[0] / 2) + '" y="' + (c.at[1] - c.size[1] / 2) + '" width="' + c.size[0] + '" height="' + c.size[1] + '" rx="2"/>';
    const trees = '<path class="cg-tree-edge" d="' + treeD + '"/><path class="yb-tree cg-tree" d="' + treeD + '"/><path class="yb-tree-hl" d="' + treeHL + '"/>';
    const labels = PLAN.labels.map(function (l) {
      return '<text class="cg-label is-' + l.kind + '" x="' + l.at[0] + '" y="' + l.at[1] + '" text-anchor="' + (l.anchor || 'middle') + '"' + (l.rot ? ' transform="rotate(' + l.rot + ' ' + l.at[0] + ' ' + l.at[1] + ')"' : '') + '>' + esc(l.t) + '</text>';
    }).join('');
    const holeD = holes.map(function (o) {
      const hs = o.hs, fd = smoothD(hs.fair, true), cd = smoothD(hs.collar, true), kd = smoothD(o.carry, true);
      // the status overlay covers the fairway and green plus a narrow strip from the tee, so it meets the badge
      const ov = '<path d="' + kd + '"/><path d="' + fd + '"/><path d="' + cd + '"/>';
      const tee = '<g transform="translate(' + r1(o.tee[0]) + ' ' + r1(o.tee[1]) + ') rotate(' + r1(o.teeAng) + ')"><rect class="yb-tee cg-tee" x="-7" y="-4.5" width="14" height="9" rx="2.5"/></g>';
      return {
        line: lineD(o.p),
        body: '<path class="cg-out" d="' + fd + cd + '"/>' +
          '<path class="yb-fair cg-fair" d="' + fd + '"/>' +
          '<path class="yb-collar cg-collar" d="' + cd + '"/><path class="yb-green cg-green" d="' + smoothD(hs.green, true) + '"/>' +
          '<g class="cg-ov is-g">' + ov + '</g><g class="cg-ov is-c">' + ov + '</g>' + tee +
          '<path class="cg-play" d="' + smoothD(subPath(hs.C, 8, hs.Lc - hs.gl * 0.6), false) + '"/>' +
          '<g class="yb-flag cg-flag" transform="translate(' + r1(o.pin[0]) + ' ' + r1(o.pin[1]) + ') scale(0.62)">' + flagBody() + '</g>'
      };
    });
    const defs = '<clipPath id="cgov-clip"><rect x="' + OV_I + '" y="' + OV_I + '" width="' + (W - 2 * OV_I) + '" height="' + (H - 2 * OV_I) + '"/></clipPath>' +
      '<pattern id="cgov-marsh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="7" height="7" class="yb-marsh-bg"/><line x1="0" y1="3.5" x2="7" y2="3.5" class="yb-marsh-ln"/></pattern>' +
      '<pattern id="cgov-gur" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><rect width="9" height="9" class="cg-hatch-bg is-g"/><line x1="0" y1="4.5" x2="9" y2="4.5" class="cg-hatch-ln is-g"/></pattern>' +
      '<pattern id="cgov-closed" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><rect width="9" height="9" class="cg-hatch-bg is-c"/><line x1="0" y1="4.5" x2="9" y2="4.5" class="cg-hatch-ln is-c"/></pattern>';
    ovArt = { defs: defs, base: base, trees: trees, labels: labels, holes: holeD };
    return ovArt;
  }
  function mapSVG(st) {
    const statusOf = function (n) { return (st.holes.find(function (x) { return x.number === n; }) || {}).status || 'open'; };
    const art = overviewArt(), W = PLAN.w, H = PLAN.h + 40;
    let s = '<svg class="cg-map" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Course map, north to the right. Each hole is drawn from tee to green, with its number at the tee coloured by status.">';
    s += '<defs>' + art.defs + '</defs>';
    s += '<g class="cg-page" clip-path="url(#cgov-clip)"><g class="cg-base" aria-hidden="true">' + art.base + art.trees + '</g>';
    s += '<g class="cg-holes">';
    art.holes.forEach(function (o, i) {
      const n = i + 1, status = statusOf(n);
      s += '<g class="cg-hole is-' + stKey(status) + '" data-hole="' + n + '" tabindex="0" role="button" aria-label="' + esc(holeAria(n, status)) + '" style="--i:' + i + '">' +
        '<path class="cg-hit" d="' + o.line + '"/><g class="cg-hb">' + o.body + '</g></g>';
    });
    s += '</g><g class="cg-labels" aria-hidden="true">' + art.labels + '</g></g>';
    // page furniture, sized in layout(): compass (north to the right), footer with club name and scale bar
    s += '<g class="yb-compass cg-compass" aria-hidden="true" transform="translate(78 78)">' + compassBody(0) + '</g>';
    s += '<g class="yb-foot cg-foot" aria-hidden="true"></g>';
    s += '<rect class="yb-frame cg-frame" x="' + OV_I + '" y="' + OV_I + '" width="' + (W - 2 * OV_I) + '" height="' + (H - 2 * OV_I) + '"/>';
    s += '<g class="cg-badges" aria-hidden="true">';
    PLAN.holes.forEach(function (p, i) {
      const n = i + 1, status = statusOf(n);
      s += '<g class="cg-badge is-' + stKey(status) + '" data-hole="' + n + '" style="--i:' + i + '" transform="translate(' + p[0][0] + ' ' + p[0][1] + ')"><circle class="cg-ring" r="20"/><circle class="cg-disc" r="16"/><text dy="0.35em" text-anchor="middle">' + n + '</text></g>';
    });
    s += '</g></svg>';
    return s;
  }

  /* ---------- one hole as a printed yardage-book page: tee at the bottom, green at the top ----------
     Everything placed on the page comes from the plan (line of play, river, ponds, marsh, tree masses and single
     trees) or the scorecard (par, stroke index, tee yardages). The fairway, rough and green outlines are drawn
     to a standard width around the plan's line of play: the plan does not trace them. Only hole 17 gets
     bunkers and a slope note, because CLUB.md describes them. The plan is rotated (never mirrored) so the hole
     plays straight up the page; the compass shows where north ends up. */
  const YB = { w: 400, h: 720, inset: 10, greenY: 168, teeY: 640, side: 70 };
  let ybSeq = 0;
  function hash3(a, b, c) { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); }
  function chaikin(p, it) {
    let q = p;
    for (let k = 0; k < it; k++) {
      const o = [q[0]];
      for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      o.push(q[q.length - 1]); q = o;
    }
    return q;
  }
  // point and direction at distance d along a polyline, extended straight past either end
  function ptAt(line, d) {
    const L = plen(line), n = line.length;
    if (d <= 0) { const u = unit(line[0], line[1]); return { x: line[0][0] + u[0] * d, y: line[0][1] + u[1] * d, u: u }; }
    if (d >= L) { const u = unit(line[n - 2], line[n - 1]); return { x: line[n - 1][0] + u[0] * (d - L), y: line[n - 1][1] + u[1] * (d - L), u: u }; }
    return along(line, d);
  }
  function inPoly(q, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // an organic band around a line between distances d0 and d1, with rounded ends; wl/wr give the half widths
  function corridor(line, d0, d1, wl, wr, step) {
    const Lp = [], Rp = [], n = Math.max(2, Math.ceil((d1 - d0) / step));
    for (let i = 0; i <= n; i++) {
      const d = d0 + (d1 - d0) * i / n, q = ptAt(line, d), nx = q.u[1], ny = -q.u[0], a = wl(d), b = wr(d);
      Lp.push([q.x + nx * a, q.y + ny * a]); Rp.push([q.x - nx * b, q.y - ny * b]);
    }
    const cap = function (d, fwd) {
      const q = ptAt(line, d), nx = q.u[1], ny = -q.u[0], a = wl(d), b = wr(d), f = 0.7 * (a + b) / 2, out = [];
      for (let k = 1; k < 6; k++) {
        const ph = Math.PI * k / 6, c = Math.cos(ph), sn = Math.sin(ph);
        if (fwd) { const w = c > 0 ? a : b; out.push([q.x + nx * c * w + q.u[0] * sn * f, q.y + ny * c * w + q.u[1] * sn * f]); }
        else { const w = c > 0 ? b : a; out.push([q.x - nx * c * w - q.u[0] * sn * f, q.y - ny * c * w - q.u[1] * sn * f]); }
      }
      return out;
    };
    return Lp.concat(cap(d1, true), Rp.reverse(), cap(d0, false));
  }
  function blob(c, along, lat, rx, ry, seed, pts) {
    const out = [];
    for (let i = 0; i < pts; i++) {
      const th = i / pts * Math.PI * 2, w = 1 + 0.07 * Math.sin(3 * th + seed) + 0.04 * Math.cos(2 * th + seed * 0.7);
      const a = Math.sin(th) * ry * w, b = Math.cos(th) * rx * w;
      out.push([c[0] + along[0] * a + lat[0] * b, c[1] + along[1] * a + lat[1] * b]);
    }
    return out;
  }
  function circleD(c, R, th0, dir) {
    // a half circle from angle th0, clockwise (dir 1) or anticlockwise (dir 0)
    const s = [c[0] + R * Math.cos(th0), c[1] + R * Math.sin(th0)], e = [c[0] + R * Math.cos(th0 + Math.PI), c[1] + R * Math.sin(th0 + Math.PI)];
    return 'M' + r1(s[0]) + ',' + r1(s[1]) + 'A' + r1(R) + ',' + r1(R) + ' 0 0 ' + dir + ' ' + r1(e[0]) + ',' + r1(e[1]);
  }
  function ybText(x, y, txt, cls, o) {
    o = o || {};
    return '<text class="' + cls + '" x="' + r1(x) + '" y="' + r1(y) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.rot ? ' transform="rotate(' + r1(o.rot) + ' ' + r1(x) + ' ' + r1(y) + ')"' : '') + '>' + txt + '</text>';
  }

  /* ---------- drawing shared by the yardage page and the overview map ---------- */
  // Rough, fairway and green outlines drawn to a standard width around a line of play P, in any coordinate
  // system: py is units per yard along P. The plan traces only the line of play, not these outlines.
  function holeShapes(P, n, black, par, py) {
    const C = chaikin(P, 3), kc = plen(C) / plen(P), Lc = plen(C);
    const dAt = function (yd) { return yd * py * kc; };   // yards from the Black tee -> distance along C
    const roughW = function (side) { return function (d) { const t = d / (py * kc); return (40 + 2.4 * Math.sin(t / (side ? 41 : 47) + n * (side ? 1.3 : 2.1)) + 3 * Math.max(0, Math.min(1, (t - black + 60) / 50))) * py; }; };
    const rough = corridor(C, dAt(-14), dAt(black + 20), roughW(0), roughW(1), 8);
    let fair;
    if (par === 3) {
      const fw = function (d) { const t = d / (py * kc); return (8 + 4 * Math.max(0, Math.min(1, (t - black + 44) / 26))) * py; };
      fair = corridor(C, dAt(black - 44), dAt(black - 8), fw, fw, 6);
    } else {
      const lz = par >= 5 ? [Math.min(270, black * 0.48), black - 105] : [Math.min(262, black * 0.62)];
      const fw = function (side) {
        return function (d) {
          const t = d / (py * kc); let w = 17;
          lz.forEach(function (z) { w += 6 * Math.exp(-Math.pow((t - z) / 50, 2)); });
          w -= 4 * Math.max(0, Math.min(1, (t - (black - 75)) / 55));
          return (w + 1.6 * Math.sin(t / (side ? 31 : 37) + n * (side ? 2.3 : 1.7))) * py;
        };
      };
      fair = corridor(C, dAt(Math.min(black * 0.32, 125)), dAt(black - 8), fw(0), fw(1), 8);
    }
    const gl = Math.max(9, 15 * py), gw = Math.max(8, 12.5 * py);   // green half length and half width
    const G = C[C.length - 1], ug = unit(C[C.length - 2], G), lat = [ug[1], -ug[0]];   // lat = left of play
    return {
      C: C, Lc: Lc, dAt: dAt, roughW: roughW, rough: rough, fair: fair, gl: gl, gw: gw, G: G, ug: ug, lat: lat,
      collar: blob(G, ug, lat, gw + 3 * py, gl + 3 * py, n, 14), green: blob(G, ug, lat, gw, gl, n, 14)
    };
  }
  // fill one of the plan's tree masses with crowns on a jittered grid; ok(x, y, r) vets each crown, put() keeps it
  function packTrees(poly, box, sp, seed, ok, put) {
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    poly.forEach(function (q) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); });
    if (bx1 < box.x0 || bx0 > box.x1 || by1 < box.y0 || by0 > box.y1) return;
    const gx0 = Math.max(box.x0 - sp, bx0), gx1 = Math.min(box.x1 + sp, bx1), gy0 = Math.max(box.y0 - sp, by0), gy1 = Math.min(box.y1 + sp, by1);
    for (let row = 0, yy = gy0; yy <= gy1; row++, yy += sp * 0.86) {
      for (let xx = gx0 + (row % 2) * sp / 2; xx <= gx1; xx += sp) {
        const jx = xx + (hash3(r1(xx), r1(yy), seed) - 0.5) * sp * 0.45, jy = yy + (hash3(r1(yy), r1(xx), seed + 3) - 0.5) * sp * 0.45;
        if (!inPoly([jx, jy], poly)) continue;
        const r = sp * (0.56 + hash3(r1(jx), r1(jy), 7) * 0.2);
        if (ok(jx, jy, r)) put(jx, jy, r);
      }
    }
  }
  // the page compass, centred on 0,0 (radius 26); na = the direction of north in radians
  function compassBody(na) {
    const nd = function (rr, off) { return [r1(Math.cos(na + off) * rr), r1(Math.sin(na + off) * rr)]; };
    const t1 = nd(13, 0), t2 = nd(5, Math.PI / 2), t3 = nd(9, Math.PI), t4 = nd(5, -Math.PI / 2), tn = nd(20, 0);
    return '<circle class="yb-c-ring" r="26"/><circle class="yb-c-in" r="17"/>' +
      '<path class="yb-c-n" d="M' + t1 + 'L' + t2 + 'L0,0L' + t4 + 'Z"/><path class="yb-c-s" d="M' + t3 + 'L' + t2 + 'L0,0L' + t4 + 'Z"/>' +
      '<text class="yb-c-t" x="' + tn[0] + '" y="' + tn[1] + '" dy="0.35em" text-anchor="middle">N</text>';
  }
  // the page footer band (30 high, w wide, origin top left): club name and a scale bar of bl units for bar yards
  function footBody(w, bl, bar) {
    const bx = w - 16, byy = 16;
    return '<rect class="yb-card" x="0" y="0" width="' + r1(w) + '" height="30"/><path class="yb-hair" d="M0,0H' + r1(w) + '"/>' +
      '<text class="yb-club" x="12" y="19">St. Boniface Golf Club</text>' +
      '<path class="yb-scale" d="M' + r1(bx - bl) + ',' + (byy - 4) + 'V' + byy + 'H' + r1(bx) + 'V' + (byy - 4) + 'M' + r1(bx - bl / 2) + ',' + byy + 'V' + (byy - 2.5) + '"/>' +
      '<text class="yb-scale-t" x="' + r1(bx - bl - 6) + '" y="' + (byy + 1) + '" text-anchor="end">' + bar + ' yd</text>';
  }
  function flagBody() { return '<ellipse class="yb-cup" cx="0" cy="0" rx="2.4" ry="1.4"/><line x1="0" y1="0" x2="0" y2="-26"/><path d="M0,-26 L13,-21.5 L0,-17 Z"/>'; }

  function holeBook(n) {
    const uid = 'yb' + n + '_' + (++ybSeq);
    const p0 = PLAN.holes[n - 1], h = holeDoc(n), y = h.yards || {};
    const W = YB.w, H = YB.h, I = YB.inset;
    const tee = p0[0], gr = p0[p0.length - 1];
    const a = (-90 - deg(unit(tee, gr))) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const rot = function (q) { return [q[0] * ca - q[1] * sa, q[0] * sa + q[1] * ca]; };
    const rp = p0.map(rot);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    rp.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    const black = +y.black || Math.round(plen(p0) * PLAN.ydPerUnit);
    const ypu = black / plen(p0);                    // yards per plan unit on this hole
    const par = +h.par, par3 = par === 3;
    // one scale per page: fill the page, but never more than 2.3 px a yard (keeps a short par 3 in proportion)
    const s = Math.min((YB.teeY - YB.greenY) / Math.max(1, y1 - y0), (W - 2 * YB.side) / Math.max(1, x1 - x0), 2.3 * ypu);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, midY = (YB.greenY + YB.teeY) / 2;
    const tf = function (q) { const r = rot(q); return [W / 2 + (r[0] - cx) * s, midY + (r[1] - cy) * s]; };
    const P = p0.map(tf), py = s / ypu;              // page line of play; px per yard
    const hs = holeShapes(P, n, black, par, py);
    const C = hs.C, Lc = hs.Lc, dAt = hs.dAt, roughW = hs.roughW, rough = hs.rough, fair = hs.fair, gl = hs.gl, gw = hs.gw, G = hs.G, ug = hs.ug, lat = hs.lat;
    const atYd = function (yd) { return ptAt(C, dAt(yd)); };
    const frame = { x0: I, y0: I, x1: W - I, y1: H - I };
    const inFrame = function (q, m) { m = m || 0; return q[0] > frame.x0 - m && q[0] < frame.x1 + m && q[1] > frame.y0 - m && q[1] < frame.y1 + m; };
    const near = function (pts, yd) { return nearLine(pts, p0, yd / ypu); };
    const info = { water: false, trees: false, marsh: false };

    // ---- shapes ----
    // the river is drawn under the grass: where the traced river line meets the line of play the trace is not
    // precise enough to draw it across the fairway. Ponds and marsh are drawn over it.
    const riverQ = flatPts(PLAN.river).map(tf), riverW = Math.max(7, 14 * s);

    let defs = '<clipPath id="' + uid + 'f"><rect x="' + I + '" y="' + I + '" width="' + (W - 2 * I) + '" height="' + (H - 2 * I) + '"/></clipPath>' +
      '<clipPath id="' + uid + 'r"><path d="' + smoothD(rough, true) + '"/></clipPath>' +
      '<pattern id="' + uid + 'h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="6" height="6" class="yb-marsh-bg"/><line x1="0" y1="3" x2="6" y2="3" class="yb-marsh-ln"/></pattern>';
    let base = '', wat = '', treeB = '', treeH = '', top = '', labels = '';

    // marsh (plan labels, approximate extent)
    PLAN_NATURE.marsh.forEach(function (m) {
      const pts = flatPts(m); if (!near(pts.concat([pts[0]]), 95)) return;
      const q = pts.map(tf); info.marsh = true;
      wat += '<path class="yb-marsh" fill="url(#' + uid + 'h)" d="' + smoothD(q, true) + '"/>';
      const c = q.reduce(function (s2, v) { return [s2[0] + v[0] / q.length, s2[1] + v[1] / q.length]; }, [0, 0]);
      if (inFrame(c, -24)) labels += ybText(c[0], c[1] + 4, 'Marsh', 'yb-t yb-t-marsh', { anchor: 'middle' });
    });

    // water: the Seine River and the ponds, only where they lie beside this hole
    const river = flatPts(PLAN.river), treeAt = [];
    let riverLabel = null;
    if (near(river, 100)) {
      const rq = riverQ, rd = smoothD(rq, false), rw = riverW;
      base += '<path class="yb-river-edge" d="' + rd + '" style="stroke-width:' + r1(rw + 3) + '"/><path class="yb-river" d="' + rd + '" style="stroke-width:' + r1(rw) + '"/>';
      // label the river where it is on the page, away from the line of play, near the middle of the hole
      riverLabel = function () {
      let best = null;
      for (let i = 1; i < rq.length; i++) {
        const m = [(rq[i - 1][0] + rq[i][0]) / 2, (rq[i - 1][1] + rq[i][1]) / 2], segL = Math.hypot(rq[i][0] - rq[i - 1][0], rq[i][1] - rq[i - 1][1]);
        if (!inFrame(m, -46) || segL < 30 || distToLine(m, P) < 46 * py + rw) continue;
        if (treeAt.some(function (t) { return Math.hypot(t[0] - m[0], t[1] - m[1]) < 36 + t[2]; })) continue;
        const score = Math.abs(m[1] - midY) - segL * 0.4;
        if (!best || score < best.score) best = { score: score, m: m, ang: deg(unit(rq[i - 1], rq[i])) };
      }
      if (best) { let ang = best.ang; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; labels += ybText(best.m[0], best.m[1] + 3.5, 'Seine River', 'yb-t yb-t-water', { anchor: 'middle', rot: ang }); }
      };
      if (rq.some(function (q) { return inFrame(q, -4) && distToLine(q, P) > 44 * py; })) info.water = true;
    }
    base += '<path class="yb-rough" d="' + smoothD(rough, true) + '"/>';
    PLAN.ponds.forEach(function (pd) {
      const pts = flatPts(pd); if (!near(pts.concat([pts[0]]), 100)) return;
      const q = pts.map(tf); if (q.some(function (v) { return inFrame(v, -4); })) info.water = true;
      wat += '<path class="yb-pond" d="' + smoothD(q, true) + '"/>';
      const c = q.reduce(function (s2, v) { return [s2[0] + v[0] / q.length, s2[1] + v[1] / q.length]; }, [0, 0]);
      if (inFrame(c, -24)) labels += ybText(c[0], c[1] + 4, 'Pond', 'yb-t yb-t-water', { anchor: 'middle' });
    });

    // trees: the plan's tree masses filled with crowns, plus its single trees. Kept clear of the line of play
    // and the green, and faded out beyond about 90 yards so the page reads as this hole.
    const headW = I + 18 + String(n).length * 40 + 122;
    const sp = Math.max(7, 9.5 * py), clear = (par3 ? 19 : 23) * py;
    const tree = function (x, yy, r) {
      treeAt.push([x, yy, r]);
      treeB += '<circle cx="' + r1(x) + '" cy="' + r1(yy) + '" r="' + r1(r) + '"/>';
      treeH += '<circle cx="' + r1(x - r * 0.24) + '" cy="' + r1(yy - r * 0.28) + '" r="' + r1(r * 0.52) + '"/>';
      info.trees = true;
    };
    const okTree = function (x, yy, r) {
      if (!inFrame([x, yy], r)) return false;
      // keep the page furniture (hole label, compass, footer) on clean paper
      if ((x < headW + r && yy < I + 96 + r) || yy > H - I - 30 - r || Math.hypot(x - (W - I - 36), yy - (I + 38)) < 30 + r) return false;
      const dl = distToLine([x, yy], P);
      if (dl < clear + r * 0.4 || dl > (84 + hash3(x, yy, 11) * 16) * py) return false;
      return Math.hypot(x - G[0], yy - G[1]) > Math.max(gl, gw) + 12 * py + r * 0.5;
    };
    PLAN_NATURE.trees.forEach(function (t) { packTrees(flatPts(t).map(tf), frame, sp, n, okTree, tree); });
    const spec = PLAN_NATURE.specimens;
    for (let i = 0; i + 2 < spec.length; i += 3) {
      const q = tf([spec[i], spec[i + 1]]), r = Math.max(3.5, spec[i + 2] * s);
      if (okTree(q[0], q[1], r)) tree(q[0], q[1], r);
    }

    if (riverLabel) riverLabel();
    // fairway, green, hole 17's bunkers
    base += '<path class="yb-fair" d="' + smoothD(fair, true) + '"/>';
    let green = '';
    if (n === 17) {
      // CLUB.md: two bunkers await balls heading for the green, which slopes from back to front
      [1, -1].forEach(function (side, i) {
        const c = [G[0] - ug[0] * gl * 0.5 + lat[0] * side * (gw + 8 * py), G[1] - ug[1] * gl * 0.5 + lat[1] * side * (gw + 8 * py)];
        const b = blob(c, ug, lat, Math.max(6, 6.5 * py), Math.max(10, 11 * py), 4 + i * 3, 12);
        green += '<path class="yb-sand" d="' + smoothD(b, true) + '"/>';
      });
    }
    green += '<path class="yb-collar" d="' + smoothD(hs.collar, true) + '"/>';
    green += '<path class="yb-green" d="' + smoothD(hs.green, true) + '"/>';
    if (n === 17) {
      const b = [G[0] + ug[0] * gl * 0.55, G[1] + ug[1] * gl * 0.55], f = [G[0] - ug[0] * gl * 0.5, G[1] - ug[1] * gl * 0.5];
      green += '<path class="yb-slope" d="M' + r1(b[0]) + ',' + r1(b[1]) + 'L' + r1(f[0]) + ',' + r1(f[1]) + '"/>' +
        '<path class="yb-slope-head" d="M' + r1(f[0] - ug[0] * 4) + ',' + r1(f[1] - ug[1] * 4) + 'L' + r1(f[0] + ug[0] * 3 + lat[0] * 3.5) + ',' + r1(f[1] + ug[1] * 3 + lat[1] * 3.5) + 'L' + r1(f[0] + ug[0] * 3 - lat[0] * 3.5) + ',' + r1(f[1] + ug[1] * 3 - lat[1] * 3.5) + 'Z"/>';
      labels += ybText(G[0] - gw - 14 * py - Math.max(6, 6 * py) - 8, G[1] - 2, 'Green slopes', 'yb-t yb-t-note', { anchor: 'end' }) +
        ybText(G[0] - gw - 14 * py - Math.max(6, 6 * py) - 8, G[1] + 11, 'back to front', 'yb-t yb-t-note', { anchor: 'end' });
    }

    // distance arcs to the centre of the green, every 25 yards, clipped to the rough
    let arcs = '', masks = '', ai = 0;
    for (let r = 75; r <= black - 25; r += 25) {
      const R = r * py;
      let q = null;
      for (let d = Lc; d >= 0; d -= 2) { const v = ptAt(C, d); if (Math.hypot(v.x - G[0], v.y - G[1]) >= R) { q = v; break; } }
      if (!q) break;
      const th = Math.atan2(q.y - G[1], q.x - G[0]);
      masks += '<mask id="' + uid + 'm' + ai + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><path class="yb-arc-draw" style="--i:' + ai + '" pathLength="1" d="' + circleD(G, R, th, 1) + '"/><path class="yb-arc-draw" style="--i:' + ai + '" pathLength="1" d="' + circleD(G, R, th, 0) + '"/></mask>';
      arcs += '<path class="yb-arc" mask="url(#' + uid + 'm' + ai + ')" d="' + circleD(G, R, th, 1) + circleD(G, R, th + Math.PI, 1).replace(/^M[^A]+/, '') + '"/>';
      // label on the right-hand side of the arc, just inside the rough edge
      const rw2 = roughW(1)(dAt(black - r)) * 0.86, dth = Math.min(1.1, rw2 / R), tl = th - dth;
      labels += ybText(G[0] + R * Math.cos(tl), G[1] + R * Math.sin(tl) + 3.5, String(r), 'yb-t yb-t-arc', { anchor: 'middle', rot: tl * 180 / Math.PI - 90 });
      ai++;
    }

    // line of play with yardage dots (yards to the centre of the green, along the line)
    top += '<path class="yb-line" d="' + smoothD(subPath(C, dAt(0) + 6, Lc - gl * 0.6), false) + '"/>';
    const teeYds = TEES.map(function (t) { return +y[t] || 0; });
    const dotYs = [];
    [100, 150, 200, 250, 300].forEach(function (m) {
      if (m > black - 40 || teeYds.some(function (ty) { return Math.abs(ty - m) < 24; })) return;
      const q = atYd(black - m);
      dotYs.push(q.y);
      top += '<circle class="yb-dot" cx="' + r1(q.x) + '" cy="' + r1(q.y) + '" r="4.2"/>';
      labels += ybText(q.x - 9, q.y + 4, String(m), 'yb-t yb-t-dot', { anchor: 'end' });
    });
    // dogleg turn points from the plan, with the carry from the Black tee
    let acc = 0;
    for (let i = 1; i < p0.length - 1; i++) {
      acc += Math.hypot(p0[i][0] - p0[i - 1][0], p0[i][1] - p0[i - 1][1]);
      const yd = Math.round(acc * ypu), q = atYd(yd);
      const turn = Math.abs(((deg(unit(p0[i], p0[i + 1])) - deg(unit(p0[i - 1], p0[i])) + 540) % 360) - 180);
      if (turn < 9) continue;
      top += '<path class="yb-turn" d="M' + r1(q.x) + ',' + r1(q.y - 4.5) + 'l4.5,4.5 l-4.5,4.5 l-4.5,-4.5z"/>';
      const off = dotYs.some(function (dy) { return Math.abs(dy - q.y) < 13; }) ? (dotYs.some(function (dy) { return dy > q.y && dy - q.y < 13; }) ? -12 : 12) : 0;
      labels += ybText(q.x + 10, q.y - 1 + off, String(yd), 'yb-t yb-t-turn', { anchor: 'start' }) + ybText(q.x + 10, q.y + 9 + off, 'from tee', 'yb-t yb-t-small', { anchor: 'start' });
    }
    // tee boxes from the scorecard, Black at the back
    const tees = TEES.map(function (t) { return { t: t, yd: +y[t] || 0 }; }).filter(function (t) { return t.yd; }).sort(function (p1, p2) { return p2.yd - p1.yd; });
    let lastY = Infinity;
    tees.forEach(function (t) {
      const q = atYd(black - t.yd), bw = Math.max(18, 11 * py), bh = Math.max(11, 7 * py), ang = deg(q.u) + 90;
      top += '<g transform="translate(' + r1(q.x) + ' ' + r1(q.y) + ') rotate(' + r1(ang) + ')"><rect class="yb-tee" x="' + r1(-bw / 2) + '" y="' + r1(-bh / 2) + '" width="' + r1(bw) + '" height="' + r1(bh) + '" rx="3"/>' +
        '<circle class="yb-tee-m is-' + t.t + '" cx="-3.2" cy="0" r="2.3"/><circle class="yb-tee-m is-' + t.t + '" cx="3.2" cy="0" r="2.3"/></g>';
      const ly = Math.min(q.y + 4, lastY - 15); lastY = ly;
      labels += ybText(q.x - bw / 2 - 10, ly, '<tspan class="yb-t-tee-n">' + t.t.toUpperCase() + '</tspan> ' + t.yd, 'yb-t yb-t-tee', { anchor: 'end' });
    });
    // the flag, a touch right of centre so it reads clear of 17's slope arrow
    const pin = [G[0] - lat[0] * gw * 0.3, G[1] - lat[1] * gw * 0.3];
    top += '<g class="yb-flag" transform="translate(' + r1(pin[0]) + ' ' + r1(pin[1]) + ')">' + flagBody() + '</g>';

    // ---- page furniture ----
    const yd = black, digits = String(n).length;
    const lx = I + 18 + digits * 40 + 10;
    const head = '<g class="yb-head"><rect class="yb-card is-clear" x="' + I + '" y="' + I + '" width="' + r1(lx + 112 - I) + '" height="96"/>' +
      '<text class="yb-no" x="' + (I + 14) + '" y="' + (I + 78) + '">' + n + '</text>' +
      '<text class="yb-hl" x="' + lx + '" y="' + (I + 36) + '">HOLE ' + n + '</text>' +
      '<text class="yb-par" x="' + lx + '" y="' + (I + 60) + '">PAR ' + esc(h.par) + ' · ' + yd + ' YD</text>' +
      '<text class="yb-si" x="' + lx + '" y="' + (I + 78) + '">Stroke index ' + esc(h.handicap) + '</text></g>';
    // compass: the plan has north to the right, so north turns with the page
    const na = Math.atan2(sa, ca), cxp = W - I - 36, cyp = I + 38;
    const compass = '<g class="yb-compass" transform="translate(' + cxp + ' ' + cyp + ')">' + compassBody(na) + '</g>';
    const stamp = '<g class="yb-stamp"><text class="yb-stamp-gur" x="' + (W - I - 12) + '" y="' + (I + 92) + '" text-anchor="end">Ground under repair</text><text class="yb-stamp-closed" x="' + (W - I - 12) + '" y="' + (I + 92) + '" text-anchor="end">Hole closed</text></g>';
    let bar = 50; if (bar * py < 44) bar = 100;
    const foot = '<g class="yb-foot" transform="translate(' + I + ' ' + (H - I - 30) + ')">' + footBody(W - 2 * I, bar * py, bar) + '</g>';

    const svg = '<svg class="yb-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Hole ' + n + ' yardage page: par ' + h.par + ', ' + yd + ' yards from the Black tee, tee at the bottom and green at the top, distance arcs every 25 yards to the centre of the green') + '">' +
      '<defs>' + defs + masks + '</defs>' +
      '<rect class="yb-paper" x="0" y="0" width="' + W + '" height="' + H + '"/>' +
      '<g clip-path="url(#' + uid + 'f)">' +
      '<g class="yb-l-base">' + base + '</g>' +
      '<g class="yb-l-water">' + wat + '</g>' +
      '<g class="yb-l-green">' + green + '</g>' +
      '<g class="yb-arcs" clip-path="url(#' + uid + 'r)">' + arcs + '</g>' +
      '<g class="yb-l-trees"><g class="yb-tree">' + treeB + '</g><g class="yb-tree-hl">' + treeH + '</g></g>' +
      '<g class="yb-l-top">' + top + '</g>' +
      '<g class="yb-l-labels">' + labels + '</g>' +
      '</g>' + head + compass + stamp + foot +
      '<rect class="yb-frame" x="' + I + '" y="' + I + '" width="' + (W - 2 * I) + '" height="' + (H - 2 * I) + '"/>' +
      '</svg>';
    return { svg: svg, water: info.water, trees: info.trees, marsh: info.marsh };
  }
  function bookLegend(n, b) {
    const it = function (cls, t) { return '<span><i class="yb-sw ' + cls + '"></i>' + t + '</span>'; };
    return it('is-fair', 'Fairway') + it('is-green', 'Green') + (b.trees ? it('is-tree', 'Trees') : '') + (b.water ? it('is-water', 'Water') : '') +
      (b.marsh ? it('is-marsh', 'Marsh') : '') + (n === 17 ? it('is-sand', 'Bunker') : '') + it('is-arc', 'Yards to centre of green');
  }

  /* ======================================================================
     Tab: Course status
     ====================================================================== */
  let statusOff = null;   /* removes the Status tab's document keydown and window resize listeners */
  function tabStatus(panel, initialHole) {
    const start = Math.round(+initialHole);
    let sel = start >= 1 && start <= 18 ? start : 0;   // selected hole, 0 = none
    let hot = 0;                                         // hole under the pointer or keyboard focus
    let intro = true;
    let condOpen = false;                                /* the conditions form sits in a collapsed row under the map */
    const statusOf = function (st, n) { return (st.holes.find(function (x) { return x.number === n; }) || {}).status || 'open'; };
    const countsOf = function (st) { const c = { open: 0, GUR: 0, closed: 0 }; st.holes.forEach(function (h) { c[h.status] = (c[h.status] || 0) + 1; }); return c; };

    function statsHTML(st) {
      const counts = countsOf(st);
      return ui.stats([
        { label: 'Course', value: st.open ? 'Open' : 'Closed', meta: st.open ? 'Tee sheet live' : 'No play today' },
        { label: 'Holes in play', value: st.open ? counts.open + counts.GUR : 0, suffix: '/ 18', meta: counts.GUR ? counts.GUR + ' with GUR' : (counts.closed ? counts.closed + ' closed' : 'All holes open') },
        { label: 'Cart rule', value: ({ '90 degree': '90°', 'Cart path only': 'Paths only' })[st.cartRule] || st.cartRule || 'Normal', meta: (st.cartRule === '90 degree' ? '90 degree rule, ' : st.cartRule === 'Cart path only' ? 'Cart path only, ' : '') + 'posted at the starter' },
        { label: 'Green speed', value: +st.greenSpeed || 0, decimals: 1, suffix: 'ft', meta: 'Stimpmeter, morning read' },
        { label: 'Firmness', value: st.firmness || 'Medium', meta: (st.pins || 'Middle') + ' pins' }
      ]);
    }
    function legendHTML(st) {
      const c = countsOf(st);
      return [['open', 'Open', c.open], ['gur', 'GUR', c.GUR], ['closed', 'Closed', c.closed]].map(function (k) {
        return '<span class="cg-leg is-' + k[0] + '"><i></i>' + k[1] + '<b class="num">' + k[2] + '</b></span>';
      }).join('');
    }
    function stripHTML(st) {
      return st.holes.map(function (x) {
        return '<button type="button" class="cg-strip-btn is-' + stKey(x.status) + (x.number === sel ? ' active' : '') + '" data-hole="' + x.number + '" aria-label="Hole ' + x.number + ', ' + ST_LONG[x.status] + '"' + (x.number === sel ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + x.number + '</button>';
      }).join('');
    }
    function detailHTML(st) {
      if (!sel) {
        const c = countsOf(st);
        const list = function (status) {
          const hs = st.holes.filter(function (h) { return h.status === status; });
          return hs.length ? hs.map(function (h) { return '<button type="button" class="cg-chip is-' + stKey(status) + '" data-hole="' + h.number + '">Hole ' + h.number + '</button>'; }).join('') : '<span class="muted">None</span>';
        };
        return '<div class="cg-dt cg-dt-empty">' +
          '<div class="eyebrow">Hole details</div><h3>Select a hole</h3>' +
          '<p class="ink-2">Choose a hole on the map or from the numbers below it to see its yardages and set its status.</p>' +
          '<dl class="cg-sum">' +
          '<div><dt><i class="cg-sw is-open"></i>Open</dt><dd class="num cg-sum-n">' + c.open + '</dd></div>' +
          '<div><dt><i class="cg-sw is-gur"></i>Ground under repair</dt><dd>' + list('GUR') + '</dd></div>' +
          '<div><dt><i class="cg-sw is-closed"></i>Closed</dt><dd>' + list('closed') + '</dd></div>' +
          '</dl><p class="muted cg-keys">Tip: once a hole is selected, the arrow keys move between holes and Escape clears the selection.</p></div>';
      }
      const h = holeDoc(sel), hs = statusOf(st, sel), bk = holeBook(sel);
      const prev = sel === 1 ? 18 : sel - 1, next = sel === 18 ? 1 : sel + 1;
      return '<div class="cg-dt is-' + stKey(hs) + '">' +
        '<div class="cg-dt-head"><span class="cg-dt-no">' + sel + '</span><div class="cg-dt-meta"><div class="eyebrow">Hole ' + sel + '</div>' +
        '<div class="cg-dt-par">Par ' + esc(h.par) + '</div><div class="ink-2 cg-dt-si">Stroke index ' + esc(h.handicap) + '</div></div>' +
        '<span class="cg-dt-status"><i></i><span class="cg-dt-status-text">' + esc(ST_LONG[hs]) + '</span></span></div>' +
        '<div class="cg-dt-set"><span class="cg-dt-set-l">Status</span>' + ui.segmented([{ value: 'open', label: 'Open' }, { value: 'GUR', label: 'GUR' }, { value: 'closed', label: 'Closed' }], hs, 'holeStatus') + '</div>' +
        '<div class="cg-yards">' + TEES.map(function (t) { return '<div><span class="cg-tee"><i class="cg-tee-dot ' + t + '"></i>' + t.charAt(0).toUpperCase() + t.slice(1) + '</span><strong class="num">' + (h.yards && h.yards[t] ? h.yards[t] : '–') + '</strong><span class="cg-yds">yds</span></div>'; }).join('') + '</div>' +
        '<figure class="yb"><div class="yb-bar"><span class="cg-yb-t">Yardage book</span>' +
        '<button type="button" class="btn btn-ghost btn-sm yb-enlarge" data-yb-enlarge aria-label="Enlarge the hole ' + sel + ' yardage page">' + EXPAND_ICON + '<span>Enlarge</span></button></div>' +
        '<div class="yb-page">' + bk.svg + '</div><figcaption class="yb-legend">' + bookLegend(sel, bk) + '</figcaption></figure>' +
        (sel === 17 ? '<p class="cg-hole-note">The signature hole. The Seine River runs along the left, with trees down the right. Two bunkers guard a green that slopes from back to front.</p>' : '') +
        '<div class="cg-dt-foot"><button type="button" class="btn btn-sm cg-step" data-step="-1" aria-label="Previous hole, hole ' + prev + '">' + Club.icon('chevronLeft') + '<span>Hole ' + prev + '</span></button>' +
        '<button type="button" class="cg-clear" data-clear>Clear selection</button>' +
        '<button type="button" class="btn btn-sm cg-step" data-step="1" aria-label="Next hole, hole ' + next + '"><span>Hole ' + next + '</span>' + Club.icon('chevronRight') + '</button></div>' +
        '</div>';
    }

    function draw(first) {
      const st = getStatus();
      panel.innerHTML =
        statsHTML(st) +
        '<div class="cg-status-grid">' +
        '<section class="panel cg-map-panel" data-reveal>' +
        '<div class="panel-head"><div><div class="eyebrow">Course map</div><h3>Hole status</h3></div><div class="cg-legend" aria-label="Legend">' + legendHTML(st) + '</div></div>' +
        '<div class="cg-map-wrap' + (st.open ? '' : ' is-course-closed') + (intro && !reduce ? ' cg-intro' : '') + '">' + mapSVG(st) +
        '<div class="cg-tip" role="tooltip" aria-hidden="true"></div>' +
        (st.open ? '' : '<div class="cg-closed-veil"><span>Course closed</span></div>') + '</div>' +
        '<div class="cg-strip" role="group" aria-label="Holes 1 to 18">' + stripHTML(st) + '</div>' +
        '<p class="cg-map-src">Routing, water and trees traced from the City of Winnipeg site plan; fairways and greens are drawn to a standard width. North is to the right.</p>' +
        '</section>' +
        '<section class="panel cg-detail" data-reveal aria-live="polite">' + detailHTML(st) + '</section>' +
        '</div>' +

        Portal.accordion({ id: 'cg-cond', icon: 'flag', open: condOpen, title: 'Today on the course',
          summary: (st.open ? 'Open' : 'Closed') + ' · ' + (st.cartRule || 'Normal') + ' · Greens ' + st.greenSpeed + ' ft · ' + (st.firmness || 'Medium') + ' · ' + (st.pins || 'Middle') + ' pins · Published ' + stamp(st.updatedAt).toLowerCase(),
          body: '<div class="cg-cond-grid"><form class="panel-body cg-cond-form" novalidate>' +
        '<div class="row between cg-open-row"><div><div class="person-name">Course open for play</div><div class="person-sub">Closing hides tee times from members</div></div><label class="toggle"><input type="checkbox" name="open"' + (st.open ? ' checked' : '') + ' aria-label="Course open"><span></span></label></div>' +
        '<div class="form-grid">' +
        ui.field({ label: 'Cart rule', name: 'cartRule', type: 'select', options: ui.options(CART_RULES, st.cartRule) }) +
        ui.field({ label: 'Green speed (ft)', name: 'greenSpeed', type: 'number', value: st.greenSpeed, min: 7, max: 15, step: 0.1, required: true }) +
        ui.field({ label: 'Firmness', name: 'firmness', type: 'select', options: ui.options(FIRMNESS, st.firmness) }) +
        '<div class="field"><label>Pin positions</label>' + ui.segmented([{ value: 'Front', label: 'Front' }, { value: 'Middle', label: 'Middle' }, { value: 'Back', label: 'Back' }], st.pins || 'Middle', 'pins') + '</div>' +
        '</div>' +
        ui.field({ label: 'Message to members', name: 'message', type: 'textarea', value: st.message, placeholder: 'Shown on the member app and starter board', hint: 'Keep it short and courteous.' }) +
        '<div class="row between wrap"><span class="muted cg-updated">' + Club.icon('clock') + 'Last updated ' + esc(stamp(st.updatedAt)) + '</span>' + ui.btn('Publish conditions', { kind: 'primary', icon: 'check', action: 'save-cond' }) + '</div>' +
        '</form>' +
        '<div class="cg-preview-col">' + (st.message ? '<div class="cg-preview"><div class="cg-preview-l">' + Club.icon('user') + 'As members see it</div><p>' + esc(st.message) + '</p><div class="cg-preview-meta">' + esc((st.open ? 'Course open' : 'Course closed') + ' · ' + st.cartRule + ' · Greens ' + st.greenSpeed + ' ft · ' + (st.pins || 'Middle') + ' pins') + '</div></div>' : '<div class="cg-preview is-empty"><div class="cg-preview-l">' + Club.icon('user') + 'As members see it</div><p class="muted">No message published yet.</p></div>') + '</div>' + '</div>' }).replace('class="pk-acc', 'class="cg-cond pk-acc');
      if (first !== true) settle(panel);
      const wrap = ui.$('.cg-map-wrap', panel);
      if (wrap.classList.contains('cg-intro')) setTimeout(function () { wrap.classList.remove('cg-intro'); }, 1600);
      intro = false;
      layout(); markSel();
    }

    /* ---------- map state ---------- */
    function svg() { return ui.$('.cg-map', panel); }
    // badges, type, outlines, compass and footer keep a constant screen size whatever the rendered width
    function layout() {
      const el = svg(); if (!el) return;
      const w = el.getBoundingClientRect().width || 700;
      const k = PLAN.w / w; // plan units per screen pixel
      el.style.setProperty('--k', k.toFixed(3));
      const phone = w < 480;
      // footer band below the plan, 30 screen px high inside the frame
      const fh = 30 * k, H = PLAN.h + fh;
      el.setAttribute('viewBox', '0 0 ' + PLAN.w + ' ' + r1(H));
      const fr = ui.$('.cg-frame', el); if (fr) fr.setAttribute('height', r1(H - 2 * OV_I));
      const foot = ui.$('.cg-foot', el);
      if (foot) {
        let bar = 100; if (bar / PLAN.ydPerUnit / k < 48) bar = 200;
        foot.setAttribute('transform', 'translate(' + OV_I + ' ' + r1(H - OV_I - fh) + ') scale(' + k.toFixed(3) + ')');
        foot.innerHTML = footBody((PLAN.w - 2 * OV_I) / k, bar / PLAN.ydPerUnit / k, bar);
      }
      const cs = k * (phone ? 0.62 : 0.8), comp = ui.$('.cg-compass', el);
      if (comp) comp.setAttribute('transform', 'translate(' + r1(OV_I + 36 * cs + 8 * k) + ' ' + r1(OV_I + 36 * cs + 8 * k) + ') scale(' + cs.toFixed(3) + ')');
      const r = (phone ? 11 : 14.5) * k;
      const pos = badgeLayout(r);
      ui.$$('.cg-badge', el).forEach(function (b, i) {
        b.setAttribute('transform', 'translate(' + r1(pos[i].x) + ' ' + r1(pos[i].y) + ')');
        ui.$('.cg-disc', b).setAttribute('r', r1(r));
        ui.$('.cg-ring', b).setAttribute('r', r1(r + 3.5 * k));
        ui.$('text', b).style.fontSize = r1(r * 1.02) + 'px';
      });
    }
    function markSel() {
      const wrap = ui.$('.cg-map-wrap', panel); if (!wrap) return;
      wrap.classList.toggle('has-sel', !!sel);
      ui.$$('.cg-hole, .cg-badge', wrap).forEach(function (g) { g.classList.toggle('is-selected', +g.dataset.hole === sel); });
      ui.$$('.cg-strip-btn', panel).forEach(function (b) { const on = +b.dataset.hole === sel; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    function setHot(n) {
      hot = n;
      const wrap = ui.$('.cg-map-wrap', panel); if (!wrap) return;
      wrap.classList.toggle('has-hot', !!n);
      ui.$$('.cg-hole, .cg-badge', wrap).forEach(function (g) { g.classList.toggle('is-hot', +g.dataset.hole === n); });
      const tip = ui.$('.cg-tip', wrap);
      if (!n) { tip.classList.remove('show'); return; }
      const st = getStatus(), h = holeDoc(n), status = statusOf(st, n);
      tip.innerHTML = '<i class="cg-sw is-' + stKey(status) + '"></i>Hole ' + n + ' · Par ' + esc(h.par) + ' · ' + esc((h.yards && h.yards.black) || '') + ' yds · ' + esc(ST_SHORT[status]);
      const b = ui.$('.cg-badge[data-hole="' + n + '"] .cg-disc', wrap);
      const br = b.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      tip.classList.add('show');
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = br.left + br.width / 2 - wr.left - tw / 2, y = br.top - wr.top - th - 8;
      if (y < 4) y = br.bottom - wr.top + 8;
      x = Math.max(4, Math.min(wr.width - tw - 4, x));
      tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
    function setRoute() {
      try { history.replaceState(null, '', '#/course/status' + (sel ? '/' + sel : '')); } catch (e) { /* ignore */ }
    }
    function renderDetail() {
      const d = ui.$('.cg-detail', panel); if (!d) return;
      d.innerHTML = detailHTML(getStatus());
    }
    function wrap(n) { return ((n - 1 + 36) % 18) + 1; }
    function select(n, focusFrom) {
      n = +n || 0;
      if (n === sel) return;
      sel = n;
      markSel(); renderDetail(); setRoute();
      // keep keyboard focus on the same kind of control the user was using
      if (focusFrom && n) {
        const t = focusFrom.closest && focusFrom.closest('.cg-strip-btn') ? ui.$('.cg-strip-btn[data-hole="' + n + '"]', panel)
          : focusFrom.closest && focusFrom.closest('.cg-hole') ? ui.$('g.cg-hole[data-hole="' + n + '"]', panel)
          : focusFrom.closest && focusFrom.closest('[data-step]') ? ui.$('[data-step="' + focusFrom.closest('[data-step]').dataset.step + '"]', panel) : null;
        if (t) t.focus({ preventScroll: true });
      }
      // on a phone the details sit below the map: bring them into view when picked from the map
      if (n && focusFrom && focusFrom.closest && focusFrom.closest('.cg-map') && window.innerWidth < 900) {
        const d = ui.$('.cg-detail', panel); if (d) d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }
    function setHoleStatus(n, value) {
      const st = getStatus();
      const holes = st.holes.map(function (h) { return h.number === n ? { number: h.number, status: value } : h; });
      const was = statusOf(st, n);
      const rec = Club.undo.track(function () { return saveStatus({ holes: holes }); });
      const next = rec.result;
      undoOffer('Hole ' + n + ' marked ' + (value === 'GUR' ? 'ground under repair' : value), rec, { check: statusGuard(), after: redraw,
        undone: 'Hole ' + n + ' is back to ' + (was === 'GUR' ? 'ground under repair' : was) });
      // update in place so colours transition: stats, legend, map, strip, details
      const stats = ui.$('.stats', panel);
      if (stats) { const fresh = ui.el(statsHTML(next)); stats.replaceWith(fresh); settle(fresh.parentNode || panel); }
      ui.$('.cg-legend', panel).innerHTML = legendHTML(next);
      const k = stKey(value);
      ui.$$('[data-hole="' + n + '"]', panel).forEach(function (g) {
        if (g.classList.contains('cg-chip')) return;
        g.classList.remove('is-open', 'is-gur', 'is-closed'); g.classList.add('is-' + k);
        if (g.classList.contains('cg-hole')) g.setAttribute('aria-label', holeAria(n, value));
        if (g.classList.contains('cg-strip-btn')) g.setAttribute('aria-label', 'Hole ' + n + ', ' + ST_LONG[value]);
      });
      const dt = ui.$('.cg-dt', panel);
      if (dt && n === sel) {
        dt.classList.remove('is-open', 'is-gur', 'is-closed'); dt.classList.add('is-' + k);
        ui.$('.cg-dt-status-text', dt).textContent = ST_LONG[value];
        ui.$$('.segmented[data-name=holeStatus] button', dt).forEach(function (x) { x.classList.toggle('active', x.dataset.value === value); });
      } else if (!sel) renderDetail();
      if (hot === n) setHot(n);
    }

    /* ---------- events ---------- */
    ui.on(panel, 'click', '[data-hole]', function (e, t) { select(+t.dataset.hole, t); });
    ui.on(panel, 'click', '[data-step]', function (e, b) { select(wrap((sel || 1) + (+b.dataset.step)), b); });
    ui.on(panel, 'click', '[data-yb-enlarge]', function () {
      if (!sel) return;
      const n = sel, hd = holeDoc(n), b = holeBook(n);
      ui.modal({ eyebrow: 'Yardage book', title: 'Hole ' + n + ' · Par ' + hd.par + ' · ' + ((hd.yards && hd.yards.black) || '') + ' yds', size: 'xl',
        body: '<figure class="yb yb-modal is-' + stKey(statusOf(getStatus(), n)) + '"><div class="yb-page">' + b.svg + '</div><figcaption class="yb-legend">' + bookLegend(n, b) + '</figcaption></figure>' });
    });
    ui.on(panel, 'click', '[data-clear]', function () {
      const n = sel; select(0);
      const g = ui.$('.cg-strip-btn[data-hole="' + n + '"]', panel); if (g) g.focus({ preventScroll: true });
    });
    ui.on(panel, 'keydown', 'g.cg-hole', function (e, t) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(+t.dataset.hole, t); } });
    ui.on(panel, 'mouseover', '.cg-map [data-hole]', function (e, t) { if (+t.dataset.hole !== hot) setHot(+t.dataset.hole); });
    ui.on(panel, 'mouseout', '.cg-map', function (e) {
      const to = e.relatedTarget; const inMap = to && to.closest && to.closest('.cg-map [data-hole]');
      if (!inMap) { const f = document.activeElement; setHot(f && f.closest && f.closest('g.cg-hole') && panel.contains(f) ? +f.closest('g.cg-hole').dataset.hole : 0); }
    });
    panel.addEventListener('focusin', function (e) { const g = e.target.closest && e.target.closest('g.cg-hole'); if (g) setHot(+g.dataset.hole); });
    panel.addEventListener('focusout', function (e) { const g = e.target.closest && e.target.closest('g.cg-hole'); if (g) setHot(0); });

    function alive() { if (document.body.contains(panel)) return true; document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); return false; }
    function onKey(e) {
      if (!alive() || !panel.offsetParent || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable || (t.closest && t.closest('[role=tablist]')))) return;
      if (document.querySelector('.overlay, .modal-backdrop, .modal.open, .drawer.open')) return;
      if (e.key === 'Escape' && sel) {
        e.preventDefault(); const n = sel; const onHole = t && t.closest && t.closest('g.cg-hole');
        select(0);
        // the detail controls are gone: hand focus back to the hole's number in the strip
        if (t && panel.contains(t) && !onHole && !document.body.contains(t)) { const g = ui.$('.cg-strip-btn[data-hole="' + n + '"]', panel); if (g) g.focus({ preventScroll: true }); }
      }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (sel || (t && panel.contains(t) && t.closest && t.closest('[data-hole]')))) {
        e.preventDefault();
        const base = sel || +t.closest('[data-hole]').dataset.hole - (e.key === 'ArrowRight' ? 1 : -1);
        select(wrap(base + (e.key === 'ArrowRight' ? 1 : -1)), panel.contains(t) ? t : null);
      }
    }
    let rt = 0;
    function onResize() { if (!alive()) return; clearTimeout(rt); rt = setTimeout(function () { layout(); if (hot) setHot(hot); }, 120); }
    /* Removed when this tab is drawn again or staff leave the page (the module's cleanup), not only on the next key press */
    if (statusOff) statusOff();
    statusOff = function () { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); clearTimeout(rt); statusOff = null; };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    ui.on(panel, 'click', '.segmented button', function (e, b) {
      const seg = b.closest('.segmented'); const name = seg.dataset.name;
      if (name === 'holeStatus') { if (sel && !b.classList.contains('active')) setHoleStatus(sel, b.dataset.value); }
      else ui.$$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); });
    });
    ui.on(panel, 'click', '[data-action=save-cond]', function () {
      const form = ui.$('.cg-cond-form', panel);
      if (!ui.validate(form)) return;
      const d = ui.formData(form);
      if (d.greenSpeed < 7 || d.greenSpeed > 15) { fieldError(form, 'greenSpeed', 'Enter a stimp reading between 7 and 15 feet.'); return; }
      const pinBtn = ui.$('.segmented[data-name=pins] button.active', form);
      const rec = Club.undo.track(function () { saveStatus({ open: d.open, cartRule: d.cartRule, greenSpeed: Math.round(d.greenSpeed * 10) / 10, firmness: d.firmness, pins: pinBtn ? pinBtn.dataset.value : 'Middle', message: d.message }); });
      undoOffer('Course conditions published', rec, { check: statusGuard(), after: redraw, undone: 'The earlier course conditions are back' });
      redraw();
    });
    function redraw() { if (!alive()) return; const y = window.scrollY; draw(); window.scrollTo(0, y); }
    ui.on(panel, 'submit', 'form', function (e) { e.preventDefault(); });
    ui.on(panel, 'accordion', '[data-acc="cg-cond"]', function (e) { condOpen = e.detail.open; });

    draw(true);
    // the tab panel may be laid out a frame later; size the badges once it has its real width
    requestAnimationFrame(function () { if (alive()) layout(); });
  }

  /* ======================================================================
     Tab: Work orders
     ====================================================================== */
  function woModal(w, after) {
    const isNew = !w; w = w || { priority: 'normal', status: 'open', dueDate: Club.date.fromToday(1), assigneeId: 'stf_9' };
    const holeOpts = '<option value="">No specific hole</option>' + Array.from({ length: 18 }, function (_, i) { const h = holeDoc(i + 1); return '<option value="' + (i + 1) + '"' + (w.hole === i + 1 ? ' selected' : '') + '>Hole ' + (i + 1) + ' · Par ' + esc(h.par) + '</option>'; }).join('');
    const eqOpts = '<option value="">None</option>' + S.all('equipment').filter(function (e) { return e.status !== 'retired' || e.id === w.equipmentId; }).map(function (e) { return '<option value="' + e.id + '"' + (e.id === w.equipmentId ? ' selected' : '') + '>' + esc(eqLabel(e)) + '</option>'; }).join('');
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Title', name: 'title', value: w.title, required: true, span2: true, placeholder: 'What needs doing' }) +
      ui.field({ label: 'Area', name: 'area', type: 'select', required: true, options: '<option value="">Choose area</option>' + ui.options(AREAS, w.area) }) +
      ui.field({ label: 'Hole', name: 'hole', type: 'select', options: holeOpts }) +
      ui.field({ label: 'Priority', name: 'priority', type: 'select', options: ui.options([{ value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }], w.priority) }) +
      ui.field({ label: 'Status', name: 'status', type: 'select', options: ui.options(COLS.map(function (c) { return { value: c.id, label: c.label }; }), w.status) }) +
      ui.field({ label: 'Assignee', name: 'assigneeId', type: 'select', required: true, options: '<option value="">Choose crew member</option>' + Club.staff.options(w.assigneeId, 'Agronomy') }) +
      ui.field({ label: 'Due date', name: 'dueDate', type: 'date', value: w.dueDate, required: true }) +
      ui.field({ label: 'Linked equipment', name: 'equipmentId', type: 'select', options: eqOpts, span2: true }) +
      ui.field({ label: 'Notes', name: 'notes', type: 'textarea', value: w.notes, span2: true, placeholder: 'Details for the crew' }) +
      '</form>';
    const actions = [];
    if (!isNew) actions.push({ label: 'Delete', kind: 'danger', icon: 'trash', onClick: function (api) {
      ui.confirm({ title: 'Delete work order?', text: '"' + w.title + '" will be removed permanently.', confirmLabel: 'Delete work order', danger: true }).then(function (ok) {
        if (!ok) return;
        undoRun(function () { S.remove('workOrders', w.id); }, { message: 'Work order deleted', after: after, undone: '"' + w.title + '" restored' });
        api.close(); after();
      });
      return false;
    } });
    actions.push({ label: 'Cancel', kind: 'ghost' });
    actions.push({ label: isNew ? 'Create work order' : 'Save work order', kind: 'primary', icon: 'check', onClick: function (api) {
      const form = ui.$('form', api.body);
      if (!ui.validate(form)) return false;
      const d = ui.formData(form);
      if (d.title.length < 4) { fieldError(form, 'title', 'Give the work order a descriptive title.'); return false; }
      const doc = { title: d.title, area: d.area, hole: d.hole ? +d.hole : null, priority: d.priority, status: d.status, assigneeId: d.assigneeId, dueDate: d.dueDate, equipmentId: d.equipmentId || null, notes: d.notes };
      undoRun(function () { return isNew ? S.insert('workOrders', doc) : S.update('workOrders', w.id, doc); },
        { message: isNew ? 'Work order created' : 'Work order saved', after: after, undone: isNew ? 'Work order removed' : 'Work order changes undone' });
      after();
    } });
    ui.modal({ title: isNew ? 'New work order' : 'Edit work order', eyebrow: isNew ? 'Course & grounds' : 'WO-' + String(w.id).replace(/\D/g, '').slice(-4), size: 'lg', body: body, actions: actions });
  }

  function tabWork(panel, openId) {
    let filter = 'all'; const showAll = {};
    function card(w) {
      const p = PRI[w.priority] || PRI.normal; const eq = w.equipmentId ? S.find('equipment', w.equipmentId) : null;
      const idx = COLS.findIndex(function (c) { return c.id === w.status; });
      const over = isOverdue(w);
      return '<article class="cg-card' + (over ? ' is-overdue' : '') + (w.status === 'done' ? ' is-done' : '') + '" data-id="' + esc(w.id) + '"' + (draggable() ? ' draggable="true"' : '') + '>' +
        '<div class="row between"><span>' + ui.badge(p[0], p[1]) + '</span>' + (over ? '<span class="cg-overdue">' + Club.icon('alert') + 'Overdue</span>' : '') + '</div>' +
        '<h4 class="cg-card-title"><button type="button" class="cg-link" data-action="edit-wo" data-id="' + esc(w.id) + '">' + esc(w.title) + '</button></h4>' +
        '<div class="cg-card-meta">' + Club.icon('pin') + '<span>' + esc(w.area || 'General') + (w.hole ? ' · Hole ' + w.hole : '') + '</span></div>' +
        (eq ? '<div class="cg-card-meta">' + Club.icon('tractor') + '<span>' + esc(eqLabel(eq)) + '</span></div>' : '') +
        '<div class="row between cg-card-foot">' + ui.person(Club.staff.name(w.assigneeId), '<span class="' + (over ? 'cg-due-bad' : '') + '">Due ' + esc(w.dueDate ? fmt.dateShort(w.dueDate) : 'unscheduled') + '</span>') +
        '<div class="row cg-moves">' +
        (idx > 0 ? ui.btn('', { icon: 'chevronLeft', sm: true, kind: 'ghost', action: 'move-wo', id: w.id + '|' + COLS[idx - 1].id, title: 'Move to ' + COLS[idx - 1].label }) : '') +
        (idx < COLS.length - 1 ? ui.btn('', { icon: 'chevronRight', sm: true, kind: 'ghost', action: 'move-wo', id: w.id + '|' + COLS[idx + 1].id, title: 'Move to ' + COLS[idx + 1].label }) : '') +
        '</div></div></article>';
    }
    function draw(first) {
      const all = S.all('workOrders');
      const list = all.filter(function (w) { return filter === 'all' || (filter === 'overdue' ? isOverdue(w) : w.assigneeId === filter); });
      const openCount = all.filter(function (w) { return w.status !== 'done'; }).length;
      const crew = S.all('staff').filter(function (s) { return s.department === 'Agronomy'; });
      panel.innerHTML =
        ui.stats([
          { label: 'Open orders', value: openCount, meta: 'Across the property' },
          { label: 'Urgent or high', value: all.filter(function (w) { return w.status !== 'done' && (w.priority === 'urgent' || w.priority === 'high'); }).length, meta: 'Shown in navigation' },
          { label: 'Overdue', value: all.filter(isOverdue).length, meta: 'Past due date' },
          { label: 'Completed', value: all.filter(function (w) { return w.status === 'done'; }).length, meta: 'Closed out' }
        ]) +
        '<div class="row between wrap cg-toolbar" data-reveal><div class="row wrap"><label class="cg-filter-l" for="cgWoFilter">Show</label><select class="select cg-filter" id="cgWoFilter" data-action="wo-filter">' +
        '<option value="all"' + (filter === 'all' ? ' selected' : '') + '>All work orders</option><option value="overdue"' + (filter === 'overdue' ? ' selected' : '') + '>Overdue only</option>' +
        crew.map(function (s) { return '<option value="' + s.id + '"' + (filter === s.id ? ' selected' : '') + '>' + esc(s.firstName + ' ' + s.lastName) + '</option>'; }).join('') + '</select>' +
        (draggable() ? '<span class="muted cg-hint">Drag cards between columns or use the arrows</span>' : '') + '</div>' +
        ui.btn('New work order', { kind: 'primary', icon: 'plus', action: 'new-wo' }) + '</div>' +
        '<div class="cg-board">' + COLS.map(function (c) {
          const items = list.filter(function (w) { return w.status === c.id; }).sort(function (a, b) { return c.id === 'done' ? String(b.dueDate).localeCompare(String(a.dueDate)) : (PRI_ORDER[a.priority] - PRI_ORDER[b.priority]) || String(a.dueDate).localeCompare(String(b.dueDate)); });
          const cap = showAll[c.id] ? items.length : (c.id === 'done' ? 4 : 5);
          return '<section class="cg-col is-' + c.id + '" data-col="' + c.id + '" data-reveal><header class="cg-col-head"><span class="cg-col-t">' + c.label + '</span><span class="cg-col-count">' + items.length + '</span></header><div class="cg-col-body">' +
            (items.length ? items.slice(0, cap).map(card).join('') + (items.length > cap ? '<button type="button" class="s-link cg-col-more" data-action="all-done" data-col-id="' + c.id + '">View all (' + items.length + ')</button>' : '') : '<div class="cg-col-empty">' + (c.id === 'done' ? 'Nothing completed yet' : 'No work orders here') + '</div>') + '</div></section>';
        }).join('') + '</div>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
    ui.on(panel, 'click', '[data-action=new-wo]', function () { woModal(null, refresh); });
    ui.on(panel, 'click', '[data-action=edit-wo]', function (e, b) { const w = S.find('workOrders', b.dataset.id); if (w) woModal(w, refresh); });
    ui.on(panel, 'click', '[data-action=move-wo]', function (e, b) { const p = b.dataset.id.split('|'); move(p[0], p[1]); });
    ui.on(panel, 'change', '[data-action=wo-filter]', function (e, s) { filter = s.value; refresh(); });
    ui.on(panel, 'click', '[data-action=all-done]', function (e, b) { showAll[b.dataset.colId] = true; refresh(); });
    function move(id, status) {
      const w = S.find('workOrders', id); if (!w || w.status === status) return;
      const from = (COLS.find(function (c) { return c.id === w.status; }) || COLS[0]).label.toLowerCase();
      undoRun(function () { S.update('workOrders', id, { status: status, completedAt: status === 'done' ? new Date().toISOString() : null }); },
        { message: 'Moved to ' + COLS.find(function (c) { return c.id === status; }).label.toLowerCase(), after: refresh, undone: 'Moved back to ' + from });
      refresh();
      const c = ui.$('.cg-card[data-id="' + id + '"]', panel); if (c) c.classList.add('cg-arrive');
    }
    // HTML5 drag and drop
    let dragId = null;
    panel.addEventListener('dragstart', function (e) { const c = e.target.closest && e.target.closest('.cg-card'); if (!c) return; dragId = c.dataset.id; c.classList.add('is-dragging'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* ignore */ } });
    panel.addEventListener('dragend', function () { dragId = null; ui.$$('.is-dragging, .is-over', panel).forEach(function (n) { n.classList.remove('is-dragging', 'is-over'); }); });
    panel.addEventListener('dragover', function (e) { const col = e.target.closest && e.target.closest('.cg-col'); if (!col || !dragId) return; e.preventDefault(); ui.$$('.cg-col.is-over', panel).forEach(function (n) { if (n !== col) n.classList.remove('is-over'); }); col.classList.add('is-over'); });
    panel.addEventListener('dragleave', function (e) { const col = e.target.closest && e.target.closest('.cg-col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
    panel.addEventListener('drop', function (e) { const col = e.target.closest && e.target.closest('.cg-col'); if (!col || !dragId) return; e.preventDefault(); const id = dragId; dragId = null; move(id, col.dataset.col); });
    draw(true);
    if (openId) { const w = S.find('workOrders', openId); if (w) setTimeout(function () { woModal(w, refresh); }, 250); }
  }

  /* ======================================================================
     Tab: Equipment fleet
     ====================================================================== */
  function eqModal(e, after) {
    const isNew = !e; e = e || { type: 'Mower', serviceIntervalHours: 250, hours: 0, lastServiceHours: 0, status: 'in-service' };
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Unit number', name: 'unitNo', value: e.unitNo, required: true, placeholder: 'e.g. F-04' }) +
      ui.field({ label: 'Type', name: 'type', type: 'select', options: ui.options(EQ_TYPES, e.type) }) +
      ui.field({ label: 'Description', name: 'name', value: e.name, required: true, span2: true, placeholder: 'e.g. Fairway mower' }) +
      ui.field({ label: 'Make', name: 'make', value: e.make, required: true }) +
      ui.field({ label: 'Model', name: 'model', value: e.model, required: true }) +
      ui.field({ label: 'Engine hours', name: 'hours', type: 'number', value: e.hours, min: 0, step: 1, required: true }) +
      ui.field({ label: 'Service interval (hours)', name: 'serviceIntervalHours', type: 'number', value: e.serviceIntervalHours, min: 10, step: 10, required: true }) +
      ui.field({ label: 'Hours at last service', name: 'lastServiceHours', type: 'number', value: e.lastServiceHours, min: 0, step: 1, required: true }) +
      ui.field({ label: 'Status', name: 'status', type: 'select', options: ui.options([{ value: 'in-service', label: 'In service' }, { value: 'in-shop', label: 'In shop' }, { value: 'retired', label: 'Retired' }], e.status) }) +
      '</form>';
    ui.modal({ title: isNew ? 'Add equipment' : 'Edit ' + e.unitNo, eyebrow: 'Equipment fleet', size: 'lg', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: isNew ? 'Add unit' : 'Save unit', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
        const d = ui.formData(form); let ok = true;
        const dup = S.all('equipment').find(function (x) { return x.unitNo.toLowerCase() === d.unitNo.toLowerCase() && x.id !== e.id; });
        if (dup) { fieldError(form, 'unitNo', 'Unit ' + dup.unitNo + ' already exists.'); ok = false; }
        if (d.hours < 0) { fieldError(form, 'hours', 'Hours cannot be negative.'); ok = false; }
        if (d.serviceIntervalHours < 10) { fieldError(form, 'serviceIntervalHours', 'Use an interval of at least 10 hours.'); ok = false; }
        if (d.lastServiceHours > d.hours) { fieldError(form, 'lastServiceHours', 'Cannot be more than current engine hours.'); ok = false; }
        if (!ok) return false;
        undoRun(function () { return isNew ? S.insert('equipment', Object.assign(d, { lastServiceDate: Club.date.today() })) : S.update('equipment', e.id, d); },
          { message: isNew ? 'Unit ' + d.unitNo + ' added' : 'Unit ' + d.unitNo + ' saved', after: after, undone: isNew ? 'Unit ' + d.unitNo + ' removed' : 'Unit ' + d.unitNo + ' changes undone' });
        after();
      } }
    ] });
  }
  function serviceModal(e, after) {
    const body = '<p class="ink-2">Record a completed service for <strong>' + esc(eqLabel(e)) + '</strong>. The service clock resets at the hours entered.</p><form class="form-grid" novalidate>' +
      ui.field({ label: 'Engine hours now', name: 'hours', type: 'number', value: e.hours, min: e.hours, step: 1, required: true }) +
      ui.field({ label: 'Service date', name: 'date', type: 'date', value: Club.date.today(), required: true }) +
      ui.field({ label: 'Work performed', name: 'notes', type: 'textarea', span2: true, placeholder: 'Oil and filter, grease points, reel check' }) + '</form>';
    ui.modal({ title: 'Log service', eyebrow: e.unitNo, body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Log service', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
        const d = ui.formData(form);
        if (d.hours < e.hours) { fieldError(form, 'hours', 'Hours cannot go below the current reading of ' + e.hours + '.'); return false; }
        undoRun(function () { S.update('equipment', e.id, { hours: d.hours, lastServiceHours: d.hours, lastServiceDate: d.date, lastServiceNotes: d.notes, status: e.status === 'retired' ? 'retired' : 'in-service' }); },
          { message: 'Service logged for ' + e.unitNo, after: after, undone: 'Service entry for ' + e.unitNo + ' removed' });
        after();
      } }
    ] });
  }
  function tabEquipment(panel) {
    let type = 'all', page = 1;
    function draw(first) {
      const all = S.all('equipment');
      const allRows = all.filter(function (e) { return type === 'all' || e.type === type; }).slice().sort(function (a, b) { return a.unitNo.localeCompare(b.unitNo); });
      const per = phone() ? 6 : 10;
      page = Math.max(1, Math.min(Math.ceil(allRows.length / per) || 1, page));
      const rows = allRows.slice((page - 1) * per, page * per);
      const active = all.filter(function (e) { return e.status !== 'retired'; });
      const due = active.filter(function (e) { const s = svcInfo(e).state; return s === 'due' || s === 'overdue'; }).length;
      panel.innerHTML = ui.stats([
        { label: 'Fleet units', value: active.length, meta: all.length - active.length ? (all.length - active.length) + ' retired' : 'All active' },
        { label: 'In service', value: active.filter(function (e) { return e.status === 'in-service'; }).length, meta: 'Ready for the crew' },
        { label: 'In shop', value: active.filter(function (e) { return e.status === 'in-shop'; }).length, meta: 'With the equipment manager' },
        { label: 'Service due', value: due, meta: 'Due or overdue' }
      ]) +
        '<section class="panel cg-eq" data-reveal><div class="panel-head wrap"><div><div class="eyebrow">Maintenance facility</div><h3>Equipment fleet</h3></div><div class="row wrap">' +
        ui.segmented([{ value: 'all', label: 'All' }].concat(EQ_TYPES.map(function (t) { return { value: t, label: t === 'Utility vehicle' ? 'Utility' : t }; })), type, 'eqType') +
        ui.btn('Add equipment', { kind: 'primary', icon: 'plus', action: 'new-eq' }) + '</div></div>' +
        '<div class="panel-body flush">' + (rows.length ? '<div class="table-wrap"><table class="table cg-eq-table"><thead><tr><th>Unit</th><th>Equipment</th><th>Type</th><th class="num">Hours</th><th>Service interval</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>' +
        rows.map(function (e) {
          const s = svcInfo(e); const pct = Math.min(100, Math.round(s.pct * 100)); const st = EQ_STATUS[e.status] || EQ_STATUS['in-service'];
          const svcBadge = s.state === 'overdue' ? ui.badge('Overdue ' + Math.abs(s.left) + ' h', 'bad') : s.state === 'due' ? ui.badge('Due in ' + s.left + ' h', 'warn') : '';
          return '<tr' + (e.status === 'retired' ? ' class="cg-retired"' : '') + '><td class="primary-cell nowrap cg-unit">' + esc(e.unitNo) + '</td>' +
            '<td><div class="person-name">' + esc(e.make + ' ' + e.model) + '</div><div class="person-sub">' + esc(e.name) + '</div></td>' +
            '<td class="ink-2 nowrap">' + esc(e.type) + '</td><td class="num">' + fmt.num(e.hours) + '</td>' +
            '<td class="cg-svc"><div class="row between"><span class="num ink-2">' + fmt.num(s.used) + ' / ' + fmt.num(e.serviceIntervalHours) + ' h</span>' + svcBadge + '</div><div class="bar cg-bar-' + s.state + '"><span style="width:' + pct + '%"></span></div></td>' +
            '<td>' + ui.badge(st[0], st[1]) + '</td>' +
            '<td class="right nowrap">' + (e.status !== 'retired' ? ui.btn('Log service', { sm: true, action: 'svc-eq', id: e.id }) + (e.status === 'in-shop' ? ui.btn('Return', { sm: true, kind: 'ghost', icon: 'check', action: 'ret-eq', id: e.id, title: 'Return ' + e.unitNo + ' to service' }) : ui.btn('To shop', { sm: true, kind: 'ghost', icon: 'maintenance', action: 'shop-eq', id: e.id, title: 'Send ' + e.unitNo + ' to shop' })) : '') +
            ui.btn('', { sm: true, kind: 'ghost', icon: 'edit', action: 'edit-eq', id: e.id, title: 'Edit ' + e.unitNo }) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + pager(page, allRows.length, per) : ui.empty({ icon: 'tractor', title: 'No equipment of this type', text: 'Add a unit to start tracking hours and service.' })) + '</div></section>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
    ui.on(panel, 'click', '.segmented button', function (e, b) { type = b.dataset.value; page = 1; refresh(); });
    ui.on(panel, 'click', '.cg-pager-n', function (e, b) { if (b.disabled) return; page = +b.dataset.page; refresh(); });
    ui.on(panel, 'click', '[data-action=new-eq]', function () { eqModal(null, refresh); });
    ui.on(panel, 'click', '[data-action=edit-eq]', function (e, b) { const x = S.find('equipment', b.dataset.id); if (x) eqModal(x, refresh); });
    ui.on(panel, 'click', '[data-action=svc-eq]', function (e, b) { const x = S.find('equipment', b.dataset.id); if (x) serviceModal(x, refresh); });
    ui.on(panel, 'click', '[data-action=shop-eq]', function (e, b) {
      const u = S.find('equipment', b.dataset.id); if (!u) return;
      undoRun(function () { return S.update('equipment', u.id, { status: 'in-shop' }); }, { message: u.unitNo + ' sent to the shop', after: refresh, undone: u.unitNo + ' is back in service' }); refresh();
    });
    ui.on(panel, 'click', '[data-action=ret-eq]', function (e, b) {
      const u = S.find('equipment', b.dataset.id); if (!u) return;
      undoRun(function () { return S.update('equipment', u.id, { status: 'in-service' }); }, { message: u.unitNo + ' returned to service', after: refresh, undone: u.unitNo + ' is back in the shop' }); refresh();
    });
    draw(true);
  }

  /* ======================================================================
     Tab: Golf carts
     ====================================================================== */
  function tabCarts(panel) {
    let filter = 'all'; let changed = [];
    function draw(first) {
      const all = S.all('carts').slice().sort(function (a, b) { return a.number - b.number; });
      const c = { available: 0, out: 0, charging: 0, maintenance: 0 };
      all.forEach(function (x) { c[x.status] = (c[x.status] || 0) + 1; });
      const rows = all.filter(function (x) { return filter === 'all' || (filter === 'low' ? x.battery < 30 : x.status === filter); });
      const avgBatt = all.length ? Math.round(all.reduce(function (a, x) { return a + (+x.battery || 0); }, 0) / all.length) : 0;
      const low = all.filter(function (x) { return x.battery < 40 && (x.status === 'available'); }).length;
      panel.innerHTML = ui.stats([
        { label: 'Available', value: c.available, meta: 'Ready at the cart barn' },
        { label: 'On course', value: c.out, meta: '<span class="live-dot"></span> Live' },
        { label: 'Charging', value: c.charging, meta: 'On the chargers' },
        { label: 'Maintenance', value: c.maintenance, meta: 'Out of rotation' },
        { label: 'Average charge', value: avgBatt, suffix: '%', meta: 'Fleet of ' + all.length }
      ]) +
        '<section class="panel" data-reveal><div class="panel-head wrap"><div><div class="eyebrow">Cart barn</div><h3>Golf cart fleet</h3></div><div class="row wrap">' +
        ui.segmented([{ value: 'all', label: 'All ' + all.length }, { value: 'available', label: 'Available ' + c.available }, { value: 'out', label: 'Out ' + c.out }, { value: 'charging', label: 'Charging ' + c.charging }, { value: 'maintenance', label: 'Shop ' + c.maintenance }, { value: 'low', label: 'Low battery' }], filter, 'cartFilter') +
        ui.btn('Charge low carts', { kind: 'ghost', icon: 'refresh', action: 'charge-low', title: low ? 'Send ' + low + ' available carts under 40% to charge' : 'No available carts under 40%' }) + '</div></div>' +
        '<div class="panel-body">' + (rows.length ? '<div class="cg-carts">' + rows.map(function (x) {
          const st = CART_STATUS[x.status] || CART_STATUS.available; const lowB = x.battery < 30;
          return '<button type="button" class="cg-cart is-' + x.status + (changed.indexOf(x.id) >= 0 ? ' cg-flip' : '') + '" data-id="' + x.id + '" aria-label="Cart ' + x.number + ', ' + st[0] + ', battery ' + x.battery + '%">' +
            '<span class="cg-cart-top"><span class="cg-cart-no num">' + x.number + '</span><span class="cg-cart-dot"></span></span>' +
            '<span class="cg-batt' + (lowB ? ' low' : '') + '"><i style="width:' + Math.max(3, Math.min(100, x.battery)) + '%"></i></span>' +
            '<span class="cg-cart-foot"><span>' + esc(st[2]) + '</span><span class="num">' + x.battery + '%</span></span></button>';
        }).join('') + '</div>' : ui.empty({ icon: 'cart', title: 'No carts match', text: 'Try a different filter.' })) + '</div></section>';
      changed = [];
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
    ui.on(panel, 'click', '.segmented button', function (e, b) { filter = b.dataset.value; refresh(); });
    ui.on(panel, 'click', '[data-action=charge-low]', function () {
      const low = S.all('carts').filter(function (x) { return x.status === 'available' && x.battery < 40; });
      if (!low.length) { ui.toast('No available carts are below 40%'); return; }
      undoRun(function () { low.forEach(function (x) { S.update('carts', x.id, { status: 'charging', lastCheck: Club.date.today() }); changed.push(x.id); }); },
        { message: low.length + ' cart' + (low.length > 1 ? 's' : '') + ' sent to charge', after: function () { changed = low.map(function (x) { return x.id; }); refresh(); }, undone: low.length > 1 ? 'Carts back to available' : 'Cart back to available' });
      refresh();
    });
    ui.on(panel, 'click', '.cg-cart', function (e, b) {
      const x = S.find('carts', b.dataset.id); if (!x) return;
      const body = '<form novalidate><div class="field"><label>Status</label>' + ui.segmented(Object.keys(CART_STATUS).map(function (k) { return { value: k, label: CART_STATUS[k][0] }; }), x.status, 'cartStatus') + '</div>' +
        ui.field({ label: 'Battery level (%)', name: 'battery', type: 'number', value: x.battery, min: 0, max: 100, step: 1, required: true }) +
        '<p class="muted">Last checked ' + esc(fmt.date(x.lastCheck)) + '.</p></form>';
      const m = ui.modal({ title: 'Cart ' + x.number, eyebrow: 'Golf cart', body: body, actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Save cart', kind: 'primary', icon: 'check', onClick: function (api) {
          const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
          const d = ui.formData(form);
          if (d.battery < 0 || d.battery > 100) { fieldError(form, 'battery', 'Battery must be between 0 and 100.'); return false; }
          const sb = ui.$('.segmented button.active', form);
          undoRun(function () { S.update('carts', x.id, { status: sb ? sb.dataset.value : x.status, battery: Math.round(d.battery), lastCheck: Club.date.today() }); },
            { message: 'Cart ' + x.number + ' updated', after: function () { changed = [x.id]; refresh(); }, undone: 'Cart ' + x.number + ' is back as it was' });
          changed.push(x.id); refresh();
        } }
      ] });
      ui.on(m.body, 'click', '.segmented button', function (ev, sb) { ui.$$('.segmented button', m.body).forEach(function (n) { n.classList.toggle('active', n === sb); }); });
    });
    draw(true);
  }

  /* ======================================================================
     Tab: Chemical log
     ====================================================================== */
  function appliedAt(l) { const p = String(l.time || '06:00').split(':'); const d = fmt.toDate(l.date); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0); return d; }
  /* Records are Canadian: °C, km/h and a PCP number. Older records saved in °F / mph / EPA format are converted for display. */
  function tempOf(l) { return l.tempC != null ? l.tempC : (l.tempF != null ? Math.round((l.tempF - 32) * 5 / 9) : ''); }
  function windOf(l) { return l.windKmh != null ? l.windKmh : (l.windMph != null ? Math.round(l.windMph * 1.609) : ''); }
  function pcpLabel(l) { return l.pcpReg ? 'PCP ' + l.pcpReg : (l.epaReg || ''); }
  function reiEnd(l) { return new Date(appliedAt(l).getTime() + (+l.reentryHours || 0) * 3600000); }
  function chemModal(after) {
    const body = '<form class="form-grid" novalidate>' +
      ui.field({ label: 'Application date', name: 'date', type: 'date', value: Club.date.today(), required: true }) +
      ui.field({ label: 'Start time', name: 'time', type: 'time', value: '06:00', required: true }) +
      ui.field({ label: 'Product', name: 'product', required: true, placeholder: 'Trade name' }) +
      ui.field({ label: 'PCP registration no.', name: 'pcpReg', required: true, placeholder: '28537', hint: 'Pest Control Products Act number on the label' }) +
      ui.field({ label: 'Target pest', name: 'target', required: true, placeholder: 'e.g. Dollar spot' }) +
      ui.field({ label: 'Area treated', name: 'area', required: true, placeholder: 'e.g. Greens, all 18' }) +
      ui.field({ label: 'Rate', name: 'rate', type: 'number', min: 0, step: 0.001, required: true }) +
      ui.field({ label: 'Unit', name: 'unit', type: 'select', options: ui.options(UNITS, UNITS[0]) }) +
      ui.field({ label: 'Applicator', name: 'appliedBy', type: 'select', required: true, options: '<option value="">Choose licensed applicator</option>' + Club.staff.options('stf_7', 'Agronomy') }) +
      ui.field({ label: 'Re-entry interval (hours)', name: 'reentryHours', type: 'number', min: 0, max: 168, step: 1, value: 12, required: true }) +
      ui.field({ label: 'Wind (km/h)', name: 'windKmh', type: 'number', min: 0, max: 60, step: 1, required: true, hint: 'Label limit is 16 km/h' }) +
      ui.field({ label: 'Temperature (°C)', name: 'tempC', type: 'number', min: -10, max: 45, step: 1, required: true }) +
      '</form>';
    ui.modal({ title: 'Record application', eyebrow: 'Chemical log', size: 'lg', body: body, actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save record', kind: 'primary', icon: 'check', onClick: function (api) {
        const form = ui.$('form', api.body); if (!ui.validate(form)) return false;
        const d = ui.formData(form); let ok = true;
        const pcp = String(d.pcpReg || '').trim().replace(/^PCP\s*(No\.?|#)?\s*/i, '');
        if (!/^\d{4,6}$/.test(pcp)) { fieldError(form, 'pcpReg', 'Enter the PCP number as printed on the label, for example 28537.'); ok = false; } else d.pcpReg = pcp;
        if (!(d.rate > 0)) { fieldError(form, 'rate', 'Rate must be greater than zero.'); ok = false; }
        if (d.windKmh > 16) { fieldError(form, 'windKmh', 'Wind above 16 km/h exceeds label limits. Postpone the application.'); ok = false; }
        if (d.windKmh < 0) { fieldError(form, 'windKmh', 'Wind cannot be negative.'); ok = false; }
        if (d.tempC < 0 || d.tempC > 35) { fieldError(form, 'tempC', 'Outside the 0 to 35 °C application window.'); ok = false; }
        if (d.reentryHours < 0 || d.reentryHours > 168) { fieldError(form, 'reentryHours', 'Enter between 0 and 168 hours.'); ok = false; }
        if (d.date > Club.date.today()) { fieldError(form, 'date', 'Records are for completed applications. Date cannot be in the future.'); ok = false; }
        if (!ok) { const f = ui.$('.invalid', form); if (f) f.focus(); return false; }
        undoRun(function () { S.insert('chemicalLogs', d); }, { message: 'Application recorded', after: after, undone: 'Application record removed' });
        after();
      } }
    ] });
  }
  function tabChem(panel) {
    let showAll = false;
    function draw(first) {
      const now = new Date();
      const logs = S.all('chemicalLogs').slice().sort(function (a, b) { return appliedAt(b) - appliedAt(a); });
      const active = logs.filter(function (l) { return reiEnd(l) > now; });
      const thirty = Club.date.fromToday(-30);
      panel.innerHTML =
        (active.length ? active.map(function (l) {
          return '<div class="cg-rei" data-reveal role="status">' + Club.icon('alert') + '<div><div class="cg-rei-title">Re-entry in effect · ' + esc(l.area) + '</div><div class="ink-2">' + esc(l.product) + ' applied at ' + esc(fmt.time(l.time)) + ' for ' + esc(l.target.toLowerCase()) + '. Keep members and crew off until <strong>' + esc(stamp(reiEnd(l).toISOString())) + '</strong>.</div></div></div>';
        }).join('') : '<div class="cg-rei clear" data-reveal>' + Club.icon('check') + '<div><div class="cg-rei-title">No re-entry restrictions</div><div class="ink-2">All treated areas are clear for play.</div></div></div>') +
        ui.stats([
          { label: 'Applications, 30 days', value: logs.filter(function (l) { return l.date >= thirty; }).length },
          { label: 'Products used', value: new Set(logs.map(function (l) { return l.product; })).size, meta: 'All time' },
          { label: 'Active REIs', value: active.length, meta: active.length ? 'Areas restricted' : 'All clear' }
        ]) +
        '<section class="panel" data-reveal><div class="panel-head wrap"><div><div class="eyebrow">Pesticide application records</div><h3>Chemical log</h3></div>' + ui.btn('Record application', { kind: 'primary', icon: 'plus', action: 'new-chem' }) + '</div>' +
        '<div class="panel-body flush">' + (logs.length ? '<div class="table-wrap"><table class="table cg-chem"><thead><tr><th>Date</th><th>Product</th><th>PCP reg.</th><th>Target</th><th>Area</th><th class="num">Rate</th><th>Applicator</th><th class="num">Wind</th><th class="num">Temp</th><th>REI</th><th></th></tr></thead><tbody>' +
        logs.slice(0, showAll ? logs.length : 10).map(function (l) {
          const live = reiEnd(l) > now;
          return '<tr' + (live ? ' class="cg-rei-row"' : '') + '><td class="nowrap">' + esc(fmt.dateShort(l.date)) + '<div class="person-sub">' + esc(fmt.time(l.time)) + '</div></td><td class="primary-cell">' + esc(l.product) + '</td><td class="num nowrap">' + esc(pcpLabel(l)) + '</td><td>' + esc(l.target) + '</td><td>' + esc(l.area) + '</td>' +
            '<td class="num nowrap">' + esc(l.rate) + ' <span class="muted">' + esc(l.unit) + '</span></td><td class="nowrap">' + esc(Club.staff.name(l.appliedBy)) + '</td><td class="num">' + esc(windOf(l)) + ' km/h</td><td class="num">' + esc(tempOf(l)) + ' °C</td>' +
            '<td class="nowrap">' + (live ? ui.badge('In effect', 'bad') : '<span class="muted">' + esc(l.reentryHours) + ' h</span>') + '</td>' +
            '<td>' + ui.btn('', { sm: true, kind: 'ghost', icon: 'trash', action: 'del-chem', id: l.id, title: 'Delete record' }) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (logs.length > 10 && !showAll ? '<div class="cg-more"><button type="button" class="s-link" data-action="chem-all">Show all ' + logs.length + ' records</button></div>' : '') : ui.empty({ icon: 'flask', title: 'No applications recorded', text: 'Every pesticide application should be logged here for compliance.', action: ui.btn('Record application', { kind: 'primary', icon: 'plus', action: 'new-chem' }) })) + '</div></section>';
      if (first !== true) settle(panel);
    }
    function refresh() { const y = window.scrollY; draw(); window.scrollTo(0, y); }
    ui.on(panel, 'click', '[data-action=new-chem]', function () { chemModal(refresh); });
    ui.on(panel, 'click', '[data-action=chem-all]', function () { showAll = true; refresh(); });
    ui.on(panel, 'click', '[data-action=del-chem]', function (e, b) {
      const l = S.find('chemicalLogs', b.dataset.id); if (!l) return;
      ui.confirm({ title: 'Delete application record?', text: 'Compliance records should normally be kept. Delete the ' + l.product + ' record from ' + fmt.date(l.date) + '?', confirmLabel: 'Delete record', danger: true }).then(function (ok) {
        if (ok) { undoRun(function () { S.remove('chemicalLogs', l.id); }, { message: 'Record deleted', after: refresh, undone: 'The ' + l.product + ' record is back' }); refresh(); }
      });
    });
    draw(true);
  }

  /* ======================================================================
     Tab: Weather & agronomy
     ====================================================================== */
  function trend(values, labels, o) {
    const W = 640, H = o.height || 200, pl = 40, pr = 12, pt = 14, pb = 26;
    if (!values.length) return '';
    const ext = o.target != null ? values.concat([o.target]) : values;
    let mn = Math.min.apply(null, ext), mx = Math.max.apply(null, ext);
    mn = Math.floor((mn - o.pad) * 2) / 2; mx = Math.ceil((mx + o.pad) * 2) / 2; if (mx === mn) mx = mn + 1;
    const n = values.length;
    const x = function (i) { return pl + (n <= 1 ? 0 : i * (W - pl - pr) / (n - 1)); };
    const y = function (v) { return pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn)); };
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">';
    for (let g = 0; g <= 4; g++) { const v = mn + (mx - mn) * g / 4; s += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v.toFixed(o.dec == null ? 1 : o.dec) + '</text>'; }
    if (o.target != null) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(o.target) + '" y2="' + y(o.target) + '" stroke="var(--brass)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/><text x="' + (W - pr) + '" y="' + (y(o.target) - 6) + '" text-anchor="end" style="fill:var(--brass-ink)">' + esc(o.targetLabel) + '</text>';
    const step = Math.ceil(n / 8);
    labels.forEach(function (l, i) { if ((n - 1 - i) % step === 0) s += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    const pts = values.map(function (v, i) { return x(i) + ',' + y(v); });
    s += '<path class="chart-area" d="M' + x(0) + ',' + y(mn) + ' L' + pts.join(' L') + ' L' + x(n - 1) + ',' + y(mn) + ' Z" fill="' + o.color + '" opacity="0.08"/>';
    s += '<polyline class="chart-line" points="' + pts.join(' ') + '" fill="none" stroke="' + o.color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>';
    values.forEach(function (v, i) { s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="8" fill="transparent" data-tip="' + esc(labels[i] + ' · ' + v + ' ' + o.suffix) + '"/>'; });
    s += '<circle cx="' + x(n - 1) + '" cy="' + y(values[n - 1]) + '" r="3.5" fill="' + o.color + '"/>';
    return '<div class="chart-wrap">' + s + '</svg></div>';
  }
  function tabWeather(panel) {
    function draw(first) {
      const fc = (Club.weather && Club.weather.forecast) || [];
      const rd = S.all('agronomyReadings').slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(-30);
      const labels = rd.map(function (r) { return fmt.dateShort(r.date); });
      // rainfall and ET: the live 30 day history from Open-Meteo when there is one, else the crew's seeded gauge readings.
      // Soil moisture and green speed are always crew readings.
      const wx = Club.weather || {}, hist = Array.isArray(wx.history) ? wx.history.filter(function (h) { return h && h.date; }) : [];
      const useHist = hist.length > 0;
      const wb = useHist ? hist.slice(-30).map(function (h) { return { date: h.date, rainfall: +h.rain || 0, et: +h.et || 0 }; }) : rd;
      const wbLabels = wb.map(function (r) { return fmt.dateShort(r.date); });
      const rain = wb.reduce(function (a, r) { return a + (+r.rainfall || 0); }, 0), et = wb.reduce(function (a, r) { return a + (+r.et || 0); }, 0);
      const wbSrc = useHist ? 'Open-Meteo, last ' + wb.length + ' days' : 'Crew gauge readings';
      const upd = wx.updatedAt ? new Date(wx.updatedAt) : null;
      const wxNote = wx.live ? 'Live from Open-Meteo' + (upd && !isNaN(upd) ? ', updated ' + (Club.date.iso(upd) === today() ? '' : fmt.dateShort(Club.date.iso(upd)) + ' ') + fmt.time(upd) : '') : 'Demo forecast, live weather unavailable';
      const last = rd[rd.length - 1] || {};
      const st = getStatus();
      const hasToday = rd.some(function (r) { return r.date === today(); });
      panel.innerHTML =
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Seven day outlook</div><h3>Forecast</h3></div><div class="cg-fc-side"><span class="cg-wx-src' + (wx.live ? ' is-live' : '') + '"><i></i>' + esc(wxNote) + '</span><span class="muted cg-fc-note">Spray window: wind under 16 km/h, no rain within 24 hours</span></div></div>' +
        '<div class="cg-forecast">' + (fc.length ? fc.map(function (d, i) {
          const sprayOk = d.wind <= 16 && d.rain < 40 && (!fc[i + 1] || fc[i + 1].rain < 50);
          return '<div class="cg-day' + (i === 0 ? ' is-today' : '') + '"><div class="cg-day-name">' + (i === 0 ? 'Today' : esc(fmt.weekday(d.date))) + '</div><div class="muted cg-day-date">' + esc(fmt.dateShort(d.date)) + '</div>' + Club.icon(d.icon, 'cg-wx') +
            '<div class="cg-temps"><strong class="num">' + d.hi + '°</strong><span class="muted">' + d.lo + '°</span></div><div class="cg-day-cond">' + esc(d.cond) + '</div>' +
            '<div class="cg-day-meta"><span>' + Club.icon('drop') + d.rain + '%</span><span>' + Club.icon('wind') + d.wind + ' km/h</span></div>' +
            '<div class="cg-spray ' + (sprayOk ? 'ok' : 'no') + '">' + (sprayOk ? 'Spray window' : 'Hold sprays') + '</div></div>';
        }).join('') : ui.empty({ icon: 'cloud', title: 'Forecast unavailable' })) + '</div></section>' +
        ui.stats([
          { label: 'Rainfall, 30 days', value: Math.round(rain * 10) / 10, decimals: 1, suffix: 'mm', meta: wbSrc },
          { label: 'Evapotranspiration', value: Math.round(et * 10) / 10, decimals: 1, suffix: 'mm', meta: useHist ? '30 day reference ET (FAO)' : '30 day ET' },
          { label: 'Water balance', value: (rain - et >= 0 ? '+' : '') + (rain - et).toFixed(1), suffix: 'mm', meta: rain - et < 0 ? 'Deficit, irrigation required' : 'Surplus' },
          { label: 'Soil moisture', value: +last.soilMoisture || 0, decimals: 1, suffix: '%', meta: 'Greens average, latest' },
          { label: 'Green speed', value: +last.greenSpeed || 0, decimals: 1, suffix: 'ft', meta: 'Latest stimp' }
        ]) +
        '<div class="grid grid-2 cg-agro">' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Water budget</div><h3>Rainfall and ET</h3></div><span class="muted">Millimetres per day · ' + esc(useHist ? 'Open-Meteo' : 'crew gauge') + '</span></div><div class="panel-body">' +
        (wb.length ? Club.charts.bar({ labels: wbLabels, series: [{ name: 'Rainfall', values: wb.map(function (r) { return +r.rainfall || 0; }), color: 'var(--c4)' }, { name: 'ET', values: wb.map(function (r) { return +r.et || 0; }), color: 'var(--c2)' }], height: 220 }) : ui.empty({ icon: 'drop', title: 'No readings yet' })) + '</div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Putting surfaces</div><h3>Green speed trend</h3></div><span class="muted">Stimpmeter, feet</span></div><div class="panel-body">' +
        (rd.length ? trend(rd.map(function (r) { return +r.greenSpeed || 0; }), labels, { color: 'var(--c1)', pad: 0.3, suffix: 'ft', target: 11.5, targetLabel: 'Member play target 11.5' }) : ui.empty({ icon: 'flag', title: 'No readings yet' })) + '</div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Root zone</div><h3>Soil moisture</h3></div><span class="muted">Volumetric water content, %</span></div><div class="panel-body">' +
        (rd.length ? trend(rd.map(function (r) { return +r.soilMoisture || 0; }), labels, { color: 'var(--c3)', pad: 2, suffix: '%', dec: 0, target: 20, targetLabel: 'Wilt threshold 20%' }) : ui.empty({ icon: 'drop', title: 'No readings yet' })) + '</div></section>' +
        '<section class="panel" data-reveal><div class="panel-head"><div><div class="eyebrow">Daily round</div><h3>' + (hasToday ? 'Update today’s readings' : 'Record today’s readings') + '</h3></div></div>' +
        '<form class="panel-body cg-read-form" novalidate><div class="form-grid">' +
        ui.field({ label: 'Rainfall (mm)', name: 'rainfall', type: 'number', min: 0, max: 250, step: 0.1, required: true, value: hasToday ? last.rainfall : 0 }) +
        ui.field({ label: 'ET (mm)', name: 'et', type: 'number', min: 0, max: 25, step: 0.1, required: true, value: hasToday ? last.et : '' }) +
        ui.field({ label: 'Soil moisture (%)', name: 'soilMoisture', type: 'number', min: 0, max: 60, step: 0.1, required: true, value: hasToday ? last.soilMoisture : '' }) +
        ui.field({ label: 'Green speed (ft)', name: 'greenSpeed', type: 'number', min: 7, max: 15, step: 0.1, required: true, value: hasToday ? last.greenSpeed : st.greenSpeed }) +
        '</div><div class="row between wrap"><span class="muted">Saved against ' + esc(fmt.dateLong(today())) + '</span>' + ui.btn('Save readings', { kind: 'primary', icon: 'check', action: 'save-read' }) + '</div></form></section>' +
        '</div>';
      if (first !== true) settle(panel);
    }
    ui.on(panel, 'click', '[data-action=save-read]', function () {
      const form = ui.$('.cg-read-form', panel); if (!ui.validate(form)) return;
      const d = ui.formData(form); let ok = true;
      [['rainfall', 0, 250], ['et', 0, 25], ['soilMoisture', 0, 60], ['greenSpeed', 7, 15]].forEach(function (r) { if (d[r[0]] < r[1] || d[r[0]] > r[2]) { fieldError(form, r[0], 'Enter a value between ' + r[1] + ' and ' + r[2] + '.'); ok = false; } });
      if (!ok) return;
      const ex = S.all('agronomyReadings').find(function (r) { return r.date === today(); });
      const again = function () { if (!document.body.contains(panel)) return; const y = window.scrollY; draw(); window.scrollTo(0, y); };
      undoRun(function () { return ex ? S.update('agronomyReadings', ex.id, d) : S.insert('agronomyReadings', Object.assign({ date: today() }, d)); },
        { message: 'Agronomy readings saved', after: again, undone: ex ? 'Today’s earlier readings are back' : 'Today’s readings removed' });
      again();
    });
    draw(true);
  }

  /* ======================================================================
     Register
     ====================================================================== */
  const TABS = [
    { id: 'status', label: 'Course status', fn: tabStatus },
    { id: 'work', label: 'Work orders', fn: tabWork },
    { id: 'equipment', label: 'Equipment', fn: tabEquipment }
    /* Golf carts, Chemical log and Weather & agronomy were taken off this page at the club's request (Nov 12).
       tabCarts, tabChem and tabWeather and their data are kept, so a tab can be put back by listing it here. */
  ];

  Club.register({
    id: 'course', label: 'Course & Grounds', icon: 'course', section: 'Course', order: 10,
    badge: function () { return S.all('workOrders').filter(function (w) { return w.status !== 'done' && (w.priority === 'urgent' || w.priority === 'high'); }).length || null; },
    search: function (q) {
      const wo = S.all('workOrders').filter(function (w) { return (w.title + ' ' + w.area + ' ' + (w.hole ? 'hole ' + w.hole : '') + ' ' + Club.staff.name(w.assigneeId)).toLowerCase().indexOf(q) >= 0; })
        .slice(0, 4).map(function (w) { return { label: w.title, sub: 'Work order · ' + (COLS.find(function (c) { return c.id === w.status; }) || COLS[0]).label + (w.hole ? ' · Hole ' + w.hole : ''), href: 'course/work/' + w.id, icon: 'maintenance' }; });
      const eq = S.all('equipment').filter(function (e) { return (e.unitNo + ' ' + e.make + ' ' + e.model + ' ' + e.name).toLowerCase().indexOf(q) >= 0; })
        .slice(0, 2).map(function (e) { return { label: e.unitNo + ' ' + e.make + ' ' + e.model, sub: 'Equipment · ' + (EQ_STATUS[e.status] || EQ_STATUS['in-service'])[0], href: 'course/equipment', icon: 'tractor' }; });
      return wo.concat(eq);
    },
    render: function (view, params) {
      const st = getStatus();
      const tabId = TABS.some(function (t) { return t.id === params[0]; }) ? params[0] : 'status';
      const openHoles = st.holes.filter(function (h) { return h.status !== 'closed'; }).length;
      view.innerHTML = ui.pageHeader({
        eyebrow: 'Course & grounds',
        title: 'The course',
        subtitle: (st.open ? 'Open for play' : 'Closed today') + ' · ' + esc(st.cartRule) + ' · ' + openHoles + ' of 18 holes in play. Conditions last published ' + esc(stamp(st.updatedAt).toLowerCase()) + '.',
        actions: '<span class="cg-head-badge">' + (st.open ? '<span class="live-dot"></span>Course open' : 'Course closed') + '</span>'
      }) + '<div class="cg-tabs"></div>';
      let first = true;
      ui.tabs(ui.$('.cg-tabs', view), TABS.map(function (t) {
        return { id: t.id, label: t.label, render: function (p) { t.fn(p, t.id === tabId && first ? params[1] : null); } };
      }), tabId, function (id) {
        if (!first) { try { history.replaceState(null, '', '#/course/' + id); } catch (e) { /* ignore */ } }
        first = false;
      });
      return function () { if (statusOff) statusOff(); };
    }
  });
})();
