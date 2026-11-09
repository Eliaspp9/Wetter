"""Liest die Einstellungen des bestehenden Workers bei Cloudflare (Konto, KV-Speicher SUBS, Zeitplan, Kompatibilitätsdatum)
und schreibt daraus worker/wrangler.toml. So bleiben Speicher und Zeitplan erhalten; Geheimnisse (Passwort, Kachelmann-Schlüssel)
bleibt bei Cloudflare und werden hier weder gelesen noch geschrieben. Dazu kommt die Bindung AI (Workers AI)."""
import json, os, sys, urllib.request

TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
NAME = os.environ.get("WORKER", "wetter-proxy")

def api(path):
    r = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as x:
        j = json.loads(x.read())
    if not j.get("success"):
        raise SystemExit("Cloudflare-Fehler bei " + path.split("?")[0] + ": " + json.dumps(j.get("errors"))[:300])
    return j["result"]

acc = None
for a in api("/accounts?per_page=50"):
    names = [s.get("id") for s in api("/accounts/%s/workers/scripts" % a["id"])]
    if NAME in names:
        acc = a["id"]; break
if not acc:
    raise SystemExit("Den Worker '%s' gibt es in keinem Konto, auf das der Token Zugriff hat." % NAME)

st = api("/accounts/%s/workers/scripts/%s/settings" % (acc, NAME))
kv = [b for b in st.get("bindings", []) if b.get("type") == "kv_namespace"]
subs = [b for b in kv if b.get("name") == "SUBS"]
if not subs:
    raise SystemExit("Beim Worker ist keine KV-Bindung SUBS eingerichtet; abgebrochen, damit nichts verloren geht.")
try:
    crons = [c["cron"] for c in api("/accounts/%s/workers/scripts/%s/schedules" % (acc, NAME)).get("schedules", [])]
except SystemExit:
    crons = []
if not crons:
    crons = ["*/10 * * * *"]
cd = st.get("compatibility_date") or "2024-09-23"
other = [b.get("type") + ":" + b.get("name", "") for b in st.get("bindings", []) if b.get("type") not in ("kv_namespace", "secret_text", "plain_text", "ai")]
if other:
    print("Hinweis: weitere Bindungen, die nicht übernommen werden:", other)

toml = []
toml.append('name = "%s"' % NAME)
toml.append('main = "kachelmann-proxy.js"')
toml.append('account_id = "%s"' % acc)
toml.append('compatibility_date = "%s"' % cd)
toml.append("workers_dev = true")
toml.append("keep_vars = true")
for b in kv:
    toml.append("")
    toml.append("[[kv_namespaces]]")
    toml.append('binding = "%s"' % b["name"])
    toml.append('id = "%s"' % b["namespace_id"])
toml.append("")
toml.append("[ai]")
toml.append('binding = "AI"')
toml.append("")
toml.append("[triggers]")
toml.append("crons = [%s]" % ", ".join('"%s"' % c for c in crons))
open(os.path.join(os.path.dirname(__file__), "wrangler.toml"), "w").write("\n".join(toml) + "\n")
print("wrangler.toml geschrieben: KV", [b["name"] for b in kv], "Zeitplan", crons, "Datum", cd, "+ AI")
