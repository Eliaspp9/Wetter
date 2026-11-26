/* Die Wetter-App bei Cloudflare (Worker "wetter", https://wetter.elias-ziegler.workers.dev).
   - Liefert die Dateien der App aus (ASSETS) und hängt Sicherheitsregeln an jede Antwort.
   - /api/… reicht er an den Worker wetter-proxy weiter (Service Binding PROXY): App und Worker unter EINER Adresse, so muss das
     Handy nicht vor jeder Anfrage erst nachfragen, ob es darf (keine CORS-Vorabanfragen).
   - Die App selbst (index.html) bekommt nur, wer angemeldet ist: Dafür setzt er bei Anmeldung und Verlängerung ein Cookie
     (HttpOnly, nur für diese Seite). Ohne gültiges Cookie kommt login.html. Geprüft wird das Token beim wetter-proxy (/auth). */
import { packed, convert } from "./pack.js";
import { snRun, skRun, ptServe } from "./nowcast.js";
import { bfKI } from "./ki.js";
const COOKIE = "wt";
const PAGE = new Set(["/", "/index.html"]);
const SEC = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  "Strict-Transport-Security": "max-age=31536000",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
function secure(res, extra) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC)) if (!(k === "Content-Security-Policy" && r.headers.has(k))) r.headers.set(k, v);
  if (extra) for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
  return r;
}
function getCookie(req, name) {
  const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]+)").exec(req.headers.get("Cookie") || "");
  return m ? m[1] : "";
}
const setCookie = (tok, days) => COOKIE + "=" + tok + "; Path=/; Max-Age=" + Math.round(days * 86400) + "; HttpOnly; Secure; SameSite=Strict";
const clearCookie = () => COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
/* geprüfte Tokens kurz merken (spart die Rückfrage beim wetter-proxy) */
const ok = new Map();
async function valid(env, tok) {
  if (!tok || tok.length > 2000 || !/^[\w.-]+$/.test(tok)) return false;
  const t = ok.get(tok);
  if (t && t > Date.now()) return true;
  try {
    const r = await env.PROXY.fetch(new Request("https://wetter-proxy/auth", { headers: { Authorization: "Bearer " + tok } }));
    if (!r.ok) return false;
    if (ok.size > 200) ok.clear();
    ok.set(tok, Date.now() + 10 * 60000);
    return true;
  } catch (e) { return false; }
}
async function api(req, env, url) {
  const path = url.pathname.slice(4) || "/";
  if (path === "/logout") return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
  /* angemeldetes Gerät ohne Cookie (vor dem Umbau angemeldet): Token gegen Cookie tauschen */
  if (path === "/session" && req.method === "POST") {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await valid(env, tok))) return new Response(JSON.stringify({ error: "Nicht angemeldet" }), { status: 401, headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie() } });
    return new Response(null, { status: 204, headers: { "Set-Cookie": setCookie(tok, 30), "Cache-Control": "no-store" } });
  }
  const h = new Headers(req.headers);
  h.delete("Cookie");
  const res = await env.PROXY.fetch(new Request("https://wetter-proxy" + path + url.search, { method: req.method, headers: h, body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(), redirect: "manual" }));
  /* Anmeldung oder Verlängerung: neues Token auch als Cookie */
  if ((path === "/login" || path === "/renew") && res.ok) {
    const txt = await res.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (e) {}
    const out = new Response(txt, res);
    if (j && typeof j.token === "string") out.headers.append("Set-Cookie", setCookie(j.token, +j.days || 30));
    return out;
  }
  return res;
}
/* Wettermodell von GeoSphere (1 km) für das Regenradar, vorab geholt und zwischengespeichert.
   GeoSphere braucht für ein einzelnes Modellbild oft 30 bis 60 Sekunden, mehrere Bilder auf einmal brechen ab (gemessen am
   12.11.2026). Darum holt dieser Worker alle 10 Minuten im Hintergrund die fehlenden Bilder (stündlich bis 12 Stunden,
   danach alle 3 Stunden bis 2 Tage) und legt sie im KV-Speicher ab (gm:…, 26 Stunden). Die App lädt sie dann in Sekunden:
   /gm = Liste {ref, t}, /gm/<ref>/<t> = ein Bild als NetCDF (offene Daten von GeoSphere, keine Anmeldung nötig). */
const GM_URL = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km",
  GM_Q = "?parameters=tp,sf,tcc&output_format=netcdf&bbox=45.50,8.10,49.48,17.74";
const isoM = (t) => new Date(t * 1000).toISOString().slice(0, 16);
async function tfetch(u, ms) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
  try { return await fetch(u, { signal: ac.signal }); } finally { clearTimeout(tm); }
}
function gmWanted(ref, now) {
  const end = Math.min(ref + 60 * 3600, now + 48 * 3600), out = [];
  /* ab der Stunde vor jetzt: die Bewölkung (tcc) braucht die App auch für das Radar von jetzt (graue Wolken) */
  for (let t = Math.floor(now / 3600) * 3600 - 3600; t <= end; t += 3600) {
    if (t <= ref) continue;
    if (t > now + 12 * 3600 && t % 10800) continue;
    out.push(t);
  }
  return out;
}
async function gmRun(env) {
  const kv = env.GM, t0 = Date.now(), now = t0 / 1000;
  if (!kv) return;
  /* KV erlaubt nur wenige Schreibvorgänge am Tag: geschrieben wird nur, wenn ein Bild dazukommt (höchstens 9 Minuten,
     damit sich zwei Läufe nicht überschneiden) */
  {
    let ref;
    try { const r = await tfetch(GM_URL + "/metadata", 20000), j = await r.json(); ref = Date.parse(j.last_forecast_reftime) / 1000; } catch (e) { return; }
    if (!ref) return;
    const ix = JSON.parse((await kv.get("gm:idx")) || "null") || { ref: 0, t: [] };
    const nx = ref > ix.ref ? JSON.parse((await kv.get("gm:nx")) || "null") || { ref, t: [] } : ix;
    if (nx.ref !== ref) { nx.ref = ref; nx.t = []; }
    /* Selbstheilung: jedes gespeicherte Bild prüfen (muss als NetCDF/HDF5 beginnen und ganz im Paket liegen). Ein
       kaputtes oder fehlendes fliegt aus dem Verzeichnis und wird in diesem Durchgang gleich neu geholt. */
    const bk = {};
    const chk = async (o) => {
      let c = 0;
      for (const [t, e] of Object.entries(o.p || {})) {
        if (!(e[0] in bk)) { try { bk[e[0]] = await kv.get(e[0], { type: "arrayBuffer" }); } catch (x) { bk[e[0]] = undefined; } }
        const all = bk[e[0]];
        if (all === undefined) continue;
        let ok = !!all && all.byteLength >= e[1] + e[2];
        if (ok) { const h = new Uint8Array(all, e[1], 4); ok = h[0] === 0x89 && h[1] === 0x48 && h[2] === 0x44 && h[3] === 0x46; }
        if (!ok) { delete o.p[t]; o.t = o.t.filter((x) => x !== +t); c++; }
      }
      return c;
    };
    const fixed = await chk(nx);
    /* läuft gerade ein neuer Modelllauf an, wird der alte noch gezeigt: auch den prüfen (kaputte Bilder nur entfernen) */
    if (nx !== ix && (await chk(ix))) await kv.put("gm:idx", JSON.stringify(ix));
    {
      if (fixed) console.warn("gm: " + fixed + " kaputte Bilder entfernt, werden neu geholt");
    }
    const want = gmWanted(ref, now), have = new Set(nx.t), got = [];
    let n = 0;
    for (const t of want) {
      if (have.has(t)) continue;
      if (Date.now() - t0 > 7 * 60000 || n >= (fixed ? 12 : 6)) break;
      try {
        const r = await tfetch(GM_URL + GM_Q + "&start=" + isoM(t) + "&end=" + isoM(t), 110000);
        if (!r.ok) { if (r.status === 429) break; continue; }
        const b = await r.arrayBuffer();
        if (b.byteLength < 2000) continue;
        got.push([t, b]);
        have.add(t); n++;
      } catch (e) { break; }
    }
    if (!n) { if (fixed) await kv.put(nx === ix ? "gm:idx" : "gm:nx", JSON.stringify(nx)); return; }
    /* alle neuen Bilder dieses Durchgangs in EINEM Eintrag (spart Schreibvorgänge): gm:b:<ref>:<erste Zeit>,
       wo welches Bild liegt, steht in nx.p[t] = [Schlüssel, Anfang, Länge] */
    {
      /* eindeutiger Name (mit Zeitpunkt des Holens): ein Bild, das später noch einmal geholt wird, darf kein älteres
         Paket mit anderen Bildern überschreiben */
      const key = "gm:b:" + ref + ":" + got[0][0] + ":" + Math.floor(now), tot = got.reduce((a, x) => a + x[1].byteLength, 0), all = new Uint8Array(tot);
      let o = 0;
      nx.p = nx.p || {};
      for (const [t, b] of got) { all.set(new Uint8Array(b), o); nx.p[t] = [key, o, b.byteLength]; o += b.byteLength; }
      await kv.put(key, all, { expirationTtl: 26 * 3600 });
    }
    /* so lange behalten, wie gmWanted die Stunde noch will (ab der Stunde vor jetzt), sonst würde sie neu geholt */
    nx.t = [...have].filter((t) => t >= Math.floor(now / 3600) * 3600 - 3600).sort((a, b) => a - b);
    for (const k of Object.keys(nx.p || {})) if (!nx.t.includes(+k)) delete nx.p[k];
    if (nx === ix) await kv.put("gm:idx", JSON.stringify(nx));
    else {
      /* neuer Modelllauf: erst zeigen, wenn die nächsten 12 Stunden da sind; bis dahin bleibt der alte */
      const first = want.filter((t) => t <= now + 12 * 3600);
      if (first.every((t) => have.has(t)) || !ix.ref || ix.ref < ref - 9 * 3600) { await kv.put("gm:idx", JSON.stringify(nx)); await kv.delete("gm:nx"); }
      else await kv.put("gm:nx", JSON.stringify(nx));
    }
  }
}
/* Radar Österreich (INCA-Nowcast von GeoSphere), ebenso vorab geholt: jede Minute wird nachgesehen, ob es einen neuen
   Lauf gibt (alle 15 Minuten). Dann werden geholt und abgelegt (3 Stunden):
   - gr:rr:<ref> ganz Österreich, Messbild und 3 Stunden Vorhersage (etwa 1 MB)
   - gr:a:<ref>  nur das Messbild (für den Rückblick der App)
   - gr:t:<ref>  Temperatur für Schnee oder Regen (einmal pro Stunde)
   gr:idx sagt der App, was da ist. So lädt die App in Sekunden, auch wenn GeoSphere gerade sehr langsam ist,
   und sieht notfalls den letzten Stand. Geschrieben wird nur bei einem neuen Lauf (KV erlaubt wenige Schreibvorgänge). */
