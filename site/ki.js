/* ============ KI-Vorhersage: alle Wettermodelle, selbstlernend zusammengesetzt (7 und 14 Tage) ============
   Für einen Ort:
   1. Vorhersage von 8 Wettermodellen aus aller Welt (über Open-Meteo, Tageswerte bis 16 Tage): ECMWF IFS, das KI-Modell
      ECMWF AIFS, DWD ICON, NOAA GFS, Météo-France, UK Met Office, Kanada GEM, Japan JMA.
   2. Lernen aus den letzten 3 Wochen an der nächsten Messstation (Österreich: GeoSphere TAWES bis 30 km, sonst DWD über
      Bright Sky bis 30 km): was jedes Modell 1, 2 … 7 Tage vorher für diese Tage gesagt hat (Open-Meteo „Previous Runs“,
      für die Lage und Höhe der Station), gegen die Messung. Je Modell, Vorlauf und Wert (Höchst-, Tiefstwert, Niederschlag):
      - der typische Fehler (z. B. „immer 1,2 °C zu warm“) → wird abgezogen (bei wenigen Tagen vorsichtig, gestutzt),
      - wie stark es sonst streut → je kleiner, desto mehr zählt das Modell (Gewicht 1 / Streuung²).
   3. Zusammensetzen je Tag: gewichteter Mittelwert der ausgebesserten Modelle. Ab Tag 8 (dafür gibt es keine Prüfung) mit
      den Gewichten von Tag 7, aber abgeschwächt (Modelle zählen gleicher), Fehler nur zur Hälfte abgezogen.
   Ohne Messstation in der Nähe: alle Modelle gleich, ohne Ausbessern (Mittel aus 8 Modellen ist trotzdem meist besser
   als eines allein). Ergebnis gemerkt: Lernen 12 Stunden, Vorhersage 3 Stunden. */
export const KI_M = ["ecmwf_ifs", "ecmwf_aifs025_single", "icon_seamless", "gfs_seamless", "meteofrance_seamless", "ukmo_seamless", "gem_seamless", "jma_seamless"];
export const KI_N = { ecmwf_ifs: "ECMWF IFS", ecmwf_aifs025_single: "ECMWF AIFS (KI-Modell)", icon_seamless: "DWD ICON", gfs_seamless: "NOAA GFS", meteofrance_seamless: "Météo-France", ukmo_seamless: "UK Met Office", gem_seamless: "Kanada GEM", jma_seamless: "Japan JMA" };
const OM = "https://api.open-meteo.com/v1/forecast", PR = "https://previous-runs-api.open-meteo.com/v1/forecast";
const km = (a, b, c, d) => { const r = Math.PI / 180; return 6371 * Math.hypot((d - b) * r * Math.cos(((a + c) / 2) * r), (c - a) * r); };
const r1 = (v) => Math.round(v * 10) / 10;

/* Messstation in der Nähe und ihre Tageswerte (Datum in Ortszeit → {hi, lo, rr}) */
async function obsDays(h, kv, la, lo, days) {
  const end = new Date(Math.floor(Date.now() / 3600000) * 3600000), start = new Date(end.getTime() - days * 86400000), iso = (d) => d.toISOString().slice(0, 16);
  if (la >= 46.3 && la <= 49.1 && lo >= 9.4 && lo <= 17.2) {
    let meta = kv ? JSON.parse((await kv.get("ki:meta")) || "null") : null;
    if (!meta) {
      const m = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min/metadata", 20000)).json();
      meta = (m.stations || []).filter((x) => x.is_active !== false && x.altitude != null).map((x) => [x.id, x.name, +x.lat, +x.lon, +x.altitude]);
      if (kv) await kv.put("ki:meta", JSON.stringify(meta), { expirationTtl: 7 * 86400 });
    }
    let best = null;
    for (const x of meta) { const d = km(la, lo, x[2], x[3]); if (d <= 30 && (!best || d < best.d)) best = { id: x[0], name: x[1], la: x[2], lo: x[3], h: x[4], d }; }
    if (best) {
      const j = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?parameters=TL,RR&station_ids=" + best.id + "&start=" + iso(start) + "&end=" + iso(end), 30000)).json();
      const P = j.features && j.features[0] && j.features[0].properties.parameters, TL = (P && P.TL && P.TL.data) || [], RR = (P && P.RR && P.RR.data) || [];
      return { st: best, pts: (j.timestamps || []).map((t, i) => ({ t: Date.parse(t) / 1000, T: TL[i], R: RR[i] })), per: 144 };
    }
  }
  /* Deutschland und Umgebung: DWD-Stationen über Bright Sky (stündlich) */
  try {
    const j = await (await h.tfetch("https://api.brightsky.dev/weather?lat=" + la.toFixed(3) + "&lon=" + lo.toFixed(3) + "&max_dist=30000&date=" + start.toISOString() + "&last_date=" + end.toISOString() + "&tz=Etc/UTC", 25000)).json();
    const W = j.weather || [], src = (j.sources || []).sort((a, b) => (a.distance || 0) - (b.distance || 0))[0];
    if (src && W.length > 100) {
      const pts = W.filter((x) => x.source_id === src.id).map((x) => ({ t: Date.parse(x.timestamp) / 1000, T: x.temperature, R: x.precipitation }));
      return { st: { name: src.station_name, la: src.lat, lo: src.lon, h: src.height, d: (src.distance || 0) / 1000 }, pts, per: 24 };
    }
  } catch (e) {}
  return null;
}

