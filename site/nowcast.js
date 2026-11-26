/* ============ Eigene Kurzvorhersage für Österreich (neu, sobald das Europa-Radar ein neues Bild hat, meist alle 10 Minuten;
   Bilder im 5-Minuten-Abstand bis 60 Minuten voraus, 1 km) ============
   Aus dem Europa-Radar (LibreWXR, OPERA, Zoom 7, Grauwert = dBZ + 32) auf das Raster der App (site/pack.js):
   1. Messbilder: das neueste und eines etwa 15 Minuten davor.
   2. Angleichung an GeoSphere (Faktor bf aus grBias), bei Gewittern andere Umrechnung (Blitze von EUMETSAT MTG),
      dann die Regenmesser (TAWES, alle 10 Minuten): wo eine Station mehr oder weniger misst als das Radar, wird das Bild
      in der Umgebung (etwa 20 km) angepasst; regnet es an einer Station, wo das Radar nichts sieht (Berge), kommt dort
      Regen dazu.
   3. Zugbahn: Blöcke von etwa 50 km werden zwischen den beiden Bildern verglichen (beste Verschiebung) → Zuggeschwindigkeit
      und -richtung je Gegend, dazu ob der Regen dort stärker oder schwächer wird (gedämpft).
   4. Weiterschieben: alle 5 Minuten bis 60 Minuten, mit der Zeit etwas weicher (je weiter voraus, desto ungenauer der Ort).
   Ergebnis gepackt wie die Bilder von GeoSphere (gr:p:sn:<t0>), die App mischt es je nach Trefferquote (Bewertung skRun)
   mit der Vorhersage von GeoSphere. */
import { G, AT_CS, RC_MIN, RC_L, merc, unpackSrv, convert } from "./pack.js";

const W = G.W, H = G.H, WH = W * H;
export const SN_STEP = 300, SN_N = 13;
const code = (r) => (r < RC_MIN ? 1 : Math.min(255, 2 + Math.round((253 * Math.log(r / RC_MIN)) / RC_L)));
export const DEC = new Float32Array(256);
for (let q = 2; q < 256; q++) DEC[q] = RC_MIN * Math.exp(((q - 2) / 253) * RC_L);
const GREY = new Float32Array(256);
for (let g = 0; g < 256; g++) { const z = g - 32; GREY[g] = z >= 5 ? Math.pow(Math.pow(10, z / 10) / 200, 0.625) : 0; }

/* Lage jeder Zelle in den Kacheln (Zoom 7, 512 Punkte): Spalten und Zeilen getrennt, das Raster ist in Mercator gleichmäßig */
const Z = 7, NT = 1 << Z, TP = 512;
const CX = new Int32Array(W), CY = new Int32Array(H), CTX = new Int32Array(W), CTY = new Int32Array(H);
for (let x = 0; x < W; x++) { const f = ((G.lo0 + (x + 0.5) * AT_CS + 180) / 360) * NT; CTX[x] = Math.floor(f); CX[x] = Math.min(TP - 1, Math.floor((f - CTX[x]) * TP)); }
for (let y = 0; y < H; y++) { const f = ((180 - (G.yT - (y + 0.5) * AT_CS)) / 360) * NT; CTY[y] = Math.floor(f); CY[y] = Math.min(TP - 1, Math.floor((f - CTY[y]) * TP)); }
const TX0 = CTX[0], TX1 = CTX[W - 1], TY0 = CTY[0], TY1 = CTY[H - 1];

/* ein Messbild des Europa-Radars → mm/h je Zelle (Mittel aus 3 x 3 Kachelpunkten, eine Zelle sind etwa 2,6 Punkte) */
export async function snDecode(h, base) {
  const T = [];
  for (let ty = TY0; ty <= TY1; ty++) for (let tx = TX0; tx <= TX1; tx++) T.push([tx, ty]);
  const tiles = new Map();
  await Promise.all(T.map(async ([tx, ty]) => {
    try { const r = await h.tfetch(base + "/512/" + Z + "/" + tx + "/" + ty + "/0/1_0.png", 15000); if (r.ok) tiles.set(tx + "_" + ty, await h.pngRGBA(await r.arrayBuffer())); } catch (e) {}
  }));
  if (tiles.size < T.length * 0.8) return null;
  const R = new Float32Array(WH), has = new Uint8Array(WH);
  for (let y = 0; y < H; y++) {
    const py = CY[y];
    for (let x = 0; x < W; x++) {
      const t = tiles.get(CTX[x] + "_" + CTY[y]);
      if (!t) continue;
      const px = CX[x], d = t.d, tw = t.W;
      let s = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(t.H - 1, Math.max(0, py + j));
        for (let i = -1; i <= 1; i++) {
          const o = (yy * tw + Math.min(tw - 1, Math.max(0, px + i))) * 4, r = d[o];
          if (d[o + 3] > 90 && r === d[o + 1] && r === d[o + 2]) s += GREY[r];
        }
      }
      const k = y * W + x;
      R[k] = s / 9;
      has[k] = 1;
    }
  }
  return { R, has };
}