const GR_URL = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km",
  GR_BB = "&output_format=netcdf&bbox=45.50,8.10,49.48,17.74";
async function grGet(u, ms) {
  const r = await tfetch(u, ms);
  if (!r.ok) throw new Error(String(r.status));
  const b = await r.arrayBuffer();
  if (b.byteLength < 2000) throw new Error("leer");
  return b;
}
async function grRun(env) {
  const kv = env.GM;
  if (!kv) return;
  /* jede Minute aufgerufen: bei GeoSphere nur nachfragen, wenn ein neuer Lauf da sein kann (frühestens 16 Minuten nach
     seiner Startzeit, ein Lauf alle 15 Minuten), das schont das Limit von GeoSphere (240 Abfragen pro Stunde) */
  const ix = JSON.parse((await kv.get("gr:idx")) || "null") || { ref: 0, a: [], t2: 0 };
  if (ix.ref && Date.now() / 1000 < ix.ref + 900 + 16 * 60) return;
  let ref;
  try { const r = await tfetch(GR_URL + "/metadata?t=" + Math.floor(Date.now() / 60000), 50000), j = await r.json(); ref = Date.parse(j.last_forecast_reftime) / 1000; } catch (e) { return; }
  if (!ref) return;
  if (ref <= ix.ref) return;
  const opt = { expirationTtl: 3 * 3600 }, q = "&start=" + isoM(ref);
  const rr = await grGet(GR_URL + "?parameters=rr" + GR_BB + q, 150000);
  await kv.put("gr:rr:" + ref, rr, opt);
  /* gleich fertig für die App aufbereiten (siehe site/pack.js) */
  const pk = async (k, b, f, ttl) => { try { await kv.put("gr:p:" + k + ":" + ref, await packed(b, k === "t" ? "t2m" : "rr", f), { expirationTtl: ttl }); } catch (e) { console.error("pack", k, e && e.message); } };
  await pk("rr", rr, ref + 60, 3 * 3600);
  let a = null, t2 = null;
  try { a = await grGet(GR_URL + "?parameters=rr" + GR_BB + q + "&end=" + isoM(ref), 90000); await kv.put("gr:a:" + ref, a, { expirationTtl: 25 * 3600 }); await pk("a", a, ref + 60, 25 * 3600); } catch (e) {}
  if (ref - (ix.t2 || 0) >= 3300) { try { t2 = await grGet(GR_URL + "?parameters=t2m" + GR_BB + q + "&end=" + isoM(ref), 90000); await kv.put("gr:t:" + ref, t2, opt); await pk("t", t2, null, 3 * 3600); } catch (e) {} }
  const now = Date.now() / 1000;
  /* Europa-Radar an GeoSphere angleichen (siehe grBias); geglättet über die letzten Läufe */
  let bf = ix.bf || null, dA = null, sk = ix.sk || null;
  try { dA = convert(a || rr, "rr", ref + 60); } catch (e) { console.error("convert", e && e.message); }
  try { const b = dA && (await grBias(dA, ref)); if (b) { const f0 = bf && bf.f ? bf.f : 1, f = Math.exp(0.5 * Math.log(f0) + 0.5 * Math.log(b.f)); bf = { f: Math.round(Math.min(2.5, Math.max(0.4, f)) * 1000) / 1000, raw: b.f, n: b.n, t: ref }; } } catch (e) { console.error("bias", e && e.message); }
  /* Bewertung der Vorhersagen gegen dieses Messbild (selbstlernend, siehe site/nowcast.js) */
  try { if (dA) sk = await skRun(env, ref, dA, ncBytes); } catch (e) { console.error("Bewertung", e && e.message); }
  await kv.put("gr:idx", JSON.stringify({ ref, at: Math.round(now), a: [...(ix.a || []), ...(a ? [ref] : [])].filter((t) => t > now - 24.6 * 3600).slice(-100), t2: t2 ? ref : ix.t2 || 0, bf, sk }));
}
/* ============ Europa-Radar an GeoSphere angleichen ============
   Das Europa-Radar (LibreWXR, OPERA) schätzt die Regenmenge nur aus dem Radarecho; GeoSphere (INCA) rechnet die
   Regenmesser mit ein. Zum Zeitpunkt der GeoSphere-Messung wird das Europa-Bild (Zoom 7, 512er-Kacheln, Grauwert = dBZ + 32)
   an jeder 1-km-Zelle abgelesen und verglichen, wo beide Regen sehen (ab 0,2 mm/h): f = Summe GeoSphere / Summe Europa.
   Mindestens 300 solche Zellen, sonst kein Ergebnis. Die App multipliziert das Europa-Radar in „Österreich“ mit f. */
