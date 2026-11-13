/* Die Wetter-App bei Cloudflare (Worker "wetter", https://wetter.elias-ziegler.workers.dev).
   - Liefert die Dateien der App aus (ASSETS) und hängt Sicherheitsregeln an jede Antwort.
   - /api/… reicht er an den Worker wetter-proxy weiter (Service Binding PROXY): App und Worker unter EINER Adresse, so muss das
     Handy nicht vor jeder Anfrage erst nachfragen, ob es darf (keine CORS-Vorabanfragen).
   - Die App selbst (index.html) bekommt nur, wer angemeldet ist: Dafür setzt er bei Anmeldung und Verlängerung ein Cookie
     (HttpOnly, nur für diese Seite). Ohne gültiges Cookie kommt login.html. Geprüft wird das Token beim wetter-proxy (/auth). */
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
   danach alle 3 Stunden bis 2 Tage) und legt sie im KV-Speicher ab (gm:…, 3 Tage). Die App lädt sie dann in Sekunden:
   /gm = Liste {ref, t}, /gm/<ref>/<t> = ein Bild als NetCDF (offene Daten von GeoSphere, keine Anmeldung nötig). */
const GM_URL = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km",
  GM_Q = "?parameters=tp,sf&output_format=netcdf&bbox=45.50,8.10,49.48,17.74";