/* Zelle zu Ort */
export const cellOf = (la, lo) => [Math.floor((lo - G.lo0) / AT_CS), Math.floor((G.yT - merc(la)) / AT_CS)];

/* grobes Raster (4 x 4 Zellen, etwa 4,3 km) */
const C = 4, CW = Math.ceil(W / C), CH = Math.ceil(H / C);
function coarse(R) {
  const out = new Float32Array(CW * CH), n = new Uint8Array(CW * CH);
  for (let y = 0; y < H; y++) { const cy = (y / C) | 0; for (let x = 0; x < W; x++) { const o = cy * CW + ((x / C) | 0); out[o] += R[y * W + x]; n[o]++; } }
  for (let i = 0; i < out.length; i++) out[i] = n[i] ? out[i] / n[i] : 0;
  return out;
}
const tr = (v) => (v > 0.1 ? 1 + Math.log(v / 0.1) : 0);

/* Zugbahn: beste Verschiebung je Block (12 x 12 grobe Zellen, alle 6 Zellen ein Block). Ergebnis: Liste der Blöcke mit
   Mitte (grob), Verschiebung (grobe Zellen je Sekunde) und Wachstum (je Sekunde, Logarithmus) */
export function snMotion(Ra, Rb, dt) {
  const ca = coarse(Ra), cb = coarse(Rb), A = ca.map(tr), B = cb.map(tr);
  const BS = 12, ST = 6, D = Math.max(3, Math.min(14, Math.ceil(((170 / 3.6) * dt) / (C * 1080))));
  const out = [];
  for (let by = 0; by + BS <= CH; by += ST) for (let bx = 0; bx + BS <= CW; bx += ST) {
    let wet = 0;
    for (let y = by; y < by + BS; y++) for (let x = bx; x < bx + BS; x++) if (B[y * CW + x] > 0) wet++;
    if (wet < 12) continue;
    const cost = (dx, dy) => {
      let s = 0, n = 0;
      for (let y = by; y < by + BS; y++) {
        const ya = y - dy;
        if (ya < 0 || ya >= CH) continue;
        for (let x = bx; x < bx + BS; x++) { const xa = x - dx; if (xa < 0 || xa >= CW) continue; s += Math.abs(B[y * CW + x] - A[ya * CW + xa]); n++; }
      }
      return n > BS * BS * 0.6 ? s / n : 1e9;
    };
    let best = 1e9, bdx = 0, bdy = 0;
    const cs = new Map();
    for (let dy = -D; dy <= D; dy++) for (let dx = -D; dx <= D; dx++) { const c = cost(dx, dy); cs.set(dx + "," + dy, c); if (c < best) { best = c; bdx = dx; bdy = dy; } }
    if (best >= 1e9) continue;
    const c0 = cs.get("0,0");
    /* Verschiebung unter einer Zelle genauer (Parabel durch die Nachbarn) */
    const sub = (m, p) => { if (m == null || p == null || m >= 1e9 || p >= 1e9) return 0; const den = m - 2 * best + p; return den > 1e-6 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / den)) : 0; };
    const fx = bdx + sub(cs.get(bdx - 1 + "," + bdy), cs.get(bdx + 1 + "," + bdy)), fy = bdy + sub(cs.get(bdx + "," + (bdy - 1)), cs.get(bdx + "," + (bdy + 1)));
    /* am Rand der Suche: unsicher, weglassen */
    if (Math.abs(bdx) === D || Math.abs(bdy) === D) continue;
    /* Wachstum: Regen im Block jetzt gegen den verschobenen Regen davor */
    let mb = 0, ma = 0, n = 0;
    for (let y = by; y < by + BS; y++) for (let x = bx; x < bx + BS; x++) {
      const xa = Math.round(x - fx), ya = Math.round(y - fy);
      if (xa < 0 || ya < 0 || xa >= CW || ya >= CH) continue;
      mb += cb[y * CW + x]; ma += ca[ya * CW + xa]; n++;
    }
    const g = n ? Math.max(-Math.log(2) / 1800, Math.min(Math.log(2) / 1800, Math.log((mb / n + 0.05) / (ma / n + 0.05)) / dt)) : 0;
    out.push({ x: bx + BS / 2, y: by + BS / 2, u: fx / dt, v: fy / dt, g, q: c0 > 0 ? Math.max(0, 1 - best / c0) : 0 });
  }
  return out;
}

