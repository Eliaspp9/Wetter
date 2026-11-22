import fs from "fs";
const get=async(n,u)=>{for(let k=0;k<3;k++){try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length);if(r.ok)return}catch(e){console.log(n,"ERR",String(e))}await new Promise(r=>setTimeout(r,5000))}};
await get("gs1.json","https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km?lat_lon=48.16,14.24&parameters=2t,tcc,sund,tp,sf,pt,snowlmt,sy&output_format=geojson");
const bb="1000000,5700000,1900000,6400000";
const t=new Date(Math.floor(Date.now()/900000)*900000-2*3600000).toISOString().slice(0,19)+"Z";
await get("clmt.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:clm&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true&time="+t);
const c=await (await fetch("https://view.eumetsat.int/geoserver/msg_fes/clm/wms?service=WMS&version=1.3.0&request=GetCapabilities")).text();console.log("dim",(c.match(/<Dimension[^>]*>[^<]{0,120}/)||[""])[0], c.length);console.log("end", c.slice(c.indexOf("<Dimension"),c.indexOf("</Dimension>")).slice(-80));
