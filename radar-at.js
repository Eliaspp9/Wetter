/* Radar Österreich im Hintergrund (Web Worker): ganz Österreich mit Rand in EINEM Abruf von GeoSphere holen, als NetCDF
   (etwa 1 MB statt vieler Stücke Text von je 6 MB), auspacken und gleich ins Raster der Karte umrechnen. So bleibt die App
   dabei flüssig. Antwort an die App: Zeiten, Stärke je Zelle und Bild (0 = keine Daten, 1 = trocken, 2 bis 255 = Stärke),
   welche Zellen Daten haben. Die Werte in der Datei: Niederschlag in 0,01 mm je Viertelstunde, -999 = keine Daten. */
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
  const m = ev.data;
  try {
    const buf = await load(m.url, m.ms), t0 = Date.now();
    let T, R, C, v, fill, la, lo, tv, units;
    try {
      const f = new hdf5.File(buf, "at.nc"), rr = f.get("rr");
      [T, R, C] = rr.shape; v = rr.value; fill = rr.fillvalue == null ? -999 : rr.fillvalue;
      la = f.get("lat").value; lo = f.get("lon").value;
      const tm = f.get("time"); tv = tm.value; units = String(tm.attrs.units || "");
    } catch (e) { throw new Error("Datei: " + (e && e.message || e)); }
    const mt = /^(minutes|hours|seconds) since (\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)(:\d\d)?/.exec(units);
    if (!mt || !T || !R || !C) throw new Error("Datei: Zeitangabe");
    const mul = mt[1] === "hours" ? 3600 : mt[1] === "seconds" ? 1 : 60;
    const base = Date.parse(mt[2] + "T" + mt[3] + (mt[4] || ":00") + "Z") / 1000, t = Array.from(tv, (x) => base + Number(x) * mul);
    const g = m.g, W = g.W, H = g.H, cs = m.cs, N = R * C, rcMin = m.rcMin, rcL = m.rcL;
    const V = t.map(() => new Uint8Array(W * H)), has = new Uint8Array(W * H);
    let n = 0, r0 = H, r1 = -1, c0 = W, c1 = -1;
    for (let i = 0; i < N; i++) {
      const a = la[i], b = lo[i];
      if (!(a === a && b === b)) continue;
      const x = Math.floor((b - g.lo0) / cs), y = Math.floor((g.yT - merc(a)) / cs);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      let any = false;
      for (let k = 0; k < T; k++) {
        const q = v[k * N + i];
        if (q === fill || !(q >= 0)) continue;
        any = true;
        const r = q / 100 * 4, c = r < rcMin ? 1 : Math.min(255, 2 + Math.round(253 * Math.log(r / rcMin) / rcL));
        if (c > V[k][o]) V[k][o] = c;
      }
      if (!any) continue;
      has[o] = 1; n++;
      if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x;
    }
    if (!n) throw new Error("Datei: leer");
    /* einzelne Zellen ohne Punkt (die Zellen sind etwas größer als der Punktabstand) aus den Nachbarn füllen */
    const holes = [];
    for (let y = Math.max(1, r0); y <= Math.min(H - 2, r1); y++) for (let x = Math.max(1, c0); x <= Math.min(W - 2, c1); x++) {
      const o = y * W + x;
      if (!has[o] && (has[o - 1] ? 1 : 0) + (has[o + 1] ? 1 : 0) + (has[o - W] ? 1 : 0) + (has[o + W] ? 1 : 0) >= 3) holes.push(o);
    }
    for (const o of holes) {
      for (let k = 0; k < T; k++) { const A = V[k]; let s = 0, c = 0; for (const q of [o - 1, o + 1, o - W, o + W]) if (has[q] === 1 && A[q]) { s += A[q]; c++; } A[o] = c ? Math.round(s / c) : 0; }
      has[o] = 2;
    }
    self.postMessage({ id: m.id, ok: true, t, base, V, has, n, bytes: buf.byteLength, ms: Date.now() - t0 }, [...V.map((a) => a.buffer), has.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String(e && e.message || e), net: e instanceof NetErr, abort: !!(e && e.abort), status: e && e.status || 0 });
  }
};
