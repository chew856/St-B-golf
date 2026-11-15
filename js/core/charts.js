/* Club.charts: small animated SVG charts in the club palette.
   Each function returns an HTML string; call Club.ui.animateIn(root) after inserting to animate. */
(function () {
  window.Club = window.Club || {};
  const esc = function (s) { return Club.ui.esc(s); };
  const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function short(v, money) {
    const pre = money ? '$' : '';
    if (Math.abs(v) >= 1e6) return pre + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1e3) return pre + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return pre + (Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : Math.round(v));
  }
  function legend(series) {
    if (series.length < 2) return '';
    return '<div class="chart-legend">' + series.map(function (s, i) { return '<span><i style="background:' + (s.color || COLORS[i]) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>';
  }

  /* Line and bar charts are drawn at 640 wide, then redrawn at their container's real width
     once inserted so text and strokes never stretch. */
  const registry = {}; let regN = 0;
  function remember(kind, o) { const id = 'ch' + (++regN); registry[id] = { kind: kind, o: o }; return id; }
  function fit(root) {
    Club.ui.$$('.chart-wrap[data-chart]', root).forEach(function (w) {
      const r = registry[w.dataset.chart]; if (!r) return;
      const width = Math.round(w.clientWidth); if (!width || Math.abs(width - (r.o.width || 640)) < 4) return;
      const o = Object.assign({}, r.o, { width: width });
      const draw = r.kind === 'line' ? line : r.kind === 'columns' ? columns : bar;
      const fresh = Club.ui.el(draw(o));
      delete registry[fresh.dataset.chart];
      registry[w.dataset.chart] = { kind: r.kind, o: o };
      w.innerHTML = fresh.innerHTML;
    });
  }
  let fitTimer;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      Club.ui.$$('.chart-wrap[data-chart]').forEach(function (w) { w.setAttribute('data-refit', ''); });
      fit(document); Club.ui.$$('.chart-line, .chart-area, .chart-bar').forEach(function (n) { n.setAttribute('data-anim', ''); });
    }, 150);
  });

  /**
   * line({ labels: [...], series: [{name, values, color}], height, money, area })
   */
  function line(o) {
    const W = o.width || 640, H = o.height || 220, pl = 44, pr = 12, pt = 12, pb = 28;
    const all = o.series.reduce(function (a, s) { return a.concat(s.values); }, []);
    const max = niceMax(Math.max.apply(null, all.concat([0])));
    const n = o.labels.length;
    const x = function (i) { return pl + (n <= 1 ? 0 : i * (W - pl - pr) / (n - 1)); };
    const y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">';
    for (let g = 0; g <= 4; g++) { const v = max * g / 4; svg += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + short(v, o.money) + '</text>'; }
    const step = Math.ceil(n / 8);
    o.labels.forEach(function (l, i) { if (i % step === 0 || i === n - 1) svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    o.series.forEach(function (s, si) {
      const c = s.color || COLORS[si];
      const pts = s.values.map(function (v, i) { return x(i) + ',' + y(v); });
      if (o.area !== false && si === 0) svg += '<path class="chart-area" d="M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(n - 1) + ',' + y(0) + ' Z" fill="' + c + '" opacity="0.08"/>';
      svg += '<polyline class="chart-line" points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>';
      s.values.forEach(function (v, i) { svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="9" fill="transparent" data-tip="' + esc(o.labels[i] + ' · ' + s.name + ': ' + (o.money ? Club.fmt.money0(v) : Club.fmt.num(v))) + '"/>'; });
    });
    svg += '</svg>';
    return '<div class="chart-wrap" data-chart="' + remember('line', o) + '">' + svg + legend(o.series) + '</div>';
  }

  /**
   * bar({ labels, series: [{name, values, color}], height, money, stacked, whole })
   */
  function bar(o) {
    const W = o.width || 640, H = o.height || 220, pl = 44, pr = 8, pt = 12, pb = 28;
    const n = o.labels.length; const k = o.series.length;
    const totals = o.labels.map(function (_, i) { return o.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0); });
    let max = niceMax(o.stacked ? Math.max.apply(null, totals) : Math.max.apply(null, o.series.reduce(function (a, s) { return a.concat(s.values); }, [0])));
    if (o.whole) max = Math.max(4, Math.ceil(max / 4) * 4);   /* whole-number gridlines (counts, whole dollars) */
    const band = (W - pl - pr) / n; const gw = band * 0.62; const bw = o.stacked ? gw : gw / k;
    const y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">';
    for (let g = 0; g <= 4; g++) { const v = max * g / 4; svg += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + short(v, o.money) + '</text>'; }
    const step = Math.ceil(n / 12);
    o.labels.forEach(function (l, i) {
      const gx = pl + band * i + (band - gw) / 2;
      let acc = 0;
      o.series.forEach(function (s, si) {
        const v = s.values[i] || 0; const c = s.color || COLORS[si];
        const bx = o.stacked ? gx : gx + si * bw; const top = y(acc + v); const h = y(acc) - top;
        svg += '<rect class="chart-bar" x="' + bx + '" y="' + top + '" width="' + Math.max(1, bw - 2) + '" height="' + Math.max(0, h) + '" fill="' + c + '" rx="1" style="animation-delay:' + (i * 30) + 'ms" data-tip="' + esc(l + ' · ' + s.name + ': ' + (o.money ? Club.fmt.money0(v) : Club.fmt.num(v))) + '"/>';
        if (o.stacked) acc += v;
      });
      if (i % step === 0) svg += '<text x="' + (pl + band * i + band / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>';
    });
    svg += '</svg>';
    return '<div class="chart-wrap" data-chart="' + remember('bar', o) + '">' + svg + legend(o.series) + '</div>';
  }

  /**
   * donut({ items: [{label, value, color}], size, center: {value, label}, money })
   */
  function donut(o) {
    const size = o.size || 180, r = size / 2 - 14, c = 2 * Math.PI * r;
    const total = o.items.reduce(function (a, i) { return a + i.value; }, 0) || 1;
    let off = 0;
    let svg = '<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;flex:none"><g transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')">';
    svg += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--parchment)" stroke-width="14"/>';
    o.items.forEach(function (it, i) {
      const len = c * it.value / total;
      svg += '<circle class="chart-arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (it.color || COLORS[i]) + '" stroke-width="14" stroke-dasharray="' + Math.max(0, len - 2) + ' ' + c + '" stroke-dashoffset="' + (-off) + '" data-len="' + len + '" style="animation-delay:' + (i * 90) + 'ms" data-tip="' + esc(it.label + ': ' + (o.money ? Club.fmt.money0(it.value) : Club.fmt.num(it.value)) + ' (' + Math.round(it.value / total * 100) + '%)') + '"/>';
      off += len;
    });
    svg += '</g>';
    if (o.center) svg += '<text x="50%" y="48%" text-anchor="middle" class="donut-center" style="font-family:var(--font-display);font-feature-settings:\'lnum\' 1;font-size:' + (size / 6) + 'px">' + esc(o.center.value) + '</text><text x="50%" y="62%" text-anchor="middle" class="donut-label" style="font-size:12px;fill:var(--ink-2)">' + esc(String(o.center.label || '')) + '</text>';
    svg += '</svg>';
    const leg = '<div class="donut-legend" style="display:flex;flex-direction:column;gap:8px;font-size:var(--fs-13);min-width:0">' + o.items.map(function (it, i) {
      return '<div class="row" style="gap:8px"><i style="width:10px;height:10px;border-radius:2px;flex:none;background:' + (it.color || COLORS[i]) + '"></i><span class="ink-2" style="flex:1">' + esc(it.label) + '</span><span class="num">' + (o.money ? Club.fmt.money0(it.value) : Club.fmt.num(it.value)) + '</span></div>';
    }).join('') + '</div>';
    return '<div class="chart-wrap row wrap" style="gap:24px;align-items:center">' + svg + (o.legend === false ? '' : leg) + '</div>';
  }

  /** sparkline(values, {width, height, color}) */
  function sparkline(values, o) {
    o = o || {}; const W = o.width || 120, H = o.height || 32;
    const max = Math.max.apply(null, values), min = Math.min.apply(null, values); const rng = max - min || 1;
    const pts = values.map(function (v, i) { return (i * W / (values.length - 1)) + ',' + (H - 3 - (v - min) / rng * (H - 6)); }).join(' ');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H + 'px"><polyline class="chart-line" points="' + pts + '" fill="none" stroke="' + (o.color || 'var(--brass)') + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /** hbars([{label, value, max?, color?}], {money}) simple horizontal bars list */
  function hbars(items, o) {
    o = o || {};
    const max = Math.max.apply(null, items.map(function (i) { return i.max || i.value; }).concat([1]));
    return '<div class="hbars" style="display:flex;flex-direction:column;gap:12px">' + items.map(function (it) {
      return '<div><div class="row between" style="font-size:var(--fs-13);margin-bottom:4px"><span class="ink-2">' + esc(it.label) + '</span><span class="num">' + (o.money ? Club.fmt.money0(it.value) : (o.suffix ? it.value + o.suffix : Club.fmt.num(it.value))) + '</span></div><div class="bar' + (it.brass ? ' brass' : '') + '"><span style="width:' + Math.min(100, it.value / max * 100) + '%;' + (it.color ? 'background:' + it.color : '') + '"></span></div></div>';
    }).join('') + '</div>';
  }

  /* ---------- Single-hue column chart (Reports) ----------
     columns({ labels, values, height?, width?, money?, pct?, fmt?(v), tipTitles?, tipName?, partial?: [bool], years?: [''],
               maxLabel?: true, ariaLabel, dense? })
     Rounded tops, a 2px gap between bars, a recessive grid, the value written on the tallest bar only, striped bars for
     partial periods (month to date), and labels thinned on narrow widths so they never touch. Hit areas carry
     data-tip / data-tip-title for the shared tooltip. Redrawn at the container's width by fit(). */
  function niceStep(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function roundTop(x, y, w, h, r) { r = Math.min(r, h, w / 2); if (h <= 0) return ''; return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; }
  function axisText(v, o) { if (o.pct) return Math.round(v) + '%'; return short(v, o.money).replace(/k$/, 'K'); }
  function columns(o) {
    const id = remember('columns', o);
    const W = o.width || 640, n = o.labels.length;
    const H = o.height || Math.max(200, Math.min(300, Math.round(W * 0.32)));
    const hasYears = (o.years || []).some(Boolean);
    const L = o.pct ? 40 : 52, R = 4, T = 24, B = hasYears ? 36 : 24;
    const vals = o.values.map(function (v) { return +v || 0; });
    const max = Math.max.apply(null, vals.concat([0]));
    let step = o.pct ? 25 : niceStep((max || 1) / 4); if (o.whole) step = Math.max(1, Math.round(step)); const top = Math.max(step, Math.ceil((max || 1) / step) * step);
    const plotH = H - T - B, slot = (W - L - R) / n, bw = Math.max(2, Math.min(44, slot * 0.62));
    const fmt = o.fmt || function (v) { return o.pct ? Math.round(v) + '%' : o.money ? Club.fmt.money0(v) : Club.fmt.num(v); };
    const y = function (v) { return T + plotH * (1 - v / top); };
    let s = '<svg class="chart chart-cols" viewBox="0 0 ' + W + ' ' + H + '" style="height:' + H + 'px" role="img" aria-label="' + esc(o.ariaLabel || '') + '">' +
      '<defs><pattern id="hatch-' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--viz-1)" opacity=".35"/><rect width="3" height="6" fill="var(--viz-1)"/></pattern></defs><g class="cgrid">';
    for (let v = 0; v <= top + 1e-9; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 10) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(axisText(v, o)) + '</text>';
    s += '</g>';
    const best = max > 0 ? vals.indexOf(max) : -1;
    const every = slot < 34 ? (slot < 18 ? 3 : 2) : 1;
    const shown = vals.map(function (_, i) { return (n - 1 - i) % every === 0; });
    /* A year sits under the first month label that is actually shown for that year. */
    const yearAt = vals.map(function () { return ''; });
    if (hasYears) { let cur = '', last = ''; for (let i = 0; i < n; i++) { if (o.years[i]) cur = o.years[i]; if (shown[i] && cur && cur !== last) { yearAt[i] = cur; last = cur; } } }
    const labelFmt = o.labelFmt || fmt;
    vals.forEach(function (v, i) {
      const x = L + slot * i + (slot - bw) / 2, bh = v > 0 ? Math.max(2, plotH * v / top) : 0, by = H - B - bh;
      const partial = o.partial && o.partial[i];
      const title = (o.tipTitles && o.tipTitles[i]) || o.labels[i];
      s += '<g class="cbar"><path d="' + roundTop(x, by, bw, bh, 4) + '"' + (partial ? ' fill="url(#hatch-' + id + ')" class="partial"' : ' fill="var(--viz-1)"') + '/>' +
        '<rect class="chit" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + plotH + '" fill="transparent" data-tip-title="' + esc(title) + '" data-tip="' + esc((o.tipName ? o.tipName + ' ' : '') + fmt(v)) + '"/></g>';
      if (shown[i]) s += '<text x="' + (x + bw / 2) + '" y="' + (H - B + 17) + '" text-anchor="middle">' + esc(o.labels[i]) + '</text>';
      if (yearAt[i]) s += '<text x="' + (x + bw / 2) + '" y="' + (H - B + 31) + '" text-anchor="middle" class="cyear">' + esc(yearAt[i]) + '</text>';
      if (i === best && o.maxLabel !== false) s += '<text class="cval" x="' + (x + bw / 2) + '" y="' + (by - 8) + '" text-anchor="middle">' + esc(labelFmt(v)) + '</text>';
    });
    s += '</svg>';
    return '<div class="chart-wrap" data-chart="' + id + '">' + s + '</div>';
  }

  /** spark(values, { height }): a one-hue sparkline that fills its box, with a dot on the last value. */
  function spark(values, o) {
    o = o || {}; const W = 200, H = o.height || 28, n = values.length;
    if (n < 2) return '<svg class="chart chart-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"></svg>';
    const max = Math.max.apply(null, values), min = Math.min.apply(null, values.concat([0]).map(function (v) { return v; })), rng = (max - min) || 1;
    const pts = values.map(function (v, i) { return [(i / (n - 1) * (W - 6) + 3).toFixed(1), (H - 4 - (v - min) / rng * (H - 8)).toFixed(1)]; });
    const last = pts[n - 1];
    return '<svg class="chart chart-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline fill="none" stroke="var(--viz-1)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' +
      '<path d="M' + last[0] + ',' + last[1] + 'h0.01" stroke="var(--viz-1)" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  }

  /* ranked(items, { total?, fmt?(v) }): a part-to-whole list, each row a label, a value, a track and its share.
     items: [{ label, value, sub?, share?, color?, attrs? (string of extra attributes on the row button), html? }] */
  function ranked(items, o) {
    o = o || {};
    const total = o.total != null ? o.total : items.reduce(function (a, i) { return a + (+i.value || 0); }, 0);
    const max = Math.max.apply(null, items.map(function (i) { return +i.value || 0; }).concat([1]));
    const fmt = o.fmt || function (v) { return Club.fmt.num(v); };
    return '<ul class="rows">' + items.map(function (it) {
      const v = +it.value || 0, share = it.share != null ? it.share : (total ? Math.round(v / total * 100) : 0);
      const inner = '<span class="n">' + esc(it.label) + (it.sub ? '<span class="sub">' + esc(it.sub) + '</span>' : '') + '</span><span class="a">' + esc(it.html != null ? it.html : fmt(v)) + '</span>' +
        (o.bare ? '' : '<span class="s"><span class="track"><i style="width:' + (v / max * 100).toFixed(1) + '%' + (it.color ? ';background:' + it.color : '') + '"></i></span>' + (o.noShare ? '' : '<span class="pc">' + share + '%</span>') + '</span>');
      return it.attrs ? '<li><button type="button" class="rowbtn" ' + it.attrs + '>' + inner + '</button></li>' : '<li>' + inner + '</li>';
    }).join('') + '</ul>';
  }

  /* split(parts, { fmt }): one thin bar divided into at most four coloured parts (the rest in --viz-context).
     parts: [{ label, value, color }] */
  function split(parts, o) {
    o = o || {};
    const fmt = o.fmt || function (v) { return Club.fmt.num(v); };
    const tot = parts.reduce(function (a, p) { return a + (+p.value || 0); }, 0);
    return '<div class="split" role="img" aria-label="' + esc(parts.map(function (p) { return p.label + ' ' + (tot ? Math.round(p.value / tot * 100) : 0) + '%'; }).join(', ')) + '">' +
      parts.filter(function (p) { return p.value > 0; }).map(function (p) { return '<span style="flex:' + (+p.value) + ';background:' + (p.color || 'var(--viz-context)') + '" data-tip-title="' + esc(p.label) + '" data-tip="' + esc(fmt(p.value) + ', ' + (tot ? Math.round(p.value / tot * 100) : 0) + '%') + '"></span>'; }).join('') + '</div>';
  }

  /** Animate charts inside root (lines draw, bars grow, arcs sweep). */
  function animate(root) {
    fit(root || document);
    if (reduce) return;
    Club.ui.$$('.chart-line:not([data-anim])', root).forEach(function (p) {
      p.setAttribute('data-anim', '');
      let len = 0; try { len = p.getTotalLength(); } catch (e) { return; }
      p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset 1200ms cubic-bezier(0.16, 1, 0.3, 1)';
      requestAnimationFrame(function () { p.style.strokeDashoffset = 0; });
    });
    Club.ui.$$('.chart-area:not([data-anim])', root).forEach(function (a) { a.setAttribute('data-anim', ''); a.style.opacity = 0; a.style.transition = 'opacity 900ms ease 400ms'; requestAnimationFrame(function () { a.style.opacity = 0.08; }); });
    Club.ui.$$('.chart-bar:not([data-anim])', root).forEach(function (b) { b.setAttribute('data-anim', ''); b.style.transformOrigin = 'center bottom'; b.style.transformBox = 'fill-box'; b.style.animation = 'grow-y 700ms cubic-bezier(0.16, 1, 0.3, 1) both'; b.style.animationDelay = b.style.animationDelay || '0ms'; });
    Club.ui.$$('.chart-arc:not([data-anim])', root).forEach(function (a) {
      a.setAttribute('data-anim', '');
      const target = a.getAttribute('stroke-dasharray'); const c = target.split(' ')[1];
      a.style.strokeDasharray = '0 ' + c; a.getBoundingClientRect();
      a.style.transition = 'stroke-dasharray 1000ms cubic-bezier(0.16, 1, 0.3, 1) ' + (a.style.animationDelay || '0ms');
      requestAnimationFrame(function () { a.style.strokeDasharray = target; });
    });
  }

  /* Global tooltip for any [data-tip] */
  let tip;
  document.addEventListener('mouseover', function (e) {
    const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { if (tip) tip.classList.remove('show'); return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip); }
    const title = t.getAttribute('data-tip-title');
    if (title) tip.innerHTML = '<b>' + esc(title) + '</b><br>' + esc(t.getAttribute('data-tip')); else tip.textContent = t.getAttribute('data-tip');
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', function (e) { if (tip && tip.classList.contains('show')) { tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14) + 'px'; tip.style.top = (e.clientY - 34) + 'px'; } });

  Club.charts = { line: line, bar: bar, donut: donut, sparkline: sparkline, hbars: hbars, columns: columns, spark: spark, ranked: ranked, split: split, animate: animate, fit: fit, colors: COLORS };
})();
