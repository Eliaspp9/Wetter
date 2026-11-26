// Wetter-Proxy 1.0 (Build 5): hält den Kachelmann-Schlüssel geheim, prüft die Anmeldung, verschickt Wetter-Benachrichtigungen
// und lernt jede Stunde, wie weit die Vorhersage an deinen Orten danebenliegt (lernende Korrektur).
// Einzurichten bei Cloudflare unter Workers & Pages. Variablen (Settings > Variables and Secrets):
//   ALLOWED_ORIGIN  (Text)    https://eliaspp9.github.io (mehrere mit Komma getrennt; die Adresse bei Cloudflare gilt immer)
//   LOGIN_USER      (Text)    dein Benutzername
//   LOGIN_PASS      (Secret)  dein Passwort
//   KACHELMANN_KEY  (Secret)  dein API-Schlüssel von Kachelmann
//   KEY_HEADER      (Text, optional)  Name des Schlüssel-Headers, Standard: X-API-Key
// Für Benachrichtigungen zusätzlich:
//   Bindung SUBS    (KV-Namespace, z. B. "wetter-push")
//   Cron-Trigger    */5 * * * *    (alle 5 Minuten)
// Für die KI (Übersetzen der Warnungen anderer Länder, Push-Texte in ganzen Sätzen), ab Version 1.6:
//   Bindung AI      (Workers AI, Variablenname AI). Ohne sie läuft alles wie vorher, nur ohne KI.
const enc = new TextEncoder();
const VERSION = "1.0", BUILD = 11;
/* Abrufe mit Zeitlimit: ein hängender Dienst soll weder eine Anfrage noch den Zeitplan aufhalten.
   tf: Limit bis die Antwort beginnt (für durchgereichte Antworten); jf: Limit bis das JSON ganz gelesen ist. */
