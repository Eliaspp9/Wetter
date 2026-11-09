import urllib.request, json, datetime
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag", "Origin": "https://eliaspp9.github.io"})
    try:
        with urllib.request.urlopen(r, timeout=25) as x: return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
    except Exception as e: return -1, {}, str(e).encode()
now = datetime.datetime.utcnow()
def chmi():
    t = now - datetime.timedelta(minutes=15); t = t.replace(minute=t.minute - t.minute % 5, second=0)
    return "https://opendata.chmi.cz/meteorology/weather/radar/composite/maxz/png/pacz2gmaps3.z_max3d.%s.0.png" % t.strftime("%Y%m%d.%H%M")
def jma():
    s, h, b = get("https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json")
    j = json.loads(b); x = j[0]
    return "https://www.jma.go.jp/bosai/jmatile/data/nowc/%s/none/%s/surf/hrpns/6/56/25.png" % (x["basetime"], x["validtime"])
U = {
 "IEM": "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/5/8/12.png",
 "FMI": "https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&request=GetMap&version=1.3.0&layers=Radar:suomi_rr_eureffin&styles=&format=image/png&transparent=true&crs=EPSG:3857&bbox=2000000,8000000,4000000,11000000&width=256&height=256",
 "KNMI": "https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetMap&version=1.3.0&layers=RAD_NL25_PCP_CM&styles=precip-blue-transparent/nearest&format=image/png&transparent=true&crs=EPSG:3857&bbox=300000,6500000,800000,7100000&width=256&height=256",
 "GEOMET": "https://geo.weather.gc.ca/geomet?service=WMS&request=GetMap&version=1.3.0&layers=RADAR_1KM_RRAI&styles=&format=image/png&transparent=true&crs=EPSG:3857&bbox=-9000000,5000000,-7000000,7000000&width=256&height=256",
 "CHMI": chmi(),
 "JMA": jma(),
 "KNMI_legend": "https://geoservices.knmi.nl/adagucserver?dataset=RADAR&service=WMS&request=GetLegendGraphic&version=1.3.0&layer=RAD_NL25_PCP_CM&style=precip-blue-transparent/nearest&format=image/png",
 "FMI_styles": "https://openwms.fmi.fi/geoserver/Radar/wms?service=WMS&request=GetCapabilities&version=1.3.0",
 "GEOMET_styles": "https://geo.weather.gc.ca/geomet?service=WMS&request=GetCapabilities&version=1.3.0&layer=RADAR_1KM_RRAI",
}
for k, u in U.items():
    s, h, b = get(u)
    hl = {kk.lower(): v for kk, v in h.items()}
    print(k, s, "ACAO=", hl.get("access-control-allow-origin"), hl.get("content-type"), len(b))
    if k == "FMI_styles":
        t = b.decode("utf8", "replace"); i = t.find("suomi_rr_eureffin"); print("  ", t[i:i+1500].replace("\n", " ")[:1500])
    if k == "GEOMET_styles":
        t = b.decode("utf8", "replace"); i = t.find("<Name>RADAR_1KM_RRAI"); print("  ", t[i:i+2500].replace("\n", " ")[:2500])
