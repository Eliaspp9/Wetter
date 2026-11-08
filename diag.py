import json, time, gzip, urllib.request, urllib.parse, urllib.error, datetime, http.client, ssl

UA = {"User-Agent": "Mozilla/5.0 wetter-diag", "Origin": "https://eliaspp9.github.io", "Accept-Encoding": "gzip"}


def get(url, show=True):
    t = time.time()
    req = urllib.request.Request(url, headers=UA)
    try:
        r = urllib.request.urlopen(req, timeout=150)
        ttfb = time.time() - t
        b = r.read(); h = dict(r.headers); code = r.status
    except urllib.error.HTTPError as e:
        b = e.read(); h = dict(e.headers); code = e.code; ttfb = time.time() - t
    except Exception as e:
        print("ERR %.1fs" % (time.time() - t), url[:200], repr(e)); return None, None, None
    raw = len(b)
    if (h.get("Content-Encoding") or "").lower() == "gzip":
        b = gzip.decompress(b)
    print("%s raw=%d json=%d ttfb=%.1fs total=%.1fs %s" % (code, raw, len(b), ttfb, time.time() - t, url[:200]))
    if code != 200:
        print("   body", b[:400])
    return code, h, b


G = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km"
now = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
st = (now - datetime.timedelta(minutes=now.minute % 15 + 45)).strftime("%Y-%m-%dT%H:%M")
print("== GeoSphere timing, repeated")
for bb in ("48.10,13.30,48.35,13.55", "47.80,12.70,48.65,14.15", "47.55,11.90,48.90,14.90"):
    for extra in ("", "&start=" + st):
        get(G + "?parameters=rr&output_format=geojson&bbox=" + bb + extra)
print("== GeoSphere timeseries one point (fast path?)")
get("https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km?parameters=rr&lat_lon=48.2333,13.4167")
print("== netcdf size for comparison")
get(G + "?parameters=rr&output_format=netcdf&bbox=47.55,11.90,48.90,14.90")

print("== previous-runs with ECMWF")
base = "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=48.233&longitude=13.417&past_days=30&forecast_days=3&timezone=GMT&hourly="
V1 = "temperature_2m,cloud_cover,cloud_cover_low,wind_speed_10m,temperature_2m_previous_day1,cloud_cover_previous_day1,cloud_cover_low_previous_day1,wind_speed_10m_previous_day1"
for m in ("ecmwf_ifs", "ecmwf_ifs025"):
    c, h, b = get(base + V1 + "&models=" + m)
    if c == 200:
        H = json.loads(b)["hourly"]
        for k, v in H.items():
            if k == "time":
                print("   time", v[0], v[-1], len(v)); continue
            nul = sum(1 for x in v if x is None)
            print("   %-36s n=%d nulls=%d first_nonnull=%s last=%s" % (k, len(v), nul, next((i for i, x in enumerate(v) if x is not None), None), v[-30:-26]))

print("== field layers with ECMWF (multi location, unixtime)")
la = "47.8,48.0,48.2,48.4"; lo = "13.0,13.4,13.8,14.2"
for v, cur in (("temperature_2m", True), ("wind_speed_10m,wind_direction_10m,wind_gusts_10m", True), ("cloud_cover,cloud_cover_low", True), ("precipitation,snowfall", False), ("pressure_msl", True)):
    u = "https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + ("&current=" + v if cur else "") + "&hourly=" + v + "&forecast_hours=49&timeformat=unixtime&timezone=GMT&models=ecmwf_ifs"
    c, h, b = get(u)
    if c == 200:
        j = json.loads(b); a = j[0]
        print("   cur", a.get("current"))
        for k, x in a["hourly"].items():
            if k != "time":
                print("   %-22s nulls=%d %s" % (k, sum(1 for y in x if y is None), x[:5]))

print("== peaks with ECMWF (elevation, snow_depth)")
pv = "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,cloud_cover,snow_depth"
u = "https://api.open-meteo.com/v1/forecast?latitude=47.475,47.818&longitude=13.606,13.719&elevation=2995,1592&current=" + pv + "&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto&models=ecmwf_ifs"
c, h, b = get(u)
if c == 200:
    for a in json.loads(b):
        print("   ", a.get("elevation"), a.get("current"), a.get("daily", {}).get("temperature_2m_max"))
u2 = u.replace("models=ecmwf_ifs", "models=best_match")
c, h, b = get(u2)
if c == 200:
    for a in json.loads(b):
        print("   bm", a.get("elevation"), a.get("current"))

print("== trend 14 days ECMWF")
c, h, b = get("https://api.open-meteo.com/v1/forecast?latitude=48.233&longitude=13.417&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&forecast_days=14&timezone=auto&models=ecmwf_ifs")
if c == 200:
    D = json.loads(b)["daily"]
    for k, v in D.items():
        print("   %-32s %s" % (k, v))

print("== hours 48 ecmwf_ifs hourly time step check (3h after 90h?)")
c, h, b = get("https://api.open-meteo.com/v1/forecast?latitude=48.233&longitude=13.417&hourly=temperature_2m,precipitation,weather_code&forecast_days=7&timezone=auto&models=ecmwf_ifs")
if c == 200:
    H = json.loads(b)["hourly"]
    print("   T 90-110", H["temperature_2m"][90:110]); print("   P 90-110", H["precipitation"][90:110]); print("   W 90-110", H["weather_code"][90:110])
