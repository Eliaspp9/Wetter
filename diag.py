import json, time, gzip, urllib.request, urllib.parse, urllib.error

UA = {"User-Agent": "Mozilla/5.0 wetter-diag", "Origin": "https://eliaspp9.github.io", "Accept-Encoding": "gzip"}
KEEP = ("access-control-allow-origin", "content-encoding", "content-type", "datapoint-count", "x-ratelimit-remaining-hour", "content-length", "cache-control", "vary")


def get(url):
    t = time.time()
    req = urllib.request.Request(url, headers=UA)
    try:
        r = urllib.request.urlopen(req, timeout=150)
        b = r.read(); h = dict(r.headers); code = r.status
    except urllib.error.HTTPError as e:
        b = e.read(); h = dict(e.headers); code = e.code
    except Exception as e:
        print("ERR", url[:220], repr(e)); return None, None, None
    raw = len(b)
    if (h.get("Content-Encoding") or h.get("content-encoding") or "").lower() == "gzip":
        b = gzip.decompress(b)
    print("%s raw=%d json=%d %.1fs %s" % (code, raw, len(b), time.time() - t, url[:230]))
    print("   hdr", {k: v for k, v in h.items() if k.lower() in KEEP})
    if code != 200:
        print("   body", b[:400])
    return code, h, b


G = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km"

print("== nowcast metadata")
c, h, b = get(G + "/metadata")
if b:
    m = json.loads(b)
    print("   ", {k: m.get(k) for k in ("last_forecast_reftime", "forecast_length", "response_formats", "bbox", "bbox_outer", "available_forecast_reftimes", "max_forecast_offset")})
    print("   params", [(p.get("name"), p.get("unit")) for p in m.get("parameters", [])])


def summarize(b, label):
    j = json.loads(b)
    T = j.get("timestamps") or []
    F = j.get("features") or []
    print("  ", label, "keys", list(j.keys()), "reference_time", j.get("reference_time"), "n_feat", len(F), "n_T", len(T))
    print("   T", T)
    if F:
        print("   feat0", json.dumps(F[0])[:400])
    for k in range(len(T)):
        nn = 0; wet = 0; mx = -1; at = None
        for f in F:
            d = f["properties"]["parameters"]["rr"]["data"]
            v = d[k] if k < len(d) else None
            if v is None:
                continue
            nn += 1
            if v >= 0.025:
                wet += 1
            if v > mx:
                mx = v; at = f["geometry"]["coordinates"]
        print("   %s nonnull=%d wet>=0.025=%d max=%.3f at=%s" % (T[k], nn, wet, mx, at))
    return j


print("== app-like nowcast, Innviertel, ~35000 km2")
c, h, b = get(G + "?parameters=rr&output_format=geojson&bbox=47.55,11.90,48.90,14.90")
j1 = summarize(b, "innviertel") if c == 200 else None

print("== app default bbox at zoom 8 smaller (~15000 km2)")
c, h, b = get(G + "?parameters=rr&output_format=geojson&bbox=47.80,12.70,48.65,14.15")

if j1 and j1.get("timestamps"):
    t0 = j1["timestamps"][0][:16]
    print("== whole Austria, one timestep", t0)
    c, h, b = get(G + "?parameters=rr&output_format=geojson&bbox=45.50,8.10,49.48,17.74&start=" + urllib.parse.quote(t0) + "&end=" + urllib.parse.quote(t0))
    if c == 200:
        summarize(b, "austria")

print("== nowcast with start 30 min back (Innviertel small)")
import datetime
now = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
st = (now - datetime.timedelta(minutes=now.minute % 15 + 45)).strftime("%Y-%m-%dT%H:%M")
c, h, b = get(G + "?parameters=rr&output_format=geojson&bbox=48.10,13.30,48.35,13.55&start=" + st)
if c == 200:
    summarize(b, "start-45")

print("== Open-Meteo main forecast as the app requests it, different models")
base = "https://api.open-meteo.com/v1/forecast?latitude=48.2333&longitude=13.4167&timezone=auto&forecast_days=7"
cur = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day,cloud_cover,wind_gusts_10m"
hr = "temperature_2m,precipitation_probability,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,snowfall,is_day"
dl = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max"
for mdl in ("ecmwf_ifs", "ecmwf_ifs025", "ecmwf_ifs,best_match", "best_match"):
    print("-- models=" + mdl)
    c, h, b = get(base + "&current=" + cur + "&hourly=" + hr + "&daily=" + dl + "&models=" + mdl)
    if c != 200:
        continue
    j = json.loads(b)
    print("   current", json.dumps(j.get("current"))[:900])
    H = j.get("hourly", {})
    for k, v in H.items():
        if k == "time":
            continue
        nul = [i for i, x in enumerate(v) if x is None]
        print("   hourly %-40s n=%d nulls=%d first_null=%s sample=%s" % (k, len(v), len(nul), nul[:1], v[:4]))
    D = j.get("daily", {})
    for k, v in D.items():
        print("   daily %-40s %s" % (k, v[:7]))
    print("   time0", H.get("time", [None])[:3], "elev", j.get("elevation"))

print("== minutely_15 with ecmwf_ifs")
c, h, b = get("https://api.open-meteo.com/v1/forecast?latitude=48.2333&longitude=13.4167&current=temperature_2m&forecast_days=2&timezone=auto&minutely_15=precipitation,rain,snowfall&models=ecmwf_ifs")
if c == 200:
    j = json.loads(b); m = j.get("minutely_15", {})
    print("   ", {k: (v[:8] if isinstance(v, list) else v) for k, v in m.items()})

print("== SNOWGRID timeseries like the app")
d1 = (now - datetime.timedelta(days=1)).strftime("%Y-%m-%d"); d7 = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%d")
c, h, b = get("https://dataset.api.hub.geosphere.at/v1/timeseries/historical/snowgrid_cl-v2-1d-1km?parameters=snow_depth&start=" + d7 + "&end=" + d1 + "&output_format=geojson&lat_lon=47.475,13.606&lat_lon=47.329,12.737")
if c == 200:
    print("   ", b[:900])

print("== dwd-icon snowfall height")
c, h, b = get("https://api.open-meteo.com/v1/dwd-icon?latitude=48.2333&longitude=13.4167&timezone=auto&forecast_days=2&hourly=freezing_level_height,snowfall_height,precipitation")
if c == 200:
    j = json.loads(b); print("   ", {k: v[:6] for k, v in j["hourly"].items()})
