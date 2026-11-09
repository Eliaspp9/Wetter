import urllib.request, urllib.error, json, time, datetime, math, statistics as S
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)"}
def j(u, t=60):
    for k in range(3):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t).read())
        except urllib.error.HTTPError as e:
            if k == 2: return {"HTTP": e.code, "body": e.read()[:300].decode()}
        except Exception as e:
            if k == 2: return {"ERR": str(e)}
        time.sleep(3)
def km(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))
G = "https://dataset.api.hub.geosphere.at/v1/"
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
meta = j(G + "station/current/tawes-v1-10min/metadata")
print("TAWES params:", [(p["name"], p.get("long_name", "")[:40], p.get("unit")) for p in meta["parameters"]][:40])
sm = [s for s in meta["stations"] if s.get("is_active", True) and s.get("altitude") is not None and 47.0 <= s["lat"] <= 49.0 and 12.5 <= s["lon"] <= 16.5]
ids = ",".join(str(s["id"]) for s in sm)
o = j(G + "station/current/tawes-v1-10min?parameters=TL,SO,GLOW,RF&station_ids=" + ids)
print("obs timestamps", o.get("timestamps"))
ob = {}
for f in o["features"]:
    p = f["properties"]["parameters"]; g = lambda k: (p.get(k) or {}).get("data", [None])[-1]
    ob[str(f["properties"]["station"])] = {"TL": g("TL"), "SO": g("SO"), "GLOW": g("GLOW"), "RF": g("RF")}
st = [s for s in sm if ob.get(str(s["id"]), {}).get("TL") is not None]
print("stations", len(st))
MODELS = ["ecmwf_ifs", "ecmwf_aifs025_single", "icon_d2", "icon_eu", "best_match", "gfs_seamless", "meteofrance_arome_france_hd", "knmi_harmonie_arome_europe"]
def om(pts, model):
    out = []
    for i in range(0, len(pts), 50):
        P = pts[i:i + 50]
        u = "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&elevation=%s&current=temperature_2m,cloud_cover,weather_code&models=%s&timezone=GMT" % (
            ",".join("%.4f" % s["lat"] for s in P), ",".join("%.4f" % s["lon"] for s in P), ",".join("%d" % s["altitude"] for s in P), model)
        r = j(u)
        if isinstance(r, dict) and ("HTTP" in r or "ERR" in r or "error" in r): print("  model", model, "fail", str(r)[:160]); return None
        r = r if isinstance(r, list) else [r]; out += [x.get("current") or {} for x in r]
    return out
M = {}
for m in MODELS:
    v = om(st, m)
    if v: M[m] = v
print("models ok:", list(M))
# INCA
def inca(P):
    out = []
    for i in range(0, len(P), 40):
        Q = P[i:i + 40]
        r = j(G + "timeseries/forecast/nowcast-v1-15min-1km?parameters=t2m&output_format=geojson&" + "&".join("lat_lon=%.4f,%.4f" % (s["lat"], s["lon"]) for s in Q))
        ts = [datetime.datetime.fromisoformat(t) for t in r["timestamps"]]; k = max([n for n, t in enumerate(ts) if t <= now] or [0])
        out += [f["properties"]["parameters"]["t2m"]["data"][k] for f in r["features"]]
    return out
try: IN = inca(st)
except Exception as e: IN = None; print("inca err", e)
low = [i for i, s in enumerate(st) if s["altitude"] < 700]
obsT = [ob[str(s["id"])]["TL"] for s in st]
def loo(base, idx):
    errs = []
    for i in idx:
        s = st[i]; num = den = 0; c = []
        for k, t in enumerate(st):
            if k == i or base[k] is None: continue
            d = km(s["lat"], s["lon"], t["lat"], t["lon"])
            if d <= 50: c.append((d, k))
        for d, k in sorted(c)[:8]:
            dh = abs(s["altitude"] - st[k]["altitude"]); w = 1 / (d + 5) ** 2 * math.exp(-(dh / 250) ** 2)
            num += w * (obsT[k] - base[k]); den += w
        if base[i] is None: continue
        errs.append(base[i] + (num / (den + 1 / 900) if den else 0) - obsT[i])
    return errs
