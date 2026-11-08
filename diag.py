import urllib.request, json, time, datetime
B = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata"
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S")
def last(k): return json.loads(urllib.request.urlopen(urllib.request.Request(B + "?t=%d" % k, headers={"User-Agent": "wetter-diag"}), timeout=30).read())["last_forecast_reftime"]
l0 = last(0); print("START", now(), l0, flush=True)
seen = 0
for k in range(1, 60):
    time.sleep(30)
    try: l = last(k)
    except Exception as e: print("ERR", now(), e); continue
    if l != l0:
        print("NEW", now(), l, flush=True); l0 = l; seen += 1
        if seen >= 2: break
print("END", now(), l0)
