// Wetter-Proxy: hält den Kachelmann-Schlüssel geheim, prüft die Anmeldung und verschickt Wetter-Benachrichtigungen.
// Einzurichten bei Cloudflare unter Workers & Pages. Variablen (Settings > Variables and Secrets):
//   ALLOWED_ORIGIN  (Text)    https://eliaspp9.github.io
//   LOGIN_USER      (Text)    dein Benutzername
//   LOGIN_PASS      (Secret)  dein Passwort
//   KACHELMANN_KEY  (Secret)  dein API-Schlüssel von Kachelmann
//   KEY_HEADER      (Text, optional)  Name des Schlüssel-Headers, Standard: X-API-Key
// Für Benachrichtigungen zusätzlich:
//   Bindung SUBS    (KV-Namespace, z. B. "wetter-push")
//   Cron-Trigger    */10 * * * *   (alle 10 Minuten)
const enc = new TextEncoder();
const API = "https://api.kachelmannwetter.com/v02/";
const SITE = "https://eliaspp9.github.io/Wetter/";
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

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

/* ---------- Web Push (RFC 8291 und RFC 8292) ---------- */
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
export async function encryptPush(payload, p256dh, authSecret, opt = {}) {
  const ua = unb64u(p256dh), auth = unb64u(authSecret);
  const as = opt.keyPair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, cat(enc.encode("WebPush: info\0"), ua, asPub, new Uint8Array([1])));
  const salt = opt.salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const data = cat(typeof payload === "string" ? enc.encode(payload) : payload, new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data));
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = 65;
  return cat(head, asPub, ct);
}
async function vapidKeys(env) {
  let v = await env.SUBS.get("vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    v = { priv: await crypto.subtle.exportKey("jwk", kp.privateKey), pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)) };
    await env.SUBS.put("vapid", JSON.stringify(v));
  }
  return v;
}
async function vapidHeader(env, endpoint) {
  const v = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(h + "." + c));
  return "vapid t=" + h + "." + c + "." + b64u(sig) + ", k=" + v.pub;
}
async function sendPush(env, sub, msg) {
  const body = await encryptPush(JSON.stringify(msg), sub.keys.p256dh, sub.keys.auth);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: await vapidHeader(env, sub.endpoint) },
    body,
  });
}

