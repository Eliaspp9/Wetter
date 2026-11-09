import urllib.request, json, struct, zlib, base64, collections, re
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag"})
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: return -1, str(e).encode()
def chunks(b):
    i=8; out=[]
    while i < len(b):
        n=struct.unpack(">I",b[i:i+4])[0]; out.append((b[i+4:i+8],b[i+8:i+8+n])); i+=12+n
    return out
def decode(b):
    ch=chunks(b); h=[d for t,d in ch if t==b'IHDR'][0]; w,hh,bd,ct=struct.unpack(">IIBB",h[:10])
    plte=[d for t,d in ch if t==b'PLTE']; trns=[d for t,d in ch if t==b'tRNS']
    raw=zlib.decompress(b''.join(d for t,d in ch if t==b'IDAT'))
    bpp={2:3,6:4,3:1,0:1,4:2}[ct]
    if bd!=8: return w,hh,ct,bd,None,plte,trns
    st=w*bpp; out=bytearray(); prev=bytearray(st); p=0
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
    return w,hh,ct,bd,out,plte,trns
def colors(b, n=40):
    w,h,ct,bd,px,plte,trns=decode(b)
    if px is None: return f"ct{ct} bd{bd} (nicht dekodiert)"
    cnt=collections.Counter()
    if ct==3:
        pal=plte[0]; tr=trns[0] if trns else b''
        for v in px:
            a=tr[v] if v<len(tr) else 255
            if a: cnt["#%02x%02x%02x/%d/i%d"%(pal[3*v],pal[3*v+1],pal[3*v+2],a,v)]+=1
    elif ct==6:
        for k in range(0,len(px),4):
            if px[k+3]: cnt["#%02x%02x%02x/%d"%tuple(px[k:k+4])]+=1
    elif ct==2:
        for k in range(0,len(px),3): cnt["#%02x%02x%02x"%tuple(px[k:k+3])]+=1
    return f"ct{ct} n={sum(cnt.values())} distinct={len(cnt)} "+" ".join(f"{c}:{k}" for c,k in cnt.most_common(n))
print("== IEM")
for z,x,y in [(4,3,5),(4,4,6),(4,2,5)]:
    s,b=get(f"https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png")
    print(z,x,y,s,len(b)); 
    if s==200:
        ch=chunks(b); pl=[d for t,d in ch if t==b'PLTE']; tr=[d for t,d in ch if t==b'tRNS']
        print(" ",colors(b,30))
        if pl and (z,x,y)==(4,3,5):
            P=pl[0]; print("  PLTE",len(P)//3, "TRNS", len(tr[0]) if tr else 0)
            print("  PAL", " ".join("%d:%02x%02x%02x"%(i,P[3*i],P[3*i+1],P[3*i+2]) for i in range(len(P)//3)))
            if tr: print("  TR", list(tr[0]))
print("== FMI")
s,b=get("https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&version=1.1.1&request=GetStyles&layers=Radar:suomi_rr_eureffin")
t=b.decode("utf8","replace"); print(s,len(t)); print(" ", " ".join(re.findall(r"<(?:sld:)?ColorMapEntry[^>]*>",t))[:4000]); print("  type", re.findall(r'<(?:sld:)?ColorMap[^E][^>]*>',t))
print("== KNMI")
s,b=get("https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetLegendGraphic&version=1.3.0&layer=RAD_NL25_PCP_CM&style=precip-blue-transparent/nearest&format=image/png")
print(s,len(b)); print("B64KNMI", base64.b64encode(b).decode())
s,b=get("https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetStyles&version=1.1.1&layers=RAD_NL25_PCP_CM"); print("styles",s,b[:300])
print("== GEOMET")
for L in ["RADAR_1KM_RRAI","RADAR_1KM_RSNO"]:
    s,b=get(f"https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetLegendGraphic&layer={L}&format=image/png&sld_version=1.1.0")
    print(L,s,len(b)); print("B64"+L, base64.b64encode(b).decode())
    s,b=get(f"https://geo.weather.gc.ca/geomet?service=WMS&version=1.1.1&request=GetStyles&layers={L}")
    t=b.decode("utf8","replace"); print(" styles",s,len(t)); print("  ", " ".join(re.findall(r"<(?:se:|sld:)?(?:Literal|CssParameter|SvgParameter|Threshold|Value|Name)[^<]*</[^>]*>",t))[:3500])
print("== JMA")
s,b=get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json"); j=json.loads(b); x=j[0]
for z,xx,yy in [(4,14,6),(4,13,6),(4,14,5),(4,13,5),(4,12,6)]:
    s,b=get(f"https://www.jma.go.jp/bosai/jmatile/data/nowc/{x['basetime']}/none/{x['validtime']}/surf/hrpns/{z}/{xx}/{yy}.png")
    print(z,xx,yy,s,len(b), colors(b,20) if s==200 else "")
print("== UB")
s,b=get("https://www.rainviewer.com/files/rainviewer_api_colors_table.csv"); rows=[l.split(",") for l in b.decode().splitlines()[1:]]; half=len(rows)//2
for name,part in [("RAIN",rows[:half]),("SNOW",rows[half:])]: print(name," ".join(f"{r[0]}:{r[3]}" for r in part))
