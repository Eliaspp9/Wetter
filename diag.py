import urllib.request, urllib.parse, json, time, datetime, math, statistics as S
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io"}
def get(u, t=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); return r, r.read()
def j(u, t=60): return json.loads(get(u, t)[1])
G = "https://dataset.api.hub.geosphere.at/v1/"
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def km(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))
# ---- Leave-one-out for Upper Austria stations
sm = [s for s in j(G + "station/current/tawes-v1-10min/metadata")["stations"] if s.get("is_active", True)]
reg = [s for s in sm if 47.0 <= s["lat"] <= 49.0 and 12.5 <= s["lon"] <= 16.5 and s.get("altitude") is not None]
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
def predict(i, base, D=3, HS=300, R=40, W0=0, N=99):
    s = reg[i]; num = den = 0; c = []
    for k, t in enumerate(reg):
        if k == i or base[k] is None: continue
        d = km(s["lat"], s["lon"], t["lat"], t["lon"])
        if d > R: continue
        c.append((d, k))
    for d, k in sorted(c)[:N]:
        t = reg[k]; dh = abs(s["altitude"] - t["altitude"])
        w = 1 / (d + D) ** 2 * math.exp(-(dh / HS) ** 2)
        num += w * (obs[str(t["id"])] - base[k]); den += w
    return base[i] + (num / (den + W0) if den else 0)
low = [i for i, s in enumerate(reg) if s["altitude"] < 700]
print("lowland n", len(low))
for nm, base in [("INCA", IN), ("best", M["best_match"]), ("ecmwf", M["ecmwf_ifs"])]:
    if base[0] is None: continue
    print(nm, "raw lowMAE=%.2f allMAE=%.2f" % (S.mean(abs(base[i] - obs[str(reg[i]["id"])]) for i in low), S.mean(abs(base[i] - obs[str(reg[i]["id"])]) for i in range(len(reg)))))
    for D, HS, R, W0, N in [(3, 300, 40, 0, 99), (5, 250, 50, 0, 8), (5, 250, 50, 1/900, 8), (5, 150, 50, 1/900, 8), (10, 250, 60, 0, 8), (5, 400, 50, 0, 6), (2, 250, 40, 0, 4)]:
        el = [predict(i, base, D, HS, R, W0, N) - obs[str(reg[i]["id"])] for i in range(len(reg))]
        print("  D=%s HS=%s R=%s W0=%.4f N=%s  lowMAE=%.2f allMAE=%.2f max=%.1f" % (D, HS, R, W0, N, S.mean(abs(el[i]) for i in low), S.mean(abs(x) for x in el), max(abs(x) for x in el)))
