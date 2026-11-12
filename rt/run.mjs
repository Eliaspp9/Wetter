const t0=Date.now();
try{const m=await (await fetch("https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km/metadata")).json();
console.log("meta ms",Date.now()-t0,"ref",m.last_forecast_reftime,"freq",m.frequency);
console.log("params",JSON.stringify((m.parameters||[]).map(p=>p.name+"|"+p.unit+"|"+(p.long_name||p.description||"").slice(0,40))));}catch(e){console.log("meta",String(e))}
const t1=Date.now();
try{const r=await fetch("https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km?lat_lon=48.1627,14.2419&parameters=t2m,tp,u10m,v10m,ugust,vgust,rh2m,tcc,sf&output_format=geojson");const t=await r.text();console.log("ts",r.status,Date.now()-t1,"ms",t.slice(0,600))}catch(e){console.log("ts",String(e))}