async function tf(u, o, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000);
  try { return await fetch(u, Object.assign({ signal: c.signal }, o || {})); } finally { clearTimeout(t); }
}
async function jf(u, o, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000);
  try { const r = await fetch(u, Object.assign({ signal: c.signal }, o || {})); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
const MA_SLUGS = new Set(["austria", "belgium", "bosnia-herzegovina", "bulgaria", "croatia", "cyprus", "czechia", "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "iceland", "ireland", "israel", "italy", "latvia", "lithuania", "luxembourg", "malta", "moldova", "montenegro", "netherlands", "republic-of-north-macedonia", "norway", "poland", "portugal", "romania", "serbia", "slovakia", "slovenia", "spain", "sweden", "switzerland", "ukraine", "united-kingdom"]);
const API = "https://api.kachelmannwetter.com/v02/";
// Bewölkung einer Flughafen-Meldung in Prozent (höchste Schicht zählt); null, wenn nichts gemeldet ist
const MCV = { SKC: 0, CLR: 0, NCD: 0, NSC: 0, CAVOK: 0, FEW: 20, SCT: 45, BKN: 75, OVC: 100, OVX: 100, VV: 100 };
function metarCover(x) {
  const c = (Array.isArray(x.clouds) ? x.clouds : []).map((l) => MCV[l && l.cover]).filter((v) => v != null);
  if (c.length) return Math.max(...c);
  return /\bCAVOK\b|\bSKC\b|\bCLR\b|\bNCD\b|\bNSC\b/.test(String(x.rawOb || "")) ? 0 : null;
}
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

/* Von welchen Seiten die App den Worker benutzen darf: die eingetragene(n) Adresse(n) und die App bei Cloudflare (seit 12.11.2026) */
const APP_ORIGINS = ["https://wetter.elias-ziegler.workers.dev"];
function allowedOrigin(env, origin) {
  if (APP_ORIGINS.includes(origin)) return true;
  return String(env.ALLOWED_ORIGIN || "").split(",").some((o) => o.trim() === origin);
}

/* ---------- Schutz gegen Passwort-Raten ----------
   Pro IP-Adresse höchstens 5 falsche Anmeldungen in 15 Minuten, von allen zusammen höchstens 30: danach wird 15 Minuten lang
   jede neue Anmeldung abgelehnt. Nach 100 Fehlversuchen an einem Tag (UTC) gilt die Sperre 6 Stunden.
   Schon angemeldete Geräte merken davon nichts (sie haben ein Token).
   - Je IP-Adresse wird im Arbeitsspeicher des Workers gezählt (kein Schreibvorgang).
   - Die Zahl für alle zusammen steht zusätzlich im KV-Speicher SUBS (Schlüssel rl:g). So übersteht sie einen Neustart des
     Workers und gilt an allen Standorten. Das kostet einen Schreibvorgang je Fehlversuch, wegen der Tagesgrenze aber
     höchstens etwa 100 am Tag. (Bis 1.6 waren es zwei je Fehlversuch ohne Tagesgrenze: Damit ließ sich von außen das
     Tageslimit des Speichers von 1000 Schreibvorgängen aufbrauchen, Lernen und Benachrichtigungen wären ausgefallen.)
   - Jeder Versuch wird sofort mitgezählt, noch bevor das Passwort geprüft ist, und bei Erfolg wieder abgezogen.
     So kommen auch viele gleichzeitige Versuche nicht über die Grenze. */
const RL_WIN = 15 * 60 * 1000, RL_IP = 5, RL_ALL = 30, RL_DAY = 100, RL_LONG = 6 * 3600 * 1000, mem = new Map();
/* Stand für alle zusammen: win = laufendes 15-Minuten-Fenster, base = gespeicherte Fehlversuche darin, own = noch nicht
   gespeicherte Versuche dieses Workers, day/w = Schreibvorgänge heute, lock = gesperrt bis (Millisekunden) */
const rl = { win: 0, base: 0, own: 0, day: 0, w: 0, lock: 0 };
function memList(k, now) { const a = (mem.get(k) || []).filter((t) => now - t < RL_WIN); mem.set(k, a); return a; }
function rlRoll(now) {
  const win = Math.floor(now / RL_WIN), day = Math.floor(now / 86400000);
  if (rl.win !== win) { rl.win = win; rl.base = 0; rl.own = 0; }
  if (rl.day !== day) { rl.day = day; rl.w = 0; }
}
/* gespeicherten Stand dazunehmen (Neustart, andere Standorte); false, wenn der Speicher nicht lesbar war */
async function rlLoad(env) {
  let st = null, ok = true;
  if (env.SUBS) {
    try { const raw = await env.SUBS.get("rl:g"); if (raw) { try { st = JSON.parse(raw); } catch (e) {} } } catch (e) { ok = false; }
  }
  const now = Date.now();
  rlRoll(now);
  if (st && typeof st === "object") {
    const lock = Math.min(+st.lock || 0, now + RL_LONG);
    if (lock > rl.lock) rl.lock = lock;
    if (+st.win === rl.win && +st.n > rl.base) rl.base = Math.min(+st.n, RL_ALL);
    if (+st.day === rl.day && +st.w > rl.w) rl.w = Math.min(+st.w, RL_DAY);
  }
  return ok;
}
/* Versuch anmelden. 0 = gesperrt, sonst eine Marke (zum Zurücknehmen bei Erfolg) */
function rlTake(ip) {
  const now = Date.now();
  rlRoll(now);
  if (rl.lock > now) return 0;
  if (mem.size > 5000) mem.clear();
  const l = memList("ip:" + ip, now);
  if (l.length >= RL_IP || rl.base + rl.own >= RL_ALL) return 0;
  l.push(now); rl.own++;
  return now;
}
/* es war kein Fehlversuch (richtiges Passwort oder unbrauchbare Anfrage) */
function rlUndo(ip, mark) {
  const l = mem.get("ip:" + ip), i = l ? l.lastIndexOf(mark) : -1;
  if (i >= 0) l.splice(i, 1);
  if (rl.own > 0) rl.own--;
}
/* Fehlversuch festhalten */
async function rlSave(env) {
  const ok = await rlLoad(env);
  if (!rl.own) return;            // eine gleichzeitige Anfrage hat ihn schon mitgespeichert
  const now = Date.now();
  rl.base += rl.own; rl.own = 0; rl.w++;
  if (rl.base >= RL_ALL) rl.lock = Math.max(rl.lock, now + RL_WIN);
  if (rl.w >= RL_DAY) rl.lock = Math.max(rl.lock, now + RL_LONG);
  if (!env.SUBS || !ok) return;   // Speicher gerade nicht lesbar: nichts überschreiben, es zählt der Arbeitsspeicher
  try { await env.SUBS.put("rl:g", JSON.stringify({ win: rl.win, n: rl.base, day: rl.day, w: rl.w, lock: rl.lock }), { expirationTtl: 2 * 86400 }); } catch (e) {}
}

/* ---------- Web Push (RFC 8291 und RFC 8292) ---------- */
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
async function encryptPush(payload, p256dh, authSecret, opt = {}) {
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
  return tf(sub.endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: await vapidHeader(env, sub.endpoint) },
    body,
  }, 10000);
}

/* ---------- Lernende Korrektur (läuft für immer) ----------
   Jede Stunde vergleicht der Worker für deine Orte (höchstens 6, die du in der App öffnest), was ECMWF (Vorlauf 0 bis 7 Tage)
   und Kachelmann (die Vorhersage, die die App zuletzt geschickt hat) für diese Stunde vorhergesagt haben, mit der Temperatur,
   die die Messstationen in der Nähe ergeben. Daraus lernt er, wie weit die Vorhersage dort je nach Tageszeit, Bewölkung, Wind
   und Vorlaufzeit danebenliegt (lineares Modell, das sich mit jeder Stunde ein Stück anpasst: NLMS). Er vergisst langsam,
   lernt also auch neue Jahreszeiten. Gespeichert wird im KV-Speicher SUBS: je Ort ein Eintrag kl:p:<id>, Kachelmann-Vorhersage kl:s:<id>. */
const KL_MAX = 15, KL_MU = 0.06, KL_A = 0.01;
const klDist = (a, b, c, d) => Math.hypot((a - c) * 111.2, (b - d) * 111.2 * Math.cos((a * Math.PI) / 180));
// Merkmale (gleich wie in der App): Grundwert, Tageszeit (8 × 3 h), Bewölkung (3), Vorlauf (ECMWF 5 / Kachelmann 3), Windstille
function klX(m, hour, cloud, wind, leadH) {
  const nl = m === "ec" ? 5 : 3, x = new Array(1 + 8 + 3 + nl + 1).fill(0);
  x[0] = 1;
  x[1 + (Math.floor(((hour % 24) + 24) % 24 / 3) % 8)] = 1;
  x[9 + (cloud == null ? 1 : cloud < 30 ? 0 : cloud < 75 ? 1 : 2)] = 1;
  const lb = m === "ec" ? (leadH < 24 ? 0 : leadH < 48 ? 1 : leadH < 72 ? 2 : leadH < 120 ? 3 : 4) : (leadH < 6 ? 0 : leadH < 24 ? 1 : 2);
  x[12 + lb] = 1;
  if (wind != null && wind < 7) x[12 + nl] = 1;
  return x;
}
function klLearn(L, x, y) {
  if (!L.w || L.w.length !== x.length) { L.w = new Array(x.length).fill(0); L.n = 0; L.er = null; L.ec = null; }
  if (!isFinite(y) || Math.abs(y) > 15) return;
  let p = 0, xx = 0;
  for (let i = 0; i < x.length; i++) { p += L.w[i] * x[i]; xx += x[i] * x[i]; }
  p = Math.max(-6, Math.min(6, p));
  // Fehler ohne und mit Korrektur (vor dem Lernschritt gemessen, also ehrlich), gleitend gemittelt
  L.er = L.er == null ? Math.abs(y) : (1 - KL_A) * L.er + KL_A * Math.abs(y);
  L.ec = L.ec == null ? Math.abs(y - p) : (1 - KL_A) * L.ec + KL_A * Math.abs(y - p);
  const e = y - p;
  for (let i = 0; i < x.length; i++) L.w[i] += (KL_MU * e * x[i]) / xx;
  L.n = (L.n || 0) + 1;
}
const klR = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const klJ = (u) => jf(u, { headers: { Accept: "application/json", "User-Agent": "wetter-proxy (eliaspp9.github.io)" } }, 20000);
/* alle Orte der lernenden Korrektur (parallel gelesen) */
async function klAll(env) {
  const list = await env.SUBS.list({ prefix: "kl:p:" });
  return (await Promise.all(list.keys.map((k) => env.SUBS.get(k.name, "json").catch(() => null)))).filter((p) => p && p.id);
}
/* Ort zu einer Position: zuerst der direkte Treffer (ein Lesevorgang), sonst der nächste Ort innerhalb von maxKm */
async function klNear(env, la, lo, maxKm) {
  const d = await env.SUBS.get("kl:p:" + klId(la, lo), "json");
  if (d && d.id) return d;
  let best = null, bd = maxKm;
  for (const p of await klAll(env)) { const x = klDist(la, lo, p.la, p.lo); if (x < bd) { bd = x; best = p; } }
  return best;
}
// Messstationen bis 30 km um einen Ort aussuchen (einmal beim Anmelden des Orts)
async function klStations(la, lo) {
  const st = [], add = (s) => { if (st.length < 3 && !st.some((x) => klDist(x.la, x.lo, s.la, s.lo) < 1)) st.push(s); };
  const inB = (b) => la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3];
  if (inB([46.3, 49.1, 9.5, 17.2])) {
    try {
      const m = await klJ("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata");
      (m.stations || []).filter((s) => s.is_active !== false && s.altitude != null).map((s) => ({ k: "at", id: String(s.id), la: +s.lat, lo: +s.lon, h: +s.altitude, d: klDist(la, lo, +s.lat, +s.lon) }))
        .filter((s) => s.d <= 30).sort((a, b) => a.d - b.d).slice(0, 3).forEach(add);
    } catch (e) {}
  }
  if (st.length < 3 && inB([47.2, 55.1, 5.8, 15.1])) {
    try {
      const j = await klJ("https://api.brightsky.dev/sources?lat=" + la + "&lon=" + lo + "&max_dist=30000");
      (j.sources || []).filter((s) => (s.observation_type === "synop" || s.observation_type === "current") && s.wmo_station_id && s.height != null && s.last_record && Date.now() - Date.parse(s.last_record) < 3 * 3600000)
        .sort((a, b) => a.distance - b.distance).slice(0, 4).forEach((s) => { if (st.filter((x) => x.k === "de").length < 2) add({ k: "de", id: String(s.wmo_station_id), la: +s.lat, lo: +s.lon, h: +s.height, d: klDist(la, lo, +s.lat, +s.lon) }); });
    } catch (e) {}
  }
  if (st.length < 2 && inB([18, 72, -170, -60])) {
    try {
      const p = await klJ("https://api.weather.gov/points/" + la.toFixed(4) + "," + lo.toFixed(4)), u = p.properties && p.properties.observationStations;
      if (u && /^https:\/\/api\.weather\.gov\//.test(u)) {
        const s = await klJ(u);
        (s.features || []).slice(0, 6).map((f) => { const c = (f.geometry || {}).coordinates || [], q = f.properties || {}; return { k: "us", id: String(q.stationIdentifier || ""), la: +c[1], lo: +c[0], h: q.elevation && q.elevation.value != null ? +q.elevation.value : null }; })
          .filter((s) => /^[A-Z0-9]{3,6}$/.test(s.id) && s.h != null).map((s) => Object.assign(s, { d: klDist(la, lo, s.la, s.lo) })).filter((s) => s.d <= 30).slice(0, 2).forEach(add);
      }
    } catch (e) {}
  }
  if (st.length < 2) {
    try {
      const d = 0.3, dl = 0.3 / Math.max(0.2, Math.cos((la * Math.PI) / 180));
      const a = await klJ("https://aviationweather.gov/api/data/metar?format=json&bbox=" + [la - d, lo - dl, la + d, lo + dl].map((v) => v.toFixed(2)).join(","));
      (Array.isArray(a) ? a : []).filter((x) => x && x.icaoId && typeof x.lat === "number" && typeof x.elev === "number").map((x) => ({ k: "mt", id: String(x.icaoId).slice(0, 6), la: x.lat, lo: x.lon, h: x.elev, d: klDist(la, lo, x.lat, x.lon) }))
        .filter((s) => s.d <= 30 && /^[A-Z0-9]{3,6}$/.test(s.id)).sort((a, b) => a.d - b.d).forEach(add);
    } catch (e) {}
  }
  return st;
}
// Sonnenhöhe in Grad (für „tagsüber“ und die Strahlung bei klarem Himmel)
function sunElev(la, lo, t) {
  const d = t / 86400000 - 10957.5, g = (357.529 + 0.98560028 * d) * Math.PI / 180, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 0.00000036 * d) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, ha = ((gmst * 15 + lo) * Math.PI / 180) - ra, f = la * Math.PI / 180;
  return Math.asin(Math.sin(f) * Math.sin(dec) + Math.cos(f) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
}
const WET = /(^|\s)[-+]?(VC)?(RA|SN|DZ|SH|GR|GS|PL|SG|UP|TS)/;
// Messwerte aller Stationen; Schlüssel k:id → { T °C, W Wind km/h, G Böe km/h, R Niederschlag letzte Stunde mm, wet ja/nein, C Bewölkung % }
async function klObs(places) {
  const out = {}, all = places.flatMap((p) => p.st || []), set = (k, o) => { out[k] = Object.assign(out[k] || {}, o); };
  const at = [...new Set(all.filter((s) => s.k === "at").map((s) => s.id))], mt = [...new Set(all.filter((s) => s.k === "mt").map((s) => s.id))];
  const de = [...new Set(all.filter((s) => s.k === "de").map((s) => s.id))].slice(0, 8), us = [...new Set(all.filter((s) => s.k === "us").map((s) => s.id))].slice(0, 6);
  const stOf = Object.fromEntries(all.map((s) => [s.k + ":" + s.id, s]));
  const jobs = [], fresh = (t, m) => Date.now() - t < m * 60000;
  if (at.length) {
    jobs.push(klJ("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=TL,FF,FFX,SO,GLOW&station_ids=" + at.join(",")).then((j) => {
      const ts = (j.timestamps || []).map((t) => Date.parse(t));
      (j.features || []).forEach((f) => {
        const p = f.properties || {}, P = p.parameters || {}, last = (k) => { const d = P[k] && P[k].data; if (!d) return null; for (let i = d.length - 1; i >= 0; i--) if (d[i] != null) return fresh(ts[i], 45) ? +d[i] : null; return null; };
        const key = "at:" + p.station, s = stOf[key], o = { T: last("TL") }, ff = last("FF"), fx = last("FFX"), so = last("SO"), gl = last("GLOW");
        if (ff != null) o.W = ff * 3.6; if (fx != null) o.G = fx * 3.6;
        if (s && so != null) {
          const h = sunElev(s.la, s.lo, Date.now());
          if (h >= 10) { const sh = Math.sin(h * Math.PI / 180), kt = gl != null ? gl / (1098 * sh * Math.exp(-0.057 / sh)) : null;
            o.C = so >= 300 ? 15 : kt != null && kt < 0.3 ? 95 : kt != null && kt < 0.55 ? 75 : so > 0 ? 40 : null; }
        }
        set(key, o);
      });
    }).catch(() => {}));
    const iso = (t) => new Date(t).toISOString().slice(0, 16);
    jobs.push(klJ("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?parameters=RR&station_ids=" + at.join(",") + "&start=" + iso(Date.now() - 70 * 60000) + "&end=" + iso(Date.now())).then((j) => {
      (j.features || []).forEach((f) => { const p = f.properties || {}, d = p.parameters && p.parameters.RR && p.parameters.RR.data; if (!d) return;
        const v = d.slice(-6).filter((x) => x != null); if (v.length >= 4) { const R = v.reduce((a, b) => a + b, 0); set("at:" + p.station, { R, wet: R >= 0.1 }); } });
    }).catch(() => {}));
  }
  if (mt.length) jobs.push(klJ("https://aviationweather.gov/api/data/metar?format=json&ids=" + mt.join(",")).then((a) => {
    (Array.isArray(a) ? a : []).forEach((x) => { if (!x || Date.now() / 1000 - x.obsTime >= 5400 || out["mt:" + x.icaoId]) return;
      const o = {}; if (typeof x.temp === "number") o.T = x.temp; if (typeof x.wspd === "number") o.W = x.wspd * 1.852; if (typeof x.wgst === "number") o.G = x.wgst * 1.852;
      o.wet = WET.test(String(x.wxString || "")); const c = metarCover(x); if (c != null) o.C = c; set("mt:" + x.icaoId, o); });
  }).catch(() => {}));
  de.forEach((id) => jobs.push(klJ("https://api.brightsky.dev/current_weather?wmo_station_id=" + id).then((j) => { const w = j.weather; if (!w || !fresh(Date.parse(w.timestamp), 90)) return;
    const o = {}; if (w.temperature != null) o.T = +w.temperature; if (w.wind_speed_10 != null) o.W = +w.wind_speed_10; if (w.wind_gust_speed_10 != null) o.G = +w.wind_gust_speed_10;
    if (w.precipitation_60 != null) { o.R = +w.precipitation_60; o.wet = o.R >= 0.1; } if (w.cloud_cover != null) o.C = +w.cloud_cover; set("de:" + id, o); }).catch(() => {})));
  us.forEach((id) => jobs.push(klJ("https://api.weather.gov/stations/" + id + "/observations/latest").then((j) => { const q = j.properties || {}; if (!fresh(Date.parse(q.timestamp), 90)) return;
    const v = (x) => (x && x.value != null ? +x.value : null), o = {}; if (v(q.temperature) != null) o.T = v(q.temperature);
    if (v(q.windSpeed) != null) o.W = v(q.windSpeed); if (v(q.windGust) != null) o.G = v(q.windGust);
    if (q.precipitationLastHour) { const R = v(q.precipitationLastHour); if (R != null) { o.R = R; o.wet = R >= 0.1; } }
    const L = (q.cloudLayers || []).map((c) => MCV[c.amount]).filter((x) => x != null); if (L.length) o.C = Math.max(...L);
    set("us:" + id, o); }).catch(() => {})));
  await Promise.all(jobs);
  return out;
}
/* ---------- Weitere lernende Teile (Version 1.6), alle lernen für immer und vergessen langsam ----------
   mx  Modellmix Temperatur: Fehler von ICON, ECMWF, GFS und dem KI-Modell AIFS (Vorlauf 1 und 3 Tage); Gewicht = 1 / mittlerer
       quadratischer Fehler nach Abzug der Schieflage. Fehler des Mixes wird vor jedem Lernschritt gemessen (ehrlich).
   pp  Regenwahrscheinlichkeit: in 11 Stufen (0, 10 … 100 %), wie oft es danach wirklich geregnet hat (Messstationen).
   wd  Wind und Böen: Faktor zwischen Vorhersage und Messung (gleitendes Mittel des Logarithmus).
   fg  Hochnebel/bedeckt tagsüber: logistische Regression aus Bewölkung, tiefer Bewölkung, Luftfeuchte, Wind, Jahreszeit, Tageszeit.
   Für pp, wd und fg merkt sich der Worker alle 6 Stunden die ECMWF-Vorhersage (36 Stunden) und vergleicht 12 bis 30 Stunden später. */
