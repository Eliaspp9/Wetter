import urllib.request, urllib.error, json, time, datetime, re, math, struct
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Referer": "https://eliaspp9.github.io/Wetter/"}
def get(u, t=40):
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); b = r.read()
        return r.status, r.headers, b, time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()[:300], time.time() - t0
    except Exception as e: return "ERR " + str(e)[:120], {}, b"", time.time() - t0
def pnginfo(b):
    if b[:8] != b"\x89PNG\r\n\x1a\n": return None
    w, h = struct.unpack(">II", b[16:24]); return (w, h, "type%d" % b[25], b"tRNS" in b[:2000])
def show(lab, u, body=0):
    s, h, b, dt = get(u)
    print("%-9s %s %.1fs %s %d B ACAO=%s png=%s" % (lab, s, dt, (h.get("content-type") if h else ""), len(b), h.get("access-control-allow-origin") if h else "", pnginfo(b)), u[:190], flush=True)
    if body and not pnginfo(b): print("   ", b[:body].decode("utf-8", "replace").replace("\n", " "))
    return s, h, b
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def merc(lo, la): return lo * 20037508.34 / 180, math.log(math.tan(math.radians(90 + la) / 2)) * 20037508.34 / math.pi
t5 = (now - datetime.timedelta(minutes=12)).replace(second=0, microsecond=0); t5 = t5.replace(minute=t5.minute - t5.minute % 5)
T5 = t5.strftime("%Y-%m-%dT%H:%M:00Z")
# Belgium in EPSG:4326 (WMS 1.3.0: lat,lon axis order) and 1.1.1
for v, crs, bb in [("1.3.0", "EPSG:4326", "50.2,3.0,51.6,6.0"), ("1.3.0", "CRS:84", "3.0,50.2,6.0,51.6"), ("1.1.1", "EPSG:4326", "3.0,50.2,6.0,51.6")]:
    k = "crs" if v == "1.3.0" else "srs"
    show("BE " + crs, "https://opendata.meteo.be/service/wms?service=WMS&version=%s&request=GetMap&layers=radar:belgian_rainfall_composite&styles=&%s=%s&bbox=%s&width=256&height=256&format=image/png&transparent=true&time=%s" % (v, k, crs, bb, T5), 300)
show("BE geoserver", "https://opendata.meteo.be/geoserver/ows?service=WMS&version=1.3.0&request=GetMap&layers=radar:belgian_rainfall_composite&styles=&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=256&height=256&format=image/png&transparent=true" % (merc(3, 50.2) + merc(6, 51.6)), 300)
# Netherlands
x0, y0 = merc(3.3, 50.7); x1, y1 = merc(7.3, 53.6)
for st in ["", "precip-blue-transparent/nearest", "radar/nearest"]:
    show("NL " + (st or "-"), "https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&version=1.3.0&request=GetMap&layers=RAD_NL25_PCP_CM&styles=%s&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=256&height=256&format=image/png&transparent=true&time=%s" % (st, x0, y0, x1, y1, T5), 300)
# Canada
x0, y0 = merc(-80, 43); x1, y1 = merc(-78, 44.5)
t6 = (now - datetime.timedelta(minutes=14)).replace(second=0, microsecond=0); t6 = t6.replace(minute=t6.minute - t6.minute % 6)
T6 = t6.strftime("%Y-%m-%dT%H:%M:00Z")
for lay in ["RADAR_1KM_RRAI", "RADAR_1KM_RSNO", "RADAR_1KM_RDBR", "RADAR_1KM_RRAI,RADAR_1KM_RSNO"]:
    show("CA " + lay[-4:], "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetMap&layers=%s&styles=&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=256&height=256&format=image/png&transparent=true&time=%s" % (lay, x0, y0, x1, y1, T6), 300)
s, h, b, dt = get("https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RDBR")
print("CA RDBR time", re.findall(rb'<Dimension name="time"[^>]*>([^<]{0,120})', b)[:1])
# Czech PNG transparency
t = now.replace(second=0, microsecond=0); t = t.replace(minute=t.minute - t.minute % 5) - datetime.timedelta(minutes=5)
show("CZ png", "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/pacz2gmaps3.z_max3d.%s.0.png" % t.strftime("%Y%m%d.%H%M"))
show("CZ mask", "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png_masked/pacz2gmaps3.z_max3d.%s.0.png" % t.strftime("%Y%m%d.%H%M"))
s, h, b, dt = get("https://opendata.chmi.cz/meteorology/weather/radar/")
print("CZ radar dir:", re.findall(rb'href="([^"]+)"', b)[:30])
s, h, b, dt = get("https://opendata.chmi.cz/meteorology/weather/radar/composite/")
print("CZ comp dir:", re.findall(rb'href="([^"]+)"', b)[:30])
# Japan tile png info and hrpns_nd
s, h, b, dt = get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"); T = json.loads(b)
show("JP", "https://www.jma.go.jp/bosai/jmatile/data/nowc/%s/none/%s/surf/hrpns/6/56/25.png" % (T[0]["basetime"], T[0]["validtime"]))
# USA latest and IEM via tile meta
show("US", "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/6/18/24.png")
