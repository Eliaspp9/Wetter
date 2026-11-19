import fs from "fs";
const get=async(n,u)=>{try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length)}catch(e){console.log(n,"ERR",String(e))}};
const t=new Date(Math.floor(Date.now()/3600000)*3600000+3600000).toISOString().slice(0,16);
await get("tcc.nc","https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km?parameters=tp,sf,tcc&output_format=netcdf&bbox=45.50,8.10,49.48,17.74&start="+t+"&end="+t);
const lst=["48.21,16.37","47.07,15.44","48.31,14.29"];
const r=await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.21,47.07,48.31&longitude=16.37,15.44,14.29&hourly=temperature_2m&past_hours=24&forecast_hours=72&timezone=GMT");const j=await r.json();console.log("om",r.status,Array.isArray(j),JSON.stringify(j).slice(0,200));
