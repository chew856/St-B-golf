/* Club.info, Club.logo and Club.weather: shared by the staff system and the members' portal. */
(function () {
  window.Club = window.Club || {};
  Club.info = Object.assign({
    name: 'St. Boniface Golf Club', short: 'St. Boniface', est: 1931,
    tagline: 'The private club experience without the private club price',
    address: '100 Youville Street, Winnipeg, Manitoba', city: 'Winnipeg', phone: '204-233-2497', email: '',
    landAcknowledgement: 'St. Boniface Golf Club is located on Treaty One lands, the traditional territories of the Anishinaabe, Cree, Oji-Cree, Dakota and Dene peoples, and the homeland of the Métis Nation.',
    website: 'https://www.stbonifacegolfclub.com',
    eventsWebsite: 'https://www.stbonifaceevents.com',
    social: [
      { label: 'Facebook', url: 'https://www.facebook.com/stbgolf/' },
      { label: 'Instagram', url: 'https://www.instagram.com/stbonifacegolfclub/' },
      { label: 'YouTube', url: 'https://www.youtube.com/channel/UCd5lM9fOsA7_qoc7Zo--9uA' }
    ]
  }, Club.store.getObj('clubInfo', {}));

  /** The signed-in staff account shown in the staff system's top bar and greeting. */
  Club.user = { firstName: 'Dave', lastName: 'Nerada', role: 'Front Desk' };

  /** The St.B oak-tree mark, tinted by the surrounding text colour (CSS mask). */
  Club.logo = function (cls) {
    return '<span class="stb-logo ' + (cls || '') + '" role="img" aria-label="' + Club.ui.esc(Club.info.name) + '"></span>';
  };
  /** The full-colour logo, for light backgrounds and print. */
  Club.logoImg = function (cls) {
    return '<img class="stb-logo-img ' + (cls || '') + '" src="assets/stb-logo.png" width="500" height="301" alt="' + Club.ui.esc(Club.info.name) + '">';
  };

  /* Weather: live from Open-Meteo (free, no key) for the club on Youville Street, refreshed every 30 minutes.
     The last good reading is cached so pages render instantly; if the service can't be reached, a date-seeded
     demo forecast is used instead. Club.weather keeps the same shape either way:
       today {date, cond, icon, hi, lo, rain (% chance), wind (km/h), precip (mm)}, forecast [7 days],
       nowTemp, history [last 30 days: {date, rain (mm), et (mm), hi, lo}], live (bool), updatedAt (ISO).
     Pages listen for the 'club:weather' window event to redraw when new data arrives. */
  const WX_KEY = 'stboniface.weather.v1';
  const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=49.8830&longitude=-97.1040' +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,et0_fao_evapotranspiration' +
    '&past_days=30&forecast_days=7&timezone=America%2FWinnipeg&wind_speed_unit=kmh';
  const REFRESH_MS = 30 * 60 * 1000;

  /* WMO weather codes to the system's wording and icons */
  function describe(code, wind) {
    let c;
    if (code === 0) c = { cond: 'Sunny', icon: 'sun' };
    else if (code <= 2) c = { cond: 'Partly cloudy', icon: 'partlyCloudy' };
    else if (code === 3) c = { cond: 'Overcast', icon: 'cloud' };
    else if (code === 45 || code === 48) c = { cond: 'Fog', icon: 'cloud' };
    else if (code >= 51 && code <= 57) c = { cond: 'Drizzle', icon: 'rain' };
    else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) c = { cond: code === 61 || code === 80 ? 'Light rain' : 'Rain', icon: 'rain' };
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) c = { cond: 'Snow', icon: 'cloud' };
    else if (code >= 95) c = { cond: 'Thunderstorms', icon: 'rain' };
    else c = { cond: 'Cloudy', icon: 'cloud' };
    if (wind >= 30 && (c.icon === 'sun' || c.icon === 'partlyCloudy')) c = { cond: 'Breezy', icon: 'wind' };
    return c;
  }

  function demo() {
    const conds = [
      { cond: 'Sunny', icon: 'sun' }, { cond: 'Partly cloudy', icon: 'partlyCloudy' }, { cond: 'Overcast', icon: 'cloud' },
      { cond: 'Light rain', icon: 'rain' }, { cond: 'Sunny', icon: 'sun' }, { cond: 'Breezy', icon: 'wind' }, { cond: 'Partly cloudy', icon: 'partlyCloudy' }
    ];
    const monthlyHigh = [-11, -8, -1, 10, 18, 23, 26, 25, 19, 11, 1, -8];
    const seed = new Date().getDate();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const c = conds[(seed + i) % conds.length];
      const hi = monthlyHigh[d.getMonth()] + ((seed * 3 + i * 5) % 7) - 3, lo = hi - 7 - (i % 3);
      days.push({ date: Club.date.fromToday(i), cond: c.cond, icon: c.icon, hi: hi, lo: lo, rain: c.icon === 'rain' ? 70 : (c.icon === 'cloud' ? 30 : 10), wind: 8 + ((seed + i * 7) % 20), precip: c.icon === 'rain' ? 4 : 0 });
    }
    return { today: days[0], forecast: days, nowTemp: days[0].hi - 2, history: [], live: false, updatedAt: null };
  }

  function parse(d) {
    const dl = d.daily, today = Club.date.today();
    const days = [], history = [];
    dl.time.forEach(function (date, i) {
      const wind = Math.round(dl.wind_speed_10m_max[i] || 0);
      const c = describe(dl.weather_code[i], wind);
      const row = { date: date, cond: c.cond, icon: c.icon, hi: Math.round(dl.temperature_2m_max[i]), lo: Math.round(dl.temperature_2m_min[i]),
        rain: dl.precipitation_probability_max[i] == null ? 0 : dl.precipitation_probability_max[i], wind: wind, precip: +(dl.precipitation_sum[i] || 0).toFixed(1) };
      if (date >= today && days.length < 7) days.push(row);
      if (date < today) history.push({ date: date, rain: +(dl.precipitation_sum[i] || 0).toFixed(1), et: +(dl.et0_fao_evapotranspiration[i] || 0).toFixed(2), hi: row.hi, lo: row.lo, code: dl.weather_code[i], wind: wind });
    });
    if (!days.length) return null;
    const cur = d.current || {};
    const now = describe(cur.weather_code != null ? cur.weather_code : dl.weather_code[0], cur.wind_speed_10m || 0);
    const t = Object.assign({}, days[0], { cond: now.cond, icon: now.icon, wind: Math.round(cur.wind_speed_10m != null ? cur.wind_speed_10m : days[0].wind) });
    days[0] = t;
    return { today: t, forecast: days, nowTemp: Math.round(cur.temperature_2m != null ? cur.temperature_2m : t.hi), history: history.slice(-30), live: true, updatedAt: new Date().toISOString() };
  }

  /* Daily weather log (collection `weatherLog`): one record per past day, kept for reports.
     { id: 'wx_YYYY-MM-DD', date, cond, icon, hi, lo, precip (mm), wind (km/h), source: 'live' | 'demo' }
     Every successful refresh upserts the past days it returned; live readings replace demo rows for the same date. */
  const S = Club.store && Club.store.seed ? Club.store : null;
  const LOG = 'weatherLog';
  function logRow(h, source) {
    const c = describe(h.code, h.wind || 0);
    return { id: 'wx_' + h.date, date: h.date, cond: c.cond, icon: c.icon, hi: h.hi, lo: h.lo, precip: +(+h.rain || 0).toFixed(1), wind: Math.round(h.wind || 0), source: source };
  }
  function logLive(w) {
    if (!S || !w || !w.live || !w.history) return;
    const rows = w.history.filter(function (h) { return h && h.date && h.code != null; }).map(function (h) { return logRow(h, 'live'); });
    if (!rows.length) return;
    const list = (S.all(LOG) || []).slice(), at = {};
    list.forEach(function (r, i) { if (r && r.date) at[r.date] = i; });
    let changed = false;
    rows.forEach(function (r) {
      const i = at[r.date];
      if (i == null) { list.push(r); changed = true; return; }
      const o = list[i];
      if (['cond', 'icon', 'hi', 'lo', 'precip', 'wind', 'source'].some(function (k) { return o[k] !== r[k]; })) { list[i] = Object.assign({}, o, r); changed = true; }
    });
    if (changed) S.replace(LOG, list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }));
  }
  /* Demo rows so reports work offline: the 14 past days the demo tee sheet covers, plausible for Winnipeg by month. Each date always gets the
     same weather (seeded from the date itself), so the demo is repeatable. */
  function demoLog() {
    const monthlyHigh = [-11, -8, -1, 10, 18, 23, 26, 25, 19, 11, 1, -8];
    const wetShare = [0.22, 0.2, 0.22, 0.24, 0.3, 0.36, 0.34, 0.3, 0.3, 0.26, 0.24, 0.22];
    const out = [];
    for (let i = 14; i >= 1; i--) {
      const date = Club.date.fromToday(-i), d = Club.fmt.toDate(date);
      let s = (+date.replace(/-/g, '') * 2654435761) % 2147483647 || 1;
      const rnd = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      rnd(); rnd();
      /* Blend the monthly highs so the season turns gradually rather than at the first of the month. */
      const m = d.getMonth(), f = (d.getDate() - 15) / 30, n = f >= 0 ? (m + 1) % 12 : (m + 11) % 12;
      const base = monthlyHigh[m] + (monthlyHigh[n] - monthlyHigh[m]) * Math.abs(f);
      const hi = Math.round(base + rnd() * 10 - 5), lo = hi - 5 - Math.floor(rnd() * 7);
      const wind = 6 + Math.floor(rnd() * 30);
      const wet = rnd() < wetShare[m];
      let code, precip = 0;
      if (wet) {
        precip = +(1 + Math.pow(rnd(), 2) * 17).toFixed(1);
        code = hi <= 1 ? 73 : precip < 2.5 ? 51 : precip < 6 ? 61 : (m >= 5 && m <= 7 && rnd() < 0.4 ? 95 : 63);
      } else code = [0, 1, 2, 3, 0, 2][Math.floor(rnd() * 6)];
      out.push(logRow({ date: date, code: code, wind: wind, hi: hi, lo: lo, rain: precip }, 'demo'));
    }
    return out;
  }
  if (S) S.seed(LOG, demoLog);

  function readCache() { try { const c = JSON.parse(localStorage.getItem(WX_KEY)); return c && c.forecast && c.forecast.length && c.forecast[0].date <= Club.date.today() ? c : null; } catch (e) { return null; } }
  function apply(w) {
    const target = Club.weather;
    Object.keys(target).forEach(function (k) { delete target[k]; });
    Object.assign(target, w, { unit: '°C', windUnit: 'km/h' });
    /* the forecast should start today even when the cache is from yesterday */
    const today = Club.date.today();
    target.forecast = target.forecast.filter(function (d) { return d.date >= today; });
    if (!target.forecast.length) Object.assign(target, demo());
    target.today = target.forecast[0];
  }

  Club.weather = {};
  const cached = readCache();
  apply(cached || demo());
  try { logLive(cached); } catch (e) { /* the next refresh will log */ }

  let inflight = false;
  Club.weather.refresh = function () {
    if (inflight || !window.fetch) return;
    inflight = true;
    fetch(WX_URL).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        const w = parse(d); if (!w) return;
        try { localStorage.setItem(WX_KEY, JSON.stringify(w)); } catch (e) { /* storage full or private mode */ }
        const refresh = Club.weather.refresh; apply(w); Club.weather.refresh = refresh;
        try { logLive(w); } catch (e) { console.warn('Weather log not updated', e); }
        window.dispatchEvent(new CustomEvent('club:weather'));
      })
      .catch(function (e) { console.warn('Live weather unavailable, showing the last known forecast.', e.message); })
      .then(function () { inflight = false; });
  };
  const fresh = cached && cached.updatedAt && (Date.now() - new Date(cached.updatedAt).getTime() < REFRESH_MS);
  if (!fresh) Club.weather.refresh();
  setInterval(function () { Club.weather.refresh(); }, REFRESH_MS);
})();
