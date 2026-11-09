import urllib.request, urllib.error, json, time, datetime, re, math, io
from PIL import Image
H = {"User-Agent": "Mozilla/5.0 (wetter-diag)", "Origin": "https://eliaspp9.github.io"}
def get(u, t=60):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=t); return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()[:500]
B = "https://view.eumetsat.int/geoserver/"
print("NOW", datetime.datetime.now(datetime.timezone.utc).isoformat())
s, h, b = get(B + "mtg_fd/wms?service=WMS&version=1.3.0&request=GetCapabilities", 90)
for nm in [b"mtg_fd:li_afa", b"mtg_fd:li_aft", b"mtg_fd:li_afr", b"mtg_fd:li_lfl"]:
    i = b.find(b"<Name>" + nm + b"</Name>")
    if i < 0: print("no", nm); continue
    blk = b[i:i + 2500].decode("utf-8", "replace")
    print("====", nm.decode()); print(re.sub(r"\s+", " ", blk)[:1500])
print("all li names:", sorted(set(re.findall(rb"<Name>(mtg_fd:li[^<]*)</Name>", b))))
def merc(lo, la): return lo * 20037508.34 / 180, math.log(math.tan(math.radians(90 + la) / 2)) * 20037508.34 / math.pi
def imerc(x, y): return x / 20037508.34 * 180, math.degrees(2 * math.atan(math.exp(y / 20037508.34 * math.pi)) - math.pi / 2)
def getmap(bb, w=512, hgt=512, lay="mtg_fd:li_afa"):
    x0, y0 = merc(bb[0], bb[1]); x1, y1 = merc(bb[2], bb[3])
    u = B + "wms?service=WMS&version=1.3.0&request=GetMap&layers=%s&styles=&crs=EPSG:3857&bbox=%f,%f,%f,%f&width=%d&height=%d&format=image/png&transparent=true" % (lay, x0, y0, x1, y1, w, hgt)
    s, h, b = get(u); im = Image.open(io.BytesIO(b)).convert("RGBA"); return im, (x0, y0, x1, y1)
im, (x0, y0, x1, y1) = getmap((-25, -38, 60, 65), 1024, 1024)
px = [(x, y, im.getpixel((x, y))) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3] > 0]
print("big image colored px:", len(px), "colors:", sorted(set(p[2] for p in px))[:12])
if px:
    # dichteste Stelle
    from collections import Counter
    c = Counter((p[0] // 16, p[1] // 16) for p in px).most_common(3); print("hot cells", c)
    cx, cy = c[0][0][0] * 16 + 8, c[0][0][1] * 16 + 8
    lo, la = imerc(x0 + (x1 - x0) * cx / im.width, y1 - (y1 - y0) * cy / im.height); print("hot spot", round(lo, 2), round(la, 2))
    for z in [5, 7, 9, 11, 13, 15]:
        span = 360 / 2 ** z * 2  # zwei Kacheln breit
        bb = (lo - span / 2, la - span / 2 * math.cos(math.radians(la)), lo + span / 2, la + span / 2 * math.cos(math.radians(la)))
        im2, _ = getmap(bb, 512, 512)
        n = sum(1 for y in range(0, 512, 2) for x in range(0, 512, 2) if im2.getpixel((x, y))[3] > 0)
        print("  zoom", z, "colored px (sampled)", n, "of", 256 * 256)
