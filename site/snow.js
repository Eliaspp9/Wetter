/* ============ Schneehöhe am Ort, selbst berechnet (Österreich) ============
   Grundlage: gemessener Niederschlag und Temperatur von GeoSphere (INCA, 1 km, stündlich, aus Regenmessern und Radar) der
   letzten 7 Tage genau am Ort. Daraus ein einfaches Schneedecken-Modell, Stunde für Stunde:
   - Niederschlag fällt als Schnee bis 0,5 °C, zwischen 0,5 und 1,5 °C anteilig, darüber als Regen.
   - Regenmesser fangen Schnee schlecht auf (Wind weht ihn vorbei), auch das Radar sieht Schnee schwächer: Schnee-Niederschlag
     wird um 40 % plus 5 % je m/s Wind erhöht (höchstens 80 %).
   - Dichte von frischem Schnee je nach Temperatur (Hedstrom und Pomeroy 1998): bei 0 °C etwa 120 kg/m³ (nass), bei −10 °C
     etwa 70 kg/m³ (locker). Er setzt sich mit der Zeit (in etwa 3 Tagen Richtung 250 kg/m³, bei Plusgraden schneller).
   - Schmelzen über 0 °C: 3 mm Wasser je Grad und Tag (Grad-Tag-Verfahren), Regen auf Schnee schmilzt zusätzlich etwas.
   Prüfung an Stationen mit Schneepegel bis 80 km (GeoSphere TAWES, alle 10 Minuten): dort wird genauso gerechnet und mit
   der Messung verglichen; der mittlere Unterschied (Median, höchstens Faktor 0,6 bis 1,8) wird am Ort übernommen. */
const INCA = "https://dataset.api.hub.geosphere.at/v1/timeseries/historical/inca-v1-1h-1km";
const km = (a, b, c, d) => { const r = Math.PI / 180; return 6371 * Math.hypot((d - b) * r * Math.cos(((a + c) / 2) * r), (c - a) * r); };

/* Schneedecke aus Stundenwerten (RR mm, T °C, W m/s) → Schneehöhe in cm am Ende */
export function snowModel(RR, T, W) {
  const L = [];
  for (let i = 0; i < RR.length; i++) {
    const p = Math.max(0, +RR[i] || 0), t = T[i] == null ? 0 : +T[i], w = W && W[i] != null ? +W[i] : 1;
    for (const l of L) l.age += t > 0 ? 2 : 1;
    const fs = t <= 0.5 ? 1 : t >= 1.5 ? 0 : 1.5 - t;
    if (p > 0 && fs > 0) {
      const swe = p * fs * Math.min(1.8, 1.4 + 0.05 * w), rho0 = Math.min(150, 67.92 + 51.25 * Math.exp(Math.min(0, t) / 2.59));
      L.push({ swe, rho0, age: 0 });
    }
    let melt = t > 0 ? 0.125 * t + (p * (1 - fs) * t) / 80 : 0;
    for (let k = L.length - 1; k >= 0 && melt > 0; k--) { const m = Math.min(L[k].swe, melt); L[k].swe -= m; melt -= m; if (L[k].swe <= 0.01) L.splice(k, 1); }
  }
  let cm = 0;
  for (const l of L) { const rho = l.rho0 + (250 - l.rho0) * (1 - Math.exp(-l.age / 72)); cm += (l.swe / rho) * 100; }
  return cm;
}

async function incaSeries(h, pts) {
  const end = new Date(Math.floor(Date.now() / 3600000) * 3600000), start = new Date(end.getTime() - 7 * 86400000), iso = (d) => d.toISOString().slice(0, 16);
  const u = INCA + "?parameters=RR,T2M,UU,VV" + pts.map((p) => "&lat_lon=" + p[0].toFixed(4) + "," + p[1].toFixed(4)).join("") + "&start=" + iso(start) + "&end=" + iso(end);
  const r = await h.tfetch(u, 30000);
  if (!r.ok) throw new Error("INCA " + r.status);
  const j = await r.json();
  return { ts: j.timestamps || [], F: (j.features || []).map((f) => { const P = f.properties.parameters, U = P.UU.data, V = P.VV.data; return { RR: P.RR.data, T: P.T2M.data, W: U.map((u2, i) => (u2 == null || V[i] == null ? null : Math.hypot(u2, V[i]))) }; }) };
}

