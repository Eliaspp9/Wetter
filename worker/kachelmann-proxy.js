// Wetter-Proxy: hält den Kachelmann-Schlüssel geheim, prüft die Anmeldung, verschickt Wetter-Benachrichtigungen
// und lernt jede Stunde, wie weit die Vorhersage an deinen Orten danebenliegt (lernende Korrektur).
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

/* ---------- Schutz gegen Passwort-Raten ----------
   Pro IP-Adresse höchstens 5 falsche Anmeldungen in 15 Minuten, von allen zusammen höchstens 30. Danach wird
   15 Minuten lang jede neue Anmeldung abgelehnt. Schon angemeldete Geräte merken davon nichts (sie haben ein Token).
   Gezählt wird im Speicher des Workers und, wenn der KV-Speicher SUBS eingerichtet ist, zusätzlich dort (gilt dann überall). */
const RL_WIN = 15 * 60 * 1000, RL_IP = 5, RL_ALL = 30, mem = new Map();
function memList(k, now) { const a = (mem.get(k) || []).filter((t) => now - t < RL_WIN); mem.set(k, a); return a; }
async function loginBlocked(env, ip) {
  const now = Date.now();
  if (memList("ip:" + ip, now).length >= RL_IP || memList("all", now).length >= RL_ALL) return true;
  if (env.SUBS) {
    try {
      const n = (x) => (Array.isArray(x) ? x : []).filter((t) => now - t < RL_WIN).length;
      const [a, b] = await Promise.all([env.SUBS.get("rl:ip:" + ip, "json"), env.SUBS.get("rl:all", "json")]);
      if (n(a) >= RL_IP || n(b) >= RL_ALL) return true;
    } catch (e) {}
  }
  return false;
}
async function loginFailed(env, ip) {
  const now = Date.now();
  if (mem.size > 5000) mem.clear();
  memList("ip:" + ip, now).push(now);
  memList("all", now).push(now);
  if (env.SUBS) {
    for (const k of ["rl:ip:" + ip, "rl:all"]) {
      try {
        const old = await env.SUBS.get(k, "json"), a = (Array.isArray(old) ? old : []).filter((t) => now - t < RL_WIN);
        a.push(now);
        await env.SUBS.put(k, JSON.stringify(a.slice(-60)), { expirationTtl: 1800 });
      } catch (e) {}
    }
  }
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
  return fetch(sub.endpoint, {
    method: "POST",
    headers: { TTL: "3600", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: await vapidHeader(env, sub.endpoint) },
    body,
  });
}

/* ---------- Lernende Korrektur (läuft für immer) ----------
   Jede Stunde vergleicht der Worker für deine Orte (höchstens 6, die du in der App öffnest), was ECMWF (Vorlauf 0 bis 7 Tage)
   und Kachelmann (die Vorhersage, die die App zuletzt geschickt hat) für diese Stunde vorhergesagt haben, mit der Temperatur,
   die die Messstationen in der Nähe ergeben. Daraus lernt er, wie weit die Vorhersage dort je nach Tageszeit, Bewölkung, Wind
   und Vorlaufzeit danebenliegt (lineares Modell, das sich mit jeder Stunde ein Stück anpasst: NLMS). Er vergisst langsam,
   lernt also auch neue Jahreszeiten. Gespeichert wird im KV-Speicher SUBS: je Ort ein Eintrag kl:p:<id>, Kachelmann-Vorhersage kl:s:<id>. */
