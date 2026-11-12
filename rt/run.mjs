for(const u of ["https://static.avalanche.report/weather_stations/stations.geojson","https://www.data.gv.at/katalog/api/3/action/package_search?q=Lufttemperatur%20Echtzeit&rows=15","https://www.data.gv.at/katalog/api/3/action/package_search?q=Wetterstation%20Temperatur&rows=15"]){
 try{const t0=Date.now();const r=await fetch(u);const t=await r.text();console.log("==",u,r.status,t.length,Date.now()-t0+"ms");
  try{const j=JSON.parse(t);
   if(j.features){const f=j.features;const reg={};f.forEach(x=>{const p=x.properties||{};const k=(p["LWD-Region"]||p.region||"?").slice(0,5);reg[k]=(reg[k]||0)+1});console.log("n",f.length,JSON.stringify(reg).slice(0,300));console.log(JSON.stringify(f[0]).slice(0,700));const withT=f.filter(x=>x.properties&&x.properties.LT!=null).length;console.log("mit LT",withT,"date",f[0].properties&&f[0].properties.date)}
   else if(j.result){console.log(j.result.results.map(x=>x.title+" | "+(x.organization&&x.organization.title)).join("\n"))}
  }catch(e){console.log(t.slice(0,300))}
 }catch(e){console.log("ERR",u,String(e))}}
