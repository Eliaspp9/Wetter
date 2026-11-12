const out=[];const log=s=>{console.log(s);out.push(s)};
async function j(u){const t0=Date.now();try{const r=await fetch(u);const t=await r.text();return {s:r.status,ms:Date.now()-t0,t}}catch(e){return {s:0,ms:Date.now()-t0,t:String(e)}}}
const E="https://ensemble-api.open-meteo.com/v1/ensemble?latitude=48.25&longitude=13.42&hourly=precipitation&forecast_days=7&timezone=GMT&timeformat=unixtime&models=";
for(const m of ["dwd_icon_seamless_eps","icon_seamless","ecmwf_ifs025","ecmwf_ifs025_ensemble","ecmwf_ifs_eps","gfs_seamless","ncep_gefs_seamless","gfs025","ncep_gefs025","gem_global","gem_global_ensemble","dwd_icon_d2_eps","icon_d2","ecmwf_ifs_eps_europe","ukmo_global_ensemble_20km"]){
 const r=await j(E+m);let info=r.t.slice(0,160);
 try{const o=JSON.parse(r.t);if(o.hourly){const k=Object.keys(o.hourly);info="keys="+k.length+" first="+k.slice(0,3).join(",")+" last="+k[k.length-1]+" n="+o.hourly.time.length+" nonnull="+o.hourly[k[1]].filter(v=>v!=null).length}else info=r.t.slice(0,200)}catch(e){}
 log(m+" "+r.s+" "+r.ms+"ms "+info);
}
const r2=await j(E+"dwd_icon_seamless_eps,ecmwf_ifs025");try{const o=JSON.parse(r2.t);const k=Object.keys(o.hourly||{});log("multi "+r2.s+" keys="+k.length+" sample="+k.filter(x=>/member01/.test(x)).join(",")+" | "+k.slice(0,4).join(","))}catch(e){log("multi "+r2.t.slice(0,200))}
const r3=await j("https://aviationweather.gov/api/data/metar?format=json&hours=72&bbox=47.8,12.8,48.7,14.2");try{const a=JSON.parse(r3.t);log("metar "+r3.s+" n="+a.length+" ids="+[...new Set(a.map(x=>x.icaoId))].join(",")+" ex="+JSON.stringify(a[0]).slice(0,400))}catch(e){log("metar "+r3.s+" "+r3.t.slice(0,200))}
const r4=await j("https://api.open-meteo.com/v1/forecast?latitude=48.23,47.8&longitude=14.19,13.0&elevation=298,430&past_days=3&forecast_days=1&hourly=temperature_2m,wind_speed_10m,precipitation&models=geosphere_arome_austria,ecmwf_ifs,dwd_icon_d2_ruc_native&timezone=GMT&timeformat=unixtime");
try{const o=JSON.parse(r4.t);const a=Array.isArray(o)?o:[o];log("past "+r4.s+" locs="+a.length+" keys="+Object.keys(a[0].hourly).join(",")+" n="+a[0].hourly.time.length+" elev="+a[0].elevation+" nonnullT="+Object.entries(a[0].hourly).filter(([k])=>k.startsWith("temperature")).map(([k,v])=>k+":"+v.filter(x=>x!=null).length).join(" "))}catch(e){log("past "+r4.t.slice(0,300))}
