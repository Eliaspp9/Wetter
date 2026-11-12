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
    const want = gmWanted(ref, now), have = new Set(nx.t);
    let n = 0;
    for (const t of want) {
      if (have.has(t)) continue;
      if (Date.now() - t0 > 7 * 60000 || n >= 6) break;
      try {
        const r = await tfetch(GM_URL + GM_Q + "&start=" + isoM(t) + "&end=" + isoM(t), 110000);
        if (!r.ok) { if (r.status === 429) break; continue; }
        const b = await r.arrayBuffer();
        if (b.byteLength < 2000) continue;
        await kv.put("gm:" + ref + ":" + t, b, { expirationTtl: 3 * 86400 });
        have.add(t); n++;
      } catch (e) { break; }
    }
    if (!n) return;
    nx.t = [...have].filter((t) => t > now - 3600).sort((a, b) => a - b);
    if (nx === ix) await kv.put("gm:idx", JSON.stringify(nx));
    else {
      /* neuer Modelllauf: erst zeigen, wenn die nächsten 12 Stunden da sind; bis dahin bleibt der alte */
      const first = want.filter((t) => t <= now + 12 * 3600);
      if (first.every((t) => have.has(t)) || !ix.ref || ix.ref < ref - 9 * 3600) { await kv.put("gm:idx", JSON.stringify(nx)); await kv.delete("gm:nx"); }
      else await kv.put("gm:nx", JSON.stringify(nx));
    }
  }
}
async function gmServe(env, url) {
  const kv = env.GM;
  if (!kv) return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
  if (url.pathname === "/gm") {
    const ix = (await kv.get("gm:idx")) || "{}";
    return new Response(ix, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const m = url.pathname.match(/^\/gm\/(\d{9,11})\/(\d{9,11})$/);
  if (!m) return new Response("Nicht gefunden", { status: 404 });
  const b = await kv.get("gm:" + m[1] + ":" + m[2], { type: "arrayBuffer" });
  if (!b) return new Response("Nicht gefunden", { status: 404 });
  return new Response(b, { headers: { "Content-Type": "application/x-netcdf", "Cache-Control": "private, max-age=86400, immutable" } });
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return secure(await api(req, env, url), { "Cache-Control": "no-store" });
      if (url.pathname === "/gm" || url.pathname.startsWith("/gm/")) return secure(await gmServe(env, url));
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
    ctx.waitUntil(gmRun(env).catch((e) => console.error("gmRun", e && e.message)));
  },
};
