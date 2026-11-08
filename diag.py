import re, time, gzip, urllib.request, urllib.error, datetime

UA = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io", "Accept-Encoding": "gzip"}


def get(url, show=True):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40); b = r.read(); h = dict(r.headers); c = r.status
    except urllib.error.HTTPError as e:
        b = e.read(); h = dict(e.headers); c = e.code
    except Exception as e:
        print("ERR", url[:160], repr(e)[:120]); return None, None, b""
    if (h.get("Content-Encoding") or "").lower() == "gzip": b = gzip.decompress(b)
    if show:
        print("%s %d bytes %.1fs %s" % (c, len(b), time.time() - t, url[:170]))
        print("   ", {k: v for k, v in h.items() if k.lower() in ("access-control-allow-origin", "content-type")})
    return c, h, b


def caps(name, url, pat):
    print("=====", name)
    c, h, b = get(url)
    if not b: return
    t = b.decode("utf-8", "replace")
    names = re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]*)</Title>", t)
    hits = [n for n in names if re.search(pat, n[0] + " " + n[1], re.I)]
    print("   layers", len(names), "matching", hits[:15])
    for n, _ in hits[:4]:
        i = t.find("<Name>" + n + "</Name>")
        seg = t[i:i + 4000]
        dm = re.search(r'<(Dimension|Extent)[^>]*name="time"[^>]*>([^<]*)<', seg)
        print("   ", n, "time:", (dm.group(2)[:200] if dm else None))


caps("KNMI", "https://geoservices.knmi.nl/adagucserver?dataset=RADAR&SERVICE=WMS&REQUEST=GetCapabilities", "rad|pcp|precip")
caps("FMI", "https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.3.0&request=GetCapabilities", "suomi|rr|dbz")
caps("Canada", "https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI", "RADAR")
caps("Schweiz geo.admin", "https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities", "meteoschweiz|radar|niederschlag")
caps("Belgien RMI", "https://opendata.meteo.be/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities", "radar|rain|precip")
caps("Norwegen MET", "https://public-wms.met.no/verportal/verportal.map?service=WMS&version=1.3.0&request=GetCapabilities", "radar|precip")
caps("Italien DPC", "https://radar-geowms.protezionecivile.it/service?service=WMS&version=1.3.0&request=GetCapabilities", "radar|sri|vmi")
caps("Polen IMGW", "https://mapy.meteo.pl/geoserver/wms?service=WMS&request=GetCapabilities", "radar|cmax")
caps("Tschechien CHMI", "https://geoportal.chmi.cz/server/services/RADAR/MapServer/WMSServer?service=WMS&request=GetCapabilities", "radar|max")
caps("Slowenien ARSO", "https://gis.arso.gov.si/wms/meteo?service=WMS&request=GetCapabilities", "radar|padav")
caps("Dänemark DMI", "https://dmigw.govcloud.dk/v2/radardata/wms?service=WMS&request=GetCapabilities", "radar")
caps("Estland", "https://kaart.ilmateenistus.ee/geoserver/wms?service=WMS&request=GetCapabilities", "radar")

print("===== US IEM NEXRAD tiles")
for u in ("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/6/18/24.png",
          "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913-m05m/6/18/24.png",
          "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913-m50m/6/18/24.png"):
    get(u)

print("===== KNMI GetMap test")
now = datetime.datetime.now(datetime.timezone.utc)
get("https://geoservices.knmi.nl/adagucserver?dataset=RADAR&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=RAD_NL25_PCP_CM&STYLES=&CRS=EPSG:3857&BBOX=0,6000000,1000000,7200000&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true")
print("===== FMI GetMap test")
get("https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.3.0&request=GetMap&layers=Radar:suomi_rr_eureffin&styles=&crs=EPSG:3857&bbox=2000000,8000000,3500000,11000000&width=256&height=256&format=image/png&transparent=true")