/* Felder je Zelle aus den Blöcken (gewichtet nach Abstand, etwa 65 km; ohne Blöcke in der Nähe: Mittel aller) */
export function snField(B) {
  const U = new Float32Array(CW * CH), V = new Float32Array(CW * CH), Gr = new Float32Array(CW * CH);
  if (!B.length) return { U, V, Gr };
  let mu = 0, mv = 0, sw = 0;
  for (const b of B) { const w = b.w || 1; mu += b.u * w; mv += b.v * w; sw += w; }
  mu /= sw; mv /= sw;
  const s2 = 2 * 15 * 15, w0 = 0.05;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let su = mu * w0, sv = mv * w0, sg = 0, ww = w0;
    for (const b of B) { const d2 = (b.x - x) ** 2 + (b.y - y) ** 2; if (d2 > 9 * s2) continue; const w = Math.exp(-d2 / s2) * (b.w || 1); su += b.u * w; sv += b.v * w; sg += b.g * w; ww += w; }
    const o = y * CW + x;
    U[o] = su / ww; V[o] = sv / ww; Gr[o] = sg / ww;
  }
  return { U, V, Gr };
}
const bil = (F, cx, cy) => {
  cx = Math.max(0, Math.min(CW - 1.001, cx)); cy = Math.max(0, Math.min(CH - 1.001, cy));
  const x0 = cx | 0, y0 = cy | 0, fx = cx - x0, fy = cy - y0, o = y0 * CW + x0, x1 = x0 + 1 < CW ? 1 : 0, y1 = y0 + 1 < CH ? CW : 0;
  return (F[o] * (1 - fx) + F[o + x1] * fx) * (1 - fy) + (F[o + y1] * (1 - fx) + F[o + y1 + x1] * fx) * fy;
};

/* Gewitter: wo es in den letzten Minuten geblitzt hat (EUMETSAT MTG, Blitzfläche), ab 4 mm/h mit der Umrechnung für
   Gewitterregen (Z = 300 R^1,4 statt 200 R^1,6). Das ergibt bei starkem Regen bis etwa ein Drittel mehr. */
export async function snLightning(h, R) {
  const Rm = 6378137, xm = (lo) => (lo * Math.PI / 180) * Rm;
  /* das Raster ist in Mercator gleichmäßig: Ecken direkt in Metern */
  const w = Math.ceil(W / 3), hh = Math.ceil(H / 3), my = (d) => (d * Math.PI / 180) * Rm;
  const u = "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=" +
    [xm(G.lo0), my(G.yT - H * AT_CS), xm(G.lo0 + W * AT_CS), my(G.yT)].map((v) => v.toFixed(0)).join(",") + "&width=" + w + "&height=" + hh + "&format=image/png&transparent=true&v=" + Math.floor(Date.now() / 60000);
  const r = await h.tfetch(u, 15000);
  if (!r.ok) return 0;
  const p = await h.pngRGBA(await r.arrayBuffer());
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, v = R[k];
    if (v < 4) continue;
    let hit = false;
    const px = Math.floor((x / W) * p.W), py = Math.floor((y / H) * p.H);
    for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) { const xx = px + i, yy = py + j; if (xx < 0 || yy < 0 || xx >= p.W || yy >= p.H) continue; if (p.d[(yy * p.W + xx) * 4 + 3] >= 40) { hit = true; break; } }
    if (!hit) continue;
    const z = 200 * Math.pow(v, 1.6), rc = Math.pow(z / 300, 1 / 1.4);
    if (rc > v) { R[k] = rc; n++; }
  }
  return n;
}

/* Regenmesser: Verhältnis Station / Radar (3 x 3 Zellen um die Station), daraus ein Feld (etwa 20 km), weit weg von
   Stationen bleibt es beim Radar. Bei Frost (Schnee) nur nach oben, weil Messer Schnee oft zu wenig auffangen.
   Wo eine Station Regen misst (ab 0,3 mm/h), das Radar aber nichts sieht: dort bis 4 km Regen dazu. */
export function snGauges(R, Rcmp, obs, sh, ec, ea) {
  const Fq = new Float32Array(CW * CH), Fw = new Float32Array(CW * CH), add = [];
  let used = 0, sl = 0;
  for (const s of obs) {
    const [x0, y0] = cellOf(s.la, s.lo);
    /* Regen zieht: im Vergleichsbild dort ablesen, wo der Regen über der Station zu dessen Zeit war (ec), und die Korrektur
       dort anbringen, wo er jetzt ist (ea) */
    const [cx0, cy0] = sh ? sh(x0, y0, ec || 0) : [0, 0], [ex, ey] = sh ? sh(x0, y0, ea || 0) : [0, 0];
    const x = Math.round(x0 + cx0), y = Math.round(y0 + cy0), X = Math.round(x0 + ex), Y = Math.round(y0 + ey);
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    let r = 0, mx = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const v = Rcmp[(y + j) * W + x + i]; r += v; mx = Math.max(mx, v); }
    r /= 9;
    const g = s.rr;
    if (g < 0.2 && r < 0.2) continue;
    if (g >= 0.3 && mx < 0.1) { add.push({ x: X, y: Y, g }); used++; continue; }
    let q = Math.log((g + 0.15) / (r + 0.15));
    q = Math.max(-Math.log(3), Math.min(Math.log(3), q));
    if (s.tl != null && s.tl <= 1 && q < 0) continue;
    const cx = X / C, cy = Y / C, s2 = 2 * 4.6 * 4.6;
    for (let yy = Math.max(0, Math.floor(cy - 14)); yy <= Math.min(CH - 1, Math.ceil(cy + 14)); yy++) for (let xx = Math.max(0, Math.floor(cx - 14)); xx <= Math.min(CW - 1, Math.ceil(cx + 14)); xx++) {
      const w = Math.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / s2); if (w < 0.01) continue;
      const o = yy * CW + xx; Fq[o] += w * q; Fw[o] += w;
    }
    used++; sl += q;
  }
  const w0 = 0.6, F = new Float32Array(CW * CH);
  for (let i = 0; i < F.length; i++) F[i] = Math.exp(Fq[i] / (Fw[i] + w0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (R[k] > 0) R[k] *= bil(F, x / C, y / C); }
  for (const a of add) for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
    const xx = a.x + i, yy = a.y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const d2 = i * i + j * j; if (d2 > 16) continue;
    const k = yy * W + xx, v = a.g * Math.exp(-d2 / (2 * 2.5 * 2.5)); if (v > R[k]) R[k] = v;
  }
  return { used, add: add.length, mf: used ? Math.round(Math.exp(sl / Math.max(1, used - add.length)) * 100) / 100 : 1 };
}