/* Modellmix: weltweite Modelle (auch die KI-Modelle von ECMWF, DWD und NOAA) und die Modelle vor Ort (nur Mitteleuropa;
   außerhalb ihres Gebiets antwortet Open-Meteo mit einem Fehler, daher eine eigene Abfrage) */
const MX_G = { icon: "icon_seamless", ec: "ecmwf_ifs", gfs: "gfs_seamless", ai: "ecmwf_aifs025_single", aic: "dwd_aicon_global_native", aig: "ncep_aigfs025" };
const MX_R = { cl: "geosphere_claef_austria", d2: "dwd_icon_d2_native" };
const MX_M = Object.assign({}, MX_G, MX_R);
const ema = (o, k, v, a) => { o[k] = o[k] == null ? v : (1 - a) * o[k] + a * v; };
function mxLearn(M, F, y) {
  const ks = Object.keys(F).filter((m) => F[m] != null && isFinite(F[m]));
  if (ks.length < 2 || !isFinite(y)) return;
  let sw = 0, sv = 0;
  ks.forEach((m) => { const q = M[m]; if (!q || q.s == null) return; const w = 1 / Math.max(0.05, q.s); sw += w; sv += w * (F[m] + q.b); });
  if (sw && (M.n || 0) >= 1) ema(M, "e", Math.abs(y - sv / sw), 0.01);
  if (F.ec != null) ema(M, "r", Math.abs(y - F.ec), 0.01);
  ks.forEach((m) => { const q = M[m] || (M[m] = { b: 0, s: null, n: 0 }), err = y - F[m]; if (Math.abs(err) > 20) return;
    const res = err - q.b; q.s = q.s == null ? res * res : 0.98 * q.s + 0.02 * res * res; q.b = 0.98 * q.b + 0.02 * err; q.n = (q.n || 0) + 1; });
  M.n = (M.n || 0) + 1;
}
function ppCal(Q, P) { const i = Math.max(0, Math.min(10, Math.round(P / 10))), n = Q.c ? Q.c[i] : 0, k = 12; return n && Q.b[i] != null ? (n * Q.b[i] * 100 + k * P) / (n + k) : P; }
function ppLearn(Q, P, wet) {
  if (P == null || !isFinite(P)) return;
  if (!Q.b) { Q.b = new Array(11).fill(null); Q.c = new Array(11).fill(0); }
  const i = Math.max(0, Math.min(10, Math.round(P / 10))), y = wet ? 1 : 0, cal = ppCal(Q, P);
  ema(Q, "br", (P / 100 - y) ** 2, 0.01); ema(Q, "bc", (cal / 100 - y) ** 2, 0.01);
  Q.c[i] = Math.min(400, Q.c[i] + 1); Q.b[i] = Q.b[i] == null ? y : Q.b[i] + (y - Q.b[i]) / Q.c[i];
  Q.n = (Q.n || 0) + 1;
}
function wdLearn(Q, key, f, o) {
  if (f == null || o == null || f < 4 || !isFinite(o)) return;
  const L = Q[key] || (Q[key] = { l: 0, n: 0 }), fac = Math.exp(L.l);
  ema(L, "er", Math.abs(o - f), 0.01); ema(L, "ec", Math.abs(o - f * fac), 0.01);
  L.l = 0.98 * L.l + 0.02 * Math.max(-1, Math.min(1, Math.log((o + 2) / (f + 2)))); L.n++;
}
// gleiche Merkmale in der App
function fgX(cc, cl, rh, w, mon, hr) { return [1, cc / 100, (cl == null ? cc : cl) / 100, (rh - 80) / 20, Math.min(w || 0, 30) / 30, mon >= 9 || mon <= 1 ? 1 : 0, hr < 11 ? 1 : 0, hr >= 11 && hr < 15 ? 1 : 0, hr >= 15 ? 1 : 0]; }
function fgLearn(Q, x, y, base) {
  if (!Q.w || Q.w.length !== x.length) Q.w = new Array(x.length).fill(0);
  let z = 0; for (let i = 0; i < x.length; i++) z += Q.w[i] * x[i];
  const p = 1 / (1 + Math.exp(-z)), cl = (q) => Math.min(0.97, Math.max(0.03, q));
  ema(Q, "ll", -(y ? Math.log(cl(p)) : Math.log(1 - cl(p))), 0.01); ema(Q, "lb", -(y ? Math.log(cl(base)) : Math.log(1 - cl(base))), 0.01);
  for (let i = 0; i < x.length; i++) Q.w[i] += 0.05 * ((y - p) * x[i] - 0.0005 * Q.w[i]);
  Q.n = (Q.n || 0) + 1;
}
const rnd = (o) => (typeof o === "number" ? Math.round(o * 1000) / 1000 : Array.isArray(o) ? o.map(rnd) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rnd(v)])) : o);
// ECMWF-Vorhersage (36 h) alle 6 Stunden merken
async function snapAll(todo, hourMs) {
  const need = todo.filter((p) => !p.sn || !p.sn.length || hourMs - p.sn[p.sn.length - 1].at >= 6 * 3600000 - 60000);
  if (!need.length) return;
  try {
    const j = await klJ("https://api.open-meteo.com/v1/forecast?latitude=" + need.map((p) => p.la.toFixed(3)).join(",") + "&longitude=" + need.map((p) => p.lo.toFixed(3)).join(",") +
      "&hourly=precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,cloud_cover_low,relative_humidity_2m&models=ecmwf_ifs&forecast_days=3&timezone=GMT");
    const A = Array.isArray(j) ? j : [j];
    need.forEach((p, n) => {
      const H = A[n] && A[n].hourly; if (!H || !H.time) return;
      const i0 = H.time.findIndex((t) => Date.parse(t + ":00Z") >= hourMs); if (i0 < 0) return;
      const g = (k) => (H[k] || []).slice(i0, i0 + 36).map((v) => (v == null ? null : Math.round(v * 10) / 10));
      p.sn = (p.sn || []).filter((x) => hourMs - x.at <= 31 * 3600000);
      p.sn.push({ at: hourMs, t0: Date.parse(H.time[i0] + ":00Z"), P: g("precipitation_probability"), W: g("wind_speed_10m"), G: g("wind_gusts_10m"), CC: g("cloud_cover"), CL: g("cloud_cover_low"), RH: g("relative_humidity_2m") });
      p.sn = p.sn.slice(-6);
    });
  } catch (e) {}
}
function snapAt(p, hourMs) {
  let best = null;
  for (const x of p.sn || []) { const lead = (hourMs - x.at) / 3600000, k = Math.round((hourMs - x.t0) / 3600000);
    if (lead >= 12 && lead <= 30 && k >= 0 && k < (x.P || []).length && (!best || Math.abs(lead - 24) < best.d)) best = { x, k, d: Math.abs(lead - 24) }; }
  return best;
}
async function klRun(env) {
  if (!env.SUBS) return;
  const places = (await klAll(env)).slice(0, KL_MAX).filter((p) => p.st && p.st.length);
  if (!places.length) return;
  const hourMs = Math.floor(Date.now() / 3600000) * 3600000;
  const todo = places.filter((p) => p.last !== hourMs);
  if (!todo.length) return;
  const obs = await klObs(todo);
  // Modellmix: Temperatur von vier Modellen, gerechnet 1 und 3 Tage vorher
  let mxr = [];
  const mxq = (models) => klJ("https://previous-runs-api.open-meteo.com/v1/forecast?latitude=" + todo.map((p) => p.la.toFixed(3)).join(",") + "&longitude=" + todo.map((p) => p.lo.toFixed(3)).join(",") +
      "&hourly=temperature_2m_previous_day1,temperature_2m_previous_day3&models=" + Object.values(models).join(",") + "&past_days=1&forecast_days=1&timezone=GMT").then((j) => (Array.isArray(j) ? j : [j]));
  const [mg, mr] = await Promise.allSettled([mxq(MX_G), mxq(MX_R)]);
  if (mg.status === "fulfilled") {
    mxr = mg.value;
    /* die Modelle vor Ort dazulegen (gleiche Orte, gleiche Stunden) */
    if (mr.status === "fulfilled") mxr.forEach((x, i) => { const y = mr.value[i]; if (x && x.hourly && y && y.hourly) Object.keys(y.hourly).forEach((k) => { if (k !== "time" && !(k in x.hourly)) x.hourly[k] = y.hourly[k]; }); });
  }
  // Modell (Open-Meteo best_match) an Orten und Stationen, um aus den Stationen die Temperatur am Ort zu bestimmen
  const pts = [];
  todo.forEach((p) => { pts.push({ la: p.la, lo: p.lo, h: p.h }); p.st.forEach((s) => pts.push({ la: s.la, lo: s.lo, h: s.h })); });
  let bm = [];
  try {
    const j = await klJ("https://api.open-meteo.com/v1/forecast?latitude=" + pts.map((p) => p.la.toFixed(4)).join(",") + "&longitude=" + pts.map((p) => p.lo.toFixed(4)).join(",") +
      (pts.every((p) => p.h != null && isFinite(p.h)) ? "&elevation=" + pts.map((p) => Math.round(p.h)).join(",") : "") + "&current=temperature_2m&models=best_match&timezone=GMT");
    bm = (Array.isArray(j) ? j : [j]).map((x) => (x && x.current && x.current.temperature_2m != null ? +x.current.temperature_2m : null));
  } catch (e) { return; }
  // ECMWF für diese Stunde, gerechnet 0 bis 7 Tage vorher
  const V = ["temperature_2m", "cloud_cover", "wind_speed_10m"], vars = [];
  V.forEach((v) => { vars.push(v); for (let d = 1; d <= 7; d++) vars.push(v + "_previous_day" + d); });
  let pr = [];
  try {
    const j = await klJ("https://previous-runs-api.open-meteo.com/v1/forecast?latitude=" + todo.map((p) => p.la.toFixed(3)).join(",") + "&longitude=" + todo.map((p) => p.lo.toFixed(3)).join(",") +
      "&hourly=" + vars.join(",") + "&models=ecmwf_ifs&past_days=1&forecast_days=1&timezone=auto");
    pr = Array.isArray(j) ? j : [j];
  } catch (e) {}
  await snapAll(todo, hourMs);
  /* ein Ort nach dem anderen; scheitert einer, lernen die anderen trotzdem */
  const one = async (p, n, i1) => {
    const b0 = bm[i1];
    let num = 0, den = 0;
    p.st.forEach((s, k) => { const o = obs[s.k + ":" + s.id] && obs[s.k + ":" + s.id].T, b = bm[i1 + 1 + k]; if (o == null || b == null) return;
      const dh = p.h != null ? Math.abs(s.h - p.h) : 0, w = (1 / Math.pow(s.d + 5, 2)) * Math.exp(-Math.pow(dh / 250, 2)); num += w * (o - b); den += w; });
    p.last = hourMs;
    const off = pr[n] && +pr[n].utc_offset_seconds || 0, locT = new Date(hourMs + off * 1000);
    p.ml = p.ml || {};
    // Wind, Böen, Regen, Bewölkung am Ort aus den Stationen (gewichtet nach Entfernung)
    const agg = (k, bin) => { let a = 0, w = 0; p.st.forEach((s) => { const o = obs[s.k + ":" + s.id]; if (!o || o[k] == null) return; const ww = 1 / Math.pow(s.d + 5, 2); a += ww * (bin ? (o[k] ? 1 : 0) : o[k]); w += ww; }); return w ? a / w : null; };
    const oW = agg("W"), oG = agg("G"), oC = agg("C"), oWet = agg("wet", true);
    const sp = snapAt(p, hourMs);
    if (sp) {
      const x = sp.x, k = sp.k;
      if (oWet != null && x.P[k] != null) ppLearn(p.ml.pp || (p.ml.pp = {}), x.P[k], oWet >= 0.5);
      const wd = p.ml.wd || (p.ml.wd = {});
      if (oW != null) wdLearn(wd, "w", x.W[k], oW);
      if (oG != null) wdLearn(wd, "g", x.G[k], oG);
      if (oC != null && (oC >= 85 || oC <= 40) && x.CC[k] != null && x.RH[k] != null && sunElev(p.la, p.lo, hourMs) >= 10)
        fgLearn(p.ml.fg || (p.ml.fg = {}), fgX(x.CC[k], x.CL[k], x.RH[k], x.W[k], locT.getUTCMonth(), locT.getUTCHours()), oC >= 85 ? 1 : 0, x.CC[k] / 100);
    }
    if (!den || b0 == null) { p.ml = rnd(p.ml); await env.SUBS.put("kl:p:" + p.id, JSON.stringify(p)); return; }
    const truth = b0 + num / (den + 1 / 900);
    p.obs = { t: hourMs, T: klR(truth, 2) };
    // Modellmix lernen
    const MH = mxr[n] && mxr[n].hourly;
    if (MH && MH.time) {
      const i = MH.time.findIndex((t) => Date.parse(t + ":00Z") === hourMs);
      if (i >= 0) { const mx = p.ml.mx || (p.ml.mx = {});
        [1, 3].forEach((d) => { const F = {}; Object.entries(MX_M).forEach(([m, id]) => { const a = MH["temperature_2m_previous_day" + d + "_" + id]; F[m] = a && a[i] != null ? +a[i] : null; });
          mxLearn(mx["d" + d] || (mx["d" + d] = {}), F, truth); }); }
    }
    p.ml = rnd(p.ml);
    const H = pr[n] && pr[n].hourly, hour = locT.getUTCHours();
    if (H && H.time) {
      const loc = new Date(hourMs + off * 1000).toISOString().slice(0, 13), i = H.time.findIndex((t) => t.slice(0, 13) === loc);
      if (i >= 0) {
        p.ec = p.ec || {};
        for (let d = 0; d <= 7; d++) {
          const sfx = d ? "_previous_day" + d : "", f = H["temperature_2m" + sfx] && H["temperature_2m" + sfx][i];
          if (f == null) continue;
          const c = H["cloud_cover" + sfx] && H["cloud_cover" + sfx][i], wi = H["wind_speed_10m" + sfx] && H["wind_speed_10m" + sfx][i];
          klLearn(p.ec, klX("ec", hour, c, wi, d * 24 + 6), truth - f);
        }
      }
    }
    // Kachelmann: die zuletzt aus der App geschickte Vorhersage für diese Stunde
    try {
      const sn = await env.SUBS.get("kl:s:" + p.id, "json");
      if (sn && Array.isArray(sn.T)) {
        const k = Math.round((hourMs - sn.t0) / 3600000), lead = (hourMs - sn.at) / 3600000;
        if (k >= 0 && k < sn.T.length && sn.T[k] != null && lead >= 1 && lead <= 36) {
          p.kc = p.kc || {};
          klLearn(p.kc, klX("kc", hour, sn.C ? sn.C[k] : null, sn.W ? sn.W[k] : null, lead), truth - sn.T[k]);
        }
      }
    } catch (e) {}
    ["ec", "kc"].forEach((m) => { if (p[m] && p[m].w) { p[m].w = p[m].w.map((v) => klR(v)); p[m].er = klR(p[m].er); p[m].ec = klR(p[m].ec); } });
    await env.SUBS.put("kl:p:" + p.id, JSON.stringify(p));
  };
  let i0 = 0;
  for (let n = 0; n < todo.length; n++) {
    const p = todo[n], i1 = i0;
    i0 += 1 + p.st.length;
    try { await one(p, n, i1); } catch (e) { console.error("klRun", p.id, e && e.message); }
  }
}
const klId = (la, lo) => (Math.round(la * 100) + "_" + Math.round(lo * 100)).replace(/-/g, "m");

