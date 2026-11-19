import fs from "fs";
const get=async(n,u)=>{try{const r=await fetch(u);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync("gs3/"+n,b);console.log(n,r.status,r.headers.get("content-type"),b.length)}catch(e){console.log(n,"ERR",String(e))}};
const bb="1000000,5700000,1900000,6400000";
await get("ir.png","https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetMap&layers=dwd:Satellite_worldmosaic_3km_world_ir108_3h&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("rgb.png","https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetMap&layers=dwd:Satellite_meteosat_1km_euat_rgb_day_hrv_and_night_ir108_3h&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("ircap.xml","https://maps.dwd.de/geoserver/dwd/Satellite_worldmosaic_3km_world_ir108_3h/wms?service=WMS&version=1.3.0&request=GetCapabilities");
await get("ltg.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:li_afa&styles=&crs=EPSG:3857&bbox=-2000000,4000000,4000000,8000000&width=256&height=256&format=image/png&transparent=true");
await get("clm.png","https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:clm&styles=&crs=EPSG:3857&bbox="+bb+"&width=256&height=256&format=image/png&transparent=true");
await get("eucap.xml","https://view.eumetsat.int/geoserver/mtg_fd/wms?service=WMS&version=1.3.0&request=GetCapabilities");
