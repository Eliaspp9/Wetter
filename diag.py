import urllib.request, urllib.error, json, time, datetime
B = "https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km"
H = {"Origin": "https://eliaspp9.github.io", "User-Agent": "wetter-diag"}
def get(u, t=90):
    t0 = time.time()
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t)
    b = r.read(); return r, b, time.time() - t0
print("NOW", datetime.datetime.now(datetime.timezone.utc).isoformat())
r, b, dt = get(B + "/metadata")
m = json.loads(b)
print("META %.2fs %d bytes" % (dt, len(b)))
for k in r.headers.keys(): print("  H", k, "=", r.headers.get(k))
for k, v in m.items():
    if k == "parameters": print("  K parameters", len(v)); continue
    print("  K", k, "=", json.dumps(v)[:300])
try:
    r, b, dt = get(B + "/metadata?c=123"); print("META ?c= ok %.2fs" % dt)
except urllib.error.HTTPError as e: print("META ?c= HTTP", e.code, e.read()[:200])
# OPTIONS preflight not needed for simple GET; check data endpoint timing small and medium
st = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
st = st - datetime.timedelta(minutes=st.minute % 15 + 45)
for bb in ["48.24,13.44,48.29,13.49", "48.1,13.3,48.4,13.6"]:
    u = B + "?parameters=rr&output_format=geojson&bbox=" + bb + "&start=" + st.strftime("%Y-%m-%dT%H:%M")
    try:
        r, b, dt = get(u); j = json.loads(b)
        print("DATA", bb, "%.2fs" % dt, len(b), "ref=", j.get("reference_time"), "ts=", (j.get("timestamps") or [])[:3], len(j.get("timestamps") or []), "ACAO=", r.headers.get("access-control-allow-origin"))
    except Exception as e: print("DATA ERR", bb, e)
