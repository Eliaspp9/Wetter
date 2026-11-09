import urllib.request, json
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "diag"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
B="https://previous-runs-api.open-meteo.com/v1/forecast?latitude=48.27&longitude=13.47&past_days=1&forecast_days=1&timezone=auto"
for nm,u in [
 ("ecvars", B+"&hourly=cloud_cover_low_previous_day1,relative_humidity_2m_previous_day1,wind_gusts_10m_previous_day1,cloud_cover_previous_day1,wind_speed_10m_previous_day1&models=ecmwf_ifs"),
 ("pp_bm", B+"&hourly=precipitation_probability_previous_day1&models=best_match"),
 ("pp_ec", B+"&hourly=precipitation_probability_previous_day1,precipitation_previous_day1&models=ecmwf_ifs"),
 ("pp_icon", B+"&hourly=precipitation_probability_previous_day1&models=icon_seamless"),
 ("fc_pp", "https://api.open-meteo.com/v1/forecast?latitude=48.27&longitude=13.47&forecast_days=1&hourly=precipitation_probability&models=ecmwf_ifs,best_match"),
]:
    s,b=get(u)
    try:
        j=json.loads(b); x=j[0] if isinstance(j,list) else j; H=x.get("hourly",{})
        print(nm,s,{k:(len([a for a in H[k] if a is not None]),[a for a in H[k] if a is not None][:4]) for k in H if k!="time"} if H else x)
    except Exception as e: print(nm,s,b[:300])
