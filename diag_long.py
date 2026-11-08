import urllib.request, json, time, datetime
B = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km"
H = {"Origin": "https://eliaspp9.github.io", "User-Agent": "wetter-diag"}
def get(u, t=60):
    t0 = time.time()
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t)
    b = r.read(); return r, b, time.time() - t0
def now(): return datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S")
r, b, dt = get(B + "/metadata")
m = json.loads(b)
print("META", now(), "%.1fs" % dt, len(b), "bytes", "ACAO=", r.headers.get("access-control-allow-origin"), "CC=", r.headers.get("cache-control"), "ETag=", r.headers.get("etag"))
print({k: (v if not isinstance(v, (list, dict)) else (str(v)[:200])) for k, v in m.items() if k != "parameters"})
last = m.get("last_forecast_reftime")
end = time.time() + 44 * 60
k = 0
while time.time() < end:
    time.sleep(45); k += 1
    try:
        r, b, dt = get(B + "/metadata?c=%d" % k)
        m = json.loads(b); lr = m.get("last_forecast_reftime")
        flag = "NEW" if lr != last else ""
        print("META", now(), "%.1fs" % dt, lr, flag, flush=True)
        if flag:
            last = lr
            st = (datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0))
            st = st - datetime.timedelta(minutes=st.minute % 15 + 45)
            u = B + "?parameters=rr&output_format=geojson&bbox=48.1,13.3,48.4,13.6&start=" + st.strftime("%Y-%m-%dT%H:%M")
            r, b, dt = get(u, 90); j = json.loads(b)
            print("  DATA %.1fs ref=%s first=%s n=%d" % (dt, j.get("reference_time"), (j.get("timestamps") or [None])[0], len(j.get("timestamps") or [])), flush=True)
    except Exception as e:
        print("ERR", now(), e, flush=True)