const AT_BOX_W = [45.5, 8.1, 49.48, 17.74], AT_CS_W = 1.08 / (111.32 * Math.cos((47.5 * Math.PI) / 180)), RC_MIN_W = 0.03, RC_L_W = Math.log(200 / RC_MIN_W);
const mercW = (la) => (Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) * 180) / Math.PI;
const zRainW = (z) => Math.pow(Math.pow(10, z / 10) / 200, 0.625);
async function grBias(d, ref) {
  const mp = await (await tfetch("https://api.librewxr.net/public/weather-maps.json", 10000)).json();
  const past = (mp.radar && mp.radar.past) || [];
  let fr = null, bd = 1e9;
  for (const f of past) { const d = Math.abs(f.time - ref); if (d < bd) { bd = d; fr = f; } }
  if (!fr || bd > 300) return null;
  const V = d.V[0];
  const z = 7, n = 128, tile = {};
  const yT = mercW(AT_BOX_W[2]);
  const get = async (tx, ty) => {
    const k = tx + "_" + ty;
    if (!(k in tile)) { try { const r = await tfetch(mp.host + fr.path + "/512/" + z + "/" + tx + "/" + ty + "/0/1_0.png", 12000); tile[k] = r.ok ? await pngRGBA(await r.arrayBuffer()) : null; } catch (e) { tile[k] = null; } }
    return tile[k];
  };
  let sg = 0, se = 0, cnt = 0;
  for (let y = 0; y < d.H; y += 2) for (let x = 0; x < d.W; x += 2) {
    const o = y * d.W + x;
    if (!d.has[o]) continue;
    const c = V[o], g = c >= 2 ? RC_MIN_W * Math.exp(((c - 2) / 253) * RC_L_W) : 0;
    const lo = AT_BOX_W[1] + (x + 0.5) * AT_CS_W, my = yT - (y + 0.5) * AT_CS_W;
    const fx = ((lo + 180) / 360) * n, fy = ((180 - my) / 360) * n, tx = Math.floor(fx), ty = Math.floor(fy);
    const t = await get(tx, ty);
    if (!t) continue;
    const px = Math.min(t.W - 1, Math.floor((fx - tx) * t.W)), py = Math.min(t.H - 1, Math.floor((fy - ty) * t.H)), j = (py * t.W + px) * 4;
    const R = t.d[j], G = t.d[j + 1], B = t.d[j + 2], A = t.d[j + 3];
    const e = A > 90 && R === G && G === B && R - 32 >= 5 ? zRainW(R - 32) : 0;
    if (g >= 0.2 && e >= 0.2) { sg += g; se += e; cnt++; }
  }
  if (cnt < 300 || se <= 0) return null;
  return { f: sg / se, n: cnt };
}
/* die NetCDF-Datei eines Bildes aus dem KV-Speicher: m = ["gm", ref, t] oder ["rr"|"a"|"t", ref] */
async function ncBytes(kv, m) {
  if (m[0] === "gm") {
    /* gebündelt (siehe gmRun), sonst der alte Einzeleintrag */
    for (const ik of ["gm:idx", "gm:nx"]) {
      const ix = JSON.parse((await kv.get(ik)) || "null"), e = ix && String(ix.ref) === m[1] && ix.p && ix.p[m[2]];
      if (!e) continue;
      const all = await kv.get(e[0], { type: "arrayBuffer" });
      /* nur ein echtes NetCDF/HDF5-Bild ausliefern (beginnt mit \x89HDF); sonst nichts, dann holt die App es bei GeoSphere */
      if (all && all.byteLength >= e[1] + e[2]) { const h = new Uint8Array(all, e[1], 4); if (h[0] === 0x89 && h[1] === 0x48 && h[2] === 0x44 && h[3] === 0x46) return all.slice(e[1], e[1] + e[2]); return null; }
    }
    return kv.get("gm:" + m[1] + ":" + m[2], { type: "arrayBuffer" });
  }
  return kv.get("gr:" + m[0] + ":" + m[1], { type: "arrayBuffer" });
}
const NC_HDR = { "Content-Type": "application/x-netcdf", "Cache-Control": "private, max-age=86400, immutable" },
  PK_HDR = { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400, immutable" };
async function gmServe(env, url) {
  const kv = env.GM;
  if (!kv) return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
  /* Regenwahrscheinlichkeit am Ort (eigene Kurzvorhersage und GeoSphere, siehe site/nowcast.js) */
  if (url.pathname === "/gr/pt") {
    const la = +url.searchParams.get("la"), lo = +url.searchParams.get("lo");
    let o = { ok: 0 };
    if (isFinite(la) && isFinite(lo)) try { o = await ptServe(env, la, lo); } catch (e) { o = { ok: 0, err: String((e && e.message) || e).slice(0, 80) }; }
    return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/gr") {
    /* dazu der Stand unserer Kurzvorhersage */
    const [ix, sx] = await Promise.all([kv.get("gr:idx"), kv.get("sn:idx")]);
    const j = JSON.parse(ix || "{}"), s = JSON.parse(sx || "null");
    if (s && s.t0) j.sn = { t0: s.t0, st: s.st };
    return new Response(JSON.stringify(j), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/gm") {
    const ix = (await kv.get(url.pathname.slice(1) + ":idx")) || "{}";
    return new Response(ix, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const P = url.pathname, m = P.match(/^\/gm\/(?:p\/)?(\d{9,11})\/(\d{9,11})$/), g = P.match(/^\/gr\/(?:p\/)?(rr|a|t|sn)\/(\d{9,11})$/);
  if (!m && !g) return new Response("Nicht gefunden", { status: 404 });
  const key = m ? ["gm", m[1], m[2]] : [g[1], g[2]];
  /* fertig aufbereitet für die App (siehe site/pack.js): Radar schon beim Holen vorbereitet, sonst jetzt und dann im
     Zwischenspeicher von Cloudflare (1 Tag) */
  if (P.includes("/p/")) {
    if (g) { const b = await kv.get("gr:p:" + g[1] + ":" + g[2], { type: "arrayBuffer" }); if (b) return new Response(b, { headers: PK_HDR }); }
    const ck = new Request(url.origin + P), cache = caches.default;
    const hit = await cache.match(ck);
    if (hit) return hit;
    const nc = await ncBytes(kv, key);
    if (!nc) return new Response("Nicht gefunden", { status: 404 });
    let pb;
    try { pb = await packed(nc, m ? "tp" : g[1] === "t" ? "t2m" : "rr", m ? null : +g[2] + 60); } catch (e) { console.error("pack", P, e && e.message); return new Response("Nicht lesbar", { status: 404 }); }
    const out = new Response(pb, { headers: PK_HDR });
    try { await cache.put(ck, out.clone()); } catch (e) {}
    return out;
  }
  const b = await ncBytes(kv, key);
  if (!b) return new Response("Nicht gefunden", { status: 404 });
  return new Response(b, { headers: NC_HDR });
}
/* ============ Alle Daten der App in einem Paket (/pre) ============
   Beim Start schickt die App die Liste der Abfragen, die sie für den Ort beim letzten Mal gebraucht hat (Open-Meteo,
   GeoSphere, Warnungen, DWD …), und bekommt alle Antworten in einer einzigen Antwort zurück:
   - Open-Meteo aus dem Zwischenspeicher om: (vorgerechnet, siehe omServe),
   - die anderen Dienste aus dem Zwischenspeicher pc: im KV, den der Server alle 5 Minuten für alles erneuert, was in den
     letzten 6 Stunden gebraucht wurde (pc:hot). Antwortet ein Dienst nicht, der letzte Stand (bis 2 Stunden).
   Was nicht im Paket ist (z. B. Abfragen mit Anmeldung), holt die App wie bisher selbst. */
const PC_HOSTS = /^(dataset\.api\.hub\.geosphere\.at|warnungen\.zamg\.at|api\.brightsky\.dev|aviationweather\.gov)$/;
const PC_NO = /[?&](date|last_date|start|end)=|\/metadata|grid\/forecast|historical\//;
const pcTtl = (u) => (/nowcast|station\/current|warn|alerts|current_weather/.test(u) ? 300 : /timeseries\/forecast/.test(u) ? 900 : 600);
async function pcFetch(env, u, h) {
  const r = await tfetch(u, 12000);
  if (!r.ok) return { s: r.status };
  const b = await r.text(), ct = r.headers.get("Content-Type") || "application/json";
  if (env.GM && b.length < 5e6) { try { await env.GM.put("pc:" + h, b, { expirationTtl: 2 * 3600, metadata: { at: Math.round(Date.now() / 1000), ct } }); } catch (e) {} }
  return { s: 200, b, ct };
}
async function pcGet(env, u) {
  const h = await sha(u), now = Date.now() / 1000, ttl = pcTtl(u);
  let old = null;
  try { old = await env.GM.getWithMetadata("pc:" + h, { type: "text" }); } catch (e) {}
  const age = old && old.value != null && old.metadata ? now - old.metadata.at : Infinity;
  try {
    const hot = JSON.parse((await env.GM.get("pc:hot")) || "{}"), e = hot[h];
    if (!e || now - e.used > 3 * 3600) { hot[h] = { u, used: Math.round(now) }; for (const k of Object.keys(hot)) if (now - hot[k].used > 86400) delete hot[k]; await env.GM.put("pc:hot", JSON.stringify(hot)); }
  } catch (e) {}
  if (age < ttl) return { s: 200, b: old.value, ct: old.metadata.ct };
  try { const x = await pcFetch(env, u, h); if (x.s === 200) return x; } catch (e) {}
  if (age < 7200) return { s: 200, b: old.value, ct: old.metadata.ct };
  return null;
}
async function pcPrewarm(env) {
  if (!env.GM) return;
  const hot = JSON.parse((await env.GM.get("pc:hot")) || "{}"), now = Date.now() / 1000;
  let n = 0;
  for (const [h, e] of Object.entries(hot)) {
    if (now - e.used > 6 * 3600 || n >= 30) continue;
    const m = await env.GM.getWithMetadata("pc:" + h, { type: "stream" });
    try { if (m.value) await m.value.cancel(); } catch (x) {}
    if (m.metadata && now - m.metadata.at < pcTtl(e.u) - 90) continue;
    n++;
    try { await pcFetch(env, e.u, h); } catch (x) {}
  }
}
async function preServe(req, env) {
  if (req.method !== "POST") return new Response("Nur POST", { status: 405 });
  if (!(await valid(env, getCookie(req, COOKIE)))) return bfJson({ error: "Nicht angemeldet" }, 401);
  let L = [];
  try { const j = await req.json(); L = (Array.isArray(j.u) ? j.u : []).filter((u) => typeof u === "string" && u.length < 3000).slice(0, 30); } catch (e) {}
  const out = {};
  await Promise.all(L.map(async (u) => {
    try {
      const U = new URL(u);
      if (U.protocol !== "https:") return;
      const om = /^((?:api|air-quality-api|previous-runs-api|ensemble-api)\.open-meteo\.com)(\/.*)$/.exec(U.host + U.pathname);
      if (om) {
        const r = await omServe(new Request(new URL(req.url).origin + "/om/" + om[1] + om[2] + U.search, { headers: req.headers }), env, new URL(new URL(req.url).origin + "/om/" + om[1] + om[2] + U.search));
        if (r.ok) out[u] = { s: 200, b: await r.text(), ct: r.headers.get("Content-Type") || "application/json" };
        return;
      }
      if (!PC_HOSTS.test(U.hostname) || PC_NO.test(u) || !env.GM) return;
      const x = await pcGet(env, u);
      if (x) out[u] = x;
    } catch (e) {}
  }));
  return new Response(JSON.stringify({ r: out }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
/* ============ Kartenbilder des Radars: Zwischenspeicher und Vorladen (/tp) ============
   Alle Kacheln, die das Radar von anderen Diensten lädt (Satelliten-Wolken und Blitze von EUMETSAT, Europa-Radar von
   LibreWXR bzw. RainViewer, Radar und Modell vom DWD), gehen über /tp?u=<Adresse>.
   1. Vorgeladen (Cron alle 5 Minuten): für Österreich und Umgebung in den Zoomstufen 5 bis 8 holt der Server die Kacheln
      jedes neuen Bildes selbst und legt sie als ein Paket je Bild und Zoomstufe in den KV-Speicher (wenige Schreibvorgänge).
   2. Sonst der Zwischenspeicher von Cloudflare (Cache), beim ersten Abruf gefüllt.
   3. Sonst direkt beim Dienst.
   Antwortet der Server nicht, holt die App die Kachel direkt. */
const TP_HOSTS = /^(view\.eumetsat\.int|maps\.dwd\.de|[a-z0-9-]+\.librewxr\.net|librewxr\.net|tilecache\.rainviewer\.com)$/;
const TP_E = 20037508.342789244;
/* gleiche Kachel = gleicher Schlüssel, egal in welcher Reihenfolge die Parameter stehen: id (Bild), z, x, y */
function tileKey(u) {
  let U;
  try { U = new URL(u); } catch (e) { return null; }
  const m = U.pathname.match(/^(.*)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})(\/0\/1_0\.png|\.png)$/);
  if (m && !U.search) return { id: U.origin + m[1] + "/Z/X/Y" + m[5], z: +m[2], x: +m[3], y: +m[4] };
  const P = {};
  for (const [k, v] of U.searchParams) P[k.toLowerCase()] = v;
  if ((P.request || "").toLowerCase() !== "getmap" || !P.bbox) return null;
  const crs = (P.crs || P.srs || "").toUpperCase();
  if (crs !== "EPSG:3857" && crs !== "EPSG:900913") return null;
  const b = P.bbox.split(",").map(Number);
  if (b.length !== 4 || b.some((v) => !isFinite(v))) return null;
  const w = b[2] - b[0], z = Math.round(Math.log2((2 * TP_E) / w));
  if (!(z >= 0 && z <= 20)) return null;
  const sz = (2 * TP_E) / Math.pow(2, z), x = Math.round((b[0] + TP_E) / sz), y = Math.round((TP_E - b[3]) / sz);
  /* nur die Bild-Parameter zählen (Leaflet hängt eigene Optionen wie rcKey an) */
  for (const k of ["bbox", "rckey", "rcpx", "v", "_"]) delete P[k];
  const id = U.origin + U.pathname + "?" + Object.keys(P).sort().map((k) => k + "=" + P[k]).join("&");
  return { id, z, x, y };
}
async function tpServe(req, env, url) {
  if (!(await valid(env, getCookie(req, COOKIE)))) return new Response("Nicht angemeldet", { status: 401 });
  const u = url.searchParams.get("u") || "";
  let U;
  try { U = new URL(u); } catch (e) { return new Response("Ungültig", { status: 400 }); }
  if (U.protocol !== "https:" || !TP_HOSTS.test(U.hostname)) return new Response("Nicht erlaubt", { status: 400 });
  const H = { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" };
  /* 1. vorgeladenes Paket */
  const k = tileKey(u);
  if (k && env.GM) {
    try {
      const b = await env.GM.get("tb:" + (await sha(k.id)) + ":" + k.z, { type: "arrayBuffer", cacheTtl: 300 });
      if (b) {
        const n = new DataView(b).getUint32(0), ix = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 4, n))), e = ix[k.x + "_" + k.y];
        if (e) return new Response(b.slice(4 + n + e[0], 4 + n + e[0] + e[1]), { headers: Object.assign({}, H, { "Content-Type": ix._ct || "image/png", "X-Vorgeladen": "1" }) });
      }
    } catch (e) {}
  }
  /* 2. Zwischenspeicher von Cloudflare */
  const ck = new Request("https://tp.cache/" + (await sha(k ? k.id + "|" + k.z + "/" + k.x + "/" + k.y : u)));
  const hit = await caches.default.match(ck);
  if (hit) return new Response(hit.body, { headers: Object.assign({}, H, { "Content-Type": hit.headers.get("Content-Type") || "image/png" }) });
  /* 3. beim Dienst */
  let r;
  try { r = await tfetch(u, 15000); } catch (e) { return new Response("Dienst nicht erreichbar", { status: 502 }); }
  if (!r.ok) return new Response("Dienst " + r.status, { status: r.status === 404 ? 404 : 502 });
  const ct = r.headers.get("Content-Type") || "image/png";
  if (!/^image\//.test(ct)) return new Response("Kein Bild", { status: 502 });
  const body = await r.arrayBuffer();
  try { await caches.default.put(ck, new Response(body, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=900" } })); } catch (e) {}
  return new Response(body, { headers: Object.assign({}, H, { "Content-Type": ct }) });
}
/* Kacheln eines Bildes für Österreich und Umgebung (46 bis 49,6° N, 8,8 bis 17,8° O) in den Zoomstufen zs holen und je
   Zoomstufe als ein Paket speichern. tpl(z, x, y) liefert die Adresse einer Kachel. Schon vorhandene Pakete werden
   nicht neu geholt (Bilder mit fester Zeit ändern sich nicht), außer fresh (das jeweils neueste Bild ohne Zeitangabe). */
const TP_BOX = [46.0, 8.8, 49.6, 17.8];
function tpRange(z) {
  const n = Math.pow(2, z), tx = (lo) => Math.floor(((lo + 180) / 360) * n), ty = (la) => Math.floor(((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * n);
  return { x0: tx(TP_BOX[1]), x1: tx(TP_BOX[3]), y0: ty(TP_BOX[2]), y1: ty(TP_BOX[0]) };
}
function wmsTile(base, z, x, y, px) {
  const sz = (2 * TP_E) / Math.pow(2, z), x0 = -TP_E + x * sz, y1 = TP_E - y * sz;
  return base + "&bbox=" + [x0, y1 - sz, x0 + sz, y1].join(",") + "&width=" + (px || 256) + "&height=" + (px || 256);
}
async function tpBundle(env, tpl, zs, ttl, fresh, budget) {
  let writes = 0;
  for (const z of zs) {
    if (budget.t < Date.now()) return writes;
    const R = tpRange(z), first = tileKey(tpl(z, R.x0, R.y0));
    if (!first) continue;
    const key = "tb:" + (await sha(first.id)) + ":" + z;
    if (!fresh) { try { const m = await env.GM.getWithMetadata(key, { type: "stream" }); if (m.value) { try { await m.value.cancel(); } catch (e) {} continue; } } catch (e) {} }
    const jobs = [];
    for (let x = R.x0; x <= R.x1; x++) for (let y = R.y0; y <= R.y1; y++) jobs.push([x, y]);
    const got = [];
    let ct = "image/png";
    for (let i = 0; i < jobs.length; i += 6) {
      await Promise.all(jobs.slice(i, i + 6).map(async ([x, y]) => {
        try { const r = await tfetch(tpl(z, x, y), 12000); if (r.ok && /^image\//.test(r.headers.get("Content-Type") || "")) { ct = r.headers.get("Content-Type"); got.push([x, y, new Uint8Array(await r.arrayBuffer())]); } } catch (e) {}
      }));
    }
    if (got.length < jobs.length * 0.8) continue;
    const ix = { _ct: ct };
    let o = 0;
    for (const [x, y, b] of got) { ix[x + "_" + y] = [o, b.length]; o += b.length; }
    const head = new TextEncoder().encode(JSON.stringify(ix)), out = new Uint8Array(4 + head.length + o);
    new DataView(out.buffer).setUint32(0, head.length);
    out.set(head, 4);
    let p = 4 + head.length;
    for (const [, , b] of got) { out.set(b, p); p += b.length; }
    await env.GM.put(key, out, { expirationTtl: ttl });
    writes++;
  }
  return writes;
}
/* ============ Zugrichtung der Wolken (für Wolken ohne Verspätung) ============
   Aus den zwei neuesten vorgeladenen Satellitenbildern (Wolkenmaske, Zoomstufe 7, Österreich und Umgebung) wird die
   Verschiebung gesucht, bei der beide am besten übereinander passen. Ergebnis in Metern je Sekunde (Karten-Meter),
   gespeichert als tp:mv. Die App schiebt damit das neueste Satellitenbild bis „jetzt“ weiter. */
async function pngRGBA(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  if (u[0] !== 0x89 || u[1] !== 0x50) throw new Error("kein PNG");
  let o = 8, W = 0, H = 0, bd = 8, ct = 0, pal = null, trns = null;
  const idat = [];
  while (o < u.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(u[o + 4], u[o + 5], u[o + 6], u[o + 7]), d = u.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { W = dv.getUint32(o + 8); H = dv.getUint32(o + 12); bd = u[o + 16]; ct = u[o + 17]; if (u[o + 20]) throw new Error("interlaced"); }
    else if (type === "PLTE") pal = d.slice(); else if (type === "tRNS") trns = d.slice(); else if (type === "IDAT") idat.push(d.slice()); else if (type === "IEND") break;
    o += 12 + len;
  }
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * bd) >> 3), stride = (W * ch * bd + 7) >> 3;
  const out = new Uint8Array(W * H * 4), cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0, p = 0; y < H; y++) {
    const f = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p++], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let xq = 0; xq < W; xq++) {
      const j = (y * W + xq) * 4;
      if (ct === 6 && bd === 8) { out[j] = cur[xq * 4]; out[j + 1] = cur[xq * 4 + 1]; out[j + 2] = cur[xq * 4 + 2]; out[j + 3] = cur[xq * 4 + 3]; }
      else if (ct === 2 && bd === 8) { out[j] = cur[xq * 3]; out[j + 1] = cur[xq * 3 + 1]; out[j + 2] = cur[xq * 3 + 2]; out[j + 3] = 255; }
      else if (ct === 3) { const idx = bd === 8 ? cur[xq] : (cur[(xq * bd) >> 3] >> (8 - bd - ((xq * bd) & 7))) & ((1 << bd) - 1); out[j] = pal[idx * 3]; out[j + 1] = pal[idx * 3 + 1]; out[j + 2] = pal[idx * 3 + 2]; out[j + 3] = trns && idx < trns.length ? trns[idx] : 255; }
      else if (ct === 0 && bd === 8) { out[j] = out[j + 1] = out[j + 2] = cur[xq]; out[j + 3] = 255; }
      else if (ct === 4 && bd === 8) { out[j] = out[j + 1] = out[j + 2] = cur[xq * 2]; out[j + 3] = cur[xq * 2 + 1]; }
    }
    prev.set(cur);
  }
  return { W, H, d: out };
}
/* Wolkenmaske eines Bildpakets (Zoom 7) als grobes Raster (4 x 4 Bildpunkte je Zelle, Anteil Wolke 0 bis 1) */
async function clmGrid(env, base, sl) {
  const z = 7, R = tpRange(z), k = tileKey(wmsTile(base + "&time=" + new Date(sl * 1000).toISOString().slice(0, 19) + "Z", z, R.x0, R.y0));
  const b = await env.GM.get("tb:" + (await sha(k.id)) + ":" + z, { type: "arrayBuffer" });
  if (!b) return null;
  const n = new DataView(b).getUint32(0), ix = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 4, n)));
  const nx = R.x1 - R.x0 + 1, ny = R.y1 - R.y0 + 1, C = 4, GW = (nx * 256) / C, GH = (ny * 256) / C, G = new Float32Array(GW * GH);
  for (let tx = 0; tx < nx; tx++) for (let ty = 0; ty < ny; ty++) {
    const e = ix[R.x0 + tx + "_" + (R.y0 + ty)];
    if (!e) return null;
    const px = await pngRGBA(b.slice(4 + n + e[0], 4 + n + e[0] + e[1]));
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const j = (y * 256 + x) * 4, cl = px.d[j + 3] > 100 && px.d[j] > 200 && px.d[j + 1] > 200 && px.d[j + 2] > 200;
      if (cl) G[(((ty * 256 + y) / C) | 0) * GW + (((tx * 256 + x) / C) | 0)] += 1 / (C * C);
    }
  }
  return { G, GW, GH };
}
async function clmMotion(env, base, s0) {
  const A = await clmGrid(env, base, s0 - 900), B = await clmGrid(env, base, s0);
  if (!A || !B) return null;
  const { GW, GH } = A, M = 8;
  let best = null;
  for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) {
    let e = 0, n = 0;
    for (let y = M; y < GH - M; y += 2) for (let x = M; x < GW - M; x += 2) { e += Math.abs(B.G[y * GW + x] - A.G[(y - dy) * GW + (x - dx)]); n++; }
    e /= n;
    if (!best || e < best.e) best = { e, dx, dy };
  }
  let e0 = 0, n0 = 0;
  for (let y = M; y < GH - M; y += 2) for (let x = M; x < GW - M; x += 2) { e0 += Math.abs(B.G[y * GW + x] - A.G[y * GW + x]); n0++; }
  e0 /= n0;
  /* Meter je Zelle bei Zoom 7: 4 Bildpunkte zu je 2·π·6378137/(256·2^7) m */
  const mc = (4 * 2 * TP_E) / (256 * 128);
  return { slot: s0, vx: (best.dx * mc) / 900, vy: (-best.dy * mc) / 900, q: e0 > 0 ? Math.round((1 - best.e / e0) * 100) / 100 : 0, at: Math.round(Date.now() / 1000) };
}
async function tpPrewarm(env) {
  if (!env.GM) return;
  const budget = { t: Date.now() + 4 * 60000 }, now = Date.now() / 1000, iso = (t) => new Date(t * 1000).toISOString().slice(0, 19) + "Z";
  let w = 0;
  /* Satelliten-Wolken (Meteosat-Wolkenmaske): das neueste Bild ohne Zeit (wie die App es für „jetzt“ holt) und die Viertelstunden
     der letzten 1½ Stunden mit Zeit */
  const CLM = "https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetMap&version=1.1.1&layers=msg_fes:clm&styles=&format=image/png&transparent=true&srs=EPSG:3857";
  const mi = new Date().getUTCMinutes();
  /* dieselben Viertelstunden, die die App holt: etwa 45 Minuten zurück und die zwei davor. Ist die neueste noch nicht beim
     Satelliten, fehlen Kacheln, dann wird es beim nächsten Durchgang wieder versucht */
  const s0 = Math.floor((now - 45 * 60) / 900) * 900;
  for (const sl of [s0, s0 - 900, s0 - 1800]) w += await tpBundle(env, (z, x, y) => wmsTile(CLM + "&time=" + iso(sl), z, x, y), [5, 6, 7, 8], 7200, false, budget);
  try {
    const old = JSON.parse((await env.GM.get("tp:mv")) || "null");
    if (!old || old.slot !== s0) { const mv = await clmMotion(env, CLM, s0); if (mv) await env.GM.put("tp:mv", JSON.stringify(mv), { expirationTtl: 3 * 3600 }); }
  } catch (e) { console.error("Wolkenzug", e && e.message); }
  /* Europa-Radar (LibreWXR): die letzten 3 Messbilder und die Radar-Vorhersage */
  try {
    const j = await (await tfetch("https://api.librewxr.net/public/weather-maps.json", 10000)).json();
    const past = (j.radar && j.radar.past) || [], nc = (j.radar && j.radar.nowcast) || [];
    for (const f of past.slice(-3)) w += await tpBundle(env, (z, x, y) => j.host + f.path + "/512/" + z + "/" + x + "/" + y + "/0/1_0.png", [5, 6, 7, 8], 3 * 3600, false, budget);
    for (const f of nc) w += await tpBundle(env, (z, x, y) => j.host + f.path + "/512/" + z + "/" + x + "/" + y + "/0/1_0.png", [6, 7], 3600, false, budget);
  } catch (e) {}
  /* DWD ICON-EU (Wettermodell im Radar außerhalb der GeoSphere-Fläche): die nächsten 12 Stunden */
  if (mi % 30 < 5) {
    const ICX = "https://maps.dwd.de/geoserver/dwd/wms?service=WMS&request=GetMap&version=1.1.1&layers=dwd:Icon-eu_reg00625_fd_sl_TOTPREC01H&styles=&format=image/png&transparent=true&srs=EPSG:3857";
    for (let h = 1; h <= 12; h++) { const th = Math.floor(now / 3600) * 3600 + h * 3600; w += await tpBundle(env, (z, x, y) => wmsTile(ICX + "&time=" + new Date(th * 1000).toISOString(), z, x, y), [5, 6, 7], 6 * 3600, false, budget); }
  }
  if (w) console.log("tp: " + w + " Pakete vorgeladen");
}
/* ============ Beste Vorhersage je Ort (/bf/pp und /bf/sk), nur für Angemeldete ============
   /bf/pp: echte Regenwahrscheinlichkeit aus Ensembles. Jedes Ensemble rechnet das Wetter 20 bis 50 Mal mit leicht
     verschiedenen Anfangswerten. Wahrscheinlichkeit je Stunde = Anteil der Läufe mit mindestens 0,1 mm, gemittelt über die
     Ensembles (jedes zählt gleich). Europa: DWD ICON (40 Läufe), ECMWF (51), in AT/DE/CH die ersten 2 Tage zusätzlich
     ICON-D2 (20, 2 km). Nordamerika: GFS, ECMWF, GEM. Sonst: ECMWF, GFS, ICON.
   /bf/sk: welches Modell an diesem Ort zuletzt am besten lag. Die Wettermeldungen der Flughäfen in der Nähe (bis 60 km) der
     letzten 2 Tage werden mit den Modellen verglichen, die die App benutzt (am Ort der Station, auf ihre Höhe umgerechnet).
     Ergebnis je Modell: Gewicht für Temperatur und Wind (je kleiner der Fehler, desto mehr), Trefferquote für Regen ja/nein.
   Beides in zwei Abrufen, damit jeder nur wenig rechnen muss (Grenze im kostenlosen Paket). Die App merkt sich die Antworten
   (Wahrscheinlichkeit 1 Stunde, Modellgüte 6 Stunden), so bleibt es bei wenigen Abrufen bei Open-Meteo. */
const BF_HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const bfJson = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: BF_HDR });
function bfEns(la, lo) {
  const eu = la > 30 && la < 72 && lo > -25 && lo < 45, na = la > 15 && la < 75 && lo > -170 && lo < -50;
  const d2 = la > 45.5 && la < 55.5 && lo > 5 && lo < 17.5;
  if (eu) return d2 ? ["dwd_icon_seamless_eps", "ecmwf_ifs025", "dwd_icon_d2_eps"] : ["dwd_icon_seamless_eps", "ecmwf_ifs025"];
  if (na) return ["ncep_gefs_seamless", "ecmwf_ifs025", "gem_global"];
  return ["ecmwf_ifs025", "ncep_gefs_seamless", "dwd_icon_seamless_eps"];
}
const BF_NAME = { dwd_icon_seamless_eps: "DWD ICON", dwd_icon_d2_eps: "DWD ICON-D2", ecmwf_ifs025: "ECMWF", ncep_gefs_seamless: "GFS", gem_global: "GEM" };
async function bfPP(la, lo) {
  const ens = bfEns(la, lo);
  const r = await tfetch("https://ensemble-api.open-meteo.com/v1/ensemble?latitude=" + la + "&longitude=" + lo + "&hourly=precipitation&forecast_days=7&timezone=GMT&timeformat=unixtime&models=" + ens.join(","), 15000);
  if (!r.ok) return bfJson({ error: "ensemble " + r.status }, 502);
  const H = (await r.json()).hourly || {}, T = H.time || [];
  /* Schlüssel: precipitation[_memberNN]_<modell> (bei einem Modell ohne Endung) */
  const grp = new Map();
  for (const k of Object.keys(H)) {
    const m = /^precipitation(?:_member\d+)?(?:_(.+))?$/.exec(k);
    if (!m) continue;
    const g = m[1] || "x";
    if (!grp.has(g)) grp.set(g, []);
    grp.get(g).push(H[k]);
  }
  const p = new Array(T.length).fill(null), used = new Set();
  for (let i = 0; i < T.length; i++) {
    let s = 0, n = 0;
    for (const [g, A] of grp) {
      let w = 0, c = 0;
      for (const a of A) { const v = a[i]; if (v == null) continue; c++; if (v >= 0.1) w++; }
      if (c >= 5) { s += w / c; n++; used.add(g); }
    }
    if (n) p[i] = Math.round((s / n) * 100);
  }
  const names = [...used].map((g) => BF_NAME[ens.find((e) => g.startsWith(e)) || ""] || g);
  return bfJson({ t0: T[0] || 0, p, src: names, at: Math.round(Date.now() / 1000) });
}
const BF_MOD = /^[a-z0-9_]{2,40}$/;
/* Das 1-km-Modell von GeoSphere (Open-Meteo hat es nicht): ältere Läufe direkt bei GeoSphere holen (forecast_offset 2 und 5,
   also Vorhersagen von vor etwa 6 bis 21 Stunden für die Stunden bis jetzt) und genauso mit den Stationen vergleichen.
   Ergebnis wie bei den anderen Modellen (Gewicht, Fehler) und dazu der mittlere Fehler b (Vorhersage minus Messung),
   mit dem die App das Modell ausbessert. */
