import urllib.request, urllib.error, json, time, datetime, math
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)"}
def j(u, t=40):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t).read())
    except urllib.error.HTTPError as e: return {"HTTP": e.code, "body": e.read()[:200].decode()}
def km(a, b, c, d): return math.hypot((a - c) * 111, (b - d) * 111 * math.cos(a * math.pi / 180))
la, lo = 48.137, 11.575
src = j("https://api.brightsky.dev/sources?lat=%s&lon=%s&max_dist=50000" % (la, lo))["sources"]
for s in sorted([s for s in src if s["observation_type"] in ("synop", "current")], key=lambda s: s["distance"])[:10]:
    print(s["observation_type"], s["id"], s.get("dwd_station_id"), s.get("wmo_station_id"), s["station_name"], round(s["distance"] / 1000, 1), s.get("height"), s.get("last_record"))
cw = j("https://api.brightsky.dev/current_weather?lat=%s&lon=%s" % (la, lo))
print("CW place:", cw.get("weather", {}).get("temperature"), cw.get("weather", {}).get("timestamp"), [(x.get("station_name"), x.get("observation_type"), round(x.get("distance", 0) / 1000, 1)) for x in cw.get("sources", [])][:4])
syn = [s for s in src if s["observation_type"] == "synop"]
syn = sorted(syn, key=lambda s: s["distance"])[:4]
for s in syn:
    for q in ["lat=%s&lon=%s&max_dist=2000" % (s["lat"], s["lon"]), "source_id=%s" % s["id"], "wmo_station_id=%s" % s.get("wmo_station_id"), "dwd_station_id=%s" % s.get("dwd_station_id")]:
        r = j("https://api.brightsky.dev/current_weather?" + q)
        w = r.get("weather") or {}
        print("  ", s["station_name"], q[:40], "->", r.get("HTTP"), w.get("temperature"), w.get("timestamp"), [(x.get("station_name"), x.get("observation_type")) for x in r.get("sources", [])][:2])
