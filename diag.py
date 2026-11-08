import urllib.request, json, time, datetime
G = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata"
H = {"User-Agent": "wetter-diag"}
def j(u): return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30).read())
def now(): return datetime.datetime.now(datetime.timezone.utc)
def hm(t): return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%H:%M")
def others():
    out = []
    for n, u in [("librewxr", "https://api.librewxr.net/public/weather-maps.json"), ("rainviewer", "https://api.rainviewer.com/public/weather-maps.json")]:
        try:
            m = j(u); p = m["radar"]["past"]; t = p[-1]["time"]
            out.append("%s last=%s age=%.1fmin n=%d gen=%s" % (n, hm(t), (time.time() - t) / 60, len(p), hm(m.get("generated", 0))))
        except Exception as e: out.append("%s ERR %s" % (n, e))
    return " | ".join(out)
l0 = j(G)["last_forecast_reftime"]; print("START", now().strftime("%H:%M:%S"), l0, others(), flush=True)
seen = 0
for k in range(1, 80):
    time.sleep(30)
    try: l = j(G + "?t=%d" % k)["last_forecast_reftime"]
    except Exception as e: print("ERR", e); continue
    if l != l0:
        r = datetime.datetime.fromisoformat(l)
        print("NEW", now().strftime("%H:%M:%S"), l, "lag=%.1fmin" % ((now() - r).total_seconds() / 60), others(), flush=True)
        l0 = l; seen += 1
        if seen >= 2: break
    elif k % 10 == 0: print("..", now().strftime("%H:%M:%S"), others(), flush=True)
print("END", now().strftime("%H:%M:%S"))