/* ---------- KI (Cloudflare Workers AI, Bindung „AI“) ----------
   Übersetzen: Meta M2M100 (reines Übersetzungsmodell). Push-Texte: ein kleines Sprachmodell formuliert die Nachricht aus den
   festen Fakten; danach wird geprüft, dass keine Zahl dazukommt, der Ort drinsteht und die Länge passt. Sonst bleibt der feste Text.
   Fehlt die Bindung oder klappt etwas nicht, läuft alles wie vorher. */
/* zuerst das große Sprachmodell (schreibt deutlich besser, kostet ein paar Cent im Monat mehr), sonst die kleinen als Ersatz */
const AI_CHAT = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast", "@cf/google/gemma-3-12b-it"];
const nums = (t) => String(t).match(/\d+(?:[.,]\d+)?/g) || [];
async function aiText(env, facts, place, max) {
  if (!env.AI) return null;
  const msgs = [
    { role: "system", content: "Du schreibst kurze Push-Nachrichten für eine Wetter-App auf Deutsch. Ein bis zwei Sätze, höchstens " + max + " Zeichen. Verwende nur die gegebenen Fakten, erfinde nichts, ändere keine Zahl und keine Uhrzeit. Kein Emoji, keine Anführungszeichen." },
    { role: "user", content: facts },
  ];
  for (const m of AI_CHAT) {
    try {
      const r = await env.AI.run(m, { messages: msgs, max_tokens: 90, temperature: 0.3 });
      let t = String((r && (r.response || (r.result && r.result.response))) || "").trim().replace(/^["„»“]+|["“«”]+$/g, "").replace(/\s+/g, " ");
      if (t.length < 12 || t.length > max + 20 || /[<>{}*#]/.test(t)) continue;
      const ok = new Set(nums(facts)); if (!nums(t).every((x) => ok.has(x))) continue;
      if (place && !t.includes(place)) continue;
      return t;
    } catch (e) {}
  }
  return null;
}
async function aiTr(env, text, from) {
  const key = "tr2:" + b64u(await sha(from + "|" + text)).slice(0, 24);
  const c = await env.SUBS.get(key); if (c) return c;
  /* zuerst das große Sprachmodell (natürlicheres Deutsch); geprüft: alle Zahlen wie im Original, sinnvolle Länge.
     Sonst das Übersetzungsmodell wie bisher. */
  let t = "";
  try {
    const r = await env.AI.run(AI_CHAT[0], { messages: [
      { role: "system", content: "Übersetze die Wetterwarnung ins Deutsche. Gib nur die Übersetzung aus, ohne Einleitung und ohne Anmerkungen. Behalte alle Zahlen, Uhrzeiten und Einheiten genau bei. Erfinde nichts dazu." },
      { role: "user", content: text }], max_tokens: 600, temperature: 0.1 });
    const x = String((r && (r.response || (r.result && r.result.response))) || "").trim().replace(/^["„»“]+|["“«”]+$/g, "");
    const need = nums(text), have = new Set(nums(x));
    if (x.length >= Math.min(8, text.length / 3) && x.length <= text.length * 2.5 + 40 && need.every((n) => have.has(n)) && !/[<>{}]/.test(x)) t = x;
  } catch (e) {}
  if (!t) {
    const r = await env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: from, target_lang: "de" });
    t = String((r && (r.translated_text || (r.result && r.result.translated_text))) || "").trim();
  }
  if (!t) throw new Error("leer");
  await env.SUBS.put(key, t, { expirationTtl: 30 * 86400 });
  return t;
}

/* ---------- Prüfung alle 5 Minuten: Regen und Warnungen ---------- */
const AT_TYPES = { 1: "Sturm", 2: "Regen", 3: "Schnee", 4: "Glatteis", 5: "Gewitter", 6: "Hitze", 7: "Kälte" };
const getJ = (u) => jf(u, { headers: { Accept: "application/json" } }, 15000);
/* Open-Meteo zählt den Niederschlag je Viertelstunde rückwärts: der Wert zur Zeit t gilt für die 15 Minuten davor.
   Gesucht wird das erste nasse Intervall, das noch läuft oder in der nächsten Stunde beginnt.
   i = Stelle in der Reihe (-1: nichts), min = Minuten bis zum Beginn (0: es läuft schon), dur = Dauer in Minuten, mx = stärkste Viertelstunde.
   Bis Version 1.6 wurde die Zeit t als Beginn genommen; die Hinweise kamen dadurch mit einer Viertelstunde zu viel („in 30 Minuten“ statt „in 15“). */
