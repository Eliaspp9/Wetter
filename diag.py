import urllib.request, json, struct, zlib, io
def get(u, hdr=None):
    r = urllib.request.Request(u, headers=dict({"User-Agent":"diag","Origin":"https://eliaspp9.github.io"}, **(hdr or {})))
    try:
        with urllib.request.urlopen(r, timeout=25) as x:
            return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return -1, {}, str(e).encode()
def png_info(b):
    if b[:8] != b'\x89PNG\r\n\x1a\n': return "not png "+repr(b[:60])
    i=8; out=[]; plte=None; idat=b''
    while i < len(b):
        n=struct.unpack(">I",b[i:i+4])[0]; t=b[i+4:i+8]; d=b[i+8:i+8+n]
        if t==b'IHDR': w,h,bd,ct=struct.unpack(">IIBB",d[:10]); out.append(f"{w}x{h} bd{bd} ct{ct}")
        if t==b'PLTE': plte=[tuple(d[k:k+3]) for k in range(0,len(d),3)]; out.append(f"plte{len(plte)}")
        if t==b'tRNS': out.append(f"trns{len(d)}")
        i+=12+n
    return " ".join(out)
for name,u in [("lx","https://api.librewxr.net/public/weather-maps.json"),("rv","https://api.rainviewer.com/public/weather-maps.json")]:
    s,h,b=get(u); print(name,s,h.get("Access-Control-Allow-Origin"))
    try:
        j=json.loads(b); host=j["host"]; p=j["radar"]["past"][-1]["path"]; print(" host",host,"path",p, "nowcast",len(j["radar"].get("nowcast",[])))
        for z,x,y in [(7,68,44),(6,34,22)]:
            for sch in ["2/1_1","0/0_0","1/0_0","4/1_1","2/0_0"]:
                tu=f"{host}{p}/256/{z}/{x}/{y}/{sch}.png"
                s2,h2,b2=get(tu); print(" ",z,sch,s2,"ACAO=",h2.get("Access-Control-Allow-Origin"),h2.get("Content-Type"),len(b2),png_info(b2) if s2==200 else b2[:80])
    except Exception as e: print(" err",e)
for u in ["https://www.rainviewer.com/files/rainviewer_api_colors_table.csv","https://www.rainviewer.com/api/color-schemes.html","https://www.rainviewer.com/files/rainviewer_api_colors_table.json"]:
    s,h,b=get(u); print(u,s,len(b))
    if s==200 and u.endswith(".csv"): print(b.decode("utf8","replace")[:6000])
    if s==200 and u.endswith(".html"):
        t=b.decode("utf8","replace"); k=t.find("csv"); print(t[max(0,k-300):k+300])
s,h,b=get("https://github.com/librewxr/librewxr"); print("lxgh",s)
