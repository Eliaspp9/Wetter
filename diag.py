import urllib.request, json, struct, zlib, collections, math
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
def decode(b):
    ch=chunks(b); h=[d for t,d in ch if t==b'IHDR'][0]; w,hh,bd,ct=struct.unpack(">IIBB",h[:10])
    P=[d for t,d in ch if t==b'PLTE']; T=[d for t,d in ch if t==b'tRNS']
    raw=zlib.decompress(b''.join(d for t,d in ch if t==b'IDAT'))
    if ct==3:
        bits=bd; st=(w*bits+7)//8; bpp=1
    else:
        bpp={2:3,6:4,4:2,0:1}[ct]; st=w*bpp
    out=bytearray(); prev=bytearray(st); p=0
    for y in range(hh):
        f=raw[p]; p+=1; line=bytearray(raw[p:p+st]); p+=st
        for x in range(st):
            a=line[x-bpp] if x>=bpp else 0; b_=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b_)&255
            elif f==3: line[x]=(line[x]+((a+b_)>>1))&255
            elif f==4:
                pp=a+b_-c; pa=abs(pp-a); pb=abs(pp-b_); pc=abs(pp-c)
                line[x]=(line[x]+(a if pa<=pb and pa<=pc else (b_ if pb<=pc else c)))&255
        out+=line; prev=line
    px=[]
    if ct==3:
        pal=P[0]; tr=T[0] if T else b''
        for y in range(hh):
            row=out[y*st:(y+1)*st]
            for x in range(w):
                if bd==8: v=row[x]
                elif bd==4: v=(row[x>>1]>>(4*(1-(x&1))))&15
                else: v=0
                px.append((pal[3*v],pal[3*v+1],pal[3*v+2],tr[v] if v<len(tr) else 255))
    elif ct==6:
        for k in range(0,len(out),4): px.append(tuple(out[k:k+4]))
    elif ct==2:
        for k in range(0,len(out),3): px.append(tuple(out[k:k+3])+(255,))
    return px
PJ=json.load(open("pal.json"))
def parse(s): return [(float(x.split(":")[0]),)+tuple(int(x.split(":")[1][i:i+2],16) for i in (0,2,4)) for x in s.split(",")]
def ticks(s): return [tuple(map(float,x.split(":"))) for x in s.split(",")]
def posv(T,lg,p):
    if T is None: return p
    if p<=T[0][0]: return T[0][1]
    for i in range(1,len(T)):
        if p<=T[i][0]:
            a,b=T[i-1],T[i]; f=(p-a[0])/(b[0]-a[0])
            return math.exp(math.log(a[1])+(math.log(b[1])-math.log(a[1]))*f) if lg else a[1]+(b[1]-a[1])*f
    return T[-1][1]
def inv(P,T,lg,col):
    best=1e9; bp=0
    for i in range(len(P)-1):
        a,c=P[i],P[i+1]; d=[c[k]-a[k] for k in (1,2,3)]; L=sum(x*x for x in d)
        t=0 if L==0 else max(0,min(1,sum((col[k]-a[k+1])*d[k] for k in range(3))/L))
        e=sum((a[k+1]+d[k]*t-col[k])**2 for k in range(3))
        if e<best: best,bp=e,a[0]+(c[0]-a[0])*t
    return math.sqrt(best), posv(T,lg,bp)
FMI=[(0.07,0x6c,0xeb,0xf3),(0.14,0x58,0xc7,0x97),(0.34,0x40,0x98,0x57),(0.86,0xf1,0xf3,0x5a),(2.16,0xdf,0xc4,0x0a),(3.98,0xeb,0x95,0x1a),(10,0xe8,0x56,0x16),(25.13,0xce,0x02,0x02),(63.13,0x83,0x0a,0x46)]
CFG={
 "FI":("https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&request=GetMap&version=1.3.0&layers=Radar:suomi_rr_eureffin&styles=&format=image/png&transparent=true&crs=EPSG:3857&bbox=2000000,7700000,3600000,11100000&width=400&height=600",FMI,None,0),
 "NL":("https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetMap&version=1.3.0&layers=RAD_NL25_PCP_CM&styles=precip-blue-transparent/nearest&format=image/png&transparent=true&crs=EPSG:3857&bbox=200000,6450000,900000,7150000&width=500&height=500",parse(PJ["KNMI"]["p"]),ticks(PJ["KNMI"]["t"]),1),
 "CAr":("https://geo.weather.gc.ca/geomet?service=WMS&request=GetMap&version=1.3.0&layers=RADAR_1KM_RRAI&styles=&format=image/png&transparent=true&crs=EPSG:3857&bbox=-14000000,5000000,-5800000,9000000&width=800&height=400",parse(PJ["GR"]["p"]),ticks(PJ["GR"]["t"]),0),
 "CAs":("https://geo.weather.gc.ca/geomet?service=WMS&request=GetMap&version=1.3.0&layers=RADAR_1KM_RSNO&styles=&format=image/png&transparent=true&crs=EPSG:3857&bbox=-14000000,5000000,-5800000,9000000&width=800&height=400",parse(PJ["GS"]["p"]),ticks(PJ["GS"]["t"]),0),
}
for k,(u,P,T,lg) in CFG.items():
    s,b=get(u)
    if s!=200 or b[:4]!=b'\x89PNG': print(k,s,b[:200]); continue
    px=decode(b); cnt=collections.Counter(p for p in px if p[3]>0)
    alph=collections.Counter(p[3] for p in px if p[3]>0)
    print("==",k,"opaque px",sum(cnt.values()),"distinct",len(cnt),"alpha values",alph.most_common(6))
    bad=0; tot=0; ex=[]
    for c,n in cnt.most_common():
        if c[3]<90: continue
        d,v=inv(P,T,lg,c); tot+=n
        if d>24: bad+=n; ex.append((c,n,round(d)))
    print("  matched",tot-bad,"of",tot,"bad examples",ex[:12])
    print("  top", [("#%02x%02x%02x/%d"%c,n,round(inv(P,T,lg,c)[1],2),round(inv(P,T,lg,c)[0])) for c,n in cnt.most_common(14)])