const isoM = (t) => new Date(t * 1000).toISOString().slice(0, 16);
async function tfetch(u, ms) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
  try { return await fetch(u, { signal: ac.signal }); } finally { clearTimeout(tm); }
}
function gmWanted(ref, now) {
  const end = Math.min(ref + 60 * 3600, now + 48 * 3600), out = [];
  for (let t = Math.ceil(now / 3600) * 3600 + 3600; t <= end; t += 3600) {
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
    const want = gmWanted(ref, now), have = new Set(nx.t), got = [];
    let n = 0;
    for (const t of want) {
      if (have.has(t)) continue;
      if (Date.now() - t0 > 7 * 60000 || n >= 6) break;
      try {
        const r = await tfetch(GM_URL + GM_Q + "&start=" + isoM(t) + "&end=" + isoM(t), 110000);
        if (!r.ok) { if (r.status === 429) break; continue; }
        const b = await r.arrayBuffer();
        if (b.byteLength < 2000) continue;
        got.push([t, b]);
        have.add(t); n++;
      } catch (e) { break; }
    }
    if (!n) return;
    /* alle neuen Bilder dieses Durchgangs in EINEM Eintrag (spart Schreibvorgänge): gm:b:<ref>:<erste Zeit>,
       wo welches Bild liegt, steht in nx.p[t] = [Schlüssel, Anfang, Länge] */
    {
      const key = "gm:b:" + ref + ":" + got[0][0], tot = got.reduce((a, x) => a + x[1].byteLength, 0), all = new Uint8Array(tot);
      let o = 0;
      nx.p = nx.p || {};
      for (const [t, b] of got) { all.set(new Uint8Array(b), o); nx.p[t] = [key, o, b.byteLength]; o += b.byteLength; }
      await kv.put(key, all, { expirationTtl: 3 * 86400 });
    }
    nx.t = [...have].filter((t) => t > now - 3600).sort((a, b) => a - b);
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
/* Radar Österreich (INCA-Nowcast von GeoSphere), ebenso vorab geholt: alle 5 Minuten wird nachgesehen, ob es einen neuen
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
  let ref;
  try { const r = await tfetch(GR_URL + "/metadata?t=" + Math.floor(Date.now() / 60000), 60000), j = await r.json(); ref = Date.parse(j.last_forecast_reftime) / 1000; } catch (e) { return; }
  if (!ref) return;
  const ix = JSON.parse((await kv.get("gr:idx")) || "null") || { ref: 0, a: [], t2: 0 };
  if (ref <= ix.ref) return;
  const opt = { expirationTtl: 3 * 3600 }, q = "&start=" + isoM(ref);
  const rr = await grGet(GR_URL + "?parameters=rr" + GR_BB + q, 150000);
  await kv.put("gr:rr:" + ref, rr, opt);
  let a = null, t2 = null;
  try { a = await grGet(GR_URL + "?parameters=rr" + GR_BB + q + "&end=" + isoM(ref), 90000); await kv.put("gr:a:" + ref, a, opt); } catch (e) {}
  if (ref - (ix.t2 || 0) >= 3300) { try { t2 = await grGet(GR_URL + "?parameters=t2m" + GR_BB + q + "&end=" + isoM(ref), 90000); await kv.put("gr:t:" + ref, t2, opt); } catch (e) {} }
  const now = Date.now() / 1000;
  await kv.put("gr:idx", JSON.stringify({ ref, at: Math.round(now), a: [...(ix.a || []), ...(a ? [ref] : [])].filter((t) => t > now - 2.5 * 3600).slice(-8), t2: t2 ? ref : ix.t2 || 0 }));
}
async function gmServe(env, url) {
  const kv = env.GM;
  if (!kv) return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/gm" || url.pathname === "/gr") {
    const ix = (await kv.get(url.pathname.slice(1) + ":idx")) || "{}";
    return new Response(ix, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const m = url.pathname.match(/^\/gm\/(\d{9,11})\/(\d{9,11})$/), g = url.pathname.match(/^\/gr\/(rr|a|t)\/(\d{9,11})$/);
  if (!m && !g) return new Response("Nicht gefunden", { status: 404 });
  if (m) {
    /* gebündelt (siehe gmRun), sonst der alte Einzeleintrag */
    for (const ik of ["gm:idx", "gm:nx"]) {
      const ix = JSON.parse((await kv.get(ik)) || "null"), e = ix && String(ix.ref) === m[1] && ix.p && ix.p[m[2]];
      if (!e) continue;
      const all = await kv.get(e[0], { type: "arrayBuffer" });
      if (all && all.byteLength >= e[1] + e[2]) return new Response(all.slice(e[1], e[1] + e[2]), { headers: { "Content-Type": "application/x-netcdf", "Cache-Control": "private, max-age=86400, immutable" } });
    }
  }
  const b = await kv.get(m ? "gm:" + m[1] + ":" + m[2] : "gr:" + g[1] + ":" + g[2], { type: "arrayBuffer" });
  if (!b) return new Response("Nicht gefunden", { status: 404 });
  return new Response(b, { headers: { "Content-Type": "application/x-netcdf", "Cache-Control": "private, max-age=86400, immutable" } });
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
async function gs1Past(S) {
  const now = Math.floor(Date.now() / 3600000) * 3600, ll = S.map((o) => "&lat_lon=" + o.la.toFixed(4) + "," + o.lo.toFixed(4)).join("");
  const one = async (o) => {
    try {
      const r = await tfetch(GS1_URL + "?parameters=2t,10u,10v&output_format=geojson&forecast_offset=" + o + "&start=" + isoM(now - o * 3 * 3600) + ll, 22000);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  };
  return (await Promise.all([one(2), one(5)])).filter((j) => j && Array.isArray(j.timestamps) && Array.isArray(j.features));
}
async function bfSK(la, lo, models, g) {
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
    o.ob.push({ t: x.obsTime, T: typeof x.temp === "number" ? x.temp : null, W: typeof x.wspd === "number" ? x.wspd * 1.852 : null, R: /(^|\s)[-+]?(VC)?(SH|TS)?(RA|DZ|SN|SG|PL|GR|GS)/.test(String(x.wxString || "")) });
  }
  const S = [...st.values()].filter((o) => o.ob.length >= 20 && o.h != null).sort((x, y) => x.d - y.d).slice(0, 3);
  if (!S.length) return bfJson({ n: 0, st: [] });
  const r = await tfetch("https://api.open-meteo.com/v1/forecast?latitude=" + S.map((o) => o.la.toFixed(3)).join(",") + "&longitude=" + S.map((o) => o.lo.toFixed(3)).join(",") +
    "&elevation=" + S.map((o) => Math.round(o.h)).join(",") + "&past_days=2&forecast_days=1&hourly=temperature_2m,wind_speed_10m,precipitation&models=" + models.join(",") + "&timezone=GMT&timeformat=unixtime", 15000);
  if (!r.ok) return bfJson({ error: "forecast " + r.status }, 502);
  let L = await r.json();
  if (!Array.isArray(L)) L = [L];
  const now = Date.now() / 1000, acc = {};
  models.forEach((m) => (acc[m] = { tE: 0, tN: 0, wE: 0, wN: 0, rE: 0, rN: 0 }));
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
        if (T != null && ob.T != null) { q.tE += Math.abs(T - ob.T); q.tN++; }
        if (W != null && ob.W != null) { q.wE += Math.abs(W - ob.W); q.wN++; }
        if (P != null) { q.rN++; if ((P >= 0.1) !== ob.R) q.rE++; }
      }
    }
  });
  const all = models.slice();
  if (g) {
    const P = await gs1Past(S), q = (acc[GS1] = { tE: 0, tN: 0, wE: 0, wN: 0, rE: 0, rN: 0, tB: 0 });
    for (const j of P) {
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
        }
      });
    }
    all.push(GS1);
  }
  const out = { t: {}, w: {}, r: {}, e: {}, b: {}, n: 0, st: S.map((o) => o.id) };
  for (const m of all) {
    const q = acc[m];
    if (q.tN >= 20 && q.tB != null) out.b[m] = Math.round((q.tB / q.tN) * 100) / 100;
    if (q.tN >= 20) { out.e[m] = Math.round((q.tE / q.tN) * 100) / 100; out.t[m] = 1 / Math.pow(q.tE / q.tN + 0.3, 2); out.n = Math.max(out.n, q.tN); }
    if (q.wN >= 20) out.w[m] = 1 / Math.pow(q.wE / q.wN + 1.5, 2);
    if (q.rN >= 20) out.r[m] = Math.round((1 - q.rE / q.rN) * 1000) / 1000;
  }
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
async function omServe(req, env, url) {
  if (!(await valid(env, getCookie(req, COOKIE)))) return bfJson({ error: "Nicht angemeldet" }, 401);
  const m = /^\/om\/([a-z.-]+)(\/[A-Za-z0-9_\/.-]*)$/.exec(url.pathname);
  if (!m || !OM_HOSTS.has(m[1]) || req.method !== "GET") return bfJson({ error: "Ungültig" }, 400);
  try {
    const r = await tfetch("https://" + m[1] + m[2] + url.search, 25000);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
  } catch (e) { return bfJson({ error: "Open-Meteo nicht erreichbar" }, 502); }
}
async function bfServe(req, env, url) {
  if (!(await valid(env, getCookie(req, COOKIE)))) return bfJson({ error: "Nicht angemeldet" }, 401);
  if (url.pathname === "/bf/log" && req.method === "POST") { try { const b = await req.json(); console.log("APPFEHLER", JSON.stringify(b).slice(0, 1600)); } catch (e) {} return bfJson({ ok: 1 }); }
  if (url.pathname === "/bf/tip" && req.method === "POST") { try { return await bfTip(req, env); } catch (e) { return bfJson({ t: [] }); } }
  const la = Math.round(+url.searchParams.get("la") * 20) / 20, lo = Math.round(+url.searchParams.get("lo") * 20) / 20;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 85 || Math.abs(lo) > 180) return bfJson({ error: "Ungültig" }, 400);
  try {
    if (url.pathname === "/bf/pp") return await bfPP(la, lo);
    if (url.pathname === "/bf/sk") {
      const models = String(url.searchParams.get("m") || "").split(",").filter((m) => BF_MOD.test(m)).slice(0, 6);
      if (!models.length) return bfJson({ error: "Ungültig" }, 400);
      return await bfSK(la, lo, models, url.searchParams.get("g") === "1");
    }
  } catch (e) { return bfJson({ error: String((e && e.message) || e).slice(0, 80) }, 502); }
  return bfJson({ error: "Nicht gefunden" }, 404);
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return secure(await api(req, env, url), { "Cache-Control": "no-store" });
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
    if (new Date(event.scheduledTime || Date.now()).getUTCMinutes() % 10 < 5) ctx.waitUntil(gmRun(env).catch((e) => console.error("gmRun", e && e.message)));
  },
};