export async function bfSnow(la, lo, h, kv, el) {
  const key = "snow:" + la.toFixed(2) + ":" + lo.toFixed(2), slot = Math.floor(Date.now() / 1200000);
  if (kv) { const c = JSON.parse((await kv.get(key)) || "null"); if (c && c.slot === slot) return JSON.stringify(c); }
  if (!(la >= 46.3 && la <= 49.1 && lo >= 9.4 && lo <= 17.2)) return JSON.stringify({ ok: 0 });
  /* Stationen mit Schneepegel in der Nähe (nur die, die gerade Schnee messen: dort lässt sich vergleichen) */
  let cal = [];
  try {
    let meta = kv ? JSON.parse((await kv.get("ki:meta")) || "null") : null;
    if (!meta) {
      const m = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min/metadata", 20000)).json();
      meta = (m.stations || []).filter((x) => x.is_active !== false && x.altitude != null).map((x) => [x.id, x.name, +x.lat, +x.lon, +x.altitude]);
      if (kv) await kv.put("ki:meta", JSON.stringify(meta), { expirationTtl: 7 * 86400 });
    }
    /* ähnliche Höhe (höchstens 400 m Unterschied), sonst liegt dort oft älterer Schnee, den es am Ort nicht gibt */
    const near = meta.map((x) => ({ x, d: km(la, lo, x[2], x[3]) })).filter((o) => o.d <= 80 && (!(el >= -50) || Math.abs(o.x[4] - el) <= 400)).sort((a, b) => a.d - b.d).slice(0, 40);
    if (near.length) {
      const g = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=SCHNEE&station_ids=" + near.map((o) => o.x[0]).join(","), 15000)).json();
      const by = {};
      (g.features || []).forEach((f) => { const d = f.properties.parameters.SCHNEE.data, v = d && d.length ? d[d.length - 1] : null; if (v != null && v >= 0) by[String(f.properties.station)] = +v; });
      cal = near.filter((o) => by[o.x[0]] != null && by[o.x[0]] >= 3).slice(0, 4).map((o) => ({ name: o.x[1], la: o.x[2], lo: o.x[3], d: o.d, cm: by[o.x[0]] }));
    }
  } catch (e) {}
  const S = await incaSeries(h, [[la, lo], ...cal.map((c) => [c.la, c.lo])]);
  if (!S.F.length) return JSON.stringify({ ok: 0 });
  const raw = snowModel(S.F[0].RR, S.F[0].T, S.F[0].W), rs = [];
  cal.forEach((c, i) => { const f = S.F[i + 1]; if (!f) return; const m = snowModel(f.RR, f.T, f.W); c.model = Math.round(m * 10) / 10; if (m >= 2 && c.cm / m >= 0.3 && c.cm / m <= 3) rs.push(c.cm / m); });
  rs.sort((a, b) => a - b);
  /* nur halb übernehmen: die Pegel stehen bis 80 km weg, dort fällt oft anders viel */
  const fac = rs.length ? 1 + (Math.max(0.6, Math.min(1.8, rs[rs.length >> 1])) - 1) * 0.5 : 1;
  const out = { ok: 1, slot, cm: Math.round(raw * fac * 10) / 10, raw: Math.round(raw * 10) / 10, f: Math.round(fac * 100) / 100, n: rs.length, st: cal.filter((c) => c.model >= 2).map((c) => c.name), t: S.ts[S.ts.length - 1] };
  if (kv) await kv.put(key, JSON.stringify(out), { expirationTtl: 3600 });
  return JSON.stringify(out);
}
