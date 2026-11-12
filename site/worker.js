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
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return secure(await api(req, env, url), { "Cache-Control": "no-store" });
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
};