/* ---------- Prüfung alle 10 Minuten: Regen und Warnungen ---------- */
const AT_TYPES = { 1: "Sturm", 2: "Regen", 3: "Schnee", 4: "Glatteis", 5: "Gewitter", 6: "Hitze", 7: "Kälte" };
async function getJ(u) { const r = await fetch(u, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function rainSoon(lat, lon) {
  const j = await getJ("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&minutely_15=precipitation,snowfall&forecast_minutely_15=4&timezone=GMT");
  const m = j.minutely_15 || {}, P = m.precipitation || [], S = m.snowfall || [];
  const i = P.findIndex((x) => x != null && x >= 0.1);
  return { i, snow: i >= 0 && (S[i] || 0) * 0.7 >= P[i] * 0.5 };
}
async function warnings(lat, lon) {
  const out = [];
  let ok = true;
  const inBox = (b) => lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3];
  if (inBox([46.3, 49.1, 9.5, 17.2])) {
    try {
      const j = await getJ("https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=" + lon + "&lat=" + lat + "&lang=de");
      const arr = (j.properties && j.properties.warnings) || j.warnings || [];
      for (const w of arr) {
        const p = w.properties || w, r = p.rawinfo || {};
        const lvl = Number(p.warnstufeid || r.wlevel) || 1;
        out.push({ id: "at-" + (p.warnid || r.wid || (p.warntypid || r.wtype) + "-" + (p.begin || r.start)) + "-" + lvl, title: (AT_TYPES[p.warntypid || r.wtype] || "Wetter") + "warnung, Stufe " + ["Gelb", "Orange", "Rot", "Violett"][Math.min(4, lvl) - 1], body: String(p.text || p.meteotext || "").slice(0, 180) });
      }
    } catch (e) { ok = false; }
  }
  if (inBox([47.2, 55.1, 5.8, 15.1])) {
    try {
      const j = await getJ("https://api.brightsky.dev/alerts?lat=" + lat + "&lon=" + lon);
      for (const w of j.alerts || []) out.push({ id: "de-" + (w.alert_id || w.id), title: w.event_de || w.headline_de || "Wetterwarnung", body: String(w.headline_de || w.description_de || "").slice(0, 180) });
    } catch (e) { if (String(e.message) !== "404") ok = false; } // 404: Ort liegt nicht in Deutschland
  }
  return { list: out, ok };
}
async function runAlerts(env) {
  if (!env.SUBS) return;
  const list = await env.SUBS.list({ prefix: "sub:" });
  for (const k of list.keys) {
    const rec = await env.SUBS.get(k.name, "json");
    if (!rec || !rec.sub) continue;
    rec.st = rec.st || { rain: false, w: [] };
    const msgs = [];
    let changed = false;
    if (rec.rain) {
      try {
        const r = await rainSoon(rec.lat, rec.lon);
        if (r.i >= 0 && !rec.st.rain) {
          const what = r.snow ? "Schnee" : "Regen";
          msgs.push({ title: r.i === 0 ? (r.snow ? "Es beginnt zu schneien" : "Es beginnt zu regnen") : what + " in etwa " + r.i * 15 + " Minuten", body: (rec.name ? rec.name + ". " : "") + "Tippe für das Regenradar.", tag: "rain", url: SITE + "#sec-radar" });
          rec.st.rain = true; changed = true;
        } else if (r.i < 0 && rec.st.rain) { rec.st.rain = false; changed = true; }
      } catch (e) {}
    }
    if (rec.warn) {
      const res = await warnings(rec.lat, rec.lon), ws = res.list;
      const seen = rec.st.w || [];
      // Ist ein Warndienst gerade nicht erreichbar, bekannte Warnungen behalten (sonst käme dieselbe Warnung später noch einmal)
      const ids = res.ok ? ws.map((w) => w.id) : Array.from(new Set([...seen, ...ws.map((w) => w.id)]));
      for (const w of ws) if (!seen.includes(w.id)) msgs.push({ title: w.title, body: (rec.name ? rec.name + ": " : "") + w.body, tag: "warn-" + w.id, url: SITE + "#sec-warn" });
      if (ids.join() !== seen.join()) { rec.st.w = ids; changed = true; }
    }
    let gone = false;
    for (const m of msgs) {
      try { const res = await sendPush(env, rec.sub, m); if (res.status === 404 || res.status === 410) { gone = true; break; } } catch (e) {}
    }
    if (gone) await env.SUBS.delete(k.name);
    else if (changed) await env.SUBS.put(k.name, JSON.stringify(rec));
  }
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

    if (url.pathname === "/") return json({ ok: true, name: "wetter-proxy", version: "1.0", renew: true, push: !!env.SUBS });

    if (url.pathname === "/login" && req.method === "POST") {
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const u = await safeEq(String(b.user || "").toLowerCase(), env.LOGIN_USER.toLowerCase());
      const p = await safeEq(b.pass || "", env.LOGIN_PASS);
      if (u && p) return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 });
      await new Promise((r) => setTimeout(r, 1500));
      return json({ error: "Anmeldung fehlgeschlagen" }, 401);
    }

    // Anmeldung verlängern: ein noch gültiges Token bekommt wieder 30 Tage (z. B. für ein Tablet, das dauernd offen ist)
    if (url.pathname === "/renew" && req.method === "POST") {
      if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
      return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 });
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

    if (url.pathname.startsWith("/push/")) {
      if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
      if (!env.SUBS) return json({ error: "push-setup" }, 503);
      if (url.pathname === "/push/key") return json({ key: (await vapidKeys(env)).pub });
      if (req.method !== "POST") return json({ error: "Nicht gefunden" }, 404);
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const ep = (b.sub && b.sub.endpoint) || b.endpoint || "";
      if (!/^https:\/\//.test(ep)) return json({ error: "Ungültig" }, 400);
      const id = "sub:" + b64u(await sha(ep)).slice(0, 32);
      if (url.pathname === "/push/sub") {
        const s = b.sub;
        if (!s || !s.keys || !s.keys.p256dh || !s.keys.auth) return json({ error: "Ungültig" }, 400);
        const lat = Number(b.lat), lon = Number(b.lon);
        if (!isFinite(lat) || !isFinite(lon)) return json({ error: "Ungültig" }, 400);
        const old = await env.SUBS.get(id, "json");
        await env.SUBS.put(id, JSON.stringify({ sub: { endpoint: ep, keys: s.keys }, lat: +lat.toFixed(3), lon: +lon.toFixed(3), name: String(b.name || "").slice(0, 60), rain: !!b.rain, warn: !!b.warn, st: (old && old.st) || { rain: false, w: [] } }));
        return json({ ok: true });
      }
      if (url.pathname === "/push/unsub") { await env.SUBS.delete(id); return json({ ok: true }); }
      if (url.pathname === "/push/test") {
        const rec = await env.SUBS.get(id, "json");
        if (!rec) return json({ error: "Nicht angemeldet für Benachrichtigungen" }, 404);
        const r = await sendPush(env, rec.sub, { title: "Wetter", body: "Test: Benachrichtigungen funktionieren.", tag: "test", url: SITE });
        return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502);
      }
    }
    return json({ error: "Nicht gefunden" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlerts(env));
  },
};