/* Lernen: Fehler je Modell und Vorlauf (1 bis 7 Tage) */
async function kiLearn(h, kv, la, lo) {
  const ob = await obsDays(h, kv, la, lo, 22);
  if (!ob || !ob.pts.length) return null;
  const hv = [];
  for (let d = 1; d <= 7; d++) hv.push("temperature_2m_previous_day" + d, "precipitation_previous_day" + d);
  const u = PR + "?latitude=" + ob.st.la.toFixed(4) + "&longitude=" + ob.st.lo.toFixed(4) + (ob.st.h != null ? "&elevation=" + Math.round(ob.st.h) : "") + "&hourly=" + hv.join(",") + "&past_days=21&forecast_days=1&timezone=auto&models=" + KI_M.join(",");
  const r = await h.tfetch(u, 30000);
  if (!r.ok) throw new Error("previous-runs " + r.status);
  const J = await r.json(), H = J.hourly || {}, T = H.time || [], off = +J.utc_offset_seconds || 0;
  /* Messung je Ortstag (vollständig: mindestens 90 % der Werte) */
  const O = new Map();
  for (const p of ob.pts) {
    if (p.T == null) continue;
    const day = new Date((p.t + off - (ob.per === 144 ? 300 : 1800)) * 1000).toISOString().slice(0, 10);
    let o = O.get(day);
    if (!o) O.set(day, (o = { hi: -99, lo: 99, rr: 0, n: 0, nr: 0 }));
    o.hi = Math.max(o.hi, p.T); o.lo = Math.min(o.lo, p.T); o.n++;
    if (p.R != null) { o.rr += +p.R; o.nr++; }
  }
  const today = new Date((Date.now() / 1000 + off) * 1000).toISOString().slice(0, 10);
  const byDay = new Map();
  T.forEach((t, i) => { const d = t.slice(0, 10); if (d < today) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(i); } });
  const S = {};
  for (const m of KI_M) {
    S[m] = [];
    for (let d = 1; d <= 7; d++) {
      const TA = H["temperature_2m_previous_day" + d + "_" + m], PA = H["precipitation_previous_day" + d + "_" + m], eh = [], el = [], ep = [];
      if (TA) for (const [day, ix] of byDay) {
        const o = O.get(day);
        if (!o || o.n < ob.per * 0.9 || ix.length < 23) continue;
        const v = ix.map((i) => TA[i]);
        if (v.some((x) => x == null)) continue;
        eh.push(Math.max(...v) - o.hi); el.push(Math.min(...v) - o.lo);
        if (PA && o.nr >= ob.per * 0.9) { const p = ix.map((i) => PA[i]); if (p.every((x) => x != null)) ep.push(p.reduce((a, b) => a + b, 0) - o.rr); }
      }
      const st = (E) => {
        if (E.length < 4) return null;
        const b = (E.reduce((a, x) => a + x, 0) / E.length) * (E.length / (E.length + 4));
        const s = Math.sqrt(E.reduce((a, x) => a + (x - b) ** 2, 0) / E.length);
        return [Math.max(-4, Math.min(4, Math.round(b * 100) / 100)), Math.round(s * 100) / 100, E.length];
      };
      const pm = ep.length >= 4 ? Math.round((ep.reduce((a, x) => a + Math.abs(x), 0) / ep.length) * 100) / 100 : null;
      S[m].push({ hi: st(eh), lo: st(el), p: pm });
    }
  }
  return { st: { name: ob.st.name, d: r1(ob.st.d) }, S, nd: O.size };
}

