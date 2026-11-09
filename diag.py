import urllib.request, json
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: return -1, str(e).encode()
B="https://previous-runs-api.open-meteo.com/v1/forecast?latitude=48.27,48.31&longitude=13.47,14.29&past_days=1&forecast_days=1&timezone=auto"
for nm,u in [
 ("multi", B+"&hourly=temperature_2m,temperature_2m_previous_day1,temperature_2m_previous_day3&models=icon_seamless,ecmwf_ifs025,gfs_seamless,ecmwf_aifs025_single"),
 ("multi2", B+"&hourly=temperature_2m_previous_day1&models=icon_seamless,ecmwf_ifs,gfs_seamless,ecmwf_aifs025_single"),
 ("ecvars", B+"&hourly=cloud_cover_low_previous_day1,relative_humidity_2m_previous_day1,wind_gusts_10m_previous_day1,temperature_850hPa_previous_day1,precipitation_probability_previous_day1&models=ecmwf_ifs"),
 ("bm_pp", B+"&hourly=precipitation_probability_previous_day1,cloud_cover_low_previous_day1,temperature_850hPa_previous_day1&models=best_match"),
]:
    s,b=get(u)
    try:
        j=json.loads(b); x=j[0] if isinstance(j,list) else j
        H=x.get("hourly",{}); ks=[k for k in H if k!="time"]
        print(nm,s,"keys",ks[:20]); 
        for k in ks[:12]:
            v=[a for a in H[k] if a is not None]; print("  ",k,len(H[k]),"nonnull",len(v), v[:3])
        if "error" in x or "reason" in x: print("  ",x)
    except Exception as e: print(nm,s,b[:300])
s,b=get("https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?parameters=RR,FF,FFX&station_ids=11010,11012&start=2026-11-09T18:00&end=2026-11-09T19:10")
print("tawes hist",s,b[:600])
s,b=get("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=TL,FF,FFX,RR,SO,GLOW&station_ids=11010")
print("tawes cur",s,b[:700])