/* Regen in der nächsten Stunde. In Österreich zuerst die Radar-Vorhersage von GeoSphere (INCA-Nowcast, 1 km: Radar und
   Messstationen, mit der Zugrichtung der Schauer), Schnee bei höchstens 1 °C; sonst oder wenn GeoSphere nicht antwortet
   Open-Meteo. Beide Werte sind Summen der Viertelstunde VOR dem Zeitstempel. */
async function rainSoon(lat, lon) {
  if (lat >= 46.3 && lat <= 49.1 && lon >= 9.5 && lon <= 17.2) {
    try {
      const st = new Date(Math.floor(Date.now() / 900000) * 900000 - 45 * 60000).toISOString().slice(0, 16);
      const j = await getJ("https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km?parameters=rr,t2m&lat_lon=" + lat + "," + lon + "&start=" + st);
      const f = j.features && j.features[0], pr = f && f.properties && f.properties.parameters;
      if (pr && pr.rr && Array.isArray(j.timestamps)) return soonOf(j.timestamps.map((t) => Date.parse(t)), pr.rr.data || [], (k) => pr.t2m && pr.t2m.data && pr.t2m.data[k] != null && pr.t2m.data[k] <= 1);
    } catch (e) {}
  }
  const j = await getJ("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&minutely_15=precipitation,snowfall&forecast_minutely_15=8&timezone=GMT");
  const m = j.minutely_15 || {}, P = m.precipitation || [], S = m.snowfall || [];
  return soonOf((m.time || []).map((t) => Date.parse(t + ":00Z")), P, (k) => (S[k] || 0) * 0.7 >= P[k] * 0.5);
}
function soonOf(T, P, isSnow) {
  const now = Date.now(), wet = (k) => P[k] != null && P[k] >= 0.1;
  let i = -1;
  for (let k = 0; k < T.length && i < 0; k++) if (T[k] > now && T[k] - 900000 < now + 3600000 && wet(k)) i = k;
  if (i < 0) return { i };
  let n = 0, mx = 0;
  for (let k = i; k < P.length && wet(k); k++) { n++; mx = Math.max(mx, P[k]); }
  /* end: Minuten bis zum Ende (erstes trockenes Intervall), wenn es innerhalb der Reihe aufhört */
  const k2 = i + n, end = k2 < P.length && P[k2] != null && T[k2] ? Math.max(0, Math.round((T[k2] - 900000 - now) / 60000)) : null;
  return { i, min: Math.max(0, Math.round((T[i] - 900000 - now) / 60000)), snow: !!isSnow(i), dur: n * 15, mx, end };
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
/* ============ Blitze in der Nähe (Wettersatellit MTG von EUMETSAT, Lightning Imager, wie die Blitze im Radar der App) ============
   Ein kleines Bild rund um den Ort (30 x 30 km, etwa 2,3 km je Bildpunkt). Jeder sichtbare Bildpunkt ist eine Blitzfläche
   der letzten Minuten. Ergebnis: Entfernung des nächsten Blitzes in km, oder null. */
async function pngPixels(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  if (u[0] !== 0x89 || u[1] !== 0x50) throw new Error("kein PNG");
  let o = 8, W = 0, H = 0, bd = 8, ct = 0, trns = null;
  const idat = [];
  while (o < u.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(u[o + 4], u[o + 5], u[o + 6], u[o + 7]), d = u.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { W = dv.getUint32(o + 8); H = dv.getUint32(o + 12); bd = u[o + 16]; ct = u[o + 17]; if (u[o + 20]) throw new Error("interlaced"); }
    else if (type === "tRNS") trns = d.slice();
    else if (type === "IDAT") idat.push(d.slice());
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * bd) >> 3), stride = (W * ch * bd + 7) >> 3;
  const out = new Uint8Array(W * H), cur = new Uint8Array(stride), prev = new Uint8Array(stride);
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
      let al = 255;
      if (ct === 6) al = cur[xq * 4 + 3];
      else if (ct === 4) al = cur[xq * 2 + 1];
      else if (ct === 3) { const idx = bd === 8 ? cur[xq] : (cur[(xq * bd) >> 3] >> (8 - bd - ((xq * bd) & 7))) & ((1 << bd) - 1); al = trns && idx < trns.length ? trns[idx] : 255; }
      else if (ct === 2 && trns && trns.length >= 6) { const r = cur[xq * 3], g = cur[xq * 3 + 1], bl = cur[xq * 3 + 2]; if (r === trns[1] && g === trns[3] && bl === trns[5]) al = 0; }
      out[y * W + xq] = al;
    }
    prev.set(cur);
  }
  return { W, H, a: out };
}
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
/* ============ Europa-Radar am Ort (LibreWXR, Messung und Radar-Vorhersage) ============
   Für den Regen-Hinweis: Die Radar-Vorhersage von GeoSphere beginnt bei einer 20 bis 30 Minuten alten Messung. Das
   Europa-Radar ist aktueller (5 bis 10 Minuten) und rechnet seine eigene Vorhersage (bis etwa 1 Stunde) von dort weiter.
   Abgelesen wird je Bild die Kachel mit dem Ort (Zoom 8, 512 Punkte), der stärkste Wert im Umkreis von etwa 1 km.
   Ergebnis: Beginn des Regens in Minuten (zwei Bilder hintereinander ab 0,3 mm/h), Dauer und Stärke, oder null. */
async function lxPoint(lat, lon) {
  const mp = await (await tf("https://api.librewxr.net/public/weather-maps.json", {}, 10000)).json();
  const fr = [...((mp.radar && mp.radar.past) || []).slice(-1), ...((mp.radar && mp.radar.nowcast) || [])], z = 8, n = 256;
  const fx = ((lon + 180) / 360) * n, my = (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI, fy = ((180 - my) / 360) * n, tx = Math.floor(fx), ty = Math.floor(fy);
  const now = Date.now() / 1000, vals = [];
  await Promise.all(fr.map(async (f, k) => {
    try {
      const r = await tf(mp.host + f.path + "/512/" + z + "/" + tx + "/" + ty + "/0/1_0.png", {}, 12000);
      if (!r.ok) return;
      const t = await pngRGBA(await r.arrayBuffer()), px = Math.floor((fx - tx) * t.W), py = Math.floor((fy - ty) * t.H);
      let mx = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= t.W || y >= t.H) continue;
        const j = (y * t.W + x) * 4, R = t.d[j];
        if (t.d[j + 3] > 90 && R === t.d[j + 1] && R === t.d[j + 2] && R - 32 >= 5) mx = Math.max(mx, Math.pow(Math.pow(10, (R - 32) / 10) / 200, 0.625));
      }
      vals[k] = { t: f.time, r: mx };
    } catch (e) {}
  }));
  const L = vals.filter(Boolean).sort((a, b) => a.t - b.t);
  for (let i = 0; i < L.length - 1; i++) {
    if (L[i].r >= 0.3 && L[i + 1].r >= 0.3) {
      let j = i, mx = 0;
      while (j < L.length && L[j].r >= 0.3) { mx = Math.max(mx, L[j].r); j++; }
      return { min: Math.max(0, Math.round((L[i].t - now) / 60)), dur: Math.round((L[Math.min(j, L.length - 1)].t - L[i].t) / 60), mx };
    }
  }
  return null;
}
/* Blitze im Umkreis von 45 km: d = Entfernung des nächsten Blitzes in km (oder null), b = Richtung, aus der die nächsten
   Blitze kommen (Grad, 0 = Norden, 90 = Osten), n = Zahl der Blitzflächen. Bild 31 x 31 Punkte, etwa 3 km je Punkt. */
const LTG_R = 45;
async function lightningField(lat, lon) {
  const R = 6378137, x = lon * Math.PI / 180 * R, y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R, k = 1 / Math.cos(lat * Math.PI / 180);
  const half = (LTG_R + 2) * 1000 * k, N = 31;
  const u = "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=" +
    [x - half, y - half, x + half, y + half].map((v) => v.toFixed(0)).join(",") + "&width=" + N + "&height=" + N + "&format=image/png&transparent=true&v=" + Math.floor(Date.now() / 60000);
  const r = await tf(u, {}, 15000);
  if (!r.ok) throw new Error("EUMETSAT " + r.status);
  const px = await pngPixels(await r.arrayBuffer()), cell = (2 * (LTG_R + 2)) / N, pts = [];
  for (let j = 0; j < px.H; j++) for (let i = 0; i < px.W; i++) {
    if (px.a[j * px.W + i] < 40) continue;
    const dx = (i + 0.5 - px.W / 2) * cell, dy = (px.H / 2 - j - 0.5) * cell, d = Math.hypot(dx, dy);
    if (d <= LTG_R) pts.push([d, dx, dy]);
  }
  if (!pts.length) return { d: null, b: null, n: 0 };
  pts.sort((a, b) => a[0] - b[0]);
  /* Richtung: Schwerpunkt der nächsten Blitze (bis 10 km weiter weg als der nächste) */
  const near = pts.filter((q) => q[0] <= pts[0][0] + 10);
  const sx = near.reduce((a, q) => a + q[1], 0), sy = near.reduce((a, q) => a + q[2], 0);
  return { d: pts[0][0], b: (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360, n: pts.length };
}
const dirWord = (b) => ["nördlich", "nordöstlich", "östlich", "südöstlich", "südlich", "südwestlich", "westlich", "nordwestlich"][Math.round(b / 45) % 8];
const fromWord = (b) => ["Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten"][Math.round(b / 45) % 8];
/* ============ Vorhersage für die Hinweise Glätte, Bodenfrost, Sturm (Open-Meteo, bestes Modell am Ort, 18 Stunden) ============ */
async function wxNext(lat, lon) {
  const j = await getJ("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&hourly=temperature_2m,precipitation,snowfall,weather_code,soil_temperature_0cm,wind_gusts_10m&forecast_hours=18&timezone=auto");
  return j.hourly || {};
}
/* Glätte in der Nacht. Geprüft am Abend (18 bis 21 Uhr), einmal pro Tag, bis 9 Uhr früh. Glätte, wenn
   - gefrierender Regen oder Nieselregen vorhergesagt ist, oder
   - Schnee fällt und es höchstens 1 °C hat, oder
   - es bis 0,5 °C abkühlt und in den 6 Stunden davor Regen gefallen ist (nasse Straßen frieren).
   Ergebnis: { h: Stunde (Ortszeit), art } oder null. */
function iceOf(H) {
  const T = H.temperature_2m || [], P = H.precipitation || [], S = H.snowfall || [], W = H.weather_code || [], tm = H.time || [];
  for (let i = 0; i < tm.length; i++) {
    const t = T[i];
    if (t == null) continue;
    const hr = +String(tm[i]).slice(11, 13);
    if ([56, 57, 66, 67].includes(W[i])) return { h: hr, art: "gefrierender Regen" };
    if ((S[i] || 0) > 0.05 && t <= 1) return { h: hr, art: "Schnee" };
    let wet = 0;
    for (let k = Math.max(0, i - 6); k < i; k++) wet += P[k] || 0;
    if (t <= 0.5 && wet >= 0.3) return { h: hr, art: "überfrierende Nässe" };
  }
  return null;
}
/* Bodenfrost in der Nacht: Temperatur am Boden (0 cm) bis 9 Uhr früh höchstens 0 °C. Ergebnis { tb: tiefster Wert am Boden,
   tl: tiefste Lufttemperatur, h: ab wann } oder null. Damit im Winter nicht jeden Abend dieselbe Nachricht kommt: nur, wenn
   in den 3 Nächten davor kein Frost-Hinweis kam (die erste Frostnacht nach milden Tagen ist die, die überrascht). */
function frostOf(H) {
  const B = H.soil_temperature_0cm || [], T = H.temperature_2m || [], tm = H.time || [];
  let tb = null, tl = null, h = null;
  for (let i = 0; i < tm.length; i++) {
    const hr = +String(tm[i]).slice(11, 13);
    if (i > 0 && hr === 10) break;
    if (B[i] != null && (tb == null || B[i] < tb)) tb = B[i];
    if (T[i] != null && (tl == null || T[i] < tl)) tl = T[i];
    if (h == null && B[i] != null && B[i] <= 0) h = hr;
  }
  return tb != null && tb <= 0 ? { tb, tl, h } : null;
}
/* Sturm: Böen ab 60 km/h in den nächsten 12 Stunden. Ergebnis { g: stärkste Böe, h: ab wann } oder null. */
function stormOf(H) {
  const G = H.wind_gusts_10m || [], tm = H.time || [];
  let g = 0, h = null;
  for (let i = 0; i < Math.min(12, tm.length); i++) { if (G[i] >= 60 && h == null) h = +String(tm[i]).slice(11, 13); if (G[i] > g) g = G[i]; }
  return h != null ? { g: Math.round(g), h } : null;
}
const viennaHour = () => +new Intl.DateTimeFormat("de-AT", { hour: "numeric", hour12: false, timeZone: "Europe/Vienna" }).format(new Date());
const viennaDay = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());