const GS1 = "geosphere_1km", GS1_URL = "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km";
/* P: zusätzliche Punkte nach den Stationen (der Ort selbst, für den Regen gegen INCA) */
async function gs1Past(S, P) {
  const now = Math.floor(Date.now() / 3600000) * 3600, ll = S.concat(P || []).map((o) => "&lat_lon=" + o.la.toFixed(4) + "," + o.lo.toFixed(4)).join("");
  const one = async (o) => {
    try {
      const r = await tfetch(GS1_URL + "?parameters=2t,10u,10v,tcc,tp&output_format=geojson&forecast_offset=" + o + "&start=" + isoM(now - o * 3 * 3600) + ll, 22000);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  };
  return (await Promise.all([one(2), one(5)])).filter((j) => j && Array.isArray(j.timestamps) && Array.isArray(j.features));
}
/* Bewölkung aus der Wettermeldung in Prozent (tiefe und mittlere Wolken; FEW 1-2, SCT 3-4, BKN 5-7, OVC 8 Achtel).
   CAVOK, NSC, NCD, CLR, SKC: keine Wolken bis in mittlere Höhe. Nebel ohne Wolkenangabe (VV): bedeckt. */
const CLC = { SKC: 0, CLR: 0, NSC: 0, NCD: 0, CAVOK: 0, FEW: 19, SCT: 44, BKN: 75, OVC: 100, OVX: 100, VV: 100 };
function metarCover(x) {
  const L = Array.isArray(x.clouds) ? x.clouds : [];
  let c = null;
  for (const k of L) { const v = CLC[k && k.cover]; if (v == null) continue; if (k.base != null && k.base > 20000) continue; c = Math.max(c == null ? 0 : c, v); }
  if (c == null && x.cover != null && CLC[x.cover] != null) c = CLC[x.cover];
  if (c == null && /CAVOK/.test(String(x.rawOb || ""))) c = 0;
  return c;
}
async function bfSK(la, lo, models, g, env) {
  const SK_KV = env && env.GM;
  const dla = 0.55, dlo = Math.min(2.5, 0.8 / Math.max(0.2, Math.cos((la * Math.PI) / 180)));
  const bb = [la - dla, lo - dlo, la + dla, lo + dlo].map((x) => x.toFixed(2)).join(",");
  let a = [];
  try {
    const r = await tfetch("https://aviationweather.gov/api/data/metar?format=json&hours=48&bbox=" + bb, 12000);
    if (r.ok && r.status !== 204) a = await r.json();
  } catch (e) {}
  if (!Array.isArray(a)) a = [];
  const km = (x) => Math.hypot((x.lat - la) * 111, (x.lon - lo) * 111 * Math.cos((la * Math.PI) / 180));
  const st = new Map();
  for (const x of a) {
    if (!x || typeof x.lat !== "number" || typeof x.lon !== "number" || typeof x.obsTime !== "number") continue;
    if (km(x) > 60) continue;
    let o = st.get(x.icaoId);
    if (!o) st.set(x.icaoId, (o = { id: x.icaoId, la: x.lat, lo: x.lon, h: typeof x.elev === "number" ? x.elev : null, d: km(x), ob: [] }));
    o.ob.push({ t: x.obsTime, T: typeof x.temp === "number" ? x.temp : null, W: typeof x.wspd === "number" ? x.wspd * 1.852 : null, R: /(^|\s)[-+]?(VC)?(SH|TS)?(RA|DZ|SN|SG|PL|GR|GS)/.test(String(x.wxString || "")), C: metarCover(x) });
  }
  const S = [...st.values()].filter((o) => o.ob.length >= 20 && o.h != null).sort((x, y) => x.d - y.d).slice(0, 3);
  if (!S.length) return bfJson({ n: 0, st: [] });
  /* in Österreich zusätzlich der Ort selbst (letzter Punkt), für den Vergleich mit dem gemessenen Niederschlag von INCA */
  const PL = g ? [{ la, lo, h: null }] : [], P2 = S.concat(PL);
  const incaP = g ? tfetch("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/inca-v1-1h-1km?parameters=RR&lat_lon=" + la.toFixed(4) + "," + lo.toFixed(4) +
    "&start=" + isoM(Math.floor(Date.now() / 3600000) * 3600 - 48 * 3600) + "&end=" + isoM(Math.floor(Date.now() / 3600000) * 3600), 15000).then((x) => (x.ok ? x.json() : null)).catch(() => null) : Promise.resolve(null);
  const r = await tfetch("https://api.open-meteo.com/v1/forecast?latitude=" + P2.map((o) => o.la.toFixed(3)).join(",") + "&longitude=" + P2.map((o) => o.lo.toFixed(3)).join(",") +
    "&elevation=" + S.map((o) => Math.round(o.h)).concat(PL.map(() => "nan")).join(",") + "&past_days=2&forecast_days=1&hourly=temperature_2m,wind_speed_10m,precipitation,cloud_cover_low,cloud_cover_mid&models=" + models.join(",") + "&timezone=GMT&timeformat=unixtime", 15000);
  if (!r.ok) return bfJson({ error: "forecast " + r.status }, 502);
  let L = await r.json();
  if (!Array.isArray(L)) L = [L];
  const now = Date.now() / 1000, acc = {};
  models.forEach((m) => (acc[m] = { tE: 0, tN: 0, wE: 0, wN: 0, rE: 0, rN: 0, cE: 0, cN: 0 }));
  S.forEach((o, si) => {
    const H = L[si] && L[si].hourly;
    if (!H || !H.time) return;
    const idx = new Map(H.time.map((t, i) => [t, i]));
    const one = models.length === 1;
    for (const ob of o.ob) {
      if (ob.t > now) continue;
      const hr = Math.round(ob.t / 3600) * 3600;
      if (Math.abs(hr - ob.t) > 1200) continue;
      const i = idx.get(hr);
      if (i == null) continue;
      for (const m of models) {
        const g = (n) => { const A = H[one ? n : n + "_" + m]; return A ? A[i] : null; }, q = acc[m];
        const T = g("temperature_2m"), W = g("wind_speed_10m"), P = g("precipitation");
        if (T != null && ob.T != null) { q.tE += Math.abs(T - ob.T); q.tB = (q.tB || 0) + (T - ob.T); q.tN++; }
        if (W != null && ob.W != null) { q.wE += Math.abs(W - ob.W); q.wN++; }
        if (P != null) { q.rN++; if ((P >= 0.1) !== ob.R) q.rE++; }
        const CLo = g("cloud_cover_low"), CMi = g("cloud_cover_mid");
        if (ob.C != null && CLo != null && CMi != null) { q.cE += Math.abs(Math.max(CLo, CMi) - ob.C); q.cN++; }
      }
    }
  });
  /* Regen in Österreich: Modelle am Ort gegen INCA (Radar und Regenmesser, 1 km), Stunde für Stunde der letzten 2 Tage.
     Trefferquote nass/trocken (ab 0,1 mm) ersetzt dann die der Flughäfen; dazu der mittlere Mengenfehler pe. */
  const inca = await incaP, pr = {}, pe = {};
  if (inca && L[S.length] && L[S.length].hourly) {
    const H = L[S.length].hourly, ix = new Map(H.time.map((t, i) => [t, i])), one = models.length === 1;
    const ts = (inca.timestamps || []).map((x) => Date.parse(x) / 1000), RR = inca.features && inca.features[0] && inca.features[0].properties.parameters.RR && inca.features[0].properties.parameters.RR.data;
    if (RR) for (const m of models) {
      const A = H[one ? "precipitation" : "precipitation_" + m];
      if (!A) continue;
      let n = 0, e = 0, ae = 0;
      ts.forEach((t, k) => { const i = ix.get(t), o = RR[k]; if (i == null || o == null || A[i] == null || t > now) return; n++; if ((A[i] >= 0.1) !== (o >= 0.1)) e++; ae += Math.abs(A[i] - o); });
      if (n >= 24) { pr[m] = Math.round((1 - e / n) * 1000) / 1000; pe[m] = Math.round((ae / n) * 100) / 100; }
    }
  }
  const all = models.slice();
  if (g) {
    const P = await gs1Past(S, PL), q = (acc[GS1] = { tE: 0, tN: 0, wE: 0, wN: 0, rE: 0, rN: 0, tB: 0, cE: 0, cN: 0 });
    /* Regen am Ort gegen INCA (wie bei den anderen Modellen), Stunden aus den älteren Läufen */
    const incTs = inca && (inca.timestamps || []).map((x) => Date.parse(x) / 1000), incRR = inca && inca.features && inca.features[0] && inca.features[0].properties.parameters.RR && inca.features[0].properties.parameters.RR.data;
    let pn = 0, pE = 0, pae = 0;
    const seenP = new Set();
    for (const j of P) {
      const fp = j.features[S.length], pp = fp && fp.properties && fp.properties.parameters, TP = pp && pp.tp && pp.tp.data;
      if (TP && incTs && incRR) {
        const ix2 = new Map(j.timestamps.map((t, i) => [Date.parse(t) / 1000, i]));
        incTs.forEach((t, k) => { const i = ix2.get(t), o = incRR[k]; if (i == null || o == null || TP[i] == null || t > now || seenP.has(t)) return; seenP.add(t); pn++; if ((TP[i] >= 0.1) !== (o >= 0.1)) pE++; pae += Math.abs(TP[i] - o); });
      }
      j.features.forEach((f, si) => {
        const o = S[si], pa = f && f.properties && f.properties.parameters;
        if (!o || !pa || !pa["2t"]) return;
        const T = pa["2t"].data || [], U = (pa["10u"] || {}).data || [], V = (pa["10v"] || {}).data || [];
        const ix = new Map(j.timestamps.map((t, i) => [Date.parse(t) / 1000, i]));
        for (const ob of o.ob) {
          const hr = Math.round(ob.t / 3600) * 3600;
          if (Math.abs(hr - ob.t) > 1200 || hr > now) continue;
          const i = ix.get(hr);
          if (i == null) continue;
          if (T[i] != null && ob.T != null) { q.tE += Math.abs(T[i] - ob.T); q.tB += T[i] - ob.T; q.tN++; }
          if (U[i] != null && V[i] != null && ob.W != null) { q.wE += Math.abs(Math.hypot(U[i], V[i]) * 3.6 - ob.W); q.wN++; }
          const TC = (pa.tcc || {}).data || [];
          if (TC[i] != null && ob.C != null) { const c = TC[i] <= 1.01 ? TC[i] * 100 : TC[i]; q.cE += Math.abs(c - ob.C); q.cN++; }
        }
      });
    }
    if (pn >= 12) { pr[GS1] = Math.round((1 - pE / pn) * 1000) / 1000; pe[GS1] = Math.round((pae / pn) * 100) / 100; }
    all.push(GS1);
  }
  const out = { t: {}, w: {}, r: {}, c: {}, e: {}, b: {}, n: 0, st: S.map((o) => o.id), ri: Object.keys(pr).length ? 1 : 0, pe };
  /* Werte der letzten 2 Tage je Modell */
  const cur = {};
  for (const m of all) {
    const q = acc[m], x = (cur[m] = {});
    if (q.tN >= 20) { x.t = q.tE / q.tN; if (q.tB != null) x.b = q.tB / q.tN; out.n = Math.max(out.n, q.tN); }
    if (q.wN >= 20) x.w = q.wE / q.wN;
    if (pr[m] != null) x.r = pr[m];
    else if (q.rN >= 20) x.r = 1 - q.rE / q.rN;
    if (q.cN >= 20) x.c = q.cE / q.cN;
  }
  /* Gedächtnis über Wochen (KV sk:<Ort>): höchstens alle 12 Stunden wird der Stand der letzten 2 Tage eingerechnet
     (gleitender Mittelwert, ältere Tage zählen langsam immer weniger, etwa 3 Wochen). Bewertet wird zur Hälfte nach den
     letzten 2 Tagen, zur Hälfte nach dem Langzeitwert, sobald es den gibt (mindestens 4 Einträge). Eine kurze Glückssträhne
     eines Modells kippt die Auswahl so nicht mehr gleich. */
  let hist = null;
  const hk = "sk:" + la.toFixed(2) + ":" + lo.toFixed(2);
  if (SK_KV) {
    try { hist = JSON.parse((await SK_KV.get(hk)) || "null"); } catch (e) {}
    const nowS = Math.round(Date.now() / 1000);
    if (!hist || nowS - (hist.at || 0) > 12 * 3600) {
      const h = hist || { m: {} };
      for (const m of all) for (const k of ["t", "w", "r", "c", "b"]) {
        const v = cur[m][k];
        if (v == null) continue;
        const o = (h.m[m] = h.m[m] || {}), n = (o["n" + k] || 0) + 1;
        o[k] = o[k] == null ? v : o[k] + (v - o[k]) * Math.max(0.12, 1 / n);
        o["n" + k] = Math.min(n, 99);
      }
      h.at = nowS;
      try { await SK_KV.put(hk, JSON.stringify(h), { expirationTtl: 60 * 86400 }); } catch (e) {}
      hist = h;
    }
  }
  const bl = (m, k) => { const v = cur[m][k], o = hist && hist.m[m]; if (o && o[k] != null && (o["n" + k] || 0) >= 4) return v == null ? o[k] : (v + o[k]) / 2; return v; };
  for (const m of all) {
    const T = bl(m, "t"), Wd = bl(m, "w"), R = bl(m, "r"), C = bl(m, "c"), B = bl(m, "b");
    if (B != null && T != null) out.b[m] = Math.round(B * 100) / 100;
    if (T != null) { out.e[m] = Math.round(T * 100) / 100; out.t[m] = 1 / Math.pow(T + 0.3, 2); }
    if (Wd != null) out.w[m] = 1 / Math.pow(Wd + 1.5, 2);
    if (R != null) out.r[m] = Math.round(R * 1000) / 1000;
    if (C != null) out.c[m] = Math.round((1 - C / 100) * 1000) / 1000;
  }
  if (hist) out.hl = Math.max(0, ...Object.values(hist.m).map((o) => o.nt || 0));
  for (const k of ["t", "w"]) { const s = Object.values(out[k]).reduce((x, y) => x + y, 0); if (s) for (const m in out[k]) out[k][m] = Math.round((out[k][m] / s) * 1000) / 1000; }
  return bfJson(out);
}
/* /bf/tip: Tipps für den Tag. Die App schickt die Fakten (aus ihren Vorhersagedaten nach festen Regeln bestimmt), ein kleines
   Sprachmodell von Cloudflare formuliert daraus kurze Tipps. Geprüft wird: keine neue Zahl, sinnvolle Länge, keine Sonderzeichen.
   Klappt das nicht, nimmt die App ihre festen Sätze. */
/* Llama 3.3 70B schreibt deutlich sauberer (am 12.11.2026 verglichen); das kleine Modell nur als Ersatz */
const TIP_AI = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"];
async function bfTip(req, env) {
  if (!env.AI) return bfJson({ error: "keine KI" }, 503);
  let f = [];
  try { const b = await req.json(); f = (Array.isArray(b && b.f) ? b.f : []).map((x) => String(x).slice(0, 160)).slice(0, 6); } catch (e) {}
  if (!f.length) return bfJson({ t: [] });
  const ok = new Set(f.join(" ").match(/\d+(?:[.,]\d+)?/g) || []);
  const msgs = [
    { role: "system", content: "Du formulierst für eine Wetter-App auf Deutsch kurze, freundliche Tipps für den Tag. Du bekommst nummerierte Tatsachen. Schreibe zu jeder Tatsache genau einen Satz mit einem praktischen Rat, in derselben Reihenfolge, eine Zeile pro Tatsache, also genau so viele Zeilen wie Tatsachen. Sprich den Leser mit du an. Höchstens 110 Zeichen pro Satz. Verwende nur die jeweilige Tatsache, erfinde nichts dazu, übernimm Zahlen und Uhrzeiten genau. Ohne Nummern, ohne Aufzählungszeichen, kein Emoji, keine Anführungszeichen." },
    { role: "user", content: f.map((x, i) => i + 1 + ". " + x).join("\n") },
  ];
  for (const m of TIP_AI) {
    try {
      const r = await env.AI.run(m, { messages: msgs, max_tokens: 260, temperature: 0.4 });
      const t = String((r && (r.response || (r.result && r.result.response))) || "").split(/\n+/)
        .map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["„»“]+|["“«”]+$/g, "").trim()).filter((x) => x.length >= 12);
      if (t.length !== f.length) continue;
      if (t.some((x) => x.length > 140 || /[<>{}*#\[\]]/.test(x) || !(x.match(/\d+(?:[.,]\d+)?/g) || []).every((n) => ok.has(n)))) continue;
      return bfJson({ t, m });
    } catch (e) {}
  }
  return bfJson({ t: [] });
}
/* /om/<host>/<pfad>?…: Abfragen an Open-Meteo weiterleiten, damit nicht der Internetanschluss zu Hause zählt (Open-Meteo
   erlaubt 10.000 Abfragen pro Anschluss und Tag). Nur für Angemeldete, nur die Open-Meteo-Server, nur GET, ohne
   Cookies; die Antwort wird unverändert durchgereicht (kaum Rechenzeit). */
const OM_HOSTS = new Set(["api.open-meteo.com", "air-quality-api.open-meteo.com", "previous-runs-api.open-meteo.com", "ensemble-api.open-meteo.com", "geocoding-api.open-meteo.com"]);
/* Open-Meteo über unseren Server, mit Zwischenspeicher im KV (gilt für alle Nutzer zusammen):
   - frisch genug (Vorhersage 15 Minuten, Ensembles und Luft 30, frühere Läufe 60, Ortssuche 1 Tag): sofort aus dem Speicher,
     ohne Abfrage bei Open-Meteo. Spart Abfragen (Open-Meteo erlaubt nur eine bestimmte Zahl am Tag) und ist schneller.
   - antwortet Open-Meteo nicht oder ist das Limit erreicht: der letzte Stand (bis 1 Tag alt) statt „Keine Verbindung“.
   - Vorrechnen: was in den letzten 6 Stunden gebraucht wurde (om:hot), holt der Server alle 5 Minuten rechtzeitig neu,
     so ist beim Öffnen der App schon alles da. */
const omTtl = (host, path) => (host.startsWith("geocoding") ? 86400 : path.endsWith("meta.json") ? 300 : host.startsWith("previous") ? 3600 : host.startsWith("api.") ? 900 : 1800);
/* viele Orte in einer Abfrage (Temperaturen auf der Radarkarte): zählt bei Open-Meteo je Ort, darum nicht vorrechnen und
   eine Stunde merken */
const omMany = (u) => { const m = /[?&]latitude=([^&]*)/.exec(u); return !!m && decodeURIComponent(m[1]).split(",").length > 5; };
const omPre = (u) => /^https:\/\/(api|ensemble-api|air-quality-api)\.open-meteo\.com\/v1\//.test(u) && !omMany(u);
async function sha(s) { const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
async function omFetch(env, u, h, ttl) {
  const r = await tfetch(u, 25000);
  if (!r.ok) return { r };
  const body = await r.arrayBuffer(), ct = r.headers.get("Content-Type") || "application/json";
  if (env.GM && body.byteLength < 20e6) { try { await env.GM.put("om:" + h, body, { expirationTtl: 26 * 3600, metadata: { at: Math.round(Date.now() / 1000), ct } }); } catch (e) {} }
  return { body, ct };
}
async function omHot(env, h, u, ttl) {
  if (!env.GM || !omPre(u)) return;
  try {
    const hot = JSON.parse((await env.GM.get("om:hot")) || "{}"), now = Math.round(Date.now() / 1000), e = hot[h];
    if (e && now - e.used < 3 * 3600) return;
    hot[h] = { u, ttl, used: now };
    for (const k of Object.keys(hot)) if (now - hot[k].used > 86400) delete hot[k];
    await env.GM.put("om:hot", JSON.stringify(hot));
  } catch (e) {}
}
async function omPrewarm(env) {
  if (!env.GM) return;
  const hot = JSON.parse((await env.GM.get("om:hot")) || "{}"), now = Date.now() / 1000, t0 = Date.now();
  let n = 0;
  for (const [h, e] of Object.entries(hot)) {
    if (now - e.used > 6 * 3600 || n >= 30 || Date.now() - t0 > 4 * 60000) continue;
    const old = await env.GM.getWithMetadata("om:" + h, { type: "stream" });
    try { if (old.value) await old.value.cancel(); } catch (x) {}
    const at = old.metadata && old.metadata.at || 0;
    if (now - at < e.ttl - 150) continue;
    n++;
    try { const x = await omFetch(env, e.u, h, e.ttl); if (x.r && x.r.status === 429) break; } catch (x) {}
  }
}
async function omServe(req, env, url) {
  if (!(await valid(env, getCookie(req, COOKIE)))) return bfJson({ error: "Nicht angemeldet" }, 401);
  const m = /^\/om\/([a-z.-]+)(\/[A-Za-z0-9_\/.-]*)$/.exec(url.pathname);
  if (!m || !OM_HOSTS.has(m[1]) || req.method !== "GET") return bfJson({ error: "Ungültig" }, 400);
  const u = "https://" + m[1] + m[2] + url.search, ttl = omMany("https://x/?" + url.search.slice(1)) ? 3600 : omTtl(m[1], m[2]), h = await sha(u), now = Date.now() / 1000;
  const out = (body, ct, age) => new Response(body, { headers: { "Content-Type": ct || "application/json", "Cache-Control": "no-store", "X-Alter": String(Math.round(age)) } });
  let old = null;
  if (env.GM) { try { old = await env.GM.getWithMetadata("om:" + h, { type: "arrayBuffer" }); } catch (e) {} }
  const age = old && old.value && old.metadata ? now - old.metadata.at : Infinity;
  await omHot(env, h, u, ttl);
  if (age < ttl) return out(old.value, old.metadata.ct, age);
  try {
    const x = await omFetch(env, u, h, ttl);
    if (x.body) return out(x.body, x.ct, 0);
    if (age < 86400) return out(old.value, old.metadata.ct, age);
    return new Response(x.r.body, { status: x.r.status, headers: { "Content-Type": x.r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
  } catch (e) {
    if (age < 86400) return out(old.value, old.metadata.ct, age);
    return bfJson({ error: "Open-Meteo nicht erreichbar" }, 502);
  }
}
/* ============ Trefferquote des Radars am Ort (Österreich) ============
   Nächste Wetterstation von GeoSphere (TAWES, bis 20 km) gegen das Radar (INCA, 1 km) genau an der Station, Stunde für
   Stunde über die letzten 7 Tage: wie oft „Regen ja/nein“ stimmt (ab 0,1 mm) und Verhältnis der Mengen. 6 Stunden gemerkt. */
async function bfRQ(la, lo, env) {
  const key = "rq:" + la.toFixed(2) + ":" + lo.toFixed(2);
  if (env.GM) { const c = await env.GM.get(key); if (c) return new Response(c, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=3600" } }); }
  const GSB = "https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min";
  let meta = env.GM ? JSON.parse((await env.GM.get("rq:meta")) || "null") : null;
  if (!meta) {
    const m = await (await tfetch(GSB + "/metadata", 20000)).json();
    meta = (m.stations || []).filter((x) => x.is_active !== false).map((x) => [x.id, x.name, +x.lat, +x.lon]);
    if (env.GM) await env.GM.put("rq:meta", JSON.stringify(meta), { expirationTtl: 7 * 86400 });
  }
  const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
  let best = null;
  for (const x of meta) { const d = km(la, lo, x[2], x[3]); if (d <= 20 && (!best || d < best.d)) best = { id: x[0], name: x[1], la: x[2], lo: x[3], d }; }
  const out = { ok: 0 };
  if (best) {
    const end = new Date(Math.floor(Date.now() / 3600000) * 3600000), start = new Date(end.getTime() - 7 * 86400000), iso = (d) => d.toISOString().slice(0, 16);
    const [st, inc] = await Promise.all([
      tfetch(GSB + "?parameters=RR&station_ids=" + best.id + "&start=" + iso(start) + "&end=" + iso(end), 25000).then((r) => r.json()),
      tfetch("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/inca-v1-1h-1km?parameters=RR&lat_lon=" + best.la.toFixed(4) + "," + best.lo.toFixed(4) + "&start=" + iso(start) + "&end=" + iso(end), 25000).then((r) => r.json()),
    ]);
    /* Station: 10-Minuten-Summen zu Stunden (die Stunde bis zur vollen Stunde) */
    const S = new Map(), SR = (st.features && st.features[0] && st.features[0].properties.parameters.RR && st.features[0].properties.parameters.RR.data) || [];
    (st.timestamps || []).forEach((t, i) => { const v = SR[i]; if (v == null) return; const h = Math.ceil(Date.parse(t) / 3600000) * 3600; const e = S.get(h) || [0, 0]; e[0] += +v; e[1]++; S.set(h, e); });
    const IR = (inc.features && inc.features[0] && inc.features[0].properties.parameters.RR && inc.features[0].properties.parameters.RR.data) || [];
    let n = 0, hit = 0, ss = 0, si = 0;
    (inc.timestamps || []).forEach((t, i) => { const h = Date.parse(t) / 1000, e = S.get(h), r = IR[i]; if (!e || e[1] < 5 || r == null) return; n++; if ((e[0] >= 0.1) === (r >= 0.1)) hit++; if (e[0] >= 0.1 || r >= 0.1) { ss += e[0]; si += r; } });
    Object.assign(out, { ok: 1, st: best.name, d: Math.round(best.d * 10) / 10, n, hit: n ? Math.round((hit / n) * 1000) / 1000 : null, sst: Math.round(ss * 10) / 10, sin: Math.round(si * 10) / 10 });
  }
  const txt = JSON.stringify(out);
  if (env.GM) await env.GM.put(key, txt, { expirationTtl: 6 * 3600 });
  return new Response(txt, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=3600" } });
}
async function bfServe(req, env, url) {
  if (!(await valid(env, getCookie(req, COOKIE)))) return bfJson({ error: "Nicht angemeldet" }, 401);
  if (url.pathname === "/bf/log" && req.method === "POST") { try { const b = await req.json(); console.log("APPFEHLER", JSON.stringify(b).slice(0, 1600)); } catch (e) {} return bfJson({ ok: 1 }); }
  if (url.pathname === "/bf/tip" && req.method === "POST") { try { return await bfTip(req, env); } catch (e) { return bfJson({ t: [] }); } }
  const la = Math.round(+url.searchParams.get("la") * 20) / 20, lo = Math.round(+url.searchParams.get("lo") * 20) / 20;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 85 || Math.abs(lo) > 180) return bfJson({ error: "Ungültig" }, 400);
  try {
    if (url.pathname === "/bf/pp") return await bfPP(la, lo);
    if (url.pathname === "/bf/rq") return await bfRQ(la, lo, env);
    if (url.pathname === "/bf/ki") return new Response(await bfKI(la, lo, { tfetch }, env.GM), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=1800" } });
    if (url.pathname === "/bf/sk") {
      const models = String(url.searchParams.get("m") || "").split(",").filter((m) => BF_MOD.test(m)).slice(0, 10);
      if (!models.length) return bfJson({ error: "Ungültig" }, 400);
      return await bfSK(la, lo, models, url.searchParams.get("g") === "1", env);
    }
  } catch (e) { return bfJson({ error: String((e && e.message) || e).slice(0, 80) }, 502); }
  return bfJson({ error: "Nicht gefunden" }, 404);
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return secure(await api(req, env, url), { "Cache-Control": "no-store" });
      if (url.pathname === "/pre") return secure(await preServe(req, env));
      if (url.pathname === "/tp/mv") { if (!(await valid(env, getCookie(req, COOKIE)))) return new Response("{}", { status: 401 }); return new Response((env.GM && (await env.GM.get("tp:mv"))) || "{}", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
      if (url.pathname === "/tp") return await tpServe(req, env, url);
      if (url.pathname.startsWith("/om/")) return secure(await omServe(req, env, url));
      if (url.pathname.startsWith("/bf/")) return secure(await bfServe(req, env, url));
      if (url.pathname === "/gm" || url.pathname.startsWith("/gm/") || url.pathname === "/gr" || url.pathname.startsWith("/gr/")) return secure(await gmServe(env, url));
      if (req.method !== "GET" && req.method !== "HEAD") return secure(new Response("Nicht erlaubt", { status: 405, headers: { Allow: "GET, HEAD" } }));
      if (url.pathname === "/wetter2.html" || url.pathname === "/Wetter" || url.pathname.startsWith("/Wetter/")) return Response.redirect(url.origin + "/" + url.search, 301);
      if (url.pathname === "/login.html" || url.pathname === "/login") return secure(Response.redirect(url.origin + "/" + url.hash, 302));
      if (PAGE.has(url.pathname) && !(await valid(env, getCookie(req, COOKIE)))) {
        const r = await env.ASSETS.fetch(new Request(url.origin + "/login", { headers: req.headers }));
        return secure(new Response(r.body, { status: 200, headers: r.headers }), { "Cache-Control": "no-store" });
      }
      return secure(await env.ASSETS.fetch(req));
    } catch (e) {
      return secure(new Response("Fehler: " + (e && e.message || e), { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(grRun(env).catch((e) => console.error("grRun", e && e.message)));
    /* das Wettermodell nur alle 10 Minuten */
    const mi = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
    /* Vorrechnen: Open-Meteo-Abfragen, die gebraucht werden, alle 5 Minuten rechtzeitig erneuern */
    if (mi % 5 === 2) ctx.waitUntil(omPrewarm(env).catch((e) => console.error("omPrewarm", e && e.message)));
    /* Daten der App (GeoSphere, Warnungen, DWD …) für die gebrauchten Orte erneuern */
    if (mi % 5 === 3) ctx.waitUntil(pcPrewarm(env).catch((e) => console.error("pcPrewarm", e && e.message)));
    /* Kartenbilder des Radars vorladen */
    if (mi % 5 === 1) ctx.waitUntil(tpPrewarm(env).catch((e) => console.error("tpPrewarm", e && e.message)));
    /* eigene Kurzvorhersage (Europa-Radar, Regenmesser, Blitze), sobald ein neues Messbild da ist */
    if (mi % 5 === 4) ctx.waitUntil(snRun(env, { tfetch, pngRGBA }).catch((e) => console.error("snRun", e && e.message)));
    if (mi % 10 === 0) ctx.waitUntil(gmRun(env).catch((e) => console.error("gmRun", e && e.message)));
  },
};
