/* Course data: the equipment, work orders, carts, chemical log and agronomy seeds, and the default course status.
   Loaded by all three pages (staff, members' portal, public site) just before the staff module it serves, so seed data,
   migrations and the shared API come out the same whichever page a browser opens first. Staff screens stay in
   js/modules/course.js, which reads these helpers from Club.shared.course. */
(function () {
  const S = Club.store, ui = Club.ui, esc = ui.esc, fmt = Club.fmt, R = S.R;

  /* ======================================================================
     Seed data
     ====================================================================== */
  function isoAt(daysAgo, hh, mm) { const d = new Date(); d.setDate(d.getDate() + daysAgo); d.setHours(hh, mm || 0, 0, 0); return d.toISOString(); }

  S.seed('equipment', function () {
    R.reseed(5101);
    const defs = [
      ['G-01', 'Greens mower', 'Mower', 'Toro', 'Greensmaster 3150-Q', 250, 1840],
      ['G-02', 'Greens mower', 'Mower', 'Toro', 'Greensmaster 3150-Q', 250, 1712],
      ['G-03', 'Walk greens mower', 'Mower', 'Toro', 'Greensmaster eFlex 2120', 200, 960],
      ['G-04', 'Walk greens mower', 'Mower', 'Toro', 'Greensmaster eFlex 2120', 200, 1015],
      ['F-01', 'Fairway mower', 'Mower', 'John Deere', '7500A E-Cut Hybrid', 250, 2310],
      ['F-02', 'Fairway mower', 'Mower', 'John Deere', '7500A E-Cut Hybrid', 250, 2188],
      ['F-03', 'Fairway mower', 'Mower', 'John Deere', '8000A E-Cut Hybrid', 250, 1420],
      ['R-01', 'Rough mower', 'Mower', 'Toro', 'Groundsmaster 4500-D', 300, 2650],
      ['R-02', 'Rough mower', 'Mower', 'Toro', 'Groundsmaster 4500-D', 300, 2495],
      ['T-01', 'Tee and approach mower', 'Mower', 'Toro', 'Reelmaster 3575-D', 250, 1288],
      ['S-01', 'Turf sprayer', 'Sprayer', 'Toro', 'Multi Pro 5800-G', 200, 1144],
      ['S-02', 'Turf sprayer', 'Sprayer', 'Smithco', 'Spray Star 3180', 200, 1876],
      ['U-01', 'Utility vehicle', 'Utility vehicle', 'John Deere', 'Gator TX', 150, 3120],
      ['U-02', 'Utility vehicle', 'Utility vehicle', 'John Deere', 'Gator TX', 150, 2980],
      ['U-03', 'Utility vehicle', 'Utility vehicle', 'John Deere', 'Gator HPX615E', 150, 1760],
      ['U-04', 'Heavy duty utility', 'Utility vehicle', 'Toro', 'Workman HDX-D', 200, 2240],
      ['A-01', 'Greens aerator', 'Aerator', 'Toro', 'ProCore 648', 100, 612],
      ['A-02', 'Fairway aerator', 'Aerator', 'Toro', 'ProCore 1298', 100, 455],
      ['O-01', 'Bunker rake', 'Other', 'Toro', 'Sand Pro 5040', 150, 1390],
      ['O-02', 'Topdresser', 'Other', 'Turfco', 'WideSpin 1550', 120, 380],
      ['O-03', 'Fairway mower', 'Mower', 'Jacobsen', 'LF-3400', 250, 5210]
    ];
    const used = [182, 266, 41, 120, 128, 239, 22, 310, 84, 186, 150, 61, 98, 37, 102, 140, 64, 58, 90, 18, 40];
    return defs.map(function (d, i) {
      const hours = d[6] + R.int(0, 30);
      return {
        id: 'eq_' + (i + 1), unitNo: d[0], name: d[1], type: d[2], make: d[3], model: d[4],
        hours: hours, serviceIntervalHours: d[5], lastServiceHours: Math.max(0, hours - used[i]),
        lastServiceDate: Club.date.fromToday(-R.int(8, 60)),
        status: i === 1 || i === 7 ? 'in-shop' : (i === 20 ? 'retired' : 'in-service')
      };
    });
  });

  S.seed('workOrders', function () {
    R.reseed(5102);
    const d = Club.date.fromToday;
    return [
      { title: 'Repair irrigation head leak, left of green', area: 'Irrigation', hole: 4, priority: 'urgent', status: 'open', assigneeId: 'stf_11', dueDate: d(0), notes: 'Toro Infinity head, wet spot spreading into approach.', equipmentId: null },
      { title: 'Hand water hot spots on back nine greens', area: 'Greens', hole: null, priority: 'high', status: 'in-progress', assigneeId: 'stf_10', dueDate: d(0), notes: 'Small, sloping greens dry out on the high side first. Focus on 12, 14 and 16.', equipmentId: 'eq_13' },
      { title: 'Replace bedknife and backlap reels', area: 'Maintenance facility', hole: null, priority: 'high', status: 'in-progress', assigneeId: 'stf_8', dueDate: d(-1), notes: 'Unit pulled after quality of cut complaint.', equipmentId: 'eq_2' },
      { title: 'Rebuild washed out face, greenside bunkers on 17', area: 'Bunkers', hole: 17, priority: 'high', status: 'open', assigneeId: 'stf_9', dueDate: d(2), notes: 'Both bunkers short of the green. About 3 tonnes of sand.', equipmentId: 'eq_19' },
      { title: 'Rope and stake GUR on approach', area: 'Fairways', hole: 7, priority: 'normal', status: 'done', assigneeId: 'stf_9', dueDate: d(-2), notes: 'Sod seams lifting after storm.', equipmentId: null },
      { title: 'Topdress and roll practice green', area: 'Short game practice facility', hole: null, priority: 'normal', status: 'open', assigneeId: 'stf_10', dueDate: d(3), notes: '', equipmentId: 'eq_20' },
      { title: 'Calibrate sprayer nozzles', area: 'Maintenance facility', hole: null, priority: 'normal', status: 'done', assigneeId: 'stf_8', dueDate: d(-4), notes: 'TeeJet XR 8004, record output per nozzle.', equipmentId: 'eq_11' },
      { title: 'Clear debris from the riverbank, left of 17', area: 'Rough', hole: 17, priority: 'low', status: 'open', assigneeId: 'stf_9', dueDate: d(6), notes: 'Branches washed up along the Seine River after the storm.', equipmentId: null },
      { title: 'Investigate low pressure on station 32', area: 'Irrigation', hole: 9, priority: 'high', status: 'open', assigneeId: 'stf_11', dueDate: d(-1), notes: 'Pump station log shows drop after 2 AM cycle.', equipmentId: null },
      { title: 'Fill divots on par 3 tees', area: 'Tees', hole: 3, priority: 'normal', status: 'in-progress', assigneeId: 'stf_10', dueDate: d(1), notes: 'Seed and sand mix, also 7, 11 and 16.', equipmentId: 'eq_14' },
      { title: 'Prepare greens for Member-Guest', area: 'Greens', hole: null, priority: 'high', status: 'open', assigneeId: 'stf_7', dueDate: d(5), notes: 'Target 10.5 on the stimpmeter: the greens are small and sloping. Double cut and roll each morning.', equipmentId: 'eq_1' },
      { title: 'Prune low limbs on the tree line, right of fairway', area: 'Rough', hole: 14, priority: 'low', status: 'open', assigneeId: 'stf_9', dueDate: d(9), notes: 'Tree-lined fairway, limbs blocking recovery shots.', equipmentId: null },
      { title: 'Replace hole cups and flagsticks', area: 'Greens', hole: null, priority: 'normal', status: 'done', assigneeId: 'stf_7', dueDate: d(-6), notes: 'New tournament flags in clubhouse green.', equipmentId: null },
      { title: '500 hour service on rough mower', area: 'Maintenance facility', hole: null, priority: 'normal', status: 'in-progress', assigneeId: 'stf_8', dueDate: d(2), notes: 'Hydraulic filter and oil.', equipmentId: 'eq_8' },
      { title: 'Repair cracked drain grate by clubhouse', area: 'Clubhouse grounds', hole: null, priority: 'urgent', status: 'open', assigneeId: 'stf_6', dueDate: d(1), notes: 'Trip hazard near the patio steps. Coned off.', equipmentId: null },
      { title: 'Overseed worn areas around tee 1', area: 'Tees', hole: 1, priority: 'low', status: 'done', assigneeId: 'stf_10', dueDate: d(-8), notes: '', equipmentId: null },
      { title: 'Trim edges around the pond, water hazard stakes', area: 'Rough', hole: 10, priority: 'normal', status: 'open', assigneeId: 'stf_10', dueDate: d(4), notes: 'Repaint faded red stakes.', equipmentId: null }
    ].map(function (w, i) { return Object.assign({ id: 'wo_' + (101 + i), createdAt: isoAt(-R.int(1, 12), 7, 0) }, w); });
  });

  S.seed('carts', function () {
    R.reseed(5103);
    const out = [];
    for (let i = 1; i <= 60; i++) {
      let status = 'available';
      if ([7, 23, 41].indexOf(i) >= 0) status = 'maintenance';
      else if (i % 5 === 0 || i % 7 === 0) status = 'out';
      else if (i % 9 === 0 || i % 11 === 0) status = 'charging';
      const battery = status === 'out' ? R.int(38, 92) : status === 'charging' ? R.int(12, 64) : status === 'maintenance' ? R.int(5, 70) : R.int(76, 100);
      out.push({ id: 'cart_' + i, number: i, status: status, battery: battery, lastCheck: Club.date.fromToday(-R.int(0, 6)) });
    }
    return out;
  });

  S.seed('chemicalLogs', function () {
    R.reseed(5104);
    /* Canadian records: PCP Act registration numbers (demo values, verify against each product label),
       metric rates, temperature in °C and wind in km/h. */
    const P = [
      ['Daconil Action', '28900', 'Dollar spot', 111, 'mL/100 m²', 12],
      ['Heritage', '27527', 'Brown patch', 12, 'g/100 m²', 4],
      ['Primo Maxx', '28537', 'Growth regulation', 4, 'mL/100 m²', 4],
      ['Banner Maxx II', '29466', 'Anthracnose', 32, 'mL/100 m²', 12],
      ['Acelepryn', '29120', 'White grubs', 0.88, 'L/ha', 4],
      ['Tenacity', '29891', 'Crabgrass', 0.37, 'L/ha', 12],
      ['Medallion SC', '29873', 'Snow mould', 32, 'mL/100 m²', 12],
      ['Instrata', '30479', 'Snow mould', 297, 'mL/100 m²', 12]
    ];
    const areas = ['Greens, all 18', 'Fairways, holes 1 to 9', 'Fairways, holes 10 to 18', 'Tees and approaches', 'Practice green', 'Rough, holes 12 to 16'];
    const plan = [[0, 0, 0], [3, 2, 1], [6, 1, 0], [9, 3, 0], [13, 4, 2], [17, 0, 0], [22, 2, 3], [26, 5, 1], [31, 1, 0], [38, 6, 0], [44, 3, 5], [51, 7, 2], [57, 0, 0], [64, 2, 3]];
    const appliers = ['stf_7', 'stf_7', 'stf_6', 'stf_8'];
    return plan.map(function (p, i) {
      const prod = P[p[1]];
      return {
        id: 'chm_' + (201 + i), date: Club.date.fromToday(-p[0]), time: i === 0 ? '06:10' : ('0' + R.int(5, 7) + ':' + R.pick(['00', '15', '30', '45'])),
        product: prod[0], pcpReg: prod[1], target: prod[2], area: areas[p[2]], rate: prod[3], unit: prod[4],
        appliedBy: R.pick(appliers), windKmh: R.int(3, 13), tempC: R.int(12, 23), reentryHours: i === 0 ? 24 : prod[5]
      };
    });
  });

  S.seed('agronomyReadings', function () {
    R.reseed(5105);
    const out = [];
    let speed = 10.6, moisture = 24;
    for (let i = 29; i >= 0; i--) {
      const rain = R.chance(0.22) ? Math.round((2 + R.rand() * 18) * 10) / 10 : 0; // mm
      moisture = Math.max(16, Math.min(34, moisture + (24 - moisture) * 0.18 + (rain ? rain * 0.4 : -R.rand() * 1.2) + (R.rand() - 0.5)));
      speed = Math.max(10.2, Math.min(12.4, speed + (11.3 - speed) * 0.18 + (R.rand() - 0.45) * 0.4 - (rain ? 0.2 : 0)));
      out.push({ id: 'agr_' + i, date: Club.date.fromToday(-i), rainfall: rain, et: Math.round((1.8 + R.rand() * 2) * 10) / 10, soilMoisture: Math.round(moisture * 10) / 10, greenSpeed: Math.round(speed * 10) / 10 });
    }
    return out;
  });

  if (!S.getObj('courseStatus', null)) {
    const holes = [];
    for (let i = 1; i <= 18; i++) holes.push({ number: i, status: i === 7 ? 'GUR' : 'open' });
    S.setObj('courseStatus', {
      open: true, cartRule: '90 degree', greenSpeed: 11.2, firmness: 'Firm', pins: 'Middle', holes: holes,
      message: 'Good morning from the grounds crew. Carts are 90 degree today while the fairways recover from Thursday’s rain. The approach on 7 is ground under repair, free drop. Soft spikes only, please, and enjoy your round.',
      updatedAt: isoAt(0, 6, 15)
    });
  }
})();
