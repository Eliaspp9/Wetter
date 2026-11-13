import fs from "fs";
const r=await fetch("https://maps.dwd.de/geoserver/dwd/Icon-eu_reg00625_fd_sl_TOTPREC01H/wms?service=WMS&version=1.3.0&request=GetCapabilities");const t=await r.text();
const i=t.indexOf("<Name>Icon-eu_reg00625_fd_sl_TOTPREC01H</Name>");const b=t.slice(i,i+6000);
console.log((b.match(/<Dimension[^>]*>[^<]{0,400}/g)||[]).join("\n"));console.log((b.match(/<Style>[\s\S]*?<\/Style>/g)||[]).map(s=>s.replace(/\s+/g," ").slice(0,400)).join("\n"));
const u="https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.1.1&request=GetMap&layers=dwd:Icon-eu_reg00625_fd_sl_TOTPREC01H&styles=&format=image/png&transparent=true&srs=EPSG:3857&bbox=-1000000,4500000,3500000,8000000&width=512&height=400";
const g=await fetch(u);const buf=Buffer.from(await g.arrayBuffer());console.log("getmap",g.status,g.headers.get("content-type"),g.headers.get("access-control-allow-origin"),buf.length);fs.writeFileSync("gs3/dwdpr.png",buf);
const lg=await fetch("https://maps.dwd.de/geoserver/dwd/wms?request=GetLegendGraphic&format=application/json&layer=dwd:Icon-eu_reg00625_fd_sl_TOTPREC01H");console.log("legend",lg.status,(await lg.text()).slice(0,1500));
