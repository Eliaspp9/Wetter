import urllib.request, json, struct, zlib, re, collections
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent":"diag"})
    with urllib.request.urlopen(r, timeout=25) as x: return x.read()
def decode(b):
    i=8; idat=b''; w=h=0
    while i < len(b):
        n=struct.unpack(">I",b[i:i+4])[0]; t=b[i+4:i+8]; d=b[i+8:i+8+n]
        if t==b'IHDR': w,h,bd,ct=struct.unpack(">IIBB",d[:10])
        if t==b'IDAT': idat+=d
        i+=12+n
    raw=zlib.decompress(idat); bpp=4; st=w*bpp; out=bytearray(); prev=bytearray(st); p=0
    for y in range(h):
        f=raw[p]; p+=1; line=bytearray(raw[p:p+st]); p+=st
        for x in range(st):
            a=line[x-bpp] if x>=bpp else 0; b_=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b_)&255
            elif f==3: line[x]=(line[x]+((a+b_)>>1))&255
            elif f==4:
                pp=a+b_-c; pa=abs(pp-a); pb=abs(pp-b_); pc=abs(pp-c)
                pr=a if pa<=pb and pa<=pc else (b_ if pb<=pc else c); line[x]=(line[x]+pr)&255
        out+=line; prev=line
    return w,h,out
html=get("https://www.rainviewer.com/api/color-schemes.html").decode()
m=re.search(r"colorData=JSON.parse\('(.*?)'\)",html,re.S)
cd=json.loads(m.group(1)); print("rows",len(cd),"cols",len(cd[0]))
print("UB", json.dumps([r for r in cd if r[1]!="#00000000" or r[2]!="#00000000"]))
csv=get("https://www.rainviewer.com/files/rainviewer_api_colors_table.csv").decode().splitlines()
print(csv[0]); 
ub={}
for line in csv[1:]:
    c=line.split(","); ub[int(c[0])]=c[3]
print("CSV UB 10..75:", {k:ub[k] for k in range(10,76,1)})
# LibreWXR tile colors vs table
j=json.loads(get("https://api.librewxr.net/public/weather-maps.json")); host=j["host"]
for fr in j["radar"]["past"][-1:]:
  for z,x,y in [(5,17,11),(4,8,5),(5,16,10),(4,9,5)]:
    w,h,px=decode(get(f"{host}{fr['path']}/256/{z}/{x}/{y}/2/1_1.png"))
    cnt=collections.Counter()
    for k in range(0,len(px),4):
        if px[k+3]: cnt["#%02x%02x%02x%02x"%tuple(px[k:k+4])]+=1
    print("lx",z,x,y,"n",sum(cnt.values()),"distinct",len(cnt)); print("  ",cnt.most_common(40))
    w,h,px=decode(get(f"{host}{fr['path']}/256/{z}/{x}/{y}/2/0_0.png")) if False else (0,0,b'')
rv=json.loads(get("https://api.rainviewer.com/public/weather-maps.json"))
for z,x,y in [(5,17,11),(4,8,5)]:
    w,h,px=decode(get(f"{rv['host']}{rv['radar']['past'][-1]['path']}/256/{z}/{x}/{y}/2/1_1.png"))
    cnt=collections.Counter()
    for k in range(0,len(px),4):
        if px[k+3]: cnt["#%02x%02x%02x%02x"%tuple(px[k:k+4])]+=1
    print("rv",z,x,y,"n",sum(cnt.values()),"distinct",len(cnt)); print("  ",cnt.most_common(40))