/* Ein Ort eines Abos prüfen. P = { lat, lon, name, st }, st ist der Zustand dieses Ortes. Hängt Nachrichten an msgs an.
   Gibt true zurück, wenn sich der Zustand geändert hat. */
/* fast: Zwischenprüfung (jede Minute außer zur vollen 5. Minute): nur der Regenbeginn aus unserer eigenen Kurzvorhersage
   (schnell und ohne fremde Dienste); alles andere wie bisher alle 5 Minuten */
async function alertPlace(env, rec, P, once, msgs, multi, fast) {
  const st = P.st, pos = P.lat + "," + P.lon, now = Date.now(), ort = P.name || "", tagx = multi ? "-" + pos : "";
  const pre = ort ? ort + ": " : "";
  // Ruhezeiten (von der App aus deinem Alltag gelernt): nachts keine Regen-, Blitz-, Frost- und Sturm-Hinweise; amtliche Warnungen kommen trotzdem
  const quietNow = Array.isArray(rec.qh) && rec.qh.includes(new Date().getUTCHours());
  let changed = false;
  if (rec.rain && !(fast && st.rain)) {
    try {
      let r = fast ? { i: -1 } : await once("r:" + pos, () => rainSoon(P.lat, P.lon));
      /* Europa-Radar ist aktueller: sieht es den Regen früher (oder GeoSphere gar nicht), gilt sein Beginn */
      if (!fast) try {
        const e = await once("e:" + pos, () => lxPoint(P.lat, P.lon));
        if (e && e.min <= 60 && (r.i < 0 || e.min < r.min - 10)) r = Object.assign({}, r, { i: Math.max(0, r.i), min: e.min, dur: Math.max(r.dur || 0, e.dur), mx: Math.max(r.mx || 0, e.mx / 4) });
      } catch (x) {}
      /* Österreich: Regenwahrscheinlichkeit aus unserer eigenen Kurzvorhersage (Europa-Radar mit Regenmessern, alle 5 Minuten)
         und GeoSphere, gemischt nach der Trefferquote (Seite „wetter“, /gr/pt, über die Dienstbindung SITE). Ab 60 % zählt sie
         als Regenbeginn; sagt sie für den gemeldeten Beginn unter 30 %, kommt (außer gleich) kein Hinweis: weniger Fehlalarme. */
      let pr = null;
      const pAt = (m) => { if (!pr) return null; const n = Date.now() / 1000; let mx = 0; pr.t.forEach((t, i) => { if (Math.abs((t - n) / 60 - m) <= 10) mx = Math.max(mx, pr.p[i]); }); return mx; };
      try {
        if (env.SITE) {
          const q = await once("p:" + pos, () => env.SITE.fetch("https://wetter/gr/pt?la=" + (+P.lat).toFixed(3) + "&lo=" + (+P.lon).toFixed(3)).then((x) => x.json()));
          if (q && q.ok && q.t && q.t.length) pr = q;
        }
      } catch (x) {}
      if (pr) {
        const n = Date.now() / 1000, k = pr.t.findIndex((t, i) => t - n <= 3600 && pr.p[i] >= 0.6);
        if (k >= 0) {
          const pm = Math.max(0, Math.round((pr.t[k] - n) / 60));
          let j = k; while (j < pr.t.length && pr.p[j] >= 0.5) j++;
          if (r.i < 0 || pm < r.min - 10) r = Object.assign({}, r, { i: Math.max(0, r.i), min: pm, dur: Math.max(r.i < 0 ? 0 : r.dur || 0, (j - k) * 5), mx: Math.max(r.i < 0 ? 0 : r.mx || 0, pr.r[k] / 4), snow: r.i < 0 ? !!pr.s : r.snow });
        }
      }
      if (r.i >= 0 && !st.rain && pr && r.min > 10 && pAt(r.min) < 0.3) r = Object.assign({}, r, { i: -1, unsure: true });
      if (r.i >= 0 && !st.rain) {
        const what = r.snow ? "Schnee" : "Regen";
        // nach einem Hinweis 90 Minuten Pause: springt die Vorhersage um die Schwelle herum, kommt nicht jedes Mal ein neuer
        const pause = now - (st.rt || 0) < 90 * 60000;
        if (!quietNow && !pause) {
          const soon = r.min <= 5, mins = Math.round(r.min / 5) * 5;
          const title = soon ? (r.snow ? "Es beginnt zu schneien" : "Es beginnt zu regnen") : what + " in etwa " + mins + " Minuten";
          const sk = r.snow ? (r.mx < 0.5 ? "leicht" : r.mx < 2 ? "mäßig" : "stark") : (r.mx < 0.6 ? "leicht" : r.mx < 2.5 ? "mäßig" : "stark");
          const pp = pAt(r.min);
          const facts = "Ort: " + (ort || "dein Ort") + ". " + (soon ? "Der " + what + " beginnt jetzt." : "Der " + what + " beginnt in etwa " + mins + " Minuten.") + " Stärke: " + sk + "." + (r.dur >= 30 ? " Dauer: mindestens " + r.dur + " Minuten." : " Dauer: kurz.") + (pp != null && !soon ? " Wahrscheinlichkeit: etwa " + Math.round(Math.max(0.1, pp) * 10) * 10 + " %." : "");
          const ai = await once("a:" + facts, () => aiText(env, facts, ort, 140));
          msgs.push({ title: (multi && ort ? ort + ": " : "") + title, body: ai || (ort ? ort + ". " : "") + "Tippe für das Regenradar.", tag: "rain" + tagx, url: SITE + "#sec-radar" });
          st.rt = now;
        }
        st.rain = true; st.re = false; changed = true;
      } else if (r.i < 0 && st.rain && !r.unsure && !fast) { st.rain = false; st.re = false; changed = true; }
      /* Regen hört auf: es regnet gerade (seit mindestens 15 Minuten) und hört laut Vorhersage in höchstens 20 Minuten auf */
      if (!fast && rec.rend !== false && st.rain && !st.re && r.i >= 0 && r.min === 0 && r.end != null && r.end <= 20 && r.dur >= 15 && now - (st.rt || 0) > 15 * 60000) {
        if (!quietNow) {
          const what = r.snow ? "Schnee" : "Regen", m = Math.max(5, Math.round(r.end / 5) * 5);
          msgs.push({ title: (multi && ort ? ort + ": " : "") + (r.end <= 5 ? "Der " + what + " hört gleich auf" : "Der " + what + " hört in etwa " + m + " Minuten auf"), body: pre + "Danach bleibt es laut Radar-Vorhersage mindestens eine Viertelstunde trocken. Tippe für das Radar.", tag: "rain" + tagx, url: SITE + "#sec-radar" });
        }
        st.re = true; changed = true;
      }
    } catch (e) {}
  }
  if (fast) return changed;
  let warnW = [];
  if (rec.warn) {
    const res = await once("w:" + pos, () => warnings(P.lat, P.lon)), ws = res.list;
    warnW = ws;
    const seen = st.w || [];
    // Ist ein Warndienst gerade nicht erreichbar, bekannte Warnungen behalten (sonst käme dieselbe Warnung später noch einmal)
    const ids = res.ok ? ws.map((w) => w.id) : Array.from(new Set([...seen, ...ws.map((w) => w.id)]));
    for (const w of ws) if (!seen.includes(w.id)) {
      const facts = "Ort: " + (ort || "dein Ort") + ". Amtliche Warnung: " + w.title + ". " + w.body;
      const ai = w.body ? await once("a:" + facts, () => aiText(env, facts, ort, 170)) : null;
      msgs.push({ title: (multi && ort ? ort + ": " : "") + w.title, body: ai || pre + w.body, tag: "warn-" + w.id, url: SITE + "#sec-warn" });
    }
    if (ids.join() !== seen.join()) { st.w = ids; changed = true; }
  }
  /* Blitze: näher als 15 km ein Hinweis (höchstens alle 60 Minuten); weiter weg (15 bis 45 km) wird verfolgt, ob das
     Gewitter näher kommt (Entfernung jetzt gegen vor 10 bis 40 Minuten). Kommt es näher, Hinweis mit Richtung und
     geschätzter Ankunft (höchstens alle 90 Minuten). Hagel: stärkster vorhergesagter Regen am Ort in der nächsten
     Stunde ab 30 mm/h bei Blitzen in der Nähe (höchstens alle 3 Stunden). */
  let LF = null;
  if (rec.ltg !== false || rec.storm2 !== false || rec.hail !== false) {
    try { LF = await once("l:" + pos, () => lightningField(P.lat, P.lon)); } catch (e) {}
  }
  if (LF) {
    const hist = (st.lh || []).filter((h) => now - h.t < 45 * 60000);
    if (rec.storm2 !== false && LF.d != null && LF.d > 15 && !quietNow && now - (st.ga || 0) > 90 * 60000) {
      const old = hist.filter((h) => now - h.t >= 9 * 60000 && h.d != null).sort((a, b) => a.t - b.t)[0];
      if (old && old.d - LF.d >= 3) {
        const v = (old.d - LF.d) / ((now - old.t) / 60000), eta = Math.round(Math.max(5, (LF.d - 3) / v) / 5) * 5;
        if (eta <= 75) {
          msgs.push({ title: (multi && ort ? ort + ": " : "") + "Gewitter zieht heran", body: pre + "Gewitter etwa " + Math.round(LF.d) + " km " + dirWord(LF.b) + ", es kommt aus dem " + fromWord(LF.b) + " näher. Ankunft in etwa " + eta + " Minuten. Tippe für das Radar.", tag: "tsg" + tagx, url: SITE + "#sec-radar" });
          st.ga = now;
        }
      }
    }
    /* nur speichern, wenn es Blitze gibt oder gerade noch gab (sonst würde alle 5 Minuten geschrieben) */
    if (LF.d != null || hist.some((h) => h.d != null) || (st.lh && st.lh.length)) {
      hist.push({ t: now, d: LF.d == null ? null : Math.round(LF.d * 10) / 10 });
      const nh = hist.some((h) => h.d != null) ? hist.slice(-6) : [];
      if (JSON.stringify(nh) !== JSON.stringify(st.lh || [])) { st.lh = nh; changed = true; }
    }
    if (rec.hail !== false && LF.d != null && LF.d <= 45 && !quietNow && now - (st.hl || 0) > 3 * 3600000) {
      try {
        const r = await once("r:" + pos, () => rainSoon(P.lat, P.lon));
        if (r.i >= 0 && r.mx >= 7.5 && !r.snow) {
          msgs.push({ title: (multi && ort ? ort + ": " : "") + "Achtung: möglicherweise Hagel", body: pre + "Sehr starker Regen mit Gewitter " + (r.min <= 5 ? "jetzt" : "in etwa " + Math.round(r.min / 5) * 5 + " Minuten") + ". Auto unterstellen, empfindliche Sachen hereinholen.", tag: "hail" + tagx, url: SITE + "#sec-radar" });
          st.hl = now;
        }
      } catch (e) {}
    }
  }
  if (rec.ltg !== false && LF) {
    try {
      const d = LF.d != null && LF.d <= 15 ? LF.d : null;
      if (d != null && !quietNow && now - (st.lt || 0) > 60 * 60000) {
        const km = Math.max(1, Math.round(d));
        msgs.push({ title: (multi && ort ? ort + ": " : "") + "Blitze in der Nähe", body: pre + (d < 5 ? "Blitze ganz in der Nähe (unter 5 km). Bleib drinnen." : "Blitze etwa " + km + " km entfernt. Bei Donner drinnen bleiben.") + " Tippe für das Radar.", tag: "ltg" + tagx, url: SITE + "#sec-radar" });
        st.lt = now; changed = true;
      }
    } catch (e) {}
  }
  /* Sturm ohne amtliche Warnung: Böen ab 60 km/h in den nächsten 12 Stunden. Vorhersage höchstens alle 30 Minuten neu,
     danach 12 Stunden Pause. Gibt es schon eine amtliche Wind- oder Sturmwarnung, kommt kein zweiter Hinweis. */
  if (rec.storm !== false && now - (st.sc || 0) > 30 * 60000 && now - (st.sg || 0) > 12 * 3600000) {
    try {
      const H = await once("x:" + pos, () => wxNext(P.lat, P.lon)), g = stormOf(H);
      st.sc = now; changed = true;
      const official = warnW.some((w) => /sturm|wind|orkan/i.test(w.title));
      if (g && !official && !quietNow) {
        msgs.push({ title: (multi && ort ? ort + ": " : "") + "Sturmböen bis " + g.g + " km/h", body: pre + "Ab etwa " + g.h + " Uhr Böen bis " + g.g + " km/h. Lose Gegenstände sichern, Vorsicht unter Bäumen.", tag: "storm" + tagx, url: SITE });
        st.sg = now;
      }
    } catch (e) {}
  }
  /* Am Abend (18 bis 21 Uhr), einmal pro Tag: Glätte und Bodenfrost in der Nacht */
  const vh = viennaHour(), day = viennaDay();
  if ((rec.ice !== false || rec.frost !== false) && vh >= 18 && vh <= 21 && st.ice !== day) {
    try {
      const H = await once("x:" + pos, () => wxNext(P.lat, P.lon));
      const g = rec.ice !== false ? iceOf(H) : null;
      if (g) msgs.push({ title: (multi && ort ? ort + ": " : "") + "Glättegefahr heute Nacht", body: pre + "Ab etwa " + g.h + " Uhr " + (g.art === "Schnee" ? "Schnee bei Temperaturen um 0 °C" : g.art) + ", Straßen und Wege können glatt werden.", tag: "ice" + tagx, url: SITE });
      const f = rec.frost !== false ? frostOf(H) : null;
      if (f && !g && now - (st.fr || 0) > 3.5 * 86400000) {
        const tb = Math.round(f.tb), tl = Math.round(f.tl);
        msgs.push({ title: (multi && ort ? ort + ": " : "") + (tl <= 0 ? "Frost heute Nacht" : "Bodenfrost heute Nacht"), body: pre + (tl <= 0 ? "Bis " + String(tl).replace("-", "−") + " °C, am Boden bis " + String(tb).replace("-", "−") + " °C." : "Die Luft bleibt bei etwa " + tl + " °C, am Boden aber bis " + String(tb).replace("-", "−") + " °C.") + " Empfindliche Pflanzen abdecken, Autoscheiben können morgen vereist sein.", tag: "frost" + tagx, url: SITE });
      }
      if (f) st.fr = now;
      st.ice = day; changed = true;
    } catch (e) {}
  }
  return changed;
}
/* Ein Abo prüfen: der Hauptort und bis zu 2 weitere Orte (z. B. Arbeit, Schule). once(k, f) merkt sich Abrufe innerhalb
   eines Durchlaufs: mehrere Geräte am selben Ort fragen nur einmal an. */
