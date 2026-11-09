import urllib.request, urllib.parse, json, time, datetime, math, statistics as S
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io"}
def get(u, t=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); return r, r.read()
def j(u, t=60): return json.loads(get(u, t)[1])
G = "https://dataset.api.hub.geosphere.at/v1/"
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def km(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))
# ---- CORS checks
for lab, u in [("METAR", "https://aviationweather.gov/api/data/metar?bbox=47.5,12.5,48.8,14.8&format=json"),
               ("CH-CSV", "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv"),
               ("CH-geojson", "https://data.geo.admin.ch/ch.meteoschweiz.messwerte-lufttemperatur-10min/ch.meteoschweiz.messwerte-lufttemperatur-10min_de.json"),
               ("BS-sources", "https://api.brightsky.dev/sources?lat=48.57&lon=13.43&max_dist=40000"),
               ("BS-cw-id", "https://api.brightsky.dev/current_weather?dwd_station_id=03029"),
               ("NWS", "https://api.weather.gov/stations/KNYC/observations/latest")]:
    try:
        r, b = get(u, 30)
        print("%-10s %s ACAO=%s type=%s %dB" % (lab, r.status, r.headers.get("access-control-allow-origin"), r.headers.get("content-type"), len(b)))
        print("    ", b[:420].decode("utf-8", "replace").replace("\n", " | "))
    except Exception as e: print(lab, "ERR", e)
# ---- Leave-one-out for Upper Austria stations
sm = [s for s in j(G + "station/current/tawes-v1-10min/metadata")["stations"] if s.get("is_active", True)]
reg = [s for s in sm if 47.6 <= s["lat"] <= 48.8 and 12.8 <= s["lon"] <= 15.0 and s.get("altitude") is not None]
ids = ",".join(str(s["id"]) for s in reg)
o = j(G + "station/current/tawes-v1-10min?parameters=TL&station_ids=" + ids)
obs = {str(f["properties"]["station"]): f["properties"]["parameters"]["TL"]["data"][-1] for f in o["features"]}
reg = [s for s in reg if obs.get(str(s["id"])) is not None]
print("stations", len(reg), "obs", o.get("timestamps"))
def om(pts, model):
    out = []
    for i in range(0, len(pts), 50):
        P = pts[i:i + 50]
        u = "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&elevation=%s&current=temperature_2m&models=%s" % (
            ",".join("%.4f" % p[0] for p in P), ",".join("%.4f" % p[1] for p in P), ",".join("%d" % p[2] for p in P), model)
        r = j(u); r = r if isinstance(r, list) else [r]; out += [(x.get("current") or {}).get("temperature_2m") for x in r]
    return out
pts = [(s["lat"], s["lon"], s["altitude"]) for s in reg]
M = {m: om(pts, m) for m in ["best_match", "ecmwf_ifs"]}
def inca(P):
    out = []
    for i in range(0, len(P), 40):
        Q = P[i:i + 40]
        r = j(G + "timeseries/forecast/nowcast-v1-15min-1km?parameters=t2m&output_format=geojson&" + "&".join("lat_lon=%.4f,%.4f" % (a, b) for a, b, c in Q))
        ts = [datetime.datetime.fromisoformat(t) for t in r["timestamps"]]
        k = max([n for n, t in enumerate(ts) if t <= now] or [0])
        out += [f["properties"]["parameters"]["t2m"]["data"][k] for f in r["features"]]
    return out
try: IN = inca(pts)
except Exception as e: IN = [None] * len(pts); print("INCA err", e)
def predict(i, base):
    s = reg[i]; num = den = 0
    for k, t in enumerate(reg):
        if k == i or base[k] is None: continue
        d = km(s["lat"], s["lon"], t["lat"], t["lon"])
        if d > 40: continue
        dh = abs(s["altitude"] - t["altitude"])
        w = 1 / (d + 3) ** 2 * math.exp(-(dh / 300) ** 2)
        num += w * (obs[str(t["id"])] - base[k]); den += w
    return base[i] + (num / den if den else 0)
def nearest(i):
    s = reg[i]; best = min((km(s["lat"], s["lon"], t["lat"], t["lon"]), k) for k, t in enumerate(reg) if k != i)
    return obs[str(reg[best[1]]["id"])]
E = {"raw best_match": [], "raw ecmwf": [], "raw INCA": [], "nearest station": [], "best_match+bias": [], "ecmwf+bias": [], "INCA+bias": []}
for i, s in enumerate(reg):
    t = obs[str(s["id"])]
    if M["best_match"][i] is None: continue
    E["raw best_match"].append(M["best_match"][i] - t); E["raw ecmwf"].append(M["ecmwf_ifs"][i] - t)
    if IN[i] is not None: E["raw INCA"].append(IN[i] - t); E["INCA+bias"].append(predict(i, IN) - t)
    E["nearest station"].append(nearest(i) - t)
    E["best_match+bias"].append(predict(i, M["best_match"]) - t); E["ecmwf+bias"].append(predict(i, M["ecmwf_ifs"]) - t)
for k, v in E.items():
    if v: print("%-18s n=%d MAE=%.2f bias=%+.2f max=%.1f" % (k, len(v), S.mean(abs(x) for x in v), S.mean(v), max(abs(x) for x in v)))
