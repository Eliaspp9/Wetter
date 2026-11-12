/* Radar Österreich im Hintergrund (Web Worker): Daten von GeoSphere als NetCDF holen, auspacken und gleich ins Raster der Karte
   umrechnen. So bleibt die App dabei flüssig. Drei Arten (m.kind):
   - "rr":  INCA-Nowcast, Niederschlag in 0,01 mm je Viertelstunde (auch einzelne Messbilder älterer Läufe für den Rückblick)
   - "t2m": INCA-Temperatur in 0,01 °C, ein Bild: daraus je Zelle Schnee ja/nein (Temperatur höchstens m.tw °C)
   - "tp":  Wettermodell von GeoSphere (1 km, Gitter in Längen/Breiten), Niederschlag in 0,001 mm je Stunde, dazu Schnee (sf)
   Antwort an die App: Zeiten, Stärke je Zelle und Bild (0 = keine Daten, 1 = trocken, 2 bis 255 = Stärke), welche Zellen Daten
   haben, bei "t2m" bzw. "tp" die Schnee-Maske. -999 = keine Daten. */
importScripts("hdf5.min.js");
const merc = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) * 180 / Math.PI;
class NetErr extends Error {}
async function load(url, ms) {
  for (let i = 0; ; i++) {
    const ac = new AbortController(), t0 = Date.now(), tm = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (!r.ok) { const e = new NetErr(String(r.status)); e.status = r.status; throw e; }
      return await r.arrayBuffer();
    } catch (e) {
      /* sofortiger Fehlschlag (Netz noch nicht da, etwa gleich nach dem Zurückholen der App): einmal kurz danach wiederholen */
      if (i === 0 && e && e.name === "TypeError" && Date.now() - t0 < 8000) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (e instanceof NetErr) throw e;
      const n = new NetErr(e && e.name === "AbortError" ? "Zeit" : String(e && e.message || e)); n.abort = !!(e && e.name === "AbortError"); throw n;
    } finally { clearTimeout(tm); }
  }
}
self.onmessage = async (ev) => {
  const m = ev.data, kind = m.kind || "rr";
  try {
    const buf = await load(m.url, m.ms), t0 = Date.now();
    let T, R, C, v, fill, la, lo, tv, units, sfv = null, grid1d = false;
    try {
      const f = new hdf5.File(buf, "at.nc"), main = f.get(kind);
      [T, R, C] = main.shape; v = main.value; fill = main.fillvalue == null ? -999 : main.fillvalue;
      const LA = f.get("lat"), LO = f.get("lon");
      la = LA.value; lo = LO.value; grid1d = LA.shape.length === 1;
      if (kind === "tp" && f.keys.indexOf("sf") >= 0) sfv = f.get("sf").value;
      const tm = f.get("time"); tv = tm.value; units = String(tm.attrs.units || "");
    } catch (e) { throw new Error("Datei: " + (e && e.message || e)); }
    const mt = /^(days|hours|minutes|seconds) since (\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)(:\d\d)?/.exec(units);
    if (!mt || !T || !R || !C) throw new Error("Datei: Zeitangabe");
    const mul = { days: 86400, hours: 3600, minutes: 60, seconds: 1 }[mt[1]];
    const base = Date.parse(mt[2] + "T" + mt[3] + (mt[4] || ":00") + "Z") / 1000, t = Array.from(tv, (x) => base + Number(x) * mul);
    const g = m.g, W = g.W, H = g.H, cs = m.cs, N = R * C, rcMin = m.rcMin, rcL = m.rcL;
    const code = (r) => (r < rcMin ? 1 : Math.min(255, 2 + Math.round(253 * Math.log(r / rcMin) / rcL)));
    const nV = kind === "t2m" ? 0 : T;
    const V = Array.from({ length: nV }, () => new Uint8Array(W * H)), has = new Uint8Array(W * H);
    /* Schnee: bei t2m je Zelle (1 = Schnee, 0 = Regen), beim Modell je Bild und Zelle */
    const S = kind === "t2m" ? new Uint8Array(W * H) : null, SM = sfv ? Array.from({ length: T }, () => new Uint8Array(W * H)) : null;
    let n = 0, r0 = H, r1 = -1, c0 = W, c1 = -1;
    /* Zeilen und Spalten der Karte vorab (Modell: Gitter in Längen/Breiten) */
    const XC = grid1d ? Int32Array.from(lo, (b) => Math.floor((b - g.lo0) / cs)) : null, YR = grid1d ? Int32Array.from(la, (a) => Math.floor((g.yT - merc(a)) / cs)) : null;
    for (let i = 0; i < N; i++) {
      let x, y;
      if (grid1d) { y = YR[(i / C) | 0]; x = XC[i % C]; }
      else { const a = la[i], b = lo[i]; if (!(a === a && b === b)) continue; x = Math.floor((b - g.lo0) / cs); y = Math.floor((g.yT - merc(a)) / cs); }
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      let any = false;
      if (kind === "t2m") {
        const q = v[i];
        if (q === fill || q === -999 || q !== q) continue;
        any = true;
        if (q / 100 <= m.tw) S[o] = 1;
      } else {
        for (let k = 0; k < T; k++) {
          const q = v[k * N + i];
          if (q === fill || !(q >= 0)) continue;
          any = true;
          const r = kind === "tp" ? q / 1000 : q / 100 * 4, c = code(r);
          if (c > V[k][o]) V[k][o] = c;
          if (SM && r > 0) { const s = sfv[k * N + i]; if (s >= 0 && s / 1000 >= r * 0.5) SM[k][o] = 1; }
        }
      }
      if (!any) continue;
      if (!has[o]) n++;
      has[o] = 1;
      if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x;
    }
    if (!n) throw new Error("Datei: leer");
    /* einzelne Zellen ohne Punkt (die Zellen sind etwas größer als der Punktabstand) aus den Nachbarn füllen */
    const holes = [];
    for (let y = Math.max(1, r0); y <= Math.min(H - 2, r1); y++) for (let x = Math.max(1, c0); x <= Math.min(W - 2, c1); x++) {
      const o = y * W + x;
      if (!has[o] && (has[o - 1] ? 1 : 0) + (has[o + 1] ? 1 : 0) + (has[o - W] ? 1 : 0) + (has[o + W] ? 1 : 0) >= 3) holes.push(o);
    }
    const nb = (o) => [o - 1, o + 1, o - W, o + W];
    for (const o of holes) {
      for (let k = 0; k < nV; k++) { const A = V[k]; let s = 0, c = 0; for (const q of nb(o)) if (has[q] === 1 && A[q]) { s += A[q]; c++; } A[o] = c ? Math.round(s / c) : 0; }
      if (S) { let s = 0, c = 0; for (const q of nb(o)) if (has[q] === 1) { s += S[q]; c++; } S[o] = c && s * 2 >= c ? 1 : 0; }
      if (SM) for (let k = 0; k < T; k++) { let s = 0; for (const q of nb(o)) if (has[q] === 1) s += SM[k][q]; SM[k][o] = s >= 2 ? 1 : 0; }
      has[o] = 2;
    }
    const tr = [...V.map((a) => a.buffer), has.buffer];
    if (S) tr.push(S.buffer);
    if (SM) SM.forEach((a) => tr.push(a.buffer));
    self.postMessage({ id: m.id, ok: true, t, base, V, has, S, SM, n, bytes: buf.byteLength, ms: Date.now() - t0 }, tr);
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String(e && e.message || e), net: e instanceof NetErr, abort: !!(e && e.abort), status: e && e.status || 0 });
  }
};
