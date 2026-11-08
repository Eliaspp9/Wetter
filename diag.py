import urllib.request, urllib.error, json, time, datetime, math
G = "https://dataset.api.hub.geosphere.at/v1/"
H = {"Origin": "https://eliaspp9.github.io", "User-Agent": "wetter-diag"}
def get(u, t=60):
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); b = r.read()
        return r, json.loads(b), time.time() - t0, len(b)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, u[:160], e.read()[:400]); return None, None, time.time() - t0, 0
print("NOW", datetime.datetime.now(datetime.timezone.utc).isoformat())
r, m, dt, n = get(G + "grid/forecast/nowcast-v1-15min-1km/metadata")
for p in m["parameters"]: print("  P", json.dumps(p)[:200])
LA, LO = 48.2667, 13.4667
for path in ["timeseries/forecast/nowcast-v1-15min-1km", "timeseries/forecast/nowcast-v1-15min-1km/metadata"]:
    u = G + path + ("?parameters=t2m,rh2m,ff,fx,dd,td&lat_lon=%s,%s&output_format=geojson" % (LA, LO) if not path.endswith("metadata") else "")
    r, j, dt, n = get(u)
    if j is not None:
        print("TS", path, "%.2fs" % dt, n, "ACAO=", r.headers.get("access-control-allow-origin"))
        print("  ", json.dumps(j)[:1500])
# grid point via tiny bbox
r, j, dt, n = get(G + "grid/forecast/nowcast-v1-15min-1km?parameters=t2m&output_format=geojson&bbox=%.3f,%.3f,%.3f,%.3f" % (LA - .006, LO - .009, LA + .006, LO + .009))
if j: print("GRID t2m %.2fs" % dt, n, json.dumps(j)[:900])
# INCA analysis hourly? 
r, j, dt, n = get(G + "timeseries/historical/inca-v1-1h-1km/metadata")
if j: print("INCA meta", {k: v for k, v in j.items() if k not in ("parameters",)} )
# TAWES nearest stations
r, sm, dt, n = get(G + "station/current/tawes-v1-10min/metadata")
st = sm["stations"]
def km(a, b, c, d): return math.hypot((a - c) * 111.2, (b - d) * 111.2 * math.cos(math.radians(a)))
near = sorted(st, key=lambda s: km(LA, LO, s["lat"], s["lon"]))[:4]
ids = ",".join(str(s["id"]) for s in near)
r, o, dt, n = get(G + "station/current/tawes-v1-10min?parameters=TL&station_ids=" + ids)
for s, f in zip(near, o["features"]):
    print("ST", s["name"], s["id"], "%.1f km" % km(LA, LO, s["lat"], s["lon"]), "alt", s.get("altitude"), "TL", f["properties"]["parameters"]["TL"]["data"], o.get("timestamps"))
# Open-Meteo for comparison
for mdl in ["ecmwf_ifs", "best_match", "icon_d2", "geosphere_arome_austria"]:
    try:
        r, j, dt, n = get("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m&models=%s" % (LA, LO, mdl))
        print("OM", mdl, j and j.get("current"), j and j.get("elevation"))
    except Exception as e: print("OM ERR", mdl, e)