bases = {m: [x.get("temperature_2m") for x in v] for m, v in M.items()}
if IN: bases["INCA"] = IN
def mean_of(keys):
    out = []
    for i in range(len(st)):
        v = [bases[k][i] for k in keys if k in bases and bases[k][i] is not None]
        out.append(S.mean(v) if v else None)
    return out
bases["mean ifs+aifs"] = mean_of(["ecmwf_ifs", "ecmwf_aifs025_single"])
bases["mean alle"] = mean_of([k for k in list(bases) if not k.startswith("mean")])
bases["mean ifs+aifs+icon_d2+INCA"] = mean_of(["ecmwf_ifs", "ecmwf_aifs025_single", "icon_d2", "INCA"])
print("\nTEMPERATUR (Stationen unter 700 m, n=%d): roh MAE / mit Stationen MAE" % len(low))
for k, b in bases.items():
    raw = [abs(b[i] - obsT[i]) for i in low if b[i] is not None]
    cor = [abs(e) for e in loo(b, low)]
    if raw: print("  %-28s roh %.2f  korrigiert %.2f" % (k, S.mean(raw), S.mean(cor) if cor else -1))
# Wolken: Sonnenschein der letzten 10 Minuten vs Modell-Bewölkung
print("\nWOLKEN (Tagsüber, SO = Sonnenschein in den letzten 10 Min.)")
day = [i for i in low if ob[str(st[i]["id"])]["SO"] is not None]
sunny = sum(1 for i in day if ob[str(st[i]["id"])]["SO"] >= 300); dull = sum(1 for i in day if ob[str(st[i]["id"])]["SO"] == 0)
print("  Stationen mit Sonne (>=5 von 10 Min.): %d, ohne Sonne: %d, von %d" % (sunny, dull, len(day)))
for m, v in M.items():
    hit = tot = 0
    for i in day:
        so = ob[str(st[i]["id"])]["SO"]; cc = v[i].get("cloud_cover")
        if cc is None: continue
        if so >= 300: tot += 1; hit += cc < 60
        elif so == 0: tot += 1; hit += cc >= 70
    print("  %-28s trifft %d von %d (%.0f%%)" % (m, hit, tot, 100 * hit / max(1, tot)))
mc = [S.mean([M[m][i].get("cloud_cover") for m in M if M[m][i].get("cloud_cover") is not None]) for i in range(len(st))]
hit = tot = 0
for i in day:
    so = ob[str(st[i]["id"])]["SO"]
    if so >= 300: tot += 1; hit += mc[i] < 60
    elif so == 0: tot += 1; hit += mc[i] >= 70
print("  %-28s trifft %d von %d (%.0f%%)" % ("Mittel aller Modelle", hit, tot, 100 * hit / max(1, tot)))
# Bei dir
for name, la, lo in [("Nöstlbach", 48.1666, 14.2461), ("Utzenaich", 48.2762, 13.4609)]:
    near = sorted(st, key=lambda s: km(la, lo, s["lat"], s["lon"]))[:5]
    print("\n==", name)
    for s in near: print("   ST %-24s %4.1f km TL=%s SO=%s s GLOW=%s RF=%s" % (s["name"][:24], km(la, lo, s["lat"], s["lon"]), *[ob[str(s["id"])][k] for k in ("TL", "SO", "GLOW", "RF")]))
    for m in MODELS:
        r = j("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,cloud_cover,cloud_cover_low,weather_code&models=%s" % (la, lo, m))
        c = (r.get("current") if isinstance(r, dict) else None) or {}
        print("   %-28s T=%s cc=%s low=%s code=%s" % (m, c.get("temperature_2m"), c.get("cloud_cover"), c.get("cloud_cover_low"), c.get("weather_code")))
for icao in ["LOWL", "LOWS", "LOWW", "EDDM", "LOWG"]:
    r = j("https://aviationweather.gov/api/data/metar?ids=%s&format=json" % icao)
    if isinstance(r, list) and r: x = r[0]; print("METAR", icao, x.get("rawOb"))
w = j("https://api.brightsky.dev/current_weather?lat=48.57&lon=13.43")
print("DWD Passau:", {k: (w.get("weather") or {}).get(k) for k in ("cloud_cover", "condition", "icon", "sunshine_30", "temperature")})
