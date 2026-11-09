import urllib.request, json
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag", "Origin": "https://eliaspp9.github.io"})
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
    except Exception as e: return -1, {}, str(e).encode()
for u in ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/8/137/89.png",
          "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/8/137/89.png",
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/9/275/178.png"]:
    s,h,b=get(u); hl={k.lower():v for k,v in h.items()}
    print("DEM",s,hl.get("access-control-allow-origin"),hl.get("content-type"),hl.get("cache-control"),len(b),u)
la=[47.5+0.5*i for i in range(3)]; lo=[13.0+0.5*j for j in range(3)]
LA=",".join(str(a) for a in la for b in lo); LO=",".join(str(b) for a in la for b in lo)
s,h,b=get("https://api.open-meteo.com/v1/forecast?latitude="+LA+"&longitude="+LO+"&current=temperature_2m,relative_humidity_2m&timezone=UTC")
j=json.loads(b); print("OM",s,type(j).__name__,len(j)); print(json.dumps(j[:2])[:700])
