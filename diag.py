import urllib.request, json, struct
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: return -1, str(e).encode()
def chunks(b):
    i=8; out=[]
    while i < len(b):
        n=struct.unpack(">I",b[i:i+4])[0]; out.append((b[i+4:i+8],b[i+8:i+8+n])); i+=12+n
    return out
def pal(name,b):
    ch=chunks(b); h=[d for t,d in ch if t==b'IHDR'][0]; w,hh,bd,ct=struct.unpack(">IIBB",h[:10])
    P=[d for t,d in ch if t==b'PLTE']; T=[d for t,d in ch if t==b'tRNS']
    print(name,"size",w,hh,"bd",bd,"ct",ct,"plte",len(P[0])//3 if P else 0,"trns",len(T[0]) if T else 0)
    if P:
        P=P[0]; tr=T[0] if T else b''
        print(" PAL"," ".join("%d:%02x%02x%02x/%d"%(i,P[3*i],P[3*i+1],P[3*i+2],tr[i] if i<len(tr) else 255) for i in range(len(P)//3)))
s,b=get("https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.png"); print("IEM",s,len(b)); 
if s==200: pal("IEM",b)
s,b=get("https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json"); print("IEMjson",s,b[:600])
s,b=get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"); x=json.loads(b)[0]
for xx,yy in [(14,6),(13,6),(14,5)]:
    s,b=get(f"https://www.jma.go.jp/bosai/jmatile/data/nowc/{x['basetime']}/none/{x['validtime']}/surf/hrpns/4/{xx}/{yy}.png")
    if s==200: pal(f"JMA{xx},{yy}",b)