async function alertOne(env, name, once, fast) {
  const rec = await env.SUBS.get(name, "json");
  if (!rec || !rec.sub) return;
  rec.st = rec.st || { rain: false, w: [] };
  const msgs = [], places = [{ lat: rec.lat, lon: rec.lon, name: rec.name, st: rec.st }].concat((Array.isArray(rec.more) ? rec.more : []).slice(0, 2).map((p) => { p.st = p.st || { rain: false, w: [] }; return p; }));
  let changed = false;
  for (const P of places) { try { if (await alertPlace(env, rec, P, once, msgs, places.length > 1, fast)) changed = true; } catch (e) { console.error("alert place", e && e.message); } }
  /* Erst den Zustand speichern, dann senden. Lässt er sich nicht speichern, wird nichts gesendet: sonst käme dieselbe
     Nachricht alle 5 Minuten wieder. */
  if (changed) await env.SUBS.put(name, JSON.stringify(rec));
  for (const m of msgs) {
    let res = null;
    for (let k = 0; k < 2; k++) {
      try { res = await sendPush(env, rec.sub, m); } catch (e) { res = null; }
      if (res && (res.ok || res.status === 404 || res.status === 410)) break;
    }
    // Abo gibt es nicht mehr (App gelöscht oder Erlaubnis entzogen): aufräumen
    if (res && (res.status === 404 || res.status === 410)) { await env.SUBS.delete(name); return; }
  }
}
async function runAlerts(env, fast) {
  if (!env.SUBS) return;
  const names = (await env.SUBS.list({ prefix: "sub:" })).keys.map((k) => k.name), memo = new Map();
  const once = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };
  // bis zu drei Abos gleichzeitig; ein Fehler bei einem hält die anderen nicht auf
  const work = async () => { while (names.length) { const n = names.shift(); try { await alertOne(env, n, once, fast); } catch (e) { console.error("alert", n, e && e.message); } } };
  await Promise.all([work(), work(), work()]);
}

