import urllib.request, urllib.error, json, time, datetime, re, math
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io", "Referer": "https://eliaspp9.github.io/Wetter/"}
def get(u, t=40, n=None):
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); b = r.read()
        return r.status, r.headers, b, time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()[:300], time.time() - t0
    except Exception as e: return "ERR " + str(e)[:120], {}, b"", time.time() - t0
def show(lab, u, body=0):
    s, h, b, dt = get(u)
    print("%-10s %s %.1fs %s %d B ACAO=%s" % (lab, s, dt, (h.get("content-type") if h else ""), len(b), h.get("access-control-allow-origin") if h else ""), u[:150], flush=True)
    if body: print("   ", b[:body].decode("utf-8", "replace").replace("\n", " "))
    return s, h, b
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def tile(z, la, lo):
    n = 2 ** z; x = int((lo + 180) / 360 * n); y = int((1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n); return z, x, y
# --- USA
z, x, y = tile(6, 40.7, -74)
for suf in ["", "-m05m", "-m50m"]:
    show("US", "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913%s/%d/%d/%d.png" % (suf, z, x, y))
show("US-json", "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json", 300)
# --- Canada
s, h, b = show("CA-cap", "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI")
m = re.search(rb'<Dimension name="time"[^>]*>([^<]+)<', b); print("   CA time:", m and m.group(1)[:200])
m2 = re.search(rb'<Dimension name="time"[^>]*default="([^"]+)"', b); print("   CA default:", m2 and m2.group(1))
bb = "-8922952,5009377,-8766409,5165920"
show("CA-map", "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetMap&layers=RADAR_1KM_RRAI&styles=&crs=EPSG:3857&bbox=%s&width=256&height=256&format=image/png&transparent=true" % bb)
# --- Czech
s, h, b = show("CZ-dir", "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/")
f = re.findall(rb'pacz2gmaps3\.z_max3d\.(\d{8})\.(\d{4})\.0\.png', b)
if f:
    last = f[-1]; print("   CZ files", len(f), "first", f[0], "last", last)
    show("CZ-png", "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/pacz2gmaps3.z_max3d.%s.%s.0.png" % (last[0].decode(), last[1].decode()))
s, h, b = show("CZfc-dir", "https://opendata.chmi.cz/meteorology/weather/radar/composite/fct_maxz/png/")
f = re.findall(rb'href="([^"]+\.png)"', b); print("   CZ fct", len(f), f[-3:] if f else None)
# --- Japan
s, h, b = show("JP-times", "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json", 300)
try:
    T = json.loads(b); t0 = T[0]
    z, x, y = tile(6, 35.68, 139.7)
    show("JP-tile", "https://www.jma.go.jp/bosai/jmatile/data/nowc/%s/none/%s/surf/hrpns/%d/%d/%d.png" % (t0["basetime"], t0["validtime"], z, x, y))
except Exception as e: print("JP parse", e)
show("JP-times2", "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json", 200)
# --- Belgium
s, h, b = show("BE-cap", "https://opendata.meteo.be/service/wms?service=WMS&version=1.3.0&request=GetCapabilities")
print("   BE radar layers:", re.findall(rb"<Name>([^<]*(?:adar|RADAR)[^<]*)</Name>", b)[:10])
# --- Hungary
s, h, b = show("HU-dir", "https://odp.met.hu/weather/radar/composite/", 600)
for sub in ["png/refl2D/", "png/", "refl2D/"]:
    s, h, b = show("HU-" + sub, "https://odp.met.hu/weather/radar/composite/" + sub)
    if s == 200: print("    ", re.findall(rb'href="([^"]+)"', b)[-4:])
# --- FMI
show("FI-map", "https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.3.0&request=GetMap&layers=Radar:suomi_rr_eureffin&styles=&crs=EPSG:3857&bbox=2504688,8399737,2817774,8712823&width=256&height=256&format=image/png&transparent=true")
# --- DMI / Denmark, Poland IMGW, Slovakia probes
show("DK", "https://opendataapi.dmi.dk/v1/radardata/collections", 400)
show("PL", "https://danepubliczne.imgw.pl/api/data/product", 200)
