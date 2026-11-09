import urllib.request, re
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag", "Origin": "https://eliaspp9.github.io"})
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
    except Exception as e: return -1, {}, str(e).encode()
for nm,u in [("eumetsat","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities"),
             ("dwd","https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetCapabilities")]:
    s,h,b=get(u); t=b.decode("utf8","replace")
    names=re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]*)</Title>",t)
    hits=[(n,ti) for n,ti in names if re.search(r"fog|nebel|stratus|low.?cloud|ctype|cloud.?type|night",n+ti,re.I)]
    print(nm,s,"ACAO",{k.lower():v for k,v in h.items()}.get("access-control-allow-origin"),"layers",len(names))
    for x in hits[:40]: print("   ",x)
for u in ["https://www.foto-webcam.eu/","https://www.foto-webcam.eu/webcam/include/list.php","https://www.foto-webcam.eu/impressum"]:
    s,h,b=get(u); t=b.decode("utf8","replace"); i=t.lower().find("nutzung"); print("WC",s,u,len(t), re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",t[max(0,i-300):i+900]))[:900] if i>=0 else "")