/* weiterschieben: τ = 0, 5 … 60 Minuten → Codes je Bild (0 = keine Daten, 1 = trocken) */
function fineFields(f) {
  const U = new Float32Array(WH), V = new Float32Array(WH), Gr = new Float32Array(WH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x, cx = x / C, cy = y / C; U[k] = bil(f.U, cx, cy) * C; V[k] = bil(f.V, cx, cy) * C; Gr[k] = bil(f.Gr, cx, cy); }
  return { U, V, Gr };
}
export function snExtrapolate(R, has, f) {
  const { U, V, Gr } = fineFields(f);
  const samp = (A, x, y) => {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return -1;
    const x0 = Math.min(W - 2, x | 0), y0 = Math.min(H - 2, y | 0), fx = x - x0, fy = y - y0, o = y0 * W + x0;
    return (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fy) + (A[o + W] * (1 - fx) + A[o + W + 1] * fx) * fy;
  };
  const out = [], T0 = 1200;
  for (let k = 0; k < SN_N; k++) {
    const tau = k * SN_STEP, te = T0 * (1 - Math.exp(-tau / T0)), sm = tau / 1200, lim = k ? 0.2 : 0.1, O = new Uint8Array(WH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, sx = x - U[i] * tau, sy = y - V[i] * tau;
      let v = samp(R, sx, sy);
      if (v < 0) { O[i] = 0; continue; }
      if (sm >= 0.5) { let s = v, n = 1; for (const [a, b] of [[sm, 0], [-sm, 0], [0, sm], [0, -sm]]) { const q = samp(R, sx + a, sy + b); if (q >= 0) { s += q; n++; } } v = s / n; }
      const hk = Math.round(sy) * W + Math.round(sx);
      if (!has[hk]) { O[i] = 0; continue; }
      if (v > 0 && tau) v *= Math.exp(Gr[i] * te);
      O[i] = v >= lim ? code(v) : 1;
    }
    out.push(O);
  }
  return out;
}

/* 20 Varianten: Zugrichtung (±11°), Geschwindigkeit (±15 %), Stärker-/Schwächerwerden (±35 % je Stunde) und ein großräumiges
   Zufallsfeld der Zugbahn (je etwa 150 km eine Abweichung, ±20 % der Zuggeschwindigkeit) werden je Variante leicht
   verändert. Ergebnis je Bild: in wie vielen Varianten es dort regnet (ab 0,2 mm/h), 0 bis 100 %. Zufall fest je Lauf
   (gleiche Eingabe, gleiches Ergebnis). */
