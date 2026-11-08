#!/usr/bin/env python3
"""Nach jeder Änderung an index.html ausführen:  python3 tools/build.py
- berechnet die Prüfsummen aller Inline-Skripte neu und schreibt die Sicherheitsregel (CSP) in index.html
- kopiert index.html nach wetter2.html (alte Adresse, leitet automatisch um)"""
import re, hashlib, base64, shutil, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
p = root / "index.html"
s = p.read_text(encoding="utf-8")
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', s)
scripts = re.findall(r'<script>(.*?)</script>', s, re.S)
hashes = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() for x in scripts]
csp = "; ".join([
    "default-src 'none'",
    # nur genau die Leaflet-Dateien, nicht ganze Paket-Server (dort könnte jeder fremde Skripte ablegen)
    "script-src " + " ".join(hashes) + " https://unpkg.com/leaflet@1.9.4/dist/leaflet.js https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
    "style-src 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com/leaflet@1.9.4/dist/leaflet.css https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://server.arcgisonline.com https://tile.openstreetmap.org https://tiles.maps.eox.at https://maps.dwd.de https://*.rainviewer.com https://librewxr.net https://*.librewxr.net https://view.eumetsat.int",
    "connect-src 'self' https://api.open-meteo.com https://previous-runs-api.open-meteo.com https://geocoding-api.open-meteo.com https://api.rainviewer.com https://api.librewxr.net https://api.brightsky.dev https://warnungen.zamg.at https://api.bigdatacloud.net https://wetter-proxy.elias-ziegler.workers.dev https://air-quality-api.open-meteo.com https://dataset.api.hub.geosphere.at https://photon.komoot.io",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'self'", "manifest-src 'self'",
    "upgrade-insecure-requests"])
tag = '<meta http-equiv="Content-Security-Policy" content="%s">\n' % csp
s = s.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + tag, 1)
assert s.count("Content-Security-Policy") == 1
p.write_text(s, encoding="utf-8")
shutil.copyfile(p, root / "wetter2.html")
# Hilfsseite mit dem Worker-Code: eigene, strenge Sicherheitsregel
w = root / "worker.html"
if w.exists():
    t = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', w.read_text(encoding="utf-8"))
    wh = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() for x in re.findall(r'<script>(.*?)</script>', t, re.S)]
    wcsp = "default-src 'none'; script-src %s; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-src 'none'" % " ".join(wh)
    t = t.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="%s">\n' % wcsp, 1)
    assert t.count("Content-Security-Policy") == 1
    w.write_text(t, encoding="utf-8")
print("CSP aktualisiert,", len(hashes), "Inline-Skripte, wetter2.html kopiert")
