/* ============ Ortsnamen für die Karte (eigene Beschriftung statt fertiger Kartenbilder) ============
   Quellen (frei nutzbar):
   - GeoNames über das Paket „all-the-cities“ (alle Orte ab etwa 1000 Einwohnern weltweit, CC BY 4.0)
   - Natural Earth „populated places“ (gut 7000 wichtige Orte, mit deutschen Namen und der Zoomstufe, ab der ein Ort
     auf Karten üblicherweise beschriftet wird)
   Einmal aufbereitet und im KV-Speicher abgelegt (Schlüssel pl:v1:…), danach nur noch ausgeliefert:
   - pl:v1:w   = Übersicht (Natural Earth): [Name, Breite, Länge, ab Zoom, Einwohner, …]
   - pl:v1:<c> = alle Orte in einem 10°-Feld c (c = Zeile*36 + Spalte): [Name, Breite, Länge, Einwohner, …], nach Größe sortiert
   Deutsche Namen: wo Natural Earth einen deutschen Namen hat (Wien, München, Budweis …), wird der Ort damit beschriftet. */
const PBF = "https://cdn.jsdelivr.net/npm/all-the-cities@3.1.0/cities.pbf";
const NE = "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_populated_places.geojson";
const V = "pl:v1:";
export const plCell = (la, lo) => Math.min(17, Math.max(0, Math.floor((la + 90) / 10))) * 36 + Math.min(35, Math.max(0, Math.floor((lo + 180) / 10)));

function decodeCities(b) {
  let p = 0, lo = 0, la = 0;
  const td = new TextDecoder(), out = [];
  const vi = () => { let r = 0, s = 1, c; do { c = b[p++]; r += (c & 127) * s; s *= 128; } while (c & 128); return r; };
  const sv = () => { const v = vi(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  while (p < b.length) {
    const end = vi() + p, c = { n: "", p: 0, la: 0, lo: 0 };
    while (p < end) {
      const k = vi(), tag = Math.floor(k / 8), w = k & 7;
      if (w === 2) { const l = vi(); if (tag === 2) c.n = td.decode(b.subarray(p, p + l)); p += l; }
      else if (w === 0) { if (tag === 9) c.p = vi(); else if (tag === 10) { lo += sv(); c.lo = lo / 1e5; } else if (tag === 11) { la += sv(); c.la = la / 1e5; } else vi(); }
      else throw new Error("pbf " + w);
    }
    if (c.n) out.push(c);
  }
  return out;
}

/* Natural Earth ohne komplettes JSON-Einlesen (die Datei ist groß): jeden Ort mit regulären Ausdrücken herausziehen */
function parseNE(t) {
  const out = [], g = (s, k) => { const m = new RegExp('"' + k + '":\\s*("(?:[^"\\\\]|\\\\.)*"|-?[\\d.]+|null)').exec(s); return m ? JSON.parse(m[1]) : null; };
  let i = t.indexOf('"SCALERANK"');
  while (i >= 0) {
    const j = t.indexOf('"SCALERANK"', i + 10), s = t.slice(i, j < 0 ? t.length : j);
    const la = g(s, "LATITUDE"), lo = g(s, "LONGITUDE");
    if (la != null && lo != null) out.push({ n: g(s, "NAME_DE") || g(s, "NAME") || "", en: g(s, "NAME") || "", la, lo, z: g(s, "MIN_ZOOM") || 6, p: g(s, "POP_MAX") || 0, cap: /capital/i.test(g(s, "FEATURECLA") || "") ? 1 : 0 });
    i = j;
  }
  return out.filter((x) => x.n);
}

let building = null;
async function plBuild(env) {
  const [rb, rn] = await Promise.all([fetch(PBF), fetch(NE)]);
  if (!rb.ok || !rn.ok) throw new Error("Ortsdaten " + rb.status + "/" + rn.status);
  const C = decodeCities(new Uint8Array(await rb.arrayBuffer())), N = parseNE(await rn.text());
  /* Natural-Earth-Orte den GeoNames-Orten zuordnen (gleicher Name oder nächster großer Ort bis 8 km) → deutscher Name */
  const grid = new Map(), gk = (la, lo) => Math.floor(la * 5) + ":" + Math.floor(lo * 5);
  C.forEach((c, i) => { const k = gk(c.la, c.lo); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const used = new Set();
  for (const x of N) {
    let best = -1, bs = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of grid.get(Math.floor(x.la * 5) + a + ":" + (Math.floor(x.lo * 5) + b)) || []) {
      const c = C[i], d = Math.hypot(c.la - x.la, (c.lo - x.lo) * Math.cos((x.la * Math.PI) / 180)) * 111;
      if (d > 8) continue;
      const s = (c.n === x.en || c.n === x.n ? 0 : 5) + d - Math.log10(c.p + 10);
      if (s < bs) { bs = s; best = i; }
    }
    if (best >= 0) { C[best].n = x.n; C[best].p = Math.max(C[best].p, x.p); used.add(best); }
    else C.push({ n: x.n, la: x.la, lo: x.lo, p: x.p });
  }
  const cells = new Map();
  for (const c of C) { const k = plCell(c.la, c.lo); (cells.get(k) || cells.set(k, []).get(k)).push(c); }
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const w = [];
  N.sort((a, b) => a.z - b.z || b.p - a.p).forEach((x) => w.push(x.n, r4(x.la), r4(x.lo), Math.round(x.z * 10) / 10, x.p, x.cap));
  const puts = [env.GM.put(V + "w", JSON.stringify(w))];
  for (const [k, L] of cells) {
    L.sort((a, b) => b.p - a.p);
    const a = [];
    L.forEach((c) => a.push(c.n, r4(c.la), r4(c.lo), c.p));
    puts.push(env.GM.put(V + k, JSON.stringify(a)));
  }
  puts.push(env.GM.put(V + "ok", String(Date.now())));
  /* in Gruppen schreiben (nicht alles gleichzeitig) */
  for (let i = 0; i < puts.length; i += 50) await Promise.all(puts.slice(i, i + 50));
  console.log("Ortsnamen aufbereitet:", C.length, "Orte,", cells.size, "Felder,", N.length, "Übersicht");
}

/* vom Cron aus: einmal aufbereiten, falls noch nicht geschehen */
export async function plEnsure(env) {
  if (!env.GM || (await env.GM.get(V + "ok"))) return;
  building = building || plBuild(env).finally(() => { building = null; });
  await building;
}

export async function plServe(env, url) {
  const c = String(url.searchParams.get("c") || "");
  if (!(c === "w" || (/^\d{1,3}$/.test(c) && +c < 648))) return new Response('{"error":"Ungültig"}', { status: 400 });
  const kv = env.GM;
  if (!(await kv.get(V + "ok"))) {
    building = building || plBuild(env).finally(() => { building = null; });
    await building;
  }
  const v = (await kv.get(V + c)) || "[]";
  return new Response(v, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=604800" } });
}
