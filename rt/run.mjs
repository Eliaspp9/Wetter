import fs from "fs";
const get=async(n,u)=>{for(let k=0;k<4;k++){try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length);if(r.ok)return}catch(e){console.log(n,"ERR",String(e))}await new Promise(r=>setTimeout(r,8000))}};
await get("nwpmeta.json","https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km/metadata");
const t=new Date(Math.floor(Date.now()/3600000)*3600000+3600000).toISOString().slice(0,16);
await get("tcc.nc","https://dataset.api.hub.geosphere.at/v1/grid/forecast/nwp-v2-1h-1km?parameters=tp,sf,tcc&output_format=netcdf&bbox=45.50,8.10,49.48,17.74&start="+t+"&end="+t);
