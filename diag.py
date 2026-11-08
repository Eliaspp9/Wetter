import re, time, gzip, urllib.request, urllib.error, datetime
UA = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io"}
def get(url):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40); b = r.read(); h = dict(r.headers); c = r.status
    except urllib.error.HTTPError as e:
        b = e.read(); h = dict(e.headers); c = e.code
    except Exception as e:
        print("ERR", url[:160], repr(e)[:120]); return None, None, b""
    print("%s %d bytes %.1fs ct=%s acao=%s %s" % (c, len(b), time.time() - t, h.get("Content-Type") or h.get("content-type"), h.get("Access-Control-Allow-Origin") or h.get("access-control-allow-origin"), url[:200]))
    return c, h, b
c, h, b = get("https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.3.0&request=GetCapabilities")
t = b.decode("utf-8", "replace")
for m in re.finditer(r"<Layer[^>]*>(.*?)</Layer>", t, re.S):
    seg = m.group(1)
    n = re.search(r"<Name>([^<]+)</Name>", seg); d = re.search(r'<Dimension[^>]*name="time"[^>]*>([^<]*)<', seg)
    if n: print("FMI layer", n.group(1), "time:", (d.group(1)[-160:] if d else None))
print(t[:1500])
now = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
f10 = now - datetime.timedelta(minutes=now.minute % 10)
for dt in (-20, -10, 0, 60, 180):
    tt = (f10 + datetime.timedelta(minutes=dt)).strftime("%Y-%m-%dT%H:%M:00.000Z")
    get("https://opendata.meteo.be/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=inca:Precipitation&styles=&crs=EPSG:3857&bbox=250000,6350000,750000,6750000&width=256&height=256&format=image/png&transparent=true&time=" + tt)
f5 = now - datetime.timedelta(minutes=now.minute % 5)
for dt in (-30, -15, -5, 0):
    tt = (f5 + datetime.timedelta(minutes=dt)).strftime("%Y-%m-%dT%H:%M:00Z")
    get("https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.3.0&request=GetMap&layers=Radar:suomi_rr_eureffin&styles=&crs=EPSG:3857&bbox=2000000,8000000,3500000,11000000&width=256&height=256&format=image/png&transparent=true&time=" + tt)
c, h, b = get("https://opendata.meteo.be/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities")
t = b.decode("utf-8", "replace"); i = t.find("<Name>inca:Precipitation</Name>"); print(t[i-200:i+2500])
