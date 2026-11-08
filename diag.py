import urllib.request, urllib.error, json, time, datetime, re, math, struct
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Referer": "https://eliaspp9.github.io/Wetter/"}
def get(u, t=40, hd=None):
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=hd or H), timeout=t); b = r.read()
        return r.status, r.headers, b, time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()[:300], time.time() - t0
    except Exception as e: return "ERR " + str(e)[:120], {}, b"", time.time() - t0
def pngsz(b): return struct.unpack(">II", b[16:24]) if b[:8] == b"\x89PNG\r\n\x1a\n" else None
def show(lab, u, body=0, hd=None):
    s, h, b, dt = get(u, hd=hd)
    print("%-9s %s %.1fs %s %d B ACAO=%s png=%s" % (lab, s, dt, (h.get("content-type") if h else ""), len(b), h.get("access-control-allow-origin") if h else "", pngsz(b)), u[:170], flush=True)
    if body: print("   ", b[:body].decode("utf-8", "replace").replace("\n", " "))
    return s, h, b
now = datetime.datetime.now(datetime.timezone.utc); print("NOW", now.isoformat())
def merc(lo, la): return lo * 20037508.34 / 180, math.log(math.tan(math.radians(90 + la) / 2)) * 20037508.34 / math.pi
# Belgium
s, h, b, dt = get("https://opendata.meteo.be/service/wms?service=WMS&version=1.3.0&request=GetCapabilities", 60)
i = b.find(b"radar:belgian_rainfall_composite")
print("BE cap layer block:", b[i - 200:i + 1500].decode("utf-8", "replace").replace("\n", " ")[:1700] if i > 0 else None)
x0, y0 = merc(3.0, 50.2); x1, y1 = merc(6.0, 51.6)
for lay in ["radar:belgian_rainfall_composite", "radar:rainfall"]:
    u = "https://opendata.meteo.be/service/wms?service=WMS&version=1.3.0&request=GetMap&layers=%s&styles=&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=256&height=256&format=image/png&transparent=true" % (lay, x0, y0, x1, y1)
    show("BE-map", u, 200 if True else 0)
    show("BE-noref", u, 0, {"User-Agent": "Mozilla/5.0"})
# Netherlands KNMI ADAGUC
for u in ["https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetCapabilities", "https://geoservices.knmi.nl/wms?dataset=RADAR&service=WMS&request=GetCapabilities"]:
    s, h, b = show("NL-cap", u)
    print("   ", re.findall(rb"<Name>([^<]+)</Name>", b)[:12], re.findall(rb'<Dimension name="time"[^>]*>([^<]{0,120})', b)[:2])
# Canada combined
x0, y0 = merc(-80, 43); x1, y1 = merc(-78, 44.5)
show("CA-2lay", "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetMap&layers=RADAR_1KM_RRAI,RADAR_1KM_RSNO&styles=&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=256&height=256&format=image/png&transparent=true&time=2026-11-08T20:00:00Z" % (x0, y0, x1, y1))
s, h, b = show("CA-capS", "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RSNO")
print("   ", re.findall(rb'<Dimension name="time"[^>]*>([^<]{0,120})', b)[:1])
# Japan zoom range
def tile(z, la, lo):
    n = 2 ** z; return z, int((lo + 180) / 360 * n), int((1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n)
s, h, b, dt = get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"); T = json.loads(b)
print("JP N1", len(T), T[0]["basetime"], T[-1]["basetime"])
s, h, b, dt = get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json"); T2 = json.loads(b)
print("JP N2", len(T2), T2[0]["validtime"], T2[-1]["validtime"])
for z in [3, 4, 6, 8, 10, 11]:
    show("JP z%d" % z, "https://www.jma.go.jp/bosai/jmatile/data/nowc/%s/none/%s/surf/hrpns/%d/%d/%d.png" % ((T[0]["basetime"], T[0]["validtime"]) + tile(z, 35.68, 139.7)))
# Czech: newest file vs now, image size, check a few names
for m in range(0, 30, 5):
    t = now - datetime.timedelta(minutes=m); t = t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)
    s, h, b, dt = get("https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/pacz2gmaps3.z_max3d.%s.0.png" % t.strftime("%Y%m%d.%H%M"))
    print("CZ", t.strftime("%H:%M"), s, len(b), pngsz(b))
s, h, b = show("CZ-scl", "https://opendata.chmi.cz/meteorology/weather/radar/scl/scl-dbzmmh.png")
s, h, b = show("CZ-lic", "https://opendata.chmi.cz/", 0)
print("   lic:", re.findall(rb"(?i)(cc[ -]by[^<]{0,40}|licen[^<]{0,80})", b)[:5])
# Hungary png
s, h, b, dt = get("https://odp.met.hu/weather/radar/composite/png/refl2D/")
f = re.findall(rb'href="(radar_composite-refl2D-\d{8}_\d{4}\.png)"', b)
if f: show("HU-png", "https://odp.met.hu/weather/radar/composite/png/refl2D/" + f[-1].decode()); print("   newest", f[-1])
s, h, b = show("HU-desc", "https://odp.met.hu/weather/radar/composite/png/", 0)
for nm in re.findall(rb'href="([^"]+\.(?:pdf|txt|xml|json|pgw|wld))"', b)[:5]: print("   ", nm)
