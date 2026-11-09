import urllib.request, urllib.error, json, time, datetime, re, struct, zlib
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io"}
def get(u, t=60):
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); b = r.read(); return r.status, r.headers, b, time.time() - t0
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()[:500], time.time() - t0
    except Exception as e: return "ERR " + str(e)[:100], {}, b"", time.time() - t0
B = "https://view.eumetsat.int/geoserver/"
print("NOW", datetime.datetime.now(datetime.timezone.utc).isoformat())
s, h, b, dt = get(B + "mtg_fd/wms?service=WMS&version=1.3.0&request=GetCapabilities", 90)
print("WMS cap", s, "%.1fs" % dt, len(b))
for m in re.finditer(rb"<Layer[^>]*>\s*<Name>(mtg_fd:li[^<]*)</Name>\s*<Title>([^<]*)</Title>(.*?)</Layer>", b, re.S):
    blk = m.group(3)
    dim = re.search(rb'<Dimension name="time"[^>]*>([^<]{0,200})', blk)
    sc = re.findall(rb"<(Min|Max)ScaleDenominator>([^<]+)<", blk)
    st = re.findall(rb"<Style>\s*<Name>([^<]+)</Name>", blk)
    print("  LAYER", m.group(1).decode(), "|", m.group(2).decode()[:70], "| time:", (dim.group(1)[-80:] if dim else None), "| scale", sc, "| styles", st[:4])
s, h, b, dt = get(B + "wfs?service=WFS&version=2.0.0&request=GetCapabilities", 90)
print("WFS cap", s, "%.1fs" % dt, len(b))
print("  WFS li types:", re.findall(rb"<(?:wfs:)?Name>([^<]*li[^<]*)</(?:wfs:)?Name>", b)[:20])
# GetMap CORS + content over Europe/Africa at several zooms
def merc(lo, la):
    import math; return lo * 20037508.34 / 180, math.log(math.tan(math.radians(90 + la) / 2)) * 20037508.34 / math.pi
for nm, bb in [("Afrika gross", (-20, -35, 55, 38)), ("Europa", (-10, 35, 30, 60)), ("Zentralafrika z8", (15, -2, 16.4, -0.6))]:
    x0, y0 = merc(bb[0], bb[1]); x1, y1 = merc(bb[2], bb[3])
    u = B + "wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=%d,%d,%d,%d&width=512&height=512&format=image/png&transparent=true" % (x0, y0, x1, y1)
    s, h, b, dt = get(u)
    print("GetMap", nm, s, "%.1fs" % dt, h.get("content-type") if h else "", len(b), "ACAO=", h.get("access-control-allow-origin") if h else "")
s, h, b, dt = get(B + "wms?service=WMS&version=1.1.1&request=GetStyles&layers=mtg_fd:li_afa")
print("STYLE", s, len(b)); print(b[:3000].decode("utf-8", "replace"))
