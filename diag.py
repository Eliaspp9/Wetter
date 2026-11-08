import json, time, gzip, urllib.request, urllib.parse, urllib.error

UA = {"User-Agent": "Mozilla/5.0 wetter-diag", "Origin": "https://eliaspp9.github.io", "Accept-Encoding": "gzip", "Accept": "application/json"}


def get(url, data=None, hdr=None):
    t = time.time()
    h = dict(UA); h.update(hdr or {})
    req = urllib.request.Request(url, headers=h, data=data)
    try:
        r = urllib.request.urlopen(req, timeout=60); b = r.read(); hh = dict(r.headers); code = r.status
    except urllib.error.HTTPError as e:
        b = e.read(); hh = dict(e.headers); code = e.code
    except Exception as e:
        print("ERR", url[:150], repr(e)); return None, None, None
    raw = len(b)
    if (hh.get("Content-Encoding") or "").lower() == "gzip": b = gzip.decompress(b)
    print("%s raw=%d json=%d %.1fs %s" % (code, raw, len(b), time.time() - t, url[:160]))
    print("   hdr", {k: v for k, v in hh.items() if k.lower() in ("access-control-allow-origin", "content-encoding", "content-type", "cache-control")})
    return code, hh, b


for slug in ("italy", "croatia", "switzerland", "czechia", "slovenia", "netherlands", "france", "spain", "united-kingdom", "hungary"):
    print("=== meteoalarm", slug)
    c, h, b = get("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + slug)
    if c != 200: continue
    j = json.loads(b); W = j.get("warnings") or []
    print("   keys", list(j.keys()), "n", len(W))
    langs = {}; poly = 0; geot = {}; aw = {}
    for w in W:
        for inf in (w.get("alert") or {}).get("info") or []:
            langs[inf.get("language")] = langs.get(inf.get("language"), 0) + 1
            for a in inf.get("area") or []:
                if a.get("polygon"): poly += 1
                for g in a.get("geocode") or []:
                    geot[g.get("valueName")] = geot.get(g.get("valueName"), 0) + 1
            for p in inf.get("parameter") or []:
                if p.get("valueName") in ("awareness_type", "awareness_level"):
                    aw[p.get("value")] = aw.get(p.get("value"), 0) + 1
    print("   langs", langs); print("   polygons", poly, "geocodes", geot); print("   aw", list(aw.items())[:12])
    if W:
        w = W[0]; print("   sample", json.dumps(w)[:1500])

print("=== MyMemory")
c, h, b = get("https://api.mymemory.translated.net/get?q=" + urllib.parse.quote("Strong wind gusts up to 80 km/h are expected in the afternoon.") + "&langpair=en|de")
if b: print("   ", b[:400])
c, h, b = get("https://api.mymemory.translated.net/get?q=" + urllib.parse.quote("Possibili temporali forti con grandine nel pomeriggio.") + "&langpair=it|de")
if b: print("   ", b[:400])

print("=== NWS")
c, h, b = get("https://api.weather.gov/alerts/active?point=39.74,-104.99", hdr={"Accept": "application/geo+json"})
if b: print("   ", b[:600])

print("=== Lingva / others")
for u in ("https://lingva.ml/api/v1/en/de/Strong%20wind", "https://translate.argosopentech.com/translate"):
    get(u)