export function snEnsemble(R, has, f, t0, N = 20) {
  const { U, V, Gr } = fineFields(f);
  let seed = (t0 | 0) % 2147483647 || 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let ms = 0, mn = 0;
  for (let i = 0; i < WH; i += 37) { ms += Math.hypot(U[i], V[i]); mn++; }
  ms = mn ? ms / mn : 0;
  const NX = 6, NY = 4, cnt = Array.from({ length: SN_N }, () => new Uint8Array(WH));
  const samp = (x, y) => {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return -1;
    const x0 = Math.min(W - 2, x | 0), y0 = Math.min(H - 2, y | 0), fx = x - x0, fy = y - y0, o = y0 * W + x0;
    return (R[o] * (1 - fx) + R[o + 1] * fx) * (1 - fy) + (R[o + W] * (1 - fx) + R[o + W + 1] * fx) * fy;
  };
  for (let m = 0; m < N; m++) {
    const th = Math.max(-0.4, Math.min(0.4, gauss() * 0.2)), sp = Math.max(0.6, Math.min(1.4, 1 + gauss() * 0.15)), gb = gauss() * (Math.log(1.35) / 3600);
    const cs = Math.cos(th) * sp, sn = Math.sin(th) * sp, NU = new Float32Array(NX * NY), NV = new Float32Array(NX * NY);
    for (let i = 0; i < NX * NY; i++) { NU[i] = gauss() * 0.2 * ms; NV[i] = gauss() * 0.2 * ms; }
    const nb = (A, x, y) => { const fx = (x / (W - 1)) * (NX - 1), fy = (y / (H - 1)) * (NY - 1), x0 = Math.min(NX - 2, fx | 0), y0 = Math.min(NY - 2, fy | 0), a = fx - x0, b = fy - y0, o = y0 * NX + x0;
      return (A[o] * (1 - a) + A[o + 1] * a) * (1 - b) + (A[o + NX] * (1 - a) + A[o + NX + 1] * a) * b; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = U[i] * cs - V[i] * sn + nb(NU, x, y), v = U[i] * sn + V[i] * cs + nb(NV, x, y), g = Gr[i] + gb;
      for (let k = 1; k < SN_N; k++) {
        const tau = k * SN_STEP, val = samp(x - u * tau, y - v * tau);
        if (val <= 0) continue;
        if (val * Math.exp(g * 1200 * (1 - Math.exp(-tau / 1200))) >= 0.2) cnt[k][i]++;
      }
    }
  }
  /* Bild 0 ist die Messung: dort 0 oder 100 % */
  const out = cnt.map((c, k) => { const o = new Uint8Array(WH); if (!k) { for (let i = 0; i < WH; i++) o[i] = R[i] >= 0.2 ? 100 : 0; } else for (let i = 0; i < WH; i++) o[i] = Math.round((c[i] * 100) / N); return o; });
  return out;
}
async function gz(parts, head) {
  const hb = new TextEncoder().encode(JSON.stringify(head)), out = new Uint8Array(4 + hb.length + parts.length * WH);
  new DataView(out.buffer).setUint32(0, hb.length);
  out.set(hb, 4);
  let o = 4 + hb.length;
  for (const p of parts) { out.set(p, o); o += WH; }
  return new Response(new Blob([out]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

/* Stationen (TAWES): Liste mit Lage (7 Tage gemerkt) und die neuesten 10-Minuten-Werte */
export async function tawesMeta(h, kv) {
  let meta = kv ? JSON.parse((await kv.get("rq:meta")) || "null") : null;
  if (!meta) {
    const m = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min/metadata", 20000)).json();
    meta = (m.stations || []).filter((x) => x.is_active !== false).map((x) => [x.id, x.name, +x.lat, +x.lon]);
    if (kv) await kv.put("rq:meta", JSON.stringify(meta), { expirationTtl: 7 * 86400 });
  }
  return meta;
}
async function tawesNow(h, kv) {
  const meta = await tawesMeta(h, kv), by = new Map(meta.map((m) => [String(m[0]), m]));
  const j = await (await h.tfetch("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=RR,TL&station_ids=" + meta.map((m) => m[0]).join(","), 20000)).json();
  const ts = (j.timestamps || []).map((t) => Date.parse(t) / 1000), out = [];
  for (const f of j.features || []) {
    const p = f.properties || {}, P = p.parameters || {}, m = by.get(String(p.station));
    if (!m) continue;
    const d = P.RR && P.RR.data, i = d ? d.length - 1 : -1;
    if (i < 0 || d[i] == null || !(ts[i] > Date.now() / 1000 - 40 * 60)) continue;
    const tl = P.TL && P.TL.data ? P.TL.data[i] : null;
    out.push({ la: m[2], lo: m[3], rr: +d[i] * 6, tl: tl == null ? null : +tl, t: ts[i] });
  }
  return out;
}

/* ein Durchgang: neues Messbild beim Europa-Radar? Dann rechnen und ablegen */
export async function snRun(env, h) {
  const kv = env.GM;
  if (!kv) return;
  const mp = await (await h.tfetch("https://api.librewxr.net/public/weather-maps.json", 10000)).json();
  const past = ((mp.radar && mp.radar.past) || []).slice().sort((a, b) => a.time - b.time);
  if (past.length < 2) return;
  const fb = past[past.length - 1], ix = JSON.parse((await kv.get("sn:idx")) || "null") || { l: [] };
  if (ix.t0 && fb.time <= ix.t0) return;
  /* Bild davor: möglichst 15 Minuten (mindestens 10) */
  let fa = null, bd = 1e9;
  for (const f of past) { const d = fb.time - f.time; if (d >= 600 && d <= 1800 && Math.abs(d - 900) < bd) { bd = Math.abs(d - 900); fa = f; } }
  if (!fa) return;
  const t0 = fb.time, dt = fb.time - fa.time;
  const [b, a] = await Promise.all([snDecode(h, mp.host + fb.path), snDecode(h, mp.host + fa.path)]);
  if (!b || !a) return;
  const gi = JSON.parse((await kv.get("gr:idx")) || "null"), bf = gi && gi.bf && gi.bf.f > 0 && t0 - gi.bf.t < 3 * 3600 ? gi.bf.f : 1;
  for (const R of [a.R, b.R]) for (let i = 0; i < WH; i++) R[i] *= bf;
  const st = { bf };
  /* Zugbahn vor den Korrekturen (gleiche Grundlage für beide Bilder) */
  let blocks = snMotion(a.R, b.R, dt);
  /* mit dem letzten Durchgang glätten (Wind ändert sich langsam): dessen Blöcke mit halbem Gewicht dazu */
  const old = JSON.parse((await kv.get("sn:mv")) || "null");
  if (old && t0 - old.t <= 1500 && Array.isArray(old.b)) blocks = blocks.concat(old.b.map((q) => ({ x: q[0], y: q[1], u: q[2], v: q[3], g: q[4], w: 0.5 })));
  st.blk = blocks.filter((q) => !q.w).length;
  const fld = snField(blocks);
  try { st.ltg = await snLightning(h, b.R); } catch (e) { st.ltg = -1; }
  try {
    const obs = await tawesNow(h, kv);
    /* Vergleich mit dem Messbild, das zur Mitte der 10 Minuten der Station am besten passt; was seither weitergezogen ist,
       wird mit der Zugbahn verschoben */
    const ts = obs.length ? obs.map((o) => o.t).sort((p, q) => p - q)[obs.length >> 1] - 300 : t0;
    const useB = Math.abs(ts - t0) <= Math.abs(ts - fa.time), tc = useB ? t0 : fa.time;
    const sh = (x, y, e) => [bil(fld.U, x / C, y / C) * C * e, bil(fld.V, x / C, y / C) * C * e];
    if (Math.abs(ts - tc) <= 600 && t0 - ts < 1800) Object.assign(st, snGauges(b.R, useB ? b.R : a.R, obs, sh, tc - ts, t0 - ts));
  } catch (e) { st.gerr = String((e && e.message) || e).slice(0, 60); }
  const fr = snExtrapolate(b.R, b.has, fld), t = fr.map((_, k) => t0 + k * SN_STEP);
  let n = 0;
  for (let i = 0; i < WH; i++) if (b.has[i]) n++;
  const buf = await gz([b.has, ...fr], { v: 1, t, base: t0, n, W, H, nV: fr.length, S: false, SM: 0, CC: 0, src: "sn" });
  await kv.put("gr:p:sn:" + t0, buf, { expirationTtl: 3 * 3600 });
  /* Wahrscheinlichkeit aus 20 Varianten (für „Nächste 2 Stunden“ und die Regen-Hinweise) */
  try {
    const t1 = Date.now(), P = snEnsemble(b.R, b.has, fld, t0);
    await kv.put("gr:p:snp:" + t0, await gz([b.has, ...P], { v: 1, t, base: t0, n, W, H, nV: P.length, S: false, SM: 0, CC: 0, src: "snp" }), { expirationTtl: 3 * 3600 });
    st.ens = 20; st.ems = Date.now() - t1;
  } catch (e) { st.eerr = String((e && e.message) || e).slice(0, 60); }
  const own = blocks.filter((q) => !q.w).map((q) => [q.x, q.y, +q.u.toFixed(6), +q.v.toFixed(6), +q.g.toExponential(3)]);
  await kv.put("sn:mv", JSON.stringify({ t: t0, b: own }), { expirationTtl: 3600 });
  const l = [...(ix.l || []), t0].filter((x) => x > t0 - 3 * 3600).slice(-40);
  await kv.put("sn:idx", JSON.stringify({ t0, at: Math.round(Date.now() / 1000), l, st }));
}

/* ============ Bewertung (selbstlernend) ============
   Bei jedem neuen Messbild von GeoSphere (INCA, mit Regenmessern, gilt als Wahrheit) werden die Vorhersagen verglichen,
   die für genau diese Zeit gemacht wurden: unsere Kurzvorhersage, die Radar-Vorhersage von GeoSphere und das Wettermodell.
   Maß: FSS (Fractions Skill Score) für „Regen ab 0,3 mm/h“ in Feldern von 5 x 5 km; 1 = perfekt, 0 = wertlos. Gemittelt über
   die letzten Wochen (gleitend), je Vorlauf. Die App gewichtet damit, wem sie wann mehr glaubt. */
const THR = code(0.3);
export function fss(F, T, has) {
  const B = 5;
  let num = 0, den = 0;
  for (let by = 0; by + B <= H; by += B) for (let bx = 0; bx + B <= W; bx += B) {
    let n = 0, nf = 0, no = 0;
    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) { const k = y * W + x; if (!has[k] || !F[k] || !T[k]) continue; n++; if (F[k] >= THR) nf++; if (T[k] >= THR) no++; }
    if (n < 10) continue;
    const ff = nf / n, fo = no / n;
    num += (ff - fo) ** 2; den += ff * ff + fo * fo;
  }
  return den >= 8 ? 1 - num / den : null;
}
export async function skRun(env, ref, d, ncBytes) {
  const kv = env.GM, T = d.V[0], has = d.has, sk = JSON.parse((await kv.get("sk:v")) || "null") || { sn: {}, gs: {}, gm: {} }, done = [];
  /* derselbe Lauf schon bewertet (zwei Durchgänge gleichzeitig): nicht doppelt zählen */
  const pubOf = () => { const pub = {}; for (const s of ["sn", "gs", "gm"]) { pub[s] = {}; for (const [L, e] of Object.entries(sk[s] || {})) if (e[1] >= 4) pub[s][L] = e[0]; } return pub; };
  if (sk.at >= ref) return pubOf();
  const upd = (src, L, x) => { if (x == null) return; const e = sk[src][L] || [0.5, 0]; const a = Math.max(0.03, 1 / (e[1] + 1)); e[0] = Math.round((e[0] + a * (x - e[0])) * 10000) / 10000; e[1] = Math.min(9999, e[1] + 1); sk[src][L] = e; done.push(src + L + ":" + x.toFixed(2)); };
  const sx = JSON.parse((await kv.get("sn:idx")) || "null");
  if (sx && sx.l) for (const L of [0, 15, 30, 45, 60]) {
    let best = null;
    for (const t0 of sx.l) { const lead = ref - t0; if (lead < 0 || lead > 3600 || lead % SN_STEP) continue; if (Math.abs(lead - L * 60) <= 300 && (!best || Math.abs(lead - L * 60) < Math.abs(ref - best - L * 60))) best = t0; }
    if (best == null) continue;
    try { const b = await kv.get("gr:p:sn:" + best, { type: "arrayBuffer" }); const u = b && (await unpackSrv(b)); if (u) upd("sn", L, fss(u.V[(ref - best) / SN_STEP], T, has)); } catch (e) {}
  }
  for (const L of [15, 30, 45, 60, 90, 120, 150, 180]) {
    try {
      const b = await kv.get("gr:p:rr:" + (ref - L * 60), { type: "arrayBuffer" });
      const u = b && (await unpackSrv(b));
      if (!u) continue;
      const k = u.t.findIndex((t) => Math.abs(t - ref) < 60);
      if (k >= 0) upd("gs", L, fss(u.V[k], T, has));
    } catch (e) {}
  }
  if (ref % 3600 === 0) {
    try {
      const gi = JSON.parse((await kv.get("gm:idx")) || "null");
      if (gi && gi.ref && ref > gi.ref && (gi.t || []).indexOf(ref) >= 0) {
        const nc = await ncBytes(kv, ["gm", String(gi.ref), String(ref)]);
        if (nc) { const m = convert(nc, "tp", null); upd("gm", Math.min(12, Math.round((ref - gi.ref) / 3600)) * 60, fss(m.V[0], T, has)); }
      }
    } catch (e) {}
  }
  sk.at = ref;
  await kv.put("sk:v", JSON.stringify(sk));
  console.log("Bewertung", ref, done.join(" "));
  /* für die App: nur Werte mit genug Vergleichen */
  return pubOf();
}

/* Gewicht unserer Kurzvorhersage gegen GeoSphere (0 bis 1) aus der Bewertung; ohne Bewertung Startwerte */
const SK0 = { sn: (L) => 0.82 - 0.005 * L, gs: (L) => 0.74 - 0.0022 * L, gm: (L) => 0.45 };
export function skAt(tab, src, L) {
  const ks = tab && tab[src] ? Object.keys(tab[src]).map(Number).sort((a, b) => a - b) : [];
  if (!ks.length) return SK0[src](L);
  if (L <= ks[0]) return tab[src][ks[0]];
  for (let i = 1; i < ks.length; i++) if (L <= ks[i]) { const f = (L - ks[i - 1]) / (ks[i] - ks[i - 1]); return tab[src][ks[i - 1]] * (1 - f) + tab[src][ks[i]] * f; }
  return tab[src][ks[ks.length - 1]];
}
export function snWeight(tab, leadSn, leadGs, t, t0) {
  const a = Math.max(0.05, skAt(tab, "sn", leadSn / 60)), b = Math.max(0.05, skAt(tab, "gs", leadGs / 60));
  const w = (a * a) / (a * a + b * b), end = Math.max(0, Math.min(1, (t0 + 3600 - t) / 1200));
  return w * end;
}

/* ============ Regenwahrscheinlichkeit am Ort (nächste 2 Stunden, alle 5 Minuten) ============
   Anteil der Zellen mit Regen (ab 0,2 mm/h) in einem Kreis um den Ort, der mit dem Vorlauf wächst (1,5 km + 0,12 km je
   Minute): so wird aus „genau hier ja oder nein“ eine ehrliche Wahrscheinlichkeit, weil der Ort einer Regenzelle mit
   der Zeit unsicherer wird. Unsere Kurzvorhersage und GeoSphere gemischt wie in der App. */
const cache = { sn: null, gs: null, t: null, sp: null };
async function getPk(kv, key, slot) {
  if (cache[slot] && cache[slot].key === key) return cache[slot].u;
  const b = await kv.get(key, { type: "arrayBuffer" });
  const u = b ? await unpackSrv(b) : null;
  cache[slot] = { key, u };
  return u;
}
const WET = code(0.2);
function around(Vk, has, x, y, km) {
  const r = Math.max(1, km / 1.08), r2 = r * r, ri = Math.ceil(r);
  let n = 0, w = 0, s = 0;
  for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
    if (i * i + j * j > r2) continue;
    const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const k = yy * W + xx, v = Vk[k]; if (!has[k] || !v) continue;
    n++; if (v >= WET) { w++; s += DEC[v]; }
  }
  if (n < 3) return null;
  const c = Vk[y * W + x];
  return { p: w / n, r: c >= WET ? DEC[c] : w ? s / w : 0 };
}
export async function ptServe(env, la, lo) {
  const kv = env.GM, [x, y] = cellOf(la, lo);
  if (x < 0 || y < 0 || x >= W || y >= H) return { ok: 0 };
  const [sx, gx, sk] = await Promise.all([kv.get("sn:idx"), kv.get("gr:idx"), kv.get("sk:v")]).then((a) => a.map((v) => JSON.parse(v || "null")));
  const now = Date.now() / 1000;
  const sn = sx && now - sx.t0 < 40 * 60 ? await getPk(kv, "gr:p:sn:" + sx.t0, "sn") : null;
  /* Wahrscheinlichkeit aus den 20 Varianten (wenn vorhanden): Mittel in einem kleinen Kreis um den Ort */
  let sp = null;
  try { sp = sn ? await getPk(kv, "gr:p:snp:" + sx.t0, "sp") : null; } catch (e) {}
  const pAround = (Pk, km) => { const r = Math.max(1, km / 1.08), ri = Math.ceil(r); let s2 = 0, n = 0; for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) { if (i * i + j * j > r * r) continue; const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const k = yy * W + xx; if (!sp.has[k]) continue; s2 += Pk[k]; n++; } return n ? s2 / n / 100 : null; };
  const gs = gx && gx.ref ? await getPk(kv, "gr:p:rr:" + gx.ref, "gs") : null;
  if (!sn && !gs) return { ok: 0 };
  const tab = {};
  if (sk) for (const s of ["sn", "gs"]) { tab[s] = {}; for (const [L, e] of Object.entries(sk[s] || {})) if (e[1] >= 4) tab[s][L] = e[0]; }
  const out = { ok: 1, t: [], p: [], r: [], t0: sn ? sx.t0 : null, ref: gs ? gx.ref : null, ens: sp ? 20 : 0 };
  /* Schnee oder Regen am Ort: Temperatur von GeoSphere (INCA, höchstens 1 °C = Schnee) */
  try { const tt = gx && gx.t2 ? await getPk(kv, "gr:p:t:" + gx.t2, "t") : null; if (tt && tt.S) out.s = tt.S[y * W + x] ? 1 : 0; } catch (e) {}
  const rad = (lead) => 1.5 + 0.12 * Math.max(0, lead) / 60;
  const gsAt = (t) => {
    if (!gs) return null;
    let k = -1;
    for (let i = 0; i < gs.t.length - 1; i++) if (gs.t[i] <= t && gs.t[i + 1] >= t) { k = i; break; }
    if (k < 0) return null;
    const f = (t - gs.t[k]) / (gs.t[k + 1] - gs.t[k]), A = around(gs.V[k], gs.has, x, y, rad(gs.t[k] - gx.ref)), B = around(gs.V[k + 1], gs.has, x, y, rad(gs.t[k + 1] - gx.ref));
    if (!A || !B) return A || B;
    return { p: A.p * (1 - f) + B.p * f, r: A.r * (1 - f) + B.r * f };
  };
  for (let t = Math.ceil(now / 300) * 300; t <= now + 7200; t += 300) {
    let s = null;
    if (sn && t >= sx.t0 && t <= sx.t0 + 3600) {
      const k = Math.round((t - sx.t0) / SN_STEP);
      s = around(sn.V[k], sn.has, x, y, rad(t - sx.t0));
      const pe = sp && sp.V[k] ? pAround(sp.V[k], 1.5 + 0.04 * (t - sx.t0) / 60) : null;
      if (s && pe != null) s = { p: pe, r: s.r };
    }
    const g = gsAt(t);
    let v = null;
    if (s && g) { const w = snWeight(tab, t - sx.t0, t - gx.ref, t, sx.t0); v = { p: w * s.p + (1 - w) * g.p, r: w * s.r + (1 - w) * g.r }; }
    else v = s || g;
    if (!v) continue;
    out.t.push(t); out.p.push(Math.round(v.p * 100) / 100); out.r.push(Math.round(v.r * 100) / 100);
  }
  return out;
}
