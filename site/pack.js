/* Radarbilder fertig für die App aufbereiten (Regenradar Österreich, Rückblick, Temperatur, Wettermodell von GeoSphere).
   Das Gleiche wie radar-at.js im Handy, nur hier am Server: NetCDF auspacken und gleich ins Raster der Karte umrechnen.
   Das Ergebnis ist ein kleines, gepacktes Paket (gzip). Das Handy muss es nur noch auspacken, statt die große Datei
   selbst zu lesen und umzurechnen: lädt schneller, ruckelt nicht und spart Akku.
   Gleiche Werte wie in index.html (AT_BOX, AT_CS, RC_MIN, AT_FAINT, SN_TW); ändern sie sich dort, hier mitändern
   (das Paket sagt Breite und Höhe mit, passt es nicht, nimmt die App die NetCDF-Datei wie bisher).
   Aufbau: 4 Byte Länge des Kopfes, Kopf als JSON {v,t,base,n,W,H,nV,S,SM}, dann has, V (je Bild), S, SM (je Bild), alles W*H Byte. */
import hdf5 from "./hdf5.mjs";

const AT_BOX = [45.5, 8.1, 49.48, 17.74], AT_CS = 1.08 / (111.32 * Math.cos(47.5 * Math.PI / 180)),
  RC_MIN = 0.03, RC_L = Math.log(200 / RC_MIN), AT_FAINT = 0.2, SN_TW = 1;
const merc = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) * 180 / Math.PI;
const G = (() => {
  const yT = merc(AT_BOX[2]), W = Math.max(2, Math.ceil((AT_BOX[3] - AT_BOX[1]) / AT_CS)), H = Math.max(2, Math.ceil((yT - merc(AT_BOX[0])) / AT_CS));
  return { lo0: AT_BOX[1], yT, W, H };
})();

/* kind: rr, t2m oder tp; fc0: ab dieser Zeit gilt ein Bild als Vorhersage (schwachen Niederschlag weglassen) */
export function convert(buf, kind, fc0) {
  const f = new hdf5.File(buf, "at.nc"), main = f.get(kind);
  const [T, R, C] = main.shape, v = main.value, fill = main.fillvalue == null ? -999 : main.fillvalue;
  const LA = f.get("lat"), LO = f.get("lon"), la = LA.value, lo = LO.value, grid1d = LA.shape.length === 1;
  const sfv = kind === "tp" && f.keys.indexOf("sf") >= 0 ? f.get("sf").value : null;
  const tm = f.get("time"), tv = tm.value, units = String(tm.attrs.units || "");
  const mt = /^(days|hours|minutes|seconds) since (\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)(:\d\d)?/.exec(units);
  if (!mt || !T || !R || !C) throw new Error("Zeitangabe");
  const mul = { days: 86400, hours: 3600, minutes: 60, seconds: 1 }[mt[1]];
  const base = Date.parse(mt[2] + "T" + mt[3] + (mt[4] || ":00") + "Z") / 1000, t = Array.from(tv, (x) => base + Number(x) * mul);
  const W = G.W, H = G.H, cs = AT_CS, N = R * C;
  const code = (r) => (r < RC_MIN ? 1 : Math.min(255, 2 + Math.round(253 * Math.log(r / RC_MIN) / RC_L)));
  const nV = kind === "t2m" ? 0 : T;
  const lim = Array.from({ length: T }, (_, k) => (kind === "tp" || t[k] > (fc0 == null ? Infinity : fc0) ? AT_FAINT : 0));
  const V = Array.from({ length: nV }, () => new Uint8Array(W * H)), has = new Uint8Array(W * H);
  const S = kind === "t2m" ? new Uint8Array(W * H) : null, SM = sfv ? Array.from({ length: T }, () => new Uint8Array(W * H)) : null;
  let n = 0, r0 = H, r1 = -1, c0 = W, c1 = -1;
  const XC = grid1d ? Int32Array.from(lo, (b) => Math.floor((b - G.lo0) / cs)) : null, YR = grid1d ? Int32Array.from(la, (a) => Math.floor((G.yT - merc(a)) / cs)) : null;
  for (let i = 0; i < N; i++) {
    let x, y;
    if (grid1d) { y = YR[(i / C) | 0]; x = XC[i % C]; }
    else { const a = la[i], b = lo[i]; if (!(a === a && b === b)) continue; x = Math.floor((b - G.lo0) / cs); y = Math.floor((G.yT - merc(a)) / cs); }
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const o = y * W + x;
    let any = false;
    if (kind === "t2m") {
      const q = v[i];
      if (q === fill || q === -999 || q !== q) continue;
      any = true;
      if (q / 100 <= SN_TW) S[o] = 1;
    } else {
      for (let k = 0; k < T; k++) {
        const q = v[k * N + i];
        if (q === fill || !(q >= 0)) continue;
        any = true;
        const r = kind === "tp" ? q / 1000 : q / 100 * 4;
        if (r < lim[k]) continue;
        const c = code(r);
        if (c > V[k][o]) V[k][o] = c;
        if (SM && r > 0) { const s = sfv[k * N + i]; if (s >= 0 && s / 1000 >= r * 0.5) SM[k][o] = 1; }
      }
    }
    if (!any) continue;
    if (!has[o]) n++;
    has[o] = 1;
    if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x;
  }
  if (!n) throw new Error("leer");
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
  return { t, base, n, W, H, has, V, S, SM };
}

/* in ein gepacktes Paket schreiben */
export async function packed(buf, kind, fc0) {
  const d = convert(buf, kind, fc0), WH = d.W * d.H;
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, t: d.t, base: d.base, n: d.n, W: d.W, H: d.H, nV: d.V.length, S: !!d.S, SM: d.SM ? d.SM.length : 0 }));
  const parts = [d.has, ...d.V, ...(d.S ? [d.S] : []), ...(d.SM || [])];
  const out = new Uint8Array(4 + head.length + parts.length * WH);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  let o = 4 + head.length;
  for (const p of parts) { out.set(p, o); o += WH; }
  const cs = new Blob([out]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(cs).arrayBuffer();
}