export async function bfKI(la, lo, h, kv) {
  const key = "ki:" + la.toFixed(2) + ":" + lo.toFixed(2), lk = "kil:" + la.toFixed(2) + ":" + lo.toFixed(2);
  if (kv) { const c = await kv.get(key); if (c) return c; }
  let L = kv ? JSON.parse((await kv.get(lk)) || "null") : null;
  if (!L) {
    try { L = await kiLearn(h, kv, la, lo); } catch (e) { console.error("KI lernen", e && e.message); L = null; }
    if (kv) await kv.put(lk, JSON.stringify(L || { none: 1 }), { expirationTtl: L ? 12 * 3600 : 3 * 3600 });
  }
  if (L && L.none) L = null;
  const dv = "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,weather_code,sunshine_duration";
  const r = await h.tfetch(OM + "?latitude=" + la + "&longitude=" + lo + "&daily=" + dv + "&forecast_days=16&timezone=auto&models=" + KI_M.join(","), 25000);
  if (!r.ok) throw new Error("forecast " + r.status);
  const F = await r.json(), D = F.daily || {}, days = [], used = new Set();
  (D.time || []).forEach((date, k) => {
    const lead = Math.max(1, Math.min(7, k)), far = k > 7;
    const row = { d: date };
    const comb = (fld, sk) => {
      let sw = 0, sv = 0, n = 0;
      const vals = [];
      for (const m of KI_M) {
        const a = D[fld + "_" + m], v = a && a[k];
        if (v == null) continue;
        const s = L && L.S[m] && L.S[m][lead - 1] && L.S[m][lead - 1][sk];
        let w = s ? 1 / (s[1] * s[1] + 0.3) : null, b = s ? s[0] : 0;
        if (far) { b *= 0.5; if (w != null) w = Math.sqrt(w); }
        vals.push({ m, v: v - b, w });
      }
      if (!vals.length) return null;
      const known = vals.filter((x) => x.w != null).map((x) => x.w).sort((a, b) => a - b), wm = known.length ? known[known.length >> 1] : 1;
      for (const x of vals) { const w = x.w != null ? x.w : wm; sw += w; sv += w * x.v; n++; used.add(x.m); }
      const mean = sv / sw;
      let sq = 0;
      for (const x of vals) sq += (x.w != null ? x.w : wm) * (x.v - mean) ** 2;
      return { v: mean, s: Math.sqrt(sq / sw), n };
    };
    const hi = comb("temperature_2m_max", "hi"), lo2 = comb("temperature_2m_min", "lo");
    if (!hi || !lo2) return;
    row.hi = r1(hi.v); row.lo = r1(Math.min(lo2.v, hi.v)); row.s = r1((hi.s + lo2.s) / 2); row.n = hi.n;
    /* Niederschlag: Menge gewichtet nach dem mittleren Mengenfehler, Wahrscheinlichkeit = gewichteter Anteil der Modelle ab 0,5 mm */
    let sw = 0, sp = 0, swet = 0, ssd = 0, nsd = 0, ssn = 0;
    const codes = {};
    for (const m of KI_M) {
      const p = D["precipitation_sum_" + m] && D["precipitation_sum_" + m][k];
      if (p == null) continue;
      const s = L && L.S[m] && L.S[m][lead - 1], pm = s && s.p != null ? s.p : null;
      let w = pm != null ? 1 / (pm + 0.5) ** 2 : 1;
      if (far) w = Math.sqrt(w);
      sw += w; sp += w * p; if (p >= 0.5) swet += w;
      const sn = D["snowfall_sum_" + m] && D["snowfall_sum_" + m][k]; if (sn != null) ssn += w * sn;
      const sd = D["sunshine_duration_" + m] && D["sunshine_duration_" + m][k]; if (sd != null) { ssd += sd; nsd++; }
      const c = D["weather_code_" + m] && D["weather_code_" + m][k]; if (c != null) codes[c] = (codes[c] || 0) + w;
    }
    if (sw) {
      row.p = r1(sp / sw); row.pw = Math.round((swet / sw) * 100); row.sn = r1(ssn / sw);
      /* Wetter-Symbol: passend zur Wahrscheinlichkeit aus den Modellen mit bzw. ohne Niederschlag, das meistgewichtete */
      const wetC = Object.keys(codes).filter((c) => +c >= 51), dryC = Object.keys(codes).filter((c) => +c < 51), pick = (L2) => L2.sort((a, b) => codes[b] - codes[a] || b - a)[0];
      const c = row.pw >= 50 && wetC.length ? pick(wetC) : dryC.length ? pick(dryC) : pick(Object.keys(codes));
      if (c != null) row.c = +c;
    }
    if (nsd) row.sd = Math.round(ssd / nsd);
    days.push(row);
  });
  const out = JSON.stringify({ at: Math.round(Date.now() / 1000), days, m: [...used].map((m) => KI_N[m] || m), st: L ? L.st : null, nd: L ? L.nd : 0 });
  if (kv) await kv.put(key, out, { expirationTtl: 3 * 3600 });
  return out;
}
