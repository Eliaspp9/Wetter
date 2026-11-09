import urllib.request, urllib.parse, json, time, datetime, math
H = {"User-Agent": "wetter-diag"}
def j(u, t=60): return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t).read())
G = "https://dataset.api.hub.geosphere.at/v1/"
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def km(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))
places = []
for q in ["Nöstlbach", "Wohlmuthen", "Utzenaich"]:
    try:
        r = j("https://geocoding-api.open-meteo.com/v1/search?count=5&language=de&name=" + urllib.parse.quote(q))
        for x in r.get("results", [])[:3]:
            print("GEO", q, x.get("name"), x.get("latitude"), x.get("longitude"), x.get("elevation"), x.get("admin1"), x.get("admin2"), x.get("country_code"))
            if x.get("country_code") == "AT": places.append((x["name"], x["latitude"], x["longitude"], x.get("elevation"))); break
    except Exception as e: print("GEO ERR", q, e)
sm = j(G + "station/current/tawes-v1-10min/metadata")["stations"]
def inca(pts):
    u = G + "timeseries/forecast/nowcast-v1-15min-1km?parameters=t2m&output_format=geojson&" + "&".join("lat_lon=%.4f,%.4f" % (a, b) for a, b in pts)
    r = j(u); ts = [datetime.datetime.fromisoformat(t) for t in r["timestamps"]]
    out = []
    for f in r["features"]:
        d = f["properties"]["parameters"]["t2m"]["data"]
        i = max([k for k, t in enumerate(ts) if t <= now] or [0]); k2 = min(i + 1, len(ts) - 1)
        fr = (now - ts[i]).total_seconds() / 900 if k2 > i and now > ts[i] else 0
        out.append(round(d[i] + (d[k2] - d[i]) * max(0, min(1, fr)), 2))
    return out, r.get("reference_time")
def om(pts, model, elev=None):
    la = ",".join("%.4f" % p[0] for p in pts); lo = ",".join("%.4f" % p[1] for p in pts)
    u = "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m&models=%s" % (la, lo, model)
    if elev: u += "&elevation=" + ",".join(str(e) for e in elev)
    r = j(u); r = r if isinstance(r, list) else [r]
    return [(x.get("current") or {}).get("temperature_2m") for x in r], [x.get("elevation") for x in r], [(x.get("current") or {}).get("time") for x in r]
for name, la, lo, el in places:
    near = sorted(sm, key=lambda s: km(la, lo, s["lat"], s["lon"]))[:8]
    ids = ",".join(str(s["id"]) for s in near)
    o = j(G + "station/current/tawes-v1-10min?parameters=TL&station_ids=" + ids)
    obs = {f["properties"]["station"]: f["properties"]["parameters"]["TL"]["data"][-1] for f in o["features"]}
    pts = [(la, lo)] + [(s["lat"], s["lon"]) for s in near]
    iv, ref = inca(pts)
    models = {}
    for mdl in ["best_match", "ecmwf_ifs", "icon_d2", "geosphere_arome_austria", "icon_seamless"]:
        try: models[mdl] = om(pts, mdl, [el or 0] + [s.get("altitude") or 0 for s in near])
        except Exception as e: models[mdl] = ([None] * len(pts), [None] * len(pts), [str(e)[:60]])
    print("\n===", name, la, lo, "elev", el, "obs time", o.get("timestamps"), "INCA ref", ref)
    print("  PLACE: INCA %s | " % iv[0] + " | ".join("%s %s (grid %s m)" % (m, v[0][0], v[1][0]) for m, v in models.items()))
    for k, s in enumerate(near, 1):
        tl = obs.get(str(s["id"])) if str(s["id"]) in obs else obs.get(s["id"])
        print("  ST %-28s %5.1f km %4s m  TL=%s  INCA=%s  " % (s["name"][:28], km(la, lo, s["lat"], s["lon"]), s.get("altitude"), tl, iv[k]) + "  ".join("%s=%s" % (m[:6], v[0][k]) for m, v in models.items()))