/* Alle Wege des Workers. h = Kopfzeilen der Antwort, json(o, status) = Antwort als JSON */
async function route(req, env, ctx, h, json) {
  if (!env.KACHELMANN_KEY || !env.LOGIN_USER || !env.LOGIN_PASS || !env.ALLOWED_ORIGIN)
    return json({ error: "Der Worker ist noch nicht fertig eingerichtet (Variablen fehlen)." }, 500);
  const url = new URL(req.url);

  if (url.pathname === "/") return json({ ok: true, name: "wetter-proxy", version: VERSION, build: BUILD, ai: !!env.AI, ml: true, qh: true, renew: true, push: !!env.SUBS, guard: true, ma: true, mt: true, mtc: true, kl: !!env.SUBS });

  if (url.pathname === "/login" && req.method === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") || "unbekannt";
    await rlLoad(env);
    const mark = rlTake(ip);
    if (!mark) {
      await new Promise((r) => setTimeout(r, 1000));
      return json({ error: "Zu viele falsche Anmeldungen. Bitte in " + (rl.lock - Date.now() > 20 * 60000 ? "einigen Stunden" : "15 Minuten") + " noch einmal versuchen." }, 429);
    }
    if (Number(req.headers.get("Content-Length") || 0) > 2000) { rlUndo(ip, mark); return json({ error: "Ungültig" }, 400); }
    let b = {};
    try { const raw = await req.text(); if (raw.length > 2000) { rlUndo(ip, mark); return json({ error: "Ungültig" }, 400); } b = JSON.parse(raw) || {}; } catch (e) {}
    const u = await safeEq(String(b.user || "").toLowerCase(), env.LOGIN_USER.toLowerCase());
    const p = await safeEq(String(b.pass || ""), env.LOGIN_PASS);
    if (u && p) { rlUndo(ip, mark); return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 }); }
    await rlSave(env);
    await new Promise((r) => setTimeout(r, 1500));
    return json({ error: "Anmeldung fehlgeschlagen" }, 401);
  }

  // Anmeldung verlängern: ein noch gültiges Token bekommt wieder 30 Tage (z. B. für ein Tablet, das dauernd offen ist)
  // Nur prüfen, ob ein Token gilt (für die Seite bei Cloudflare: App erst nach Anmeldung)
  if (url.pathname === "/auth" && req.method === "GET") {
    return (await checkToken(env, req)) ? json({ ok: true }) : json({ error: "Nicht angemeldet" }, 401);
  }

  if (url.pathname === "/renew" && req.method === "POST") {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 });
  }

  if (url.pathname.startsWith("/k/") && req.method === "GET") {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    const path = url.pathname.slice(3);
    if (!/^[a-z0-9][a-z0-9_\-./,]*$/i.test(path) || path.includes("..")) return json({ error: "Ungültiger Pfad" }, 400);
    let r;
    try {
      r = await tf(API + path + url.search, {
        headers: { [env.KEY_HEADER || "X-API-Key"]: env.KACHELMANN_KEY, Accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      }, 25000);
    } catch (e) { return json({ error: "Kachelmann antwortet gerade nicht" }, 504); }
    return new Response(r.body, { status: r.status, headers: { ...h, "Content-Type": r.headers.get("Content-Type") || h["Content-Type"], "Cache-Control": "private, max-age=120" } });
  }

  // Wetterwarnungen anderer Länder Europas von MeteoAlarm (dort ist kein direkter Abruf aus dem Browser erlaubt)
  if (url.pathname.startsWith("/ma/") && req.method === "GET") {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    const slug = url.pathname.slice(4);
    if (!MA_SLUGS.has(slug)) return json({ error: "Unbekanntes Land" }, 400);
    let r;
    try { r = await tf("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + slug, { headers: { Accept: "application/json" }, cf: { cacheTtl: 600, cacheEverything: true } }, 25000); }
    catch (e) { return json({ error: "MeteoAlarm antwortet gerade nicht" }, 504); }
    return new Response(r.body, { status: r.ok ? 200 : 502, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=300" } });
  }

  // Wettermeldungen der Flughäfen (METAR) rund um einen Ort, damit die App die Temperatur oben an echten Messungen
  // ausrichten kann, wo es keine andere frei abrufbare Station gibt (aviationweather.gov erlaubt keinen Abruf aus dem Browser)
  if (url.pathname.startsWith("/mt/") && req.method === "GET") {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    const m = url.pathname.slice(4).match(/^(-?\d{1,2}(?:\.\d{1,4})?),(-?\d{1,3}(?:\.\d{1,4})?)$/);
    if (!m) return json({ error: "Ungültig" }, 400);
    const la = Math.round(+m[1] * 10) / 10, lo = Math.round(+m[2] * 10) / 10;
    if (Math.abs(la) > 85 || Math.abs(lo) > 180) return json({ error: "Ungültig" }, 400);
    const dla = 0.6, dlo = Math.min(3, 0.6 / Math.max(0.2, Math.cos((la * Math.PI) / 180)));
    const bb = [la - dla, lo - dlo, la + dla, lo + dlo].map((x) => x.toFixed(2)).join(",");
    let a = [];
    try {
      const r = await tf("https://aviationweather.gov/api/data/metar?format=json&hours=2&bbox=" + bb, { headers: { Accept: "application/json", "User-Agent": "wetter-proxy" }, cf: { cacheTtl: 300, cacheEverything: true } }, 12000);
      if (r.ok && r.status !== 204) a = await r.json();
    } catch (e) {}
    const st = (Array.isArray(a) ? a : [])
      .filter((x) => x && typeof x.temp === "number" && typeof x.lat === "number" && typeof x.lon === "number")
      .map((x) => ({ id: String(x.icaoId || "").slice(0, 8), n: String(x.name || "").slice(0, 60), la: x.lat, lo: x.lon, h: typeof x.elev === "number" ? x.elev : null, t: x.obsTime, T: x.temp, c: metarCover(x), wx: String(x.wxString || "").slice(0, 20) }))
      .slice(0, 120);
    return new Response(JSON.stringify({ st }), { status: 200, headers: { ...h, "Cache-Control": "private, max-age=240" } });
  }

  // Lernende Korrektur: Ort anmelden, Kachelmann-Vorhersage hinterlegen, Gelerntes abholen
  if (url.pathname.startsWith("/kl/")) {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    if (!env.SUBS) return json({ error: "kv-setup" }, 503);
    const num = (v, a) => { const n = Number(v); return isFinite(n) && Math.abs(n) <= a ? n : null; };
    if (url.pathname === "/kl/c" && req.method === "GET") {
      const la = num(url.searchParams.get("la"), 90), lo = num(url.searchParams.get("lo"), 180);
      if (la == null || lo == null) return json({ error: "Ungültig" }, 400);
      const best = await klNear(env, la, lo, 3);
      if (!best) return json({ ok: true, none: true });
      const pick = (L) => (L && L.w ? { w: L.w, n: L.n || 0, er: L.er, ec: L.ec } : null);
      return json({ ok: true, v: 2, name: best.name, st: (best.st || []).length, ec: pick(best.ec), kc: pick(best.kc), obs: best.obs || null, ml: best.ml || null });
    }
    if (req.method !== "POST") return json({ error: "Nicht gefunden" }, 404);
    if (Number(req.headers.get("Content-Length") || 0) > 6000) return json({ error: "Zu groß" }, 413);
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const la = num(b.la, 90), lo = num(b.lo, 180);
    if (la == null || lo == null) return json({ error: "Ungültig" }, 400);
    const id = klId(la, lo);
    if (url.pathname === "/kl/p") {
      // Gibt es den Ort schon (oder einen bis 2 km daneben, etwa weil der Standort leicht schwankt), wird er mitbenutzt.
      // Früher entstand je 0,01 Grad ein eigener Ort; zwei Nachbarn belegten dann zwei der sechs Plätze.
      const old = await klNear(env, la, lo, 2);
      if (old) { if (Date.now() - (old.seen || 0) > 86400000) { old.seen = Date.now(); await env.SUBS.put("kl:p:" + old.id, JSON.stringify(old)); } return json({ ok: true, id: old.id, st: (old.st || []).length }); }
      // neuer Ort: Messstationen suchen; sind schon 15 Orte da, fällt der am längsten nicht mehr geöffnete heraus
      const all = await klAll(env);
      if (all.length >= KL_MAX) {
        const oldest = all.reduce((a, p) => ((p.seen || 0) < (a.seen || 0) ? p : a));
        await Promise.all([env.SUBS.delete("kl:p:" + oldest.id), env.SUBS.delete("kl:s:" + oldest.id)]);
      }
      let h = num(b.h, 9000);
      const st = await klStations(la, lo);
      const p = { id, la: +la.toFixed(4), lo: +lo.toFixed(4), h, name: String(b.name || "").slice(0, 60), st, seen: Date.now(), ec: {}, kc: {} };
      await env.SUBS.put("kl:p:" + id, JSON.stringify(p));
      return json({ ok: true, id, st: st.length });
    }
    if (url.pathname === "/kl/s") {
      const T = Array.isArray(b.T) ? b.T.slice(0, 48).map((v) => num(v, 70)) : null, t0 = num(b.t0, 1e14);
      if (!T || t0 == null) return json({ error: "Ungültig" }, 400);
      const C = Array.isArray(b.C) ? b.C.slice(0, 48).map((v) => num(v, 100)) : null, W = Array.isArray(b.W) ? b.W.slice(0, 48).map((v) => num(v, 300)) : null;
      const pl = await klNear(env, la, lo, 2);
      if (!pl) return json({ error: "Ort nicht angemeldet" }, 404);
      await env.SUBS.put("kl:s:" + pl.id, JSON.stringify({ t0, at: Date.now(), T, C, W }), { expirationTtl: 3 * 86400 });
      return json({ ok: true });
    }
    return json({ error: "Nicht gefunden" }, 404);
  }

  // KI-Übersetzung der Warnungen anderer Länder (gemerkt 30 Tage)
  if (url.pathname === "/tr" && req.method === "POST") {
    if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
    if (!env.AI || !env.SUBS) return json({ error: "ai-setup" }, 503);
    if (Number(req.headers.get("Content-Length") || 0) > 8000) return json({ error: "Zu groß" }, 413);
    let b = {};
    try { b = await req.json(); } catch (e) {}
    const from = String(b.from || "").toLowerCase().slice(0, 3), q = Array.isArray(b.q) ? b.q.slice(0, 6).map((x) => String(x || "").slice(0, 900)) : [];
    if (!/^[a-z]{2,3}$/.test(from) || !q.length) return json({ error: "Ungültig" }, 400);
    try { return json({ ok: true, t: await Promise.all(q.map((x) => (x.trim() ? aiTr(env, x.trim(), from) : ""))) }); }
    catch (e) { return json({ error: "KI nicht erreichbar" }, 502); }
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
      /* weitere Orte (höchstens 2): bekannte behalten ihren Zustand */
      const om = (old && Array.isArray(old.more)) ? old.more : [];
      const more = (Array.isArray(b.more) ? b.more : []).slice(0, 2).map((p) => ({ lat: +Number(p.lat).toFixed(3), lon: +Number(p.lon).toFixed(3), name: String(p.name || "").slice(0, 60) }))
        .filter((p) => isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
        .map((p) => { const o = om.find((x) => x.lat === p.lat && x.lon === p.lon); if (o && o.st) p.st = o.st; return p; });
      const qh = Array.isArray(b.qh) ? [...new Set(b.qh.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h < 24))].slice(0, 16) : [];
      await env.SUBS.put(id, JSON.stringify({ sub: { endpoint: ep, keys: s.keys }, lat: +lat.toFixed(3), lon: +lon.toFixed(3), name: String(b.name || "").slice(0, 60), rain: !!b.rain, warn: !!b.warn, ltg: b.ltg !== false, ice: b.ice !== false, frost: b.frost !== false, storm: b.storm !== false, rend: b.rend !== false, storm2: b.storm2 !== false, hail: b.hail !== false, more, qh, st: (old && old.st) || { rain: false, w: [] } }));
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
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin");
    /* nur die eigene Seite darf Antworten im Browser lesen; fremde Seiten bekommen keine Freigabe (auch nicht für „null“) */
    const h = {
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    };
    if (origin && allowedOrigin(env, origin)) h["Access-Control-Allow-Origin"] = origin;
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    try { return await route(req, env, ctx, h, json); }
    catch (e) { console.error("fetch", new URL(req.url).pathname, e && e.message); return json({ error: "Interner Fehler" }, 500); }
  },
  async scheduled(event, env, ctx) {
    /* jede Minute: der Regenbeginn (schnell, aus der eigenen Kurzvorhersage); alle 5 Minuten die volle Prüfung */
    const mi = new Date(event.scheduledTime || Date.now()).getUTCMinutes();
    ctx.waitUntil(runAlerts(env, mi % 5 !== 0).catch((e) => console.error("runAlerts", e && e.message)));
    // einmal pro Stunde lernen
    if (mi === 0) ctx.waitUntil(klRun(env).catch((e) => console.error("klRun", e && e.message)));
  },
};
