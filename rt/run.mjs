import fs from "fs";
const get=async(n,u)=>{for(let k=0;k<3;k++){try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length);if(r.ok)return}catch(e){console.log(n,"ERR",String(e))}await new Promise(r=>setTimeout(r,5000))}};
const bb="1000000,5700000,1900000,6400000";
await get("msgcap.xml","https://view.eumetsat.int/geoserver/msg_fes/wms?service=WMS&version=1.3.0&request=GetCapabilities");
await get("clm.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=msg_fes:clm&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("ctype.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_cloudtype&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("geo.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_geocolour&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("allcap.xml","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities");