const KL_MAX = 6, KL_MU = 0.06, KL_A = 0.01;
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
async function klJ(u, opt) { const r = await fetch(u, Object.assign({ headers: { Accept: "application/json", "User-Agent": "wetter-proxy (eliaspp9.github.io)" } }, opt || {})); if (!r.ok) throw new Error(r.status); return r.json(); }
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
// Messwerte (°C) aller Stationen; Schlüssel k:id
async function klObs(places) {
  const out = {}, all = places.flatMap((p) => p.st || []);
  const at = [...new Set(all.filter((s) => s.k === "at").map((s) => s.id))], mt = [...new Set(all.filter((s) => s.k === "mt").map((s) => s.id))];
  const de = [...new Set(all.filter((s) => s.k === "de").map((s) => s.id))].slice(0, 8), us = [...new Set(all.filter((s) => s.k === "us").map((s) => s.id))].slice(0, 6);
  const jobs = [];
  if (at.length) jobs.push(klJ("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=TL&station_ids=" + at.join(",")).then((j) => {
    const ts = (j.timestamps || []).map((t) => Date.parse(t));
    (j.features || []).forEach((f) => { const p = f.properties || {}, d = p.parameters && p.parameters.TL && p.parameters.TL.data; if (!d) return;
      for (let i = d.length - 1; i >= 0; i--) if (d[i] != null) { if (Date.now() - ts[i] < 45 * 60000) out["at:" + p.station] = +d[i]; break; } });
  }).catch(() => {}));
  if (mt.length) jobs.push(klJ("https://aviationweather.gov/api/data/metar?format=json&ids=" + mt.join(",")).then((a) => {
    (Array.isArray(a) ? a : []).forEach((x) => { if (x && typeof x.temp === "number" && Date.now() / 1000 - x.obsTime < 5400 && out["mt:" + x.icaoId] == null) out["mt:" + x.icaoId] = x.temp; });
  }).catch(() => {}));
  de.forEach((id) => jobs.push(klJ("https://api.brightsky.dev/current_weather?wmo_station_id=" + id).then((j) => { const w = j.weather; if (w && w.temperature != null && Date.now() - Date.parse(w.timestamp) < 90 * 60000) out["de:" + id] = +w.temperature; }).catch(() => {})));
  us.forEach((id) => jobs.push(klJ("https://api.weather.gov/stations/" + id + "/observations/latest").then((j) => { const q = j.properties || {}, T = q.temperature && q.temperature.value; if (T != null && Date.now() - Date.parse(q.timestamp) < 90 * 60000) out["us:" + id] = +T; }).catch(() => {})));
  await Promise.all(jobs);
  return out;
}
async function klRun(env) {
  if (!env.SUBS) return;
  const list = await env.SUBS.list({ prefix: "kl:p:" });
  const places = [];
  for (const k of list.keys.slice(0, KL_MAX)) { const p = await env.SUBS.get(k.name, "json"); if (p && p.st && p.st.length) places.push(p); }
  if (!places.length) return;
  const hourMs = Math.floor(Date.now() / 3600000) * 3600000;
  const todo = places.filter((p) => p.last !== hourMs);
  if (!todo.length) return;
  const obs = await klObs(todo);
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
  let i0 = 0;
  for (let n = 0; n < todo.length; n++) {
    const p = todo[n], b0 = bm[i0];
    let num = 0, den = 0;
    p.st.forEach((s, k) => { const o = obs[s.k + ":" + s.id], b = bm[i0 + 1 + k]; if (o == null || b == null) return;
      const dh = p.h != null ? Math.abs(s.h - p.h) : 0, w = (1 / Math.pow(s.d + 5, 2)) * Math.exp(-Math.pow(dh / 250, 2)); num += w * (o - b); den += w; });
    i0 += 1 + p.st.length;
    p.last = hourMs;
    if (!den || b0 == null) { await env.SUBS.put("kl:p:" + p.id, JSON.stringify(p)); continue; }
    const truth = b0 + num / (den + 1 / 900);
    p.obs = { t: hourMs, T: klR(truth, 2) };
    const H = pr[n] && pr[n].hourly, off = pr[n] && +pr[n].utc_offset_seconds || 0, hour = new Date(hourMs + off * 1000).getUTCHours();
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
  }
}
const klId = (la, lo) => (Math.round(la * 100) + "_" + Math.round(lo * 100)).replace(/-/g, "m");

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
    if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) h["Access-Control-Allow-Origin"] = origin;
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (!env.KACHELMANN_KEY || !env.LOGIN_USER || !env.LOGIN_PASS || !env.ALLOWED_ORIGIN)
      return json({ error: "Der Worker ist noch nicht fertig eingerichtet (Variablen fehlen)." }, 500);
    const url = new URL(req.url);

    if (url.pathname === "/") return json({ ok: true, name: "wetter-proxy", version: "1.5", renew: true, push: !!env.SUBS, guard: true, ma: true, mt: true, mtc: true, kl: !!env.SUBS });

    if (url.pathname === "/login" && req.method === "POST") {
      const ip = req.headers.get("CF-Connecting-IP") || "unbekannt";
      if (await loginBlocked(env, ip)) {
        await new Promise((r) => setTimeout(r, 1000));
        return json({ error: "Zu viele falsche Anmeldungen. Bitte in 15 Minuten noch einmal versuchen." }, 429);
      }
      if (Number(req.headers.get("Content-Length") || 0) > 2000) return json({ error: "Ungültig" }, 400);
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const u = await safeEq(String(b.user || "").toLowerCase(), env.LOGIN_USER.toLowerCase());
      const p = await safeEq(String(b.pass || ""), env.LOGIN_PASS);
      if (u && p) return json({ token: await makeToken(env, env.LOGIN_USER), days: 30 });
      await loginFailed(env, ip);
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

    // Wetterwarnungen anderer Länder Europas von MeteoAlarm (dort ist kein direkter Abruf aus dem Browser erlaubt)
    if (url.pathname.startsWith("/ma/") && req.method === "GET") {
      if (!(await checkToken(env, req))) return json({ error: "Nicht angemeldet" }, 401);
      const slug = url.pathname.slice(4);
      if (!MA_SLUGS.has(slug)) return json({ error: "Unbekanntes Land" }, 400);
      const r = await fetch("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + slug, { headers: { Accept: "application/json" }, cf: { cacheTtl: 600, cacheEverything: true } });
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
        const r = await fetch("https://aviationweather.gov/api/data/metar?format=json&hours=2&bbox=" + bb, { headers: { Accept: "application/json", "User-Agent": "wetter-proxy" }, cf: { cacheTtl: 300, cacheEverything: true } });
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
        const list = await env.SUBS.list({ prefix: "kl:p:" });
        let best = null, bd = 3;
        for (const k of list.keys) { const p = await env.SUBS.get(k.name, "json"); if (!p) continue; const d = klDist(la, lo, p.la, p.lo); if (d < bd) { bd = d; best = p; } }
        if (!best) return json({ ok: true, none: true });
        const pick = (L) => (L && L.w ? { w: L.w, n: L.n || 0, er: L.er, ec: L.ec } : null);
        return json({ ok: true, v: 1, name: best.name, st: (best.st || []).length, ec: pick(best.ec), kc: pick(best.kc), obs: best.obs || null });
      }
      if (req.method !== "POST") return json({ error: "Nicht gefunden" }, 404);
      if (Number(req.headers.get("Content-Length") || 0) > 6000) return json({ error: "Zu groß" }, 413);
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const la = num(b.la, 90), lo = num(b.lo, 180);
      if (la == null || lo == null) return json({ error: "Ungültig" }, 400);
      const id = klId(la, lo);
      if (url.pathname === "/kl/p") {
        // neuer Ort: Messstationen suchen; sind schon 6 Orte da, fällt der am längsten nicht mehr geöffnete heraus
        const old = await env.SUBS.get("kl:p:" + id, "json");
        if (old) { if (Date.now() - (old.seen || 0) > 86400000) { old.seen = Date.now(); await env.SUBS.put("kl:p:" + id, JSON.stringify(old)); } return json({ ok: true, id, st: (old.st || []).length }); }
        const list = await env.SUBS.list({ prefix: "kl:p:" });
        if (list.keys.length >= KL_MAX) {
          let oldest = null, ot = Infinity;
          for (const k of list.keys) { const p = await env.SUBS.get(k.name, "json"); const t = (p && p.seen) || 0; if (t < ot) { ot = t; oldest = k.name; } }
          if (oldest) { await env.SUBS.delete(oldest); await env.SUBS.delete("kl:s:" + oldest.slice(5)); }
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
        if (!(await env.SUBS.get("kl:p:" + id))) return json({ error: "Ort nicht angemeldet" }, 404);
        await env.SUBS.put("kl:s:" + id, JSON.stringify({ t0, at: Date.now(), T, C, W }), { expirationTtl: 3 * 86400 });
        return json({ ok: true });
      }
      return json({ error: "Nicht gefunden" }, 404);
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
    // einmal pro Stunde (in den ersten 10 Minuten) lernen
    if (new Date(event.scheduledTime || Date.now()).getUTCMinutes() < 10) ctx.waitUntil(klRun(env).catch(() => {}));
  },
};
