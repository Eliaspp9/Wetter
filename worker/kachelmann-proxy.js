// Wetter-Proxy: hält den Kachelmann-Schlüssel geheim und prüft Benutzername und Passwort auf dem Server.
// Einzurichten bei Cloudflare unter Workers & Pages. Variablen (Settings > Variables and Secrets):
//   ALLOWED_ORIGIN  (Text)    https://eliaspp9.github.io
//   LOGIN_USER      (Text)    dein Benutzername
//   LOGIN_PASS      (Secret)  dein Passwort
//   KACHELMANN_KEY  (Secret)  dein API-Schlüssel von Kachelmann
//   KEY_HEADER      (Text, optional)  Name des Schlüssel-Headers, Standard: X-API-Key
const enc = new TextEncoder();
const API = "https://api.kachelmannwetter.com/v02/";
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function sha(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function safeEq(a, b) {
  const x = await sha(String(a)), y = await sha(String(b));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function hmacKey(env) {
  const raw = await sha(env.LOGIN_PASS + "|" + env.KACHELMANN_KEY + "|wetter-proxy");
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(env, user) {
  const p = b64u(enc.encode(JSON.stringify({ u: user, exp: Date.now() + 30 * 86400000 })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(p));
  return p + "." + b64u(sig);
}
async function checkToken(env, req) {
  const m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.get("Authorization") || "");
  if (!m) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(m[2]), enc.encode(m[1]));
    if (!ok) return false;
    return JSON.parse(new TextDecoder().decode(unb64u(m[1]))).exp > Date.now();
  } catch (e) { return false; }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    const h = {
      "Access-Control-Allow-Origin": origin && origin === env.ALLOWED_ORIGIN ? origin : "null",
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (!env.KACHELMANN_KEY || !env.LOGIN_USER || !env.LOGIN_PASS || !env.ALLOWED_ORIGIN)
      return json({ error: "Der Worker ist noch nicht fertig eingerichtet (Variablen fehlen)." }, 500);
    const url = new URL(req.url);

    if (url.pathname === "/") return json({ ok: true, name: "wetter-proxy" });

    if (url.pathname === "/login" && req.method === "POST") {
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const u = await safeEq(String(b.user || "").toLowerCase(), env.LOGIN_USER.toLowerCase());
      const p = await safeEq(b.pass || "", env.LOGIN_PASS);
      if (u && p) return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 });
      await new Promise((r) => setTimeout(r, 1500));
      return json({ error: "Anmeldung fehlgeschlagen" }, 401);
    }

    if (url.pathname.startsWith("/k/") && req.method === "GET") {
      if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
      const path = url.pathname.slice(3);
      if (!/^[a-z0-9][a-z0-9_\-./,]*$/i.test(path) || path.includes("..")) return json({ error: "Ungültiger Pfad" }, 400);
      const r = await fetch(API + path + url.search, {
        headers: { [env.KEY_HEADER || "X-API-Key"]: env.KACHELMANN_KEY, Accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      return new Response(r.body, { status: r.status, headers: { ...h, "Content-Type": r.headers.get("Content-Type") || h["Content-Type"], "Cache-Control": "private, max-age=120" } });
    }
    return json({ error: "Nicht gefunden" }, 404);
  },
};
