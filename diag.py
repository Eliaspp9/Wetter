import urllib.request, json, time, datetime, math
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)"}
def j(u, t=60):
    for k in range(3):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t).read())
        except Exception as e:
            if k == 2: raise
            time.sleep(3)
def km(a, b, c, d): return math.hypot((a - c) * 111, (b - d) * 111 * math.cos(a * math.pi / 180))
G = "https://dataset.api.hub.geosphere.at/v1/"
now = datetime.datetime.now(datetime.timezone.utc); nowt = now.timestamp()
print("NOW", now.isoformat())
def combine(pl_base, he, st, bs):
    num = den = 0; n = 0
    for x, b in zip(st, bs):
        if b is None: continue
        dh = abs(x["h"] - he) if he is not None else 0
        w = 1 / (x["d"] + 5) ** 2 * math.exp(-(dh / 250) ** 2); num += w * (x["T"] - b); den += w; n += 1
    return pl_base + (max(-6, min(6, num / (den + 1 / 900))) if den else 0), n
def om(pts):
    u = "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&elevation=%s&current=temperature_2m&models=best_match&timezone=GMT" % (
        ",".join("%.4f" % p["la"] for p in pts), ",".join("%.4f" % p["lo"] for p in pts), ",".join("%d" % round(p["h"]) for p in pts))
    r = j(u); r = r if isinstance(r, list) else [r]; return [x["current"]["temperature_2m"] for x in r]
# --- Österreich: Nöstlbach, Utzenaich
sm = j(G + "station/current/tawes-v1-10min/metadata")["stations"]
for name, la, lo in [("Utzenaich", 48.2762, 13.4609)]:
    pe = j("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m" % (la, lo))
    he = pe.get("elevation")
    st = sorted([{"id": s["id"], "n": s["name"], "la": s["lat"], "lo": s["lon"], "h": s["altitude"], "d": km(la, lo, s["lat"], s["lon"])} for s in sm if s.get("altitude") is not None and s.get("is_active", True)], key=lambda x: x["d"])
    st = [x for x in st if x["d"] <= 50][:8]
    o = j(G + "station/current/tawes-v1-10min?parameters=TL&station_ids=" + ",".join(str(x["id"]) for x in st))
    ts = [datetime.datetime.fromisoformat(t).timestamp() for t in o["timestamps"]]
    for f in o["features"]:
        x = next(y for y in st if str(y["id"]) == str(f["properties"]["station"])); d = f["properties"]["parameters"]["TL"]["data"]
        for i in range(len(d) - 1, -1, -1):
            if d[i] is not None: x["T"] = d[i]; x["t"] = ts[i]; break
    st = [x for x in st if "T" in x and nowt - x["t"] <= 2700]
    pts = [{"la": la, "lo": lo, "h": he, "t": nowt}] + st
    r = j(G + "timeseries/forecast/nowcast-v1-15min-1km?parameters=t2m&output_format=geojson&" + "&".join("lat_lon=%.4f,%.4f" % (p["la"], p["lo"]) for p in pts))
    T2 = [datetime.datetime.fromisoformat(t).timestamp() for t in r["timestamps"]]
    inca = []
    for f, p in zip(r["features"], pts):
        d = f["properties"]["parameters"]["t2m"]["data"]; t = p["t"]; k = 0
        while k + 1 < len(T2) and T2[k + 1] <= t: k += 1
        fr = (t - T2[k]) / (T2[k + 1] - T2[k]) if k + 1 < len(T2) and t > T2[k] else 0
        inca.append(d[k] + (d[k + 1] - d[k]) * fr if fr > 0 and d[k + 1] is not None else d[k])
    T, n = combine(inca[0], he, st, inca[1:])
    print("%s elev=%s INCA raw=%.2f -> korrigiert %.2f (n=%d)  best_match=%s  stations: %s" % (name, he, inca[0], T, n, pe["current"]["temperature_2m"], ", ".join("%s %.1fkm %s°" % (x["n"][:14], x["d"], x["T"]) for x in st[:5])))
# --- Deutschland: München über Bright Sky
la, lo = 48.137, 11.575
src = j("https://api.brightsky.dev/sources?lat=%s&lon=%s&max_dist=50000" % (la, lo))["sources"]
print("BS types:", sorted(set(s["observation_type"] for s in src)))
seen = set(); cand = []
for s in sorted([s for s in src if s["observation_type"] in ("synop", "current") and s.get("height") is not None], key=lambda s: s["distance"]):
    if s["station_name"] in seen: continue
    seen.add(s["station_name"]); cand.append(s)
cand = cand[:5]; st = []
for s in cand:
    w = j("https://api.brightsky.dev/current_weather?lat=%s&lon=%s&max_dist=2000" % (s["lat"], s["lon"]))
    so = w["sources"][0]; ww = w["weather"]
    print("  BS", s["station_name"], s["observation_type"], "->", so.get("station_name"), so.get("height"), ww.get("temperature"), ww.get("timestamp"))
    if ww.get("temperature") is not None: st.append({"n": so["station_name"], "la": so["lat"], "lo": so["lon"], "h": so["height"], "T": ww["temperature"], "d": km(la, lo, so["lat"], so["lon"])})
pe = j("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m" % (la, lo)); he = pe["elevation"]
v = om([{"la": la, "lo": lo, "h": he}] + st)
T, n = combine(v[0], he, st, v[1:])
print("München best_match=%.2f -> korrigiert %.2f (n=%d)" % (v[0], T, n))
# --- USA: New York über NWS
p = j("https://api.weather.gov/points/40.7128,-74.0060"); u = p["properties"]["observationStations"]
s = j(u)["features"][:6]
print("NWS stations:", [(f["properties"]["stationIdentifier"], round(km(40.7128, -74.006, f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]), 1), f["properties"]["elevation"]["value"]) for f in s])
o = j("https://api.weather.gov/stations/%s/observations/latest" % s[0]["properties"]["stationIdentifier"])
print("NWS latest:", o["properties"]["temperature"], o["properties"]["timestamp"])
