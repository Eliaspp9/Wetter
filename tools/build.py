#!/usr/bin/env python3
"""Nach jeder Änderung an index.html ausführen:  python3 tools/build.py
- prüft alle Skripte der Seite, den Service Worker und den Worker auf Schreibfehler (bricht bei einem Fehler ab)
- berechnet die Prüfsummen aller Inline-Skripte neu und schreibt die Sicherheitsregel (CSP) in index.html
- schreibt version.json (Build und Neuerungen; daran erkennt die App ein Update, ohne die ganze Seite zu laden)
- kopiert index.html nach wetter2.html (alte Adresse, leitet automatisch um)

Versionen: <meta name="app-build"> zählt bei jeder Veröffentlichung um 1 hoch (auch ältere Geräte erkennen daran ein Update).
Angezeigt wird „Version (Build n)“ mit n = app-build − 56, also app-build 57 = Version 1.0 (Build 1)."""
import re, hashlib, base64, shutil, sys, pathlib, json, html, subprocess, tempfile, os
root = pathlib.Path(__file__).resolve().parent.parent
p = root / "index.html"
s = p.read_text(encoding="utf-8")
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', s)
scripts = re.findall(r'<script>(.*?)</script>', s, re.S)

def check_js(code, name, module=False):
    """Schreibfehler finden, bevor sie auf dem Handy landen (braucht Node; ohne Node wird die Prüfung übersprungen)"""
    if not shutil.which("node"): return
    with tempfile.NamedTemporaryFile("w", suffix=".mjs" if module else ".cjs", delete=False, encoding="utf-8") as f:
        f.write(code); tmp = f.name
    try:
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if r.returncode != 0: sys.exit("FEHLER in %s:\n%s" % (name, r.stderr.replace(tmp, name)))
    finally: os.unlink(tmp)
for n, code in enumerate(scripts): check_js(code, "index.html, Skript %d" % (n + 1))
check_js((root / "sw.js").read_text(encoding="utf-8"), "sw.js")
check_js((root / "worker" / "kachelmann-proxy.js").read_text(encoding="utf-8"), "worker/kachelmann-proxy.js", module=True)

def lint():
    """Mit ESLint (falls installiert) nach Namen suchen, die es nicht gibt, und nach Unbenutztem. Fehler brechen ab, Hinweise werden nur gezeigt."""
    if not shutil.which("eslint"): return "ohne ESLint"
    with tempfile.TemporaryDirectory() as d:
        dd = pathlib.Path(d); names = {}
        for n, code in enumerate(scripts):
            (dd / ("s%d.cjs" % n)).write_text(code, encoding="utf-8"); names["s%d.cjs" % n] = "index.html, Skript %d" % (n + 1)
        (dd / "sw.cjs").write_text((root / "sw.js").read_text(encoding="utf-8"), encoding="utf-8"); names["sw.cjs"] = "sw.js"
        (dd / "worker.mjs").write_text((root / "worker" / "kachelmann-proxy.js").read_text(encoding="utf-8"), encoding="utf-8"); names["worker.mjs"] = "worker/kachelmann-proxy.js"
        shutil.copyfile(root / "tools" / "eslint.config.mjs", dd / "eslint.config.mjs")
        r = subprocess.run(["eslint", "-c", "eslint.config.mjs", "--format", "json", "."], cwd=d, capture_output=True, text=True)
        try: res = json.loads(r.stdout)
        except Exception: return "ESLint lief nicht (%s)" % (r.stderr.strip().split("\n")[0][:80] if r.stderr else "keine Ausgabe")
        err = warn = 0
        for f in res:
            for m in f["messages"]:
                bad = m.get("severity") == 2; err += bad; warn += not bad
                print("  %s %s, Zeile %d: %s" % ("FEHLER" if bad else "Hinweis", names.get(pathlib.Path(f["filePath"]).name, f["filePath"]), m.get("line", 0), m["message"]))
        if err: sys.exit("Abbruch: %d Fehler im Code (siehe oben)" % err)
        return "ESLint ohne Fehler" + (", %d Hinweise" % warn if warn else "")
lint_info = lint()
for f in re.findall(r'"((?:fonts|icons)/[^"]+)"', (root / "sw.js").read_text(encoding="utf-8")):
    if not (root / f).exists(): sys.exit("FEHLER: sw.js nennt %s, die Datei gibt es nicht" % f)

hashes = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() for x in scripts]
csp = "; ".join([
    "default-src 'none'",
    # nur genau die Leaflet-Dateien, nicht ganze Paket-Server (dort könnte jeder fremde Skripte ablegen)
    "script-src " + " ".join(hashes) + " https://unpkg.com/leaflet@1.9.4/dist/leaflet.js https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
    "style-src 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/dist/leaflet.css https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
    "font-src 'self'",
    "img-src 'self' data: blob: https://server.arcgisonline.com https://tile.openstreetmap.org https://tiles.maps.eox.at https://maps.dwd.de https://*.rainviewer.com https://librewxr.net https://*.librewxr.net https://view.eumetsat.int https://mesonet.agron.iastate.edu https://s3.amazonaws.com https://openwms.fmi.fi https://geoservices.knmi.nl https://opendata.chmi.cz https://geo.weather.gc.ca https://www.jma.go.jp",
    "connect-src 'self' https://api.open-meteo.com https://previous-runs-api.open-meteo.com https://geocoding-api.open-meteo.com https://api.rainviewer.com https://api.librewxr.net https://api.brightsky.dev https://warnungen.zamg.at https://api.bigdatacloud.net https://wetter-proxy.elias-ziegler.workers.dev https://air-quality-api.open-meteo.com https://dataset.api.hub.geosphere.at https://photon.komoot.io https://api.mymemory.translated.net https://api.weather.gov https://geo.weather.gc.ca https://www.jma.go.jp",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'self'", "manifest-src 'self'",
    "upgrade-insecure-requests"])
tag = '<meta http-equiv="Content-Security-Policy" content="%s">\n' % csp
s = s.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + tag, 1)
assert s.count("Content-Security-Policy") == 1
p.write_text(s, encoding="utf-8")
shutil.copyfile(p, root / "wetter2.html")
# kleine Datei für die Update-Suche
def meta(name):
    m = re.search(r'<meta name="%s" content="([^"]*)"' % name, s)
    return html.unescape(m.group(1)) if m else ""
build = int(meta("app-build") or 0)
(root / "version.json").write_text(json.dumps({"b": build, "v": meta("app-version"), "n": meta("app-notes")}, ensure_ascii=False) + "\n", encoding="utf-8")
# Hilfsseite mit dem Worker-Code: eigene, strenge Sicherheitsregel
w = root / "worker.html"
if w.exists():
    t = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', w.read_text(encoding="utf-8"))
    wh = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() for x in re.findall(r'<script>(.*?)</script>', t, re.S)]
    wcsp = "default-src 'none'; script-src %s; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-src 'none'" % " ".join(wh)
    t = t.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="%s">\n' % wcsp, 1)
    assert t.count("Content-Security-Policy") == 1
    w.write_text(t, encoding="utf-8")
print("Geprüft (%s) und gebaut: Version %s (Build %d, app-build %d), %d Inline-Skripte, version.json und wetter2.html geschrieben" % (lint_info, meta("app-version"), build - 56, build, len(hashes)))
