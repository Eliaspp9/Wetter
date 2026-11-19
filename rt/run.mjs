import fs from "fs";
const get=async(n,u)=>{try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length)}catch(e){console.log(n,"ERR",String(e))}};
const bb="1000000,5700000,1900000,6400000";
await get("irg.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:ir105_hrfi&styles=mtg_fd_ir105_hrfi_grayscale&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("irg2.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:ir105_hrfi&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("geo.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_geocolour&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
const r=await fetch("https://view.eumetsat.int/geoserver/mtg_fd/ir105_hrfi/wms?service=WMS&version=1.3.0&request=GetCapabilities");const t=await r.text();console.log("dim",(t.match(/<Dimension[^>]*>[^<]{0,200}/)||[""])[0]);
